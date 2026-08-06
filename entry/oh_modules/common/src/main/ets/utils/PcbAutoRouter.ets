/**
 * PCB 自动布线 — 正交多策略链式连接（按网络）
 * 铜层≥4 时：水平段与垂直段分到不同铜层，拐角打过孔，减少同层 H∩V 交叉。
 * 每段提交前经 clearance 校验（含中段穿越），斜边强制拆曼哈顿；结束后交叉重布。
 */
import {
  PcbDocument, PcbLayerId, PcbTrack, PcbVia, PcbViaKind, copperLayersFromStack
} from '../types/PcbTypes';
import { Point2D } from '../types/CommonTypes';
import { IdUtil } from './IdUtil';
import { padWorldPosition } from './PcbZoneUtil';
import {
  orderPointsNearestNeighbor, snapTrackEndpointsToPads, pruneZeroLengthTracks,
  mergeColinearTracks, pruneShortTracks
} from './PcbTrackBindUtil';
import { ensureBoardAccessories, clearCopperForNets, AccessoryNetHint } from './PcbBoardAccessories';
import {
  pathClearBlockReason, viaClearAt, clearanceForNet, footprintSelectionAabb
} from './pcb_route/PcbClearanceOracle';
import { tracePcb, tracePcbWarn } from './PcbTraceLog';
import { WireConflictGeometry } from './WireConflictGeometry';
import { WarRouteOrder, WarOrderPin } from './WarRouteOrder';
import { buildRatsnest } from './PcbNetUtil';

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

/** 单次同步切片软上限（ms）；超过则让出，避免 THREAD_BLOCK_3S/6S */
const UI_SLICE_MS = 12;
/** 异步路径每对端点最多尝试的候选折线数（已按长度排序） */
const ASYNC_MAX_CANDIDATES = 120;

/** 让出主线程，避免 APP_INPUT_BLOCK（自动布线为 CPU 密集同步算法） */
function yieldToUi(): Promise<void> {
  return new Promise<void>((resolve: () => void) => {
    // 1ms：比 0 更稳地排空 MMI/vSync，避免 uvLoopTask 连续吃满主线程
    setTimeout((): void => {
      resolve();
    }, 1);
  });
}

