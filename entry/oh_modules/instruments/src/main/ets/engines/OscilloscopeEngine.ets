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

/** Result of autoAdjustToSignal — panel syncs Select indices from these. */
export interface OscAutoScaleResult {
  changed: boolean;
  timebase: OscTimebase;
  voltageScale: OscVoltageScale;
  frequencyHz: number;
  vpp: number;
}

const DIVISIONS = 10;
const SAMPLE_POINTS = 1024;

function getTimebaseSec(timebase: OscTimebase): number {
  switch (timebase) {
    case OscTimebase.NS_10: return 10e-9;
    case OscTimebase.US_1:  return 1e-6;
    case OscTimebase.US_100: return 100e-6;
    case OscTimebase.MS_1:  return 1e-3;
    case OscTimebase.MS_10: return 10e-3;
    case OscTimebase.MS_100: return 100e-3;
    case OscTimebase.S_1:   return 1;
    case OscTimebase.S_10:  return 10;
    default: return 1e-6;
  }
}

function getVoltageScaleFactor(scale: OscVoltageScale): number {
  switch (scale) {
    case OscVoltageScale.MV_1:   return 0.001;
    case OscVoltageScale.MV_50:  return 0.05;
    case OscVoltageScale.MV_100: return 0.1;
    case OscVoltageScale.MV_200: return 0.2;
    case OscVoltageScale.MV_500: return 0.5;
    case OscVoltageScale.V_1:    return 1;
    case OscVoltageScale.V_2:    return 2;
    case OscVoltageScale.V_5:    return 5;
    case OscVoltageScale.V_10:   return 10;
    case OscVoltageScale.V_100:  return 100;
    default: return 1;
  }
}

export class OscilloscopeEngine {
  private timebase: OscTimebase = OscTimebase.MS_1;
  private voltageScales: OscVoltageScale[] = [OscVoltageScale.V_1, OscVoltageScale.V_1];
  private coupling: CouplingMode[] = [CouplingMode.DC, CouplingMode.DC];
  private triggerMode: TriggerMode = TriggerMode.EDGE;
  private triggerLevel: number = 2.0;
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
  /** Keep ≥100ms @ 1µs/step — enough for 10+ cycles at 1kHz on 10ms/div timebase */
  private historyMaxSize: number = 100000;
  private lastSimTime: number = 0;
  /** Auto-scale hysteresis: require 2 identical recommendations before applying */
  private autoScalePendingKey: string = '';
  private autoScalePendingCount: number = 0;

  feedSimulationWaves(waves: WaveData[]): void {
    // Deep-copy axes — kernel mutates live WaveData; sharing refs scrambled long runs
    const copied: WaveData[] = [];
    for (let i = 0; i < waves.length; i++) {
      const w = waves[i];
      const n = Math.min(w.timeAxis.length, w.voltageAxis.length);
      if (n < 1) {
        continue;
      }
      copied.push({
        waveId: w.waveId,
        probeName: w.probeName,
        netName: w.netName,
        timeAxis: w.timeAxis.slice(0, n),
        voltageAxis: w.voltageAxis.slice(0, n),
        currentAxis: w.currentAxis.length >= n ? w.currentAxis.slice(0, n) : new Array(n).fill(0),
        sampleRate: w.sampleRate,
        waveType: w.waveType,
        holdTime: w.holdTime
      });
    }
    this.simulationWaveCache = copied;
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
    // Skip stagnant or backwards time — non-monotonic history scrambles long-run scope
    if (this.historyBuffer.length > 0) {
      const last = this.historyBuffer[this.historyBuffer.length - 1];
      if (!(time > last.time)) {
        return;
      }
    }
    if (!(time === time) || !Number.isFinite(time)) {
      return;
    }
    this.lastSimTime = time;
    // Slim store: only probed nets (full map × 20k steps would thrash memory)
    const slim = new Map<string, number>();
    for (let c = 0; c < this.channelProbes.length; c++) {
      const p = this.channelProbes[c];
      if (p.length > 0) {
        const v = voltages.get(p);
        if (v !== undefined) {
          slim.set(p, v);
        }
      }
    }
    if (slim.size === 0) {
      let kept = 0;
      voltages.forEach((v: number, name: string) => {
        if (kept >= 6) {
          return;
        }
        if (name === '0' || name === 'GND' || name === 'VCC') {
          return;
        }
        slim.set(name, v);
        kept++;
      });
    }
    if (slim.size === 0) {
      return;
    }
    const entry: HistoryEntry = { time: time, voltages: slim };
    this.historyBuffer.push(entry);
    if (this.historyBuffer.length > this.historyMaxSize) {
      this.historyBuffer.shift();
    }
  }

  /**
   * Interactive DC circuit edit: rewrite probe voltages in the history ring so
   * CH traces jump to the new levels instead of lagging behind old samples.
   */
  snapDcProbeLevels(voltages: Map<string, number>): void {
    if (voltages.size === 0) {
      return;
    }
    this.lastNodeVoltages = new Map(voltages);
    for (let i = 0; i < this.historyBuffer.length; i++) {
      const snap = this.historyBuffer[i];
      for (let c = 0; c < this.channelProbes.length; c++) {
        const p = this.channelProbes[c];
        if (p.length === 0) {
          continue;
        }
        const v = voltages.get(p);
        if (v !== undefined) {
          snap.voltages.set(p, v);
        }
      }
      // Also refresh any already-stored keys present in the live map
      snap.voltages.forEach((_old: number, name: string) => {
        const v = voltages.get(name);
        if (v !== undefined) {
          snap.voltages.set(name, v);
        }
      });
    }
    // Rewrite wave cache so captureWave does not prefer stale pre-pot samples
    for (let i = 0; i < this.simulationWaveCache.length; i++) {
      const w = this.simulationWaveCache[i];
      let newV: number | undefined = undefined;
      if (w.netName.length > 0) {
        newV = voltages.get(w.netName);
      }
      if (newV === undefined && w.probeName.length > 0) {
        newV = voltages.get(w.probeName);
      }
      if (newV === undefined && i < this.channelProbes.length) {
        const p = this.channelProbes[i];
        if (p.length > 0) {
          newV = voltages.get(p);
        }
      }
      if (newV !== undefined && w.voltageAxis.length > 0) {
        for (let j = 0; j < w.voltageAxis.length; j++) {
          w.voltageAxis[j] = newV as number;
        }
      }
    }
    // Ensure at least one sample exists for UI readout
    if (this.historyBuffer.length === 0) {
      this.feedTimeSnapshot(this.lastSimTime + 1e-6, voltages);
    }
  }

