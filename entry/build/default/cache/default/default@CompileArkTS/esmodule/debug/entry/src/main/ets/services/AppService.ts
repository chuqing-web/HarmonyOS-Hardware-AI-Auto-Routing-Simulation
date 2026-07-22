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
import { AiEngineImpl, FaultDiagnoser, classifyCircuitIntent, resolveHysteresisSafeAmplitude, schematicLikelyHysteresisComparator, parseSignalAmplitudeVolts } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/Index";
import type { IAiEngine, TeachingService, LabTemplate, ChatHistoryEntry } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/Index";
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
import { ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import { PlatformPrefsStore } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/PlatformPrefsStore";
import { AiApiVaultStore } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/AiApiVaultStore";
import { EventBus, ModuleEvent, CallbackRegistry, AiTaskType, defaultSimConfig, Logger, ExportPostProcessor, ResultHelper, ErrCode, LicenseManager, FeatureGate, SchematicAnnotationType, SchematicAnnotationStatus, IdUtil, calcSymbolBounds, paramMapGet, PrivacyConsentStore, McuFamily, SimulationState, getPinNetMap, findNetForPinLabel, TopologyAdapter, traceInteractiveInstrumentLive, traceBindingRefresh, traceActiveComponentChanged, traceReloadSchematic, traceSimStep, tracePinNetEmpty, INSTR_TRACE_TAG, traceMeasure, formatPinNetMap, ensureNetPinConnectivity, traceProjectOpenAudit, traceSimStartupAudit, traceDataFlow, traceErcErrorList, traceBurn, traceUart, formatUartBytesHex, traceUartTxDrain, tracePerPinConnectivity, emptySchTopology, traceAiPayload, traceAiOp, traceAiDiag, AiErcGateUtil, mapAwareStringify, mapAwareParse, SignalWaveform, UnitParser, MainThreadYield, MultimeterMode } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ProjectFile, ModuleEventPayload, SchTopology, WaveData, ErcError, AiApiConfig, ProgressInfo, FaultType, FaultInjection, FaultScanResult, AccessibilityConfig, ApiResult, LicenseStatus, UsageDashboard, SnapshotMeta, VersionCompareReport, SymbolBounds, Pin, SchematicDocument, PowerMeterConfig, InteractiveMeterSnap, BindingTraceInfo, PinGeometryResolver, PinGeometry, ComponentInstance } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { CollabSyncClient } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/Index";
import type { CollabPresence } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/Index";
import { InstrumentWaveExpandStore } from "@bundle:com.elecdraw.aischsim/entry/ets/components/InstrumentWaveExpandStore";
/** AI 整图生成对话/日志条目（Claude/Cursor 风格流） */
export interface AiGenLogEntry {
    id: string;
    role: 'user' | 'assistant' | 'system';
    text: string;
    ts: number;
}
/** replace=清空后替换；append=合并到空白区；edit=基于当前画布增量修改 */
export type AiGenerateMode = 'replace' | 'append' | 'edit';
/** oneshot=整图一次；modular=先整体设计边界再真并行合并 */
export type AiGenerateStrategy = 'oneshot' | 'modular';
interface AiPostGenerateIssues {
    needAsk: boolean;
    count: number;
    summary: string;
}
interface SimConnectivityGate {
    netCount: number;
    railCount: number;
    labelCount: number;
    pinRefCount: number;
    floatingPinCount: number;
    duplicateRailNames: string[];
    hardUnconnected: string[];
}
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
    private persistDebounceTimer: number = -1;
    private readonly PERSIST_DEBOUNCE_MS: number = 2000;
    /** 防止连点模板重复合并导致器件翻倍 + 主线程叠加重活 */
    private templateLoadBusy: boolean = false;
    /** 防止连点启动仿真叠加重活 */
    private simStartBusy: boolean = false;
    /** 工程变更后延迟 ERC，与仿真启动共用，避免重复全量检查 */
    private scheduledErcTimer: number = -1;
    /** 当前工作副本 autosave 路径（含未保存的 Untitled 工程） */
    private workingAutoSavePath: string = '';
    static readonly AUTOSAVE_INTERVAL_MS: number = 30000;
    private lastActiveInstrumentId: string | null = null;
    private bindingPinHash: Map<string, string> = new Map();
    private appBaseDir: string = '';
    private templateBootstrapPromise: Promise<void> | null = null;
    private aiGenerating: boolean = false;
    /** 用户点取消后保持为 true，直到该次 await 收尾（禁止 endAiGenerate 提前清掉） */
    private aiGenCancelRequested: boolean = false;
    /** 每次 begin/cancel 递增；await 返回后若 session 过期则丢弃结果 */
    private aiGenEpoch: number = 0;
    private aiGenLogs: AiGenLogEntry[] = [];
    private aiGenLogSeq: number = 0;
    private aiSelfCheckPromptPending: boolean = false;
    private lastAiPrompt: string = '';
    private aiConversationHistory: ChatHistoryEntry[] = [];
    onProjectChanged: () => void = () => { };
    onStatusMessage: (msg: string) => void = () => { };
    /** 最近一次仿真启动失败原因（供 UI 弹窗）；成功启动时清空 */
    private lastSimStartFailReason: string = '';
    onErcUpdate: (errors: ErcError[]) => void = () => { };
    onWaveUpdate: (waves: WaveData[]) => void = () => { };
    onAiProgress: (p: ProgressInfo) => void = () => { };
    onAiGeneratingChanged: (busy: boolean) => void = () => { };
    onAiGenLogsChanged: (logs: AiGenLogEntry[]) => void = () => { };
    onAiSelfCheckNeeded: (issueCount: number, summary: string) => void = () => { };
    onLibraryLoaded: (totalCount: number) => void = () => { };
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
        // Kernel rebuilds pinIds on load/start — must use library geometry (MCU P1..Pn)
        (this.simulationKernel as SimulationKernelImpl).setPinGeometryResolver(this.pinGeometryResolver());
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
            fs.mkdirSync(ProjectPaths.apiVaultRoot(baseDir), true);
        }
        catch (_e) { }
        try {
            fs.mkdirSync(ProjectPaths.userProjectRoot(baseDir), true);
        }
        catch (_e) { }
        try {
            ThemeManager.getInstance().bindApplicationContext(context.getApplicationContext());
        }
        catch (_e) { /* ignore */ }
        ThemeManager.getInstance().init(baseDir);
        PlatformPrefsStore.getInstance().init(baseDir);
        AiApiVaultStore.getInstance().init(baseDir);
        this.applyPlatformPrefsFromStore();
        this.loadAiApiVaultOnStartup();
        (this.filePersistence as FilePersistenceImpl).setAppBaseDir(baseDir);
        this.filePersistence.initCollaboration(baseDir);
        this.templateBootstrapPromise = TemplateProjectBootstrap.ensure(context, baseDir);
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
        this.resetInstrumentUiForProjectSwitch();
        this.currentProject = this.filePersistence.createNewProject(name);
        this.currentProjectPath = '';
        // API 存在全局加密金库，新建工程不再清空已加载的 API
        this.currentProject.aiConfigs = [];
        Logger.info(INSTR_TRACE_TAG, '[AI_API] newProject keep vault APIs (not cleared)');
        const editor = this.schematicEditor as SchematicEditorImpl;
        editor.loadAnnotations([]);
        editor.setReadOnly(false);
        this.schematicEditor.loadDocument(this.currentProject.schematic);
        // Always stamp kernel from editor doc (LoadDocumentCommand may clone identity)
        const doc = editor.getDocument();
        this.currentProject.schematic = doc;
        ensureNetPinConnectivity(doc, doc.metadata.gridSize || 10, this.pinGeometryResolver());
        this.simulationKernel.loadSchematic(doc);
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
        if (this.currentProject !== null) {
            this.currentProject.schematic = doc;
        }
        ensureNetPinConnectivity(doc, doc.metadata.gridSize || 10, this.pinGeometryResolver());
        const gate = this.evaluateSimConnectivityGate(doc);
        Logger.info(INSTR_TRACE_TAG, `[SIM_RELOAD_CONN] nets=${gate.netCount} rails=${gate.railCount} pinRefs=${gate.pinRefCount} ` +
            `floating=${gate.floatingPinCount} dup=${gate.duplicateRailNames.join(',') || 'none'} ` +
            `hard=${gate.hardUnconnected.join(',') || 'none'}`);
        if (gate.duplicateRailNames.length > 0 || gate.hardUnconnected.length > 0) {
            Logger.warn(INSTR_TRACE_TAG, `[SIM_RELOAD_BLOCKED] dupRails=${gate.duplicateRailNames.join(',')} hard=${gate.hardUnconnected.join(',')}`);
            this.onStatusMessage(gate.duplicateRailNames.length > 0
                ? `热重载已拒绝: 电源轨未合并 ${gate.duplicateRailNames.join(',')}`
                : `热重载已拒绝: 关键脚未连 ${gate.hardUnconnected.slice(0, 3).join('; ')}`);
            // Keep previous MNA netlist — do not stamp a known-false topology mid-run
            return;
        }
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
    /**
     * Post-rebuild connectivity gate for simulation truthfulness.
     * Duplicate rails and hard-unconnected power/instrument pins block start.
     */
    private evaluateSimConnectivityGate(doc: SchematicDocument): SimConnectivityGate {
        // After alias merge, only canonical rails should remain; duplicates mean merge failed
        const railNames = ['VCC', 'GND', 'VEE'];
        const railCountByName = new Map<string, number>();
        let pinRefCount = 0;
        for (let ni = 0; ni < doc.nets.length; ni++) {
            pinRefCount += doc.nets[ni].pinIds.length;
            const upper = doc.nets[ni].name.toUpperCase();
            // Count aliases as their canonical form for duplicate detection
            let canon = upper;
            if (upper === 'VDD' || upper === 'V+') {
                canon = 'VCC';
            }
            else if (upper === 'VSS' || upper === '0') {
                canon = 'GND';
            }
            else if (upper === 'V-') {
                canon = 'VEE';
            }
            if (railNames.indexOf(canon) >= 0) {
                railCountByName.set(canon, (railCountByName.get(canon) ?? 0) + 1);
            }
        }
        const duplicateRailNames: string[] = [];
        railCountByName.forEach((count: number, name: string) => {
            if (count > 1) {
                duplicateRailNames.push(name);
            }
        });
        const connectedPins = new Set<string>();
        const pinNameByKey = new Map<string, string>();
        for (let ni = 0; ni < doc.nets.length; ni++) {
            for (let pi = 0; pi < doc.nets[ni].pinIds.length; pi++) {
                const ref = doc.nets[ni].pinIds[pi];
                const parts = ref.split(':');
                if (parts.length >= 2) {
                    const key = `${parts[0]}:${parts[1]}`;
                    connectedPins.add(key);
                    if (parts.length >= 3 && parts[2].length > 0) {
                        pinNameByKey.set(key, parts[2]);
                    }
                }
            }
        }
        let floatingPinCount = 0;
        const hardUnconnected: string[] = [];
        for (let ci = 0; ci < doc.components.length; ci++) {
            const comp = doc.components[ci];
            const lib = comp.libraryId.toUpperCase();
            const pins = this.pinGeometryResolver()(comp.libraryId);
            if (pins === null || pins.length === 0) {
                continue;
            }
            const isPowerSym = lib === 'VCC' || lib === 'GND' || lib === 'VEE' ||
                lib.endsWith('/VCC') || lib.endsWith('/GND') || lib.endsWith('/VEE');
            const isScope = lib === 'OSCILLOSCOPE' || lib.startsWith('OSCILLOSCOPE');
            const isSigGen = lib === 'SIGNAL_GEN' || lib.startsWith('SIGNAL_GEN') || lib === 'VAC' || lib.startsWith('VAC');
            const isMeter = lib === 'AMMETER' || lib.startsWith('AMMETER') ||
                lib === 'VOLTMETER' || lib.startsWith('VOLTMETER') ||
                lib === 'VIRTUAL_METER' || lib.startsWith('VIRTUAL_METER') ||
                lib === 'POWER_METER' || lib.startsWith('POWER_METER') ||
                lib === 'DMM' || lib.startsWith('DMM');
            const isFreq = lib === 'FREQ_COUNTER' || lib.startsWith('FREQ_COUNTER');
            const isLogic = lib === 'LOGIC_ANALYZER' || lib.startsWith('LOGIC_ANALYZER');
            const isUart = lib === 'UART_TERMINAL' || lib.startsWith('UART_TERMINAL');
            const isInstrument = isScope || isSigGen || isMeter || isLogic || isFreq || isUart;
            // 有信号脚就必须有回线：示波/信号源/电表 + 频率计/逻辑分析仪/串口
            const needsReturn = isScope || isSigGen || isMeter || isFreq || isLogic || isUart;
            let anyConnected = false;
            let hasSignalPin = false;
            let hasGndPin = false;
            const isVac = lib === 'VAC' || lib.startsWith('VAC');
            for (let pi = 0; pi < pins.length; pi++) {
                const key = `${comp.id}:${pins[pi].id}`;
                if (connectedPins.has(key)) {
                    anyConnected = true;
                    const pname = (pinNameByKey.get(key) ?? pins[pi].name ?? pins[pi].id).toUpperCase();
                    // VAC 回线脚名是 AC-（不是 GND/COM）；电流表 I- 同理
                    if (pname === 'GND' || pname === 'COM' || pname === 'V-' || pname === '0' ||
                        pname === 'VSS' || pname === 'AC-' || pname === 'I-' ||
                        (isVac && (pins[pi].id === '2' || pname === 'AC-'))) {
                        hasGndPin = true;
                    }
                    else {
                        hasSignalPin = true;
                    }
                }
                else {
                    floatingPinCount++;
                }
            }
            if ((isPowerSym || isInstrument) && !anyConnected) {
                hardUnconnected.push(comp.refDes);
            }
            else if (needsReturn && hasSignalPin && !hasGndPin) {
                // Probe without return path → false waveforms / 假读数
                hardUnconnected.push(`${comp.refDes}(缺GND/COM)`);
            }
        }
        let railCount = 0;
        railCountByName.forEach((c: number) => { railCount += c; });
        return {
            netCount: doc.nets.length,
            railCount: railCount,
            labelCount: doc.netLabels?.length ?? 0,
            pinRefCount: pinRefCount,
            floatingPinCount: floatingPinCount,
            duplicateRailNames: duplicateRailNames,
            hardUnconnected: hardUnconnected
        };
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
    /** Resolve SIGNAL_GEN instance: prefer selection, else first on schematic. */
    private findSignalGenComponent(preferredCompId: string = ''): ComponentInstance | null {
        const doc = this.schematicEditor.getDocument();
        if (preferredCompId.length > 0) {
            const sel = doc.components.find(c => c.id === preferredCompId);
            if (sel !== undefined) {
                const lib = sel.libraryId.toUpperCase();
                if (lib === 'SIGNAL_GEN' || lib.startsWith('SIGNAL_GEN') ||
                    ((lib.includes('SIGNAL') || lib.includes('GEN') || lib.includes('FUNC')) &&
                        !lib.includes('OSC'))) {
                    return sel;
                }
            }
        }
        for (let i = 0; i < doc.components.length; i++) {
            const c = doc.components[i];
            const lib = c.libraryId.toUpperCase();
            if (lib === 'SIGNAL_GEN' || lib.startsWith('SIGNAL_GEN')) {
                return c;
            }
        }
        return null;
    }
    private signalWaveformToParam(wf: SignalWaveform): string {
        switch (wf) {
            case SignalWaveform.SQUARE: return 'square';
            case SignalWaveform.TRIANGLE: return 'triangle';
            case SignalWaveform.SAW: return 'saw';
            case SignalWaveform.PULSE: return 'pulse';
            case SignalWaveform.SINE:
            default: return 'sine';
        }
    }
    /**
     * 仪器面板波形按钮 → 写回原理图 SIGNAL_GEN.parameters.waveform 并重载仿真。
     * 仅改 VirtualInstruments 内存不会影响 AnalogEngine（后者读器件参数）。
     */
    applySignalGenWaveform(waveform: SignalWaveform, preferredCompId: string = ''): string {
        const comp = this.findSignalGenComponent(preferredCompId);
        if (comp === null) {
            return '未找到信号发生器器件';
        }
        const name = this.signalWaveformToParam(waveform);
        const validated = UnitParser.validateParam('waveform', name);
        if (!validated.valid) {
            return `波形无效: ${name}`;
        }
        this.schematicEditor.setDeviceParam(comp.id, 'waveform', validated.normalized);
        this.instruments.setWaveform(waveform);
        this.syncComponentParamToSimulation(comp.id, 'waveform', validated.normalized);
        Logger.info(INSTR_TRACE_TAG, `[SIGGEN] apply waveform=${validated.normalized} ref=${comp.refDes} id=${comp.id}`);
        return `${comp.refDes} 波形=${validated.normalized}`;
    }
    /** 仪器面板「应用参数」→ 写回原理图并重载仿真 */
    applySignalGenParams(frequency: number, amplitude: number, offset: number, dutyCycle: number, preferredCompId: string = ''): string {
        const comp = this.findSignalGenComponent(preferredCompId);
        if (comp === null) {
            return '未找到信号发生器器件';
        }
        let ampUse = amplitude;
        let ampNote = '';
        if (this.documentLikelyHysteresisComparator()) {
            const safe = resolveHysteresisSafeAmplitude(`${amplitude}V`);
            const safeV = parseSignalAmplitudeVolts(safe);
            if (Number.isFinite(safeV) && safeV > amplitude + 1e-9) {
                ampUse = safeV;
                ampNote = `（滞回整形幅度过小已抬至 ${safe}）`;
            }
        }
        const freqStr = `${frequency}`;
        const ampStr = `${ampUse}V`;
        const offStr = `${offset}V`;
        const dutyStr = `${dutyCycle}%`;
        const fOk = UnitParser.validateParam('frequency', freqStr);
        const aOk = UnitParser.validateParam('amplitude', ampStr);
        const oOk = UnitParser.validateParam('offset', offStr);
        const dOk = UnitParser.validateParam('dutyCycle', dutyStr);
        if (!fOk.valid || !aOk.valid || !oOk.valid || !dOk.valid) {
            return '频率/振幅/偏置/占空比无效';
        }
        this.schematicEditor.setDeviceParam(comp.id, 'frequency', fOk.normalized);
        this.schematicEditor.setDeviceParam(comp.id, 'amplitude', aOk.normalized);
        this.schematicEditor.setDeviceParam(comp.id, 'offset', oOk.normalized);
        this.schematicEditor.setDeviceParam(comp.id, 'dutyCycle', dOk.normalized);
        this.instruments.setParams({
            frequency, amplitude: ampUse, offset, dutyCycle, phase: 0
        });
        this.syncComponentParamToSimulation(comp.id, 'frequency', fOk.normalized);
        Logger.info(INSTR_TRACE_TAG, `[SIGGEN] apply params ref=${comp.refDes} f=${fOk.normalized} amp=${aOk.normalized} ` +
            `off=${oOk.normalized} duty=${dOk.normalized}${ampNote}`);
        return `${comp.refDes} f=${fOk.normalized} amp=${aOk.normalized} duty=${dOk.normalized}${ampNote}`;
    }
    /** 画布是否像滞回比较器（运放 + SIGNAL_GEN） */
    private documentLikelyHysteresisComparator(): boolean {
        const doc = this.schematicEditor.getDocument();
        const ids: string[] = [];
        for (let i = 0; i < doc.components.length; i++) {
            ids.push(doc.components[i].libraryId);
        }
        return schematicLikelyHysteresisComparator(ids);
    }
    /**
     * AI 全权驱动落盘：只补空字段 + 滞回幅度物理安全底线。
     * 不覆盖 LLM 已写入的 voltage/waveform/amplitude（错配由选型 HARD critique 逼重试）。
     */
    enforceElectricalParamsFromPrompt(prompt: string): number {
        const intent = classifyCircuitIntent(prompt);
        const doc = this.schematicEditor.getDocument();
        let fixed = 0;
        for (let i = 0; i < doc.components.length; i++) {
            const c = doc.components[i];
            const lib = (c.libraryId ?? '').toUpperCase();
            if (lib === 'VCC' || lib.startsWith('VCC')) {
                const before = paramMapGet(c.parameters, 'voltage', '').trim();
                if (before.length === 0) {
                    const want = intent.preferredVccVoltage.length > 0
                        ? intent.preferredVccVoltage
                        : (intent.dualSupply ? '12V' : '');
                    if (want.length > 0) {
                        this.schematicEditor.setDeviceParam(c.id, 'voltage', want);
                        fixed++;
                        Logger.info(INSTR_TRACE_TAG, `[AI_DRIVE] VCC voltage (empty)→${want} ref=${c.refDes}`);
                    }
                }
            }
            if (lib === 'VEE' || lib.startsWith('VEE')) {
                const before = paramMapGet(c.parameters, 'voltage', '').trim();
                if (before.length === 0) {
                    const want = intent.preferredVeeVoltage.length > 0
                        ? intent.preferredVeeVoltage
                        : (intent.dualSupply ? '-12V' : '');
                    if (want.length > 0) {
                        this.schematicEditor.setDeviceParam(c.id, 'voltage', want);
                        fixed++;
                        Logger.info(INSTR_TRACE_TAG, `[AI_DRIVE] VEE voltage (empty)→${want} ref=${c.refDes}`);
                    }
                }
            }
            if (lib.indexOf('SIGNAL_GEN') >= 0) {
                const beforeWf = paramMapGet(c.parameters, 'waveform', '').trim();
                if (beforeWf.length === 0 && intent.signalWaveform.length > 0) {
                    this.schematicEditor.setDeviceParam(c.id, 'waveform', intent.signalWaveform);
                    fixed++;
                    Logger.info(INSTR_TRACE_TAG, `[AI_DRIVE] SIGGEN waveform (empty)→${intent.signalWaveform} ref=${c.refDes}`);
                }
                const beforeAmp = paramMapGet(c.parameters, 'amplitude', '').trim();
                if (beforeAmp.length === 0) {
                    let fill = intent.preferredSignalAmplitude;
                    if (fill.length === 0 && intent.needsOpAmpIntegrator) {
                        fill = '5V';
                    }
                    if (fill.length === 0 && intent.needsHysteresisComparator) {
                        fill = resolveHysteresisSafeAmplitude('');
                    }
                    if (fill.length > 0) {
                        this.schematicEditor.setDeviceParam(c.id, 'amplitude', fill);
                        fixed++;
                        Logger.info(INSTR_TRACE_TAG, `[AI_DRIVE] SIGGEN amp (empty)→${fill} ref=${c.refDes}`);
                    }
                }
                else if (intent.needsHysteresisComparator || this.documentLikelyHysteresisComparator()) {
                    const safe = resolveHysteresisSafeAmplitude(beforeAmp);
                    if (safe !== beforeAmp) {
                        this.schematicEditor.setDeviceParam(c.id, 'amplitude', safe);
                        fixed++;
                        Logger.info(INSTR_TRACE_TAG, `[AI_DRIVE] SIGGEN amp ${beforeAmp}→${safe} (hysteresis safety) ref=${c.refDes}`);
                    }
                }
                if (intent.preferredSignalFrequency.length > 0) {
                    const before = paramMapGet(c.parameters, 'frequency', '').trim();
                    if (before.length === 0) {
                        this.schematicEditor.setDeviceParam(c.id, 'frequency', intent.preferredSignalFrequency);
                        fixed++;
                    }
                }
            }
        }
        if (fixed > 0) {
            this.autoWireSignalGenerators();
        }
        return fixed;
    }
    /**
     * @deprecated 使用 enforceElectricalParamsFromPrompt；保留兼容调用
     */
    enforceHysteresisSignalAmplitudeFromPrompt(prompt: string): number {
        return this.enforceElectricalParamsFromPrompt(prompt);
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
    /** 万用表按当前档位读取原始量（V / A / Ω） */
    readMultimeterRawForComponent(compInstId: string): number | null {
        const doc = this.schematicEditor.getDocument();
        const comp = doc.components.find(c => c.id === compInstId);
        if (comp === undefined) {
            return null;
        }
        const upper = comp.libraryId.toUpperCase();
        if (!upper.includes('VIRTUAL_METER') && upper !== 'MULTIMETER') {
            return null;
        }
        const kernel = this.simulationKernel as SimulationKernelImpl;
        const pinNets = getPinNetMap(compInstId, doc.nets);
        const netV = findNetForPinLabel(pinNets, 'V') ?? findNetForPinLabel(pinNets, 'V+');
        const netOhm = findNetForPinLabel(pinNets, 'OHM');
        const netCom = findNetForPinLabel(pinNets, 'COM') ?? findNetForPinLabel(pinNets, 'GND');
        const mode = (this.instruments as VirtualInstrumentsImpl).getMultimeterMode();
        if (mode === MultimeterMode.CURRENT) {
            return kernel.getBranchCurrent(compInstId);
        }
        if (mode === MultimeterMode.RESISTANCE || mode === MultimeterMode.DIODE) {
            if (netOhm === null || netCom === null) {
                return null;
            }
            const vAbs = Math.abs(kernel.getNetVoltageByUuid(netOhm) - kernel.getNetVoltageByUuid(netCom));
            if (mode === MultimeterMode.DIODE) {
                return vAbs;
            }
            const rNom = this.findResistorOhmsBetweenNets(doc, netOhm, netCom);
            if (rNom !== null) {
                return rNom;
            }
            const iSense = (1.0 - vAbs) / 1000.0;
            if (iSense < 1e-12) {
                return 1e9;
            }
            return vAbs / iSense;
        }
        if (netV === null || netCom === null) {
            return null;
        }
        return kernel.getNetVoltageByUuid(netV) - kernel.getNetVoltageByUuid(netCom);
    }
    /** OHM↔COM 之间若有 R_*，返回其欧姆值（二极管并联时电阻档用标称） */
    private findResistorOhmsBetweenNets(doc: SchematicDocument, netA: string, netB: string): number | null {
        const idsOnA = new Set<string>();
        const idsOnB = new Set<string>();
        for (let ni = 0; ni < doc.nets.length; ni++) {
            const n = doc.nets[ni];
            if (n.id !== netA && n.id !== netB) {
                continue;
            }
            for (let pi = 0; pi < n.pinIds.length; pi++) {
                const cid = n.pinIds[pi].split(':')[0];
                if (n.id === netA) {
                    idsOnA.add(cid);
                }
                else {
                    idsOnB.add(cid);
                }
            }
        }
        for (let ci = 0; ci < doc.components.length; ci++) {
            const c = doc.components[ci];
            if (!c.libraryId.startsWith('R_')) {
                continue;
            }
            if (!idsOnA.has(c.id) || !idsOnB.has(c.id)) {
                continue;
            }
            const fromId = UnitParser.parseResistance(c.libraryId.substring(2));
            if (fromId.valid && fromId.numeric > 0) {
                return fromId.numeric;
            }
            const fromParam = UnitParser.parseResistance(paramMapGet(c.parameters, 'resistance', ''));
            if (fromParam.valid && fromParam.numeric > 0) {
                return fromParam.numeric;
            }
        }
        return null;
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
     * 仿真中点动按键（按下闭合 / 松开断开）。555 单稳态应使用此路径，避免 toggle 清零定时电容。
     */
    setInteractiveSwitchPressed(componentId: string, pressed: boolean): string {
        if (!this.isSimulationActive()) {
            return '';
        }
        const kernel = this.simulationKernel as SimulationKernelImpl;
        const next = kernel.setInteractiveSwitchPressed(componentId, pressed);
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
     * 仿真中调节 DS18B20 实验温度（−55…125°C）。成功返回 "xx.x"，失败返回 ''。
     */
    setInteractiveSensorTemp(componentId: string, tempC: number): string {
        if (!this.isSimulationActive()) {
            return '';
        }
        const kernel = this.simulationKernel as SimulationKernelImpl;
        const next = kernel.setInteractiveSensorTemp(componentId, tempC);
        if (next.length > 0) {
            this.publishInteractiveCircuitRefresh('sensor', `temp_c=${next}`);
        }
        return next;
    }
    /** 仿真中点击霍尔传感器切换磁场（active 0/1）。 */
    toggleInteractiveHall(componentId: string): string {
        if (!this.isSimulationActive()) {
            return '';
        }
        const kernel = this.simulationKernel as SimulationKernelImpl;
        const next = kernel.toggleInteractiveHall(componentId);
        if (next.length > 0) {
            this.publishInteractiveCircuitRefresh('hall', `active=${next}`);
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
            const iBranch = kernel.getBranchCurrent(compInstId);
            if (Math.abs(iBranch) > 1e-15) {
                iA = iBranch;
            }
            else {
                iA = kernel.getNetCurrentByUuid(netIPlus);
            }
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
            if (lib.includes('VIRTUAL_METER') || lib === 'MULTIMETER') {
                const raw = this.readMultimeterRawForComponent(c.id);
                if (raw !== null) {
                    instr.multimeterSnapReading(raw);
                    const mode = instr.getMultimeterMode();
                    let unit = 'V';
                    if (mode === MultimeterMode.CURRENT) {
                        unit = 'A';
                    }
                    else if (mode === MultimeterMode.RESISTANCE) {
                        unit = 'Ω';
                    }
                    else if (mode === MultimeterMode.DIODE) {
                        unit = 'V';
                    }
                    meterSnaps.push({ refDes: c.refDes, kind: 'dmm', value: `${raw.toFixed(3)}${unit}` });
                    if (firstInstrId.length === 0) {
                        firstInstrId = c.id;
                    }
                }
                else {
                    meterSnaps.push({ refDes: c.refDes, kind: 'dmm', value: 'null' });
                }
            }
            else if (lib.includes('VOLTMETER')) {
                const delta = this.readVoltmeterDeltaForComponent(c.id, true);
                if (delta !== null) {
                    instr.voltmeterSnapReading(delta);
                    meterSnaps.push({ refDes: c.refDes, kind: 'vm', value: `${delta.toFixed(3)}V` });
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
            upperId.includes('WATT') || upperId.includes('FREQ') || upperId.includes('COUNTER') ||
            upperId.includes('UART') || upperId.includes('TERMINAL');
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
        else if (upperId.includes('VIRTUAL_METER') || upperId === 'MULTIMETER') {
            // 四端万用表：按档位切换 V / A / OHM 读数（与 readMultimeterRawForComponent 一致）
            const dmmId = compInstId;
            const self = this;
            binding.voltageReader = () => {
                const raw = self.readMultimeterRawForComponent(dmmId);
                return raw !== null ? raw : 0;
            };
        }
        else if (upperId.includes('VOLTMETER')) {
            const netPlus = findNetForPin('V+') ?? findNetForPin('V') ?? findNetForPin('PLUS') ?? findNetForPin('+') ??
                findNetForPin('PROBE1');
            const netCom = findNetForPin('COM') ?? findNetForPin('V-') ?? findNetForPin('-') ?? findNetForPin('GND') ??
                findNetForPin('PROBE2');
            if (netPlus !== null && netCom !== null) {
                const vPlusId = netPlus;
                const vComId = netCom;
                // 供面板波形：用仿真网电压差重建正弦，勿用 UI 200ms 抽点（1kHz 会混叠成乱跳）
                binding.scopeProbes[0] = vPlusId;
                binding.scopeProbes[1] = vComId;
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
                binding.scopeProbes[0] = netPlus;
                binding.scopeProbes[1] = netMinus;
                // scopeProbes[2] 存器件 id，便于匹配 I(compUuid) 仿真电流波
                binding.scopeProbes[2] = compInstId;
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
                    // Prefer series branch through stamped 0V I-path (same as ammeter)
                    const iBranch = kernel.getBranchCurrent(compInstId);
                    if (Math.abs(iBranch) > 1e-15) {
                        return iBranch;
                    }
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
        else if (upperId.includes('UART') || upperId.includes('TERMINAL')) {
            const tx = findNetForPin('TX') ?? findNetForPin('1');
            const rx = findNetForPin('RX') ?? findNetForPin('2');
            const gnd = findNetForPin('GND') ?? findNetForPin('3');
            if (tx !== null) {
                binding.scopeProbes[0] = tx;
            }
            if (rx !== null) {
                binding.scopeProbes[1] = rx;
            }
            if (gnd !== null && binding.scopeProbes[2].length === 0) {
                binding.scopeProbes[2] = gnd;
            }
            // lab_instruments TX↔RX 同网环回：无 MCU 时终端自发自收
            const loopback = tx !== null && rx !== null && tx === rx;
            (this.instruments as VirtualInstrumentsImpl).setUartLoopback(loopback);
            Logger.info(INSTR_TRACE_TAG, `[AI_GEN] UART bind ${comp.refDes} TX=${tx ?? '-'} RX=${rx ?? '-'} GND=${gnd ?? '-'} ` +
                `loopback=${loopback ? 1 : 0}`);
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
        // Editor doc is source of truth after LoadDocumentCommand (may not be same ref)
        const doc = editor.getDocument();
        this.currentProject.schematic = doc;
        ensureNetPinConnectivity(doc, doc.metadata.gridSize || 10, this.pinGeometryResolver());
        this.simulationKernel.loadSchematic(doc);
        traceProjectOpenAudit(path, this.currentProject.name, doc, editor.getViewport());
        traceDataFlow('LOAD', 'schematic→editor→netRebuild→kernel loadSchematic complete');
        if (this.currentProject.mcuDebugConfig) {
            this.hexDebugger.configure(this.currentProject.mcuDebugConfig);
        }
        // API 以全局金库为准；工程内遗留配置仅作一次性迁移
        this.migrateProjectAiConfigsToVaultIfNeeded();
        this.bindingPinHash.clear();
        this.resetInstrumentUiForProjectSwitch();
        this.autoWireAllInstruments();
        this.onProjectChanged();
        return true;
    }
    /** 切换工程时清仪器绑定，避免右侧面板沿用上一工程读数 */
    private resetInstrumentUiForProjectSwitch(): void {
        this.clearInstrumentReaders();
        (this.instruments as VirtualInstrumentsImpl).setUartLoopback(false);
        (this.instruments as VirtualInstrumentsImpl).clearComponentBindings();
    }
    /** 启动：从加密金库加载 API 并注入 manager */
    private loadAiApiVaultOnStartup(): void {
        const vault = AiApiVaultStore.getInstance();
        const configs = vault.loadConfigs();
        if (configs.length === 0) {
            // 禁止空金库清空已有 manager（避免重启/竞态把 Key 冲掉）
            const existing = this.aiApiManager.listApis();
            Logger.warn(INSTR_TRACE_TAG, `[AI_API] vault empty — keep manager configs=${existing.length}` +
                ` path=${vault.getVaultPath()}`);
            return;
        }
        this.aiApiManager.clearAllConfigs();
        for (let i = 0; i < configs.length; i++) {
            const cfg = configs[i];
            const addResult = this.aiApiManager.addApi(cfg);
            Logger.info(INSTR_TRACE_TAG, `[AI_API] vault→manager add id=${cfg.id} name=${cfg.name}` +
                ` ok=${addResult.success} keyLen=${cfg.apiKey ? cfg.apiKey.length : 0}`);
        }
        Logger.info(INSTR_TRACE_TAG, `[AI_API] vault startup restored ${configs.length} configs` +
            ` path=${vault.getVaultPath()}`);
    }
    /**
     * 旧工程内仍带 aiConfigs 时：金库为空则迁入；否则忽略工程内 Key。
     */
    private migrateProjectAiConfigsToVaultIfNeeded(): void {
        if (!this.currentProject) {
            return;
        }
        const projectCfgs = this.currentProject.aiConfigs ?? [];
        if (projectCfgs.length === 0) {
            return;
        }
        const vault = AiApiVaultStore.getInstance();
        const vaultCfgs = vault.loadConfigs();
        if (vaultCfgs.length === 0) {
            Logger.info(INSTR_TRACE_TAG, `[AI_API] migrate project→vault count=${projectCfgs.length}`);
            for (let i = 0; i < projectCfgs.length; i++) {
                this.aiApiManager.addApi(projectCfgs[i]);
            }
            this.persistAiApiVaultFromManager();
        }
        else {
            // 金库已有配置：按 id 合并缺失项，禁止静默丢弃工程内 Key
            let merged = 0;
            for (let i = 0; i < projectCfgs.length; i++) {
                const cfg = projectCfgs[i];
                const existing = this.aiApiManager.getApi(cfg.id);
                if (!existing.success) {
                    const addRes = this.aiApiManager.addApi(cfg);
                    if (addRes.success) {
                        merged++;
                    }
                }
            }
            Logger.info(INSTR_TRACE_TAG, `[AI_API] merge project→vault added=${merged}` +
                ` (vault had ${vaultCfgs.length}, project ${projectCfgs.length})`);
            if (merged > 0) {
                this.persistAiApiVaultFromManager();
            }
        }
        this.currentProject.aiConfigs = [];
    }
    private persistAiApiVaultFromManager(): boolean {
        const exported = this.aiApiManager.exportConfigs(false);
        if (!exported.success || !exported.data) {
            Logger.warn(INSTR_TRACE_TAG, `[AI_API] vault export FAILED: ${exported.error ?? 'empty'}`);
            return false;
        }
        try {
            const configs = JSON.parse(exported.data) as AiApiConfig[];
            return AiApiVaultStore.getInstance().saveConfigs(configs);
        }
        catch (e) {
            Logger.error(INSTR_TRACE_TAG, `[AI_API] vault export parse error: ${e}`);
            return false;
        }
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
        this.currentProject.aiConfigs = [];
        this.syncAiApiConfigsToProject(false);
    }
    /**
     * 将内存中的 API 配置加密写入全局金库（与工程文件分离）。
     * @param persistToDisk 为 true 时立即写金库（UI 保存 API）；
     *                      工程 save 传 false 时仍写金库，但 Key 不进 .schsim。
     */
    syncAiApiConfigsToProject(persistToDisk: boolean = true): void {
        if (this.currentProject) {
            this.currentProject.aiConfigs = [];
        }
        const exported = this.aiApiManager.exportConfigs(false);
        if (!exported.success || !exported.data) {
            Logger.warn(INSTR_TRACE_TAG, `[AI_API] sync→vault FAILED: ${exported.error ?? 'export empty'}`);
            return;
        }
        try {
            const configs = JSON.parse(exported.data) as AiApiConfig[];
            Logger.info(INSTR_TRACE_TAG, `[AI_API] sync→vault ok count=${configs.length}` +
                ` ids=[${configs.map(c => c.id).join(',')}]`);
            if (persistToDisk || configs.length > 0) {
                const ok = AiApiVaultStore.getInstance().saveConfigs(configs, persistToDisk && configs.length === 0);
                Logger.info(INSTR_TRACE_TAG, `[AI_API] persist→vault ${ok ? 'OK' : 'FAIL'} path=${AiApiVaultStore.getInstance().getVaultPath()}`);
            }
        }
        catch (e) {
            Logger.error(INSTR_TRACE_TAG, `[AI_API] sync→vault parse error: ${e}`);
        }
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
    enableAutoSave(path: string, intervalMs: number = AppService.AUTOSAVE_INTERVAL_MS): void {
        this.workingAutoSavePath = path;
        this.filePersistence.enableAutoSave(intervalMs, path, () => {
            this.syncProjectFromModules();
            return this.currentProject;
        });
    }
    disableAutoSave(): void {
        this.filePersistence.disableAutoSave();
        this.workingAutoSavePath = '';
    }
    getWorkingAutoSavePath(): string {
        if (this.workingAutoSavePath.length > 0) {
            return this.workingAutoSavePath;
        }
        return (this.filePersistence as FilePersistenceImpl).getAutoSavePath();
    }
    /** 正式工程路径；无则回落到 autosave 工作副本 */
    getEffectiveSessionPath(): string {
        if (this.currentProjectPath.length > 0) {
            return this.currentProjectPath;
        }
        return this.getWorkingAutoSavePath();
    }
    /** 编辑后防抖写入 autosave 工作副本 */
    async persistWorkingCopy(): Promise<boolean> {
        if (this.currentProject === null) {
            return false;
        }
        this.syncProjectFromModules();
        return (this.filePersistence as FilePersistenceImpl).saveAutoSaveNow();
    }
    /**
     * 退出/切后台：写 autosave + recovery + session。
     * closedCleanly=true 表示正常退出；false 表示异常/编辑中，下次启动走恢复。
     */
    async flushProjectProtection(closedCleanly: boolean): Promise<void> {
        if (this.currentProject === null) {
            return;
        }
        await this.persistWorkingCopy();
        await this.saveRecoveryCache();
        const projectName = this.currentProject.name.length > 0
            ? this.currentProject.name
            : 'Untitled';
        const autoPath = this.getWorkingAutoSavePath();
        await this.saveSession(this.currentProjectPath, projectName, closedCleanly, autoPath);
    }
    /** 启动时标记 session 为运行中（非正常关闭），供下次 crash 检测 */
    async markSessionRunning(): Promise<void> {
        const session = await this.loadSession();
        if (session === null) {
            return;
        }
        const autoPath = session.autoSavePath !== undefined && session.autoSavePath.length > 0
            ? session.autoSavePath
            : this.getWorkingAutoSavePath();
        await this.saveSession(session.lastPath, session.lastProjectName, false, autoPath);
    }
    getFilePersistenceImpl(): FilePersistenceImpl {
        return this.filePersistence as FilePersistenceImpl;
    }
    async loadSession(): Promise<SessionState | null> {
        return (this.filePersistence as FilePersistenceImpl).loadSessionState();
    }
    async saveSession(path: string, projectName: string, closedCleanly: boolean, autoSavePath: string = ''): Promise<void> {
        const autoPath = autoSavePath.length > 0 ? autoSavePath : this.getWorkingAutoSavePath();
        await (this.filePersistence as FilePersistenceImpl)
            .saveSessionState(path, projectName, closedCleanly, autoPath);
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
        this.cancelScheduledErc();
        const topo = this.getTopology();
        const errors = this.schematicEditor.runERC(topo, true);
        // 与 AI 流水线对齐：合并 FaultDiagnoser（短路/GPIO/仪器等 DeepErc 未覆盖项）
        const doc = this.schematicEditor.getDocument();
        const violations = FaultDiagnoser.diagnose(doc);
        for (let i = 0; i < violations.length; i++) {
            const v = violations[i];
            const target = v.componentId !== undefined && v.componentId.length > 0
                ? v.componentId
                : (v.netId ?? '');
            const already = errors.some(e => e.desc === v.message && e.targetUuid === target);
            if (already) {
                continue;
            }
            let severity: 'error' | 'warning' | 'info' | 'critical' = 'info';
            if (v.severity === 'error') {
                severity = 'error';
            }
            else if (v.severity === 'warning') {
                severity = 'warning';
            }
            errors.push({
                errType: v.ruleType,
                targetUuid: target,
                desc: v.message,
                suggest: v.fixSuggestion ?? '',
                severity: severity
            });
        }
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
    /** 工程切换后延迟 ERC，避免与模板加载/画布刷新叠在同一 MMITask */
    scheduleRuntimeErc(delayMs: number = 80): void {
        this.cancelScheduledErc();
        this.scheduledErcTimer = setTimeout((): void => {
            this.scheduledErcTimer = -1;
            void (async (): Promise<void> => {
                await MainThreadYield.yield();
                this.runErc(false);
            })();
        }, delayMs);
    }
    private cancelScheduledErc(): void {
        if (this.scheduledErcTimer >= 0) {
            clearTimeout(this.scheduledErcTimer);
            this.scheduledErcTimer = -1;
        }
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
    /** 最近一次仿真启动失败文案（供弹窗）；无失败则为空串 */
    getLastSimStartFailReason(): string {
        return this.lastSimStartFailReason;
    }
    private failSimStart(reason: string): boolean {
        this.lastSimStartFailReason = reason;
        this.onStatusMessage(reason);
        return false;
    }
    async startSimulation(): Promise<boolean> {
        if (this.simStartBusy) {
            return this.failSimStart('仿真正在启动，请稍候');
        }
        this.simStartBusy = true;
        this.cancelScheduledErc();
        this.lastSimStartFailReason = '';
        try {
            // Let MMI/watchdog breathe before heavy sync work
            await MainThreadYield.yield();
            // runERC rebuilds pin connectivity once — do not triple-rebuild before it
            const ercErrors = this.schematicEditor.runERC();
            const critical = ercErrors.filter(e => e.severity === 'error' || e.severity === 'critical');
            if (critical.some(e => e.desc.includes('短路'))) {
                return this.failSimStart('存在短路错误，禁止启动仿真');
            }
            await MainThreadYield.yield();
            let doc = this.schematicEditor.getDocument();
            const gate = this.evaluateSimConnectivityGate(doc);
            Logger.info(INSTR_TRACE_TAG, `[SIM_CONN] nets=${gate.netCount} rails=${gate.railCount} labels=${gate.labelCount} ` +
                `pinRefs=${gate.pinRefCount} floatingPins=${gate.floatingPinCount} ` +
                `dupRails=${gate.duplicateRailNames.join(',') || 'none'}`);
            if (gate.duplicateRailNames.length > 0) {
                Logger.warn(INSTR_TRACE_TAG, `[SIM_CONN_BLOCK] dupRails=${gate.duplicateRailNames.join(',')}`);
                return this.failSimStart(`电源轨重复未合并: ${gate.duplicateRailNames.join(', ')}，禁止启动仿真`);
            }
            if (gate.hardUnconnected.length > 0) {
                Logger.warn(INSTR_TRACE_TAG, `[SIM_CONN_BLOCK] hard=${gate.hardUnconnected.join(',')}`);
                const hints = gate.hardUnconnected.slice(0, 3).map((h: string): string => {
                    if (h.includes('缺GND') || h.includes('缺COM')) {
                        return `${h}（示波器/信号源/表计须接 GND/COM 回线）`;
                    }
                    return h;
                });
                return this.failSimStart(`关键脚未连网: ${hints.join('; ')}，禁止启动仿真`);
            }
            if (gate.floatingPinCount > 0) {
                this.onStatusMessage(`拓扑已重建，${gate.floatingPinCount} 脚未连（可运行，结果可能不准）`);
            }
            const topo = this.getTopology();
            const cfg = defaultSimConfig();
            await MainThreadYield.yield();
            // Pass editor doc so MNA sees OUT1/AC+ pin names (topo round-trip alone loses them)
            const result = this.simulationKernel.startSimulation(topo, cfg, (p) => {
                this.onAiProgress(p);
            }, doc);
            if (!result.success) {
                Logger.warn(INSTR_TRACE_TAG, `[SIM_START_FAIL] ${result.error ?? 'unknown'}`);
                return this.failSimStart(`仿真启动失败: ${result.error ?? '未知错误'}`);
            }
            this.schematicEditor.setSimBusy(true);
            this.simStepCount = 0;
            this.onStatusMessage('仿真运行中...');
            // Drop stale scope history / CH2 ghost probes from prior templates
            this.instruments.clearOscilloscopeCapture();
            InstrumentWaveExpandStore.getInstance().clearSession();
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
            // AC warm-up: previously 1 step/frame left the scope flat for minutes; pre-fill a few ms
            await MainThreadYield.yield();
            kernel.runBudgetSteps(10);
            await MainThreadYield.yield();
            kernel.runBudgetSteps(10);
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
        finally {
            this.simStartBusy = false;
        }
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
        // Keep live voltage map fresh every frame (scope UUID↔NET alias matching)
        const branchCurrents = kernel.getBranchCurrentMap();
        (this.instruments as VirtualInstrumentsImpl).feedScopeNodeData(voltages, branchCurrents);
        // Waves every frame when present — scope needs fresh ring; clone is cheap vs SPICE
        let waves: WaveData[] = kernel.getAllWaveData();
        if (waves.length > 0) {
            this.instruments.feedSimulationWaves(waves);
            if (this.simStepCount % 4 === 0) {
                CallbackRegistry.getInstance().emitWave(waves);
            }
        }
        if (this.simStepCount % 4 === 0) {
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
            if (lib.includes('VIRTUAL_METER') || lib === 'MULTIMETER') {
                const raw = this.readMultimeterRawForComponent(c.id);
                if (raw !== null) {
                    instr.multimeterFeedSample(raw);
                }
            }
            else if (lib.includes('VOLTMETER')) {
                const delta = this.readVoltmeterDeltaForComponent(c.id, true);
                if (delta !== null) {
                    instr.voltmeterFeedSample(delta);
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
            else if (lib.includes('FREQ') || lib.includes('COUNTER')) {
                const pinNets = getPinNetMap(c.id, doc.nets);
                const netSig = findNetForPinLabel(pinNets, 'IN') ?? findNetForPinLabel(pinNets, 'SIG') ??
                    findNetForPinLabel(pinNets, 'INPUT') ?? findNetForPinLabel(pinNets, '+');
                if (netSig !== null) {
                    instr.freqCounterFeedSignalSample(kernel.getNetVoltageByUuid(netSig));
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
    /**
     * Sync instrument-panel SignalGen engine from schematic SIGNAL_GEN params.
     * Do NOT register a second Vsrc (AnalogEngine already stamps Vn from parameters).
     * Former hardcode registerSignalSource('SIGGEN', …, 'sin', …) fought the stamped source.
     */
    private autoWireSignalGenerators(): void {
        const doc = this.schematicEditor.getDocument();
        for (const comp of doc.components) {
            const libUpper = comp.libraryId.toUpperCase();
            if (libUpper !== 'SIGNAL_GEN' && !libUpper.startsWith('SIGNAL_GEN')) {
                continue;
            }
            const wfRaw = paramMapGet(comp.parameters, 'waveform', 'sine');
            const wfNorm = UnitParser.validateParam('waveform', wfRaw).normalized;
            let enumWf = SignalWaveform.SINE;
            if (wfNorm === 'square') {
                enumWf = SignalWaveform.SQUARE;
            }
            else if (wfNorm === 'triangle') {
                enumWf = SignalWaveform.TRIANGLE;
            }
            else if (wfNorm === 'saw' || wfNorm === 'sawtooth') {
                enumWf = SignalWaveform.SAW;
            }
            else if (wfNorm === 'pulse') {
                enumWf = SignalWaveform.PULSE;
            }
            this.instruments.setWaveform(enumWf);
            const freqP = UnitParser.parseFrequency(paramMapGet(comp.parameters, 'frequency', '1kHz'));
            const amp = parseFloat(paramMapGet(comp.parameters, 'amplitude', '1V').replace(/[Vv]/g, ''));
            const off = parseFloat(paramMapGet(comp.parameters, 'offset', '0V').replace(/[Vv]/g, ''));
            const duty = parseFloat(paramMapGet(comp.parameters, 'dutyCycle', '50%').replace(/%/g, ''));
            if (freqP.valid && Number.isFinite(amp) && Number.isFinite(off) && Number.isFinite(duty)) {
                this.instruments.setParams({
                    frequency: freqP.numeric,
                    amplitude: amp,
                    offset: off,
                    dutyCycle: duty,
                    phase: 0
                });
            }
            Logger.info(INSTR_TRACE_TAG, `[SIGGEN] sync UI←schematic ref=${comp.refDes} wf=${wfNorm} ` +
                `f=${paramMapGet(comp.parameters, 'frequency', '1kHz')} ` +
                `amp=${paramMapGet(comp.parameters, 'amplitude', '1V')}`);
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
        this.appendAiGenLog('system', '生成中，禁止手动放置器件（复杂问题 AI 可能需较长时间，请耐心等待）');
        this.onStatusMessage('AI 生成中，请耐心等待（复杂电路可能数分钟）');
        return true;
    }
    cancelAiGenerate(): void {
        if (!this.aiGenerating && !this.aiGenCancelRequested) {
            return;
        }
        this.aiGenCancelRequested = true;
        this.aiGenEpoch++;
        this.aiEngine.cancelAiTask();
        Logger.info(INSTR_TRACE_TAG, '[AI_GEN] CANCEL immediate — unlock UI + abort HTTP');
        traceAiOp('AI_GEN', 'cancel_immediate', 'unlock+abort');
        // 立刻解锁 UI，不等待当前 LLM HTTP 自然结束
        if (this.aiGenerating) {
            this.aiGenerating = false;
            (this.schematicEditor as SchematicEditorImpl).setReadOnly(false);
            this.onAiGeneratingChanged(false);
        }
        this.appendAiGenLog('assistant', '已取消生成');
        this.onStatusMessage('AI 生成已取消');
    }
    isAiSelfCheckPromptPending(): boolean {
        return this.aiSelfCheckPromptPending;
    }
    dismissAiSelfCheckPrompt(): void {
        this.aiSelfCheckPromptPending = false;
    }
    /**
     * AI 自检修复：拓扑重建 + ERC 自动修 + 诊断日志。
     * 可由生成结束后的弹窗或面板按钮触发。
     */
    async aiSelfCheckAndFix(): Promise<boolean> {
        if (this.aiGenerating) {
            this.onStatusMessage('AI 正在运行，请稍候');
            return false;
        }
        this.aiSelfCheckPromptPending = false;
        this.aiGenerating = true;
        this.aiGenCancelRequested = false;
        (this.schematicEditor as SchematicEditorImpl).setReadOnly(true);
        this.onAiGeneratingChanged(true);
        this.appendAiGenLog('system', '开始 AI 自检修复 · 画布已锁定');
        this.onStatusMessage('AI 自检修复中…');
        Logger.info(INSTR_TRACE_TAG, '[AI_GEN] self_check START');
        traceAiOp('AI_GEN', 'self_check_start', 'canvas locked');
        try {
            const editor = this.schematicEditor as SchematicEditorImpl;
            editor.rebuildNetPinConnectivity();
            let doc = editor.getDocument();
            const grid = doc.metadata.gridSize || 10;
            ensureNetPinConnectivity(doc, grid, this.pinGeometryResolver());
            editor.loadDocument(doc);
            this.appendAiGenLog('assistant', '已重建脚网连通 (ensureNetPinConnectivity)');
            traceAiOp('AI_GEN', 'self_check_pinconn', `wires=${doc.wires.length} nets=${doc.nets.length}`);
            const before = this.runErc(false);
            const beforeErr = before.filter(e => e.severity === 'error' || e.severity === 'critical').length;
            this.appendAiGenLog('assistant', `自检前 ERC: ${before.length} 条（错误 ${beforeErr}）`);
            for (let i = 0; i < Math.min(before.length, 10); i++) {
                this.appendAiGenLog('system', `  · [${before[i].severity}] ${before[i].desc}${before[i].suggest ? ' → ' + before[i].suggest : ''}`);
            }
            const after = this.runErc(true);
            const afterErr = after.filter(e => e.severity === 'error' || e.severity === 'critical').length;
            this.appendAiGenLog('assistant', `自动修复后 ERC: ${after.length} 条（错误 ${afterErr}，此前 ${beforeErr}）`);
            // 语义再建网：生产自检禁止 SemanticNetBuilder（会覆盖/冒充 LLM 网表）
            const beforeWires = editor.getDocument().wires.length;
            const beforeNets = editor.getDocument().nets.length;
            this.appendAiGenLog('assistant', `跳过 SemanticNetBuilder（nets=${beforeNets} wires=${beforeWires}；自检仅 ERC/FixKit/ensureNetPin）`);
            traceAiOp('AI_GEN', 'self_check_rebuild_net', 'skipped_refuse_semantic_rebuild');
            const afterNet = this.runErc(false);
            const afterNetErr = afterNet.filter(e => e.severity === 'error' || e.severity === 'critical').length;
            // 诊断器补充
            const topo = this.getTopology();
            const diag = await (this.aiEngine as AiEngineImpl).aiStaticDiagnose(topo);
            if (diag.success && diag.data !== undefined && diag.data.length > 0) {
                const n = Math.min(diag.data.length, 8);
                this.appendAiGenLog('assistant', `静态诊断 ${diag.data.length} 条:`);
                for (let i = 0; i < n; i++) {
                    this.appendAiGenLog('system', `  · ${diag.data[i].errorDesc}${diag.data[i].repairSuggest ? ' | 建议: ' + diag.data[i].repairSuggest : ''}`);
                }
            }
            editor.fitAllInView();
            this.syncProjectFromModules();
            this.reloadSimulationFromSchematic();
            this.onProjectChanged();
            const remaining = afterNetErr;
            if (remaining > 0) {
                this.appendAiGenLog('system', `仍有 ${remaining} 项硬错误未消除；可修改提示词后重新「生成整图」`);
            }
            else {
                this.appendAiGenLog('system', '自检修复完成，未发现硬错误');
            }
            this.appendAiGenLog('system', '画布已解锁');
            this.onStatusMessage(remaining > 0
                ? `自检完成，仍有 ${remaining} 项错误`
                : 'AI 自检修复完成');
            Logger.info(INSTR_TRACE_TAG, `[AI_GEN] self_check END remainingErrors=${remaining}`);
            traceAiOp('AI_GEN', 'self_check_end', `remainingErrors=${remaining}`);
            this.endAiGenerate(true);
            return remaining === 0;
        }
        catch (e) {
            const msg = `${e}`;
            this.appendAiGenLog('assistant', `自检异常: ${msg}`);
            Logger.error(INSTR_TRACE_TAG, `[AI_GEN] self_check EXCEPTION ${msg}`);
            this.endAiGenerate(false);
            this.onStatusMessage(`自检异常: ${msg}`);
            return false;
        }
    }
    /** 评估首次落图是否需要弹出自检询问（含功能影响 warning） */
    private evaluatePostGenerateIssues(erc: ErcError[]): AiPostGenerateIssues {
        const hard = AiErcGateUtil.filterBlocking(erc);
        const doc = this.schematicEditor.getDocument();
        let floatingPins = 0;
        for (let i = 0; i < doc.nets.length; i++) {
            if (doc.nets[i].pinIds.length === 0 && doc.nets[i].name.toUpperCase() !== 'VCC' &&
                doc.nets[i].name.toUpperCase() !== 'GND') {
                floatingPins++;
            }
        }
        const noWires = doc.components.length > 0 && doc.wires.length === 0;
        const count = hard.length + (noWires ? 1 : 0) + (floatingPins > 2 ? 1 : 0);
        const bits: string[] = [];
        if (hard.length > 0) {
            bits.push(`ERC阻断 ${hard.length}`);
        }
        if (noWires) {
            bits.push('无导线');
        }
        if (floatingPins > 2) {
            bits.push(`空脚网 ${floatingPins}`);
        }
        const result: AiPostGenerateIssues = {
            needAsk: count > 0,
            count: count,
            summary: bits.length > 0 ? bits.join(' · ') : '无明显硬错误'
        };
        return result;
    }
    async aiGenerateCircuit(prompt: string): Promise<boolean> {
        return this.aiGenerateCircuitFromPrompt(prompt, 'replace');
    }
    /** 清除多轮对话历史，下次生成将从零开始（create 模式） */
    clearAiConversation(): void {
        this.aiConversationHistory = [];
        Logger.info(INSTR_TRACE_TAG, '[AI_GEN] conversation history cleared');
    }
    /** 画布器件数（供「修改现有图」入口校验） */
    getSchematicComponentCount(): number {
        return (this.schematicEditor as SchematicEditorImpl).getDocument().components.length;
    }
    /** 获取当前对话轮次（0 表示无历史） */
    getAiConversationRound(): number {
        return Math.floor(this.aiConversationHistory.length / 2);
    }
    /**
     * 提示词 → 一键生成整图（选型→摆放→连线）。
     * mode=replace 清空后替换；append 合并到当前空白区；edit 基于当前画布增量修改后写回。
     */
    async aiGenerateCircuitFromPrompt(prompt: string, mode: AiGenerateMode, strategy: AiGenerateStrategy = 'oneshot'): Promise<boolean> {
        const trimmed = prompt.trim();
        if (trimmed.length === 0) {
            this.onStatusMessage('请输入提示词');
            return false;
        }
        if (this.aiGenerating) {
            this.onStatusMessage('AI 正在生成中，请耐心等待');
            return false;
        }
        if (mode === 'edit') {
            const curN = (this.schematicEditor as SchematicEditorImpl).getDocument().components.length;
            if (curN === 0) {
                this.onStatusMessage('画布为空，无法在现有图上修改，请先生成或放置电路');
                Logger.warn(INSTR_TRACE_TAG, '[AI_GEN] edit blocked | empty canvas');
                return false;
            }
        }
        if (this.aiApiManager.isQuotaWarningActive()) {
            this.appendAiGenLog('system', 'AI 用量已达 80%，请注意额度');
        }
        this.beginAiGenerate(trimmed, mode);
        const genSession = this.aiGenEpoch;
        this.lastAiPrompt = trimmed;
        Logger.info(INSTR_TRACE_TAG, `[AI_GEN] START mode=${mode} strategy=${strategy} promptLen=${trimmed.length}` +
            ` apis=${this.aiApiManager.listApis().length}`);
        traceAiPayload('AI_GEN', 'USER', trimmed, `mode=${mode} strategy=${strategy}`);
        traceAiOp('AI_GEN', 'generate_start', `mode=${mode} strategy=${strategy} apis=${this.aiApiManager.listApis().length}`);
        try {
            // 替换/追加/模块并行：从 create 起步，清多轮历史，避免误入 edit
            if (mode !== 'edit' && this.aiConversationHistory.length > 0) {
                this.aiConversationHistory = [];
                Logger.info(INSTR_TRACE_TAG, `[AI_GEN] conversation cleared for mode=${mode} strategy=${strategy}`);
            }
            // 仅显式 edit 走增量修改（「修改现有图」或对话框「在现有图上 AI 更改」）
            const isEditMode = mode === 'edit';
            const hasHistory = isEditMode && this.aiConversationHistory.length > 0;
            // 编辑模式强制 oneshot（与模块并行设计一致）
            let effectiveStrategy: AiGenerateStrategy = strategy;
            if (isEditMode && strategy === 'modular') {
                effectiveStrategy = 'oneshot';
                this.appendAiGenLog('system', '在现有图上更改：已改用「整图一次」（编辑模式不支持模块并行）');
                Logger.info(INSTR_TRACE_TAG, '[AI_GEN] edit mode forces oneshot');
            }
            let runTopo: SchTopology;
            if (isEditMode) {
                // 编辑模式: 基于当前画布拓扑进行真正增量修改（非整图重生成）
                const editor = this.schematicEditor as SchematicEditorImpl;
                runTopo = TopologyAdapter.toTopology(editor.getDocument());
                runTopo.schName = 'AI Edited';
                const roundHint = hasHistory
                    ? `多轮对话 · 第${this.aiConversationHistory.length / 2 + 1}轮 · `
                    : '基于画布现有电路 · ';
                this.appendAiGenLog('system', `${roundHint}增量编辑：保留现有 ${runTopo.deviceList.length} 器件` +
                    `/${runTopo.netList.length} 网/${runTopo.wireList.length} 线，只改需求相关部分`);
                Logger.info(INSTR_TRACE_TAG, `[AI_GEN] edit incremental | keepDevs=${runTopo.deviceList.length}` +
                    ` nets=${runTopo.netList.length} wires=${runTopo.wireList.length}`);
            }
            else {
                runTopo = emptySchTopology();
                runTopo.schName = 'AI Generated';
            }
            runTopo.bgColor = '#FFFFFF';
            if (effectiveStrategy === 'modular') {
                this.appendAiGenLog('system', '模块并行：整体设计 → 真并行生图 → 跨模块网络标号合并');
            }
            traceAiOp('AI_GEN', 'run_full_pipeline', `TASK_FULL_PIPELINE mode=${isEditMode ? 'edit-incremental' : 'create'} strategy=${effectiveStrategy}`);
            if (isEditMode) {
                this.appendAiGenLog('system', '流水线：edit incremental（跳过全量选型/摆放）');
            }
            const result = await this.aiEngine.runAiTask(AiTaskType.TASK_FULL_PIPELINE, runTopo, {
                prompt: trimmed, scene: 'text_gen',
                generateStrategy: effectiveStrategy,
                onStreamSnapshot: (snapshot: SchTopology, stage: string) => {
                    this.handleStreamSnapshot(snapshot, stage);
                },
                conversationHistory: isEditMode ? [...this.aiConversationHistory] : undefined,
                generationMode: isEditMode ? 'edit' : 'create'
            }, (p) => this.handleAiGenProgress(p));
            if (genSession !== this.aiGenEpoch || this.aiGenCancelRequested ||
                result.errCode === ErrCode.ERR_ASYNC_CANCEL ||
                (result.errMsg ?? '').indexOf('cancelled') >= 0 ||
                (result.errMsg ?? '').indexOf('取消') >= 0) {
                if (this.aiGenerating) {
                    this.endAiGenerate(false);
                }
                else {
                    this.aiGenCancelRequested = false;
                }
                traceAiOp('AI_GEN', 'generate_cancel', genSession !== this.aiGenEpoch ? 'stale session' : 'user cancelled');
                this.onStatusMessage('AI 生成已取消');
                return false;
            }
            if (!result.success || !result.topology) {
                // 仅真正失败（无拓扑 / API / 选型）——不再以「生图未完成」门禁中止
                this.appendAiGenLog('assistant', `生成失败: ${result.errMsg || '未知错误'}`);
                Logger.error(INSTR_TRACE_TAG, `[AI_GEN] FAILED err=${result.errMsg || 'unknown'} code=${result.errCode}`);
                traceAiOp('AI_GEN', 'generate_fail', `err=${result.errMsg || 'unknown'} code=${result.errCode}`);
                if ((result.errMsg ?? '').indexOf('流水线异常') >= 0 ||
                    (result.errMsg ?? '').indexOf('toUpperCase') >= 0) {
                    traceAiDiag('AI_GEN', 'fail_hint', [
                        '搜 instr_trace: [AI_TASK] EXCEPTION / [AI_PIPE] STAGE / DIAG|exception',
                        'STAGE=最后成功阶段；exception 含 stack',
                        'net_plan_drop / topo_bad_* 可看空字段'
                    ], 8);
                }
                this.endAiGenerate(false);
                this.onStatusMessage(result.errMsg || 'AI 生成失败');
                return false;
            }
            const analysis = result.analysisText ?? '';
            // 必须来自真实 LLM：结构化 usedLlm（禁止仅靠 analysisText 子串）
            if (result.usedLlm === false) {
                const msg = 'AI API 未返回有效结果（已禁用模板回退）。请检查 API 配置与连通性测试。';
                this.appendAiGenLog('assistant', msg);
                Logger.error(INSTR_TRACE_TAG, `[AI_GEN] REJECT non-LLM topology | ${analysis}`);
                traceAiOp('AI_GEN', 'generate_reject_non_llm', analysis);
                this.endAiGenerate(false);
                this.onStatusMessage(msg);
                return false;
            }
            Logger.info(INSTR_TRACE_TAG, `[AI_GEN] OK mode=${mode} devices=${result.topology.deviceList.length}` +
                ` nets=${result.topology.netList.length} wires=${result.topology.wireList.length}` +
                ` residual=${!!result.deliveredWithResidual} | ${analysis}`);
            if (isEditMode) {
                this.appendAiGenLog('system', `增量编辑写回：${result.topology.deviceList.length} 器件 / ` +
                    `${result.topology.netList.length} 网 / ${result.topology.wireList.length} 线`);
            }
            traceAiPayload('AI_GEN', 'ASSISTANT', analysis, `devices=${result.topology.deviceList.length} wires=${result.topology.wireList.length}` +
                ` residual=${!!result.deliveredWithResidual}`);
            this.appendTopologySummary(result.topology, analysis);
            if (mode === 'append') {
                traceAiOp('AI_GEN', 'load_topology', 'mode=append merge');
                const generatedDoc = TopologyAdapter.fromTopology(result.topology);
                const editor = this.schematicEditor as SchematicEditorImpl;
                const currentDoc = editor.getDocument();
                TemplateMergeUtil.mergeTemplateInto(currentDoc, generatedDoc);
                editor.loadDocument(currentDoc);
            }
            else {
                // replace / edit：整图写回（edit 为增量修改后的完整拓扑）
                traceAiOp('AI_GEN', 'load_topology', `mode=${mode}`);
                this.schematicEditor.loadTopology(result.topology);
            }
            const editor = this.schematicEditor as SchematicEditorImpl;
            editor.rebuildNetPinConnectivity();
            const doc = editor.getDocument();
            const grid = doc.metadata.gridSize || 10;
            ensureNetPinConnectivity(doc, grid, this.pinGeometryResolver());
            editor.loadDocument(doc);
            // 落图后连通性审计：统计无脚入网的器件
            tracePerPinConnectivity(doc);
            let floatingComps = 0;
            for (let ci = 0; ci < doc.components.length; ci++) {
                const c = doc.components[ci];
                if (c.libraryId === 'VCC' || c.libraryId === 'GND') {
                    continue;
                }
                const pinNets = getPinNetMap(c.id, doc.nets);
                if (pinNets.size === 0) {
                    floatingComps++;
                }
            }
            Logger.info(INSTR_TRACE_TAG, `[AI_GEN] post-load wires=${doc.wires.length} nets=${doc.nets.length}` +
                ` floatingNonPower=${floatingComps}`);
            traceAiOp('AI_GEN', 'post_load', `wires=${doc.wires.length} nets=${doc.nets.length} floatingNonPower=${floatingComps}`);
            if (floatingComps > 0) {
                this.appendAiGenLog('system', `落图完成，但有 ${floatingComps} 个器件暂无引脚入网 — 已触发自检修复提示（不中止交付）。`);
                this.aiSelfCheckPromptPending = true;
                this.onAiSelfCheckNeeded(floatingComps, `${floatingComps} 器件无脚入网`);
                Logger.warn(INSTR_TRACE_TAG, `[AI_GEN] post-load floatingNonPower=${floatingComps} — deliver anyway`);
                traceAiOp('AI_GEN', 'generate_deliver_floating', `floatingNonPower=${floatingComps}`);
            }
            this.schematicEditor.fitAllInView();
            this.syncProjectFromModules();
            // 无论仿真是否已开：先绑定仪器网脚，再尝试 reload
            this.bindingPinHash.clear();
            this.autoWireAllInstruments();
            // AI 全权驱动：只补空电参 + 滞回幅度安全底线，再同步仪器引擎/面板
            const elecFixed = this.enforceElectricalParamsFromPrompt(trimmed);
            if (elecFixed > 0) {
                this.appendAiGenLog('system', `已补齐空电参/滞回安全幅度（共 ${elecFixed} 处；未覆盖 AI 已写值）`);
            }
            this.autoWireSignalGenerators();
            Logger.info(INSTR_TRACE_TAG, '[AI_GEN] post-load instrument bindings refreshed (all instruments)');
            this.reloadSimulationFromSchematic();
            const erc = this.runErc(false);
            const errN = AiErcGateUtil.countBlocking(erc);
            const warnN = erc.filter(e => e.severity === 'warning' && !AiErcGateUtil.isBlocking(e)).length;
            this.appendAiGenLog('assistant', `落图完成 · 模式=${this.aiModeLabel(mode)} · ERC 阻断 ${errN} / 软警告 ${warnN}` +
                ` · 悬空器件 ${floatingComps}`);
            // 用户硬要求：不许「生图未完成」中止 — 有残留则提示自检，仍算交付成功
            if (errN > 0) {
                const issues = this.evaluatePostGenerateIssues(erc);
                this.aiSelfCheckPromptPending = true;
                this.appendAiGenLog('system', `生图已交付；落图后仍有 ${errN} 条提示项（${issues.summary}）。` +
                    `可点「AI 自检修复」继续完善。`);
                this.onAiSelfCheckNeeded(issues.count, issues.summary);
                Logger.warn(INSTR_TRACE_TAG, `[AI_GEN] DELIVER with residual ercBlocking=${errN}`);
                traceAiOp('AI_GEN', 'generate_deliver_residual_erc', `ercBlocking=${errN}`);
            }
            else {
                const issues = this.evaluatePostGenerateIssues(erc);
                if (issues.needAsk) {
                    this.aiSelfCheckPromptPending = true;
                    this.appendAiGenLog('system', `首次布局检测到问题（${issues.summary}）。可点击「AI 自检修复」或确认弹窗进行修复。`);
                    this.onAiSelfCheckNeeded(issues.count, issues.summary);
                }
                else {
                    this.appendAiGenLog('system', 'ERC 阻断项清零 · 生图过程完整；仍可手动「AI 自检修复」');
                }
            }
            // 多轮对话: 记录本轮对话历史
            const userEntry: ChatHistoryEntry = { role: 'user', content: trimmed };
            this.aiConversationHistory.push(userEntry);
            const summary = `${result.topology.deviceList.length}器件, ${result.topology.wireList.length}导线`;
            const asstEntry: ChatHistoryEntry = { role: 'assistant', content: `已生成: ${summary}` };
            this.aiConversationHistory.push(asstEntry);
            Logger.info(INSTR_TRACE_TAG, `[AI_GEN] conversation history size=${this.aiConversationHistory.length}`);
            this.appendAiGenLog('system', '画布已解锁');
            this.onProjectChanged();
            this.onStatusMessage(errN === 0
                ? `AI 闭环完成: ${result.topology.deviceList.length} 器件, ${result.topology.wireList.length} 导线 · ERC 清零`
                : `AI 已交付: ${result.topology.deviceList.length} 器件, ${result.topology.wireList.length} 导线 · 残留 ${errN} 项可自检修复`);
            this.endAiGenerate(true);
            return true;
        }
        catch (e) {
            if (genSession !== this.aiGenEpoch || this.aiGenCancelRequested) {
                if (this.aiGenerating) {
                    this.endAiGenerate(false);
                }
                else {
                    this.aiGenCancelRequested = false;
                }
                this.onStatusMessage('AI 生成已取消');
                return false;
            }
            const msg = e instanceof Error ? (e.message || `${e}`) : `${e}`;
            const stack = e instanceof Error ? (e.stack ?? '') : '';
            this.appendAiGenLog('assistant', `异常: ${msg}`);
            Logger.error(INSTR_TRACE_TAG, `[AI_GEN] EXCEPTION ${msg}`);
            const lines: string[] = [`msg=${msg}`];
            if (stack.length > 0) {
                const parts = stack.split('\n');
                for (let i = 0; i < Math.min(parts.length, 12); i++) {
                    const line = parts[i].trim();
                    if (line.length > 0) {
                        lines.push(line.substring(0, 200));
                    }
                }
            }
            traceAiDiag('AI_GEN', 'exception', lines, 16);
            this.endAiGenerate(false);
            this.onStatusMessage(`AI 生成异常: ${msg}`);
            return false;
        }
    }
    private aiModeLabel(mode: AiGenerateMode): string {
        if (mode === 'replace') {
            return '替换整图';
        }
        if (mode === 'append') {
            return '追加到空白区';
        }
        return '在现有图上 AI 更改';
    }
    private beginAiGenerate(prompt: string, mode: AiGenerateMode): void {
        this.aiGenEpoch++;
        this.aiGenerating = true;
        this.aiGenCancelRequested = false;
        (this.schematicEditor as SchematicEditorImpl).setReadOnly(true);
        this.aiGenLogs = [];
        this.appendAiGenLog('user', prompt);
        this.appendAiGenLog('system', `开始全闭环生成（${this.aiModeLabel(mode)}）· 画布已锁定`);
        this.appendAiGenLog('assistant', '正在解析器件需求…');
        this.onAiGeneratingChanged(true);
        this.onStatusMessage('AI 生成中，画布已锁定（请耐心等待长回复）');
    }
    private endAiGenerate(_ok: boolean): void {
        this.aiGenerating = false;
        this.aiGenCancelRequested = false;
        (this.schematicEditor as SchematicEditorImpl).setReadOnly(false);
        this.onAiGeneratingChanged(false);
    }
    /**
     * 流式画布快照：将流水线各阶段的中间拓扑加载到画布，
     * 实现器件逐步出现 → 标号连接 → 导线完成的动画效果。
     */
    private handleStreamSnapshot(snapshot: SchTopology, stage: string): void {
        if (this.aiGenCancelRequested) {
            return;
        }
        // Map-safe 深拷贝：禁止 JSON.stringify 把 params Map 打成 {}
        const cloned = mapAwareParse<SchTopology>(mapAwareStringify(snapshot));
        const stageNames: Record<string, string> = {
            'placement': '器件已摆放',
            'net_plan': '网络/标号已创建',
            'routing': '导线已连接',
            'modular_merge': '模块已合并'
        };
        const label = stageNames[stage] ?? stage;
        this.appendAiGenLog('system', `[画布] ${label}`);
        Logger.info(INSTR_TRACE_TAG, `[AI_GEN] stream snapshot stage=${stage}` +
            ` devs=${cloned.deviceList.length} nets=${cloned.netList?.length ?? 0}` +
            ` wires=${cloned.wireList?.length ?? 0}`);
        this.schematicEditor.loadTopology(cloned);
    }
    private handleAiGenProgress(p: ProgressInfo): void {
        if (this.aiGenCancelRequested) {
            return;
        }
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
            // 解析 match=[...] 段落为可读列表
            const m = analysis.match(/match=\[([^\]]*)\]/);
            if (m !== null && m[1].length > 0) {
                this.appendAiGenLog('assistant', `库匹配明细: ${m[1].split(',').join(' · ')}`);
            }
        }
        if (topo.ercErrorList !== undefined && topo.ercErrorList.length > 0) {
            const n = Math.min(topo.ercErrorList.length, 8);
            const bits: string[] = [];
            for (let i = 0; i < n; i++) {
                bits.push(`  · ${topo.ercErrorList[i].desc}`);
            }
            this.appendAiGenLog('system', `流水线 ERC 提示 ${topo.ercErrorList.length} 条:\n${bits.join('\n')}`);
        }
        // 连通健康
        let emptyPinNets = 0;
        for (let i = 0; i < topo.netList.length; i++) {
            if (topo.netList[i].nodeList.length === 0) {
                emptyPinNets++;
            }
        }
        this.appendAiGenLog('system', `连通健康: 空脚网 ${emptyPinNets}/${topo.netList.length} · 假脚回退=0`);
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
        this.persistPlatformPrefs();
        this.onStatusMessage(enabled ? '已开启离线模式（禁止云端 AI）' : '已关闭离线模式');
    }
    setGlobalProxy(url: string): void {
        (this.aiApiManager as AiApiManagerImpl).networkMode.setGlobalProxy(url.trim());
        this.persistPlatformPrefs();
        this.onStatusMessage(url.trim().length > 0
            ? `代理已保存（HTTP 将启用系统代理）: ${url.trim()}`
            : '代理已清空（直连）');
    }
    isOfflineMode(): boolean {
        return (this.aiApiManager as AiApiManagerImpl).networkMode.isOfflineMode();
    }
    getGlobalProxy(): string {
        return (this.aiApiManager as AiApiManagerImpl).networkMode.getConfig().globalProxy;
    }
    setAccessibility(cfg: AccessibilityConfig): void {
        this.accessibility = {
            highContrast: cfg.highContrast,
            keyboardOnly: cfg.keyboardOnly,
            uiScale: Math.min(1.5, Math.max(1.0, cfg.uiScale)),
            screenReader: cfg.screenReader
        };
        ProteusFonts.setScale(this.accessibility.uiScale);
        ThemeManager.getInstance().setHighContrast(this.accessibility.highContrast);
        this.persistPlatformPrefs();
    }
    getAccessibility(): AccessibilityConfig {
        return {
            highContrast: this.accessibility.highContrast,
            keyboardOnly: this.accessibility.keyboardOnly,
            uiScale: this.accessibility.uiScale,
            screenReader: this.accessibility.screenReader
        };
    }
    /** 启动时从磁盘恢复离线/代理/无障碍并立刻生效 */
    private applyPlatformPrefsFromStore(): void {
        const prefs = PlatformPrefsStore.getInstance().get();
        (this.aiApiManager as AiApiManagerImpl).networkMode.setOfflineMode(prefs.offlineMode);
        (this.aiApiManager as AiApiManagerImpl).networkMode.setGlobalProxy(prefs.globalProxy);
        this.accessibility = {
            highContrast: prefs.highContrast,
            keyboardOnly: false,
            uiScale: prefs.uiScale,
            screenReader: prefs.screenReader
        };
        ProteusFonts.setScale(prefs.uiScale);
        ThemeManager.getInstance().setHighContrast(prefs.highContrast);
    }
    private persistPlatformPrefs(): void {
        PlatformPrefsStore.getInstance().set({
            offlineMode: this.isOfflineMode(),
            globalProxy: this.getGlobalProxy(),
            highContrast: this.accessibility.highContrast,
            uiScale: this.accessibility.uiScale,
            screenReader: this.accessibility.screenReader
        });
    }
    announceIfScreenReader(message: string): void {
        if (this.accessibility.screenReader && message.length > 0) {
            this.onStatusMessage(`🔊 ${message}`);
        }
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
    /** 等待 Test_Template / hex_files 从 rawfile 复制完成 */
    async ensureTemplatesReady(): Promise<void> {
        if (this.templateBootstrapPromise !== null) {
            await this.templateBootstrapPromise;
            return;
        }
        await TemplateProjectBootstrap.whenReady();
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
        if (this.templateLoadBusy) {
            this.onStatusMessage('模板加载中，请稍候…');
            return false;
        }
        this.templateLoadBusy = true;
        try {
            await this.ensureTemplatesReady();
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
            await MainThreadYield.yield();
            const templateDoc = TopologyAdapter.fromTopology(loadResult.data.topology);
            const editor = this.schematicEditor as SchematicEditorImpl;
            const currentDoc = editor.getDocument();
            TemplateMergeUtil.mergeTemplateInto(currentDoc, templateDoc);
            editor.loadDocument(currentDoc);
            await MainThreadYield.yield();
            // rebuildAll already includes ensureNetPinConnectivity — do not double-rebuild
            editor.rebuildNetPinConnectivity();
            await MainThreadYield.yield();
            this.syncProjectFromModules();
            this.reloadSimulationFromSchematic();
            editor.fitAllInView();
            await MainThreadYield.yield();
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
                    await MainThreadYield.yield();
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
                // 无固件模板（如传感器）：卸掉先前实验残留 MCU，避免 GPIO 抢占 1WIRE 等传感网
                (this.simulationKernel as SimulationKernelImpl).unloadAllMcuFirmware();
                this.reloadSimulationFromSchematic();
                this.onStatusMessage(`已将实验「${tplName}」插入当前工程空白区域`);
                traceBurn('TEMPLATE_HEX', `template=${templateId} path=(none) mcu_cleared=1`);
            }
            // 555 等慢信号由示波器「自适应」自动选时基；这里只清脏缓存
            if (templateId === 'lab_555_astable') {
                this.instruments.clearOscilloscopeCapture();
            }
            return true;
        }
        finally {
            this.templateLoadBusy = false;
        }
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
            // UI first; defer log so emitErc does not inflate the same MMITask
            this.onErcUpdate(errors);
            setTimeout((): void => {
                traceErcErrorList(errors, 'RUNTIME_ERC');
            }, 1);
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
        const total = lib.getTotalCount();
        if (result.success && result.data !== undefined && result.data > 0) {
            this.onStatusMessage(`精确器件库已加载 ${result.data} 项 · 合计 ${total} (v${lib.getLibraryVersion()})`);
        }
        else {
            Logger.info('component_library', `DeviceLibrary 未从 ${targetPath} 加载，使用内置库 (${total})`);
        }
        this.onLibraryLoaded(total);
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
        this.announceIfScreenReader(mode === 'dark' ? '深色主题' : '浅色主题');
        return mode === 'dark';
    }
    private onSchematicChanged = (_payload: ModuleEventPayload): void => {
        if (this.currentProject) {
            this.currentProject.schematic = this.schematicEditor.getDocument();
        }
        if (this.persistDebounceTimer >= 0) {
            clearTimeout(this.persistDebounceTimer);
        }
        this.persistDebounceTimer = setTimeout(() => {
            this.persistDebounceTimer = -1;
            void this.persistWorkingCopy();
        }, this.PERSIST_DEBOUNCE_MS);
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
