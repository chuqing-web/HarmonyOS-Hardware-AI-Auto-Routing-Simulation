if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface InstrumentPanel_Params {
    selectedComponentId?: string;
    simWaveTick?: number;
    statusMessage?: string;
    subTab?: number;
    selectionRefDes?: string;
    selectionLibraryId?: string;
    timebaseIdx?: number;
    voltageScaleIdx?: number;
    triggerLevel?: number;
    logicChannels?: number;
    threshold?: number;
    mmReading?: string;
    mmMode?: string;
    freq?: string;
    uartHex?: string;
    uartLog?: string;
    waveTimeData?: number[];
    waveVoltageData?: number[];
    waveCh2Data?: number[];
    cursorAIdx?: number;
    cursorBIdx?: number;
    cursorMeasureText?: string;
    decodedFramesText?: string;
    logicChannelData?: number[][];
    logicSampleCount?: number;
    vmType?: number;
    vmReading?: string;
    vmRange?: string;
    vmUnit?: string;
    amType?: number;
    amReading?: string;
    amRange?: string;
    amUnit?: string;
    pmVoltage?: string;
    pmCurrent?: string;
    pmPower?: string;
    pmPF?: string;
    fcReading?: string;
    fcGateTime?: number;
    appService?: AppService;
    timebases?: OscTimebase[];
    timebaseLabels?: string[];
    selTimebase?: SelectValueOption[];
    selVScale?: SelectValueOption[];
    selLogicCh?: SelectValueOption[];
    autoRefreshTimer?: number;
    uiLogTick?: number;
    subTabLabels?: string[];
}
import { AppService } from "@bundle:com.elecdraw.aischsim/entry/ets/services/AppService";
import { OscTimebase, CouplingMode, MathChannelOp, MultimeterMode, SignalWaveform, LogicDecodeProtocol, VoltmeterType, AmmeterType, traceUiRefresh, traceUiSelect, detectInstrumentKind, instrumentSubTabForKind } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { ProteusClassicBtn, ProteusChipGrid } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import { ProteusColors, ProteusDimens, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import { OscilloscopeWaveCanvas } from "@bundle:com.elecdraw.aischsim/entry/ets/components/OscilloscopeWaveCanvas";
import { LogicAnalyzerWaveCanvas } from "@bundle:com.elecdraw.aischsim/entry/ets/components/LogicAnalyzerWaveCanvas";
interface SelectValueOption {
    value: string;
}
export class InstrumentPanel extends ViewPU {
    constructor(v93, w93, x93, y93 = -1, z93 = undefined, a94) {
        super(v93, x93, y93, a94);
        if (typeof z93 === "function") {
            this.paramsGenerator_ = z93;
        }
        this.__selectedComponentId = new SynchedPropertySimpleOneWayPU(w93.selectedComponentId, this, "selectedComponentId");
        this.__simWaveTick = new SynchedPropertySimpleOneWayPU(w93.simWaveTick, this, "simWaveTick");
        this.__statusMessage = new SynchedPropertySimpleTwoWayPU(w93.statusMessage, this, "statusMessage");
        this.__subTab = new ObservedPropertySimplePU(0, this, "subTab");
        this.__selectionRefDes = new ObservedPropertySimplePU('', this, "selectionRefDes");
        this.__selectionLibraryId = new ObservedPropertySimplePU('', this, "selectionLibraryId");
        this.__timebaseIdx = new ObservedPropertySimplePU(2, this, "timebaseIdx");
        this.__voltageScaleIdx = new ObservedPropertySimplePU(3, this, "voltageScaleIdx");
        this.__triggerLevel = new ObservedPropertySimplePU(1.0, this, "triggerLevel");
        this.__logicChannels = new ObservedPropertySimplePU(8, this, "logicChannels");
        this.__threshold = new ObservedPropertySimplePU(1500, this, "threshold");
        this.__mmReading = new ObservedPropertySimplePU('----', this, "mmReading");
        this.__mmMode = new ObservedPropertySimplePU('DCV', this, "mmMode");
        this.__freq = new ObservedPropertySimplePU('1kHz', this, "freq");
        this.__uartHex = new ObservedPropertySimplePU('55 AA', this, "uartHex");
        this.__uartLog = new ObservedPropertySimplePU('', this, "uartLog");
        this.__waveTimeData = new ObservedPropertyObjectPU([], this, "waveTimeData");
        this.__waveVoltageData = new ObservedPropertyObjectPU([], this, "waveVoltageData");
        this.__waveCh2Data = new ObservedPropertyObjectPU([], this, "waveCh2Data");
        this.__cursorAIdx = new ObservedPropertySimplePU(100, this, "cursorAIdx");
        this.__cursorBIdx = new ObservedPropertySimplePU(200, this, "cursorBIdx");
        this.__cursorMeasureText = new ObservedPropertySimplePU('', this, "cursorMeasureText");
        this.__decodedFramesText = new ObservedPropertySimplePU('', this, "decodedFramesText");
        this.__logicChannelData = new ObservedPropertyObjectPU([], this, "logicChannelData");
        this.__logicSampleCount = new ObservedPropertySimplePU(128, this, "logicSampleCount");
        this.__vmType = new ObservedPropertySimplePU(0, this, "vmType");
        this.__vmReading = new ObservedPropertySimplePU('--.--', this, "vmReading");
        this.__vmRange = new ObservedPropertySimplePU('20V', this, "vmRange");
        this.__vmUnit = new ObservedPropertySimplePU('V DC', this, "vmUnit");
        this.__amType = new ObservedPropertySimplePU(0, this, "amType");
        this.__amReading = new ObservedPropertySimplePU('--.--', this, "amReading");
        this.__amRange = new ObservedPropertySimplePU('200mA', this, "amRange");
        this.__amUnit = new ObservedPropertySimplePU('mA DC', this, "amUnit");
        this.__pmVoltage = new ObservedPropertySimplePU('--', this, "pmVoltage");
        this.__pmCurrent = new ObservedPropertySimplePU('--', this, "pmCurrent");
        this.__pmPower = new ObservedPropertySimplePU('--', this, "pmPower");
        this.__pmPF = new ObservedPropertySimplePU('--', this, "pmPF");
        this.__fcReading = new ObservedPropertySimplePU('----', this, "fcReading");
        this.__fcGateTime = new ObservedPropertySimplePU(1.0, this, "fcGateTime");
        this.appService = AppService.getInstance();
        this.timebases = [
            OscTimebase.NS_10, OscTimebase.US_1, OscTimebase.MS_1, OscTimebase.S_1, OscTimebase.S_10
        ];
        this.timebaseLabels = ['10ns', '1us', '1ms', '1s', '10s'];
        this.selTimebase = [
            { value: '10ns' }, { value: '1us' }, { value: '1ms' }, { value: '1s' }, { value: '10s' }
        ];
        this.selVScale = [
            { value: '1mV' }, { value: '10mV' }, { value: '100mV' },
            { value: '1V' }, { value: '10V' }, { value: '100V' }
        ];
        this.selLogicCh = [
            { value: '8' }, { value: '16' }, { value: '32' }
        ];
        this.autoRefreshTimer = -1;
        this.uiLogTick = 0;
        this.subTabLabels = ['示波', '逻辑', '万用', '信号', '串口', '电压', '电流', '功率', '频率'];
        this.setInitiallyProvidedValue(w93);
        this.declareWatch("selectedComponentId", this.onSelectionChange);
        this.declareWatch("simWaveTick", this.onSimWaveTick);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(u93: InstrumentPanel_Params) {
        if (u93.selectedComponentId === undefined) {
            this.__selectedComponentId.set('');
        }
        if (u93.simWaveTick === undefined) {
            this.__simWaveTick.set(0);
        }
        if (u93.subTab !== undefined) {
            this.subTab = u93.subTab;
        }
        if (u93.selectionRefDes !== undefined) {
            this.selectionRefDes = u93.selectionRefDes;
        }
        if (u93.selectionLibraryId !== undefined) {
            this.selectionLibraryId = u93.selectionLibraryId;
        }
        if (u93.timebaseIdx !== undefined) {
            this.timebaseIdx = u93.timebaseIdx;
        }
        if (u93.voltageScaleIdx !== undefined) {
            this.voltageScaleIdx = u93.voltageScaleIdx;
        }
        if (u93.triggerLevel !== undefined) {
            this.triggerLevel = u93.triggerLevel;
        }
        if (u93.logicChannels !== undefined) {
            this.logicChannels = u93.logicChannels;
        }
        if (u93.threshold !== undefined) {
            this.threshold = u93.threshold;
        }
        if (u93.mmReading !== undefined) {
            this.mmReading = u93.mmReading;
        }
        if (u93.mmMode !== undefined) {
            this.mmMode = u93.mmMode;
        }
        if (u93.freq !== undefined) {
            this.freq = u93.freq;
        }
        if (u93.uartHex !== undefined) {
            this.uartHex = u93.uartHex;
        }
        if (u93.uartLog !== undefined) {
            this.uartLog = u93.uartLog;
        }
        if (u93.waveTimeData !== undefined) {
            this.waveTimeData = u93.waveTimeData;
        }
        if (u93.waveVoltageData !== undefined) {
            this.waveVoltageData = u93.waveVoltageData;
        }
        if (u93.waveCh2Data !== undefined) {
            this.waveCh2Data = u93.waveCh2Data;
        }
        if (u93.cursorAIdx !== undefined) {
            this.cursorAIdx = u93.cursorAIdx;
        }
        if (u93.cursorBIdx !== undefined) {
            this.cursorBIdx = u93.cursorBIdx;
        }
        if (u93.cursorMeasureText !== undefined) {
            this.cursorMeasureText = u93.cursorMeasureText;
        }
        if (u93.decodedFramesText !== undefined) {
            this.decodedFramesText = u93.decodedFramesText;
        }
        if (u93.logicChannelData !== undefined) {
            this.logicChannelData = u93.logicChannelData;
        }
        if (u93.logicSampleCount !== undefined) {
            this.logicSampleCount = u93.logicSampleCount;
        }
        if (u93.vmType !== undefined) {
            this.vmType = u93.vmType;
        }
        if (u93.vmReading !== undefined) {
            this.vmReading = u93.vmReading;
        }
        if (u93.vmRange !== undefined) {
            this.vmRange = u93.vmRange;
        }
        if (u93.vmUnit !== undefined) {
            this.vmUnit = u93.vmUnit;
        }
        if (u93.amType !== undefined) {
            this.amType = u93.amType;
        }
        if (u93.amReading !== undefined) {
            this.amReading = u93.amReading;
        }
        if (u93.amRange !== undefined) {
            this.amRange = u93.amRange;
        }
        if (u93.amUnit !== undefined) {
            this.amUnit = u93.amUnit;
        }
        if (u93.pmVoltage !== undefined) {
            this.pmVoltage = u93.pmVoltage;
        }
        if (u93.pmCurrent !== undefined) {
            this.pmCurrent = u93.pmCurrent;
        }
        if (u93.pmPower !== undefined) {
            this.pmPower = u93.pmPower;
        }
        if (u93.pmPF !== undefined) {
            this.pmPF = u93.pmPF;
        }
        if (u93.fcReading !== undefined) {
            this.fcReading = u93.fcReading;
        }
        if (u93.fcGateTime !== undefined) {
            this.fcGateTime = u93.fcGateTime;
        }
        if (u93.appService !== undefined) {
            this.appService = u93.appService;
        }
        if (u93.timebases !== undefined) {
            this.timebases = u93.timebases;
        }
        if (u93.timebaseLabels !== undefined) {
            this.timebaseLabels = u93.timebaseLabels;
        }
        if (u93.selTimebase !== undefined) {
            this.selTimebase = u93.selTimebase;
        }
        if (u93.selVScale !== undefined) {
            this.selVScale = u93.selVScale;
        }
        if (u93.selLogicCh !== undefined) {
            this.selLogicCh = u93.selLogicCh;
        }
        if (u93.autoRefreshTimer !== undefined) {
            this.autoRefreshTimer = u93.autoRefreshTimer;
        }
        if (u93.uiLogTick !== undefined) {
            this.uiLogTick = u93.uiLogTick;
        }
        if (u93.subTabLabels !== undefined) {
            this.subTabLabels = u93.subTabLabels;
        }
    }
    updateStateVars(t93: InstrumentPanel_Params) {
        this.__selectedComponentId.reset(t93.selectedComponentId);
        this.__simWaveTick.reset(t93.simWaveTick);
    }
    purgeVariableDependenciesOnElmtId(s93) {
        this.__selectedComponentId.purgeDependencyOnElmtId(s93);
        this.__simWaveTick.purgeDependencyOnElmtId(s93);
        this.__statusMessage.purgeDependencyOnElmtId(s93);
        this.__subTab.purgeDependencyOnElmtId(s93);
        this.__selectionRefDes.purgeDependencyOnElmtId(s93);
        this.__selectionLibraryId.purgeDependencyOnElmtId(s93);
        this.__timebaseIdx.purgeDependencyOnElmtId(s93);
        this.__voltageScaleIdx.purgeDependencyOnElmtId(s93);
        this.__triggerLevel.purgeDependencyOnElmtId(s93);
        this.__logicChannels.purgeDependencyOnElmtId(s93);
        this.__threshold.purgeDependencyOnElmtId(s93);
        this.__mmReading.purgeDependencyOnElmtId(s93);
        this.__mmMode.purgeDependencyOnElmtId(s93);
        this.__freq.purgeDependencyOnElmtId(s93);
        this.__uartHex.purgeDependencyOnElmtId(s93);
        this.__uartLog.purgeDependencyOnElmtId(s93);
        this.__waveTimeData.purgeDependencyOnElmtId(s93);
        this.__waveVoltageData.purgeDependencyOnElmtId(s93);
        this.__waveCh2Data.purgeDependencyOnElmtId(s93);
        this.__cursorAIdx.purgeDependencyOnElmtId(s93);
        this.__cursorBIdx.purgeDependencyOnElmtId(s93);
        this.__cursorMeasureText.purgeDependencyOnElmtId(s93);
        this.__decodedFramesText.purgeDependencyOnElmtId(s93);
        this.__logicChannelData.purgeDependencyOnElmtId(s93);
        this.__logicSampleCount.purgeDependencyOnElmtId(s93);
        this.__vmType.purgeDependencyOnElmtId(s93);
        this.__vmReading.purgeDependencyOnElmtId(s93);
        this.__vmRange.purgeDependencyOnElmtId(s93);
        this.__vmUnit.purgeDependencyOnElmtId(s93);
        this.__amType.purgeDependencyOnElmtId(s93);
        this.__amReading.purgeDependencyOnElmtId(s93);
        this.__amRange.purgeDependencyOnElmtId(s93);
        this.__amUnit.purgeDependencyOnElmtId(s93);
        this.__pmVoltage.purgeDependencyOnElmtId(s93);
        this.__pmCurrent.purgeDependencyOnElmtId(s93);
        this.__pmPower.purgeDependencyOnElmtId(s93);
        this.__pmPF.purgeDependencyOnElmtId(s93);
        this.__fcReading.purgeDependencyOnElmtId(s93);
        this.__fcGateTime.purgeDependencyOnElmtId(s93);
    }
    aboutToBeDeleted() {
        this.__selectedComponentId.aboutToBeDeleted();
        this.__simWaveTick.aboutToBeDeleted();
        this.__statusMessage.aboutToBeDeleted();
        this.__subTab.aboutToBeDeleted();
        this.__selectionRefDes.aboutToBeDeleted();
        this.__selectionLibraryId.aboutToBeDeleted();
        this.__timebaseIdx.aboutToBeDeleted();
        this.__voltageScaleIdx.aboutToBeDeleted();
        this.__triggerLevel.aboutToBeDeleted();
        this.__logicChannels.aboutToBeDeleted();
        this.__threshold.aboutToBeDeleted();
        this.__mmReading.aboutToBeDeleted();
        this.__mmMode.aboutToBeDeleted();
        this.__freq.aboutToBeDeleted();
        this.__uartHex.aboutToBeDeleted();
        this.__uartLog.aboutToBeDeleted();
        this.__waveTimeData.aboutToBeDeleted();
        this.__waveVoltageData.aboutToBeDeleted();
        this.__waveCh2Data.aboutToBeDeleted();
        this.__cursorAIdx.aboutToBeDeleted();
        this.__cursorBIdx.aboutToBeDeleted();
        this.__cursorMeasureText.aboutToBeDeleted();
        this.__decodedFramesText.aboutToBeDeleted();
        this.__logicChannelData.aboutToBeDeleted();
        this.__logicSampleCount.aboutToBeDeleted();
        this.__vmType.aboutToBeDeleted();
        this.__vmReading.aboutToBeDeleted();
        this.__vmRange.aboutToBeDeleted();
        this.__vmUnit.aboutToBeDeleted();
        this.__amType.aboutToBeDeleted();
        this.__amReading.aboutToBeDeleted();
        this.__amRange.aboutToBeDeleted();
        this.__amUnit.aboutToBeDeleted();
        this.__pmVoltage.aboutToBeDeleted();
        this.__pmCurrent.aboutToBeDeleted();
        this.__pmPower.aboutToBeDeleted();
        this.__pmPF.aboutToBeDeleted();
        this.__fcReading.aboutToBeDeleted();
        this.__fcGateTime.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __selectedComponentId: SynchedPropertySimpleOneWayPU<string>;
    get selectedComponentId() {
        return this.__selectedComponentId.get();
    }
    set selectedComponentId(r93: string) {
        this.__selectedComponentId.set(r93);
    }
    private __simWaveTick: SynchedPropertySimpleOneWayPU<number>;
    get simWaveTick() {
        return this.__simWaveTick.get();
    }
    set simWaveTick(q93: number) {
        this.__simWaveTick.set(q93);
    }
    private __statusMessage: SynchedPropertySimpleTwoWayPU<string>;
    get statusMessage() {
        return this.__statusMessage.get();
    }
    set statusMessage(p93: string) {
        this.__statusMessage.set(p93);
    }
    private __subTab: ObservedPropertySimplePU<number>;
    get subTab() {
        return this.__subTab.get();
    }
    set subTab(o93: number) {
        this.__subTab.set(o93);
    }
    private __selectionRefDes: ObservedPropertySimplePU<string>;
    get selectionRefDes() {
        return this.__selectionRefDes.get();
    }
    set selectionRefDes(n93: string) {
        this.__selectionRefDes.set(n93);
    }
    private __selectionLibraryId: ObservedPropertySimplePU<string>;
    get selectionLibraryId() {
        return this.__selectionLibraryId.get();
    }
    set selectionLibraryId(m93: string) {
        this.__selectionLibraryId.set(m93);
    }
    private __timebaseIdx: ObservedPropertySimplePU<number>;
    get timebaseIdx() {
        return this.__timebaseIdx.get();
    }
    set timebaseIdx(l93: number) {
        this.__timebaseIdx.set(l93);
    }
    private __voltageScaleIdx: ObservedPropertySimplePU<number>;
    get voltageScaleIdx() {
        return this.__voltageScaleIdx.get();
    }
    set voltageScaleIdx(k93: number) {
        this.__voltageScaleIdx.set(k93);
    }
    private __triggerLevel: ObservedPropertySimplePU<number>;
    get triggerLevel() {
        return this.__triggerLevel.get();
    }
    set triggerLevel(j93: number) {
        this.__triggerLevel.set(j93);
    }
    private __logicChannels: ObservedPropertySimplePU<number>;
    get logicChannels() {
        return this.__logicChannels.get();
    }
    set logicChannels(i93: number) {
        this.__logicChannels.set(i93);
    }
    private __threshold: ObservedPropertySimplePU<number>;
    get threshold() {
        return this.__threshold.get();
    }
    set threshold(h93: number) {
        this.__threshold.set(h93);
    }
    private __mmReading: ObservedPropertySimplePU<string>;
    get mmReading() {
        return this.__mmReading.get();
    }
    set mmReading(g93: string) {
        this.__mmReading.set(g93);
    }
    private __mmMode: ObservedPropertySimplePU<string>;
    get mmMode() {
        return this.__mmMode.get();
    }
    set mmMode(f93: string) {
        this.__mmMode.set(f93);
    }
    private __freq: ObservedPropertySimplePU<string>;
    get freq() {
        return this.__freq.get();
    }
    set freq(e93: string) {
        this.__freq.set(e93);
    }
    private __uartHex: ObservedPropertySimplePU<string>;
    get uartHex() {
        return this.__uartHex.get();
    }
    set uartHex(d93: string) {
        this.__uartHex.set(d93);
    }
    private __uartLog: ObservedPropertySimplePU<string>;
    get uartLog() {
        return this.__uartLog.get();
    }
    set uartLog(c93: string) {
        this.__uartLog.set(c93);
    }
    private __waveTimeData: ObservedPropertyObjectPU<number[]>;
    get waveTimeData() {
        return this.__waveTimeData.get();
    }
    set waveTimeData(b93: number[]) {
        this.__waveTimeData.set(b93);
    }
    private __waveVoltageData: ObservedPropertyObjectPU<number[]>;
    get waveVoltageData() {
        return this.__waveVoltageData.get();
    }
    set waveVoltageData(a93: number[]) {
        this.__waveVoltageData.set(a93);
    }
    private __waveCh2Data: ObservedPropertyObjectPU<number[]>;
    get waveCh2Data() {
        return this.__waveCh2Data.get();
    }
    set waveCh2Data(z92: number[]) {
        this.__waveCh2Data.set(z92);
    }
    private __cursorAIdx: ObservedPropertySimplePU<number>;
    get cursorAIdx() {
        return this.__cursorAIdx.get();
    }
    set cursorAIdx(y92: number) {
        this.__cursorAIdx.set(y92);
    }
    private __cursorBIdx: ObservedPropertySimplePU<number>;
    get cursorBIdx() {
        return this.__cursorBIdx.get();
    }
    set cursorBIdx(x92: number) {
        this.__cursorBIdx.set(x92);
    }
    private __cursorMeasureText: ObservedPropertySimplePU<string>;
    get cursorMeasureText() {
        return this.__cursorMeasureText.get();
    }
    set cursorMeasureText(w92: string) {
        this.__cursorMeasureText.set(w92);
    }
    private __decodedFramesText: ObservedPropertySimplePU<string>;
    get decodedFramesText() {
        return this.__decodedFramesText.get();
    }
    set decodedFramesText(v92: string) {
        this.__decodedFramesText.set(v92);
    }
    private __logicChannelData: ObservedPropertyObjectPU<number[][]>;
    get logicChannelData() {
        return this.__logicChannelData.get();
    }
    set logicChannelData(u92: number[][]) {
        this.__logicChannelData.set(u92);
    }
    private __logicSampleCount: ObservedPropertySimplePU<number>;
    get logicSampleCount() {
        return this.__logicSampleCount.get();
    }
    set logicSampleCount(t92: number) {
        this.__logicSampleCount.set(t92);
    }
    private __vmType: ObservedPropertySimplePU<number>;
    get vmType() {
        return this.__vmType.get();
    }
    set vmType(s92: number) {
        this.__vmType.set(s92);
    }
    private __vmReading: ObservedPropertySimplePU<string>;
    get vmReading() {
        return this.__vmReading.get();
    }
    set vmReading(r92: string) {
        this.__vmReading.set(r92);
    }
    private __vmRange: ObservedPropertySimplePU<string>;
    get vmRange() {
        return this.__vmRange.get();
    }
    set vmRange(q92: string) {
        this.__vmRange.set(q92);
    }
    private __vmUnit: ObservedPropertySimplePU<string>;
    get vmUnit() {
        return this.__vmUnit.get();
    }
    set vmUnit(p92: string) {
        this.__vmUnit.set(p92);
    }
    private __amType: ObservedPropertySimplePU<number>;
    get amType() {
        return this.__amType.get();
    }
    set amType(o92: number) {
        this.__amType.set(o92);
    }
    private __amReading: ObservedPropertySimplePU<string>;
    get amReading() {
        return this.__amReading.get();
    }
    set amReading(n92: string) {
        this.__amReading.set(n92);
    }
    private __amRange: ObservedPropertySimplePU<string>;
    get amRange() {
        return this.__amRange.get();
    }
    set amRange(m92: string) {
        this.__amRange.set(m92);
    }
    private __amUnit: ObservedPropertySimplePU<string>;
    get amUnit() {
        return this.__amUnit.get();
    }
    set amUnit(l92: string) {
        this.__amUnit.set(l92);
    }
    private __pmVoltage: ObservedPropertySimplePU<string>;
    get pmVoltage() {
        return this.__pmVoltage.get();
    }
    set pmVoltage(k92: string) {
        this.__pmVoltage.set(k92);
    }
    private __pmCurrent: ObservedPropertySimplePU<string>;
    get pmCurrent() {
        return this.__pmCurrent.get();
    }
    set pmCurrent(j92: string) {
        this.__pmCurrent.set(j92);
    }
    private __pmPower: ObservedPropertySimplePU<string>;
    get pmPower() {
        return this.__pmPower.get();
    }
    set pmPower(i92: string) {
        this.__pmPower.set(i92);
    }
    private __pmPF: ObservedPropertySimplePU<string>;
    get pmPF() {
        return this.__pmPF.get();
    }
    set pmPF(h92: string) {
        this.__pmPF.set(h92);
    }
    private __fcReading: ObservedPropertySimplePU<string>;
    get fcReading() {
        return this.__fcReading.get();
    }
    set fcReading(g92: string) {
        this.__fcReading.set(g92);
    }
    private __fcGateTime: ObservedPropertySimplePU<number>;
    get fcGateTime() {
        return this.__fcGateTime.get();
    }
    set fcGateTime(f92: number) {
        this.__fcGateTime.set(f92);
    }
    private appService: AppService;
    private timebases: OscTimebase[];
    private timebaseLabels: string[];
    private selTimebase: SelectValueOption[];
    private selVScale: SelectValueOption[];
    private selLogicCh: SelectValueOption[];
    private autoRefreshTimer: number;
    private uiLogTick: number;
    private subTabLabels: string[];
    aboutToAppear(): void {
        this.updateSelectionHeader();
        this.syncSubTabFromSelection();
        this.syncInstrumentContext();
        this.autoRefreshTimer = setInterval(() => {
            this.autoRefreshReadings();
        }, 500);
    }
    onSelectionChange(): void {
        this.updateSelectionHeader();
        this.syncSubTabFromSelection();
        this.syncInstrumentContext();
        const e92 = this.autoRefreshReadings();
        this.logInstrumentReading(true, e92);
    }
    private syncSubTabFromSelection(): void {
        const c92 = this.instrKindForSelection();
        const d92 = instrumentSubTabForKind(c92);
        if (d92 >= 0) {
            this.subTab = d92;
        }
    }
    onSimWaveTick(): void {
        this.autoRefreshReadings();
    }
    private syncInstrumentContext(): void {
        if (this.selectedComponentId.length > 0) {
            this.appService.setActiveInstrumentComponent(this.selectedComponentId);
            this.appService.refreshInstrumentReaderForComponent(this.selectedComponentId);
        }
        else {
            this.appService.setActiveInstrumentComponent(null);
        }
    }
    private updateSelectionHeader(): void {
        if (this.selectedComponentId.length === 0) {
            this.selectionRefDes = '';
            this.selectionLibraryId = '';
            return;
        }
        const z91 = this.appService.schematicEditor.getDocument();
        const a92 = z91.components.find(b92 => b92.id === this.selectedComponentId);
        if (a92 !== undefined) {
            this.selectionRefDes = a92.refDes;
            this.selectionLibraryId = a92.libraryId;
        }
        else {
            this.selectionRefDes = '';
            this.selectionLibraryId = '';
        }
    }
    aboutToDisappear(): void {
        if (this.autoRefreshTimer >= 0) {
            clearInterval(this.autoRefreshTimer);
            this.autoRefreshTimer = -1;
        }
    }
    autoRefreshReadings(): string {
        if (this.selectedComponentId.length === 0) {
            this.appService.setActiveInstrumentComponent(null);
            return '';
        }
        this.appService.setActiveInstrumentComponent(this.selectedComponentId);
        const e91 = this.instrKindForSelection();
        try {
            if (e91 === 'dmm') {
                const x91 = this.appService.instruments.measure();
                if (x91.success && x91.data !== undefined) {
                    this.mmReading = x91.data.toFixed(3);
                }
                const y91 = this.appService.instruments.getInstrumentSnapshot();
                if (y91 !== undefined) {
                    this.mmMode = this.modeLabel(y91.multimeterMode);
                }
            }
            else if (e91 === 'vm') {
                const u91 = this.appService.readVoltmeterDeltaForComponent(this.selectedComponentId);
                if (u91 !== null) {
                    this.vmReading = u91.toFixed(3);
                }
                else {
                    const w91 = this.appService.instruments.voltmeterMeasure();
                    if (w91.success && w91.data !== undefined) {
                        this.vmReading = w91.data.toFixed(3);
                    }
                }
                const v91 = this.appService.instruments.getVoltmeterConfig();
                if (v91.success && v91.data !== undefined) {
                    this.vmRange = `${v91.data.range}V`;
                    this.vmUnit = v91.data.unit ?? 'V DC';
                }
            }
            else if (e91 === 'am') {
                const r91 = this.appService.readAmmeterCurrentForComponent(this.selectedComponentId);
                if (r91 !== null) {
                    this.amReading = r91.toFixed(3);
                }
                else {
                    const t91 = this.appService.instruments.ammeterMeasure();
                    if (t91.success && t91.data !== undefined) {
                        this.amReading = t91.data.toFixed(3);
                    }
                }
                const s91 = this.appService.instruments.getAmmeterConfig();
                if (s91.success && s91.data !== undefined) {
                    this.amRange = `${s91.data.range}mA`;
                    this.amUnit = s91.data.unit ?? 'mA DC';
                }
            }
            else if (e91 === 'osc') {
                const p91 = this.appService.instruments.getOscilloscopeWave(0);
                if (p91.success && p91.data) {
                    this.waveTimeData = p91.data.timeAxis.slice();
                    this.waveVoltageData = p91.data.voltageAxis.slice();
                }
                const q91 = this.appService.instruments.getOscilloscopeWave(1);
                if (q91.success && q91.data) {
                    this.waveCh2Data = q91.data.voltageAxis.slice();
                }
            }
            else if (e91 === 'power') {
                const o91 = this.appService.instruments.powerMeterMeasure();
                if (o91.success && o91.data) {
                    this.pmVoltage = o91.data.voltage.toFixed(3);
                    this.pmCurrent = (o91.data.current * 1000).toFixed(2);
                    this.pmPower = (o91.data.power * 1000).toFixed(1);
                    this.pmPF = o91.data.powerFactor.toFixed(2);
                }
            }
            else if (e91 === 'freq') {
                const n91 = this.appService.instruments.freqCounterMeasure();
                if (n91.success && n91.data !== undefined) {
                    if (n91.data >= 1000000) {
                        this.fcReading = `${(n91.data / 1000000).toFixed(3)} MHz`;
                    }
                    else if (n91.data >= 1000) {
                        this.fcReading = `${(n91.data / 1000).toFixed(1)} kHz`;
                    }
                    else {
                        this.fcReading = `${n91.data.toFixed(0)} Hz`;
                    }
                }
            }
            else if (e91 === 'logic') {
                const h91 = this.appService.instruments.getLogicWaveData();
                if (h91.success && h91.data !== undefined) {
                    const i91: number[][] = [];
                    for (let j91 = 0; j91 < h91.data.length; j91++) {
                        const k91 = h91.data[j91];
                        const l91: number[] = [];
                        for (let m91 = 0; m91 < k91.voltageAxis.length; m91++) {
                            l91.push(k91.voltageAxis[m91] > 0.5 ? 1 : 0);
                        }
                        i91.push(l91.slice());
                    }
                    this.logicChannelData = i91;
                    this.logicSampleCount = i91.length > 0 ? i91[0].length : 128;
                    if (i91.length > 0) {
                        this.logicChannels = i91.length;
                    }
                }
            }
            else if (e91 === 'uart') {
                this.uartLog = this.appService.instruments.getUartLog();
            }
        }
        catch (g91) {
        }
        const f91 = this.buildReadingSummary(e91);
        this.logInstrumentReading(false, f91);
        return f91;
    }
    private logInstrumentReading(a91: boolean, b91: string = ''): void {
        if (this.selectedComponentId.length === 0) {
            return;
        }
        const c91 = this.instrKindForSelection();
        if (c91.length === 0) {
            return;
        }
        this.uiLogTick++;
        if (!a91 && this.uiLogTick % 20 !== 0) {
            return;
        }
        const d91 = b91.length > 0 ? b91 : this.buildReadingSummary(c91);
        if (a91) {
            traceUiSelect('Instr', this.selectedComponentId, this.selectionRefDes, this.selectionLibraryId, c91, d91);
        }
        else {
            traceUiRefresh('Instr', this.selectedComponentId, this.selectionRefDes, this.selectionLibraryId, c91, d91);
        }
    }
    private buildReadingSummary(x90: string): string {
        if (x90 === 'dmm')
            return `DMM ${this.mmReading}`;
        if (x90 === 'vm')
            return `VM ${this.vmReading} ${this.vmUnit}`;
        if (x90 === 'am')
            return `AM ${this.amReading} ${this.amUnit}`;
        if (x90 === 'power')
            return `PM V=${this.pmVoltage} I=${this.pmCurrent} P=${this.pmPower}`;
        if (x90 === 'freq')
            return `FC ${this.fcReading}`;
        if (x90 === 'osc') {
            const y90 = this.waveVoltageData.length;
            const z90 = y90 > 0 ? this.waveVoltageData[y90 - 1].toFixed(4) : '0';
            return `OSC pts=${y90} last=${z90}V ch2=${this.waveCh2Data.length}`;
        }
        if (x90 === 'logic')
            return `LA ch=${this.logicChannels} samples=${this.logicSampleCount}`;
        if (x90 === 'uart')
            return `UART logLen=${this.uartLog.length}`;
        return x90;
    }
    private instrKindForSelection(): string {
        return detectInstrumentKind(this.selectionLibraryId);
    }
    private modeLabel(w90: MultimeterMode): string {
        switch (w90) {
            case MultimeterMode.DCV: return 'DCV';
            case MultimeterMode.ACV: return 'ACV';
            case MultimeterMode.RESISTANCE: return 'OHM';
            case MultimeterMode.CURRENT: return 'AMP';
            case MultimeterMode.DIODE: return 'DIODE';
            default: return 'DCV';
        }
    }
    initialRender() {
        this.observeComponentCreation2((u90, v90) => {
            Column.create();
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.width('100%');
            Column.height('100%');
        }, Column);
        this.SelectionHeader.bind(this)();
        this.InstrumentSubTabBar.bind(this)();
        this.observeComponentCreation2((s90, t90) => {
            Column.create();
            Column.layoutWeight(1);
            Column.width('100%');
        }, Column);
        this.observeComponentCreation2((q90, r90) => {
            If.create();
            if (this.subTab === 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.OscPanel.bind(this)();
                });
            }
            else if (this.subTab === 1) {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.LogicPanel.bind(this)();
                });
            }
            else if (this.subTab === 2) {
                this.ifElseBranchUpdateFunction(2, () => {
                    this.MmPanel.bind(this)();
                });
            }
            else if (this.subTab === 3) {
                this.ifElseBranchUpdateFunction(3, () => {
                    this.SigGenPanel.bind(this)();
                });
            }
            else if (this.subTab === 4) {
                this.ifElseBranchUpdateFunction(4, () => {
                    this.UartPanel.bind(this)();
                });
            }
            else if (this.subTab === 5) {
                this.ifElseBranchUpdateFunction(5, () => {
                    this.VoltmeterPanel.bind(this)();
                });
            }
            else if (this.subTab === 6) {
                this.ifElseBranchUpdateFunction(6, () => {
                    this.AmmeterPanel.bind(this)();
                });
            }
            else if (this.subTab === 7) {
                this.ifElseBranchUpdateFunction(7, () => {
                    this.PowerMeterPanel.bind(this)();
                });
            }
            else if (this.subTab === 8) {
                this.ifElseBranchUpdateFunction(8, () => {
                    this.FreqCounterPanel.bind(this)();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(9, () => {
                });
            }
        }, If);
        If.pop();
        Column.pop();
        Column.pop();
    }
    InstrumentSubTabBar(h90 = null) {
        this.observeComponentCreation2((o90, p90) => {
            Column.create();
            Column.width('100%');
            Column.padding({ left: 6, right: 6, top: 5, bottom: 5 });
            Column.backgroundColor(ProteusColors.TAB_BAR_BG);
            Column.border({ width: { bottom: 1 }, color: ProteusColors.DIVIDER });
        }, Column);
        {
            this.observeComponentCreation2((i90, j90) => {
                if (j90) {
                    let k90 = new ProteusChipGrid(this, {
                        labels: this.subTabLabels,
                        selectedIdx: this.subTab,
                        colsPerRow: 3,
                        onSelect: (n90: number) => { this.subTab = n90; }
                    }, undefined, i90, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 340, col: 7 });
                    ViewPU.create(k90);
                    let l90 = () => {
                        return {
                            labels: this.subTabLabels,
                            selectedIdx: this.subTab,
                            colsPerRow: 3,
                            onSelect: (m90: number) => { this.subTab = m90; }
                        };
                    };
                    k90.paramsGenerator_ = l90;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(i90, {
                        labels: this.subTabLabels,
                        selectedIdx: this.subTab,
                        colsPerRow: 3
                    });
                }
            }, { name: "ProteusChipGrid" });
        }
        Column.pop();
    }
    SelectionHeader(a90 = null) {
        this.observeComponentCreation2((f90, g90) => {
            Column.create({ space: 2 });
            Column.width('100%');
            Column.padding({ left: 10, right: 10, top: 8, bottom: 6 });
            Column.backgroundColor(ProteusColors.PANEL_TITLE_BG);
            Column.border({ width: { bottom: 1 }, color: ProteusColors.DIVIDER });
            Column.alignItems(HorizontalAlign.Start);
        }, Column);
        this.observeComponentCreation2((d90, e90) => {
            Text.create(this.selectionRefDes.length > 0 ? this.selectionRefDes : 'Instruments');
            Text.fontSize(13);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
            Text.maxLines(1);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
            Text.width('100%');
        }, Text);
        Text.pop();
        this.observeComponentCreation2((b90, c90) => {
            Text.create(this.selectionLibraryId.length > 0 ? this.selectionLibraryId : '选中画布上的仪器以关联读数');
            Text.fontSize(10);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.maxLines(1);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
            Text.width('100%');
        }, Text);
        Text.pop();
        Column.pop();
    }
    ReadoutDisplay(m89: string, n89: string, o89: string, p89 = null) {
        this.observeComponentCreation2((y89, z89) => {
            Column.create();
            Column.width('92%');
            Column.padding({ top: 10, bottom: 10 });
            Column.backgroundColor(ProteusColors.INPUT_READONLY_BG);
            Column.border({ width: 1, color: ProteusColors.DIVIDER });
            Column.alignItems(HorizontalAlign.Center);
        }, Column);
        this.observeComponentCreation2((w89, x89) => {
            Text.create(m89);
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.fontFamily('monospace');
        }, Text);
        Text.pop();
        this.observeComponentCreation2((u89, v89) => {
            Text.create(n89);
            Text.fontSize(28);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Bold);
            Text.fontFamily('monospace');
        }, Text);
        Text.pop();
        this.observeComponentCreation2((q89, r89) => {
            If.create();
            if (o89.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((s89, t89) => {
                        Text.create(o89);
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                        Text.fontFamily('monospace');
                        Text.margin({ top: 2 });
                    }, Text);
                    Text.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        Column.pop();
    }
    PlaceholderDisplay(g89: string, h89 = null) {
        this.observeComponentCreation2((k89, l89) => {
            Column.create();
            Column.width('100%');
            Column.height(80);
            Column.backgroundColor('#0a0a12');
            Column.justifyContent(FlexAlign.Center);
        }, Column);
        this.observeComponentCreation2((i89, j89) => {
            Text.create(g89);
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
        }, Text);
        Text.pop();
        Column.pop();
    }
    OscPanel(c86 = null) {
        this.observeComponentCreation2((e89, f89) => {
            Scroll.create();
            Scroll.width('100%');
            Scroll.height('100%');
        }, Scroll);
        this.observeComponentCreation2((c89, d89) => {
            Column.create({ space: 8 });
            Column.width('100%');
        }, Column);
        this.observeComponentCreation2((a89, b89) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 6 });
        }, Row);
        this.observeComponentCreation2((y88, z88) => {
            Text.create('时基');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width(32);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((v88, w88) => {
            Select.create(this.selTimebase);
            Select.selected(this.timebaseIdx);
            Select.value(this.timebaseLabels[this.timebaseIdx]);
            Select.font({ size: 11 });
            Select.fontColor(ProteusColors.TEXT_PRIMARY);
            Select.backgroundColor(ProteusColors.CANVAS_BG);
            Select.layoutWeight(1);
            Select.height(ProteusDimens.PARAM_ROW_HEIGHT);
            Select.onSelect((x88: number) => {
                this.timebaseIdx = x88;
                this.appService.instruments.setTimebase(this.timebases[x88]);
            });
        }, Select);
        Select.pop();
        Row.pop();
        this.observeComponentCreation2((t88, u88) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        this.observeComponentCreation2((r88, s88) => {
            Text.create('档位');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width(32);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((o88, p88) => {
            Select.create(this.selVScale);
            Select.selected(this.voltageScaleIdx);
            Select.value(['1mV', '10mV', '100mV', '1V', '10V', '100V'][this.voltageScaleIdx]);
            Select.font({ size: 11 });
            Select.fontColor(ProteusColors.TEXT_PRIMARY);
            Select.backgroundColor(ProteusColors.CANVAS_BG);
            Select.layoutWeight(1);
            Select.height(ProteusDimens.PARAM_ROW_HEIGHT);
            Select.onSelect((q88: number) => { this.voltageScaleIdx = q88; });
        }, Select);
        Select.pop();
        Row.pop();
        this.observeComponentCreation2((m88, n88) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        {
            this.observeComponentCreation2((i88, j88) => {
                if (j88) {
                    let k88 = new ProteusClassicBtn(this, { label: 'AC', widthVal: '48%',
                        onAction: () => { this.appService.instruments.setCoupling(0, CouplingMode.AC); } }, undefined, i88, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 462, col: 11 });
                    ViewPU.create(k88);
                    let l88 = () => {
                        return {
                            label: 'AC',
                            widthVal: '48%',
                            onAction: () => { this.appService.instruments.setCoupling(0, CouplingMode.AC); }
                        };
                    };
                    k88.paramsGenerator_ = l88;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(i88, {
                        label: 'AC', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((e88, f88) => {
                if (f88) {
                    let g88 = new ProteusClassicBtn(this, { label: 'DC', widthVal: '48%',
                        onAction: () => { this.appService.instruments.setCoupling(0, CouplingMode.DC); } }, undefined, e88, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 464, col: 11 });
                    ViewPU.create(g88);
                    let h88 = () => {
                        return {
                            label: 'DC',
                            widthVal: '48%',
                            onAction: () => { this.appService.instruments.setCoupling(0, CouplingMode.DC); }
                        };
                    };
                    g88.paramsGenerator_ = h88;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(e88, {
                        label: 'DC', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((c88, d88) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        {
            this.observeComponentCreation2((y87, z87) => {
                if (z87) {
                    let a88 = new ProteusClassicBtn(this, { label: '采样', widthVal: '48%',
                        onAction: () => { this.captureWave(); } }, undefined, y87, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 470, col: 11 });
                    ViewPU.create(a88);
                    let b88 = () => {
                        return {
                            label: '采样',
                            widthVal: '48%',
                            onAction: () => { this.captureWave(); }
                        };
                    };
                    a88.paramsGenerator_ = b88;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(y87, {
                        label: '采样', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((u87, v87) => {
                if (v87) {
                    let w87 = new ProteusClassicBtn(this, { label: 'FFT', widthVal: '48%',
                        onAction: () => { this.appService.instruments.setMathChannel(MathChannelOp.FFT, true); } }, undefined, u87, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 472, col: 11 });
                    ViewPU.create(w87);
                    let x87 = () => {
                        return {
                            label: 'FFT',
                            widthVal: '48%',
                            onAction: () => { this.appService.instruments.setMathChannel(MathChannelOp.FFT, true); }
                        };
                    };
                    w87.paramsGenerator_ = x87;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(u87, {
                        label: 'FFT', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((s87, t87) => {
            Column.create({ space: 4 });
            Column.width('100%');
            Column.padding({ left: 8, right: 8 });
        }, Column);
        this.observeComponentCreation2((q87, r87) => {
            Text.create(`触发 ${this.triggerLevel.toFixed(1)} V`);
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width('100%');
        }, Text);
        Text.pop();
        this.observeComponentCreation2((n87, o87) => {
            Slider.create({ value: this.triggerLevel, min: -5, max: 5, step: 0.1 });
            Slider.width('100%');
            Slider.height(ProteusDimens.PARAM_ROW_HEIGHT);
            Slider.onChange((p87: number) => { this.triggerLevel = p87; });
        }, Slider);
        Column.pop();
        this.observeComponentCreation2((l87, m87) => {
            Column.create();
            Column.width('100%');
            Column.padding({ left: 4, right: 4 });
        }, Column);
        this.observeComponentCreation2((f87, g87) => {
            If.create();
            if (this.waveVoltageData.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    {
                        this.observeComponentCreation2((h87, i87) => {
                            if (i87) {
                                let j87 = new OscilloscopeWaveCanvas(this, {
                                    timeData: this.waveTimeData,
                                    voltageData: this.waveVoltageData,
                                    channelLabel: 'CH1',
                                    vPerDiv: 1,
                                    triggerLevel: this.triggerLevel
                                }, undefined, h87, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 494, col: 13 });
                                ViewPU.create(j87);
                                let k87 = () => {
                                    return {
                                        timeData: this.waveTimeData,
                                        voltageData: this.waveVoltageData,
                                        channelLabel: 'CH1',
                                        vPerDiv: 1,
                                        triggerLevel: this.triggerLevel
                                    };
                                };
                                j87.paramsGenerator_ = k87;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(h87, {
                                    timeData: this.waveTimeData,
                                    voltageData: this.waveVoltageData,
                                    channelLabel: 'CH1',
                                    vPerDiv: 1,
                                    triggerLevel: this.triggerLevel
                                });
                            }
                        }, { name: "OscilloscopeWaveCanvas" });
                    }
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.PlaceholderDisplay.bind(this)('点击"采样"获取波形');
                });
            }
        }, If);
        If.pop();
        Column.pop();
        this.observeComponentCreation2((x86, y86) => {
            If.create();
            if (this.waveCh2Data.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((d87, e87) => {
                        Column.create();
                        Column.width('100%');
                        Column.padding({ left: 4, right: 4 });
                    }, Column);
                    {
                        this.observeComponentCreation2((z86, a87) => {
                            if (a87) {
                                let b87 = new OscilloscopeWaveCanvas(this, {
                                    timeData: this.waveTimeData,
                                    voltageData: this.waveCh2Data,
                                    channelLabel: 'CH2',
                                    vPerDiv: 1,
                                    triggerLevel: this.triggerLevel
                                }, undefined, z86, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 510, col: 13 });
                                ViewPU.create(b87);
                                let c87 = () => {
                                    return {
                                        timeData: this.waveTimeData,
                                        voltageData: this.waveCh2Data,
                                        channelLabel: 'CH2',
                                        vPerDiv: 1,
                                        triggerLevel: this.triggerLevel
                                    };
                                };
                                b87.paramsGenerator_ = c87;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(z86, {
                                    timeData: this.waveTimeData,
                                    voltageData: this.waveCh2Data,
                                    channelLabel: 'CH2',
                                    vPerDiv: 1,
                                    triggerLevel: this.triggerLevel
                                });
                            }
                        }, { name: "OscilloscopeWaveCanvas" });
                    }
                    Column.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((v86, w86) => {
            Column.create({ space: 2 });
            Column.width('100%');
            Column.padding({ left: 8, right: 8, bottom: 8 });
        }, Column);
        this.observeComponentCreation2((t86, u86) => {
            Row.create();
            Row.width('100%');
        }, Row);
        this.observeComponentCreation2((r86, s86) => {
            Text.create('A:');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width(16);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((o86, p86) => {
            Slider.create({ value: this.cursorAIdx, min: 0, max: 1023, step: 1 });
            Slider.layoutWeight(1);
            Slider.height(ProteusDimens.PARAM_ROW_HEIGHT);
            Slider.onChange((q86: number) => { this.cursorAIdx = q86; this.updateCursorMeasure(); });
        }, Slider);
        Row.pop();
        this.observeComponentCreation2((m86, n86) => {
            Row.create();
            Row.width('100%');
        }, Row);
        this.observeComponentCreation2((k86, l86) => {
            Text.create('B:');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width(16);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((h86, i86) => {
            Slider.create({ value: this.cursorBIdx, min: 0, max: 1023, step: 1 });
            Slider.layoutWeight(1);
            Slider.height(ProteusDimens.PARAM_ROW_HEIGHT);
            Slider.onChange((j86: number) => { this.cursorBIdx = j86; this.updateCursorMeasure(); });
        }, Slider);
        Row.pop();
        this.observeComponentCreation2((d86, e86) => {
            If.create();
            if (this.cursorMeasureText.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((f86, g86) => {
                        Text.create(this.cursorMeasureText);
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.HOVER_PREVIEW);
                        Text.maxLines(1);
                        Text.padding({ top: 2 });
                    }, Text);
                    Text.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        Column.pop();
        Column.pop();
        Scroll.pop();
    }
    private captureWave(): void {
        for (let a86 = 0; a86 < 4; a86++) {
            const b86 = this.appService.instruments.getOscilloscopeWave(a86);
            if (b86.success && b86.data) {
                if (a86 === 0) {
                    this.waveTimeData = b86.data.timeAxis.slice();
                    this.waveVoltageData = b86.data.voltageAxis.slice();
                }
                else if (a86 === 1) {
                    this.waveCh2Data = b86.data.voltageAxis.slice();
                }
            }
        }
    }
    LogicPanel(t83 = null) {
        this.observeComponentCreation2((y85, z85) => {
            Scroll.create();
            Scroll.width('100%');
            Scroll.height('100%');
        }, Scroll);
        this.observeComponentCreation2((w85, x85) => {
            Column.create({ space: 8 });
            Column.width('100%');
        }, Column);
        this.observeComponentCreation2((u85, v85) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 6 });
        }, Row);
        this.observeComponentCreation2((s85, t85) => {
            Text.create('通道');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width(32);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((p85, q85) => {
            Select.create(this.selLogicCh);
            Select.selected(0);
            Select.font({ size: 11 });
            Select.fontColor(ProteusColors.TEXT_PRIMARY);
            Select.backgroundColor(ProteusColors.CANVAS_BG);
            Select.layoutWeight(1);
            Select.height(ProteusDimens.PARAM_ROW_HEIGHT);
            Select.onSelect((r85: number) => {
                this.logicChannels = [8, 16, 32][r85];
                this.appService.instruments.setChannels(this.logicChannels);
            });
        }, Select);
        Select.pop();
        Row.pop();
        this.observeComponentCreation2((n85, o85) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        this.observeComponentCreation2((l85, m85) => {
            Text.create('阈值');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width(32);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((i85, j85) => {
            TextInput.create({ text: `${this.threshold}` });
            TextInput.fontSize(11);
            TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
            TextInput.layoutWeight(1);
            TextInput.height(ProteusDimens.PARAM_ROW_HEIGHT);
            TextInput.borderRadius(0);
            TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
            TextInput.backgroundColor(ProteusColors.CANVAS_BG);
            TextInput.onChange((k85: string) => {
                this.threshold = parseInt(k85) || 1500;
                this.appService.instruments.setThreshold(this.threshold);
            });
        }, TextInput);
        this.observeComponentCreation2((g85, h85) => {
            Text.create('mV');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.width(24);
        }, Text);
        Text.pop();
        Row.pop();
        this.observeComponentCreation2((e85, f85) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        {
            this.observeComponentCreation2((a85, b85) => {
                if (b85) {
                    let c85 = new ProteusClassicBtn(this, { label: 'UART', widthVal: '48%',
                        onAction: () => { this.appService.instruments.decodeBus(LogicDecodeProtocol.UART, 115200); this.refreshDecodedFrames(); } }, undefined, a85, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 609, col: 11 });
                    ViewPU.create(c85);
                    let d85 = () => {
                        return {
                            label: 'UART',
                            widthVal: '48%',
                            onAction: () => { this.appService.instruments.decodeBus(LogicDecodeProtocol.UART, 115200); this.refreshDecodedFrames(); }
                        };
                    };
                    c85.paramsGenerator_ = d85;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(a85, {
                        label: 'UART', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((w84, x84) => {
                if (x84) {
                    let y84 = new ProteusClassicBtn(this, { label: 'I2C', widthVal: '48%',
                        onAction: () => { this.appService.instruments.decodeBus(LogicDecodeProtocol.I2C); this.refreshDecodedFrames(); } }, undefined, w84, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 611, col: 11 });
                    ViewPU.create(y84);
                    let z84 = () => {
                        return {
                            label: 'I2C',
                            widthVal: '48%',
                            onAction: () => { this.appService.instruments.decodeBus(LogicDecodeProtocol.I2C); this.refreshDecodedFrames(); }
                        };
                    };
                    y84.paramsGenerator_ = z84;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(w84, {
                        label: 'I2C', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((u84, v84) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        {
            this.observeComponentCreation2((q84, r84) => {
                if (r84) {
                    let s84 = new ProteusClassicBtn(this, { label: 'SPI', widthVal: '48%',
                        onAction: () => { this.appService.instruments.decodeBus(LogicDecodeProtocol.SPI); this.refreshDecodedFrames(); } }, undefined, q84, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 617, col: 11 });
                    ViewPU.create(s84);
                    let t84 = () => {
                        return {
                            label: 'SPI',
                            widthVal: '48%',
                            onAction: () => { this.appService.instruments.decodeBus(LogicDecodeProtocol.SPI); this.refreshDecodedFrames(); }
                        };
                    };
                    s84.paramsGenerator_ = t84;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(q84, {
                        label: 'SPI', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((m84, n84) => {
                if (n84) {
                    let o84 = new ProteusClassicBtn(this, { label: 'CAN', widthVal: '48%',
                        onAction: () => { this.appService.instruments.decodeBus(LogicDecodeProtocol.CAN); } }, undefined, m84, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 619, col: 11 });
                    ViewPU.create(o84);
                    let p84 = () => {
                        return {
                            label: 'CAN',
                            widthVal: '48%',
                            onAction: () => { this.appService.instruments.decodeBus(LogicDecodeProtocol.CAN); }
                        };
                    };
                    o84.paramsGenerator_ = p84;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(m84, {
                        label: 'CAN', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((k84, l84) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        {
            this.observeComponentCreation2((g84, h84) => {
                if (h84) {
                    let i84 = new ProteusClassicBtn(this, { label: '采样', widthVal: '100%',
                        onAction: () => { this.captureLogic(); } }, undefined, g84, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 625, col: 11 });
                    ViewPU.create(i84);
                    let j84 = () => {
                        return {
                            label: '采样',
                            widthVal: '100%',
                            onAction: () => { this.captureLogic(); }
                        };
                    };
                    i84.paramsGenerator_ = j84;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(g84, {
                        label: '采样', widthVal: '100%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((e84, f84) => {
            Column.create();
            Column.width('100%');
            Column.padding({ left: 4, right: 4 });
        }, Column);
        this.observeComponentCreation2((y83, z83) => {
            If.create();
            if (this.logicChannelData.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    {
                        this.observeComponentCreation2((a84, b84) => {
                            if (b84) {
                                let c84 = new LogicAnalyzerWaveCanvas(this, {
                                    channelData: this.logicChannelData,
                                    channelCount: this.logicChannels,
                                    sampleCount: this.logicSampleCount
                                }, undefined, a84, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 632, col: 13 });
                                ViewPU.create(c84);
                                let d84 = () => {
                                    return {
                                        channelData: this.logicChannelData,
                                        channelCount: this.logicChannels,
                                        sampleCount: this.logicSampleCount
                                    };
                                };
                                c84.paramsGenerator_ = d84;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(a84, {
                                    channelData: this.logicChannelData,
                                    channelCount: this.logicChannels,
                                    sampleCount: this.logicSampleCount
                                });
                            }
                        }, { name: "LogicAnalyzerWaveCanvas" });
                    }
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.PlaceholderDisplay.bind(this)('点击"采样"获取逻辑波形');
                });
            }
        }, If);
        If.pop();
        Column.pop();
        this.observeComponentCreation2((u83, v83) => {
            If.create();
            if (this.decodedFramesText.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((w83, x83) => {
                        Text.create(this.decodedFramesText);
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.HOVER_PREVIEW);
                        Text.maxLines(6);
                        Text.padding({ left: 8, right: 8, bottom: 8 });
                    }, Text);
                    Text.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        Column.pop();
        Scroll.pop();
    }
    private captureLogic(): void {
        const n83 = this.appService.instruments.getLogicWaveData();
        if (n83.success && n83.data) {
            const o83: number[][] = [];
            for (let p83 = 0; p83 < n83.data.length; p83++) {
                const q83 = n83.data[p83];
                const r83: number[] = [];
                for (let s83 = 0; s83 < q83.voltageAxis.length; s83++) {
                    r83.push(q83.voltageAxis[s83] > 0.5 ? 1 : 0);
                }
                o83.push(r83);
            }
            this.logicChannelData = o83;
            this.logicSampleCount = o83.length > 0 ? o83[0].length : 128;
            this.statusMessage = `逻辑采样: ${o83.length} 通道`;
        }
        else {
            this.statusMessage = '逻辑采样失败';
        }
    }
    MmPanel(c82 = null) {
        this.observeComponentCreation2((l83, m83) => {
            Column.create({ space: 8 });
            Column.width('100%');
            Column.height('100%');
        }, Column);
        this.observeComponentCreation2((j83, k83) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 6 });
        }, Row);
        {
            this.observeComponentCreation2((f83, g83) => {
                if (g83) {
                    let h83 = new ProteusClassicBtn(this, { label: 'DCV', widthVal: '48%',
                        onAction: () => { this.mmMode = 'DCV'; this.appService.instruments.setMode(MultimeterMode.DCV); } }, undefined, f83, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 681, col: 9 });
                    ViewPU.create(h83);
                    let i83 = () => {
                        return {
                            label: 'DCV',
                            widthVal: '48%',
                            onAction: () => { this.mmMode = 'DCV'; this.appService.instruments.setMode(MultimeterMode.DCV); }
                        };
                    };
                    h83.paramsGenerator_ = i83;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(f83, {
                        label: 'DCV', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((b83, c83) => {
                if (c83) {
                    let d83 = new ProteusClassicBtn(this, { label: 'ACV', widthVal: '48%',
                        onAction: () => { this.mmMode = 'ACV'; this.appService.instruments.setMode(MultimeterMode.ACV); } }, undefined, b83, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 683, col: 9 });
                    ViewPU.create(d83);
                    let e83 = () => {
                        return {
                            label: 'ACV',
                            widthVal: '48%',
                            onAction: () => { this.mmMode = 'ACV'; this.appService.instruments.setMode(MultimeterMode.ACV); }
                        };
                    };
                    d83.paramsGenerator_ = e83;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(b83, {
                        label: 'ACV', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((z82, a83) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        {
            this.observeComponentCreation2((v82, w82) => {
                if (w82) {
                    let x82 = new ProteusClassicBtn(this, { label: 'OHM', widthVal: '48%',
                        onAction: () => { this.mmMode = 'OHM'; this.appService.instruments.setMode(MultimeterMode.RESISTANCE); } }, undefined, v82, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 689, col: 9 });
                    ViewPU.create(x82);
                    let y82 = () => {
                        return {
                            label: 'OHM',
                            widthVal: '48%',
                            onAction: () => { this.mmMode = 'OHM'; this.appService.instruments.setMode(MultimeterMode.RESISTANCE); }
                        };
                    };
                    x82.paramsGenerator_ = y82;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(v82, {
                        label: 'OHM', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((r82, s82) => {
                if (s82) {
                    let t82 = new ProteusClassicBtn(this, { label: 'AMP', widthVal: '48%',
                        onAction: () => { this.mmMode = 'AMP'; this.appService.instruments.setMode(MultimeterMode.CURRENT); } }, undefined, r82, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 691, col: 9 });
                    ViewPU.create(t82);
                    let u82 = () => {
                        return {
                            label: 'AMP',
                            widthVal: '48%',
                            onAction: () => { this.mmMode = 'AMP'; this.appService.instruments.setMode(MultimeterMode.CURRENT); }
                        };
                    };
                    t82.paramsGenerator_ = u82;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(r82, {
                        label: 'AMP', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((p82, q82) => {
            Column.create();
            Column.layoutWeight(1);
            Column.width('100%');
            Column.justifyContent(FlexAlign.Center);
        }, Column);
        this.ReadoutDisplay.bind(this)(this.mmMode, this.mmReading, '');
        Column.pop();
        this.observeComponentCreation2((n82, o82) => {
            Row.create({ space: 8 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, bottom: 8 });
        }, Row);
        {
            this.observeComponentCreation2((j82, k82) => {
                if (k82) {
                    let l82 = new ProteusClassicBtn(this, { label: '自动量程', widthVal: '42%',
                        onAction: () => { this.appService.instruments.autoRange(); } }, undefined, j82, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 702, col: 9 });
                    ViewPU.create(l82);
                    let m82 = () => {
                        return {
                            label: '自动量程',
                            widthVal: '42%',
                            onAction: () => { this.appService.instruments.autoRange(); }
                        };
                    };
                    l82.paramsGenerator_ = m82;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(j82, {
                        label: '自动量程', widthVal: '42%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((d82, e82) => {
                if (e82) {
                    let f82 = new ProteusClassicBtn(this, { label: '测量', widthVal: '42%', onAction: () => {
                            const i82 = this.appService.instruments.measure();
                            this.statusMessage = i82.success ? `万用表读数: ${i82.data?.toFixed(4)}` : '测量失败';
                        } }, undefined, d82, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 704, col: 9 });
                    ViewPU.create(f82);
                    let g82 = () => {
                        return {
                            label: '测量',
                            widthVal: '42%',
                            onAction: () => {
                                const h82 = this.appService.instruments.measure();
                                this.statusMessage = h82.success ? `万用表读数: ${h82.data?.toFixed(4)}` : '测量失败';
                            }
                        };
                    };
                    f82.paramsGenerator_ = g82;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(d82, {
                        label: '测量', widthVal: '42%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        Column.pop();
    }
    SigGenPanel(q80 = null) {
        this.observeComponentCreation2((a82, b82) => {
            Column.create({ space: 8 });
            Column.width('100%');
            Column.height('100%');
        }, Column);
        this.observeComponentCreation2((y81, z81) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 6 });
        }, Row);
        {
            this.observeComponentCreation2((u81, v81) => {
                if (v81) {
                    let w81 = new ProteusClassicBtn(this, { label: '正弦', widthVal: '48%',
                        onAction: () => { this.appService.instruments.setWaveform(SignalWaveform.SINE); } }, undefined, u81, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 720, col: 9 });
                    ViewPU.create(w81);
                    let x81 = () => {
                        return {
                            label: '正弦',
                            widthVal: '48%',
                            onAction: () => { this.appService.instruments.setWaveform(SignalWaveform.SINE); }
                        };
                    };
                    w81.paramsGenerator_ = x81;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(u81, {
                        label: '正弦', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((q81, r81) => {
                if (r81) {
                    let s81 = new ProteusClassicBtn(this, { label: '方波', widthVal: '48%',
                        onAction: () => { this.appService.instruments.setWaveform(SignalWaveform.SQUARE); } }, undefined, q81, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 722, col: 9 });
                    ViewPU.create(s81);
                    let t81 = () => {
                        return {
                            label: '方波',
                            widthVal: '48%',
                            onAction: () => { this.appService.instruments.setWaveform(SignalWaveform.SQUARE); }
                        };
                    };
                    s81.paramsGenerator_ = t81;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(q81, {
                        label: '方波', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((o81, p81) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        {
            this.observeComponentCreation2((k81, l81) => {
                if (l81) {
                    let m81 = new ProteusClassicBtn(this, { label: '三角', widthVal: '48%',
                        onAction: () => { this.appService.instruments.setWaveform(SignalWaveform.TRIANGLE); } }, undefined, k81, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 728, col: 9 });
                    ViewPU.create(m81);
                    let n81 = () => {
                        return {
                            label: '三角',
                            widthVal: '48%',
                            onAction: () => { this.appService.instruments.setWaveform(SignalWaveform.TRIANGLE); }
                        };
                    };
                    m81.paramsGenerator_ = n81;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(k81, {
                        label: '三角', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((g81, h81) => {
                if (h81) {
                    let i81 = new ProteusClassicBtn(this, { label: 'Burst', widthVal: '48%',
                        onAction: () => { this.appService.instruments.setBurstMode(true, 5); } }, undefined, g81, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 730, col: 9 });
                    ViewPU.create(i81);
                    let j81 = () => {
                        return {
                            label: 'Burst',
                            widthVal: '48%',
                            onAction: () => { this.appService.instruments.setBurstMode(true, 5); }
                        };
                    };
                    i81.paramsGenerator_ = j81;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(g81, {
                        label: 'Burst', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((e81, f81) => {
            Column.create({ space: 8 });
            Column.layoutWeight(1);
            Column.width('100%');
            Column.justifyContent(FlexAlign.Center);
        }, Column);
        this.observeComponentCreation2((c81, d81) => {
            Text.create('频率');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((z80, a81) => {
            TextInput.create({ text: this.freq });
            TextInput.fontSize(16);
            TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
            TextInput.fontFamily('monospace');
            TextInput.width('70%');
            TextInput.height(32);
            TextInput.borderRadius(0);
            TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
            TextInput.backgroundColor(ProteusColors.CANVAS_BG);
            TextInput.textAlign(TextAlign.Center);
            TextInput.onChange((b81: string) => { this.freq = b81; });
        }, TextInput);
        this.observeComponentCreation2((x80, y80) => {
            Text.create('振幅: 3.3V    偏置: 1.65V    占空比: 50%');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
        }, Text);
        Text.pop();
        Column.pop();
        this.observeComponentCreation2((v80, w80) => {
            __Common__.create();
            __Common__.margin({ left: 8, right: 8, bottom: 8 });
        }, __Common__);
        {
            this.observeComponentCreation2((r80, s80) => {
                if (s80) {
                    let t80 = new ProteusClassicBtn(this, {
                        label: '应用参数', widthVal: '86%',
                        onAction: () => {
                            this.appService.instruments.setParams({
                                frequency: 1000, amplitude: 3.3, offset: 1.65, dutyCycle: 50, phase: 0
                            });
                            this.statusMessage = '信号源参数已更新';
                        }
                    }, undefined, r80, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 752, col: 7 });
                    ViewPU.create(t80);
                    let u80 = () => {
                        return {
                            label: '应用参数',
                            widthVal: '86%',
                            onAction: () => {
                                this.appService.instruments.setParams({
                                    frequency: 1000, amplitude: 3.3, offset: 1.65, dutyCycle: 50, phase: 0
                                });
                                this.statusMessage = '信号源参数已更新';
                            }
                        };
                    };
                    t80.paramsGenerator_ = u80;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(r80, {
                        label: '应用参数', widthVal: '86%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        __Common__.pop();
        Column.pop();
    }
    UartPanel(u79 = null) {
        this.observeComponentCreation2((o80, p80) => {
            Column.create({ space: 6 });
            Column.width('100%');
            Column.height('100%');
        }, Column);
        this.observeComponentCreation2((m80, n80) => {
            Row.create({ space: 4 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 6 });
        }, Row);
        this.observeComponentCreation2((j80, k80) => {
            TextInput.create({ text: this.uartHex, placeholder: 'HEX: 55 AA' });
            TextInput.fontSize(10);
            TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
            TextInput.layoutWeight(1);
            TextInput.height(ProteusDimens.PARAM_ROW_HEIGHT);
            TextInput.borderRadius(0);
            TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
            TextInput.backgroundColor(ProteusColors.CANVAS_BG);
            TextInput.onChange((l80: string) => { this.uartHex = l80; });
        }, TextInput);
        {
            this.observeComponentCreation2((f80, g80) => {
                if (g80) {
                    let h80 = new ProteusClassicBtn(this, { label: '发', widthVal: 36,
                        onAction: () => {
                            this.appService.instruments.uartHexSend(this.uartHex);
                            this.statusMessage = `已发送: ${this.uartHex}`;
                        } }, undefined, f80, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 777, col: 9 });
                    ViewPU.create(h80);
                    let i80 = () => {
                        return {
                            label: '发',
                            widthVal: 36,
                            onAction: () => {
                                this.appService.instruments.uartHexSend(this.uartHex);
                                this.statusMessage = `已发送: ${this.uartHex}`;
                            }
                        };
                    };
                    h80.paramsGenerator_ = i80;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(f80, {
                        label: '发', widthVal: 36
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((z79, a80) => {
                if (a80) {
                    let b80 = new ProteusClassicBtn(this, { label: '收', widthVal: 36, onAction: () => {
                            const e80 = this.appService.instruments.uartHexReceive();
                            this.uartLog = e80.data ?? '';
                        } }, undefined, z79, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 782, col: 9 });
                    ViewPU.create(b80);
                    let c80 = () => {
                        return {
                            label: '收',
                            widthVal: 36,
                            onAction: () => {
                                const d80 = this.appService.instruments.uartHexReceive();
                                this.uartLog = d80.data ?? '';
                            }
                        };
                    };
                    b80.paramsGenerator_ = c80;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(z79, {
                        label: '收', widthVal: 36
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((x79, y79) => {
            Column.create();
            Column.layoutWeight(1);
            Column.width('100%');
            Column.padding({ left: 8, right: 8, bottom: 8 });
        }, Column);
        this.observeComponentCreation2((v79, w79) => {
            Text.create(this.uartLog.length > 0 ? this.uartLog : '等待接收数据...');
            Text.fontSize(10);
            Text.fontColor(this.uartLog.length > 0 ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_SECONDARY);
            Text.fontFamily('monospace');
            Text.width('100%');
            Text.constraintSize({ minHeight: 80 });
            Text.backgroundColor(ProteusColors.INPUT_READONLY_BG);
            Text.padding(6);
            Text.border({ width: 1, color: ProteusColors.DIVIDER });
            Text.maxLines(16);
        }, Text);
        Text.pop();
        Column.pop();
        Column.pop();
    }
    VoltmeterPanel(j78 = null) {
        this.observeComponentCreation2((s79, t79) => {
            Column.create({ space: 6 });
            Column.width('100%');
            Column.height('100%');
        }, Column);
        this.observeComponentCreation2((q79, r79) => {
            Row.create({ space: 4 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 6 });
        }, Row);
        {
            this.observeComponentCreation2((m79, n79) => {
                if (n79) {
                    let o79 = new ProteusClassicBtn(this, { label: 'DC', widthVal: 36,
                        onAction: () => {
                            this.vmType = 0;
                            this.vmUnit = 'V DC';
                            this.appService.instruments.setVoltmeterType(VoltmeterType.DC);
                        } }, undefined, m79, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 810, col: 9 });
                    ViewPU.create(o79);
                    let p79 = () => {
                        return {
                            label: 'DC',
                            widthVal: 36,
                            onAction: () => {
                                this.vmType = 0;
                                this.vmUnit = 'V DC';
                                this.appService.instruments.setVoltmeterType(VoltmeterType.DC);
                            }
                        };
                    };
                    o79.paramsGenerator_ = p79;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(m79, {
                        label: 'DC', widthVal: 36
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((i79, j79) => {
                if (j79) {
                    let k79 = new ProteusClassicBtn(this, { label: 'AC', widthVal: 36,
                        onAction: () => {
                            this.vmType = 1;
                            this.vmUnit = 'V AC';
                            this.appService.instruments.setVoltmeterType(VoltmeterType.AC);
                        } }, undefined, i79, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 815, col: 9 });
                    ViewPU.create(k79);
                    let l79 = () => {
                        return {
                            label: 'AC',
                            widthVal: 36,
                            onAction: () => {
                                this.vmType = 1;
                                this.vmUnit = 'V AC';
                                this.appService.instruments.setVoltmeterType(VoltmeterType.AC);
                            }
                        };
                    };
                    k79.paramsGenerator_ = l79;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(i79, {
                        label: 'AC', widthVal: 36
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        this.observeComponentCreation2((g79, h79) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((e79, f79) => {
            Text.create(`量程: ${this.vmRange}`);
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
        }, Text);
        Text.pop();
        Row.pop();
        this.observeComponentCreation2((c79, d79) => {
            Column.create();
            Column.layoutWeight(1);
            Column.width('100%');
            Column.justifyContent(FlexAlign.Center);
        }, Column);
        this.ReadoutDisplay.bind(this)('VOLTAGE', this.vmReading, this.vmUnit);
        Column.pop();
        this.observeComponentCreation2((a79, b79) => {
            Row.create({ space: 8 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, bottom: 8 });
        }, Row);
        {
            this.observeComponentCreation2((u78, v78) => {
                if (v78) {
                    let w78 = new ProteusClassicBtn(this, { label: '自动量程', widthVal: '42%', onAction: () => {
                            this.appService.instruments.voltmeterAutoRange();
                            const z78 = this.appService.instruments.getVoltmeterConfig();
                            if (z78.success && z78.data) {
                                this.vmRange = `${z78.data.range}V`;
                            }
                        } }, undefined, u78, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 833, col: 9 });
                    ViewPU.create(w78);
                    let x78 = () => {
                        return {
                            label: '自动量程',
                            widthVal: '42%',
                            onAction: () => {
                                this.appService.instruments.voltmeterAutoRange();
                                const y78 = this.appService.instruments.getVoltmeterConfig();
                                if (y78.success && y78.data) {
                                    this.vmRange = `${y78.data.range}V`;
                                }
                            }
                        };
                    };
                    w78.paramsGenerator_ = x78;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(u78, {
                        label: '自动量程', widthVal: '42%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((k78, l78) => {
                if (l78) {
                    let m78 = new ProteusClassicBtn(this, { label: '测量', widthVal: '42%', onAction: () => {
                            let r78: number | null = null;
                            if (this.selectedComponentId.length > 0) {
                                r78 = this.appService.readVoltmeterDeltaForComponent(this.selectedComponentId);
                            }
                            if (r78 === null) {
                                const t78 = this.appService.instruments.voltmeterMeasure();
                                if (t78.success && t78.data !== undefined) {
                                    r78 = t78.data;
                                }
                            }
                            if (r78 !== null) {
                                this.vmReading = r78.toFixed(3);
                            }
                            const s78 = this.appService.instruments.getVoltmeterConfig();
                            if (s78.success && s78.data) {
                                this.vmRange = `${s78.data.range}V`;
                                this.vmUnit = s78.data.unit;
                            }
                            this.statusMessage = `电压表: ${this.vmReading} ${this.vmUnit}`;
                        } }, undefined, k78, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 841, col: 9 });
                    ViewPU.create(m78);
                    let n78 = () => {
                        return {
                            label: '测量',
                            widthVal: '42%',
                            onAction: () => {
                                let o78: number | null = null;
                                if (this.selectedComponentId.length > 0) {
                                    o78 = this.appService.readVoltmeterDeltaForComponent(this.selectedComponentId);
                                }
                                if (o78 === null) {
                                    const q78 = this.appService.instruments.voltmeterMeasure();
                                    if (q78.success && q78.data !== undefined) {
                                        o78 = q78.data;
                                    }
                                }
                                if (o78 !== null) {
                                    this.vmReading = o78.toFixed(3);
                                }
                                const p78 = this.appService.instruments.getVoltmeterConfig();
                                if (p78.success && p78.data) {
                                    this.vmRange = `${p78.data.range}V`;
                                    this.vmUnit = p78.data.unit;
                                }
                                this.statusMessage = `电压表: ${this.vmReading} ${this.vmUnit}`;
                            }
                        };
                    };
                    m78.paramsGenerator_ = n78;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(k78, {
                        label: '测量', widthVal: '42%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        Column.pop();
    }
    AmmeterPanel(a77 = null) {
        this.observeComponentCreation2((h78, i78) => {
            Column.create({ space: 6 });
            Column.width('100%');
            Column.height('100%');
        }, Column);
        this.observeComponentCreation2((f78, g78) => {
            Row.create({ space: 4 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 6 });
        }, Row);
        {
            this.observeComponentCreation2((b78, c78) => {
                if (c78) {
                    let d78 = new ProteusClassicBtn(this, { label: 'DC', widthVal: 36,
                        onAction: () => {
                            this.amType = 0;
                            this.amUnit = 'mA DC';
                            this.appService.instruments.setAmmeterType(AmmeterType.DC);
                        } }, undefined, b78, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 874, col: 9 });
                    ViewPU.create(d78);
                    let e78 = () => {
                        return {
                            label: 'DC',
                            widthVal: 36,
                            onAction: () => {
                                this.amType = 0;
                                this.amUnit = 'mA DC';
                                this.appService.instruments.setAmmeterType(AmmeterType.DC);
                            }
                        };
                    };
                    d78.paramsGenerator_ = e78;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(b78, {
                        label: 'DC', widthVal: 36
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((x77, y77) => {
                if (y77) {
                    let z77 = new ProteusClassicBtn(this, { label: 'AC', widthVal: 36,
                        onAction: () => {
                            this.amType = 1;
                            this.amUnit = 'mA AC';
                            this.appService.instruments.setAmmeterType(AmmeterType.AC);
                        } }, undefined, x77, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 879, col: 9 });
                    ViewPU.create(z77);
                    let a78 = () => {
                        return {
                            label: 'AC',
                            widthVal: 36,
                            onAction: () => {
                                this.amType = 1;
                                this.amUnit = 'mA AC';
                                this.appService.instruments.setAmmeterType(AmmeterType.AC);
                            }
                        };
                    };
                    z77.paramsGenerator_ = a78;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(x77, {
                        label: 'AC', widthVal: 36
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        this.observeComponentCreation2((v77, w77) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((t77, u77) => {
            Text.create(`量程: ${this.amRange}`);
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
        }, Text);
        Text.pop();
        Row.pop();
        this.observeComponentCreation2((r77, s77) => {
            Column.create();
            Column.layoutWeight(1);
            Column.width('100%');
            Column.justifyContent(FlexAlign.Center);
        }, Column);
        this.ReadoutDisplay.bind(this)('CURRENT', this.amReading, this.amUnit);
        Column.pop();
        this.observeComponentCreation2((p77, q77) => {
            Row.create({ space: 8 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, bottom: 8 });
        }, Row);
        {
            this.observeComponentCreation2((j77, k77) => {
                if (k77) {
                    let l77 = new ProteusClassicBtn(this, { label: '自动量程', widthVal: '42%', onAction: () => {
                            this.appService.instruments.ammeterAutoRange();
                            const o77 = this.appService.instruments.getAmmeterConfig();
                            if (o77.success && o77.data) {
                                this.amRange = `${o77.data.range}mA`;
                            }
                        } }, undefined, j77, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 897, col: 9 });
                    ViewPU.create(l77);
                    let m77 = () => {
                        return {
                            label: '自动量程',
                            widthVal: '42%',
                            onAction: () => {
                                this.appService.instruments.ammeterAutoRange();
                                const n77 = this.appService.instruments.getAmmeterConfig();
                                if (n77.success && n77.data) {
                                    this.amRange = `${n77.data.range}mA`;
                                }
                            }
                        };
                    };
                    l77.paramsGenerator_ = m77;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(j77, {
                        label: '自动量程', widthVal: '42%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((b77, c77) => {
                if (c77) {
                    let d77 = new ProteusClassicBtn(this, { label: '测量', widthVal: '42%', onAction: () => {
                            const h77 = this.appService.instruments.ammeterMeasure();
                            if (h77.success && h77.data !== undefined) {
                                this.amReading = h77.data.toFixed(2);
                            }
                            const i77 = this.appService.instruments.getAmmeterConfig();
                            if (i77.success && i77.data) {
                                this.amRange = `${i77.data.range}mA`;
                                this.amUnit = i77.data.unit;
                            }
                            this.statusMessage = `电流表: ${this.amReading} ${this.amUnit}`;
                        } }, undefined, b77, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 905, col: 9 });
                    ViewPU.create(d77);
                    let e77 = () => {
                        return {
                            label: '测量',
                            widthVal: '42%',
                            onAction: () => {
                                const f77 = this.appService.instruments.ammeterMeasure();
                                if (f77.success && f77.data !== undefined) {
                                    this.amReading = f77.data.toFixed(2);
                                }
                                const g77 = this.appService.instruments.getAmmeterConfig();
                                if (g77.success && g77.data) {
                                    this.amRange = `${g77.data.range}mA`;
                                    this.amUnit = g77.data.unit;
                                }
                                this.statusMessage = `电流表: ${this.amReading} ${this.amUnit}`;
                            }
                        };
                    };
                    d77.paramsGenerator_ = e77;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(b77, {
                        label: '测量', widthVal: '42%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        Column.pop();
    }
    PowerMeterPanel(n76 = null) {
        this.observeComponentCreation2((y76, z76) => {
            Column.create({ space: 6 });
            Column.width('100%');
            Column.height('100%');
        }, Column);
        this.observeComponentCreation2((w76, x76) => {
            __Common__.create();
            __Common__.margin({ left: 8, right: 8, top: 8 });
        }, __Common__);
        {
            this.observeComponentCreation2((q76, r76) => {
                if (r76) {
                    let s76 = new ProteusClassicBtn(this, {
                        label: '开始测量', widthVal: '86%',
                        onAction: () => {
                            const v76 = this.appService.instruments.powerMeterMeasure();
                            if (v76.success && v76.data) {
                                this.pmVoltage = v76.data.voltage.toFixed(3);
                                this.pmCurrent = (v76.data.current * 1000).toFixed(2);
                                this.pmPower = (v76.data.power * 1000).toFixed(1);
                                this.pmPF = v76.data.powerFactor.toFixed(2);
                            }
                            this.statusMessage = `功率表: ${this.pmPower}mW, PF=${this.pmPF}`;
                        }
                    }, undefined, q76, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 928, col: 7 });
                    ViewPU.create(s76);
                    let t76 = () => {
                        return {
                            label: '开始测量',
                            widthVal: '86%',
                            onAction: () => {
                                const u76 = this.appService.instruments.powerMeterMeasure();
                                if (u76.success && u76.data) {
                                    this.pmVoltage = u76.data.voltage.toFixed(3);
                                    this.pmCurrent = (u76.data.current * 1000).toFixed(2);
                                    this.pmPower = (u76.data.power * 1000).toFixed(1);
                                    this.pmPF = u76.data.powerFactor.toFixed(2);
                                }
                                this.statusMessage = `功率表: ${this.pmPower}mW, PF=${this.pmPF}`;
                            }
                        };
                    };
                    s76.paramsGenerator_ = t76;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(q76, {
                        label: '开始测量', widthVal: '86%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        __Common__.pop();
        this.observeComponentCreation2((o76, p76) => {
            Column.create({ space: 6 });
            Column.layoutWeight(1);
            Column.width('100%');
            Column.justifyContent(FlexAlign.Center);
            Column.alignItems(HorizontalAlign.Center);
        }, Column);
        this.PmRow.bind(this)('电压', this.pmVoltage, 'V');
        this.PmRow.bind(this)('电流', this.pmCurrent, 'mA');
        this.PmRow.bind(this)('功率', this.pmPower, 'mW');
        this.PmRow.bind(this)('功率因数', this.pmPF, '');
        Column.pop();
        Column.pop();
    }
    PmRow(z75: string, a76: string, b76: string, c76 = null) {
        this.observeComponentCreation2((l76, m76) => {
            Row.create();
            Row.width('82%');
        }, Row);
        this.observeComponentCreation2((j76, k76) => {
            Text.create(z75);
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width(56);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((h76, i76) => {
            Text.create(a76);
            Text.fontSize(22);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Bold);
            Text.fontFamily('monospace');
        }, Text);
        Text.pop();
        this.observeComponentCreation2((d76, e76) => {
            If.create();
            if (b76.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((f76, g76) => {
                        Text.create(b76);
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                        Text.margin({ left: 4 });
                    }, Text);
                    Text.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        Row.pop();
    }
    FreqCounterPanel(u74 = null) {
        this.observeComponentCreation2((x75, y75) => {
            Column.create({ space: 6 });
            Column.width('100%');
            Column.height('100%');
        }, Column);
        this.observeComponentCreation2((v75, w75) => {
            Row.create({ space: 4 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 6 });
        }, Row);
        {
            this.observeComponentCreation2((r75, s75) => {
                if (s75) {
                    let t75 = new ProteusClassicBtn(this, { label: '0.1s', widthVal: 40,
                        onAction: () => {
                            this.fcGateTime = 0.1;
                            this.appService.instruments.freqCounterSetGateTime(0.1);
                        } }, undefined, r75, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 981, col: 9 });
                    ViewPU.create(t75);
                    let u75 = () => {
                        return {
                            label: '0.1s',
                            widthVal: 40,
                            onAction: () => {
                                this.fcGateTime = 0.1;
                                this.appService.instruments.freqCounterSetGateTime(0.1);
                            }
                        };
                    };
                    t75.paramsGenerator_ = u75;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(r75, {
                        label: '0.1s', widthVal: 40
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((n75, o75) => {
                if (o75) {
                    let p75 = new ProteusClassicBtn(this, { label: '1s', widthVal: 36,
                        onAction: () => {
                            this.fcGateTime = 1.0;
                            this.appService.instruments.freqCounterSetGateTime(1.0);
                        } }, undefined, n75, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 986, col: 9 });
                    ViewPU.create(p75);
                    let q75 = () => {
                        return {
                            label: '1s',
                            widthVal: 36,
                            onAction: () => {
                                this.fcGateTime = 1.0;
                                this.appService.instruments.freqCounterSetGateTime(1.0);
                            }
                        };
                    };
                    p75.paramsGenerator_ = q75;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(n75, {
                        label: '1s', widthVal: 36
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((j75, k75) => {
                if (k75) {
                    let l75 = new ProteusClassicBtn(this, { label: '10s', widthVal: 36,
                        onAction: () => {
                            this.fcGateTime = 10;
                            this.appService.instruments.freqCounterSetGateTime(10);
                        } }, undefined, j75, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 991, col: 9 });
                    ViewPU.create(l75);
                    let m75 = () => {
                        return {
                            label: '10s',
                            widthVal: 36,
                            onAction: () => {
                                this.fcGateTime = 10;
                                this.appService.instruments.freqCounterSetGateTime(10);
                            }
                        };
                    };
                    l75.paramsGenerator_ = m75;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(j75, {
                        label: '10s', widthVal: 36
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        this.observeComponentCreation2((h75, i75) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((f75, g75) => {
            Text.create(`闸门: ${this.fcGateTime}s`);
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
        }, Text);
        Text.pop();
        Row.pop();
        this.observeComponentCreation2((d75, e75) => {
            Column.create();
            Column.layoutWeight(1);
            Column.width('100%');
            Column.justifyContent(FlexAlign.Center);
        }, Column);
        this.ReadoutDisplay.bind(this)('FREQUENCY', this.fcReading, `Gate: ${this.fcGateTime}s`);
        Column.pop();
        this.observeComponentCreation2((b75, c75) => {
            __Common__.create();
            __Common__.margin({ left: 8, right: 8, bottom: 8 });
        }, __Common__);
        {
            this.observeComponentCreation2((v74, w74) => {
                if (w74) {
                    let x74 = new ProteusClassicBtn(this, {
                        label: '测量频率', widthVal: '86%',
                        onAction: () => {
                            const a75 = this.appService.instruments.freqCounterMeasure();
                            if (a75.success && a75.data !== undefined) {
                                if (a75.data >= 1e6) {
                                    this.fcReading = `${(a75.data / 1e6).toFixed(3)} MHz`;
                                }
                                else if (a75.data >= 1e3) {
                                    this.fcReading = `${(a75.data / 1e3).toFixed(1)} kHz`;
                                }
                                else {
                                    this.fcReading = `${a75.data.toFixed(1)} Hz`;
                                }
                            }
                            this.statusMessage = `频率计: ${this.fcReading}`;
                        }
                    }, undefined, v74, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1008, col: 7 });
                    ViewPU.create(x74);
                    let y74 = () => {
                        return {
                            label: '测量频率',
                            widthVal: '86%',
                            onAction: () => {
                                const z74 = this.appService.instruments.freqCounterMeasure();
                                if (z74.success && z74.data !== undefined) {
                                    if (z74.data >= 1e6) {
                                        this.fcReading = `${(z74.data / 1e6).toFixed(3)} MHz`;
                                    }
                                    else if (z74.data >= 1e3) {
                                        this.fcReading = `${(z74.data / 1e3).toFixed(1)} kHz`;
                                    }
                                    else {
                                        this.fcReading = `${z74.data.toFixed(1)} Hz`;
                                    }
                                }
                                this.statusMessage = `频率计: ${this.fcReading}`;
                            }
                        };
                    };
                    x74.paramsGenerator_ = y74;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(v74, {
                        label: '测量频率', widthVal: '86%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        __Common__.pop();
        Column.pop();
    }
    private updateCursorMeasure(): void {
        const t74 = this.appService.instruments.measureCursors(this.cursorAIdx, this.cursorBIdx);
        if (t74.success && t74.data) {
            this.cursorMeasureText = `ΔT=${(t74.data.deltaTime * 1e6).toFixed(2)}μs  ΔV=${t74.data.deltaVoltage.toFixed(3)}V  f=${t74.data.frequency.toFixed(1)}Hz`;
        }
    }
    private refreshDecodedFrames(): void {
        const p74 = this.appService.instruments.getDecodedFrames();
        if (p74.length === 0) {
            this.decodedFramesText = '无解码帧';
            return;
        }
        const q74: string[] = [];
        for (let r74 = 0; r74 < Math.min(p74.length, 8); r74++) {
            const s74 = p74[r74];
            q74.push(`[${s74.protocol}] ${s74.data} @${(s74.timestamp * 1e6).toFixed(1)}μs`);
        }
        this.decodedFramesText = q74.join('\n');
    }
    rerender() {
        this.updateDirtyElements();
    }
}
