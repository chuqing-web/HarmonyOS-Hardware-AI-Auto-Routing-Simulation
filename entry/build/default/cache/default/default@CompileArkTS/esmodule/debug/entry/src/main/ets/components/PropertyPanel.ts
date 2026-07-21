if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface PropertyPanel_Params {
    themeRev?: number;
    selectedComponentId?: string;
    docVersion?: number;
    simWaveTick?: number;
    statusMessage?: string;
    onDeleted?: () => void;
    comp?: ComponentInstance | null;
    paramKey?: string;
    paramValue?: string;
    paramEntries?: string[];
    mmReading?: string;
    mmMode?: string;
    vmReading?: string;
    vmUnit?: string;
    amReading?: string;
    amUnit?: string;
    pmVoltage?: string;
    pmCurrent?: string;
    pmPower?: string;
    pmPF?: string;
    fcFreq?: string;
    fcGate?: string;
    sigFreq?: string;
    sigAmp?: string;
    uartHex?: string;
    uartLog?: string;
    decodedFrames?: string;
    hexPath?: string;
    hexRegisters?: string;
    hexState?: string;
    oscTimeData?: number[];
    oscWaveData?: number[];
    oscWaveDataCh2?: number[];
    logicChannelData?: number[][];
    logicSampleCount?: number;
    logicChannelCount?: number;
    appService?: AppService;
    refreshTimer?: number;
    uiLogTick?: number;
}
import { AppService } from "@bundle:com.elecdraw.aischsim/entry/ets/services/AppService";
import { UnitParser, paramMapGet, CouplingMode, MathChannelOp, LogicDecodeProtocol, MultimeterMode, McuFamily, VoltmeterType, traceUiRefresh, traceUiSelect, traceBurn, formatFirmwarePreview } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ComponentInstance } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ComponentParamsUpdate, ComponentParamEntry } from 'schematic_editor';
import { ProteusParamRow, ProteusClassicBtn, ProteusSectionTitle, ProteusTextInput } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import { ProteusColors, ProteusDimens, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import { PROTEUS_THEME_REV_KEY } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ThemeManager";
import { OscilloscopeWaveCanvas } from "@bundle:com.elecdraw.aischsim/entry/ets/components/OscilloscopeWaveCanvas";
import { LogicAnalyzerWaveCanvas } from "@bundle:com.elecdraw.aischsim/entry/ets/components/LogicAnalyzerWaveCanvas";
import fs from "@ohos:file.fs";
import picker from "@ohos:file.picker";
import util from "@ohos:util";
export class PropertyPanel extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__selectedComponentId = new SynchedPropertySimpleOneWayPU(params.selectedComponentId, this, "selectedComponentId");
        this.__docVersion = new SynchedPropertySimpleOneWayPU(params.docVersion, this, "docVersion");
        this.__simWaveTick = new SynchedPropertySimpleOneWayPU(params.simWaveTick, this, "simWaveTick");
        this.__statusMessage = new SynchedPropertySimpleTwoWayPU(params.statusMessage, this, "statusMessage");
        this.onDeleted = () => { };
        this.__comp = new ObservedPropertyObjectPU(null, this, "comp");
        this.__paramKey = new ObservedPropertySimplePU('', this, "paramKey");
        this.__paramValue = new ObservedPropertySimplePU('', this, "paramValue");
        this.__paramEntries = new ObservedPropertyObjectPU([], this, "paramEntries");
        this.__mmReading = new ObservedPropertySimplePU('0.000', this, "mmReading");
        this.__mmMode = new ObservedPropertySimplePU('DCV', this, "mmMode");
        this.__vmReading = new ObservedPropertySimplePU('0.00', this, "vmReading");
        this.__vmUnit = new ObservedPropertySimplePU('V DC', this, "vmUnit");
        this.__amReading = new ObservedPropertySimplePU('0.00', this, "amReading");
        this.__amUnit = new ObservedPropertySimplePU('mA DC', this, "amUnit");
        this.__pmVoltage = new ObservedPropertySimplePU('0.00', this, "pmVoltage");
        this.__pmCurrent = new ObservedPropertySimplePU('0.00', this, "pmCurrent");
        this.__pmPower = new ObservedPropertySimplePU('0.00', this, "pmPower");
        this.__pmPF = new ObservedPropertySimplePU('0.00', this, "pmPF");
        this.__fcFreq = new ObservedPropertySimplePU('0 Hz', this, "fcFreq");
        this.__fcGate = new ObservedPropertySimplePU('1', this, "fcGate");
        this.__sigFreq = new ObservedPropertySimplePU('1kHz', this, "sigFreq");
        this.__sigAmp = new ObservedPropertySimplePU('3.3V', this, "sigAmp");
        this.__uartHex = new ObservedPropertySimplePU('', this, "uartHex");
        this.__uartLog = new ObservedPropertySimplePU('', this, "uartLog");
        this.__decodedFrames = new ObservedPropertySimplePU('', this, "decodedFrames");
        this.__hexPath = new ObservedPropertySimplePU('', this, "hexPath");
        this.__hexRegisters = new ObservedPropertySimplePU('', this, "hexRegisters");
        this.__hexState = new ObservedPropertySimplePU('stopped', this, "hexState");
        this.__oscTimeData = new ObservedPropertyObjectPU([], this, "oscTimeData");
        this.__oscWaveData = new ObservedPropertyObjectPU([], this, "oscWaveData");
        this.__oscWaveDataCh2 = new ObservedPropertyObjectPU([], this, "oscWaveDataCh2");
        this.__logicChannelData = new ObservedPropertyObjectPU([], this, "logicChannelData");
        this.__logicSampleCount = new ObservedPropertySimplePU(128, this, "logicSampleCount");
        this.__logicChannelCount = new ObservedPropertySimplePU(8, this, "logicChannelCount");
        this.appService = AppService.getInstance();
        this.refreshTimer = -1;
        this.uiLogTick = 0;
        this.setInitiallyProvidedValue(params);
        this.declareWatch("selectedComponentId", this.onSelectionChange);
        this.declareWatch("docVersion", this.onDocVersionChange);
        this.declareWatch("simWaveTick", this.onSimWaveTick);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: PropertyPanel_Params) {
        if (params.selectedComponentId === undefined) {
            this.__selectedComponentId.set('');
        }
        if (params.docVersion === undefined) {
            this.__docVersion.set(0);
        }
        if (params.simWaveTick === undefined) {
            this.__simWaveTick.set(0);
        }
        if (params.onDeleted !== undefined) {
            this.onDeleted = params.onDeleted;
        }
        if (params.comp !== undefined) {
            this.comp = params.comp;
        }
        if (params.paramKey !== undefined) {
            this.paramKey = params.paramKey;
        }
        if (params.paramValue !== undefined) {
            this.paramValue = params.paramValue;
        }
        if (params.paramEntries !== undefined) {
            this.paramEntries = params.paramEntries;
        }
        if (params.mmReading !== undefined) {
            this.mmReading = params.mmReading;
        }
        if (params.mmMode !== undefined) {
            this.mmMode = params.mmMode;
        }
        if (params.vmReading !== undefined) {
            this.vmReading = params.vmReading;
        }
        if (params.vmUnit !== undefined) {
            this.vmUnit = params.vmUnit;
        }
        if (params.amReading !== undefined) {
            this.amReading = params.amReading;
        }
        if (params.amUnit !== undefined) {
            this.amUnit = params.amUnit;
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
        if (params.fcFreq !== undefined) {
            this.fcFreq = params.fcFreq;
        }
        if (params.fcGate !== undefined) {
            this.fcGate = params.fcGate;
        }
        if (params.sigFreq !== undefined) {
            this.sigFreq = params.sigFreq;
        }
        if (params.sigAmp !== undefined) {
            this.sigAmp = params.sigAmp;
        }
        if (params.uartHex !== undefined) {
            this.uartHex = params.uartHex;
        }
        if (params.uartLog !== undefined) {
            this.uartLog = params.uartLog;
        }
        if (params.decodedFrames !== undefined) {
            this.decodedFrames = params.decodedFrames;
        }
        if (params.hexPath !== undefined) {
            this.hexPath = params.hexPath;
        }
        if (params.hexRegisters !== undefined) {
            this.hexRegisters = params.hexRegisters;
        }
        if (params.hexState !== undefined) {
            this.hexState = params.hexState;
        }
        if (params.oscTimeData !== undefined) {
            this.oscTimeData = params.oscTimeData;
        }
        if (params.oscWaveData !== undefined) {
            this.oscWaveData = params.oscWaveData;
        }
        if (params.oscWaveDataCh2 !== undefined) {
            this.oscWaveDataCh2 = params.oscWaveDataCh2;
        }
        if (params.logicChannelData !== undefined) {
            this.logicChannelData = params.logicChannelData;
        }
        if (params.logicSampleCount !== undefined) {
            this.logicSampleCount = params.logicSampleCount;
        }
        if (params.logicChannelCount !== undefined) {
            this.logicChannelCount = params.logicChannelCount;
        }
        if (params.appService !== undefined) {
            this.appService = params.appService;
        }
        if (params.refreshTimer !== undefined) {
            this.refreshTimer = params.refreshTimer;
        }
        if (params.uiLogTick !== undefined) {
            this.uiLogTick = params.uiLogTick;
        }
    }
    updateStateVars(params: PropertyPanel_Params) {
        this.__selectedComponentId.reset(params.selectedComponentId);
        this.__docVersion.reset(params.docVersion);
        this.__simWaveTick.reset(params.simWaveTick);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedComponentId.purgeDependencyOnElmtId(rmElmtId);
        this.__docVersion.purgeDependencyOnElmtId(rmElmtId);
        this.__simWaveTick.purgeDependencyOnElmtId(rmElmtId);
        this.__statusMessage.purgeDependencyOnElmtId(rmElmtId);
        this.__comp.purgeDependencyOnElmtId(rmElmtId);
        this.__paramKey.purgeDependencyOnElmtId(rmElmtId);
        this.__paramValue.purgeDependencyOnElmtId(rmElmtId);
        this.__paramEntries.purgeDependencyOnElmtId(rmElmtId);
        this.__mmReading.purgeDependencyOnElmtId(rmElmtId);
        this.__mmMode.purgeDependencyOnElmtId(rmElmtId);
        this.__vmReading.purgeDependencyOnElmtId(rmElmtId);
        this.__vmUnit.purgeDependencyOnElmtId(rmElmtId);
        this.__amReading.purgeDependencyOnElmtId(rmElmtId);
        this.__amUnit.purgeDependencyOnElmtId(rmElmtId);
        this.__pmVoltage.purgeDependencyOnElmtId(rmElmtId);
        this.__pmCurrent.purgeDependencyOnElmtId(rmElmtId);
        this.__pmPower.purgeDependencyOnElmtId(rmElmtId);
        this.__pmPF.purgeDependencyOnElmtId(rmElmtId);
        this.__fcFreq.purgeDependencyOnElmtId(rmElmtId);
        this.__fcGate.purgeDependencyOnElmtId(rmElmtId);
        this.__sigFreq.purgeDependencyOnElmtId(rmElmtId);
        this.__sigAmp.purgeDependencyOnElmtId(rmElmtId);
        this.__uartHex.purgeDependencyOnElmtId(rmElmtId);
        this.__uartLog.purgeDependencyOnElmtId(rmElmtId);
        this.__decodedFrames.purgeDependencyOnElmtId(rmElmtId);
        this.__hexPath.purgeDependencyOnElmtId(rmElmtId);
        this.__hexRegisters.purgeDependencyOnElmtId(rmElmtId);
        this.__hexState.purgeDependencyOnElmtId(rmElmtId);
        this.__oscTimeData.purgeDependencyOnElmtId(rmElmtId);
        this.__oscWaveData.purgeDependencyOnElmtId(rmElmtId);
        this.__oscWaveDataCh2.purgeDependencyOnElmtId(rmElmtId);
        this.__logicChannelData.purgeDependencyOnElmtId(rmElmtId);
        this.__logicSampleCount.purgeDependencyOnElmtId(rmElmtId);
        this.__logicChannelCount.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__selectedComponentId.aboutToBeDeleted();
        this.__docVersion.aboutToBeDeleted();
        this.__simWaveTick.aboutToBeDeleted();
        this.__statusMessage.aboutToBeDeleted();
        this.__comp.aboutToBeDeleted();
        this.__paramKey.aboutToBeDeleted();
        this.__paramValue.aboutToBeDeleted();
        this.__paramEntries.aboutToBeDeleted();
        this.__mmReading.aboutToBeDeleted();
        this.__mmMode.aboutToBeDeleted();
        this.__vmReading.aboutToBeDeleted();
        this.__vmUnit.aboutToBeDeleted();
        this.__amReading.aboutToBeDeleted();
        this.__amUnit.aboutToBeDeleted();
        this.__pmVoltage.aboutToBeDeleted();
        this.__pmCurrent.aboutToBeDeleted();
        this.__pmPower.aboutToBeDeleted();
        this.__pmPF.aboutToBeDeleted();
        this.__fcFreq.aboutToBeDeleted();
        this.__fcGate.aboutToBeDeleted();
        this.__sigFreq.aboutToBeDeleted();
        this.__sigAmp.aboutToBeDeleted();
        this.__uartHex.aboutToBeDeleted();
        this.__uartLog.aboutToBeDeleted();
        this.__decodedFrames.aboutToBeDeleted();
        this.__hexPath.aboutToBeDeleted();
        this.__hexRegisters.aboutToBeDeleted();
        this.__hexState.aboutToBeDeleted();
        this.__oscTimeData.aboutToBeDeleted();
        this.__oscWaveData.aboutToBeDeleted();
        this.__oscWaveDataCh2.aboutToBeDeleted();
        this.__logicChannelData.aboutToBeDeleted();
        this.__logicSampleCount.aboutToBeDeleted();
        this.__logicChannelCount.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    /** 主题切换时重建，避免色板静态字段变更后子树仍缓存旧色 */
    private __themeRev: ObservedPropertyAbstractPU<number>;
    get themeRev() {
        return this.__themeRev.get();
    }
    set themeRev(newValue: number) {
        this.__themeRev.set(newValue);
    }
    private __selectedComponentId: SynchedPropertySimpleOneWayPU<string>;
    get selectedComponentId() {
        return this.__selectedComponentId.get();
    }
    set selectedComponentId(newValue: string) {
        this.__selectedComponentId.set(newValue);
    }
    private __docVersion: SynchedPropertySimpleOneWayPU<number>;
    get docVersion() {
        return this.__docVersion.get();
    }
    set docVersion(newValue: number) {
        this.__docVersion.set(newValue);
    }
    private __simWaveTick: SynchedPropertySimpleOneWayPU<number>;
    get simWaveTick() {
        return this.__simWaveTick.get();
    }
    set simWaveTick(newValue: number) {
        this.__simWaveTick.set(newValue);
    }
    private __statusMessage: SynchedPropertySimpleTwoWayPU<string>;
    get statusMessage() {
        return this.__statusMessage.get();
    }
    set statusMessage(newValue: string) {
        this.__statusMessage.set(newValue);
    }
    private onDeleted: () => void;
    private __comp: ObservedPropertyObjectPU<ComponentInstance | null>;
    get comp() {
        return this.__comp.get();
    }
    set comp(newValue: ComponentInstance | null) {
        this.__comp.set(newValue);
    }
    private __paramKey: ObservedPropertySimplePU<string>;
    get paramKey() {
        return this.__paramKey.get();
    }
    set paramKey(newValue: string) {
        this.__paramKey.set(newValue);
    }
    private __paramValue: ObservedPropertySimplePU<string>;
    get paramValue() {
        return this.__paramValue.get();
    }
    set paramValue(newValue: string) {
        this.__paramValue.set(newValue);
    }
    private __paramEntries: ObservedPropertyObjectPU<string[]>;
    get paramEntries() {
        return this.__paramEntries.get();
    }
    set paramEntries(newValue: string[]) {
        this.__paramEntries.set(newValue);
    }
    // Instrument readings — initialized to "0" so unconnected instruments show meaningful defaults
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
    private __vmReading: ObservedPropertySimplePU<string>;
    get vmReading() {
        return this.__vmReading.get();
    }
    set vmReading(newValue: string) {
        this.__vmReading.set(newValue);
    }
    private __vmUnit: ObservedPropertySimplePU<string>;
    get vmUnit() {
        return this.__vmUnit.get();
    }
    set vmUnit(newValue: string) {
        this.__vmUnit.set(newValue);
    }
    private __amReading: ObservedPropertySimplePU<string>;
    get amReading() {
        return this.__amReading.get();
    }
    set amReading(newValue: string) {
        this.__amReading.set(newValue);
    }
    private __amUnit: ObservedPropertySimplePU<string>;
    get amUnit() {
        return this.__amUnit.get();
    }
    set amUnit(newValue: string) {
        this.__amUnit.set(newValue);
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
    private __fcFreq: ObservedPropertySimplePU<string>;
    get fcFreq() {
        return this.__fcFreq.get();
    }
    set fcFreq(newValue: string) {
        this.__fcFreq.set(newValue);
    }
    private __fcGate: ObservedPropertySimplePU<string>;
    get fcGate() {
        return this.__fcGate.get();
    }
    set fcGate(newValue: string) {
        this.__fcGate.set(newValue);
    }
    // Signal generator
    private __sigFreq: ObservedPropertySimplePU<string>;
    get sigFreq() {
        return this.__sigFreq.get();
    }
    set sigFreq(newValue: string) {
        this.__sigFreq.set(newValue);
    }
    private __sigAmp: ObservedPropertySimplePU<string>;
    get sigAmp() {
        return this.__sigAmp.get();
    }
    set sigAmp(newValue: string) {
        this.__sigAmp.set(newValue);
    }
    // UART
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
    // Logic analyzer
    private __decodedFrames: ObservedPropertySimplePU<string>;
    get decodedFrames() {
        return this.__decodedFrames.get();
    }
    set decodedFrames(newValue: string) {
        this.__decodedFrames.set(newValue);
    }
    // MCU HEX burn
    private __hexPath: ObservedPropertySimplePU<string>;
    get hexPath() {
        return this.__hexPath.get();
    }
    set hexPath(newValue: string) {
        this.__hexPath.set(newValue);
    }
    private __hexRegisters: ObservedPropertySimplePU<string>;
    get hexRegisters() {
        return this.__hexRegisters.get();
    }
    set hexRegisters(newValue: string) {
        this.__hexRegisters.set(newValue);
    }
    private __hexState: ObservedPropertySimplePU<string>;
    get hexState() {
        return this.__hexState.get();
    }
    set hexState(newValue: string) {
        this.__hexState.set(newValue);
    }
    // Oscilloscope
    private __oscTimeData: ObservedPropertyObjectPU<number[]>;
    get oscTimeData() {
        return this.__oscTimeData.get();
    }
    set oscTimeData(newValue: number[]) {
        this.__oscTimeData.set(newValue);
    }
    private __oscWaveData: ObservedPropertyObjectPU<number[]>;
    get oscWaveData() {
        return this.__oscWaveData.get();
    }
    set oscWaveData(newValue: number[]) {
        this.__oscWaveData.set(newValue);
    }
    private __oscWaveDataCh2: ObservedPropertyObjectPU<number[]>;
    get oscWaveDataCh2() {
        return this.__oscWaveDataCh2.get();
    }
    set oscWaveDataCh2(newValue: number[]) {
        this.__oscWaveDataCh2.set(newValue);
    }
    // Logic Analyzer
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
    private __logicChannelCount: ObservedPropertySimplePU<number>;
    get logicChannelCount() {
        return this.__logicChannelCount.get();
    }
    set logicChannelCount(newValue: number) {
        this.__logicChannelCount.set(newValue);
    }
    private appService: AppService;
    private refreshTimer: number;
    private uiLogTick: number;
    aboutToAppear(): void {
        this.loadComponent();
        this.startRefresh();
    }
    aboutToDisappear(): void {
        this.stopRefresh();
    }
    onSelectionChange(): void {
        this.loadComponent();
        this.ensureInstrumentBinding();
        this.refreshInstrumentData();
        this.logInstrumentReading(true);
    }
    onDocVersionChange(): void {
        this.loadComponent();
        if (this.comp !== null) {
            this.appService.invalidateInstrumentBinding(this.comp.id);
            this.ensureInstrumentBinding();
            this.refreshInstrumentData();
        }
        else {
            this.resetInstrumentDisplay();
            this.appService.setActiveInstrumentComponent(null);
        }
    }
    private resetInstrumentDisplay(): void {
        this.mmReading = '0.000';
        this.vmReading = '0.00';
        this.amReading = '0.00';
        this.pmVoltage = '0.00';
        this.pmCurrent = '0.00';
        this.pmPower = '0.00';
        this.pmPF = '0.00';
        this.fcFreq = '0 Hz';
        this.sigFreq = '1kHz';
        this.sigAmp = '3.3V';
        this.uartHex = '';
        this.uartLog = '';
        this.decodedFrames = '';
        this.oscWaveData = [];
        this.oscWaveDataCh2 = [];
        this.logicChannelData = [];
        this.hexPath = '';
        this.hexRegisters = '';
        this.hexState = 'stopped';
    }
    onSimWaveTick(): void {
        if (this.comp !== null) {
            this.refreshInstrumentData();
        }
    }
    private startRefresh(): void {
        this.refreshTimer = setInterval(() => {
            if (this.comp !== null) {
                this.refreshInstrumentData();
            }
        }, 150);
    }
    private stopRefresh(): void {
        if (this.refreshTimer >= 0) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = -1;
        }
    }
    refreshInstrumentData(): void {
        if (this.comp === null) {
            this.appService.setActiveInstrumentComponent(null);
            return;
        }
        const libId = this.comp.libraryId.toUpperCase();
        const isInstrument = libId.includes('METER') || libId.includes('SCOPE') || libId.includes('OSC') ||
            libId.includes('LOGIC') || libId.includes('ANALYZER') || libId.includes('POWER') ||
            libId.includes('SIGNAL') || libId.includes('UART') || libId.includes('GENERATOR');
        // Do not steal instrument binding when inspecting a pot / MCU / passive.
        if (isInstrument) {
            this.appService.setActiveInstrumentComponent(this.comp.id);
        }
        try {
            if (libId.includes('VIRTUAL_METER') || libId === 'MULTIMETER') {
                const delta = this.appService.readVoltmeterDeltaForComponent(this.comp.id);
                if (delta !== null) {
                    this.appService.instruments.multimeterSnapReading(delta);
                    this.mmReading = delta.toFixed(3);
                }
                else {
                    const r = this.appService.instruments.measure();
                    if (r.success && r.data !== undefined) {
                        this.mmReading = Number(r.data).toFixed(3);
                    }
                }
                const snap = this.appService.instruments.getInstrumentSnapshot();
                if (snap !== undefined) {
                    this.mmMode = this.modeLabel(snap.multimeterMode);
                }
            }
            else if (libId.includes('VOLTMETER')) {
                const delta = this.appService.readVoltmeterDeltaForComponent(this.comp.id);
                if (delta !== null) {
                    this.appService.instruments.voltmeterSnapReading(delta);
                    this.vmReading = delta.toFixed(2);
                }
                else {
                    const r = this.appService.instruments.voltmeterMeasure();
                    if (r.success && r.data !== undefined) {
                        this.vmReading = Number(r.data).toFixed(2);
                    }
                }
                const cfg = this.appService.instruments.getVoltmeterConfig();
                if (cfg.success && cfg.data !== undefined) {
                    this.vmUnit = cfg.data.unit ?? 'V DC';
                }
            }
            else if (libId.includes('AMMETER')) {
                const mA = this.appService.readAmmeterCurrentForComponent(this.comp.id);
                if (mA !== null) {
                    this.appService.instruments.ammeterSnapReading(mA);
                    this.amReading = mA.toFixed(3);
                }
                else {
                    const r = this.appService.instruments.ammeterMeasure();
                    if (r.success && r.data !== undefined) {
                        this.amReading = Number(r.data).toFixed(3);
                    }
                }
                const cfg = this.appService.instruments.getAmmeterConfig();
                if (cfg.success && cfg.data !== undefined) {
                    this.amUnit = cfg.data.unit ?? 'mA DC';
                }
            }
            else if (libId.includes('POWER') || libId.includes('WATT')) {
                const pm = this.appService.readPowerMeterForComponent(this.comp.id);
                if (pm !== null) {
                    this.pmVoltage = pm.voltage.toFixed(3);
                    this.pmCurrent = (pm.current * 1000).toFixed(2);
                    this.pmPower = (pm.power * 1000).toFixed(1);
                    this.pmPF = pm.powerFactor.toFixed(2);
                }
                else {
                    const r = this.appService.instruments.powerMeterMeasure();
                    if (r.success && r.data !== undefined) {
                        this.pmVoltage = Number(r.data.voltage).toFixed(3);
                        this.pmCurrent = (Number(r.data.current) * 1000).toFixed(2);
                        this.pmPower = (Number(r.data.power) * 1000).toFixed(1);
                        this.pmPF = Number(r.data.powerFactor).toFixed(2);
                    }
                }
            }
            else if (libId.includes('FREQ') || libId.includes('COUNTER')) {
                const r = this.appService.instruments.freqCounterMeasure();
                if (r.success && r.data !== undefined) {
                    if (Number(r.data) >= 1e6) {
                        this.fcFreq = `${(Number(r.data) / 1e6).toFixed(3)} MHz`;
                    }
                    else if (Number(r.data) >= 1e3) {
                        this.fcFreq = `${(Number(r.data) / 1e3).toFixed(1)} kHz`;
                    }
                    else {
                        this.fcFreq = `${Number(r.data).toFixed(0)} Hz`;
                    }
                }
                const cfg = this.appService.instruments.getFreqCounterConfig();
                if (cfg.success && cfg.data !== undefined) {
                    this.fcGate = `${cfg.data.gateTime}`;
                }
            }
            else if (libId.includes('OSC')) {
                const w = this.appService.instruments.getOscilloscopeWave(0);
                if (w.success && w.data !== undefined) {
                    this.oscTimeData = w.data.timeAxis.slice();
                    this.oscWaveData = w.data.voltageAxis.slice();
                }
                const w2 = this.appService.instruments.getOscilloscopeWave(1);
                if (w2.success && w2.data !== undefined) {
                    this.oscWaveDataCh2 = w2.data.voltageAxis.slice();
                }
            }
            else if (libId.includes('LOGIC') || libId.includes('ANALYZER')) {
                const snap = this.appService.instruments.getLogicWaveData();
                if (snap.success && snap.data !== undefined) {
                    const channels: number[][] = [];
                    const waveArr = snap.data;
                    for (let i = 0; i < waveArr.length; i++) {
                        const wave = waveArr[i];
                        const bits: number[] = [];
                        for (let j = 0; j < wave.voltageAxis.length; j++) {
                            bits.push(wave.voltageAxis[j] > 0.5 ? 1 : 0);
                        }
                        channels.push(bits.slice());
                    }
                    this.logicChannelData = channels;
                    this.logicSampleCount = channels.length > 0 ? channels[0].length : 128;
                    this.logicChannelCount = channels.length;
                }
                const frames = this.appService.instruments.getDecodedFrames();
                if (frames.length > 0) {
                    let text = '';
                    for (let i = 0; i < Math.min(frames.length, 8); i++) {
                        text += `[${frames[i].timestamp}] ${frames[i].data}\n`;
                    }
                    this.decodedFrames = text;
                }
            }
            else if (libId.includes('UART') || libId.includes('TERMINAL')) {
                this.uartLog = this.appService.instruments.getUartLog();
            }
        }
        catch (_e) {
            // Best-effort refresh
        }
        this.logInstrumentReading(false);
    }
    private logInstrumentReading(onSelect: boolean): void {
        if (this.comp === null) {
            return;
        }
        if (!this.isInstrument()) {
            return;
        }
        this.uiLogTick++;
        if (!onSelect && this.uiLogTick % 20 !== 0) {
            return;
        }
        const kind = this.instrType();
        const reading = this.buildReadingSummary(kind);
        if (onSelect) {
            traceUiSelect('Props', this.comp.id, this.comp.refDes, this.comp.libraryId, kind, reading);
        }
        else {
            traceUiRefresh('Props', this.comp.id, this.comp.refDes, this.comp.libraryId, kind, reading);
        }
    }
    private buildReadingSummary(kind: string): string {
        if (kind === 'dmm')
            return `DMM ${this.mmReading} ${this.mmMode}`;
        if (kind === 'vm')
            return `VM ${this.vmReading} ${this.vmUnit}`;
        if (kind === 'am')
            return `AM ${this.amReading} ${this.amUnit}`;
        if (kind === 'power')
            return `PM V=${this.pmVoltage} I=${this.pmCurrent} P=${this.pmPower}`;
        if (kind === 'freq')
            return `FC ${this.fcFreq} gate=${this.fcGate}`;
        if (kind === 'osc') {
            const pts = this.oscWaveData.length;
            const last = pts > 0 ? this.oscWaveData[pts - 1].toFixed(4) : '0';
            return `OSC pts=${pts} last=${last}V`;
        }
        if (kind === 'logic')
            return `LA ch=${this.logicChannelCount} samples=${this.logicSampleCount}`;
        if (kind === 'uart')
            return `UART logLen=${this.uartLog.length}`;
        return kind;
    }
    private ensureInstrumentBinding(): void {
        if (this.comp === null) {
            return;
        }
        const libId = this.comp.libraryId.toUpperCase();
        if (!this.isInstrument() && !libId.includes('METER') && !libId.includes('SCOPE') &&
            !libId.includes('LOGIC') && !libId.includes('OSC') && !libId.includes('ANALYZER') &&
            !libId.includes('UART') && !libId.includes('GENERATOR') && !libId.includes('SIGNAL')) {
            return;
        }
        this.appService.setActiveInstrumentComponent(this.comp.id);
        this.appService.refreshInstrumentReaderForComponent(this.comp.id);
        if (libId.includes('VOLTMETER_DC') || libId === 'VOLTMETER') {
            this.vmUnit = 'V DC';
            this.appService.instruments.setVoltmeterType(VoltmeterType.DC);
        }
    }
    loadComponent(): void {
        if (!this.selectedComponentId) {
            this.comp = null;
            this.paramEntries = [];
            this.resetInstrumentDisplay();
            return;
        }
        const doc = this.appService.schematicEditor.getDocument();
        this.comp = doc.components.find(c => c.id === this.selectedComponentId) ?? null;
        if (this.comp) {
            const keys: string[] = [];
            this.comp.parameters.forEach((_value: string, key: string) => {
                keys.push(key);
            });
            const def = this.appService.componentLibrary.getComponent(this.comp.libraryId);
            if (def.success && def.data !== undefined) {
                def.data.defaultParams.forEach((_value: string, key: string) => {
                    if (!keys.includes(key)) {
                        keys.push(key);
                    }
                });
            }
            this.paramEntries = keys;
        }
        else {
            this.paramEntries = [];
        }
    }
    private paramDisplayValue(key: string): string {
        if (this.comp === null) {
            return '';
        }
        const stored = this.comp.parameters.get(key);
        if (stored !== undefined && stored.length > 0) {
            return stored;
        }
        const def = this.appService.componentLibrary.getComponent(this.comp.libraryId);
        if (def.success && def.data !== undefined) {
            return paramMapGet(def.data.defaultParams, key, '');
        }
        return '';
    }
    private paramEditable(key: string): boolean {
        if (this.comp === null) {
            return false;
        }
        const lib = this.comp.libraryId.toUpperCase();
        if (key === 'voltage') {
            return lib === 'VCC' || lib === 'VEE' || lib.includes('VAC') ||
                lib.includes('POWER') || lib.includes('VDC');
        }
        if (key === 'power') {
            return lib.startsWith('R_');
        }
        if (key === 'value') {
            return lib.startsWith('R_') || lib.startsWith('C_') || lib.startsWith('L_');
        }
        // 信号发生器：波形 / 频率 / 幅值 / 偏置 / 占空比均可改
        if (lib === 'SIGNAL_GEN' || lib.startsWith('SIGNAL_GEN')) {
            return key === 'waveform' || key === 'frequency' || key === 'amplitude' ||
                key === 'offset' || key === 'dutyCycle' || key === 'duty';
        }
        return false;
    }
    private saveParam(key: string, value: string): void {
        if (this.comp === null) {
            return;
        }
        const validated = UnitParser.validateParam(key, value);
        if (!validated.valid) {
            this.statusMessage = `参数无效: ${key}=${value}`;
            return;
        }
        this.appService.schematicEditor.setDeviceParam(this.comp.id, key, validated.normalized);
        this.comp.parameters.set(key, validated.normalized);
        this.appService.syncComponentParamToSimulation(this.comp.id, key, validated.normalized);
        this.statusMessage = `已更新 ${key}=${validated.normalized}`;
    }
    private isInstrument(): boolean {
        return this.instrType().length > 0;
    }
    private instrType(): string {
        if (this.comp === null)
            return '';
        const id = this.comp.libraryId.toUpperCase();
        if (id.includes('OSC'))
            return 'osc';
        if (id.includes('LOGIC') || id.includes('ANALYZER'))
            return 'logic';
        if (id.includes('VIRTUAL_METER') || id === 'MULTIMETER')
            return 'dmm';
        if (id.includes('UART') || id.includes('TERMINAL'))
            return 'uart';
        if (id.includes('VOLT'))
            return 'vm';
        if (id.includes('AMMETER') || id.includes('AMP'))
            return 'am';
        if (id.includes('POWER') || id.includes('WATT'))
            return 'pm';
        if (id.includes('FREQ') || id.includes('COUNTER'))
            return 'fc';
        return '';
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
    private isMcu(): boolean {
        if (this.comp === null)
            return false;
        const id = this.comp.libraryId;
        return id.includes('AT89') || id.includes('STC') || id.includes('STM32');
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Scroll.create();
            Scroll.width('100%');
            Scroll.height('100%');
            Scroll.scrollBar(BarState.Auto);
            Scroll.backgroundColor(ProteusColors.CANVAS_BG);
            Scroll.key(`prop_panel_${this.themeRev}`);
        }, Scroll);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 6 });
            Column.width('100%');
            Column.padding({ left: 8, right: 8, top: 4, bottom: 8 });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.comp) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        If.create();
                        // ---- Basic info (always shown) ----
                        if (this.isInstrument()) {
                            this.ifElseBranchUpdateFunction(0, () => {
                                this.InstrumentComponentHeader.bind(this)();
                            });
                        }
                        else {
                            this.ifElseBranchUpdateFunction(1, () => {
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusSectionTitle(this, { title: '器件信息' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 457, col: 13 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    title: '器件信息'
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                title: '器件信息'
                                            });
                                        }
                                    }, { name: "ProteusSectionTitle" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusParamRow(this, { label: '位号', value: this.comp.refDes, editable: false }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 458, col: 13 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    label: '位号',
                                                    value: this.comp.refDes,
                                                    editable: false
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                label: '位号', value: this.comp.refDes, editable: false
                                            });
                                        }
                                    }, { name: "ProteusParamRow" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusParamRow(this, { label: '型号', value: this.comp.libraryId, editable: false }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 459, col: 13 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    label: '型号',
                                                    value: this.comp.libraryId,
                                                    editable: false
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                label: '型号', value: this.comp.libraryId, editable: false
                                            });
                                        }
                                    }, { name: "ProteusParamRow" });
                                }
                            });
                        }
                    }, If);
                    If.pop();
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusParamRow(this, { label: 'X', value: `${this.comp.position.x}`, editable: false }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 461, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: 'X',
                                        value: `${this.comp.position.x}`,
                                        editable: false
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: 'X', value: `${this.comp.position.x}`, editable: false
                                });
                            }
                        }, { name: "ProteusParamRow" });
                    }
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusParamRow(this, { label: 'Y', value: `${this.comp.position.y}`, editable: false }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 462, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: 'Y',
                                        value: `${this.comp.position.y}`,
                                        editable: false
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: 'Y', value: `${this.comp.position.y}`, editable: false
                                });
                            }
                        }, { name: "ProteusParamRow" });
                    }
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        If.create();
                        // ---- Custom parameters ----
                        if (this.paramEntries.length > 0) {
                            this.ifElseBranchUpdateFunction(0, () => {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Divider.create();
                                    Divider.color(ProteusColors.DIVIDER);
                                    Divider.height(1);
                                    Divider.width('100%');
                                    Divider.margin({ top: 4, bottom: 4 });
                                }, Divider);
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    ForEach.create();
                                    const forEachItemGenFunction = _item => {
                                        const key = _item;
                                        {
                                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                if (isInitialRender) {
                                                    let componentCall = new ProteusParamRow(this, {
                                                        label: key,
                                                        value: this.paramDisplayValue(key),
                                                        editable: this.paramEditable(key),
                                                        onChange: (v: string) => { this.saveParam(key, v); }
                                                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 468, col: 15 });
                                                    ViewPU.create(componentCall);
                                                    let paramsLambda = () => {
                                                        return {
                                                            label: key,
                                                            value: this.paramDisplayValue(key),
                                                            editable: this.paramEditable(key),
                                                            onChange: (v: string) => { this.saveParam(key, v); }
                                                        };
                                                    };
                                                    componentCall.paramsGenerator_ = paramsLambda;
                                                }
                                                else {
                                                    this.updateStateVarsOfChildByElmtId(elmtId, {
                                                        label: key,
                                                        value: this.paramDisplayValue(key),
                                                        editable: this.paramEditable(key)
                                                    });
                                                }
                                            }, { name: "ProteusParamRow" });
                                        }
                                    };
                                    this.forEachUpdateFunction(elmtId, this.paramEntries, forEachItemGenFunction, (key: string) => key, false, false);
                                }, ForEach);
                                ForEach.pop();
                            });
                        }
                        // ---- Instrument data (conditional) ----
                        else {
                            this.ifElseBranchUpdateFunction(1, () => {
                            });
                        }
                    }, If);
                    If.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        If.create();
                        // ---- Instrument data (conditional) ----
                        if (this.isInstrument()) {
                            this.ifElseBranchUpdateFunction(0, () => {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Divider.create();
                                    Divider.color(ProteusColors.DIVIDER);
                                    Divider.height(1);
                                    Divider.width('100%');
                                    Divider.margin({ top: 6, bottom: 4 });
                                }, Divider);
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Text.create('仪表数据');
                                    Text.fontSize(ProteusFonts.PARAM_KEY);
                                    Text.fontColor(ProteusColors.TEXT_LABEL);
                                    Text.fontWeight(FontWeight.Medium);
                                    Text.width('100%');
                                    Text.padding({ left: 8, top: 4 });
                                }, Text);
                                Text.pop();
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    If.create();
                                    if (this.instrType() === 'osc') {
                                        this.ifElseBranchUpdateFunction(0, () => {
                                            this.OscilloscopeSection.bind(this)();
                                        });
                                    }
                                    else if (this.instrType() === 'logic') {
                                        this.ifElseBranchUpdateFunction(1, () => {
                                            this.LogicAnalyzerSection.bind(this)();
                                        });
                                    }
                                    else if (this.instrType() === 'dmm') {
                                        this.ifElseBranchUpdateFunction(2, () => {
                                            this.MultimeterSection.bind(this)();
                                        });
                                    }
                                    else if (this.instrType() === 'vm') {
                                        this.ifElseBranchUpdateFunction(3, () => {
                                            this.VoltmeterSection.bind(this)();
                                        });
                                    }
                                    else if (this.instrType() === 'am') {
                                        this.ifElseBranchUpdateFunction(4, () => {
                                            this.AmmeterSection.bind(this)();
                                        });
                                    }
                                    else if (this.instrType() === 'pm') {
                                        this.ifElseBranchUpdateFunction(5, () => {
                                            this.PowerMeterSection.bind(this)();
                                        });
                                    }
                                    else if (this.instrType() === 'fc') {
                                        this.ifElseBranchUpdateFunction(6, () => {
                                            this.FreqCounterSection.bind(this)();
                                        });
                                    }
                                    else if (this.instrType() === 'uart') {
                                        this.ifElseBranchUpdateFunction(7, () => {
                                            this.UartTerminalSection.bind(this)();
                                        });
                                    }
                                    else // ---- MCU HEX burn (conditional) ----
                                     {
                                        this.ifElseBranchUpdateFunction(8, () => {
                                        });
                                    }
                                }, If);
                                If.pop();
                            });
                        }
                        // ---- MCU HEX burn (conditional) ----
                        else {
                            this.ifElseBranchUpdateFunction(1, () => {
                            });
                        }
                    }, If);
                    If.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        If.create();
                        // ---- MCU HEX burn (conditional) ----
                        if (this.isMcu()) {
                            this.ifElseBranchUpdateFunction(0, () => {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Divider.create();
                                    Divider.color(ProteusColors.DIVIDER);
                                    Divider.height(1);
                                    Divider.width('100%');
                                    Divider.margin({ top: 6, bottom: 4 });
                                }, Divider);
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Text.create('烧录 HEX');
                                    Text.fontSize(ProteusFonts.TITLE);
                                    Text.fontColor(ProteusColors.TEXT_LABEL);
                                    Text.fontWeight(FontWeight.Medium);
                                    Text.width('100%');
                                }, Text);
                                Text.pop();
                                this.McuBurnSection.bind(this)();
                            });
                        }
                        else {
                            this.ifElseBranchUpdateFunction(1, () => {
                            });
                        }
                    }, If);
                    If.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Divider.create();
                        Divider.color(ProteusColors.DIVIDER);
                        Divider.height(1);
                        Divider.width('100%');
                        Divider.margin({ top: 6, bottom: 4 });
                    }, Divider);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        // ---- Add parameter form ----
                        Text.create('添加参数');
                        // ---- Add parameter form ----
                        Text.fontSize(ProteusFonts.TITLE);
                        // ---- Add parameter form ----
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        // ---- Add parameter form ----
                        Text.fontWeight(FontWeight.Medium);
                        // ---- Add parameter form ----
                        Text.width('100%');
                    }, Text);
                    // ---- Add parameter form ----
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create();
                        Row.width('100%');
                        Row.alignItems(VerticalAlign.Center);
                    }, Row);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('名称:');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width(48);
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
                                    placeholder: '参数名称',
                                    text: this.paramKey,
                                    onChange: (v: string) => { this.paramKey = v; }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 528, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        placeholder: '参数名称',
                                        text: this.paramKey,
                                        onChange: (v: string) => { this.paramKey = v; }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    placeholder: '参数名称',
                                    text: this.paramKey
                                });
                            }
                        }, { name: "ProteusTextInput" });
                    }
                    __Common__.pop();
                    Row.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create();
                        Row.width('100%');
                        Row.alignItems(VerticalAlign.Center);
                    }, Row);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('数值:');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width(48);
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
                                    placeholder: '参数值',
                                    text: this.paramValue,
                                    onChange: (v: string) => { this.paramValue = v; }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 540, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        placeholder: '参数值',
                                        text: this.paramValue,
                                        onChange: (v: string) => { this.paramValue = v; }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    placeholder: '参数值',
                                    text: this.paramValue
                                });
                            }
                        }, { name: "ProteusTextInput" });
                    }
                    __Common__.pop();
                    Row.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create({ space: 6 });
                        Row.width('100%');
                        Row.justifyContent(FlexAlign.SpaceBetween);
                    }, Row);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '添加',
                                    widthVal: '30%',
                                    onAction: () => {
                                        if (this.comp && this.paramKey) {
                                            const validated = UnitParser.validateParam(this.paramKey, this.paramValue);
                                            if (!validated.valid) {
                                                this.statusMessage = `非法参数: ${this.paramValue}`;
                                                return;
                                            }
                                            const entry: ComponentParamEntry = { key: this.paramKey, value: validated.normalized };
                                            const update: ComponentParamsUpdate = { entries: [entry] };
                                            this.appService.schematicEditor.updateComponentParams(this.comp.id, update);
                                            this.appService.syncComponentParamToSimulation(this.comp.id, entry.key, entry.value);
                                            this.loadComponent();
                                            this.statusMessage = '参数已更新';
                                        }
                                    }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 550, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '添加',
                                        widthVal: '30%',
                                        onAction: () => {
                                            if (this.comp && this.paramKey) {
                                                const validated = UnitParser.validateParam(this.paramKey, this.paramValue);
                                                if (!validated.valid) {
                                                    this.statusMessage = `非法参数: ${this.paramValue}`;
                                                    return;
                                                }
                                                const entry: ComponentParamEntry = { key: this.paramKey, value: validated.normalized };
                                                const update: ComponentParamsUpdate = { entries: [entry] };
                                                this.appService.schematicEditor.updateComponentParams(this.comp.id, update);
                                                this.appService.syncComponentParamToSimulation(this.comp.id, entry.key, entry.value);
                                                this.loadComponent();
                                                this.statusMessage = '参数已更新';
                                            }
                                        }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '添加',
                                    widthVal: '30%'
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '旋转',
                                    widthVal: '30%',
                                    onAction: () => {
                                        if (this.comp) {
                                            const next = ((this.comp.rotation + 90) % 360) as 0 | 90 | 180 | 270;
                                            this.appService.schematicEditor.rotateComponent(this.comp.id, next);
                                            this.loadComponent();
                                        }
                                    }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 569, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '旋转',
                                        widthVal: '30%',
                                        onAction: () => {
                                            if (this.comp) {
                                                const next = ((this.comp.rotation + 90) % 360) as 0 | 90 | 180 | 270;
                                                this.appService.schematicEditor.rotateComponent(this.comp.id, next);
                                                this.loadComponent();
                                            }
                                        }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '旋转',
                                    widthVal: '30%'
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '删除',
                                    widthVal: '30%',
                                    onAction: () => {
                                        if (this.comp) {
                                            this.appService.schematicEditor.deleteComponent(this.comp.id);
                                            this.comp = null;
                                            this.onDeleted();
                                            this.statusMessage = '器件已删除';
                                        }
                                    }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 580, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '删除',
                                        widthVal: '30%',
                                        onAction: () => {
                                            if (this.comp) {
                                                this.appService.schematicEditor.deleteComponent(this.comp.id);
                                                this.comp = null;
                                                this.onDeleted();
                                                this.statusMessage = '器件已删除';
                                            }
                                        }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '删除',
                                    widthVal: '30%'
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    Row.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.width('100%');
                        Column.alignItems(HorizontalAlign.Start);
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('未选择器件');
                        Text.fontSize(ProteusFonts.TITLE);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('单击画布上的器件查看属性');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                        Text.margin({ top: 4 });
                    }, Text);
                    Text.pop();
                    Column.pop();
                });
            }
        }, If);
        If.pop();
        Column.pop();
        Scroll.pop();
    }
    InstrumentComponentHeader(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 4 });
            Column.width('100%');
            Column.padding({ top: 4, bottom: 6, left: 2, right: 2 });
            Column.alignItems(HorizontalAlign.Start);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.comp !== null ? this.comp.refDes : '');
            Text.fontSize(14);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
            Text.maxLines(1);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
            Text.width('100%');
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.comp !== null ? this.comp.libraryId : '');
            Text.fontSize(11);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.maxLines(2);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
            Text.width('100%');
        }, Text);
        Text.pop();
        Column.pop();
    }
    OscilloscopeSection(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 6 });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('波形显示');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            __Common__.create();
            __Common__.width('100%');
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new OscilloscopeWaveCanvas(this, {
                        timeData: this.oscTimeData,
                        voltageData: this.oscWaveData,
                        channelLabel: 'CH1',
                        waveColor: '#00e676',
                        vPerDiv: 1,
                        triggerLevel: 0,
                        autoFit: true,
                        canvasHeight: 140,
                        showStats: true
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 644, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            timeData: this.oscTimeData,
                            voltageData: this.oscWaveData,
                            channelLabel: 'CH1',
                            waveColor: '#00e676',
                            vPerDiv: 1,
                            triggerLevel: 0,
                            autoFit: true,
                            canvasHeight: 140,
                            showStats: true
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        timeData: this.oscTimeData,
                        voltageData: this.oscWaveData,
                        channelLabel: 'CH1',
                        waveColor: '#00e676',
                        vPerDiv: 1,
                        triggerLevel: 0,
                        autoFit: true,
                        canvasHeight: 140,
                        showStats: true
                    });
                }
            }, { name: "OscilloscopeWaveCanvas" });
        }
        __Common__.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.oscWaveDataCh2.length > 1) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        __Common__.create();
                        __Common__.width('100%');
                    }, __Common__);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new OscilloscopeWaveCanvas(this, {
                                    timeData: this.oscTimeData,
                                    voltageData: this.oscWaveDataCh2,
                                    channelLabel: 'CH2',
                                    waveColor: '#40c4ff',
                                    vPerDiv: 1,
                                    triggerLevel: 0,
                                    autoFit: true,
                                    canvasHeight: 110,
                                    showStats: true
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 657, col: 9 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        timeData: this.oscTimeData,
                                        voltageData: this.oscWaveDataCh2,
                                        channelLabel: 'CH2',
                                        waveColor: '#40c4ff',
                                        vPerDiv: 1,
                                        triggerLevel: 0,
                                        autoFit: true,
                                        canvasHeight: 110,
                                        showStats: true
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    timeData: this.oscTimeData,
                                    voltageData: this.oscWaveDataCh2,
                                    channelLabel: 'CH2',
                                    waveColor: '#40c4ff',
                                    vPerDiv: 1,
                                    triggerLevel: 0,
                                    autoFit: true,
                                    canvasHeight: 110,
                                    showStats: true
                                });
                            }
                        }, { name: "OscilloscopeWaveCanvas" });
                    }
                    __Common__.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('100%');
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: 'AC', widthVal: '48%',
                        onAction: () => { this.appService.instruments.setCoupling(0, CouplingMode.AC); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 671, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'AC',
                            widthVal: '48%',
                            onAction: () => { this.appService.instruments.setCoupling(0, CouplingMode.AC); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'AC', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: 'DC', widthVal: '48%',
                        onAction: () => { this.appService.instruments.setCoupling(0, CouplingMode.DC); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 673, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'DC',
                            widthVal: '48%',
                            onAction: () => { this.appService.instruments.setCoupling(0, CouplingMode.DC); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'DC', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('100%');
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: 'FFT', widthVal: '48%',
                        onAction: () => { this.appService.instruments.setMathChannel(MathChannelOp.FFT); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 678, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'FFT',
                            widthVal: '48%',
                            onAction: () => { this.appService.instruments.setMathChannel(MathChannelOp.FFT); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'FFT', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '测量', widthVal: '48%',
                        onAction: () => {
                            const m = this.appService.instruments.measureCursors(50, 150);
                            if (m.success && m.data !== undefined) {
                                this.statusMessage =
                                    `ΔV:${m.data.deltaVoltage.toFixed(2)}V ΔT:${m.data.deltaTime.toFixed(3)}ms`;
                            }
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 680, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '测量',
                            widthVal: '48%',
                            onAction: () => {
                                const m = this.appService.instruments.measureCursors(50, 150);
                                if (m.success && m.data !== undefined) {
                                    this.statusMessage =
                                        `ΔV:${m.data.deltaVoltage.toFixed(2)}V ΔT:${m.data.deltaTime.toFixed(3)}ms`;
                                }
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '测量', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        Column.pop();
    }
    LogicAnalyzerSection(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 4 });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.logicChannelData.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('逻辑波形');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        __Common__.create();
                        __Common__.width('100%');
                        __Common__.height(80);
                        __Common__.border({ width: 1, color: ProteusColors.DIVIDER });
                    }, __Common__);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new LogicAnalyzerWaveCanvas(this, {
                                    channelData: this.logicChannelData,
                                    channelCount: this.logicChannelCount,
                                    sampleCount: this.logicSampleCount
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 699, col: 9 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        channelData: this.logicChannelData,
                                        channelCount: this.logicChannelCount,
                                        sampleCount: this.logicSampleCount
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    channelData: this.logicChannelData,
                                    channelCount: this.logicChannelCount,
                                    sampleCount: this.logicSampleCount
                                });
                            }
                        }, { name: "LogicAnalyzerWaveCanvas" });
                    }
                    __Common__.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('(运行仿真后显示逻辑波形)');
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                    }, Text);
                    Text.pop();
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('协议解码');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.margin({ top: 4 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('100%');
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: 'UART', widthVal: '48%',
                        onAction: () => {
                            this.appService.instruments.decodeBus(LogicDecodeProtocol.UART, 115200);
                            this.refreshInstrumentData();
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 714, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'UART',
                            widthVal: '48%',
                            onAction: () => {
                                this.appService.instruments.decodeBus(LogicDecodeProtocol.UART, 115200);
                                this.refreshInstrumentData();
                            }
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
                        onAction: () => {
                            this.appService.instruments.decodeBus(LogicDecodeProtocol.I2C);
                            this.refreshInstrumentData();
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 719, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'I2C',
                            widthVal: '48%',
                            onAction: () => {
                                this.appService.instruments.decodeBus(LogicDecodeProtocol.I2C);
                                this.refreshInstrumentData();
                            }
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
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: 'SPI', widthVal: '100%',
                        onAction: () => {
                            this.appService.instruments.decodeBus(LogicDecodeProtocol.SPI);
                            this.refreshInstrumentData();
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 727, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'SPI',
                            widthVal: '100%',
                            onAction: () => {
                                this.appService.instruments.decodeBus(LogicDecodeProtocol.SPI);
                                this.refreshInstrumentData();
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'SPI', widthVal: '100%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.decodedFrames.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.decodedFrames);
                        Text.fontSize(9);
                        Text.fontColor(ProteusColors.TEXT_PRIMARY);
                        Text.fontFamily('monospace');
                        Text.backgroundColor(ProteusColors.INPUT_READONLY_BG);
                        Text.padding(4);
                        Text.width('100%');
                    }, Text);
                    Text.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('(点击协议按钮解码)');
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                    }, Text);
                    Text.pop();
                });
            }
        }, If);
        If.pop();
        Column.pop();
    }
    MultimeterSection(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 6 });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('100%');
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: 'DCV', widthVal: '48%',
                        onAction: () => {
                            this.appService.instruments.setMode(MultimeterMode.DCV);
                            this.mmMode = 'DCV';
                            this.refreshInstrumentData();
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 751, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'DCV',
                            widthVal: '48%',
                            onAction: () => {
                                this.appService.instruments.setMode(MultimeterMode.DCV);
                                this.mmMode = 'DCV';
                                this.refreshInstrumentData();
                            }
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
                        onAction: () => {
                            this.appService.instruments.setMode(MultimeterMode.ACV);
                            this.mmMode = 'ACV';
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 757, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'ACV',
                            widthVal: '48%',
                            onAction: () => {
                                this.appService.instruments.setMode(MultimeterMode.ACV);
                                this.mmMode = 'ACV';
                            }
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
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: 'Ω', widthVal: '48%',
                        onAction: () => {
                            this.appService.instruments.setMode(MultimeterMode.RESISTANCE);
                            this.mmMode = 'OHM';
                            this.refreshInstrumentData();
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 765, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'Ω',
                            widthVal: '48%',
                            onAction: () => {
                                this.appService.instruments.setMode(MultimeterMode.RESISTANCE);
                                this.mmMode = 'OHM';
                                this.refreshInstrumentData();
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'Ω', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: 'Auto', widthVal: '48%',
                        onAction: () => {
                            this.appService.instruments.autoRange();
                            this.refreshInstrumentData();
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 771, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'Auto',
                            widthVal: '48%',
                            onAction: () => {
                                this.appService.instruments.autoRange();
                                this.refreshInstrumentData();
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'Auto', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`${this.mmMode}: ${this.mmReading}`);
            Text.fontSize(22);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontFamily('monospace');
            Text.fontWeight(FontWeight.Bold);
            Text.width('100%');
            Text.textAlign(TextAlign.Center);
            Text.backgroundColor(ProteusColors.INPUT_READONLY_BG);
            Text.padding(8);
            Text.margin({ top: 4 });
        }, Text);
        Text.pop();
        Column.pop();
    }
    VoltmeterSection(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 4 });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`${this.vmReading} ${this.vmUnit}`);
            Text.fontSize(24);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontFamily('monospace');
            Text.fontWeight(FontWeight.Bold);
            Text.width('100%');
            Text.textAlign(TextAlign.Center);
            Text.backgroundColor('#E8F5E9');
            Text.padding(8);
        }, Text);
        Text.pop();
        Column.pop();
    }
    AmmeterSection(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 4 });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`${this.amReading} ${this.amUnit}`);
            Text.fontSize(24);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontFamily('monospace');
            Text.fontWeight(FontWeight.Bold);
            Text.width('100%');
            Text.textAlign(TextAlign.Center);
            Text.backgroundColor('#FFF3E0');
            Text.padding(8);
        }, Text);
        Text.pop();
        Column.pop();
    }
    PowerMeterSection(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 4 });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`功率表读数`);
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusParamRow(this, { label: '电压', value: `${this.pmVoltage} V`, editable: false }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 816, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '电压',
                            value: `${this.pmVoltage} V`,
                            editable: false
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '电压', value: `${this.pmVoltage} V`, editable: false
                    });
                }
            }, { name: "ProteusParamRow" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusParamRow(this, { label: '电流', value: `${this.pmCurrent} mA`, editable: false }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 817, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '电流',
                            value: `${this.pmCurrent} mA`,
                            editable: false
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '电流', value: `${this.pmCurrent} mA`, editable: false
                    });
                }
            }, { name: "ProteusParamRow" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusParamRow(this, { label: '功率', value: `${this.pmPower} mW`, editable: false }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 818, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '功率',
                            value: `${this.pmPower} mW`,
                            editable: false
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '功率', value: `${this.pmPower} mW`, editable: false
                    });
                }
            }, { name: "ProteusParamRow" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusParamRow(this, { label: '功率因数', value: this.pmPF, editable: false }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 819, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '功率因数',
                            value: this.pmPF,
                            editable: false
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '功率因数', value: this.pmPF, editable: false
                    });
                }
            }, { name: "ProteusParamRow" });
        }
        Column.pop();
    }
    FreqCounterSection(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 4 });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.fcFreq);
            Text.fontSize(24);
            Text.fontColor('#FF2200');
            Text.fontFamily('monospace');
            Text.fontWeight(FontWeight.Bold);
            Text.width('100%');
            Text.textAlign(TextAlign.Center);
            Text.backgroundColor('#1a0000');
            Text.padding(8);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 4 });
            Row.width('100%');
            Row.margin({ top: 4 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('闸门:');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            TextInput.create({ text: this.fcGate });
            TextInput.fontSize(ProteusFonts.INPUT);
            TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
            TextInput.placeholderFont({ size: ProteusFonts.INPUT });
            TextInput.placeholderColor(ProteusColors.TEXT_SECONDARY);
            TextInput.caretColor(ProteusColors.INPUT_FOCUS);
            TextInput.width(50);
            TextInput.height(ProteusDimens.PARAM_ROW_HEIGHT);
            TextInput.borderRadius(0);
            TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
            TextInput.backgroundColor(ProteusColors.CANVAS_BG);
            TextInput.padding({ left: ProteusDimens.INPUT_PAD_H, right: ProteusDimens.INPUT_PAD_H });
            TextInput.onChange((v: string) => { this.fcGate = v; });
        }, TextInput);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '设置', widthVal: 40,
                        onAction: () => {
                            const g = parseFloat(this.fcGate) || 1;
                            this.appService.instruments.freqCounterSetGateTime(g);
                            this.statusMessage = `闸门设为 ${g}s`;
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 845, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '设置',
                            widthVal: 40,
                            onAction: () => {
                                const g = parseFloat(this.fcGate) || 1;
                                this.appService.instruments.freqCounterSetGateTime(g);
                                this.statusMessage = `闸门设为 ${g}s`;
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '设置', widthVal: 40
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        Column.pop();
    }
    UartTerminalSection(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 4 });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('串口终端');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            __Common__.create();
            __Common__.layoutWeight(1);
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusTextInput(this, {
                        placeholder: 'HEX: 55 AA',
                        text: this.uartHex,
                        onChange: (v: string) => { this.uartHex = v; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 862, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            placeholder: 'HEX: 55 AA',
                            text: this.uartHex,
                            onChange: (v: string) => { this.uartHex = v; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        placeholder: 'HEX: 55 AA',
                        text: this.uartHex
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
                            this.statusMessage = `已发送: ${this.uartHex}`;
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 868, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '发',
                            widthVal: 36,
                            onAction: () => {
                                this.appService.instruments.uartHexSend(this.uartHex);
                                this.uartLog = this.appService.instruments.getUartLog();
                                this.statusMessage = `已发送: ${this.uartHex}`;
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
                            this.uartLog = this.appService.instruments.getUartLog();
                            this.statusMessage = this.uartLog.length > 0 ? '已刷新接收日志' : '暂无数据';
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 874, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '收',
                            widthVal: 36,
                            onAction: () => {
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
            Scroll.create();
            Scroll.width('100%');
            Scroll.height(96);
            Scroll.padding(6);
            Scroll.backgroundColor(ProteusColors.INPUT_READONLY_BG);
            Scroll.border({ width: 1, color: ProteusColors.DIVIDER });
            Scroll.scrollBar(BarState.Auto);
            Scroll.align(Alignment.TopStart);
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
        Scroll.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 4 });
            Row.width('100%');
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '清空', widthVal: '48%',
                        onAction: () => {
                            this.appService.instruments.clearUartLog();
                            this.uartLog = '';
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 898, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '清空',
                            widthVal: '48%',
                            onAction: () => {
                                this.appService.instruments.clearUartLog();
                                this.uartLog = '';
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '清空', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '导出', widthVal: '48%',
                        onAction: () => {
                            void this.appService.instruments.exportUartLog('/data/storage/el2/base/uart_log.txt');
                            this.statusMessage = '日志已导出';
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 903, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '导出',
                            widthVal: '48%',
                            onAction: () => {
                                void this.appService.instruments.exportUartLog('/data/storage/el2/base/uart_log.txt');
                                this.statusMessage = '日志已导出';
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '导出', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        Column.pop();
    }
    McuBurnSection(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 4 });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            __Common__.create();
            __Common__.layoutWeight(1);
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusTextInput(this, {
                        placeholder: 'firmware.hex 路径',
                        text: this.hexPath,
                        onChange: (v: string) => { this.hexPath = v; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 917, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            placeholder: 'firmware.hex 路径',
                            text: this.hexPath,
                            onChange: (v: string) => { this.hexPath = v; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        placeholder: 'firmware.hex 路径',
                        text: this.hexPath
                    });
                }
            }, { name: "ProteusTextInput" });
        }
        __Common__.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '浏览', widthVal: 44,
                        onAction: () => { void this.browseHexFile(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 923, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '浏览',
                            widthVal: 44,
                            onAction: () => { void this.browseHexFile(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '浏览', widthVal: 44
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '烧录 HEX', widthVal: '100%',
                        onAction: () => { void this.burnHex(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 928, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '烧录 HEX',
                            widthVal: '100%',
                            onAction: () => { void this.burnHex(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '烧录 HEX', widthVal: '100%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 4 });
            Row.width('100%');
            Row.justifyContent(FlexAlign.SpaceBetween);
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '▶', widthVal: '23%',
                        onAction: () => {
                            this.appService.hexDebugger.run();
                            this.hexState = 'running';
                            this.statusMessage = 'MCU 运行中';
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 932, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '▶',
                            widthVal: '23%',
                            onAction: () => {
                                this.appService.hexDebugger.run();
                                this.hexState = 'running';
                                this.statusMessage = 'MCU 运行中';
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '▶', widthVal: '23%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '⏸', widthVal: '23%',
                        onAction: () => {
                            this.appService.hexDebugger.pause();
                            this.hexState = 'paused';
                            this.statusMessage = 'MCU 已暂停';
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 938, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '⏸',
                            widthVal: '23%',
                            onAction: () => {
                                this.appService.hexDebugger.pause();
                                this.hexState = 'paused';
                                this.statusMessage = 'MCU 已暂停';
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '⏸', widthVal: '23%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '↷', widthVal: '23%',
                        onAction: () => {
                            this.appService.hexDebugger.step();
                            this.statusMessage = '单步执行';
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 944, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '↷',
                            widthVal: '23%',
                            onAction: () => {
                                this.appService.hexDebugger.step();
                                this.statusMessage = '单步执行';
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '↷', widthVal: '23%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '↺', widthVal: '23%',
                        onAction: () => {
                            this.appService.hexDebugger.reset();
                            this.hexState = 'stopped';
                            this.statusMessage = 'MCU 已复位';
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 949, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '↺',
                            widthVal: '23%',
                            onAction: () => {
                                this.appService.hexDebugger.reset();
                                this.hexState = 'stopped';
                                this.statusMessage = 'MCU 已复位';
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '↺', widthVal: '23%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`状态: ${this.hexState}`);
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '加载示例 HEX', widthVal: '100%',
                        onAction: () => {
                            const sampleHex = ':100000000074012280020322D2DC8F9F0A\n:00000001FF\n';
                            const encoder = new util.TextEncoder();
                            const data = encoder.encodeInto(sampleHex);
                            let family: McuFamily = McuFamily.MCU_8051;
                            if (this.comp !== null) {
                                const id = this.comp.libraryId;
                                if (id.includes('STM32'))
                                    family = McuFamily.MCU_STM32F1;
                            }
                            traceBurn('UI_BURN_BEGIN', `source=property_sample family=${family} bytes=${data.length}`);
                            const result = this.appService.hexDebugger.loadHexData(data, family);
                            if (result.success && result.data !== undefined) {
                                const fam = family === McuFamily.MCU_8051 ? '8051' : 'STM32F1';
                                this.appService.loadMcuIntoSim(result.data.data, 0, fam);
                                this.statusMessage = 'HEX 加载成功';
                            }
                            else {
                                this.statusMessage = `加载失败: ${result.error}`;
                                traceBurn('UI_BURN_FAIL', `source=property_sample err=${result.error}`);
                            }
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 961, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '加载示例 HEX',
                            widthVal: '100%',
                            onAction: () => {
                                const sampleHex = ':100000000074012280020322D2DC8F9F0A\n:00000001FF\n';
                                const encoder = new util.TextEncoder();
                                const data = encoder.encodeInto(sampleHex);
                                let family: McuFamily = McuFamily.MCU_8051;
                                if (this.comp !== null) {
                                    const id = this.comp.libraryId;
                                    if (id.includes('STM32'))
                                        family = McuFamily.MCU_STM32F1;
                                }
                                traceBurn('UI_BURN_BEGIN', `source=property_sample family=${family} bytes=${data.length}`);
                                const result = this.appService.hexDebugger.loadHexData(data, family);
                                if (result.success && result.data !== undefined) {
                                    const fam = family === McuFamily.MCU_8051 ? '8051' : 'STM32F1';
                                    this.appService.loadMcuIntoSim(result.data.data, 0, fam);
                                    this.statusMessage = 'HEX 加载成功';
                                }
                                else {
                                    this.statusMessage = `加载失败: ${result.error}`;
                                    traceBurn('UI_BURN_FAIL', `source=property_sample err=${result.error}`);
                                }
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '加载示例 HEX', widthVal: '100%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.hexRegisters.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('寄存器组');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.margin({ top: 4 });
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.hexRegisters);
                        Text.fontSize(9);
                        Text.fontColor(ProteusColors.TEXT_PRIMARY);
                        Text.fontFamily('monospace');
                        Text.backgroundColor(ProteusColors.INPUT_READONLY_BG);
                        Text.padding(4);
                        Text.width('100%');
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
    private async browseHexFile(): Promise<void> {
        try {
            const options = new picker.DocumentSelectOptions();
            options.maxSelectNumber = 1;
            options.fileSuffixFilters = ['hex', 'HEX', 'ihx'];
            const docSelect = new picker.DocumentViewPicker();
            const uris = await docSelect.select(options);
            if (uris.length > 0) {
                this.hexPath = uris[0];
            }
        }
        catch (_e) {
            this.statusMessage = '文件选择器不可用，请手动输入路径';
        }
    }
    private async burnHex(): Promise<void> {
        if (this.hexPath.length === 0) {
            this.statusMessage = '请先输入 HEX 文件路径';
            traceBurn('UI_BURN_ABORT', 'empty path (property panel)');
            return;
        }
        this.statusMessage = '烧录中...';
        const ref = this.comp !== null ? this.comp.refDes : '-';
        traceBurn('UI_BURN_BEGIN', `source=property_panel path=${this.hexPath} ref=${ref}`);
        try {
            const fileHandle = fs.openSync(this.hexPath, fs.OpenMode.READ_ONLY);
            const stat = fs.statSync(this.hexPath);
            const buf = new ArrayBuffer(stat.size);
            fs.readSync(fileHandle.fd, buf);
            fs.closeSync(fileHandle);
            const data = new Uint8Array(buf);
            let family: McuFamily = McuFamily.MCU_8051;
            if (this.comp !== null) {
                const id = this.comp.libraryId;
                if (id.includes('STM32'))
                    family = McuFamily.MCU_STM32F1;
            }
            const familyStr = family === McuFamily.MCU_8051 ? '8051' : 'STM32F1';
            traceBurn('UI_BURN_READ', `path=${this.hexPath} size=${stat.size} family=${familyStr} preview=${formatFirmwarePreview(data)}`);
            const result = this.appService.hexDebugger.loadHexData(data, family);
            if (result.success && result.data !== undefined) {
                this.appService.loadMcuIntoSim(result.data.data, 0, familyStr);
                this.statusMessage = 'HEX 烧录成功';
                traceBurn('UI_BURN_OK', `source=property_panel path=${this.hexPath} family=${familyStr}`);
            }
            else {
                this.statusMessage = `烧录失败: ${result.error}`;
                traceBurn('UI_BURN_FAIL', `source=property_panel path=${this.hexPath} err=${result.error}`);
            }
        }
        catch (_e) {
            this.statusMessage = `打开文件失败: ${_e}`;
            traceBurn('UI_BURN_FAIL', `source=property_panel path=${this.hexPath} ex=${_e}`);
        }
    }
    rerender() {
        this.updateDirtyElements();
    }
}
