/**
 * 模块8：虚拟仪器完整实现
 */
import {
  IVirtualInstruments, SignalGroup, SignalGenParams, TimedScriptCommand,
  InstrumentSnapshotView, ComponentInstrumentBinding
} from './api/IVirtualInstruments';
import { OscilloscopeEngine } from './engines/OscilloscopeEngine';
import { LogicAnalyzerEngine } from './engines/LogicAnalyzerEngine';
import { MultimeterEngine } from './engines/MultimeterEngine';
import { SignalGeneratorEngine, AnalogEngineSink } from './engines/SignalGeneratorEngine';
import { UartTerminalEngine } from './engines/UartTerminalEngine';
import { VoltmeterEngine } from './engines/VoltmeterEngine';
import { AmmeterEngine } from './engines/AmmeterEngine';
import { PowerMeterEngine } from './engines/PowerMeterEngine';
import { FrequencyCounterEngine } from './engines/FrequencyCounterEngine';
import {
  ApiResult, ErrCode, ResultHelper, Validate, WaveData,
  OscTimebase, OscVoltageScale, CouplingMode, TriggerMode, CaptureMode,
  MathChannelOp, CursorMeasurement, LogicDecodeProtocol, DecodedFrame,
  MultimeterMode, SignalWaveform, VoltmeterType, VoltmeterConfig,
  AmmeterType, AmmeterConfig, PowerMeterConfig, FrequencyCounterConfig,
  traceActiveComponent, traceActiveComponentChanged, formatBindingSummary, BindingTraceInfo, Logger, INSTR_TRACE_TAG,
  traceUart, formatUartBytesHex
} from 'common';
import fs from '@ohos.file.fs';

export class VirtualInstrumentsImpl implements IVirtualInstruments {
  private oscilloscope: OscilloscopeEngine = new OscilloscopeEngine();
  private logicAnalyzer: LogicAnalyzerEngine = new LogicAnalyzerEngine();
  private multimeter: MultimeterEngine = new MultimeterEngine();
  private signalGen: SignalGeneratorEngine = new SignalGeneratorEngine();
  private uartTerminal: UartTerminalEngine = new UartTerminalEngine();
  private voltmeter: VoltmeterEngine = new VoltmeterEngine();
  private ammeter: AmmeterEngine = new AmmeterEngine();
  private powerMeter: PowerMeterEngine = new PowerMeterEngine();
  private freqCounter: FrequencyCounterEngine = new FrequencyCounterEngine();

  private componentBindings: Map<string, ComponentInstrumentBinding> = new Map();
  private activeCompId: string | null = null;
  private uartTxSink: ((bytes: number[]) => void) | null = null;

  /** Forward terminal TX hex into the simulation kernel USART RX path. */
  setUartTxSink(sink: ((bytes: number[]) => void) | null): void {
    this.uartTxSink = sink;
  }

  registerComponentBinding(compId: string, binding: ComponentInstrumentBinding): void {
    this.componentBindings.set(compId, binding);
    const traceInfo: BindingTraceInfo = {
      libraryId: binding.libraryId,
      scopeProbes: binding.scopeProbes.slice(),
      logicProbes: binding.logicProbes.slice(),
      hasVoltageReader: binding.voltageReader !== null,
      hasCurrentReader: binding.currentReader !== null,
      hasPowerVoltageReader: binding.powerVoltageReader !== null,
      hasPowerCurrentReader: binding.powerCurrentReader !== null,
      hasFreqReader: binding.freqReader !== null
    };
    Logger.debug(INSTR_TRACE_TAG, `registerBinding comp=${compId} ${formatBindingSummary(traceInfo)}`);
    if (compId === this.activeCompId) {
      this.applyActiveBinding();
    }
  }

  setActiveInstrumentComponent(compId: string | null): void {
    const changed = compId !== this.activeCompId;
    this.activeCompId = compId;
    if (changed) {
      traceActiveComponentChanged(compId, 'VirtualInstrumentsImpl.setActive');
    }
    this.applyActiveBinding();
  }

  getActiveInstrumentComponent(): string | null {
    return this.activeCompId;
  }

