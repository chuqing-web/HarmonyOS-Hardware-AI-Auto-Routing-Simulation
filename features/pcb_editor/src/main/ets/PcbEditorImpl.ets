/**
 * PCB 布局编辑器实现 — KiCad 式分层/走线/封装编辑（加固版）
 */
import { IPcbEditor, PcbToolMode, DiffRouteState, DiffPairPreview } from './api/IPcbEditor';
import {
  PcbDocument, PcbFootprintInst, PcbTrack, PcbVia, PcbZone, PcbLayerId, PcbPad,
  PcbDrcViolation, PcbDrcSeverity, PcbDrcRuleType, PcbNetRef, PcbPadHit,
  PcbEditorSelectionData, Point2D, ViewportState, EventBus, ModuleEvent, IdUtil,
  createDefaultPcbViewport, createEmptyPcbDocument,
  forwardAnnotatePcb, reverseAnnotatePcb, getGlobalPcbFootprintLibrary,
  autoRoutePcb, AutoRouteResult, AccessoryNetHint,
  rebuildZoneCutouts, pointInPolygon, makeRectCutout, normalizeZoneFields, defaultZoneFields,
  SchematicDocument, ApiResult, ResultHelper, ErrCode,
  normalizePcbDocument, isCopperLayer, applyCopperLayerCount, copperLayersFromStack,
  PcbSelectionState, PcbSelectionKind, PcbHistorySnapshot,
  pcbSelectionEmpty, PcbSelectionRect, padWorldPosition,
  collectFootprintPadPositions, updateTracksForFootprintTransform, padSnapTolerance,
  snapTrackEndpointsToPads, snapTrackEndpointsNearFootprints, syncMovedTrackJunctions,
  lockTrackEndpointsToPads, doglegPadToPadSelectedTracks, shoveForeignTracksByLReroute,
  TrackEndpointSnapshot,
  tracePcbAutoRoute, tracePcbManualRoute, tracePcbManualRouteReject,
  tracePcbTrackAdded, tracePcbDrc, tracePcbNetRoutingSummary,
  tracePcbUi, tracePcbOp, tracePcb3d,
  PcbAppearance, PcbAppearanceMode, defaultPcbAppearance, normalizePcbAppearance, PcbRatsnestEdge,
  PcbViaKind, PcbRouteCornerMode, rebuildPcbNets, buildRatsnest, routeByCornerMode, findNetClass,
  sumTrackLengthForNet, PcbSpatialIndex, PcbSpatialItem, PcbSpatialKind, PcbSpatialRect,
  matchDiffPairLengths, Pcb3dDisplayMode
} from 'common';

export { PcbToolMode } from './api/IPcbEditor';

const MAX_HISTORY = 80;

interface HistoryEntry {
  snapshot: PcbHistorySnapshot;
  viewport: ViewportState;
}

export class PcbEditorImpl implements IPcbEditor {
  private document: PcbDocument | null = null;
  private viewport: ViewportState = createDefaultPcbViewport();
  private activeLayer: PcbLayerId = PcbLayerId.F_CU;
  private selection: PcbSelectionState = pcbSelectionEmpty();
  private schematicProvider: (() => SchematicDocument | null) | null = null;
  private canvasViewW: number = 800;
  private canvasViewH: number = 600;
  private appearance: PcbAppearance = defaultPcbAppearance();
  private lastDrcViolations: PcbDrcViolation[] = [];
  private ratsnestCache: PcbRatsnestEdge[] = [];
  private hoverWorld: Point2D | null = null;
  private spatialIndex: PcbSpatialIndex = new PcbSpatialIndex();
  private spatialDirty: boolean = true;
  /** 进入 3D 前保存的 2D 平移，退出时恢复 */
  private savedPan2d: Point2D | null = null;

  // ── Undo/Redo ──
  private history: HistoryEntry[] = [];
  private historyIndex: number = -1;
  private historyLocked: boolean = false;

  // ── Route state ──
  private routeStartPoint: Point2D | null = null;
  private routePreviewPoint: Point2D | null = null;
  private routeViolationCount: number = 0;
  private routeCornerMode: PcbRouteCornerMode = PcbRouteCornerMode.ORTHO45;

  // ── Diff-pair route state ──
  private diffRouteActive: boolean = false;
  private diffRouteState: DiffRouteState | null = null;

  // ── Zone poly / outline / measure / place ──
  private zonePolyPoints: Point2D[] = [];
  private zonePolyNetId: string = '';
  private zonePolyNetName: string = 'GND';
  private outlineEditPoints: Point2D[] = [];
  private measurePoints: Point2D[] = [];
  private placeFpDefId: string = '';

  // ── AI / 只读锁（对标原理图 setReadOnly）──
  private readOnlyMode: boolean = false;

  // ── Clipboard ──
  private clipboard: PcbFootprintInst[] = [];

  // ── Via placement preferences ──
  private viaKind: PcbViaKind = PcbViaKind.THROUGH;
  private viaFromLayer: PcbLayerId = PcbLayerId.F_CU;
  private viaToLayer: PcbLayerId = PcbLayerId.B_CU;

  // ── Move tracking for local snap ──
  private lastMovedFootprintIds: Set<string> = new Set();

  // ═══════════════════════════════════════════════════
  //  Document / Viewport
  // ═══════════════════════════════════════════════════

  setSchematicProvider(provider: () => SchematicDocument | null): void {
    this.schematicProvider = provider;
  }

  setCanvasSize(w: number, h: number): void {
    this.canvasViewW = w;
    this.canvasViewH = h;
  }

  setReadOnly(readOnly: boolean): void {
    this.readOnlyMode = readOnly;
  }

  isReadOnly(): boolean {
    return this.readOnlyMode;
  }

  /** true = 已锁定，调用方应中止编辑 */
  private guardEdit(): boolean {
    return this.readOnlyMode;
  }

  loadDocument(doc: PcbDocument): void {
    normalizePcbDocument(doc);
    rebuildPcbNets(doc);
    this.document = doc;
    this.appearance = normalizePcbAppearance(this.appearance);
    this.selection = pcbSelectionEmpty();
    this.ratsnestCache = buildRatsnest(doc);
    this.spatialDirty = true;
    this.clearHistory();
    this.saveSnapshot();
    this.publishChanged();
  }

  getDocument(): PcbDocument | null {
    return this.document;
  }

  getViewport(): ViewportState {
    return this.viewport;
  }

  setViewport(vp: ViewportState): void {
    this.viewport = vp;
    EventBus.getInstance().publish({
      event: ModuleEvent.VIEWPORT_CHANGED,
      source: 'pcb_editor',
      timestamp: Date.now(),
      data: this.viewport
    });
  }

  panBy(dx: number, dy: number): void {
    this.viewport.panOffset.x += dx;
    this.viewport.panOffset.y += dy;
    this.setViewport(this.viewport);
  }

  zoomAt(factor: number, screenX: number, screenY: number): void {
    const oldZoom = this.viewport.zoom;
    const wx = (screenX - this.viewport.panOffset.x) / oldZoom;
    const wy = (screenY - this.viewport.panOffset.y) / oldZoom;
    const newZoom = Math.max(0.02, Math.min(5, oldZoom * factor));
    this.viewport.zoom = newZoom;
    this.viewport.panOffset.x = screenX - wx * newZoom;
    this.viewport.panOffset.y = screenY - wy * newZoom;
    this.setViewport(this.viewport);
  }

  fitBoardInView(viewW?: number, viewH?: number): void {
    const vw = viewW !== undefined && viewW > 0 ? viewW : this.canvasViewW;
    const vh = viewH !== undefined && viewH > 0 ? viewH : this.canvasViewH;
    if (!this.document) return;
    let minX = Infinity; let minY = Infinity;
    let maxX = -Infinity; let maxY = -Infinity;
    for (const p of this.document.boardOutline.points) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
    for (const fp of this.document.footprints) {
      minX = Math.min(minX, fp.position.x - 100);
      minY = Math.min(minY, fp.position.y - 100);
      maxX = Math.max(maxX, fp.position.x + 100);
      maxY = Math.max(maxY, fp.position.y + 100);
    }
    if (!isFinite(minX) || maxX <= minX || maxY <= minY) return;
    const bw = maxX - minX;
    const bh = maxY - minY;
    const margin = 60;
    const zx = (vw - margin * 2) / bw;
    const zy = (vh - margin * 2) / bh;
    this.viewport.zoom = Math.min(zx, zy, 1);
    this.viewport.panOffset.x = margin - minX * this.viewport.zoom;
    this.viewport.panOffset.y = margin - minY * this.viewport.zoom;
    this.setViewport(this.viewport);
  }

  getActiveLayer(): PcbLayerId {
    return this.activeLayer;
  }

  setActiveLayer(layer: PcbLayerId): void {
    const prev = this.activeLayer;
    this.activeLayer = layer;
    if (prev !== layer) {
      tracePcbUi('ACTIVE_LAYER', `${prev} → ${layer}`);
    }
  }

  setLayerVisible(layer: PcbLayerId, visible: boolean): void {
    if (!this.document) return;
    for (const l of this.document.layers) {
      if (l.id === layer) { l.visible = visible; break; }
    }
    tracePcbUi('LAYER_VISIBLE', `${layer}=${visible}`);
    this.publishChanged();
  }

  setLayerOpacity(layer: PcbLayerId, opacity: number): void {
    if (!this.document) return;
    const o = Math.max(0.05, Math.min(1, opacity));
    for (const l of this.document.layers) {
      if (l.id === layer) { l.opacity = o; break; }
    }
    tracePcbUi('LAYER_OPACITY', `${layer}=${o.toFixed(2)}`);
    this.publishChanged();
  }

  /** 单层预览：仅激活铜层可见，其余铜层隐藏 */
  setSoloCopperLayer(solo: boolean): void {
    if (!this.document) return;
    const active = this.activeLayer;
    for (const l of this.document.layers) {
      if (!isCopperLayer(l.id)) continue;
      if (solo) {
        l.visible = l.id === active;
      } else {
        l.visible = true;
      }
    }
    if (solo) {
      this.appearance.mode = PcbAppearanceMode.ACTIVE_ONLY;
    } else {
      this.appearance.mode = PcbAppearanceMode.OVERLAY;
    }
    tracePcbUi('SOLO_COPPER', `${solo} active=${active}`);
    this.publishChanged();
  }

  getAppearance(): PcbAppearance {
    return this.appearance;
  }

  setAppearanceMode(mode: PcbAppearanceMode): void {
    this.appearance.mode = mode;
    tracePcbUi('APPEARANCE_MODE', `${mode}`);
    this.publishChanged();
  }

  setHighlightNet(netId: string): void {
    this.appearance.highlightNetId = netId ?? '';
    tracePcbUi('HIGHLIGHT_NET', this.appearance.highlightNetId.length > 0
      ? this.appearance.highlightNetId : '(cleared)');
    this.publishChanged();
  }

  clearHighlightNet(): void {
    this.appearance.highlightNetId = '';
    tracePcbUi('HIGHLIGHT_NET', '(cleared)');
    this.publishChanged();
  }

  setHideZones(hide: boolean): void {
    this.appearance.hideZones = hide;
    tracePcbUi('HIDE_ZONES', `${hide}`);
    this.publishChanged();
  }

  setShowRatsnest(show: boolean): void {
    this.appearance.showRatsnest = show;
    tracePcbUi('RATSNEST', `${show}`);
    this.publishChanged();
  }

  setShow3d(show: boolean): void {
    if (show && !this.appearance.show3d) {
      this.savedPan2d = { x: this.viewport.panOffset.x, y: this.viewport.panOffset.y };
      this.appearance = normalizePcbAppearance(this.appearance);
      this.normalizeView3dAngles();
      this.viewport.panOffset = { x: 0, y: 0 };
      this.setViewport(this.viewport);
    } else if (!show && this.appearance.show3d && this.savedPan2d !== null) {
      this.viewport.panOffset = { x: this.savedPan2d.x, y: this.savedPan2d.y };
      this.savedPan2d = null;
      this.setViewport(this.viewport);
    }
    this.appearance.show3d = show;
    if (show) {
      this.normalizeView3dAngles();
    }
    tracePcb3d(show ? 'ENTER' : 'EXIT',
      `yaw=${this.appearance.view3dYawDeg.toFixed(1)} pitch=${this.appearance.view3dPitchDeg.toFixed(1)}`);
    this.publishChanged();
  }

  orbit3d(deltaYawDeg: number, deltaPitchDeg: number): void {
    this.normalizeView3dAngles();
    this.appearance.view3dYawDeg =
      (this.appearance.view3dYawDeg + deltaYawDeg) % 360;
    if (this.appearance.view3dYawDeg < 0) {
      this.appearance.view3dYawDeg += 360;
    }
    let pitch = this.appearance.view3dPitchDeg + deltaPitchDeg;
    if (pitch < 12) {
      pitch = 12;
    } else if (pitch > 82) {
      pitch = 82;
    }
    this.appearance.view3dPitchDeg = pitch;
    this.publishChanged();
  }

