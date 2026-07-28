/**
 * 全局时序调度器 — 自适应步长 + 收敛重试 + 混合信号同步
 * v2.1: 可配置步长控制, MCU/模拟/数字精确同步, 改进收敛回退
 */
import { SimulationConfig, LogicState, McuRegisterSnapshot, SimulationResult, copyNumberMap } from 'common';
import { DigitalEngine } from './DigitalEngine';
import { AnalogEngine } from './AnalogEngine';
import { SpiceRunner } from './SpiceRunner';

export interface SchedulerStepResult {
  time: number;
  analogSignals: Map<string, number>;
  digitalStates: Map<string, LogicState>;
  mcuSnapshot: McuRegisterSnapshot | null;
  stepSize: number;
  converged: boolean;
}

const MIN_STEP_SIZE = 1e-12;     // 1 ps absolute minimum
/** Analog floor — below this VAC@1kHz barely moves and UI looks frozen */
const MIN_ANALOG_STEP = 1e-8;    // 10 ns
const MAX_STEP_GROWTH = 2.0;     // Max step doubling per successful step
const MAX_STEP_SHRINK = 4.0;     // Max step reduction per failed step
const CONVERGENCE_MAX_RETRIES = 3;
const VOLTAGE_DELTA_RAPID = 0.5;  // V — shrink step when any node changes this fast
const VOLTAGE_DELTA_STEADY = 0.02; // V — grow step when all nodes change slower than this
const STEADY_GROW_COUNT = 8;       // Consecutive steady steps before growing
const FAIL_STREAK_RESET = 6;       // After N soft-fails, accept iterate + restore step size

export class GlobalScheduler {
  private config: SimulationConfig;
  private digitalEngine: DigitalEngine;
  private spiceRunner: SpiceRunner;
  private globalTime: number = 0;
  private currentStepSize: number;
  private mcuClockPeriod: number;
  private stepCount: number = 0;
  private lastVoltageSnapshot: Map<string, number> = new Map();
  private convergenceRetries: number = 0;
  private steadyStepCounter: number = 0;
  private failStreak: number = 0;
  private mcuCycleAccum: number = 0;
  private mcuTicksPerStep: number = 1;
  /** Optional tighter/looser cap (e.g. AC scope: ~1/40 period). Infinity = use config only. */
  private maxStepCap: number = Number.POSITIVE_INFINITY;
  /**
   * Optional floor above MIN_ANALOG_STEP. Without this, op-amp rail snaps shrink dt to 10ns
   * and VAC/SIGGEN half-periods never arrive → scope CH stuck flat (Vpp=0) while UI still ticks.
   */
  private minStepFloor: number = 0;
  /**
   * Nodes excluded from ΔV step-size control (ideal VSRC/SIGGEN). Square edges are
   * intentional 2·amp jumps — counting them as RAPID collapses dt every half-cycle.
   */
  private adaptiveIgnoreNodes: Set<string> = new Set();
  /** Last emitted step time — wave/history timestamps must never go backwards. */
  private lastEmittedTime: number = Number.NEGATIVE_INFINITY;

  private analogMinStep(): number {
    const base = Math.max(MIN_ANALOG_STEP, Math.min(this.config.stepSize, this.effectiveMaxStep()));
    if (this.minStepFloor > 0) {
      // Floor must not exceed the active max cap (else every step hits the ceiling).
      return Math.max(base, Math.min(this.minStepFloor, this.effectiveMaxStep()));
    }
    return base;
  }

  private effectiveMaxStep(): number {
    // AC scope override may be larger than config.maxStep (often 1µs) — that is intentional
    if (this.maxStepCap > 0 && this.maxStepCap < Number.POSITIVE_INFINITY) {
      return this.maxStepCap;
    }
    return this.config.maxStep;
  }

  /** Cap adaptive dt (pass <=0 to clear). Keeps VAC@1kHz from needing 10k × 1µs steps/frame. */
  setMaxStepCap(cap: number): void {
    this.maxStepCap = cap > 0 ? cap : Number.POSITIVE_INFINITY;
  }

