/**
 * PCB LLM JSON 解析 — 失败返回 null（禁止本地默认冒充）
 */
import {
  PcbPlacementPlan, PcbPlacementItem, PcbPlacementGroup, PcbNetPlanResult, PcbNetPlanEntry,
  PcbRoutePolicy, PcbQaRepairPlan, PcbLayerRole, PcbRouteMode, PcbNetKind,
  PcbViaKind, PcbLlmGeometryPlan, PcbLlmTrackPath, PcbLlmViaSpec, Point2D,
  Logger, INSTR_TRACE_TAG
} from 'common';
import { PromptLoader } from '../../prompts/PromptLoader';

function asString(v: Object | undefined | null, fallback: string = ''): string {
  if (v === undefined || v === null) {
    return fallback;
  }
  return String(v);
}

function asNumber(v: Object | undefined | null, fallback: number = 0): number {
  if (v === undefined || v === null) {
    return fallback;
  }
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

function asBool(v: Object | undefined | null, fallback: boolean = false): boolean {
  if (v === undefined || v === null) {
    return fallback;
  }
  return v === true || String(v) === 'true';
}

function parseKind(s: string): PcbNetKind {
  const u = s.toLowerCase();
  if (u === 'gnd' || u === 'ground') {
    return 'gnd';
  }
  if (u === 'power' || u === 'pwr') {
    return 'power';
  }
  return 'signal';
}

function parseMode(s: string): PcbRouteMode {
  const u = s.toLowerCase();
  if (u === 'forcepour' || u === 'force_pour') {
    return 'forcePour';
  }
  if (u === 'defer') {
    return 'defer';
  }
  return 'forceTrack';
}

function parseRole(s: string): PcbLayerRole | null {
  const u = s.toLowerCase().trim();
  if (u === 'gnd_bus' || u === 'gndbus' || u === 'gnd') {
    return 'gnd_bus';
  }
  if (u === 'vcc_bus' || u === 'vccbus' || u === 'vcc') {
    return 'vcc_bus';
  }
  if (u === 'signal_h' || u === 'signalh') {
    return 'signal_h';
  }
  if (u === 'signal_v' || u === 'signalv') {
    return 'signal_v';
  }
  if (u === 'stub') {
    return 'stub';
  }
  if (u === 'power_h' || u === 'powerh' || u === 'power') {
    return 'power_h';
  }
  if (u === 'power_v' || u === 'powerv') {
    return 'power_v';
  }
  return null;
}

/** 扁平化 layerRolePatch：支持 {"B.Cu":"gnd_bus"} 与错误嵌套 {"GND":{"B.Cu":"gnd_bus"}} */
function collectLayerRolePatch(
  raw: Record<string, Object>,
  out: Record<string, PcbLayerRole>
): void {
  const keys = Object.keys(raw);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const v = raw[k];
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      collectLayerRolePatch(v as Record<string, Object>, out);
      continue;
    }
    const role = parseRole(asString(v));
    if (role) {
      out[k] = role;
    }
  }
}

