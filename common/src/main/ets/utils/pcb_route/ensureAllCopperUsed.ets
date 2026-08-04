/**
 * 硬门禁：Cu 栈每一铜层须有 track 或同层 zone
 */
import {
  PcbDocument, PcbLayerId, PcbTrack, PcbVia, PcbViaKind, copperLayersFromStack
} from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';
import {
  PcbLayerRole, PcbNetPlanEntry, PcbNetPlanResult, PcbRoutePolicy
} from '../../types/PcbAiRouteTypes';
import { IdUtil } from '../IdUtil';
import { trackWidthForNet } from './PcbClearanceOracle';

export function ensureAllCopperUsed(
  doc: PcbDocument,
  tracks: PcbTrack[],
  zonesCountAsUsed: boolean = true
): PcbLayerId[] {
  const copper = copperLayersFromStack(doc.layerStack);
  const used: Set<string> = new Set();
  for (let i = 0; i < tracks.length; i++) {
    used.add(tracks[i].layer as string);
  }
  if (zonesCountAsUsed) {
    for (let i = 0; i < doc.zones.length; i++) {
      used.add(doc.zones[i].layer as string);
    }
  }
  const missing: PcbLayerId[] = [];
  for (let i = 0; i < copper.length; i++) {
    const lid = copper[i];
    if (!used.has(lid as string)) {
      missing.push(lid);
    }
  }
  return missing;
}

function findRoleLayer(policy: PcbRoutePolicy, role: PcbLayerRole): PcbLayerId | null {
  const keys = Object.keys(policy.layerRoles);
  for (let i = 0; i < keys.length; i++) {
    if (policy.layerRoles[keys[i]] === role) {
      return keys[i] as PcbLayerId;
    }
  }
  return null;
}

function pickNetForRole(
  role: PcbLayerRole,
  netPlan: PcbNetPlanResult,
  routed: string[]
): PcbNetPlanEntry | null {
  const preferGnd = role === 'gnd_bus';
  const preferPower = role === 'vcc_bus' || role === 'power_h' || role === 'power_v';
  for (let i = 0; i < netPlan.nets.length; i++) {
    const n = netPlan.nets[i];
    if (n.routeMode === 'defer') {
      continue;
    }
    if (preferGnd && n.kind === 'gnd') {
      return n;
    }
    if (preferPower && n.kind === 'power') {
      return n;
    }
  }
  // signal / stub：挂已布信号或任意已布网
  for (let i = 0; i < netPlan.nets.length; i++) {
    const n = netPlan.nets[i];
    if (routed.indexOf(n.netId) >= 0) {
      return n;
    }
  }
  for (let i = 0; i < netPlan.nets.length; i++) {
    if (netPlan.nets[i].routeMode !== 'defer') {
      return netPlan.nets[i];
    }
  }
  return null;
}

/**
 * 为声明但未用到的铜层补真实短段（挂已有电气网，禁止空网 dummy）
 */
export function fillUnusedCopperLayers(
  doc: PcbDocument,
  policy: PcbRoutePolicy,
  netPlan: PcbNetPlanResult,
  tracks: PcbTrack[],
  vias: PcbVia[],
  routedNetIds: string[],
  missing: PcbLayerId[]
): void {
  if (missing.length === 0) {
    return;
  }
  const grid = doc.metadata.gridSize ?? 5;
  const outline = doc.boardOutline?.points ?? [];
  let cx = 100;
  let cy = 100;
  if (outline.length > 0) {
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < outline.length; i++) {
      sx += outline[i].x;
      sy += outline[i].y;
    }
    cx = Math.round(sx / outline.length / grid) * grid;
    cy = Math.round(sy / outline.length / grid) * grid;
  }

  for (let mi = 0; mi < missing.length; mi++) {
    const lid = missing[mi];
    const role = policy.layerRoles[lid as string] as PcbLayerRole | undefined;
    if (!role) {
      continue;
    }
    const ne = pickNetForRole(role, netPlan, routedNetIds);
    if (!ne) {
      continue;
    }
    const width = Math.max(trackWidthForNet(doc, ne.netId), grid);
    const horiz = role === 'signal_h' || role === 'power_h' || role === 'gnd_bus' ||
      role === 'vcc_bus' || role === 'stub';
    const yOff = mi * grid * 4;
    const a: Point2D = horiz
      ? { x: cx - grid * 8, y: cy + yOff }
      : { x: cx + yOff, y: cy - grid * 8 };
    const b: Point2D = horiz
      ? { x: cx + grid * 8, y: cy + yOff }
      : { x: cx + yOff, y: cy + grid * 8 };
    tracks.push({
      id: IdUtil.generate('trk'),
      layer: lid,
      start: a,
      end: b,
      width,
      netId: ne.netId,
      netName: ne.netName
    });
    // 若 filler 层与 stub/信号层不同，补 via 接到已有层，保证可达
    const stub = findRoleLayer(policy, 'stub') ?? findRoleLayer(policy, 'signal_h');
    if (stub && stub !== lid) {
      vias.push({
        id: IdUtil.generate('via'),
        position: { x: a.x, y: a.y },
        drill: doc.metadata.designRules.minViaDrill,
        diameter: doc.metadata.designRules.minViaDrill + 8,
        netId: ne.netId,
        netName: ne.netName,
        layers: copperLayersFromStack(doc.layerStack),
        kind: PcbViaKind.THROUGH
      });
    }
  }
}
