import { IdUtil, OscTimebase, OscVoltageScale, CouplingMode, TriggerMode, CaptureMode, MathChannelOp, traceCaptureWave } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { WaveData, CursorMeasurement } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
interface SimSnapshot {
    voltages: Map<string, number>;
    currents: Map<string, number>;
}
interface HistoryEntry {
    time: number;
    voltages: Map<string, number>;
}
const DIVISIONS = 10;
const SAMPLE_POINTS = 1024;
function getTimebaseSec(timebase: OscTimebase): number {
    switch (timebase) {
        case OscTimebase.NS_10: return 10e-9;
        case OscTimebase.US_1: return 1e-6;
        case OscTimebase.US_100: return 100e-6;
        case OscTimebase.MS_1: return 1e-3;
        case OscTimebase.MS_10: return 10e-3;
        case OscTimebase.S_1: return 1;
        case OscTimebase.S_10: return 10;
        default: return 1e-6;
    }
}
function getVoltageScaleFactor(scale: OscVoltageScale): number {
    switch (scale) {
        case OscVoltageScale.MV_1: return 0.001;
        case OscVoltageScale.MV_50: return 0.05;
        case OscVoltageScale.MV_100: return 0.1;
        case OscVoltageScale.MV_200: return 0.2;
        case OscVoltageScale.MV_500: return 0.5;
        case OscVoltageScale.V_1: return 1;
        case OscVoltageScale.V_2: return 2;
        case OscVoltageScale.V_5: return 5;
        case OscVoltageScale.V_10: return 10;
        case OscVoltageScale.V_100: return 100;
        default: return 1;
    }
}
export class OscilloscopeEngine {
    private timebase: OscTimebase = OscTimebase.MS_1;
    private voltageScales: OscVoltageScale[] = [OscVoltageScale.V_1, OscVoltageScale.V_1];
    private coupling: CouplingMode[] = [CouplingMode.DC, CouplingMode.DC];
    private triggerMode: TriggerMode = TriggerMode.EDGE;
    private triggerLevel: number = 2.0;
    private triggerChannel: number = 0;
    private captureMode: CaptureMode = CaptureMode.ROLL;
    private mathOp: MathChannelOp = MathChannelOp.ADD;
    private fftLogScale: boolean = false;
    private simulationWaveCache: WaveData[] = [];
    private simDataAge: number = 0;
    private lastNodeVoltages: Map<string, number> = new Map();
    private lastBranchCurrents: Map<string, number> = new Map();
    // Probe name → channel index mapping
    private channelProbes: string[] = ['', '', '', ''];
    // Historical voltage snapshots for time-domain display
    private historyBuffer: HistoryEntry[] = [];
    /** Keep ≥20ms @ 1µs/step so 1kHz has many full cycles in the ring */
    private historyMaxSize: number = 20000;
    private lastSimTime: number = 0;
    feedSimulationWaves(waves: WaveData[]): void {
        this.simulationWaveCache = waves.slice();
        this.simDataAge++;
    }
    feedNodeVoltages(voltages: Map<string, number>): void {
        this.lastNodeVoltages = new Map(voltages);
    }
    feedBranchCurrents(currents: Map<string, number>): void {
        this.lastBranchCurrents = new Map(currents);
    }
    /** Feed a time snapshot for building time-domain waveforms */
    feedTimeSnapshot(time: number, voltages: Map<string, number>): void {
        // Skip stagnant time — otherwise a frozen scheduler fills the ring with flat points
        // and the UI looks dead while stepCount still advances.
        if (this.historyBuffer.length > 0) {
            const last = this.historyBuffer[this.historyBuffer.length - 1];
            if (Math.abs(time - last.time) < 1e-15) {
                return;
            }
        }
        this.lastSimTime = time;
        // Slim store: only probed nets (full map × 20k steps would thrash memory)
        const slim = new Map<string, number>();
        for (let c = 0; c < this.channelProbes.length; c++) {
            const p = this.channelProbes[c];
            if (p.length > 0) {
                const v = voltages.get(p);
                if (v !== undefined) {
                    slim.set(p, v);
                }
            }
        }
        if (slim.size === 0) {
            let kept = 0;
            voltages.forEach((v: number, name: string) => {
                if (kept >= 6) {
                    return;
                }
                if (name === '0' || name === 'GND' || name === 'VCC') {
                    return;
                }
                slim.set(name, v);
                kept++;
            });
        }
        if (slim.size === 0) {
            return;
        }
        const entry: HistoryEntry = { time: time, voltages: slim };
        this.historyBuffer.push(entry);
        if (this.historyBuffer.length > this.historyMaxSize) {
            this.historyBuffer.shift();
        }
    }
    /**
     * Interactive DC circuit edit: rewrite probe voltages in the history ring so
     * CH traces jump to the new levels instead of lagging behind old samples.
     */
    snapDcProbeLevels(voltages: Map<string, number>): void {
        if (voltages.size === 0) {
            return;
        }
        this.lastNodeVoltages = new Map(voltages);
        for (let i = 0; i < this.historyBuffer.length; i++) {
            const snap = this.historyBuffer[i];
            for (let c = 0; c < this.channelProbes.length; c++) {
                const p = this.channelProbes[c];
                if (p.length === 0) {
                    continue;
                }
                const v = voltages.get(p);
                if (v !== undefined) {
                    snap.voltages.set(p, v);
                }
            }
            // Also refresh any already-stored keys present in the live map
            snap.voltages.forEach((_old: number, name: string) => {
                const v = voltages.get(name);
                if (v !== undefined) {
                    snap.voltages.set(name, v);
                }
            });
        }
        // Rewrite wave cache so captureWave does not prefer stale pre-pot samples
        for (let i = 0; i < this.simulationWaveCache.length; i++) {
            const w = this.simulationWaveCache[i];
            let newV: number | undefined = undefined;
            if (w.netName.length > 0) {
                newV = voltages.get(w.netName);
            }
            if (newV === undefined && w.probeName.length > 0) {
                newV = voltages.get(w.probeName);
            }
            if (newV === undefined && i < this.channelProbes.length) {
                const p = this.channelProbes[i];
                if (p.length > 0) {
                    newV = voltages.get(p);
                }
            }
            if (newV !== undefined && w.voltageAxis.length > 0) {
                for (let j = 0; j < w.voltageAxis.length; j++) {
                    w.voltageAxis[j] = newV as number;
                }
            }
        }
        // Ensure at least one sample exists for UI readout
        if (this.historyBuffer.length === 0) {
            this.feedTimeSnapshot(this.lastSimTime + 1e-6, voltages);
        }
    }
    /**
     * Estimate frequency from the live history ring (works when kernel WaveData is flat/stale).
     */
    estimateFrequency(probeName: string): number {
        if (probeName.length === 0 || this.historyBuffer.length < 8) {
            return 0;
        }
        const times: number[] = [];
        const values: number[] = [];
        for (let i = 0; i < this.historyBuffer.length; i++) {
            const snap = this.historyBuffer[i];
            times.push(snap.time);
            values.push(this.resolveVoltage(probeName, snap.voltages));
        }
        let maxV = values[0];
        let minV = values[0];
        for (let k = 1; k < values.length; k++) {
            if (values[k] > maxV) {
                maxV = values[k];
            }
            if (values[k] < minV) {
                minV = values[k];
            }
        }
        if (maxV - minV < 1e-4) {
            return 0;
        }
        const threshold = (maxV + minV) / 2;
        let crossings = 0;
        let firstCross = -1;
        let lastCross = -1;
        for (let i = 1; i < values.length; i++) {
            const up = values[i - 1] < threshold && values[i] >= threshold;
            if (up) {
                if (firstCross < 0) {
                    firstCross = times[i];
                }
                lastCross = times[i];
                crossings++;
            }
        }
        if (crossings < 2 || firstCross < 0 || lastCross <= firstCross) {
            return 0;
        }
        const period = (lastCross - firstCross) / (crossings - 1);
        return period > 0 ? 1.0 / period : 0;
    }
    getSimulationSnapshot(): SimSnapshot {
        return {
            voltages: new Map(this.lastNodeVoltages),
            currents: new Map(this.lastBranchCurrents)
        };
    }
    setTimebase(timebase: OscTimebase): void { this.timebase = timebase; }
    setVoltageScale(channel: number, scale: OscVoltageScale): void {
        while (this.voltageScales.length <= channel)
            this.voltageScales.push(OscVoltageScale.V_1);
        this.voltageScales[channel] = scale;
    }
    setCoupling(channel: number, mode: CouplingMode): void {
        while (this.coupling.length <= channel)
            this.coupling.push(CouplingMode.DC);
        this.coupling[channel] = mode;
    }
    setTrigger(mode: TriggerMode, level: number, channel: number): void {
        this.triggerMode = mode;
        this.triggerLevel = level;
        this.triggerChannel = channel;
    }
    setCaptureMode(mode: CaptureMode): void { this.captureMode = mode; }
    setMathChannel(op: MathChannelOp, logScale: boolean = false): void {
        this.mathOp = op;
        this.fftLogScale = logScale;
    }
    /** Map a probe/net name to an oscilloscope channel (0-3) */
    setChannelProbe(channel: number, probeName: string): void {
        while (this.channelProbes.length <= channel)
            this.channelProbes.push('');
        this.channelProbes[channel] = probeName;
    }
    /** Auto-assign simulation probes to channels based on active wave data */
    autoAssignProbes(): void {
        for (let i = 0; i < Math.min(4, this.simulationWaveCache.length); i++) {
            if (i < this.channelProbes.length && this.channelProbes[i].length > 0) {
                continue;
            }
            const wave = this.simulationWaveCache[i];
            if (wave && wave.voltageAxis.length > 0) {
                while (this.channelProbes.length <= i) {
                    this.channelProbes.push('');
                }
                this.channelProbes[i] = wave.probeName.length > 0 ? wave.probeName : wave.netName;
            }
        }
        // Fallback: assign from node voltage map for empty channels only
        let ch = 0;
        this.lastNodeVoltages.forEach((_v: number, name: string) => {
            if (ch >= 4) {
                return;
            }
            while (ch < 4 && ch < this.channelProbes.length && this.channelProbes[ch].length > 0) {
                ch++;
            }
            if (ch < 4 && name !== '0' && name !== 'GND' && name !== 'VCC') {
                while (this.channelProbes.length <= ch) {
                    this.channelProbes.push('');
                }
                this.channelProbes[ch] = name;
                ch++;
            }
        });
    }
    getTimebase(): OscTimebase { return this.timebase; }
    getVoltageScales(): OscVoltageScale[] { return this.voltageScales.slice(); }
    getCoupling(): CouplingMode[] { return this.coupling.slice(); }
    getTriggerMode(): TriggerMode { return this.triggerMode; }
    getTriggerLevel(): number { return this.triggerLevel; }
    getTriggerChannel(): number { return this.triggerChannel; }
    getCaptureMode(): CaptureMode { return this.captureMode; }
    getMathOp(): MathChannelOp { return this.mathOp; }
    getFftLogScale(): boolean { return this.fftLogScale; }
    /** Capture waveform from real simulation data — 按时基截窗 + 触发对齐，避免整段缓冲叠屏变乱 */
    captureWave(channel: number = 0): WaveData {
        const probeName = channel < this.channelProbes.length ? this.channelProbes[channel] : '';
        let raw: WaveData | undefined = undefined;
        let source = 'flatDC';
        // Prefer history ring: uniform wall-clock stamps, fewer Newton one-sample glitches
        if (probeName.length > 0 && this.historyBuffer.length > 8) {
            const histWave = this.buildWaveFromHistory(probeName, channel);
            if (this.hasMeaningfulWave(histWave) && histWave.voltageAxis.length >= 16) {
                raw = histWave;
                source = 'history';
            }
        }
        if (raw === undefined && probeName.length > 0) {
            const matched = this.findCachedWave(probeName);
            if (matched !== undefined && matched.voltageAxis.length > 0) {
                raw = matched;
                source = 'waveCache';
            }
        }
        if (raw === undefined && this.simulationWaveCache.length > channel) {
            const ext = this.simulationWaveCache[channel];
            if (ext && ext.voltageAxis.length > 0) {
                raw = ext;
                source = 'cacheByIndex';
            }
        }
        if (raw === undefined) {
            const anyWave = this.findAnySignalWave();
            if (anyWave !== undefined) {
                raw = anyWave;
                source = 'anySignal';
            }
        }
        if (raw === undefined && this.historyBuffer.length > 1) {
            raw = this.buildWaveFromAnyHistoryKey(channel);
            source = 'historyAny';
        }
        if (raw === undefined) {
            raw = this.makeFlatWave(channel);
            source = 'flatDC';
        }
        const display = this.prepareDisplayWave(raw, channel);
        const lastV = display.voltageAxis.length > 0
            ? display.voltageAxis[display.voltageAxis.length - 1] : 0;
        traceCaptureWave(channel, probeName, source, display.voltageAxis.length, lastV);
        return display;
    }
    /**
     * 按时基截窗 + 均匀重采样。
     * 关键：绝不要把「不足 1 周期」的短片段横向拉满（会变成锯齿斜坡）。
     * 有足够数据时锁定 ≥2 个完整周期并边沿触发对齐。
     */
    private prepareDisplayWave(src: WaveData, channel: number): WaveData {
        const n = Math.min(src.timeAxis.length, src.voltageAxis.length);
        if (n < 2) {
            return this.makeFlatWave(channel);
        }
        const times = src.timeAxis;
        const volts = src.voltageAxis;
        const divSec = getTimebaseSec(this.timebase);
        const userWindow = Math.max(divSec * DIVISIONS, 1e-12);
        const tEnd = times[n - 1];
        const tStartAll = times[0];
        const availableSpan = Math.max(tEnd - tStartAll, 1e-12);
        const estFreq = OscilloscopeEngine.estimateFreqLocal(times, volts, 0, n);
        let windowSec = Math.min(userWindow, availableSpan);
        if (estFreq > 5 && estFreq < 5e6) {
            const onePeriod = 1.0 / estFreq;
            const twoPeriods = 2.2 * onePeriod;
            const fourPeriods = 4.0 * onePeriod;
            if (availableSpan >= twoPeriods) {
                // Always ≥2 cycles; timebase may widen up to 4 cycles
                windowSec = Math.min(availableSpan, Math.max(twoPeriods, Math.min(userWindow, fourPeriods)));
            }
            else if (availableSpan >= onePeriod) {
                windowSec = availableSpan;
            }
            else {
                windowSec = availableSpan;
            }
        }
        // Edge-lock whenever ≥1 period is available — stabilizes a complete cycle on screen
        const canTrigger = estFreq > 5 && availableSpan >= (1.0 / estFreq) * 0.95;
        const lockEdge = canTrigger && this.triggerMode !== TriggerMode.LEVEL;
        let tWinStart: number;
        if (lockEdge) {
            let level = this.triggerLevel;
            let scanMin = volts[0];
            let scanMax = volts[0];
            let scanSum = 0;
            for (let i = 0; i < n; i++) {
                const v = volts[i];
                if (v < scanMin) {
                    scanMin = v;
                }
                if (v > scanMax) {
                    scanMax = v;
                }
                scanSum += v;
            }
            const mid = scanSum / n;
            if (level < scanMin || level > scanMax || (scanMax - scanMin) < 1e-6) {
                level = mid;
            }
            // Prefer last rising edge that still leaves a full window ahead
            let trigIdx = -1;
            const needAhead = windowSec * 0.85;
            for (let i = 1; i < n; i++) {
                if (volts[i - 1] < level && volts[i] >= level) {
                    if (tEnd - times[i] >= needAhead) {
                        trigIdx = i;
                    }
                }
            }
            if (trigIdx < 0) {
                // Fallback: any rising edge in the last 3 windows
                const searchFrom = tEnd - windowSec * 3;
                for (let i = 1; i < n; i++) {
                    if (times[i] < searchFrom) {
                        continue;
                    }
                    if (volts[i - 1] < level && volts[i] >= level) {
                        trigIdx = i;
                    }
                }
            }
            if (trigIdx >= 0) {
                tWinStart = times[trigIdx];
            }
            else {
                tWinStart = tEnd - windowSec;
            }
        }
        else {
            tWinStart = tEnd - windowSec;
        }
        if (tWinStart < tStartAll) {
            tWinStart = tStartAll;
        }
        let tWinEnd = tWinStart + windowSec;
        if (tWinEnd > tEnd) {
            tWinEnd = tEnd;
            tWinStart = Math.max(tStartAll, tWinEnd - windowSec);
        }
        // Actual window must match real samples — do not invent time
        const realSpan = Math.max(tWinEnd - tWinStart, 1e-15);
        windowSec = realSpan;
        const winT: number[] = [];
        const winV: number[] = [];
        for (let i = 0; i < n; i++) {
            const t = times[i];
            if (t < tWinStart) {
                continue;
            }
            if (t > tWinEnd) {
                break;
            }
            winT.push(t);
            winV.push(volts[i]);
        }
        let useT = winT;
        let useV = winV;
        if (winT.length < 4) {
            // Take the newest chunk of equal length in samples
            const take = Math.min(n, Math.max(64, Math.floor(n * 0.5)));
            useT = times.slice(n - take);
            useV = volts.slice(n - take);
            windowSec = Math.max(useT[useT.length - 1] - useT[0], 1e-15);
        }
        if (useT.length < 2) {
            return this.makeFlatWave(channel);
        }
        const coup = channel < this.coupling.length ? this.coupling[channel] : CouplingMode.DC;
        if (coup === CouplingMode.AC) {
            let sum = 0;
            for (let i = 0; i < useV.length; i++) {
                sum += useV[i];
            }
            const mean = sum / useV.length;
            for (let i = 0; i < useV.length; i++) {
                useV[i] = useV[i] - mean;
            }
        }
        else if (coup === CouplingMode.GND) {
            for (let i = 0; i < useV.length; i++) {
                useV[i] = 0;
            }
        }
        return this.resampleWave(useT, useV, channel, windowSec);
    }
    private cloneWaveForChannel(src: WaveData, channel: number): WaveData {
        return this.prepareDisplayWave(src, channel);
    }
    private findCachedWave(probeName: string): WaveData | undefined {
        for (let i = 0; i < this.simulationWaveCache.length; i++) {
            const w = this.simulationWaveCache[i];
            if (this.waveMatchesProbe(w, probeName)) {
                return w;
            }
        }
        return undefined;
    }
    private waveMatchesProbe(wave: WaveData, probeName: string): boolean {
        if (probeName.length === 0) {
            return false;
        }
        return wave.probeName === probeName || wave.netName === probeName;
    }
    private findAnySignalWave(): WaveData | undefined {
        for (let i = 0; i < this.simulationWaveCache.length; i++) {
            const w = this.simulationWaveCache[i];
            if (w.voltageAxis.length < 2) {
                continue;
            }
            const upperProbe = w.probeName.toUpperCase();
            const upperNet = w.netName.toUpperCase();
            if (upperProbe === '0' || upperProbe === 'GND' || upperProbe === 'VCC' ||
                upperNet === '0' || upperNet === 'GND' || upperNet === 'VCC') {
                continue;
            }
            let minV = w.voltageAxis[0];
            let maxV = w.voltageAxis[0];
            for (let j = 1; j < w.voltageAxis.length; j++) {
                if (w.voltageAxis[j] < minV)
                    minV = w.voltageAxis[j];
                if (w.voltageAxis[j] > maxV)
                    maxV = w.voltageAxis[j];
            }
            if (maxV - minV > 1e-9 || Math.abs(maxV) > 1e-9) {
                return w;
            }
        }
        return undefined;
    }
    private hasMeaningfulWave(wave: WaveData): boolean {
        if (wave.voltageAxis.length < 2) {
            return false;
        }
        let minV = wave.voltageAxis[0];
        let maxV = wave.voltageAxis[0];
        for (let i = 1; i < wave.voltageAxis.length; i++) {
            if (wave.voltageAxis[i] < minV)
                minV = wave.voltageAxis[i];
            if (wave.voltageAxis[i] > maxV)
                maxV = wave.voltageAxis[i];
        }
        return maxV - minV > 1e-12 || Math.abs(maxV) > 1e-12;
    }
    /** Resolve voltage for a probe key (net UUID or SPICE node name) */
    private resolveVoltage(probeName: string, voltages: Map<string, number>): number {
        if (probeName.length === 0) {
            return 0;
        }
        const direct = voltages.get(probeName);
        if (direct !== undefined) {
            return direct;
        }
        return 0;
    }
    /** Build time-domain waveform from history buffer for a specific probe */
    private buildWaveFromHistory(probeName: string, channel: number): WaveData {
        const timeAxis: number[] = [];
        const voltageAxis: number[] = [];
        // Export the full ring — prepareDisplayWave chooses a ≥1–2 period window
        let hasLast = false;
        let lastGood = 0;
        for (const snap of this.historyBuffer) {
            if (snap.voltages.has(probeName)) {
                lastGood = snap.voltages.get(probeName) as number;
                hasLast = true;
                timeAxis.push(snap.time);
                voltageAxis.push(lastGood);
            }
            else if (hasLast) {
                timeAxis.push(snap.time);
                voltageAxis.push(lastGood);
            }
        }
        if (timeAxis.length < 2) {
            return this.makeFlatWave(channel);
        }
        const span = Math.max(timeAxis[timeAxis.length - 1] - timeAxis[0], 1e-15);
        return {
            waveId: IdUtil.generate('osc'),
            probeName: `CH${channel + 1}`,
            netName: probeName,
            timeAxis: timeAxis,
            voltageAxis: voltageAxis,
            currentAxis: new Array(timeAxis.length).fill(0),
            sampleRate: timeAxis.length / span,
            waveType: 'voltage',
            holdTime: span
        };
    }
    /** Build waveform from any available key in history */
    private buildWaveFromAnyHistoryKey(channel: number): WaveData {
        // Find a non-ground, non-vcc voltage key
        let probeName = '';
        const snap = this.historyBuffer[this.historyBuffer.length - 1];
        snap.voltages.forEach((_v: number, name: string) => {
            if (probeName.length === 0 && name !== '0' && name !== 'GND' && name !== 'VCC') {
                probeName = name;
            }
        });
        if (probeName.length === 0) {
            return this.makeFlatWave(channel);
        }
        this.channelProbes[channel] = probeName;
        return this.buildWaveFromHistory(probeName, channel);
    }
    /** Build flat (DC-level) waveform from current node voltage state */
    private makeFlatWave(channel: number): WaveData {
        const dt = getTimebaseSec(this.timebase);
        const windowSec = dt * DIVISIONS;
        const sampleRate = SAMPLE_POINTS / windowSec;
        const timeAxis: number[] = [];
        const voltageAxis: number[] = [];
        const probeName = channel < this.channelProbes.length ? this.channelProbes[channel] : '';
        // Use actual DC voltage from simulation if available
        let dcLevel = 0;
        if (probeName.length > 0) {
            dcLevel = this.resolveVoltage(probeName, this.lastNodeVoltages);
            if (Math.abs(dcLevel) < 1e-12) {
                const cached = this.findCachedWave(probeName);
                if (cached !== undefined && cached.voltageAxis.length > 0) {
                    dcLevel = cached.voltageAxis[cached.voltageAxis.length - 1];
                }
            }
        }
        if (Math.abs(dcLevel) < 1e-12) {
            const anyWave = this.findAnySignalWave();
            if (anyWave !== undefined && anyWave.voltageAxis.length > 0) {
                dcLevel = anyWave.voltageAxis[anyWave.voltageAxis.length - 1];
            }
        }
        // Try VCC for ch0 if nothing else
        if (Math.abs(dcLevel) < 1e-12 && channel === 0) {
            dcLevel = this.lastNodeVoltages.get('VCC') ?? this.lastNodeVoltages.get('VCC_5V') ?? 0;
        }
        for (let i = 0; i < SAMPLE_POINTS; i++) {
            timeAxis.push((i / SAMPLE_POINTS) * windowSec);
            voltageAxis.push(dcLevel);
        }
        return {
            waveId: IdUtil.generate('osc'),
            probeName: `CH${channel + 1}`,
            netName: probeName.length > 0 ? probeName : `OSC_CH${channel + 1}`,
            timeAxis,
            voltageAxis,
            currentAxis: new Array(SAMPLE_POINTS).fill(0),
            sampleRate,
            waveType: 'voltage',
            holdTime: windowSec
        };
    }
    /** Resample + despike + smooth — span always equals real sample span (never stretch). */
    private resampleWave(timeAxis: number[], voltageAxis: number[], channel: number, windowSec: number): WaveData {
        const cleaned = OscilloscopeEngine.despikeSeries(voltageAxis);
        const t0 = timeAxis[0];
        const tLast = timeAxis[timeAxis.length - 1];
        const dataSpan = Math.max(tLast - t0, 1e-15);
        // Honest time axis: never map a short fragment onto a longer windowSec
        const span = Math.min(Math.max(windowSec, 1e-15), dataSpan);
        const sampleRate = SAMPLE_POINTS / span;
        const outTime: number[] = [];
        const rawOut: number[] = [];
        const n = timeAxis.length;
        let j = 1;
        for (let i = 0; i < SAMPLE_POINTS; i++) {
            const fracI = SAMPLE_POINTS > 1 ? i / (SAMPLE_POINTS - 1) : 0;
            const tAbs = t0 + fracI * span;
            outTime.push(fracI * span);
            let vi = cleaned[0];
            if (tAbs <= timeAxis[0]) {
                vi = cleaned[0];
            }
            else if (tAbs >= timeAxis[n - 1]) {
                vi = cleaned[n - 1];
            }
            else {
                while (j < n && timeAxis[j] < tAbs) {
                    j++;
                }
                if (j >= n) {
                    vi = cleaned[n - 1];
                }
                else if (j === 1) {
                    const dtr = Math.max(timeAxis[1] - timeAxis[0], 1e-15);
                    const frac = (tAbs - timeAxis[0]) / dtr;
                    vi = OscilloscopeEngine.hermiteInterp(cleaned[0], cleaned[0], cleaned[1], cleaned[Math.min(2, n - 1)], frac);
                }
                else {
                    const jm = j - 1;
                    const dtr = Math.max(timeAxis[j] - timeAxis[jm], 1e-15);
                    const frac = (tAbs - timeAxis[jm]) / dtr;
                    const y0 = cleaned[Math.max(0, jm - 1)];
                    const y1 = cleaned[jm];
                    const y2 = cleaned[j];
                    const y3 = cleaned[Math.min(n - 1, j + 1)];
                    vi = OscilloscopeEngine.hermiteInterp(y0, y1, y2, y3, frac);
                }
            }
            rawOut.push(vi);
        }
        const outVoltage = OscilloscopeEngine.smoothSeries(rawOut, 9);
        return {
            waveId: IdUtil.generate('osc'),
            probeName: `CH${channel + 1}`,
            netName: this.channelProbes[channel] ?? `OSC_CH${channel + 1}`,
            timeAxis: outTime,
            voltageAxis: outVoltage,
            currentAxis: new Array(SAMPLE_POINTS).fill(0),
            sampleRate,
            waveType: 'voltage',
            holdTime: span
        };
    }
    /** Catmull-Rom (uniform) between y1→y2, frac in [0,1] */
    private static hermiteInterp(y0: number, y1: number, y2: number, y3: number, frac: number): number {
        const t = Math.max(0, Math.min(1, frac));
        const t2 = t * t;
        const t3 = t2 * t;
        return 0.5 * ((2 * y1) + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 +
            (-y0 + 3 * y1 - 3 * y2 + y3) * t3);
    }
    /** 3-point median despike — kills single-sample Newton/glitch spikes */
    private static despikeSeries(src: number[]): number[] {
        const n = src.length;
        if (n < 3) {
            return src.slice();
        }
        let lo = src[0];
        let hi = src[0];
        for (let i = 1; i < n; i++) {
            if (src[i] < lo) {
                lo = src[i];
            }
            if (src[i] > hi) {
                hi = src[i];
            }
        }
        const span = Math.max(hi - lo, 1e-6);
        const thr = span * 0.35;
        const out = src.slice();
        for (let i = 1; i < n - 1; i++) {
            const a = src[i - 1];
            const b = src[i];
            const c = src[i + 1];
            const med = OscilloscopeEngine.median3(a, b, c);
            if (Math.abs(b - med) > thr && Math.abs(b - a) > thr && Math.abs(b - c) > thr) {
                out[i] = med;
            }
        }
        return out;
    }
    private static median3(a: number, b: number, c: number): number {
        if (a > b) {
            const t = a;
            a = b;
            b = t;
        }
        if (b > c) {
            const t = b;
            b = c;
            c = t;
        }
        if (a > b) {
            const t = a;
            a = b;
            b = t;
        }
        return b;
    }
    /** Hann-window moving average (odd tap count) */
    private static smoothSeries(src: number[], taps: number): number[] {
        const n = src.length;
        if (n < 3) {
            return src.slice();
        }
        let k = taps | 1;
        if (k < 3) {
            k = 3;
        }
        if (k > n) {
            k = (n % 2 === 1) ? n : n - 1;
        }
        if (k < 3) {
            return src.slice();
        }
        const half = Math.floor(k / 2);
        const weights: number[] = [];
        let wSum = 0;
        for (let i = 0; i < k; i++) {
            const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (k - 1));
            weights.push(w);
            wSum += w;
        }
        const out: number[] = new Array(n);
        for (let i = 0; i < n; i++) {
            let acc = 0;
            let ww = 0;
            for (let t = -half; t <= half; t++) {
                const idx = i + t;
                if (idx < 0 || idx >= n) {
                    continue;
                }
                const w = weights[t + half];
                acc += src[idx] * w;
                ww += w;
            }
            out[i] = ww > 0 ? acc / ww : src[i];
        }
        return out;
    }
    private static estimateFreqLocal(times: number[], volts: number[], fromIdx: number, toIdx: number): number {
        const start = Math.max(0, fromIdx);
        const end = Math.min(volts.length, toIdx);
        if (end - start < 8) {
            return 0;
        }
        let minV = volts[start];
        let maxV = volts[start];
        for (let i = start + 1; i < end; i++) {
            if (volts[i] < minV) {
                minV = volts[i];
            }
            if (volts[i] > maxV) {
                maxV = volts[i];
            }
        }
        if (maxV - minV < 1e-4) {
            return 0;
        }
        const thr = (maxV + minV) / 2;
        let crossings = 0;
        let first = -1;
        let last = -1;
        for (let i = start + 1; i < end; i++) {
            if (volts[i - 1] < thr && volts[i] >= thr) {
                if (first < 0) {
                    first = times[i];
                }
                last = times[i];
                crossings++;
            }
        }
        if (crossings < 2 || first < 0 || last <= first) {
            return 0;
        }
        const period = (last - first) / (crossings - 1);
        return period > 0 ? 1.0 / period : 0;
    }
    /** Sample a specific simulation probe by name */
    captureProbe(probeName: string): WaveData | null {
        const wave = this.findCachedWave(probeName);
        if (!wave)
            return null;
        return {
            waveId: wave.waveId,
            probeName: wave.probeName,
            netName: wave.netName,
            timeAxis: wave.timeAxis.slice(),
            voltageAxis: wave.voltageAxis.slice(),
            currentAxis: wave.currentAxis.slice(),
            sampleRate: wave.sampleRate,
            waveType: wave.waveType,
            holdTime: wave.holdTime
        };
    }
    /** List all available probe names from simulation data */
    listProbes(): string[] {
        return this.simulationWaveCache.map(w => w.probeName);
    }
    measureCursors(cursorA: number, cursorB: number): CursorMeasurement {
        const wave = this.captureWave(0);
        const len = wave.voltageAxis.length;
        if (len === 0) {
            return { deltaTime: 0, deltaVoltage: 0, peakToPeak: 0, rms: 0,
                dutyCycle: 0, riseTime: 0, frequency: 0 };
        }
        const idxA = Math.max(0, Math.min(cursorA, len - 1));
        const idxB = Math.max(0, Math.min(cursorB, len - 1));
        const vA = wave.voltageAxis[idxA];
        const vB = wave.voltageAxis[idxB];
        const tA = wave.timeAxis[idxA];
        const tB = wave.timeAxis[idxB];
        const deltaTime = Math.abs(tB - tA);
        const deltaVoltage = Math.abs(vB - vA);
        let minV = wave.voltageAxis[0];
        let maxV = wave.voltageAxis[0];
        let sumSq = 0;
        for (let i = 0; i < len; i++) {
            const v = wave.voltageAxis[i];
            if (v < minV)
                minV = v;
            if (v > maxV)
                maxV = v;
            sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / len);
        let freq = 0;
        let crossings = 0;
        let firstCross = -1;
        for (let i = 1; i < len; i++) {
            if (wave.voltageAxis[i - 1] <= 0 && wave.voltageAxis[i] > 0) {
                if (firstCross < 0)
                    firstCross = i;
                else
                    crossings++;
            }
        }
        if (crossings > 0 && firstCross >= 0) {
            const lastCrossIdx = len - 1;
            const period = (wave.timeAxis[lastCrossIdx] - wave.timeAxis[firstCross]) / crossings;
            freq = period > 0 ? 1 / period : 0;
        }
        return {
            deltaTime, deltaVoltage,
            peakToPeak: maxV - minV,
            rms, dutyCycle: 50,
            riseTime: deltaTime * 0.1,
            frequency: freq
        };
    }
    exportSvg(channel: number): string {
        const wave = this.captureWave(channel);
        const w = 800;
        const h = 400;
        const pad = 40;
        const plotW = w - pad * 2;
        const plotH = h - pad * 2;
        const len = wave.voltageAxis.length;
        if (len === 0)
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <rect width="${w}" height="${h}" fill="#0a0a12"/>
      <text x="${pad}" y="${h / 2}" fill="#aaa" font-size="14">No data</text></svg>`;
        let minV = wave.voltageAxis[0];
        let maxV = wave.voltageAxis[0];
        for (let i = 0; i < len; i++) {
            const v = wave.voltageAxis[i];
            if (v < minV)
                minV = v;
            if (v > maxV)
                maxV = v;
        }
        const vRange = maxV - minV || 1;
        const tMax = wave.timeAxis[len - 1] || 1;
        let path = '';
        for (let i = 0; i < len; i++) {
            const x = pad + (wave.timeAxis[i] / tMax) * plotW;
            const y = pad + plotH - ((wave.voltageAxis[i] - minV) / vRange) * plotH;
            path += (i === 0 ? 'M' : 'L') + `${x.toFixed(1)},${y.toFixed(1)} `;
        }
        return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="#0a0a12"/>
  <path d="${path.trim()}" fill="none" stroke="#00ff88" stroke-width="1.5"/>
  <text x="${pad}" y="20" fill="#aaa" font-size="12">CH${channel + 1} Pk-Pk=${(maxV - minV).toFixed(2)}V</text>
</svg>`;
    }
    /** Run FFT on captured waveform */
    captureFft(channel: number = 0): WaveData {
        const wave = this.captureWave(channel);
        if (wave.voltageAxis.length < 2)
            return wave;
        return this.computeFft(wave);
    }
    private computeFft(wave: WaveData): WaveData {
        const voltageAxis = wave.voltageAxis;
        const n = voltageAxis.length;
        const half = Math.floor(n / 2);
        const freqAxis: number[] = [];
        const magAxis: number[] = [];
        for (let k = 0; k < half; k++) {
            let re = 0;
            let im = 0;
            for (let i = 0; i < n; i++) {
                const angle = -2 * Math.PI * k * i / n;
                re += voltageAxis[i] * Math.cos(angle);
                im += voltageAxis[i] * Math.sin(angle);
            }
            let mag = Math.sqrt(re * re + im * im) / n;
            if (this.fftLogScale && mag > 0)
                mag = 20 * Math.log10(Math.max(mag, 1e-12));
            freqAxis.push(k * wave.sampleRate / n);
            magAxis.push(mag);
        }
        return {
            waveId: IdUtil.generate('fft'),
            probeName: `FFT(${wave.probeName})`,
            netName: 'MATH_FFT',
            timeAxis: freqAxis,
            voltageAxis: magAxis,
            currentAxis: new Array(half).fill(0),
            sampleRate: wave.sampleRate / n,
            waveType: 'freq',
            holdTime: wave.sampleRate / 2
        };
    }
}
