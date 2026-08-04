/**
 * PCB Layout 编辑器页面 — KiCad Pcbnew 风格
 */
import { AppService } from '../services/AppService';
import { PcbCanvas } from '../components/PcbCanvas';
import { PcbLayerPanel, PcbLayerRow } from '../components/pcb/PcbLayerPanel';
import { PcbVerticalToolbar } from '../components/pcb/PcbVerticalToolbar';
import { PcbRightPanel } from '../components/pcb/PcbRightPanel';
import { PcbStatusBar } from '../components/pcb/PcbStatusBar';
import {
  ProteusResizer, ProteusMenuTrigger, ProteusMenuEntry,
  ProteusToolButton, ProteusToolGroup
} from '../components/proteus/ProteusWidgets';
import { ProteusIcon, ProteusIconName } from '../components/proteus/ProteusIcons';
import { ProteusColors, ProteusDimens, ProteusFonts } from '../theme/ProteusTheme';
import { PROTEUS_THEME_REV_KEY } from '../theme/ThemeManager';
import {
  PcbLayerId, PcbDrcViolation, EventBus, ModuleEvent, ModuleEventPayload,
  PcbEditorSelectionData, exportPcbGerber, exportPcbKiCad,
  createEmptyPcbDocument, normalizePcbDocument, isCopperLayer,
  PcbAppearanceMode, Pcb3dDisplayMode, PcbViaKind, PcbRouteCornerMode, PcbStackLayer, copperLayersFromStack,
  tracePcbUi, tracePcbOp, tracePcb3d, tracePcbDisplayDump, PcbCanvasTraceSnapshot,
  PcbView2dTraceParams, PcbView3dTraceParams
} from 'common';
import { PcbEditorImpl, PcbToolMode } from 'pcb_editor';
import { SchematicEditorImpl } from 'schematic_editor';
import { BusinessError } from '@kit.BasicServicesKit';
import { common } from '@kit.AbilityKit';
import { picker, fileUri } from '@kit.CoreFileKit';
import fs from '@ohos.file.fs';
import { util } from '@kit.ArkTS';
import { maximizeAppWindow } from '../utils/WindowLaunchUtil';
import { ProjectPaths } from '../utils/ProjectPaths';
import { exportPcbSimpleStep } from '../utils/Pcb3dSceneUtil';
import { Pcb3dRenderer } from '../utils/Pcb3dRenderer';
import { importStepAndBind } from '../utils/PcbStepImporter';

interface PcbLaunchParams {
  launchMode?: string;
  projectPath?: string;
  projectName?: string;
  /** 进入后从当前原理图前向标注并保存为 .pcbsim */
  importFromSchematic?: boolean;
  /** 由原理图页跳转而来：返回按钮回到原理图而非首页 */
  fromSchematic?: boolean;
}

@Entry
@Component
struct PcbPage {
  @StorageProp(PROTEUS_THEME_REV_KEY) themeRev: number = 0;
  @State projectName: string = 'Untitled';
  @State statusMessage: string = '';
  @State canvasVersion: number = 0;
  @State gerberDocRev: number = 0;
  @State aiBusy: boolean = false;
  @State aiProgress: number = 0;
  @State aiStage: string = '';
  @State aiTabFocusTick: number = 0;
  @State selectedFootprintId: string = '';
  @State selectedTrackId: string = '';
  @State selectedViaId: string = '';
  @State selectedZoneId: string = '';
  @State selectedZoneCount: number = 0;
  @State selectedFootprintInfo: string = '';
  @State mouseX: number = 0;
  @State mouseY: number = 0;
  @State worldMouseX: number = 0;
  @State worldMouseY: number = 0;
  @State zoomPercent: number = 15;
  @State toolMode: PcbToolMode = PcbToolMode.SELECT;
  @State gridVisible: boolean = true;
  @State leftPanelWidth: number = 180;
  @State rightPanelWidth: number = 300;
  @State drcViolations: PcbDrcViolation[] = [];
  @State layerRows: PcbLayerRow[] = [];
  @State appInitialized: boolean = false;
  @State unsavedChanges: boolean = false;
  @State routeResetKey: number = 0;
  @State activeLayer: PcbLayerId = PcbLayerId.F_CU;
  @State hoverNetName: string = '';
  @State selectedFpDefId: string = '';
  @State copperCount: number = 2;
  @State stackLayers: PcbStackLayer[] = [];
  @State viaKind: PcbViaKind = PcbViaKind.THROUGH;
  @State routeCornerMode: PcbRouteCornerMode = PcbRouteCornerMode.ORTHO45;
  @State viaFrom: PcbLayerId = PcbLayerId.F_CU;
  @State viaTo: PcbLayerId = PcbLayerId.B_CU;
  @State copperLayerIds: PcbLayerId[] = [PcbLayerId.F_CU, PcbLayerId.B_CU];
  /** 2D/3D 点选铜对象后递增，驱动层栈页切换并高亮 Cu */
  @State stackFocusTick: number = 0;
  /** 层栈中应高亮的铜层（过孔可多选跨越层） */
  @State stackHighlightCopperIds: PcbLayerId[] = [];
  /** 由原理图跳转进入：Home/返回 回到原理图 */
  @State fromSchematic: boolean = false;
  /** bit0=Ctrl, bit1=Shift — 页面级快捷键 */
  private pageModifierKeys: number = 0;
  private userProjectDir: string = '';
  private prevAiGeneratingChanged: ((busy: boolean) => void) | null = null;

  private appService: AppService = AppService.getInstance();

  aboutToAppear(): void {
    EventBus.getInstance().subscribe(ModuleEvent.PCB_CHANGED, this.onPcbChanged);
    EventBus.getInstance().subscribe(ModuleEvent.VIEWPORT_CHANGED, this.onViewportChanged);
    EventBus.getInstance().subscribe(ModuleEvent.SELECTION_CHANGED, this.onSelectionChanged);
    // 链式挂钩：PCB AI 布线时同步 aiBusy，并保留原回调（如原理图页）
    this.prevAiGeneratingChanged = this.appService.onAiGeneratingChanged;
    this.appService.onAiGeneratingChanged = (busy: boolean): void => {
      this.aiBusy = busy;
      if (busy) {
        this.toolMode = PcbToolMode.SELECT;
        this.statusMessage = 'PCB AI 布线中，画布已锁定';
      }
      if (this.prevAiGeneratingChanged) {
        this.prevAiGeneratingChanged(busy);
      }
    };
    this.aiBusy = this.appService.isAiGenerating();
    void this.initPage();
  }

  aboutToDisappear(): void {
    this.syncPcbToProject();
    if (this.prevAiGeneratingChanged !== null) {
      this.appService.onAiGeneratingChanged = this.prevAiGeneratingChanged;
      this.prevAiGeneratingChanged = null;
    }
    EventBus.getInstance().unsubscribe(ModuleEvent.PCB_CHANGED, this.onPcbChanged);
    EventBus.getInstance().unsubscribe(ModuleEvent.VIEWPORT_CHANGED, this.onViewportChanged);
    EventBus.getInstance().unsubscribe(ModuleEvent.SELECTION_CHANGED, this.onSelectionChanged);
  }

  private onSelectionChanged = (payload: ModuleEventPayload): void => {
    if (payload.source !== 'pcb_editor') {
      return;
    }
    if (Array.isArray(payload.data)) {
      const ids = payload.data as string[];
      this.selectedFootprintId = ids.length > 0 ? ids[0] : '';
      this.selectedTrackId = '';
      this.selectedViaId = '';
      this.selectedZoneId = '';
      this.selectedZoneCount = 0;
    } else {
      const sel = payload.data as PcbEditorSelectionData;
      if (sel.footprintIds !== undefined && sel.trackIds !== undefined) {
        this.selectedFootprintId = sel.footprintIds.length > 0 ? sel.footprintIds[0] : '';
        this.selectedTrackId = sel.trackIds.length > 0 ? sel.trackIds[0] : '';
        this.selectedViaId = sel.viaIds !== undefined && sel.viaIds.length > 0 ? sel.viaIds[0] : '';
        this.selectedZoneId = sel.zoneIds !== undefined && sel.zoneIds.length > 0 ? sel.zoneIds[0] : '';
        this.selectedZoneCount = sel.zoneIds !== undefined ? sel.zoneIds.length : 0;
      } else {
        this.selectedFootprintId = '';
        this.selectedTrackId = '';
        this.selectedViaId = '';
        this.selectedZoneId = '';
        this.selectedZoneCount = 0;
      }
    }
    // 点选铜对象：同步活动铜层 + 打开层栈并高亮对应 Cu（过孔高亮全部跨越层）
    this.syncActiveLayerFromEditor();
    this.refreshStackHighlightFromSelection();
    const copperPick = this.selectedTrackId.length > 0 || this.selectedViaId.length > 0 ||
      this.selectedZoneId.length > 0;
    if (copperPick) {
      this.stackFocusTick++;
    }
    this.refreshSelectedInfo();
    this.canvasVersion++;
  };

  private onPcbChanged = (_p: ModuleEventPayload): void => {
    this.unsavedChanges = true;
    this.refreshLayers();
  };

  private onViewportChanged = (_p: ModuleEventPayload): void => {
    this.zoomPercent = Math.round(this.getEditor().getViewport().zoom * 100);
  };

  private getEditor(): PcbEditorImpl {
    return this.appService.pcbEditor as PcbEditorImpl;
  }

