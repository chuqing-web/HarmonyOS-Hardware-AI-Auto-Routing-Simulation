/**
 * JSON-RPC 原子命令分发 — 仅编辑器手操，不调用 AI / 自动布线
 * ArkTS: 所有对象字面量必须对应已声明 interface
 */
import { Logger, Point2D, PcbLayerId, IdUtil, padWorldPosition } from 'common';
import { ISchematicEditor } from 'schematic_editor';
import { IComponentLibrary, ComponentDefinition } from 'component_library';
import { IPcbEditor } from 'pcb_editor';
import { IAgentDrawingHost, AgentDrawingSessionResult } from './api/IAgentDrawingHost';

const TAG = 'AgentBridge';

export interface JsonRpcRequest {
  jsonrpc: string;
  id: number | string | null;
  method: string;
  params?: Record<string, Object>;
}

export interface JsonRpcErrorBody {
  code: number;
  message: string;
}

export interface JsonRpcSuccess {
  jsonrpc: string;
  id: number | string | null;
  result: Object;
}

export interface JsonRpcFailure {
  jsonrpc: string;
  id: number | string | null;
  error: JsonRpcErrorBody;
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

interface PingResult {
  pong: boolean;
  ts: number;
}

interface MethodsResult {
  methods: string[];
}

interface StatusResult {
  schematicReady: boolean;
  pcbReady: boolean;
  libraryReady: boolean;
  schematicDeviceCount: number;
  schematicNetCount: number;
  pcbFootprintCount: number;
  pcbTrackCount: number;
  pcbCopperLayerCount: number;
  bridgeId: string;
  agentDrawing: boolean;
}

interface SessionResultRow {
  ok: boolean;
  error: string;
  active: boolean;
  fitted: boolean;
}

interface CompSummary {
  id: string;
  name: string;
  category: string;
  manufacturer: string;
  description: string;
  pinCount: number;
}

interface SearchResult {
  items: CompSummary[];
  total: number;
  page: number;
  pageSize: number;
}

interface ResolveResult {
  resolved: string;
  input: string;
}

interface DeviceRow {
  uuid: string;
  libId: string;
  ref: string;
  x: number;
  y: number;
  rotate: number;
}

interface NetRow {
  id: string;
  name: string;
}

interface TopologySummary {
  deviceCount: number;
  netCount: number;
  wireCount: number;
  devices: DeviceRow[];
  nets: NetRow[];
}

interface PlaceDeviceResult {
  uuid: string;
  libId: string;
  ref: string;
  x: number;
  y: number;
}

interface UuidResult {
  uuid: string;
}

interface MoveResult {
  uuid: string;
  x: number;
  y: number;
}

interface RotateResult {
  uuid: string;
  angle: number;
}

interface ParamResult {
  uuid: string;
  key: string;
  value: string;
}

interface WireIdResult {
  wireId: string;
}

interface LabelResult {
  labelId: string;
  netName: string;
}

interface RenameLabelResult {
  netId: string;
  netName: string;
}

interface IdsResult {
  ids: string[];
}

interface FlagResult {
  cleared?: boolean;
  undone?: boolean;
  redone?: boolean;
  cancelled?: boolean;
  deleted?: boolean;
  rotated?: boolean;
  annotated?: boolean;
}

interface FootprintRow {
  id: string;
  defId: string;
  ref: string;
  x: number;
  y: number;
  rotation: number;
}

interface PadRow {
  fpId: string;
  ref: string;
  pad: string;
  x: number;
  y: number;
  netId: string;
  netName: string;
}

interface PcbEmptySummary {
  empty: boolean;
}

interface PcbSummary {
  footprintCount: number;
  trackCount: number;
  viaCount: number;
  copperLayerCount: number;
  activeLayer: string;
  footprints: FootprintRow[];
  pads: PadRow[];
}

interface MoveFpResult {
  id: string;
  ref: string;
  x: number;
  y: number;
  rotation: number;
}

interface ClearCopperResult {
  removed: number;
  tracksCleared: boolean;
  viasCleared: boolean;
}

interface RouteRejectResult {
  ok: boolean;
  reason: string;
}

interface CopperCountResult {
  copperLayerCount: number;
}

interface LayerResult {
  activeLayer?: string;
  layer?: string;
  visible?: boolean;
}

interface DefIdResult {
  defId: string;
}

interface PlaceFpResult {
  id: string;
  defId: string;
  ref: string;
  x: number;
  y: number;
}

interface RoutePointResult {
  x: number;
  y: number;
  active?: boolean;
  violating?: boolean;
}

interface TrackResult {
  id: string;
  netId: string;
  layer: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface ViaResult {
  id: string;
  netId: string;
  x: number;
  y: number;
}

interface SelectionWrap {
  selection: Object;
}

interface DeltaResult {
  dx: number;
  dy: number;
}

interface SnapResult {
  x: number;
  y: number;
}

function ok(id: number | string | null, result: Object): JsonRpcSuccess {
  const resp: JsonRpcSuccess = {
    jsonrpc: '2.0',
    id: id,
    result: result
  };
  return resp;
}

function fail(id: number | string | null, code: number, message: string): JsonRpcFailure {
  const error: JsonRpcErrorBody = {
    code: code,
    message: message
  };
  const resp: JsonRpcFailure = {
    jsonrpc: '2.0',
    id: id,
    error: error
  };
  return resp;
}

function asString(v: Object | undefined, fallback: string = ''): string {
  if (v === undefined || v === null) {
    return fallback;
  }
  if (typeof v === 'string') {
    return v as string;
  }
  if (typeof v === 'number' || typeof v === 'boolean') {
    return `${v}`;
  }
  return fallback;
}

function asNumber(v: Object | undefined, fallback: number = 0): number {
  if (typeof v === 'number' && !Number.isNaN(v as number)) {
    return v as number;
  }
  if (typeof v === 'string') {
    const n = Number(v as string);
    if (!Number.isNaN(n)) {
      return n;
    }
  }
  return fallback;
}

function asBool(v: Object | undefined, fallback: boolean = false): boolean {
  if (typeof v === 'boolean') {
    return v as boolean;
  }
  return fallback;
}

function pointFrom(params: Record<string, Object>, xKey: string, yKey: string): Point2D {
  const pt: Point2D = {
    x: asNumber(params[xKey]),
    y: asNumber(params[yKey])
  };
  return pt;
}

function parseLayer(raw: string): PcbLayerId | null {
  const all: PcbLayerId[] = [
    PcbLayerId.F_CU, PcbLayerId.IN1_CU, PcbLayerId.IN2_CU, PcbLayerId.IN3_CU,
    PcbLayerId.IN4_CU, PcbLayerId.IN5_CU, PcbLayerId.IN6_CU, PcbLayerId.B_CU,
    PcbLayerId.F_SILKS, PcbLayerId.B_SILKS, PcbLayerId.F_MASK, PcbLayerId.B_MASK,
    PcbLayerId.F_PASTE, PcbLayerId.B_PASTE, PcbLayerId.EDGE_CUTS,
    PcbLayerId.F_FAB, PcbLayerId.B_FAB, PcbLayerId.COURTYARD
  ];
  for (let i = 0; i < all.length; i++) {
    if (all[i] === raw) {
      return all[i];
    }
  }
  return null;
}

function summarizeComponent(c: ComponentDefinition): CompSummary {
  const row: CompSummary = {
    id: c.id,
    name: c.name,
    category: `${c.category}`,
    manufacturer: c.manufacturer,
    description: c.description,
    pinCount: c.pins.length
  };
  return row;
}

function flag(cleared?: boolean, undone?: boolean, redone?: boolean, cancelled?: boolean,
  deleted?: boolean, rotated?: boolean, annotated?: boolean): FlagResult {
  const r: FlagResult = {};
  if (cleared !== undefined) {
    r.cleared = cleared;
  }
  if (undone !== undefined) {
    r.undone = undone;
  }
  if (redone !== undefined) {
    r.redone = redone;
  }
  if (cancelled !== undefined) {
    r.cancelled = cancelled;
  }
  if (deleted !== undefined) {
    r.deleted = deleted;
  }
  if (rotated !== undefined) {
    r.rotated = rotated;
  }
  if (annotated !== undefined) {
    r.annotated = annotated;
  }
  return r;
}

export class AgentCommandDispatcher {
  private sch: ISchematicEditor | null = null;
  private pcb: IPcbEditor | null = null;
  private lib: IComponentLibrary | null = null;
  private host: IAgentDrawingHost | null = null;

