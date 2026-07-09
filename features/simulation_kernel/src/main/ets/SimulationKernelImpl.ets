/**
 * 模块3：混合信号仿真内核完整实现
 * v2.0: A/D接口模型 (Thevenin等效) / D/A阈值检测 / 电源完整性 / 统一事件队列
 */
import { ISimulationKernel } from './api/ISimulationKernel';
import { DigitalEngine, HazardReport } from './engines/DigitalEngine';
import { AnalogEngine } from './engines/AnalogEngine';
import { GlobalScheduler, SchedulerStepResult } from './engines/GlobalScheduler';
import {
  SchematicDocument, SimulationConfig, SimulationResult,
  SimulationState, SimulationMode, Result, McuRegisterSnapshot,
  LogicState, EventBus, ModuleEvent,
  SchTopology, SimConfig, WaveData, FreqNoiseData, SimStatResult,
  SpiceResult, ProgressCallback, ApiResult, ErrCode,
  ResultHelper, TopologyAdapter, makeProgress, IdUtil,
  DynamicErcEngine, ErcViolation, FaultInjection, FaultScanResult, FaultType,
  copyNumberMap, copyStringMap, RandomUtil
} from 'common';
import { FaultInjectionEngine } from './engines/FaultInjectionEngine';
import { Mcu8051Simulator } from './engines/Mcu8051Simulator';
import { SpiceMatrixBuilder } from './engines/SpiceMatrixBuilder';
import { SpiceRunner } from './engines/SpiceRunner';
import { QemuMcuBridge } from './engines/QemuMcuBridge';

