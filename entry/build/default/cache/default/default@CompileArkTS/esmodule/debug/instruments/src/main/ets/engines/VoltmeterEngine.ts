import { VoltmeterType, IdUtil } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { WaveData } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
const DC_RANGES = [0.2, 2, 20, 200, 1000];
const AC_RANGES = [0.2, 2, 20, 200, 750];
// AC RMS needs multiple samples over time to compute true RMS
const RMS_WINDOW_SAMPLES = 16;
/** DC meter low-pass — short enough that 1 kHz amp swing still looks alive on the UI */
const DC_AVG_SAMPLES = 12;
const DC_EMA_ALPHA = 0.35;
/** UI 波形环缓冲长度 */
const WAVE_HISTORY_MAX = 256;
export class VoltmeterEngine {
    private type: VoltmeterType = VoltmeterType.DC;
    private rangeIndex: number = 2;
    private lastReading: number = 0;
    private lastRms: number = 0;
    private autoRangeOn: boolean = true;
    private voltageReader: (() => number) | null = null;
    private globalFallback: (() => number) | null = null;
    // RMS sample buffer for AC mode
    private rmsSampleBuffer: number[] = [];
    private rmsSampleIndex: number = 0;
    private dcOffset: number = 0;
    private dcSampleBuffer: number[] = [];
    private dcEma: number = 0;
    private dcEmaInit: boolean = false;
    private waveSamples: number[] = [];
    private waveTimes: number[] = [];
    setType(t: VoltmeterType): void {
        this.type = t;
        this.rangeIndex = 1;
        this.rmsSampleBuffer = [];
        this.rmsSampleIndex = 0;
        this.dcOffset = 0;
        this.dcSampleBuffer = [];
        this.dcEma = 0;
        this.dcEmaInit = false;
    }
    getType(): VoltmeterType { return this.type; }
    setVoltageReader(reader: (() => number) | null): void {
        this.voltageReader = reader;
        // Reset RMS / DC buffers when reader changes
        this.rmsSampleBuffer = [];
        this.rmsSampleIndex = 0;
        this.dcSampleBuffer = [];
        this.dcEma = 0;
        this.dcEmaInit = false;
    }
    /** Set a global fallback reader that works even when no explicit reader is configured */
    setGlobalFallback(reader: (() => number) | null): void {
        this.globalFallback = reader;
    }
    setRange(idx: number): void {
        const ranges = this.type === VoltmeterType.DC ? DC_RANGES : AC_RANGES;
        if (idx >= 0 && idx < ranges.length) {
            this.rangeIndex = idx;
        }
        this.autoRangeOn = false;
    }
    getRange(): number {
        const ranges = this.type === VoltmeterType.DC ? DC_RANGES : AC_RANGES;
        return ranges[this.rangeIndex] ?? 20;
    }
    /** Pick range from a candidate voltage (must use current sample, not stale lastReading). */
    autoRange(forValue?: number): void {
        this.autoRangeOn = true;
        let r = forValue;
        if (r === undefined) {
            r = this.type === VoltmeterType.AC ? this.lastRms : this.lastReading;
        }
        const ranges = this.type === VoltmeterType.DC ? DC_RANGES : AC_RANGES;
        for (let i = 0; i < ranges.length; i++) {
            if (Math.abs(r) <= ranges[i]) {
                this.rangeIndex = i;
                return;
            }
        }
        this.rangeIndex = ranges.length - 1;
    }
    measure(): number {
        return this.measureValue(this.simulate());
    }
    /**
     * Measure from an explicit sample (e.g. per-instance V+−COM read).
     * Applies DC averaging / AC true-RMS so AC excitation does not flicker the DC meter.
     */
    measureValue(raw: number): number {
        this.pushWaveSample(raw);
        if (this.type === VoltmeterType.AC) {
            this.updateRmsBuffer(raw);
            this.lastReading = raw;
            if (this.autoRangeOn) {
                this.autoRange(this.lastRms);
            }
            return this.lastRms;
        }
        const averaged = this.updateDcAverage(raw);
        if (this.autoRangeOn) {
            this.autoRange(averaged);
        }
        const max = this.getRange();
        // Soft saturation near range (do not hard-clamp a rising signal onto a stale tiny range)
        if (Math.abs(averaged) > max * 1.05 && this.autoRangeOn) {
            this.autoRange(averaged);
        }
        const displayMax = this.getRange();
        this.lastReading = Math.min(Math.abs(averaged), displayMax) * (averaged < 0 ? -1 : 1);
        return this.lastReading;
    }
    /** Push a sample into DC/AC buffers without changing lastReading (high-rate sim feed). */
    feedSample(raw: number): void {
        this.pushWaveSample(raw);
        if (this.type === VoltmeterType.AC) {
            this.updateRmsBuffer(raw);
            return;
        }
        this.updateDcAverage(raw);
    }
    /** ΔV 时域波形（供面板 Canvas） */
    getWaveform(): WaveData {
        const n = this.waveSamples.length;
        const timeAxis = this.waveTimes.slice();
        const voltageAxis = this.waveSamples.slice();
        const span = n >= 2 ? Math.max(timeAxis[n - 1] - timeAxis[0], 1e-6) : 1;
        return {
            waveId: IdUtil.generate('vmw'),
            probeName: 'VM',
            netName: 'VOLTMETER',
            timeAxis: timeAxis,
            voltageAxis: voltageAxis,
            currentAxis: new Array(n).fill(0),
            sampleRate: n > 1 ? (n - 1) / span : 1,
            waveType: 'voltage',
            holdTime: span
        };
    }
    getLastReading(): number { return this.type === VoltmeterType.AC ? this.lastRms : this.lastReading; }
    getUnit(): string { return this.type === VoltmeterType.DC ? 'V DC' : 'Vrms AC'; }
    getRangeLabel(): string {
        return `${this.getRange()}V`;
    }
    private simulate(): number {
        if (this.voltageReader !== null) {
            return this.voltageReader();
        }
        if (this.globalFallback !== null) {
            return this.globalFallback();
        }
        return 0;
    }
    private updateDcAverage(raw: number): number {
        if (this.dcSampleBuffer.length < DC_AVG_SAMPLES) {
            this.dcSampleBuffer.push(raw);
        }
        else {
            this.dcSampleBuffer.shift();
            this.dcSampleBuffer.push(raw);
        }
        let sum = 0;
        for (let i = 0; i < this.dcSampleBuffer.length; i++) {
            sum += this.dcSampleBuffer[i];
        }
        const box = sum / this.dcSampleBuffer.length;
        // Blend short boxcar with EMA so DC meters track AC-driven nodes without flicker
        if (!this.dcEmaInit) {
            this.dcEma = box;
            this.dcEmaInit = true;
        }
        else {
            this.dcEma = DC_EMA_ALPHA * raw + (1 - DC_EMA_ALPHA) * this.dcEma;
        }
        return 0.55 * box + 0.45 * this.dcEma;
    }
    /**
     * Immediate DC UI update (interactive pot / switch) — clears averaging so meters track instantly.
     */
    snapReading(raw: number): number {
        this.pushWaveSample(raw);
        this.dcSampleBuffer = [raw];
        this.dcEma = raw;
        this.dcEmaInit = true;
        if (this.type === VoltmeterType.AC) {
            this.lastReading = raw;
            return raw;
        }
        if (this.autoRangeOn) {
            this.autoRange(raw);
        }
        const displayMax = this.getRange();
        this.lastReading = Math.min(Math.abs(raw), displayMax) * (raw < 0 ? -1 : 1);
        return this.lastReading;
    }
    private pushWaveSample(raw: number): void {
        const step = 0.001;
        const t = this.waveTimes.length > 0
            ? this.waveTimes[this.waveTimes.length - 1] + step
            : 0;
        this.waveTimes.push(t);
        this.waveSamples.push(raw);
        while (this.waveSamples.length > WAVE_HISTORY_MAX) {
            this.waveSamples.shift();
            this.waveTimes.shift();
        }
    }
    /** Update sliding RMS buffer and compute true-RMS */
    private updateRmsBuffer(raw: number): void {
        if (this.rmsSampleBuffer.length < RMS_WINDOW_SAMPLES) {
            this.rmsSampleBuffer.push(raw);
            this.rmsSampleIndex = this.rmsSampleBuffer.length;
        }
        else {
            this.rmsSampleBuffer[this.rmsSampleIndex % RMS_WINDOW_SAMPLES] = raw;
            this.rmsSampleIndex = (this.rmsSampleIndex + 1) % (RMS_WINDOW_SAMPLES * 2);
        }
        // Compute DC offset first
        if (this.rmsSampleBuffer.length >= 2) {
            let sum = 0;
            for (const v of this.rmsSampleBuffer)
                sum += v;
            this.dcOffset = sum / this.rmsSampleBuffer.length;
        }
        // Compute true RMS (AC component only: subtract DC offset)
        if (this.rmsSampleBuffer.length >= 2) {
            let sumSq = 0;
            for (const v of this.rmsSampleBuffer) {
                const ac = v - this.dcOffset;
                sumSq += ac * ac;
            }
            this.lastRms = Math.sqrt(sumSq / this.rmsSampleBuffer.length);
        }
    }
}
