import type { IAiApiManager, ChatOptions } from 'ai_api_manager';
import type { IComponentLibrary } from 'component_library';
import { AiCapability, makeProgress, IdUtil, ErcSeverity, TopologyAdapter, makeDeviceInst, stringMap1, EventBus, ModuleEvent, Logger, INSTR_TRACE_TAG, traceAiPayload, traceAiOp } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchTopology, AiPipelineResult, DeviceSelectLlmOutput, LayoutLlmOutput, RoutingLlmOutput, ProgressCallback, DiagError, MatchedDevice, RoutingWeightPrefs, ErcError, Point2D, LayoutPositionItem, PlacementResult, PlacementCandidate, DevicePosition, ModuleEventPayload } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
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
interface DegradedEventData {
    message: string;
}
const CACHE_TTL_MS = 5 * 60 * 1000;
const LLM_MAX_RETRIES = 2;
const LLM_BASE_BACKOFF_MS = 1000;
const LLM_MAX_OUTPUT_TOKENS = 65536;
const QUALITY_MIN_FILL_RATE = 0.4;
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
    }
    async runFullPipeline(opts: PipelineOptions, onProgress?: ProgressCallback): Promise<AiPipelineResult> {
        let usedLlm = false;
        let degradedMode = false;
        const emptyAlts = new Map<string, string[]>();
        Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] START promptLen=${opts.prompt.length} skipLlm=${!!opts.skipLlm}` +
            ` scene=${opts.scene ?? 'text_gen'} mcu=${opts.mcuFamily ?? 'auto'}`);
        traceAiPayload('AI_PIPE', 'USER', opts.prompt, `scene=${opts.scene ?? 'text_gen'} skipLlm=${!!opts.skipLlm}`);
        traceAiOp('AI_PIPE', 'pipeline_start', `scene=${opts.scene ?? 'text_gen'} mcu=${opts.mcuFamily ?? 'auto'}`);
        onProgress?.(makeProgress(5, '解析器件需求(LLM)'));
        traceAiOp('AI_PIPE', 'device_select', 'fetch LLM JSON');
        const selectLlm = await this.fetchDeviceSelectLlm(opts);
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
            // 生产路径：API 失败则直接失败，禁止模板/本地选型回退
            Logger.error(INSTR_TRACE_TAG, '[AI_PIPE] ABORT: device_select LLM unavailable — no template fallback');
            onProgress?.(makeProgress(100, 'AI API 不可用', true));
            this.notifyDegraded('器件选型');
            return {
                selectResult: {
                    devices: [],
                    alternatives: emptyAlts,
                    oodDetected: false
                },
                usedLlm: false,
                degradedMode: true
            };
        }
        else {
            degradedMode = true;
            Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] device_select local (skipLlm)');
            this.notifyDegraded('器件选型');
        }
        onProgress?.(makeProgress(20, '本地器件库匹配'));
        traceAiOp('AI_PIPE', 'library_match', 'matchFromLlmOutput');
        const selectResult = this.selectEngine.matchFromLlmOutput(selectLlm.output, opts.prompt);
        if (selectResult.devices.length === 0) {
            const oodFlags = selectLlm.output.oodFlags ?? [];
            if (oodFlags.length > 0) {
                Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] OOD abort: flags=${oodFlags.join(',')} + zero matches`);
                return {
                    selectResult: { devices: [], alternatives: emptyAlts, oodDetected: true },
                    usedLlm: usedLlm,
                    degradedMode: degradedMode,
                    topology: opts.partialTopo
                };
            }
            Logger.error(INSTR_TRACE_TAG, '[AI_PIPE] ABORT: zero library matches');
            return { selectResult, usedLlm, degradedMode };
        }
        if (selectLlm.output.oodFlags && selectLlm.output.oodFlags.length > 0) {
            Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] OOD notes (non-fatal, devices matched): ${selectLlm.output.oodFlags.join(',')}`);
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
        const layoutLlm = await this.fetchLayoutLlm(selectResult.devices, selectLlm.output.circuitConstraint, opts);
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
        else {
            degradedMode = true;
            Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] layout constraints local default');
            this.notifyDegraded('布局约束');
        }
        // AI 驱动布局: LLM 直接输出坐标 (优先), GA 仅作回退
        const aiPositions = layoutLlm.output.positions;
        let placement: PlacementResult;
        if (aiPositions && aiPositions.length > 0) {
            onProgress?.(makeProgress(50, 'AI 坐标布局'));
            traceAiOp('AI_PIPE', 'placement', 'AI position-driven');
            placement = this.applyAiPositions(selectResult.devices, aiPositions, opts.lockedDeviceUuids ?? [], opts.partialTopo);
            Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] placement AI-driven: ${aiPositions.length} positions`);
        }
        else {
            onProgress?.(makeProgress(50, '遗传算法布局优化'));
            traceAiOp('AI_PIPE', 'placement', 'GA optimizeAsync (fallback)');
            placement = await this.placementOptimizer.optimizeAsync(selectResult.devices, layoutLlm.output, opts.lockedDeviceUuids ?? [], opts.partialTopo);
        }
        const placeHint = placement.topology.deviceList
            .slice(0, 10)
            .map(d => `${d.refName || d.libDevId}@(${Math.round(d.x)},${Math.round(d.y)})`)
            .join(', ');
        Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] placement devices=${placement.topology.deviceList.length}`);
        traceAiOp('AI_PIPE', 'placement_done', `devices=${placement.topology.deviceList.length} ${placeHint}`);
        // 流式快照 #1: 器件已摆放，尚无网络/导线
        opts.onStreamSnapshot?.(placement.topology, 'placement');
        // v3.1: LLM 全权负责网络拓扑规划，函数仅执行
        onProgress?.(makeProgress(62, 'LLM 网络拓扑规划'));
        traceAiOp('AI_PIPE', 'net_plan', 'LLM net_plan + NetPlanExecutor');
        const netPlanResult = await this.fetchNetPlanLlm(placement.topology, opts);
        let topoWithNets: SchTopology;
        let netPlanNotes = '';
        if (netPlanResult.fromLlm) {
            usedLlm = true;
            const execResult = NetPlanExecutor.execute(placement.topology, netPlanResult.output);
            topoWithNets = execResult.topology;
            netPlanNotes = execResult.notes;
            Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] LLM netPlan: ${execResult.netCount}网/${execResult.labelCount}标号` +
                `/${execResult.stubWireCount}stubs failures=${execResult.failures.length}`);
            traceAiOp('AI_PIPE', 'net_plan_done', `nets=${execResult.netCount} labels=${execResult.labelCount}` +
                ` stubs=${execResult.stubWireCount} failures=${execResult.failures.length}`);
            if (execResult.failures.length > 0) {
                Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] netPlan failures: ${execResult.failures.join('; ')}`);
            }
        }
        else {
            // LLM 不可用 → 回退到 SemanticNetBuilder (确定性拓扑推理)
            traceAiOp('AI_PIPE', 'net_plan_fallback', 'SemanticNetBuilder fallback');
            const clone = JSON.parse(JSON.stringify(placement.topology)) as SchTopology;
            clone.netList = [];
            clone.netLabelList = [];
            clone.wireList = [];
            try {
                const semResult = new SemanticNetBuilder(this.componentLibrary).build(clone);
                topoWithNets = semResult.topology;
                netPlanNotes = `SemanticNetBuilder回退: ${semResult.summary} (${semResult.wiredNets}网/${semResult.instrumentLinks}仪器连接)`;
                Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] net_plan fell back to SemanticNetBuilder: ${netPlanNotes}`);
            }
            catch (_e) {
                topoWithNets = clone;
                degradedMode = true;
                netPlanNotes = 'LLM+SemanticNetBuilder均不可用, 仅创建最小电源网络';
                Logger.error(INSTR_TRACE_TAG, `[AI_PIPE] SemanticNetBuilder fallback also failed`);
                this.notifyDegraded('网络规划');
            }
        }
        onProgress?.(makeProgress(70, netPlanNotes));
        // 流式快照 #2: 网络/标号/stub导线已创建，布线尚未开始
        opts.onStreamSnapshot?.(topoWithNets, 'net_plan');
        onProgress?.(makeProgress(75, '获取布线约束'));
        traceAiOp('AI_PIPE', 'routing_constraints', 'fetch LLM or default');
        const routeLlm = await this.fetchRoutingLlm(topoWithNets, opts);
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
            degradedMode = true;
            Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] routing constraints local default');
            this.notifyDegraded('布线约束');
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
        let routeResult = this.wiringEngine.route(topoWithNets, routeLlm.output, opts.routingWeights, netWaypoints);
        routeResult = this.wiringEngine.fixViolations(topoWithNets, routeResult);
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
        const ercErrN = ercErrors.filter(e => e.severity === 'error').length;
        const ercWarnN = ercErrors.filter(e => e.severity === 'warning').length;
        Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] ERC errors=${ercErrN} warnings=${ercWarnN}`);
        traceAiOp('AI_PIPE', 'erc_done', `total=${ercErrors.length} errors=${ercErrN} warnings=${ercWarnN}`);
        // ─── 几何碰撞检测 (函数: 确定性几何计算) ───
        onProgress?.(makeProgress(92, '几何碰撞检测'));
        const geoIssues = this.collectGeometricIssues(topoWithNets);
        // 附加连线拥挤分析
        const congestionIssues = this.collectCongestionIssues(topoWithNets);
        for (const ci of congestionIssues) {
            geoIssues.push(ci);
        }
        if (geoIssues.length > 0) {
            Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] geometric issues: ${geoIssues.map(i => i.type).join(',')}`);
        }
        // ─── AI 自检审查 (LLM 决策: 识别问题 + 生成修复方案) ───
        onProgress?.(makeProgress(94, 'AI 自检审查'));
        traceAiOp('AI_PIPE', 'self_review', 'LLM self-review');
        const reviewResult = await this.fetchSelfReviewLlm(topoWithNets, ercErrors, geoIssues, opts);
        if (reviewResult.fromLlm) {
            usedLlm = true;
            Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] AI self-review: passed=${reviewResult.output.passed}` +
                ` issues=${reviewResult.output.issues.length}`);
            traceAiOp('AI_PIPE', 'self_review_done', `passed=${reviewResult.output.passed} issues=${reviewResult.output.issues.length}` +
                ` summary=${reviewResult.output.summary.substring(0, 80)}`);
        }
        else {
            Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] self-review LLM unavailable');
        }
        // ─── AI 驱动修复 (LLM 决策修复策略, 函数执行修复动作) ───
        let aiFixApplied = 0;
        if (reviewResult.fromLlm && reviewResult.output.issues.length > 0) {
            onProgress?.(makeProgress(96, 'AI 驱动修复'));
            aiFixApplied = this.executeAiFixes(topoWithNets, reviewResult.output.issues);
            if (aiFixApplied > 0) {
                try {
                    const semRebuild = new SemanticNetBuilder(this.componentLibrary).build(topoWithNets);
                    topoWithNets = semRebuild.topology;
                }
                catch (_e) {
                    Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] SemanticNetBuilder rebuild after AI fix failed');
                }
                const reRoute = this.wiringEngine.route(topoWithNets, ConstrainedWiringEngine.defaultConstraints(topoWithNets), opts.routingWeights);
                topoWithNets.wireList = reRoute.routeLines;
                ercErrors = this.collectErc(topoWithNets);
                topoWithNets.ercErrorList = ercErrors;
                Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] AI fix applied=${aiFixApplied}` +
                    ` devices=${topoWithNets.deviceList.length} erc=${ercErrors.length}`);
                traceAiOp('AI_PIPE', 'ai_fix_done', `fixes=${aiFixApplied} devices=${topoWithNets.deviceList.length}`);
            }
        }
        // ─── PostGenValidator 确定性兜底 — 无论LLM结果如何, 始终运行 ───
        const validator = new PostGenValidator(this.componentLibrary);
        const valResult = validator.validateAndFix(topoWithNets);
        if (valResult.fixedCount > 0) {
            topoWithNets = valResult.topo;
            ercErrors = this.collectErc(topoWithNets);
            topoWithNets.ercErrorList = ercErrors;
            Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] PostGenValidator fixed=${valResult.fixedCount}` +
                ` remainingIssues=${valResult.issues.filter(i => i.severity === 'error').length}`);
            traceAiOp('AI_PIPE', 'postgen_fix', `fixed=${valResult.fixedCount} issues=${valResult.issues.length}`);
        }
        // ─── 最终 ERC + 几何确认 ───
        const finalGeoIssues = this.collectGeometricIssues(topoWithNets);
        const finalErcErrors = ercErrors.filter(e => e.severity === 'error').length;
        const finalErcWarns = ercErrors.filter(e => e.severity === 'warning').length;
        const selfReviewPassed = finalErcErrors === 0 && finalGeoIssues.length === 0;
        const fixDesc = aiFixApplied > 0 ?
            `AI修复${aiFixApplied}处+PostGenValidator兜底` :
            `PostGenValidator兜底`;
        onProgress?.(makeProgress(98, fixDesc));
        Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] END usedLlm=${usedLlm} degraded=${degradedMode}` +
            ` devices=${topoWithNets.deviceList.length} wires=${topoWithNets.wireList.length}` +
            ` erc=${ercErrors.length} geoIssues=${finalGeoIssues.length}` +
            ` reviewPassed=${selfReviewPassed}`);
        traceAiOp('AI_PIPE', 'pipeline_end', `usedLlm=${usedLlm} degraded=${degradedMode}` +
            ` devices=${topoWithNets.deviceList.length} wires=${topoWithNets.wireList.length}` +
            ` erc=${ercErrors.length} reviewPassed=${selfReviewPassed}`);
        onProgress?.(makeProgress(100, '闭环完成', true));
        return {
            selectResult,
            placementResult: placement,
            routeResult,
            ercErrors,
            topology: topoWithNets,
            usedLlm,
            degradedMode
        };
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
        // 先复制锁定器件
        if (partialTopo) {
            for (const d of partialTopo.deviceList) {
                if (lockedUuids.includes(d.instUuid)) {
                    topo.deviceList.push(d);
                }
            }
        }
        // 为每个匹配器件应用 AI 坐标
        const posMap = new Map<string, DevicePosition>();
        for (const p of positions) {
            const dp: DevicePosition = { x: p.x, y: p.y, rotate: p.rotate ?? 0 };
            posMap.set(p.deviceId, dp);
        }
        for (let i = 0; i < devices.length; i++) {
            const dev = devices[i];
            const pos = posMap.get(dev.name) ?? posMap.get(dev.libDevId);
            const x = pos?.x ?? 200 + Math.random() * 600;
            const y = pos?.y ?? 200 + Math.random() * 400;
            const rotate = pos?.rotate ?? 0;
            const refPrefix = dev.libDevId.startsWith('R_') ? 'R' :
                dev.libDevId.startsWith('C_') ? 'C' :
                    dev.libDevId.includes('STM32') || dev.libDevId.includes('AT89') ? 'U' : 'U';
            const inst = makeDeviceInst(IdUtil.generate('inst'), dev.libDevId, dev.name || `${refPrefix}${i + 1}`, x, y, rotate, dev.params);
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
        const prompt = PromptLoader.render(tpl, vars);
        const api = await this.chatWithRetry(prompt, AiCapability.COMPONENT_RECOMMEND);
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
        // 导线摘要
        const wireLines: string[] = [];
        for (const w of topo.wireList) {
            wireLines.push(`  ${w.netUuid}: ${w.points?.length ?? 0} points`);
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
        // 位置+密度报告 (含拥挤度分析, 帮助LLM判断标号-vs-导线)
        const densityReport = PromptLoader.buildPositionSummary(topo);
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
    private executeAiFixes(topo: SchTopology, issues: AiReviewIssue[]): number {
        let fixCount = 0;
        for (const issue of issues) {
            if (!issue.fixDetail) {
                continue;
            }
            const detail = issue.fixDetail;
            switch (issue.fixAction) {
                case 'add_component': {
                    if (detail.libDevId) {
                        const existCheck = topo.deviceList.some(d => d.libDevId === detail.libDevId &&
                            Math.abs(d.x - (detail.x ?? 0)) < 30 &&
                            Math.abs(d.y - (detail.y ?? 0)) < 30);
                        if (!existCheck) {
                            const params = new Map<string, string>();
                            if (detail.paramKey && detail.paramValue) {
                                params.set(detail.paramKey, detail.paramValue);
                            }
                            topo.deviceList.push(makeDeviceInst(IdUtil.generate('inst'), detail.libDevId, detail.refName ?? detail.libDevId, detail.x ?? 200 + fixCount * 60, detail.y ?? 300, 0, params));
                            fixCount++;
                            Logger.info(INSTR_TRACE_TAG, `[AI_FIX] add ${detail.libDevId} at (${detail.x},${detail.y})` +
                                ` reason=${detail.reason ?? ''}`);
                        }
                    }
                    break;
                }
                case 'remove_component': {
                    const before = topo.deviceList.length;
                    topo.deviceList = topo.deviceList.filter(d => d.libDevId !== detail.libDevId && d.refName !== detail.refName);
                    if (topo.deviceList.length < before) {
                        fixCount++;
                        Logger.info(INSTR_TRACE_TAG, `[AI_FIX] removed ${detail.libDevId ?? detail.refName}` +
                            ` reason=${detail.reason ?? ''}`);
                    }
                    break;
                }
                case 'change_param': {
                    if (detail.paramKey && detail.paramValue) {
                        for (const d of topo.deviceList) {
                            if (d.libDevId === detail.libDevId || d.refName === detail.refName) {
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
                case 'rebuild_instrument': {
                    // 仪器拓扑重建: 由 SemanticNetBuilder 统一处理
                    try {
                        const semResult = new SemanticNetBuilder(this.componentLibrary).build(topo);
                        topo.deviceList = semResult.topology.deviceList;
                        topo.netList = semResult.topology.netList;
                        topo.netLabelList = semResult.topology.netLabelList;
                        fixCount++;
                        Logger.info(INSTR_TRACE_TAG, `[AI_FIX] rebuild_instrument: ${semResult.summary}` +
                            ` reason=${detail.reason ?? ''}`);
                    }
                    catch (_e) {
                        Logger.warn(INSTR_TRACE_TAG, `[AI_FIX] rebuild_instrument failed: ${_e}`);
                    }
                    break;
                }
                case 'reroute': {
                    // 重布线由外层统一处理, 这里仅标记
                    fixCount++;
                    Logger.info(INSTR_TRACE_TAG, `[AI_FIX] reroute requested reason=${detail.reason ?? ''}`);
                    break;
                }
                default: {
                    Logger.info(INSTR_TRACE_TAG, `[AI_FIX] unknown fixAction=${issue.fixAction} type=${issue.type}`);
                    break;
                }
            }
        }
        return fixCount;
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
    private async chatWithRetry(prompt: string, capability: string, extraOpts?: ChatOptions): Promise<ChatResult> {
        let lastError = '';
        traceAiOp('AI_PIPE', 'llm_chat', `cap=${capability} promptLen=${prompt.length} maxRetries=${LLM_MAX_RETRIES}`);
        for (let attempt = 0; attempt <= LLM_MAX_RETRIES; attempt++) {
            Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] chat attempt=${attempt + 1}/${LLM_MAX_RETRIES + 1} cap=${capability}`);
            const chatOpts: ChatOptions = {
                capability: capability as AiCapability,
                maxTokens: extraOpts?.maxTokens ?? LLM_MAX_OUTPUT_TOKENS,
                disableThinking: true
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
            Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] chat fail cap=${capability} err=${lastError}`);
            traceAiOp('AI_PIPE', 'llm_chat_retry', `cap=${capability} attempt=${attempt + 1} err=${lastError}`);
            if (attempt < LLM_MAX_RETRIES) {
                const delay = LLM_BASE_BACKOFF_MS * Math.pow(2, attempt);
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
                value: opts.partialTopo ? JSON.stringify(opts.partialTopo.deviceList.slice(0, 5)) : ''
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
        const prompt = PromptLoader.renderEnriched(tpl, vars, this.componentLibrary);
        const api = await this.chatWithRetry(prompt, AiCapability.COMPONENT_RECOMMEND);
        if (api.success && api.data) {
            const raw = PromptLoader.extractJson<Object>(api.data);
            const parsed = LlmJsonNormalizer.normalizeDeviceSelect(raw);
            const score = this.scoreLlmJson(parsed, LlmJsonNormalizer.deviceSelectScoreFields());
            Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] device_select parse score=${score.toFixed(2)}`);
            if (parsed && score >= QUALITY_MIN_FILL_RATE) {
                if (!isEdit) {
                    this.cacheSet(cacheKey, parsed);
                }
                return { output: parsed, fromLlm: true };
            }
        }
        Logger.error(INSTR_TRACE_TAG, `[AI_PIPE] device_select LLM failed: ${api.error ?? 'low quality / empty'}`);
        return { output: DeviceSelectEngine.buildLocalLlmOutput(opts.prompt), fromLlm: false };
    }
    private async fetchLayoutLlm(devices: MatchedDevice[], constraint: string, opts: PipelineOptions): Promise<LlmFetchResult<LayoutLlmOutput>> {
        const defaultOut = PlacementOptimizer.defaultConstraints(devices);
        if (opts.skipLlm) {
            return { output: defaultOut, fromLlm: false };
        }
        const tpl = PromptLoader.load('layout');
        const prompt = PromptLoader.renderEnriched(tpl, [
            { key: 'device_list', value: devices.map(d => `${d.name}(${d.libDevId})`).join(', ') },
            { key: 'circuit_constraint', value: constraint },
            { key: 'mcu_family', value: opts.mcuFamily ?? 'auto' }
        ], this.componentLibrary);
        const api = await this.chatWithRetry(prompt, AiCapability.AUTO_WIRING);
        if (api.success && api.data) {
            const raw = PromptLoader.extractJson<Object>(api.data);
            const parsed = LlmJsonNormalizer.normalizeLayout(raw);
            const score = this.scoreLlmJson(parsed, LlmJsonNormalizer.layoutScoreFields());
            if (parsed && score >= QUALITY_MIN_FILL_RATE) {
                return { output: parsed, fromLlm: true };
            }
        }
        return { output: defaultOut, fromLlm: false };
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
        const posSummary = PromptLoader.buildPositionSummary(topo);
        // net_plan 已含完整器件详情，无需 renderEnriched 的器件库目录注入
        const prompt = PromptLoader.render(tpl, [
            { key: 'user_prompt', value: opts.prompt },
            { key: 'device_detail', value: deviceDetail },
            { key: 'position_summary', value: posSummary }
        ]);
        const api = await this.chatWithRetry(prompt, AiCapability.COMPONENT_RECOMMEND);
        if (!api.success) {
            Logger.error(INSTR_TRACE_TAG, `[AI_PIPE] net_plan API failed: ${api.error ?? 'no error info'}`);
            const failOut: NetPlanResult = {
                nets: [], labels: [],
                wiringHints: { priorityOrder: [], forceWire: [], forceLabel: [] },
                topologyNotes: 'API failed'
            };
            return { output: failOut, fromLlm: false };
        }
        if (!api.data || api.data.length === 0) {
            Logger.error(INSTR_TRACE_TAG, '[AI_PIPE] net_plan API returned empty data');
            const failOut: NetPlanResult = {
                nets: [], labels: [],
                wiringHints: { priorityOrder: [], forceWire: [], forceLabel: [] },
                topologyNotes: 'empty response'
            };
            return { output: failOut, fromLlm: false };
        }
        const raw = PromptLoader.extractJson<NetPlanResult>(api.data);
        if (!raw) {
            Logger.error(INSTR_TRACE_TAG, `[AI_PIPE] net_plan JSON parse failed, raw=${api.data.substring(0, 200)}`);
            const failOut: NetPlanResult = {
                nets: [], labels: [],
                wiringHints: { priorityOrder: [], forceWire: [], forceLabel: [] },
                topologyNotes: 'JSON parse failed'
            };
            return { output: failOut, fromLlm: false };
        }
        // 基本校验: 必须有 nets 数组
        if (!raw.nets || !Array.isArray(raw.nets) || raw.nets.length === 0) {
            Logger.error(INSTR_TRACE_TAG, `[AI_PIPE] net_plan JSON has no valid nets, keys=${Object.keys(raw).join(',')}`);
            const failOut: NetPlanResult = {
                nets: [], labels: [],
                wiringHints: { priorityOrder: [], forceWire: [], forceLabel: [] },
                topologyNotes: 'no nets in JSON'
            };
            return { output: failOut, fromLlm: false };
        }
        Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] net_plan LLM OK nets=${raw.nets.length}` +
            ` labels=${raw.labels?.length ?? 0}`);
        try {
            traceAiPayload('AI_PIPE', 'NETPLAN_JSON', JSON.stringify(raw), 'stage=net_plan');
        }
        catch (_e) {
            // ignore
        }
        return { output: raw, fromLlm: true };
    }
    private async fetchRoutingLlm(topo: SchTopology, opts: PipelineOptions): Promise<LlmFetchResult<RoutingLlmOutput>> {
        const cacheKey = `route:${topo.deviceList.length}:${topo.netList.length}`;
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
        const api = await this.chatWithRetry(prompt, AiCapability.AUTO_WIRING);
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
