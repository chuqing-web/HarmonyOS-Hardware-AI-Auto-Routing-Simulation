/**
 * PCB 自动布线 — 四阶段：Global(拥塞/层对) → Detail(候选+maze+Steiner+差分)
 * → Rip-up(incomplete/cross/stitch) → Post(捷径+审计+指标)。
 * 铜层≥4：F=stub / 内层 H+V 信号 / B=power_h（每层都参与走线）；地无专用层时走底层。
 * netClass 线宽；多脚曼哈顿 Steiner；差分对优先同层对；异步让出防 THREAD_BLOCK。
 */
import {
  PcbDocument, PcbLayerId, PcbTrack, PcbVia, PcbRatsnestEdge,
  copperLayersFromStack
} from '../types/PcbTypes';
import { Point2D } from '../types/CommonTypes';
import { IdUtil } from './IdUtil';
import { padWorldPosition } from './PcbZoneUtil';
import {
  snapTrackEndpointsToPads, pruneZeroLengthTracks,
  mergeColinearTracks, pruneShortTracks
} from './PcbTrackBindUtil';
import { ensureBoardAccessories, clearCopperForNets, AccessoryNetHint } from './PcbBoardAccessories';
import {
  pathClearBlockReason, viaClearAt, clearanceForNet, footprintSelectionAabb,
  trackWidthForNet
} from './pcb_route/PcbClearanceOracle';
import { mazeRouteRectilinear, mazeRouteRectilinearAsync, MazeLayerPair } from './pcb_route/PcbMazeRouter';
import {
  buildCongestionMap, pickCongestionAwareLayerPair, accumulateTracksIntoCongestion,
  buildPlacementCongestionFeedback, estimateNetCongestionRisk, GlobalCongestionMap
} from './pcb_route/PcbGlobalRoute';
import { assignGlobalChannelsEdgeAware } from './pcb_route/PcbGCellEdgeRouter';
import { assignTracksToGuides } from './pcb_route/PcbTrackAssign';
import { GlobalNetGuide, GlobalNetSeed } from './pcb_route/PcbGlobalChannel';
import { ensureAllCopperUsed, fillUnusedCopperLayers } from './pcb_route/ensureAllCopperUsed';
import { buildLocalNetPlan, buildLocalRoutePolicy } from './pcb_route/PcbLocalStrategy';
import {
  applyMcuHandCopper, buildMcuHandLayerRoles
} from './pcb_route/PcbMcuHandCopper';
import { detectMcuColumnClusters } from './pcb_route/PcbMcuColumnPlacer';
import {
  PcbLayerRole, PcbRouteEngineHooks, PcbAutoRouteAgentContext,
  PcbCorridorBias, PcbAutoAgentOp, PcbAutoGeometryAdvice, validateAutoLayerRoles,
  isTrustedAutoAdvice
} from '../types/PcbAiRouteTypes';
import {
  buildRectilinearSteinerEdges, orderSteinerEdgesForRouting
} from './pcb_route/PcbSteinerTree';
import { shortenOrthoStairs, shortenOrthoStairsAsync } from './pcb_route/PcbRoutePostOptimize';
import {
  collectDiffPairPlans, isDiffPairNet, reportDiffPairLengths, diffPairSamplePoints,
  tuneDiffPairLengths, buildDiffFollowCandidates
} from './pcb_route/PcbDiffPairRouter';
import { routeDiffPairCoupled } from './pcb_route/PcbDiffPairCoupled';
import { tuneDiffPairSerpentine } from './pcb_route/PcbSerpentine';
import { ripBlockingTracksForNets } from './pcb_route/PcbCongestionRipup';
import { routeSwitchBoxCorridor } from './pcb_route/PcbSwitchBox';
import { logRuleEngineOnce } from './pcb_route/PcbRuleEngine';
import { routeGridlessVisible } from './pcb_route/PcbGridlessRoom';
import { routeRoomModel } from './pcb_route/PcbRoomModel';
import { annealRouteOptimize } from './pcb_route/PcbSimulatedAnnealing';
import { fixAcidTrapCorners } from './pcb_route/PcbDfmChecks';
import { computeAutoRouteMetrics, AutoRouteMetrics } from './pcb_route/PcbRouteVerify';
import { orderPinsOuterRingFirst } from './pcb_route/PcbEscapeOrder';
import { applyBgaDogboneFanout } from './pcb_route/PcbBgaFanout';
import { nudgePlacementFromCongestion } from './pcb_route/PcbCongestionPlacement';
import { resolveTrackWidth } from './pcb_route/PcbImpedanceRules';
import { auditSignalIntegrity } from './pcb_route/PcbSiChecks';
import { shoveAllClearanceConflicts } from './PcbTrackShoveUtil';
import { chamferOrthoCorners, pruneStubTracks } from './pcb_route/PcbCorner45';
import { tracePcb, tracePcbWarn, setPcbInstrAuditPaused } from './PcbTraceLog';
import { WireConflictGeometry } from './WireConflictGeometry';
import { WarRouteOrder, WarOrderPin } from './WarRouteOrder';
import { buildRatsnest, findNetClass, routeOrtho45Points } from './PcbNetUtil';
import { resolveViaGeometry } from './pcb_route/PcbViaCostModel';
import { routePolyRoom } from './pcb_route/PcbPolyRoom';
import { channelAutoRoutePcb } from './pcb_route/PcbChannelAutoRouter';

/** 异网焊盘障碍（圆形近似，与 ClearanceOracle 一致） */
interface PadObstacle {
  x: number;
  y: number;
  r: number;
}

export interface AutoRouteResult {
  trackCount: number;
  netCount: number;
  messages: string[];
  /** 布通率 0~1 */
  completionRate?: number;
  totalWireLength?: number;
  viaCount?: number;
  drcErrorCount?: number;
  metrics?: AutoRouteMetrics;
}

export interface RerouteResult {
  trackCount: number;
  netCount: number;
}

interface NetPadGroup {
  netId: string;
  netName: string;
  /** 原理图关联器件焊盘 */
  points: Point2D[];
  /** J1 外接针 — 器件布完后再抽头 */
  connectorPoints: Point2D[];
}

/** 单网选用的 H/V 层（多层时拐角可打过孔） */
interface NetLayerPair {
  h: PcbLayerId;
  v: PcbLayerId;
}

interface BlockBox {
  reason: string;
}

interface PadBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** 与 ClearanceOracle footprintSelectionAabb 对齐的软禁入盒（通道预筛） */
interface BodyBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface SoftObstacles {
  pads: PadObstacle[];
  bodies: BodyBox[];
}

/**
 * 单次 UI 切片上限（ms）——须远小于 3s HiCollie 看门狗。
 * setTimeout(0/1) 在 Harmony 上常并进同一 uv_timer_task，须 ≥16ms 才能排空 VIP MMI。
 */
const UI_SLICE_MS = 6;
/** yieldToUi 延迟：给 EventHandler 处理 MMI/vSync，避免 THREAD_BLOCK_3S/6S */
const UI_YIELD_MS = 16;
/** 无论耗时，每 N 个候选强制让出（防 Date.now 分辨率不足） */
const FORCE_YIELD_EVERY_CAND = 1;
/** 电源网：每个候选提交后强制让出（tryCommit+fanout 单次可 >200ms） */
const POWER_FORCE_YIELD_EVERY_CAND = 1;
/** 单跳硬墙基准（ms）；略加长以减少假 CHAIN_GAP，仍防主线程卡死 */
const PAIR_HOP_WALL_MS = 560;
/** 长跨/NRST 单跳硬墙上限（不可再抬：多跳×多层易触发 THREAD_BLOCK_6S） */
const PAIR_HOP_WALL_LONG_MS = 780;
/** 单跳内单层尝试预算上限（ms），保证多层有机会且主线程及时归还 */
const PAIR_LAYER_ATTEMPT_BUDGET_MS = 320;
/** 单跳最多层尝试次数（含 primary + 1 个 alt） */
const PAIR_LAYER_ATTEMPT_MAX = 3;
/**
 * 电源/地网单跳硬墙：Cu≥4 时每 hop 两端 fanout，长墙会让单次 tryCommit 吃掉整段 uv_timer。
 * 详细布线只连少数 MST 边，余量交给 stitchPowerNetGapsAsync。
 * 过短（≤180）时 stitch 几乎全 hop_deadline，电源岛无法补通。
 */
const POWER_HOP_WALL_MS = 280;
/** 电源 fanout/换层 via 单次搜索预算（ms），独立于 hop 墙 */
const POWER_FANOUT_BUDGET_MS = 60;
/** 信号 fanout 单次预算上限（ms） */
const SIGNAL_FANOUT_BUDGET_MS = 220;
/** 总线/多脚 fanout 预算（QFP 密集区） */
const BUS_FANOUT_BUDGET_MS = 420;
/** 非电源信号线宽硬帽（mil 等效单位）：防阻抗建议把 LED/总线撑成墙 */
const SIGNAL_WIDTH_HARD_CAP = 12;
/** LED / 超短局部硬帽 */
const LED_WIDTH_HARD_CAP = 10;
/** 总线硬帽 */
const BUS_WIDTH_HARD_CAP = 11;
/** 布线完成后补回流过孔的全局上限（避免途中毒化 fanout 走廊） */
const RETURN_VIA_POST_CAP = 32;
/** 电源详细布线 MST 边数上限（其余交 stitch；过大早占走廊） */
const POWER_DETAIL_MST_EDGE_CAP = 5;
/** 异步路径每层尝试最多候选折线数（已按长度排序） */
const ASYNC_MAX_CANDIDATES = 64;
/** 单跳跨所有层尝试的候选硬上限（防 3×88=264 拖死） */
const HOP_CAND_BUDGET = 64;
/** 长跨/NRST 单跳候选上限 */
const HOP_CAND_BUDGET_LONG = 96;
/** 电源单跳候选上限（含失败 fanout，必须小） */
const POWER_HOP_CAND_BUDGET = 16;
/** 单跳最多跑几次 maze（含 light） */
const HOP_MAZE_MAX = 2;
/** maze 至少需要剩余墙时间，否则跳过 */
const MAZE_MIN_REMAIN_MS = 90;
/** Room/Poly/Gridless 重型兜底：剩余墙不足则跳过（防 THREAD_BLOCK_3S/6S） */
const HEAVY_FALLBACK_MIN_REMAIN_MS = 120;
/** 单引擎硬切片上限（ms），超则中止该引擎 */
const ROOM_HARD_BUDGET_MS = 100;
const POLY_HARD_BUDGET_MS = 100;
const GRIDLESS_HARD_BUDGET_MS = 140;
/** pad 占优早切阈值：少于此数不切 maze */
const MAZE_CUT_MIN_TRIES = 8;
/** 链顺序变体上限（nn / reverse / mst…） */
const ASYNC_MAX_CHAIN_VARIANTS = 2;
/** 多脚网（≥该焊盘数）跳过链变体，直接 MST */
const MST_ONLY_PAD_THRESHOLD = 5;
/** 未连通 rip-up 修复轮次 / 连续无进展停（无 Agent 时本地用；有 LLM 时改走大脑环） */
const INCOMPLETE_REPAIR_ROUNDS = 4;
const INCOMPLETE_REPAIR_STALL = 3;
/** LLM 大脑修复环：strategyOnFail + salvage 交替，解决大多数未布通 */
const LLM_BRAIN_REPAIR_ROUNDS = 4;
const LLM_BRAIN_STALL = 2;
/** XTAL 折线走廊：折点超出 a–b 盒扩边后的惩罚半径 */
const XTAL_CORRIDOR_PAD = 280;
/** 邻脚 U 绕：短 hop 判定（晶体脚距约 120） */
const SIBLING_DETOUR_MAX_SPAN = 420;
/** XTAL 网跨板 U 绕（MCU→晶体）允许更长跨度 */
const XTAL_SIBLING_DETOUR_MAX_SPAN = 1600;
/** 邻脚绕线候选上限（须小；超时后禁止再跑） */
const SIBLING_DETOUR_CAND_CAP = 12;
/** 超时后晶体短绕硬上限（防 tryCommit+fanout 再烧数秒） */
const SIBLING_DETOUR_CAND_CAP_TIMEOUT = 3;
/** 剩余墙时间不足时改用轻量候选（跳过通道扫描） */
const HOP_LITE_REMAIN_MS = 140;
/** 超时后 sibling/bypass 额外宽限（ms），到点立刻停 */
const HOP_POST_TIMEOUT_GRACE_MS = 50;
/** 星形 hub 兜底：至少这么多焊盘才启用 */
const STAR_HUB_MIN_PADS = 4;
/** J1/排针 escape：允许的最大跨度（器件→连接器） */
const CONNECTOR_ESCAPE_MAX_SPAN = 2800;
/** J1 escape 候选上限 */
const CONNECTOR_ESCAPE_CAND_CAP = 16;
/** 电源网 stitch：每网最多补几条飞线（详细 MST 已部分连通，避免再烧 32×hop） */
const POWER_STITCH_EDGE_CAP = 16;

/** 全局通道指南（详细布线候选偏好）；单次 autoRoute 生命周期 */
let activeGlobalGuides: Map<string, GlobalNetGuide> | null = null;

/** 让出主线程：必须回到 EventHandler，否则 THREAD_BLOCK_3S/6S */
function yieldToUi(): Promise<void> {
  return new Promise<void>((resolve: () => void) => {
    setTimeout((): void => {
      resolve();
    }, UI_YIELD_MS);
  });
}

/** tryCommit 内 fanout/via nudge 的本地截止：禁止吃光整段 hop 墙 */
function fanoutDeadlineMs(netName: string, hopDeadlineMs?: number): number {
  let budget = SIGNAL_FANOUT_BUDGET_MS;
  if (isPowerNetName(netName)) {
    budget = POWER_FANOUT_BUDGET_MS;
  } else if (isBusNetName(netName) || isXtalNetName(netName)) {
    budget = BUS_FANOUT_BUDGET_MS;
  }
  const local = Date.now() + budget;
  if (hopDeadlineMs !== undefined && hopDeadlineMs > 0) {
    return Math.min(hopDeadlineMs, local);
  }
  return local;
}

async function yieldIfSliceOver(sliceStart: number): Promise<number> {
  if (Date.now() - sliceStart >= UI_SLICE_MS) {
    await yieldToUi();
    return Date.now();
  }
  return sliceStart;
}

/** 无向边键：跨链变体/MST 跳过已知失败 hop */
function undirectedEdgeKey(a: Point2D, b: Point2D): string {
  const ax = Math.round(a.x);
  const ay = Math.round(a.y);
  const bx = Math.round(b.x);
  const by = Math.round(b.y);
  if (ax < bx || (ax === bx && ay <= by)) {
    return `${ax},${ay}|${bx},${by}`;
  }
  return `${bx},${by}|${ax},${ay}`;
}

function snap(v: number, grid: number): number {
  if (grid <= 0) {
    return v;
  }
  return Math.round(v / grid) * grid;
}

function dist(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function pathLength(pts: Point2D[]): number {
  let len = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    len += dist(pts[i], pts[i + 1]);
  }
  return len;
}

/** 斜边拆成纯正交折线，避免同层斜线穿越漏检/误入 V 层 */
function expandPathToManhattan(path: Point2D[], preferHFirst: boolean): Point2D[] {
  if (path.length < 2) {
    return path.slice();
  }
  const out: Point2D[] = [{ x: path[0].x, y: path[0].y }];
  for (let i = 1; i < path.length; i++) {
    const a = out[out.length - 1];
    const b = path[i];
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    if (dx < 0.5 || dy < 0.5) {
      if (dist(a, b) >= 0.5) {
        out.push({ x: b.x, y: b.y });
      }
      continue;
    }
    const mid: Point2D = preferHFirst
      ? { x: b.x, y: a.y }
      : { x: a.x, y: b.y };
    if (dist(a, mid) >= 0.5) {
      out.push(mid);
    }
    out.push({ x: b.x, y: b.y });
  }
  return out;
}

function compressPathPoints(path: Point2D[]): Point2D[] {
  const pts: Point2D[] = [{ x: path[0].x, y: path[0].y }];
  for (let i = 1; i < path.length; i++) {
    if (dist(pts[pts.length - 1], path[i]) >= 0.5) {
      pts.push({ x: path[i].x, y: path[i].y });
    }
  }
  return pts;
}

function collectNetPads(doc: PcbDocument): Map<string, NetPadGroup> {
  const map: Map<string, NetPadGroup> = new Map();
  for (const fp of doc.footprints) {
    // 安装孔仅占网络名供铺铜，不参与 L 型链式布线（避免地线绕四角）
    if (fp.defId === 'FP_MOUNT' || (fp.refDes.length >= 2 && fp.refDes.charAt(0) === 'H' &&
      fp.refDes.charCodeAt(1) >= 48 && fp.refDes.charCodeAt(1) <= 57)) {
      continue;
    }
    const isConnector = fp.refDes === 'J1' || fp.defId.indexOf('FP_PINHDR_') === 0;
    for (const pad of fp.pads) {
      const nid = pad.netId ?? '';
      if (nid.length === 0) {
        continue;
      }
      const nname = pad.netName ?? '';
      let grp = map.get(nid);
      if (!grp) {
        grp = { netId: nid, netName: nname, points: [], connectorPoints: [] };
        map.set(nid, grp);
      }
      const wp = padWorldPosition(fp, pad);
      if (isConnector) {
        grp.connectorPoints.push(wp);
      } else {
        grp.points.push(wp);
      }
    }
  }
  return map;
}

function netPadTotal(grp: NetPadGroup): number {
  return grp.points.length + grp.connectorPoints.length;
}

function netCentroid(grp: NetPadGroup): Point2D {
  const all: Point2D[] = [];
  for (let i = 0; i < grp.points.length; i++) {
    all.push(grp.points[i]);
  }
  for (let i = 0; i < grp.connectorPoints.length; i++) {
    all.push(grp.connectorPoints[i]);
  }
  if (all.length === 0) {
    return { x: 0, y: 0 };
  }
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < all.length; i++) {
    sx += all[i].x;
    sy += all[i].y;
  }
  return { x: sx / all.length, y: sy / all.length };
}

/** 该网是否已有任意铜（走线/过孔）。注意：有铜≠全连通，跳过布线请用 netStillOpen。 */
function netAlreadyRouted(doc: PcbDocument, netId: string): boolean {
  for (const trk of doc.tracks) {
    if (trk.netId === netId) {
      return true;
    }
  }
  for (const via of doc.vias) {
    if (via.netId === netId) {
      return true;
    }
  }
  return false;
}

/** 飞线残留的网（尚需布线）；有 stub/fanout 过孔但未全通时仍会在集合中 */
function openNetIdSet(doc: PcbDocument): Set<string> {
  const rats = buildRatsnest(doc);
  const open: Set<string> = new Set();
  for (let i = 0; i < rats.length; i++) {
    open.add(rats[i].netId);
  }
  return open;
}

function netStillOpen(open: Set<string>, netId: string): boolean {
  return open.has(netId);
}

function addSegment(doc: PcbDocument, layer: PcbLayerId, a: Point2D, b: Point2D,
  netId: string, netName: string, width: number): number {
  if (dist(a, b) < 0.5) {
    return 0;
  }
  const track: PcbTrack = {
    id: IdUtil.generate('trk'),
    layer,
    start: { x: a.x, y: a.y },
    end: { x: b.x, y: b.y },
    width,
    netId,
    netName
  };
  doc.tracks.push(track);
  return 1;
}

function viaDiameter(doc: PcbDocument): number {
  return doc.metadata.designRules.minViaDrill + 8;
}

function addThroughVia(doc: PcbDocument, pos: Point2D, netId: string, netName: string,
  fromLayer?: PcbLayerId, toLayer?: PcbLayerId): void {
  const copper = copperLayersFromStack(doc.layerStack);
  const fl = fromLayer !== undefined ? fromLayer : (copper.length > 0 ? copper[0] : PcbLayerId.F_CU);
  const tl = toLayer !== undefined ? toLayer : (copper.length > 0 ? copper[copper.length - 1] : PcbLayerId.B_CU);
  let classDrill = 0;
  let classDia = 0;
  if (netId.length > 0) {
    for (const n of doc.nets) {
      if (n.id === netId) {
        const nc = findNetClass(doc, n.classId);
        classDia = nc.viaDiameter;
        classDrill = nc.viaDrill;
        break;
      }
    }
  }
  const spec = resolveViaGeometry(doc, fl, tl, classDrill, classDia);
  const via: PcbVia = {
    id: IdUtil.generate('via'),
    position: { x: pos.x, y: pos.y },
    drill: spec.drill,
    diameter: spec.diameter,
    netId,
    netName,
    layers: spec.layers,
    kind: spec.kind
  };
  doc.vias.push(via);
}

interface GndNetRef {
  id: string;
  name: string;
}

function findGndNet(doc: PcbDocument): GndNetRef | null {
  for (let i = 0; i < doc.nets.length; i++) {
    if (isGndNetName(doc.nets[i].name)) {
      const ref: GndNetRef = { id: doc.nets[i].id, name: doc.nets[i].name };
      return ref;
    }
  }
  return null;
}

/** 信号换层 via 旁补 GND 回流过孔（间距约 2~3×via）；受 maxAdd 帽限 */
function addReturnPathViasNear(
  doc: PcbDocument,
  viaPositions: Point2D[],
  grid: number,
  viaDia: number,
  viaLayers: PcbLayerId[],
  maxAdd: number = 64
): number {
  const gnd = findGndNet(doc);
  if (gnd === null || viaPositions.length === 0 || maxAdd <= 0) {
    return 0;
  }
  let added = 0;
  const offset = Math.max(viaDia * 2.5, grid * 6);
  const dirs: number[][] = [
    [offset, 0], [-offset, 0], [0, offset], [0, -offset],
    [offset, offset], [-offset, offset], [offset, -offset], [-offset, -offset]
  ];
  for (let i = 0; i < viaPositions.length; i++) {
    if (added >= maxAdd) {
      break;
    }
    const sp = viaPositions[i];
    let has = false;
    for (let vi = 0; vi < doc.vias.length; vi++) {
      const v = doc.vias[vi];
      if (v.netId === gnd.id && dist(v.position, sp) <= offset * 1.2) {
        has = true;
        break;
      }
    }
    if (has) {
      continue;
    }
    for (let d = 0; d < dirs.length; d++) {
      const cand: Point2D = {
        x: Math.round((sp.x + dirs[d][0]) / grid) * grid,
        y: Math.round((sp.y + dirs[d][1]) / grid) * grid
      };
      if (!viaClearAt(doc, cand, gnd.id, viaDia, viaLayers, doc.tracks, doc.vias)) {
        continue;
      }
      addThroughVia(doc, cand, gnd.id, gnd.name);
      added++;
      break;
    }
  }
  if (added > 0) {
    tracePcb('RETURN_VIA', `added=${added} nearSignalVias=${viaPositions.length}`);
  }
  return added;
}

/**
 * 详细布线全部完成后再补回流过孔，避免途中 GND via 毒化 fanout 走廊
 * （曾导致 fanout_via_block / hop_deadline 连锁失败）。
 */
function addDeferredReturnVias(doc: PcbDocument, grid: number, maxAdd: number): number {
  const gnd = findGndNet(doc);
  if (gnd === null || maxAdd <= 0) {
    return 0;
  }
  const viaDia = viaDiameter(doc);
  const copper = copperLayersFromStack(doc.layerStack);
  const viaLayers = copper.length > 0 ? copper.slice() : [PcbLayerId.F_CU, PcbLayerId.B_CU];
  const offset = Math.max(viaDia * 2.5, grid * 6);
  const signalPos: Point2D[] = [];
  for (let i = 0; i < doc.vias.length; i++) {
    const v = doc.vias[i];
    if (v.netId.length === 0 || v.netId === gnd.id) {
      continue;
    }
    if (isPowerNetName(v.netName || '')) {
      continue;
    }
    let hasGnd = false;
    for (let j = 0; j < doc.vias.length; j++) {
      const g = doc.vias[j];
      if (g.netId === gnd.id && dist(g.position, v.position) <= offset * 1.2) {
        hasGnd = true;
        break;
      }
    }
    if (!hasGnd) {
      const p: Point2D = { x: v.position.x, y: v.position.y };
      signalPos.push(p);
    }
  }
  if (signalPos.length === 0) {
    return 0;
  }
  // 优先靠近板心的信号 via（外围回流价值更高且走廊更宽）
  signalPos.sort((a: Point2D, b: Point2D) => {
    const ca = Math.abs(a.x) + Math.abs(a.y);
    const cb = Math.abs(b.x) + Math.abs(b.y);
    return ca - cb;
  });
  const n = addReturnPathViasNear(doc, signalPos, grid, viaDia, viaLayers, maxAdd);
  if (n > 0) {
    tracePcb('RETURN_VIA_POST', `added=${n} candidates=${signalPos.length} cap=${maxAdd}`);
  }
  return n;
}

function isGndNetName(netName: string): boolean {
  const nm = netName.toUpperCase();
  return nm === 'GND' || nm === 'VSS' || nm === 'AGND';
}

function isPowerNetName(netName: string): boolean {
  const nm = netName.toUpperCase();
  return isGndNetName(nm) || nm === 'VCC' || nm === 'VDD' || nm === 'VEE' ||
    nm === 'VOUT' || nm === 'REG_IN' || nm === 'VIN' || nm === 'VIN_SRC' ||
    nm.indexOf('VCC') === 0 || nm.indexOf('VDD') === 0 || nm.indexOf('VIN') === 0;
}

/** 晶体/晶振相关网：邻脚 via_block 需 U 绕，且值得早切 light maze */
function isXtalNetName(netName: string): boolean {
  const nm = netName.toUpperCase();
  return nm.indexOf('XTAL') >= 0 || nm.indexOf('OSC') >= 0 || nm.indexOf('CLK') >= 0;
}

function isNrstNetName(netName: string): boolean {
  return netName.toUpperCase().indexOf('NRST') >= 0 ||
    netName.toUpperCase().indexOf('RESET') >= 0;
}

/** LED 指示灯网（可挂 J1）：须细线，且带连接器时延后布 */
function isLedNetName(netName: string): boolean {
  return netName.toUpperCase().indexOf('LED') >= 0;
}

/** 跨 MCU 总线（L*_R）：多脚星型，须早于 XTAL 占通道 */
function isBusNetName(netName: string): boolean {
  const nm = netName.toUpperCase();
  if (nm.indexOf('LED') >= 0 || nm.indexOf('XTAL') >= 0 || nm.indexOf('NRST') >= 0) {
    return false;
  }
  // L0_R / L4_R 等：以 _R 结尾的短名总线
  if (nm.length >= 3 && nm.charAt(nm.length - 2) === '_' && nm.charAt(nm.length - 1) === 'R') {
    return true;
  }
  return false;
}

/** XTAL1/XTAL2 同前缀 stem，用于成对排序与平行走廊 */
function xtalPairStem(netName: string): string {
  const nm = netName.toUpperCase();
  if (nm.endsWith('XTAL2') || nm.endsWith('XTAL1')) {
    return nm.substring(0, nm.length - 1);
  }
  if (nm.endsWith('OSC2') || nm.endsWith('OSC1')) {
    return nm.substring(0, nm.length - 1);
  }
  return nm;
}

function isXtal2NetName(netName: string): boolean {
  const nm = netName.toUpperCase();
  return nm.indexOf('XTAL2') >= 0 || nm.indexOf('OSC2') >= 0;
}

/** 超短局部信号（仅 LED 等）：可排在 VCC 之前。XTAL/NRST 不再超前，避免横墙堵走廊 */
function isUltraLocalSignal(netName: string, edge: number, pads: number): boolean {
  if (isPowerNetName(netName) || isXtalNetName(netName) || isNrstNetName(netName)) {
    return false;
  }
  if (isBusNetName(netName)) {
    return false;
  }
  if (edge <= 350) {
    return true;
  }
  // 双焊盘极短（如 L*_LED）
  if (pads <= 2 && edge <= 500) {
    return true;
  }
  return false;
}

/** 单跳动态硬墙：NRST/长跨抬高；电源/地网强制短墙防 ANR */
function hopWallMsFor(netName: string, a: Point2D, b: Point2D): number {
  if (isPowerNetName(netName)) {
    return POWER_HOP_WALL_MS;
  }
  const span = dist(a, b);
  if (isNrstNetName(netName) || span > 1500) {
    return PAIR_HOP_WALL_LONG_MS;
  }
  if (isBusNetName(netName) || span > 800) {
    return Math.max(PAIR_HOP_WALL_MS, 700);
  }
  // XTAL 常卡 hop_deadline（绕障+双端 fanout）；给接近长跨墙，仍 ≤ PAIR_HOP_WALL_LONG_MS
  if (isXtalNetName(netName) && span > 400) {
    return Math.max(PAIR_HOP_WALL_MS, 720);
  }
  return PAIR_HOP_WALL_MS;
}

function hopCandBudgetFor(netName: string, a: Point2D, b: Point2D): number {
  if (isPowerNetName(netName)) {
    return POWER_HOP_CAND_BUDGET;
  }
  const span = dist(a, b);
  if (isNrstNetName(netName) || isBusNetName(netName) || span > 800) {
    return Math.min(HOP_CAND_BUDGET_LONG, 48);
  }
  // XTAL 绕障候选偏少时易早死；与总线同档
  if (isXtalNetName(netName) && span > 400) {
    return Math.min(HOP_CAND_BUDGET_LONG, 48);
  }
  return Math.min(HOP_CAND_BUDGET, 36);
}

function hopMazeMaxFor(netName: string): number {
  if (isNrstNetName(netName) || isXtalNetName(netName) || isBusNetName(netName)) {
    return Math.max(HOP_MAZE_MAX, 2);
  }
  return HOP_MAZE_MAX;
}

/** 当前 F8 运行期内的 LLM 层角色 / 走廊偏向（无 agent 时为 null） */
let activeAgentLayerRoles: Record<string, PcbLayerRole> | null = null;
let activeAgentCorridorBias: Record<string, PcbCorridorBias> | null = null;
/** LLM force_hv / swap_hv：netId|name → 强制层对 */
let activeAgentForceHv: Record<string, NetLayerPair> | null = null;
/**
 * 本轮可用的信号 H/V 层对（Cu≥4 多内层）。
 * pair0=首对(通常 In1/In2)，pair1=次对(In3/In4)…；失败时可溢出到其它对。
 */
let activeSignalLayerPairs: NetLayerPair[] = [];
/** 与 activeSignalLayerPairs 平行：每对已成功服务的网次数（负载均衡） */
let signalPairUseCount: number[] = [];
/** 本轮 AUTO_PAIR_FAIL 诊断（供 Strategy.onFail / Critic） */
let agentPairFailDigests: string[] = [];
const AGENT_FAIL_DIGEST_CAP = 48;
const AGENT_OPS_CAP = 36;

function classifyPairFailKind(reason: string): string {
  if (reason.indexOf('track_cross') >= 0) {
    return 'track_cross';
  }
  if (reason.indexOf('track_block') >= 0) {
    return 'track_block';
  }
  if (reason.indexOf('fanout_via_block') >= 0) {
    return 'fanout_via_block';
  }
  if (reason.indexOf('via_block') >= 0) {
    return 'via_block';
  }
  if (reason.indexOf('pad_block') >= 0) {
    return 'pad_block';
  }
  if (reason.indexOf('hop_deadline') >= 0) {
    return 'hop_deadline';
  }
  if (reason.length === 0) {
    return 'unknown';
  }
  const sp = reason.indexOf(' ');
  return sp > 0 ? reason.substring(0, sp) : reason.substring(0, Math.min(24, reason.length));
}

function extractBlockerToken(reason: string): string {
  const netKey = 'net=';
  const ni = reason.indexOf(netKey);
  if (ni >= 0) {
    let end = ni + netKey.length;
    while (end < reason.length) {
      const c = reason.charAt(end);
      if (c === ' ' || c === '@' || c === '(') {
        break;
      }
      end++;
    }
    return reason.substring(ni + netKey.length, end);
  }
  // pad_block J1.8(L0_LED)@...
  const lp = reason.indexOf('(');
  const rp = reason.indexOf(')');
  if (lp >= 0 && rp > lp + 1) {
    return reason.substring(lp + 1, rp);
  }
  return '-';
}

function extractLayerToken(reason: string): string {
  const onKey = ' on ';
  const oi = reason.indexOf(onKey);
  if (oi < 0) {
    return '-';
  }
  let end = oi + onKey.length;
  while (end < reason.length) {
    const c = reason.charAt(end);
    if (c === ' ' || c === '@') {
      break;
    }
    end++;
  }
  return reason.substring(oi + onKey.length, end);
}

function recordAgentPairFail(netId: string, netName: string, reason: string): void {
  if (agentPairFailDigests.length >= AGENT_FAIL_DIGEST_CAP) {
    return;
  }
  const kind = classifyPairFailKind(reason);
  const blocker = extractBlockerToken(reason);
  const layer = extractLayerToken(reason);
  const shortReason = reason.length > 96 ? reason.substring(0, 96) : reason;
  const label = netName.length > 0 ? netName : netId;
  agentPairFailDigests.push(
    `${label}|${kind}|blocker=${blocker}|layer=${layer}|${shortReason}`);
}

/**
 * 按铜层数选 H/V 层：
 * - 地网：底层
 * - 2 层：信号/电源顶层
 * - ≥4 层：信号按网类分流到多对内层（XTAL→pair0，Bus/LED/NRST→pair1）
 * - agentLayerRoles：LLM 层角色优先（校验通过后），仍走多对分流
 */
function findLayerForRole(roles: Record<string, PcbLayerRole>, role: PcbLayerRole): PcbLayerId | null {
  const keys = Object.keys(roles);
  for (let i = 0; i < keys.length; i++) {
    if (roles[keys[i]] === role) {
      return keys[i] as PcbLayerId;
    }
  }
  return null;
}

/** 按叠层顺序收集某角色的全部铜层（不再只取第一个） */
function findLayersForRole(
  roles: Record<string, PcbLayerRole>,
  role: PcbLayerRole,
  copper: PcbLayerId[]
): PcbLayerId[] {
  const out: PcbLayerId[] = [];
  for (let i = 0; i < copper.length; i++) {
    if (roles[copper[i] as string] === role) {
      out.push(copper[i]);
    }
  }
  return out;
}

