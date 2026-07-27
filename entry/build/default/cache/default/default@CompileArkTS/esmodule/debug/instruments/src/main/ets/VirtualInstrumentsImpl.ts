import type { IVirtualInstruments, SignalGroup, SignalGenParams, TimedScriptCommand, InstrumentSnapshotView, ComponentInstrumentBinding, OscAutoScaleView } from './api/IVirtualInstruments';
import { OscilloscopeEngine } from "@bundle:com.elecdraw.aischsim/entry@instruments/ets/engines/OscilloscopeEngine";
import { LogicAnalyzerEngine } from "@bundle:com.elecdraw.aischsim/entry@instruments/ets/engines/LogicAnalyzerEngine";
import { MultimeterEngine } from "@bundle:com.elecdraw.aischsim/entry@instruments/ets/engines/MultimeterEngine";
import { SignalGeneratorEngine } from "@bundle:com.elecdraw.aischsim/entry@instruments/ets/engines/SignalGeneratorEngine";
import type { AnalogEngineSink } from "@bundle:com.elecdraw.aischsim/entry@instruments/ets/engines/SignalGeneratorEngine";
import { UartTerminalEngine } from "@bundle:com.elecdraw.aischsim/entry@instruments/ets/engines/UartTerminalEngine";
import { VoltmeterEngine } from "@bundle:com.elecdraw.aischsim/entry@instruments/ets/engines/VoltmeterEngine";
import { AmmeterEngine } from "@bundle:com.elecdraw.aischsim/entry@instruments/ets/engines/AmmeterEngine";
import { PowerMeterEngine } from "@bundle:com.elecdraw.aischsim/entry@instruments/ets/engines/PowerMeterEngine";
import { FrequencyCounterEngine } from "@bundle:com.elecdraw.aischsim/entry@instruments/ets/engines/FrequencyCounterEngine";
import { ErrCode, ResultHelper, Validate, IdUtil, MathChannelOp, traceActiveComponentChanged, formatBindingSummary, Logger, INSTR_TRACE_TAG, traceUart, formatUartBytesHex } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ApiResult, WaveData, OscTimebase, OscVoltageScale, CouplingMode, TriggerMode, CaptureMode, CursorMeasurement, LogicDecodeProtocol, DecodedFrame, MultimeterMode, SignalWaveform, VoltmeterType, VoltmeterConfig, AmmeterType, AmmeterConfig, PowerMeterConfig, FrequencyCounterConfig, BindingTraceInfo } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import fs from "@ohos:file.fs";
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
    /** Explicit TX/RX same-net loopback (set by AppService on UART bind) */
    private uartLoopback: boolean = false;
    /** 最近一帧仿真波形（µs 级），供电压表/电流表面板画正弦 */
    private lastSimWaves: WaveData[] = [];
    /** Forward terminal TX hex into the simulation kernel USART RX path. */
    setUartTxSink(sink: ((bytes: number[]) => void) | null): void {
        this.uartTxSink = sink;
    }
    /** Enable terminal self-echo when schematic TX and RX share one net. */
    setUartLoopback(enabled: boolean): void {
        if (this.uartLoopback === enabled && this.uartTerminal.isLoopback() === enabled) {
            return;
        }
        this.uartLoopback = enabled;
        this.uartTerminal.setLoopback(enabled);
        traceUart('LOOPBACK', `enabled=${enabled ? 1 : 0}`);
    }
    isUartLoopback(): boolean {
        return this.uartLoopback || this.detectLoopbackFromBindings();
    }
    /** Infer loopback from instrument bindings (TX probe net === RX probe net). */
    private detectLoopbackFromBindings(): boolean {
        let found = false;
        this.componentBindings.forEach((binding: ComponentInstrumentBinding) => {
            if (found) {
                return;
            }
            const id = (binding.libraryId ?? '').toUpperCase();
            if (!id.includes('UART')) {
                return;
            }
            const tx = binding.scopeProbes.length > 0 ? binding.scopeProbes[0] : '';
            const rx = binding.scopeProbes.length > 1 ? binding.scopeProbes[1] : '';
            if (tx.length > 0 && rx.length > 0 && tx === rx) {
                found = true;
            }
        });
        return found;
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
        else {
            let hasScope = false;
            for (let i = 0; i < binding.scopeProbes.length; i++) {
                if (binding.scopeProbes[i].length > 0) {
                    hasScope = true;
                    break;
                }
            }
            if (hasScope) {
                // 新注册的示波器探针即使当前未选中也要立刻生效，供 DisplayPump 采样
                this.applyScopeProbesFromAllBindings();
            }
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
        this.setUartLoopback(false);
        this.clearLegacyReaders();
    }
    private getActiveBinding(): ComponentInstrumentBinding | null {
        if (this.activeCompId === null || this.activeCompId.length === 0) {
            return null;
        }
        return this.componentBindings.get(this.activeCompId) ?? null;
    }
    /** Apply active component's readers; scope probes always merge from ALL bindings. */
    private applyActiveBinding(): void {
        const binding = this.getActiveBinding();
        if (binding === null) {
            Logger.debug(INSTR_TRACE_TAG, 'applyBinding: no active component (meters cleared, scope probes kept)');
            this.multimeter.setReadingReader(null);
            this.voltmeter.setVoltageReader(null);
            this.ammeter.setCurrentReader(null);
            this.powerMeter.setVoltageReader(null);
            this.powerMeter.setCurrentReader(null);
            this.freqCounter.setFreqReader(null);
            // 关键：不要清空示波器探针 — DisplayPump 在无选中时也必须继续采 NET_4
            this.applyScopeProbesFromAllBindings();
            return;
        }
        Logger.debug(INSTR_TRACE_TAG, `applyBinding active=${this.activeCompId} scope=[${binding.scopeProbes.join('|')}] ` +
            `logic=[${binding.logicProbes.join('|')}]`);
        this.multimeter.setReadingReader(binding.voltageReader);
        this.voltmeter.setVoltageReader(binding.voltageReader);
        this.ammeter.setCurrentReader(binding.currentReader);
        this.powerMeter.setVoltageReader(binding.powerVoltageReader);
        this.powerMeter.setCurrentReader(binding.powerCurrentReader);
        this.freqCounter.setFreqReader(binding.freqReader);
        // 示波器探针：合并所有绑定（避免切到电压表时把 CH1 探针清掉）
        this.applyScopeProbesFromAllBindings();
    }
    /**
     * Merge scope probes from OSC/SCOPE bindings only.
     * 电压表/电流表也会把网号塞进 scopeProbes 供自身波形重建，不得污染示波器 CH。
     */
    private applyScopeProbesFromAllBindings(): void {
        const merged: string[] = ['', '', '', ''];
        const isScopeLib = (lib: string): boolean => {
            const u = lib.toUpperCase();
            return u.includes('OSC') || u.includes('SCOPE');
        };
        const active = this.getActiveBinding();
        if (active !== null && isScopeLib(active.libraryId)) {
            for (let ch = 0; ch < 4; ch++) {
                if (ch < active.scopeProbes.length && active.scopeProbes[ch].length > 0) {
                    merged[ch] = active.scopeProbes[ch];
                }
            }
        }
        this.componentBindings.forEach((b: ComponentInstrumentBinding) => {
            if (!isScopeLib(b.libraryId)) {
                return;
            }
            for (let ch = 0; ch < 4; ch++) {
                if (merged[ch].length > 0) {
                    continue;
                }
                if (ch < b.scopeProbes.length && b.scopeProbes[ch].length > 0) {
                    merged[ch] = b.scopeProbes[ch];
                }
            }
        });
        for (let ch = 0; ch < 4; ch++) {
            this.oscilloscope.setChannelProbe(ch, merged[ch]);
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
    clearOscilloscopeCapture(): ApiResult<void> {
        this.oscilloscope.clearCaptureBuffers();
        // Re-assert schematic OSC probes after buffer drop (CH1=SQUARE / CH2=TRIANGLE …)
        this.applyScopeProbesFromAllBindings();
        return ResultHelper.ok();
    }
    autoAdjustOscilloscope(channel: number = 0): ApiResult<OscAutoScaleView> {
        const r = this.oscilloscope.autoAdjustToSignal(channel);
        const view: OscAutoScaleView = {
            changed: r.changed,
            timebase: r.timebase,
            voltageScale: r.voltageScale,
            frequencyHz: r.frequencyHz,
            vpp: r.vpp
        };
        return ResultHelper.ok(view);
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
        // Math FFT：返回频谱而非时域；否则 UI 点 FFT 只改标志、画面无变化
        if (this.oscilloscope.getMathOp() === MathChannelOp.FFT) {
            return ResultHelper.ok(this.oscilloscope.captureFft(channel));
        }
        return ResultHelper.ok(this.oscilloscope.captureWave(channel));
    }
    async exportWaveformSvg(channel: number, path: string): Promise<ApiResult<void>> {
        const pathErr = Validate.filePath(path);
        if (pathErr !== null)
            return ResultHelper.fail(pathErr);
        if (channel < 0 || channel > 3) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Channel must be 0-3');
        }
        try {
            const svg = this.oscilloscope.exportSvg(channel);
            const file = fs.openSync(path, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
            fs.writeSync(file.fd, svg);
            fs.closeSync(file);
            return ResultHelper.ok();
        }
        catch (e) {
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
    getMultimeterMode(): MultimeterMode {
        return this.multimeter.getMode();
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
        const loopback = this.isUartLoopback();
        // Keep engine flag in sync (bindings may appear after first send)
        this.uartTerminal.setLoopback(loopback);
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
        if (loopback) {
            traceUart('TERM_TX_LOOPBACK', `hex=${cleaned} n=${bytes.length} bytes=[${formatUartBytesHex(bytes)}] (TX↔RX same net)`);
            // Echo already applied inside uartTerminal.hexSend — do not inject MCU
            return ResultHelper.ok();
        }
        const sinkOk = this.uartTxSink !== null;
        traceUart('TERM_TX', `hex=${cleaned} n=${bytes.length} bytes=[${formatUartBytesHex(bytes)}] sink=${sinkOk ? 'yes' : 'NO'}`);
        if (this.uartTxSink !== null) {
            this.uartTxSink(bytes);
        }
        else {
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
        if (pathErr !== null)
            return ResultHelper.fail(pathErr);
        try {
            const log = this.uartTerminal.getLog();
            const file = fs.openSync(path, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
            fs.writeSync(file.fd, log);
            fs.closeSync(file);
            return ResultHelper.ok();
        }
        catch (e) {
            return ResultHelper.fail(ErrCode.ERR_PERMISSION, `Failed to export log: ${e}`);
        }
    }
    getUartLog(): string {
        return this.uartTerminal.getLog();
    }
    feedSimulationWaves(waves: WaveData[]): ApiResult<void> {
        this.lastSimWaves = waves;
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
        // 每次喂数前恢复示波器探针（防止 active=null / 电压表抢绑清空 CH）
        this.applyScopeProbesFromAllBindings();
        this.oscilloscope.feedTimeSnapshot(time, voltages);
    }
    /** Rewrite scope history probe voltages after interactive DC edits (pot/switch). */
    snapScopeDcLevels(voltages: Map<string, number>): void {
        this.oscilloscope.snapDcProbeLevels(voltages);
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
    /** Instant DC reading after interactive circuit edits (clears avg lag) */
    voltmeterSnapReading(raw: number): number {
        return this.voltmeter.snapReading(raw);
    }
    /** Multimeter silent sample (DCV/CURRENT avg, ACV RMS) */
    multimeterFeedSample(raw: number): void {
        this.multimeter.feedSample(raw);
    }
    /** Instant multimeter reading after interactive pot / switch edits */
    multimeterSnapReading(raw: number): number {
        return this.multimeter.snapReading(raw);
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
    getVoltmeterWave(): ApiResult<WaveData> {
        const rebuilt = this.buildVoltmeterSimWave();
        if (rebuilt !== null) {
            return ResultHelper.ok(rebuilt);
        }
        return ResultHelper.ok(this.voltmeter.getWaveform());
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
    /** Instant ammeter reading after interactive pot / switch edits */
    ammeterSnapReading(raw: number): number {
        return this.ammeter.snapReading(raw);
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
    getAmmeterWave(): ApiResult<WaveData> {
        const rebuilt = this.buildAmmeterSimWave();
        if (rebuilt !== null) {
            return ResultHelper.ok(rebuilt);
        }
        return ResultHelper.ok(this.ammeter.getWaveform());
    }
    /**
     * 电压表面板波形：用仿真网电压差（µs 采样）重建，避免 UI 低频抽点把 1kHz 正弦混叠成锯齿。
     */
    private buildVoltmeterSimWave(): WaveData | null {
        const binding = this.findMeterBinding('VOLTMETER');
        if (binding === null) {
            return null;
        }
        const plusId = binding.scopeProbes[0] ?? '';
        const comId = binding.scopeProbes[1] ?? '';
        if (plusId.length === 0 || comId.length === 0 || this.lastSimWaves.length === 0) {
            return null;
        }
        const wPlus = this.findWaveForNet(plusId);
        const wCom = this.findWaveForNet(comId);
        if (wPlus === null || wCom === null) {
            return null;
        }
        const n = Math.min(wPlus.timeAxis.length, wPlus.voltageAxis.length, wCom.timeAxis.length, wCom.voltageAxis.length);
        if (n < 8) {
            return null;
        }
        const timeAxis: number[] = [];
        const voltageAxis: number[] = [];
        for (let i = 0; i < n; i++) {
            timeAxis.push(wPlus.timeAxis[i]);
            voltageAxis.push(wPlus.voltageAxis[i] - wCom.voltageAxis[i]);
        }
        const span = Math.max(timeAxis[n - 1] - timeAxis[0], 1e-9);
        Logger.info(INSTR_TRACE_TAG, `[METER_WAVE] VM sim-rebuild n=${n} span=${(span * 1e3).toFixed(2)}ms ` +
            `V+=${plusId.slice(-8)} COM=${comId.slice(-8)} ` +
            `lastΔ=${voltageAxis[n - 1].toFixed(3)}V (not UI-aliased ring)`);
        return {
            waveId: IdUtil.generate('vmw'),
            probeName: 'VM',
            netName: 'VOLTMETER',
            timeAxis: timeAxis,
            voltageAxis: voltageAxis,
            currentAxis: new Array(n).fill(0),
            sampleRate: (n - 1) / span,
            waveType: 'voltage',
            holdTime: span
        };
    }
    /**
     * 电流表面板波形：用内核 I(compUuid) 支路电流时域（mA），与信号源同采样率。
     */
    private buildAmmeterSimWave(): WaveData | null {
        const binding = this.findMeterBinding('AMMETER');
        if (binding === null || this.lastSimWaves.length === 0) {
            return null;
        }
        const compId = binding.scopeProbes[2] ?? this.activeCompId ?? '';
        if (compId.length === 0) {
            return null;
        }
        const key = `I(${compId})`;
        let w: WaveData | null = null;
        for (let i = 0; i < this.lastSimWaves.length; i++) {
            const cand = this.lastSimWaves[i];
            if (cand.probeName === key || cand.netName === key) {
                w = cand;
                break;
            }
        }
        if (w === null || w.voltageAxis.length < 8) {
            return null;
        }
        const n = Math.min(w.timeAxis.length, w.voltageAxis.length);
        const timeAxis = w.timeAxis.slice(0, n);
        const voltageAxis = w.voltageAxis.slice(0, n);
        const span = Math.max(timeAxis[n - 1] - timeAxis[0], 1e-9);
        Logger.info(INSTR_TRACE_TAG, `[METER_WAVE] AM sim-rebuild n=${n} span=${(span * 1e3).toFixed(2)}ms ` +
            `key=${key.slice(-20)} lastI=${voltageAxis[n - 1].toFixed(3)}mA (not UI-aliased ring)`);
        return {
            waveId: IdUtil.generate('amw'),
            probeName: 'AM',
            netName: 'AMMETER',
            timeAxis: timeAxis,
            voltageAxis: voltageAxis,
            currentAxis: voltageAxis.slice(),
            sampleRate: (n - 1) / span,
            waveType: 'current',
            holdTime: span
        };
    }
    private findMeterBinding(libToken: string): ComponentInstrumentBinding | null {
        if (this.activeCompId !== null && this.activeCompId.length > 0) {
            const active = this.componentBindings.get(this.activeCompId);
            if (active !== undefined && active.libraryId.toUpperCase().includes(libToken)) {
                return active;
            }
        }
        let found: ComponentInstrumentBinding | null = null;
        this.componentBindings.forEach((b: ComponentInstrumentBinding) => {
            if (found !== null) {
                return;
            }
            if (b.libraryId.toUpperCase().includes(libToken)) {
                found = b;
            }
        });
        return found;
    }
    private findWaveForNet(netId: string): WaveData | null {
        if (netId.length === 0) {
            return null;
        }
        for (let i = 0; i < this.lastSimWaves.length; i++) {
            const w = this.lastSimWaves[i];
            if (w.probeName === netId || w.netName === netId) {
                return w;
            }
        }
        // 后缀 / 名称别名匹配（NET_1 ↔ net_topo_sig_1）
        for (let i = 0; i < this.lastSimWaves.length; i++) {
            const w = this.lastSimWaves[i];
            if (w.probeName.indexOf(netId) >= 0 || w.netName.indexOf(netId) >= 0 ||
                netId.indexOf(w.probeName) >= 0 || netId.indexOf(w.netName) >= 0) {
                if (w.voltageAxis.length >= 8) {
                    return w;
                }
            }
        }
        return null;
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
    /** Instant power reading after interactive pot / switch (no EMA lag). */
    powerMeterSnapReading(vRaw: number, iRaw: number): PowerMeterConfig {
        const r = this.powerMeter.snapReading(vRaw, iRaw);
        const config: PowerMeterConfig = {
            voltage: r.voltage,
            current: r.current,
            power: r.power,
            apparentPower: r.apparentPower,
            powerFactor: r.powerFactor,
            frequency: r.frequency
        };
        return config;
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
    freqCounterFeedSignalSample(volts: number): void {
        this.freqCounter.feedSignalSample(volts);
    }
    getFreqCounterWave(): ApiResult<WaveData> {
        // 优先示波器探针缓存（仿真 µs 级波形更真实）；否则用喂入的信号环缓冲
        const probes = this.getActiveScopeProbes();
        if (probes.length > 0 && probes[0].length > 0) {
            const captured = this.oscilloscope.captureProbe(probes[0]);
            if (captured !== null && captured.voltageAxis.length > 1) {
                return ResultHelper.ok(captured);
            }
        }
        return ResultHelper.ok(this.freqCounter.getWaveform());
    }
    /** Active binding CH1 probe names (empty if none). */
    private getActiveScopeProbes(): string[] {
        const activeId = this.getActiveInstrumentComponent();
        if (activeId === null || activeId.length === 0) {
            return [];
        }
        const binding = this.componentBindings.get(activeId);
        if (binding === undefined) {
            return [];
        }
        return binding.scopeProbes.slice();
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
