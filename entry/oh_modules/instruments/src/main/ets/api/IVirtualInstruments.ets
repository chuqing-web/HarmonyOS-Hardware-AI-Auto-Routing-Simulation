/**
 * 模块8：虚拟仪器 API
 */
import {
  ApiResult, WaveData,
  OscTimebase, OscVoltageScale, CouplingMode, TriggerMode, CaptureMode, MathChannelOp,
  CursorMeasurement, LogicDecodeProtocol, DecodedFrame, MultimeterMode,
  SignalWaveform, SignalGenConfig, UartTerminalConfig,
  VoltmeterType, VoltmeterConfig, AmmeterType, AmmeterConfig,
  PowerMeterConfig, FrequencyCounterConfig
} from 'common';

export interface SignalGroup {
  name: string;
  channelIndices: number[];
}

export interface SignalGenParams {
  frequency: number;
  amplitude: number;
  offset: number;
  dutyCycle: number;
  phase: number;
}

export interface TimedScriptCommand {
  delayMs: number;
  command: string;
}

export interface IVirtualInstruments {
  // ---- Oscilloscope ----
  setTimebase(timebase: OscTimebase): ApiResult<void>;
  setVoltageScale(channel: number, scale: OscVoltageScale): ApiResult<void>;
  setCoupling(channel: number, mode: CouplingMode): ApiResult<void>;
  setTrigger(mode: TriggerMode, level: number, channel: number): ApiResult<void>;
  measureCursors(cursorA: number, cursorB: number): ApiResult<CursorMeasurement>;
  setCaptureMode(mode: CaptureMode): ApiResult<void>;
  setMathChannel(op: MathChannelOp, fftLogScale?: boolean): ApiResult<void>;
  getOscilloscopeWave(channel?: number): ApiResult<WaveData>;
  exportWaveformSvg(channel: number, path: string): Promise<ApiResult<void>>;

  // ---- Logic Analyzer ----
  setChannels(count: number): ApiResult<void>;
  setThreshold(mV: number): ApiResult<void>;
  decodeBus(protocol: LogicDecodeProtocol, baudRate?: number): ApiResult<void>;
  groupSignals(groups: SignalGroup[]): ApiResult<void>;
  getDecodedFrames(): DecodedFrame[];
  getLogicWaveData(): ApiResult<WaveData[]>;

  // ---- Multimeter ----
  setMode(mode: MultimeterMode): ApiResult<void>;
  measure(): ApiResult<number>;
  autoRange(): ApiResult<void>;
  setMultimeterReader(reader: (() => number) | null): void;
  setMultimeterGlobalFallback(reader: (() => number) | null): void;

  // ---- Signal Generator ----
  setWaveform(waveform: SignalWaveform): ApiResult<void>;
  setParams(params: SignalGenParams): ApiResult<void>;
  setBurstMode(enabled: boolean, count?: number): ApiResult<void>;
  getSignalGenWave(): ApiResult<WaveData>;

  // ---- UART Terminal ----
  uartHexSend(hex: string): ApiResult<void>;
  uartHexReceive(): ApiResult<string>;
  setUartAutoNewline(enabled: boolean): void;
  runTimedScript(commands: TimedScriptCommand[]): ApiResult<void>;
  exportUartLog(path: string): Promise<ApiResult<void>>;
  getUartLog(): string;
  clearUartLog(): void;
  /** MCU → 虚拟串口终端 RX */
  uartIngestMcuTx(bytes: number[]): void;

  // ---- Voltmeter ----
  setVoltmeterType(type: VoltmeterType): ApiResult<void>;
  voltmeterMeasure(): ApiResult<number>;
  /** Feed a raw ΔV sample (per-instance) through DC avg / AC RMS */
  voltmeterMeasureValue(raw: number): ApiResult<number>;
  /** Instant DC after interactive pot/switch */
  voltmeterSnapReading(raw: number): number;
  voltmeterAutoRange(): ApiResult<void>;
  voltmeterSetRange(idx: number): ApiResult<void>;
  getVoltmeterConfig(): ApiResult<VoltmeterConfig>;
  setVoltmeterReader(reader: (() => number) | null): void;
  setVoltmeterGlobalFallback(reader: (() => number) | null): void;