function hashNetKey(netId: string, netName: string): number {
  let h = 0;
  const key = netId.length > 0 ? netId : netName;
  for (let i = 0; i < key.length; i++) {
    h = ((h * 31) + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * 从 layerRoles 或裸铜叠层构建信号 H/V 对：
 * Cu=6 → [(In1,In2), (In3,In4)]；无 roles 时按内层两两配对。
 */
function buildSignalLayerPairs(
  roles: Record<string, PcbLayerRole> | null,
  copper: PcbLayerId[]
): NetLayerPair[] {
  const pairs: NetLayerPair[] = [];
  if (copper.length < 4) {
    return pairs;
  }
  if (roles !== null) {
    const hs = findLayersForRole(roles, 'signal_h', copper);
    const vs = findLayersForRole(roles, 'signal_v', copper);
    const n = Math.max(hs.length, vs.length);
    for (let i = 0; i < n; i++) {
      if (hs.length === 0 && vs.length === 0) {
        break;
      }
      const hi = i < hs.length
        ? hs[i]
        : (hs.length > 0 ? hs[hs.length - 1] : (vs.length > 0 ? vs[Math.min(i, vs.length - 1)] : copper[1]));
      const vi = i < vs.length
        ? vs[i]
        : (vs.length > 0 ? vs[vs.length - 1] : hi);
      pairs.push({ h: hi, v: vi });
    }
  }
  if (pairs.length === 0) {
    const innerEnd = copper.length - 1;
    for (let i = 1; i + 1 < innerEnd; i += 2) {
      pairs.push({ h: copper[i], v: copper[i + 1] });
    }
    if (pairs.length === 0 && copper.length >= 4) {
      pairs.push({ h: copper[1], v: copper[2] });
    }
  }
  return pairs;
}

function refreshActiveSignalPairs(
  copper: PcbLayerId[],
  roles?: Record<string, PcbLayerRole> | null
): void {
  const r = roles !== undefined ? roles : activeAgentLayerRoles;
  activeSignalLayerPairs = buildSignalLayerPairs(r, copper);
  signalPairUseCount = [];
  for (let i = 0; i < activeSignalLayerPairs.length; i++) {
    signalPairUseCount.push(0);
  }
}

function noteSignalPairUse(pair: NetLayerPair): void {
  for (let i = 0; i < activeSignalLayerPairs.length; i++) {
    if (activeSignalLayerPairs[i].h === pair.h && activeSignalLayerPairs[i].v === pair.v) {
      signalPairUseCount[i] = (signalPairUseCount[i] ?? 0) + 1;
      return;
    }
  }
}

function pairUseCountOf(pair: NetLayerPair): number {
  for (let i = 0; i < activeSignalLayerPairs.length; i++) {
    if (activeSignalLayerPairs[i].h === pair.h && activeSignalLayerPairs[i].v === pair.v) {
      return signalPairUseCount[i] ?? 0;
    }
  }
  return 0;
}

/**
 * 网类分流 + 负载/拥塞：XTAL 钉 pair0；Bus/LED/NRST 偏 pair1；
 * 均在候选对上叠加 useCount 与走廊密度，避免 In1/In2 吃满而 In3/In4 空转。
 */
function pickClassSignalPair(
  pairs: NetLayerPair[],
  netName: string,
  netId: string,
  congMap?: GlobalCongestionMap | null,
  sampleA?: Point2D | null,
  sampleB?: Point2D | null
): NetLayerPair | null {
  if (pairs.length === 0) {
    return null;
  }
  if (pairs.length === 1) {
    return pairs[0];
  }
  // 候选下标：XTAL 仅 pair0；长跨总线类优先 pair1+；其它全开
  const cand: number[] = [];
  if (isXtalNetName(netName)) {
    cand.push(0);
  } else if (isBusNetName(netName) || isLedNetName(netName) || isNrstNetName(netName)) {
    for (let i = 1; i < pairs.length; i++) {
      cand.push(i);
    }
    if (cand.length === 0) {
      cand.push(0);
    }
  } else {
    for (let i = 0; i < pairs.length; i++) {
      cand.push(i);
    }
  }
  const pts: Point2D[] | null =
    (sampleA !== undefined && sampleA !== null && sampleB !== undefined && sampleB !== null)
      ? [sampleA, sampleB]
      : null;
  let bestIdx = cand[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (let ci = 0; ci < cand.length; ci++) {
    const i = cand[ci];
    const p = pairs[i];
    let score = pairUseCountOf(p) * 12;
    if (congMap !== undefined && congMap !== null && pts !== null) {
      score += estimateNetCongestionRisk(congMap, p.h, pts) +
        estimateNetCongestionRisk(congMap, p.v, pts);
    } else {
      score += (hashNetKey(netId, netName) + i * 17) % 5;
    }
    // Bus/LED：略偏次对（未计入 use 时）
    if ((isBusNetName(netName) || isLedNetName(netName) || isNrstNetName(netName)) && i === 1) {
      score -= 4;
    }
    if (score < bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return pairs[bestIdx];
}

function layerPairFromAgentRoles(
  roles: Record<string, PcbLayerRole>,
  netName: string,
  copper: PcbLayerId[],
  preferred: PcbLayerId,
  bias?: PcbCorridorBias | null,
  netId: string = '',
  congMap?: GlobalCongestionMap | null,
  sampleA?: Point2D | null,
  sampleB?: Point2D | null
): NetLayerPair | null {
  if (copper.length === 0) {
    return null;
  }
  if (bias !== undefined && bias !== null && bias.preferLayer !== undefined &&
    bias.preferLayer.length > 0) {
    const pref = bias.preferLayer as PcbLayerId;
    let ok = false;
    for (let i = 0; i < copper.length; i++) {
      if (copper[i] === pref) {
        ok = true;
        break;
      }
    }
    if (ok) {
      const pairs = buildSignalLayerPairs(roles, copper);
      const classPair = pickClassSignalPair(pairs, netName, netId, congMap, sampleA, sampleB);
      const alt = classPair !== null
        ? (classPair.h === pref ? classPair.v : classPair.h)
        : (findLayerForRole(roles, 'signal_v') ?? findLayerForRole(roles, 'signal_h') ?? pref);
      return { h: pref, v: alt };
    }
  }
  if (isGndNetName(netName)) {
    const g = findLayerForRole(roles, 'gnd_bus') ?? copper[copper.length - 1];
    return { h: g, v: g };
  }
  if (isPowerNetName(netName)) {
    const p = findLayerForRole(roles, 'vcc_bus') ??
      findLayerForRole(roles, 'power_h') ??
      findLayerForRole(roles, 'power_v');
    if (p !== null) {
      return { h: p, v: p };
    }
  }
  const pairs = buildSignalLayerPairs(roles, copper);
  const picked = pickClassSignalPair(pairs, netName, netId, congMap, sampleA, sampleB);
  if (picked !== null) {
    return picked;
  }
  const h = findLayerForRole(roles, 'signal_h') ??
    findLayerForRole(roles, 'stub') ?? preferred;
  const v = findLayerForRole(roles, 'signal_v') ??
    findLayerForRole(roles, 'signal_h') ?? h;
  return { h, v };
}

function layerPairForNet(doc: PcbDocument, preferred: PcbLayerId, netName: string,
  netId: string = '', congMap?: GlobalCongestionMap | null,
  sampleA?: Point2D | null, sampleB?: Point2D | null,
  agentRoles?: Record<string, PcbLayerRole> | null,
  corridorBias?: Record<string, PcbCorridorBias> | null): NetLayerPair {
  const copper = copperLayersFromStack(doc.layerStack);
  const top = copper.length > 0 ? copper[0] : preferred;
  if (activeAgentForceHv !== null) {
    const forced = activeAgentForceHv[netId] ?? activeAgentForceHv[netName];
    if (forced !== undefined) {
      return { h: forced.h, v: forced.v };
    }
  }
  const roles = agentRoles !== undefined && agentRoles !== null
    ? agentRoles
    : activeAgentLayerRoles;
  const biasMap = corridorBias !== undefined && corridorBias !== null
    ? corridorBias
    : activeAgentCorridorBias;
  const bias = biasMap !== null
    ? (biasMap[netId] ?? biasMap[netName] ?? null)
    : null;
  if (roles !== null) {
    const fromAgent = layerPairFromAgentRoles(
      roles, netName, copper, preferred, bias, netId, congMap, sampleA, sampleB);
    if (fromAgent !== null) {
      return fromAgent;
    }
  }
  // 注意：不再因短采样强制 F.Cu——L0_LED 器件脚短但 J1 长跳会撞 QFP 浮空焊盘。
  // 短跳顶层由 routeNetGroupAsync 仅对 core 启用。
  const bot = copper.length > 0 ? copper[copper.length - 1] : PcbLayerId.B_CU;
  if (isGndNetName(netName)) {
    return { h: bot, v: bot };
  }
  if (copper.length >= 4) {
    if (isPowerNetName(netName)) {
      // 与 LocalStrategy 一致：末层 power_h（通常 B.Cu），勿占 In4 信号对
      const powerL = (roles !== null
        ? (findLayerForRole(roles, 'power_h') ?? findLayerForRole(roles, 'power_v') ??
          findLayerForRole(roles, 'vcc_bus'))
        : null) ?? bot;
      return { h: powerL, v: powerL };
    }
    // 开局按网类分流到多对内层（XTAL→pair0，Bus/LED/NRST→pair1）
    const pairs = activeSignalLayerPairs.length > 0
      ? activeSignalLayerPairs
      : buildSignalLayerPairs(roles, copper);
    const classPair = pickClassSignalPair(pairs, netName, netId, congMap, sampleA, sampleB);
    if (classPair !== null) {
      return classPair;
    }
    if (congMap !== undefined && congMap !== null) {
      const picked = pickCongestionAwareLayerPair(
        doc, congMap, preferred, netName, netId,
        sampleA ?? null, sampleB ?? null,
        false, false);
      return { h: picked.h, v: picked.v };
    }
    const innerCount = Math.max(copper.length - 2, 1);
    const i0 = hashNetKey(netId, netName) % innerCount;
    const i1 = innerCount > 1 ? ((i0 + 1) % innerCount) : i0;
    return { h: copper[1 + i0], v: copper[1 + i1] };
  }
  return { h: top, v: top };
}

/** 按 LLM netOrder 重排网组；未出现的网保持相对序附后 */
function applyAgentNetOrder(groups: NetPadGroup[], netOrder: string[]): NetPadGroup[] {
  if (netOrder.length === 0) {
    return groups;
  }
  const byId: Map<string, NetPadGroup> = new Map();
  const byName: Map<string, NetPadGroup> = new Map();
  for (let i = 0; i < groups.length; i++) {
    byId.set(groups[i].netId, groups[i]);
    byName.set(groups[i].netName, groups[i]);
  }
  const out: NetPadGroup[] = [];
  const used: Set<string> = new Set();
  for (let i = 0; i < netOrder.length; i++) {
    const key = netOrder[i];
    const g = byId.get(key) ?? byName.get(key);
    if (g !== undefined && !used.has(g.netId)) {
      out.push(g);
      used.add(g.netId);
    }
  }
  for (let i = 0; i < groups.length; i++) {
    if (!used.has(groups[i].netId)) {
      out.push(groups[i]);
    }
  }
  return out;
}

function sortNetIdsByAgentOrder(ids: string[], order: string[] | undefined,
  netPads: Map<string, NetPadGroup>): string[] {
  if (order === undefined || order.length === 0) {
    return ids;
  }
  const rank: Map<string, number> = new Map();
  for (let i = 0; i < order.length; i++) {
    rank.set(order[i], i);
  }
  const copy = ids.slice();
  copy.sort((a: string, b: string) => {
    const ga = netPads.get(a);
    const gb = netPads.get(b);
    const ra = rank.has(a) ? rank.get(a)! :
      (ga !== undefined && rank.has(ga.netName) ? rank.get(ga.netName)! : 9999);
    const rb = rank.has(b) ? rank.get(b)! :
      (gb !== undefined && rank.has(gb.netName) ? rank.get(gb.netName)! : 9999);
    return ra - rb;
  });
  return copy;
}

function buildAgentNetSummaries(groups: NetPadGroup[]): string[] {
  const lines: string[] = [];
  for (let i = 0; i < groups.length && i < 48; i++) {
    const g = groups[i];
    lines.push(`${g.netId}|${g.netName}|pads=${netPadTotal(g)}`);
  }
  return lines;
}

/** ratsnest 可能对同一网多段飞线；Agent 提示去重 */
function uniqueFailNetLines(netIds: string[], netPads: Map<string, NetPadGroup>,
  maxLines: number): string[] {
  const lines: string[] = [];
  const seen: Record<string, boolean> = {};
  for (let i = 0; i < netIds.length && lines.length < maxLines; i++) {
    const nid = netIds[i];
    if (seen[nid]) {
      continue;
    }
    seen[nid] = true;
    const g = netPads.get(nid);
    lines.push(g !== undefined ? `${nid}|${g.netName}` : nid);
  }
  return lines;
}

/** 同一网同类阻挡去重，保留最近一条 */
function uniqueAgentErrorDigests(maxLines: number): string[] {
  const out: string[] = [];
  const seen: Record<string, boolean> = {};
  for (let i = agentPairFailDigests.length - 1; i >= 0 && out.length < maxLines; i--) {
    const line = agentPairFailDigests[i];
    const parts = line.split('|');
    const key = parts.length >= 3 ? `${parts[0]}|${parts[1]}|${parts[2]}` : line;
    if (seen[key]) {
      continue;
    }
    seen[key] = true;
    out.push(line);
  }
  out.reverse();
  return out;
}

interface BoardAabb {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function boardAabb(doc: PcbDocument): BoardAabb {
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  const pts = doc.boardOutline !== undefined && doc.boardOutline.points !== undefined
    ? doc.boardOutline.points : [];
  if (pts.length === 0) {
    const empty: BoardAabb = { minX: 0, minY: 0, maxX: 2500, maxY: 4200 };
    return empty;
  }
  minX = pts[0].x;
  minY = pts[0].y;
  maxX = pts[0].x;
  maxY = pts[0].y;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].x < minX) {
      minX = pts[i].x;
    }
    if (pts[i].y < minY) {
      minY = pts[i].y;
    }
    if (pts[i].x > maxX) {
      maxX = pts[i].x;
    }
    if (pts[i].y > maxY) {
      maxY = pts[i].y;
    }
  }
  const box: BoardAabb = { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  return box;
}

function pointInBoardSoft(doc: PcbDocument, x: number, y: number): boolean {
  const bb = boardAabb(doc);
  const m = 50;
  return x >= bb.minX - m && x <= bb.maxX + m && y >= bb.minY - m && y <= bb.maxY + m;
}

function buildAgentRatsDetails(doc: PcbDocument, maxLines: number): string[] {
  const rats = buildRatsnest(doc);
  const lines: string[] = [];
  const seen: Record<string, boolean> = {};
  for (let i = 0; i < rats.length && lines.length < maxLines; i++) {
    const r = rats[i];
    const key = `${r.netId}|${Math.round(r.a.x)},${Math.round(r.a.y)}|` +
      `${Math.round(r.b.x)},${Math.round(r.b.y)}`;
    if (seen[key]) {
      continue;
    }
    seen[key] = true;
    const span = Math.round(dist(r.a, r.b));
    const name = r.netName !== undefined && r.netName.length > 0 ? r.netName : r.netId;
    lines.push(
      `${name}|a=(${Math.round(r.a.x)},${Math.round(r.a.y)})|` +
      `b=(${Math.round(r.b.x)},${Math.round(r.b.y)})|span=${span}`);
  }
  return lines;
}

function buildAgentPadSamples(doc: PcbDocument, failNetIds: string[],
  netPads: Map<string, NetPadGroup>, maxLines: number): string[] {
  const lines: string[] = [];
  const want: Record<string, boolean> = {};
  for (let i = 0; i < failNetIds.length; i++) {
    want[failNetIds[i]] = true;
  }
  for (let fi = 0; fi < doc.footprints.length && lines.length < maxLines; fi++) {
    const fp = doc.footprints[fi];
    for (let pi = 0; pi < fp.pads.length && lines.length < maxLines; pi++) {
      const pad = fp.pads[pi];
      const padNet = pad.netId !== undefined ? pad.netId : '';
      if (padNet.length === 0 || !want[padNet]) {
        continue;
      }
      const g = netPads.get(padNet);
      const nm = g !== undefined ? g.netName : padNet;
      const pos = padWorldPosition(fp, pad);
      const pn = pad.number.length > 0 ? pad.number : pad.id;
      lines.push(`${nm}|${fp.refDes}.${pn}@(${Math.round(pos.x)},${Math.round(pos.y)})`);
    }
  }
  return lines;
}

function buildAgentSituationLines(doc: PcbDocument, congMap: GlobalCongestionMap | null,
  metricsHint: string): string[] {
  const copper = copperLayersFromStack(doc.layerStack);
  const bb = boardAabb(doc);
  const lines: string[] = [];
  lines.push(
    `board=(${Math.round(bb.minX)},${Math.round(bb.minY)})-` +
    `(${Math.round(bb.maxX)},${Math.round(bb.maxY)}) ` +
    `fp=${doc.footprints.length} trk=${doc.tracks.length} via=${doc.vias.length} ` +
    `Cu=${copper.length}`);
  lines.push(`copperLayers=${JSON.stringify(copper)}`);
  if (activeAgentLayerRoles !== null) {
    const keys = Object.keys(activeAgentLayerRoles);
    const parts: string[] = [];
    for (let i = 0; i < keys.length; i++) {
      parts.push(`${keys[i]}:${activeAgentLayerRoles[keys[i]]}`);
    }
    lines.push(`layerRoles=${parts.join(',')}`);
  } else {
    lines.push('layerRoles=(local default)');
  }
  if (congMap !== null) {
    const place = buildPlacementCongestionFeedback(congMap, 6);
    lines.push(
      `cong maxD=${place.maxDensity.toFixed(0)} meanD=${place.meanDensity.toFixed(1)} ` +
      `hotspots=${place.hotspots.length} ${place.suggestReplace ? 'HIGH' : 'ok'}`);
  }
  if (metricsHint.length > 0) {
    lines.push(`metrics ${metricsHint}`);
  }
  // 每层走线计数
  const byLayer: Record<string, number> = {};
  for (let i = 0; i < doc.tracks.length; i++) {
    const ly = doc.tracks[i].layer as string;
    byLayer[ly] = (byLayer[ly] !== undefined ? byLayer[ly] : 0) + 1;
  }
  const lyKeys = Object.keys(byLayer);
  const lyParts: string[] = [];
  for (let i = 0; i < lyKeys.length; i++) {
    lyParts.push(`${lyKeys[i]}=${byLayer[lyKeys[i]]}`);
  }
  if (lyParts.length > 0) {
    lines.push(`tracksByLayer ${lyParts.join(' ')}`);
  }
  return lines;
}

function fillAgentContextExtras(ctx: PcbAutoRouteAgentContext, doc: PcbDocument,
  netPads: Map<string, NetPadGroup>, congMap: GlobalCongestionMap | null,
  failNetIds: string[], metricsHint: string): void {
  ctx.situationLines = buildAgentSituationLines(doc, congMap, metricsHint);
  ctx.ratsDetails = buildAgentRatsDetails(doc, 28);
  ctx.padSamples = buildAgentPadSamples(doc, failNetIds, netPads, 36);
  ctx.errorDigests = uniqueAgentErrorDigests(36);
}

function resolveAgentNetId(token: string, netPads: Map<string, NetPadGroup>): string | null {
  const t = token.trim();
  if (t.length === 0) {
    return null;
  }
  if (netPads.has(t)) {
    return t;
  }
  let found: string | null = null;
  netPads.forEach((g: NetPadGroup, id: string) => {
    if (found !== null) {
      return;
    }
    if (g.netName === t) {
      found = id;
    }
  });
  return found;
}

function isPowerLikeNetName(name: string): boolean {
  const u = name.toUpperCase();
  return u === 'GND' || u === 'VCC' || u === 'VDD' || u === 'VSS' ||
    u.indexOf('GND') === 0 || u.indexOf('VCC') === 0;
}

function copperHasLayer(copper: PcbLayerId[], lid: string): boolean {
  for (let i = 0; i < copper.length; i++) {
    if ((copper[i] as string) === lid) {
      return true;
    }
  }
  return false;
}

function setForceHvForNet(netId: string, netName: string, pair: NetLayerPair): void {
  if (activeAgentForceHv === null) {
    activeAgentForceHv = {};
  }
  activeAgentForceHv[netId] = pair;
  if (netName.length > 0) {
    activeAgentForceHv[netName] = pair;
  }
}

/**
 * 执行 LLM ops：策略 + 几何（via/seg/maze），再按序重布。
 * 返回重布网数；几何失败的单条 ops 静默跳过。
 */
async function applyAgentOpsAsync(
  doc: PcbDocument,
  preferred: PcbLayerId,
  grid: number,
  width: number,
  netPads: Map<string, NetPadGroup>,
  congMap: GlobalCongestionMap | null,
  ops: PcbAutoAgentOp[],
  extraRetryOrder: string[] | undefined,
  stageTag: string
): Promise<number> {
  if (ops.length === 0) {
    return 0;
  }
  const copper = copperLayersFromStack(doc.layerStack);
  const top = copper.length > 0 ? copper[0] : preferred;
  const bot = copper.length > 0 ? copper[copper.length - 1] : preferred;
  const reroute: Set<string> = new Set();
  let executed = 0;
  let geoOk = 0;
  const n = Math.min(ops.length, AGENT_OPS_CAP);
  const lastBlock: BlockBox = { reason: '' };

  const resolveLayer = (s: string | undefined, fallback: PcbLayerId): PcbLayerId => {
    if (s !== undefined && s.length > 0 && copperHasLayer(copper, s)) {
      return s as PcbLayerId;
    }
    return fallback;
  };

  const tryPlaceVia = (pos: Point2D, netId: string, netName: string,
    fl: PcbLayerId, tl: PcbLayerId): boolean => {
    if (!pointInBoardSoft(doc, pos.x, pos.y)) {
      return false;
    }
    const dia = viaDiameter(doc);
    const layers: PcbLayerId[] = copper.length > 0 ? copper.slice() : [fl, tl];
    if (!viaClearAt(doc, pos, netId, dia, layers, doc.tracks, doc.vias)) {
      return false;
    }
    addThroughVia(doc, pos, netId, netName, fl, tl);
    return true;
  };

  const trySeg = (netId: string, netName: string, layer: PcbLayerId,
    a: Point2D, b: Point2D, w: number): boolean => {
    if (!pointInBoardSoft(doc, a.x, a.y) || !pointInBoardSoft(doc, b.x, b.y)) {
      return false;
    }
    if (dist(a, b) < 0.5) {
      return false;
    }
    const block = pathClearBlockReason(doc, layer, a, b, netId, w, doc.tracks, doc.vias);
    if (block !== null) {
      return false;
    }
    addSegment(doc, layer, a, b, netId, netName, w);
    return true;
  };

  for (let i = 0; i < n; i++) {
    const op = ops[i];
    const resolved = resolveAgentNetId(op.net, netPads);
    if (resolved === null) {
      continue;
    }
    const g = netPads.get(resolved);
    const nm = g !== undefined ? g.netName : resolved;
    const w = widthForNet(doc, resolved, nm, width, preferred);

    if (op.op === 'ripup') {
      if (isPowerLikeNetName(nm)) {
        continue;
      }
      clearNetCopper(doc, resolved);
      reroute.add(resolved);
      executed++;
      continue;
    }
    if (op.op === 'clear_reroute') {
      clearNetCopper(doc, resolved);
      reroute.add(resolved);
      executed++;
      continue;
    }
    if (op.op === 'force_hv') {
      const h = (op.h !== undefined ? op.h : '').trim();
      const v = (op.v !== undefined ? op.v : h).trim();
      if (h.length === 0 || !copperHasLayer(copper, h) || !copperHasLayer(copper, v)) {
        continue;
      }
      setForceHvForNet(resolved, nm, { h: h as PcbLayerId, v: v as PcbLayerId });
      reroute.add(resolved);
      executed++;
      continue;
    }
    if (op.op === 'swap_hv') {
      const cur = layerPairForNet(doc, preferred, nm, resolved, congMap, null, null);
      setForceHvForNet(resolved, nm, { h: cur.v, v: cur.h });
      reroute.add(resolved);
      executed++;
      continue;
    }
    if (op.op === 'via_at') {
      if (op.x === undefined || op.y === undefined) {
        continue;
      }
      const fl = resolveLayer(op.fromLayer !== undefined ? op.fromLayer : op.layer, top);
      const tl = resolveLayer(op.toLayer, bot);
      const pos: Point2D = { x: op.x, y: op.y };
      if (tryPlaceVia(pos, resolved, nm, fl, tl)) {
        reroute.add(resolved);
        executed++;
        geoOk++;
      }
      continue;
    }
    if (op.op === 'via_near') {
      if (op.x === undefined || op.y === undefined) {
        continue;
      }
      const fl = resolveLayer(op.fromLayer !== undefined ? op.fromLayer : op.layer, top);
      const tl = resolveLayer(op.toLayer, bot);
      const radii = [0, grid * 4, grid * 8, grid * 12, grid * 18, grid * 28, grid * 40];
      let placed = false;
      for (let ri = 0; ri < radii.length && !placed; ri++) {
        const r = radii[ri];
        const cands: Point2D[] = r === 0
          ? [{ x: op.x, y: op.y }]
          : [
            { x: op.x + r, y: op.y }, { x: op.x - r, y: op.y },
            { x: op.x, y: op.y + r }, { x: op.x, y: op.y - r },
            { x: op.x + r, y: op.y + r }, { x: op.x - r, y: op.y - r }
          ];
        for (let ci = 0; ci < cands.length; ci++) {
          if (tryPlaceVia(cands[ci], resolved, nm, fl, tl)) {
            placed = true;
            break;
          }
        }
      }
      if (placed) {
        reroute.add(resolved);
        executed++;
        geoOk++;
      }
      continue;
    }
    if (op.op === 'seg') {
      if (op.x === undefined || op.y === undefined || op.x2 === undefined || op.y2 === undefined) {
        continue;
      }
      const ly = resolveLayer(op.layer, preferred);
      const a: Point2D = { x: op.x, y: op.y };
      const b: Point2D = { x: op.x2, y: op.y2 };
      let ok = false;
      if (Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5) {
        ok = trySeg(resolved, nm, ly, a, b, w);
      } else {
        const mid: Point2D = { x: b.x, y: a.y };
        ok = trySeg(resolved, nm, ly, a, mid, w) && trySeg(resolved, nm, ly, mid, b, w);
        if (!ok) {
          const mid2: Point2D = { x: a.x, y: b.y };
          ok = trySeg(resolved, nm, ly, a, mid2, w) && trySeg(resolved, nm, ly, mid2, b, w);
        }
      }
      if (ok) {
        reroute.add(resolved);
        executed++;
        geoOk++;
      }
      continue;
    }
    if (op.op === 'guide_maze') {
      if (op.x === undefined || op.y === undefined || op.x2 === undefined || op.y2 === undefined) {
        continue;
      }
      const ly1 = resolveLayer(op.layer !== undefined ? op.layer : op.fromLayer, preferred);
      const ly2 = resolveLayer(op.toLayer !== undefined ? op.toLayer : op.layer, ly1);
      const a: Point2D = { x: op.x, y: op.y };
      const b: Point2D = { x: op.x2, y: op.y2 };
      const pair: NetLayerPair = { h: ly1, v: ly2 };
      lastBlock.reason = '';
      const mazeWall = hopWallMsFor(nm, a, b);
      const mazeSegs = await tryMazeCommitAsync(
        doc, pair, a, b, resolved, nm, grid, w, lastBlock, true, Date.now() + mazeWall);
      if (mazeSegs >= 0) {
        reroute.add(resolved);
        executed++;
        geoOk++;
      }
    }
  }
  if (extraRetryOrder !== undefined) {
    for (let i = 0; i < extraRetryOrder.length; i++) {
      const rid = resolveAgentNetId(extraRetryOrder[i], netPads);
      if (rid !== null) {
        reroute.add(rid);
      }
    }
  }
  const ids: string[] = [];
  reroute.forEach((id: string) => {
    ids.push(id);
  });
  const ordered = sortNetIdsByAgentOrder(ids, extraRetryOrder, netPads);
  let routed = 0;
  for (let i = 0; i < ordered.length; i++) {
    const nid = ordered[i];
    const grp = netPads.get(nid);
    if (grp === undefined || netPadTotal(grp) < 2) {
      continue;
    }
    const sa = grp.points.length > 0 ? grp.points[0] :
      (grp.connectorPoints.length > 0 ? grp.connectorPoints[0] : null);
    const sb = grp.points.length > 1 ? grp.points[grp.points.length - 1] :
      (grp.connectorPoints.length > 0 ?
        grp.connectorPoints[grp.connectorPoints.length - 1] : sa);
    const pair = layerPairForNet(doc, preferred, grp.netName, grp.netId, congMap, sa, sb);
    const ww = widthForNet(doc, grp.netId, grp.netName, width, pair.h);
    await routeNetGroupAsync(doc, pair, grp, grid, ww);
    routed++;
    await yieldToUi();
  }
  if (executed > 0 || routed > 0) {
    await finishRouteCleanupAsync(doc, stageTag);
    tracePcb('AUTO_AGENT_OPS',
      `${stageTag} ops=${executed} geo=${geoOk} reroute=${routed} forceHv=` +
      `${activeAgentForceHv !== null ? Object.keys(activeAgentForceHv).length : 0}`);
  }
  return routed;
}

async function runGeometryAgentStage(
  doc: PcbDocument,
  layer: PcbLayerId,
  grid: number,
  width: number,
  netPads: Map<string, NetPadGroup>,
  groups: NetPadGroup[],
  copper: PcbLayerId[],
  congMap: GlobalCongestionMap | null,
  agent: PcbRouteEngineHooks,
  metricsHint: string
): Promise<number> {
  const hook = agent.routingSalvage;
  if (hook === undefined) {
    return 0;
  }
  const rats = buildRatsnest(doc);
  if (rats.length === 0) {
    return 0;
  }
  const failIds: string[] = [];
  const seen: Record<string, boolean> = {};
  for (let i = 0; i < rats.length; i++) {
    if (!seen[rats[i].netId]) {
      seen[rats[i].netId] = true;
      failIds.push(rats[i].netId);
    }
  }
  const failLines = uniqueFailNetLines(failIds, netPads, 40);
  const cuIds: string[] = [];
  for (let i = 0; i < copper.length; i++) {
    cuIds.push(copper[i] as string);
  }
  const ctx: PcbAutoRouteAgentContext = {
    copperLayers: cuIds,
    netSummaries: buildAgentNetSummaries(groups),
    failSummaries: failLines,
    metricsSummary: metricsHint
  };
  fillAgentContextExtras(ctx, doc, netPads, congMap, failIds, metricsHint);
  const stage = 'routingSalvage';
  tracePcb('AUTO_AGENT_BEGIN',
    `${stage} fails=${failLines.length} rats=${ctx.ratsDetails !== undefined ? ctx.ratsDetails.length : 0}`);
  try {
    const advice = await hook(ctx);
    if (advice === null || !isTrustedAutoAdvice(advice.fromLlm, advice.fromLocal) ||
      advice.ops.length === 0) {
      tracePcb('AUTO_AGENT_APPLY', `${stage} noop`);
      return 0;
    }
    const snapT = doc.tracks.slice();
    const snapV = doc.vias.slice();
    const ratsBefore = rats.length;
    const routed = await applyAgentOpsAsync(doc, layer, grid, width, netPads, congMap,
      advice.ops, advice.retryNetOrder, 'AUTO_AGENT_SALVAGE');
    const ratsAfter = buildRatsnest(doc).length;
    // 软回滚：仅 rats 明显变差才撤销（避免 LLM 硬修进度被一刀切）
    if (ratsAfter > ratsBefore + 1) {
      doc.tracks = snapT;
      doc.vias = snapV;
      tracePcbWarn('AUTO_AGENT_OPS_ROLLBACK', `${stage} rats ${ratsBefore}→${ratsAfter}`);
      return 0;
    }
    const src = advice.fromLlm ? 'llm' : 'local';
    tracePcb('AUTO_AGENT_OK',
      `${stage} src=${src} ops=${advice.ops.length} reroute=${routed} failLeft=${ratsAfter}`);
    return Math.max(routed, ratsBefore > ratsAfter ? 1 : 0);
  } catch (e) {
    const msg = e instanceof Error ? e.message : `${e}`;
    tracePcbWarn('AUTO_AGENT_FAIL', `${stage} ${msg}`);
    return 0;
  }
}

/**
 * LLM 大脑修复环：Strategy.onFail（决策撕线/换层）→ Routing.salvage（seg/via 落铜）。
 * 有 Agent 时用此替代本地 incomplete 互撕，解决大多数未布通。
 */
async function runLlmBrainRepairLoop(
  doc: PcbDocument,
  layer: PcbLayerId,
  grid: number,
  width: number,
  netPads: Map<string, NetPadGroup>,
  groups: NetPadGroup[],
  copper: PcbLayerId[],
  congMap: GlobalCongestionMap | null,
  agent: PcbRouteEngineHooks
): Promise<number> {
  let stall = 0;
  let lastRats = buildRatsnest(doc).length;
  for (let round = 0; round < LLM_BRAIN_REPAIR_ROUNDS; round++) {
    const ratsNow = buildRatsnest(doc).length;
    if (ratsNow === 0) {
      break;
    }
    tracePcb('AUTO_STAGE_BEGIN',
      `llmBrain round=${round + 1}/${LLM_BRAIN_REPAIR_ROUNDS} rats=${ratsNow}`);

    // 1) Strategy.onFail
    if (agent.strategyOnFail !== undefined) {
      const failIdList: string[] = [];
      const rats = buildRatsnest(doc);
      const seen: Record<string, boolean> = {};
      for (let i = 0; i < rats.length; i++) {
        if (!seen[rats[i].netId]) {
          seen[rats[i].netId] = true;
          failIdList.push(rats[i].netId);
        }
      }
      const failLines = uniqueFailNetLines(failIdList, netPads, 40);
      const errDigests = uniqueAgentErrorDigests(36);
      const cuIds: string[] = [];
      for (let i = 0; i < copper.length; i++) {
        cuIds.push(copper[i] as string);
      }
      const fctx: PcbAutoRouteAgentContext = {
        copperLayers: cuIds,
        netSummaries: buildAgentNetSummaries(groups),
        failSummaries: failLines,
        errorDigests: errDigests,
        metricsSummary: `llmBrain r${round + 1} unrouted=${failLines.length}`
      };
      fillAgentContextExtras(fctx, doc, netPads, congMap, failIdList,
        `llmBrain unrouted=${failLines.length}`);
      try {
        const ripAdvice = await agent.strategyOnFail(fctx);
        if (ripAdvice !== null && isTrustedAutoAdvice(ripAdvice.fromLlm, ripAdvice.fromLocal)) {
          if (ripAdvice.corridorBias !== undefined) {
            activeAgentCorridorBias = ripAdvice.corridorBias;
          }
          const ops: PcbAutoAgentOp[] = [];
          if (ripAdvice.ops !== undefined) {
            for (let i = 0; i < ripAdvice.ops.length; i++) {
              ops.push(ripAdvice.ops[i]);
            }
          }
          const ripup = ripAdvice.ripupTargets !== undefined ? ripAdvice.ripupTargets : [];
          for (let i = 0; i < ripup.length; i++) {
            ops.push({ op: 'ripup', net: ripup[i] });
          }
          if (ops.length > 0) {
            const snapT = doc.tracks.slice();
            const snapV = doc.vias.slice();
            const before = buildRatsnest(doc).length;
            await applyAgentOpsAsync(doc, layer, grid, width, netPads, congMap,
              ops, ripAdvice.retryNetOrder, 'AUTO_AGENT_BRAIN_ONFAIL');
            const after = buildRatsnest(doc).length;
            // 允许短暂 +1 rats（撕后重布未立刻收敛），避免丢掉有用进度
            if (after > before + 1) {
              doc.tracks = snapT;
              doc.vias = snapV;
              tracePcbWarn('AUTO_AGENT_OPS_ROLLBACK',
                `llmBrain onFail rats ${before}→${after}`);
            } else {
              tracePcb('AUTO_AGENT_OK',
                `llmBrain onFail ops=${ops.length} rats ${before}→${after}`);
            }
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : `${e}`;
        tracePcbWarn('AUTO_AGENT_FAIL', `llmBrain onFail ${msg}`);
      }
    }

    // 2) Routing.salvage 几何落铜
    await runGeometryAgentStage(doc, layer, grid, width, netPads, groups, copper, congMap, agent,
      `llmBrain salvage r${round + 1}`);

    const ratsAfter = buildRatsnest(doc).length;
    tracePcb('AUTO_STAGE_END',
      `llmBrain round=${round + 1} rats ${lastRats}→${ratsAfter}`);
    if (ratsAfter >= lastRats) {
      stall++;
      if (stall >= LLM_BRAIN_STALL) {
        tracePcbWarn('AUTO_LLM_BRAIN', `stall=${stall} stop`);
        break;
      }
    } else {
      stall = 0;
    }
    lastRats = ratsAfter;
    await yieldToUi();
  }
  return lastRats;
}

/** 详情阶段即时接管上限（避免每网都打 LLM） */
const MID_DETAIL_ASSIST_MAX = 6;

/** 从诊断抽同网 track_cross/block 的 blocker（跳过电源） */
function midDetailBlockerFromDigests(failLabel: string): string {
  const digests = agentPairFailDigests;
  const prefix = failLabel + '|';
  for (let i = digests.length - 1; i >= 0; i--) {
    const line = digests[i];
    if (line.indexOf(prefix) !== 0) {
      continue;
    }
    if (line.indexOf('track_cross') < 0 && line.indexOf('track_block') < 0 &&
      line.indexOf('via_block') < 0 && line.indexOf('orthogonal_cross') < 0) {
      continue;
    }
    const key = 'blocker=';
    const bi = line.indexOf(key);
    if (bi < 0) {
      continue;
    }
    let end = bi + key.length;
    while (end < line.length && line.charAt(end) !== '|') {
      end++;
    }
    const blocker = line.substring(bi + key.length, end).trim();
    if (blocker.length === 0 || blocker === '-') {
      continue;
    }
    if (isPowerLikeNetName(blocker)) {
      continue;
    }
    return blocker;
  }
  return '';
}

/** 本地即时 ops：撕挡线同组网 + 换层 + maze（不调 LLM） */
function buildLocalMidDetailOps(
  grp: NetPadGroup,
  copper: PcbLayerId[]
): PcbAutoAgentOp[] {
  const ops: PcbAutoAgentOp[] = [];
  const label = grp.netName.length > 0 ? grp.netName : grp.netId;
  const blocker = midDetailBlockerFromDigests(label);
  if (blocker.length > 0) {
    ops.push({ op: 'ripup', net: blocker });
  }
  let h = copper.length > 1 ? copper[1] : copper[0];
  let v = copper.length > 2 ? copper[2] : h;
  if (copper.length >= 4) {
    // 交换内层：躲开已被 XTAL1 占满的方向层
    const tmp = h;
    h = v;
    v = tmp;
  }
  ops.push({ op: 'force_hv', net: grp.netId, h: h as string, v: v as string });
  ops.push({ op: 'clear_reroute', net: grp.netId });
  const pts = grp.points.length >= 2 ? grp.points :
    (grp.connectorPoints.length >= 2 ? grp.connectorPoints : grp.points);
  if (pts.length >= 2) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    ops.push({
      op: 'guide_maze',
      net: grp.netId,
      x: a.x,
      y: a.y,
      x2: b.x,
      y2: b.y,
      layer: h as string,
      toLayer: v as string
    });
    ops.push({
      op: 'via_near',
      net: grp.netId,
      x: Math.round((a.x + b.x) / 2),
      y: Math.round((a.y + b.y) / 2),
      fromLayer: h as string,
      toLayer: v as string
    });
  }
  return ops;
}

/**
 * 详情阶段单网失败：仅本地撕挡/换层/maze（无 mid-detail LLM）。
 * 返回重布后段数（>0 视为救回）。
 */
async function runMidDetailLocalAsync(
  doc: PcbDocument,
  layer: PcbLayerId,
  grid: number,
  width: number,
  netPads: Map<string, NetPadGroup>,
  copper: PcbLayerId[],
  congMap: GlobalCongestionMap | null,
  grp: NetPadGroup
): Promise<number> {
  const label = grp.netName.length > 0 ? grp.netName : grp.netId;
  const ratsBefore = buildRatsnest(doc).length;
  const snapT = doc.tracks.slice();
  const snapV = doc.vias.slice();
  const localOps = buildLocalMidDetailOps(grp, copper);
  if (localOps.length === 0) {
    return 0;
  }
  tracePcb('AUTO_STAGE_BEGIN', `midDetailLocal net=${label} ops=${localOps.length}`);
  try {
    await applyAgentOpsAsync(doc, layer, grid, width, netPads, congMap,
      localOps, [grp.netId], 'AUTO_AGENT_MID_LOCAL');
    const sa = grp.points.length > 0 ? grp.points[0] :
      (grp.connectorPoints.length > 0 ? grp.connectorPoints[0] : null);
    const sb = grp.points.length > 1 ? grp.points[grp.points.length - 1] :
      (grp.connectorPoints.length > 0 ? grp.connectorPoints[grp.connectorPoints.length - 1] : sa);
    const pair = layerPairForNet(doc, layer, grp.netName, grp.netId, congMap, sa, sb);
    const w = widthForNet(doc, grp.netId, grp.netName, width, pair.h);
    const segs = await routeNetGroupAsync(doc, pair, grp, grid, w);
    const ratsNow = buildRatsnest(doc);
    const ratsAfter = ratsNow.length;
    const targetClosed = !netHasRats(ratsNow, grp.netId) &&
      (netAlreadyRouted(doc, grp.netId) || segs > 0);
    // 目标网已闭合并允许少量连带飞线；或全局飞线不增
    if ((segs > 0 && ratsAfter <= ratsBefore) ||
      (targetClosed && ratsAfter <= ratsBefore + 3)) {
      if (ratsAfter > ratsBefore) {
        tracePcbWarn('AUTO_AGENT_MID_LOCAL_KEEP',
          `net=${label} segs=${segs} rats ${ratsBefore}→${ratsAfter} targetClosed=1`);
      }
      tracePcb('AUTO_STAGE_END', `midDetailLocal net=${label} segs=${segs}`);
      return segs > 0 ? segs : 1;
    }
    doc.tracks = snapT;
    doc.vias = snapV;
    tracePcbWarn('AUTO_AGENT_OPS_ROLLBACK', `midDetailLocal net=${label} segs=${segs}`);
    tracePcb('AUTO_STAGE_END', `midDetailLocal net=${label} noop`);
    return 0;
  } catch (e) {
    doc.tracks = snapT;
    doc.vias = snapV;
    const msg = e instanceof Error ? e.message : `${e}`;
    tracePcbWarn('AUTO_STAGE_FAIL', `midDetailLocal net=${label} ${msg}`);
    return 0;
  }
}

/** 器件区超短跳：同层顶层，免 fanout；长跳/J1 不用；XTAL 短跳也走顶层避总线 */
function topLayerPairIfShortCore(doc: PcbDocument, preferred: PcbLayerId,
  netName: string, core: Point2D[]): NetLayerPair | null {
  if (core.length < 2 || isPowerNetName(netName) || isNrstNetName(netName) ||
    isBusNetName(netName)) {
    return null;
  }
  // 取 core 最大边作跨度
  let span = 0;
  for (let i = 0; i < core.length; i++) {
    for (let j = i + 1; j < core.length; j++) {
      const d = dist(core[i], core[j]);
      if (d > span) {
        span = d;
      }
    }
  }
  if (isXtalNetName(netName)) {
    if (span > 600) {
      return null;
    }
  } else if (span > 400 || !isUltraLocalSignal(netName, span, core.length)) {
    return null;
  }
  const copper = copperLayersFromStack(doc.layerStack);
  const top = copper.length > 0 ? copper[0] : preferred;
  const p: NetLayerPair = { h: top, v: top };
  return p;
}

/** netClass + 叠层阻抗建议；电源加倍；信号硬帽防走廊墙 */
function widthForNet(doc: PcbDocument, netId: string, netName: string, defaultWidth: number,
  layer: PcbLayerId = PcbLayerId.F_CU): number {
  let ncW = defaultWidth;
  if (netId.length > 0) {
    const tw = trackWidthForNet(doc, netId);
    if (tw > 0) {
      ncW = tw;
    }
  }
  let w = resolveTrackWidth(
    doc, netId, netName, layer,
    isDiffPairNet(doc, netId),
    isPowerNetName(netName),
    ncW,
    defaultWidth
  );
  if (!isPowerNetName(netName)) {
    const minW = doc.metadata.designRules.minTrackWidth;
    let cap = SIGNAL_WIDTH_HARD_CAP;
    if (isLedNetName(netName)) {
      cap = LED_WIDTH_HARD_CAP;
    } else if (isBusNetName(netName)) {
      cap = BUS_WIDTH_HARD_CAP;
    } else if (isXtalNetName(netName) || isNrstNetName(netName)) {
      cap = Math.min(SIGNAL_WIDTH_HARD_CAP, ncW > 0 ? ncW : SIGNAL_WIDTH_HARD_CAP);
    }
    const hard = Math.max(minW, Math.min(cap, ncW > 0 ? ncW : cap));
    if (w > hard) {
      w = hard;
    }
  }
  return w;
}

function segmentLayer(pair: NetLayerPair, a: Point2D, b: Point2D): PcbLayerId {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  // 45° 斜边：优先落 H 层
  if (dx >= 0.5 && dy >= 0.5 && Math.abs(dx - dy) < 1.0) {
    return pair.h;
  }
  if (dx >= dy) {
    return pair.h;
  }
  return pair.v;
}

function collectJogOffsets(grid: number, width: number): number[] {
  const base = Math.max(grid, 5);
  const clearPad = Math.max(base * 8, width * 4 + 40);
  // 精简 jog 档位，避免候选爆炸（178+）拖慢每 hop
  const mults = [2, 4, 8, 12, 20, 32, 48];
  const out: number[] = [];
  const seen: Set<number> = new Set();
  const push = (v: number): void => {
    const s = snap(v, grid);
    if (s === 0 || seen.has(s) || seen.has(-s)) {
      return;
    }
    seen.add(s);
    out.push(s);
    out.push(-s);
  };
  push(clearPad);
  for (let i = 0; i < mults.length; i++) {
    push(base * mults[i]);
  }
  return out;
}

function distPointSegLocal(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) {
    return dist(p, a);
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  if (t < 0) {
    t = 0;
  } else if (t > 1) {
    t = 1;
  }
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/**
 * 软障碍：异网/浮空焊盘圆 + 封装选中区 AABB（与硬校验 body_block 同盒，避免预筛过了仍 body_block）。
 * 底层封装不进 AABB（与 Oracle 外层 keepout 一致）。
 */
function collectSoftObstacles(doc: PcbDocument, netId: string): SoftObstacles {
  const pads: PadObstacle[] = [];
  const bodies: BodyBox[] = [];
  for (const fp of doc.footprints) {
    for (const pad of fp.pads) {
      const pNet = pad.netId ?? '';
      if (pNet.length > 0 && pNet === netId) {
        continue;
      }
      const pos = padWorldPosition(fp, pad);
      const padR = Math.max(pad.size.x, pad.size.y) * 0.5;
      pads.push({ x: pos.x, y: pos.y, r: padR });
    }
    if (fp.layer === PcbLayerId.B_CU) {
      continue;
    }
    const box = footprintSelectionAabb(fp);
    const bw = box.x2 - box.x1;
    const bh = box.y2 - box.y1;
    if (bw > 8 && bh > 8) {
      const body: BodyBox = { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2 };
      bodies.push(body);
    }
  }
  const out: SoftObstacles = { pads, bodies };
  return out;
}

/** 正交线段是否切入 body AABB（inflate=clearance） */
function orthoSegHitsBody(a: Point2D, b: Point2D, box: BodyBox, inflate: number): boolean {
  const x1 = box.x1 - inflate;
  const y1 = box.y1 - inflate;
  const x2 = box.x2 + inflate;
  const y2 = box.y2 + inflate;
  if (Math.abs(a.y - b.y) < 0.5) {
    const y = a.y;
    if (y < y1 || y > y2) {
      return false;
    }
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    return hi >= x1 && lo <= x2;
  }
  if (Math.abs(a.x - b.x) < 0.5) {
    const x = a.x;
    if (x < x1 || x > x2) {
      return false;
    }
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    return hi >= y1 && lo <= y2;
  }
  return false;
}

function padNeed(doc: PcbDocument, netId: string, width: number): number {
  return clearanceForNet(doc, netId) + width / 2;
}

/** 竖直通道 x=cx、y∈[y0,y1] 是否被焊盘/body 挡住 */
function verticalChannelBlocked(cx: number, y0: number, y1: number,
  obs: PadObstacle[], bodies: BodyBox[], need: number): boolean {
  const a: Point2D = { x: cx, y: y0 };
  const b: Point2D = { x: cx, y: y1 };
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    if (distPointSegLocal({ x: o.x, y: o.y }, a, b) < need + o.r) {
      return true;
    }
  }
  for (let i = 0; i < bodies.length; i++) {
    if (orthoSegHitsBody(a, b, bodies[i], need)) {
      return true;
    }
  }
  return false;
}

/** 水平通道 y=cy、x∈[x0,x1] 是否被焊盘/body 挡住 */
function horizontalChannelBlocked(cy: number, x0: number, x1: number,
  obs: PadObstacle[], bodies: BodyBox[], need: number): boolean {
  const a: Point2D = { x: x0, y: cy };
  const b: Point2D = { x: x1, y: cy };
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    if (distPointSegLocal({ x: o.x, y: o.y }, a, b) < need + o.r) {
      return true;
    }
  }
  for (let i = 0; i < bodies.length; i++) {
    if (orthoSegHitsBody(a, b, bodies[i], need)) {
      return true;
    }
  }
  return false;
}

/**
 * 基于焊盘+body AABB 推垂直/水平畅通坐标：障碍边缘外推 + 从 prefer 向外扫。
 */
function findClearChannels(prefer: number, lo: number, hi: number, isVertical: boolean,
  obs: PadObstacle[], bodies: BodyBox[], need: number, grid: number, scanExtra: number): number[] {
  const out: number[] = [];
  const seen: Set<number> = new Set();
  const push = (v: number): void => {
    const s = snap(v, grid);
    if (seen.has(s)) {
      return;
    }
    const blocked = isVertical
      ? verticalChannelBlocked(s, lo, hi, obs, bodies, need)
      : horizontalChannelBlocked(s, lo, hi, obs, bodies, need);
    if (!blocked) {
      seen.add(s);
      out.push(s);
    }
  };
  push(prefer);
  // 障碍左右/上下外推一条通道
  const margin = need + grid;
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    const inBand = isVertical
      ? (o.y >= lo - o.r - need && o.y <= hi + o.r + need)
      : (o.x >= lo - o.r - need && o.x <= hi + o.r + need);
    if (!inBand) {
      continue;
    }
    const c = isVertical ? o.x : o.y;
    push(c + o.r + margin);
    push(c - o.r - margin);
  }
  // body AABB 外缘通道（与硬 keepout 对齐）
  for (let i = 0; i < bodies.length; i++) {
    const box = bodies[i];
    if (isVertical) {
      if (box.y2 < lo - need || box.y1 > hi + need) {
        continue;
      }
      push(box.x2 + margin);
      push(box.x1 - margin);
    } else {
      if (box.x2 < lo - need || box.x1 > hi + need) {
        continue;
      }
      push(box.y2 + margin);
      push(box.y1 - margin);
    }
  }
  // 从 prefer 向外按栅格扫，补足畅通槽
  const steps = [2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96];
  for (let si = 0; si < steps.length; si++) {
    const d = grid * steps[si];
    if (d > scanExtra) {
      break;
    }
    push(prefer + d);
    push(prefer - d);
    if (out.length >= 12) {
      break;
    }
  }
  return out;
}

/**
 * 焊盘簇逃离点：先水平/垂直离开密脚区，避免垂直段从焊盘中心直接穿邻脚。
 */
function computePadEscapePoints(p: Point2D, grid: number, width: number,
  obs: PadObstacle[], need: number): Point2D[] {
  // 密脚 QFP/TSSOP：逃离距离需大于邻脚间距，否则垂直段仍会蹭邻盘
  const dists = [
    Math.max(grid * 8, width * 4 + 40),
    Math.max(grid * 12, width * 6 + 60),
    Math.max(grid * 18, width * 9 + 90),
    Math.max(grid * 24, width * 12 + 120)
  ];
  // 统计附近障碍，偏向「空隙更大」的方向
  const dirs: number[][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const scores: number[] = [1e9, 1e9, 1e9, 1e9];
  for (let di = 0; di < dirs.length; di++) {
    let minGap = 1e9;
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i];
      const dx = o.x - p.x;
      const dy = o.y - p.y;
      const along = dx * dirs[di][0] + dy * dirs[di][1];
      if (along < grid) {
        continue;
      }
      const perp = Math.abs(dx * dirs[di][1] - dy * dirs[di][0]);
      if (perp > o.r + need + grid * 2) {
        continue;
      }
      const gap = along - o.r - need;
      if (gap < minGap) {
        minGap = gap;
      }
    }
    scores[di] = minGap;
  }
  // 分数高的方向优先
  const order = [0, 1, 2, 3];
  order.sort((i: number, j: number): number => scores[j] - scores[i]);
  const out: Point2D[] = [];
  const seen: Set<string> = new Set();
  for (let oi = 0; oi < order.length; oi++) {
    const di = order[oi];
    for (let ki = 0; ki < dists.length; ki++) {
      const d = dists[ki];
      const pt: Point2D = {
        x: snap(p.x + dirs[di][0] * d, grid),
        y: snap(p.y + dirs[di][1] * d, grid)
      };
      const key = `${pt.x},${pt.y}`;
      if (seen.has(key) || dist(p, pt) < 0.5) {
        continue;
      }
      let blocked = false;
      for (let i = 0; i < obs.length; i++) {
        const o = obs[i];
        const dSeg = distPointSegLocal({ x: o.x, y: o.y }, p, pt);
        const da = dist({ x: o.x, y: o.y }, p);
        // 放行「从端点焊盘离开」：最近点几乎就是起点
        if (dSeg < need + o.r && !(da < need + o.r && dSeg >= da - 1.0)) {
          blocked = true;
          break;
        }
      }
      if (blocked) {
        continue;
      }
      seen.add(key);
      out.push(pt);
      if (out.length >= 8) {
        return out;
      }
    }
  }
  return out;
}

function pairNeedsOuterBodyKeepout(pair: NetLayerPair): boolean {
  return pair.h === PcbLayerId.F_CU || pair.v === PcbLayerId.F_CU ||
    pair.h === PcbLayerId.B_CU || pair.v === PcbLayerId.B_CU;
}

/**
 * 从 pad_block / via_block 理由解析障碍圆。
 * 兼容：`@x,y r=R` 与 `@(x,y)`（via_block 常见）。
 */
function parsePadBlockObstacle(reason: string): PadObstacle | null {
  const at = reason.indexOf('@');
  if (at < 0) {
    return null;
  }
  let rest = reason.substring(at + 1);
  if (rest.length > 0 && rest.charAt(0) === '(') {
    rest = rest.substring(1);
  }
  const comma = rest.indexOf(',');
  if (comma < 0) {
    return null;
  }
  const x = parseInt(rest.substring(0, comma), 10);
  let yi = comma + 1;
  let yEnd = yi;
  while (yEnd < rest.length) {
    const ch = rest.charAt(yEnd);
    if (ch === ' ' || ch === '\t' || ch === ')') {
      break;
    }
    yEnd++;
  }
  const y = parseInt(rest.substring(yi, yEnd), 10);
  let r = 30;
  const rIdx = rest.indexOf('r=');
  if (rIdx >= 0) {
    const rv = parseInt(rest.substring(rIdx + 2), 10);
    if (!isNaN(rv) && rv > 0) {
      r = rv;
    }
  }
  if (isNaN(x) || isNaN(y)) {
    return null;
  }
  const po: PadObstacle = { x: x, y: y, r: r };
  return po;
}

/** 从 track_cross/track_block 理由解析障碍线段 `@(x1,y1)-(x2,y2)` */
interface TrackSegObstacle {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function parseTrackSegObstacle(reason: string): TrackSegObstacle | null {
  if (reason.indexOf('track_') < 0) {
    return null;
  }
  const at = reason.indexOf('@(');
  if (at < 0) {
    return null;
  }
  const rest = reason.substring(at + 2);
  const dash = rest.indexOf(')-(');
  if (dash < 0) {
    return null;
  }
  const aPart = rest.substring(0, dash);
  const bPart = rest.substring(dash + 3);
  const ac = aPart.indexOf(',');
  const bc = bPart.indexOf(',');
  if (ac < 0 || bc < 0) {
    return null;
  }
  const x1 = parseInt(aPart.substring(0, ac), 10);
  const y1 = parseInt(aPart.substring(ac + 1), 10);
  let bEnd = bPart.indexOf(')');
  if (bEnd < 0) {
    bEnd = bPart.length;
  }
  const x2 = parseInt(bPart.substring(0, bc), 10);
  const y2 = parseInt(bPart.substring(bc + 1, bEnd), 10);
  if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) {
    return null;
  }
  const seg: TrackSegObstacle = { x1: x1, y1: y1, x2: x2, y2: y2 };
  return seg;
}

/** 绕开异网走线段的 U/C 折线（对应 track_cross / track_block） */
function buildTrackBypassPolylines(a: Point2D, b: Point2D, obs: TrackSegObstacle,
  grid: number, clear: number): Point2D[][] {
  const polylines: Point2D[][] = [];
  const minX = Math.min(obs.x1, obs.x2) - clear;
  const maxX = Math.max(obs.x1, obs.x2) + clear;
  const minY = Math.min(obs.y1, obs.y2) - clear;
  const maxY = Math.max(obs.y1, obs.y2) + clear;
  const xs = [snap(minX, grid), snap(maxX, grid)];
  const ys = [snap(minY, grid), snap(maxY, grid)];
  for (let yi = 0; yi < ys.length; yi++) {
    const y = ys[yi];
    polylines.push([
      a,
      { x: snap(a.x, grid), y: y },
      { x: snap(b.x, grid), y: y },
      b
    ]);
  }
  for (let xi = 0; xi < xs.length; xi++) {
    const x = xs[xi];
    polylines.push([
      a,
      { x: x, y: snap(a.y, grid) },
      { x: x, y: snap(b.y, grid) },
      b
    ]);
  }
  // 双 jog：先出障碍盒再进终点
  for (let yi = 0; yi < ys.length; yi++) {
    for (let xi = 0; xi < xs.length; xi++) {
      const x = xs[xi];
      const y = ys[yi];
      polylines.push([
        a,
        { x: snap(a.x, grid), y: y },
        { x: x, y: y },
        { x: x, y: snap(b.y, grid) },
        b
      ]);
    }
  }
  return polylines;
}

const TRACK_BYPASS_CAND_CAP = 10;

function tryCommitTrackBypass(doc: PcbDocument, pair: NetLayerPair,
  a: Point2D, b: Point2D, netId: string, netName: string,
  grid: number, width: number, lastBlock: BlockBox): number {
  const obs = parseTrackSegObstacle(lastBlock.reason);
  if (obs === null) {
    return -1;
  }
  const clear = Math.max(grid * 6, width * 3 + 30);
  const paths = buildTrackBypassPolylines(a, b, obs, grid, clear);
  const cap = Math.min(paths.length, TRACK_BYPASS_CAND_CAP);
  for (let i = 0; i < cap; i++) {
    const segs = tryCommitPolyline(doc, paths[i], pair, netId, netName, width, lastBlock);
    if (segs >= 0) {
      return segs;
    }
  }
  return -1;
}

async function tryCommitTrackBypassAsync(doc: PcbDocument, pair: NetLayerPair,
  a: Point2D, b: Point2D, netId: string, netName: string,
  grid: number, width: number, lastBlock: BlockBox, deadlineMs?: number): Promise<number> {
  const obs = parseTrackSegObstacle(lastBlock.reason);
  if (obs === null) {
    return -1;
  }
  const clear = Math.max(grid * 6, width * 3 + 30);
  const paths = buildTrackBypassPolylines(a, b, obs, grid, clear);
  const cap = Math.min(paths.length, TRACK_BYPASS_CAND_CAP);
  for (let i = 0; i < cap; i++) {
    if (deadlineMs !== undefined && deadlineMs > 0 && Date.now() > deadlineMs) {
      break;
    }
    if ((i % 2) === 0) {
      await yieldToUi();
    }
    const segs = tryCommitPolyline(doc, paths[i], pair, netId, netName, width, lastBlock,
      deadlineMs);
    if (segs >= 0) {
      return segs;
    }
  }
  return -1;
}

/**
 * a→b 线段中段附近的异网焊盘（晶体邻脚典型：同 y 夹在两脚之间）。
 */
function findInterveningPadObstacles(a: Point2D, b: Point2D, obs: PadObstacle[],
  need: number): PadObstacle[] {
  const out: PadObstacle[] = [];
  const span = dist(a, b);
  if (span < 1 || obs.length === 0) {
    return out;
  }
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    const dSeg = distPointSegLocal({ x: o.x, y: o.y }, a, b);
    if (dSeg >= o.r + need) {
      continue;
    }
    const da = dist({ x: o.x, y: o.y }, a);
    const db = dist({ x: o.x, y: o.y }, b);
    // 端点自身焊盘豁免；只要中段压盘就算 intervening
    if (da < o.r + need + 2 || db < o.r + need + 2) {
      continue;
    }
    if (dSeg < Math.min(da, db) - 1.0) {
      out.push(o);
    }
  }
  return out;
}

/**
 * 绕开中段异网焊盘的 U/C 形折线（HC-49 邻脚、密脚排横穿）。
 * 垂直/水平偏移 ≥ padR+clearance，避免再压邻盘。
 */
function buildSiblingDetourPolylines(a: Point2D, b: Point2D, blockers: PadObstacle[],
  grid: number, need: number): Point2D[][] {
  const polylines: Point2D[][] = [];
  if (blockers.length === 0) {
    return polylines;
  }
  let maxR = 20;
  let midX = 0;
  let midY = 0;
  for (let i = 0; i < blockers.length; i++) {
    maxR = Math.max(maxR, blockers[i].r);
    midX += blockers[i].x;
    midY += blockers[i].y;
  }
  midX /= blockers.length;
  midY /= blockers.length;
  const clears = [
    Math.max(grid * 10, maxR + need + grid * 4),
    Math.max(grid * 16, maxR + need + grid * 8),
    Math.max(grid * 24, maxR + need + grid * 14),
    Math.max(grid * 36, maxR + need + grid * 22)
  ];
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const horizDominant = dx >= dy;
  for (let ci = 0; ci < clears.length; ci++) {
    const c = clears[ci];
    if (horizDominant) {
      for (const sign of [1, -1]) {
        const y = snap(midY + sign * c, grid);
        polylines.push([
          a,
          { x: snap(a.x, grid), y: y },
          { x: snap(b.x, grid), y: y },
          b
        ]);
        // C 形：先离开 a 再横穿
        const yA = snap(a.y + sign * c, grid);
        polylines.push([
          a,
          { x: snap(a.x, grid), y: yA },
          { x: snap(b.x, grid), y: yA },
          b
        ]);
      }
    } else {
      for (const sign of [1, -1]) {
        const x = snap(midX + sign * c, grid);
        polylines.push([
          a,
          { x: x, y: snap(a.y, grid) },
          { x: x, y: snap(b.y, grid) },
          b
        ]);
        const xA = snap(a.x + sign * c, grid);
        polylines.push([
          a,
          { x: xA, y: snap(a.y, grid) },
          { x: xA, y: snap(b.y, grid) },
          b
        ]);
      }
    }
    // 双侧都试：短 hop 也可能斜向
    for (const sign of [1, -1]) {
      const y = snap(midY + sign * c, grid);
      const x = snap(midX + sign * c, grid);
      polylines.push([
        a,
        { x: snap(a.x, grid), y: y },
        { x: snap(b.x, grid), y: y },
        b
      ]);
      polylines.push([
        a,
        { x: x, y: snap(a.y, grid) },
        { x: x, y: snap(b.y, grid) },
        b
      ]);
      // 双 jog：先垂直再水平绕过簇
      polylines.push([
        a,
        { x: snap(a.x, grid), y: y },
        { x: x, y: y },
        { x: x, y: snap(b.y, grid) },
        b
      ]);
    }
  }
  return polylines;
}

/** track_cross/track_block 专用绕障；超时后禁止（fanout+clearance 过重） */
function shouldTryTrackBypass(lastReason: string, hopExhausted: boolean,
  netName: string = ''): boolean {
  if (hopExhausted) {
    return false;
  }
  if (netName.length > 0 && isPowerNetName(netName)) {
    return false;
  }
  if (lastReason.indexOf('track_cross') < 0 && lastReason.indexOf('track_block') < 0) {
    return false;
  }
  return parseTrackSegObstacle(lastReason) !== null;
}

/**
 * 邻脚 U 绕：pad_block / XTAL via_block，短跨度。
 * 超时后仍允许晶体短绕（候选少、无假中点）；其它情况超时禁止防 THREAD_BLOCK。
 */
function shouldTrySiblingDetour(netName: string, a: Point2D, b: Point2D,
  lastReason: string, hopExhausted: boolean): boolean {
  if (isPowerNetName(netName)) {
    return false;
  }
  const span = dist(a, b);
  const maxSpan = isXtalNetName(netName) ? XTAL_SIBLING_DETOUR_MAX_SPAN : SIBLING_DETOUR_MAX_SPAN;
  if (span > maxSpan || span < 10) {
    return false;
  }
  const padLike = isPadBlockReason(lastReason);
  const xtalVia = lastReason.indexOf('via_block') >= 0 && isXtalNetName(netName);
  if (!padLike && !xtalVia) {
    return false;
  }
  if (hopExhausted) {
    // 超时兜底：仅短跨晶体（≤420），禁止跨板 U 绕再烧数秒
    if (span > SIBLING_DETOUR_MAX_SPAN) {
      return false;
    }
    return xtalVia || (padLike && isXtalNetName(netName));
  }
  return true;
}

/** XTAL/NRST 值得早切 light maze；电源网永不 maze */
function shouldAllowLightMaze(netName: string, remainMs: number): boolean {
  if (isPowerNetName(netName)) {
    return false;
  }
  const minRemain = (isXtalNetName(netName) || isNrstNetName(netName))
    ? 45
    : MAZE_MIN_REMAIN_MS;
  return remainMs >= minRemain;
}

/**
 * 邻脚挡路专用提交：不占用主候选预算；无真实阻挡则放弃（禁止假中点）。
 */
function tryCommitSiblingDetours(doc: PcbDocument, pair: NetLayerPair,
  a: Point2D, b: Point2D, netId: string, netName: string,
  grid: number, width: number, lastBlock: BlockBox): number {
  const span = dist(a, b);
  const maxSpan = isXtalNetName(netName) ? XTAL_SIBLING_DETOUR_MAX_SPAN : SIBLING_DETOUR_MAX_SPAN;
  if (span < 10 || span > maxSpan) {
    return -1;
  }
  const need = padNeed(doc, netId, width);
  const soft = collectSoftObstacles(doc, netId);
  const blockers = findInterveningPadObstacles(a, b, soft.pads, need);
  if (blockers.length === 0 &&
    (lastBlock.reason.indexOf('pad_block') >= 0 || lastBlock.reason.indexOf('via_block') >= 0)) {
    const parsed = parsePadBlockObstacle(lastBlock.reason);
    if (parsed !== null) {
      // via 当圆障碍时略放大，保证 U 绕半径够
      if (lastBlock.reason.indexOf('via_block') >= 0) {
        parsed.r = Math.max(parsed.r, 40);
      }
      blockers.push(parsed);
    }
  }
  if (blockers.length === 0) {
    return -1;
  }
  const detours = buildSiblingDetourPolylines(a, b, blockers, grid, need);
  const cap = Math.min(detours.length, SIBLING_DETOUR_CAND_CAP);
  for (let i = 0; i < cap; i++) {
    const segs = tryCommitPolyline(doc, detours[i], pair, netId, netName, width, lastBlock);
    if (segs >= 0) {
      return segs;
    }
  }
  return -1;
}

async function tryCommitSiblingDetoursAsync(doc: PcbDocument, pair: NetLayerPair,
  a: Point2D, b: Point2D, netId: string, netName: string,
  grid: number, width: number, lastBlock: BlockBox, deadlineMs?: number,
  candCap?: number): Promise<number> {
  const span = dist(a, b);
  const maxSpan = isXtalNetName(netName) ? XTAL_SIBLING_DETOUR_MAX_SPAN : SIBLING_DETOUR_MAX_SPAN;
  if (span < 10 || span > maxSpan) {
    return -1;
  }
  if (deadlineMs !== undefined && deadlineMs > 0 && Date.now() > deadlineMs) {
    return -1;
  }
  const need = padNeed(doc, netId, width);
  const soft = collectSoftObstacles(doc, netId);
  const blockers = findInterveningPadObstacles(a, b, soft.pads, need);
  if (blockers.length === 0 &&
    (lastBlock.reason.indexOf('pad_block') >= 0 || lastBlock.reason.indexOf('via_block') >= 0)) {
    const parsed = parsePadBlockObstacle(lastBlock.reason);
    if (parsed !== null) {
      if (lastBlock.reason.indexOf('via_block') >= 0) {
        parsed.r = Math.max(parsed.r, 40);
      }
      blockers.push(parsed);
    }
  }
  if (blockers.length === 0) {
    return -1;
  }
  const detours = buildSiblingDetourPolylines(a, b, blockers, grid, need);
  const hardCap = candCap !== undefined && candCap > 0 ? candCap : SIBLING_DETOUR_CAND_CAP;
  const cap = Math.min(detours.length, hardCap);
  for (let i = 0; i < cap; i++) {
    if (deadlineMs !== undefined && deadlineMs > 0 && Date.now() > deadlineMs) {
      break;
    }
    await yieldToUi();
    const segs = tryCommitPolyline(doc, detours[i], pair, netId, netName, width, lastBlock,
      deadlineMs);
    if (segs >= 0) {
      return segs;
    }
  }
  return -1;
}

/** pad_block 是否命中连接器脚（J1 / PINHDR） */
function isConnectorPadBlockReason(reason: string): boolean {
  if (reason.indexOf('pad_block') < 0) {
    return false;
  }
  const up = reason.toUpperCase();
  return up.indexOf('J1.') >= 0 || up.indexOf('J1(') >= 0 ||
    up.indexOf('PINHDR') >= 0 || up.indexOf('CONN') >= 0;
}

function shouldTryConnectorEscape(a: Point2D, b: Point2D, lastReason: string,
  hopExhausted: boolean): boolean {
  if (hopExhausted) {
    return false;
  }
  if (!isConnectorPadBlockReason(lastReason)) {
    return false;
  }
  const span = dist(a, b);
  if (span < 20 || span > CONNECTOR_ESCAPE_MAX_SPAN) {
    return false;
  }
  return true;
}

/**
 * 连接器走廊 escape：先离开邻脚簇，再折向目标（对应 J1.n pad_block）。
 */
function buildConnectorEscapePolylines(a: Point2D, b: Point2D, obs: PadObstacle,
  grid: number, need: number): Point2D[][] {
  const polylines: Point2D[][] = [];
  const clears = [
    Math.max(grid * 12, need + obs.r + 40),
    Math.max(grid * 20, need + obs.r + 80),
    Math.max(grid * 32, need + obs.r + 130),
    Math.max(grid * 48, need + obs.r + 200)
  ];
  const da = dist(a, { x: obs.x, y: obs.y });
  const db = dist(b, { x: obs.x, y: obs.y });
  const nearPad = da <= db ? a : b;
  const farPad = da <= db ? b : a;
  for (let ci = 0; ci < clears.length; ci++) {
    const c = clears[ci];
    for (const sx of [1, -1]) {
      for (const sy of [0, 1, -1]) {
        const esc: Point2D = {
          x: snap(obs.x + sx * c, grid),
          y: snap(obs.y + sy * c, grid)
        };
        // 远点 → 水平/垂直到 escape → 连近端（连接器脚）
        polylines.push([
          farPad,
          { x: esc.x, y: snap(farPad.y, grid) },
          esc,
          nearPad
        ]);
        polylines.push([
          farPad,
          { x: snap(farPad.x, grid), y: esc.y },
          esc,
          nearPad
        ]);
        // 先离开近端邻脚，再接远点（反向）
        polylines.push([
          nearPad,
          esc,
          { x: esc.x, y: snap(farPad.y, grid) },
          farPad
        ]);
      }
    }
    // 纯轴向：沿排针外侧走廊
    for (const sx of [1, -1]) {
      const x = snap(obs.x + sx * c, grid);
      polylines.push([
        farPad,
        { x: x, y: snap(farPad.y, grid) },
        { x: x, y: snap(nearPad.y, grid) },
        nearPad
      ]);
    }
  }
  return polylines;
}

function tryCommitConnectorEscape(doc: PcbDocument, pair: NetLayerPair,
  a: Point2D, b: Point2D, netId: string, netName: string,
  grid: number, width: number, lastBlock: BlockBox): number {
  const obs = parsePadBlockObstacle(lastBlock.reason);
  if (obs === null) {
    return -1;
  }
  obs.r = Math.max(obs.r, 30);
  const need = padNeed(doc, netId, width);
  const paths = buildConnectorEscapePolylines(a, b, obs, grid, need);
  const cap = Math.min(paths.length, CONNECTOR_ESCAPE_CAND_CAP);
  for (let i = 0; i < cap; i++) {
    const segs = tryCommitPolyline(doc, paths[i], pair, netId, netName, width, lastBlock);
    if (segs >= 0) {
      return segs;
    }
  }
  return -1;
}

async function tryCommitConnectorEscapeAsync(doc: PcbDocument, pair: NetLayerPair,
  a: Point2D, b: Point2D, netId: string, netName: string,
  grid: number, width: number, lastBlock: BlockBox, deadlineMs?: number): Promise<number> {
  const obs = parsePadBlockObstacle(lastBlock.reason);
  if (obs === null) {
    return -1;
  }
  if (deadlineMs !== undefined && deadlineMs > 0 && Date.now() > deadlineMs) {
    return -1;
  }
  obs.r = Math.max(obs.r, 30);
  const need = padNeed(doc, netId, width);
  const paths = buildConnectorEscapePolylines(a, b, obs, grid, need);
  const cap = Math.min(paths.length, CONNECTOR_ESCAPE_CAND_CAP);
  for (let i = 0; i < cap; i++) {
    if (deadlineMs !== undefined && deadlineMs > 0 && Date.now() > deadlineMs) {
      break;
    }
    if ((i % 2) === 0) {
      await yieldToUi();
    }
    const segs = tryCommitPolyline(doc, paths[i], pair, netId, netName, width, lastBlock,
      deadlineMs);
    if (segs >= 0) {
      return segs;
    }
  }
  return -1;
}

/** 网在 ratsnest 中是否仍有飞线 */
function netHasRats(rats: PcbRatsnestEdge[], netId: string): boolean {
  for (let i = 0; i < rats.length; i++) {
    if (rats[i].netId === netId) {
      return true;
    }
  }
  return false;
}

/** 多策略正交折线：焊盘/body 通道优先 + L/jog/escape/板边；lite 时只保留 L/45 */
function buildCandidatePolylines(doc: PcbDocument, a: Point2D, b: Point2D,
  netId: string, netName: string, grid: number, width: number, preferHFirst: boolean,
  useBodyKeepout: boolean, lite?: boolean): Point2D[][] {
  const need = padNeed(doc, netId, width);
  const soft = collectSoftObstacles(doc, netId);
  const obs = soft.pads;
  // 仅外层铜需要 body AABB（与 Oracle 一致）；内层允许从封装下方穿过
  const bodies = useBodyKeepout ? soft.bodies : [];
  const yLo = Math.min(a.y, b.y);
  const yHi = Math.max(a.y, b.y);
  const xLo = Math.min(a.x, b.x);
  const xHi = Math.max(a.x, b.x);
  const scan = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), 400) + 200;

  const polylines: Point2D[][] = [];

  // 45° 优先候选（含一段真斜边）
  const p45 = routeOrtho45Points(a, b);
  if (p45.length >= 2) {
    polylines.push(p45);
  }

  if (lite === true) {
    const midHLite: Point2D = { x: snap(b.x, grid), y: snap(a.y, grid) };
    const midVLite: Point2D = { x: snap(a.x, grid), y: snap(b.y, grid) };
    if (preferHFirst) {
      polylines.push([a, midHLite, b]);
      polylines.push([a, midVLite, b]);
    } else {
      polylines.push([a, midVLite, b]);
      polylines.push([a, midHLite, b]);
    }
    if (dist(a, b) >= 0.5 && (Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5)) {
      polylines.push([a, b]);
    }
    return polylines;
  }

  // 全局通道指南：优先尝试预留 L / TA 轨道
  if (activeGlobalGuides !== null) {
    const g = activeGlobalGuides.get(netId);
    if (g !== undefined && g.waypoints.length >= 2) {
      const guided: Point2D[] = [{ x: a.x, y: a.y }];
      for (let wi = 0; wi < g.waypoints.length; wi++) {
        guided.push({ x: g.waypoints[wi].x, y: g.waypoints[wi].y });
      }
      guided.push({ x: b.x, y: b.y });
      polylines.push(guided);
      if (g.waypoints.length >= 3) {
        polylines.push([
          { x: a.x, y: a.y },
          { x: g.waypoints[1].x, y: g.waypoints[1].y },
          { x: b.x, y: b.y }
        ]);
      }
      // TA：强制走已分配 H/V 轨道
      if (g.assignedTrackY !== undefined && g.assignedTrackX !== undefined) {
        const ty = g.assignedTrackY;
        const tx = g.assignedTrackX;
        if (g.preferHFirst) {
          polylines.unshift([
            { x: a.x, y: a.y },
            { x: a.x, y: ty },
            { x: b.x, y: ty },
            { x: b.x, y: b.y }
          ]);
        } else {
          polylines.unshift([
            { x: a.x, y: a.y },
            { x: tx, y: a.y },
            { x: tx, y: b.y },
            { x: b.x, y: b.y }
          ]);
        }
      }
    }
  }

  const clearXs = findClearChannels(snap(a.x, grid), yLo, yHi, true, obs, bodies, need, grid, scan);
  // 也从 b.x 扫
  const clearXsB = findClearChannels(snap(b.x, grid), yLo, yHi, true, obs, bodies, need, grid, scan);
  for (let i = 0; i < clearXsB.length && clearXs.length < 16; i++) {
    let dup = false;
    for (let j = 0; j < clearXs.length; j++) {
      if (clearXs[j] === clearXsB[i]) {
        dup = true;
        break;
      }
    }
    if (!dup) {
      clearXs.push(clearXsB[i]);
    }
  }
  const clearYs = findClearChannels(snap(a.y, grid), xLo, xHi, false, obs, bodies, need, grid, scan);
  const clearYsB = findClearChannels(snap(b.y, grid), xLo, xHi, false, obs, bodies, need, grid, scan);
  for (let i = 0; i < clearYsB.length && clearYs.length < 16; i++) {
    let dup = false;
    for (let j = 0; j < clearYs.length; j++) {
      if (clearYs[j] === clearYsB[i]) {
        dup = true;
        break;
      }
    }
    if (!dup) {
      clearYs.push(clearYsB[i]);
    }
  }

  const escapesA = computePadEscapePoints(a, grid, width, obs, need);
  const escapesB = computePadEscapePoints(b, grid, width, obs, need);

  const midH: Point2D = { x: snap(b.x, grid), y: snap(a.y, grid) };
  const midV: Point2D = { x: snap(a.x, grid), y: snap(b.y, grid) };

  // 多层时优先水平出盘（H-first），避免焊盘中心直接上垂直层穿邻脚
  if (preferHFirst) {
    polylines.push([a, midH, b]);
  }
  polylines.push([a, midV, b]);
  if (!preferHFirst) {
    polylines.push([a, midH, b]);
  }
  if (dist(a, b) >= 0.5 && Math.abs(a.x - b.x) < 0.5) {
    polylines.push([a, b]);
  } else if (dist(a, b) >= 0.5 && Math.abs(a.y - b.y) < 0.5) {
    polylines.push([a, b]);
  }

  // 焊盘感知畅通竖槽：先水平到 clearX，再竖直，再水平到 b
  const xLimit = Math.min(clearXs.length, 6);
  for (let i = 0; i < xLimit; i++) {
    const cx = clearXs[i];
    polylines.push([
      a,
      { x: cx, y: snap(a.y, grid) },
      { x: cx, y: snap(b.y, grid) },
      b
    ]);
  }
  const yLimit = Math.min(clearYs.length, 6);
  for (let i = 0; i < yLimit; i++) {
    const cy = clearYs[i];
    polylines.push([
      a,
      { x: snap(a.x, grid), y: cy },
      { x: snap(b.x, grid), y: cy },
      b
    ]);
  }

  // 逃离焊盘簇后再走畅通槽
  const eaLimit = Math.min(escapesA.length, 4);
  const ebLimit = Math.min(escapesB.length, 3);
  for (let i = 0; i < eaLimit; i++) {
    const ea = escapesA[i];
    polylines.push([a, ea, { x: snap(b.x, grid), y: ea.y }, b]);
    polylines.push([a, ea, { x: ea.x, y: snap(b.y, grid) }, b]);
    for (let xi = 0; xi < Math.min(clearXs.length, 4); xi++) {
      const cx = clearXs[xi];
      polylines.push([
        a, ea,
        { x: cx, y: ea.y },
        { x: cx, y: snap(b.y, grid) },
        b
      ]);
    }
    for (let j = 0; j < ebLimit; j++) {
      const eb = escapesB[j];
      polylines.push([a, ea, { x: eb.x, y: ea.y }, eb, b]);
      polylines.push([a, ea, { x: ea.x, y: eb.y }, eb, b]);
    }
  }

  const jogs = collectJogOffsets(grid, width);
  for (let i = 0; i < jogs.length; i++) {
    const j = jogs[i];
    polylines.push([
      a,
      { x: snap(a.x, grid), y: snap(a.y + j, grid) },
      { x: snap(b.x, grid), y: snap(a.y + j, grid) },
      b
    ]);
    polylines.push([
      a,
      { x: snap(a.x + j, grid), y: snap(a.y, grid) },
      { x: snap(a.x + j, grid), y: snap(b.y, grid) },
      b
    ]);
  }

  const escape = Math.max(grid * 12, width * 5 + 50);
  for (const sign of [1, -1]) {
    const ey = snap(a.y + sign * escape, grid);
    const ey2 = snap(b.y + sign * escape, grid);
    polylines.push([
      a,
      { x: snap(a.x, grid), y: ey },
      { x: snap(b.x, grid), y: ey },
      b
    ]);
    if (Math.abs(ey - ey2) >= 0.5) {
      polylines.push([
        a,
        { x: snap(a.x, grid), y: ey },
        { x: snap(b.x, grid), y: ey },
        { x: snap(b.x, grid), y: ey2 },
        { x: snap(b.x, grid), y: snap(b.y, grid) },
        b
      ]);
      polylines.push([
        a,
        { x: snap(a.x, grid), y: ey },
        { x: snap(a.x, grid), y: ey2 },
        { x: snap(b.x, grid), y: ey2 },
        { x: snap(b.x, grid), y: snap(b.y, grid) },
        b
      ]);
    }
    const ex = snap(a.x + sign * escape, grid);
    const ex2 = snap(b.x + sign * escape, grid);
    polylines.push([
      a,
      { x: ex, y: snap(a.y, grid) },
      { x: ex, y: snap(b.y, grid) },
      b
    ]);
    if (Math.abs(ex - ex2) >= 0.5) {
      polylines.push([
        a,
        { x: ex, y: snap(a.y, grid) },
        { x: ex, y: snap(b.y, grid) },
        { x: ex2, y: snap(b.y, grid) },
        b
      ]);
      polylines.push([
        a,
        { x: ex, y: snap(a.y, grid) },
        { x: ex2, y: snap(a.y, grid) },
        { x: ex2, y: snap(b.y, grid) },
        b
      ]);
    }
  }

  const outline = doc.boardOutline?.points ?? [];
  let boardMinX = 0;
  let boardMaxX = 0;
  let boardMinY = 0;
  let boardMaxY = 0;
  let hasBoard = false;
  if (outline.length >= 2) {
    hasBoard = true;
    boardMinX = outline[0].x;
    boardMaxX = outline[0].x;
    boardMinY = outline[0].y;
    boardMaxY = outline[0].y;
    for (let oi = 1; oi < outline.length; oi++) {
      if (outline[oi].x < boardMinX) {
        boardMinX = outline[oi].x;
      }
      if (outline[oi].x > boardMaxX) {
        boardMaxX = outline[oi].x;
      }
      if (outline[oi].y < boardMinY) {
        boardMinY = outline[oi].y;
      }
      if (outline[oi].y > boardMaxY) {
        boardMaxY = outline[oi].y;
      }
    }
    // 仅板内局部/分位走廊（禁止板边环形绕行）
    const midY = snap((boardMinY + boardMaxY) / 2, grid);
    const midX = snap((boardMinX + boardMaxX) / 2, grid);
    const y13 = snap(boardMinY + (boardMaxY - boardMinY) / 3, grid);
    const y23 = snap(boardMinY + (boardMaxY - boardMinY) * 2 / 3, grid);
    const x13 = snap(boardMinX + (boardMaxX - boardMinX) / 3, grid);
    const x23 = snap(boardMinX + (boardMaxX - boardMinX) * 2 / 3, grid);
    // 端点对局部中线（优先于全板走廊）
    const abMidY = snap((a.y + b.y) / 2, grid);
    const abMidX = snap((a.x + b.x) / 2, grid);
    const yList = [abMidY, midY, y13, y23];
    const xList = [abMidX, midX, x13, x23];
    for (let ci = 0; ci < yList.length; ci++) {
      const cy = yList[ci];
      polylines.push([
        a,
        { x: snap(a.x, grid), y: cy },
        { x: snap(b.x, grid), y: cy },
        b
      ]);
    }
    for (let ci = 0; ci < xList.length; ci++) {
      const cx = xList[ci];
      polylines.push([
        a,
        { x: cx, y: snap(a.y, grid) },
        { x: cx, y: snap(b.y, grid) },
        b
      ]);
    }
    // LED/NRST→J1：优先板内外围走廊（避开 MCU 中部竖墙毒干线）
    const hopSpan = dist(a, b);
    if ((isLedNetName(netName) || isNrstNetName(netName)) && hopSpan > 500) {
      const edgeSafe = 120;
      const yTop = snap(boardMinY + edgeSafe, grid);
      const yBot = snap(boardMaxY - edgeSafe, grid);
      const preferTop = ((a.y + b.y) / 2) < ((boardMinY + boardMaxY) / 2);
      const yPref = preferTop ? [yTop, yBot] : [yBot, yTop];
      for (let yi = 0; yi < yPref.length; yi++) {
        const cy = yPref[yi];
        polylines.unshift([
          a,
          { x: snap(a.x, grid), y: cy },
          { x: snap(b.x, grid), y: cy },
          b
        ]);
      }
      const xRight = snap(boardMaxX - edgeSafe, grid);
      polylines.unshift([
        a,
        { x: xRight, y: snap(a.y, grid) },
        { x: xRight, y: snap(b.y, grid) },
        b
      ]);
    }
  }

  // XTAL2：贴着已布 XTAL1 平行偏移，避免抢同一逃逸槽
  if (isXtalNetName(netName)) {
    const stem = xtalPairStem(netName);
    const offs = [grid * 6, grid * 10, -(grid * 6), -(grid * 10)];
    let sibHits = 0;
    for (let ti = 0; ti < doc.tracks.length && sibHits < 4; ti++) {
      const t = doc.tracks[ti];
      if (!t.netId || t.netId === netId) {
        continue;
      }
      const tn = netNameById(doc, t.netId);
      if (!isXtalNetName(tn) || xtalPairStem(tn) !== stem) {
        continue;
      }
      sibHits++;
      const dx = Math.abs(t.end.x - t.start.x);
      const dy = Math.abs(t.end.y - t.start.y);
      for (let oi = 0; oi < offs.length; oi++) {
        const off = offs[oi];
        if (dx >= dy) {
          const y = snap(((t.start.y + t.end.y) / 2) + off, grid);
          polylines.unshift([
            a,
            { x: snap(a.x, grid), y: y },
            { x: snap(b.x, grid), y: y },
            b
          ]);
        } else {
          const x = snap(((t.start.x + t.end.x) / 2) + off, grid);
          polylines.unshift([
            a,
            { x: x, y: snap(a.y, grid) },
            { x: x, y: snap(b.y, grid) },
            b
          ]);
        }
      }
    }
  }

  // 短路径优先；多层偏首段水平；贴板边候选直接丢弃（ClearanceOracle 也会硬拒）
  const edgeBand = 80;
  const filtered: Point2D[][] = [];
  for (let pi = 0; pi < polylines.length; pi++) {
    const path = polylines[pi];
    let nearEdge = false;
    if (hasBoard && path.length >= 3) {
      for (let i = 1; i < path.length - 1; i++) {
        const x = path[i].x;
        const y = path[i].y;
        if ((x - boardMinX) < edgeBand || (boardMaxX - x) < edgeBand ||
          (y - boardMinY) < edgeBand || (boardMaxY - y) < edgeBand) {
          nearEdge = true;
          break;
        }
      }
    }
    if (!nearEdge) {
      filtered.push(path);
    }
  }
  const pool0 = filtered.length > 0 ? filtered : polylines;
  const xtalCorridor = isXtalNetName(netName);
  const preferPeriph = (isLedNetName(netName) || isNrstNetName(netName)) && dist(a, b) > 500;
  // LED→J1：硬性只留外围走廊，丢掉中部横/竖墙（日志毒干线 y≈2434）
  let pool: Point2D[][] = pool0;
  if (preferPeriph && isLedNetName(netName) && hasBoard) {
    const periphBand = 280;
    const rightBand = 360;
    const midYLo = boardMinY + (boardMaxY - boardMinY) * 0.28;
    const midYHi = boardMinY + (boardMaxY - boardMinY) * 0.72;
    const isPeriphPath = (path: Point2D[]): boolean => {
      let longMid = false;
      for (let i = 1; i < path.length - 1; i++) {
        const x = path[i].x;
        const y = path[i].y;
        const nearPeriph = (y - boardMinY) < periphBand || (boardMaxY - y) < periphBand ||
          (boardMaxX - x) < rightBand || (x - boardMinX) < periphBand;
        if (!nearPeriph && y > midYLo && y < midYHi) {
          // 中部长水平段 = 毒墙
          const prev = path[i - 1];
          const dx = Math.abs(path[i].x - prev.x);
          if (dx > 400) {
            longMid = true;
            break;
          }
        }
      }
      return !longMid;
    };
    const periphOnly: Point2D[][] = [];
    for (let pi = 0; pi < pool0.length; pi++) {
      if (isPeriphPath(pool0[pi])) {
        periphOnly.push(pool0[pi]);
      }
    }
    if (periphOnly.length > 0) {
      pool = periphOnly;
    }
  }
  const boxPad = xtalCorridor ? XTAL_CORRIDOR_PAD : 0;
  const boxMinX = Math.min(a.x, b.x) - boxPad;
  const boxMaxX = Math.max(a.x, b.x) + boxPad;
  const boxMinY = Math.min(a.y, b.y) - boxPad;
  const boxMaxY = Math.max(a.y, b.y) + boxPad;
  pool.sort((p: Point2D[], q: Point2D[]): number => {
    const score = (path: Point2D[]): number => {
      let s = pathLength(path);
      if (preferHFirst && path.length >= 2) {
        const dx = Math.abs(path[0].x - path[1].x);
        const dy = Math.abs(path[0].y - path[1].y);
        if (dx >= dy) {
          s -= 500;
        }
      }
      // 多层换层代价更高：拐点≈潜在过孔，优先同层少拐
      s += Math.max(0, path.length - 3) * (preferHFirst ? 220 : 80);
      // XTAL：惩罚飞出 a–b 局部盒的横穿折点，避免画满板宽水平墙堵 NRST
      if (xtalCorridor && path.length >= 3) {
        for (let i = 1; i < path.length - 1; i++) {
          const x = path[i].x;
          const y = path[i].y;
          if (x < boxMinX || x > boxMaxX || y < boxMinY || y > boxMaxY) {
            const ox = x < boxMinX ? (boxMinX - x) : (x > boxMaxX ? (x - boxMaxX) : 0);
            const oy = y < boxMinY ? (boxMinY - y) : (y > boxMaxY ? (y - boxMaxY) : 0);
            s += (ox + oy) * 3 + 400;
          }
        }
      }
      // LED/NRST 长跳：奖励贴板上/下/右侧外围，惩罚中部横穿
      if (preferPeriph && hasBoard && path.length >= 3) {
        let periphHits = 0;
        let midHits = 0;
        const midY0 = (boardMinY + boardMaxY) / 2;
        for (let i = 1; i < path.length - 1; i++) {
          const x = path[i].x;
          const y = path[i].y;
          if ((y - boardMinY) < 220 || (boardMaxY - y) < 220 || (boardMaxX - x) < 320) {
            periphHits++;
          }
          if (Math.abs(y - midY0) < (boardMaxY - boardMinY) * 0.22) {
            midHits++;
          }
        }
        s -= periphHits * 350;
        s += midHits * 280;
        if (isLedNetName(netName)) {
          s += midHits * 600;
        }
      }
      // 总线：惩罚超长竖干线（日志 L0_R x=1270 一柱封死 XTAL/NRST）
      if (isBusNetName(netName) && path.length >= 2) {
        for (let i = 1; i < path.length; i++) {
          const dx = Math.abs(path[i].x - path[i - 1].x);
          const dy = Math.abs(path[i].y - path[i - 1].y);
          if (dx < 0.5 && dy > 700) {
            s += (dy - 700) * 0.8 + 350;
          }
        }
      }
      return s;
    };
    return score(p) - score(q);
  });
  // 邻脚/晶体：U 绕必须排在最短 L 之前（否则全被 pad_block 烧预算）
  const span = dist(a, b);
  const maxDetSpan = isXtalNetName(netName) ? XTAL_SIBLING_DETOUR_MAX_SPAN : SIBLING_DETOUR_MAX_SPAN;
  if (span > 0.5 && span <= maxDetSpan) {
    const intervening = findInterveningPadObstacles(a, b, obs, need);
    if (intervening.length > 0) {
      const detours = buildSiblingDetourPolylines(a, b, intervening, grid, need);
      if (detours.length > 0) {
        const merged: Point2D[][] = [];
        const dCap = Math.min(detours.length, 24);
        for (let di = 0; di < dCap; di++) {
          merged.push(detours[di]);
        }
        for (let pi = 0; pi < pool.length; pi++) {
          merged.push(pool[pi]);
        }
        return merged;
      }
    }
  }
  return pool;
}

