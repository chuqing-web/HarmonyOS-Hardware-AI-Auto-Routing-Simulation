/**
 * Oscilloscope engine — reads from real simulation WaveData, renders waveform + FFT + math
 * v2: Probe-name mapping, live voltage sampling, proper multi-channel display
 */
import {
  WaveData, IdUtil, OscTimebase, OscVoltageScale, CouplingMode,
  TriggerMode, CaptureMode, MathChannelOp, CursorMeasurement
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
    this.channelProbes = ['', '', '', ''];
    for (let i = 0; i < Math.min(4, this.simulationWaveCache.length); i++) {
      const wave = this.simulationWaveCache[i];
      if (wave && wave.voltageAxis.length > 0) {
        this.channelProbes[i] = wave.probeName;
      }
    }
    // Fallback: assign from node voltage map
    let ch = 0;
    if (this.simulationWaveCache.length === 0) {
      this.lastNodeVoltages.forEach((_v: number, name: string) => {
        if (ch < 4 && name !== '0' && name !== 'GND' && name !== 'VCC') {
          this.channelProbes[ch] = name;
          ch++;
        }
      });
    }
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
    // 1. Try probe-name mapped wave from history buffer
    const probeName = channel < this.channelProbes.length ? this.channelProbes[channel] : '';
    if (probeName.length > 0 && this.historyBuffer.length > 1) {
      return this.buildWaveFromHistory(probeName, channel);
    }

    // 2. Try simulation wave cache by probe name match
    if (probeName.length > 0) {
      const matched = this.simulationWaveCache.find(
        w => w.probeName === probeName || w.netName === probeName
      );
      if (matched && matched.voltageAxis.length > 0) {
        return {
          waveId: matched.waveId,
          probeName: `CH${channel + 1}`,
          netName: matched.netName,
          timeAxis: matched.timeAxis.slice(),
          voltageAxis: matched.voltageAxis.slice(),
          currentAxis: matched.currentAxis.slice(),
          sampleRate: matched.sampleRate,
          waveType: matched.waveType,
          holdTime: matched.holdTime
        };
      }
    }

    // 3. Try simulation wave cache by channel index
    if (this.simulationWaveCache.length > channel) {
      const ext = this.simulationWaveCache[channel];
      if (ext && ext.voltageAxis.length > 0) {
        return {
          waveId: ext.waveId,
          probeName: `CH${channel + 1}`,
          netName: ext.netName,
          timeAxis: ext.timeAxis.slice(),
          voltageAxis: ext.voltageAxis.slice(),
          currentAxis: ext.currentAxis.slice(),
          sampleRate: ext.sampleRate,
          waveType: ext.waveType,
          holdTime: ext.holdTime
        };
      }
    }

    // 4. Build from history buffer using any available voltage key
    if (this.historyBuffer.length > 1) {
      return this.buildWaveFromAnyHistoryKey(channel);
    }

    // 5. Build live snapshot from node voltages (single-point → flat line)
    return this.makeFlatWave(channel);
  }

  /** Build time-domain waveform from history buffer for a specific probe */
  private buildWaveFromHistory(probeName: string, channel: number): WaveData {
    const timeAxis: number[] = [];
    const voltageAxis: number[] = [];
    const dt = getTimebaseSec(this.timebase);
    const windowSec = dt * DIVISIONS;

    // Use recent history within the time window
    const maxTime = this.lastSimTime;
    const minTime = Math.max(0, maxTime - windowSec);

    for (const snap of this.historyBuffer) {
      if (snap.time >= minTime) {
        let voltage = snap.voltages.get(probeName);
        if (voltage === undefined && this.lastNodeVoltages.size > 0) {
          voltage = this.lastNodeVoltages.get(probeName) ?? 0;
        }
        timeAxis.push(snap.time);
        voltageAxis.push(voltage ?? 0);
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

    // Use actual DC voltage from simulation if available
    let dcLevel = 0;
    const probeName = channel < this.channelProbes.length ? this.channelProbes[channel] : '';
    if (probeName.length > 0) {
      dcLevel = this.lastNodeVoltages.get(probeName) ?? 0;
    }
    // Try VCC for ch0 if nothing else
    if (dcLevel === 0 && channel === 0) {
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
    const sampleRate = SAMPLE_POINTS / windowSec;
    const outTime: number[] = [];
    const outVoltage: number[] = [];
    const n = timeAxis.length;

    for (let i = 0; i < SAMPLE_POINTS; i++) {
      const t = (i / SAMPLE_POINTS) * windowSec;
      outTime.push(t);
      // Linear interpolation
      let vi = 0;
      for (let j = 1; j < n; j++) {
        if (timeAxis[j] >= t) {
          const frac = (t - timeAxis[j - 1]) / Math.max(timeAxis[j] - timeAxis[j - 1], 1e-15);
          vi = voltageAxis[j - 1] + frac * (voltageAxis[j] - voltageAxis[j - 1]);
          break;
        }
        vi = voltageAxis[n - 1];
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
      holdTime: windowSec
    };
  }

  /** Sample a specific simulation probe by name */
  captureProbe(probeName: string): WaveData | null {
    const wave = this.simulationWaveCache.find(
      w => w.probeName === probeName || w.netName === probeName
    );
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
