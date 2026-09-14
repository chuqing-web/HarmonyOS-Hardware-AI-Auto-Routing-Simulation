/**
 * 确定性通道自动布线 — MCP 风格（最多 8 铜层）
 * 1) 安装孔去网；清 tracks/vias/zones（不用整面铺铜当参考面）
 * 2) 同网 MST：本地 F.Cu 正交 L；长跑 F stub→via→内层/B 干线→via→F（按网轮询 hop）
 * 3) 每层须有真实走线：结束后 fillUnusedCopperLayers（zone 不算已用）
 * 4) 禁止斜线、via 过近、垃圾折返；主线程切片让出
 */
import {
  PcbDocument, PcbLayerId, PcbTrack, PcbVia, PcbViaKind, copperLayersFromStack
} from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';
import { IdUtil } from '../IdUtil';
import { padWorldPosition } from '../PcbZoneUtil';
import { ensureBoardAccessories, AccessoryNetHint } from '../PcbBoardAccessories';
import {
  pathClearBlockReason, viaClearAt, trackWidthForNet
} from './PcbClearanceOracle';
import { findNetClass, buildRatsnest, padsCopperConnected, reunitePadsByCopper } from '../PcbNetUtil';
import { computeAutoRouteMetrics, AutoRouteMetrics } from './PcbRouteVerify';
import {
  snapTrackEndpointsToPads, pruneZeroLengthTracks, mergeColinearTracks, pruneShortTracks
} from '../PcbTrackBindUtil';
import { tracePcb, setPcbInstrAuditPaused } from '../PcbTraceLog';
import { buildLocalNetPlan, buildLocalRoutePolicy } from './PcbLocalStrategy';
import { ensureAllCopperUsed, fillUnusedCopperLayers } from './ensureAllCopperUsed';
import { mazeRouteRectilinear, MazeLayerPair } from './PcbMazeRouter';

export interface ChannelRouteResult {
  trackCount: number;
  netCount: number;
  messages: string[];
  completionRate?: number;
  totalWireLength?: number;
  viaCount?: number;
  drcErrorCount?: number;
  metrics?: AutoRouteMetrics;
}

const UI_YIELD_MS = 6;
const UI_SLICE_MS = 4;
/** 总墙钟；须留出 PASS0_RESERVE 给电源补线 / Pass2-3 */
const HARD_WALL_MS = 32000;
/** Pass0 提前收口，避免 LED 小网耗尽后电源零线 */
const PASS0_RESERVE_MS = 10000;
/** 单网 MST 上限，防止 L*_A 一类边耗尽 6s+ */
const NET_BUDGET_MS = 1400;
/** 强制 100% 补通专用墙钟（完成后才收） */
const FORCE_COMPLETE_MS = 55000;
const MIN_SEG = 5;
const CHANNEL_PITCH = 40;
/** 超过此曼哈顿才优先换层长跑；本地一律先 F */
const LONG_RUN_MANH = 280;
const MIN_VIA_PAD = 45;
const MIN_VIA_VIA = 90;
const MAX_VIA_SPOTS = 8;
const MAX_VIA_COMBOS = 16;

interface ChanNet {
  netId: string;
  netName: string;
  pads: Point2D[];
  /** 与 pads 一一对应：是否 J1/排针等连接器脚 */
  isConn: boolean[];
  span: number;
  isPower: boolean;
}

interface BoardBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface SliceBox {
  t: number;
}

interface ViaCombo {
  ai: number;
  bi: number;
  cost: number;
}

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function manhattan(a: Point2D, b: Point2D): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function snap(v: number, grid: number): number {
  if (grid <= 0) {
    return v;
  }
  return Math.round(v / grid) * grid;
}

function isOrtho(a: Point2D, b: Point2D): boolean {
  return Math.abs(a.x - b.x) < 0.51 || Math.abs(a.y - b.y) < 0.51;
}

function yieldToUi(): Promise<void> {
  return new Promise<void>((resolve: (v: void) => void) => {
    setTimeout((): void => {
      resolve();
    }, UI_YIELD_MS);
  });
}

async function yieldSlice(box: SliceBox): Promise<void> {
  if (Date.now() - box.t >= UI_SLICE_MS) {
    await yieldToUi();
    box.t = Date.now();
  }
}

function wallOk(t0: number): boolean {
  return (Date.now() - t0) < HARD_WALL_MS;
}

/** Pass0 软墙：预留补线时间 */
function wallOkPass0(t0: number): boolean {
  return (Date.now() - t0) < (HARD_WALL_MS - PASS0_RESERVE_MS);
}

function wallPressure(t0: number): boolean {
  return (Date.now() - t0) >= (HARD_WALL_MS - PASS0_RESERVE_MS - 4000);
}

function isMountFp(defId: string, refDes: string): boolean {
  if (defId.indexOf('MOUNT') >= 0) {
    return true;
  }
  if (refDes.length >= 2 && (refDes.charAt(0) === 'H' || refDes.indexOf('MH') === 0)) {
    const c = refDes.charAt(0) === 'H' ? refDes.charCodeAt(1) : 49;
    return c >= 48 && c <= 57;
  }
  return false;
}

/** J1 / PINHDR / CONN：板边排针，必须侧向进盘 */
function isConnectorFp(defId: string, refDes: string): boolean {
  const d = defId.toUpperCase();
  const r = refDes.toUpperCase();
  if (d.indexOf('PINHDR') >= 0 || d.indexOf('CONN') >= 0 || d.indexOf('HEADER') >= 0) {
    return true;
  }
  if (r === 'J1' || (r.length >= 2 && r.charAt(0) === 'J' &&
    r.charCodeAt(1) >= 48 && r.charCodeAt(1) <= 57)) {
    return true;
  }
  return false;
}

/** 安装孔去网，避免 GND 误连 H*（对齐 MCP pcb_clear_mount_nets） */
function clearMountHoleNets(doc: PcbDocument): number {
  let n = 0;
  const fps = doc.footprints ?? [];
  for (let i = 0; i < fps.length; i++) {
    const fp = fps[i];
    if (!isMountFp(fp.defId ?? '', fp.refDes ?? '')) {
      continue;
    }
    for (let pi = 0; pi < fp.pads.length; pi++) {
      const pad = fp.pads[pi];
      if ((pad.netId !== undefined && pad.netId.length > 0) ||
        (pad.netName !== undefined && pad.netName.length > 0)) {
        pad.netId = '';
        pad.netName = '';
        n++;
      }
    }
  }
  return n;
}

function boardBoxOf(doc: PcbDocument): BoardBox {
  const pts = doc.boardOutline?.points ?? [];
  if (pts.length < 2) {
    return { minX: 0, minY: 0, maxX: 1200, maxY: 900 };
  }
  let minX = pts[0].x;
  let minY = pts[0].y;
  let maxX = pts[0].x;
  let maxY = pts[0].y;
  for (let i = 1; i < pts.length; i++) {
    minX = Math.min(minX, pts[i].x);
    minY = Math.min(minY, pts[i].y);
    maxX = Math.max(maxX, pts[i].x);
    maxY = Math.max(maxY, pts[i].y);
  }
  return { minX, minY, maxX, maxY };
}

function netIsPower(name: string): boolean {
  const u = name.toUpperCase();
  return u.indexOf('GND') >= 0 || u.indexOf('VCC') >= 0 || u.indexOf('VDD') >= 0 ||
    u.indexOf('VSS') >= 0 || u === 'VIN' || u === 'VOUT' || u.indexOf('PWR') >= 0 ||
    u.indexOf('REG_') === 0 || u === '+5V' || u === '+3V3' || u === '3V3' || u === '5V';
}

/** 主电源轨：必须先于 LED/信号布完 */
function netIsRail(name: string): boolean {
  const u = name.toUpperCase();
  if (u === 'GND' || u === 'VCC' || u === 'VDD' || u === 'VSS' ||
    u === 'AGND' || u === 'DGND' || u === 'VIN' || u === 'VOUT' ||
    u === '+5V' || u === '+3V3' || u === '3V3' || u === '5V') {
    return true;
  }
  if (u.indexOf('GND') === 0 || u.endsWith('_GND')) {
    return true;
  }
  return false;
}

function netHasConn(n: ChanNet): boolean {
  for (let i = 0; i < n.isConn.length; i++) {
    if (n.isConn[i]) {
      return true;
    }
  }
  return false;
}

/** 0=电源轨 1=含排针 2=其它电源 3=信号 */
function netTier(n: ChanNet): number {
  if (netIsRail(n.netName)) {
    return 0;
  }
  if (netHasConn(n)) {
    return 1;
  }
  if (n.isPower) {
    return 2;
  }
  return 3;
}

