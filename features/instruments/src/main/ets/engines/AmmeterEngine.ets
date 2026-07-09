/**
 * 电流表仿真引擎 — 支持 DC / AC (True-RMS)
 */
import { AmmeterType } from 'common';

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
  // RMS sample buffer for AC mode
  private rmsSampleBuffer: number[] = [];
  private rmsSampleIndex: number = 0;
  private dcOffset: number = 0;

  setType(t: AmmeterType): void {
    this.type = t;
    this.rangeIndex = 1;
    this.rmsSampleBuffer = [];
    this.rmsSampleIndex = 0;
    this.dcOffset = 0;
  }

  getType(): AmmeterType { return this.type; }

  setCurrentReader(reader: (() => number) | null): void {
    this.currentReader = reader;
    this.rmsSampleBuffer = [];
    this.rmsSampleIndex = 0;
  }

  /** Set a global fallback reader that works even when no explicit reader is configured */
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

  autoRange(): void {
    this.autoRangeOn = true;
    const r = this.type === AmmeterType.AC ? this.lastRms : this.lastReading;
    const ranges = this.type === AmmeterType.DC ? DC_RANGES_MA : AC_RANGES_MA;
    for (let i = 0; i < ranges.length; i++) {
      if (Math.abs(r) <= ranges[i]) { this.rangeIndex = i; return; }
    }
    this.rangeIndex = ranges.length - 1;
  }

  measure(): number {
    const raw = this.simulate();
    if (this.type === AmmeterType.AC) {
      this.updateRmsBuffer(raw);
      this.lastReading = raw;
      return this.lastRms;
    }
    if (this.autoRangeOn) this.autoRange();
    const max = this.getRange();
    this.lastReading = Math.min(Math.abs(raw), max) * (raw < 0 ? -1 : 1);
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

  /** Update sliding RMS buffer and compute true-RMS */
  private updateRmsBuffer(raw: number): void {
    if (this.rmsSampleBuffer.length < RMS_WINDOW_SAMPLES) {
      this.rmsSampleBuffer.push(raw);
    } else {
      this.rmsSampleBuffer[this.rmsSampleIndex % RMS_WINDOW_SAMPLES] = raw;
      this.rmsSampleIndex = (this.rmsSampleIndex + 1) % (RMS_WINDOW_SAMPLES * 2);
    }
    if (this.rmsSampleBuffer.length >= 2) {
      let sum = 0;
      for (const v of this.rmsSampleBuffer) sum += v;
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
}
