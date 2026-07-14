import type { IAiEngine } from './api/IAiEngine';
import { AutoWiringEngine } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/AutoWiringEngine";
import { ConstrainedWiringEngine } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/ConstrainedWiringEngine";
import { FaultDiagnoser } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/FaultDiagnoser";
import { CircuitTemplates } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/CircuitTemplates";
import { AiPipelineOrchestrator } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/AiPipelineOrchestrator";
import { DeviceSelectEngine } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/DeviceSelectEngine";
import { PlacementOptimizer } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/PlacementOptimizer";
import { PromptLoader } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/prompts/PromptLoader";
import { BomPricingDatabase } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/internal/BomPricingDatabase";
import { AiDiagnosisReporter } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/internal/AiDiagnosisReporter";
import { AiPipelineValidator } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/validation/AiPipelineValidator";
import { AiResultCache } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/AiResultCache";
import { TeachingService } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/TeachingService";
import type { IComponentLibrary } from 'component_library';
import { AiCapability, EventBus, ModuleEvent, ErcSeverity, ErcRuleType, AiTaskType, ErrCode, ResultHelper, TopologyAdapter, makeProgress, makeRouteLine, emptySchTopology, DynamicErcEngine } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { AiRequest, AiResponse, SchematicDocument, SimulationResult, ErcViolation, Result, LogicState, SchTopology, AiTaskResult, DiagError, BomOptResult, WaveData, ProgressCallback, ApiResult, RouteResult, RouteLine, DeviceSelectLlmOutput, RoutingLlmOutput, AiPipelineResult, DeviceSelectResult } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { IAiApiManager } from 'ai_api_manager';
import type { AiTaskExtra, DiagLevel, DiagTargetType } from './internal/AiEngineTypes';
import { arrayMax, arrayMin, arraySum, buildBomCounts, buildBomReplacements, concatStringArrays, copyParamsFromRecord, filterSchematicComponents, getAllAiCapabilities, getTaskCapability, iterateSignalEntries, paramsMapToRecord, replacementsToMap } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/internal/AiEngineHelpers";
export class AiEngineImpl implements IAiEngine {
    private apiManager: IAiApiManager;
    private componentLibrary: IComponentLibrary | null = null;
    private enabledCapabilities: Set<AiCapability> = new Set(getAllAiCapabilities());
    private wiringEngine: AutoWiringEngine = new AutoWiringEngine();
    private constrainedWiring: ConstrainedWiringEngine = new ConstrainedWiringEngine();
    private pipeline: AiPipelineOrchestrator | null = null;
    private cancelled: boolean = false;
    private taskBindings: Map<AiTaskType, string> = new Map();
    private resultCache: AiResultCache = new AiResultCache();
    readonly teachingService: TeachingService = new TeachingService();
    constructor(o265: IAiApiManager, p265?: IComponentLibrary) {
        this.apiManager = o265;
        if (p265) {
            this.componentLibrary = p265;
            this.pipeline = new AiPipelineOrchestrator(o265, p265);
        }
    }
    setComponentLibrary(n265: IComponentLibrary): void {
        this.componentLibrary = n265;
        this.pipeline = new AiPipelineOrchestrator(this.apiManager, n265);
    }
    async runAiTask(i264: AiTaskType, j264: SchTopology, k264?: AiTaskExtra, l264?: ProgressCallback): Promise<AiTaskResult> {
        this.cancelled = false;
        const m264 = this.apiManager.checkGlobalAiQuota();
        if (!m264.success) {
            return {
                taskType: i264,
                success: false,
                errCode: m264.errCode ?? ErrCode.ERR_QUOTA_EXCEEDED,
                errMsg: m264.error ?? 'AI 配额不足',
                progress: makeProgress(0, 'quota_exceeded')
            };
        }
        l264?.(makeProgress(0, `Starting task ${i264}`));
        let n264: AiTaskResult = {
            taskType: i264,
            success: false, errCode: ErrCode.OK, errMsg: '',
            progress: makeProgress(0, 'init')
        };
        try {
            switch (i264) {
                case AiTaskType.TASK_AUTO_ROUTE_GLOBAL: {
                    const m265 = await this.aiAutoRouteGlobal(j264, l264);
                    n264.success = m265.success;
                    n264.errCode = m265.errCode;
                    if (m265.data) {
                        j264.wireList = m265.data.routeLines;
                    }
                    n264.topology = j264;
                    break;
                }
                case AiTaskType.TASK_AUTO_ROUTE_SELECT: {
                    const k265 = k264?.devUuids ?? [];
                    const l265 = await this.aiAutoRouteSelect(j264, k265, l264);
                    n264.success = l265.success;
                    n264.errCode = l265.errCode;
                    if (l265.data)
                        j264.wireList = l265.data.routeLines;
                    n264.topology = j264;
                    break;
                }
                case AiTaskType.TASK_ROUTE_OPTIMIZE: {
                    const j265 = await this.aiOptimizeExistRoute(j264);
                    n264.success = j265.success;
                    n264.errCode = j265.errCode;
                    if (j265.data)
                        j264.wireList = j265.data.routeLines;
                    n264.topology = j264;
                    break;
                }
                case AiTaskType.TASK_CIRCUIT_DIAG_STATIC: {
                    const i265 = await this.aiStaticDiagnose(j264);
                    n264.success = i265.success;
                    n264.errCode = i265.errCode;
                    n264.diagErrors = i265.data;
                    break;
                }
                case AiTaskType.TASK_CIRCUIT_DIAG_DYNAMIC: {
                    const g265 = k264?.waves ?? [];
                    const h265 = await this.aiDynamicDiagnose(j264, g265);
                    n264.success = h265.success;
                    n264.errCode = h265.errCode;
                    n264.diagErrors = h265.data;
                    break;
                }
                case AiTaskType.TASK_GEN_SCH_FULL: {
                    const e265 = k264?.prompt ?? '';
                    const f265 = await this.aiGenFullSchematic(e265, k264?.mcuFamily);
                    n264.success = f265.success;
                    n264.errCode = f265.errCode;
                    n264.topology = f265.data;
                    break;
                }
                case AiTaskType.TASK_GEN_SUB_CIRCUIT: {
                    const c265 = k264?.prompt ?? '';
                    const d265 = await this.aiGenSubCircuit(c265, j264);
                    n264.success = d265.success;
                    n264.errCode = d265.errCode;
                    n264.topology = d265.data;
                    break;
                }
                case AiTaskType.TASK_WAVE_ANALYZE: {
                    const a265 = k264?.waves ?? [];
                    const b265 = await this.aiAnalyzeWave(a265);
                    n264.success = b265.success;
                    n264.errCode = b265.errCode;
                    n264.analysisText = b265.data;
                    break;
                }
                case AiTaskType.TASK_COMPONENT_REC: {
                    const y264 = k264?.description ?? '';
                    const z264 = await this.recommendComponents(y264);
                    n264.success = z264.success;
                    n264.analysisText = z264.data?.join('\n');
                    break;
                }
                case AiTaskType.TASK_COMPONENT_REPLACE: {
                    const v264 = k264?.libDevId ?? '';
                    const w264 = k264?.requirement ?? '';
                    const x264 = await this.aiGetReplaceDevice(v264, w264);
                    n264.success = x264.success;
                    n264.analysisText = x264.data?.join('\n');
                    break;
                }
                case AiTaskType.TASK_BOM_OPTIMIZE: {
                    const u264 = await this.aiOptimizeBom(j264);
                    n264.success = u264.success;
                    n264.errCode = u264.errCode;
                    break;
                }
                case AiTaskType.TASK_DEVICE_SELECT: {
                    const s264 = k264?.prompt ?? '';
                    const t264 = await this.aiSelectDevices(s264, j264);
                    n264.success = t264.success;
                    n264.errCode = t264.errCode;
                    n264.analysisText = JSON.stringify(t264.data);
                    break;
                }
                case AiTaskType.TASK_LAYOUT_PLACE: {
                    const r264 = await this.aiPlaceDevices(j264, k264);
                    n264.success = r264.success;
                    n264.errCode = r264.errCode;
                    n264.topology = r264.data;
                    break;
                }
                case AiTaskType.TASK_FULL_PIPELINE: {
                    const p264 = k264?.prompt ?? '';
                    const q264 = await this.runFullPipeline(p264, j264, k264, l264);
                    n264.success = q264.success;
                    n264.errCode = q264.errCode;
                    n264.topology = q264.data?.topology;
                    n264.analysisText = q264.data ? `LLM:${q264.data.usedLlm} degraded:${q264.data.degradedMode}` : '';
                    break;
                }
                default:
                    n264.errCode = ErrCode.ERR_PARAM_INVALID;
                    n264.errMsg = 'Unknown task type';
            }
            if (this.cancelled) {
                n264.success = false;
                n264.errCode = ErrCode.ERR_ASYNC_CANCEL;
                n264.errMsg = 'Task cancelled';
            }
            l264?.(makeProgress(100, 'Task complete', true));
            n264.progress = makeProgress(100, 'done', true, n264.errCode, n264.errMsg);
        }
        catch (o264) {
            n264.success = false;
            n264.errCode = ErrCode.ERR_API_TIMEOUT;
            n264.errMsg = `${o264}`;
        }
        return n264;
    }
    cancelAiTask(): ApiResult<void> {
        this.cancelled = true;
        return ResultHelper.ok();
    }
    bindTaskAiConfig(f264: AiTaskType, g264: string): ApiResult<void> {
        this.taskBindings.set(f264, g264);
        const h264 = getTaskCapability(f264);
        if (h264)
            this.apiManager.bindCapability(h264, g264);
        return ResultHelper.ok();
    }
    clearAiCache(): void {
        this.resultCache.clear();
    }
    async aiAutoRouteGlobal(a264: SchTopology, b264?: ProgressCallback): Promise<ApiResult<RouteResult>> {
        const c264 = this.resultCache.getCachedRoute(a264);
        if (c264) {
            b264?.(makeProgress(100, '使用缓存布线结果', true));
            return ResultHelper.ok(c264);
        }
        b264?.(makeProgress(15, '序列化拓扑'));
        const d264 = await this.fetchRoutingConstraints(a264);
        b264?.(makeProgress(40, 'A* 约束布线'));
        let e264 = this.constrainedWiring.route(a264, d264);
        e264 = this.constrainedWiring.fixViolations(a264, e264);
        this.resultCache.cacheRoute(a264, e264);
        b264?.(makeProgress(100, 'Routing complete', true));
        return ResultHelper.ok(e264);
    }
    async aiAutoRouteSelect(u263: SchTopology, v263: string[], w263?: ProgressCallback): Promise<ApiResult<RouteResult>> {
        w263?.(makeProgress(20, 'Auto routing selection'));
        const x263 = TopologyAdapter.fromTopology(u263);
        const y263 = filterSchematicComponents(x263, v263);
        const z263 = this.wiringEngine.autoWire(y263);
        w263?.(makeProgress(100, 'Selection routing complete', true));
        return ResultHelper.ok(this.toRouteResult(z263));
    }
    async aiOptimizeExistRoute(r263: SchTopology): Promise<ApiResult<RouteResult>> {
        const s263 = await this.fetchRoutingConstraints(r263);
        let t263 = this.constrainedWiring.route(r263, s263);
        t263 = this.constrainedWiring.fixViolations(r263, t263);
        return ResultHelper.ok(t263);
    }
    async aiStaticDiagnose(j263: SchTopology): Promise<ApiResult<DiagError[]>> {
        const k263 = this.resultCache.getCachedDiag(j263);
        if (k263)
            return ResultHelper.ok(k263);
        const l263 = TopologyAdapter.fromTopology(j263);
        const m263 = FaultDiagnoser.diagnose(l263);
        const n263: DiagError[] = [];
        for (let o263 = 0; o263 < m263.length; o263++) {
            const p263 = m263[o263];
            const q263: DiagError = {
                level: this.toDiagLevel(p263.severity),
                targetType: this.toDiagTargetType(p263.componentId, p263.netId, p263.pinId),
                targetUuid: p263.componentId ?? p263.netId ?? p263.pinId ?? '',
                errorDesc: p263.message,
                repairSuggest: p263.fixSuggestion ?? '',
                devReference: p263.componentId ?? ''
            };
            n263.push(q263);
        }
        this.resultCache.cacheDiag(j263, n263);
        return ResultHelper.ok(n263);
    }
    async aiDynamicDiagnose(a263: SchTopology, b263: WaveData[]): Promise<ApiResult<DiagError[]>> {
        const c263 = await this.aiStaticDiagnose(a263);
        const d263 = c263.data ?? [];
        const e263 = DynamicErcEngine.analyze(b263, new Map());
        const f263 = AiDiagnosisReporter.analyze(b263, e263);
        for (let g263 = 0; g263 < f263.suggestions.length; g263++) {
            const h263 = f263.suggestions[g263];
            const i263: 'error' | 'warning' | 'critical' = f263.severity === 'error' ? 'error' :
                (f263.severity === 'warning' ? 'warning' : 'critical');
            d263.push({
                level: i263,
                targetType: 'net',
                targetUuid: a263.schUuid,
                errorDesc: h263, repairSuggest: h263,
                devReference: 'AI'
            });
        }
        return ResultHelper.ok(d263);
    }
    async aiGenFullSchematic(u262: string, v262?: string): Promise<ApiResult<SchTopology>> {
        const w262: AiTaskExtra = { mcuFamily: v262, prompt: u262 };
        const x262 = emptySchTopology();
        x262.schName = 'AI Generated';
        x262.bgColor = '#FFFFFF';
        const y262 = await this.runFullPipeline(u262, x262, w262);
        if (!y262.success || !y262.data?.topology) {
            const z262 = await this.generateCircuit(u262, v262);
            if (!z262.success || !z262.data)
                return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, z262.error);
            return ResultHelper.ok(TopologyAdapter.toTopology(z262.data));
        }
        return ResultHelper.ok(y262.data.topology);
    }
    async runFullPipeline(p262: string, q262: SchTopology, r262?: AiTaskExtra, s262?: ProgressCallback): Promise<ApiResult<AiPipelineResult>> {
        if (!this.pipeline) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Component library not configured');
        }
        const t262 = await this.pipeline.runFullPipeline({
            prompt: p262,
            scene: r262?.scene ?? 'text_gen',
            partialTopo: q262.deviceList.length > 0 ? q262 : undefined,
            lockedDeviceUuids: r262?.lockedUuids ?? [],
            mcuFamily: r262?.mcuFamily,
            skipLlm: r262?.skipLlm,
            routingWeights: r262?.routingWeights
        }, s262);
        return ResultHelper.ok(t262);
    }
    async aiSelectDevices(i262: string, j262?: SchTopology): Promise<ApiResult<DeviceSelectResult>> {
        if (!this.componentLibrary)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'No library');
        const k262 = new DeviceSelectEngine(this.componentLibrary);
        const l262 = PromptLoader.load('device_select');
        const m262 = PromptLoader.render(l262, [
            { key: 'user_prompt', value: i262 },
            { key: 'scene', value: 'partial_assist' },
            { key: 'partial_topo', value: j262 ? JSON.stringify(j262.deviceList) : '' }
        ]);
        const n262 = await this.apiManager.chat(m262, { capability: AiCapability.COMPONENT_RECOMMEND });
        let o262: DeviceSelectLlmOutput;
        if (n262.success && n262.data) {
            o262 = PromptLoader.extractJson<DeviceSelectLlmOutput>(n262.data) ??
                DeviceSelectEngine.buildLocalLlmOutput(i262);
        }
        else {
            o262 = DeviceSelectEngine.buildLocalLlmOutput(i262);
        }
        return ResultHelper.ok(k262.matchFromLlmOutput(o262, i262));
    }
    async aiPlaceDevices(c262: SchTopology, d262?: AiTaskExtra): Promise<ApiResult<SchTopology>> {
        if (!this.componentLibrary)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'No library');
        const e262 = d262?.prompt ?? '';
        const f262 = await this.aiSelectDevices(e262, c262);
        if (!f262.success || !f262.data || f262.data.devices.length === 0) {
            return ResultHelper.fail(ErrCode.ERR_DEVICE_NOT_EXIST);
        }
        const g262 = PlacementOptimizer.defaultConstraints(f262.data.devices);
        const h262 = await new PlacementOptimizer().optimizeAsync(f262.data.devices, g262, d262?.lockedUuids ?? [], c262);
        return ResultHelper.ok(h262.topology);
    }
    private async fetchRoutingConstraints(w261: SchTopology): Promise<RoutingLlmOutput> {
        const x261 = PromptLoader.load('route');
        const y261 = PromptLoader.render(x261, [
            { key: 'topology_summary', value: `${w261.deviceList.length} devs` },
            { key: 'net_list', value: w261.netList.map(b262 => b262.netName).join(',') }
        ]);
        const z261 = await this.apiManager.chat(y261, { capability: AiCapability.AUTO_WIRING });
        if (z261.success && z261.data) {
            const a262 = PromptLoader.extractJson<RoutingLlmOutput>(z261.data);
            if (a262?.netPriority)
                return a262;
        }
        return ConstrainedWiringEngine.defaultConstraints(w261);
    }
    async aiGenSubCircuit(r261: string, s261: SchTopology): Promise<ApiResult<SchTopology>> {
        const t261 = CircuitTemplates.generate(r261);
        const u261 = this.wiringEngine.autoWire(t261);
        const v261 = TopologyAdapter.toTopology(u261);
        v261.schName = `Sub: ${r261.substring(0, 30)}`;
        v261.layerDepth = s261.layerDepth + 1;
        return ResultHelper.ok(v261);
    }
    async aiAnalyzeWave(f261: WaveData[]): Promise<ApiResult<string>> {
        const g261: string[] = [];
        for (let m261 = 0; m261 < f261.length; m261++) {
            const n261 = f261[m261];
            if (n261.voltageAxis.length < 2)
                continue;
            const o261 = arrayMin(n261.voltageAxis);
            const p261 = arrayMax(n261.voltageAxis);
            const q261 = arraySum(n261.voltageAxis) / n261.voltageAxis.length;
            g261.push(`${n261.probeName}: min=${o261.toFixed(3)}V, max=${p261.toFixed(3)}V, avg=${q261.toFixed(3)}V`);
        }
        const h261 = g261.length > 0 ? g261.join('\n') : 'No wave data';
        const i261: SimulationResult = {
            time: [],
            signals: new Map<string, number[]>(),
            digitalStates: new Map<string, LogicState[]>()
        };
        for (let k261 = 0; k261 < f261.length; k261++) {
            const l261 = f261[k261];
            i261.time = l261.timeAxis;
            i261.signals.set(l261.probeName, l261.voltageAxis);
        }
        const j261 = await this.analyzeWaveform(i261);
        return ResultHelper.ok(j261.data ?? h261);
    }
    async aiRecommendParam(a261: SchTopology, b261: string): Promise<ApiResult<Record<string, string>>> {
        const c261 = a261.deviceList.find(e261 => e261.instUuid === b261);
        if (!c261)
            return ResultHelper.fail(ErrCode.ERR_DEVICE_NOT_EXIST);
        const d261 = copyParamsFromRecord(c261.params);
        if (c261.libDevId.startsWith('R_'))
            d261.set('value', c261.params.get('value') ?? '10k');
        if (c261.libDevId.startsWith('C_'))
            d261.set('value', c261.params.get('value') ?? '100nF');
        return ResultHelper.ok(paramsMapToRecord(d261));
    }
    async aiGetReplaceDevice(x260: string, y260: string): Promise<ApiResult<string[]>> {
        const z260 = await this.recommendComponents(`${x260} replacement: ${y260}`);
        if (!z260.success)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, z260.error);
        return ResultHelper.ok(z260.data ?? []);
    }
    async aiOptimizeBom(m260: SchTopology): Promise<ApiResult<BomOptResult>> {
        const n260: string[] = [];
        for (let w260 = 0; w260 < m260.deviceList.length; w260++) {
            n260.push(m260.deviceList[w260].libDevId);
        }
        const o260 = buildBomCounts(n260);
        const p260 = buildBomReplacements(o260);
        const q260 = BomPricingDatabase.estimateBomCost(n260);
        const r260: string[] = [];
        for (let t260 = 0; t260 < p260.length; t260++) {
            const u260 = p260[t260];
            const v260 = BomPricingDatabase.getDomesticReplacement(u260.original);
            if (v260)
                r260.push(`${u260.original} → 国产替代 ${v260}`);
            else
                r260.push(`Consider domestic replacement for ${u260.original}`);
        }
        const s260: BomOptResult = {
            originalCost: q260.original,
            optimizedCost: q260.optimized,
            replacements: replacementsToMap(p260),
            suggestions: r260
        };
        return ResultHelper.ok(s260);
    }
    async autoWire(j260: SchematicDocument): Promise<Result<SchematicDocument>> {
        if (!this.isEnabled(AiCapability.AUTO_WIRING)) {
            return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: 'Auto wiring is disabled' };
        }
        const k260 = this.wiringEngine.autoWire(j260);
        const l260 = await this.request({
            capability: AiCapability.AUTO_WIRING,
            prompt: `Optimize wiring for MCU circuit with ${k260.components.length} components.`,
            schematic: k260
        });
        if (l260.success && l260.content) {
            k260.metadata.description += `\nAI: ${l260.content.substring(0, 200)}`;
        }
        return { success: true, errCode: ErrCode.OK, data: k260 };
    }
    async diagnoseFaults(g260: SchematicDocument): Promise<Result<ErcViolation[]>> {
        const h260 = FaultDiagnoser.diagnose(g260);
        const i260 = await this.request({
            capability: AiCapability.FAULT_DIAGNOSIS,
            prompt: `Diagnose circuit: ${g260.components.length} components`,
            schematic: g260
        });
        if (i260.success && i260.content) {
            h260.push({
                id: `ai_diag_${Date.now()}`,
                severity: ErcSeverity.INFO,
                ruleType: ErcRuleType.PARAM_MISMATCH,
                message: `AI诊断: ${i260.content.substring(0, 300)}`,
                fixSuggestion: i260.content
            });
        }
        return { success: true, errCode: ErrCode.OK, data: h260 };
    }
    async recommendComponents(b260: string): Promise<Result<string[]>> {
        const c260 = this.localRecommend(b260);
        const d260 = await this.request({
            capability: AiCapability.COMPONENT_RECOMMEND,
            prompt: `Recommend electronic components for: ${b260}`
        });
        if (d260.success && d260.content) {
            const e260 = d260.content.split('\n').filter(f260 => f260.trim().length > 0);
            return { success: true, errCode: ErrCode.OK, data: concatStringArrays(c260, e260) };
        }
        return { success: true, errCode: ErrCode.OK, data: c260 };
    }
    async generateCircuit(x259: string, y259?: string): Promise<Result<SchematicDocument>> {
        const z259 = CircuitTemplates.generate(x259, y259);
        const a260 = this.wiringEngine.autoWire(z259);
        return { success: true, errCode: ErrCode.OK, data: a260 };
    }
    async analyzeWaveform(u259: SimulationResult): Promise<Result<string>> {
        const v259 = this.localWaveformAnalysis(u259);
        const w259 = await this.request({
            capability: AiCapability.WAVEFORM_ANALYSIS,
            prompt: `Analyze simulation: ${u259.time.length} points`
        });
        if (w259.success) {
            return { success: true, errCode: ErrCode.OK, data: `${v259}\n\nAI分析:\n${w259.content}` };
        }
        return { success: true, errCode: ErrCode.OK, data: v259 };
    }
    async request(q259: AiRequest): Promise<AiResponse> {
        const r259 = Date.now();
        const s259 = await this.apiManager.chat(q259.prompt, {
            capability: q259.capability,
            context: q259.context
        });
        const t259: AiResponse = {
            success: s259.success,
            content: s259.data ?? '',
            provider: s259.success ? 'ai_api_manager' : '',
            tokensUsed: 0,
            latencyMs: Date.now() - r259,
            error: s259.error
        };
        EventBus.getInstance().publish({
            event: ModuleEvent.AI_REQUEST_COMPLETED,
            source: 'ai_engine',
            timestamp: Date.now(),
            data: t259
        });
        return t259;
    }
    setEnabled(o259: AiCapability, p259: boolean): void {
        if (p259)
            this.enabledCapabilities.add(o259);
        else
            this.enabledCapabilities.delete(o259);
    }
    isEnabled(n259: AiCapability): boolean {
        return this.enabledCapabilities.has(n259);
    }
    private toRouteResult(g259: SchematicDocument): RouteResult {
        const h259: RouteLine[] = [];
        for (let l259 = 0; l259 < g259.wires.length; l259++) {
            const m259 = g259.wires[l259];
            h259.push(makeRouteLine(m259.netId, m259.points, false));
        }
        let i259 = 0;
        for (let k259 = 0; k259 < g259.wires.length; k259++) {
            i259 += g259.wires[k259].points.length * 10;
        }
        const j259: RouteResult = {
            routeLines: h259,
            crossCount: 0,
            totalLineLength: i259,
            isolateAnalogDigital: true,
            xtalShortPath: true,
            diffLineEqualLength: false
        };
        return j259;
    }
    private toDiagLevel(f259: ErcSeverity): DiagLevel {
        if (f259 === ErcSeverity.ERROR) {
            return 'error';
        }
        if (f259 === ErcSeverity.WARNING) {
            return 'warning';
        }
        return 'critical';
    }
    private toDiagTargetType(c259?: string, d259?: string, e259?: string): DiagTargetType {
        if (c259) {
            return 'device';
        }
        if (d259) {
            return 'net';
        }
        return 'pin';
    }
    private localRecommend(z258: string): string[] {
        const a259 = z258.toLowerCase();
        const b259: string[] = [];
        if (a259.includes('stm32') || a259.includes('最小系统')) {
            b259.push('STM32F103C8', 'XTAL_8M', 'C_100nF', 'C_10uF', 'R_10k');
        }
        if (a259.includes('51') || a259.includes('stc')) {
            b259.push('AT89C51', 'XTAL_11M', 'C_100nF', 'R_10k');
        }
        if (a259.includes('led'))
            b259.push('LED_RED', 'R_330');
        if (a259.includes('lcd'))
            b259.push('LCD1602', 'R_10k', 'C_100nF');
        return b259;
    }
    private localWaveformAnalysis(s258: SimulationResult): string {
        const t258: string[] = [];
        iterateSignalEntries(s258.signals, (u258: string, v258: number[]) => {
            if (v258.length < 2)
                return;
            const w258 = arrayMin(v258);
            const x258 = arrayMax(v258);
            const y258 = arraySum(v258) / v258.length;
            t258.push(`${u258}: min=${w258.toFixed(3)}V, max=${x258.toFixed(3)}V, avg=${y258.toFixed(3)}V`);
            if (x258 - w258 < 0.01)
                t258.push(`  ⚠ ${u258} 信号幅度过小`);
            if (x258 > 5.5)
                t258.push(`  ⚠ ${u258} 电压超标`);
        });
        return t258.length > 0 ? t258.join('\n') : '无波形数据可分析';
    }
    async runValidationSuite(): Promise<string> {
        if (!this.pipeline || !this.componentLibrary) {
            return '验证跳过：器件库未初始化';
        }
        const n258 = new AiPipelineValidator(this.componentLibrary, this.pipeline);
        const o258 = await n258.validateMinSystemLed();
        const p258 = n258.validateHallucinationChip();
        const q258 = await n258.validateApiFailureFallback();
        const r258: string[] = [];
        r258.push(`[LED最小系统] ${o258.passed ? 'PASS' : 'FAIL'}: ${o258.checks.join('; ')}`);
        if (o258.failures.length > 0)
            r258.push(`  失败: ${o258.failures.join('; ')}`);
        r258.push(`[幻觉拦截] ${p258.success ? 'PASS' : 'FAIL'}`);
        r258.push(`[API降级] ${q258.passed ? 'PASS' : 'FAIL'}: ${q258.checks.join('; ')}`);
        return r258.join('\n');
    }
}
