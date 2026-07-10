/**
 * Oscilloscope engine — reads from real simulation WaveData, renders waveform + FFT + math
 * v2: Probe-name mapping, live voltage sampling, proper multi-channel display
 */
import {
  WaveData, IdUtil, OscTimebase, OscVoltageScale, CouplingMode,
  TriggerMode, CaptureMode, MathChannelOp, CursorMeasurement, traceCaptureWave
} from 'common';

interface SimSnapshot {
  voltages: Map<string, number>;
  currents: Map<string, number>;
}

interface HistoryEntry {
  time: number;
  voltages: Map<string, number>;
}

const DIVISIONS = 10;
const SAMPLE_POINTS = 1024;

function getTimebaseSec(timebase: OscTimebase): number {
  switch (timebase) {
    case OscTimebase.NS_10: return 10e-9;
    case OscTimebase.US_1:  return 1e-6;
    case OscTimebase.MS_1:  return 1e-3;
    case OscTimebase.S_1:   return 1;
    case OscTimebase.S_10:  return 10;
    default: return 1e-6;
  }
}

function getVoltageScaleFactor(scale: OscVoltageScale): number {
  switch (scale) {
    case OscVoltageScale.MV_50:  return 0.05;
    case OscVoltageScale.MV_100: return 0.1;
    case OscVoltageScale.MV_200: return 0.2;
    case OscVoltageScale.MV_500: return 0.5;
    case OscVoltageScale.V_1:    return 1;
    case OscVoltageScale.V_2:    return 2;
    case OscVoltageScale.V_5:    return 5;
    case OscVoltageScale.V_10:   return 10;
    default: return 1;
  }
}

export class OscilloscopeEngine {
  private timebase: OscTimebase = OscTimebase.US_1;
  private voltageScales: OscVoltageScale[] = [OscVoltageScale.V_1, OscVoltageScale.V_1];
  private coupling: CouplingMode[] = [CouplingMode.DC, CouplingMode.DC];
  private triggerMode: TriggerMode = TriggerMode.EDGE;
  private triggerLevel: number = 0;
  private triggerChannel: number = 0;
  private captureMode: CaptureMode = CaptureMode.ROLL;
  private mathOp: MathChannelOp = MathChannelOp.ADD;
  private fftLogScale: boolean = false;
  private simulationWaveCache: WaveData[] = [];
  private simDataAge: number = 0;
  private lastNodeVoltages: Map<string, number> = new Map();
  private lastBranchCurrents: Map<string, number> = new Map();
  // Probe name → channel index mapping
  private channelProbes: string[] = ['', '', '', ''];
  // Historical voltage snapshots for time-domain display
  private historyBuffer: HistoryEntry[] = [];
  private historyMaxSize: number = 2048;
  private lastSimTime: number = 0;

  feedSimulationWaves(waves: WaveData[]): void {
    this.simulationWaveCache = waves.slice();
    this.simDataAge++;
  }

  feedNodeVoltages(voltages: Map<string, number>): void {
    this.lastNodeVoltages = new Map(voltages);
  }

  feedBranchCurrents(currents: Map<string, number>): void {
    this.lastBranchCurrents = new Map(currents);
  }

  /** Feed a time snapshot for building time-domain waveforms */
  feedTimeSnapshot(time: number, voltages: Map<string, number>): void {
    this.lastSimTime = time;
    const entry: HistoryEntry = { time: time, voltages: new Map(voltages) };
    this.historyBuffer.push(entry);
    if (this.historyBuffer.length > this.historyMaxSize) {
      this.historyBuffer.shift();
    }
  }

  getSimulationSnapshot(): SimSnapshot {
    return {
      voltages: new Map(this.lastNodeVoltages),
      currents: new Map(this.lastBranchCurrents)
    };
  }

