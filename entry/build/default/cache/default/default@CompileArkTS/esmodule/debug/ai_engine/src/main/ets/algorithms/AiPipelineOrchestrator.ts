import type { IAiApiManager, ChatOptions } from 'ai_api_manager';
import type { IComponentLibrary } from 'component_library';
import { AiCapability, makeProgress, IdUtil, ErcSeverity, TopologyAdapter, makeDeviceInst, stringMap1, EventBus, ModuleEvent, Logger, INSTR_TRACE_TAG, traceAiPayload, traceAiOp, AiErcGateUtil, DeviceHitGeometry } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchTopology, AiPipelineResult, DeviceSelectLlmOutput, LayoutLlmOutput, RoutingLlmOutput, ProgressCallback, DiagError, MatchedDevice, RoutingWeightPrefs, ErcError, Point2D, DeviceInst, LayoutPositionItem, PlacementResult, PlacementCandidate, DevicePosition, ModuleEventPayload } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { PromptLoader } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/prompts/PromptLoader";
import type { PromptVarEntry, ChatHistoryEntry } from '../internal/AiEngineTypes';
import { DeviceSelectEngine } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/DeviceSelectEngine";
import { PlacementOptimizer } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/PlacementOptimizer";
import { ConstrainedWiringEngine } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/ConstrainedWiringEngine";
import { FaultDiagnoser } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/FaultDiagnoser";
import { LlmJsonNormalizer } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/LlmJsonNormalizer";
import { NetPlanExecutor } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/NetPlanExecutor";
import type { NetPlanResult } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/NetPlanExecutor";
import { SemanticNetBuilder } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/SemanticNetBuilder";
import { PostGenValidator } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/PostGenValidator";
import type { ValidationIssue } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/PostGenValidator";
export interface PipelineOptions {
    prompt: string;
    scene?: 'text_gen' | 'partial_assist';
    partialTopo?: SchTopology;
    lockedDeviceUuids?: string[];
    mcuFamily?: string;
    /** 仅验收/离线单测显式开启；生产整图生成不得依赖此路径 */
    skipLlm?: boolean;
    routingWeights?: RoutingWeightPrefs;
    /** 流式画布回调：每完成一个视觉阶段（摆放/建网/布线）即触发，用于逐帧渲染 */
    onStreamSnapshot?: (topo: SchTopology, stage: string) => void;
    /** 多轮对话历史，用于 LLM 上下文继承 */
    conversationHistory?: ChatHistoryEntry[];
    /** 生成模式: create=从零创建, edit=基于现有电路修改 */
    generationMode?: 'create' | 'edit';
}
interface AiDiagnoseFixResult {
    topo: SchTopology;
    fixes: number;
    diag: DiagError[];
}
interface LlmFetchResult<T> {
    output: T;
    fromLlm: boolean;
}
interface CacheEntry {
    value: object;
    timestamp: number;
}
interface ChatResult {
    success: boolean;
    data?: string;
    error?: string;
}
interface AiFixDetail {
    libDevId?: string;
    refName?: string;
    x?: number;
    y?: number;
    paramKey?: string;
    paramValue?: string;
    reason?: string;
}
interface AiReviewIssue {
    type: string;
    severity: 'error' | 'warning';
    desc: string;
    targetDevice?: string;
    fixAction: string;
    fixDetail?: AiFixDetail;
}
interface AiSelfReviewResult {
    passed: boolean;
    issues: AiReviewIssue[];
    summary: string;
}
interface AiFixExecResult {
    fixCount: number;
    needReroute: boolean;
}
interface DeviceIndexPair {
    d: DeviceInst;
    i: number;
}
interface DegradedEventData {
    message: string;
}
/** 编辑模式注入 prompt 的器件摘要（避免匿名对象字面量） */
interface PartialTopoPromptItem {
    ref: string;
    id: string;
    x: number;
    y: number;
    rot: number;
}
const CACHE_TTL_MS = 5 * 60 * 1000;
const LLM_MAX_RETRIES = 2;
/** 永不主动 ABORT：阶段级硬重试上限（防死循环；达上限仍尽量带最佳结果继续） */
const NEVER_ABORT_ROUNDS = 24;
const NEVER_ABORT_OUTER = 8;
const LLM_BASE_BACKOFF_MS = 1000;
const LLM_MAX_OUTPUT_TOKENS = 65536;
const QUALITY_MIN_FILL_RATE = 0.6;
export class AiPipelineOrchestrator {
    private apiManager: IAiApiManager;
    private componentLibrary: IComponentLibrary;
    private selectEngine: DeviceSelectEngine;
    private placementOptimizer: PlacementOptimizer = new PlacementOptimizer();
    private wiringEngine: ConstrainedWiringEngine = new ConstrainedWiringEngine();
    private constraintCache: Map<string, CacheEntry> = new Map();
    constructor(apiManager: IAiApiManager, library: IComponentLibrary) {
        this.apiManager = apiManager;
        this.componentLibrary = library;
        this.selectEngine = new DeviceSelectEngine(library);
        this.wiringEngine.setComponentLibrary(library);
        this.placementOptimizer.setComponentLibrary(library);
    }
    async runFullPipeline(opts: PipelineOptions, onProgress?: ProgressCallback): Promise<AiPipelineResult> {
        let usedLlm = false;
        let degradedMode = false;
        Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] START promptLen=${opts.prompt.length} skipLlm=${!!opts.skipLlm}` +
            ` scene=${opts.scene ?? 'text_gen'} mcu=${opts.mcuFamily ?? 'auto'}`);
        traceAiPayload('AI_PIPE', 'USER', opts.prompt, `scene=${opts.scene ?? 'text_gen'} skipLlm=${!!opts.skipLlm}`);
        traceAiOp('AI_PIPE', 'pipeline_start', `scene=${opts.scene ?? 'text_gen'} mcu=${opts.mcuFamily ?? 'auto'}`);
        onProgress?.(makeProgress(5, '解析器件需求(LLM)'));
        traceAiOp('AI_PIPE', 'device_select', 'fetch LLM JSON');
        let selectLlm = await this.fetchDeviceSelectLlm(opts);
        for (let outer = 0; !selectLlm.fromLlm && !opts.skipLlm && outer < NEVER_ABORT_OUTER; outer++) {
            Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] KEEP_RETRY device_select outer=${outer + 1}/${NEVER_ABORT_OUTER}`);
            onProgress?.(makeProgress(5, `器件选型重试 ${outer + 1}`));
            selectLlm = await this.fetchDeviceSelectLlm(opts);
        }
        if (selectLlm.fromLlm) {
            usedLlm = true;
            Logger.info(INSTR_TRACE_TAG, '[AI_PIPE] device_select from LLM');
            try {
                traceAiPayload('AI_PIPE', 'SELECT_JSON', JSON.stringify(selectLlm.output), 'stage=device_select');
            }
            catch (_e) {
                Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] SELECT_JSON stringify failed');
            }
        }
        else if (!opts.skipLlm) {
            Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] KEEP_RETRY device_select weak — continue best effort (no ABORT)');
            usedLlm = true;
        }
        else {
            degradedMode = true;
            Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] device_select local (skipLlm)');
            this.notifyDegraded('器件选型');
        }
        onProgress?.(makeProgress(20, '本地器件库匹配'));
        traceAiOp('AI_PIPE', 'library_match', 'matchFromLlmOutput');
        let selectResult = this.selectEngine.matchFromLlmOutput(selectLlm.output, opts.prompt);
        for (let outer = 0; selectResult.devices.length === 0 && !opts.skipLlm && outer < NEVER_ABORT_OUTER; outer++) {
            Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] KEEP_RETRY zero matches → re-select outer=${outer + 1}/${NEVER_ABORT_OUTER}`);
            onProgress?.(makeProgress(20, `库匹配为空，重选 ${outer + 1}`));
            selectLlm = await this.fetchDeviceSelectLlm(opts);
            if (selectLlm.fromLlm) {
                usedLlm = true;
            }
            selectResult = this.selectEngine.matchFromLlmOutput(selectLlm.output, opts.prompt);
        }
        if (selectResult.devices.length === 0) {
            Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] KEEP_RETRY zero matches — continue (no ABORT)');
        }
        if (selectLlm.output.oodFlags && selectLlm.output.oodFlags.length > 0) {
            Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] OOD notes (non-fatal): ${selectLlm.output.oodFlags.join(',')}`);
        }
        const matchHint = selectResult.devices
            .slice(0, 8)
            .map(d => `${d.libDevId}/${d.matchLevel}`)
            .join(', ');
        Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] matched ${selectResult.devices.length}: ${matchHint}`);
        traceAiOp('AI_PIPE', 'library_match_done', `count=${selectResult.devices.length} ${matchHint}`);
        onProgress?.(makeProgress(28, `匹配 ${selectResult.devices.length}: ${matchHint}`));
        onProgress?.(makeProgress(35, '获取布局约束'));
        traceAiOp('AI_PIPE', 'layout_constraints', 'fetch LLM or default');
        let layoutLlm = await this.fetchLayoutLlm(selectResult.devices, selectLlm.output.circuitConstraint, opts);
        for (let outer = 0; (!layoutLlm.fromLlm || !(layoutLlm.output.positions && layoutLlm.output.positions.length > 0)) &&
            !opts.skipLlm && selectResult.devices.length > 0 && outer < NEVER_ABORT_OUTER; outer++) {
            Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] KEEP_RETRY layout outer=${outer + 1}/${NEVER_ABORT_OUTER}`);
            onProgress?.(makeProgress(35, `布局重试 ${outer + 1}`));
            layoutLlm = await this.fetchLayoutLlm(selectResult.devices, selectLlm.output.circuitConstraint, opts);
        }
        if (layoutLlm.fromLlm) {
            usedLlm = true;
            Logger.info(INSTR_TRACE_TAG, '[AI_PIPE] layout constraints from LLM');
            try {
                traceAiPayload('AI_PIPE', 'LAYOUT_JSON', JSON.stringify(layoutLlm.output), 'stage=layout');
            }
            catch (_e) {
                Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] LAYOUT_JSON stringify failed');
            }
        }
        else if (!opts.skipLlm) {
            Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] KEEP_RETRY layout weak — continue (no ABORT)');
            usedLlm = true;
        }
        else {
            degradedMode = true;
            Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] layout constraints local (skipLlm)');
            this.notifyDegraded('布局约束');
        }
        // AI 坐标布局；无坐标则确定性摆放继续（永不 ABORT）
        const aiPositions = layoutLlm.output.positions;
        let placement: PlacementResult;
        if (aiPositions && aiPositions.length > 0) {
            onProgress?.(makeProgress(50, 'AI 坐标布局'));
            traceAiOp('AI_PIPE', 'placement', 'AI position-driven');
            placement = this.applyAiPositions(selectResult.devices, aiPositions, opts.lockedDeviceUuids ?? [], opts.partialTopo);
            this.placementOptimizer.resolveSelectionOverlaps(placement.topology);
            Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] placement AI-driven: ${aiPositions.length} positions (hit-overlap resolved)`);
        }
        else {
            onProgress?.(makeProgress(50, '坐标缺失→确定性摆放继续'));
            traceAiOp('AI_PIPE', 'placement', 'GA/default continue (no ABORT)');
            placement = await this.placementOptimizer.optimizeAsync(selectResult.devices, layoutLlm.output, opts.lockedDeviceUuids ?? [], opts.partialTopo);
            this.placementOptimizer.resolveSelectionOverlaps(placement.topology);
            Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] KEEP_RETRY placement without LLM positions — placed=${placement.topology.deviceList.length}`);
        }
        const placeHint = placement.topology.deviceList
            .slice(0, 10)
            .map(d => `${d.refName || d.libDevId}@(${Math.round(d.x)},${Math.round(d.y)})`)
            .join(', ');
        Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] placement devices=${placement.topology.deviceList.length}`);
        traceAiOp('AI_PIPE', 'placement_done', `devices=${placement.topology.deviceList.length} ${placeHint}`);
        // 流式快照 #1: 器件已摆放，尚无网络/导线
        opts.onStreamSnapshot?.(placement.topology, 'placement');
        // LLM 网络拓扑：KEEP_RETRY，永不因 critique 主动 ABORT
        onProgress?.(makeProgress(62, 'LLM 网络拓扑规划'));
        traceAiOp('AI_PIPE', 'net_plan', 'LLM net_plan + NetPlanExecutor');
        let netPlanResult = await this.fetchNetPlanLlm(placement.topology, opts);
        for (let outer = 0; !netPlanResult.fromLlm && !opts.skipLlm && outer < NEVER_ABORT_OUTER; outer++) {
            Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] KEEP_RETRY net_plan outer=${outer + 1}/${NEVER_ABORT_OUTER}`);
            onProgress?.(makeProgress(62, `网络规划重试 ${outer + 1}`));
            netPlanResult = await this.fetchNetPlanLlm(placement.topology, opts);
        }
        let topoWithNets: SchTopology;
        let netPlanNotes = '';
        if (netPlanResult.fromLlm ||
            (netPlanResult.output.nets && netPlanResult.output.nets.length > 0)) {
            if (netPlanResult.fromLlm) {
                usedLlm = true;
            }
            NetPlanExecutor.sanitizeDuplicatePins(netPlanResult.output, placement.topology);
            const execResult = NetPlanExecutor.execute(placement.topology, netPlanResult.output);
            topoWithNets = execResult.topology;
            netPlanNotes = execResult.notes;
            Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] LLM netPlan: ${execResult.netCount}网/${execResult.labelCount}标号` +
                `/${execResult.stubWireCount}stubs failures=${execResult.failures.length}`);
            traceAiOp('AI_PIPE', 'net_plan_done', `nets=${execResult.netCount} labels=${execResult.labelCount}` +
                ` stubs=${execResult.stubWireCount} failures=${execResult.failures.length}`);
            if (execResult.failures.length > 0) {
                Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] KEEP_RETRY netPlan exec failures (continue): ${execResult.failures.join('; ')}`);
            }
        }
        else if (opts.skipLlm) {
            traceAiOp('AI_PIPE', 'net_plan_fallback', 'SemanticNetBuilder (skipLlm only)');
            const clone = JSON.parse(JSON.stringify(placement.topology)) as SchTopology;
            clone.netList = [];
            clone.netLabelList = [];
            clone.wireList = [];
            try {
                const semResult = new SemanticNetBuilder(this.componentLibrary).build(clone);
                topoWithNets = semResult.topology;
                netPlanNotes = `SemanticNetBuilder(skipLlm): ${semResult.summary}`;
                Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] net_plan skipLlm: ${netPlanNotes}`);
            }
            catch (_e) {
                topoWithNets = clone;
                degradedMode = true;
                netPlanNotes = 'skipLlm SemanticNetBuilder failed';
                Logger.error(INSTR_TRACE_TAG, `[AI_PIPE] SemanticNetBuilder skipLlm failed`);
                this.notifyDegraded('网络规划');
            }
        }
        else {
            Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] KEEP_RETRY net_plan empty — continue placed devices (no ABORT)');
            topoWithNets = placement.topology;
            netPlanNotes = 'net_plan pending repair';
            usedLlm = true;
        }
        onProgress?.(makeProgress(70, netPlanNotes));
        // 流式快照 #2: 网络/标号/stub导线已创建，布线尚未开始
        opts.onStreamSnapshot?.(topoWithNets, 'net_plan');
        onProgress?.(makeProgress(75, '获取布线约束'));
        traceAiOp('AI_PIPE', 'routing_constraints', 'fetch LLM or default');
        let routeLlm = await this.fetchRoutingLlm(topoWithNets, opts);
        for (let outer = 0; !routeLlm.fromLlm && !opts.skipLlm && outer < NEVER_ABORT_OUTER; outer++) {
            Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] KEEP_RETRY routing outer=${outer + 1}/${NEVER_ABORT_OUTER}`);
            onProgress?.(makeProgress(75, `布线约束重试 ${outer + 1}`));
            routeLlm = await this.fetchRoutingLlm(topoWithNets, opts);
        }
        this.mergeNetPlanHintsIntoRouting(routeLlm.output, netPlanResult);
        if (routeLlm.fromLlm) {
            usedLlm = true;
            Logger.info(INSTR_TRACE_TAG, '[AI_PIPE] routing constraints from LLM');
            try {
                traceAiPayload('AI_PIPE', 'ROUTE_JSON', JSON.stringify(routeLlm.output), 'stage=route');
            }
            catch (_e) {
                Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] ROUTE_JSON stringify failed');
            }
        }
        else {
            Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] KEEP_RETRY routing use defaultConstraints (no ABORT)');
            routeLlm = {
                output: ConstrainedWiringEngine.defaultConstraints(topoWithNets),
                fromLlm: false
            };
            this.mergeNetPlanHintsIntoRouting(routeLlm.output, netPlanResult);
            if (!opts.skipLlm) {
                usedLlm = true;
            }
            else {
                degradedMode = true;
            }
        }
        onProgress?.(makeProgress(85, '真脚补线 A*'));
        traceAiOp('AI_PIPE', 'astar_route', 'ConstrainedWiringEngine.route');
        // Build AI-suggested waypoint map from netPlan for routing guidance
        const netWaypoints = new Map<string, Point2D[]>();
        if (netPlanResult.fromLlm && netPlanResult.output.nets) {
            for (const net of netPlanResult.output.nets) {
                if (net.routeWaypoints && net.routeWaypoints.length > 0) {
                    const flat: Point2D[] = [];
                    for (const seg of net.routeWaypoints) {
                        for (const wp of seg) {
                            flat.push(wp);
                        }
                    }
                    if (flat.length > 0) {
                        netWaypoints.set(net.name, flat);
                    }
                }
            }
        }
        let routeResult = this.wiringEngine.routeUntilClean(topoWithNets, routeLlm.output, opts.routingWeights, netWaypoints, 3);
        topoWithNets.wireList = routeResult.routeLines;
        Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] routed wires=${topoWithNets.wireList.length}` +
            ` (no template fallback)`);
        traceAiOp('AI_PIPE', 'astar_route_done', `wires=${topoWithNets.wireList.length} nets=${topoWithNets.netList.length}`);
        // 流式快照 #3: 布线完成，完整拓扑
        opts.onStreamSnapshot?.(topoWithNets, 'routing');
        // ─── ERC 静态校验 (函数: 确定性规则检查) ───
        onProgress?.(makeProgress(90, 'ERC 静态校验'));
        traceAiOp('AI_PIPE', 'erc', 'FaultDiagnoser / collectErc');
        let ercErrors = this.collectErc(topoWithNets);
        topoWithNets.ercErrorList = ercErrors;
        let ercHard = AiErcGateUtil.countBlocking(ercErrors);
        const ercWarnN = ercErrors.filter(e => e.severity === 'warning').length;
        Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] ERC blocking=${ercHard} warnings=${ercWarnN} total=${ercErrors.length}`);
        traceAiOp('AI_PIPE', 'erc_done', `total=${ercErrors.length} blocking=${ercHard} warnings=${ercWarnN}`);
        // ─── 几何碰撞检测 (函数: 确定性几何计算) ───
        onProgress?.(makeProgress(92, '几何碰撞检测'));
        let geoIssues = this.collectGeometricIssues(topoWithNets);
        const congestionIssues = this.collectCongestionIssues(topoWithNets);
        for (const ci of congestionIssues) {
            geoIssues.push(ci);
        }
        if (geoIssues.length > 0) {
            Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] geometric issues: ${geoIssues.map(i => i.type).join(',')}`);
        }
        // ─── AI 自检 + 修复，直到 ERC+几何阻断=0 或轮次用尽 ───
        const ERC_CLEAR_MAX_ROUNDS = 3;
        let aiFixApplied = 0;
        let clearRound = 0;
        while (clearRound < ERC_CLEAR_MAX_ROUNDS) {
            clearRound++;
            onProgress?.(makeProgress(93 + clearRound, ercHard > 0 ? `AI 消 ERC 阻断项 第${clearRound}轮` : 'AI 自检审查'));
            traceAiOp('AI_PIPE', 'self_review', `round=${clearRound} ercBlocking=${ercHard}`);
            const reviewResult = await this.fetchSelfReviewLlm(topoWithNets, ercErrors, geoIssues, opts);
            if (reviewResult.fromLlm) {
                usedLlm = true;
                Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] AI self-review r${clearRound}: passed=${reviewResult.output.passed}` +
                    ` issues=${reviewResult.output.issues.length} ercBlocking=${ercHard}`);
                traceAiOp('AI_PIPE', 'self_review_done', `round=${clearRound} passed=${reviewResult.output.passed}` +
                    ` issues=${reviewResult.output.issues.length}` +
                    ` summary=${reviewResult.output.summary.substring(0, 80)}`);
            }
            else {
                Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] self-review LLM unavailable round=${clearRound}`);
            }
            if (reviewResult.fromLlm && reviewResult.output.issues.length > 0) {
                onProgress?.(makeProgress(96, `AI 驱动修复 第${clearRound}轮`));
                const fixExec = this.executeAiFixes(topoWithNets, reviewResult.output.issues);
                aiFixApplied += fixExec.fixCount;
                if (fixExec.fixCount > 0) {
                    if (fixExec.needReroute) {
                        const reRoute = this.wiringEngine.routeUntilClean(topoWithNets, ConstrainedWiringEngine.defaultConstraints(topoWithNets), opts.routingWeights, undefined, 4);
                        topoWithNets.wireList = reRoute.routeLines;
                        const geoAfterFix = this.collectGeometricIssues(topoWithNets);
                        const badNets = new Set<string>();
                        for (let gi = 0; gi < geoAfterFix.length; gi++) {
                            const g = geoAfterFix[gi];
                            if ((g.type === 'wire_body' || g.type === 'wire_cross') &&
                                g.severity === 'error' && g.targetUuid && g.targetUuid.length > 0) {
                                badNets.add(g.targetUuid);
                            }
                        }
                        if (badNets.size > 0) {
                            const n = this.wiringEngine.demoteNetsToLabelStubs(topoWithNets, badNets);
                            Logger.warn(INSTR_TRACE_TAG, `[AI_FIX] post-reroute demote ${badNets.size} nets → labels (${n} stubs)`);
                        }
                    }
                    const pruned = this.pruneOrphanFixDevices(topoWithNets);
                    if (pruned > 0) {
                        Logger.info(INSTR_TRACE_TAG, `[AI_FIX] pruned ${pruned} floating orphan devices`);
                    }
                }
            }
            // PostGenValidator：每轮 AI 修复后做确定性兜底
            const validator = new PostGenValidator(this.componentLibrary);
            const valResult = validator.validateAndFix(topoWithNets);
            if (valResult.fixedCount > 0) {
                topoWithNets = valResult.topo;
                Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] PostGenValidator r${clearRound} fixed=${valResult.fixedCount}`);
                traceAiOp('AI_PIPE', 'postgen_fix', `round=${clearRound} fixed=${valResult.fixedCount}`);
            }
            ercErrors = this.collectErc(topoWithNets);
            topoWithNets.ercErrorList = ercErrors;
            ercHard = AiErcGateUtil.countBlocking(ercErrors);
            geoIssues = this.collectGeometricIssues(topoWithNets);
            Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] after clear-round ${clearRound}: ercBlocking=${ercHard}` +
                ` geoBlocking=${this.countGeoBlocking(geoIssues)} fixesTotal=${aiFixApplied}`);
            const geoHard = this.countGeoBlocking(geoIssues);
            if (ercHard === 0 && geoHard === 0) {
                Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] ERC+GEO CLEAN after round=${clearRound} — generation gate passed`);
                break;
            }
            // 本轮无 LLM 且无修复 → 若仍有几何阻断，强制再跑一轮 routeUntilClean
            if (!reviewResult.fromLlm ||
                (reviewResult.output.issues.length === 0 && valResult.fixedCount === 0)) {
                if (geoHard > 0) {
                    const forced = this.wiringEngine.routeUntilClean(topoWithNets, ConstrainedWiringEngine.defaultConstraints(topoWithNets), opts.routingWeights, undefined, 3);
                    topoWithNets.wireList = forced.routeLines;
                    geoIssues = this.collectGeometricIssues(topoWithNets);
                    const geoAfter = this.countGeoBlocking(geoIssues);
                    Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] forced geo re-route round=${clearRound} geoBlocking=${geoAfter}`);
                    if (geoAfter === 0 && ercHard === 0) {
                        break;
                    }
                }
                Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] clear stalled at round=${clearRound} ercBlocking=${ercHard} geoBlocking=${geoHard}`);
                break;
            }
        }
        // ─── 最终门禁：ERC 阻断项 + 几何 error（穿选中区/碰无关脚）───
        ercErrors = this.collectErc(topoWithNets);
        topoWithNets.ercErrorList = ercErrors;
        ercHard = AiErcGateUtil.countBlocking(ercErrors);
        const finalGeoIssues = this.collectGeometricIssues(topoWithNets);
        const geoHard = this.countGeoBlocking(finalGeoIssues);
        const finalErcWarns = ercErrors.filter(e => e.severity === 'warning').length;
        const ercClean = ercHard === 0 && geoHard === 0;
        const selfReviewPassed = ercClean;
        const fixDesc = ercClean
            ? (aiFixApplied > 0 ? `门禁通过 · AI修复${aiFixApplied}处` : '门禁通过(ERC+几何)')
            : `生图未完成 · ERC阻断${ercHard} + 几何阻断${geoHard}`;
        onProgress?.(makeProgress(98, fixDesc));
        if (!ercClean) {
            const hardDesc = AiErcGateUtil.summarizeBlocking(ercErrors, 6);
            const geoDesc = finalGeoIssues.filter(g => g.severity === 'error')
                .slice(0, 4).map(g => g.desc).join('; ');
            Logger.error(INSTR_TRACE_TAG, `[AI_PIPE] INCOMPLETE ercBlocking=${ercHard} geoBlocking=${geoHard}` +
                ` — ${hardDesc}${geoDesc.length > 0 ? ' | ' + geoDesc : ''}`);
            traceAiOp('AI_PIPE', 'erc_gate_fail', `ercBlocking=${ercHard} geoBlocking=${geoHard}`);
        }
        else {
            Logger.info(INSTR_TRACE_TAG, '[AI_PIPE] gate PASS — zero ERC+geo blocking issues');
            traceAiOp('AI_PIPE', 'erc_gate_pass', 'ercBlocking=0 geoBlocking=0');
        }
        Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] END usedLlm=${usedLlm} degraded=${degradedMode}` +
            ` devices=${topoWithNets.deviceList.length} wires=${topoWithNets.wireList.length}` +
            ` ercBlocking=${ercHard} ercWarn=${finalErcWarns} ercClean=${ercClean}` +
            ` geoIssues=${finalGeoIssues.length} reviewPassed=${selfReviewPassed}`);
        traceAiOp('AI_PIPE', 'pipeline_end', `usedLlm=${usedLlm} degraded=${degradedMode}` +
            ` devices=${topoWithNets.deviceList.length} wires=${topoWithNets.wireList.length}` +
            ` ercBlocking=${ercHard} ercClean=${ercClean} reviewPassed=${selfReviewPassed}`);
        onProgress?.(makeProgress(100, ercClean ? '闭环完成' : '生图未完成(ERC/几何)', true));
        return {
            selectResult,
            placementResult: placement,
            routeResult,
            ercErrors,
            topology: topoWithNets,
            usedLlm,
            degradedMode,
            ercClean,
            geoBlocking: geoHard
        };
    }
    /** @deprecated 使用 AiErcGateUtil.countBlocking — 含功能影响 warning */
    private static countHardErc(ercErrors: ErcError[]): number {
        return AiErcGateUtil.countBlocking(ercErrors);
    }
    private collectErc(topo: SchTopology): ErcError[] {
        const doc = TopologyAdapter.fromTopology(topo);
        const violations = FaultDiagnoser.diagnose(doc);
        const ercErrors: ErcError[] = [];
        for (let vi = 0; vi < violations.length; vi++) {
            const v = violations[vi];
            let severity: 'error' | 'warning' | 'info' = 'info';
            if (v.severity === ErcSeverity.ERROR) {
                severity = 'error';
            }
            else if (v.severity === ErcSeverity.WARNING) {
                severity = 'warning';
            }
            ercErrors.push({
                errType: v.ruleType,
                targetUuid: v.componentId ?? v.netId ?? '',
                desc: v.message,
                suggest: v.fixSuggestion ?? '',
                severity: severity
            });
        }
        return ercErrors;
    }
    // ─── AI 驱动布局: LLM 坐标 → 器件实例 ───
    private applyAiPositions(devices: MatchedDevice[], positions: LayoutPositionItem[], lockedUuids: string[], partialTopo?: SchTopology): PlacementResult {
        const topo: SchTopology = {
            schUuid: IdUtil.generate('sch'),
            schName: 'AI Generated',
            layerDepth: 1,
            deviceList: [],
            netList: [],
            busList: [],
            wireList: [],
            subCircuitList: [],
            probeList: [],
            textAnnotate: [],
            netLabelList: [],
            ercErrorList: [],
            gridStep: 20,
            bgColor: '#FFFFFF'
        };
        // 先复制锁定器件（编辑模式保留 instUuid）
        const lockedPool = new Map<string, DeviceInst[]>();
        if (partialTopo) {
            for (const d of partialTopo.deviceList) {
                if (lockedUuids.includes(d.instUuid)) {
                    topo.deviceList.push(d);
                    const pool = lockedPool.get(d.libDevId) ?? [];
                    pool.push(d);
                    lockedPool.set(d.libDevId, pool);
                }
            }
        }
        // 队列消费坐标：同 libDevId 多实例不得 Map 覆盖（曾导致两颗 R_330 叠在同一点）
        const posQueues = new Map<string, DevicePosition[]>();
        for (const p of positions) {
            const dp: DevicePosition = { x: p.x, y: p.y, rotate: p.rotate ?? 0 };
            const list = posQueues.get(p.deviceId) ?? [];
            list.push(dp);
            posQueues.set(p.deviceId, list);
        }
        const usedRefs = new Set<string>();
        for (const d of topo.deviceList) {
            usedRefs.add(d.refName);
        }
        const occupied = new Set<string>();
        for (const d of topo.deviceList) {
            occupied.add(`${Math.round(d.x)},${Math.round(d.y)}`);
        }
        const reused = new Set<string>();
        for (let i = 0; i < devices.length; i++) {
            const dev = devices[i];
            const pos = this.takeQueuedPosition(posQueues, dev.name, dev.libDevId);
            let x = pos?.x ?? (200 + i * 80);
            let y = pos?.y ?? (200 + (i % 4) * 100);
            const rotate = pos?.rotate ?? 0;
            // 编辑模式：优先复用同型号未占用的锁定实例，避免整图复制
            const pool = lockedPool.get(dev.libDevId) ?? [];
            let reusedInst: DeviceInst | null = null;
            for (let pi = 0; pi < pool.length; pi++) {
                if (!reused.has(pool[pi].instUuid)) {
                    reusedInst = pool[pi];
                    reused.add(pool[pi].instUuid);
                    break;
                }
            }
            if (reusedInst) {
                reusedInst.x = x;
                reusedInst.y = y;
                reusedInst.rotate = rotate;
                occupied.add(`${Math.round(x)},${Math.round(y)}`);
                continue;
            }
            // 同坐标避让：第二颗同型号器件至少错开一格
            let key = `${Math.round(x)},${Math.round(y)}`;
            let bump = 0;
            while (occupied.has(key) && bump < 20) {
                bump++;
                y += 80;
                key = `${Math.round(x)},${Math.round(y)}`;
            }
            occupied.add(key);
            const refName = this.allocUniqueRefName(dev.libDevId, usedRefs);
            const inst = makeDeviceInst(IdUtil.generate('inst'), dev.libDevId, refName, x, y, rotate, dev.params);
            topo.deviceList.push(inst);
        }
        const emptyPositions: Record<string, DevicePosition> = {};
        const candidate: PlacementCandidate = {
            devicePositions: emptyPositions,
            fitnessScore: 1.0
        };
        const result: PlacementResult = { topology: topo, candidates: [candidate], selectedIndex: 0 };
        return result;
    }
    /** 按 name / libDevId 依次弹出坐标，支持同 ID 多实例 */
    private takeQueuedPosition(queues: Map<string, DevicePosition[]>, name: string, libDevId: string): DevicePosition | null {
        const keys = [name, libDevId];
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (!k || k.length === 0) {
                continue;
            }
            const q = queues.get(k);
            if (q !== undefined && q.length > 0) {
                return q.shift() as DevicePosition;
            }
        }
        return null;
    }
    /** 唯一位号: R1/R2、D1/D2、SW1… — 避免两颗电阻都叫 "Resistor 330Ω" */
    private allocUniqueRefName(libDevId: string, used: Set<string>): string {
        const id = libDevId.toUpperCase();
        if ((libDevId === 'VCC' || libDevId === 'GND') && !used.has(libDevId)) {
            used.add(libDevId);
            return libDevId;
        }
        let prefix = 'U';
        if (libDevId.startsWith('R_')) {
            prefix = 'R';
        }
        else if (libDevId.startsWith('C_')) {
            prefix = 'C';
        }
        else if (id.startsWith('LED_') || id.includes('DIODE') || id.startsWith('1N')) {
            prefix = 'D';
        }
        else if (id.includes('RELAY')) {
            prefix = 'K';
        }
        else if (id.startsWith('SW_')) {
            prefix = 'SW';
        }
        else if (id.includes('AMMETER') || id.includes('VOLTMETER') || id.includes('OSCILLOSCOPE') ||
            id.includes('UART') || id.includes('LOGIC_ANALYZER') || id.includes('FREQ')) {
            prefix = 'M';
        }
        else if (id.includes('STM32') || id.includes('AT89') || id.includes('STC')) {
            prefix = 'U';
        }
        else if (libDevId === 'VCC') {
            prefix = 'VCC';
        }
        else if (libDevId === 'GND') {
            prefix = 'GND';
        }
        let n = 1;
        let ref = `${prefix}${n}`;
        while (used.has(ref)) {
            n++;
            ref = `${prefix}${n}`;
        }
        used.add(ref);
        return ref;
    }
    // ─── 几何碰撞检测 (函数: 确定性几何计算) ───
    private collectGeometricIssues(topo: SchTopology): ValidationIssue[] {
        const validator = new PostGenValidator(this.componentLibrary);
        const allIssues = validator.collectIssues(topo);
        const geoIssues: ValidationIssue[] = [];
        for (const iss of allIssues) {
            if (iss.type === 'wire_body' || iss.type === 'wire_cross' || iss.type === 'pin_proximity') {
                geoIssues.push(iss);
            }
        }
        return geoIssues;
    }
    /** 几何阻断：仅 error 级穿选中区/碰无关脚/跨网重叠（拥挤 warning 不挡门禁） */
    private countGeoBlocking(issues: ValidationIssue[]): number {
        let n = 0;
        for (let i = 0; i < issues.length; i++) {
            if (issues[i].severity === 'error') {
                n++;
            }
        }
        return n;
    }
    /** 连线拥挤检测: 50mil网格, 统计每格导线数, >4条不同网络→拥挤 */
    private collectCongestionIssues(topo: SchTopology): ValidationIssue[] {
        const issues: ValidationIssue[] = [];
        const CELL = 50;
        const cellMap = new Map<string, Set<string>>();
        for (const wire of topo.wireList) {
            const touched = new Set<string>();
            for (const pt of wire.points) {
                const key = `${Math.floor(pt.x / CELL)},${Math.floor(pt.y / CELL)}`;
                if (touched.has(key))
                    continue;
                touched.add(key);
                let nets = cellMap.get(key);
                if (!nets) {
                    nets = new Set<string>();
                    cellMap.set(key, nets);
                }
                nets.add(wire.netUuid);
            }
        }
        cellMap.forEach((netSet, key) => {
            if (netSet.size > 4) {
                const parts = key.split(',');
                const cx = Number(parts[0]) * CELL;
                const cy = Number(parts[1]) * CELL;
                const netNames: string[] = [];
                netSet.forEach(n => netNames.push(n));
                issues.push({
                    type: 'wire_cross',
                    severity: 'warning',
                    desc: `连线拥挤: 格(${cx},${cy}) ${netSet.size}条不同网络导线汇聚 → 建议LLM考虑使用 joinByLabel 标号替代`,
                    targetUuid: netNames[0]
                });
            }
        });
        return issues;
    }
    // ─── AI 自检审查 (LLM 决策: 检查拓扑并输出修复方案) ───
    private async fetchSelfReviewLlm(topo: SchTopology, ercErrors: ErcError[], geoIssues: ValidationIssue[], opts: PipelineOptions): Promise<LlmFetchResult<AiSelfReviewResult>> {
        if (opts.skipLlm) {
            const empty: AiSelfReviewResult = { passed: true, issues: [], summary: 'skipLlm' };
            return { output: empty, fromLlm: false };
        }
        const tpl = PromptLoader.load('self_review');
        const vars = this.buildSelfReviewVars(topo, ercErrors, geoIssues, opts);
        const prompt = PromptLoader.renderEnriched(tpl, vars, this.componentLibrary);
        const api = await this.chatWithRetry(prompt, AiCapability.COMPONENT_RECOMMEND, { temperature: AiPipelineOrchestrator.temperatureForStage('self_review') });
        if (!api.success || !api.data) {
            Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] self_review LLM failed: ${api.error ?? 'no response'}`);
            const fallback: AiSelfReviewResult = {
                passed: ercErrors.length === 0 && geoIssues.length === 0,
                issues: [],
                summary: 'LLM不可用, 仅进行了ERC+几何检测'
            };
            return { output: fallback, fromLlm: false };
        }
        const raw = PromptLoader.extractJson<AiSelfReviewResult>(api.data);
        if (!raw) {
            Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] self_review JSON parse failed');
            const fallback: AiSelfReviewResult = {
                passed: ercErrors.length === 0 && geoIssues.length === 0,
                issues: [],
                summary: 'JSON解析失败'
            };
            return { output: fallback, fromLlm: false };
        }
        // 规范化
        const result: AiSelfReviewResult = {
            passed: raw.passed !== undefined ? raw.passed : (raw.issues?.length ?? 0) === 0,
            issues: Array.isArray(raw.issues) ? raw.issues as AiReviewIssue[] : [],
            summary: raw.summary ?? ''
        };
        try {
            traceAiPayload('AI_PIPE', 'SELF_REVIEW_JSON', JSON.stringify(result), `passed=${result.passed} issues=${result.issues.length}`);
        }
        catch (_e) {
            // ignore
        }
        return { output: result, fromLlm: true };
    }
    private buildSelfReviewVars(topo: SchTopology, ercErrors: ErcError[], geoIssues: ValidationIssue[], opts: PipelineOptions): PromptVarEntry[] {
        // 器件摘要
        const devLines: string[] = [];
        for (const d of topo.deviceList) {
            devLines.push(`  ${d.refName ?? d.libDevId} (${d.libDevId}) @(${Math.round(d.x)},${Math.round(d.y)})`);
        }
        // 网络摘要
        const netLines: string[] = [];
        for (const n of topo.netList) {
            netLines.push(`  ${n.netName}: ${n.nodeList?.length ?? 0} nodes`);
        }
        // 导线完整路径覆盖（供 AI 审查穿体/碰脚）
        const wireLines: string[] = [];
        for (const w of topo.wireList) {
            wireLines.push('  ' + DeviceHitGeometry.formatWireCoverage(DeviceHitGeometry.wireCoverage(w)));
        }
        // ERC 摘要
        const ercLines: string[] = [];
        for (const e of ercErrors) {
            ercLines.push(`  [${e.severity}] ${e.errType}: ${e.desc}`);
        }
        // 几何问题摘要
        const geoLines: string[] = [];
        for (const g of geoIssues) {
            geoLines.push(`  [${g.severity}] ${g.type}: ${g.desc}`);
        }
        const combinedIssues = ercLines.concat(geoLines);
        // 位置+密度+选中区+导线路径 (帮助 LLM 避让与 reroute)
        const densityReport = PromptLoader.buildPositionSummary(topo, this.componentLibrary) +
            '\n\n' + PromptLoader.buildWirePathReport(topo);
        // 对话历史
        let historyText = '';
        if (opts.conversationHistory && opts.conversationHistory.length > 0) {
            historyText = '对话历史（前序轮次）：\n' +
                opts.conversationHistory.map(h => `[${h.role}]: ${h.content}`).join('\n') + '\n\n';
        }
        return [
            { key: 'conversation_history', value: historyText },
            { key: 'user_prompt', value: opts.prompt },
            { key: 'device_count', value: `${topo.deviceList.length}` },
            { key: 'device_summary', value: devLines.join('\n') },
            { key: 'net_count', value: `${topo.netList.length}` },
            { key: 'net_summary', value: netLines.join('\n') },
            { key: 'wire_count', value: `${topo.wireList.length}` },
            { key: 'wire_summary', value: wireLines.join('\n') },
            { key: 'erc_count', value: `${ercErrors.length}` },
            { key: 'erc_summary', value: combinedIssues.length > 0 ? combinedIssues.join('\n') : '无ERC违规' },
            { key: 'density_report', value: densityReport }
        ];
    }
    // ─── AI 驱动修复执行 (LLM 决策修复策略, 函数执行具体操作) ───
    private executeAiFixes(topo: SchTopology, issues: AiReviewIssue[]): AiFixExecResult {
        let fixCount = 0;
        let needReroute = false;
        const seenKeys = new Set<string>();
        for (const issue of issues) {
            if (!issue.fixDetail) {
                continue;
            }
            const detail = issue.fixDetail;
            // wire_layout / reroute：整轮合并为一次 needReroute
            if (issue.fixAction === 'reroute') {
                if (!seenKeys.has('reroute|*')) {
                    seenKeys.add('reroute|*');
                    needReroute = true;
                    fixCount++;
                    Logger.info(INSTR_TRACE_TAG, `[AI_FIX] reroute batched (reason sample=${detail.reason ?? issue.desc})`);
                }
                continue;
            }
            const dedupeKey = `${issue.fixAction}|${issue.targetDevice ?? ''}|` +
                `${detail.libDevId ?? ''}|${detail.refName ?? ''}|${detail.x ?? ''}|${detail.y ?? ''}|${issue.desc}`;
            if (seenKeys.has(dedupeKey)) {
                continue;
            }
            seenKeys.add(dedupeKey);
            switch (issue.fixAction) {
                case 'add_component': {
                    // warning 级「可选电容/装饰件」一律不添加 — 这是多出多余器件的主因
                    if (issue.severity === 'warning') {
                        Logger.info(INSTR_TRACE_TAG, `[AI_FIX] skip warning add_component: ${issue.desc}`);
                        break;
                    }
                    const resolvedId = this.resolveAiFixLibDevId(detail);
                    if (!resolvedId) {
                        Logger.warn(INSTR_TRACE_TAG, `[AI_FIX] reject invalid libDevId=${detail.libDevId} (not in library)`);
                        break;
                    }
                    // LED 已有足够限流电阻时禁止再加 R
                    if (resolvedId.startsWith('R_')) {
                        const ledN = topo.deviceList.filter(d => d.libDevId.startsWith('LED_')).length;
                        const rN = topo.deviceList.filter(d => d.libDevId.startsWith('R_')).length;
                        if (ledN > 0 && rN >= ledN) {
                            Logger.info(INSTR_TRACE_TAG, `[AI_FIX] skip add ${resolvedId}: already ${rN} resistors for ${ledN} LEDs`);
                            break;
                        }
                    }
                    // 非 MCU 电路禁止自审追加滤波电容
                    if (resolvedId.startsWith('C_') && !this.topoHasMcu(topo) &&
                        issue.type !== 'mcu_system') {
                        Logger.info(INSTR_TRACE_TAG, `[AI_FIX] skip optional cap ${resolvedId} on non-MCU circuit`);
                        break;
                    }
                    const existCheck = topo.deviceList.some(d => d.libDevId === resolvedId &&
                        Math.abs(d.x - (detail.x ?? 0)) < 30 &&
                        Math.abs(d.y - (detail.y ?? 0)) < 30);
                    if (!existCheck) {
                        const params = new Map<string, string>();
                        if (detail.paramKey && detail.paramValue) {
                            params.set(detail.paramKey, detail.paramValue);
                        }
                        const usedRefs = new Set<string>();
                        for (const d of topo.deviceList) {
                            usedRefs.add(d.refName);
                        }
                        const refName = detail.refName && detail.refName.length > 0 && !usedRefs.has(detail.refName)
                            ? detail.refName
                            : this.allocUniqueRefName(resolvedId, usedRefs);
                        topo.deviceList.push(makeDeviceInst(IdUtil.generate('inst'), resolvedId, refName, detail.x ?? 200 + fixCount * 60, detail.y ?? 300, 0, params));
                        fixCount++;
                        needReroute = true;
                        Logger.info(INSTR_TRACE_TAG, `[AI_FIX] add ${resolvedId} as ${refName} at (${detail.x},${detail.y})` +
                            ` reason=${detail.reason ?? ''}`);
                    }
                    break;
                }
                case 'remove_component': {
                    const idx = this.findSafeRemoveIndex(topo, issue, detail);
                    if (idx >= 0) {
                        const removed = topo.deviceList[idx];
                        topo.deviceList.splice(idx, 1);
                        // 同步摘掉该器件相关网络节点 / 导线 / 标号
                        for (const net of topo.netList) {
                            net.nodeList = net.nodeList.filter(n => n.devUuid !== removed.instUuid);
                        }
                        const orphanNets = new Set<string>();
                        for (const net of topo.netList) {
                            if (net.nodeList.length < 1) {
                                orphanNets.add(net.netUuid);
                            }
                        }
                        topo.netList = topo.netList.filter(n => n.nodeList.length >= 1);
                        topo.wireList = topo.wireList.filter(w => !orphanNets.has(w.netUuid));
                        topo.netLabelList = topo.netLabelList.filter(l => !orphanNets.has(l.netUuid));
                        // 端点可能仍指向已删器件附近的线：按 net 节点不足已清；残留同 net 线由重布处理
                        fixCount++;
                        needReroute = true;
                        Logger.info(INSTR_TRACE_TAG, `[AI_FIX] removed ${removed.refName}(${removed.libDevId})` +
                            ` reason=${detail.reason ?? ''}`);
                    }
                    else {
                        Logger.info(INSTR_TRACE_TAG, `[AI_FIX] skip remove — no safe single target` +
                            ` target=${issue.targetDevice ?? detail.refName ?? detail.libDevId}`);
                    }
                    break;
                }
                case 'change_param': {
                    if (detail.paramKey && detail.paramValue) {
                        for (const d of topo.deviceList) {
                            if (d.libDevId === detail.libDevId || d.refName === detail.refName ||
                                d.refName === issue.targetDevice) {
                                d.params.set(detail.paramKey, detail.paramValue);
                                fixCount++;
                                Logger.info(INSTR_TRACE_TAG, `[AI_FIX] param ${d.refName}.${detail.paramKey}=${detail.paramValue}` +
                                    ` reason=${detail.reason ?? ''}`);
                                break;
                            }
                        }
                    }
                    break;
                }
                case 'reroute': {
                    // 已在循环入口批量处理
                    break;
                }
                default: {
                    Logger.info(INSTR_TRACE_TAG, `[AI_FIX] unknown fixAction=${issue.fixAction} type=${issue.type}`);
                    break;
                }
            }
        }
        const out: AiFixExecResult = {
            fixCount: fixCount,
            needReroute: needReroute
        };
        return out;
    }
    /** 将 LLM 幻觉 ID (R / CAP_ELECTRO) 映射到库内真实 libDevId */
    private resolveAiFixLibDevId(detail: AiFixDetail): string | null {
        const raw = (detail.libDevId ?? '').trim();
        if (raw.length === 0) {
            return null;
        }
        const upper = raw.toUpperCase();
        let candidate = raw;
        const pv = (detail.paramValue ?? '').toLowerCase();
        if (upper === 'R' || upper === 'RES' || upper === 'RESISTOR') {
            if (pv.indexOf('330') >= 0) {
                candidate = 'R_330';
            }
            else if (pv.indexOf('4.7') >= 0 || pv.indexOf('4k7') >= 0) {
                candidate = 'R_4.7k';
            }
            else if (pv.indexOf('10k') >= 0) {
                candidate = 'R_10k';
            }
            else if (pv.indexOf('1k') >= 0) {
                candidate = 'R_1k';
            }
            else {
                candidate = 'R_330';
            }
        }
        else if (upper === 'CAP_ELECTRO' || upper === 'CAP' || upper === 'C' ||
            upper === 'CAPACITOR' || upper.indexOf('ELECTRO') >= 0) {
            if (pv.indexOf('100n') >= 0) {
                candidate = 'C_100nF';
            }
            else if (pv.indexOf('10u') >= 0 || pv.indexOf('10µ') >= 0) {
                candidate = 'C_10uF';
            }
            else {
                candidate = 'C_10uF';
            }
        }
        const resolved = this.componentLibrary.resolveLibraryId(candidate);
        const got = this.componentLibrary.getComponent(resolved);
        if (!got.success || !got.data) {
            return null;
        }
        return resolved;
    }
    private topoHasMcu(topo: SchTopology): boolean {
        return topo.deviceList.some(d => {
            const id = d.libDevId.toUpperCase();
            return id.indexOf('STM32') >= 0 || id.indexOf('AT89') >= 0 || id.indexOf('STC') >= 0;
        });
    }
    private isDeviceOnAnyNet(topo: SchTopology, instUuid: string): boolean {
        for (const net of topo.netList) {
            for (const n of net.nodeList) {
                if (n.devUuid === instUuid) {
                    return true;
                }
            }
        }
        return false;
    }
    /**
     * 只删除「一个」安全目标：优先浮空器件 / 精确位号，绝不按 libDevId 批量删光。
     * 历史 bug: filter(libDevId!==R) 会删掉刚 add 的电阻，或一次删掉全部 R_330。
     */
    private findSafeRemoveIndex(topo: SchTopology, issue: AiReviewIssue, detail: AiFixDetail): number {
        const target = (issue.targetDevice ?? detail.refName ?? '').trim();
        // 1) 精确位号且浮空
        if (target.length > 0) {
            for (let i = 0; i < topo.deviceList.length; i++) {
                const d = topo.deviceList[i];
                if ((d.refName === target || d.libDevId === target) &&
                    d.libDevId !== 'VCC' && d.libDevId !== 'GND' &&
                    !this.isDeviceOnAnyNet(topo, d.instUuid)) {
                    return i;
                }
            }
        }
        // 2) 坐标附近的同型号浮空器件
        const resolved = this.resolveAiFixLibDevId(detail) ?? detail.libDevId;
        if (resolved && detail.x !== undefined && detail.y !== undefined) {
            for (let i = 0; i < topo.deviceList.length; i++) {
                const d = topo.deviceList[i];
                if (d.libDevId === resolved &&
                    Math.abs(d.x - (detail.x ?? 0)) < 40 &&
                    Math.abs(d.y - (detail.y ?? 0)) < 40 &&
                    d.libDevId !== 'VCC' && d.libDevId !== 'GND' &&
                    !this.isDeviceOnAnyNet(topo, d.instUuid)) {
                    return i;
                }
            }
        }
        // 3) 同 libDevId 的浮空副本（保留至少一个已入网实例）
        if (resolved) {
            const same: DeviceIndexPair[] = [];
            for (let i = 0; i < topo.deviceList.length; i++) {
                const d = topo.deviceList[i];
                if (d.libDevId === resolved || d.refName === target) {
                    const pair: DeviceIndexPair = { d: d, i: i };
                    same.push(pair);
                }
            }
            const floating: DeviceIndexPair[] = [];
            const wired: DeviceIndexPair[] = [];
            for (let si = 0; si < same.length; si++) {
                const e = same[si];
                if (this.isDeviceOnAnyNet(topo, e.d.instUuid)) {
                    wired.push(e);
                }
                else {
                    floating.push(e);
                }
            }
            if (floating.length > 0 && (wired.length > 0 || same.length > 1)) {
                return floating[0].i;
            }
        }
        return -1;
    }
    /** 非 MCU 电路：删除自审误加且完全浮空的滤波电容（不碰 LED/开关/电阻） */
    private pruneOrphanFixDevices(topo: SchTopology): number {
        if (this.topoHasMcu(topo)) {
            return 0;
        }
        const before = topo.deviceList.length;
        topo.deviceList = topo.deviceList.filter(d => {
            if (!d.libDevId.startsWith('C_')) {
                return true;
            }
            return this.isDeviceOnAnyNet(topo, d.instUuid);
        });
        return before - topo.deviceList.length;
    }
    private notifyDegraded(stage: string): void {
        const eventData: DegradedEventData = {
            message: `AI服务不可用 [${stage}]，已拒绝模板回退`
        };
        const payload: ModuleEventPayload = {
            event: ModuleEvent.SIMULATION_STOPPED,
            source: 'ai_pipeline',
            timestamp: Date.now(),
            data: eventData
        };
        EventBus.getInstance().publish(payload);
    }
    /** ≥2 LED + (RELAY 或 SW)：用于 AI 纠错提示，不替代 LLM */
    /** 编辑模式 partialTopo → prompt JSON（显式接口，避免匿名对象字面量） */
    private static formatPartialTopoForPrompt(topo: SchTopology): string {
        const items: PartialTopoPromptItem[] = [];
        for (let i = 0; i < topo.deviceList.length; i++) {
            const d = topo.deviceList[i];
            const item: PartialTopoPromptItem = {
                ref: d.refName,
                id: d.libDevId,
                x: d.x,
                y: d.y,
                rot: d.rotate
            };
            items.push(item);
        }
        return JSON.stringify(items);
    }
    private static isMutualLedSwitchPrompt(prompt: string): boolean {
        const zh = prompt ?? '';
        const lower = zh.toLowerCase();
        const dualColor = (zh.indexOf('绿') >= 0 && zh.indexOf('红') >= 0) ||
            (lower.indexOf('green') >= 0 && lower.indexOf('red') >= 0) ||
            (zh.indexOf('双') >= 0 && zh.indexOf('LED') >= 0);
        const mutual = (zh.indexOf('打开') >= 0 && zh.indexOf('闭合') >= 0) ||
            (zh.indexOf('断开') >= 0 && (zh.indexOf('闭合') >= 0 || zh.indexOf('接通') >= 0)) ||
            (zh.indexOf('松开') >= 0 && zh.indexOf('按下') >= 0) ||
            (lower.indexOf('open') >= 0 && lower.indexOf('close') >= 0) ||
            zh.indexOf('互斥') >= 0 ||
            ((zh.indexOf('开关') >= 0 || zh.indexOf('按键') >= 0 || lower.indexOf('switch') >= 0) &&
                dualColor);
        return mutual && (dualColor || zh.indexOf('LED') >= 0 || lower.indexOf('led') >= 0);
    }
    /** AI 选型结果审查：只产出纠错文案，不改器件列表 */
    private critiqueDeviceSelect(out: DeviceSelectLlmOutput, prompt: string): string[] {
        const issues: string[] = [];
        const list = out.deviceRequireList ?? [];
        // 强制：每个需求必须带库内存在的 explicitModel
        for (let i = 0; i < list.length; i++) {
            const req = list[i];
            const model = (req.explicitModel ?? '').trim();
            if (model.length === 0) {
                issues.push(`器件「${req.func}/${req.devType}」缺少 explicitModel — 必须填写库内精确 libDevId`);
                continue;
            }
            const got = this.componentLibrary.getComponent(model);
            if (!got.success || !got.data) {
                issues.push(`explicitModel=${model} 不在器件库中 — 只能从注入的库清单中选精确 ID，禁止编造`);
            }
        }
        // 互斥双色专项
        const mutual = AiPipelineOrchestrator.critiqueMutualLedSelect(out, prompt);
        for (let j = 0; j < mutual.length; j++) {
            issues.push(mutual[j]);
        }
        // 强制器件检查
        const models = list.map(r => (r.explicitModel ?? '').toUpperCase());
        const devTypes = list.map(r => (r.devType ?? '').toUpperCase());
        const allIds = models.concat(devTypes);
        const hasVcc = allIds.some(m => m === 'VCC');
        const hasGnd = allIds.some(m => m === 'GND');
        if (!hasVcc) {
            issues.push('缺失 VCC 电源符号 — 任何电路都必须包含 VCC');
        }
        if (!hasGnd) {
            issues.push('缺失 GND 接地符号 — 任何电路都必须包含 GND');
        }
        // LED 限流电阻配对
        const ledN = models.filter(m => m.indexOf('LED') >= 0).length;
        const rN = models.filter(m => m.startsWith('R_')).length;
        if (ledN > 0 && rN < ledN) {
            issues.push(`有 ${ledN} 颗 LED 但只有 ${rN} 颗电阻 — 每颗 LED 必须配一颗限流电阻(R_330)`);
        }
        // 运放必须有反馈电阻
        const hasOpAmp = allIds.some(m => m.indexOf('LM358') >= 0 || m.indexOf('LM324') >= 0 || m.indexOf('OP') >= 0 || m.indexOf('OPAMP') >= 0);
        if (hasOpAmp && rN === 0) {
            issues.push('运放电路必须有反馈电阻 — 禁止开环');
        }
        // I2C 必须有上拉电阻
        const hasI2c = list.some(r => (r.func ?? '').indexOf('I2C') >= 0 || (r.devType ?? '').toUpperCase().indexOf('I2C') >= 0);
        const has4k7 = models.some(m => m === 'R_4.7k' || m === 'R_4K7');
        if (hasI2c && !has4k7) {
            issues.push('I2C 器件必须配 4.7kΩ 上拉电阻 (R_4.7k)');
        }
        // MCU 必须有晶振和去耦电容
        const hasMcu = allIds.some(m => m.indexOf('STM32') >= 0 || m.indexOf('AT89') >= 0 || m.indexOf('STC') >= 0 || m.indexOf('MCU') >= 0);
        if (hasMcu) {
            const hasXtal = allIds.some(m => m.indexOf('XTAL') >= 0 || m.indexOf('CRYSTAL') >= 0 || m.indexOf('OSC') >= 0);
            const hasDecap = models.some(m => m === 'C_100nF' || m === 'C_100NF');
            if (!hasXtal) {
                issues.push('MCU 最小系统必须包含晶振 (XTAL)');
            }
            if (!hasDecap) {
                issues.push('MCU 最小系统必须包含去耦电容 (C_100nF)');
            }
            const hasRstR = models.some(m => m === 'R_10k' || m === 'R_10K');
            if (!hasRstR) {
                issues.push('MCU 最小系统必须包含 RST 上拉电阻 (R_10k)');
            }
        }
        // 仪器数量检查：电压表数量与用户需求一致
        const voltN = models.filter(m => m === 'VOLTMETER_DC').length;
        const userWantsNVolt = prompt.match(/(\d+)\s*[个块只]\s*电压表/);
        if (userWantsNVolt && voltN !== parseInt(userWantsNVolt[1])) {
            issues.push(`用户要求 ${userWantsNVolt[1]} 个电压表，但输出了 ${voltN} 个`);
        }
        const userWantsAmmeter = prompt.indexOf('电流表') >= 0 || prompt.indexOf('测电流') >= 0;
        const hasAmmeter = models.some(m => m === 'AMMETER_DC');
        if (userWantsAmmeter && !hasAmmeter) {
            issues.push('用户要求测电流但缺少 AMMETER_DC');
        }
        return issues;
    }
    private static critiqueMutualLedSelect(out: DeviceSelectLlmOutput, prompt: string): string[] {
        const issues: string[] = [];
        if (!AiPipelineOrchestrator.isMutualLedSwitchPrompt(prompt)) {
            return issues;
        }
        const list = out.deviceRequireList ?? [];
        const models = list.map(r => (r.explicitModel ?? r.devType ?? '').toUpperCase());
        const hasRelay = models.some(m => m.indexOf('RELAY') >= 0);
        const ledN = models.filter(m => m.indexOf('LED') >= 0).length;
        const hasSw = models.some(m => m.indexOf('SW_') >= 0 || m === 'SW_PUSH');
        if (ledN < 2) {
            issues.push('互斥双色指示必须包含至少两颗 LED（如 LED_GREEN + LED_RED）');
        }
        if (!hasRelay) {
            issues.push('开/闭互斥双色禁止只用 SW_PUSH(SPST)。必须增加 explicitModel=RELAY_SPDT，' +
                '并用 SW_PUSH 仅驱动继电器线圈；触点 NC→绿灯支路、NO→红灯支路、COM→GND');
        }
        if (!hasSw) {
            issues.push('需要 SW_PUSH 驱动 RELAY_SPDT 线圈（VCC→SW→coil→GND）');
        }
        const rN = models.filter(m => m.startsWith('R_')).length;
        if (rN < 2) {
            issues.push('双 LED 必须各配一颗限流电阻（两颗 R_330）');
        }
        return issues;
    }
    /** @deprecated 使用实例 critiqueDeviceSelect */
    private static critiqueDeviceSelect(out: DeviceSelectLlmOutput, prompt: string): string[] {
        return AiPipelineOrchestrator.critiqueMutualLedSelect(out, prompt);
    }
    /** AI net_plan 审查：拓扑正确性全面检查 */
    private static critiqueNetPlan(plan: NetPlanResult, topo: SchTopology, prompt: string): string[] {
        const issues: string[] = [];
        const nets = plan.nets ?? [];
        const ledN = topo.deviceList.filter(d => d.libDevId.startsWith('LED_')).length;
        const hasRelay = topo.deviceList.some(d => d.libDevId === 'RELAY_SPDT' || d.libDevId.toUpperCase().indexOf('RELAY') >= 0);
        const hasSw = topo.deviceList.some(d => d.libDevId.startsWith('SW_'));
        // ═══════════════════════════════════════════════════════════
        // 通用拓扑检查 — 对所有电路强制执行
        // ═══════════════════════════════════════════════════════════
        // 电流表 I+/I- 不得同网
        for (let i = 0; i < nets.length; i++) {
            const conns = nets[i].connections ?? [];
            const pins = conns.map(c => `${c.compRef}:${c.pinName || c.pinId}`.toUpperCase());
            const hasIPlus = pins.some(p => p.endsWith(':I+') || p.endsWith(':I_PLUS'));
            const hasIMinus = pins.some(p => p.endsWith(':I-') || p.endsWith(':I_MINUS'));
            if (hasIPlus && hasIMinus) {
                issues.push(`电流表 I+/I- 在同一网络 "${nets[i].name}" → 短路！必须分到不同网络`);
            }
        }
        // VCC/GND 网络必须存在
        const netNames = nets.map(n => (n.name ?? '').toUpperCase());
        const hasVccNet = netNames.some(n => n === 'VCC');
        const hasGndNet = netNames.some(n => n === 'GND');
        if (!hasVccNet) {
            issues.push('netPlan 缺少 VCC 网络 — 必须创建 VCC 电源网络并连接 VCC 符号引脚');
        }
        if (!hasGndNet) {
            issues.push('netPlan 缺少 GND 网络 — 必须创建 GND 地网络并连接 GND 符号引脚');
        }
        // 信号网络禁止命名为 VCC/GND
        for (let i = 0; i < nets.length; i++) {
            const name = (nets[i].name ?? '').toUpperCase();
            const type = nets[i].type ?? '';
            if ((name === 'VCC' || name === 'GND') && type === 'signal') {
                issues.push(`信号网络 "${nets[i].name}" 不能使用电源网络名 — 改为描述性名称如 LED_CTRL`);
            }
        }
        // 同一引脚不得出现在两个不同网络
        const pinOwner = new Map<string, string>();
        for (let i = 0; i < nets.length; i++) {
            const netName = (nets[i].name ?? '').toUpperCase();
            const conns = nets[i].connections ?? [];
            for (let ci = 0; ci < conns.length; ci++) {
                const c = conns[ci];
                const pinKey = `${c.compRef}:${c.pinId}`.toUpperCase();
                const prev = pinOwner.get(pinKey);
                if (prev !== undefined && prev !== netName) {
                    issues.push(`引脚 ${pinKey} 同时出现在网络 ${prev} 与 ${netName}：一脚只能属一网；` +
                        `若 ${netName} 是探针/PROBE，请把仪器脚并入 ${prev} 并删除重复 DUT 脚；` +
                        `若是驱动冲突（如三极管 B），只保留正确驱动网`);
                }
                else {
                    pinOwner.set(pinKey, netName);
                }
            }
        }
        // GPIO 禁止直连 VCC/GND（除非经限流电阻）
        for (let i = 0; i < nets.length; i++) {
            const name = (nets[i].name ?? '').toUpperCase();
            if (name !== 'VCC' && name !== 'GND') {
                continue;
            }
            const conns = nets[i].connections ?? [];
            for (const c of conns) {
                const pin = (c.pinName ?? c.pinId ?? '').toUpperCase();
                const ref = (c.compRef ?? '').toUpperCase();
                if ((pin.indexOf('GPIO') >= 0 || pin.indexOf('IO') >= 0 || pin.indexOf('PA') === 0 ||
                    pin.indexOf('PB') === 0 || pin.indexOf('PC') === 0 || pin.indexOf('PD') === 0 ||
                    pin.indexOf('P1') === 0 || pin.indexOf('P2') === 0 || pin.indexOf('P3') === 0) &&
                    !ref.startsWith('R_')) {
                    issues.push(`GPIO/IO引脚 ${c.compRef}:${c.pinName || c.pinId} 直连 ${name} — 必须经限流电阻`);
                }
            }
        }
        // 检查关键引脚是否浮空
        const allConnectedPins = new Set<string>();
        for (let i = 0; i < nets.length; i++) {
            const conns = nets[i].connections ?? [];
            for (const c of conns) {
                allConnectedPins.add(`${c.compRef}:${c.pinId}`);
            }
        }
        for (const dev of topo.deviceList) {
            const id = dev.libDevId.toUpperCase();
            if (id.indexOf('STM32') >= 0 || id.indexOf('AT89') >= 0 || id.indexOf('STC') >= 0) {
                const criticalPins = ['NRST', 'RST', 'VDD', 'VSS', 'VCC', 'GND'];
                for (const pin of criticalPins) {
                    const key = `${dev.refName}:${pin}`;
                    if (!allConnectedPins.has(key) &&
                        !Array.from(allConnectedPins).some(k => k.startsWith(`${dev.refName}:`) && k.toUpperCase().indexOf(pin) >= 0)) {
                        issues.push(`MCU 关键引脚 ${dev.refName}:${pin} 未入网 — 不得浮空`);
                    }
                }
            }
        }
        // ═══════════════════════════════════════════════════════════
        // 互斥双色 LED + 继电器触点拓扑 — 专用电路特定检查
        // ═══════════════════════════════════════════════════════════
        const mutual = AiPipelineOrchestrator.isMutualLedSwitchPrompt(prompt) ||
            (ledN >= 2 && (hasRelay || hasSw));
        if (!mutual || ledN < 2) {
            return issues;
        }
        if (!hasRelay) {
            issues.push('器件列表无 RELAY_SPDT：如需 SPDT 切换请在 topologyNotes 中说明。' +
                '当前 netPlan 不得用 SW_PUSH 当常开/常闭三端。');
            return issues;
        }
        // 构建 refName 索引给回灌提示
        const relayRef = topo.deviceList.find(d => d.libDevId === 'RELAY_SPDT' || d.libDevId.toUpperCase().indexOf('RELAY') >= 0)?.refName ?? 'K1';
        const swRef = topo.deviceList.find(d => d.libDevId.startsWith('SW_'))?.refName ?? 'SW1';
        const leds = topo.deviceList.filter(d => d.libDevId.startsWith('LED_'));
        const ledGreen = leds.find(d => d.libDevId.toUpperCase().indexOf('GREEN') >= 0)?.refName;
        const ledRed = leds.find(d => d.libDevId.toUpperCase().indexOf('RED') >= 0)?.refName;
        const resistors = topo.deviceList.filter(d => d.libDevId.startsWith('R_'));
        const rRefs = resistors.slice(0, 2).map(d => d.refName);
        const greenR = rRefs[0] ?? 'R1';
        const redR = rRefs[1] ?? 'R2';
        const greenLedRef = ledGreen ?? 'D1';
        const redLedRef = ledRed ?? 'D2';
        let ncHit = 0;
        let noHit = 0;
        let comGnd = false;
        for (let i = 0; i < nets.length; i++) {
            const conns = nets[i].connections ?? [];
            const pins = conns.map(c => `${c.compRef}:${c.pinId}`.toUpperCase());
            const hasNc = pins.some(p => p.indexOf(':NC') >= 0);
            const hasNo = pins.some(p => p.indexOf(':NO') >= 0);
            const hasCom = pins.some(p => p.indexOf(':COM') >= 0);
            const hasLedK = pins.some(p => (p.indexOf('LED') >= 0 || p.indexOf('D') === 0 || p.indexOf(greenLedRef.toUpperCase()) >= 0 ||
                p.indexOf(redLedRef.toUpperCase()) >= 0) && p.endsWith(':K'));
            const hasLed = pins.some(p => p.indexOf('LED') >= 0 ||
                p.indexOf(greenLedRef.toUpperCase()) >= 0 || p.indexOf(redLedRef.toUpperCase()) >= 0);
            if (hasNc && (hasLedK || hasLed)) {
                ncHit++;
            }
            if (hasNo && (hasLedK || hasLed)) {
                noHit++;
            }
            if (hasCom && (nets[i].name.toUpperCase() === 'GND' ||
                pins.some(p => p.indexOf('GND') >= 0))) {
                comGnd = true;
            }
            if (hasCom && (nets[i].name.toUpperCase() === 'VCC' ||
                pins.some(p => p.endsWith(':VCC') || p.indexOf(':VCC') >= 0))) {
                issues.push('禁止 RELAY.COM 接到 VCC：COM 必须接 GND');
            }
        }
        if (ncHit < 1) {
            issues.push(`缺少 NC 触点支路：LED_GREEN.K(${greenLedRef}:K)→RELAY.NC(${relayRef}:NC) ` +
                `断开(未按下)时绿灯常亮。正确示例: ` +
                `VCC→${greenR}.1→${greenR}.2→${greenLedRef}.A, ${greenLedRef}.K→${relayRef}.NC`);
        }
        if (noHit < 1) {
            issues.push(`缺少 NO 触点支路：LED_RED.K(${redLedRef}:K)→RELAY.NO(${relayRef}:NO) ` +
                `闭合(按下)时红灯常亮。正确示例: ` +
                `VCC→${redR}.1→${redR}.2→${redLedRef}.A, ${redLedRef}.K→${relayRef}.NO`);
        }
        if (!comGnd) {
            issues.push(`RELAY.COM(${relayRef}:COM) 必须接到 GND 网络，作为两路 LED 的公共回流路径`);
        }
        // 禁止两路 LED 阴极都只接 GND（无触点切换）
        let ledKToGndOnly = 0;
        for (let i = 0; i < nets.length; i++) {
            if (nets[i].name.toUpperCase() !== 'GND' && nets[i].type !== 'ground') {
                continue;
            }
            const conns = nets[i].connections ?? [];
            for (const c of conns) {
                if ((c.pinId === 'K' || c.pinName === 'K') &&
                    (c.compRef.toUpperCase().indexOf('LED') >= 0 || c.compRef.startsWith('D') ||
                        c.compRef === greenLedRef || c.compRef === redLedRef)) {
                    ledKToGndOnly++;
                }
            }
        }
        if (ledKToGndOnly >= 2 && ncHit + noHit < 2) {
            issues.push('禁止两颗 LED 阴极都直连 GND：互斥指示必须经 NC/NO 触点，否则开关无法切换颜色');
        }
        // 线圈回路：RELAY 脚 1/2（非 COM/NC/NO）须分别接到 SW 与电源轨，禁止两脚同网
        let coilPinsOnPlan: string[] = [];
        let coilNetNames: string[] = [];
        for (let i = 0; i < nets.length; i++) {
            const conns = nets[i].connections ?? [];
            for (let ci = 0; ci < conns.length; ci++) {
                const c = conns[ci];
                const pid = (c.pinId ?? '').toUpperCase();
                const pref = (c.compRef ?? '').toUpperCase();
                const isRelayRef = pref.indexOf('RELAY') >= 0 ||
                    /^K\d+$/.test(pref) ||
                    pref === relayRef.toUpperCase() ||
                    topo.deviceList.some(d => d.refName.toUpperCase() === pref &&
                        (d.libDevId === 'RELAY_SPDT' || d.libDevId.toUpperCase().indexOf('RELAY') >= 0));
                if (!isRelayRef) {
                    continue;
                }
                if (pid === 'COM' || pid === 'NC' || pid === 'NO') {
                    continue;
                }
                if (pid === '1' || pid === '2' || pid === 'A' || pid === 'B' ||
                    pid.indexOf('COIL') >= 0) {
                    coilPinsOnPlan.push(`${pref}:${pid}`);
                    coilNetNames.push((nets[i].name ?? '').toUpperCase());
                }
            }
        }
        const uniqueCoilPins = Array.from(new Set(coilPinsOnPlan));
        if (uniqueCoilPins.length < 2) {
            issues.push(`RELAY 线圈(${relayRef})两端未完整入网：` +
                `正确回路 VCC→${swRef}.1→${swRef}.2→${relayRef}.1, ${relayRef}.2→GND。` +
                `线圈两脚 1/2 各自独立入网，不可浮空`);
        }
        else {
            const uniqNets = Array.from(new Set(coilNetNames));
            if (uniqNets.length < 2) {
                issues.push(`RELAY 线圈两端(${relayRef}:1,${relayRef}:2)不得同网：` +
                    `必须分到两个不同网络，一端经 ${swRef} 接 VCC，另一端接 GND`);
            }
            let hasSwOnCoilPath = false;
            let hasPowerOnCoilPath = false;
            for (let i = 0; i < nets.length; i++) {
                const conns = nets[i].connections ?? [];
                const pins = conns.map(c => `${c.compRef}:${c.pinId}`.toUpperCase());
                const hasCoil = pins.some(p => uniqueCoilPins.indexOf(p) >= 0);
                if (!hasCoil) {
                    continue;
                }
                if (pins.some(p => {
                    const ref = p.split(':')[0];
                    return ref === swRef.toUpperCase() || topo.deviceList.some(d => d.refName.toUpperCase() === ref && d.libDevId.startsWith('SW_'));
                })) {
                    hasSwOnCoilPath = true;
                }
                const n = (nets[i].name ?? '').toUpperCase();
                if (n === 'VCC' || n === 'GND' || pins.some(p => p.indexOf('VCC') >= 0 || p.indexOf(':GND') >= 0 || p.endsWith(':VCC'))) {
                    hasPowerOnCoilPath = true;
                }
            }
            if (!hasSwOnCoilPath) {
                issues.push(`线圈驱动回路缺少 ${swRef}：须 SW_PUSH 串联在 VCC 与 ${relayRef}:1 之间`);
            }
            if (!hasPowerOnCoilPath) {
                issues.push(`线圈驱动回路缺少电源轨：完整回路 VCC→${swRef}→${relayRef}:1, ${relayRef}:2→GND`);
            }
        }
        return issues;
    }
    private cacheGet<T extends object>(key: string): T | null {
        const entry = this.constraintCache.get(key);
        if (!entry) {
            return null;
        }
        if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
            this.constraintCache.delete(key);
            return null;
        }
        return entry.value as T;
    }
    private cacheSet(key: string, value: object): void {
        this.constraintCache.set(key, { value: value, timestamp: Date.now() });
    }
    /**
     * 复杂规划型 stage（net_plan / device_select）需要 LLM 推理能力；
     * 简单约束型 stage（layout / route / self_review）关掉思考以提速并降低幻觉。
     */
    private static needsThinking(capability: string): boolean {
        return capability === AiCapability.COMPONENT_RECOMMEND;
    }
    /** 电路生图所有阶段均需极高精确性 — 温度统一压低以防幻觉 */
    private static temperatureForStage(stage: string): number | undefined {
        switch (stage) {
            case 'device_select': return 0.08;
            case 'net_plan': return 0.05;
            case 'layout': return 0.08;
            case 'route': return 0.05;
            case 'self_review': return 0.05;
            default: return 0.1;
        }
    }
    private async chatWithRetry(prompt: string, capability: string, extraOpts?: ChatOptions): Promise<ChatResult> {
        let lastError = '';
        traceAiOp('AI_PIPE', 'llm_chat', `cap=${capability} promptLen=${prompt.length} maxRetries=${LLM_MAX_RETRIES}`);
        Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] WAIT LLM cap=${capability} promptLen=${prompt.length} — complex replies may take a long time`);
        for (let attempt = 0; attempt <= LLM_MAX_RETRIES; attempt++) {
            Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] chat attempt=${attempt + 1}/${LLM_MAX_RETRIES + 1} cap=${capability}`);
            const useThinking = AiPipelineOrchestrator.needsThinking(capability);
            const chatOpts: ChatOptions = {
                capability: capability as AiCapability,
                maxTokens: extraOpts?.maxTokens ?? LLM_MAX_OUTPUT_TOKENS,
                disableThinking: !useThinking
            };
            if (extraOpts?.temperature !== undefined) {
                chatOpts.temperature = extraOpts.temperature;
            }
            if (extraOpts?.disableThinking !== undefined) {
                chatOpts.disableThinking = extraOpts.disableThinking;
            }
            const result = await this.apiManager.chat(prompt, chatOpts);
            if (result.success && result.data) {
                Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] chat OK cap=${capability} len=${result.data.length}`);
                traceAiOp('AI_PIPE', 'llm_chat_ok', `cap=${capability} attempt=${attempt + 1} replyLen=${result.data.length}`);
                return result;
            }
            if (result.errCode && result.errCode >= 400 && result.errCode < 500) {
                Logger.error(INSTR_TRACE_TAG, `[AI_PIPE] chat 4xx cap=${capability} err=${result.error}`);
                traceAiOp('AI_PIPE', 'llm_chat_4xx', `cap=${capability} err=${result.error ?? ''}`);
                return result;
            }
            lastError = result.error ?? 'unknown';
            const isTimeout = lastError.toLowerCase().indexOf('timeout') >= 0 ||
                lastError.indexOf('超时') >= 0;
            Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] chat fail cap=${capability} err=${lastError}` +
                `${isTimeout ? ' (will wait longer before retry)' : ''}`);
            traceAiOp('AI_PIPE', 'llm_chat_retry', `cap=${capability} attempt=${attempt + 1} err=${lastError}`);
            if (attempt < LLM_MAX_RETRIES) {
                // 超时后更长退避，给模型/网络喘息，避免立刻再打爆
                const base = isTimeout ? LLM_BASE_BACKOFF_MS * 8 : LLM_BASE_BACKOFF_MS;
                const delay = base * Math.pow(2, attempt);
                Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] WAIT backoff ${delay}ms before retry cap=${capability}`);
                await new Promise<void>(r => setTimeout(r, delay));
            }
        }
        return { success: false, error: lastError };
    }
    async aiDiagnoseAndFix(topo: SchTopology): Promise<AiDiagnoseFixResult> {
        const doc = TopologyAdapter.fromTopology(topo);
        const violations = FaultDiagnoser.diagnose(doc);
        let fixes = 0;
        const diag: DiagError[] = [];
        for (let i = 0; i < violations.length; i++) {
            const v = violations[i];
            diag.push({
                level: v.severity === ErcSeverity.ERROR ? 'error' : 'warning',
                targetType: v.componentId ? 'device' : 'net',
                targetUuid: v.componentId ?? v.netId ?? '',
                errorDesc: v.message,
                repairSuggest: v.fixSuggestion ?? '',
                devReference: v.componentId ?? ''
            });
            if (v.fixSuggestion?.includes('pull') || v.message.includes('上拉')) {
                const hasR = topo.deviceList.some(d => d.libDevId.startsWith('R_'));
                if (!hasR) {
                    topo.deviceList.push(makeDeviceInst(IdUtil.generate('inst'), 'R_10k', `R${topo.deviceList.length + 1}`, 400, 300, 0, stringMap1('value', '10k')));
                    fixes++;
                }
            }
        }
        if (fixes > 0) {
            const routed = new SemanticNetBuilder(this.componentLibrary).build(topo);
            topo = routed.topology;
        }
        return { topo, fixes, diag };
    }
    private scoreLlmJson<T extends object>(parsed: T | null, expectedFields: string[]): number {
        if (!parsed) {
            return 0;
        }
        let filled = 0;
        for (const f of expectedFields) {
            const val = parsed[f as keyof T];
            if (val !== undefined && val !== null && val !== '') {
                if (Array.isArray(val) && (val as Object[]).length === 0) {
                    continue;
                }
                filled++;
            }
        }
        return expectedFields.length > 0 ? filled / expectedFields.length : 0;
    }
    private async fetchDeviceSelectLlm(opts: PipelineOptions): Promise<LlmFetchResult<DeviceSelectLlmOutput>> {
        // 编辑模式不缓存 — 结果依赖对话上下文
        const isEdit = opts.generationMode === 'edit';
        const cacheKey = isEdit ? '' : `select:${opts.prompt}`;
        if (!isEdit) {
            const cached = this.cacheGet<DeviceSelectLlmOutput>(cacheKey);
            if (cached) {
                Logger.info(INSTR_TRACE_TAG, '[AI_PIPE] device_select cache hit');
                return { output: cached, fromLlm: true };
            }
        }
        if (opts.skipLlm) {
            return { output: DeviceSelectEngine.buildLocalLlmOutput(opts.prompt), fromLlm: false };
        }
        const tpl = PromptLoader.load('device_select');
        const vars: PromptVarEntry[] = [
            { key: 'user_prompt', value: opts.prompt },
            { key: 'scene', value: opts.scene ?? 'text_gen' },
            {
                key: 'partial_topo',
                value: opts.partialTopo
                    ? AiPipelineOrchestrator.formatPartialTopoForPrompt(opts.partialTopo)
                    : ''
            }
        ];
        // 多轮对话: 注入历史上下文 + 编辑模式指令
        if (opts.conversationHistory && opts.conversationHistory.length > 0) {
            const historyText = opts.conversationHistory
                .map(h => `[${h.role}]: ${h.content}`)
                .join('\n');
            vars.push({ key: 'conversation_history',
                value: `对话历史（前序轮次）：\n${historyText}\n\n` });
        }
        else {
            vars.push({ key: 'conversation_history', value: '' });
        }
        if (opts.generationMode === 'edit') {
            vars.push({ key: 'generation_mode',
                value: '生成模式：edit — 在当前电路基础上增量修改，保留未涉及的现有器件，只调整用户要求变更的部分\n\n' });
        }
        else {
            vars.push({ key: 'generation_mode', value: '' });
        }
        const prompt = PromptLoader.renderEnriched(tpl, vars, this.componentLibrary, { includeFullPins: true });
        // AI 驱动纠错：选型不过关则把 critique 喂回 LLM 重试，不本地硬塞器件
        let critique = '';
        let lastParsed: DeviceSelectLlmOutput | null = null;
        const selectRounds = NEVER_ABORT_ROUNDS;
        for (let round = 0; round <= selectRounds; round++) {
            const roundPrompt = critique.length > 0
                ? `${prompt}\n\n【上次选型被审查拒绝 — 必须按下列要求重出完整 JSON】:\n${critique}`
                : prompt;
            const api = await this.chatWithRetry(roundPrompt, AiCapability.COMPONENT_RECOMMEND, { temperature: AiPipelineOrchestrator.temperatureForStage('device_select') });
            if (api.success && api.data) {
                const raw = PromptLoader.extractJson<Object>(api.data);
                const parsed = LlmJsonNormalizer.normalizeDeviceSelect(raw);
                const score = this.scoreLlmJson(parsed, LlmJsonNormalizer.deviceSelectScoreFields());
                Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] device_select parse score=${score.toFixed(2)} round=${round + 1}`);
                if (parsed && score >= QUALITY_MIN_FILL_RATE) {
                    lastParsed = parsed;
                    const issues = this.critiqueDeviceSelect(parsed, opts.prompt);
                    if (issues.length === 0) {
                        if (!isEdit) {
                            this.cacheSet(cacheKey, parsed);
                        }
                        return { output: parsed, fromLlm: true };
                    }
                    critique = issues.map((s, i) => `${i + 1}. ${s}`).join('\n');
                    Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] device_select AI-critique reject round=${round + 1}: ${critique}`);
                    continue;
                }
            }
            if (round === selectRounds) {
                break;
            }
        }
        if (lastParsed) {
            const still = this.critiqueDeviceSelect(lastParsed, opts.prompt);
            if (still.length === 0) {
                Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] device_select critique exhausted but last output now clean — accept without cache');
                return { output: lastParsed, fromLlm: true };
            }
            // 永不 ABORT：带瑕疵选型继续，外层/自审再修
            Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] KEEP_RETRY device_select residual=${still.length} — accept best (no ABORT): ${still.join('; ')}`);
            return { output: lastParsed, fromLlm: true };
        }
        Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] KEEP_RETRY device_select no parse — continue weak local shell (no ABORT)');
        return { output: DeviceSelectEngine.buildLocalLlmOutput(opts.prompt), fromLlm: false };
    }
    private async fetchLayoutLlm(devices: MatchedDevice[], constraint: string, opts: PipelineOptions): Promise<LlmFetchResult<LayoutLlmOutput>> {
        const defaultOut = PlacementOptimizer.defaultConstraints(devices);
        if (opts.skipLlm) {
            return { output: defaultOut, fromLlm: false };
        }
        const tpl = PromptLoader.load('layout');
        const deviceList = PromptLoader.buildLayoutDeviceHitSummary(devices, this.componentLibrary);
        const basePrompt = PromptLoader.renderEnriched(tpl, [
            { key: 'device_list', value: deviceList },
            { key: 'circuit_constraint', value: constraint },
            { key: 'mcu_family', value: opts.mcuFamily ?? 'auto' }
        ], this.componentLibrary);
        // AI 驱动纠错：布局不过关则 critique 回灌；轮次有上限，残差交给 resolveSelectionOverlaps
        let critique = '';
        let lastParsed: LayoutLlmOutput | null = null;
        const layoutRounds = 5;
        for (let round = 0; round <= layoutRounds; round++) {
            const roundPrompt = critique.length > 0
                ? `${basePrompt}\n\n【上次布局被审查拒绝 — 必须按下列要求重出完整 positions JSON】:\n${critique}`
                : basePrompt;
            const api = await this.chatWithRetry(roundPrompt, AiCapability.AUTO_WIRING, { temperature: AiPipelineOrchestrator.temperatureForStage('layout') });
            if (api.success && api.data) {
                const raw = PromptLoader.extractJson<Object>(api.data);
                const parsed = LlmJsonNormalizer.normalizeLayout(raw);
                const score = this.scoreLlmJson(parsed, LlmJsonNormalizer.layoutScoreFields());
                if (parsed && score >= QUALITY_MIN_FILL_RATE) {
                    lastParsed = parsed;
                    const issues = this.critiqueLayout(parsed, devices);
                    if (issues.length === 0) {
                        return { output: parsed, fromLlm: true };
                    }
                    critique = issues.map((s, i) => `${i + 1}. ${s}`).join('\n');
                    Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] layout AI-critique reject round=${round + 1}: ${critique}`);
                    continue;
                }
            }
            if (round === layoutRounds) {
                break;
            }
        }
        if (lastParsed) {
            const still = this.critiqueLayout(lastParsed, devices);
            if (still.length === 0) {
                Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] layout critique exhausted but last output now clean — accept');
                return { output: lastParsed, fromLlm: true };
            }
            Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] KEEP_RETRY layout residual=${still.length} — ACCEPT + gap resolve (no ABORT)`);
            return { output: lastParsed, fromLlm: true };
        }
        Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] KEEP_RETRY layout no parse — continue default constraints (no ABORT)');
        return { output: defaultOut, fromLlm: false };
    }
    /**
     * 验证 LLM 布局：坐标有效 + 选中区边到边通道 ≥80mil。
     * 间隙公式与 PlacementOptimizer.resolveOverlaps 一致：
     * 投影分离为正间隙，投影相交为负重叠；两轴都不足 CHANNEL 才算违规。
     * （旧实现误把相交宽度 clamp 成「间隙」，分离器件永远 gap=0 → 无限 reject）
     */
    private critiqueLayout(out: LayoutLlmOutput, devices: MatchedDevice[]): string[] {
        const issues: string[] = [];
        const positions = out.positions ?? [];
        if (positions.length === 0) {
            issues.push('positions 数组为空 — 必须为每个器件输出坐标');
            return issues;
        }
        if (positions.length < devices.length) {
            issues.push(`positions 数量(${positions.length})少于器件数(${devices.length}) — 每个器件必须有一个坐标`);
        }
        interface Rect {
            x1: number;
            y1: number;
            x2: number;
            y2: number;
            id: string;
        }
        const rects: Rect[] = [];
        const usedDevIdx = new Set<number>();
        for (let i = 0; i < positions.length; i++) {
            const p = positions[i];
            if (p.x === undefined || p.y === undefined || isNaN(p.x) || isNaN(p.y)) {
                issues.push(`第${i + 1}个坐标无效: x=${p.x}, y=${p.y}`);
                continue;
            }
            if (p.x < 20 || p.x > 1300 || p.y < 20 || p.y > 900) {
                issues.push(`器件 "${p.deviceId}" 坐标(${Math.round(p.x)},${Math.round(p.y)})超出画布有效范围[20..1300, 20..900]`);
            }
            if (Math.round(p.x) % 20 !== 0 || Math.round(p.y) % 20 !== 0) {
                issues.push(`器件 "${p.deviceId}" 坐标(${Math.round(p.x)},${Math.round(p.y)})不是20mil栅格的整数倍`);
            }
            const rot = p.rotate ?? 0;
            let x1 = p.x - 54;
            let y1 = p.y - 44;
            let x2 = p.x + 54;
            let y2 = p.y + 44;
            let matchedIdx = -1;
            for (let di = 0; di < devices.length; di++) {
                if (usedDevIdx.has(di)) {
                    continue;
                }
                const d = devices[di];
                if (d.libDevId === p.deviceId || d.name === p.deviceId) {
                    matchedIdx = di;
                    break;
                }
            }
            if (matchedIdx >= 0) {
                usedDevIdx.add(matchedIdx);
                const libId = devices[matchedIdx].libDevId;
                const comp = this.componentLibrary.getComponent(libId);
                if (comp?.success && comp.data && comp.data.pins.length > 0) {
                    const hr = DeviceHitGeometry.hitRectFromPins(comp.data.pins, p.x, p.y, rot, false);
                    x1 = hr.x;
                    y1 = hr.y;
                    x2 = hr.x + hr.w;
                    y2 = hr.y + hr.h;
                }
            }
            rects.push({
                x1: x1, y1: y1, x2: x2, y2: y2,
                id: p.deviceId ?? `pos_${i}`
            });
        }
        const CHANNEL = 80;
        const MAX_GAP_ISSUES = 12;
        let gapIssues = 0;
        for (let i = 0; i < rects.length && gapIssues < MAX_GAP_ISSUES; i++) {
            for (let j = i + 1; j < rects.length && gapIssues < MAX_GAP_ISSUES; j++) {
                const a = rects[i];
                const b = rects[j];
                // 与 PlacementOptimizer 相同：分离为正，重叠为负
                const gapX = (a.x2 < b.x1) ? (b.x1 - a.x2)
                    : ((b.x2 < a.x1) ? (a.x1 - b.x2) : -(Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)));
                const gapY = (a.y2 < b.y1) ? (b.y1 - a.y2)
                    : ((b.y2 < a.y1) ? (a.y1 - b.y2) : -(Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1)));
                if (gapX < CHANNEL && gapY < CHANNEL) {
                    const gx = Math.round(gapX);
                    const gy = Math.round(gapY);
                    const sx = gx < 0 ? `水平重叠${-gx}mil` : `水平间隙${gx}mil`;
                    const sy = gy < 0 ? `垂直重叠${-gy}mil` : `垂直间隙${gy}mil`;
                    issues.push(`器件 "${a.id}" 与 "${b.id}" 选中区间距不足(${sx}, ${sy}，需≥${CHANNEL}mil通道) — 请拉开距离`);
                    gapIssues++;
                }
            }
        }
        if (gapIssues >= MAX_GAP_ISSUES) {
            issues.push(`…另有更多间距问题已截断，请整体加大器件间距并保证通道≥${CHANNEL}mil`);
        }
        const hasMcu = devices.some(d => {
            const id = d.libDevId.toUpperCase();
            return id.indexOf('STM32') >= 0 || id.indexOf('AT89') >= 0 || id.indexOf('STC') >= 0;
        });
        if (hasMcu) {
            const mcuPos = positions.find(p => {
                const id = (p.deviceId ?? '').toUpperCase();
                return id.indexOf('STM32') >= 0 || id.indexOf('AT89') >= 0 ||
                    id.indexOf('STC') >= 0 || id.indexOf('MCU') >= 0;
            });
            if (mcuPos) {
                if (mcuPos.x < 300 || mcuPos.x > 800 || mcuPos.y < 150 || mcuPos.y > 550) {
                    issues.push(`MCU "${mcuPos.deviceId}" 不在画布中央区域 (x∈[300,800], y∈[150,550])，` +
                        `当前(${Math.round(mcuPos.x)},${Math.round(mcuPos.y)})`);
                }
            }
        }
        return issues;
    }
    /** v3.1: LLM 全权负责网络拓扑规划 */
    private async fetchNetPlanLlm(topo: SchTopology, opts: PipelineOptions): Promise<LlmFetchResult<NetPlanResult>> {
        if (opts.skipLlm) {
            Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] net_plan skipLlm');
            const skipOut: NetPlanResult = {
                nets: [],
                labels: [],
                wiringHints: { priorityOrder: [], forceWire: [], forceLabel: [] },
                topologyNotes: 'skipLlm'
            };
            return { output: skipOut, fromLlm: false };
        }
        const tpl = PromptLoader.load('net_plan');
        const deviceDetail = PromptLoader.buildDeviceDetailForNetPlan(topo, this.componentLibrary);
        const posSummary = PromptLoader.buildPositionSummary(topo, this.componentLibrary);
        // 注入反模式警示 + 库内 libDevId 清单，防止 LLM 编造不存在的连接方式
        const prompt = PromptLoader.renderEnriched(tpl, [
            { key: 'user_prompt', value: opts.prompt },
            { key: 'device_detail', value: deviceDetail },
            { key: 'position_summary', value: posSummary }
        ], this.componentLibrary);
        // AI 驱动纠错：net_plan 触点拓扑不过关则 critique 回灌 LLM
        let critique = '';
        let lastPlan: NetPlanResult | null = null;
        const netRounds = NEVER_ABORT_ROUNDS;
        for (let round = 0; round <= netRounds; round++) {
            const roundPrompt = critique.length > 0
                ? `${prompt}\n\n【上次网络计划被审查拒绝 — 必须按下列要求重出完整 netPlan JSON】:\n${critique}\n` +
                    `【铁律】仪器 CH/V+ 必须并入被测信号网同名，禁止 PROBE_* 重复列出被测脚；一脚只能属一网。`
                : prompt;
            const api = await this.chatWithRetry(roundPrompt, AiCapability.COMPONENT_RECOMMEND, { temperature: AiPipelineOrchestrator.temperatureForStage('net_plan') });
            if (!api.success) {
                Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] KEEP_RETRY net_plan API failed: ${api.error ?? 'no error info'} round=${round + 1}`);
                continue;
            }
            if (!api.data || api.data.length === 0) {
                Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] KEEP_RETRY net_plan empty data round=${round + 1}`);
                continue;
            }
            const raw = PromptLoader.extractJson<NetPlanResult>(api.data);
            if (!raw || !raw.nets || !Array.isArray(raw.nets) || raw.nets.length === 0) {
                Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] KEEP_RETRY net_plan JSON invalid round=${round + 1}`);
                critique = '输出必须是含非空 nets[] 的完整 JSON，每网含 connections(compRef/pinId/mode)';
                continue;
            }
            const repaired = NetPlanExecutor.sanitizeDuplicatePins(raw, topo);
            if (repaired > 0) {
                Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] net_plan sanitize duplicate-pins fixes=${repaired} round=${round + 1}`);
            }
            lastPlan = raw;
            const issues = AiPipelineOrchestrator.critiqueNetPlan(raw, topo, opts.prompt);
            if (issues.length === 0) {
                Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] net_plan LLM OK nets=${raw.nets.length}` +
                    ` labels=${raw.labels?.length ?? 0} round=${round + 1}`);
                try {
                    traceAiPayload('AI_PIPE', 'NETPLAN_JSON', JSON.stringify(raw), 'stage=net_plan');
                }
                catch (_e) {
                    // ignore
                }
                return { output: raw, fromLlm: true };
            }
            critique = issues.map((s, i) => `${i + 1}. ${s}`).join('\n');
            Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] net_plan AI-critique reject round=${round + 1}: ${critique}`);
        }
        if (lastPlan) {
            const again = NetPlanExecutor.sanitizeDuplicatePins(lastPlan, topo);
            if (again > 0) {
                Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] net_plan final sanitize fixes=${again}`);
            }
            const still = AiPipelineOrchestrator.critiqueNetPlan(lastPlan, topo, opts.prompt);
            if (still.length === 0) {
                Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] net_plan critique exhausted but sanitized plan clean — accept');
                return { output: lastPlan, fromLlm: true };
            }
            // 永不 ABORT：消毒后仍有瑕疵也继续执行，交给自审/布线修复
            Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] KEEP_RETRY net_plan residual=${still.length} — accept sanitized (no ABORT): ${still.join('; ')}`);
            return { output: lastPlan, fromLlm: true };
        }
        Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] KEEP_RETRY net_plan no plan yet — return empty for outer retry (no ABORT)');
        const failOut: NetPlanResult = {
            nets: [], labels: [],
            wiringHints: { priorityOrder: [], forceWire: [], forceLabel: [] },
            topologyNotes: 'net_plan pending KEEP_RETRY'
        };
        return { output: failOut, fromLlm: false };
    }
    /** 将 net_plan.wiringHints 合并进布线约束（标号优先） */
    private mergeNetPlanHintsIntoRouting(route: RoutingLlmOutput, netPlanFetch: LlmFetchResult<NetPlanResult>): void {
        if (!netPlanFetch.fromLlm || !netPlanFetch.output.wiringHints) {
            return;
        }
        const hints = netPlanFetch.output.wiringHints;
        const mergeUnique = (base: string[] | undefined, extra: string[]): string[] => {
            const out: string[] = [];
            const seen = new Set<string>();
            const src = (base ?? []).concat(extra);
            for (let i = 0; i < src.length; i++) {
                const u = src[i].toUpperCase();
                if (u.length === 0 || seen.has(u)) {
                    continue;
                }
                seen.add(u);
                out.push(src[i]);
            }
            return out;
        };
        route.forceLabelNets = mergeUnique(route.forceLabelNets, hints.forceLabel ?? []);
        route.forceWireNets = mergeUnique(route.forceWireNets, hints.forceWire ?? []);
        if ((route.forceLabelNets?.length ?? 0) > 0 || (route.forceWireNets?.length ?? 0) > 0) {
            Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] route modeHints forceLabel=[${(route.forceLabelNets ?? []).join(',')}]` +
                ` forceWire=[${(route.forceWireNets ?? []).join(',')}]`);
        }
    }
    private async fetchRoutingLlm(topo: SchTopology, opts: PipelineOptions): Promise<LlmFetchResult<RoutingLlmOutput>> {
        const idHint = topo.deviceList.slice(0, 24).map(d => d.libDevId).join(',') +
            '|' + topo.netList.slice(0, 24).map(n => n.netName).join(',');
        const cacheKey = `route:${topo.deviceList.length}:${topo.netList.length}:${idHint}`;
        const cached = this.cacheGet<RoutingLlmOutput>(cacheKey);
        if (cached) {
            return { output: cached, fromLlm: true };
        }
        const defaultOut = ConstrainedWiringEngine.defaultConstraints(topo);
        if (opts.skipLlm) {
            return { output: defaultOut, fromLlm: false };
        }
        const tpl = PromptLoader.load('route');
        const prompt = PromptLoader.renderEnriched(tpl, [
            {
                key: 'topology_summary',
                value: `${topo.deviceList.length} devices, ${topo.netList.length} nets`
            },
            { key: 'net_list', value: topo.netList.map(n => n.netName).join(', ') }
        ], this.componentLibrary);
        const api = await this.chatWithRetry(prompt, AiCapability.AUTO_WIRING, { temperature: AiPipelineOrchestrator.temperatureForStage('route') });
        if (api.success && api.data) {
            const raw = PromptLoader.extractJson<Object>(api.data);
            const parsed = LlmJsonNormalizer.normalizeRouting(raw);
            const score = this.scoreLlmJson(parsed, LlmJsonNormalizer.routingScoreFields());
            if (parsed && score >= QUALITY_MIN_FILL_RATE) {
                this.cacheSet(cacheKey, parsed);
                return { output: parsed, fromLlm: true };
            }
        }
        return { output: defaultOut, fromLlm: false };
    }
}
