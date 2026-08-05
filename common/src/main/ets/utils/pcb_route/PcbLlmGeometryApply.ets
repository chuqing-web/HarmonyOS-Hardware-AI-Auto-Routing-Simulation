/**
 * 将 LLM 折线/过孔落到板铜：正交化、clearance、焊盘连通性门禁
 * 本地不自创折点策略；orphan 铜不记为 routed。
 */
import {
  PcbDocument, PcbFootprintInst, PcbLayerId, PcbTrack, PcbVia,
  copperLayersFromStack, isCopperLayer
} from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';
import {
  PcbGeometryResult, PcbGeoFailDetail, PcbLlmGeometryPlan, PcbRoutePolicy,
  PcbNetPlanResult
} from '../../types/PcbAiRouteTypes';
import { IdUtil } from '../IdUtil';
import { pathClearBlockReason, trackWidthForNet, viaClearAt } from './PcbClearanceOracle';
import { createViaAt } from './PcbViaFactory';
import { ensureAllCopperUsed, fillUnusedCopperLayers } from './ensureAllCopperUsed';
import { padWorldPosition } from '../PcbZoneUtil';
import { tracePcb, tracePcbWarn } from '../PcbTraceLog';

const PAD_HIT_MIL: number = 35;

function dist(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function setToArray(s: Set<string>): string[] {
  const out: string[] = [];
  s.forEach((v: string) => {
    out.push(v);
  });
  return out;
}

function isMountFootprint(fp: PcbFootprintInst): boolean {
  return fp.defId === 'FP_MOUNT' ||
    (fp.refDes.length >= 2 && fp.refDes.charAt(0) === 'H' &&
      (fp.refDes.charAt(1) >= '0' && fp.refDes.charAt(1) <= '9'));
}

function isConnectorFootprint(fp: PcbFootprintInst): boolean {
  const r = fp.refDes;
  return (r.length >= 2 && r.charAt(0) === 'J' && r.charAt(1) >= '0' && r.charAt(1) <= '9') ||
    (r.length >= 2 && r.charAt(0) === 'P' && r.charAt(1) >= '0' && r.charAt(1) <= '9') ||
    fp.defId.indexOf('CONN') >= 0 || fp.defId.indexOf('HEADER') >= 0;
}

function parseLayer(s: string, copper: PcbLayerId[]): PcbLayerId | null {
  const t = (s ?? '').trim();
  if (t.length === 0) {
    return null;
  }
  for (let i = 0; i < copper.length; i++) {
    if ((copper[i] as string) === t || (copper[i] as string).toLowerCase() === t.toLowerCase()) {
      return copper[i];
    }
  }
  const low = t.toLowerCase();
  if (low === 'f' || low === 'front' || low === 'top') {
    return PcbLayerId.F_CU;
  }
  if (low === 'b' || low === 'back' || low === 'bottom') {
    return PcbLayerId.B_CU;
  }
  return null;
}

interface ResolvedNetRef {
  id: string;
  name: string;
}

function resolveNet(doc: PcbDocument, netId: string, netName: string): ResolvedNetRef | null {
  for (let i = 0; i < doc.nets.length; i++) {
    const n = doc.nets[i];
    if ((netId.length > 0 && n.id === netId) || (netName.length > 0 && n.name === netName)) {
      const ref: ResolvedNetRef = { id: n.id, name: n.name };
      return ref;
    }
    if (netId.length > 0 && n.name === netId) {
      const ref: ResolvedNetRef = { id: n.id, name: n.name };
      return ref;
    }
  }
  return null;
}

/** 非正交边拆成 L（先 H 后 V） */
export function expandOrthoPoints(points: Point2D[]): Point2D[] {
  if (points.length < 2) {
    return points.slice();
  }
  const out: Point2D[] = [{ x: points[0].x, y: points[0].y }];
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1];
    const cur = points[i];
    if (dist(prev, cur) < 0.5) {
      continue;
    }
    const horiz = Math.abs(prev.y - cur.y) < 0.5;
    const vert = Math.abs(prev.x - cur.x) < 0.5;
    if (horiz || vert) {
      out.push({ x: cur.x, y: cur.y });
    } else {
      out.push({ x: cur.x, y: prev.y });
      out.push({ x: cur.x, y: cur.y });
    }
  }
  return out;
}