interface PendingSeg {
  layer: PcbLayerId;
  a: Point2D;
  b: Point2D;
}

interface PendingVia {
  pos: Point2D;
  /** 换层起止；缺省则提交时回退到 pair.h/pair.v */
  fromLayer?: PcbLayerId;
  toLayer?: PcbLayerId;
}

/** fanout 过孔优选结果（ArkTS 闭包不可安全写外层 let） */
interface FanoutViaPick {
  vp: Point2D | null;
  score: number;
}

/** 两铜层之间（含端点）的层列表，供 via 校验/几何；同层则退回整栈通孔 */
function layersBetweenInclusive(copper: PcbLayerId[], a: PcbLayerId, b: PcbLayerId): PcbLayerId[] {
  const fi = copper.indexOf(a);
  const ti = copper.indexOf(b);
  if (fi < 0 || ti < 0 || copper.length === 0) {
    return copper.length > 0 ? copper.slice() : [PcbLayerId.F_CU, PcbLayerId.B_CU];
  }
  if (fi === ti) {
    return copper.slice();
  }
  const lo = Math.min(fi, ti);
  const hi = Math.max(fi, ti);
  return copper.slice(lo, hi + 1);
}

/** Cu≥4 且 H/V 均非顶层：端点需 fanout via 才能连到 F.Cu SMD 焊盘 */
function needsPadFanoutVia(doc: PcbDocument, pair: NetLayerPair): boolean {
  const copper = copperLayersFromStack(doc.layerStack);
  if (copper.length < 4) {
    return false;
  }
  const top = copper[0];
  return pair.h !== top && pair.v !== top;
}

