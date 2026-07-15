import { SchematicEditorImpl } from "@bundle:com.elecdraw.aischsim/entry@schematic_editor/Index";
import type { ISchematicEditor } from "@bundle:com.elecdraw.aischsim/entry@schematic_editor/Index";
import { ComponentLibraryImpl } from "@bundle:com.elecdraw.aischsim/entry@component_library/Index";
import type { IComponentLibrary } from "@bundle:com.elecdraw.aischsim/entry@component_library/Index";
import { SimulationKernelImpl } from "@bundle:com.elecdraw.aischsim/entry@simulation_kernel/Index";
import type { ISimulationKernel, KernelFrameSnapshot } from "@bundle:com.elecdraw.aischsim/entry@simulation_kernel/Index";
import { SimWorkerHost } from "@bundle:com.elecdraw.aischsim/entry/ets/services/sim/SimWorkerHost";
import type { SimFramePlain } from './sim/SimProtocol';
import { HexDebuggerImpl, McuBehaviorSimulator } from "@bundle:com.elecdraw.aischsim/entry@hex_debugger/Index";
import type { IHexDebugger } from "@bundle:com.elecdraw.aischsim/entry@hex_debugger/Index";
import { AiApiManagerImpl } from "@bundle:com.elecdraw.aischsim/entry@ai_api_manager/Index";
import type { IAiApiManager } from "@bundle:com.elecdraw.aischsim/entry@ai_api_manager/Index";
import { AiEngineImpl } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/Index";
import type { IAiEngine, TeachingService, LabTemplate } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/Index";
import { FilePersistenceImpl, CrashGuard } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/Index";
import type { IFilePersistence, BomLookup, SessionState } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/Index";
import { VirtualInstrumentsImpl } from "@bundle:com.elecdraw.aischsim/entry@instruments/Index";
import type { IVirtualInstruments, ComponentInstrumentBinding } from "@bundle:com.elecdraw.aischsim/entry@instruments/Index";
import { PluginManagerImpl } from "@bundle:com.elecdraw.aischsim/entry@plugin_system/Index";
import type { IPluginManager } from "@bundle:com.elecdraw.aischsim/entry@plugin_system/Index";
import type common from "@ohos:app.ability.common";
import fs from "@ohos:file.fs";
import { DeviceLibraryBootstrap } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/DeviceLibraryBootstrap";
import { TemplateProjectBootstrap } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/TemplateProjectBootstrap";
import { TemplateMergeUtil } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/TemplateMergeUtil";
import { ProjectPaths } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/ProjectPaths";
import { KeyboardShortcutManager } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/KeyboardShortcutManager";
import { ThemeManager } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ThemeManager";
import { EventBus, ModuleEvent, CallbackRegistry, AiTaskType, defaultSimConfig, Logger, ExportPostProcessor, ResultHelper, LicenseManager, FeatureGate, SchematicAnnotationType, SchematicAnnotationStatus, IdUtil, calcSymbolBounds, paramMapGet, PrivacyConsentStore, McuFamily, SimulationState, getPinNetMap, findNetForPinLabel, TopologyAdapter, traceInteractiveInstrumentLive, traceBindingRefresh, traceActiveComponentChanged, traceReloadSchematic, traceSimStep, tracePinNetEmpty, INSTR_TRACE_TAG, traceMeasure, formatPinNetMap, ensureNetPinConnectivity, traceProjectOpenAudit, traceSimStartupAudit, traceDataFlow, traceErcErrorList, traceBurn, traceUart, formatUartBytesHex, traceUartTxDrain, emptySchTopology } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ProjectFile, ModuleEventPayload, SchTopology, WaveData, ErcError, ProgressInfo, FaultType, FaultInjection, FaultScanResult, AccessibilityConfig, ApiResult, LicenseStatus, UsageDashboard, SnapshotMeta, VersionCompareReport, SymbolBounds, Pin, SchematicDocument, PowerMeterConfig, InteractiveMeterSnap, BindingTraceInfo, PinGeometryResolver, PinGeometry } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { CollabSyncClient } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/Index";
import type { CollabPresence } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/Index";
/** AI 整图生成对话/日志条目（Claude/Cursor 风格流） */
export interface AiGenLogEntry {
    id: string;
    role: 'user' | 'assistant' | 'system';
    text: string;
    ts: number;
}
export type AiGenerateMode = 'replace' | 'append';
interface SimStepData {
    waves: WaveData[];
    stepCount: number;
}
class BomLookupImpl implements BomLookup {
    private lib: IComponentLibrary;
    constructor(lib: IComponentLibrary) {
        this.lib = lib;
    }
    getDisplayName(libraryId: string): string {
        const r = this.lib.getComponent(libraryId);
        return r.success && r.data !== undefined ? r.data.name : libraryId;
    }
    getDefaultValue(libraryId: string): string {
        const r = this.lib.getComponent(libraryId);
        if (r.success && r.data !== undefined) {
            const keys: string[] = ['value', 'Value', 'resistance', 'capacitance', 'voltage'];
            for (let i = 0; i < keys.length; i++) {
                const v = paramMapGet(r.data.defaultParams, keys[i], '');
                if (v.length > 0) {
                    return v;
                }
            }
        }
        return '';
    }
}
export class AppService {
    private static instance: AppService;
    readonly schematicEditor: ISchematicEditor;
    readonly componentLibrary: IComponentLibrary;
    readonly simulationKernel: ISimulationKernel;
    readonly hexDebugger: IHexDebugger;
    readonly aiApiManager: IAiApiManager;
    readonly aiEngine: IAiEngine;
    readonly filePersistence: IFilePersistence;
    readonly instruments: IVirtualInstruments;
    readonly pluginManager: IPluginManager;
    readonly teachingService: TeachingService;
    readonly mcuBehavior: McuBehaviorSimulator;
    readonly crashGuard: CrashGuard;
    readonly collabSync: CollabSyncClient = new CollabSyncClient();
    currentProject: ProjectFile | null = null;
    currentProjectPath: string = '';
    sessionHolderId: string = IdUtil.generate('user');
    sessionUserName: string = '本地用户';
    private accessibility: AccessibilityConfig = {
        highContrast: false, keyboardOnly: false, uiScale: 1.0, screenReader: false
    };
    private displayPumpTimer: number = -1;
    private displayPumpActive: boolean = false;
    private simStepCount: number = 0;
    /** Set while pinch/pan — DisplayPump skips heavy publish to leave UV for MMI */
    private uiGestureBusy: boolean = false;
    private readonly DISPLAY_PUMP_MS: number = 33;
    private readonly simHost: SimWorkerHost = new SimWorkerHost();
    private schematicDebounceTimer: number = -1;
    private readonly SCHEMATIC_DEBOUNCE_MS: number = 150;
    private lastActiveInstrumentId: string | null = null;
    private bindingPinHash: Map<string, string> = new Map();
    private appBaseDir: string = '';
    private aiGenerating: boolean = false;
    private aiGenLogs: AiGenLogEntry[] = [];
    private aiGenLogSeq: number = 0;
    private aiGenCancelRequested: boolean = false;
    onProjectChanged: () => void = () => { };
    onStatusMessage: (msg: string) => void = () => { };
    onErcUpdate: (errors: ErcError[]) => void = () => { };
    onWaveUpdate: (waves: WaveData[]) => void = () => { };
    onAiProgress: (p: ProgressInfo) => void = () => { };
    onAiGeneratingChanged: (busy: boolean) => void = () => { };
    onAiGenLogsChanged: (logs: AiGenLogEntry[]) => void = () => { };
    wireToolToggleHandler: () => void = () => { };
    copyHandler: () => void = () => { };
    pasteHandler: () => void = () => { };
    cutHandler: () => void = () => { };
    private constructor() {
        this.schematicEditor = new SchematicEditorImpl();
        this.componentLibrary = new ComponentLibraryImpl();
        this.simulationKernel = new SimulationKernelImpl();
        this.hexDebugger = new HexDebuggerImpl();
        this.aiApiManager = new AiApiManagerImpl();
        this.aiEngine = new AiEngineImpl(this.aiApiManager, this.componentLibrary);
        this.filePersistence = new FilePersistenceImpl();
        this.instruments = new VirtualInstrumentsImpl();
        this.pluginManager = new PluginManagerImpl();
        this.teachingService = (this.aiEngine as AiEngineImpl).teachingService;
        this.mcuBehavior = new McuBehaviorSimulator();
        this.crashGuard = new CrashGuard();
        (this.instruments as VirtualInstrumentsImpl).setUartTxSink((bytes: number[]) => {
            traceUart('APP_TX_SINK', `n=${bytes.length} hex=${formatUartBytesHex(bytes)} → simHost.injectUsartRx`);
            this.simHost.injectUsartRx(bytes, this.simulationKernel as SimulationKernelImpl);
        });
        this.simHost.setErrorHandler((msg: string) => {
            this.onStatusMessage(`仿真线程: ${msg}`);
        });
        this.wireEventBus();
        this.wireCallbacks();
        this.wireComponentBoundsResolver();
        this.wireBomLookup();
        this.registerKeyboardShortcuts();
        this.crashGuard.enable(60000, () => this.getTopology());
        this.pluginManager.loadPlugin('Plugins/Script/batch_bom_export.py');
    }
    initPlatform(context: common.UIAbilityContext): void {
        const filesDir = context.filesDir;
        const baseDir = `${filesDir}/${ProjectPaths.APP_ROOT}`;
        this.appBaseDir = baseDir;
        try {
            fs.accessSync(baseDir);
        }
        catch (_e) {
            try {
                fs.mkdirSync(baseDir);
            }
            catch (_e2) { }
        }
        try {
            fs.accessSync(`${baseDir}/${ProjectPaths.AUTOSAVE_DIR}`);
        }
        catch (_e) {
            try {
                fs.mkdirSync(`${baseDir}/${ProjectPaths.AUTOSAVE_DIR}`);
            }
            catch (_e2) { }
        }
        try {
            fs.mkdirSync(ProjectPaths.userProjectRoot(baseDir), true);
        }
        catch (_e) { }
        ThemeManager.getInstance().init(baseDir);
        (this.filePersistence as FilePersistenceImpl).setAppBaseDir(baseDir);
        this.filePersistence.initCollaboration(baseDir);
        void TemplateProjectBootstrap.ensure(context, baseDir);
        void this.bootstrapAndLoadLibrary(context, `${baseDir}/DeviceLibrary`);
        void this.loadProteusAliases(context);
        void LicenseManager.getInstance().applyTrialStatus(context);
        void PrivacyConsentStore.init(context);
        this.pluginManager.setPluginInstallDir(`${filesDir}/AISchSim/Plugins`);
        this.collabSync.setSession(this.sessionHolderId, this.sessionUserName);
        const licensePath = `${filesDir}/AISchSim/license.lic`;
        const status = LicenseManager.getInstance().loadFromPath(licensePath);
        FeatureGate.refresh();
        const trialHint = status.valid ? status.message : LicenseManager.getInstance().getStatus().message;
        this.onStatusMessage(trialHint);
        EventBus.getInstance().publish({
            event: ModuleEvent.LICENSE_CHANGED,
            source: 'entry',
            timestamp: Date.now(),
            data: status
        });
    }
    getLicenseStatus(): LicenseStatus {
        return LicenseManager.getInstance().getStatus();
    }
    getDeviceCode(): string {
        return LicenseManager.getInstance().getDeviceCode();
    }
    importLicense(context: common.UIAbilityContext, licenseJson: string): LicenseStatus {
        const path = `${context.filesDir}/AISchSim/license.lic`;
        const status = LicenseManager.getInstance().importAndSave(path, licenseJson);
        FeatureGate.refresh();
        EventBus.getInstance().publish({
            event: ModuleEvent.LICENSE_CHANGED,
            source: 'entry',
            timestamp: Date.now(),
            data: status
        });
        return status;
    }
    getAiUsageDashboard(): UsageDashboard {
        return this.aiApiManager.getUsageDashboard();
    }
    static getInstance(): AppService {
        if (!AppService.instance) {
            AppService.instance = new AppService();
        }
        return AppService.instance;
    }
    newProject(name: string = 'Untitled'): void {
        if (this.currentProjectPath.length > 0 && this.canUseSidecarLock(this.currentProjectPath)) {
            this.filePersistence.releaseProjectLock(this.currentProjectPath, this.sessionHolderId);
        }
        this.currentProject = this.filePersistence.createNewProject(name);
        this.currentProjectPath = '';
        const editor = this.schematicEditor as SchematicEditorImpl;
        editor.loadAnnotations([]);
        editor.setReadOnly(false);
        this.schematicEditor.loadDocument(this.currentProject.schematic);
        this.simulationKernel.loadSchematic(this.currentProject.schematic);
        this.onProjectChanged();
        this.onStatusMessage(`新建工程: ${name}`);
    }
    getTopology(): SchTopology {
        return this.schematicEditor.getFullTopology();
    }
    /** Reload simulation netlist from current schematic while preserving run/pause state */
    reloadSimulationFromSchematic(): void {
        const kernel = this.simulationKernel as SimulationKernelImpl;
        if (!kernel.isSimActive()) {
            return;
        }
        (this.schematicEditor as SchematicEditorImpl).rebuildNetPinConnectivity();
        const doc = this.schematicEditor.getDocument();
        ensureNetPinConnectivity(doc, doc.metadata.gridSize || 10, this.pinGeometryResolver());
        this.bindingPinHash.clear();
        kernel.loadSchematic(doc);
        this.autoWireAllInstruments();
        this.autoWireSignalGenerators();
        const activeComp = (this.instruments as VirtualInstrumentsImpl).getActiveInstrumentComponent();
        traceReloadSchematic(activeComp, doc.components.length, doc.nets.length);
        if (activeComp !== null && activeComp.length > 0) {
            this.refreshInstrumentReaderForComponent(activeComp);
            this.setActiveInstrumentComponent(activeComp);
        }
    }
    /** Toggle pause/resume during active simulation; returns true if now paused */
    toggleSimulationPause(): boolean {
        const kernel = this.simulationKernel as SimulationKernelImpl;
        if (kernel.getState() === SimulationState.RUNNING) {
            kernel.pauseSim();
            this.simHost.pause();
            this.onStatusMessage('仿真已暂停');
            return true;
        }
        if (kernel.getState() === SimulationState.PAUSED) {
            kernel.resumeSim();
            this.simHost.resume(kernel);
            this.onStatusMessage('仿真已恢复');
            return false;
        }
        return false;
    }
    isSimulationPaused(): boolean {
        return (this.simulationKernel as SimulationKernelImpl).isSimPaused();
    }
    invalidateInstrumentBinding(compId: string): void {
        this.bindingPinHash.delete(compId);
    }
    /** Force re-bind all instruments (e.g. after simulation start) */
    refreshAllInstrumentBindings(): void {
        this.bindingPinHash.clear();
        this.autoWireAllInstruments();
    }
    /** Push schematic parameter changes into the running simulation kernel */
    syncComponentParamToSimulation(_compId: string, _key: string, _value: string): void {
        this.reloadSimulationFromSchematic();
    }
    /** Set which component instance drives Props/Instr instrument readouts */
    setActiveInstrumentComponent(compInstId: string | null): void {
        if (compInstId !== this.lastActiveInstrumentId) {
            traceActiveComponentChanged(compInstId, 'AppService.setActive');
            this.lastActiveInstrumentId = compInstId;
        }
        if (compInstId !== null && compInstId.length > 0) {
            this.refreshInstrumentReaderForComponent(compInstId);
        }
        (this.instruments as VirtualInstrumentsImpl).setActiveInstrumentComponent(compInstId);
    }
    /**
     * Read voltmeter V+ − COM directly from schematic pins + simulation.
     * Avoids shared-engine stale binding when multiple voltmeters exist.
     * @param quiet Skip instr_trace measure log (high-rate sim sampling)
     */
    readVoltmeterDeltaForComponent(compInstId: string, quiet: boolean = false): number | null {
        const doc = this.schematicEditor.getDocument();
        const comp = doc.components.find(c => c.id === compInstId);
        if (comp === undefined) {
            return null;
        }
        const upper = comp.libraryId.toUpperCase();
        if (!upper.includes('VOLTMETER') && !upper.includes('VIRTUAL_METER') && upper !== 'MULTIMETER') {
            return null;
        }
        const kernel = this.simulationKernel as SimulationKernelImpl;
        const pinNets = getPinNetMap(compInstId, doc.nets);
        const netPlus = findNetForPinLabel(pinNets, 'V+') ?? findNetForPinLabel(pinNets, 'V') ??
            findNetForPinLabel(pinNets, 'PLUS') ?? findNetForPinLabel(pinNets, '+') ??
            findNetForPinLabel(pinNets, 'PROBE1');
        if (netPlus === null) {
            return null;
        }
        const netCom = findNetForPinLabel(pinNets, 'COM') ?? findNetForPinLabel(pinNets, 'V-') ??
            findNetForPinLabel(pinNets, '-') ?? findNetForPinLabel(pinNets, 'GND') ??
            findNetForPinLabel(pinNets, 'PROBE2');
        if (netCom === null) {
            return null;
        }
        const vPlus = kernel.getNetVoltageByUuid(netPlus);
        const vCom = kernel.getNetVoltageByUuid(netCom);
        const delta = vPlus - vCom;
        if (!quiet) {
            traceMeasure(comp.refDes, 'V', kernel.isSimActive(), `UI V+(${this.netLabel(doc, netPlus)})=${vPlus.toFixed(4)}V ` +
                `COM(${this.netLabel(doc, netCom)})=${vCom.toFixed(4)}V ` +
                `Δ=${delta.toFixed(4)}V sign=${delta >= 0 ? '+' : '-'} (${delta >= 0 ? 'V+>COM' : 'COM>V+'})`);
        }
        return delta;
    }
    /**
     * Read ammeter branch current (mA, signed I+→I-) for a specific instance.
     * @param quiet Skip instr_trace measure log (high-rate sim sampling)
     */
    readAmmeterCurrentForComponent(compInstId: string, quiet: boolean = false): number | null {
        const doc = this.schematicEditor.getDocument();
        const comp = doc.components.find(c => c.id === compInstId);
        if (comp === undefined) {
            return null;
        }
        if (!comp.libraryId.toUpperCase().includes('AMMETER')) {
            return null;
        }
        const kernel = this.simulationKernel as SimulationKernelImpl;
        const pinNets = getPinNetMap(compInstId, doc.nets);
        const netPlus = findNetForPinLabel(pinNets, 'I+') ?? findNetForPinLabel(pinNets, 'PLUS') ??
            findNetForPinLabel(pinNets, '+');
        const netMinus = findNetForPinLabel(pinNets, 'I-') ?? findNetForPinLabel(pinNets, 'MINUS') ??
            findNetForPinLabel(pinNets, '-');
        if (netPlus === null || netMinus === null) {
            return null;
        }
        const iBranch = kernel.getBranchCurrent(compInstId);
        if (Math.abs(iBranch) > 1e-15) {
            const mA = iBranch * 1000;
            if (!quiet) {
                traceMeasure(comp.refDes, 'I', kernel.isSimActive(), `UI I+→I- I=${mA.toFixed(4)}mA sign=${iBranch >= 0 ? '+' : '-'}`);
            }
            return mA;
        }
        // Fallback: net current at I+ (ideal VSRC branch key can miss after quiet re-stamp)
        const iNet = kernel.getNetCurrentByUuid(netPlus);
        if (Math.abs(iNet) > 1e-15) {
            const mA = iNet * 1000;
            if (!quiet) {
                traceMeasure(comp.refDes, 'I', kernel.isSimActive(), `UI I+(net) I=${mA.toFixed(4)}mA sign=${iNet >= 0 ? '+' : '-'}`);
            }
            return mA;
        }
        return 0;
    }
    isSimulationRunning(): boolean {
        const kernel = this.simulationKernel as SimulationKernelImpl;
        return kernel.isSimActive() && kernel.getState() === SimulationState.RUNNING;
    }
    /** 仿真运行或暂停中 — 禁止改原理图/接线 */
    isSimulationActive(): boolean {
        return (this.simulationKernel as SimulationKernelImpl).isSimActive();
    }
    /**
     * 仿真中切换按键 pressed。成功返回 '0'/'1'，失败返回 ''。
     * 与编辑器文档共用 ComponentInstance（startSimulation 传入同一引用）。
     */
    toggleInteractiveSwitch(componentId: string): string {
        if (!this.isSimulationActive()) {
            return '';
        }
        const kernel = this.simulationKernel as SimulationKernelImpl;
        const next = kernel.toggleInteractiveSwitch(componentId);
        if (next.length > 0) {
            this.publishInteractiveCircuitRefresh('sw', `pressed=${next}`);
        }
        return next;
    }
    /**
     * 仿真中调节电位器滑臂位置（0~1）。成功返回 "0.xxx"，失败返回 ''。
     */
    setInteractivePotWiper(componentId: string, wiper: number): string {
        if (!this.isSimulationActive()) {
            return '';
        }
        const kernel = this.simulationKernel as SimulationKernelImpl;
        const next = kernel.setInteractivePotWiper(componentId, wiper);
        if (next.length > 0) {
            this.publishInteractiveCircuitRefresh('pot', `wiper=${next}`);
        }
        return next;
    }
    /**
     * First schematic meter of a given panel kind ('vm' | 'dmm' | 'am' | 'osc' | 'power' | 'freq').
     * Used when the selection is a pot/switch but the instrument tab still needs a binding.
     */
    findFirstSchematicInstrumentId(kind: string): string {
        const doc = this.schematicEditor.getDocument();
        for (let i = 0; i < doc.components.length; i++) {
            const c = doc.components[i];
            const lib = c.libraryId.toUpperCase();
            if (kind === 'vm') {
                if (lib.includes('VOLTMETER') && !lib.includes('VIRTUAL_METER') && lib !== 'MULTIMETER') {
                    return c.id;
                }
            }
            else if (kind === 'dmm') {
                if (lib === 'MULTIMETER' || lib.includes('VIRTUAL_METER')) {
                    return c.id;
                }
            }
            else if (kind === 'am') {
                if (lib.includes('AMMETER')) {
                    return c.id;
                }
            }
            else if (kind === 'osc') {
                if (lib.includes('OSC') || lib.includes('SCOPE')) {
                    return c.id;
                }
            }
            else if (kind === 'power') {
                if (lib.includes('POWER_METER') || lib.includes('WATT')) {
                    return c.id;
                }
            }
            else if (kind === 'freq') {
                if (lib.includes('FREQ') || lib.includes('COUNTER')) {
                    return c.id;
                }
            }
        }
        // vm tab also accepts DMM / virtual meter as a voltage source
        if (kind === 'vm') {
            for (let i = 0; i < doc.components.length; i++) {
                const c = doc.components[i];
                const lib = c.libraryId.toUpperCase();
                if (lib === 'MULTIMETER' || lib.includes('VIRTUAL_METER') || lib.includes('VOLTMETER')) {
                    return c.id;
                }
            }
        }
        return '';
    }
    /**
     * Live V/I/P for a schematic POWER_METER (bypasses EMA). Returns null if unwired.
     */
    readPowerMeterForComponent(compInstId: string): PowerMeterConfig | null {
        const doc = this.schematicEditor.getDocument();
        const comp = doc.components.find(c => c.id === compInstId);
        if (comp === undefined) {
            return null;
        }
        const lib = comp.libraryId.toUpperCase();
        if (!lib.includes('POWER_METER') && !lib.includes('WATT')) {
            return null;
        }
        const kernel = this.simulationKernel as SimulationKernelImpl;
        const pinNets = getPinNetMap(compInstId, doc.nets);
        const netVPlus = findNetForPinLabel(pinNets, 'V+') ?? findNetForPinLabel(pinNets, 'VP');
        const netVCom = findNetForPinLabel(pinNets, 'V-') ?? findNetForPinLabel(pinNets, 'COM') ??
            findNetForPinLabel(pinNets, 'GND');
        const netIPlus = findNetForPinLabel(pinNets, 'I+') ?? findNetForPinLabel(pinNets, 'IP');
        if (netVPlus === null || netVCom === null) {
            return null;
        }
        const v = kernel.getNetVoltageByUuid(netVPlus) - kernel.getNetVoltageByUuid(netVCom);
        let iA = 0;
        if (netIPlus !== null) {
            iA = kernel.getNetCurrentByUuid(netIPlus);
        }
        return this.instruments.powerMeterSnapReading(v, iA);
    }
    private isSchematicInstrumentLib(libUpper: string): boolean {
        return libUpper.includes('VOLTMETER') || libUpper.includes('VIRTUAL_METER') ||
            libUpper === 'MULTIMETER' || libUpper.includes('AMMETER') ||
            libUpper.includes('OSC') || libUpper.includes('SCOPE') ||
            libUpper.includes('POWER_METER') || libUpper.includes('WATT') ||
            libUpper.includes('FREQ') || libUpper.includes('COUNTER') ||
            libUpper.includes('LOGIC') || libUpper.includes('ANALYZER') ||
            libUpper.includes('UART') || libUpper.includes('SIGNAL');
    }
    /**
     * After live pot/switch edits: snap ALL meter/scope readings + push UI tick
     * (bypass DisplayPump / DC-average lag). Keep active on the real instrument —
     * never steal OSC/PM/AM back to the first voltmeter.
     */
    private publishInteractiveCircuitRefresh(reason: string = 'edit', detail: string = ''): void {
        const kernel = this.simulationKernel as SimulationKernelImpl;
        kernel.syncVoltagesFromAnalogEngine();
        const doc = this.schematicEditor.getDocument();
        const instr = this.instruments as VirtualInstrumentsImpl;
        let firstInstrId = '';
        const meterSnaps: InteractiveMeterSnap[] = [];
        let oscCh1 = Number.NaN;
        let oscCh2 = Number.NaN;
        for (let i = 0; i < doc.components.length; i++) {
            const c = doc.components[i];
            const lib = c.libraryId.toUpperCase();
            if (lib.includes('VOLTMETER') || lib.includes('VIRTUAL_METER') || lib === 'MULTIMETER') {
                const delta = this.readVoltmeterDeltaForComponent(c.id, true);
                if (delta !== null) {
                    if (lib === 'MULTIMETER' || lib.includes('VIRTUAL_METER')) {
                        instr.multimeterSnapReading(delta);
                        meterSnaps.push({ refDes: c.refDes, kind: 'dmm', value: `${delta.toFixed(3)}V` });
                    }
                    else {
                        instr.voltmeterSnapReading(delta);
                        meterSnaps.push({ refDes: c.refDes, kind: 'vm', value: `${delta.toFixed(3)}V` });
                    }
                    if (firstInstrId.length === 0) {
                        firstInstrId = c.id;
                    }
                }
                else {
                    meterSnaps.push({ refDes: c.refDes, kind: 'vm', value: 'null' });
                }
            }
            else if (lib.includes('AMMETER')) {
                const mA = this.readAmmeterCurrentForComponent(c.id, true);
                if (mA !== null) {
                    instr.ammeterSnapReading(mA);
                    meterSnaps.push({ refDes: c.refDes, kind: 'am', value: `${mA.toFixed(3)}mA` });
                    if (firstInstrId.length === 0) {
                        firstInstrId = c.id;
                    }
                }
                else {
                    meterSnaps.push({ refDes: c.refDes, kind: 'am', value: 'null' });
                }
            }
            else if (lib.includes('POWER_METER') || lib.includes('WATT')) {
                const pinNets = getPinNetMap(c.id, doc.nets);
                const netVPlus = findNetForPinLabel(pinNets, 'V+') ?? findNetForPinLabel(pinNets, 'VP');
                const netVCom = findNetForPinLabel(pinNets, 'V-') ?? findNetForPinLabel(pinNets, 'COM') ??
                    findNetForPinLabel(pinNets, 'GND');
                const netIPlus = findNetForPinLabel(pinNets, 'I+') ?? findNetForPinLabel(pinNets, 'IP');
                if (netVPlus !== null && netVCom !== null) {
                    const v = kernel.getNetVoltageByUuid(netVPlus) - kernel.getNetVoltageByUuid(netVCom);
                    let iA = 0;
                    if (netIPlus !== null) {
                        iA = kernel.getNetCurrentByUuid(netIPlus);
                    }
                    // Quiet pot re-stamp may leave NET(I) empty — fall back to series ammeter
                    if (Math.abs(iA) < 1e-12) {
                        for (let j = 0; j < doc.components.length; j++) {
                            const am = doc.components[j];
                            if (!am.libraryId.toUpperCase().includes('AMMETER')) {
                                continue;
                            }
                            const mA = this.readAmmeterCurrentForComponent(am.id, true);
                            if (mA !== null && Math.abs(mA) > 1e-9) {
                                iA = mA / 1000;
                                break;
                            }
                        }
                    }
                    instr.powerMeterSnapReading(v, iA);
                    meterSnaps.push({
                        refDes: c.refDes,
                        kind: 'pm',
                        value: `${v.toFixed(3)}V/${(iA * 1000).toFixed(3)}mA/${(v * iA * 1000).toFixed(3)}mW`
                    });
                    if (firstInstrId.length === 0) {
                        firstInstrId = c.id;
                    }
                }
                else {
                    meterSnaps.push({ refDes: c.refDes, kind: 'pm', value: 'unwired' });
                }
            }
            else if (lib.includes('OSC') || lib.includes('SCOPE')) {
                const pinNets = getPinNetMap(c.id, doc.nets);
                const ch1Net = findNetForPinLabel(pinNets, 'CH1') ?? findNetForPinLabel(pinNets, 'A');
                const ch2Net = findNetForPinLabel(pinNets, 'CH2') ?? findNetForPinLabel(pinNets, 'B');
                if (ch1Net !== null) {
                    oscCh1 = kernel.getNetVoltageByUuid(ch1Net);
                }
                if (ch2Net !== null) {
                    oscCh2 = kernel.getNetVoltageByUuid(ch2Net);
                }
                const ch1Str = Number.isNaN(oscCh1) ? '?' : `${oscCh1.toFixed(3)}V`;
                const ch2Str = Number.isNaN(oscCh2) ? '?' : `${oscCh2.toFixed(3)}V`;
                meterSnaps.push({ refDes: c.refDes, kind: 'osc', value: `CH1=${ch1Str} CH2=${ch2Str}` });
                if (firstInstrId.length === 0) {
                    firstInstrId = c.id;
                }
            }
            else if (lib.includes('FREQ') || lib.includes('COUNTER')) {
                meterSnaps.push({ refDes: c.refDes, kind: 'freq', value: 'DC→0Hz' });
                if (firstInstrId.length === 0) {
                    firstInstrId = c.id;
                }
            }
        }
        // Scope CH1/CH2 must jump with MID/HI — rewrite history ring, don't wait for avg buffer
        const nodeMap = kernel.getNodeVoltageMap();
        instr.snapScopeDcLevels(nodeMap);
        // Keep active on a real instrument. Never force first-VM over OSC/PM/AM/FC.
        const active = instr.getActiveInstrumentComponent();
        let activeIsInstrument = false;
        let activeLabel = '';
        if (active !== null && active.length > 0) {
            const ac = doc.components.find(c => c.id === active);
            if (ac !== undefined) {
                activeIsInstrument = this.isSchematicInstrumentLib(ac.libraryId.toUpperCase());
                activeLabel = ac.refDes;
            }
            else {
                activeLabel = active;
            }
        }
        if (!activeIsInstrument && firstInstrId.length > 0) {
            this.setActiveInstrumentComponent(firstInstrId);
            const ac2 = doc.components.find(c => c.id === firstInstrId);
            activeLabel = ac2 !== undefined ? ac2.refDes : firstInstrId;
        }
        // Named nets for [INSTR_LIVE]: always resolve via net UUID (nodeMap name keys
        // can stay stale after quiet pot re-stamp while meter pin reads are live).
        const namedVolts = new Map<string, number>();
        const wantNames = ['VCC', 'HI', 'NET_2', 'MID', 'ADC', 'GND'];
        for (let i = 0; i < doc.nets.length; i++) {
            const net = doc.nets[i];
            if (net.name.length === 0) {
                continue;
            }
            const upper = net.name.toUpperCase();
            if (wantNames.indexOf(upper) >= 0) {
                namedVolts.set(upper, kernel.getNetVoltageByUuid(net.id));
            }
        }
        for (let ni = 0; ni < wantNames.length; ni++) {
            const n = wantNames[ni];
            if (namedVolts.has(n)) {
                continue;
            }
            const v = nodeMap.get(n);
            if (v !== undefined) {
                namedVolts.set(n, v);
            }
        }
        traceInteractiveInstrumentLive(reason, detail, namedVolts, meterSnaps, activeLabel, false);
        // Bump PropertyPanel / InstrumentPanel (@Watch simWaveTick)
        this.onWaveUpdate([]);
        const stepData: SimStepData = { waves: [], stepCount: this.simStepCount };
        EventBus.getInstance().publish({
            event: ModuleEvent.SIMULATION_STEP,
            source: 'app_service_interactive',
            timestamp: Date.now(),
            data: stepData as Object
        });
    }
    /** Resolve net UUID to human-readable net name for logs */
    private netLabel(doc: SchematicDocument, netId: string): string {
        const net = doc.nets.find(n => n.id === netId);
        if (net !== undefined && net.name.length > 0) {
            return `${net.name}(${netId})`;
        }
        return netId;
    }
    /** Build voltage detail string for bound instrument nets */
    private buildNetVoltageDetail(doc: SchematicDocument, kernel: SimulationKernelImpl, netIds: string[]): string {
        const parts: string[] = [];
        for (let i = 0; i < netIds.length; i++) {
            const id = netIds[i];
            if (id.length === 0) {
                continue;
            }
            const v = kernel.getNetVoltageByUuid(id);
            parts.push(`${this.netLabel(doc, id)}=${v.toFixed(4)}V`);
        }
        return parts.length > 0 ? `nets_V={${parts.join(', ')}}` : '';
    }
    /** Wire instrument readers to a specific component's connected nets (per-instance binding) */
    refreshInstrumentReaderForComponent(compInstId: string): void {
        const doc = this.schematicEditor.getDocument();
        const comp = doc.components.find(c => c.id === compInstId);
        if (comp === undefined) {
            return;
        }
        const kernel = this.simulationKernel as SimulationKernelImpl;
        const pinNets = getPinNetMap(compInstId, doc.nets);
        const pinHash = formatPinNetMap(pinNets);
        if (this.bindingPinHash.get(compInstId) === pinHash) {
            return;
        }
        this.bindingPinHash.set(compInstId, pinHash);
        const upperId = comp.libraryId.toUpperCase();
        const isInstrumentLib = upperId.includes('METER') || upperId.includes('SCOPE') || upperId.includes('OSC') ||
            upperId.includes('LOGIC') || upperId.includes('ANALYZER') || upperId.includes('POWER') ||
            upperId.includes('WATT') || upperId.includes('FREQ') || upperId.includes('COUNTER');
        if (isInstrumentLib && pinNets.size === 0) {
            tracePinNetEmpty(compInstId, comp.refDes);
        }
        const findNetForPin = (pinLabel: string): string | null => findNetForPinLabel(pinNets, pinLabel);
        const binding: ComponentInstrumentBinding = {
            libraryId: comp.libraryId,
            scopeProbes: ['', '', '', ''],
            logicProbes: [],
            voltageReader: null,
            currentReader: null,
            powerVoltageReader: null,
            powerCurrentReader: null,
            freqReader: null
        };
        if (upperId.includes('OSC') || upperId.includes('SCOPE')) {
            for (let ch = 1; ch <= 4; ch++) {
                const net = findNetForPin(`CH${ch}`) ?? findNetForPin(`IN${ch}`) ?? findNetForPin(`A${ch}`);
                if (net !== null) {
                    binding.scopeProbes[ch - 1] = net;
                }
            }
        }
        else if (upperId.includes('LOGIC') || upperId.includes('ANALYZER') || upperId.startsWith('LA')) {
            for (let ch = 1; ch <= 8; ch++) {
                const net = findNetForPin(`CH${ch}`) ?? findNetForPin(`D${ch - 1}`) ?? findNetForPin(`IN${ch}`);
                if (net !== null) {
                    binding.logicProbes.push(net);
                }
            }
        }
        else if (upperId.includes('VOLTMETER') || upperId.includes('VIRTUAL_METER') || upperId === 'MULTIMETER') {
            const netPlus = findNetForPin('V+') ?? findNetForPin('V') ?? findNetForPin('PLUS') ?? findNetForPin('+') ??
                findNetForPin('PROBE1');
            const netCom = findNetForPin('COM') ?? findNetForPin('V-') ?? findNetForPin('-') ?? findNetForPin('GND') ??
                findNetForPin('PROBE2');
            if (netPlus !== null && netCom !== null) {
                const vPlusId = netPlus;
                const vComId = netCom;
                binding.voltageReader = () => {
                    const vPlus = kernel.getNetVoltageByUuid(vPlusId);
                    const vCom = kernel.getNetVoltageByUuid(vComId);
                    const delta = vPlus - vCom;
                    traceMeasure(comp.refDes, 'V', kernel.isSimActive(), `V+(${this.netLabel(doc, vPlusId)})=${vPlus.toFixed(4)}V ` +
                        `COM(${this.netLabel(doc, vComId)})=${vCom.toFixed(4)}V ` +
                        `Δ=${delta.toFixed(4)}V sign=${delta >= 0 ? '+' : '-'} (${delta >= 0 ? 'V+>COM' : 'COM>V+'})`);
                    return delta;
                };
            }
        }
        else if (upperId.includes('AMMETER')) {
            const netPlus = findNetForPin('I+') ?? findNetForPin('PLUS') ?? findNetForPin('+');
            const netMinus = findNetForPin('I-') ?? findNetForPin('MINUS') ?? findNetForPin('-');
            if (netPlus !== null && netMinus !== null) {
                binding.currentReader = () => {
                    const iBranch = kernel.getBranchCurrent(compInstId);
                    if (Math.abs(iBranch) > 1e-15) {
                        const mA = iBranch * 1000;
                        traceMeasure(comp.refDes, 'I', kernel.isSimActive(), `I+(${this.netLabel(doc, netPlus)})→I-(${this.netLabel(doc, netMinus)}) ` +
                            `I=${mA.toFixed(4)}mA sign=${iBranch >= 0 ? '+' : '-'} (${iBranch >= 0 ? 'I+→I-' : 'I-→I+'})`);
                        return mA;
                    }
                    return 0;
                };
            }
        }
        else if (upperId.includes('POWER') || upperId.includes('WATT')) {
            const netVPlus = findNetForPin('V+') ?? findNetForPin('VP') ?? findNetForPin('PLUS') ?? findNetForPin('+');
            const netVCom = findNetForPin('V-') ?? findNetForPin('COM') ?? findNetForPin('GND') ?? findNetForPin('-');
            const netIPlus = findNetForPin('I+') ?? findNetForPin('IP') ?? findNetForPin('A+');
            const netIMinus = findNetForPin('I-') ?? findNetForPin('IM') ?? findNetForPin('A-');
            if (netVPlus !== null && netVCom !== null) {
                binding.powerVoltageReader = () => {
                    return kernel.getNetVoltageByUuid(netVPlus) - kernel.getNetVoltageByUuid(netVCom);
                };
            }
            if (netIPlus !== null && netIMinus !== null) {
                binding.powerCurrentReader = () => {
                    const netCur = kernel.getNetCurrentByUuid(netIPlus);
                    if (Math.abs(netCur) > 1e-15) {
                        return netCur;
                    }
                    return 0;
                };
            }
        }
        else if (upperId.includes('FREQ') || upperId.includes('COUNTER')) {
            const netSig = findNetForPin('IN') ?? findNetForPin('SIG') ?? findNetForPin('INPUT') ?? findNetForPin('+');
            if (netSig !== null) {
                binding.freqReader = (): number => {
                    const fromWaves = AppService.estimateFrequencyFromWaves(kernel.getAllWaveData(), netSig);
                    if (fromWaves > 0) {
                        return fromWaves;
                    }
                    // Fallback: oscilloscope history ring (advances even when WaveData is stale/flat)
                    return (this.instruments as VirtualInstrumentsImpl).estimateFreqFromScopeHistory(netSig);
                };
                binding.scopeProbes[0] = netSig;
            }
        }
        (this.instruments as VirtualInstrumentsImpl).registerComponentBinding(compInstId, binding);
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
        const simActive = (this.simulationKernel as SimulationKernelImpl).isSimActive();
        const boundNetIds: string[] = [];
        pinNets.forEach((netId: string) => {
            if (!boundNetIds.includes(netId)) {
                boundNetIds.push(netId);
            }
        });
        const netDetail = this.buildNetVoltageDetail(doc, kernel, boundNetIds);
        traceBindingRefresh(compInstId, comp.refDes, pinNets, traceInfo, simActive, netDetail);
    }
    private static estimateFrequencyFromWaves(waves: WaveData[], netSig: string): number {
        let targetWave: WaveData | undefined = undefined;
        for (let wi = 0; wi < waves.length; wi++) {
            const w = waves[wi];
            if (w.netName === netSig || w.probeName === netSig) {
                targetWave = w;
                break;
            }
        }
        if (targetWave === undefined) {
            for (let wi = 0; wi < waves.length; wi++) {
                const w = waves[wi];
                if (w.netName === netSig || w.probeName === netSig) {
                    targetWave = w;
                    break;
                }
            }
        }
        if (targetWave === undefined || targetWave.timeAxis.length < 4) {
            return 0;
        }
        const ta = targetWave.timeAxis;
        const va = targetWave.voltageAxis;
        let maxV = va[0];
        let minV = va[0];
        for (let k = 1; k < va.length; k++) {
            if (va[k] > maxV) {
                maxV = va[k];
            }
            if (va[k] < minV) {
                minV = va[k];
            }
        }
        // Frozen/DC wave → no frequency
        if (maxV - minV < 1e-4) {
            return 0;
        }
        const threshold = (maxV + minV) / 2;
        let crossings = 0;
        let firstCross = -1;
        for (let i = 1; i < va.length; i++) {
            if ((va[i - 1] < threshold && va[i] >= threshold) ||
                (va[i - 1] > threshold && va[i] <= threshold)) {
                if (firstCross < 0) {
                    firstCross = ta[i];
                }
                crossings++;
            }
        }
        if (crossings < 2) {
            return 0;
        }
        const period = 2 * (ta[ta.length - 1] - firstCross) / (crossings - 1);
        return period > 0 ? 1.0 / period : 0;
    }
    /** Clear active component selection (bindings are preserved for re-activation) */
    clearPerComponentReaders(): void {
        this.setActiveInstrumentComponent(null);
    }
    clearInstrumentReaders(): void {
        this.setActiveInstrumentComponent(null);
        this.clearInstrumentGlobalFallbacks();
    }
    /** No global instrument fallbacks — readings require explicit pin wiring. */
    private setupInstrumentGlobalFallbacks(): void {
        this.clearInstrumentGlobalFallbacks();
    }
    private clearInstrumentGlobalFallbacks(): void {
        this.instruments.setVoltmeterGlobalFallback(null);
        this.instruments.setAmmeterGlobalFallback(null);
        this.instruments.setMultimeterGlobalFallback(null);
        this.instruments.setPowerMeterGlobalFallbacks(null, null);
        this.instruments.setFreqCounterGlobalFallback(null);
    }
    /** content:// / file:// 旁路无法写同级 .lock，跳过文件锁 */
    private canUseSidecarLock(path: string): boolean {
        return path.length > 0
            && !path.startsWith('content://')
            && !path.startsWith('file://');
    }
    /**
     * @param updateCurrentPath 为 false 时仅写副本（如 autosave 同步），不改正式工程路径、不写锁、不刷状态栏
     */
    async saveProject(path: string, updateCurrentPath: boolean = true): Promise<boolean> {
        if (!this.currentProject)
            return false;
        this.syncProjectFromModules();
        if (updateCurrentPath && this.canUseSidecarLock(path)) {
            // 单机重启后旧 .lock 会残留；保存前先清再获取，避免误报“工程被锁定”
            this.filePersistence.clearStaleProjectLock(path);
            const lock = this.filePersistence.acquireProjectLock(path, this.sessionHolderId, this.sessionUserName, 'editable');
            if (!lock.success) {
                this.onStatusMessage(lock.error ?? '无法获取工程锁');
                return false;
            }
        }
        const result = await this.filePersistence.saveProject(this.currentProject, path);
        if (updateCurrentPath) {
            this.filePersistence.appendProjectChangeLog(this.sessionUserName, 'save', path, `保存工程 ${this.currentProject.name}`);
            this.currentProjectPath = path;
            this.onStatusMessage(result.success ? `已保存 ${path}` : `保存失败: ${result.error}`);
        }
        return result.success;
    }
    async loadProject(path: string): Promise<boolean> {
        const previousPath = this.currentProjectPath;
        if (this.canUseSidecarLock(path)) {
            this.filePersistence.clearStaleProjectLock(path);
            const lock = this.filePersistence.acquireProjectLock(path, this.sessionHolderId, this.sessionUserName, 'editable');
            if (!lock.success) {
                const info = this.filePersistence.getProjectLockInfo(path);
                if (info) {
                    const roLock = this.filePersistence.acquireProjectLock(path, this.sessionHolderId, this.sessionUserName, 'read_only');
                    if (!roLock.success) {
                        this.onStatusMessage(roLock.error ?? '工程被锁定');
                        return false;
                    }
                    (this.schematicEditor as SchematicEditorImpl).setReadOnly(true);
                    this.onStatusMessage(`只读模式打开（${info.holderName} 正在编辑）`);
                }
                else {
                    this.onStatusMessage(lock.error ?? '无法打开工程');
                    return false;
                }
            }
            else {
                (this.schematicEditor as SchematicEditorImpl).setReadOnly(false);
            }
        }
        else {
            (this.schematicEditor as SchematicEditorImpl).setReadOnly(false);
        }
        const result = await this.filePersistence.loadProject(path);
        if (!result.success || !result.data)
            return false;
        if (previousPath.length > 0 && previousPath !== path && this.canUseSidecarLock(previousPath)) {
            this.filePersistence.releaseProjectLock(previousPath, this.sessionHolderId);
        }
        this.currentProject = result.data;
        this.currentProjectPath = path;
        const editor = this.schematicEditor as SchematicEditorImpl;
        editor.loadDocument(this.currentProject.schematic);
        editor.loadAnnotations(this.currentProject.collaboration?.annotations ?? []);
        editor.rebuildNetPinConnectivity();
        const doc = this.currentProject.schematic;
        ensureNetPinConnectivity(doc, doc.metadata.gridSize || 10, this.pinGeometryResolver());
        this.simulationKernel.loadSchematic(doc);
        traceProjectOpenAudit(path, this.currentProject.name, doc, editor.getViewport());
        traceDataFlow('LOAD', 'schematic→editor→netRebuild→kernel loadSchematic complete');
        if (this.currentProject.mcuDebugConfig) {
            this.hexDebugger.configure(this.currentProject.mcuDebugConfig);
        }
        for (let i = 0; i < this.currentProject.aiConfigs.length; i++) {
            const cfg = this.currentProject.aiConfigs[i];
            this.aiApiManager.addApi(cfg);
        }
        this.bindingPinHash.clear();
        this.autoWireAllInstruments();
        this.onProjectChanged();
        return true;
    }
    syncProjectFromModules(): void {
        if (!this.currentProject)
            return;
        this.currentProject.schematic = this.schematicEditor.getDocument();
        this.currentProject.simulationConfig = this.simulationKernel.getConfig();
        this.currentProject.modifiedAt = new Date().toISOString();
        const editor = this.schematicEditor as SchematicEditorImpl;
        const bundle = this.filePersistence.buildCollaborationBundle(editor.getAnnotations());
        this.currentProject.collaboration = bundle;
    }
    async createSnapshot(versionLabel: string, note: string): Promise<SnapshotMeta | null> {
        const topo = this.getTopology();
        const result = await this.filePersistence.createProjectSnapshot(versionLabel, note, topo, this.sessionUserName);
        if (result.success && result.data) {
            this.syncProjectFromModules();
            this.onStatusMessage(`快照已保存: ${versionLabel}`);
            return result.data;
        }
        this.onStatusMessage(result.error ?? '快照失败');
        return null;
    }
    compareSnapshots(fromId: string, toId: string): VersionCompareReport | null {
        const result = this.filePersistence.compareProjectSnapshots(fromId, toId, this.getTopology());
        if (result.success && result.data)
            return result.data;
        this.onStatusMessage(result.error ?? '版本对比失败');
        return null;
    }
    addAnnotation(text: string, targetUuid: string, x: number, y: number): void {
        const editor = this.schematicEditor as SchematicEditorImpl;
        const result = editor.addAnnotation({
            id: '',
            author: this.sessionUserName,
            text,
            type: SchematicAnnotationType.TEXT,
            status: SchematicAnnotationStatus.PENDING,
            x, y,
            targetUuid,
            targetKind: 'device',
            createdAt: '',
            updatedAt: ''
        });
        if (result.success) {
            this.filePersistence.appendProjectChangeLog(this.sessionUserName, 'annotation', targetUuid, text);
            this.syncProjectFromModules();
            this.onStatusMessage('批注已添加');
        }
        else {
            this.onStatusMessage(result.error ?? '批注失败');
        }
    }
    enableAutoSave(path: string, intervalMs: number = 60000): void {
        this.filePersistence.enableAutoSave(intervalMs, path, () => {
            this.syncProjectFromModules();
            return this.currentProject;
        });
    }
    disableAutoSave(): void {
        this.filePersistence.disableAutoSave();
    }
    getFilePersistenceImpl(): FilePersistenceImpl {
        return this.filePersistence as FilePersistenceImpl;
    }
    async loadSession(): Promise<SessionState | null> {
        return (this.filePersistence as FilePersistenceImpl).loadSessionState();
    }
    async saveSession(path: string, projectName: string, closedCleanly: boolean): Promise<void> {
        await (this.filePersistence as FilePersistenceImpl).saveSessionState(path, projectName, closedCleanly);
    }
    async markCleanShutdown(): Promise<void> {
        await (this.filePersistence as FilePersistenceImpl).markSessionCleanShutdown();
    }
    async checkRecoveryFiles(): Promise<string[]> {
        return (this.filePersistence as FilePersistenceImpl).checkRecoveryFiles();
    }
    async saveRecoveryCache(): Promise<void> {
        if (this.currentProject === null)
            return;
        this.syncProjectFromModules();
        await (this.filePersistence as FilePersistenceImpl)
            .saveRecoveryCacheWithPath(this.currentProjectPath, this.currentProject);
    }
    runErc(autoFix: boolean = false): ErcError[] {
        const topo = this.getTopology();
        const errors = this.schematicEditor.runERC(topo, true);
        if (autoFix && errors.length > 0) {
            const fixed = this.schematicEditor.autoFixERC(topo, errors);
            this.onStatusMessage(`ERC: ${errors.length} 项, 自动修复 ${fixed} 项`);
            this.onProjectChanged();
        }
        else {
            this.onStatusMessage(`ERC 完成: ${errors.length} 项`);
        }
        this.onErcUpdate(errors);
        return errors;
    }
    /** Resolve pin world positions from component library for net connectivity rebuild */
    private pinGeometryResolver(): PinGeometryResolver {
        const lib = this.componentLibrary as ComponentLibraryImpl;
        return (libraryId: string): PinGeometry[] | null => {
            const resolvedId = lib.resolveLibraryId(libraryId);
            const comp = lib.getComponent(resolvedId);
            if (!comp.success || comp.data === undefined) {
                return null;
            }
            const pins: PinGeometry[] = [];
            for (let i = 0; i < comp.data.pins.length; i++) {
                const p = comp.data.pins[i];
                pins.push({ id: p.id, name: p.name, x: p.position.x, y: p.position.y });
            }
            return pins;
        };
    }
    startSimulation(): boolean {
        (this.schematicEditor as SchematicEditorImpl).rebuildNetPinConnectivity();
        const pinResolver = this.pinGeometryResolver();
        let doc = this.schematicEditor.getDocument();
        ensureNetPinConnectivity(doc, doc.metadata.gridSize || 10, pinResolver);
        // runERC rebuilds pin connectivity — capture topology AFTER it completes
        const ercErrors = this.schematicEditor.runERC();
        const critical = ercErrors.filter(e => e.severity === 'error' || e.severity === 'critical');
        if (critical.some(e => e.desc.includes('短路'))) {
            this.onStatusMessage('存在短路错误，禁止启动仿真');
            return false;
        }
        doc = this.schematicEditor.getDocument();
        const topo = this.getTopology();
        const cfg = defaultSimConfig();
        // Pass editor doc so MNA sees OUT1/AC+ pin names (topo round-trip alone loses them)
        const result = this.simulationKernel.startSimulation(topo, cfg, (p) => {
            this.onAiProgress(p);
        }, doc);
        if (!result.success) {
            Logger.warn(INSTR_TRACE_TAG, `[SIM_START_FAIL] ${result.error ?? 'unknown'}`);
            this.onStatusMessage(`仿真启动失败: ${result.error}`);
            return false;
        }
        this.schematicEditor.setSimBusy(true);
        this.simStepCount = 0;
        this.onStatusMessage('仿真运行中...');
        // Set up global instrument fallbacks so instruments show data even without a selected component
        this.setupInstrumentGlobalFallbacks();
        // Re-bind all instruments now that simulation is active (refresh pin-hash cache)
        const activeComp = (this.instruments as VirtualInstrumentsImpl).getActiveInstrumentComponent();
        this.refreshAllInstrumentBindings();
        if (activeComp !== null && activeComp.length > 0) {
            this.setActiveInstrumentComponent(activeComp);
        }
        // Auto-connect signal generators to analog engine
        this.autoWireSignalGenerators();
        const kernel = this.simulationKernel as SimulationKernelImpl;
        // Time-budget pump (Worker disabled by default — FRAME flood caused APP_INPUT_BLOCK)
        this.simHost.startRemote(topo, cfg, doc, kernel);
        Logger.info(INSTR_TRACE_TAG, '仿真已启动 — DisplayPump@~30fps + 轻量 Worker/预算泵; setInstrTraceSimStep(true) 开启逐步采样');
        this.onStatusMessage('仿真运行中…');
        this.startDisplayPump();
        // Heavy PINCONN audit after yielding — keeps main thread responsive for Worker READY
        setTimeout((): void => {
            if (this.simulationKernel.getState() !== SimulationState.RUNNING &&
                this.simulationKernel.getState() !== SimulationState.PAUSED) {
                return;
            }
            traceSimStartupAudit(doc, this.simulationKernel.getState(), this.simStepCount, (netId: string) => kernel.getNetVoltageByUuid(netId), (netId: string) => kernel.getNetCurrentByUuid(netId), kernel.getNodeVoltageMap(), kernel.getBranchCurrentMap(), kernel.getAllWaveData(), kernel.netToSpiceNodeMap(), activeComp, (compId: string) => kernel.getBranchCurrent(compId));
            const modeHint = this.simHost.isWorkerMode() ? 'Worker线程' : '时间预算泵';
            this.onStatusMessage(`仿真运行中 (${modeHint} · ~30fps UI)`);
        }, 200);
        return true;
    }
    /** 60fps UI pump — never runs spice/MCU; only consumes latest frame */
    private startDisplayPump(): void {
        if (this.displayPumpActive) {
            return;
        }
        this.displayPumpActive = true;
        const tick = (): void => {
            if (!this.displayPumpActive) {
                return;
            }
            const state = this.simulationKernel.getState();
            if (state !== SimulationState.RUNNING && state !== SimulationState.PAUSED) {
                this.displayPumpActive = false;
                this.displayPumpTimer = -1;
                return;
            }
            if (state === SimulationState.RUNNING) {
                this.consumeSimFrame();
            }
            this.displayPumpTimer = setTimeout(tick, this.DISPLAY_PUMP_MS);
        };
        this.displayPumpTimer = setTimeout(tick, this.DISPLAY_PUMP_MS);
    }
    private stopDisplayPump(): void {
        this.displayPumpActive = false;
        if (this.displayPumpTimer >= 0) {
            clearTimeout(this.displayPumpTimer);
            this.displayPumpTimer = -1;
        }
    }
    /** Pinch/pan from SchematicCanvas — pause heavy frame publish so MMI can run */
    setUiGestureBusy(busy: boolean): void {
        this.uiGestureBusy = busy;
        this.simHost.setUiGestureBusy(busy);
    }
    private consumeSimFrame(): void {
        if (this.uiGestureBusy) {
            // Still advance host store so frames do not pile as pending publish work
            this.simHost.consumeLatest();
            return;
        }
        const frame: SimFramePlain | null = this.simHost.consumeLatest();
        if (frame === null) {
            return;
        }
        const kernel = this.simulationKernel as SimulationKernelImpl;
        // Worker mode: mirror voltages onto local kernel for instrument/canvas reads
        if (this.simHost.isWorkerMode()) {
            const snap: KernelFrameSnapshot = {
                t: frame.t,
                stepCount: frame.stepCount,
                netKeys: frame.netKeys,
                voltages: frame.voltages,
                branchKeys: frame.branchKeys,
                currents: frame.currents,
                mcuFamily: frame.mcuFamily,
                mcuPc: frame.mcuPc,
                mcuP1: frame.mcuP1,
                gpioWords: frame.gpioWords,
                uartBytes: frame.uartBytes !== undefined ? frame.uartBytes : [],
                state: frame.state
            };
            kernel.applyFrameSnapshot(snap);
        }
        this.simStepCount = frame.stepCount;
        this.ingestMcuUartBytes(frame.uartBytes !== undefined ? frame.uartBytes : []);
        this.publishInstrumentFrame(kernel);
    }
    /** MCU USART TX → 虚拟终端 / 调试面板 / CallbackRegistry */
    private ingestMcuUartBytes(bytes: number[]): void {
        if (bytes.length === 0) {
            return;
        }
        // Cap per frame so UI log does not explode if TXE poll is fast
        const max = bytes.length > 16 ? 16 : bytes.length;
        const slice = bytes.slice(0, max);
        if (bytes.length > max) {
            traceUart('APP_RX_CAP', `raw=${bytes.length} shown=${max} dropped=${bytes.length - max} ` +
                `hex=${formatUartBytesHex(slice)}`);
        }
        let non55 = false;
        for (let i = 0; i < slice.length; i++) {
            if ((slice[i] & 0xFF) !== 0x55) {
                non55 = true;
                break;
            }
        }
        if (non55) {
            traceUart('APP_RX_UI', `n=${slice.length} hex=${formatUartBytesHex(slice)}`);
        }
        else {
            traceUartTxDrain('app_ui', slice);
        }
        (this.instruments as VirtualInstrumentsImpl).uartIngestMcuTx(slice);
        let ascii = '';
        for (let i = 0; i < slice.length; i++) {
            const b = slice[i] & 0xFF;
            CallbackRegistry.getInstance().emitUart('mcu_default', b);
            ascii += String.fromCharCode(b);
        }
        if (ascii.length > 0) {
            this.hexDebugger.appendUartOutput(ascii);
        }
    }
    private publishInstrumentFrame(kernel: SimulationKernelImpl): void {
        // Keep DisplayPump light: heavy Map copies / wave array clones / EventBus every
        // frame previously stacked behind APP_INPUT_BLOCK (uv_timer_task >5s).
        const voltages = kernel.getNodeVoltageMap();
        (this.instruments as VirtualInstrumentsImpl).feedScopeTimeSnapshot(kernel.globalTimeTick(), voltages);
        // Feed EVERY schematic meter (not only active) so DMM/AM/PM track pot edits
        // while the user is looking at another instrument tab.
        if (this.simStepCount % 2 === 0) {
            this.feedAllSchematicMeterSamples(kernel);
        }
        // Waves + full instrument rebinds are expensive — keep rare
        let waves: WaveData[] = [];
        if (this.simStepCount % 4 === 0) {
            waves = kernel.getAllWaveData();
            if (waves.length > 0) {
                this.instruments.feedSimulationWaves(waves);
                CallbackRegistry.getInstance().emitWave(waves);
            }
            const branchCurrents = kernel.getBranchCurrentMap();
            (this.instruments as VirtualInstrumentsImpl).feedScopeNodeData(voltages, branchCurrents);
            const digitalLevels = new Map<string, number>();
            voltages.forEach((voltage: number, netKey: string) => {
                digitalLevels.set(netKey, voltage > 1.65 ? 1 : 0);
            });
            (this.instruments as VirtualInstrumentsImpl).feedLogicDigitalStates(digitalLevels);
            this.onWaveUpdate(waves);
        }
        if (this.simStepCount % 120 === 0) {
            this.autoWireAllInstruments();
            if (waves.length === 0) {
                waves = kernel.getAllWaveData();
            }
            traceSimStep(this.simStepCount, waves.length, waves, (this.instruments as VirtualInstrumentsImpl).getActiveInstrumentComponent(), voltages, kernel.getBranchCurrentMap());
        }
        // Canvas wire-color refresh ≤ ~10fps — 60fps EventBus starved MMI / Skia serialize
        if (this.simStepCount % 3 === 0) {
            const stepData: SimStepData = { waves: waves, stepCount: this.simStepCount };
            EventBus.getInstance().publish({
                event: ModuleEvent.SIMULATION_STEP,
                source: 'app_service',
                timestamp: Date.now(),
                data: stepData as Object
            });
        }
    }
    /**
     * Sample all schematic V/I/P meters into their engines so non-active tabs stay live.
     */
    private feedAllSchematicMeterSamples(kernel: SimulationKernelImpl): void {
        const doc = this.schematicEditor.getDocument();
        const instr = this.instruments as VirtualInstrumentsImpl;
        for (let i = 0; i < doc.components.length; i++) {
            const c = doc.components[i];
            const lib = c.libraryId.toUpperCase();
            if (lib.includes('VOLTMETER') || lib.includes('VIRTUAL_METER') || lib === 'MULTIMETER') {
                const delta = this.readVoltmeterDeltaForComponent(c.id, true);
                if (delta !== null) {
                    if (lib === 'MULTIMETER' || lib.includes('VIRTUAL_METER')) {
                        instr.multimeterFeedSample(delta);
                    }
                    else {
                        instr.voltmeterFeedSample(delta);
                    }
                }
            }
            else if (lib.includes('AMMETER')) {
                const mA = this.readAmmeterCurrentForComponent(c.id, true);
                if (mA !== null) {
                    instr.ammeterFeedSample(mA);
                }
            }
            else if (lib.includes('POWER_METER') || lib.includes('WATT')) {
                const pinNets = getPinNetMap(c.id, doc.nets);
                const netVPlus = findNetForPinLabel(pinNets, 'V+') ?? findNetForPinLabel(pinNets, 'VP');
                const netVCom = findNetForPinLabel(pinNets, 'V-') ?? findNetForPinLabel(pinNets, 'COM') ??
                    findNetForPinLabel(pinNets, 'GND');
                const netIPlus = findNetForPinLabel(pinNets, 'I+') ?? findNetForPinLabel(pinNets, 'IP');
                if (netVPlus !== null && netVCom !== null) {
                    const v = kernel.getNetVoltageByUuid(netVPlus) - kernel.getNetVoltageByUuid(netVCom);
                    let iA = 0;
                    if (netIPlus !== null) {
                        iA = kernel.getNetCurrentByUuid(netIPlus);
                    }
                    instr.powerMeterSnapReading(v, iA);
                }
            }
        }
    }
    /** Auto-wire all instrument components on the schematic to read from simulation */
    private autoWireAllInstruments(): void {
        const doc = this.schematicEditor.getDocument();
        for (const comp of doc.components) {
            const libUpper = comp.libraryId.toUpperCase();
            if (libUpper.includes('METER') || libUpper.includes('SCOPE') || libUpper.includes('LOGIC') ||
                libUpper.includes('POWER') || libUpper.includes('WATT') || libUpper.includes('FREQ') ||
                libUpper.includes('COUNTER') || libUpper.includes('UART') || libUpper.includes('TERMINAL') ||
                libUpper.includes('SIGNAL')) {
                this.refreshInstrumentReaderForComponent(comp.id);
            }
        }
    }
    /** Auto-connect signal generator components to the analog simulation engine */
    private autoWireSignalGenerators(): void {
        const doc = this.schematicEditor.getDocument();
        const kernel = this.simulationKernel as SimulationKernelImpl;
        for (const comp of doc.components) {
            const libUpper = comp.libraryId.toUpperCase();
            if (libUpper.includes('SIGNAL') || libUpper.includes('GEN') || libUpper.includes('FUNC')) {
                let outNetId = '';
                let gndNetId = '0';
                for (const net of doc.nets) {
                    for (const pinRef of net.pinIds) {
                        const parts = pinRef.split(':');
                        if (parts.length >= 2 && parts[0] === comp.id) {
                            const pinLabel = (parts.length >= 3 ? parts[2] : parts[1]).toUpperCase();
                            if (pinLabel === 'OUT' || pinLabel === 'OUTPUT' || pinLabel === 'SIG' ||
                                pinLabel === 'SIGNAL' || pinLabel === '+' || pinLabel === 'A') {
                                outNetId = net.id;
                            }
                            else if (pinLabel === 'GND' || pinLabel === 'COM' || pinLabel === '-' ||
                                pinLabel === 'B') {
                                gndNetId = net.id;
                            }
                        }
                    }
                }
                if (outNetId.length > 0) {
                    const nodeA = kernel.netToSpiceNodeMap().get(outNetId) ?? outNetId;
                    const nodeB = kernel.netToSpiceNodeMap().get(gndNetId) ?? (gndNetId === '0' ? '0' : gndNetId);
                    kernel.registerSignalSource('SIGGEN', nodeA, nodeB, 'sin', 1.65, 3.3, 1000, 0, 0.5);
                }
            }
        }
    }
    stopSimulation(): void {
        this.stopDisplayPump();
        this.simHost.stop();
        this.simulationKernel.stopSim();
        this.schematicEditor.setSimBusy(false);
        this.clearInstrumentReaders();
        this.onStatusMessage('仿真已停止');
    }
    /** Load MCU firmware into local kernel + Worker (when active) */
    loadMcuIntoSim(data: Uint8Array, offset: number = 0, family: string = '8051'): void {
        const kernel = this.simulationKernel as SimulationKernelImpl;
        this.simHost.loadMcu(data, offset, family, kernel);
    }
    async aiAutoRoute(): Promise<boolean> {
        if (this.aiApiManager.isQuotaWarningActive()) {
            this.onStatusMessage('AI 用量已达 80%，请注意额度');
        }
        const topo = this.getTopology();
        const result = await this.aiEngine.runAiTask(AiTaskType.TASK_AUTO_ROUTE_GLOBAL, topo, undefined, (p) => this.onAiProgress(p));
        if (result.success && result.topology) {
            this.schematicEditor.applyRouteResult({
                routeLines: result.topology.wireList,
                crossCount: 0, totalLineLength: 0,
                isolateAnalogDigital: true, xtalShortPath: true, diffLineEqualLength: false
            }, true);
            this.onProjectChanged();
            this.onStatusMessage('AI 布线完成');
            return true;
        }
        this.onStatusMessage(result.errMsg || 'AI 布线失败');
        return false;
    }
    isAiGenerating(): boolean {
        return this.aiGenerating;
    }
    getAiGenLogs(): AiGenLogEntry[] {
        const out: AiGenLogEntry[] = [];
        for (let i = 0; i < this.aiGenLogs.length; i++) {
            out.push(this.aiGenLogs[i]);
        }
        return out;
    }
    clearAiGenLogs(): void {
        this.aiGenLogs = [];
        this.notifyAiGenLogs();
    }
    /** 拒绝手动放置（生成锁期间） */
    rejectManualPlaceIfAiBusy(): boolean {
        if (!this.aiGenerating) {
            return false;
        }
        this.appendAiGenLog('system', '生成中，禁止手动放置器件');
        this.onStatusMessage('AI 生成中，仅允许 AI 自动放置');
        return true;
    }
    cancelAiGenerate(): void {
        if (!this.aiGenerating) {
            return;
        }
        this.aiGenCancelRequested = true;
        this.aiEngine.cancelAiTask();
        this.appendAiGenLog('system', '正在取消…');
        this.onStatusMessage('正在取消 AI 生成…');
    }
    async aiGenerateCircuit(prompt: string): Promise<boolean> {
        return this.aiGenerateCircuitFromPrompt(prompt, 'replace');
    }
    /**
     * 提示词 → 一键生成整图（选型→摆放→连线）。
     * mode=replace 清空后替换；append 合并到当前空白区。
     */
    async aiGenerateCircuitFromPrompt(prompt: string, mode: AiGenerateMode): Promise<boolean> {
        const trimmed = prompt.trim();
        if (trimmed.length === 0) {
            this.onStatusMessage('请输入提示词');
            return false;
        }
        if (this.aiGenerating) {
            this.onStatusMessage('AI 正在生成中');
            return false;
        }
        if (this.aiApiManager.isQuotaWarningActive()) {
            this.appendAiGenLog('system', 'AI 用量已达 80%，请注意额度');
        }
        this.beginAiGenerate(trimmed, mode);
        try {
            const runTopo = emptySchTopology();
            runTopo.schName = 'AI Generated';
            runTopo.bgColor = '#FFFFFF';
            const result = await this.aiEngine.runAiTask(AiTaskType.TASK_FULL_PIPELINE, runTopo, { prompt: trimmed, scene: 'text_gen' }, (p) => this.handleAiGenProgress(p));
            if (this.aiGenCancelRequested) {
                this.appendAiGenLog('assistant', '已取消生成');
                this.endAiGenerate(false);
                this.onStatusMessage('AI 生成已取消');
                return false;
            }
            if (!result.success || !result.topology) {
                this.appendAiGenLog('assistant', `生成失败: ${result.errMsg || '未知错误'}`);
                this.endAiGenerate(false);
                this.onStatusMessage(result.errMsg || 'AI 生成失败');
                return false;
            }
            this.appendTopologySummary(result.topology, result.analysisText ?? '');
            if (mode === 'replace') {
                this.schematicEditor.loadTopology(result.topology);
                if (result.topology.wireList.length > 0) {
                    this.schematicEditor.applyRouteResult({
                        routeLines: result.topology.wireList,
                        crossCount: 0, totalLineLength: 0,
                        isolateAnalogDigital: true, xtalShortPath: true, diffLineEqualLength: false
                    }, true);
                }
            }
            else {
                const generatedDoc = TopologyAdapter.fromTopology(result.topology);
                const editor = this.schematicEditor as SchematicEditorImpl;
                const currentDoc = editor.getDocument();
                TemplateMergeUtil.mergeTemplateInto(currentDoc, generatedDoc);
                editor.loadDocument(currentDoc);
                editor.rebuildNetPinConnectivity();
                const grid = currentDoc.metadata.gridSize || 10;
                ensureNetPinConnectivity(currentDoc, grid, this.pinGeometryResolver());
                if (result.topology.wireList.length > 0) {
                    // 合并后拓扑以文档为准；再 fit 视图
                }
            }
            this.schematicEditor.fitAllInView();
            this.syncProjectFromModules();
            this.reloadSimulationFromSchematic();
            const erc = this.runErc(false);
            const errN = erc.filter(e => e.severity === 'error' || e.severity === 'critical').length;
            const warnN = erc.filter(e => e.severity === 'warning').length;
            this.appendAiGenLog('assistant', `落图完成 · 模式=${mode === 'replace' ? '替换' : '追加'} · ERC ${erc.length} 条（错误 ${errN} / 警告 ${warnN}）`);
            this.appendAiGenLog('system', '画布已解锁');
            this.onProjectChanged();
            this.onStatusMessage(`AI 闭环完成: ${result.topology.deviceList.length} 器件, ${result.topology.wireList.length} 导线`);
            this.endAiGenerate(true);
            return true;
        }
        catch (e) {
            this.appendAiGenLog('assistant', `异常: ${e}`);
            this.endAiGenerate(false);
            this.onStatusMessage(`AI 生成异常: ${e}`);
            return false;
        }
    }
    private beginAiGenerate(prompt: string, mode: AiGenerateMode): void {
        this.aiGenerating = true;
        this.aiGenCancelRequested = false;
        (this.schematicEditor as SchematicEditorImpl).setReadOnly(true);
        this.aiGenLogs = [];
        this.appendAiGenLog('user', prompt);
        this.appendAiGenLog('system', `开始全闭环生成（${mode === 'replace' ? '替换整图' : '追加到空白区'}）· 画布已锁定`);
        this.appendAiGenLog('assistant', '正在解析器件需求…');
        this.onAiGeneratingChanged(true);
        this.onStatusMessage('AI 生成中，画布已锁定');
    }
    private endAiGenerate(_ok: boolean): void {
        this.aiGenerating = false;
        this.aiGenCancelRequested = false;
        (this.schematicEditor as SchematicEditorImpl).setReadOnly(false);
        this.onAiGeneratingChanged(false);
    }
    private handleAiGenProgress(p: ProgressInfo): void {
        this.onAiProgress(p);
        if (p.stage.length === 0) {
            return;
        }
        const line = this.formatAiStageLog(p.progress, p.stage);
        if (line.length === 0) {
            return;
        }
        // 同阶段去重，避免日志刷屏
        if (this.aiGenLogs.length > 0) {
            const last = this.aiGenLogs[this.aiGenLogs.length - 1];
            if (last.role === 'assistant' && last.text.indexOf(`] ${p.stage}`) >= 0) {
                // 仅更新最后一条进度百分比
                const updated: AiGenLogEntry = {
                    id: last.id,
                    role: last.role,
                    text: line,
                    ts: Date.now()
                };
                const next = this.aiGenLogs.slice(0, this.aiGenLogs.length - 1);
                next.push(updated);
                this.aiGenLogs = next;
                this.notifyAiGenLogs();
                return;
            }
        }
        this.appendAiGenLog('assistant', line);
    }
    private formatAiStageLog(progress: number, stage: string): string {
        const s = stage.trim();
        if (s === 'init' || s === 'done' || s.indexOf('Starting task') >= 0 || s.indexOf('Task complete') >= 0) {
            return '';
        }
        return `[${progress}%] ${s}`;
    }
    private appendTopologySummary(topo: SchTopology, analysis: string): void {
        const deviceLines: string[] = [];
        const maxDev = Math.min(topo.deviceList.length, 24);
        for (let i = 0; i < maxDev; i++) {
            const d = topo.deviceList[i];
            deviceLines.push(`  · 摆放 ${d.refName} (${d.libDevId}) @ (${Math.round(d.x)}, ${Math.round(d.y)})`);
        }
        if (topo.deviceList.length > maxDev) {
            deviceLines.push(`  · …另有 ${topo.deviceList.length - maxDev} 个器件`);
        }
        this.appendAiGenLog('assistant', `选型/摆放完成: ${topo.deviceList.length} 器件\n${deviceLines.join('\n')}`);
        this.appendAiGenLog('assistant', `布线完成: ${topo.wireList.length} 导线 / ${topo.netList.length} 网络`);
        if (analysis.length > 0) {
            this.appendAiGenLog('system', `流水线状态: ${analysis}`);
        }
        if (topo.ercErrorList !== undefined && topo.ercErrorList.length > 0) {
            const n = Math.min(topo.ercErrorList.length, 8);
            const bits: string[] = [];
            for (let i = 0; i < n; i++) {
                bits.push(`  · ${topo.ercErrorList[i].desc}`);
            }
            this.appendAiGenLog('system', `流水线 ERC 提示 ${topo.ercErrorList.length} 条:\n${bits.join('\n')}`);
        }
    }
    private appendAiGenLog(role: 'user' | 'assistant' | 'system', text: string): void {
        this.aiGenLogSeq++;
        const entry: AiGenLogEntry = {
            id: `ailog_${this.aiGenLogSeq}_${Date.now()}`,
            role: role,
            text: text,
            ts: Date.now()
        };
        this.aiGenLogs = this.aiGenLogs.concat([entry]);
        this.notifyAiGenLogs();
    }
    private notifyAiGenLogs(): void {
        this.onAiGenLogsChanged(this.getAiGenLogs());
    }
    /** 局部框选器件重新摆放 */
    async aiOptimizePlacement(prompt: string = '规整布局'): Promise<boolean> {
        const topo = this.getTopology();
        const selected = this.schematicEditor.getSelectedDevices();
        const locked = topo.deviceList
            .filter(d => !selected.some(s => s.instUuid === d.instUuid))
            .map(d => d.instUuid);
        const result = await this.aiEngine.runAiTask(AiTaskType.TASK_LAYOUT_PLACE, topo, { prompt, lockedUuids: locked }, (p) => this.onAiProgress(p));
        if (result.success && result.topology) {
            this.schematicEditor.loadTopology(result.topology);
            this.onProjectChanged();
            this.onStatusMessage('布局优化完成');
            return true;
        }
        return false;
    }
    setOfflineMode(enabled: boolean): void {
        (this.aiApiManager as AiApiManagerImpl).networkMode.setOfflineMode(enabled);
    }
    setGlobalProxy(url: string): void {
        (this.aiApiManager as AiApiManagerImpl).networkMode.setGlobalProxy(url);
    }
    setAccessibility(cfg: AccessibilityConfig): void {
        this.accessibility = cfg;
    }
    getAccessibility(): AccessibilityConfig {
        return {
            highContrast: this.accessibility.highContrast,
            keyboardOnly: this.accessibility.keyboardOnly,
            uiScale: this.accessibility.uiScale,
            screenReader: this.accessibility.screenReader
        };
    }
    injectFault(instUuid: string, faultType: FaultType): ApiResult<FaultInjection> {
        const gate = FeatureGate.canUseFaultInjection();
        if (!gate.success) {
            return ResultHelper.fail<FaultInjection>(gate.errCode, gate.error);
        }
        const result = (this.simulationKernel as SimulationKernelImpl).injectFault(instUuid, faultType);
        if (result.success) {
            this.reloadSimulationFromSchematic();
        }
        return result;
    }
    clearFaults(): void {
        const kernel = this.simulationKernel as SimulationKernelImpl;
        const faults = kernel.listFaults();
        for (let i = 0; i < faults.length; i++) {
            kernel.removeFault(faults[i].id);
        }
        this.reloadSimulationFromSchematic();
    }
    batchFaultScan(): FaultScanResult[] {
        return (this.simulationKernel as SimulationKernelImpl).batchFaultScan();
    }
    getAppBaseDir(): string {
        return this.appBaseDir;
    }
    getUserProjectDir(): string {
        return ProjectPaths.userProjectRoot(this.appBaseDir);
    }
    getAutosaveDir(): string {
        return ProjectPaths.autosaveRoot(this.appBaseDir);
    }
    /** 列出沙箱 project/ 目录下用户工程（完整路径） */
    listUserProjectFiles(): string[] {
        const dir = this.getUserProjectDir();
        try {
            const names = fs.listFileSync(dir);
            const out: string[] = [];
            for (let i = 0; i < names.length; i++) {
                if (names[i].endsWith('.schsim')) {
                    out.push(`${dir}/${names[i]}`);
                }
            }
            return out.sort();
        }
        catch (_e) {
            return [];
        }
    }
    getTemplateDir(): string {
        return ProjectPaths.templateRoot(this.appBaseDir);
    }
    getHexDir(): string {
        return ProjectPaths.hexRoot(this.appBaseDir);
    }
    /** 沙箱 hex_files 目录下全部固件（完整路径） */
    listHexFiles(): string[] {
        return TemplateProjectBootstrap.listHexFiles(this.appBaseDir);
    }
    listAvailableLabTemplates(category: string = 'all'): LabTemplate[] {
        const all = category === 'all'
            ? this.teachingService.listTemplates()
            : this.teachingService.listTemplatesByCategory(category);
        const out: LabTemplate[] = [];
        for (let i = 0; i < all.length; i++) {
            const tpl = all[i];
            const path = ProjectPaths.templateFile(this.appBaseDir, tpl.id);
            if (TemplateProjectBootstrap.fileExists(path)) {
                out.push(tpl);
            }
        }
        return out;
    }
    async loadLabTemplate(templateId: string): Promise<boolean> {
        const templatePath = ProjectPaths.templateFile(this.appBaseDir, templateId);
        if (!TemplateProjectBootstrap.fileExists(templatePath)) {
            this.onStatusMessage(`模板工程不存在: ${templatePath}`);
            return false;
        }
        if (this.currentProject === null) {
            this.newProject('Untitled');
        }
        const loadResult = await (this.filePersistence as FilePersistenceImpl).loadProjectData(templatePath);
        if (!loadResult.success || loadResult.data === undefined) {
            this.onStatusMessage(`读取模板失败: ${loadResult.error ?? templatePath}`);
            return false;
        }
        const templateDoc = TopologyAdapter.fromTopology(loadResult.data.topology);
        const editor = this.schematicEditor as SchematicEditorImpl;
        const currentDoc = editor.getDocument();
        TemplateMergeUtil.mergeTemplateInto(currentDoc, templateDoc);
        editor.loadDocument(currentDoc);
        editor.rebuildNetPinConnectivity();
        const grid = currentDoc.metadata.gridSize || 10;
        ensureNetPinConnectivity(currentDoc, grid, this.pinGeometryResolver());
        this.syncProjectFromModules();
        this.reloadSimulationFromSchematic();
        editor.fitAllInView();
        this.onProjectChanged();
        const def = this.teachingService.listTemplates().find(t => t.id === templateId);
        const tplName = def !== undefined ? def.name : templateId;
        const hexName = this.teachingService.getTemplateHexFileName(templateId);
        const hexPath = this.getTemplateHexPath(templateId);
        if (hexPath !== null && hexName !== null) {
            const exists = TemplateProjectBootstrap.fileExists(hexPath);
            if (exists) {
                const fwHint = this.teachingService.getTemplateFirmware(templateId);
                const mcuFamily = (fwHint !== null && fwHint.mcuFamily === 'STM32')
                    ? McuFamily.MCU_STM32F1
                    : McuFamily.MCU_8051;
                const autoLoaded = this.loadHexFileIntoSim(hexPath, mcuFamily);
                if (autoLoaded) {
                    this.onStatusMessage(`已将实验「${tplName}」插入并预装 ${hexName}（可在 MCU 面板重选烧录）`);
                    traceBurn('TEMPLATE_HEX', `template=${templateId} path=${hexPath} ready=true autoload=true`);
                }
                else {
                    this.onStatusMessage(`已将实验「${tplName}」插入；请在 MCU 调试面板烧录 ${hexName}`);
                    traceBurn('TEMPLATE_HEX', `template=${templateId} path=${hexPath} ready=true autoload=false`);
                }
            }
            else {
                this.onStatusMessage(`已将实验「${tplName}」插入；固件缺失: ${hexName}`);
                traceBurn('TEMPLATE_HEX', `template=${templateId} path=${hexPath} ready=false`);
            }
        }
        else {
            this.onStatusMessage(`已将实验「${tplName}」插入当前工程空白区域`);
            traceBurn('TEMPLATE_HEX', `template=${templateId} path=(none)`);
        }
        return true;
    }
    /**
     * Parse Intel HEX from sandbox path and load binary into debugger + sim kernel.
     * Returns false if file missing or parse fails.
     */
    loadHexFileIntoSim(hexPath: string, family: McuFamily = McuFamily.MCU_8051): boolean {
        try {
            if (!TemplateProjectBootstrap.fileExists(hexPath)) {
                return false;
            }
            const fileHandle = fs.openSync(hexPath, fs.OpenMode.READ_ONLY);
            const stat = fs.statSync(hexPath);
            const buffer = new ArrayBuffer(stat.size);
            fs.readSync(fileHandle.fd, buffer);
            fs.closeSync(fileHandle);
            const raw = new Uint8Array(buffer);
            const result = this.hexDebugger.loadHexData(raw, family);
            if (!result.success || result.data === undefined) {
                traceBurn('TEMPLATE_AUTOLOAD_FAIL', `path=${hexPath} err=${result.error ?? 'parse'}`);
                return false;
            }
            const familyStr = family === McuFamily.MCU_8051 ? '8051' : 'STM32F1';
            this.loadMcuIntoSim(result.data.data, 0, familyStr);
            traceBurn('TEMPLATE_AUTOLOAD_OK', `path=${hexPath} family=${familyStr} bytes=${result.data.data.length}`);
            return true;
        }
        catch (e) {
            traceBurn('TEMPLATE_AUTOLOAD_FAIL', `path=${hexPath} ex=${e}`);
            return false;
        }
    }
    /** 模板关联 hex 沙箱完整路径（.../AISchSim/hex_files/xxx.hex） */
    getTemplateHexPath(templateId: string): string | null {
        const name = this.teachingService.getTemplateHexFileName(templateId);
        if (name === null) {
            return null;
        }
        return ProjectPaths.hexFile(this.appBaseDir, name);
    }
    isHexFileReady(hexPath: string): boolean {
        return TemplateProjectBootstrap.fileExists(hexPath);
    }
    stepPowerOn(stepIndex: number): void {
        const topo = this.teachingService.stepPowerOnSequence(this.getTopology(), stepIndex);
        this.schematicEditor.loadTopology(topo);
        this.onProjectChanged();
        this.reloadSimulationFromSchematic();
    }
    saveSnapshot(name: string, note: string): void {
        void this.createSnapshot(name, note);
    }
    privacyCleanup(): void {
        (this.aiEngine as AiEngineImpl).clearAiCache();
        this.crashGuard.clearSensitiveData([]);
        this.onStatusMessage('隐私数据已清理');
    }
    exportBomMerged(): string {
        return ExportPostProcessor.mergeBom(this.getTopology());
    }
    private wireEventBus(): void {
        EventBus.getInstance().subscribe(ModuleEvent.SCHEMATIC_CHANGED, this.onSchematicChanged);
        EventBus.getInstance().subscribe(ModuleEvent.SIMULATION_STARTED, () => {
            this.schematicEditor.setSimBusy(true);
        });
        EventBus.getInstance().subscribe(ModuleEvent.SIMULATION_STOPPED, () => {
            this.schematicEditor.setSimBusy(false);
        });
        // SIMULATION_STEP → canvas only; wave emit is in publishInstrumentFrame (throttled)
        EventBus.getInstance().subscribe(ModuleEvent.AI_TASK_PROGRESS, (payload) => {
            this.onAiProgress(payload.data as ProgressInfo);
        });
    }
    private wireCallbacks(): void {
        CallbackRegistry.getInstance().onErcUpdate((errors) => {
            traceErcErrorList(errors, 'RUNTIME_ERC');
            this.onErcUpdate(errors);
        });
        CallbackRegistry.getInstance().onBreakpointHit((mcuUuid, addr) => {
            this.onStatusMessage(`断点命中: MCU ${mcuUuid} @ 0x${addr.toString(16)}`);
        });
        CallbackRegistry.getInstance().onUartRecv((mcuUuid, byte) => {
            Logger.info('uart', `MCU ${mcuUuid} RX: 0x${byte.toString(16)}`);
        });
    }
    private wireBomLookup(): void {
        const fp = this.filePersistence as FilePersistenceImpl;
        const lib = this.componentLibrary as ComponentLibraryImpl;
        const lookup = new BomLookupImpl(lib);
        fp.setBomLookup(lookup);
    }
    private wireComponentBoundsResolver(): void {
        const editor = this.schematicEditor as SchematicEditorImpl;
        const lib = this.componentLibrary as ComponentLibraryImpl;
        editor.setComponentBoundsResolver((libraryId: string): SymbolBounds | null => {
            const resolvedId = lib.resolveLibraryId(libraryId);
            const comp = lib.getComponent(resolvedId);
            if (!comp.success || comp.data === undefined) {
                return null;
            }
            return calcSymbolBounds(comp.data.pins, 8);
        });
        editor.setPinResolver((libraryId: string): Pin[] | null => {
            const resolvedId = lib.resolveLibraryId(libraryId);
            const comp = lib.getComponent(resolvedId);
            if (!comp.success || comp.data === undefined) {
                return null;
            }
            return comp.data.pins;
        });
        editor.setDefaultParamsResolver((libraryId: string): Map<string, string> | null => {
            const resolvedId = lib.resolveLibraryId(libraryId);
            const comp = lib.getComponent(resolvedId);
            if (!comp.success || comp.data === undefined) {
                return null;
            }
            const copy = new Map<string, string>();
            comp.data.defaultParams.forEach((value: string, key: string) => {
                copy.set(key, value);
            });
            return copy;
        });
    }
    private async bootstrapAndLoadLibrary(context: common.UIAbilityContext, targetPath: string): Promise<void> {
        await DeviceLibraryBootstrap.ensureLibrary(context, targetPath);
        this.initDeviceLibrary(targetPath);
    }
    private initDeviceLibrary(targetPath: string): void {
        const lib = this.componentLibrary as ComponentLibraryImpl;
        const result = lib.initFromDeviceLibrary(targetPath);
        if (result.success && result.data !== undefined && result.data > 0) {
            this.onStatusMessage(`精确器件库已加载 ${result.data} 项 (v${lib.getLibraryVersion()})`);
            return;
        }
        Logger.info('component_library', `DeviceLibrary 未从 ${targetPath} 加载，使用内置库`);
    }
    private async loadProteusAliases(context: common.UIAbilityContext): Promise<void> {
        try {
            const data = await context.resourceManager.getRawFileContent('proteus_alias.json');
            const lib = this.componentLibrary as ComponentLibraryImpl;
            let text = '';
            for (let i = 0; i < data.length; i++) {
                text += String.fromCharCode(data[i]);
            }
            const count = lib.loadProteusAliases(text);
            if (count > 0) {
                Logger.info('component_library', `Proteus 别名表已加载 ${count} 项`);
            }
        }
        catch (_e) {
            Logger.info('component_library', 'proteus_alias.json 未找到，使用内置别名');
        }
    }
    cycleGridSize(): number {
        const sizes: number[] = [5, 10, 20, 50];
        const editor = this.schematicEditor;
        const current = editor.getViewport().gridSize;
        let idx = 0;
        for (let i = 0; i < sizes.length; i++) {
            if (sizes[i] === current)
                idx = i;
        }
        const next = sizes[(idx + 1) % sizes.length];
        editor.setGridSize(next);
        this.onStatusMessage(`网格尺寸: ${next}px`);
        return next;
    }
    toggleTheme(): boolean {
        const mode = ThemeManager.getInstance().toggle();
        this.onStatusMessage(mode === 'dark' ? '已切换深色主题' : '已切换浅色主题');
        return mode === 'dark';
    }
    private onSchematicChanged = (_payload: ModuleEventPayload): void => {
        if (this.currentProject) {
            this.currentProject.schematic = this.schematicEditor.getDocument();
        }
        // Debounce heavy reload/ERC while user is dragging — keeps edit path smooth
        if (this.schematicDebounceTimer >= 0) {
            clearTimeout(this.schematicDebounceTimer);
        }
        this.schematicDebounceTimer = setTimeout(() => {
            this.schematicDebounceTimer = -1;
            this.reloadSimulationFromSchematic();
        }, this.SCHEMATIC_DEBOUNCE_MS);
    };
    registerKeyboardShortcuts(): void {
        const km = KeyboardShortcutManager.getInstance();
        km.clear();
        const editor = this.schematicEditor;
        km.register({ key: 'z', ctrl: true, description: '撤销', handler: () => { editor.undo(); } });
        km.register({ key: 'y', ctrl: true, description: '重做', handler: () => { editor.redo(); } });
        km.register({ key: 'a', ctrl: true, description: '全选', handler: () => { editor.selectAll(); } });
        km.register({ key: 'c', ctrl: true, description: '复制', handler: () => { this.copyHandler(); } });
        km.register({ key: 'v', ctrl: true, description: '粘贴', handler: () => { this.pasteHandler(); } });
        km.register({ key: 'x', ctrl: true, description: '剪切', handler: () => { this.cutHandler(); } });
        km.register({ key: 'Delete', description: '删除', handler: () => {
                const devs = editor.getSelectedDevices();
                if (devs.length > 0) {
                    const ids: string[] = [];
                    for (let i = 0; i < devs.length; i++)
                        ids.push(devs[i].instUuid);
                    editor.batchDeleteDevice(ids);
                }
            } });
        km.register({ key: 'r', description: '旋转', handler: () => {
                const devs = editor.getSelectedDevices();
                if (devs.length > 0)
                    editor.rotateDevice(devs[0].instUuid, 90);
            } });
        km.register({ key: 'm', description: '镜像', handler: () => {
                const devs = editor.getSelectedDevices();
                if (devs.length > 0)
                    editor.mirrorDevice(devs[0].instUuid, true);
            } });
        km.register({ key: ' ', description: '切换布线', handler: () => { this.wireToolToggleHandler(); } });
        km.register({ key: 'f', description: '适应窗口', handler: () => { editor.fitAllInView(); } });
        km.register({ key: 'g', description: '循环网格', handler: () => { this.cycleGridSize(); } });
        km.register({ key: 'Escape', description: '取消选择', handler: () => { editor.setSelection([]); } });
    }
    handleShortcut(key: string, ctrl: boolean, shift: boolean): boolean {
        return KeyboardShortcutManager.getInstance().handleKey(key, ctrl, shift);
    }
    async connectCollab(wsUrl: string): Promise<boolean> {
        return this.collabSync.connect(wsUrl, this.sessionHolderId);
    }
    disconnectCollab(): void {
        this.collabSync.disconnect();
    }
    getCollabPresence(): CollabPresence[] {
        return this.collabSync.getPresence();
    }
    broadcastCollabCursor(x: number, y: number): void {
        this.collabSync.broadcastCursor(x, y, this.sessionUserName);
    }
    async acceptPrivacyPolicy(): Promise<void> {
        await PrivacyConsentStore.recordConsent();
        this.onStatusMessage('已记录隐私政策同意');
    }
    async hasPrivacyConsent(): Promise<boolean> {
        return PrivacyConsentStore.hasConsent();
    }
    async runAiValidationSuite(): Promise<string> {
        const engine = this.aiEngine as AiEngineImpl;
        const summary = await engine.runValidationSuite();
        this.onStatusMessage(summary);
        return summary;
    }
    exportLibraryPack(outDir: string): string {
        const lib = this.componentLibrary as ComponentLibraryImpl;
        const r = lib.exportOfflinePack(outDir);
        return r.success ? (r.data ?? '') : (r.error ?? 'export failed');
    }
    importLibraryPack(packDir: string): number {
        const lib = this.componentLibrary as ComponentLibraryImpl;
        const r = lib.importOfflinePack(packDir);
        return r.success ? (r.data ?? 0) : 0;
    }
}