  setTimebase(timebase: OscTimebase): void { this.timebase = timebase; }
  setVoltageScale(channel: number, scale: OscVoltageScale): void {
    while (this.voltageScales.length <= channel) this.voltageScales.push(OscVoltageScale.V_1);
    this.voltageScales[channel] = scale;
  }
  setCoupling(channel: number, mode: CouplingMode): void {
    while (this.coupling.length <= channel) this.coupling.push(CouplingMode.DC);
    this.coupling[channel] = mode;
  }
  setTrigger(mode: TriggerMode, level: number, channel: number): void {
    this.triggerMode = mode; this.triggerLevel = level; this.triggerChannel = channel;
  }
  setCaptureMode(mode: CaptureMode): void { this.captureMode = mode; }
  setMathChannel(op: MathChannelOp, logScale: boolean = false): void {
    this.mathOp = op; this.fftLogScale = logScale;
  }

  /** Map a probe/net name to an oscilloscope channel (0-3) */
  setChannelProbe(channel: number, probeName: string): void {
    while (this.channelProbes.length <= channel) this.channelProbes.push('');
    this.channelProbes[channel] = probeName;
  }

  /** Auto-assign simulation probes to channels based on active wave data */
  autoAssignProbes(): void {
    for (let i = 0; i < Math.min(4, this.simulationWaveCache.length); i++) {
      if (i < this.channelProbes.length && this.channelProbes[i].length > 0) {
        continue;
      }
      const wave = this.simulationWaveCache[i];
      if (wave && wave.voltageAxis.length > 0) {
        while (this.channelProbes.length <= i) {
          this.channelProbes.push('');
        }
        this.channelProbes[i] = wave.probeName.length > 0 ? wave.probeName : wave.netName;
      }
    }
    // Fallback: assign from node voltage map for empty channels only
    let ch = 0;
    this.lastNodeVoltages.forEach((_v: number, name: string) => {
      if (ch >= 4) {
        return;
      }
      while (ch < 4 && ch < this.channelProbes.length && this.channelProbes[ch].length > 0) {
        ch++;
      }
      if (ch < 4 && name !== '0' && name !== 'GND' && name !== 'VCC') {
        while (this.channelProbes.length <= ch) {
          this.channelProbes.push('');
        }
        this.channelProbes[ch] = name;
        ch++;
      }
    });
  }

  getTimebase(): OscTimebase { return this.timebase; }
  getVoltageScales(): OscVoltageScale[] { return this.voltageScales.slice(); }
  getCoupling(): CouplingMode[] { return this.coupling.slice(); }
  getTriggerMode(): TriggerMode { return this.triggerMode; }
  getTriggerLevel(): number { return this.triggerLevel; }
  getTriggerChannel(): number { return this.triggerChannel; }
  getCaptureMode(): CaptureMode { return this.captureMode; }
  getMathOp(): MathChannelOp { return this.mathOp; }
  getFftLogScale(): boolean { return this.fftLogScale; }

