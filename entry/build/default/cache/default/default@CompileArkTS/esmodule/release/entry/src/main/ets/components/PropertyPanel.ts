if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface PropertyPanel_Params {
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
import { UnitParser, paramMapGet, CouplingMode, MathChannelOp, LogicDecodeProtocol, MultimeterMode, McuFamily, traceUiRefresh, traceUiSelect } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ComponentInstance } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ComponentParamsUpdate, ComponentParamEntry } from 'schematic_editor';
import { ProteusParamRow, ProteusClassicBtn, ProteusSectionTitle } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import { ProteusColors, ProteusDimens, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import { OscilloscopeWaveCanvas } from "@bundle:com.elecdraw.aischsim/entry/ets/components/OscilloscopeWaveCanvas";
import { LogicAnalyzerWaveCanvas } from "@bundle:com.elecdraw.aischsim/entry/ets/components/LogicAnalyzerWaveCanvas";
import fs from "@ohos:file.fs";
import picker from "@ohos:file.picker";
import util from "@ohos:util";
export class PropertyPanel extends ViewPU {
    constructor(k126, l126, m126, n126 = -1, o126 = undefined, p126) {
        super(k126, m126, n126, p126);
        if (typeof o126 === "function") {
            this.paramsGenerator_ = o126;
        }
        this.__selectedComponentId = new SynchedPropertySimpleOneWayPU(l126.selectedComponentId, this, "selectedComponentId");
        this.__docVersion = new SynchedPropertySimpleOneWayPU(l126.docVersion, this, "docVersion");
        this.__simWaveTick = new SynchedPropertySimpleOneWayPU(l126.simWaveTick, this, "simWaveTick");
        this.__statusMessage = new SynchedPropertySimpleTwoWayPU(l126.statusMessage, this, "statusMessage");
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
        this.setInitiallyProvidedValue(l126);
        this.declareWatch("selectedComponentId", this.onSelectionChange);
        this.declareWatch("docVersion", this.onDocVersionChange);
        this.declareWatch("simWaveTick", this.onSimWaveTick);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(j126: PropertyPanel_Params) {
        if (j126.selectedComponentId === undefined) {
            this.__selectedComponentId.set('');
        }
        if (j126.docVersion === undefined) {
            this.__docVersion.set(0);
        }
        if (j126.simWaveTick === undefined) {
            this.__simWaveTick.set(0);
        }
        if (j126.onDeleted !== undefined) {
            this.onDeleted = j126.onDeleted;
        }
        if (j126.comp !== undefined) {
            this.comp = j126.comp;
        }
        if (j126.paramKey !== undefined) {
            this.paramKey = j126.paramKey;
        }
        if (j126.paramValue !== undefined) {
            this.paramValue = j126.paramValue;
        }
        if (j126.paramEntries !== undefined) {
            this.paramEntries = j126.paramEntries;
        }
        if (j126.mmReading !== undefined) {
            this.mmReading = j126.mmReading;
        }
        if (j126.mmMode !== undefined) {
            this.mmMode = j126.mmMode;
        }
        if (j126.vmReading !== undefined) {
            this.vmReading = j126.vmReading;
        }
        if (j126.vmUnit !== undefined) {
            this.vmUnit = j126.vmUnit;
        }
        if (j126.amReading !== undefined) {
            this.amReading = j126.amReading;
        }
        if (j126.amUnit !== undefined) {
            this.amUnit = j126.amUnit;
        }
        if (j126.pmVoltage !== undefined) {
            this.pmVoltage = j126.pmVoltage;
        }
        if (j126.pmCurrent !== undefined) {
            this.pmCurrent = j126.pmCurrent;
        }
        if (j126.pmPower !== undefined) {
            this.pmPower = j126.pmPower;
        }
        if (j126.pmPF !== undefined) {
            this.pmPF = j126.pmPF;
        }
        if (j126.fcFreq !== undefined) {
            this.fcFreq = j126.fcFreq;
        }
        if (j126.fcGate !== undefined) {
            this.fcGate = j126.fcGate;
        }
        if (j126.sigFreq !== undefined) {
            this.sigFreq = j126.sigFreq;
        }
        if (j126.sigAmp !== undefined) {
            this.sigAmp = j126.sigAmp;
        }
        if (j126.uartHex !== undefined) {
            this.uartHex = j126.uartHex;
        }
        if (j126.uartLog !== undefined) {
            this.uartLog = j126.uartLog;
        }
        if (j126.decodedFrames !== undefined) {
            this.decodedFrames = j126.decodedFrames;
        }
        if (j126.hexPath !== undefined) {
            this.hexPath = j126.hexPath;
        }
        if (j126.hexRegisters !== undefined) {
            this.hexRegisters = j126.hexRegisters;
        }
        if (j126.hexState !== undefined) {
            this.hexState = j126.hexState;
        }
        if (j126.oscTimeData !== undefined) {
            this.oscTimeData = j126.oscTimeData;
        }
        if (j126.oscWaveData !== undefined) {
            this.oscWaveData = j126.oscWaveData;
        }
        if (j126.oscWaveDataCh2 !== undefined) {
            this.oscWaveDataCh2 = j126.oscWaveDataCh2;
        }
        if (j126.logicChannelData !== undefined) {
            this.logicChannelData = j126.logicChannelData;
        }
        if (j126.logicSampleCount !== undefined) {
            this.logicSampleCount = j126.logicSampleCount;
        }
        if (j126.logicChannelCount !== undefined) {
            this.logicChannelCount = j126.logicChannelCount;
        }
        if (j126.appService !== undefined) {
            this.appService = j126.appService;
        }
        if (j126.refreshTimer !== undefined) {
            this.refreshTimer = j126.refreshTimer;
        }
        if (j126.uiLogTick !== undefined) {
            this.uiLogTick = j126.uiLogTick;
        }
    }
    updateStateVars(i126: PropertyPanel_Params) {
        this.__selectedComponentId.reset(i126.selectedComponentId);
        this.__docVersion.reset(i126.docVersion);
        this.__simWaveTick.reset(i126.simWaveTick);
    }
    purgeVariableDependenciesOnElmtId(h126) {
        this.__selectedComponentId.purgeDependencyOnElmtId(h126);
        this.__docVersion.purgeDependencyOnElmtId(h126);
        this.__simWaveTick.purgeDependencyOnElmtId(h126);
        this.__statusMessage.purgeDependencyOnElmtId(h126);
        this.__comp.purgeDependencyOnElmtId(h126);
        this.__paramKey.purgeDependencyOnElmtId(h126);
        this.__paramValue.purgeDependencyOnElmtId(h126);
        this.__paramEntries.purgeDependencyOnElmtId(h126);
        this.__mmReading.purgeDependencyOnElmtId(h126);
        this.__mmMode.purgeDependencyOnElmtId(h126);
        this.__vmReading.purgeDependencyOnElmtId(h126);
        this.__vmUnit.purgeDependencyOnElmtId(h126);
        this.__amReading.purgeDependencyOnElmtId(h126);
        this.__amUnit.purgeDependencyOnElmtId(h126);
        this.__pmVoltage.purgeDependencyOnElmtId(h126);
        this.__pmCurrent.purgeDependencyOnElmtId(h126);
        this.__pmPower.purgeDependencyOnElmtId(h126);
        this.__pmPF.purgeDependencyOnElmtId(h126);
        this.__fcFreq.purgeDependencyOnElmtId(h126);
        this.__fcGate.purgeDependencyOnElmtId(h126);
        this.__sigFreq.purgeDependencyOnElmtId(h126);
        this.__sigAmp.purgeDependencyOnElmtId(h126);
        this.__uartHex.purgeDependencyOnElmtId(h126);
        this.__uartLog.purgeDependencyOnElmtId(h126);
        this.__decodedFrames.purgeDependencyOnElmtId(h126);
        this.__hexPath.purgeDependencyOnElmtId(h126);
        this.__hexRegisters.purgeDependencyOnElmtId(h126);
        this.__hexState.purgeDependencyOnElmtId(h126);
        this.__oscTimeData.purgeDependencyOnElmtId(h126);
        this.__oscWaveData.purgeDependencyOnElmtId(h126);
        this.__oscWaveDataCh2.purgeDependencyOnElmtId(h126);
        this.__logicChannelData.purgeDependencyOnElmtId(h126);
        this.__logicSampleCount.purgeDependencyOnElmtId(h126);
        this.__logicChannelCount.purgeDependencyOnElmtId(h126);
    }
    aboutToBeDeleted() {
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
    private __selectedComponentId: SynchedPropertySimpleOneWayPU<string>;
    get selectedComponentId() {
        return this.__selectedComponentId.get();
    }
    set selectedComponentId(g126: string) {
        this.__selectedComponentId.set(g126);
    }
    private __docVersion: SynchedPropertySimpleOneWayPU<number>;
    get docVersion() {
        return this.__docVersion.get();
    }
    set docVersion(f126: number) {
        this.__docVersion.set(f126);
    }
    private __simWaveTick: SynchedPropertySimpleOneWayPU<number>;
    get simWaveTick() {
        return this.__simWaveTick.get();
    }
    set simWaveTick(e126: number) {
        this.__simWaveTick.set(e126);
    }
    private __statusMessage: SynchedPropertySimpleTwoWayPU<string>;
    get statusMessage() {
        return this.__statusMessage.get();
    }
    set statusMessage(d126: string) {
        this.__statusMessage.set(d126);
    }
    private onDeleted: () => void;
    private __comp: ObservedPropertyObjectPU<ComponentInstance | null>;
    get comp() {
        return this.__comp.get();
    }
    set comp(c126: ComponentInstance | null) {
        this.__comp.set(c126);
    }
    private __paramKey: ObservedPropertySimplePU<string>;
    get paramKey() {
        return this.__paramKey.get();
    }
    set paramKey(b126: string) {
        this.__paramKey.set(b126);
    }
    private __paramValue: ObservedPropertySimplePU<string>;
    get paramValue() {
        return this.__paramValue.get();
    }
    set paramValue(a126: string) {
        this.__paramValue.set(a126);
    }
    private __paramEntries: ObservedPropertyObjectPU<string[]>;
    get paramEntries() {
        return this.__paramEntries.get();
    }
    set paramEntries(z125: string[]) {
        this.__paramEntries.set(z125);
    }
    private __mmReading: ObservedPropertySimplePU<string>;
    get mmReading() {
        return this.__mmReading.get();
    }
    set mmReading(y125: string) {
        this.__mmReading.set(y125);
    }
    private __mmMode: ObservedPropertySimplePU<string>;
    get mmMode() {
        return this.__mmMode.get();
    }
    set mmMode(x125: string) {
        this.__mmMode.set(x125);
    }
    private __vmReading: ObservedPropertySimplePU<string>;
    get vmReading() {
        return this.__vmReading.get();
    }
    set vmReading(w125: string) {
        this.__vmReading.set(w125);
    }
    private __vmUnit: ObservedPropertySimplePU<string>;
    get vmUnit() {
        return this.__vmUnit.get();
    }
    set vmUnit(v125: string) {
        this.__vmUnit.set(v125);
    }
    private __amReading: ObservedPropertySimplePU<string>;
    get amReading() {
        return this.__amReading.get();
    }
    set amReading(u125: string) {
        this.__amReading.set(u125);
    }
    private __amUnit: ObservedPropertySimplePU<string>;
    get amUnit() {
        return this.__amUnit.get();
    }
    set amUnit(t125: string) {
        this.__amUnit.set(t125);
    }
    private __pmVoltage: ObservedPropertySimplePU<string>;
    get pmVoltage() {
        return this.__pmVoltage.get();
    }
    set pmVoltage(s125: string) {
        this.__pmVoltage.set(s125);
    }
    private __pmCurrent: ObservedPropertySimplePU<string>;
    get pmCurrent() {
        return this.__pmCurrent.get();
    }
    set pmCurrent(r125: string) {
        this.__pmCurrent.set(r125);
    }
    private __pmPower: ObservedPropertySimplePU<string>;
    get pmPower() {
        return this.__pmPower.get();
    }
    set pmPower(q125: string) {
        this.__pmPower.set(q125);
    }
    private __pmPF: ObservedPropertySimplePU<string>;
    get pmPF() {
        return this.__pmPF.get();
    }
    set pmPF(p125: string) {
        this.__pmPF.set(p125);
    }
    private __fcFreq: ObservedPropertySimplePU<string>;
    get fcFreq() {
        return this.__fcFreq.get();
    }
    set fcFreq(o125: string) {
        this.__fcFreq.set(o125);
    }
    private __fcGate: ObservedPropertySimplePU<string>;
    get fcGate() {
        return this.__fcGate.get();
    }
    set fcGate(n125: string) {
        this.__fcGate.set(n125);
    }
    private __sigFreq: ObservedPropertySimplePU<string>;
    get sigFreq() {
        return this.__sigFreq.get();
    }
    set sigFreq(m125: string) {
        this.__sigFreq.set(m125);
    }
    private __sigAmp: ObservedPropertySimplePU<string>;
    get sigAmp() {
        return this.__sigAmp.get();
    }
    set sigAmp(l125: string) {
        this.__sigAmp.set(l125);
    }
    private __uartHex: ObservedPropertySimplePU<string>;
    get uartHex() {
        return this.__uartHex.get();
    }
    set uartHex(k125: string) {
        this.__uartHex.set(k125);
    }
    private __uartLog: ObservedPropertySimplePU<string>;
    get uartLog() {
        return this.__uartLog.get();
    }
    set uartLog(j125: string) {
        this.__uartLog.set(j125);
    }
    private __decodedFrames: ObservedPropertySimplePU<string>;
    get decodedFrames() {
        return this.__decodedFrames.get();
    }
    set decodedFrames(i125: string) {
        this.__decodedFrames.set(i125);
    }
    private __hexPath: ObservedPropertySimplePU<string>;
    get hexPath() {
        return this.__hexPath.get();
    }
    set hexPath(h125: string) {
        this.__hexPath.set(h125);
    }
    private __hexRegisters: ObservedPropertySimplePU<string>;
    get hexRegisters() {
        return this.__hexRegisters.get();
    }
    set hexRegisters(g125: string) {
        this.__hexRegisters.set(g125);
    }
    private __hexState: ObservedPropertySimplePU<string>;
    get hexState() {
        return this.__hexState.get();
    }
    set hexState(f125: string) {
        this.__hexState.set(f125);
    }
    private __oscTimeData: ObservedPropertyObjectPU<number[]>;
    get oscTimeData() {
        return this.__oscTimeData.get();
    }
    set oscTimeData(e125: number[]) {
        this.__oscTimeData.set(e125);
    }
    private __oscWaveData: ObservedPropertyObjectPU<number[]>;
    get oscWaveData() {
        return this.__oscWaveData.get();
    }
    set oscWaveData(d125: number[]) {
        this.__oscWaveData.set(d125);
    }
    private __oscWaveDataCh2: ObservedPropertyObjectPU<number[]>;
    get oscWaveDataCh2() {
        return this.__oscWaveDataCh2.get();
    }
    set oscWaveDataCh2(c125: number[]) {
        this.__oscWaveDataCh2.set(c125);
    }
    private __logicChannelData: ObservedPropertyObjectPU<number[][]>;
    get logicChannelData() {
        return this.__logicChannelData.get();
    }
    set logicChannelData(b125: number[][]) {
        this.__logicChannelData.set(b125);
    }
    private __logicSampleCount: ObservedPropertySimplePU<number>;
    get logicSampleCount() {
        return this.__logicSampleCount.get();
    }
    set logicSampleCount(a125: number) {
        this.__logicSampleCount.set(a125);
    }
    private __logicChannelCount: ObservedPropertySimplePU<number>;
    get logicChannelCount() {
        return this.__logicChannelCount.get();
    }
    set logicChannelCount(z124: number) {
        this.__logicChannelCount.set(z124);
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
        }, 500);
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
        this.appService.setActiveInstrumentComponent(this.comp.id);
        const a124 = this.comp.libraryId.toUpperCase();
        try {
            if (a124.includes('VIRTUAL_METER') || a124 === 'MULTIMETER') {
                const x124 = this.appService.instruments.measure();
                if (x124.success && x124.data !== undefined) {
                    this.mmReading = Number(x124.data).toFixed(3);
                }
                const y124 = this.appService.instruments.getInstrumentSnapshot();
                if (y124 !== undefined) {
                    this.mmMode = this.modeLabel(y124.multimeterMode);
                }
            }
            else if (a124.includes('VOLTMETER')) {
                const u124 = this.appService.readVoltmeterDeltaForComponent(this.comp.id);
                if (u124 !== null) {
                    this.vmReading = u124.toFixed(2);
                }
                else {
                    const w124 = this.appService.instruments.voltmeterMeasure();
                    if (w124.success && w124.data !== undefined) {
                        this.vmReading = Number(w124.data).toFixed(2);
                    }
                }
                const v124 = this.appService.instruments.getVoltmeterConfig();
                if (v124.success && v124.data !== undefined) {
                    this.vmUnit = v124.data.unit ?? 'V DC';
                }
            }
            else if (a124.includes('AMMETER')) {
                const r124 = this.appService.readAmmeterCurrentForComponent(this.comp.id);
                if (r124 !== null) {
                    this.amReading = r124.toFixed(3);
                }
                else {
                    const t124 = this.appService.instruments.ammeterMeasure();
                    if (t124.success && t124.data !== undefined) {
                        this.amReading = Number(t124.data).toFixed(3);
                    }
                }
                const s124 = this.appService.instruments.getAmmeterConfig();
                if (s124.success && s124.data !== undefined) {
                    this.amUnit = s124.data.unit ?? 'mA DC';
                }
            }
            else if (a124.includes('POWER') || a124.includes('WATT')) {
                const q124 = this.appService.instruments.powerMeterMeasure();
                if (q124.success && q124.data !== undefined) {
                    this.pmVoltage = Number(q124.data.voltage).toFixed(3);
                    this.pmCurrent = (Number(q124.data.current) * 1000).toFixed(2);
                    this.pmPower = (Number(q124.data.power) * 1000).toFixed(1);
                    this.pmPF = Number(q124.data.powerFactor).toFixed(2);
                }
            }
            else if (a124.includes('FREQ') || a124.includes('COUNTER')) {
                const o124 = this.appService.instruments.freqCounterMeasure();
                if (o124.success && o124.data !== undefined) {
                    if (Number(o124.data) >= 1e6) {
                        this.fcFreq = `${(Number(o124.data) / 1e6).toFixed(3)} MHz`;
                    }
                    else if (Number(o124.data) >= 1e3) {
                        this.fcFreq = `${(Number(o124.data) / 1e3).toFixed(1)} kHz`;
                    }
                    else {
                        this.fcFreq = `${Number(o124.data).toFixed(0)} Hz`;
                    }
                }
                const p124 = this.appService.instruments.getFreqCounterConfig();
                if (p124.success && p124.data !== undefined) {
                    this.fcGate = `${p124.data.gateTime}`;
                }
            }
            else if (a124.includes('OSC')) {
                const m124 = this.appService.instruments.getOscilloscopeWave(0);
                if (m124.success && m124.data !== undefined) {
                    this.oscTimeData = m124.data.timeAxis.slice();
                    this.oscWaveData = m124.data.voltageAxis.slice();
                }
                const n124 = this.appService.instruments.getOscilloscopeWave(1);
                if (n124.success && n124.data !== undefined) {
                    this.oscWaveDataCh2 = n124.data.voltageAxis.slice();
                }
            }
            else if (a124.includes('LOGIC') || a124.includes('ANALYZER')) {
                const c124 = this.appService.instruments.getLogicWaveData();
                if (c124.success && c124.data !== undefined) {
                    const g124: number[][] = [];
                    const h124 = c124.data;
                    for (let i124 = 0; i124 < h124.length; i124++) {
                        const j124 = h124[i124];
                        const k124: number[] = [];
                        for (let l124 = 0; l124 < j124.voltageAxis.length; l124++) {
                            k124.push(j124.voltageAxis[l124] > 0.5 ? 1 : 0);
                        }
                        g124.push(k124.slice());
                    }
                    this.logicChannelData = g124;
                    this.logicSampleCount = g124.length > 0 ? g124[0].length : 128;
                    this.logicChannelCount = g124.length;
                }
                const d124 = this.appService.instruments.getDecodedFrames();
                if (d124.length > 0) {
                    let e124 = '';
                    for (let f124 = 0; f124 < Math.min(d124.length, 8); f124++) {
                        e124 += `[${d124[f124].timestamp}] ${d124[f124].data}\n`;
                    }
                    this.decodedFrames = e124;
                }
            }
            else if (a124.includes('UART') || a124.includes('TERMINAL')) {
                this.uartLog = this.appService.instruments.getUartLog();
            }
        }
        catch (b124) {
        }
        this.logInstrumentReading(false);
    }
    private logInstrumentReading(x123: boolean): void {
        if (this.comp === null) {
            return;
        }
        if (!this.isInstrument()) {
            return;
        }
        this.uiLogTick++;
        if (!x123 && this.uiLogTick % 20 !== 0) {
            return;
        }
        const y123 = this.instrType();
        const z123 = this.buildReadingSummary(y123);
        if (x123) {
            traceUiSelect('Props', this.comp.id, this.comp.refDes, this.comp.libraryId, y123, z123);
        }
        else {
            traceUiRefresh('Props', this.comp.id, this.comp.refDes, this.comp.libraryId, y123, z123);
        }
    }
    private buildReadingSummary(u123: string): string {
        if (u123 === 'dmm')
            return `DMM ${this.mmReading} ${this.mmMode}`;
        if (u123 === 'vm')
            return `VM ${this.vmReading} ${this.vmUnit}`;
        if (u123 === 'am')
            return `AM ${this.amReading} ${this.amUnit}`;
        if (u123 === 'power')
            return `PM V=${this.pmVoltage} I=${this.pmCurrent} P=${this.pmPower}`;
        if (u123 === 'freq')
            return `FC ${this.fcFreq} gate=${this.fcGate}`;
        if (u123 === 'osc') {
            const v123 = this.oscWaveData.length;
            const w123 = v123 > 0 ? this.oscWaveData[v123 - 1].toFixed(4) : '0';
            return `OSC pts=${v123} last=${w123}V`;
        }
        if (u123 === 'logic')
            return `LA ch=${this.logicChannelCount} samples=${this.logicSampleCount}`;
        if (u123 === 'uart')
            return `UART logLen=${this.uartLog.length}`;
        return u123;
    }
    private ensureInstrumentBinding(): void {
        if (this.comp === null) {
            return;
        }
        const t123 = this.comp.libraryId.toUpperCase();
        this.appService.setActiveInstrumentComponent(this.comp.id);
        if (this.isInstrument() || t123.includes('METER') || t123.includes('SCOPE') || t123.includes('LOGIC')) {
            this.appService.refreshInstrumentReaderForComponent(this.comp.id);
        }
    }
    loadComponent(): void {
        if (!this.selectedComponentId) {
            this.comp = null;
            this.oscWaveData = [];
            this.oscWaveDataCh2 = [];
            return;
        }
        const l123 = this.appService.schematicEditor.getDocument();
        this.comp = l123.components.find(s123 => s123.id === this.selectedComponentId) ?? null;
        if (this.comp) {
            const m123: string[] = [];
            this.comp.parameters.forEach((q123: string, r123: string) => {
                m123.push(r123);
            });
            const n123 = this.appService.componentLibrary.getComponent(this.comp.libraryId);
            if (n123.success && n123.data !== undefined) {
                n123.data.defaultParams.forEach((o123: string, p123: string) => {
                    if (!m123.includes(p123)) {
                        m123.push(p123);
                    }
                });
            }
            this.paramEntries = m123;
        }
        else {
            this.paramEntries = [];
        }
    }
    private paramDisplayValue(i123: string): string {
        if (this.comp === null) {
            return '';
        }
        const j123 = this.comp.parameters.get(i123);
        if (j123 !== undefined && j123.length > 0) {
            return j123;
        }
        const k123 = this.appService.componentLibrary.getComponent(this.comp.libraryId);
        if (k123.success && k123.data !== undefined) {
            return paramMapGet(k123.data.defaultParams, i123, '');
        }
        return '';
    }
    private paramEditable(g123: string): boolean {
        if (this.comp === null) {
            return false;
        }
        const h123 = this.comp.libraryId.toUpperCase();
        if (g123 === 'voltage') {
            return h123 === 'VCC' || h123.includes('VAC') || h123.includes('POWER') || h123.includes('VDC');
        }
        if (g123 === 'power') {
            return h123.startsWith('R_');
        }
        if (g123 === 'value') {
            return h123.startsWith('R_') || h123.startsWith('C_') || h123.startsWith('L_');
        }
        return false;
    }
    private saveParam(d123: string, e123: string): void {
        if (this.comp === null) {
            return;
        }
        const f123 = UnitParser.validateParam(d123, e123);
        if (!f123.valid) {
            this.statusMessage = `参数无效: ${d123}=${e123}`;
            return;
        }
        this.appService.schematicEditor.setDeviceParam(this.comp.id, d123, f123.normalized);
        this.comp.parameters.set(d123, f123.normalized);
        this.appService.syncComponentParamToSimulation(this.comp.id, d123, f123.normalized);
        this.statusMessage = `已更新 ${d123}=${f123.normalized}`;
    }
    private isInstrument(): boolean {
        return this.instrType().length > 0;
    }
    private instrType(): string {
        if (this.comp === null)
            return '';
        const c123 = this.comp.libraryId.toUpperCase();
        if (c123.includes('OSC'))
            return 'osc';
        if (c123.includes('LOGIC') || c123.includes('ANALYZER'))
            return 'logic';
        if (c123.includes('VIRTUAL_METER') || c123 === 'MULTIMETER')
            return 'dmm';
        if (c123.includes('UART') || c123.includes('TERMINAL'))
            return 'uart';
        if (c123.includes('VOLT'))
            return 'vm';
        if (c123.includes('AMMETER') || c123.includes('AMP'))
            return 'am';
        if (c123.includes('POWER') || c123.includes('WATT'))
            return 'pm';
        if (c123.includes('FREQ') || c123.includes('COUNTER'))
            return 'fc';
        return '';
    }
    private modeLabel(b123: MultimeterMode): string {
        switch (b123) {
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
        const a123 = this.comp.libraryId;
        return a123.includes('AT89') || a123.includes('STC') || a123.includes('STM32');
    }
    initialRender() {
        this.observeComponentCreation2((y122, z122) => {
            Scroll.create();
            Scroll.width('100%');
            Scroll.height('100%');
            Scroll.scrollBar(BarState.Auto);
            Scroll.backgroundColor(ProteusColors.CANVAS_BG);
        }, Scroll);
        this.observeComponentCreation2((w122, x122) => {
            Column.create({ space: 6 });
            Column.width('100%');
            Column.padding({ left: 8, right: 8, top: 4, bottom: 8 });
        }, Column);
        this.observeComponentCreation2((a119, b119) => {
            If.create();
            if (this.comp) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((i122, j122) => {
                        If.create();
                        if (this.isInstrument()) {
                            this.ifElseBranchUpdateFunction(0, () => {
                                this.InstrumentComponentHeader.bind(this)();
                            });
                        }
                        else {
                            this.ifElseBranchUpdateFunction(1, () => {
                                {
                                    this.observeComponentCreation2((s122, t122) => {
                                        if (t122) {
                                            let u122 = new ProteusSectionTitle(this, { title: '器件信息' }, undefined, s122, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 394, col: 13 });
                                            ViewPU.create(u122);
                                            let v122 = () => {
                                                return {
                                                    title: '器件信息'
                                                };
                                            };
                                            u122.paramsGenerator_ = v122;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(s122, {
                                                title: '器件信息'
                                            });
                                        }
                                    }, { name: "ProteusSectionTitle" });
                                }
                                {
                                    this.observeComponentCreation2((o122, p122) => {
                                        if (p122) {
                                            let q122 = new ProteusParamRow(this, { label: '位号', value: this.comp.refDes, editable: false }, undefined, o122, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 395, col: 13 });
                                            ViewPU.create(q122);
                                            let r122 = () => {
                                                return {
                                                    label: '位号',
                                                    value: this.comp.refDes,
                                                    editable: false
                                                };
                                            };
                                            q122.paramsGenerator_ = r122;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(o122, {
                                                label: '位号', value: this.comp.refDes, editable: false
                                            });
                                        }
                                    }, { name: "ProteusParamRow" });
                                }
                                {
                                    this.observeComponentCreation2((k122, l122) => {
                                        if (l122) {
                                            let m122 = new ProteusParamRow(this, { label: '型号', value: this.comp.libraryId, editable: false }, undefined, k122, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 396, col: 13 });
                                            ViewPU.create(m122);
                                            let n122 = () => {
                                                return {
                                                    label: '型号',
                                                    value: this.comp.libraryId,
                                                    editable: false
                                                };
                                            };
                                            m122.paramsGenerator_ = n122;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(k122, {
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
                        this.observeComponentCreation2((e122, f122) => {
                            if (f122) {
                                let g122 = new ProteusParamRow(this, { label: 'X', value: `${this.comp.position.x}`, editable: false }, undefined, e122, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 398, col: 11 });
                                ViewPU.create(g122);
                                let h122 = () => {
                                    return {
                                        label: 'X',
                                        value: `${this.comp.position.x}`,
                                        editable: false
                                    };
                                };
                                g122.paramsGenerator_ = h122;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(e122, {
                                    label: 'X', value: `${this.comp.position.x}`, editable: false
                                });
                            }
                        }, { name: "ProteusParamRow" });
                    }
                    {
                        this.observeComponentCreation2((a122, b122) => {
                            if (b122) {
                                let c122 = new ProteusParamRow(this, { label: 'Y', value: `${this.comp.position.y}`, editable: false }, undefined, a122, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 399, col: 11 });
                                ViewPU.create(c122);
                                let d122 = () => {
                                    return {
                                        label: 'Y',
                                        value: `${this.comp.position.y}`,
                                        editable: false
                                    };
                                };
                                c122.paramsGenerator_ = d122;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(a122, {
                                    label: 'Y', value: `${this.comp.position.y}`, editable: false
                                });
                            }
                        }, { name: "ProteusParamRow" });
                    }
                    this.observeComponentCreation2((k121, l121) => {
                        If.create();
                        if (this.paramEntries.length > 0) {
                            this.ifElseBranchUpdateFunction(0, () => {
                                this.observeComponentCreation2((y121, z121) => {
                                    Divider.create();
                                    Divider.color(ProteusColors.DIVIDER);
                                    Divider.height(1);
                                    Divider.width('100%');
                                    Divider.margin({ top: 4, bottom: 4 });
                                }, Divider);
                                this.observeComponentCreation2((m121, n121) => {
                                    ForEach.create();
                                    const o121 = q121 => {
                                        const r121 = q121;
                                        {
                                            this.observeComponentCreation2((s121, t121) => {
                                                if (t121) {
                                                    let u121 = new ProteusParamRow(this, {
                                                        label: r121,
                                                        value: this.paramDisplayValue(r121),
                                                        editable: this.paramEditable(r121),
                                                        onChange: (x121: string) => { this.saveParam(r121, x121); }
                                                    }, undefined, s121, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 405, col: 15 });
                                                    ViewPU.create(u121);
                                                    let v121 = () => {
                                                        return {
                                                            label: r121,
                                                            value: this.paramDisplayValue(r121),
                                                            editable: this.paramEditable(r121),
                                                            onChange: (w121: string) => { this.saveParam(r121, w121); }
                                                        };
                                                    };
                                                    u121.paramsGenerator_ = v121;
                                                }
                                                else {
                                                    this.updateStateVarsOfChildByElmtId(s121, {
                                                        label: r121,
                                                        value: this.paramDisplayValue(r121),
                                                        editable: this.paramEditable(r121)
                                                    });
                                                }
                                            }, { name: "ProteusParamRow" });
                                        }
                                    };
                                    this.forEachUpdateFunction(m121, this.paramEntries, o121, (p121: string) => p121, false, false);
                                }, ForEach);
                                ForEach.pop();
                            });
                        }
                        else {
                            this.ifElseBranchUpdateFunction(1, () => {
                            });
                        }
                    }, If);
                    If.pop();
                    this.observeComponentCreation2((c121, d121) => {
                        If.create();
                        if (this.isInstrument()) {
                            this.ifElseBranchUpdateFunction(0, () => {
                                this.observeComponentCreation2((i121, j121) => {
                                    Divider.create();
                                    Divider.color(ProteusColors.DIVIDER);
                                    Divider.height(1);
                                    Divider.width('100%');
                                    Divider.margin({ top: 6, bottom: 4 });
                                }, Divider);
                                this.observeComponentCreation2((g121, h121) => {
                                    Text.create('仪表数据');
                                    Text.fontSize(ProteusFonts.PARAM_KEY);
                                    Text.fontColor(ProteusColors.TEXT_LABEL);
                                    Text.fontWeight(FontWeight.Medium);
                                    Text.width('100%');
                                    Text.padding({ left: 8, top: 4 });
                                }, Text);
                                Text.pop();
                                this.observeComponentCreation2((e121, f121) => {
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
                                    else {
                                        this.ifElseBranchUpdateFunction(8, () => {
                                        });
                                    }
                                }, If);
                                If.pop();
                            });
                        }
                        else {
                            this.ifElseBranchUpdateFunction(1, () => {
                            });
                        }
                    }, If);
                    If.pop();
                    this.observeComponentCreation2((w120, x120) => {
                        If.create();
                        if (this.isMcu()) {
                            this.ifElseBranchUpdateFunction(0, () => {
                                this.observeComponentCreation2((a121, b121) => {
                                    Divider.create();
                                    Divider.color(ProteusColors.DIVIDER);
                                    Divider.height(1);
                                    Divider.width('100%');
                                    Divider.margin({ top: 6, bottom: 4 });
                                }, Divider);
                                this.observeComponentCreation2((y120, z120) => {
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
                    this.observeComponentCreation2((u120, v120) => {
                        Divider.create();
                        Divider.color(ProteusColors.DIVIDER);
                        Divider.height(1);
                        Divider.width('100%');
                        Divider.margin({ top: 6, bottom: 4 });
                    }, Divider);
                    this.observeComponentCreation2((s120, t120) => {
                        Text.create('添加参数');
                        Text.fontSize(ProteusFonts.TITLE);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.fontWeight(FontWeight.Medium);
                        Text.width('100%');
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((q120, r120) => {
                        Row.create();
                        Row.width('100%');
                        Row.alignItems(VerticalAlign.Center);
                    }, Row);
                    this.observeComponentCreation2((o120, p120) => {
                        Text.create('名称:');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width(48);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((l120, m120) => {
                        TextInput.create({ placeholder: '参数名称', text: this.paramKey });
                        TextInput.layoutWeight(1);
                        TextInput.height(ProteusDimens.PARAM_ROW_HEIGHT);
                        TextInput.fontSize(ProteusFonts.PARAM_KEY);
                        TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
                        TextInput.borderRadius(0);
                        TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
                        TextInput.backgroundColor(ProteusColors.CANVAS_BG);
                        TextInput.onChange((n120: string) => { this.paramKey = n120; });
                    }, TextInput);
                    Row.pop();
                    this.observeComponentCreation2((j120, k120) => {
                        Row.create();
                        Row.width('100%');
                        Row.alignItems(VerticalAlign.Center);
                    }, Row);
                    this.observeComponentCreation2((h120, i120) => {
                        Text.create('数值:');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width(48);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((e120, f120) => {
                        TextInput.create({ placeholder: '参数值', text: this.paramValue });
                        TextInput.layoutWeight(1);
                        TextInput.height(ProteusDimens.PARAM_ROW_HEIGHT);
                        TextInput.fontSize(ProteusFonts.PARAM_VALUE);
                        TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
                        TextInput.borderRadius(0);
                        TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
                        TextInput.backgroundColor(ProteusColors.CANVAS_BG);
                        TextInput.onChange((g120: string) => { this.paramValue = g120; });
                    }, TextInput);
                    Row.pop();
                    this.observeComponentCreation2((c120, d120) => {
                        Row.create({ space: 6 });
                        Row.width('100%');
                        Row.justifyContent(FlexAlign.SpaceBetween);
                    }, Row);
                    {
                        this.observeComponentCreation2((s119, t119) => {
                            if (t119) {
                                let u119 = new ProteusClassicBtn(this, {
                                    label: '添加',
                                    widthVal: '30%',
                                    onAction: () => {
                                        if (this.comp && this.paramKey) {
                                            const z119 = UnitParser.validateParam(this.paramKey, this.paramValue);
                                            if (!z119.valid) {
                                                this.statusMessage = `非法参数: ${this.paramValue}`;
                                                return;
                                            }
                                            const a120: ComponentParamEntry = { key: this.paramKey, value: z119.normalized };
                                            const b120: ComponentParamsUpdate = { entries: [a120] };
                                            this.appService.schematicEditor.updateComponentParams(this.comp.id, b120);
                                            this.appService.syncComponentParamToSimulation(this.comp.id, a120.key, a120.value);
                                            this.loadComponent();
                                            this.statusMessage = '参数已更新';
                                        }
                                    }
                                }, undefined, s119, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 487, col: 13 });
                                ViewPU.create(u119);
                                let v119 = () => {
                                    return {
                                        label: '添加',
                                        widthVal: '30%',
                                        onAction: () => {
                                            if (this.comp && this.paramKey) {
                                                const w119 = UnitParser.validateParam(this.paramKey, this.paramValue);
                                                if (!w119.valid) {
                                                    this.statusMessage = `非法参数: ${this.paramValue}`;
                                                    return;
                                                }
                                                const x119: ComponentParamEntry = { key: this.paramKey, value: w119.normalized };
                                                const y119: ComponentParamsUpdate = { entries: [x119] };
                                                this.appService.schematicEditor.updateComponentParams(this.comp.id, y119);
                                                this.appService.syncComponentParamToSimulation(this.comp.id, x119.key, x119.value);
                                                this.loadComponent();
                                                this.statusMessage = '参数已更新';
                                            }
                                        }
                                    };
                                };
                                u119.paramsGenerator_ = v119;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(s119, {
                                    label: '添加',
                                    widthVal: '30%'
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    {
                        this.observeComponentCreation2((m119, n119) => {
                            if (n119) {
                                let o119 = new ProteusClassicBtn(this, {
                                    label: '旋转',
                                    widthVal: '30%',
                                    onAction: () => {
                                        if (this.comp) {
                                            const r119 = ((this.comp.rotation + 90) % 360) as 0 | 90 | 180 | 270;
                                            this.appService.schematicEditor.rotateComponent(this.comp.id, r119);
                                            this.loadComponent();
                                        }
                                    }
                                }, undefined, m119, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 506, col: 13 });
                                ViewPU.create(o119);
                                let p119 = () => {
                                    return {
                                        label: '旋转',
                                        widthVal: '30%',
                                        onAction: () => {
                                            if (this.comp) {
                                                const q119 = ((this.comp.rotation + 90) % 360) as 0 | 90 | 180 | 270;
                                                this.appService.schematicEditor.rotateComponent(this.comp.id, q119);
                                                this.loadComponent();
                                            }
                                        }
                                    };
                                };
                                o119.paramsGenerator_ = p119;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(m119, {
                                    label: '旋转',
                                    widthVal: '30%'
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    {
                        this.observeComponentCreation2((i119, j119) => {
                            if (j119) {
                                let k119 = new ProteusClassicBtn(this, {
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
                                }, undefined, i119, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 517, col: 13 });
                                ViewPU.create(k119);
                                let l119 = () => {
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
                                k119.paramsGenerator_ = l119;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(i119, {
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
                    this.observeComponentCreation2((g119, h119) => {
                        Column.create();
                        Column.width('100%');
                        Column.alignItems(HorizontalAlign.Start);
                    }, Column);
                    this.observeComponentCreation2((e119, f119) => {
                        Text.create('未选择器件');
                        Text.fontSize(ProteusFonts.TITLE);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((c119, d119) => {
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
    InstrumentComponentHeader(t118 = null) {
        this.observeComponentCreation2((y118, z118) => {
            Column.create({ space: 4 });
            Column.width('100%');
            Column.padding({ top: 4, bottom: 6, left: 2, right: 2 });
            Column.alignItems(HorizontalAlign.Start);
        }, Column);
        this.observeComponentCreation2((w118, x118) => {
            Text.create(this.comp !== null ? this.comp.refDes : '');
            Text.fontSize(14);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
            Text.maxLines(1);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
            Text.width('100%');
        }, Text);
        Text.pop();
        this.observeComponentCreation2((u118, v118) => {
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
    OscilloscopeSection(w116 = null) {
        this.observeComponentCreation2((r118, s118) => {
            Column.create({ space: 6 });
        }, Column);
        this.observeComponentCreation2((p118, q118) => {
            Text.create('波形显示');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((t117, u117) => {
            If.create();
            if (this.oscWaveData.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((n118, o118) => {
                        Column.create({ space: 2 });
                        Column.border({ width: 1, color: ProteusColors.DIVIDER });
                    }, Column);
                    this.observeComponentCreation2((l118, m118) => {
                        __Common__.create();
                        __Common__.width('100%');
                        __Common__.height(100);
                    }, __Common__);
                    {
                        this.observeComponentCreation2((h118, i118) => {
                            if (i118) {
                                let j118 = new OscilloscopeWaveCanvas(this, {
                                    timeData: this.oscTimeData,
                                    voltageData: this.oscWaveData,
                                    channelLabel: 'CH1',
                                    vPerDiv: 1,
                                    triggerLevel: 0
                                }, undefined, h118, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 582, col: 11 });
                                ViewPU.create(j118);
                                let k118 = () => {
                                    return {
                                        timeData: this.oscTimeData,
                                        voltageData: this.oscWaveData,
                                        channelLabel: 'CH1',
                                        vPerDiv: 1,
                                        triggerLevel: 0
                                    };
                                };
                                j118.paramsGenerator_ = k118;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(h118, {
                                    timeData: this.oscTimeData,
                                    voltageData: this.oscWaveData,
                                    channelLabel: 'CH1',
                                    vPerDiv: 1,
                                    triggerLevel: 0
                                });
                            }
                        }, { name: "OscilloscopeWaveCanvas" });
                    }
                    __Common__.pop();
                    Column.pop();
                    this.observeComponentCreation2((x117, y117) => {
                        If.create();
                        if (this.oscWaveDataCh2.length > 0) {
                            this.ifElseBranchUpdateFunction(0, () => {
                                this.observeComponentCreation2((f118, g118) => {
                                    Column.create({ space: 2 });
                                    Column.border({ width: 1, color: ProteusColors.DIVIDER });
                                }, Column);
                                this.observeComponentCreation2((d118, e118) => {
                                    __Common__.create();
                                    __Common__.width('100%');
                                    __Common__.height(100);
                                }, __Common__);
                                {
                                    this.observeComponentCreation2((z117, a118) => {
                                        if (a118) {
                                            let b118 = new OscilloscopeWaveCanvas(this, {
                                                timeData: this.oscTimeData,
                                                voltageData: this.oscWaveDataCh2,
                                                channelLabel: 'CH2',
                                                vPerDiv: 1,
                                                triggerLevel: 0
                                            }, undefined, z117, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 594, col: 13 });
                                            ViewPU.create(b118);
                                            let c118 = () => {
                                                return {
                                                    timeData: this.oscTimeData,
                                                    voltageData: this.oscWaveDataCh2,
                                                    channelLabel: 'CH2',
                                                    vPerDiv: 1,
                                                    triggerLevel: 0
                                                };
                                            };
                                            b118.paramsGenerator_ = c118;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(z117, {
                                                timeData: this.oscTimeData,
                                                voltageData: this.oscWaveDataCh2,
                                                channelLabel: 'CH2',
                                                vPerDiv: 1,
                                                triggerLevel: 0
                                            });
                                        }
                                    }, { name: "OscilloscopeWaveCanvas" });
                                }
                                __Common__.pop();
                                Column.pop();
                            });
                        }
                        else {
                            this.ifElseBranchUpdateFunction(1, () => {
                            });
                        }
                    }, If);
                    If.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.observeComponentCreation2((v117, w117) => {
                        Text.create('(运行仿真后显示波形)');
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                    }, Text);
                    Text.pop();
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((r117, s117) => {
            Row.create({ space: 6 });
            Row.width('100%');
        }, Row);
        {
            this.observeComponentCreation2((n117, o117) => {
                if (o117) {
                    let p117 = new ProteusClassicBtn(this, { label: 'AC', widthVal: '48%',
                        onAction: () => { this.appService.instruments.setCoupling(0, CouplingMode.AC); } }, undefined, n117, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 610, col: 9 });
                    ViewPU.create(p117);
                    let q117 = () => {
                        return {
                            label: 'AC',
                            widthVal: '48%',
                            onAction: () => { this.appService.instruments.setCoupling(0, CouplingMode.AC); }
                        };
                    };
                    p117.paramsGenerator_ = q117;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(n117, {
                        label: 'AC', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((j117, k117) => {
                if (k117) {
                    let l117 = new ProteusClassicBtn(this, { label: 'DC', widthVal: '48%',
                        onAction: () => { this.appService.instruments.setCoupling(0, CouplingMode.DC); } }, undefined, j117, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 612, col: 9 });
                    ViewPU.create(l117);
                    let m117 = () => {
                        return {
                            label: 'DC',
                            widthVal: '48%',
                            onAction: () => { this.appService.instruments.setCoupling(0, CouplingMode.DC); }
                        };
                    };
                    l117.paramsGenerator_ = m117;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(j117, {
                        label: 'DC', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((h117, i117) => {
            Row.create({ space: 6 });
            Row.width('100%');
        }, Row);
        {
            this.observeComponentCreation2((d117, e117) => {
                if (e117) {
                    let f117 = new ProteusClassicBtn(this, { label: 'FFT', widthVal: '48%',
                        onAction: () => { this.appService.instruments.setMathChannel(MathChannelOp.FFT); } }, undefined, d117, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 617, col: 9 });
                    ViewPU.create(f117);
                    let g117 = () => {
                        return {
                            label: 'FFT',
                            widthVal: '48%',
                            onAction: () => { this.appService.instruments.setMathChannel(MathChannelOp.FFT); }
                        };
                    };
                    f117.paramsGenerator_ = g117;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(d117, {
                        label: 'FFT', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((x116, y116) => {
                if (y116) {
                    let z116 = new ProteusClassicBtn(this, { label: '测量', widthVal: '48%', onAction: () => {
                            const c117 = this.appService.instruments.measureCursors(50, 150);
                            if (c117.success && c117.data !== undefined) {
                                this.statusMessage =
                                    `ΔV:${c117.data.deltaVoltage.toFixed(2)}V ΔT:${c117.data.deltaTime.toFixed(3)}ms`;
                            }
                        } }, undefined, x116, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 619, col: 9 });
                    ViewPU.create(z116);
                    let a117 = () => {
                        return {
                            label: '测量',
                            widthVal: '48%',
                            onAction: () => {
                                const b117 = this.appService.instruments.measureCursors(50, 150);
                                if (b117.success && b117.data !== undefined) {
                                    this.statusMessage =
                                        `ΔV:${b117.data.deltaVoltage.toFixed(2)}V ΔT:${b117.data.deltaTime.toFixed(3)}ms`;
                                }
                            }
                        };
                    };
                    z116.paramsGenerator_ = a117;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(x116, {
                        label: '测量', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        Column.pop();
    }
    LogicAnalyzerSection(j115 = null) {
        this.observeComponentCreation2((u116, v116) => {
            Column.create({ space: 4 });
        }, Column);
        this.observeComponentCreation2((i116, j116) => {
            If.create();
            if (this.logicChannelData.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((s116, t116) => {
                        Text.create('逻辑波形');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((q116, r116) => {
                        __Common__.create();
                        __Common__.width('100%');
                        __Common__.height(80);
                        __Common__.border({ width: 1, color: ProteusColors.DIVIDER });
                    }, __Common__);
                    {
                        this.observeComponentCreation2((m116, n116) => {
                            if (n116) {
                                let o116 = new LogicAnalyzerWaveCanvas(this, {
                                    channelData: this.logicChannelData,
                                    channelCount: this.logicChannelCount,
                                    sampleCount: this.logicSampleCount
                                }, undefined, m116, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 638, col: 9 });
                                ViewPU.create(o116);
                                let p116 = () => {
                                    return {
                                        channelData: this.logicChannelData,
                                        channelCount: this.logicChannelCount,
                                        sampleCount: this.logicSampleCount
                                    };
                                };
                                o116.paramsGenerator_ = p116;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(m116, {
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
                    this.observeComponentCreation2((k116, l116) => {
                        Text.create('(运行仿真后显示逻辑波形)');
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                    }, Text);
                    Text.pop();
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((g116, h116) => {
            Text.create('协议解码');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.margin({ top: 4 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((e116, f116) => {
            Row.create({ space: 6 });
            Row.width('100%');
        }, Row);
        {
            this.observeComponentCreation2((a116, b116) => {
                if (b116) {
                    let c116 = new ProteusClassicBtn(this, { label: 'UART', widthVal: '48%',
                        onAction: () => {
                            this.appService.instruments.decodeBus(LogicDecodeProtocol.UART, 115200);
                            this.refreshInstrumentData();
                        } }, undefined, a116, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 653, col: 9 });
                    ViewPU.create(c116);
                    let d116 = () => {
                        return {
                            label: 'UART',
                            widthVal: '48%',
                            onAction: () => {
                                this.appService.instruments.decodeBus(LogicDecodeProtocol.UART, 115200);
                                this.refreshInstrumentData();
                            }
                        };
                    };
                    c116.paramsGenerator_ = d116;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(a116, {
                        label: 'UART', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((w115, x115) => {
                if (x115) {
                    let y115 = new ProteusClassicBtn(this, { label: 'I2C', widthVal: '48%',
                        onAction: () => {
                            this.appService.instruments.decodeBus(LogicDecodeProtocol.I2C);
                            this.refreshInstrumentData();
                        } }, undefined, w115, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 658, col: 9 });
                    ViewPU.create(y115);
                    let z115 = () => {
                        return {
                            label: 'I2C',
                            widthVal: '48%',
                            onAction: () => {
                                this.appService.instruments.decodeBus(LogicDecodeProtocol.I2C);
                                this.refreshInstrumentData();
                            }
                        };
                    };
                    y115.paramsGenerator_ = z115;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(w115, {
                        label: 'I2C', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((u115, v115) => {
            Row.create({ space: 6 });
            Row.width('100%');
        }, Row);
        {
            this.observeComponentCreation2((q115, r115) => {
                if (r115) {
                    let s115 = new ProteusClassicBtn(this, { label: 'SPI', widthVal: '100%',
                        onAction: () => {
                            this.appService.instruments.decodeBus(LogicDecodeProtocol.SPI);
                            this.refreshInstrumentData();
                        } }, undefined, q115, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 666, col: 9 });
                    ViewPU.create(s115);
                    let t115 = () => {
                        return {
                            label: 'SPI',
                            widthVal: '100%',
                            onAction: () => {
                                this.appService.instruments.decodeBus(LogicDecodeProtocol.SPI);
                                this.refreshInstrumentData();
                            }
                        };
                    };
                    s115.paramsGenerator_ = t115;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(q115, {
                        label: 'SPI', widthVal: '100%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((k115, l115) => {
            If.create();
            if (this.decodedFrames.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((o115, p115) => {
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
                    this.observeComponentCreation2((m115, n115) => {
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
    MultimeterSection(k114 = null) {
        this.observeComponentCreation2((h115, i115) => {
            Column.create({ space: 6 });
        }, Column);
        this.observeComponentCreation2((f115, g115) => {
            Row.create({ space: 6 });
            Row.width('100%');
        }, Row);
        {
            this.observeComponentCreation2((b115, c115) => {
                if (c115) {
                    let d115 = new ProteusClassicBtn(this, { label: 'DCV', widthVal: '48%',
                        onAction: () => {
                            this.appService.instruments.setMode(MultimeterMode.DCV);
                            this.mmMode = 'DCV';
                            this.refreshInstrumentData();
                        } }, undefined, b115, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 690, col: 9 });
                    ViewPU.create(d115);
                    let e115 = () => {
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
                    d115.paramsGenerator_ = e115;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(b115, {
                        label: 'DCV', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((x114, y114) => {
                if (y114) {
                    let z114 = new ProteusClassicBtn(this, { label: 'ACV', widthVal: '48%',
                        onAction: () => {
                            this.appService.instruments.setMode(MultimeterMode.ACV);
                            this.mmMode = 'ACV';
                        } }, undefined, x114, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 696, col: 9 });
                    ViewPU.create(z114);
                    let a115 = () => {
                        return {
                            label: 'ACV',
                            widthVal: '48%',
                            onAction: () => {
                                this.appService.instruments.setMode(MultimeterMode.ACV);
                                this.mmMode = 'ACV';
                            }
                        };
                    };
                    z114.paramsGenerator_ = a115;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(x114, {
                        label: 'ACV', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((v114, w114) => {
            Row.create({ space: 6 });
            Row.width('100%');
        }, Row);
        {
            this.observeComponentCreation2((r114, s114) => {
                if (s114) {
                    let t114 = new ProteusClassicBtn(this, { label: 'Ω', widthVal: '48%',
                        onAction: () => {
                            this.appService.instruments.setMode(MultimeterMode.RESISTANCE);
                            this.mmMode = 'OHM';
                            this.refreshInstrumentData();
                        } }, undefined, r114, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 704, col: 9 });
                    ViewPU.create(t114);
                    let u114 = () => {
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
                    t114.paramsGenerator_ = u114;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(r114, {
                        label: 'Ω', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((n114, o114) => {
                if (o114) {
                    let p114 = new ProteusClassicBtn(this, { label: 'Auto', widthVal: '48%',
                        onAction: () => {
                            this.appService.instruments.autoRange();
                            this.refreshInstrumentData();
                        } }, undefined, n114, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 710, col: 9 });
                    ViewPU.create(p114);
                    let q114 = () => {
                        return {
                            label: 'Auto',
                            widthVal: '48%',
                            onAction: () => {
                                this.appService.instruments.autoRange();
                                this.refreshInstrumentData();
                            }
                        };
                    };
                    p114.paramsGenerator_ = q114;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(n114, {
                        label: 'Auto', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((l114, m114) => {
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
    VoltmeterSection(f114 = null) {
        this.observeComponentCreation2((i114, j114) => {
            Column.create({ space: 4 });
        }, Column);
        this.observeComponentCreation2((g114, h114) => {
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
    AmmeterSection(a114 = null) {
        this.observeComponentCreation2((d114, e114) => {
            Column.create({ space: 4 });
        }, Column);
        this.observeComponentCreation2((b114, c114) => {
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
    PowerMeterSection(f113 = null) {
        this.observeComponentCreation2((y113, z113) => {
            Column.create({ space: 4 });
        }, Column);
        this.observeComponentCreation2((w113, x113) => {
            Text.create(`功率表读数`);
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((s113, t113) => {
                if (t113) {
                    let u113 = new ProteusParamRow(this, { label: '电压', value: `${this.pmVoltage} V`, editable: false }, undefined, s113, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 755, col: 7 });
                    ViewPU.create(u113);
                    let v113 = () => {
                        return {
                            label: '电压',
                            value: `${this.pmVoltage} V`,
                            editable: false
                        };
                    };
                    u113.paramsGenerator_ = v113;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(s113, {
                        label: '电压', value: `${this.pmVoltage} V`, editable: false
                    });
                }
            }, { name: "ProteusParamRow" });
        }
        {
            this.observeComponentCreation2((o113, p113) => {
                if (p113) {
                    let q113 = new ProteusParamRow(this, { label: '电流', value: `${this.pmCurrent} mA`, editable: false }, undefined, o113, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 756, col: 7 });
                    ViewPU.create(q113);
                    let r113 = () => {
                        return {
                            label: '电流',
                            value: `${this.pmCurrent} mA`,
                            editable: false
                        };
                    };
                    q113.paramsGenerator_ = r113;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(o113, {
                        label: '电流', value: `${this.pmCurrent} mA`, editable: false
                    });
                }
            }, { name: "ProteusParamRow" });
        }
        {
            this.observeComponentCreation2((k113, l113) => {
                if (l113) {
                    let m113 = new ProteusParamRow(this, { label: '功率', value: `${this.pmPower} mW`, editable: false }, undefined, k113, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 757, col: 7 });
                    ViewPU.create(m113);
                    let n113 = () => {
                        return {
                            label: '功率',
                            value: `${this.pmPower} mW`,
                            editable: false
                        };
                    };
                    m113.paramsGenerator_ = n113;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(k113, {
                        label: '功率', value: `${this.pmPower} mW`, editable: false
                    });
                }
            }, { name: "ProteusParamRow" });
        }
        {
            this.observeComponentCreation2((g113, h113) => {
                if (h113) {
                    let i113 = new ProteusParamRow(this, { label: '功率因数', value: this.pmPF, editable: false }, undefined, g113, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 758, col: 7 });
                    ViewPU.create(i113);
                    let j113 = () => {
                        return {
                            label: '功率因数',
                            value: this.pmPF,
                            editable: false
                        };
                    };
                    i113.paramsGenerator_ = j113;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(g113, {
                        label: '功率因数', value: this.pmPF, editable: false
                    });
                }
            }, { name: "ProteusParamRow" });
        }
        Column.pop();
    }
    FreqCounterSection(n112 = null) {
        this.observeComponentCreation2((d113, e113) => {
            Column.create({ space: 4 });
        }, Column);
        this.observeComponentCreation2((b113, c113) => {
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
        this.observeComponentCreation2((z112, a113) => {
            Row.create({ space: 4 });
            Row.width('100%');
            Row.margin({ top: 4 });
        }, Row);
        this.observeComponentCreation2((x112, y112) => {
            Text.create('闸门:');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((u112, v112) => {
            TextInput.create({ text: this.fcGate });
            TextInput.fontSize(ProteusFonts.PARAM_KEY);
            TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
            TextInput.width(50);
            TextInput.height(ProteusDimens.PARAM_ROW_HEIGHT);
            TextInput.borderRadius(0);
            TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
            TextInput.backgroundColor(ProteusColors.CANVAS_BG);
            TextInput.onChange((w112: string) => { this.fcGate = w112; });
        }, TextInput);
        {
            this.observeComponentCreation2((o112, p112) => {
                if (p112) {
                    let q112 = new ProteusClassicBtn(this, { label: '设置', widthVal: 40, onAction: () => {
                            const t112 = parseFloat(this.fcGate) || 1;
                            this.appService.instruments.freqCounterSetGateTime(t112);
                            this.statusMessage = `闸门设为 ${t112}s`;
                        } }, undefined, o112, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 780, col: 9 });
                    ViewPU.create(q112);
                    let r112 = () => {
                        return {
                            label: '设置',
                            widthVal: 40,
                            onAction: () => {
                                const s112 = parseFloat(this.fcGate) || 1;
                                this.appService.instruments.freqCounterSetGateTime(s112);
                                this.statusMessage = `闸门设为 ${s112}s`;
                            }
                        };
                    };
                    q112.paramsGenerator_ = r112;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(o112, {
                        label: '设置', widthVal: 40
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        Column.pop();
    }
    UartTerminalSection(l111 = null) {
        this.observeComponentCreation2((l112, m112) => {
            Column.create({ space: 4 });
        }, Column);
        this.observeComponentCreation2((j112, k112) => {
            Text.create('串口终端');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((h112, i112) => {
            Row.create();
            Row.width('100%');
        }, Row);
        this.observeComponentCreation2((e112, f112) => {
            TextInput.create({ placeholder: 'HEX: 55 AA', text: this.uartHex });
            TextInput.layoutWeight(1);
            TextInput.height(ProteusDimens.PARAM_ROW_HEIGHT);
            TextInput.fontSize(ProteusFonts.PARAM_KEY);
            TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
            TextInput.borderRadius(0);
            TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
            TextInput.backgroundColor(ProteusColors.CANVAS_BG);
            TextInput.onChange((g112: string) => { this.uartHex = g112; });
        }, TextInput);
        {
            this.observeComponentCreation2((a112, b112) => {
                if (b112) {
                    let c112 = new ProteusClassicBtn(this, { label: '发', widthVal: 36,
                        onAction: () => {
                            this.appService.instruments.uartHexSend(this.uartHex);
                            this.statusMessage = `已发送: ${this.uartHex}`;
                        } }, undefined, a112, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 803, col: 9 });
                    ViewPU.create(c112);
                    let d112 = () => {
                        return {
                            label: '发',
                            widthVal: 36,
                            onAction: () => {
                                this.appService.instruments.uartHexSend(this.uartHex);
                                this.statusMessage = `已发送: ${this.uartHex}`;
                            }
                        };
                    };
                    c112.paramsGenerator_ = d112;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(a112, {
                        label: '发', widthVal: 36
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((w111, x111) => {
            If.create();
            if (this.uartLog.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((y111, z111) => {
                        Text.create(this.uartLog);
                        Text.fontSize(9);
                        Text.fontColor('#CCCCCC');
                        Text.fontFamily('monospace');
                        Text.backgroundColor('#0a0a12');
                        Text.padding(4);
                        Text.width('100%');
                        Text.maxLines(8);
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
        this.observeComponentCreation2((u111, v111) => {
            Row.create({ space: 4 });
            Row.width('100%');
        }, Row);
        {
            this.observeComponentCreation2((q111, r111) => {
                if (r111) {
                    let s111 = new ProteusClassicBtn(this, { label: '清空', widthVal: '48%',
                        onAction: () => {
                            this.appService.instruments.clearUartLog();
                            this.uartLog = '';
                        } }, undefined, q111, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 818, col: 9 });
                    ViewPU.create(s111);
                    let t111 = () => {
                        return {
                            label: '清空',
                            widthVal: '48%',
                            onAction: () => {
                                this.appService.instruments.clearUartLog();
                                this.uartLog = '';
                            }
                        };
                    };
                    s111.paramsGenerator_ = t111;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(q111, {
                        label: '清空', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((m111, n111) => {
                if (n111) {
                    let o111 = new ProteusClassicBtn(this, { label: '导出', widthVal: '48%',
                        onAction: () => {
                            void this.appService.instruments.exportUartLog('/data/storage/el2/base/uart_log.txt');
                            this.statusMessage = '日志已导出';
                        } }, undefined, m111, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 823, col: 9 });
                    ViewPU.create(o111);
                    let p111 = () => {
                        return {
                            label: '导出',
                            widthVal: '48%',
                            onAction: () => {
                                void this.appService.instruments.exportUartLog('/data/storage/el2/base/uart_log.txt');
                                this.statusMessage = '日志已导出';
                            }
                        };
                    };
                    o111.paramsGenerator_ = p111;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(m111, {
                        label: '导出', widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        Column.pop();
    }
    McuBurnSection(f109 = null) {
        this.observeComponentCreation2((j111, k111) => {
            Column.create({ space: 4 });
        }, Column);
        this.observeComponentCreation2((h111, i111) => {
            Row.create();
            Row.width('100%');
        }, Row);
        this.observeComponentCreation2((e111, f111) => {
            TextInput.create({ placeholder: 'firmware.hex 路径', text: this.hexPath });
            TextInput.layoutWeight(1);
            TextInput.height(28);
            TextInput.fontSize(ProteusFonts.PARAM_KEY);
            TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
            TextInput.borderRadius(0);
            TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
            TextInput.backgroundColor(ProteusColors.CANVAS_BG);
            TextInput.onChange((g111: string) => { this.hexPath = g111; });
        }, TextInput);
        {
            this.observeComponentCreation2((a111, b111) => {
                if (b111) {
                    let c111 = new ProteusClassicBtn(this, { label: '浏览', widthVal: 44,
                        onAction: () => { void this.browseHexFile(); } }, undefined, a111, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 843, col: 9 });
                    ViewPU.create(c111);
                    let d111 = () => {
                        return {
                            label: '浏览',
                            widthVal: 44,
                            onAction: () => { void this.browseHexFile(); }
                        };
                    };
                    c111.paramsGenerator_ = d111;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(a111, {
                        label: '浏览', widthVal: 44
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        {
            this.observeComponentCreation2((w110, x110) => {
                if (x110) {
                    let y110 = new ProteusClassicBtn(this, { label: '烧录 HEX', widthVal: '100%',
                        onAction: () => { void this.burnHex(); } }, undefined, w110, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 848, col: 7 });
                    ViewPU.create(y110);
                    let z110 = () => {
                        return {
                            label: '烧录 HEX',
                            widthVal: '100%',
                            onAction: () => { void this.burnHex(); }
                        };
                    };
                    y110.paramsGenerator_ = z110;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(w110, {
                        label: '烧录 HEX', widthVal: '100%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        this.observeComponentCreation2((u110, v110) => {
            Row.create({ space: 4 });
            Row.width('100%');
            Row.justifyContent(FlexAlign.SpaceBetween);
        }, Row);
        {
            this.observeComponentCreation2((q110, r110) => {
                if (r110) {
                    let s110 = new ProteusClassicBtn(this, { label: '▶', widthVal: '23%',
                        onAction: () => {
                            this.appService.hexDebugger.run();
                            this.hexState = 'running';
                            this.statusMessage = 'MCU 运行中';
                        } }, undefined, q110, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 852, col: 9 });
                    ViewPU.create(s110);
                    let t110 = () => {
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
                    s110.paramsGenerator_ = t110;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(q110, {
                        label: '▶', widthVal: '23%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((m110, n110) => {
                if (n110) {
                    let o110 = new ProteusClassicBtn(this, { label: '⏸', widthVal: '23%',
                        onAction: () => {
                            this.appService.hexDebugger.pause();
                            this.hexState = 'paused';
                            this.statusMessage = 'MCU 已暂停';
                        } }, undefined, m110, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 858, col: 9 });
                    ViewPU.create(o110);
                    let p110 = () => {
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
                    o110.paramsGenerator_ = p110;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(m110, {
                        label: '⏸', widthVal: '23%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((i110, j110) => {
                if (j110) {
                    let k110 = new ProteusClassicBtn(this, { label: '↷', widthVal: '23%',
                        onAction: () => {
                            this.appService.hexDebugger.step();
                            this.statusMessage = '单步执行';
                        } }, undefined, i110, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 864, col: 9 });
                    ViewPU.create(k110);
                    let l110 = () => {
                        return {
                            label: '↷',
                            widthVal: '23%',
                            onAction: () => {
                                this.appService.hexDebugger.step();
                                this.statusMessage = '单步执行';
                            }
                        };
                    };
                    k110.paramsGenerator_ = l110;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(i110, {
                        label: '↷', widthVal: '23%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((e110, f110) => {
                if (f110) {
                    let g110 = new ProteusClassicBtn(this, { label: '↺', widthVal: '23%',
                        onAction: () => {
                            this.appService.hexDebugger.reset();
                            this.hexState = 'stopped';
                            this.statusMessage = 'MCU 已复位';
                        } }, undefined, e110, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 869, col: 9 });
                    ViewPU.create(g110);
                    let h110 = () => {
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
                    g110.paramsGenerator_ = h110;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(e110, {
                        label: '↺', widthVal: '23%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((c110, d110) => {
            Text.create(`状态: ${this.hexState}`);
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((m109, n109) => {
                if (n109) {
                    let o109 = new ProteusClassicBtn(this, { label: '加载示例 HEX', widthVal: '100%', onAction: () => {
                            const w109 = ':100000000074012280020322D2DC8F9F0A\n:00000001FF\n';
                            const x109 = new util.TextEncoder();
                            const y109 = x109.encodeInto(w109);
                            let z109: McuFamily = McuFamily.MCU_8051;
                            if (this.comp !== null) {
                                const b110 = this.comp.libraryId;
                                if (b110.includes('STM32'))
                                    z109 = McuFamily.MCU_STM32F1;
                            }
                            const a110 = this.appService.hexDebugger.loadHexData(y109, z109);
                            this.statusMessage = a110.success ? 'HEX 加载成功' : `加载失败: ${a110.error}`;
                        } }, undefined, m109, () => { }, { page: "entry/src/main/ets/components/PropertyPanel.ets", line: 881, col: 7 });
                    ViewPU.create(o109);
                    let p109 = () => {
                        return {
                            label: '加载示例 HEX',
                            widthVal: '100%',
                            onAction: () => {
                                const q109 = ':100000000074012280020322D2DC8F9F0A\n:00000001FF\n';
                                const r109 = new util.TextEncoder();
                                const s109 = r109.encodeInto(q109);
                                let t109: McuFamily = McuFamily.MCU_8051;
                                if (this.comp !== null) {
                                    const v109 = this.comp.libraryId;
                                    if (v109.includes('STM32'))
                                        t109 = McuFamily.MCU_STM32F1;
                                }
                                const u109 = this.appService.hexDebugger.loadHexData(s109, t109);
                                this.statusMessage = u109.success ? 'HEX 加载成功' : `加载失败: ${u109.error}`;
                            }
                        };
                    };
                    o109.paramsGenerator_ = p109;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(m109, {
                        label: '加载示例 HEX', widthVal: '100%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        this.observeComponentCreation2((g109, h109) => {
            If.create();
            if (this.hexRegisters.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((k109, l109) => {
                        Text.create('寄存器组');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.margin({ top: 4 });
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((i109, j109) => {
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
            const c109 = new picker.DocumentSelectOptions();
            c109.maxSelectNumber = 1;
            c109.fileSuffixFilters = ['hex', 'HEX', 'ihx'];
            const d109 = new picker.DocumentViewPicker();
            const e109 = await d109.select(c109);
            if (e109.length > 0) {
                this.hexPath = e109[0];
            }
        }
        catch (b109) {
            this.statusMessage = '文件选择器不可用，请手动输入路径';
        }
    }
    private async burnHex(): Promise<void> {
        if (this.hexPath.length === 0) {
            this.statusMessage = '请先输入 HEX 文件路径';
            return;
        }
        this.statusMessage = '烧录中...';
        try {
            const u108 = fs.openSync(this.hexPath, fs.OpenMode.READ_ONLY);
            const v108 = fs.statSync(this.hexPath);
            const w108 = new ArrayBuffer(v108.size);
            fs.readSync(u108.fd, w108);
            fs.closeSync(u108);
            const x108 = new Uint8Array(w108);
            let y108: McuFamily = McuFamily.MCU_8051;
            if (this.comp !== null) {
                const a109 = this.comp.libraryId;
                if (a109.includes('STM32'))
                    y108 = McuFamily.MCU_STM32F1;
            }
            const z108 = this.appService.hexDebugger.loadHexData(x108, y108);
            this.statusMessage = z108.success ? 'HEX 烧录成功' : `烧录失败: ${z108.error}`;
        }
        catch (t108) {
            this.statusMessage = `打开文件失败: ${t108}`;
        }
    }
    rerender() {
        this.updateDirtyElements();
    }
}