function collectChanNets(doc: PcbDocument): ChanNet[] {
  const map: Map<string, ChanNet> = new Map();
  const fps = doc.footprints ?? [];
  for (let fi = 0; fi < fps.length; fi++) {
    const fp = fps[fi];
    if (isMountFp(fp.defId ?? '', fp.refDes ?? '')) {
      continue;
    }
    const conn = isConnectorFp(fp.defId ?? '', fp.refDes ?? '');
    for (let pi = 0; pi < fp.pads.length; pi++) {
      const pad = fp.pads[pi];
      const nid = pad.netId ?? '';
      if (nid.length === 0) {
        continue;
      }
      const nname = pad.netName !== undefined && pad.netName.length > 0 ? pad.netName : nid;
      let g = map.get(nid);
      if (g === undefined) {
        g = {
          netId: nid, netName: nname, pads: [], isConn: [], span: 0, isPower: netIsPower(nname)
        };
        map.set(nid, g);
      }
      g.pads.push(padWorldPosition(fp, pad));
      g.isConn.push(conn);
    }
  }
  const out: ChanNet[] = [];
  map.forEach((g: ChanNet) => {
    if (g.pads.length < 2) {
      return;
    }
    // 去重过近焊盘（同点）；连接器标记取 OR
    const uniq: Point2D[] = [];
    const uniqConn: boolean[] = [];
    for (let i = 0; i < g.pads.length; i++) {
      let dup = -1;
      for (let j = 0; j < uniq.length; j++) {
        if (dist(g.pads[i], uniq[j]) < 1.0) {
          dup = j;
          break;
        }
      }
      if (dup < 0) {
        uniq.push(g.pads[i]);
        uniqConn.push(g.isConn[i]);
      } else if (g.isConn[i]) {
        uniqConn[dup] = true;
      }
    }
    g.pads = uniq;
    g.isConn = uniqConn;
    if (g.pads.length < 2) {
      return;
    }
    let minX = g.pads[0].x;
    let minY = g.pads[0].y;
    let maxX = g.pads[0].x;
    let maxY = g.pads[0].y;
    for (let i = 1; i < g.pads.length; i++) {
      minX = Math.min(minX, g.pads[i].x);
      minY = Math.min(minY, g.pads[i].y);
      maxX = Math.max(maxX, g.pads[i].x);
      maxY = Math.max(maxY, g.pads[i].y);
    }
    g.span = (maxX - minX) + (maxY - minY);
    out.push(g);
  });
  // 电源轨 → 排针网 → 其它电源 → 信号；同档短跨距先布
  out.sort((a: ChanNet, b: ChanNet): number => {
    const ta = netTier(a);
    const tb = netTier(b);
    if (ta !== tb) {
      return ta - tb;
    }
    if (a.span !== b.span) {
      return a.span - b.span;
    }
    if (a.pads.length !== b.pads.length) {
      return a.pads.length - b.pads.length;
    }
    return a.netId < b.netId ? -1 : (a.netId > b.netId ? 1 : 0);
  });
  return out;
}

function viaGeom(doc: PcbDocument, netId: string): number[] {
  const rules = doc.metadata.designRules;
  let diameter = rules.minViaDrill + 8;
  let drill = rules.minViaDrill;
  if (netId.length > 0) {
    for (let i = 0; i < doc.nets.length; i++) {
      if (doc.nets[i].id === netId) {
        const nc = findNetClass(doc, doc.nets[i].classId);
        diameter = nc.viaDiameter;
        drill = nc.viaDrill;
        break;
      }
    }
  }
  return [diameter, drill];
}

function addSeg(doc: PcbDocument, layer: PcbLayerId, a: Point2D, b: Point2D,
  netId: string, netName: string, width: number): boolean {
  if (dist(a, b) < 0.5) {
    return true;
  }
  if (!isOrtho(a, b)) {
    return false;
  }
  if (dist(a, b) < MIN_SEG - 0.01) {
    // 允许极短吸附段，但 ≥1
    if (dist(a, b) < 1.0) {
      return true;
    }
  }
  const block = pathClearBlockReason(doc, layer, a, b, netId, width, doc.tracks, doc.vias);
  if (block !== null) {
    return false;
  }
  doc.tracks.push({
    id: IdUtil.generate('trk'),
    layer,
    start: { x: a.x, y: a.y },
    end: { x: b.x, y: b.y },
    width,
    netId,
    netName
  });
  return true;
}

function tryAddVia(doc: PcbDocument, pos: Point2D, netId: string, netName: string,
  copper: PcbLayerId[]): boolean {
  // 同网近距已有 via → 复用，禁止叠孔
  for (let i = 0; i < doc.vias.length; i++) {
    const v = doc.vias[i];
    if (v.netId === netId && dist(v.position, pos) < 12) {
      return true;
    }
  }
  const g = viaGeom(doc, netId);
  if (!viaClearAt(doc, pos, netId, g[0], copper, doc.tracks, doc.vias)) {
    return false;
  }
  doc.vias.push({
    id: IdUtil.generate('via'),
    position: { x: pos.x, y: pos.y },
    diameter: g[0],
    drill: g[1],
    netId,
    netName,
    layers: copper.slice(),
    kind: PcbViaKind.THROUGH
  });
  return true;
}

/** 严格正交折线：相邻点必须轴对齐 */
function tryOrthoPath(doc: PcbDocument, layer: PcbLayerId, pts: Point2D[],
  netId: string, netName: string, width: number): boolean {
  const mark = doc.tracks.length;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (dist(a, b) < 0.5) {
      continue;
    }
    if (!isOrtho(a, b)) {
      doc.tracks.length = mark;
      return false;
    }
    if (!addSeg(doc, layer, a, b, netId, netName, width)) {
      doc.tracks.length = mark;
      return false;
    }
  }
  return true;
}

/** 完成率优先：无视 clearance 强制落段（末招；可产生 DRC） */
function addSegForce(doc: PcbDocument, layer: PcbLayerId, a: Point2D, b: Point2D,
  netId: string, netName: string, width: number): boolean {
  if (dist(a, b) < 0.5) {
    return true;
  }
  if (!isOrtho(a, b)) {
    return false;
  }
  doc.tracks.push({
    id: IdUtil.generate('trk'),
    layer,
    start: { x: a.x, y: a.y },
    end: { x: b.x, y: b.y },
    width,
    netId,
    netName
  });
  return true;
}

function tryOrthoPathForce(doc: PcbDocument, layer: PcbLayerId, pts: Point2D[],
  netId: string, netName: string, width: number): boolean {
  const mark = doc.tracks.length;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (dist(a, b) < 0.5) {
      continue;
    }
    if (!isOrtho(a, b)) {
      doc.tracks.length = mark;
      return false;
    }
    if (!addSegForce(doc, layer, a, b, netId, netName, width)) {
      doc.tracks.length = mark;
      return false;
    }
  }
  return true;
}

function tryAddViaForce(doc: PcbDocument, pos: Point2D, netId: string, netName: string,
  copper: PcbLayerId[]): boolean {
  for (let i = 0; i < doc.vias.length; i++) {
    const v = doc.vias[i];
    if (v.netId === netId && dist(v.position, pos) < 12) {
      return true;
    }
  }
  const g = viaGeom(doc, netId);
  doc.vias.push({
    id: IdUtil.generate('via'),
    position: { x: pos.x, y: pos.y },
    diameter: g[0],
    drill: g[1],
    netId,
    netName,
    layers: copper.slice(),
    kind: PcbViaKind.THROUGH
  });
  return true;
}

/** 强制正交 L（HV / VH）：焊盘到焊盘连续折线，一段连通 */
function forceOrthoL(doc: PcbDocument, layer: PcbLayerId, a: Point2D, b: Point2D,
  netId: string, netName: string, width: number): boolean {
  if (dist(a, b) < 0.5) {
    return true;
  }
  if (padsCopperConnected(doc, netId, a, b)) {
    return true;
  }
  const pHV: Point2D[] = [a, { x: b.x, y: a.y }, b];
  const pVH: Point2D[] = [a, { x: a.x, y: b.y }, b];
  if (tryOrthoPath(doc, layer, pHV, netId, netName, width) ||
    tryOrthoPath(doc, layer, pVH, netId, netName, width)) {
    return true;
  }
  return tryOrthoPathForce(doc, layer, pHV, netId, netName, width) ||
    tryOrthoPathForce(doc, layer, pVH, netId, netName, width);
}

/** 强制 F stub → via → hop → via → F stub */
function forceViaHop(doc: PcbDocument, a: Point2D, b: Point2D,
  netId: string, netName: string, width: number,
  front: PcbLayerId, hop: PcbLayerId, copper: PcbLayerId[], grid: number): boolean {
  if (hop === front || manhattan(a, b) < 40) {
    return forceOrthoL(doc, front, a, b, netId, netName, width);
  }
  const sx = b.x >= a.x ? 1 : -1;
  const sy = b.y >= a.y ? 1 : -1;
  const offs: number[] = [55, 75, 95, 120, 40];
  for (let oi = 0; oi < offs.length; oi++) {
    const o = offs[oi];
    const viaA: Point2D = { x: snap(a.x + sx * o, grid), y: snap(a.y, grid) };
    const viaB: Point2D = { x: snap(b.x - sx * o, grid), y: snap(b.y, grid) };
    if (manhattan(viaA, viaB) < MIN_VIA_VIA - 20) {
      continue;
    }
    const markT = doc.tracks.length;
    const markV = doc.vias.length;
    if (!tryOrthoPathForce(doc, front, [a, viaA], netId, netName, width) &&
      !tryOrthoPathForce(doc, front, [a, { x: viaA.x, y: a.y }, viaA], netId, netName, width)) {
      doc.tracks.length = markT;
      continue;
    }
    tryAddViaForce(doc, viaA, netId, netName, copper);
    if (!tryOrthoPathForce(doc, hop, [viaA, { x: viaB.x, y: viaA.y }, viaB], netId, netName, width) &&
      !tryOrthoPathForce(doc, hop, [viaA, { x: viaA.x, y: viaB.y }, viaB], netId, netName, width)) {
      doc.tracks.length = markT;
      doc.vias.length = markV;
      continue;
    }
    tryAddViaForce(doc, viaB, netId, netName, copper);
    if (!tryOrthoPathForce(doc, front, [viaB, b], netId, netName, width) &&
      !tryOrthoPathForce(doc, front, [viaB, { x: b.x, y: viaB.y }, b], netId, netName, width) &&
      !tryOrthoPathForce(doc, front, [viaB, { x: viaB.x, y: b.y }, b], netId, netName, width)) {
      doc.tracks.length = markT;
      doc.vias.length = markV;
      continue;
    }
    return true;
  }
  return forceOrthoL(doc, front, a, b, netId, netName, width);
}

