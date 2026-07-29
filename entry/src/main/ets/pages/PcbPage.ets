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
  ProteusResizer, ProteusMenuTrigger, ProteusMenuEntry
} from '../components/proteus/ProteusWidgets';
import { ProteusIcon, ProteusIconName } from '../components/proteus/ProteusIcons';
import { ProteusColors, ProteusDimens, ProteusFonts } from '../theme/ProteusTheme';
import { PROTEUS_THEME_REV_KEY } from '../theme/ThemeManager';
import {
  PcbLayerId, PcbDrcViolation, EventBus, ModuleEvent, ModuleEventPayload,
  PcbEditorSelectionData, exportPcbGerber, exportPcbKiCad,
  createEmptyPcbDocument, normalizePcbDocument, isCopperLayer
} from 'common';
import { PcbEditorImpl, PcbToolMode } from 'pcb_editor';
import { SchematicEditorImpl } from 'schematic_editor';
import { BusinessError } from '@kit.BasicServicesKit';
import { common } from '@kit.AbilityKit';
import { picker } from '@kit.CoreFileKit';
import fs from '@ohos.file.fs';
import { maximizeAppWindow } from '../utils/WindowLaunchUtil';

interface PcbLaunchParams {
  launchMode?: string;
  projectPath?: string;
  projectName?: string;
}

@Entry
@Component
struct PcbPage {
  @StorageProp(PROTEUS_THEME_REV_KEY) themeRev: number = 0;
  @State projectName: string = 'Untitled';
  @State statusMessage: string = '';
  @State canvasVersion: number = 0;
  @State selectedFootprintId: string = '';
  @State selectedTrackId: string = '';
  @State selectedViaId: string = '';
  @State selectedZoneId: string = '';
  @State selectedFootprintInfo: string = '';
  @State mouseX: number = 0;
  @State mouseY: number = 0;
  @State worldMouseX: number = 0;
  @State worldMouseY: number = 0;
  @State zoomPercent: number = 15;
  @State toolMode: PcbToolMode = PcbToolMode.SELECT;
  @State gridVisible: boolean = true;
  @State leftPanelWidth: number = 180;
  @State rightPanelWidth: number = 260;
  @State drcViolations: PcbDrcViolation[] = [];
  @State layerRows: PcbLayerRow[] = [];
  @State appInitialized: boolean = false;
  @State unsavedChanges: boolean = false;
  @State routeResetKey: number = 0;

  private appService: AppService = AppService.getInstance();

  aboutToAppear(): void {
    EventBus.getInstance().subscribe(ModuleEvent.PCB_CHANGED, this.onPcbChanged);
    EventBus.getInstance().subscribe(ModuleEvent.VIEWPORT_CHANGED, this.onViewportChanged);
    EventBus.getInstance().subscribe(ModuleEvent.SELECTION_CHANGED, this.onSelectionChanged);
    void this.initPage();
  }

