/**
 * 信号多层几何 — H/V/stub + 备选折点/jog；缺层 filler；via 参与避障
 */
import {
  PcbDocument, PcbLayerId, PcbTrack, PcbVia, copperLayersFromStack
} from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';
import {
  PcbGeometryResult, PcbLayerRole, PcbNetPlanEntry, PcbNetPlanResult, PcbRoutePolicy,
  policyCoversCopperLayers
} from '../../types/PcbAiRouteTypes';
import { IdUtil } from '../IdUtil';
import { padWorldPosition } from '../PcbZoneUtil';
import { orderPointsNearestNeighbor } from '../PcbTrackBindUtil';
import { createViaAt } from './PcbViaFactory';
import { pathClearOfTracks, trackWidthForNet } from './PcbClearanceOracle';
import { routePowerBuses } from './PowerBusRouter';
import { ensureAllCopperUsed, fillUnusedCopperLayers } from './ensureAllCopperUsed';
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
  const h = findLayerForRole(policy, 'signal_h') ??
    findLayerForRole(policy, 'power_h') ??
    findLayerForRole(policy, 'gnd_bus') ??
    findLayerForRole(policy, 'vcc_bus') ??
    findLayerForRole(policy, 'power_v');
  const stub = findLayerForRole(policy, 'stub') ??
    (h ? findAlternateCopperRole(policy, h) : null);
  const v = findLayerForRole(policy, 'signal_v') ?? stub;
  if (!h || !stub || !v) {
    return null;
  }
  return { h, v, stub };
}

function findAlternateCopperRole(policy: PcbRoutePolicy, excludeLayer: PcbLayerId): PcbLayerId | null {
  const keys = Object.keys(policy.layerRoles);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] !== (excludeLayer as string)) {
      return keys[i] as PcbLayerId;
    }
  }
  return null;
}

function tryCommitSegs(
  doc: PcbDocument,
  policy: PcbRoutePolicy,
  layers: LayerPair,
  segs: RouteSeg[],
  a: Point2D,
  netId: string,
  netName: string,
  width: number,
  grid: number,
  obstacleTracks: PcbTrack[],
  tracks: PcbTrack[],
  vias: PcbVia[]
): boolean {
  if (segs.length === 0) {
    return true;
  }
  const startLayer = layers.stub;
  let curLayer = startLayer;
  const first = segs[0];
  const viaList = vias;
  if (curLayer !== first.layer) {
    const viaPos: Point2D = { x: snap(a.x, grid), y: snap(a.y, grid) };
    viaList.push(createViaAt(doc, policy, viaPos, netId, netName, curLayer, first.layer,
      obstacleTracks.concat(tracks), viaList));
    curLayer = first.layer;
  }
  const pending: RouteSeg[] = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (curLayer !== s.layer) {
      const viaPos: Point2D = { x: snap(s.p0.x, grid), y: snap(s.p0.y, grid) };
      viaList.push(createViaAt(doc, policy, viaPos, netId, netName, curLayer, s.layer,
        obstacleTracks.concat(tracks), viaList));
      curLayer = s.layer;
    }
    if (!pathClearOfTracks(doc, s.layer, s.p0, s.p1, netId, width,
      obstacleTracks.concat(tracks), viaList)) {
      return false;
    }
    pending.push(s);
  }
  for (let i = 0; i < pending.length; i++) {
    addSeg(tracks, pending[i].layer, pending[i].p0, pending[i].p1, netId, netName, width);
  }
  return true;
}

