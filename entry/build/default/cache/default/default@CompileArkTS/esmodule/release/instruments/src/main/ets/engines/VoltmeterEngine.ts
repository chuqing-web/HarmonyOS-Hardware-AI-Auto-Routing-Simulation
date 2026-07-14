import { VoltmeterType } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
const DC_RANGES = [0.2, 2, 20, 200, 1000];
const AC_RANGES = [0.2, 2, 20, 200, 750];
const RMS_WINDOW_SAMPLES = 16;
export class VoltmeterEngine {
    private type: VoltmeterType = VoltmeterType.DC;
    private rangeIndex: number = 2;
    private lastReading: number = 0;
    private lastRms: number = 0;
    private autoRangeOn: boolean = true;
    private voltageReader: (() => number) | null = null;
    private globalFallback: (() => number) | null = null;
    private rmsSampleBuffer: number[] = [];
    private rmsSampleIndex: number = 0;
    private dcOffset: number = 0;
    setType(s395: VoltmeterType): void {
        this.type = s395;
        this.rangeIndex = 1;
        this.rmsSampleBuffer = [];
        this.rmsSampleIndex = 0;
        this.dcOffset = 0;
    }
    getType(): VoltmeterType { return this.type; }
    setVoltageReader(r395: (() => number) | null): void {
        this.voltageReader = r395;
        this.rmsSampleBuffer = [];
        this.rmsSampleIndex = 0;
    }
    setGlobalFallback(q395: (() => number) | null): void {
        this.globalFallback = q395;
    }
    setRange(o395: number): void {
        const p395 = this.type === VoltmeterType.DC ? DC_RANGES : AC_RANGES;
        if (o395 >= 0 && o395 < p395.length) {
            this.rangeIndex = o395;
        }
        this.autoRangeOn = false;
    }
    getRange(): number {
        const n395 = this.type === VoltmeterType.DC ? DC_RANGES : AC_RANGES;
        return n395[this.rangeIndex] ?? 20;
    }
    autoRange(): void {
        this.autoRangeOn = true;
        const k395 = this.type === VoltmeterType.AC ? this.lastRms : this.lastReading;
        const l395 = this.type === VoltmeterType.DC ? DC_RANGES : AC_RANGES;
        for (let m395 = 0; m395 < l395.length; m395++) {
            if (Math.abs(k395) <= l395[m395]) {
                this.rangeIndex = m395;
                return;
            }
        }
        this.rangeIndex = l395.length - 1;
    }
    measure(): number {
        const i395 = this.simulate();
        if (this.type === VoltmeterType.AC) {
            this.updateRmsBuffer(i395);
            this.lastReading = i395;
            return this.lastRms;
        }
        if (this.autoRangeOn)
            this.autoRange();
        const j395 = this.getRange();
        this.lastReading = Math.min(Math.abs(i395), j395) * (i395 < 0 ? -1 : 1);
        return this.lastReading;
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
    private updateRmsBuffer(c395: number): void {
        if (this.rmsSampleBuffer.length < RMS_WINDOW_SAMPLES) {
            this.rmsSampleBuffer.push(c395);
            this.rmsSampleIndex = this.rmsSampleBuffer.length;
        }
        else {
            this.rmsSampleBuffer[this.rmsSampleIndex % RMS_WINDOW_SAMPLES] = c395;
            this.rmsSampleIndex = (this.rmsSampleIndex + 1) % (RMS_WINDOW_SAMPLES * 2);
        }
        if (this.rmsSampleBuffer.length >= 2) {
            let g395 = 0;
            for (const h395 of this.rmsSampleBuffer)
                g395 += h395;
            this.dcOffset = g395 / this.rmsSampleBuffer.length;
        }
        if (this.rmsSampleBuffer.length >= 2) {
            let d395 = 0;
            for (const e395 of this.rmsSampleBuffer) {
                const f395 = e395 - this.dcOffset;
                d395 += f395 * f395;
            }
            this.lastRms = Math.sqrt(d395 / this.rmsSampleBuffer.length);
        }
    }
}
