import { AppService } from '../services/AppService';
import { SchematicCanvas } from '../components/SchematicCanvas';
import { PropertyPanel } from '../components/PropertyPanel';
import { McuDebugPanel } from '../components/McuDebugPanel';
import { AiSettingsPanel } from '../components/AiSettingsPanel';
import { PlatformSettingsPanel } from '../components/PlatformSettingsPanel';
import { InstrumentPanel } from '../components/InstrumentPanel';
import { FaultInjectionPanel } from '../components/FaultInjectionPanel';
import { TeachingPanel } from '../components/TeachingPanel';
import { ComponentPreview } from '../components/ComponentPreview';
import {
  ProteusVDivider, ProteusPanelTitle,
  ProteusNavTab, ProteusTreeRow, ProteusClassicBtn, ProteusSectionTitle,
  ProteusMenuTrigger, ProteusToolButton, ProteusToolGroup, ProteusResizer,
  ProteusMenuEntry
} from '../components/proteus/ProteusWidgets';
import { ProteusIcon, ProteusIconName } from '../components/proteus/ProteusIcons';
import { ProteusColors, ProteusDimens, ProteusFonts } from '../theme/ProteusTheme';
import { UiStateStore } from '../utils/UiStateStore';
import {
  CallbackRegistry, ErcError, ProgressInfo, Point2D, ComponentCategory,
  ComponentInstance, SchematicDocument, EventBus, ModuleEvent, ModuleEventPayload,
  McuFamily, isInstrumentLibraryId
} from 'common';
import { SchematicEditorImpl, AlignType } from 'schematic_editor';
import { EditorToolMode, toolModeLabel } from '../model/EditorToolMode';
import { AppViewModel } from '../viewmodel/AppViewModel';
import { common } from '@kit.AbilityKit';
import { picker } from '@kit.CoreFileKit';
import fs from '@ohos.file.fs';
import util from '@ohos.util';

interface CategoryNode {
  cat: ComponentCategory;
  label: string;
  expanded: boolean;
}

@Entry
@Component
struct Index {
  @State projectName: string = 'Untitled';
  @State simRunning: boolean = false;
  @State simPaused: boolean = false;
  @State simWaveTick: number = 0;
  @State statusMessage: string = '';
  @State canvasVersion: number = 0;
  @State selectedComponentId: string = '';
  @State searchKeyword: string = '';
  @State componentList: string[] = [];
  @State ercCount: number = 0;
  @State ercErrors: ErcError[] = [];
  @State aiProgress: number = 0;
  @State aiStage: string = '';
  @State mouseX: number = 0;
  @State mouseY: number = 0;
  @State zoomPercent: number = 100;
  @State gridVisible: boolean = true;
  @State rulerVisible: boolean = true;
  @State selectedCount: number = 0;
  @State navTab: number = 0;
  @State leftLibCollapsed: boolean = false;
  @State leftNavCollapsed: boolean = false;
  @State rightCollapsed: boolean = false;
  @State activeRightTab: number = 0;
  @State leftPanelWidth: number = 240;
  @State rightPanelWidth: number = 300;
  @State debugTabHasBadge: boolean = false;
  @State instrTabHasBadge: boolean = false;
  @State categoryNodes: CategoryNode[] = [];
  @State themeRefreshKey: number = 0;
  @State expandedCategories: Set<ComponentCategory> = new Set();
  @State selectedTreeItem: string = '';
  @State previewComponentId: string = '';
  @State toolMode: EditorToolMode = EditorToolMode.SELECT;
  @State showOpenDialog: boolean = false;
  @State openFilePath: string = '';
  @State showSaveAsDialog: boolean = false;
  @State saveAsPath: string = '';
  @State showBurnDialog: boolean = false;
  @State burnFilePath: string = '';
  @State burnMcuFamily: string = '';
  @State burnFirmwareInfo: string = '';
  @State burnSegmentInfo: string = '';
  @State burnEntryPoint: string = '0x0000';
  @State burnFileSize: string = '';
  @State wireStartActive: boolean = false;
  @State wireStartX: number = 0;
  @State wireStartY: number = 0;
  @State navRefreshKey: number = 0;
  @State showWelcomeDialog: boolean = false;
  @State showNewProjectDialog: boolean = false;
  @State newProjectNameInput: string = '';
  @State showRecoveryDialog: boolean = false;
  @State recoveryFiles: string[] = [];
  @State appInitialized: boolean = false;
  @State unsavedChanges: boolean = false;
  @State showExitConfirmDialog: boolean = false;

  private clipboardLibId: string = '';
  private projectBaseDir: string = '';
  private modifierKeys: number = 0;
  private appService: AppService = AppService.getInstance();
  private vm: AppViewModel = AppViewModel.getInstance(this.appService);
  private uiState: UiStateStore = UiStateStore.getInstance();

  async aboutToAppear(): Promise<void> {
    const ctx = getContext(this) as common.UIAbilityContext;
    this.projectBaseDir = `${ctx.filesDir}/AISchSim`;
    this.appService.initPlatform(ctx);
    this.vm.bindCallbacks();
    this.appService.onStatusMessage = (msg: string) => { this.statusMessage = msg; };
    this.appService.onErcUpdate = (errors: ErcError[]) => {
      this.ercCount = errors.length;
      this.ercErrors = errors;
    };
    this.appService.onAiProgress = (p: ProgressInfo) => {
      this.aiProgress = p.progress;
      this.aiStage = p.stage;
    };
    this.appService.onProjectChanged = () => {
      this.projectName = this.appService.currentProject?.name ?? 'Untitled';
      this.canvasVersion++;
    };
    this.appService.onWaveUpdate = (_waves) => {
      this.simWaveTick++;
    };

    CallbackRegistry.getInstance().onSelectionChange((devs) => {
      this.selectedCount = devs.length;
      if (devs.length > 0) {
        this.selectedComponentId = devs[0].instUuid;
        this.updateContextualTabs(devs[0].instUuid);
      } else if (this.selectedCount === 0) {
        this.selectedComponentId = '';
        this.debugTabHasBadge = false;
        this.instrTabHasBadge = false;
      }
    });

    EventBus.getInstance().subscribe(ModuleEvent.SCHEMATIC_CHANGED, this.onSchematicChanged);

    this.loadUiState();
    this.initCategoryTree();

    // Check for crash recovery files
    this.recoveryFiles = await this.appService.checkRecoveryFiles();
    if (this.recoveryFiles.length > 0) {
      this.appService.newProject('Untitled');
      this.appService.enableAutoSave(`${this.projectBaseDir}/autosave/Untitled.schsim`, 120000);
      this.showRecoveryDialog = true;
      this.appInitialized = true;
      this.statusMessage = '检测到未正常关闭的工程，是否恢复？';
      return;
    }

    // Check last session
    const session = await this.appService.loadSession();
    if (session !== null && session.lastPath.length > 0) {
      const autoSavePath = `${this.projectBaseDir}/autosave/${session.lastProjectName}.schsim`;
      if (session.closedCleanly) {
        // Normal last session — try to auto-open
        let ok = await this.appService.loadProject(session.lastPath);
        if (!ok && session.lastPath !== autoSavePath) {
          // content:// URI from file picker may have expired — fall back to auto-save
          ok = await this.appService.loadProject(autoSavePath);
        }
        if (ok) {
          this.projectName = this.appService.currentProject?.name ?? session.lastProjectName;
          this.appService.enableAutoSave(autoSavePath, 120000);
          this.resetAfterProjectChange();
          this.refreshComponentList();
          this.deferCanvasFit();
          this.appInitialized = true;
          this.statusMessage = `已恢复上次工程: ${this.projectName}`;
          return;
        }
      } else {
        // Last session was not cleanly closed — check recovery
        const ok = await this.appService.loadProject(autoSavePath);
        if (ok) {
          this.projectName = this.appService.currentProject?.name ?? session.lastProjectName;
          this.appService.enableAutoSave(autoSavePath, 120000);
          this.resetAfterProjectChange();
          this.refreshComponentList();
          this.deferCanvasFit();
          this.appInitialized = true;
          this.statusMessage = `已从自动保存恢复: ${this.projectName}`;
          return;
        }
      }
    }

    // No recovery, no last session — show welcome dialog
    this.appService.newProject('Untitled');
    this.appService.enableAutoSave(`${this.projectBaseDir}/autosave/Untitled.schsim`, 120000);
    this.refreshComponentList();
    this.deferCanvasFit();
    this.appInitialized = true;
    this.showWelcomeDialog = true;
    this.statusMessage = '欢迎使用 AI 原理图仿真 — 请新建或打开工程';
  }

  onPageHide(): void {
    // Save recovery cache when page is hidden (app going to background)
    void this.appService.saveRecoveryCache();
  }

  aboutToDisappear(): void {
    // Save session state before exit — marks last project for auto-reload on next launch
    void this.appService.saveSession(
      this.appService.currentProjectPath,
      this.projectName,
      !this.unsavedChanges  // true = clean shutdown, next launch auto-loads; false = may trigger recovery
    );
  }

  onBackPress(): boolean {
    if (this.unsavedChanges) {
      this.showExitConfirmDialog = true;
      return true; // consume the back event, keep app open
    }
    void this.appService.saveSession(
      this.appService.currentProjectPath,
      this.projectName,
      true
    );
    return false; // allow system to proceed with exit
  }

  loadUiState(): void {
    const s = this.uiState;
    this.leftLibCollapsed = s.leftLibCollapsed;
    this.leftNavCollapsed = s.leftNavCollapsed;
    this.rightCollapsed = s.rightCollapsed;
    this.activeRightTab = s.activeRightTab;
    this.leftPanelWidth = s.leftPanelWidth;
    this.rightPanelWidth = s.rightPanelWidth;
    this.gridVisible = s.gridVisible;
    this.rulerVisible = s.rulerVisible;
    this.toolMode = s.toolMode;
    this.expandedCategories = s.getExpandedCategories();
  }

  persistUiState(): void {
    const s = this.uiState;
    s.leftLibCollapsed = this.leftLibCollapsed;
    s.leftNavCollapsed = this.leftNavCollapsed;
    s.rightCollapsed = this.rightCollapsed;
    s.activeRightTab = this.activeRightTab;
    s.leftPanelWidth = this.leftPanelWidth;
    s.rightPanelWidth = this.rightPanelWidth;
    s.gridVisible = this.gridVisible;
    s.rulerVisible = this.rulerVisible;
    s.toolMode = this.toolMode;
    s.setExpandedCategories(this.expandedCategories);
  }

  updateContextualTabs(instUuid: string): void {
    const doc = this.appService.schematicEditor.getDocument();
    const comp = doc.components.find(c => c.id === instUuid);
    if (!comp) return;
    const lib = comp.libraryId.toUpperCase();
    const isMcu = lib.startsWith('STM32') || lib.startsWith('8051') || lib.startsWith('AT89') || lib.startsWith('AVR');
    const isInstr = isInstrumentLibraryId(comp.libraryId);
    this.debugTabHasBadge = isMcu;
    this.instrTabHasBadge = isInstr;
    if (isMcu) {
      this.activeRightTab = 3;
    } else if (isInstr) {
      this.activeRightTab = 4;
    }
  }

  private toggleSimPause(): void {
    if (!this.simRunning) {
      return;
    }
    this.simPaused = this.appService.toggleSimulationPause();
    this.statusMessage = this.simPaused ? '仿真已暂停' : '仿真已恢复';
  }

