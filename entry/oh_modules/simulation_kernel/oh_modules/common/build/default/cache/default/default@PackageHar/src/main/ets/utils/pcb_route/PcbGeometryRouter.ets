/**
 * 信号多层几何 — 按 LLM 层角色选 H/V/stub 层，换层必 via；执行策略不自创角色
 */
import {
  PcbDocument, PcbLayerId, PcbTrack, PcbVia, copperLayersFromStack
} from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';
import {
  PcbGeometryResult, PcbLayerRole, PcbNetPlanEntry, PcbNetPlanResult, PcbRoutePolicy
} from '../../types/PcbAiRouteTypes';
import { IdUtil } from '../IdUtil';
import { padWorldPosition } from '../PcbZoneUtil';
import { orderPointsNearestNeighbor } from '../PcbTrackBindUtil';
import { createViaAt } from './PcbViaFactory';
import { pathClearOfTracks, trackWidthForNet } from './PcbClearanceOracle';
import { routePowerBuses } from './PowerBusRouter';
import { ensureAllCopperUsed } from './ensureAllCopperUsed';
import { policyCoversCopperLayers } from '../../types/PcbAiRouteTypes';
import { tracePcb, tracePcbWarn } from '../PcbTraceLog';

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

function findLayerForRole(policy: PcbRoutePolicy, role: PcbLayerRole): PcbLayerId | null {
  const keys = Object.keys(policy.layerRoles);
  for (let i = 0; i < keys.length; i++) {
    if (policy.layerRoles[keys[i]] === role) {
      return keys[i] as PcbLayerId;
    }
  }
  return null;
}

function addSeg(tracks: PcbTrack[], layer: PcbLayerId, a: Point2D, b: Point2D,
  netId: string, netName: string, width: number): void {
  if (dist(a, b) < 0.5) {
    return;
  }
  tracks.push({
    id: IdUtil.generate('trk'),
    layer,
    start: { x: a.x, y: a.y },
    end: { x: b.x, y: b.y },
    width,
    netId,
    netName
  });
}

interface LayerPair {
  h: PcbLayerId;
  v: PcbLayerId;
  stub: PcbLayerId;
}

interface RouteSeg {
  layer: PcbLayerId;
  p0: Point2D;
  p1: Point2D;
}

function resolveSignalLayers(policy: PcbRoutePolicy, _copper: PcbLayerId[]): LayerPair | null {
  const h = findLayerForRole(policy, 'signal_h');
  const stub = findLayerForRole(policy, 'stub');
  // 垂直层：仅复用 LLM 已声明的 signal_v 或 stub，禁止用铜层列表冒充
  const v = findLayerForRole(policy, 'signal_v') ?? stub;
  if (!h || !stub || !v) {
    return null;
  }
  return { h, v, stub };
}

function routePairOrtho(
  doc: PcbDocument,
  policy: PcbRoutePolicy,
  layers: LayerPair,
  a: Point2D,
  b: Point2D,
  netId: string,
  netName: string,
  width: number,
  grid: number,
  existing: PcbTrack[],
  tracks: PcbTrack[],
  vias: PcbVia[]
): boolean {
  const midH: Point2D = { x: snap(b.x, grid), y: snap(a.y, grid) };
  const midV: Point2D = { x: snap(a.x, grid), y: snap(b.y, grid) };
  const tryHFirst = dist(a, midH) + dist(midH, b) <= dist(a, midV) + dist(midV, b);
  const mid = tryHFirst ? midH : midV;
  // 水平段走 signal_h，垂直段走 signal_v；起点先 stub 引出
  const startLayer = layers.stub;
  const hLayer = layers.h;
  const vLayer = layers.v;

  const segs: RouteSeg[] = [];
  if (dist(a, mid) >= 0.5) {
    const horiz = Math.abs(a.y - mid.y) < 0.5;
    const seg0: RouteSeg = { layer: horiz ? hLayer : vLayer, p0: a, p1: mid };
    segs.push(seg0);
  }
  if (dist(mid, b) >= 0.5) {
    const horiz = Math.abs(mid.y - b.y) < 0.5;
    const seg1: RouteSeg = { layer: horiz ? hLayer : vLayer, p0: mid, p1: b };
    segs.push(seg1);
  }
  if (segs.length === 0) {
    return true;
  }

  // stub 引出到第一折点层
  let curLayer = startLayer;
  const first = segs[0];
  if (curLayer !== first.layer) {
    const viaPos: Point2D = { x: snap(a.x, grid), y: snap(a.y, grid) };
    if (!pathClearOfTracks(doc, curLayer, a, viaPos, netId, width, existing.concat(tracks))) {
      // 同点 via 仍允许
    }
    vias.push(createViaAt(doc, policy, viaPos, netId, netName, curLayer, first.layer));
    curLayer = first.layer;
  }

  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (curLayer !== s.layer) {
      const viaPos: Point2D = { x: snap(s.p0.x, grid), y: snap(s.p0.y, grid) };
      vias.push(createViaAt(doc, policy, viaPos, netId, netName, curLayer, s.layer));
      curLayer = s.layer;
    }
    if (!pathClearOfTracks(doc, s.layer, s.p0, s.p1, netId, width, existing.concat(tracks))) {
      return false;
    }
    addSeg(tracks, s.layer, s.p0, s.p1, netId, netName, width);
  }
  return true;
}