// ---- 混合信号耦合参数 (1.3.11-1.3.14) ----
const VOH_HC_5V = 4.5;       // HC系列输出高电平 Thevenin 电压
const ROUT_HC = 50;           // HC系列输出阻抗 (Ω)
const VIL_CMOS_5V = 0.8;      // CMOS 低电平阈值
const VIH_CMOS_5V = 2.0;      // CMOS 高电平阈值
const VIL_CMOS_3V3 = 0.6;
const VIH_CMOS_3V3 = 2.0;
const SUPPLY_INDUCTANCE = 10e-9;  // 电源引线电感 10nH

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

  // ---- 混合信号耦合状态 (1.3.11-1.3.14) ----
  private theveninSources: TheveninSource[] = [];
  private powerState: PowerIntegrityState = { lastTotalCurrent: 0, lastTime: 0, vccNoise: 0, gndBounce: 0 };
  private crossCoupledNets: Map<string, string> = new Map(); // digital_net → analog_node

  // ---- v2 API ----

  startSimulation(topo: SchTopology, config: SimConfig, onProgress?: ProgressCallback): ApiResult<void> {
    this.topology = topo;
    this.simConfig = config;
    const doc = TopologyAdapter.fromTopology(topo);
    this.schematic = doc;
    this.config = this.toLegacyConfig(config);
    this.state = SimulationState.IDLE;
    this.result = null;
    this.waveDataList = [];
    this.nodeVoltages.clear();
    this.branchCurrents.clear();
    this.globalTime = 0;
    this.digitalEngine.loadSchematic(doc);
    this.analogEngine.loadSchematic(doc, this.config);
    this.scheduler = new GlobalScheduler(this.config, this.digitalEngine, this.analogEngine);
    this.buildSpiceNodeMap(topo);

    // Pre-populate initial voltages: VCC=5V, GND=0V for all mapped nets
    this.nodeVoltages.set('VCC', 5.0);
    this.nodeVoltages.set('0', 0);
    this.nodeVoltages.set('GND', 0);
    this.spiceNodeMap.forEach((nodeName: string, netUuid: string) => {
      if (nodeName === 'VCC' || nodeName === 'VCC_5V' || nodeName === 'VDD') {
        this.nodeVoltages.set(netUuid, 5.0);
        this.nodeVoltages.set(nodeName, 5.0);
      } else if (nodeName === '0' || nodeName === 'GND') {
        this.nodeVoltages.set(netUuid, 0);
        this.nodeVoltages.set(nodeName, 0);
      }
    });

    onProgress?.(makeProgress(30, 'Netlist built'));
    this.state = SimulationState.RUNNING;
    this.scheduler.reset();
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
    const spice = this.runSpiceStep();
    this.tickDigitalLogic();
    this.tickMcuCore();
    return ResultHelper.ok(spice);
  }

  isSimRunning(): boolean {
    return this.state === SimulationState.RUNNING;
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
    if (!this.topology) return [];
    return this.faultEngine.batchScan(this.topology, this.waveDataList);
  }

  getNodeVoltage(nodeName: string): number {
    // Try direct lookup first (node name like "N1", "VCC", "0")
    const direct = this.nodeVoltages.get(nodeName);
    if (direct !== undefined) return direct;
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
    if (aeCurrent !== 0) return aeCurrent;
    // Try net UUID lookup
    const netCurrent = this.analogEngine.getNetCurrentForUuid(branchName);
    if (netCurrent !== 0) return netCurrent;
    // Fall back to stored branch currents
    return this.branchCurrents.get(branchName) ?? 0;
  }

  /** Get voltage on a net by its UUID */
  getNetVoltageByUuid(netUuid: string): number {
    return this.getNodeVoltage(netUuid);
  }

  /** Get current flowing through a net by its UUID */
  getNetCurrentByUuid(netUuid: string): number {
    return this.analogEngine.getNetCurrentForUuid(netUuid);
  }

  /** Register a signal generator as a voltage source in the analog engine */
  registerSignalSource(sourceId: string, nodeA: string, nodeB: string,
                       waveform: string, voltage: number, amplitude: number,
                       freq: number, phase: number, dutyCycle: number): void {
    this.analogEngine.registerSignalSource(sourceId, nodeA, nodeB,
      waveform, voltage, amplitude, freq, phase, dutyCycle);
  }

  getNodeVoltageMap(): Map<string, number> {
    return new Map(this.nodeVoltages);
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
                } else {
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
    if (!this.topology) return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'No topology loaded');
    const net = this.topology.netList.find(n => n.netUuid === netUuid);
    if (!net) return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Net not found');
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
    const stepResult = this.scheduler.step(this.mcuPc, this.mcuRegs);
    this.globalTime = stepResult.time;

    // 1.3.11 数字→模拟: Thevenin 源注入
    this.applyDigitalToAnalogThevenin(stepResult.digitalStates);

    // 1.3.12 模拟→数字: 阈值检测反馈
    this.applyAnalogToDigitalThresholds(prevAnalog, stepResult.analogSignals);

    // Populate node voltages with BOTH node names and net UUIDs for instrument lookup
    stepResult.analogSignals.forEach((val: number, name: string) => {
      this.nodeVoltages.set(name, val);
      this.updateWaveData(name, stepResult.time, val, 0);
    });
    // Also populate with net UUID keys from AnalogEngine's mapping
    const aeNetMap = this.analogEngine.getNetUuidMapping();
    aeNetMap.forEach((nodeName: string, netUuid: string) => {
      const voltage = this.nodeVoltages.get(nodeName);
      if (voltage !== undefined) {
        this.nodeVoltages.set(netUuid, voltage);
        this.updateWaveData(netUuid, stepResult.time, voltage, 0);
      }
    });
    // Also copy from spiceNodeMap
    this.spiceNodeMap.forEach((nodeName: string, netUuid: string) => {
      const voltage = this.nodeVoltages.get(nodeName);
      if (voltage !== undefined && !this.nodeVoltages.has(netUuid)) {
        this.nodeVoltages.set(netUuid, voltage);
      }
    });

    const branchCurrents = this.analogEngine.getBranchCurrents();
    branchCurrents.forEach((current: number, name: string) => {
      this.branchCurrents.set(name, current);
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
    if (!this.scheduler) return;
    const syncTime = this.globalTime;
    this.digitalEngine.processEvents(syncTime);
  }

  tickMcuCore(): void {
    if (this.mcuFamily.startsWith('STM32') && this.qemuBridge.isRunning()) {
      // Step the STM32 CPU
      const step = this.qemuBridge.step(1);
      if (step.success && step.data !== undefined) {
        this.mcuPc = step.data;
        this.mcuRegs.set('PC', this.mcuPc);
      }
      // Sync all GPIO ports to analog nets
      const gpioBases = [0x40010800, 0x40010C00, 0x40011000]; // GPIOA, B, C
      for (let port = 0; port < gpioBases.length; port++) {
        const odr = this.qemuBridge.readPeriph(gpioBases[port] + 0x0C); // ODR
        for (let bit = 0; bit < 16; bit++) {
          const level = (odr >> bit) & 1;
          const pinId = `P${String.fromCharCode(65 + port)}${bit}`;
          this.syncMcuPinToSpice('mcu0', pinId, level === 1 ? 3.3 : 0);
        }
      }
      return;
    }
    if (this.mcuLoaded) {
      this.mcu8051.step();
      const regs = this.mcu8051.getRegisters();
      regs.forEach((v: number, k: string) => this.mcuRegs.set(k, v));
      this.mcuPc = this.mcu8051.getPc();
      this.syncMcuPinsToSpice();
    } else {
      this.mcuPc += 1;
      this.mcuRegs.set('PC', this.mcuPc);
    }
  }

  loadMcuProgram(data: Uint8Array, offset: number = 0, family: string = '8051'): void {
    this.mcuFamily = family.toUpperCase();
    if (this.mcuFamily.startsWith('STM32')) {
      this.qemuBridge.loadFirmware(data);
      this.qemuBridge.start('firmware.hex', 'stm32f103');
      this.mcuLoaded = true;
      // Auto-register GPIO pins as cross-coupled nets
      if (this.topology) {
        for (let bit = 0; bit < 8; bit++) {
          const digitalNetId = `mcu0_GPIO${bit}`;
          const analogNode = this.spiceNodeMap.get(digitalNetId) ?? digitalNetId;
          this.crossCoupledNets.set(digitalNetId, analogNode);
        }
      }
      return;
    }
    this.mcu8051.loadProgram(data, offset);
    this.mcu8051.reset();
    this.mcuLoaded = true;
  }

  private syncMcuPinsToSpice(): void {
    // Sync all GPIO ports from MCU to analog nets
    // Port naming: P1.0-P1.7 → schematic pin "P1", etc.
    const ports = ['P0', 'P1', 'P2', 'P3'];
    for (const port of ports) {
      let portVal = 0;
      for (let bit = 0; bit < 8; bit++) {
        const level = this.mcu8051.getPinLevel(port, bit);
        if (level > 0) portVal |= (1 << bit);
      }
      // Map port to schematic pin: "P1" or "P1.0" → find matching net
      // Try port-level match first, then bit-level as fallback
      const pinIds = [port, `${port}.0`, `${port}_0`];
      for (const pinId of pinIds) {
        const netVoltage = portVal > 0 ? 5.0 : 0;
        // Set all individual bit pins too
        if (this.topology) {
          for (const net of this.topology.netList) {
            for (const nodeRef of net.nodeList) {
              if (nodeRef.devUuid === 'mcu0') {
                const refId = nodeRef.pinId;
                if (refId === port || (refId && refId.includes(port) && !refId.includes('.'))) {
                  // Found the MCU port pin on the schematic
                  const nodeName = this.spiceNodeMap.get(net.netUuid) ?? net.netName;
                  if (nodeName.length > 0) {
                    // Write port value as analog voltage (5V = all bits high, 0V = all bits low)
                    // For mixed states, write the effective voltage
                    this.nodeVoltages.set(nodeName, (portVal / 255) * 5.0);
                  }
                }
              }
            }
          }
        }
      }
    }
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
            } else if (comp.libraryId.startsWith('C_') || comp.libraryId.includes('Cap')) {
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
          if (n !== '0' && n !== 'GND' && n !== 'VCC') { outNode = n; break; }
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
    this.schematic = doc;
    this.topology = TopologyAdapter.toTopology(doc);
    this.state = SimulationState.IDLE;
    this.result = null;
    this.digitalEngine.loadSchematic(doc);
    this.analogEngine.loadSchematic(doc, this.config);
    this.scheduler = new GlobalScheduler(this.config, this.digitalEngine, this.analogEngine);
    if (this.topology) this.buildSpiceNodeMap(this.topology);
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
    if (!this.schematic) return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: 'No schematic loaded' };
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
    if (this.state !== SimulationState.RUNNING) return { success: false, errCode: ErrCode.ERR_SIM_BUSY, error: 'Not running' };
    this.state = SimulationState.PAUSED;
    return { success: true, errCode: ErrCode.OK };
  }

  resume(): Result<void> {
    if (this.state !== SimulationState.PAUSED) return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: 'Not paused' };
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
    this.mcuPc = this.mcu8051.getPc();
    this.globalTime = stepResult.time;
    this.accumulateResult(stepResult);
    this.dynamicErcViolations = DynamicErcEngine.analyze(
      this.waveDataList,
      this.result?.digitalStates ? this.flattenDigitalStates(this.result.digitalStates) : new Map<string, string>()
    );

    const emptyStep: SimStepEmptyData = { empty: true };
    const stepData: Object = this.result !== null ? this.result as Object : emptyStep;
    EventBus.getInstance().publish({
      event: ModuleEvent.SIMULATION_STEP,
      source: 'simulation_kernel',
      timestamp: Date.now(),
      data: stepData
    });

    if (this.scheduler.isFinished()) {
      this.state = SimulationState.STOPPED;
    }

    return { success: true, errCode: ErrCode.OK, data: this.result! };
  }

  getState(): SimulationState { return this.state; }
  getResult(): SimulationResult | null { return this.result; }

  getSignalData(signalName: string): Result<number[]> {
    if (!this.result) return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: 'No simulation result' };
    const data = this.result.signals.get(signalName);
    if (!data) return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: `Signal ${signalName} not found` };
    return { success: true, errCode: ErrCode.OK, data };
  }

  getDigitalState(pinId: string): boolean {
    const states = this.result?.digitalStates.get(pinId);
    if (!states || states.length === 0) return false;
    return states[states.length - 1] === LogicState.HIGH;
  }

  getMcuSnapshot(): McuRegisterSnapshot | null {
    if (!this.result?.mcuRegisters?.length) return null;
    return this.result.mcuRegisters[this.result.mcuRegisters.length - 1];
  }

  setComponentParameter(componentId: string, param: string, value: string): Result<void> {
    if (!this.schematic) return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: 'No schematic loaded' };
    const comp = this.schematic.components.find(c => c.id === componentId);
    if (!comp) return { success: false, errCode: ErrCode.ERR_DEVICE_NOT_EXIST, error: 'Component not found' };
    comp.parameters.set(param, value);
    return { success: true, errCode: ErrCode.OK };
  }

  generateSpiceNetlist(): Result<string> {
    if (!this.schematic) return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: 'No schematic loaded' };
    return { success: true, errCode: ErrCode.OK, data: this.analogEngine.getNetlist() };
  }

  getHazards(): HazardReport[] {
    return this.digitalEngine.detectHazards();
  }

  // ---- 1.3.11 A/D 接口: 数字输出 → Thevenin 等效源映射到模拟节点 ----
  registerCrossCoupledNet(digitalNetId: string, analogNetId: string): void {
    this.crossCoupledNets.set(digitalNetId, analogNetId);
  }

  private applyDigitalToAnalogThevenin(digitalStates: Map<string, LogicState>): void {
    this.theveninSources = [];
    digitalStates.forEach((state: LogicState, nodeId: string) => {
      if (state === LogicState.HIGH_Z || state === LogicState.UNKNOWN) return;
      const analogNode = this.crossCoupledNets.get(nodeId) ?? nodeId;
      const voltage = state === LogicState.HIGH ? VOH_HC_5V : 0;
      this.theveninSources.push({ netId: analogNode, voltage: voltage, resistance: ROUT_HC });
      this.nodeVoltages.set(analogNode, voltage);
    });
  }

  // ---- 1.3.12 D/A 阈值检测: 模拟电压跨越逻辑阈值时生成数字事件 ----
  private applyAnalogToDigitalThresholds(prevAnalog: Map<string, number>,
                                         currAnalog: Map<string, number>): void {
    const vcc = 5.0;
    const vil = vcc > 4.0 ? VIL_CMOS_5V : VIL_CMOS_3V3;
    const vih = vcc > 4.0 ? VIH_CMOS_5V : VIH_CMOS_3V3;
    currAnalog.forEach((voltage: number, nodeId: string) => {
      const prev = prevAnalog.get(nodeId) ?? voltage;
      if (prev < vil && voltage >= vih) {
        this.digitalEngine.scheduleEvent(this.globalTime, nodeId, LogicState.HIGH);
      } else if (prev > vih && voltage <= vil) {
        this.digitalEngine.scheduleEvent(this.globalTime, nodeId, LogicState.LOW);
      }
      this.nodeVoltages.set(nodeId, voltage);
    });
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
    } else if (sim.simMode === 'dc') {
      mode = SimulationMode.DC;
    } else if (sim.simMode === 'ac') {
      mode = SimulationMode.AC;
    } else if (sim.simMode === 'monte_carlo') {
      mode = SimulationMode.MONTE_CARLO;
    } else if (sim.simMode === 'noise') {
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
          if (comp) libId = comp.libraryId.toUpperCase();
        }
        if (libId.length === 0) {
          const dev = topo.deviceList.find(d => d.instUuid === compId);
          if (dev) libId = dev.libDevId.toUpperCase();
        }
        if (libId.length === 0) continue;
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
            libId.includes('DIODE') || libId.includes('LED') || libId.includes('NPN') ||
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

  private updateWaveData(probeName: string, time: number, voltage: number, current: number): void {
    let wave = this.waveDataList.find(w => w.probeName === probeName);
    if (!wave) {
      wave = {
        waveId: IdUtil.generate('wave'),
        probeName: probeName,
        netName: probeName,
        timeAxis: [],
        voltageAxis: [],
        currentAxis: [],
        sampleRate: 1 / (this.config.stepSize || 1e-6),
        waveType: 'voltage',
        holdTime: 0
      };
      this.waveDataList.push(wave);
    }
    wave.timeAxis.push(time);
    wave.voltageAxis.push(voltage);
    wave.currentAxis.push(current);
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
      this.updateWaveData(name, stepResult.time, val, 0);
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
      } else if (last === LogicState.LOW) {
        flat.set(pinId, '0');
      } else {
        flat.set(pinId, 'X');
      }
    });
    return flat;
  }

  private saveParamDefaults(): void {
    this.paramScanDefaults.clear();
    if (!this.schematic) return;
    for (const comp of this.schematic.components) {
      this.paramScanDefaults.set(comp.id, copyStringMap(comp.parameters));
    }
  }

  private restoreParamDefaults(): void {
    if (!this.schematic) return;
    this.schematic.components.forEach((comp) => {
      const saved = this.paramScanDefaults.get(comp.id);
      if (saved) {
        comp.parameters = copyStringMap(saved);
      }
    });
  }

  private static parseNumericValue(val: string): number {
    const s = val.toLowerCase();
    if (s.includes('k')) return parseFloat(s) * 1000;
    if (s.includes('u') || s.includes('µ')) return parseFloat(s) * 1e-6;
    if (s.includes('n')) return parseFloat(s) * 1e-9;
    if (s.includes('p')) return parseFloat(s) * 1e-12;
    const n = parseFloat(s);
    return isNaN(n) ? 1000 : n;
  }

  private static computeStats(values: number[]): StatsSnapshot {
    if (values.length === 0) {
      const empty: StatsSnapshot = { mean: 0, stdDev: 0, min: 0, max: 0, cp: 0, cpk: 0 };
      return empty;
    }
    let sum = 0; let min = values[0]; let max = values[0];
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (values[i] < min) min = values[i];
      if (values[i] > max) max = values[i];
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
}
