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
function getTimebaseSec(e393: OscTimebase): number {
    switch (e393) {
        case OscTimebase.NS_10: return 10e-9;
        case OscTimebase.US_1: return 1e-6;
        case OscTimebase.MS_1: return 1e-3;
        case OscTimebase.S_1: return 1;
        case OscTimebase.S_10: return 10;
        default: return 1e-6;
    }
}
function getVoltageScaleFactor(d393: OscVoltageScale): number {
    switch (d393) {
        case OscVoltageScale.MV_50: return 0.05;
        case OscVoltageScale.MV_100: return 0.1;
        case OscVoltageScale.MV_200: return 0.2;
        case OscVoltageScale.MV_500: return 0.5;
        case OscVoltageScale.V_1: return 1;
        case OscVoltageScale.V_2: return 2;
        case OscVoltageScale.V_5: return 5;
        case OscVoltageScale.V_10: return 10;
        default: return 1;
    }
}
export class OscilloscopeEngine {
    private timebase: OscTimebase = OscTimebase.US_1;
    private voltageScales: OscVoltageScale[] = [OscVoltageScale.V_1, OscVoltageScale.V_1];
    private coupling: CouplingMode[] = [CouplingMode.DC, CouplingMode.DC];
    private triggerMode: TriggerMode = TriggerMode.EDGE;
    private triggerLevel: number = 0;
    private triggerChannel: number = 0;
    private captureMode: CaptureMode = CaptureMode.ROLL;
    private mathOp: MathChannelOp = MathChannelOp.ADD;
    private fftLogScale: boolean = false;
    private simulationWaveCache: WaveData[] = [];
    private simDataAge: number = 0;
    private lastNodeVoltages: Map<string, number> = new Map();
    private lastBranchCurrents: Map<string, number> = new Map();
    private channelProbes: string[] = ['', '', '', ''];
    private historyBuffer: HistoryEntry[] = [];
    private historyMaxSize: number = 2048;
    private lastSimTime: number = 0;
    feedSimulationWaves(c393: WaveData[]): void {
        this.simulationWaveCache = c393.slice();
        this.simDataAge++;
    }
    feedNodeVoltages(b393: Map<string, number>): void {
        this.lastNodeVoltages = new Map(b393);
    }
    feedBranchCurrents(a393: Map<string, number>): void {
        this.lastBranchCurrents = new Map(a393);
    }
    feedTimeSnapshot(x392: number, y392: Map<string, number>): void {
        this.lastSimTime = x392;
        const z392: HistoryEntry = { time: x392, voltages: new Map(y392) };
        this.historyBuffer.push(z392);
        if (this.historyBuffer.length > this.historyMaxSize) {
            this.historyBuffer.shift();
        }
    }
    getSimulationSnapshot(): SimSnapshot {
        return {
            voltages: new Map(this.lastNodeVoltages),
            currents: new Map(this.lastBranchCurrents)
        };
    }
    setTimebase(w392: OscTimebase): void { this.timebase = w392; }
    setVoltageScale(u392: number, v392: OscVoltageScale): void {
        while (this.voltageScales.length <= u392)
            this.voltageScales.push(OscVoltageScale.V_1);
        this.voltageScales[u392] = v392;
    }
    setCoupling(s392: number, t392: CouplingMode): void {
        while (this.coupling.length <= s392)
            this.coupling.push(CouplingMode.DC);
        this.coupling[s392] = t392;
    }
    setTrigger(p392: TriggerMode, q392: number, r392: number): void {
        this.triggerMode = p392;
        this.triggerLevel = q392;
        this.triggerChannel = r392;
    }
    setCaptureMode(o392: CaptureMode): void { this.captureMode = o392; }
    setMathChannel(m392: MathChannelOp, n392: boolean = false): void {
        this.mathOp = m392;
        this.fftLogScale = n392;
    }
    setChannelProbe(k392: number, l392: string): void {
        while (this.channelProbes.length <= k392)
            this.channelProbes.push('');
        this.channelProbes[k392] = l392;
    }
    autoAssignProbes(): void {
        for (let i392 = 0; i392 < Math.min(4, this.simulationWaveCache.length); i392++) {
            if (i392 < this.channelProbes.length && this.channelProbes[i392].length > 0) {
                continue;
            }
            const j392 = this.simulationWaveCache[i392];
            if (j392 && j392.voltageAxis.length > 0) {
                while (this.channelProbes.length <= i392) {
                    this.channelProbes.push('');
                }
                this.channelProbes[i392] = j392.probeName.length > 0 ? j392.probeName : j392.netName;
            }
        }
        let f392 = 0;
        this.lastNodeVoltages.forEach((g392: number, h392: string) => {
            if (f392 >= 4) {
                return;
            }
            while (f392 < 4 && f392 < this.channelProbes.length && this.channelProbes[f392].length > 0) {
                f392++;
            }
            if (f392 < 4 && h392 !== '0' && h392 !== 'GND' && h392 !== 'VCC') {
                while (this.channelProbes.length <= f392) {
                    this.channelProbes.push('');
                }
                this.channelProbes[f392] = h392;
                f392++;
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
    captureWave(o391: number = 0): WaveData {
        const p391 = o391 < this.channelProbes.length ? this.channelProbes[o391] : '';
        if (p391.length > 0) {
            const c392 = this.findCachedWave(p391);
            if (c392 !== undefined && c392.voltageAxis.length > 0) {
                const d392 = this.cloneWaveForChannel(c392, o391);
                const e392 = d392.voltageAxis.length > 0 ? d392.voltageAxis[d392.voltageAxis.length - 1] : 0;
                traceCaptureWave(o391, p391, 'waveCache', d392.voltageAxis.length, e392);
                return d392;
            }
        }
        if (p391.length > 0 && this.historyBuffer.length > 1) {
            const a392 = this.buildWaveFromHistory(p391, o391);
            if (this.hasMeaningfulWave(a392)) {
                const b392 = a392.voltageAxis.length > 0 ? a392.voltageAxis[a392.voltageAxis.length - 1] : 0;
                traceCaptureWave(o391, p391, 'history', a392.voltageAxis.length, b392);
                return a392;
            }
        }
        if (this.simulationWaveCache.length > o391) {
            const x391 = this.simulationWaveCache[o391];
            if (x391 && x391.voltageAxis.length > 0) {
                const y391 = this.cloneWaveForChannel(x391, o391);
                const z391 = y391.voltageAxis.length > 0 ? y391.voltageAxis[y391.voltageAxis.length - 1] : 0;
                traceCaptureWave(o391, p391, 'cacheByIndex', y391.voltageAxis.length, z391);
                return y391;
            }
        }
        const q391 = this.findAnySignalWave();
        if (q391 !== undefined) {
            const v391 = this.cloneWaveForChannel(q391, o391);
            const w391 = v391.voltageAxis.length > 0 ? v391.voltageAxis[v391.voltageAxis.length - 1] : 0;
            traceCaptureWave(o391, p391, 'anySignal', v391.voltageAxis.length, w391);
            return v391;
        }
        if (this.historyBuffer.length > 1) {
            const t391 = this.buildWaveFromAnyHistoryKey(o391);
            const u391 = t391.voltageAxis.length > 0 ? t391.voltageAxis[t391.voltageAxis.length - 1] : 0;
            traceCaptureWave(o391, p391, 'historyAny', t391.voltageAxis.length, u391);
            return t391;
        }
        const r391 = this.makeFlatWave(o391);
        const s391 = r391.voltageAxis.length > 0 ? r391.voltageAxis[r391.voltageAxis.length - 1] : 0;
        traceCaptureWave(o391, p391, 'flatDC', r391.voltageAxis.length, s391);
        return r391;
    }
    private cloneWaveForChannel(m391: WaveData, n391: number): WaveData {
        return {
            waveId: m391.waveId,
            probeName: `CH${n391 + 1}`,
            netName: m391.netName,
            timeAxis: m391.timeAxis.slice(),
            voltageAxis: m391.voltageAxis.slice(),
            currentAxis: m391.currentAxis.slice(),
            sampleRate: m391.sampleRate,
            waveType: m391.waveType,
            holdTime: m391.holdTime
        };
    }
    private findCachedWave(j391: string): WaveData | undefined {
        for (let k391 = 0; k391 < this.simulationWaveCache.length; k391++) {
            const l391 = this.simulationWaveCache[k391];
            if (this.waveMatchesProbe(l391, j391)) {
                return l391;
            }
        }
        return undefined;
    }
    private waveMatchesProbe(h391: WaveData, i391: string): boolean {
        if (i391.length === 0) {
            return false;
        }
        return h391.probeName === i391 || h391.netName === i391;
    }
    private findAnySignalWave(): WaveData | undefined {
        for (let a391 = 0; a391 < this.simulationWaveCache.length; a391++) {
            const b391 = this.simulationWaveCache[a391];
            if (b391.voltageAxis.length < 2) {
                continue;
            }
            const c391 = b391.probeName.toUpperCase();
            const d391 = b391.netName.toUpperCase();
            if (c391 === '0' || c391 === 'GND' || c391 === 'VCC' ||
                d391 === '0' || d391 === 'GND' || d391 === 'VCC') {
                continue;
            }
            let e391 = b391.voltageAxis[0];
            let f391 = b391.voltageAxis[0];
            for (let g391 = 1; g391 < b391.voltageAxis.length; g391++) {
                if (b391.voltageAxis[g391] < e391)
                    e391 = b391.voltageAxis[g391];
                if (b391.voltageAxis[g391] > f391)
                    f391 = b391.voltageAxis[g391];
            }
            if (f391 - e391 > 1e-9 || Math.abs(f391) > 1e-9) {
                return b391;
            }
        }
        return undefined;
    }
    private hasMeaningfulWave(w390: WaveData): boolean {
        if (w390.voltageAxis.length < 2) {
            return false;
        }
        let x390 = w390.voltageAxis[0];
        let y390 = w390.voltageAxis[0];
        for (let z390 = 1; z390 < w390.voltageAxis.length; z390++) {
            if (w390.voltageAxis[z390] < x390)
                x390 = w390.voltageAxis[z390];
            if (w390.voltageAxis[z390] > y390)
                y390 = w390.voltageAxis[z390];
        }
        return y390 - x390 > 1e-12 || Math.abs(y390) > 1e-12;
    }
    private resolveVoltage(t390: string, u390: Map<string, number>): number {
        if (t390.length === 0) {
            return 0;
        }
        const v390 = u390.get(t390);
        if (v390 !== undefined) {
            return v390;
        }
        return 0;
    }
    private buildWaveFromHistory(j390: string, k390: number): WaveData {
        const l390: number[] = [];
        const m390: number[] = [];
        const n390 = getTimebaseSec(this.timebase);
        const o390 = n390 * DIVISIONS;
        const p390 = this.lastSimTime;
        const q390 = Math.max(0, p390 - o390);
        for (const r390 of this.historyBuffer) {
            if (r390.time >= q390) {
                let s390 = this.resolveVoltage(j390, r390.voltages);
                if (Math.abs(s390) < 1e-12 && this.lastNodeVoltages.size > 0) {
                    s390 = this.resolveVoltage(j390, this.lastNodeVoltages);
                }
                l390.push(r390.time);
                m390.push(s390);
            }
        }
        if (l390.length < 2) {
            return this.makeFlatWave(k390);
        }
        return this.resampleWave(l390, m390, k390, o390);
    }
    private buildWaveFromAnyHistoryKey(e390: number): WaveData {
        let f390 = '';
        const g390 = this.historyBuffer[this.historyBuffer.length - 1];
        g390.voltages.forEach((h390: number, i390: string) => {
            if (f390.length === 0 && i390 !== '0' && i390 !== 'GND' && i390 !== 'VCC') {
                f390 = i390;
            }
        });
        if (f390.length === 0) {
            return this.makeFlatWave(e390);
        }
        this.channelProbes[e390] = f390;
        return this.buildWaveFromHistory(f390, e390);
    }
    private makeFlatWave(t389: number): WaveData {
        const u389 = getTimebaseSec(this.timebase);
        const v389 = u389 * DIVISIONS;
        const w389 = SAMPLE_POINTS / v389;
        const x389: number[] = [];
        const y389: number[] = [];
        const z389 = t389 < this.channelProbes.length ? this.channelProbes[t389] : '';
        let a390 = 0;
        if (z389.length > 0) {
            a390 = this.resolveVoltage(z389, this.lastNodeVoltages);
            if (Math.abs(a390) < 1e-12) {
                const d390 = this.findCachedWave(z389);
                if (d390 !== undefined && d390.voltageAxis.length > 0) {
                    a390 = d390.voltageAxis[d390.voltageAxis.length - 1];
                }
            }
        }
        if (Math.abs(a390) < 1e-12) {
            const c390 = this.findAnySignalWave();
            if (c390 !== undefined && c390.voltageAxis.length > 0) {
                a390 = c390.voltageAxis[c390.voltageAxis.length - 1];
            }
        }
        if (Math.abs(a390) < 1e-12 && t389 === 0) {
            a390 = this.lastNodeVoltages.get('VCC') ?? this.lastNodeVoltages.get('VCC_5V') ?? 0;
        }
        for (let b390 = 0; b390 < SAMPLE_POINTS; b390++) {
            x389.push((b390 / SAMPLE_POINTS) * v389);
            y389.push(a390);
        }
        return {
            waveId: IdUtil.generate('osc'),
            probeName: `CH${t389 + 1}`,
            netName: z389.length > 0 ? z389 : `OSC_CH${t389 + 1}`,
            timeAxis: x389,
            voltageAxis: y389,
            currentAxis: new Array(SAMPLE_POINTS).fill(0),
            sampleRate: w389,
            waveType: 'voltage',
            holdTime: v389
        };
    }
    private resampleWave(c389: number[], d389: number[], e389: number, f389: number): WaveData {
        const g389 = c389[0];
        const h389 = c389[c389.length - 1];
        const i389 = Math.max(h389 - g389, f389);
        const j389 = SAMPLE_POINTS / i389;
        const k389: number[] = [];
        const l389: number[] = [];
        const m389 = c389.length;
        for (let n389 = 0; n389 < SAMPLE_POINTS; n389++) {
            const o389 = g389 + (n389 / SAMPLE_POINTS) * i389;
            k389.push(o389 - g389);
            let p389 = d389[m389 - 1];
            for (let q389 = 1; q389 < m389; q389++) {
                if (c389[q389] >= o389) {
                    const r389 = Math.max(c389[q389] - c389[q389 - 1], 1e-15);
                    const s389 = (o389 - c389[q389 - 1]) / r389;
                    p389 = d389[q389 - 1] + s389 * (d389[q389] - d389[q389 - 1]);
                    break;
                }
            }
            l389.push(p389);
        }
        return {
            waveId: IdUtil.generate('osc'),
            probeName: `CH${e389 + 1}`,
            netName: this.channelProbes[e389] ?? `OSC_CH${e389 + 1}`,
            timeAxis: k389,
            voltageAxis: l389,
            currentAxis: new Array(SAMPLE_POINTS).fill(0),
            sampleRate: j389,
            waveType: 'voltage',
            holdTime: i389
        };
    }
    captureProbe(a389: string): WaveData | null {
        const b389 = this.findCachedWave(a389);
        if (!b389)
            return null;
        return {
            waveId: b389.waveId,
            probeName: b389.probeName,
            netName: b389.netName,
            timeAxis: b389.timeAxis.slice(),
            voltageAxis: b389.voltageAxis.slice(),
            currentAxis: b389.currentAxis.slice(),
            sampleRate: b389.sampleRate,
            waveType: b389.waveType,
            holdTime: b389.holdTime
        };
    }
    listProbes(): string[] {
        return this.simulationWaveCache.map(z388 => z388.probeName);
    }
    measureCursors(b388: number, c388: number): CursorMeasurement {
        const d388 = this.captureWave(0);
        const e388 = d388.voltageAxis.length;
        if (e388 === 0) {
            return { deltaTime: 0, deltaVoltage: 0, peakToPeak: 0, rms: 0,
                dutyCycle: 0, riseTime: 0, frequency: 0 };
        }
        const f388 = Math.max(0, Math.min(b388, e388 - 1));
        const g388 = Math.max(0, Math.min(c388, e388 - 1));
        const h388 = d388.voltageAxis[f388];
        const i388 = d388.voltageAxis[g388];
        const j388 = d388.timeAxis[f388];
        const k388 = d388.timeAxis[g388];
        const l388 = Math.abs(k388 - j388);
        const m388 = Math.abs(i388 - h388);
        let n388 = d388.voltageAxis[0];
        let o388 = d388.voltageAxis[0];
        let p388 = 0;
        for (let x388 = 0; x388 < e388; x388++) {
            const y388 = d388.voltageAxis[x388];
            if (y388 < n388)
                n388 = y388;
            if (y388 > o388)
                o388 = y388;
            p388 += y388 * y388;
        }
        const q388 = Math.sqrt(p388 / e388);
        let r388 = 0;
        let s388 = 0;
        let t388 = -1;
        for (let w388 = 1; w388 < e388; w388++) {
            if (d388.voltageAxis[w388 - 1] <= 0 && d388.voltageAxis[w388] > 0) {
                if (t388 < 0)
                    t388 = w388;
                else
                    s388++;
            }
        }
        if (s388 > 0 && t388 >= 0) {
            const u388 = e388 - 1;
            const v388 = (d388.timeAxis[u388] - d388.timeAxis[t388]) / s388;
            r388 = v388 > 0 ? 1 / v388 : 0;
        }
        return {
            deltaTime: l388,
            deltaVoltage: m388,
            peakToPeak: o388 - n388,
            rms: q388,
            dutyCycle: 50,
            riseTime: l388 * 0.1,
            frequency: r388
        };
    }
    exportSvg(j387: number): string {
        const k387 = this.captureWave(j387);
        const l387 = 800;
        const m387 = 400;
        const n387 = 40;
        const o387 = l387 - n387 * 2;
        const p387 = m387 - n387 * 2;
        const q387 = k387.voltageAxis.length;
        if (q387 === 0)
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${l387}" height="${m387}">
      <rect width="${l387}" height="${m387}" fill="#0a0a12"/>
      <text x="${n387}" y="${m387 / 2}" fill="#aaa" font-size="14">No data</text></svg>`;
        let r387 = k387.voltageAxis[0];
        let s387 = k387.voltageAxis[0];
        for (let z387 = 0; z387 < q387; z387++) {
            const a388 = k387.voltageAxis[z387];
            if (a388 < r387)
                r387 = a388;
            if (a388 > s387)
                s387 = a388;
        }
        const t387 = s387 - r387 || 1;
        const u387 = k387.timeAxis[q387 - 1] || 1;
        let v387 = '';
        for (let w387 = 0; w387 < q387; w387++) {
            const x387 = n387 + (k387.timeAxis[w387] / u387) * o387;
            const y387 = n387 + p387 - ((k387.voltageAxis[w387] - r387) / t387) * p387;
            v387 += (w387 === 0 ? 'M' : 'L') + `${x387.toFixed(1)},${y387.toFixed(1)} `;
        }
        return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${l387}" height="${m387}">
  <rect width="${l387}" height="${m387}" fill="#0a0a12"/>
  <path d="${v387.trim()}" fill="none" stroke="#00ff88" stroke-width="1.5"/>
  <text x="${n387}" y="20" fill="#aaa" font-size="12">CH${j387 + 1} Pk-Pk=${(s387 - r387).toFixed(2)}V</text>
</svg>`;
    }
    captureFft(h387: number = 0): WaveData {
        const i387 = this.captureWave(h387);
        if (i387.voltageAxis.length < 2)
            return i387;
        return this.computeFft(i387);
    }
    private computeFft(v386: WaveData): WaveData {
        const w386 = v386.voltageAxis;
        const x386 = w386.length;
        const y386 = Math.floor(x386 / 2);
        const z386: number[] = [];
        const a387: number[] = [];
        for (let b387 = 0; b387 < y386; b387++) {
            let c387 = 0;
            let d387 = 0;
            for (let f387 = 0; f387 < x386; f387++) {
                const g387 = -2 * Math.PI * b387 * f387 / x386;
                c387 += w386[f387] * Math.cos(g387);
                d387 += w386[f387] * Math.sin(g387);
            }
            let e387 = Math.sqrt(c387 * c387 + d387 * d387) / x386;
            if (this.fftLogScale && e387 > 0)
                e387 = 20 * Math.log10(Math.max(e387, 1e-12));
            z386.push(b387 * v386.sampleRate / x386);
            a387.push(e387);
        }
        return {
            waveId: IdUtil.generate('fft'),
            probeName: `FFT(${v386.probeName})`,
            netName: 'MATH_FFT',
            timeAxis: z386,
            voltageAxis: a387,
            currentAxis: new Array(y386).fill(0),
            sampleRate: v386.sampleRate / x386,
            waveType: 'freq',
            holdTime: v386.sampleRate / 2
        };
    }
}