async function yieldIfSliceOver(sliceStart: number): Promise<number> {
  if (Date.now() - sliceStart >= UI_SLICE_MS) {
    await yieldToUi();
    return Date.now();
  }
  return sliceStart;
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

function addThroughVia(doc: PcbDocument, pos: Point2D, netId: string, netName: string): void {
  const copper = copperLayersFromStack(doc.layerStack);
  const layers = copper.length > 0 ? copper.slice() : [PcbLayerId.F_CU, PcbLayerId.B_CU];
  const rules = doc.metadata.designRules;
  const via: PcbVia = {
    id: IdUtil.generate('via'),
    position: { x: pos.x, y: pos.y },
    drill: rules.minViaDrill,
    diameter: rules.minViaDrill + 8,
    netId,
    netName,
    layers,
    kind: PcbViaKind.THROUGH
  };
  doc.vias.push(via);
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

/**
 * 按铜层数选 H/V 层：
 * - 地网：底层
 * - 2 层：信号/电源顶层
 * - ≥4 层：水平顶；电源垂直走靠后内层(In2)，信号分散 In1/In2，拐角过孔
 */
function layerPairForNet(doc: PcbDocument, preferred: PcbLayerId, netName: string,
  netId: string = ''): NetLayerPair {
  const copper = copperLayersFromStack(doc.layerStack);
  const top = copper.length > 0 ? copper[0] : preferred;
  const bot = copper.length > 0 ? copper[copper.length - 1] : PcbLayerId.B_CU;
  if (isGndNetName(netName)) {
    return { h: bot, v: bot };
  }
  if (copper.length >= 4) {
    const innerCount = copper.length - 2;
    if (isPowerNetName(netName)) {
      // VCC 等：垂直用最后一层内层，避开信号 In1 拥塞
      return { h: top, v: copper[copper.length - 2] };
    }
    // 信号：在内层间散列，减轻同层垂直丛林
    let h = 0;
    const key = netId.length > 0 ? netId : netName;
    for (let i = 0; i < key.length; i++) {
      h = ((h * 31) + key.charCodeAt(i)) | 0;
    }
    const vLayer = copper[1 + (Math.abs(h) % Math.max(innerCount, 1))];
    return { h: top, v: vLayer };
  }
  return { h: top, v: top };
}

function widthForNet(defaultWidth: number, netName: string): number {
  if (isPowerNetName(netName)) {
    return Math.max(defaultWidth * 2, 20);
  }
  return defaultWidth;
}

function segmentLayer(pair: NetLayerPair, a: Point2D, b: Point2D): PcbLayerId {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  if (dx >= dy) {
    return pair.h;
  }
  return pair.v;
}

function collectJogOffsets(grid: number, width: number): number[] {
  const base = Math.max(grid, 5);
  const clearPad = Math.max(base * 8, width * 4 + 40);
  const mults = [2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64];
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

/** 收集异网/浮空焊盘障碍 + 封装选中区中心禁入（逼通道绕器件外走） */
function collectPadObstacles(doc: PcbDocument, netId: string): PadObstacle[] {
  const out: PadObstacle[] = [];
  for (const fp of doc.footprints) {
    for (const pad of fp.pads) {
      const pNet = pad.netId ?? '';
      if (pNet.length > 0 && pNet === netId) {
        continue;
      }
      const pos = padWorldPosition(fp, pad);
      const padR = Math.max(pad.size.x, pad.size.y) * 0.5;
      out.push({ x: pos.x, y: pos.y, r: padR });
    }
    // 顶层封装：选中区中心圆障碍，留边沿走廊给焊盘出线；内层垂直可从下方穿过
    if (fp.layer === PcbLayerId.B_CU) {
      continue;
    }
    const box = footprintSelectionAabb(fp);
    const hw = (box.x2 - box.x1) * 0.5;
    const hh = (box.y2 - box.y1) * 0.5;
    const bodyR = Math.min(hw, hh) * 0.78;
    if (bodyR > 12) {
      out.push({
        x: (box.x1 + box.x2) * 0.5,
        y: (box.y1 + box.y2) * 0.5,
        r: bodyR
      });
    }
  }
  return out;
}

function padNeed(doc: PcbDocument, netId: string, width: number): number {
  return clearanceForNet(doc, netId) + width / 2;
}

/** 竖直通道 x=cx、y∈[y0,y1] 是否被焊盘挡住 */
function verticalChannelBlocked(cx: number, y0: number, y1: number,
  obs: PadObstacle[], need: number): boolean {
  const a: Point2D = { x: cx, y: y0 };
  const b: Point2D = { x: cx, y: y1 };
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    if (distPointSegLocal({ x: o.x, y: o.y }, a, b) < need + o.r) {
      return true;
    }
  }
  return false;
}

/** 水平通道 y=cy、x∈[x0,x1] 是否被焊盘挡住 */
function horizontalChannelBlocked(cy: number, x0: number, x1: number,
  obs: PadObstacle[], need: number): boolean {
  const a: Point2D = { x: x0, y: cy };
  const b: Point2D = { x: x1, y: cy };
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    if (distPointSegLocal({ x: o.x, y: o.y }, a, b) < need + o.r) {
      return true;
    }
  }
  return false;
}

/**
 * 基于焊盘障碍推垂直/水平畅通坐标：障碍边缘外推 + 从 prefer 向外扫。
 */
function findClearChannels(prefer: number, lo: number, hi: number, isVertical: boolean,
  obs: PadObstacle[], need: number, grid: number, scanExtra: number): number[] {
  const out: number[] = [];
  const seen: Set<number> = new Set();
  const push = (v: number): void => {
    const s = snap(v, grid);
    if (seen.has(s)) {
      return;
    }
    const blocked = isVertical
      ? verticalChannelBlocked(s, lo, hi, obs, need)
      : horizontalChannelBlocked(s, lo, hi, obs, need);
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

/** 多策略正交折线：焊盘通道优先 + L/jog/escape/板边 */
function buildCandidatePolylines(doc: PcbDocument, a: Point2D, b: Point2D,
  netId: string, grid: number, width: number, preferHFirst: boolean): Point2D[][] {
  const need = padNeed(doc, netId, width);
  const obs = collectPadObstacles(doc, netId);
  const yLo = Math.min(a.y, b.y);
  const yHi = Math.max(a.y, b.y);
  const xLo = Math.min(a.x, b.x);
  const xHi = Math.max(a.x, b.x);
  const scan = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), 400) + 200;

  const clearXs = findClearChannels(snap(a.x, grid), yLo, yHi, true, obs, need, grid, scan);
  // 也从 b.x 扫
  const clearXsB = findClearChannels(snap(b.x, grid), yLo, yHi, true, obs, need, grid, scan);
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
  const clearYs = findClearChannels(snap(a.y, grid), xLo, xHi, false, obs, need, grid, scan);
  const clearYsB = findClearChannels(snap(b.y, grid), xLo, xHi, false, obs, need, grid, scan);
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
  const polylines: Point2D[][] = [];

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
  const xLimit = Math.min(clearXs.length, 10);
  for (let i = 0; i < xLimit; i++) {
    const cx = clearXs[i];
    polylines.push([
      a,
      { x: cx, y: snap(a.y, grid) },
      { x: cx, y: snap(b.y, grid) },
      b
    ]);
  }
  const yLimit = Math.min(clearYs.length, 10);
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
  const eaLimit = Math.min(escapesA.length, 6);
  const ebLimit = Math.min(escapesB.length, 4);
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
  const pool = filtered.length > 0 ? filtered : polylines;
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
      s += Math.max(0, path.length - 3) * 80;
      return s;
    };
    return score(p) - score(q);
  });
  return pool;
}