  clearComponentBindings(): void {
    this.componentBindings.clear();
    this.activeCompId = null;
    this.clearLegacyReaders();
  }

  private getActiveBinding(): ComponentInstrumentBinding | null {
    if (this.activeCompId === null || this.activeCompId.length === 0) {
      return null;
    }
    return this.componentBindings.get(this.activeCompId) ?? null;
  }

  /** Apply active component's readers and scope probes to the shared engines */
  private applyActiveBinding(): void {
    const binding = this.getActiveBinding();
    if (binding === null) {
      Logger.debug(INSTR_TRACE_TAG, 'applyBinding: cleared (no active component)');
      this.clearLegacyReaders();
      return;
    }
    Logger.debug(INSTR_TRACE_TAG,
      `applyBinding active=${this.activeCompId} scope=[${binding.scopeProbes.join('|')}] ` +
      `logic=[${binding.logicProbes.join('|')}]`);
    this.multimeter.setReadingReader(binding.voltageReader);
    this.voltmeter.setVoltageReader(binding.voltageReader);
    this.ammeter.setCurrentReader(binding.currentReader);
    this.powerMeter.setVoltageReader(binding.powerVoltageReader);
    this.powerMeter.setCurrentReader(binding.powerCurrentReader);
    this.freqCounter.setFreqReader(binding.freqReader);
    for (let ch = 0; ch < 4; ch++) {
      const probe = ch < binding.scopeProbes.length ? binding.scopeProbes[ch] : '';
      this.oscilloscope.setChannelProbe(ch, probe);
    }
  }

  private clearLegacyReaders(): void {
    this.multimeter.setReadingReader(null);
    this.voltmeter.setVoltageReader(null);
    this.ammeter.setCurrentReader(null);
    this.powerMeter.setVoltageReader(null);
    this.powerMeter.setCurrentReader(null);
    this.freqCounter.setFreqReader(null);
    this.oscilloscope.setChannelProbe(0, '');
    this.oscilloscope.setChannelProbe(1, '');
    this.oscilloscope.setChannelProbe(2, '');
    this.oscilloscope.setChannelProbe(3, '');
  }

  private ensureActiveBindingApplied(): void {
    this.applyActiveBinding();
  }

  // ---- Oscilloscope ----

  setTimebase(timebase: OscTimebase): ApiResult<void> {
    this.oscilloscope.setTimebase(timebase);
    return ResultHelper.ok();
  }

