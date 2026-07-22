/**
 * 模块1：原理图图形编辑器 API（v2 完备版）
 */
import {
  SchTopology, DeviceInst, NetInfo, RouteResult, ErcError, ProbeInfo,
  Point2D, ViewportState, ErrCode, ApiResult, Rect2D,
  SchematicAnnotation, SchematicAnnotationStatus, SchematicAnnotationType,
  AnnotationTargetKind,
  SchematicDocument, ComponentInstance, ErcViolation
} from 'common';
import { SchematicLayer, SchematicLayerId } from '../model/SchematicLayers';

export type AlignType = 'left' | 'right' | 'top' | 'bottom' | 'hcenter' | 'vcenter';
export type DistributeType = 'horiz' | 'vert';

export interface BatchDeviceItem {
  libId: string;
  x: number;
  y: number;
  refName?: string;
}

/** 批注局部更新（替代 Partial<SchematicAnnotation>） */
export interface SchematicAnnotationPatch {
  author?: string;
  text?: string;
  type?: SchematicAnnotationType;
  status?: SchematicAnnotationStatus;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  arrowEndX?: number;
  arrowEndY?: number;
  targetUuid?: string;
  targetKind?: AnnotationTargetKind;
  createdAt?: string;
  updatedAt?: string;
}

/** 器件参数批量更新（替代 Record<string, string>） */
export interface ComponentParamEntry {
  key: string;
  value: string;
}

export interface ComponentParamsUpdate {
  entries: ComponentParamEntry[];
}

export interface ISchematicEditor {
  // ---- 仿真互锁 ----
  setSimBusy(busy: boolean): void;
  isSimBusy(): boolean;

  // ---- 拓扑 ----
  getFullTopology(subCircuitUuid?: string): SchTopology;
  loadTopology(topo: SchTopology): ApiResult<void>;
  getSelectedDevices(): DeviceInst[];
  getSelectedNets(): NetInfo[];

  // ---- ERC ----
  runERC(topo?: SchTopology, autoFixSuggest?: boolean): ErcError[];
  runPartialERC(devInstUuid: string): ErcError[];
  autoFixERC(topo: SchTopology, errors: ErcError[]): number;

  // ---- 布线 ----
  applyRouteResult(routeData: RouteResult, keepManualRoute?: boolean): ErrCode;
  clearSelectedRoute(): void;
  clearAllRoute(): void;

  // ---- 单器件 ----
  addDevice(libDevId: string, x: number, y: number, refName?: string): ApiResult<DeviceInst>;
  deleteDevice(instUuid: string): ApiResult<void>;
  setDeviceParam(instUuid: string, key: string, value: string): ApiResult<void>;
  rotateDevice(instUuid: string, angle: number): ApiResult<void>;
  mirrorDevice(instUuid: string, horizontal: boolean): ApiResult<void>;

  // ---- 批量 ----
  batchAddDevice(devList: BatchDeviceItem[]): number;
  batchDeleteDevice(instUuidList: string[]): number;
  batchSetParam(instUuidList: string[], key: string, unifiedValue: string): ApiResult<number>;
  batchAlign(instUuids: string[], alignType: AlignType): ApiResult<void>;
  batchDistribute(instUuids: string[], dir: DistributeType): ApiResult<void>;

  // ---- 总线/网络/端口 ----
  createBus(x1: number, y1: number, x2: number, y2: number, bitCount?: number): ApiResult<string>;
  assignBusNet(busUuid: string, netNameList: string[]): ApiResult<void>;
  createNetLabel(x: number, y: number, netName: string): ApiResult<string>;
  /** 修改已有网络标号文本（同名并网）；返回所属 netId */
  renameNetLabel(labelId: string, netName: string): ApiResult<string>;
  /** 命中网络标号（世界坐标），未命中返回 null */
  hitTestNetLabel(world: Point2D, tol?: number): string | null;
  attachPowerSymbolNet(compId: string): ApiResult<void>;
  createSubPort(subUuid: string, portName: string, dir?: 'in' | 'out' | 'inout'): ApiResult<string>;

  // ---- 探针 ----
  addVoltageProbe(netName: string, x: number, y: number): ApiResult<string>;
  addCurrentProbe(devPinUuid: string): ApiResult<string>;
  deleteProbe(probeId: string): void;
  bindProbeToOsc(probeId: string, ch: number): ApiResult<void>;
  getProbes(): ProbeInfo[];

