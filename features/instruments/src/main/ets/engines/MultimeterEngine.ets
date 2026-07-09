/**
 * Multimeter engine — DCV/ACV/OHM/CURRENT/DIODE modes
 * v2: Added global fallback reader for always-on measurement
 */
import { MultimeterMode } from 'common';

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

  setMode(mode: MultimeterMode): void {
    this.mode = mode;
    this.rangeIndex = 1;
  }

  getMode(): MultimeterMode { return this.mode; }

  setReadingReader(reader: (() => number) | null): void {
    this.readingReader = reader;
  }

  /** Set a global fallback that works even when no specific reader is configured */
  setGlobalFallback(reader: (() => number) | null): void {
    this.globalFallback = reader;
  }

  autoRange(): void {
    this.autoRangeEnabled = true;
    const reading = this.simulateReading();
    const ranges = this.getRanges();
    for (let i = 0; i < ranges.length; i++) {
      if (Math.abs(reading) <= ranges[i]) {
        this.rangeIndex = i;
        return;
      }
    }
    this.rangeIndex = ranges.length - 1;
  }

  measure(): number {
    const raw = this.simulateReading();
    this.lastRawValue = raw;
    if (this.autoRangeEnabled) {
      this.autoRange();
    }
    return this.clampToRange(raw);
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

  private clampToRange(value: number): number {
    const max = this.getRanges()[this.rangeIndex] ?? Math.abs(value);
    return Math.min(Math.abs(value), max) * (value < 0 ? -1 : 1);
  }
}