  private async initPage(): Promise<void> {
    const ctx = this.getUIContext().getHostContext() as common.UIAbilityContext;
    this.appService.initPlatform(ctx);
    this.userProjectDir = this.appService.getUserProjectDir();
    await maximizeAppWindow(ctx);

    let params: Record<string, Object> = {};
    try {
      params = this.getUIContext().getRouter().getParams() as Record<string, Object>;
    } catch (_e) { /* no params */ }

    const mode = params['launchMode'] as string | undefined;
    const importFromSchematic = params['importFromSchematic'] === true;
    // 导出 PCB / 原理图跳转均标记为可返回原理图
    this.fromSchematic = params['fromSchematic'] === true || importFromSchematic;
    if (mode === 'resume') {
      if (this.appService.currentProject !== null) {
        this.projectName = this.appService.currentProject.name;
        this.ensurePcbDocument();
        this.appInitialized = true;
        this.refreshLayers();
        this.syncActiveLayerFromEditor();
        this.syncStackUiFromEditor();
        if (importFromSchematic) {
          await this.updateFromSchematicAndSave();
        }
        setTimeout(() => {
          this.getEditor().fitBoardInView();
          this.zoomPercent = Math.round(this.getEditor().getViewport().zoom * 100);
          this.canvasVersion++;
        }, 200);
        return;
      }
    } else if (mode === 'open') {
      const path = params['projectPath'] as string | undefined;
      if (path) {
        await this.appService.loadProject(path);
        this.projectName = this.appService.currentProject?.name ?? 'Untitled';
      }
    } else if (mode === 'new') {
      const rawName = params['projectName'] as string | undefined;
      const name = (rawName !== undefined && rawName.trim().length > 0)
        ? rawName.trim().replace(/[\\/:*?"<>|]/g, '_')
        : 'Untitled';
      this.appService.newProject(name.length > 0 ? name : 'Untitled');
      this.projectName = this.appService.currentProject?.name ?? name;
      this.ensurePcbDocument();
      const path = ProjectPaths.defaultUserPcbProject(this.appService.getAppBaseDir(), this.projectName);
      try {
        fs.accessSync(this.userProjectDir);
      } catch (_e) {
        try { fs.mkdirSync(this.userProjectDir, true); } catch (_e2) { /* best-effort */ }
      }
      const saved = await this.appService.saveProject(path, true);
      this.statusMessage = saved ? `已创建: ${path}` : `创建失败，请检查工程目录: ${this.userProjectDir}`;
    } else if (mode === 'scratch' || mode === 'blank') {
      const name = (params['projectName'] as string) ?? 'Untitled';
      this.appService.newProject(name);
      this.projectName = name;
    } else if (this.appService.currentProject === null) {
      this.appService.newProject('Untitled');
    }

    this.ensurePcbDocument();
    this.appInitialized = true;
    this.refreshLayers();
    this.syncActiveLayerFromEditor();
    this.syncStackUiFromEditor();
    if (importFromSchematic) {
      await this.updateFromSchematicAndSave();
    }
    setTimeout(() => {
      this.getEditor().fitBoardInView();
      this.zoomPercent = Math.round(this.getEditor().getViewport().zoom * 100);
      this.canvasVersion++;
    }, 200);
  }

  private syncPcbToProject(): void {
    const doc = this.getEditor().getDocument();
    if (this.appService.currentProject && doc) {
      this.appService.currentProject.pcb = doc;
      this.gerberDocRev++;
      tracePcbOp('SYNC_TO_PROJECT',
        `fp=${doc.footprints.length} trk=${doc.tracks.length} via=${doc.vias.length} zone=${doc.zones.length}`);
    }
  }

  private ensurePcbDocument(): void {
    const proj = this.appService.currentProject;
    if (!proj) return;
    if (!proj.pcb) {
      proj.pcb = createEmptyPcbDocument(proj.name);
    }
    normalizePcbDocument(proj.pcb);
    this.getEditor().loadDocument(proj.pcb);
    Pcb3dRenderer.invalidateMeshCache();
    this.getEditor().setSchematicProvider(() => this.appService.schematicEditor.getDocument());
  }

  private refreshSelectedInfo(): void {
    const doc = this.getEditor().getDocument();
    if (!doc) {
      this.selectedFootprintInfo = '';
      return;
    }
    const sel = this.getEditor().getSelection();
    const fpCount = sel.footprintIds.length;
    const trkCount = sel.trackIds.length;
    const viaCount = sel.viaIds.length;
    const zoneCount = sel.zoneIds.length;
    const total = fpCount + trkCount + viaCount + zoneCount;
    this.selectedZoneCount = zoneCount;

    if (total === 0) {
      this.selectedFootprintInfo = '';
      return;
    }

    if (total > 1) {
      const parts: string[] = [];
      if (fpCount > 0) parts.push(`${fpCount} 封装`);
      if (trkCount > 0) parts.push(`${trkCount} 走线`);
      if (viaCount > 0) parts.push(`${viaCount} 过孔`);
      if (zoneCount > 0) parts.push(`${zoneCount} 覆铜`);
      this.selectedFootprintInfo = `多选 (${total})\n${parts.join(', ')}`;
      return;
    }

    if (trkCount === 1) {
      for (const trk of doc.tracks) {
        if (trk.id === sel.trackIds[0]) {
          this.selectedFootprintInfo =
            `走线 ${trk.netName || '?'}\n铜层 ${trk.layer}  ${trk.width.toFixed(1)} mil`;
          return;
        }
      }
    }
    if (viaCount === 1) {
      for (const via of doc.vias) {
        if (via.id === sel.viaIds[0]) {
          const span = via.layers.length > 0 ? via.layers.join('↔') : '?';
          this.selectedFootprintInfo =
            `过孔 ${via.netName || '?'}\nØ${via.diameter.toFixed(0)} mil\n铜层 ${span}`;
          return;
        }
      }
    }
    if (zoneCount === 1) {
      for (const zone of doc.zones) {
        if (zone.id === sel.zoneIds[0]) {
          this.selectedFootprintInfo =
            `覆铜 ${zone.netName}\n优先级 ${zone.priority}  热焊盘:${zone.thermalRelief ? '开' : '关'}\n铜层 ${zone.layer}`;
          return;
        }
      }
    }
    if (fpCount === 1) {
      for (const fp of doc.footprints) {
        if (fp.id === sel.footprintIds[0]) {
          this.selectedFootprintInfo = `${fp.refDes}  ${fp.value}\n${fp.defId}`;
          return;
        }
      }
    }
    this.selectedFootprintInfo = '';
  }

  private deleteSelected(): void {
    if (this.appService.isAiGenerating()) {
      this.statusMessage = 'PCB AI 布线中，画布已锁定';
      return;
    }
    const sel = this.getEditor().getSelection();
    tracePcbOp('DELETE',
      `fp=${sel.footprintIds.length} trk=${sel.trackIds.length} via=${sel.viaIds.length} zone=${sel.zoneIds.length}`);
    this.getEditor().deleteSelected();
    this.selectedFootprintId = '';
    this.selectedTrackId = '';
    this.selectedViaId = '';
    this.selectedZoneId = '';
    this.selectedZoneCount = 0;
    this.selectedFootprintInfo = '';
    this.syncPcbToProject();
    this.canvasVersion++;
  }

  private runAutoRoute(): void {
    if (this.appService.isAiGenerating()) {
      this.statusMessage = 'PCB AI 布线中，画布已锁定';
      return;
    }
    tracePcbUi('AUTO_ROUTE', 'start');
    const result = this.getEditor().runAutoRoute();
    if (result.success && result.data !== undefined) {
      this.syncPcbToProject();
      this.canvasVersion++;
      const d = result.data;
      const hint = d.messages.length > 0 ? d.messages[0] : '';
      this.statusMessage = `自动布线: ${d.netCount} 网络, ${d.trackCount} 段走线${hint.length > 0 ? ' — ' + hint : ''}`;
      this.unsavedChanges = true;
      tracePcbOp('AUTO_ROUTE', `ok nets=${d.netCount} tracks=${d.trackCount}`);
    } else {
      this.statusMessage = result.error ?? '自动布线失败';
      tracePcbOp('AUTO_ROUTE', `fail ${result.error ?? 'unknown'}`);
    }
  }

  /** 打开右侧「AI布线」页签（与原理图 AI 助手同风格；运行在面板内） */
  private openAiRouteTab(): void {
    this.aiTabFocusTick++;
    this.statusMessage = 'AI 布线面板已打开 — 可配置 API 并开始布线';
    tracePcbUi('AI_PCB_TAB', 'open');
  }

  /** 兼容 F9 / 工具栏：切到 AI 页签（布线动作在面板内点「开始 AI 布线」） */
  private async runAiAutoRoute(): Promise<void> {
    this.openAiRouteTab();
  }

  private adjustSelectedZonePriority(delta: number): void {
    const ids = this.getEditor().getSelectedZoneIds();
    if (ids.length === 0) {
      return;
    }
    let ok = false;
    for (const id of ids) {
      if (this.getEditor().adjustZonePriority(id, delta)) {
        ok = true;
      }
    }
    if (ok) {
      this.syncPcbToProject();
      this.refreshSelectedInfo();
      this.canvasVersion++;
      this.unsavedChanges = true;
    }
  }

  private toggleSelectedZoneThermal(): void {
    const ids = this.getEditor().getSelectedZoneIds();
    if (ids.length === 0) {
      return;
    }
    const doc = this.getEditor().getDocument();
    if (!doc) {
      return;
    }
    let ok = false;
    for (const id of ids) {
      for (const zone of doc.zones) {
        if (zone.id === id) {
          if (this.getEditor().setZoneThermalRelief(id, !zone.thermalRelief)) {
            ok = true;
          }
          break;
        }
      }
    }
    if (ok) {
      this.syncPcbToProject();
      this.refreshSelectedInfo();
      this.canvasVersion++;
      this.unsavedChanges = true;
    }
  }

  private refreshSelectedZoneCutouts(): void {
    const ids = this.getEditor().getSelectedZoneIds();
    if (ids.length === 0) {
      return;
    }
    let ok = false;
    for (const id of ids) {
      if (this.getEditor().refreshZoneCutouts(id)) {
        ok = true;
      }
    }
    if (ok) {
      this.syncPcbToProject();
      this.canvasVersion++;
      this.statusMessage = '已刷新覆铜挖空';
      this.unsavedChanges = true;
    }
  }

  private syncActiveLayerFromEditor(): void {
    this.activeLayer = this.getEditor().getActiveLayer();
  }

  /** 根据当前点选计算层栈应高亮的铜层列表（过孔 = 跨越的全部铜层） */
  private refreshStackHighlightFromSelection(): void {
    const doc = this.getEditor().getDocument();
    const ids: PcbLayerId[] = [];
    if (!doc) {
      this.stackHighlightCopperIds = ids;
      return;
    }
    if (this.selectedTrackId.length > 0) {
      for (let i = 0; i < doc.tracks.length; i++) {
        const t = doc.tracks[i];
        if (t.id === this.selectedTrackId && isCopperLayer(t.layer)) {
          ids.push(t.layer);
          break;
        }
      }
    } else if (this.selectedZoneId.length > 0) {
      for (let i = 0; i < doc.zones.length; i++) {
        const z = doc.zones[i];
        if (z.id === this.selectedZoneId && isCopperLayer(z.layer)) {
          ids.push(z.layer);
          break;
        }
      }
    } else if (this.selectedViaId.length > 0) {
      for (let i = 0; i < doc.vias.length; i++) {
        const v = doc.vias[i];
        if (v.id !== this.selectedViaId) {
          continue;
        }
        // 按层栈顺序展开：通孔 F↔B 会覆盖中间全部铜层；盲/埋孔只覆盖端点之间
        const order = copperLayersFromStack(doc.layerStack);
        let minIdx = order.length;
        let maxIdx = -1;
        for (let li = 0; li < v.layers.length; li++) {
          const idx = order.indexOf(v.layers[li]);
          if (idx >= 0) {
            minIdx = Math.min(minIdx, idx);
            maxIdx = Math.max(maxIdx, idx);
          }
        }
        if (maxIdx >= minIdx) {
          for (let oi = minIdx; oi <= maxIdx; oi++) {
            ids.push(order[oi]);
          }
        } else {
          for (let li = 0; li < v.layers.length; li++) {
            const ly = v.layers[li];
            if (isCopperLayer(ly) && ids.indexOf(ly) < 0) {
              ids.push(ly);
            }
          }
        }
        break;
      }
    }
    this.stackHighlightCopperIds = ids;
  }

  private syncStackUiFromEditor(): void {
    const doc = this.getEditor().getDocument();
    this.copperCount = this.getEditor().getLayerStackCopperCount();
    this.stackLayers = doc ? [...doc.layerStack.layers] : [];
    this.copperLayerIds = doc ? copperLayersFromStack(doc.layerStack) : [PcbLayerId.F_CU, PcbLayerId.B_CU];
    this.viaKind = this.getEditor().getViaKind();
    this.routeCornerMode = this.getEditor().getRouteCornerMode();
    const span = this.getEditor().getViaSpan();
    this.viaFrom = span[0];
    this.viaTo = span[1];
  }

  /**
   * 点层名（方案 A）：
   * - 铜层 → 淡化其他铜（仍可见）
   * - 丝印 → 加亮丝印，不藏铜
   * - Mask/Paste/Edge → 只改活动层，3D 不藏铜
   * - 「单层」预设才 ACTIVE_ONLY
   */
  private setActiveLayerUi(id: PcbLayerId, focusSolo: boolean = false): void {
    const editor = this.getEditor();
    const doc = editor.getDocument();
    editor.setActiveLayer(id);
    this.activeLayer = id;
    if (focusSolo && isCopperLayer(id)) {
      if (doc) {
        for (let i = 0; i < doc.layers.length; i++) {
          if (isCopperLayer(doc.layers[i].id)) {
            editor.setLayerVisible(doc.layers[i].id, true);
          }
        }
      }
      editor.setAppearanceMode(PcbAppearanceMode.DIM_INACTIVE);
      // 内电层常为整面铺铜、无走线：自动选中该层覆铜，避免「点了层却看不到线高亮」
      let trackN = 0;
      let zoneId = '';
      let zoneNet = '';
      if (doc) {
        for (let ti = 0; ti < doc.tracks.length; ti++) {
          if (doc.tracks[ti].layer === id) {
            trackN++;
          }
        }
        for (let zi = 0; zi < doc.zones.length; zi++) {
          if (doc.zones[zi].layer === id) {
            zoneId = doc.zones[zi].id;
            zoneNet = doc.zones[zi].netName;
            break;
          }
        }
      }
      if (trackN === 0 && zoneId.length > 0) {
        editor.selectZone(zoneId);
        this.selectedTrackId = '';
        this.selectedViaId = '';
        this.selectedFootprintId = '';
        this.selectedZoneId = zoneId;
        this.selectedZoneCount = 1;
        this.refreshStackHighlightFromSelection();
        this.refreshSelectedInfo();
        this.statusMessage =
          `活动铜 ${id}：内电层铺铜（无走线）· 已选中覆铜 ${zoneNet.length > 0 ? zoneNet : zoneId}`;
      } else if (trackN === 0) {
        this.statusMessage = `活动铜 ${id}：该层无走线/覆铜`;
      } else {
        this.statusMessage = `活动铜 ${id}（${trackN} 段走线）·「单层」可只留一层`;
      }
      this.refreshLayers();
    } else if (focusSolo && (id === PcbLayerId.F_SILKS || id === PcbLayerId.B_SILKS)) {
      // 丝印聚焦：保持 OVERLAY/DIM，绝不 ACTIVE_ONLY 藏铜
      if (editor.getAppearance().mode === PcbAppearanceMode.ACTIVE_ONLY) {
        editor.setAppearanceMode(PcbAppearanceMode.OVERLAY);
      }
      this.statusMessage = `丝印 ${id}（铜仍可见，丝印加亮）`;
      this.refreshLayers();
    } else if (focusSolo) {
      if (editor.getAppearance().mode === PcbAppearanceMode.ACTIVE_ONLY) {
        editor.setAppearanceMode(PcbAppearanceMode.OVERLAY);
      }
      this.statusMessage = `活动层: ${id}`;
      this.refreshLayers();
    } else {
      this.statusMessage = `活动层: ${id}`;
    }
    this.canvasVersion++;
  }

  /** 图层快速预设：顶层 / 底层 / 单层 / 全部 */
  private applyLayerPreset(preset: string): void {
    const editor = this.getEditor();
    const doc = editor.getDocument();
    if (!doc) return;
    if (preset === 'solo') {
      let active = editor.getActiveLayer();
      if (!isCopperLayer(active)) {
        active = PcbLayerId.F_CU;
        editor.setActiveLayer(active);
        this.activeLayer = active;
      }
      for (const l of doc.layers) {
        if (isCopperLayer(l.id)) {
          editor.setLayerVisible(l.id, true);
        }
      }
      editor.setAppearanceMode(PcbAppearanceMode.ACTIVE_ONLY);
      this.statusMessage = `单层铜：仅 ${active}`;
    } else if (preset === 'all') {
      editor.setSoloCopperLayer(false);
      for (const l of doc.layers) {
        editor.setLayerVisible(l.id, true);
        if (isCopperLayer(l.id)) {
          editor.setLayerOpacity(l.id, l.id === PcbLayerId.F_CU || l.id === PcbLayerId.B_CU ? 0.92 : 0.82);
        }
      }
      editor.setAppearanceMode(PcbAppearanceMode.OVERLAY);
      this.statusMessage = '全层';
    } else if (preset === 'top') {
      editor.setSoloCopperLayer(false);
      for (const l of doc.layers) {
        if (isCopperLayer(l.id)) {
          editor.setLayerVisible(l.id, true);
          editor.setLayerOpacity(l.id, l.id === PcbLayerId.F_CU ? 0.95 : 0.35);
        } else if (l.id === PcbLayerId.B_SILKS || l.id === PcbLayerId.B_MASK ||
          l.id === PcbLayerId.B_PASTE) {
          editor.setLayerVisible(l.id, false);
        } else {
          editor.setLayerVisible(l.id, true);
        }
      }
      editor.setActiveLayer(PcbLayerId.F_CU);
      this.activeLayer = PcbLayerId.F_CU;
      editor.setAppearanceMode(PcbAppearanceMode.DIM_INACTIVE);
      this.statusMessage = '顶层';
    } else if (preset === 'bottom') {
      editor.setSoloCopperLayer(false);
      for (const l of doc.layers) {
        if (isCopperLayer(l.id)) {
          editor.setLayerVisible(l.id, true);
          editor.setLayerOpacity(l.id, l.id === PcbLayerId.B_CU ? 0.95 : 0.28);
        } else if (l.id === PcbLayerId.F_SILKS || l.id === PcbLayerId.F_MASK ||
          l.id === PcbLayerId.F_PASTE) {
          editor.setLayerVisible(l.id, false);
        } else {
          editor.setLayerVisible(l.id, true);
        }
      }
      editor.setLayerVisible(PcbLayerId.B_SILKS, true);
      editor.setActiveLayer(PcbLayerId.B_CU);
      this.activeLayer = PcbLayerId.B_CU;
      editor.setAppearanceMode(PcbAppearanceMode.DIM_INACTIVE);
      this.statusMessage = '底层';
    }
    this.refreshLayers();
    this.canvasVersion++;
  }

  private ercGatePassed(): boolean {
    const errors = this.appService.runErc(false);
    let errN = 0;
    for (const e of errors) {
      if (e.severity === 'error' || e.severity === 'critical') {
        errN++;
      }
    }
    if (errN > 0) {
      this.statusMessage = `ERC 未通过: ${errN} 个错误，请先修复原理图再更新 PCB`;
      return false;
    }
    return true;
  }

  private async saveTextViaPicker(content: string, defaultName: string,
    suffixChoices: string[]): Promise<void> {
    try {
      const options = new picker.DocumentSaveOptions();
      options.newFileNames = [defaultName];
      options.fileSuffixChoices = suffixChoices;
      const ctx = this.getUIContext().getHostContext() as common.UIAbilityContext;
      const docPicker = new picker.DocumentViewPicker(ctx);
      const uris = await docPicker.save(options);
      if (!uris || uris.length === 0) {
        return;
      }
      const fh = fs.openSync(uris[0], fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
      fs.writeSync(fh.fd, content);
      fs.closeSync(fh);
      this.statusMessage = `已导出: ${defaultName}`;
    } catch (_e) {
      this.statusMessage = '导出失败';
    }
  }

  private async exportPcb(): Promise<void> {
    const doc = this.getEditor().getDocument();
    if (!doc) {
      this.statusMessage = '无 PCB 文档';
      return;
    }
    const result = exportPcbKiCad(doc);
    await this.saveTextViaPicker(result.content, result.fileName, ['PCB|.kicad_pcb', 'Text|.txt']);
  }

  private async exportGerber(): Promise<void> {
    const doc = this.getEditor().getDocument();
    if (!doc) {
      this.statusMessage = '无 PCB 文档';
      return;
    }
    const bundle = exportPcbGerber(doc);
    let combined = '';
    for (const f of bundle.files) {
      combined += `G04 === ${f.fileName} ===*\n${f.content}\n`;
    }
    const safeName = doc.name.replace(/[^\w\-]/g, '_');
    await this.saveTextViaPicker(combined, `${safeName}_gerber.gbr`, ['Gerber|.gbr', 'Text|.txt']);
  }

  private async export3dStep(): Promise<void> {
    const doc = this.getEditor().getDocument();
    if (!doc) {
      this.statusMessage = '无 PCB 文档';
      return;
    }
    const content = exportPcbSimpleStep(doc);
    const safeName = doc.name.replace(/[^\w\-]/g, '_');
    await this.saveTextViaPicker(content, `${safeName}_3d.step`, ['STEP|.step', 'Text|.txt']);
  }

  private async export3dInterference(): Promise<void> {
    const doc = this.getEditor().getDocument();
    if (!doc) {
      this.statusMessage = '无 PCB 文档';
      return;
    }
    const hits = Pcb3dRenderer.listInterference(doc);
    let content = `ElecDraw 3D Interference Report\nboard=${doc.name}\ncount=${hits.length}\n\n`;
    if (hits.length === 0) {
      content += 'OK: no footprint AABB overlaps.\n';
    } else {
      for (let i = 0; i < hits.length; i++) {
        content += `${hits[i].aRef} <-> ${hits[i].bRef}  overlap≈${hits[i].overlapMil.toFixed(1)} mil\n`;
      }
    }
    const safeName = doc.name.replace(/[^\w\-]/g, '_');
    await this.saveTextViaPicker(content, `${safeName}_interference.txt`, ['Text|.txt']);
    this.getEditor().setView3dShowInterference(true);
    this.canvasVersion++;
    this.statusMessage = hits.length === 0 ? '无干涉' : `发现 ${hits.length} 处干涉（已在 3D 标红）`;
  }

  private async importStepForSelection(): Promise<void> {
    const sel = this.getEditor().getSelection();
    if (sel.footprintIds.length === 0) {
      this.statusMessage = '请先选中一个封装，再导入 STEP';
      return;
    }
    const doc = this.getEditor().getDocument();
    if (!doc) return;
    let defId = '';
    for (let i = 0; i < doc.footprints.length; i++) {
      if (doc.footprints[i].id === sel.footprintIds[0]) {
        defId = doc.footprints[i].defId;
        break;
      }
    }
    if (defId.length === 0) {
      this.statusMessage = '无法解析封装定义';
      return;
    }
    try {
      const options = new picker.DocumentSelectOptions();
      options.maxSelectNumber = 1;
      options.fileSuffixFilters = ['.step', '.stp', '.txt'];
      const ctx = this.getUIContext().getHostContext() as common.UIAbilityContext;
      const docPicker = new picker.DocumentViewPicker(ctx);
      const uris = await docPicker.select(options);
      if (!uris || uris.length === 0) return;
      const fh = fs.openSync(uris[0], fs.OpenMode.READ_ONLY);
      const stat = fs.statSync(fh.fd);
      if (stat.size <= 0 || stat.size > 48 * 1024 * 1024) {
        fs.closeSync(fh);
        this.statusMessage = 'STEP 文件过大或为空（上限 48MB）';
        return;
      }
      const buf = new ArrayBuffer(stat.size);
      fs.readSync(fh.fd, buf);
      fs.closeSync(fh);
      const bytes = new Uint8Array(buf);
      const decoder = util.TextDecoder.create('utf-8', { ignoreBOM: true });
      const content = decoder.decodeWithStream(bytes);
      if (content.length < 32 ||
        (content.indexOf('ISO-10303') < 0 && content.indexOf('CARTESIAN_POINT') < 0)) {
        this.statusMessage = '不是有效的 STEP 文本';
        return;
      }
      const meshId = `step_${defId}_${Date.now()}`;
      const result = importStepAndBind(content, meshId, defId);
      Pcb3dRenderer.invalidateMeshCache();
      this.getEditor().setView3dPbr(true);
      this.getEditor().setView3dDisplayMode(Pcb3dDisplayMode.REALISTIC);
      this.canvasVersion++;
      this.statusMessage =
        `STEP 已绑定 ${defId}：点${result.pointCount} 面${result.faceCount} 三角${result.triCount}` +
        (result.warnings.length > 0 ? ` (${result.warnings[0]})` : '');
    } catch (_e) {
      this.statusMessage = 'STEP 导入失败';
    }
  }

  private reverseToSchematic(): void {
    const result = this.getEditor().reverseAnnotateToSchematic();
    if (result.success && result.data !== undefined) {
      const schEditor = this.appService.schematicEditor as SchematicEditorImpl;
      if (this.appService.currentProject) {
        this.appService.currentProject.schematic = schEditor.getDocument();
      }
      EventBus.getInstance().publish({
        event: ModuleEvent.SCHEMATIC_CHANGED,
        source: 'pcb_editor',
        timestamp: Date.now(),
        data: schEditor.getDocument()
      });
      this.unsavedChanges = true;
      this.statusMessage = `已回写原理图 ${result.data} 项（位号/值/封装）`;
    } else {
      this.statusMessage = result.error ?? '回写失败';
    }
  }

  private refreshLayers(): void {
    const doc = this.getEditor().getDocument();
    if (!doc) {
      this.layerRows = [];
      return;
    }
    const rows: PcbLayerRow[] = [];
    for (const l of doc.layers) {
      rows.push({
        id: l.id,
        name: l.name,
        visible: l.visible,
        color: l.color,
        opacity: l.opacity !== undefined ? l.opacity : 1
      });
    }
    this.layerRows = rows;
  }

  private async updateFromSchematic(): Promise<void> {
    await this.runForwardAnnotateFromSchematic(false);
  }

  /** 从原理图导出/同步到 PCB，并保存为 .pcbsim */
  private async updateFromSchematicAndSave(): Promise<void> {
    const ok = await this.runForwardAnnotateFromSchematic(true);
    if (ok) {
      await this.saveProject();
    }
  }

  /**
   * @returns true 表示前向标注成功
   */
  private async runForwardAnnotateFromSchematic(fromExport: boolean): Promise<boolean> {
    tracePcbUi('UPDATE_FROM_SCH', fromExport ? 'export start' : 'start');
    const editor = this.appService.schematicEditor as SchematicEditorImpl;
    editor.rebuildNetPinConnectivity();
    const sch = editor.getDocument();
    if (!sch || sch.components.length === 0) {
      this.statusMessage = fromExport
        ? '原理图为空，已打开 PCB（无封装可导出）'
        : '原理图为空，请先放置器件';
      tracePcbOp('UPDATE_FROM_SCH', 'fail empty schematic');
      return false;
    }
    if (!this.ercGatePassed()) {
      tracePcbOp('UPDATE_FROM_SCH', 'blocked by ERC');
      return false;
    }
    if (this.appService.currentProject) {
      this.appService.currentProject.schematic = sch;
    }
    const result = this.getEditor().forwardAnnotateFromSchematic();
    if (result.success && result.data) {
      this.syncPcbToProject();
      this.getEditor().fitBoardInView();
      this.zoomPercent = Math.round(this.getEditor().getViewport().zoom * 100);
      this.statusMessage = fromExport
        ? `已导出原理图到 PCB（${result.data.footprints.length} 个封装）`
        : `已从原理图更新 PCB（${result.data.footprints.length} 个封装）`;
      this.canvasVersion++;
      this.unsavedChanges = true;
      tracePcbOp('UPDATE_FROM_SCH', `ok fp=${result.data.footprints.length}`);
      return true;
    }
    this.statusMessage = result.error ?? '更新失败';
    tracePcbOp('UPDATE_FROM_SCH', `fail ${result.error ?? 'unknown'}`);
    return false;
  }

  private runDrc(): void {
    this.drcViolations = this.getEditor().runDrc();
    const drcMsg = this.drcViolations.length === 0
      ? 'DRC 检查通过'
      : `DRC: ${this.drcViolations.length} 个问题`;
    tracePcbUi('DRC', `violations=${this.drcViolations.length}`);
    this.dumpPcbInstrTrace();
    this.statusMessage = `${drcMsg} · instr_trace 已同步诊断`;
    this.canvasVersion++;
  }

  /** 将当前 2D/3D 展示、器件位置、连接与拥挤诊断写入 instr_trace */
  private dumpPcbInstrTrace(): void {
    const editor = this.getEditor();
    const doc = editor.getDocument();
    if (!doc) {
      this.statusMessage = '无 PCB 文档';
      return;
    }
    const ap = editor.getAppearance();
    const vp = editor.getViewport();
    const sel = editor.getSelection();
    const rats = editor.getRatsnest();
    const canvasSnap: PcbCanvasTraceSnapshot = {
      viewport: vp,
      activeLayer: editor.getActiveLayer(),
      appearance: ap,
      selection: sel,
      ratsnest: rats,
      toolMode: `${this.toolMode}`
    };
    const mode = ap.view3dDisplayMode !== undefined
      ? ap.view3dDisplayMode : Pcb3dDisplayMode.REALISTIC;
    if (ap.show3d) {
      const view3d: PcbView3dTraceParams = {
        viewWidth: 1200,
        viewHeight: 800,
        zoom: Math.max(vp.zoom, 0.05),
        panX: vp.panOffset.x,
        panY: vp.panOffset.y,
        yawDeg: ap.view3dYawDeg,
        pitchDeg: ap.view3dPitchDeg,
        ortho: ap.view3dOrtho !== false,
        displayMode: `${mode}`,
        usePbr: ap.view3dPbr === true && mode === Pcb3dDisplayMode.REALISTIC,
        msaa: ap.view3dMsaa >= 4 ? 4 : 1,
        cutFraction: ap.view3dCutFraction !== undefined ? ap.view3dCutFraction : 0.55,
        measure: ap.view3dMeasure === true,
        showInterference: ap.view3dShowInterference === true,
        highlightNetId: ap.highlightNetId,
        selectedFpIds: sel.footprintIds,
        selectedTrackIds: sel.trackIds,
        selectedViaIds: sel.viaIds,
        activeLayer: `${editor.getActiveLayer()}`,
        appearanceMode: `${ap.mode !== undefined ? ap.mode : PcbAppearanceMode.OVERLAY}`,
        hideZones: ap.hideZones === true,
        dimAlpha: ap.dimAlpha
      };
      tracePcbDisplayDump(doc, 'menu_3d_dump', canvasSnap, true, null, view3d);
      this.statusMessage = 'instr_trace 已写入 3D/连接/拥挤全量诊断（见运行日志）';
      tracePcbUi('INSTR_DUMP', '3d full');
    } else {
      const view2d: PcbView2dTraceParams = {
        viewWidth: 1200,
        viewHeight: 800,
        viewport: vp,
        appearance: ap,
        selection: sel,
        activeLayer: editor.getActiveLayer(),
        toolMode: `${this.toolMode}`,
        ratsnestCount: rats.length,
        drcCount: this.drcViolations.length
      };
      tracePcbDisplayDump(doc, 'menu_2d_dump', canvasSnap, false, view2d, null);
      this.statusMessage = 'instr_trace 已写入 2D/连接/拥挤全量诊断（见运行日志）';
      tracePcbUi('INSTR_DUMP', '2d full');
    }
  }

  /**
   * PCB 保存必须落到 .pcbsim。
   * 若当前路径是原理图 .schsim/.json 或为空，则写入沙箱 project/ 同名 .pcbsim
   *（模拟器 DocumentViewPicker 常无法写应用私有 project/，故默认直写沙箱）。
   */
  private resolvePcbSavePath(): string {
    const safeName = (this.projectName.length > 0 ? this.projectName : 'Untitled')
      .replace(/[\\/:*?"<>|]/g, '_');
    return ProjectPaths.toUserPcbProjectPath(
      this.appService.getAppBaseDir(),
      this.appService.currentProjectPath,
      safeName
    );
  }

  private async saveProject(): Promise<void> {
    this.syncPcbToProject();
    const path = this.resolvePcbSavePath();
    // 确保 project/ 存在（首次安装或路径异常时）
    try {
      fs.accessSync(this.userProjectDir);
    } catch (_e) {
      try { fs.mkdirSync(this.userProjectDir, true); } catch (_e2) { /* best-effort */ }
    }
    const ok = await this.appService.saveProject(path, true);
    if (ok) {
      this.unsavedChanges = false;
      this.projectName = this.appService.currentProject?.name ?? this.projectName;
      this.statusMessage = `已保存: ${path}`;
      tracePcbOp('SAVE', `ok path=${path}`);
    } else {
      this.statusMessage = '保存失败';
      tracePcbOp('SAVE', `fail path=${path}`);
    }
  }

  /** 另存为 .pcbsim：优先系统选择器；不可用或取消后仍可回退写入 project/ */
  private async saveProjectAs(): Promise<void> {
    this.syncPcbToProject();
    const picked = await this.savePcbViaPicker();
    if (picked === null || picked.length === 0) {
      tracePcbOp('SAVE_AS', 'cancelled');
      return;
    }
    const ok = await this.appService.saveProject(picked, true);
    if (ok) {
      this.unsavedChanges = false;
      this.projectName = this.appService.currentProject?.name ?? this.projectName;
      this.statusMessage = `已另存为: ${picked}`;
      tracePcbOp('SAVE_AS', `ok path=${picked}`);
    } else {
      this.statusMessage = '另存为失败';
      tracePcbOp('SAVE_AS', `fail path=${picked}`);
    }
  }

  private getHostCtx(): common.UIAbilityContext {
    return this.getUIContext().getHostContext() as common.UIAbilityContext;
  }

  private getProjectDirUri(): string {
    try {
      if (this.userProjectDir.length === 0) {
        return '';
      }
      return fileUri.getUriFromPath(this.userProjectDir);
    } catch (_e) {
      return '';
    }
  }

  /**
   * 系统保存对话框：默认 .pcbsim，目录为用户工程目录。
   * 模拟器上选择器常打不开应用沙箱 → 捕获异常后直写 project/。
   */
  private async savePcbViaPicker(): Promise<string | null> {
    const safeName = (this.projectName.length > 0 ? this.projectName : 'Untitled')
      .replace(/[\\/:*?"<>|]/g, '_');
    const fallback = ProjectPaths.defaultUserPcbProject(this.appService.getAppBaseDir(), safeName);
    try {
      const options = new picker.DocumentSaveOptions();
      options.newFileNames = [`${safeName}${ProjectPaths.PCB_EXT}`];
      options.fileSuffixChoices = ['PCB工程|.pcbsim'];
      const dirUri = this.getProjectDirUri();
      if (dirUri.length > 0) {
        options.defaultFilePathUri = dirUri;
      }
      const uris = await new picker.DocumentViewPicker(this.getHostCtx()).save(options);
      if (!uris || uris.length === 0) {
        this.statusMessage = '已取消保存';
        return null;
      }
      let chosen = uris[0];
      // 选择器可能返回无后缀或错误后缀的 URI/路径，强制规范为 .pcbsim
      if (!ProjectPaths.isPcbProjectPath(chosen)
        && !chosen.startsWith('content://')
        && !chosen.startsWith('file://')) {
        chosen = ProjectPaths.toUserPcbProjectPath(this.appService.getAppBaseDir(), chosen, safeName);
      }
      return chosen;
    } catch (_e) {
      this.statusMessage = `选择器不可用，将写入: ${fallback}`;
      return fallback;
    }
  }

  private goToSchematic(): void {
    this.syncPcbToProject();
    this.getUIContext().getRouter().replaceUrl({
      url: 'pages/Index',
      params: { launchMode: 'resume' }
    }).catch((_e: BusinessError) => { /* ignore */ });
  }

  private goToHome(): void {
    this.syncPcbToProject();
    this.getUIContext().getRouter().replaceUrl({ url: 'pages/HomePage' })
      .catch((_e: BusinessError) => { /* ignore */ });
  }

  /** 工具栏返回：原理图跳转进来则回原理图，否则回首页 */
  private goBack(): void {
    if (this.fromSchematic) {
      this.goToSchematic();
      return;
    }
    this.goToHome();
  }

  private setToolMode(mode: PcbToolMode): void {
    if (this.appService.isAiGenerating()) {
      this.statusMessage = 'PCB AI 布线中，画布已锁定';
      return;
    }
    const prev = this.toolMode;
    if (this.toolMode === PcbToolMode.ROUTE && mode !== PcbToolMode.ROUTE) {
      this.routeResetKey++;
    }
    this.toolMode = mode;
    if (prev !== mode) {
      tracePcbUi('TOOL_MODE', `${prev} → ${mode}`);
    }
    if (mode === PcbToolMode.ROUTE && !isCopperLayer(this.getEditor().getActiveLayer())) {
      this.setActiveLayerUi(PcbLayerId.F_CU);
      this.statusMessage = '走线层已切换为 Front Copper';
    }
  }

  private doUndo(): void {
    if (this.getEditor().undo()) {
      this.syncPcbToProject();
      this.refreshSelectedInfo();
      this.canvasVersion++;
      this.statusMessage = '撤销';
    }
  }

  private doRedo(): void {
    if (this.getEditor().redo()) {
      this.syncPcbToProject();
      this.refreshSelectedInfo();
      this.canvasVersion++;
      this.statusMessage = '重做';
    }
  }

  private doRotate(): void {
    this.getEditor().rotateSelected(true);
    this.refreshSelectedInfo();
    this.syncPcbToProject();
    this.canvasVersion++;
    this.statusMessage = '已旋转';
  }

  private doFlip(): void {
    this.getEditor().flipSelected();
    this.refreshSelectedInfo();
    this.syncPcbToProject();
    this.canvasVersion++;
    this.statusMessage = '已镜像翻转';
  }

  private doFit(): void {
    this.getEditor().fitBoardInView();
    this.zoomPercent = Math.round(this.getEditor().getViewport().zoom * 100);
    this.canvasVersion++;
    this.statusMessage = '适应窗口';
  }

  private doZoom(factor: number): void {
    this.getEditor().zoomAt(factor, 400, 300);
    this.zoomPercent = Math.round(this.getEditor().getViewport().zoom * 100);
    this.canvasVersion++;
  }

  private doCopy(): void {
    const ok = this.getEditor().copySelected();
    this.statusMessage = ok ? '已复制' : '无选中对象';
  }

  private doPaste(): void {
    const count = this.getEditor().pasteClipboard();
    this.statusMessage = count > 0 ? `已粘贴 ${count} 个` : '剪贴板为空';
    if (count > 0) {
      this.syncPcbToProject();
      this.canvasVersion++;
      this.unsavedChanges = true;
    }
  }

  private handlePageKeyEvent(event: KeyEvent): void {
    if (event.type === KeyType.Down) {
      if (event.keyCode === 2021 || event.keyCode === 2022) {
        this.pageModifierKeys |= 1;
        return;
      }
      if (event.keyCode === 2047 || event.keyCode === 2048 || event.keyCode === 16) {
        this.pageModifierKeys |= 2;
        return;
      }
    }
    if (event.type === KeyType.Up) {
      if (event.keyCode === 2021 || event.keyCode === 2022) {
        this.pageModifierKeys &= ~1;
        return;
      }
      if (event.keyCode === 2047 || event.keyCode === 2048 || event.keyCode === 16) {
        this.pageModifierKeys &= ~2;
        return;
      }
    }
    if (event.type !== KeyType.Down) {
      return;
    }
    if (this.appService.isAiGenerating()) {
      this.statusMessage = 'PCB AI 布线中，画布已锁定';
      return;
    }
    const ctrl = (this.pageModifierKeys & 1) !== 0;
    const shift = (this.pageModifierKeys & 2) !== 0;
    const kt = (event.keyText ?? '').toLowerCase();

    if (ctrl && kt === 's') {
      void this.saveProject();
      return;
    }
    if (ctrl && kt === 'z') {
      this.doUndo();
      return;
    }
    if (ctrl && kt === 'y') {
      this.doRedo();
      return;
    }
    if (ctrl && kt === 'c') {
      this.doCopy();
      return;
    }
    if (ctrl && kt === 'v') {
      this.doPaste();
      return;
    }
    if (ctrl && (kt === '0' || event.keyCode === 48)) {
      this.doFit();
      return;
    }
    if (ctrl) {
      return;
    }

    if (kt === 's') {
      this.setToolMode(PcbToolMode.SELECT);
      this.statusMessage = '工具: 选择';
      return;
    }
    if (kt === 'x') {
      this.setToolMode(PcbToolMode.ROUTE);
      this.statusMessage = '工具: 走线';
      return;
    }
    if (kt === 'v') {
      this.setToolMode(PcbToolMode.VIA);
      this.statusMessage = '工具: 过孔';
      return;
    }
    if (kt === 'z' && shift) {
      this.setToolMode(PcbToolMode.POUR);
      this.statusMessage = '工具: 整板覆铜';
      return;
    }
    if (kt === 'z') {
      this.setToolMode(PcbToolMode.ZONE_POLY);
      this.statusMessage = '工具: 多边形覆铜';
      return;
    }
    if (kt === 'o') {
      this.setToolMode(PcbToolMode.OUTLINE);
      this.statusMessage = '工具: 板框';
      return;
    }
    if (kt === 'm') {
      this.setToolMode(PcbToolMode.MEASURE);
      this.statusMessage = '工具: 测量';
      return;
    }
    if (kt === 'p') {
      this.setToolMode(PcbToolMode.PLACE_FP);
      this.statusMessage = '工具: 放置封装';
      return;
    }
    if (kt === 'g') {
      this.gridVisible = !this.gridVisible;
      this.canvasVersion++;
      this.statusMessage = this.gridVisible ? '网格开' : '网格关';
      return;
    }
    if (kt === 'r') {
      this.doRotate();
      return;
    }
    if (kt === 'f') {
      if (this.getEditor().getSelection().footprintIds.length > 0) {
        this.doFlip();
      } else {
        this.doFit();
      }
      return;
    }
    if (kt === 'u') {
      void this.updateFromSchematic();
      return;
    }
    if (kt === '+' || kt === '=') {
      this.doZoom(1.12);
      return;
    }
    if (kt === '-' || kt === '_') {
      this.doZoom(1 / 1.12);
      return;
    }
    if (event.keyCode === 46 || event.keyCode === 8 || kt === 'delete') {
      this.deleteSelected();
      this.statusMessage = '已删除';
      return;
    }
    if (kt === 'f7' || event.keyCode === 298) {
      this.runDrc();
      return;
    }
    if (kt === 'f8' || event.keyCode === 299) {
      this.runAutoRoute();
      return;
    }
    if (kt === 'f9' || event.keyCode === 300) {
      this.openAiRouteTab();
      return;
    }
  }

  build() {
    Column() {
      this.buildMenuBar()
      this.buildMainToolbar()
      Row() {
        Column() {
          PcbVerticalToolbar({
            toolMode: this.toolMode,
            gridActive: this.gridVisible,
            onToolSelect: (mode: PcbToolMode) => { this.setToolMode(mode); },
            onRotate: () => { this.doRotate(); },
            onFlip: () => { this.doFlip(); },
            onDelete: () => {
              this.deleteSelected();
              this.statusMessage = '已删除';
            },
            onUndo: () => { this.doUndo(); },
            onRedo: () => { this.doRedo(); },
            onFit: () => { this.doFit(); },
            onToggleGrid: () => {
              this.gridVisible = !this.gridVisible;
              this.canvasVersion++;
            },
            onUpdatePcb: () => { void this.updateFromSchematic(); },
            onDrc: () => { this.runDrc(); },
            onAutoRoute: () => { this.runAutoRoute(); },
            onAiRoute: () => { this.openAiRouteTab(); },
            onCopy: () => { this.doCopy(); },
            onPaste: () => { this.doPaste(); }
          })
        }
        .width(44)
        .height('100%')
        .zIndex(2)

        Column() {
          PcbLayerPanel({
            layerRows: this.layerRows,
            activeLayer: this.activeLayer,
            panelWidth: this.leftPanelWidth,
            onLayerSelect: (id: PcbLayerId) => { this.setActiveLayerUi(id, true); },
            onVisibilityChange: (id: PcbLayerId, visible: boolean) => {
              this.getEditor().setLayerVisible(id, visible);
              this.refreshLayers();
              this.canvasVersion++;
            },
            onOpacityChange: (id: PcbLayerId, opacity: number) => {
              this.getEditor().setLayerOpacity(id, opacity);
              this.refreshLayers();
              this.canvasVersion++;
            },
            onPreset: (preset: string) => {
              this.applyLayerPreset(preset);
            }
          })
        }
        .width(this.leftPanelWidth)
        .height('100%')
        .zIndex(2)

        ProteusResizer({ onDrag: (dx: number) => { this.leftPanelWidth = Math.max(140, this.leftPanelWidth + dx); } })

        Stack() {
          PcbCanvas({
            canvasVersion: $canvasVersion,
            selectedFootprintId: $selectedFootprintId,
            selectedTrackId: $selectedTrackId,
            selectedViaId: $selectedViaId,
            selectedZoneId: $selectedZoneId,
            mouseX: $mouseX,
            mouseY: $mouseY,
            worldMouseX: $worldMouseX,
            worldMouseY: $worldMouseY,
            zoomPercent: $zoomPercent,
            toolMode: $toolMode,
            routeResetKey: this.routeResetKey,
            gridVisible: this.gridVisible,
            onStatusChange: (msg: string) => { this.statusMessage = msg; },
            onDocumentChanged: () => {
              this.syncPcbToProject();
              this.refreshSelectedInfo();
              this.unsavedChanges = true;
            },
            onSelectionCleared: () => {
              this.selectedFootprintId = '';
              this.selectedTrackId = '';
              this.selectedViaId = '';
              this.selectedZoneId = '';
              this.selectedZoneCount = 0;
              this.selectedFootprintInfo = '';
              this.stackHighlightCopperIds = [];
            },
            onActiveLayerChange: (layer: PcbLayerId) => {
              this.activeLayer = layer;
            },
            onHoverNetChange: (netName: string) => {
              this.hoverNetName = netName;
            },
            onToolModeRequest: (mode: PcbToolMode) => {
              this.setToolMode(mode);
            }
          })
            .width('100%')
            .height('100%')

          if (this.aiBusy) {
            Column({ space: 10 }) {
              Text('PCB AI 布线中')
                .fontSize(18)
                .fontColor('#FFFFFF')
                .fontWeight(FontWeight.Medium)
              Text(this.aiStage.length > 0 ? `${this.aiStage}  ${this.aiProgress}%` : `${this.aiProgress}%`)
                .fontSize(13)
                .fontColor('#E0E0E0')
              Text('画布已锁定 · 仅允许 AI 自动放置与布线')
                .fontSize(12)
                .fontColor('#BDBDBD')
              Text('详见右侧 AI 布线面板')
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
              // 吞掉触摸，禁止平移/缩放/放置
            })
          }
        }
        .layoutWeight(1)
        .height('100%')

        ProteusResizer({ onDrag: (dx: number) => { this.rightPanelWidth = Math.max(180, this.rightPanelWidth - dx); } })

        PcbRightPanel({
          panelWidth: this.rightPanelWidth,
          selectionInfo: this.selectedFootprintInfo,
          selectedZoneId: this.selectedZoneId,
          selectedZoneCount: this.selectedZoneCount,
          activeLayer: this.activeLayer,
          drcViolations: this.drcViolations,
          selectedFpDefId: this.selectedFpDefId,
          copperCount: this.copperCount,
          stackLayers: this.stackLayers,
          viaKind: this.viaKind,
          viaFrom: this.viaFrom,
          viaTo: this.viaTo,
          copperLayerIds: this.copperLayerIds,
          routeCornerMode: this.routeCornerMode,
          stackFocusTick: this.stackFocusTick,
          stackHighlightCopperIds: this.stackHighlightCopperIds,
          gerberDocRev: this.gerberDocRev,
          aiTabFocusTick: this.aiTabFocusTick,
          statusMessage: $statusMessage,
          aiBusy: $aiBusy,
          aiProgress: $aiProgress,
          aiStage: $aiStage,
          getPcbDocument: () => this.getEditor().getDocument(),
          onExportGerber: () => { this.exportGerber(); },
          onAiRouteDone: () => {
            this.syncPcbToProject();
            this.canvasVersion++;
            this.unsavedChanges = true;
            this.refreshSelectedInfo();
            const doc = this.getEditor().getDocument();
            const tc = doc?.tracks.length ?? 0;
            const vc = doc?.vias.length ?? 0;
            this.statusMessage = `PCB AI 布线完成: ${tc} 段, ${vc} 过孔`;
            tracePcbOp('AI_PCB_ROUTE', `ok tracks=${tc} vias=${vc}`);
          },
          onZonePriority: (delta: number) => { this.adjustSelectedZonePriority(delta); },
          onZoneThermal: () => { this.toggleSelectedZoneThermal(); },
          onZoneRefreshCutouts: () => { this.refreshSelectedZoneCutouts(); },
          onPickFootprint: (defId: string) => {
            this.selectedFpDefId = defId;
            this.getEditor().setPlaceFootprintDefId(defId);
            this.setToolMode(PcbToolMode.PLACE_FP);
            this.statusMessage = `封装: ${defId} — 点击画布放置`;
          },
          onSetRouteCorner: (mode: PcbRouteCornerMode) => {
            this.getEditor().setRouteCornerMode(mode);
            this.routeCornerMode = mode;
            this.canvasVersion++;
            this.statusMessage = `布线拐角: ${mode}`;
          },
          onSetCopperCount: (n: number) => {
            if (this.getEditor().setCopperLayerCount(n)) {
              this.refreshLayers();
              this.syncActiveLayerFromEditor();
              this.syncStackUiFromEditor();
              this.canvasVersion++;
              this.statusMessage = `层叠已切换为 ${n} 层`;
            }
          },
          onSetViaKind: (k: PcbViaKind) => {
            this.getEditor().setViaKind(k);
            this.syncStackUiFromEditor();
            this.statusMessage = `过孔类型: ${k}`;
          },
          onSetViaSpan: (from: PcbLayerId, to: PcbLayerId) => {
            this.getEditor().setViaSpan(from, to);
            this.syncStackUiFromEditor();
            this.statusMessage = `过孔跨度: ${from} → ${to}`;
          },
          onSetAppearanceOverlay: () => {
            this.getEditor().setAppearanceMode(PcbAppearanceMode.OVERLAY);
            this.canvasVersion++;
            this.statusMessage = '显示模式: 叠层叠加';
          },
          onSetAppearanceDim: () => {
            this.getEditor().setAppearanceMode(PcbAppearanceMode.DIM_INACTIVE);
            this.canvasVersion++;
            this.statusMessage = '显示模式: 暗化非活动层';
          },
          onSetAppearanceActiveOnly: () => {
            this.getEditor().setAppearanceMode(PcbAppearanceMode.ACTIVE_ONLY);
            this.canvasVersion++;
            this.statusMessage = '显示模式: 仅活动层';
          },
          onSelectStackCopper: (id: PcbLayerId) => {
            this.setActiveLayerUi(id, true);
          },
          onRunDrc: () => { this.runDrc(); },
          onPcbTemplateInserted: () => {
            this.refreshLayers();
            this.syncActiveLayerFromEditor();
            this.syncStackUiFromEditor();
            this.refreshStackHighlightFromSelection();
            this.canvasVersion++;
            this.gerberDocRev++;
            this.statusMessage =
              `已插入 PCB 实验模板（${this.copperCount} 层铜）`;
          }
        })
      }
      .layoutWeight(1)
      .width('100%')
      .height('100%')

      PcbStatusBar({
        statusMessage: this.statusMessage,
        worldX: this.worldMouseX,
        worldY: this.worldMouseY,
        zoomPercent: this.zoomPercent,
        activeLayer: this.activeLayer,
        gridSize: this.getEditor().getDocument()?.metadata.gridSize ?? 5,
        gridVisible: this.gridVisible,
        hoverNetName: this.hoverNetName
      })
    }
    .width('100%')
    .height('100%')
    .backgroundColor(ProteusColors.MENU_BG)
    .focusable(true)
    .defaultFocus(true)
    .onKeyEvent((event: KeyEvent) => { this.handlePageKeyEvent(event); })
  }

  @Builder
  buildMainToolbar() {
    Row() {
      ProteusToolGroup({ title: 'Home' }) {
        ProteusToolButton({
          iconName: ProteusIconName.HOME,
          tooltip: this.fromSchematic ? '返回原理图' : '返回首页',
          showLabel: false,
          onAction: () => { this.goBack(); }
        })
      }
      ProteusToolGroup({ title: 'File' }) {
        ProteusToolButton({
          iconName: ProteusIconName.SAVE,
          tooltip: '保存 (Ctrl+S)',
          showLabel: false,
          onAction: () => { void this.saveProject(); }
        })
      }
      ProteusToolGroup({ title: 'History' }) {
        ProteusToolButton({
          iconName: ProteusIconName.UNDO,
          tooltip: '撤销 (Ctrl+Z)',
          showLabel: false,
          onAction: () => { this.doUndo(); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.REDO,
          tooltip: '重做 (Ctrl+Y)',
          showLabel: false,
          onAction: () => { this.doRedo(); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.TRASH,
          tooltip: '删除 (Del)',
          showLabel: false,
          onAction: () => {
            this.deleteSelected();
            this.statusMessage = '已删除';
          }
        })
      }
      ProteusToolGroup({ title: 'Edit' }) {
        ProteusToolButton({
          iconName: ProteusIconName.COPY,
          tooltip: '复制 (Ctrl+C)',
          showLabel: false,
          onAction: () => { this.doCopy(); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.PASTE,
          tooltip: '粘贴 (Ctrl+V)',
          showLabel: false,
          onAction: () => { this.doPaste(); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.ROTATE,
          tooltip: '旋转 (R)',
          showLabel: false,
          onAction: () => { this.doRotate(); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.MIRROR,
          tooltip: '镜像 (F)',
          showLabel: false,
          onAction: () => { this.doFlip(); }
        })
      }
      ProteusToolGroup({ title: 'View' }) {
        ProteusToolButton({
          iconName: ProteusIconName.ZOOM_IN,
          tooltip: '放大 (+)',
          showLabel: false,
          onAction: () => { this.doZoom(1.12); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.ZOOM_OUT,
          tooltip: '缩小 (-)',
          showLabel: false,
          onAction: () => { this.doZoom(1 / 1.12); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.FIT,
          tooltip: '适应窗口 (Ctrl+0)',
          showLabel: false,
          onAction: () => { this.doFit(); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.GRID,
          tooltip: '网格 (G)',
          showLabel: false,
          active: this.gridVisible,
          onAction: () => {
            this.gridVisible = !this.gridVisible;
            this.canvasVersion++;
          }
        })
      }
      ProteusToolGroup({ title: 'Place' }) {
        ProteusToolButton({
          iconName: ProteusIconName.SELECT,
          tooltip: '选择 (S)',
          showLabel: false,
          active: this.toolMode === PcbToolMode.SELECT,
          onAction: () => { this.setToolMode(PcbToolMode.SELECT); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.TRACK,
          tooltip: '走线 (X)',
          showLabel: false,
          active: this.toolMode === PcbToolMode.ROUTE,
          onAction: () => { this.setToolMode(PcbToolMode.ROUTE); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.VIA,
          tooltip: '过孔 (V)',
          showLabel: false,
          active: this.toolMode === PcbToolMode.VIA,
          onAction: () => { this.setToolMode(PcbToolMode.VIA); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.ZONE,
          tooltip: '多边形覆铜 (Z)',
          showLabel: false,
          active: this.toolMode === PcbToolMode.ZONE_POLY,
          onAction: () => { this.setToolMode(PcbToolMode.ZONE_POLY); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.GROUND,
          tooltip: '整板覆铜 (Shift+Z)',
          showLabel: false,
          active: this.toolMode === PcbToolMode.POUR,
          onAction: () => { this.setToolMode(PcbToolMode.POUR); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.COMPONENT,
          tooltip: '放置封装 (P)',
          showLabel: false,
          active: this.toolMode === PcbToolMode.PLACE_FP,
          onAction: () => { this.setToolMode(PcbToolMode.PLACE_FP); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.RULER,
          tooltip: '测量 (M)',
          showLabel: false,
          active: this.toolMode === PcbToolMode.MEASURE,
          onAction: () => { this.setToolMode(PcbToolMode.MEASURE); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.LABEL,
          tooltip: '板框 (O)',
          showLabel: false,
          active: this.toolMode === PcbToolMode.OUTLINE,
          onAction: () => { this.setToolMode(PcbToolMode.OUTLINE); }
        })
      }
      ProteusToolGroup({ title: 'Tools' }) {
        ProteusToolButton({
          iconName: ProteusIconName.AI_LAYOUT,
          tooltip: '更新 PCB (U)',
          showLabel: false,
          onAction: () => { void this.updateFromSchematic(); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.DRC,
          tooltip: 'DRC (F7)',
          showLabel: false,
          onAction: () => { this.runDrc(); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.WIRE,
          tooltip: '自动布线 (F8)',
          showLabel: false,
          onAction: () => { this.runAutoRoute(); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.AI_ROUTE,
          tooltip: 'AI 布线面板 (F9)',
          showLabel: false,
          onAction: () => { this.openAiRouteTab(); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.LAYER,
          tooltip: '简易 3D 预览',
          showLabel: false,
          onAction: () => {
            const ap = this.getEditor().getAppearance();
            const next = !ap.show3d;
            this.getEditor().setShow3d(next);
            if (next) {
              this.getEditor().setView3dOrtho(true);
              this.getEditor().setView3dPreset('iso');
            }
            this.canvasVersion++;
            this.statusMessage = next
              ? '3D：正交·左键旋转 · 中/右键平移 · 滚轮缩放'
              : '已关闭 3D 预览';
            tracePcb3d(next ? 'UI_TOGGLE_ON' : 'UI_TOGGLE_OFF', 'toolbar');
          }
        })
        ProteusToolButton({
          iconName: ProteusIconName.WIRE,
          tooltip: '原理图编辑器',
          showLabel: false,
          onAction: () => { this.goToSchematic(); }
        })
      }
      Blank()
    }
    .width('100%')
    .height(ProteusDimens.TOOLBAR_HEIGHT)
    .padding({ left: 4, right: 4 })
    .backgroundColor(ProteusColors.TOOLBAR_BG)
    .border({ width: { bottom: 1 }, color: ProteusColors.BORDER })
    .alignItems(VerticalAlign.Center)
  }

  @Builder
  buildMenuBar() {
    Row() {
      ProteusIcon({ name: ProteusIconName.LAYER, iconSize: 14, color: ProteusColors.SELECTED })
        .margin({ left: 8, right: 4 })
      Text('PCB Editor')
        .fontSize(ProteusFonts.MENU)
        .fontColor(ProteusColors.TEXT_PRIMARY)
        .fontWeight(FontWeight.Medium)
      ProteusMenuTrigger({ label: '文件', entries: this.fileMenuEntries() })
      ProteusMenuTrigger({ label: '视图', entries: this.viewMenuEntries() })
      ProteusMenuTrigger({ label: '工具', entries: this.toolMenuEntries() })
      Blank()
      Text(this.projectName + (this.unsavedChanges ? ' *' : ''))
        .fontSize(ProteusFonts.STATUS)
        .fontColor(ProteusColors.TEXT_SECONDARY)
        .margin({ right: 12 })
    }
    .width('100%')
    .height(ProteusDimens.MENU_HEIGHT)
    .backgroundColor(ProteusColors.MENU_BG)
    .border({ width: { bottom: 1 }, color: ProteusColors.BORDER })
  }

  fileMenuEntries(): ProteusMenuEntry[] {
    return [
      { label: '保存', action: () => { void this.saveProject(); } },
      { label: '另存为…', action: () => { void this.saveProjectAs(); } },
      { label: '导出 PCB', action: () => { void this.exportPcb(); } },
      { label: '导出 Gerber', action: () => { void this.exportGerber(); } },
      {
        label: this.fromSchematic ? '返回原理图' : '返回首页',
        action: () => { this.goBack(); }
      }
    ];
  }

  viewMenuEntries(): ProteusMenuEntry[] {
    const ap = this.getEditor().getAppearance();
    return [
      { label: '适应窗口 (F)', action: () => {
        this.getEditor().fitBoardInView();
        this.zoomPercent = Math.round(this.getEditor().getViewport().zoom * 100);
        this.canvasVersion++;
      }},
      { label: '切换网格', action: () => { this.gridVisible = !this.gridVisible; this.canvasVersion++; } },
      { label: 'instr_trace: 2D/3D 诊断转储', action: () => { this.dumpPcbInstrTrace(); } },
      { label: '显示模式: 叠加', action: () => {
        this.getEditor().setAppearanceMode(PcbAppearanceMode.OVERLAY);
        this.canvasVersion++;
        this.statusMessage = '显示: 叠加';
      }},
      { label: '显示模式: 变暗非活动层', action: () => {
        this.getEditor().setAppearanceMode(PcbAppearanceMode.DIM_INACTIVE);
        this.canvasVersion++;
        this.statusMessage = '显示: 变暗非活动层';
      }},
      { label: '显示模式: 仅活动层', action: () => {
        this.getEditor().setAppearanceMode(PcbAppearanceMode.ACTIVE_ONLY);
        this.canvasVersion++;
        this.statusMessage = '显示: 仅活动层';
      }},
      { label: ap.showRatsnest ? '隐藏飞线' : '显示飞线', action: () => {
        this.getEditor().setShowRatsnest(!ap.showRatsnest);
        this.canvasVersion++;
      }},
      { label: ap.hideZones ? '显示覆铜' : '隐藏覆铜', action: () => {
        this.getEditor().setHideZones(!ap.hideZones);
        this.canvasVersion++;
      }},
      { label: ap.showPadNumbers ? '隐藏焊盘编号' : '显示焊盘编号', action: () => {
        this.getEditor().setShowPadNumbers(!ap.showPadNumbers);
        this.canvasVersion++;
      }},
      { label: ap.show3d ? '关闭 3D 预览' : '打开 3D 预览', action: () => {
        const next = !ap.show3d;
        this.getEditor().setShow3d(next);
        if (next) {
          this.getEditor().setView3dOrtho(true);
          this.getEditor().setView3dPreset('iso');
        }
        this.canvasVersion++;
        tracePcb3d(next ? 'UI_TOGGLE_ON' : 'UI_TOGGLE_OFF', 'menu');
        this.dumpPcbInstrTrace();
        this.statusMessage = next
          ? '3D：正交·左键旋转'
          : '已关 3D';
      }},
      { label: '复位 3D 视角', action: () => {
        this.getEditor().resetView3d();
        this.canvasVersion++;
        this.statusMessage = '3D 视角已复位（等轴测·正交）';
      }},
      { label: ap.view3dOrtho !== false ? '3D：切换透视' : '3D：切换正交', action: () => {
        const next = !(ap.view3dOrtho !== false);
        this.getEditor().setView3dOrtho(next);
        this.canvasVersion++;
        this.statusMessage = next ? '3D 正交投影' : '3D 透视投影';
      }},
      { label: '3D 等轴测', action: () => {
        this.getEditor().setView3dPreset('iso');
        this.canvasVersion++;
        this.statusMessage = '3D 等轴测';
      }},
      { label: '3D 顶视图', action: () => {
        this.getEditor().setView3dPreset('top');
        this.canvasVersion++;
        this.statusMessage = '3D 顶视图';
      }},
      { label: '3D 前视图', action: () => {
        this.getEditor().setView3dPreset('front');
        this.canvasVersion++;
        this.statusMessage = '3D 前视图';
      }},
      { label: '3D 写实模式', action: () => {
        this.getEditor().setView3dDisplayMode(Pcb3dDisplayMode.REALISTIC);
        this.getEditor().setView3dPbr(true);
        this.canvasVersion++;
        this.statusMessage = '3D 写实 PBR+IBL+MSAA';
      }},
      { label: ap.view3dPbr === true ? '关闭真 PBR(伪3D)' : '开启真 PBR', action: () => {
        const next = !(ap.view3dPbr === true);
        this.getEditor().setView3dPbr(next);
        this.canvasVersion++;
        this.statusMessage = next ? '真 PBR 已开' : '已切伪 3D';
      }},
      { label: ap.view3dMsaa >= 4 ? 'MSAA → 1x' : 'MSAA → 4x', action: () => {
        const next = ap.view3dMsaa >= 4 ? 1 : 4;
        this.getEditor().setView3dMsaa(next);
        this.canvasVersion++;
        this.statusMessage = `MSAA ${next}x`;
      }},
      { label: '导入 STEP→选中封装', action: () => { void this.importStepForSelection(); } },
      { label: '3D 半透明(内层)', action: () => {
        this.getEditor().setView3dDisplayMode(Pcb3dDisplayMode.XRAY);
        this.canvasVersion++;
        this.statusMessage = '3D 半透明分层';
      }},
      { label: '3D 爆炸分层', action: () => {
        this.getEditor().setView3dDisplayMode(Pcb3dDisplayMode.EXPLODE);
        this.canvasVersion++;
        this.statusMessage = '3D 爆炸视图';
      }},
      { label: '3D 剖切视图', action: () => {
        this.getEditor().setView3dDisplayMode(Pcb3dDisplayMode.CUTAWAY);
        this.getEditor().setView3dCutFraction(0.55);
        this.canvasVersion++;
        this.statusMessage = '3D 剖切（可再调剖切比例）';
      }},
      { label: '3D 剖切+10%', action: () => {
        const f = (ap.view3dCutFraction !== undefined ? ap.view3dCutFraction : 0.55) + 0.1;
        this.getEditor().setView3dCutFraction(f > 0.95 ? 0.15 : f);
        this.getEditor().setView3dDisplayMode(Pcb3dDisplayMode.CUTAWAY);
        this.canvasVersion++;
      }},
      { label: '3D 高度色阶', action: () => {
        this.getEditor().setView3dDisplayMode(Pcb3dDisplayMode.HEIGHTMAP);
        this.canvasVersion++;
        this.statusMessage = '3D 高度色阶';
      }},
      { label: ap.view3dMeasure ? '关闭 3D 测量' : '开启 3D 测量', action: () => {
        const next = !ap.view3dMeasure;
        this.getEditor().setView3dMeasure(next);
        this.canvasVersion++;
        this.statusMessage = next ? '3D 测量：单击两点测距' : '已关闭 3D 测量';
      }},
      { label: ap.view3dShowInterference ? '隐藏干涉标红' : '显示干涉检查', action: () => {
        const next = !ap.view3dShowInterference;
        this.getEditor().setView3dShowInterference(next);
        this.canvasVersion++;
        if (next) {
          const doc = this.getEditor().getDocument();
          const n = doc ? Pcb3dRenderer.listInterference(doc).length : 0;
          this.statusMessage = n === 0 ? '干涉检查：无重叠' : `干涉检查：${n} 处已标红`;
        } else {
          this.statusMessage = '已隐藏干涉标红';
        }
      }},
      { label: '导出 3D STEP(简化)', action: () => { void this.export3dStep(); } },
      { label: '导出干涉报告', action: () => { void this.export3dInterference(); } },
      { label: '层叠: 2 层铜', action: () => {
        if (this.getEditor().setCopperLayerCount(2)) {
          this.refreshLayers();
          this.syncActiveLayerFromEditor();
          this.syncStackUiFromEditor();
          this.canvasVersion++;
          this.statusMessage = '层叠已切换为 2 层';
        }
      }},
      { label: '层叠: 4 层铜', action: () => {
        if (this.getEditor().setCopperLayerCount(4)) {
          this.refreshLayers();
          this.syncActiveLayerFromEditor();
          this.syncStackUiFromEditor();
          this.canvasVersion++;
          this.statusMessage = '层叠已切换为 4 层';
        }
      }},
      { label: '层叠: 6 层铜', action: () => {
        if (this.getEditor().setCopperLayerCount(6)) {
          this.refreshLayers();
          this.syncActiveLayerFromEditor();
          this.syncStackUiFromEditor();
          this.canvasVersion++;
          this.statusMessage = '层叠已切换为 6 层';
        }
      }},
      { label: '撤销 (Ctrl+Z)', action: () => {
        if (this.getEditor().undo()) { this.syncPcbToProject(); this.refreshSelectedInfo(); this.canvasVersion++; }
      }},
      { label: '重做 (Ctrl+Y)', action: () => {
        if (this.getEditor().redo()) { this.syncPcbToProject(); this.refreshSelectedInfo(); this.canvasVersion++; }
      }}
    ];
  }

  toolMenuEntries(): ProteusMenuEntry[] {
    return [
      { label: '更新 PCB（从原理图，需 ERC 通过）', action: () => { void this.updateFromSchematic(); } },
      { label: '回写原理图（反向标注）', action: () => { this.reverseToSchematic(); } },
      { label: 'DRC 检查', action: () => { this.runDrc(); } },
      { label: 'instr_trace: 2D/3D 诊断转储', action: () => { this.dumpPcbInstrTrace(); } },
      { label: '自动布线 (F8)', action: () => { this.runAutoRoute(); } },
      { label: 'AI 布线面板 (F9)', action: () => { this.openAiRouteTab(); } },
      { label: '复制 (Ctrl+C) / 粘贴 (Ctrl+V)', action: () => {
        const count = this.getEditor().pasteClipboard();
        this.statusMessage = count > 0 ? `已粘贴 ${count} 个` : '剪贴板为空，先 Ctrl+C 复制';
        if (count > 0) { this.syncPcbToProject(); this.canvasVersion++; }
      }},
      { label: '原理图编辑器', action: () => { this.goToSchematic(); } }
    ];
  }
}
