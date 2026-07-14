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
  setZoom(scale: number): void;
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
  duplicateDevice(instUuid: string, offsetX?: number, offsetY?: number): ApiResult<string>;
  setComponentLocked(componentId: string, locked: boolean): ApiResult<void>;
  isComponentLocked(componentId: string): boolean;
  setGridSize(size: number): void;
}
