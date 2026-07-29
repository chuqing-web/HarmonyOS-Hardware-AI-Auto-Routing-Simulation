/**
 * PCB 画布 2D 渲染 — KiCad 式分层显示（铜层/丝印/板框）加固版
 */
import { AppService } from '../services/AppService';
import {
  PcbDocument, PcbFootprintInst, PcbLayerId, PcbTrack, PcbVia, PcbZone, PcbSelectionKind,
  EventBus, ModuleEvent, ModuleEventPayload, Point2D, PcbPadType, padWorldPosition,
  PcbAppearance, PcbAppearanceMode, routeOrtho45Points, isCopperLayer
} from 'common';
import { PcbEditorImpl, PcbToolMode } from 'pcb_editor';
import { PcbColors, ProteusColors, ProteusDimens } from '../theme/ProteusTheme';
import { PROTEUS_THEME_REV_KEY } from '../theme/ThemeManager';
import { getGlobalPcbFootprintLibrary } from 'common';

interface PcbScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

@Component
export struct PcbCanvas {
  @StorageProp(PROTEUS_THEME_REV_KEY) @Watch('onThemeRevChange') themeRev: number = 0;
  @Link @Watch('onCanvasVersionChange') canvasVersion: number;
  @Link selectedFootprintId: string;
  @Link selectedTrackId: string;
  @Link selectedViaId: string;
  @Link selectedZoneId: string;
  @Link mouseX: number;
  @Link mouseY: number;
  @Link worldMouseX: number;
  @Link worldMouseY: number;
  @Link zoomPercent: number;
  @Link toolMode: PcbToolMode;
  @Prop @Watch('onRouteResetChange') routeResetKey: number = 0;
  @Prop gridVisible: boolean = true;
  onStatusChange: (msg: string) => void = () => {};
  onDocumentChanged: () => void = () => {};
  onSelectionCleared: () => void = () => {};