  resetView3d(): void {
    this.appearance.view3dYawDeg = 38;
    this.appearance.view3dPitchDeg = 52;
    this.appearance.view3dOrtho = true;
    tracePcb3d('RESET_VIEW', 'yaw=38 pitch=52 ortho=1');
    this.publishChanged();
  }

  setView3dOrtho(ortho: boolean): void {
    this.appearance.view3dOrtho = ortho;
    tracePcb3d('ORTHO', `${ortho}`);
    this.publishChanged();
  }

  setView3dPreset(preset: string): void {
    const p = (preset ?? '').toLowerCase();
    if (p === 'top') {
      this.appearance.view3dYawDeg = 0;
      this.appearance.view3dPitchDeg = 88;
    } else if (p === 'bottom') {
      this.appearance.view3dYawDeg = 180;
      this.appearance.view3dPitchDeg = 88;
    } else if (p === 'front') {
      this.appearance.view3dYawDeg = 0;
      this.appearance.view3dPitchDeg = 12;
    } else if (p === 'left') {
      this.appearance.view3dYawDeg = 90;
      this.appearance.view3dPitchDeg = 12;
    } else if (p === 'right') {
      this.appearance.view3dYawDeg = 270;
      this.appearance.view3dPitchDeg = 12;
    } else {
      // iso：等轴约 52°，避免顶视 88° 看不出板厚
      this.appearance.view3dYawDeg = 38;
      this.appearance.view3dPitchDeg = 52;
    }
    this.normalizeView3dAngles();
    tracePcb3d('PRESET', p.length > 0 ? p : 'iso');
    this.publishChanged();
  }

  setView3dDisplayMode(mode: Pcb3dDisplayMode): void {
    this.appearance.view3dDisplayMode = mode;
    tracePcb3d('DISPLAY_MODE', `${mode}`);
    this.publishChanged();
  }

  setView3dCutFraction(fraction: number): void {
    let f = fraction;
    if (!(f >= 0 && f <= 1)) f = 0.55;
    this.appearance.view3dCutFraction = Math.max(0.05, Math.min(0.95, f));
    tracePcb3d('CUT_FRAC', `${this.appearance.view3dCutFraction}`);
    this.publishChanged();
  }

  setView3dMeasure(active: boolean): void {
    this.appearance.view3dMeasure = active;
    tracePcb3d('MEASURE', `${active}`);
    this.publishChanged();
  }

  setView3dShowInterference(show: boolean): void {
    this.appearance.view3dShowInterference = show;
    tracePcb3d('INTERFERENCE', `${show}`);
    this.publishChanged();
  }

  setView3dPbr(enabled: boolean): void {
    this.appearance.view3dPbr = enabled;
    tracePcb3d('PBR', `${enabled}`);
    this.publishChanged();
  }

  setView3dMsaa(samples: number): void {
    this.appearance.view3dMsaa = samples >= 4 ? 4 : 1;
    tracePcb3d('MSAA', `${this.appearance.view3dMsaa}`);
    this.publishChanged();
  }

  setShowPadNumbers(show: boolean): void {
    this.appearance.showPadNumbers = show;
    tracePcbUi('PAD_NUMBERS', `${show}`);
    this.publishChanged();
  }

  private normalizeView3dAngles(): void {
    let yaw = this.appearance.view3dYawDeg;
    let pitch = this.appearance.view3dPitchDeg;
    if (!(yaw >= -10000 && yaw <= 10000)) {
      yaw = 35;
    }
    if (!(pitch >= 12 && pitch <= 88)) {
      pitch = 55;
    }
    this.appearance.view3dYawDeg = yaw;
    this.appearance.view3dPitchDeg = pitch;
  }

  getViaKind(): PcbViaKind {
    return this.viaKind;
  }

  setViaKind(kind: PcbViaKind): void {
    this.viaKind = kind;
    this.publishChanged();
  }

  getRouteCornerMode(): PcbRouteCornerMode {
    return this.routeCornerMode;
  }

  setRouteCornerMode(mode: PcbRouteCornerMode): void {
    this.routeCornerMode = mode;
    tracePcbUi('ROUTE_CORNER', `${mode}`);
    this.publishChanged();
  }

  getViaSpan(): PcbLayerId[] {
    return [this.viaFromLayer, this.viaToLayer];
  }

  setViaSpan(from: PcbLayerId, to: PcbLayerId): void {
    this.viaFromLayer = from;
    this.viaToLayer = to;
    if (from !== to) {
      this.viaKind = (from === PcbLayerId.F_CU || to === PcbLayerId.B_CU ||
        from === PcbLayerId.B_CU || to === PcbLayerId.F_CU)
        ? PcbViaKind.BLIND : PcbViaKind.BURIED;
      const copper = this.document ? copperLayersFromStack(this.document.layerStack) : [];
      if (copper.length >= 2 &&
        ((from === copper[0] && to === copper[copper.length - 1]) ||
          (to === copper[0] && from === copper[copper.length - 1]))) {
        this.viaKind = PcbViaKind.THROUGH;
      }
    } else {
      this.viaKind = PcbViaKind.THROUGH;
    }
    this.publishChanged();
  }

  getLayerStackCopperCount(): number {
    return this.document?.layerStack.copperCount ?? 2;
  }

  getRatsnest(): PcbRatsnestEdge[] {
    return this.ratsnestCache;
  }

  rebuildNets(): void {
    if (!this.document) return;
    rebuildPcbNets(this.document);
    this.ratsnestCache = buildRatsnest(this.document);
    this.publishChanged();
  }

  setCopperLayerCount(count: number): boolean {
    if (!this.document) return false;
    if (count !== 2 && count !== 4 && count !== 6 && count !== 8) return false;
    this.saveSnapshot();
    applyCopperLayerCount(this.document, count);
    if (!isCopperLayer(this.activeLayer)) {
      this.activeLayer = PcbLayerId.F_CU;
    }
    // 多层默认变暗非活动层，便于按层编辑
    if (count > 2 && this.appearance.mode === PcbAppearanceMode.OVERLAY) {
      this.appearance.mode = PcbAppearanceMode.DIM_INACTIVE;
    }
    const copper = copperLayersFromStack(this.document.layerStack);
    if (copper.length >= 2) {
      this.viaFromLayer = copper[0];
      this.viaToLayer = copper[copper.length - 1];
      this.viaKind = PcbViaKind.THROUGH;
    }
    this.touchModified();
    this.publishChanged();
    return true;
  }

  setHoverWorld(world: Point2D | null): void {
    this.hoverWorld = world;
  }

  getHoverNetName(): string {
    if (!this.hoverWorld) return '';
    const net = this.findNetAtPoint(this.hoverWorld);
    return net?.netName ?? '';
  }

  // ═══════════════════════════════════════════════════
  //  Selection
  // ═══════════════════════════════════════════════════

  getSelection(): PcbSelectionState {
    return this.selection;
  }

  /** 点击世界坐标 (x,y)，支持 additive (Shift) */
  selectAt(worldX: number, worldY: number, additive: boolean): void {
    if (!this.document) {
      this.clearSelection();
      return;
    }

    // 命中测试优先级: 过孔 > 走线 > 覆铜 > 封装
    const via = this.hitTestVia(worldX, worldY);
    if (via) {
      if (additive) {
        if (!this.selection.viaIds.includes(via.id)) {
          this.selection.viaIds.push(via.id);
        }
        this.selection.kind = PcbSelectionKind.MULTI;
      } else {
        this.selection = {
          kind: PcbSelectionKind.VIA,
          footprintIds: [], trackIds: [],
          viaIds: [via.id], zoneIds: []
        };
        if (via.netId.length > 0) {
          this.appearance.highlightNetId = via.netId;
        }
      }
      this.publishSelection();
      this.publishChanged();
      return;
    }

    const track = this.hitTestTrack(worldX, worldY);
    if (track) {
      if (additive) {
        if (!this.selection.trackIds.includes(track.id)) {
          this.selection.trackIds.push(track.id);
        }
        this.selection.kind = PcbSelectionKind.MULTI;
      } else {
        this.selection = {
          kind: PcbSelectionKind.TRACK,
          footprintIds: [], trackIds: [track.id],
          viaIds: [], zoneIds: []
        };
        if (track.netId.length > 0) {
          this.appearance.highlightNetId = track.netId;
        }
      }
      this.publishSelection();
      this.publishChanged();
      return;
    }

    const zone = this.hitTestZone(worldX, worldY);
    if (zone) {
      if (additive) {
        if (!this.selection.zoneIds.includes(zone.id)) {
          this.selection.zoneIds.push(zone.id);
        }
        this.selection.kind = PcbSelectionKind.MULTI;
      } else {
        this.selection = {
          kind: PcbSelectionKind.ZONE,
          footprintIds: [], trackIds: [],
          viaIds: [], zoneIds: [zone.id]
        };
        if (zone.netId.length > 0) {
          this.appearance.highlightNetId = zone.netId;
        }
      }
      this.publishSelection();
      this.publishChanged();
      return;
    }

    const fp = this.hitTestFootprint(worldX, worldY);
    if (fp) {
      if (additive) {
        if (!this.selection.footprintIds.includes(fp.id)) {
          this.selection.footprintIds.push(fp.id);
        }
        this.selection.kind = PcbSelectionKind.MULTI;
      } else {
        this.selection = {
          kind: PcbSelectionKind.FOOTPRINT,
          footprintIds: [fp.id], trackIds: [],
          viaIds: [], zoneIds: []
        };
        // 点选封装时按最近焊盘高亮网络（白皮书 5.1）
        let bestNet = '';
        let bestD = Number.POSITIVE_INFINITY;
        for (let pi = 0; pi < fp.pads.length; pi++) {
          const pad = fp.pads[pi];
          if (!pad.netId || pad.netId.length === 0) continue;
          const w = padWorldPosition(fp, pad);
          const dx = w.x - worldX;
          const dy = w.y - worldY;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            bestNet = pad.netId;
          }
        }
        if (bestNet.length > 0) {
          this.appearance.highlightNetId = bestNet;
        }
      }
      this.publishSelection();
      this.publishChanged();
      return;
    }