  // ---- Multimeter (DCV avg / ACV RMS) ----
  multimeterMeasureValue(raw: number): ApiResult<number>;
  /** Instant DCV after interactive pot/switch */
  multimeterSnapReading(raw: number): number;

  // ---- Ammeter ----
  setAmmeterType(type: AmmeterType): ApiResult<void>;
  ammeterMeasure(): ApiResult<number>;
  /** Feed a raw I sample (mA, per-instance) through DC avg / AC RMS */
  ammeterMeasureValue(raw: number): ApiResult<number>;
  /** Instant DC after interactive pot/switch */
  ammeterSnapReading(raw: number): number;
  ammeterAutoRange(): ApiResult<void>;
  ammeterSetRange(idx: number): ApiResult<void>;
  getAmmeterConfig(): ApiResult<AmmeterConfig>;
  setAmmeterReader(reader: (() => number) | null): void;
  setAmmeterGlobalFallback(reader: (() => number) | null): void;

  // ---- Power Meter ----
  powerMeterMeasure(): ApiResult<PowerMeterConfig>;
  /** Instant V/I/P after interactive pot/switch (no EMA lag) */
  powerMeterSnapReading(vRaw: number, iRaw: number): PowerMeterConfig;
  setPowerMeterVoltageReader(reader: (() => number) | null): void;
  setPowerMeterCurrentReader(reader: (() => number) | null): void;
  setPowerMeterGlobalFallbacks(voltageReader: (() => number) | null, currentReader: (() => number) | null): void;

  // ---- Frequency Counter ----
  freqCounterSetGateTime(seconds: number): ApiResult<void>;
  freqCounterMeasure(): ApiResult<number>;
  getFreqCounterConfig(): ApiResult<FrequencyCounterConfig>;
  setFreqCounterReader(reader: (() => number) | null): void;
  setFreqCounterGlobalFallback(reader: (() => number) | null): void;

  getInstrumentSnapshot(): InstrumentSnapshotView;
  feedSimulationWaves(waves: WaveData[]): ApiResult<void>;
  autoAssignScopeProbes(): void;
  feedScopeNodeData(voltages: Map<string, number>, currents: Map<string, number>): void;
  feedScopeTimeSnapshot(time: number, voltages: Map<string, number>): void;
  /** Rewrite scope history probe voltages after interactive DC edits */
  snapScopeDcLevels(voltages: Map<string, number>): void;

  /** Bind instrument readings to a specific schematic component instance */
  registerComponentBinding(compId: string, binding: ComponentInstrumentBinding): void;
  setActiveInstrumentComponent(compId: string | null): void;
  getActiveInstrumentComponent(): string | null;
  clearComponentBindings(): void;
}

export interface ComponentInstrumentBinding {
  libraryId: string;
  scopeProbes: string[];
  logicProbes: string[];
  voltageReader: (() => number) | null;
  currentReader: (() => number) | null;
  powerVoltageReader: (() => number) | null;
  powerCurrentReader: (() => number) | null;
  freqReader: (() => number) | null;
}

export interface InstrumentSnapshotView {
  oscilloscope: OscilloscopeView;
  logicAnalyzer: LogicAnalyzerView;
  multimeterMode: MultimeterMode;
  signalGen: SignalGenConfig;
  uart: UartTerminalConfig;
  voltmeter: VoltmeterConfig;
  ammeter: AmmeterConfig;
  powerMeter: PowerMeterConfig;
  freqCounter: FrequencyCounterConfig;
}

export interface OscilloscopeView {
  timebase: OscTimebase;
  voltageScales: OscVoltageScale[];
  coupling: CouplingMode[];
  triggerMode: TriggerMode;
  triggerLevel: number;
  triggerChannel: number;
  captureMode: CaptureMode;
  mathOp: MathChannelOp;
  fftLogScale: boolean;
}

export interface LogicAnalyzerView {
  channelCount: number;
  threshold: number;
  decodeProtocol: LogicDecodeProtocol;
  baudRate: number;
  signalGroups: SignalGroup[];
}
