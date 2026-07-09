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

  // ---- Voltmeter ----
  setVoltmeterType(type: VoltmeterType): ApiResult<void>;
  voltmeterMeasure(): ApiResult<number>;
  voltmeterAutoRange(): ApiResult<void>;
  voltmeterSetRange(idx: number): ApiResult<void>;
  getVoltmeterConfig(): ApiResult<VoltmeterConfig>;
  setVoltmeterReader(reader: (() => number) | null): void;
  setVoltmeterGlobalFallback(reader: (() => number) | null): void;

  // ---- Ammeter ----
  setAmmeterType(type: AmmeterType): ApiResult<void>;
  ammeterMeasure(): ApiResult<number>;
  ammeterAutoRange(): ApiResult<void>;
  ammeterSetRange(idx: number): ApiResult<void>;
  getAmmeterConfig(): ApiResult<AmmeterConfig>;
  setAmmeterReader(reader: (() => number) | null): void;
  setAmmeterGlobalFallback(reader: (() => number) | null): void;

  // ---- Power Meter ----
  powerMeterMeasure(): ApiResult<PowerMeterConfig>;
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