    if (!additive) {
      this.clearSelection();
    }
  }

  selectRect(x1: number, y1: number, x2: number, y2: number, additive: boolean): void {
    if (!this.document) return;
    const rx1 = Math.min(x1, x2);
    const ry1 = Math.min(y1, y2);
    const rx2 = Math.max(x1, x2);
    const ry2 = Math.max(y1, y2);

    const fpIds: string[] = [];
    const trkIds: string[] = [];
    const viaIds: string[] = [];
    const zoneIds: string[] = [];

    for (const fp of this.document.footprints) {
      const bb = this.footprintBoundingBox(fp);
      if (bb.x1 <= rx2 && bb.x2 >= rx1 && bb.y1 <= ry2 && bb.y2 >= ry1) {
        fpIds.push(fp.id);
      }
    }
    for (const trk of this.document.tracks) {
      if (!isLayerVisible(this.document!, trk.layer)) continue;
      if (segmentIntersectsRect(trk.start, trk.end, rx1, ry1, rx2, ry2)) {
        trkIds.push(trk.id);
      }
    }
    for (const via of this.document.vias) {
      if (via.position.x >= rx1 && via.position.x <= rx2 &&
        via.position.y >= ry1 && via.position.y <= ry2) {
        viaIds.push(via.id);
      }
    }
    for (const zone of this.document.zones) {
      if (!isLayerVisible(this.document!, zone.layer) || zone.outline.length < 3) continue;
      let zx1 = Infinity; let zy1 = Infinity; let zx2 = -Infinity; let zy2 = -Infinity;
      for (const p of zone.outline) {
        zx1 = Math.min(zx1, p.x); zy1 = Math.min(zy1, p.y);
        zx2 = Math.max(zx2, p.x); zy2 = Math.max(zy2, p.y);
      }
      if (zx1 <= rx2 && zx2 >= rx1 && zy1 <= ry2 && zy2 >= ry1) {
        zoneIds.push(zone.id);
      }
    }

    if (additive) {
      for (const id of fpIds) { if (!this.selection.footprintIds.includes(id)) this.selection.footprintIds.push(id); }
      for (const id of trkIds) { if (!this.selection.trackIds.includes(id)) this.selection.trackIds.push(id); }
      for (const id of viaIds) { if (!this.selection.viaIds.includes(id)) this.selection.viaIds.push(id); }
      for (const id of zoneIds) { if (!this.selection.zoneIds.includes(id)) this.selection.zoneIds.push(id); }
    } else {
      this.selection.footprintIds = fpIds;
      this.selection.trackIds = trkIds;
      this.selection.viaIds = viaIds;
      this.selection.zoneIds = zoneIds;
    }

    const total = this.selection.footprintIds.length + this.selection.trackIds.length +
      this.selection.viaIds.length + this.selection.zoneIds.length;
    if (total === 0) this.selection.kind = PcbSelectionKind.NONE;
    else if (total === 1) {
      if (this.selection.footprintIds.length === 1) this.selection.kind = PcbSelectionKind.FOOTPRINT;
      else if (this.selection.trackIds.length === 1) this.selection.kind = PcbSelectionKind.TRACK;
      else if (this.selection.viaIds.length === 1) this.selection.kind = PcbSelectionKind.VIA;
      else this.selection.kind = PcbSelectionKind.ZONE;
    } else {
      this.selection.kind = PcbSelectionKind.MULTI;
    }
    // 框选单一走线/过孔/覆铜时同步网络高亮
    if (total === 1) {
      if (this.selection.trackIds.length === 1) {
        for (let i = 0; i < this.document.tracks.length; i++) {
          if (this.document.tracks[i].id === this.selection.trackIds[0]) {
            this.appearance.highlightNetId = this.document.tracks[i].netId ?? '';
            break;
          }
        }
      } else if (this.selection.viaIds.length === 1) {
        for (let i = 0; i < this.document.vias.length; i++) {
          if (this.document.vias[i].id === this.selection.viaIds[0]) {
            this.appearance.highlightNetId = this.document.vias[i].netId ?? '';
            break;
          }
        }
      } else if (this.selection.zoneIds.length === 1) {
        for (let i = 0; i < this.document.zones.length; i++) {
          if (this.document.zones[i].id === this.selection.zoneIds[0]) {
            this.appearance.highlightNetId = this.document.zones[i].netId ?? '';
            break;
          }
        }
      }
    }
    this.publishSelection();
  }

  clearSelection(): void {
    this.selection = pcbSelectionEmpty();
    this.appearance.highlightNetId = '';
    this.publishSelection();
    this.publishChanged();
  }

  // ── Legacy selection helpers (keep PcbPage compatibility) ──

  getSelectedIds(): string[] { return [...this.selection.footprintIds]; }
  getSelectedTrackIds(): string[] { return [...this.selection.trackIds]; }
  getSelectedViaIds(): string[] { return [...this.selection.viaIds]; }
  getSelectedZoneIds(): string[] { return [...this.selection.zoneIds]; }

  selectFootprint(id: string, additive: boolean = false): void {
    if (!additive) this.selection = pcbSelectionEmpty();
    if (!this.selection.footprintIds.includes(id)) this.selection.footprintIds.push(id);
    this.selection.kind = this.selection.footprintIds.length === 1 ? PcbSelectionKind.FOOTPRINT : PcbSelectionKind.MULTI;
    this.publishSelection();
  }

  selectTrack(id: string): void {
    this.selection = { kind: PcbSelectionKind.TRACK, footprintIds: [], trackIds: [id], viaIds: [], zoneIds: [] };
    if (this.document) {
      for (let i = 0; i < this.document.tracks.length; i++) {
        if (this.document.tracks[i].id === id) {
          const nid = this.document.tracks[i].netId;
          if (nid !== undefined && nid.length > 0) {
            this.appearance.highlightNetId = nid;
          }
          break;
        }
      }
    }
    this.publishSelection();
  }

  selectVia(id: string): void {
    this.selection = { kind: PcbSelectionKind.VIA, footprintIds: [], trackIds: [], viaIds: [id], zoneIds: [] };
    if (this.document) {
      for (let i = 0; i < this.document.vias.length; i++) {
        if (this.document.vias[i].id === id) {
          if (this.document.vias[i].netId.length > 0) {
            this.appearance.highlightNetId = this.document.vias[i].netId;
          }
          break;
        }
      }
    }
    this.publishSelection();
  }

  selectZone(id: string): void {
    this.selection = { kind: PcbSelectionKind.ZONE, footprintIds: [], trackIds: [], viaIds: [], zoneIds: [id] };
    if (this.document) {
      for (let i = 0; i < this.document.zones.length; i++) {
        if (this.document.zones[i].id === id) {
          if (this.document.zones[i].netId.length > 0) {
            this.appearance.highlightNetId = this.document.zones[i].netId;
          }
          break;
        }
      }
    }
    this.publishSelection();
  }

  // ═══════════════════════════════════════════════════
  //  Move / Rotate
  // ═══════════════════════════════════════════════════

  // ── Move transaction (undo + zone rebuild) ──
  private moveInProgress: boolean = false;

  beginMoveOperation(): void {
    if (this.guardEdit()) {
      return;
    }
    if (!this.moveInProgress) {
      this.saveSnapshot();
      this.moveInProgress = true;
    }
  }

  endMoveOperation(): void {
    if (!this.moveInProgress || !this.document) {
      this.moveInProgress = false;
      return;
    }
    this.moveInProgress = false;

    // 仅校正刚移动封装附近的同网端点，禁止全局乱吸附
    if (this.lastMovedFootprintIds.size > 0) {
      snapTrackEndpointsNearFootprints(this.document, this.lastMovedFootprintIds);
      this.lastMovedFootprintIds.clear();
    }

    for (const z of this.document.zones) {
      rebuildZoneCutouts(z, this.document);
    }
    this.touchModified();
    this.refreshConnectivity();
    this.publishChanged();
  }

  /** 移动所有被选中对象（封装 + 走线端点 + 过孔），未选中的走线端点跟随焊盘并传播折点 */
  moveSelected(dx: number, dy: number): void {
    if (this.guardEdit()) {
      return;
    }
    if (!this.document) return;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;

    const fpSet = new Set(this.selection.footprintIds);
    const trkSet = new Set(this.selection.trackIds);
    const viaSet = new Set(this.selection.viaIds);
    const movingFootprints = fpSet.size > 0;

    const oldPadPositions: Map<string, Point2D> = new Map();
    for (const fp of this.document.footprints) {
      if (fpSet.has(fp.id) && !fp.locked) {
        const pads = collectFootprintPadPositions(fp);
        pads.forEach((pos: Point2D, key: string) => {
          oldPadPositions.set(key, { x: pos.x, y: pos.y });
        });
      }
    }

    const trackSnapshots: TrackEndpointSnapshot[] = [];
    let padLockedEnds: Set<string> = new Set();
    let dogleggedIds: Set<string> = new Set();
    if (!movingFootprints && trkSet.size > 0) {
      // 焊盘端钉住；两端都在焊盘则 U 折，便于推挤
      padLockedEnds = lockTrackEndpointsToPads(this.document, trkSet);
      dogleggedIds = doglegPadToPadSelectedTracks(
        this.document, trkSet, padLockedEnds, dx, dy);
      if (dogleggedIds.size > 0) {
        padLockedEnds = lockTrackEndpointsToPads(this.document, trkSet);
      }
      for (const trk of this.document.tracks) {
        if (trkSet.has(trk.id)) {
          trackSnapshots.push({
            trackId: trk.id, isStart: true,
            pos: { x: trk.start.x, y: trk.start.y }, netId: trk.netId
          });
          trackSnapshots.push({
            trackId: trk.id, isStart: false,
            pos: { x: trk.end.x, y: trk.end.y }, netId: trk.netId
          });
        }
      }
    }

    for (const fp of this.document.footprints) {
      if (fpSet.has(fp.id) && !fp.locked) {
        fp.position.x += dx;
        fp.position.y += dy;
      }
    }
    if (!movingFootprints) {
      for (const trk of this.document.tracks) {
        if (!trkSet.has(trk.id)) {
          continue;
        }
        // 本帧已 dogleg 平移过中间段，避免重复叠加
        if (dogleggedIds.has(trk.id)) {
          continue;
        }
        // 焊盘端钉住；自由端可拖（异网冲突稍后 L 重布绕开）
        if (!padLockedEnds.has(`${trk.id}|S`)) {
          trk.start.x += dx;
          trk.start.y += dy;
        }
        if (!padLockedEnds.has(`${trk.id}|E`)) {
          trk.end.x += dx;
          trk.end.y += dy;
        }
      }
    }
    for (const via of this.document.vias) {
      if (viaSet.has(via.id)) {
        via.position.x += dx;
        via.position.y += dy;
      }
    }

    if (oldPadPositions.size > 0) {
      updateTracksForFootprintTransform(this.document, fpSet, oldPadPositions);
      this.lastMovedFootprintIds = new Set(fpSet);
    }

    if (trackSnapshots.length > 0) {
      syncMovedTrackJunctions(this.document, trkSet, trackSnapshots);
    }

    if (!movingFootprints && trkSet.size > 0) {
      shoveForeignTracksByLReroute(this.document, trkSet);
    }

    this.touchModified();
    this.publishChanged();
  }

  moveSelectedFootprints(dx: number, dy: number): void {
    this.moveSelected(dx, dy);
  }

  rotateSelected(clockwise: boolean = true): void {
    if (this.guardEdit()) {
      return;
    }
    if (!this.document) return;
    this.saveSnapshot();
    const delta = clockwise ? 90 : 270;
    const fpSet = new Set(this.selection.footprintIds);
    const oldPadPositions: Map<string, Point2D> = new Map();
    for (const fp of this.document.footprints) {
      if (fpSet.has(fp.id) && !fp.locked) {
        const pads = collectFootprintPadPositions(fp);
        pads.forEach((pos: Point2D, key: string) => {
          oldPadPositions.set(key, { x: pos.x, y: pos.y });
        });
      }
    }
    for (const fp of this.document.footprints) {
      if (fpSet.has(fp.id) && !fp.locked) {
        fp.rotation = ((fp.rotation + delta) % 360) as 0 | 90 | 180 | 270;
      }
    }
    if (oldPadPositions.size > 0) {
      updateTracksForFootprintTransform(this.document, fpSet, oldPadPositions);
      snapTrackEndpointsNearFootprints(this.document, fpSet);
    }
    for (const z of this.document.zones) {
      rebuildZoneCutouts(z, this.document);
    }
    this.touchModified();
    this.refreshConnectivity();
    this.publishChanged();
  }

  // ═══════════════════════════════════════════════════
  //  Routing
  // ═══════════════════════════════════════════════════

  isRouteActive(): boolean {
    return this.routeStartPoint !== null;
  }

  startRoute(point: Point2D): Point2D {
    this.cancelDiffRoute();
    const snapped = this.snapToPadOrGrid(point);
    this.routeStartPoint = snapped;
    this.routePreviewPoint = snapped;
    const net = this.findNetAtPoint(snapped);
    tracePcbManualRoute('START',
      `(${Math.round(snapped.x)},${Math.round(snapped.y)}) net=${net?.netName ?? net?.netId ?? '(none)'}`);
    return snapped;
  }

  previewRoute(point: Point2D): Point2D {
    this.routePreviewPoint = this.snapToPadOrGrid(point);
    if (this.routeStartPoint && this.document) {
      const path = routeByCornerMode(this.routeStartPoint, this.routePreviewPoint, this.routeCornerMode);
      this.routeViolationCount = this.checkPathClearance(path);
    }
    return this.routePreviewPoint;
  }

  commitRoute(end: Point2D): PcbTrack | null {
    if (!this.routeStartPoint) return null;
    const snappedEnd = this.snapToPadOrGrid(end);
    const dx = snappedEnd.x - this.routeStartPoint.x;
    const dy = snappedEnd.y - this.routeStartPoint.y;
    if (Math.sqrt(dx * dx + dy * dy) < 0.5) {
      this.routePreviewPoint = snappedEnd;
      return null;
    }

    const startNet = this.findNetAtPoint(this.routeStartPoint);
    const endNet = this.findNetAtPoint(snappedEnd);
    if (startNet && endNet && startNet.netId.length > 0 && endNet.netId.length > 0 &&
      startNet.netId !== endNet.netId) {
      tracePcbManualRouteReject('跨网络', startNet.netName, endNet.netName);
      this.routePreviewPoint = snappedEnd;
      return null;
    }

    const netId = startNet?.netId ?? endNet?.netId ?? '';
    const netName = startNet?.netName ?? endNet?.netName ?? '';
    const path = routeByCornerMode(this.routeStartPoint, snappedEnd, this.routeCornerMode);

    // 提交前最后一次实时 DRC 检查 — 违规则拒绝写入
    const violations = this.checkPathClearance(path);
    if (violations > 0) {
      tracePcbManualRouteReject('实时DRC',
        `路径存在 ${violations} 处违规`, `${violations} violations`);
      this.routePreviewPoint = snappedEnd;
      this.routeViolationCount = violations;
      return null;
    }

    let lastTrack: PcbTrack | null = null;
    for (let i = 0; i < path.length - 1; i++) {
      const seg = this.addTrack(path[i], path[i + 1], netId, netName, i > 0);
      if (seg) {
        lastTrack = seg;
        tracePcbTrackAdded(seg);
      }
    }

    if (lastTrack) {
      this.routeStartPoint = snappedEnd;
      this.routePreviewPoint = snappedEnd;
      this.routeViolationCount = 0;
      this.refreshConnectivity();
    }
    return lastTrack;
  }

  /** 布线中切换铜层：当前位置按当前过孔偏好插过孔 */
  switchRouteLayer(layer: PcbLayerId): PcbVia | null {
    if (!isCopperLayer(layer)) return null;
    if (layer === this.activeLayer) return null;
    const pos = this.routeStartPoint ?? this.routePreviewPoint;
    let via: PcbVia | null = null;
    if (pos) {
      const net = this.findNetAtPoint(pos);
      const from = this.activeLayer;
      via = this.addVia(pos, net?.netId, net?.netName, this.viaKindForSpan(from, layer),
        from, layer);
    }
    this.activeLayer = layer;
    this.publishChanged();
    return via;
  }

  private viaKindForSpan(from: PcbLayerId, to: PcbLayerId): PcbViaKind {
    if (!this.document) return PcbViaKind.THROUGH;
    const copper = copperLayersFromStack(this.document.layerStack);
    if (copper.length < 2) return PcbViaKind.THROUGH;
    const first = copper[0];
    const last = copper[copper.length - 1];
    if ((from === first && to === last) || (from === last && to === first)) {
      return PcbViaKind.THROUGH;
    }
    if (from === first || from === last || to === first || to === last) {
      return PcbViaKind.BLIND;
    }
    return PcbViaKind.BURIED;
  }

  cancelRoute(): void {
    if (this.routeStartPoint !== null) {
      tracePcbManualRoute('CANCEL', '走线已取消');
    }
    this.routeStartPoint = null;
    this.routePreviewPoint = null;
    this.routeViolationCount = 0;
  }

  getRouteStart(): Point2D | null { return this.routeStartPoint; }
  getRoutePreview(): Point2D | null { return this.routePreviewPoint; }

  isRoutePreviewViolating(): boolean { return this.routeViolationCount > 0; }

  // ═══════════════════════════════════════════════════
  //  差分对布线
  // ═══════════════════════════════════════════════════

  startDiffRoute(point: Point2D, dpName?: string): Point2D | null {
    if (!this.document) return null;
    const snapped = this.snapToPadOrGrid(point);
    const net = this.findNetAtPoint(snapped);
    if (!net || net.netId.length === 0) return null;

    // 查找差分对
    let dp = dpName ? this.document.diffPairs.find(d => d.name === dpName) : undefined;
    if (!dp) {
      dp = this.document.diffPairs.find(d => d.netIdP === net.netId || d.netIdN === net.netId);
    }
    if (!dp) return null;

    // 查找 P 和 N 焊盘位置
    let startP = snapped;
    let startN = snapped;
    const padP = this.findPadForNet(dp.netIdP);
    const padN = this.findPadForNet(dp.netIdN);
    if (padP) startP = padP;
    if (padN) startN = padN;

    // 确保 startP 是离点击点近的那个
    const dP = pointDist(snapped, startP);
    const dN = pointDist(snapped, startN);
    if (dN < dP) {
      const t = startP; startP = startN; startN = t;
    }

    this.diffRouteActive = true;
    this.diffRouteState = {
      dpName: dp.name,
      netIdP: dp.netIdP,
      netIdN: dp.netIdN,
      startP, startN,
      previewP: startP,
      previewN: startN,
      gap: dp.gapMil
    };
    this.routeStartPoint = null;
    this.routePreviewPoint = null;
    this.publishChanged();
    return snapped;
  }

  previewDiffRoute(point: Point2D): DiffPairPreview | null {
    if (!this.diffRouteState) return null;
    const snapped = this.snapToPadOrGrid(point);
    const ds = this.diffRouteState;

    // 从 startP 到 snapped 的方向，offset ±gap/2 得到平行线
    const dx = snapped.x - ds.startP.x;
    const dy = snapped.y - ds.startP.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) {
      ds.previewP = ds.startP;
      ds.previewN = ds.startN;
      const result: DiffPairPreview = { p: ds.previewP, n: ds.previewN };
      return result;
    }
    const nx = -dy / len;
    const ny = dx / len;
    const halfGap = ds.gap / 2;

    const ptP: Point2D = {
      x: snapped.x + nx * halfGap,
      y: snapped.y + ny * halfGap
    };
    const ptN: Point2D = {
      x: snapped.x - nx * halfGap,
      y: snapped.y - ny * halfGap
    };
    ds.previewP = ptP;
    ds.previewN = ptN;

    const result: DiffPairPreview = { p: ds.previewP, n: ds.previewN };
    return result;
  }

  commitDiffRoute(end: Point2D): number {
    if (!this.document || !this.diffRouteState) return 0;
    const ds = this.diffRouteState;
    this.saveSnapshot();

    let count = 0;
    const activeLayer = this.activeLayer;
    const rules = this.document.metadata.designRules;
    const width = rules.defaultTrackWidth;

    let pathP = routeByCornerMode(ds.startP, ds.previewP, this.routeCornerMode);
    let pathN = routeByCornerMode(ds.startN, ds.previewN, this.routeCornerMode);

    // 蛇形等长：补齐较短侧，使累计长度差落入 tol
    let tol = 20;
    for (const dp of this.document.diffPairs) {
      if (dp.netIdP === ds.netIdP || dp.netIdN === ds.netIdN ||
        dp.netIdP === ds.netIdN || dp.netIdN === ds.netIdP) {
        tol = dp.lengthTolMil;
        break;
      }
    }
    const existP = sumTrackLengthForNet(this.document, ds.netIdP);
    const existN = sumTrackLengthForNet(this.document, ds.netIdN);
    const matched = matchDiffPairLengths(pathP, pathN, existP, existN, tol, ds.gap);
    pathP = matched[0];
    pathN = matched[1];

    let nameP = ds.dpName + '_P';
    let nameN = ds.dpName + '_N';
    for (let ni = 0; ni < this.document.nets.length; ni++) {
      if (this.document.nets[ni].id === ds.netIdP) nameP = this.document.nets[ni].name;
      if (this.document.nets[ni].id === ds.netIdN) nameN = this.document.nets[ni].name;
    }

    for (let i = 0; i < pathP.length - 1; i++) {
      const startPt: Point2D = { x: pathP[i].x, y: pathP[i].y };
      const endPt: Point2D = { x: pathP[i + 1].x, y: pathP[i + 1].y };
      const trk: PcbTrack = {
        id: IdUtil.generate('trk'),
        layer: activeLayer,
        start: startPt,
        end: endPt,
        width,
        netId: ds.netIdP,
        netName: nameP
      };
      this.document.tracks.push(trk);
      count++;
    }

    for (let i = 0; i < pathN.length - 1; i++) {
      const startPt2: Point2D = { x: pathN[i].x, y: pathN[i].y };
      const endPt2: Point2D = { x: pathN[i + 1].x, y: pathN[i + 1].y };
      const trk: PcbTrack = {
        id: IdUtil.generate('trk'),
        layer: activeLayer,
        start: startPt2,
        end: endPt2,
        width,
        netId: ds.netIdN,
        netName: nameN
      };
      this.document.tracks.push(trk);
      count++;
    }

    ds.startP = ds.previewP;
    ds.startN = ds.previewN;
    this.touchModified();
    this.refreshConnectivity();
    this.publishChanged();
    return count;
  }

  cancelDiffRoute(): void {
    this.diffRouteActive = false;
    this.diffRouteState = null;
    this.publishChanged();
  }

  isDiffRouteActive(): boolean { return this.diffRouteActive; }

  getDiffRouteState(): DiffRouteState | null { return this.diffRouteState; }

  private findPadForNet(netId: string): Point2D | null {
    if (!this.document) return null;
    for (const fp of this.document.footprints) {
      for (const pad of fp.pads) {
        if (pad.netId === netId) {
          return padWorldPosition(fp, pad);
        }
      }
    }
    return null;
  }

  private checkPathClearance(path: Point2D[]): number {
    if (!this.document || path.length < 2) return 0;
    const rules = this.document.metadata.designRules;
    const minClear = rules.minClearance;
    const snapNet = this.findNetAtPoint(this.routeStartPoint!);
    const snapNetId = snapNet?.netId ?? '';
    let violations = 0;

    for (let seg = 0; seg < path.length - 1; seg++) {
      const segStart = path[seg];
      const segEnd = path[seg + 1];

      for (const trk of this.document.tracks) {
        if (trk.netId.length > 0 && trk.netId === snapNetId) continue;
        if (trk.layer !== this.activeLayer) continue;
        const d = segmentDist(segStart, segEnd, trk.start, trk.end);
        if (d < minClear + trk.width / 2) violations++;
      }

      for (const via of this.document.vias) {
        if (via.netId.length > 0 && via.netId === snapNetId) continue;
        if (!viaSpansLayer(via.layers, this.activeLayer)) continue;
        const d = pointToSegmentDist(via.position, segStart, segEnd);
        if (d < minClear + via.diameter / 2) violations++;
      }

      for (const fp of this.document.footprints) {
        for (const pad of fp.pads) {
          const padNetId = pad.netId ?? '';
          if (padNetId.length > 0 && padNetId === snapNetId) continue;
          const wp = padWorldPosition(fp, pad);
          const d = pointToSegmentDist(wp, segStart, segEnd);
          const padRadius = Math.max(pad.size.x, pad.size.y) / 2;
          if (d < minClear + padRadius) violations++;
        }
      }
    }
    return violations;
  }

  addTrack(start: Point2D, end: Point2D, netId?: string, netName?: string,
    skipSnapshot: boolean = false): PcbTrack | null {
    if (this.guardEdit()) {
      return null;
    }
    if (!this.document) return null;
    if (!isCopperLayer(this.activeLayer)) return null;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (Math.sqrt(dx * dx + dy * dy) < 0.5) return null;

    const startNet = this.findNetAtPoint(start);
    const endNet = this.findNetAtPoint(end);
    let resolvedId = netId ?? startNet?.netId ?? endNet?.netId ?? '';
    let resolvedName = netName ?? startNet?.netName ?? endNet?.netName ?? '';
    if (startNet && endNet && startNet.netId.length > 0 && endNet.netId.length > 0 &&
      startNet.netId !== endNet.netId) {
      tracePcbManualRouteReject('跨网络', startNet.netName, endNet.netName);
      return null;
    }

    if (!skipSnapshot) {
      this.saveSnapshot();
    }
    let width = this.document.metadata.designRules.defaultTrackWidth;
    if (resolvedId.length > 0) {
      for (const n of this.document.nets) {
        if (n.id === resolvedId) {
          width = findNetClass(this.document, n.classId).trackWidth;
          break;
        }
      }
    }
    const track: PcbTrack = {
      id: IdUtil.generate('trk'),
      layer: this.activeLayer,
      start: { x: start.x, y: start.y },
      end: { x: end.x, y: end.y },
      width,
      netId: resolvedId,
      netName: resolvedName
    };
    this.document.tracks.push(track);
    if (!skipSnapshot) {
      tracePcbTrackAdded(track);
    }
    this.touchModified();
    this.publishChanged();
    return track;
  }

  // ═══════════════════════════════════════════════════
  //  Via / Zone / Cutout
  // ═══════════════════════════════════════════════════

  addVia(pos: Point2D, netId?: string, netName?: string, kind: PcbViaKind = PcbViaKind.THROUGH,
    fromLayer?: PcbLayerId, toLayer?: PcbLayerId): PcbVia | null {
    if (this.guardEdit()) {
      return null;
    }
    if (!this.document) return null;
    this.saveSnapshot();
    const atNet = this.findNetAtPoint(pos);
    const rules = this.document.metadata.designRules;
    let resolvedId = netId ?? atNet?.netId ?? '';
    let resolvedName = netName ?? atNet?.netName ?? '';
    let diameter = rules.minViaDrill + 8;
    let drill = rules.minViaDrill;
    if (resolvedId.length > 0) {
      for (const n of this.document.nets) {
        if (n.id === resolvedId) {
          const nc = findNetClass(this.document, n.classId);
          diameter = nc.viaDiameter;
          drill = nc.viaDrill;
          break;
        }
      }
    }
    const copper = copperLayersFromStack(this.document.layerStack);
    let layers: PcbLayerId[] = [PcbLayerId.F_CU, PcbLayerId.B_CU];
    let actualKind = kind;

    if (kind === PcbViaKind.THROUGH) {
      layers = copper.length > 0 ? copper : [PcbLayerId.F_CU, PcbLayerId.B_CU];
    } else if (kind === PcbViaKind.BLIND || kind === PcbViaKind.BURIED) {
      if (fromLayer && toLayer) {
        // 直接使用指定的层范围
        layers = [fromLayer, toLayer];
      } else if (copper.length >= 4) {
        // 4+ 层板：盲孔默认从当前层到相邻层
        const curIdx = copper.indexOf(this.activeLayer);
        if (curIdx >= 0) {
          if (kind === PcbViaKind.BLIND) {
            // 盲孔：表面层 → 内层
            const targetIdx = curIdx === 0 ? 1 : copper.length - 2;
            layers = [copper[curIdx], copper[targetIdx]];
          } else {
            // 埋孔：内层 → 相邻内层
            const nextIdx = Math.min(curIdx + 1, copper.length - 1);
            if (curIdx > 0 && curIdx < copper.length - 1) {
              layers = [copper[curIdx], copper[nextIdx]];
            }
          }
        }
      }
    }

    // 如果仍是默认的双层范围，尝试根据焊盘连通性推断层范围
    if (layers.length === 2 && layers[0] === PcbLayerId.F_CU && layers[1] === PcbLayerId.B_CU &&
      (kind === PcbViaKind.BLIND || kind === PcbViaKind.BURIED) && copper.length > 2) {
      const idx = copper.indexOf(this.activeLayer);
      if (idx >= 0 && idx < copper.length - 1) {
        layers = [copper[idx], copper[idx + 1]];
      }
    }

    const via: PcbVia = {
      id: IdUtil.generate('via'),
      position: { x: pos.x, y: pos.y },
      drill,
      diameter,
      netId: resolvedId,
      netName: resolvedName,
      layers,
      kind: actualKind
    };
    this.document.vias.push(via);
    this.touchModified();
    this.refreshConnectivity();
    this.publishChanged();
    return via;
  }

  addGroundPour(): PcbZone | null {
    if (!this.document) return null;
    this.saveSnapshot();
    let netId = '';
    let netName = 'GND';
    for (const fp of this.document.footprints) {
      for (const pad of fp.pads) {
        const nm = (pad.netName ?? '').toUpperCase();
        if (nm === 'GND' || nm === 'VSS' || nm === 'AGND') {
          netId = pad.netId ?? '';
          netName = pad.netName ?? 'GND';
          break;
        }
      }
      if (netId.length > 0) break;
    }
    const outline = this.document.boardOutline.points;
    if (outline.length < 3) return null;
    const layer = isCopperLayer(this.activeLayer) ? this.activeLayer : PcbLayerId.F_CU;
    this.document.zones = this.document.zones.filter(z =>
      !(z.layer === layer && z.netName.toUpperCase() === netName.toUpperCase()));
    const outlineCopy: Point2D[] = [];
    for (const p of outline) {
      outlineCopy.push({ x: p.x, y: p.y });
    }
    const defs = defaultZoneFields(this.document);
    const zone: PcbZone = {
      id: IdUtil.generate('zone'),
      layer, netId, netName,
      outline: outlineCopy,
      priority: 0,
      clearance: defs.clearance,
      cutouts: [],
      manualCutouts: [],
      thermalRelief: defs.thermalRelief,
      thermalGap: defs.thermalGap,
      thermalWidth: defs.thermalWidth
    };
    rebuildZoneCutouts(zone, this.document);
    this.document.zones.push(zone);
    this.touchModified();
    this.refreshConnectivity();
    this.publishChanged();
    return zone;
  }

  addZoneManualCutout(zoneId: string, center: Point2D, halfSize: number): boolean {
    if (!this.document) return false;
    this.saveSnapshot();
    for (const z of this.document.zones) {
      if (z.id !== zoneId) continue;
      normalizeZoneFields(z, this.document);
      z.manualCutouts.push(makeRectCutout(center, halfSize, halfSize));
      rebuildZoneCutouts(z, this.document);
      this.touchModified();
      this.publishChanged();
      return true;
    }
    return false;
  }

  adjustZonePriority(zoneId: string, delta: number): boolean {
    if (!this.document) return false;
    for (const z of this.document.zones) {
      if (z.id !== zoneId) continue;
      this.saveSnapshot();
      z.priority = Math.max(0, z.priority + delta);
      this.touchModified();
      this.publishChanged();
      return true;
    }
    return false;
  }

  setZoneThermalRelief(zoneId: string, enabled: boolean): boolean {
    if (!this.document) return false;
    for (const z of this.document.zones) {
      if (z.id !== zoneId) continue;
      this.saveSnapshot();
      normalizeZoneFields(z, this.document);
      z.thermalRelief = enabled;
      rebuildZoneCutouts(z, this.document);
      this.touchModified();
      this.publishChanged();
      return true;
    }
    return false;
  }

  refreshZoneCutouts(zoneId: string): boolean {
    if (!this.document) return false;
    for (const z of this.document.zones) {
      if (z.id !== zoneId) continue;
      rebuildZoneCutouts(z, this.document);
      this.touchModified();
      this.publishChanged();
      return true;
    }
    return false;
  }

  beginZonePoly(netId?: string, netName?: string): void {
    if (this.guardEdit()) {
      return;
    }
    this.zonePolyPoints = [];
    this.zonePolyNetId = netId ?? '';
    this.zonePolyNetName = netName && netName.length > 0 ? netName : 'GND';
    if (this.zonePolyNetId.length === 0 && this.document) {
      for (const fp of this.document.footprints) {
        for (const pad of fp.pads) {
          const nm = (pad.netName ?? '').toUpperCase();
          if (nm === 'GND' || nm === 'VSS') {
            this.zonePolyNetId = pad.netId ?? '';
            this.zonePolyNetName = pad.netName ?? 'GND';
            return;
          }
        }
      }
    }
  }

  addZonePolyPoint(pt: Point2D): void {
    this.zonePolyPoints.push(this.snapPoint(pt));
    this.publishChanged();
  }

  commitZonePoly(): PcbZone | null {
    if (this.guardEdit()) {
      this.zonePolyPoints = [];
      return null;
    }
    if (!this.document || this.zonePolyPoints.length < 3) {
      this.zonePolyPoints = [];
      return null;
    }
    this.saveSnapshot();
    const layer = isCopperLayer(this.activeLayer) ? this.activeLayer : PcbLayerId.F_CU;
    const outline: Point2D[] = [];
    for (const p of this.zonePolyPoints) {
      outline.push({ x: p.x, y: p.y });
    }
    const defs = defaultZoneFields(this.document);
    const zone: PcbZone = {
      id: IdUtil.generate('zone'),
      layer,
      netId: this.zonePolyNetId,
      netName: this.zonePolyNetName,
      outline,
      priority: 0,
      clearance: defs.clearance,
      cutouts: [],
      manualCutouts: [],
      thermalRelief: defs.thermalRelief,
      thermalGap: defs.thermalGap,
      thermalWidth: defs.thermalWidth
    };
    rebuildZoneCutouts(zone, this.document);
    this.document.zones.push(zone);
    this.zonePolyPoints = [];
    this.touchModified();
    this.refreshConnectivity();
    this.publishChanged();
    return zone;
  }

  cancelZonePoly(): void {
    this.zonePolyPoints = [];
    this.publishChanged();
  }

  getZonePolyPreview(): Point2D[] {
    return this.zonePolyPoints;
  }

  beginOutlineEdit(): void {
    if (this.guardEdit()) {
      return;
    }
    this.outlineEditPoints = [];
    this.publishChanged();
  }

  addOutlinePoint(pt: Point2D): void {
    if (this.guardEdit()) {
      return;
    }
    this.outlineEditPoints.push(this.snapPoint(pt));
    this.publishChanged();
  }

  commitOutlineEdit(): boolean {
    if (this.guardEdit()) {
      this.outlineEditPoints = [];
      return false;
    }
    if (!this.document || this.outlineEditPoints.length < 3) {
      this.outlineEditPoints = [];
      return false;
    }
    this.saveSnapshot();
    const pts: Point2D[] = [];
    for (const p of this.outlineEditPoints) {
      pts.push({ x: p.x, y: p.y });
    }
    this.document.boardOutline.points = pts;
    this.outlineEditPoints = [];
    this.touchModified();
    this.publishChanged();
    return true;
  }

  cancelOutlineEdit(): void {
    this.outlineEditPoints = [];
    this.publishChanged();
  }

  getOutlinePreview(): Point2D[] {
    return this.outlineEditPoints;
  }

  setMeasurePoint(pt: Point2D): number {
    const snapped = this.snapPoint(pt);
    if (this.measurePoints.length >= 2) {
      this.measurePoints = [];
    }
    this.measurePoints.push(snapped);
    this.publishChanged();
    if (this.measurePoints.length === 2) {
      const a = this.measurePoints[0];
      const b = this.measurePoints[1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      return Math.sqrt(dx * dx + dy * dy);
    }
    return 0;
  }

  getMeasurePoints(): Point2D[] {
    return this.measurePoints;
  }

  clearMeasure(): void {
    this.measurePoints = [];
    this.publishChanged();
  }

  setPlaceFootprintDefId(defId: string): void {
    this.placeFpDefId = defId;
  }

  placeFootprintAt(pos: Point2D): PcbFootprintInst | null {
    if (this.guardEdit()) {
      return null;
    }
    if (!this.document || this.placeFpDefId.length === 0) return null;
    const def = getGlobalPcbFootprintLibrary().getDef(this.placeFpDefId);
    if (!def) return null;
    this.saveSnapshot();
    const pads: PcbPad[] = [];
    for (const p of def.pads) {
      pads.push({
        id: IdUtil.generate('pad'),
        number: p.number,
        type: p.type,
        shape: p.shape,
        pos: { x: p.pos.x, y: p.pos.y },
        size: { x: p.size.x, y: p.size.y },
        drill: p.drill,
        layers: [...p.layers],
        netId: '',
        netName: ''
      });
    }
    const fp: PcbFootprintInst = {
      id: IdUtil.generate('fp'),
      defId: def.id,
      refDes: def.name,
      value: '',
      position: this.snapPoint(pos),
      rotation: 0,
      mirrored: this.activeLayer === PcbLayerId.B_CU,
      layer: this.activeLayer === PcbLayerId.B_CU ? PcbLayerId.B_CU : PcbLayerId.F_CU,
      locked: false,
      pads
    };
    this.document.footprints.push(fp);
    this.touchModified();
    this.refreshConnectivity();
    this.publishChanged();
    return fp;
  }

  flipSelected(): void {
    if (this.guardEdit()) {
      return;
    }
    if (!this.document) return;
    if (this.selection.footprintIds.length === 0) return;
    this.saveSnapshot();
    const fpSet = new Set(this.selection.footprintIds);
    const oldPadPositions: Map<string, Point2D> = new Map();
    for (const fp of this.document.footprints) {
      if (fpSet.has(fp.id) && !fp.locked) {
        const pads = collectFootprintPadPositions(fp);
        pads.forEach((pos: Point2D, key: string) => {
          oldPadPositions.set(key, { x: pos.x, y: pos.y });
        });
      }
    }
    for (const fp of this.document.footprints) {
      if (!fpSet.has(fp.id) || fp.locked) continue;
      fp.mirrored = !fp.mirrored;
      fp.layer = fp.mirrored ? PcbLayerId.B_CU : PcbLayerId.F_CU;
    }
    if (oldPadPositions.size > 0) {
      updateTracksForFootprintTransform(this.document, fpSet, oldPadPositions);
      snapTrackEndpointsNearFootprints(this.document, fpSet);
    }
    for (const z of this.document.zones) {
      rebuildZoneCutouts(z, this.document);
    }
    this.touchModified();
    this.refreshConnectivity();
    this.publishChanged();
  }


  // ═══════════════════════════════════════════════════
  //  Auto Route / DRC
  // ═══════════════════════════════════════════════════

  runAutoRoute(): ApiResult<AutoRouteResult> {
    if (this.guardEdit()) {
      return ResultHelper.fail(ErrCode.ERR_PROJECT_LOCKED, 'PCB AI 布线中，画布已锁定');
    }
    if (!this.document) return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '无 PCB 文档');
    this.saveSnapshot();
    const layer = isCopperLayer(this.activeLayer) ? this.activeLayer : PcbLayerId.F_CU;
    const sch = this.schematicProvider?.() ?? null;
    const schHints: AccessoryNetHint[] = [];
    if (sch) {
      for (const n of sch.nets) {
        schHints.push({
          id: n.id,
          name: n.name,
          schPinCount: n.pinIds !== undefined ? n.pinIds.length : 0
        });
      }
    }
    const result = autoRoutePcb(this.document, layer, schHints);
    this.refreshConnectivity();
    tracePcbAutoRoute(this.document, layer, result.netCount, result.trackCount, result.messages);
    this.touchModified();
    this.publishChanged();
    return ResultHelper.ok(result);
  }

  applyAiRouteResult(tracks: PcbTrack[], vias: PcbVia[],
    footprints?: PcbFootprintInst[]): ApiResult<AutoRouteResult> {
    if (!this.document) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '无 PCB 文档');
    }
    this.saveSnapshot();
    if (footprints && footprints.length > 0) {
      this.document.footprints = footprints;
    }
    this.document.tracks = tracks.slice();
    this.document.vias = vias.slice();
    this.document.metadata.modifiedAt = new Date().toISOString();
    const netIds: Set<string> = new Set();
    for (let i = 0; i < tracks.length; i++) {
      if (tracks[i].netId.length > 0) {
        netIds.add(tracks[i].netId);
      }
    }
    const result: AutoRouteResult = {
      trackCount: tracks.length,
      netCount: netIds.size,
      messages: [`AI 布线 ${netIds.size} 网, ${tracks.length} 段, ${vias.length} 过孔`]
    };
    this.refreshConnectivity();
    tracePcbAutoRoute(this.document, this.activeLayer, result.netCount, result.trackCount, result.messages);
    this.touchModified();
    this.publishChanged();
    return ResultHelper.ok(result);
  }

  runDrcForDoc(doc: PcbDocument): PcbDrcViolation[] {
    const prev = this.document;
    this.document = doc;
    const v = this.runDrc();
    this.document = prev;
    return v;
  }

  runDrc(): PcbDrcViolation[] {
    const violations: PcbDrcViolation[] = [];
    if (!this.document) return violations;
    const rules = this.document.metadata.designRules;
    this.refreshConnectivity();

    const routedNets: Set<string> = new Set();
    for (const trk of this.document.tracks) { if (trk.netId.length > 0) routedNets.add(trk.netId); }
    for (const via of this.document.vias) { if (via.netId.length > 0) routedNets.add(via.netId); }

    const reportedUnrouted: Set<string> = new Set();
    for (const fp of this.document.footprints) {
      for (const pad of fp.pads) {
        if (!pad.netName || pad.netName.length === 0) continue;
        const nid = pad.netId ?? '';
        if (nid.length > 0 && !routedNets.has(nid) && !reportedUnrouted.has(nid)) {
          reportedUnrouted.add(nid);
          violations.push({
            id: IdUtil.generate('drc'), severity: PcbDrcSeverity.WARNING,
            ruleType: PcbDrcRuleType.UNROUTED_NET,
            message: `未布线网络: ${pad.netName}`, position: fp.position,
            netId: nid, footprintId: fp.id
          });
        }
      }
    }

    for (let i = 0; i < this.document.tracks.length; i++) {
      const t1 = this.document.tracks[i];
      if (t1.width < rules.minTrackWidth) {
        violations.push({
          id: IdUtil.generate('drc'), severity: PcbDrcSeverity.WARNING,
          ruleType: PcbDrcRuleType.MIN_WIDTH,
          message: `走线线宽 ${t1.width.toFixed(1)}mil 低于最小 ${rules.minTrackWidth}mil`,
          position: t1.start
        });
      }
      for (let j = i + 1; j < this.document.tracks.length; j++) {
        const t2 = this.document.tracks[j];
        if (t1.layer !== t2.layer) continue;
        const dist = segmentDist(t1.start, t1.end, t2.start, t2.end);
        const sameNet = t1.netId.length > 0 && t1.netId === t2.netId;
        if (sameNet) continue;
        if (dist < 0.5) {
          violations.push({
            id: IdUtil.generate('drc'), severity: PcbDrcSeverity.ERROR,
            ruleType: PcbDrcRuleType.SHORT,
            message: `短路: ${t1.netName || '?'} 与 ${t2.netName || '?'} 重叠`,
            position: t1.start, netId: t1.netId
          });
        } else if (dist < rules.minClearance) {
          violations.push({
            id: IdUtil.generate('drc'), severity: PcbDrcSeverity.ERROR,
            ruleType: PcbDrcRuleType.CLEARANCE,
            message: `间距违规: ${t1.netName || '?'} 与 ${t2.netName || '?'} (${dist.toFixed(1)}mil)`,
            position: t1.start
          });
        }
      }
    }

    // 走线 vs 异网焊盘
    for (const trk of this.document.tracks) {
      for (const fp of this.document.footprints) {
        for (const pad of fp.pads) {
          const padNet = pad.netId ?? '';
          if (padNet.length > 0 && padNet === trk.netId) continue;
          const wp = padWorldPosition(fp, pad);
          const d = pointToSegmentDist(wp, trk.start, trk.end);
          const need = rules.minClearance + Math.max(pad.size.x, pad.size.y) / 2 + trk.width / 2;
          if (d < need * 0.35) {
            violations.push({
              id: IdUtil.generate('drc'), severity: PcbDrcSeverity.ERROR,
              ruleType: PcbDrcRuleType.SHORT,
              message: `短路风险: 走线 ${trk.netName || '?'} 与焊盘 ${fp.refDes}.${pad.number}`,
              position: wp, footprintId: fp.id
            });
          } else if (d < need) {
            violations.push({
              id: IdUtil.generate('drc'), severity: PcbDrcSeverity.ERROR,
              ruleType: PcbDrcRuleType.PAD_CLEARANCE,
              message: `焊盘间距: ${fp.refDes}.${pad.number} ↔ ${trk.netName || 'track'} (${d.toFixed(1)}mil)`,
              position: wp, footprintId: fp.id
            });
          }
        }
      }
    }

    // 过孔环宽
    for (const via of this.document.vias) {
      const ring = (via.diameter - via.drill) / 2;
      if (ring < rules.minAnnularRing) {
        violations.push({
          id: IdUtil.generate('drc'), severity: PcbDrcSeverity.WARNING,
          ruleType: PcbDrcRuleType.VIA_ANNULAR,
          message: `过孔环宽 ${ring.toFixed(1)}mil < ${rules.minAnnularRing}mil`,
          position: via.position, netId: via.netId
        });
      }
    }

    // 孔到孔
    for (let i = 0; i < this.document.vias.length; i++) {
      for (let j = i + 1; j < this.document.vias.length; j++) {
        const a = this.document.vias[i];
        const b = this.document.vias[j];
        const d = pointDist(a.position, b.position) - a.drill / 2 - b.drill / 2;
        if (d < rules.minHoleToHole) {
          violations.push({
            id: IdUtil.generate('drc'), severity: PcbDrcSeverity.WARNING,
            ruleType: PcbDrcRuleType.CLEARANCE,
            message: `孔间距 ${d.toFixed(1)}mil < ${rules.minHoleToHole}mil`,
            position: a.position
          });
        }
      }
    }

    // 差分对长度
    for (const dp of this.document.diffPairs) {
      const lp = sumTrackLengthForNet(this.document, dp.netIdP);
      const ln = sumTrackLengthForNet(this.document, dp.netIdN);
      const diff = Math.abs(lp - ln);
      if (diff > dp.lengthTolMil) {
        violations.push({
          id: IdUtil.generate('drc'), severity: PcbDrcSeverity.WARNING,
          ruleType: PcbDrcRuleType.DIFF_LENGTH,
          message: `差分对 ${dp.name} 长度差 ${diff.toFixed(1)}mil > ${dp.lengthTolMil}mil (P=${lp.toFixed(0)} N=${ln.toFixed(0)})`,
          netId: dp.netIdP
        });
      }
      // 差分对间距粗检：同层最近异网段间距
      let minGap = Number.POSITIVE_INFINITY;
      let gapPos: Point2D | undefined = undefined;
      for (let i = 0; i < this.document.tracks.length; i++) {
        const t1 = this.document.tracks[i];
        if (t1.netId !== dp.netIdP) continue;
        for (let j = 0; j < this.document.tracks.length; j++) {
          const t2 = this.document.tracks[j];
          if (t2.netId !== dp.netIdN || t1.layer !== t2.layer) continue;
          const d = segmentDist(t1.start, t1.end, t2.start, t2.end);
          if (d < minGap) {
            minGap = d;
            gapPos = t1.start;
          }
        }
      }
      if (minGap < Number.POSITIVE_INFINITY && minGap + 0.5 < dp.gapMil * 0.7) {
        violations.push({
          id: IdUtil.generate('drc'), severity: PcbDrcSeverity.WARNING,
          ruleType: PcbDrcRuleType.DIFF_GAP,
          message: `差分对 ${dp.name} 间距 ${minGap.toFixed(1)}mil 远小于目标 ${dp.gapMil}mil`,
          position: gapPos, netId: dp.netIdP
        });
      } else if (minGap < Number.POSITIVE_INFINITY && minGap > dp.gapMil * 1.6) {
        violations.push({
          id: IdUtil.generate('drc'), severity: PcbDrcSeverity.WARNING,
          ruleType: PcbDrcRuleType.DIFF_GAP,
          message: `差分对 ${dp.name} 间距 ${minGap.toFixed(1)}mil 明显大于目标 ${dp.gapMil}mil`,
          position: gapPos, netId: dp.netIdP
        });
      }
    }

    // Edge.Cuts 闭合性
    const outlinePts = this.document.boardOutline.points;
    if (outlinePts.length >= 3) {
      const a = outlinePts[0];
      const b = outlinePts[outlinePts.length - 1];
      const gap = Math.hypot(a.x - b.x, a.y - b.y);
      if (gap > Math.max(2, this.document.boardOutline.width)) {
        violations.push({
          id: IdUtil.generate('drc'), severity: PcbDrcSeverity.ERROR,
          ruleType: PcbDrcRuleType.EDGE_OPEN,
          message: `Edge.Cuts 未闭合，首尾间隙 ${gap.toFixed(1)}mil`,
          position: a
        });
      }
    }

    // 丝印生产合规：位号字高 + 丝印线距焊盘
    const silkClear = rules.silkToPadClearance !== undefined ? rules.silkToPadClearance : 8;
    const minSilkH = rules.minSilkHeight !== undefined ? rules.minSilkHeight : 31;
    const lib = getGlobalPcbFootprintLibrary();
    for (const fp of this.document.footprints) {
      const def = lib.getDef(fp.defId);
      if (!def || def.silkLines.length === 0) continue;
      let silkSpan = 0;
      for (const line of def.silkLines) {
        for (let i = 1; i < line.length; i++) {
          silkSpan = Math.max(silkSpan,
            Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y));
        }
      }
      if (silkSpan > 0 && silkSpan < minSilkH * 0.35) {
        violations.push({
          id: IdUtil.generate('drc'), severity: PcbDrcSeverity.WARNING,
          ruleType: PcbDrcRuleType.SILK_HEIGHT,
          message: `${fp.refDes} 丝印线段过短，可能不满足最小字高 ${minSilkH}mil`,
          position: fp.position, footprintId: fp.id
        });
      }
      let silkPadHit = false;
      for (const line of def.silkLines) {
        if (silkPadHit) break;
        for (const lp of line) {
          if (silkPadHit) break;
          // 与 Gerber/绘制一致：局部坐标经镜像+旋转到世界
          let lx = lp.x;
          let ly = lp.y;
          if (fp.mirrored) lx = -lx;
          if (fp.rotation === 90) { const t = lx; lx = -ly; ly = t; }
          else if (fp.rotation === 180) { lx = -lx; ly = -ly; }
          else if (fp.rotation === 270) { const t = lx; lx = ly; ly = -t; }
          const sw: Point2D = { x: fp.position.x + lx, y: fp.position.y + ly };
          for (const pad of fp.pads) {
            const pw = padWorldPosition(fp, pad);
            const d = Math.hypot(sw.x - pw.x, sw.y - pw.y) -
              Math.max(pad.size.x, pad.size.y) / 2;
            if (d < silkClear) {
              violations.push({
                id: IdUtil.generate('drc'), severity: PcbDrcSeverity.WARNING,
                ruleType: PcbDrcRuleType.SILK_PAD,
                message: `${fp.refDes} 丝印距焊盘 ${d.toFixed(1)}mil < ${silkClear}mil`,
                position: sw, footprintId: fp.id
              });
              silkPadHit = true;
              break;
            }
          }
        }
      }
    }

    for (const fp of this.document.footprints) {
      const bb = this.footprintBoundingBox(fp);
      const cx = (bb.x1 + bb.x2) / 2;
      const cy = (bb.y1 + bb.y2) / 2;
      if (!pointInPolygon({ x: cx, y: cy }, this.document.boardOutline.points)) {
        violations.push({
          id: IdUtil.generate('drc'), severity: PcbDrcSeverity.WARNING,
          ruleType: PcbDrcRuleType.OFF_BOARD,
          message: `${fp.refDes} 中心在板框外`, position: fp.position, footprintId: fp.id
        });
      }
    }

    let unroutedCount = 0;
    let clearanceCount = 0;
    for (let vi = 0; vi < violations.length; vi++) {
      if (violations[vi].ruleType === PcbDrcRuleType.UNROUTED_NET) {
        unroutedCount++;
      } else if (violations[vi].ruleType === PcbDrcRuleType.CLEARANCE ||
        violations[vi].ruleType === PcbDrcRuleType.SHORT ||
        violations[vi].ruleType === PcbDrcRuleType.PAD_CLEARANCE) {
        clearanceCount++;
      }
    }
    tracePcbDrc(violations.length, unroutedCount, clearanceCount);
    tracePcbNetRoutingSummary(this.document);

    this.lastDrcViolations = violations;
    return violations;
  }

  getLastDrcViolations(): PcbDrcViolation[] {
    return this.lastDrcViolations;
  }

  // ═══════════════════════════════════════════════════
  //  Delete / Copy
  // ═══════════════════════════════════════════════════

  deleteSelected(): void {
    if (this.guardEdit()) {
      return;
    }
    if (!this.document) return;
    this.saveSnapshot();
    const fpSet = new Set(this.selection.footprintIds);
    const trkSet = new Set(this.selection.trackIds);
    const viaSet = new Set(this.selection.viaIds);
    const zoneSet = new Set(this.selection.zoneIds);

    this.document.footprints = this.document.footprints.filter(f => !fpSet.has(f.id));
    this.document.tracks = this.document.tracks.filter(t => !trkSet.has(t.id));
    this.document.vias = this.document.vias.filter(v => !viaSet.has(v.id));
    this.document.zones = this.document.zones.filter(z => !zoneSet.has(z.id));

    this.selection = pcbSelectionEmpty();
    this.touchModified();
    this.refreshConnectivity();
    this.publishChanged();
    this.publishSelection();
  }

  copySelected(): boolean {
    if (!this.document) return false;
    this.clipboard = [];
    const fpSet = new Set(this.selection.footprintIds);
    for (const fp of this.document.footprints) {
      if (fpSet.has(fp.id)) {
        this.clipboard.push(this.deepCloneFootprint(fp));
      }
    }
    return this.clipboard.length > 0;
  }

  pasteClipboard(): number {
    if (this.guardEdit()) {
      return 0;
    }
    if (!this.document || this.clipboard.length === 0) return 0;
    this.saveSnapshot();
    let count = 0;
    const offset = this.document.metadata.gridSize * 4;
    for (const src of this.clipboard) {
      const inst = this.deepCloneFootprint(src);
      inst.id = IdUtil.generate('fp');
      inst.refDes = src.refDes + '_copy';
      inst.position.x += offset * (count + 1);
      inst.position.y += offset * (count + 1);
      for (const pad of inst.pads) {
        pad.id = IdUtil.generate('pad');
        pad.netId = undefined;
        pad.netName = undefined;
      }
      this.document!.footprints.push(inst);
      count++;
    }
    if (count > 0) {
      this.touchModified();
      this.refreshConnectivity();
      this.publishChanged();
    }
    return count;
  }

  // ═══════════════════════════════════════════════════
  //  Hit Testing (improved)
  // ═══════════════════════════════════════════════════

  hitTestFootprint(worldX: number, worldY: number): PcbFootprintInst | null {
    if (!this.document) return null;
    const padHit = this.findPadAt({ x: worldX, y: worldY });
    if (padHit) {
      for (const fp of this.document.footprints) {
        for (const p of fp.pads) { if (p.id === padHit.pad.id) return fp; }
      }
    }
    const tol = Math.max(20, (this.document.metadata.gridSize ?? 5) * 4);
    for (let i = this.document.footprints.length - 1; i >= 0; i--) {
      const fp = this.document.footprints[i];
      const bb = this.footprintBoundingBox(fp);
      const expanded: PcbSelectionRect = {
        x1: bb.x1 - tol, y1: bb.y1 - tol,
        x2: bb.x2 + tol, y2: bb.y2 + tol
      };
      if (worldX >= expanded.x1 && worldX <= expanded.x2 &&
        worldY >= expanded.y1 && worldY <= expanded.y2) {
        return fp;
      }
    }
    return null;
  }

  hitTestTrack(worldX: number, worldY: number): PcbTrack | null {
    if (!this.document) return null;
    this.ensureSpatialIndex();
    const tol = Math.max(15, (this.document.metadata.gridSize ?? 5) * 3);
    const cand = this.spatialIndex.queryPoint(worldX, worldY, tol + 40);
    let best: PcbTrack | null = null;
    let bestDist = tol;
    const seen = new Set<string>();
    for (let i = 0; i < cand.length; i++) {
      if (cand[i].kind !== PcbSpatialKind.TRACK) continue;
      if (seen.has(cand[i].refId)) continue;
      seen.add(cand[i].refId);
      let trk: PcbTrack | null = null;
      for (const t of this.document.tracks) {
        if (t.id === cand[i].refId) { trk = t; break; }
      }
      if (!trk || !isLayerVisible(this.document, trk.layer)) continue;
      const d = pointToSegmentDist({ x: worldX, y: worldY }, trk.start, trk.end);
      const hitDist = d - trk.width / 2;
      if (hitDist <= bestDist) { bestDist = hitDist; best = trk; }
    }
    // 回退全扫（索引空时）
    if (!best && cand.length === 0) {
      for (const trk of this.document.tracks) {
        if (!isLayerVisible(this.document, trk.layer)) continue;
        const d = pointToSegmentDist({ x: worldX, y: worldY }, trk.start, trk.end);
        const hitDist = d - trk.width / 2;
        if (hitDist <= bestDist) { bestDist = hitDist; best = trk; }
      }
    }
    return best;
  }

  hitTestVia(worldX: number, worldY: number): PcbVia | null {
    if (!this.document) return null;
    this.ensureSpatialIndex();
    const tol = Math.max(18, (this.document.metadata.gridSize ?? 5) * 3);
    const cand = this.spatialIndex.queryPoint(worldX, worldY, tol + 40);
    let best: PcbVia | null = null;
    let bestDist = tol;
    const seen = new Set<string>();
    for (let i = 0; i < cand.length; i++) {
      if (cand[i].kind !== PcbSpatialKind.VIA) continue;
      if (seen.has(cand[i].refId)) continue;
      seen.add(cand[i].refId);
      let via: PcbVia | null = null;
      for (const v of this.document.vias) {
        if (v.id === cand[i].refId) { via = v; break; }
      }
      if (!via) continue;
      const d = pointDist({ x: worldX, y: worldY }, via.position);
      const hitDist = d - via.diameter / 2;
      if (hitDist <= bestDist) { bestDist = hitDist; best = via; }
    }
    if (!best && cand.length === 0) {
      for (const via of this.document.vias) {
        const d = pointDist({ x: worldX, y: worldY }, via.position);
        const hitDist = d - via.diameter / 2;
        if (hitDist <= bestDist) { bestDist = hitDist; best = via; }
      }
    }
    return best;
  }

  hitTestZone(worldX: number, worldY: number): PcbZone | null {
    if (!this.document) return null;
    const world: Point2D = { x: worldX, y: worldY };
    for (let i = this.document.zones.length - 1; i >= 0; i--) {
      const z = this.document.zones[i];
      if (!isLayerVisible(this.document, z.layer)) continue;
      if (!pointInPolygon(world, z.outline)) continue;
      let inCutout = false;
      if (z.cutouts) {
        for (const cut of z.cutouts) {
          if (cut.length >= 3 && pointInPolygon(world, cut)) {
            inCutout = true;
            break;
          }
        }
      }
      if (!inCutout) return z;
    }
    return null;
  }

  // ═══════════════════════════════════════════════════
  //  Coordinate / Snap
  // ═══════════════════════════════════════════════════

  snapPoint(pt: Point2D): Point2D {
    if (!this.viewport.snapToGrid) return pt;
    const g = this.document?.metadata.gridSize ?? 5;
    return { x: Math.round(pt.x / g) * g, y: Math.round(pt.y / g) * g };
  }

  snapToPadOrGrid(world: Point2D): Point2D {
    const hit = this.findPadAt(world);
    if (hit) return { x: hit.wx, y: hit.wy };
    return this.snapPoint(world);
  }

  screenToWorld(sx: number, sy: number): Point2D {
    return {
      x: (sx - this.viewport.panOffset.x) / this.viewport.zoom,
      y: (sy - this.viewport.panOffset.y) / this.viewport.zoom
    };
  }

  worldToScreen(wx: number, wy: number): Point2D {
    return {
      x: wx * this.viewport.zoom + this.viewport.panOffset.x,
      y: wy * this.viewport.zoom + this.viewport.panOffset.y
    };
  }

  // ═══════════════════════════════════════════════════
  //  Annotation
  // ═══════════════════════════════════════════════════

  forwardAnnotateFromSchematic(): ApiResult<PcbDocument> {
    const sch = this.schematicProvider?.() ?? null;
    if (!sch) return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '无原理图文档');
    const result = forwardAnnotatePcb(sch, this.document ?? undefined);
    normalizePcbDocument(result.document);
    rebuildPcbNets(result.document);
    this.document = result.document;
    snapTrackEndpointsToPads(this.document);
    this.ratsnestCache = buildRatsnest(this.document);
    this.selection = pcbSelectionEmpty();
    this.clearHistory();
    this.saveSnapshot();
    this.publishChanged();
    return ResultHelper.ok(this.document);
  }

  reverseAnnotateToSchematic(): ApiResult<number> {
    const sch = this.schematicProvider?.() ?? null;
    if (!sch) return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '无原理图文档');
    if (!this.document) return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '无 PCB 文档');
    const result = reverseAnnotatePcb(this.document, sch);
    return ResultHelper.ok(result.updatedCount);
  }

  ensureDocument(name: string): PcbDocument {
    if (!this.document) {
      this.document = createEmptyPcbDocument(name);
      this.saveSnapshot();
    }
    return this.document;
  }

  getFootprintDef(id: string) {
    return getGlobalPcbFootprintLibrary().getDef(id);
  }

  findNetAtPoint(world: Point2D): PcbNetRef | null {
    const hit = this.findPadAt(world);
    if (hit && hit.pad.netId && hit.pad.netName) {
      return { netId: hit.pad.netId, netName: hit.pad.netName };
    }
    if (!this.document) return null;
    const tol = Math.max(20, (this.document.metadata.gridSize ?? 5) * 4);
    for (const via of this.document.vias) {
      const d = pointDist(world, via.position);
      if (d <= tol && via.netId.length > 0) return { netId: via.netId, netName: via.netName };
    }
    for (const trk of this.document.tracks) {
      if (trk.netId.length === 0) continue;
      const d = pointToSegmentDist(world, trk.start, trk.end);
      if (d <= tol + trk.width / 2) return { netId: trk.netId, netName: trk.netName };
    }
    return null;
  }

  // ═══════════════════════════════════════════════════
  //  Undo / Redo
  // ═══════════════════════════════════════════════════

  canUndo(): boolean { return this.historyIndex > 0; }
  canRedo(): boolean { return this.historyIndex < this.history.length - 1; }

  undo(): boolean {
    if (this.guardEdit()) {
      return false;
    }
    if (!this.canUndo()) return false;
    this.historyLocked = true;
    this.historyIndex--;
    this.restoreSnapshot(this.history[this.historyIndex]);
    this.historyLocked = false;
    this.publishChanged();
    this.publishSelection();
    return true;
  }

  redo(): boolean {
    if (this.guardEdit()) {
      return false;
    }
    if (!this.canRedo()) return false;
    this.historyLocked = true;
    this.historyIndex++;
    this.restoreSnapshot(this.history[this.historyIndex]);
    this.historyLocked = false;
    this.publishChanged();
    this.publishSelection();
    return true;
  }

  // ═══════════════════════════════════════════════════
  //  Private helpers
  // ═══════════════════════════════════════════════════

  private footprintBoundingBox(fp: PcbFootprintInst): PcbSelectionRect {
    const def = getGlobalPcbFootprintLibrary().getDef(fp.defId);
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
    // 旋转交换
    if (fp.rotation === 90 || fp.rotation === 270) {
      const t = hw; hw = hh; hh = t;
    }
    return {
      x1: fp.position.x - hw,
      y1: fp.position.y - hh,
      x2: fp.position.x + hw,
      y2: fp.position.y + hh
    };
  }

  private findPadAt(world: Point2D): PcbPadHit | null {
    if (!this.document) return null;
    const grid = this.document.metadata.gridSize ?? 5;
    let best: PcbPadHit | null = null;
    let bestDist = Infinity;
    for (const fp of this.document.footprints) {
      for (const pad of fp.pads) {
        const wp = padWorldPosition(fp, pad);
        const tol = padSnapTolerance(pad, grid);
        const d = Math.sqrt((world.x - wp.x) ** 2 + (world.y - wp.y) ** 2);
        if (d <= tol && d < bestDist) {
          bestDist = d;
          best = { pad, wx: wp.x, wy: wp.y };
        }
      }
    }
    return best;
  }

  private touchModified(): void {
    if (this.document) {
      this.document.metadata.modifiedAt = new Date().toISOString();
    }
  }

  private refreshConnectivity(): void {
    if (!this.document) return;
    rebuildPcbNets(this.document);
    this.ratsnestCache = buildRatsnest(this.document);
    this.spatialDirty = true;
  }

  /** 惰性重建四叉树 */
  private ensureSpatialIndex(): void {
    if (!this.document || !this.spatialDirty) return;
    const items: PcbSpatialItem[] = [];
    let bx1 = Number.POSITIVE_INFINITY;
    let by1 = Number.POSITIVE_INFINITY;
    let bx2 = Number.NEGATIVE_INFINITY;
    let by2 = Number.NEGATIVE_INFINITY;
    const expand = (x: number, y: number): void => {
      if (x < bx1) bx1 = x;
      if (y < by1) by1 = y;
      if (x > bx2) bx2 = x;
      if (y > by2) by2 = y;
    };
    for (const trk of this.document.tracks) {
      const hw = Math.max(trk.width / 2, 4);
      const rect = PcbSpatialIndex.trackRect(trk.start.x, trk.start.y, trk.end.x, trk.end.y, hw);
      expand(rect.x1, rect.y1);
      expand(rect.x2, rect.y2);
      items.push({ id: `t:${trk.id}`, kind: PcbSpatialKind.TRACK, refId: trk.id, rect });
    }
    for (const via of this.document.vias) {
      const rect = PcbSpatialIndex.viaRect(via.position.x, via.position.y, via.diameter);
      expand(rect.x1, rect.y1);
      expand(rect.x2, rect.y2);
      items.push({ id: `v:${via.id}`, kind: PcbSpatialKind.VIA, refId: via.id, rect });
    }
    for (const fp of this.document.footprints) {
      const bb = this.footprintBoundingBox(fp);
      const rect: PcbSpatialRect = { x1: bb.x1, y1: bb.y1, x2: bb.x2, y2: bb.y2 };
      expand(rect.x1, rect.y1);
      expand(rect.x2, rect.y2);
      items.push({ id: `f:${fp.id}`, kind: PcbSpatialKind.FOOTPRINT, refId: fp.id, rect });
      for (const pad of fp.pads) {
        const w = padWorldPosition(fp, pad);
        const r = Math.max(pad.size.x, pad.size.y) / 2 + 2;
        const pr: PcbSpatialRect = { x1: w.x - r, y1: w.y - r, x2: w.x + r, y2: w.y + r };
        items.push({
          id: `p:${fp.id}:${pad.id}`,
          kind: PcbSpatialKind.PAD,
          refId: fp.id,
          rect: pr
        });
      }
    }
    for (const z of this.document.zones) {
      if (z.outline.length < 1) continue;
      let zx1 = z.outline[0].x;
      let zy1 = z.outline[0].y;
      let zx2 = zx1;
      let zy2 = zy1;
      for (let i = 1; i < z.outline.length; i++) {
        const p = z.outline[i];
        if (p.x < zx1) zx1 = p.x;
        if (p.y < zy1) zy1 = p.y;
        if (p.x > zx2) zx2 = p.x;
        if (p.y > zy2) zy2 = p.y;
      }
      expand(zx1, zy1);
      expand(zx2, zy2);
      items.push({
        id: `z:${z.id}`,
        kind: PcbSpatialKind.ZONE,
        refId: z.id,
        rect: { x1: zx1, y1: zy1, x2: zx2, y2: zy2 }
      });
    }
    if (!(bx1 < bx2 && by1 < by2)) {
      bx1 = 0; by1 = 0; bx2 = 3000; by2 = 2000;
    }
    this.spatialIndex.rebuild({ x1: bx1, y1: by1, x2: bx2, y2: by2 }, items);
    this.spatialDirty = false;
  }

  getSpatialIndex(): PcbSpatialIndex {
    this.ensureSpatialIndex();
    return this.spatialIndex;
  }

  private saveSnapshot(): void {
    if (!this.document || this.historyLocked) return;
    const json = JSON.stringify(this.document);
    const snapshot: PcbHistorySnapshot = {
      documentJson: json,
      selection: this.deepCloneSelection()
    };
    // 截断后续历史
    this.history = this.history.slice(0, this.historyIndex + 1);
    const vpCopy: ViewportState = {
      zoom: this.viewport.zoom,
      panOffset: { x: this.viewport.panOffset.x, y: this.viewport.panOffset.y },
      gridVisible: this.viewport.gridVisible,
      gridSize: this.viewport.gridSize,
      snapToGrid: this.viewport.snapToGrid
    };
    this.history.push({ snapshot, viewport: vpCopy });
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }
    this.historyIndex = this.history.length - 1;
  }

  private restoreSnapshot(entry: HistoryEntry): void {
    const parsed = JSON.parse(entry.snapshot.documentJson) as PcbDocument;
    normalizePcbDocument(parsed);
    this.document = parsed;
    this.selection = this.deepCloneSelectionFrom(entry.snapshot.selection);
    this.viewport = {
      zoom: entry.viewport.zoom,
      panOffset: { x: entry.viewport.panOffset.x, y: entry.viewport.panOffset.y },
      gridVisible: entry.viewport.gridVisible,
      gridSize: entry.viewport.gridSize,
      snapToGrid: entry.viewport.snapToGrid
    };
    this.refreshConnectivity();
  }

  private clearHistory(): void {
    this.history = [];
    this.historyIndex = -1;
  }

  private deepCloneSelection(): PcbSelectionState {
    return {
      kind: this.selection.kind,
      footprintIds: [...this.selection.footprintIds],
      trackIds: [...this.selection.trackIds],
      viaIds: [...this.selection.viaIds],
      zoneIds: [...this.selection.zoneIds]
    };
  }

  private deepCloneSelectionFrom(s: PcbSelectionState): PcbSelectionState {
    return {
      kind: s.kind,
      footprintIds: [...s.footprintIds],
      trackIds: [...s.trackIds],
      viaIds: [...s.viaIds],
      zoneIds: [...s.zoneIds]
    };
  }

  private deepCloneFootprint(src: PcbFootprintInst): PcbFootprintInst {
    const pads: PcbPad[] = [];
    for (const p of src.pads) {
      pads.push({
        id: p.id, number: p.number, type: p.type, shape: p.shape,
        pos: { x: p.pos.x, y: p.pos.y }, size: { x: p.size.x, y: p.size.y },
        drill: p.drill, layers: [...p.layers], netId: p.netId, netName: p.netName
      });
    }
    return {
      id: src.id, defId: src.defId, refDes: src.refDes, value: src.value,
      position: { x: src.position.x, y: src.position.y },
      rotation: src.rotation, mirrored: src.mirrored,
      layer: src.layer, locked: src.locked,
      pads, schematicCompId: src.schematicCompId
    };
  }

  /**
   * 2D/3D 点选走线/覆铜/过孔/封装 → 活动铜层切到对象所在层。
   * 层栈高亮仅对 Cu 行（F.Cu/B.Cu）；Mask/Core 不因点选铜线而亮。
   */
  private syncActiveLayerFromSelection(): void {
    if (!this.document) {
      return;
    }
    const fpN = this.selection.footprintIds.length;
    const trkN = this.selection.trackIds.length;
    const viaN = this.selection.viaIds.length;
    const zoneN = this.selection.zoneIds.length;
    const total = fpN + trkN + viaN + zoneN;
    if (total !== 1) {
      return;
    }
    if (trkN === 1) {
      for (let i = 0; i < this.document.tracks.length; i++) {
        const t = this.document.tracks[i];
        if (t.id === this.selection.trackIds[0] && isCopperLayer(t.layer)) {
          this.setActiveLayer(t.layer);
          return;
        }
      }
      return;
    }
    if (zoneN === 1) {
      for (let i = 0; i < this.document.zones.length; i++) {
        const z = this.document.zones[i];
        if (z.id === this.selection.zoneIds[0] && isCopperLayer(z.layer)) {
          this.setActiveLayer(z.layer);
          return;
        }
      }
      return;
    }
    if (viaN === 1) {
      for (let i = 0; i < this.document.vias.length; i++) {
        const v = this.document.vias[i];
        if (v.id !== this.selection.viaIds[0]) {
          continue;
        }
        // 活动层取跨越层首层（布线上下文）；层栈高亮由页面按 via 跨越层展开
        if (v.layers.length > 0 && isCopperLayer(v.layers[0])) {
          this.setActiveLayer(v.layers[0]);
        }
        return;
      }
      return;
    }
    if (fpN === 1) {
      for (let i = 0; i < this.document.footprints.length; i++) {
        const fp = this.document.footprints[i];
        if (fp.id === this.selection.footprintIds[0] && isCopperLayer(fp.layer)) {
          this.setActiveLayer(fp.layer);
          return;
        }
      }
    }
  }

  private publishSelection(): void {
    this.syncActiveLayerFromSelection();
    const data = new PcbEditorSelectionData();
    data.footprintIds = [...this.selection.footprintIds];
    data.trackIds = [...this.selection.trackIds];
    data.viaIds = [...this.selection.viaIds];
    data.zoneIds = [...this.selection.zoneIds];
    EventBus.getInstance().publish({
      event: ModuleEvent.SELECTION_CHANGED,
      source: 'pcb_editor',
      timestamp: Date.now(),
      data: data
    });
  }

  private publishChanged(): void {
    const doc = this.document;
    EventBus.getInstance().publish({
      event: ModuleEvent.PCB_CHANGED,
      source: 'pcb_editor',
      timestamp: Date.now(),
      data: doc !== null ? doc : this.viewport
    });
  }
}

