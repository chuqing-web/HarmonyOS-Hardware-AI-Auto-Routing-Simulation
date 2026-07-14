export class FrequencyCounterEngine {
    private reading: number = 0;
    private gateTime: number = 1.0;
    private resolution: number = 1;
    private freqReader: (() => number) | null = null;
    private globalFallback: (() => number) | null = null;
    setGateTime(h383: number): void {
        this.gateTime = Math.max(0.1, Math.min(10, h383));
        if (h383 <= 0.2)
            this.resolution = 1;
        else if (h383 <= 1.0)
            this.resolution = 0.1;
        else
            this.resolution = 0.01;
    }
    getGateTime(): number { return this.gateTime; }
    setFreqReader(g383: (() => number) | null): void {
        this.freqReader = g383;
    }
    setGlobalFallback(f383: (() => number) | null): void {
        this.globalFallback = f383;
    }
    measure(): number {
        if (this.freqReader !== null) {
            this.reading = this.freqReader();
        }
        else if (this.globalFallback !== null) {
            this.reading = this.globalFallback();
        }
        else {
            this.reading = 0;
        }
        return this.reading;
    }
    getLastReading(): number { return this.reading; }
    getReadingText(): string {
        if (this.reading >= 1e6) {
            return `${(this.reading / 1e6).toFixed(3)} MHz`;
        }
        else if (this.reading >= 1e3) {
            return `${(this.reading / 1e3).toFixed(1)} kHz`;
        }
        return `${this.reading.toFixed(1)} Hz`;
    }
}