interface NetPadBuckets {
  functional: Point2D[];
  connectors: Point2D[];
  mounts: Point2D[];
}

function collectNetPads(doc: PcbDocument, netId: string): NetPadBuckets {
  const functional: Point2D[] = [];
  const connectors: Point2D[] = [];
  const mounts: Point2D[] = [];
  for (const fp of doc.footprints) {
    const mount = isMountFootprint(fp);
    const connector = isConnectorFootprint(fp);
    for (const pad of fp.pads) {
      if ((pad.netId ?? '') === netId) {
        const w = padWorldPosition(fp, pad);
        if (mount) {
          mounts.push(w);
        } else if (connector) {
          connectors.push(w);
        } else {
          functional.push(w);
        }
      }
    }
  }
  return { functional, connectors, mounts };
}

/** 强制连通焊盘：功能焊盘；不足时并入连接器；安装孔不强制 */
function mandatoryPads(bucket: NetPadBuckets): Point2D[] {
  if (bucket.functional.length >= 2) {
    return bucket.functional.slice();
  }
  const core = bucket.functional.concat(bucket.connectors);
  return core;
}

class Uf {
  parent: number[] = [];

  ensure(n: number): void {
    while (this.parent.length < n) {
      this.parent.push(this.parent.length);
    }
  }

  find(i: number): number {
    let p = i;
    while (this.parent[p] !== p) {
      p = this.parent[p];
    }
    let x = i;
    while (this.parent[x] !== x) {
      const n = this.parent[x];
      this.parent[x] = p;
      x = n;
    }
    return p;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) {
      this.parent[rb] = ra;
    }
  }
}

function distPointSeg(p: Point2D, a: Point2D, b: Point2D): number {
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
 * 同网铜是否把强制焊盘连成一块（tracks 端点/via/线段中部触达焊盘）
 */
export function netCopperConnectsPads(
  doc: PcbDocument,
  netId: string,
  tracks: PcbTrack[],
  vias: PcbVia[],
  hitMil: number = PAD_HIT_MIL
): boolean {
  const bucket = collectNetPads(doc, netId);
  const pads = mandatoryPads(bucket);
  if (pads.length < 2) {
    return true;
  }

  const nodes: Point2D[] = [];
  for (let i = 0; i < pads.length; i++) {
    nodes.push(pads[i]);
  }
  const padCount = pads.length;

  for (let i = 0; i < vias.length; i++) {
    if (vias[i].netId === netId) {
      nodes.push({ x: vias[i].position.x, y: vias[i].position.y });
    }
  }

  const trackPairStarts: number[] = [];
  const netTracks: PcbTrack[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (t.netId !== netId) {
      continue;
    }
    trackPairStarts.push(nodes.length);
    netTracks.push(t);
    nodes.push({ x: t.start.x, y: t.start.y });
    nodes.push({ x: t.end.x, y: t.end.y });
  }

  if (nodes.length < 2) {
    return false;
  }

  const uf = new Uf();
  uf.ensure(nodes.length);

  for (let i = 0; i < trackPairStarts.length; i++) {
    const s = trackPairStarts[i];
    uf.union(s, s + 1);
  }

  // 近距离节点并查集（焊盘↔铜、via↔track、track↔track）
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const lim = (i < padCount || j < padCount) ? hitMil : 1.0;
      if (dist(nodes[i], nodes[j]) <= lim) {
        uf.union(i, j);
      }
    }
  }

  // 焊盘落在线段中部 / 靠近 via 也算连通；T 接：端点落在他段中部
  for (let pi = 0; pi < padCount; pi++) {
    for (let ti = 0; ti < netTracks.length; ti++) {
      const t = netTracks[ti];
      if (distPointSeg(pads[pi], t.start, t.end) <= hitMil) {
        uf.union(pi, trackPairStarts[ti]);
      }
    }
    let viaNode = padCount;
    for (let vi = 0; vi < vias.length; vi++) {
      if (vias[vi].netId !== netId) {
        continue;
      }
      if (dist(pads[pi], vias[vi].position) <= hitMil) {
        uf.union(pi, viaNode);
      }
      viaNode++;
    }
  }
  for (let ti = 0; ti < netTracks.length; ti++) {
    const t = netTracks[ti];
    const sIdx = trackPairStarts[ti];
    for (let tj = 0; tj < netTracks.length; tj++) {
      if (ti === tj) {
        continue;
      }
      const o = netTracks[tj];
      if (distPointSeg(t.start, o.start, o.end) <= 1.0 ||
        distPointSeg(t.end, o.start, o.end) <= 1.0) {
        uf.union(sIdx, trackPairStarts[tj]);
      }
    }
    let viaNode = padCount;
    for (let vi = 0; vi < vias.length; vi++) {
      if (vias[vi].netId !== netId) {
        continue;
      }
      if (distPointSeg(vias[vi].position, t.start, t.end) <= hitMil) {
        uf.union(viaNode, sIdx);
      }
      viaNode++;
    }
  }

  const root0 = uf.find(0);
  for (let i = 1; i < padCount; i++) {
    if (uf.find(i) !== root0) {
      return false;
    }
  }
  return true;
}