  initCategoryTree(): void {
    const cats = this.appService.componentLibrary.getCategories();
    const labels: Map<ComponentCategory, string> = new Map([
      [ComponentCategory.PASSIVE, 'Passive'],
      [ComponentCategory.DISCRETE, 'Discrete'],
      [ComponentCategory.ANALOG_IC, 'Analog IC'],
      [ComponentCategory.DIGITAL_IC, 'Digital IC'],
      [ComponentCategory.MEMORY, 'Memory'],
      [ComponentCategory.SENSOR, 'Sensor'],
      [ComponentCategory.PERIPHERAL, 'Peripheral'],
      [ComponentCategory.MCU_8051, '8051 MCU'],
      [ComponentCategory.MCU_STM32, 'STM32 MCU'],
      [ComponentCategory.INSTRUMENT, 'Instrument'],
      [ComponentCategory.POWER_SUPPLY, 'Power Supply']
    ]);
    const nodes: CategoryNode[] = [];
    const expanded = new Set<ComponentCategory>();
    for (let i = 0; i < cats.length; i++) {
      const cat = cats[i];
      nodes.push({ cat: cat, label: labels.get(cat) ?? cat, expanded: false });
      if (i === 0) {
        expanded.add(cat);
      }
    }
    this.categoryNodes = nodes;
    this.expandedCategories = expanded;
  }

  toggleCategory(cat: ComponentCategory): void {
    const copy = new Set(this.expandedCategories);
    if (copy.has(cat)) {
      copy.delete(cat);
    } else {
      copy.add(cat);
    }
    this.expandedCategories = copy;
  }

  refreshComponentList(): void {
    const kw = this.searchKeyword.trim();
    if (kw.length > 0) {
      const result = this.appService.componentLibrary.search(kw, 1, 50);
      this.componentList = result.items.map(c => `${c.id}|${c.name}`);
    } else {
      this.componentList = [];
    }
  }

  bumpCanvas(): void {
    this.canvasVersion++;
    this.navRefreshKey++;
  }

  /** Wait for canvas layout before fit/redraw — avoids partial first paint. */
  private deferCanvasFit(delayMs: number = 150): void {
    setTimeout(() => {
      this.appService.schematicEditor.fitAllInView();
      this.bumpCanvas();
    }, delayMs);
  }

  onPageShow(): void {
    this.deferCanvasFit(80);
    setTimeout(() => {
      this.bumpCanvas();
    }, 300);
  }

  resetAfterProjectChange(): void {
    this.selectedComponentId = '';
    this.selectedCount = 0;
    this.selectedTreeItem = '';
    this.previewComponentId = '';
    this.wireStartActive = false;
    this.wireStartX = 0;
    this.wireStartY = 0;
    this.toolMode = EditorToolMode.SELECT;
    this.unsavedChanges = false;
    this.bumpCanvas();
  }

  setToolMode(mode: EditorToolMode, pendingId: string = ''): void {
    this.toolMode = mode;
    this.wireStartActive = false;
    this.wireStartX = 0;
    this.wireStartY = 0;
    if (pendingId.length > 0) {
      this.previewComponentId = pendingId;
    } else if (mode === EditorToolMode.PLACE && this.previewComponentId.length === 0 &&
      this.selectedTreeItem.length > 0) {
      this.previewComponentId = this.selectedTreeItem.split('|')[0];
    }
    if (mode === EditorToolMode.PLACE) {
      if (this.previewComponentId.length > 0) {
        this.statusMessage = `Placing: ${this.previewComponentId}`;
      } else {
        this.statusMessage = 'Click on canvas to place component';
      }
    } else {
      this.statusMessage = `Mode: ${toolModeLabel(mode)}`;
    }
    this.uiState.toolMode = mode;
    this.bumpCanvas();
  }

  selectLibraryItem(item: string): void {
    this.selectedTreeItem = item;
    this.previewComponentId = item.split('|')[0];
    this.setToolMode(EditorToolMode.PLACE, this.previewComponentId);
  }

  handleNewProject(): void {
    this.showWelcomeDialog = false;
    this.showOpenDialog = false;
    this.showSaveAsDialog = false;
    this.newProjectNameInput = '';
    this.showNewProjectDialog = true;
  }

  doCreateNewProject(): void {
    const name = this.newProjectNameInput.trim().length > 0 ? this.newProjectNameInput.trim() : 'Untitled';
    this.showNewProjectDialog = false;
    this.showWelcomeDialog = false;
    this.appService.disableAutoSave();
    this.appService.newProject(name);
    this.projectName = name;
    this.resetAfterProjectChange();
    this.refreshComponentList();
    this.appService.schematicEditor.fitAllInView();
    const autoSavePath = `${this.projectBaseDir}/autosave/${name}.schsim`;
    this.appService.enableAutoSave(autoSavePath, 120000);
    this.appService.currentProjectPath = '';
    this.statusMessage = `已创建新工程: ${name}（使用 Ctrl+S 保存）`;
  }

  async handleOpenProject(): Promise<void> {
    this.showWelcomeDialog = false;
    try {
      const options = new picker.DocumentSelectOptions();
      options.maxSelectNumber = 1;
      options.fileSuffixFilters = ['.schsim', '.json'];
      const docPicker = new picker.DocumentViewPicker();
      const uris = await docPicker.select(options);
      if (uris && uris.length > 0) {
        const ok = await this.appService.loadProject(uris[0]);
        if (ok) {
          this.projectName = this.appService.currentProject?.name ?? this.projectName;
          const name = this.projectName;
          this.appService.disableAutoSave();
          this.appService.enableAutoSave(`${this.projectBaseDir}/autosave/${name}.schsim`, 120000);
          this.resetAfterProjectChange();
          this.appService.schematicEditor.fitAllInView();
          this.refreshComponentList();
          await this.appService.saveSession(uris[0], name, false);
          this.statusMessage = `已加载: ${uris[0]}`;
          return;
        }
      }
    } catch (_e) {
      // File picker not available or cancelled, show manual dialog
    }
    // Fallback: show manual path input dialog
    const recents = this.appService.filePersistence.getRecentFiles();
    this.openFilePath = recents.length > 0 ? recents[0] : `${this.projectBaseDir}/autosave/Untitled.schsim`;
    this.showOpenDialog = true;
    this.showSaveAsDialog = false;
  }

  async doOpenFromPath(): Promise<void> {
    this.showOpenDialog = false;
    this.showWelcomeDialog = false;
    if (this.openFilePath.trim().length === 0) {
      this.statusMessage = '请输入文件路径';
      return;
    }
    const path = this.openFilePath.trim();
    const ok = await this.appService.loadProject(path);
    if (ok) {
      this.projectName = this.appService.currentProject?.name ?? this.projectName;
      const name = this.projectName;
      this.appService.disableAutoSave();
      this.appService.enableAutoSave(`${this.projectBaseDir}/autosave/${name}.schsim`, 120000);
      this.resetAfterProjectChange();
      this.appService.schematicEditor.fitAllInView();
      this.refreshComponentList();
      await this.appService.saveSession(path, name, false);
      this.statusMessage = `已加载: ${path}`;
    } else {
      this.statusMessage = `无法打开: ${path}`;
    }
  }

  async handleSaveProject(): Promise<void> {
    const path = this.appService.currentProjectPath;
    if (path.length > 0) {
      const ok = await this.appService.saveProject(path);
      if (ok) {
        // Also sync auto-save so recovery works even if picker URI expires
        const autoPath = `${this.projectBaseDir}/autosave/${this.projectName}.schsim`;
        void this.appService.saveProject(autoPath);
        await this.appService.saveSession(path, this.projectName, false);
        this.unsavedChanges = false;
      }
      this.statusMessage = ok ? `已保存: ${path}` : '保存失败';
      return;
    }
    await this.handleSaveAs();
  }

  async handleSaveAs(): Promise<void> {
    try {
      const options = new picker.DocumentSaveOptions();
      options.newFileNames = [`${this.projectName}.schsim`];
      options.fileSuffixChoices = ['schsim', 'json'];
      const docPicker = new picker.DocumentViewPicker();
      const uris = await docPicker.save(options);
      if (uris && uris.length > 0) {
        const ok = await this.appService.saveProject(uris[0]);
        if (ok) {
          // Sync auto-save to keep recovery path current
          const autoPath = `${this.projectBaseDir}/autosave/${this.projectName}.schsim`;
          void this.appService.saveProject(autoPath);
          await this.appService.saveSession(uris[0], this.projectName, false);
          this.unsavedChanges = false;
        }
        this.statusMessage = ok ? `已保存: ${uris[0]}` : '保存失败';
        return;
      }
    } catch (_e) {
      // File picker not available, show manual dialog
    }
    this.saveAsPath = `${this.projectBaseDir}/projects/${this.projectName}.schsim`;
    this.showSaveAsDialog = true;
    this.showOpenDialog = false;
  }

  async doSaveAsFromPath(): Promise<void> {
    this.showSaveAsDialog = false;
    if (this.saveAsPath.trim().length === 0) {
      this.statusMessage = '请输入保存路径';
      return;
    }
    const path = this.saveAsPath.trim();
    const ok = await this.appService.saveProject(path);
    if (ok) {
      await this.appService.saveSession(path, this.projectName, false);
      this.unsavedChanges = false;
    }
    this.statusMessage = ok ? `已保存: ${path}` : '保存失败';
  }

  async doBurnHex(): Promise<void> {
    const path = this.burnFilePath.trim();
    if (path.length === 0) {
      this.statusMessage = '请选择或输入 HEX 文件路径';
      return;
    }
    try {
      const fileHandle = fs.openSync(path, fs.OpenMode.READ_ONLY);
      const stat = fs.statSync(path);
      const buffer = new ArrayBuffer(stat.size);
      fs.readSync(fileHandle.fd, buffer);
      fs.closeSync(fileHandle);

      const hexView = new Uint8Array(buffer);
      const family = this.burnMcuFamily === '8051' ? McuFamily.MCU_8051 : McuFamily.MCU_STM32F1;
      const result = this.appService.hexDebugger.loadHexData(hexView, family);
      if (result.success) {
        this.appService.simulationKernel.loadMcuProgram(
          new Uint8Array(buffer), 0, this.burnMcuFamily);
        const parsed = this.appService.hexDebugger.getParsedHexInfo();
        if (parsed) {
          this.burnFileSize = `${(stat.size / 1024).toFixed(1)} KB`;
          const segCount = parsed.flashSegments.length;
          this.burnSegmentInfo = `${segCount} 段`;
          const entry = parsed.minAddr;
          this.burnEntryPoint = `0x${entry.toString(16).toUpperCase().padStart(4, '0')}`;
          this.burnFirmwareInfo = `已烧录 ${this.burnFileSize}, ${this.burnSegmentInfo}, 入口 ${this.burnEntryPoint}`;
        } else {
          this.burnFileSize = `${(stat.size / 1024).toFixed(1)} KB`;
          this.burnFirmwareInfo = `已烧录 ${this.burnFileSize}`;
          this.burnSegmentInfo = '--';
          this.burnEntryPoint = '0x0000';
        }
        this.statusMessage = `HEX 烧录成功: ${path}`;
        this.rightCollapsed = false;
        this.uiState.rightCollapsed = false;
        this.setActiveRightTab(3);
      } else {
        this.statusMessage = `HEX 加载失败: ${result.error ?? '未知错误'}`;
        this.burnFirmwareInfo = '';
      }
    } catch (e) {
      this.statusMessage = `烧录失败: ${e}`;
      this.burnFirmwareInfo = '';
    }
  }