  /**
   * Estimate frequency from the live history ring (works when kernel WaveData is flat/stale).
   */
  estimateFrequency(probeName: string): number {
    if (probeName.length === 0 || this.historyBuffer.length < 8) {
      return 0;
    }
    const times: number[] = [];
    const values: number[] = [];
    for (let i = 0; i < this.historyBuffer.length; i++) {
      const snap = this.historyBuffer[i];
      times.push(snap.time);
      values.push(this.resolveVoltage(probeName, snap.voltages));
    }
    let maxV = values[0];
    let minV = values[0];
    for (let k = 1; k < values.length; k++) {
      if (values[k] > maxV) {
        maxV = values[k];
      }
      if (values[k] < minV) {
        minV = values[k];
      }
    }
    if (maxV - minV < 1e-4) {
      return 0;
    }
    const threshold = (maxV + minV) / 2;
    let crossings = 0;
    let firstCross = -1;
    let lastCross = -1;
    for (let i = 1; i < values.length; i++) {
      const up = values[i - 1] < threshold && values[i] >= threshold;
      if (up) {
        if (firstCross < 0) {
          firstCross = times[i];
        }
        lastCross = times[i];
        crossings++;
      }
    }
    if (crossings < 2 || firstCross < 0 || lastCross <= firstCross) {
      return 0;
    }
    const period = (lastCross - firstCross) / (crossings - 1);
    return period > 0 ? 1.0 / period : 0;
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

  /**
   * Auto-pick timebase + V/div from CH signal (≈2–4 periods on screen, Vpp ≈ 60% FS).
   * Hysteresis avoids thrashing; returns whether scales changed.
   */
  autoAdjustToSignal(channel: number = 0): OscAutoScaleResult {
    const empty: OscAutoScaleResult = {
      changed: false,
      timebase: this.timebase,
      voltageScale: channel < this.voltageScales.length ? this.voltageScales[channel] : OscVoltageScale.V_1,
      frequencyHz: 0,
      vpp: 0
    };
    const probeName = channel < this.channelProbes.length ? this.channelProbes[channel] : '';
    let times: number[] = [];
    let volts: number[] = [];
    if (probeName.length > 0) {
      const matched = this.findCachedWave(probeName);
      if (matched !== undefined && matched.voltageAxis.length >= 8) {
        times = matched.timeAxis;
        volts = matched.voltageAxis;
      }
      if (times.length < 8 && this.historyBuffer.length >= 8) {
        const hist = this.buildWaveFromHistory(probeName, channel);
        if (hist.voltageAxis.length >= 8) {
          times = hist.timeAxis;
          volts = hist.voltageAxis;
        }
      }
    }
    if (times.length < 8) {
      return empty;
    }
    const n = Math.min(times.length, volts.length);
    let minV = volts[0];
    let maxV = volts[0];
    for (let i = 1; i < n; i++) {
      if (volts[i] < minV) {
        minV = volts[i];
      }
      if (volts[i] > maxV) {
        maxV = volts[i];
      }
    }
    const vpp = maxV - minV;
    const freq = OscilloscopeEngine.estimateFreqLocal(times, volts, 0, n);
    const span = Math.max(times[n - 1] - times[0], 1e-15);

    // Periodic: ~3 periods on screen.
    // DC / one-shot (RC)：用「活动区间」而非全历史 span——否则空闲直流越积越长，
    // 自适应不断放大时基（尤其 10ms 下一档曾是 1s），ROLL 永久左侧拥挤。
    let wantWindow = freq > 0.5
      ? (3.0 / freq)
      : OscilloscopeEngine.estimateActivitySpan(times, volts, n);
    wantWindow = Math.min(Math.max(wantWindow, 1e-8), 100);
    // Never auto-pick a window the live buffer cannot fill
    if (span > 1e-6) {
      wantWindow = Math.min(wantWindow, span * 0.95);
    }
    const wantDiv = wantWindow / DIVISIONS;
    const nextTb = OscilloscopeEngine.pickTimebase(wantDiv);

    // V/div: Vpp fills ~6 of 10 divisions (leave headroom)
    const wantVDiv = vpp > 1e-4 ? (vpp / 6.0) : Math.max(Math.abs(maxV), Math.abs(minV), 0.5) / 4.0;
    const nextVs = OscilloscopeEngine.pickVoltageScale(wantVDiv);

    const curTb = this.timebase;
    const curVs = channel < this.voltageScales.length ? this.voltageScales[channel] : OscVoltageScale.V_1;
    const curWindow = getTimebaseSec(curTb) * DIVISIONS;
    const periodsOnScreen = freq > 0.5 ? (curWindow * freq) : -1;
    const curVDiv = getVoltageScaleFactor(curVs);
    const divsUsed = curVDiv > 0 ? (vpp / curVDiv) : 0;

    // Hysteresis: only change when clearly too zoomed in/out
    let needTb = nextTb !== curTb;
    if (needTb && periodsOnScreen > 0) {
      needTb = periodsOnScreen < 1.2 || periodsOnScreen > 8.0;
    } else if (needTb && freq <= 0.5) {
      // DC / slow: change if window differs by >2.5×.
      // Do NOT zoom out further once current window already covers the activity
      // (prevents idle DC history from ratcheting 10ms → 100ms → 1s).
      const ratio = wantWindow / Math.max(curWindow, 1e-15);
      if (ratio > 2.5 && curWindow >= wantWindow * 0.85) {
        needTb = false;
      } else {
        needTb = ratio < 0.4 || ratio > 2.5;
      }
    }
    let needVs = nextVs !== curVs;
    if (needVs) {
      needVs = divsUsed < 2.0 || divsUsed > 9.5 || vpp < 1e-4;
    }

    // Require two consecutive identical recommendations before applying
    const key = `${channel}|${needTb ? nextTb : curTb}|${needVs ? nextVs : curVs}`;
    if (key !== this.autoScalePendingKey) {
      this.autoScalePendingKey = key;
      this.autoScalePendingCount = 1;
      return {
        changed: false,
        timebase: curTb,
        voltageScale: curVs,
        frequencyHz: freq,
        vpp: vpp
      };
    }
    this.autoScalePendingCount++;
    if (this.autoScalePendingCount < 2) {
      return {
        changed: false,
        timebase: curTb,
        voltageScale: curVs,
        frequencyHz: freq,
        vpp: vpp
      };
    }

    let changed = false;
    if (needTb) {
      this.timebase = nextTb;
      changed = true;
    }
    if (needVs) {
      this.setVoltageScale(channel, nextVs);
      changed = true;
    }
    if (changed && vpp > 1e-4) {
      this.triggerLevel = (minV + maxV) / 2;
    }
    if (changed) {
      this.autoScalePendingCount = 0;
      this.autoScalePendingKey = '';
    }
    return {
      changed: changed,
      timebase: this.timebase,
      voltageScale: channel < this.voltageScales.length ? this.voltageScales[channel] : nextVs,
      frequencyHz: freq,
      vpp: vpp
    };
  }

  private static pickTimebase(wantSecPerDiv: number): OscTimebase {
    const order: OscTimebase[] = [
      OscTimebase.NS_10, OscTimebase.US_1, OscTimebase.US_100,
      OscTimebase.MS_1, OscTimebase.MS_10, OscTimebase.MS_100,
      OscTimebase.S_1, OscTimebase.S_10
    ];
    for (let i = 0; i < order.length; i++) {
      if (getTimebaseSec(order[i]) >= wantSecPerDiv * 0.85) {
        return order[i];
      }
    }
    return OscTimebase.S_10;
  }

  /**
   * Wall-clock span of significant voltage activity (edges / settling).
   * Ignores long idle DC tails so auto timebase stays stable for RC one-shots.
   */
  private static estimateActivitySpan(times: number[], volts: number[], nIn: number): number {
    const n = Math.min(nIn, times.length, volts.length);
    if (n < 2) {
      return 1e-3;
    }
    let minV = volts[0];
    let maxV = volts[0];
    for (let i = 1; i < n; i++) {
      if (volts[i] < minV) {
        minV = volts[i];
      }
      if (volts[i] > maxV) {
        maxV = volts[i];
      }
    }
    const vpp = maxV - minV;
    const full = Math.max(times[n - 1] - times[0], 1e-15);
    if (vpp < 1e-4) {
      return Math.min(full, 50e-3);
    }
    const thr = Math.max(vpp * 0.08, 1e-4);
    const vFinal = volts[n - 1];
    let lastActive = 0;
    for (let i = n - 1; i >= 1; i--) {
      if (Math.abs(volts[i] - vFinal) > thr || Math.abs(volts[i] - volts[i - 1]) > thr) {
        lastActive = i;
        break;
      }
    }
    let firstActive = 0;
    for (let i = 1; i < n; i++) {
      if (Math.abs(volts[i] - volts[0]) > thr) {
        firstActive = i > 0 ? i - 1 : 0;
        break;
      }
    }
    if (lastActive < firstActive) {
      lastActive = firstActive;
    }
    const act = Math.max(times[lastActive] - times[firstActive], 1e-6);
    const settledTail = times[n - 1] - times[lastActive];
    if (settledTail > act * 0.5) {
      return Math.min(Math.max(act * 2.5, 5e-3), 2.0);
    }
    return Math.min(Math.max(act * 2.0, full * 0.5, 5e-3), 2.0);
  }

  private static pickVoltageScale(wantVPerDiv: number): OscVoltageScale {
    const order: OscVoltageScale[] = [
      OscVoltageScale.MV_1, OscVoltageScale.MV_50, OscVoltageScale.MV_100,
      OscVoltageScale.MV_200, OscVoltageScale.MV_500,
      OscVoltageScale.V_1, OscVoltageScale.V_2, OscVoltageScale.V_5,
      OscVoltageScale.V_10, OscVoltageScale.V_100
    ];
    for (let i = 0; i < order.length; i++) {
      if (getVoltageScaleFactor(order[i]) >= wantVPerDiv * 0.9) {
        return order[i];
      }
    }
    return OscVoltageScale.V_100;
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
    // 禁止从任意仿真网偷绑 CH0：未放置示波器时不应出现波形。
    // 探针只由原理图 OSC 器件引脚经 applyScopeProbesFromAllBindings 写入。
    return;
  }

  /**
   * Drop history / wave cache only (call on sim start / template load).
   * Do NOT clear channelProbes — CH2+ are bound from OSC schematic pins;
   * wiping them drops TRIANGLE_OUT etc. until the next rebind race.
   */
  clearCaptureBuffers(): void {
    this.historyBuffer = [];
    this.simulationWaveCache = [];
    this.simDataAge = 0;
    this.autoScalePendingKey = '';
    this.autoScalePendingCount = 0;
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

  /** Capture waveform from real simulation data — 按时基截窗；禁止串台到 GND/其它网络 */
  captureWave(channel: number = 0): WaveData {
    const probeName = channel < this.channelProbes.length ? this.channelProbes[channel] : '';
    // CH2+ without a bound probe must not steal CH1 nets / invent a second trace
    if (channel > 0 && probeName.length === 0) {
      return this.makeFlatWave(channel);
    }
    let raw: WaveData | undefined = undefined;
    let source = 'flatDC';

    // 有绑定探针时：优先能盖满时基窗的源。
    // 内核 WaveData 密度高（µs），但若曾被钝裁只剩几 ms，ROLL 会永久左侧拥挤；
    // 此时改用 history（帧率采样、跨度更长）或 span 更大的缓存。
    if (probeName.length > 0) {
      const userWindow = Math.max(getTimebaseSec(this.timebase) * DIVISIONS, 1e-12);
      const matched = this.findCachedWave(probeName);
      let histWave: WaveData | undefined = undefined;
      if (this.historyBuffer.length >= 2) {
        histWave = this.buildWaveFromHistory(probeName, channel);
        if (histWave.voltageAxis.length < 2 || !this.hasMeaningfulWave(histWave)) {
          histWave = undefined;
        }
      }
      const cacheOk = matched !== undefined && matched.voltageAxis.length >= 32 &&
        this.hasMeaningfulWave(matched);
      if (cacheOk && matched !== undefined) {
        const cacheSpan = OscilloscopeEngine.waveSpanSec(matched);
        const histSpan = histWave !== undefined ? OscilloscopeEngine.waveSpanSec(histWave) : 0;
        // Prefer history only when cache cannot cover the display window and history is longer
        if (cacheSpan + 1e-15 < userWindow && histSpan > cacheSpan * 1.25) {
          raw = histWave;
          source = 'historyLonger';
        } else {
          raw = matched;
          source = 'waveCache';
        }
      }
      if (raw === undefined && histWave !== undefined) {
        raw = histWave;
        source = 'history';
      }
      if (raw === undefined && matched !== undefined && matched.voltageAxis.length >= 2) {
        raw = matched;
        source = 'waveCacheShort';
      }
      if (raw === undefined) {
        raw = this.makeFlatWave(channel);
        source = 'flatDC';
      }
    } else {
      // 无探针：禁止偷采任意网络（未放置示波器时不应出现波形）
      raw = this.makeEmptyWave(channel);
      source = 'noProbe';
    }

    const display = this.prepareDisplayWave(raw, channel);
    let lastV = 0;
    let minV = Number.POSITIVE_INFINITY;
    let maxV = Number.NEGATIVE_INFINITY;
    let finiteN = 0;
    for (let i = 0; i < display.voltageAxis.length; i++) {
      const v = display.voltageAxis[i];
      if (!Number.isFinite(v)) {
        continue;
      }
      lastV = v;
      if (v < minV) {
        minV = v;
      }
      if (v > maxV) {
        maxV = v;
      }
      finiteN++;
    }
    if (finiteN === 0) {
      minV = 0;
      maxV = 0;
      lastV = 0;
    }
    const rawN = Math.min(raw.timeAxis.length, raw.voltageAxis.length);
    const rawSpan = rawN >= 2 ? Math.max(raw.timeAxis[rawN - 1] - raw.timeAxis[0], 0) : 0;
    const estFreq = rawN >= 8
      ? OscilloscopeEngine.estimateFreqLocal(raw.timeAxis, raw.voltageAxis, 0, rawN) : 0;
    traceCaptureWave(channel, probeName, source, display.voltageAxis.length, lastV,
      maxV - minV, rawSpan, estFreq, `${this.timebase}`);
    return display;
  }

  /**
   * 按时基截窗 + 均匀重采样。
   * 显示窗宽 = 时基 × 10 格；滚动模式取最新窗；边沿触发仅非 ROLL。
   * 禁止输出 NaN（会把 UI 打成 last=NaNV / 空迹线）。
   */
  private prepareDisplayWave(src: WaveData, channel: number): WaveData {
    const n0 = Math.min(src.timeAxis.length, src.voltageAxis.length);
    if (n0 < 2) {
      return this.makeFlatWave(channel);
    }

    // Keep only the trailing monotonic segment (guards against any legacy bad stamps)
    let startIdx = 0;
    for (let i = 1; i < n0; i++) {
      if (!(src.timeAxis[i] > src.timeAxis[i - 1])) {
        startIdx = i;
      }
    }
    const times = startIdx > 0 ? src.timeAxis.slice(startIdx) : src.timeAxis;
    const volts = startIdx > 0 ? src.voltageAxis.slice(startIdx) : src.voltageAxis;
    const n = Math.min(times.length, volts.length);
    if (n < 2) {
      return this.makeFlatWave(channel);
    }

    const divSec = getTimebaseSec(this.timebase);
    const userWindow = Math.max(divSec * DIVISIONS, 1e-12);
    const tEnd = times[n - 1];
    const tStartAll = times[0];
    const availableSpan = Math.max(tEnd - tStartAll, 1e-12);

    // 滚动模式：始终用完整时基窗（右缘对齐最新）；触发锁仍可缩短到有效数据
    let windowSec = userWindow;
    if (this.captureMode !== CaptureMode.ROLL && availableSpan < userWindow) {
      windowSec = availableSpan;
    }

    const estFreq = OscilloscopeEngine.estimateFreqLocal(times, volts, 0, n);
    const canTrigger = this.captureMode !== CaptureMode.ROLL &&
      estFreq > 5 && availableSpan >= (1.0 / estFreq) * 0.95;
    const lockEdge = canTrigger && this.triggerMode !== TriggerMode.LEVEL;

    let tWinStart: number;
    if (lockEdge) {
      let level = this.triggerLevel;
      let scanMin = volts[0];
      let scanMax = volts[0];
      let scanSum = 0;
      for (let i = 0; i < n; i++) {
        const v = volts[i];
        if (v < scanMin) {
          scanMin = v;
        }
        if (v > scanMax) {
          scanMax = v;
        }
        scanSum += v;
      }
      const mid = scanSum / n;
      if (level < scanMin || level > scanMax || (scanMax - scanMin) < 1e-6) {
        level = mid;
      }
      let trigIdx = -1;
      const needAhead = windowSec * 0.85;
      for (let i = 1; i < n; i++) {
        if (volts[i - 1] < level && volts[i] >= level) {
          if (tEnd - times[i] >= needAhead) {
            trigIdx = i;
          }
        }
      }
      if (trigIdx < 0) {
        const searchFrom = tEnd - windowSec * 3;
        for (let i = 1; i < n; i++) {
          if (times[i] < searchFrom) {
            continue;
          }
          if (volts[i - 1] < level && volts[i] >= level) {
            trigIdx = i;
          }
        }
      }
      if (trigIdx >= 0) {
        tWinStart = times[trigIdx];
      } else {
        tWinStart = tEnd - windowSec;
      }
    } else {
      // 滚动写屏/滚动：窗起点由 availableSpan 与 windowSec 比较决定（见下方 filling）
      tWinStart = tEnd - windowSec;
    }

    if (this.captureMode !== CaptureMode.ROLL) {
      if (tWinStart < tStartAll) {
        tWinStart = tStartAll;
      }
      let tWinEnd = tWinStart + windowSec;
      if (tWinEnd > tEnd) {
        tWinEnd = tEnd;
        tWinStart = Math.max(tStartAll, tWinEnd - windowSec);
      }
      const winT: number[] = [];
      const winV: number[] = [];
      for (let i = 0; i < n; i++) {
        const t = times[i];
        if (t < tWinStart) {
          continue;
        }
        if (t > tWinEnd + 1e-18) {
          break;
        }
        winT.push(t);
        winV.push(volts[i]);
      }
      let useT = winT;
      let useV = winV;
      if (winT.length < 4) {
        const take = Math.min(n, Math.max(64, Math.floor(n * 0.5)));
        useT = times.slice(n - take);
        useV = volts.slice(n - take);
      }
      if (useT.length < 2) {
        return this.makeFlatWave(channel);
      }
      const displaySpan = Math.max(windowSec, 1e-15);
      const coup = channel < this.coupling.length ? this.coupling[channel] : CouplingMode.DC;
      if (coup === CouplingMode.AC) {
        let sum = 0;
        for (let i = 0; i < useV.length; i++) {
          sum += useV[i];
        }
        const mean = sum / useV.length;
        for (let i = 0; i < useV.length; i++) {
          useV[i] = useV[i] - mean;
        }
      } else if (coup === CouplingMode.GND) {
        for (let i = 0; i < useV.length; i++) {
          useV[i] = 0;
        }
      }
      return this.resampleWave(useT, useV, channel, displaySpan);
    }

    // ROLL 两阶段：
    // A) 历史不足一屏 → 左缘对齐首样，迹线从左往右写（右侧暂空）
    // B) 历史已满 → 右缘对齐最新，整屏滚动
    const filling = availableSpan < windowSec - 1e-15;
    const rollStart = filling ? tStartAll : (tEnd - windowSec);
    const rollEnd = filling ? (tStartAll + windowSec) : tEnd;
    const winT: number[] = [];
    const winV: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = times[i];
      if (t < rollStart) {
        continue;
      }
      if (t > tEnd + 1e-18) {
        break;
      }
      winT.push(t);
      winV.push(volts[i]);
    }
    if (winT.length < 2) {
      const take = Math.min(n, Math.max(8, Math.floor(n * 0.25)));
      return this.resampleWaveRoll(times.slice(n - take), volts.slice(n - take),
        channel, windowSec, rollStart, rollEnd, filling);
    }
    const coupR = channel < this.coupling.length ? this.coupling[channel] : CouplingMode.DC;
    if (coupR === CouplingMode.AC) {
      let sum = 0;
      for (let i = 0; i < winV.length; i++) {
        sum += winV[i];
      }
      const mean = sum / winV.length;
      for (let i = 0; i < winV.length; i++) {
        winV[i] = winV[i] - mean;
      }
    } else if (coupR === CouplingMode.GND) {
      for (let i = 0; i < winV.length; i++) {
        winV[i] = 0;
      }
    }
    return this.resampleWaveRoll(winT, winV, channel, windowSec, rollStart, rollEnd, filling);
  }

  private cloneWaveForChannel(src: WaveData, channel: number): WaveData {
    return this.prepareDisplayWave(src, channel);
  }

  private findCachedWave(probeName: string): WaveData | undefined {
    let exact: WaveData | undefined = undefined;
    for (let i = 0; i < this.simulationWaveCache.length; i++) {
      const w = this.simulationWaveCache[i];
      if (this.waveMatchesProbeExact(w, probeName)) {
        exact = w;
        break;
      }
    }
    if (exact !== undefined) {
      return exact;
    }
    // UUID↔NET_4：精确名对不上时，在 live 电压表里找同电位波形，取 Vpp 最大者（避开虚短同电位）
    const probeV = this.lastNodeVoltages.get(probeName);
    if (probeV === undefined) {
      return undefined;
    }
    let best: WaveData | undefined = undefined;
    let bestVpp = -1;
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
      const wv = this.lastNodeVoltages.get(w.netName) ??
        this.lastNodeVoltages.get(w.probeName);
      if (wv === undefined || Math.abs(wv - probeV) > 1e-4) {
        continue;
      }
      let lo = w.voltageAxis[0];
      let hi = w.voltageAxis[0];
      for (let j = 1; j < w.voltageAxis.length; j++) {
        if (w.voltageAxis[j] < lo) {
          lo = w.voltageAxis[j];
        }
        if (w.voltageAxis[j] > hi) {
          hi = w.voltageAxis[j];
        }
      }
      const vpp = hi - lo;
      if (vpp > bestVpp) {
        bestVpp = vpp;
        best = w;
      }
    }
    return best;
  }

