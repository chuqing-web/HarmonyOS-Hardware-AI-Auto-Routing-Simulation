/**
 * Power bus router: LLM layer roles drive In copper buses and pad via taps.
 * Missing gnd_bus / vcc_bus roles causes failure (no local defaults).
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
import { trackWidthForNet } from './PcbClearanceOracle';

export interface PowerBusRouteOut {
  ok: boolean;
  tracks: PcbTrack[];
  vias: PcbVia[];
  reason: string;
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
    const k = keys[i];
    if (policy.layerRoles[k] === role) {
      return k as PcbLayerId;
    }
  }
  return null;
}

function addTrack(tracks: PcbTrack[], layer: PcbLayerId, a: Point2D, b: Point2D,
  netId: string, netName: string, width: number): void {
  if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5) {
    return;
  }
  const trk: PcbTrack = {
    id: IdUtil.generate('trk'),
    layer,
    start: { x: a.x, y: a.y },
    end: { x: b.x, y: b.y },
    width,
    netId,
    netName
  };
  tracks.push(trk);
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

/** Route gnd/power nets that are forceTrack or forcePour onto bus layers. */
export function routePowerBuses(
  doc: PcbDocument,
  policy: PcbRoutePolicy,
  netEntries: PcbNetPlanEntry[]
): PowerBusRouteOut {
  const tracks: PcbTrack[] = [];
  const vias: PcbVia[] = [];
  const grid = doc.metadata.gridSize ?? 5;
  const copper = copperLayersFromStack(doc.layerStack);
  if (copper.length === 0) {
    return { ok: false, tracks, vias, reason: 'no copper layers in stack' };
  }

  const gndLayer = findLayerForRole(policy, 'gnd_bus') ?? findLayerForRole(policy, 'power_h');
  const vccLayer = findLayerForRole(policy, 'vcc_bus') ?? findLayerForRole(policy, 'power_v') ??
    findLayerForRole(policy, 'power_h');

  for (let i = 0; i < netEntries.length; i++) {
    const ne = netEntries[i];
    if (ne.routeMode === 'defer') {
      continue;
    }
    if (ne.kind !== 'gnd' && ne.kind !== 'power') {
      continue;
    }
    const busLayer = ne.kind === 'gnd' ? gndLayer : vccLayer;
    if (!busLayer) {
      return {
        ok: false,
        tracks: [],
        vias: [],
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
    const busY = snap(sumY / pads.length, grid);
    const busLeft: Point2D = { x: snap(minX - grid * 2, grid), y: busY };
    const busRight: Point2D = { x: snap(maxX + grid * 2, grid), y: busY };
    addTrack(tracks, busLayer, busLeft, busRight, ne.netId, ne.netName, width);

    const stubLayer = findLayerForRole(policy, 'stub');
    for (let p = 0; p < pads.length; p++) {
      const pad = pads[p];
      const viaPos: Point2D = { x: snap(pad.x, grid), y: snap(pad.y, grid) };
      const drop: Point2D = { x: viaPos.x, y: busY };
      if (stubLayer && stubLayer !== busLayer) {
        addTrack(tracks, stubLayer, pad, viaPos, ne.netId, ne.netName, width);
        vias.push(createViaAt(doc, policy, viaPos, ne.netId, ne.netName, stubLayer, busLayer));
        addTrack(tracks, busLayer, viaPos, drop, ne.netId, ne.netName, width);
      } else if (!stubLayer && busLayer !== PcbLayerId.F_CU && busLayer !== PcbLayerId.B_CU) {
        return {
          ok: false, tracks: [], vias: [],
          reason: `LLM policy missing stub layer for power tap on ${ne.netName}`
        };
      } else {
        addTrack(tracks, busLayer, pad, drop, ne.netId, ne.netName, width);
      }
    }
  }

  return { ok: true, tracks, vias, reason: 'ok' };
}
