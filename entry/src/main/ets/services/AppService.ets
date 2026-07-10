/**
 * 应用服务门面 v2 - 统一七大模块 + 业务场景闭环
 */
import { SchematicEditorImpl, ISchematicEditor } from 'schematic_editor';
import { ComponentLibraryImpl, IComponentLibrary } from 'component_library';
import { SimulationKernelImpl, ISimulationKernel } from 'simulation_kernel';
import { HexDebuggerImpl, IHexDebugger, McuBehaviorSimulator } from 'hex_debugger';
import { AiApiManagerImpl, IAiApiManager } from 'ai_api_manager';
import { AiEngineImpl, IAiEngine, TeachingService, LabTemplate } from 'ai_engine';
import { FilePersistenceImpl, CrashGuard, IFilePersistence, BomLookup, SessionState } from 'file_persistence';
import { VirtualInstrumentsImpl, IVirtualInstruments, ComponentInstrumentBinding } from 'instruments';
import { PluginManagerImpl, IPluginManager } from 'plugin_system';
import { common } from '@kit.AbilityKit';
import fs from '@ohos.file.fs';
import { DeviceLibraryBootstrap } from '../utils/DeviceLibraryBootstrap';
import { TemplateProjectBootstrap } from '../utils/TemplateProjectBootstrap';
import { TemplateMergeUtil } from '../utils/TemplateMergeUtil';
import { ProjectPaths } from '../utils/ProjectPaths';
import { KeyboardShortcutManager } from '../utils/KeyboardShortcutManager';
import { ThemeManager } from '../theme/ThemeManager';
import {
  ProjectFile, EventBus, ModuleEvent, ModuleEventPayload,
  CallbackRegistry, SchTopology, WaveData, ErcError,
  AiTaskType, ProgressInfo, defaultSimConfig, Logger,
  FaultType, FaultInjection, FaultScanResult, AccessibilityConfig,
  ExportPostProcessor, ApiResult, ResultHelper,
  LicenseManager, LicenseStatus, FeatureGate, UsageDashboard,
  SchematicAnnotationType, SchematicAnnotationStatus,
  SnapshotMeta, VersionCompareReport, IdUtil, calcSymbolBounds, SymbolBounds,
  paramMapGet, PrivacyConsentStore, Pin, McuFamily, SimulationState, SchematicDocument, NetType,
  getPinNetMap, findNetForPinLabel, TopologyAdapter,
  traceBindingRefresh, traceActiveComponent, traceActiveComponentChanged, traceReloadSchematic, traceSimStep,
  tracePinNetEmpty, BindingTraceInfo, INSTR_TRACE_TAG, traceMeasure, formatPinNetMap,
  ensureNetPinConnectivity, PinGeometryResolver, PinGeometry,
  traceProjectOpenAudit, traceSimStartupAudit, traceDataFlow, traceErcErrorList
} from 'common';
import { CollabSyncClient, CollabPresence } from 'file_persistence';

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
  private simTimer: number = -1;
  private simTickScheduled: boolean = false;
  private simStepCount: number = 0;
  private readonly SIM_TICK_MS: number = 50;
  private lastActiveInstrumentId: string | null = null;
  private bindingPinHash: Map<string, string> = new Map();
  private appBaseDir: string = '';

  onProjectChanged: () => void = () => {};
  onStatusMessage: (msg: string) => void = () => {};
  onErcUpdate: (errors: ErcError[]) => void = () => {};
  onWaveUpdate: (waves: WaveData[]) => void = () => {};
  onAiProgress: (p: ProgressInfo) => void = () => {};
  wireToolToggleHandler: () => void = () => {};
  copyHandler: () => void = () => {};
  pasteHandler: () => void = () => {};
  cutHandler: () => void = () => {};

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

  initPlatform(context: common.UIAbilityContext): void {
    const filesDir = context.filesDir;
    const baseDir = `${filesDir}/${ProjectPaths.APP_ROOT}`;
    this.appBaseDir = baseDir;
    try { fs.accessSync(baseDir); } catch (_e) { try { fs.mkdirSync(baseDir); } catch (_e2) {} }
    try { fs.accessSync(`${baseDir}/${ProjectPaths.AUTOSAVE_DIR}`); } catch (_e) {
      try { fs.mkdirSync(`${baseDir}/${ProjectPaths.AUTOSAVE_DIR}`); } catch (_e2) {}
    }
    try { fs.mkdirSync(ProjectPaths.userProjectRoot(baseDir), true); } catch (_e) {}
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
      this.onStatusMessage('仿真已暂停');
      return true;
    }
    if (kernel.getState() === SimulationState.PAUSED) {
      kernel.resumeSim();
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
   */
  readVoltmeterDeltaForComponent(compInstId: string): number | null {
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
    traceMeasure(comp.refDes, 'V', kernel.isSimActive(),
      `UI V+(${this.netLabel(doc, netPlus)})=${vPlus.toFixed(4)}V ` +
      `COM(${this.netLabel(doc, netCom)})=${vCom.toFixed(4)}V ` +
      `Δ=${delta.toFixed(4)}V sign=${delta >= 0 ? '+' : '-'} (${delta >= 0 ? 'V+>COM' : 'COM>V+'})`);
    return delta;
  }

  /** Read ammeter branch current (mA, signed I+→I-) for a specific instance. */
  readAmmeterCurrentForComponent(compInstId: string): number | null {
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
      traceMeasure(comp.refDes, 'I', kernel.isSimActive(),
        `UI I+→I- I=${mA.toFixed(4)}mA sign=${iBranch >= 0 ? '+' : '-'}`);
      return mA;
    }
    return null;
  }

  isSimulationRunning(): boolean {
    const kernel = this.simulationKernel as SimulationKernelImpl;
    return kernel.isSimActive() && kernel.getState() === SimulationState.RUNNING;
  }

  /** 仿真运行或暂停中 — 禁止改原理图/接线 */
  isSimulationActive(): boolean {
    return (this.simulationKernel as SimulationKernelImpl).isSimActive();
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
  private buildNetVoltageDetail(
    doc: SchematicDocument,
    kernel: SimulationKernelImpl,
    netIds: string[]): string {
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
    } else if (upperId.includes('LOGIC') || upperId.includes('ANALYZER') || upperId.startsWith('LA')) {
      for (let ch = 1; ch <= 8; ch++) {
        const net = findNetForPin(`CH${ch}`) ?? findNetForPin(`D${ch - 1}`) ?? findNetForPin(`IN${ch}`);
        if (net !== null) {
          binding.logicProbes.push(net);
        }
      }
    } else if (upperId.includes('VOLTMETER') || upperId.includes('VIRTUAL_METER') || upperId === 'MULTIMETER') {
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
          traceMeasure(comp.refDes, 'V', kernel.isSimActive(),
            `V+(${this.netLabel(doc, vPlusId)})=${vPlus.toFixed(4)}V ` +
            `COM(${this.netLabel(doc, vComId)})=${vCom.toFixed(4)}V ` +
            `Δ=${delta.toFixed(4)}V sign=${delta >= 0 ? '+' : '-'} (${delta >= 0 ? 'V+>COM' : 'COM>V+'})`);
          return delta;
        };
      }
    } else if (upperId.includes('AMMETER')) {
      const netPlus = findNetForPin('I+') ?? findNetForPin('PLUS') ?? findNetForPin('+');
      const netMinus = findNetForPin('I-') ?? findNetForPin('MINUS') ?? findNetForPin('-');
      if (netPlus !== null && netMinus !== null) {
        binding.currentReader = () => {
          const iBranch = kernel.getBranchCurrent(compInstId);
          if (Math.abs(iBranch) > 1e-15) {
            const mA = iBranch * 1000;
            traceMeasure(comp.refDes, 'I', kernel.isSimActive(),
              `I+(${this.netLabel(doc, netPlus)})→I-(${this.netLabel(doc, netMinus)}) ` +
              `I=${mA.toFixed(4)}mA sign=${iBranch >= 0 ? '+' : '-'} (${iBranch >= 0 ? 'I+→I-' : 'I-→I+'})`);
            return mA;
          }
          return 0;
        };
      }
    } else if (upperId.includes('POWER') || upperId.includes('WATT')) {
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
    } else if (upperId.includes('FREQ') || upperId.includes('COUNTER')) {
      const netSig = findNetForPin('IN') ?? findNetForPin('SIG') ?? findNetForPin('INPUT') ?? findNetForPin('+');
      if (netSig !== null) {
        binding.freqReader = (): number => {
          return AppService.estimateFrequencyFromWaves(kernel.getAllWaveData(), netSig);
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

  async saveProject(path: string): Promise<boolean> {
    if (!this.currentProject) return false;
    this.syncProjectFromModules();
    const lock = this.filePersistence.acquireProjectLock(
      path, this.sessionHolderId, this.sessionUserName, 'editable'
    );
    if (!lock.success) {
      this.onStatusMessage(lock.error ?? '无法获取工程锁');
      return false;
    }
    const result = await this.filePersistence.saveProject(this.currentProject, path);
    this.filePersistence.appendProjectChangeLog(
      this.sessionUserName, 'save', path, `保存工程 ${this.currentProject.name}`
    );
    this.currentProjectPath = path;
    this.onStatusMessage(result.success ? `已保存 ${path}` : `保存失败: ${result.error}`);
    return result.success;
  }

  async loadProject(path: string): Promise<boolean> {
    this.filePersistence.clearStaleProjectLock(path);
    const lock = this.filePersistence.acquireProjectLock(
      path, this.sessionHolderId, this.sessionUserName, 'editable'
    );
    if (!lock.success) {
      const info = this.filePersistence.getProjectLockInfo(path);
      if (info) {
        const roLock = this.filePersistence.acquireProjectLock(
          path, this.sessionHolderId, this.sessionUserName, 'read_only'
        );
        if (!roLock.success) {
          this.onStatusMessage(roLock.error ?? '工程被锁定');
          return false;
        }
        (this.schematicEditor as SchematicEditorImpl).setReadOnly(true);
        this.onStatusMessage(`只读模式打开（${info.holderName} 正在编辑）`);
      } else {
        this.onStatusMessage(lock.error ?? '无法打开工程');
        return false;
      }
    } else {
      (this.schematicEditor as SchematicEditorImpl).setReadOnly(false);
    }
    const result = await this.filePersistence.loadProject(path);
    if (!result.success || !result.data) return false;
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
    if (!this.currentProject) return;
    this.currentProject.schematic = this.schematicEditor.getDocument();
    this.currentProject.simulationConfig = this.simulationKernel.getConfig();
    this.currentProject.modifiedAt = new Date().toISOString();
    const editor = this.schematicEditor as SchematicEditorImpl;
    const bundle = this.filePersistence.buildCollaborationBundle(editor.getAnnotations());
    this.currentProject.collaboration = bundle;
  }

  async createSnapshot(versionLabel: string, note: string): Promise<SnapshotMeta | null> {
    const topo = this.getTopology();
    const result = await this.filePersistence.createProjectSnapshot(
      versionLabel, note, topo, this.sessionUserName
    );
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
    if (result.success && result.data) return result.data;
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
      this.filePersistence.appendProjectChangeLog(
        this.sessionUserName, 'annotation', targetUuid, text
      );
      this.syncProjectFromModules();
      this.onStatusMessage('批注已添加');
    } else {
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
    if (this.currentProject === null) return;
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
    } else {
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
    const result = this.simulationKernel.startSimulation(topo, cfg, (p) => {
      this.onAiProgress(p);
    });

    if (!result.success) {
      Logger.warn(INSTR_TRACE_TAG, `[SIM_START_FAIL] ${result.error ?? 'unknown'}`);
      this.onStatusMessage(`仿真启动失败: ${result.error}`);
      return false;
    }

    // Reload from editor doc so analog MNA uses rebuilt net.pinIds (not stale topology)
    (this.simulationKernel as SimulationKernelImpl).loadSchematic(doc);

    this.schematicEditor.setSimBusy(true);
    this.simStepCount = 0;
    this.onStatusMessage('仿真运行中...');

    // Run a small initial batch to populate wave data, then let the tick loop take over
    this.runSimBatch(20);

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
    traceSimStartupAudit(
      doc, this.simulationKernel.getState(), this.simStepCount,
      (netId: string) => kernel.getNetVoltageByUuid(netId),
      (netId: string) => kernel.getNetCurrentByUuid(netId),
      kernel.getNodeVoltageMap(), kernel.getBranchCurrentMap(),
      kernel.getAllWaveData(), kernel.netToSpiceNodeMap(), activeComp,
      (compId: string) => kernel.getBranchCurrent(compId));

    Logger.info(INSTR_TRACE_TAG,
      '仿真已启动 — DevEco 日志过滤 instr_trace 可追踪仪器绑定; setInstrTraceSimStep(true) 开启逐步采样');

    // Start periodic stepping using setTimeout chain to prevent overlap when main thread is busy
    this.scheduleSimTick();

    return true;
  }

  private scheduleSimTick(): void {
    if (this.simTickScheduled) {
      return;
    }
    const state = this.simulationKernel.getState();
    if (state !== SimulationState.RUNNING && state !== SimulationState.PAUSED) {
      return;
    }
    this.simTickScheduled = true;
    this.simTimer = setTimeout(() => {
      this.simTimer = -1;
      this.simTickScheduled = false;
      const currentState = this.simulationKernel.getState();
      if (currentState === SimulationState.PAUSED) {
        this.scheduleSimTick();
        return;
      }
      if (currentState !== SimulationState.RUNNING) {
        return;
      }
      this.runSimBatch(10);
      if (this.simStepCount % 50 === 0) {
        this.autoWireAllInstruments();
      }
      this.scheduleSimTick();
    }, this.SIM_TICK_MS);
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
              } else if (pinLabel === 'GND' || pinLabel === 'COM' || pinLabel === '-' ||
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

  /** Run a batch of simulation steps and feed wave data to instruments */
  private runSimBatch(count: number): void {
    if (this.simulationKernel.getState() !== SimulationState.RUNNING) {
      return;
    }
    const kernel = this.simulationKernel as SimulationKernelImpl;
    for (let i = 0; i < count; i++) {
      kernel.runSpiceStep();
      kernel.tickDigitalLogic();
      kernel.tickMcuCore();
      this.simStepCount++;
      // Feed per-step time snapshot to oscilloscope for live waveform display
      if (this.simStepCount % 5 === 0) {
        const voltages = kernel.getNodeVoltageMap();
        (this.instruments as VirtualInstrumentsImpl).feedScopeTimeSnapshot(
          kernel.globalTimeTick(), voltages);
      }
    }
    const waves = kernel.getAllWaveData();
    if (waves.length > 0) {
      this.instruments.feedSimulationWaves(waves);
    }
    const nodeVoltages = kernel.getNodeVoltageMap();
    const branchCurrents = kernel.getBranchCurrentMap();
    (this.instruments as VirtualInstrumentsImpl).feedScopeNodeData(nodeVoltages, branchCurrents);
    const activeComp = (this.instruments as VirtualInstrumentsImpl).getActiveInstrumentComponent();
    const digitalLevels = new Map<string, number>();
    nodeVoltages.forEach((voltage: number, netKey: string) => {
      digitalLevels.set(netKey, voltage > 1.65 ? 1 : 0);
    });
    (this.instruments as VirtualInstrumentsImpl).feedLogicDigitalStates(digitalLevels);
    traceSimStep(this.simStepCount, waves.length, waves, activeComp, nodeVoltages, branchCurrents);
    if (this.simStepCount % 50 === 0) {
      this.autoWireAllInstruments();
    }
    const stepData: SimStepData = { waves: waves, stepCount: this.simStepCount };
    EventBus.getInstance().publish({
      event: ModuleEvent.SIMULATION_STEP,
      source: 'app_service',
      timestamp: Date.now(),
      data: stepData as Object
    });
    this.onWaveUpdate(waves);
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
    const topo = this.getTopology();
    const result = await this.aiEngine.runAiTask(
      AiTaskType.TASK_AUTO_ROUTE_GLOBAL, topo, undefined,
      (p) => this.onAiProgress(p)
    );
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

  async aiGenerateCircuit(prompt: string): Promise<boolean> {
    const topo = this.getTopology();
    const result = await this.aiEngine.runAiTask(
      AiTaskType.TASK_FULL_PIPELINE, topo,
      { prompt },
      (p) => this.onAiProgress(p)
    );
    if (result.success && result.topology) {
      this.schematicEditor.loadTopology(result.topology);
      if (result.topology.wireList.length > 0) {
        this.schematicEditor.applyRouteResult({
          routeLines: result.topology.wireList,
          crossCount: 0, totalLineLength: 0,
          isolateAnalogDigital: true, xtalShortPath: true, diffLineEqualLength: false
        }, true);
      }
      this.runErc(false);
      this.onProjectChanged();
      this.onStatusMessage(`AI 闭环完成: ${result.topology.deviceList.length} 器件, ${result.analysisText ?? ''}`);
      return true;
    }
    this.onStatusMessage(result.errMsg || 'AI 生成失败');
    return false;
  }

  /** 局部框选器件重新摆放 */
  async aiOptimizePlacement(prompt: string = '规整布局'): Promise<boolean> {
    const topo = this.getTopology();
    const selected = this.schematicEditor.getSelectedDevices();
    const locked = topo.deviceList
      .filter(d => !selected.some(s => s.instUuid === d.instUuid))
      .map(d => d.instUuid);
    const result = await this.aiEngine.runAiTask(
      AiTaskType.TASK_LAYOUT_PLACE, topo,
      { prompt, lockedUuids: locked },
      (p) => this.onAiProgress(p)
    );
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
    } catch (_e) {
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
    const hexPath = this.getTemplateHexPath(templateId);
    if (hexPath !== null) {
      if (TemplateProjectBootstrap.fileExists(hexPath)) {
        this.onStatusMessage(`已将实验「${tplName}」插入（固件 ${hexPath}，请在 MCU 调试面板烧录）`);
      } else {
        this.onStatusMessage(`已将实验「${tplName}」插入；固件缺失: ${hexPath}`);
      }
    } else {
      this.onStatusMessage(`已将实验「${tplName}」插入当前工程空白区域`);
    }
    return true;
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
    EventBus.getInstance().subscribe(ModuleEvent.SIMULATION_STEP, () => {
      CallbackRegistry.getInstance().emitWave(this.simulationKernel.getAllWaveData());
    });
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
    } catch (_e) {
      Logger.info('component_library', 'proteus_alias.json 未找到，使用内置别名');
    }
  }

  cycleGridSize(): number {
    const sizes: number[] = [5, 10, 20, 50];
    const editor = this.schematicEditor;
    const current = editor.getViewport().gridSize;
    let idx = 0;
    for (let i = 0; i < sizes.length; i++) {
      if (sizes[i] === current) idx = i;
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
    this.reloadSimulationFromSchematic();
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
        for (let i = 0; i < devs.length; i++) ids.push(devs[i].instUuid);
        editor.batchDeleteDevice(ids);
      }
    }});
    km.register({ key: 'r', description: '旋转', handler: () => {
      const devs = editor.getSelectedDevices();
      if (devs.length > 0) editor.rotateDevice(devs[0].instUuid, 90);
    }});
    km.register({ key: 'm', description: '镜像', handler: () => {
      const devs = editor.getSelectedDevices();
      if (devs.length > 0) editor.mirrorDevice(devs[0].instUuid, true);
    }});
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
