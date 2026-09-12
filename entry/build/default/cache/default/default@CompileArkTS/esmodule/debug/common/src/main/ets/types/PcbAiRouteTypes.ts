import type { PcbLayerId, PcbTrack, PcbVia, PcbViaKind, PcbFootprintInst } from './PcbTypes';
import type { Point2D } from './CommonTypes';
/** 铜层角色（由 LLM 填满当前 Cu 栈每一层） */
export type PcbLayerRole = 'gnd_bus' | 'vcc_bus' | 'signal_h' | 'signal_v' | 'stub' | 'power_h' | 'power_v';
/** 网络布线模式（对标原理图 forceWire / forceLabel） */
export type PcbRouteMode = 'forceTrack' | 'forcePour' | 'defer';
export type PcbNetKind = 'power' | 'gnd' | 'signal';
/** residual 分类，供 UI / 写回策略分流 */
export type PcbResidualKind = 'none' | 'drc' | 'unrouted' | 'unused_copper' | 'signal_fail' | 'placement_only';
/**
 * placement 阶段模式：
 * - full：空板/首次，LLM 全量定板+位姿
 * - auto：已有功能封装，把现板态势发给 LLM，由其 decision=keep|revise|relayout
 * - skip / revise：内部或程序化；UI 不再询问
 */