export function parsePcbPlacementPlan(raw: string): PcbPlacementPlan | null {
  const json = PromptLoader.extractJson<Record<string, Object>>(raw);
  if (!json) {
    Logger.warn(INSTR_TRACE_TAG, '[AI_PCB] placement JSON parse fail');
    return null;
  }
  const arr = (json['placements'] ?? json['placement']) as Object[] | undefined;
  if (!arr || !Array.isArray(arr) || arr.length === 0) {
    return null;
  }
  const placements: PcbPlacementItem[] = [];
  for (let i = 0; i < arr.length; i++) {
    const o = arr[i] as Record<string, Object>;
    const id = asString(o['footprintId'] ?? o['footprint_id'] ?? o['id']);
    if (id.length === 0) {
      continue;
    }
    placements.push({
      footprintId: id,
      x: asNumber(o['x']),
      y: asNumber(o['y']),
      rotationDeg: asNumber(o['rotationDeg'] ?? o['rotation'] ?? o['rotation_deg']),
      mirrored: asBool(o['mirrored'])
    });
  }
  if (placements.length === 0) {
    return null;
  }
  const lockedRaw = json['lockedIds'] ?? json['locked_ids'];
  const lockedIds: string[] = [];
  if (Array.isArray(lockedRaw)) {
    for (let i = 0; i < (lockedRaw as Object[]).length; i++) {
      lockedIds.push(asString((lockedRaw as Object[])[i]));
    }
  }
  const groups: PcbPlacementGroup[] = [];
  const gRaw = json['groups'];
  if (Array.isArray(gRaw)) {
    for (let i = 0; i < (gRaw as Object[]).length; i++) {
      const g = (gRaw as Object[])[i] as Record<string, Object>;
      const name = asString(g['name']);
      const ids: string[] = [];
      const idArr = g['footprintIds'] ?? g['footprint_ids'];
      if (Array.isArray(idArr)) {
        for (let j = 0; j < (idArr as Object[]).length; j++) {
          const id = asString((idArr as Object[])[j]);
          if (id.length > 0) {
            ids.push(id);
          }
        }
      }
      if (ids.length > 0) {
        groups.push({
          name: name.length > 0 ? name : `g${i}`,
          footprintIds: ids,
          note: asString(g['note']) || undefined
        });
      }
    }
  }
  // 板框尺寸：boardWidthMil/boardHeightMil 或 boardSize.{width,height} / width+height
  let boardWidthMil: number | undefined = undefined;
  let boardHeightMil: number | undefined = undefined;
  const bw = asNumber(json['boardWidthMil'] ?? json['board_width_mil'] ?? json['boardWidth'] ??
    json['widthMil'] ?? json['width_mil']);
  const bh = asNumber(json['boardHeightMil'] ?? json['board_height_mil'] ?? json['boardHeight'] ??
    json['heightMil'] ?? json['height_mil']);
  if (bw > 0 && bh > 0) {
    boardWidthMil = bw;
    boardHeightMil = bh;
  } else {
    const bs = json['boardSize'] ?? json['board_size'] ?? json['board'];
    if (bs !== null && typeof bs === 'object' && !Array.isArray(bs)) {
      const o = bs as Record<string, Object>;
      const w2 = asNumber(o['widthMil'] ?? o['width_mil'] ?? o['width'] ?? o['w']);
      const h2 = asNumber(o['heightMil'] ?? o['height_mil'] ?? o['height'] ?? o['h']);
      if (w2 > 0 && h2 > 0) {
        boardWidthMil = w2;
        boardHeightMil = h2;
      }
    }
  }

  return {
    fromLlm: true,
    placements,
    lockedIds,
    groups: groups.length > 0 ? groups : undefined,
    boardWidthMil,
    boardHeightMil
  };
}

export function parsePcbNetPlan(raw: string): PcbNetPlanResult | null {
  const json = PromptLoader.extractJson<Record<string, Object>>(raw);
  if (!json) {
    return null;
  }
  const arr = json['nets'] as Object[] | undefined;
  if (!arr || !Array.isArray(arr) || arr.length === 0) {
    return null;
  }
  const nets: PcbNetPlanEntry[] = [];
  for (let i = 0; i < arr.length; i++) {
    const o = arr[i] as Record<string, Object>;
    const netId = asString(o['netId'] ?? o['net_id']);
    const netName = asString(o['netName'] ?? o['net_name'] ?? netId);
    if (netId.length === 0 && netName.length === 0) {
      continue;
    }
    nets.push({
      netId: netId.length > 0 ? netId : netName,
      netName,
      kind: parseKind(asString(o['kind'], 'signal')),
      routeMode: parseMode(asString(o['routeMode'] ?? o['route_mode'], 'forceTrack')),
      layerHint: asString(o['layerHint'] ?? o['layer_hint']) || undefined,
      busYOffset: o['busYOffset'] !== undefined || o['bus_y_offset'] !== undefined
        ? asNumber(o['busYOffset'] ?? o['bus_y_offset'], 0)
        : undefined,
      priority: asNumber(o['priority'], 5)
    });
  }
  if (nets.length === 0) {
    return null;
  }
  const po = json['priorityOrder'] ?? json['priority_order'];
  const priorityOrder: string[] = [];
  if (Array.isArray(po)) {
    for (let i = 0; i < (po as Object[]).length; i++) {
      priorityOrder.push(asString((po as Object[])[i]));
    }
  }
  return { fromLlm: true, nets, priorityOrder };
}

