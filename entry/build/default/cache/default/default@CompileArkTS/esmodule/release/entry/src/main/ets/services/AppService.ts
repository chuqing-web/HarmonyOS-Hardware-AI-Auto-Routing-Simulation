import { SchematicEditorImpl } from "@bundle:com.elecdraw.aischsim/entry@schematic_editor/Index";
import type { ISchematicEditor } from "@bundle:com.elecdraw.aischsim/entry@schematic_editor/Index";
import { ComponentLibraryImpl } from "@bundle:com.elecdraw.aischsim/entry@component_library/Index";
import type { IComponentLibrary } from "@bundle:com.elecdraw.aischsim/entry@component_library/Index";
import { SimulationKernelImpl } from "@bundle:com.elecdraw.aischsim/entry@simulation_kernel/Index";
import type { ISimulationKernel } from "@bundle:com.elecdraw.aischsim/entry@simulation_kernel/Index";
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
import { EventBus, ModuleEvent, CallbackRegistry, AiTaskType, defaultSimConfig, Logger, ExportPostProcessor, ResultHelper, LicenseManager, FeatureGate, SchematicAnnotationType, SchematicAnnotationStatus, IdUtil, calcSymbolBounds, paramMapGet, PrivacyConsentStore, SimulationState, getPinNetMap, findNetForPinLabel, TopologyAdapter, traceBindingRefresh, traceActiveComponentChanged, traceReloadSchematic, traceSimStep, tracePinNetEmpty, INSTR_TRACE_TAG, traceMeasure, formatPinNetMap, ensureNetPinConnectivity, traceProjectOpenAudit, traceSimStartupAudit, traceDataFlow, traceErcErrorList } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ProjectFile, ModuleEventPayload, SchTopology, WaveData, ErcError, ProgressInfo, FaultType, FaultInjection, FaultScanResult, AccessibilityConfig, ApiResult, LicenseStatus, UsageDashboard, SnapshotMeta, VersionCompareReport, SymbolBounds, Pin, SchematicDocument, BindingTraceInfo, PinGeometryResolver, PinGeometry } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { CollabSyncClient } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/Index";
import type { CollabPresence } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/Index";
interface SimStepData {
    waves: WaveData[];
    stepCount: number;
}
class BomLookupImpl implements BomLookup {
    private lib: IComponentLibrary;
    constructor(b238: IComponentLibrary) {
        this.lib = b238;
    }
    getDisplayName(z237: string): string {
        const a238 = this.lib.getComponent(z237);
        return a238.success && a238.data !== undefined ? a238.data.name : z237;
    }
    getDefaultValue(u237: string): string {
        const v237 = this.lib.getComponent(u237);
        if (v237.success && v237.data !== undefined) {
            const w237: string[] = ['value', 'Value', 'resistance', 'capacitance', 'voltage'];
            for (let x237 = 0; x237 < w237.length; x237++) {
                const y237 = paramMapGet(v237.data.defaultParams, w237[x237], '');
                if (y237.length > 0) {
                    return y237;
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
    private simTimer: number = -1;
    private simTickScheduled: boolean = false;
    private simStepCount: number = 0;
    private readonly SIM_TICK_MS: number = 50;
    private lastActiveInstrumentId: string | null = null;
    private bindingPinHash: Map<string, string> = new Map();
    private appBaseDir: string = '';
    onProjectChanged: () => void = () => { };
    onStatusMessage: (msg: string) => void = () => { };
    onErcUpdate: (errors: ErcError[]) => void = () => { };
    onWaveUpdate: (waves: WaveData[]) => void = () => { };
    onAiProgress: (p: ProgressInfo) => void = () => { };
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
        this.wireEventBus();
        this.wireCallbacks();
        this.wireComponentBoundsResolver();
        this.wireBomLookup();
        this.registerKeyboardShortcuts();
        this.crashGuard.enable(60000, () => this.getTopology());
        this.pluginManager.loadPlugin('Plugins/Script/batch_bom_export.py');
    }
    initPlatform(j237: common.UIAbilityContext): void {
        const k237 = j237.filesDir;
        const l237 = `${k237}/${ProjectPaths.APP_ROOT}`;
        this.appBaseDir = l237;
        try {
            fs.accessSync(l237);
        }
        catch (s237) {
            try {
                fs.mkdirSync(l237);
            }
            catch (t237) { }
        }
        try {
            fs.accessSync(`${l237}/${ProjectPaths.AUTOSAVE_DIR}`);
        }
        catch (q237) {
            try {
                fs.mkdirSync(`${l237}/${ProjectPaths.AUTOSAVE_DIR}`);
            }
            catch (r237) { }
        }
        try {
            fs.mkdirSync(ProjectPaths.userProjectRoot(l237), true);
        }
        catch (p237) { }
        ThemeManager.getInstance().init(l237);
        (this.filePersistence as FilePersistenceImpl).setAppBaseDir(l237);
        this.filePersistence.initCollaboration(l237);
        void TemplateProjectBootstrap.ensure(j237, l237);
        void this.bootstrapAndLoadLibrary(j237, `${l237}/DeviceLibrary`);
        void this.loadProteusAliases(j237);
        void LicenseManager.getInstance().applyTrialStatus(j237);
        void PrivacyConsentStore.init(j237);
        this.pluginManager.setPluginInstallDir(`${k237}/AISchSim/Plugins`);
        this.collabSync.setSession(this.sessionHolderId, this.sessionUserName);
        const m237 = `${k237}/AISchSim/license.lic`;
        const n237 = LicenseManager.getInstance().loadFromPath(m237);
        FeatureGate.refresh();
        const o237 = n237.valid ? n237.message : LicenseManager.getInstance().getStatus().message;
        this.onStatusMessage(o237);
        EventBus.getInstance().publish({
            event: ModuleEvent.LICENSE_CHANGED,
            source: 'entry',
            timestamp: Date.now(),
            data: n237
        });
    }
    getLicenseStatus(): LicenseStatus {
        return LicenseManager.getInstance().getStatus();
    }
    getDeviceCode(): string {
        return LicenseManager.getInstance().getDeviceCode();
    }
    importLicense(f237: common.UIAbilityContext, g237: string): LicenseStatus {
        const h237 = `${f237.filesDir}/AISchSim/license.lic`;
        const i237 = LicenseManager.getInstance().importAndSave(h237, g237);
        FeatureGate.refresh();
        EventBus.getInstance().publish({
            event: ModuleEvent.LICENSE_CHANGED,
            source: 'entry',
            timestamp: Date.now(),
            data: i237
        });
        return i237;
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
    newProject(d237: string = 'Untitled'): void {
        this.currentProject = this.filePersistence.createNewProject(d237);
        this.currentProjectPath = '';
        const e237 = this.schematicEditor as SchematicEditorImpl;
        e237.loadAnnotations([]);
        e237.setReadOnly(false);
        this.schematicEditor.loadDocument(this.currentProject.schematic);
        this.simulationKernel.loadSchematic(this.currentProject.schematic);
        this.onProjectChanged();
        this.onStatusMessage(`新建工程: ${d237}`);
    }
    getTopology(): SchTopology {
        return this.schematicEditor.getFullTopology();
    }
    reloadSimulationFromSchematic(): void {
        const a237 = this.simulationKernel as SimulationKernelImpl;
        if (!a237.isSimActive()) {
            return;
        }
        (this.schematicEditor as SchematicEditorImpl).rebuildNetPinConnectivity();
        const b237 = this.schematicEditor.getDocument();
        ensureNetPinConnectivity(b237, b237.metadata.gridSize || 10, this.pinGeometryResolver());
        this.bindingPinHash.clear();
        a237.loadSchematic(b237);
        this.autoWireAllInstruments();
        this.autoWireSignalGenerators();
        const c237 = (this.instruments as VirtualInstrumentsImpl).getActiveInstrumentComponent();
        traceReloadSchematic(c237, b237.components.length, b237.nets.length);
        if (c237 !== null && c237.length > 0) {
            this.refreshInstrumentReaderForComponent(c237);
            this.setActiveInstrumentComponent(c237);
        }
    }
    toggleSimulationPause(): boolean {
        const z236 = this.simulationKernel as SimulationKernelImpl;
        if (z236.getState() === SimulationState.RUNNING) {
            z236.pauseSim();
            this.onStatusMessage('仿真已暂停');
            return true;
        }
        if (z236.getState() === SimulationState.PAUSED) {
            z236.resumeSim();
            this.onStatusMessage('仿真已恢复');
            return false;
        }
        return false;
    }
    isSimulationPaused(): boolean {
        return (this.simulationKernel as SimulationKernelImpl).isSimPaused();
    }
    invalidateInstrumentBinding(y236: string): void {
        this.bindingPinHash.delete(y236);
    }
    refreshAllInstrumentBindings(): void {
        this.bindingPinHash.clear();
        this.autoWireAllInstruments();
    }
    syncComponentParamToSimulation(v236: string, w236: string, x236: string): void {
        this.reloadSimulationFromSchematic();
    }
    setActiveInstrumentComponent(u236: string | null): void {
        if (u236 !== this.lastActiveInstrumentId) {
            traceActiveComponentChanged(u236, 'AppService.setActive');
            this.lastActiveInstrumentId = u236;
        }
        if (u236 !== null && u236.length > 0) {
            this.refreshInstrumentReaderForComponent(u236);
        }
        (this.instruments as VirtualInstrumentsImpl).setActiveInstrumentComponent(u236);
    }
    readVoltmeterDeltaForComponent(i236: string): number | null {
        const j236 = this.schematicEditor.getDocument();
        const k236 = j236.components.find(t236 => t236.id === i236);
        if (k236 === undefined) {
            return null;
        }
        const l236 = k236.libraryId.toUpperCase();
        if (!l236.includes('VOLTMETER') && !l236.includes('VIRTUAL_METER') && l236 !== 'MULTIMETER') {
            return null;
        }
        const m236 = this.simulationKernel as SimulationKernelImpl;
        const n236 = getPinNetMap(i236, j236.nets);
        const o236 = findNetForPinLabel(n236, 'V+') ?? findNetForPinLabel(n236, 'V') ??
            findNetForPinLabel(n236, 'PLUS') ?? findNetForPinLabel(n236, '+') ??
            findNetForPinLabel(n236, 'PROBE1');
        if (o236 === null) {
            return null;
        }
        const p236 = findNetForPinLabel(n236, 'COM') ?? findNetForPinLabel(n236, 'V-') ??
            findNetForPinLabel(n236, '-') ?? findNetForPinLabel(n236, 'GND') ??
            findNetForPinLabel(n236, 'PROBE2');
        if (p236 === null) {
            return null;
        }
        const q236 = m236.getNetVoltageByUuid(o236);
        const r236 = m236.getNetVoltageByUuid(p236);
        const s236 = q236 - r236;
        traceMeasure(k236.refDes, 'V', m236.isSimActive(), `UI V+(${this.netLabel(j236, o236)})=${q236.toFixed(4)}V ` +
            `COM(${this.netLabel(j236, p236)})=${r236.toFixed(4)}V ` +
            `Δ=${s236.toFixed(4)}V sign=${s236 >= 0 ? '+' : '-'} (${s236 >= 0 ? 'V+>COM' : 'COM>V+'})`);
        return s236;
    }
    readAmmeterCurrentForComponent(y235: string): number | null {
        const z235 = this.schematicEditor.getDocument();
        const a236 = z235.components.find(h236 => h236.id === y235);
        if (a236 === undefined) {
            return null;
        }
        if (!a236.libraryId.toUpperCase().includes('AMMETER')) {
            return null;
        }
        const b236 = this.simulationKernel as SimulationKernelImpl;
        const c236 = getPinNetMap(y235, z235.nets);
        const d236 = findNetForPinLabel(c236, 'I+') ?? findNetForPinLabel(c236, 'PLUS') ??
            findNetForPinLabel(c236, '+');
        const e236 = findNetForPinLabel(c236, 'I-') ?? findNetForPinLabel(c236, 'MINUS') ??
            findNetForPinLabel(c236, '-');
        if (d236 === null || e236 === null) {
            return null;
        }
        const f236 = b236.getBranchCurrent(y235);
        if (Math.abs(f236) > 1e-15) {
            const g236 = f236 * 1000;
            traceMeasure(a236.refDes, 'I', b236.isSimActive(), `UI I+→I- I=${g236.toFixed(4)}mA sign=${f236 >= 0 ? '+' : '-'}`);
            return g236;
        }
        return null;
    }
    isSimulationRunning(): boolean {
        const x235 = this.simulationKernel as SimulationKernelImpl;
        return x235.isSimActive() && x235.getState() === SimulationState.RUNNING;
    }
    isSimulationActive(): boolean {
        return (this.simulationKernel as SimulationKernelImpl).isSimActive();
    }
    private netLabel(t235: SchematicDocument, u235: string): string {
        const v235 = t235.nets.find(w235 => w235.id === u235);
        if (v235 !== undefined && v235.name.length > 0) {
            return `${v235.name}(${u235})`;
        }
        return u235;
    }
    private buildNetVoltageDetail(m235: SchematicDocument, n235: SimulationKernelImpl, o235: string[]): string {
        const p235: string[] = [];
        for (let q235 = 0; q235 < o235.length; q235++) {
            const r235 = o235[q235];
            if (r235.length === 0) {
                continue;
            }
            const s235 = n235.getNetVoltageByUuid(r235);
            p235.push(`${this.netLabel(m235, r235)}=${s235.toFixed(4)}V`);
        }
        return p235.length > 0 ? `nets_V={${p235.join(', ')}}` : '';
    }
    refreshInstrumentReaderForComponent(a234: string): void {
        const b234 = this.schematicEditor.getDocument();
        const c234 = b234.components.find(l235 => l235.id === a234);
        if (c234 === undefined) {
            return;
        }
        const d234 = this.simulationKernel as SimulationKernelImpl;
        const e234 = getPinNetMap(a234, b234.nets);
        const f234 = formatPinNetMap(e234);
        if (this.bindingPinHash.get(a234) === f234) {
            return;
        }
        this.bindingPinHash.set(a234, f234);
        const g234 = c234.libraryId.toUpperCase();
        const h234 = g234.includes('METER') || g234.includes('SCOPE') || g234.includes('OSC') ||
            g234.includes('LOGIC') || g234.includes('ANALYZER') || g234.includes('POWER') ||
            g234.includes('WATT') || g234.includes('FREQ') || g234.includes('COUNTER');
        if (h234 && e234.size === 0) {
            tracePinNetEmpty(a234, c234.refDes);
        }
        const i234 = (k235: string): string | null => findNetForPinLabel(e234, k235);
        const j234: ComponentInstrumentBinding = {
            libraryId: c234.libraryId,
            scopeProbes: ['', '', '', ''],
            logicProbes: [],
            voltageReader: null,
            currentReader: null,
            powerVoltageReader: null,
            powerCurrentReader: null,
            freqReader: null
        };
        if (g234.includes('OSC') || g234.includes('SCOPE')) {
            for (let i235 = 1; i235 <= 4; i235++) {
                const j235 = i234(`CH${i235}`) ?? i234(`IN${i235}`) ?? i234(`A${i235}`);
                if (j235 !== null) {
                    j234.scopeProbes[i235 - 1] = j235;
                }
            }
        }
        else if (g234.includes('LOGIC') || g234.includes('ANALYZER') || g234.startsWith('LA')) {
            for (let g235 = 1; g235 <= 8; g235++) {
                const h235 = i234(`CH${g235}`) ?? i234(`D${g235 - 1}`) ?? i234(`IN${g235}`);
                if (h235 !== null) {
                    j234.logicProbes.push(h235);
                }
            }
        }
        else if (g234.includes('VOLTMETER') || g234.includes('VIRTUAL_METER') || g234 === 'MULTIMETER') {
            const z234 = i234('V+') ?? i234('V') ?? i234('PLUS') ?? i234('+') ??
                i234('PROBE1');
            const a235 = i234('COM') ?? i234('V-') ?? i234('-') ?? i234('GND') ??
                i234('PROBE2');
            if (z234 !== null && a235 !== null) {
                const b235 = z234;
                const c235 = a235;
                j234.voltageReader = () => {
                    const d235 = d234.getNetVoltageByUuid(b235);
                    const e235 = d234.getNetVoltageByUuid(c235);
                    const f235 = d235 - e235;
                    traceMeasure(c234.refDes, 'V', d234.isSimActive(), `V+(${this.netLabel(b234, b235)})=${d235.toFixed(4)}V ` +
                        `COM(${this.netLabel(b234, c235)})=${e235.toFixed(4)}V ` +
                        `Δ=${f235.toFixed(4)}V sign=${f235 >= 0 ? '+' : '-'} (${f235 >= 0 ? 'V+>COM' : 'COM>V+'})`);
                    return f235;
                };
            }
        }
        else if (g234.includes('AMMETER')) {
            const v234 = i234('I+') ?? i234('PLUS') ?? i234('+');
            const w234 = i234('I-') ?? i234('MINUS') ?? i234('-');
            if (v234 !== null && w234 !== null) {
                j234.currentReader = () => {
                    const x234 = d234.getBranchCurrent(a234);
                    if (Math.abs(x234) > 1e-15) {
                        const y234 = x234 * 1000;
                        traceMeasure(c234.refDes, 'I', d234.isSimActive(), `I+(${this.netLabel(b234, v234)})→I-(${this.netLabel(b234, w234)}) ` +
                            `I=${y234.toFixed(4)}mA sign=${x234 >= 0 ? '+' : '-'} (${x234 >= 0 ? 'I+→I-' : 'I-→I+'})`);
                        return y234;
                    }
                    return 0;
                };
            }
        }
        else if (g234.includes('POWER') || g234.includes('WATT')) {
            const q234 = i234('V+') ?? i234('VP') ?? i234('PLUS') ?? i234('+');
            const r234 = i234('V-') ?? i234('COM') ?? i234('GND') ?? i234('-');
            const s234 = i234('I+') ?? i234('IP') ?? i234('A+');
            const t234 = i234('I-') ?? i234('IM') ?? i234('A-');
            if (q234 !== null && r234 !== null) {
                j234.powerVoltageReader = () => {
                    return d234.getNetVoltageByUuid(q234) - d234.getNetVoltageByUuid(r234);
                };
            }
            if (s234 !== null && t234 !== null) {
                j234.powerCurrentReader = () => {
                    const u234 = d234.getNetCurrentByUuid(s234);
                    if (Math.abs(u234) > 1e-15) {
                        return u234;
                    }
                    return 0;
                };
            }
        }
        else if (g234.includes('FREQ') || g234.includes('COUNTER')) {
            const p234 = i234('IN') ?? i234('SIG') ?? i234('INPUT') ?? i234('+');
            if (p234 !== null) {
                j234.freqReader = (): number => {
                    return AppService.estimateFrequencyFromWaves(d234.getAllWaveData(), p234);
                };
                j234.scopeProbes[0] = p234;
            }
        }
        (this.instruments as VirtualInstrumentsImpl).registerComponentBinding(a234, j234);
        const k234: BindingTraceInfo = {
            libraryId: j234.libraryId,
            scopeProbes: j234.scopeProbes.slice(),
            logicProbes: j234.logicProbes.slice(),
            hasVoltageReader: j234.voltageReader !== null,
            hasCurrentReader: j234.currentReader !== null,
            hasPowerVoltageReader: j234.powerVoltageReader !== null,
            hasPowerCurrentReader: j234.powerCurrentReader !== null,
            hasFreqReader: j234.freqReader !== null
        };
        const l234 = (this.simulationKernel as SimulationKernelImpl).isSimActive();
        const m234: string[] = [];
        e234.forEach((o234: string) => {
            if (!m234.includes(o234)) {
                m234.push(o234);
            }
        });
        const n234 = this.buildNetVoltageDetail(b234, d234, m234);
        traceBindingRefresh(a234, c234.refDes, e234, k234, l234, n234);
    }
    private static estimateFrequencyFromWaves(j233: WaveData[], k233: string): number {
        let l233: WaveData | undefined = undefined;
        for (let y233 = 0; y233 < j233.length; y233++) {
            const z233 = j233[y233];
            if (z233.netName === k233 || z233.probeName === k233) {
                l233 = z233;
                break;
            }
        }
        if (l233 === undefined) {
            for (let w233 = 0; w233 < j233.length; w233++) {
                const x233 = j233[w233];
                if (x233.netName === k233 || x233.probeName === k233) {
                    l233 = x233;
                    break;
                }
            }
        }
        if (l233 === undefined || l233.timeAxis.length < 4) {
            return 0;
        }
        const m233 = l233.timeAxis;
        const n233 = l233.voltageAxis;
        let o233 = n233[0];
        let p233 = n233[0];
        for (let v233 = 1; v233 < n233.length; v233++) {
            if (n233[v233] > o233) {
                o233 = n233[v233];
            }
            if (n233[v233] < p233) {
                p233 = n233[v233];
            }
        }
        const q233 = (o233 + p233) / 2;
        let r233 = 0;
        let s233 = -1;
        for (let u233 = 1; u233 < n233.length; u233++) {
            if ((n233[u233 - 1] < q233 && n233[u233] >= q233) ||
                (n233[u233 - 1] > q233 && n233[u233] <= q233)) {
                if (s233 < 0) {
                    s233 = m233[u233];
                }
                r233++;
            }
        }
        if (r233 < 2) {
            return 0;
        }
        const t233 = 2 * (m233[m233.length - 1] - s233) / (r233 - 1);
        return t233 > 0 ? 1.0 / t233 : 0;
    }
    clearPerComponentReaders(): void {
        this.setActiveInstrumentComponent(null);
    }
    clearInstrumentReaders(): void {
        this.setActiveInstrumentComponent(null);
        this.clearInstrumentGlobalFallbacks();
    }
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
    async saveProject(g233: string): Promise<boolean> {
        if (!this.currentProject)
            return false;
        this.syncProjectFromModules();
        const h233 = this.filePersistence.acquireProjectLock(g233, this.sessionHolderId, this.sessionUserName, 'editable');
        if (!h233.success) {
            this.onStatusMessage(h233.error ?? '无法获取工程锁');
            return false;
        }
        const i233 = await this.filePersistence.saveProject(this.currentProject, g233);
        this.filePersistence.appendProjectChangeLog(this.sessionUserName, 'save', g233, `保存工程 ${this.currentProject.name}`);
        this.currentProjectPath = g233;
        this.onStatusMessage(i233.success ? `已保存 ${g233}` : `保存失败: ${i233.error}`);
        return i233.success;
    }
    async loadProject(x232: string): Promise<boolean> {
        this.filePersistence.clearStaleProjectLock(x232);
        const y232 = this.filePersistence.acquireProjectLock(x232, this.sessionHolderId, this.sessionUserName, 'editable');
        if (!y232.success) {
            const e233 = this.filePersistence.getProjectLockInfo(x232);
            if (e233) {
                const f233 = this.filePersistence.acquireProjectLock(x232, this.sessionHolderId, this.sessionUserName, 'read_only');
                if (!f233.success) {
                    this.onStatusMessage(f233.error ?? '工程被锁定');
                    return false;
                }
                (this.schematicEditor as SchematicEditorImpl).setReadOnly(true);
                this.onStatusMessage(`只读模式打开（${e233.holderName} 正在编辑）`);
            }
            else {
                this.onStatusMessage(y232.error ?? '无法打开工程');
                return false;
            }
        }
        else {
            (this.schematicEditor as SchematicEditorImpl).setReadOnly(false);
        }
        const z232 = await this.filePersistence.loadProject(x232);
        if (!z232.success || !z232.data)
            return false;
        this.currentProject = z232.data;
        this.currentProjectPath = x232;
        const a233 = this.schematicEditor as SchematicEditorImpl;
        a233.loadDocument(this.currentProject.schematic);
        a233.loadAnnotations(this.currentProject.collaboration?.annotations ?? []);
        a233.rebuildNetPinConnectivity();
        const b233 = this.currentProject.schematic;
        ensureNetPinConnectivity(b233, b233.metadata.gridSize || 10, this.pinGeometryResolver());
        this.simulationKernel.loadSchematic(b233);
        traceProjectOpenAudit(x232, this.currentProject.name, b233, a233.getViewport());
        traceDataFlow('LOAD', 'schematic→editor→netRebuild→kernel loadSchematic complete');
        if (this.currentProject.mcuDebugConfig) {
            this.hexDebugger.configure(this.currentProject.mcuDebugConfig);
        }
        for (let c233 = 0; c233 < this.currentProject.aiConfigs.length; c233++) {
            const d233 = this.currentProject.aiConfigs[c233];
            this.aiApiManager.addApi(d233);
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
        const v232 = this.schematicEditor as SchematicEditorImpl;
        const w232 = this.filePersistence.buildCollaborationBundle(v232.getAnnotations());
        this.currentProject.collaboration = w232;
    }
    async createSnapshot(r232: string, s232: string): Promise<SnapshotMeta | null> {
        const t232 = this.getTopology();
        const u232 = await this.filePersistence.createProjectSnapshot(r232, s232, t232, this.sessionUserName);
        if (u232.success && u232.data) {
            this.syncProjectFromModules();
            this.onStatusMessage(`快照已保存: ${r232}`);
            return u232.data;
        }
        this.onStatusMessage(u232.error ?? '快照失败');
        return null;
    }
    compareSnapshots(o232: string, p232: string): VersionCompareReport | null {
        const q232 = this.filePersistence.compareProjectSnapshots(o232, p232, this.getTopology());
        if (q232.success && q232.data)
            return q232.data;
        this.onStatusMessage(q232.error ?? '版本对比失败');
        return null;
    }
    addAnnotation(i232: string, j232: string, k232: number, l232: number): void {
        const m232 = this.schematicEditor as SchematicEditorImpl;
        const n232 = m232.addAnnotation({
            id: '',
            author: this.sessionUserName,
            text: i232,
            type: SchematicAnnotationType.TEXT,
            status: SchematicAnnotationStatus.PENDING,
            x: k232,
            y: l232,
            targetUuid: j232,
            targetKind: 'device',
            createdAt: '',
            updatedAt: ''
        });
        if (n232.success) {
            this.filePersistence.appendProjectChangeLog(this.sessionUserName, 'annotation', j232, i232);
            this.syncProjectFromModules();
            this.onStatusMessage('批注已添加');
        }
        else {
            this.onStatusMessage(n232.error ?? '批注失败');
        }
    }
    enableAutoSave(g232: string, h232: number = 60000): void {
        this.filePersistence.enableAutoSave(h232, g232, () => {
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
    async saveSession(d232: string, e232: string, f232: boolean): Promise<void> {
        await (this.filePersistence as FilePersistenceImpl).saveSessionState(d232, e232, f232);
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
    runErc(z231: boolean = false): ErcError[] {
        const a232 = this.getTopology();
        const b232 = this.schematicEditor.runERC(a232, true);
        if (z231 && b232.length > 0) {
            const c232 = this.schematicEditor.autoFixERC(a232, b232);
            this.onStatusMessage(`ERC: ${b232.length} 项, 自动修复 ${c232} 项`);
            this.onProjectChanged();
        }
        else {
            this.onStatusMessage(`ERC 完成: ${b232.length} 项`);
        }
        this.onErcUpdate(b232);
        return b232;
    }
    private pinGeometryResolver(): PinGeometryResolver {
        const s231 = this.componentLibrary as ComponentLibraryImpl;
        return (t231: string): PinGeometry[] | null => {
            const u231 = s231.resolveLibraryId(t231);
            const v231 = s231.getComponent(u231);
            if (!v231.success || v231.data === undefined) {
                return null;
            }
            const w231: PinGeometry[] = [];
            for (let x231 = 0; x231 < v231.data.pins.length; x231++) {
                const y231 = v231.data.pins[x231];
                w231.push({ id: y231.id, name: y231.name, x: y231.position.x, y: y231.position.y });
            }
            return w231;
        };
    }
    startSimulation(): boolean {
        (this.schematicEditor as SchematicEditorImpl).rebuildNetPinConnectivity();
        const d231 = this.pinGeometryResolver();
        let e231 = this.schematicEditor.getDocument();
        ensureNetPinConnectivity(e231, e231.metadata.gridSize || 10, d231);
        const f231 = this.schematicEditor.runERC();
        const g231 = f231.filter(r231 => r231.severity === 'error' || r231.severity === 'critical');
        if (g231.some(q231 => q231.desc.includes('短路'))) {
            this.onStatusMessage('存在短路错误，禁止启动仿真');
            return false;
        }
        e231 = this.schematicEditor.getDocument();
        const h231 = this.getTopology();
        const i231 = defaultSimConfig();
        const j231 = this.simulationKernel.startSimulation(h231, i231, (p231) => {
            this.onAiProgress(p231);
        });
        if (!j231.success) {
            Logger.warn(INSTR_TRACE_TAG, `[SIM_START_FAIL] ${j231.error ?? 'unknown'}`);
            this.onStatusMessage(`仿真启动失败: ${j231.error}`);
            return false;
        }
        (this.simulationKernel as SimulationKernelImpl).loadSchematic(e231);
        this.schematicEditor.setSimBusy(true);
        this.simStepCount = 0;
        this.onStatusMessage('仿真运行中...');
        this.runSimBatch(20);
        this.setupInstrumentGlobalFallbacks();
        const k231 = (this.instruments as VirtualInstrumentsImpl).getActiveInstrumentComponent();
        this.refreshAllInstrumentBindings();
        if (k231 !== null && k231.length > 0) {
            this.setActiveInstrumentComponent(k231);
        }
        this.autoWireSignalGenerators();
        const l231 = this.simulationKernel as SimulationKernelImpl;
        traceSimStartupAudit(e231, this.simulationKernel.getState(), this.simStepCount, (o231: string) => l231.getNetVoltageByUuid(o231), (n231: string) => l231.getNetCurrentByUuid(n231), l231.getNodeVoltageMap(), l231.getBranchCurrentMap(), l231.getAllWaveData(), l231.netToSpiceNodeMap(), k231, (m231: string) => l231.getBranchCurrent(m231));
        Logger.info(INSTR_TRACE_TAG, '仿真已启动 — DevEco 日志过滤 instr_trace 可追踪仪器绑定; setInstrTraceSimStep(true) 开启逐步采样');
        this.scheduleSimTick();
        return true;
    }
    private scheduleSimTick(): void {
        if (this.simTickScheduled) {
            return;
        }
        const b231 = this.simulationKernel.getState();
        if (b231 !== SimulationState.RUNNING && b231 !== SimulationState.PAUSED) {
            return;
        }
        this.simTickScheduled = true;
        this.simTimer = setTimeout(() => {
            this.simTimer = -1;
            this.simTickScheduled = false;
            const c231 = this.simulationKernel.getState();
            if (c231 === SimulationState.PAUSED) {
                this.scheduleSimTick();
                return;
            }
            if (c231 !== SimulationState.RUNNING) {
                return;
            }
            this.runSimBatch(10);
            if (this.simStepCount % 50 === 0) {
                this.autoWireAllInstruments();
            }
            this.scheduleSimTick();
        }, this.SIM_TICK_MS);
    }
    private autoWireAllInstruments(): void {
        const y230 = this.schematicEditor.getDocument();
        for (const z230 of y230.components) {
            const a231 = z230.libraryId.toUpperCase();
            if (a231.includes('METER') || a231.includes('SCOPE') || a231.includes('LOGIC') ||
                a231.includes('POWER') || a231.includes('WATT') || a231.includes('FREQ') ||
                a231.includes('COUNTER') || a231.includes('UART') || a231.includes('TERMINAL') ||
                a231.includes('SIGNAL')) {
                this.refreshInstrumentReaderForComponent(z230.id);
            }
        }
    }
    private autoWireSignalGenerators(): void {
        const m230 = this.schematicEditor.getDocument();
        const n230 = this.simulationKernel as SimulationKernelImpl;
        for (const o230 of m230.components) {
            const p230 = o230.libraryId.toUpperCase();
            if (p230.includes('SIGNAL') || p230.includes('GEN') || p230.includes('FUNC')) {
                let q230 = '';
                let r230 = '0';
                for (const u230 of m230.nets) {
                    for (const v230 of u230.pinIds) {
                        const w230 = v230.split(':');
                        if (w230.length >= 2 && w230[0] === o230.id) {
                            const x230 = (w230.length >= 3 ? w230[2] : w230[1]).toUpperCase();
                            if (x230 === 'OUT' || x230 === 'OUTPUT' || x230 === 'SIG' ||
                                x230 === 'SIGNAL' || x230 === '+' || x230 === 'A') {
                                q230 = u230.id;
                            }
                            else if (x230 === 'GND' || x230 === 'COM' || x230 === '-' ||
                                x230 === 'B') {
                                r230 = u230.id;
                            }
                        }
                    }
                }
                if (q230.length > 0) {
                    const s230 = n230.netToSpiceNodeMap().get(q230) ?? q230;
                    const t230 = n230.netToSpiceNodeMap().get(r230) ?? (r230 === '0' ? '0' : r230);
                    n230.registerSignalSource('SIGGEN', s230, t230, 'sin', 1.65, 3.3, 1000, 0, 0.5);
                }
            }
        }
    }
    private runSimBatch(a230: number): void {
        if (this.simulationKernel.getState() !== SimulationState.RUNNING) {
            return;
        }
        const b230 = this.simulationKernel as SimulationKernelImpl;
        for (let k230 = 0; k230 < a230; k230++) {
            b230.runSpiceStep();
            b230.tickDigitalLogic();
            b230.tickMcuCore();
            this.simStepCount++;
            if (this.simStepCount % 5 === 0) {
                const l230 = b230.getNodeVoltageMap();
                (this.instruments as VirtualInstrumentsImpl).feedScopeTimeSnapshot(b230.globalTimeTick(), l230);
            }
        }
        const c230 = b230.getAllWaveData();
        if (c230.length > 0) {
            this.instruments.feedSimulationWaves(c230);
        }
        const d230 = b230.getNodeVoltageMap();
        const e230 = b230.getBranchCurrentMap();
        (this.instruments as VirtualInstrumentsImpl).feedScopeNodeData(d230, e230);
        const f230 = (this.instruments as VirtualInstrumentsImpl).getActiveInstrumentComponent();
        const g230 = new Map<string, number>();
        d230.forEach((i230: number, j230: string) => {
            g230.set(j230, i230 > 1.65 ? 1 : 0);
        });
        (this.instruments as VirtualInstrumentsImpl).feedLogicDigitalStates(g230);
        traceSimStep(this.simStepCount, c230.length, c230, f230, d230, e230);
        if (this.simStepCount % 50 === 0) {
            this.autoWireAllInstruments();
        }
        const h230: SimStepData = { waves: c230, stepCount: this.simStepCount };
        EventBus.getInstance().publish({
            event: ModuleEvent.SIMULATION_STEP,
            source: 'app_service',
            timestamp: Date.now(),
            data: h230 as Object
        });
        this.onWaveUpdate(c230);
    }
    stopSimulation(): void {
        this.simTickScheduled = false;
        if (this.simTimer >= 0) {
            clearTimeout(this.simTimer);
            this.simTimer = -1;
        }
        this.simulationKernel.stopSim();
        this.schematicEditor.setSimBusy(false);
        this.clearInstrumentReaders();
        this.onStatusMessage('仿真已停止');
    }
    async aiAutoRoute(): Promise<boolean> {
        if (this.aiApiManager.isQuotaWarningActive()) {
            this.onStatusMessage('AI 用量已达 80%，请注意额度');
        }
        const x229 = this.getTopology();
        const y229 = await this.aiEngine.runAiTask(AiTaskType.TASK_AUTO_ROUTE_GLOBAL, x229, undefined, (z229) => this.onAiProgress(z229));
        if (y229.success && y229.topology) {
            this.schematicEditor.applyRouteResult({
                routeLines: y229.topology.wireList,
                crossCount: 0, totalLineLength: 0,
                isolateAnalogDigital: true, xtalShortPath: true, diffLineEqualLength: false
            }, true);
            this.onProjectChanged();
            this.onStatusMessage('AI 布线完成');
            return true;
        }
        this.onStatusMessage(y229.errMsg || 'AI 布线失败');
        return false;
    }
    async aiGenerateCircuit(t229: string): Promise<boolean> {
        const u229 = this.getTopology();
        const v229 = await this.aiEngine.runAiTask(AiTaskType.TASK_FULL_PIPELINE, u229, { prompt: t229 }, (w229) => this.onAiProgress(w229));
        if (v229.success && v229.topology) {
            this.schematicEditor.loadTopology(v229.topology);
            if (v229.topology.wireList.length > 0) {
                this.schematicEditor.applyRouteResult({
                    routeLines: v229.topology.wireList,
                    crossCount: 0, totalLineLength: 0,
                    isolateAnalogDigital: true, xtalShortPath: true, diffLineEqualLength: false
                }, true);
            }
            this.runErc(false);
            this.onProjectChanged();
            this.onStatusMessage(`AI 闭环完成: ${v229.topology.deviceList.length} 器件, ${v229.analysisText ?? ''}`);
            return true;
        }
        this.onStatusMessage(v229.errMsg || 'AI 生成失败');
        return false;
    }
    async aiOptimizePlacement(k229: string = '规整布局'): Promise<boolean> {
        const l229 = this.getTopology();
        const m229 = this.schematicEditor.getSelectedDevices();
        const n229 = l229.deviceList
            .filter(r229 => !m229.some(s229 => s229.instUuid === r229.instUuid))
            .map(q229 => q229.instUuid);
        const o229 = await this.aiEngine.runAiTask(AiTaskType.TASK_LAYOUT_PLACE, l229, { prompt: k229, lockedUuids: n229 }, (p229) => this.onAiProgress(p229));
        if (o229.success && o229.topology) {
            this.schematicEditor.loadTopology(o229.topology);
            this.onProjectChanged();
            this.onStatusMessage('布局优化完成');
            return true;
        }
        return false;
    }
    setOfflineMode(j229: boolean): void {
        (this.aiApiManager as AiApiManagerImpl).networkMode.setOfflineMode(j229);
    }
    setGlobalProxy(i229: string): void {
        (this.aiApiManager as AiApiManagerImpl).networkMode.setGlobalProxy(i229);
    }
    setAccessibility(h229: AccessibilityConfig): void {
        this.accessibility = h229;
    }
    getAccessibility(): AccessibilityConfig {
        return {
            highContrast: this.accessibility.highContrast,
            keyboardOnly: this.accessibility.keyboardOnly,
            uiScale: this.accessibility.uiScale,
            screenReader: this.accessibility.screenReader
        };
    }
    injectFault(d229: string, e229: FaultType): ApiResult<FaultInjection> {
        const f229 = FeatureGate.canUseFaultInjection();
        if (!f229.success) {
            return ResultHelper.fail<FaultInjection>(f229.errCode, f229.error);
        }
        const g229 = (this.simulationKernel as SimulationKernelImpl).injectFault(d229, e229);
        if (g229.success) {
            this.reloadSimulationFromSchematic();
        }
        return g229;
    }
    clearFaults(): void {
        const a229 = this.simulationKernel as SimulationKernelImpl;
        const b229 = a229.listFaults();
        for (let c229 = 0; c229 < b229.length; c229++) {
            a229.removeFault(b229[c229].id);
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
    listUserProjectFiles(): string[] {
        const v228 = this.getUserProjectDir();
        try {
            const x228 = fs.listFileSync(v228);
            const y228: string[] = [];
            for (let z228 = 0; z228 < x228.length; z228++) {
                if (x228[z228].endsWith('.schsim')) {
                    y228.push(`${v228}/${x228[z228]}`);
                }
            }
            return y228.sort();
        }
        catch (w228) {
            return [];
        }
    }
    getTemplateDir(): string {
        return ProjectPaths.templateRoot(this.appBaseDir);
    }
    getHexDir(): string {
        return ProjectPaths.hexRoot(this.appBaseDir);
    }
    listHexFiles(): string[] {
        return TemplateProjectBootstrap.listHexFiles(this.appBaseDir);
    }
    listAvailableLabTemplates(p228: string = 'all'): LabTemplate[] {
        const q228 = p228 === 'all'
            ? this.teachingService.listTemplates()
            : this.teachingService.listTemplatesByCategory(p228);
        const r228: LabTemplate[] = [];
        for (let s228 = 0; s228 < q228.length; s228++) {
            const t228 = q228[s228];
            const u228 = ProjectPaths.templateFile(this.appBaseDir, t228.id);
            if (TemplateProjectBootstrap.fileExists(u228)) {
                r228.push(t228);
            }
        }
        return r228;
    }
    async loadLabTemplate(e228: string): Promise<boolean> {
        const f228 = ProjectPaths.templateFile(this.appBaseDir, e228);
        if (!TemplateProjectBootstrap.fileExists(f228)) {
            this.onStatusMessage(`模板工程不存在: ${f228}`);
            return false;
        }
        if (this.currentProject === null) {
            this.newProject('Untitled');
        }
        const g228 = await (this.filePersistence as FilePersistenceImpl).loadProjectData(f228);
        if (!g228.success || g228.data === undefined) {
            this.onStatusMessage(`读取模板失败: ${g228.error ?? f228}`);
            return false;
        }
        const h228 = TopologyAdapter.fromTopology(g228.data.topology);
        const i228 = this.schematicEditor as SchematicEditorImpl;
        const j228 = i228.getDocument();
        TemplateMergeUtil.mergeTemplateInto(j228, h228);
        i228.loadDocument(j228);
        i228.rebuildNetPinConnectivity();
        const k228 = j228.metadata.gridSize || 10;
        ensureNetPinConnectivity(j228, k228, this.pinGeometryResolver());
        this.syncProjectFromModules();
        this.reloadSimulationFromSchematic();
        i228.fitAllInView();
        this.onProjectChanged();
        const l228 = this.teachingService.listTemplates().find(o228 => o228.id === e228);
        const m228 = l228 !== undefined ? l228.name : e228;
        const n228 = this.getTemplateHexPath(e228);
        if (n228 !== null) {
            if (TemplateProjectBootstrap.fileExists(n228)) {
                this.onStatusMessage(`已将实验「${m228}」插入（固件 ${n228}，请在 MCU 调试面板烧录）`);
            }
            else {
                this.onStatusMessage(`已将实验「${m228}」插入；固件缺失: ${n228}`);
            }
        }
        else {
            this.onStatusMessage(`已将实验「${m228}」插入当前工程空白区域`);
        }
        return true;
    }
    getTemplateHexPath(c228: string): string | null {
        const d228 = this.teachingService.getTemplateHexFileName(c228);
        if (d228 === null) {
            return null;
        }
        return ProjectPaths.hexFile(this.appBaseDir, d228);
    }
    isHexFileReady(b228: string): boolean {
        return TemplateProjectBootstrap.fileExists(b228);
    }
    stepPowerOn(z227: number): void {
        const a228 = this.teachingService.stepPowerOnSequence(this.getTopology(), z227);
        this.schematicEditor.loadTopology(a228);
        this.onProjectChanged();
        this.reloadSimulationFromSchematic();
    }
    saveSnapshot(x227: string, y227: string): void {
        void this.createSnapshot(x227, y227);
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
        EventBus.getInstance().subscribe(ModuleEvent.SIMULATION_STEP, () => {
            CallbackRegistry.getInstance().emitWave(this.simulationKernel.getAllWaveData());
        });
        EventBus.getInstance().subscribe(ModuleEvent.AI_TASK_PROGRESS, (w227) => {
            this.onAiProgress(w227.data as ProgressInfo);
        });
    }
    private wireCallbacks(): void {
        CallbackRegistry.getInstance().onErcUpdate((v227) => {
            traceErcErrorList(v227, 'RUNTIME_ERC');
            this.onErcUpdate(v227);
        });
        CallbackRegistry.getInstance().onBreakpointHit((t227, u227) => {
            this.onStatusMessage(`断点命中: MCU ${t227} @ 0x${u227.toString(16)}`);
        });
        CallbackRegistry.getInstance().onUartRecv((r227, s227) => {
            Logger.info('uart', `MCU ${r227} RX: 0x${s227.toString(16)}`);
        });
    }
    private wireBomLookup(): void {
        const o227 = this.filePersistence as FilePersistenceImpl;
        const p227 = this.componentLibrary as ComponentLibraryImpl;
        const q227 = new BomLookupImpl(p227);
        o227.setBomLookup(q227);
    }
    private wireComponentBoundsResolver(): void {
        const a227 = this.schematicEditor as SchematicEditorImpl;
        const b227 = this.componentLibrary as ComponentLibraryImpl;
        a227.setComponentBoundsResolver((l227: string): SymbolBounds | null => {
            const m227 = b227.resolveLibraryId(l227);
            const n227 = b227.getComponent(m227);
            if (!n227.success || n227.data === undefined) {
                return null;
            }
            return calcSymbolBounds(n227.data.pins, 8);
        });
        a227.setPinResolver((i227: string): Pin[] | null => {
            const j227 = b227.resolveLibraryId(i227);
            const k227 = b227.getComponent(j227);
            if (!k227.success || k227.data === undefined) {
                return null;
            }
            return k227.data.pins;
        });
        a227.setDefaultParamsResolver((c227: string): Map<string, string> | null => {
            const d227 = b227.resolveLibraryId(c227);
            const e227 = b227.getComponent(d227);
            if (!e227.success || e227.data === undefined) {
                return null;
            }
            const f227 = new Map<string, string>();
            e227.data.defaultParams.forEach((g227: string, h227: string) => {
                f227.set(h227, g227);
            });
            return f227;
        });
    }
    private async bootstrapAndLoadLibrary(y226: common.UIAbilityContext, z226: string): Promise<void> {
        await DeviceLibraryBootstrap.ensureLibrary(y226, z226);
        this.initDeviceLibrary(z226);
    }
    private initDeviceLibrary(v226: string): void {
        const w226 = this.componentLibrary as ComponentLibraryImpl;
        const x226 = w226.initFromDeviceLibrary(v226);
        if (x226.success && x226.data !== undefined && x226.data > 0) {
            this.onStatusMessage(`精确器件库已加载 ${x226.data} 项 (v${w226.getLibraryVersion()})`);
            return;
        }
        Logger.info('component_library', `DeviceLibrary 未从 ${v226} 加载，使用内置库`);
    }
    private async loadProteusAliases(o226: common.UIAbilityContext): Promise<void> {
        try {
            const q226 = await o226.resourceManager.getRawFileContent('proteus_alias.json');
            const r226 = this.componentLibrary as ComponentLibraryImpl;
            let s226 = '';
            for (let u226 = 0; u226 < q226.length; u226++) {
                s226 += String.fromCharCode(q226[u226]);
            }
            const t226 = r226.loadProteusAliases(s226);
            if (t226 > 0) {
                Logger.info('component_library', `Proteus 别名表已加载 ${t226} 项`);
            }
        }
        catch (p226) {
            Logger.info('component_library', 'proteus_alias.json 未找到，使用内置别名');
        }
    }
    cycleGridSize(): number {
        const i226: number[] = [5, 10, 20, 50];
        const j226 = this.schematicEditor;
        const k226 = j226.getViewport().gridSize;
        let l226 = 0;
        for (let n226 = 0; n226 < i226.length; n226++) {
            if (i226[n226] === k226)
                l226 = n226;
        }
        const m226 = i226[(l226 + 1) % i226.length];
        j226.setGridSize(m226);
        this.onStatusMessage(`网格尺寸: ${m226}px`);
        return m226;
    }
    toggleTheme(): boolean {
        const h226 = ThemeManager.getInstance().toggle();
        this.onStatusMessage(h226 === 'dark' ? '已切换深色主题' : '已切换浅色主题');
        return h226 === 'dark';
    }
    private onSchematicChanged = (g226: ModuleEventPayload): void => {
        if (this.currentProject) {
            this.currentProject.schematic = this.schematicEditor.getDocument();
        }
        this.reloadSimulationFromSchematic();
    };
    registerKeyboardShortcuts(): void {
        const z225 = KeyboardShortcutManager.getInstance();
        z225.clear();
        const a226 = this.schematicEditor;
        z225.register({ key: 'z', ctrl: true, description: '撤销', handler: () => { a226.undo(); } });
        z225.register({ key: 'y', ctrl: true, description: '重做', handler: () => { a226.redo(); } });
        z225.register({ key: 'a', ctrl: true, description: '全选', handler: () => { a226.selectAll(); } });
        z225.register({ key: 'c', ctrl: true, description: '复制', handler: () => { this.copyHandler(); } });
        z225.register({ key: 'v', ctrl: true, description: '粘贴', handler: () => { this.pasteHandler(); } });
        z225.register({ key: 'x', ctrl: true, description: '剪切', handler: () => { this.cutHandler(); } });
        z225.register({ key: 'Delete', description: '删除', handler: () => {
                const d226 = a226.getSelectedDevices();
                if (d226.length > 0) {
                    const e226: string[] = [];
                    for (let f226 = 0; f226 < d226.length; f226++)
                        e226.push(d226[f226].instUuid);
                    a226.batchDeleteDevice(e226);
                }
            } });
        z225.register({ key: 'r', description: '旋转', handler: () => {
                const c226 = a226.getSelectedDevices();
                if (c226.length > 0)
                    a226.rotateDevice(c226[0].instUuid, 90);
            } });
        z225.register({ key: 'm', description: '镜像', handler: () => {
                const b226 = a226.getSelectedDevices();
                if (b226.length > 0)
                    a226.mirrorDevice(b226[0].instUuid, true);
            } });
        z225.register({ key: ' ', description: '切换布线', handler: () => { this.wireToolToggleHandler(); } });
        z225.register({ key: 'f', description: '适应窗口', handler: () => { a226.fitAllInView(); } });
        z225.register({ key: 'g', description: '循环网格', handler: () => { this.cycleGridSize(); } });
        z225.register({ key: 'Escape', description: '取消选择', handler: () => { a226.setSelection([]); } });
    }
    handleShortcut(w225: string, x225: boolean, y225: boolean): boolean {
        return KeyboardShortcutManager.getInstance().handleKey(w225, x225, y225);
    }
    async connectCollab(v225: string): Promise<boolean> {
        return this.collabSync.connect(v225, this.sessionHolderId);
    }
    disconnectCollab(): void {
        this.collabSync.disconnect();
    }
    getCollabPresence(): CollabPresence[] {
        return this.collabSync.getPresence();
    }
    broadcastCollabCursor(t225: number, u225: number): void {
        this.collabSync.broadcastCursor(t225, u225, this.sessionUserName);
    }
    async acceptPrivacyPolicy(): Promise<void> {
        await PrivacyConsentStore.recordConsent();
        this.onStatusMessage('已记录隐私政策同意');
    }
    async hasPrivacyConsent(): Promise<boolean> {
        return PrivacyConsentStore.hasConsent();
    }
    async runAiValidationSuite(): Promise<string> {
        const r225 = this.aiEngine as AiEngineImpl;
        const s225 = await r225.runValidationSuite();
        this.onStatusMessage(s225);
        return s225;
    }
    exportLibraryPack(o225: string): string {
        const p225 = this.componentLibrary as ComponentLibraryImpl;
        const q225 = p225.exportOfflinePack(o225);
        return q225.success ? (q225.data ?? '') : (q225.error ?? 'export failed');
    }
    importLibraryPack(l225: string): number {
        const m225 = this.componentLibrary as ComponentLibraryImpl;
        const n225 = m225.importOfflinePack(l225);
        return n225.success ? (n225.data ?? 0) : 0;
    }
}