  /** Capture waveform from real simulation data */
  captureWave(channel: number = 0): WaveData {
    const probeName = channel < this.channelProbes.length ? this.channelProbes[channel] : '';

    // 1. Prefer simulation wave cache — full time-series from kernel
    if (probeName.length > 0) {
      const matched = this.findCachedWave(probeName);
      if (matched !== undefined && matched.voltageAxis.length > 0) {
        const wave = this.cloneWaveForChannel(matched, channel);
        const lastV = wave.voltageAxis.length > 0 ? wave.voltageAxis[wave.voltageAxis.length - 1] : 0;
        traceCaptureWave(channel, probeName, 'waveCache', wave.voltageAxis.length, lastV);
        return wave;
      }
    }

    // 2. History buffer for live time-domain (probe-bound)
    if (probeName.length > 0 && this.historyBuffer.length > 1) {
      const histWave = this.buildWaveFromHistory(probeName, channel);
      if (this.hasMeaningfulWave(histWave)) {
        const lastV = histWave.voltageAxis.length > 0 ? histWave.voltageAxis[histWave.voltageAxis.length - 1] : 0;
        traceCaptureWave(channel, probeName, 'history', histWave.voltageAxis.length, lastV);
        return histWave;
      }
    }

    // 3. Simulation wave cache by channel index
    if (this.simulationWaveCache.length > channel) {
      const ext = this.simulationWaveCache[channel];
      if (ext && ext.voltageAxis.length > 0) {
        const wave = this.cloneWaveForChannel(ext, channel);
        const lastV = wave.voltageAxis.length > 0 ? wave.voltageAxis[wave.voltageAxis.length - 1] : 0;
        traceCaptureWave(channel, probeName, 'cacheByIndex', wave.voltageAxis.length, lastV);
        return wave;
      }
    }

    // 4. Any non-rail wave in cache
    const anyWave = this.findAnySignalWave();
    if (anyWave !== undefined) {
      const wave = this.cloneWaveForChannel(anyWave, channel);
      const lastV = wave.voltageAxis.length > 0 ? wave.voltageAxis[wave.voltageAxis.length - 1] : 0;
      traceCaptureWave(channel, probeName, 'anySignal', wave.voltageAxis.length, lastV);
      return wave;
    }

    // 5. History buffer fallback
    if (this.historyBuffer.length > 1) {
      const wave = this.buildWaveFromAnyHistoryKey(channel);
      const lastV = wave.voltageAxis.length > 0 ? wave.voltageAxis[wave.voltageAxis.length - 1] : 0;
      traceCaptureWave(channel, probeName, 'historyAny', wave.voltageAxis.length, lastV);
      return wave;
    }

    // 6. DC snapshot from current node voltages
    const flat = this.makeFlatWave(channel);
    const lastV = flat.voltageAxis.length > 0 ? flat.voltageAxis[flat.voltageAxis.length - 1] : 0;
    traceCaptureWave(channel, probeName, 'flatDC', flat.voltageAxis.length, lastV);
    return flat;
  }

  private cloneWaveForChannel(src: WaveData, channel: number): WaveData {
    return {
      waveId: src.waveId,
      probeName: `CH${channel + 1}`,
      netName: src.netName,
      timeAxis: src.timeAxis.slice(),
      voltageAxis: src.voltageAxis.slice(),
      currentAxis: src.currentAxis.slice(),
      sampleRate: src.sampleRate,
      waveType: src.waveType,
      holdTime: src.holdTime
    };
  }

  private findCachedWave(probeName: string): WaveData | undefined {
    for (let i = 0; i < this.simulationWaveCache.length; i++) {
      const w = this.simulationWaveCache[i];
      if (this.waveMatchesProbe(w, probeName)) {
        return w;
      }
    }
    return undefined;
  }

  private waveMatchesProbe(wave: WaveData, probeName: string): boolean {
    if (probeName.length === 0) {
      return false;
    }
    return wave.probeName === probeName || wave.netName === probeName;
  }

  private findAnySignalWave(): WaveData | undefined {
    for (let i = 0; i < this.simulationWaveCache.length; i++) {
      const w = this.simulationWaveCache[i];
      if (w.voltageAxis.length < 2) {
        continue;
      }
      const upperProbe = w.probeName.toUpperCase();
      const upperNet = w.netName.toUpperCase();
      if (upperProbe === '0' || upperProbe === 'GND' || upperProbe === 'VCC' ||
          upperNet === '0' || upperNet === 'GND' || upperNet === 'VCC') {
        continue;
      }
      let minV = w.voltageAxis[0];
      let maxV = w.voltageAxis[0];
      for (let j = 1; j < w.voltageAxis.length; j++) {
        if (w.voltageAxis[j] < minV) minV = w.voltageAxis[j];
        if (w.voltageAxis[j] > maxV) maxV = w.voltageAxis[j];
      }
      if (maxV - minV > 1e-9 || Math.abs(maxV) > 1e-9) {
        return w;
      }
    }
    return undefined;
  }

