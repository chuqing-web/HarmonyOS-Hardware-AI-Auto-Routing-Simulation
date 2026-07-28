import type { ISimulationKernel } from './api/ISimulationKernel';
import { DigitalEngine } from "@bundle:com.elecdraw.aischsim/entry@simulation_kernel/ets/engines/DigitalEngine";
import type { HazardReport } from "@bundle:com.elecdraw.aischsim/entry@simulation_kernel/ets/engines/DigitalEngine";
import { AnalogEngine } from "@bundle:com.elecdraw.aischsim/entry@simulation_kernel/ets/engines/AnalogEngine";
import { GlobalScheduler } from "@bundle:com.elecdraw.aischsim/entry@simulation_kernel/ets/engines/GlobalScheduler";
import type { SchedulerStepResult } from "@bundle:com.elecdraw.aischsim/entry@simulation_kernel/ets/engines/GlobalScheduler";
import { SimulationState, SimulationMode, LogicState, EventBus, ModuleEvent, ErrCode, ResultHelper, TopologyAdapter, makeProgress, IdUtil, DynamicErcEngine, copyNumberMap, copyStringMap, RandomUtil, paramMapGet, parseVoltageVolts, traceLoadSchematic, traceBurn, formatFirmwarePreview, traceMcuTick, traceMcuGpioSync, traceLedVfSample, traceSwitchSample, traceRelaySample, traceUart, formatUartBytesHex, traceUartTxDrain, traceDigitalLogic, traceDigitalAd, traceDigitalAdSnapshot, traceDigitalThevenin, traceLogicAnalyzerChannels, getPinNetMap, Logger, INSTR_TRACE_TAG, ensureNetPinConnectivity } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchematicDocument, SimulationConfig, SimulationResult, Result, McuRegisterSnapshot, SchTopology, SimConfig, WaveData, FreqNoiseData, SimStatResult, SpiceResult, ProgressCallback, ApiResult, ErcViolation, FaultInjection, FaultScanResult, FaultType, PinGeometryResolver } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { FaultInjectionEngine } from "@bundle:com.elecdraw.aischsim/entry@simulation_kernel/ets/engines/FaultInjectionEngine";
import { Mcu8051Simulator } from "@bundle:com.elecdraw.aischsim/entry@simulation_kernel/ets/engines/Mcu8051Simulator";
import { SpiceMatrixBuilder } from "@bundle:com.elecdraw.aischsim/entry@simulation_kernel/ets/engines/SpiceMatrixBuilder";
import { SpiceRunner } from "@bundle:com.elecdraw.aischsim/entry@simulation_kernel/ets/engines/SpiceRunner";
import { QemuMcuBridge } from "@bundle:com.elecdraw.aischsim/entry@simulation_kernel/ets/engines/QemuMcuBridge";
// ---- 混合信号耦合参数 (1.3.11-1.3.14) ----
const VOH_HC_5V = 4.5; // HC系列输出高电平 Thevenin 电压
const ROUT_HC = 50; // HC系列输出阻抗 (Ω)
const VIL_CMOS_5V = 0.8; // CMOS 低电平阈值
const VIH_CMOS_5V = 2.0; // CMOS 高电平阈值
const VIL_CMOS_3V3 = 0.6;
const VIH_CMOS_3V3 = 2.0;
const SUPPLY_INDUCTANCE = 10e-9; // 电源引线电感 10nH
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
/** 扁平帧快照 — Worker/UI DisplayPump 共用形状 */
export interface KernelFrameSnapshot {
    t: number;
    stepCount: number;
    netKeys: string[];
    voltages: number[];
    branchKeys: string[];
    currents: number[];
    mcuFamily: string;
    mcuPc: number;
    mcuP1: number;
    gpioWords: number[];
    /** USART TX bytes produced since previous snapshot (drained) */
    uartBytes: number[];
    state: string;
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
    /** 8051 core has firmware — independent of STM32/QEMU. */
    private mcu8051Loaded: boolean = false;
    private qemuBridge: QemuMcuBridge = new QemuMcuBridge();
    /** STM32/QEMU core has firmware — independent of 8051. */
    private mcuStm32Loaded: boolean = false;
    /** Last STM32 family string (e.g. STM32F1); used in dual-core status label. */
    private mcuStm32Family: string = 'STM32F1';
    /**
     * Status label for UI / frame snapshot.
     * May be "8051", "STM32F1", or "8051+STM32F1" when both cores are loaded.
     */
    private mcuFamily: string = '8051';
    private paramScanDefaults: Map<string, Map<string, string>> = new Map();
    /** Last traced GPIO port values — debounce [MCU] GPIO_SYNC spam */
    private lastTracedGpio: Map<string, number> = new Map();
    private mcuTickCount: number = 0;
    /** Accumulated spice/digital steps for frame telemetry */
    private budgetStepCount: number = 0;
    /**
     * Optional library pin resolver — AppService injects this so loadSchematic /
     * startSimulation do not treat MCU as 2-pin passives (GPIO_MISS).
     */
    private pinGeometryResolver: PinGeometryResolver | undefined = undefined;
    // ---- 混合信号耦合状态 (1.3.11-1.3.14) ----
    private theveninSources: TheveninSource[] = [];
    private powerState: PowerIntegrityState = { lastTotalCurrent: 0, lastTime: 0, vccNoise: 0, gndBounce: 0 };
    private crossCoupledNets: Map<string, string> = new Map(); // digital_net → analog_node
    /** Inject component-library pin geometry for connectivity rebuild. */
    setPinGeometryResolver(resolver: PinGeometryResolver): void {
        this.pinGeometryResolver = resolver;
    }
    // ---- v2 API ----
    startSimulation(topo: SchTopology, config: SimConfig, onProgress?: ProgressCallback, schematicDoc?: SchematicDocument): ApiResult<void> {
        this.topology = topo;
        this.simConfig = config;
        // Prefer editor doc (full pinId:pinName). fromTopology alone used to drop AC+/OUT1 names.
        const doc = schematicDoc !== undefined ? schematicDoc : TopologyAdapter.fromTopology(topo);
        // Always rebuild pinIds before MNA — topology-only path and stale docs are unsafe
        const grid = doc.metadata !== undefined && doc.metadata.gridSize > 0 ? doc.metadata.gridSize : 10;
        ensureNetPinConnectivity(doc, grid, this.pinGeometryResolver);
        this.schematic = doc;
        this.config = this.toLegacyConfig(config);
        this.state = SimulationState.IDLE;
        this.result = null;
        this.waveDataList = [];
        this.nodeVoltages.clear();
        this.branchCurrents.clear();
        this.globalTime = 0;
        this.budgetStepCount = 0;
        this.digitalEngine.loadSchematic(doc);
        this.analogEngine.loadSchematic(doc, this.config);
        this.scheduler = new GlobalScheduler(this.config, this.digitalEngine, this.analogEngine);
        this.buildSpiceNodeMap(topo);
        // Pre-populate initial voltages from schematic VCC setting
        const supplyV = SimulationKernelImpl.resolveSupplyVoltage(doc);
        this.nodeVoltages.set('VCC', supplyV);
        this.nodeVoltages.set('0', 0);
        this.nodeVoltages.set('GND', 0);
        this.spiceNodeMap.forEach((nodeName: string, netUuid: string) => {
            if (nodeName === 'VCC' || nodeName === 'VCC_5V' || nodeName === 'VDD') {
                this.nodeVoltages.set(netUuid, supplyV);
                this.nodeVoltages.set(nodeName, supplyV);
            }
            else if (nodeName === '0' || nodeName === 'GND') {
                this.nodeVoltages.set(netUuid, 0);
                this.nodeVoltages.set(nodeName, 0);
            }
        });
        onProgress?.(makeProgress(30, 'Netlist built'));
        this.state = SimulationState.RUNNING;
        this.scheduler.reset();
        // DC seed: push analog rail levels into digital nets, then settle gates
        this.seedDigitalFromAnalogDc();
        // loadSchematic cleared GPIO Thevenin sources — re-apply if firmware already loaded
        if (this.isAnyMcuLoaded()) {
            if (this.mcuStm32Loaded) {
                // Re-arm after burn→idle (local interpreter; no real IPC)
                if (!this.qemuBridge.isRunning()) {
                    this.qemuBridge.ensureRunning();
                    Logger.info(INSTR_TRACE_TAG, `[MCU] SIM_START revive STM32 pc=0x${this.qemuBridge.getPc().toString(16)} ` +
                        `fw=${this.qemuBridge.getFirmwareSize()}`);
                }
                else {
                    this.qemuBridge.touch();
                }
                this.syncStm32GpioToSpice();
            }
            if (this.mcu8051Loaded) {
                this.syncMcuPinsToSpice();
            }
        }
        // Settle behavioral switches (555 power-on: TRIG low → Q high).
        // 555-only flips must NOT DC-OP (opens C and wipes timing-cap voltage).
        this.analogEngine.pinVoltageSources();
        this.analogEngine.reSolveOp();
        if (this.analogEngine.updateRelayContactsFromCoil()) {
            if (this.analogEngine.needsDcResolveAfterSwitch()) {
                this.analogEngine.reSolveOp();
            }
            else {
                this.analogEngine.pinVoltageSources();
            }
        }
        this.syncVoltagesFromAnalogEngine();
        // Always dump SW/REL/LED so DNO/DNC diagnosis is visible without waiting for GPIO_SYNC
        this.tracePeripheralIndicators('sim-start');
        onProgress?.(makeProgress(100, 'Simulation started', true));
        const startedData: SimStartedData = { config: config };
        EventBus.getInstance().publish({
            event: ModuleEvent.SIMULATION_STARTED,
            source: 'simulation_kernel',
            timestamp: Date.now(),
            data: startedData
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
        this.lastTracedGpio.clear();
        this.mcuTickCount = 0;
        this.scheduler?.reset();
        this.state = SimulationState.IDLE;
        return ResultHelper.ok();
    }
    stopSim(): ApiResult<void> {
        this.state = SimulationState.STOPPED;
        const stoppedData: SimStoppedData = {};
        EventBus.getInstance().publish({
            event: ModuleEvent.SIMULATION_STOPPED,
            source: 'simulation_kernel',
            timestamp: Date.now(),
            data: stoppedData
        });
        return ResultHelper.ok();
    }
    simSingleStep(): ApiResult<SpiceResult> {
        this.syncSpiceToGpioInputs();
        this.tickMcuCore();
        const spice = this.runSpiceStep();
        if (this.analogEngine.updateRelayContactsFromCoil()) {
            if (this.analogEngine.needsDcResolveAfterSwitch()) {
                this.analogEngine.reSolveOp();
            }
            else {
                this.analogEngine.pinVoltageSources();
            }
        }
        this.syncSpiceToGpioInputs();
        this.tickDigitalLogic();
        return ResultHelper.ok(spice);
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
    injectFault(instUuid: string, faultType: FaultType, params?: Map<string, string>): ApiResult<FaultInjection> {
        return this.faultEngine.inject(instUuid, faultType, params);
    }
    removeFault(faultId: string): ApiResult<void> {
        return this.faultEngine.remove(faultId);
    }
    listFaults(): FaultInjection[] {
        return this.faultEngine.list();
    }
    batchFaultScan(): FaultScanResult[] {
        if (!this.topology)
            return [];
        return this.faultEngine.batchScan(this.topology, this.waveDataList);
    }
    getNodeVoltage(nodeName: string): number {
        // Try direct lookup first (node name like "N1", "VCC", "0")
        const direct = this.nodeVoltages.get(nodeName);
        if (direct !== undefined)
            return direct;
        // Try AnalogEngine's net UUID → node name mapping
        const aeVoltage = this.analogEngine.getVoltage(nodeName);
        if (aeVoltage !== 0 || this.analogEngine.getNodeNameForNetUuid(nodeName).length > 0) {
            return aeVoltage;
        }
        // Try spiceNodeMap translation (net UUID → SPICE node name)
        const spiceNode = this.spiceNodeMap.get(nodeName);
        if (spiceNode !== undefined) {
            return this.nodeVoltages.get(spiceNode) ?? 0;
        }
        return 0;
    }
    getBranchCurrent(branchName: string): number {
        // Try direct component UUID lookup first
        const aeCurrent = this.analogEngine.getCurrentForComponent(branchName);
        if (aeCurrent !== 0)
            return aeCurrent;
        // Try net UUID lookup
        const netCurrent = this.analogEngine.getNetCurrentForUuid(branchName);
        if (netCurrent !== 0)
            return netCurrent;
        // Fall back to stored branch currents
        return this.branchCurrents.get(branchName) ?? 0;
    }
    /** Get voltage on a net by its UUID */
    getNetVoltageByUuid(netUuid: string): number {
        // Digital gate Thevenin wins over floating SPICE nodes (LA probes etc.)
        for (let i = 0; i < this.theveninSources.length; i++) {
            const src = this.theveninSources[i];
            if (src.netId === netUuid) {
                return src.voltage;
            }
            const spice = this.spiceNodeMap.get(netUuid);
            if (spice !== undefined && src.netId === spice) {
                return src.voltage;
            }
        }
        const spiceName = this.spiceNodeMap.get(netUuid) ??
            this.analogEngine.getNodeNameForNetUuid(netUuid);
        const aeV = this.analogEngine.getVoltage(netUuid);
        // Prefer live AE solve when it has a real level
        if (spiceName.length > 0 && Math.abs(aeV) > 1e-6) {
            return aeV;
        }
        // Worker→UI mirror: local AE may be empty while nodeVoltages hold OP / frame
        const kernelByUuid = this.nodeVoltages.get(netUuid);
        if (kernelByUuid !== undefined) {
            return kernelByUuid;
        }
        if (spiceName.length > 0) {
            const bySpice = this.nodeVoltages.get(spiceName);
            if (bySpice !== undefined) {
                return bySpice;
            }
        }
        // Schematic net.name may be exported in Worker frames (ADC/VCC/…)
        if (this.schematic !== null) {
            for (let i = 0; i < this.schematic.nets.length; i++) {
                const n = this.schematic.nets[i];
                if (n.id === netUuid && n.name.length > 0) {
                    const byName = this.nodeVoltages.get(n.name);
                    if (byName !== undefined) {
                        return byName;
                    }
                    break;
                }
            }
        }
        if (spiceName.length > 0) {
            return aeV;
        }
        return this.getNodeVoltage(netUuid);
    }
    /** Get current flowing through a net by its UUID */
    getNetCurrentByUuid(netUuid: string): number {
        return this.analogEngine.getNetCurrentForUuid(netUuid);
    }
    /** Register a signal generator as a voltage source in the analog engine */
    registerSignalSource(sourceId: string, nodeA: string, nodeB: string, waveform: string, voltage: number, amplitude: number, freq: number, phase: number, dutyCycle: number): void {
        this.analogEngine.registerSignalSource(sourceId, nodeA, nodeB, waveform, voltage, amplitude, freq, phase, dutyCycle);
    }
    getNodeVoltageMap(): Map<string, number> {
        const map = new Map(this.nodeVoltages);
        const aeNetMap = this.analogEngine.getNetUuidMapping();
        aeNetMap.forEach((nodeName: string, netUuid: string) => {
            if (!map.has(netUuid)) {
                const voltage = map.get(nodeName);
                if (voltage !== undefined) {
                    map.set(netUuid, voltage);
                }
            }
        });
        this.spiceNodeMap.forEach((nodeName: string, netUuid: string) => {
            if (!map.has(netUuid)) {
                const voltage = map.get(nodeName);
                if (voltage !== undefined) {
                    map.set(netUuid, voltage);
                }
            }
        });
        return map;
    }
    getBranchCurrentMap(): Map<string, number> {
        return new Map(this.branchCurrents);
    }
    getMcuPinVoltage(mcuInstUuid: string, pinId: string): number {
        return this.mcuPinVoltages.get(`${mcuInstUuid}:${pinId}`) ?? 0;
    }
    getTotalPower(): number {
        let power = 0;
        this.branchCurrents.forEach((current: number, branch: string) => {
            const node = branch.split('_')[0];
            const v = this.nodeVoltages.get(node) ?? 0;
            power += Math.abs(v * current);
        });
        return power;
    }
    globalTimeTick(): number {
        return this.globalTime;
    }
    syncMcuPinToSpice(mcuInstUuid: string, pinId: string, level: number): ApiResult<void> {
        const voltage = level > 0.5 ? 3.3 : 0;
        this.mcuPinVoltages.set(`${mcuInstUuid}:${pinId}`, voltage);
        // Find the actual net connected to this MCU pin and set its voltage
        if (this.topology) {
            for (const net of this.topology.netList) {
                for (const nodeRef of net.nodeList) {
                    if (nodeRef.devUuid === mcuInstUuid) {
                        // Check if this nodeRef is for the pin we're setting
                        const refPinId = nodeRef.pinId;
                        // Match by pin ID (e.g., "P1.0", "PA0", "GPIO0")
                        if (refPinId === pinId || refPinId.includes(pinId) || pinId.includes(refPinId)) {
                            // Get the actual node name for this net
                            const nodeName = this.spiceNodeMap.get(net.netUuid) ?? net.netName;
                            if (nodeName.length > 0 && nodeName !== '0') {
                                this.nodeVoltages.set(nodeName, voltage);
                                // Also set the Thevenin source for digital→analog coupling
                                this.registerCrossCoupledNet(mcuInstUuid, nodeName);
                                const existingThev = this.theveninSources.findIndex(s => s.netId === nodeName);
                                const thevSrc: TheveninSource = {
                                    netId: nodeName,
                                    voltage: voltage,
                                    resistance: 50 // HC output impedance
                                };
                                if (existingThev >= 0) {
                                    this.theveninSources[existingThev] = thevSrc;
                                }
                                else {
                                    this.theveninSources.push(thevSrc);
                                }
                            }
                            return ResultHelper.ok();
                        }
                    }
                }
            }
        }
        // Fallback: set by synthetic net name
        const fallbackNet = `${mcuInstUuid}_${pinId}`;
        this.nodeVoltages.set(fallbackNet, voltage);
        return ResultHelper.ok();
    }
    syncSpiceToMcuAdc(mcuInstUuid: string, adcChannel: number, voltage: number): ApiResult<void> {
        const key = `ADC${adcChannel}`;
        this.mcuRegs.set(key, Math.round((voltage / 3.3) * 4095));
        this.mcuPinVoltages.set(`${mcuInstUuid}:ADC${adcChannel}`, voltage);
        return ResultHelper.ok();
    }
    syncDigitalToAnalogNet(netUuid: string): ApiResult<void> {
        if (!this.topology)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'No topology loaded');
        const net = this.topology.netList.find(n => n.netUuid === netUuid);
        if (!net)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Net not found');
        const digitalLevel = net.defaultVoltage > 1.5 ? 1 : 0;
        this.nodeVoltages.set(net.netName, digitalLevel * 3.3);
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
        const prevAnalog = copyNumberMap(this.nodeVoltages);
        // Keep VAC/SIGGEN at simTime — default pinVoltageSources() uses inTransientStep=false
        // between steps and snaps pulse CLK back to DC offset (kills CD4017 edges).
        this.analogEngine.pinVoltageSources(false);
        const stepResult = this.scheduler.step(this.mcuPc, this.mcuRegs);
        this.globalTime = stepResult.time;
        // 1.3.12 模拟→数字 first: threshold events must land before Thevenin / instruments
        this.applyAnalogToDigitalThresholds(prevAnalog, stepResult.analogSignals);
        // Drain gate tPLH/tPHL (CD4017 Q updates) that land a few ns after the clock event
        let digitalNow = this.digitalEngine.processEvents(this.globalTime);
        digitalNow = this.digitalEngine.processEvents(this.globalTime + 100e-9);
        // 1.3.11 数字→模拟: Thevenin 源注入（用本步 A→D 之后的电平）
        this.applyDigitalToAnalogThevenin(digitalNow);
        // Populate node voltages with BOTH node names and net UUIDs for instrument lookup
        stepResult.analogSignals.forEach((val: number, name: string) => {
            this.nodeVoltages.set(name, val);
            this.updateWaveData(name, stepResult.time, val, 0);
        });
        // Mirror node voltages under net UUID keys — instruments bind by UUID, not SPICE node name
        const aeNetMap = this.analogEngine.getNetUuidMapping();
        aeNetMap.forEach((nodeName: string, netUuid: string) => {
            const voltage = this.nodeVoltages.get(nodeName);
            if (voltage !== undefined) {
                this.nodeVoltages.set(netUuid, voltage);
                // LA probes bind by UUID — keep a parallel wave so captureChannelsForProbes matches
                if (netUuid !== nodeName) {
                    this.updateWaveData(netUuid, stepResult.time, voltage, 0);
                }
            }
            else {
                const aeV = this.analogEngine.getVoltage(netUuid);
                this.nodeVoltages.set(netUuid, aeV);
                if (aeV !== 0 && !this.nodeVoltages.has(nodeName)) {
                    this.nodeVoltages.set(nodeName, aeV);
                }
            }
        });
        // Also copy from spiceNodeMap
        this.spiceNodeMap.forEach((nodeName: string, netUuid: string) => {
            const voltage = this.nodeVoltages.get(nodeName);
            if (voltage !== undefined) {
                if (!this.nodeVoltages.has(netUuid)) {
                    this.nodeVoltages.set(netUuid, voltage);
                }
                if (netUuid !== nodeName) {
                    this.updateWaveData(netUuid, stepResult.time, voltage, 0);
                }
            }
        });
        // Digital gate outputs win: Thevenin / dig levels must survive SPICE float=0 on LA nets
        const drivenNets = new Set<string>();
        const drivenList = this.digitalEngine.getDrivenNetIds();
        for (let di = 0; di < drivenList.length; di++) {
            drivenNets.add(drivenList[di]);
        }
        for (let i = 0; i < this.theveninSources.length; i++) {
            const src = this.theveninSources[i];
            this.nodeVoltages.set(src.netId, src.voltage);
            // Push THEV into wave ring at this step time (same-t overwrite of SPICE float)
            this.updateWaveData(src.netId, stepResult.time, src.voltage, 0);
            const spiceAlias = this.spiceNodeMap.get(src.netId);
            if (spiceAlias !== undefined && spiceAlias !== src.netId) {
                this.nodeVoltages.set(spiceAlias, src.voltage);
                this.updateWaveData(spiceAlias, stepResult.time, src.voltage, 0);
            }
        }
        stepResult.digitalStates.forEach((state: LogicState, nodeId: string) => {
            if (!drivenNets.has(nodeId)) {
                return;
            }
            if (state === LogicState.HIGH_Z || state === LogicState.UNKNOWN) {
                return;
            }
            const v = state === LogicState.HIGH ? VOH_HC_5V : 0;
            this.nodeVoltages.set(nodeId, v);
            this.updateWaveData(nodeId, stepResult.time, v, 0);
            const spice = this.spiceNodeMap.get(nodeId);
            if (spice !== undefined) {
                this.nodeVoltages.set(spice, v);
                this.updateWaveData(spice, stepResult.time, v, 0);
            }
        });
        const branchCurrents = this.analogEngine.getBranchCurrents();
        branchCurrents.forEach((current: number, name: string) => {
            this.branchCurrents.set(name, current);
        });
        // 电流表/功率表面板波形：按器件 UUID 记录 mA 时域（与电压网波形同采样率）
        this.analogEngine.forEachComponentCurrent((compUuid: string, amps: number) => {
            this.updateWaveData(`I(${compUuid})`, stepResult.time, amps * 1000, amps);
        });
        // 1.3.13 电源完整性 di/dt 噪声
        this.computeSupplyNoise(stepResult.time);
        this.accumulateResult(stepResult);
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
        const syncTime = this.globalTime;
        this.digitalEngine.processEvents(syncTime);
    }
    /**
     * Time-budgeted sim slice for Worker / fallback pump.
     * Hard caps are intentional: one slow SPICE step can exceed Date.now() budget and
     * starve the UI event loop (APP_INPUT_BLOCK / THREAD_BLOCK_*).
     *
     * IMPORTANT: must advance enough *sim* time per UI frame for AC scope.
     * Previously maxSpice=1 @ ~1µs/step × 40ms/frame → 1kHz needed minutes to fill
     * a 10ms display window (looked like flat DC with tiny last-V drift).
     *
     * 555 astable (no VAC): same class of bug — default DC nudge was 50µs/frame, so a
     * 10µF/7Hz timing cap never reached ⅔VCC and the scope looked stuck high.
     *
     * Op-amp RC oscillators (Schmitt + integrator, no VAC/555): same DC nudge + adaptive
     * dt collapse to 10ns after rail snaps → scope span stuck ~0.2ms (NaN ROLL fill).
     */
    runBudgetSteps(budgetMs: number = 3): number {
        if (this.state !== SimulationState.RUNNING) {
            return 0;
        }
        // Continuous interactive: never let stopTime kill the pump mid-scope session
        if (this.scheduler !== null && this.globalTime >= this.config.stopTime - 0.5) {
            this.config.stopTime = this.globalTime + 3600;
            this.scheduler.extendStopTime(3600);
        }
        const acFreq = this.analogEngine.getMaxAcFrequency();
        const has555 = this.analogEngine.getTimer555Count() > 0;
        // Op-amp RC oscillators (square/triangle) have no VAC/555 — old DC path only
        // advanced ~50µs/frame while rail snaps shrunk dt to 10ns → scope looked frozen.
        const hasCaps = this.analogEngine.getCapacitorCount() > 0;
        const hasOpamps = this.analogEngine.getOpampCount() > 0;
        const needsAnalogBurst = acFreq > 0 || has555 || hasCaps || hasOpamps;
        // AC+opamp (differentiator/integrator labs): give the main thread more wall
        // so SIGGEN half-periods arrive before the scope window looks DC-flat.
        const wallCap = (acFreq > 0 && hasOpamps) ? 28 : (needsAnalogBurst ? 12 : 4);
        // Sample KEY/net voltages into GPIO IDR before firmware reads inputs
        this.syncSpiceToGpioInputs();
        this.tickMcuCore();
        // Ideal VSRC edges must not drive adaptive dt shrink
        if (this.scheduler !== null) {
            this.scheduler.setAdaptiveIgnoreNodes(this.analogEngine.getForcedSourceNodes());
        }
        // Per-frame AC step target (re-bumped inside the loop so rail-snap shrink cannot stick)
        let acMax = 0;
        // 555 RC 优先：同板有 VAC 时若仍用 25µs AC 步长，定时电容充不到 ⅔VCC，LED 会卡在亮
        if (this.scheduler !== null && has555) {
            // RC astable edges are ms-scale; allow up to 1ms steps so Hz-range 555 can move
            this.scheduler.setMaxStepCap(1e-3);
            this.scheduler.setMinStepFloor(1e-5);
            this.scheduler.bumpStepToward(5e-4);
        }
        else if (this.scheduler !== null && acFreq > 0) {
            // Op-amp labs: 20 samples/period (was 40) — faster wall→sim so scope keeps scrolling
            const samplesPerPeriod = hasOpamps ? 20 : 40;
            const perSample = 1.0 / (acFreq * samplesPerPeriod);
            const acCeil = hasOpamps
                ? (acFreq < 100 ? 2e-3 : 2e-4)
                : (acFreq < 100 ? 5e-4 : 5e-5);
            acMax = Math.max(1e-6, Math.min(perSample, acCeil));
            const floorDiv = hasOpamps ? 80 : 200;
            const acFloor = Math.max(1e-7, Math.min(acMax / 2, 1.0 / (acFreq * floorDiv)));
            this.scheduler.setMaxStepCap(acMax);
            this.scheduler.setMinStepFloor(acFloor);
            this.scheduler.bumpStepToward(acMax);
        }
        else if (this.scheduler !== null && (hasCaps || hasOpamps)) {
            // Integrator / Schmitt: restore µs–tens-of-µs dt after large ΔV shrinks to 10ns
            this.scheduler.setMaxStepCap(5e-5);
            this.scheduler.setMinStepFloor(5e-7);
            this.scheduler.bumpStepToward(1e-5);
        }
        else if (this.scheduler !== null) {
            this.scheduler.setMaxStepCap(0);
            this.scheduler.setMinStepFloor(0);
        }
        // Target ≥1 full AC period/frame for opamp+SIGGEN (≤50ms); avoid exact N·T lock
        const targetAdvance = has555
            ? 4e-2
            : (acFreq > 0
                ? Math.min(5e-2, Math.max((hasOpamps ? 1.15 : 2.25) / acFreq, 2e-4))
                : ((hasCaps || hasOpamps) ? 5e-3 : 5e-5));
        const maxSpice = has555
            ? 80
            : (this.isAnyMcuLoaded()
                ? (acFreq > 0 ? 24 : 4)
                : (needsAnalogBurst ? (hasOpamps && acFreq > 0 ? 400 : 200) : 24));
        const sliceMs = needsAnalogBurst
            ? Math.max(budgetMs, (acFreq > 0 && hasOpamps) ? 18 : 8)
            : budgetMs;
        const deadline = Date.now() + Math.max(1, Math.min(sliceMs, wallCap));
        const t0 = this.globalTime;
        let steps = 0;
        while (steps < maxSpice && Date.now() < deadline &&
            (this.globalTime - t0) < targetAdvance) {
            this.runSpiceStep();
            if (acMax > 0 && this.scheduler !== null && (steps & 3) === 3) {
                this.scheduler.bumpStepToward(acMax);
            }
            if (this.analogEngine.updateRelayContactsFromCoil()) {
                if (this.analogEngine.needsDcResolveAfterSwitch()) {
                    this.analogEngine.reSolveOp();
                }
                else {
                    this.analogEngine.pinVoltageSources();
                }
            }
            this.syncSpiceToGpioInputs();
            if (this.isAnyMcuLoaded() && (steps & 1) === 1) {
                this.tickMcuCore();
            }
            this.tickDigitalLogic();
            steps++;
            this.budgetStepCount++;
        }
        // Stall recovery: must advance ≥1 SIGGEN period/frame or scope plateaus look frozen
        if (acFreq > 0 && this.scheduler !== null && (this.globalTime - t0) < (0.95 / acFreq)) {
            const forceDeadline = Date.now() + 12;
            this.scheduler.bumpStepToward(acMax > 0 ? acMax : 1e-5);
            const need = Math.max(targetAdvance, 1.05 / acFreq);
            while (steps < maxSpice + 80 && Date.now() < forceDeadline &&
                (this.globalTime - t0) < need) {
                this.runSpiceStep();
                steps++;
                this.budgetStepCount++;
            }
        }
        return steps;
    }
    buildFrameSnapshot(): KernelFrameSnapshot {
        const netKeys: string[] = [];
        const voltages: number[] = [];
        this.nodeVoltages.forEach((v: number, k: string) => {
            netKeys.push(k);
            voltages.push(v);
        });
        const branchKeys: string[] = [];
        const currents: number[] = [];
        this.branchCurrents.forEach((c: number, k: string) => {
            branchKeys.push(k);
            currents.push(c);
        });
        let mcuP1 = 0;
        if (this.mcu8051Loaded) {
            mcuP1 = this.mcu8051.getPort1();
        }
        const gpioWords: number[] = [];
        let uartBytes: number[] = [];
        if (this.mcuStm32Loaded && this.qemuBridge.isRunning()) {
            // GPIOA..E ODR snapshot for UI LEDs
            const bases: number[] = [0x40010800, 0x40010C00, 0x40011000, 0x40011400, 0x40011800];
            for (let i = 0; i < bases.length; i++) {
                gpioWords.push(this.qemuBridge.readPeriph(bases[i] + 0x0C) & 0xFFFF);
            }
            uartBytes = this.qemuBridge.drainUartTx();
            if (uartBytes.length > 0) {
                traceUartTxDrain('kernel_snap', uartBytes);
            }
        }
        return {
            t: this.globalTime,
            stepCount: this.budgetStepCount,
            netKeys: netKeys,
            voltages: voltages,
            branchKeys: branchKeys,
            currents: currents,
            mcuFamily: this.mcuFamily,
            mcuPc: this.mcuPc,
            mcuP1: mcuP1,
            gpioWords: gpioWords,
            uartBytes: uartBytes,
            state: this.state as string
        };
    }
    /** Mirror remote Worker frame onto this kernel for UI instrument / canvas reads */
    applyFrameSnapshot(frame: KernelFrameSnapshot): void {
        for (let i = 0; i < frame.netKeys.length; i++) {
            this.nodeVoltages.set(frame.netKeys[i], frame.voltages[i] ?? 0);
        }
        for (let i = 0; i < frame.branchKeys.length; i++) {
            this.branchCurrents.set(frame.branchKeys[i], frame.currents[i] ?? 0);
        }
        // Worker net UUIDs often differ from UI document; rematch via spice / net name
        if (this.schematic !== null) {
            for (let i = 0; i < this.schematic.nets.length; i++) {
                const net = this.schematic.nets[i];
                const spice = this.spiceNodeMap.get(net.id) ??
                    this.analogEngine.getNodeNameForNetUuid(net.id);
                let v: number | undefined = undefined;
                if (spice.length > 0) {
                    v = this.nodeVoltages.get(spice);
                }
                if (v === undefined && net.name.length > 0) {
                    v = this.nodeVoltages.get(net.name);
                }
                if (v !== undefined) {
                    this.nodeVoltages.set(net.id, v);
                }
            }
        }
        this.globalTime = frame.t;
        this.budgetStepCount = frame.stepCount;
        this.mcuPc = frame.mcuPc;
        this.mcuFamily = frame.mcuFamily.length > 0 ? frame.mcuFamily : this.mcuFamily;
        this.mcuRegs.set('PC', frame.mcuPc);
        this.mcuRegs.set('P1', frame.mcuP1);
    }
    getBudgetStepCount(): number {
        return this.budgetStepCount;
    }
    tickMcuCore(): void {
        let anyTicked = false;
        // STM32 local interpreter — revive if false-dead (old IPC timeout) or PC OOB halt
        if (this.mcuStm32Loaded && !this.qemuBridge.isRunning()) {
            const revived = this.qemuBridge.ensureRunning();
            traceMcuTick('STM32', `REVIVE ok=${revived ? 1 : 0} idleMs=${this.qemuBridge.idleMs()} ` +
                `pc=0x${this.qemuBridge.getPc().toString(16)} fw=${this.qemuBridge.getFirmwareSize()}`);
        }
        if (this.mcuStm32Loaded && this.qemuBridge.isRunning()) {
            anyTicked = true;
            // lab_uart init ~20 instr + TXE poll; lab_memory bit-bang needs larger slices
            const step = this.qemuBridge.step(512);
            if (step.success && step.data !== undefined) {
                // Prefer 8051 PC in dual-core status when both run; else expose STM32 PC.
                if (!this.mcu8051Loaded) {
                    this.mcuPc = step.data;
                    this.mcuRegs.set('PC', this.mcuPc);
                }
            }
            this.syncStm32GpioToSpice();
            if (this.mcuTickCount <= 5 || this.mcuTickCount % 25 === 0) {
                const stmPc = (step.success && step.data !== undefined) ? step.data : this.mcuPc;
                const cra = this.qemuBridge.readPeriph(0x40010800);
                const crb = this.qemuBridge.readPeriph(0x40010C00);
                const crc = this.qemuBridge.readPeriph(0x40011000);
                const oa = this.qemuBridge.readPeriph(0x4001080C);
                const ob = this.qemuBridge.readPeriph(0x40010C0C);
                const oc = this.qemuBridge.readPeriph(0x4001100C);
                traceMcuTick('STM32', `pc=0x${stmPc.toString(16)} ticks=${this.mcuTickCount + 1} ` +
                    `CRL_A=0x${(cra >>> 0).toString(16)} ODR_A=0x${(oa & 0xFFFF).toString(16)} ` +
                    `CRL_B=0x${(crb >>> 0).toString(16)} ODR_B=0x${(ob & 0xFFFF).toString(16)} ` +
                    `CRL_C=0x${(crc >>> 0).toString(16)} ODR_C=0x${(oc & 0xFFFF).toString(16)}`);
            }
        }
        if (this.mcu8051Loaded) {
            anyTicked = true;
            // lab_51_led delay ≈ 8×255 DJNZ ≈ 2k instr / LED. Budget steps per UI tick so
            // one Port1 bit spans several frames (smooth chase) without a 12k main-thread burst.
            // Stop early when P1 changes so we never skip a bit inside one batch.
            const prevP1 = this.mcu8051.getPort1();
            // Keep MCU slices small so main/fallback pumps cannot monopolize the UV loop
            const maxSteps = 96;
            let steps = 0;
            while (steps < maxSteps) {
                this.mcu8051.step();
                steps++;
                if (this.mcu8051.getPort1() !== prevP1) {
                    break;
                }
            }
            const p1 = this.mcu8051.getPort1();
            const acc = this.mcu8051.getAcc();
            this.mcuPc = this.mcu8051.getPc();
            this.mcuRegs.set('PC', this.mcuPc);
            this.mcuRegs.set('P1', p1);
            this.mcuRegs.set('ACC', acc);
            this.syncMcuPinsToSpice();
            if (this.mcuTickCount <= 5 || this.mcuTickCount % 25 === 0) {
                traceMcuTick('8051', `pc=0x${this.mcuPc.toString(16)} steps=${steps} P1=0x${(p1 & 0xFF).toString(16)} ` +
                    `ACC=0x${(acc & 0xFF).toString(16)} ticks=${this.mcuTickCount + 1}`);
            }
        }
        if (anyTicked) {
            this.mcuTickCount++;
        }
        else {
            this.mcuPc += 1;
            this.mcuRegs.set('PC', this.mcuPc);
        }
    }
    /** True if at least one MCU backend has firmware loaded. */
    private isAnyMcuLoaded(): boolean {
        return this.mcu8051Loaded || this.mcuStm32Loaded;
    }
    /** Refresh status label after load/unload of either core. */
    private refreshMcuFamilyLabel(): void {
        if (this.mcu8051Loaded && this.mcuStm32Loaded) {
            this.mcuFamily = `8051+${this.mcuStm32Family}`;
        }
        else if (this.mcuStm32Loaded) {
            this.mcuFamily = this.mcuStm32Family;
        }
        else if (this.mcu8051Loaded) {
            this.mcuFamily = '8051';
        }
    }
    loadMcuProgram(data: Uint8Array, offset: number = 0, family: string = '8051'): void {
        const fam = family.toUpperCase();
        this.mcuTickCount = 0;
        this.lastTracedGpio.clear();
        traceBurn('SIM_LOAD_MCU', `family=${fam} offset=${offset} bytes=${data.length} preview=${formatFirmwarePreview(data)} ` +
            `prev8051=${this.mcu8051Loaded ? 1 : 0} prevStm32=${this.mcuStm32Loaded ? 1 : 0}`);
        if (fam.startsWith('STM32')) {
            this.mcuStm32Family = fam;
            this.qemuBridge.loadFirmware(data);
            this.qemuBridge.start('firmware.hex', 'stm32f103');
            this.mcuStm32Loaded = true;
            // Keep any already-loaded 8051 firmware; dual-core boards need both ticking.
            this.refreshMcuFamilyLabel();
            if (this.topology) {
                for (let bit = 0; bit < 8; bit++) {
                    const digitalNetId = `mcu0_GPIO${bit}`;
                    const analogNode = this.spiceNodeMap.get(digitalNetId) ?? digitalNetId;
                    this.crossCoupledNets.set(digitalNetId, analogNode);
                }
            }
            this.syncStm32GpioToSpice();
            traceBurn('SIM_LOAD_MCU_OK', `backend=qemu machine=stm32f103 bytes=${data.length} ` +
                `keep8051=${this.mcu8051Loaded ? 1 : 0} familyLabel=${this.mcuFamily}`);
            return;
        }
        // Sanity: Intel HEX text starts with ':' (0x3A) — must not load as machine code
        if (data.length > 0 && data[0] === 0x3A) {
            traceBurn('SIM_LOAD_MCU_FAIL', 'payload looks like Intel HEX ASCII (starts with 0x3A/:); pass parsed binary image');
        }
        this.mcu8051.loadProgram(data, offset);
        this.mcu8051.reset();
        this.mcu8051Loaded = true;
        // Keep any already-running STM32/QEMU core.
        this.refreshMcuFamilyLabel();
        this.syncMcuPinsToSpice();
        const mem = this.mcu8051.getMemory();
        const peek = `${(mem[0] ?? 0).toString(16)} ${(mem[1] ?? 0).toString(16)} ${(mem[2] ?? 0).toString(16)} ` +
            `| @100 ${(mem[0x100] ?? 0).toString(16)} ${(mem[0x101] ?? 0).toString(16)} ${(mem[0x102] ?? 0).toString(16)}`;
        traceBurn('SIM_LOAD_MCU_OK', `backend=8051 offset=${offset} bytes=${data.length} pc=0x${this.mcu8051.getPc().toString(16)} ` +
            `mem=[${peek}] keepStm32=${this.mcuStm32Loaded ? 1 : 0} familyLabel=${this.mcuFamily}`);
    }
    injectUsartRx(bytes: number[]): void {
        if (bytes.length === 0) {
            return;
        }
        const fam = this.mcuFamily.length > 0 ? this.mcuFamily : '(empty)';
        const running = this.qemuBridge.isRunning();
        if (this.mcuStm32Loaded && running) {
            traceUart('KERNEL_RX_INJECT', `family=${fam} loaded=1 qemuRun=1 n=${bytes.length} ` +
                `hex=${formatUartBytesHex(bytes)}`);
            this.qemuBridge.injectUsartRx(bytes);
        }
        else {
            traceUart('KERNEL_RX_DROP', `family=${fam} stm32=${this.mcuStm32Loaded ? 1 : 0} ` +
                `qemuRun=${running ? 1 : 0} n=${bytes.length} hex=${formatUartBytesHex(bytes)} — not forwarded to USART`);
        }
    }
    /**
     * Drive each MCU GPIO onto its schematic net (8051 Port1 准双向).
     * AT89C51 DIP: package pins P1..P8 = Port1 bit0..bit7 (lab_51_led wiring).
     * LOW → 灌电流到 0V 点亮; HIGH → 拉到 VCC（不能 HiZ，否则阴极电压粘在 0、多灯常亮）。
     */
    private syncMcuPinsToSpice(): void {
        if (!this.schematic) {
            return;
        }
        const supply = SimulationKernelImpl.resolveSupplyVoltage(this.schematic);
        for (let c = 0; c < this.schematic.components.length; c++) {
            const comp = this.schematic.components[c];
            const lib = comp.libraryId.toUpperCase();
            if (!lib.includes('89C51') && !lib.includes('8051') && !lib.includes('AT89') &&
                !lib.includes('MCS51') && !lib.includes('STC89') && !lib.includes('STC15')) {
                continue;
            }
            let portVal = 0;
            const drives: string[] = [];
            const missPins: string[] = [];
            for (let bit = 0; bit < 8; bit++) {
                const level = this.mcu8051.getPinLevel('P1', bit);
                if (level > 0) {
                    portVal |= (1 << bit);
                }
                const candidates: string[] = [`P1.${bit}`, `P1_${bit}`, `P${bit + 1}`];
                const nodeName = this.findMcuPinSpiceNode(comp.id, candidates);
                if (nodeName === null || nodeName.length === 0 || nodeName === '0') {
                    missPins.push(candidates[0]);
                    continue;
                }
                const srcId = `MCU_${comp.id}_P1_${bit}`;
                const voltage = level > 0 ? supply : 0;
                this.analogEngine.registerSignalSource(srcId, nodeName, '0', 'dc', voltage, 0, 0, 0, 0.5);
                this.nodeVoltages.set(nodeName, voltage);
                this.mcuPinVoltages.set(`${comp.id}:P1.${bit}`, voltage);
                drives.push(`P1.${bit}->${candidates[0]} node=${nodeName} V=${voltage.toFixed(1)} (${level > 0 ? 'H' : 'L'})`);
            }
            const traceKey = `${comp.id}:P1`;
            const prev = this.lastTracedGpio.get(traceKey);
            // Log on first sync, when port pattern changes, or first time we detect unbound pins
            const missKey = `${traceKey}:miss`;
            const missNew = missPins.length > 0 && !this.lastTracedGpio.has(missKey);
            const portChanged = prev === undefined || prev !== portVal;
            // Always pin Vsrc after registerSignalSource so cathode sinks take effect this frame
            this.analogEngine.pinVoltageSources();
            if (portChanged || missNew) {
                this.lastTracedGpio.set(traceKey, portVal);
                if (missPins.length > 0) {
                    this.lastTracedGpio.set(missKey, missPins.length);
                }
                if (portChanged) {
                    // Re-OP so LED anode/cathode / series-R settle with new MCU Thevenin drives
                    this.analogEngine.reSolveOp();
                    this.syncVoltagesFromAnalogEngine();
                }
                traceMcuGpioSync('8051', comp.refDes, 'P1', portVal, drives, missPins);
                this.tracePeripheralIndicators('8051-gpio');
            }
        }
    }
    /**
     * Sample SW + RELAY + LED together for instr_trace (DNO/DNC dual-lit diagnosis).
     */
    private tracePeripheralIndicators(reason: string): void {
        if (!this.schematic) {
            return;
        }
        Logger.info(INSTR_TRACE_TAG, `[DIAG] peripheral snapshot reason=${reason}`);
        this.traceSwitchStates();
        const relLines = this.analogEngine.getRelayTraceLines();
        if (relLines.length > 0) {
            // Resolve refDes for readability
            const named: string[] = [];
            for (let i = 0; i < relLines.length; i++) {
                const line = relLines[i];
                const space = line.indexOf(' ');
                const id = space > 0 ? line.substring(0, space) : line;
                const rest = space > 0 ? line.substring(space + 1) : '';
                const comp = this.schematic.components.find(c => c.id === id);
                named.push(comp !== undefined ? `${comp.refDes} ${rest}` : line);
            }
            traceRelaySample(named);
        }
        this.traceLedForwardVoltages();
    }
    private traceSwitchStates(): void {
        if (!this.schematic) {
            return;
        }
        const lines: string[] = [];
        for (let i = 0; i < this.schematic.components.length; i++) {
            const comp = this.schematic.components[i];
            const lib = comp.libraryId.toUpperCase();
            if (lib !== 'SW_PUSH' && !lib.includes('SWITCH_PUSH') && lib !== 'BUTTON') {
                continue;
            }
            const pressedRaw = (comp.parameters.get('pressed') ?? '0').trim().toLowerCase();
            const closed = pressedRaw === '1' || pressedRaw === 'true' || pressedRaw === 'on' ||
                pressedRaw === 'pressed' || pressedRaw === 'yes';
            const pinNets = getPinNetMap(comp.id, this.schematic.nets);
            let v1 = -999;
            let v2 = -999;
            let net1 = '';
            let net2 = '';
            const pinKeys = Array.from(pinNets.keys());
            for (let pk = 0; pk < pinKeys.length; pk++) {
                const pin = pinKeys[pk];
                const netId = pinNets.get(pin) ?? '';
                if (netId.length === 0) {
                    continue;
                }
                const v = this.getNetVoltageByUuid(netId);
                let name = netId;
                for (let ni = 0; ni < this.schematic.nets.length; ni++) {
                    if (this.schematic.nets[ni].id === netId) {
                        name = this.schematic.nets[ni].name;
                        break;
                    }
                }
                const pinU = pin.toUpperCase();
                if (pinU === '1' || pinU === 'A') {
                    v1 = v;
                    net1 = name;
                }
                else if (pinU === '2' || pinU === 'B') {
                    v2 = v;
                    net2 = name;
                }
            }
            const iSw = this.getBranchCurrent(comp.id);
            lines.push(`${comp.refDes} pressed=${closed ? '1' : '0'} (${closed ? 'CLOSED' : 'OPEN'}) ` +
                `net1=${net1} V=${v1.toFixed(2)} net2=${net2} V=${v2.toFixed(2)} I=${iSw.toExponential(2)}A`);
        }
        traceSwitchSample(lines);
    }
    /**
     * Sample LED A/K voltages + branch current for instr_trace.
     * lit/off matches canvas: requires forward current (floating Vk=0 must stay off).
     */
    private traceLedForwardVoltages(): void {
        if (!this.schematic) {
            return;
        }
        const lines: string[] = [];
        for (let i = 0; i < this.schematic.components.length; i++) {
            const comp = this.schematic.components[i];
            const lib = comp.libraryId.toUpperCase();
            if (!lib.startsWith('LED')) {
                continue;
            }
            const pinNets = this.analogEngine.getNetUuidMapping();
            let vA = -999;
            let vK = -999;
            let nodeA = '';
            let nodeK = '';
            for (let n = 0; n < this.schematic.nets.length; n++) {
                const net = this.schematic.nets[n];
                for (let p = 0; p < net.pinIds.length; p++) {
                    const parts = net.pinIds[p].split(':');
                    if (parts.length < 2 || parts[0] !== comp.id) {
                        continue;
                    }
                    const pinKey = (parts.length >= 3 ? parts[2] : parts[1]).toUpperCase();
                    const node = pinNets.get(net.id) ?? this.spiceNodeMap.get(net.id) ?? '';
                    const v = node.length > 0 ? this.analogEngine.getVoltage(node) : this.getNetVoltageByUuid(net.id);
                    if (pinKey === 'A' || pinKey === 'ANODE' || pinKey === '1') {
                        vA = v;
                        nodeA = node.length > 0 ? node : (net.name ?? net.id);
                    }
                    else if (pinKey === 'K' || pinKey === 'CATHODE' || pinKey === '2') {
                        vK = v;
                        nodeK = node.length > 0 ? node : (net.name ?? net.id);
                    }
                }
            }
            if (vA > -900 && vK > -900) {
                const vf = vA - vK;
                const iLed = Math.abs(this.getBranchCurrent(comp.id));
                // Match SchematicCanvas lit/dim/off (voltage + ballast-drop fallback)
                let tag = 'off';
                if (vK >= 2.5) {
                    tag = 'off';
                }
                else if (vK <= 0.9 && vf >= 1.2) {
                    // 与 SchematicCanvas.isLedConducting 一致：Vk 近地 + Vf 足够即视为亮
                    tag = 'lit';
                }
                else if (iLed >= 5e-4 && vf >= 1.0) {
                    tag = 'lit';
                }
                else if (vf >= 0.25) {
                    // 正向偏置但未达亮灯阈值 → UI 昏暗原色
                    tag = 'dim';
                }
                else if (iLed >= 1e-5 && vf >= 0.15) {
                    tag = 'dim';
                }
                else {
                    tag = 'off';
                }
                lines.push(`${comp.refDes} Va=${vA.toFixed(2)} Vk=${vK.toFixed(2)} Vf=${vf.toFixed(2)} ` +
                    `I=${iLed.toExponential(2)}A A=${nodeA} K=${nodeK} ${tag}`);
            }
        }
        traceLedVfSample(lines);
    }
    /**
     * STM32 GPIOA/B/C ODR → schematic pins PA0.. / PAxx / package Pnn.
     * Uses real MCU component UUID (not hardcoded mcu0).
     */
    private syncStm32GpioToSpice(): void {
        if (!this.schematic) {
            return;
        }
        const gpioBases = [0x40010800, 0x40010C00, 0x40011000];
        const portLetters = ['A', 'B', 'C'];
        for (let c = 0; c < this.schematic.components.length; c++) {
            const comp = this.schematic.components[c];
            const lib = comp.libraryId.toUpperCase();
            if (!lib.includes('STM32')) {
                continue;
            }
            for (let port = 0; port < gpioBases.length; port++) {
                const base = gpioBases[port];
                const odr = this.qemuBridge.readPeriph(base + 0x0C);
                const crl = this.qemuBridge.readPeriph(base + 0x00);
                const crh = this.qemuBridge.readPeriph(base + 0x04);
                const letter = portLetters[port];
                const drives: string[] = [];
                const missPins: string[] = [];
                let drivenBits = 0;
                for (let bit = 0; bit < 16; bit++) {
                    // Only push nets for pins configured as GPIO output (MODE≠00).
                    // Teaching map GPIOAn→P(n+1) also hits OSC/NRST package pins — never stamp those.
                    const crNibble = bit < 8
                        ? ((crl >>> (bit * 4)) & 0xF)
                        : ((crh >>> ((bit - 8) * 4)) & 0xF);
                    const mode = crNibble & 0x3;
                    if (mode === 0) {
                        continue;
                    }
                    const level = (odr >> bit) & 1;
                    const pinLabels: string[] = [
                        `P${letter}${bit}`,
                        `${letter}${bit}`,
                        `P${letter}.${bit}`
                    ];
                    // Teaching templates often wire package pin Pn (genMcuPins) — map GPIOA0→P1, etc.
                    if (port === 0 && bit < 16) {
                        pinLabels.push(`P${bit + 1}`);
                    }
                    const nodeName = this.findMcuPinSpiceNode(comp.id, pinLabels);
                    if (nodeName === null || nodeName.length === 0 || nodeName === '0') {
                        if (port === 0 && bit < 8) {
                            missPins.push(pinLabels[0]);
                        }
                        continue;
                    }
                    const nu = nodeName.toUpperCase();
                    if (nu === 'GND' || nu === 'VCC' || nu === 'VDD' ||
                        nu.includes('NRST') || nu.includes('XTAL') || nu.includes('OSC')) {
                        continue;
                    }
                    drivenBits++;
                    const srcId = `MCU_${comp.id}_P${letter}${bit}`;
                    // Match board rail (lab VCC=5V). Hardcoded 3.3 left coil at ~1.8V below 2.25V thresh.
                    const supply = this.schematic !== null
                        ? SimulationKernelImpl.resolveSupplyVoltage(this.schematic) : 3.3;
                    const voltage = level > 0 ? supply : 0;
                    this.analogEngine.registerSignalSource(srcId, nodeName, '0', 'dc', voltage, 0, 0, 0, 0.5);
                    this.nodeVoltages.set(nodeName, voltage);
                    this.mcuPinVoltages.set(`${comp.id}:P${letter}${bit}`, voltage);
                    drives.push(`P${letter}${bit}->${pinLabels[pinLabels.length - 1]} node=${nodeName} ` +
                        `V=${voltage.toFixed(1)} (${level > 0 ? 'H' : 'L'})`);
                }
                const traceKey = `${comp.id}:GPIO${letter}`;
                const crlKey = `${traceKey}:crl`;
                const prev = this.lastTracedGpio.get(traceKey);
                const prevCrl = this.lastTracedGpio.get(crlKey);
                const port8 = odr & 0xFF;
                const crl8 = crl & 0xFFFFFFFF;
                const missKey = `${traceKey}:miss`;
                const missNew = missPins.length > 0 && drivenBits === 0 && !this.lastTracedGpio.has(missKey);
                const crlChanged = prevCrl === undefined || prevCrl !== crl8;
                const odrChanged = prev === undefined || prev !== port8;
                // Always pin VSRC when we drive nets — do not gate on ODR change alone
                // (first configured outputs often arrive with ODR still 0; skipping pin left them dead)
                if (drives.length > 0) {
                    this.analogEngine.pinVoltageSources();
                }
                if (odrChanged || crlChanged || missNew) {
                    this.lastTracedGpio.set(traceKey, port8);
                    this.lastTracedGpio.set(crlKey, crl8);
                    if (missNew) {
                        this.lastTracedGpio.set(missKey, 1);
                    }
                    if (drives.length > 0 || missPins.length > 0 || crlChanged) {
                        Logger.info(INSTR_TRACE_TAG, `[MCU] GPIO_CFG ${letter} CRL=0x${(crl >>> 0).toString(16)} ` +
                            `CRH=0x${(crh >>> 0).toString(16)} ODR=0x${(odr & 0xFFFF).toString(16)} drives=${drives.length}`);
                        if (drives.length > 0 || missPins.length > 0) {
                            traceMcuGpioSync('STM32', `${comp.refDes}/GPIO${letter}`, `P${letter}`, port8, drives, missPins);
                            this.tracePeripheralIndicators(`stm32-gpio-${letter}`);
                        }
                    }
                    if (odrChanged && drives.length > 0) {
                        this.analogEngine.reSolveOp();
                        if (this.analogEngine.updateRelayContactsFromCoil()) {
                            if (this.analogEngine.needsDcResolveAfterSwitch()) {
                                this.analogEngine.reSolveOp();
                            }
                            else {
                                this.analogEngine.pinVoltageSources();
                            }
                        }
                    }
                }
            }
        }
    }
    /** Resolve schematic pin label → SPICE node name for an MCU instance. */
    private findMcuPinSpiceNode(compId: string, pinCandidates: string[]): string | null {
        if (!this.schematic) {
            return null;
        }
        const aeMap = this.analogEngine.getNetUuidMapping();
        for (let n = 0; n < this.schematic.nets.length; n++) {
            const net = this.schematic.nets[n];
            for (let p = 0; p < net.pinIds.length; p++) {
                const parts = net.pinIds[p].split(':');
                if (parts.length < 2 || parts[0] !== compId) {
                    continue;
                }
                const pinKey = parts[1];
                const pinName = parts.length >= 3 ? parts[2] : pinKey;
                for (let i = 0; i < pinCandidates.length; i++) {
                    const cand = pinCandidates[i];
                    if (pinKey === cand || pinName === cand) {
                        const fromAe = aeMap.get(net.id);
                        if (fromAe !== undefined && fromAe.length > 0) {
                            return fromAe;
                        }
                        const fromSpice = this.spiceNodeMap.get(net.id);
                        if (fromSpice !== undefined && fromSpice.length > 0) {
                            return fromSpice;
                        }
                        if (net.name.length > 0) {
                            return net.name;
                        }
                        // Pin is on an unnamed net — still driveable via uuid / synthetic node
                        return net.id.length > 0 ? net.id : null;
                    }
                }
            }
        }
        return null;
    }
    runParamScan(paramName: string, start: number, end: number, steps: number): SimStatResult[] {
        const results: SimStatResult[] = [];
        const step = (end - start) / Math.max(steps - 1, 1);
        this.saveParamDefaults();
        for (let i = 0; i < steps; i++) {
            const value = start + step * i;
            this.restoreParamDefaults();
            if (this.schematic) {
                for (let c = 0; c < this.schematic.components.length; c++) {
                    const comp = this.schematic.components[c];
                    if (comp.parameters.has(paramName)) {
                        comp.parameters.set(paramName, `${value}`);
                    }
                }
                this.analogEngine.loadSchematic(this.schematic, this.config);
            }
            const spice = this.runSpiceStep();
            const voltages: number[] = [];
            spice.nodeVoltages.forEach((voltage: number) => voltages.push(voltage));
            const stats = SimulationKernelImpl.computeStats(voltages);
            results.push({ runIndex: i, mean: stats.mean, stdDev: stats.stdDev, min: stats.min, max: stats.max, cp: stats.cp, cpk: stats.cpk, waves: this.waveDataList.slice() });
        }
        this.restoreParamDefaults();
        return results;
    }
    runMonteCarlo(count: number, onProgress?: ProgressCallback): SimStatResult[] {
        const results: SimStatResult[] = [];
        this.saveParamDefaults();
        const batchSteps = Math.min(100, Math.floor(this.config.stopTime / Math.max(this.config.stepSize, 1e-9)));
        for (let i = 0; i < count; i++) {
            this.restoreParamDefaults();
            if (this.schematic) {
                for (let c = 0; c < this.schematic.components.length; c++) {
                    const comp = this.schematic.components[c];
                    comp.parameters.forEach((val: string, key: string) => {
                        if (comp.libraryId.startsWith('R_') || comp.libraryId.includes('Resistor')) {
                            const nominal = SimulationKernelImpl.parseNumericValue(val);
                            const sampled = RandomUtil.sampleWithTolerance(nominal, 5);
                            comp.parameters.set(key, `${sampled}`);
                        }
                        else if (comp.libraryId.startsWith('C_') || comp.libraryId.includes('Cap')) {
                            const nominal = SimulationKernelImpl.parseNumericValue(val);
                            const sampled = RandomUtil.sampleWithTolerance(nominal, 10);
                            comp.parameters.set(key, `${sampled}`);
                        }
                    });
                }
                // Reload with perturbed parameters and reset scheduler
                this.analogEngine.loadSchematic(this.schematic, this.config);
                this.scheduler?.reset();
            }
            // Run a batch of transient steps to reach steady state
            for (let s = 0; s < batchSteps; s++) {
                this.runSpiceStep();
            }
            const voltages: number[] = [];
            this.nodeVoltages.forEach((voltage: number) => voltages.push(voltage));
            const stats = SimulationKernelImpl.computeStats(voltages);
            results.push({
                runIndex: i, mean: stats.mean, stdDev: stats.stdDev,
                min: stats.min, max: stats.max, cp: stats.cp, cpk: stats.cpk,
                waves: this.waveDataList.slice()
            });
            onProgress?.(makeProgress(Math.round((i + 1) / count * 100), `Monte Carlo ${i + 1}/${count}`));
        }
        this.restoreParamDefaults();
        onProgress?.(makeProgress(100, 'Monte Carlo complete', true));
        return results;
    }
    runNoiseAnalysis(freqStart: number, freqEnd: number, points: number): FreqNoiseData[] {
        const data: FreqNoiseData[] = [];
        const runner = new SpiceRunner(this.analogEngine);
        runner.init();
        // Use actual noise model: thermal (4kTR), shot (2qIc), flicker (Kf/f)
        // Sample at logarithmically spaced frequencies
        const logStart = Math.log10(Math.max(freqStart, 1));
        const logEnd = Math.log10(Math.max(freqEnd, 1));
        const step = (logEnd - logStart) / Math.max(points - 1, 1);
        for (let i = 0; i < points; i++) {
            const freq = Math.pow(10, logStart + step * i);
            // Find a representative output node from the netlist
            const nl = this.analogEngine.getNetlist().split('\n');
            let outNode = 'N1';
            for (const line of nl) {
                const tokens = line.trim().split(/\s+/);
                if (tokens.length >= 3 && !line.startsWith('*') && !line.startsWith('.')) {
                    const n = tokens[1];
                    if (n !== '0' && n !== 'GND' && n !== 'VCC') {
                        outNode = n;
                        break;
                    }
                }
            }
            const noiseResult = runner.runNoise(outNode, freq);
            const noiseV = noiseResult.nodeVoltages.get(outNode) ?? 0;
            const noiseDb = noiseV > 1e-30 ? 20 * Math.log10(noiseV) : -200;
            data.push({ frequency: freq, noiseDb: noiseDb });
        }
        return data;
    }
    generateSpiceNetlistFromTopo(topo: SchTopology): ApiResult<string> {
        const cfg = this.simConfig ? this.toLegacyConfig(this.simConfig) : this.config;
        const build = SpiceMatrixBuilder.build(topo, cfg.temperature, cfg.stepSize, cfg.stopTime);
        this.spiceNodeMap = build.nodeMap;
        return ResultHelper.ok(build.netlist);
    }
    netToSpiceNodeMap(): Map<string, string> {
        if (this.topology) {
            const cfg = this.simConfig ? this.toLegacyConfig(this.simConfig) : this.config;
            const build = SpiceMatrixBuilder.build(this.topology, cfg.temperature, cfg.stepSize, cfg.stopTime);
            this.spiceNodeMap = build.nodeMap;
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
    // ---- v1 兼容 ----
    loadSchematic(doc: SchematicDocument): Result<void> {
        const prevState = this.state;
        // Rebuild connectivity before stamping — caller docs may be stale
        const grid = doc.metadata !== undefined && doc.metadata.gridSize > 0 ? doc.metadata.gridSize : 10;
        ensureNetPinConnectivity(doc, grid, this.pinGeometryResolver);
        this.schematic = doc;
        this.topology = TopologyAdapter.toTopology(doc);
        this.digitalEngine.loadSchematic(doc);
        this.analogEngine.loadSchematic(doc, this.config);
        this.scheduler = new GlobalScheduler(this.config, this.digitalEngine, this.analogEngine);
        if (this.topology) {
            this.buildSpiceNodeMap(this.topology);
        }
        if (prevState === SimulationState.RUNNING || prevState === SimulationState.PAUSED) {
            this.waveDataList = [];
            this.state = prevState;
            traceLoadSchematic(true, doc.components.length, doc.nets.length);
        }
        else {
            this.state = SimulationState.IDLE;
            this.result = null;
            traceLoadSchematic(false, doc.components.length, doc.nets.length);
        }
        return { success: true, errCode: ErrCode.OK };
    }
    setConfig(config: SimulationConfig): void {
        this.config = config;
        if (this.schematic) {
            this.analogEngine.loadSchematic(this.schematic, config);
            this.scheduler = new GlobalScheduler(config, this.digitalEngine, this.analogEngine);
        }
    }
    getConfig(): SimulationConfig { return this.config; }
    start(): Result<void> {
        if (!this.schematic)
            return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: 'No schematic loaded' };
        this.state = SimulationState.RUNNING;
        this.scheduler?.reset();
        const startedData: SimStartedData = { config: this.config };
        EventBus.getInstance().publish({
            event: ModuleEvent.SIMULATION_STARTED,
            source: 'simulation_kernel',
            timestamp: Date.now(),
            data: startedData
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
        const stoppedData: SimStoppedData = {};
        EventBus.getInstance().publish({
            event: ModuleEvent.SIMULATION_STOPPED,
            source: 'simulation_kernel',
            timestamp: Date.now(),
            data: stoppedData
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
        const stepResult = this.scheduler.step(this.mcuPc, this.mcuRegs);
        this.tickMcuCore();
        if (this.mcu8051Loaded) {
            this.mcuPc = this.mcu8051.getPc();
        }
        this.globalTime = stepResult.time;
        this.accumulateResult(stepResult);
        this.dynamicErcViolations = DynamicErcEngine.analyze(this.waveDataList, this.result?.digitalStates ? this.flattenDigitalStates(this.result.digitalStates) : new Map<string, string>());
        const emptyStep: SimStepEmptyData = { empty: true };
        const stepData: Object = this.result !== null ? this.result as Object : emptyStep;
        EventBus.getInstance().publish({
            event: ModuleEvent.SIMULATION_STEP,
            source: 'simulation_kernel',
            timestamp: Date.now(),
            data: stepData
        });
        if (this.scheduler.isFinished()) {
            // Interactive continuous: slide horizon instead of STOPPED (scope looked frozen)
            this.config.stopTime = this.globalTime + 3600;
            this.scheduler.extendStopTime(3600);
        }
        return { success: true, errCode: ErrCode.OK, data: this.result! };
    }
    getState(): SimulationState { return this.state; }
    getResult(): SimulationResult | null { return this.result; }
    getSignalData(signalName: string): Result<number[]> {
        if (!this.result)
            return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: 'No simulation result' };
        const data = this.result.signals.get(signalName);
        if (!data)
            return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: `Signal ${signalName} not found` };
        return { success: true, errCode: ErrCode.OK, data };
    }
    getDigitalState(pinId: string): boolean {
        const states = this.result?.digitalStates.get(pinId);
        if (!states || states.length === 0)
            return false;
        return states[states.length - 1] === LogicState.HIGH;
    }
    getMcuSnapshot(): McuRegisterSnapshot | null {
        if (!this.result?.mcuRegisters?.length)
            return null;
        return this.result.mcuRegisters[this.result.mcuRegisters.length - 1];
    }
    setComponentParameter(componentId: string, param: string, value: string): Result<void> {
        if (!this.schematic)
            return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: 'No schematic loaded' };
        const comp = this.schematic.components.find(c => c.id === componentId);
        if (!comp)
            return { success: false, errCode: ErrCode.ERR_DEVICE_NOT_EXIST, error: 'Component not found' };
        comp.parameters.set(param, value);
        if (this.isSimActive()) {
            // Live pot/switch/temp edits re-stamp the full MNA every tick — suppress stamp flood.
            const quiet = param === 'wiper' || param === 'pressed' || param === 'temp_c' || param === 'active';
            if (quiet) {
                this.analogEngine.setQuietLoad(true);
            }
            try {
                // SW_PUSH: prefer in-place R update so 555 monostable RC state survives press/release
                if (param === 'pressed' && SimulationKernelImpl.isPushbuttonLib(comp.libraryId)) {
                    const pressed = SimulationKernelImpl.isTruthyParam(value);
                    if (this.analogEngine.setPushbuttonPressed(comp.id, pressed)) {
                        // A few transient steps: TRIG settles, 555 FF updates; never DC-OP (would open C)
                        this.settleAfterSwitchChange();
                        this.syncVoltagesFromAnalogEngine();
                        this.syncSpiceToGpioInputs();
                        return { success: true, errCode: ErrCode.OK };
                    }
                    // 回退 rebuild：必须先快照 RC/555，否则 OP 清电容 → 单稳态立刻灭
                    const rcSnap = this.analogEngine.exportReactiveSnapshot();
                    Logger.info(INSTR_TRACE_TAG, `[SW] in-place miss → rebuild netlist; preserve RC caps=${rcSnap.caps.length} ` +
                        `t555=${rcSnap.timers.length}`);
                    this.analogEngine.loadSchematic(this.schematic, this.config);
                    if (this.topology) {
                        this.buildSpiceNodeMap(this.topology);
                    }
                    if (this.mcuStm32Loaded && this.qemuBridge.isRunning()) {
                        this.syncStm32GpioToSpice();
                    }
                    if (this.mcu8051Loaded) {
                        this.syncMcuPinsToSpice();
                    }
                    // 恢复电容电压 + 555 Q；禁止再 reSolveOp（会再次开路电容）
                    this.analogEngine.restoreReactiveSnapshot(rcSnap);
                    this.analogEngine.pinVoltageSources(false);
                    this.settleAfterSwitchChange();
                    this.syncVoltagesFromAnalogEngine();
                    this.syncSpiceToGpioInputs();
                    return { success: true, errCode: ErrCode.OK };
                }
                this.analogEngine.loadSchematic(this.schematic, this.config);
                if (this.topology) {
                    this.buildSpiceNodeMap(this.topology);
                }
                // rebuild cleared Thevenin GPIO sources — re-drive outputs, then sample inputs
                if (this.mcuStm32Loaded && this.qemuBridge.isRunning()) {
                    this.syncStm32GpioToSpice();
                }
                if (this.mcu8051Loaded) {
                    this.syncMcuPinsToSpice();
                }
                this.analogEngine.pinVoltageSources();
                this.analogEngine.reSolveOp();
                if (this.analogEngine.updateRelayContactsFromCoil()) {
                    if (this.analogEngine.needsDcResolveAfterSwitch()) {
                        this.analogEngine.reSolveOp();
                    }
                    else {
                        this.analogEngine.pinVoltageSources();
                    }
                }
                // OP lives in AE — mirror into kernel map so instruments / wire colors update immediately
                this.syncVoltagesFromAnalogEngine();
                this.syncSpiceToGpioInputs();
            }
            finally {
                if (quiet) {
                    this.analogEngine.setQuietLoad(false);
                }
            }
        }
        return { success: true, errCode: ErrCode.OK };
    }
    /** 按键/触点变化后跑若干暂态步，更新 555/继电器；555 翻转禁止 DC-OP */
    private settleAfterSwitchChange(): void {
        for (let i = 0; i < 10; i++) {
            this.runSpiceStep();
            if (this.analogEngine.updateRelayContactsFromCoil()) {
                if (this.analogEngine.needsDcResolveAfterSwitch()) {
                    this.analogEngine.reSolveOp();
                }
                else {
                    this.analogEngine.pinVoltageSources(false);
                }
            }
        }
    }
    /** Copy AnalogEngine OP into kernel.nodeVoltages (names + net UUIDs). */
    syncVoltagesFromAnalogEngine(): void {
        const aeMap = this.analogEngine.exportNodeVoltages();
        aeMap.forEach((v: number, name: string) => {
            this.nodeVoltages.set(name, v);
        });
        const uuidMap = this.analogEngine.getNetUuidMapping();
        uuidMap.forEach((nodeName: string, netUuid: string) => {
            const v = this.nodeVoltages.get(nodeName);
            if (v !== undefined) {
                this.nodeVoltages.set(netUuid, v);
            }
            else {
                this.nodeVoltages.set(netUuid, this.analogEngine.getVoltage(netUuid));
            }
        });
        this.spiceNodeMap.forEach((nodeName: string, netUuid: string) => {
            const v = this.nodeVoltages.get(nodeName);
            if (v !== undefined) {
                this.nodeVoltages.set(netUuid, v);
            }
        });
    }
    toggleInteractiveSwitch(componentId: string): string {
        if (!this.isSimActive() || !this.schematic) {
            return '';
        }
        const comp = this.schematic.components.find(c => c.id === componentId);
        if (!comp) {
            return '';
        }
        const lib = comp.libraryId.toUpperCase();
        if (lib !== 'SW_PUSH' && !lib.includes('SWITCH_PUSH') && lib !== 'BUTTON') {
            return '';
        }
        const cur = (comp.parameters.get('pressed') ?? '0').trim().toLowerCase();
        const pressedNow = cur === '1' || cur === 'true' || cur === 'yes' || cur === 'on' || cur === 'pressed';
        const next = pressedNow ? '0' : '1';
        const r = this.setComponentParameter(componentId, 'pressed', next);
        if (!r.success) {
            return '';
        }
        Logger.info(INSTR_TRACE_TAG, `[SW] ${comp.refDes} pressed=${next} (${next === '1' ? 'KEY→GND short' : 'open / pull-up'})`);
        this.tracePeripheralIndicators(`sw-toggle-${comp.refDes}`);
        return next;
    }
    /**
     * 仿真中点动按键：按下=闭合、松开=断开（不整表 rebuild，保留 555 定时电容状态）。
     */
    setInteractiveSwitchPressed(componentId: string, pressed: boolean): string {
        if (!this.isSimActive() || !this.schematic) {
            return '';
        }
        const comp = this.schematic.components.find(c => c.id === componentId);
        if (!comp) {
            return '';
        }
        if (!SimulationKernelImpl.isPushbuttonLib(comp.libraryId)) {
            return '';
        }
        const next = pressed ? '1' : '0';
        const r = this.setComponentParameter(componentId, 'pressed', next);
        if (!r.success) {
            return '';
        }
        Logger.info(INSTR_TRACE_TAG, `[SW] ${comp.refDes} pressed=${next} (${pressed ? 'KEY→GND short' : 'open / pull-up'}) moment`);
        this.tracePeripheralIndicators(`sw-moment-${comp.refDes}`);
        return next;
    }
    private static isPushbuttonLib(libraryId: string): boolean {
        const lib = libraryId.toUpperCase();
        return lib === 'SW_PUSH' || lib.includes('SWITCH_PUSH') || lib === 'BUTTON';
    }
    private static isTruthyParam(value: string): boolean {
        const s = value.trim().toLowerCase();
        return s === '1' || s === 'true' || s === 'yes' || s === 'on' || s === 'pressed';
    }
    /**
     * 仿真中拖动滑动变阻器滑臂。wiper ∈ (0,1)，成功返回 "0.xxx"，失败返回 ''。
     */
    setInteractivePotWiper(componentId: string, wiper: number): string {
        if (!this.isSimActive() || !this.schematic) {
            return '';
        }
        const comp = this.schematic.components.find(c => c.id === componentId);
        if (!comp) {
            return '';
        }
        const lib = comp.libraryId.toUpperCase();
        const isPot = lib.startsWith('POT_') || lib.includes('POTENTIOMETER') ||
            lib === 'POT' || lib.includes('_POT');
        if (!isPot) {
            return '';
        }
        let t = wiper;
        if (t < 0.001) {
            t = 0.001;
        }
        else if (t > 0.999) {
            t = 0.999;
        }
        const next = t.toFixed(3);
        const prev = (comp.parameters.get('wiper') ?? '').trim();
        if (prev === next) {
            return next;
        }
        const r = this.setComponentParameter(componentId, 'wiper', next);
        if (!r.success) {
            return '';
        }
        Logger.info(INSTR_TRACE_TAG, `[POT] ${comp.refDes} wiper=${next} (${(t * 100).toFixed(0)}%)`);
        return next;
    }
    /**
     * 仿真中拖动 DS18B20 温度滑条。tempC ∈ [−55,125]，成功返回 "xx.x"，失败返回 ''。
     * 教学模型：DQ 电压 = (temp+55)/180×5V。
     */
    setInteractiveSensorTemp(componentId: string, tempC: number): string {
        if (!this.isSimActive() || !this.schematic) {
            return '';
        }
        const comp = this.schematic.components.find(c => c.id === componentId);
        if (!comp) {
            return '';
        }
        if (!comp.libraryId.toUpperCase().includes('DS18B20')) {
            return '';
        }
        let t = tempC;
        if (t < -55) {
            t = -55;
        }
        else if (t > 125) {
            t = 125;
        }
        const next = t.toFixed(1);
        const prev = (comp.parameters.get('temp_c') ?? '').trim();
        if (prev === next) {
            return next;
        }
        const r = this.setComponentParameter(componentId, 'temp_c', next);
        if (!r.success) {
            return '';
        }
        const vTeach = ((t + 55) / 180) * 5;
        Logger.info(INSTR_TRACE_TAG, `[SENSOR] ${comp.refDes} temp_c=${next}°C teachDQ=${vTeach.toFixed(3)}V`);
        return next;
    }
    /**
     * 仿真中点击霍尔传感器切换磁场。成功返回 "0"|"1"，失败返回 ''。
     */
    toggleInteractiveHall(componentId: string): string {
        if (!this.isSimActive() || !this.schematic) {
            return '';
        }
        const comp = this.schematic.components.find(c => c.id === componentId);
        if (!comp) {
            return '';
        }
        if (!comp.libraryId.toUpperCase().includes('HALL')) {
            return '';
        }
        const prev = (comp.parameters.get('active') ?? '0').trim();
        const next = (prev === '1' || prev.toLowerCase() === 'true') ? '0' : '1';
        const r = this.setComponentParameter(componentId, 'active', next);
        if (!r.success) {
            return '';
        }
        Logger.info(INSTR_TRACE_TAG, `[HALL] ${comp.refDes} active=${next} (${next === '1' ? 'magnet ON → OUT low' : 'magnet OFF / pull-up'})`);
        return next;
    }
    /** Unload all MCU firmwares (STM32 + 8051) so leftover GPIO drives do not fight sensors. */
    unloadAllMcuFirmware(): void {
        const had = this.mcu8051Loaded || this.mcuStm32Loaded;
        if (this.mcuStm32Loaded) {
            this.qemuBridge.stop();
            this.mcuStm32Loaded = false;
        }
        if (this.mcu8051Loaded) {
            this.mcu8051.reset();
            this.mcu8051Loaded = false;
        }
        this.mcuTickCount = 0;
        this.lastTracedGpio.clear();
        this.mcuFamily = '';
        if (had) {
            traceBurn('SIM_UNLOAD_MCU', 'all cores cleared (no-hex template / sensor teach)');
        }
    }
    /**
     * Sample schematic net voltages into MCU GPIO input state.
     * STM32: write GPIOx_IDR for MODE=00 (input) pins; unused bits left unchanged.
     * 8051: setPinLevel on Port1 bits from package P1..P8 nets.
     */
    syncSpiceToGpioInputs(): void {
        if (!this.schematic || !this.isAnyMcuLoaded()) {
            return;
        }
        const vinHl = 2.0; // ≥2.0V → logic 1 (5V KEY 与 3.3V GPIO 兼容)
        if (this.mcuStm32Loaded && this.qemuBridge.isRunning()) {
            this.syncStm32SpiceToIdr(vinHl);
        }
        if (this.mcu8051Loaded) {
            this.sync8051SpiceToPins(vinHl);
        }
    }
    private syncStm32SpiceToIdr(vinHl: number): void {
        if (!this.schematic) {
            return;
        }
        const gpioBases = [0x40010800, 0x40010C00, 0x40011000];
        const portLetters = ['A', 'B', 'C'];
        for (let c = 0; c < this.schematic.components.length; c++) {
            const comp = this.schematic.components[c];
            if (!comp.libraryId.toUpperCase().includes('STM32')) {
                continue;
            }
            for (let port = 0; port < gpioBases.length; port++) {
                const base = gpioBases[port];
                const crl = this.qemuBridge.readPeriph(base + 0x00);
                const crh = this.qemuBridge.readPeriph(base + 0x04);
                let idr = this.qemuBridge.readPeriph(base + 0x08);
                const letter = portLetters[port];
                let changed = false;
                const samples: string[] = [];
                for (let bit = 0; bit < 16; bit++) {
                    const crNibble = bit < 8
                        ? ((crl >>> (bit * 4)) & 0xF)
                        : ((crh >>> ((bit - 8) * 4)) & 0xF);
                    const mode = crNibble & 0x3;
                    // Sample inputs; also refresh IDR for wired outputs so IDR mirrors pin
                    const pinLabels: string[] = [
                        `P${letter}${bit}`, `${letter}${bit}`, `P${letter}.${bit}`
                    ];
                    if (port === 0 && bit < 16) {
                        pinLabels.push(`P${bit + 1}`);
                    }
                    const nodeName = this.findMcuPinSpiceNode(comp.id, pinLabels);
                    if (nodeName === null || nodeName.length === 0) {
                        continue;
                    }
                    const nu = nodeName.toUpperCase();
                    if (nu.includes('NRST') || nu.includes('XTAL') || nu.includes('OSC')) {
                        continue;
                    }
                    const v = this.analogEngine.getVoltage(nodeName);
                    const bitOn = v >= vinHl ? 1 : 0;
                    const prev = (idr >>> bit) & 1;
                    if (bitOn !== prev) {
                        changed = true;
                        if (bitOn) {
                            idr |= (1 << bit);
                        }
                        else {
                            idr &= ~(1 << bit);
                        }
                    }
                    // Prefer logging input pins (MODE=00) — KEY/PA1 path
                    if (mode === 0) {
                        samples.push(`P${letter}${bit}=${v.toFixed(2)}V→${bitOn}`);
                    }
                }
                if (changed) {
                    this.qemuBridge.writePeriph(base + 0x08, idr >>> 0);
                }
                if (samples.length > 0 && (this.mcuTickCount <= 3 || this.mcuTickCount % 50 === 0 || changed)) {
                    Logger.info(INSTR_TRACE_TAG, `[MCU] GPIO_IN GPIO${letter} IDR=0x${(idr & 0xFFFF).toString(16)} | ${samples.slice(0, 6).join(' ')}`);
                }
            }
        }
    }
    private sync8051SpiceToPins(vinHl: number): void {
        if (!this.schematic) {
            return;
        }
        // Latch snapshot — setPinLevel must not clobber firmware writes (see Mcu8051Simulator).
        const latch = this.mcu8051.getPort1();
        for (let c = 0; c < this.schematic.components.length; c++) {
            const comp = this.schematic.components[c];
            const lib = comp.libraryId.toUpperCase();
            if (!lib.includes('89C51') && !lib.includes('8051') && !lib.includes('AT89') &&
                !lib.includes('MCS51') && !lib.includes('STC89') && !lib.includes('STC15')) {
                continue;
            }
            for (let bit = 0; bit < 8; bit++) {
                const candidates: string[] = [`P1.${bit}`, `P1_${bit}`, `P${bit + 1}`];
                const nodeName = this.findMcuPinSpiceNode(comp.id, candidates);
                if (nodeName === null || nodeName.length === 0) {
                    continue;
                }
                // Latch=0: strong sink — skip external sample (avoids 5V net forcing "input high")
                if (((latch >> bit) & 1) === 0) {
                    this.mcu8051.setPinLevel('P1', bit, 0);
                    continue;
                }
                const v = this.analogEngine.getVoltage(nodeName);
                this.mcu8051.setPinLevel('P1', bit, v >= vinHl ? 1 : 0);
            }
        }
    }
    generateSpiceNetlist(): Result<string> {
        if (!this.schematic)
            return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: 'No schematic loaded' };
        return { success: true, errCode: ErrCode.OK, data: this.analogEngine.getNetlist() };
    }
    getHazards(): HazardReport[] {
        return this.digitalEngine.detectHazards();
    }
    // ---- 1.3.11 A/D 接口: 数字输出 → Thevenin 等效源映射到模拟节点 ----
    registerCrossCoupledNet(digitalNetId: string, analogNetId: string): void {
        this.crossCoupledNets.set(digitalNetId, analogNetId);
    }
    /** Prefer schematic net.name for instr_trace (CLK / LA_CH1 / …). */
    private netDisplayName(netUuid: string): string {
        if (this.schematic) {
            for (let i = 0; i < this.schematic.nets.length; i++) {
                const n = this.schematic.nets[i];
                if (n.id === netUuid) {
                    return n.name.length > 0 ? n.name : netUuid;
                }
            }
        }
        const ae = this.analogEngine.getNodeNameForNetUuid(netUuid);
        return ae.length > 0 ? ae : netUuid;
    }
    /**
     * Resolve live analog voltage for a schematic net UUID from the step snapshot / AE.
     * SpiceMatrixBuilder may alias CLK→N3 while AnalogEngine keeps node "CLK" — try all keys.
     */
    private resolveAnalogVoltageForNet(netUuid: string, currAnalog: Map<string, number>): number {
        const aeName = this.analogEngine.getNodeNameForNetUuid(netUuid);
        const spice = this.spiceNodeMap.get(netUuid) ?? '';
        const keys: string[] = [netUuid, aeName, spice];
        if (this.schematic) {
            for (let i = 0; i < this.schematic.nets.length; i++) {
                const n = this.schematic.nets[i];
                if (n.id === netUuid && n.name.length > 0) {
                    keys.push(n.name);
                    break;
                }
            }
        }
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (k.length === 0) {
                continue;
            }
            const fromSnap = currAnalog.get(k);
            if (fromSnap !== undefined) {
                return fromSnap;
            }
        }
        return this.analogEngine.getVoltage(netUuid);
    }
    private logicStateChar(s: LogicState): string {
        if (s === LogicState.HIGH) {
            return 'H';
        }
        if (s === LogicState.LOW) {
            return 'L';
        }
        if (s === LogicState.HIGH_Z) {
            return 'Z';
        }
        return 'X';
    }
    // ---- 1.3.12 D/A 阈值检测: 模拟电压 → 数字事件（含直流电平种子，不仅边沿） ----
    private applyAnalogToDigitalThresholds(_prevAnalog: Map<string, number>, currAnalog: Map<string, number>): void {
        const vcc = 5.0;
        const vil = vcc > 4.0 ? VIL_CMOS_5V : VIL_CMOS_3V3;
        const vih = vcc > 4.0 ? VIH_CMOS_5V : VIH_CMOS_3V3;
        currAnalog.forEach((voltage: number, nodeId: string) => {
            this.nodeVoltages.set(nodeId, voltage);
        });
        // Only drive gate *inputs* from analog. Re-driving outputs (Q0/Y) from DIG Thevenin
        // voltages re-asserts H after CD4017 edges and freezes the decade counter.
        const driven = new Set<string>();
        const drivenIds = this.digitalEngine.getDrivenNetIds();
        for (let di = 0; di < drivenIds.length; di++) {
            driven.add(drivenIds[di]);
        }
        const participants = this.digitalEngine.getLogicParticipantNetIds();
        const changeParts: string[] = [];
        const snapParts: string[] = [];
        for (let i = 0; i < participants.length; i++) {
            const key = participants[i];
            if (driven.has(key) || !this.digitalEngine.hasNode(key)) {
                continue;
            }
            const name = this.netDisplayName(key);
            const aeName = this.analogEngine.getNodeNameForNetUuid(key);
            const spice = this.spiceNodeMap.get(key) ?? '';
            const voltage = this.resolveAnalogVoltageForNet(key, currAnalog);
            const cur = this.digitalEngine.getState(key);
            const curCh = this.logicStateChar(cur);
            // Always include CLK / LOGIC_* in periodic snapshot; others only when interesting
            const isClockish = name === 'CLK' || name.indexOf('LOGIC_') === 0 ||
                name.indexOf('CLK') >= 0;
            if (isClockish || snapParts.length < 8) {
                snapParts.push(`${name}=${voltage.toFixed(2)}V/${curCh}` +
                    `(ae=${aeName.length > 0 ? aeName : '-'},sp=${spice.length > 0 ? spice : '-'})`);
            }
            if (voltage >= vih && cur !== LogicState.HIGH) {
                this.digitalEngine.scheduleEvent(this.globalTime, key, LogicState.HIGH);
                changeParts.push(`${name}:${curCh}→H@${voltage.toFixed(2)}V`);
            }
            else if (voltage <= vil && cur !== LogicState.LOW) {
                this.digitalEngine.scheduleEvent(this.globalTime, key, LogicState.LOW);
                changeParts.push(`${name}:${curCh}→L@${voltage.toFixed(2)}V`);
            }
        }
        if (changeParts.length > 0) {
            traceDigitalAd(`t=${this.globalTime.toExponential(3)}s sched=[${changeParts.join(', ')}]`);
        }
        if (snapParts.length > 0) {
            traceDigitalAdSnapshot(`t=${this.globalTime.toExponential(3)}s ` +
                `inputs=[${snapParts.join('; ')}] | ${this.digitalEngine.formatCd4017Trace()}`);
        }
    }
    /**
     * Map SPICE node / net UUID / display name onto every DigitalEngine key for that net.
     * CLK→N3 and net_*→N3 must collapse to the same UUID CD4017.CLK was registered with.
     */
    private expandAnalogNodeKeys(nodeId: string): string[] {
        const keys: string[] = [];
        const add = (k: string): void => {
            if (k.length > 0 && keys.indexOf(k) < 0) {
                keys.push(k);
            }
        };
        add(nodeId);
        let spiceAlias = '';
        this.spiceNodeMap.forEach((spiceNode: string, netUuid: string) => {
            if (spiceNode === nodeId || netUuid === nodeId) {
                add(netUuid);
                add(spiceNode);
                if (spiceNode.length > 0) {
                    spiceAlias = spiceNode;
                }
            }
        });
        // Fan-in all UUIDs that share the same SPICE node (CLK / N3 / net_*)
        if (spiceAlias.length > 0) {
            this.spiceNodeMap.forEach((spiceNode: string, netUuid: string) => {
                if (spiceNode === spiceAlias) {
                    add(netUuid);
                    add(spiceNode);
                }
            });
        }
        const aeMap = this.analogEngine.getNetUuidMapping();
        aeMap.forEach((nodeName: string, netUuid: string) => {
            if (nodeName === nodeId || netUuid === nodeId ||
                (spiceAlias.length > 0 && nodeName === spiceAlias)) {
                add(netUuid);
                add(nodeName);
                const sp = this.spiceNodeMap.get(netUuid);
                if (sp !== undefined && sp.length > 0) {
                    spiceAlias = spiceAlias.length > 0 ? spiceAlias : sp;
                    this.spiceNodeMap.forEach((spiceNode: string, uuid: string) => {
                        if (spiceNode === sp) {
                            add(uuid);
                            add(spiceNode);
                        }
                    });
                }
            }
        });
        if (this.schematic) {
            for (let i = 0; i < this.schematic.nets.length; i++) {
                const n = this.schematic.nets[i];
                if (n.id === nodeId || n.name === nodeId) {
                    add(n.id);
                    add(n.name);
                    const sp = this.spiceNodeMap.get(n.id) ?? aeMap.get(n.id);
                    if (sp !== undefined && sp.length > 0) {
                        this.spiceNodeMap.forEach((spiceNode: string, uuid: string) => {
                            if (spiceNode === sp) {
                                add(uuid);
                                add(spiceNode);
                            }
                        });
                        aeMap.forEach((nodeName: string, uuid: string) => {
                            if (nodeName === sp || uuid === n.id) {
                                add(uuid);
                                add(nodeName);
                            }
                        });
                    }
                }
            }
        }
        return keys;
    }
    /** Resolve OP voltage trying UUID / spice node / net name (AE may key as LOGIC_H while map points to N1). */
    private resolveSeedVoltage(netUuid: string, spiceNode: string): number {
        let v = this.analogEngine.getVoltage(netUuid);
        if (Math.abs(v) > 1e-9) {
            return v;
        }
        v = this.analogEngine.getVoltage(spiceNode);
        if (Math.abs(v) > 1e-9) {
            return v;
        }
        const kv = this.nodeVoltages.get(spiceNode) ?? this.nodeVoltages.get(netUuid);
        if (kv !== undefined && Math.abs(kv) > 1e-9) {
            return kv;
        }
        if (this.schematic) {
            for (let i = 0; i < this.schematic.nets.length; i++) {
                const n = this.schematic.nets[i];
                if (n.id === netUuid && n.name.length > 0) {
                    v = this.analogEngine.getVoltage(n.name);
                    if (Math.abs(v) > 1e-9) {
                        return v;
                    }
                    const named = this.nodeVoltages.get(n.name);
                    if (named !== undefined) {
                        return named;
                    }
                }
            }
        }
        return this.analogEngine.getVoltage(netUuid);
    }
    /** After OP, seed LOGIC_H/L and settle combinational outputs for lab_digital etc. */
    private seedDigitalFromAnalogDc(): void {
        const aeMap = this.analogEngine.getNetUuidMapping();
        const vil = VIL_CMOS_5V;
        const vih = VIH_CMOS_5V;
        const seedParts: string[] = [];
        const seeded = new Set<string>();
        const logicNets = new Set<string>();
        const participants = this.digitalEngine.getLogicParticipantNetIds();
        for (let i = 0; i < participants.length; i++) {
            logicNets.add(participants[i]);
        }
        // Also accept classic teaching rail names as digital inputs when gates exist
        const hasGates = this.digitalEngine.getGateCount() > 0;
        const trySeed = (netUuid: string, spiceNode: string): void => {
            if (seeded.has(netUuid)) {
                return;
            }
            const v = this.resolveSeedVoltage(netUuid, spiceNode);
            // Always mirror SPICE into kernel voltage map for instruments / MCU IDR
            this.nodeVoltages.set(netUuid, v);
            this.nodeVoltages.set(spiceNode, v);
            // Do NOT force digital levels on passive nets (REL_NO≈4V from LED+Gmin looked
            // like LOGIC_H and polluted SEED_IN — only seed real gate pins / rail inputs)
            if (!hasGates) {
                return;
            }
            const nodeU = spiceNode.toUpperCase();
            const isRail = nodeU === 'VCC' || nodeU === 'VDD' || nodeU === '0' || nodeU === 'GND' ||
                nodeU.indexOf('LOGIC_') === 0;
            if (!logicNets.has(netUuid) && !isRail) {
                return;
            }
            if (v >= vih) {
                this.digitalEngine.forceSetLevel(netUuid, LogicState.HIGH);
                seeded.add(netUuid);
                seedParts.push(`${spiceNode}=H(${v.toFixed(2)}V)`);
            }
            else if (v <= vil) {
                this.digitalEngine.forceSetLevel(netUuid, LogicState.LOW);
                seeded.add(netUuid);
                seedParts.push(`${spiceNode}=L(${v.toFixed(2)}V)`);
            }
        };
        aeMap.forEach((spiceNode: string, netUuid: string) => {
            trySeed(netUuid, spiceNode);
        });
        this.spiceNodeMap.forEach((spiceNode: string, netUuid: string) => {
            trySeed(netUuid, spiceNode);
        });
        traceDigitalLogic('SEED_IN', seedParts.length > 0 ? seedParts.join(' ') : '(no digital gate nets — skipped passive LED/REL seed)');
        // Combinational DC settle (no event-edge clocks)
        this.digitalEngine.settleCombinational(0);
        const settled = this.digitalEngine.processEvents(1e-6);
        const gateN = this.digitalEngine.getGateCount();
        const primary = this.digitalEngine.getPrimaryDrivenNetIds();
        let highOut = 0;
        let lowOut = 0;
        let unkOut = 0;
        for (let i = 0; i < primary.length; i++) {
            const st = settled.get(primary[i]) ?? this.digitalEngine.getState(primary[i]);
            if (st === LogicState.HIGH) {
                highOut++;
            }
            else if (st === LogicState.LOW) {
                lowOut++;
            }
            else {
                unkOut++;
            }
        }
        traceDigitalLogic('SEED_OUT', `gates=${gateN} primary=${primary.length} H=${highOut} L=${lowOut} X=${unkOut} | ${this.digitalEngine.formatGateSummary()}`);
        this.applyDigitalToAnalogThevenin(settled);
        this.traceLogicAnalyzerSnapshot('after_seed');
    }
    /** Stamp dig Thevenin + log DIG VSRC list */
    private applyDigitalToAnalogThevenin(digitalStates: Map<string, LogicState>): void {
        // Drop previous digital→analog sources before re-stamping
        for (let i = 0; i < this.theveninSources.length; i++) {
            this.analogEngine.removeSignalSource(`DIG_${this.theveninSources[i].netId}`);
        }
        this.theveninSources = [];
        const driven = new Set<string>();
        const drivenIds = this.digitalEngine.getDrivenNetIds();
        for (let di = 0; di < drivenIds.length; di++) {
            driven.add(drivenIds[di]);
        }
        const thevParts: string[] = [];
        digitalStates.forEach((state: LogicState, nodeId: string) => {
            if (state === LogicState.HIGH_Z || state === LogicState.UNKNOWN)
                return;
            if (!driven.has(nodeId))
                return;
            // Prefer AnalogEngine node names (CLK/LA_CH1) over SpiceMatrixBuilder N* aliases
            const aeName = this.analogEngine.getNodeNameForNetUuid(nodeId);
            const analogNode = this.crossCoupledNets.get(nodeId) ??
                (aeName.length > 0 ? aeName : (this.spiceNodeMap.get(nodeId) ?? nodeId));
            const voltage = state === LogicState.HIGH ? VOH_HC_5V : 0;
            this.theveninSources.push({ netId: analogNode, voltage: voltage, resistance: ROUT_HC });
            // Also index by net UUID so getNetVoltageByUuid finds DIG levels
            this.theveninSources.push({ netId: nodeId, voltage: voltage, resistance: ROUT_HC });
            this.nodeVoltages.set(analogNode, voltage);
            this.nodeVoltages.set(nodeId, voltage);
            if (analogNode !== '0' && analogNode !== 'GND') {
                this.analogEngine.registerSignalSource(`DIG_${analogNode}`, analogNode, '0', 'dc', voltage, 0, 0, 0, 0.5);
                if (thevParts.length < 12) {
                    thevParts.push(`${analogNode}=${voltage.toFixed(2)}V`);
                }
            }
        });
        // Do not snap VAC/SIGGEN back to .OP offset — only pin DIG DC + AC-at-simTime
        this.analogEngine.pinVoltageSources(false);
        traceDigitalThevenin(thevParts);
    }
    /** Dump LA1 CH voltages for instr_trace */
    private traceLogicAnalyzerSnapshot(phase: string): void {
        if (!this.schematic) {
            return;
        }
        for (let ci = 0; ci < this.schematic.components.length; ci++) {
            const comp = this.schematic.components[ci];
            if (!comp.libraryId.toUpperCase().includes('LOGIC_ANALYZER')) {
                continue;
            }
            const pinNets = getPinNetMap(comp.id, this.schematic.nets);
            const chParts: string[] = [];
            for (let ch = 1; ch <= 8; ch++) {
                const netId = pinNets.get(`CH${ch}`) ?? pinNets.get(`CH${ch}`.toUpperCase());
                if (netId === undefined || netId.length === 0) {
                    continue;
                }
                const v = this.getNetVoltageByUuid(netId);
                const bit = v >= VIH_CMOS_5V ? 'H' : (v <= VIL_CMOS_5V ? 'L' : '?');
                chParts.push(`CH${ch}=${bit}(${v.toFixed(2)}V)`);
            }
            traceLogicAnalyzerChannels(`${comp.refDes}@${phase}`, chParts);
        }
    }
    // ---- 1.3.13 电源完整性: di/dt 噪声估算 ----
    private computeSupplyNoise(currentTime: number): void {
        let totalCurrent = 0;
        this.branchCurrents.forEach((current: number) => { totalCurrent += Math.abs(current); });
        const dt = currentTime - this.powerState.lastTime;
        if (dt > 0 && this.powerState.lastTotalCurrent > 0) {
            const di = totalCurrent - this.powerState.lastTotalCurrent;
            const diDt = di / dt;
            this.powerState.vccNoise = SUPPLY_INDUCTANCE * diDt;
            this.powerState.gndBounce = this.powerState.vccNoise * 0.7; // 地弹约为 VCC 噪声 70%
        }
        this.powerState.lastTotalCurrent = totalCurrent;
        this.powerState.lastTime = currentTime;
    }
    getSupplyNoise(): SupplyNoiseSnapshot {
        const result: SupplyNoiseSnapshot = {
            vccNoise: this.powerState.vccNoise,
            gndBounce: this.powerState.gndBounce
        };
        return result;
    }
    // ---- internal ----
    private static createDefaultMcuRegs(): Map<string, number> {
        const regs = new Map<string, number>();
        regs.set('PC', 0);
        regs.set('ACC', 0);
        regs.set('SP', 0x07);
        return regs;
    }
    private toLegacyConfig(sim: SimConfig): SimulationConfig {
        let mode = SimulationMode.MIXED;
        if (sim.simMode === 'transient') {
            mode = SimulationMode.TRANSIENT;
        }
        else if (sim.simMode === 'dc') {
            mode = SimulationMode.DC;
        }
        else if (sim.simMode === 'ac') {
            mode = SimulationMode.AC;
        }
        else if (sim.simMode === 'monte_carlo') {
            mode = SimulationMode.MONTE_CARLO;
        }
        else if (sim.simMode === 'noise') {
            mode = SimulationMode.NOISE;
        }
        return {
            mode: mode,
            startTime: 0,
            stopTime: sim.transientTotalTime,
            stepSize: sim.minTimeStep,
            maxStep: sim.maxTimeStep,
            temperature: sim.temperature,
            convergence: sim.convergence,
            mcuClockHz: sim.mcuClockHz
        };
    }
    private buildSpiceNodeMap(topo: SchTopology): void {
        const cfg = this.simConfig ? this.toLegacyConfig(this.simConfig) : this.config;
        const build = SpiceMatrixBuilder.build(topo, cfg.temperature, cfg.stepSize, cfg.stopTime);
        // Merge SpiceMatrixBuilder node map with AnalogEngine's net UUID mapping
        const aeNetMap = this.analogEngine.getNetUuidMapping();
        aeNetMap.forEach((nodeName: string, netUuid: string) => {
            build.nodeMap.set(netUuid, nodeName);
            // Keep display-name aliases on the AE node (not stale N*) so A→D / THEV agree
            if (this.schematic) {
                for (let i = 0; i < this.schematic.nets.length; i++) {
                    const n = this.schematic.nets[i];
                    if (n.id === netUuid && n.name.length > 0) {
                        build.nodeMap.set(n.name, nodeName);
                        build.nodeMap.set(n.name.toUpperCase(), nodeName);
                        break;
                    }
                }
            }
        });
        this.spiceNodeMap = build.nodeMap;
        this.autoRegisterCrossCouplings(topo);
    }
    /** Auto-register digital↔analog net couplings from schematic topology.
     *  Scans every net for mixed-signal connections (digital IC pin + analog component pin)
     *  and maps the digital net UUID to its corresponding analog SPICE node name. */
    private autoRegisterCrossCouplings(topo: SchTopology): void {
        this.crossCoupledNets.clear();
        for (const net of topo.netList) {
            let hasDigitalPin = false;
            let hasAnalogPin = false;
            for (const nodeRef of net.nodeList) {
                const compId = nodeRef.devUuid;
                // Find component in schematic (or topology device list)
                let libId = '';
                if (this.schematic) {
                    const comp = this.schematic.components.find(c => c.id === compId);
                    if (comp)
                        libId = comp.libraryId.toUpperCase();
                }
                if (libId.length === 0) {
                    const dev = topo.deviceList.find(d => d.instUuid === compId);
                    if (dev)
                        libId = dev.libDevId.toUpperCase();
                }
                if (libId.length === 0)
                    continue;
                // Detect digital ICs (74HC, 74LS, 74HCT, CD40xx, MCUs)
                if (libId.includes('74HC') || libId.includes('74LS') || libId.includes('74HCT') ||
                    libId.includes('74ACT') || libId.includes('CD40') || libId.includes('74LVC') ||
                    libId.includes('STM32') || libId.includes('MCS51') || libId.includes('8051') ||
                    libId.includes('MCU') || libId.includes('LOGIC_')) {
                    hasDigitalPin = true;
                }
                // Detect analog components (R, C, L, diodes, transistors, opamps, etc.)
                if (libId.startsWith('R_') || libId.includes('RESISTOR') || libId.startsWith('C_') ||
                    libId.includes('CAP') || libId.includes('INDUCTOR') || libId.startsWith('L_') ||
                    libId.includes('DIODE') || libId.startsWith('LED') || libId.includes('NPN') ||
                    libId.includes('PNP') || libId.includes('TRANSISTOR') || libId.includes('MOSFET') ||
                    libId.includes('OPAMP') || libId.includes('LM358') || libId.includes('LM324') ||
                    libId.includes('REGULATOR') || libId.includes('CRYSTAL')) {
                    hasAnalogPin = true;
                }
            }
            if (hasDigitalPin && hasAnalogPin) {
                // Map digital net UUID → analog SPICE node name
                const analogNode = this.spiceNodeMap.get(net.netUuid) ?? net.netName;
                this.crossCoupledNets.set(net.netUuid, analogNode);
            }
        }
    }
    private static readonly MAX_WAVE_POINTS = 8192;
    /**
     * Keep enough wall-clock history for scope timebases up to 1s/div (10s window).
     * Point budget is enforced by stride-decimate — never by dropping the oldest
     * contiguous chunk (that left only ~8ms @ 1µs and permanently crowded ROLL left).
     */
    private static readonly MAX_WAVE_SPAN_SEC = 12.0;
    private resolveNetUuidForNode(nodeName: string): string {
        if (nodeName.length === 0) {
            return nodeName;
        }
        // Already a schematic net UUID key in the map
        if (this.spiceNodeMap.has(nodeName) &&
            (nodeName.startsWith('net_') || nodeName.startsWith('net'))) {
            return nodeName;
        }
        let bestUuid = '';
        this.spiceNodeMap.forEach((spiceNode: string, uuid: string) => {
            // AnalogEngine names (NET_4) and Spice N4 both appear as values after merge
            if (spiceNode !== nodeName) {
                return;
            }
            if (uuid.startsWith('net_') || uuid.startsWith('net')) {
                bestUuid = uuid;
            }
            else if (bestUuid.length === 0) {
                bestUuid = uuid;
            }
        });
        if (bestUuid.length > 0) {
            return bestUuid;
        }
        // Reverse: nodeName is display name stored as map key (NET_4 → N4)
        const asKey = this.spiceNodeMap.get(nodeName);
        if (asKey !== undefined) {
            this.spiceNodeMap.forEach((spiceNode: string, uuid: string) => {
                if (spiceNode === asKey && (uuid.startsWith('net_') || uuid.startsWith('net'))) {
                    bestUuid = uuid;
                }
            });
            if (bestUuid.length > 0) {
                return bestUuid;
            }
        }
        return nodeName;
    }
    private updateWaveData(probeName: string, time: number, voltage: number, current: number): void {
        if (!(time === time) || !Number.isFinite(time) || !(voltage === voltage) || !Number.isFinite(voltage)) {
            return;
        }
        let wave = this.waveDataList.find(w => w.probeName === probeName);
        if (!wave) {
            const netUuid = this.resolveNetUuidForNode(probeName);
            wave = {
                waveId: IdUtil.generate('wave'),
                probeName: probeName,
                netName: netUuid,
                timeAxis: [],
                voltageAxis: [],
                currentAxis: [],
                sampleRate: 1 / (this.config.stepSize || 1e-6),
                waveType: 'voltage',
                holdTime: 0
            };
            this.waveDataList.push(wave);
        }
        // Reject non-monotonic timestamps (would scramble scope resampling / windowing).
        // Same-t overwrite: THEV / digital settle must replace SPICE float recorded earlier
        // in the same runSpiceStep — otherwise LA CH7/Q* waves stay stuck at pre-THEV 0V.
        if (wave.timeAxis.length > 0) {
            const lastT = wave.timeAxis[wave.timeAxis.length - 1];
            if (time < lastT) {
                return;
            }
            if (time === lastT) {
                const li = wave.voltageAxis.length - 1;
                wave.voltageAxis[li] = voltage;
                wave.currentAxis[li] = current;
                return;
            }
        }
        wave.timeAxis.push(time);
        wave.voltageAxis.push(voltage);
        wave.currentAxis.push(current);
        // 1) Drop samples older than MAX_WAVE_SPAN_SEC (wall-clock window for scope)
        const n = wave.timeAxis.length;
        if (n >= 8) {
            const tEnd = wave.timeAxis[n - 1];
            const tKeep = tEnd - SimulationKernelImpl.MAX_WAVE_SPAN_SEC;
            if (wave.timeAxis[0] < tKeep) {
                let cut = 0;
                while (cut < n - 4 && wave.timeAxis[cut] < tKeep) {
                    cut++;
                }
                if (cut > 0) {
                    wave.timeAxis.splice(0, cut);
                    wave.voltageAxis.splice(0, cut);
                    wave.currentAxis.splice(0, cut);
                }
            }
        }
        // 2) If still over budget: stride-decimate to preserve span (do NOT blunt-drop head)
        if (wave.timeAxis.length > SimulationKernelImpl.MAX_WAVE_POINTS) {
            const stride = Math.ceil(wave.timeAxis.length / SimulationKernelImpl.MAX_WAVE_POINTS);
            if (stride > 1) {
                const nt: number[] = [];
                const nv: number[] = [];
                const ni: number[] = [];
                const len = wave.timeAxis.length;
                for (let i = 0; i < len; i += stride) {
                    nt.push(wave.timeAxis[i]);
                    nv.push(wave.voltageAxis[i]);
                    ni.push(wave.currentAxis[i]);
                }
                const last = len - 1;
                if (nt.length === 0 || nt[nt.length - 1] !== wave.timeAxis[last]) {
                    nt.push(wave.timeAxis[last]);
                    nv.push(wave.voltageAxis[last]);
                    ni.push(wave.currentAxis[last]);
                }
                wave.timeAxis = nt;
                wave.voltageAxis = nv;
                wave.currentAxis = ni;
            }
        }
    }
    private accumulateResult(stepResult: SchedulerStepResult): void {
        if (!this.result) {
            this.result = {
                time: [],
                signals: new Map<string, number[]>(),
                digitalStates: new Map<string, LogicState[]>(),
                mcuRegisters: []
            };
        }
        this.result.time.push(stepResult.time);
        stepResult.analogSignals.forEach((val: number, name: string) => {
            let signalSeries = this.result!.signals.get(name);
            if (!signalSeries) {
                signalSeries = [];
                this.result!.signals.set(name, signalSeries);
            }
            signalSeries.push(val);
        });
        stepResult.digitalStates.forEach((state: LogicState, pinId: string) => {
            let pinHistory = this.result!.digitalStates.get(pinId);
            if (!pinHistory) {
                pinHistory = [];
                this.result!.digitalStates.set(pinId, pinHistory);
            }
            pinHistory.push(state);
        });
        if (stepResult.mcuSnapshot) {
            this.result.mcuRegisters?.push(stepResult.mcuSnapshot);
        }
    }
    private flattenDigitalStates(states: Map<string, LogicState[]>): Map<string, string> {
        const flat = new Map<string, string>();
        states.forEach((history: LogicState[], pinId: string) => {
            const last = history[history.length - 1];
            if (last === LogicState.HIGH) {
                flat.set(pinId, '1');
            }
            else if (last === LogicState.LOW) {
                flat.set(pinId, '0');
            }
            else {
                flat.set(pinId, 'X');
            }
        });
        return flat;
    }
    private saveParamDefaults(): void {
        this.paramScanDefaults.clear();
        if (!this.schematic)
            return;
        for (const comp of this.schematic.components) {
            this.paramScanDefaults.set(comp.id, copyStringMap(comp.parameters));
        }
    }
    private restoreParamDefaults(): void {
        if (!this.schematic)
            return;
        this.schematic.components.forEach((comp) => {
            const saved = this.paramScanDefaults.get(comp.id);
            if (saved) {
                comp.parameters = copyStringMap(saved);
            }
        });
    }
    private static parseNumericValue(val: string): number {
        const s = val.toLowerCase();
        if (s.includes('k'))
            return parseFloat(s) * 1000;
        if (s.includes('u') || s.includes('µ'))
            return parseFloat(s) * 1e-6;
        if (s.includes('n'))
            return parseFloat(s) * 1e-9;
        if (s.includes('p'))
            return parseFloat(s) * 1e-12;
        const n = parseFloat(s);
        return isNaN(n) ? 1000 : n;
    }
    private static computeStats(values: number[]): StatsSnapshot {
        if (values.length === 0) {
            const empty: StatsSnapshot = { mean: 0, stdDev: 0, min: 0, max: 0, cp: 0, cpk: 0 };
            return empty;
        }
        let sum = 0;
        let min = values[0];
        let max = values[0];
        for (let i = 0; i < values.length; i++) {
            sum += values[i];
            if (values[i] < min)
                min = values[i];
            if (values[i] > max)
                max = values[i];
        }
        const mean = sum / values.length;
        let varSum = 0;
        for (let i = 0; i < values.length; i++) {
            const diff = values[i] - mean;
            varSum += diff * diff;
        }
        const stdDev = Math.sqrt(varSum / values.length);
        const usl = mean + 3 * stdDev;
        const lsl = mean - 3 * stdDev;
        const cp = stdDev > 0 ? (usl - lsl) / (6 * stdDev) : 0;
        const cpk = stdDev > 0 ? Math.min((usl - mean) / (3 * stdDev), (mean - lsl) / (3 * stdDev)) : 0;
        return { mean, stdDev, min, max, cp, cpk };
    }
    private static resolveSupplyVoltage(doc: SchematicDocument): number {
        for (let i = 0; i < doc.components.length; i++) {
            const comp = doc.components[i];
            const lib = comp.libraryId.toUpperCase();
            if (lib === 'VCC' || lib.endsWith('/VCC')) {
                return parseVoltageVolts(paramMapGet(comp.parameters, 'voltage', '5V'), 5);
            }
        }
        return 5;
    }
}