  async doBrowseHexFile(): Promise<void> {
    try {
      const options = new picker.DocumentSelectOptions();
      options.maxSelectNumber = 1;
      options.fileSuffixFilters = ['.hex', '.HEX', '.bin', '.BIN'];
      const docPicker = new picker.DocumentViewPicker();
      const uris = await docPicker.select(options);
      if (uris && uris.length > 0) {
        this.burnFilePath = uris[0];
      }
    } catch (_e) {
      this.statusMessage = '文件选择器不可用，请手动输入路径';
    }
  }

  handleDeleteSelected(): void {
    const selectedDevices = this.appService.schematicEditor.getSelectedDevices();
    const selectedNets = this.appService.schematicEditor.getSelectedNets();

    if (selectedDevices.length > 0) {
      const ids: string[] = [];
      for (let i = 0; i < selectedDevices.length; i++) {
        ids.push(selectedDevices[i].instUuid);
      }
      this.appService.schematicEditor.batchDeleteDevice(ids);
    }

    if (selectedNets.length > 0) {
      this.appService.schematicEditor.clearSelectedRoute();
    }

    if (selectedDevices.length === 0 && selectedNets.length === 0) {
      this.statusMessage = 'No component selected';
      return;
    }

    this.selectedComponentId = '';
    this.selectedCount = 0;
    this.bumpCanvas();
    this.statusMessage = 'Deleted';
  }

  handleCopy(): void {
    const selected = this.appService.schematicEditor.getSelectedDevices();
    if (selected.length === 0) {
      this.statusMessage = 'No component selected';
      return;
    }
    this.clipboardLibId = selected[0].libDevId;
    this.statusMessage = `Copied ${selected[0].refName}`;
  }

  handlePaste(): void {
    if (this.selectedComponentId) {
      const r = this.appService.schematicEditor.duplicateDevice(this.selectedComponentId, 30, 30);
      if (r.success && r.data) {
        this.selectedComponentId = r.data;
        this.bumpCanvas();
        this.statusMessage = 'Duplicated';
      }
      return;
    }
    if (this.clipboardLibId.length === 0) {
      this.statusMessage = 'Clipboard empty';
      return;
    }
    const x = 200 + (this.navRefreshKey % 5) * 30;
    const y = 150 + (this.navRefreshKey % 5) * 30;
    const r = this.appService.schematicEditor.placeComponent(this.clipboardLibId, { x, y });
    if (r.success && r.data) {
      this.selectedComponentId = r.data.id;
      this.bumpCanvas();
      this.statusMessage = `Placed ${this.clipboardLibId}`;
    }
  }

  handleAlign(type: AlignType): void {
    const sel = this.appService.schematicEditor.getSelectedDevices();
    if (sel.length < 2) {
      this.statusMessage = 'Select at least 2 components';
      return;
    }
    const ids = sel.map(d => d.instUuid);
    this.appService.schematicEditor.batchAlign(ids, type);
    this.bumpCanvas();
    this.statusMessage = 'Aligned';
  }

  handleMirror(): void {
    if (!this.selectedComponentId) {
      this.statusMessage = 'No component selected';
      return;
    }
    this.appService.schematicEditor.mirrorDevice(this.selectedComponentId, true);
    this.bumpCanvas();
    this.statusMessage = 'Mirrored';
  }

  handleRotate(): void {
    if (!this.selectedComponentId) {
      return;
    }
    const doc = this.appService.schematicEditor.getDocument();
    const comp = doc.components.find(c => c.id === this.selectedComponentId);
    if (comp) {
      const next = ((comp.rotation + 90) % 360) as 0 | 90 | 180 | 270;
      this.appService.schematicEditor.rotateComponent(comp.id, next);
      this.bumpCanvas();
    }
  }

  placeComponent(libraryId: string): void {
    const resolved = this.appService.componentLibrary.resolveLibraryId(libraryId);
    const x = 150 + (this.navRefreshKey % 8) * 40;
    const y = 100 + (this.navRefreshKey % 6) * 40;
    const r = this.appService.schematicEditor.placeComponent(resolved, { x, y });
    if (r.success && r.data) {
      this.selectedComponentId = r.data.id;
      this.bumpCanvas();
      this.statusMessage = `Placed ${resolved}`;
    } else {
      this.statusMessage = `Failed: ${r.error ?? resolved}`;
    }
  }

  getEditorImpl(): SchematicEditorImpl {
    return this.appService.schematicEditor as SchematicEditorImpl;
  }

  toggleGrid(): void {
    this.gridVisible = !this.gridVisible;
    this.getEditorImpl().setGridVisible(this.gridVisible);
    this.uiState.gridVisible = this.gridVisible;
    this.bumpCanvas();
  }

  toggleRuler(): void {
    this.rulerVisible = !this.rulerVisible;
    this.uiState.rulerVisible = this.rulerVisible;
    this.bumpCanvas();
  }

  onLeftPanelResize(delta: number): void {
    this.leftPanelWidth = Math.min(400, Math.max(160, this.leftPanelWidth + delta));
    this.uiState.leftPanelWidth = this.leftPanelWidth;
  }

  onRightPanelResize(delta: number): void {
    this.rightPanelWidth = Math.min(420, Math.max(200, this.rightPanelWidth + delta));
    this.uiState.rightPanelWidth = this.rightPanelWidth;
  }

  setActiveRightTab(tab: number): void {
    this.activeRightTab = tab;
    this.uiState.activeRightTab = tab;
  }

  private onSchematicChanged = (_payload: ModuleEventPayload): void => {
    this.navRefreshKey++;
    this.unsavedChanges = true;
    this.canvasVersion++;
  };

  build() {
    Stack() {
      Column() {
        this.MenuBar()
        this.MainToolbar()
        Row() {
          if (!this.leftLibCollapsed || !this.leftNavCollapsed) {
            this.LeftPanel()
          }
          if (!this.leftLibCollapsed || !this.leftNavCollapsed) {
            ProteusResizer({ side: 'left', onDrag: (d: number) => this.onLeftPanelResize(d) })
          }
          this.CanvasArea()
          if (!this.rightCollapsed) {
            ProteusResizer({ side: 'right', onDrag: (d: number) => this.onRightPanelResize(d) })
          }
          if (!this.rightCollapsed) {
            this.RightPanel()
          }
        }
        .layoutWeight(1)
        .width('100%')
        this.StatusBar()
      }
      .width('100%')
      .height('100%')
      .backgroundColor(ProteusColors.MENU_BG)
      .onKeyEvent((event: KeyEvent) => this.handleKeyEvent(event))

      // Overlay dialogs
      if (this.showWelcomeDialog) {
        this.WelcomeDialog()
      }
      if (this.showNewProjectDialog) {
        this.NewProjectDialog()
      }
      if (this.showRecoveryDialog) {
        this.RecoveryDialog()
      }
      if (this.showOpenDialog) {
        this.FileOpenDialog()
      }
      if (this.showSaveAsDialog) {
        this.FileSaveAsDialog()
      }
      if (this.showBurnDialog) {
        this.BurnHexDialog()
      }
      if (this.showExitConfirmDialog) {
        this.ExitConfirmDialog()
      }
    }
    .width('100%')
    .height('100%')
  }

  handleKeyEvent(event: KeyEvent): boolean {
    // Track Ctrl modifier state (KeyEvent.ctrlKey removed in API 12)
    if (event.type === KeyType.Down) {
      if (event.keyCode === 2021 || event.keyCode === 2022) { this.modifierKeys |= 1; return false; }
    }
    if (event.type === KeyType.Up) {
      if (event.keyCode === 2021 || event.keyCode === 2022) { this.modifierKeys &= ~1; return false; }
    }
    if (event.type !== KeyType.Down) return false;
    const ctrl = (this.modifierKeys & 1) !== 0;
    const kt = (event.keyText ?? '').toLowerCase();

    if (ctrl) {
      switch (kt) {
        case 'z': this.appService.schematicEditor.undo(); this.bumpCanvas(); return true;
        case 'y': this.appService.schematicEditor.redo(); this.bumpCanvas(); return true;
        case 's': void this.handleSaveProject(); return true;
        case 'c': this.handleCopy(); return true;
        case 'v': this.handlePaste(); return true;
        case '0': this.appService.schematicEditor.fitAllInView(); this.bumpCanvas(); return true;
        default: return false;
      }
    }

    if (kt === 'escape' || event.keyCode === 27) {
      this.setToolMode(EditorToolMode.SELECT);
      return true;
    }
    if (kt === 'delete' || event.keyCode === 46 || event.keyCode === 8) {
      this.handleDeleteSelected();
      return true;
    }
    if (kt === 'f1') { this.setActiveRightTab(7); this.rightCollapsed = false; this.uiState.rightCollapsed = false; return true; }
    if (kt === 'f5') {
      if (this.simRunning) { this.appService.stopSimulation(); this.simRunning = false; }
      else { this.simRunning = this.appService.startSimulation(); }
      return true;
    }
    if (kt === 'f7') {
      const errors = this.appService.runErc(false);
      this.ercErrors = errors; this.ercCount = errors.length;
      this.navTab = 3;
      this.statusMessage = `ERC: ${errors.length} issues`;
      return true;
    }

    switch (kt) {
      case 'r': this.handleRotate(); return true;
      case 'm': this.handleMirror(); return true;
      case 'p': this.setToolMode(EditorToolMode.PLACE); return true;
      case 'w': this.setToolMode(EditorToolMode.WIRE); return true;
      case 'b': this.setToolMode(EditorToolMode.BUS); return true;
      case 'l': this.setToolMode(EditorToolMode.LABEL); return true;
      case 'g': this.toggleGrid(); return true;
      case '+': case '=':
        this.appService.schematicEditor.setZoom(this.appService.schematicEditor.getZoom() * 1.2);
        this.bumpCanvas();
        return true;
      case '-':
        this.appService.schematicEditor.setZoom(this.appService.schematicEditor.getZoom() / 1.2);
        this.bumpCanvas();
        return true;
      default: return false;
    }
  }

