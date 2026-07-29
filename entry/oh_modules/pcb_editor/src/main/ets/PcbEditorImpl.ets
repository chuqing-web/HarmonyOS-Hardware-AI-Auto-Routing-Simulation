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
  autoRoutePcb, AutoRouteResult, rerouteNets,
  rebuildZoneCutouts, pointInPolygon, makeRectCutout, normalizeZoneFields, defaultZoneFields,
  SchematicDocument, ApiResult, ResultHelper, ErrCode,
  normalizePcbDocument, isCopperLayer, applyCopperLayerCount, copperLayersFromStack,
  PcbSelectionState, PcbSelectionKind, PcbHistorySnapshot,
  pcbSelectionEmpty, PcbSelectionRect, padWorldPosition,
  collectFootprintPadPositions, updateTracksForFootprintTransform, padSnapTolerance,
  snapTrackEndpointsToPads, syncMovedTrackJunctions, TrackEndpointSnapshot,
  collectNetIdsForFootprints,
  tracePcbAutoRoute, tracePcbManualRoute, tracePcbManualRouteReject,
  tracePcbTrackAdded, tracePcbDrc, tracePcbNetRoutingSummary,
  PcbAppearance, PcbAppearanceMode, defaultPcbAppearance, PcbRatsnestEdge,
  PcbViaKind, rebuildPcbNets, buildRatsnest, routeOrtho45Points, findNetClass,
  sumTrackLengthForNet
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
  private ratsnestCache: PcbRatsnestEdge[] = [];
  private hoverWorld: Point2D | null = null;

  // ── Undo/Redo ──
  private history: HistoryEntry[] = [];
  private historyIndex: number = -1;
  private historyLocked: boolean = false;

  // ── Route state ──
  private routeStartPoint: Point2D | null = null;
  private routePreviewPoint: Point2D | null = null;
  private routeViolationCount: number = 0;

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

  // ── Clipboard ──
  private clipboard: PcbFootprintInst[] = [];

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

  loadDocument(doc: PcbDocument): void {
    normalizePcbDocument(doc);
    rebuildPcbNets(doc);
    this.document = doc;
    this.selection = pcbSelectionEmpty();
    this.ratsnestCache = buildRatsnest(doc);
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
    this.activeLayer = layer;
  }

  setLayerVisible(layer: PcbLayerId, visible: boolean): void {
    if (!this.document) return;
    for (const l of this.document.layers) {
      if (l.id === layer) { l.visible = visible; break; }
    }
    this.publishChanged();
  }

  getAppearance(): PcbAppearance {
    return this.appearance;
  }

  setAppearanceMode(mode: PcbAppearanceMode): void {
    this.appearance.mode = mode;
    this.publishChanged();
  }

  setHighlightNet(netId: string): void {
    this.appearance.highlightNetId = netId ?? '';
    this.publishChanged();
  }

  clearHighlightNet(): void {
    this.appearance.highlightNetId = '';
    this.publishChanged();
  }

  setHideZones(hide: boolean): void {
    this.appearance.hideZones = hide;
    this.publishChanged();
  }

  setShowRatsnest(show: boolean): void {
    this.appearance.showRatsnest = show;
    this.publishChanged();
  }

  setShow3d(show: boolean): void {
    this.appearance.show3d = show;
    this.publishChanged();
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
      }
      this.publishSelection();
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

    for (const fp of this.document.footprints) {
      const bb = this.footprintBoundingBox(fp);
      if (bb.x1 <= rx2 && bb.x2 >= rx1 && bb.y1 <= ry2 && bb.y2 >= ry1) {
        fpIds.push(fp.id);
      }
    }
    for (const trk of this.document.tracks) {
      if (!isLayerVisible(this.document!, trk.layer)) continue;
      if (trk.start.x >= rx1 && trk.start.x <= rx2 && trk.start.y >= ry1 && trk.start.y <= ry2) {
        trkIds.push(trk.id);
      } else if (trk.end.x >= rx1 && trk.end.x <= rx2 && trk.end.y >= ry1 && trk.end.y <= ry2) {
        trkIds.push(trk.id);
      }
    }
    for (const via of this.document.vias) {
      if (via.position.x >= rx1 && via.position.x <= rx2 &&
        via.position.y >= ry1 && via.position.y <= ry2) {
        viaIds.push(via.id);
      }
    }

    if (additive) {
      for (const id of fpIds) { if (!this.selection.footprintIds.includes(id)) this.selection.footprintIds.push(id); }
      for (const id of trkIds) { if (!this.selection.trackIds.includes(id)) this.selection.trackIds.push(id); }
      for (const id of viaIds) { if (!this.selection.viaIds.includes(id)) this.selection.viaIds.push(id); }
    } else {
      this.selection.footprintIds = fpIds;
      this.selection.trackIds = trkIds;
      this.selection.viaIds = viaIds;
      this.selection.zoneIds = [];
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
    this.publishSelection();
  }

  selectVia(id: string): void {
    this.selection = { kind: PcbSelectionKind.VIA, footprintIds: [], trackIds: [], viaIds: [id], zoneIds: [] };
    this.publishSelection();
  }

  selectZone(id: string): void {
    this.selection = { kind: PcbSelectionKind.ZONE, footprintIds: [], trackIds: [], viaIds: [], zoneIds: [id] };
    this.publishSelection();
  }

  // ═══════════════════════════════════════════════════
  //  Move / Rotate
  // ═══════════════════════════════════════════════════

  // ── Move transaction (undo + zone rebuild) ──
  private moveInProgress: boolean = false;

  beginMoveOperation(): void {
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

    // 移动结束仅吸附端点到焊盘，不再整网重布 — 避免拖拽橡皮筋结果被 L 布线瞬间替换导致闪断/跳变
    snapTrackEndpointsToPads(this.document);

    for (const z of this.document.zones) {
      rebuildZoneCutouts(z, this.document);
    }
    this.touchModified();
    this.publishChanged();
  }

  /** 移动所有被选中对象（封装 + 走线端点 + 过孔），未选中的走线端点跟随焊盘并传播折点 */
  moveSelected(dx: number, dy: number): void {
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
    if (!movingFootprints && trkSet.size > 0) {
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
        if (trkSet.has(trk.id)) {
          trk.start.x += dx;
          trk.start.y += dy;
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
    }

    if (trackSnapshots.length > 0) {
      syncMovedTrackJunctions(this.document, trkSet, trackSnapshots);
    }

    this.touchModified();
    this.publishChanged();
  }

  moveSelectedFootprints(dx: number, dy: number): void {
    this.moveSelected(dx, dy);
  }

  rotateSelected(clockwise: boolean = true): void {
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
      const affectedNets = collectNetIdsForFootprints(this.document, fpSet);
      updateTracksForFootprintTransform(this.document, fpSet, oldPadPositions, affectedNets);
      if (affectedNets.size > 0) {
        const layer = isCopperLayer(this.activeLayer) ? this.activeLayer : PcbLayerId.F_CU;
        rerouteNets(this.document, layer, affectedNets);
      }
    }
    for (const z of this.document.zones) {
      rebuildZoneCutouts(z, this.document);
    }
    this.touchModified();
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
      const path = routeOrtho45Points(this.routeStartPoint, this.routePreviewPoint);
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
    const path = routeOrtho45Points(this.routeStartPoint, snappedEnd);

    // 提交前最后一次实时 DRC 检查
    const violations = this.checkPathClearance(path);
    if (violations > 0) {
      tracePcbManualRouteReject('实时DRC',
        `路径存在 ${violations} 处违规`, `${violations} violations`);
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

  /** 布线中切换铜层：当前位置自动插过孔 */
  switchRouteLayer(layer: PcbLayerId): PcbVia | null {
    if (!isCopperLayer(layer)) return null;
    if (layer === this.activeLayer) return null;
    const pos = this.routeStartPoint ?? this.routePreviewPoint;
    let via: PcbVia | null = null;
    if (pos) {
      const net = this.findNetAtPoint(pos);
      via = this.addVia(pos, net?.netId, net?.netName, PcbViaKind.THROUGH,
        this.activeLayer, layer);
    }
    this.activeLayer = layer;
    this.routeViolationCount = 0;
    this.publishChanged();
    return via;
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

    // P 线: startP → previewP
    const pathP = routeOrtho45Points(ds.startP, ds.previewP);
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
        netName: ds.dpName + '_P'
      };
      this.document.tracks.push(trk);
      count++;
    }

    // N 线: startN → previewN
    const pathN = routeOrtho45Points(ds.startN, ds.previewN);
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
        netName: ds.dpName + '_N'
      };
      this.document.tracks.push(trk);
      count++;
    }

    // 更新起点为终点，继续布线
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
    this.outlineEditPoints = [];
    this.publishChanged();
  }

  addOutlinePoint(pt: Point2D): void {
    this.outlineEditPoints.push(this.snapPoint(pt));
    this.publishChanged();
  }

  commitOutlineEdit(): boolean {
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
    if (!this.document) return;
    if (this.selection.footprintIds.length === 0) return;
    this.saveSnapshot();
    const idSet = new Set(this.selection.footprintIds);
    for (const fp of this.document.footprints) {
      if (!idSet.has(fp.id) || fp.locked) continue;
      fp.mirrored = !fp.mirrored;
      fp.layer = fp.mirrored ? PcbLayerId.B_CU : PcbLayerId.F_CU;
    }
    this.touchModified();
    this.publishChanged();
  }


  // ═══════════════════════════════════════════════════
  //  Auto Route / DRC
  // ═══════════════════════════════════════════════════

  runAutoRoute(): ApiResult<AutoRouteResult> {
    if (!this.document) return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '无 PCB 文档');
    this.saveSnapshot();
    const layer = isCopperLayer(this.activeLayer) ? this.activeLayer : PcbLayerId.F_CU;
    const result = autoRoutePcb(this.document, layer);
    tracePcbAutoRoute(this.document, layer, result.netCount, result.trackCount, result.messages);
    this.touchModified();
    this.publishChanged();
    return ResultHelper.ok(result);
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
          message: `差分对 ${dp.name} 长度差 ${diff.toFixed(1)}mil > ${dp.lengthTolMil}mil`,
          netId: dp.netIdP
        });
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

    return violations;
  }

  // ═══════════════════════════════════════════════════
  //  Delete / Copy
  // ═══════════════════════════════════════════════════

  deleteSelected(): void {
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
    const tol = Math.max(15, (this.document.metadata.gridSize ?? 5) * 3);
    let best: PcbTrack | null = null;
    let bestDist = tol;
    for (const trk of this.document.tracks) {
      if (!isLayerVisible(this.document, trk.layer)) continue;
      const d = pointToSegmentDist({ x: worldX, y: worldY }, trk.start, trk.end);
      const hitDist = d - trk.width / 2;
      if (hitDist <= bestDist) { bestDist = hitDist; best = trk; }
    }
    return best;
  }

  hitTestVia(worldX: number, worldY: number): PcbVia | null {
    if (!this.document) return null;
    const tol = Math.max(18, (this.document.metadata.gridSize ?? 5) * 3);
    let best: PcbVia | null = null;
    let bestDist = tol;
    for (const via of this.document.vias) {
      const d = pointDist({ x: worldX, y: worldY }, via.position);
      const hitDist = d - via.diameter / 2;
      if (hitDist <= bestDist) { bestDist = hitDist; best = via; }
    }
    return best;
  }

  hitTestZone(worldX: number, worldY: number): PcbZone | null {
    if (!this.document) return null;
    const world: Point2D = { x: worldX, y: worldY };
    for (let i = this.document.zones.length - 1; i >= 0; i--) {
      const z = this.document.zones[i];
      if (!isLayerVisible(this.document, z.layer)) continue;
      if (pointInPolygon(world, z.outline)) return z;
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

  private publishSelection(): void {
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

function viaSpansLayer(layers: PcbLayerId[], layer: PcbLayerId): boolean {
  for (const l of layers) {
    if (l === layer) return true;
  }
  if (layers.length >= 2 && layers[0] === PcbLayerId.F_CU && layers[layers.length - 1] === PcbLayerId.B_CU) {
    return isCopperLayer(layer);
  }
  return false;
}
