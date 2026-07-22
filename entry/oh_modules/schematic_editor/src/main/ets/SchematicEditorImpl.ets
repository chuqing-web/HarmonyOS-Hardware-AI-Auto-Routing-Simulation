/**
 * 模块1：原理图编辑器完备实现 v2
 */
import {
  ISchematicEditor, BatchDeviceItem, AlignType, DistributeType,
  SchematicAnnotationPatch, ComponentParamsUpdate
} from './api/ISchematicEditor';
import { EditorInternals } from './internal/EditorInternals';
import { SchematicLayer, createDefaultLayers, SchematicLayerId } from './model/SchematicLayers';
import { CommandHistory, MoveCommand, PlaceCommand, BatchDeleteCommand,
  AddWireCommand, ClearWiresCommand, RotateCommand, MirrorCommand,
  SetDeviceParamCommand, ApplyRouteCommand, BatchMoveCommand, BatchMoveEntry,
  BatchSetDeviceParamCommand, LoadDocumentCommand } from './internal/EditCommands';
import {
  SchematicDocument, ComponentInstance, Net, NetLabel, Point2D,
  Pin, Rotation, ErcViolation, Rect2D, ViewportState, BusWidth, WireStyle, NetType, Port,
  EventBus, ModuleEvent, IdUtil, DeepErcEngine, ErrCode, Logger, Validate,
  ResultHelper, ApiResult, TopologyAdapter, TopologyPatchApplier,
  SchTopology, DeviceInst, NetInfo, RouteResult, ErcError, ProbeInfo, BusInfo,
  CallbackRegistry, SubCircuitBlock,
  FeatureGate, SchematicAnnotation, SchematicAnnotationStatus, ProbeMeta,
  ErcSeverity, ErcRuleType, PinType, Wire, SchematicMetadata, SubcircuitRef,
  SimulationConfig,
  calcSymbolBounds, pointInSymbolBounds, SymbolBounds,
  mapAwareStringify, mapAwareParse,
  rebuildAllNetPinConnectivity, PinGeometryResolver, PinGeometry
} from 'common';

type ComponentBoundsResolver = (libraryId: string) => SymbolBounds | null;
type PinResolver = (libraryId: string) => Pin[] | null;
type DefaultParamsResolver = (libraryId: string) => Map<string, string> | null;

interface WirePathScore {
  score: number;
  intersectsBody: boolean;
  pinHits: number;
}

interface PinAtPoint {
  comp: ComponentInstance;
  pin: Pin;
  pinWorld: Point2D;
}

export class SchematicEditorImpl implements ISchematicEditor {
  private document: SchematicDocument | null = null;
  private topology: SchTopology | null = null;
  private viewport: ViewportState = SchematicEditorImpl.createDefaultViewport();
  private undoLimit: number = 1000;
  private layers: SchematicLayer[] = createDefaultLayers();
  private commandHistory: CommandHistory = new CommandHistory();
  private lockedComponentIds: Set<string> = new Set();
  private selectedIds: string[] = [];
  private selectedNetIds: string[] = [];
  private refDesCounters: Map<string, number> = new Map();
  private simBusy: boolean = false;
  private probes: ProbeInfo[] = [];
  private buses: BusInfo[] = [];
  private annotations: SchematicAnnotation[] = [];
  private readOnlyMode: boolean = false;
  private boundsResolver: ComponentBoundsResolver | null = null;
  private pinResolver: PinResolver | null = null;
  private defaultParamsResolver: DefaultParamsResolver | null = null;
  private canvasViewWidth: number = 0;
  private canvasViewHeight: number = 0;
  /** 点击选中外扩（世界坐标） */
  private static readonly HIT_PAD: number = 22;
  /** 悬停感应外扩：鼠标靠近即显示选中区 */
  static readonly HOVER_PAD: number = 36;
  private static readonly WIRE_HIT_THRESHOLD: number = 10;

  isCanvasViewReady(): boolean {
    return this.canvasViewWidth > 0 && this.canvasViewHeight > 0;
  }

  setCanvasViewSize(width: number, height: number): void {
    this.canvasViewWidth = Math.max(0, width);
    this.canvasViewHeight = Math.max(0, height);
  }

  /** World-space hit rectangle for click overlay (includes HIT_PAD). */
  getComponentHitRect(comp: ComponentInstance): Rect2D {
    const bounds = this.expandLocalBounds(this.resolveBounds(comp.libraryId), SchematicEditorImpl.HIT_PAD);
    return this.localBoundsToWorldAabb(comp, bounds);
  }

  /** 悬停选中区（更大外扩，靠近即出现） */
  getComponentHoverRect(comp: ComponentInstance): Rect2D {
    const bounds = this.expandLocalBounds(this.resolveBounds(comp.libraryId), SchematicEditorImpl.HOVER_PAD);
    return this.localBoundsToWorldAabb(comp, bounds);
  }

  /** 选中高亮框：紧贴符号，略外扩，避免像命中区那样过大 */
  getComponentSelectRect(comp: ComponentInstance): Rect2D {
    const bounds = this.expandLocalBounds(this.resolveBounds(comp.libraryId), 8);
    return this.localBoundsToWorldAabb(comp, bounds);
  }

  isComponentSelected(compId: string): boolean {
    return this.selectedIds.includes(compId);
  }

  getSelectedWireNetIds(): string[] {
    return this.selectedNetIds.slice();
  }

  setComponentBoundsResolver(resolver: ComponentBoundsResolver): void {
    this.boundsResolver = resolver;
  }

  setPinResolver(resolver: PinResolver): void {
    this.pinResolver = resolver;
  }

  setDefaultParamsResolver(resolver: DefaultParamsResolver): void {
    this.defaultParamsResolver = resolver;
  }

  private static createDefaultViewport(): ViewportState {
    const panOffset: Point2D = { x: 0, y: 0 };
    const vp: ViewportState = {
      zoom: 1.0,
      panOffset: panOffset,
      gridVisible: true,
      gridSize: 10,
      snapToGrid: true
    };
    return vp;
  }

  private static copyPoint2D(p: Point2D): Point2D {
    return { x: p.x, y: p.y };
  }

  private static copyProbeList(source: ProbeInfo[]): ProbeInfo[] {
    const result: ProbeInfo[] = [];
    for (let i = 0; i < source.length; i++) {
      result.push(source[i]);
    }
    return result;
  }

  private static copyBusList(source: BusInfo[]): BusInfo[] {
    const result: BusInfo[] = [];
    for (let i = 0; i < source.length; i++) {
      result.push(source[i]);
    }
    return result;
  }

  private static copyAnnotationList(source: SchematicAnnotation[]): SchematicAnnotation[] {
    const result: SchematicAnnotation[] = [];
    for (let i = 0; i < source.length; i++) {
      result.push(source[i]);
    }
    return result;
  }

  private static copyStringArray(source: string[]): string[] {
    const result: string[] = [];
    for (let i = 0; i < source.length; i++) {
      result.push(source[i]);
    }
    return result;
  }

  private static emptyParameters(): Map<string, string> {
    return new Map<string, string>();
  }

  private static copyParameters(source: Map<string, string>): Map<string, string> {
    const m = new Map<string, string>();
    source.forEach((value: string, key: string) => {
      m.set(key, value);
    });
    return m;
  }

  private static normalizeRotation(angle: number): Rotation {
    const n: number = angle % 360;
    if (n === 90) {
      return 90;
    }
    if (n === 180) {
      return 180;
    }
    if (n === 270) {
      return 270;
    }
    return 0;
  }

  private static applyAnnotationPatch(
    current: SchematicAnnotation,
    patch: SchematicAnnotationPatch
  ): SchematicAnnotation {
    const updated: SchematicAnnotation = {
      id: current.id,
      author: patch.author !== undefined ? patch.author : current.author,
      text: patch.text !== undefined ? patch.text : current.text,
      type: patch.type !== undefined ? patch.type : current.type,
      status: patch.status !== undefined ? patch.status : current.status,
      x: patch.x !== undefined ? patch.x : current.x,
      y: patch.y !== undefined ? patch.y : current.y,
      width: patch.width !== undefined ? patch.width : current.width,
      height: patch.height !== undefined ? patch.height : current.height,
      arrowEndX: patch.arrowEndX !== undefined ? patch.arrowEndX : current.arrowEndX,
      arrowEndY: patch.arrowEndY !== undefined ? patch.arrowEndY : current.arrowEndY,
      targetUuid: patch.targetUuid !== undefined ? patch.targetUuid : current.targetUuid,
      targetKind: patch.targetKind !== undefined ? patch.targetKind : current.targetKind,
      createdAt: patch.createdAt !== undefined ? patch.createdAt : current.createdAt,
      updatedAt: new Date().toISOString()
    };
    return updated;
  }

  private static mergeAnnotation(
    annotation: SchematicAnnotation,
    now: string
  ): SchematicAnnotation {
    const item: SchematicAnnotation = {
      id: annotation.id.length > 0 ? annotation.id : IdUtil.generate('annot'),
      author: annotation.author,
      text: annotation.text,
      type: annotation.type,
      status: annotation.status,
      x: annotation.x,
      y: annotation.y,
      width: annotation.width,
      height: annotation.height,
      arrowEndX: annotation.arrowEndX,
      arrowEndY: annotation.arrowEndY,
      targetUuid: annotation.targetUuid,
      targetKind: annotation.targetKind,
      createdAt: annotation.createdAt.length > 0 ? annotation.createdAt : now,
      updatedAt: now
    };
    return item;
  }

  setSimBusy(busy: boolean): void {
    this.simBusy = busy;
  }

  isSimBusy(): boolean {
    return this.simBusy;
  }

  setReadOnly(readOnly: boolean): void {
    this.readOnlyMode = readOnly;
  }

  isReadOnly(): boolean {
    return this.readOnlyMode;
  }

  private guardEdit(): ApiResult<void> | null {
    if (this.readOnlyMode) {
      return ResultHelper.fail(ErrCode.ERR_PROJECT_LOCKED, '工程处于只读模式');
    }
    return this.guardSimBusy();
  }

  private guardSimBusy(): ApiResult<void> | null {
    if (this.simBusy) {
      return ResultHelper.fail(ErrCode.ERR_SIM_BUSY, '仿真运行中，无法修改原理图');
    }
    return null;
  }

  getFullTopology(subCircuitUuid: string = ''): SchTopology {
    this.syncTopologyFromDoc();
    if (!subCircuitUuid) {
      return this.topology!;
    }
    const subList: SubCircuitBlock[] = this.topology!.subCircuitList;
    let sub: SubCircuitBlock | undefined = undefined;
    for (let i = 0; i < subList.length; i++) {
      if (subList[i].subUuid === subCircuitUuid) {
        sub = subList[i];
        break;
      }
    }
    if (sub !== undefined && sub.innerTopo !== null) {
      return sub.innerTopo;
    }
    return this.topology!;
  }

  loadTopology(topo: SchTopology): ApiResult<void> {
    this.document = TopologyAdapter.fromTopology(topo);
    this.topology = topo;
    this.probes = SchematicEditorImpl.copyProbeList(topo.probeList);
    this.buses = SchematicEditorImpl.copyBusList(topo.busList);
    this.rebuildRefDesCounters();
    this.rebuildNetPinConnectivity();
    // rebuild 后 document 已变；必须同步 topology，否则 AI 门禁读到陈旧 SchTopology
    this.syncTopologyFromDoc();
    this.notifyChange();
    return ResultHelper.ok();
  }

  getSelectedDevices(): DeviceInst[] {
    const topo: SchTopology = this.getFullTopology();
    const result: DeviceInst[] = [];
    for (let i = 0; i < topo.deviceList.length; i++) {
      const dev: DeviceInst = topo.deviceList[i];
      if (this.selectedIds.includes(dev.instUuid)) {
        result.push(dev);
      }
    }
    return result;
  }

  getSelectedNets(): NetInfo[] {
    const topo: SchTopology = this.getFullTopology();
    const result: NetInfo[] = [];
    for (let i = 0; i < topo.netList.length; i++) {
      const net: NetInfo = topo.netList[i];
      if (this.selectedNetIds.includes(net.netUuid)) {
        result.push(net);
      }
    }
    return result;
  }

  runERC(_topo?: SchTopology, _autoFixSuggest: boolean = true): ErcError[] {
    this.rebuildNetPinConnectivity();
    const doc: SchematicDocument = this.getDocument();
    const violations: ErcViolation[] = DeepErcEngine.runFull(doc,
      this.pinResolver !== null ? this.pinResolver : undefined);
    const errors: ErcError[] = [];
    for (let i = 0; i < violations.length; i++) {
      const v: ErcViolation = violations[i];
      let severity: 'error' | 'warning' | 'info' | 'critical' = 'info';
      if (v.severity === 'error') {
        severity = 'error';
      } else if (v.severity === 'warning') {
        severity = 'warning';
      }
      const err: ErcError = {
        errType: v.ruleType,
        targetUuid: v.componentId !== undefined ? v.componentId : (v.netId !== undefined ? v.netId : ''),
        desc: v.message,
        suggest: v.fixSuggestion !== undefined ? v.fixSuggestion : '',
        severity: severity
      };
      errors.push(err);
    }
    if (this.topology !== null) {
      this.topology.ercErrorList = errors;
    }
    CallbackRegistry.getInstance().emitErc(errors);
    EventBus.getInstance().publish({
      event: ModuleEvent.ERC_COMPLETED,
      source: 'schematic_editor',
      timestamp: Date.now(),
      data: errors
    });
    return errors;
  }

  runPartialERC(devInstUuid: string): ErcError[] {
    const all: ErcError[] = this.runERC();
    const result: ErcError[] = [];
    for (let i = 0; i < all.length; i++) {
      if (all[i].targetUuid === devInstUuid) {
        result.push(all[i]);
      }
    }
    return result;
  }

  autoFixERC(topo: SchTopology, errors: ErcError[]): number {
    let fixed = 0;
    for (let i = 0; i < errors.length; i++) {
      const err: ErcError = errors[i];
      if (err.errType === 'missing_crystal' || err.desc.includes('晶振')) {
        const r: ApiResult<DeviceInst> = this.addDevice('XTAL_11M', 100, 100, 'Y?');
        if (r.success) {
          fixed++;
        }
      }
      if (err.errType === 'power_reversed' || err.desc.includes('电源')) {
        this.createNetLabel(50, 50, 'VCC');
        fixed++;
      }
      if (err.desc.includes('地网络')) {
        this.createNetLabel(50, 80, 'GND');
        fixed++;
      }
      if (err.desc.includes('去耦') || err.desc.includes('电容')) {
        this.addDevice('C_100nF', 120, 120, 'C?');
        fixed++;
      }
      if (err.desc.includes('上拉') || err.desc.includes('电阻')) {
        this.addDevice('R_10k', 140, 140, 'R?');
        fixed++;
      }
    }
    if (fixed > 0) {
      this.loadTopology(topo);
    }
    return fixed;
  }

  applyRouteResult(routeData: RouteResult, keepManualRoute: boolean = true): ErrCode {
    const guard: ApiResult<void> | null = this.guardSimBusy();
    if (guard !== null) {
      return guard.errCode!;
    }
    const doc: SchematicDocument = this.getDocument();
    if (this.document !== null) {
      this.commandHistory.push(new ApplyRouteCommand(this.document, routeData, keepManualRoute));
    } else {
      if (!keepManualRoute) {
        doc.wires = [];
      }
      for (let i = 0; i < routeData.routeLines.length; i++) {
        const line = routeData.routeLines[i];
        doc.wires.push({
          id: IdUtil.generate('wire'),
          netId: line.netUuid,
          points: line.points,
          style: WireStyle.ORTHOGONAL
        });
      }
    }
    routeData.crossCount = EditorInternals.calcRouteCrossCount(routeData);
    routeData.totalLineLength = EditorInternals.calcTotalLength(routeData);
    this.rebuildNetPinConnectivity();
    this.notifyChange();
    return ErrCode.OK;
  }

  clearSelectedRoute(): void {
    if (this.selectedNetIds.length === 0) {
      return;
    }
    if (this.document !== null) {
      this.commandHistory.push(new ClearWiresCommand(this.document, this.selectedNetIds.slice()));
    } else {
      const doc: SchematicDocument = this.getDocument();
      const kept: Wire[] = [];
      for (let i = 0; i < doc.wires.length; i++) {
        if (!this.selectedNetIds.includes(doc.wires[i].netId)) {
          kept.push(doc.wires[i]);
        }
      }
      doc.wires = kept;
    }
    this.notifyChange();
  }

  clearAllRoute(): void {
    const guard: ApiResult<void> | null = this.guardSimBusy();
    if (guard !== null) {
      return;
    }
    if (this.document !== null) {
      this.commandHistory.push(new ClearWiresCommand(this.document));
    } else {
      this.getDocument().wires = [];
    }
    this.notifyChange();
  }