/** 折线点列 → 正交段（非正交边自动拆 L） */
function buildOrthoSegs(pts: Point2D[], hLayer: PcbLayerId, vLayer: PcbLayerId): RouteSeg[] {
  const segs: RouteSeg[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    if (dist(p0, p1) < 0.5) {
      continue;
    }
    const horiz = Math.abs(p0.y - p1.y) < 0.5;
    const vert = Math.abs(p0.x - p1.x) < 0.5;
    if (horiz || vert) {
      segs.push({ layer: horiz ? hLayer : vLayer, p0, p1 });
    } else {
      const mid: Point2D = { x: p1.x, y: p0.y };
      if (dist(p0, mid) >= 0.5) {
        segs.push({ layer: hLayer, p0, p1: mid });
      }
      if (dist(mid, p1) >= 0.5) {
        segs.push({ layer: vLayer, p0: mid, p1 });
      }
    }
  }
  return segs;
}

/**
 * 多策略正交：L / 对侧 L / jog 偏移
 */
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
  const hLayer = layers.h;
  const vLayer = layers.v;
  const viaSnap = vias.length;
  const trackSnap = tracks.length;

  const polylines: Point2D[][] = [
    [a, midH, b],
    [a, midV, b]
  ];
  const jogs = [grid * 2, -grid * 2, grid * 4, -grid * 4, grid * 8, -grid * 8];
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

  for (let ci = 0; ci < polylines.length; ci++) {
    while (vias.length > viaSnap) {
      vias.pop();
    }
    while (tracks.length > trackSnap) {
      tracks.pop();
    }
    const segs = buildOrthoSegs(polylines[ci], hLayer, vLayer);
    if (tryCommitSegs(doc, policy, layers, segs, a, netId, netName, width, grid,
      existing, tracks, vias)) {
      return true;
    }
  }
  while (vias.length > viaSnap) {
    vias.pop();
  }
  while (tracks.length > trackSnap) {
    tracks.pop();
  }
  return false;
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

function parseHintRole(hint: string | undefined): PcbLayerRole | null {
  if (!hint || hint.length === 0) {
    return null;
  }
  const u = hint.toLowerCase().trim();
  if (u === 'signal_h' || u === 'signal_v' || u === 'stub' || u === 'power_h' ||
    u === 'power_v' || u === 'gnd_bus' || u === 'vcc_bus') {
    return u as PcbLayerRole;
  }
  return null;
}

function effectiveNetPriority(ne: PcbNetPlanEntry, policy: PcbRoutePolicy): number {
  const np = policy.netPriority;
  if (np) {
    if (np[ne.netId] !== undefined && !isNaN(np[ne.netId])) {
      return np[ne.netId];
    }
    if (np[ne.netName] !== undefined && !isNaN(np[ne.netName])) {
      return np[ne.netName];
    }
  }
  return ne.priority;
}

function sortNetsByPriority(nets: PcbNetPlanEntry[], policy: PcbRoutePolicy): PcbNetPlanEntry[] {
  const copy = nets.slice();
  copy.sort((a, b) => effectiveNetPriority(b, policy) - effectiveNetPriority(a, policy));
  return copy;
}

