/**
 * 模块3：混合信号仿真内核 API（v2 完备版）
 */
import {
  SchematicDocument, SimulationConfig, SimulationResult,
  SimulationState, Result, McuRegisterSnapshot,
  SchTopology, SimConfig, WaveData, FreqNoiseData, SimStatResult,
  SpiceResult, ProgressCallback, ApiResult
} from 'common';

export interface ISimulationKernel {
  // ---- v2 API ----
  /** Prefer passing schematicDoc with rebuilt pinIds; topo alone loses pin names (AC+/OUT1). */
  startSimulation(topo: SchTopology, config: SimConfig, onProgress?: ProgressCallback,
    schematicDoc?: SchematicDocument): ApiResult<void>;
  pauseSim(): ApiResult<void>;
  resumeSim(): ApiResult<void>;
  globalResetSim(): ApiResult<void>;
  stopSim(): ApiResult<void>;
  simSingleStep(): ApiResult<SpiceResult>;
  isSimRunning(): boolean;
  getAllWaveData(): WaveData[];
  getNodeVoltage(nodeName: string): number;
  getBranchCurrent(branchName: string): number;
  getMcuPinVoltage(mcuInstUuid: string, pinId: string): number;
  getTotalPower(): number;
  globalTimeTick(): number;
  syncMcuPinToSpice(mcuInstUuid: string, pinId: string, level: number): ApiResult<void>;
  syncSpiceToMcuAdc(mcuInstUuid: string, adcChannel: number, voltage: number): ApiResult<void>;
  syncDigitalToAnalogNet(netUuid: string): ApiResult<void>;
  runSpiceStep(): SpiceResult;
  tickDigitalLogic(): void;
  tickMcuCore(): void;
  runParamScan(paramName: string, start: number, end: number, steps: number): SimStatResult[];
  runMonteCarlo(count: number, onProgress?: ProgressCallback): SimStatResult[];
  runNoiseAnalysis(freqStart: number, freqEnd: number, points: number): FreqNoiseData[];
  generateSpiceNetlistFromTopo(topo: SchTopology): ApiResult<string>;
  netToSpiceNodeMap(): Map<string, string>;
  releaseSimResource(): void;
  loadMcuProgram(data: Uint8Array, offset: number, family: string): void;
  /** Host UART TX bytes → MCU USART RX (STM32 path). */
  injectUsartRx(bytes: number[]): void;

  // ---- v1 兼容 ----
  loadSchematic(doc: SchematicDocument): Result<void>;
  setConfig(config: SimulationConfig): void;
  getConfig(): SimulationConfig;
  start(): Result<void>;
  pause(): Result<void>;
  resume(): Result<void>;
  stop(): Result<void>;
  step(): Result<SimulationResult>;
  getState(): SimulationState;
  getResult(): SimulationResult | null;
  getSignalData(signalName: string): Result<number[]>;
  getDigitalState(pinId: string): boolean;
  getMcuSnapshot(): McuRegisterSnapshot | null;
  setComponentParameter(componentId: string, param: string, value: string): Result<void>;
  generateSpiceNetlist(): Result<string>;
}
