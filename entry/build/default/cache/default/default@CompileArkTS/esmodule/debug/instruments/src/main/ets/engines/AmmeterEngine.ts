import { AmmeterType, IdUtil } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { WaveData } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
const DC_RANGES_MA = [2, 20, 200, 2000, 10000];
const AC_RANGES_MA = [2, 20, 200, 2000];
const RMS_WINDOW_SAMPLES = 16;
const DC_AVG_SAMPLES = 12;
const DC_EMA_ALPHA = 0.35;
const WAVE_HISTORY_MAX = 256;
export class AmmeterEngine {
    private type: AmmeterType = AmmeterType.DC;
    private rangeIndex: number = 2;
    private lastReading: number = 0;
    private lastRms: number = 0;
    private autoRangeOn: boolean = true;
    private currentReader: (() => number) | null = null;
    private globalFallback: (() => number) | null = null;
    private rmsSampleBuffer: number[] = [];
    private rmsSampleIndex: number = 0;
    private dcOffset: number = 0;
    private dcSampleBuffer: number[] = [];
    private dcEma: number = 0;
    private dcEmaInit: boolean = false;
    private waveSamples: number[] = [];
    private waveTimes: number[] = [];
    setType(t: AmmeterType): void {
        this.type = t;
        this.rangeIndex = 1;
        this.rmsSampleBuffer = [];
        this.rmsSampleIndex = 0;
        this.dcOffset = 0;
        this.dcSampleBuffer = [];
        this.dcEma = 0;
        this.dcEmaInit = false;
    }
    getType(): AmmeterType { return this.type; }
    setCurrentReader(reader: (() => number) | null): void {
        this.currentReader = reader;
        this.rmsSampleBuffer = [];
        this.rmsSampleIndex = 0;
        this.dcSampleBuffer = [];
        this.dcEma = 0;
        this.dcEmaInit = false;
    }
    setGlobalFallback(reader: (() => number) | null): void {
        this.globalFallback = reader;
    }
    setRange(idx: number): void {
        const ranges = this.type === AmmeterType.DC ? DC_RANGES_MA : AC_RANGES_MA;
        if (idx >= 0 && idx < ranges.length) {
            this.rangeIndex = idx;
        }
        this.autoRangeOn = false;
    }
    getRange(): number {
        const ranges = this.type === AmmeterType.DC ? DC_RANGES_MA : AC_RANGES_MA;
        return ranges[this.rangeIndex] ?? 200;
    }
    autoRange(forValue?: number): void {
        this.autoRangeOn = true;
        let r = forValue;
        if (r === undefined) {
            r = this.type === AmmeterType.AC ? this.lastRms : this.lastReading;
        }
        const ranges = this.type === AmmeterType.DC ? DC_RANGES_MA : AC_RANGES_MA;
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
    /** Measure from an explicit sample (per-instance I+→I-). Applies DC avg / AC true-RMS. */
    measureValue(raw: number): number {
        this.pushWaveSample(raw);
        if (this.type === AmmeterType.AC) {
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
        if (Math.abs(averaged) > max * 1.05 && this.autoRangeOn) {
            this.autoRange(averaged);
        }
        const displayMax = this.getRange();
        this.lastReading = Math.min(Math.abs(averaged), displayMax) * (averaged < 0 ? -1 : 1);
        return this.lastReading;
    }
    /** High-rate silent sample (sim tick) — fills DC avg / AC RMS without UI log spam. */
    feedSample(raw: number): void {
        this.pushWaveSample(raw);
        if (this.type === AmmeterType.AC) {
            this.updateRmsBuffer(raw);
            return;
        }
        this.updateDcAverage(raw);
    }
    /** 电流时域波形（mA，供面板 Canvas） */
    getWaveform(): WaveData {
        const n = this.waveSamples.length;
        const timeAxis = this.waveTimes.slice();
        const voltageAxis = this.waveSamples.slice();
        const span = n >= 2 ? Math.max(timeAxis[n - 1] - timeAxis[0], 1e-6) : 1;
        return {
            waveId: IdUtil.generate('amw'),
            probeName: 'AM',
            netName: 'AMMETER',
            timeAxis: timeAxis,
            voltageAxis: voltageAxis,
            currentAxis: voltageAxis.slice(),
            sampleRate: n > 1 ? (n - 1) / span : 1,
            waveType: 'current',
            holdTime: span
        };
    }
    /**
     * Immediate DC UI update (interactive pot / switch) — clears averaging lag.
     */
    snapReading(raw: number): number {
        this.pushWaveSample(raw);
        this.dcSampleBuffer = [raw];
        this.dcEma = raw;
        this.dcEmaInit = true;
        if (this.type === AmmeterType.AC) {
            this.lastReading = raw;
            this.lastRms = Math.abs(raw);
            return this.lastRms;
        }
        if (this.autoRangeOn) {
            this.autoRange(raw);
        }
        const displayMax = this.getRange();
        this.lastReading = Math.min(Math.abs(raw), displayMax) * (raw < 0 ? -1 : 1);
        return this.lastReading;
    }
    getLastReading(): number { return this.type === AmmeterType.AC ? this.lastRms : this.lastReading; }
    getUnit(): string { return this.type === AmmeterType.DC ? 'mA DC' : 'mArms AC'; }
    getReadingAmps(): number { return (this.type === AmmeterType.AC ? this.lastRms : this.lastReading) / 1000; }
    getRangeLabel(): string {
        return `${this.getRange()}mA`;
    }
    private simulate(): number {
        if (this.currentReader !== null) {
            return this.currentReader();
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
        if (!this.dcEmaInit) {
            this.dcEma = box;
            this.dcEmaInit = true;
        }
        else {
            this.dcEma = DC_EMA_ALPHA * raw + (1 - DC_EMA_ALPHA) * this.dcEma;
        }
        return 0.55 * box + 0.45 * this.dcEma;
    }
    private updateRmsBuffer(raw: number): void {
        if (this.rmsSampleBuffer.length < RMS_WINDOW_SAMPLES) {
            this.rmsSampleBuffer.push(raw);
            this.rmsSampleIndex = this.rmsSampleBuffer.length;
        }
        else {
            this.rmsSampleBuffer[this.rmsSampleIndex % RMS_WINDOW_SAMPLES] = raw;
            this.rmsSampleIndex = (this.rmsSampleIndex + 1) % (RMS_WINDOW_SAMPLES * 2);
        }
        if (this.rmsSampleBuffer.length >= 2) {
            let sum = 0;
            for (const v of this.rmsSampleBuffer)
                sum += v;
            this.dcOffset = sum / this.rmsSampleBuffer.length;
        }
        if (this.rmsSampleBuffer.length >= 2) {
            let sumSq = 0;
            for (const v of this.rmsSampleBuffer) {
                const ac = v - this.dcOffset;
                sumSq += ac * ac;
            }
            this.lastRms = Math.sqrt(sumSq / this.rmsSampleBuffer.length);
        }
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
}