function collectNetPads(doc: PcbDocument, netId: string): Point2D[] {
  const pts: Point2D[] = [];
  for (const fp of doc.footprints) {
    for (const pad of fp.pads) {
      if ((pad.netId ?? '') === netId) {
        pts.push(padWorldPosition(fp, pad));
      }
    }
  }
  return pts;
}

/**
 * 执行 LLM 策略的完整几何布线（电源总线 + 信号）
 */
export function runPcbGeometryRoute(
  doc: PcbDocument,
  policy: PcbRoutePolicy,
  netPlan: PcbNetPlanResult
): PcbGeometryResult {
  const empty: PcbGeometryResult = {
    ok: false, tracks: [], vias: [], routedNetIds: [], failedNetIds: [],
    missingCopperLayers: [], reason: ''
  };

  if (!policy.fromLlm) {
    empty.reason = 'route policy not from LLM';
    return empty;
  }
  if (!netPlan.fromLlm) {
    empty.reason = 'net plan not from LLM';
    return empty;
  }

  const copper = copperLayersFromStack(doc.layerStack);
  const missingRoles = policyCoversCopperLayers(policy, copper);
  if (missingRoles.length > 0) {
    empty.reason = `LLM layerRoles missing copper: ${missingRoles.join(',')}`;
    return empty;
  }

  const grid = doc.metadata.gridSize ?? 5;
  const tracks: PcbTrack[] = [];
  const vias: PcbVia[] = [];
  const routed: string[] = [];
  const failed: string[] = [];

  const power = routePowerBuses(doc, policy, netPlan.nets);
  if (!power.ok) {
    empty.reason = power.reason;
    return empty;
  }
  for (let i = 0; i < power.tracks.length; i++) {
    tracks.push(power.tracks[i]);
  }
  for (let i = 0; i < power.vias.length; i++) {
    vias.push(power.vias[i]);
  }
  for (let i = 0; i < netPlan.nets.length; i++) {
    const ne = netPlan.nets[i];
    if ((ne.kind === 'gnd' || ne.kind === 'power') && ne.routeMode !== 'defer') {
      routed.push(ne.netId);
    }
  }

  const sigLayers = resolveSignalLayers(policy, copper);
  if (!sigLayers) {
    empty.reason = 'LLM policy missing signal_h/stub roles for signal routing';
    return empty;
  }

  // 按 priorityOrder 再按 entry.priority
  const order: PcbNetPlanEntry[] = [];
  const byId: Map<string, PcbNetPlanEntry> = new Map();
  for (let i = 0; i < netPlan.nets.length; i++) {
    byId.set(netPlan.nets[i].netId, netPlan.nets[i]);
  }
  for (let i = 0; i < netPlan.priorityOrder.length; i++) {
    const e = byId.get(netPlan.priorityOrder[i]);
    if (e) {
      order.push(e);
    }
  }
  for (let i = 0; i < netPlan.nets.length; i++) {
    if (order.indexOf(netPlan.nets[i]) < 0) {
      order.push(netPlan.nets[i]);
    }
  }
  order.sort((a, b) => b.priority - a.priority);

  for (let i = 0; i < order.length; i++) {
    const ne = order[i];
    if (ne.kind === 'gnd' || ne.kind === 'power') {
      continue;
    }
    if (ne.routeMode === 'defer') {
      continue;
    }
    if (ne.routeMode !== 'forceTrack' && ne.routeMode !== 'forcePour') {
      continue;
    }
    const pads = collectNetPads(doc, ne.netId);
    if (pads.length < 2) {
      continue;
    }
    const width = trackWidthForNet(doc, ne.netId);
    const ordered = orderPointsNearestNeighbor(pads);
    let okNet = true;
    for (let j = 0; j < ordered.length - 1; j++) {
      const ok = routePairOrtho(doc, policy, sigLayers, ordered[j], ordered[j + 1],
        ne.netId, ne.netName, width, grid, doc.tracks, tracks, vias);
      if (!ok) {
        okNet = false;
        break;
      }
    }
    if (okNet) {
      routed.push(ne.netId);
      tracePcb('AI_GEO_NET', `${ne.netName} ok pads=${pads.length}`);
    } else {
      failed.push(ne.netId);
      tracePcbWarn('AI_GEO_FAIL', `${ne.netName} clearance/path fail`);
    }
  }

  const missingCopper = ensureAllCopperUsed(doc, tracks);
  if (failed.length > 0) {
    return {
      ok: false, tracks, vias, routedNetIds: routed, failedNetIds: failed,
      missingCopperLayers: missingCopper,
      reason: `signal nets failed: ${failed.length}`
    };
  }
  if (missingCopper.length > 0) {
    return {
      ok: false, tracks, vias, routedNetIds: routed, failedNetIds: failed,
      missingCopperLayers: missingCopper,
      reason: `copper layers unused: ${missingCopper.join(',')}`
    };
  }

  return {
    ok: true, tracks, vias, routedNetIds: routed, failedNetIds: [],
    missingCopperLayers: [], reason: 'ok'
  };
}