/**
 * 在 anchor 附近放 fanout/换层过孔；必要时沿 prevLayer 微移并补引出段。
 * aggressive=true：扩大搜索半径（TSSOP/电源密集区 fanout_via_block）。
 * @returns 新的锚点（可能被 nudge）；失败 null
 */
function placeNudgeVia(
  doc: PcbDocument, anchor: Point2D, prevLayer: PcbLayerId | null,
  netId: string, width: number, grid: number, viaDia: number,
  viaLayers: PcbLayerId[], pendingSegs: PendingSeg[], pendingVias: PendingVia[],
  preferNear: boolean, aggressive: boolean, deadlineMs?: number,
  viaFrom?: PcbLayerId, viaTo?: PcbLayerId
): Point2D | null {
  const pastDeadline = (): boolean => {
    return deadlineMs !== undefined && deadlineMs > 0 && Date.now() > deadlineMs;
  };
  // 同网过孔共享：锚点附近已有 via 则复用（直连失败再试 L/Z stub，避免 fanout_via_block）
  // aggressive（总线/QFP）加大共享半径，减少脚间再插新孔
  const shareR = Math.max(viaDia * 2.5, grid * 8) * (aggressive ? 3.8 : 1.4);
  /** 焊盘↔同网 via 是否已有铜桥（BGA dogbone / 前 hop stub） */
  const hasPadViaBridge = (viaPos: Point2D): boolean => {
    if (dist(anchor, viaPos) < viaDia * 0.9) {
      return true;
    }
    for (let ti = 0; ti < doc.tracks.length; ti++) {
      const t = doc.tracks[ti];
      if (t.netId !== netId) {
        continue;
      }
      const nearA = dist(t.start, anchor) < viaDia || dist(t.end, anchor) < viaDia;
      const nearV = dist(t.start, viaPos) < viaDia || dist(t.end, viaPos) < viaDia;
      if (nearA && nearV) {
        return true;
      }
    }
    return false;
  };
  const tryShareStub = (viaPos: Point2D): boolean => {
    if (prevLayer === null || dist(anchor, viaPos) < 0.5) {
      return true;
    }
    const ly = prevLayer;
    if (pathClearBlockReason(doc, ly, anchor, viaPos, netId, width,
      doc.tracks, doc.vias) === null) {
      const stubShare: PendingSeg = { layer: ly, a: anchor, b: viaPos };
      pendingSegs.push(stubShare);
      return true;
    }
    // L：先水平再垂直 / 先垂直再水平
    const midH: Point2D = { x: viaPos.x, y: anchor.y };
    const midV: Point2D = { x: anchor.x, y: viaPos.y };
    const tryL = (mid: Point2D): boolean => {
      if (dist(anchor, mid) < 0.5 && dist(mid, viaPos) < 0.5) {
        return false;
      }
      if (pathClearBlockReason(doc, ly, anchor, mid, netId, width,
        doc.tracks, doc.vias) !== null) {
        return false;
      }
      if (pathClearBlockReason(doc, ly, mid, viaPos, netId, width,
        doc.tracks, doc.vias) !== null) {
        return false;
      }
      if (dist(anchor, mid) >= 0.5) {
        const s1: PendingSeg = { layer: ly, a: anchor, b: mid };
        pendingSegs.push(s1);
      }
      if (dist(mid, viaPos) >= 0.5) {
        const s2: PendingSeg = { layer: ly, a: mid, b: viaPos };
        pendingSegs.push(s2);
      }
      return true;
    };
    if (tryL(midH)) {
      return true;
    }
    if (tryL(midV)) {
      return true;
    }
    // Z：侧向绕开邻脚/异网 via（TSSOP 密集区直 L 常被挡）
    const jog = Math.max(grid * 4, viaDia);
    const zMids: Point2D[] = [
      { x: anchor.x + jog, y: viaPos.y },
      { x: anchor.x - jog, y: viaPos.y },
      { x: viaPos.x, y: anchor.y + jog },
      { x: viaPos.x, y: anchor.y - jog }
    ];
    for (let zi = 0; zi < zMids.length; zi++) {
      const zm = zMids[zi];
      if (pathClearBlockReason(doc, ly, anchor, zm, netId, width,
        doc.tracks, doc.vias) !== null) {
        continue;
      }
      if (pathClearBlockReason(doc, ly, zm, viaPos, netId, width,
        doc.tracks, doc.vias) !== null) {
        continue;
      }
      if (dist(anchor, zm) >= 0.5) {
        const zs1: PendingSeg = { layer: ly, a: anchor, b: zm };
        pendingSegs.push(zs1);
      }
      if (dist(zm, viaPos) >= 0.5) {
        const zs2: PendingSeg = { layer: ly, a: zm, b: viaPos };
        pendingSegs.push(zs2);
      }
      return true;
    }
    return false;
  };
  for (let i = 0; i < doc.vias.length; i++) {
    const v = doc.vias[i];
    if (v.netId !== netId || netId.length === 0) {
      continue;
    }
    if (dist(v.position, anchor) <= shareR) {
      if (tryShareStub(v.position)) {
        return { x: v.position.x, y: v.position.y };
      }
      // Soft reuse：已有铜桥或 via≈焊盘时直接以 via 为锚（不再搜新孔堵死走廊）
      if (hasPadViaBridge(v.position)) {
        return { x: v.position.x, y: v.position.y };
      }
    }
  }
  for (let vi = 0; vi < pendingVias.length; vi++) {
    if (dist(pendingVias[vi].pos, anchor) <= shareR) {
      if (tryShareStub(pendingVias[vi].pos)) {
        return { x: pendingVias[vi].pos.x, y: pendingVias[vi].pos.y };
      }
      if (hasPadViaBridge(pendingVias[vi].pos)) {
        return { x: pendingVias[vi].pos.x, y: pendingVias[vi].pos.y };
      }
    }
  }

  const tryPush = (vp: Point2D): boolean => {
    if (!viaClearAt(doc, vp, netId, viaDia, viaLayers, doc.tracks, doc.vias)) {
      return false;
    }
    for (let vi = 0; vi < pendingVias.length; vi++) {
      if (dist(pendingVias[vi].pos, vp) < viaDia) {
        return false;
      }
    }
    if (prevLayer !== null && dist(anchor, vp) >= 0.5) {
      if (pathClearBlockReason(doc, prevLayer, anchor, vp, netId, width,
        doc.tracks, doc.vias) !== null) {
        return false;
      }
      const stub: PendingSeg = { layer: prevLayer, a: anchor, b: vp };
      pendingSegs.push(stub);
    }
    const pv: PendingVia = {
      pos: vp,
      fromLayer: viaFrom,
      toLayer: viaTo
    };
    pendingVias.push(pv);
    return true;
  };
  const atAnchor: Point2D = { x: anchor.x, y: anchor.y };
  if (tryPush(atAnchor)) {
    return atAnchor;
  }
  // 有截止时大幅收缩搜索环，避免单次 fanout 吃掉整段 hop 墙
  const timed = deadlineMs !== undefined && deadlineMs > 0;
  const nudges: number[] = timed
    ? [
      grid * 4, 0 - grid * 4, grid * 8, 0 - grid * 8,
      grid * 12, 0 - grid * 12, grid * 18, 0 - grid * 18,
      grid * 28, 0 - grid * 28, grid * 40, 0 - grid * 40
    ]
    : [
      grid * 4, 0 - grid * 4, grid * 8, 0 - grid * 8,
      grid * 12, 0 - grid * 12, grid * 18, 0 - grid * 18,
      grid * 28, 0 - grid * 28, grid * 40, 0 - grid * 40,
      grid * 56, 0 - grid * 56, grid * 72, 0 - grid * 72,
      grid * 90, 0 - grid * 90, grid * 120, 0 - grid * 120
    ];
  if (aggressive && !timed) {
    nudges.push(grid * 150, 0 - grid * 150, grid * 180, 0 - grid * 180,
      grid * 220, 0 - grid * 220, grid * 280, 0 - grid * 280);
  } else if (aggressive && timed) {
    nudges.push(grid * 56, 0 - grid * 56, grid * 72, 0 - grid * 72);
  }
  // ArkTS：闭包写 let 后外层收窄成 never，用盒对象持有
  const pick: FanoutViaPick = {
    vp: null,
    score: preferNear ? Number.POSITIVE_INFINITY : -1
  };
  const stubClear = (from: Point2D, to: Point2D): boolean => {
    if (prevLayer === null || dist(from, to) < 0.5) {
      return true;
    }
    return pathClearBlockReason(doc, prevLayer, from, to, netId, width,
      doc.tracks, doc.vias) === null;
  };
  /** 轴对齐或 L 形出线均可达 via */
  const reachClear = (vp: Point2D): boolean => {
    if (prevLayer === null) {
      return true;
    }
    const dx = Math.abs(vp.x - anchor.x);
    const dy = Math.abs(vp.y - anchor.y);
    if (dx < 0.5 || dy < 0.5) {
      return stubClear(anchor, vp);
    }
    const midH: Point2D = { x: vp.x, y: anchor.y };
    const midV: Point2D = { x: anchor.x, y: vp.y };
    return (stubClear(anchor, midH) && stubClear(midH, vp)) ||
      (stubClear(anchor, midV) && stubClear(midV, vp));
  };
  const consider = (vp: Point2D): void => {
    if (dist(anchor, vp) < 0.5) {
      return;
    }
    if (!reachClear(vp)) {
      return;
    }
    if (!viaClearAt(doc, vp, netId, viaDia, viaLayers, doc.tracks, doc.vias)) {
      return;
    }
    for (let vi = 0; vi < pendingVias.length; vi++) {
      if (dist(pendingVias[vi].pos, vp) < viaDia) {
        return;
      }
    }
    const d = dist(anchor, vp);
    if (preferNear) {
      if (d < pick.score) {
        pick.score = d;
        pick.vp = vp;
      }
    } else {
      // 远 fanout：偏好离开焊盘但不无限远（约 24~48 grid）
      const sweet = aggressive ? grid * 48 : grid * 24;
      const score = d <= sweet ? d : (sweet - (d - sweet) * 0.35);
      if (score > pick.score) {
        pick.score = score;
        pick.vp = vp;
      }
    }
  };
  for (let ni = 0; ni < nudges.length; ni++) {
    if (pastDeadline()) {
      break;
    }
    const nOff = nudges[ni];
    consider({ x: snap(anchor.x + nOff, grid), y: anchor.y });
    consider({ x: anchor.x, y: snap(anchor.y + nOff, grid) });
  }
  // 对角环：fanout 被邻脚/过孔墙死时轴对齐不够
  const ring = timed
    ? (aggressive
      ? [grid * 8, grid * 14, grid * 22, grid * 34, grid * 50]
      : [grid * 8, grid * 14, grid * 22, grid * 34])
    : (aggressive
      ? [grid * 8, grid * 14, grid * 22, grid * 34, grid * 50, grid * 70, grid * 96,
        grid * 120, grid * 150, grid * 190, grid * 240]
      : [grid * 8, grid * 14, grid * 22, grid * 34, grid * 50, grid * 70, grid * 96]);
  for (let ri = 0; ri < ring.length; ri++) {
    if (pastDeadline()) {
      break;
    }
    const r = ring[ri];
    for (const sx of [1, -1]) {
      for (const sy of [1, -1]) {
        consider({
          x: snap(anchor.x + sx * r, grid),
          y: snap(anchor.y + sy * r, grid)
        });
      }
    }
  }
  // 密集区：再扫 8 向中距离环（含斜向 1:2）；有截止时跳过
  if (aggressive && !timed && !pastDeadline()) {
    const midR = [grid * 30, grid * 55, grid * 85, grid * 130];
    for (let mi = 0; mi < midR.length; mi++) {
      if (pastDeadline()) {
        break;
      }
      const r = midR[mi];
      consider({ x: snap(anchor.x + r, grid), y: snap(anchor.y + r * 0.5, grid) });
      consider({ x: snap(anchor.x + r, grid), y: snap(anchor.y - r * 0.5, grid) });
      consider({ x: snap(anchor.x - r, grid), y: snap(anchor.y + r * 0.5, grid) });
      consider({ x: snap(anchor.x - r, grid), y: snap(anchor.y - r * 0.5, grid) });
      consider({ x: snap(anchor.x + r * 0.5, grid), y: snap(anchor.y + r, grid) });
      consider({ x: snap(anchor.x - r * 0.5, grid), y: snap(anchor.y + r, grid) });
      consider({ x: snap(anchor.x + r * 0.5, grid), y: snap(anchor.y - r, grid) });
      consider({ x: snap(anchor.x - r * 0.5, grid), y: snap(anchor.y - r, grid) });
    }
  }
  const vpOrNull = pick.vp;
  if (vpOrNull === null) {
    return null;
  }
  const bestVp: Point2D = { x: vpOrNull.x, y: vpOrNull.y };
  if (prevLayer !== null && dist(anchor, bestVp) >= 0.5) {
    const dx = Math.abs(bestVp.x - anchor.x);
    const dy = Math.abs(bestVp.y - anchor.y);
    if (dx < 0.5 || dy < 0.5) {
      const stub: PendingSeg = { layer: prevLayer, a: anchor, b: bestVp };
      pendingSegs.push(stub);
    } else {
      const midH: Point2D = { x: bestVp.x, y: anchor.y };
      const midV: Point2D = { x: anchor.x, y: bestVp.y };
      const useH = stubClear(anchor, midH) && stubClear(midH, bestVp);
      const mid = useH ? midH : midV;
      const s0: PendingSeg = { layer: prevLayer, a: anchor, b: mid };
      const s1: PendingSeg = { layer: prevLayer, a: mid, b: bestVp };
      pendingSegs.push(s0);
      pendingSegs.push(s1);
    }
  }
  const pvBest: PendingVia = {
    pos: bestVp,
    fromLayer: viaFrom,
    toLayer: viaTo
  };
  pendingVias.push(pvBest);
  return bestVp;
}

