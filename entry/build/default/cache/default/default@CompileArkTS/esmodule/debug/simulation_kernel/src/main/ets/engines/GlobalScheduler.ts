import { LogicState, copyNumberMap } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SimulationConfig, McuRegisterSnapshot, SimulationResult } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { DigitalEngine } from './DigitalEngine';
import type { AnalogEngine } from './AnalogEngine';
import { SpiceRunner } from "@bundle:com.elecdraw.aischsim/entry@simulation_kernel/ets/engines/SpiceRunner";
export interface SchedulerStepResult {
    time: number;
    analogSignals: Map<string, number>;
    digitalStates: Map<string, LogicState>;
    mcuSnapshot: McuRegisterSnapshot | null;
    stepSize: number;
    converged: boolean;
}
const MIN_STEP_SIZE = 1e-12; // 1 ps absolute minimum
/** Analog floor — below this VAC@1kHz barely moves and UI looks frozen */
const MIN_ANALOG_STEP = 1e-8; // 10 ns
const MAX_STEP_GROWTH = 2.0; // Max step doubling per successful step
const MAX_STEP_SHRINK = 4.0; // Max step reduction per failed step
const CONVERGENCE_MAX_RETRIES = 3;
const VOLTAGE_DELTA_RAPID = 0.5; // V — shrink step when any node changes this fast
const VOLTAGE_DELTA_STEADY = 0.02; // V — grow step when all nodes change slower than this
const STEADY_GROW_COUNT = 8; // Consecutive steady steps before growing
const FAIL_STREAK_RESET = 6; // After N soft-fails, accept iterate + restore step size
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
    private analogMinStep(): number {
        return Math.max(MIN_ANALOG_STEP, Math.min(this.config.stepSize, this.config.maxStep));
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
        // Calculate how many MCU cycles fit in this analog step
        this.mcuCycleAccum += dt / this.mcuClockPeriod;
        this.mcuTicksPerStep = Math.max(1, Math.floor(this.mcuCycleAccum));
        this.mcuCycleAccum -= this.mcuTicksPerStep;
        // Sync time: use the later of analog time and MCU time
        const mcuTime = this.stepCount * this.mcuClockPeriod * this.mcuTicksPerStep;
        const syncTime = Math.max(this.globalTime, mcuTime);
        // Evaluate digital logic first (inputs to analog)
        const digitalStates = this.digitalEngine.processEvents(syncTime);
        // Run analog with convergence retry
        let spiceResult = this.spiceRunner.runWithConvergenceRetry(syncTime, dt);
        let converged = spiceResult.converged;
        if (!converged) {
            this.convergenceRetries++;
            let retryDt = dt;
            for (let retry = 0; retry < CONVERGENCE_MAX_RETRIES && !converged; retry++) {
                retryDt = Math.max(retryDt / 2, this.analogMinStep());
                this.globalTime -= dt - retryDt;
                spiceResult = this.spiceRunner.runWithConvergenceRetry(this.globalTime, retryDt);
                converged = spiceResult.converged;
            }
            if (!converged) {
                // Keep last Newton iterate; do not roll time backwards
                this.globalTime = syncTime;
                this.failStreak++;
                // Soft-accept after a streak so VAC/time keep advancing (lab amp near rail)
                if (this.failStreak >= FAIL_STREAK_RESET) {
                    converged = true;
                    this.failStreak = 0;
                    this.currentStepSize = Math.min(Math.max(this.currentStepSize * 2, this.analogMinStep()), this.config.maxStep);
                }
            }
        }
        if (converged) {
            this.convergenceRetries = 0;
            if (this.failStreak > 0 && this.failStreak < FAIL_STREAK_RESET) {
                this.failStreak = 0;
            }
            this.adaptStepSize(spiceResult.nodeVoltages);
        }
        else {
            this.currentStepSize = Math.max(this.currentStepSize / MAX_STEP_SHRINK, this.analogMinStep());
            this.steadyStepCounter = 0;
        }
        const registers = copyNumberMap(mcuRegs);
        registers.set('PC', mcuPc);
        const pinStates = new Map<string, number>();
        digitalStates.forEach((state: LogicState, pinId: string) => {
            if (state === LogicState.HIGH)
                pinStates.set(pinId, 1);
            else if (state === LogicState.LOW)
                pinStates.set(pinId, 0);
            else
                pinStates.set(pinId, -1);
        });
        const mcuSnapshot: McuRegisterSnapshot = {
            timestamp: syncTime,
            registers: registers,
            memory: new Uint8Array(0),
            pinStates: pinStates
        };
        return {
            time: syncTime,
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
            if (prev !== undefined) {
                hasReference = true;
                const delta = Math.abs(v - prev);
                if (delta > maxDelta)
                    maxDelta = delta;
            }
            this.lastVoltageSnapshot.set(node, v);
        });
        if (!hasReference)
            return;
        if (maxDelta > VOLTAGE_DELTA_RAPID) {
            this.currentStepSize = Math.max(this.currentStepSize / 4, this.analogMinStep());
            this.steadyStepCounter = 0;
        }
        else if (maxDelta < VOLTAGE_DELTA_STEADY) {
            this.steadyStepCounter++;
            if (this.steadyStepCounter >= STEADY_GROW_COUNT) {
                this.currentStepSize = Math.min(this.currentStepSize * MAX_STEP_GROWTH, this.config.maxStep);
                this.steadyStepCounter = 0;
            }
        }
        else {
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
    }
    isFinished(): boolean {
        return this.globalTime >= this.config.stopTime;
    }
}
