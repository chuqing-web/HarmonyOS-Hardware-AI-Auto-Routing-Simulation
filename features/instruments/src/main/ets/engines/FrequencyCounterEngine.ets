/**
 * 频率计仿真引擎
 */
import { WaveData, IdUtil } from 'common';

const WAVE_HISTORY_MAX = 256;

export class FrequencyCounterEngine {
  private reading: number = 0;
  private gateTime: number = 1.0;
  private resolution: number = 1;
  private freqReader: (() => number) | null = null;
  private globalFallback: (() => number) | null = null;
  /** 输入信号电压采样（面板波形），非频率读数 */
  private signalSamples: number[] = [];
  private signalTimes: number[] = [];

  setGateTime(seconds: number): void {
    this.gateTime = Math.max(0.1, Math.min(10, seconds));
    if (seconds <= 0.2) this.resolution = 1;
    else if (seconds <= 1.0) this.resolution = 0.1;
    else this.resolution = 0.01;
  }

  getGateTime(): number { return this.gateTime; }

  setFreqReader(reader: (() => number) | null): void {
    this.freqReader = reader;
  }

  /** Set a global fallback reader that works even when no explicit reader is configured */
  setGlobalFallback(reader: (() => number) | null): void {
    this.globalFallback = reader;
  }

  measure(): number {
    if (this.freqReader !== null) {
      this.reading = this.freqReader();
    } else if (this.globalFallback !== null) {
      this.reading = this.globalFallback();
    } else {
      this.reading = 0;
    }
    return this.reading;
  }

  /** 仿真/UI 喂入输入端电压，供波形显示 */
  feedSignalSample(volts: number): void {
    const step = 0.001;
    const t = this.signalTimes.length > 0
      ? this.signalTimes[this.signalTimes.length - 1] + step
      : 0;
    this.signalTimes.push(t);
    this.signalSamples.push(volts);
    while (this.signalSamples.length > WAVE_HISTORY_MAX) {
      this.signalSamples.shift();
      this.signalTimes.shift();
    }
  }

  /** 输入信号时域波形（供面板 Canvas） */
  getWaveform(): WaveData {
    const n = this.signalSamples.length;
    const timeAxis = this.signalTimes.slice();
    const voltageAxis = this.signalSamples.slice();
    const span = n >= 2 ? Math.max(timeAxis[n - 1] - timeAxis[0], 1e-6) : 1;
    return {
      waveId: IdUtil.generate('fcw'),
      probeName: 'FC',
      netName: 'FREQ_IN',
      timeAxis: timeAxis,
      voltageAxis: voltageAxis,
      currentAxis: new Array(n).fill(0),
      sampleRate: n > 1 ? (n - 1) / span : 1,
      waveType: 'voltage',
      holdTime: span
    };
  }

  getLastReading(): number { return this.reading; }

  getReadingText(): string {
    if (this.reading >= 1e6) {
      return `${(this.reading / 1e6).toFixed(3)} MHz`;
    } else if (this.reading >= 1e3) {
      return `${(this.reading / 1e3).toFixed(1)} kHz`;
    }
    return `${this.reading.toFixed(1)} Hz`;
  }
}