  /** Raise analog dt floor (pass <=0 to clear). Used with AC / RC so time keeps advancing. */
  setMinStepFloor(floor: number): void {
    this.minStepFloor = floor > 0 ? floor : 0;
  }

  /** Ideal source nodes whose ΔV must not shrink adaptive dt (pass empty to clear). */
  setAdaptiveIgnoreNodes(nodes: string[]): void {
    this.adaptiveIgnoreNodes.clear();
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.length > 0) {
        this.adaptiveIgnoreNodes.add(n);
      }
    }
  }

  constructor(config: SimulationConfig, digital: DigitalEngine, analog: AnalogEngine) {
    this.config = config;
    this.digitalEngine = digital;
    this.spiceRunner = new SpiceRunner(analog);
    this.spiceRunner.init();
    this.currentStepSize = Math.max(config.stepSize, this.analogMinStep());
    this.globalTime = config.startTime;
    const mcuHz = config.mcuClockHz ?? 11059200;
    this.mcuClockPeriod = 1.0 / mcuHz;
  }

  step(mcuPc: number, mcuRegs: Map<string, number>): SchedulerStepResult {
    const dt = this.currentStepSize;
    this.globalTime += dt;
    this.stepCount++;

    // Calculate how many MCU cycles fit in this analog step (for MCU tick batching only)
    this.mcuCycleAccum += dt / this.mcuClockPeriod;
    this.mcuTicksPerStep = Math.max(1, Math.floor(this.mcuCycleAccum));
    this.mcuCycleAccum -= this.mcuTicksPerStep;

    // Analog globalTime is the sole clock for waves/instruments.
    // Do NOT use stepCount*period*ticks — that quantity jumps when ticks change and
    // made syncTime go backwards after long runs (scope waveform "scrambles").
    let syncTime = this.globalTime;
    if (syncTime <= this.lastEmittedTime) {
      syncTime = this.lastEmittedTime + Math.max(dt * 0.01, 1e-15);
      this.globalTime = syncTime;
    }

    // Evaluate digital logic first (inputs to analog)
    const digitalStates = this.digitalEngine.processEvents(syncTime);

    // Run analog with convergence retry
    let spiceResult = this.spiceRunner.runWithConvergenceRetry(syncTime, dt);
    let converged = spiceResult.converged;
    let resultTime = syncTime;

    if (!converged) {
      this.convergenceRetries++;
      let retryDt = dt;
      for (let retry = 0; retry < CONVERGENCE_MAX_RETRIES && !converged; retry++) {
        retryDt = Math.max(retryDt / 2, this.analogMinStep());
        this.globalTime -= dt - retryDt;
        spiceResult = this.spiceRunner.runWithConvergenceRetry(this.globalTime, retryDt);
        converged = spiceResult.converged;
        if (converged) {
          resultTime = Math.max(this.globalTime, this.lastEmittedTime + 1e-18);
          this.globalTime = resultTime;
        }
      }
      if (!converged) {
        // Keep last Newton iterate; do not roll emitted time backwards
        this.globalTime = Math.max(syncTime, this.lastEmittedTime + 1e-18);
        resultTime = this.globalTime;
        this.failStreak++;
        // Soft-accept after a streak so VAC/time keep advancing (lab amp near rail)
        if (this.failStreak >= FAIL_STREAK_RESET) {
          converged = true;
          this.failStreak = 0;
          this.currentStepSize = Math.min(
            Math.max(this.currentStepSize * 2, this.analogMinStep()),
            this.effectiveMaxStep());
        }
      }
    }

    if (converged) {
      this.convergenceRetries = 0;
      if (this.failStreak > 0 && this.failStreak < FAIL_STREAK_RESET) {
        this.failStreak = 0;
      }
      this.adaptStepSize(spiceResult.nodeVoltages);
    } else {
      this.currentStepSize = Math.max(this.currentStepSize / MAX_STEP_SHRINK, this.analogMinStep());
      this.steadyStepCounter = 0;
    }

    this.lastEmittedTime = resultTime;

    const registers = copyNumberMap(mcuRegs);
    registers.set('PC', mcuPc);

    const pinStates = new Map<string, number>();
    digitalStates.forEach((state: LogicState, pinId: string) => {
      if (state === LogicState.HIGH) pinStates.set(pinId, 1);
      else if (state === LogicState.LOW) pinStates.set(pinId, 0);
      else pinStates.set(pinId, -1);
    });

    const mcuSnapshot: McuRegisterSnapshot = {
      timestamp: resultTime,
      registers: registers,
      memory: new Uint8Array(0),
      pinStates: pinStates
    };

    return {
      time: resultTime,
      analogSignals: spiceResult.nodeVoltages,
      digitalStates: digitalStates,
      mcuSnapshot: mcuSnapshot,
      stepSize: this.currentStepSize,
      converged: converged
    };
  }

  private adaptStepSize(voltages: Map<string, number>): void {
    let maxDelta = 0;
    let hasReference = false;
    voltages.forEach((v: number, node: string) => {
      const prev = this.lastVoltageSnapshot.get(node);
      const ignore = this.adaptiveIgnoreNodes.has(node);
      if (prev !== undefined && !ignore) {
        hasReference = true;
        const delta = Math.abs(v - prev);
        if (delta > maxDelta) maxDelta = delta;
      }
      this.lastVoltageSnapshot.set(node, v);
    });

    if (!hasReference) return;

    if (maxDelta > VOLTAGE_DELTA_RAPID) {
      // Softer shrink (÷2): rail snaps / differentiator spikes must not pin dt at floor
      this.currentStepSize = Math.max(this.currentStepSize / 2, this.analogMinStep());
      this.steadyStepCounter = 0;
    } else if (maxDelta < VOLTAGE_DELTA_STEADY) {
      this.steadyStepCounter++;
      if (this.steadyStepCounter >= STEADY_GROW_COUNT) {
        this.currentStepSize = Math.min(this.currentStepSize * MAX_STEP_GROWTH, this.effectiveMaxStep());
        this.steadyStepCounter = 0;
      }
    } else {
      this.steadyStepCounter = 0;
    }
  }

  getMcuTicksPerStep(): number {
    return this.mcuTicksPerStep;
  }

  restoreFromResult(result: SimulationResult, timeIndex: number): void {
    if (timeIndex >= 0 && timeIndex < result.time.length) {
      this.globalTime = result.time[timeIndex];
      result.signals.forEach((series: number[], name: string) => {
        if (timeIndex < series.length) {
          this.lastVoltageSnapshot.set(name, series[timeIndex]);
        }
      });
    }
  }

  getGlobalTime(): number { return this.globalTime; }
  getCurrentStepSize(): number { return this.currentStepSize; }

  /** Jump adaptive dt toward a target (e.g. AC-friendly 1/40 period) without exceeding cap. */
  bumpStepToward(target: number): void {
    if (!(target > 0)) {
      return;
    }
    const capped = Math.min(target, this.effectiveMaxStep());
    if (capped > this.currentStepSize) {
      this.currentStepSize = capped;
    }
  }

  reset(): void {
    this.globalTime = this.config.startTime;
    this.currentStepSize = Math.max(this.config.stepSize, this.analogMinStep());
    this.stepCount = 0;
    this.lastVoltageSnapshot.clear();
    this.convergenceRetries = 0;
    this.steadyStepCounter = 0;
    this.failStreak = 0;
    this.mcuCycleAccum = 0;
    this.mcuTicksPerStep = 1;
    this.lastEmittedTime = Number.NEGATIVE_INFINITY;
    this.minStepFloor = 0;
    this.maxStepCap = Number.POSITIVE_INFINITY;
    this.adaptiveIgnoreNodes.clear();
  }

  /** Slide interactive stop horizon so continuous scope runs never hit isFinished(). */
  extendStopTime(extraSec: number): void {
    if (!(extraSec > 0)) {
      return;
    }
    this.config.stopTime = Math.max(this.config.stopTime, this.globalTime) + extraSec;
  }

  isFinished(): boolean {
    return this.globalTime >= this.config.stopTime;
  }
}