function layersForNet(
  policy: PcbRoutePolicy,
  ne: PcbNetPlanEntry,
  fallback: LayerPair
): LayerPair {
  const hint = parseHintRole(ne.layerHint);
  if (!hint) {
    return fallback;
  }
  const hinted = findLayerForRole(policy, hint);
  if (!hinted) {
    return fallback;
  }
  if (hint === 'signal_h' || hint === 'power_h' || hint === 'gnd_bus' || hint === 'vcc_bus') {
    return { h: hinted, v: fallback.v, stub: fallback.stub };
  }
  if (hint === 'signal_v' || hint === 'power_v') {
    return { h: fallback.h, v: hinted, stub: fallback.stub };
  }
  if (hint === 'stub') {
    return { h: fallback.h, v: fallback.v, stub: hinted };
  }
  return fallback;
}

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

  const power = routePowerBuses(doc, policy, sortNetsByPriority(netPlan.nets, policy));
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
  const powerSkipped = new Set(power.skippedNetIds ?? []);
  for (let i = 0; i < netPlan.nets.length; i++) {
    const ne = netPlan.nets[i];
    if ((ne.kind === 'gnd' || ne.kind === 'power') && ne.routeMode !== 'defer' &&
      !powerSkipped.has(ne.netId)) {
      routed.push(ne.netId);
    }
  }
  if (power.reason !== 'ok' && power.reason.length > 0) {
    tracePcbWarn('AI_GEO_POWER_SOFT', power.reason);
  }

  // 信号网 + 总线 soft-skip / forceTrack 的电源地 → 正交信号几何
  let needSigLayers = powerSkipped.size > 0;
  for (let i = 0; i < netPlan.nets.length; i++) {
    const ne = netPlan.nets[i];
    if (ne.kind !== 'gnd' && ne.kind !== 'power' && ne.routeMode !== 'defer') {
      needSigLayers = true;
      break;
    }
  }

  if (needSigLayers) {
    const sigLayers = resolveSignalLayers(policy, copper);
    if (!sigLayers) {
      empty.reason = 'LLM policy missing signal_h/stub roles for signal routing';
      return empty;
    }

    const order: PcbNetPlanEntry[] = [];
    const byId: Map<string, PcbNetPlanEntry> = new Map();
    const byName: Map<string, PcbNetPlanEntry> = new Map();
    for (let i = 0; i < netPlan.nets.length; i++) {
      byId.set(netPlan.nets[i].netId, netPlan.nets[i]);
      byName.set(netPlan.nets[i].netName, netPlan.nets[i]);
    }
    for (let i = 0; i < netPlan.priorityOrder.length; i++) {
      const key = netPlan.priorityOrder[i];
      const e = byId.get(key) ?? byName.get(key);
      if (e && order.indexOf(e) < 0) {
        order.push(e);
      }
    }
    for (let i = 0; i < netPlan.nets.length; i++) {
      if (order.indexOf(netPlan.nets[i]) < 0) {
        order.push(netPlan.nets[i]);
      }
    }
    order.sort((a, b) => effectiveNetPriority(b, policy) - effectiveNetPriority(a, policy));

    for (let i = 0; i < order.length; i++) {
      const ne = order[i];
      if (ne.routeMode === 'defer') {
        continue;
      }
      const isPowerSkip = (ne.kind === 'gnd' || ne.kind === 'power') && powerSkipped.has(ne.netId);
      const isSignal = ne.kind !== 'gnd' && ne.kind !== 'power';
      if (!isPowerSkip && !isSignal) {
        continue;
      }
      if (isSignal && ne.routeMode !== 'forceTrack' && ne.routeMode !== 'forcePour') {
        continue;
      }
      const pads = collectNetPads(doc, ne.netId);
      if (pads.length < 2) {
        continue;
      }
      const width = trackWidthForNet(doc, ne.netId);
      const ordered = orderPointsNearestNeighbor(pads);
      const netLayers = layersForNet(policy, ne, sigLayers);
      let okNet = true;
      for (let j = 0; j < ordered.length - 1; j++) {
        const ok = routePairOrtho(doc, policy, netLayers, ordered[j], ordered[j + 1],
          ne.netId, ne.netName, width, grid, tracks, tracks, vias);
        if (!ok) {
          okNet = false;
          break;
        }
      }
      if (okNet) {
        routed.push(ne.netId);
        tracePcb('AI_GEO_NET', `${ne.netName}${isPowerSkip ? '(power→signal)' : ''} ok pads=${pads.length}`);
      } else {
        failed.push(ne.netId);
        tracePcbWarn('AI_GEO_FAIL', `${ne.netName} clearance/path fail`);
      }
    }
  }

  // 声明角色但未用铜层：补真实短段
  let missingCopper = ensureAllCopperUsed(doc, tracks);
  if (missingCopper.length > 0) {
    fillUnusedCopperLayers(doc, policy, netPlan, tracks, vias, routed, missingCopper);
    missingCopper = ensureAllCopperUsed(doc, tracks);
  }

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