  // ---- 视图/撤销 ----
  getViewport(): ViewportState;
  zoomCanvas(scale: number): void;
  moveView(dx: number, dy: number): void;
  fitAllInView(): void;
  /** 将指定世界坐标矩形适配到视口（区域放大） */
  fitRectInView(rect: Rect2D): void;
  setZoom(scale: number): void;
  /** 以屏幕坐标 (sx,sy) 为锚点缩放到 level，保持该点下世界坐标不变 */
  zoomAt(sx: number, sy: number, level: number): void;
  /** 以锚点缩放；省略坐标时以视口中心为锚点 */
  zoomByFactor(factor: number, sx?: number, sy?: number): void;
  getZoom(): number;
  panBy(dx: number, dy: number): void;
  undo(): ApiResult<void>;
  redo(): ApiResult<void>;
  canUndo(): boolean;
  canRedo(): boolean;
  setUndoCacheCount(maxStep: number): void;
  clearUndoStack(): void;

  // ---- 批注协作 ----
  addAnnotation(annotation: SchematicAnnotation): ApiResult<SchematicAnnotation>;
  updateAnnotation(id: string, patch: SchematicAnnotationPatch): ApiResult<void>;
  deleteAnnotation(id: string): ApiResult<void>;
  listAnnotations(statusFilter?: SchematicAnnotationStatus): SchematicAnnotation[];
  focusAnnotationTarget(annotationId: string): ApiResult<Point2D>;
  loadAnnotations(annotations: SchematicAnnotation[]): void;
  getAnnotations(): SchematicAnnotation[];

  // ---- 兼容 v1 ----
  getDocument(): SchematicDocument;
  loadDocument(doc: SchematicDocument): ApiResult<void>;
  placeComponent(libraryId: string, position: Point2D): ApiResult<ComponentInstance>;
  updateComponentParams(id: string, params: ComponentParamsUpdate): ApiResult<void>;
  rotateComponent(id: string, angle: number): ApiResult<void>;
  deleteComponent(id: string): ApiResult<void>;
  runErc(): ApiResult<ErcViolation[]>;
  exportTopologyJson(): ApiResult<string>;
  hitTestAt(point: Point2D): string[];
  selectAt(point: Point2D): string[];
  selectInRect(rect: Rect2D): string[];
  selectAll(): string[];
  toggleSelection(id: string): string[];
  setSelection(ids: string[]): void;
  getLayers(): SchematicLayer[];
  setLayerVisible(layerId: SchematicLayerId, visible: boolean): void;
  setLayerLocked(layerId: SchematicLayerId, locked: boolean): void;
  isLayerVisible(layerId: SchematicLayerId): boolean;
  isLayerLocked(layerId: SchematicLayerId): boolean;
  moveComponent(componentId: string, position: Point2D): ApiResult<void>;
  moveComponents(ids: string[], delta: Point2D): ApiResult<void>;
  addWireSegment(from: Point2D, to: Point2D, netId?: string): ApiResult<string>;
  addWireWithPoints(waypoints: Point2D[], netId?: string): ApiResult<string>;
  /**
   * WAR 入口（Proteus Wire Auto Router）：动态预览并写入 Path Buffer。
   * 落线必须 commitWarBufferedPath / addWireWithPoints 复用缓冲，禁止二次寻路。
   */
  previewWirePath(waypoints: Point2D[]): WirePathPreviewResult;
  /**
   * 确认落线：仅使用 Path Buffer；校验仍无碰撞则生成导线，否则拒绝（不重算）。
   */
  commitWarBufferedPath(netId?: string): ApiResult<string>;
  /** 清除 WAR 路径缓冲（取消连线时） */
  clearWarPathBuffer(): void;
  /** Tools 工具栏 WAR 开关（默认开启） */
  setWarEnabled(enabled: boolean): void;
  isWarEnabled(): boolean;
  duplicateDevice(instUuid: string, offsetX?: number, offsetY?: number): ApiResult<string>;
  setComponentLocked(componentId: string, locked: boolean): ApiResult<void>;
  isComponentLocked(componentId: string): boolean;
  setGridSize(size: number): void;
}

/** WAR 预览 / 落线应用路径（previewWirePath 唯一返回类型） */
export interface WirePathPreviewResult {
  points: Point2D[];
  /** true=已自动寻路避让（相对默认 L 有改道） */
  autoCorrected: boolean;
  /**
   * true=无合法无碰撞路径（不可落线）。
   * 穿选中区时必须 blocked，禁止返回穿障折线。
   */
  blocked?: boolean;
}
