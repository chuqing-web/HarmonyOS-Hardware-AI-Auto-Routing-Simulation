import type { ISimulationKernel } from './api/ISimulationKernel';
import { DigitalEngine } from "@bundle:com.elecdraw.aischsim/entry@simulation_kernel/ets/engines/DigitalEngine";
import type { HazardReport } from "@bundle:com.elecdraw.aischsim/entry@simulation_kernel/ets/engines/DigitalEngine";
import { AnalogEngine } from "@bundle:com.elecdraw.aischsim/entry@simulation_kernel/ets/engines/AnalogEngine";
import { GlobalScheduler } from "@bundle:com.elecdraw.aischsim/entry@simulation_kernel/ets/engines/GlobalScheduler";
import type { SchedulerStepResult } from "@bundle:com.elecdraw.aischsim/entry@simulation_kernel/ets/engines/GlobalScheduler";
import { SimulationState, SimulationMode, LogicState, EventBus, ModuleEvent, ErrCode, ResultHelper, TopologyAdapter, makeProgress, IdUtil, DynamicErcEngine, copyNumberMap, copyStringMap, RandomUtil, paramMapGet, parseVoltageVolts, traceLoadSchematic } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchematicDocument, SimulationConfig, SimulationResult, Result, McuRegisterSnapshot, SchTopology, SimConfig, WaveData, FreqNoiseData, SimStatResult, SpiceResult, ProgressCallback, ApiResult, ErcViolation, FaultInjection, FaultScanResult, FaultType } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { FaultInjectionEngine } from "@bundle:com.elecdraw.aischsim/entry@simulation_kernel/ets/engines/FaultInjectionEngine";
import { Mcu8051Simulator } from "@bundle:com.elecdraw.aischsim/entry@simulation_kernel/ets/engines/Mcu8051Simulator";
import { SpiceMatrixBuilder } from "@bundle:com.elecdraw.aischsim/entry@simulation_kernel/ets/engines/SpiceMatrixBuilder";
import { SpiceRunner } from "@bundle:com.elecdraw.aischsim/entry@simulation_kernel/ets/engines/SpiceRunner";
import { QemuMcuBridge } from "@bundle:com.elecdraw.aischsim/entry@simulation_kernel/ets/engines/QemuMcuBridge";
const VOH_HC_5V = 4.5;
const ROUT_HC = 50;
const VIL_CMOS_5V = 0.8;
const VIH_CMOS_5V = 2.0;
const VIL_CMOS_3V3 = 0.6;
const VIH_CMOS_3V3 = 2.0;
const SUPPLY_INDUCTANCE = 10e-9;
interface TheveninSource {
    netId: string;
    voltage: number;
    resistance: number;
}
interface SupplyNoiseSnapshot {
    vccNoise: number;
    gndBounce: number;
}
interface StatsSnapshot {
    mean: number;
    stdDev: number;
    min: number;
    max: number;
    cp: number;
    cpk: number;
}
interface PowerIntegrityState {
    lastTotalCurrent: number;
    lastTime: number;
    vccNoise: number;
    gndBounce: number;
}
interface SimStartedData {
    config: SimConfig | SimulationConfig;
}
interface SimStoppedData {
    released?: boolean;
}
interface SimStepEmptyData {
    empty: boolean;
}
export class SimulationKernelImpl implements ISimulationKernel {
    private schematic: SchematicDocument | null = null;
    private topology: SchTopology | null = null;
    private config: SimulationConfig = {
        mode: SimulationMode.MIXED,
        startTime: 0, stopTime: 0.001, stepSize: 1e-6,
        maxStep: 1e-5, temperature: 27, convergence: 1e-6,
        mcuClockHz: 11059200
    };
    private simConfig: SimConfig | null = null;
    private state: SimulationState = SimulationState.IDLE;
    private result: SimulationResult | null = null;
    private waveDataList: WaveData[] = [];
    private nodeVoltages: Map<string, number> = new Map();
    private branchCurrents: Map<string, number> = new Map();
    private spiceNodeMap: Map<string, string> = new Map();
    private globalTime: number = 0;
    private digitalEngine: DigitalEngine = new DigitalEngine();
    private analogEngine: AnalogEngine = new AnalogEngine();
    private scheduler: GlobalScheduler | null = null;
    private mcuPc: number = 0;
    private mcuRegs: Map<string, number> = SimulationKernelImpl.createDefaultMcuRegs();
    private mcuPinVoltages: Map<string, number> = new Map();
    private faultEngine: FaultInjectionEngine = new FaultInjectionEngine();
    private dynamicErcViolations: ErcViolation[] = [];
    private mcu8051: Mcu8051Simulator = new Mcu8051Simulator();
    private mcuLoaded: boolean = false;
    private qemuBridge: QemuMcuBridge = new QemuMcuBridge();
    private mcuFamily: string = '8051';
    private paramScanDefaults: Map<string, Map<string, string>> = new Map();
    private theveninSources: TheveninSource[] = [];
    private powerState: PowerIntegrityState = { lastTotalCurrent: 0, lastTime: 0, vccNoise: 0, gndBounce: 0 };
    private crossCoupledNets: Map<string, string> = new Map();
    startSimulation(s495: SchTopology, t495: SimConfig, u495?: ProgressCallback): ApiResult<void> {
        this.topology = s495;
        this.simConfig = t495;
        const v495 = TopologyAdapter.fromTopology(s495);
        this.schematic = v495;
        this.config = this.toLegacyConfig(t495);
        this.state = SimulationState.IDLE;
        this.result = null;
        this.waveDataList = [];
        this.nodeVoltages.clear();
        this.branchCurrents.clear();
        this.globalTime = 0;
        this.digitalEngine.loadSchematic(v495);
        this.analogEngine.loadSchematic(v495, this.config);
        this.scheduler = new GlobalScheduler(this.config, this.digitalEngine, this.analogEngine);
        this.buildSpiceNodeMap(s495);
        const w495 = SimulationKernelImpl.resolveSupplyVoltage(v495);
        this.nodeVoltages.set('VCC', w495);
        this.nodeVoltages.set('0', 0);
        this.nodeVoltages.set('GND', 0);
        this.spiceNodeMap.forEach((y495: string, z495: string) => {
            if (y495 === 'VCC' || y495 === 'VCC_5V' || y495 === 'VDD') {
                this.nodeVoltages.set(z495, w495);
                this.nodeVoltages.set(y495, w495);
            }
            else if (y495 === '0' || y495 === 'GND') {
                this.nodeVoltages.set(z495, 0);
                this.nodeVoltages.set(y495, 0);
            }
        });
        u495?.(makeProgress(30, 'Netlist built'));
        this.state = SimulationState.RUNNING;
        this.scheduler.reset();
        u495?.(makeProgress(100, 'Simulation started', true));
        const x495: SimStartedData = { config: t495 };
        EventBus.getInstance().publish({
            event: ModuleEvent.SIMULATION_STARTED,
            source: 'simulation_kernel',
            timestamp: Date.now(),
            data: x495
        });
        return ResultHelper.ok();
    }
    pauseSim(): ApiResult<void> {
        if (this.state !== SimulationState.RUNNING) {
            return ResultHelper.fail(ErrCode.ERR_SIM_BUSY, 'Not running');
        }
        this.state = SimulationState.PAUSED;
        return ResultHelper.ok();
    }
    resumeSim(): ApiResult<void> {
        if (this.state !== SimulationState.PAUSED) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Not paused');
        }
        this.state = SimulationState.RUNNING;
        return ResultHelper.ok();
    }
    globalResetSim(): ApiResult<void> {
        this.globalTime = 0;
        this.mcuPc = 0;
        this.mcuRegs = SimulationKernelImpl.createDefaultMcuRegs();
        this.nodeVoltages = new Map<string, number>();
        this.branchCurrents = new Map<string, number>();
        this.waveDataList = [];
        this.result = null;
        this.theveninSources = [];
        this.powerState = { lastTotalCurrent: 0, lastTime: 0, vccNoise: 0, gndBounce: 0 };
        this.scheduler?.reset();
        this.state = SimulationState.IDLE;
        return ResultHelper.ok();
    }
    stopSim(): ApiResult<void> {
        this.state = SimulationState.STOPPED;
        const r495: SimStoppedData = {};
        EventBus.getInstance().publish({
            event: ModuleEvent.SIMULATION_STOPPED,
            source: 'simulation_kernel',
            timestamp: Date.now(),
            data: r495
        });
        return ResultHelper.ok();
    }
    simSingleStep(): ApiResult<SpiceResult> {
        const q495 = this.runSpiceStep();
        this.tickDigitalLogic();
        this.tickMcuCore();
        return ResultHelper.ok(q495);
    }
    isSimRunning(): boolean {
        return this.state === SimulationState.RUNNING;
    }
    isSimPaused(): boolean {
        return this.state === SimulationState.PAUSED;
    }
    isSimActive(): boolean {
        return this.state === SimulationState.RUNNING || this.state === SimulationState.PAUSED;
    }
    getAllWaveData(): WaveData[] {
        return this.waveDataList.slice();
    }
    getDynamicErcViolations(): ErcViolation[] {
        return this.dynamicErcViolations.slice();
    }
    injectFault(n495: string, o495: FaultType, p495?: Map<string, string>): ApiResult<FaultInjection> {
        return this.faultEngine.inject(n495, o495, p495);
    }
    removeFault(m495: string): ApiResult<void> {
        return this.faultEngine.remove(m495);
    }
    listFaults(): FaultInjection[] {
        return this.faultEngine.list();
    }
    batchFaultScan(): FaultScanResult[] {
        if (!this.topology)
            return [];
        return this.faultEngine.batchScan(this.topology, this.waveDataList);
    }
    getNodeVoltage(i495: string): number {
        const j495 = this.nodeVoltages.get(i495);
        if (j495 !== undefined)
            return j495;
        const k495 = this.analogEngine.getVoltage(i495);
        if (k495 !== 0 || this.analogEngine.getNodeNameForNetUuid(i495).length > 0) {
            return k495;
        }
        const l495 = this.spiceNodeMap.get(i495);
        if (l495 !== undefined) {
            return this.nodeVoltages.get(l495) ?? 0;
        }
        return 0;
    }
    getBranchCurrent(f495: string): number {
        const g495 = this.analogEngine.getCurrentForComponent(f495);
        if (g495 !== 0)
            return g495;
        const h495 = this.analogEngine.getNetCurrentForUuid(f495);
        if (h495 !== 0)
            return h495;
        return this.branchCurrents.get(f495) ?? 0;
    }
    getNetVoltageByUuid(d495: string): number {
        const e495 = this.analogEngine.getVoltage(d495);
        if (this.analogEngine.getNodeNameForNetUuid(d495).length > 0) {
            return e495;
        }
        return this.getNodeVoltage(d495);
    }
    getNetCurrentByUuid(c495: string): number {
        return this.analogEngine.getNetCurrentForUuid(c495);
    }
    registerSignalSource(t494: string, u494: string, v494: string, w494: string, x494: number, y494: number, z494: number, a495: number, b495: number): void {
        this.analogEngine.registerSignalSource(t494, u494, v494, w494, x494, y494, z494, a495, b495);
    }
    getNodeVoltageMap(): Map<string, number> {
        const l494 = new Map(this.nodeVoltages);
        const m494 = this.analogEngine.getNetUuidMapping();
        m494.forEach((q494: string, r494: string) => {
            if (!l494.has(r494)) {
                const s494 = l494.get(q494);
                if (s494 !== undefined) {
                    l494.set(r494, s494);
                }
            }
        });
        this.spiceNodeMap.forEach((n494: string, o494: string) => {
            if (!l494.has(o494)) {
                const p494 = l494.get(n494);
                if (p494 !== undefined) {
                    l494.set(o494, p494);
                }
            }
        });
        return l494;
    }
    getBranchCurrentMap(): Map<string, number> {
        return new Map(this.branchCurrents);
    }
    getMcuPinVoltage(j494: string, k494: string): number {
        return this.mcuPinVoltages.get(`${j494}:${k494}`) ?? 0;
    }
    getTotalPower(): number {
        let e494 = 0;
        this.branchCurrents.forEach((f494: number, g494: string) => {
            const h494 = g494.split('_')[0];
            const i494 = this.nodeVoltages.get(h494) ?? 0;
            e494 += Math.abs(i494 * f494);
        });
        return e494;
    }
    globalTimeTick(): number {
        return this.globalTime;
    }
    syncMcuPinToSpice(s493: string, t493: string, u493: number): ApiResult<void> {
        const v493 = u493 > 0.5 ? 3.3 : 0;
        this.mcuPinVoltages.set(`${s493}:${t493}`, v493);
        if (this.topology) {
            for (const x493 of this.topology.netList) {
                for (const y493 of x493.nodeList) {
                    if (y493.devUuid === s493) {
                        const z493 = y493.pinId;
                        if (z493 === t493 || z493.includes(t493) || t493.includes(z493)) {
                            const a494 = this.spiceNodeMap.get(x493.netUuid) ?? x493.netName;
                            if (a494.length > 0 && a494 !== '0') {
                                this.nodeVoltages.set(a494, v493);
                                this.registerCrossCoupledNet(s493, a494);
                                const b494 = this.theveninSources.findIndex(d494 => d494.netId === a494);
                                const c494: TheveninSource = {
                                    netId: a494,
                                    voltage: v493,
                                    resistance: 50
                                };
                                if (b494 >= 0) {
                                    this.theveninSources[b494] = c494;
                                }
                                else {
                                    this.theveninSources.push(c494);
                                }
                            }
                            return ResultHelper.ok();
                        }
                    }
                }
            }
        }
        const w493 = `${s493}_${t493}`;
        this.nodeVoltages.set(w493, v493);
        return ResultHelper.ok();
    }
    syncSpiceToMcuAdc(o493: string, p493: number, q493: number): ApiResult<void> {
        const r493 = `ADC${p493}`;
        this.mcuRegs.set(r493, Math.round((q493 / 3.3) * 4095));
        this.mcuPinVoltages.set(`${o493}:ADC${p493}`, q493);
        return ResultHelper.ok();
    }
    syncDigitalToAnalogNet(k493: string): ApiResult<void> {
        if (!this.topology)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'No topology loaded');
        const l493 = this.topology.netList.find(n493 => n493.netUuid === k493);
        if (!l493)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Net not found');
        const m493 = l493.defaultVoltage > 1.5 ? 1 : 0;
        this.nodeVoltages.set(l493.netName, m493 * 3.3);
        return ResultHelper.ok();
    }
    runSpiceStep(): SpiceResult {
        if (!this.scheduler) {
            return {
                errCode: ErrCode.ERR_PARAM_INVALID,
                nodeVoltages: new Map<string, number>(),
                branchCurrents: new Map<string, number>(),
                time: this.globalTime
            };
        }
        const v492 = copyNumberMap(this.nodeVoltages);
        const w492 = this.scheduler.step(this.mcuPc, this.mcuRegs);
        this.globalTime = w492.time;
        this.applyDigitalToAnalogThevenin(w492.digitalStates);
        this.applyAnalogToDigitalThresholds(v492, w492.analogSignals);
        w492.analogSignals.forEach((i493: number, j493: string) => {
            this.nodeVoltages.set(j493, i493);
            this.updateWaveData(j493, w492.time, i493, 0);
        });
        const x492 = this.analogEngine.getNetUuidMapping();
        x492.forEach((e493: string, f493: string) => {
            const g493 = this.nodeVoltages.get(e493);
            if (g493 !== undefined) {
                this.nodeVoltages.set(f493, g493);
            }
            else {
                const h493 = this.analogEngine.getVoltage(f493);
                this.nodeVoltages.set(f493, h493);
                if (h493 !== 0 && !this.nodeVoltages.has(e493)) {
                    this.nodeVoltages.set(e493, h493);
                }
            }
        });
        this.spiceNodeMap.forEach((b493: string, c493: string) => {
            const d493 = this.nodeVoltages.get(b493);
            if (d493 !== undefined && !this.nodeVoltages.has(c493)) {
                this.nodeVoltages.set(c493, d493);
            }
        });
        const y492 = this.analogEngine.getBranchCurrents();
        y492.forEach((z492: number, a493: string) => {
            this.branchCurrents.set(a493, z492);
        });
        this.computeSupplyNoise(w492.time);
        this.accumulateResult(w492);
        return {
            errCode: ErrCode.OK,
            nodeVoltages: copyNumberMap(this.nodeVoltages),
            branchCurrents: copyNumberMap(this.branchCurrents),
            time: this.globalTime
        };
    }
    tickDigitalLogic(): void {
        if (!this.scheduler)
            return;
        const u492 = this.globalTime;
        this.digitalEngine.processEvents(u492);
    }
    tickMcuCore(): void {
        if (this.mcuFamily.startsWith('STM32') && this.qemuBridge.isRunning()) {
            const n492 = this.qemuBridge.step(1);
            if (n492.success && n492.data !== undefined) {
                this.mcuPc = n492.data;
                this.mcuRegs.set('PC', this.mcuPc);
            }
            const o492 = [0x40010800, 0x40010C00, 0x40011000];
            for (let p492 = 0; p492 < o492.length; p492++) {
                const q492 = this.qemuBridge.readPeriph(o492[p492] + 0x0C);
                for (let r492 = 0; r492 < 16; r492++) {
                    const s492 = (q492 >> r492) & 1;
                    const t492 = `P${String.fromCharCode(65 + p492)}${r492}`;
                    this.syncMcuPinToSpice('mcu0', t492, s492 === 1 ? 3.3 : 0);
                }
            }
            return;
        }
        if (this.mcuLoaded) {
            this.mcu8051.step();
            const k492 = this.mcu8051.getRegisters();
            k492.forEach((l492: number, m492: string) => this.mcuRegs.set(m492, l492));
            this.mcuPc = this.mcu8051.getPc();
            this.syncMcuPinsToSpice();
        }
        else {
            this.mcuPc += 1;
            this.mcuRegs.set('PC', this.mcuPc);
        }
    }
    loadMcuProgram(e492: Uint8Array, f492: number = 0, g492: string = '8051'): void {
        this.mcuFamily = g492.toUpperCase();
        if (this.mcuFamily.startsWith('STM32')) {
            this.qemuBridge.loadFirmware(e492);
            this.qemuBridge.start('firmware.hex', 'stm32f103');
            this.mcuLoaded = true;
            if (this.topology) {
                for (let h492 = 0; h492 < 8; h492++) {
                    const i492 = `mcu0_GPIO${h492}`;
                    const j492 = this.spiceNodeMap.get(i492) ?? i492;
                    this.crossCoupledNets.set(i492, j492);
                }
            }
            return;
        }
        this.mcu8051.loadProgram(e492, f492);
        this.mcu8051.reset();
        this.mcuLoaded = true;
    }
    private syncMcuPinsToSpice(): void {
        const s491 = ['P0', 'P1', 'P2', 'P3'];
        for (const t491 of s491) {
            let u491 = 0;
            for (let c492 = 0; c492 < 8; c492++) {
                const d492 = this.mcu8051.getPinLevel(t491, c492);
                if (d492 > 0)
                    u491 |= (1 << c492);
            }
            const v491 = [t491, `${t491}.0`, `${t491}_0`];
            for (const w491 of v491) {
                const x491 = u491 > 0 ? 5.0 : 0;
                if (this.topology) {
                    for (const y491 of this.topology.netList) {
                        for (const z491 of y491.nodeList) {
                            if (z491.devUuid === 'mcu0') {
                                const a492 = z491.pinId;
                                if (a492 === t491 || (a492 && a492.includes(t491) && !a492.includes('.'))) {
                                    const b492 = this.spiceNodeMap.get(y491.netUuid) ?? y491.netName;
                                    if (b492.length > 0) {
                                        this.nodeVoltages.set(b492, (u491 / 255) * 5.0);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    runParamScan(e491: string, f491: number, g491: number, h491: number): SimStatResult[] {
        const i491: SimStatResult[] = [];
        const j491 = (g491 - f491) / Math.max(h491 - 1, 1);
        this.saveParamDefaults();
        for (let k491 = 0; k491 < h491; k491++) {
            const l491 = f491 + j491 * k491;
            this.restoreParamDefaults();
            if (this.schematic) {
                for (let q491 = 0; q491 < this.schematic.components.length; q491++) {
                    const r491 = this.schematic.components[q491];
                    if (r491.parameters.has(e491)) {
                        r491.parameters.set(e491, `${l491}`);
                    }
                }
                this.analogEngine.loadSchematic(this.schematic, this.config);
            }
            const m491 = this.runSpiceStep();
            const n491: number[] = [];
            m491.nodeVoltages.forEach((p491: number) => n491.push(p491));
            const o491 = SimulationKernelImpl.computeStats(n491);
            i491.push({ runIndex: k491, mean: o491.mean, stdDev: o491.stdDev, min: o491.min, max: o491.max, cp: o491.cp, cpk: o491.cpk, waves: this.waveDataList.slice() });
        }
        this.restoreParamDefaults();
        return i491;
    }
    runMonteCarlo(n490: number, o490?: ProgressCallback): SimStatResult[] {
        const p490: SimStatResult[] = [];
        this.saveParamDefaults();
        const q490 = Math.min(100, Math.floor(this.config.stopTime / Math.max(this.config.stepSize, 1e-9)));
        for (let r490 = 0; r490 < n490; r490++) {
            this.restoreParamDefaults();
            if (this.schematic) {
                for (let w490 = 0; w490 < this.schematic.components.length; w490++) {
                    const x490 = this.schematic.components[w490];
                    x490.parameters.forEach((y490: string, z490: string) => {
                        if (x490.libraryId.startsWith('R_') || x490.libraryId.includes('Resistor')) {
                            const c491 = SimulationKernelImpl.parseNumericValue(y490);
                            const d491 = RandomUtil.sampleWithTolerance(c491, 5);
                            x490.parameters.set(z490, `${d491}`);
                        }
                        else if (x490.libraryId.startsWith('C_') || x490.libraryId.includes('Cap')) {
                            const a491 = SimulationKernelImpl.parseNumericValue(y490);
                            const b491 = RandomUtil.sampleWithTolerance(a491, 10);
                            x490.parameters.set(z490, `${b491}`);
                        }
                    });
                }
                this.analogEngine.loadSchematic(this.schematic, this.config);
                this.scheduler?.reset();
            }
            for (let v490 = 0; v490 < q490; v490++) {
                this.runSpiceStep();
            }
            const s490: number[] = [];
            this.nodeVoltages.forEach((u490: number) => s490.push(u490));
            const t490 = SimulationKernelImpl.computeStats(s490);
            p490.push({
                runIndex: r490, mean: t490.mean, stdDev: t490.stdDev,
                min: t490.min, max: t490.max, cp: t490.cp, cpk: t490.cpk,
                waves: this.waveDataList.slice()
            });
            o490?.(makeProgress(Math.round((r490 + 1) / n490 * 100), `Monte Carlo ${r490 + 1}/${n490}`));
        }
        this.restoreParamDefaults();
        o490?.(makeProgress(100, 'Monte Carlo complete', true));
        return p490;
    }
    runNoiseAnalysis(v489: number, w489: number, x489: number): FreqNoiseData[] {
        const y489: FreqNoiseData[] = [];
        const z489 = new SpiceRunner(this.analogEngine);
        z489.init();
        const a490 = Math.log10(Math.max(v489, 1));
        const b490 = Math.log10(Math.max(w489, 1));
        const c490 = (b490 - a490) / Math.max(x489 - 1, 1);
        for (let d490 = 0; d490 < x489; d490++) {
            const e490 = Math.pow(10, a490 + c490 * d490);
            const f490 = this.analogEngine.getNetlist().split('\n');
            let g490 = 'N1';
            for (const k490 of f490) {
                const l490 = k490.trim().split(/\s+/);
                if (l490.length >= 3 && !k490.startsWith('*') && !k490.startsWith('.')) {
                    const m490 = l490[1];
                    if (m490 !== '0' && m490 !== 'GND' && m490 !== 'VCC') {
                        g490 = m490;
                        break;
                    }
                }
            }
            const h490 = z489.runNoise(g490, e490);
            const i490 = h490.nodeVoltages.get(g490) ?? 0;
            const j490 = i490 > 1e-30 ? 20 * Math.log10(i490) : -200;
            y489.push({ frequency: e490, noiseDb: j490 });
        }
        return y489;
    }
    generateSpiceNetlistFromTopo(s489: SchTopology): ApiResult<string> {
        const t489 = this.simConfig ? this.toLegacyConfig(this.simConfig) : this.config;
        const u489 = SpiceMatrixBuilder.build(s489, t489.temperature, t489.stepSize, t489.stopTime);
        this.spiceNodeMap = u489.nodeMap;
        return ResultHelper.ok(u489.netlist);
    }
    netToSpiceNodeMap(): Map<string, string> {
        if (this.topology) {
            const q489 = this.simConfig ? this.toLegacyConfig(this.simConfig) : this.config;
            const r489 = SpiceMatrixBuilder.build(this.topology, q489.temperature, q489.stepSize, q489.stopTime);
            this.spiceNodeMap = r489.nodeMap;
        }
        return copyStringMap(this.spiceNodeMap);
    }
    releaseSimResource(): void {
        this.schematic = null;
        this.topology = null;
        this.scheduler = null;
        this.result = null;
        this.waveDataList = [];
        this.nodeVoltages = new Map();
        this.branchCurrents = new Map();
        this.spiceNodeMap = new Map();
        this.state = SimulationState.IDLE;
    }
    loadSchematic(o489: SchematicDocument): Result<void> {
        const p489 = this.state;
        this.schematic = o489;
        this.topology = TopologyAdapter.toTopology(o489);
        this.digitalEngine.loadSchematic(o489);
        this.analogEngine.loadSchematic(o489, this.config);
        this.scheduler = new GlobalScheduler(this.config, this.digitalEngine, this.analogEngine);
        if (this.topology) {
            this.buildSpiceNodeMap(this.topology);
        }
        if (p489 === SimulationState.RUNNING || p489 === SimulationState.PAUSED) {
            this.waveDataList = [];
            this.state = p489;
            traceLoadSchematic(true, o489.components.length, o489.nets.length);
        }
        else {
            this.state = SimulationState.IDLE;
            this.result = null;
            traceLoadSchematic(false, o489.components.length, o489.nets.length);
        }
        return { success: true, errCode: ErrCode.OK };
    }
    setConfig(n489: SimulationConfig): void {
        this.config = n489;
        if (this.schematic) {
            this.analogEngine.loadSchematic(this.schematic, n489);
            this.scheduler = new GlobalScheduler(n489, this.digitalEngine, this.analogEngine);
        }
    }
    getConfig(): SimulationConfig { return this.config; }
    start(): Result<void> {
        if (!this.schematic)
            return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: 'No schematic loaded' };
        this.state = SimulationState.RUNNING;
        this.scheduler?.reset();
        const m489: SimStartedData = { config: this.config };
        EventBus.getInstance().publish({
            event: ModuleEvent.SIMULATION_STARTED,
            source: 'simulation_kernel',
            timestamp: Date.now(),
            data: m489
        });
        return { success: true, errCode: ErrCode.OK };
    }
    pause(): Result<void> {
        if (this.state !== SimulationState.RUNNING)
            return { success: false, errCode: ErrCode.ERR_SIM_BUSY, error: 'Not running' };
        this.state = SimulationState.PAUSED;
        return { success: true, errCode: ErrCode.OK };
    }
    resume(): Result<void> {
        if (this.state !== SimulationState.PAUSED)
            return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: 'Not paused' };
        this.state = SimulationState.RUNNING;
        return { success: true, errCode: ErrCode.OK };
    }
    stop(): Result<void> {
        this.state = SimulationState.STOPPED;
        const l489: SimStoppedData = {};
        EventBus.getInstance().publish({
            event: ModuleEvent.SIMULATION_STOPPED,
            source: 'simulation_kernel',
            timestamp: Date.now(),
            data: l489
        });
        return { success: true, errCode: ErrCode.OK };
    }
    step(): Result<SimulationResult> {
        if (!this.schematic || !this.scheduler) {
            return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: 'No schematic loaded' };
        }
        if (this.state !== SimulationState.RUNNING && this.state !== SimulationState.IDLE) {
            return { success: false, errCode: ErrCode.ERR_SIM_BUSY, error: 'Simulation not in runnable state' };
        }
        const i489 = this.scheduler.step(this.mcuPc, this.mcuRegs);
        this.tickMcuCore();
        this.mcuPc = this.mcu8051.getPc();
        this.globalTime = i489.time;
        this.accumulateResult(i489);
        this.dynamicErcViolations = DynamicErcEngine.analyze(this.waveDataList, this.result?.digitalStates ? this.flattenDigitalStates(this.result.digitalStates) : new Map<string, string>());
        const j489: SimStepEmptyData = { empty: true };
        const k489: Object = this.result !== null ? this.result as Object : j489;
        EventBus.getInstance().publish({
            event: ModuleEvent.SIMULATION_STEP,
            source: 'simulation_kernel',
            timestamp: Date.now(),
            data: k489
        });
        if (this.scheduler.isFinished()) {
            this.state = SimulationState.STOPPED;
        }
        return { success: true, errCode: ErrCode.OK, data: this.result! };
    }
    getState(): SimulationState { return this.state; }
    getResult(): SimulationResult | null { return this.result; }
    getSignalData(g489: string): Result<number[]> {
        if (!this.result)
            return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: 'No simulation result' };
        const h489 = this.result.signals.get(g489);
        if (!h489)
            return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: `Signal ${g489} not found` };
        return { success: true, errCode: ErrCode.OK, data: h489 };
    }
    getDigitalState(e489: string): boolean {
        const f489 = this.result?.digitalStates.get(e489);
        if (!f489 || f489.length === 0)
            return false;
        return f489[f489.length - 1] === LogicState.HIGH;
    }
    getMcuSnapshot(): McuRegisterSnapshot | null {
        if (!this.result?.mcuRegisters?.length)
            return null;
        return this.result.mcuRegisters[this.result.mcuRegisters.length - 1];
    }
    setComponentParameter(z488: string, a489: string, b489: string): Result<void> {
        if (!this.schematic)
            return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: 'No schematic loaded' };
        const c489 = this.schematic.components.find(d489 => d489.id === z488);
        if (!c489)
            return { success: false, errCode: ErrCode.ERR_DEVICE_NOT_EXIST, error: 'Component not found' };
        c489.parameters.set(a489, b489);
        if (this.isSimActive()) {
            this.analogEngine.loadSchematic(this.schematic, this.config);
            if (this.topology) {
                this.buildSpiceNodeMap(this.topology);
            }
        }
        return { success: true, errCode: ErrCode.OK };
    }
    generateSpiceNetlist(): Result<string> {
        if (!this.schematic)
            return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: 'No schematic loaded' };
        return { success: true, errCode: ErrCode.OK, data: this.analogEngine.getNetlist() };
    }
    getHazards(): HazardReport[] {
        return this.digitalEngine.detectHazards();
    }
    registerCrossCoupledNet(x488: string, y488: string): void {
        this.crossCoupledNets.set(x488, y488);
    }
    private applyDigitalToAnalogThevenin(s488: Map<string, LogicState>): void {
        this.theveninSources = [];
        s488.forEach((t488: LogicState, u488: string) => {
            if (t488 === LogicState.HIGH_Z || t488 === LogicState.UNKNOWN)
                return;
            const v488 = this.crossCoupledNets.get(u488) ?? u488;
            const w488 = t488 === LogicState.HIGH ? VOH_HC_5V : 0;
            this.theveninSources.push({ netId: v488, voltage: w488, resistance: ROUT_HC });
            this.nodeVoltages.set(v488, w488);
        });
    }
    private applyAnalogToDigitalThresholds(k488: Map<string, number>, l488: Map<string, number>): void {
        const m488 = 5.0;
        const n488 = m488 > 4.0 ? VIL_CMOS_5V : VIL_CMOS_3V3;
        const o488 = m488 > 4.0 ? VIH_CMOS_5V : VIH_CMOS_3V3;
        l488.forEach((p488: number, q488: string) => {
            const r488 = k488.get(q488) ?? p488;
            if (r488 < n488 && p488 >= o488) {
                this.digitalEngine.scheduleEvent(this.globalTime, q488, LogicState.HIGH);
            }
            else if (r488 > o488 && p488 <= n488) {
                this.digitalEngine.scheduleEvent(this.globalTime, q488, LogicState.LOW);
            }
            this.nodeVoltages.set(q488, p488);
        });
    }
    private computeSupplyNoise(e488: number): void {
        let f488 = 0;
        this.branchCurrents.forEach((j488: number) => { f488 += Math.abs(j488); });
        const g488 = e488 - this.powerState.lastTime;
        if (g488 > 0 && this.powerState.lastTotalCurrent > 0) {
            const h488 = f488 - this.powerState.lastTotalCurrent;
            const i488 = h488 / g488;
            this.powerState.vccNoise = SUPPLY_INDUCTANCE * i488;
            this.powerState.gndBounce = this.powerState.vccNoise * 0.7;
        }
        this.powerState.lastTotalCurrent = f488;
        this.powerState.lastTime = e488;
    }
    getSupplyNoise(): SupplyNoiseSnapshot {
        const d488: SupplyNoiseSnapshot = {
            vccNoise: this.powerState.vccNoise,
            gndBounce: this.powerState.gndBounce
        };
        return d488;
    }
    private static createDefaultMcuRegs(): Map<string, number> {
        const c488 = new Map<string, number>();
        c488.set('PC', 0);
        c488.set('ACC', 0);
        c488.set('SP', 0x07);
        return c488;
    }
    private toLegacyConfig(a488: SimConfig): SimulationConfig {
        let b488 = SimulationMode.MIXED;
        if (a488.simMode === 'transient') {
            b488 = SimulationMode.TRANSIENT;
        }
        else if (a488.simMode === 'dc') {
            b488 = SimulationMode.DC;
        }
        else if (a488.simMode === 'ac') {
            b488 = SimulationMode.AC;
        }
        else if (a488.simMode === 'monte_carlo') {
            b488 = SimulationMode.MONTE_CARLO;
        }
        else if (a488.simMode === 'noise') {
            b488 = SimulationMode.NOISE;
        }
        return {
            mode: b488,
            startTime: 0,
            stopTime: a488.transientTotalTime,
            stepSize: a488.minTimeStep,
            maxStep: a488.maxTimeStep,
            temperature: a488.temperature,
            convergence: a488.convergence,
            mcuClockHz: a488.mcuClockHz
        };
    }
    private buildSpiceNodeMap(u487: SchTopology): void {
        const v487 = this.simConfig ? this.toLegacyConfig(this.simConfig) : this.config;
        const w487 = SpiceMatrixBuilder.build(u487, v487.temperature, v487.stepSize, v487.stopTime);
        const x487 = this.analogEngine.getNetUuidMapping();
        x487.forEach((y487: string, z487: string) => {
            w487.nodeMap.set(z487, y487);
        });
        this.spiceNodeMap = w487.nodeMap;
        this.autoRegisterCrossCouplings(u487);
    }
    private autoRegisterCrossCouplings(i487: SchTopology): void {
        this.crossCoupledNets.clear();
        for (const j487 of i487.netList) {
            let k487 = false;
            let l487 = false;
            for (const n487 of j487.nodeList) {
                const o487 = n487.devUuid;
                let p487 = '';
                if (this.schematic) {
                    const s487 = this.schematic.components.find(t487 => t487.id === o487);
                    if (s487)
                        p487 = s487.libraryId.toUpperCase();
                }
                if (p487.length === 0) {
                    const q487 = i487.deviceList.find(r487 => r487.instUuid === o487);
                    if (q487)
                        p487 = q487.libDevId.toUpperCase();
                }
                if (p487.length === 0)
                    continue;
                if (p487.includes('74HC') || p487.includes('74LS') || p487.includes('74HCT') ||
                    p487.includes('74ACT') || p487.includes('CD40') || p487.includes('74LVC') ||
                    p487.includes('STM32') || p487.includes('MCS51') || p487.includes('8051') ||
                    p487.includes('MCU') || p487.includes('LOGIC_')) {
                    k487 = true;
                }
                if (p487.startsWith('R_') || p487.includes('RESISTOR') || p487.startsWith('C_') ||
                    p487.includes('CAP') || p487.includes('INDUCTOR') || p487.startsWith('L_') ||
                    p487.includes('DIODE') || p487.includes('LED') || p487.includes('NPN') ||
                    p487.includes('PNP') || p487.includes('TRANSISTOR') || p487.includes('MOSFET') ||
                    p487.includes('OPAMP') || p487.includes('LM358') || p487.includes('LM324') ||
                    p487.includes('REGULATOR') || p487.includes('CRYSTAL')) {
                    l487 = true;
                }
            }
            if (k487 && l487) {
                const m487 = this.spiceNodeMap.get(j487.netUuid) ?? j487.netName;
                this.crossCoupledNets.set(j487.netUuid, m487);
            }
        }
    }
    private static readonly MAX_WAVE_POINTS = 4096;
    private resolveNetUuidForNode(e487: string): string {
        let f487 = e487;
        this.spiceNodeMap.forEach((g487: string, h487: string) => {
            if (g487 === e487) {
                f487 = h487;
            }
        });
        return f487;
    }
    private updateWaveData(x486: string, y486: number, z486: number, a487: number): void {
        let b487 = this.waveDataList.find(d487 => d487.probeName === x486);
        if (!b487) {
            const c487 = this.resolveNetUuidForNode(x486);
            b487 = {
                waveId: IdUtil.generate('wave'),
                probeName: x486,
                netName: c487,
                timeAxis: [],
                voltageAxis: [],
                currentAxis: [],
                sampleRate: 1 / (this.config.stepSize || 1e-6),
                waveType: 'voltage',
                holdTime: 0
            };
            this.waveDataList.push(b487);
        }
        if (b487.timeAxis.length >= SimulationKernelImpl.MAX_WAVE_POINTS) {
            b487.timeAxis.shift();
            b487.voltageAxis.shift();
            b487.currentAxis.shift();
        }
        b487.timeAxis.push(y486);
        b487.voltageAxis.push(z486);
        b487.currentAxis.push(a487);
    }
    private accumulateResult(q486: SchedulerStepResult): void {
        if (!this.result) {
            this.result = {
                time: [],
                signals: new Map<string, number[]>(),
                digitalStates: new Map<string, LogicState[]>(),
                mcuRegisters: []
            };
        }
        this.result.time.push(q486.time);
        q486.analogSignals.forEach((u486: number, v486: string) => {
            let w486 = this.result!.signals.get(v486);
            if (!w486) {
                w486 = [];
                this.result!.signals.set(v486, w486);
            }
            w486.push(u486);
        });
        q486.digitalStates.forEach((r486: LogicState, s486: string) => {
            let t486 = this.result!.digitalStates.get(s486);
            if (!t486) {
                t486 = [];
                this.result!.digitalStates.set(s486, t486);
            }
            t486.push(r486);
        });
        if (q486.mcuSnapshot) {
            this.result.mcuRegisters?.push(q486.mcuSnapshot);
        }
    }
    private flattenDigitalStates(l486: Map<string, LogicState[]>): Map<string, string> {
        const m486 = new Map<string, string>();
        l486.forEach((n486: LogicState[], o486: string) => {
            const p486 = n486[n486.length - 1];
            if (p486 === LogicState.HIGH) {
                m486.set(o486, '1');
            }
            else if (p486 === LogicState.LOW) {
                m486.set(o486, '0');
            }
            else {
                m486.set(o486, 'X');
            }
        });
        return m486;
    }
    private saveParamDefaults(): void {
        this.paramScanDefaults.clear();
        if (!this.schematic)
            return;
        for (const k486 of this.schematic.components) {
            this.paramScanDefaults.set(k486.id, copyStringMap(k486.parameters));
        }
    }
    private restoreParamDefaults(): void {
        if (!this.schematic)
            return;
        this.schematic.components.forEach((i486) => {
            const j486 = this.paramScanDefaults.get(i486.id);
            if (j486) {
                i486.parameters = copyStringMap(j486);
            }
        });
    }
    private static parseNumericValue(f486: string): number {
        const g486 = f486.toLowerCase();
        if (g486.includes('k'))
            return parseFloat(g486) * 1000;
        if (g486.includes('u') || g486.includes('µ'))
            return parseFloat(g486) * 1e-6;
        if (g486.includes('n'))
            return parseFloat(g486) * 1e-9;
        if (g486.includes('p'))
            return parseFloat(g486) * 1e-12;
        const h486 = parseFloat(g486);
        return isNaN(h486) ? 1000 : h486;
    }
    private static computeStats(q485: number[]): StatsSnapshot {
        if (q485.length === 0) {
            const e486: StatsSnapshot = { mean: 0, stdDev: 0, min: 0, max: 0, cp: 0, cpk: 0 };
            return e486;
        }
        let r485 = 0;
        let s485 = q485[0];
        let t485 = q485[0];
        for (let d486 = 0; d486 < q485.length; d486++) {
            r485 += q485[d486];
            if (q485[d486] < s485)
                s485 = q485[d486];
            if (q485[d486] > t485)
                t485 = q485[d486];
        }
        const u485 = r485 / q485.length;
        let v485 = 0;
        for (let b486 = 0; b486 < q485.length; b486++) {
            const c486 = q485[b486] - u485;
            v485 += c486 * c486;
        }
        const w485 = Math.sqrt(v485 / q485.length);
        const x485 = u485 + 3 * w485;
        const y485 = u485 - 3 * w485;
        const z485 = w485 > 0 ? (x485 - y485) / (6 * w485) : 0;
        const a486 = w485 > 0 ? Math.min((x485 - u485) / (3 * w485), (u485 - y485) / (3 * w485)) : 0;
        return { mean: u485, stdDev: w485, min: s485, max: t485, cp: z485, cpk: a486 };
    }
    private static resolveSupplyVoltage(m485: SchematicDocument): number {
        for (let n485 = 0; n485 < m485.components.length; n485++) {
            const o485 = m485.components[n485];
            const p485 = o485.libraryId.toUpperCase();
            if (p485 === 'VCC' || p485.endsWith('/VCC')) {
                return parseVoltageVolts(paramMapGet(o485.parameters, 'voltage', '5V'), 5);
            }
        }
        return 5;
    }
}