/** 焊盘周围异网焊盘密度（TSSOP/QFP 脚间 fanout 决策） */
function countForeignPadsNear(doc: PcbDocument, pos: Point2D, netId: string,
  radius: number): number {
  let n = 0;
  const r2 = radius * radius;
  for (let fi = 0; fi < doc.footprints.length; fi++) {
    const fp = doc.footprints[fi];
    for (let pi = 0; pi < fp.pads.length; pi++) {
      const pad = fp.pads[pi];
      const pNet = pad.netId ?? '';
      if (pNet.length > 0 && pNet === netId) {
        continue;
      }
      const wp = padWorldPosition(fp, pad);
      const dx = wp.x - pos.x;
      const dy = wp.y - pos.y;
      if (dx * dx + dy * dy <= r2) {
        n++;
      }
    }
  }
  return n;
}

/**
 * fanout via：近距优先；失败或密集/电源/XTAL 时改远距+扩大半径。
 */
function placeFanoutViaSmart(
  doc: PcbDocument, pad: Point2D, stubLayer: PcbLayerId,
  netId: string, netName: string, width: number, grid: number, viaDia: number,
  viaLayers: PcbLayerId[], pendingSegs: PendingSeg[], pendingVias: PendingVia[],
  deadlineMs?: number, targetInner?: PcbLayerId
): Point2D | null {
  const power = isPowerNetName(netName);
  const dense = countForeignPadsNear(doc, pad, netId, viaDia * 5) >= 3;
  const bus = isBusNetName(netName);
  // 电源：近距轻量 fanout（远距+aggressive 会扫爆 viaClearAt → ANR）
  // 总线/XTAL/密集：直接远距 VIP，避开 QFP 脚间 padHits 主导的 fanout_via_block
  const preferFar = !power && (isXtalNetName(netName) || bus || dense);
  const aggressive = !power && (preferFar || dense || bus);
  const toLy = targetInner !== undefined ? targetInner : stubLayer;
  if (!preferFar) {
    const near = placeNudgeVia(doc, pad, stubLayer, netId, width, grid, viaDia, viaLayers,
      pendingSegs, pendingVias, true, false, deadlineMs, stubLayer, toLy);
    if (near !== null) {
      return near;
    }
  }
  if (power) {
    // 电源近距失败后只再试一轮非 aggressive 短环
    return placeNudgeVia(doc, pad, stubLayer, netId, width, grid, viaDia, viaLayers,
      pendingSegs, pendingVias, false, false, deadlineMs, stubLayer, toLy);
  }
  return placeNudgeVia(doc, pad, stubLayer, netId, width, grid, viaDia, viaLayers,
    pendingSegs, pendingVias, false, aggressive, deadlineMs, stubLayer, toLy);
}

/**
 * 校验折线各段/换层过孔是否与异网铜冲突；通过则写入 doc。
 * Cu≥4 内层走线时在端点补 fanout via（连 F.Cu 焊盘）。
 * @returns 写入的走线段数；失败返回 -1
 */
function tryCommitOrthoPath(doc: PcbDocument, ptsIn: Point2D[], pair: NetLayerPair,
  netId: string, netName: string, width: number, lastBlock: BlockBox,
  deadlineMs?: number): number {
  const pts = compressPathPoints(ptsIn);
  if (pts.length < 2) {
    return -1;
  }
  if (deadlineMs !== undefined && deadlineMs > 0 && Date.now() > deadlineMs) {
    lastBlock.reason = 'hop_deadline';
    return -1;
  }

  const grid: number = doc.metadata.gridSize ?? 5;
  const viaDia = viaDiameter(doc);
  const copper = copperLayersFromStack(doc.layerStack);
  const stubLayer = copper.length > 0 ? copper[0] : PcbLayerId.F_CU;
  const fanout = needsPadFanoutVia(doc, pair);
  // fanout/换层校验只用跨度层（F↔In1 或 In1↔In2），避免全栈毒化导致假 fanout_via_block
  const fanSpanLayers = layersBetweenInclusive(copper, stubLayer, pair.h);

  const pendingSegs: PendingSeg[] = [];
  const pendingVias: PendingVia[] = [];
  let work: Point2D[] = [];
  for (let i = 0; i < pts.length; i++) {
    const pt: Point2D = { x: pts[i].x, y: pts[i].y };
    work.push(pt);
  }

  const fanDead = fanoutDeadlineMs(netName, deadlineMs);
  // 起点 fanout：F.Cu 短 stub（若需微移）+ 跨度过孔；内层从过孔起走
  if (fanout) {
    const pad0: Point2D = { x: work[0].x, y: work[0].y };
    const vp = placeFanoutViaSmart(doc, pad0, stubLayer, netId, netName, width, grid, viaDia,
      fanSpanLayers, pendingSegs, pendingVias, fanDead, pair.h);
    if (vp === null) {
      lastBlock.reason =
        `fanout_via_block start @(${Math.round(pad0.x)},${Math.round(pad0.y)}) ` +
        `net=${netName || netId}`;
      return -1;
    }
    const startVia: Point2D = { x: vp.x, y: vp.y };
    work[0] = startVia;
    // 微移过孔后首段可能变斜：强制再正交化
    work = expandPathToManhattan(work, true);
    if (work.length < 2) {
      lastBlock.reason = `fanout_ortho_fail start net=${netName || netId}`;
      return -1;
    }
  }

  let prevLayer = segmentLayer(pair, work[0], work[1]);
  for (let j = 0; j < work.length - 1; j++) {
    const a = work[j];
    const b = work[j + 1];
    // 真 45°（|dx|≈|dy|）保留斜边；其它斜边拆 L
    if (Math.abs(a.x - b.x) >= 0.5 && Math.abs(a.y - b.y) >= 0.5) {
      const adx = Math.abs(a.x - b.x);
      const ady = Math.abs(a.y - b.y);
      if (Math.abs(adx - ady) >= 1.0) {
        const midH: Point2D = { x: b.x, y: a.y };
        const midV: Point2D = { x: a.x, y: b.y };
        work.splice(j + 1, 0, midH);
        if (dist(a, midH) < 0.5) {
          work[j + 1] = midV;
        }
        continue;
      }
      // else: fall through as 45° segment
    }
    let segA: Point2D = { x: a.x, y: a.y };
    const ly = segmentLayer(pair, segA, b);
    if (ly !== prevLayer) {
      if (deadlineMs !== undefined && deadlineMs > 0 && Date.now() > deadlineMs) {
        lastBlock.reason = 'hop_deadline';
        return -1;
      }
      const cornerSpan = layersBetweenInclusive(copper, prevLayer, ly);
      let viaPos = placeNudgeVia(doc, segA, prevLayer, netId, width, grid, viaDia, cornerSpan,
        pendingSegs, pendingVias, true, false, fanDead, prevLayer, ly);
      if (viaPos === null) {
        viaPos = placeNudgeVia(doc, segA, prevLayer, netId, width, grid, viaDia, cornerSpan,
          pendingSegs, pendingVias, false, !isPowerNetName(netName), fanDead, prevLayer, ly);
      }
      if (viaPos === null) {
        lastBlock.reason =
          `via_pad_block @(${Math.round(a.x)},${Math.round(a.y)}) net=${netName || netId}`;
        return -1;
      }
      // 拐角 via 微移后与 b 可能不对齐：补正交折点
      if (Math.abs(viaPos.x - b.x) >= 0.5 && Math.abs(viaPos.y - b.y) >= 0.5) {
        const jog: Point2D = { x: viaPos.x, y: b.y };
        work[j] = viaPos;
        work.splice(j + 1, 0, jog);
        segA = viaPos;
        prevLayer = ly;
        // 先提交 via→jog
        const blockJog = pathClearBlockReason(doc, ly, segA, jog, netId, width,
          doc.tracks, doc.vias);
        if (blockJog !== null) {
          lastBlock.reason = blockJog;
          return -1;
        }
        const segJog: PendingSeg = { layer: ly, a: segA, b: jog };
        pendingSegs.push(segJog);
        continue;
      }
      segA = viaPos;
      prevLayer = ly;
    }
    const block = pathClearBlockReason(doc, ly, segA, b, netId, width, doc.tracks, doc.vias);
    if (block !== null) {
      lastBlock.reason = block;
      return -1;
    }
    const seg: PendingSeg = { layer: ly, a: segA, b: b };
    pendingSegs.push(seg);
  }

  // 终点 fanout：内层止于过孔，F.Cu stub 连回焊盘
  if (fanout) {
    const padEnd = pts[pts.length - 1];
    let already = false;
    for (let vi = 0; vi < pendingVias.length; vi++) {
      if (dist(pendingVias[vi].pos, padEnd) < viaDia) {
        already = true;
        break;
      }
    }
    if (!already) {
      const vp = placeFanoutViaSmart(doc, padEnd, stubLayer, netId, netName, width, grid, viaDia,
        fanSpanLayers, pendingSegs, pendingVias, fanDead, pair.h);
      if (vp === null) {
        lastBlock.reason =
          `fanout_via_block end @(${Math.round(padEnd.x)},${Math.round(padEnd.y)}) ` +
          `net=${netName || netId}`;
        return -1;
      }
      if (pendingSegs.length > 0 && dist(vp, padEnd) >= 0.5) {
        const endVia: Point2D = { x: vp.x, y: vp.y };
        const lastSeg = pendingSegs[pendingSegs.length - 1];
        // 末段终点改到过孔；若变斜则拆成两段
        if (Math.abs(lastSeg.a.x - endVia.x) >= 0.5 &&
          Math.abs(lastSeg.a.y - endVia.y) >= 0.5) {
          const jog: Point2D = { x: endVia.x, y: lastSeg.a.y };
          lastSeg.b = jog;
          const ly2 = segmentLayer(pair, jog, endVia);
          const block2 = pathClearBlockReason(doc, ly2, jog, endVia, netId, width,
            doc.tracks, doc.vias);
          if (block2 !== null) {
            lastBlock.reason = block2;
            return -1;
          }
          const seg2: PendingSeg = { layer: ly2, a: jog, b: endVia };
          pendingSegs.push(seg2);
        } else {
          lastSeg.b = endVia;
        }
      }
    }
  }

  for (let i = 0; i < pendingVias.length; i++) {
    const pv = pendingVias[i];
    const fl = pv.fromLayer !== undefined ? pv.fromLayer : pair.h;
    const tl = pv.toLayer !== undefined ? pv.toLayer : pair.v;
    addThroughVia(doc, pv.pos, netId, netName, fl, tl);
  }
  // 回流过孔改到布线完成后统一补（addDeferredReturnVias），避免途中毒化走廊
  let segs = 0;
  for (let i = 0; i < pendingSegs.length; i++) {
    const s = pendingSegs[i];
    segs += addSegment(doc, s.layer, s.a, s.b, netId, netName, width);
  }
  return segs;
}

/**
 * 校验折线各段/换层过孔是否与异网铜冲突；通过则写入 doc。
 * 斜边自动拆曼哈顿（H-first / V-first 各试一次）。
 * @returns 写入的走线段数；失败返回 -1
 */
function tryCommitPolyline(doc: PcbDocument, path: Point2D[], pair: NetLayerPair,
  netId: string, netName: string, width: number, lastBlock: BlockBox,
  deadlineMs?: number): number {
  if (path.length < 2) {
    return -1;
  }
  if (deadlineMs !== undefined && deadlineMs > 0 && Date.now() > deadlineMs) {
    lastBlock.reason = 'hop_deadline';
    return -1;
  }
  // 含真 45° 的路径：先尝试不拆曼哈顿
  let has45 = false;
  for (let i = 0; i < path.length - 1; i++) {
    const dx = Math.abs(path[i].x - path[i + 1].x);
    const dy = Math.abs(path[i].y - path[i + 1].y);
    if (dx >= 0.5 && dy >= 0.5 && Math.abs(dx - dy) < 1.0) {
      has45 = true;
      break;
    }
  }
  if (has45) {
    const segs45 = tryCommitOrthoPath(doc, path, pair, netId, netName, width, lastBlock,
      deadlineMs);
    if (segs45 >= 0) {
      return segs45;
    }
  }
  const variants: Point2D[][] = [
    expandPathToManhattan(path, true),
    expandPathToManhattan(path, false)
  ];
  let bestReason = '';
  for (let vi = 0; vi < variants.length; vi++) {
    if (deadlineMs !== undefined && deadlineMs > 0 && Date.now() > deadlineMs) {
      lastBlock.reason = 'hop_deadline';
      break;
    }
    const segs = tryCommitOrthoPath(doc, variants[vi], pair, netId, netName, width, lastBlock,
      deadlineMs);
    if (segs >= 0) {
      return segs;
    }
    if (lastBlock.reason.length > 0) {
      bestReason = lastBlock.reason;
    }
  }
  if (bestReason.length > 0) {
    lastBlock.reason = bestReason;
  }
  return -1;
}

/**
 * 层对尝试序（ANR 硬帽，≤PAIR_LAYER_ATTEMPT_MAX）：
 * 电源/地：只钉主层（B.Cu / power_h），禁止溢到信号对（否则 VCC 在 In2 被 L*_R 堵死并刷 FAIL）
 * 总线/LED/NRST：主 HV → 负载最低 alt HV → 同层 sameH
 * 其它：sameH → sameV →（若还有空位）主 HV / alt
 */
function layerPairAttempts(pair: NetLayerPair, netName: string = ''): NetLayerPair[] {
  const out: NetLayerPair[] = [];
  const push = (p: NetLayerPair): void => {
    if (out.length >= PAIR_LAYER_ATTEMPT_MAX) {
      return;
    }
    for (let i = 0; i < out.length; i++) {
      if (out[i].h === p.h && out[i].v === p.v) {
        return;
      }
    }
    out.push(p);
  };
  // VCC/GND 绝不能试 In1/In2 等信号对：日志里 VCC last=track_* net=L4_R on In2 即由此产生
  if (isPowerNetName(netName) || isGndNetName(netName)) {
    push(pair);
    return out;
  }
  const preferHv = isBusNetName(netName) || isLedNetName(netName) || isNrstNetName(netName);
  const sameH: NetLayerPair = { h: pair.h, v: pair.h };
  const sameV: NetLayerPair = { h: pair.v, v: pair.v };
  if (preferHv) {
    push(pair);
  } else if (pair.h !== pair.v) {
    push(sameH);
    push(sameV);
    push(pair);
  } else {
    push(pair);
  }
  // 优先补 alt HV，推动 In3/In4
  const altIdx: number[] = [];
  for (let i = 0; i < activeSignalLayerPairs.length; i++) {
    altIdx.push(i);
  }
  altIdx.sort((a: number, b: number): number => {
    return (signalPairUseCount[a] ?? 0) - (signalPairUseCount[b] ?? 0);
  });
  for (let k = 0; k < altIdx.length; k++) {
    const alt = activeSignalLayerPairs[altIdx[k]];
    if (alt.h === pair.h && alt.v === pair.v) {
      continue;
    }
    push(alt);
    break;
  }
  // 总线类：再留一条同层兜底（若还有空位）
  if (preferHv && pair.h !== pair.v) {
    push(sameH);
  }
  return out;
}

function toMazePair(pair: NetLayerPair): MazeLayerPair {
  const mp: MazeLayerPair = { h: pair.h, v: pair.v };
  return mp;
}

/**
 * A* 兜底：粗格硬 clearance → 细格硬 → 细格略松搜索（提交仍硬校验）。
 * @param light 早切/pad 占优时只跑一档，避免烧满三档 maze
 * @returns 写入段数；未找到返回 -1
 */
function tryMazeCommit(doc: PcbDocument, pair: NetLayerPair, a: Point2D, b: Point2D,
  netId: string, netName: string, grid: number, width: number, lastBlock: BlockBox,
  light: boolean = false): number {
  // Switch-Box：沿全局指南盒内拼接，优先于全板迷宫
  if (activeGlobalGuides !== null) {
    const g = activeGlobalGuides.get(netId);
    if (g !== undefined) {
      const mazePair = toMazePair(pair);
      const sbox = routeSwitchBoxCorridor(
        doc, mazePair, a, b, netId, width, grid, g, g.preferHFirst);
      if (sbox.length >= 2) {
        const segs = tryCommitPolyline(doc, sbox, pair, netId, netName, width, lastBlock);
        if (segs >= 0) {
          tracePcb('AUTO_PAIR_SBOX',
            `${netName || netId} pts=${sbox.length} segs=${segs}`);
          return segs;
        }
      }
    }
  }
  const fine = Math.max(2, Math.floor(grid / 2));
  const tries: number[][] = [];
  // [grid, scale*100]
  tries.push([grid, 100]);
  if (!light) {
    if (fine < grid) {
      tries.push([fine, 100]);
      tries.push([fine, 88]);
    } else {
      tries.push([grid, 88]);
    }
  }
  const mazePair = toMazePair(pair);
  for (let ti = 0; ti < tries.length; ti++) {
    const g = tries[ti][0];
    const scaleTry = tries[ti][1] / 100;
    let path = mazeRouteRectilinear(doc, mazePair, a, b, netId, width, g, scaleTry);
    // 双向：正向失败则试反向并翻转
    if (path.length < 2) {
      const rev = mazeRouteRectilinear(doc, mazePair, b, a, netId, width, g, scaleTry);
      if (rev.length >= 2) {
        path = rev.slice().reverse();
      }
    }
    if (path.length < 2) {
      continue;
    }
    const segs = tryCommitPolyline(doc, path, pair, netId, netName, width, lastBlock);
    if (segs >= 0) {
      tracePcb('AUTO_PAIR_MAZE',
        `${netName || netId} grid=${g} scale=${scaleTry.toFixed(2)} ` +
        `pts=${path.length} segs=${segs} sameLayer=${pair.h === pair.v ? 1 : 0}`);
      return segs;
    }
  }
  // light / 同步路径：重型兜底带硬预算，避免主线程卡死
  if (light) {
    return -1;
  }
  const room = routeRoomModel(doc, pair.h, a, b, netId, width, 8, ROOM_HARD_BUDGET_MS);
  if (room.length >= 2) {
    const segs = tryCommitPolyline(doc, room, pair, netId, netName, width, lastBlock);
    if (segs >= 0) {
      tracePcb('AUTO_PAIR_ROOM', `${netName || netId} pts=${room.length} segs=${segs}`);
      return segs;
    }
  }
  const poly = routePolyRoom(doc, pair.h, a, b, netId, width, POLY_HARD_BUDGET_MS);
  if (poly.length >= 2) {
    const segs = tryCommitPolyline(doc, poly, pair, netId, netName, width, lastBlock);
    if (segs >= 0) {
      tracePcb('AUTO_PAIR_POLYROOM', `${netName || netId} pts=${poly.length} segs=${segs}`);
      return segs;
    }
  }
  const gl = routeGridlessVisible(doc, pair.h, a, b, netId, width, GRIDLESS_HARD_BUDGET_MS);
  if (gl.length >= 2) {
    const segs = tryCommitPolyline(doc, gl, pair, netId, netName, width, lastBlock);
    if (segs >= 0) {
      tracePcb('AUTO_PAIR_GRIDLESS', `${netName || netId} pts=${gl.length} segs=${segs}`);
      return segs;
    }
  }
  return -1;
}

async function tryMazeCommitAsync(doc: PcbDocument, pair: NetLayerPair, a: Point2D, b: Point2D,
  netId: string, netName: string, grid: number, width: number,
  lastBlock: BlockBox, light: boolean = false,
  deadlineMs: number = 0): Promise<number> {
  const dead = deadlineMs > 0 ? deadlineMs : (Date.now() + PAIR_HOP_WALL_MS);
  const remain = (): number => dead - Date.now();
  if (remain() < 20) {
    return -1;
  }
  if (activeGlobalGuides !== null) {
    const guide = activeGlobalGuides.get(netId);
    if (guide !== undefined && remain() >= 40) {
      await yieldToUi();
      if (remain() < 20) {
        return -1;
      }
      const mazePair0 = toMazePair(pair);
      const sbox = routeSwitchBoxCorridor(
        doc, mazePair0, a, b, netId, width, grid, guide, guide.preferHFirst);
      if (sbox.length >= 2) {
        const segs = tryCommitPolyline(doc, sbox, pair, netId, netName, width, lastBlock);
        if (segs >= 0) {
          tracePcb('AUTO_PAIR_SBOX',
            `${netName || netId} pts=${sbox.length} segs=${segs}`);
          return segs;
        }
      }
    }
  }
  const fine = Math.max(2, Math.floor(grid / 2));
  const tries: number[][] = [];
  tries.push([grid, 100]);
  if (!light) {
    if (fine < grid) {
      tries.push([fine, 100]);
      tries.push([fine, 88]);
    } else {
      tries.push([grid, 88]);
    }
  }
  const mazePair = toMazePair(pair);
  for (let ti = 0; ti < tries.length; ti++) {
    if (remain() < MAZE_MIN_REMAIN_MS) {
      break;
    }
    const g = tries[ti][0];
    const scaleTry = tries[ti][1] / 100;
    await yieldToUi();
    if (remain() < 20) {
      return -1;
    }
    let path = await mazeRouteRectilinearAsync(
      doc, mazePair, a, b, netId, width, g, scaleTry);
    if (path.length < 2) {
      await yieldToUi();
      if (remain() < 20) {
        return -1;
      }
      const rev = await mazeRouteRectilinearAsync(
        doc, mazePair, b, a, netId, width, g, scaleTry);
      if (rev.length >= 2) {
        path = rev.slice().reverse();
      }
    }
    if (path.length < 2) {
      continue;
    }
    const segs = tryCommitPolyline(doc, path, pair, netId, netName, width, lastBlock);
    if (segs >= 0) {
      tracePcb('AUTO_PAIR_MAZE',
        `${netName || netId} grid=${g} scale=${scaleTry.toFixed(2)} ` +
        `pts=${path.length} segs=${segs} sameLayer=${pair.h === pair.v ? 1 : 0}`);
      return segs;
    }
  }
  // light 不跑 Room/Poly/Gridless；墙时间不足也跳过（可见图可达数秒 → THREAD_BLOCK）
  if (light || remain() < HEAVY_FALLBACK_MIN_REMAIN_MS) {
    if (!light) {
      tracePcb('AUTO_PAIR_SKIP_HEAVY',
        `${netName || netId} remain=${remain()}ms need=${HEAVY_FALLBACK_MIN_REMAIN_MS}`);
    }
    return -1;
  }
  await yieldToUi();
  if (remain() < ROOM_HARD_BUDGET_MS) {
    return -1;
  }
  const room = routeRoomModel(doc, pair.h, a, b, netId, width, 8, ROOM_HARD_BUDGET_MS);
  if (room.length >= 2) {
    const segs = tryCommitPolyline(doc, room, pair, netId, netName, width, lastBlock);
    if (segs >= 0) {
      tracePcb('AUTO_PAIR_ROOM', `${netName || netId} pts=${room.length} segs=${segs}`);
      return segs;
    }
  }
  await yieldToUi();
  if (remain() < POLY_HARD_BUDGET_MS) {
    return -1;
  }
  const poly = routePolyRoom(doc, pair.h, a, b, netId, width, POLY_HARD_BUDGET_MS);
  if (poly.length >= 2) {
    const segs = tryCommitPolyline(doc, poly, pair, netId, netName, width, lastBlock);
    if (segs >= 0) {
      tracePcb('AUTO_PAIR_POLYROOM', `${netName || netId} pts=${poly.length} segs=${segs}`);
      return segs;
    }
  }
  await yieldToUi();
  if (remain() < GRIDLESS_HARD_BUDGET_MS) {
    return -1;
  }
  const gl = routeGridlessVisible(doc, pair.h, a, b, netId, width, GRIDLESS_HARD_BUDGET_MS);
  if (gl.length >= 2) {
    const segs = tryCommitPolyline(doc, gl, pair, netId, netName, width, lastBlock);
    if (segs >= 0) {
      tracePcb('AUTO_PAIR_GRIDLESS', `${netName || netId} pts=${gl.length} segs=${segs}`);
      return segs;
    }
  }
  return -1;
}

/** pad 阻挡占优时尽早切 A*，避免烧完候选预算 */
function shouldCutToMaze(tried: number, padHits: number, otherHits: number,
  lastReason: string = ''): boolean {
  if (tried < MAZE_CUT_MIN_TRIES) {
    return false;
  }
  if (padHits >= 6 && padHits >= otherHits * 2) {
    return true;
  }
  if (tried >= 16 && padHits + otherHits > 0 && padHits / (padHits + otherHits) >= 0.7) {
    return true;
  }
  // track_* 主导：早切去 bypass/maze，避免烧光 360ms 墙
  if (otherHits >= 6 && otherHits >= padHits * 2 &&
    (lastReason.indexOf('track_cross') >= 0 || lastReason.indexOf('track_block') >= 0)) {
    return true;
  }
  return false;
}

function isPadBlockReason(reason: string): boolean {
  return reason.indexOf('pad_block') >= 0 ||
    reason.indexOf('via_pad_block') >= 0 ||
    reason.indexOf('fanout_via_block') >= 0;
}

/** 在 a→b 上尝试多策略正交路径，避开焊盘/异网铜 */
function routePairClearanceAware(doc: PcbDocument, pair: NetLayerPair,
  a: Point2D, b: Point2D, netId: string, netName: string,
  grid: number, width: number): number {
  if (dist(a, b) < 0.5) {
    return 0;
  }
  const hopT0 = Date.now();
  const hopWall = hopWallMsFor(netName, a, b);
  const hopDeadline = hopT0 + hopWall;
  const attempts = layerPairAttempts(pair, netName);
  const lastBlock: BlockBox = { reason: '' };
  let padHits = 0;
  let otherHits = 0;
  let candTotal = 0;
  let mazeTried = 0;
  let skipRestSameLayer = false;
  let purePadFailCount = 0;
  for (let ai = 0; ai < attempts.length; ai++) {
    if ((Date.now() - hopT0) > hopWall) {
      // 过程诊断：单跳超时很常见，勿用 W 刷屏
      tracePcb('AUTO_PAIR_TIMEOUT',
        `${netName || netId} after=${Date.now() - hopT0}ms cand=${candTotal} sync=1`);
      break;
    }
    const tryPair = attempts[ai];
    if (skipRestSameLayer && tryPair.h === tryPair.v) {
      continue;
    }
    const layerT0 = Date.now();
    const layerRemain = hopWall - (layerT0 - hopT0);
    const layersLeft = Math.max(1, attempts.length - ai);
    const layerBudget = Math.min(PAIR_LAYER_ATTEMPT_BUDGET_MS,
      Math.max(180, Math.floor(layerRemain / layersLeft)));
    const layerDeadline = Math.min(hopDeadline, layerT0 + layerBudget);
    const preferHFirst = tryPair.h !== tryPair.v;
    const useBody = pairNeedsOuterBodyKeepout(tryPair);
    const lite = ai >= 1 || (hopWall - (Date.now() - hopT0)) < HOP_LITE_REMAIN_MS;
    const candidates = buildCandidatePolylines(doc, a, b, netId, netName, grid, width,
      preferHFirst, useBody, lite);
    const candCap = Math.min(candidates.length, ASYNC_MAX_CANDIDATES);
    let localPad = 0;
    let localOther = 0;
    let cut = false;
    for (let i = 0; i < candCap; i++) {
      if ((Date.now() - hopT0) > hopWall || Date.now() > layerDeadline) {
        cut = true;
        break;
      }
      candTotal++;
      const segs = tryCommitPolyline(doc, candidates[i], tryPair, netId, netName, width, lastBlock,
        layerDeadline);
      if (segs >= 0) {
        if (ai > 0 || i > 0) {
          tracePcb('AUTO_PAIR_ALT',
            `${netName || netId} layerTry=${ai + 1}/${attempts.length} ` +
            `cand=${i + 1}/${candidates.length} segs=${segs} ` +
            `sameLayer=${tryPair.h === tryPair.v ? 1 : 0}`);
        }
        return segs;
      }
      if (isPadBlockReason(lastBlock.reason)) {
        padHits++;
        localPad++;
      } else {
        otherHits++;
        localOther++;
      }
      if (shouldCutToMaze(i + 1, localPad, localOther, lastBlock.reason)) {
        cut = true;
        break;
      }
    }
    const triedLocal = localPad + localOther;
    const purePadFail = localPad > 0 && localOther === 0 &&
      localPad >= Math.max(4, Math.floor(triedLocal * 0.75));
    if (purePadFail) {
      purePadFailCount++;
      if (tryPair.h === tryPair.v) {
        skipRestSameLayer = true;
      }
      tracePcb('AUTO_PAIR_SKIP_MAZE',
        `${netName || netId} after=${triedLocal} padHits=${localPad} purePad=${purePadFailCount}`);
      if (shouldTrySiblingDetour(netName, a, b, lastBlock.reason, false)) {
        const detourSegs = tryCommitSiblingDetours(doc, tryPair, a, b, netId, netName, grid, width,
          lastBlock);
        if (detourSegs >= 0) {
          tracePcb('AUTO_PAIR_SIBLING',
            `${netName || netId} segs=${detourSegs} layerTry=${ai + 1}`);
          return detourSegs;
        }
      }
      if (shouldTryConnectorEscape(a, b, lastBlock.reason, false)) {
        const escSegs = tryCommitConnectorEscape(doc, tryPair, a, b, netId, netName, grid, width,
          lastBlock);
        if (escSegs >= 0) {
          tracePcb('AUTO_PAIR_J1_ESC',
            `${netName || netId} segs=${escSegs} layerTry=${ai + 1}`);
          return escSegs;
        }
      }
      // 通孔焊盘挡死时换层通常仍是 pad_block，连续两次则放弃本跳
      if (purePadFailCount >= 2) {
        break;
      }
      continue;
    }
    // track_cross/track_block：专用绕障折线（对应 L2_R 堵 VCC / VCC 堵 XTAL）
    if (shouldTryTrackBypass(lastBlock.reason, false, netName)) {
      const bypassSegs = tryCommitTrackBypass(doc, tryPair, a, b, netId, netName, grid, width,
        lastBlock);
      if (bypassSegs >= 0) {
        tracePcb('AUTO_PAIR_BYPASS',
          `${netName || netId} segs=${bypassSegs} layerTry=${ai + 1}`);
        return bypassSegs;
      }
    }
    // via_block 邻脚（非 purePad）：仍试 U 绕
    if (shouldTrySiblingDetour(netName, a, b, lastBlock.reason, false)) {
      const detourSegs = tryCommitSiblingDetours(doc, tryPair, a, b, netId, netName, grid, width,
        lastBlock);
      if (detourSegs >= 0) {
        tracePcb('AUTO_PAIR_SIBLING',
          `${netName || netId} segs=${detourSegs} layerTry=${ai + 1}`);
        return detourSegs;
      }
    }
    // J1/排针 pad_block：走廊 escape
    if (shouldTryConnectorEscape(a, b, lastBlock.reason, false)) {
      const escSegs = tryCommitConnectorEscape(doc, tryPair, a, b, netId, netName, grid, width,
        lastBlock);
      if (escSegs >= 0) {
        tracePcb('AUTO_PAIR_J1_ESC',
          `${netName || netId} segs=${escSegs} layerTry=${ai + 1}`);
        return escSegs;
      }
    }
    if (cut) {
      tracePcb('AUTO_PAIR_MAZE_EARLY',
        `${netName || netId} after=${triedLocal} padHits=${localPad}`);
    }
    // 同步路径：仅首层 + 轻量 maze，避免主线程连跑
    if (ai === 0 && !isPowerNetName(netName) && mazeTried < hopMazeMaxFor(netName) &&
      Date.now() <= layerDeadline) {
      const lightMaze = true;
      mazeTried++;
      const mazeSegs = tryMazeCommit(doc, tryPair, a, b, netId, netName, grid, width, lastBlock,
        lightMaze);
      if (mazeSegs >= 0) {
        return mazeSegs;
      }
      if (tryPair.h === tryPair.v && localPad > 0 && localOther === 0) {
        skipRestSameLayer = true;
      }
    }
  }
  // 终局兜底：邻脚 U 绕 / track 绕障 / J1 escape
  if (shouldTrySiblingDetour(netName, a, b, lastBlock.reason, false)) {
    const finalDetour = tryCommitSiblingDetours(doc, pair, a, b, netId, netName, grid, width,
      lastBlock);
    if (finalDetour >= 0) {
      tracePcb('AUTO_PAIR_SIBLING', `${netName || netId} segs=${finalDetour} final=1`);
      return finalDetour;
    }
  }
  if (shouldTryTrackBypass(lastBlock.reason, false, netName)) {
    const finalBypass = tryCommitTrackBypass(doc, pair, a, b, netId, netName, grid, width,
      lastBlock);
    if (finalBypass >= 0) {
      tracePcb('AUTO_PAIR_BYPASS', `${netName || netId} segs=${finalBypass} final=1`);
      return finalBypass;
    }
  }
  if (shouldTryConnectorEscape(a, b, lastBlock.reason, false)) {
    const esc = tryCommitConnectorEscape(doc, pair, a, b, netId, netName, grid, width, lastBlock);
    if (esc >= 0) {
      tracePcb('AUTO_PAIR_J1_ESC', `${netName || netId} segs=${esc} final=1`);
      return esc;
    }
  }
  // 单跳失败属搜索过程；真正整网失败看 AUTO_CHAIN_GAP / NET_UNROUTED
  tracePcb('AUTO_PAIR_FAIL',
    `${netName || netId} a=(${Math.round(a.x)},${Math.round(a.y)}) ` +
    `b=(${Math.round(b.x)},${Math.round(b.y)}) candidates=${candTotal} ` +
    `layerTries=${attempts.length} maze=${mazeTried} padHits=${padHits} otherHits=${otherHits} ` +
    `last=${lastBlock.reason || '?'}`);
  recordAgentPairFail(netId, netName, lastBlock.reason || '?');
  return 0;
}

