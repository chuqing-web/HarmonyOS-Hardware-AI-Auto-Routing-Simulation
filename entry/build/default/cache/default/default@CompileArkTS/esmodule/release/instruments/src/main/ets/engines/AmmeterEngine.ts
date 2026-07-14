import { AmmeterType } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
const DC_RANGES_MA = [2, 20, 200, 2000, 10000];
const AC_RANGES_MA = [2, 20, 200, 2000];
const RMS_WINDOW_SAMPLES = 16;
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
    setType(e383: AmmeterType): void {
        this.type = e383;
        this.rangeIndex = 1;
        this.rmsSampleBuffer = [];
        this.rmsSampleIndex = 0;
        this.dcOffset = 0;
    }
    getType(): AmmeterType { return this.type; }
    setCurrentReader(d383: (() => number) | null): void {
        this.currentReader = d383;
        this.rmsSampleBuffer = [];
        this.rmsSampleIndex = 0;
    }
    setGlobalFallback(c383: (() => number) | null): void {
        this.globalFallback = c383;
    }
    setRange(a383: number): void {
        const b383 = this.type === AmmeterType.DC ? DC_RANGES_MA : AC_RANGES_MA;
        if (a383 >= 0 && a383 < b383.length) {
            this.rangeIndex = a383;
        }
        this.autoRangeOn = false;
    }
    getRange(): number {
        const z382 = this.type === AmmeterType.DC ? DC_RANGES_MA : AC_RANGES_MA;
        return z382[this.rangeIndex] ?? 200;
    }
    autoRange(): void {
        this.autoRangeOn = true;
        const w382 = this.type === AmmeterType.AC ? this.lastRms : this.lastReading;
        const x382 = this.type === AmmeterType.DC ? DC_RANGES_MA : AC_RANGES_MA;
        for (let y382 = 0; y382 < x382.length; y382++) {
            if (Math.abs(w382) <= x382[y382]) {
                this.rangeIndex = y382;
                return;
            }
        }
        this.rangeIndex = x382.length - 1;
    }
    measure(): number {
        const u382 = this.simulate();
        if (this.type === AmmeterType.AC) {
            this.updateRmsBuffer(u382);
            this.lastReading = u382;
            return this.lastRms;
        }
        if (this.autoRangeOn)
            this.autoRange();
        const v382 = this.getRange();
        this.lastReading = Math.min(Math.abs(u382), v382) * (u382 < 0 ? -1 : 1);
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
    private updateRmsBuffer(o382: number): void {
        if (this.rmsSampleBuffer.length < RMS_WINDOW_SAMPLES) {
            this.rmsSampleBuffer.push(o382);
        }
        else {
            this.rmsSampleBuffer[this.rmsSampleIndex % RMS_WINDOW_SAMPLES] = o382;
            this.rmsSampleIndex = (this.rmsSampleIndex + 1) % (RMS_WINDOW_SAMPLES * 2);
        }
        if (this.rmsSampleBuffer.length >= 2) {
            let s382 = 0;
            for (const t382 of this.rmsSampleBuffer)
                s382 += t382;
            this.dcOffset = s382 / this.rmsSampleBuffer.length;
        }
        if (this.rmsSampleBuffer.length >= 2) {
            let p382 = 0;
            for (const q382 of this.rmsSampleBuffer) {
                const r382 = q382 - this.dcOffset;
                p382 += r382 * r382;
            }
            this.lastRms = Math.sqrt(p382 / this.rmsSampleBuffer.length);
        }
    }
}