  aboutToDisappear(): void {
    this.syncPcbToProject();
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
    } else {
      const sel = payload.data as PcbEditorSelectionData;
      if (sel.footprintIds !== undefined && sel.trackIds !== undefined) {
        this.selectedFootprintId = sel.footprintIds.length > 0 ? sel.footprintIds[0] : '';
        this.selectedTrackId = sel.trackIds.length > 0 ? sel.trackIds[0] : '';
        this.selectedViaId = sel.viaIds !== undefined && sel.viaIds.length > 0 ? sel.viaIds[0] : '';
        this.selectedZoneId = sel.zoneIds !== undefined && sel.zoneIds.length > 0 ? sel.zoneIds[0] : '';
      } else {
        this.selectedFootprintId = '';
        this.selectedTrackId = '';
        this.selectedViaId = '';
        this.selectedZoneId = '';
      }
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
    await maximizeAppWindow(ctx);

    let params: Record<string, Object> = {};
    try {
      params = this.getUIContext().getRouter().getParams() as Record<string, Object>;
    } catch (_e) { /* no params */ }

    const mode = params['launchMode'] as string | undefined;
    if (mode === 'resume') {
      if (this.appService.currentProject !== null) {
        this.projectName = this.appService.currentProject.name;
        this.ensurePcbDocument();
        this.appInitialized = true;
        this.refreshLayers();
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
          this.selectedFootprintInfo = `走线 ${trk.netName || '?'}\n${trk.layer}  ${trk.width.toFixed(1)} mil`;
          return;
        }
      }
    }
    if (viaCount === 1) {
      for (const via of doc.vias) {
        if (via.id === sel.viaIds[0]) {
          this.selectedFootprintInfo = `过孔 ${via.netName || '?'}\nØ${via.diameter.toFixed(0)} mil`;
          return;
        }
      }
    }
    if (zoneCount === 1) {
      for (const zone of doc.zones) {
        if (zone.id === sel.zoneIds[0]) {
          this.selectedFootprintInfo = `覆铜 ${zone.netName}\n优先级 ${zone.priority}  热焊盘:${zone.thermalRelief ? '开' : '关'}`;
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
    this.getEditor().deleteSelected();
    this.selectedFootprintId = '';
    this.selectedTrackId = '';
    this.selectedViaId = '';
    this.selectedZoneId = '';
    this.selectedFootprintInfo = '';
    this.syncPcbToProject();
    this.canvasVersion++;
  }

  private runAutoRoute(): void {
    const result = this.getEditor().runAutoRoute();
    if (result.success && result.data !== undefined) {
      this.syncPcbToProject();
      this.canvasVersion++;
      const d = result.data;
      const hint = d.messages.length > 0 ? d.messages[0] : '';
      this.statusMessage = `自动布线: ${d.netCount} 网络, ${d.trackCount} 段走线${hint.length > 0 ? ' — ' + hint : ''}`;
      this.unsavedChanges = true;
    } else {
      this.statusMessage = result.error ?? '自动布线失败';
    }
  }

  private adjustSelectedZonePriority(delta: number): void {
    if (this.selectedZoneId.length === 0) {
      return;
    }
    if (this.getEditor().adjustZonePriority(this.selectedZoneId, delta)) {
      this.syncPcbToProject();
      this.refreshSelectedInfo();
      this.canvasVersion++;
      this.unsavedChanges = true;
    }
  }

  private toggleSelectedZoneThermal(): void {
    if (this.selectedZoneId.length === 0) {
      return;
    }
    const doc = this.getEditor().getDocument();
    if (!doc) {
      return;
    }
    for (const zone of doc.zones) {
      if (zone.id === this.selectedZoneId) {
        this.getEditor().setZoneThermalRelief(this.selectedZoneId, !zone.thermalRelief);
        this.syncPcbToProject();
        this.refreshSelectedInfo();
        this.canvasVersion++;
        this.unsavedChanges = true;
        return;
      }
    }
  }

  private refreshSelectedZoneCutouts(): void {
    if (this.selectedZoneId.length === 0) {
      return;
    }
    if (this.getEditor().refreshZoneCutouts(this.selectedZoneId)) {
      this.syncPcbToProject();
      this.canvasVersion++;
      this.statusMessage = '已刷新覆铜挖空';
      this.unsavedChanges = true;
    }
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
      rows.push({ id: l.id, name: l.name, visible: l.visible, color: l.color });
    }
    this.layerRows = rows;
  }

  private async updateFromSchematic(): Promise<void> {
    const editor = this.appService.schematicEditor as SchematicEditorImpl;
    editor.rebuildNetPinConnectivity();
    const sch = editor.getDocument();
    if (!sch || sch.components.length === 0) {
      this.statusMessage = '原理图为空，请先放置器件';
      return;
    }
    if (!this.ercGatePassed()) {
      return;
    }
    if (this.appService.currentProject) {
      this.appService.currentProject.schematic = sch;
    }
    const result = this.getEditor().forwardAnnotateFromSchematic();
    if (result.success && result.data) {
      this.syncPcbToProject();
      this.getEditor().fitBoardInView();
      this.zoomPercent = Math.round(this.getEditor().getViewport().zoom * 100);
      this.statusMessage = `已从原理图更新 PCB（${result.data.footprints.length} 个封装）`;
      this.canvasVersion++;
      this.unsavedChanges = true;
    } else {
      this.statusMessage = result.error ?? '更新失败';
    }
  }

  private runDrc(): void {
    this.drcViolations = this.getEditor().runDrc();
    this.statusMessage = this.drcViolations.length === 0
      ? 'DRC 检查通过'
      : `DRC: ${this.drcViolations.length} 个问题`;
  }

  private async saveProject(): Promise<void> {
    this.syncPcbToProject();
    const path = this.appService.currentProjectPath;
    if (path.length === 0) {
      this.statusMessage = '请先保存工程到文件';
      return;
    }
    const ok = await this.appService.saveProject(path);
    if (ok) {
      this.unsavedChanges = false;
      this.statusMessage = '工程已保存';
    } else {
      this.statusMessage = '保存失败';
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

  private setToolMode(mode: PcbToolMode): void {
    if (this.toolMode === PcbToolMode.ROUTE && mode !== PcbToolMode.ROUTE) {
      this.routeResetKey++;
    }
    this.toolMode = mode;
    if (mode === PcbToolMode.ROUTE && !isCopperLayer(this.getEditor().getActiveLayer())) {
      this.getEditor().setActiveLayer(PcbLayerId.F_CU);
      this.statusMessage = '走线层已切换为 Front Copper';
    }
  }

  build() {
    Column() {
      this.buildMenuBar()
      Row() {
        PcbVerticalToolbar({
          toolMode: this.toolMode,
          gridActive: this.gridVisible,
          onToolSelect: (mode: PcbToolMode) => { this.setToolMode(mode); },
          onRotate: () => {
            this.getEditor().rotateSelected(true);
            this.refreshSelectedInfo();
            this.syncPcbToProject();
            this.canvasVersion++;
            this.statusMessage = '已旋转';
          },
          onDelete: () => {
            this.deleteSelected();
            this.statusMessage = '已删除';
          },
          onUndo: () => {
            if (this.getEditor().undo()) {
              this.syncPcbToProject();
              this.refreshSelectedInfo();
              this.canvasVersion++;
              this.statusMessage = '撤销';
            }
          },
          onRedo: () => {
            if (this.getEditor().redo()) {
              this.syncPcbToProject();
              this.refreshSelectedInfo();
              this.canvasVersion++;
              this.statusMessage = '重做';
            }
          },
          onFit: () => {
            this.getEditor().fitBoardInView();
            this.zoomPercent = Math.round(this.getEditor().getViewport().zoom * 100);
            this.canvasVersion++;
            this.statusMessage = '适应窗口';
          },
          onToggleGrid: () => {
            this.gridVisible = !this.gridVisible;
            this.canvasVersion++;
          },
          onUpdatePcb: () => { void this.updateFromSchematic(); },
          onDrc: () => { this.runDrc(); },
          onAutoRoute: () => { this.runAutoRoute(); }
        })

        PcbLayerPanel({
          layerRows: this.layerRows,
          activeLayer: this.getEditor().getActiveLayer(),
          panelWidth: this.leftPanelWidth,
          onLayerSelect: (id: PcbLayerId) => {
            this.getEditor().setActiveLayer(id);
            this.statusMessage = `活动层: ${id}`;
            this.canvasVersion++;
          },
          onVisibilityChange: (id: PcbLayerId, visible: boolean) => {
            this.getEditor().setLayerVisible(id, visible);
            this.refreshLayers();
            this.canvasVersion++;
          }
        })

        ProteusResizer({ onDrag: (dx: number) => { this.leftPanelWidth = Math.max(140, this.leftPanelWidth + dx); } })

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
            this.selectedFootprintInfo = '';
          }
        })
          .layoutWeight(1)

        ProteusResizer({ onDrag: (dx: number) => { this.rightPanelWidth = Math.max(180, this.rightPanelWidth - dx); } })

        PcbRightPanel({
          panelWidth: this.rightPanelWidth,
          selectionInfo: this.selectedFootprintInfo,
          selectedZoneId: this.selectedZoneId,
          activeLayer: this.getEditor().getActiveLayer(),
          drcViolations: this.drcViolations,
          onZonePriority: (delta: number) => { this.adjustSelectedZonePriority(delta); },
          onZoneThermal: () => { this.toggleSelectedZoneThermal(); },
          onZoneRefreshCutouts: () => { this.refreshSelectedZoneCutouts(); }
        })
      }
      .layoutWeight(1)

      PcbStatusBar({
        statusMessage: this.statusMessage,
        worldX: this.worldMouseX,
        worldY: this.worldMouseY,
        zoomPercent: this.zoomPercent,
        activeLayer: this.getEditor().getActiveLayer(),
        gridSize: this.getEditor().getDocument()?.metadata.gridSize ?? 5,
        gridVisible: this.gridVisible
      })
    }
    .width('100%')
    .height('100%')
    .backgroundColor(ProteusColors.MENU_BG)
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
      { label: '导出 PCB', action: () => { void this.exportPcb(); } },
      { label: '导出 Gerber', action: () => { void this.exportGerber(); } },
      { label: '返回首页', action: () => { this.goToHome(); } }
    ];
  }

  viewMenuEntries(): ProteusMenuEntry[] {
    return [
      { label: '适应窗口 (F)', action: () => {
        this.getEditor().fitBoardInView();
        this.zoomPercent = Math.round(this.getEditor().getViewport().zoom * 100);
        this.canvasVersion++;
      }},
      { label: '切换网格', action: () => { this.gridVisible = !this.gridVisible; this.canvasVersion++; } },
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
      { label: '自动布线', action: () => { this.runAutoRoute(); } },
      { label: '复制 (Ctrl+C) / 粘贴 (Ctrl+V)', action: () => {
        const count = this.getEditor().pasteClipboard();
        this.statusMessage = count > 0 ? `已粘贴 ${count} 个` : '剪贴板为空，先 Ctrl+C 复制';
        if (count > 0) { this.syncPcbToProject(); this.canvasVersion++; }
      }},
      { label: '原理图编辑器', action: () => { this.goToSchematic(); } }
    ];
  }
}