function tryMazeCommit(doc: PcbDocument, a: Point2D, b: Point2D,
  netId: string, netName: string, width: number, front: PcbLayerId, grid: number): boolean {
  const pair: MazeLayerPair = { h: front, v: front };
  const scales: number[] = [1, 0.75, 0.55];
  for (let si = 0; si < scales.length; si++) {
    const path = mazeRouteRectilinear(doc, pair, a, b, netId, width, grid, scales[si]);
    if (path.length >= 2 && tryOrthoPath(doc, front, path, netId, netName, width)) {
      return true;
    }
  }
  return false;
}

/**
 * 强制 100%：飞线边循环补通；末招 force L / via（可 DRC）。
 * @returns 强制补通边数
 */
async function forceCompleteAllRats(
  doc: PcbDocument,
  nets: ChanNet[],
  front: PcbLayerId,
  hops: PcbLayerId[],
  copper: PcbLayerId[],
  channels: Map<string, number[]>,
  grid: number,
  slice: SliceBox
): Promise<number> {
  const tForce = Date.now();
  let forced = 0;
  let round = 0;
  const hopDefault = hops.length > 0 ? hops[hops.length - 1] : front;

  while (round < 100 && (Date.now() - tForce) < FORCE_COMPLETE_MS) {
    round++;
    const rats = buildRatsnest(doc);
    if (rats.length === 0) {
      break;
    }
    await yieldToUi();
    slice.t = Date.now();

    const ordered: number[] = [];
    for (let i = 0; i < rats.length; i++) {
      ordered.push(i);
    }
    ordered.sort((ia: number, ib: number): number => {
      const ea = rats[ia];
      const eb = rats[ib];
      let ta = 9;
      let tb = 9;
      for (let ni = 0; ni < nets.length; ni++) {
        if (nets[ni].netId === ea.netId) {
          ta = netTier(nets[ni]);
        }
        if (nets[ni].netId === eb.netId) {
          tb = netTier(nets[ni]);
        }
      }
      if (ta !== tb) {
        return ta - tb;
      }
      return manhattan(ea.a, ea.b) - manhattan(eb.a, eb.b);
    });

    let progress = 0;
    const nuke = round >= 3;
    for (let oi = 0; oi < ordered.length; oi++) {
      if ((Date.now() - tForce) >= FORCE_COMPLETE_MS) {
        break;
      }
      if ((oi & 1) === 0) {
        await yieldSlice(slice);
      }
      const e = rats[ordered[oi]];
      if (padsCopperConnected(doc, e.netId, e.a, e.b)) {
        continue;
      }
      let net: ChanNet | undefined = undefined;
      for (let ni = 0; ni < nets.length; ni++) {
        if (nets[ni].netId === e.netId) {
          net = nets[ni];
          break;
        }
      }
      const netName = net !== undefined ? net.netName : (e.netName ?? e.netId);
      const width = trackWidthForNet(doc, e.netId);
      const ch = channels.get(e.netId);
      const ty = ch !== undefined ? ch[0] : snap((e.a.y + e.b.y) / 2, grid);
      const tx = ch !== undefined ? ch[1] : snap((e.a.x + e.b.x) / 2, grid);
      const hopPrefer = net !== undefined && net.isPower
        ? hopDefault
        : (hops.length > 1 ? hops[0] : hopDefault);

      let ok = false;
      if (!nuke) {
        ok = await routePair(doc, e.a, e.b, e.netId, netName, width,
          front, hops, hopPrefer, copper, ty, tx, grid,
          net !== undefined ? net.pads : [e.a, e.b], slice, tForce, net);
        if (!ok) {
          ok = tryMazeCommit(doc, e.a, e.b, e.netId, netName, width, front, grid);
        }
        if (!ok && net !== undefined && netHasConn(net)) {
          const aC = pointIsConnPad(e.a, net);
          const bC = pointIsConnPad(e.b, net);
          if (aC !== bC) {
            const src = aC ? e.b : e.a;
            const hdr = aC ? e.a : e.b;
            ok = tryHeaderFanInCommit(doc, src, hdr, e.netId, netName, width,
              front, hops, hopPrefer, copper, ty, grid, net.pads);
          }
        }
      }
      if (!ok) {
        ok = forceOrthoL(doc, front, e.a, e.b, e.netId, netName, width);
      }
      if (!ok) {
        ok = forceViaHop(doc, e.a, e.b, e.netId, netName, width, front, hopPrefer, copper, grid);
      }
      if (!ok && hopDefault !== front) {
        ok = forceViaHop(doc, e.a, e.b, e.netId, netName, width, front, hopDefault, copper, grid);
      }
      if (!ok) {
        // 绝对末招：再 force 一次 L（理论上 forceOrthoL 已保证，除非非正交）
        ok = forceOrthoL(doc, front, e.a, e.b, e.netId, netName, width);
      }
      if (ok || padsCopperConnected(doc, e.netId, e.a, e.b)) {
        progress++;
        forced++;
      }
    }

    tracePcb('CHAN_FORCE', `round=${round} rats=${rats.length} progress=${progress} nuke=${nuke ? 1 : 0}`);
    if (progress === 0 && nuke) {
      // 逐焊盘对扫剩余开路网
      const open = openNetIds(doc);
      for (let ni = 0; ni < nets.length; ni++) {
        const net = nets[ni];
        if (!open.has(net.netId)) {
          continue;
        }
        for (let i = 0; i < net.pads.length; i++) {
          for (let j = i + 1; j < net.pads.length; j++) {
            if (padsCopperConnected(doc, net.netId, net.pads[i], net.pads[j])) {
              continue;
            }
            if (forceOrthoL(doc, front, net.pads[i], net.pads[j], net.netId, net.netName,
              trackWidthForNet(doc, net.netId))) {
              forced++;
            }
          }
        }
      }
      break;
    }
    if (progress === 0) {
      // 下一轮进入 nuke
      continue;
    }
  }

  // 最终核对：仍开则全对焊盘 force L
  let still = openNetIds(doc);
  if (still.size > 0) {
    for (let ni = 0; ni < nets.length; ni++) {
      const net = nets[ni];
      if (!still.has(net.netId)) {
        continue;
      }
      for (let i = 0; i < net.pads.length; i++) {
        for (let j = i + 1; j < net.pads.length; j++) {
          if (!padsCopperConnected(doc, net.netId, net.pads[i], net.pads[j])) {
            forceOrthoL(doc, front, net.pads[i], net.pads[j], net.netId, net.netName,
              trackWidthForNet(doc, net.netId));
            forced++;
          }
        }
      }
    }
    still = openNetIds(doc);
  }
  tracePcb('CHAN_FORCE_DONE', `forced=${forced} rounds=${round} open=${still.size}`);
  return forced;
}

/** 焊盘先逃出 courtyard，再走干线（对齐 MCP：侧向出盘） */
function padEscapes(pad: Point2D, toward: Point2D, grid: number): Point2D[] {
  const sx = toward.x >= pad.x ? 1 : -1;
  const sy = toward.y >= pad.y ? 1 : -1;
  const steps: number[] = [40, 55, 75, 100];
  const out: Point2D[] = [];
  const seen: Record<string, boolean> = {};
  const push = (p: Point2D): void => {
    const k = `${p.x},${p.y}`;
    if (seen[k]) {
      return;
    }
    seen[k] = true;
    out.push(p);
  };
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    push({ x: snap(pad.x + sx * s, grid), y: snap(pad.y, grid) });
    push({ x: snap(pad.x, grid), y: snap(pad.y + sy * s, grid) });
    push({ x: snap(pad.x - sx * s, grid), y: snap(pad.y, grid) });
    push({ x: snap(pad.x, grid), y: snap(pad.y - sy * s, grid) });
  }
  return out;
}

function pathLenOf(pts: Point2D[]): number {
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    L += dist(pts[i], pts[i + 1]);
  }
  return L;
}

/** 候选折线按总长升序，优先最短正交路径 */
function sortPathsShortFirst(paths: Point2D[][]): Point2D[][] {
  const scored: number[] = [];
  for (let i = 0; i < paths.length; i++) {
    scored.push(pathLenOf(paths[i]));
  }
  const order: number[] = [];
  for (let i = 0; i < paths.length; i++) {
    order.push(i);
  }
  order.sort((ia: number, ib: number): number => {
    if (scored[ia] !== scored[ib]) {
      return scored[ia] - scored[ib];
    }
    return ia - ib;
  });
  const out: Point2D[][] = [];
  const seen: Record<string, boolean> = {};
  for (let oi = 0; oi < order.length; oi++) {
    const pts = paths[order[oi]];
    let key = '';
    for (let k = 0; k < pts.length; k++) {
      key += `${Math.round(pts[k].x)},${Math.round(pts[k].y)};`;
    }
    if (seen[key]) {
      continue;
    }
    seen[key] = true;
    out.push(pts);
  }
  return out;
}

