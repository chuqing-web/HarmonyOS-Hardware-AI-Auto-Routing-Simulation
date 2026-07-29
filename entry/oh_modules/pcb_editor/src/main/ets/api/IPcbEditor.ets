/**
 * PCB 编辑器 API
 */
import {
  PcbDocument, PcbFootprintInst, PcbTrack, PcbVia, PcbZone, PcbLayerId,
  PcbDrcViolation, Point2D, ViewportState, ApiResult, AutoRouteResult,
  PcbSelectionState, PcbAppearance, PcbAppearanceMode, PcbRatsnestEdge,
  PcbViaKind
} from 'common';

export { AutoRouteResult } from 'common';

export interface DiffRouteState {
  dpName: string;
  netIdP: string;
  netIdN: string;
  startP: Point2D;
  startN: Point2D;
  previewP: Point2D;
  previewN: Point2D;
  gap: number;
}

export interface DiffPairPreview {
  p: Point2D;
  n: Point2D;
}

export enum PcbToolMode {
  SELECT = 'select',
  ROUTE = 'route',
  VIA = 'via',
  POUR = 'pour',
  ZONE_POLY = 'zone_poly',
  OUTLINE = 'outline',
  MEASURE = 'measure',
  PLACE_FP = 'place_fp'
}

export interface IPcbEditor {
  loadDocument(doc: PcbDocument): void;
  getDocument(): PcbDocument | null;
  getViewport(): ViewportState;
  setViewport(vp: ViewportState): void;
  panBy(dx: number, dy: number): void;
  zoomAt(factor: number, screenX: number, screenY: number): void;
  fitBoardInView(viewW?: number, viewH?: number): void;
  getActiveLayer(): PcbLayerId;
  setActiveLayer(layer: PcbLayerId): void;
  setLayerVisible(layer: PcbLayerId, visible: boolean): void;

  /** Appearance / 网络高亮 */
  getAppearance(): PcbAppearance;
  setAppearanceMode(mode: PcbAppearanceMode): void;
  setHighlightNet(netId: string): void;
  clearHighlightNet(): void;
  setHideZones(hide: boolean): void;
  setShowRatsnest(show: boolean): void;
  setShow3d(show: boolean): void;
  getRatsnest(): PcbRatsnestEdge[];
  rebuildNets(): void;
  setCopperLayerCount(count: number): boolean;

  /** 统一选择模型 */
  getSelection(): PcbSelectionState;
  selectAt(worldX: number, worldY: number, additive: boolean): void;
  selectRect(x1: number, y1: number, x2: number, y2: number, additive: boolean): void;
  clearSelection(): void;

  /** 移动所有被选中的对象（封装/走线/过孔） */
  beginMoveOperation(): void;
  endMoveOperation(): void;
  moveSelected(dx: number, dy: number): void;
  rotateSelected(clockwise?: boolean): void;
  flipSelected(): void;

  /** 布线 */
  startRoute(point: Point2D): Point2D;
  previewRoute(point: Point2D): Point2D;
  commitRoute(end: Point2D): PcbTrack | null;
  cancelRoute(): void;
  /** 换层并在当前位置自动插入过孔 */
  switchRouteLayer(layer: PcbLayerId): PcbVia | null;

  addVia(pos: Point2D, netId?: string, netName?: string, kind?: PcbViaKind): PcbVia | null;
  addGroundPour(): PcbZone | null;
  /** 多边形敷铜：点列闭合后提交 */
  beginZonePoly(netId?: string, netName?: string): void;
  addZonePolyPoint(pt: Point2D): void;
  commitZonePoly(): PcbZone | null;
  cancelZonePoly(): void;
  getZonePolyPreview(): Point2D[];

  /** 板框编辑 */
  beginOutlineEdit(): void;
  addOutlinePoint(pt: Point2D): void;
  commitOutlineEdit(): boolean;
  cancelOutlineEdit(): void;
  getOutlinePreview(): Point2D[];

  /** 测量 */
  setMeasurePoint(pt: Point2D): number;
  getMeasurePoints(): Point2D[];
  clearMeasure(): void;

  /** 放置封装 */
  setPlaceFootprintDefId(defId: string): void;
  placeFootprintAt(pos: Point2D): PcbFootprintInst | null;

  addZoneManualCutout(zoneId: string, center: Point2D, halfSize: number): boolean;
  adjustZonePriority(zoneId: string, delta: number): boolean;
  setZoneThermalRelief(zoneId: string, enabled: boolean): boolean;
  refreshZoneCutouts(zoneId: string): boolean;
  deleteSelected(): void;
  copySelected(): boolean;
  pasteClipboard(): number;
  hitTestTrack(worldX: number, worldY: number): PcbTrack | null;
  hitTestVia(worldX: number, worldY: number): PcbVia | null;
  hitTestZone(worldX: number, worldY: number): PcbZone | null;
  hitTestFootprint(worldX: number, worldY: number): PcbFootprintInst | null;
  runAutoRoute(): ApiResult<AutoRouteResult>;
  snapPoint(pt: Point2D): Point2D;
  snapToPadOrGrid(world: Point2D): Point2D;
  screenToWorld(sx: number, sy: number): Point2D;
  worldToScreen(wx: number, wy: number): Point2D;
  runDrc(): PcbDrcViolation[];
  forwardAnnotateFromSchematic(): ApiResult<PcbDocument>;
  reverseAnnotateToSchematic(): ApiResult<number>;

  /** 撤销/重做 */
  canUndo(): boolean;
  canRedo(): boolean;
  undo(): boolean;
  redo(): boolean;

  /** 走线是否进行中 */
  isRouteActive(): boolean;
  getRouteStart(): Point2D | null;
  getRoutePreview(): Point2D | null;
  /** 实时 DRC：当前预览路径是否违规 */
  isRoutePreviewViolating(): boolean;

  /** 差分对布线 */
  startDiffRoute(point: Point2D, dpName?: string): Point2D | null;
  previewDiffRoute(point: Point2D): DiffPairPreview | null;
  commitDiffRoute(end: Point2D): number;
  cancelDiffRoute(): void;
  isDiffRouteActive(): boolean;
  getDiffRouteState(): DiffRouteState | null;

  getHoverNetName(): string;
  setHoverWorld(world: Point2D | null): void;
}