  addDevice(libDevId: string, x: number, y: number, refName?: string): ApiResult<DeviceInst> {
    const guard: ApiResult<void> | null = this.guardEdit();
    if (guard !== null) {
      return ResultHelper.fail<DeviceInst>(
        guard.errCode !== undefined ? guard.errCode : ErrCode.ERR_SIM_BUSY,
        guard.error
      );
    }
    if (Validate.notEmpty(libDevId, 'libDevId')) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
    }
    const doc: SchematicDocument = this.getDocument();
    const limitCheck: ApiResult<void> = FeatureGate.canAddDevice(doc.components.length);
    if (!limitCheck.success) {
      return ResultHelper.fail(
        limitCheck.errCode !== undefined ? limitCheck.errCode : ErrCode.ERR_FEATURE_LOCKED,
        limitCheck.error
      );
    }
    const pos: Point2D = EditorInternals.calcSnapPoint(x, y, this.viewport.gridSize);
    const prefix: string = this.getRefDesPrefix(libDevId);
    const count: number = (this.refDesCounters.get(prefix) ?? 0) + 1;
    this.refDesCounters.set(prefix, count);
    const component: ComponentInstance = {
      id: IdUtil.generate('comp'),
      libraryId: libDevId,
      refDes: refName !== undefined ? refName : `${prefix}${count}`,
      position: pos,
      rotation: 0,
      mirrored: false,
      parameters: SchematicEditorImpl.emptyParameters()
    };
    if (this.defaultParamsResolver !== null) {
      const defaults = this.defaultParamsResolver(libDevId);
      if (defaults !== null) {
        defaults.forEach((value: string, key: string) => {
          component.parameters.set(key, value);
        });
      }
    }
    this.normalizeComponentValue(component);
    if (this.document !== null) {
      this.commandHistory.push(new PlaceCommand(this.document, component));
    } else {
      this.getDocument().components.push(component);
    }
    this.notifyChange();
    return ResultHelper.ok(TopologyAdapter.toDeviceInst(component));
  }

  deleteDevice(instUuid: string): ApiResult<void> {
    const guard: ApiResult<void> | null = this.guardSimBusy();
    if (guard !== null) {
      return guard;
    }
    return this.batchDeleteDevice([instUuid]) > 0 ?
      ResultHelper.ok() :
      ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '器件不存在');
  }

  setDeviceParam(instUuid: string, key: string, value: string): ApiResult<void> {
    const comp: ComponentInstance | undefined = this.findComponent(instUuid);
    if (comp === undefined) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
    }
    let finalValue = value;
    if (key === 'value' && comp !== undefined) {
      finalValue = this.normalizeComponentValueStr(comp.libraryId, value);
    }
    if (this.document !== null) {
      this.commandHistory.push(new SetDeviceParamCommand(this.document, instUuid, key, finalValue));
    } else {
      comp.parameters.set(key, finalValue);
    }
    this.notifyChange();
    return ResultHelper.ok();
  }

  rotateDevice(instUuid: string, angle: number): ApiResult<void> {
    if (this.isComponentLocked(instUuid)) {
      return ResultHelper.fail(ErrCode.ERR_SIM_BUSY, '器件已锁定');
    }
    const comp: ComponentInstance | undefined = this.findComponent(instUuid);
    if (comp === undefined || this.document === null) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
    }
    const oldRot = comp.rotation;
    const newRot = SchematicEditorImpl.normalizeRotation(angle);
    const oldPinPositions = this.getComponentPinWorldPositions(comp);
    const beforeWires = this.snapshotWirePointsNearPins(oldPinPositions);
    const beforeLabels = this.snapshotLabelPositionsNearPins(oldPinPositions);
    const cmd = new RotateCommand(this.document, instUuid, oldRot, newRot);
    this.commandHistory.push(cmd);
    this.updateWiresForComponentMove(instUuid, oldPinPositions);
    this.remapLabelsForPinMove(oldPinPositions, this.getComponentPinWorldPositions(comp));
    const newPins = this.getComponentPinWorldPositions(comp);
    cmd.captureGeometry(
      beforeWires,
      this.snapshotWirePointsNearPins(newPins, beforeWires),
      beforeLabels,
      this.snapshotLabelPositionsNearPins(newPins, beforeLabels)
    );
    this.rebuildNetPinConnectivity();
    this.notifyChange();
    return ResultHelper.ok();
  }

  mirrorDevice(instUuid: string, horizontal: boolean): ApiResult<void> {
    if (this.isComponentLocked(instUuid)) {
      return ResultHelper.fail(ErrCode.ERR_SIM_BUSY, '器件已锁定');
    }
    const comp: ComponentInstance | undefined = this.findComponent(instUuid);
    if (comp === undefined || this.document === null) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
    }
    if (horizontal) {
      const oldM = comp.mirrored;
      const oldPinPositions = this.getComponentPinWorldPositions(comp);
      const beforeWires = this.snapshotWirePointsNearPins(oldPinPositions);
      const beforeLabels = this.snapshotLabelPositionsNearPins(oldPinPositions);
      const cmd = new MirrorCommand(this.document, instUuid, oldM, !oldM);
      this.commandHistory.push(cmd);
      this.updateWiresForComponentMove(instUuid, oldPinPositions);
      this.remapLabelsForPinMove(oldPinPositions, this.getComponentPinWorldPositions(comp));
      const newPins = this.getComponentPinWorldPositions(comp);
      cmd.captureGeometry(
        beforeWires,
        this.snapshotWirePointsNearPins(newPins, beforeWires),
        beforeLabels,
        this.snapshotLabelPositionsNearPins(newPins, beforeLabels)
      );
      this.rebuildNetPinConnectivity();
      this.notifyChange();
    }
    return ResultHelper.ok();
  }

  /** Snapshot wire polylines near pins (and optionally keep ids from a prior snapshot). */
  private snapshotWirePointsNearPins(
    pinPositions: Map<string, Point2D>,
    includeIds?: Map<string, Point2D[]>
  ): Map<string, Point2D[]> {
    const doc = this.getDocument();
    const out = new Map<string, Point2D[]>();
    const threshold = 80;
    const pinList: Point2D[] = [];
    pinPositions.forEach((p: Point2D) => { pinList.push(p); });
    for (let wi = 0; wi < doc.wires.length; wi++) {
      const wire = doc.wires[wi];
      let include = includeIds !== undefined && includeIds.has(wire.id);
      if (!include) {
        for (let pi = 0; pi < wire.points.length && !include; pi++) {
          const pt = wire.points[pi];
          for (let k = 0; k < pinList.length; k++) {
            if (Math.abs(pt.x - pinList[k].x) <= threshold &&
              Math.abs(pt.y - pinList[k].y) <= threshold) {
              include = true;
              break;
            }
          }
        }
      }
      if (!include) {
        continue;
      }
      const pts: Point2D[] = [];
      for (let j = 0; j < wire.points.length; j++) {
        pts.push({ x: wire.points[j].x, y: wire.points[j].y });
      }
      out.set(wire.id, pts);
    }
    return out;
  }

  private snapshotLabelPositionsNearPins(
    pinPositions: Map<string, Point2D>,
    includeIds?: Map<string, Point2D>
  ): Map<string, Point2D> {
    const doc = this.getDocument();
    const out = new Map<string, Point2D>();
    const threshold = 80;
    const pinList: Point2D[] = [];
    pinPositions.forEach((p: Point2D) => { pinList.push(p); });
    const labels = doc.netLabels ?? [];
    for (let li = 0; li < labels.length; li++) {
      const label = labels[li];
      let include = includeIds !== undefined && includeIds.has(label.id);
      if (!include) {
        for (let k = 0; k < pinList.length; k++) {
          if (Math.abs(label.position.x - pinList[k].x) <= threshold &&
            Math.abs(label.position.y - pinList[k].y) <= threshold) {
            include = true;
            break;
          }
        }
      }
      if (!include) {
        continue;
      }
      out.set(label.id, { x: label.position.x, y: label.position.y });
    }
    return out;
  }

  batchAddDevice(devList: BatchDeviceItem[]): number {
    const guard: ApiResult<void> | null = this.guardSimBusy();
    if (guard !== null) {
      return 0;
    }
    let count = 0;
    for (let i = 0; i < devList.length; i++) {
      const item: BatchDeviceItem = devList[i];
      if (this.addDevice(item.libId, item.x, item.y, item.refName).success) {
        count++;
      }
    }
    return count;
  }

  batchDeleteDevice(instUuidList: string[]): number {
    const guard: ApiResult<void> | null = this.guardSimBusy();
    if (guard !== null) {
      return 0;
    }
    const doc: SchematicDocument = this.getDocument();
    const before: number = doc.components.length;
    if (this.document !== null && instUuidList.length > 0) {
      const deletable: string[] = [];
      for (let i = 0; i < instUuidList.length; i++) {
        if (!this.isComponentLocked(instUuidList[i])) deletable.push(instUuidList[i]);
      }
      if (deletable.length > 0) {
        const clearingAll = this.willClearAllComponents(doc, deletable);
        const wireIds = clearingAll
          ? this.collectAllWireIds(doc)
          : this.collectWireIdsTouchingComponents(deletable);
        const labelIds = clearingAll
          ? this.collectAllNetLabelIds(doc)
          : this.collectNetLabelIdsForDelete(deletable, wireIds);
        this.commandHistory.push(new BatchDeleteCommand(this.document, deletable, wireIds, labelIds));
      }
    } else {
      const clearingAll = this.willClearAllComponents(doc, instUuidList);
      const wireIds = clearingAll
        ? this.collectAllWireIds(doc)
        : this.collectWireIdsTouchingComponents(instUuidList);
      const labelIds = clearingAll
        ? this.collectAllNetLabelIds(doc)
        : this.collectNetLabelIdsForDelete(instUuidList, wireIds);
      const wireRemove = new Set<string>();
      for (let i = 0; i < wireIds.length; i++) {
        wireRemove.add(wireIds[i]);
      }
      if (wireRemove.size > 0) {
        const keptWires: Wire[] = [];
        for (let i = 0; i < doc.wires.length; i++) {
          if (!wireRemove.has(doc.wires[i].id)) {
            keptWires.push(doc.wires[i]);
          }
        }
        doc.wires = keptWires;
      }
      if (labelIds.length > 0) {
        const labelRemove = new Set<string>();
        for (let i = 0; i < labelIds.length; i++) {
          labelRemove.add(labelIds[i]);
        }
        const keptLabels: NetLabel[] = [];
        const srcLabels = doc.netLabels ?? [];
        for (let i = 0; i < srcLabels.length; i++) {
          if (!labelRemove.has(srcLabels[i].id)) {
            keptLabels.push(srcLabels[i]);
          }
        }
        doc.netLabels = keptLabels;
      }
      const kept: ComponentInstance[] = [];
      for (let i = 0; i < doc.components.length; i++) {
        if (!instUuidList.includes(doc.components[i].id)) {
          kept.push(doc.components[i]);
        } else {
          this.stripNetPinRefsForComponent(doc, doc.components[i].id);
        }
      }
      doc.components = kept;
    }
    const newSelected: string[] = [];
    for (let i = 0; i < this.selectedIds.length; i++) {
      if (!instUuidList.includes(this.selectedIds[i])) {
        newSelected.push(this.selectedIds[i]);
      }
    }
    this.selectedIds = newSelected;
    this.rebuildNetPinConnectivity();
    this.notifyChange();
    return before - doc.components.length;
  }

  /** True when every component in the document is in the delete set. */
  private willClearAllComponents(doc: SchematicDocument, deleteIds: string[]): boolean {
    if (doc.components.length === 0 || deleteIds.length === 0) {
      return false;
    }
    const idSet = new Set<string>();
    for (let i = 0; i < deleteIds.length; i++) {
      idSet.add(deleteIds[i]);
    }
    for (let i = 0; i < doc.components.length; i++) {
      if (!idSet.has(doc.components[i].id)) {
        return false;
      }
    }
    return true;
  }

  private collectAllWireIds(doc: SchematicDocument): string[] {
    const ids: string[] = [];
    for (let i = 0; i < doc.wires.length; i++) {
      ids.push(doc.wires[i].id);
    }
    return ids;
  }

  private collectAllNetLabelIds(doc: SchematicDocument): string[] {
    const labels = doc.netLabels ?? [];
    const ids: string[] = [];
    for (let i = 0; i < labels.length; i++) {
      ids.push(labels[i].id);
    }
    return ids;
  }

  /**
   * Collect wire IDs that have an endpoint snapped to any pin of the given components.
   * Used so deleting a device also removes its attached wires from the canvas.
   */
  private collectWireIdsTouchingComponents(compIds: string[]): string[] {
    const doc = this.getDocument();
    const pinPositions: Point2D[] = [];
    for (let i = 0; i < compIds.length; i++) {
      const comp = this.findComponent(compIds[i]);
      if (comp === undefined) {
        continue;
      }
      const pinMap = this.getComponentPinWorldPositions(comp);
      pinMap.forEach((pos: Point2D) => {
        pinPositions.push({ x: pos.x, y: pos.y });
      });
    }
    if (pinPositions.length === 0 || doc.wires.length === 0) {
      return [];
    }
    const threshold = Math.max(this.viewport.gridSize * 2.5, 20);
    const hitIds: string[] = [];
    const seen = new Set<string>();
    for (let wi = 0; wi < doc.wires.length; wi++) {
      const wire = doc.wires[wi];
      if (wire.points.length === 0) {
        continue;
      }
      const endpoints: Point2D[] = [wire.points[0], wire.points[wire.points.length - 1]];
      let touches = false;
      for (let ei = 0; ei < endpoints.length && !touches; ei++) {
        const ep = endpoints[ei];
        for (let pi = 0; pi < pinPositions.length; pi++) {
          const dx = ep.x - pinPositions[pi].x;
          const dy = ep.y - pinPositions[pi].y;
          if (Math.abs(dx) <= threshold && Math.abs(dy) <= threshold) {
            touches = true;
            break;
          }
        }
      }
      if (touches && !seen.has(wire.id)) {
        seen.add(wire.id);
        hitIds.push(wire.id);
      }
    }
    return hitIds;
  }

  /**
   * Collect net-label IDs that should go with the deleted components.
   * Remove when the label is tied to deleted pins/wires and not anchored by
   * remaining geometry; also drop floating orphans (e.g. leftover GND text)
   * that have no remaining pin/wire nearby.
   */
  private collectNetLabelIdsForDelete(compIds: string[], wireIdsToRemove: string[]): string[] {
    const doc = this.getDocument();
    const labels = doc.netLabels ?? [];
    if (labels.length === 0) {
      return [];
    }
    const deleteCompSet = new Set<string>();
    for (let i = 0; i < compIds.length; i++) {
      deleteCompSet.add(compIds[i]);
    }
    const deletedPinPositions: Point2D[] = [];
    const remainingPinPositions: Point2D[] = [];
    for (let i = 0; i < doc.components.length; i++) {
      const comp = doc.components[i];
      const pinMap = this.getComponentPinWorldPositions(comp);
      const into = deleteCompSet.has(comp.id) ? deletedPinPositions : remainingPinPositions;
      pinMap.forEach((pos: Point2D) => {
        into.push({ x: pos.x, y: pos.y });
      });
    }
    const deletedWireIds = new Set<string>();
    for (let i = 0; i < wireIdsToRemove.length; i++) {
      deletedWireIds.add(wireIdsToRemove[i]);
    }
    // Covers AI stub labels (stubPad+40 ≈ 60) plus margin
    const threshold = 80;
    const hitIds: string[] = [];
    const seen = new Set<string>();

    for (let li = 0; li < labels.length; li++) {
      const label = labels[li];
      let nearDeletedPin = false;
      for (let pi = 0; pi < deletedPinPositions.length; pi++) {
        const dx = label.position.x - deletedPinPositions[pi].x;
        const dy = label.position.y - deletedPinPositions[pi].y;
        if (Math.abs(dx) <= threshold && Math.abs(dy) <= threshold) {
          nearDeletedPin = true;
          break;
        }
      }
      let nearRemainingPin = false;
      for (let pi = 0; pi < remainingPinPositions.length; pi++) {
        const dx = label.position.x - remainingPinPositions[pi].x;
        const dy = label.position.y - remainingPinPositions[pi].y;
        if (Math.abs(dx) <= threshold && Math.abs(dy) <= threshold) {
          nearRemainingPin = true;
          break;
        }
      }

      let touchedByDeletedWire = false;
      let touchedByRemainingWire = false;
      for (let wi = 0; wi < doc.wires.length; wi++) {
        const wire = doc.wires[wi];
        if (wire.points.length === 0) {
          continue;
        }
        if (!SchematicEditorImpl.labelNearWire(label.position, wire, threshold)) {
          continue;
        }
        if (deletedWireIds.has(wire.id)) {
          touchedByDeletedWire = true;
        } else {
          touchedByRemainingWire = true;
        }
      }

      const anchoredToRemaining = nearRemainingPin || touchedByRemainingWire;
      const tiedToDeleted = nearDeletedPin || touchedByDeletedWire;
      // Shared power labels on remaining wires stay; orphans / deleted-only labels go
      const shouldRemove = !anchoredToRemaining &&
        (tiedToDeleted || remainingPinPositions.length === 0);
      if (shouldRemove && !seen.has(label.id)) {
        seen.add(label.id);
        hitIds.push(label.id);
      }
    }
    return hitIds;
  }

  private static labelNearWire(pos: Point2D, wire: Wire, threshold: number): boolean {
    for (let i = 0; i < wire.points.length; i++) {
      const p = wire.points[i];
      if (Math.abs(pos.x - p.x) <= threshold && Math.abs(pos.y - p.y) <= threshold) {
        return true;
      }
    }
    // Also check segment midpoints for short stubs
    for (let i = 1; i < wire.points.length; i++) {
      const a = wire.points[i - 1];
      const b = wire.points[i];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      if (Math.abs(pos.x - mx) <= threshold && Math.abs(pos.y - my) <= threshold) {
        return true;
      }
    }
    return false;
  }

  private stripNetPinRefsForComponent(doc: SchematicDocument, compId: string): void {
    const prefix = `${compId}:`;
    for (let ni = 0; ni < doc.nets.length; ni++) {
      const net = doc.nets[ni];
      const keep: string[] = [];
      for (let pi = 0; pi < net.pinIds.length; pi++) {
        if (!net.pinIds[pi].startsWith(prefix)) {
          keep.push(net.pinIds[pi]);
        }
      }
      net.pinIds = keep;
    }
  }

  batchSetParam(instUuidList: string[], key: string, unifiedValue: string): ApiResult<number> {
    const guard: ApiResult<void> | null = this.guardSimBusy();
    if (guard !== null) {
      return ResultHelper.fail(guard.errCode!);
    }
    const unlocked: string[] = [];
    for (let i = 0; i < instUuidList.length; i++) {
      if (!this.isComponentLocked(instUuidList[i])) {
        unlocked.push(instUuidList[i]);
      }
    }
    if (unlocked.length === 0) {
      return ResultHelper.ok(0);
    }
    if (this.document !== null) {
      this.commandHistory.push(new BatchSetDeviceParamCommand(this.document, unlocked, key, unifiedValue));
    } else {
      for (let i = 0; i < unlocked.length; i++) {
        const comp = this.findComponent(unlocked[i]);
        if (comp !== undefined) {
          comp.parameters.set(key, unifiedValue);
        }
      }
    }
    this.notifyChange();
    return ResultHelper.ok(unlocked.length);
  }

  batchAlign(instUuids: string[], alignType: AlignType): ApiResult<void> {
    const comps: ComponentInstance[] = this.collectComponents(instUuids)
      .filter((c: ComponentInstance) => !this.isComponentLocked(c.id));
    if (comps.length < 2) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '至少需要 2 个未锁定器件');
    }
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < comps.length; i++) {
      xs.push(comps[i].position.x);
      ys.push(comps[i].position.y);
    }
    const moves: BatchMoveEntry[] = [];
    switch (alignType) {
      case 'left': {
        const minX: number = SchematicEditorImpl.arrayMin(xs);
        for (let i = 0; i < comps.length; i++) {
          moves.push({
            compId: comps[i].id,
            oldPos: { x: comps[i].position.x, y: comps[i].position.y },
            newPos: { x: minX, y: comps[i].position.y }
          });
        }
        break;
      }
      case 'right': {
        const maxX: number = SchematicEditorImpl.arrayMax(xs);
        for (let i = 0; i < comps.length; i++) {
          moves.push({
            compId: comps[i].id,
            oldPos: { x: comps[i].position.x, y: comps[i].position.y },
            newPos: { x: maxX, y: comps[i].position.y }
          });
        }
        break;
      }
      case 'top': {
        const minY: number = SchematicEditorImpl.arrayMin(ys);
        for (let i = 0; i < comps.length; i++) {
          moves.push({
            compId: comps[i].id,
            oldPos: { x: comps[i].position.x, y: comps[i].position.y },
            newPos: { x: comps[i].position.x, y: minY }
          });
        }
        break;
      }
      case 'bottom': {
        const maxY: number = SchematicEditorImpl.arrayMax(ys);
        for (let i = 0; i < comps.length; i++) {
          moves.push({
            compId: comps[i].id,
            oldPos: { x: comps[i].position.x, y: comps[i].position.y },
            newPos: { x: comps[i].position.x, y: maxY }
          });
        }
        break;
      }
      case 'hcenter': {
        const cy: number = SchematicEditorImpl.arrayAverage(ys);
        for (let i = 0; i < comps.length; i++) {
          moves.push({
            compId: comps[i].id,
            oldPos: { x: comps[i].position.x, y: comps[i].position.y },
            newPos: { x: comps[i].position.x, y: cy }
          });
        }
        break;
      }
      case 'vcenter': {
        const cx: number = SchematicEditorImpl.arrayAverage(xs);
        for (let i = 0; i < comps.length; i++) {
          moves.push({
            compId: comps[i].id,
            oldPos: { x: comps[i].position.x, y: comps[i].position.y },
            newPos: { x: cx, y: comps[i].position.y }
          });
        }
        break;
      }
    }
    if (this.document !== null && moves.length > 0) {
      this.commandHistory.push(new BatchMoveCommand(this.document, moves));
    } else {
      for (let i = 0; i < moves.length; i++) {
        const comp = this.findComponent(moves[i].compId);
        if (comp !== undefined) {
          comp.position = { x: moves[i].newPos.x, y: moves[i].newPos.y };
        }
      }
    }
    this.notifyChange();
    return ResultHelper.ok();
  }

  batchDistribute(instUuids: string[], dir: DistributeType): ApiResult<void> {
    const comps: ComponentInstance[] = this.collectComponents(instUuids)
      .filter((c: ComponentInstance) => !this.isComponentLocked(c.id));
    if (comps.length < 3) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '至少需要 3 个未锁定器件');
    }
    const sorted = comps.slice();
    if (dir === 'horiz') {
      sorted.sort((a: ComponentInstance, b: ComponentInstance): number => a.position.x - b.position.x);
    } else {
      sorted.sort((a: ComponentInstance, b: ComponentInstance): number => a.position.y - b.position.y);
    }
    const moves: BatchMoveEntry[] = [];
    if (dir === 'horiz') {
      const step: number = (sorted[sorted.length - 1].position.x - sorted[0].position.x) / (sorted.length - 1);
      for (let i = 0; i < sorted.length; i++) {
        moves.push({
          compId: sorted[i].id,
          oldPos: { x: sorted[i].position.x, y: sorted[i].position.y },
          newPos: { x: sorted[0].position.x + step * i, y: sorted[i].position.y }
        });
      }
    } else {
      const step: number = (sorted[sorted.length - 1].position.y - sorted[0].position.y) / (sorted.length - 1);
      for (let i = 0; i < sorted.length; i++) {
        moves.push({
          compId: sorted[i].id,
          oldPos: { x: sorted[i].position.x, y: sorted[i].position.y },
          newPos: { x: sorted[i].position.x, y: sorted[0].position.y + step * i }
        });
      }
    }
    if (this.document !== null && moves.length > 0) {
      this.commandHistory.push(new BatchMoveCommand(this.document, moves));
    } else {
      for (let i = 0; i < moves.length; i++) {
        const comp = this.findComponent(moves[i].compId);
        if (comp !== undefined) {
          comp.position = { x: moves[i].newPos.x, y: moves[i].newPos.y };
        }
      }
    }
    this.notifyChange();
    return ResultHelper.ok();
  }

  createBus(x1: number, y1: number, x2: number, y2: number, bitCount: number = 8): ApiResult<string> {
    const busUuid: string = IdUtil.generate('bus');
    const bus: BusInfo = {
      busUuid: busUuid,
      name: `BUS${bitCount}`,
      bitCount: bitCount,
      x1: x1,
      y1: y1,
      x2: x2,
      y2: y2,
      branchNetUuids: []
    };
    this.buses.push(bus);
    const net: Net = {
      id: busUuid,
      name: `BUS${bitCount}`,
      type: NetType.BUS,
      pinIds: [],
      busWidth: bitCount as BusWidth
    };
    this.getDocument().nets.push(net);
    this.notifyChange();
    return ResultHelper.ok(busUuid);
  }

  assignBusNet(busUuid: string, netNameList: string[]): ApiResult<void> {
    const bus: BusInfo | undefined = this.findBus(busUuid);
    if (bus === undefined) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
    }
    for (let i = 0; i < netNameList.length; i++) {
      const name: string = netNameList[i];
      const net: Net = {
        id: IdUtil.generate('net'),
        name: name,
        type: NetType.SIGNAL,
        pinIds: [],
        branchIndex: i
      };
      this.getDocument().nets.push(net);
      bus.branchNetUuids.push(net.id);
    }
    this.notifyChange();
    return ResultHelper.ok();
  }

  createNetLabel(x: number, y: number, netName: string): ApiResult<string> {
    const netId: string = IdUtil.generate('net');
    const doc: SchematicDocument = this.getDocument();
    let net: Net | undefined = this.findNetByName(doc, netName);
    if (net === undefined) {
      let netType: NetType = NetType.SIGNAL;
      const upper = netName.toUpperCase();
      if (upper === 'VCC' || upper === 'VDD' || upper === 'V+' || upper === 'VEE') {
        netType = NetType.POWER;
      } else if (upper === 'GND' || upper === 'VSS' || upper === '0') {
        netType = NetType.GROUND;
      }
      net = {
        id: netId,
        name: netName,
        type: netType,
        pinIds: []
      };
      doc.nets.push(net);
    }
    const labelId: string = IdUtil.generate('label');
    const labelPos: Point2D = { x: x, y: y };
    const upperName = netName.toUpperCase();
    const isRail = upperName === 'GND' || upperName === 'VCC' || upperName === 'VDD' ||
      upperName === 'V+' || upperName === 'VSS' || upperName === 'VEE' || upperName === '0';
    const label: NetLabel = {
      id: labelId,
      netId: net.id,
      text: netName,
      position: labelPos,
      global: isRail
    };
    doc.netLabels.push(label);
    this.notifyChange();
    return ResultHelper.ok(net.id);
  }

  /** 将 VCC/GND 符号引脚接入全局电源网络，并在引脚处放置网络标签 */
  attachPowerSymbolNet(compId: string): ApiResult<void> {
    const comp = this.findComponent(compId);
    if (comp === undefined) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '器件不存在');
    }
    const libUpper = comp.libraryId.toUpperCase();
    let netName: string | null = null;
    if (libUpper === 'VCC' || libUpper.endsWith('/VCC')) {
      netName = 'VCC';
    } else if (libUpper === 'GND' || libUpper.endsWith('/GND')) {
      netName = 'GND';
    }
    if (netName === null) {
      return ResultHelper.ok();
    }
    const pins = this.resolvePins(comp.libraryId);
    if (pins === null || pins.length === 0) {
      return ResultHelper.ok();
    }
    const pin = pins[0];
    const local = this.transformPinOffsetForConnect(pin.position, comp.rotation, comp.mirrored);
    const pinWorld: Point2D = { x: comp.position.x + local.x, y: comp.position.y + local.y };
    this.createNetLabel(pinWorld.x, pinWorld.y, netName);
    const doc = this.getDocument();
    const net = this.findNetByName(doc, netName);
    if (net !== undefined) {
      this.addPinToNet(net.id, comp.id, pin.id, pin.name);
    }
    this.notifyChange();
    return ResultHelper.ok();
  }

  createSubPort(subUuid: string, portName: string, dir: 'in' | 'out' | 'inout' = 'inout'): ApiResult<string> {
    const sub: SubcircuitRef | undefined = this.findSubcircuit(subUuid);
    if (sub === undefined) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
    }
    const portId: string = IdUtil.generate('port');
    if (sub.ports === undefined) {
      sub.ports = [];
    }
    let direction: 'input' | 'output' | 'bidirectional' = 'bidirectional';
    if (dir === 'in') {
      direction = 'input';
    } else if (dir === 'out') {
      direction = 'output';
    }
    const portCount: number = sub.ports.length;
    const portPos: Point2D = { x: 0, y: portCount * 20 };
    const port: Port = {
      id: portId,
      name: portName,
      type: PinType.BIDIRECTIONAL,
      direction: direction,
      position: portPos
    };
    sub.ports.push(port);
    this.notifyChange();
    return ResultHelper.ok(portId);
  }

  addVoltageProbe(netName: string, x: number, y: number): ApiResult<string> {
    const probeId: string = IdUtil.generate('probe');
    const net: Net | undefined = this.findNetByName(this.getDocument(), netName);
    const probe: ProbeInfo = {
      probeId: probeId,
      probeType: 'voltage',
      netUuid: net !== undefined ? net.id : '',
      devPinUuid: '',
      x: x,
      y: y,
      oscChannel: -1
    };
    this.probes.push(probe);
    this.notifyChange();
    return ResultHelper.ok(probeId);
  }

  addCurrentProbe(devPinUuid: string): ApiResult<string> {
    const probeId: string = IdUtil.generate('probe');
    const probe: ProbeInfo = {
      probeId: probeId,
      probeType: 'current',
      netUuid: '',
      devPinUuid: devPinUuid,
      x: 0,
      y: 0,
      oscChannel: -1
    };
    this.probes.push(probe);
    return ResultHelper.ok(probeId);
  }

  deleteProbe(probeId: string): void {
    const kept: ProbeInfo[] = [];
    for (let i = 0; i < this.probes.length; i++) {
      if (this.probes[i].probeId !== probeId) {
        kept.push(this.probes[i]);
      }
    }
    this.probes = kept;
  }

  bindProbeToOsc(probeId: string, ch: number): ApiResult<void> {
    const probe: ProbeInfo | undefined = this.findProbe(probeId);
    if (probe === undefined) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
    }
    probe.oscChannel = ch;
    return ResultHelper.ok();
  }

  getProbes(): ProbeInfo[] {
    return SchematicEditorImpl.copyProbeList(this.probes);
  }

  getViewport(): ViewportState {
    return this.cloneViewportState();
  }

  zoomCanvas(scale: number): void {
    this.viewport.zoom = Math.max(0.1, Math.min(5.0, scale));
    this.publishViewport();
  }

  moveView(dx: number, dy: number): void {
    this.viewport.panOffset.x += dx;
    this.viewport.panOffset.y += dy;
    this.publishViewport();
  }

  fitAllInView(): void {
    this.applyFitRect(this.getBoundingBox(), 2.0);
  }

  fitRectInView(rect: Rect2D): void {
    this.applyFitRect(rect, 5.0);
  }

  private applyFitRect(rect: Rect2D, maxZoom: number): void {
    const boxW: number = Math.max(rect.width, 1);
    const boxH: number = Math.max(rect.height, 1);
    const viewW: number = this.canvasViewWidth > 0 ? this.canvasViewWidth : 800;
    const viewH: number = this.canvasViewHeight > 0 ? this.canvasViewHeight : 600;
    const margin: number = 48;
    const availW: number = Math.max(100, viewW - margin * 2);
    const availH: number = Math.max(100, viewH - margin * 2);
    const scaleX: number = availW / boxW;
    const scaleY: number = availH / boxH;
    const zoom: number = Math.min(scaleX, scaleY, maxZoom);
    this.viewport.zoom = Math.max(0.15, zoom);
    this.viewport.panOffset = {
      x: (viewW - boxW * this.viewport.zoom) / 2 - rect.x * this.viewport.zoom,
      y: (viewH - boxH * this.viewport.zoom) / 2 - rect.y * this.viewport.zoom
    };
    this.publishViewport();
  }

  setZoom(level: number): void {
    this.zoomCanvas(level);
  }

  getZoom(): number {
    return this.viewport.zoom;
  }

  panBy(dx: number, dy: number): void {
    this.moveView(dx, dy);
  }

  undo(): ApiResult<void> {
    if (!this.commandHistory.canUndo()) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '无可撤销操作');
    }
    this.commandHistory.undo();
    this.syncTopologyFromDoc();
    this.rebuildRefDesCounters();
    this.rebuildNetPinConnectivity();
    this.notifyChange();
    return ResultHelper.ok();
  }

  redo(): ApiResult<void> {
    if (!this.commandHistory.canRedo()) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '无可重做操作');
    }
    this.commandHistory.redo();
    this.syncTopologyFromDoc();
    this.rebuildRefDesCounters();
    this.rebuildNetPinConnectivity();
    this.notifyChange();
    return ResultHelper.ok();
  }

  canUndo(): boolean {
    return this.commandHistory.canUndo();
  }

  canRedo(): boolean {
    return this.commandHistory.canRedo();
  }

  setUndoCacheCount(maxStep: number): void {
    this.undoLimit = Math.max(10, Math.min(10000, maxStep));
  }

  clearUndoStack(): void {
    // legacy no-op — CommandHistory manages undo stack
  }

  addAnnotation(annotation: SchematicAnnotation): ApiResult<SchematicAnnotation> {
    const gate: ApiResult<void> = FeatureGate.canUseTeamCollaboration();
    if (!gate.success) {
      return ResultHelper.fail(
        gate.errCode !== undefined ? gate.errCode : ErrCode.ERR_FEATURE_LOCKED,
        gate.error
      );
    }
    const now: string = new Date().toISOString();
    const item: SchematicAnnotation = SchematicEditorImpl.mergeAnnotation(annotation, now);
    this.annotations.push(item);
    this.publishAnnotationChange();
    return ResultHelper.ok(item);
  }

  updateAnnotation(id: string, patch: SchematicAnnotationPatch): ApiResult<void> {
    const gate: ApiResult<void> = FeatureGate.canUseTeamCollaboration();
    if (!gate.success) {
      return ResultHelper.fail(
        gate.errCode !== undefined ? gate.errCode : ErrCode.ERR_FEATURE_LOCKED,
        gate.error
      );
    }
    const idx: number = this.findAnnotationIndex(id);
    if (idx < 0) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '批注不存在');
    }
    const current: SchematicAnnotation = this.annotations[idx];
    this.annotations[idx] = SchematicEditorImpl.applyAnnotationPatch(current, patch);
    this.publishAnnotationChange();
    return ResultHelper.ok();
  }

  deleteAnnotation(id: string): ApiResult<void> {
    const gate: ApiResult<void> = FeatureGate.canUseTeamCollaboration();
    if (!gate.success) {
      return ResultHelper.fail(
        gate.errCode !== undefined ? gate.errCode : ErrCode.ERR_FEATURE_LOCKED,
        gate.error
      );
    }
    const before: number = this.annotations.length;
    const kept: SchematicAnnotation[] = [];
    for (let i = 0; i < this.annotations.length; i++) {
      if (this.annotations[i].id !== id) {
        kept.push(this.annotations[i]);
      }
    }
    this.annotations = kept;
    if (this.annotations.length === before) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '批注不存在');
    }
    this.publishAnnotationChange();
    return ResultHelper.ok();
  }

  listAnnotations(statusFilter?: SchematicAnnotationStatus): SchematicAnnotation[] {
    if (statusFilter === undefined) {
      return SchematicEditorImpl.copyAnnotationList(this.annotations);
    }
    const result: SchematicAnnotation[] = [];
    for (let i = 0; i < this.annotations.length; i++) {
      if (this.annotations[i].status === statusFilter) {
        result.push(this.annotations[i]);
      }
    }
    return result;
  }

  focusAnnotationTarget(annotationId: string): ApiResult<Point2D> {
    const annot: SchematicAnnotation | undefined = this.findAnnotation(annotationId);
    if (annot === undefined) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '批注不存在');
    }
    if (annot.targetKind === 'device' && annot.targetUuid.length > 0) {
      const comp: ComponentInstance | undefined = this.findComponent(annot.targetUuid);
      if (comp !== undefined) {
        const px: number = comp.position.x;
        const py: number = comp.position.y;
        const pan: Point2D = { x: -px + 200, y: -py + 200 };
        this.viewport.panOffset = pan;
        this.publishViewport();
        return ResultHelper.ok(SchematicEditorImpl.copyPoint2D(comp.position));
      }
    }
    if (annot.targetKind === 'net' && annot.targetUuid.length > 0) {
      const net: Net | undefined = this.findNetById(this.getDocument(), annot.targetUuid);
      if (net !== undefined) {
        const label: NetLabel | undefined = this.findNetLabelByNetId(net.id);
        if (label !== undefined) {
          const lx: number = label.position.x;
          const ly: number = label.position.y;
          const pan: Point2D = { x: -lx + 200, y: -ly + 200 };
          this.viewport.panOffset = pan;
          this.publishViewport();
          return ResultHelper.ok(SchematicEditorImpl.copyPoint2D(label.position));
        }
      }
    }
    const ax: number = annot.x;
    const ay: number = annot.y;
    const panOffset: Point2D = { x: -ax + 200, y: -ay + 200 };
    this.viewport.panOffset = panOffset;
    this.publishViewport();
    const result: Point2D = { x: ax, y: ay };
    return ResultHelper.ok(result);
  }

  loadAnnotations(annotations: SchematicAnnotation[]): void {
    this.annotations = SchematicEditorImpl.copyAnnotationList(annotations);
    this.publishAnnotationChange();
  }

  getAnnotations(): SchematicAnnotation[] {
    return SchematicEditorImpl.copyAnnotationList(this.annotations);
  }

  getDocument(): SchematicDocument {
    if (this.document === null) {
      return this.createNewDoc('Untitled');
    }
    return this.document;
  }

  loadDocument(doc: SchematicDocument): ApiResult<void> {
    const normalized = this.normalizeDocument(doc);
    if (this.document !== null) {
      this.commandHistory.push(new LoadDocumentCommand(
        (): SchematicDocument | null => this.document,
        (d: SchematicDocument | null): void => { this.document = d; },
        normalized
      ));
    } else {
      this.document = normalized;
    }
    this.rebuildRefDesCounters();
    this.rebuildNetPinConnectivity();
    this.syncTopologyFromDoc();
    this.notifyChange();
    return ResultHelper.ok();
  }

  loadDocumentWithCollaboration(doc: SchematicDocument, annotations: SchematicAnnotation[]): ApiResult<void> {
    const r: ApiResult<void> = this.loadDocument(doc);
    if (r.success) {
      this.loadAnnotations(annotations);
    }
    return r;
  }

  createNew(name: string): SchematicDocument {
    return this.createNewDoc(name);
  }

  placeComponent(libraryId: string, position: Point2D): ApiResult<ComponentInstance> {
    const r: ApiResult<DeviceInst> = this.addDevice(libraryId, position.x, position.y);
    if (!r.success || r.data === undefined) {
      return ResultHelper.fail(r.errCode, r.error);
    }
    const comp: ComponentInstance | undefined = this.findComponent(r.data.instUuid);
    if (comp === undefined) {
      return ResultHelper.fail(ErrCode.ERR_DEVICE_NOT_EXIST);
    }
    const libUpper = libraryId.toUpperCase();
    if (libUpper === 'VCC' || libUpper === 'GND' ||
      libUpper.endsWith('/VCC') || libUpper.endsWith('/GND')) {
      this.attachPowerSymbolNet(comp.id);
    }
    return ResultHelper.ok(comp);
  }

  updateComponentParams(id: string, params: ComponentParamsUpdate): ApiResult<void> {
    for (let i = 0; i < params.entries.length; i++) {
      const entry = params.entries[i];
      const r: ApiResult<void> = this.setDeviceParam(id, entry.key, entry.value);
      if (!r.success) {
        return r;
      }
    }
    return ResultHelper.ok();
  }

  rotateComponent(id: string, angle: number): ApiResult<void> {
    return this.rotateDevice(id, angle);
  }

  deleteComponent(id: string): ApiResult<void> {
    return this.deleteDevice(id);
  }

  moveComponent(componentId: string, position: Point2D): ApiResult<void> {
    const guard: ApiResult<void> | null = this.guardEdit();
    if (guard !== null) {
      return ResultHelper.fail(guard.errCode !== undefined ? guard.errCode : ErrCode.ERR_SIM_BUSY, guard.error);
    }
    const comp: ComponentInstance | undefined = this.findComponent(componentId);
    if (comp === undefined || this.document === null) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
    }
    if (this.isComponentLocked(componentId)) {
      return ResultHelper.fail(ErrCode.ERR_SIM_BUSY, '器件已锁定');
    }
    const oldPos: Point2D = { x: comp.position.x, y: comp.position.y };
    const newPos: Point2D = EditorInternals.calcSnapPoint(position.x, position.y, this.viewport.gridSize);
    const delta: Point2D = { x: newPos.x - oldPos.x, y: newPos.y - oldPos.y };
    // Capture old pin world positions before the move
    const oldPinPositions = this.getComponentPinWorldPositions(comp);
    this.commandHistory.push(new MoveCommand(this.document, componentId, oldPos, newPos));
    // Update wire endpoints / stubs that were at the component's old pin positions
    const stubEnds = this.updateWiresForComponentMove(componentId, oldPinPositions);
    // Update net labels near pins or translated stub free ends
    this.updateLabelsForComponentMove(oldPinPositions, delta, stubEnds);
    this.rebuildNetPinConnectivity();
    this.notifyChange();
    return ResultHelper.ok();
  }

  /**
   * Calculates world positions of all pins for a component.
   * Returns a Map keyed by pin.id.
   */
  private getComponentPinWorldPositions(comp: ComponentInstance): Map<string, Point2D> {
    const result = new Map<string, Point2D>();
    const pins = this.resolvePins(comp.libraryId);
    if (pins === null) {
      return result;
    }
    for (let i = 0; i < pins.length; i++) {
      const pin = pins[i];
      const local = this.transformPinOffsetForConnect(pin.position, comp.rotation, comp.mirrored);
      result.set(pin.id, { x: comp.position.x + local.x, y: comp.position.y + local.y });
    }
    return result;
  }

  /**
   * Updates wire endpoints that were connected to a moved component's pins.
   * After the component moves, any wire endpoint that was at a pin's old
   * world position gets moved to the pin's new world position.
   * Short dangling stubs (pin → free end with net label) translate as a whole
   * so the free end and label stay attached.
   * For 3-point orthogonal wires, recalculates the midpoint using an L-shape
   * that avoids: (a) intersecting component bodies (except endpoint components),
   * and (b) collinear overlap with wires of other nets.
   */
  private updateWiresForComponentMove(
    compId: string,
    oldPinPositions: Map<string, Point2D>
  ): Point2D[] {
    const comp = this.findComponent(compId);
    const movedStubFreeEnds: Point2D[] = [];
    if (comp === undefined) {
      return movedStubFreeEnds;
    }
    const newPinPositions = this.getComponentPinWorldPositions(comp);
    const doc = this.getDocument();
    const threshold = 3;
    let updatedCount = 0;
    // World positions of every pin on every component (after this move) —
    // used to detect dangling stub free ends.
    const allPinWorlds = this.collectAllPinWorldPositions();

    for (let wi = 0; wi < doc.wires.length; wi++) {
      const wire = doc.wires[wi];
      if (wire.points.length === 0) {
        continue;
      }
      let changed = false;
      let newPoints: Point2D[] = [];
      // Which endpoints snapped to a moved pin (and that pin's delta)
      const endPinDelta: Array<Point2D | null> = [];
      for (let pi = 0; pi < wire.points.length; pi++) {
        const pt = wire.points[pi];
        let updated: Point2D | null = null;
        let pinDelta: Point2D | null = null;
        oldPinPositions.forEach((oldPos: Point2D, pinId: string) => {
          if (updated !== null) {
            return;
          }
          const dx = pt.x - oldPos.x;
          const dy = pt.y - oldPos.y;
          if (Math.abs(dx) <= threshold && Math.abs(dy) <= threshold) {
            const newPos = newPinPositions.get(pinId);
            if (newPos !== undefined) {
              updated = { x: newPos.x, y: newPos.y };
              pinDelta = { x: newPos.x - oldPos.x, y: newPos.y - oldPos.y };
            }
          }
        });
        endPinDelta.push(pinDelta);
        if (updated !== null) {
          newPoints.push(updated);
          changed = true;
        } else {
          newPoints.push({ x: pt.x, y: pt.y });
        }
      }

      // Stub / leave-package lead: one end on moved pin, remaining points not on
      // any device pin → translate the whole dangling path (keeps label stubs intact)
      let pinEndCount = 0;
      let pinDelta: Point2D | null = null;
      for (let ei = 0; ei < endPinDelta.length; ei++) {
        if (endPinDelta[ei] !== null) {
          pinEndCount++;
          pinDelta = endPinDelta[ei];
        }
      }
      let danglingTranslated = false;
      if (pinEndCount === 1 && pinDelta !== null && newPoints.length >= 2) {
        let dangling = true;
        for (let pi = 0; pi < wire.points.length; pi++) {
          if (endPinDelta[pi] !== null) {
            continue;
          }
          if (this.isNearAnyPinWorld(wire.points[pi], allPinWorlds, threshold)) {
            dangling = false;
            break;
          }
        }
        if (dangling) {
          for (let pi = 0; pi < newPoints.length; pi++) {
            if (endPinDelta[pi] !== null) {
              continue;
            }
            const freeOld = wire.points[pi];
            movedStubFreeEnds.push({ x: freeOld.x, y: freeOld.y });
            newPoints[pi] = { x: freeOld.x + pinDelta.x, y: freeOld.y + pinDelta.y };
            changed = true;
          }
          danglingTranslated = true;
        }
      }

      if (changed) {
        // Routed wire with far end fixed on another pin: rebuild L-bend midpoint
        if (newPoints.length === 3 && !danglingTranslated) {
          newPoints = this.recalcMidForMovedWire(newPoints, wire, compId);
        }
        wire.points = newPoints;
        updatedCount++;
      }
    }
    if (updatedCount > 0) {
      Logger.info('schematic_editor', `updateWiresForComponentMove: updated ${updatedCount} wires for comp ${compId}`);
    }
    return movedStubFreeEnds;
  }

  /** World positions of every pin on every component (after current move applied). */
  private collectAllPinWorldPositions(): Point2D[] {
    const doc = this.getDocument();
    const out: Point2D[] = [];
    for (let ci = 0; ci < doc.components.length; ci++) {
      const pins = this.getComponentPinWorldPositions(doc.components[ci]);
      pins.forEach((p: Point2D) => {
        out.push(p);
      });
    }
    return out;
  }

  private isNearAnyPinWorld(pt: Point2D, pinWorlds: Point2D[], threshold: number): boolean {
    for (let i = 0; i < pinWorlds.length; i++) {
      const p = pinWorlds[i];
      if (Math.abs(pt.x - p.x) <= threshold && Math.abs(pt.y - p.y) <= threshold) {
        return true;
      }
    }
    return false;
  }

  /**
   * Recalculates the midpoint for a 3-point wire whose endpoint(s) moved.
   * Picks the L-shape that avoids component bodies and other-net wire overlap.
   */
  private recalcMidForMovedWire(
    newPoints: Point2D[],
    wire: Wire,
    movedCompId: string
  ): Point2D[] {
    const from = newPoints[0];
    const to = newPoints[2];
    const midA: Point2D = { x: to.x, y: from.y };
    const midB: Point2D = { x: from.x, y: to.y };

    // Exclude both endpoint components from body intersection checks
    const excludeIds = new Set<string>();
    excludeIds.add(movedCompId);
    const otherEndInfo = this.findPinAtPoint(to);
    if (otherEndInfo !== null && otherEndInfo.comp.id !== movedCompId) {
      excludeIds.add(otherEndInfo.comp.id);
    }
    // Also check the from end in case both ends were moved (same component)
    const fromEndInfo = this.findPinAtPoint(from);
    if (fromEndInfo !== null && fromEndInfo.comp.id !== movedCompId) {
      excludeIds.add(fromEndInfo.comp.id);
    }

    // Body intersection check
    const aBodyHit = this.horizontalSegmentIntersectsBody(from.x, midA.x, from.y, excludeIds) ||
      this.verticalSegmentIntersectsBody(midA.x, midA.y, to.y, excludeIds);
    const bBodyHit = this.verticalSegmentIntersectsBody(from.x, from.y, to.y, excludeIds) ||
      this.horizontalSegmentIntersectsBody(from.x, to.x, to.y, excludeIds);

    // Other-net overlap check (wires on the same net can overlap)
    const aOverlap = this.doesPathOverlapOtherNets([from, midA, to], wire.netId, wire.id);
    const bOverlap = this.doesPathOverlapOtherNets([from, midB, to], wire.netId, wire.id);

    // Rank: no-body-hit + no-overlap > no-body-hit > no-overlap > fallback
    if (!aBodyHit && !aOverlap) {
      newPoints[1] = midA;
    } else if (!bBodyHit && !bOverlap) {
      newPoints[1] = midB;
    } else if (!aBodyHit) {
      newPoints[1] = midA;
    } else if (!bBodyHit) {
      newPoints[1] = midB;
    } else if (!aOverlap) {
      newPoints[1] = midA;
    } else if (!bOverlap) {
      newPoints[1] = midB;
    } else {
      // Both L-shapes are bad; preserve original shape
      const origMid = wire.points.length === 3 ? wire.points[1] : null;
      if (origMid !== null) {
        const origWasA = (origMid.x === wire.points[2].x);
        newPoints[1] = origWasA ? midA : midB;
      } else {
        newPoints[1] = midA;
      }
    }
    return newPoints;
  }

  /**
   * Checks whether a candidate wire path has collinear overlap with any wire
   * of a DIFFERENT net. Same-net wires are allowed to overlap.
   */
  private doesPathOverlapOtherNets(points: Point2D[], ownNetId: string, ownWireId: string): boolean {
    const doc = this.getDocument();
    for (const other of doc.wires) {
      if (other.id === ownWireId || other.netId === ownNetId) {
        continue;
      }
      for (let wi = 1; wi < other.points.length; wi++) {
        const w0 = other.points[wi - 1];
        const w1 = other.points[wi];
        for (let si = 1; si < points.length; si++) {
          if (this.segmentsCollinearOverlap(points[si - 1], points[si], w0, w1)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Moves net labels that sit near a component's pins or near stub free ends
   * that were translated with the move.
   */
  private updateLabelsForComponentMove(
    oldPinPositions: Map<string, Point2D>,
    delta: Point2D,
    stubFreeEnds: Point2D[] = [],
    alreadyMoved: Set<string> | null = null
  ): void {
    if (delta.x === 0 && delta.y === 0) {
      return;
    }
    const doc = this.getDocument();
    const proximityThreshold = 80;
    let updatedCount = 0;

    const anchors: Point2D[] = [];
    oldPinPositions.forEach((oldPinPos: Point2D) => {
      anchors.push(oldPinPos);
    });
    for (let i = 0; i < stubFreeEnds.length; i++) {
      anchors.push(stubFreeEnds[i]);
    }

    for (let li = 0; li < doc.netLabels.length; li++) {
      const label = doc.netLabels[li];
      if (alreadyMoved !== null && alreadyMoved.has(label.id)) {
        continue;
      }
      let nearAnchor = false;
      for (let ai = 0; ai < anchors.length; ai++) {
        const a = anchors[ai];
        const dx = label.position.x - a.x;
        const dy = label.position.y - a.y;
        if (Math.abs(dx) <= proximityThreshold && Math.abs(dy) <= proximityThreshold) {
          nearAnchor = true;
          break;
        }
      }
      if (nearAnchor) {
        label.position.x += delta.x;
        label.position.y += delta.y;
        if (alreadyMoved !== null) {
          alreadyMoved.add(label.id);
        }
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      Logger.info('schematic_editor', `updateLabelsForComponentMove: moved ${updatedCount} labels by (${delta.x},${delta.y})`);
    }
  }

  /**
   * Remap labels after rotate/mirror: each label near an old pin follows that pin's delta.
   */
  private remapLabelsForPinMove(
    oldPinPositions: Map<string, Point2D>,
    newPinPositions: Map<string, Point2D>
  ): void {
    const doc = this.getDocument();
    const proximityThreshold = 80;
    let updatedCount = 0;
    for (let li = 0; li < doc.netLabels.length; li++) {
      const label = doc.netLabels[li];
      let bestPinId: string | null = null;
      let bestDist = proximityThreshold + 1;
      oldPinPositions.forEach((oldPos: Point2D, pinId: string) => {
        const dx = Math.abs(label.position.x - oldPos.x);
        const dy = Math.abs(label.position.y - oldPos.y);
        const d = Math.max(dx, dy);
        if (d <= proximityThreshold && d < bestDist) {
          bestDist = d;
          bestPinId = pinId;
        }
      });
      if (bestPinId === null) {
        continue;
      }
      const oldPos = oldPinPositions.get(bestPinId);
      const newPos = newPinPositions.get(bestPinId);
      if (oldPos === undefined || newPos === undefined) {
        continue;
      }
      label.position.x += newPos.x - oldPos.x;
      label.position.y += newPos.y - oldPos.y;
      updatedCount++;
    }
    if (updatedCount > 0) {
      Logger.info('schematic_editor', `remapLabelsForPinMove: remapped ${updatedCount} labels`);
    }
  }

  runErc(): ApiResult<ErcViolation[]> {
    const errors: ErcError[] = this.runERC();
    const violations: ErcViolation[] = [];
    for (let i = 0; i < errors.length; i++) {
      const e: ErcError = errors[i];
      let severity: ErcSeverity = ErcSeverity.WARNING;
      if (e.severity === 'error' || e.severity === 'critical') {
        severity = ErcSeverity.ERROR;
      }
      const violation: ErcViolation = {
        id: IdUtil.generate('erc'),
        severity: severity,
        ruleType: ErcRuleType.FLOATING_NET,
        message: e.desc,
        fixSuggestion: e.suggest
      };
      violations.push(violation);
    }
    return ResultHelper.ok(violations);
  }

  exportTopologyJson(): ApiResult<string> {
    return ResultHelper.ok(JSON.stringify(this.getFullTopology(), null, 2));
  }

  getBoundingBox(): Rect2D {
    const doc: SchematicDocument = this.getDocument();
    if (doc.components.length === 0) {
      const empty: Rect2D = { x: 0, y: 0, width: 800, height: 600 };
      return empty;
    }
    let minX: number = Infinity;
    let minY: number = Infinity;
    let maxX: number = -Infinity;
    let maxY: number = -Infinity;
    for (let i = 0; i < doc.components.length; i++) {
      const c: ComponentInstance = doc.components[i];
      const bounds = this.resolveBounds(c.libraryId);
      minX = Math.min(minX, c.position.x + bounds.minX);
      minY = Math.min(minY, c.position.y + bounds.minY);
      maxX = Math.max(maxX, c.position.x + bounds.maxX);
      maxY = Math.max(maxY, c.position.y + bounds.maxY);
    }
    for (let i = 0; i < doc.wires.length; i++) {
      const wire = doc.wires[i];
      for (let j = 0; j < wire.points.length; j++) {
        const pt = wire.points[j];
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      }
    }
    const box: Rect2D = {
      x: minX - 50,
      y: minY - 50,
      width: maxX - minX + 100,
      height: maxY - minY + 100
    };
    return box;
  }

  hitTestAt(point: Point2D): string[] {
    const components: ComponentInstance[] = this.getDocument().components;
    for (let i = components.length - 1; i >= 0; i--) {
      const c: ComponentInstance = components[i];
      const bounds = this.expandLocalBounds(this.resolveBounds(c.libraryId), SchematicEditorImpl.HIT_PAD);
      if (this.pointInComponentBounds(point, c, bounds)) {
        return [c.id];
      }
    }
    return [];
  }

  /**
   * 悬停命中：优先精确命中，否则取 HOVER_PAD 范围内最近器件。
   * 鼠标只要靠近附近器件就会出现选中区。
   */
  hitTestNear(point: Point2D, pad: number = SchematicEditorImpl.HOVER_PAD): string[] {
    const direct = this.hitTestAt(point);
    if (direct.length > 0) {
      return direct;
    }
    const components: ComponentInstance[] = this.getDocument().components;
    let bestId: string = '';
    let bestDist: number = pad;
    for (let i = components.length - 1; i >= 0; i--) {
      const c: ComponentInstance = components[i];
      const hoverBounds = this.expandLocalBounds(this.resolveBounds(c.libraryId), pad);
      if (this.pointInComponentBounds(point, c, hoverBounds)) {
        const aabb = this.localBoundsToWorldAabb(c, this.resolveBounds(c.libraryId));
        const dist = SchematicEditorImpl.distancePointToRect(point, aabb);
        if (dist < bestDist) {
          bestDist = dist;
          bestId = c.id;
        }
      }
    }
    if (bestId.length > 0) {
      return [bestId];
    }
    return [];
  }

  private static distancePointToRect(p: Point2D, r: Rect2D): number {
    const x2 = r.x + r.width;
    const y2 = r.y + r.height;
    const dx = p.x < r.x ? (r.x - p.x) : (p.x > x2 ? p.x - x2 : 0);
    const dy = p.y < r.y ? (r.y - p.y) : (p.y > y2 ? p.y - y2 : 0);
    return Math.sqrt(dx * dx + dy * dy);
  }

  hitTestWireAt(point: Point2D): string | null {
    const wires = this.getDocument().wires;
    let bestNet: string | null = null;
    let bestDist: number = SchematicEditorImpl.WIRE_HIT_THRESHOLD;
    for (let i = 0; i < wires.length; i++) {
      const wire = wires[i];
      const pts = wire.points;
      for (let j = 0; j < pts.length - 1; j++) {
        const dist = SchematicEditorImpl.pointSegmentDistance(point, pts[j], pts[j + 1]);
        if (dist < bestDist) {
          bestDist = dist;
          bestNet = wire.netId;
        }
      }
    }
    return bestNet;
  }

  selectInRect(rect: Rect2D): string[] {
    const hit: string[] = [];
    const components: ComponentInstance[] = this.getDocument().components;
    for (let i = 0; i < components.length; i++) {
      const c = components[i];
      const bounds = this.resolveBounds(c.libraryId);
      const compRect: Rect2D = {
        x: c.position.x + bounds.minX,
        y: c.position.y + bounds.minY,
        width: bounds.width,
        height: bounds.height
      };
      if (SchematicEditorImpl.rectsOverlap(rect, compRect)) {
        hit.push(c.id);
      }
    }
    this.selectedIds = hit;
    this.selectedNetIds = [];
    CallbackRegistry.getInstance().emitSelection(this.getSelectedDevices(), this.getSelectedNets());
    EventBus.getInstance().publish({
      event: ModuleEvent.SELECTION_CHANGED,
      source: 'schematic_editor',
      timestamp: Date.now(),
      data: hit
    });
    return hit;
  }

  selectAll(): string[] {
    const ids: string[] = [];
    for (const c of this.getDocument().components) {
      ids.push(c.id);
    }
    return this.setSelectionAndReturn(ids);
  }

  toggleSelection(id: string): string[] {
    const idx = this.selectedIds.indexOf(id);
    if (idx >= 0) {
      const next: string[] = [];
      for (let i = 0; i < this.selectedIds.length; i++) {
        if (i !== idx) next.push(this.selectedIds[i]);
      }
      return this.setSelectionAndReturn(next);
    }
    const next = SchematicEditorImpl.copyStringArray(this.selectedIds);
    next.push(id);
    return this.setSelectionAndReturn(next);
  }

  private setSelectionAndReturn(ids: string[]): string[] {
    this.selectedIds = SchematicEditorImpl.copyStringArray(ids);
    CallbackRegistry.getInstance().emitSelection(this.getSelectedDevices(), this.getSelectedNets());
    return this.selectedIds.slice();
  }

  private static rectsOverlap(a: Rect2D, b: Rect2D): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x &&
      a.y < b.y + b.height && a.y + a.height > b.y;
  }

  selectAt(point: Point2D): string[] {
    const hit: string[] = this.hitTestAt(point);
    if (hit.length > 0) {
      this.selectedIds = hit;
      this.selectedNetIds = [];
      CallbackRegistry.getInstance().emitSelection(this.getSelectedDevices(), this.getSelectedNets());
      EventBus.getInstance().publish({
        event: ModuleEvent.SELECTION_CHANGED,
        source: 'schematic_editor',
        timestamp: Date.now(),
        data: hit
      });
      return hit;
    }
    const wireNet: string | null = this.hitTestWireAt(point);
    if (wireNet !== null && wireNet.length > 0) {
      this.selectedIds = [];
      this.selectedNetIds = [wireNet];
      CallbackRegistry.getInstance().emitSelection(this.getSelectedDevices(), this.getSelectedNets());
      EventBus.getInstance().publish({
        event: ModuleEvent.SELECTION_CHANGED,
        source: 'schematic_editor',
        timestamp: Date.now(),
        data: []
      });
      return [];
    }
    this.selectedIds = [];
    this.selectedNetIds = [];
    CallbackRegistry.getInstance().emitSelection(this.getSelectedDevices(), this.getSelectedNets());
    EventBus.getInstance().publish({
      event: ModuleEvent.SELECTION_CHANGED,
      source: 'schematic_editor',
      timestamp: Date.now(),
      data: []
    });
    return [];
  }

  private expandLocalBounds(bounds: SymbolBounds, pad: number): SymbolBounds {
    return {
      minX: bounds.minX - pad,
      maxX: bounds.maxX + pad,
      minY: bounds.minY - pad,
      maxY: bounds.maxY + pad,
      width: bounds.width + pad * 2,
      height: bounds.height + pad * 2
    };
  }

  private localBoundsToWorldAabb(comp: ComponentInstance, bounds: SymbolBounds): Rect2D {
    const corners: Point2D[] = [
      { x: bounds.minX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY },
      { x: bounds.minX, y: bounds.maxY }
    ];
    let minX: number = Infinity;
    let minY: number = Infinity;
    let maxX: number = -Infinity;
    let maxY: number = -Infinity;
    for (let i = 0; i < corners.length; i++) {
      const world = this.localToWorldPoint(comp, corners[i]);
      minX = Math.min(minX, world.x);
      minY = Math.min(minY, world.y);
      maxX = Math.max(maxX, world.x);
      maxY = Math.max(maxY, world.y);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  private localToWorldPoint(comp: ComponentInstance, local: Point2D): Point2D {
    let lx: number = local.x;
    let ly: number = local.y;
    if (comp.mirrored) {
      lx = -lx;
    }
    if (comp.rotation !== 0) {
      const rad: number = (comp.rotation as number) * Math.PI / 180;
      const rx: number = lx * Math.cos(rad) - ly * Math.sin(rad);
      const ry: number = lx * Math.sin(rad) + ly * Math.cos(rad);
      lx = rx;
      ly = ry;
    }
    return { x: comp.position.x + lx, y: comp.position.y + ly };
  }

  private static pointSegmentDistance(p: Point2D, a: Point2D, b: Point2D): number {
    const dx: number = b.x - a.x;
    const dy: number = b.y - a.y;
    if (dx === 0 && dy === 0) {
      const ex: number = p.x - a.x;
      const ey: number = p.y - a.y;
      return Math.sqrt(ex * ex + ey * ey);
    }
    const t: number = Math.max(0, Math.min(1,
      ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    const projX: number = a.x + t * dx;
    const projY: number = a.y + t * dy;
    const ex: number = p.x - projX;
    const ey: number = p.y - projY;
    return Math.sqrt(ex * ex + ey * ey);
  }

  private pointInComponentBounds(point: Point2D, comp: ComponentInstance, bounds: SymbolBounds): boolean {
    let lx: number = point.x - comp.position.x;
    let ly: number = point.y - comp.position.y;
    if (comp.rotation !== 0) {
      const rad: number = (0 - (comp.rotation as number)) * Math.PI / 180;
      const rx: number = lx * Math.cos(rad) - ly * Math.sin(rad);
      const ry: number = lx * Math.sin(rad) + ly * Math.cos(rad);
      lx = rx;
      ly = ry;
    }
    if (comp.mirrored) {
      lx = -lx;
    }
    const local: Point2D = { x: lx, y: ly };
    const origin: Point2D = { x: 0, y: 0 };
    return pointInSymbolBounds(local, origin, bounds);
  }

  private static readonly MIN_HIT_W: number = 60;
  private static readonly MIN_HIT_H: number = 40;

  private resolveBounds(libraryId: string): SymbolBounds {
    if (this.boundsResolver !== null) {
      const resolved = this.boundsResolver(libraryId);
      if (resolved !== null) {
        // 最小命中区：向原点对称扩展，勿以引脚中心为锚（否则仪器主体右半仍在区外）
        if (resolved.width < SchematicEditorImpl.MIN_HIT_W ||
            resolved.height < SchematicEditorImpl.MIN_HIT_H) {
          const w = Math.max(resolved.width, SchematicEditorImpl.MIN_HIT_W);
          const h = Math.max(resolved.height, SchematicEditorImpl.MIN_HIT_H);
          const minX = Math.min(resolved.minX, -w / 2);
          const maxX = Math.max(resolved.maxX, w / 2);
          const minY = Math.min(resolved.minY, -h / 2);
          const maxY = Math.max(resolved.maxY, h / 2);
          return {
            minX, maxX, minY, maxY,
            width: maxX - minX, height: maxY - minY
          };
        }
        return resolved;
      }
    }
    return calcSymbolBounds([], 8);
  }

  setSelection(ids: string[]): void {
    this.selectedIds = SchematicEditorImpl.copyStringArray(ids);
    CallbackRegistry.getInstance().emitSelection(this.getSelectedDevices(), this.getSelectedNets());
  }

  getLayers(): SchematicLayer[] {
    return this.layers.slice();
  }

  setLayerVisible(layerId: SchematicLayerId, visible: boolean): void {
    for (let i = 0; i < this.layers.length; i++) {
      if (this.layers[i].layerId === layerId) {
        this.layers[i].visible = visible;
      }
    }
  }

  setLayerLocked(layerId: SchematicLayerId, locked: boolean): void {
    for (let i = 0; i < this.layers.length; i++) {
      if (this.layers[i].layerId === layerId) {
        this.layers[i].locked = locked;
      }
    }
  }

  isLayerVisible(layerId: SchematicLayerId): boolean {
    for (let i = 0; i < this.layers.length; i++) {
      if (this.layers[i].layerId === layerId) return this.layers[i].visible;
    }
    return true;
  }

  isLayerLocked(layerId: SchematicLayerId): boolean {
    for (let i = 0; i < this.layers.length; i++) {
      if (this.layers[i].layerId === layerId) return this.layers[i].locked;
    }
    return false;
  }

  addWireSegment(from: Point2D, to: Point2D, netId?: string): ApiResult<string> {
    const guard: ApiResult<void> | null = this.guardEdit();
    if (guard !== null) {
      return ResultHelper.fail(guard.errCode !== undefined ? guard.errCode : ErrCode.ERR_SIM_BUSY, guard.error);
    }
    const g = this.viewport.gridSize;
    let snappedFrom = EditorInternals.calcSnapPoint(from.x, from.y, g);
    let snappedTo = EditorInternals.calcSnapPoint(to.x, to.y, g);
    // Snap wire endpoints to nearest component pins for visual connection
    snappedFrom = this.snapToNearestPin(snappedFrom, g);
    snappedTo = this.snapToNearestPin(snappedTo, g);
    Logger.info('schematic_editor', `addWireSegment from=(${snappedFrom.x},${snappedFrom.y}) to=(${snappedTo.x},${snappedTo.y})`);
    if (snappedFrom.x === snappedTo.x && snappedFrom.y === snappedTo.y) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '导线起点与终点重合，请选择不同位置');
    }
    // Smart orthogonal routing: try both L-shapes, avoid crossing component bodies
    const wirePoints = this.routeOrthogonalWire(snappedFrom, snappedTo);
    const wireId = IdUtil.generate('wire');
    const resolvedNetId = netId !== undefined && netId.length > 0 ? netId : IdUtil.generate('net');
    const wire: Wire = {
      id: wireId,
      netId: resolvedNetId,
      points: wirePoints,
      style: WireStyle.ORTHOGONAL
    };
    if (this.document !== null) {
      this.commandHistory.push(new AddWireCommand(this.document, wire));
    } else {
      this.getDocument().wires.push(wire);
    }
    this.ensureNetExists(resolvedNetId);
    this.connectWireToPins(snappedFrom, snappedTo, resolvedNetId);
    this.rebuildNetPinConnectivity();
    this.notifyChange();
    return ResultHelper.ok(wireId);
  }

  addWireWithPoints(waypoints: Point2D[], netId?: string): ApiResult<string> {
    const guard: ApiResult<void> | null = this.guardEdit();
    if (guard !== null) {
      return ResultHelper.fail(guard.errCode !== undefined ? guard.errCode : ErrCode.ERR_SIM_BUSY, guard.error);
    }
    if (waypoints.length < 2) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '需要至少两个点');
    }
    const g = this.viewport.gridSize;
    // Endpoint waypoints arrive from canvas already at the correct pin world positions
    // (as determined by findNearestPinWorld).  We must NOT re‑snap them to pins here,
    // because grid‑snapping can shift a point closer to a *different* component's pin,
    // causing the wire to visually land on the wrong pin while connectWireToPins
    // (which uses the same snapped coordinates) still connects to the correct one.
    // Intermediate corners are only grid‑snapped for routing consistency.
    const snapped: Point2D[] = [];
    for (let i = 0; i < waypoints.length; i++) {
      const isEndpoint = i === 0 || i === waypoints.length - 1;
      if (isEndpoint) {
        // Preserve exact pin positions from canvas — no re-snapping
        snapped.push({ x: waypoints[i].x, y: waypoints[i].y });
      } else {
        snapped.push(EditorInternals.calcSnapPoint(waypoints[i].x, waypoints[i].y, g));
      }
    }

    // Build full point list by routing each consecutive pair, deduplicating boundaries
    const allPoints: Point2D[] = [snapped[0]];
    for (let i = 0; i < snapped.length - 1; i++) {
      const segPoints = this.routeOrthogonalWire(snapped[i], snapped[i + 1]);
      // Skip the first point (already in allPoints), append the rest
      for (let j = 1; j < segPoints.length; j++) {
        allPoints.push(segPoints[j]);
      }
    }

    // Guarantee wire path endpoints are at the exact pin positions the user clicked
    allPoints[0] = { x: snapped[0].x, y: snapped[0].y };
    allPoints[allPoints.length - 1] = { x: snapped[snapped.length - 1].x, y: snapped[snapped.length - 1].y };

    // Ensure wires approach pins perpendicular to the body edge, not running
    // parallel along it (which would visually overlap the component border).
    this.ensurePerpendicularApproach(allPoints);

    const wireId = IdUtil.generate('wire');
    // Inherit net from the start point: if the first endpoint lands on a pin
    // that already belongs to a net, the new wire joins that net.  Otherwise
    // (and for intermediate corners) create a fresh net.
    let resolvedNetId: string;
    if (netId !== undefined && netId.length > 0) {
      resolvedNetId = netId;
    } else {
      const inherited = this.inheritNetAtPosition(allPoints[0]);
      resolvedNetId = inherited !== null ? inherited : IdUtil.generate('net');
    }
    const wire: Wire = {
      id: wireId,
      netId: resolvedNetId,
      points: allPoints,
      style: WireStyle.ORTHOGONAL
    };
    if (this.document !== null) {
      this.commandHistory.push(new AddWireCommand(this.document, wire));
    } else {
      this.getDocument().wires.push(wire);
    }
    this.ensureNetExists(resolvedNetId);
    this.connectWireToPins(allPoints[0], allPoints[allPoints.length - 1], resolvedNetId);
    this.rebuildNetPinConnectivity();
    this.notifyChange();
    return ResultHelper.ok(wireId);
  }

  /**
   * 从导线几何与器件引脚位置重建全部 net.pinIds，合并 VCC/GND 全局网络。
   * 解决画布显示已连接但拓扑 pinIds 为空的问题。
   */
  rebuildNetPinConnectivity(): void {
    const doc = this.getDocument();
    const resolver: PinGeometryResolver = (libraryId: string): PinGeometry[] | null => {
      const pins = this.resolvePins(libraryId);
      if (pins === null) {
        return null;
      }
      const out: PinGeometry[] = [];
      for (let i = 0; i < pins.length; i++) {
        const geom: PinGeometry = {
          id: pins[i].id,
          name: pins[i].name,
          x: pins[i].position.x,
          y: pins[i].position.y
        };
        out.push(geom);
      }
      return out;
    };
    rebuildAllNetPinConnectivity(doc, Math.min(this.viewport.gridSize, 10), resolver);
    this.mergeDuplicateNamedNets();
  }

  /**
   * Reassign wires at shared endpoints so all wires touching the same point
   * belong to the same net.  Unlike mergeNets (which merges entire nets),
   * this only touches wires whose endpoints are co-located — it does not
   * pull in other wires that happen to share the same net elsewhere.
   */
  private mergeNetsAtSharedWireEndpoints(): void {
    const doc = this.getDocument();
    // Match WireNetTopology cap: must stay < half of MCU 10px pin pitch
    const junctionRadius = Math.min(Math.max(2, this.viewport.gridSize * 0.5), 5);
    // Collect endpoint → {point, wireIndex} pairs
    interface EndpointEntry { pt: Point2D; wireIdx: number; }
    const endpoints: EndpointEntry[] = [];
    for (let wi = 0; wi < doc.wires.length; wi++) {
      const wire = doc.wires[wi];
      if (wire.points.length < 2) continue;
      endpoints.push({ pt: wire.points[0], wireIdx: wi });
      endpoints.push({ pt: wire.points[wire.points.length - 1], wireIdx: wi });
    }
    // Greedy grouping: endpoints within junctionRadius share the same junction
    const groups: EndpointEntry[][] = [];
    const used = new Array<boolean>(endpoints.length).fill(false);
    for (let i = 0; i < endpoints.length; i++) {
      if (used[i]) continue;
      const group: EndpointEntry[] = [endpoints[i]];
      used[i] = true;
      for (let j = i + 1; j < endpoints.length; j++) {
        if (used[j]) continue;
        for (const member of group) {
          const dx = member.pt.x - endpoints[j].pt.x;
          const dy = member.pt.y - endpoints[j].pt.y;
          if (Math.abs(dx) <= junctionRadius && Math.abs(dy) <= junctionRadius) {
            group.push(endpoints[j]);
            used[j] = true;
            break;          }
        }
      }
      groups.push(group);
    }
    // For each junction, reassign all wires to the first wire's net.
    // No rail priority — it would pull signal wires onto GND at junctions
    // where the saved data already has a wrong net assignment.
    for (const group of groups) {
      // Collect distinct net IDs in this group
      const netIds: string[] = [];
      for (const ep of group) {
        const nid = doc.wires[ep.wireIdx].netId;
        if (!netIds.includes(nid)) {
          netIds.push(nid);
        }
      }
      if (netIds.length <= 1) continue;
      const canonicalId = netIds[0];
      for (const ep of group) {
        const wire = doc.wires[ep.wireIdx];
        if (wire.netId !== canonicalId) {
          wire.netId = canonicalId;
        }
      }
    }
  }

  /** 将 VCC/GND 符号引脚注册到全局电源网络 */
  private registerPowerSymbolOnGlobalNet(comp: ComponentInstance): void {
    const libUpper = comp.libraryId.toUpperCase();
    let netName: string | null = null;
    if (libUpper === 'VCC' || libUpper.endsWith('/VCC')) {
      netName = 'VCC';
    } else if (libUpper === 'GND' || libUpper.endsWith('/GND')) {
      netName = 'GND';
    }
    if (netName === null) {
      return;
    }
    const pins = this.resolvePins(comp.libraryId);
    if (pins === null || pins.length === 0) {
      return;
    }
    const pin = pins[0];
    let powerNet = this.findNetByName(this.getDocument(), netName);
    if (powerNet === undefined) {
      this.createNetLabel(comp.position.x, comp.position.y, netName);
      powerNet = this.findNetByName(this.getDocument(), netName);
    }
    if (powerNet !== undefined) {
      this.addPinToNet(powerNet.id, comp.id, pin.id, pin.name);
    }
  }

  /** 合并同名电源/地网络及同标签网络 */
  private mergeDuplicateNamedNets(): void {
    const doc = this.getDocument();
    const railNames: string[] = ['VCC', 'VDD', 'GND', 'VSS', 'VEE', '0'];
    for (let ri = 0; ri < railNames.length; ri++) {
      const rail = railNames[ri];
      let canonicalId: string | null = null;
      for (let ni = 0; ni < doc.nets.length; ni++) {
        if (doc.nets[ni].name.toUpperCase() === rail) {
          if (canonicalId === null) {
            canonicalId = doc.nets[ni].id;
          } else if (doc.nets[ni].id !== canonicalId) {
            this.mergeNets(doc.nets[ni].id, canonicalId);
          }
        }
      }
    }
    // Merge non-rail nets that share the same intentional name（排除空名与自动 NET_*）
    const nameCanonical = new Map<string, string>();
    for (let ni = 0; ni < doc.nets.length; ni++) {
      const net = doc.nets[ni];
      const key = net.name.toUpperCase();
      if (key.length === 0 || /^NET_\d+$/i.test(key) || /^NET_TOPO/i.test(key)) {
        continue;
      }
      if (nameCanonical.has(key)) {
        this.mergeNets(net.id, nameCanonical.get(key)!);
      } else {
        nameCanonical.set(key, net.id);
      }
    }
    // Label-based merging: same text (case-sensitive, Proteus) — skip auto NET_*
    const labelCanonical = new Map<string, string>();
    for (let li = 0; li < doc.netLabels.length; li++) {
      const label = doc.netLabels[li];
      const key = label.text;
      if (key.length === 0 || /^NET_\d+$/i.test(key) || /^net_topo/i.test(key)) {
        continue;
      }
      if (labelCanonical.has(key)) {
        this.mergeNets(label.netId, labelCanonical.get(key)!);
      } else {
        labelCanonical.set(key, label.netId);
      }
    }
  }

  /**
   * Routes an orthogonal wire between two points, choosing the L-shape variant
   * that avoids crossing through component bodies. Falls back to the simple
   * L-shape if pin/body data is unavailable.
   */
  private routeOrthogonalWire(from: Point2D, to: Point2D): Point2D[] {
    const midA: Point2D = { x: to.x, y: from.y };
    const midB: Point2D = { x: from.x, y: to.y };

    const fromInfo = this.findPinAtPoint(from);
    const toInfo = this.findPinAtPoint(to);

    // When both pins share the same component, that component body IS an obstacle.
    // Otherwise, exclude the endpoint components so wires can reach their pins.
    const sameComp = fromInfo !== null && toInfo !== null && fromInfo.comp.id === toInfo.comp.id;
    const bodyExcludeIds = new Set<string>();
    if (!sameComp) {
      if (fromInfo !== null) { bodyExcludeIds.add(fromInfo.comp.id); }
      if (toInfo !== null) { bodyExcludeIds.add(toInfo.comp.id); }
    }

    // Build pin obstacles, excluding all pins from components whose bodies are
    // already excluded.  Otherwise intermediate pins along a chip edge (e.g.
    // pins 1–3 when routing to pin 4) would trigger unnecessary detours that
    // add extra corners and make the wire appear to land on the wrong pin.
    const pinObstacles = this.collectPinObstacles(bodyExcludeIds);

    if (fromInfo === null && toInfo === null && pinObstacles.length === 0) {
      return [from, midA, to];
    }

    const scoreA = this.scoreWirePath(from, midA, to, bodyExcludeIds, pinObstacles);
    const scoreB = this.scoreWirePath(from, midB, to, bodyExcludeIds, pinObstacles);

    let mid: Point2D;
    if (scoreA.score < scoreB.score) {
      mid = midA;
    } else if (scoreB.score < scoreA.score) {
      mid = midB;
    } else {
      mid = this.preferMidByPinDirection(from, to, fromInfo, toInfo, midA, midB);
    }

    const chosenScore = mid === midA ? scoreA : scoreB;
    if (chosenScore.intersectsBody || chosenScore.pinHits > 0) {
      return this.routeAroundObstacles(from, mid, to, bodyExcludeIds, pinObstacles);
    }

    const bestPoints = [from, mid, to];
    if (this.doesPathOverlapExisting(bestPoints)) {
      const altMid = mid === midA ? midB : midA;
      const altScore = altMid === midA ? scoreA : scoreB;
      if (altScore.score === 0 && !this.doesPathOverlapExisting([from, altMid, to])) {
        mid = altMid;
      }
    }
    return [from, mid, to];
  }

  /**
   * Returns the world-space axis-aligned bounding box for a component body.
   */
  private getComponentWorldBounds(comp: ComponentInstance): Rect2D | null {
    const pins = this.resolvePins(comp.libraryId);
    if (pins === null || pins.length === 0) {
      // Fallback default bounds
      return { x: comp.position.x - 30, y: comp.position.y - 20, width: 60, height: 40 };
    }
    const localBounds = calcSymbolBounds(pins, 10);
    const corners: Point2D[] = [
      { x: localBounds.minX, y: localBounds.minY },
      { x: localBounds.maxX, y: localBounds.minY },
      { x: localBounds.minX, y: localBounds.maxY },
      { x: localBounds.maxX, y: localBounds.maxY }
    ];
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const corner of corners) {
      const local = this.transformPinOffsetForConnect(corner, comp.rotation, comp.mirrored);
      const wx = comp.position.x + local.x;
      const wy = comp.position.y + local.y;
      if (wx < minX) { minX = wx; }
      if (wy < minY) { minY = wy; }
      if (wx > maxX) { maxX = wx; }
      if (wy > maxY) { maxY = wy; }
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  private collectPinObstacles(excludeCompIds: Set<string>): Point2D[] {
    const doc = this.getDocument();
    const result: Point2D[] = [];
    for (const comp of doc.components) {
      if (excludeCompIds.has(comp.id)) { continue; }
      const pins = this.resolvePins(comp.libraryId);
      if (pins === null) { continue; }
      for (const pin of pins) {
        const local = this.transformPinOffsetForConnect(pin.position, comp.rotation, comp.mirrored);
        const pw: Point2D = { x: comp.position.x + local.x, y: comp.position.y + local.y };
        result.push(pw);
      }
    }
    return result;
  }

  private scoreWirePath(from: Point2D, mid: Point2D, to: Point2D, excludeIds: Set<string>, pinObstacles: Point2D[]): WirePathScore {
    let bodyHits = 0;
    let pinHits = 0;
    const pinThreshold = this.viewport.gridSize * 2;

    if (from.y === mid.y) {
      if (this.horizontalSegmentIntersectsBody(from.x, mid.x, from.y, excludeIds)) { bodyHits++; }
      pinHits += this.countPinHitsHorizontal(from.x, mid.x, from.y, pinObstacles, pinThreshold);
    } else {
      if (this.verticalSegmentIntersectsBody(from.x, from.y, mid.y, excludeIds)) { bodyHits++; }
      pinHits += this.countPinHitsVertical(from.x, from.y, mid.y, pinObstacles, pinThreshold);
    }
    if (mid.y === to.y) {
      if (this.horizontalSegmentIntersectsBody(mid.x, to.x, mid.y, excludeIds)) { bodyHits++; }
      pinHits += this.countPinHitsHorizontal(mid.x, to.x, mid.y, pinObstacles, pinThreshold);
    } else {
      if (this.verticalSegmentIntersectsBody(mid.x, mid.y, to.y, excludeIds)) { bodyHits++; }
      pinHits += this.countPinHitsVertical(mid.x, mid.y, to.y, pinObstacles, pinThreshold);
    }
    const pathScore: WirePathScore = { score: bodyHits * 10 + pinHits * 3, intersectsBody: bodyHits > 0, pinHits: pinHits };
    return pathScore;
  }

  private countPinHitsHorizontal(x1: number, x2: number, y: number, obstacles: Point2D[], threshold: number): number {
    const minX = Math.min(x1, x2) - threshold;
    const maxX = Math.max(x1, x2) + threshold;
    let count = 0;
    for (const pw of obstacles) {
      if (Math.abs(pw.y - y) <= threshold && pw.x >= minX && pw.x <= maxX) { count++; }
    }
    return count;
  }

  private countPinHitsVertical(x: number, y1: number, y2: number, obstacles: Point2D[], threshold: number): number {
    const minY = Math.min(y1, y2) - threshold;
    const maxY = Math.max(y1, y2) + threshold;
    let count = 0;
    for (const pw of obstacles) {
      if (Math.abs(pw.x - x) <= threshold && pw.y >= minY && pw.y <= maxY) { count++; }
    }
    return count;
  }

  private horizontalSegmentIntersectsBody(x1: number, x2: number, y: number, excludeIds: Set<string>): boolean {
    const doc = this.getDocument();
    const segMinX = Math.min(x1, x2);
    const segMaxX = Math.max(x1, x2);
    for (const comp of doc.components) {
      if (excludeIds.has(comp.id)) { continue; }
      const b = this.getComponentWorldBounds(comp);
      if (b === null) { continue; }
      if (y >= b.y && y <= b.y + b.height && segMaxX > b.x && segMinX < b.x + b.width) {
        return true;
      }
    }
    return false;
  }

  private verticalSegmentIntersectsBody(x: number, y1: number, y2: number, excludeIds: Set<string>): boolean {
    const doc = this.getDocument();
    const segMinY = Math.min(y1, y2);
    const segMaxY = Math.max(y1, y2);
    for (const comp of doc.components) {
      if (excludeIds.has(comp.id)) { continue; }
      const b = this.getComponentWorldBounds(comp);
      if (b === null) { continue; }
      if (x >= b.x && x <= b.x + b.width && segMaxY > b.y && segMinY < b.y + b.height) {
        return true;
      }
    }
    return false;
  }

  private preferMidByPinDirection(
    from: Point2D, to: Point2D,
    fromInfo: PinAtPoint | null,
    toInfo: PinAtPoint | null,
    midA: Point2D, midB: Point2D
  ): Point2D {
    // Score: +1 for each pin whose approach direction matches the path
    let scoreA = 0; let scoreB = 0;
    if (fromInfo !== null) {
      const d = this.getPinExtensionDir(fromInfo.pin, fromInfo.comp);
      // Path A: from→midA is horizontal. Path B: from→midB is vertical.
      if (d === 'horizontal') { scoreA++; } else { scoreB++; }
    }
    if (toInfo !== null) {
      const d = this.getPinExtensionDir(toInfo.pin, toInfo.comp);
      // Path A: midA→to is vertical. Path B: midB→to is horizontal.
      if (d === 'vertical') { scoreA++; } else { scoreB++; }
    }
    // When tied, prefer the approach that runs perpendicular to the target
    // pin edge — horizontal for left/right pins, vertical for top/bottom pins.
    // This prevents the wire from running vertically along the pin column.
    if (scoreA === scoreB && toInfo !== null) {
      const toDir = this.getPinExtensionDir(toInfo.pin, toInfo.comp);
      return toDir === 'horizontal' ? midB : midA;
    }
    return scoreB > scoreA ? midB : midA;
  }

  private getPinExtensionDir(pin: Pin, comp: ComponentInstance): 'horizontal' | 'vertical' {
    const local = this.transformPinOffsetForConnect(pin.position, comp.rotation, comp.mirrored);
    if (Math.abs(local.x) * 8 >= Math.abs(local.y)) {
      return 'horizontal';
    }
    return 'vertical';
  }

  private findPinAtPoint(world: Point2D): PinAtPoint | null {
    const doc = this.getDocument();
    const threshold = this.viewport.gridSize * 1.5;
    let bestDist = threshold;
    let bestResult: PinAtPoint | null = null;
    for (const comp of doc.components) {
      const pins = this.resolvePins(comp.libraryId);
      if (pins === null) { continue; }
      for (const pin of pins) {
        const local = this.transformPinOffsetForConnect(pin.position, comp.rotation, comp.mirrored);
        const pinWorld: Point2D = { x: comp.position.x + local.x, y: comp.position.y + local.y };
        const dx = world.x - pinWorld.x;
        const dy = world.y - pinWorld.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= bestDist) {
          bestDist = dist;
          bestResult = { comp: comp, pin: pin, pinWorld: pinWorld };
        }
      }
    }
    return bestResult;
  }

  /**
   * When both L-shape variants intersect component bodies, this method attempts
   * to add intermediate waypoints to route around the intersected body.
   */
  /**
   * Routes around obstacles (component bodies and non-endpoint pins) that
   * lie along the chosen L-shape path. Adds intermediate waypoints to produce
   * clean right-angle detours like Proteus.
   */
  private routeAroundObstacles(from: Point2D, mid: Point2D, to: Point2D, excludeIds: Set<string>, pinObstacles: Point2D[]): Point2D[] {
    const g = this.viewport.gridSize;
    const pinThreshold = g * 2;
    const detourMargin = g * 2;

    // Determine which side to detour to for each obstacle found
    // For each of the two segments, find the furthest-obstructing obstacle
    // and route around it (and all obstacles on that side).

    // Segment 1: from → mid
    const seg1H = from.y === mid.y;
    let seg1Detour: Point2D[] | null = null;

    if (seg1H) {
      // Horizontal segment at y=from.y from from.x to mid.x
      seg1Detour = this.findHorizontalDetour(from.x, mid.x, from.y, from, to, excludeIds, pinObstacles, pinThreshold, detourMargin, true);
    } else {
      // Vertical segment at x=from.x from from.y to mid.y
      seg1Detour = this.findVerticalDetour(from.x, from.y, mid.y, from, to, excludeIds, pinObstacles, pinThreshold, detourMargin, true);
    }

    // Segment 2: mid → to
    const seg2H = mid.y === to.y;
    let seg2Detour: Point2D[] | null = null;

    if (seg2H) {
      seg2Detour = this.findHorizontalDetour(mid.x, to.x, mid.y, from, to, excludeIds, pinObstacles, pinThreshold, detourMargin, false);
    } else {
      seg2Detour = this.findVerticalDetour(mid.x, mid.y, to.y, from, to, excludeIds, pinObstacles, pinThreshold, detourMargin, false);
    }

    if (seg1Detour === null && seg2Detour === null) {
      return [from, mid, to];
    }

    // Build the final path with detours
    const result: Point2D[] = [from];
    if (seg1Detour !== null) {
      for (let i = 1; i < seg1Detour.length; i++) {
        result.push(seg1Detour[i]);
      }
    } else {
      result.push(mid);
    }
    if (seg2Detour !== null) {
      for (let i = 1; i < seg2Detour.length; i++) {
        result.push(seg2Detour[i]);
      }
    } else {
      result.push(to);
    }
    // Safety: ensure the final point is exactly at 'to'
    const lastIdx = result.length - 1;
    if (result[lastIdx].x !== to.x || result[lastIdx].y !== to.y) {
      result[lastIdx] = { x: to.x, y: to.y };
    }
    return result;
  }

  /**
   * Adjusts the wire path so that the approach to each endpoint pin is
   * perpendicular to the component body edge, not running parallel along it.
   * A parallel approach would visually overlap the component border.
   */
  private ensurePerpendicularApproach(path: Point2D[]): void {
    if (path.length < 2) { return; }
    this.fixApproachForEndpoint(path, 0, true);
    this.fixApproachForEndpoint(path, path.length - 1, false);
  }

  private fixApproachForEndpoint(path: Point2D[], idx: number, isStart: boolean): void {
    const pinPoint = path[idx];
    const pinInfo = this.findPinAtPoint(pinPoint);
    if (pinInfo === null) { return; }

    const body = this.getComponentWorldBounds(pinInfo.comp);
    if (body === null) { return; }

    const g = this.viewport.gridSize;
    const threshold = g;
    const approachGap = g * 3; // clear visual separation from the pin column

    // Determine which body edge the pin sits on
    let side: string | null = null;
    if (Math.abs(pinPoint.x - body.x) <= threshold) {
      side = 'left';
    } else if (Math.abs(pinPoint.x - (body.x + body.width)) <= threshold) {
      side = 'right';
    } else if (Math.abs(pinPoint.y - body.y) <= threshold) {
      side = 'top';
    } else if (Math.abs(pinPoint.y - (body.y + body.height)) <= threshold) {
      side = 'bottom';
    }
    if (side === null) { return; }

    const otherIdx = isStart ? 1 : idx - 1;
    const other = path[otherIdx];
    const eps = 0.5; // tolerance for floating-point equality

    // Check if the approach segment runs parallel to the body edge
    if (side === 'left' || side === 'right') {
      // Pin on left/right edge → approach must be horizontal (different x, same y)
      if (Math.abs(other.x - pinPoint.x) > eps && Math.abs(other.y - pinPoint.y) <= eps) { return; } // already perpendicular
      // Running parallel — offset to create perpendicular approach
      const offsetX = side === 'left' ? pinPoint.x - approachGap : pinPoint.x + approachGap;
      // Bend: go to offsetX first, then approach pin horizontally
      const stub: Point2D = { x: offsetX, y: pinPoint.y };
      if (isStart) {
        path[otherIdx] = { x: offsetX, y: other.y };
        path.splice(otherIdx, 0, stub);
      } else {
        path[otherIdx] = { x: offsetX, y: other.y };
        path.splice(idx, 0, stub);
      }
    } else {
      // Pin on top/bottom edge → approach must be vertical (different y, same x)
      if (Math.abs(other.x - pinPoint.x) <= eps && Math.abs(other.y - pinPoint.y) > eps) { return; } // already perpendicular
      const offsetY = side === 'top' ? pinPoint.y - approachGap : pinPoint.y + approachGap;
      const stub: Point2D = { x: pinPoint.x, y: offsetY };
      if (isStart) {
        path[otherIdx] = { x: other.x, y: offsetY };
        path.splice(otherIdx, 0, stub);
      } else {
        path[otherIdx] = { x: other.x, y: offsetY };
        path.splice(idx, 0, stub);
      }
    }
  }

  /**
   * Finds a detour path for a horizontal segment that intersects an obstacle.
   * Returns null if no detour is needed, or [start, detour1, detour2, end] path.
   */
  private findHorizontalDetour(x1: number, x2: number, y: number, from: Point2D, to: Point2D, excludeIds: Set<string>, pinObstacles: Point2D[], pinThreshold: number, margin: number, isSeg1: boolean): Point2D[] | null {
    const doc = this.getDocument();
    const g = this.viewport.gridSize;
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);

    // Find the largest obstacle extent on this segment
    let obsTop = -Infinity;
    let obsBottom = Infinity;
    let hasObstacle = false;

    // Check body obstacles
    for (const comp of doc.components) {
      if (excludeIds.has(comp.id)) { continue; }
      const b = this.getComponentWorldBounds(comp);
      if (b === null) { continue; }
      if (y >= b.y - pinThreshold && y <= b.y + b.height + pinThreshold &&
        maxX > b.x && minX < b.x + b.width) {
        obsTop = Math.max(obsTop, b.y);
        obsBottom = Math.min(obsBottom, b.y + b.height);
        hasObstacle = true;
      }
    }

    // Check pin obstacles
    for (const pw of pinObstacles) {
      if (Math.abs(pw.y - y) <= pinThreshold && pw.x >= minX - pinThreshold && pw.x <= maxX + pinThreshold) {
        obsTop = Math.max(obsTop, pw.y - pinThreshold);
        obsBottom = Math.min(obsBottom, pw.y + pinThreshold);
        hasObstacle = true;
      }
    }

    if (!hasObstacle) { return null; }

    // Choose above or below based on which side has more clearance
    const goAbove = y - obsTop <= obsBottom - y;
    const detourY = goAbove ? obsTop - margin : obsBottom + margin;

    const segMinX = Math.min(x1, x2);
    const segMaxX = Math.max(x1, x2);
    let entryX = x1;
    let exitX: number;
    if (isSeg1) {
      // seg1: entry near x1 (from), exit can offset from x2 (mid) for clearance
      if (x1 < x2) { entryX = Math.min(x1 + g, x2); }
      else if (x1 > x2) { entryX = Math.max(x1 - g, x2); }
      exitX = x2; // seg1 exit is mid — offset is harmless since mid is not a pin
    } else {
      // seg2: exit MUST land exactly at x2 (to = the target pin)
      entryX = x1;
      exitX = x2;
    }

    const entry: Point2D = { x: entryX, y: y };
    const turn1: Point2D = { x: entryX, y: detourY };
    const turn2: Point2D = { x: exitX, y: detourY };
    const exit: Point2D = { x: exitX, y: y };

    return [entry, turn1, turn2, exit];
  }

  /**
   * Finds a detour path for a vertical segment that intersects an obstacle.
   */
  private findVerticalDetour(x: number, y1: number, y2: number, from: Point2D, to: Point2D, excludeIds: Set<string>, pinObstacles: Point2D[], pinThreshold: number, margin: number, isSeg1: boolean): Point2D[] | null {
    const doc = this.getDocument();
    const g = this.viewport.gridSize;
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    let obsLeft = -Infinity;
    let obsRight = Infinity;
    let hasObstacle = false;

    for (const comp of doc.components) {
      if (excludeIds.has(comp.id)) { continue; }
      const b = this.getComponentWorldBounds(comp);
      if (b === null) { continue; }
      if (x >= b.x - pinThreshold && x <= b.x + b.width + pinThreshold &&
        maxY > b.y && minY < b.y + b.height) {
        obsLeft = Math.max(obsLeft, b.x);
        obsRight = Math.min(obsRight, b.x + b.width);
        hasObstacle = true;
      }
    }

    for (const pw of pinObstacles) {
      if (Math.abs(pw.x - x) <= pinThreshold && pw.y >= minY - pinThreshold && pw.y <= maxY + pinThreshold) {
        obsLeft = Math.max(obsLeft, pw.x - pinThreshold);
        obsRight = Math.min(obsRight, pw.x + pinThreshold);
        hasObstacle = true;
      }
    }

    if (!hasObstacle) { return null; }

    const goLeft = x - obsLeft <= obsRight - x;
    const detourX = goLeft ? obsLeft - margin : obsRight + margin;

    let entryY = y1;
    let exitY: number;
    if (isSeg1) {
      if (y1 < y2) { entryY = Math.min(y1 + g, y2); }
      else if (y1 > y2) { entryY = Math.max(y1 - g, y2); }
      exitY = y2;
    } else {
      entryY = y1;
      exitY = y2; // seg2 exit must land exactly on the target pin
    }

    const entry: Point2D = { x: x, y: entryY };
    const turn1: Point2D = { x: detourX, y: entryY };
    const turn2: Point2D = { x: detourX, y: exitY };
    const exit: Point2D = { x: x, y: exitY };

    return [entry, turn1, turn2, exit];
  }

  /**
   * Checks whether any segment of a candidate path collinearly overlaps with
   * an existing wire segment. Used to avoid merging wires that share the same
   * route into an indistinguishable single line.
   */
  private doesPathOverlapExisting(points: Point2D[], excludeWireId?: string): boolean {
    const doc = this.getDocument();
    for (const wire of doc.wires) {
      if (excludeWireId !== undefined && wire.id === excludeWireId) { continue; }
      for (let wi = 1; wi < wire.points.length; wi++) {
        const w0 = wire.points[wi - 1];
        const w1 = wire.points[wi];
        for (let si = 1; si < points.length; si++) {
          const s0 = points[si - 1];
          const s1 = points[si];
          if (this.segmentsCollinearOverlap(s0, s1, w0, w1)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private segmentsCollinearOverlap(a0: Point2D, a1: Point2D, b0: Point2D, b1: Point2D): boolean {
    // Horizontal collinear overlap
    if (a0.y === a1.y && b0.y === b1.y && a0.y === b0.y) {
      const aMin = Math.min(a0.x, a1.x); const aMax = Math.max(a0.x, a1.x);
      const bMin = Math.min(b0.x, b1.x); const bMax = Math.max(b0.x, b1.x);
      return aMax > bMin && aMin < bMax;
    }
    // Vertical collinear overlap
    if (a0.x === a1.x && b0.x === b1.x && a0.x === b0.x) {
      const aMin = Math.min(a0.y, a1.y); const aMax = Math.max(a0.y, a1.y);
      const bMin = Math.min(b0.y, b1.y); const bMax = Math.max(b0.y, b1.y);
      return aMax > bMin && aMin < bMax;
    }
    return false;
  }

  private snapToNearestPin(point: Point2D, gridSize: number): Point2D {
    const doc = this.getDocument();
    const threshold = gridSize * 1.5;
    let bestDist = threshold;
    let bestPoint: Point2D | null = null;
    for (let ci = 0; ci < doc.components.length; ci++) {
      const comp = doc.components[ci];
      const pins = this.resolvePins(comp.libraryId);
      if (pins === null || pins.length === 0) {
        continue;
      }
      for (let pi = 0; pi < pins.length; pi++) {
        const pin = pins[pi];
        const local = this.transformPinOffsetForConnect(pin.position, comp.rotation, comp.mirrored);
        const pinWorld: Point2D = { x: comp.position.x + local.x, y: comp.position.y + local.y };
        const dx = point.x - pinWorld.x;
        const dy = point.y - pinWorld.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= bestDist) {
          bestDist = dist;
          bestPoint = { x: pinWorld.x, y: pinWorld.y };
        }
      }
    }
    if (bestPoint !== null) {
      Logger.debug('schematic_editor', `snapToNearestPin: snapping (${point.x},${point.y}) -> (${bestPoint.x},${bestPoint.y}) dist=${bestDist.toFixed(1)}`);
      return bestPoint;
    }
    return point;
  }

  private ensureNetExists(netId: string): void {
    const doc = this.getDocument();
    const existing = doc.nets.find(n => n.id === netId);
    if (existing !== undefined) {
      return;
    }
    doc.nets.push({
      id: netId,
      name: `NET_${netId.substring(0, 6)}`,
      type: NetType.SIGNAL,
      pinIds: []
    });
    Logger.info('schematic_editor', `ensureNetExists: created net ${netId}`);
  }

  /** Find the net that a world position already belongs to, if any.
   *  Checks both pin-to-net membership and wire-to-net proximity. */
  private inheritNetAtPosition(pos: Point2D): string | null {
    const doc = this.getDocument();
    const junctionRadius = Math.min(Math.max(2, this.viewport.gridSize * 0.5), 5);
    // 1) Check if any component pin at this position is already on a net
    for (const net of doc.nets) {
      if (net.pinIds.length === 0) {
        continue;
      }
      for (const pinRef of net.pinIds) {
        const parts = pinRef.split(':');
        if (parts.length < 2) {
          continue;
        }
        const comp = this.findComponent(parts[0]);
        if (comp === undefined) {
          continue;
        }
        const pins = this.resolvePins(comp.libraryId);
        if (pins === null) {
          continue;
        }
        for (const pin of pins) {
          if (pin.id !== parts[1]) {
            continue;
          }
          const local = this.transformPinOffsetForConnect(pin.position, comp.rotation, comp.mirrored);
          const wx = comp.position.x + local.x;
          const wy = comp.position.y + local.y;
          if (Math.abs(pos.x - wx) <= junctionRadius && Math.abs(pos.y - wy) <= junctionRadius) {
            return net.id;
          }
        }
      }
    }
    // 2) Check if the position lies on an existing wire segment
    for (const wire of doc.wires) {
      if (wire.points.length < 2) {
        continue;
      }
      for (let i = 1; i < wire.points.length; i++) {
        const a = wire.points[i - 1];
        const b = wire.points[i];
        if (this.pointOnSegment(pos, a, b, junctionRadius)) {
          return wire.netId;
        }
      }
    }
    return null;
  }

  /** True if point p lies within tolerance of segment a–b. */
  private pointOnSegment(p: Point2D, a: Point2D, b: Point2D, tol: number): boolean {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 0.01) {
      return Math.abs(p.x - a.x) <= tol && Math.abs(p.y - a.y) <= tol;
    }
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    return Math.abs(p.x - projX) <= tol && Math.abs(p.y - projY) <= tol;
  }

  private connectWireToPins(from: Point2D, to: Point2D, netId: string,
    threshold: number = this.viewport.gridSize * 1.5): void {
    const doc = this.getDocument();
    const endpoints = [from, to];
    const junctionRadius = 2; // Two pins within this distance are considered co-located (junction)
    let connectedCount = 0;

    // Collect all (component, pin, worldPos) tuples for efficient lookup
    interface PinCandidate {
      comp: ComponentInstance;
      pin: Pin;
      world: Point2D;
    }
    const allCandidates: PinCandidate[] = [];
    for (let ci = 0; ci < doc.components.length; ci++) {
      const comp = doc.components[ci];
      const pins = this.resolvePins(comp.libraryId);
      if (pins === null || pins.length === 0) {
        continue;
      }
      for (let pi = 0; pi < pins.length; pi++) {
        const pin = pins[pi];
        const local = this.transformPinOffsetForConnect(pin.position, comp.rotation, comp.mirrored);
        allCandidates.push({
          comp: comp,
          pin: pin,
          world: { x: comp.position.x + local.x, y: comp.position.y + local.y }
        });
      }
    }

    for (let ei = 0; ei < endpoints.length; ei++) {
      const ep = endpoints[ei];
      // Find the single closest pin to this endpoint
      let bestDist = threshold;
      let bestCandidate: PinCandidate | null = null;
      for (let ci = 0; ci < allCandidates.length; ci++) {
        const c = allCandidates[ci];
        const dx = ep.x - c.world.x;
        const dy = ep.y - c.world.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestDist) {
          bestDist = dist;
          bestCandidate = c;
        }
      }

      if (bestCandidate !== null) {
        // Add the closest pin
        this.addPinToNet(netId, bestCandidate.comp.id, bestCandidate.pin.id, bestCandidate.pin.name);
        connectedCount++;
        Logger.debug('schematic_editor',
          `connectWireToPins: pin ${bestCandidate.pin.name}(${bestCandidate.pin.id}) of ${bestCandidate.comp.refDes} connected dist=${bestDist.toFixed(1)}`);

        // Also add any other pins co-located with the closest pin (junction)
        for (let ci = 0; ci < allCandidates.length; ci++) {
          const c = allCandidates[ci];
          if (c.comp.id === bestCandidate.comp.id && c.pin.id === bestCandidate.pin.id) {
            continue;
          }
          const dx = bestCandidate.world.x - c.world.x;
          const dy = bestCandidate.world.y - c.world.y;
          if (Math.abs(dx) <= junctionRadius && Math.abs(dy) <= junctionRadius) {
            this.addPinToNet(netId, c.comp.id, c.pin.id, c.pin.name);
            connectedCount++;
          }
        }
      }
    }
    Logger.debug('schematic_editor', `connectWireToPins: ${connectedCount} pins connected to net ${netId}`);
  }

  /** 若导线网络连接到 VCC/GND 引脚，则合并到全局电源网络 */
  private normalizePowerNet(wireNetId: string): void {
    const doc = this.getDocument();
    const wireNet = this.findNetById(doc, wireNetId);
    if (wireNet === undefined) {
      return;
    }
    let targetName: string | null = null;
    for (let i = 0; i < wireNet.pinIds.length; i++) {
      const pinRef = wireNet.pinIds[i];
      const parts = pinRef.split(':');
      if (parts.length < 2) {
        continue;
      }
      const comp = this.findComponent(parts[0]);
      if (comp === undefined) {
        continue;
      }
      const pins = this.resolvePins(comp.libraryId);
      if (pins === null) {
        continue;
      }
      let pinDef: Pin | undefined = undefined;
      for (let pi = 0; pi < pins.length; pi++) {
        if (pins[pi].id === parts[1]) {
          pinDef = pins[pi];
          break;
        }
      }
      if (pinDef === undefined) {
        continue;
      }
      const resolved = this.resolvePowerNetName(comp, pinDef);
      if (resolved !== null) {
        targetName = resolved;
        break;
      }
    }
    if (targetName === null) {
      return;
    }
    let powerNet = this.findNetByName(doc, targetName);
    if (powerNet === undefined) {
      this.createNetLabel(0, 0, targetName);
      powerNet = this.findNetByName(doc, targetName);
    }
    if (powerNet === undefined || powerNet.id === wireNetId) {
      return;
    }
    this.mergeNets(wireNetId, powerNet.id);
  }

  private resolvePowerNetName(comp: ComponentInstance, pin: Pin): string | null {
    const lib = comp.libraryId.toUpperCase();
    if (lib === 'VCC' || lib.endsWith('/VCC')) {
      return 'VCC';
    }
    if (lib === 'GND' || lib.endsWith('/GND')) {
      return 'GND';
    }
    // Instrument COM/I- follow wire geometry only — not auto-assigned to GND.
    return null;
  }

  private mergeNets(fromNetId: string, toNetId: string): void {
    if (fromNetId === toNetId) {
      return;
    }
    const doc = this.getDocument();
    const fromNet = this.findNetById(doc, fromNetId);
    const toNet = this.findNetById(doc, toNetId);
    if (fromNet === undefined || toNet === undefined) {
      return;
    }
    for (let i = 0; i < fromNet.pinIds.length; i++) {
      const pinRef = fromNet.pinIds[i];
      if (!toNet.pinIds.includes(pinRef)) {
        toNet.pinIds.push(pinRef);
      }
    }
    // 合并后保留电源/地网络类型
    if (fromNet.type === NetType.GROUND || toNet.type === NetType.GROUND) {
      toNet.type = NetType.GROUND;
    } else if (fromNet.type === NetType.POWER || toNet.type === NetType.POWER) {
      toNet.type = NetType.POWER;
    }
    if (toNet.name.toUpperCase() === 'GND' || toNet.name.toUpperCase() === 'VSS') {
      toNet.type = NetType.GROUND;
    } else if (toNet.name.toUpperCase() === 'VCC' || toNet.name.toUpperCase() === 'VDD') {
      toNet.type = NetType.POWER;
    }
    for (let wi = 0; wi < doc.wires.length; wi++) {
      if (doc.wires[wi].netId === fromNetId) {
        doc.wires[wi].netId = toNetId;
      }
    }
    for (let li = 0; li < doc.netLabels.length; li++) {
      if (doc.netLabels[li].netId === fromNetId) {
        doc.netLabels[li].netId = toNetId;
      }
    }
    doc.nets = doc.nets.filter(n => n.id !== fromNetId);
    Logger.info('schematic_editor', `mergeNets: ${fromNet.name}(${fromNetId}) -> ${toNet.name}(${toNetId})`);
  }

  private transformPinOffsetForConnect(local: Point2D, rotation: Rotation, mirrored: boolean): Point2D {
    let x = local.x;
    let y = local.y;
    if (mirrored) {
      x = -x;
    }
    switch (rotation) {
      case 90: return { x: -y, y: x };
      case 180: return { x: -x, y: -y };
      case 270: return { x: y, y: -x };
      default: return { x: x, y: y };
    }
  }

  private addPinToNet(netId: string, compId: string, pinId: string, pinName: string): void {
    const doc = this.getDocument();
    const net = doc.nets.find(n => n.id === netId);
    if (net === undefined) {
      return;
    }
    const pinRef = `${compId}:${pinId}:${pinName}`;
    if (net.pinIds.includes(pinRef)) {
      return;
    }
    // Remove this pin from any other nets — a pin must belong to exactly one net
    for (const other of doc.nets) {
      if (other.id !== netId) {
        const idx = other.pinIds.indexOf(pinRef);
        if (idx >= 0) {
          other.pinIds.splice(idx, 1);
        }
      }
    }
    net.pinIds.push(pinRef);
  }

  private resolvePins(libraryId: string): Pin[] | null {
    if (this.pinResolver !== null) {
      return this.pinResolver(libraryId);
    }
    return null;
  }

  setComponentLocked(componentId: string, locked: boolean): ApiResult<void> {
    const comp = this.findComponent(componentId);
    if (comp === undefined) return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
    if (locked) this.lockedComponentIds.add(componentId);
    else this.lockedComponentIds.delete(componentId);
    return ResultHelper.ok();
  }

  isComponentLocked(componentId: string): boolean {
    return this.lockedComponentIds.has(componentId);
  }

  duplicateDevice(instUuid: string, offsetX: number = 20, offsetY: number = 20): ApiResult<string> {
    const comp = this.findComponent(instUuid);
    if (comp === undefined) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '器件不存在');
    }
    const guard: ApiResult<void> | null = this.guardEdit();
    if (guard !== null) {
      return ResultHelper.fail(guard.errCode !== undefined ? guard.errCode : ErrCode.ERR_SIM_BUSY, guard.error);
    }
    const prefix: string = this.getRefDesPrefix(comp.libraryId);
    const count: number = (this.refDesCounters.get(prefix) ?? 0) + 1;
    this.refDesCounters.set(prefix, count);
    const pos: Point2D = EditorInternals.calcSnapPoint(
      comp.position.x + offsetX,
      comp.position.y + offsetY,
      this.viewport.gridSize
    );
    const newComp: ComponentInstance = {
      id: IdUtil.generate('comp'),
      libraryId: comp.libraryId,
      refDes: `${prefix}${count}`,
      position: pos,
      rotation: comp.rotation,
      mirrored: comp.mirrored,
      parameters: SchematicEditorImpl.copyParameters(comp.parameters)
    };
    if (this.document !== null) {
      this.commandHistory.push(new PlaceCommand(this.document, newComp));
    } else {
      this.getDocument().components.push(newComp);
    }
    this.notifyChange();
    return ResultHelper.ok(newComp.id);
  }

  moveComponents(ids: string[], delta: Point2D): ApiResult<void> {
    const guard: ApiResult<void> | null = this.guardEdit();
    if (guard !== null) {
      return ResultHelper.fail(guard.errCode !== undefined ? guard.errCode : ErrCode.ERR_SIM_BUSY, guard.error);
    }
    const comps: ComponentInstance[] = this.collectComponents(ids);
    if (comps.length === 0 || this.document === null) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '未找到可移动器件');
    }
    // Capture old pin positions and actual deltas for all moved components
    const oldPinMaps = new Map<string, Map<string, Point2D>>();
    const deltas = new Map<string, Point2D>();
    for (let i = 0; i < comps.length; i++) {
      const comp = comps[i];
      oldPinMaps.set(comp.id, this.getComponentPinWorldPositions(comp));
      const oldPos: Point2D = { x: comp.position.x, y: comp.position.y };
      const newPos: Point2D = EditorInternals.calcSnapPoint(
        comp.position.x + delta.x,
        comp.position.y + delta.y,
        this.viewport.gridSize
      );
      deltas.set(comp.id, { x: newPos.x - oldPos.x, y: newPos.y - oldPos.y });
      this.commandHistory.push(new MoveCommand(this.document, comp.id, oldPos, newPos));
    }
    // Update wire endpoints and labels for all moved components
    const movedLabels = new Set<string>();
    oldPinMaps.forEach((oldPins: Map<string, Point2D>, compId: string) => {
      const stubEnds = this.updateWiresForComponentMove(compId, oldPins);
      const d = deltas.get(compId);
      if (d !== undefined) {
        this.updateLabelsForComponentMove(oldPins, d, stubEnds, movedLabels);
      }
    });
    this.rebuildNetPinConnectivity();
    this.notifyChange();
    return ResultHelper.ok();
  }

  panTo(point: Point2D): void {
    this.viewport.panOffset = SchematicEditorImpl.copyPoint2D(point);
    this.publishViewport();
  }

  setGridSize(size: number): void {
    this.viewport.gridSize = size;
  }

  setGridVisible(v: boolean): void {
    this.viewport.gridVisible = v;
  }

  setSnapToGrid(v: boolean): void {
    this.viewport.snapToGrid = v;
  }

  private static arrayMin(values: number[]): number {
    let min: number = values[0];
    for (let i = 1; i < values.length; i++) {
      if (values[i] < min) {
        min = values[i];
      }
    }
    return min;
  }

  private static arrayMax(values: number[]): number {
    let max: number = values[0];
    for (let i = 1; i < values.length; i++) {
      if (values[i] > max) {
        max = values[i];
      }
    }
    return max;
  }

  private static arrayAverage(values: number[]): number {
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
    }
    return sum / values.length;
  }

  private collectComponents(instUuids: string[]): ComponentInstance[] {
    const comps: ComponentInstance[] = [];
    for (let i = 0; i < instUuids.length; i++) {
      const comp: ComponentInstance | undefined = this.findComponent(instUuids[i]);
      if (comp !== undefined) {
        comps.push(comp);
      }
    }
    return comps;
  }

  private cloneViewportState(): ViewportState {
    const pan: Point2D = SchematicEditorImpl.copyPoint2D(this.viewport.panOffset);
    const vp: ViewportState = {
      zoom: this.viewport.zoom,
      panOffset: pan,
      gridVisible: this.viewport.gridVisible,
      gridSize: this.viewport.gridSize,
      snapToGrid: this.viewport.snapToGrid
    };
    return vp;
  }

  private createNewDoc(name: string): SchematicDocument {
    const now: string = new Date().toISOString();
    const metadata: SchematicMetadata = {
      author: '',
      createdAt: now,
      modifiedAt: now,
      description: '',
      gridSize: this.viewport.gridSize,
      units: 'mm',
      undoLimit: this.undoLimit
    };
    this.document = {
      id: IdUtil.generate('sch'),
      name: name,
      version: '2.0',
      components: [],
      wires: [],
      nets: [],
      netLabels: [],
      subcircuits: [],
      metadata: metadata
    };
    this.syncTopologyFromDoc();
    return this.document;
  }

  private syncTopologyFromDoc(): void {
    if (this.document !== null) {
      this.topology = TopologyPatchApplier.syncTopologyIncremental(this.document, this.topology);
      this.topology.probeList = SchematicEditorImpl.copyProbeList(this.probes);
      this.topology.busList = SchematicEditorImpl.copyBusList(this.buses);
    }
  }

  private normalizeDocument(doc: SchematicDocument): SchematicDocument {
    if (doc.netLabels === undefined) {
      doc.netLabels = [];
    }
    if (doc.subcircuits === undefined) {
      doc.subcircuits = [];
    }
    if (doc.annotations === undefined) {
      doc.annotations = [];
    }
    if (doc.probes === undefined) {
      doc.probes = [];
    }
    for (let i = 0; i < doc.wires.length; i++) {
      if (doc.wires[i].style === undefined) {
        doc.wires[i].style = WireStyle.ORTHOGONAL;
      }
    }
    for (let i = 0; i < doc.components.length; i++) {
      this.normalizeComponentValue(doc.components[i]);
    }
    return doc;
  }

  /** Ensure the "value" param has the same unit suffix as the library ID.
   *  e.g. R_4.7K with value="4.7" → value="4.7K" */
  private normalizeComponentValueStr(libraryId: string, value: string): string {
    if (value.length === 0) return value;
    if (/[a-zµ]/i.test(value)) return value; // already has unit

    const libId = libraryId.toUpperCase();
    let fallback = '';
    if (libId.startsWith('R_') || libId.includes('RESISTOR')) {
      fallback = libId.replace(/^(R_|RESISTOR_?)/i, '');
    } else if (libId.startsWith('C_') || libId.includes('CAP')) {
      fallback = libId.replace(/^(C_|CAP_?)/i, '');
    } else if (libId.startsWith('L_') || libId.includes('INDUCTOR')) {
      fallback = libId.replace(/^L_/i, '');
    } else {
      return value;
    }

    const m = fallback.match(/[a-zµ]+$/i);
    if (m === null) return value;
    return value + m[0];
  }

  private normalizeComponentValue(comp: ComponentInstance): void {
    const val = comp.parameters.get('value');
    if (val === undefined) return;
    const normalized = this.normalizeComponentValueStr(comp.libraryId, val);
    if (normalized !== val) {
      comp.parameters.set('value', normalized);
    }
  }

  private rebuildRefDesCounters(): void {
    this.refDesCounters.clear();
    const components: ComponentInstance[] = this.getDocument().components;
    for (let i = 0; i < components.length; i++) {
      const c: ComponentInstance = components[i];
      const match: RegExpMatchArray | null = c.refDes.match(/^([A-Z?]+)(\d+)$/);
      if (match !== null) {
        const prefix: string = match[1].replace('?', 'U');
        const num: number = parseInt(match[2]);
        const cur: number = this.refDesCounters.get(prefix) ?? 0;
        if (num > cur) {
          this.refDesCounters.set(prefix, num);
        }
      }
    }
  }

  private getRefDesPrefix(libraryId: string): string {
    if (libraryId.startsWith('R_')) {
      return 'R';
    }
    if (libraryId.startsWith('C_')) {
      return 'C';
    }
    if (libraryId.startsWith('L_')) {
      return 'L';
    }
    if (libraryId.includes('LED')) {
      return 'D';
    }
    if (libraryId.includes('74HC') || libraryId.includes('CD')) {
      return 'U';
    }
    if (libraryId.includes('STM32') || libraryId.includes('AT89') || libraryId.includes('STC')) {
      return 'U';
    }
    if (libraryId.includes('OSCILLOSCOPE') || libraryId.includes('VIRTUAL')) {
      return 'X';
    }
    return 'U';
  }

  private findComponent(id: string): ComponentInstance | undefined {
    const comps: ComponentInstance[] = this.getDocument().components;
    for (let i = 0; i < comps.length; i++) {
      if (comps[i].id === id) {
        return comps[i];
      }
    }
    return undefined;
  }

  private findBus(busUuid: string): BusInfo | undefined {
    for (let i = 0; i < this.buses.length; i++) {
      if (this.buses[i].busUuid === busUuid) {
        return this.buses[i];
      }
    }
    return undefined;
  }

  private findProbe(probeId: string): ProbeInfo | undefined {
    for (let i = 0; i < this.probes.length; i++) {
      if (this.probes[i].probeId === probeId) {
        return this.probes[i];
      }
    }
    return undefined;
  }

  private findAnnotation(id: string): SchematicAnnotation | undefined {
    for (let i = 0; i < this.annotations.length; i++) {
      if (this.annotations[i].id === id) {
        return this.annotations[i];
      }
    }
    return undefined;
  }

  private findAnnotationIndex(id: string): number {
    for (let i = 0; i < this.annotations.length; i++) {
      if (this.annotations[i].id === id) {
        return i;
      }
    }
    return -1;
  }

  private findNetByName(doc: SchematicDocument, name: string): Net | undefined {
    for (let i = 0; i < doc.nets.length; i++) {
      if (doc.nets[i].name === name) {
        return doc.nets[i];
      }
    }
    return undefined;
  }

  private findNetById(doc: SchematicDocument, id: string): Net | undefined {
    for (let i = 0; i < doc.nets.length; i++) {
      if (doc.nets[i].id === id) {
        return doc.nets[i];
      }
    }
    return undefined;
  }

  private findNetLabelByNetId(netId: string): NetLabel | undefined {
    const labels: NetLabel[] = this.getDocument().netLabels;
    for (let i = 0; i < labels.length; i++) {
      if (labels[i].netId === netId) {
        return labels[i];
      }
    }
    return undefined;
  }

  private findSubcircuit(subUuid: string): SubcircuitRef | undefined {
    const subs: SubcircuitRef[] = this.getDocument().subcircuits;
    for (let i = 0; i < subs.length; i++) {
      if (subs[i].id === subUuid) {
        return subs[i];
      }
    }
    return undefined;
  }

  /** 6.1.4 结构化深拷贝 — 避免 JSON 往返的浮点精度损失和性能问题 */
  private cloneDoc(doc: SchematicDocument): SchematicDocument {
    const clonedComponents: ComponentInstance[] = [];
    for (let ci = 0; ci < doc.components.length; ci++) {
      const c = doc.components[ci];
      const compClone: ComponentInstance = {
        id: c.id,
        libraryId: c.libraryId,
        refDes: c.refDes,
        name: c.name,
        position: { x: c.position.x, y: c.position.y },
        rotation: c.rotation,
        mirrored: c.mirrored,
        x: c.x,
        y: c.y,
        parameters: new Map(c.parameters),
        pinIds: c.pinIds?.slice() ?? [],
        attributes: c.attributes ? new Map(c.attributes) : undefined,
        pinOverrides: c.pinOverrides ? new Map(c.pinOverrides) : undefined,
        subcircuitId: c.subcircuitId
      };
      clonedComponents.push(compClone);
    }

    const clonedNets: Net[] = [];
    for (let ni = 0; ni < doc.nets.length; ni++) {
      const n = doc.nets[ni];
      const netClone: Net = {
        id: n.id,
        name: n.name,
        type: n.type,
        pinIds: n.pinIds.slice(),
        busWidth: n.busWidth,
        branchIndex: n.branchIndex
      };
      clonedNets.push(netClone);
    }

    const clonedWires: Wire[] = [];
    for (let wi = 0; wi < doc.wires.length; wi++) {
      const w = doc.wires[wi];
      const pts: Point2D[] = [];
      for (let pi = 0; pi < w.points.length; pi++) {
        pts.push({ x: w.points[pi].x, y: w.points[pi].y });
      }
      const wireClone: Wire = {
        id: w.id,
        netId: w.netId,
        points: pts,
        style: w.style
      };
      clonedWires.push(wireClone);
    }

    const clonedLabels: NetLabel[] = [];
    for (let li = 0; li < doc.netLabels.length; li++) {
      const l = doc.netLabels[li];
      clonedLabels.push({
        id: l.id,
        netId: l.netId,
        text: l.text,
        position: { x: l.position.x, y: l.position.y },
        global: l.global
      });
    }

    const clonedSubs: SubcircuitRef[] = [];
    for (let si = 0; si < doc.subcircuits.length; si++) {
      clonedSubs.push(doc.subcircuits[si]);
    }

    const clonedAnnotations: SchematicAnnotation[] = [];
    const srcAnnotations = doc.annotations ?? [];
    for (let ai = 0; ai < srcAnnotations.length; ai++) {
      const a = srcAnnotations[ai];
      const annClone: SchematicAnnotation = {
        id: a.id,
        author: a.author,
        text: a.text,
        type: a.type,
        status: a.status,
        x: a.x,
        y: a.y,
        width: a.width,
        height: a.height,
        arrowEndX: a.arrowEndX,
        arrowEndY: a.arrowEndY,
        targetUuid: a.targetUuid,
        targetKind: a.targetKind,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt
      };
      clonedAnnotations.push(annClone);
    }

    const clonedProbes: ProbeMeta[] = [];
    const srcProbes = doc.probes ?? [];
    for (let pi = 0; pi < srcProbes.length; pi++) {
      const p = srcProbes[pi];
      clonedProbes.push({
        id: p.id,
        netId: p.netId,
        label: p.label,
        color: p.color
      });
    }

    let clonedSimConfig: SimulationConfig | undefined = undefined;
    if (doc.simulationConfig) {
      clonedSimConfig = {
        mode: doc.simulationConfig.mode,
        startTime: doc.simulationConfig.startTime,
        stopTime: doc.simulationConfig.stopTime,
        stepSize: doc.simulationConfig.stepSize,
        maxStep: doc.simulationConfig.maxStep,
        temperature: doc.simulationConfig.temperature,
        convergence: doc.simulationConfig.convergence,
        mcuClockHz: doc.simulationConfig.mcuClockHz
      };
    }

    const cloned: SchematicDocument = {
      id: doc.id,
      name: doc.name,
      version: doc.version,
      metadata: {
        author: doc.metadata.author,
        createdAt: doc.metadata.createdAt,
        modifiedAt: doc.metadata.modifiedAt,
        description: doc.metadata.description,
        gridSize: doc.metadata.gridSize,
        units: doc.metadata.units,
        undoLimit: doc.metadata.undoLimit
      },
      components: clonedComponents,
      nets: clonedNets,
      wires: clonedWires,
      netLabels: clonedLabels,
      subcircuits: clonedSubs,
      annotations: clonedAnnotations,
      probes: clonedProbes,
      simulationConfig: clonedSimConfig
    };
    return cloned;
  }

  private notifyChange(): void {
    this.syncTopologyFromDoc();
    if (this.document !== null) {
      this.document.metadata.modifiedAt = new Date().toISOString();
    }
    Logger.info('schematic_editor', `拓扑变更: ${this.document?.components.length ?? 0} 器件`);
    EventBus.getInstance().publish({
      event: ModuleEvent.SCHEMATIC_CHANGED,
      source: 'schematic_editor',
      timestamp: Date.now(),
      data: this.getFullTopology()
    });
  }

  private publishViewport(): void {
    EventBus.getInstance().publish({
      event: ModuleEvent.VIEWPORT_CHANGED,
      source: 'schematic_editor',
      timestamp: Date.now(),
      data: this.viewport
    });
  }

  private publishAnnotationChange(): void {
    EventBus.getInstance().publish({
      event: ModuleEvent.ANNOTATION_CHANGED,
      source: 'schematic_editor',
      timestamp: Date.now(),
      data: this.annotations
    });
  }
}