/**
 * 校验折线各段/换层过孔是否与异网铜冲突；通过则写入 doc。
 * @returns 写入的走线段数；失败返回 -1
 */
function tryCommitOrthoPath(doc: PcbDocument, ptsIn: Point2D[], pair: NetLayerPair,
  netId: string, netName: string, width: number, lastBlock: BlockBox): number {
  const pts = compressPathPoints(ptsIn);
  if (pts.length < 2) {
    return -1;
  }

  const grid: number = doc.metadata.gridSize ?? 5;
  const viaDia = viaDiameter(doc);
  const copper = copperLayersFromStack(doc.layerStack);
  const viaLayers = copper.length > 0 ? copper.slice() : [PcbLayerId.F_CU, PcbLayerId.B_CU];

  interface PendingSeg {
    layer: PcbLayerId;
    a: Point2D;
    b: Point2D;
  }
  interface PendingVia {
    pos: Point2D;
  }
  const pendingSegs: PendingSeg[] = [];
  const pendingVias: PendingVia[] = [];

  let prevLayer = segmentLayer(pair, pts[0], pts[1]);
  for (let j = 0; j < pts.length - 1; j++) {
    const a = pts[j];
    const b = pts[j + 1];
    // 防御：仍有斜边则拒绝（应在 expand 后消失）
    if (Math.abs(a.x - b.x) >= 0.5 && Math.abs(a.y - b.y) >= 0.5) {
      lastBlock.reason = `non_ortho_seg @(${Math.round(a.x)},${Math.round(a.y)})-(${Math.round(b.x)},${Math.round(b.y)})`;
      return -1;
    }
    let segA: Point2D = { x: a.x, y: a.y };
    const ly = segmentLayer(pair, segA, b);
    if (ly !== prevLayer) {
      let viaPos: Point2D = { x: segA.x, y: segA.y };
      let viaOk = viaClearAt(doc, viaPos, netId, viaDia, viaLayers, doc.tracks, doc.vias);
      // 拐角落在异网焊盘上：沿网格微移过孔，并补一段 prevLayer 引出
      if (!viaOk) {
        const nudges: number[] = [
          grid * 3, 0 - grid * 3, grid * 6, 0 - grid * 6, grid * 10, 0 - grid * 10
        ];
        for (let ni = 0; ni < nudges.length && !viaOk; ni++) {
          const nOff: number = nudges[ni];
          const candidates: Point2D[] = [
            { x: snap(segA.x + nOff, grid), y: segA.y },
            { x: segA.x, y: snap(segA.y + nOff, grid) }
          ];
          for (let ci = 0; ci < candidates.length; ci++) {
            const vp = candidates[ci];
            if (dist(segA, vp) < 0.5) {
              continue;
            }
            if (pathClearBlockReason(doc, prevLayer, segA, vp, netId, width,
              doc.tracks, doc.vias) !== null) {
              continue;
            }
            if (!viaClearAt(doc, vp, netId, viaDia, viaLayers, doc.tracks, doc.vias)) {
              continue;
            }
            let selfHit = false;
            for (let vi = 0; vi < pendingVias.length; vi++) {
              if (dist(pendingVias[vi].pos, vp) < viaDia) {
                selfHit = true;
                break;
              }
            }
            if (selfHit) {
              continue;
            }
            pendingSegs.push({ layer: prevLayer, a: segA, b: vp });
            viaPos = vp;
            segA = vp;
            viaOk = true;
            break;
          }
        }
      }
      if (!viaOk) {
        lastBlock.reason =
          `via_pad_block @(${Math.round(a.x)},${Math.round(a.y)}) net=${netName || netId}`;
        return -1;
      }
      for (let vi = 0; vi < pendingVias.length; vi++) {
        const pv = pendingVias[vi];
        if (dist(pv.pos, viaPos) < viaDia) {
          lastBlock.reason = `via_self_block @(${Math.round(viaPos.x)},${Math.round(viaPos.y)})`;
          return -1;
        }
      }
      pendingVias.push({ pos: viaPos });
      prevLayer = ly;
    }
    const block = pathClearBlockReason(doc, ly, segA, b, netId, width, doc.tracks, doc.vias);
    if (block !== null) {
      lastBlock.reason = block;
      return -1;
    }
    pendingSegs.push({ layer: ly, a: segA, b });
  }

  for (let i = 0; i < pendingVias.length; i++) {
    addThroughVia(doc, pendingVias[i].pos, netId, netName);
  }
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
  netId: string, netName: string, width: number, lastBlock: BlockBox): number {
  if (path.length < 2) {
    return -1;
  }
  const variants: Point2D[][] = [
    expandPathToManhattan(path, true),
    expandPathToManhattan(path, false)
  ];
  let bestReason = '';
  for (let vi = 0; vi < variants.length; vi++) {
    const segs = tryCommitOrthoPath(doc, variants[vi], pair, netId, netName, width, lastBlock);
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

/** 在 a→b 上尝试多策略正交路径，避开焊盘/异网铜 */
function routePairClearanceAware(doc: PcbDocument, pair: NetLayerPair,
  a: Point2D, b: Point2D, netId: string, netName: string,
  grid: number, width: number): number {
  if (dist(a, b) < 0.5) {
    return 0;
  }
  const preferHFirst = pair.h !== pair.v;
  const candidates = buildCandidatePolylines(doc, a, b, netId, grid, width, preferHFirst);
  const lastBlock: BlockBox = { reason: '' };
  let padHits = 0;
  let otherHits = 0;
  for (let i = 0; i < candidates.length; i++) {
    const segs = tryCommitPolyline(doc, candidates[i], pair, netId, netName, width, lastBlock);
    if (segs >= 0) {
      if (i > 0) {
        tracePcb('AUTO_PAIR_ALT',
          `${netName || netId} tried=${i + 1}/${candidates.length} segs=${segs} ` +
          `len=${pathLength(candidates[i]).toFixed(0)}`);
      }
      return segs;
    }
    if (lastBlock.reason.indexOf('pad_block') >= 0 ||
      lastBlock.reason.indexOf('via_pad_block') >= 0) {
      padHits++;
    } else {
      otherHits++;
    }
  }
  tracePcbWarn('AUTO_PAIR_FAIL',
    `${netName || netId} a=(${Math.round(a.x)},${Math.round(a.y)}) ` +
    `b=(${Math.round(b.x)},${Math.round(b.y)}) candidates=${candidates.length} ` +
    `padHits=${padHits} otherHits=${otherHits} last=${lastBlock.reason || '?'}`);
  return 0;
}

/** 异步候选搜索：每条候选后按 12ms 切片让出，避免单次 uvLoopTask 堵死主线程 */
async function routePairClearanceAwareAsync(doc: PcbDocument, pair: NetLayerPair,
  a: Point2D, b: Point2D, netId: string, netName: string,
  grid: number, width: number): Promise<number> {
  if (dist(a, b) < 0.5) {
    return 0;
  }
  await yieldToUi();
  const preferHFirst = pair.h !== pair.v;
  const allCandidates = buildCandidatePolylines(doc, a, b, netId, grid, width, preferHFirst);
  const limit = Math.min(allCandidates.length, ASYNC_MAX_CANDIDATES);
  const candidates = allCandidates.length > limit
    ? allCandidates.slice(0, limit)
    : allCandidates;
  await yieldToUi();
  const lastBlock: BlockBox = { reason: '' };
  let padHits = 0;
  let otherHits = 0;
  let sliceStart = Date.now();
  for (let i = 0; i < candidates.length; i++) {
    sliceStart = await yieldIfSliceOver(sliceStart);
    const segs = tryCommitPolyline(doc, candidates[i], pair, netId, netName, width, lastBlock);
    // 无论耗时长短都让出：单次 clearance 在焊盘/走线多时可达数百 ms
    await yieldToUi();
    sliceStart = Date.now();
    if (segs >= 0) {
      if (i > 0) {
        tracePcb('AUTO_PAIR_ALT',
          `${netName || netId} tried=${i + 1}/${candidates.length}` +
          (allCandidates.length > candidates.length
            ? `(of${allCandidates.length})` : '') +
          ` segs=${segs} len=${pathLength(candidates[i]).toFixed(0)}`);
      }
      return segs;
    }
    if (lastBlock.reason.indexOf('pad_block') >= 0 ||
      lastBlock.reason.indexOf('via_pad_block') >= 0) {
      padHits++;
    } else {
      otherHits++;
    }
  }
  tracePcbWarn('AUTO_PAIR_FAIL',
    `${netName || netId} a=(${Math.round(a.x)},${Math.round(a.y)}) ` +
    `b=(${Math.round(b.x)},${Math.round(b.y)}) candidates=${candidates.length}` +
    (allCandidates.length > candidates.length ? `/${allCandidates.length}` : '') +
    ` padHits=${padHits} otherHits=${otherHits} last=${lastBlock.reason || '?'}`);
  return 0;
}

function routeLChain(doc: PcbDocument, pair: NetLayerPair, points: Point2D[],
  netId: string, netName: string, grid: number, width: number): number {
  if (points.length < 2) {
    return 0;
  }
  const ordered = orderPointsNearestNeighbor(points);
  let segs = 0;
  let failHops = 0;
  for (let i = 0; i < ordered.length - 1; i++) {
    const n = routePairClearanceAware(doc, pair, ordered[i], ordered[i + 1],
      netId, netName, grid, width);
    if (n === 0) {
      failHops++;
    }
    segs += n;
  }
  if (failHops > 0) {
    tracePcbWarn('AUTO_CHAIN_GAP',
      `${netName || netId} failHops=${failHops}/${ordered.length - 1} segs=${segs}`);
  }
  return segs;
}

async function routeLChainAsync(doc: PcbDocument, pair: NetLayerPair, points: Point2D[],
  netId: string, netName: string, grid: number, width: number): Promise<number> {
  if (points.length < 2) {
    return 0;
  }
  const ordered = orderPointsNearestNeighbor(points);
  let segs = 0;
  let failHops = 0;
  for (let i = 0; i < ordered.length - 1; i++) {
    const n = await routePairClearanceAwareAsync(doc, pair, ordered[i], ordered[i + 1],
      netId, netName, grid, width);
    if (n === 0) {
      failHops++;
    }
    segs += n;
    await yieldToUi();
  }
  if (failHops > 0) {
    tracePcbWarn('AUTO_CHAIN_GAP',
      `${netName || netId} failHops=${failHops}/${ordered.length - 1} segs=${segs}`);
  }
  return segs;
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

function routeNetGroup(doc: PcbDocument, pair: NetLayerPair, grp: NetPadGroup,
  grid: number, width: number): number {
  const core = grp.points;
  const connectors = grp.connectorPoints;
  let segs = 0;

  if (core.length >= 2) {
    segs += routeLChain(doc, pair, core, grp.netId, grp.netName, grid, width);
  }

  if (connectors.length > 0) {
    const hubs: Point2D[] = [];
    for (const p of core) {
      hubs.push(p);
    }
    if (hubs.length === 0) {
      segs += routeLChain(doc, pair, connectors, grp.netId, grp.netName, grid, width);
    } else {
      for (const c of connectors) {
        const hub = nearestPoint(c, hubs);
        if (!hub) {
          continue;
        }
        segs += routePairClearanceAware(doc, pair, hub, c, grp.netId, grp.netName, grid, width);
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

  if (core.length >= 2) {
    segs += await routeLChainAsync(doc, pair, core, grp.netId, grp.netName, grid, width);
  }

  if (connectors.length > 0) {
    const hubs: Point2D[] = [];
    for (const p of core) {
      hubs.push(p);
    }
    if (hubs.length === 0) {
      segs += await routeLChainAsync(doc, pair, connectors, grp.netId, grp.netName, grid, width);
    } else {
      for (let ci = 0; ci < connectors.length; ci++) {
        const c = connectors[ci];
        const hub = nearestPoint(c, hubs);
        if (!hub) {
          continue;
        }
        segs += await routePairClearanceAwareAsync(doc, pair, hub, c,
          grp.netId, grp.netName, grid, width);
        await yieldToUi();
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

/** 短网优先：按焊盘近邻链最大边长升序；电源网垫后 */
function sortNetGroupsByLocality(groups: NetPadGroup[]): NetPadGroup[] {
  const edges: number[] = [];
  for (let i = 0; i < groups.length; i++) {
    const grp = groups[i];
    if (isPowerNetName(grp.netName)) {
      edges.push(1e9 + i);
      continue;
    }
    const pins: WarOrderPin[] = [];
    for (let pi = 0; pi < grp.points.length; pi++) {
      const pin: WarOrderPin = { key: `p${pi}`, pt: grp.points[pi] };
      pins.push(pin);
    }
    for (let ci = 0; ci < grp.connectorPoints.length; ci++) {
      const pin: WarOrderPin = { key: `c${ci}`, pt: grp.connectorPoints[ci] };
      pins.push(pin);
    }
    edges.push(WarRouteOrder.maxNnEdgeLength(pins));
  }
  const order = WarRouteOrder.sortNetIndicesByLocality(edges);
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

/** 收集落在焊盘包围盒内的异网过孔所属 netId（非电源优先） */
function foreignViaNetsInPadBox(doc: PcbDocument, grp: NetPadGroup): string[] {
  const box = padBBox(grp, 80);
  const counts: Map<string, number> = new Map();
  for (const v of doc.vias) {
    if (!v.netId || v.netId === grp.netId) {
      continue;
    }
    if (v.position.x < box.minX || v.position.x > box.maxX ||
      v.position.y < box.minY || v.position.y > box.maxY) {
      continue;
    }
    let nm = '';
    for (const n of doc.nets) {
      if (n.id === v.netId) {
        nm = n.name || '';
        break;
      }
    }
    if (isPowerNetName(nm)) {
      continue;
    }
    counts.set(v.netId, (counts.get(v.netId) ?? 0) + 1);
  }
  const ids: string[] = [];
  counts.forEach((_c: number, id: string) => {
    ids.push(id);
  });
  ids.sort((a: string, b: string): number => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  return ids;
}

/**
 * 未连通网局部 rip-up 重试：清自身铜 → 清阻挡异网过孔所属网 → 先布目标网再重布被清网。
 */
async function repairIncompleteNetsAsync(doc: PcbDocument, preferredLayer: PcbLayerId,
  grid: number, defaultWidth: number, netPads: Map<string, NetPadGroup>): Promise<number> {
  let repaired = 0;
  for (let round = 0; round < 6; round++) {
    await yieldToUi();
    const rats = buildRatsnest(doc);
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
        return WarRouteOrder.maxNnEdgeLength(pins);
      };
      return score(a) - score(b);
    });
    const victim = incomplete[0];
    const grp = netPads.get(victim);
    if (grp === undefined || netPadTotal(grp) < 2) {
      break;
    }
    const blockers = foreignViaNetsInPadBox(doc, grp);
    const ripIds: string[] = [victim];
    if (blockers.length > 0) {
      ripIds.push(blockers[0]);
    }
    let removed = 0;
    for (let ri = 0; ri < ripIds.length; ri++) {
      removed += clearNetCopper(doc, ripIds[ri]);
    }
    // 未连通目标网先布（占住空档），再补回被 rip 的阻挡网
    let segs = 0;
    for (let oi = 0; oi < ripIds.length; oi++) {
      const nid = ripIds[oi];
      const g = netPads.get(nid);
      if (g === undefined || netPadTotal(g) < 2) {
        continue;
      }
      const pair = layerPairForNet(doc, preferredLayer, g.netName, nid);
      const w = widthForNet(defaultWidth, g.netName);
      segs += await routeNetGroupAsync(doc, pair, g, grid, w);
      await yieldToUi();
    }
    const ratsBefore = rats.length;
    repaired++;
    tracePcb('AUTO_INCOMPLETE_REPAIR',
      `round=${round + 1} net=${grp.netName || victim} rip=${ripIds.length} ` +
      `removed=${removed} rewroteSegs=${segs} ratsWas=${ratsBefore}`);
    const ratsAfter = buildRatsnest(doc).length;
    if (ratsAfter >= ratsBefore) {
      // 本轮无进展：停止以免反复撕线
      if (ratsAfter > ratsBefore) {
        tracePcbWarn('AUTO_INCOMPLETE_REPAIR',
          `no_progress rats ${ratsBefore}→${ratsAfter} stop`);
      }
      break;
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
    const w = widthForNet(defaultWidth, grp.netName);
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
    const w = widthForNet(width, grp.netName);
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
 * 对未布线网络执行自动正交布线（跳过已有走线的网络）
 * 地网走底层；Cu≥4 时信号 H/V 分铜层并在拐角打过孔；全程避异网焊盘。
 * 协作式让出主线程，避免 APP_INPUT_BLOCK。
 */
export async function autoRoutePcb(doc: PcbDocument, layer: PcbLayerId,
  schNets?: AccessoryNetHint[]): Promise<AutoRouteResult> {
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
  const groups = sortNetGroupsByLocality(groupsRaw);

  let netCount = 0;
  let failNets = 0;
  const tracksBefore = doc.tracks.length;
  const viasBefore = doc.vias.length;

  tracePcb('AUTO_ROUTE_BEGIN',
    `layer=${layer} Cu=${cuN} netGroups=${groups.length} grid=${grid} width=${width} ` +
    `padAware=true async=true localitySort=true`);

  for (let gi = 0; gi < groups.length; gi++) {
    const grp = groups[gi];
    const total = netPadTotal(grp);
    if (total < 2) {
      tracePcbWarn('AUTO_SKIP',
        `${grp.netName || grp.netId} pads=${total} (dev=${grp.points.length},j1=${grp.connectorPoints.length}) — 焊盘不足`);
      continue;
    }
    if (netAlreadyRouted(doc, grp.netId)) {
      tracePcb('AUTO_SKIP', `${grp.netName || grp.netId} — 已有走线/过孔`);
      continue;
    }
    netCount++;
    const pair = layerPairForNet(doc, layer, grp.netName, grp.netId);
    const w = widthForNet(width, grp.netName);
    const segsBefore = doc.tracks.length;
    const segs = await routeNetGroupAsync(doc, pair, grp, grid, w);
    if (segs === 0 && total >= 2) {
      failNets++;
    }
    tracePcb('AUTO_NET',
      `${grp.netName || grp.netId} pads=${total} (dev=${grp.points.length},j1=${grp.connectorPoints.length}) ` +
      `segments=${segs} deltaTrk=${doc.tracks.length - segsBefore} H=${pair.h} V=${pair.v} w=${w}`);
    await yieldToUi();
  }

  await finishRouteCleanupAsync(doc, 'AUTO');
  const incompleteFixed = await repairIncompleteNetsAsync(doc, layer, grid, width, netPads);
  if (incompleteFixed > 0) {
    await finishRouteCleanupAsync(doc, 'AUTO_GAP');
  }
  const repaired = await repairSameLayerCrossesAsync(doc, layer, grid, width);
  if (repaired > 0) {
    await finishRouteCleanupAsync(doc, 'AUTO_REPAIR');
  }
  // 最终以 ratsnest 为准统计未连通
  const ratsLeft = buildRatsnest(doc);
  const incompleteLeft: Set<string> = new Set();
  for (let i = 0; i < ratsLeft.length; i++) {
    incompleteLeft.add(ratsLeft[i].netId);
  }
  failNets = incompleteLeft.size;
  if (failNets > 0) {
    incompleteLeft.forEach((nid: string) => {
      const g = netPads.get(nid);
      const label = g !== undefined ? (g.netName || nid) : nid;
      tracePcbWarn('NET_UNROUTED', `${label}`);
    });
  }
  const trackCount = Math.max(0, doc.tracks.length - tracksBefore);
  const viaCount = Math.max(0, doc.vias.length - viasBefore);

  if (netCount === 0) {
    messages.push('没有需要自动布线的网络');
  } else {
    const viaHint = viaCount > 0 ? `，${viaCount} 过孔` : '';
    const failHint = failNets > 0 ? `，${failNets} 网未连通` : '';
    const repairHint = (repaired + incompleteFixed) > 0
      ? `，重试 ${repaired + incompleteFixed}` : '';
    messages.push(
      `已自动布线 ${netCount} 个网络，${trackCount} 段（Cu=${cuN}${viaHint}${failHint}${repairHint}，避焊盘）`);
  }
  if (failNets > 0) {
    tracePcbWarn('AUTO_ROUTE_INCOMPLETE', `failNets=${failNets}/${netCount}`);
  }
  const leftCross = await collectMidspanCrossNetIdsAsync(doc);
  if (leftCross.length > 0) {
    tracePcbWarn('AUTO_CROSS_LEFT', `nets=${leftCross.length}`);
  }
  doc.metadata.modifiedAt = new Date().toISOString();
  return { trackCount, netCount, messages };
}