  @Builder
  MenuBar() {
    Row() {
      ProteusMenuTrigger({
        label: $r('app.string.menu_file'),
        entries: this.fileMenuEntries()
      })
      ProteusMenuTrigger({
        label: $r('app.string.menu_edit'),
        entries: this.editMenuEntries()
      })
      ProteusMenuTrigger({
        label: $r('app.string.menu_view'),
        entries: this.viewMenuEntries()
      })
      ProteusMenuTrigger({
        label: $r('app.string.menu_place'),
        entries: this.placeMenuEntries()
      })
      ProteusMenuTrigger({
        label: $r('app.string.menu_sim'),
        entries: this.simMenuEntries()
      })
      ProteusMenuTrigger({
        label: $r('app.string.menu_library'),
        entries: this.libraryMenuEntries()
      })
      ProteusMenuTrigger({
        label: $r('app.string.menu_project'),
        entries: this.projectMenuEntries()
      })
      ProteusMenuTrigger({
        label: $r('app.string.menu_help'),
        entries: this.helpMenuEntries()
      })
      Blank()
      Text(this.projectName)
        .fontSize(ProteusFonts.MENU)
        .fontColor(ProteusColors.TEXT_SECONDARY)
        .margin({ right: 8 })
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .width('100%')
    .height(ProteusDimens.MENU_HEIGHT)
    .backgroundColor(ProteusColors.MENU_BG)
    .border({ width: { bottom: 1 }, color: ProteusColors.DIVIDER })
    .alignItems(VerticalAlign.Center)
  }

  fileMenuEntries(): ProteusMenuEntry[] {
    return [
      { label: $r('app.string.toolbar_new'), shortcut: 'Ctrl+N', icon: ProteusIconName.NEW, action: () => { void this.handleNewProject(); } },
      { label: $r('app.string.toolbar_open'), shortcut: 'Ctrl+O', icon: ProteusIconName.OPEN, action: () => { void this.handleOpenProject(); } },
      { label: $r('app.string.toolbar_save'), shortcut: 'Ctrl+S', icon: ProteusIconName.SAVE, action: () => { void this.handleSaveProject(); } },
      { label: 'Save As...', shortcut: 'Ctrl+Shift+S', action: () => { void this.handleSaveAs(); } },
      { label: '', separator: true, action: () => {} },
      { label: 'Export...', action: () => { this.statusMessage = 'Export: not yet implemented'; } }
    ];
  }

  editMenuEntries(): ProteusMenuEntry[] {
    return [
      { label: $r('app.string.toolbar_undo'), shortcut: 'Ctrl+Z', icon: ProteusIconName.UNDO, action: () => {
        const r = this.appService.schematicEditor.undo();
        this.statusMessage = r.success ? 'Undone' : 'Nothing to undo';
        this.bumpCanvas();
      }},
      { label: $r('app.string.toolbar_redo'), shortcut: 'Ctrl+Y', icon: ProteusIconName.REDO, action: () => {
        const r = this.appService.schematicEditor.redo();
        this.statusMessage = r.success ? 'Redone' : 'Nothing to redo';
        this.bumpCanvas();
      }},
      { label: '', separator: true, action: () => {} },
      { label: $r('app.string.toolbar_copy'), shortcut: 'Ctrl+C', icon: ProteusIconName.COPY, action: () => this.handleCopy() },
      { label: $r('app.string.toolbar_paste'), shortcut: 'Ctrl+V', icon: ProteusIconName.PASTE, action: () => this.handlePaste() },
      { label: 'Delete', shortcut: 'Del', icon: ProteusIconName.TRASH, action: () => this.handleDeleteSelected() }
    ];
  }

  viewMenuEntries(): ProteusMenuEntry[] {
    return [
      { label: $r('app.string.toolbar_zoom_in'), shortcut: '+', icon: ProteusIconName.ZOOM_IN, action: () => {
        this.appService.schematicEditor.setZoom(this.appService.schematicEditor.getZoom() * 1.2);
        this.bumpCanvas();
      }},
      { label: $r('app.string.toolbar_zoom_out'), shortcut: '-', icon: ProteusIconName.ZOOM_OUT, action: () => {
        this.appService.schematicEditor.setZoom(this.appService.schematicEditor.getZoom() / 1.2);
        this.bumpCanvas();
      }},
      { label: $r('app.string.toolbar_fit'), shortcut: 'Ctrl+0', icon: ProteusIconName.FIT, action: () => {
        this.appService.schematicEditor.fitAllInView();
        this.bumpCanvas();
      }},
      { label: '', separator: true, action: () => {} },
      { label: $r('app.string.toolbar_grid'), shortcut: 'G', icon: ProteusIconName.GRID, action: () => this.toggleGrid() },
      { label: 'Toggle Ruler', shortcut: 'R', icon: ProteusIconName.RULER, action: () => this.toggleRuler() }
    ];
  }

  placeMenuEntries(): ProteusMenuEntry[] {
    return [
      { label: $r('app.string.toolbar_place'), shortcut: 'P', icon: ProteusIconName.COMPONENT, action: () => this.setToolMode(EditorToolMode.PLACE) },
      { label: $r('app.string.toolbar_wire'), shortcut: 'W', icon: ProteusIconName.WIRE, action: () => this.setToolMode(EditorToolMode.WIRE) },
      { label: $r('app.string.toolbar_bus'), shortcut: 'B', icon: ProteusIconName.BUS, action: () => this.setToolMode(EditorToolMode.BUS) },
      { label: $r('app.string.toolbar_label'), shortcut: 'L', icon: ProteusIconName.LABEL, action: () => this.setToolMode(EditorToolMode.LABEL) },
      { label: '', separator: true, action: () => {} },
      { label: $r('app.string.toolbar_power'), shortcut: 'Shift+P', icon: ProteusIconName.POWER, action: () => this.setToolMode(EditorToolMode.PLACE, 'VCC') },
      { label: $r('app.string.toolbar_ground'), shortcut: 'Shift+G', icon: ProteusIconName.GROUND, action: () => this.setToolMode(EditorToolMode.PLACE, 'GND') }
    ];
  }

  simMenuEntries(): ProteusMenuEntry[] {
    return [
      { label: $r('app.string.toolbar_sim_start'), shortcut: 'F5', icon: ProteusIconName.PLAY, action: async () => {
        if (this.simRunning) {
          this.appService.stopSimulation();
          this.simRunning = false;
        } else {
          this.simRunning = this.appService.startSimulation();
        }
      }},
      { label: $r('app.string.toolbar_sim_pause'), shortcut: 'F6', icon: ProteusIconName.PAUSE, action: () => {
        this.toggleSimPause();
      }},
      { label: $r('app.string.toolbar_sim_stop'), shortcut: 'Shift+F5', icon: ProteusIconName.STOP, action: () => {
        this.appService.stopSimulation();
        this.simRunning = false;
        this.simPaused = false;
      }},
      { label: '', separator: true, action: () => {} },
      { label: $r('app.string.toolbar_erc'), shortcut: 'F7', icon: ProteusIconName.ERC, action: () => {
        const errors = this.appService.runErc(false);
        this.ercErrors = errors;
        const errN = errors.filter(e => e.severity === 'error' || e.severity === 'critical').length;
        this.ercCount = errors.length;
        this.navTab = 3;
        this.statusMessage = `ERC: ${errors.length} issues (${errN} errors)`;
      }}
    ];
  }

  libraryMenuEntries(): ProteusMenuEntry[] {
    return [
      { label: 'Browse...', action: () => { this.leftLibCollapsed = false; this.uiState.leftLibCollapsed = false; } },
      { label: 'Search...', shortcut: 'Ctrl+L', icon: ProteusIconName.SEARCH, action: () => {
        this.leftLibCollapsed = false;
        this.uiState.leftLibCollapsed = false;
        this.statusMessage = 'Type in search box';
      }},
      { label: '', separator: true, action: () => {} },
      { label: 'Refresh', action: () => { this.refreshComponentList(); this.bumpCanvas(); } }
    ];
  }

  projectMenuEntries(): ProteusMenuEntry[] {
    return [
      { label: $r('app.string.toolbar_new'), shortcut: 'Ctrl+N', icon: ProteusIconName.NEW, action: () => { void this.handleNewProject(); } },
      { label: $r('app.string.toolbar_open'), shortcut: 'Ctrl+O', icon: ProteusIconName.OPEN, action: () => { void this.handleOpenProject(); } },
      { label: $r('app.string.toolbar_save'), shortcut: 'Ctrl+S', icon: ProteusIconName.SAVE, action: () => { void this.handleSaveProject(); } }
    ];
  }

  helpMenuEntries(): ProteusMenuEntry[] {
    return [
      { label: 'Keyboard Shortcuts', shortcut: 'F1', action: () => {
        this.setActiveRightTab(7);
        if (this.rightCollapsed) {
          this.rightCollapsed = false;
          this.uiState.rightCollapsed = false;
        }
        this.statusMessage = 'Opened Settings panel — see shortcuts in toolbar tooltips';
      }},
      { label: '', separator: true, action: () => {} },
      { label: 'About', action: () => { this.statusMessage = 'ElecDraw Schematic Editor v2.0'; } }
    ];
  }

  @Builder
  MainToolbar() {
    Row() {
      ProteusToolGroup({ title: 'File' }) {
        ProteusToolButton({ iconName: ProteusIconName.NEW, tooltip: 'New (Ctrl+N)', showLabel: false, onAction: () => { void this.handleNewProject(); } })
        ProteusToolButton({ iconName: ProteusIconName.OPEN, tooltip: 'Open (Ctrl+O)', showLabel: false, onAction: () => { void this.handleOpenProject(); } })
        ProteusToolButton({ iconName: ProteusIconName.SAVE, tooltip: 'Save (Ctrl+S)', showLabel: false, onAction: () => { void this.handleSaveProject(); } })
      }

      ProteusToolGroup({ title: 'History' }) {
        ProteusToolButton({ iconName: ProteusIconName.UNDO, tooltip: 'Undo (Ctrl+Z)', showLabel: false, onAction: () => {
          const r = this.appService.schematicEditor.undo();
          this.statusMessage = r.success ? 'Undone' : 'Nothing to undo';
          this.bumpCanvas();
        }})
        ProteusToolButton({ iconName: ProteusIconName.REDO, tooltip: 'Redo (Ctrl+Y)', showLabel: false, onAction: () => {
          const r = this.appService.schematicEditor.redo();
          this.statusMessage = r.success ? 'Redone' : 'Nothing to redo';
          this.bumpCanvas();
        }})
        ProteusToolButton({ iconName: ProteusIconName.TRASH, tooltip: 'Delete (Del)', showLabel: false,
          disabled: this.selectedComponentId.length === 0, onAction: () => this.handleDeleteSelected() })
      }

      ProteusToolGroup({ title: 'Edit' }) {
        ProteusToolButton({ iconName: ProteusIconName.COPY, tooltip: 'Copy (Ctrl+C)', showLabel: false,
          disabled: this.selectedComponentId.length === 0, onAction: () => this.handleCopy() })
        ProteusToolButton({ iconName: ProteusIconName.PASTE, tooltip: 'Paste (Ctrl+V)', showLabel: false, onAction: () => this.handlePaste() })
      }

      ProteusToolGroup({ title: 'View' }) {
        ProteusToolButton({ iconName: ProteusIconName.ZOOM_IN, tooltip: 'Zoom In (+)', showLabel: false, onAction: () => {
          this.appService.schematicEditor.setZoom(this.appService.schematicEditor.getZoom() * 1.2);
          this.bumpCanvas();
        }})
        ProteusToolButton({ iconName: ProteusIconName.ZOOM_OUT, tooltip: 'Zoom Out (-)', showLabel: false, onAction: () => {
          this.appService.schematicEditor.setZoom(this.appService.schematicEditor.getZoom() / 1.2);
          this.bumpCanvas();
        }})
        ProteusToolButton({ iconName: ProteusIconName.FIT, tooltip: 'Fit All (Ctrl+0)', showLabel: false, onAction: () => {
          this.appService.schematicEditor.fitAllInView();
          this.bumpCanvas();
        }})
        ProteusToolButton({ iconName: ProteusIconName.GRID, tooltip: 'Toggle Grid (G)', showLabel: false,
          active: this.gridVisible, onAction: () => this.toggleGrid() })
      }

      ProteusToolGroup({ title: 'Place' }) {
        ProteusToolButton({ iconName: ProteusIconName.COMPONENT, tooltip: 'Place Component (P)', showLabel: false,
          active: this.toolMode === EditorToolMode.PLACE, onAction: () => this.setToolMode(EditorToolMode.PLACE, this.previewComponentId) })
        ProteusToolButton({ iconName: ProteusIconName.WIRE, tooltip: 'Wire (W)', showLabel: false,
          active: this.toolMode === EditorToolMode.WIRE, onAction: () => this.setToolMode(EditorToolMode.WIRE) })
        ProteusToolButton({ iconName: ProteusIconName.BUS, tooltip: 'Bus (B)', showLabel: false,
          active: this.toolMode === EditorToolMode.BUS, onAction: () => this.setToolMode(EditorToolMode.BUS) })
        ProteusToolButton({ iconName: ProteusIconName.LABEL, tooltip: 'Label (L)', showLabel: false,
          active: this.toolMode === EditorToolMode.LABEL, onAction: () => this.setToolMode(EditorToolMode.LABEL) })
        ProteusToolButton({ iconName: ProteusIconName.POWER, tooltip: 'Power (Shift+P)', showLabel: false,
          onAction: () => this.setToolMode(EditorToolMode.PLACE, 'VCC') })
        ProteusToolButton({ iconName: ProteusIconName.GROUND, tooltip: 'Ground (Shift+G)', showLabel: false,
          onAction: () => this.setToolMode(EditorToolMode.PLACE, 'GND') })
      }

      ProteusToolGroup({ title: 'Align' }) {
        ProteusToolButton({ iconName: ProteusIconName.ALIGN_LEFT, tooltip: 'Align Left', showLabel: false,
          disabled: this.selectedCount < 2, onAction: () => this.handleAlign('left') })
        ProteusToolButton({ iconName: ProteusIconName.ALIGN_RIGHT, tooltip: 'Align Right', showLabel: false,
          disabled: this.selectedCount < 2, onAction: () => this.handleAlign('right') })
        ProteusToolButton({ iconName: ProteusIconName.ALIGN_TOP, tooltip: 'Align Top', showLabel: false,
          disabled: this.selectedCount < 2, onAction: () => this.handleAlign('top') })
        ProteusToolButton({ iconName: ProteusIconName.DISTRIBUTE, tooltip: 'Distribute Horizontal', showLabel: false,
          disabled: this.selectedCount < 3, onAction: () => {
            const sel = this.appService.schematicEditor.getSelectedDevices();
            if (sel.length >= 3) {
              const ids = sel.map(d => d.instUuid);
              this.appService.schematicEditor.batchDistribute(ids, 'horiz');
              this.bumpCanvas();
              this.statusMessage = 'Distributed horizontally';
            } else {
              this.statusMessage = 'Select at least 3 components';
            }
          }})
        ProteusToolButton({ iconName: ProteusIconName.ROTATE, tooltip: 'Rotate (R)', showLabel: false,
          disabled: this.selectedComponentId.length === 0, onAction: () => this.handleRotate() })
        ProteusToolButton({ iconName: ProteusIconName.MIRROR, tooltip: 'Mirror (M)', showLabel: false,
          disabled: this.selectedComponentId.length === 0, onAction: () => this.handleMirror() })
      }

      ProteusToolGroup({ title: 'Sim' }) {
        ProteusToolButton({
          iconName: this.simRunning ? ProteusIconName.STOP : ProteusIconName.PLAY,
          tooltip: this.simRunning ? 'Stop (Shift+F5)' : 'Run (F5)', showLabel: false,
          active: this.simRunning,
          onAction: async () => {
            if (this.simRunning) {
              this.appService.stopSimulation();
              this.simRunning = false;
              this.simPaused = false;
            } else {
              const ok = this.appService.startSimulation();
              this.simRunning = ok;
              this.simPaused = false;
            }
          }})
        ProteusToolButton({ iconName: ProteusIconName.PAUSE, tooltip: 'Pause (F6)', showLabel: false,
          disabled: !this.simRunning, onAction: () => { this.toggleSimPause(); }})
        ProteusToolButton({ iconName: ProteusIconName.ERC, tooltip: 'ERC (F7)', showLabel: false, onAction: () => {
          const errors = this.appService.runErc(false);
          this.ercErrors = errors;
          const errN = errors.filter(e => e.severity === 'error' || e.severity === 'critical').length;
          this.ercCount = errors.length;
          this.navTab = 3;
          this.statusMessage = `ERC: ${errors.length} issues (${errN} errors)`;
        }})
      }

      ProteusToolGroup({ title: 'AI' }) {
        ProteusToolButton({ iconName: ProteusIconName.AI_ROUTE, tooltip: 'AI Auto-Route (F8)', showLabel: false,
          onAction: async () => {
            this.statusMessage = 'AI auto-routing...';
            const ok = await this.appService.aiAutoRoute();
            if (ok) {
              this.bumpCanvas();
              this.statusMessage = 'AI routing complete';
            }
          }})
        ProteusToolButton({ iconName: ProteusIconName.AI_LAYOUT, tooltip: 'AI Optimize Layout (F9)', showLabel: false,
          onAction: async () => {
            this.statusMessage = 'AI layout optimizing...';
            const ok = await this.appService.aiOptimizePlacement();
            if (ok) {
              this.bumpCanvas();
              this.statusMessage = 'AI layout optimized';
            }
          }})
        ProteusToolButton({ iconName: ProteusIconName.AI_DIAG, tooltip: 'AI Diagnose (F10)', showLabel: false,
          onAction: () => {
            const errors = this.appService.runErc(true);
            this.ercErrors = errors;
            this.ercCount = errors.length;
            this.navTab = 3;
            this.statusMessage = `AI diagnosis: ${errors.length} issues`;
          }})
      }

      Blank()

      ProteusToolButton({ iconName: ProteusIconName.MORE, tooltip: 'More tools', showLabel: false,
        onAction: () => { this.statusMessage = 'All tools available in menus'; } })
    }
    .padding({ left: 4, right: 4 })
    .alignItems(VerticalAlign.Center)
    .width('100%')
    .height(ProteusDimens.TOOLBAR_HEIGHT)
    .backgroundColor(ProteusColors.TOOLBAR_BG)
    .border({ width: { bottom: 1 }, color: ProteusColors.DIVIDER })
  }

  @Builder
  LeftPanel() {
    Column() {
      if (!this.leftLibCollapsed) {
        Column() {
          ProteusPanelTitle({
            title: $r('app.string.left_library'),
            collapsed: false,
            onToggle: () => { this.leftLibCollapsed = true; this.uiState.leftLibCollapsed = true; }
          })
          TextInput({ placeholder: $r('app.string.search_placeholder'), text: this.searchKeyword })
            .height(ProteusDimens.SEARCH_HEIGHT)
            .fontSize(ProteusFonts.PARAM_KEY)
            .fontColor(ProteusColors.TEXT_PRIMARY)
            .backgroundColor(ProteusColors.CANVAS_BG)
            .borderRadius(0)
            .border({ width: 1, color: ProteusColors.BORDER })
            .margin({ left: 4, right: 4, top: 4, bottom: 2 })
            .onChange((v: string) => {
              this.searchKeyword = v;
              this.refreshComponentList();
            })

          Scroll() {
            Column() {
              if (this.searchKeyword.length > 0) {
                ForEach(this.componentList, (item: string) => {
                  ProteusTreeRow({
                    label: item.split('|')[1] ?? item,
                    selected: this.selectedTreeItem === item,
                    onClickRow: () => this.selectLibraryItem(item),
                    onDoubleClick: () => this.placeComponent(item.split('|')[0])
                  })
                }, (item: string) => item)
              } else {
                ForEach(this.categoryNodes, (node: CategoryNode, idx: number) => {
                  Column() {
                    ProteusTreeRow({
                      label: node.label,
                      expandable: true,
                      expanded: this.expandedCategories.has(node.cat),
                      onToggleExpand: () => { this.toggleCategory(node.cat); },
                      onClickRow: () => { this.toggleCategory(node.cat); }
                    })
                    if (this.expandedCategories.has(node.cat)) {
                      this.CategoryItems(node.cat)
                    }
                  }
                }, (node: CategoryNode) => node.cat)
              }
            }
            .width('100%')
          }
          .layoutWeight(1)
          .width('100%')
          .scrollBar(BarState.Auto)

          ComponentPreview({ libraryId: this.previewComponentId })
            .onClick(() => {
              if (this.previewComponentId) {
                this.placeComponent(this.previewComponentId);
              } else if (this.selectedTreeItem) {
                this.placeComponent(this.selectedTreeItem.split('|')[0]);
              } else {
                this.statusMessage = 'Select a component first';
              }
            })
        }
        .layoutWeight(3)
        .width('100%')
      }

      if (!this.leftNavCollapsed) {
        Column() {
          ProteusPanelTitle({
            title: $r('app.string.left_navigator'),
            collapsed: false,
            onToggle: () => { this.leftNavCollapsed = true; this.uiState.leftNavCollapsed = true; }
          })
          Row() {
            ProteusNavTab({ label: $r('app.string.nav_sheet_tree'), selected: this.navTab === 0, onSelect: () => { this.navTab = 0; } })
            ProteusNavTab({ label: $r('app.string.nav_component_list'), selected: this.navTab === 1, onSelect: () => { this.navTab = 1; } })
            ProteusNavTab({ label: $r('app.string.nav_net_list'), selected: this.navTab === 2, onSelect: () => { this.navTab = 2; } })
            ProteusNavTab({ label: $r('app.string.nav_error_list'), selected: this.navTab === 3, onSelect: () => { this.navTab = 3; } })
          }
          .width('100%')
          .backgroundColor(ProteusColors.PANEL_TITLE_BG)

          Scroll() {
            Column() {
              if (this.navTab === 0) {
                this.NavSheetTree()
              } else if (this.navTab === 1) {
                this.NavComponentList()
              } else if (this.navTab === 2) {
                this.NavNetList()
              } else {
                this.NavErrorList()
              }
            }
            .width('100%')
            .alignItems(HorizontalAlign.Start)
          }
          .layoutWeight(1)
          .width('100%')
          .backgroundColor(ProteusColors.CANVAS_BG)
        }
        .layoutWeight(1)
        .width('100%')
        .border({ width: { top: 1 }, color: ProteusColors.DIVIDER })
      }
    }
    .width(this.leftPanelWidth)
    .height('100%')
    .backgroundColor(ProteusColors.CANVAS_BG)
    .border({ width: { right: 1 }, color: ProteusColors.DIVIDER })
  }

  @Builder
  CategoryItems(cat: ComponentCategory) {
    ForEach(this.getCategoryItems(cat), (item: string) => {
      ProteusTreeRow({
        label: item.split('|')[1] ?? item,
        depth: 1,
        selected: this.selectedTreeItem === item,
        onClickRow: () => this.selectLibraryItem(item),
        onDoubleClick: () => this.placeComponent(item.split('|')[0])
      })
    }, (item: string) => item)
  }

  getCategoryItems(cat: ComponentCategory): string[] {
    const result = this.appService.componentLibrary.listByCategory(cat, 1, 30);
    return result.items.map(c => `${c.id}|${c.name}`);
  }

  @Builder
  NavSheetTree() {
    ProteusTreeRow({
      label: this.projectName,
      expandable: true,
      expanded: true,
      selected: true,
      onClickRow: () => {},
      onToggleExpand: () => {}
    })
    ProteusTreeRow({
      label: $r('app.string.nav_sheet1'),
      depth: 1,
      selected: false,
      onClickRow: () => {}
    })
  }

  @Builder
  NavComponentList() {
    ForEach(this.getDocComponents(), (comp: ComponentInstance) => {
      Row() {
        Text(`${comp.refDes}`)
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(comp.id === this.selectedComponentId ? ProteusColors.SELECTED : ProteusColors.TEXT_PRIMARY)
          .fontWeight(FontWeight.Medium)
          .width(60)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(`${comp.libraryId}`)
          .fontSize(ProteusFonts.STATUS)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .layoutWeight(1)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .width('100%')
      .height(ProteusDimens.NAV_ROW_HEIGHT)
      .padding({ left: 6, right: 4 })
      .alignItems(VerticalAlign.Center)
      .backgroundColor(comp.id === this.selectedComponentId ? ProteusColors.TREE_SELECTED : Color.Transparent)
      .border({ width: { bottom: 0.5 }, color: ProteusColors.DIVIDER })
      .onClick(() => {
        this.selectedComponentId = comp.id;
        this.appService.schematicEditor.setSelection([comp.id]);
      })
    }, (comp: ComponentInstance) => `${comp.id}_${this.navRefreshKey}`)
  }

  getDocComponents(): ComponentInstance[] {
    return this.appService.schematicEditor.getDocument().components;
  }

  @Builder
  NavNetList() {
    ForEach(this.getDocNets(), (netName: string, idx: number) => {
      Row() {
        Text(`NET ${idx + 1}`)
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(ProteusColors.WIRE)
          .fontWeight(FontWeight.Medium)
          .maxLines(1)
      }
      .width('100%')
      .height(ProteusDimens.NAV_ROW_HEIGHT + 2)
      .padding({ left: 8, right: 4 })
      .alignItems(VerticalAlign.Center)
      .border({ width: { bottom: 0.5 }, color: ProteusColors.DIVIDER })
    }, (netName: string, idx: number) => `${netName}_${idx}`)
  }

  getDocNets(): string[] {
    const doc: SchematicDocument = this.appService.schematicEditor.getDocument();
    const nets: Set<string> = new Set();
    for (let i = 0; i < doc.wires.length; i++) {
      nets.add(doc.wires[i].netId);
    }
    const result: string[] = [];
    nets.forEach((n: string) => result.push(n));
    return result;
  }

  @Builder
  NavErrorList() {
    if (this.ercErrors.length === 0) {
      Row() {
        Text($r('app.string.no_erc_errors'))
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(ProteusColors.ERC_OK)
      }
      .padding({ left: 8, top: 8 })
    } else {
      ForEach(this.ercErrors, (err: ErcError, idx: number) => {
        Row() {
          Column() {
            Text(err.severity === 'error' || err.severity === 'critical' ? '✕' : '⚠')
              .fontSize(10)
              .fontColor(err.severity === 'error' || err.severity === 'critical' ?
                ProteusColors.ERC_ERR : ProteusColors.ERC_WARN)
              .width(16)
          }
          Text(err.desc)
            .fontSize(ProteusFonts.STATUS)
            .fontColor(err.severity === 'error' || err.severity === 'critical' ?
              ProteusColors.ERC_ERR : ProteusColors.ERC_WARN)
            .layoutWeight(1)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .width('100%')
        .height(ProteusDimens.NAV_ROW_HEIGHT)
        .padding({ left: 6, right: 4 })
        .alignItems(VerticalAlign.Center)
        .border({ width: { bottom: 0.5 }, color: ProteusColors.DIVIDER })
      }, (err: ErcError, idx: number) => `${idx}_${err.desc}`)
    }
  }

  @Builder
  CanvasArea() {
    Stack({ alignContent: Alignment.BottomEnd }) {
      SchematicCanvas({
        canvasVersion: $canvasVersion,
        selectedComponentId: $selectedComponentId,
        mouseX: $mouseX,
        mouseY: $mouseY,
        zoomPercent: $zoomPercent,
        toolMode: $toolMode,
        pendingLibraryId: $previewComponentId,
        wireStartActive: $wireStartActive,
        wireStartX: $wireStartX,
        wireStartY: $wireStartY,
        rulerVisible: this.rulerVisible,
        ercErrors: this.ercErrors,
        onStatusChange: (msg: string) => { this.statusMessage = msg; },
        onDocumentChanged: () => { this.bumpCanvas(); }
      })
        .width('100%')
        .height('100%')

      if (this.selectedComponentId) {
        this.FloatingToolBar()
      }
    }
    .layoutWeight(1)
    .height('100%')
    .border({ width: 1, color: ProteusColors.DIVIDER })
  }

  @Builder
  FloatingToolBar() {
    Row() {
      ProteusToolButton({ iconName: ProteusIconName.ROTATE, tooltip: 'Rotate (R)', showLabel: false,
        onAction: () => this.handleRotate() })
      ProteusToolButton({ iconName: ProteusIconName.MIRROR, tooltip: 'Mirror (M)', showLabel: false,
        onAction: () => this.handleMirror() })
      ProteusToolButton({ iconName: ProteusIconName.TRASH, tooltip: 'Delete (Del)', showLabel: false,
        onAction: () => this.handleDeleteSelected() })
      ProteusToolButton({ iconName: ProteusIconName.SETTINGS, tooltip: 'Properties', showLabel: false,
        onAction: () => {
          this.rightCollapsed = false;
          this.uiState.rightCollapsed = false;
          this.setActiveRightTab(0);
        } })
      if (this.debugTabHasBadge) {
        ProteusToolButton({ iconName: ProteusIconName.PLAY, tooltip: '烧录 HEX', showLabel: false,
          onAction: () => {
            const doc = this.appService.schematicEditor.getDocument();
            const comp = doc.components.find(c => c.id === this.selectedComponentId);
            if (comp) {
              const lib = comp.libraryId.toUpperCase();
              if (lib.startsWith('AT89') || lib.startsWith('STC')) {
                this.burnMcuFamily = '8051';
              } else {
                this.burnMcuFamily = 'STM32';
              }
              this.burnFilePath = '';
              this.showBurnDialog = true;
            }
          } })
      }
    }
    .backgroundColor(ProteusColors.CANVAS_BG)
    .border({ width: 1, color: ProteusColors.BORDER })
    .padding(2)
    .margin({ right: 8, bottom: 8 })
  }

  @Builder
  RightPanel() {
    Column() {
      ProteusPanelTitle({
        title: $r('app.string.panel_properties'),
        collapsed: false,
        onToggle: () => { this.rightCollapsed = true; this.uiState.rightCollapsed = true; }
      })
      Row() {
        // Content area
        if (this.activeRightTab === 0) {
          PropertyPanel({
            selectedComponentId: this.selectedComponentId,
            docVersion: this.canvasVersion,
            simWaveTick: this.simWaveTick,
            statusMessage: $statusMessage,
            onDeleted: () => {
              this.selectedComponentId = '';
              this.selectedCount = 0;
              this.bumpCanvas();
            }
          })
            .layoutWeight(1)
            .height('100%')
        } else if (this.activeRightTab === 4) {
          InstrumentPanel({
            statusMessage: $statusMessage,
            selectedComponentId: this.selectedComponentId,
            simWaveTick: this.simWaveTick
          })
            .layoutWeight(1)
            .height('100%')
        } else {
          Scroll() {
            Column() {
              if (this.activeRightTab === 1) {
                Column({ space: 8 }) {
                  ProteusSectionTitle({ title: '仿真控制' })

                  Column() {
                    Text('仿真状态')
                      .fontSize(ProteusFonts.PARAM_KEY)
                      .fontColor(ProteusColors.TEXT_LABEL)
                      .margin({ bottom: 4 })
                    Text(this.simRunning ? (this.simPaused ? '已暂停' : '运行中') : '空闲')
                      .fontSize(ProteusFonts.TITLE)
                      .fontColor(this.simRunning ? (this.simPaused ? ProteusColors.ERC_WARN : ProteusColors.ERC_OK) : ProteusColors.TEXT_SECONDARY)
                      .fontWeight(FontWeight.Medium)
                    if (this.simRunning) {
                      Text('点击下方按钮控制仿真')
                        .fontSize(ProteusFonts.STATUS)
                        .fontColor(ProteusColors.TEXT_SECONDARY)
                        .margin({ top: 2 })
                    }
                  }
                  .alignItems(HorizontalAlign.Start)
                  .width('100%')
                  .padding({ left: 8 })

                  Row({ space: 8 }) {
                    ProteusClassicBtn({
                      label: this.simRunning ? $r('app.string.sim_stop') : $r('app.string.sim_run'),
                      widthVal: '42%',
                      onAction: async () => {
                        if (this.simRunning) {
                          this.appService.stopSimulation();
                          this.simRunning = false;
                        } else {
                          this.simRunning = this.appService.startSimulation();
                        }
                      }
                    })
                    ProteusClassicBtn({
                      label: $r('app.string.sim_pause'),
                      widthVal: '42%',
                      onAction: () => { this.toggleSimPause(); }
                    })
                  }
                  .width('100%')
                  .padding({ left: 8, right: 8 })
                  .justifyContent(FlexAlign.SpaceBetween)

                  Divider().color(ProteusColors.DIVIDER).height(1).width('100%').margin({ top: 4 })

                  Text('ERC 检查')
                    .fontSize(ProteusFonts.PARAM_KEY)
                    .fontColor(ProteusColors.TEXT_LABEL)
                    .fontWeight(FontWeight.Medium)
                    .width('100%')
                    .padding({ left: 8, top: 4 })

                  Row() {
                    Text('错误数:')
                      .fontSize(ProteusFonts.PARAM_KEY)
                      .fontColor(ProteusColors.TEXT_LABEL)
                    Text(`${this.ercCount}`)
                      .fontSize(ProteusFonts.TITLE)
                      .fontColor(this.ercCount > 0 ? ProteusColors.ERC_ERR : ProteusColors.ERC_OK)
                      .fontWeight(FontWeight.Medium)
                      .margin({ left: 4 })
                  }
                  .width('100%')
                  .padding({ left: 8 })
                  .alignItems(VerticalAlign.Center)

                  ProteusClassicBtn({
                    label: '运行 ERC 检查',
                    widthVal: '86%',
                    onAction: () => {
                      const errors = this.appService.runErc(false);
                      this.ercErrors = errors;
                      const errN = errors.filter(e => e.severity === 'error' || e.severity === 'critical').length;
                      this.ercCount = errors.length;
                      this.navTab = 3;
                      this.statusMessage = `ERC: ${errors.length} issues (${errN} errors)`;
                    }
                  })
                  .margin({ left: 8 })

                  Divider().color(ProteusColors.DIVIDER).height(1).width('100%').margin({ top: 4 })

                  Text('电路统计')
                    .fontSize(ProteusFonts.PARAM_KEY)
                    .fontColor(ProteusColors.TEXT_LABEL)
                    .fontWeight(FontWeight.Medium)
                    .width('100%')
                    .padding({ left: 8, top: 4 })

                  Column({ space: 4 }) {
                    Row() {
                      Text('器件:')
                        .fontSize(ProteusFonts.PARAM_KEY)
                        .fontColor(ProteusColors.TEXT_LABEL)
                        .width(48)
                      Text(`${this.getDocComponents().length}`)
                        .fontSize(ProteusFonts.PARAM_KEY)
                        .fontColor(ProteusColors.TEXT_PRIMARY)
                    }
                    Row() {
                      Text('网络:')
                        .fontSize(ProteusFonts.PARAM_KEY)
                        .fontColor(ProteusColors.TEXT_LABEL)
                        .width(48)
                      Text(`${this.getDocNets().length}`)
                        .fontSize(ProteusFonts.PARAM_KEY)
                        .fontColor(ProteusColors.TEXT_PRIMARY)
                    }
                  }
                  .alignItems(HorizontalAlign.Start)
                  .width('100%')
                  .padding({ left: 8 })
                }
                .width('100%')
                .alignItems(HorizontalAlign.Start)
                .padding({ bottom: 8 })
              } else if (this.activeRightTab === 2) {
                AiSettingsPanel({ statusMessage: $statusMessage })
                  .constraintSize({ minHeight: 280 })
              } else if (this.activeRightTab === 3) {
                McuDebugPanel({
                  statusMessage: $statusMessage,
                  selectedComponentId: this.selectedComponentId
                })
                  .constraintSize({ minHeight: 320 })
              } else if (this.activeRightTab === 5) {
                FaultInjectionPanel({
                  statusMessage: $statusMessage,
                  selectedComponentId: this.selectedComponentId
                })
                  .constraintSize({ minHeight: 240 })
              } else if (this.activeRightTab === 6) {
                TeachingPanel({
                  statusMessage: $statusMessage,
                  selectedComponentId: this.selectedComponentId
                })
                  .constraintSize({ minHeight: 240 })
              } else if (this.activeRightTab === 7) {
                PlatformSettingsPanel({ statusMessage: $statusMessage, themeRefreshKey: $themeRefreshKey })
                  .constraintSize({ minHeight: 320 })
              }
            }
            .width('100%')
          }
          .layoutWeight(1)
          .scrollBar(BarState.Auto)
        }

        // Vertical sidebar tab strip
        Column() {
          this.SidebarTab('Props', ProteusIconName.SETTINGS, 0)
          this.SidebarTab('Sim', ProteusIconName.PLAY, 1)
          this.SidebarTab('AI', ProteusIconName.AI_ROUTE, 2)
          Stack() {
            this.SidebarTab('Debug', ProteusIconName.COMPONENT, 3)
            if (this.debugTabHasBadge) {
              Text('●')
                .fontSize(7)
                .fontColor(ProteusColors.ERC_ERR)
                .position({ x: 28, y: 4 })
            }
          }
          this.SidebarTab('Instr', ProteusIconName.ZOOM_IN, 4)
          this.SidebarTab('Fault', ProteusIconName.WARNING, 5)
          this.SidebarTab('Teach', ProteusIconName.LABEL, 6)
          this.SidebarTab('Set', ProteusIconName.GRID, 7)
        }
        .width(44)
        .height('100%')
        .backgroundColor(ProteusColors.SIDEBAR_BG)
        .border({ width: { left: 1 }, color: ProteusColors.SIDEBAR_TAB_BORDER })
      }
      .layoutWeight(1)
      .width('100%')
    }
    .width(this.rightPanelWidth)
    .height('100%')
    .backgroundColor(ProteusColors.CANVAS_BG)
    .border({ width: { left: 1 }, color: ProteusColors.DIVIDER })
  }

  @Builder
  SidebarTab(label: string, icon: ProteusIconName, tabIdx: number) {
    Column() {
      ProteusIcon({
        name: icon,
        iconSize: 16,
        color: this.activeRightTab === tabIdx ?
          ProteusColors.SIDEBAR_TAB_ACTIVE_TEXT : ProteusColors.SIDEBAR_TAB_IDLE_TEXT
      })
      Text(label)
        .fontSize(9)
        .fontColor(this.activeRightTab === tabIdx ?
          ProteusColors.SIDEBAR_TAB_ACTIVE_TEXT : ProteusColors.SIDEBAR_TAB_IDLE_TEXT)
        .fontWeight(this.activeRightTab === tabIdx ? FontWeight.Bold : FontWeight.Medium)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .margin({ top: 2 })
    }
    .width(44)
    .height(50)
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .backgroundColor(this.activeRightTab === tabIdx ?
      ProteusColors.SIDEBAR_TAB_ACTIVE_BG : ProteusColors.SIDEBAR_TAB_IDLE_BG)
    .border({
      width: {
        left: this.activeRightTab === tabIdx ? 3 : 0,
        bottom: 1
      },
      color: this.activeRightTab === tabIdx ?
        ProteusColors.BTN_FOCUS : ProteusColors.SIDEBAR_TAB_BORDER
    })
    .onClick(() => { this.setActiveRightTab(tabIdx); })
  }

  /** Welcome dialog — shown on first launch when no prior session exists */
  @Builder
  WelcomeDialog() {
    Column() {
      Column() {
        Text('欢迎使用 AI 原理图仿真')
          .fontSize(18)
          .fontColor(ProteusColors.TEXT_PRIMARY)
          .fontWeight(FontWeight.Bold)
          .margin({ bottom: 4 })
        Text('请先新建工程或打开已有工程')
          .fontSize(ProteusFonts.STATUS)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .margin({ bottom: 16 })
        Row({ space: 12 }) {
          ProteusClassicBtn({
            label: '新建工程',
            widthVal: '48%',
            onAction: () => { this.handleNewProject(); }
          })
          ProteusClassicBtn({
            label: '打开工程',
            widthVal: '48%',
            onAction: () => { void this.handleOpenProject(); }
          })
        }
        .width('100%')
      }
      .width(340)
      .padding(24)
      .backgroundColor(ProteusColors.CANVAS_BG)
      .border({ width: 1, color: ProteusColors.DIVIDER })
      .shadow({ radius: 12, color: '#00000060' })
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .backgroundColor('#00000080')
  }

  /** New project name input dialog */
  @Builder
  NewProjectDialog() {
    Column() {
      Column() {
        Text('新建工程')
          .fontSize(ProteusFonts.TITLE)
          .fontColor(ProteusColors.TEXT_PRIMARY)
          .fontWeight(FontWeight.Medium)
          .margin({ bottom: 8 })
        Text('请输入工程名称')
          .fontSize(ProteusFonts.STATUS)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .margin({ bottom: 8 })
        TextInput({ placeholder: 'MyProject', text: this.newProjectNameInput })
          .width('100%')
          .height(32)
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(ProteusColors.TEXT_PRIMARY)
          .borderRadius(0)
          .border({ width: 1, color: ProteusColors.INPUT_BORDER })
          .backgroundColor(ProteusColors.CANVAS_BG)
          .onChange((v: string) => { this.newProjectNameInput = v; })
          .onSubmit(() => { this.doCreateNewProject(); })
        Row({ space: 8 }) {
          ProteusClassicBtn({
            label: '取消',
            widthVal: '48%',
            onAction: () => {
              this.showNewProjectDialog = false;
              this.showWelcomeDialog = true;
            }
          })
          ProteusClassicBtn({
            label: '创建',
            widthVal: '48%',
            onAction: () => { this.doCreateNewProject(); }
          })
        }
        .width('100%')
        .margin({ top: 8 })
      }
      .width(340)
      .padding(16)
      .backgroundColor(ProteusColors.CANVAS_BG)
      .border({ width: 1, color: ProteusColors.DIVIDER })
      .shadow({ radius: 8, color: '#00000040' })
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .backgroundColor('#00000060')
    .onClick(() => { this.showNewProjectDialog = false; })
  }

  /** Recovery dialog — shown when unsaved recovery files are detected */
  @Builder
  RecoveryDialog() {
    Column() {
      Column() {
        Text('检测到未正常关闭的工程')
          .fontSize(ProteusFonts.TITLE)
          .fontColor(ProteusColors.ERC_WARN)
          .fontWeight(FontWeight.Medium)
          .margin({ bottom: 4 })
        Text('上次软件未正常关闭，以下工程可尝试恢复')
          .fontSize(ProteusFonts.STATUS)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .margin({ bottom: 12 })
        // List recovery files
        List({ space: 4 }) {
          ForEach(this.recoveryFiles, (file: string, _idx: number) => {
            ListItem() {
              Row() {
                Text(file)
                  .fontSize(ProteusFonts.PARAM_KEY)
                  .fontColor(ProteusColors.TEXT_PRIMARY)
                  .fontFamily('monospace')
                  .layoutWeight(1)
                  .maxLines(1)
                  .textOverflow({ overflow: TextOverflow.Ellipsis })
              }
              .width('100%')
              .padding(8)
              .backgroundColor(ProteusColors.INPUT_READONLY_BG)
            }
          }, (file: string) => file)
        }
        .height(80)
        .width('100%')
        .margin({ bottom: 12 })
        Row({ space: 8 }) {
          ProteusClassicBtn({
            label: '忽略',
            widthVal: '32%',
            onAction: () => {
              this.showRecoveryDialog = false;
              this.showWelcomeDialog = true;
            }
          })
          ProteusClassicBtn({
            label: '恢复最新',
            widthVal: '32%',
            onAction: () => {
              void this.doRecoverLatest();
            }
          })
          ProteusClassicBtn({
            label: '新建工程',
            widthVal: '32%',
            onAction: () => {
              this.showRecoveryDialog = false;
              this.handleNewProject();
            }
          })
        }
        .width('100%')
      }
      .width(380)
      .padding(16)
      .backgroundColor(ProteusColors.CANVAS_BG)
      .border({ width: 1, color: ProteusColors.DIVIDER })
      .shadow({ radius: 8, color: '#00000040' })
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .backgroundColor('#00000060')
  }

  async doRecoverLatest(): Promise<void> {
    if (this.recoveryFiles.length === 0) return;
    // Load the most recently modified recovery file (first in list)
    const path = this.recoveryFiles[this.recoveryFiles.length - 1];
    const ok = await this.appService.loadProject(path);
    if (ok) {
      this.projectName = this.appService.currentProject?.name ?? 'Recovered';
      const name = this.projectName;
      this.appService.disableAutoSave();
      this.appService.enableAutoSave(`${this.projectBaseDir}/autosave/${name}.schsim`, 120000);
      this.resetAfterProjectChange();
      this.appService.schematicEditor.fitAllInView();
      this.refreshComponentList();
      this.showRecoveryDialog = false;
      this.statusMessage = `已恢复工程: ${name}`;
    } else {
      this.statusMessage = '恢复失败，请尝试手动打开';
    }
  }

  @Builder
  FileOpenDialog() {
    Column() {
      Column() {
        Text('打开工程文件')
          .fontSize(ProteusFonts.TITLE)
          .fontColor(ProteusColors.TEXT_PRIMARY)
          .fontWeight(FontWeight.Medium)
          .margin({ bottom: 8 })
        Text('请输入 .schsim 工程文件路径')
          .fontSize(ProteusFonts.STATUS)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .margin({ bottom: 8 })
        TextInput({ placeholder: '/path/to/project.schsim', text: this.openFilePath })
          .width('100%')
          .height(32)
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(ProteusColors.TEXT_PRIMARY)
          .borderRadius(0)
          .border({ width: 1, color: ProteusColors.INPUT_BORDER })
          .backgroundColor(ProteusColors.CANVAS_BG)
          .onChange((v: string) => { this.openFilePath = v; })
        Row({ space: 8 }) {
          ProteusClassicBtn({
            label: '取消',
            widthVal: '48%',
            onAction: () => { this.showOpenDialog = false; }
          })
          ProteusClassicBtn({
            label: '打开',
            widthVal: '48%',
            onAction: () => { void this.doOpenFromPath(); }
          })
        }
        .width('100%')
        .margin({ top: 8 })
      }
      .width(320)
      .padding(16)
      .backgroundColor(ProteusColors.CANVAS_BG)
      .border({ width: 1, color: ProteusColors.DIVIDER })
      .shadow({ radius: 8, color: '#00000040' })
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .backgroundColor('#00000060')
    .onClick(() => { this.showOpenDialog = false; })
  }

  @Builder
  FileSaveAsDialog() {
    Column() {
      Column() {
        Text('另存为')
          .fontSize(ProteusFonts.TITLE)
          .fontColor(ProteusColors.TEXT_PRIMARY)
          .fontWeight(FontWeight.Medium)
          .margin({ bottom: 8 })
        Text('请输入保存路径')
          .fontSize(ProteusFonts.STATUS)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .margin({ bottom: 8 })
        TextInput({ placeholder: '/path/to/project.schsim', text: this.saveAsPath })
          .width('100%')
          .height(32)
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(ProteusColors.TEXT_PRIMARY)
          .borderRadius(0)
          .border({ width: 1, color: ProteusColors.INPUT_BORDER })
          .backgroundColor(ProteusColors.CANVAS_BG)
          .onChange((v: string) => { this.saveAsPath = v; })
        Row({ space: 8 }) {
          ProteusClassicBtn({
            label: '取消',
            widthVal: '48%',
            onAction: () => { this.showSaveAsDialog = false; }
          })
          ProteusClassicBtn({
            label: '保存',
            widthVal: '48%',
            onAction: () => { void this.doSaveAsFromPath(); }
          })
        }
        .width('100%')
        .margin({ top: 8 })
      }
      .width(320)
      .padding(16)
      .backgroundColor(ProteusColors.CANVAS_BG)
      .border({ width: 1, color: ProteusColors.DIVIDER })
      .shadow({ radius: 8, color: '#00000040' })
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .backgroundColor('#00000060')
    .onClick(() => { this.showSaveAsDialog = false; })
  }

  @Builder
  BurnHexDialog() {
    Column() {
      Column() {
        Text(`烧录 HEX 到 MCU`)
          .fontSize(ProteusFonts.TITLE)
          .fontColor(ProteusColors.TEXT_PRIMARY)
          .fontWeight(FontWeight.Medium)
          .margin({ bottom: 8 })
        Text('选择编译生成的 .hex 文件烧录到当前选中的 MCU')
          .fontSize(ProteusFonts.STATUS)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .margin({ bottom: 8 })

        // MCU family selector
        Row() {
          Text('目标架构:')
            .fontSize(ProteusFonts.PARAM_KEY)
            .fontColor(ProteusColors.TEXT_LABEL)
            .width(64)
          ProteusClassicBtn({
            label: '8051',
            widthVal: 52,
            onAction: () => { this.burnMcuFamily = '8051'; }
          })
          ProteusClassicBtn({
            label: 'STM32',
            widthVal: 52,
            onAction: () => { this.burnMcuFamily = 'STM32'; }
          })
          Text(`当前: ${this.burnMcuFamily === '8051' ? '8051' : 'STM32F1'}`)
            .fontSize(ProteusFonts.STATUS)
            .fontColor(ProteusColors.ERC_OK)
            .fontWeight(FontWeight.Medium)
            .margin({ left: 4 })
        }
        .width('100%')
        .margin({ bottom: 6 })

        // File path input
        Row() {
          TextInput({ placeholder: '/path/to/firmware.hex', text: this.burnFilePath })
            .layoutWeight(1)
            .height(32)
            .fontSize(ProteusFonts.PARAM_KEY)
            .fontColor(ProteusColors.TEXT_PRIMARY)
            .borderRadius(0)
            .border({ width: 1, color: ProteusColors.INPUT_BORDER })
            .backgroundColor(ProteusColors.CANVAS_BG)
            .onChange((v: string) => { this.burnFilePath = v; })
          ProteusClassicBtn({
            label: '浏览',
            widthVal: 60,
            onAction: () => { void this.doBrowseHexFile(); }
          })
        }
        .width('100%')
        .margin({ bottom: 6 })

        // Reset vector / Entry point
        Row() {
          Text('入口地址:')
            .fontSize(ProteusFonts.PARAM_KEY)
            .fontColor(ProteusColors.TEXT_LABEL)
            .width(64)
          TextInput({ text: this.burnEntryPoint, placeholder: '0x0000' })
            .layoutWeight(1)
            .height(28)
            .fontSize(ProteusFonts.PARAM_KEY)
            .fontColor(ProteusColors.TEXT_PRIMARY)
            .fontFamily('monospace')
            .borderRadius(0)
            .border({ width: 1, color: ProteusColors.INPUT_BORDER })
            .backgroundColor(ProteusColors.CANVAS_BG)
            .onChange((v: string) => { this.burnEntryPoint = v; })
        }
        .width('100%')
        .margin({ bottom: 6 })

        // Firmware info (shown after successful burn)
        if (this.burnFirmwareInfo.length > 0) {
          Column() {
            Text(this.burnFirmwareInfo)
              .fontSize(ProteusFonts.STATUS)
              .fontColor(ProteusColors.ERC_OK)
              .fontWeight(FontWeight.Medium)
              .maxLines(2)
              .width('100%')
              .padding(6)
              .backgroundColor('#0a2a0a')
              .border({ width: 1, color: '#30a030' })
          }
          .width('100%')
          .margin({ bottom: 8 })
        }

        Row({ space: 8 }) {
          ProteusClassicBtn({
            label: '取消',
            widthVal: '48%',
            onAction: () => {
              this.showBurnDialog = false;
              this.burnFirmwareInfo = '';
            }
          })
          ProteusClassicBtn({
            label: '烧录',
            widthVal: '48%',
            onAction: () => { void this.doBurnHex(); }
          })
        }
        .width('100%')
        .margin({ top: 4 })
      }
      .width(380)
      .padding(16)
      .backgroundColor(ProteusColors.CANVAS_BG)
      .border({ width: 1, color: ProteusColors.DIVIDER })
      .shadow({ radius: 8, color: '#00000040' })
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .backgroundColor('#00000060')
    .onClick(() => { this.showBurnDialog = false; })
  }

  /** Exit confirmation dialog — shown when user presses back with unsaved changes */
  @Builder
  ExitConfirmDialog() {
    Column() {
      Column() {
        Text('未保存的更改')
          .fontSize(ProteusFonts.TITLE)
          .fontColor(ProteusColors.TEXT_PRIMARY)
          .fontWeight(FontWeight.Medium)
          .margin({ bottom: 8 })
        Text('当前工程有未保存的更改，是否保存？')
          .fontSize(ProteusFonts.STATUS)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .margin({ bottom: 16 })
        Row({ space: 8 }) {
          ProteusClassicBtn({
            label: '取消',
            widthVal: '30%',
            onAction: () => { this.showExitConfirmDialog = false; }
          })
          ProteusClassicBtn({
            label: '不保存',
            widthVal: '30%',
            onAction: () => {
              this.unsavedChanges = false;
              this.showExitConfirmDialog = false;
              void this.appService.saveSession(this.appService.currentProjectPath, this.projectName, true);
            }
          })
          ProteusClassicBtn({
            label: '保存',
            widthVal: '30%',
            onAction: () => {
              this.showExitConfirmDialog = false;
              void this.handleSaveProject().then(() => {
                if (!this.unsavedChanges) {
                  void this.appService.saveSession(this.appService.currentProjectPath, this.projectName, true);
                }
              });
            }
          })
        }
        .width('100%')
        .margin({ top: 8 })
      }
      .width(380)
      .padding(24)
      .backgroundColor(ProteusColors.CANVAS_BG)
      .border({ width: 1, color: ProteusColors.DIVIDER })
      .shadow({ radius: 8, color: '#00000040' })
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .backgroundColor('#00000060')
    .onClick(() => { this.showExitConfirmDialog = false; })
  }

  @Builder
  StatusBar() {
    Row() {
      // Left group: mode + coords + grid + sel
      Text(`[${toolModeLabel(this.toolMode)}]`)
        .fontSize(ProteusFonts.STATUS)
        .fontColor(ProteusColors.TEXT_SECONDARY)
        .margin({ right: 8 })
      Text(`X:${this.mouseX} Y:${this.mouseY}`)
        .fontSize(ProteusFonts.STATUS)
        .fontColor(ProteusColors.TEXT_PRIMARY)
        .margin({ right: 8 })
      Text(`Grid:${this.appService.schematicEditor.getViewport().gridSize}`)
        .fontSize(ProteusFonts.STATUS)
        .fontColor(ProteusColors.TEXT_PRIMARY)
        .margin({ right: 8 })
      Text(`Sel:${this.selectedCount}`)
        .fontSize(ProteusFonts.STATUS)
        .fontColor(this.selectedCount > 0 ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_SECONDARY)
        .margin({ right: 8 })

      ProteusVDivider()

      // Center group: status message + AI progress
      Text(this.statusMessage)
        .fontSize(ProteusFonts.STATUS)
        .fontColor(ProteusColors.TEXT_LABEL)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .layoutWeight(1)
        .margin({ left: 8, right: 8 })
      if (this.aiProgress > 0 && this.aiProgress < 100) {
        Text(`${this.aiStage} ${this.aiProgress}%`)
          .fontSize(ProteusFonts.STATUS)
          .fontColor(ProteusColors.ERC_WARN)
          .margin({ right: 8 })
      }

      ProteusVDivider()

      // Right group: ERC + sim + zoom
      if (this.ercCount === 0) {
        Text(`ERC:0 ✓`)
          .fontSize(ProteusFonts.STATUS)
          .fontColor(ProteusColors.ERC_OK)
          .margin({ left: 8, right: 8 })
      } else {
        Text(`ERC:${this.ercCount}`)
          .fontSize(ProteusFonts.STATUS)
          .fontColor(ProteusColors.ERC_WARN)
          .margin({ left: 8, right: 8 })
      }
      Text(this.simRunning ? (this.simPaused ? 'Sim:Paused' : 'Sim:Running') : 'Sim:Idle')
        .fontSize(ProteusFonts.STATUS)
        .fontColor(this.simRunning ? ProteusColors.ERC_OK : ProteusColors.TEXT_PRIMARY)
        .margin({ right: 8 })
      Text(`${this.zoomPercent}%`)
        .fontSize(ProteusFonts.STATUS)
        .fontColor(ProteusColors.TEXT_PRIMARY)
        .margin({ right: 8 })
    }
    .width('100%')
    .height(ProteusDimens.STATUS_HEIGHT)
    .padding({ left: 8, right: 8 })
    .backgroundColor(ProteusColors.STATUS_BAR_BG)
    .border({ width: { top: 1 }, color: ProteusColors.DIVIDER })
    .alignItems(VerticalAlign.Center)
  }
}
