/**
 * Power bus router: LLM layer roles + layerHint；多电源同层 Y 错开；via/track clearance
 * clearance 失败 soft-skip（保留已布铜），交给几何信号路径兜底
 */
import {
  PcbDocument, PcbLayerId, PcbTrack, PcbVia, copperLayersFromStack
} from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';
import {
  PcbLayerRole, PcbNetPlanEntry, PcbRoutePolicy
} from '../../types/PcbAiRouteTypes';
import { IdUtil } from '../IdUtil';
import { padWorldPosition } from '../PcbZoneUtil';
import { createViaAt } from './PcbViaFactory';
import { trackWidthForNet, pathClearOfTracks, clearanceForNet } from './PcbClearanceOracle';

export interface PowerBusRouteOut {
  ok: boolean;
  tracks: PcbTrack[];
  vias: PcbVia[];
  reason: string;
  /** 总线 clearance 失败、待信号几何兜底的网 */
  skippedNetIds: string[];
}

function snap(v: number, grid: number): number {
  if (grid <= 0) {
    return v;
  }
  return Math.round(v / grid) * grid;
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

function parseHintRole(hint: string | undefined): PcbLayerRole | null {
  if (!hint || hint.length === 0) {
    return null;
  }
  const u = hint.toLowerCase().trim();
  if (u === 'gnd_bus' || u === 'vcc_bus' || u === 'signal_h' || u === 'signal_v' ||
    u === 'stub' || u === 'power_h' || u === 'power_v') {
    return u as PcbLayerRole;
  }
  return null;
}

function addTrack(tracks: PcbTrack[], layer: PcbLayerId, a: Point2D, b: Point2D,
  netId: string, netName: string, width: number): void {
  if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5) {
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

function collectPads(doc: PcbDocument, netId: string): Point2D[] {
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

function pickOuterTapLayer(busLayer: PcbLayerId, copper: PcbLayerId[]): PcbLayerId | null {
  const prefer: PcbLayerId[] = [PcbLayerId.F_CU, PcbLayerId.B_CU];
  for (let i = 0; i < prefer.length; i++) {
    if (prefer[i] !== busLayer && copper.indexOf(prefer[i]) >= 0) {
      return prefer[i];
    }
  }
  for (let i = 0; i < copper.length; i++) {
    if (copper[i] !== busLayer) {
      return copper[i];
    }
  }
  return null;
}

function resolveBusLayer(
  policy: PcbRoutePolicy,
  ne: PcbNetPlanEntry,
  gndLayer: PcbLayerId | null,
  vccLayer: PcbLayerId | null,
  powerIdx: number
): PcbLayerId | null {
  const hint = parseHintRole(ne.layerHint);
  if (hint) {
    const hinted = findLayerForRole(policy, hint);
    if (hinted) {
      return hinted;
    }
  }
  if (ne.kind === 'gnd') {
    return gndLayer;
  }
  if (powerIdx % 3 === 1) {
    return findLayerForRole(policy, 'power_h') ?? vccLayer;
  }
  if (powerIdx % 3 === 2) {
    return findLayerForRole(policy, 'power_v') ??
      findLayerForRole(policy, 'power_h') ?? vccLayer;
  }
  return vccLayer;
}

function boardYRange(doc: PcbDocument, grid: number): [number, number] {
  const pts = doc.boardOutline?.points ?? [];
  if (pts.length === 0) {
    return [grid * 8, grid * 180];
  }
  let yMin = pts[0].y;
  let yMax = pts[0].y;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].y < yMin) {
      yMin = pts[i].y;
    }
    if (pts[i].y > yMax) {
      yMax = pts[i].y;
    }
  }
  const margin = grid * 8;
  return [snap(yMin + margin, grid), snap(yMax - margin, grid)];
}