export function parsePcbRoutePolicy(raw: string): PcbRoutePolicy | null {
  const json = PromptLoader.extractJson<Record<string, Object>>(raw);
  if (!json) {
    return null;
  }
  const rolesRaw = json['layerRoles'] ?? json['layer_roles'];
  if (!rolesRaw || typeof rolesRaw !== 'object') {
    return null;
  }
  const layerRoles: Record<string, PcbLayerRole> = {};
  const keys = Object.keys(rolesRaw as object);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const role = parseRole(asString((rolesRaw as Record<string, Object>)[k]));
    if (!role) {
      Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] unknown layer role for ${k}`);
      return null;
    }
    layerRoles[k] = role;
  }
  if (Object.keys(layerRoles).length === 0) {
    return null;
  }
  const emptyRec: Record<string, Object> = {};
  const npRawObj = json['netPriority'] ?? json['net_priority'] ?? emptyRec;
  const netPriority: Record<string, number> = {};
  const npKeys = Object.keys(npRawObj as object);
  for (let i = 0; i < npKeys.length; i++) {
    netPriority[npKeys[i]] = asNumber((npRawObj as Record<string, Object>)[npKeys[i]], 5);
  }
  const viaEmpty: Record<string, Object> = {};
  const viaRaw = (json['viaPreference'] ?? json['via_preference'] ?? viaEmpty) as Record<string, Object>;
  const preferThrough = asBool(viaRaw['preferThrough'] ?? viaRaw['prefer_through'], true);
  const kindStr = asString(viaRaw['kind'], 'through').toLowerCase();
  let kind = PcbViaKind.THROUGH;
  if (kindStr === 'blind') {
    kind = PcbViaKind.BLIND;
  } else if (kindStr === 'buried') {
    kind = PcbViaKind.BURIED;
  }
  return {
    fromLlm: true,
    layerRoles,
    netPriority,
    viaPreference: { kind, preferThrough },
    globalConstraint: asString(json['globalConstraint'] ?? json['global_constraint'])
  };
}

export function parsePcbQaRepair(raw: string): PcbQaRepairPlan | null {
  const json = PromptLoader.extractJson<Record<string, Object>>(raw);
  if (!json) {
    return null;
  }
  const rip: string[] = [];
  const ripRaw = json['ripNetIds'] ?? json['rip_net_ids'];
  if (Array.isArray(ripRaw)) {
    for (let i = 0; i < (ripRaw as Object[]).length; i++) {
      rip.push(asString((ripRaw as Object[])[i]));
    }
  }
  const patchRaw = json['layerRolePatch'] ?? json['layer_role_patch'];
  let layerRolePatch: Record<string, PcbLayerRole> | undefined = undefined;
  if (patchRaw && typeof patchRaw === 'object') {
    layerRolePatch = {};
    collectLayerRolePatch(patchRaw as Record<string, Object>, layerRolePatch);
    if (Object.keys(layerRolePatch).length === 0) {
      layerRolePatch = undefined;
    }
  }
  const rePlace: string[] = [];
  const rp = json['rePlaceFootprintIds'] ?? json['replace_footprint_ids'];
  if (Array.isArray(rp)) {
    for (let i = 0; i < (rp as Object[]).length; i++) {
      rePlace.push(asString((rp as Object[])[i]));
    }
  }

  let routeModePatch: Record<string, PcbRouteMode> | undefined = undefined;
  const rmp = json['routeModePatch'] ?? json['route_mode_patch'];
  if (rmp && typeof rmp === 'object') {
    routeModePatch = {};
    const keys = Object.keys(rmp as Record<string, Object>);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      routeModePatch[k] = parseMode(asString((rmp as Record<string, Object>)[k]));
    }
    if (Object.keys(routeModePatch).length === 0) {
      routeModePatch = undefined;
    }
  }

  let busYOffsetPatch: Record<string, number> | undefined = undefined;
  const byp = json['busYOffsetPatch'] ?? json['bus_y_offset_patch'];
  if (byp && typeof byp === 'object') {
    busYOffsetPatch = {};
    const keys = Object.keys(byp as Record<string, Object>);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      busYOffsetPatch[k] = asNumber((byp as Record<string, Object>)[k], 0);
    }
    if (Object.keys(busYOffsetPatch).length === 0) {
      busYOffsetPatch = undefined;
    }
  }

  let raiseCopperTo: number | undefined = undefined;
  const raiseRaw = json['raiseCopperTo'] ?? json['raise_copper_to'];
  if (raiseRaw !== undefined && raiseRaw !== null) {
    const n = asNumber(raiseRaw, 0);
    if (n === 4 || n === 6 || n === 8) {
      raiseCopperTo = n;
    }
  }

  return {
    fromLlm: true,
    ripNetIds: rip,
    layerRolePatch,
    rePlaceFootprintIds: rePlace,
    routeModePatch,
    busYOffsetPatch,
    raiseCopperTo,
    notes: asString(json['notes'])
  };
}

function parsePoint(v: Object | undefined | null): Point2D | null {
  if (v === undefined || v === null) {
    return null;
  }
  if (Array.isArray(v)) {
    const arr = v as Object[];
    if (arr.length < 2) {
      return null;
    }
    const x = asNumber(arr[0], NaN);
    const y = asNumber(arr[1], NaN);
    if (isNaN(x) || isNaN(y) || Math.abs(x) > 50000 || Math.abs(y) > 50000) {
      return null;
    }
    return { x, y };
  }
  if (typeof v === 'object') {
    const o = v as Record<string, Object>;
    const x = asNumber(o['x'] ?? o['X'], NaN);
    const y = asNumber(o['y'] ?? o['Y'], NaN);
    if (isNaN(x) || isNaN(y)) {
      return null;
    }
    // 拒绝离谱坐标（单位混淆 / 幻觉）
    if (Math.abs(x) > 50000 || Math.abs(y) > 50000) {
      return null;
    }
    return { x, y };
  }
  return null;
}

export function parsePcbGeometryPlan(raw: string): PcbLlmGeometryPlan | null {
  const json = PromptLoader.extractJson<Record<string, Object>>(raw);
  if (!json) {
    Logger.warn(INSTR_TRACE_TAG,
      `[AI_PCB] geometry parse null | ${PromptLoader.describeJsonImpurity(raw)}`);
    return null;
  }
  let skippedShort = 0;
  let skippedNoNet = 0;
  const tracks: PcbLlmTrackPath[] = [];
  const tracksRaw = json['tracks'] ?? json['Tracks'];
  if (Array.isArray(tracksRaw)) {
    for (let i = 0; i < (tracksRaw as Object[]).length; i++) {
      const t = (tracksRaw as Object[])[i] as Record<string, Object>;
      if (!t || typeof t !== 'object') {
        continue;
      }
      const ptsRaw = t['points'] ?? t['pts'] ?? t['path'];
      const points: Point2D[] = [];
      if (Array.isArray(ptsRaw)) {
        for (let j = 0; j < (ptsRaw as Object[]).length; j++) {
          const p = parsePoint((ptsRaw as Object[])[j]);
          if (p && !isNaN(p.x) && !isNaN(p.y)) {
            points.push(p);
          }
        }
      }
      if (points.length < 2) {
        skippedShort++;
        continue;
      }
      const netId = asString(t['netId'] ?? t['net_id']);
      const netName = asString(t['netName'] ?? t['net_name'] ?? t['net']);
      if (netId.length === 0 && netName.length === 0) {
        skippedNoNet++;
        continue;
      }
      const widthRaw = t['width'];
      const width = (widthRaw !== undefined && widthRaw !== null) ?
        asNumber(widthRaw, 0) : undefined;
      tracks.push({
        netId,
        netName,
        layer: asString(t['layer'] ?? t['Layer']),
        points,
        width: (width !== undefined && width > 0) ? width : undefined
      });
    }
  }
  const vias: PcbLlmViaSpec[] = [];
  const viasRaw = json['vias'] ?? json['Vias'];
  if (Array.isArray(viasRaw)) {
    for (let i = 0; i < (viasRaw as Object[]).length; i++) {
      const v = (viasRaw as Object[])[i] as Record<string, Object>;
      if (!v || typeof v !== 'object') {
        continue;
      }
      const x = asNumber(v['x'] ?? v['X'], NaN);
      const y = asNumber(v['y'] ?? v['Y'], NaN);
      if (isNaN(x) || isNaN(y) || Math.abs(x) > 50000 || Math.abs(y) > 50000) {
        continue;
      }
      const netId = asString(v['netId'] ?? v['net_id']);
      const netName = asString(v['netName'] ?? v['net_name'] ?? v['net']);
      if (netId.length === 0 && netName.length === 0) {
        skippedNoNet++;
        continue;
      }
      vias.push({
        netId,
        netName,
        x,
        y,
        fromLayer: asString(v['fromLayer'] ?? v['from_layer'] ?? 'F.Cu') || undefined,
        toLayer: asString(v['toLayer'] ?? v['to_layer'] ?? 'B.Cu') || undefined
      });
    }
  }
  if (skippedShort > 0 || skippedNoNet > 0) {
    Logger.warn(INSTR_TRACE_TAG,
      `[AI_PCB] geometry parse skips shortSeg=${skippedShort} noNet=${skippedNoNet}`);
  }
  if (tracks.length === 0 && vias.length === 0) {
    Logger.warn(INSTR_TRACE_TAG, '[AI_PCB] geometry LLM JSON empty tracks/vias');
    return null;
  }
  return {
    fromLlm: true,
    tracks,
    vias,
    reason: asString(json['reason'] ?? json['notes'])
  };
}