function buildFLCandidates(a: Point2D, b: Point2D, trackY: number, trackX: number,
  grid: number): Point2D[][] {
  const A: Point2D = { x: a.x, y: a.y };
  const B: Point2D = { x: b.x, y: b.y };
  const out: Point2D[][] = [];
  const pushPath = (pts: Point2D[]): void => {
    if (pts.length < 2) {
      return;
    }
    out.push(pts);
  };
  // 最短两折（必须最先）
  pushPath([A, { x: B.x, y: A.y }, B]);
  pushPath([A, { x: A.x, y: B.y }, B]);
  // 焊盘中点走廊（比电源远通道更短）
  const midY = snap((A.y + B.y) / 2, grid);
  const midX = snap((A.x + B.x) / 2, grid);
  if (Math.abs(midY - A.y) > 2 && Math.abs(midY - B.y) > 2) {
    pushPath([A, { x: A.x, y: midY }, { x: B.x, y: midY }, B]);
  }
  if (Math.abs(midX - A.x) > 2 && Math.abs(midX - B.x) > 2) {
    pushPath([A, { x: midX, y: A.y }, { x: midX, y: B.y }, B]);
  }
  // 指定通道干线（长跑/B 用；F 上可能偏长，排在后面）
  const y = snap(trackY, grid);
  const x = snap(trackX, grid);
  if (Math.abs(y - A.y) > 2 && Math.abs(y - B.y) > 2 && Math.abs(y - midY) > 8) {
    pushPath([A, { x: A.x, y: y }, { x: B.x, y: y }, B]);
  }
  if (Math.abs(x - A.x) > 2 && Math.abs(x - B.x) > 2 && Math.abs(x - midX) > 8) {
    pushPath([A, { x: x, y: A.y }, { x: x, y: B.y }, B]);
  }
  // 小 jog（限制数量，防绕远）
  const jogs: number[] = [CHANNEL_PITCH, -CHANNEL_PITCH, CHANNEL_PITCH * 2, -CHANNEL_PITCH * 2];
  for (let i = 0; i < jogs.length; i++) {
    const yy = snap(A.y + jogs[i], grid);
    pushPath([A, { x: A.x, y: yy }, { x: B.x, y: yy }, B]);
    const xx = snap(A.x + jogs[i], grid);
    pushPath([A, { x: xx, y: A.y }, { x: xx, y: B.y }, B]);
  }
  // 逃逸：仅短距需要；长跑靠 via
  if (manhattan(A, B) < LONG_RUN_MANH) {
    const escA = padEscapes(A, B, grid);
    const escB = padEscapes(B, A, grid);
    const limA = Math.min(4, escA.length);
    const limB = Math.min(4, escB.length);
    for (let i = 0; i < limA; i++) {
      const ea = escA[i];
      for (let j = 0; j < limB; j++) {
        const eb = escB[j];
        pushPath([A, ea, { x: eb.x, y: ea.y }, eb, B]);
        pushPath([A, ea, { x: ea.x, y: eb.y }, eb, B]);
      }
    }
  }
  return sortPathsShortFirst(out);
}

function resolveFront(copper: PcbLayerId[]): PcbLayerId {
  return copper.length > 0 ? copper[0] : PcbLayerId.F_CU;
}

/** 长跑 hop 层：除 F 外全部铜层（In1..In6 + B，最多 7）；Cu=2 仅为 B */
function hopLayersOf(copper: PcbLayerId[]): PcbLayerId[] {
  if (copper.length <= 1) {
    return copper.slice();
  }
  const hops: PcbLayerId[] = [];
  for (let i = 1; i < copper.length; i++) {
    hops.push(copper[i]);
  }
  return hops;
}

function orderedHops(prefer: PcbLayerId, hops: PcbLayerId[]): PcbLayerId[] {
  const out: PcbLayerId[] = [];
  for (let i = 0; i < hops.length; i++) {
    if (hops[i] === prefer) {
      out.push(prefer);
      break;
    }
  }
  for (let i = 0; i < hops.length; i++) {
    if (hops[i] !== prefer) {
      out.push(hops[i]);
    }
  }
  return out;
}

/**
 * Cu≥4 时不全量轮询 In1..B（组合爆炸 → THREAD/超时）。
 * 默认只试 prefer + 末层(B)；时间紧时仅 prefer。
 */
function hopsForAttempt(prefer: PcbLayerId, hops: PcbLayerId[], pressure: boolean): PcbLayerId[] {
  const all = orderedHops(prefer, hops);
  if (all.length <= 2) {
    return all;
  }
  if (pressure) {
    return all.slice(0, 1);
  }
  const out: PcbLayerId[] = [];
  out.push(all[0]);
  const last = hops[hops.length - 1];
  if (last !== all[0]) {
    out.push(last);
  }
  return out;
}

/** 电源优先末层(B)；信号轮询内层，保证 In1..InN 都吃到干线 */
function preferHopForNet(net: ChanNet, hops: PcbLayerId[], netIndex: number): PcbLayerId {
  if (hops.length === 0) {
    return PcbLayerId.B_CU;
  }
  if (net.isPower) {
    return hops[hops.length - 1];
  }
  const inners = hops.length > 1 ? hops.slice(0, hops.length - 1) : hops;
  return inners[netIndex % inners.length];
}

function trackCountByLayer(doc: PcbDocument, copper: PcbLayerId[]): string {
  const parts: string[] = [];
  for (let i = 0; i < copper.length; i++) {
    const lid = copper[i];
    let n = 0;
    for (let ti = 0; ti < doc.tracks.length; ti++) {
      if (doc.tracks[ti].layer === lid) {
        n++;
      }
    }
    parts.push(`${lid as string}=${n}`);
  }
  return parts.join(' ');
}

function pickViaSpots(doc: PcbDocument, near: Point2D, toward: Point2D, netId: string,
  copper: PcbLayerId[], grid: number, avoidPads: Point2D[]): Point2D[] {
  const g = viaGeom(doc, netId);
  const diameter = g[0];
  const sx = toward.x >= near.x ? 1 : -1;
  const sy = toward.y >= near.y ? 1 : -1;
  const steps: number[] = [50, 70, 90, 120, 160, 200, 260];
  const raw: Point2D[] = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    raw.push({ x: snap(near.x + sx * s, grid), y: snap(near.y, grid) });
    raw.push({ x: snap(near.x, grid), y: snap(near.y + sy * s, grid) });
    raw.push({ x: snap(near.x + sx * s, grid), y: snap(near.y + sy * (s * 0.5), grid) });
  }
  const out: Point2D[] = [];
  const seen: Record<string, boolean> = {};
  for (let i = 0; i < raw.length && out.length < MAX_VIA_SPOTS; i++) {
    const p = raw[i];
    const key = `${p.x},${p.y}`;
    if (seen[key]) {
      continue;
    }
    seen[key] = true;
    if (dist(p, near) < MIN_VIA_PAD) {
      continue;
    }
    let nearPad = false;
    for (let ai = 0; ai < avoidPads.length; ai++) {
      if (dist(p, avoidPads[ai]) < MIN_VIA_PAD - 5) {
        nearPad = true;
        break;
      }
    }
    if (nearPad) {
      continue;
    }
    if (viaClearAt(doc, p, netId, diameter, copper, doc.tracks, doc.vias)) {
      out.push(p);
    }
  }
  return out;
}

function padIsConn(net: ChanNet, idx: number): boolean {
  return idx >= 0 && idx < net.isConn.length && net.isConn[idx];
}

function pointIsConnPad(p: Point2D, net: ChanNet): boolean {
  for (let i = 0; i < net.pads.length; i++) {
    if (net.isConn[i] && dist(p, net.pads[i]) < 2.0) {
      return true;
    }
  }
  return false;
}

/**
 * 排针侧向进盘（对齐 MCP：勿沿 pin 列竖穿；via 放在排针左侧再水平进盘）
 * 完整事务：成功才保留铜。
 */