  bind(sch: ISchematicEditor, pcb: IPcbEditor, lib: IComponentLibrary): void {
    this.sch = sch;
    this.pcb = pcb;
    this.lib = lib;
  }

  bindHost(host: IAgentDrawingHost): void {
    this.host = host;
  }

  private sessionActive(): boolean {
    return this.host !== null && this.host.isAgentDrawingSession();
  }

  private autoLog(text: string): void {
    if (this.host === null || !this.host.isAgentDrawingSession()) {
      return;
    }
    this.host.appendSessionLog(text);
  }

  private autoFitAfterPlace(): void {
    if (this.host === null || !this.host.isAgentDrawingSession()) {
      return;
    }
    this.host.fitAllInView();
  }

  /** 首次原子写自动开会话：锁画布 + 日志 + 后续居中 */
  private ensureDrawingSession(reason: string): boolean {
    if (this.host === null) {
      return true;
    }
    if (this.host.isAgentDrawingSession()) {
      return true;
    }
    const r = this.host.beginDrawingSession(reason);
    return r.ok;
  }

  private toSessionRow(r: AgentDrawingSessionResult): SessionResultRow {
    const row: SessionResultRow = {
      ok: r.ok,
      error: r.error,
      active: r.active,
      fitted: r.fitted
    };
    return row;
  }

