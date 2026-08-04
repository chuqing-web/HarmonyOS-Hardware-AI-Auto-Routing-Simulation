import type { PcbLayerId, PcbTrack, PcbVia, PcbViaKind, PcbFootprintInst } from './PcbTypes';
import type { Point2D } from './CommonTypes';
/** 铜层角色（由 LLM 填满当前 Cu 栈每一层） */
export type PcbLayerRole = 'gnd_bus' | 'vcc_bus' | 'signal_h' | 'signal_v' | 'stub' | 'power_h' | 'power_v';
/** 网络布线模式（对标原理图 forceWire / forceLabel） */
export type PcbRouteMode = 'forceTrack' | 'forcePour' | 'defer';
export type PcbNetKind = 'power' | 'gnd' | 'signal';
/** residual 分类，供 UI / 写回策略分流 */
export type PcbResidualKind = 'none' | 'drc' | 'unrouted' | 'unused_copper' | 'signal_fail' | 'placement_only';
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
    /** 电源总线 Y 偏移（mil，相对 pad 均值；QA/策略可写） */
    busYOffset?: number;
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
    /**
     * 改 routeMode：key=netId 或网名；Cu=2 电源总线 clearance 失败时优先
     * 将 forcePour→forceTrack（改走信号几何，避开宽总线）
     */
    routeModePatch?: Record<string, PcbRouteMode>;
    /** 电源总线 Y 偏移补丁：key=netId|网名，value=mil */
    busYOffsetPatch?: Record<string, number>;
    /** 升铜层：2→4/6/8；执行后须补 layerRolePatch 覆盖新层（缺则本地填默认） */
    raiseCopperTo?: number;
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
    /** 对标原理图 deliveredWithResidual：critique/DRC 未清零但 ACCEPT 交付 */
    deliveredWithResidual?: boolean;
    residualKind?: PcbResidualKind;
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
        messages: [reason],
        residualKind: 'none'
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
function roleInPolicy(policy: PcbRoutePolicy, role: PcbLayerRole): boolean {
    const keys = Object.keys(policy.layerRoles);
    for (let i = 0; i < keys.length; i++) {
        if (policy.layerRoles[keys[i]] === role) {
            return true;
        }
    }
    return false;
}
/**
 * 相对 netPlan 的层角色语义校验。
 * 返回空数组=通过；否则为可注入 LLM 的失败原因。
 */
export function validateLayerRoleSemantics(policy: PcbRoutePolicy, netPlan: PcbNetPlanResult): string[] {
    const errs: string[] = [];
    let needGnd = false;
    let needPower = false;
    let needSignal = false;
    for (let i = 0; i < netPlan.nets.length; i++) {
        const n = netPlan.nets[i];
        if (n.routeMode === 'defer') {
            continue;
        }
        if (n.kind === 'gnd') {
            needGnd = true;
        }
        else if (n.kind === 'power') {
            needPower = true;
        }
        else {
            needSignal = true;
        }
    }
    const hasGndBus = roleInPolicy(policy, 'gnd_bus') || roleInPolicy(policy, 'power_h') ||
        roleInPolicy(policy, 'power_v') || roleInPolicy(policy, 'signal_h') || roleInPolicy(policy, 'stub');
    const hasVccBus = roleInPolicy(policy, 'vcc_bus') || roleInPolicy(policy, 'power_v') ||
        roleInPolicy(policy, 'power_h') || roleInPolicy(policy, 'signal_h') || roleInPolicy(policy, 'stub');
    if (needGnd && !hasGndBus) {
        errs.push('missing gnd_bus|power_h for gnd nets');
    }
    if (needPower && !hasVccBus) {
        errs.push('missing vcc_bus|power_h for power nets');
    }
    if (needSignal) {
        const hasH = roleInPolicy(policy, 'signal_h') || roleInPolicy(policy, 'power_h') ||
            roleInPolicy(policy, 'gnd_bus') || roleInPolicy(policy, 'vcc_bus');
        const hasStub = roleInPolicy(policy, 'stub') || roleInPolicy(policy, 'signal_v') ||
            roleInPolicy(policy, 'signal_h');
        if (!hasH || !hasStub) {
            errs.push('missing signal_h/stub for signal nets');
        }
    }
    return errs;
}
/** patch 后是否仍保留 stub（有内层总线时必需） */
export function policyHasStub(policy: PcbRoutePolicy): boolean {
    return roleInPolicy(policy, 'stub');
}
export interface PcbPadEndpoint {
    netId: string;
    netName: string;
    footprintId: string;
    padId: string;
    pos: Point2D;
}