  private hasMeaningfulWave(wave: WaveData): boolean {
    if (wave.voltageAxis.length < 2) {
      return false;
    }
    let minV = wave.voltageAxis[0];
    let maxV = wave.voltageAxis[0];
    for (let i = 1; i < wave.voltageAxis.length; i++) {
      if (wave.voltageAxis[i] < minV) minV = wave.voltageAxis[i];
      if (wave.voltageAxis[i] > maxV) maxV = wave.voltageAxis[i];
    }
    return maxV - minV > 1e-12 || Math.abs(maxV) > 1e-12;
  }

  /** Resolve voltage for a probe key (net UUID or SPICE node name) */
  private resolveVoltage(probeName: string, voltages: Map<string, number>): number {
    if (probeName.length === 0) {
      return 0;
    }
    const direct = voltages.get(probeName);
    if (direct !== undefined) {
      return direct;
    }
    return 0;
  }

  /** Build time-domain waveform from history buffer for a specific probe */
  private buildWaveFromHistory(probeName: string, channel: number): WaveData {
    const timeAxis: number[] = [];
    const voltageAxis: number[] = [];
    const dt = getTimebaseSec(this.timebase);
    const windowSec = dt * DIVISIONS;

    const maxTime = this.lastSimTime;
    const minTime = Math.max(0, maxTime - windowSec);

    for (const snap of this.historyBuffer) {
      if (snap.time >= minTime) {
        let voltage = this.resolveVoltage(probeName, snap.voltages);
        if (Math.abs(voltage) < 1e-12 && this.lastNodeVoltages.size > 0) {
          voltage = this.resolveVoltage(probeName, this.lastNodeVoltages);
        }
        timeAxis.push(snap.time);
        voltageAxis.push(voltage);
      }
    }

    if (timeAxis.length < 2) {
      return this.makeFlatWave(channel);
    }

    // Resample to SAMPLE_POINTS for consistent display
    return this.resampleWave(timeAxis, voltageAxis, channel, windowSec);
  }

  /** Build waveform from any available key in history */
  private buildWaveFromAnyHistoryKey(channel: number): WaveData {
    // Find a non-ground, non-vcc voltage key
    let probeName = '';
    const snap = this.historyBuffer[this.historyBuffer.length - 1];
    snap.voltages.forEach((_v: number, name: string) => {
      if (probeName.length === 0 && name !== '0' && name !== 'GND' && name !== 'VCC') {
        probeName = name;
      }
    });
    if (probeName.length === 0) {
      return this.makeFlatWave(channel);
    }
    this.channelProbes[channel] = probeName;
    return this.buildWaveFromHistory(probeName, channel);
  }

  /** Build flat (DC-level) waveform from current node voltage state */
  private makeFlatWave(channel: number): WaveData {
    const dt = getTimebaseSec(this.timebase);
    const windowSec = dt * DIVISIONS;
    const sampleRate = SAMPLE_POINTS / windowSec;
    const timeAxis: number[] = [];
    const voltageAxis: number[] = [];
    const probeName = channel < this.channelProbes.length ? this.channelProbes[channel] : '';

    // Use actual DC voltage from simulation if available
    let dcLevel = 0;
    if (probeName.length > 0) {
      dcLevel = this.resolveVoltage(probeName, this.lastNodeVoltages);
      if (Math.abs(dcLevel) < 1e-12) {
        const cached = this.findCachedWave(probeName);
        if (cached !== undefined && cached.voltageAxis.length > 0) {
          dcLevel = cached.voltageAxis[cached.voltageAxis.length - 1];
        }
      }
    }
    if (Math.abs(dcLevel) < 1e-12) {
      const anyWave = this.findAnySignalWave();
      if (anyWave !== undefined && anyWave.voltageAxis.length > 0) {
        dcLevel = anyWave.voltageAxis[anyWave.voltageAxis.length - 1];
      }
    }
    // Try VCC for ch0 if nothing else
    if (Math.abs(dcLevel) < 1e-12 && channel === 0) {
      dcLevel = this.lastNodeVoltages.get('VCC') ?? this.lastNodeVoltages.get('VCC_5V') ?? 0;
    }

    for (let i = 0; i < SAMPLE_POINTS; i++) {
      timeAxis.push((i / SAMPLE_POINTS) * windowSec);
      voltageAxis.push(dcLevel);
    }

    return {
      waveId: IdUtil.generate('osc'),
      probeName: `CH${channel + 1}`,
      netName: probeName.length > 0 ? probeName : `OSC_CH${channel + 1}`,
      timeAxis,
      voltageAxis,
      currentAxis: new Array(SAMPLE_POINTS).fill(0),
      sampleRate,
      waveType: 'voltage',
      holdTime: windowSec
    };
  }