/**
 * 应用 LLM 几何；本地只做正交化、clearance、连通性门禁。
 */
export function applyLlmPcbGeometry(
  doc: PcbDocument,
  policy: PcbRoutePolicy,
  netPlan: PcbNetPlanResult,
  plan: PcbLlmGeometryPlan
): PcbGeometryResult {
  const empty: PcbGeometryResult = {
    ok: false, tracks: [], vias: [], routedNetIds: [], failedNetIds: [],
    missingCopperLayers: [], reason: '', failDetails: []
  };
  if (!plan.fromLlm) {
    empty.reason = 'geometry plan not from LLM';
    return empty;
  }
  const planTracks = plan.tracks ?? [];
  const planVias = plan.vias ?? [];
  if (planTracks.length === 0 && planVias.length === 0) {
    empty.reason = 'LLM geometry empty tracks/vias';
    return empty;
  }

  // LLM 几何无 zone：forcePour 按 forceTrack 连通要求处理
  for (let i = 0; i < netPlan.nets.length; i++) {
    if (netPlan.nets[i].routeMode === 'forcePour') {
      tracePcbWarn('AI_LLM_GEO',
        `demote ${netPlan.nets[i].netName} forcePour→forceTrack (no zone stage)`);
      netPlan.nets[i].routeMode = 'forceTrack';
    }
  }

  const copper = copperLayersFromStack(doc.layerStack);
  const tracks: PcbTrack[] = [];
  const vias: PcbVia[] = [];
  const failDetails: PcbGeoFailDetail[] = [];
  const failedSet: Set<string> = new Set();

  for (let i = 0; i < planVias.length; i++) {
    const vs = planVias[i];
    const net = resolveNet(doc, vs.netId ?? '', vs.netName ?? '');
    if (!net) {
      const label = `${vs.netId || ''}/${vs.netName || ''}`;
      failedSet.add(vs.netId || vs.netName || `via@${Math.round(vs.x)},${Math.round(vs.y)}`);
      failDetails.push({
        netId: vs.netId ?? '', netName: vs.netName ?? '',
        from: { x: vs.x, y: vs.y }, to: { x: vs.x, y: vs.y },
        cause: 'no_path',
        blocker: `unknown net ${label}`
      });
      tracePcbWarn('AI_LLM_GEO', `via fail unknown net ${label}`);
      continue;
    }
    const fromL = parseLayer(vs.fromLayer ?? 'F.Cu', copper) ?? PcbLayerId.F_CU;
    const toL = parseLayer(vs.toLayer ?? 'B.Cu', copper) ?? PcbLayerId.B_CU;
    const via = createViaAt(doc, policy, { x: vs.x, y: vs.y }, net.id, net.name,
      fromL, toL, tracks, vias);
    if (!viaClearAt(doc, via.position, net.id, via.diameter, via.layers, tracks, vias)) {
      failedSet.add(net.id);
      failDetails.push({
        netId: net.id, netName: net.name,
        from: { x: vs.x, y: vs.y }, to: { x: vs.x, y: vs.y },
        cause: 'via_block',
        blocker: `via blocked at ${Math.round(vs.x)},${Math.round(vs.y)}`
      });
      tracePcbWarn('AI_LLM_GEO', `via reject ${net.name} @${Math.round(vs.x)},${Math.round(vs.y)}`);
      continue;
    }
    vias.push(via);
  }

  for (let i = 0; i < planTracks.length; i++) {
    const tp = planTracks[i];
    const net = resolveNet(doc, tp.netId ?? '', tp.netName ?? '');
    if (!net) {
      const label = `${tp.netId || ''}/${tp.netName || ''}`;
      failedSet.add(tp.netId || tp.netName || 'unknown_track');
      failDetails.push({
        netId: tp.netId ?? '', netName: tp.netName ?? '',
        from: (tp.points && tp.points[0]) ? tp.points[0] : { x: 0, y: 0 },
        to: (tp.points && tp.points.length > 0) ?
          tp.points[tp.points.length - 1] : { x: 0, y: 0 },
        cause: 'no_path',
        blocker: `unknown net ${label}`
      });
      tracePcbWarn('AI_LLM_GEO', `track fail unknown net ${label}`);
      continue;
    }
    const layer = parseLayer(tp.layer, copper);
    if (!layer || !isCopperLayer(layer)) {
      failedSet.add(net.id);
      failDetails.push({
        netId: net.id, netName: net.name,
        from: (tp.points && tp.points[0]) ? tp.points[0] : { x: 0, y: 0 },
        to: (tp.points && tp.points.length > 0) ?
          tp.points[tp.points.length - 1] : { x: 0, y: 0 },
        cause: 'no_path',
        blocker: `bad layer ${tp.layer}`
      });
      continue;
    }
    if (!tp.points || tp.points.length < 2) {
      continue;
    }
    const pts = expandOrthoPoints(tp.points);
    const width = (tp.width !== undefined && tp.width > 0) ? tp.width : trackWidthForNet(doc, net.id);
    let pathOk = true;
    const pending: PcbTrack[] = [];
    for (let j = 0; j < pts.length - 1; j++) {
      const a = pts[j];
      const b = pts[j + 1];
      if (dist(a, b) < 0.5) {
        continue;
      }
      const block = pathClearBlockReason(doc, layer, a, b, net.id, width,
        tracks.concat(pending), vias);
      if (block !== null) {
        pathOk = false;
        failedSet.add(net.id);
        failDetails.push({
          netId: net.id, netName: net.name,
          from: { x: a.x, y: a.y },
          to: { x: b.x, y: b.y },
          cause: block.indexOf('pad_block') === 0 ? 'pad_block' :
            (block.indexOf('track_block') === 0 ? 'track_block' :
              (block.indexOf('via_block') === 0 ? 'via_block' : 'no_path')),
          blocker: block
        });
        tracePcbWarn('AI_LLM_GEO_CLR',
          `${net.name} ${layer as string} (${Math.round(a.x)},${Math.round(a.y)})→` +
          `(${Math.round(b.x)},${Math.round(b.y)}) | ${block}`);
        break;
      }
      pending.push({
        id: IdUtil.generate('trk'),
        layer,
        start: { x: a.x, y: a.y },
        end: { x: b.x, y: b.y },
        width,
        netId: net.id,
        netName: net.name
      });
    }
    if (pathOk) {
      for (let k = 0; k < pending.length; k++) {
        tracks.push(pending[k]);
      }
    }
  }

  // 连通性门禁：有铜但焊盘未连通 → fail，并撕掉该网铜
  const routedSet: Set<string> = new Set();
  for (let i = 0; i < netPlan.nets.length; i++) {
    const ne = netPlan.nets[i];
    if (ne.routeMode === 'defer') {
      continue;
    }
    if (ne.routeMode !== 'forceTrack' && ne.routeMode !== 'forcePour') {
      continue;
    }
    const bucket = collectNetPads(doc, ne.netId);
    const pads = mandatoryPads(bucket);
    if (pads.length < 2) {
      continue;
    }
    const okConn = netCopperConnectsPads(doc, ne.netId, tracks, vias);
    if (okConn) {
      routedSet.add(ne.netId);
      failedSet.delete(ne.netId);
    } else {
      failedSet.add(ne.netId);
      if (failDetails.filter(d => d.netId === ne.netId).length === 0) {
        failDetails.push({
          netId: ne.netId, netName: ne.netName,
          from: pads[0], to: pads[1],
          cause: 'no_path',
          blocker: 'pads not connected by LLM copper (orphan/stub)'
        });
      }
      tracePcbWarn('AI_LLM_GEO_CONN',
        `${ne.netName} pads=${pads.length} not connected — rip net copper`);
    }
  }

  // 撕掉失败网铜，避免 orphan 冒充 routed / 毒化后续网
  const keepTracks: PcbTrack[] = [];
  for (let i = 0; i < tracks.length; i++) {
    if (!failedSet.has(tracks[i].netId)) {
      keepTracks.push(tracks[i]);
    }
  }
  tracks.length = 0;
  for (let i = 0; i < keepTracks.length; i++) {
    tracks.push(keepTracks[i]);
  }
  const keepVias: PcbVia[] = [];
  for (let i = 0; i < vias.length; i++) {
    if (!failedSet.has(vias[i].netId)) {
      keepVias.push(vias[i]);
    }
  }
  vias.length = 0;
  for (let i = 0; i < keepVias.length; i++) {
    vias.push(keepVias[i]);
  }

  const routed: string[] = setToArray(routedSet);
  const failed: string[] = setToArray(failedSet);

  // 仅在无失败网时补缺铜层（且 filler 自身做 clearance）
  let missingCopper = ensureAllCopperUsed(doc, tracks);
  if (failed.length === 0 && missingCopper.length > 0) {
    fillUnusedCopperLayers(doc, policy, netPlan, tracks, vias, routed, missingCopper);
    missingCopper = ensureAllCopperUsed(doc, tracks);
  }

  tracePcb('AI_LLM_GEO',
    `applied tracks=${tracks.length} vias=${vias.length} routed=${routed.length} fail=${failed.length}`);

  if (failed.length > 0) {
    return {
      ok: false, tracks, vias, routedNetIds: routed, failedNetIds: failed,
      missingCopperLayers: missingCopper,
      reason: `signal nets failed: ${failed.length}`,
      failDetails
    };
  }
  if (missingCopper.length > 0) {
    return {
      ok: false, tracks, vias, routedNetIds: routed, failedNetIds: failed,
      missingCopperLayers: missingCopper,
      reason: `copper layers unused: ${missingCopper.join(',')}`,
      failDetails
    };
  }
  if (tracks.length === 0 && vias.length === 0) {
    empty.reason = 'LLM geometry produced no copper';
    return empty;
  }
  return {
    ok: true, tracks, vias, routedNetIds: routed, failedNetIds: [],
    missingCopperLayers: [], reason: 'ok', failDetails: []
  };
}
