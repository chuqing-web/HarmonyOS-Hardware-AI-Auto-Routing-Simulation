/**
 * 应用服务门面 v2 - 统一七大模块 + 业务场景闭环
 */
import { SchematicEditorImpl, ISchematicEditor } from 'schematic_editor';
import { ComponentLibraryImpl, IComponentLibrary } from 'component_library';
import { SimulationKernelImpl, ISimulationKernel } from 'simulation_kernel';
import { HexDebuggerImpl, IHexDebugger, McuBehaviorSimulator } from 'hex_debugger';
import { AiApiManagerImpl, IAiApiManager } from 'ai_api_manager';
import { AiEngineImpl, IAiEngine, TeachingService, TemplateFirmware } from 'ai_engine';
import { FilePersistenceImpl, CrashGuard, IFilePersistence, BomLookup, SessionState } from 'file_persistence';
import { VirtualInstrumentsImpl, IVirtualInstruments } from 'instruments';
import { PluginManagerImpl, IPluginManager } from 'plugin_system';
import { common } from '@kit.AbilityKit';
import fs from '@ohos.file.fs';
import { DeviceLibraryBootstrap } from '../utils/DeviceLibraryBootstrap';
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
  paramMapGet, PrivacyConsentStore, Pin, McuFamily
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
  private simStepCount: number = 0;

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
    const baseDir = `${filesDir}/AISchSim`;
    // Ensure base directories exist
    try { fs.accessSync(baseDir); } catch (_e) { try { fs.mkdirSync(baseDir); } catch (_e2) {} }
    try { fs.accessSync(`${baseDir}/autosave`); } catch (_e) { try { fs.mkdirSync(`${baseDir}/autosave`); } catch (_e2) {} }
    try { fs.accessSync(`${baseDir}/projects`); } catch (_e) { try { fs.mkdirSync(`${baseDir}/projects`); } catch (_e2) {} }
    ThemeManager.getInstance().init(baseDir);
    (this.filePersistence as FilePersistenceImpl).setAppBaseDir(baseDir);
    this.filePersistence.initCollaboration(baseDir);
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

  /** Wire the voltmeter/ammeter engine to read from actual circuit nets for a given component instance. */
  refreshInstrumentReaderForComponent(compInstId: string): void {
    const doc = this.schematicEditor.getDocument();
    const comp = doc.components.find(c => c.id === compInstId);
    if (comp === undefined) {
      this.clearPerComponentReaders();
      return;
    }

    const isRunning = this.simulationKernel.isSimRunning();
    if (!isRunning) {
      this.clearPerComponentReaders();
      return;
    }

    // Find nets connected to this component's pins by scanning net.pinIds
    // Pin ref format: compId:pinId:pinName
    const pinNets = new Map<string, string>(); // pinName → netId
    const allPinNetIds: string[] = [];
    for (const net of doc.nets) {
      for (const pinRef of net.pinIds) {
        const parts = pinRef.split(':');
        if (parts.length >= 2 && parts[0] === compInstId) {
          const pinLabel = parts.length >= 3 ? parts[2] : parts[1];
          pinNets.set(pinLabel.toUpperCase(), net.id);
          // Also index by the bare pin ID (parts[1])
          if (!pinNets.has(parts[1].toUpperCase())) {
            pinNets.set(parts[1].toUpperCase(), net.id);
          }
          if (!allPinNetIds.includes(net.id)) {
            allPinNetIds.push(net.id);
          }
        }
      }
    }

    const findNetForPin = (pinLabel: string): string | null => {
      return pinNets.get(pinLabel.toUpperCase()) ?? null;
    };

    const kernel = this.simulationKernel as SimulationKernelImpl;
    const upperId = comp.libraryId.toUpperCase();

    if (upperId.includes('VOLTMETER')) {
      // Voltmeter: find two nets it sits across — typically V+ and V- (or COM)
      const netPlus = findNetForPin('V+') ?? findNetForPin('PLUS') ?? findNetForPin('+') ?? findNetForPin('A') ??
        (allPinNetIds.length > 0 ? allPinNetIds[0] : null);
      const netCom = findNetForPin('COM') ?? findNetForPin('V-') ?? findNetForPin('-') ?? findNetForPin('GND') ?? findNetForPin('B') ??
        (allPinNetIds.length > 1 ? allPinNetIds[1] : '0');
      if (netPlus !== null) {
        this.instruments.setVoltmeterReader(() => {
          const vPlus = kernel.getNetVoltageByUuid(netPlus);
          const vCom = kernel.getNetVoltageByUuid(netCom ?? '0');
          return vPlus - vCom;
        });
      } else {
        this.instruments.setVoltmeterReader(null);
      }
    } else if (upperId.includes('VIRTUAL_METER') || upperId === 'MULTIMETER') {
      // Multimeter: find two probe nets — V+/COM or A/B
      const netPlus = findNetForPin('V+') ?? findNetForPin('PLUS') ?? findNetForPin('+') ?? findNetForPin('A') ??
        findNetForPin('PROBE1') ?? (allPinNetIds.length > 0 ? allPinNetIds[0] : null);
      const netCom = findNetForPin('COM') ?? findNetForPin('V-') ?? findNetForPin('-') ?? findNetForPin('GND') ??
        findNetForPin('B') ?? findNetForPin('PROBE2') ??
        (allPinNetIds.length > 1 ? allPinNetIds[1] : '0');
      if (netPlus !== null) {
        this.instruments.setMultimeterReader(() => {
          return kernel.getNetVoltageByUuid(netPlus) - kernel.getNetVoltageByUuid(netCom ?? '0');
        });
      } else {
        this.instruments.setMultimeterReader(null);
      }
    } else if (upperId.includes('OSC') || upperId.includes('SCOPE')) {
      // Oscilloscope: auto-assign probes from connected nets
      this.instruments.autoAssignScopeProbes();
    } else if (upperId.includes('AMMETER')) {
      // Ammeter: is in series — measure current through the net it sits on
      const netPlus = findNetForPin('I+') ?? findNetForPin('PLUS') ?? findNetForPin('+') ?? findNetForPin('A') ??
        (allPinNetIds.length > 0 ? allPinNetIds[0] : null);
      const netMinus = findNetForPin('I-') ?? findNetForPin('MINUS') ?? findNetForPin('-') ?? findNetForPin('B') ??
        (allPinNetIds.length > 1 ? allPinNetIds[1] : null);
      if (netPlus !== null) {
        this.instruments.setAmmeterReader(() => {
          // Ammeter measures current flowing through it
          // First try: get current from the net (series connection means both sides are on the same net)
          const netCur = kernel.getNetCurrentByUuid(netPlus);
          if (Math.abs(netCur) > 1e-15) return netCur * 1000; // Convert to mA
          // Second try: compute from voltage difference across the ammeter's internal shunt (0.1 ohm)
          if (netMinus !== null) {
            const vDiff = kernel.getNetVoltageByUuid(netPlus) - kernel.getNetVoltageByUuid(netMinus);
            // Ammeter internal shunt is ~0.1 ohm → I = V/0.1 = V*10 in amps = V*10000 in mA
            if (Math.abs(vDiff) > 1e-9) return vDiff * 10000;
          }
          // Third try: get component current
          const compCur = kernel.getBranchCurrent(compInstId);
          if (Math.abs(compCur) > 1e-15) return compCur * 1000;
          return 0;
        });
      } else {
        this.instruments.setAmmeterReader(null);
      }
    } else if (upperId.includes('POWER') || upperId.includes('WATT')) {
      const netVPlus = findNetForPin('V+') ?? findNetForPin('VP') ?? findNetForPin('PLUS') ?? findNetForPin('+') ??
        (allPinNetIds.length > 0 ? allPinNetIds[0] : null);
      const netVCom = findNetForPin('V-') ?? findNetForPin('COM') ?? findNetForPin('GND') ?? findNetForPin('-') ??
        (allPinNetIds.length > 1 ? allPinNetIds[1] : '0');
      const netIPlus = findNetForPin('I+') ?? findNetForPin('IP') ?? findNetForPin('A+') ?? netVPlus;
      const netIMinus = findNetForPin('I-') ?? findNetForPin('IM') ?? findNetForPin('A-') ??
        (allPinNetIds.length > 2 ? allPinNetIds[2] : (allPinNetIds.length > 1 ? allPinNetIds[1] : '0'));

      if (netVPlus !== null) {
        this.instruments.setPowerMeterVoltageReader(() => {
          return kernel.getNetVoltageByUuid(netVPlus) - kernel.getNetVoltageByUuid(netVCom ?? '0');
        });
      } else {
        this.instruments.setPowerMeterVoltageReader(null);
      }
      if (netIPlus !== null) {
        this.instruments.setPowerMeterCurrentReader(() => {
          const netCur = kernel.getNetCurrentByUuid(netIPlus);
          if (Math.abs(netCur) > 1e-15) return netCur;
          const vDiff = kernel.getNetVoltageByUuid(netIPlus) - kernel.getNetVoltageByUuid(netIMinus ?? '0');
          if (Math.abs(vDiff) > 1e-9) return vDiff * 10; // Shunt = 0.1 ohm
          return 0;
        });
      } else {
        this.instruments.setPowerMeterCurrentReader(null);
      }
    } else if (upperId.includes('FREQ') || upperId.includes('COUNTER')) {
      const netSig = findNetForPin('IN') ?? findNetForPin('SIG') ?? findNetForPin('INPUT') ?? findNetForPin('+') ??
        (allPinNetIds.length > 0 ? allPinNetIds[0] : null);
      if (netSig !== null) {
        this.instruments.setFreqCounterReader((): number => {
          const waves: WaveData[] = kernel.getAllWaveData();
          let targetWave: WaveData | undefined = undefined;
          for (let wi: number = 0; wi < waves.length; wi++) {
            const w: WaveData = waves[wi];
            if (w.netName === netSig || w.probeName === netSig || w.netName.indexOf(netSig) >= 0) {
              targetWave = w;
              break;
            }
          }
          if (targetWave === undefined && waves.length > 0) {
            targetWave = waves[0];
          }
          if (targetWave === undefined || targetWave.timeAxis.length < 4) return 0;
          const ta: number[] = targetWave.timeAxis;
          const va: number[] = targetWave.voltageAxis;
          let maxV: number = va[0];
          let minV: number = va[0];
          for (let k: number = 1; k < va.length; k++) {
            if (va[k] > maxV) maxV = va[k];
            if (va[k] < minV) minV = va[k];
          }
          const threshold: number = (maxV + minV) / 2;
          let crossings: number = 0;
          let firstCross: number = -1;
          for (let i: number = 1; i < va.length; i++) {
            if ((va[i - 1] < threshold && va[i] >= threshold) ||
                (va[i - 1] > threshold && va[i] <= threshold)) {
              if (firstCross < 0) firstCross = ta[i];
              crossings++;
            }
          }
          if (crossings < 2) return 0;
          const lastCrossVal: number = ta[ta.length - 1];
          const period: number = 2 * (lastCrossVal - firstCross) / (crossings - 1);
          if (period <= 0) return 0;
          return 1.0 / period;
        });
      } else {
        this.instruments.setFreqCounterReader(null);
      }
    }
  }

  /** Clear only per-component readers, preserving global fallbacks */
  clearPerComponentReaders(): void {
    this.instruments.setVoltmeterReader(null);
    this.instruments.setAmmeterReader(null);
    this.instruments.setPowerMeterVoltageReader(null);
    this.instruments.setPowerMeterCurrentReader(null);
    this.instruments.setFreqCounterReader(null);
    this.instruments.setMultimeterReader(null);
  }

  clearInstrumentReaders(): void {
    this.clearPerComponentReaders();
    this.clearInstrumentGlobalFallbacks();
  }

  /** Set up global fallback readers so instruments show simulation data even without a selected component */
  private setupInstrumentGlobalFallbacks(): void {
    const kernel = this.simulationKernel as SimulationKernelImpl;
    // Voltmeter: read the voltage of the first non-ground net
    this.instruments.setVoltmeterGlobalFallback(() => {
      const vm = kernel.getNodeVoltageMap();
      if (vm.size > 0) {
        return vm.values().next().value as number;
      }
      return 0;
    });
    // Ammeter: read current from first available branch
    this.instruments.setAmmeterGlobalFallback(() => {
      const cm = kernel.getBranchCurrentMap();
      if (cm.size > 0) {
        // Return in mA (map values are in amps)
        return (cm.values().next().value as number) * 1000;
      }
      return 0;
    });
    // Multimeter: read voltage from first net
    this.instruments.setMultimeterGlobalFallback(() => {
      const vm = kernel.getNodeVoltageMap();
      if (vm.size > 0) {
        return vm.values().next().value as number;
      }
      return 0;
    });
    // Power meter: voltage from first net, current from first branch
    this.instruments.setPowerMeterGlobalFallbacks(
      () => {
        const vm = kernel.getNodeVoltageMap();
        return vm.size > 0 ? vm.values().next().value as number : 0;
      },
      () => {
        const cm = kernel.getBranchCurrentMap();
        return cm.size > 0 ? cm.values().next().value as number : 0;
      }
    );
    // Frequency counter: estimate from first scope channel waveform
    this.instruments.setFreqCounterGlobalFallback(() => {
      const waveResult = this.instruments.getOscilloscopeWave(0);
      if (!waveResult.success) return 0;
      const data = waveResult.data;
      if (data === undefined || data.timeAxis.length < 4) return 0;
      const ta: number[] = data.timeAxis;
      const va: number[] = data.voltageAxis;
      let maxV: number = va[0];
      let minV: number = va[0];
      for (let i = 1; i < va.length; i++) {
        if (va[i] > maxV) maxV = va[i];
        if (va[i] < minV) minV = va[i];
      }
      const threshold: number = (maxV + minV) / 2;
      let crossings: number = 0;
      let firstCross: number = -1;
      for (let i = 1; i < va.length; i++) {
        if ((va[i - 1] < threshold && va[i] >= threshold) ||
            (va[i - 1] > threshold && va[i] <= threshold)) {
          if (firstCross < 0) firstCross = ta[i];
          crossings++;
        }
      }
      if (crossings < 2) return 0;
      const period: number = 2 * (ta[ta.length - 1] - firstCross) / (crossings - 1);
      return period > 0 ? 1.0 / period : 0;
    });
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
    this.simulationKernel.loadSchematic(this.currentProject.schematic);
    if (this.currentProject.mcuDebugConfig) {
      this.hexDebugger.configure(this.currentProject.mcuDebugConfig);
    }
    for (let i = 0; i < this.currentProject.aiConfigs.length; i++) {
      const cfg = this.currentProject.aiConfigs[i];
      this.aiApiManager.addApi(cfg);
    }
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

  startSimulation(): boolean {
    const topo = this.getTopology();
    const ercErrors = this.schematicEditor.runERC(topo);
    const critical = ercErrors.filter(e => e.severity === 'error' || e.severity === 'critical');
    if (critical.some(e => e.desc.includes('短路'))) {
      this.onStatusMessage('存在短路错误，禁止启动仿真');
      return false;
    }

    const cfg = defaultSimConfig();
    const result = this.simulationKernel.startSimulation(topo, cfg, (p) => {
      this.onAiProgress(p);
    });

    if (!result.success) {
      this.onStatusMessage(`仿真启动失败: ${result.error}`);
      return false;
    }

    this.schematicEditor.setSimBusy(true);
    this.simStepCount = 0;
    this.onStatusMessage('仿真运行中...');

    // Run initial batch of simulation steps to populate wave data immediately
    this.runSimBatch(200);

    // Set up global instrument fallbacks so instruments show data even without a selected component
    this.setupInstrumentGlobalFallbacks();

    // Auto-wire all instrument components on the schematic to the simulation
    this.autoWireAllInstruments();
    // Auto-connect signal generators to analog engine
    this.autoWireSignalGenerators();

    // Start periodic stepping to continuously generate data for instruments
    this.simTimer = setInterval(() => {
      if (!this.simulationKernel.isSimRunning()) {
        clearInterval(this.simTimer);
        this.simTimer = -1;
        return;
      }
      this.runSimBatch(10);
      // Refresh instrument readers every few batches
      if (this.simStepCount % 50 === 0) {
        this.autoWireAllInstruments();
      }
    }, 50);

    return true;
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
    // Auto-assign probes on first batch
    if (this.simStepCount <= count * 2) {
      (this.instruments as VirtualInstrumentsImpl).autoAssignScopeProbes();
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
    if (this.simTimer >= 0) {
      clearInterval(this.simTimer);
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
    return (this.simulationKernel as SimulationKernelImpl).injectFault(instUuid, faultType);
  }

  clearFaults(): void {
    const kernel = this.simulationKernel as SimulationKernelImpl;
    const faults = kernel.listFaults();
    for (let i = 0; i < faults.length; i++) {
      kernel.removeFault(faults[i].id);
    }
  }

  batchFaultScan(): FaultScanResult[] {
    return (this.simulationKernel as SimulationKernelImpl).batchFaultScan();
  }

  loadLabTemplate(templateId: string): boolean {
    const r = this.teachingService.loadTemplate(templateId);
    if (r.success && r.data) {
      this.schematicEditor.loadTopology(r.data);
      this.onProjectChanged();
      // 自动加载模板关联的固件
      const fw = this.teachingService.getTemplateFirmware(templateId);
      if (fw) {
        const family = fw.mcuFamily === '8051' ? McuFamily.MCU_8051 : McuFamily.MCU_STM32F1;
        this.hexDebugger.loadHexFromString(fw.hexText, family);
      }
      return true;
    }
    return false;
  }

  stepPowerOn(stepIndex: number): void {
    const topo = this.teachingService.stepPowerOnSequence(this.getTopology(), stepIndex);
    this.schematicEditor.loadTopology(topo);
    this.onProjectChanged();
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
      const waves = this.simulationKernel.getAllWaveData();
      this.instruments.feedSimulationWaves(waves);
      CallbackRegistry.getInstance().emitWave(waves);
      this.onWaveUpdate(waves);
    });
    EventBus.getInstance().subscribe(ModuleEvent.AI_TASK_PROGRESS, (payload) => {
      this.onAiProgress(payload.data as ProgressInfo);
    });
  }

  private wireCallbacks(): void {
    CallbackRegistry.getInstance().onErcUpdate((errors) => this.onErcUpdate(errors));
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
