import { AppService } from '../services/AppService';
import { SchematicCanvas } from '../components/SchematicCanvas';
import { PropertyPanel } from '../components/PropertyPanel';
import { McuDebugPanel } from '../components/McuDebugPanel';
import { AiSettingsPanel } from '../components/AiSettingsPanel';
import { PlatformSettingsPanel } from '../components/PlatformSettingsPanel';
import { InstrumentPanel } from '../components/InstrumentPanel';
import { FaultInjectionPanel } from '../components/FaultInjectionPanel';
import { TeachingPanel } from '../components/TeachingPanel';
import { InstrTraceLogPanel } from '../components/InstrTraceLogPanel';
import { InstrumentWaveExpandOverlay } from '../components/InstrumentWaveExpandOverlay';
import {
  InstrumentWaveExpandStore,
  INSTR_WAVE_EXPAND_OPEN_KEY,
  INSTR_WAVE_EXPAND_TICK_KEY
} from '../components/InstrumentWaveExpandStore';
import { ComponentPreview } from '../components/ComponentPreview';
import {
  ProteusVDivider, ProteusPanelTitle,
  ProteusNavTab, ProteusTreeRow, ProteusClassicBtn, ProteusSectionTitle,
  ProteusMenuTrigger, ProteusToolButton, ProteusToolGroup, ProteusResizer,
  ProteusSidebarTab, ProteusNavCompRow, ProteusNavNetRow, ProteusErcRow,
  ProteusMenuEntry, ProteusTextInput, ProteusMenuItem
} from '../components/proteus/ProteusWidgets';
import { ProteusIcon, ProteusIconName } from '../components/proteus/ProteusIcons';
import { ProteusColors, ProteusDimens, ProteusFonts } from '../theme/ProteusTheme';
import { UiStateStore } from '../utils/UiStateStore';
import {
  CallbackRegistry, ErcError, ProgressInfo, Point2D, ComponentCategory,
  ComponentInstance, SchematicDocument, EventBus, ModuleEvent, ModuleEventPayload,
  McuFamily, isInstrumentLibraryId, traceBurn, formatFirmwarePreview,
  appVersionLabel, Logger, INSTR_TRACE_TAG, MainThreadYield
} from 'common';
import { SchematicEditorImpl, AlignType } from 'schematic_editor';
import { SimulationKernelImpl } from 'simulation_kernel';
import { EditorToolMode, toolModeLabel } from '../model/EditorToolMode';
import { AppViewModel } from '../viewmodel/AppViewModel';
import { common } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { picker, fileUri } from '@kit.CoreFileKit';
import { maximizeAppWindow } from '../utils/WindowLaunchUtil';
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
  /** 工程切换时递增，强制右侧栏面板 remount */
  @State rightPanelRefreshKey: number = 0;
  @State selectedComponentId: string = '';
  @State searchKeyword: string = '';
  @State componentList: string[] = [];
  @State ercCount: number = 0;
  @State ercErrors: ErcError[] = [];
  @State aiProgress: number = 0;
  @State aiStage: string = '';
  @State aiGenerating: boolean = false;
  @State mouseX: number = 0;
  @State mouseY: number = 0;
  @State zoomPercent: number = 100;
  @State gridVisible: boolean = true;
  @State warEnabled: boolean = true;
  @State rulerVisible: boolean = true;
  @State selectedCount: number = 0;
  @State selectedWireActive: boolean = false;
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
  @State libRefreshKey: number = 0;
  @State @Watch('onThemeRefresh') themeRefreshKey: number = 0;
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
  @State showSimFailDialog: boolean = false;
  @StorageLink(INSTR_WAVE_EXPAND_OPEN_KEY) showInstrWaveExpand: boolean = false;
  @StorageLink(INSTR_WAVE_EXPAND_TICK_KEY) instrWaveExpandTick: number = 0;
  @State simFailMessage: string = '';

  private clipboardLibId: string = '';
  private clipboardDeviceIds: string[] = [];
  private userProjectDir: string = '';
  private modifierKeys: number = 0;
  private appService: AppService = AppService.getInstance();
  private vm: AppViewModel = AppViewModel.getInstance(this.appService);
  private uiState: UiStateStore = UiStateStore.getInstance();

  async aboutToAppear(): Promise<void> {
    InstrumentWaveExpandStore.ensureAppStorage();
    Logger.info(INSTR_TRACE_TAG, `[APP] START ver=${appVersionLabel()}`);
    const ctx = this.getUIContext().getHostContext() as common.UIAbilityContext;
    this.appService.initPlatform(ctx);
    this.userProjectDir = this.appService.getUserProjectDir();
    this.warEnabled = this.getEditorImpl().isWarEnabled();
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
    this.appService.onAiGeneratingChanged = (busy: boolean) => {
      this.aiGenerating = busy;
      if (busy) {
        this.setActiveRightTab(2);
        this.rightCollapsed = false;
        this.uiState.rightCollapsed = false;
        this.previewComponentId = '';
        this.toolMode = EditorToolMode.SELECT;
        this.wireStartActive = false;
      }
      this.bumpCanvas();
    };
    this.appService.onProjectChanged = () => {
      this.refreshUiAfterProjectChange();
    };
    this.appService.onWaveUpdate = (_waves) => {
      this.simWaveTick++;
    };

    CallbackRegistry.getInstance().onSelectionChange((devs) => {
      this.selectedCount = devs.length;
      const nets = this.appService.schematicEditor.getSelectedNets();
      this.selectedWireActive = nets.length > 0;
      if (devs.length > 0) {
        this.selectedComponentId = devs[0].instUuid;
        this.updateContextualTabs(devs[0].instUuid);
      } else if (!this.selectedWireActive) {
        this.selectedComponentId = '';
        this.debugTabHasBadge = false;
        this.instrTabHasBadge = false;
      } else {
        this.selectedComponentId = '';
      }
    });

    EventBus.getInstance().subscribe(ModuleEvent.SCHEMATIC_CHANGED, this.onSchematicChanged);

    EventBus.getInstance().subscribe(ModuleEvent.SIMULATION_STARTED, () => {
      this.simRunning = true;
      this.lockEditingForSimulation();
    });
    EventBus.getInstance().subscribe(ModuleEvent.SIMULATION_STOPPED, () => {
      this.simRunning = false;
      this.simPaused = false;
    });

    this.loadUiState();
    // 平台设置（主题/缩放）已在 initPlatform 落地，触发一次 UI 重绘
    this.themeRefreshKey++;
    this.getEditorImpl().setGridVisible(this.gridVisible);
    this.initCategoryTree();
    this.appService.onLibraryLoaded = (_total: number) => {
      this.initCategoryTree();
      this.libRefreshKey++;
      if (this.searchKeyword.trim().length > 0) {
        this.refreshComponentList();
      }
    };
    this.hookStartupWindowResize();
    // Splash 阶段已最大化；此处再确认一次（幂等），并拉长启动期 refit 窗口
    void maximizeAppWindow(ctx).then(() => {
      this.startupRefitDeadline = Date.now() + 5000;
      this.deferCanvasFit();
    });

    // 先让出主线程，结束首页点击的 MMITask，避免与工程装载叠出 THREAD_BLOCK_6S
    await MainThreadYield.yield();

    // 首页传入 launchMode 时按意图打开；否则创建空白工程（不再自动恢复 session / 欢迎弹窗）
    this.recoveryFiles = await this.appService.checkRecoveryFiles();
    await MainThreadYield.yield();
    if (await this.applyLaunchFromRouter()) {
      return;
    }

    this.appService.newProject('Untitled');
    this.appService.enableAutoSave(`${this.appService.getAutosaveDir()}/Untitled.schsim`,
      AppService.AUTOSAVE_INTERVAL_MS);
    this.refreshComponentList();
    this.deferCanvasFit();
    this.appInitialized = true;
    this.statusMessage = '新建空白工程';
    await this.appService.markSessionRunning();
  }

  onPageHide(): void {
    void this.appService.flushProjectProtection(false);
  }

  aboutToDisappear(): void {
    void this.appService.flushProjectProtection(!this.unsavedChanges);
  }

  onBackPress(): boolean {
    if (this.unsavedChanges) {
      this.showExitConfirmDialog = true;
      return true;
    }
    void this.appService.flushProjectProtection(true);
    return false;
  }

  onThemeRefresh(): void {
    // 主题/无障碍变更后重绘画布（网格色、导线色、背景、符号描边）
    this.canvasVersion++;
    this.navRefreshKey++;
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

  /** 仿真中可点击/拖动的交互器件 — 操作时不应切换右侧栏 */
  private isInteractiveSimComponent(libraryId: string): boolean {
    const lib = libraryId.toUpperCase();
    return lib === 'SW_PUSH' || lib.includes('SWITCH_PUSH') || lib === 'BUTTON' ||
      lib.startsWith('POT_') || lib.includes('POTENTIOMETER') || lib === 'POT' || lib.includes('_POT');
  }

  updateContextualTabs(instUuid: string): void {
    const doc = this.appService.schematicEditor.getDocument();
    const comp = doc.components.find(c => c.id === instUuid);
    if (!comp) return;
    const lib = comp.libraryId.toUpperCase();
    const isMcu = lib.startsWith('STM32') || lib.startsWith('8051') || lib.startsWith('AT89') ||
      lib.startsWith('STC') || lib.startsWith('AVR');
    const isInstr = isInstrumentLibraryId(comp.libraryId);
    this.debugTabHasBadge = isMcu;
    this.instrTabHasBadge = isInstr;
    // 仿真中点击开关/电位器等交互器件时，保持当前右侧面板不变
    if (this.simRunning && this.isInteractiveSimComponent(comp.libraryId)) {
      return;
    }
    // 选中器件时展开右侧栏并跳到对应面板：MCU→调试、仪器→Instr、其余→属性
    if (this.rightCollapsed) {
      this.rightCollapsed = false;
      this.uiState.rightCollapsed = false;
    }
    if (isMcu) {
      this.setActiveRightTab(3);
    } else if (isInstr) {
      this.setActiveRightTab(4);
    } else {
      this.setActiveRightTab(0);
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
      const count = this.appService.componentLibrary.listAllByCategory(cat).length;
      const base = labels.get(cat) ?? cat;
      nodes.push({
        cat: cat,
        label: count > 0 ? `${base} (${count})` : base,
        expanded: false
      });
      if (i === 0) {
        expanded.add(cat);
      }
    }
    this.categoryNodes = nodes;
    // Preserve already-expanded categories across library reload
    if (this.expandedCategories.size > 0) {
      const keep = new Set<ComponentCategory>();
      this.expandedCategories.forEach((c: ComponentCategory) => {
        if (cats.indexOf(c) >= 0) {
          keep.add(c);
        }
      });
      if (keep.size > 0) {
        this.expandedCategories = keep;
        return;
      }
    }
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
      // 拉全部分页结果，避免库很大时只显示前 50 条
      const pageSize = 200;
      let page = 1;
      const rows: string[] = [];
      let total = 0;
      while (true) {
        const result = this.appService.componentLibrary.search(kw, page, pageSize);
        total = result.total;
        for (let i = 0; i < result.items.length; i++) {
          const c = result.items[i];
          rows.push(`${c.id}|${c.name}`);
        }
        if (rows.length >= total || result.items.length === 0) {
          break;
        }
        page++;
        if (page > 50) {
          break;
        }
      }
      this.componentList = rows;
    } else {
      this.componentList = [];
    }
  }

  bumpCanvas(): void {
    this.canvasVersion++;
    this.navRefreshKey++;
  }

  private startupRefitDeadline: number = 0;
  private windowResizeHooked: boolean = false;

  /**
   * Wait until canvas reports real size, then fit.
   * applyFitRect 在尺寸未就绪时会直接 return，故需重试；稳定后再补一次纠正半窗缩放。
   * 用户已手动缩放/平移后不再覆盖视口。
   */
  private deferCanvasFit(attempt: number = 0): void {
    const editor = this.appService.schematicEditor as SchematicEditorImpl;
    if (editor.isViewportUserLocked()) {
      return;
    }
    if (editor.isCanvasViewReady()) {
      editor.autoFitAllInView();
      this.bumpCanvas();
      // 布局可能仍在收敛：短延迟再 fit 一次，消除偶发“局部软放大”
      if (attempt === 0 || attempt === 4) {
        setTimeout(() => {
          if (editor.isViewportUserLocked()) {
            return;
          }
          if (editor.isCanvasViewReady()) {
            editor.autoFitAllInView();
            this.bumpCanvas();
          }
        }, attempt === 0 ? 120 : 280);
      }
      return;
    }
    if (attempt < 50) {
      setTimeout(() => this.deferCanvasFit(attempt + 1), 50);
    }
  }

  private hookStartupWindowResize(): void {
    if (this.windowResizeHooked) {
      return;
    }
    this.windowResizeHooked = true;
    this.startupRefitDeadline = Date.now() + 6000;
    const ctx = this.getUIContext().getHostContext() as common.UIAbilityContext;
    window.getLastWindow(ctx).then((win) => {
      win.on('windowSizeChange', () => {
        if (Date.now() > this.startupRefitDeadline) {
          return;
        }
        this.deferCanvasFit();
      });
    }).catch(() => {});
  }

  onPageShow(): void {
    this.hookStartupWindowResize();
    this.startupRefitDeadline = Date.now() + 6000;
    this.deferCanvasFit();
  }

  /** 新建/打开/切换工程后同步右侧栏与仿真 UI 状态 */
  private refreshUiAfterProjectChange(): void {
    this.projectName = this.appService.currentProject?.name ?? 'Untitled';
    const kernel = this.appService.simulationKernel as SimulationKernelImpl;
    if (kernel.isSimActive()) {
      this.appService.stopSimulation();
    }
    this.simRunning = false;
    this.simPaused = false;
    this.resetAfterProjectChange();
    this.refreshComponentList();
    // Defer ERC — template insert used to block MMI 3s+ with sync DeepErc + log flood
    this.appService.scheduleRuntimeErc(80);
  }

  private async startSimFromUi(): Promise<void> {
    const ok = await this.appService.startSimulation();
    this.applySimStartResult(ok);
    if (ok) {
      this.simPaused = false;
    }
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
    this.debugTabHasBadge = false;
    this.instrTabHasBadge = false;
    this.rightPanelRefreshKey++;
    this.bumpCanvas();
  }

  private lockEditingForSimulation(): void {
    if (this.toolMode === EditorToolMode.WIRE || this.toolMode === EditorToolMode.BUS) {
      this.toolMode = EditorToolMode.SELECT;
      this.uiState.toolMode = EditorToolMode.SELECT;
    }
    this.wireStartActive = false;
    this.wireStartX = 0;
    this.wireStartY = 0;
    this.bumpCanvas();
  }

  private applySimStartResult(ok: boolean): void {
    this.simRunning = ok;
    if (ok) {
      this.lockEditingForSimulation();
      return;
    }
    const reason = this.appService.getLastSimStartFailReason();
    this.simFailMessage = reason.length > 0 ? reason : '仿真启动失败，请检查电路连接后重试';
    this.showSimFailDialog = true;
  }

  setToolMode(mode: EditorToolMode, pendingId: string = ''): void {
    if (this.aiGenerating) {
      this.statusMessage = 'AI 生成中，画布已锁定';
      return;
    }
    if (this.simRunning && (mode === EditorToolMode.WIRE || mode === EditorToolMode.BUS)) {
      this.statusMessage = '仿真运行中，无法接线';
      return;
    }
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
    } else if (mode === EditorToolMode.LABEL) {
      this.statusMessage = '网络标签：点击画布输入网络名；选择模式下双击标号可改名';
    } else if (mode === EditorToolMode.WIRE) {
      this.statusMessage = '连线：点引脚开始 → 点空白加拐点 → 再点同一拐点放端点 / 或点另一引脚完成；右击取消';
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

  /** 将沙箱 project 目录转为系统文件选择器可用的 URI */
  private getProjectDirUri(): string {
    if (this.userProjectDir.length === 0) {
      this.userProjectDir = this.appService.getUserProjectDir();
    }
    try {
      fs.accessSync(this.userProjectDir);
    } catch (_e) {
      try { fs.mkdirSync(this.userProjectDir, true); } catch (_e2) { /* */ }
    }
    try {
      return fileUri.getUriFromPath(this.userProjectDir);
    } catch (_e) {
      return '';
    }
  }

  private getHostAbilityContext(): common.UIAbilityContext {
    return this.getUIContext().getHostContext() as common.UIAbilityContext;
  }

  /** 从 file:// / content:// / 本地路径提取工程名 */
  private projectNameFromPath(pathOrUri: string): string {
    let s = pathOrUri;
    const q = s.indexOf('?');
    if (q >= 0) {
      s = s.substring(0, q);
    }
    const slash = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
    let name = slash >= 0 ? s.substring(slash + 1) : s;
    try {
      name = decodeURIComponent(name);
    } catch (_e) { /* keep */ }
    const lower = name.toLowerCase();
    if (lower.endsWith('.schsim')) {
      name = name.substring(0, name.length - 7);
    } else if (lower.endsWith('.json')) {
      name = name.substring(0, name.length - 5);
    }
    name = name.replace(/[\\/:*?"<>|]/g, '_').trim();
    return name.length > 0 ? name : 'Untitled';
  }

  private applyOpenedProject(path: string): void {
    this.projectName = this.appService.currentProject?.name ?? this.projectNameFromPath(path);
    const name = this.projectName;
    this.appService.disableAutoSave();
    this.appService.enableAutoSave(`${this.appService.getAutosaveDir()}/${name}.schsim`, AppService.AUTOSAVE_INTERVAL_MS);
    this.appService.schematicEditor.fitAllInView();
    this.unsavedChanges = false;
    void this.appService.saveSession(path, name, false);
    this.statusMessage = `已加载: ${path}`;
  }

  /** 首页快捷入口：内存工作区，不启用 autosave、不写 Untitled.schsim */
  private initEphemeralWorkspace(projectName: string = 'Untitled'): void {
    this.showWelcomeDialog = false;
    this.appService.disableAutoSave();
    this.appService.newProject(projectName);
    this.projectName = projectName;
    this.appService.schematicEditor.fitAllInView();
    this.unsavedChanges = false;
    this.statusMessage = '未保存工作区 · 请通过 文件 → 保存 写入工程';
  }

  private sanitizeProjectName(raw: string | undefined): string {
    if (raw === undefined || raw.trim().length === 0) {
      return 'Untitled';
    }
    let name = raw.trim().replace(/[\\/:*?"<>|]/g, '_');
    return name.length > 0 ? name : 'Untitled';
  }

  /** 读取 HomePage 传入的路由参数并初始化工程 */
  private async applyLaunchFromRouter(): Promise<boolean> {
    let params: Record<string, Object> = {};
    try {
      params = this.getUIContext().getRouter().getParams() as Record<string, Object>;
    } catch (_e) {
      return false;
    }
    const mode = params['launchMode'] as string | undefined;
    if (mode === undefined || mode.length === 0) {
      return false;
    }

    if (mode === 'open') {
      const path = params['projectPath'] as string | undefined;
      if (path !== undefined && path.length > 0) {
        const ok = await this.appService.loadProject(path);
        if (ok) {
          this.applyOpenedProject(path);
          this.refreshComponentList();
          this.deferCanvasFit();
          this.appInitialized = true;
          if (params['showRecovery'] === true) {
            this.showRecoveryDialog = true;
          }
          await this.appService.markSessionRunning();
          this.applyPostLaunchRouterOptions(params);
          return true;
        }
        this.statusMessage = `无法打开: ${path}`;
      }
      return false;
    }

    if (mode === 'new') {
      const name = this.sanitizeProjectName(params['projectName'] as string | undefined);
      this.createNamedProject(name);
      this.refreshComponentList();
      this.deferCanvasFit();
      this.appInitialized = true;
      await this.appService.markSessionRunning();
      this.applyPostLaunchRouterOptions(params);
      return true;
    }

    if (mode === 'resume') {
      if (this.appService.currentProject !== null) {
        this.projectName = this.appService.currentProject.name;
        if (this.appService.currentProject.pcb) {
          this.appService.pcbEditor.loadDocument(this.appService.currentProject.pcb);
        }
        this.refreshComponentList();
        this.deferCanvasFit();
        this.appInitialized = true;
        this.applyPostLaunchRouterOptions(params);
        return true;
      }
      return false;
    }

    if (mode === 'blank' || mode === 'scratch') {
      const name = this.sanitizeProjectName(params['projectName'] as string | undefined);
      const persist = params['persistProject'] === true;
      if (persist) {
        this.appService.disableAutoSave();
        this.appService.newProject(name);
        this.projectName = name;
        this.appService.enableAutoSave(`${this.appService.getAutosaveDir()}/${name}.schsim`,
          AppService.AUTOSAVE_INTERVAL_MS);
        this.statusMessage = '新建空白工程';
        await this.appService.markSessionRunning();
      } else {
        this.initEphemeralWorkspace(name);
      }
      this.refreshComponentList();
      this.deferCanvasFit();
      this.appInitialized = true;
      this.applyPostLaunchRouterOptions(params);
      return true;
    }

    return false;
  }

  /** HomePage 传入的后续 UI 意图：打开侧栏标签、自动仿真等 */
  private applyPostLaunchRouterOptions(params: Record<string, Object>): void {
    if (params['expandRightPanel'] === true) {
      this.rightCollapsed = false;
      this.uiState.rightCollapsed = false;
    }
    const tabRaw = params['openRightTab'];
    if (tabRaw !== undefined) {
      const tab = Number(tabRaw);
      if (!isNaN(tab) && tab >= 0 && tab <= 8) {
        this.setActiveRightTab(tab);
        this.rightCollapsed = false;
        this.uiState.rightCollapsed = false;
      }
    }
    if (params['autoStartSim'] === true) {
      setTimeout(() => {
        void this.startSimFromUi();
      }, 450);
    }
  }

  private createNamedProject(name: string): void {
    this.showWelcomeDialog = false;
    this.appService.disableAutoSave();
    this.appService.newProject(name);
    this.projectName = name;
    this.appService.schematicEditor.fitAllInView();
    const projectPath = `${this.userProjectDir}/${name}.schsim`;
    const autoSavePath = `${this.appService.getAutosaveDir()}/${name}.schsim`;
    this.appService.currentProjectPath = projectPath;
    void this.appService.saveProject(projectPath, true).then((saved) => {
      if (saved) {
        this.appService.currentProjectPath = projectPath;
        this.unsavedChanges = false;
        this.statusMessage = `已创建: ${projectPath}`;
        void this.appService.saveSession(projectPath, name, false);
      } else {
        this.statusMessage = `创建失败，请检查工程目录: ${this.userProjectDir}`;
      }
    });
    this.appService.enableAutoSave(autoSavePath, AppService.AUTOSAVE_INTERVAL_MS);
  }

  async goToHomePage(): Promise<void> {
    await this.appService.flushProjectProtection(!this.unsavedChanges);
    try {
      await this.getUIContext().getRouter().replaceUrl({ url: 'pages/HomePage' });
    } catch (_e) {
      this.statusMessage = '无法返回首页';
    }
  }

  async goToPcbPage(): Promise<void> {
    this.appService.syncProjectFromModules();
    try {
      await this.getUIContext().getRouter().replaceUrl({
        url: 'pages/PcbPage',
        params: { launchMode: 'resume', fromSchematic: true }
      });
    } catch (_e) {
      this.statusMessage = '无法打开 PCB 编辑器';
    }
  }

  /** 导出当前原理图到 PCB：跳转 PCB 页并前向标注保存为 .pcbsim */
  async exportSchematicToPcb(): Promise<void> {
    this.appService.syncProjectFromModules();
    if (this.appService.currentProject === null) {
      this.statusMessage = '请先新建或打开工程';
      return;
    }
    try {
      await this.getUIContext().getRouter().replaceUrl({
        url: 'pages/PcbPage',
        params: { launchMode: 'resume', importFromSchematic: true, fromSchematic: true }
      });
    } catch (_e) {
      this.statusMessage = '无法导出到 PCB 编辑器';
    }
  }

  /**
   * 新建：直接打开系统文件管理（默认定位到 project 目录）另存为新工程
   */
  async handleNewProject(): Promise<void> {
    this.showWelcomeDialog = false;
    this.showOpenDialog = false;
    this.showSaveAsDialog = false;
    this.showNewProjectDialog = false;
    const result = await this.createProjectViaPicker();
    if (result === 'unavailable') {
      // 选择器不可用时，回退到名称对话框（仍写入 project 目录）
      this.newProjectNameInput = '';
      this.showNewProjectDialog = true;
    }
  }

  /** 通过系统保存对话框在 project 目录创建工程 */
  private async createProjectViaPicker(): Promise<'ok' | 'cancel' | 'unavailable'> {
    try {
      const options = new picker.DocumentSaveOptions();
      options.newFileNames = ['Untitled.schsim'];
      options.fileSuffixChoices = ['原理图工程|.schsim', 'JSON|.json'];
      const dirUri = this.getProjectDirUri();
      if (dirUri.length > 0) {
        options.defaultFilePathUri = dirUri;
      }
      const docPicker = new picker.DocumentViewPicker(this.getHostAbilityContext());
      const uris = await docPicker.save(options);
      if (!uris || uris.length === 0) {
        return 'cancel';
      }
      const path = uris[0];
      const name = this.projectNameFromPath(path);
      this.appService.disableAutoSave();
      this.appService.newProject(name);
      this.projectName = name;
      this.appService.schematicEditor.fitAllInView();
      const ok = await this.appService.saveProject(path, true);
      if (ok) {
        const autoSavePath = `${this.appService.getAutosaveDir()}/${name}.schsim`;
        this.appService.enableAutoSave(autoSavePath, AppService.AUTOSAVE_INTERVAL_MS);
        void this.appService.saveProject(autoSavePath, false);
        await this.appService.saveSession(path, name, false);
        this.unsavedChanges = false;
        this.statusMessage = `已创建: ${path}`;
      } else {
        this.statusMessage = '创建失败：无法写入所选位置';
      }
      return 'ok';
    } catch (_e) {
      return 'unavailable';
    }
  }

  doCreateNewProject(): void {
    let name = this.newProjectNameInput.trim().length > 0 ? this.newProjectNameInput.trim() : 'Untitled';
    // 禁止路径分隔符，避免跳出 project 目录
    name = name.replace(/[\\/:*?"<>|]/g, '_');
    if (name.length === 0) {
      name = 'Untitled';
    }
    this.showNewProjectDialog = false;
    this.showWelcomeDialog = false;
    this.createNamedProject(name);
  }

  /**
   * 打开：直接打开系统文件管理（默认定位到 project 目录）
   */
  async handleOpenProject(): Promise<void> {
    this.showWelcomeDialog = false;
    this.showSaveAsDialog = false;
    const result = await this.handleOpenFromPicker();
    if (result === 'unavailable') {
      // 选择器不可用时回退到路径对话框
      const sandboxProjects = this.appService.listUserProjectFiles();
      const recents = this.appService.filePersistence.getRecentFiles();
      if (sandboxProjects.length > 0) {
        this.openFilePath = sandboxProjects[sandboxProjects.length - 1];
      } else if (recents.length > 0) {
        this.openFilePath = recents[0];
      } else {
        this.openFilePath = `${this.userProjectDir}/Untitled.schsim`;
      }
      this.showOpenDialog = true;
    }
  }

  /** @returns ok=已选择并处理；cancel=用户取消；unavailable=选择器不可用 */
  async handleOpenFromPicker(): Promise<'ok' | 'cancel' | 'unavailable'> {
    try {
      const options = new picker.DocumentSelectOptions();
      options.maxSelectNumber = 1;
      options.fileSuffixFilters = ['原理图工程|.schsim,.json', 'PCB工程|.pcbsim', '.schsim', '.pcbsim', '.json'];
      const dirUri = this.getProjectDirUri();
      if (dirUri.length > 0) {
        options.defaultFilePathUri = dirUri;
      }
      const docPicker = new picker.DocumentViewPicker(this.getHostAbilityContext());
      const uris = await docPicker.select(options);
      if (uris && uris.length > 0) {
        const path = uris[0];
        if (path.toLowerCase().endsWith('.pcbsim')) {
          this.showOpenDialog = false;
          this.showWelcomeDialog = false;
          try {
            this.getUIContext().getRouter().replaceUrl({
              url: 'pages/PcbPage',
              params: { launchMode: 'open', projectPath: path }
            }).catch((_e: BusinessError) => { /* ignore */ });
          } catch (_e) {
            this.statusMessage = '无法打开 PCB 编辑器';
          }
          return 'ok';
        }
        const ok = await this.appService.loadProject(path);
        if (ok) {
          this.showOpenDialog = false;
          this.showWelcomeDialog = false;
          this.applyOpenedProject(path);
          return 'ok';
        }
        this.statusMessage = `无法打开: ${path}`;
        return 'ok';
      }
      return 'cancel';
    } catch (_e) {
      this.statusMessage = '文件选择器不可用';
      return 'unavailable';
    }
  }

  async doOpenFromPath(): Promise<void> {
    if (this.openFilePath.trim().length === 0) {
      this.statusMessage = '请输入文件路径';
      return;
    }
    const path = this.openFilePath.trim();
    const ok = await this.appService.loadProject(path);
    if (ok) {
      this.showOpenDialog = false;
      this.showWelcomeDialog = false;
      this.applyOpenedProject(path);
    } else {
      this.statusMessage = `无法打开: ${path}`;
    }
  }

  async handleSaveProject(): Promise<void> {
    const path = this.appService.currentProjectPath;
    if (path.length > 0) {
      const ok = await this.appService.saveProject(path, true);
      if (ok) {
        // 同步 autosave 副本，不得改写正式路径
        const autoPath = `${this.appService.getAutosaveDir()}/${this.projectName}.schsim`;
        void this.appService.saveProject(autoPath, false);
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
      options.fileSuffixChoices = ['原理图工程|.schsim', 'JSON|.json'];
      const dirUri = this.getProjectDirUri();
      if (dirUri.length > 0) {
        options.defaultFilePathUri = dirUri;
      }
      const docPicker = new picker.DocumentViewPicker(this.getHostAbilityContext());
      const uris = await docPicker.save(options);
      if (uris && uris.length > 0) {
        const ok = await this.appService.saveProject(uris[0], true);
        if (ok) {
          const autoPath = `${this.appService.getAutosaveDir()}/${this.projectName}.schsim`;
          void this.appService.saveProject(autoPath, false);
          await this.appService.saveSession(uris[0], this.projectName, false);
          this.unsavedChanges = false;
        }
        this.statusMessage = ok ? `已保存: ${uris[0]}` : '保存失败';
        return;
      }
      return;
    } catch (_e) {
      // File picker not available, show manual dialog
    }
    this.saveAsPath = `${this.userProjectDir}/${this.projectName}.schsim`;
    this.showSaveAsDialog = true;
    this.showOpenDialog = false;
  }

  async doSaveAsFromPath(): Promise<void> {
    if (this.saveAsPath.trim().length === 0) {
      this.statusMessage = '请输入保存路径';
      return;
    }
    const path = this.saveAsPath.trim();
    const ok = await this.appService.saveProject(path, true);
    if (ok) {
      this.showSaveAsDialog = false;
      const autoPath = `${this.appService.getAutosaveDir()}/${this.projectName}.schsim`;
      void this.appService.saveProject(autoPath, false);
      await this.appService.saveSession(path, this.projectName, false);
      this.unsavedChanges = false;
    }
    this.statusMessage = ok ? `已保存: ${path}` : '保存失败';
  }

  async doBurnHex(): Promise<void> {
    const path = this.burnFilePath.trim();
    if (path.length === 0) {
      this.statusMessage = '请选择或输入 HEX 文件路径';
      traceBurn('UI_BURN_ABORT', 'empty path (toolbar dialog)');
      return;
    }
    traceBurn('UI_BURN_BEGIN', `source=toolbar path=${path} family=${this.burnMcuFamily}`);
    try {
      const fileHandle = fs.openSync(path, fs.OpenMode.READ_ONLY);
      const stat = fs.statSync(path);
      const buffer = new ArrayBuffer(stat.size);
      fs.readSync(fileHandle.fd, buffer);
      fs.closeSync(fileHandle);

      const hexView = new Uint8Array(buffer);
      traceBurn('UI_BURN_READ', `path=${path} size=${stat.size} preview=${formatFirmwarePreview(hexView)}`);
      const family = this.burnMcuFamily === '8051' ? McuFamily.MCU_8051 : McuFamily.MCU_STM32F1;
      const result = this.appService.hexDebugger.loadHexData(hexView, family);
      if (result.success && result.data !== undefined) {
        this.appService.loadMcuIntoSim(
          result.data.data, 0, this.burnMcuFamily);
        const parsed = this.appService.hexDebugger.getParsedHexInfo();
        if (parsed) {
          this.burnFileSize = `${(stat.size / 1024).toFixed(1)} KB`;
          const segCount = parsed.flashSegments.length;
          this.burnSegmentInfo = `${segCount} 段`;
          const entry = parsed.minAddr;
          this.burnEntryPoint = `0x${entry.toString(16).toUpperCase().padStart(4, '0')}`;
          this.burnFirmwareInfo = `已烧录 ${this.burnFileSize}, ${this.burnSegmentInfo}, 入口 ${this.burnEntryPoint}`;
          traceBurn('UI_BURN_OK',
            `source=toolbar path=${path} size=${this.burnFileSize} segs=${segCount} entry=${this.burnEntryPoint}`);
        } else {
          this.burnFileSize = `${(stat.size / 1024).toFixed(1)} KB`;
          this.burnFirmwareInfo = `已烧录 ${this.burnFileSize}`;
          this.burnSegmentInfo = '--';
          this.burnEntryPoint = '0x0000';
          traceBurn('UI_BURN_OK', `source=toolbar path=${path} size=${this.burnFileSize} (no parsed info)`);
        }
        this.statusMessage = `HEX 烧录成功: ${path}`;
        this.rightCollapsed = false;
        this.uiState.rightCollapsed = false;
        this.setActiveRightTab(3);
      } else {
        this.statusMessage = `HEX 加载失败: ${result.error ?? '未知错误'}`;
        this.burnFirmwareInfo = '';
        traceBurn('UI_BURN_FAIL', `source=toolbar path=${path} err=${result.error ?? 'unknown'}`);
      }
    } catch (e) {
      this.statusMessage = `烧录失败: ${e}`;
      this.burnFirmwareInfo = '';
      traceBurn('UI_BURN_FAIL', `source=toolbar path=${path} ex=${e}`);
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
    const editor = this.appService.schematicEditor as SchematicEditorImpl;
    const selectedWireIds = editor.getSelectedWireIds();

    if (selectedDevices.length > 0) {
      const ids: string[] = [];
      for (let i = 0; i < selectedDevices.length; i++) {
        ids.push(selectedDevices[i].instUuid);
      }
      this.appService.schematicEditor.batchDeleteDevice(ids);
    }

    if (selectedWireIds.length > 0) {
      this.appService.schematicEditor.clearSelectedRoute();
    }

    if (selectedDevices.length === 0 && selectedWireIds.length === 0) {
      this.statusMessage = '未选中任何对象';
      return;
    }

    this.selectedComponentId = '';
    this.selectedCount = 0;
    this.selectedWireActive = false;
    this.bumpCanvas();
    this.statusMessage = selectedWireIds.length > 0 && selectedDevices.length === 0
      ? `已删除 ${selectedWireIds.length} 根导线`
      : '已删除';
  }

  handleCopy(): void {
    const selected = this.appService.schematicEditor.getSelectedDevices();
    if (selected.length === 0) {
      this.statusMessage = '请先选中器件';
      return;
    }
    this.clipboardDeviceIds = [];
    for (let i = 0; i < selected.length; i++) {
      this.clipboardDeviceIds.push(selected[i].instUuid);
    }
    this.clipboardLibId = selected[0].libDevId;
    this.statusMessage = selected.length > 1
      ? `已复制 ${selected.length} 个器件`
      : `已复制 ${selected[0].refName}`;
  }

  handlePaste(): void {
    if (this.appService.rejectManualPlaceIfAiBusy()) {
      return;
    }
    if (this.clipboardDeviceIds.length > 0) {
      const newIds: string[] = [];
      for (let i = 0; i < this.clipboardDeviceIds.length; i++) {
        const offset = 30 + i * 12;
        const r = this.appService.schematicEditor.duplicateDevice(this.clipboardDeviceIds[i], offset, offset);
        if (r.success && r.data) {
          newIds.push(r.data);
        }
      }
      if (newIds.length > 0) {
        this.appService.schematicEditor.setSelection(newIds);
        this.selectedComponentId = newIds[newIds.length - 1];
        this.bumpCanvas();
        this.statusMessage = newIds.length > 1 ? `已粘贴 ${newIds.length} 个器件` : '已粘贴';
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
    if (this.appService.rejectManualPlaceIfAiBusy()) {
      return;
    }
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

  toggleWar(): void {
    this.warEnabled = !this.warEnabled;
    this.getEditorImpl().setWarEnabled(this.warEnabled);
    this.statusMessage = this.warEnabled
      ? 'WAR 已开启：连线自动避让器件/引脚/导线（预览=落线）'
      : 'WAR 已关闭：仅正交折线，不自动寻路';
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
          // Left edge peel when whole left dock is collapsed — was invisible before
          if (this.leftLibCollapsed && this.leftNavCollapsed) {
            this.LeftExpandStrip()
          }
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
          } else {
            this.RightExpandStrip()
          }
        }
        .layoutWeight(1)
        .width('100%')
        this.StatusBar()
      }
      .width('100%')
      .height('100%')
      // themeRefreshKey 参与 build：用 .key（非 .id）强制整页 remount，重读 ProteusColors
      .backgroundColor(ProteusColors.MENU_BG)
      .key(`main_shell_${this.themeRefreshKey}`)
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
      if (this.showSimFailDialog) {
        this.SimFailDialog()
      }
      if (this.showInstrWaveExpand) {
        InstrumentWaveExpandOverlay({
          refreshTick: this.instrWaveExpandTick,
          onClose: () => {
            InstrumentWaveExpandStore.getInstance().close();
          }
        })
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
      if (this.simRunning) {
        this.appService.stopSimulation();
        this.simRunning = false;
      } else {
        void this.startSimFromUi();
      }
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
        this.appService.schematicEditor.zoomByFactor(1.2);
        this.bumpCanvas();
        return true;
      case '-':
        this.appService.schematicEditor.zoomByFactor(1 / 1.2);
        this.bumpCanvas();
        return true;
      default: return false;
    }
  }

  @Builder
  MenuBar() {
    Row() {
      ProteusMenuItem({
        label: $r('app.string.menu_home'),
        onAction: () => { void this.goToHomePage(); }
      })
      Divider()
        .vertical(true)
        .height(18)
        .width(1)
        .color(ProteusColors.DIVIDER)
        .margin({ left: 2, right: 4 })
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
    .key(`menu_bar_${this.themeRefreshKey}`)
  }

  fileMenuEntries(): ProteusMenuEntry[] {
    return [
      { label: $r('app.string.toolbar_new'), shortcut: 'Ctrl+N', icon: ProteusIconName.NEW, action: () => { void this.handleNewProject(); } },
      { label: $r('app.string.toolbar_open'), shortcut: 'Ctrl+O', icon: ProteusIconName.OPEN, action: () => { void this.handleOpenProject(); } },
      { label: $r('app.string.toolbar_save'), shortcut: 'Ctrl+S', icon: ProteusIconName.SAVE, action: () => { void this.handleSaveProject(); } },
      { label: 'Save As...', shortcut: 'Ctrl+Shift+S', action: () => { void this.handleSaveAs(); } },
      { label: '', separator: true, action: () => {} },
      { label: $r('app.string.menu_back_home'), action: () => { void this.goToHomePage(); } },
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
        this.appService.schematicEditor.zoomByFactor(1.2);
        this.bumpCanvas();
      }},
      { label: $r('app.string.toolbar_zoom_out'), shortcut: '-', icon: ProteusIconName.ZOOM_OUT, action: () => {
        this.appService.schematicEditor.zoomByFactor(1 / 1.2);
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
      { label: $r('app.string.toolbar_war'), shortcut: '', icon: ProteusIconName.AI_ROUTE, action: () => this.toggleWar() },
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
          await this.startSimFromUi();
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
      { label: $r('app.string.toolbar_save'), shortcut: 'Ctrl+S', icon: ProteusIconName.SAVE, action: () => { void this.handleSaveProject(); } },
      { label: '', separator: true, action: () => {} },
      { label: $r('app.string.toolbar_export_pcb'), icon: ProteusIconName.LAYER, action: () => { void this.exportSchematicToPcb(); } },
      { label: 'PCB Layout', action: () => { void this.goToPcbPage(); } }
    ];
  }

  helpMenuEntries(): ProteusMenuEntry[] {
    return [
      { label: $r('app.string.menu_back_home'), action: () => { void this.goToHomePage(); } },
      { label: '', separator: true, action: () => {} },
      { label: 'Keyboard Shortcuts', shortcut: 'F1', action: () => {
        this.setActiveRightTab(7);
        if (this.rightCollapsed) {
          this.rightCollapsed = false;
          this.uiState.rightCollapsed = false;
        }
        this.statusMessage = 'Opened Settings panel — see shortcuts in toolbar tooltips';
      }},
      { label: '', separator: true, action: () => {} },
      { label: 'About', action: () => {
        this.statusMessage = `ElecDraw Schematic Editor ${appVersionLabel()}`;
      } }
    ];
  }

  @Builder
  MainToolbar() {
    Row() {
      ProteusToolGroup({ title: 'Home' }) {
        ProteusToolButton({
          iconName: ProteusIconName.HOME,
          tooltip: '返回首页',
          showLabel: false,
          onAction: () => { void this.goToHomePage(); }
        })
      }

      ProteusToolGroup({ title: 'File' }) {
        ProteusToolButton({ iconName: ProteusIconName.NEW, tooltip: '新建文件 (Ctrl+N)', showLabel: false, onAction: () => { void this.handleNewProject(); } })
        ProteusToolButton({ iconName: ProteusIconName.OPEN, tooltip: '打开文件 (Ctrl+O)', showLabel: false, onAction: () => { void this.handleOpenProject(); } })
        ProteusToolButton({ iconName: ProteusIconName.SAVE, tooltip: '保存文件 (Ctrl+S)', showLabel: false, onAction: () => { void this.handleSaveProject(); } })
        ProteusToolButton({
          iconName: ProteusIconName.LAYER,
          label: $r('app.string.toolbar_export_pcb'),
          showLabel: true,
          tooltip: '导出 PCB：将当前原理图同步为 PCB 文件并打开 PCB 编辑器',
          onAction: () => { void this.exportSchematicToPcb(); }
        })
      }

      ProteusToolGroup({ title: 'History' }) {
        ProteusToolButton({ iconName: ProteusIconName.UNDO, tooltip: '撤销 (Ctrl+Z)', showLabel: false, onAction: () => {
          const r = this.appService.schematicEditor.undo();
          this.statusMessage = r.success ? 'Undone' : 'Nothing to undo';
          this.bumpCanvas();
        }})
        ProteusToolButton({ iconName: ProteusIconName.REDO, tooltip: '重做 (Ctrl+Y)', showLabel: false, onAction: () => {
          const r = this.appService.schematicEditor.redo();
          this.statusMessage = r.success ? 'Redone' : 'Nothing to redo';
          this.bumpCanvas();
        }})
        ProteusToolButton({ iconName: ProteusIconName.TRASH, tooltip: '删除 (Del)', showLabel: false,
          disabled: this.selectedCount === 0 && !this.selectedWireActive,
          onAction: () => this.handleDeleteSelected() })
      }

      ProteusToolGroup({ title: 'Edit' }) {
        ProteusToolButton({ iconName: ProteusIconName.COPY, tooltip: '复制 (Ctrl+C)', showLabel: false,
          disabled: this.selectedCount === 0, onAction: () => this.handleCopy() })
        ProteusToolButton({ iconName: ProteusIconName.PASTE, tooltip: '粘贴 (Ctrl+V)', showLabel: false, onAction: () => this.handlePaste() })
      }

      ProteusToolGroup({ title: 'View' }) {
        ProteusToolButton({ iconName: ProteusIconName.ZOOM_IN, tooltip: '放大 (+)', showLabel: false, onAction: () => {
          this.appService.schematicEditor.zoomByFactor(1.2);
          this.bumpCanvas();
        }})
        ProteusToolButton({ iconName: ProteusIconName.ZOOM_OUT, tooltip: '缩小 (-)', showLabel: false, onAction: () => {
          this.appService.schematicEditor.zoomByFactor(1 / 1.2);
          this.bumpCanvas();
        }})
        ProteusToolButton({ iconName: ProteusIconName.FIT, tooltip: '适应窗口 (Ctrl+0)', showLabel: false, onAction: () => {
          this.appService.schematicEditor.fitAllInView();
          this.bumpCanvas();
        }})
        ProteusToolButton({ iconName: ProteusIconName.GRID, tooltip: '显示/隐藏网格 (G)', showLabel: false,
          active: this.gridVisible, onAction: () => this.toggleGrid() })
      }

      ProteusToolGroup({ title: 'Place' }) {
        ProteusToolButton({ iconName: ProteusIconName.COMPONENT, tooltip: '放置器件 (P)', showLabel: false,
          active: this.toolMode === EditorToolMode.PLACE, onAction: () => this.setToolMode(EditorToolMode.PLACE, this.previewComponentId) })
        ProteusToolButton({ iconName: ProteusIconName.WIRE, tooltip: '连线 (W)：点引脚→点空白加拐点→再点拐点放端点/或点另一引脚完成；右击取消', showLabel: false,
          active: this.toolMode === EditorToolMode.WIRE,
          disabled: this.simRunning,
          onAction: () => this.setToolMode(EditorToolMode.WIRE) })
        ProteusToolButton({
          iconName: ProteusIconName.AI_ROUTE,
          label: $r('app.string.toolbar_war'),
          showLabel: true,
          tooltip: 'WAR 导线自动寻路（Proteus Wire Auto Router）：开=避让器件/引脚/导线，预览路径即落线路径',
          active: this.warEnabled,
          onAction: () => this.toggleWar()
        })
        ProteusToolButton({ iconName: ProteusIconName.BUS, tooltip: '总线 (B)', showLabel: false,
          active: this.toolMode === EditorToolMode.BUS,
          disabled: this.simRunning,
          onAction: () => this.setToolMode(EditorToolMode.BUS) })
        ProteusToolButton({ iconName: ProteusIconName.LABEL, tooltip: '网络标签 (L)', showLabel: false,
          active: this.toolMode === EditorToolMode.LABEL, onAction: () => this.setToolMode(EditorToolMode.LABEL) })
        ProteusToolButton({ iconName: ProteusIconName.POWER, tooltip: '放置 VCC (Shift+P)', showLabel: false,
          onAction: () => this.setToolMode(EditorToolMode.PLACE, 'VCC') })
        ProteusToolButton({ iconName: ProteusIconName.GROUND, tooltip: '放置 GND (Shift+G)', showLabel: false,
          onAction: () => this.setToolMode(EditorToolMode.PLACE, 'GND') })
      }

      ProteusToolGroup({ title: 'Align' }) {
        ProteusToolButton({ iconName: ProteusIconName.ALIGN_LEFT, tooltip: '左对齐', showLabel: false,
          disabled: this.selectedCount < 2, onAction: () => this.handleAlign('left') })
        ProteusToolButton({ iconName: ProteusIconName.ALIGN_RIGHT, tooltip: '右对齐', showLabel: false,
          disabled: this.selectedCount < 2, onAction: () => this.handleAlign('right') })
        ProteusToolButton({ iconName: ProteusIconName.ALIGN_TOP, tooltip: '顶对齐', showLabel: false,
          disabled: this.selectedCount < 2, onAction: () => this.handleAlign('top') })
        ProteusToolButton({ iconName: ProteusIconName.DISTRIBUTE, tooltip: '水平均布', showLabel: false,
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
        ProteusToolButton({ iconName: ProteusIconName.ROTATE, tooltip: '旋转 (R)', showLabel: false,
          disabled: this.selectedComponentId.length === 0, onAction: () => this.handleRotate() })
        ProteusToolButton({ iconName: ProteusIconName.MIRROR, tooltip: '镜像 (M)', showLabel: false,
          disabled: this.selectedComponentId.length === 0, onAction: () => this.handleMirror() })
      }

      ProteusToolGroup({ title: 'Sim' }) {
        ProteusToolButton({
          iconName: this.simRunning ? ProteusIconName.STOP : ProteusIconName.PLAY,
          tooltip: this.simRunning ? '停止仿真 (Shift+F5)' : '运行仿真 (F5)', showLabel: false,
          active: this.simRunning,
          onAction: async () => {
            if (this.simRunning) {
              this.appService.stopSimulation();
              this.simRunning = false;
              this.simPaused = false;
            } else {
              await this.startSimFromUi();
            }
          }})
        ProteusToolButton({ iconName: ProteusIconName.PAUSE, tooltip: '暂停仿真 (F6)', showLabel: false,
          disabled: !this.simRunning, onAction: () => { this.toggleSimPause(); }})
        ProteusToolButton({ iconName: ProteusIconName.ERC, tooltip: '电气规则检查 (F7)', showLabel: false, onAction: () => {
          const errors = this.appService.runErc(false);
          this.ercErrors = errors;
          const errN = errors.filter(e => e.severity === 'error' || e.severity === 'critical').length;
          this.ercCount = errors.length;
          this.navTab = 3;
          this.statusMessage = `ERC: ${errors.length} issues (${errN} errors)`;
        }})
      }

      ProteusToolGroup({ title: 'AI' }) {
        ProteusToolButton({ iconName: ProteusIconName.AI_ROUTE, tooltip: 'AI 自动布线 (F8)', showLabel: false,
          onAction: async () => {
            this.statusMessage = 'AI auto-routing...';
            const ok = await this.appService.aiAutoRoute();
            if (ok) {
              this.bumpCanvas();
              this.statusMessage = 'AI routing complete';
            }
          }})
        ProteusToolButton({ iconName: ProteusIconName.AI_LAYOUT, tooltip: 'AI 优化布局 (F9)', showLabel: false,
          onAction: async () => {
            this.statusMessage = 'AI layout optimizing...';
            const ok = await this.appService.aiOptimizePlacement();
            if (ok) {
              this.bumpCanvas();
              this.statusMessage = 'AI layout optimized';
            }
          }})
        ProteusToolButton({ iconName: ProteusIconName.AI_DIAG, tooltip: 'AI 电路诊断 (F10)', showLabel: false,
          onAction: () => {
            const errors = this.appService.runErc(true);
            this.ercErrors = errors;
            this.ercCount = errors.length;
            this.navTab = 3;
            this.statusMessage = `AI diagnosis: ${errors.length} issues`;
          }})
      }

      Blank()

      ProteusToolButton({ iconName: ProteusIconName.MORE, tooltip: '更多工具', showLabel: false,
        onAction: () => { this.statusMessage = 'All tools available in menus'; } })
    }
    .padding({ left: 4, right: 4 })
    .alignItems(VerticalAlign.Center)
    .width('100%')
    .height(ProteusDimens.TOOLBAR_HEIGHT)
    .backgroundColor(ProteusColors.TOOLBAR_BG)
    .border({ width: { bottom: 1 }, color: ProteusColors.DIVIDER })
    .key(`main_toolbar_${this.themeRefreshKey}`)
  }

  @Builder
  LeftExpandStrip() {
    Column() {
      Button({ type: ButtonType.Normal }) {
        Text('▶')
          .fontSize(14)
          .fontColor(ProteusColors.SIDEBAR_TAB_ACTIVE_TEXT)
          .fontWeight(FontWeight.Bold)
      }
      .width(28)
      .height(48)
      .backgroundColor(ProteusColors.SIDEBAR_TAB_ACTIVE_BG)
      .borderRadius(0)
      .border({
        width: { left: 1, top: 1, right: 1, bottom: 1 },
        color: ProteusColors.SIDEBAR_TAB_BORDER
      })
      .stateEffect(false)
      .onClick(() => {
        this.leftLibCollapsed = false;
        this.leftNavCollapsed = false;
        this.uiState.leftLibCollapsed = false;
        this.uiState.leftNavCollapsed = false;
      })
      Text('库')
        .fontSize(10)
        .fontColor(ProteusColors.SIDEBAR_TAB_IDLE_TEXT)
        .margin({ top: 6 })
    }
    .width(32)
    .height('100%')
    .padding({ top: 8 })
    .backgroundColor(ProteusColors.SIDEBAR_BG)
    .border({ width: { right: 1 }, color: ProteusColors.DIVIDER })
    .justifyContent(FlexAlign.Start)
    .alignItems(HorizontalAlign.Center)
  }

  @Builder
  RightExpandStrip() {
    Column() {
      Button({ type: ButtonType.Normal }) {
        Text('◀')
          .fontSize(14)
          .fontColor(ProteusColors.SIDEBAR_TAB_ACTIVE_TEXT)
          .fontWeight(FontWeight.Bold)
      }
      .width(28)
      .height(48)
      .backgroundColor(ProteusColors.SIDEBAR_TAB_ACTIVE_BG)
      .borderRadius(0)
      .border({
        width: { left: 1, top: 1, right: 1, bottom: 1 },
        color: ProteusColors.SIDEBAR_TAB_BORDER
      })
      .stateEffect(false)
      .onClick(() => {
        this.rightCollapsed = false;
        this.uiState.rightCollapsed = false;
      })
      Text('栏')
        .fontSize(10)
        .fontColor(ProteusColors.SIDEBAR_TAB_IDLE_TEXT)
        .margin({ top: 6 })
    }
    .width(32)
    .height('100%')
    .padding({ top: 8 })
    .backgroundColor(ProteusColors.SIDEBAR_BG)
    .border({ width: { left: 1 }, color: ProteusColors.DIVIDER })
    .justifyContent(FlexAlign.Start)
    .alignItems(HorizontalAlign.Center)
  }

  @Builder
  LeftPanel() {
    Column() {
      if (this.leftLibCollapsed) {
        Button({ type: ButtonType.Normal }) {
          Row({ space: 6 }) {
            Text('▶')
              .fontSize(12)
              .fontColor(ProteusColors.TEXT_PRIMARY)
              .fontWeight(FontWeight.Bold)
            Text($r('app.string.left_library'))
              .fontSize(ProteusFonts.TITLE)
              .fontColor(ProteusColors.TEXT_PRIMARY)
          }
        }
        .width('100%')
        .height(ProteusDimens.PANEL_TITLE_HEIGHT)
        .backgroundColor(ProteusColors.PANEL_TITLE_BG)
        .borderRadius(0)
        .border({ width: { bottom: 1 }, color: ProteusColors.DIVIDER })
        .stateEffect(false)
        .onClick(() => {
          this.leftLibCollapsed = false;
          this.uiState.leftLibCollapsed = false;
        })
      }

      if (!this.leftLibCollapsed) {
        Column() {
          ProteusPanelTitle({
            title: $r('app.string.left_library'),
            collapsed: false,
            onToggle: () => { this.leftLibCollapsed = true; this.uiState.leftLibCollapsed = true; }
          })
          ProteusTextInput({
            placeholder: $r('app.string.search_placeholder'),
            text: this.searchKeyword,
            onChange: (v: string) => {
              this.searchKeyword = v;
              this.refreshComponentList();
            }
          })
            .margin({ left: 4, right: 4, top: 4, bottom: 2 })
            .width('100%')

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
                }, (node: CategoryNode) => `${node.cat}_${this.libRefreshKey}_${node.label}`)
              }
            }
            .width('100%')
          }
          .layoutWeight(1)
          .width('100%')
          .scrollBar(BarState.Auto)

          ComponentPreview({ libraryId: this.previewComponentId, themeRefreshKey: this.themeRefreshKey })
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

      if (this.leftNavCollapsed) {
        Button({ type: ButtonType.Normal }) {
          Row({ space: 6 }) {
            Text('▶')
              .fontSize(12)
              .fontColor(ProteusColors.TEXT_PRIMARY)
              .fontWeight(FontWeight.Bold)
            Text($r('app.string.left_navigator'))
              .fontSize(ProteusFonts.TITLE)
              .fontColor(ProteusColors.TEXT_PRIMARY)
          }
        }
        .width('100%')
        .height(ProteusDimens.PANEL_TITLE_HEIGHT)
        .backgroundColor(ProteusColors.PANEL_TITLE_BG)
        .borderRadius(0)
        .border({ width: { top: 1 }, color: ProteusColors.DIVIDER })
        .stateEffect(false)
        .onClick(() => {
          this.leftNavCollapsed = false;
          this.uiState.leftNavCollapsed = false;
        })
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
    .key(`left_panel_${this.themeRefreshKey}`)
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
    }, (item: string) => `${item}_${this.libRefreshKey}`)
  }

  getCategoryItems(cat: ComponentCategory): string[] {
    const items = this.appService.componentLibrary.listAllByCategory(cat);
    return items.map(c => `${c.id}|${c.name}`);
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
      ProteusNavCompRow({
        refDes: `${comp.refDes}`,
        libraryId: `${comp.libraryId}`,
        selected: comp.id === this.selectedComponentId,
        onAction: () => {
          this.selectedComponentId = comp.id;
          this.appService.schematicEditor.setSelection([comp.id]);
        }
      })
    }, (comp: ComponentInstance) => `${comp.id}_${this.navRefreshKey}`)
  }

  getDocComponents(): ComponentInstance[] {
    return this.appService.schematicEditor.getDocument().components;
  }

  @Builder
  NavNetList() {
    ForEach(this.getDocNets(), (netName: string, idx: number) => {
      ProteusNavNetRow({
        label: `NET ${idx + 1}`,
        onAction: () => {}
      })
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
        ProteusErcRow({
          mark: err.severity === 'error' || err.severity === 'critical' ? '✕' : '⚠',
          markColor: err.severity === 'error' || err.severity === 'critical' ?
            ProteusColors.ERC_ERR : ProteusColors.ERC_WARN,
          desc: err.desc,
          onAction: () => {}
        })
      }, (err: ErcError, idx: number) => `${idx}_${err.desc}`)
    }
  }

  @Builder
  CanvasArea() {
    Stack({ alignContent: Alignment.BottomEnd }) {
      SchematicCanvas({
        canvasVersion: $canvasVersion,
        themeRefreshKey: this.themeRefreshKey,
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
        onDocumentChanged: () => { this.bumpCanvas(); },
        onCopySelected: () => { this.handleCopy(); },
        onDeleteSelected: () => { this.handleDeleteSelected(); }
      })
        .width('100%')
        .height('100%')

      if (this.selectedComponentId && !this.aiGenerating) {
        this.FloatingToolBar()
      }

      if (this.aiGenerating) {
        Column({ space: 10 }) {
          Text('AI 生成中')
            .fontSize(18)
            .fontColor('#FFFFFF')
            .fontWeight(FontWeight.Medium)
          Text(this.aiStage.length > 0 ? `${this.aiStage}  ${this.aiProgress}%` : `${this.aiProgress}%`)
            .fontSize(13)
            .fontColor('#E0E0E0')
          Text('画布已锁定 · 仅允许 AI 自动放置与布线')
            .fontSize(12)
            .fontColor('#BDBDBD')
          Text('详见右侧 AI 面板生成日志')
            .fontSize(11)
            .fontColor('#9E9E9E')
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
        .backgroundColor('#CC1A1A1A')
        .hitTestBehavior(HitTestMode.Default)
        .onTouch((_e: TouchEvent) => {
          // 吞掉全部触摸，禁止平移/缩放/放置
        })
      }
    }
    .layoutWeight(1)
    .height('100%')
    .border({ width: 1, color: ProteusColors.DIVIDER })
  }

  @Builder
  FloatingToolBar() {
    Row() {
      ProteusToolButton({ iconName: ProteusIconName.ROTATE, tooltip: '旋转 (R)', showLabel: false,
        onAction: () => this.handleRotate() })
      ProteusToolButton({ iconName: ProteusIconName.MIRROR, tooltip: '镜像 (M)', showLabel: false,
        onAction: () => this.handleMirror() })
      ProteusToolButton({ iconName: ProteusIconName.TRASH, tooltip: '删除 (Del)', showLabel: false,
        onAction: () => this.handleDeleteSelected() })
      ProteusToolButton({ iconName: ProteusIconName.SETTINGS, tooltip: '属性面板', showLabel: false,
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
            .key(`prop-${this.rightPanelRefreshKey}-${this.themeRefreshKey}`)
            .layoutWeight(1)
            .height('100%')
        } else if (this.activeRightTab === 4) {
          InstrumentPanel({
            statusMessage: $statusMessage,
            selectedComponentId: this.selectedComponentId,
            simWaveTick: this.simWaveTick,
            simRunning: this.simRunning
          })
            .key(`instr-${this.rightPanelRefreshKey}-${this.themeRefreshKey}`)
            .layoutWeight(1)
            .height('100%')
        } else if (this.activeRightTab === 7) {
          PlatformSettingsPanel({ statusMessage: $statusMessage, themeRefreshKey: $themeRefreshKey })
            .key(`settings-${this.rightPanelRefreshKey}-${this.themeRefreshKey}`)
            .layoutWeight(1)
            .height('100%')
            .width('100%')
        } else if (this.activeRightTab === 8) {
          InstrTraceLogPanel({ statusMessage: $statusMessage })
            .key(`trace-${this.rightPanelRefreshKey}-${this.themeRefreshKey}`)
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
                      tooltip: this.simRunning ? '停止仿真' : '运行仿真',
                      widthVal: '42%',
                      onAction: async () => {
                        if (this.simRunning) {
                          this.appService.stopSimulation();
                          this.simRunning = false;
                        } else {
                          await this.startSimFromUi();
                        }
                      }
                    })
                    ProteusClassicBtn({
                      label: $r('app.string.sim_pause'),
                      tooltip: '暂停/恢复仿真',
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
                // API 配置挂全局金库：工程切换时勿用 rightPanelRefreshKey remount，避免面板状态被刷掉
                AiSettingsPanel({
                  statusMessage: $statusMessage,
                  aiGenerating: $aiGenerating,
                  aiProgress: $aiProgress,
                  aiStage: $aiStage
                })
                  .key(`ai-settings-${this.themeRefreshKey}`)
                  .constraintSize({ minHeight: 280 })
              } else if (this.activeRightTab === 3) {
                McuDebugPanel({
                  statusMessage: $statusMessage,
                  selectedComponentId: this.selectedComponentId
                })
                  .key(`mcu-${this.rightPanelRefreshKey}`)
                  .constraintSize({ minHeight: 320 })
              } else if (this.activeRightTab === 5) {
                FaultInjectionPanel({
                  statusMessage: $statusMessage,
                  selectedComponentId: this.selectedComponentId
                })
                  .key(`fault-${this.rightPanelRefreshKey}`)
                  .constraintSize({ minHeight: 240 })
              } else if (this.activeRightTab === 6) {
                TeachingPanel({
                  statusMessage: $statusMessage,
                  selectedComponentId: this.selectedComponentId
                })
                  .key(`teach-${this.rightPanelRefreshKey}`)
                  .constraintSize({ minHeight: 240 })
              }
            }
            .width('100%')
          }
          .layoutWeight(1)
          .scrollBar(BarState.Auto)
        }

        // Vertical sidebar tab strip
        Column() {
          ProteusSidebarTab({
            label: '属性', tooltip: '属性面板', icon: ProteusIconName.SETTINGS,
            selected: this.activeRightTab === 0,
            onSelect: () => { this.setActiveRightTab(0); }
          })
          ProteusSidebarTab({
            label: '仿真', tooltip: '仿真控制', icon: ProteusIconName.PLAY,
            selected: this.activeRightTab === 1,
            onSelect: () => { this.setActiveRightTab(1); }
          })
          ProteusSidebarTab({
            label: 'AI', tooltip: 'AI 助手', icon: ProteusIconName.AI_ROUTE,
            selected: this.activeRightTab === 2,
            onSelect: () => { this.setActiveRightTab(2); }
          })
          Stack() {
            ProteusSidebarTab({
              label: '调试', tooltip: 'MCU 调试', icon: ProteusIconName.COMPONENT,
              selected: this.activeRightTab === 3,
              onSelect: () => { this.setActiveRightTab(3); }
            })
            if (this.debugTabHasBadge) {
              Text('●')
                .fontSize(7)
                .fontColor(ProteusColors.ERC_ERR)
                .position({ x: 28, y: 4 })
            }
          }
          ProteusSidebarTab({
            label: '仪器', tooltip: '虚拟仪器', icon: ProteusIconName.ZOOM_IN,
            selected: this.activeRightTab === 4,
            onSelect: () => { this.setActiveRightTab(4); }
          })
          ProteusSidebarTab({
            label: '故障', tooltip: '故障注入', icon: ProteusIconName.WARNING,
            selected: this.activeRightTab === 5,
            onSelect: () => { this.setActiveRightTab(5); }
          })
          ProteusSidebarTab({
            label: '教学', tooltip: '教学助手', icon: ProteusIconName.LABEL,
            selected: this.activeRightTab === 6,
            onSelect: () => { this.setActiveRightTab(6); }
          })
          ProteusSidebarTab({
            label: '设置', tooltip: '平台设置', icon: ProteusIconName.GRID,
            selected: this.activeRightTab === 7,
            onSelect: () => { this.setActiveRightTab(7); }
          })
          ProteusSidebarTab({
            label: '日志', tooltip: 'instr_trace 运行日志', icon: ProteusIconName.SEARCH,
            selected: this.activeRightTab === 8,
            onSelect: () => { this.setActiveRightTab(8); }
          })
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
    .key(`right_panel_${this.themeRefreshKey}`)
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
          .margin({ bottom: 4 })
        Text(`工程目录: ${this.userProjectDir}`)
          .fontSize(9)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .maxLines(2)
          .margin({ bottom: 16 })
        Row({ space: 12 }) {
          ProteusClassicBtn({
            label: '新建工程',
            widthVal: '48%',
            onAction: () => { void this.handleNewProject(); }
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
    Stack({ alignContent: Alignment.Center }) {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('#00000060')
        .onClick(() => { this.showNewProjectDialog = false; })
      Column() {
        Text('新建工程')
          .fontSize(ProteusFonts.TITLE)
          .fontColor(ProteusColors.TEXT_PRIMARY)
          .fontWeight(FontWeight.Medium)
          .margin({ bottom: 8 })
        Text('请输入工程名称（保存至 project 目录）')
          .fontSize(ProteusFonts.STATUS)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .margin({ bottom: 4 })
        Text(this.userProjectDir)
          .fontSize(9)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .maxLines(2)
          .margin({ bottom: 8 })
        ProteusTextInput({
          placeholder: 'MyProject',
          text: this.newProjectNameInput,
          onChange: (v: string) => { this.newProjectNameInput = v; },
          onSubmit: () => { this.doCreateNewProject(); }
        })
          .width('100%')
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
              void this.handleNewProject();
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
      this.appService.enableAutoSave(`${this.appService.getAutosaveDir()}/${name}.schsim`, AppService.AUTOSAVE_INTERVAL_MS);
      this.appService.schematicEditor.fitAllInView();
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
        Text('请输入 .schsim 工程文件路径（默认在应用沙箱 project 目录）')
          .fontSize(ProteusFonts.STATUS)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .margin({ bottom: 4 })
        Text(this.userProjectDir)
          .fontSize(9)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .maxLines(2)
          .margin({ bottom: 8 })
        ProteusTextInput({
          placeholder: `${this.userProjectDir}/MyProject.schsim`,
          text: this.openFilePath,
          onChange: (v: string) => { this.openFilePath = v; }
        })
          .width('100%')
        Row({ space: 8 }) {
          ProteusClassicBtn({
            label: '取消',
            widthVal: '32%',
            onAction: () => { this.showOpenDialog = false; }
          })
          ProteusClassicBtn({
            label: '浏览',
            widthVal: '32%',
            onAction: () => { void this.handleOpenFromPicker(); }
          })
          ProteusClassicBtn({
            label: '打开',
            widthVal: '32%',
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
        Text('请输入保存路径（默认在应用沙箱 project 目录）')
          .fontSize(ProteusFonts.STATUS)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .margin({ bottom: 4 })
        Text(this.userProjectDir)
          .fontSize(9)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .maxLines(2)
          .margin({ bottom: 8 })
        ProteusTextInput({
          placeholder: `${this.userProjectDir}/${this.projectName}.schsim`,
          text: this.saveAsPath,
          onChange: (v: string) => { this.saveAsPath = v; }
        })
          .width('100%')
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
          ProteusTextInput({
            placeholder: '/path/to/firmware.hex',
            text: this.burnFilePath,
            onChange: (v: string) => { this.burnFilePath = v; }
          })
            .layoutWeight(1)
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
          ProteusTextInput({
            text: this.burnEntryPoint,
            placeholder: '0x0000',
            mono: true,
            onChange: (v: string) => { this.burnEntryPoint = v; }
          })
            .layoutWeight(1)
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
              void this.appService.flushProjectProtection(true);
            }
          })
          ProteusClassicBtn({
            label: '保存',
            widthVal: '30%',
            onAction: () => {
              this.showExitConfirmDialog = false;
              void this.handleSaveProject().then(() => {
                if (!this.unsavedChanges) {
                  void this.appService.flushProjectProtection(true);
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
      .borderRadius(8)
      .shadow({ radius: 8, color: '#00000040' })
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .backgroundColor('#00000060')
  }

  /** 仿真启动失败提示 */
  @Builder
  SimFailDialog() {
    Stack({ alignContent: Alignment.Center }) {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('#00000060')
        .onClick(() => { this.showSimFailDialog = false; })
      Column() {
        Text('无法启动仿真')
          .fontSize(ProteusFonts.TITLE)
          .fontColor(ProteusColors.ERC_WARN)
          .fontWeight(FontWeight.Medium)
          .margin({ bottom: 8 })
        Text(this.simFailMessage)
          .fontSize(ProteusFonts.STATUS)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .margin({ bottom: 16 })
        Row() {
          ProteusClassicBtn({
            label: '确定',
            widthVal: '40%',
            onAction: () => { this.showSimFailDialog = false; }
          })
        }
        .width('100%')
        .justifyContent(FlexAlign.Center)
        .margin({ top: 8 })
      }
      .width(400)
      .padding(24)
      .backgroundColor(ProteusColors.CANVAS_BG)
      .border({ width: 1, color: ProteusColors.DIVIDER })
      .borderRadius(8)
      .shadow({ radius: 8, color: '#00000040' })
    }
    .width('100%')
    .height('100%')
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
    .key(`status_bar_${this.themeRefreshKey}`)
  }
}