export type PcbPlacementMode = 'full' | 'auto' | 'skip' | 'revise';
/** auto 模式下 LLM 裁定：沿用 / 增量调整 / 整板重排 */
export type PcbPlacementDecision = 'keep' | 'revise' | 'relayout';
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
    /** auto：LLM 裁定 keep=沿用现位姿 / revise=增量改 / relayout=整板重排 */
    decision?: PcbPlacementDecision;
    /** 板框宽（mil，原点左下/左上矩形），由 LLM 决定 */
    boardWidthMil?: number;
    /** 板框高（mil） */
    boardHeightMil?: number;
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
/** LLM pcb_net_plan 输出；fromLocal=本地确定性策略（与 fromLlm 二选一可信） */
export interface PcbNetPlanResult {
    fromLlm: boolean;
    /** 本地确定性 builder 产出；几何门禁接受 fromLlm || fromLocal */
    fromLocal?: boolean;
    nets: PcbNetPlanEntry[];
    priorityOrder: string[];
    reason?: string;
}
/** 策略可信标记（LLM 或本地确定性） */
export interface PcbTrustedStrategyFlags {
    fromLlm: boolean;
    fromLocal?: boolean;
}
/** 网络计划/层策略是否可信（LLM 或本地确定性） */
export function isTrustedPcbStrategy(plan: PcbTrustedStrategyFlags): boolean {
    return plan.fromLlm || !!plan.fromLocal;
}
export interface PcbViaPreference {
    kind: PcbViaKind;
    preferThrough: boolean;
}
/** LLM / 本地 pcb_route 输出 — 层角色必须覆盖文档全部铜层 */
export interface PcbRoutePolicy {
    fromLlm: boolean;
    /** 本地确定性 builder 产出；几何门禁接受 fromLlm || fromLocal */
    fromLocal?: boolean;
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
    /** 升铜层（已废弃）：用户确认层数后锁定，管线忽略此字段 */
    raiseCopperTo?: number;
    notes: string;
}
export interface PcbGeometrySeg {
    track?: PcbTrack;
    via?: PcbVia;
}
/** LLM 走线折线（points 为正交折点，单位 mil） */
export interface PcbLlmTrackPath {
    netId: string;
    netName: string;
    layer: string;
    points: Point2D[];
    width?: number;
}
/** LLM 过孔 */
export interface PcbLlmViaSpec {
    netId: string;
    netName: string;
    x: number;
    y: number;
    fromLayer?: string;
    toLayer?: string;
}
/** LLM pcb_geometry 输出 — 模型决定拐弯与过孔位置 */
export interface PcbLlmGeometryPlan {
    fromLlm: boolean;
    tracks: PcbLlmTrackPath[];
    vias: PcbLlmViaSpec[];
    reason?: string;
}
/** 单网几何失败明细（供 QA / LLM 诊断，不含整板折点清单） */
export interface PcbGeoFailDetail {
    netId: string;
    netName: string;
    /** 失败焊盘对世界坐标 */
    from: Point2D;
    to: Point2D;
    /** 简短原因：pad_block / track_block / via_block / no_path */
    cause: string;
    /** 障碍物摘要，如 pad U1.3@510,480 layer=B.Cu */
    blocker?: string;
}
export interface PcbGeometryResult {
    ok: boolean;
    tracks: PcbTrack[];
    vias: PcbVia[];
    routedNetIds: string[];
    failedNetIds: string[];
    missingCopperLayers: PcbLayerId[];
    reason: string;
    /** 几何失败诊断（截断后供 prompt） */
    failDetails?: PcbGeoFailDetail[];
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
/** F8 走廊偏向（策略-only，几何仍本地） */
export type PcbPreferEdge = 'N' | 'S' | 'E' | 'W';
export interface PcbCorridorBias {
    preferLayer?: string;
    preferEdge?: PcbPreferEdge;
}
/**
 * LLM 可下发、本地引擎执行的操作。
 * 策略类：ripup / clear_reroute / force_hv / swap_hv
 * 几何类（坐标须落在板内；本地 clearance 校验，失败则跳过该条）：
 * - via_at：在 (x,y) 打通孔（可选 fromLayer/toLayer）
 * - via_near：在 (x,y) 附近搜索可放过孔点
 * - seg：在 layer 上布 (x,y)→(x2,y2) 正交段（非正交则拆成两段尝试）
 * - guide_maze：用本地 maze 连接 (x,y,layer)→(x2,y2,toLayer|layer)
 */
export type PcbAutoAgentOpKind = 'ripup' | 'clear_reroute' | 'force_hv' | 'swap_hv' | 'via_at' | 'via_near' | 'seg' | 'guide_maze';
export interface PcbAutoAgentOp {
    op: PcbAutoAgentOpKind;
    /** netId 或网名 */
    net: string;
    h?: string;
    v?: string;
    x?: number;
    y?: number;
    x2?: number;
    y2?: number;
    layer?: string;
    fromLayer?: string;
    toLayer?: string;
}
/** Strategy：层角色 + 网序 */
export interface PcbAutoGlobalAdvice {
    fromLlm: boolean;
    /** 本地兜底（非 LLM）；Router 认 fromLlm||fromLocal */
    fromLocal?: boolean;
    layerRoles: Record<string, PcbLayerRole>;
    netOrder: string[];
    reason?: string;
}
/** Strategy：拆线 / 重试序 / 走廊偏向 / 可执行 ops */
export interface PcbAutoRipupAdvice {
    fromLlm: boolean;
    fromLocal?: boolean;
    ripupTargets: string[];
    corridorBias: Record<string, PcbCorridorBias>;
    retryNetOrder?: string[];
    ops?: PcbAutoAgentOp[];
    reason?: string;
}
/** Routing：几何 ops 硬修（坐标由本地引擎校验） */
export interface PcbAutoGeometryAdvice {
    fromLlm: boolean;
    fromLocal?: boolean;
    ops: PcbAutoAgentOp[];
    retryNetOrder?: string[];
    reason?: string;
}
/** Placement Agent 输出（直接改板） */
export interface PcbPlacementAgentAdvice {
    fromLlm: boolean;
    fromLocal?: boolean;
    plan: PcbPlacementPlan;
    estimatedCompletionRate?: number;
    reason?: string;
}
/** Critic Agent 评审（不改板、不布线） */
export interface PcbCriticReport {
    fromLlm: boolean;
    fromLocal?: boolean;
    overallScore: number;
    /** 布通失败主因是否为布局 */
    layoutIssue: boolean;
    notes: string;
    suggestedRipup?: string[];
    suggestedRetryOrder?: string[];
}
/** Knowledge Agent 轻量快照（本地） */
export interface PcbKnowledgeSnapshot {
    ruleHints: string[];
    designSummary: string;
    sessionNotes: string[];
}
/** 挂点上下文（摘要文本，控制 token） */
export interface PcbAutoRouteAgentContext {
    copperLayers: string[];
    netSummaries: string[];
    failSummaries?: string[];
    errorDigests?: string[];
    metricsSummary?: string;
    /** 板框/铜量/层角色/拥塞等总览行 */
    situationLines?: string[];
    /** 飞线端点：net|a=(x,y)|b=(x,y)|span= */
    ratsDetails?: string[];
    /** 失败网焊盘采样：net|ref.pad@(x,y) */
    padSamples?: string[];
    /** Knowledge 注入的规则提示（可选） */
    knowledgeHints?: string[];
    /** 布局-布线回环轮次 0..N */
    placeRound?: number;
}
/**
 * RoutingCore（PcbAutoRouter）引擎钩子：仅 Strategy + Routing。
 * Critic / Placement / Knowledge 由 Orchestrator 调度，不进几何引擎。
 */
export interface PcbRouteEngineHooks {
    strategyPlan?: (ctx: PcbAutoRouteAgentContext) => Promise<PcbAutoGlobalAdvice | null>;
    strategyOnFail?: (ctx: PcbAutoRouteAgentContext) => Promise<PcbAutoRipupAdvice | null>;
    routingSalvage?: (ctx: PcbAutoRouteAgentContext) => Promise<PcbAutoGeometryAdvice | null>;
}
/**
 * 五 Agent 编排入口（Orchestrator 消费）。
 * Placement / Strategy / Routing / Critic 可 LLM；Knowledge 本地。
 */
export interface PcbRouteAgentBundle {
    placementOptimize: (ctx: PcbAutoRouteAgentContext) => Promise<PcbPlacementAgentAdvice | null>;
    strategyPlan: (ctx: PcbAutoRouteAgentContext) => Promise<PcbAutoGlobalAdvice | null>;
    strategyOnFail: (ctx: PcbAutoRouteAgentContext) => Promise<PcbAutoRipupAdvice | null>;
    routingSalvage: (ctx: PcbAutoRouteAgentContext) => Promise<PcbAutoGeometryAdvice | null>;
    criticReview: (ctx: PcbAutoRouteAgentContext) => Promise<PcbCriticReport | null>;
    knowledgePrepare: (ctx: PcbAutoRouteAgentContext) => Promise<PcbKnowledgeSnapshot | null>;
    knowledgeRecord: (ctx: PcbAutoRouteAgentContext, resultSummary: string) => void;
}
/** Router 是否采纳该建议（真 LLM 或显式本地兜底） */
export function isTrustedAutoAdvice(fromLlm: boolean, fromLocal?: boolean): boolean {
    return fromLlm || fromLocal === true;
}
const VALID_LAYER_ROLES: PcbLayerRole[] = [
    'gnd_bus', 'vcc_bus', 'signal_h', 'signal_v', 'stub', 'power_h', 'power_v'
];
export function isValidPcbLayerRole(role: string): boolean {
    for (let i = 0; i < VALID_LAYER_ROLES.length; i++) {
        if (VALID_LAYER_ROLES[i] === role) {
            return true;
        }
    }
    return false;
}
/** 校验 layerRoles 覆盖全部铜层且 role 合法；失败返回原因，通过返回 '' */
export function validateAutoLayerRoles(layerRoles: Record<string, PcbLayerRole>, copperLayers: PcbLayerId[]): string {
    let hasH = false;
    let hasV = false;
    for (let i = 0; i < copperLayers.length; i++) {
        const lid = copperLayers[i] as string;
        const r = layerRoles[lid];
        if (!r) {
            return `missing role for ${lid}`;
        }
        if (!isValidPcbLayerRole(r as string)) {
            return `invalid role ${r} for ${lid}`;
        }
        if (r === 'signal_h' || r === 'power_h') {
            hasH = true;
        }
        if (r === 'signal_v' || r === 'power_v') {
            hasV = true;
        }
    }
    // ≥3 层须有正交 H/V（信号或电源），且内层不能只剩 gnd/vcc 总线
    if (copperLayers.length >= 3) {
        if (!hasH || !hasV) {
            return 'need signal_h|power_h and signal_v|power_v for 3+ Cu (every layer routes)';
        }
        let innerRoutable = false;
        for (let i = 1; i < copperLayers.length - 1; i++) {
            const r = layerRoles[copperLayers[i] as string];
            if (r === 'signal_h' || r === 'signal_v' || r === 'power_h' || r === 'power_v' ||
                r === 'stub') {
                innerRoutable = true;
                break;
            }
        }
        if (copperLayers.length > 2 && !innerRoutable) {
            return 'inner Cu need routable role signal_h|signal_v|power_*|stub (not only gnd/vcc bus)';
        }
    }
    // Cu=2：至少一层 stub/signal，禁止两层都只标总线却无走线角色
    if (copperLayers.length === 2) {
        let routable = false;
        for (let i = 0; i < copperLayers.length; i++) {
            const r = layerRoles[copperLayers[i] as string];
            if (r === 'stub' || r === 'signal_h' || r === 'signal_v' ||
                r === 'power_h' || r === 'power_v') {
                routable = true;
                break;
            }
        }
        if (!routable) {
            return '2 Cu need stub|signal_*|power_* on at least one layer';
        }
    }
    return '';
}