  setVoltageScale(channel: number, scale: OscVoltageScale): ApiResult<void> {
    if (channel < 0 || channel > 3) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Channel must be 0-3');
    }
    this.oscilloscope.setVoltageScale(channel, scale);
    return ResultHelper.ok();
  }

  setCoupling(channel: number, mode: CouplingMode): ApiResult<void> {
    if (channel < 0 || channel > 3) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Channel must be 0-3');
    }
    this.oscilloscope.setCoupling(channel, mode);
    return ResultHelper.ok();
  }

  setTrigger(mode: TriggerMode, level: number, channel: number): ApiResult<void> {
    if (channel < 0 || channel > 3) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Channel must be 0-3');
    }
    this.oscilloscope.setTrigger(mode, level, channel);
    return ResultHelper.ok();
  }

  measureCursors(cursorA: number, cursorB: number): ApiResult<CursorMeasurement> {
    if (cursorA < 0 || cursorB < 0) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Cursor indices must be non-negative');
    }
    return ResultHelper.ok(this.oscilloscope.measureCursors(cursorA, cursorB));
  }

  setCaptureMode(mode: CaptureMode): ApiResult<void> {
    this.oscilloscope.setCaptureMode(mode);
    return ResultHelper.ok();
  }

  setMathChannel(op: MathChannelOp, fftLogScale: boolean = false): ApiResult<void> {
    this.oscilloscope.setMathChannel(op, fftLogScale);
    return ResultHelper.ok();
  }

  getOscilloscopeWave(channel: number = 0): ApiResult<WaveData> {
    if (channel < 0 || channel > 3) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Channel must be 0-3');
    }
    this.ensureActiveBindingApplied();
    return ResultHelper.ok(this.oscilloscope.captureWave(channel));
  }

  async exportWaveformSvg(channel: number, path: string): Promise<ApiResult<void>> {
    const pathErr = Validate.filePath(path);
    if (pathErr !== null) return ResultHelper.fail(pathErr);
    if (channel < 0 || channel > 3) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Channel must be 0-3');
    }
    try {
      const svg = this.oscilloscope.exportSvg(channel);
      const file = fs.openSync(path, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
      fs.writeSync(file.fd, svg);
      fs.closeSync(file);
      return ResultHelper.ok();
    } catch (e) {
      return ResultHelper.fail(ErrCode.ERR_PERMISSION, `Failed to export SVG: ${e}`);
    }
  }

  // ---- Logic Analyzer ----

  setChannels(count: number): ApiResult<void> {
    if (count < 1 || count > 32) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Channel count must be 1-32');
    }
    this.logicAnalyzer.setChannels(count);
    return ResultHelper.ok();
  }

  setThreshold(mV: number): ApiResult<void> {
    if (mV < 0 || mV > 5000) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Threshold must be 0-5000 mV');
    }
    this.logicAnalyzer.setThreshold(mV);
    return ResultHelper.ok();
  }

  decodeBus(protocol: LogicDecodeProtocol, baudRate: number = 115200): ApiResult<void> {
    if (baudRate <= 0) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Baud rate must be positive');
    }
    this.logicAnalyzer.decodeBus(protocol, baudRate);
    return ResultHelper.ok();
  }

  groupSignals(groups: SignalGroup[]): ApiResult<void> {
    this.logicAnalyzer.groupSignals(groups);
    return ResultHelper.ok();
  }

  getDecodedFrames(): DecodedFrame[] {
    return this.logicAnalyzer.getDecodedFrames();
  }

  getLogicWaveData(): ApiResult<WaveData[]> {
    this.ensureActiveBindingApplied();
    const binding = this.getActiveBinding();
    if (binding !== null && binding.logicProbes.length > 0) {
      return ResultHelper.ok(this.logicAnalyzer.captureChannelsForProbes(binding.logicProbes));
    }
    return ResultHelper.ok(this.logicAnalyzer.captureAllChannels());
  }

  // ---- Multimeter ----

  setMode(mode: MultimeterMode): ApiResult<void> {
    this.multimeter.setMode(mode);
    return ResultHelper.ok();
  }

  measure(): ApiResult<number> {
    this.ensureActiveBindingApplied();
    return ResultHelper.ok(this.multimeter.measure());
  }

  autoRange(): ApiResult<void> {
    this.multimeter.autoRange();
    return ResultHelper.ok();
  }

  setMultimeterReader(reader: (() => number) | null): void {
    this.multimeter.setReadingReader(reader);
  }

  setMultimeterGlobalFallback(reader: (() => number) | null): void {
    this.multimeter.setGlobalFallback(reader);
  }

  // ---- Signal Generator ----

  setWaveform(waveform: SignalWaveform): ApiResult<void> {
    this.signalGen.setWaveform(waveform);
    return ResultHelper.ok();
  }

  setParams(params: SignalGenParams): ApiResult<void> {
    if (params.frequency <= 0) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Frequency must be positive');
    }
    this.signalGen.setParams(params);
    return ResultHelper.ok();
  }

  setBurstMode(enabled: boolean, count: number = 5): ApiResult<void> {
    if (enabled && count < 1) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Burst count must be at least 1');
    }
    this.signalGen.setBurstMode(enabled, count);
    return ResultHelper.ok();
  }

  getSignalGenWave(): ApiResult<WaveData> {
    return ResultHelper.ok(this.signalGen.generateWave());
  }

  // ---- UART Terminal ----

  uartHexSend(hex: string): ApiResult<void> {
    if (!hex || hex.trim().length === 0) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Hex string is empty');
    }
    this.uartTerminal.hexSend(hex);
    const cleaned = hex.replace(/\s+/g, '').toUpperCase();
    if (!/^[0-9A-F]*$/.test(cleaned) || cleaned.length % 2 !== 0) {
      traceUart('TERM_TX_FAIL', `invalidHex=${hex}`);
      return ResultHelper.ok();
    }
    const bytes: number[] = [];
    for (let i = 0; i < cleaned.length; i += 2) {
      bytes.push(parseInt(cleaned.substring(i, i + 2), 16));
    }
    const sinkOk = this.uartTxSink !== null;
    traceUart('TERM_TX',
      `hex=${cleaned} n=${bytes.length} bytes=[${formatUartBytesHex(bytes)}] sink=${sinkOk ? 'yes' : 'NO'}`);
    if (this.uartTxSink !== null) {
      this.uartTxSink(bytes);
    } else {
      traceUart('TERM_TX_DROP', 'uartTxSink is null — bytes never reach MCU USART RX');
    }
    return ResultHelper.ok();
  }

  /** Feed MCU USART transmit bytes into the virtual terminal RX log. */
  uartIngestMcuTx(bytes: number[]): void {
    if (bytes.length === 0) {
      return;
    }
    let all55 = true;
    for (let i = 0; i < bytes.length; i++) {
      if ((bytes[i] & 0xFF) !== 0x55) {
        all55 = false;
        break;
      }
    }
    if (!all55) {
      traceUart('TERM_RX', `n=${bytes.length} hex=${formatUartBytesHex(bytes)}`);
    }
    this.uartTerminal.ingestMcuTxBytes(bytes);
  }

  uartHexReceive(): ApiResult<string> {
    return ResultHelper.ok(this.uartTerminal.hexReceive());
  }

  setUartAutoNewline(enabled: boolean): void {
    this.uartTerminal.setAutoNewline(enabled);
  }

  runTimedScript(commands: TimedScriptCommand[]): ApiResult<void> {
    if (!commands || commands.length === 0) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Script has no commands');
    }
    this.uartTerminal.runTimedScript(commands);
    return ResultHelper.ok();
  }

  async exportUartLog(path: string): Promise<ApiResult<void>> {
    const pathErr = Validate.filePath(path);
    if (pathErr !== null) return ResultHelper.fail(pathErr);
    try {
      const log = this.uartTerminal.getLog();
      const file = fs.openSync(path, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
      fs.writeSync(file.fd, log);
      fs.closeSync(file);
      return ResultHelper.ok();
    } catch (e) {
      return ResultHelper.fail(ErrCode.ERR_PERMISSION, `Failed to export log: ${e}`);
    }
  }

  getUartLog(): string {
    return this.uartTerminal.getLog();
  }

  feedSimulationWaves(waves: WaveData[]): ApiResult<void> {
    this.oscilloscope.feedSimulationWaves(waves);
    this.logicAnalyzer.feedSimulationWaves(waves);
    return ResultHelper.ok();
  }

  feedScopeNodeData(voltages: Map<string, number>, currents: Map<string, number>): void {
    this.oscilloscope.feedNodeVoltages(voltages);
    this.oscilloscope.feedBranchCurrents(currents);
  }

  /** Feed a time snapshot for building oscilloscope time-domain waveforms */
  feedScopeTimeSnapshot(time: number, voltages: Map<string, number>): void {
    this.oscilloscope.feedTimeSnapshot(time, voltages);
  }

  /** Frequency from scope history when kernel WaveData is flat / too short */
  estimateFreqFromScopeHistory(probeName: string): number {
    return this.oscilloscope.estimateFrequency(probeName);
  }

  /** Feed digital pin levels to logic analyzer for UUID-keyed probes */
  feedLogicDigitalStates(states: Map<string, number>): void {
    this.logicAnalyzer.feedDigitalStates(states);
  }

  /** Auto-assign oscilloscope probes from simulation data */
  autoAssignScopeProbes(): void {
    this.oscilloscope.autoAssignProbes();
  }

  /** Connect signal generator output to the analog simulation engine */
  connectSignalGenToCircuit(analogEngine: AnalogEngineSink, nodeA: string, nodeB: string): void {
    this.signalGen.connectToCircuit(analogEngine, nodeA, nodeB);
  }

  disconnectSignalGenFromCircuit(): void {
    this.signalGen.disconnectFromCircuit();
  }

  isSignalGenActive(): boolean {
    return this.signalGen.isActive();
  }

  clearUartLog(): void {
    this.uartTerminal.clearLog();
  }

  // ---- Voltmeter ----

  setVoltmeterType(type: VoltmeterType): ApiResult<void> {
    this.voltmeter.setType(type);
    return ResultHelper.ok();
  }

  voltmeterMeasure(): ApiResult<number> {
    this.ensureActiveBindingApplied();
    return ResultHelper.ok(this.voltmeter.measure());
  }

  voltmeterMeasureValue(raw: number): ApiResult<number> {
    return ResultHelper.ok(this.voltmeter.measureValue(raw));
  }

  /** High-rate silent sample (sim tick) — fills DC avg / AC RMS buffers */
  voltmeterFeedSample(raw: number): void {
    this.voltmeter.feedSample(raw);
  }

  /** Multimeter silent sample (DCV/CURRENT avg, ACV RMS) */
  multimeterFeedSample(raw: number): void {
    this.multimeter.feedSample(raw);
  }

  multimeterMeasureValue(raw: number): ApiResult<number> {
    return ResultHelper.ok(this.multimeter.measureValue(raw));
  }

  voltmeterAutoRange(): ApiResult<void> {
    this.voltmeter.autoRange();
    return ResultHelper.ok();
  }

  voltmeterSetRange(idx: number): ApiResult<void> {
    this.voltmeter.setRange(idx);
    return ResultHelper.ok();
  }

  getVoltmeterConfig(): ApiResult<VoltmeterConfig> {
    const config: VoltmeterConfig = {
      type: this.voltmeter.getType(),
      range: this.voltmeter.getRange(),
      reading: this.voltmeter.getLastReading(),
      unit: this.voltmeter.getUnit()
    };
    return ResultHelper.ok(config);
  }

  setVoltmeterReader(reader: (() => number) | null): void {
    this.voltmeter.setVoltageReader(reader);
  }

  setVoltmeterGlobalFallback(reader: (() => number) | null): void {
    this.voltmeter.setGlobalFallback(reader);
  }

  // ---- Ammeter ----

  setAmmeterType(type: AmmeterType): ApiResult<void> {
    this.ammeter.setType(type);
    return ResultHelper.ok();
  }

  ammeterMeasure(): ApiResult<number> {
    this.ensureActiveBindingApplied();
    return ResultHelper.ok(this.ammeter.measure());
  }

  ammeterMeasureValue(raw: number): ApiResult<number> {
    return ResultHelper.ok(this.ammeter.measureValue(raw));
  }

  /** High-rate silent sample (sim tick) — fills DC avg / AC RMS buffers */
  ammeterFeedSample(raw: number): void {
    this.ammeter.feedSample(raw);
  }

  ammeterAutoRange(): ApiResult<void> {
    this.ammeter.autoRange();
    return ResultHelper.ok();
  }

  ammeterSetRange(idx: number): ApiResult<void> {
    this.ammeter.setRange(idx);
    return ResultHelper.ok();
  }

  getAmmeterConfig(): ApiResult<AmmeterConfig> {
    const config: AmmeterConfig = {
      type: this.ammeter.getType(),
      range: this.ammeter.getRange(),
      reading: this.ammeter.getLastReading(),
      unit: this.ammeter.getUnit()
    };
    return ResultHelper.ok(config);
  }

  setAmmeterReader(reader: (() => number) | null): void {
    this.ammeter.setCurrentReader(reader);
  }

  setAmmeterGlobalFallback(reader: (() => number) | null): void {
    this.ammeter.setGlobalFallback(reader);
  }

  // ---- Power Meter ----

  setPowerMeterVoltageReader(reader: (() => number) | null): void {
    this.powerMeter.setVoltageReader(reader);
  }

  setPowerMeterCurrentReader(reader: (() => number) | null): void {
    this.powerMeter.setCurrentReader(reader);
  }

  setPowerMeterGlobalFallbacks(voltageReader: (() => number) | null, currentReader: (() => number) | null): void {
    this.powerMeter.setVoltageFallback(voltageReader);
    this.powerMeter.setCurrentFallback(currentReader);
  }

  powerMeterMeasure(): ApiResult<PowerMeterConfig> {
    this.ensureActiveBindingApplied();
    const r = this.powerMeter.measure();
    const config: PowerMeterConfig = {
      voltage: r.voltage,
      current: r.current,
      power: r.power,
      apparentPower: r.apparentPower,
      powerFactor: r.powerFactor,
      frequency: r.frequency
    };
    return ResultHelper.ok(config);
  }

  // ---- Frequency Counter ----

  setFreqCounterReader(reader: (() => number) | null): void {
    this.freqCounter.setFreqReader(reader);
  }

  setFreqCounterGlobalFallback(reader: (() => number) | null): void {
    this.freqCounter.setGlobalFallback(reader);
  }

  freqCounterSetGateTime(seconds: number): ApiResult<void> {
    if (seconds < 0.1 || seconds > 10) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Gate time must be 0.1-10s');
    }
    this.freqCounter.setGateTime(seconds);
    return ResultHelper.ok();
  }

  freqCounterMeasure(): ApiResult<number> {
    this.ensureActiveBindingApplied();
    return ResultHelper.ok(this.freqCounter.measure());
  }

  getFreqCounterConfig(): ApiResult<FrequencyCounterConfig> {
    const config: FrequencyCounterConfig = {
      reading: this.freqCounter.getLastReading(),
      unit: 'Hz',
      gateTime: this.freqCounter.getGateTime(),
      resolution: 0.1
    };
    return ResultHelper.ok(config);
  }

  getInstrumentSnapshot(): InstrumentSnapshotView {
    return {
      oscilloscope: {
        timebase: this.oscilloscope.getTimebase(),
        voltageScales: this.oscilloscope.getVoltageScales(),
        coupling: this.oscilloscope.getCoupling(),
        triggerMode: this.oscilloscope.getTriggerMode(),
        triggerLevel: this.oscilloscope.getTriggerLevel(),
        triggerChannel: this.oscilloscope.getTriggerChannel(),
        captureMode: this.oscilloscope.getCaptureMode(),
        mathOp: this.oscilloscope.getMathOp(),
        fftLogScale: this.oscilloscope.getFftLogScale()
      },
      logicAnalyzer: {
        channelCount: this.logicAnalyzer.getChannelCount(),
        threshold: this.logicAnalyzer.getThreshold(),
        decodeProtocol: this.logicAnalyzer.getDecodeProtocol(),
        baudRate: this.logicAnalyzer.getBaudRate(),
        signalGroups: this.logicAnalyzer.getSignalGroups()
      },
      multimeterMode: this.multimeter.getMode(),
      signalGen: {
        waveform: this.signalGen.getWaveform(),
        frequency: this.signalGen.getFrequency(),
        amplitude: this.signalGen.getAmplitude(),
        offset: this.signalGen.getOffset(),
        dutyCycle: this.signalGen.getDutyCycle(),
        phase: this.signalGen.getPhase(),
        outputImpedance: 50,
        burstEnabled: this.signalGen.getBurstEnabled(),
        burstCount: this.signalGen.getBurstCount()
      },
      uart: this.uartTerminal.getConfig(),
      voltmeter: {
        type: this.voltmeter.getType(),
        range: this.voltmeter.getRange(),
        reading: this.voltmeter.getLastReading(),
        unit: this.voltmeter.getUnit()
      },
      ammeter: {
        type: this.ammeter.getType(),
        range: this.ammeter.getRange(),
        reading: this.ammeter.getLastReading(),
        unit: this.ammeter.getUnit()
      },
      powerMeter: {
        voltage: this.powerMeter.getLastVoltage(),
        current: this.powerMeter.getLastCurrent(),
        power: this.powerMeter.getLastPower(),
        apparentPower: this.powerMeter.getLastPower(),
        powerFactor: this.powerMeter.getLastPowerFactor(),
        frequency: this.powerMeter.getLastFrequency()
      },
      freqCounter: {
        reading: this.freqCounter.getLastReading(),
        unit: 'Hz',
        gateTime: this.freqCounter.getGateTime(),
        resolution: 0.1
      }
    };
  }
}
