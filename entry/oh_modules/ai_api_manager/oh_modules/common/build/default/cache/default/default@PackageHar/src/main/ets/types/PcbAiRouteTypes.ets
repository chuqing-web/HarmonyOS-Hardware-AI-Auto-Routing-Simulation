/**
 * PCB AI 布线 / 布局管线类型 — LLM 策略产物 + 几何执行结果
 * 坐标策略：LLM 可输出封装位姿；禁止输出 track/via 折点。
 */
import { PcbLayerId, PcbTrack, PcbVia, PcbViaKind, PcbFootprintInst } from './PcbTypes';
import { Point2D } from './CommonTypes';

/** 铜层角色（由 LLM 填满当前 Cu 栈每一层） */
export type PcbLayerRole = 'gnd_bus' | 'vcc_bus' | 'signal_h' | 'signal_v' | 'stub' | 'power_h' | 'power_v';

/** 网络布线模式（对标原理图 forceWire / forceLabel） */
export type PcbRouteMode = 'forceTrack' | 'forcePour' | 'defer';

export type PcbNetKind = 'power' | 'gnd' | 'signal';

export interface PcbPlacementItem {
  footprintId: string;
  x: number;
  y: number;
  rotationDeg: number;
  mirrored?: boolean;
}

export interface PcbPlacementGroup {
  name: string;
  footprintIds: string[];
  note?: string;
}

/** LLM pcb_placement 输出 */
export interface PcbPlacementPlan {
  fromLlm: boolean;
  placements: PcbPlacementItem[];
  groups?: PcbPlacementGroup[];
  lockedIds?: string[];
  reason?: string;
}

export interface PcbNetPlanEntry {
  netId: string;
  netName: string;
  kind: PcbNetKind;
  routeMode: PcbRouteMode;
  /** 建议层角色键，如 gnd_bus / signal_h */
  layerHint?: string;
  priority: number;
}

/** LLM pcb_net_plan 输出 */
export interface PcbNetPlanResult {
  fromLlm: boolean;
  nets: PcbNetPlanEntry[];
  priorityOrder: string[];
  reason?: string;
}

export interface PcbViaPreference {
  kind: PcbViaKind;
  preferThrough: boolean;
}

/** LLM pcb_route 输出 — 层角色必须覆盖文档全部铜层 */
export interface PcbRoutePolicy {
  fromLlm: boolean;
  layerRoles: Record<string, PcbLayerRole>;
  netPriority: Record<string, number>;
  viaPreference: PcbViaPreference;
  globalConstraint: string;
  reason?: string;
}

/** LLM pcb_qa_repair 输出 */
export interface PcbQaRepairPlan {
  fromLlm: boolean;
  ripNetIds: string[];
  /** 覆盖/补丁层角色 */
  layerRolePatch?: Record<string, PcbLayerRole>;
  rePlaceFootprintIds?: string[];
  notes: string;
}

export interface PcbGeometrySeg {
  track?: PcbTrack;
  via?: PcbVia;
}

export interface PcbGeometryResult {
  ok: boolean;
  tracks: PcbTrack[];
  vias: PcbVia[];
  routedNetIds: string[];
  failedNetIds: string[];
  missingCopperLayers: PcbLayerId[];
  reason: string;
}

export interface PcbAiRouteResult {
  success: boolean;
  usedLlm: boolean;
  abortStage: string;
  abortReason: string;
  trackCount: number;
  viaCount: number;
  netCount: number;
  placedCount: number;
  messages: string[];
  /** 成功时工作副本结果；调用方负责提交，abort 时勿写回 */
  tracks?: PcbTrack[];
  vias?: PcbVia[];
  footprints?: PcbFootprintInst[];
  placementPlan?: PcbPlacementPlan;
  netPlan?: PcbNetPlanResult;
  routePolicy?: PcbRoutePolicy;
}

export function emptyPcbAiRouteResult(stage: string, reason: string, usedLlm: boolean): PcbAiRouteResult {
  return {
    success: false,
    usedLlm,
    abortStage: stage,
    abortReason: reason,
    trackCount: 0,
    viaCount: 0,
    netCount: 0,
    placedCount: 0,
    messages: [reason]
  };
}

export function copperRoleKeys(roles: Record<string, PcbLayerRole>): string[] {
  return Object.keys(roles);
}

/** 校验 policy 是否为每个铜层都指定了角色 */
export function policyCoversCopperLayers(policy: PcbRoutePolicy, copperLayers: PcbLayerId[]): string[] {
  const missing: string[] = [];
  for (let i = 0; i < copperLayers.length; i++) {
    const lid = copperLayers[i] as string;
    if (!policy.layerRoles[lid]) {
      missing.push(lid);
    }
  }
  return missing;
}

export interface PcbPadEndpoint {
  netId: string;
  netName: string;
  footprintId: string;
  padId: string;
  pos: Point2D;
}