  dispatch(req: JsonRpcRequest): JsonRpcResponse {
    const id = req.id ?? null;
    const method = req.method ?? '';
    const params: Record<string, Object> = req.params ?? {};
    try {
      if (method === 'sys.ping') {
        const r: PingResult = { pong: true, ts: Date.now() };
        return ok(id, r);
      }
      if (method === 'sys.status') {
        return ok(id, this.statusPayload());
      }
      if (method === 'sys.list_methods') {
        const r: MethodsResult = { methods: this.listMethods() };
        return ok(id, r);
      }
      if (method.startsWith('lib.')) {
        return this.dispatchLib(id, method, params);
      }
      if (method.startsWith('sch.')) {
        return this.dispatchSch(id, method, params);
      }
      if (method.startsWith('pcb.')) {
        return this.dispatchPcb(id, method, params);
      }
      return fail(id, -32601, `Method not found: ${method}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : `${e}`;
      Logger.error(TAG, `dispatch ${method} failed: ${msg}`);
      return fail(id, -32000, msg);
    }
  }

  private statusPayload(): StatusResult {
    const schOk = this.sch !== null;
    const pcbOk = this.pcb !== null;
    const libOk = this.lib !== null;
    let schDevices = 0;
    let schNets = 0;
    let pcbFp = 0;
    let pcbTracks = 0;
    let copper = 0;
    if (this.sch) {
      const topo = this.sch.getFullTopology();
      schDevices = topo.deviceList.length;
      schNets = topo.netList.length;
    }
    if (this.pcb) {
      const doc = this.pcb.getDocument();
      if (doc) {
        pcbFp = doc.footprints.length;
        pcbTracks = doc.tracks.length;
        copper = this.pcb.getLayerStackCopperCount();
      }
    }
    const r: StatusResult = {
      schematicReady: schOk,
      pcbReady: pcbOk,
      libraryReady: libOk,
      schematicDeviceCount: schDevices,
      schematicNetCount: schNets,
      pcbFootprintCount: pcbFp,
      pcbTrackCount: pcbTracks,
      pcbCopperLayerCount: copper,
      bridgeId: IdUtil.generate('bridge'),
      agentDrawing: this.sessionActive()
    };
    return r;
  }

  private listMethods(): string[] {
    return [
      'sys.ping', 'sys.status', 'sys.list_methods',
      'lib.search', 'lib.get', 'lib.resolve_id',
      'sch.get_topology_summary', 'sch.place_device', 'sch.delete_device',
      'sch.move_device', 'sch.rotate_device', 'sch.set_param',
      'sch.add_wire_segment', 'sch.add_wire_points', 'sch.create_net_label',
      'sch.rename_net_label', 'sch.select_at', 'sch.clear_selection',
      'sch.undo', 'sch.redo',
      'sch.drawing_session_begin', 'sch.drawing_session_end',
      'sch.fit_all_in_view', 'sch.append_session_log',
      'pcb.get_summary', 'pcb.set_copper_layer_count', 'pcb.set_active_layer',
      'pcb.set_layer_visible', 'pcb.place_footprint', 'pcb.set_place_footprint_def',
      'pcb.move_footprint', 'pcb.clear_copper', 'pcb.clear_mount_nets', 'pcb.fit_board_in_view',
      'pcb.drawing_session_begin', 'pcb.drawing_session_end', 'pcb.append_session_log',
      'pcb.start_route', 'pcb.preview_route', 'pcb.commit_route', 'pcb.cancel_route',
      'pcb.switch_route_layer', 'pcb.add_track_segment',
      'pcb.add_via', 'pcb.select_at', 'pcb.clear_selection',
      'pcb.move_selected', 'pcb.rotate_selected', 'pcb.delete_selected',
      'pcb.snap_point', 'pcb.undo', 'pcb.redo', 'pcb.forward_annotate'
    ];
  }

  private dispatchLib(id: number | string | null, method: string,
    params: Record<string, Object>): JsonRpcResponse {
    if (!this.lib) {
      return fail(id, -32001, 'Component library not bound');
    }
    if (method === 'lib.search') {
      const keyword = asString(params['keyword'], asString(params['query']));
      const page = asNumber(params['page'], 1);
      const pageSize = asNumber(params['pageSize'], 20);
      const pageResult = this.lib.search(keyword, page, pageSize);
      const items: CompSummary[] = [];
      for (let i = 0; i < pageResult.items.length; i++) {
        items.push(summarizeComponent(pageResult.items[i]));
      }
      const r: SearchResult = {
        items: items,
        total: pageResult.total,
        page: pageResult.page,
        pageSize: pageResult.pageSize
      };
      return ok(id, r);
    }
    if (method === 'lib.get') {
      const libraryId = asString(params['libraryId'], asString(params['id']));
      const got = this.lib.getComponent(libraryId);
      if (!got.success || !got.data) {
        return fail(id, -32002, got.error ?? `Component not found: ${libraryId}`);
      }
      return ok(id, summarizeComponent(got.data));
    }
    if (method === 'lib.resolve_id') {
      const raw = asString(params['id'], asString(params['libraryId']));
      const r: ResolveResult = { resolved: this.lib.resolveLibraryId(raw), input: raw };
      return ok(id, r);
    }
    return fail(id, -32601, `Method not found: ${method}`);
  }

  private dispatchSch(id: number | string | null, method: string,
    params: Record<string, Object>): JsonRpcResponse {
    if (method === 'sch.drawing_session_begin') {
      if (!this.host) {
        return fail(id, -32001, 'Drawing host not bound');
      }
      const reason = asString(params['reason'], 'Agent 远程绘制');
      const begun = this.host.beginDrawingSession(reason);
      if (!begun.ok) {
        return fail(id, -32003, begun.error.length > 0 ? begun.error : 'drawing_session_begin failed');
      }
      return ok(id, this.toSessionRow(begun));
    }
    if (method === 'sch.drawing_session_end') {
      if (!this.host) {
        return fail(id, -32001, 'Drawing host not bound');
      }
      const fit = asBool(params['fit'], true);
      return ok(id, this.toSessionRow(this.host.endDrawingSession(fit)));
    }
    if (method === 'sch.fit_all_in_view') {
      if (!this.host) {
        return fail(id, -32001, 'Drawing host not bound');
      }
      return ok(id, this.toSessionRow(this.host.fitAllInView()));
    }
    if (method === 'sch.append_session_log') {
      if (!this.host) {
        return fail(id, -32001, 'Drawing host not bound');
      }
      const text = asString(params['text'], asString(params['message']));
      if (text.length === 0) {
        return fail(id, -32602, 'text required');
      }
      return ok(id, this.toSessionRow(this.host.appendSessionLog(text)));
    }
    if (!this.sch) {
      return fail(id, -32001, 'Schematic editor not bound');
    }
    if (method === 'sch.get_topology_summary') {
      const topo = this.sch.getFullTopology();
      const devices: DeviceRow[] = [];
      for (let i = 0; i < topo.deviceList.length; i++) {
        const d = topo.deviceList[i];
        const row: DeviceRow = {
          uuid: d.instUuid,
          libId: d.libDevId,
          ref: d.refName,
          x: d.x,
          y: d.y,
          rotate: d.rotate
        };
        devices.push(row);
      }
      const nets: NetRow[] = [];
      for (let j = 0; j < topo.netList.length; j++) {
        const n = topo.netList[j];
        const row: NetRow = { id: n.netUuid, name: n.netName };
        nets.push(row);
      }
      const r: TopologySummary = {
        deviceCount: topo.deviceList.length,
        netCount: topo.netList.length,
        wireCount: topo.wireList.length,
        devices: devices,
        nets: nets
      };
      return ok(id, r);
    }
    if (method === 'sch.place_device') {
      if (!this.ensureDrawingSession('自动开始 · 放置器件')) {
        return fail(id, -32003, '无法开始 Agent 绘制会话（可能 AI 正在生成）');
      }
      const libId = asString(params['libraryId'], asString(params['libId']));
      const x = asNumber(params['x']);
      const y = asNumber(params['y']);
      const refName = asString(params['refName']);
      const placed = refName.length > 0
        ? this.sch.addDevice(libId, x, y, refName)
        : this.sch.addDevice(libId, x, y);
      if (!placed.success || !placed.data) {
        return fail(id, -32003, placed.error ?? 'place_device failed');
      }
      const r: PlaceDeviceResult = {
        uuid: placed.data.instUuid,
        libId: placed.data.libDevId,
        ref: placed.data.refName,
        x: placed.data.x,
        y: placed.data.y
      };
      this.autoLog(`放置 ${r.ref || libId} @${r.x},${r.y}`);
      this.autoFitAfterPlace();
      return ok(id, r);
    }
    if (method === 'sch.delete_device') {
      this.ensureDrawingSession('自动开始 · 删除器件');
      const uuid = asString(params['uuid'], asString(params['instUuid']));
      const deleted = this.sch.deleteDevice(uuid);
      if (!deleted.success) {
        return fail(id, -32003, deleted.error ?? 'delete_device failed');
      }
      this.autoLog(`删除器件 ${uuid}`);
      const r: UuidResult = { uuid: uuid };
      return ok(id, r);
    }
    if (method === 'sch.move_device') {
      this.ensureDrawingSession('自动开始 · 移动器件');
      const uuid = asString(params['uuid'], asString(params['instUuid']));
      const pos = pointFrom(params, 'x', 'y');
      const moved = this.sch.moveComponent(uuid, pos);
      if (!moved.success) {
        return fail(id, -32003, moved.error ?? 'move_device failed');
      }
      this.autoLog(`移动器件 → ${pos.x},${pos.y}`);
      const r: MoveResult = { uuid: uuid, x: pos.x, y: pos.y };
      return ok(id, r);
    }
    if (method === 'sch.rotate_device') {
      this.ensureDrawingSession('自动开始 · 旋转器件');
      const uuid = asString(params['uuid'], asString(params['instUuid']));
      const angle = asNumber(params['angle'], 90);
      const rotated = this.sch.rotateDevice(uuid, angle);
      if (!rotated.success) {
        return fail(id, -32003, rotated.error ?? 'rotate_device failed');
      }
      this.autoLog(`旋转器件 → ${angle}°`);
      const r: RotateResult = { uuid: uuid, angle: angle };
      return ok(id, r);
    }
    if (method === 'sch.set_param') {
      this.ensureDrawingSession('自动开始 · 设置参数');
      const uuid = asString(params['uuid'], asString(params['instUuid']));
      const key = asString(params['key']);
      const value = asString(params['value']);
      const set = this.sch.setDeviceParam(uuid, key, value);
      if (!set.success) {
        return fail(id, -32003, set.error ?? 'set_param failed');
      }
      this.autoLog(`参数 ${key}=${value}`);
      const r: ParamResult = { uuid: uuid, key: key, value: value };
      return ok(id, r);
    }
    if (method === 'sch.add_wire_segment') {
      if (!this.ensureDrawingSession('自动开始 · 连线')) {
        return fail(id, -32003, '无法开始 Agent 绘制会话（可能 AI 正在生成）');
      }
      const from = pointFrom(params, 'x1', 'y1');
      const to = pointFrom(params, 'x2', 'y2');
      const netId = asString(params['netId']);
      const wired = netId.length > 0
        ? this.sch.addWireSegment(from, to, netId)
        : this.sch.addWireSegment(from, to);
      if (!wired.success || !wired.data) {
        return fail(id, -32003, wired.error ?? 'add_wire_segment failed');
      }
      this.autoLog(`连线 (${from.x},${from.y})→(${to.x},${to.y})`);
      const r: WireIdResult = { wireId: wired.data };
      return ok(id, r);
    }
    if (method === 'sch.add_wire_points') {
      if (!this.ensureDrawingSession('自动开始 · 多点连线')) {
        return fail(id, -32003, '无法开始 Agent 绘制会话（可能 AI 正在生成）');
      }
      const rawPts = params['points'];
      if (!(rawPts instanceof Array)) {
        return fail(id, -32602, 'points must be an array of {x,y}');
      }
      const waypoints: Point2D[] = [];
      const arr = rawPts as Object[];
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i] as Record<string, Object>;
        const wp: Point2D = { x: asNumber(p['x']), y: asNumber(p['y']) };
        waypoints.push(wp);
      }
      const netId = asString(params['netId']);
      const wired = netId.length > 0
        ? this.sch.addWireWithPoints(waypoints, netId)
        : this.sch.addWireWithPoints(waypoints);
      if (!wired.success || !wired.data) {
        return fail(id, -32003, wired.error ?? 'add_wire_points failed');
      }
      this.autoLog(`多点连线 ${waypoints.length} 点`);
      const r: WireIdResult = { wireId: wired.data };
      return ok(id, r);
    }
    if (method === 'sch.create_net_label') {
      this.ensureDrawingSession('自动开始 · 网络标号');
      const x = asNumber(params['x']);
      const y = asNumber(params['y']);
      const netName = asString(params['netName'], asString(params['name']));
      const created = this.sch.createNetLabel(x, y, netName);
      if (!created.success || !created.data) {
        return fail(id, -32003, created.error ?? 'create_net_label failed');
      }
      this.autoLog(`网络标号 ${netName}`);
      const r: LabelResult = { labelId: created.data, netName: netName };
      return ok(id, r);
    }
    if (method === 'sch.rename_net_label') {
      this.ensureDrawingSession('自动开始 · 重命名标号');
      const labelId = asString(params['labelId']);
      const netName = asString(params['netName'], asString(params['name']));
      const renamed = this.sch.renameNetLabel(labelId, netName);
      if (!renamed.success || !renamed.data) {
        return fail(id, -32003, renamed.error ?? 'rename_net_label failed');
      }
      this.autoLog(`重命名标号 → ${netName}`);
      const r: RenameLabelResult = { netId: renamed.data, netName: netName };
      return ok(id, r);
    }
    if (method === 'sch.select_at') {
      const pt = pointFrom(params, 'x', 'y');
      const ids = this.sch.selectAt(pt);
      const r: IdsResult = { ids: ids };
      return ok(id, r);
    }
    if (method === 'sch.clear_selection') {
      this.sch.setSelection([]);
      return ok(id, flag(true));
    }
    if (method === 'sch.undo') {
      const undone = this.sch.undo();
      if (!undone.success) {
        return fail(id, -32003, undone.error ?? 'undo failed');
      }
      this.autoLog('撤销');
      return ok(id, flag(undefined, true));
    }
    if (method === 'sch.redo') {
      const redone = this.sch.redo();
      if (!redone.success) {
        return fail(id, -32003, redone.error ?? 'redo failed');
      }
      this.autoLog('重做');
      return ok(id, flag(undefined, undefined, true));
    }
    return fail(id, -32601, `Method not found: ${method}`);
  }

  private dispatchPcb(id: number | string | null, method: string,
    params: Record<string, Object>): JsonRpcResponse {
    if (!this.pcb) {
      return fail(id, -32001, 'PCB editor not bound');
    }
    // 与 sch.* 会话 API 同宿主：PCB 绘制同样复用 AI 遮罩 + [Agent] 日志
    if (method === 'pcb.drawing_session_begin') {
      if (!this.host) {
        return fail(id, -32001, 'Drawing host not bound');
      }
      const reason = asString(params['reason'], 'Agent PCB 绘制');
      const begun = this.host.beginDrawingSession(reason);
      if (!begun.ok) {
        return fail(id, -32003, begun.error.length > 0 ? begun.error : 'drawing_session_begin failed');
      }
      return ok(id, this.toSessionRow(begun));
    }
    if (method === 'pcb.drawing_session_end') {
      if (!this.host) {
        return fail(id, -32001, 'Drawing host not bound');
      }
      const fit = asBool(params['fit'], true);
      return ok(id, this.toSessionRow(this.host.endDrawingSession(fit)));
    }
    if (method === 'pcb.append_session_log') {
      if (!this.host) {
        return fail(id, -32001, 'Drawing host not bound');
      }
      const message = asString(params['message'], asString(params['text']));
      if (message.length === 0) {
        return fail(id, -32602, 'text required');
      }
      return ok(id, this.toSessionRow(this.host.appendSessionLog(message)));
    }
    if (method === 'pcb.get_summary') {
      const doc = this.pcb.getDocument();
      if (!doc) {
        const empty: PcbEmptySummary = { empty: true };
        return ok(id, empty);
      }
      const fps: FootprintRow[] = [];
      const pads: PadRow[] = [];
      for (let i = 0; i < doc.footprints.length; i++) {
        const f = doc.footprints[i];
        const row: FootprintRow = {
          id: f.id,
          defId: f.defId,
          ref: f.refDes,
          x: f.position.x,
          y: f.position.y,
          rotation: f.rotation as number
        };
        fps.push(row);
        for (let pi = 0; pi < f.pads.length; pi++) {
          const pad = f.pads[pi];
          const wp = padWorldPosition(f, pad);
          const padRow: PadRow = {
            fpId: f.id,
            ref: f.refDes,
            pad: pad.number,
            x: wp.x,
            y: wp.y,
            netId: pad.netId ?? '',
            netName: pad.netName ?? ''
          };
          pads.push(padRow);
        }
      }
      const r: PcbSummary = {
        footprintCount: doc.footprints.length,
        trackCount: doc.tracks.length,
        viaCount: doc.vias.length,
        copperLayerCount: this.pcb.getLayerStackCopperCount(),
        activeLayer: `${this.pcb.getActiveLayer()}`,
        footprints: fps,
        pads: pads
      };
      return ok(id, r);
    }
    if (method === 'pcb.fit_board_in_view') {
      if (this.host) {
        return ok(id, this.toSessionRow(this.host.fitAllInView()));
      }
      this.pcb.fitBoardInView();
      const fitted: SessionResultRow = { ok: true, error: '', active: false, fitted: true };
      return ok(id, fitted);
    }
    if (method === 'pcb.move_footprint') {
      if (!this.ensureDrawingSession('自动开始 · PCB 移动封装')) {
        return fail(id, -32003, '无法开始 Agent 绘制会话（可能 AI 正在生成）');
      }
      const key = asString(params['ref'], asString(params['id'], asString(params['uuid'])));
      const x = asNumber(params['x']);
      const y = asNumber(params['y']);
      const hasRot = params['rotation'] !== undefined || params['angle'] !== undefined;
      const rot = asNumber(params['rotation'], asNumber(params['angle'], 0));
      const moved = hasRot
        ? this.pcb.moveFootprintTo(key, x, y, rot)
        : this.pcb.moveFootprintTo(key, x, y);
      if (!moved) {
        return fail(id, -32003, `move_footprint failed: ${key}`);
      }
      this.autoLog(`PCB 移动 ${key} → ${x},${y}`);
      const doc = this.pcb.getDocument();
      let refOut = key;
      let idOut = key;
      let rotOut = rot;
      if (doc) {
        for (let i = 0; i < doc.footprints.length; i++) {
          const f = doc.footprints[i];
          if (f.id === key || f.refDes === key) {
            idOut = f.id;
            refOut = f.refDes;
            rotOut = f.rotation as number;
            break;
          }
        }
      }
      const r: MoveFpResult = { id: idOut, ref: refOut, x: x, y: y, rotation: rotOut };
      return ok(id, r);
    }
    if (method === 'pcb.clear_copper') {
      if (!this.ensureDrawingSession('自动开始 · PCB 清铜')) {
        return fail(id, -32003, '无法开始 Agent 绘制会话（可能 AI 正在生成）');
      }
      const clearTracks = asBool(params['tracks'], true);
      const clearVias = asBool(params['vias'], true);
      const removed = this.pcb.clearCopper(clearTracks, clearVias);
      this.autoLog(`PCB 清铜 removed=${removed}`);
      const r: ClearCopperResult = {
        removed: removed,
        tracksCleared: clearTracks,
        viasCleared: clearVias
      };
      return ok(id, r);
    }
    if (method === 'pcb.clear_mount_nets') {
      if (!this.ensureDrawingSession('自动开始 · 清除安装孔网络')) {
        return fail(id, -32003, '无法开始 Agent 绘制会话（可能 AI 正在生成）');
      }
      const n = this.pcb.clearMountHoleNets();
      this.autoLog(`PCB 安装孔去网络 count=${n}`);
      const r: ClearCopperResult = { removed: n, tracksCleared: false, viasCleared: false };
      return ok(id, r);
    }
    if (method === 'pcb.set_copper_layer_count') {
      if (!this.ensureDrawingSession('自动开始 · PCB 层数')) {
        return fail(id, -32003, '无法开始 Agent 绘制会话（可能 AI 正在生成）');
      }
      const count = asNumber(params['count'], 2);
      const okSet = this.pcb.setCopperLayerCount(count);
      if (!okSet) {
        return fail(id, -32003, `Invalid copper layer count: ${count}`);
      }
      this.autoLog(`PCB 铜层=${count}`);
      const r: CopperCountResult = { copperLayerCount: this.pcb.getLayerStackCopperCount() };
      return ok(id, r);
    }
    if (method === 'pcb.set_active_layer') {
      const layerRaw = asString(params['layer']);
      const layer = parseLayer(layerRaw);
      if (!layer) {
        return fail(id, -32602, `Unknown layer: ${layerRaw}`);
      }
      this.pcb.setActiveLayer(layer);
      this.autoLog(`PCB 活动层 ${layerRaw}`);
      const r: LayerResult = { activeLayer: `${layer}` };
      return ok(id, r);
    }
    if (method === 'pcb.set_layer_visible') {
      const layerRaw = asString(params['layer']);
      const layer = parseLayer(layerRaw);
      if (!layer) {
        return fail(id, -32602, `Unknown layer: ${layerRaw}`);
      }
      const visible = asBool(params['visible'], true);
      this.pcb.setLayerVisible(layer, visible);
      const r: LayerResult = { layer: `${layer}`, visible: visible };
      return ok(id, r);
    }
    if (method === 'pcb.set_place_footprint_def') {
      const defId = asString(params['defId'], asString(params['libraryId']));
      this.pcb.setPlaceFootprintDefId(defId);
      const r: DefIdResult = { defId: defId };
      return ok(id, r);
    }
    if (method === 'pcb.place_footprint') {
      if (!this.ensureDrawingSession('自动开始 · PCB 放置封装')) {
        return fail(id, -32003, '无法开始 Agent 绘制会话（可能 AI 正在生成）');
      }
      const defId = asString(params['defId'], asString(params['libraryId']));
      if (defId.length > 0) {
        this.pcb.setPlaceFootprintDefId(defId);
      }
      const pos = pointFrom(params, 'x', 'y');
      const inst = this.pcb.placeFootprintAt(pos);
      if (!inst) {
        return fail(id, -32003, 'place_footprint failed (check defId / board)');
      }
      this.autoLog(`PCB 放置 ${inst.refDes} @${pos.x},${pos.y}`);
      const r: PlaceFpResult = {
        id: inst.id,
        defId: inst.defId,
        ref: inst.refDes,
        x: inst.position.x,
        y: inst.position.y
      };
      return ok(id, r);
    }
    if (method === 'pcb.start_route') {
      if (!this.ensureDrawingSession('自动开始 · PCB 布线')) {
        return fail(id, -32003, '无法开始 Agent 绘制会话（可能 AI 正在生成）');
      }
      const pt = pointFrom(params, 'x', 'y');
      const snapped = this.pcb.startRoute(pt);
      this.autoLog(`PCB 布线起点 (${snapped.x},${snapped.y})`);
      const r: RoutePointResult = {
        x: snapped.x,
        y: snapped.y,
        active: this.pcb.isRouteActive()
      };
      return ok(id, r);
    }
    if (method === 'pcb.preview_route') {
      const pt = pointFrom(params, 'x', 'y');
      const snapped = this.pcb.previewRoute(pt);
      const r: RoutePointResult = {
        x: snapped.x,
        y: snapped.y,
        violating: this.pcb.isRoutePreviewViolating()
      };
      return ok(id, r);
    }
    if (method === 'pcb.commit_route') {
      if (!this.ensureDrawingSession('自动开始 · PCB 布线提交')) {
        return fail(id, -32003, '无法开始 Agent 绘制会话（可能 AI 正在生成）');
      }
      const pt = pointFrom(params, 'x', 'y');
      const track = this.pcb.commitRoute(pt);
      if (!track) {
        const reason = this.pcb.getLastRouteRejectReason();
        const detail = reason.length > 0 ? reason : 'cross-net / too short / inactive';
        return fail(id, -32003, `commit_route failed (${detail})`);
      }
      this.autoLog(`PCB 走线 (${track.start.x},${track.start.y})→(${track.end.x},${track.end.y}) ${track.layer}`);
      const r: TrackResult = {
        id: track.id,
        netId: track.netId,
        layer: `${track.layer}`,
        x1: track.start.x,
        y1: track.start.y,
        x2: track.end.x,
        y2: track.end.y
      };
      return ok(id, r);
    }
    if (method === 'pcb.cancel_route') {
      this.pcb.cancelRoute();
      return ok(id, flag(undefined, undefined, undefined, true));
    }
    if (method === 'pcb.switch_route_layer') {
      if (!this.ensureDrawingSession('自动开始 · PCB 换层')) {
        return fail(id, -32003, '无法开始 Agent 绘制会话（可能 AI 正在生成）');
      }
      const layerRaw = asString(params['layer']);
      const layer = parseLayer(layerRaw);
      if (!layer) {
        return fail(id, -32602, `Unknown layer: ${layerRaw}`);
      }
      const via = this.pcb.switchRouteLayer(layer);
      this.autoLog(`PCB 换层 → ${layerRaw}`);
      if (!via) {
        const r: LayerResult = { activeLayer: `${this.pcb.getActiveLayer()}` };
        return ok(id, r);
      }
      const vr: ViaResult = {
        id: via.id,
        netId: via.netId,
        x: via.position.x,
        y: via.position.y
      };
      return ok(id, vr);
    }
    if (method === 'pcb.add_track_segment') {
      if (!this.ensureDrawingSession('自动开始 · PCB 线段')) {
        return fail(id, -32003, '无法开始 Agent 绘制会话（可能 AI 正在生成）');
      }
      const from = pointFrom(params, 'x1', 'y1');
      const to = pointFrom(params, 'x2', 'y2');
      const netId = asString(params['netId']);
      const netName = asString(params['netName']);
      const layerRaw = asString(params['layer']);
      if (layerRaw.length > 0) {
        const layer = parseLayer(layerRaw);
        if (layer) {
          this.pcb.setActiveLayer(layer);
        }
      }
      // 精确直线 + 强制焊盘 DRC（禁止拐弯/异网吸附）
      const track = this.pcb.addStraightTrack(from, to,
        netId.length > 0 ? netId : undefined,
        netName.length > 0 ? netName : undefined);
      if (!track) {
        const reason = this.pcb.getLastRouteRejectReason();
        return fail(id, -32003,
          `add_track_segment failed (${reason.length > 0 ? reason : 'rejected'})`);
      }
      this.autoLog(`PCB 线段 ${track.netName || track.netId}`);
      const r: TrackResult = {
        id: track.id,
        netId: track.netId,
        layer: `${track.layer}`,
        x1: track.start.x,
        y1: track.start.y,
        x2: track.end.x,
        y2: track.end.y
      };
      return ok(id, r);
    }
    if (method === 'pcb.add_via') {
      if (!this.ensureDrawingSession('自动开始 · PCB 过孔')) {
        return fail(id, -32003, '无法开始 Agent 绘制会话（可能 AI 正在生成）');
      }
      const pos = pointFrom(params, 'x', 'y');
      const netId = asString(params['netId']);
      const netName = asString(params['netName']);
      const via = this.pcb.addVia(
        pos,
        netId.length > 0 ? netId : undefined,
        netName.length > 0 ? netName : undefined
      );
      if (!via) {
        return fail(id, -32003, 'add_via failed');
      }
      this.autoLog(`PCB 过孔 @${via.position.x},${via.position.y}`);
      const r: ViaResult = {
        id: via.id,
        netId: via.netId,
        x: via.position.x,
        y: via.position.y
      };
      return ok(id, r);
    }
    if (method === 'pcb.select_at') {
      const x = asNumber(params['x']);
      const y = asNumber(params['y']);
      const additive = asBool(params['additive'], false);
      this.pcb.selectAt(x, y, additive);
      const r: SelectionWrap = { selection: this.pcb.getSelection() as Object };
      return ok(id, r);
    }
    if (method === 'pcb.clear_selection') {
      this.pcb.clearSelection();
      return ok(id, flag(true));
    }
    if (method === 'pcb.move_selected') {
      const dx = asNumber(params['dx']);
      const dy = asNumber(params['dy']);
      this.pcb.beginMoveOperation();
      this.pcb.moveSelected(dx, dy);
      this.pcb.endMoveOperation();
      const r: DeltaResult = { dx: dx, dy: dy };
      return ok(id, r);
    }
    if (method === 'pcb.rotate_selected') {
      this.pcb.rotateSelected(asBool(params['clockwise'], true));
      return ok(id, flag(undefined, undefined, undefined, undefined, undefined, true));
    }
    if (method === 'pcb.delete_selected') {
      this.pcb.deleteSelected();
      return ok(id, flag(undefined, undefined, undefined, undefined, true));
    }
    if (method === 'pcb.snap_point') {
      const pt = pointFrom(params, 'x', 'y');
      const snapped = this.pcb.snapToPadOrGrid(pt);
      const r: SnapResult = { x: snapped.x, y: snapped.y };
      return ok(id, r);
    }
    if (method === 'pcb.undo') {
      const done = this.pcb.undo();
      if (!done) {
        return fail(id, -32003, 'nothing to undo');
      }
      return ok(id, flag(undefined, true));
    }
    if (method === 'pcb.redo') {
      const done = this.pcb.redo();
      if (!done) {
        return fail(id, -32003, 'nothing to redo');
      }
      return ok(id, flag(undefined, undefined, true));
    }
    if (method === 'pcb.forward_annotate') {
      if (!this.ensureDrawingSession('自动开始 · PCB 前向标注')) {
        return fail(id, -32003, '无法开始 Agent 绘制会话（可能 AI 正在生成）');
      }
      const annotated = this.pcb.forwardAnnotateFromSchematic();
      if (!annotated.success) {
        return fail(id, -32003, annotated.error ?? 'forward_annotate failed');
      }
      this.autoLog('PCB 前向标注完成');
      return ok(id, flag(undefined, undefined, undefined, undefined, undefined, undefined, true));
    }
    return fail(id, -32601, `Method not found: ${method}`);
  }
}
