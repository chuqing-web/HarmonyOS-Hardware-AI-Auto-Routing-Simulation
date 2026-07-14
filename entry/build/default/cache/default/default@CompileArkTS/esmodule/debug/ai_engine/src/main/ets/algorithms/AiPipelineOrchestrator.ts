import type { IAiApiManager } from 'ai_api_manager';
import type { IComponentLibrary } from 'component_library';
import { AiCapability, makeProgress, IdUtil, ErcSeverity, TopologyAdapter, makeDeviceInst, stringMap1, EventBus, ModuleEvent } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchTopology, AiPipelineResult, DeviceSelectLlmOutput, LayoutLlmOutput, RoutingLlmOutput, ProgressCallback, DiagError, MatchedDevice, RoutingWeightPrefs, ErcError, ModuleEventPayload } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { PromptLoader } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/prompts/PromptLoader";
import { DeviceSelectEngine } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/DeviceSelectEngine";
import { PlacementOptimizer } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/PlacementOptimizer";
import { ConstrainedWiringEngine } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/ConstrainedWiringEngine";
import { FaultDiagnoser } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/FaultDiagnoser";
export interface PipelineOptions {
    prompt: string;
    scene?: 'text_gen' | 'partial_assist';
    partialTopo?: SchTopology;
    lockedDeviceUuids?: string[];
    mcuFamily?: string;
    skipLlm?: boolean;
    routingWeights?: RoutingWeightPrefs;
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
interface DegradedEventData {
    message: string;
}
const CACHE_TTL_MS = 5 * 60 * 1000; // 5分钟TTL (3.1.4)
const LLM_MAX_RETRIES = 2; // 3.1.1 指数退避重试次数
const LLM_BASE_BACKOFF_MS = 1000; // 初始退避1s
const QUALITY_MIN_FILL_RATE = 0.5; // 3.1.3 最低字段填充率
export class AiPipelineOrchestrator {
    private apiManager: IAiApiManager;
    private selectEngine: DeviceSelectEngine;
    private placementOptimizer: PlacementOptimizer = new PlacementOptimizer();
    private wiringEngine: ConstrainedWiringEngine = new ConstrainedWiringEngine();
    private constraintCache: Map<string, CacheEntry> = new Map();
    constructor(apiManager: IAiApiManager, library: IComponentLibrary) {
        this.apiManager = apiManager;
        this.selectEngine = new DeviceSelectEngine(library);
    }
    async runFullPipeline(opts: PipelineOptions, onProgress?: ProgressCallback): Promise<AiPipelineResult> {
        let usedLlm = false;
        let degradedMode = false;
        onProgress?.(makeProgress(5, '解析器件需求'));
        // 3.1.5 并行化: deviceSelect + layout LLM 同时发起
        const selectPromise = this.fetchDeviceSelectLlm(opts);
        // 先获取 select 结果(需要用于构造 layout prompt), 然后并行 layout + routing
        const selectLlm = await selectPromise;
        if (selectLlm.fromLlm)
            usedLlm = true;
        else {
            degradedMode = true;
            this.notifyDegraded('器件选型');
        }
        if (selectLlm.output.oodFlags && selectLlm.output.oodFlags.length > 0) {
            const emptyAlts = new Map<string, string[]>();
            return {
                selectResult: { devices: [], alternatives: emptyAlts, oodDetected: true },
                usedLlm: usedLlm, degradedMode: degradedMode, topology: opts.partialTopo
            };
        }
        onProgress?.(makeProgress(20, '本地器件库匹配'));
        const selectResult = this.selectEngine.matchFromLlmOutput(selectLlm.output, opts.prompt);
        if (selectResult.devices.length === 0) {
            return { selectResult, usedLlm, degradedMode };
        }
        onProgress?.(makeProgress(35, '获取布局约束'));
        const layoutLlm = await this.fetchLayoutLlm(selectResult.devices, selectLlm.output.circuitConstraint, opts);
        if (layoutLlm.fromLlm)
            usedLlm = true;
        else {
            degradedMode = true;
            this.notifyDegraded('布局约束');
        }
        onProgress?.(makeProgress(50, '遗传算法布局优化 (Worker)'));
        const placement = await this.placementOptimizer.optimizeAsync(selectResult.devices, layoutLlm.output, opts.lockedDeviceUuids ?? [], opts.partialTopo);
        onProgress?.(makeProgress(65, '初始化电源网络'));
        const topoWithNets = this.ensurePowerNets(placement.topology);
        onProgress?.(makeProgress(75, '获取布线约束'));
        const routeLlm = await this.fetchRoutingLlm(topoWithNets, opts);
        if (routeLlm.fromLlm)
            usedLlm = true;
        else {
            degradedMode = true;
            this.notifyDegraded('布线约束');
        }
        onProgress?.(makeProgress(85, 'A* 约束布线'));
        let routeResult = this.wiringEngine.route(topoWithNets, routeLlm.output, opts.routingWeights);
        routeResult = this.wiringEngine.fixViolations(topoWithNets, routeResult);
        topoWithNets.wireList = routeResult.routeLines;
        onProgress?.(makeProgress(92, 'ERC 静态校验'));
        const doc = TopologyAdapter.fromTopology(topoWithNets);
        const violations = FaultDiagnoser.diagnose(doc);
        const ercErrors: ErcError[] = [];
        for (let vi = 0; vi < violations.length; vi++) {
            const v = violations[vi];
            let severity: 'error' | 'warning' | 'info' = 'info';
            if (v.severity === ErcSeverity.ERROR)
                severity = 'error';
            else if (v.severity === ErcSeverity.WARNING)
                severity = 'warning';
            ercErrors.push({
                errType: v.ruleType, targetUuid: v.componentId ?? v.netId ?? '',
                desc: v.message, suggest: v.fixSuggestion ?? '', severity: severity
            });
        }
        topoWithNets.ercErrorList = ercErrors;
        onProgress?.(makeProgress(100, '闭环完成', true));
        return {
            selectResult, placementResult: placement, routeResult, ercErrors,
            topology: topoWithNets, usedLlm, degradedMode
        };
    }
    // ---- 3.1.2 降级通知 ----
    private notifyDegraded(stage: string): void {
        const eventData: DegradedEventData = {
            message: `AI服务不可用 [${stage}]，已降级使用本地算法`
        };
        const payload: ModuleEventPayload = {
            event: ModuleEvent.SIMULATION_STOPPED,
            source: 'ai_pipeline',
            timestamp: Date.now(),
            data: eventData
        };
        EventBus.getInstance().publish(payload);
    }
    // ---- 3.1.4 缓存访问 (带TTL) ----
    private cacheGet<T extends object>(key: string): T | null {
        const entry = this.constraintCache.get(key);
        if (!entry)
            return null;
        if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
            this.constraintCache.delete(key);
            return null;
        }
        return entry.value as T;
    }
    private cacheSet(key: string, value: object): void {
        const entry: CacheEntry = { value: value, timestamp: Date.now() };
        this.constraintCache.set(key, entry);
    }
    // ---- 3.1.1 LLM 调用重试 (指数退避) ----
    private async chatWithRetry(prompt: string, capability: string): Promise<ChatResult> {
        let lastError = '';
        for (let attempt = 0; attempt <= LLM_MAX_RETRIES; attempt++) {
            const result = await this.apiManager.chat(prompt, { capability: capability as AiCapability });
            if (result.success && result.data)
                return result;
            // 区分可重试/不可重试
            if (result.errCode && result.errCode >= 400 && result.errCode < 500) {
                return result; // 4xx 配额/认证错误, 不重试
            }
            lastError = result.error ?? 'unknown';
            if (attempt < LLM_MAX_RETRIES) {
                const delay = LLM_BASE_BACKOFF_MS * Math.pow(2, attempt);
                await new Promise<void>(r => setTimeout(r, delay));
            }
        }
        const failResult: ChatResult = { success: false, error: lastError };
        return failResult;
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
            const routeLlm = ConstrainedWiringEngine.defaultConstraints(topo);
            const route = this.wiringEngine.route(topo, routeLlm);
            topo.wireList = route.routeLines;
        }
        return { topo, fixes, diag };
    }
    // ---- 3.1.3 LLM响应质量评分 ----
    private scoreLlmJson<T extends object>(parsed: T | null, expectedFields: string[]): number {
        if (!parsed)
            return 0;
        let filled = 0;
        for (const f of expectedFields) {
            const val = parsed[f as keyof T];
            if (val !== undefined && val !== null && val !== '')
                filled++;
        }
        return expectedFields.length > 0 ? filled / expectedFields.length : 0;
    }
    private async fetchDeviceSelectLlm(opts: PipelineOptions): Promise<LlmFetchResult<DeviceSelectLlmOutput>> {
        const cacheKey = `select:${opts.prompt}`;
        const cached = this.cacheGet<DeviceSelectLlmOutput>(cacheKey);
        if (cached)
            return { output: cached, fromLlm: true };
        if (opts.skipLlm) {
            return { output: DeviceSelectEngine.buildLocalLlmOutput(opts.prompt), fromLlm: false };
        }
        const tpl = PromptLoader.load('device_select');
        const prompt = PromptLoader.render(tpl, [
            { key: 'user_prompt', value: opts.prompt },
            { key: 'scene', value: opts.scene ?? 'text_gen' },
            { key: 'partial_topo', value: opts.partialTopo ? JSON.stringify(opts.partialTopo.deviceList.slice(0, 5)) : '' }
        ]);
        // 3.1.1 带重试的LLM调用
        const api = await this.chatWithRetry(prompt, AiCapability.COMPONENT_RECOMMEND);
        if (api.success && api.data) {
            const parsed = PromptLoader.extractJson<DeviceSelectLlmOutput>(api.data);
            const score = this.scoreLlmJson(parsed, ['deviceRequireList', 'circuitConstraint', 'mainFunction']);
            if (parsed && score >= QUALITY_MIN_FILL_RATE) {
                this.cacheSet(cacheKey, parsed);
                return { output: parsed, fromLlm: true };
            }
        }
        return { output: DeviceSelectEngine.buildLocalLlmOutput(opts.prompt), fromLlm: false };
    }
    private async fetchLayoutLlm(devices: MatchedDevice[], constraint: string, opts: PipelineOptions): Promise<LlmFetchResult<LayoutLlmOutput>> {
        const defaultOut = PlacementOptimizer.defaultConstraints(devices);
        if (opts.skipLlm)
            return { output: defaultOut, fromLlm: false };
        const tpl = PromptLoader.load('layout');
        const prompt = PromptLoader.render(tpl, [
            { key: 'device_list', value: devices.map(d => `${d.name}(${d.libDevId})`).join(', ') },
            { key: 'circuit_constraint', value: constraint },
            { key: 'mcu_family', value: opts.mcuFamily ?? 'auto' }
        ]);
        const api = await this.chatWithRetry(prompt, AiCapability.AUTO_WIRING);
        if (api.success && api.data) {
            const parsed = PromptLoader.extractJson<LayoutLlmOutput>(api.data);
            const score = this.scoreLlmJson(parsed, ['constraintRules', 'placementHints', 'moduleGroups']);
            if (parsed && score >= QUALITY_MIN_FILL_RATE)
                return { output: parsed, fromLlm: true };
        }
        return { output: defaultOut, fromLlm: false };
    }
    private async fetchRoutingLlm(topo: SchTopology, opts: PipelineOptions): Promise<LlmFetchResult<RoutingLlmOutput>> {
        const cacheKey = `route:${topo.deviceList.length}:${topo.netList.length}`;
        const cached = this.cacheGet<RoutingLlmOutput>(cacheKey);
        if (cached)
            return { output: cached, fromLlm: true };
        const defaultOut = ConstrainedWiringEngine.defaultConstraints(topo);
        if (opts.skipLlm)
            return { output: defaultOut, fromLlm: false };
        const tpl = PromptLoader.load('route');
        const prompt = PromptLoader.render(tpl, [
            { key: 'topology_summary', value: `${topo.deviceList.length} devices, ${topo.netList.length} nets` },
            { key: 'net_list', value: topo.netList.map(n => n.netName).join(', ') }
        ]);
        const api = await this.chatWithRetry(prompt, AiCapability.AUTO_WIRING);
        if (api.success && api.data) {
            const parsed = PromptLoader.extractJson<RoutingLlmOutput>(api.data);
            const score = this.scoreLlmJson(parsed, ['netPriority', 'traceWidths', 'viaStrategy']);
            if (parsed && score >= QUALITY_MIN_FILL_RATE) {
                this.cacheSet(cacheKey, parsed);
                return { output: parsed, fromLlm: true };
            }
        }
        return { output: defaultOut, fromLlm: false };
    }
    private ensurePowerNets(topo: SchTopology): SchTopology {
        const hasVcc = topo.netList.some(n => n.netName === 'VCC' || n.isPower);
        const hasGnd = topo.netList.some(n => n.netName === 'GND');
        if (!hasVcc) {
            topo.netList.push({
                netUuid: IdUtil.generate('net'), netName: 'VCC', displayName: 'VCC',
                nodeList: [], isPower: true, isAnalog: false, isBusMember: false,
                busParentUuid: '', defaultVoltage: 3.3, ercWarning: false, connectedProbeIds: []
            });
        }
        if (!hasGnd) {
            topo.netList.push({
                netUuid: IdUtil.generate('net'), netName: 'GND', displayName: 'GND',
                nodeList: [], isPower: true, isAnalog: false, isBusMember: false,
                busParentUuid: '', defaultVoltage: 0, ercWarning: false, connectedProbeIds: []
            });
        }
        return topo;
    }
}