  /** Resample waveform to uniform SAMPLE_POINTS grid */
  private resampleWave(timeAxis: number[], voltageAxis: number[],
                       channel: number, windowSec: number): WaveData {
    const tMin = timeAxis[0];
    const tMax = timeAxis[timeAxis.length - 1];
    const span = Math.max(tMax - tMin, windowSec);
    const sampleRate = SAMPLE_POINTS / span;
    const outTime: number[] = [];
    const outVoltage: number[] = [];
    const n = timeAxis.length;

    for (let i = 0; i < SAMPLE_POINTS; i++) {
      const t = tMin + (i / SAMPLE_POINTS) * span;
      outTime.push(t - tMin);
      let vi = voltageAxis[n - 1];
      for (let j = 1; j < n; j++) {
        if (timeAxis[j] >= t) {
          const dt = Math.max(timeAxis[j] - timeAxis[j - 1], 1e-15);
          const frac = (t - timeAxis[j - 1]) / dt;
          vi = voltageAxis[j - 1] + frac * (voltageAxis[j] - voltageAxis[j - 1]);
          break;
        }
      }
      outVoltage.push(vi);
    }

    return {
      waveId: IdUtil.generate('osc'),
      probeName: `CH${channel + 1}`,
      netName: this.channelProbes[channel] ?? `OSC_CH${channel + 1}`,
      timeAxis: outTime,
      voltageAxis: outVoltage,
      currentAxis: new Array(SAMPLE_POINTS).fill(0),
      sampleRate,
      waveType: 'voltage',
      holdTime: span
    };
  }

  /** Sample a specific simulation probe by name */
  captureProbe(probeName: string): WaveData | null {
    const wave = this.findCachedWave(probeName);
    if (!wave) return null;
    return {
      waveId: wave.waveId,
      probeName: wave.probeName,
      netName: wave.netName,
      timeAxis: wave.timeAxis.slice(),
      voltageAxis: wave.voltageAxis.slice(),
      currentAxis: wave.currentAxis.slice(),
      sampleRate: wave.sampleRate,
      waveType: wave.waveType,
      holdTime: wave.holdTime
    };
  }

  /** List all available probe names from simulation data */
  listProbes(): string[] {
    return this.simulationWaveCache.map(w => w.probeName);
  }