function tryHeaderFanInCommit(doc: PcbDocument, src: Point2D, hdr: Point2D,
  netId: string, netName: string, width: number,
  front: PcbLayerId, hops: PcbLayerId[], hopPrefer: PcbLayerId, copper: PcbLayerId[],
  trackY: number, grid: number, allPads: Point2D[]): boolean {
  const manh = manhattan(src, hdr);
  // 最短 L / 中点走廊先试（能直达就不侧绕）
  const shortF = sortPathsShortFirst([
    [src, { x: hdr.x, y: src.y }, hdr],
    [src, { x: src.x, y: hdr.y }, hdr],
    [src, { x: src.x, y: snap((src.y + hdr.y) / 2, grid) },
      { x: hdr.x, y: snap((src.y + hdr.y) / 2, grid) }, hdr]
  ]);
  for (let i = 0; i < shortF.length; i++) {
    if (pathLenOf(shortF[i]) <= manh * 1.6 + 40 &&
      tryOrthoPath(doc, front, shortF[i], netId, netName, width)) {
      return true;
    }
  }

  const fromLeft = src.x <= hdr.x;
  const sideDists: number[] = [70, 90, 110, 55, 140];
  const yJogs: number[] = [0, CHANNEL_PITCH, -CHANNEL_PITCH, CHANNEL_PITCH * 2, -CHANNEL_PITCH * 2];
  // 排针侧进：只试 prefer + B，避免 Cu=6 全 hop 组合爆炸
  const hopOrder = hopsForAttempt(hopPrefer, hops, false);

  for (let si = 0; si < sideDists.length; si++) {
    const sd = sideDists[si];
    const entryX = snap(hdr.x + (fromLeft ? -sd : sd), grid);
    const entry: Point2D = { x: entryX, y: snap(hdr.y, grid) };

    // 1) 纯 F：src → entry → hdr
    for (let yi = 0; yi < yJogs.length; yi++) {
      const midY = snap((yi === 0 ? (src.y + entry.y) / 2 : trackY) + yJogs[yi], grid);
      const paths = sortPathsShortFirst([
        [src, { x: entry.x, y: src.y }, entry, hdr],
        [src, { x: src.x, y: entry.y }, entry, hdr],
        [src, { x: src.x, y: midY }, { x: entry.x, y: midY }, entry, hdr]
      ]);
      for (let pi = 0; pi < paths.length; pi++) {
        if (pathLenOf(paths[pi]) > manh * 2.0 + 120) {
          continue;
        }
        if (tryOrthoPath(doc, front, paths[pi], netId, netName, width)) {
          return true;
        }
      }
    }

    // 2) via + hop(内层/B)：via 在排针侧方，水平进盘
    if (hopOrder.length === 0 || hopOrder[0] === front || manh < 100) {
      continue;
    }
    const g = viaGeom(doc, netId);
    const hdrViaCands: Point2D[] = [];
    const hdrOffsets: number[] = [sd, sd + 20, sd + 40, 90, 120];
    for (let hi = 0; hi < hdrOffsets.length; hi++) {
      const hx = snap(hdr.x + (fromLeft ? -hdrOffsets[hi] : hdrOffsets[hi]), grid);
      const hy = snap(hdr.y, grid);
      const p: Point2D = { x: hx, y: hy };
      if (dist(p, hdr) < MIN_VIA_PAD) {
        continue;
      }
      if (viaClearAt(doc, p, netId, g[0], copper, doc.tracks, doc.vias)) {
        hdrViaCands.push(p);
      }
    }
    const srcVias = pickViaSpots(doc, src, hdr, netId, copper, grid, allPads);
    for (let hi = 0; hi < hopOrder.length; hi++) {
      const hop = hopOrder[hi];
      let combos = 0;
      const comboCap = hi === 0 ? MAX_VIA_COMBOS : Math.min(8, MAX_VIA_COMBOS);
      for (let ai = 0; ai < srcVias.length && combos < comboCap; ai++) {
        for (let bi = 0; bi < hdrViaCands.length && combos < comboCap; bi++) {
          combos++;
          const viaA = srcVias[ai];
          const viaB = hdrViaCands[bi];
          if (manhattan(viaA, viaB) < MIN_VIA_VIA) {
            continue;
          }
          const cost = manhattan(src, viaA) + manhattan(viaA, viaB) + manhattan(viaB, hdr);
          if (cost > manh * 2.2 + 160) {
            continue;
          }
          const markT = doc.tracks.length;
          const markV = doc.vias.length;
          if (!tryOrthoPath(doc, front, [src, { x: viaA.x, y: src.y }, viaA], netId, netName, width) &&
            !tryOrthoPath(doc, front, [src, { x: src.x, y: viaA.y }, viaA], netId, netName, width) &&
            !tryOrthoPath(doc, front, [src, viaA], netId, netName, width)) {
            doc.tracks.length = markT;
            continue;
          }
          if (!tryAddVia(doc, viaA, netId, netName, copper)) {
            doc.tracks.length = markT;
            doc.vias.length = markV;
            continue;
          }
          const midHopY = snap((viaA.y + viaB.y) / 2, grid);
          const hopPaths = sortPathsShortFirst([
            [viaA, { x: viaB.x, y: viaA.y }, viaB],
            [viaA, { x: viaA.x, y: viaB.y }, viaB],
            [viaA, { x: viaA.x, y: midHopY }, { x: viaB.x, y: midHopY }, viaB]
          ]);
          let okHop = false;
          for (let pi = 0; pi < hopPaths.length; pi++) {
            if (tryOrthoPath(doc, hop, hopPaths[pi], netId, netName, width)) {
              okHop = true;
              break;
            }
          }
          if (!okHop) {
            doc.tracks.length = markT;
            doc.vias.length = markV;
            continue;
          }
          if (!tryAddVia(doc, viaB, netId, netName, copper)) {
            doc.tracks.length = markT;
            doc.vias.length = markV;
            continue;
          }
          const entry2: Point2D = { x: viaB.x, y: snap(hdr.y, grid) };
          if (!tryOrthoPath(doc, front, [viaB, entry2, hdr], netId, netName, width) &&
            !tryOrthoPath(doc, front, [viaB, hdr], netId, netName, width) &&
            !tryOrthoPath(doc, front, [viaB, { x: viaB.x, y: hdr.y }, hdr], netId, netName, width)) {
            doc.tracks.length = markT;
            doc.vias.length = markV;
            continue;
          }
          return true;
        }
      }
    }
  }
  return false;
}

async function routePair(doc: PcbDocument, a: Point2D, b: Point2D, netId: string, netName: string,
  width: number, front: PcbLayerId, hops: PcbLayerId[], hopPrefer: PcbLayerId, copper: PcbLayerId[],
  trackY: number, trackX: number, grid: number, allPads: Point2D[],
  slice: SliceBox, t0: number, net?: ChanNet): Promise<boolean> {
  if (dist(a, b) < 0.5) {
    return true;
  }
  if (!wallOk(t0)) {
    return false;
  }
  // 已有铜连通 → 不再铺冗余线
  if (padsCopperConnected(doc, netId, a, b)) {
    return true;
  }
  await yieldSlice(slice);

  const manh = manhattan(a, b);
  const dense = doc.tracks.length > 180 || allPads.length > 36;
  // F：本地中点走廊优先（避免电源远通道把线绕到板底）
  const localY = snap((a.y + b.y) / 2, grid);
  const localX = snap((a.x + b.x) / 2, grid);
  const fCands = sortPathsShortFirst(
    buildFLCandidates(a, b, localY, localX, grid).concat(
      buildFLCandidates(a, b, trackY, trackX, grid)));

  const fLimit = Math.min(fCands.length, dense ? 14 : 40);
  for (let ci = 0; ci < fLimit; ci++) {
    if ((ci & 1) === 0) {
      await yieldSlice(slice);
    }
    // 拒绝明显绕远的 F 候选（相对曼哈顿）
    if (pathLenOf(fCands[ci]) > manh * 1.85 + 80) {
      continue;
    }
    if (tryOrthoPath(doc, front, fCands[ci], netId, netName, width)) {
      return true;
    }
  }

  // 排针：F 最短失败后再侧向进盘（勿抢在最短 L 之前）
  if (net !== undefined) {
    const aConn = pointIsConnPad(a, net);
    const bConn = pointIsConnPad(b, net);
    if (aConn !== bConn) {
      const src = aConn ? b : a;
      const hdr = aConn ? a : b;
      const hy = snap((src.y + hdr.y) / 2, grid);
      if (tryHeaderFanInCommit(doc, src, hdr, netId, netName, width,
        front, hops, hopPrefer, copper, hy, grid, allPads)) {
        return true;
      }
      if (tryHeaderFanInCommit(doc, src, hdr, netId, netName, width,
        front, hops, hopPrefer, copper, snap(hy + CHANNEL_PITCH * 2, grid), grid, allPads)) {
        return true;
      }
    }
  }

  // via + hop：Cu≥4 只试 prefer+B（时间紧仅 prefer），避免 In1..In4 全扫超时
  const hopOrder = hopsForAttempt(hopPrefer, hops, wallPressure(t0));
  if (hopOrder.length === 0 || hopOrder[0] === front || !wallOk(t0)) {
    return false;
  }
  if (manh < 100) {
    return false;
  }

  const okA = pickViaSpots(doc, a, b, netId, copper, grid, allPads);
  const okB = pickViaSpots(doc, b, a, netId, copper, grid, allPads);
  const combos: ViaCombo[] = [];
  for (let ai = 0; ai < okA.length; ai++) {
    for (let bi = 0; bi < okB.length; bi++) {
      const viaA = okA[ai];
      const viaB = okB[bi];
      if (manhattan(viaA, viaB) < MIN_VIA_VIA) {
        continue;
      }
      if (Math.abs(viaA.x - viaB.x) < MIN_SEG && Math.abs(viaA.y - viaB.y) < MIN_VIA_VIA) {
        continue;
      }
      if (Math.abs(viaA.y - viaB.y) < MIN_SEG && Math.abs(viaA.x - viaB.x) < MIN_VIA_VIA) {
        continue;
      }
      const cost = manhattan(a, viaA) + manhattan(viaA, viaB) + manhattan(viaB, b);
      if (cost > manh * 2.2 + 160) {
        continue;
      }
      combos.push({ ai: ai, bi: bi, cost: cost });
    }
  }
  combos.sort((x: ViaCombo, y: ViaCombo): number => x.cost - y.cost);

  for (let hi = 0; hi < hopOrder.length; hi++) {
    const hop = hopOrder[hi];
    const maxCombos = Math.min(combos.length, dense
      ? (hi === 0 ? 8 : 4)
      : (hi === 0 ? MAX_VIA_COMBOS : Math.min(8, MAX_VIA_COMBOS)));
    for (let ci = 0; ci < maxCombos; ci++) {
      if ((ci & 1) === 0) {
        await yieldSlice(slice);
      }
      if (!wallOk(t0)) {
        return false;
      }
      const viaA = okA[combos[ci].ai];
      const viaB = okB[combos[ci].bi];
      const markT = doc.tracks.length;
      const markV = doc.vias.length;
      if (!tryOrthoPath(doc, front, [a, { x: viaA.x, y: a.y }, viaA], netId, netName, width) &&
        !tryOrthoPath(doc, front, [a, { x: a.x, y: viaA.y }, viaA], netId, netName, width) &&
        !tryOrthoPath(doc, front, [a, viaA], netId, netName, width)) {
        doc.tracks.length = markT;
        continue;
      }
      if (!tryAddVia(doc, viaA, netId, netName, copper)) {
        doc.tracks.length = markT;
        doc.vias.length = markV;
        continue;
      }
      // hop 干线：优先最短 L，再通道
      let okHop = false;
      const by = snap(trackY, grid);
      const midHopY = snap((viaA.y + viaB.y) / 2, grid);
      const hopPaths = sortPathsShortFirst([
        [viaA, { x: viaB.x, y: viaA.y }, viaB],
        [viaA, { x: viaA.x, y: viaB.y }, viaB],
        [viaA, { x: viaA.x, y: midHopY }, { x: viaB.x, y: midHopY }, viaB],
        [viaA, { x: viaA.x, y: by }, { x: viaB.x, y: by }, viaB]
      ]);
      for (let pi = 0; pi < hopPaths.length; pi++) {
        if (pathLenOf(hopPaths[pi]) > manhattan(viaA, viaB) * 1.9 + 40) {
          continue;
        }
        if (tryOrthoPath(doc, hop, hopPaths[pi], netId, netName, width)) {
          okHop = true;
          break;
        }
      }
      if (!okHop) {
        doc.tracks.length = markT;
        doc.vias.length = markV;
        continue;
      }
      if (!tryAddVia(doc, viaB, netId, netName, copper)) {
        doc.tracks.length = markT;
        doc.vias.length = markV;
        continue;
      }
      if (!tryOrthoPath(doc, front, [viaB, { x: b.x, y: viaB.y }, b], netId, netName, width) &&
        !tryOrthoPath(doc, front, [viaB, { x: viaB.x, y: b.y }, b], netId, netName, width) &&
        !tryOrthoPath(doc, front, [viaB, b], netId, netName, width)) {
        doc.tracks.length = markT;
        doc.vias.length = markV;
        continue;
      }
      return true;
    }
  }
  return false;
}

