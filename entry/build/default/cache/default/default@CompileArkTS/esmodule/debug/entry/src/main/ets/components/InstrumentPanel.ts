if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface InstrumentPanel_Params {
    selectedComponentId?: string;
    simWaveTick?: number;
    simRunning?: boolean;
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
    sigAmp?: string;
    sigOffset?: string;
    sigDuty?: string;
    uartHex?: string;
    uartLog?: string;
    waveTimeData?: number[];
    waveVoltageData?: number[];
    waveCh2TimeData?: number[];
    waveCh2Data?: number[];
    oscCanvasHeight?: number;
    meterCanvasHeight?: number;
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
    vmWaveTime?: number[];
    vmWaveData?: number[];
    vmWaveFrame?: number;
    vmTPerDiv?: number;
    amType?: number;
    amReading?: string;
    amRange?: string;
    amUnit?: string;
    amWaveTime?: number[];
    amWaveData?: number[];
    amWaveFrame?: number;
    amTPerDiv?: number;
    pmVoltage?: string;
    pmCurrent?: string;
    pmPower?: string;
    pmPF?: string;
    fcReading?: string;
    fcGateTime?: number;
    fcWaveTime?: number[];
    fcWaveData?: number[];
    fcWaveFrame?: number;
    fcTPerDiv?: number;
    oscAutoFit?: boolean;
    oscFftMode?: boolean;
    oscStatsText?: string;
    oscTriggerHold?: boolean;
    oscLiveVolts?: string;
    oscFrameId?: number;
    uiPulse?: number;
    appService?: AppService;
    timebases?: OscTimebase[];
    timebaseLabels?: string[];
    selTimebase?: SelectValueOption[];
    voltageScales?: OscVoltageScale[];
    voltagePerDiv?: number[];
    voltageScaleLabels?: string[];
    selVScale?: SelectValueOption[];
    selLogicCh?: SelectValueOption[];
    autoRefreshTimer?: number;
    uiLogTick?: number;
    refreshTickCount?: number;
    lastRefreshWallMs?: number;
    refreshIntervalMs?: number;
    subTabLabels?: string[];
}
interface LivePmRow_Params {
    label?: string;
    value?: string;
    unit?: string;
    pulse?: number;
}
interface LiveReadout_Params {
    label?: string;
    value?: string;
    unit?: string;
    pulse?: number;
}
import { AppService } from "@bundle:com.elecdraw.aischsim/entry/ets/services/AppService";
import { OscTimebase, OscVoltageScale, CouplingMode, TriggerMode, CaptureMode, MathChannelOp, MultimeterMode, SignalWaveform, LogicDecodeProtocol, VoltmeterType, AmmeterType, traceUiRefresh, traceUiSelect, traceInstrUi, traceLaUiChannels, detectInstrumentKind, instrumentSubTabForKind, UnitParser } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { ProteusClassicBtn, ProteusChipGrid, ProteusTextInput } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import { ProteusColors, ProteusDimens, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import { OscilloscopeWaveCanvas } from "@bundle:com.elecdraw.aischsim/entry/ets/components/OscilloscopeWaveCanvas";
import { LogicAnalyzerWaveCanvas } from "@bundle:com.elecdraw.aischsim/entry/ets/components/LogicAnalyzerWaveCanvas";
import { InstrumentWaveExpandStore } from "@bundle:com.elecdraw.aischsim/entry/ets/components/InstrumentWaveExpandStore";
interface SelectValueOption {
    value: string;
}
class LiveReadout extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__label = new SynchedPropertySimpleOneWayPU(params.label, this, "label");
        this.__value = new SynchedPropertySimpleOneWayPU(params.value, this, "value");
        this.__unit = new SynchedPropertySimpleOneWayPU(params.unit, this, "unit");
        this.__pulse = new SynchedPropertySimpleOneWayPU(params.pulse, this, "pulse");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: LiveReadout_Params) {
        if (params.label === undefined) {
            this.__label.set('');
        }
        if (params.value === undefined) {
            this.__value.set('--');
        }
        if (params.unit === undefined) {
            this.__unit.set('');
        }
        if (params.pulse === undefined) {
            this.__pulse.set(0);
        }
    }
    updateStateVars(params: LiveReadout_Params) {
        this.__label.reset(params.label);
        this.__value.reset(params.value);
        this.__unit.reset(params.unit);
        this.__pulse.reset(params.pulse);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__label.purgeDependencyOnElmtId(rmElmtId);
        this.__value.purgeDependencyOnElmtId(rmElmtId);
        this.__unit.purgeDependencyOnElmtId(rmElmtId);
        this.__pulse.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__label.aboutToBeDeleted();
        this.__value.aboutToBeDeleted();
        this.__unit.aboutToBeDeleted();
        this.__pulse.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __label: SynchedPropertySimpleOneWayPU<string>;
    get label() {
        return this.__label.get();
    }
    set label(newValue: string) {
        this.__label.set(newValue);
    }
    private __value: SynchedPropertySimpleOneWayPU<string>;
    get value() {
        return this.__value.get();
    }
    set value(newValue: string) {
        this.__value.set(newValue);
    }
    private __unit: SynchedPropertySimpleOneWayPU<string>;
    get unit() {
        return this.__unit.get();
    }
    set unit(newValue: string) {
        this.__unit.set(newValue);
    }
    private __pulse: SynchedPropertySimpleOneWayPU<number>;
    get pulse() {
        return this.__pulse.get();
    }
    set pulse(newValue: number) {
        this.__pulse.set(newValue);
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('92%');
            Column.padding({ top: 10, bottom: 10 });
            Column.backgroundColor(ProteusColors.INPUT_READONLY_BG);
            Column.border({ width: 1, color: ProteusColors.DIVIDER });
            Column.alignItems(HorizontalAlign.Center);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.label);
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.fontFamily('monospace');
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.value);
            Text.fontSize(28);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Bold);
            Text.fontFamily('monospace');
            Text.key(`v-${this.pulse}-${this.value}`);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.unit.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.unit);
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
    rerender() {
        this.updateDirtyElements();
    }
}
class LivePmRow extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__label = new SynchedPropertySimpleOneWayPU(params.label, this, "label");
        this.__value = new SynchedPropertySimpleOneWayPU(params.value, this, "value");
        this.__unit = new SynchedPropertySimpleOneWayPU(params.unit, this, "unit");
        this.__pulse = new SynchedPropertySimpleOneWayPU(params.pulse, this, "pulse");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: LivePmRow_Params) {
        if (params.label === undefined) {
            this.__label.set('');
        }
        if (params.value === undefined) {
            this.__value.set('--');
        }
        if (params.unit === undefined) {
            this.__unit.set('');
        }
        if (params.pulse === undefined) {
            this.__pulse.set(0);
        }
    }
    updateStateVars(params: LivePmRow_Params) {
        this.__label.reset(params.label);
        this.__value.reset(params.value);
        this.__unit.reset(params.unit);
        this.__pulse.reset(params.pulse);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__label.purgeDependencyOnElmtId(rmElmtId);
        this.__value.purgeDependencyOnElmtId(rmElmtId);
        this.__unit.purgeDependencyOnElmtId(rmElmtId);
        this.__pulse.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__label.aboutToBeDeleted();
        this.__value.aboutToBeDeleted();
        this.__unit.aboutToBeDeleted();
        this.__pulse.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __label: SynchedPropertySimpleOneWayPU<string>;
    get label() {
        return this.__label.get();
    }
    set label(newValue: string) {
        this.__label.set(newValue);
    }
    private __value: SynchedPropertySimpleOneWayPU<string>;
    get value() {
        return this.__value.get();
    }
    set value(newValue: string) {
        this.__value.set(newValue);
    }
    private __unit: SynchedPropertySimpleOneWayPU<string>;
    get unit() {
        return this.__unit.get();
    }
    set unit(newValue: string) {
        this.__unit.set(newValue);
    }
    private __pulse: SynchedPropertySimpleOneWayPU<number>;
    get pulse() {
        return this.__pulse.get();
    }
    set pulse(newValue: number) {
        this.__pulse.set(newValue);
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('82%');
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.label);
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width(56);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.value);
            Text.fontSize(22);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Bold);
            Text.fontFamily('monospace');
            Text.key(`pm-${this.pulse}-${this.value}`);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.unit.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.unit);
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
    rerender() {
        this.updateDirtyElements();
    }
}
export class InstrumentPanel extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__selectedComponentId = new SynchedPropertySimpleOneWayPU(params.selectedComponentId, this, "selectedComponentId");
        this.__simWaveTick = new SynchedPropertySimpleOneWayPU(params.simWaveTick, this, "simWaveTick");
        this.__simRunning = new SynchedPropertySimpleOneWayPU(params.simRunning, this, "simRunning");
        this.__statusMessage = new SynchedPropertySimpleTwoWayPU(params.statusMessage, this, "statusMessage");
        this.__subTab = new ObservedPropertySimplePU(0, this, "subTab");
        this.__selectionRefDes = new ObservedPropertySimplePU('', this, "selectionRefDes");
        this.__selectionLibraryId = new ObservedPropertySimplePU('', this, "selectionLibraryId");
        this.__timebaseIdx = new ObservedPropertySimplePU(3, this, "timebaseIdx");
        this.__voltageScaleIdx = new ObservedPropertySimplePU(5, this, "voltageScaleIdx");
        this.__triggerLevel = new ObservedPropertySimplePU(2.0, this, "triggerLevel");
        this.__logicChannels = new ObservedPropertySimplePU(8, this, "logicChannels");
        this.__threshold = new ObservedPropertySimplePU(1500, this, "threshold");
        this.__mmReading = new ObservedPropertySimplePU('----', this, "mmReading");
        this.__mmMode = new ObservedPropertySimplePU('DCV', this, "mmMode");
        this.__freq = new ObservedPropertySimplePU('1kHz', this, "freq");
        this.__sigAmp = new ObservedPropertySimplePU('1V', this, "sigAmp");
        this.__sigOffset = new ObservedPropertySimplePU('0V', this, "sigOffset");
        this.__sigDuty = new ObservedPropertySimplePU('50', this, "sigDuty");
        this.__uartHex = new ObservedPropertySimplePU('55 AA', this, "uartHex");
        this.__uartLog = new ObservedPropertySimplePU('', this, "uartLog");
        this.__waveTimeData = new ObservedPropertyObjectPU([], this, "waveTimeData");
        this.__waveVoltageData = new ObservedPropertyObjectPU([], this, "waveVoltageData");
        this.__waveCh2TimeData = new ObservedPropertyObjectPU([], this, "waveCh2TimeData");
        this.__waveCh2Data = new ObservedPropertyObjectPU([], this, "waveCh2Data");
        this.oscCanvasHeight = 160;
        this.meterCanvasHeight = 120;
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
        this.__vmWaveTime = new ObservedPropertyObjectPU([], this, "vmWaveTime");
        this.__vmWaveData = new ObservedPropertyObjectPU([], this, "vmWaveData");
        this.__vmWaveFrame = new ObservedPropertySimplePU(0, this, "vmWaveFrame");
        this.__vmTPerDiv = new ObservedPropertySimplePU(1e-3, this, "vmTPerDiv");
        this.__amType = new ObservedPropertySimplePU(0, this, "amType");
        this.__amReading = new ObservedPropertySimplePU('--.--', this, "amReading");
        this.__amRange = new ObservedPropertySimplePU('200mA', this, "amRange");
        this.__amUnit = new ObservedPropertySimplePU('mA DC', this, "amUnit");
        this.__amWaveTime = new ObservedPropertyObjectPU([], this, "amWaveTime");
        this.__amWaveData = new ObservedPropertyObjectPU([], this, "amWaveData");
        this.__amWaveFrame = new ObservedPropertySimplePU(0, this, "amWaveFrame");
        this.__amTPerDiv = new ObservedPropertySimplePU(1e-3, this, "amTPerDiv");
        this.__pmVoltage = new ObservedPropertySimplePU('--', this, "pmVoltage");
        this.__pmCurrent = new ObservedPropertySimplePU('--', this, "pmCurrent");
        this.__pmPower = new ObservedPropertySimplePU('--', this, "pmPower");
        this.__pmPF = new ObservedPropertySimplePU('--', this, "pmPF");
        this.__fcReading = new ObservedPropertySimplePU('----', this, "fcReading");
        this.__fcGateTime = new ObservedPropertySimplePU(1.0, this, "fcGateTime");
        this.__fcWaveTime = new ObservedPropertyObjectPU([], this, "fcWaveTime");
        this.__fcWaveData = new ObservedPropertyObjectPU([], this, "fcWaveData");
        this.__fcWaveFrame = new ObservedPropertySimplePU(0, this, "fcWaveFrame");
        this.__fcTPerDiv = new ObservedPropertySimplePU(1e-3, this, "fcTPerDiv");
        this.__oscAutoFit = new ObservedPropertySimplePU(true, this, "oscAutoFit");
        this.__oscFftMode = new ObservedPropertySimplePU(false, this, "oscFftMode");
        this.__oscStatsText = new ObservedPropertySimplePU('', this, "oscStatsText");
        this.__oscTriggerHold = new ObservedPropertySimplePU(false, this, "oscTriggerHold");
        this.__oscLiveVolts = new ObservedPropertySimplePU('--', this, "oscLiveVolts");
        this.__oscFrameId = new ObservedPropertySimplePU(0, this, "oscFrameId");
        this.__uiPulse = new ObservedPropertySimplePU(0, this, "uiPulse");
        this.appService = AppService.getInstance();
        this.timebases = [
            OscTimebase.NS_10, OscTimebase.US_1, OscTimebase.US_100,
            OscTimebase.MS_1, OscTimebase.MS_10, OscTimebase.MS_100,
            OscTimebase.S_1, OscTimebase.S_10
        ];
        this.timebaseLabels = [
            '10ns', '1us', '100us', '1ms', '10ms', '100ms', '1s', '10s'
        ];
        this.selTimebase = [
            { value: '10ns' }, { value: '1us' }, { value: '100us' },
            { value: '1ms' }, { value: '10ms' }, { value: '100ms' },
            { value: '1s' }, { value: '10s' }
        ];
        this.voltageScales = [
            OscVoltageScale.MV_1, OscVoltageScale.MV_50, OscVoltageScale.MV_100,
            OscVoltageScale.MV_200, OscVoltageScale.MV_500,
            OscVoltageScale.V_1, OscVoltageScale.V_2, OscVoltageScale.V_5,
            OscVoltageScale.V_10, OscVoltageScale.V_100
        ];
        this.voltagePerDiv = [0.001, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 100];
        this.voltageScaleLabels = [
            '1mV', '50mV', '100mV', '200mV', '500mV', '1V', '2V', '5V', '10V', '100V'
        ];
        this.selVScale = [
            { value: '1mV' }, { value: '50mV' }, { value: '100mV' },
            { value: '200mV' }, { value: '500mV' },
            { value: '1V' }, { value: '2V' }, { value: '5V' },
            { value: '10V' }, { value: '100V' }
        ];
        this.selLogicCh = [
            { value: '8' }, { value: '16' }, { value: '32' }
        ];
        this.autoRefreshTimer = -1;
        this.uiLogTick = 0;
        this.refreshTickCount = 0;
        this.lastRefreshWallMs = 0;
        this.refreshIntervalMs = 200;
        this.subTabLabels = ['示波', '逻辑', '万用', '信号', '串口', '电压', '电流', '功率', '频率'];
        this.setInitiallyProvidedValue(params);
        this.declareWatch("selectedComponentId", this.onSelectionChange);
        this.declareWatch("simWaveTick", this.onSimWaveTick);
        this.declareWatch("simRunning", this.onSimRunningChange);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: InstrumentPanel_Params) {
        if (params.selectedComponentId === undefined) {
            this.__selectedComponentId.set('');
        }
        if (params.simWaveTick === undefined) {
            this.__simWaveTick.set(0);
        }
        if (params.simRunning === undefined) {
            this.__simRunning.set(false);
        }
        if (params.subTab !== undefined) {
            this.subTab = params.subTab;
        }
        if (params.selectionRefDes !== undefined) {
            this.selectionRefDes = params.selectionRefDes;
        }
        if (params.selectionLibraryId !== undefined) {
            this.selectionLibraryId = params.selectionLibraryId;
        }
        if (params.timebaseIdx !== undefined) {
            this.timebaseIdx = params.timebaseIdx;
        }
        if (params.voltageScaleIdx !== undefined) {
            this.voltageScaleIdx = params.voltageScaleIdx;
        }
        if (params.triggerLevel !== undefined) {
            this.triggerLevel = params.triggerLevel;
        }
        if (params.logicChannels !== undefined) {
            this.logicChannels = params.logicChannels;
        }
        if (params.threshold !== undefined) {
            this.threshold = params.threshold;
        }
        if (params.mmReading !== undefined) {
            this.mmReading = params.mmReading;
        }
        if (params.mmMode !== undefined) {
            this.mmMode = params.mmMode;
        }
        if (params.freq !== undefined) {
            this.freq = params.freq;
        }
        if (params.sigAmp !== undefined) {
            this.sigAmp = params.sigAmp;
        }
        if (params.sigOffset !== undefined) {
            this.sigOffset = params.sigOffset;
        }
        if (params.sigDuty !== undefined) {
            this.sigDuty = params.sigDuty;
        }
        if (params.uartHex !== undefined) {
            this.uartHex = params.uartHex;
        }
        if (params.uartLog !== undefined) {
            this.uartLog = params.uartLog;
        }
        if (params.waveTimeData !== undefined) {
            this.waveTimeData = params.waveTimeData;
        }
        if (params.waveVoltageData !== undefined) {
            this.waveVoltageData = params.waveVoltageData;
        }
        if (params.waveCh2TimeData !== undefined) {
            this.waveCh2TimeData = params.waveCh2TimeData;
        }
        if (params.waveCh2Data !== undefined) {
            this.waveCh2Data = params.waveCh2Data;
        }
        if (params.oscCanvasHeight !== undefined) {
            this.oscCanvasHeight = params.oscCanvasHeight;
        }
        if (params.meterCanvasHeight !== undefined) {
            this.meterCanvasHeight = params.meterCanvasHeight;
        }
        if (params.cursorAIdx !== undefined) {
            this.cursorAIdx = params.cursorAIdx;
        }
        if (params.cursorBIdx !== undefined) {
            this.cursorBIdx = params.cursorBIdx;
        }
        if (params.cursorMeasureText !== undefined) {
            this.cursorMeasureText = params.cursorMeasureText;
        }
        if (params.decodedFramesText !== undefined) {
            this.decodedFramesText = params.decodedFramesText;
        }
        if (params.logicChannelData !== undefined) {
            this.logicChannelData = params.logicChannelData;
        }
        if (params.logicSampleCount !== undefined) {
            this.logicSampleCount = params.logicSampleCount;
        }
        if (params.vmType !== undefined) {
            this.vmType = params.vmType;
        }
        if (params.vmReading !== undefined) {
            this.vmReading = params.vmReading;
        }
        if (params.vmRange !== undefined) {
            this.vmRange = params.vmRange;
        }
        if (params.vmUnit !== undefined) {
            this.vmUnit = params.vmUnit;
        }
        if (params.vmWaveTime !== undefined) {
            this.vmWaveTime = params.vmWaveTime;
        }
        if (params.vmWaveData !== undefined) {
            this.vmWaveData = params.vmWaveData;
        }
        if (params.vmWaveFrame !== undefined) {
            this.vmWaveFrame = params.vmWaveFrame;
        }
        if (params.vmTPerDiv !== undefined) {
            this.vmTPerDiv = params.vmTPerDiv;
        }
        if (params.amType !== undefined) {
            this.amType = params.amType;
        }
        if (params.amReading !== undefined) {
            this.amReading = params.amReading;
        }
        if (params.amRange !== undefined) {
            this.amRange = params.amRange;
        }
        if (params.amUnit !== undefined) {
            this.amUnit = params.amUnit;
        }
        if (params.amWaveTime !== undefined) {
            this.amWaveTime = params.amWaveTime;
        }
        if (params.amWaveData !== undefined) {
            this.amWaveData = params.amWaveData;
        }
        if (params.amWaveFrame !== undefined) {
            this.amWaveFrame = params.amWaveFrame;
        }
        if (params.amTPerDiv !== undefined) {
            this.amTPerDiv = params.amTPerDiv;
        }
        if (params.pmVoltage !== undefined) {
            this.pmVoltage = params.pmVoltage;
        }
        if (params.pmCurrent !== undefined) {
            this.pmCurrent = params.pmCurrent;
        }
        if (params.pmPower !== undefined) {
            this.pmPower = params.pmPower;
        }
        if (params.pmPF !== undefined) {
            this.pmPF = params.pmPF;
        }
        if (params.fcReading !== undefined) {
            this.fcReading = params.fcReading;
        }
        if (params.fcGateTime !== undefined) {
            this.fcGateTime = params.fcGateTime;
        }
        if (params.fcWaveTime !== undefined) {
            this.fcWaveTime = params.fcWaveTime;
        }
        if (params.fcWaveData !== undefined) {
            this.fcWaveData = params.fcWaveData;
        }
        if (params.fcWaveFrame !== undefined) {
            this.fcWaveFrame = params.fcWaveFrame;
        }
        if (params.fcTPerDiv !== undefined) {
            this.fcTPerDiv = params.fcTPerDiv;
        }
        if (params.oscAutoFit !== undefined) {
            this.oscAutoFit = params.oscAutoFit;
        }
        if (params.oscFftMode !== undefined) {
            this.oscFftMode = params.oscFftMode;
        }
        if (params.oscStatsText !== undefined) {
            this.oscStatsText = params.oscStatsText;
        }
        if (params.oscTriggerHold !== undefined) {
            this.oscTriggerHold = params.oscTriggerHold;
        }
        if (params.oscLiveVolts !== undefined) {
            this.oscLiveVolts = params.oscLiveVolts;
        }
        if (params.oscFrameId !== undefined) {
            this.oscFrameId = params.oscFrameId;
        }
        if (params.uiPulse !== undefined) {
            this.uiPulse = params.uiPulse;
        }
        if (params.appService !== undefined) {
            this.appService = params.appService;
        }
        if (params.timebases !== undefined) {
            this.timebases = params.timebases;
        }
        if (params.timebaseLabels !== undefined) {
            this.timebaseLabels = params.timebaseLabels;
        }
        if (params.selTimebase !== undefined) {
            this.selTimebase = params.selTimebase;
        }
        if (params.voltageScales !== undefined) {
            this.voltageScales = params.voltageScales;
        }
        if (params.voltagePerDiv !== undefined) {
            this.voltagePerDiv = params.voltagePerDiv;
        }
        if (params.voltageScaleLabels !== undefined) {
            this.voltageScaleLabels = params.voltageScaleLabels;
        }
        if (params.selVScale !== undefined) {
            this.selVScale = params.selVScale;
        }
        if (params.selLogicCh !== undefined) {
            this.selLogicCh = params.selLogicCh;
        }
        if (params.autoRefreshTimer !== undefined) {
            this.autoRefreshTimer = params.autoRefreshTimer;
        }
        if (params.uiLogTick !== undefined) {
            this.uiLogTick = params.uiLogTick;
        }
        if (params.refreshTickCount !== undefined) {
            this.refreshTickCount = params.refreshTickCount;
        }
        if (params.lastRefreshWallMs !== undefined) {
            this.lastRefreshWallMs = params.lastRefreshWallMs;
        }
        if (params.refreshIntervalMs !== undefined) {
            this.refreshIntervalMs = params.refreshIntervalMs;
        }
        if (params.subTabLabels !== undefined) {
            this.subTabLabels = params.subTabLabels;
        }
    }
    updateStateVars(params: InstrumentPanel_Params) {
        this.__selectedComponentId.reset(params.selectedComponentId);
        this.__simWaveTick.reset(params.simWaveTick);
        this.__simRunning.reset(params.simRunning);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__selectedComponentId.purgeDependencyOnElmtId(rmElmtId);
        this.__simWaveTick.purgeDependencyOnElmtId(rmElmtId);
        this.__simRunning.purgeDependencyOnElmtId(rmElmtId);
        this.__statusMessage.purgeDependencyOnElmtId(rmElmtId);
        this.__subTab.purgeDependencyOnElmtId(rmElmtId);
        this.__selectionRefDes.purgeDependencyOnElmtId(rmElmtId);
        this.__selectionLibraryId.purgeDependencyOnElmtId(rmElmtId);
        this.__timebaseIdx.purgeDependencyOnElmtId(rmElmtId);
        this.__voltageScaleIdx.purgeDependencyOnElmtId(rmElmtId);
        this.__triggerLevel.purgeDependencyOnElmtId(rmElmtId);
        this.__logicChannels.purgeDependencyOnElmtId(rmElmtId);
        this.__threshold.purgeDependencyOnElmtId(rmElmtId);
        this.__mmReading.purgeDependencyOnElmtId(rmElmtId);
        this.__mmMode.purgeDependencyOnElmtId(rmElmtId);
        this.__freq.purgeDependencyOnElmtId(rmElmtId);
        this.__sigAmp.purgeDependencyOnElmtId(rmElmtId);
        this.__sigOffset.purgeDependencyOnElmtId(rmElmtId);
        this.__sigDuty.purgeDependencyOnElmtId(rmElmtId);
        this.__uartHex.purgeDependencyOnElmtId(rmElmtId);
        this.__uartLog.purgeDependencyOnElmtId(rmElmtId);
        this.__waveTimeData.purgeDependencyOnElmtId(rmElmtId);
        this.__waveVoltageData.purgeDependencyOnElmtId(rmElmtId);
        this.__waveCh2TimeData.purgeDependencyOnElmtId(rmElmtId);
        this.__waveCh2Data.purgeDependencyOnElmtId(rmElmtId);
        this.__cursorAIdx.purgeDependencyOnElmtId(rmElmtId);
        this.__cursorBIdx.purgeDependencyOnElmtId(rmElmtId);
        this.__cursorMeasureText.purgeDependencyOnElmtId(rmElmtId);
        this.__decodedFramesText.purgeDependencyOnElmtId(rmElmtId);
        this.__logicChannelData.purgeDependencyOnElmtId(rmElmtId);
        this.__logicSampleCount.purgeDependencyOnElmtId(rmElmtId);
        this.__vmType.purgeDependencyOnElmtId(rmElmtId);
        this.__vmReading.purgeDependencyOnElmtId(rmElmtId);
        this.__vmRange.purgeDependencyOnElmtId(rmElmtId);
        this.__vmUnit.purgeDependencyOnElmtId(rmElmtId);
        this.__vmWaveTime.purgeDependencyOnElmtId(rmElmtId);
        this.__vmWaveData.purgeDependencyOnElmtId(rmElmtId);
        this.__vmWaveFrame.purgeDependencyOnElmtId(rmElmtId);
        this.__vmTPerDiv.purgeDependencyOnElmtId(rmElmtId);
        this.__amType.purgeDependencyOnElmtId(rmElmtId);
        this.__amReading.purgeDependencyOnElmtId(rmElmtId);
        this.__amRange.purgeDependencyOnElmtId(rmElmtId);
        this.__amUnit.purgeDependencyOnElmtId(rmElmtId);
        this.__amWaveTime.purgeDependencyOnElmtId(rmElmtId);
        this.__amWaveData.purgeDependencyOnElmtId(rmElmtId);
        this.__amWaveFrame.purgeDependencyOnElmtId(rmElmtId);
        this.__amTPerDiv.purgeDependencyOnElmtId(rmElmtId);
        this.__pmVoltage.purgeDependencyOnElmtId(rmElmtId);
        this.__pmCurrent.purgeDependencyOnElmtId(rmElmtId);
        this.__pmPower.purgeDependencyOnElmtId(rmElmtId);
        this.__pmPF.purgeDependencyOnElmtId(rmElmtId);
        this.__fcReading.purgeDependencyOnElmtId(rmElmtId);
        this.__fcGateTime.purgeDependencyOnElmtId(rmElmtId);
        this.__fcWaveTime.purgeDependencyOnElmtId(rmElmtId);
        this.__fcWaveData.purgeDependencyOnElmtId(rmElmtId);
        this.__fcWaveFrame.purgeDependencyOnElmtId(rmElmtId);
        this.__fcTPerDiv.purgeDependencyOnElmtId(rmElmtId);
        this.__oscAutoFit.purgeDependencyOnElmtId(rmElmtId);
        this.__oscFftMode.purgeDependencyOnElmtId(rmElmtId);
        this.__oscStatsText.purgeDependencyOnElmtId(rmElmtId);
        this.__oscTriggerHold.purgeDependencyOnElmtId(rmElmtId);
        this.__oscLiveVolts.purgeDependencyOnElmtId(rmElmtId);
        this.__oscFrameId.purgeDependencyOnElmtId(rmElmtId);
        this.__uiPulse.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__selectedComponentId.aboutToBeDeleted();
        this.__simWaveTick.aboutToBeDeleted();
        this.__simRunning.aboutToBeDeleted();
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
        this.__sigAmp.aboutToBeDeleted();
        this.__sigOffset.aboutToBeDeleted();
        this.__sigDuty.aboutToBeDeleted();
        this.__uartHex.aboutToBeDeleted();
        this.__uartLog.aboutToBeDeleted();
        this.__waveTimeData.aboutToBeDeleted();
        this.__waveVoltageData.aboutToBeDeleted();
        this.__waveCh2TimeData.aboutToBeDeleted();
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
        this.__vmWaveTime.aboutToBeDeleted();
        this.__vmWaveData.aboutToBeDeleted();
        this.__vmWaveFrame.aboutToBeDeleted();
        this.__vmTPerDiv.aboutToBeDeleted();
        this.__amType.aboutToBeDeleted();
        this.__amReading.aboutToBeDeleted();
        this.__amRange.aboutToBeDeleted();
        this.__amUnit.aboutToBeDeleted();
        this.__amWaveTime.aboutToBeDeleted();
        this.__amWaveData.aboutToBeDeleted();
        this.__amWaveFrame.aboutToBeDeleted();
        this.__amTPerDiv.aboutToBeDeleted();
        this.__pmVoltage.aboutToBeDeleted();
        this.__pmCurrent.aboutToBeDeleted();
        this.__pmPower.aboutToBeDeleted();
        this.__pmPF.aboutToBeDeleted();
        this.__fcReading.aboutToBeDeleted();
        this.__fcGateTime.aboutToBeDeleted();
        this.__fcWaveTime.aboutToBeDeleted();
        this.__fcWaveData.aboutToBeDeleted();
        this.__fcWaveFrame.aboutToBeDeleted();
        this.__fcTPerDiv.aboutToBeDeleted();
        this.__oscAutoFit.aboutToBeDeleted();
        this.__oscFftMode.aboutToBeDeleted();
        this.__oscStatsText.aboutToBeDeleted();
        this.__oscTriggerHold.aboutToBeDeleted();
        this.__oscLiveVolts.aboutToBeDeleted();
        this.__oscFrameId.aboutToBeDeleted();
        this.__uiPulse.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __selectedComponentId: SynchedPropertySimpleOneWayPU<string>;
    get selectedComponentId() {
        return this.__selectedComponentId.get();
    }
    set selectedComponentId(newValue: string) {
        this.__selectedComponentId.set(newValue);
    }
    private __simWaveTick: SynchedPropertySimpleOneWayPU<number>;
    get simWaveTick() {
        return this.__simWaveTick.get();
    }
    set simWaveTick(newValue: number) {
        this.__simWaveTick.set(newValue);
    }
    /** 与主界面仿真运行态同步：停止后清定时器，避免 IDLE 仍刷 INSTR_UI */
    private __simRunning: SynchedPropertySimpleOneWayPU<boolean>;
    get simRunning() {
        return this.__simRunning.get();
    }
    set simRunning(newValue: boolean) {
        this.__simRunning.set(newValue);
    }
    private __statusMessage: SynchedPropertySimpleTwoWayPU<string>;
    get statusMessage() {
        return this.__statusMessage.get();
    }
    set statusMessage(newValue: string) {
        this.__statusMessage.set(newValue);
    }
    private __subTab: ObservedPropertySimplePU<number>;
    get subTab() {
        return this.__subTab.get();
    }
    set subTab(newValue: number) {
        this.__subTab.set(newValue);
    }
    private __selectionRefDes: ObservedPropertySimplePU<string>;
    get selectionRefDes() {
        return this.__selectionRefDes.get();
    }
    set selectionRefDes(newValue: string) {
        this.__selectionRefDes.set(newValue);
    }
    private __selectionLibraryId: ObservedPropertySimplePU<string>;
    get selectionLibraryId() {
        return this.__selectionLibraryId.get();
    }
    set selectionLibraryId(newValue: string) {
        this.__selectionLibraryId.set(newValue);
    }
    private __timebaseIdx: ObservedPropertySimplePU<number>; // MS_1 — good default for lab 1kHz AC
    get timebaseIdx() {
        return this.__timebaseIdx.get();
    }
    set timebaseIdx(newValue: number) {
        this.__timebaseIdx.set(newValue);
    }
    private __voltageScaleIdx: ObservedPropertySimplePU<number>; // V_1 — matches expanded scale list
    get voltageScaleIdx() {
        return this.__voltageScaleIdx.get();
    }
    set voltageScaleIdx(newValue: number) {
        this.__voltageScaleIdx.set(newValue);
    }
    private __triggerLevel: ObservedPropertySimplePU<number>;
    get triggerLevel() {
        return this.__triggerLevel.get();
    }
    set triggerLevel(newValue: number) {
        this.__triggerLevel.set(newValue);
    }
    private __logicChannels: ObservedPropertySimplePU<number>;
    get logicChannels() {
        return this.__logicChannels.get();
    }
    set logicChannels(newValue: number) {
        this.__logicChannels.set(newValue);
    }
    private __threshold: ObservedPropertySimplePU<number>;
    get threshold() {
        return this.__threshold.get();
    }
    set threshold(newValue: number) {
        this.__threshold.set(newValue);
    }
    private __mmReading: ObservedPropertySimplePU<string>;
    get mmReading() {
        return this.__mmReading.get();
    }
    set mmReading(newValue: string) {
        this.__mmReading.set(newValue);
    }
    private __mmMode: ObservedPropertySimplePU<string>;
    get mmMode() {
        return this.__mmMode.get();
    }
    set mmMode(newValue: string) {
        this.__mmMode.set(newValue);
    }
    private __freq: ObservedPropertySimplePU<string>;
    get freq() {
        return this.__freq.get();
    }
    set freq(newValue: string) {
        this.__freq.set(newValue);
    }
    private __sigAmp: ObservedPropertySimplePU<string>;
    get sigAmp() {
        return this.__sigAmp.get();
    }
    set sigAmp(newValue: string) {
        this.__sigAmp.set(newValue);
    }
    private __sigOffset: ObservedPropertySimplePU<string>;
    get sigOffset() {
        return this.__sigOffset.get();
    }
    set sigOffset(newValue: string) {
        this.__sigOffset.set(newValue);
    }
    private __sigDuty: ObservedPropertySimplePU<string>;
    get sigDuty() {
        return this.__sigDuty.get();
    }
    set sigDuty(newValue: string) {
        this.__sigDuty.set(newValue);
    }
    private __uartHex: ObservedPropertySimplePU<string>;
    get uartHex() {
        return this.__uartHex.get();
    }
    set uartHex(newValue: string) {
        this.__uartHex.set(newValue);
    }
    private __uartLog: ObservedPropertySimplePU<string>;
    get uartLog() {
        return this.__uartLog.get();
    }
    set uartLog(newValue: string) {
        this.__uartLog.set(newValue);
    }
    private __waveTimeData: ObservedPropertyObjectPU<number[]>;
    get waveTimeData() {
        return this.__waveTimeData.get();
    }
    set waveTimeData(newValue: number[]) {
        this.__waveTimeData.set(newValue);
    }
    private __waveVoltageData: ObservedPropertyObjectPU<number[]>;
    get waveVoltageData() {
        return this.__waveVoltageData.get();
    }
    set waveVoltageData(newValue: number[]) {
        this.__waveVoltageData.set(newValue);
    }
    private __waveCh2TimeData: ObservedPropertyObjectPU<number[]>;
    get waveCh2TimeData() {
        return this.__waveCh2TimeData.get();
    }
    set waveCh2TimeData(newValue: number[]) {
        this.__waveCh2TimeData.set(newValue);
    }
    private __waveCh2Data: ObservedPropertyObjectPU<number[]>;
    get waveCh2Data() {
        return this.__waveCh2Data.get();
    }
    set waveCh2Data(newValue: number[]) {
        this.__waveCh2Data.set(newValue);
    }
    /** 双通道波形区统一高度（时域 / FFT 一致）；双击可全屏放大 */
    private readonly oscCanvasHeight: number;
    private readonly meterCanvasHeight: number;
    private __cursorAIdx: ObservedPropertySimplePU<number>;
    get cursorAIdx() {
        return this.__cursorAIdx.get();
    }
    set cursorAIdx(newValue: number) {
        this.__cursorAIdx.set(newValue);
    }
    private __cursorBIdx: ObservedPropertySimplePU<number>;
    get cursorBIdx() {
        return this.__cursorBIdx.get();
    }
    set cursorBIdx(newValue: number) {
        this.__cursorBIdx.set(newValue);
    }
    private __cursorMeasureText: ObservedPropertySimplePU<string>;
    get cursorMeasureText() {
        return this.__cursorMeasureText.get();
    }
    set cursorMeasureText(newValue: string) {
        this.__cursorMeasureText.set(newValue);
    }
    private __decodedFramesText: ObservedPropertySimplePU<string>;
    get decodedFramesText() {
        return this.__decodedFramesText.get();
    }
    set decodedFramesText(newValue: string) {
        this.__decodedFramesText.set(newValue);
    }
    private __logicChannelData: ObservedPropertyObjectPU<number[][]>;
    get logicChannelData() {
        return this.__logicChannelData.get();
    }
    set logicChannelData(newValue: number[][]) {
        this.__logicChannelData.set(newValue);
    }
    private __logicSampleCount: ObservedPropertySimplePU<number>;
    get logicSampleCount() {
        return this.__logicSampleCount.get();
    }
    set logicSampleCount(newValue: number) {
        this.__logicSampleCount.set(newValue);
    }
    private __vmType: ObservedPropertySimplePU<number>;
    get vmType() {
        return this.__vmType.get();
    }
    set vmType(newValue: number) {
        this.__vmType.set(newValue);
    }
    private __vmReading: ObservedPropertySimplePU<string>;
    get vmReading() {
        return this.__vmReading.get();
    }
    set vmReading(newValue: string) {
        this.__vmReading.set(newValue);
    }
    private __vmRange: ObservedPropertySimplePU<string>;
    get vmRange() {
        return this.__vmRange.get();
    }
    set vmRange(newValue: string) {
        this.__vmRange.set(newValue);
    }
    private __vmUnit: ObservedPropertySimplePU<string>;
    get vmUnit() {
        return this.__vmUnit.get();
    }
    set vmUnit(newValue: string) {
        this.__vmUnit.set(newValue);
    }
    private __vmWaveTime: ObservedPropertyObjectPU<number[]>;
    get vmWaveTime() {
        return this.__vmWaveTime.get();
    }
    set vmWaveTime(newValue: number[]) {
        this.__vmWaveTime.set(newValue);
    }
    private __vmWaveData: ObservedPropertyObjectPU<number[]>;
    get vmWaveData() {
        return this.__vmWaveData.get();
    }
    set vmWaveData(newValue: number[]) {
        this.__vmWaveData.set(newValue);
    }
    private __vmWaveFrame: ObservedPropertySimplePU<number>;
    get vmWaveFrame() {
        return this.__vmWaveFrame.get();
    }
    set vmWaveFrame(newValue: number) {
        this.__vmWaveFrame.set(newValue);
    }
    /** 表计波形时基 s/div：随信号自适应，固定窗宽产生 CRT 滚动 */
    private __vmTPerDiv: ObservedPropertySimplePU<number>;
    get vmTPerDiv() {
        return this.__vmTPerDiv.get();
    }
    set vmTPerDiv(newValue: number) {
        this.__vmTPerDiv.set(newValue);
    }
    private __amType: ObservedPropertySimplePU<number>;
    get amType() {
        return this.__amType.get();
    }
    set amType(newValue: number) {
        this.__amType.set(newValue);
    }
    private __amReading: ObservedPropertySimplePU<string>;
    get amReading() {
        return this.__amReading.get();
    }
    set amReading(newValue: string) {
        this.__amReading.set(newValue);
    }
    private __amRange: ObservedPropertySimplePU<string>;
    get amRange() {
        return this.__amRange.get();
    }
    set amRange(newValue: string) {
        this.__amRange.set(newValue);
    }
    private __amUnit: ObservedPropertySimplePU<string>;
    get amUnit() {
        return this.__amUnit.get();
    }
    set amUnit(newValue: string) {
        this.__amUnit.set(newValue);
    }
    private __amWaveTime: ObservedPropertyObjectPU<number[]>;
    get amWaveTime() {
        return this.__amWaveTime.get();
    }
    set amWaveTime(newValue: number[]) {
        this.__amWaveTime.set(newValue);
    }
    private __amWaveData: ObservedPropertyObjectPU<number[]>;
    get amWaveData() {
        return this.__amWaveData.get();
    }
    set amWaveData(newValue: number[]) {
        this.__amWaveData.set(newValue);
    }
    private __amWaveFrame: ObservedPropertySimplePU<number>;
    get amWaveFrame() {
        return this.__amWaveFrame.get();
    }
    set amWaveFrame(newValue: number) {
        this.__amWaveFrame.set(newValue);
    }
    private __amTPerDiv: ObservedPropertySimplePU<number>;
    get amTPerDiv() {
        return this.__amTPerDiv.get();
    }
    set amTPerDiv(newValue: number) {
        this.__amTPerDiv.set(newValue);
    }
    private __pmVoltage: ObservedPropertySimplePU<string>;
    get pmVoltage() {
        return this.__pmVoltage.get();
    }
    set pmVoltage(newValue: string) {
        this.__pmVoltage.set(newValue);
    }
    private __pmCurrent: ObservedPropertySimplePU<string>;
    get pmCurrent() {
        return this.__pmCurrent.get();
    }
    set pmCurrent(newValue: string) {
        this.__pmCurrent.set(newValue);
    }
    private __pmPower: ObservedPropertySimplePU<string>;
    get pmPower() {
        return this.__pmPower.get();
    }
    set pmPower(newValue: string) {
        this.__pmPower.set(newValue);
    }
    private __pmPF: ObservedPropertySimplePU<string>;
    get pmPF() {
        return this.__pmPF.get();
    }
    set pmPF(newValue: string) {
        this.__pmPF.set(newValue);
    }
    private __fcReading: ObservedPropertySimplePU<string>;
    get fcReading() {
        return this.__fcReading.get();
    }
    set fcReading(newValue: string) {
        this.__fcReading.set(newValue);
    }
    private __fcGateTime: ObservedPropertySimplePU<number>;
    get fcGateTime() {
        return this.__fcGateTime.get();
    }
    set fcGateTime(newValue: number) {
        this.__fcGateTime.set(newValue);
    }
    private __fcWaveTime: ObservedPropertyObjectPU<number[]>;
    get fcWaveTime() {
        return this.__fcWaveTime.get();
    }
    set fcWaveTime(newValue: number[]) {
        this.__fcWaveTime.set(newValue);
    }
    private __fcWaveData: ObservedPropertyObjectPU<number[]>;
    get fcWaveData() {
        return this.__fcWaveData.get();
    }
    set fcWaveData(newValue: number[]) {
        this.__fcWaveData.set(newValue);
    }
    private __fcWaveFrame: ObservedPropertySimplePU<number>;
    get fcWaveFrame() {
        return this.__fcWaveFrame.get();
    }
    set fcWaveFrame(newValue: number) {
        this.__fcWaveFrame.set(newValue);
    }
    private __fcTPerDiv: ObservedPropertySimplePU<number>;
    get fcTPerDiv() {
        return this.__fcTPerDiv.get();
    }
    set fcTPerDiv(newValue: number) {
        this.__fcTPerDiv.set(newValue);
    }
    private __oscAutoFit: ObservedPropertySimplePU<boolean>;
    get oscAutoFit() {
        return this.__oscAutoFit.get();
    }
    set oscAutoFit(newValue: boolean) {
        this.__oscAutoFit.set(newValue);
    }
    private __oscFftMode: ObservedPropertySimplePU<boolean>;
    get oscFftMode() {
        return this.__oscFftMode.get();
    }
    set oscFftMode(newValue: boolean) {
        this.__oscFftMode.set(newValue);
    }
    private __oscStatsText: ObservedPropertySimplePU<string>;
    get oscStatsText() {
        return this.__oscStatsText.get();
    }
    set oscStatsText(newValue: string) {
        this.__oscStatsText.set(newValue);
    }
    private __oscTriggerHold: ObservedPropertySimplePU<boolean>;
    get oscTriggerHold() {
        return this.__oscTriggerHold.get();
    }
    set oscTriggerHold(newValue: boolean) {
        this.__oscTriggerHold.set(newValue);
    }
    private __oscLiveVolts: ObservedPropertySimplePU<string>;
    get oscLiveVolts() {
        return this.__oscLiveVolts.get();
    }
    set oscLiveVolts(newValue: string) {
        this.__oscLiveVolts.set(newValue);
    }
    /** 递增以强制 Canvas 重绘 */
    private __oscFrameId: ObservedPropertySimplePU<number>;
    get oscFrameId() {
        return this.__oscFrameId.get();
    }
    set oscFrameId(newValue: number) {
        this.__oscFrameId.set(newValue);
    }
    /** Force ArkUI re-render on each poll; also shown in INSTR_UI traces */
    private __uiPulse: ObservedPropertySimplePU<number>;
    get uiPulse() {
        return this.__uiPulse.get();
    }
    set uiPulse(newValue: number) {
        this.__uiPulse.set(newValue);
    }
    private appService: AppService;
    private timebases: OscTimebase[];
    private timebaseLabels: string[];
    private selTimebase: SelectValueOption[];
    private voltageScales: OscVoltageScale[];
    private voltagePerDiv: number[];
    private voltageScaleLabels: string[];
    private selVScale: SelectValueOption[];
    private selLogicCh: SelectValueOption[];
    private autoRefreshTimer: number;
    private uiLogTick: number;
    private refreshTickCount: number;
    private lastRefreshWallMs: number;
    private readonly refreshIntervalMs: number;
    private subTabLabels: string[];
    aboutToAppear(): void {
        this.updateSelectionHeader();
        this.syncSubTabFromSelection();
        this.syncInstrumentContext();
        // Prefer engine timebase (e.g. lab_555 sets MS_10) over panel default MS_1
        const snapTb = this.appService.instruments.getInstrumentSnapshot().oscilloscope.timebase;
        let tbIdx = this.timebases.indexOf(snapTb);
        if (tbIdx < 0) {
            tbIdx = this.timebaseIdx;
        }
        this.timebaseIdx = tbIdx;
        this.appService.instruments.setTimebase(this.timebases[this.timebaseIdx]);
        this.appService.instruments.setVoltageScale(0, this.voltageScales[this.voltageScaleIdx]);
        this.appService.instruments.setTrigger(TriggerMode.EDGE, this.triggerLevel, 0);
        this.appService.instruments.setCaptureMode(this.oscTriggerHold ? CaptureMode.SINGLE : CaptureMode.ROLL);
        this.syncSignalGenFieldsFromEngine();
        this.lastRefreshWallMs = Date.now();
        this.refreshTickCount = 0;
        this.autoRefreshReadings('appear');
        // 仅仿真运行时轮询；面板打开时若已在跑则启动定时器
        this.stopAutoRefreshTimer('appear_reset');
        if (this.simRunning) {
            this.startAutoRefreshTimer('appear_running');
        }
    }
    onSimRunningChange(): void {
        if (this.simRunning) {
            // 新一次仿真：清空本面板与放大弹窗会话缓存
            this.clearWaveSessionForNewSim();
            this.startAutoRefreshTimer('sim_start');
        }
        else {
            // 停仿后做最后一次读数（冻结值），再清定时器，避免 TIMER_FIRE 刷屏
            this.autoRefreshReadings('sim_stop');
            this.stopAutoRefreshTimer('sim_stop');
        }
    }
    /** 下次仿真开始时清空侧栏波形与放大弹窗会话 */
    private clearWaveSessionForNewSim(): void {
        this.waveTimeData = [];
        this.waveVoltageData = [];
        this.waveCh2TimeData = [];
        this.waveCh2Data = [];
        this.oscStatsText = '';
        this.oscLiveVolts = '--';
        this.cursorMeasureText = '';
        this.logicChannelData = [];
        this.logicSampleCount = 128;
        this.decodedFramesText = '';
        this.vmWaveTime = [];
        this.vmWaveData = [];
        this.amWaveTime = [];
        this.amWaveData = [];
        this.fcWaveTime = [];
        this.fcWaveData = [];
        this.oscFrameId = this.oscFrameId + 1;
        this.vmWaveFrame = this.vmWaveFrame + 1;
        this.amWaveFrame = this.amWaveFrame + 1;
        this.fcWaveFrame = this.fcWaveFrame + 1;
        InstrumentWaveExpandStore.getInstance().clearSession();
    }
    WaveExpandHint(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('双击波形放大');
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.width('100%');
            Text.textAlign(TextAlign.End);
            Text.padding({ top: 2, right: 2 });
        }, Text);
        Text.pop();
    }
    private openWaveExpand(kind: string): void {
        const store = InstrumentWaveExpandStore.getInstance();
        const ref = this.selectionRefDes.length > 0 ? this.selectionRefDes : this.selectionLibraryId;
        if (kind === 'osc') {
            this.pushOscToStore();
            store.open('osc', `示波器 ${ref}`, this.buildOscDetail());
        }
        else if (kind === 'la') {
            this.pushLogicToStore();
            store.open('la', `逻辑分析仪 ${ref}`, this.buildLogicDetail());
        }
        else if (kind === 'vm') {
            this.pushMeterToStore('vm');
            store.open('vm', `电压表 ${ref}`, this.buildVmDetail());
        }
        else if (kind === 'am') {
            this.pushMeterToStore('am');
            store.open('am', `电流表 ${ref}`, this.buildAmDetail());
        }
        else if (kind === 'fc') {
            this.pushMeterToStore('fc');
            store.open('fc', `频率计 ${ref}`, this.buildFcDetail());
        }
    }
    private buildOscDetail(): string {
        const n = this.waveVoltageData.length;
        const n2 = this.waveCh2Data.length;
        const parts: string[] = [];
        parts.push(`CH1 采样点=${n}`);
        if (n2 > 1) {
            parts.push(`CH2 采样点=${n2}`);
        }
        parts.push(`时基=${this.timebaseLabels[this.timebaseIdx]}`);
        parts.push(`档位=${this.voltageScaleLabels[this.voltageScaleIdx]}/div`);
        parts.push(`实时=${this.oscLiveVolts}`);
        if (this.oscStatsText.length > 0) {
            parts.push(this.oscStatsText);
        }
        if (this.cursorMeasureText.length > 0) {
            parts.push(`光标: ${this.cursorMeasureText}`);
        }
        parts.push(this.oscFftMode ? '模式=FFT' : '模式=时域');
        return parts.join('\n');
    }
    private buildLogicDetail(): string {
        const parts: string[] = [];
        parts.push(`通道数=${this.logicChannels}`);
        parts.push(`采样点=${this.logicSampleCount}`);
        parts.push(`已捕获通道=${this.logicChannelData.length}`);
        parts.push(`阈值=${this.threshold} mV`);
        if (this.decodedFramesText.length > 0) {
            parts.push(`解码:\n${this.decodedFramesText}`);
        }
        return parts.join('\n');
    }
    private buildVmDetail(): string {
        return [
            `读数=${this.vmReading} ${this.vmUnit}`,
            `量程=${this.vmRange}`,
            `采样点=${this.vmWaveData.length}`,
            `器件=${this.selectionRefDes} / ${this.selectionLibraryId}`
        ].join('\n');
    }
    private buildAmDetail(): string {
        return [
            `读数=${this.amReading} ${this.amUnit}`,
            `量程=${this.amRange}`,
            `采样点=${this.amWaveData.length}`,
            `器件=${this.selectionRefDes} / ${this.selectionLibraryId}`
        ].join('\n');
    }
    private buildFcDetail(): string {
        return [
            `频率=${this.fcReading}`,
            `闸门=${this.fcGateTime}s`,
            `采样点=${this.fcWaveData.length}`,
            `器件=${this.selectionRefDes} / ${this.selectionLibraryId}`
        ].join('\n');
    }
    private pushOscToStore(): void {
        let time1 = this.waveTimeData;
        let volt1 = this.waveVoltageData;
        let time2 = this.waveCh2TimeData;
        let volt2 = this.waveCh2Data;
        // 放大弹窗需要整次仿真历史，不能只用侧栏时基截窗（否则缩放/平移看不到全程）
        if (!this.oscFftMode) {
            const full1 = this.appService.instruments.getOscilloscopeWaveFull(0);
            if (full1.success && full1.data &&
                InstrumentPanel.isDisplayableScopeWave(full1.data.netName, full1.data.probeName) &&
                full1.data.voltageAxis.length >= 2) {
                time1 = full1.data.timeAxis;
                volt1 = full1.data.voltageAxis;
            }
            const full2 = this.appService.instruments.getOscilloscopeWaveFull(1);
            if (full2.success && full2.data &&
                InstrumentPanel.isDisplayableScopeWave(full2.data.netName, full2.data.probeName) &&
                full2.data.voltageAxis.length >= 2) {
                time2 = full2.data.timeAxis;
                volt2 = full2.data.voltageAxis;
            }
            else {
                time2 = [];
                volt2 = [];
            }
        }
        InstrumentWaveExpandStore.getInstance().setOscSnapshot(time1, volt1, time2, volt2, this.oscFftMode ? 'FFT CH1' : 'CH1', this.oscFftMode ? '#ffab40' : '#00e676', this.oscFftMode ? 'FFT CH2' : 'CH2', this.oscFftMode ? '#ffd54f' : '#40c4ff', this.voltagePerDiv[this.voltageScaleIdx], this.timebaseSecPerDiv(), this.triggerLevel, this.oscAutoFit, this.oscFrameId, this.buildOscDetail(), this.oscFftMode);
    }
    private pushLogicToStore(): void {
        InstrumentWaveExpandStore.getInstance().setLogicSnapshot(this.logicChannelData, this.logicChannels, this.logicSampleCount, this.buildLogicDetail());
    }
    private pushMeterToStore(kind: string): void {
        const store = InstrumentWaveExpandStore.getInstance();
        if (kind === 'vm') {
            store.setMeterSnapshot(this.vmWaveTime, this.vmWaveData, 'ΔV', '#66bb6a', this.vmWaveFrame, this.buildVmDetail(), this.vmTPerDiv);
        }
        else if (kind === 'am') {
            store.setMeterSnapshot(this.amWaveTime, this.amWaveData, 'I(mA)', '#ffa726', this.amWaveFrame, this.buildAmDetail(), this.amTPerDiv);
        }
        else if (kind === 'fc') {
            store.setMeterSnapshot(this.fcWaveTime, this.fcWaveData, 'IN', '#42a5f5', this.fcWaveFrame, this.buildFcDetail(), this.fcTPerDiv);
        }
    }
    /** 刷新读数后同步放大弹窗会话（同一次仿真内保留并实时更新） */
    private syncExpandSessionAfterRefresh(): void {
        const store = InstrumentWaveExpandStore.getInstance();
        if (!store.visible) {
            return;
        }
        if (store.kind === 'osc') {
            this.pushOscToStore();
            store.refreshIfOpen('osc');
        }
        else if (store.kind === 'la') {
            this.pushLogicToStore();
            store.refreshIfOpen('la');
        }
        else if (store.kind === 'vm') {
            this.pushMeterToStore('vm');
            store.refreshIfOpen('vm');
        }
        else if (store.kind === 'am') {
            this.pushMeterToStore('am');
            store.refreshIfOpen('am');
        }
        else if (store.kind === 'fc') {
            this.pushMeterToStore('fc');
            store.refreshIfOpen('fc');
        }
    }
    private startAutoRefreshTimer(reason: string): void {
        if (this.autoRefreshTimer >= 0) {
            return;
        }
        this.lastRefreshWallMs = Date.now();
        this.refreshTickCount = 0;
        this.autoRefreshTimer = setInterval(() => {
            if (!this.simRunning) {
                this.stopAutoRefreshTimer('timer_guard_idle');
                return;
            }
            const now = Date.now();
            const dt = now - this.lastRefreshWallMs;
            this.lastRefreshWallMs = now;
            this.refreshTickCount++;
            traceInstrUi('TIMER_FIRE', `#${this.refreshTickCount} dt=${dt}ms expect=${this.refreshIntervalMs}ms ` +
                `tab=${this.subTab}(${this.kindForSubTab(this.subTab)}) ` +
                `sel=${this.selectedComponentId.length > 0 ? this.selectionRefDes : '(none)'} ` +
                `timerId=${this.autoRefreshTimer}`);
            this.autoRefreshReadings('timer');
        }, this.refreshIntervalMs);
        traceInstrUi('TIMER_START', `reason=${reason} interval=${this.refreshIntervalMs}ms timerId=${this.autoRefreshTimer} ` +
            `tab=${this.subTab} kind=${this.kindForSubTab(this.subTab)} ` +
            `sel=${this.selectedComponentId} ref=${this.selectionRefDes} lib=${this.selectionLibraryId}`);
    }
    onSelectionChange(): void {
        this.updateSelectionHeader();
        this.syncSubTabFromSelection();
        this.syncInstrumentContext();
        traceInstrUi('SELECT', `comp=${this.selectedComponentId} ref=${this.selectionRefDes} ` +
            `lib=${this.selectionLibraryId} tab=${this.subTab} kind=${this.instrKindForSelection()}`);
        const reading = this.autoRefreshReadings('select');
        this.logInstrumentReading(true, reading);
    }
    /** 根据选中器件 libraryId 自动切换到对应仪器子标签 */
    private syncSubTabFromSelection(): void {
        const kind = this.instrKindForSelection();
        const tabIdx = instrumentSubTabForKind(kind);
        if (tabIdx >= 0) {
            this.subTab = tabIdx;
        }
    }
    onSimWaveTick(): void {
        this.autoRefreshReadings('wave');
    }
    private syncInstrumentContext(): void {
        if (this.selectedComponentId.length > 0) {
            this.appService.setActiveInstrumentComponent(this.selectedComponentId);
            this.appService.refreshInstrumentReaderForComponent(this.selectedComponentId);
            // VOLTMETER_DC must stay on DC; AC mode + frozen samples → 0 Vrms and looks "broken"
            const lib = this.selectionLibraryId.toUpperCase();
            if (lib.includes('VOLTMETER_DC') || lib === 'VOLTMETER') {
                this.vmType = 0;
                this.vmUnit = 'V DC';
                this.appService.instruments.setVoltmeterType(VoltmeterType.DC);
            }
        }
        else {
            this.appService.setActiveInstrumentComponent(null);
        }
        this.syncSignalGenFieldsFromEngine();
    }
    /** AI/原理图写回后：面板振幅不得残留默认 1V，否则「应用参数」会盖掉正确幅度 */
    private syncSignalGenFieldsFromEngine(): void {
        const snap = this.appService.instruments.getInstrumentSnapshot();
        const sg = snap.signalGen;
        if (sg === undefined) {
            return;
        }
        if (Number.isFinite(sg.frequency) && sg.frequency > 0) {
            if (sg.frequency >= 1000) {
                const khz = sg.frequency / 1000;
                this.freq = (Math.abs(khz - Math.round(khz)) < 1e-6)
                    ? `${Math.round(khz)}kHz` : `${khz}kHz`;
            }
            else {
                this.freq = `${sg.frequency}Hz`;
            }
        }
        if (Number.isFinite(sg.amplitude)) {
            this.sigAmp = `${sg.amplitude}V`;
        }
        if (Number.isFinite(sg.offset)) {
            this.sigOffset = `${sg.offset}V`;
        }
        if (Number.isFinite(sg.dutyCycle)) {
            this.sigDuty = `${sg.dutyCycle}`;
        }
    }
    private updateSelectionHeader(): void {
        if (this.selectedComponentId.length === 0) {
            this.selectionRefDes = '';
            this.selectionLibraryId = '';
            return;
        }
        const doc = this.appService.schematicEditor.getDocument();
        const comp = doc.components.find(c => c.id === this.selectedComponentId);
        if (comp !== undefined) {
            this.selectionRefDes = comp.refDes;
            this.selectionLibraryId = comp.libraryId;
        }
        else {
            this.selectionRefDes = '';
            this.selectionLibraryId = '';
        }
    }
    aboutToDisappear(): void {
        this.stopAutoRefreshTimer('disappear');
    }
    private stopAutoRefreshTimer(reason: string): void {
        if (this.autoRefreshTimer >= 0) {
            const id = this.autoRefreshTimer;
            clearInterval(this.autoRefreshTimer);
            this.autoRefreshTimer = -1;
            traceInstrUi('TIMER_STOP', `reason=${reason} timerId=${id} ticks=${this.refreshTickCount}`);
        }
    }
    /** Map visible Instruments sub-tab → engine kind (9 instruments) */
    private kindForSubTab(tab: number): string {
        if (tab === 0)
            return 'osc';
        if (tab === 1)
            return 'logic';
        if (tab === 2)
            return 'dmm';
        if (tab === 3)
            return 'sig';
        if (tab === 4)
            return 'uart';
        if (tab === 5)
            return 'vm';
        if (tab === 6)
            return 'am';
        if (tab === 7)
            return 'power';
        if (tab === 8)
            return 'freq';
        return '';
    }
    /**
     * Auto-refresh the visible instrument tab every 500ms.
     * Uses selection binding when available; still polls engines for scope/logic/uart/etc.
     * without requiring a selected instrument (otherwise the 9 tabs stay frozen).
     */
    autoRefreshReadings(source: string = 'unknown'): string {
        const t0 = Date.now();
        // Prefer the currently visible sub-tab so all 9 instruments can refresh live.
        let instrKind = this.kindForSubTab(this.subTab);
        const selKind = this.instrKindForSelection();
        if (instrKind.length === 0 && selKind.length > 0) {
            instrKind = selKind;
        }
        // Only bind selection as active when it is actually an instrument.
        // Dragging a pot must not steal the voltmeter binding → UI reading 0.
        if (this.selectedComponentId.length > 0 && selKind.length > 0) {
            this.appService.setActiveInstrumentComponent(this.selectedComponentId);
        }
        else if (instrKind === 'vm' || instrKind === 'dmm' || instrKind === 'am' ||
            instrKind === 'osc' || instrKind === 'power' || instrKind === 'freq') {
            const fallbackId = this.appService.findFirstSchematicInstrumentId(instrKind);
            if (fallbackId.length > 0) {
                this.appService.setActiveInstrumentComponent(fallbackId);
            }
        }
        if (instrKind.length === 0) {
            traceInstrUi('SKIP', `src=${source} reason=no_kind tab=${this.subTab} selKind='${selKind}' ` +
                `sel=${this.selectedComponentId} lib=${this.selectionLibraryId}`);
            return '';
        }
        if (instrKind === 'sig') {
            // Signal gen is a source — no live reading board; still pulse UI + log
            this.uiPulse++;
            const reading = `SIG freq=${this.freq}`;
            traceInstrUi('REFRESH', `src=${source} kind=sig tab=${this.subTab} pulse=${this.uiPulse} ` +
                `reading=${reading} ms=${Date.now() - t0}`);
            return reading;
        }
        const hasSelection = this.selectedComponentId.length > 0;
        const selectionMatches = hasSelection && (selKind === instrKind ||
            ((instrKind === 'vm' || instrKind === 'dmm') &&
                (selKind === 'vm' || selKind === 'dmm')) ||
            (instrKind === 'am' && selKind === 'am'));
        let dataPath = 'none';
        try {
            if (instrKind === 'dmm') {
                let refreshed = false;
                let readId = selectionMatches ? this.selectedComponentId : '';
                if (readId.length === 0) {
                    readId = this.appService.findFirstSchematicInstrumentId('dmm');
                }
                if (readId.length > 0) {
                    const raw = this.appService.readMultimeterRawForComponent(readId);
                    if (raw !== null) {
                        // Instantaneous — pot drag / live edits (avoid rolling-average lag)
                        this.appService.instruments.multimeterSnapReading(raw);
                        this.mmReading = this.formatMmReading(raw);
                        refreshed = true;
                        dataPath = selectionMatches ? 'delta' : 'schematic_dmm';
                    }
                }
                if (!refreshed) {
                    const mm = this.appService.instruments.measure();
                    if (mm.success && mm.data !== undefined) {
                        this.mmReading = mm.data.toFixed(3);
                        dataPath = 'measure';
                    }
                    else {
                        dataPath = 'measure_fail';
                    }
                }
                const snap = this.appService.instruments.getInstrumentSnapshot();
                if (snap !== undefined) {
                    this.mmMode = this.modeLabel(snap.multimeterMode);
                }
            }
            else if (instrKind === 'vm') {
                let refreshed = false;
                let readId = selectionMatches ? this.selectedComponentId : '';
                if (readId.length === 0) {
                    readId = this.appService.findFirstSchematicInstrumentId('vm');
                }
                if (readId.length > 0) {
                    const delta = this.appService.readVoltmeterDeltaForComponent(readId);
                    if (delta !== null) {
                        this.appService.instruments.voltmeterSnapReading(delta);
                        this.vmReading = delta.toFixed(3);
                        refreshed = true;
                        dataPath = selectionMatches ? 'delta' : 'schematic_vm';
                    }
                }
                if (!refreshed) {
                    const vr = this.appService.instruments.voltmeterMeasure();
                    if (vr.success && vr.data !== undefined) {
                        this.vmReading = vr.data.toFixed(3);
                        dataPath = 'measure';
                    }
                    else {
                        dataPath = 'measure_fail';
                    }
                }
                const vcfg = this.appService.instruments.getVoltmeterConfig();
                if (vcfg.success && vcfg.data !== undefined) {
                    this.vmRange = `${vcfg.data.range}V`;
                    this.vmUnit = vcfg.data.unit ?? 'V DC';
                }
                if (source !== 'wave') {
                    this.refreshMeterWave('vm');
                }
            }
            else if (instrKind === 'am') {
                let refreshed = false;
                let readId = selectionMatches ? this.selectedComponentId : '';
                if (readId.length === 0) {
                    readId = this.appService.findFirstSchematicInstrumentId('am');
                }
                if (readId.length > 0) {
                    const mA = this.appService.readAmmeterCurrentForComponent(readId);
                    if (mA !== null) {
                        this.appService.instruments.ammeterSnapReading(mA);
                        this.amReading = mA.toFixed(3);
                        refreshed = true;
                        dataPath = selectionMatches ? 'delta' : 'schematic_am';
                    }
                }
                if (!refreshed) {
                    const ar = this.appService.instruments.ammeterMeasure();
                    if (ar.success && ar.data !== undefined) {
                        this.amReading = ar.data.toFixed(3);
                        dataPath = 'measure';
                    }
                    else {
                        dataPath = 'measure_fail';
                    }
                }
                const acfg = this.appService.instruments.getAmmeterConfig();
                if (acfg.success && acfg.data !== undefined) {
                    this.amRange = `${acfg.data.range}mA`;
                    this.amUnit = acfg.data.unit ?? 'mA DC';
                }
                if (source !== 'wave') {
                    this.refreshMeterWave('am');
                }
            }
            else if (instrKind === 'osc') {
                const hasScope = this.appService.findFirstSchematicInstrumentId('osc').length > 0;
                if (!hasScope) {
                    this.waveTimeData = [];
                    this.waveVoltageData = [];
                    this.waveCh2TimeData = [];
                    this.waveCh2Data = [];
                    this.oscLiveVolts = '--';
                    this.oscStatsText = '请先在原理图放置示波器';
                    this.oscFrameId = this.oscFrameId + 1;
                    dataPath = 'no_scope_on_schematic';
                }
                else if (this.oscAutoFit) {
                    this.applyOscAutoScale();
                }
                if (hasScope) {
                    const osc = this.appService.instruments.getOscilloscopeWave(0);
                    const finite0 = osc.success && osc.data
                        ? InstrumentPanel.countFinite(osc.data.voltageAxis) : 0;
                    if (osc.success && osc.data && finite0 >= 2 &&
                        InstrumentPanel.isDisplayableScopeWave(osc.data.netName, osc.data.probeName)) {
                        this.oscFftMode = osc.data.waveType === 'freq' || osc.data.netName === 'MATH_FFT';
                        this.waveTimeData = osc.data.timeAxis.slice();
                        this.waveVoltageData = osc.data.voltageAxis.slice();
                        this.oscFrameId = this.oscFrameId + 1;
                        this.updateOscStatsText(osc.data.voltageAxis, osc.data.timeAxis);
                        const last = InstrumentPanel.lastFinite(osc.data.voltageAxis);
                        if (last !== null) {
                            this.oscLiveVolts = this.oscFftMode
                                ? `${last.toFixed(1)} dB`
                                : `${last.toFixed(3)} V`;
                        }
                        dataPath = `wave pts=${finite0}${this.oscFftMode ? ' fft' : ''}`;
                    }
                    else {
                        this.waveTimeData = [];
                        this.waveVoltageData = [];
                        this.oscFrameId = this.oscFrameId + 1;
                        dataPath = 'wave_empty';
                    }
                    const osc2 = this.appService.instruments.getOscilloscopeWave(1);
                    const finite2 = osc2.success && osc2.data
                        ? InstrumentPanel.countFinite(osc2.data.voltageAxis) : 0;
                    if (osc2.success && osc2.data && finite2 >= 2 &&
                        InstrumentPanel.isDisplayableScopeWave(osc2.data.netName, osc2.data.probeName)) {
                        this.waveCh2TimeData = osc2.data.timeAxis.slice();
                        this.waveCh2Data = osc2.data.voltageAxis.slice();
                    }
                    else {
                        this.waveCh2TimeData = [];
                        this.waveCh2Data = [];
                    }
                }
            }
            else if (instrKind === 'power') {
                const pmId = selectionMatches ? this.selectedComponentId :
                    this.appService.findFirstSchematicInstrumentId('power');
                const snap = pmId.length > 0 ? this.appService.readPowerMeterForComponent(pmId) : null;
                if (snap !== null) {
                    this.pmVoltage = snap.voltage.toFixed(3);
                    this.pmCurrent = (snap.current * 1000).toFixed(2);
                    this.pmPower = (snap.power * 1000).toFixed(1);
                    this.pmPF = snap.powerFactor.toFixed(2);
                    dataPath = selectionMatches ? 'delta' : 'schematic_pm';
                }
                else {
                    const pm = this.appService.instruments.powerMeterMeasure();
                    if (pm.success && pm.data) {
                        this.pmVoltage = pm.data.voltage.toFixed(3);
                        this.pmCurrent = (pm.data.current * 1000).toFixed(2);
                        this.pmPower = (pm.data.power * 1000).toFixed(1);
                        this.pmPF = pm.data.powerFactor.toFixed(2);
                        dataPath = 'measure';
                    }
                    else {
                        dataPath = 'measure_fail';
                    }
                }
            }
            else if (instrKind === 'freq') {
                const fc = this.appService.instruments.freqCounterMeasure();
                if (fc.success && fc.data !== undefined) {
                    if (fc.data >= 1000000) {
                        this.fcReading = `${(fc.data / 1000000).toFixed(3)} MHz`;
                    }
                    else if (fc.data >= 1000) {
                        this.fcReading = `${(fc.data / 1000).toFixed(1)} kHz`;
                    }
                    else {
                        this.fcReading = `${fc.data.toFixed(0)} Hz`;
                    }
                    dataPath = 'measure';
                }
                else {
                    dataPath = 'measure_fail';
                }
                if (source !== 'wave') {
                    this.refreshMeterWave('freq');
                }
            }
            else if (instrKind === 'logic') {
                const logic = this.appService.instruments.getLogicWaveData();
                if (logic.success && logic.data !== undefined) {
                    const channels: number[][] = [];
                    const edgeParts: string[] = [];
                    for (let i = 0; i < logic.data.length; i++) {
                        const wave = logic.data[i];
                        const bits: number[] = [];
                        let edges = 0;
                        for (let j = 0; j < wave.voltageAxis.length; j++) {
                            const bit = wave.voltageAxis[j] > 0.5 ? 1 : 0;
                            bits.push(bit);
                            if (j > 0 && bits[j] !== bits[j - 1]) {
                                edges++;
                            }
                        }
                        channels.push(bits.slice());
                        // lab_digital: D0–D6=Q, D7=CLK；lab_memory: D0–7=SCL/SDA/SCK/CS/MOSI/CE/CE/A0
                        // 有边沿的通道 + CH1/CH8 必打（便于对照空闲/活动）
                        if (edges > 0 || i === 7 || i === 0) {
                            const last = bits.length > 0 ? bits[bits.length - 1] : -1;
                            edgeParts.push(`D${i} n=${bits.length} e=${edges} last=${last}`);
                        }
                    }
                    this.logicChannelData = channels;
                    this.logicSampleCount = channels.length > 0 ? channels[0].length : 128;
                    if (channels.length > 0) {
                        this.logicChannels = channels.length;
                    }
                    if (edgeParts.length > 0) {
                        traceLaUiChannels(edgeParts.join('; '));
                    }
                    dataPath = `ch=${channels.length}`;
                }
                else {
                    dataPath = 'wave_empty';
                }
            }
            else if (instrKind === 'uart') {
                this.uartLog = this.appService.instruments.getUartLog();
                dataPath = `logLen=${this.uartLog.length}`;
            }
            else {
                dataPath = `unhandled_kind=${instrKind}`;
            }
        }
        catch (e) {
            const errMsg = e instanceof Error ? e.message : `${e}`;
            traceInstrUi('ERROR', `src=${source} kind=${instrKind} tab=${this.subTab} err=${errMsg}`);
        }
        this.uiPulse++;
        const reading = this.buildReadingSummary(instrKind);
        traceInstrUi('REFRESH', `src=${source} kind=${instrKind} tab=${this.subTab} ` +
            `match=${selectionMatches ? 1 : 0} path=${dataPath} pulse=${this.uiPulse} ` +
            `sel=${this.selectionRefDes || '(none)'} reading=${reading} ms=${Date.now() - t0}`);
        this.logInstrumentReading(false, reading);
        this.syncExpandSessionAfterRefresh();
        return reading;
    }
    private logInstrumentReading(onSelect: boolean, readingOverride: string = ''): void {
        if (this.selectedComponentId.length === 0) {
            return;
        }
        const kind = this.instrKindForSelection();
        if (kind.length === 0) {
            return;
        }
        this.uiLogTick++;
        if (!onSelect && this.uiLogTick % 20 !== 0) {
            return;
        }
        const reading = readingOverride.length > 0 ? readingOverride : this.buildReadingSummary(kind);
        if (onSelect) {
            traceUiSelect('Instr', this.selectedComponentId, this.selectionRefDes, this.selectionLibraryId, kind, reading);
        }
        else {
            traceUiRefresh('Instr', this.selectedComponentId, this.selectionRefDes, this.selectionLibraryId, kind, reading);
        }
    }
    private buildReadingSummary(kind: string): string {
        if (kind === 'dmm')
            return `DMM ${this.mmReading}`;
        if (kind === 'vm')
            return `VM ${this.vmReading} ${this.vmUnit}`;
        if (kind === 'am')
            return `AM ${this.amReading} ${this.amUnit}`;
        if (kind === 'power')
            return `PM V=${this.pmVoltage} I=${this.pmCurrent} P=${this.pmPower}`;
        if (kind === 'freq')
            return `FC ${this.fcReading}`;
        if (kind === 'osc') {
            const pts = this.waveVoltageData.length;
            const lastV = InstrumentPanel.lastFinite(this.waveVoltageData);
            const last = lastV !== null ? lastV.toFixed(4) : '--';
            let minV = Number.POSITIVE_INFINITY;
            let maxV = Number.NEGATIVE_INFINITY;
            for (let i = 0; i < this.waveVoltageData.length; i++) {
                const v = this.waveVoltageData[i];
                if (!(v === v) || !Number.isFinite(v)) {
                    continue;
                }
                if (v < minV) {
                    minV = v;
                }
                if (v > maxV) {
                    maxV = v;
                }
            }
            const vpp = (minV < maxV) ? (maxV - minV).toFixed(3) : '--';
            const last2V = InstrumentPanel.lastFinite(this.waveCh2Data);
            const last2 = last2V !== null ? last2V.toFixed(4) : '--';
            let min2 = Number.POSITIVE_INFINITY;
            let max2 = Number.NEGATIVE_INFINITY;
            for (let i = 0; i < this.waveCh2Data.length; i++) {
                const v = this.waveCh2Data[i];
                if (!(v === v) || !Number.isFinite(v)) {
                    continue;
                }
                if (v < min2) {
                    min2 = v;
                }
                if (v > max2) {
                    max2 = v;
                }
            }
            const vpp2 = (min2 < max2) ? (max2 - min2).toFixed(3) : '--';
            return `OSC pts=${pts} last=${last}V Vpp=${vpp} ch2last=${last2}V ch2Vpp=${vpp2}`;
        }
        if (kind === 'logic')
            return `LA ch=${this.logicChannels} samples=${this.logicSampleCount}`;
        if (kind === 'uart')
            return `UART logLen=${this.uartLog.length}`;
        return kind;
    }
    private instrKindForSelection(): string {
        return detectInstrumentKind(this.selectionLibraryId);
    }
    private modeLabel(mode: MultimeterMode): string {
        switch (mode) {
            case MultimeterMode.DCV: return 'DCV';
            case MultimeterMode.ACV: return 'ACV';
            case MultimeterMode.RESISTANCE: return 'OHM';
            case MultimeterMode.CURRENT: return 'AMP';
            case MultimeterMode.DIODE: return 'DIODE';
            default: return 'DCV';
        }
    }
    private formatMmReading(raw: number): string {
        if (this.mmMode === 'AMP') {
            return `${(raw * 1000).toFixed(3)} mA`;
        }
        if (this.mmMode === 'OHM') {
            if (raw >= 1e8) {
                return 'OL';
            }
            if (raw >= 1000) {
                return `${(raw / 1000).toFixed(3)} kΩ`;
            }
            return `${raw.toFixed(1)} Ω`;
        }
        if (this.mmMode === 'DIODE') {
            return `${raw.toFixed(3)} V`;
        }
        return `${raw.toFixed(3)} V`;
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.width('100%');
            Column.height('100%');
        }, Column);
        this.SelectionHeader.bind(this)();
        this.InstrumentSubTabBar.bind(this)();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.layoutWeight(1);
            Column.width('100%');
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
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
    /** 仪器子标签 — 按面板宽度 3 列换行排列 */
    InstrumentSubTabBar(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.padding({ left: 6, right: 6, top: 5, bottom: 5 });
            Column.backgroundColor(ProteusColors.TAB_BAR_BG);
            Column.border({ width: { bottom: 1 }, color: ProteusColors.DIVIDER });
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusChipGrid(this, {
                        labels: this.subTabLabels,
                        selectedIdx: this.subTab,
                        colsPerRow: 3,
                        onSelect: (idx: number) => {
                            this.subTab = idx;
                            traceInstrUi('TAB', `tab=${idx} kind=${this.kindForSubTab(idx)}`);
                            this.autoRefreshReadings('tab');
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1015, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            labels: this.subTabLabels,
                            selectedIdx: this.subTab,
                            colsPerRow: 3,
                            onSelect: (idx: number) => {
                                this.subTab = idx;
                                traceInstrUi('TAB', `tab=${idx} kind=${this.kindForSubTab(idx)}`);
                                this.autoRefreshReadings('tab');
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        labels: this.subTabLabels,
                        selectedIdx: this.subTab,
                        colsPerRow: 3
                    });
                }
            }, { name: "ProteusChipGrid" });
        }
        Column.pop();
    }
    /** 顶部选中器件信息 — 避免与下方控件挤在同一视觉层 */
    SelectionHeader(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 2 });
            Column.width('100%');
            Column.padding({ left: 10, right: 10, top: 8, bottom: 6 });
            Column.backgroundColor(ProteusColors.PANEL_TITLE_BG);
            Column.border({ width: { bottom: 1 }, color: ProteusColors.DIVIDER });
            Column.alignItems(HorizontalAlign.Start);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.selectionRefDes.length > 0 ? this.selectionRefDes : 'Instruments');
            Text.fontSize(13);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
            Text.maxLines(1);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
            Text.layoutWeight(1);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`#${this.uiPulse}`);
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.fontFamily('monospace');
        }, Text);
        Text.pop();
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
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
    // ==================== Readout Display (shared) — replaced by LiveReadout @Component
    PlaceholderDisplay(hint: string, parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height(80);
            Column.backgroundColor('#0a0a12');
            Column.justifyContent(FlexAlign.Center);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(hint);
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
        }, Text);
        Text.pop();
        Column.pop();
    }
    // ==================== Oscilloscope ====================
    OscPanel(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Scroll.create();
            Scroll.width('100%');
            Scroll.height('100%');
        }, Scroll);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 8 });
            Column.width('100%');
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // Row 1: timebase
            Row.create({ space: 6 });
            // Row 1: timebase
            Row.width('100%');
            // Row 1: timebase
            Row.padding({ left: 8, right: 8, top: 6 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('时基');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width(32);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Select.create(this.selTimebase);
            Select.selected(this.timebaseIdx);
            Select.value(this.timebaseLabels[this.timebaseIdx]);
            Select.font({ size: 11 });
            Select.fontColor(ProteusColors.TEXT_PRIMARY);
            Select.backgroundColor(ProteusColors.CANVAS_BG);
            Select.layoutWeight(1);
            Select.height(ProteusDimens.PARAM_ROW_HEIGHT);
            Select.onSelect((idx: number) => {
                this.timebaseIdx = idx;
                this.oscAutoFit = false;
                this.appService.instruments.setTimebase(this.timebases[idx]);
            });
        }, Select);
        Select.pop();
        // Row 1: timebase
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // Row 2: voltage scale
            Row.create({ space: 6 });
            // Row 2: voltage scale
            Row.width('100%');
            // Row 2: voltage scale
            Row.padding({ left: 8, right: 8 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('档位');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width(32);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Select.create(this.selVScale);
            Select.selected(this.voltageScaleIdx);
            Select.value(this.voltageScaleLabels[this.voltageScaleIdx]);
            Select.font({ size: 11 });
            Select.fontColor(ProteusColors.TEXT_PRIMARY);
            Select.backgroundColor(ProteusColors.CANVAS_BG);
            Select.layoutWeight(1);
            Select.height(ProteusDimens.PARAM_ROW_HEIGHT);
            Select.onSelect((idx: number) => {
                this.voltageScaleIdx = idx;
                this.oscAutoFit = false;
                this.appService.instruments.setVoltageScale(0, this.voltageScales[idx]);
                this.appService.instruments.setVoltageScale(1, this.voltageScales[idx]);
            });
        }, Select);
        Select.pop();
        // Row 2: voltage scale
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // Row 3: coupling + capture
            Row.create({ space: 6 });
            // Row 3: coupling + capture
            Row.width('100%');
            // Row 3: coupling + capture
            Row.padding({ left: 8, right: 8 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: 'AC', widthVal: '24%',
                        onAction: () => { this.appService.instruments.setCoupling(0, CouplingMode.AC); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1128, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'AC',
                            widthVal: '24%',
                            onAction: () => { this.appService.instruments.setCoupling(0, CouplingMode.AC); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'AC', widthVal: '24%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: 'DC', widthVal: '24%',
                        onAction: () => { this.appService.instruments.setCoupling(0, CouplingMode.DC); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1130, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'DC',
                            widthVal: '24%',
                            onAction: () => { this.appService.instruments.setCoupling(0, CouplingMode.DC); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'DC', widthVal: '24%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: this.oscAutoFit ? '自适应' : '固定档',
                        widthVal: '24%',
                        onAction: () => {
                            this.oscAutoFit = !this.oscAutoFit;
                            if (this.oscAutoFit) {
                                this.applyOscAutoScale();
                                this.captureWave();
                            }
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1132, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: this.oscAutoFit ? '自适应' : '固定档',
                            widthVal: '24%',
                            onAction: () => {
                                this.oscAutoFit = !this.oscAutoFit;
                                if (this.oscAutoFit) {
                                    this.applyOscAutoScale();
                                    this.captureWave();
                                }
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: this.oscAutoFit ? '自适应' : '固定档',
                        widthVal: '24%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: this.oscTriggerHold ? '触发锁' : '滚动',
                        widthVal: '24%',
                        onAction: () => {
                            this.oscTriggerHold = !this.oscTriggerHold;
                            this.appService.instruments.setCaptureMode(this.oscTriggerHold ? CaptureMode.SINGLE : CaptureMode.ROLL);
                            this.captureWave();
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1143, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: this.oscTriggerHold ? '触发锁' : '滚动',
                            widthVal: '24%',
                            onAction: () => {
                                this.oscTriggerHold = !this.oscTriggerHold;
                                this.appService.instruments.setCaptureMode(this.oscTriggerHold ? CaptureMode.SINGLE : CaptureMode.ROLL);
                                this.captureWave();
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: this.oscTriggerHold ? '触发锁' : '滚动',
                        widthVal: '24%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        // Row 3: coupling + capture
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '采样', widthVal: '48%',
                        onAction: () => {
                            this.oscFftMode = false;
                            this.appService.instruments.setMathChannel(MathChannelOp.ADD, false);
                            this.captureWave();
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1157, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '采样',
                            widthVal: '48%',
                            onAction: () => {
                                this.oscFftMode = false;
                                this.appService.instruments.setMathChannel(MathChannelOp.ADD, false);
                                this.captureWave();
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '采样', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: this.oscFftMode ? 'FFT●' : 'FFT', widthVal: '48%',
                        onAction: () => {
                            this.oscFftMode = true;
                            this.appService.instruments.setMathChannel(MathChannelOp.FFT, true);
                            this.captureWave();
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1163, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: this.oscFftMode ? 'FFT●' : 'FFT',
                            widthVal: '48%',
                            onAction: () => {
                                this.oscFftMode = true;
                                this.appService.instruments.setMathChannel(MathChannelOp.FFT, true);
                                this.captureWave();
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: this.oscFftMode ? 'FFT●' : 'FFT', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // Row 4: trigger slider
            Column.create({ space: 4 });
            // Row 4: trigger slider
            Column.width('100%');
            // Row 4: trigger slider
            Column.padding({ left: 8, right: 8 });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.oscTriggerHold
                ? `触发锁 ${this.triggerLevel.toFixed(2)} V（稳像）`
                : `滚动模式 · 实时 ${this.oscLiveVolts}`);
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width('100%');
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Slider.create({ value: this.triggerLevel, min: -5, max: 5, step: 0.05 });
            Slider.width('100%');
            Slider.height(ProteusDimens.PARAM_ROW_HEIGHT);
            Slider.enabled(this.oscTriggerHold);
            Slider.onChange((v: number) => {
                this.triggerLevel = v;
                this.appService.instruments.setTrigger(TriggerMode.EDGE, v, 0);
            });
        }, Slider);
        // Row 4: trigger slider
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 主波形区：CH1/CH2 同高；FFT 时两路各自频谱（有绑定才显示 CH2）；双击放大
            Column.create({ space: 4 });
            // 主波形区：CH1/CH2 同高；FFT 时两路各自频谱（有绑定才显示 CH2）；双击放大
            Column.width('100%');
            // 主波形区：CH1/CH2 同高；FFT 时两路各自频谱（有绑定才显示 CH2）；双击放大
            Column.padding({ left: 4, right: 4 });
            globalThis.Gesture.create(GesturePriority.Low);
            TapGesture.create({ count: 2 });
            TapGesture.onAction(() => {
                this.openWaveExpand('osc');
            });
            TapGesture.pop();
            globalThis.Gesture.pop();
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new OscilloscopeWaveCanvas(this, {
                        timeData: this.waveTimeData,
                        voltageData: this.waveVoltageData,
                        frameId: this.oscFrameId,
                        channelLabel: this.oscFftMode ? 'FFT CH1' : 'CH1',
                        waveColor: this.oscFftMode ? '#ffab40' : '#00e676',
                        vPerDiv: this.voltagePerDiv[this.voltageScaleIdx],
                        tPerDiv: this.timebaseSecPerDiv(),
                        triggerLevel: this.triggerLevel,
                        autoFit: this.oscAutoFit,
                        freqDomain: this.oscFftMode,
                        canvasHeight: this.oscCanvasHeight,
                        showStats: true
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1194, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            timeData: this.waveTimeData,
                            voltageData: this.waveVoltageData,
                            frameId: this.oscFrameId,
                            channelLabel: this.oscFftMode ? 'FFT CH1' : 'CH1',
                            waveColor: this.oscFftMode ? '#ffab40' : '#00e676',
                            vPerDiv: this.voltagePerDiv[this.voltageScaleIdx],
                            tPerDiv: this.timebaseSecPerDiv(),
                            triggerLevel: this.triggerLevel,
                            autoFit: this.oscAutoFit,
                            freqDomain: this.oscFftMode,
                            canvasHeight: this.oscCanvasHeight,
                            showStats: true
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        timeData: this.waveTimeData,
                        voltageData: this.waveVoltageData,
                        frameId: this.oscFrameId,
                        channelLabel: this.oscFftMode ? 'FFT CH1' : 'CH1',
                        waveColor: this.oscFftMode ? '#ffab40' : '#00e676',
                        vPerDiv: this.voltagePerDiv[this.voltageScaleIdx],
                        tPerDiv: this.timebaseSecPerDiv(),
                        triggerLevel: this.triggerLevel,
                        autoFit: this.oscAutoFit,
                        freqDomain: this.oscFftMode,
                        canvasHeight: this.oscCanvasHeight,
                        showStats: true
                    });
                }
            }, { name: "OscilloscopeWaveCanvas" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.waveCh2Data.length > 1) {
                this.ifElseBranchUpdateFunction(0, () => {
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new OscilloscopeWaveCanvas(this, {
                                    timeData: this.waveCh2TimeData.length > 1 ? this.waveCh2TimeData : this.waveTimeData,
                                    voltageData: this.waveCh2Data,
                                    frameId: this.oscFrameId,
                                    channelLabel: this.oscFftMode ? 'FFT CH2' : 'CH2',
                                    waveColor: this.oscFftMode ? '#ffd54f' : '#40c4ff',
                                    vPerDiv: this.voltagePerDiv[this.voltageScaleIdx],
                                    tPerDiv: this.timebaseSecPerDiv(),
                                    triggerLevel: this.triggerLevel,
                                    autoFit: this.oscAutoFit,
                                    freqDomain: this.oscFftMode,
                                    canvasHeight: this.oscCanvasHeight,
                                    showStats: true
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1209, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        timeData: this.waveCh2TimeData.length > 1 ? this.waveCh2TimeData : this.waveTimeData,
                                        voltageData: this.waveCh2Data,
                                        frameId: this.oscFrameId,
                                        channelLabel: this.oscFftMode ? 'FFT CH2' : 'CH2',
                                        waveColor: this.oscFftMode ? '#ffd54f' : '#40c4ff',
                                        vPerDiv: this.voltagePerDiv[this.voltageScaleIdx],
                                        tPerDiv: this.timebaseSecPerDiv(),
                                        triggerLevel: this.triggerLevel,
                                        autoFit: this.oscAutoFit,
                                        freqDomain: this.oscFftMode,
                                        canvasHeight: this.oscCanvasHeight,
                                        showStats: true
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    timeData: this.waveCh2TimeData.length > 1 ? this.waveCh2TimeData : this.waveTimeData,
                                    voltageData: this.waveCh2Data,
                                    frameId: this.oscFrameId,
                                    channelLabel: this.oscFftMode ? 'FFT CH2' : 'CH2',
                                    waveColor: this.oscFftMode ? '#ffd54f' : '#40c4ff',
                                    vPerDiv: this.voltagePerDiv[this.voltageScaleIdx],
                                    tPerDiv: this.timebaseSecPerDiv(),
                                    triggerLevel: this.triggerLevel,
                                    autoFit: this.oscAutoFit,
                                    freqDomain: this.oscFftMode,
                                    canvasHeight: this.oscCanvasHeight,
                                    showStats: true
                                });
                            }
                        }, { name: "OscilloscopeWaveCanvas" });
                    }
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.WaveExpandHint.bind(this)();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.oscStatsText.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.oscStatsText);
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.HOVER_PREVIEW);
                        Text.maxLines(2);
                        Text.width('100%');
                        Text.padding({ left: 4, right: 4 });
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
        // 主波形区：CH1/CH2 同高；FFT 时两路各自频谱（有绑定才显示 CH2）；双击放大
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // Cursors
            Column.create({ space: 2 });
            // Cursors
            Column.width('100%');
            // Cursors
            Column.padding({ left: 8, right: 8, bottom: 8 });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('A:');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width(16);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Slider.create({ value: this.cursorAIdx, min: 0, max: 1023, step: 1 });
            Slider.layoutWeight(1);
            Slider.height(ProteusDimens.PARAM_ROW_HEIGHT);
            Slider.onChange((v: number) => { this.cursorAIdx = v; this.updateCursorMeasure(); });
        }, Slider);
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('B:');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width(16);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Slider.create({ value: this.cursorBIdx, min: 0, max: 1023, step: 1 });
            Slider.layoutWeight(1);
            Slider.height(ProteusDimens.PARAM_ROW_HEIGHT);
            Slider.onChange((v: number) => { this.cursorBIdx = v; this.updateCursorMeasure(); });
        }, Slider);
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.cursorMeasureText.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
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
        // Cursors
        Column.pop();
        Column.pop();
        Scroll.pop();
    }
    private timebaseSecPerDiv(): number {
        const secs: number[] = [10e-9, 1e-6, 100e-6, 1e-3, 10e-3, 100e-3, 1, 10];
        return this.timebaseIdx < secs.length ? secs[this.timebaseIdx] : 1e-3;
    }
    /** Sync panel Select + engine when 自适应 is on (freq / Vpp driven). */
    private applyOscAutoScale(): void {
        const r = this.appService.instruments.autoAdjustOscilloscope(0);
        if (!r.success || r.data === undefined) {
            return;
        }
        // 始终把面板档位跟引擎对齐（含 hysteresis 未改时的当前档），
        // 否则 Canvas tPerDiv 与引擎截窗不一致，看起来像「自适应不滚动」。
        const tbIdx = this.timebases.indexOf(r.data.timebase);
        if (tbIdx >= 0) {
            this.timebaseIdx = tbIdx;
        }
        const vsIdx = this.voltageScales.indexOf(r.data.voltageScale);
        if (vsIdx >= 0) {
            this.voltageScaleIdx = vsIdx;
        }
    }
    private captureWave(): void {
        if (this.appService.findFirstSchematicInstrumentId('osc').length === 0) {
            this.waveTimeData = [];
            this.waveVoltageData = [];
            this.waveCh2TimeData = [];
            this.waveCh2Data = [];
            this.oscLiveVolts = '--';
            this.oscStatsText = '请先在原理图放置示波器';
            this.oscFrameId = this.oscFrameId + 1;
            return;
        }
        for (let ch = 0; ch < 4; ch++) {
            const snap = this.appService.instruments.getOscilloscopeWave(ch);
            if (snap.success && snap.data) {
                if (ch === 0) {
                    if (snap.data.voltageAxis.length < 2 ||
                        !InstrumentPanel.isDisplayableScopeWave(snap.data.netName, snap.data.probeName)) {
                        this.waveTimeData = [];
                        this.waveVoltageData = [];
                        this.oscFrameId = this.oscFrameId + 1;
                        continue;
                    }
                    this.oscFftMode = snap.data.waveType === 'freq' || snap.data.netName === 'MATH_FFT';
                    this.waveTimeData = snap.data.timeAxis.slice();
                    this.waveVoltageData = snap.data.voltageAxis.slice();
                    this.oscFrameId = this.oscFrameId + 1;
                    this.updateOscStatsText(snap.data.voltageAxis, snap.data.timeAxis);
                    const last = InstrumentPanel.lastFinite(snap.data.voltageAxis);
                    if (last !== null) {
                        this.oscLiveVolts = this.oscFftMode
                            ? `${last.toFixed(1)} dB`
                            : `${last.toFixed(3)} V`;
                    }
                }
                else if (ch === 1) {
                    if (InstrumentPanel.isDisplayableScopeWave(snap.data.netName, snap.data.probeName) &&
                        snap.data.voltageAxis.length >= 2) {
                        this.waveCh2TimeData = snap.data.timeAxis.slice();
                        this.waveCh2Data = snap.data.voltageAxis.slice();
                    }
                    else {
                        this.waveCh2TimeData = [];
                        this.waveCh2Data = [];
                    }
                }
            }
        }
        this.syncExpandSessionAfterRefresh();
    }
    /** CH2+ only when bound to a real net (not placeholder OSC_CHx / CHx). */
    private static isLiveScopeChannel(netName: string): boolean {
        if (netName.length === 0) {
            return false;
        }
        const upper = netName.toUpperCase();
        if (upper.startsWith('OSC_CH')) {
            return false;
        }
        // resampleWave / flat 占位名 CH1、CH2…
        if (upper.startsWith('CH') && upper.length >= 3) {
            let allDigits = true;
            for (let i = 2; i < upper.length; i++) {
                const c = upper.charCodeAt(i);
                if (c < 48 || c > 57) {
                    allDigits = false;
                    break;
                }
            }
            if (allDigits) {
                return false;
            }
        }
        return true;
    }
    /** 时域看 netName；FFT 结果 netName 恒为 MATH_FFT，改看 probeName 内层（FFT(OUT)）。 */
    private static isDisplayableScopeWave(netName: string, probeName: string): boolean {
        if (netName.length === 0 && (probeName.length === 0 || /^CH\d+$/i.test(probeName))) {
            return false;
        }
        if (netName === 'MATH_FFT') {
            let inner = probeName;
            if (probeName.startsWith('FFT(') && probeName.endsWith(')') && probeName.length > 5) {
                inner = probeName.substring(4, probeName.length - 1);
            }
            return InstrumentPanel.isLiveScopeChannel(inner);
        }
        return InstrumentPanel.isLiveScopeChannel(netName);
    }
    private static lastFinite(values: number[]): number | null {
        for (let i = values.length - 1; i >= 0; i--) {
            const v = values[i];
            if (Number.isFinite(v)) {
                return v;
            }
        }
        return null;
    }
    private static countFinite(values: number[]): number {
        let n = 0;
        for (let i = 0; i < values.length; i++) {
            if (Number.isFinite(values[i])) {
                n++;
            }
        }
        return n;
    }
    private updateOscStatsText(volts: number[], times: number[]): void {
        if (volts.length < 2) {
            this.oscStatsText = '';
            return;
        }
        let minV = Number.POSITIVE_INFINITY;
        let maxV = Number.NEGATIVE_INFINITY;
        let sum = 0;
        let count = 0;
        for (let i = 0; i < volts.length; i++) {
            const v = volts[i];
            if (!Number.isFinite(v)) {
                continue;
            }
            if (v < minV) {
                minV = v;
            }
            if (v > maxV) {
                maxV = v;
            }
            sum += v;
            count++;
        }
        if (count < 2) {
            this.oscStatsText = '';
            return;
        }
        const avg = sum / count;
        const m = this.appService.instruments.measureCursors(0, volts.length - 1);
        let freqText = '--';
        if (m.success && m.data !== undefined && m.data.frequency > 0) {
            const f = m.data.frequency;
            if (f >= 1000) {
                freqText = `${(f / 1000).toFixed(1)} kHz`;
            }
            else {
                freqText = `${f.toFixed(1)} Hz`;
            }
        }
        const tSpan = Math.abs(times[times.length - 1] - times[0]);
        let spanText = `${(tSpan * 1e6).toFixed(1)} us`;
        if (tSpan >= 1) {
            spanText = `${tSpan.toFixed(3)} s`;
        }
        else if (tSpan >= 1e-3) {
            spanText = `${(tSpan * 1e3).toFixed(2)} ms`;
        }
        this.oscStatsText =
            `窗宽 ${spanText}  |  Vmin ${minV.toFixed(3)}V  Vmax ${maxV.toFixed(3)}V  Avg ${avg.toFixed(3)}V  |  f ${freqText}`;
    }
    // ==================== Logic Analyzer ====================
    LogicPanel(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Scroll.create();
            Scroll.width('100%');
            Scroll.height('100%');
        }, Scroll);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 8 });
            Column.width('100%');
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 6 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('通道');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width(32);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Select.create(this.selLogicCh);
            Select.selected(0);
            Select.font({ size: 11 });
            Select.fontColor(ProteusColors.TEXT_PRIMARY);
            Select.backgroundColor(ProteusColors.CANVAS_BG);
            Select.layoutWeight(1);
            Select.height(ProteusDimens.PARAM_ROW_HEIGHT);
            Select.onSelect((idx: number) => {
                this.logicChannels = [8, 16, 32][idx];
                this.appService.instruments.setChannels(this.logicChannels);
            });
        }, Select);
        Select.pop();
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('阈值');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width(32);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            __Common__.create();
            __Common__.layoutWeight(1);
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusTextInput(this, {
                        text: `${this.threshold}`,
                        onChange: (v: string) => {
                            this.threshold = parseInt(v) || 1500;
                            this.appService.instruments.setThreshold(this.threshold);
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1479, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            text: `${this.threshold}`,
                            onChange: (v: string) => {
                                this.threshold = parseInt(v) || 1500;
                                this.appService.instruments.setThreshold(this.threshold);
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        text: `${this.threshold}`
                    });
                }
            }, { name: "ProteusTextInput" });
        }
        __Common__.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('mV');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.width(24);
        }, Text);
        Text.pop();
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: 'UART', widthVal: '48%',
                        onAction: () => { this.appService.instruments.decodeBus(LogicDecodeProtocol.UART, 115200); this.refreshDecodedFrames(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1495, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'UART',
                            widthVal: '48%',
                            onAction: () => { this.appService.instruments.decodeBus(LogicDecodeProtocol.UART, 115200); this.refreshDecodedFrames(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'UART', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: 'I2C', widthVal: '48%',
                        onAction: () => { this.appService.instruments.decodeBus(LogicDecodeProtocol.I2C); this.refreshDecodedFrames(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1497, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'I2C',
                            widthVal: '48%',
                            onAction: () => { this.appService.instruments.decodeBus(LogicDecodeProtocol.I2C); this.refreshDecodedFrames(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'I2C', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: 'SPI', widthVal: '48%',
                        onAction: () => { this.appService.instruments.decodeBus(LogicDecodeProtocol.SPI); this.refreshDecodedFrames(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1503, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'SPI',
                            widthVal: '48%',
                            onAction: () => { this.appService.instruments.decodeBus(LogicDecodeProtocol.SPI); this.refreshDecodedFrames(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'SPI', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: 'CAN', widthVal: '48%',
                        onAction: () => { this.appService.instruments.decodeBus(LogicDecodeProtocol.CAN); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1505, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'CAN',
                            widthVal: '48%',
                            onAction: () => { this.appService.instruments.decodeBus(LogicDecodeProtocol.CAN); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'CAN', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '采样', widthVal: '100%',
                        onAction: () => { this.captureLogic(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1511, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '采样',
                            widthVal: '100%',
                            onAction: () => { this.captureLogic(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '采样', widthVal: '100%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.padding({ left: 4, right: 4 });
            globalThis.Gesture.create(GesturePriority.Low);
            TapGesture.create({ count: 2 });
            TapGesture.onAction(() => {
                this.openWaveExpand('la');
            });
            TapGesture.pop();
            globalThis.Gesture.pop();
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.logicChannelData.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new LogicAnalyzerWaveCanvas(this, {
                                    channelData: this.logicChannelData,
                                    channelCount: this.logicChannels,
                                    sampleCount: this.logicSampleCount,
                                    canvasHeight: 200
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1518, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        channelData: this.logicChannelData,
                                        channelCount: this.logicChannels,
                                        sampleCount: this.logicSampleCount,
                                        canvasHeight: 200
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    channelData: this.logicChannelData,
                                    channelCount: this.logicChannels,
                                    sampleCount: this.logicSampleCount,
                                    canvasHeight: 200
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
        this.WaveExpandHint.bind(this)();
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.decodedFramesText.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
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
        const snap = this.appService.instruments.getLogicWaveData();
        if (snap.success && snap.data) {
            const channels: number[][] = [];
            for (let i = 0; i < snap.data.length; i++) {
                const wave = snap.data[i];
                const bits: number[] = [];
                for (let j = 0; j < wave.voltageAxis.length; j++) {
                    bits.push(wave.voltageAxis[j] > 0.5 ? 1 : 0);
                }
                channels.push(bits);
            }
            this.logicChannelData = channels;
            this.logicSampleCount = channels.length > 0 ? channels[0].length : 128;
            this.statusMessage = `逻辑采样: ${channels.length} 通道`;
            this.syncExpandSessionAfterRefresh();
        }
        else {
            this.statusMessage = '逻辑采样失败';
        }
    }
    // ==================== Multimeter ====================
    MmPanel(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 8 });
            Column.width('100%');
            Column.height('100%');
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 6 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: 'DCV', widthVal: '48%',
                        onAction: () => { this.mmMode = 'DCV'; this.appService.instruments.setMode(MultimeterMode.DCV); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1576, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'DCV',
                            widthVal: '48%',
                            onAction: () => { this.mmMode = 'DCV'; this.appService.instruments.setMode(MultimeterMode.DCV); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'DCV', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: 'ACV', widthVal: '48%',
                        onAction: () => { this.mmMode = 'ACV'; this.appService.instruments.setMode(MultimeterMode.ACV); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1578, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'ACV',
                            widthVal: '48%',
                            onAction: () => { this.mmMode = 'ACV'; this.appService.instruments.setMode(MultimeterMode.ACV); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'ACV', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: 'OHM', widthVal: '32%',
                        onAction: () => {
                            this.mmMode = 'OHM';
                            this.appService.instruments.setMode(MultimeterMode.RESISTANCE);
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1584, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'OHM',
                            widthVal: '32%',
                            onAction: () => {
                                this.mmMode = 'OHM';
                                this.appService.instruments.setMode(MultimeterMode.RESISTANCE);
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'OHM', widthVal: '32%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: 'AMP', widthVal: '32%',
                        onAction: () => {
                            this.mmMode = 'AMP';
                            this.appService.instruments.setMode(MultimeterMode.CURRENT);
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1589, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'AMP',
                            widthVal: '32%',
                            onAction: () => {
                                this.mmMode = 'AMP';
                                this.appService.instruments.setMode(MultimeterMode.CURRENT);
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'AMP', widthVal: '32%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: 'DIODE', widthVal: '32%',
                        onAction: () => {
                            this.mmMode = 'DIODE';
                            this.appService.instruments.setMode(MultimeterMode.DIODE);
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1594, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'DIODE',
                            widthVal: '32%',
                            onAction: () => {
                                this.mmMode = 'DIODE';
                                this.appService.instruments.setMode(MultimeterMode.DIODE);
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'DIODE', widthVal: '32%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.layoutWeight(1);
            Column.width('100%');
            Column.justifyContent(FlexAlign.Center);
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new LiveReadout(this, {
                        label: this.mmMode,
                        value: this.mmReading,
                        unit: '',
                        pulse: this.uiPulse
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1603, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: this.mmMode,
                            value: this.mmReading,
                            unit: '',
                            pulse: this.uiPulse
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: this.mmMode,
                        value: this.mmReading,
                        unit: '',
                        pulse: this.uiPulse
                    });
                }
            }, { name: "LiveReadout" });
        }
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 8 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, bottom: 8 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '自动量程', widthVal: '42%',
                        onAction: () => { this.appService.instruments.autoRange(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1613, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '自动量程',
                            widthVal: '42%',
                            onAction: () => { this.appService.instruments.autoRange(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '自动量程', widthVal: '42%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '测量', widthVal: '42%',
                        onAction: () => {
                            const r = this.appService.instruments.measure();
                            this.statusMessage = r.success ? `万用表读数: ${r.data?.toFixed(4)}` : '测量失败';
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1615, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '测量',
                            widthVal: '42%',
                            onAction: () => {
                                const r = this.appService.instruments.measure();
                                this.statusMessage = r.success ? `万用表读数: ${r.data?.toFixed(4)}` : '测量失败';
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '测量', widthVal: '42%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        Column.pop();
    }
    // ==================== Signal Generator ====================
    SigGenPanel(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 8 });
            Column.width('100%');
            Column.height('100%');
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 6 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '正弦', widthVal: '48%',
                        onAction: () => {
                            this.statusMessage = this.appService.applySignalGenWaveform(SignalWaveform.SINE, this.selectedComponentId);
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1631, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '正弦',
                            widthVal: '48%',
                            onAction: () => {
                                this.statusMessage = this.appService.applySignalGenWaveform(SignalWaveform.SINE, this.selectedComponentId);
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '正弦', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '方波', widthVal: '48%',
                        onAction: () => {
                            this.statusMessage = this.appService.applySignalGenWaveform(SignalWaveform.SQUARE, this.selectedComponentId);
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1636, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '方波',
                            widthVal: '48%',
                            onAction: () => {
                                this.statusMessage = this.appService.applySignalGenWaveform(SignalWaveform.SQUARE, this.selectedComponentId);
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '方波', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '三角', widthVal: '32%',
                        onAction: () => {
                            this.statusMessage = this.appService.applySignalGenWaveform(SignalWaveform.TRIANGLE, this.selectedComponentId);
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1645, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '三角',
                            widthVal: '32%',
                            onAction: () => {
                                this.statusMessage = this.appService.applySignalGenWaveform(SignalWaveform.TRIANGLE, this.selectedComponentId);
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '三角', widthVal: '32%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '锯齿', widthVal: '32%',
                        onAction: () => {
                            this.statusMessage = this.appService.applySignalGenWaveform(SignalWaveform.SAW, this.selectedComponentId);
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1650, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '锯齿',
                            widthVal: '32%',
                            onAction: () => {
                                this.statusMessage = this.appService.applySignalGenWaveform(SignalWaveform.SAW, this.selectedComponentId);
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '锯齿', widthVal: '32%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '脉冲', widthVal: '32%',
                        onAction: () => {
                            this.statusMessage = this.appService.applySignalGenWaveform(SignalWaveform.PULSE, this.selectedComponentId);
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1655, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '脉冲',
                            widthVal: '32%',
                            onAction: () => {
                                this.statusMessage = this.appService.applySignalGenWaveform(SignalWaveform.PULSE, this.selectedComponentId);
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '脉冲', widthVal: '32%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: 'Burst', widthVal: '48%',
                        onAction: () => { this.appService.instruments.setBurstMode(true, 5); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1664, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'Burst',
                            widthVal: '48%',
                            onAction: () => { this.appService.instruments.setBurstMode(true, 5); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'Burst', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 6 });
            Column.layoutWeight(1);
            Column.width('100%');
            Column.justifyContent(FlexAlign.Center);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('92%');
            Row.alignItems(VerticalAlign.Center);
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('频率');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width(48);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            __Common__.create();
            __Common__.layoutWeight(1);
            __Common__.height(30);
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusTextInput(this, {
                        text: this.freq, mono: true,
                        onChange: (v: string) => { this.freq = v; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1672, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            text: this.freq,
                            mono: true,
                            onChange: (v: string) => { this.freq = v; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        text: this.freq, mono: true
                    });
                }
            }, { name: "ProteusTextInput" });
        }
        __Common__.pop();
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('92%');
            Row.alignItems(VerticalAlign.Center);
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('振幅');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width(48);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            __Common__.create();
            __Common__.layoutWeight(1);
            __Common__.height(30);
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusTextInput(this, {
                        text: this.sigAmp, mono: true,
                        onChange: (v: string) => { this.sigAmp = v; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1680, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            text: this.sigAmp,
                            mono: true,
                            onChange: (v: string) => { this.sigAmp = v; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        text: this.sigAmp, mono: true
                    });
                }
            }, { name: "ProteusTextInput" });
        }
        __Common__.pop();
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('92%');
            Row.alignItems(VerticalAlign.Center);
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('偏置');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width(48);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            __Common__.create();
            __Common__.layoutWeight(1);
            __Common__.height(30);
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusTextInput(this, {
                        text: this.sigOffset, mono: true,
                        onChange: (v: string) => { this.sigOffset = v; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1688, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            text: this.sigOffset,
                            mono: true,
                            onChange: (v: string) => { this.sigOffset = v; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        text: this.sigOffset, mono: true
                    });
                }
            }, { name: "ProteusTextInput" });
        }
        __Common__.pop();
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('92%');
            Row.alignItems(VerticalAlign.Center);
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('占空比%');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width(48);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            __Common__.create();
            __Common__.layoutWeight(1);
            __Common__.height(30);
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusTextInput(this, {
                        text: this.sigDuty, mono: true,
                        onChange: (v: string) => { this.sigDuty = v; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1696, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            text: this.sigDuty,
                            mono: true,
                            onChange: (v: string) => { this.sigDuty = v; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        text: this.sigDuty, mono: true
                    });
                }
            }, { name: "ProteusTextInput" });
        }
        __Common__.pop();
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('占空比对方波有效；频率支持 1kHz / 500Hz 等写法');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.width('92%');
        }, Text);
        Text.pop();
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            __Common__.create();
            __Common__.margin({ left: 8, right: 8, bottom: 8 });
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '应用参数', widthVal: '86%',
                        onAction: () => {
                            const fp = UnitParser.parseFrequency(this.freq);
                            const amp = parseFloat(this.sigAmp.replace(/[Vv]/g, ''));
                            const off = parseFloat(this.sigOffset.replace(/[Vv]/g, ''));
                            const duty = parseFloat(this.sigDuty.replace(/%/g, ''));
                            if (!fp.valid || fp.numeric <= 0) {
                                this.statusMessage = `频率无效: ${this.freq}`;
                                return;
                            }
                            if (!Number.isFinite(amp) || !Number.isFinite(off) || !Number.isFinite(duty)) {
                                this.statusMessage = '振幅/偏置/占空比无效';
                                return;
                            }
                            if (duty <= 0 || duty > 100) {
                                this.statusMessage = '占空比须在 1–100%';
                                return;
                            }
                            this.statusMessage = this.appService.applySignalGenParams(fp.numeric, amp, off, duty, this.selectedComponentId);
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1709, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '应用参数',
                            widthVal: '86%',
                            onAction: () => {
                                const fp = UnitParser.parseFrequency(this.freq);
                                const amp = parseFloat(this.sigAmp.replace(/[Vv]/g, ''));
                                const off = parseFloat(this.sigOffset.replace(/[Vv]/g, ''));
                                const duty = parseFloat(this.sigDuty.replace(/%/g, ''));
                                if (!fp.valid || fp.numeric <= 0) {
                                    this.statusMessage = `频率无效: ${this.freq}`;
                                    return;
                                }
                                if (!Number.isFinite(amp) || !Number.isFinite(off) || !Number.isFinite(duty)) {
                                    this.statusMessage = '振幅/偏置/占空比无效';
                                    return;
                                }
                                if (duty <= 0 || duty > 100) {
                                    this.statusMessage = '占空比须在 1–100%';
                                    return;
                                }
                                this.statusMessage = this.appService.applySignalGenParams(fp.numeric, amp, off, duty, this.selectedComponentId);
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '应用参数', widthVal: '86%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        __Common__.pop();
        Column.pop();
    }
    // ==================== UART Terminal ====================
    UartPanel(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 6 });
            Column.width('100%');
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 4 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 6 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            __Common__.create();
            __Common__.layoutWeight(1);
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusTextInput(this, {
                        text: this.uartHex,
                        placeholder: 'HEX: 55 AA',
                        onChange: (v: string) => { this.uartHex = v; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1742, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            text: this.uartHex,
                            placeholder: 'HEX: 55 AA',
                            onChange: (v: string) => { this.uartHex = v; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        text: this.uartHex,
                        placeholder: 'HEX: 55 AA'
                    });
                }
            }, { name: "ProteusTextInput" });
        }
        __Common__.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '发', widthVal: 36,
                        onAction: () => {
                            this.appService.instruments.uartHexSend(this.uartHex);
                            this.uartLog = this.appService.instruments.getUartLog();
                            const looped = this.appService.instruments.isUartLoopback();
                            this.statusMessage = looped
                                ? `环回已回显: ${this.uartHex}`
                                : `已发送: ${this.uartHex}`;
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1748, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '发',
                            widthVal: 36,
                            onAction: () => {
                                this.appService.instruments.uartHexSend(this.uartHex);
                                this.uartLog = this.appService.instruments.getUartLog();
                                const looped = this.appService.instruments.isUartLoopback();
                                this.statusMessage = looped
                                    ? `环回已回显: ${this.uartHex}`
                                    : `已发送: ${this.uartHex}`;
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '发', widthVal: 36
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '收', widthVal: 36,
                        onAction: () => {
                            // Show full TX/RX log — not hexReceive() raw buffer (was 5555… spam)
                            this.uartLog = this.appService.instruments.getUartLog();
                            this.statusMessage = this.uartLog.length > 0 ? '已刷新接收日志' : '暂无数据';
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1757, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '收',
                            widthVal: 36,
                            onAction: () => {
                                // Show full TX/RX log — not hexReceive() raw buffer (was 5555… spam)
                                this.uartLog = this.appService.instruments.getUartLog();
                                this.statusMessage = this.uartLog.length > 0 ? '已刷新接收日志' : '暂无数据';
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '收', widthVal: 36
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('接收日志');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_LABEL);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.uartLog.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('清空');
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                        Text.padding({ left: 6, right: 6, top: 2, bottom: 2 });
                        Text.onClick(() => {
                            this.appService.instruments.clearUartLog();
                            this.uartLog = '';
                        });
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
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 独立滚动视口：日志变长时不撑爆右侧栏，也不与发送行互相挤压
            Scroll.create();
            // 独立滚动视口：日志变长时不撑爆右侧栏，也不与发送行互相挤压
            Scroll.width('100%');
            // 独立滚动视口：日志变长时不撑爆右侧栏，也不与发送行互相挤压
            Scroll.height(120);
            // 独立滚动视口：日志变长时不撑爆右侧栏，也不与发送行互相挤压
            Scroll.padding(6);
            // 独立滚动视口：日志变长时不撑爆右侧栏，也不与发送行互相挤压
            Scroll.margin({ left: 8, right: 8, bottom: 8 });
            // 独立滚动视口：日志变长时不撑爆右侧栏，也不与发送行互相挤压
            Scroll.backgroundColor(ProteusColors.INPUT_READONLY_BG);
            // 独立滚动视口：日志变长时不撑爆右侧栏，也不与发送行互相挤压
            Scroll.border({ width: 1, color: ProteusColors.DIVIDER });
            // 独立滚动视口：日志变长时不撑爆右侧栏，也不与发送行互相挤压
            Scroll.scrollBar(BarState.Auto);
            // 独立滚动视口：日志变长时不撑爆右侧栏，也不与发送行互相挤压
            Scroll.align(Alignment.TopStart);
            // 独立滚动视口：日志变长时不撑爆右侧栏，也不与发送行互相挤压
            Scroll.edgeEffect(EdgeEffect.None);
        }, Scroll);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.uartLog.length > 0 ? this.uartLog : '等待接收数据...');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(this.uartLog.length > 0 ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_SECONDARY);
            Text.fontFamily('monospace');
            Text.width('100%');
            Text.textAlign(TextAlign.Start);
        }, Text);
        Text.pop();
        // 独立滚动视口：日志变长时不撑爆右侧栏，也不与发送行互相挤压
        Scroll.pop();
        Column.pop();
    }
    // ==================== Voltmeter ====================
    VoltmeterPanel(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 6 });
            Column.width('100%');
            Column.height('100%');
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 4 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 6 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: 'DC', widthVal: 36,
                        onAction: () => {
                            this.vmType = 0;
                            this.vmUnit = 'V DC';
                            this.appService.instruments.setVoltmeterType(VoltmeterType.DC);
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1812, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
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
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'DC', widthVal: 36
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: 'AC', widthVal: 36,
                        onAction: () => {
                            // VOLTMETER_DC symbol is a DC meter; keep AC optional only for generic meters
                            const lib = this.selectionLibraryId.toUpperCase();
                            if (lib.includes('VOLTMETER_DC')) {
                                this.vmType = 0;
                                this.vmUnit = 'V DC';
                                this.appService.instruments.setVoltmeterType(VoltmeterType.DC);
                                this.statusMessage = 'VOLTMETER_DC 固定为直流档';
                                return;
                            }
                            this.vmType = 1;
                            this.vmUnit = 'V AC';
                            this.appService.instruments.setVoltmeterType(VoltmeterType.AC);
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1817, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'AC',
                            widthVal: 36,
                            onAction: () => {
                                // VOLTMETER_DC symbol is a DC meter; keep AC optional only for generic meters
                                const lib = this.selectionLibraryId.toUpperCase();
                                if (lib.includes('VOLTMETER_DC')) {
                                    this.vmType = 0;
                                    this.vmUnit = 'V DC';
                                    this.appService.instruments.setVoltmeterType(VoltmeterType.DC);
                                    this.statusMessage = 'VOLTMETER_DC 固定为直流档';
                                    return;
                                }
                                this.vmType = 1;
                                this.vmUnit = 'V AC';
                                this.appService.instruments.setVoltmeterType(VoltmeterType.AC);
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'AC', widthVal: 36
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`量程: ${this.vmRange}`);
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
        }, Text);
        Text.pop();
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 8 });
            Column.layoutWeight(1);
            Column.width('100%');
            Column.justifyContent(FlexAlign.Center);
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new LiveReadout(this, {
                        label: 'VOLTAGE',
                        value: this.vmReading,
                        unit: this.vmUnit,
                        pulse: this.uiPulse
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1838, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'VOLTAGE',
                            value: this.vmReading,
                            unit: this.vmUnit,
                            pulse: this.uiPulse
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'VOLTAGE',
                        value: this.vmReading,
                        unit: this.vmUnit,
                        pulse: this.uiPulse
                    });
                }
            }, { name: "LiveReadout" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 固定高度波形区，避免有/无数据时布局跳动；双击放大
            Column.create();
            // 固定高度波形区，避免有/无数据时布局跳动；双击放大
            Column.width('92%');
            globalThis.Gesture.create(GesturePriority.Low);
            TapGesture.create({ count: 2 });
            TapGesture.onAction(() => {
                this.openWaveExpand('vm');
            });
            TapGesture.pop();
            globalThis.Gesture.pop();
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new OscilloscopeWaveCanvas(this, {
                        timeData: this.vmWaveTime,
                        voltageData: this.vmWaveData,
                        frameId: this.vmWaveFrame,
                        channelLabel: 'ΔV',
                        waveColor: '#66bb6a',
                        vPerDiv: 1,
                        tPerDiv: this.vmTPerDiv,
                        triggerLevel: 0,
                        autoFit: true,
                        canvasHeight: this.meterCanvasHeight,
                        showStats: false
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1846, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            timeData: this.vmWaveTime,
                            voltageData: this.vmWaveData,
                            frameId: this.vmWaveFrame,
                            channelLabel: 'ΔV',
                            waveColor: '#66bb6a',
                            vPerDiv: 1,
                            tPerDiv: this.vmTPerDiv,
                            triggerLevel: 0,
                            autoFit: true,
                            canvasHeight: this.meterCanvasHeight,
                            showStats: false
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        timeData: this.vmWaveTime,
                        voltageData: this.vmWaveData,
                        frameId: this.vmWaveFrame,
                        channelLabel: 'ΔV',
                        waveColor: '#66bb6a',
                        vPerDiv: 1,
                        tPerDiv: this.vmTPerDiv,
                        triggerLevel: 0,
                        autoFit: true,
                        canvasHeight: this.meterCanvasHeight,
                        showStats: false
                    });
                }
            }, { name: "OscilloscopeWaveCanvas" });
        }
        this.WaveExpandHint.bind(this)();
        // 固定高度波形区，避免有/无数据时布局跳动；双击放大
        Column.pop();
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 8 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, bottom: 8 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '自动量程', widthVal: '42%',
                        onAction: () => {
                            this.appService.instruments.voltmeterAutoRange();
                            const cfg = this.appService.instruments.getVoltmeterConfig();
                            if (cfg.success && cfg.data) {
                                this.vmRange = `${cfg.data.range}V`;
                            }
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1872, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '自动量程',
                            widthVal: '42%',
                            onAction: () => {
                                this.appService.instruments.voltmeterAutoRange();
                                const cfg = this.appService.instruments.getVoltmeterConfig();
                                if (cfg.success && cfg.data) {
                                    this.vmRange = `${cfg.data.range}V`;
                                }
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '自动量程', widthVal: '42%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '测量', widthVal: '42%',
                        onAction: () => {
                            let reading: number | null = null;
                            let readId = '';
                            if (this.selectedComponentId.length > 0 &&
                                detectInstrumentKind(this.selectionLibraryId) === 'vm') {
                                readId = this.selectedComponentId;
                            }
                            if (readId.length === 0) {
                                readId = this.appService.findFirstSchematicInstrumentId('vm');
                            }
                            if (readId.length > 0) {
                                const delta = this.appService.readVoltmeterDeltaForComponent(readId);
                                if (delta !== null) {
                                    this.appService.instruments.voltmeterSnapReading(delta);
                                    reading = delta;
                                }
                            }
                            if (reading === null) {
                                const r = this.appService.instruments.voltmeterMeasure();
                                if (r.success && r.data !== undefined) {
                                    reading = r.data;
                                }
                            }
                            if (reading !== null) {
                                this.vmReading = reading.toFixed(3);
                            }
                            const cfg = this.appService.instruments.getVoltmeterConfig();
                            if (cfg.success && cfg.data) {
                                this.vmRange = `${cfg.data.range}V`;
                                this.vmUnit = cfg.data.unit;
                            }
                            this.statusMessage = `电压表: ${this.vmReading} ${this.vmUnit}`;
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1880, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '测量',
                            widthVal: '42%',
                            onAction: () => {
                                let reading: number | null = null;
                                let readId = '';
                                if (this.selectedComponentId.length > 0 &&
                                    detectInstrumentKind(this.selectionLibraryId) === 'vm') {
                                    readId = this.selectedComponentId;
                                }
                                if (readId.length === 0) {
                                    readId = this.appService.findFirstSchematicInstrumentId('vm');
                                }
                                if (readId.length > 0) {
                                    const delta = this.appService.readVoltmeterDeltaForComponent(readId);
                                    if (delta !== null) {
                                        this.appService.instruments.voltmeterSnapReading(delta);
                                        reading = delta;
                                    }
                                }
                                if (reading === null) {
                                    const r = this.appService.instruments.voltmeterMeasure();
                                    if (r.success && r.data !== undefined) {
                                        reading = r.data;
                                    }
                                }
                                if (reading !== null) {
                                    this.vmReading = reading.toFixed(3);
                                }
                                const cfg = this.appService.instruments.getVoltmeterConfig();
                                if (cfg.success && cfg.data) {
                                    this.vmRange = `${cfg.data.range}V`;
                                    this.vmUnit = cfg.data.unit;
                                }
                                this.statusMessage = `电压表: ${this.vmReading} ${this.vmUnit}`;
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '测量', widthVal: '42%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        Column.pop();
    }
    // ==================== Ammeter ====================
    AmmeterPanel(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 6 });
            Column.width('100%');
            Column.height('100%');
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 4 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 6 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: 'DC', widthVal: 36,
                        onAction: () => {
                            this.amType = 0;
                            this.amUnit = 'mA DC';
                            this.appService.instruments.setAmmeterType(AmmeterType.DC);
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1925, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
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
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'DC', widthVal: 36
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: 'AC', widthVal: 36,
                        onAction: () => {
                            this.amType = 1;
                            this.amUnit = 'mA AC';
                            this.appService.instruments.setAmmeterType(AmmeterType.AC);
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1930, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
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
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'AC', widthVal: 36
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`量程: ${this.amRange}`);
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
        }, Text);
        Text.pop();
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 8 });
            Column.layoutWeight(1);
            Column.width('100%');
            Column.justifyContent(FlexAlign.Center);
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new LiveReadout(this, {
                        label: 'CURRENT',
                        value: this.amReading,
                        unit: this.amUnit,
                        pulse: this.uiPulse
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1943, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'CURRENT',
                            value: this.amReading,
                            unit: this.amUnit,
                            pulse: this.uiPulse
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'CURRENT',
                        value: this.amReading,
                        unit: this.amUnit,
                        pulse: this.uiPulse
                    });
                }
            }, { name: "LiveReadout" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('92%');
            globalThis.Gesture.create(GesturePriority.Low);
            TapGesture.create({ count: 2 });
            TapGesture.onAction(() => {
                this.openWaveExpand('am');
            });
            TapGesture.pop();
            globalThis.Gesture.pop();
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new OscilloscopeWaveCanvas(this, {
                        timeData: this.amWaveTime,
                        voltageData: this.amWaveData,
                        frameId: this.amWaveFrame,
                        channelLabel: 'I(mA)',
                        waveColor: '#ffa726',
                        vPerDiv: 1,
                        tPerDiv: this.amTPerDiv,
                        triggerLevel: 0,
                        autoFit: true,
                        canvasHeight: this.meterCanvasHeight,
                        showStats: false
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1950, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            timeData: this.amWaveTime,
                            voltageData: this.amWaveData,
                            frameId: this.amWaveFrame,
                            channelLabel: 'I(mA)',
                            waveColor: '#ffa726',
                            vPerDiv: 1,
                            tPerDiv: this.amTPerDiv,
                            triggerLevel: 0,
                            autoFit: true,
                            canvasHeight: this.meterCanvasHeight,
                            showStats: false
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        timeData: this.amWaveTime,
                        voltageData: this.amWaveData,
                        frameId: this.amWaveFrame,
                        channelLabel: 'I(mA)',
                        waveColor: '#ffa726',
                        vPerDiv: 1,
                        tPerDiv: this.amTPerDiv,
                        triggerLevel: 0,
                        autoFit: true,
                        canvasHeight: this.meterCanvasHeight,
                        showStats: false
                    });
                }
            }, { name: "OscilloscopeWaveCanvas" });
        }
        this.WaveExpandHint.bind(this)();
        Column.pop();
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 8 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, bottom: 8 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '自动量程', widthVal: '42%',
                        onAction: () => {
                            this.appService.instruments.ammeterAutoRange();
                            const cfg = this.appService.instruments.getAmmeterConfig();
                            if (cfg.success && cfg.data) {
                                this.amRange = `${cfg.data.range}mA`;
                            }
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1976, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '自动量程',
                            widthVal: '42%',
                            onAction: () => {
                                this.appService.instruments.ammeterAutoRange();
                                const cfg = this.appService.instruments.getAmmeterConfig();
                                if (cfg.success && cfg.data) {
                                    this.amRange = `${cfg.data.range}mA`;
                                }
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '自动量程', widthVal: '42%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '测量', widthVal: '42%',
                        onAction: () => {
                            const r = this.appService.instruments.ammeterMeasure();
                            if (r.success && r.data !== undefined) {
                                this.amReading = r.data.toFixed(2);
                            }
                            const cfg = this.appService.instruments.getAmmeterConfig();
                            if (cfg.success && cfg.data) {
                                this.amRange = `${cfg.data.range}mA`;
                                this.amUnit = cfg.data.unit;
                            }
                            this.statusMessage = `电流表: ${this.amReading} ${this.amUnit}`;
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 1984, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '测量',
                            widthVal: '42%',
                            onAction: () => {
                                const r = this.appService.instruments.ammeterMeasure();
                                if (r.success && r.data !== undefined) {
                                    this.amReading = r.data.toFixed(2);
                                }
                                const cfg = this.appService.instruments.getAmmeterConfig();
                                if (cfg.success && cfg.data) {
                                    this.amRange = `${cfg.data.range}mA`;
                                    this.amUnit = cfg.data.unit;
                                }
                                this.statusMessage = `电流表: ${this.amReading} ${this.amUnit}`;
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '测量', widthVal: '42%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        Column.pop();
    }
    // ==================== Power Meter ====================
    PowerMeterPanel(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 6 });
            Column.width('100%');
            Column.height('100%');
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            __Common__.create();
            __Common__.margin({ left: 8, right: 8, top: 8 });
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '开始测量', widthVal: '86%',
                        onAction: () => {
                            const r = this.appService.instruments.powerMeterMeasure();
                            if (r.success && r.data) {
                                this.pmVoltage = r.data.voltage.toFixed(3);
                                this.pmCurrent = (r.data.current * 1000).toFixed(2);
                                this.pmPower = (r.data.power * 1000).toFixed(1);
                                this.pmPF = r.data.powerFactor.toFixed(2);
                            }
                            this.statusMessage = `功率表: ${this.pmPower}mW, PF=${this.pmPF}`;
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 2007, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '开始测量',
                            widthVal: '86%',
                            onAction: () => {
                                const r = this.appService.instruments.powerMeterMeasure();
                                if (r.success && r.data) {
                                    this.pmVoltage = r.data.voltage.toFixed(3);
                                    this.pmCurrent = (r.data.current * 1000).toFixed(2);
                                    this.pmPower = (r.data.power * 1000).toFixed(1);
                                    this.pmPF = r.data.powerFactor.toFixed(2);
                                }
                                this.statusMessage = `功率表: ${this.pmPower}mW, PF=${this.pmPF}`;
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '开始测量', widthVal: '86%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        __Common__.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 6 });
            Column.layoutWeight(1);
            Column.width('100%');
            Column.justifyContent(FlexAlign.Center);
            Column.alignItems(HorizontalAlign.Center);
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new LivePmRow(this, { label: '电压', value: this.pmVoltage, unit: 'V', pulse: this.uiPulse }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 2022, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '电压',
                            value: this.pmVoltage,
                            unit: 'V',
                            pulse: this.uiPulse
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '电压', value: this.pmVoltage, unit: 'V', pulse: this.uiPulse
                    });
                }
            }, { name: "LivePmRow" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new LivePmRow(this, { label: '电流', value: this.pmCurrent, unit: 'mA', pulse: this.uiPulse }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 2023, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '电流',
                            value: this.pmCurrent,
                            unit: 'mA',
                            pulse: this.uiPulse
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '电流', value: this.pmCurrent, unit: 'mA', pulse: this.uiPulse
                    });
                }
            }, { name: "LivePmRow" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new LivePmRow(this, { label: '功率', value: this.pmPower, unit: 'mW', pulse: this.uiPulse }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 2024, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '功率',
                            value: this.pmPower,
                            unit: 'mW',
                            pulse: this.uiPulse
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '功率', value: this.pmPower, unit: 'mW', pulse: this.uiPulse
                    });
                }
            }, { name: "LivePmRow" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new LivePmRow(this, { label: '功率因数', value: this.pmPF, unit: '', pulse: this.uiPulse }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 2025, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '功率因数',
                            value: this.pmPF,
                            unit: '',
                            pulse: this.uiPulse
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '功率因数', value: this.pmPF, unit: '', pulse: this.uiPulse
                    });
                }
            }, { name: "LivePmRow" });
        }
        Column.pop();
        Column.pop();
    }
    // ==================== Frequency Counter ====================
    FreqCounterPanel(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 6 });
            Column.width('100%');
            Column.height('100%');
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 4 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 6 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '0.1s', widthVal: 40,
                        onAction: () => {
                            this.fcGateTime = 0.1;
                            this.appService.instruments.freqCounterSetGateTime(0.1);
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 2038, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '0.1s',
                            widthVal: 40,
                            onAction: () => {
                                this.fcGateTime = 0.1;
                                this.appService.instruments.freqCounterSetGateTime(0.1);
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '0.1s', widthVal: 40
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '1s', widthVal: 36,
                        onAction: () => {
                            this.fcGateTime = 1.0;
                            this.appService.instruments.freqCounterSetGateTime(1.0);
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 2043, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '1s',
                            widthVal: 36,
                            onAction: () => {
                                this.fcGateTime = 1.0;
                                this.appService.instruments.freqCounterSetGateTime(1.0);
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '1s', widthVal: 36
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '10s', widthVal: 36,
                        onAction: () => {
                            this.fcGateTime = 10;
                            this.appService.instruments.freqCounterSetGateTime(10);
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 2048, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '10s',
                            widthVal: 36,
                            onAction: () => {
                                this.fcGateTime = 10;
                                this.appService.instruments.freqCounterSetGateTime(10);
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '10s', widthVal: 36
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`闸门: ${this.fcGateTime}s`);
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
        }, Text);
        Text.pop();
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 8 });
            Column.layoutWeight(1);
            Column.width('100%');
            Column.justifyContent(FlexAlign.Center);
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new LiveReadout(this, {
                        label: 'FREQUENCY',
                        value: this.fcReading,
                        unit: `Gate: ${this.fcGateTime}s`,
                        pulse: this.uiPulse
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 2061, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'FREQUENCY',
                            value: this.fcReading,
                            unit: `Gate: ${this.fcGateTime}s`,
                            pulse: this.uiPulse
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'FREQUENCY',
                        value: this.fcReading,
                        unit: `Gate: ${this.fcGateTime}s`,
                        pulse: this.uiPulse
                    });
                }
            }, { name: "LiveReadout" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('92%');
            globalThis.Gesture.create(GesturePriority.Low);
            TapGesture.create({ count: 2 });
            TapGesture.onAction(() => {
                this.openWaveExpand('fc');
            });
            TapGesture.pop();
            globalThis.Gesture.pop();
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new OscilloscopeWaveCanvas(this, {
                        timeData: this.fcWaveTime,
                        voltageData: this.fcWaveData,
                        frameId: this.fcWaveFrame,
                        channelLabel: 'IN',
                        waveColor: '#42a5f5',
                        vPerDiv: 1,
                        tPerDiv: this.fcTPerDiv,
                        triggerLevel: 0,
                        autoFit: true,
                        canvasHeight: this.meterCanvasHeight,
                        showStats: false
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 2068, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            timeData: this.fcWaveTime,
                            voltageData: this.fcWaveData,
                            frameId: this.fcWaveFrame,
                            channelLabel: 'IN',
                            waveColor: '#42a5f5',
                            vPerDiv: 1,
                            tPerDiv: this.fcTPerDiv,
                            triggerLevel: 0,
                            autoFit: true,
                            canvasHeight: this.meterCanvasHeight,
                            showStats: false
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        timeData: this.fcWaveTime,
                        voltageData: this.fcWaveData,
                        frameId: this.fcWaveFrame,
                        channelLabel: 'IN',
                        waveColor: '#42a5f5',
                        vPerDiv: 1,
                        tPerDiv: this.fcTPerDiv,
                        triggerLevel: 0,
                        autoFit: true,
                        canvasHeight: this.meterCanvasHeight,
                        showStats: false
                    });
                }
            }, { name: "OscilloscopeWaveCanvas" });
        }
        this.WaveExpandHint.bind(this)();
        Column.pop();
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            __Common__.create();
            __Common__.margin({ left: 8, right: 8, bottom: 8 });
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '测量频率', widthVal: '86%',
                        onAction: () => {
                            const r = this.appService.instruments.freqCounterMeasure();
                            if (r.success && r.data !== undefined) {
                                if (r.data >= 1e6) {
                                    this.fcReading = `${(r.data / 1e6).toFixed(3)} MHz`;
                                }
                                else if (r.data >= 1e3) {
                                    this.fcReading = `${(r.data / 1e3).toFixed(1)} kHz`;
                                }
                                else {
                                    this.fcReading = `${r.data.toFixed(1)} Hz`;
                                }
                            }
                            this.statusMessage = `频率计: ${this.fcReading}`;
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentPanel.ets", line: 2093, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '测量频率',
                            widthVal: '86%',
                            onAction: () => {
                                const r = this.appService.instruments.freqCounterMeasure();
                                if (r.success && r.data !== undefined) {
                                    if (r.data >= 1e6) {
                                        this.fcReading = `${(r.data / 1e6).toFixed(3)} MHz`;
                                    }
                                    else if (r.data >= 1e3) {
                                        this.fcReading = `${(r.data / 1e3).toFixed(1)} kHz`;
                                    }
                                    else {
                                        this.fcReading = `${r.data.toFixed(1)} Hz`;
                                    }
                                }
                                this.statusMessage = `频率计: ${this.fcReading}`;
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '测量频率', widthVal: '86%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        __Common__.pop();
        Column.pop();
    }
    private refreshMeterWave(kind: string): void {
        if (kind === 'vm') {
            const w = this.appService.instruments.getVoltmeterWave();
            if (w.success && w.data !== undefined && w.data.voltageAxis.length > 1) {
                this.vmWaveTime = w.data.timeAxis.slice();
                this.vmWaveData = w.data.voltageAxis.slice();
                this.vmTPerDiv = InstrumentPanel.adaptiveMeterTPerDiv(this.vmWaveTime, this.vmWaveData);
                this.vmWaveFrame = this.vmWaveFrame + 1;
            }
            return;
        }
        if (kind === 'am') {
            const w = this.appService.instruments.getAmmeterWave();
            if (w.success && w.data !== undefined && w.data.voltageAxis.length > 1) {
                this.amWaveTime = w.data.timeAxis.slice();
                this.amWaveData = w.data.voltageAxis.slice();
                this.amTPerDiv = InstrumentPanel.adaptiveMeterTPerDiv(this.amWaveTime, this.amWaveData);
                this.amWaveFrame = this.amWaveFrame + 1;
            }
            return;
        }
        if (kind === 'freq') {
            const w = this.appService.instruments.getFreqCounterWave();
            if (w.success && w.data !== undefined && w.data.voltageAxis.length > 1) {
                this.fcWaveTime = w.data.timeAxis.slice();
                this.fcWaveData = w.data.voltageAxis.slice();
                this.fcTPerDiv = InstrumentPanel.adaptiveMeterTPerDiv(this.fcWaveTime, this.fcWaveData);
                this.fcWaveFrame = this.fcWaveFrame + 1;
            }
        }
    }
    /**
     * 表计波形时基：约 3 个周期铺满 10 格 → 产生右缘滚动。
     * 估不出频率时用尾部 8ms 窗（适合 1kHz lab）。
     * 强制 10×tDiv ≤ 可用历史，避免窗宽大于数据导致左侧黑屏。
     */
    private static adaptiveMeterTPerDiv(times: number[], values: number[]): number {
        const n = Math.min(times.length, values.length);
        if (n < 8) {
            return 1e-3;
        }
        const dataSpan = Math.max(times[n - 1] - times[0], 1e-6);
        // 单格上限：整窗不超过已有历史（写满前也能铺满有效段）
        const maxTDiv = Math.max(dataSpan / 10, 1e-7);
        let sum = 0;
        let vmin = values[0];
        let vmax = values[0];
        for (let i = 0; i < n; i++) {
            const v = values[i];
            sum += v;
            if (v < vmin) {
                vmin = v;
            }
            if (v > vmax) {
                vmax = v;
            }
        }
        const mean = sum / n;
        const amp = Math.max(vmax - vmin, 1e-9);
        if (amp < 1e-6) {
            return Math.min(5e-3, maxTDiv);
        }
        const thr = mean;
        let crosses = 0;
        let tFirst = -1;
        let tLast = -1;
        for (let i = 1; i < n; i++) {
            if ((values[i - 1] < thr && values[i] >= thr) ||
                (values[i - 1] > thr && values[i] <= thr)) {
                crosses++;
                if (tFirst < 0) {
                    tFirst = times[i];
                }
                tLast = times[i];
            }
        }
        if (crosses >= 4 && tLast > tFirst) {
            const period = 2 * (tLast - tFirst) / Math.max(crosses - 1, 1);
            // 3 周期 / 10 格
            const tDiv = (period * 3) / 10;
            if (tDiv > 1e-7 && tDiv < 1) {
                return Math.min(tDiv, maxTDiv);
            }
        }
        // 默认显示约 8ms（1kHz ≈ 8 周期），且不超过可用跨度
        const want = Math.min(8e-3, dataSpan);
        return Math.max(Math.min(want / 10, maxTDiv), 1e-7);
    }
    private updateCursorMeasure(): void {
        const r = this.appService.instruments.measureCursors(this.cursorAIdx, this.cursorBIdx);
        if (r.success && r.data) {
            this.cursorMeasureText = `ΔT=${(r.data.deltaTime * 1e6).toFixed(2)}μs  ΔV=${r.data.deltaVoltage.toFixed(3)}V  f=${r.data.frequency.toFixed(1)}Hz`;
        }
    }
    private refreshDecodedFrames(): void {
        const frames = this.appService.instruments.getDecodedFrames();
        if (frames.length === 0) {
            this.decodedFramesText = '无解码帧';
            return;
        }
        const lines: string[] = [];
        for (let i = 0; i < Math.min(frames.length, 8); i++) {
            const f = frames[i];
            lines.push(`[${f.protocol}] ${f.data} @${(f.timestamp * 1e6).toFixed(1)}μs`);
        }
        this.decodedFramesText = lines.join('\n');
    }
    rerender() {
        this.updateDirtyElements();
    }
}