  private waveMatchesProbe(wave: WaveData, probeName: string): boolean {
    return this.waveMatchesProbeExact(wave, probeName);
  }

  private waveMatchesProbeExact(wave: WaveData, probeName: string): boolean {
    if (probeName.length === 0) {
      return false;
    }
    if (wave.probeName === probeName || wave.netName === probeName) {
      return true;
    }
    const upperProbe = probeName.toUpperCase();
    const upperWProbe = wave.probeName.toUpperCase();
    const upperWNet = wave.netName.toUpperCase();
    if (upperWProbe === upperProbe || upperWNet === upperProbe) {
      return true;
    }
    return false;
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

  private static waveSpanSec(wave: WaveData): number {
    const n = Math.min(wave.timeAxis.length, wave.voltageAxis.length);
    if (n < 2) {
      return 0;
    }
    return Math.max(wave.timeAxis[n - 1] - wave.timeAxis[0], 0);
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

    // Export the full ring — prepareDisplayWave chooses a ≥1–2 period window
    let hasLast = false;
    let lastGood = 0;
    for (const snap of this.historyBuffer) {
      if (snap.voltages.has(probeName)) {
        lastGood = snap.voltages.get(probeName) as number;
        hasLast = true;
        timeAxis.push(snap.time);
        voltageAxis.push(lastGood);
      } else if (hasLast) {
        timeAxis.push(snap.time);
        voltageAxis.push(lastGood);
      }
    }

    if (timeAxis.length < 2) {
      return this.makeFlatWave(channel);
    }

    const span = Math.max(timeAxis[timeAxis.length - 1] - timeAxis[0], 1e-15);
    return {
      waveId: IdUtil.generate('osc'),
      probeName: `CH${channel + 1}`,
      netName: probeName,
      timeAxis: timeAxis,
      voltageAxis: voltageAxis,
      currentAxis: new Array(timeAxis.length).fill(0),
      sampleRate: timeAxis.length / span,
      waveType: 'voltage',
      holdTime: span
    };
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

  /** 无探针 / 无示波器：空波形，UI 显示 NO SIGNAL */
  private makeEmptyWave(channel: number): WaveData {
    return {
      waveId: IdUtil.generate('osc'),
      probeName: `CH${channel + 1}`,
      netName: '',
      timeAxis: [],
      voltageAxis: [],
      currentAxis: [],
      sampleRate: 1,
      waveType: 'voltage',
      holdTime: 0
    };
  }

  /** Build flat (DC-level) waveform from current node voltage state */
  private makeFlatWave(channel: number): WaveData {
    const dt = getTimebaseSec(this.timebase);
    const windowSec = dt * DIVISIONS;
    const sampleRate = SAMPLE_POINTS / windowSec;
    const timeAxis: number[] = [];
    const voltageAxis: number[] = [];
    const probeName = channel < this.channelProbes.length ? this.channelProbes[channel] : '';
    if (probeName.length === 0) {
      return this.makeEmptyWave(channel);
    }

    // Use actual DC voltage from simulation if available
    let dcLevel = 0;
    dcLevel = this.resolveVoltage(probeName, this.lastNodeVoltages);
    if (Math.abs(dcLevel) < 1e-12) {
      const cached = this.findCachedWave(probeName);
      if (cached !== undefined && cached.voltageAxis.length > 0) {
        dcLevel = cached.voltageAxis[cached.voltageAxis.length - 1];
      }
    }

    for (let i = 0; i < SAMPLE_POINTS; i++) {
      timeAxis.push((i / SAMPLE_POINTS) * windowSec);
      voltageAxis.push(dcLevel);
    }

    return {
      waveId: IdUtil.generate('osc'),
      probeName: `CH${channel + 1}`,
      netName: probeName,
      timeAxis,
      voltageAxis,
      currentAxis: new Array(SAMPLE_POINTS).fill(0),
      sampleRate,
      waveType: 'voltage',
      holdTime: windowSec
    };
  }

  /**
   * 滚动重采样：时间轴覆盖完整 [rollStart, rollStart+windowSec]。
   * - filling=true（写屏阶段）：右侧尚未到达的时刻 hold 末样（禁止 NaN — 会把 UI 打成 last=NaNV / 空迹线）
   * - filling=false（滚动阶段）：窗内应有满历史，边界外 hold（不再左侧 NaN 留黑）
   */
  private resampleWaveRoll(timeAxis: number[], voltageAxis: number[],
    channel: number, windowSec: number, rollStart: number, _rollEnd: number,
    filling: boolean = false): WaveData {
    const cleaned = OscilloscopeEngine.despikeSeries(voltageAxis);
    const span = Math.max(windowSec, 1e-15);
    const sampleRate = SAMPLE_POINTS / span;
    const outTime: number[] = [];
    const rawOut: number[] = [];
    const n = Math.min(timeAxis.length, cleaned.length);
    if (n < 1) {
      return this.makeEmptyWave(channel);
    }
    const tData0 = timeAxis[0];
    const tDataN = timeAxis[n - 1];
    let j = 1;
    for (let i = 0; i < SAMPLE_POINTS; i++) {
      const fracI = SAMPLE_POINTS > 1 ? i / (SAMPLE_POINTS - 1) : 0;
      const tUse = rollStart + fracI * span;
      outTime.push(tUse);
      // 写屏阶段：右侧 hold 末样，迹线从左往右“写满”而不是半屏黑洞
      if (filling && tUse > tDataN + 1e-15) {
        rawOut.push(cleaned[n - 1]);
        continue;
      }
      if (!filling && tUse < tData0 - 1e-15) {
        // 极端短缓冲兜底：贴齐首样，避免再出现半屏黑
        rawOut.push(cleaned[0]);
        continue;
      }
      let vi = cleaned[n - 1];
      if (tUse <= tData0) {
        vi = cleaned[0];
      } else if (tUse >= tDataN) {
        vi = cleaned[n - 1];
      } else {
        while (j < n && timeAxis[j] < tUse) {
          j++;
        }
        if (j >= n) {
          vi = cleaned[n - 1];
        } else if (j <= 1) {
          const dtr = Math.max(timeAxis[1] - timeAxis[0], 1e-15);
          const frac = (tUse - timeAxis[0]) / dtr;
          vi = cleaned[0] + frac * (cleaned[1] - cleaned[0]);
        } else {
          const jm = j - 1;
          const dtr = Math.max(timeAxis[j] - timeAxis[jm], 1e-15);
          const frac = (tUse - timeAxis[jm]) / dtr;
          vi = cleaned[jm] + frac * (cleaned[j] - cleaned[jm]);
        }
      }
      rawOut.push(vi);
    }
    // 轻度三点平滑（全部为有限值时）
    const outVoltage: number[] = rawOut.slice();
    for (let i = 1; i < outVoltage.length - 1; i++) {
      const a = rawOut[i - 1];
      const b = rawOut[i];
      const c = rawOut[i + 1];
      if (Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c)) {
        outVoltage[i] = (a + b + c) / 3;
      }
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

  private resampleWave(timeAxis: number[], voltageAxis: number[],
                       channel: number, windowSec: number): WaveData {
    const cleaned = OscilloscopeEngine.despikeSeries(voltageAxis);
    const t0 = timeAxis[0];
    const tLast = timeAxis[timeAxis.length - 1];
    // Display span follows timebase window; hold last sample past end of data
    const span = Math.max(windowSec, 1e-15);
    const sampleRate = SAMPLE_POINTS / span;
    const outTime: number[] = [];
    const rawOut: number[] = [];
    const n = timeAxis.length;

    let j = 1;
    for (let i = 0; i < SAMPLE_POINTS; i++) {
      const fracI = SAMPLE_POINTS > 1 ? i / (SAMPLE_POINTS - 1) : 0;
      const tUse = t0 + fracI * span;
      outTime.push(fracI * span);
      let vi = cleaned[n - 1];
      if (tUse <= timeAxis[0]) {
        vi = cleaned[0];
      } else if (tUse >= tLast) {
        vi = cleaned[n - 1];
      } else {
        while (j < n && timeAxis[j] < tUse) {
          j++;
        }
        if (j >= n) {
          vi = cleaned[n - 1];
        } else if (j <= 1) {
          const dtr = Math.max(timeAxis[1] - timeAxis[0], 1e-15);
          const frac = (tUse - timeAxis[0]) / dtr;
          vi = cleaned[0] + frac * (cleaned[1] - cleaned[0]);
        } else {
          const jm = j - 1;
          const dtr = Math.max(timeAxis[j] - timeAxis[jm], 1e-15);
          const frac = (tUse - timeAxis[jm]) / dtr;
          vi = cleaned[jm] + frac * (cleaned[j] - cleaned[jm]);
        }
      }
      if (!(vi === vi) || !Number.isFinite(vi)) {
        vi = cleaned[n - 1];
      }
      rawOut.push(vi);
    }

    const outVoltage = OscilloscopeEngine.smoothSeries(rawOut, 3);
    for (let i = 0; i < outVoltage.length; i++) {
      if (!(outVoltage[i] === outVoltage[i]) || !Number.isFinite(outVoltage[i])) {
        outVoltage[i] = rawOut[i];
      }
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

  /** Catmull-Rom (uniform) between y1→y2, frac in [0,1] — kept for SVG export */
  private static hermiteInterp(y0: number, y1: number, y2: number, y3: number, frac: number): number {
    const t = Math.max(0, Math.min(1, frac));
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * ((2 * y1) + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 +
      (-y0 + 3 * y1 - 3 * y2 + y3) * t3);
  }

  /** 3-point median despike — kills single-sample Newton/glitch spikes */
  private static despikeSeries(src: number[]): number[] {
    const n = src.length;
    if (n < 3) {
      return src.slice();
    }
    let lo = src[0];
    let hi = src[0];
    for (let i = 1; i < n; i++) {
      if (src[i] < lo) {
        lo = src[i];
      }
      if (src[i] > hi) {
        hi = src[i];
      }
    }
    const span = Math.max(hi - lo, 1e-6);
    const thr = span * 0.35;
    const out = src.slice();
    for (let i = 1; i < n - 1; i++) {
      const a = src[i - 1];
      const b = src[i];
      const c = src[i + 1];
      const med = OscilloscopeEngine.median3(a, b, c);
      if (Math.abs(b - med) > thr && Math.abs(b - a) > thr && Math.abs(b - c) > thr) {
        out[i] = med;
      }
    }
    return out;
  }

  private static median3(a: number, b: number, c: number): number {
    if (a > b) {
      const t = a;
      a = b;
      b = t;
    }
    if (b > c) {
      const t = b;
      b = c;
      c = t;
    }
    if (a > b) {
      const t = a;
      a = b;
      b = t;
    }
    return b;
  }

  /** Hann-window moving average (odd tap count) */
  private static smoothSeries(src: number[], taps: number): number[] {
    const n = src.length;
    if (n < 3) {
      return src.slice();
    }
    let k = taps | 1;
    if (k < 3) {
      k = 3;
    }
    if (k > n) {
      k = (n % 2 === 1) ? n : n - 1;
    }
    if (k < 3) {
      return src.slice();
    }
    const half = Math.floor(k / 2);
    const weights: number[] = [];
    let wSum = 0;
    for (let i = 0; i < k; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (k - 1));
      weights.push(w);
      wSum += w;
    }
    const out: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      let acc = 0;
      let ww = 0;
      for (let t = -half; t <= half; t++) {
        const idx = i + t;
        if (idx < 0 || idx >= n) {
          continue;
        }
        const w = weights[t + half];
        acc += src[idx] * w;
        ww += w;
      }
      out[i] = ww > 0 ? acc / ww : src[i];
    }
    return out;
  }

  private static estimateFreqLocal(times: number[], volts: number[],
    fromIdx: number, toIdx: number): number {
    const start = Math.max(0, fromIdx);
    const end = Math.min(volts.length, toIdx);
    if (end - start < 8) {
      return 0;
    }
    let minV = volts[start];
    let maxV = volts[start];
    for (let i = start + 1; i < end; i++) {
      if (volts[i] < minV) {
        minV = volts[i];
      }
      if (volts[i] > maxV) {
        maxV = volts[i];
      }
    }
    if (maxV - minV < 1e-4) {
      return 0;
    }
    const thr = (maxV + minV) / 2;
    let crossings = 0;
    let first = -1;
    let last = -1;
    for (let i = start + 1; i < end; i++) {
      if (volts[i - 1] < thr && volts[i] >= thr) {
        if (first < 0) {
          first = times[i];
        }
        last = times[i];
        crossings++;
      }
    }
    if (crossings < 2 || first < 0 || last <= first) {
      return 0;
    }
    const period = (last - first) / (crossings - 1);
    return period > 0 ? 1.0 / period : 0;
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
    const estFreq = OscilloscopeEngine.estimateFreqLocal(
      wave.timeAxis, wave.voltageAxis, 0, len);
    let freq = estFreq;
    if (freq <= 0) {
      let crossings = 0;
      let firstCross = -1;
      const mid = (minV + maxV) / 2;
      for (let i = 1; i < len; i++) {
        if (wave.voltageAxis[i - 1] <= mid && wave.voltageAxis[i] > mid) {
          if (firstCross < 0) {
            firstCross = i;
          } else {
            crossings++;
          }
        }
      }
      if (crossings > 0 && firstCross >= 0) {
        const lastCrossIdx = len - 1;
        const period = (wave.timeAxis[lastCrossIdx] - wave.timeAxis[firstCross]) / crossings;
        freq = period > 0 ? 1 / period : 0;
      }
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
    // 限长：朴素 DFT 为 O(n²)，示波器实时刷新时过长会卡死「点了没反应」
    const maxN = 512;
    // 时域可能含写屏 NaN：只取有限样点，否则频谱全 NaN、画面空白
    const cleanV: number[] = [];
    const cleanT: number[] = [];
    const srcN = Math.min(wave.voltageAxis.length, wave.timeAxis.length);
    for (let i = 0; i < srcN; i++) {
      const v = wave.voltageAxis[i];
      const t = wave.timeAxis[i];
      if (Number.isFinite(v) && Number.isFinite(t)) {
        cleanV.push(v);
        cleanT.push(t);
      }
    }
    if (cleanV.length < 2) {
      // 回退：忽略时间轴，只过滤电压
      for (let i = 0; i < wave.voltageAxis.length; i++) {
        const v = wave.voltageAxis[i];
        if (Number.isFinite(v)) {
          cleanV.push(v);
        }
      }
    }
    let voltageAxis = cleanV;
    let sampleRate = wave.sampleRate > 0 ? wave.sampleRate : 0;
    if (voltageAxis.length > maxN) {
      const step = Math.ceil(voltageAxis.length / maxN);
      const trimmed: number[] = [];
      for (let i = 0; i < voltageAxis.length; i += step) {
        trimmed.push(voltageAxis[i]);
      }
      voltageAxis = trimmed;
      sampleRate = sampleRate / step;
    }
    // 无 sampleRate 时用时轴估频率轴（Hz）
    if (sampleRate <= 0 && cleanT.length >= 2) {
      const t0 = cleanT[0];
      const t1 = cleanT[cleanT.length - 1];
      const span = Math.abs(t1 - t0);
      if (span > 0 && voltageAxis.length > 1) {
        sampleRate = (voltageAxis.length - 1) / span;
      }
    }
    if (sampleRate <= 0 && wave.timeAxis.length >= 2) {
      const t0 = wave.timeAxis[0];
      const t1 = wave.timeAxis[wave.timeAxis.length - 1];
      const span = Math.abs(t1 - t0);
      if (span > 0 && voltageAxis.length > 1) {
        sampleRate = (voltageAxis.length - 1) / span;
      }
    }
    if (sampleRate <= 0) {
      sampleRate = 1;
    }
    if (voltageAxis.length < 2) {
      return {
        waveId: IdUtil.generate('fft'),
        probeName: `FFT(${wave.netName.length > 0 ? wave.netName : wave.probeName})`,
        netName: 'MATH_FFT',
        timeAxis: [0, 1],
        voltageAxis: [0, 0],
        currentAxis: [0, 0],
        sampleRate: 1,
        waveType: 'freq',
        holdTime: 1
      };
    }

    const n = voltageAxis.length;
    const half = Math.floor(n / 2);
    const freqAxis: number[] = [];
    const magAxis: number[] = [];

    for (let k = 0; k < half; k++) {
      let re = 0; let im = 0;
      for (let i = 0; i < n; i++) {
        const angle = -2 * Math.PI * k * i / n;
        const vi = voltageAxis[i];
        const v = Number.isFinite(vi) ? vi : 0;
        re += v * Math.cos(angle);
        im += v * Math.sin(angle);
      }
      let mag = Math.sqrt(re * re + im * im) / n;
      if (!(mag === mag) || !Number.isFinite(mag)) {
        mag = 0;
      }
      if (this.fftLogScale && mag > 0) {
        mag = 20 * Math.log10(Math.max(mag, 1e-12));
      }
      freqAxis.push(k * sampleRate / n);
      magAxis.push(mag);
    }
    // Canvas 要求 ≥2 点；极短序列补齐 Nyquist 端点
    if (freqAxis.length < 2) {
      freqAxis.push(0, Math.max(sampleRate / 2, 1));
      magAxis.push(magAxis.length > 0 ? magAxis[0] : 0, 0);
    }

    return {
      waveId: IdUtil.generate('fft'),
      probeName: `FFT(${wave.netName.length > 0 ? wave.netName : wave.probeName})`,
      netName: 'MATH_FFT',
      timeAxis: freqAxis,
      voltageAxis: magAxis,
      currentAxis: new Array(magAxis.length).fill(0),
      sampleRate: sampleRate / Math.max(n, 1),
      waveType: 'freq',
      holdTime: sampleRate / 2
    };
  }
}