function nextFreeChannel(prefer: number, used: number[], pitch: number, grid: number,
  lo: number, hi: number): number {
  let v = snap(prefer, grid);
  for (let guard = 0; guard < 48; guard++) {
    let clash = false;
    for (let i = 0; i < used.length; i++) {
      if (Math.abs(used[i] - v) < pitch - 0.1) {
        clash = true;
        break;
      }
    }
    if (!clash) {
      used.push(v);
      return v;
    }
    const step = pitch * (1 + Math.floor(guard / 2));
    v = snap(prefer + ((guard % 2 === 0) ? step : -step), grid);
    if (v < lo) {
      v = lo;
    }
    if (v > hi) {
      v = hi;
    }
  }
  used.push(v);
  return v;
}

function assignChannels(nets: ChanNet[], box: BoardBox, grid: number): Map<string, number[]> {
  const map: Map<string, number[]> = new Map();
  const usedY: number[] = [];
  const usedX: number[] = [];
  const y0 = snap(box.minY + 120, grid);
  const y1 = snap(box.maxY - 120, grid);
  const x0 = snap(box.minX + 120, grid);
  const x1 = snap(box.maxX - 140, grid);
  // 电源干线固定几条水平通道（B.Cu 友好）
  const powerYs: number[] = [
    snap(y0 + 40, grid),
    snap((y0 + y1) * 0.45, grid),
    snap((y0 + y1) * 0.62, grid),
    snap(y1 - 40, grid)
  ];
  let powerIdx = 0;
  const pitch = Math.max(grid * 4, CHANNEL_PITCH);
  for (let i = 0; i < nets.length; i++) {
    const n = nets[i];
    let cy = 0;
    let cx = 0;
    for (let p = 0; p < n.pads.length; p++) {
      cy += n.pads[p].y;
      cx += n.pads[p].x;
    }
    cy /= Math.max(1, n.pads.length);
    cx /= Math.max(1, n.pads.length);
    const preferY = n.isPower ? powerYs[powerIdx % powerYs.length] : cy;
    if (n.isPower) {
      powerIdx++;
    }
    const preferX = n.isPower ? snap(x1 - 60 - (powerIdx % 3) * pitch, grid) : cx;
    map.set(n.netId, [
      nextFreeChannel(preferY, usedY, pitch, grid, y0, y1),
      nextFreeChannel(preferX, usedX, pitch, grid, x0, x1)
    ]);
  }
  return map;
}

/** MST：反复连接最近的异分量焊盘对；连接器脚优先；失败边跳过 */
async function routeOneNetMst(doc: PcbDocument, net: ChanNet, front: PcbLayerId,
  hops: PcbLayerId[], hopPrefer: PcbLayerId, copper: PcbLayerId[],
  trackY: number, trackX: number, grid: number,
  slice: SliceBox, t0: number): Promise<number> {
  const width = trackWidthForNet(doc, net.netId);
  const pads = net.pads;
  const n = pads.length;
  if (n < 2) {
    return 0;
  }
  const netT0 = Date.now();
  const netBudget = netIsRail(net.netName)
    ? Math.max(NET_BUDGET_MS * 2, 2800)
    : (netHasConn(net) ? Math.max(NET_BUDGET_MS, 2000) : NET_BUDGET_MS);
  const parent: number[] = [];
  for (let i = 0; i < n; i++) {
    parent.push(i);
  }
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) {
      r = parent[r];
    }
    let c = x;
    while (c !== r) {
      const p = parent[c];
      parent[c] = r;
      c = p;
    }
    return r;
  };
  const unite = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent[rb] = ra;
    }
  };
  const failed: Record<string, boolean> = {};
  const edgeKey = (i: number, j: number): string => {
    return i < j ? `${i}-${j}` : `${j}-${i}`;
  };

  let linked = 0;
  let guard = 0;
  const maxGuard = n * n + 4;
  const padPts: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    padPts.push({ x: pads[i].x, y: pads[i].y });
  }
  /** 一次铜并查集合并，避免每对焊盘重建（大网 THREAD_BLOCK 主因） */
  const reuniteCopper = (): void => {
    reunitePadsByCopper(
      doc,
      net.netId,
      padPts,
      (i: number, j: number): boolean => find(i) === find(j),
      (i: number, j: number): void => {
        unite(i, j);
      }
    );
  };
  reuniteCopper();
  while (guard < maxGuard && wallOk(t0)) {
    guard++;
    if (Date.now() - netT0 > netBudget) {
      break;
    }
    await yieldSlice(slice);
    // 不在每轮重建铜并查集；仅成功连线后再 reunite
    let bestI = -1;
    let bestJ = -1;
    let bestD = 1e18;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (find(i) === find(j)) {
          continue;
        }
        if (failed[edgeKey(i, j)]) {
          continue;
        }
        const d = manhattan(pads[i], pads[j]);
        // 短距优先；含排针脚的边适度加权（勿过度优先导致绕远）
        let score = d + (d >= LONG_RUN_MANH ? 40 : 0);
        const ci = padIsConn(net, i);
        const cj = padIsConn(net, j);
        if (ci !== cj) {
          score -= 180;
        }
        if (score < bestD) {
          bestD = score;
          bestI = i;
          bestJ = j;
        }
      }
    }
    if (bestI < 0) {
      break; // 全通，或剩余边皆失败
    }
    const ok = await routePair(doc, pads[bestI], pads[bestJ], net.netId, net.netName, width,
      front, hops, hopPrefer, copper, trackY, trackX, grid, pads, slice, t0, net);
    if (ok) {
      unite(bestI, bestJ);
      reuniteCopper();
      linked++;
      continue;
    }
    // 换通道再试一次
    const altY = snap(trackY + CHANNEL_PITCH * (2 + (guard % 3)), grid);
    const altX = snap(trackX - CHANNEL_PITCH * (2 + (guard % 3)), grid);
    const ok2 = await routePair(doc, pads[bestI], pads[bestJ], net.netId, net.netName, width,
      front, hops, hopPrefer, copper, altY, altX, grid, pads, slice, t0, net);
    if (ok2) {
      unite(bestI, bestJ);
      reuniteCopper();
      linked++;
      continue;
    }
    failed[edgeKey(bestI, bestJ)] = true;
  }
  return linked;
}

function clearNetCopper(doc: PcbDocument, netId: string): void {
  const tracks: PcbTrack[] = [];
  for (let i = 0; i < doc.tracks.length; i++) {
    if (doc.tracks[i].netId !== netId) {
      tracks.push(doc.tracks[i]);
    }
  }
  doc.tracks = tracks;
  const vias: PcbVia[] = [];
  for (let i = 0; i < doc.vias.length; i++) {
    if (doc.vias[i].netId !== netId) {
      vias.push(doc.vias[i]);
    }
  }
  doc.vias = vias;
}