  measureCursors(cursorA: number, cursorB: number): CursorMeasurement {
    const wave = this.captureWave(0);
    const len = wave.voltageAxis.length;
    if (len === 0) {
      return { deltaTime: 0, deltaVoltage: 0, peakToPeak: 0, rms: 0,
               dutyCycle: 0, riseTime: 0, frequency: 0 };
    }
    const idxA = Math.max(0, Math.min(cursorA, len - 1));
    const idxB = Math.max(0, Math.min(cursorB, len - 1));
    const vA = wave.voltageAxis[idxA];
    const vB = wave.voltageAxis[idxB];
    const tA = wave.timeAxis[idxA];
    const tB = wave.timeAxis[idxB];
    const deltaTime = Math.abs(tB - tA);
    const deltaVoltage = Math.abs(vB - vA);

    let minV = wave.voltageAxis[0];
    let maxV = wave.voltageAxis[0];
    let sumSq = 0;
    for (let i = 0; i < len; i++) {
      const v = wave.voltageAxis[i];
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / len);
    let freq = 0;
    let crossings = 0;
    let firstCross = -1;
    for (let i = 1; i < len; i++) {
      if (wave.voltageAxis[i - 1] <= 0 && wave.voltageAxis[i] > 0) {
        if (firstCross < 0) firstCross = i;
        else crossings++;
      }
    }
    if (crossings > 0 && firstCross >= 0) {
      const lastCrossIdx = len - 1;
      const period = (wave.timeAxis[lastCrossIdx] - wave.timeAxis[firstCross]) / crossings;
      freq = period > 0 ? 1 / period : 0;
    }

    return {
      deltaTime, deltaVoltage,
      peakToPeak: maxV - minV,
      rms, dutyCycle: 50,
      riseTime: deltaTime * 0.1,
      frequency: freq
    };
  }

  exportSvg(channel: number): string {
    const wave = this.captureWave(channel);
    const w = 800; const h = 400; const pad = 40;
    const plotW = w - pad * 2; const plotH = h - pad * 2;
    const len = wave.voltageAxis.length;
    if (len === 0) return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <rect width="${w}" height="${h}" fill="#0a0a12"/>
      <text x="${pad}" y="${h/2}" fill="#aaa" font-size="14">No data</text></svg>`;

    let minV = wave.voltageAxis[0];
    let maxV = wave.voltageAxis[0];
    for (let i = 0; i < len; i++) {
      const v = wave.voltageAxis[i];
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const vRange = maxV - minV || 1;
    const tMax = wave.timeAxis[len - 1] || 1;

    let path = '';
    for (let i = 0; i < len; i++) {
      const x = pad + (wave.timeAxis[i] / tMax) * plotW;
      const y = pad + plotH - ((wave.voltageAxis[i] - minV) / vRange) * plotH;
      path += (i === 0 ? 'M' : 'L') + `${x.toFixed(1)},${y.toFixed(1)} `;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="#0a0a12"/>
  <path d="${path.trim()}" fill="none" stroke="#00ff88" stroke-width="1.5"/>
  <text x="${pad}" y="20" fill="#aaa" font-size="12">CH${channel + 1} Pk-Pk=${(maxV-minV).toFixed(2)}V</text>
</svg>`;
  }

  /** Run FFT on captured waveform */
  captureFft(channel: number = 0): WaveData {
    const wave = this.captureWave(channel);
    if (wave.voltageAxis.length < 2) return wave;
    return this.computeFft(wave);
  }

  private computeFft(wave: WaveData): WaveData {
    const voltageAxis = wave.voltageAxis;
    const n = voltageAxis.length;
    const half = Math.floor(n / 2);
    const freqAxis: number[] = [];
    const magAxis: number[] = [];

    for (let k = 0; k < half; k++) {
      let re = 0; let im = 0;
      for (let i = 0; i < n; i++) {
        const angle = -2 * Math.PI * k * i / n;
        re += voltageAxis[i] * Math.cos(angle);
        im += voltageAxis[i] * Math.sin(angle);
      }
      let mag = Math.sqrt(re * re + im * im) / n;
      if (this.fftLogScale && mag > 0) mag = 20 * Math.log10(Math.max(mag, 1e-12));
      freqAxis.push(k * wave.sampleRate / n);
      magAxis.push(mag);
    }

    return {
      waveId: IdUtil.generate('fft'),
      probeName: `FFT(${wave.probeName})`,
      netName: 'MATH_FFT',
      timeAxis: freqAxis,
      voltageAxis: magAxis,
      currentAxis: new Array(half).fill(0),
      sampleRate: wave.sampleRate / n,
      waveType: 'freq',
      holdTime: wave.sampleRate / 2
    };
  }
}