/** 异步候选搜索：高频让出防 THREAD_BLOCK；纯 pad 失败跳过 maze */
async function routePairClearanceAwareAsync(doc: PcbDocument, pair: NetLayerPair,
  a: Point2D, b: Point2D, netId: string, netName: string,
  grid: number, width: number): Promise<number> {
  if (dist(a, b) < 0.5) {
    return 0;
  }
  const hopT0 = Date.now();
  const hopWall = hopWallMsFor(netName, a, b);
  const hopDeadline = hopT0 + hopWall;
  const hopCandCap = hopCandBudgetFor(netName, a, b);
  const hopMazeCap = hopMazeMaxFor(netName);
  const powerNet = isPowerNetName(netName);
  const forceYieldEvery = powerNet ? POWER_FORCE_YIELD_EVERY_CAND : FORCE_YIELD_EVERY_CAND;
  const attempts = layerPairAttempts(pair, netName);
  const lastBlock: BlockBox = { reason: '' };
  let padHits = 0;
  let otherHits = 0;
  let candTotal = 0;
  let sliceStart = Date.now();
  let skipRestSameLayer = false;
  let mazeTried = 0;
  let purePadFailCount = 0;
  let hopExhausted = false;
  let timeoutLogged = false;
  const markHopExhausted = (whyBudget: boolean): void => {
    hopExhausted = true;
    if (timeoutLogged) {
      return;
    }
    timeoutLogged = true;
    if (whyBudget) {
      tracePcb('AUTO_PAIR_BUDGET',
        `${netName || netId} cand=${candTotal}/${hopCandCap}`);
    } else {
      tracePcb('AUTO_PAIR_TIMEOUT',
        `${netName || netId} after=${Date.now() - hopT0}ms cand=${candTotal}`);
    }
  };
  for (let ai = 0; ai < attempts.length; ai++) {
    if ((Date.now() - hopT0) > hopWall || candTotal >= hopCandCap) {
      markHopExhausted(candTotal >= hopCandCap);
      break;
    }
    const tryPair = attempts[ai];
    if (skipRestSameLayer && tryPair.h === tryPair.v) {
      continue;
    }
    // 生成候选前先让出：collectSoftObstacles 在大板上可能偏重
    await yieldToUi();
    if ((Date.now() - hopT0) > hopWall) {
      markHopExhausted(false);
      break;
    }
    const layerT0 = Date.now();
    const layerRemain = hopWall - (layerT0 - hopT0);
    const layersLeft = Math.max(1, attempts.length - ai);
    const layerBudget = Math.min(PAIR_LAYER_ATTEMPT_BUDGET_MS,
      Math.max(180, Math.floor(layerRemain / layersLeft)));
    const layerDeadline = Math.min(hopDeadline, layerT0 + layerBudget);
    const preferHFirst = tryPair.h !== tryPair.v;
    const useBody = pairNeedsOuterBodyKeepout(tryPair);
    const remainMs = hopWall - (Date.now() - hopT0);
    // 电源：始终轻量候选（通道扫描 + 大量 tryCommit/fanout 会卡死主线程）
    // 后半层尝试也走轻量，避免把整段 hop 墙烧在 In3/In4 全量候选上
    const liteCands = powerNet || remainMs < HOP_LITE_REMAIN_MS || ai >= 1;
    const allCandidates = buildCandidatePolylines(doc, a, b, netId, netName, grid, width,
      preferHFirst, useBody, liteCands);
    if ((Date.now() - hopT0) > hopWall || Date.now() > layerDeadline) {
      if ((Date.now() - hopT0) > hopWall) {
        markHopExhausted(false);
        break;
      }
      await yieldToUi();
      continue;
    }
    sliceStart = await yieldIfSliceOver(Date.now());
    const remain = hopCandCap - candTotal;
    if (remain <= 0) {
      markHopExhausted(true);
      break;
    }
    // 同层优先少扫；pad 占优时提前切断，不再烧 overflow 全量
    const baseLimit = tryPair.h === tryPair.v
      ? Math.min(allCandidates.length, Math.floor(ASYNC_MAX_CANDIDATES * 0.5), remain)
      : Math.min(allCandidates.length, ASYNC_MAX_CANDIDATES, remain);
    let localPad = 0;
    let localOther = 0;
    let cut = false;
    let triedLocal = 0;
    for (let i = 0; i < baseLimit; i++) {
      if ((Date.now() - hopT0) > hopWall || Date.now() > layerDeadline ||
        candTotal >= hopCandCap) {
        if ((Date.now() - hopT0) > hopWall || candTotal >= hopCandCap) {
          markHopExhausted(candTotal >= hopCandCap);
        }
        cut = true;
        break;
      }
      candTotal++;
      triedLocal++;
      if ((triedLocal % forceYieldEvery) === 0) {
        await yieldToUi();
        sliceStart = Date.now();
      } else {
        sliceStart = await yieldIfSliceOver(sliceStart);
      }
      const commitT0 = Date.now();
      const segs = tryCommitPolyline(doc, allCandidates[i], tryPair, netId, netName, width,
        lastBlock, layerDeadline);
      // 电源或单次提交偏重：立刻让出，避免 uv_timer_task 连跑数秒
      if (powerNet || (Date.now() - commitT0) >= 50) {
        await yieldToUi();
        sliceStart = Date.now();
      }
      if (segs >= 0) {
        if (ai > 0 || i > 0) {
          tracePcb('AUTO_PAIR_ALT',
            `${netName || netId} layerTry=${ai + 1}/${attempts.length} ` +
            `cand=${i + 1}/${allCandidates.length} segs=${segs} ` +
            `sameLayer=${tryPair.h === tryPair.v ? 1 : 0}`);
        }
        return segs;
      }
      if (isPadBlockReason(lastBlock.reason)) {
        padHits++;
        localPad++;
      } else {
        otherHits++;
        localOther++;
      }
      if (shouldCutToMaze(triedLocal, localPad, localOther, lastBlock.reason)) {
        cut = true;
        break;
      }
    }
    if (hopExhausted) {
      break;
    }
    // 未早切且仍有余量：再扫一轮 overflow（非 pad 主导时，且预算内；仅首层尝试）
    const overflowCap = Math.min(allCandidates.length, ASYNC_MAX_CANDIDATES + 24,
      candTotal + Math.max(0, hopCandCap - candTotal));
    if (!cut && ai === 0 && allCandidates.length > baseLimit && localPad < localOther * 2 &&
      candTotal < hopCandCap && !hopExhausted && !liteCands && Date.now() <= layerDeadline) {
      for (let i = baseLimit; i < overflowCap; i++) {
        if ((Date.now() - hopT0) > hopWall || Date.now() > layerDeadline ||
          candTotal >= hopCandCap) {
          if ((Date.now() - hopT0) > hopWall || candTotal >= hopCandCap) {
            markHopExhausted(candTotal >= hopCandCap);
          }
          cut = true;
          break;
        }
        candTotal++;
        triedLocal++;
        if ((triedLocal % forceYieldEvery) === 0) {
          await yieldToUi();
          sliceStart = Date.now();
        } else {
          sliceStart = await yieldIfSliceOver(sliceStart);
        }
        const commitT0 = Date.now();
        const segs = tryCommitPolyline(doc, allCandidates[i], tryPair, netId, netName, width,
          lastBlock, layerDeadline);
        if (powerNet || (Date.now() - commitT0) >= 50) {
          await yieldToUi();
          sliceStart = Date.now();
        }
        if (segs >= 0) {
          tracePcb('AUTO_PAIR_ALT',
            `${netName || netId} layerTry=${ai + 1}/${attempts.length} ` +
            `cand=${i + 1}/${allCandidates.length} segs=${segs}`);
          return segs;
        }
        if (isPadBlockReason(lastBlock.reason)) {
          padHits++;
          localPad++;
        } else {
          otherHits++;
          localOther++;
        }
        if (shouldCutToMaze(triedLocal, localPad, localOther, lastBlock.reason)) {
          cut = true;
          break;
        }
      }
    }
    if ((Date.now() - hopT0) > hopWall) {
      markHopExhausted(false);
      break;
    }
    // 纯焊盘/本体挡死（如晶体跨 pad）：maze 几乎必败，直接跳过防 THREAD_BLOCK
    const purePadFail = localPad > 0 && localOther === 0 &&
      localPad >= Math.max(4, Math.floor(triedLocal * 0.75));
    if (purePadFail) {
      purePadFailCount++;
      if (tryPair.h === tryPair.v) {
        skipRestSameLayer = true;
      }
      tracePcb('AUTO_PAIR_SKIP_MAZE',
        `${netName || netId} after=${triedLocal} padHits=${localPad} purePad=${purePadFailCount}`);
      await yieldToUi();
      if (shouldTrySiblingDetour(netName, a, b, lastBlock.reason, hopExhausted)) {
        const detourSegs = await tryCommitSiblingDetoursAsync(doc, tryPair, a, b, netId, netName,
          grid, width, lastBlock, hopDeadline);
        if (detourSegs >= 0) {
          tracePcb('AUTO_PAIR_SIBLING',
            `${netName || netId} segs=${detourSegs} layerTry=${ai + 1}`);
          return detourSegs;
        }
      }
      await yieldToUi();
      if (shouldTryConnectorEscape(a, b, lastBlock.reason, hopExhausted)) {
        const escSegs = await tryCommitConnectorEscapeAsync(doc, tryPair, a, b, netId, netName,
          grid, width, lastBlock, hopDeadline);
        if (escSegs >= 0) {
          tracePcb('AUTO_PAIR_J1_ESC',
            `${netName || netId} segs=${escSegs} layerTry=${ai + 1}`);
          return escSegs;
        }
        await yieldToUi();
      }
      if ((Date.now() - hopT0) > hopWall) {
        markHopExhausted(false);
        break;
      }
      if (purePadFailCount >= 2) {
        break;
      }
      continue;
    }
    // track_cross/track_block 专用绕障（VCC↔L2_R 等）
    if (shouldTryTrackBypass(lastBlock.reason, hopExhausted, netName)) {
      await yieldToUi();
      const bypassSegs = await tryCommitTrackBypassAsync(doc, tryPair, a, b, netId, netName,
        grid, width, lastBlock, hopDeadline);
      if (bypassSegs >= 0) {
        tracePcb('AUTO_PAIR_BYPASS',
          `${netName || netId} segs=${bypassSegs} layerTry=${ai + 1}`);
        return bypassSegs;
      }
      await yieldToUi();
    }
    if ((Date.now() - hopT0) > hopWall) {
      markHopExhausted(false);
      break;
    }
    // via_block 邻脚（非 purePad）：仍试 U 绕
    if (shouldTrySiblingDetour(netName, a, b, lastBlock.reason, hopExhausted)) {
      await yieldToUi();
      const detourSegs = await tryCommitSiblingDetoursAsync(doc, tryPair, a, b, netId, netName,
        grid, width, lastBlock, hopDeadline);
      if (detourSegs >= 0) {
        tracePcb('AUTO_PAIR_SIBLING',
          `${netName || netId} segs=${detourSegs} layerTry=${ai + 1}`);
        return detourSegs;
      }
      await yieldToUi();
    }
    if ((Date.now() - hopT0) > hopWall) {
      markHopExhausted(false);
      break;
    }
    // J1/排针走廊 escape
    if (shouldTryConnectorEscape(a, b, lastBlock.reason, hopExhausted)) {
      await yieldToUi();
      const escSegs = await tryCommitConnectorEscapeAsync(doc, tryPair, a, b, netId, netName,
        grid, width, lastBlock, hopDeadline);
      if (escSegs >= 0) {
        tracePcb('AUTO_PAIR_J1_ESC',
          `${netName || netId} segs=${escSegs} layerTry=${ai + 1}`);
        return escSegs;
      }
      await yieldToUi();
    }
    // maze 仅在首层尝试 + 有余量时跑；后层只做轻量候选，避免 THREAD_BLOCK
    if (ai > 0 || mazeTried >= hopMazeCap || hopExhausted || Date.now() > layerDeadline) {
      await yieldToUi();
      continue;
    }
    const remainForMaze = hopWall - (Date.now() - hopT0);
    if (!shouldAllowLightMaze(netName, remainForMaze)) {
      continue;
    }
    if (cut) {
      tracePcb('AUTO_PAIR_MAZE_EARLY',
        `${netName || netId} after=${triedLocal} padHits=${localPad}`);
    }
    const lightMaze = true; // 异步路径一律轻量 maze，重档留给离线/同步调试
    mazeTried++;
    const mazeSegs = await tryMazeCommitAsync(
      doc, tryPair, a, b, netId, netName, grid, width, lastBlock, lightMaze, hopDeadline);
    await yieldToUi();
    if (mazeSegs >= 0) {
      return mazeSegs;
    }
    if ((Date.now() - hopT0) > hopWall) {
      markHopExhausted(false);
      break;
    }
    if (tryPair.h === tryPair.v && lightMaze && localPad > 0 && localOther === 0) {
      skipRestSameLayer = true;
    }
  }
  // 超时后禁止再跑 maze/Room/Poly/Gridless（曾误用 hopWall 当 remain → 必触发 THREAD_BLOCK）
  if (hopExhausted) {
    // 仅保留下方极短 sibling 终试
  } else if (candTotal <= 4 && mazeTried < hopMazeCap &&
    shouldAllowLightMaze(netName, hopWall - (Date.now() - hopT0)) &&
    !isPowerNetName(netName)) {
    await yieldToUi();
    const extraMaze = await tryMazeCommitAsync(
      doc, pair, a, b, netId, netName, grid, width, lastBlock, true, hopDeadline);
    mazeTried++;
    if (extraMaze >= 0) {
      tracePcb('AUTO_PAIR_MAZE', `${netName || netId} segs=${extraMaze} final=1`);
      return extraMaze;
    }
  }
  // 超时后：仅晶体短 sibling（≤3 候选 + 短宽限），禁止 bypass/escape 再拖主线程
  const graceDeadline = hopDeadline + HOP_POST_TIMEOUT_GRACE_MS;
  if (shouldTrySiblingDetour(netName, a, b, lastBlock.reason, hopExhausted)) {
    await yieldToUi();
    const sibCap = hopExhausted ? SIBLING_DETOUR_CAND_CAP_TIMEOUT : SIBLING_DETOUR_CAND_CAP;
    const finalDetour = await tryCommitSiblingDetoursAsync(doc, pair, a, b, netId, netName,
      grid, width, lastBlock, graceDeadline, sibCap);
    if (finalDetour >= 0) {
      tracePcb('AUTO_PAIR_SIBLING', `${netName || netId} segs=${finalDetour} final=1`);
      return finalDetour;
    }
  }
  if (!hopExhausted && shouldTryTrackBypass(lastBlock.reason, hopExhausted, netName)) {
    await yieldToUi();
    const finalBypass = await tryCommitTrackBypassAsync(doc, pair, a, b, netId, netName,
      grid, width, lastBlock, hopDeadline);
    if (finalBypass >= 0) {
      tracePcb('AUTO_PAIR_BYPASS', `${netName || netId} segs=${finalBypass} final=1`);
      return finalBypass;
    }
  }
  if (!hopExhausted && shouldTryConnectorEscape(a, b, lastBlock.reason, hopExhausted)) {
    await yieldToUi();
    const finalEsc = await tryCommitConnectorEscapeAsync(doc, pair, a, b, netId, netName,
      grid, width, lastBlock, hopDeadline);
    if (finalEsc >= 0) {
      tracePcb('AUTO_PAIR_J1_ESC', `${netName || netId} segs=${finalEsc} final=1`);
      return finalEsc;
    }
  }
  tracePcb('AUTO_PAIR_FAIL',
    `${netName || netId} a=(${Math.round(a.x)},${Math.round(a.y)}) ` +
    `b=(${Math.round(b.x)},${Math.round(b.y)}) candidates=${candTotal} ` +
    `layerTries=${attempts.length} maze=${mazeTried} padHits=${padHits} otherHits=${otherHits} ` +
    `last=${lastBlock.reason || '?'}`);
  recordAgentPairFail(netId, netName, lastBlock.reason || '?');
  return 0;
}

/** 回滚本链新增的同网铜（半截网会挡后序布线，且虚高 routed 统计） */
function rollbackNetCopperSince(doc: PcbDocument, netId: string,
  trackFrom: number, viaFrom: number): number {
  let removed = 0;
  const keepTrk: PcbTrack[] = [];
  for (let i = 0; i < doc.tracks.length; i++) {
    if (i >= trackFrom && doc.tracks[i].netId === netId) {
      removed++;
      continue;
    }
    keepTrk.push(doc.tracks[i]);
  }
  doc.tracks = keepTrk;
  const keepVia: PcbVia[] = [];
  for (let i = 0; i < doc.vias.length; i++) {
    if (i >= viaFrom && doc.vias[i].netId === netId) {
      removed++;
      continue;
    }
    keepVia.push(doc.vias[i]);
  }
  doc.vias = keepVia;
  return removed;
}

function pointsToWarPins(points: Point2D[]): WarOrderPin[] {
  const pins: WarOrderPin[] = [];
  for (let i = 0; i < points.length; i++) {
    const pin: WarOrderPin = { key: `p${i}`, pt: { x: points[i].x, y: points[i].y } };
    pins.push(pin);
  }
  return pins;
}

function warPinsToPoints(pins: WarOrderPin[]): Point2D[] {
  const out: Point2D[] = [];
  for (let i = 0; i < pins.length; i++) {
    out.push({ x: pins[i].pt.x, y: pins[i].pt.y });
  }
  return out;
}

/** 按给定点序布完整链；失败则回滚本尝试新增铜，返回 -1 */
function tryRouteOrderedHops(doc: PcbDocument, pair: NetLayerPair, ordered: Point2D[],
  netId: string, netName: string, grid: number, width: number,
  failedEdges?: Set<string>): number {
  const trackFrom = doc.tracks.length;
  const viaFrom = doc.vias.length;
  let segs = 0;
  for (let i = 0; i < ordered.length - 1; i++) {
    const ek = undirectedEdgeKey(ordered[i], ordered[i + 1]);
    if (failedEdges !== undefined && failedEdges.has(ek)) {
      rollbackNetCopperSince(doc, netId, trackFrom, viaFrom);
      return -1;
    }
    const n = routePairClearanceAware(doc, pair, ordered[i], ordered[i + 1],
      netId, netName, grid, width);
    if (n === 0) {
      if (failedEdges !== undefined) {
        failedEdges.add(ek);
      }
      rollbackNetCopperSince(doc, netId, trackFrom, viaFrom);
      return -1;
    }
    segs += n;
  }
  return segs;
}

async function tryRouteOrderedHopsAsync(doc: PcbDocument, pair: NetLayerPair, ordered: Point2D[],
  netId: string, netName: string, grid: number, width: number,
  failedEdges?: Set<string>): Promise<number> {
  const trackFrom = doc.tracks.length;
  const viaFrom = doc.vias.length;
  let segs = 0;
  let sliceStart = Date.now();
  for (let i = 0; i < ordered.length - 1; i++) {
    const ek = undirectedEdgeKey(ordered[i], ordered[i + 1]);
    if (failedEdges !== undefined && failedEdges.has(ek)) {
      rollbackNetCopperSince(doc, netId, trackFrom, viaFrom);
      return -1;
    }
    const n = await routePairClearanceAwareAsync(doc, pair, ordered[i], ordered[i + 1],
      netId, netName, grid, width);
    if (n === 0) {
      if (failedEdges !== undefined) {
        failedEdges.add(ek);
      }
      rollbackNetCopperSince(doc, netId, trackFrom, viaFrom);
      return -1;
    }
    segs += n;
    sliceStart = await yieldIfSliceOver(sliceStart);
  }
  return segs;
}

/** 按直角 Steiner / 曼哈顿 MST 边集布线（非整条哈密顿链），失败整网回滚 */
function tryRouteMstEdges(doc: PcbDocument, pair: NetLayerPair, pins: WarOrderPin[],
  netId: string, netName: string, grid: number, width: number,
  failedEdges?: Set<string>): number {
  const orderedPins = orderPinsOuterRingFirst(pins, 16);
  const steiner = orderSteinerEdgesForRouting(buildRectilinearSteinerEdges(orderedPins, grid));
  if (steiner.length === 0) {
    return 0;
  }
  const trackFrom = doc.tracks.length;
  const viaFrom = doc.vias.length;
  let segs = 0;
  for (let e = 0; e < steiner.length; e++) {
    const a = steiner[e].a;
    const b = steiner[e].b;
    const ek = undirectedEdgeKey(a, b);
    if (failedEdges !== undefined && failedEdges.has(ek)) {
      rollbackNetCopperSince(doc, netId, trackFrom, viaFrom);
      return -1;
    }
    const n = routePairClearanceAware(doc, pair, a, b, netId, netName, grid, width);
    if (n === 0) {
      if (failedEdges !== undefined) {
        failedEdges.add(ek);
      }
      rollbackNetCopperSince(doc, netId, trackFrom, viaFrom);
      return -1;
    }
    segs += n;
  }
  return segs;
}

async function tryRouteMstEdgesAsync(doc: PcbDocument, pair: NetLayerPair, pins: WarOrderPin[],
  netId: string, netName: string, grid: number, width: number,
  failedEdges?: Set<string>): Promise<number> {
  const orderedPins = orderPinsOuterRingFirst(pins, 16);
  const steiner = orderSteinerEdgesForRouting(buildRectilinearSteinerEdges(orderedPins, grid));
  if (steiner.length === 0) {
    return 0;
  }
  const powerNet = isPowerNetName(netName);
  const edgeCap = powerNet
    ? Math.min(steiner.length, POWER_DETAIL_MST_EDGE_CAP)
    : steiner.length;
  const trackFrom = doc.tracks.length;
  const viaFrom = doc.vias.length;
  let segs = 0;
  let ok = 0;
  let sliceStart = Date.now();
  for (let e = 0; e < edgeCap; e++) {
    const a = steiner[e].a;
    const b = steiner[e].b;
    const ek = undirectedEdgeKey(a, b);
    if (failedEdges !== undefined && failedEdges.has(ek)) {
      if (powerNet) {
        continue;
      }
      rollbackNetCopperSince(doc, netId, trackFrom, viaFrom);
      return -1;
    }
    // 电源每边前必让出：上一边可能已逼近 hop 墙
    await yieldToUi();
    const n = await routePairClearanceAwareAsync(doc, pair, a, b, netId, netName, grid, width);
    if (n === 0) {
      if (failedEdges !== undefined) {
        failedEdges.add(ek);
      }
      if (powerNet) {
        // 部分成功即可，余量交 stitch；勿整网回滚
        continue;
      }
      rollbackNetCopperSince(doc, netId, trackFrom, viaFrom);
      return -1;
    }
    segs += n;
    ok++;
    sliceStart = await yieldIfSliceOver(sliceStart);
  }
  if (powerNet) {
    if (edgeCap < steiner.length) {
      tracePcb('AUTO_CHAIN_MST_CAP',
        `${netName || netId} detailEdges=${edgeCap}/${steiner.length} ok=${ok}`);
    }
    return ok > 0 ? segs : -1;
  }
  return segs;
}

function routeLChain(doc: PcbDocument, pair: NetLayerPair, points: Point2D[],
  netId: string, netName: string, grid: number, width: number): number {
  if (points.length < 2) {
    return 0;
  }
  const pins = pointsToWarPins(points);
  const failedEdges: Set<string> = new Set();
  // 多脚 / 电源：MST 更稳，少烧链变体
  const mstFirst = points.length >= MST_ONLY_PAD_THRESHOLD || isPowerNetName(netName);
  if (mstFirst) {
    const mstSegs = tryRouteMstEdges(doc, pair, pins, netId, netName, grid, width, failedEdges);
    if (mstSegs >= 0) {
      tracePcb('AUTO_CHAIN_MST', `${netName || netId} segs=${mstSegs} edges=${pins.length - 1} first=1`);
      return mstSegs;
    }
  }
  const allVariants = WarRouteOrder.chainOrderVariants(pins);
  // 大脚数 MST 已失败则不再烧 NN 链（hop 数≈焊盘数）
  const maxVar = mstFirst
    ? (points.length >= 8 ? 0 : 1)
    : Math.min(allVariants.length, ASYNC_MAX_CHAIN_VARIANTS);
  for (let vi = 0; vi < maxVar; vi++) {
    const ordered = warPinsToPoints(allVariants[vi]);
    const segs = tryRouteOrderedHops(doc, pair, ordered, netId, netName, grid, width, failedEdges);
    if (segs >= 0) {
      if (vi > 0) {
        tracePcb('AUTO_CHAIN_ALT',
          `${netName || netId} variant=${vi + 1}/${maxVar} segs=${segs}`);
      }
      return segs;
    }
  }
  if (!mstFirst) {
    const mstSegs = tryRouteMstEdges(doc, pair, pins, netId, netName, grid, width, failedEdges);
    if (mstSegs >= 0) {
      tracePcb('AUTO_CHAIN_MST', `${netName || netId} segs=${mstSegs} edges=${pins.length - 1}`);
      return mstSegs;
    }
  }
  // 电源多脚星形会一次铺出百段干线，堵死信号通道且拖垮 post-shorten；留给 stitch
  if (points.length >= STAR_HUB_MIN_PADS && !isPowerNetName(netName)) {
    const starSegs = tryRouteStarHub(doc, pair, points, netId, netName, grid, width);
    if (starSegs > 0) {
      tracePcb('AUTO_CHAIN_STAR', `${netName || netId} segs=${starSegs} pads=${points.length}`);
      return starSegs;
    }
  }
  tracePcbWarn('AUTO_CHAIN_GAP',
    `${netName || netId} variants=${maxVar}+mst all failed`);
  return 0;
}

async function routeLChainAsync(doc: PcbDocument, pair: NetLayerPair, points: Point2D[],
  netId: string, netName: string, grid: number, width: number): Promise<number> {
  if (points.length < 2) {
    return 0;
  }
  const pins = pointsToWarPins(points);
  const failedEdges: Set<string> = new Set();
  const mstFirst = points.length >= MST_ONLY_PAD_THRESHOLD || isPowerNetName(netName);
  if (mstFirst) {
    const mstSegs = await tryRouteMstEdgesAsync(doc, pair, pins, netId, netName, grid, width,
      failedEdges);
    if (mstSegs >= 0) {
      tracePcb('AUTO_CHAIN_MST', `${netName || netId} segs=${mstSegs} edges=${pins.length - 1} first=1`);
      return mstSegs;
    }
  }
  const allVariants = WarRouteOrder.chainOrderVariants(pins);
  const maxVar = mstFirst
    ? (points.length >= 8 ? 0 : 1)
    : Math.min(allVariants.length, ASYNC_MAX_CHAIN_VARIANTS);
  for (let vi = 0; vi < maxVar; vi++) {
    const ordered = warPinsToPoints(allVariants[vi]);
    const segs = await tryRouteOrderedHopsAsync(doc, pair, ordered, netId, netName, grid, width,
      failedEdges);
    if (segs >= 0) {
      if (vi > 0) {
        tracePcb('AUTO_CHAIN_ALT',
          `${netName || netId} variant=${vi + 1}/${maxVar} segs=${segs}`);
      }
      return segs;
    }
  }
  if (!mstFirst) {
    const mstSegs = await tryRouteMstEdgesAsync(doc, pair, pins, netId, netName, grid, width,
      failedEdges);
    if (mstSegs >= 0) {
      tracePcb('AUTO_CHAIN_MST', `${netName || netId} segs=${mstSegs} edges=${pins.length - 1}`);
      return mstSegs;
    }
  }
  if (points.length >= STAR_HUB_MIN_PADS && !isPowerNetName(netName)) {
    await yieldToUi();
    const starSegs = await tryRouteStarHubAsync(doc, pair, points, netId, netName, grid, width);
    if (starSegs > 0) {
      tracePcb('AUTO_CHAIN_STAR', `${netName || netId} segs=${starSegs} pads=${points.length}`);
      return starSegs;
    }
  }
  tracePcbWarn('AUTO_CHAIN_GAP',
    `${netName || netId} variants=${maxVar}+mst all failed`);
  return 0;
}

/**
 * 多脚网星形：选离质心最近的焊盘为 hub，其余向 hub 辐射。
 * 允许部分成功（比全失败强）；全失败则回滚本次新增铜。
 */