  private settings: RenderingContextSettings = new RenderingContextSettings(true);
  private context: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.settings);
  private appService: AppService = AppService.getInstance();
  private pointerDown: boolean = false;
  private dragLastWorld: Point2D = { x: 0, y: 0 };
  private dragStartWorld: Point2D = { x: 0, y: 0 };
  private dragStartScreen: Point2D = { x: 0, y: 0 };
  private panning: boolean = false;
  private panLastX: number = 0;
  private panLastY: number = 0;
  private viewWidth: number = 0;
  private viewHeight: number = 0;
  private redrawScheduled: boolean = false;
  private isTouchActive: boolean = false;
  private draggingItems: boolean = false;
  private selectingRect: boolean = false;
  private selectRectStart: Point2D = { x: 0, y: 0 };
  private selectRectCurrent: Point2D = { x: 0, y: 0 };
  private pinchStartZoom: number = 0.15;
  /** Ctrl 修饰键（KeyEvent.ctrlKey 在 API 12+ 不可用，与 Index 一致用 keyCode 跟踪） */
  private modifierKeys: number = 0;
  private pinchCenterX: number = 0;
  private pinchCenterY: number = 0;
  private lastSnapPoint: Point2D | null = null;

  aboutToAppear(): void {
    EventBus.getInstance().subscribe(ModuleEvent.PCB_CHANGED, this.onPcbChanged);
    EventBus.getInstance().subscribe(ModuleEvent.VIEWPORT_CHANGED, this.onViewportChanged);
    setTimeout(() => this.scheduleRedraw(), 120);
  }

  aboutToDisappear(): void {
    EventBus.getInstance().unsubscribe(ModuleEvent.PCB_CHANGED, this.onPcbChanged);
    EventBus.getInstance().unsubscribe(ModuleEvent.VIEWPORT_CHANGED, this.onViewportChanged);
  }

  private onPcbChanged = (_p: ModuleEventPayload): void => { this.scheduleRedraw(); };
  private onViewportChanged = (_p: ModuleEventPayload): void => { this.scheduleRedraw(); };

  onCanvasVersionChange(): void { this.scheduleRedraw(); }

  onThemeRevChange(): void { this.scheduleRedraw(); }

  onRouteResetChange(): void {
    this.getEditor().cancelRoute();
    this.scheduleRedraw();
  }

  private getEditor(): PcbEditorImpl {
    return this.appService.pcbEditor as PcbEditorImpl;
  }

  private scheduleRedraw(): void {
    if (this.redrawScheduled) return;
    this.redrawScheduled = true;
    setTimeout(() => {
      this.redrawScheduled = false;
      this.drawAll();
    }, 16);
  }

  private drawAll(): void {
    const ctx = this.context;
    const editor = this.getEditor();
    const doc = editor.getDocument();
    const vp = editor.getViewport();
    ctx.clearRect(0, 0, this.viewWidth, this.viewHeight);
    ctx.fillStyle = PcbColors.CANVAS_BG;
    ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);

    if (!doc) {
      ctx.fillStyle = ProteusColors.TEXT_SECONDARY;
      ctx.font = '14px sans-serif';
      ctx.fillText('无 PCB 文档 — 使用「更新 PCB」从原理图导入', 40, 60);
      return;
    }

    // 板内阻焊层底色
    this.drawSubstrate(ctx, doc, vp);

    if (this.gridVisible && vp.gridVisible) {
      this.drawGrid(ctx, vp);
    }

    this.drawBoardOutline(ctx, doc, vp);
    const appearance = editor.getAppearance();
    if (!appearance.hideZones) {
      this.drawZones(ctx, doc, vp);
    }
    this.drawTracks(ctx, doc, vp);
    this.drawVias(ctx, doc, vp);
    this.drawFootprints(ctx, doc, vp);
    if (appearance.showRatsnest) {
      this.drawRatsnest(ctx, vp);
    }
    this.drawZonePolyPreview(ctx, vp);
    this.drawOutlinePreview(ctx, vp);
    this.drawMeasure(ctx, vp);
    if (appearance.show3d) {
      this.drawSimple3d(ctx, doc, vp);
    }

    // 走线预览（45° / L 型）
    const rs = editor.getRouteStart();
    const rp = editor.getRoutePreview();
    const ds = editor.getDiffRouteState();
    if (ds && editor.isDiffRouteActive()) {
      this.drawDiffPairPreview(ctx, vp, ds);
    } else if (rs && rp) {
      this.drawRoutePreview(ctx, vp, rs, rp);
    }

    // 框选矩形
    if (this.selectingRect) {
      this.drawSelectionRect(ctx, vp);
    }

    // 吸附指示
    if (this.lastSnapPoint) {
      const sp = this.worldToScreenPt(this.lastSnapPoint, vp);
      ctx.strokeStyle = PcbColors.SNAP;
      ctx.lineWidth = 1;
      const s = 6;
      ctx.beginPath();
      ctx.moveTo(sp.x - s, sp.y); ctx.lineTo(sp.x + s, sp.y);
      ctx.moveTo(sp.x, sp.y - s); ctx.lineTo(sp.x, sp.y + s);
      ctx.stroke();
    }
  }

  /** 板框内阻焊层填充 */
  private drawSubstrate(ctx: CanvasRenderingContext2D, doc: PcbDocument,
    vp: import('common').ViewportState): void {
    const pts = doc.boardOutline.points;
    if (pts.length < 3) return;
    ctx.fillStyle = PcbColors.SUBSTRATE;
    ctx.beginPath();
    const p0 = this.worldToScreenPt(pts[0], vp);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < pts.length; i++) {
      const p = this.worldToScreenPt(pts[i], vp);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fill();
  }

  private drawGrid(ctx: CanvasRenderingContext2D, vp: import('common').ViewportState): void {
    const doc = this.getEditor().getDocument();
    const g = doc?.metadata.gridSize ?? 50;
    const majorEvery = 10;
    const topLeft = this.getEditor().screenToWorld(0, 0);
    const bottomRight = this.getEditor().screenToWorld(this.viewWidth, this.viewHeight);
    ctx.lineWidth = 1;
    const startX = Math.floor(topLeft.x / g) * g;
    const startY = Math.floor(topLeft.y / g) * g;
    let col = 0;
    for (let x = startX; x <= bottomRight.x; x += g) {
      ctx.strokeStyle = (col % majorEvery === 0) ? PcbColors.GRID_MAJOR : PcbColors.GRID;
      const sx = x * vp.zoom + vp.panOffset.x;
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, this.viewHeight); ctx.stroke();
      col++;
    }
    let row = 0;
    for (let y = startY; y <= bottomRight.y; y += g) {
      ctx.strokeStyle = (row % majorEvery === 0) ? PcbColors.GRID_MAJOR : PcbColors.GRID;
      const sy = y * vp.zoom + vp.panOffset.y;
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(this.viewWidth, sy); ctx.stroke();
      row++;
    }
  }

  private drawBoardOutline(ctx: CanvasRenderingContext2D, doc: PcbDocument,
    vp: import('common').ViewportState): void {
    const pts = doc.boardOutline.points;
    if (pts.length < 2) return;
    ctx.strokeStyle = PcbColors.BOARD_OUTLINE;
    ctx.lineWidth = Math.max(1, doc.boardOutline.width * vp.zoom);
    ctx.beginPath();
    const p0 = this.worldToScreenPt(pts[0], vp);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < pts.length; i++) {
      const p = this.worldToScreenPt(pts[i], vp);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  private drawZones(ctx: CanvasRenderingContext2D, doc: PcbDocument,
    vp: import('common').ViewportState): void {
    const selZoneIds = new Set(this.getEditor().getSelection().zoneIds);
    for (const zone of doc.zones) {
      if (!isLayerVisible(doc, zone.layer) || zone.outline.length < 3) continue;
      const isSel = selZoneIds.has(zone.id);
      const baseColor = zone.netName.toUpperCase().includes('GND')
        ? PcbColors.ZONE_GND : PcbColors.ZONE_SIGNAL;
      ctx.fillStyle = isSel ? PcbColors.ZONE_SELECTED : baseColor;
      ctx.beginPath();
      const p0 = this.worldToScreenPt(zone.outline[0], vp);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < zone.outline.length; i++) {
        const p = this.worldToScreenPt(zone.outline[i], vp);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fill();
      if (zone.cutouts) {
        ctx.fillStyle = PcbColors.SUBSTRATE;
        for (const cut of zone.cutouts) {
          if (cut.length < 3) continue;
          ctx.beginPath();
          const c0 = this.worldToScreenPt(cut[0], vp);
          ctx.moveTo(c0.x, c0.y);
          for (let i = 1; i < cut.length; i++) {
            const cp = this.worldToScreenPt(cut[i], vp);
            ctx.lineTo(cp.x, cp.y);
          }
          ctx.closePath();
          ctx.fill();
        }
      }
      if (zone.thermalRelief) {
        ctx.fillStyle = isSel ? PcbColors.ZONE_SELECTED : baseColor;
        const tw = zone.thermalWidth;
        for (const fp of doc.footprints) {
          for (const pad of fp.pads) {
            if (pad.netId !== zone.netId) continue;
            const wx = padWorldPosition(fp, pad);
            const hw = Math.max(pad.size.x, 10) / 2;
            const hh = Math.max(pad.size.y, 10) / 2;
            const spokes: SpokeRect[] = [
              makeSpoke(wx, -hw - zone.thermalGap, 0, tw, hh * 2),
              makeSpoke(wx, hw + zone.thermalGap, 0, tw, hh * 2),
              makeSpoke(wx, 0, -hh - zone.thermalGap, hw * 2, tw),
              makeSpoke(wx, 0, hh + zone.thermalGap, hw * 2, tw)
            ];
            for (const sp of spokes) {
              const s = this.worldToScreenPt({ x: sp.x, y: sp.y }, vp);
              const w = sp.w * vp.zoom;
              const h = sp.h * vp.zoom;
              ctx.fillRect(s.x - w / 2, s.y - h / 2, w, h);
            }
          }
        }
      }
      if (isSel) {
        ctx.strokeStyle = ProteusColors.SELECTED;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < zone.outline.length; i++) {
          const p = this.worldToScreenPt(zone.outline[i], vp);
          ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
  }

  private drawTracks(ctx: CanvasRenderingContext2D, doc: PcbDocument,
    vp: import('common').ViewportState): void {
    const editor = this.getEditor();
    const appearance = editor.getAppearance();
    const active = editor.getActiveLayer();
    const hl = appearance.highlightNetId;
    const selTrkIds = new Set(editor.getSelection().trackIds);
    for (const trk of doc.tracks) {
      if (!isLayerVisible(doc, trk.layer)) continue;
      if (appearance.mode === PcbAppearanceMode.ACTIVE_ONLY && isCopperLayer(trk.layer) &&
        trk.layer !== active) {
        continue;
      }
      const selected = selTrkIds.has(trk.id);
      const netHl = hl.length > 0 && trk.netId === hl;
      const dimOther = hl.length > 0 && trk.netId !== hl;
      const dimLayer = appearance.mode === PcbAppearanceMode.DIM_INACTIVE &&
        isCopperLayer(trk.layer) && trk.layer !== active;
      let color = selected || netHl ? ProteusColors.SELECTED : getLayerColor(doc, trk.layer);
      if (dimOther || dimLayer) {
        color = this.withAlpha(color, appearance.dimAlpha);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, (trk.width + (selected || netHl ? 4 : 0)) * vp.zoom);
      ctx.lineCap = 'round';
      const s = this.worldToScreenPt(trk.start, vp);
      const e = this.worldToScreenPt(trk.end, vp);
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
    }
  }

  private drawRatsnest(ctx: CanvasRenderingContext2D, vp: import('common').ViewportState): void {
    const editor = this.getEditor();
    const edges = editor.getRatsnest();
    const appearance = editor.getAppearance();
    const hl = appearance.highlightNetId;
    const dimAlpha = appearance.dimAlpha;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    for (const e of edges) {
      const onHl = hl.length > 0 && e.netId === hl;
      const dimOther = hl.length > 0 && e.netId !== hl;
      if (dimOther && dimAlpha < 0.05) continue; // 变暗模式下极高亮外的飞线
      if (dimOther) {
        ctx.strokeStyle = this.withAlpha(ProteusColors.TEXT_SECONDARY, dimAlpha * 0.6);
      } else if (onHl) {
        ctx.strokeStyle = ProteusColors.SELECTED;
        ctx.lineWidth = 1.5;
      } else {
        ctx.strokeStyle = ProteusColors.TEXT_SECONDARY;
      }
      const a = this.worldToScreenPt(e.a, vp);
      const b = this.worldToScreenPt(e.b, vp);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    ctx.setLineDash([]);
  }

  private drawZonePolyPreview(ctx: CanvasRenderingContext2D, vp: import('common').ViewportState): void {
    const pts = this.getEditor().getZonePolyPreview();
    if (pts.length < 1) return;
    ctx.strokeStyle = PcbColors.ROUTE_PREVIEW;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    const p0 = this.worldToScreenPt(pts[0], vp);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < pts.length; i++) {
      const p = this.worldToScreenPt(pts[i], vp);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawOutlinePreview(ctx: CanvasRenderingContext2D, vp: import('common').ViewportState): void {
    const pts = this.getEditor().getOutlinePreview();
    if (pts.length < 1) return;
    ctx.strokeStyle = PcbColors.BOARD_OUTLINE;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    const p0 = this.worldToScreenPt(pts[0], vp);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < pts.length; i++) {
      const p = this.worldToScreenPt(pts[i], vp);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawMeasure(ctx: CanvasRenderingContext2D, vp: import('common').ViewportState): void {
    const pts = this.getEditor().getMeasurePoints();
    if (pts.length === 0) return;
    ctx.fillStyle = ProteusColors.SELECTED;
    for (const p of pts) {
      const s = this.worldToScreenPt(p, vp);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (pts.length === 2) {
      const a = this.worldToScreenPt(pts[0], vp);
      const b = this.worldToScreenPt(pts[1], vp);
      ctx.strokeStyle = ProteusColors.SELECTED;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const len = Math.sqrt(dx * dx + dy * dy);
      ctx.fillStyle = ProteusColors.TEXT_PRIMARY;
      ctx.font = '11px sans-serif';
      ctx.fillText(`${len.toFixed(1)} mil  (dx=${dx.toFixed(1)} dy=${dy.toFixed(1)})`,
        (a.x + b.x) / 2 + 6, (a.y + b.y) / 2 - 6);
    }
  }

  /** 等轴测 3D 视图：板厚 + 封装 3D 盒体 */
  private drawSimple3d(ctx: CanvasRenderingContext2D, doc: PcbDocument,
    vp: import('common').ViewportState): void {
    const isoAngle = 0.577; // tan(30°) ≈ 0.577
    const zScale = vp.zoom * 0.08; // 高度缩放
    let totalThick = 0;
    for (const sl of doc.layerStack.layers) { totalThick += sl.thicknessMm; }
    const boardThick = totalThick > 0 ? totalThick * 0.05 : 40;
    const boardH = boardThick * zScale;

    // 板框挤出
    const outline = doc.boardOutline.points;
    if (outline.length >= 3) {
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = PcbColors.SUBSTRATE;
      for (let i = 0; i < outline.length; i++) {
        const a = outline[i];
        const b = outline[(i + 1) % outline.length];
        const sa = this.worldToScreenPt(a, vp);
        const sb = this.worldToScreenPt(b, vp);
        // 顶面
        const saTop: Point2D = { x: sa.x + isoAngle * boardH, y: sa.y - boardH };
        const sbTop: Point2D = { x: sb.x + isoAngle * boardH, y: sb.y - boardH };
        ctx.beginPath();
        ctx.moveTo(sa.x, sa.y);
        ctx.lineTo(sb.x, sb.y);
        ctx.lineTo(sbTop.x, sbTop.y);
        ctx.lineTo(saTop.x, saTop.y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = PcbColors.BOARD_OUTLINE;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // 封装 3D 盒体
    const lib = getGlobalPcbFootprintLibrary();
    for (const fp of doc.footprints) {
      const def = lib.getDef(fp.defId);
      const hMil = def?.heightMil ?? 40;
      const h = hMil * zScale;
      const base = this.worldToScreenPt(fp.position, vp);
      const topX = base.x + isoAngle * h;
      const topY = base.y - h;

      // 底面
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#555555';
      ctx.fillRect(base.x - 12, base.y - 8, 24, 16);

      // 侧面
      ctx.strokeStyle = '#666666';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(base.x - 12, base.y - 8);
      ctx.lineTo(topX - 12, topY - 8);
      ctx.lineTo(topX + 12, topY - 8);
      ctx.lineTo(base.x + 12, base.y - 8);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(base.x + 12, base.y - 8);
      ctx.lineTo(topX + 12, topY - 8);
      ctx.lineTo(topX + 12, topY + 8);
      ctx.lineTo(base.x + 12, base.y + 8);
      ctx.closePath();
      ctx.stroke();

      // 顶面
      ctx.fillStyle = '#888888';
      ctx.fillRect(topX - 12, topY - 8, 24, 16);
      ctx.strokeStyle = '#AAAAAA';
      ctx.lineWidth = 1;
      ctx.strokeRect(topX - 12, topY - 8, 24, 16);

      // 位号标注
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `${Math.max(8, 9 * vp.zoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(fp.refDes, topX, topY - 12);
    }
    ctx.globalAlpha = 1;
  }

  private withAlpha(color: string, alpha: number): string {
    if (color.startsWith('#') && color.length === 7) {
      const a = Math.max(0, Math.min(255, Math.round(alpha * 255))).toString(16).padStart(2, '0');
      return `${color}${a}`;
    }
    return color;
  }

  private drawVias(ctx: CanvasRenderingContext2D, doc: PcbDocument,
    vp: import('common').ViewportState): void {
    const editor = this.getEditor();
    const selViaIds = new Set(editor.getSelection().viaIds);
    const appearance = editor.getAppearance();
    const hl = appearance.highlightNetId;
    const dimAlpha = appearance.dimAlpha;
    for (const via of doc.vias) {
      const p = this.worldToScreenPt(via.position, vp);
      const r = Math.max(2, via.diameter * vp.zoom / 2);
      const selected = selViaIds.has(via.id);
      const onHl = hl.length > 0 && via.netId === hl;
      const dimOther = hl.length > 0 && via.netId !== hl;
      let fillColor = selected || onHl ? ProteusColors.SELECTED : PcbColors.VIA_FILL;
      if (dimOther) fillColor = this.withAlpha(PcbColors.VIA_FILL, dimAlpha);
      ctx.fillStyle = fillColor;
      ctx.beginPath(); ctx.arc(p.x, p.y, r + (selected ? 2 : 0), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = selected ? ProteusColors.HOVER_PREVIEW
        : onHl ? ProteusColors.SELECTED : PcbColors.VIA_STROKE;
      ctx.lineWidth = selected ? 2 : 1;
      ctx.stroke();
    }
  }

  private drawFootprints(ctx: CanvasRenderingContext2D, doc: PcbDocument,
    vp: import('common').ViewportState): void {
    const editor = this.getEditor();
    const appearance = editor.getAppearance();
    const hl = appearance.highlightNetId;
    const active = editor.getActiveLayer();
    const lib = getGlobalPcbFootprintLibrary();
    const selFpIds = new Set(editor.getSelection().footprintIds);
    for (const fp of doc.footprints) {
      const onActiveLayer = fp.layer === active ||
        (fp.layer === PcbLayerId.B_CU && active === PcbLayerId.B_CU) ||
        (fp.layer === PcbLayerId.F_CU && active === PcbLayerId.F_CU);
      if (appearance.mode === PcbAppearanceMode.ACTIVE_ONLY && !onActiveLayer) continue;
      this.drawFootprint(ctx, fp, vp, lib, selFpIds.has(fp.id), hl, appearance);
    }
  }

  private drawFootprint(ctx: CanvasRenderingContext2D, fp: PcbFootprintInst,
    vp: import('common').ViewportState, lib: import('common').PcbFootprintLibrary,
    selected: boolean, hlNetId: string, appearance: PcbAppearance): void {
    const def = lib.getDef(fp.defId);
    const origin = this.worldToScreenPt(fp.position, vp);
    const hasHlNet = hlNetId.length > 0;
    const fpHasHlPad = hasHlNet && fp.pads.some(p => p.netId === hlNetId);
    const dimFp = hasHlNet && !fpHasHlPad;
    const dimAlpha = appearance.dimAlpha;

    if (selected) {
      ctx.strokeStyle = ProteusColors.SELECTED;
      ctx.lineWidth = 2;
      const bb = this.footprintScreenBBox(fp, def, vp);
      ctx.strokeRect(bb.x, bb.y, bb.w, bb.h);
    }

    if (def && isLayerVisible(this.getEditor().getDocument()!, PcbLayerId.F_SILKS)) {
      ctx.strokeStyle = dimFp ? this.withAlpha(PcbColors.SILK, dimAlpha) : PcbColors.SILK;
      ctx.lineWidth = 1;
      for (const line of def.silkLines) {
        if (line.length < 2) continue;
        ctx.beginPath();
        const p0 = this.localToScreen(line[0], fp, vp);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < line.length; i++) {
          const p = this.localToScreen(line[i], fp, vp);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
    }

    for (const pad of fp.pads) {
      const pp = this.localToScreen(pad.pos, fp, vp);
      const hw = Math.max(2, pad.size.x * vp.zoom / 2);
      const hh = Math.max(2, pad.size.y * vp.zoom / 2);
      const padOnHl = hasHlNet && pad.netId === hlNetId;
      const dimPad = hasHlNet && !padOnHl;
      if (pad.type === PcbPadType.TH) {
        ctx.fillStyle = dimPad ? this.withAlpha(PcbColors.PAD_TH, dimAlpha)
          : padOnHl ? ProteusColors.SELECTED : PcbColors.PAD_TH;
        ctx.beginPath(); ctx.arc(pp.x, pp.y, Math.max(hw, hh), 0, Math.PI * 2); ctx.fill();
        if (padOnHl) {
          ctx.strokeStyle = ProteusColors.SELECTED;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = dimPad ? this.withAlpha(PcbColors.PAD_UNCONNECTED, dimAlpha)
          : padOnHl ? ProteusColors.SELECTED
          : pad.netName ? PcbColors.PAD_SMD_NET : PcbColors.PAD_UNCONNECTED;
        ctx.fillRect(pp.x - hw, pp.y - hh, hw * 2, hh * 2);
      }
    }

    ctx.fillStyle = dimFp ? this.withAlpha(PcbColors.REFDES, dimAlpha) : PcbColors.REFDES;
    ctx.font = `${Math.max(9, 10 * vp.zoom)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(fp.refDes, origin.x, origin.y - 18 * vp.zoom);
  }

  /** 45°/L 型走线预览（含实时 DRC 违规红色提示） */
  private drawRoutePreview(ctx: CanvasRenderingContext2D,
    vp: import('common').ViewportState, start: Point2D, end: Point2D): void {
    const path = routeOrtho45Points(start, end);
    const violating = this.getEditor().isRoutePreviewViolating();
    if (violating) {
      ctx.strokeStyle = PcbColors.DRC_ERROR;
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      // 错误光晕
      ctx.shadowColor = 'rgba(255, 50, 50, 0.5)';
      ctx.shadowBlur = 8;
    } else {
      ctx.strokeStyle = PcbColors.ROUTE_PREVIEW;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
    }
    ctx.beginPath();
    const p0 = this.worldToScreenPt(path[0], vp);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < path.length; i++) {
      const p = this.worldToScreenPt(path[i], vp);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  /** 差分对走线预览 */
  private drawDiffPairPreview(ctx: CanvasRenderingContext2D,
    vp: import('common').ViewportState, ds: import('pcb_editor').DiffRouteState): void {
    const pathP: Point2D[] = [ds.startP, ds.previewP];
    const pathN: Point2D[] = [ds.startN, ds.previewN];

    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);

    // P 线 (蓝色)
    ctx.strokeStyle = '#4488FF';
    ctx.beginPath();
    for (let k = 0; k < pathP.length; k++) {
      const sp = this.worldToScreenPt(pathP[k], vp);
      if (k === 0) ctx.moveTo(sp.x, sp.y);
      else ctx.lineTo(sp.x, sp.y);
    }
    ctx.stroke();

    // N 线 (品红)
    ctx.strokeStyle = '#FF44AA';
    ctx.beginPath();
    for (let k = 0; k < pathN.length; k++) {
      const sp = this.worldToScreenPt(pathN[k], vp);
      if (k === 0) ctx.moveTo(sp.x, sp.y);
      else ctx.lineTo(sp.x, sp.y);
    }
    ctx.stroke();

    // 间隙标注
    ctx.setLineDash([2, 6]);
    ctx.strokeStyle = 'rgba(200,200,200,0.5)';
    ctx.lineWidth = 0.5;
    const midPtP: Point2D = {
      x: (ds.startP.x + ds.previewP.x) / 2,
      y: (ds.startP.y + ds.previewP.y) / 2
    };
    const midPtN: Point2D = {
      x: (ds.startN.x + ds.previewN.x) / 2,
      y: (ds.startN.y + ds.previewN.y) / 2
    };
    const midP = this.worldToScreenPt(midPtP, vp);
    const midN = this.worldToScreenPt(midPtN, vp);
    ctx.beginPath();
    ctx.moveTo(midP.x, midP.y);
    ctx.lineTo(midN.x, midN.y);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.lineWidth = 1;
  }

  private drawSelectionRect(ctx: CanvasRenderingContext2D, vp: import('common').ViewportState): void {
    const s = this.selectRectStart;
    const e = this.selectRectCurrent;
    const sx = Math.min(s.x, e.x);
    const sy = Math.min(s.y, e.y);
    const sw = Math.abs(e.x - s.x);
    const sh = Math.abs(e.y - s.y);
    ctx.strokeStyle = PcbColors.SEL_RECT;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 2]);
    ctx.strokeRect(sx, sy, sw, sh);
    ctx.fillStyle = PcbColors.SEL_RECT_FILL;
    ctx.fillRect(sx, sy, sw, sh);
    ctx.setLineDash([]);
  }

  private footprintScreenBBox(fp: PcbFootprintInst,
    def: import('common').PcbFootprintDef | null,
    vp: import('common').ViewportState): PcbScreenRect {
    let hw = 40; let hh = 30;
    if (def) {
      for (const pad of def.pads) {
        hw = Math.max(hw, Math.abs(pad.pos.x) + pad.size.x / 2);
        hh = Math.max(hh, Math.abs(pad.pos.y) + pad.size.y / 2);
      }
      if (def.courtyard.length >= 2) {
        for (const pt of def.courtyard) {
          hw = Math.max(hw, Math.abs(pt.x));
          hh = Math.max(hh, Math.abs(pt.y));
        }
      }
    }
    if (fp.rotation === 90 || fp.rotation === 270) { const t = hw; hw = hh; hh = t; }
    const origin = this.worldToScreenPt(fp.position, vp);
    const rect: PcbScreenRect = {
      x: origin.x - hw * vp.zoom,
      y: origin.y - hh * vp.zoom,
      w: hw * 2 * vp.zoom,
      h: hh * 2 * vp.zoom
    };
    return rect;
  }

  private worldToScreenPt(w: Point2D, vp: import('common').ViewportState): Point2D {
    return { x: w.x * vp.zoom + vp.panOffset.x, y: w.y * vp.zoom + vp.panOffset.y };
  }

  private localToScreen(local: Point2D, fp: PcbFootprintInst,
    vp: import('common').ViewportState): Point2D {
    let lx = local.x; let ly = local.y;
    if (fp.rotation === 90) { const t = lx; lx = -ly; ly = t; }
    else if (fp.rotation === 180) { lx = -lx; ly = -ly; }
    else if (fp.rotation === 270) { const t = lx; lx = ly; ly = -t; }
    return this.worldToScreenPt({ x: fp.position.x + lx, y: fp.position.y + ly }, vp);
  }

  build() {
    Stack() {
      Canvas(this.context)
        .width('100%')
        .height('100%')
        .backgroundColor(PcbColors.CANVAS_BG)
        .onReady(() => { this.scheduleRedraw(); })
        .onAreaChange((_old, nv) => {
          this.viewWidth = nv.width as number;
          this.viewHeight = nv.height as number;
          this.getEditor().setCanvasSize(this.viewWidth, this.viewHeight);
          this.scheduleRedraw();
        })
        .onMouse((event: MouseEvent) => {
          if (this.isTouchActive) return;
          if (event.action === MouseAction.Press) {
            const isRight = event.button === MouseButton.Right;
            const isMiddle = event.button === MouseButton.Middle;
            this.handlePointerDown(event.x, event.y, isRight, isMiddle, (this.modifierKeys & 1) !== 0);
          } else if (event.action === MouseAction.Release) {
            this.handlePointerUp(event.x, event.y);
          } else if (event.action === MouseAction.Move) {
            this.handlePointerMove(event.x, event.y);
          } else if (event.action === MouseAction.Hover) {
            this.handlePointerHover(event.x, event.y);
          }
        })
        .onAxisEvent((event: AxisEvent) => this.handleAxisZoom(event))
        .onKeyEvent((event: KeyEvent) => this.handleKeyEvent(event))
        .gesture(
          PinchGesture()
            .onActionStart((event: GestureEvent) => {
              this.pinchStartZoom = this.getEditor().getViewport().zoom;
              this.pinchCenterX = event.pinchCenterX;
              this.pinchCenterY = event.pinchCenterY;
            })
            .onActionUpdate((event: GestureEvent) => {
              const editor = this.getEditor();
              const targetZoom = this.pinchStartZoom * event.scale;
              const factor = targetZoom / editor.getViewport().zoom;
              editor.zoomAt(factor, this.pinchCenterX, this.pinchCenterY);
              this.zoomPercent = Math.round(editor.getViewport().zoom * 100);
              this.scheduleRedraw();
            })
        )
        .onTouch((event: TouchEvent) => {
          this.isTouchActive = true;
          if (event.type === TouchType.Down && event.touches.length === 1) {
            this.handlePointerDown(event.touches[0].x, event.touches[0].y, false, false, false);
          } else if (event.type === TouchType.Down && event.touches.length === 2) {
            this.panning = true;
          } else if (event.type === TouchType.Move && event.touches.length === 1) {
            this.handlePointerMove(event.touches[0].x, event.touches[0].y);
          } else if (event.type === TouchType.Up) {
            this.handlePointerUp(event.touches[0]?.x ?? 0, event.touches[0]?.y ?? 0);
            setTimeout(() => { this.isTouchActive = false; }, 300);
          }
        })
        .focusable(true)
        .defaultFocus(true)
    }
    .width('100%')
    .height('100%')
  }

  // ═══════════════════════════════════════════════════
  //  Input handling
  // ═══════════════════════════════════════════════════

  private handlePointerDown(sx: number, sy: number, rightBtn: boolean, middleBtn: boolean, ctrlKey: boolean): void {
    this.pointerDown = true;
    this.mouseX = sx; this.mouseY = sy;
    const editor = this.getEditor();
    const world = editor.screenToWorld(sx, sy);

    // 中键或右键(非走线时) → 平移
    if (middleBtn || (rightBtn && !editor.isRouteActive())) {
      this.panning = true;
      this.panLastX = sx; this.panLastY = sy;
      return;
    }

    // 右键在走线中 → 取消走线（含差分对）
    if (rightBtn) {
      if (editor.isDiffRouteActive()) {
        editor.cancelDiffRoute();
        this.pointerDown = false;
        this.scheduleRedraw();
        this.onStatusChange('差分对布线已取消');
        return;
      }
      if (editor.isRouteActive()) {
        editor.cancelRoute();
        this.pointerDown = false;
        this.scheduleRedraw();
        this.onStatusChange('走线已取消');
        return;
      }
    }

    // 右键提交多边形敷铜 / 板框
    if (rightBtn && this.toolMode === PcbToolMode.ZONE_POLY) {
      const z = editor.commitZonePoly();
      this.pointerDown = false;
      if (z) {
        this.onDocumentChanged();
        this.onStatusChange(`已创建多边形覆铜 ${z.netName}`);
      } else {
        editor.cancelZonePoly();
        this.onStatusChange('覆铜多边形已取消（至少 3 点）');
      }
      this.scheduleRedraw();
      return;
    }
    if (rightBtn && this.toolMode === PcbToolMode.OUTLINE) {
      const ok = editor.commitOutlineEdit();
      this.pointerDown = false;
      if (ok) {
        this.onDocumentChanged();
        this.onStatusChange('板框已更新');
      } else {
        editor.cancelOutlineEdit();
        this.onStatusChange('板框编辑取消（至少 3 点）');
      }
      this.scheduleRedraw();
      return;
    }

    // Ctrl+左键 → 平移
    if (ctrlKey) {
      this.panning = true;
      this.panLastX = sx; this.panLastY = sy;
      return;
    }

    // 走线模式（差分对优先）
    if (this.toolMode === PcbToolMode.ROUTE) {
      if (editor.isDiffRouteActive()) {
        const result = editor.commitDiffRoute(world);
        if (result > 0) {
          this.onDocumentChanged();
          this.onStatusChange(`差分对已布线 (${result} 段) — 继续点击绘制下一段`);
        }
      } else {
        const snapped = editor.startRoute(world);
        this.lastSnapPoint = snapped;
        this.onStatusChange('点击终点绘制走线 — 右键取消');
      }
      this.scheduleRedraw();
      return;
    }

    // 过孔模式
    if (this.toolMode === PcbToolMode.VIA) {
      const snapped = editor.snapToPadOrGrid(world);
      const net = editor.findNetAtPoint(snapped);
      editor.addVia(snapped, net?.netId, net?.netName);
      this.onDocumentChanged();
      this.onStatusChange('过孔已放置');
      this.pointerDown = false;
      this.scheduleRedraw();
      return;
    }

    // 覆铜模式（整板 GND）
    if (this.toolMode === PcbToolMode.POUR) {
      const zoneHit = editor.hitTestZone(world.x, world.y);
      const sel = editor.getSelection();
      if (zoneHit && sel.zoneIds.includes(zoneHit.id)) {
        const half = Math.max(40, (editor.getDocument()?.metadata.gridSize ?? 5) * 8);
        editor.addZoneManualCutout(zoneHit.id, world, half);
        this.onDocumentChanged();
        this.onStatusChange('已添加覆铜挖空');
      } else if (zoneHit) {
        editor.selectZone(zoneHit.id);
        this.syncSelectionFromEditor();
        this.onStatusChange(`已选覆铜 ${zoneHit.netName} — 再点击添加挖空`);
      } else {
        const added = editor.addGroundPour();
        if (added) {
          editor.selectZone(added.id);
          this.syncSelectionFromEditor();
          this.onDocumentChanged();
          this.onStatusChange(`已添加 ${added.netName} 覆铜区`);
        } else {
          this.onStatusChange('覆铜失败：需要板框与 GND 网络');
        }
      }
      this.pointerDown = false;
      this.scheduleRedraw();
      return;
    }

    // 多边形敷铜
    if (this.toolMode === PcbToolMode.ZONE_POLY) {
      if (editor.getZonePolyPreview().length === 0) {
        editor.beginZonePoly();
      }
      editor.addZonePolyPoint(world);
      this.onStatusChange(`敷铜多边形 ${editor.getZonePolyPreview().length} 点 — 双击或 Esc 结束`);
      this.pointerDown = false;
      this.scheduleRedraw();
      return;
    }

    // 板框编辑
    if (this.toolMode === PcbToolMode.OUTLINE) {
      if (editor.getOutlinePreview().length === 0) {
        editor.beginOutlineEdit();
      }
      editor.addOutlinePoint(world);
      this.onStatusChange(`板框 ${editor.getOutlinePreview().length} 点 — 右键提交`);
      this.pointerDown = false;
      this.scheduleRedraw();
      return;
    }

    // 测量
    if (this.toolMode === PcbToolMode.MEASURE) {
      const len = editor.setMeasurePoint(world);
      if (len > 0) {
        this.onStatusChange(`测量距离 ${len.toFixed(1)} mil`);
      } else {
        this.onStatusChange('测量：再点终点');
      }
      this.pointerDown = false;
      this.scheduleRedraw();
      return;
    }

    // 放置封装
    if (this.toolMode === PcbToolMode.PLACE_FP) {
      const fp = editor.placeFootprintAt(world);
      if (fp) {
        this.onDocumentChanged();
        this.onStatusChange(`已放置 ${fp.refDes}`);
      } else {
        this.onStatusChange('请先在右侧选择封装库条目');
      }
      this.pointerDown = false;
      this.scheduleRedraw();
      return;
    }

    // SELECT 模式 — 尝试命中
    const hit = editor.hitTestFootprint(world.x, world.y) ??
      (editor.hitTestVia(world.x, world.y) ? undefined : undefined);

    // 先尝试点击选择
    editor.selectAt(world.x, world.y, false);
    const sel = editor.getSelection();
    const hasSelection = sel.footprintIds.length > 0 || sel.trackIds.length > 0 ||
      sel.viaIds.length > 0 || sel.zoneIds.length > 0;

    if (hasSelection) {
      this.syncSelectionFromEditor();
      this.dragLastWorld = { x: world.x, y: world.y };
      this.dragStartWorld = { x: world.x, y: world.y };
      this.draggingItems = true;
    } else {
      // 空处：开始框选
      this.selectingRect = true;
      this.selectRectStart = { x: sx, y: sy };
      this.selectRectCurrent = { x: sx, y: sy };
      this.dragStartScreen = { x: sx, y: sy };
    }
    this.scheduleRedraw();
  }

  private handlePointerMove(sx: number, sy: number): void {
    this.mouseX = sx; this.mouseY = sy;
    const editor = this.getEditor();
    const world = editor.screenToWorld(sx, sy);
    this.worldMouseX = world.x;
    this.worldMouseY = world.y;

    // 平移
    if (this.panning && this.pointerDown) {
      editor.panBy(sx - this.panLastX, sy - this.panLastY);
      this.panLastX = sx; this.panLastY = sy;
      this.scheduleRedraw();
      return;
    }

    // 走线预览（差分对优先）
    if (this.toolMode === PcbToolMode.ROUTE) {
      if (editor.isDiffRouteActive()) {
        editor.previewDiffRoute(world);
        this.lastSnapPoint = editor.snapPoint(world);
      } else if (editor.isRouteActive()) {
        const snapped = editor.previewRoute(world);
        this.lastSnapPoint = snapped;
      }
      if (editor.isDiffRouteActive() || editor.isRouteActive()) {
        this.scheduleRedraw();
        return;
      }
    }

    // 拖拽移动
    if (this.pointerDown && this.draggingItems &&
      (this.toolMode === PcbToolMode.SELECT)) {
      const dx = world.x - this.dragLastWorld.x;
      const dy = world.y - this.dragLastWorld.y;
      if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) {
        editor.beginMoveOperation();
        editor.moveSelected(dx, dy);
        this.dragLastWorld = world;
        this.lastSnapPoint = editor.snapPoint(world);
        this.onDocumentChanged();
        this.scheduleRedraw();
      }
      return;
    }

    // 框选
    if (this.pointerDown && this.selectingRect) {
      this.selectRectCurrent = { x: sx, y: sy };
      this.scheduleRedraw();
      return;
    }
  }

  private handlePointerUp(sx: number, sy: number): void {
    const editor = this.getEditor();
    const world = editor.screenToWorld(sx, sy);

    // 走线提交（差分对优先）
    if (this.toolMode === PcbToolMode.ROUTE) {
      if (editor.isDiffRouteActive()) {
        // 差分对在 pointerDown 时提交，此处不处理
      } else if (editor.isRouteActive()) {
        const track = editor.commitRoute(world);
        if (track) {
          this.onDocumentChanged();
          this.onStatusChange('走线已添加 — 继续点击绘制下一段');
        }
      }
      this.pointerDown = false;
      this.scheduleRedraw();
      return;
    }

    // 框选完成
    if (this.selectingRect && this.pointerDown) {
      const dx = Math.abs(sx - this.dragStartScreen.x);
      const dy = Math.abs(sy - this.dragStartScreen.y);
      if (dx > 3 || dy > 3) {
        const ws = editor.screenToWorld(this.selectRectStart.x, this.selectRectStart.y);
        const we = editor.screenToWorld(sx, sy);
        editor.selectRect(ws.x, ws.y, we.x, we.y, false);
        this.syncSelectionFromEditor();
      }
      this.selectingRect = false;
    }

    // 拖拽结束 — 如果几乎没移动，保留点击选择
    if (this.draggingItems) {
      const totalDx = world.x - this.dragStartWorld.x;
      const totalDy = world.y - this.dragStartWorld.y;
      if (Math.abs(totalDx) > 10 || Math.abs(totalDy) > 10) {
        this.onDocumentChanged();
      }
      editor.endMoveOperation();
    }

    this.pointerDown = false;
    this.panning = false;
    this.draggingItems = false;
    this.lastSnapPoint = null;
    this.scheduleRedraw();
  }

  private handlePointerHover(sx: number, sy: number): void {
    if (this.pointerDown) return;
    this.mouseX = sx; this.mouseY = sy;
    const editor = this.getEditor();
    const world = editor.screenToWorld(sx, sy);
    this.worldMouseX = world.x;
    this.worldMouseY = world.y;
    editor.setHoverWorld(world);
  }

  private handleKeyEvent(event: KeyEvent): void {
    if (event.type === KeyType.Down) {
      if (event.keyCode === 2021 || event.keyCode === 2022) {
        this.modifierKeys |= 1;
        return;
      }
    }
    if (event.type === KeyType.Up) {
      if (event.keyCode === 2021 || event.keyCode === 2022) {
        this.modifierKeys &= ~1;
        return;
      }
    }
    if (event.type !== KeyType.Down) {
      return;
    }
    const ctrl = (this.modifierKeys & 1) !== 0;
    const kt = (event.keyText ?? '').toLowerCase();
    const editor = this.getEditor();

    if (ctrl) {
      if (kt === 'z') {
        editor.undo();
        this.onStatusChange('撤销');
        this.syncSelectionFromEditor();
        this.onDocumentChanged();
        this.scheduleRedraw();
        return;
      }
      if (kt === 'y') {
        editor.redo();
        this.onStatusChange('重做');
        this.syncSelectionFromEditor();
        this.onDocumentChanged();
        this.scheduleRedraw();
        return;
      }
      if (kt === 'c') {
        const ok = editor.copySelected();
        this.onStatusChange(ok ? '已复制' : '无选中对象');
        return;
      }
      if (kt === 'v') {
        const count = editor.pasteClipboard();
        this.onStatusChange(count > 0 ? `已粘贴 ${count} 个` : '剪贴板为空');
        this.onDocumentChanged();
        this.scheduleRedraw();
        return;
      }
      if (kt === 'a' && editor.getDocument()) {
        editor.selectRect(-99999, -99999, 99999, 99999, false);
        this.syncSelectionFromEditor();
        this.onStatusChange('全选');
        this.scheduleRedraw();
        return;
      }
    }

    if (kt === 'escape' || event.keyCode === 27) {
      if (editor.isDiffRouteActive()) {
        editor.cancelDiffRoute();
        this.onStatusChange('差分对布线已取消');
        this.scheduleRedraw();
        return;
      }
      if (editor.isRouteActive()) {
        editor.cancelRoute();
        this.onStatusChange('走线已取消');
        this.scheduleRedraw();
        return;
      }
      if (editor.getZonePolyPreview().length > 0) {
        editor.cancelZonePoly();
        this.onStatusChange('敷铜多边形已取消');
        this.scheduleRedraw();
        return;
      }
      if (editor.getOutlinePreview().length > 0) {
        editor.cancelOutlineEdit();
        this.onStatusChange('板框编辑已取消');
        this.scheduleRedraw();
        return;
      }
      editor.clearSelection();
      editor.clearMeasure();
      this.syncSelectionFromEditor();
      this.scheduleRedraw();
      return;
    }

    // 布线中按 V 切换到对面铜层并插过孔
    if (kt === 'v' && this.toolMode === PcbToolMode.ROUTE) {
      if (editor.isRouteActive()) {
        const cur = editor.getActiveLayer();
        const next = cur === PcbLayerId.F_CU ? PcbLayerId.B_CU : PcbLayerId.F_CU;
        editor.switchRouteLayer(next);
        this.onDocumentChanged();
        this.onStatusChange(`已换层 ${next}（自动过孔）`);
      }
      this.scheduleRedraw();
      return;
    }

    // 按 D 启动/取消差分对布线模式
    if (kt === 'd' && this.toolMode === PcbToolMode.ROUTE) {
      if (editor.isDiffRouteActive()) {
        editor.cancelDiffRoute();
        this.onStatusChange('差分对布线已取消');
      } else {
        const world = editor.screenToWorld(this.mouseX, this.mouseY);
        const result = editor.startDiffRoute(world);
        if (result) {
          this.onStatusChange('差分对布线模式 — 点击终点绘制');
        } else {
          this.onStatusChange('未检测到差分对网络');
        }
      }
      this.scheduleRedraw();
      return;
    }

    if (kt === 'delete' || event.keyCode === 46 || event.keyCode === 8) {
      editor.deleteSelected();
      this.syncSelectionFromEditor();
      this.onDocumentChanged();
      this.onStatusChange('已删除');
      this.scheduleRedraw();
      return;
    }

    if (kt === 'r') {
      editor.rotateSelected(true);
      this.syncSelectionFromEditor();
      this.onDocumentChanged();
      this.onStatusChange('已旋转');
      this.scheduleRedraw();
      return;
    }

    if (kt === 'f' && !ctrl) {
      if (editor.getSelection().footprintIds.length > 0) {
        editor.flipSelected();
        this.onDocumentChanged();
        this.onStatusChange('已镜像翻转');
        this.scheduleRedraw();
        return;
      }
      editor.fitBoardInView();
      this.zoomPercent = Math.round(editor.getViewport().zoom * 100);
      this.onStatusChange('适应窗口');
      this.scheduleRedraw();
    }
  }

  /** 滚轮：以鼠标位置为中心缩放 */
  private handleAxisZoom(event: AxisEvent): void {
    const v = event.getVerticalAxisValue();
    if (v === 0) return;
    const factor = v < 0 ? 1.12 : (1 / 1.12);
    this.getEditor().zoomAt(factor, event.x, event.y);
    this.zoomPercent = Math.round(this.getEditor().getViewport().zoom * 100);
    this.scheduleRedraw();
  }

  private syncSelectionFromEditor(): void {
    const sel = this.getEditor().getSelection();
    this.selectedFootprintId = sel.footprintIds.length > 0 ? sel.footprintIds[0] : '';
    this.selectedTrackId = sel.trackIds.length > 0 ? sel.trackIds[0] : '';
    this.selectedViaId = sel.viaIds.length > 0 ? sel.viaIds[0] : '';
    this.selectedZoneId = sel.zoneIds.length > 0 ? sel.zoneIds[0] : '';
    if (sel.footprintIds.length === 0 && sel.trackIds.length === 0 &&
      sel.viaIds.length === 0 && sel.zoneIds.length === 0) {
      this.onSelectionCleared();
    }
  }
}

// ── Helpers ──

function isLayerVisible(doc: PcbDocument, layer: PcbLayerId): boolean {
  for (const l of doc.layers) { if (l.id === layer) return l.visible; }
  return true;
}

function getLayerColor(doc: PcbDocument, layer: PcbLayerId): string {
  for (const l of doc.layers) {
    if (l.id === layer) return l.color;
  }
  return layer === PcbLayerId.B_CU ? '#3478C8' : '#C83434';
}

interface SpokeRect { x: number; y: number; w: number; h: number; }

function makeSpoke(center: Point2D, dx: number, dy: number, w: number, h: number): SpokeRect {
  return { x: center.x + dx, y: center.y + dy, w, h };
}

/** 生成 L 型走线路径点（兼容保留，优先用 routeOrtho45Points） */
function routeLPoints(a: Point2D, b: Point2D): Point2D[] {
  return routeOrtho45Points(a, b);
}