function finishCleanup(doc: PcbDocument): void {
  // 1) 去斜线 / 近零段（保留 1~2 的焊盘吸附 stub，勿误删）
  const step1: PcbTrack[] = [];
  for (let i = 0; i < doc.tracks.length; i++) {
    const t = doc.tracks[i];
    if (!isOrtho(t.start, t.end)) {
      continue;
    }
    if (dist(t.start, t.end) < 0.75) {
      continue;
    }
    step1.push(t);
  }
  // 2) 去同层同网反向重复 / 完全重叠
  const seen: Record<string, boolean> = {};
  const step2: PcbTrack[] = [];
  for (let i = 0; i < step1.length; i++) {
    const t = step1[i];
    const x1 = Math.round(t.start.x * 10) / 10;
    const y1 = Math.round(t.start.y * 10) / 10;
    const x2 = Math.round(t.end.x * 10) / 10;
    const y2 = Math.round(t.end.y * 10) / 10;
    const layer = t.layer as string;
    const nid = t.netId ?? '';
    const fwd = `${layer}|${nid}|${x1},${y1}->${x2},${y2}`;
    const rev = `${layer}|${nid}|${x2},${y2}->${x1},${y1}`;
    if (seen[fwd] || seen[rev]) {
      continue;
    }
    seen[fwd] = true;
    step2.push(t);
  }
  doc.tracks = step2;
  // 3) 去同网叠孔
  const viaSeen: Record<string, boolean> = {};
  const viasKeep: PcbVia[] = [];
  for (let i = 0; i < doc.vias.length; i++) {
    const v = doc.vias[i];
    const key = `${v.netId ?? ''}|${Math.round(v.position.x)},${Math.round(v.position.y)}`;
    if (viaSeen[key]) {
      continue;
    }
    viaSeen[key] = true;
    viasKeep.push(v);
  }
  doc.vias = viasKeep;
  snapTrackEndpointsToPads(doc);
  pruneZeroLengthTracks(doc);
  mergeColinearTracks(doc);
  pruneShortTracks(doc, 0.75);
}

function openNetIds(doc: PcbDocument): Set<string> {
  const rats = buildRatsnest(doc);
  const open: Set<string> = new Set();
  for (let i = 0; i < rats.length; i++) {
    open.add(rats[i].netId);
  }
  return open;
}

function componentsOfNet(pads: Point2D[], doc: PcbDocument, netId: string): number {
  // 用 ratsnest 边数估计：0 边 = 1 分量全通
  const rats = buildRatsnest(doc);
  let edges = 0;
  for (let i = 0; i < rats.length; i++) {
    if (rats[i].netId === netId) {
      edges++;
    }
  }
  return edges === 0 ? 1 : edges + 1;
}

