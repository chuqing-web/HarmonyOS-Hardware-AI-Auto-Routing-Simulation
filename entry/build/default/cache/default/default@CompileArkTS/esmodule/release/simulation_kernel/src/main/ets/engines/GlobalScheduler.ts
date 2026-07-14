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
const MIN_STEP_SIZE = 1e-12;
const MAX_STEP_GROWTH = 2.0;
const MAX_STEP_SHRINK = 8.0;
const CONVERGENCE_MAX_RETRIES = 5;
const VOLTAGE_DELTA_RAPID = 0.5;
const VOLTAGE_DELTA_STEADY = 0.02;
const STEADY_GROW_COUNT = 8;
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
    private mcuCycleAccum: number = 0;
    private mcuTicksPerStep: number = 1;
    constructor(v470: SimulationConfig, w470: DigitalEngine, x470: AnalogEngine) {
        this.config = v470;
        this.digitalEngine = w470;
        this.spiceRunner = new SpiceRunner(x470);
        this.spiceRunner.init();
        this.currentStepSize = v470.stepSize;
        this.globalTime = v470.startTime;
        const y470 = v470.mcuClockHz ?? 11059200;
        this.mcuClockPeriod = 1.0 / y470;
    }
    step(g470: number, h470: Map<string, number>): SchedulerStepResult {
        const i470 = this.currentStepSize;
        this.globalTime += i470;
        this.stepCount++;
        this.mcuCycleAccum += i470 / this.mcuClockPeriod;
        this.mcuTicksPerStep = Math.max(1, Math.floor(this.mcuCycleAccum));
        this.mcuCycleAccum -= this.mcuTicksPerStep;
        const j470 = this.stepCount * this.mcuClockPeriod * this.mcuTicksPerStep;
        const k470 = Math.max(this.globalTime, j470);
        const l470 = this.digitalEngine.processEvents(k470);
        let m470 = this.spiceRunner.runWithConvergenceRetry(k470, i470);
        let n470 = m470.converged;
        if (!n470) {
            this.convergenceRetries++;
            let t470 = i470;
            for (let u470 = 0; u470 < CONVERGENCE_MAX_RETRIES && !n470; u470++) {
                t470 = Math.max(t470 / 2, MIN_STEP_SIZE);
                this.globalTime -= i470 - t470;
                m470 = this.spiceRunner.runWithConvergenceRetry(this.globalTime, t470);
                n470 = m470.converged;
                if (n470) {
                    this.globalTime = this.globalTime;
                }
            }
            if (!n470) {
                this.globalTime = k470;
                m470.nodeVoltages = new Map(this.lastVoltageSnapshot);
                m470.branchCurrents = new Map();
            }
        }
        if (n470) {
            this.convergenceRetries = 0;
            this.adaptStepSize(m470.nodeVoltages);
        }
        else {
            this.currentStepSize = Math.max(this.currentStepSize / MAX_STEP_SHRINK, MIN_STEP_SIZE);
            this.steadyStepCounter = 0;
        }
        const o470 = copyNumberMap(h470);
        o470.set('PC', g470);
        const p470 = new Map<string, number>();
        l470.forEach((r470: LogicState, s470: string) => {
            if (r470 === LogicState.HIGH)
                p470.set(s470, 1);
            else if (r470 === LogicState.LOW)
                p470.set(s470, 0);
            else
                p470.set(s470, -1);
        });
        const q470: McuRegisterSnapshot = {
            timestamp: k470,
            registers: o470,
            memory: new Uint8Array(0),
            pinStates: p470
        };
        return {
            time: k470,
            analogSignals: m470.nodeVoltages,
            digitalStates: l470,
            mcuSnapshot: q470,
            stepSize: this.currentStepSize,
            converged: n470
        };
    }
    private adaptStepSize(z469: Map<string, number>): void {
        let a470 = 0;
        let b470 = false;
        z469.forEach((c470: number, d470: string) => {
            const e470 = this.lastVoltageSnapshot.get(d470);
            if (e470 !== undefined) {
                b470 = true;
                const f470 = Math.abs(c470 - e470);
                if (f470 > a470)
                    a470 = f470;
            }
            this.lastVoltageSnapshot.set(d470, c470);
        });
        if (!b470)
            return;
        if (a470 > VOLTAGE_DELTA_RAPID) {
            this.currentStepSize = Math.max(this.currentStepSize / 4, MIN_STEP_SIZE);
            this.steadyStepCounter = 0;
        }
        else if (a470 < VOLTAGE_DELTA_STEADY) {
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
    restoreFromResult(v469: SimulationResult, w469: number): void {
        if (w469 >= 0 && w469 < v469.time.length) {
            this.globalTime = v469.time[w469];
            v469.signals.forEach((x469: number[], y469: string) => {
                if (w469 < x469.length) {
                    this.lastVoltageSnapshot.set(y469, x469[w469]);
                }
            });
        }
    }
    getGlobalTime(): number { return this.globalTime; }
    getCurrentStepSize(): number { return this.currentStepSize; }
    reset(): void {
        this.globalTime = this.config.startTime;
        this.currentStepSize = this.config.stepSize;
        this.stepCount = 0;
        this.lastVoltageSnapshot.clear();
        this.convergenceRetries = 0;
        this.steadyStepCounter = 0;
        this.mcuCycleAccum = 0;
        this.mcuTicksPerStep = 1;
    }
    isFinished(): boolean {
        return this.globalTime >= this.config.stopTime;
    }
}