function pickStarHubIndex(points: Point2D[]): number {
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    cx += points[i].x;
    cy += points[i].y;
  }
  cx /= points.length;
  cy /= points.length;
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length; i++) {
    const d = dist(points[i], { x: cx, y: cy });
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function tryRouteStarHub(doc: PcbDocument, pair: NetLayerPair, points: Point2D[],
  netId: string, netName: string, grid: number, width: number): number {
  if (points.length < STAR_HUB_MIN_PADS) {
    return 0;
  }
  const trackFrom = doc.tracks.length;
  const viaFrom = doc.vias.length;
  const hubIdx = pickStarHubIndex(points);
  const hub = points[hubIdx];
  let segs = 0;
  let ok = 0;
  for (let i = 0; i < points.length; i++) {
    if (i === hubIdx) {
      continue;
    }
    const n = routePairClearanceAware(doc, pair, hub, points[i], netId, netName, grid, width);
    if (n > 0) {
      segs += n;
      ok++;
    }
  }
  if (ok === 0) {
    rollbackNetCopperSince(doc, netId, trackFrom, viaFrom);
    return 0;
  }
  // 未连上的脚：尝试接到已形成的铜 hub
  if (ok < points.length - 1) {
    const hubs = collectNetCopperHubs(doc, netId, [hub]);
    for (let i = 0; i < points.length; i++) {
      if (i === hubIdx) {
        continue;
      }
      const nearest = nearestPoint(points[i], hubs);
      if (nearest === null) {
        continue;
      }
      if (dist(nearest, points[i]) < 1) {
        continue;
      }
      // 已与 hub 连通的脚跳过（粗判：已有同网铜很近）
      let already = false;
      for (let hi = 0; hi < hubs.length; hi++) {
        if (dist(hubs[hi], points[i]) < 8) {
          already = true;
          break;
        }
      }
      if (already) {
        continue;
      }
      const n = routePairClearanceAware(doc, pair, nearest, points[i],
        netId, netName, grid, width);
      if (n > 0) {
        segs += n;
        ok++;
      }
    }
  }
  if (segs === 0) {
    rollbackNetCopperSince(doc, netId, trackFrom, viaFrom);
    return 0;
  }
  return segs;
}

async function tryRouteStarHubAsync(doc: PcbDocument, pair: NetLayerPair, points: Point2D[],
  netId: string, netName: string, grid: number, width: number): Promise<number> {
  if (points.length < STAR_HUB_MIN_PADS) {
    return 0;
  }
  const trackFrom = doc.tracks.length;
  const viaFrom = doc.vias.length;
  const hubIdx = pickStarHubIndex(points);
  const hub = points[hubIdx];
  let segs = 0;
  let ok = 0;
  for (let i = 0; i < points.length; i++) {
    if (i === hubIdx) {
      continue;
    }
    await yieldToUi();
    const n = await routePairClearanceAwareAsync(doc, pair, hub, points[i],
      netId, netName, grid, width);
    if (n > 0) {
      segs += n;
      ok++;
    }
  }
  if (ok === 0) {
    rollbackNetCopperSince(doc, netId, trackFrom, viaFrom);
    return 0;
  }
  if (ok < points.length - 1) {
    const hubs = collectNetCopperHubs(doc, netId, [hub]);
    for (let i = 0; i < points.length; i++) {
      if (i === hubIdx) {
        continue;
      }
      let already = false;
      for (let hi = 0; hi < hubs.length; hi++) {
        if (dist(hubs[hi], points[i]) < 8) {
          already = true;
          break;
        }
      }
      if (already) {
        continue;
      }
      const nearest = nearestPoint(points[i], hubs);
      if (nearest === null || dist(nearest, points[i]) < 1) {
        continue;
      }
      await yieldToUi();
      const n = await routePairClearanceAwareAsync(doc, pair, nearest, points[i],
        netId, netName, grid, width);
      if (n > 0) {
        segs += n;
      }
    }
  }
  if (segs === 0) {
    rollbackNetCopperSince(doc, netId, trackFrom, viaFrom);
    return 0;
  }
  return segs;
}

/** 同网铜端点/过孔作抽头 hub（优于仅焊盘） */
function collectNetCopperHubs(doc: PcbDocument, netId: string, corePads: Point2D[]): Point2D[] {
  const hubs: Point2D[] = [];
  const seen: Set<string> = new Set();
  const push = (p: Point2D): void => {
    const key = `${Math.round(p.x)},${Math.round(p.y)}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    hubs.push({ x: p.x, y: p.y });
  };
  for (let i = 0; i < corePads.length; i++) {
    push(corePads[i]);
  }
  for (let i = 0; i < doc.tracks.length; i++) {
    const t = doc.tracks[i];
    if (t.netId !== netId) {
      continue;
    }
    push(t.start);
    push(t.end);
  }
  for (let i = 0; i < doc.vias.length; i++) {
    const v = doc.vias[i];
    if (v.netId !== netId) {
      continue;
    }
    push(v.position);
  }
  return hubs;
}

function sortPointsByNearestHub(points: Point2D[], hubs: Point2D[]): Point2D[] {
  const scored: Point2D[] = points.slice();
  scored.sort((a: Point2D, b: Point2D): number => {
    const ha = nearestPoint(a, hubs);
    const hb = nearestPoint(b, hubs);
    const da = ha ? dist(a, ha) : 1e9;
    const db = hb ? dist(b, hb) : 1e9;
    return da - db;
  });
  return scored;
}

function nearestPoint(from: Point2D, candidates: Point2D[]): Point2D | null {
  if (candidates.length === 0) {
    return null;
  }
  let best = candidates[0];
  let bestD = dist(from, best);
  for (let i = 1; i < candidates.length; i++) {
    const d = dist(from, candidates[i]);
    if (d < bestD) {
      bestD = d;
      best = candidates[i];
    }
  }
  return best;
}

/** LED→J1：内层 H≠V + 外围走廊（F.Cu 会撞 QFP 浮空焊盘；中部横墙封总线） */
function ledJ1LayerPair(doc: PcbDocument, preferred: PcbLayerId,
  fallback: NetLayerPair): NetLayerPair {
  const copper = copperLayersFromStack(doc.layerStack);
  if (copper.length >= 4) {
    // 靠底内层为主、另一内层为辅，避开总线常占的单一走廊且保留换层
    const p: NetLayerPair = { h: copper[copper.length - 2], v: copper[1] };
    return p;
  }
  return fallback;
}

function routeNetGroup(doc: PcbDocument, pair: NetLayerPair, grp: NetPadGroup,
  grid: number, width: number): number {
  const core = grp.points;
  const connectors = grp.connectorPoints;
  let segs = 0;
  const corePair = topLayerPairIfShortCore(doc, pair.h, grp.netName, core) ?? pair;
  const connPair = (isLedNetName(grp.netName) && connectors.length > 0)
    ? ledJ1LayerPair(doc, pair.h, pair) : pair;

  if (core.length >= 2) {
    segs += routeLChain(doc, corePair, core, grp.netId, grp.netName, grid, width);
  }

  if (connectors.length > 0) {
    let hubs = collectNetCopperHubs(doc, grp.netId, core);
    if (hubs.length === 0) {
      segs += routeLChain(doc, connPair, connectors, grp.netId, grp.netName, grid, width);
    } else {
      const ordered = sortPointsByNearestHub(connectors, hubs);
      for (let ci = 0; ci < ordered.length; ci++) {
        const c = ordered[ci];
        hubs = collectNetCopperHubs(doc, grp.netId, core);
        const hub = nearestPoint(c, hubs);
        if (!hub) {
          continue;
        }
        segs += routePairClearanceAware(doc, connPair, hub, c, grp.netId, grp.netName, grid, width);
      }
    }
  }

  if (core.length === 1 && connectors.length === 0) {
    return 0;
  }
  return segs;
}

async function routeNetGroupAsync(doc: PcbDocument, pair: NetLayerPair, grp: NetPadGroup,
  grid: number, width: number): Promise<number> {
  const core = grp.points;
  const connectors = grp.connectorPoints;
  let segs = 0;
  const corePair = topLayerPairIfShortCore(doc, pair.h, grp.netName, core) ?? pair;
  const connPair = (isLedNetName(grp.netName) && connectors.length > 0)
    ? ledJ1LayerPair(doc, pair.h, pair) : pair;

  if (core.length >= 2) {
    segs += await routeLChainAsync(doc, corePair, core, grp.netId, grp.netName, grid, width);
  }

  if (connectors.length > 0) {
    let hubs = collectNetCopperHubs(doc, grp.netId, core);
    if (hubs.length === 0) {
      segs += await routeLChainAsync(doc, connPair, connectors, grp.netId, grp.netName, grid, width);
    } else {
      const ordered = sortPointsByNearestHub(connectors, hubs);
      for (let ci = 0; ci < ordered.length; ci++) {
        const c = ordered[ci];
        hubs = collectNetCopperHubs(doc, grp.netId, core);
        const hub = nearestPoint(c, hubs);
        if (!hub) {
          continue;
        }
        segs += await routePairClearanceAwareAsync(doc, connPair, hub, c,
          grp.netId, grp.netName, grid, width);
      }
    }
  }

  if (core.length === 1 && connectors.length === 0) {
    return 0;
  }
  return segs;
}

function finishRouteCleanup(doc: PcbDocument, tag: string): void {
  const snapped = snapTrackEndpointsToPads(doc);
  if (snapped > 0) {
    tracePcb(`${tag}_SNAP`, `endpoints=${snapped}`);
  }
  const shortT0 = Date.now();
  const shortened = shortenOrthoStairs(doc, 1);
  tracePcb(`${tag}_SHORTEN`, `stairs=${shortened} ms=${Date.now() - shortT0} trk=${doc.tracks.length}`);
  const chamfered = chamferOrthoCorners(doc, 2);
  if (chamfered > 0) {
    tracePcb(`${tag}_CHAMFER45`, `corners=${chamfered}`);
  }
  const stubs = pruneStubTracks(doc, 22);
  if (stubs > 0) {
    tracePcb(`${tag}_STUB`, `removed=${stubs}`);
  }
  const shoved = shoveAllClearanceConflicts(doc, 2);
  if (shoved > 0) {
    tracePcb(`${tag}_SHOVE`, `rerouted=${shoved}`);
  }
  const merged = mergeColinearTracks(doc);
  if (merged > 0) {
    tracePcb(`${tag}_MERGE`, `colinear=${merged}`);
  }
  const pruned = pruneZeroLengthTracks(doc);
  const shortPruned = pruneShortTracks(doc, 2);
  if (pruned > 0 || shortPruned > 0) {
    tracePcbWarn(`${tag}_PRUNE`, `zeroLen=${pruned} short=${shortPruned}`);
  }
  auditTrackPadHits(doc, tag);
}

async function finishRouteCleanupAsync(doc: PcbDocument, tag: string): Promise<void> {
  const snapped = snapTrackEndpointsToPads(doc);
  if (snapped > 0) {
    tracePcb(`${tag}_SNAP`, `endpoints=${snapped}`);
  }
  await yieldToUi();
  const shortT0 = Date.now();
  const shortened = await shortenOrthoStairsAsync(doc, 1);
  tracePcb(`${tag}_SHORTEN`, `stairs=${shortened} ms=${Date.now() - shortT0} trk=${doc.tracks.length}`);
  await yieldToUi();
  const chamfered = chamferOrthoCorners(doc, 2);
  if (chamfered > 0) {
    tracePcb(`${tag}_CHAMFER45`, `corners=${chamfered}`);
  }
  await yieldToUi();
  const stubs = pruneStubTracks(doc, 22);
  if (stubs > 0) {
    tracePcb(`${tag}_STUB`, `removed=${stubs}`);
  }
  await yieldToUi();
  const shoved = shoveAllClearanceConflicts(doc, 2);
  if (shoved > 0) {
    tracePcb(`${tag}_SHOVE`, `rerouted=${shoved}`);
  }
  await yieldToUi();
  const merged = mergeColinearTracks(doc);
  if (merged > 0) {
    tracePcb(`${tag}_MERGE`, `colinear=${merged}`);
  }
  await yieldToUi();
  const pruned = pruneZeroLengthTracks(doc);
  const shortPruned = pruneShortTracks(doc, 2);
  if (pruned > 0 || shortPruned > 0) {
    tracePcbWarn(`${tag}_PRUNE`, `zeroLen=${pruned} short=${shortPruned}`);
  }
  await yieldToUi();
  await auditTrackPadHitsAsync(doc, tag);
}

/**
 * 连通优先排序：
 * 1) 超短局部 LED（无 J1）
 * 2) 本地 XTAL（早于跨 MCU 总线）
 * 3) 其它短局部
 * 4) 多脚总线 L*_R
 * 5) NRST→J1
 * 6) LED→J1（最晚信号）
 * 7) 地/电源最后
 */
function sortNetGroupsByLocality(groups: NetPadGroup[]): NetPadGroup[] {
  const scores: number[] = [];
  for (let i = 0; i < groups.length; i++) {
    const grp = groups[i];
    const pins: WarOrderPin[] = [];
    for (let pi = 0; pi < grp.points.length; pi++) {
      const pin: WarOrderPin = { key: `p${pi}`, pt: grp.points[pi] };
      pins.push(pin);
    }
    // 排序边长只用器件脚：J1 跨板边不抬高电源/短信号优先级
    const edgeCore = pins.length >= 2 ? WarRouteOrder.maxNnEdgeLength(pins) : 0;
    for (let ci = 0; ci < grp.connectorPoints.length; ci++) {
      const pin: WarOrderPin = { key: `c${ci}`, pt: grp.connectorPoints[ci] };
      pins.push(pin);
    }
    const edgeAll = pins.length >= 2 ? WarRouteOrder.maxNnEdgeLength(pins) : edgeCore;
    const pads = netPadTotal(grp);
    const corePads = grp.points.length;
    const hasConn = grp.connectorPoints.length > 0;
    let band = 5000;
    // 电源/地永远最后（即使挂了 J1）——曾因 connectorPoints>0 把 VCC 提到 2200，厚线堵死 L0_R/XTAL
    if (isGndNetName(grp.netName)) {
      band = 5200;
    } else if (isPowerNetName(grp.netName)) {
      band = 5600;
    } else if (isUltraLocalSignal(grp.netName, edgeCore, corePads > 0 ? corePads : pads) &&
      !hasConn) {
      band = 1000;
    } else if (isXtalNetName(grp.netName)) {
      // XTAL 早于总线：MCU↔晶体局部逃逸，避免被 L0_R x=615/1270 竖墙堵死
      band = 1500 + (isXtal2NetName(grp.netName) ? 40 : 0);
      const stem = xtalPairStem(grp.netName);
      let stemH = 0;
      for (let si = 0; si < stem.length; si++) {
        stemH = ((stemH * 17) + stem.charCodeAt(si)) | 0;
      }
      band += (Math.abs(stemH) % 30);
    } else if (edgeCore <= 900 && corePads >= 2 && corePads <= 4 &&
      !isNrstNetName(grp.netName) && !hasConn && !isLedNetName(grp.netName) &&
      !isBusNetName(grp.netName)) {
      band = 1800;
    } else if (isBusNetName(grp.netName) || corePads >= STAR_HUB_MIN_PADS) {
      // 总线在 XTAL 之后；仍早于 NRST/LED→J1
      band = 2400;
    } else if (isNrstNetName(grp.netName)) {
      band = 3200;
    } else if (isLedNetName(grp.netName) && hasConn) {
      // LED→J1 最晚信号；内层外围细线
      band = 4800;
    } else if (hasConn) {
      band = 3400;
    } else if (edgeAll <= 1200 && pads <= 4) {
      band = 3800;
    } else {
      band = 4500;
    }
    // band 主导顺序；edge 只做同 band 内微调（曾用 +edgeCore 把 L0_R 挤到 L0_LED 之后）
    const edgeTie = Math.min(edgeCore, 800) * 0.02;
    scores.push(band + edgeTie + i * 0.001);
  }
  const order = WarRouteOrder.sortNetIndicesByLocality(scores);
  const out: NetPadGroup[] = [];
  for (let i = 0; i < order.length; i++) {
    out.push(groups[order[i]]);
  }
  return out;
}

function clearNetCopper(doc: PcbDocument, netId: string): number {
  const before = doc.tracks.length + doc.vias.length;
  doc.tracks = doc.tracks.filter((t: PcbTrack) => t.netId !== netId);
  doc.vias = doc.vias.filter((v: PcbVia) => v.netId !== netId);
  return before - doc.tracks.length - doc.vias.length;
}

function padBBox(grp: NetPadGroup, pad: number): PadBBox {
  const all: Point2D[] = [];
  for (const p of grp.points) {
    all.push(p);
  }
  for (const p of grp.connectorPoints) {
    all.push(p);
  }
  let minX = all[0].x;
  let maxX = all[0].x;
  let minY = all[0].y;
  let maxY = all[0].y;
  for (let i = 1; i < all.length; i++) {
    if (all[i].x < minX) {
      minX = all[i].x;
    }
    if (all[i].x > maxX) {
      maxX = all[i].x;
    }
    if (all[i].y < minY) {
      minY = all[i].y;
    }
    if (all[i].y > maxY) {
      maxY = all[i].y;
    }
  }
  const out: PadBBox = {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad
  };
  return out;
}

/** 线段与轴对齐包围盒是否相交（端点或穿越） */
function segmentHitsPadBox(a: Point2D, b: Point2D, box: PadBBox): boolean {
  const inBox = (p: Point2D): boolean =>
    p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;
  if (inBox(a) || inBox(b)) {
    return true;
  }
  // 正交线穿越盒（自动布线产出多为正交）
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  if (Math.abs(a.y - b.y) < 0.5) {
    const y = a.y;
    return y >= box.minY && y <= box.maxY && maxX >= box.minX && minX <= box.maxX;
  }
  if (Math.abs(a.x - b.x) < 0.5) {
    const x = a.x;
    return x >= box.minX && x <= box.maxX && maxY >= box.minY && minY <= box.maxY;
  }
  // 斜线：中点近似
  const mx = (a.x + b.x) * 0.5;
  const my = (a.y + b.y) * 0.5;
  return mx >= box.minX && mx <= box.maxX && my >= box.minY && my <= box.maxY;
}

function netNameById(doc: PcbDocument, netId: string): string {
  for (const n of doc.nets) {
    if (n.id === netId) {
      return n.name || '';
    }
  }
  return '';
}

/**
 * 飞线 a–b 被异网正交穿越时，记为阻挡网（VCC/L0_R 典型）。
 * 传入已算好的 rats，避免每轮再 buildRatsnest。
 */
async function foreignBlockerNetsCrossingRatsAsync(doc: PcbDocument, victimNetId: string,
  topK: number, allowPower: boolean, rats: PcbRatsnestEdge[]): Promise<string[]> {
  const counts: Map<string, number> = new Map();
  const bump = (netId: string, w: number): void => {
    if (!netId || netId === victimNetId) {
      return;
    }
    const nm = netNameById(doc, netId);
    if (isGndNetName(nm)) {
      return;
    }
    if (!allowPower && isPowerNetName(nm)) {
      return;
    }
    let ww = (allowPower && isPowerNetName(nm)) ? Math.max(1, Math.floor(w / 2)) : w;
    // 跨板信号干线（L*_R）堵飞线时加重，便于 VCC rip 优先撕
    const up = nm.toUpperCase();
    if (up.indexOf('_R') >= 0 && up.indexOf('LED') < 0 && up.indexOf('XTAL') < 0) {
      ww += 3;
    }
    counts.set(netId, (counts.get(netId) ?? 0) + ww);
  };
  let sliceStart = Date.now();
  let comps = 0;
  for (let ri = 0; ri < rats.length; ri++) {
    const r = rats[ri];
    if (r.netId !== victimNetId) {
      continue;
    }
    for (let ti = 0; ti < doc.tracks.length; ti++) {
      const t = doc.tracks[ti];
      if (!t.netId || t.netId === victimNetId) {
        continue;
      }
      comps++;
      if ((comps & 31) === 0) {
        sliceStart = await yieldIfSliceOver(sliceStart);
      }
      if (WireConflictGeometry.segmentConflict(r.a, r.b, t.start, t.end) !== 'orthogonal_cross') {
        continue;
      }
      const cp = WireConflictGeometry.orthogonalCrossPoint(r.a, r.b, t.start, t.end);
      if (cp === null ||
        !WireConflictGeometry.isMidspanCross(cp, [r.a, r.b], [t.start, t.end], 3)) {
        continue;
      }
      bump(t.netId, 4);
    }
    sliceStart = await yieldIfSliceOver(sliceStart);
  }
  const ids: string[] = [];
  counts.forEach((_c: number, id: string) => {
    ids.push(id);
  });
  ids.sort((a: string, b: string): number => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  if (ids.length > topK) {
    return ids.slice(0, topK);
  }
  return ids;
}

/**
 * 焊盘包围盒内阻挡异网（过孔 + 走线），按命中次数降序。
 * allowPower：卡住时允许撕挡路电源 stub（仍跳过地网）。
 */
function foreignBlockerNetsInPadBox(doc: PcbDocument, grp: NetPadGroup, topK: number,
  padMargin: number, allowPower: boolean): string[] {
  const box = padBBox(grp, padMargin);
  const counts: Map<string, number> = new Map();
  const bump = (netId: string, w: number): void => {
    if (!netId || netId === grp.netId) {
      return;
    }
    const nm = netNameById(doc, netId);
    if (isGndNetName(nm)) {
      return;
    }
    if (!allowPower && isPowerNetName(nm)) {
      return;
    }
    // 电源可撕但权重更低，避免优先拆 VCC
    const ww = (allowPower && isPowerNetName(nm)) ? Math.max(1, Math.floor(w / 2)) : w;
    counts.set(netId, (counts.get(netId) ?? 0) + ww);
  };
  for (const v of doc.vias) {
    if (!v.netId) {
      continue;
    }
    if (v.position.x < box.minX || v.position.x > box.maxX ||
      v.position.y < box.minY || v.position.y > box.maxY) {
      continue;
    }
    bump(v.netId, 3);
  }
  for (const t of doc.tracks) {
    if (!t.netId) {
      continue;
    }
    if (!segmentHitsPadBox(t.start, t.end, box)) {
      continue;
    }
    bump(t.netId, 1);
  }
  const ids: string[] = [];
  counts.forEach((_c: number, id: string) => {
    ids.push(id);
  });
  ids.sort((a: string, b: string): number => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  if (ids.length > topK) {
    return ids.slice(0, topK);
  }
  return ids;
}

/**
 * 电源网断点补缝：不撕线，只对 GND/VCC 残留飞线逐条 clearance 重试。
 */
async function stitchPowerNetGapsAsync(doc: PcbDocument, preferredLayer: PcbLayerId,
  grid: number, defaultWidth: number, netPads: Map<string, NetPadGroup>): Promise<number> {
  const rats = buildRatsnest(doc);
  if (rats.length === 0) {
    return 0;
  }
  const byNet: Map<string, PcbRatsnestEdge[]> = new Map();
  for (let i = 0; i < rats.length; i++) {
    const e = rats[i];
    const g = netPads.get(e.netId);
    const nm = g !== undefined ? g.netName : e.netName;
    if (!isPowerNetName(nm)) {
      continue;
    }
    let list = byNet.get(e.netId);
    if (list === undefined) {
      list = [];
      byNet.set(e.netId, list);
    }
    list.push(e);
  }
  let stitched = 0;
  const netIds: string[] = [];
  byNet.forEach((_v: PcbRatsnestEdge[], id: string) => {
    netIds.push(id);
  });
  netIds.sort((a: string, b: string): number => {
    const ga = netPads.get(a);
    const gb = netPads.get(b);
    const na = ga !== undefined ? ga.netName : '';
    const nb = gb !== undefined ? gb.netName : '';
    const sa = isGndNetName(na) ? 0 : 1;
    const sb = isGndNetName(nb) ? 0 : 1;
    return sa - sb;
  });
  for (let ni = 0; ni < netIds.length; ni++) {
    const nid = netIds[ni];
    const g = netPads.get(nid);
    if (g === undefined) {
      continue;
    }
    const edges = byNet.get(nid);
    if (edges === undefined || edges.length === 0) {
      continue;
    }
    const pair = layerPairForNet(doc, preferredLayer, g.netName, nid);
    const w = widthForNet(doc, nid, g.netName, defaultWidth);
    const cap = Math.min(edges.length, POWER_STITCH_EDGE_CAP);
    let netSegs = 0;
    for (let ei = 0; ei < cap; ei++) {
      await yieldToUi();
      if ((ei % 4) === 0 && ei > 0 && !netHasRats(buildRatsnest(doc), nid)) {
        break;
      }
      const e = edges[ei];
      const n = await routePairClearanceAwareAsync(doc, pair, e.a, e.b, nid, g.netName, grid, w);
      if (n > 0) {
        netSegs += n;
        stitched++;
      }
    }
    if (netSegs > 0) {
      tracePcb('AUTO_POWER_STITCH',
        `${g.netName || nid} edgesTried=${cap} segs=${netSegs}`);
    }
  }
  return stitched;
}

/**
 * 未连通网局部 rip-up：清自身 + top-K 阻挡网（过孔/走线），多受害网轮转；
 * 曾有铜的被撕网优先重布；变成孤儿（无铜仍飞线）则整轮回滚；
 * 无进展时换下一受害网，连续无进展才停。
 */
async function repairIncompleteNetsAsync(doc: PcbDocument, preferredLayer: PcbLayerId,
  grid: number, defaultWidth: number, netPads: Map<string, NetPadGroup>): Promise<number> {
  const MAX_ROUNDS = INCOMPLETE_REPAIR_ROUNDS;
  const BLOCKER_TOP_K = 3;
  const MAX_STALL = INCOMPLETE_REPAIR_STALL;
  let repaired = 0;
  let stall = 0;
  let victimCursor = 0;
  /** ROLLBACK 后禁止再撕电源星形（VCC 重布是 ANR 主因） */
  let skipPowerVictim = false;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    await yieldToUi();
    const rats = buildRatsnest(doc);
    await yieldToUi();
    if (rats.length === 0) {
      break;
    }
    const incomplete: string[] = [];
    const seen: Set<string> = new Set();
    for (let i = 0; i < rats.length; i++) {
      const nid = rats[i].netId;
      if (seen.has(nid)) {
        continue;
      }
      seen.add(nid);
      incomplete.push(nid);
    }
    incomplete.sort((a: string, b: string): number => {
      const score = (nid: string): number => {
        const g = netPads.get(nid);
        if (g === undefined) {
          return 1e9;
        }
        const pins: WarOrderPin[] = [];
        for (let pi = 0; pi < g.points.length; pi++) {
          const pin: WarOrderPin = { key: `p${pi}`, pt: g.points[pi] };
          pins.push(pin);
        }
        for (let ci = 0; ci < g.connectorPoints.length; ci++) {
          const pin: WarOrderPin = { key: `c${ci}`, pt: g.connectorPoints[ci] };
          pins.push(pin);
        }
        const edge = pins.length >= 2 ? WarRouteOrder.maxNnEdgeLength(pins) : 0;
        const empty = !netAlreadyRouted(doc, nid);
        // 电源干线优先修复（否则 L*_R 撕补会反复堵 VCC）
        if (isPowerNetName(g.netName) && !isGndNetName(g.netName)) {
          return -1e7 + edge;
        }
        if (isGndNetName(g.netName)) {
          return -5e6 + edge;
        }
        // 完全无铜的未连通网优先于 partial（避免空转撕 partial）
        if (empty && isNrstNetName(g.netName)) {
          return -4e6 + edge;
        }
        if (empty) {
          return -3e6 + edge;
        }
        if (isNrstNetName(g.netName)) {
          return -2e6 + edge;
        }
        return edge;
      };
      return score(a) - score(b);
    });
    await yieldToUi();
    if (incomplete.length === 0) {
      break;
    }
    let victim = '';
    let pickGuard = 0;
    while (pickGuard < incomplete.length) {
      const cand = incomplete[victimCursor % incomplete.length];
      victimCursor++;
      pickGuard++;
      const cg = netPads.get(cand);
      if (cg === undefined) {
        continue;
      }
      const candPower = isPowerNetName(cg.netName) && !isGndNetName(cg.netName);
      if (skipPowerVictim && candPower) {
        continue;
      }
      victim = cand;
      break;
    }
    if (victim.length === 0) {
      tracePcbWarn('AUTO_INCOMPLETE_REPAIR', 'no_victim_left stop');
      break;
    }
    const grp = netPads.get(victim);
    if (grp === undefined || netPadTotal(grp) < 2) {
      stall++;
      if (stall >= MAX_STALL) {
        break;
      }
      continue;
    }
    const padMargin = stall === 0 ? 140 : stall === 1 ? 220 : 340;
    // 电源受害网：始终允许撕挡路信号；地网不撕
    const victimIsPower = isPowerNetName(grp.netName) && !isGndNetName(grp.netName);
    const allowPower = stall >= 1 && !victimIsPower;
    const blkExtra = stall >= 1 ? Math.min(stall, 2) : 0;
    const blkK = (victimIsPower ? Math.min(BLOCKER_TOP_K + 1, 4) : BLOCKER_TOP_K) + blkExtra;
    const boxBlockers = foreignBlockerNetsInPadBox(doc, grp, blkK, padMargin, allowPower);
    await yieldToUi();
    const ratBlockers = await foreignBlockerNetsCrossingRatsAsync(doc, victim, blkK, allowPower, rats);
    await yieldToUi();
    const blockers: string[] = [];
    const seenBlk: Set<string> = new Set();
    const pushBlk = (id: string): void => {
      if (seenBlk.has(id) || id === victim) {
        return;
      }
      seenBlk.add(id);
      blockers.push(id);
    };
    for (let bi = 0; bi < ratBlockers.length; bi++) {
      pushBlk(ratBlockers[bi]);
    }
    for (let bi = 0; bi < boxBlockers.length; bi++) {
      pushBlk(boxBlockers[bi]);
    }
    const ripIds: string[] = [victim];
    const blkCap = Math.min(blockers.length, blkK);
    for (let bi = 0; bi < blkCap; bi++) {
      ripIds.push(blockers[bi]);
    }
    // 成功门闩：恶化则整轮回滚铜，避免 L2_R 被撕成 UNROUTED
    const snapTracks: PcbTrack[] = doc.tracks.slice();
    const snapVias: PcbVia[] = doc.vias.slice();
    // 记录撕前谁有铜，重布时优先补回
    const hadCopper: Map<string, boolean> = new Map();
    for (let ri = 0; ri < ripIds.length; ri++) {
      hadCopper.set(ripIds[ri], netAlreadyRouted(doc, ripIds[ri]));
    }
    let removed = 0;
    for (let ri = 0; ri < ripIds.length; ri++) {
      removed += clearNetCopper(doc, ripIds[ri]);
    }
    // 重布顺序：受害网 → 曾有铜的阻挡网 → 其余
    const reRouteOrder: string[] = [];
    const pushRoute = (nid: string): void => {
      for (let i = 0; i < reRouteOrder.length; i++) {
        if (reRouteOrder[i] === nid) {
          return;
        }
      }
      reRouteOrder.push(nid);
    };
    pushRoute(victim);
    for (let oi = 0; oi < ripIds.length; oi++) {
      const nid = ripIds[oi];
      if (nid !== victim && hadCopper.get(nid) === true) {
        pushRoute(nid);
      }
    }
    for (let oi = 0; oi < ripIds.length; oi++) {
      pushRoute(ripIds[oi]);
    }
    let segs = 0;
    const firstPassSegs: Map<string, number> = new Map();
    for (let oi = 0; oi < reRouteOrder.length; oi++) {
      const nid = reRouteOrder[oi];
      const g = netPads.get(nid);
      if (g === undefined || netPadTotal(g) < 2) {
        continue;
      }
      const pair = layerPairForNet(doc, preferredLayer, g.netName, nid);
      const w = widthForNet(doc, nid, g.netName, defaultWidth);
      const got = await routeNetGroupAsync(doc, pair, g, grid, w);
      firstPassSegs.set(nid, got);
      segs += got;
      await yieldToUi();
    }
    // 门闩：被撕网若变成「无铜仍未连通」再布一次；首遍已 0 段的跳过（避免 XTAL/NRST 双倍烧墙）
    const ratsMid = buildRatsnest(doc);
    for (let oi = 0; oi < reRouteOrder.length; oi++) {
      const nid = reRouteOrder[oi];
      if (!netHasRats(ratsMid, nid)) {
        continue;
      }
      if (netAlreadyRouted(doc, nid)) {
        continue;
      }
      const firstGot = firstPassSegs.get(nid);
      const g = netPads.get(nid);
      if (g === undefined || netPadTotal(g) < 2) {
        continue;
      }
      // 电源首遍 0 段仍跳过（防双倍烧墙 ANR）；信号/总线/LED/XTAL 允许再试
      if (firstGot !== undefined && firstGot <= 0) {
        if (isPowerNetName(g.netName)) {
          tracePcbWarn('AUTO_REPAIR_GATE',
            `${g.netName || nid} skip-retry firstPass=0 power`);
          continue;
        }
        tracePcbWarn('AUTO_REPAIR_GATE',
          `${g.netName || nid} allow-retry firstPass=0`);
      }
      const pair = layerPairForNet(doc, preferredLayer, g.netName, nid);
      const w = widthForNet(doc, nid, g.netName, defaultWidth);
      const retry = await routeNetGroupAsync(doc, pair, g, grid, w);
      segs += retry;
      tracePcbWarn('AUTO_REPAIR_GATE',
        `${g.netName || nid} empty→retry segs=${retry}`);
      await yieldToUi();
    }
    const ratsBefore = rats.length;
    repaired++;
    // 曾有铜的网变成孤儿（无铜+仍有飞线）→ 整轮回滚，避免修一个毁一片
    const ratsNow = buildRatsnest(doc);
    const ratsAfter = ratsNow.length;
    let orphaned = false;
    let orphanLabel = '';
    for (let oi = 0; oi < ripIds.length; oi++) {
      const nid = ripIds[oi];
      if (hadCopper.get(nid) !== true) {
        continue;
      }
      if (netAlreadyRouted(doc, nid)) {
        continue;
      }
      if (!netHasRats(ratsNow, nid)) {
        continue;
      }
      orphaned = true;
      const g = netPads.get(nid);
      orphanLabel = g !== undefined ? (g.netName || nid) : nid;
      break;
    }
    if (ratsAfter > ratsBefore || orphaned) {
      doc.tracks = snapTracks;
      doc.vias = snapVias;
      stall++;
      if (victimIsPower) {
        skipPowerVictim = true;
      }
      const why = orphaned
        ? `ORPHAN ${orphanLabel}`
        : `worse rats ${ratsBefore}→${ratsAfter}`;
      tracePcbWarn('AUTO_INCOMPLETE_REPAIR',
        `round=${round + 1} net=${grp.netName || victim} ROLLBACK ${why} ` +
        `stall=${stall}/${MAX_STALL}`);
      await yieldToUi();
      // 电源撕补失败：跳过后续电源 victim，继续修信号（勿整轮停死）
      if (victimIsPower) {
        tracePcbWarn('AUTO_INCOMPLETE_REPAIR',
          `power_rollback skip-power → continue signal repair`);
        continue;
      }
      if (stall >= MAX_STALL) {
        tracePcbWarn('AUTO_INCOMPLETE_REPAIR',
          `no_progress stall=${stall} stop`);
        break;
      }
      continue;
    }
    tracePcb('AUTO_INCOMPLETE_REPAIR',
      `round=${round + 1} net=${grp.netName || victim} rip=${ripIds.length} ` +
      `blockers=${blockers.length} removed=${removed} rewroteSegs=${segs} ` +
      `rats ${ratsBefore}→${ratsAfter}`);
    if (ratsAfter < ratsBefore) {
      stall = 0;
    } else {
      stall++;
      if (stall >= MAX_STALL) {
        tracePcbWarn('AUTO_INCOMPLETE_REPAIR',
          `no_progress stall=${stall} stop`);
        break;
      }
    }
  }
  return repaired;
}

/** 收集同层异网中段交叉涉及的 netId（端点相接不算） */
function collectMidspanCrossNetIds(doc: PcbDocument): string[] {
  const nets: Set<string> = new Set();
  const tracks = doc.tracks;
  for (let i = 0; i < tracks.length; i++) {
    const a = tracks[i];
    if (!a.netId || a.netId.length === 0) {
      continue;
    }
    for (let j = i + 1; j < tracks.length; j++) {
      const b = tracks[j];
      if (a.layer !== b.layer || a.netId === b.netId) {
        continue;
      }
      if (WireConflictGeometry.segmentConflict(a.start, a.end, b.start, b.end) !== 'orthogonal_cross') {
        continue;
      }
      const cp = WireConflictGeometry.orthogonalCrossPoint(a.start, a.end, b.start, b.end);
      if (cp === null ||
        !WireConflictGeometry.isMidspanCross(cp, [a.start, a.end], [b.start, b.end], 3)) {
        continue;
      }
      nets.add(a.netId);
      nets.add(b.netId);
    }
  }
  const out: string[] = [];
  nets.forEach((id: string) => {
    out.push(id);
  });
  return out;
}

/** O(tracks²) 交叉扫描的协作式版本 */
async function collectMidspanCrossNetIdsAsync(doc: PcbDocument): Promise<string[]> {
  const nets: Set<string> = new Set();
  const tracks = doc.tracks;
  let sliceStart = Date.now();
  let comps = 0;
  for (let i = 0; i < tracks.length; i++) {
    const a = tracks[i];
    if (!a.netId || a.netId.length === 0) {
      continue;
    }
    for (let j = i + 1; j < tracks.length; j++) {
      const b = tracks[j];
      if (a.layer !== b.layer || a.netId === b.netId) {
        continue;
      }
      comps++;
      if ((comps & 31) === 0) {
        sliceStart = await yieldIfSliceOver(sliceStart);
      }
      if (WireConflictGeometry.segmentConflict(a.start, a.end, b.start, b.end) !== 'orthogonal_cross') {
        continue;
      }
      const cp = WireConflictGeometry.orthogonalCrossPoint(a.start, a.end, b.start, b.end);
      if (cp === null ||
        !WireConflictGeometry.isMidspanCross(cp, [a.start, a.end], [b.start, b.end], 3)) {
        continue;
      }
      nets.add(a.netId);
      nets.add(b.netId);
    }
    sliceStart = await yieldIfSliceOver(sliceStart);
  }
  const out: string[] = [];
  nets.forEach((id: string) => {
    out.push(id);
  });
  return out;
}

/**
 * 布线后若仍有同层中段交叉：清掉涉事网并重布（最多 4 轮），优先重布较短/非电源网。
 */
async function repairSameLayerCrossesAsync(doc: PcbDocument, preferredLayer: PcbLayerId,
  grid: number, defaultWidth: number): Promise<number> {
  let repaired = 0;
  for (let round = 0; round < 4; round++) {
    await yieldToUi();
    const crossNets = await collectMidspanCrossNetIdsAsync(doc);
    if (crossNets.length === 0) {
      break;
    }
    // 电源网尽量保留已有铜，先重布信号网
    const score = (nid: string): number => {
      let name = '';
      for (const n of doc.nets) {
        if (n.id === nid) {
          name = (n.name || '').toUpperCase();
          break;
        }
      }
      if (name === 'GND' || name === 'VSS' || name === 'VCC' || name === 'VDD') {
        return 100000;
      }
      let len = 0;
      for (const t of doc.tracks) {
        if (t.netId === nid) {
          len += dist(t.start, t.end);
        }
      }
      return len;
    };
    crossNets.sort((a: string, b: string): number => score(a) - score(b));
    const victim = crossNets[0];
    let vName = victim;
    for (const n of doc.nets) {
      if (n.id === victim) {
        vName = n.name || victim;
        break;
      }
    }
    const trkBefore = doc.tracks.length;
    doc.tracks = doc.tracks.filter((t: PcbTrack) => t.netId !== victim);
    doc.vias = doc.vias.filter((v: PcbVia) => v.netId !== victim);
    const removed = trkBefore - doc.tracks.length;
    const netPads = collectNetPads(doc);
    const grp = netPads.get(victim);
    if (grp === undefined || netPadTotal(grp) < 2) {
      tracePcbWarn('AUTO_CROSS_REPAIR', `${vName} — 清线后无足够焊盘，跳过`);
      continue;
    }
    const pair = layerPairForNet(doc, preferredLayer, grp.netName, victim);
    const w = widthForNet(doc, victim, grp.netName, defaultWidth);
    const segs = await routeNetGroupAsync(doc, pair, grp, grid, w);
    repaired++;
    tracePcb('AUTO_CROSS_REPAIR',
      `round=${round + 1} net=${vName} removedTrk=${removed} rewroteSegs=${segs} ` +
      `crossNetsWas=${crossNets.length}`);
  }
  return repaired;
}

/** 布线后粗检：走线中段是否仍压异网焊盘（应≈0） */
function auditTrackPadHits(doc: PcbDocument, tag: string): void {
  let hits = 0;
  const sampleLimit = 30;
  for (let ti = 0; ti < doc.tracks.length; ti++) {
    const t = doc.tracks[ti];
    if (!t.netId || t.netId.length === 0) {
      continue;
    }
    const reason = pathClearBlockReason(doc, t.layer, t.start, t.end, t.netId, t.width,
      [], doc.vias);
    if (reason !== null && reason.indexOf('pad_block') >= 0) {
      hits++;
      if (hits <= sampleLimit) {
        tracePcbWarn(`${tag}_PAD_HIT`,
          `${t.netName || t.netId} layer=${t.layer} ` +
          `(${Math.round(t.start.x)},${Math.round(t.start.y)})→` +
          `(${Math.round(t.end.x)},${Math.round(t.end.y)}) ${reason}`);
      }
    }
  }
  if (hits === 0) {
    tracePcb(`${tag}_PAD_HIT`, '(none detected)');
  } else {
    tracePcbWarn(`${tag}_PAD_HIT_SUMMARY`, `hits=${hits} tracks=${doc.tracks.length}`);
  }
}

async function auditTrackPadHitsAsync(doc: PcbDocument, tag: string): Promise<void> {
  let hits = 0;
  const sampleLimit = 30;
  let sliceStart = Date.now();
  for (let ti = 0; ti < doc.tracks.length; ti++) {
    sliceStart = await yieldIfSliceOver(sliceStart);
    const t = doc.tracks[ti];
    if (!t.netId || t.netId.length === 0) {
      continue;
    }
    const reason = pathClearBlockReason(doc, t.layer, t.start, t.end, t.netId, t.width,
      [], doc.vias);
    if (reason !== null && reason.indexOf('pad_block') >= 0) {
      hits++;
      if (hits <= sampleLimit) {
        tracePcbWarn(`${tag}_PAD_HIT`,
          `${t.netName || t.netId} layer=${t.layer} ` +
          `(${Math.round(t.start.x)},${Math.round(t.start.y)})→` +
          `(${Math.round(t.end.x)},${Math.round(t.end.y)}) ${reason}`);
      }
    }
  }
  if (hits === 0) {
    tracePcb(`${tag}_PAD_HIT`, '(none detected)');
  } else {
    tracePcbWarn(`${tag}_PAD_HIT_SUMMARY`, `hits=${hits} tracks=${doc.tracks.length}`);
  }
}

/**
 * 对指定网络清除旧走线并重新 L 型链式布线。
 * 用于封装移动/旋转后的局部重布。
 */
export function rerouteNets(doc: PcbDocument, layer: PcbLayerId, netIds: Set<string>): RerouteResult {
  const empty: RerouteResult = { trackCount: 0, netCount: 0 };
  if (netIds.size === 0) {
    return empty;
  }

  const grid = doc.metadata.gridSize ?? 5;
  const width = doc.metadata.designRules.defaultTrackWidth;
  const netPads = collectNetPads(doc);
  const toRoute: string[] = [];

  netIds.forEach((nid: string) => {
    const grp = netPads.get(nid);
    if (grp === undefined || netPadTotal(grp) < 2) {
      return;
    }
    toRoute.push(nid);
  });

  if (toRoute.length === 0) {
    return empty;
  }

  const routeSet = new Set(toRoute);
  doc.tracks = doc.tracks.filter((t: PcbTrack) => !routeSet.has(t.netId));
  doc.vias = doc.vias.filter((v: PcbVia) => !routeSet.has(v.netId));

  let trackCount = 0;
  for (const nid of toRoute) {
    const grp = netPads.get(nid);
    if (grp === undefined) {
      continue;
    }
    const pair = layerPairForNet(doc, layer, grp.netName, grp.netId);
    const w = widthForNet(doc, grp.netId, grp.netName, width);
    const segs = routeNetGroup(doc, pair, grp, grid, w);
    trackCount += segs;
    tracePcb('REROUTE_NET',
      `${grp.netName || grp.netId} pads=${grp.points.length} segments=${segs} ` +
      `H=${pair.h} V=${pair.v}`);
  }

  finishRouteCleanup(doc, 'REROUTE');

  tracePcb('REROUTE_DONE', `nets=${toRoute.length} tracks=${trackCount}`);
  doc.metadata.modifiedAt = new Date().toISOString();
  return { trackCount, netCount: toRoute.length };
}

/**
 * 对未布线网络执行自动正交布线
 * 主路径：确定性通道布线（MCP 策略本地化）；不再默认跑迷宫+LLM 重型流水线。
 * @param agent 保留参数兼容 Orchestrator；通道引擎忽略几何侧 agent 钩子
 */
export async function autoRoutePcb(doc: PcbDocument, layer: PcbLayerId,
  schNets?: AccessoryNetHint[],
  agent?: PcbRouteEngineHooks | null): Promise<AutoRouteResult> {
  setPcbInstrAuditPaused(true);
  activeAgentLayerRoles = null;
  activeAgentCorridorBias = null;
  activeAgentForceHv = null;
  activeSignalLayerPairs = [];
  signalPairUseCount = [];
  agentPairFailDigests = [];
  try {
    // 确定性通道主路径：可复现、有硬超时、无 LLM
    const chan = await channelAutoRoutePcb(doc, layer, schNets);
    const result: AutoRouteResult = {
      trackCount: chan.trackCount,
      netCount: chan.netCount,
      messages: chan.messages,
      completionRate: chan.completionRate,
      totalWireLength: chan.totalWireLength,
      viaCount: chan.viaCount,
      drcErrorCount: chan.drcErrorCount,
      metrics: chan.metrics
    };
    if (agent !== undefined && agent !== null) {
      tracePcb('AUTO_CHAN', 'agent hooks present but skipped (channel engine)');
    }
    return result;
  } finally {
    activeAgentLayerRoles = null;
    activeAgentCorridorBias = null;
    activeAgentForceHv = null;
    activeSignalLayerPairs = [];
    signalPairUseCount = [];
    agentPairFailDigests = [];
    setPcbInstrAuditPaused(false);
  }
}

/** 旧迷宫+Agent 流水线（对照/调试）；生产 F8 走 channelAutoRoutePcb */
export async function autoRoutePcbLegacyMaze(doc: PcbDocument, layer: PcbLayerId,
  schNets?: AccessoryNetHint[],
  agent?: PcbRouteEngineHooks | null): Promise<AutoRouteResult> {
  setPcbInstrAuditPaused(true);
  activeAgentLayerRoles = null;
  activeAgentCorridorBias = null;
  activeAgentForceHv = null;
  activeSignalLayerPairs = [];
  signalPairUseCount = [];
  agentPairFailDigests = [];
  try {
    return await autoRoutePcbInner(doc, layer, schNets, agent);
  } finally {
    activeAgentLayerRoles = null;
    activeAgentCorridorBias = null;
    activeAgentForceHv = null;
    activeSignalLayerPairs = [];
    signalPairUseCount = [];
    agentPairFailDigests = [];
    setPcbInstrAuditPaused(false);
  }
}

async function autoRoutePcbInner(doc: PcbDocument, layer: PcbLayerId,
  schNets?: AccessoryNetHint[],
  agent?: PcbRouteEngineHooks | null): Promise<AutoRouteResult> {
  const messages: string[] = [];
  const grid = doc.metadata.gridSize ?? 5;
  const width = doc.metadata.designRules.defaultTrackWidth;
  const copper = copperLayersFromStack(doc.layerStack);
  const cuN = copper.length > 0 ? copper.length : 2;

  await yieldToUi();

  const acc = ensureBoardAccessories(doc, undefined, schNets);
  if (acc.message.length > 0) {
    messages.push(acc.message);
  }
  if (acc.addedNew && acc.connectorNetIds.length > 0) {
    const cleared = clearCopperForNets(doc, acc.connectorNetIds);
    if (cleared > 0) {
      tracePcb('AUTO_CLEAR_FOR_J1', `cleared=${cleared} nets=${acc.connectorNetIds.length}`);
    }
  }

  const netPads = collectNetPads(doc);
  const groupsRaw: NetPadGroup[] = [];
  netPads.forEach((grp: NetPadGroup) => {
    groupsRaw.push(grp);
  });
  let groups = sortNetGroupsByLocality(groupsRaw);
  // 区域内聚：同象限网相邻处理，降低跨区干扰并便于切片让出
  groups.sort((a: NetPadGroup, b: NetPadGroup) => {
    const ca = netCentroid(a);
    const cb = netCentroid(b);
    const qa = ((ca.x >= 0 ? 1 : 0) + (ca.y >= 0 ? 2 : 0));
    const qb = ((cb.x >= 0 ? 1 : 0) + (cb.y >= 0 ? 2 : 0));
    if (qa !== qb) {
      return qa - qb;
    }
    return 0;
  });

  // —— Strategy.plan：层角色 + 网序；失败也继续 ——
  tracePcb('AUTO_STAGE_BEGIN', 'strategyPlan');
  if (agent !== undefined && agent !== null && agent.strategyPlan !== undefined) {
    const cuIds: string[] = [];
    for (let i = 0; i < copper.length; i++) {
      cuIds.push(copper[i] as string);
    }
    const gctx: PcbAutoRouteAgentContext = {
      copperLayers: cuIds,
      netSummaries: buildAgentNetSummaries(groups)
    };
    fillAgentContextExtras(gctx, doc, netPads, null, [], '');
    tracePcb('AUTO_AGENT_BEGIN', 'strategyPlan');
    try {
      const advice = await agent.strategyPlan(gctx);
      if (advice !== null && isTrustedAutoAdvice(advice.fromLlm, advice.fromLocal)) {
        const bad = validateAutoLayerRoles(advice.layerRoles, copper);
        if (bad.length > 0) {
          tracePcbWarn('AUTO_AGENT_FAIL', `strategyPlan schema ${bad}`);
        } else {
          activeAgentLayerRoles = advice.layerRoles;
          refreshActiveSignalPairs(copper, advice.layerRoles);
          if (advice.netOrder.length > 0) {
            groups = applyAgentNetOrder(groups, advice.netOrder);
          }
          const src = advice.fromLlm ? 'llm' : 'local';
          const pairDesc = activeSignalLayerPairs.map((p: NetLayerPair): string =>
            `${p.h}/${p.v}`).join(',');
          tracePcb('AUTO_AGENT_OK',
            `strategyPlan src=${src} roles=${Object.keys(advice.layerRoles).length} ` +
            `order=${advice.netOrder.length} sigPairs=${pairDesc}`);
          tracePcb('AUTO_AGENT_APPLY',
            `strategyPlan src=${src} roles=${Object.keys(advice.layerRoles).length} ` +
            `order=${advice.netOrder.length}`);
        }
      } else {
        tracePcb('AUTO_AGENT_APPLY', 'strategyPlan noop');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : `${e}`;
      tracePcbWarn('AUTO_AGENT_FAIL', `strategyPlan ${msg}`);
    }
  } else {
    tracePcb('AUTO_AGENT_SKIP', 'no strategyPlan hooks');
  }
  if (activeSignalLayerPairs.length === 0) {
    refreshActiveSignalPairs(copper, activeAgentLayerRoles);
    if (activeSignalLayerPairs.length > 0) {
      const pairDesc = activeSignalLayerPairs.map((p: NetLayerPair): string =>
        `${p.h}/${p.v}`).join(',');
      tracePcb('AUTO_SIGNAL_PAIRS', `pairs=${pairDesc} classSplit=xtal0/busLedNrst1`);
    }
  }
  tracePcb('AUTO_STAGE_END', 'strategyPlan');

  // —— MCU 手布：仅补铜；层角色优先保留 LLM Strategy，无 LLM 时才套模板角色 ——
  const mcuClusters = detectMcuColumnClusters(doc);
  if (mcuClusters > 0) {
    if (activeAgentLayerRoles === null) {
      const handRoles = buildMcuHandLayerRoles(copper);
      const handBad = validateAutoLayerRoles(handRoles, copper);
      if (handBad.length === 0) {
        activeAgentLayerRoles = handRoles;
        refreshActiveSignalPairs(copper, handRoles);
        tracePcb('MCU_HAND_ROLES',
          `clusters=${mcuClusters} Cu=${cuN} roles=${Object.keys(handRoles).length} src=local`);
      } else {
        tracePcbWarn('MCU_HAND_ROLES_SKIP', handBad);
      }
    } else {
      tracePcb('MCU_HAND_ROLES',
        `clusters=${mcuClusters} keep_llm_roles=${Object.keys(activeAgentLayerRoles).length}`);
    }
    const hand = applyMcuHandCopper(doc);
    if (hand.applied) {
      messages.push(
        `MCU手布: +${hand.tracksAdded}线 +${hand.viasAdded}孔 (簇×${hand.clusters})`);
    }
  }

  // —— Global：拥塞图 + 通道预留 + 布局反馈 ——
  tracePcb('AUTO_STAGE_BEGIN', 'global');
  const congMap = buildCongestionMap(doc, Math.max(80, grid * 16));
  const placeFb = buildPlacementCongestionFeedback(congMap, 8);
  tracePcb('AUTO_GLOBAL',
    `cong=${congMap.cols}x${congMap.rows} cell=${congMap.cell} layers=${congMap.densityByLayer.size} ` +
    `maxD=${placeFb.maxDensity.toFixed(0)} meanD=${placeFb.meanDensity.toFixed(1)}`);
  if (placeFb.suggestReplace) {
    messages.push(placeFb.summary);
    tracePcbWarn('AUTO_PLACE_CONGEST', placeFb.summary);
    const nudged = nudgePlacementFromCongestion(doc, congMap, placeFb.hotspots, grid);
    if (nudged.moved > 0) {
      messages.push(`布局微挪 ${nudged.moved} 个器件以降低拥塞`);
      // 微挪后重建拥塞
      const cong2 = buildCongestionMap(doc, Math.max(80, grid * 16));
      congMap.densityByLayer = cong2.densityByLayer;
      congMap.cols = cong2.cols;
      congMap.rows = cong2.rows;
      congMap.originX = cong2.originX;
      congMap.originY = cong2.originY;
      congMap.cell = cong2.cell;
    }
  }

  // 全局通道：为待布网预留 L 形 GCell，供详细布线偏好（按飞线，勿因孤儿过孔跳过）
  const openForChannel = openNetIdSet(doc);
  const channelSeeds: GlobalNetSeed[] = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const grp = groups[gi];
    if (netPadTotal(grp) < 2 || !netStillOpen(openForChannel, grp.netId)) {
      continue;
    }
    const pts = grp.points.length >= 2 ? grp.points : grp.connectorPoints;
    if (pts.length < 2) {
      continue;
    }
    const pair0 = layerPairForNet(doc, layer, grp.netName, grp.netId, congMap, pts[0], pts[pts.length - 1]);
    const seed: GlobalNetSeed = {
      netId: grp.netId,
      a: pts[0],
      b: pts[pts.length - 1],
      layerH: pair0.h,
      layerV: pair0.v
    };
    channelSeeds.push(seed);
  }
  const channelPlan0 = assignGlobalChannelsEdgeAware(congMap, channelSeeds, 2);
  const trackPitch = Math.max(width + clearanceForNet(doc, '') + 2, grid * 2);
  const channelPlan = assignTracksToGuides(congMap, channelPlan0, trackPitch);
  activeGlobalGuides = channelPlan.guides;
  tracePcb('AUTO_CHANNEL',
    `nets=${channelSeeds.length} reservedCells=${channelPlan.reservedTotal} guides=${channelPlan.guides.size} edge+TA=1`);

  // —— BGA 狗骨扇出（在详细布线前；仅真面阵，勿误伤 QFP） ——
  const bga = applyBgaDogboneFanout(doc);
  if (bga.viasAdded > 0) {
    accumulateTracksIntoCongestion(congMap, doc.tracks, Math.max(0, doc.tracks.length - bga.stubsAdded));
  }

  let netCount = 0;
  let failNets = 0;
  const tracksBefore = doc.tracks.length;
  const viasBefore = doc.vias.length;
  const routedSkip: Set<string> = new Set();
  // 扇出后重算飞线：有铜未全通的网必须进 detail，禁止 netAlreadyRouted 误跳过
  const openNets = openNetIdSet(doc);

  logRuleEngineOnce(doc);
  const agentOn = agent !== undefined && agent !== null ? 1 : 0;
  tracePcb('AUTO_ROUTE_BEGIN',
    `layer=${layer} Cu=${cuN} netGroups=${groups.length} grid=${grid} width=${width} ` +
    `agent=${agentOn} strategy=llm geometry=llmFirst+local ` +
    `pipeline=mcuHand|global|edgeGCell|TA|sbox|bga|llmGeo|detail|llmBrain|post|anneal steiner=1 congLayer=1 diffCoupled=1 ` +
    `ruleScope=1 room=1 polyRoom=1 gridless=1 viaCost=1 shorten=1 shoveDepth=4 serpentine=1 bgaFanout=1 spatial=1 returnVia=post dfm=1 verify=1 ` +
    `mazeBi=1 edgeBias=1 ` +
    `padAware=true async=true connectivitySort=true siblingDetour=1 trackBypass=1 ` +
    `xtalViaDetour=1 j1Escape=1 powerStitch=1 repairGate=1 starHub=1 ` +
    `candCap=${ASYNC_MAX_CANDIDATES} hopCand=${HOP_CAND_BUDGET}/${HOP_CAND_BUDGET_LONG} ` +
    `hopWall=${PAIR_HOP_WALL_MS}/${PAIR_HOP_WALL_LONG_MS} powerWall=${POWER_HOP_WALL_MS} ` +
    `powerCand=${POWER_HOP_CAND_BUDGET} powerMstCap=${POWER_DETAIL_MST_EDGE_CAP} ` +
    `uiYield=${UI_YIELD_MS} ` +
    `skipPadMaze=1 mazeCut=${MAZE_CUT_MIN_TRIES} mazeMax=${HOP_MAZE_MAX} ` +
    `chainVar=${ASYNC_MAX_CHAIN_VARIANTS} mstPad=${MST_ONLY_PAD_THRESHOLD} ` +
    `repair=${INCOMPLETE_REPAIR_ROUNDS}/${INCOMPLETE_REPAIR_STALL} ` +
    `xtalCorridor=${XTAL_CORRIDOR_PAD} orphanRollback=1`);

  // —— LLM 几何先行（对齐原理图：模型出路径，本地只校验/补洞） ——
  if (agent !== undefined && agent !== null && agent.routingSalvage !== undefined) {
    tracePcb('AUTO_STAGE_BEGIN', 'llmGeometryFirst');
    try {
      const n = await runGeometryAgentStage(
        doc, layer, grid, width, netPads, groups, copper, congMap, agent,
        'preDetail llm-first geometry');
      if (n > 0) {
        messages.push(`LLM几何先行: 重试/落线 ${n} 网`);
      }
      // 先行后刷新 open 集合，已通网跳过 detail
      const openAfter = openNetIdSet(doc);
      openNets.clear();
      openAfter.forEach((id: string) => {
        openNets.add(id);
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : `${e}`;
      tracePcbWarn('AUTO_STAGE_FAIL', `llmGeometryFirst ${msg}`);
    }
    tracePcb('AUTO_STAGE_END', 'llmGeometryFirst');
  }

  // —— Detail：差分对优先（双状态耦合 → 跟随 → 常规） ——
  const diffPlans = collectDiffPairPlans(doc);
  for (let di = 0; di < diffPlans.length; di++) {
    const plan = diffPlans[di];
    const gP = netPads.get(plan.netIdP);
    const gN = netPads.get(plan.netIdN);
    if (gP === undefined || gN === undefined) {
      continue;
    }
    if (netPadTotal(gP) < 2 && netPadTotal(gN) < 2) {
      continue;
    }
    if (!netStillOpen(openNets, plan.netIdP) && !netStillOpen(openNets, plan.netIdN)) {
      routedSkip.add(plan.netIdP);
      routedSkip.add(plan.netIdN);
      continue;
    }
    const sample = diffPairSamplePoints(gP.points, gN.points);
    const sa = sample !== null ? sample.a : null;
    const sb = sample !== null ? sample.b : null;
    const pair = layerPairForNet(doc, layer, gP.netName, gP.netId, congMap, sa, sb);
    const wP = widthForNet(doc, gP.netId, gP.netName, width, pair.h);
    const wN = widthForNet(doc, gN.netId, gN.netName, width, pair.h);
    const trkBeforePair = doc.tracks.length;
    const gap = plan.pair.gapMil > 0 ? plan.pair.gapMil : 8;
    const tol = plan.pair.lengthTolMil > 0 ? plan.pair.lengthTolMil : 5;

    // 双焊盘：优先双状态耦合 A*（同层 pair.h）
    let coupledOk = false;
    if (gP.points.length >= 2 && gN.points.length >= 2 &&
      netStillOpen(openNets, plan.netIdP) && netStillOpen(openNets, plan.netIdN)) {
      const coupled = routeDiffPairCoupled(
        doc, pair.h,
        gP.points[0], gP.points[gP.points.length - 1],
        gN.points[0], gN.points[gN.points.length - 1],
        plan.netIdP, plan.netIdN, wP, wN, gap, tol * 4, grid);
      if (coupled !== null) {
        const block: BlockBox = { reason: '' };
        const sameLayerPair: NetLayerPair = { h: pair.h, v: pair.h };
        const segsP = tryCommitPolyline(doc, coupled.pathP, sameLayerPair,
          plan.netIdP, plan.nameP, wP, block);
        const segsN = segsP >= 0
          ? tryCommitPolyline(doc, coupled.pathN, sameLayerPair,
            plan.netIdN, plan.nameN, wN, block)
          : -1;
        if (segsP >= 0 && segsN >= 0) {
          coupledOk = true;
          netCount += 2;
          routedSkip.add(plan.netIdP);
          routedSkip.add(plan.netIdN);
          tracePcb('AUTO_DIFF_COUPLED',
            `${plan.pair.name || plan.nameP} segsP=${segsP} segsN=${segsN} gap=${gap}`);
        }
      }
    }

    if (!coupledOk) {
      if (netStillOpen(openNets, plan.netIdP) && netPadTotal(gP) >= 2) {
        netCount++;
        const segs = await routeNetGroupAsync(doc, pair, gP, grid, wP);
        tracePcb('AUTO_DIFF_P',
          `${plan.pair.name || plan.nameP} segs=${segs} H=${pair.h} V=${pair.v} w=${wP}`);
        routedSkip.add(plan.netIdP);
      }
      if (netStillOpen(openNets, plan.netIdN) && netPadTotal(gN) >= 2) {
        netCount++;
        let segsN = 0;
        if (gP.points.length >= 2 && gN.points.length >= 2) {
          const follows = buildDiffFollowCandidates(
            gP.points[0], gP.points[gP.points.length - 1],
            gN.points[0], gN.points[gN.points.length - 1], gap);
          const block: BlockBox = { reason: '' };
          for (let fi = 0; fi < follows.length; fi++) {
            const n = tryCommitPolyline(doc, follows[fi], pair, gN.netId, gN.netName, wN, block);
            if (n >= 0) {
              segsN = n;
              tracePcb('AUTO_DIFF_FOLLOW',
                `${plan.pair.name || plan.nameN} segs=${n} gap=${gap}`);
              break;
            }
          }
        }
        if (segsN === 0) {
          segsN = await routeNetGroupAsync(doc, pair, gN, grid, wN);
          tracePcb('AUTO_DIFF_N',
            `${plan.pair.name || plan.nameN} segs=${segsN} H=${pair.h} V=${pair.v} w=${wN}`);
        }
        routedSkip.add(plan.netIdN);
      }
    }
    accumulateTracksIntoCongestion(congMap, doc.tracks, trkBeforePair);
    await yieldToUi();
  }

  tracePcb('AUTO_STAGE_END', 'global');

  // —— Detail：其余网络 ——
  tracePcb('AUTO_STAGE_BEGIN', 'detail');
  let midAssistUsed = 0;
  for (let gi = 0; gi < groups.length; gi++) {
    const grp = groups[gi];
    const total = netPadTotal(grp);
    if (total < 2) {
      tracePcbWarn('AUTO_SKIP',
        `${grp.netName || grp.netId} pads=${total} (dev=${grp.points.length},j1=${grp.connectorPoints.length}) — 焊盘不足`);
      continue;
    }
    if (routedSkip.has(grp.netId)) {
      tracePcb('AUTO_SKIP', `${grp.netName || grp.netId} — 差分已布`);
      continue;
    }
    if (!netStillOpen(openNets, grp.netId)) {
      tracePcb('AUTO_SKIP', `${grp.netName || grp.netId} — 已全连通`);
      continue;
    }
    netCount++;
    const sa = grp.points.length > 0 ? grp.points[0] :
      (grp.connectorPoints.length > 0 ? grp.connectorPoints[0] : null);
    const sb = grp.points.length > 1 ? grp.points[grp.points.length - 1] :
      (grp.connectorPoints.length > 0 ? grp.connectorPoints[grp.connectorPoints.length - 1] : sa);
    const pair = layerPairForNet(doc, layer, grp.netName, grp.netId, congMap, sa, sb);
    const w = widthForNet(doc, grp.netId, grp.netName, width, pair.h);
    const segsBefore = doc.tracks.length;
    let segs = await routeNetGroupAsync(doc, pair, grp, grid, w);
    // 单网失败：有 Agent → 跳过本地 midDetail（交给 LLM 大脑环）；无 Agent 才本地撕挡
    if (segs === 0 && total >= 2 && !isPowerNetName(grp.netName) &&
      (agent === undefined || agent === null) &&
      midAssistUsed < MID_DETAIL_ASSIST_MAX &&
      (isXtalNetName(grp.netName) || isNrstNetName(grp.netName) || isBusNetName(grp.netName) ||
        midDetailBlockerFromDigests(grp.netName || grp.netId).length > 0)) {
      midAssistUsed++;
      const rescued = await runMidDetailLocalAsync(
        doc, layer, grid, width, netPads, copper, congMap, grp);
      if (rescued > 0) {
        segs = rescued;
      }
    }
    if (segs === 0 && total >= 2) {
      failNets++;
    }
    accumulateTracksIntoCongestion(congMap, doc.tracks, segsBefore);
    if (segs > 0) {
      noteSignalPairUse(pair);
    }
    tracePcb('AUTO_NET',
      `${grp.netName || grp.netId} pads=${total} (dev=${grp.points.length},j1=${grp.connectorPoints.length}) ` +
      `segments=${segs} deltaTrk=${doc.tracks.length - segsBefore} H=${pair.h} V=${pair.v} w=${w}` +
      `${isDiffPairNet(doc, grp.netId) ? ' diff=1' : ''}`);
    await yieldToUi();
  }
  tracePcb('AUTO_STAGE_END', `detail midLocal=${midAssistUsed}`);

  // —— Post / Rip-up ——
  // Agent 在场：跳过本地 incomplete 补线（易 ORPHAN），改由 LLM 大脑环决策
  const hasLlmBrain = agent !== undefined && agent !== null;
  tracePcb('AUTO_STAGE_BEGIN', 'postRip');
  await finishRouteCleanupAsync(doc, 'AUTO');
  let incompleteFixed = 0;
  if (!hasLlmBrain) {
    incompleteFixed = await repairIncompleteNetsAsync(doc, layer, grid, width, netPads);
    if (incompleteFixed > 0) {
      await finishRouteCleanupAsync(doc, 'AUTO_GAP');
    }
  } else {
    tracePcb('AUTO_AGENT_SKIP', 'incompleteRepair — llmBrain owns gaps');
  }
  const powerStitched = await stitchPowerNetGapsAsync(doc, layer, grid, width, netPads);
  if (powerStitched > 0) {
    await finishRouteCleanupAsync(doc, 'AUTO_STITCH');
  }
  const repaired = await repairSameLayerCrossesAsync(doc, layer, grid, width);
  if (repaired > 0) {
    await finishRouteCleanupAsync(doc, 'AUTO_REPAIR');
  }

  const ratsLeft = buildRatsnest(doc);
  failNets = ratsLeft.length;
  if (failNets > 0) {
    const names: string[] = [];
    for (let i = 0; i < ratsLeft.length && i < 12; i++) {
      names.push(ratsLeft[i].netName || ratsLeft[i].netId);
    }
    tracePcbWarn('NET_UNROUTED',
      `count=${failNets} sample=${names.join(',')}${failNets > 12 ? '...' : ''}`);
  }
  tracePcb('AUTO_STAGE_END', `postRip failNets=${failNets}`);

  if (failNets > 0 && hasLlmBrain) {
    // LLM 大脑环：策略重规划 ↔ 几何硬修（本地只执行，不自决撕线）
    failNets = await runLlmBrainRepairLoop(
      doc, layer, grid, width, netPads, groups, copper, congMap, agent);
  } else if (failNets > 0 && !hasLlmBrain) {
    // 无 Agent：拆除阻挡异网后重布未通网
    const failIds: string[] = [];
    const pinA: Map<string, Point2D> = new Map();
    const pinB: Map<string, Point2D> = new Map();
    const seenFail: Record<string, boolean> = {};
    for (let i = 0; i < ratsLeft.length; i++) {
      const id = ratsLeft[i].netId;
      if (seenFail[id]) {
        continue;
      }
      seenFail[id] = true;
      failIds.push(id);
      pinA.set(id, { x: ratsLeft[i].a.x, y: ratsLeft[i].a.y });
      pinB.set(id, { x: ratsLeft[i].b.x, y: ratsLeft[i].b.y });
    }
    const ripCap = Math.min(8, Math.max(3, failIds.length));
    const rippedNets: string[] = ripBlockingTracksForNets(
      doc, failIds.slice(0, ripCap), pinA, pinB, 40);
    let reRouted = 0;
    if (rippedNets.length > 0) {
      const retrySet: Record<string, boolean> = {};
      const retryIds: string[] = [];
      for (let i = 0; i < failIds.length; i++) {
        if (!retrySet[failIds[i]]) {
          retrySet[failIds[i]] = true;
          retryIds.push(failIds[i]);
        }
      }
      for (let i = 0; i < rippedNets.length; i++) {
        if (!retrySet[rippedNets[i]]) {
          retrySet[rippedNets[i]] = true;
          retryIds.push(rippedNets[i]);
        }
      }
      for (let i = 0; i < retryIds.length; i++) {
        const grp = netPads.get(retryIds[i]);
        if (grp === undefined || netPadTotal(grp) < 2) {
          continue;
        }
        clearNetCopper(doc, retryIds[i]);
        const sa = grp.points.length > 0 ? grp.points[0] :
          (grp.connectorPoints.length > 0 ? grp.connectorPoints[0] : null);
        const sb = grp.points.length > 1 ? grp.points[grp.points.length - 1] :
          (grp.connectorPoints.length > 0
            ? grp.connectorPoints[grp.connectorPoints.length - 1] : sa);
        const pair = layerPairForNet(doc, layer, grp.netName, grp.netId, congMap, sa, sb);
        const w = widthForNet(doc, grp.netId, grp.netName, width, pair.h);
        const segs = await routeNetGroupAsync(doc, pair, grp, grid, w);
        if (segs > 0) {
          reRouted++;
        }
      }
      await finishRouteCleanupAsync(doc, 'AUTO_CONG');
      failNets = buildRatsnest(doc).length;
      tracePcb('AUTO_CONG_RIP',
        `rippedNets=${rippedNets.length} reRouted=${reRouted} failLeft=${failNets}`);
    }
  }

  // 布通后再补回流过孔
  const retAdded = addDeferredReturnVias(doc, grid, RETURN_VIA_POST_CAP);
  if (retAdded > 0) {
    await yieldToUi();
  }
  const viaCount = Math.max(0, doc.vias.length - viasBefore);

  // —— Verify + 差分等长（蛇形优先）+ 指标 ——
  let tuned = tuneDiffPairSerpentine(doc);
  if (tuned === 0) {
    tuned = tuneDiffPairLengths(doc);
  } else {
    const more = tuneDiffPairLengths(doc);
    tuned += more;
  }
  if (tuned > 0) {
    await finishRouteCleanupAsync(doc, 'AUTO_TUNE');
  }
  // 阶段四：酸陷阱修 + 模拟退火缩线长
  const acidFixed = fixAcidTrapCorners(doc);
  if (acidFixed > 0) {
    await yieldToUi();
  }
  const anneal = annealRouteOptimize(doc, 100, netCount * 17 + doc.tracks.length);
  if (anneal.accepted > 0) {
    let msg = `退火优化线长 ${anneal.improvedPct.toFixed(1)}%`;
    if (anneal.viasRemoved > 0) {
      msg += `，减过孔 ${anneal.viasRemoved}`;
    }
    messages.push(msg);
    await finishRouteCleanupAsync(doc, 'AUTO_ANNEAL');
  }
  const trackCount = Math.max(0, doc.tracks.length - tracksBefore);
  let metrics = computeAutoRouteMetrics(doc, netCount, trackCount, viaCount);
  const congFinal = buildCongestionMap(doc, Math.max(80, grid * 16));
  const placeFinal = buildPlacementCongestionFeedback(congFinal, 6);
  if (placeFinal.suggestReplace) {
    messages.push(`布线后${placeFinal.summary}`);
  }
  const diffReports = reportDiffPairLengths(doc);
  for (let i = 0; i < diffReports.length; i++) {
    const r = diffReports[i];
    const tag = r.withinTol ? 'DIFF_LEN_OK' : 'DIFF_LEN_WARN';
    const line =
      `${r.pairName} lenP=${r.lenP.toFixed(1)} lenN=${r.lenN.toFixed(1)} ` +
      `delta=${r.delta.toFixed(1)} tol=${r.tol}`;
    if (r.withinTol) {
      tracePcb(tag, line);
    } else {
      tracePcbWarn(tag, line);
    }
  }
  tracePcb('AUTO_METRICS',
    `completion=${(metrics.completionRate * 100).toFixed(1)}% ` +
    `wire=${metrics.totalWireLength.toFixed(0)} via=${metrics.viaCount} ` +
    `trk=${metrics.trackCount} unrouted=${metrics.unroutedNets} ` +
    `drcErr=${metrics.drcErrorCount} (clr=${metrics.clearanceErrors} short=${metrics.shortErrors} ` +
    `dfm=${metrics.dfmErrors} si=${metrics.siWarnings})`);

  // Critic 由 Orchestrator 调度；llmBrain 已含 salvage，此处仅终局再补一刀
  tracePcb('AUTO_STAGE_BEGIN', 'routingSalvage');
  if (agent !== undefined && agent !== null) {
    const ratsLeftN = buildRatsnest(doc).length;
    failNets = ratsLeftN;
    if (ratsLeftN > 0) {
      try {
        await runGeometryAgentStage(doc, layer, grid, width, netPads, groups, copper,
          congFinal, agent,
          `finalSalvage completion=${(metrics.completionRate * 100).toFixed(1)}% unrouted=${ratsLeftN}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : `${e}`;
        tracePcbWarn('AUTO_STAGE_FAIL', `routingSalvage ${msg}`);
      }
      failNets = buildRatsnest(doc).length;
    } else {
      tracePcb('AUTO_AGENT_SKIP', 'routingSalvage rats=0');
    }
    if (failNets !== metrics.unroutedNets) {
      const trackCount2 = Math.max(0, doc.tracks.length - tracksBefore);
      const viaCount2 = Math.max(0, doc.vias.length - viasBefore);
      metrics = computeAutoRouteMetrics(doc, netCount, trackCount2, viaCount2);
    }
  } else {
    tracePcb('AUTO_AGENT_SKIP', 'routingSalvage no hooks');
  }
  tracePcb('AUTO_STAGE_END', 'routingSalvage');

  // 模板库硬门禁：每一铜层必须有真实 track（zone 不算）；缺层则补短段（过 clearance 才写入）
  tracePcb('AUTO_STAGE_BEGIN', 'ensureAllCopper');
  try {
    const netPlan = buildLocalNetPlan(doc);
    const policy = buildLocalRoutePolicy(doc, netPlan);
    if (activeAgentLayerRoles !== null) {
      const rk = Object.keys(activeAgentLayerRoles);
      for (let i = 0; i < rk.length; i++) {
        policy.layerRoles[rk[i]] = activeAgentLayerRoles[rk[i]];
      }
    }
    const missingCu = ensureAllCopperUsed(doc, doc.tracks, false);
    if (missingCu.length > 0) {
      const routedIds: string[] = [];
      const seenNet: Record<string, boolean> = {};
      for (let ti = 0; ti < doc.tracks.length; ti++) {
        const nid = doc.tracks[ti].netId;
        if (nid.length > 0 && !seenNet[nid]) {
          seenNet[nid] = true;
          routedIds.push(nid);
        }
      }
      const missLabels: string[] = [];
      for (let mi = 0; mi < missingCu.length; mi++) {
        missLabels.push(missingCu[mi] as string);
      }
      fillUnusedCopperLayers(doc, policy, netPlan, doc.tracks, doc.vias, routedIds, missingCu);
      const still = ensureAllCopperUsed(doc, doc.tracks, false);
      const useDesc = activeSignalLayerPairs.map((p: NetLayerPair, i: number): string =>
        `${p.h}/${p.v}:${signalPairUseCount[i] ?? 0}`).join(',');
      tracePcb('AUTO_CU_FILL',
        `wasMissing=${missLabels.join(',')} still=${still.length} pairUse=${useDesc}`);
      if (still.length > 0) {
        const left: string[] = [];
        for (let si = 0; si < still.length; si++) {
          left.push(still[si] as string);
        }
        tracePcbWarn('AUTO_CU_FILL', `unused_left=${left.join(',')}`);
      }
    } else {
      const useDesc = activeSignalLayerPairs.map((p: NetLayerPair, i: number): string =>
        `${p.h}/${p.v}:${signalPairUseCount[i] ?? 0}`).join(',');
      tracePcb('AUTO_CU_FILL', `all_copper_used pairUse=${useDesc}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : `${e}`;
    tracePcbWarn('AUTO_CU_FILL', msg);
  }
  tracePcb('AUTO_STAGE_END', 'ensureAllCopper');

  const trackCountFinal = Math.max(0, doc.tracks.length - tracksBefore);
  const viaCountFinal = Math.max(0, doc.vias.length - viasBefore);

  if (netCount === 0) {
    messages.push('没有需要自动布线的网络');
  } else {
    const viaHint = viaCountFinal > 0 ? `，${viaCountFinal} 过孔` : '';
    const failHint = failNets > 0 ? `，${failNets} 网未连通` : '';
    const repairHint = (repaired + incompleteFixed + powerStitched) > 0
      ? `，重试 ${repaired + incompleteFixed + powerStitched}` : '';
    const pct = (metrics.completionRate * 100).toFixed(0);
    const drcHint = metrics.drcErrorCount > 0 ? `，DRC ${metrics.drcErrorCount}` : '';
    messages.push(
      `已自动布线 ${netCount} 个网络，${trackCountFinal} 段（布通 ${pct}%` +
      `，Cu=${cuN}${viaHint}${failHint}${repairHint}${drcHint}，避焊盘）`);
  }
  if (failNets > 0) {
    tracePcbWarn('AUTO_ROUTE_INCOMPLETE', `failNets=${failNets}/${netCount}`);
  }
  const leftCross = await collectMidspanCrossNetIdsAsync(doc);
  if (leftCross.length > 0) {
    tracePcbWarn('AUTO_CROSS_LEFT', `nets=${leftCross.length}`);
  }
  doc.metadata.modifiedAt = new Date().toISOString();
  activeGlobalGuides = null;
  const pctDone = (metrics.completionRate * 100).toFixed(1);
  const ratsDone = buildRatsnest(doc).length;
  tracePcb('AUTO_ROUTE_DONE',
    `completion=${pctDone}% nets=${netCount} tracks=${trackCountFinal} vias=${viaCountFinal} ` +
    `rats=${ratsDone} failNets=${failNets} midLocal=${midAssistUsed} Cu=${cuN}`);
  const result: AutoRouteResult = {
    trackCount: trackCountFinal,
    netCount,
    messages,
    completionRate: metrics.completionRate,
    totalWireLength: metrics.totalWireLength,
    viaCount: metrics.viaCount,
    drcErrorCount: metrics.drcErrorCount,
    metrics
  };
  return result;
}