/** 生成候选 busY：hint → 均值错开 → 整板扫描 */
function collectBusYCandidates(
  doc: PcbDocument,
  grid: number,
  baseY: number,
  width: number,
  ne: PcbNetPlanEntry,
  slot: number,
  sameLayerMulti: boolean
): number[] {
  const out: number[] = [];
  const seen: Set<number> = new Set();
  const push = (y: number): void => {
    const s = snap(y, grid);
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  };
  if (ne.busYOffset !== undefined && !isNaN(ne.busYOffset)) {
    push(baseY + ne.busYOffset);
  }
  push(baseY);
  const sep = Math.max(grid * 6, width * 3 + clearanceForNet(doc, ne.netId));
  if (slot > 0 || sameLayerMulti) {
    const sign = ne.kind === 'gnd' ? -1 : 1;
    push(baseY + sign * sep * (slot + 1));
    push(baseY - sign * sep * (slot + 1));
  }
  for (let k = 1; k <= 12; k++) {
    push(baseY + k * sep);
    push(baseY - k * sep);
  }
  const range = boardYRange(doc, grid);
  const step = Math.max(grid * 4, sep);
  for (let y = range[0]; y <= range[1]; y += step) {
    push(y);
  }
  return out;
}

export function routePowerBuses(
  doc: PcbDocument,
  policy: PcbRoutePolicy,
  netEntries: PcbNetPlanEntry[]
): PowerBusRouteOut {
  const tracks: PcbTrack[] = [];
  const vias: PcbVia[] = [];
  const skippedNetIds: string[] = [];
  const grid = doc.metadata.gridSize ?? 5;
  const copper = copperLayersFromStack(doc.layerStack);
  if (copper.length === 0) {
    return { ok: false, tracks, vias, reason: 'no copper layers in stack', skippedNetIds };
  }

  const gndLayer = findLayerForRole(policy, 'gnd_bus') ??
    findLayerForRole(policy, 'power_h') ??
    findLayerForRole(policy, 'power_v') ??
    findLayerForRole(policy, 'signal_h') ??
    findLayerForRole(policy, 'stub');
  const vccLayer = findLayerForRole(policy, 'vcc_bus') ??
    findLayerForRole(policy, 'power_v') ??
    findLayerForRole(policy, 'power_h') ??
    findLayerForRole(policy, 'signal_h') ??
    findLayerForRole(policy, 'stub');

  const busSlotOnLayer: Map<string, number> = new Map();
  let powerIdx = 0;
  const softReasons: string[] = [];

  for (let i = 0; i < netEntries.length; i++) {
    const ne = netEntries[i];
    if (ne.routeMode === 'defer') {
      continue;
    }
    // forceTrack 的电源/地改走信号几何，不建宽总线
    if (ne.routeMode === 'forceTrack') {
      skippedNetIds.push(ne.netId);
      continue;
    }
    if (ne.kind !== 'gnd' && ne.kind !== 'power') {
      continue;
    }
    if (ne.kind === 'power') {
      powerIdx++;
    }
    const busLayer = resolveBusLayer(policy, ne, gndLayer, vccLayer, powerIdx);
    if (!busLayer) {
      return {
        ok: false, tracks: [], vias: [], skippedNetIds: [],
        reason: `LLM policy missing bus layer role for ${ne.kind} net ${ne.netName}`
      };
    }
    const pads = collectPads(doc, ne.netId);
    if (pads.length < 1) {
      continue;
    }
    const width = trackWidthForNet(doc, ne.netId);
    let minX = pads[0].x;
    let maxX = pads[0].x;
    let sumY = 0;
    for (let p = 0; p < pads.length; p++) {
      if (pads[p].x < minX) {
        minX = pads[p].x;
      }
      if (pads[p].x > maxX) {
        maxX = pads[p].x;
      }
      sumY += pads[p].y;
    }
    const baseY = snap(sumY / pads.length, grid);
    const layerKey = busLayer as string;
    const slot = busSlotOnLayer.get(layerKey) ?? 0;
    busSlotOnLayer.set(layerKey, slot + 1);
    const sameLayerMulti = gndLayer === vccLayer && ne.kind === 'power';

    const candidates = collectBusYCandidates(doc, grid, baseY, width, ne, slot, sameLayerMulti);
    let placed = false;
    let busY = baseY;
    for (let ci = 0; ci < candidates.length; ci++) {
      const tryY = candidates[ci];
      const left: Point2D = { x: snap(minX - grid * 2, grid), y: tryY };
      const right: Point2D = { x: snap(maxX + grid * 2, grid), y: tryY };
      if (pathClearOfTracks(doc, busLayer, left, right, ne.netId, width, tracks, vias)) {
        addTrack(tracks, busLayer, left, right, ne.netId, ne.netName, width);
        busY = tryY;
        placed = true;
        break;
      }
    }
    if (!placed) {
      softReasons.push(`power bus clearance fail on ${busLayer} for ${ne.netName}`);
      skippedNetIds.push(ne.netId);
      continue;
    }

    const stubLayer = findLayerForRole(policy, 'stub') ?? pickOuterTapLayer(busLayer, copper);
    let tapOk = true;
    for (let p = 0; p < pads.length; p++) {
      const pad = pads[p];
      let viaPos: Point2D = { x: snap(pad.x, grid), y: snap(pad.y, grid) };
      const drop: Point2D = { x: viaPos.x, y: busY };
      if (stubLayer && stubLayer !== busLayer) {
        if (!pathClearOfTracks(doc, stubLayer, pad, viaPos, ne.netId, width, tracks, vias) ||
          !pathClearOfTracks(doc, busLayer, viaPos, drop, ne.netId, width, tracks, vias)) {
          let okTap = false;
          for (const dx of [grid * 2, -grid * 2, grid * 4, -grid * 4, grid * 8, -grid * 8]) {
            const alt: Point2D = { x: snap(pad.x + dx, grid), y: viaPos.y };
            const altDrop: Point2D = { x: alt.x, y: busY };
            if (pathClearOfTracks(doc, stubLayer, pad, alt, ne.netId, width, tracks, vias) &&
              pathClearOfTracks(doc, busLayer, alt, altDrop, ne.netId, width, tracks, vias)) {
              viaPos = alt;
              okTap = true;
              addTrack(tracks, stubLayer, pad, viaPos, ne.netId, ne.netName, width);
              vias.push(createViaAt(doc, policy, viaPos, ne.netId, ne.netName, stubLayer, busLayer, tracks, vias));
              addTrack(tracks, busLayer, viaPos, altDrop, ne.netId, ne.netName, width);
              break;
            }
          }
          if (!okTap) {
            tapOk = false;
            break;
          }
        } else {
          addTrack(tracks, stubLayer, pad, viaPos, ne.netId, ne.netName, width);
          vias.push(createViaAt(doc, policy, viaPos, ne.netId, ne.netName, stubLayer, busLayer, tracks, vias));
          addTrack(tracks, busLayer, viaPos, drop, ne.netId, ne.netName, width);
        }
      } else if (!stubLayer && busLayer !== PcbLayerId.F_CU && busLayer !== PcbLayerId.B_CU) {
        return {
          ok: false, tracks: [], vias: [], skippedNetIds: [],
          reason: `LLM policy missing stub layer for power tap on ${ne.netName}`
        };
      } else {
        if (!pathClearOfTracks(doc, busLayer, pad, drop, ne.netId, width, tracks, vias)) {
          tapOk = false;
          break;
        }
        addTrack(tracks, busLayer, pad, drop, ne.netId, ne.netName, width);
      }
    }
    if (!tapOk) {
      // 回滚本网刚加的铜，改信号几何兜底
      const keepT: PcbTrack[] = [];
      for (let ti = 0; ti < tracks.length; ti++) {
        if (tracks[ti].netId !== ne.netId) {
          keepT.push(tracks[ti]);
        }
      }
      tracks.length = 0;
      for (let ti = 0; ti < keepT.length; ti++) {
        tracks.push(keepT[ti]);
      }
      const keepV: PcbVia[] = [];
      for (let vi = 0; vi < vias.length; vi++) {
        if (vias[vi].netId !== ne.netId) {
          keepV.push(vias[vi]);
        }
      }
      vias.length = 0;
      for (let vi = 0; vi < keepV.length; vi++) {
        vias.push(keepV[vi]);
      }
      softReasons.push(`power tap clearance fail for ${ne.netName}`);
      skippedNetIds.push(ne.netId);
    }
  }

  if (softReasons.length > 0 && tracks.length === 0 && vias.length === 0) {
    return {
      ok: false, tracks, vias, skippedNetIds,
      reason: softReasons[0]
    };
  }
  // 有铜或仅 soft-skip：几何继续；ok=true 让信号兜底 skipped
  return {
    ok: true,
    tracks,
    vias,
    skippedNetIds,
    reason: softReasons.length > 0 ? softReasons.join(' | ') : 'ok'
  };
}