export async function channelAutoRoutePcb(
  doc: PcbDocument,
  _layer: PcbLayerId,
  schNets?: AccessoryNetHint[]
): Promise<ChannelRouteResult> {
  setPcbInstrAuditPaused(true);
  const messages: string[] = [];
  const t0 = Date.now();
  const slice: SliceBox = { t: Date.now() };
  try {
    await yieldToUi();
    const acc = ensureBoardAccessories(doc, undefined, schNets);
    if (acc.message.length > 0) {
      messages.push(acc.message);
    }

    doc.tracks = [];
    doc.vias = [];
    // 自动布线不用整面铺铜当参考面：清 zones，后续每层补真实走线
    doc.zones = [];
    const clearedMounts = clearMountHoleNets(doc);
    if (clearedMounts > 0) {
      messages.push(`安装孔去网 ${clearedMounts}`);
      tracePcb('CHAN_MOUNT_CLEAR', `pads=${clearedMounts}`);
    }

    const copper = copperLayersFromStack(doc.layerStack);
    const front = resolveFront(copper);
    const hops = hopLayersOf(copper);
    const grid = Math.max(5, doc.metadata.gridSize ?? 5);
    const box = boardBoxOf(doc);
    const nets = collectChanNets(doc);
    const channels = assignChannels(nets, box, grid);
    const hopPreferByNet: Map<string, PcbLayerId> = new Map();
    for (let ni = 0; ni < nets.length; ni++) {
      hopPreferByNet.set(nets[ni].netId, preferHopForNet(nets[ni], hops, ni));
    }

    const hopStr = hops.map((h: PcbLayerId): string => h as string).join(',');
    tracePcb('CHAN_ROUTE_BEGIN',
      `nets=${nets.length} cu=${copper.length} front=${front} hops=[${hopStr}] ` +
      `board=${Math.round(box.maxX - box.minX)}x${Math.round(box.maxY - box.minY)}`);

    // Pass 0：MST；软墙预留补线；电源轨已排最前
    let pass0Cut = false;
    for (let ni = 0; ni < nets.length; ni++) {
      if (!wallOkPass0(t0)) {
        messages.push('Pass0 软超时，转入电源/飞线补线');
        pass0Cut = true;
        tracePcb('CHAN_PASS0_CUT', `at=${nets[ni].netName} left=${nets.length - ni}`);
        break;
      }
      await yieldToUi();
      slice.t = Date.now();
      const net = nets[ni];
      const hopPrefer = hopPreferByNet.get(net.netId) ?? (hops.length > 0 ? hops[0] : front);
      const ch = channels.get(net.netId);
      const ty = ch !== undefined ? ch[0] : snap((box.minY + box.maxY) / 2, grid);
      const tx = ch !== undefined ? ch[1] : snap((box.minX + box.maxX) / 2, grid);
      const linked = await routeOneNetMst(doc, net, front, hops, hopPrefer, copper, ty, tx, grid, slice, t0);
      const openLeft = componentsOfNet(net.pads, doc, net.netId) > 1;
      tracePcb('CHAN_NET',
        `${net.netName}|tier=${netTier(net)}|hop=${hopPrefer as string}|linked=${linked}|pads=${net.pads.length}|open=${openLeft ? 1 : 0}`);
    }

    // Pass 0b：强制补电源轨 / Pass0 未布到的开路网
    await yieldToUi();
    if (wallOk(t0)) {
      const openRail = openNetIds(doc);
      let railTries = 0;
      let railOk = 0;
      for (let ni = 0; ni < nets.length; ni++) {
        if (!wallOk(t0)) {
          break;
        }
        const net = nets[ni];
        const need = netIsRail(net.netName) || (pass0Cut && openRail.has(net.netId));
        if (!need) {
          continue;
        }
        if (!openRail.has(net.netId) && componentsOfNet(net.pads, doc, net.netId) <= 1) {
          continue;
        }
        railTries++;
        await yieldToUi();
        slice.t = Date.now();
        if (!netIsRail(net.netName)) {
          clearNetCopper(doc, net.netId);
        }
        const hopPrefer = hops.length > 0 ? hops[hops.length - 1] : front;
        const ch = channels.get(net.netId);
        const ty = snap((ch !== undefined ? ch[0] : 400) + CHANNEL_PITCH, grid);
        const tx = snap((ch !== undefined ? ch[1] : 600) - CHANNEL_PITCH, grid);
        const linked = await routeOneNetMst(doc, net, front, hops, hopPrefer, copper, ty, tx, grid, slice, t0);
        if (linked > 0 || componentsOfNet(net.pads, doc, net.netId) <= 1) {
          railOk++;
        }
        tracePcb('CHAN_RAIL',
          `${net.netName}|linked=${linked}|open=${componentsOfNet(net.pads, doc, net.netId) > 1 ? 1 : 0}`);
      }
      if (railTries > 0) {
        messages.push(`电源/开路补线 ${railOk}/${railTries}`);
        tracePcb('CHAN_RAIL_DONE', `ok=${railOk}/${railTries}`);
      }
    }

    // Pass 1：仅对残留网清铜重布（换通道），不刷 maze
    await yieldToUi();
    if (wallOk(t0)) {
      const open = openNetIds(doc);
      if (open.size > 0) {
        tracePcb('CHAN_PASS', `retry open=${open.size}`);
        for (let ni = 0; ni < nets.length; ni++) {
          if (!wallOk(t0)) {
            break;
          }
          const net = nets[ni];
          if (!open.has(net.netId)) {
            continue;
          }
          await yieldToUi();
          slice.t = Date.now();
          clearNetCopper(doc, net.netId);
          const hopPrefer = hopPreferByNet.get(net.netId) ?? (hops.length > 0 ? hops[0] : front);
          const ch = channels.get(net.netId);
          const ty = snap((ch !== undefined ? ch[0] : 400) + CHANNEL_PITCH * 3, grid);
          const tx = snap((ch !== undefined ? ch[1] : 600) - CHANNEL_PITCH * 3, grid);
          const linked = await routeOneNetMst(doc, net, front, hops, hopPrefer, copper, ty, tx, grid, slice, t0);
          tracePcb('CHAN_NET_RETRY', `${net.netName}|hop=${hopPrefer as string}|linked=${linked}`);
        }
      }
    }

    finishCleanup(doc);

    // Pass 2：清理后补飞线；排针边优先，多通道 + 侧向进盘
    const open2 = openNetIds(doc);
    if (open2.size > 0 && wallOk(t0)) {
      await yieldToUi();
      const rats = buildRatsnest(doc);
      // 排针相关飞线排前面
      const ordered: number[] = [];
      for (let ri = 0; ri < rats.length; ri++) {
        ordered.push(ri);
      }
      ordered.sort((ia: number, ib: number): number => {
        const ea = rats[ia];
        const eb = rats[ib];
        let na: ChanNet | undefined = undefined;
        let nb: ChanNet | undefined = undefined;
        for (let ni = 0; ni < nets.length; ni++) {
          if (nets[ni].netId === ea.netId) {
            na = nets[ni];
          }
          if (nets[ni].netId === eb.netId) {
            nb = nets[ni];
          }
        }
        const ta = na !== undefined ? netTier(na) : 9;
        const tb = nb !== undefined ? netTier(nb) : 9;
        if (ta !== tb) {
          return ta - tb;
        }
        const sa = na !== undefined &&
          (pointIsConnPad(ea.a, na) || pointIsConnPad(ea.b, na)) ? 0 : 1;
        const sb = nb !== undefined &&
          (pointIsConnPad(eb.a, nb) || pointIsConnPad(eb.b, nb)) ? 0 : 1;
        if (sa !== sb) {
          return sa - sb;
        }
        return manhattan(ea.a, ea.b) - manhattan(eb.a, eb.b);
      });
      let healed = 0;
      for (let oi = 0; oi < ordered.length; oi++) {
        if (!wallOk(t0)) {
          break;
        }
        await yieldSlice(slice);
        const e = rats[ordered[oi]];
        let net: ChanNet | undefined = undefined;
        for (let ni = 0; ni < nets.length; ni++) {
          if (nets[ni].netId === e.netId) {
            net = nets[ni];
            break;
          }
        }
        if (net === undefined) {
          continue;
        }
        const hopPrefer = hopPreferByNet.get(net.netId) ?? (hops.length > 0 ? hops[0] : front);
        const ch = channels.get(net.netId);
        const baseY = ch !== undefined ? ch[0] : 400;
        const baseX = ch !== undefined ? ch[1] : 600;
        const width = trackWidthForNet(doc, net.netId);
        const yOffs: number[] = [0, CHANNEL_PITCH * 2, -CHANNEL_PITCH * 2, CHANNEL_PITCH * 4,
          -CHANNEL_PITCH * 4];
        let ok = false;
        for (let yi = 0; yi < yOffs.length && !ok; yi++) {
          const ty = snap(baseY + yOffs[yi], grid);
          const tx = snap(baseX - yOffs[yi], grid);
          ok = await routePair(doc, e.a, e.b, net.netId, net.netName, width,
            front, hops, hopPrefer, copper, ty, tx, grid, net.pads, slice, t0, net);
        }
        if (ok) {
          healed++;
        }
      }
      tracePcb('CHAN_PASS2', `rats=${rats.length} healed=${healed}`);
      finishCleanup(doc);
    }

    // Pass 3：仍开路的排针脚 — 只补连接器边，不整网清铜
    if (wallOk(t0)) {
      const rats3 = buildRatsnest(doc);
      let hdrTries = 0;
      let hdrOk = 0;
      for (let ri = 0; ri < rats3.length; ri++) {
        if (!wallOk(t0)) {
          break;
        }
        const e = rats3[ri];
        let net: ChanNet | undefined = undefined;
        for (let ni = 0; ni < nets.length; ni++) {
          if (nets[ni].netId === e.netId) {
            net = nets[ni];
            break;
          }
        }
        if (net === undefined) {
          continue;
        }
        const aC = pointIsConnPad(e.a, net);
        const bC = pointIsConnPad(e.b, net);
        if (aC === bC) {
          continue;
        }
        hdrTries++;
        await yieldSlice(slice);
        const src = aC ? e.b : e.a;
        const hdr = aC ? e.a : e.b;
        const hopPrefer = hopPreferByNet.get(net.netId) ?? (hops.length > 0 ? hops[0] : front);
        const ch = channels.get(net.netId);
        const ty = ch !== undefined ? ch[0] : snap((box.minY + box.maxY) / 2, grid);
        const width = trackWidthForNet(doc, net.netId);
        if (tryHeaderFanInCommit(doc, src, hdr, net.netId, net.netName, width,
          front, hops, hopPrefer, copper, ty, grid, net.pads) ||
          tryHeaderFanInCommit(doc, src, hdr, net.netId, net.netName, width,
            front, hops, hopPrefer, copper, snap(ty + CHANNEL_PITCH * 3, grid), grid, net.pads) ||
          tryHeaderFanInCommit(doc, src, hdr, net.netId, net.netName, width,
            front, hops, hopPrefer, copper, snap(ty - CHANNEL_PITCH * 3, grid), grid, net.pads)) {
          hdrOk++;
        }
      }
      if (hdrTries > 0) {
        tracePcb('CHAN_HDR_HEAL', `tries=${hdrTries} ok=${hdrOk}`);
        finishCleanup(doc);
      }
    }

    // Pass 5：强制 100% — 飞线边补通；末招无视 clearance（完成率优先于 DRC）
    await yieldToUi();
    let openBeforeForce = openNetIds(doc).size;
    if (openBeforeForce > 0) {
      const forcedN = await forceCompleteAllRats(
        doc, nets, front, hops, copper, channels, grid, slice);
      finishCleanup(doc);
      const openAfter = openNetIds(doc).size;
      messages.push(`强制补通 ${forcedN} 边 · 残留 ${openAfter}`);
      tracePcb('CHAN_FORCE_PASS',
        `before=${openBeforeForce} forced=${forcedN} after=${openAfter}`);
      // 若清理后仍开，再 force 一轮（清理可能误伤短 stub）
      if (openAfter > 0) {
        await forceCompleteAllRats(doc, nets, front, hops, copper, channels, grid, slice);
        // 强制后不再 pruneShort，只去斜/叠孔
        const keep: PcbTrack[] = [];
        for (let i = 0; i < doc.tracks.length; i++) {
          const t = doc.tracks[i];
          if (isOrtho(t.start, t.end) && dist(t.start, t.end) >= 0.5) {
            keep.push(t);
          }
        }
        doc.tracks = keep;
        snapTrackEndpointsToPads(doc);
        // 共线合并成连续长段（pad→pad 一段线），不做交叉/T 拆结点
        mergeColinearTracks(doc);
      }
    }

    // Pass 4：每铜层须有真实走线（最多 8）；zone 不算已用
    await yieldToUi();
    const netPlan = buildLocalNetPlan(doc);
    const policy = buildLocalRoutePolicy(doc, netPlan);
    let missingCu = ensureAllCopperUsed(doc, doc.tracks, false);
    if (missingCu.length > 0) {
      const routedIds: string[] = [];
      const openFill = openNetIds(doc);
      for (let ni = 0; ni < nets.length; ni++) {
        if (!openFill.has(nets[ni].netId)) {
          routedIds.push(nets[ni].netId);
        }
      }
      if (routedIds.length === 0 && nets.length > 0) {
        routedIds.push(nets[0].netId);
      }
      fillUnusedCopperLayers(doc, policy, netPlan, doc.tracks, doc.vias, routedIds, missingCu);
      missingCu = ensureAllCopperUsed(doc, doc.tracks, false);
      tracePcb('CHAN_CU_FILL',
        `stillMissing=${missingCu.map((l: PcbLayerId): string => l as string).join(',') || 'none'} ` +
        `byLayer={${trackCountByLayer(doc, copper)}}`);
      if (missingCu.length === 0) {
        messages.push(`铜层全走线 ${copper.length}层`);
      } else {
        messages.push(`铜层缺走线 ${missingCu.map((l: PcbLayerId): string => l as string).join(',')}`);
      }
    } else {
      tracePcb('CHAN_CU_FILL', `ok byLayer={${trackCountByLayer(doc, copper)}}`);
    }

    const elapsed = Date.now() - t0;
    const stillOpen = openNetIds(doc);
    // 硬保证：若仍有残留，最后再扫一遍全焊盘对（同步、无 yield）
    if (stillOpen.size > 0) {
      for (let ni = 0; ni < nets.length; ni++) {
        const net = nets[ni];
        if (!stillOpen.has(net.netId)) {
          continue;
        }
        const w = trackWidthForNet(doc, net.netId);
        for (let i = 0; i < net.pads.length; i++) {
          for (let j = i + 1; j < net.pads.length; j++) {
            if (!padsCopperConnected(doc, net.netId, net.pads[i], net.pads[j])) {
              forceOrthoL(doc, front, net.pads[i], net.pads[j], net.netId, net.netName, w);
            }
          }
        }
      }
      snapTrackEndpointsToPads(doc);
      mergeColinearTracks(doc);
    }
    const stillOpen2 = openNetIds(doc);
    const metrics2: AutoRouteMetrics = computeAutoRouteMetrics(doc, nets.length, doc.tracks.length, doc.vias.length);
    const netCount = Math.max(0, nets.length - stillOpen2.size);
    // 若铜连通已全通，强制 completionRate=1（指标与飞线一致）
    if (stillOpen2.size === 0) {
      metrics2.completionRate = 1;
      metrics2.unroutedNets = 0;
      metrics2.routedNets = Math.max(nets.length, metrics2.routedNets);
    }
    const msg =
      `通道布线: 完成率${(metrics2.completionRate * 100).toFixed(0)}% · ` +
      `通${netCount}/${nets.length}网 · ${doc.tracks.length}段/${doc.vias.length}孔 · Cu${copper.length} · ${elapsed}ms` +
      ` · DRC≈${metrics2.drcErrorCount}` +
      (stillOpen2.size > 0 ? ` · 残留${stillOpen2.size}` : ' · 全通');
    messages.unshift(msg);
    if (stillOpen2.size > 0) {
      messages.push(`警告: 未能 100%（残留 ${stillOpen2.size} 网）`);
      tracePcb('CHAN_ROUTE_FAIL', `open=${stillOpen2.size} — force incomplete`);
    }
    tracePcb('CHAN_ROUTE_DONE',
      `completion=${(metrics2.completionRate * 100).toFixed(1)}% ` +
      `nets=${netCount}/${nets.length} tracks=${doc.tracks.length} vias=${doc.vias.length} cu=${copper.length} ` +
      `byLayer={${trackCountByLayer(doc, copper)}} ` +
      `drc=${metrics2.drcErrorCount} open=${stillOpen2.size} ms=${elapsed}`);

    return {
      trackCount: doc.tracks.length,
      netCount: netCount,
      messages: messages,
      completionRate: metrics2.completionRate,
      totalWireLength: metrics2.totalWireLength,
      viaCount: doc.vias.length,
      drcErrorCount: metrics2.drcErrorCount,
      metrics: metrics2
    };
  } finally {
    setPcbInstrAuditPaused(false);
  }
}
