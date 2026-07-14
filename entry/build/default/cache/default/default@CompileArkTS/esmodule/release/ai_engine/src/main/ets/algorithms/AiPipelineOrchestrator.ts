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
const CACHE_TTL_MS = 5 * 60 * 1000;
const LLM_MAX_RETRIES = 2;
const LLM_BASE_BACKOFF_MS = 1000;
const QUALITY_MIN_FILL_RATE = 0.5;
export class AiPipelineOrchestrator {
    private apiManager: IAiApiManager;
    private selectEngine: DeviceSelectEngine;
    private placementOptimizer: PlacementOptimizer = new PlacementOptimizer();
    private wiringEngine: ConstrainedWiringEngine = new ConstrainedWiringEngine();
    private constraintCache: Map<string, CacheEntry> = new Map();
    constructor(g269: IAiApiManager, h269: IComponentLibrary) {
        this.apiManager = g269;
        this.selectEngine = new DeviceSelectEngine(h269);
    }
    async runFullPipeline(n268: PipelineOptions, o268?: ProgressCallback): Promise<AiPipelineResult> {
        let p268 = false;
        let q268 = false;
        o268?.(makeProgress(5, '解析器件需求'));
        const r268 = this.fetchDeviceSelectLlm(n268);
        const s268 = await r268;
        if (s268.fromLlm)
            p268 = true;
        else {
            q268 = true;
            this.notifyDegraded('器件选型');
        }
        if (s268.output.oodFlags && s268.output.oodFlags.length > 0) {
            const f269 = new Map<string, string[]>();
            return {
                selectResult: { devices: [], alternatives: f269, oodDetected: true },
                usedLlm: p268, degradedMode: q268, topology: n268.partialTopo
            };
        }
        o268?.(makeProgress(20, '本地器件库匹配'));
        const t268 = this.selectEngine.matchFromLlmOutput(s268.output, n268.prompt);
        if (t268.devices.length === 0) {
            return { selectResult: t268, usedLlm: p268, degradedMode: q268 };
        }
        o268?.(makeProgress(35, '获取布局约束'));
        const u268 = await this.fetchLayoutLlm(t268.devices, s268.output.circuitConstraint, n268);
        if (u268.fromLlm)
            p268 = true;
        else {
            q268 = true;
            this.notifyDegraded('布局约束');
        }
        o268?.(makeProgress(50, '遗传算法布局优化 (Worker)'));
        const v268 = await this.placementOptimizer.optimizeAsync(t268.devices, u268.output, n268.lockedDeviceUuids ?? [], n268.partialTopo);
        o268?.(makeProgress(65, '初始化电源网络'));
        const w268 = this.ensurePowerNets(v268.topology);
        o268?.(makeProgress(75, '获取布线约束'));
        const x268 = await this.fetchRoutingLlm(w268, n268);
        if (x268.fromLlm)
            p268 = true;
        else {
            q268 = true;
            this.notifyDegraded('布线约束');
        }
        o268?.(makeProgress(85, 'A* 约束布线'));
        let y268 = this.wiringEngine.route(w268, x268.output, n268.routingWeights);
        y268 = this.wiringEngine.fixViolations(w268, y268);
        w268.wireList = y268.routeLines;
        o268?.(makeProgress(92, 'ERC 静态校验'));
        const z268 = TopologyAdapter.fromTopology(w268);
        const a269 = FaultDiagnoser.diagnose(z268);
        const b269: ErcError[] = [];
        for (let c269 = 0; c269 < a269.length; c269++) {
            const d269 = a269[c269];
            let e269: 'error' | 'warning' | 'info' = 'info';
            if (d269.severity === ErcSeverity.ERROR)
                e269 = 'error';
            else if (d269.severity === ErcSeverity.WARNING)
                e269 = 'warning';
            b269.push({
                errType: d269.ruleType, targetUuid: d269.componentId ?? d269.netId ?? '',
                desc: d269.message, suggest: d269.fixSuggestion ?? '', severity: e269
            });
        }
        w268.ercErrorList = b269;
        o268?.(makeProgress(100, '闭环完成', true));
        return {
            selectResult: t268,
            placementResult: v268,
            routeResult: y268,
            ercErrors: b269,
            topology: w268,
            usedLlm: p268,
            degradedMode: q268
        };
    }
    private notifyDegraded(k268: string): void {
        const l268: DegradedEventData = {
            message: `AI服务不可用 [${k268}]，已降级使用本地算法`
        };
        const m268: ModuleEventPayload = {
            event: ModuleEvent.SIMULATION_STOPPED,
            source: 'ai_pipeline',
            timestamp: Date.now(),
            data: l268
        };
        EventBus.getInstance().publish(m268);
    }
    private cacheGet<h268 extends object>(i268: string): h268 | null {
        const j268 = this.constraintCache.get(i268);
        if (!j268)
            return null;
        if (Date.now() - j268.timestamp > CACHE_TTL_MS) {
            this.constraintCache.delete(i268);
            return null;
        }
        return j268.value as h268;
    }
    private cacheSet(e268: string, f268: object): void {
        const g268: CacheEntry = { value: f268, timestamp: Date.now() };
        this.constraintCache.set(e268, g268);
    }
    private async chatWithRetry(w267: string, x267: string): Promise<ChatResult> {
        let y267 = '';
        for (let a268 = 0; a268 <= LLM_MAX_RETRIES; a268++) {
            const b268 = await this.apiManager.chat(w267, { capability: x267 as AiCapability });
            if (b268.success && b268.data)
                return b268;
            if (b268.errCode && b268.errCode >= 400 && b268.errCode < 500) {
                return b268;
            }
            y267 = b268.error ?? 'unknown';
            if (a268 < LLM_MAX_RETRIES) {
                const c268 = LLM_BASE_BACKOFF_MS * Math.pow(2, a268);
                await new Promise<void>(d268 => setTimeout(d268, c268));
            }
        }
        const z267: ChatResult = { success: false, error: y267 };
        return z267;
    }
    async aiDiagnoseAndFix(l267: SchTopology): Promise<AiDiagnoseFixResult> {
        const m267 = TopologyAdapter.fromTopology(l267);
        const n267 = FaultDiagnoser.diagnose(m267);
        let o267 = 0;
        const p267: DiagError[] = [];
        for (let s267 = 0; s267 < n267.length; s267++) {
            const t267 = n267[s267];
            p267.push({
                level: t267.severity === ErcSeverity.ERROR ? 'error' : 'warning',
                targetType: t267.componentId ? 'device' : 'net',
                targetUuid: t267.componentId ?? t267.netId ?? '',
                errorDesc: t267.message,
                repairSuggest: t267.fixSuggestion ?? '',
                devReference: t267.componentId ?? ''
            });
            if (t267.fixSuggestion?.includes('pull') || t267.message.includes('上拉')) {
                const u267 = l267.deviceList.some(v267 => v267.libDevId.startsWith('R_'));
                if (!u267) {
                    l267.deviceList.push(makeDeviceInst(IdUtil.generate('inst'), 'R_10k', `R${l267.deviceList.length + 1}`, 400, 300, 0, stringMap1('value', '10k')));
                    o267++;
                }
            }
        }
        if (o267 > 0) {
            const q267 = ConstrainedWiringEngine.defaultConstraints(l267);
            const r267 = this.wiringEngine.route(l267, q267);
            l267.wireList = r267.routeLines;
        }
        return { topo: l267, fixes: o267, diag: p267 };
    }
    private scoreLlmJson<f267 extends object>(g267: f267 | null, h267: string[]): number {
        if (!g267)
            return 0;
        let i267 = 0;
        for (const j267 of h267) {
            const k267 = g267[j267 as keyof f267];
            if (k267 !== undefined && k267 !== null && k267 !== '')
                i267++;
        }
        return h267.length > 0 ? i267 / h267.length : 0;
    }
    private async fetchDeviceSelectLlm(x266: PipelineOptions): Promise<LlmFetchResult<DeviceSelectLlmOutput>> {
        const y266 = `select:${x266.prompt}`;
        const z266 = this.cacheGet<DeviceSelectLlmOutput>(y266);
        if (z266)
            return { output: z266, fromLlm: true };
        if (x266.skipLlm) {
            return { output: DeviceSelectEngine.buildLocalLlmOutput(x266.prompt), fromLlm: false };
        }
        const a267 = PromptLoader.load('device_select');
        const b267 = PromptLoader.render(a267, [
            { key: 'user_prompt', value: x266.prompt },
            { key: 'scene', value: x266.scene ?? 'text_gen' },
            { key: 'partial_topo', value: x266.partialTopo ? JSON.stringify(x266.partialTopo.deviceList.slice(0, 5)) : '' }
        ]);
        const c267 = await this.chatWithRetry(b267, AiCapability.COMPONENT_RECOMMEND);
        if (c267.success && c267.data) {
            const d267 = PromptLoader.extractJson<DeviceSelectLlmOutput>(c267.data);
            const e267 = this.scoreLlmJson(d267, ['deviceRequireList', 'circuitConstraint', 'mainFunction']);
            if (d267 && e267 >= QUALITY_MIN_FILL_RATE) {
                this.cacheSet(y266, d267);
                return { output: d267, fromLlm: true };
            }
        }
        return { output: DeviceSelectEngine.buildLocalLlmOutput(x266.prompt), fromLlm: false };
    }
    private async fetchLayoutLlm(n266: MatchedDevice[], o266: string, p266: PipelineOptions): Promise<LlmFetchResult<LayoutLlmOutput>> {
        const q266 = PlacementOptimizer.defaultConstraints(n266);
        if (p266.skipLlm)
            return { output: q266, fromLlm: false };
        const r266 = PromptLoader.load('layout');
        const s266 = PromptLoader.render(r266, [
            { key: 'device_list', value: n266.map(w266 => `${w266.name}(${w266.libDevId})`).join(', ') },
            { key: 'circuit_constraint', value: o266 },
            { key: 'mcu_family', value: p266.mcuFamily ?? 'auto' }
        ]);
        const t266 = await this.chatWithRetry(s266, AiCapability.AUTO_WIRING);
        if (t266.success && t266.data) {
            const u266 = PromptLoader.extractJson<LayoutLlmOutput>(t266.data);
            const v266 = this.scoreLlmJson(u266, ['constraintRules', 'placementHints', 'moduleGroups']);
            if (u266 && v266 >= QUALITY_MIN_FILL_RATE)
                return { output: u266, fromLlm: true };
        }
        return { output: q266, fromLlm: false };
    }
    private async fetchRoutingLlm(c266: SchTopology, d266: PipelineOptions): Promise<LlmFetchResult<RoutingLlmOutput>> {
        const e266 = `route:${c266.deviceList.length}:${c266.netList.length}`;
        const f266 = this.cacheGet<RoutingLlmOutput>(e266);
        if (f266)
            return { output: f266, fromLlm: true };
        const g266 = ConstrainedWiringEngine.defaultConstraints(c266);
        if (d266.skipLlm)
            return { output: g266, fromLlm: false };
        const h266 = PromptLoader.load('route');
        const i266 = PromptLoader.render(h266, [
            { key: 'topology_summary', value: `${c266.deviceList.length} devices, ${c266.netList.length} nets` },
            { key: 'net_list', value: c266.netList.map(m266 => m266.netName).join(', ') }
        ]);
        const j266 = await this.chatWithRetry(i266, AiCapability.AUTO_WIRING);
        if (j266.success && j266.data) {
            const k266 = PromptLoader.extractJson<RoutingLlmOutput>(j266.data);
            const l266 = this.scoreLlmJson(k266, ['netPriority', 'traceWidths', 'viaStrategy']);
            if (k266 && l266 >= QUALITY_MIN_FILL_RATE) {
                this.cacheSet(e266, k266);
                return { output: k266, fromLlm: true };
            }
        }
        return { output: g266, fromLlm: false };
    }
    private ensurePowerNets(x265: SchTopology): SchTopology {
        const y265 = x265.netList.some(b266 => b266.netName === 'VCC' || b266.isPower);
        const z265 = x265.netList.some(a266 => a266.netName === 'GND');
        if (!y265) {
            x265.netList.push({
                netUuid: IdUtil.generate('net'), netName: 'VCC', displayName: 'VCC',
                nodeList: [], isPower: true, isAnalog: false, isBusMember: false,
                busParentUuid: '', defaultVoltage: 3.3, ercWarning: false, connectedProbeIds: []
            });
        }
        if (!z265) {
            x265.netList.push({
                netUuid: IdUtil.generate('net'), netName: 'GND', displayName: 'GND',
                nodeList: [], isPower: true, isAnalog: false, isBusMember: false,
                busParentUuid: '', defaultVoltage: 0, ercWarning: false, connectedProbeIds: []
            });
        }
        return x265;
    }
}
