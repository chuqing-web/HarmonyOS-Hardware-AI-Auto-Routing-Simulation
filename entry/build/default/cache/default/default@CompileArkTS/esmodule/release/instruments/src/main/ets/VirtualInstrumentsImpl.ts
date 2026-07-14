import type { IVirtualInstruments, SignalGroup, SignalGenParams, TimedScriptCommand, InstrumentSnapshotView, ComponentInstrumentBinding } from './api/IVirtualInstruments';
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
import { ErrCode, ResultHelper, Validate, traceActiveComponentChanged, formatBindingSummary, Logger, INSTR_TRACE_TAG } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ApiResult, WaveData, OscTimebase, OscVoltageScale, CouplingMode, TriggerMode, CaptureMode, MathChannelOp, CursorMeasurement, LogicDecodeProtocol, DecodedFrame, MultimeterMode, SignalWaveform, VoltmeterType, VoltmeterConfig, AmmeterType, AmmeterConfig, PowerMeterConfig, FrequencyCounterConfig, BindingTraceInfo } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
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
    registerComponentBinding(q398: string, r398: ComponentInstrumentBinding): void {
        this.componentBindings.set(q398, r398);
        const s398: BindingTraceInfo = {
            libraryId: r398.libraryId,
            scopeProbes: r398.scopeProbes.slice(),
            logicProbes: r398.logicProbes.slice(),
            hasVoltageReader: r398.voltageReader !== null,
            hasCurrentReader: r398.currentReader !== null,
            hasPowerVoltageReader: r398.powerVoltageReader !== null,
            hasPowerCurrentReader: r398.powerCurrentReader !== null,
            hasFreqReader: r398.freqReader !== null
        };
        Logger.debug(INSTR_TRACE_TAG, `registerBinding comp=${q398} ${formatBindingSummary(s398)}`);
        if (q398 === this.activeCompId) {
            this.applyActiveBinding();
        }
    }
    setActiveInstrumentComponent(o398: string | null): void {
        const p398 = o398 !== this.activeCompId;
        this.activeCompId = o398;
        if (p398) {
            traceActiveComponentChanged(o398, 'VirtualInstrumentsImpl.setActive');
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
    private applyActiveBinding(): void {
        const l398 = this.getActiveBinding();
        if (l398 === null) {
            Logger.debug(INSTR_TRACE_TAG, 'applyBinding: cleared (no active component)');
            this.clearLegacyReaders();
            return;
        }
        Logger.debug(INSTR_TRACE_TAG, `applyBinding active=${this.activeCompId} scope=[${l398.scopeProbes.join('|')}] ` +
            `logic=[${l398.logicProbes.join('|')}]`);
        this.multimeter.setReadingReader(l398.voltageReader);
        this.voltmeter.setVoltageReader(l398.voltageReader);
        this.ammeter.setCurrentReader(l398.currentReader);
        this.powerMeter.setVoltageReader(l398.powerVoltageReader);
        this.powerMeter.setCurrentReader(l398.powerCurrentReader);
        this.freqCounter.setFreqReader(l398.freqReader);
        for (let m398 = 0; m398 < 4; m398++) {
            const n398 = m398 < l398.scopeProbes.length ? l398.scopeProbes[m398] : '';
            this.oscilloscope.setChannelProbe(m398, n398);
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
    setTimebase(k398: OscTimebase): ApiResult<void> {
        this.oscilloscope.setTimebase(k398);
        return ResultHelper.ok();
    }
    setVoltageScale(i398: number, j398: OscVoltageScale): ApiResult<void> {
        if (i398 < 0 || i398 > 3) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Channel must be 0-3');
        }
        this.oscilloscope.setVoltageScale(i398, j398);
        return ResultHelper.ok();
    }
    setCoupling(g398: number, h398: CouplingMode): ApiResult<void> {
        if (g398 < 0 || g398 > 3) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Channel must be 0-3');
        }
        this.oscilloscope.setCoupling(g398, h398);
        return ResultHelper.ok();
    }
    setTrigger(d398: TriggerMode, e398: number, f398: number): ApiResult<void> {
        if (f398 < 0 || f398 > 3) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Channel must be 0-3');
        }
        this.oscilloscope.setTrigger(d398, e398, f398);
        return ResultHelper.ok();
    }
    measureCursors(b398: number, c398: number): ApiResult<CursorMeasurement> {
        if (b398 < 0 || c398 < 0) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Cursor indices must be non-negative');
        }
        return ResultHelper.ok(this.oscilloscope.measureCursors(b398, c398));
    }
    setCaptureMode(a398: CaptureMode): ApiResult<void> {
        this.oscilloscope.setCaptureMode(a398);
        return ResultHelper.ok();
    }
    setMathChannel(y397: MathChannelOp, z397: boolean = false): ApiResult<void> {
        this.oscilloscope.setMathChannel(y397, z397);
        return ResultHelper.ok();
    }
    getOscilloscopeWave(x397: number = 0): ApiResult<WaveData> {
        if (x397 < 0 || x397 > 3) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Channel must be 0-3');
        }
        this.ensureActiveBindingApplied();
        return ResultHelper.ok(this.oscilloscope.captureWave(x397));
    }
    async exportWaveformSvg(r397: number, s397: string): Promise<ApiResult<void>> {
        const t397 = Validate.filePath(s397);
        if (t397 !== null)
            return ResultHelper.fail(t397);
        if (r397 < 0 || r397 > 3) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Channel must be 0-3');
        }
        try {
            const v397 = this.oscilloscope.exportSvg(r397);
            const w397 = fs.openSync(s397, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
            fs.writeSync(w397.fd, v397);
            fs.closeSync(w397);
            return ResultHelper.ok();
        }
        catch (u397) {
            return ResultHelper.fail(ErrCode.ERR_PERMISSION, `Failed to export SVG: ${u397}`);
        }
    }
    setChannels(q397: number): ApiResult<void> {
        if (q397 < 1 || q397 > 32) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Channel count must be 1-32');
        }
        this.logicAnalyzer.setChannels(q397);
        return ResultHelper.ok();
    }
    setThreshold(p397: number): ApiResult<void> {
        if (p397 < 0 || p397 > 5000) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Threshold must be 0-5000 mV');
        }
        this.logicAnalyzer.setThreshold(p397);
        return ResultHelper.ok();
    }
    decodeBus(n397: LogicDecodeProtocol, o397: number = 115200): ApiResult<void> {
        if (o397 <= 0) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Baud rate must be positive');
        }
        this.logicAnalyzer.decodeBus(n397, o397);
        return ResultHelper.ok();
    }
    groupSignals(m397: SignalGroup[]): ApiResult<void> {
        this.logicAnalyzer.groupSignals(m397);
        return ResultHelper.ok();
    }
    getDecodedFrames(): DecodedFrame[] {
        return this.logicAnalyzer.getDecodedFrames();
    }
    getLogicWaveData(): ApiResult<WaveData[]> {
        this.ensureActiveBindingApplied();
        const l397 = this.getActiveBinding();
        if (l397 !== null && l397.logicProbes.length > 0) {
            return ResultHelper.ok(this.logicAnalyzer.captureChannelsForProbes(l397.logicProbes));
        }
        return ResultHelper.ok(this.logicAnalyzer.captureAllChannels());
    }
    setMode(k397: MultimeterMode): ApiResult<void> {
        this.multimeter.setMode(k397);
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
    setMultimeterReader(j397: (() => number) | null): void {
        this.multimeter.setReadingReader(j397);
    }
    setMultimeterGlobalFallback(i397: (() => number) | null): void {
        this.multimeter.setGlobalFallback(i397);
    }
    setWaveform(h397: SignalWaveform): ApiResult<void> {
        this.signalGen.setWaveform(h397);
        return ResultHelper.ok();
    }
    setParams(g397: SignalGenParams): ApiResult<void> {
        if (g397.frequency <= 0) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Frequency must be positive');
        }
        this.signalGen.setParams(g397);
        return ResultHelper.ok();
    }
    setBurstMode(e397: boolean, f397: number = 5): ApiResult<void> {
        if (e397 && f397 < 1) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Burst count must be at least 1');
        }
        this.signalGen.setBurstMode(e397, f397);
        return ResultHelper.ok();
    }
    getSignalGenWave(): ApiResult<WaveData> {
        return ResultHelper.ok(this.signalGen.generateWave());
    }
    uartHexSend(d397: string): ApiResult<void> {
        if (!d397 || d397.trim().length === 0) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Hex string is empty');
        }
        this.uartTerminal.hexSend(d397);
        return ResultHelper.ok();
    }
    uartHexReceive(): ApiResult<string> {
        return ResultHelper.ok(this.uartTerminal.hexReceive());
    }
    setUartAutoNewline(c397: boolean): void {
        this.uartTerminal.setAutoNewline(c397);
    }
    runTimedScript(b397: TimedScriptCommand[]): ApiResult<void> {
        if (!b397 || b397.length === 0) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Script has no commands');
        }
        this.uartTerminal.runTimedScript(b397);
        return ResultHelper.ok();
    }
    async exportUartLog(w396: string): Promise<ApiResult<void>> {
        const x396 = Validate.filePath(w396);
        if (x396 !== null)
            return ResultHelper.fail(x396);
        try {
            const z396 = this.uartTerminal.getLog();
            const a397 = fs.openSync(w396, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
            fs.writeSync(a397.fd, z396);
            fs.closeSync(a397);
            return ResultHelper.ok();
        }
        catch (y396) {
            return ResultHelper.fail(ErrCode.ERR_PERMISSION, `Failed to export log: ${y396}`);
        }
    }
    getUartLog(): string {
        return this.uartTerminal.getLog();
    }
    feedSimulationWaves(v396: WaveData[]): ApiResult<void> {
        this.oscilloscope.feedSimulationWaves(v396);
        this.logicAnalyzer.feedSimulationWaves(v396);
        return ResultHelper.ok();
    }
    feedScopeNodeData(t396: Map<string, number>, u396: Map<string, number>): void {
        this.oscilloscope.feedNodeVoltages(t396);
        this.oscilloscope.feedBranchCurrents(u396);
    }
    feedScopeTimeSnapshot(r396: number, s396: Map<string, number>): void {
        this.oscilloscope.feedTimeSnapshot(r396, s396);
    }
    feedLogicDigitalStates(q396: Map<string, number>): void {
        this.logicAnalyzer.feedDigitalStates(q396);
    }
    autoAssignScopeProbes(): void {
        this.oscilloscope.autoAssignProbes();
    }
    connectSignalGenToCircuit(n396: AnalogEngineSink, o396: string, p396: string): void {
        this.signalGen.connectToCircuit(n396, o396, p396);
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
    setVoltmeterType(m396: VoltmeterType): ApiResult<void> {
        this.voltmeter.setType(m396);
        return ResultHelper.ok();
    }
    voltmeterMeasure(): ApiResult<number> {
        this.ensureActiveBindingApplied();
        return ResultHelper.ok(this.voltmeter.measure());
    }
    voltmeterAutoRange(): ApiResult<void> {
        this.voltmeter.autoRange();
        return ResultHelper.ok();
    }
    voltmeterSetRange(l396: number): ApiResult<void> {
        this.voltmeter.setRange(l396);
        return ResultHelper.ok();
    }
    getVoltmeterConfig(): ApiResult<VoltmeterConfig> {
        const k396: VoltmeterConfig = {
            type: this.voltmeter.getType(),
            range: this.voltmeter.getRange(),
            reading: this.voltmeter.getLastReading(),
            unit: this.voltmeter.getUnit()
        };
        return ResultHelper.ok(k396);
    }
    setVoltmeterReader(j396: (() => number) | null): void {
        this.voltmeter.setVoltageReader(j396);
    }
    setVoltmeterGlobalFallback(i396: (() => number) | null): void {
        this.voltmeter.setGlobalFallback(i396);
    }
    setAmmeterType(h396: AmmeterType): ApiResult<void> {
        this.ammeter.setType(h396);
        return ResultHelper.ok();
    }
    ammeterMeasure(): ApiResult<number> {
        this.ensureActiveBindingApplied();
        return ResultHelper.ok(this.ammeter.measure());
    }
    ammeterAutoRange(): ApiResult<void> {
        this.ammeter.autoRange();
        return ResultHelper.ok();
    }
    ammeterSetRange(g396: number): ApiResult<void> {
        this.ammeter.setRange(g396);
        return ResultHelper.ok();
    }
    getAmmeterConfig(): ApiResult<AmmeterConfig> {
        const f396: AmmeterConfig = {
            type: this.ammeter.getType(),
            range: this.ammeter.getRange(),
            reading: this.ammeter.getLastReading(),
            unit: this.ammeter.getUnit()
        };
        return ResultHelper.ok(f396);
    }
    setAmmeterReader(e396: (() => number) | null): void {
        this.ammeter.setCurrentReader(e396);
    }
    setAmmeterGlobalFallback(d396: (() => number) | null): void {
        this.ammeter.setGlobalFallback(d396);
    }
    setPowerMeterVoltageReader(c396: (() => number) | null): void {
        this.powerMeter.setVoltageReader(c396);
    }
    setPowerMeterCurrentReader(b396: (() => number) | null): void {
        this.powerMeter.setCurrentReader(b396);
    }
    setPowerMeterGlobalFallbacks(z395: (() => number) | null, a396: (() => number) | null): void {
        this.powerMeter.setVoltageFallback(z395);
        this.powerMeter.setCurrentFallback(a396);
    }
    powerMeterMeasure(): ApiResult<PowerMeterConfig> {
        this.ensureActiveBindingApplied();
        const x395 = this.powerMeter.measure();
        const y395: PowerMeterConfig = {
            voltage: x395.voltage,
            current: x395.current,
            power: x395.power,
            apparentPower: x395.apparentPower,
            powerFactor: x395.powerFactor,
            frequency: x395.frequency
        };
        return ResultHelper.ok(y395);
    }
    setFreqCounterReader(w395: (() => number) | null): void {
        this.freqCounter.setFreqReader(w395);
    }
    setFreqCounterGlobalFallback(v395: (() => number) | null): void {
        this.freqCounter.setGlobalFallback(v395);
    }
    freqCounterSetGateTime(u395: number): ApiResult<void> {
        if (u395 < 0.1 || u395 > 10) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Gate time must be 0.1-10s');
        }
        this.freqCounter.setGateTime(u395);
        return ResultHelper.ok();
    }
    freqCounterMeasure(): ApiResult<number> {
        this.ensureActiveBindingApplied();
        return ResultHelper.ok(this.freqCounter.measure());
    }
    getFreqCounterConfig(): ApiResult<FrequencyCounterConfig> {
        const t395: FrequencyCounterConfig = {
            reading: this.freqCounter.getLastReading(),
            unit: 'Hz',
            gateTime: this.freqCounter.getGateTime(),
            resolution: 0.1
        };
        return ResultHelper.ok(t395);
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