// ── Module-level helpers ──

function isLayerVisible(doc: PcbDocument, layer: PcbLayerId): boolean {
  for (const l of doc.layers) { if (l.id === layer) return l.visible; }
  return true;
}

function pointDist(p1: Point2D, p2: Point2D): number {
  const dx = p1.x - p2.x; const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function pointToSegmentDist(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return pointDist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const proj: Point2D = { x: a.x + t * dx, y: a.y + t * dy };
  return pointDist(p, proj);
}

function segmentDist(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): number {
  const mids = [pointDist(a1, b1), pointDist(a1, b2), pointDist(a2, b1), pointDist(a2, b2)];
  return Math.min(...mids);
}

/** 线段与轴对齐矩形相交（含端点在矩形内） */
function segmentIntersectsRect(a: Point2D, b: Point2D,
  rx1: number, ry1: number, rx2: number, ry2: number): boolean {
  const pointIn = (p: Point2D): boolean =>
    p.x >= rx1 && p.x <= rx2 && p.y >= ry1 && p.y <= ry2;
  if (pointIn(a) || pointIn(b)) return true;
  const corners: Point2D[] = [
    { x: rx1, y: ry1 }, { x: rx2, y: ry1 },
    { x: rx2, y: ry2 }, { x: rx1, y: ry2 }
  ];
  const edges: Point2D[][] = [
    [corners[0], corners[1]], [corners[1], corners[2]],
    [corners[2], corners[3]], [corners[3], corners[0]]
  ];
  for (const e of edges) {
    if (segmentsCross(a, b, e[0], e[1])) return true;
  }
  return false;
}

function orient(p: Point2D, q: Point2D, r: Point2D): number {
  const v = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  if (Math.abs(v) < 1e-9) return 0;
  return v > 0 ? 1 : 2;
}

function onSegment(p: Point2D, q: Point2D, r: Point2D): boolean {
  return q.x <= Math.max(p.x, r.x) + 1e-9 && q.x >= Math.min(p.x, r.x) - 1e-9 &&
    q.y <= Math.max(p.y, r.y) + 1e-9 && q.y >= Math.min(p.y, r.y) - 1e-9;
}

function segmentsCross(p1: Point2D, q1: Point2D, p2: Point2D, q2: Point2D): boolean {
  const o1 = orient(p1, q1, p2);
  const o2 = orient(p1, q1, q2);
  const o3 = orient(p2, q2, p1);
  const o4 = orient(p2, q2, q1);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}

function viaSpansLayer(layers: PcbLayerId[], layer: PcbLayerId): boolean {
  for (const l of layers) {
    if (l === layer) return true;
  }
  if (layers.length >= 2 && layers[0] === PcbLayerId.F_CU && layers[layers.length - 1] === PcbLayerId.B_CU) {
    return isCopperLayer(layer);
  }
  return false;
}
