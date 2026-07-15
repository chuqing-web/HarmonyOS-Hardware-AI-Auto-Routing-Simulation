/**
 * Multimeter engine — DCV/ACV/OHM/CURRENT/DIODE modes
 * DCV uses light averaging; ACV uses true-RMS (same freeze/tracking concerns as voltmeter).
 */
import { MultimeterMode } from 'common';

const RANGES_DCV = [0.2, 2, 20, 200, 1000];
const RANGES_ACV = [0.2, 2, 20, 200];
const RANGES_RES = [200, 2000, 20000, 200000, 2000000];
const DC_AVG_SAMPLES = 12;
const DC_EMA_ALPHA = 0.35;
const RMS_WINDOW_SAMPLES = 16;

export class MultimeterEngine {
  private mode: MultimeterMode = MultimeterMode.DCV;
  private rangeIndex: number = 1;
  private autoRangeEnabled: boolean = true;
  private readingReader: (() => number) | null = null;
  private globalFallback: (() => number) | null = null;
  private lastRawValue: number = 0;
  private lastDisplay: number = 0;
  private dcSampleBuffer: number[] = [];
  private dcEma: number = 0;
  private dcEmaInit: boolean = false;
  private rmsSampleBuffer: number[] = [];
  private rmsSampleIndex: number = 0;
  private dcOffset: number = 0;
  private lastRms: number = 0;

  setMode(mode: MultimeterMode): void {
    this.mode = mode;
    this.rangeIndex = 1;
    this.resetFilters();
  }

  getMode(): MultimeterMode { return this.mode; }

  setReadingReader(reader: (() => number) | null): void {
    this.readingReader = reader;
    this.resetFilters();
  }

  setGlobalFallback(reader: (() => number) | null): void {
    this.globalFallback = reader;
  }

  autoRange(): void {
    this.autoRangeEnabled = true;
    const reading = Math.abs(this.lastDisplay !== 0 ? this.lastDisplay : this.simulateReading());
    const ranges = this.getRanges();
    for (let i = 0; i < ranges.length; i++) {
      if (reading <= ranges[i]) {
        this.rangeIndex = i;
        return;
      }
    }
    this.rangeIndex = ranges.length - 1;
  }

  measure(): number {
    return this.measureValue(this.simulateReading());
  }

  measureValue(raw: number): number {
    this.lastRawValue = raw;
    let display = raw;
    if (this.mode === MultimeterMode.DCV || this.mode === MultimeterMode.CURRENT) {
      display = this.updateDcAverage(raw);
    } else if (this.mode === MultimeterMode.ACV) {
      this.updateRmsBuffer(raw);
      display = this.lastRms;
    }
    if (this.autoRangeEnabled) {
      const ranges = this.getRanges();
      for (let i = 0; i < ranges.length; i++) {
        if (Math.abs(display) <= ranges[i]) {
          this.rangeIndex = i;
          break;
        }
        this.rangeIndex = ranges.length - 1;
      }
    }
    this.lastDisplay = this.clampToRange(display);
    return this.lastDisplay;
  }

  feedSample(raw: number): void {
    this.lastRawValue = raw;
    if (this.mode === MultimeterMode.DCV || this.mode === MultimeterMode.CURRENT) {
      this.updateDcAverage(raw);
    } else if (this.mode === MultimeterMode.ACV) {
      this.updateRmsBuffer(raw);
    }
  }

  /** Immediate DCV/CURRENT UI update after interactive circuit edits. */
  snapReading(raw: number): number {
    this.lastRawValue = raw;
    this.dcSampleBuffer = [raw];
    this.dcEma = raw;
    this.dcEmaInit = true;
    if (this.mode === MultimeterMode.ACV) {
      this.lastRms = Math.abs(raw);
      this.lastDisplay = this.clampToRange(this.lastRms);
      return this.lastDisplay;
    }
    if (this.autoRangeEnabled) {
      const ranges = this.getRanges();
      for (let i = 0; i < ranges.length; i++) {
        if (Math.abs(raw) <= ranges[i]) {
          this.rangeIndex = i;
          break;
        }
        this.rangeIndex = ranges.length - 1;
      }
    }
    this.lastDisplay = this.clampToRange(raw);
    return this.lastDisplay;
  }

  getLastReading(): number { return this.lastDisplay; }

  private resetFilters(): void {
    this.dcSampleBuffer = [];
    this.dcEma = 0;
    this.dcEmaInit = false;
    this.rmsSampleBuffer = [];
    this.rmsSampleIndex = 0;
    this.dcOffset = 0;
    this.lastRms = 0;
  }

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

  private clampToRange(value: number): number {
    const max = this.getRanges()[this.rangeIndex] ?? Math.abs(value);
    return Math.min(Math.abs(value), max) * (value < 0 ? -1 : 1);
  }

  private updateDcAverage(raw: number): number {
    if (this.dcSampleBuffer.length < DC_AVG_SAMPLES) {
      this.dcSampleBuffer.push(raw);
    } else {
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
    } else {
      this.dcEma = DC_EMA_ALPHA * raw + (1 - DC_EMA_ALPHA) * this.dcEma;
    }
    return 0.55 * box + 0.45 * this.dcEma;
  }

  private updateRmsBuffer(raw: number): void {
    if (this.rmsSampleBuffer.length < RMS_WINDOW_SAMPLES) {
      this.rmsSampleBuffer.push(raw);
      this.rmsSampleIndex = this.rmsSampleBuffer.length;
    } else {
      this.rmsSampleBuffer[this.rmsSampleIndex % RMS_WINDOW_SAMPLES] = raw;
      this.rmsSampleIndex = (this.rmsSampleIndex + 1) % (RMS_WINDOW_SAMPLES * 2);
    }
    if (this.rmsSampleBuffer.length >= 2) {
      let sum = 0;
      for (const v of this.rmsSampleBuffer) sum += v;
      this.dcOffset = sum / this.rmsSampleBuffer.length;
      let sumSq = 0;
      for (const v of this.rmsSampleBuffer) {
        const ac = v - this.dcOffset;
        sumSq += ac * ac;
      }
      this.lastRms = Math.sqrt(sumSq / this.rmsSampleBuffer.length);
    }
  }
}
