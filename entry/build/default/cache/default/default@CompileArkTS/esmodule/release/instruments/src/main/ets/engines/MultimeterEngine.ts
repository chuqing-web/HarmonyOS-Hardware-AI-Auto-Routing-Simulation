import { MultimeterMode } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
const RANGES_DCV = [0.2, 2, 20, 200, 1000];
const RANGES_ACV = [0.2, 2, 20, 200];
const RANGES_RES = [200, 2000, 20000, 200000, 2000000];
export class MultimeterEngine {
    private mode: MultimeterMode = MultimeterMode.DCV;
    private rangeIndex: number = 1;
    private autoRangeEnabled: boolean = true;
    private readingReader: (() => number) | null = null;
    private globalFallback: (() => number) | null = null;
    private lastRawValue: number = 0;
    setMode(u386: MultimeterMode): void {
        this.mode = u386;
        this.rangeIndex = 1;
    }
    getMode(): MultimeterMode { return this.mode; }
    setReadingReader(t386: (() => number) | null): void {
        this.readingReader = t386;
    }
    setGlobalFallback(s386: (() => number) | null): void {
        this.globalFallback = s386;
    }
    autoRange(): void {
        this.autoRangeEnabled = true;
        const p386 = this.simulateReading();
        const q386 = this.getRanges();
        for (let r386 = 0; r386 < q386.length; r386++) {
            if (Math.abs(p386) <= q386[r386]) {
                this.rangeIndex = r386;
                return;
            }
        }
        this.rangeIndex = q386.length - 1;
    }
    measure(): number {
        const o386 = this.simulateReading();
        this.lastRawValue = o386;
        if (this.autoRangeEnabled) {
            this.autoRange();
        }
        return this.clampToRange(o386);
    }
    getLastReading(): number { return this.lastRawValue; }
    private simulateReading(): number {
        if (this.readingReader !== null) {
            return this.readingReader();
        }
        if (this.globalFallback !== null) {
            return this.globalFallback();
        }
        return 0;
    }
    private getRanges(): number[] {
        switch (this.mode) {
            case MultimeterMode.DCV: return RANGES_DCV;
            case MultimeterMode.ACV: return RANGES_ACV;
            case MultimeterMode.RESISTANCE: return RANGES_RES;
            case MultimeterMode.CURRENT: return [0.02, 0.2, 2, 10];
            case MultimeterMode.DIODE: return [2];
            default: return [1];
        }
    }
    private clampToRange(m386: number): number {
        const n386 = this.getRanges()[this.rangeIndex] ?? Math.abs(m386);
        return Math.min(Math.abs(m386), n386) * (m386 < 0 ? -1 : 1);
    }
}
