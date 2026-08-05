import type { IAiApiManager, ChatOptions } from './api/IAiApiManager';
import { PROVIDER_TEMPLATES, CIRCUIT_TEST_PROMPT, getTemplate } from "@bundle:com.elecdraw.aischsim/entry@ai_api_manager/ets/config/ProviderTemplates";
import { AiProviderType, AiCapability, LoadBalanceMode, ApiConnectionStatus, CryptoUtil, IdUtil, AiTaskType, ErrCode, ResultHelper, FeatureGate, AiContextSanitizer, Logger, INSTR_TRACE_TAG, traceAiPayload, traceAiOp } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { AiApiConfig, Result, AiTestResult, ApiResult, UsageDashboard } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { QuotaTracker } from "@bundle:com.elecdraw.aischsim/entry@ai_api_manager/ets/billing/QuotaTracker";
import http from "@ohos:net.http";
import util from "@ohos:util";
import { NetworkModeManager } from "@bundle:com.elecdraw.aischsim/entry@ai_api_manager/ets/NetworkModeManager";
import { buildChatRequestBody, buildAnthropicMessagesBody, buildRequestHeaders, cloneAiApiConfig, extractChoiceContent, extractAnthropicText, parseSseContent, getBoundApiIdForCapability, maskApiConfig, mergeAiApiConfig } from "@bundle:com.elecdraw.aischsim/entry@ai_api_manager/ets/internal/AiApiTypes";
import type { AiApiConfigUpdate, ChatCompletionResponse, ChatRequestMessage, AnthropicMessagesResponse } from "@bundle:com.elecdraw.aischsim/entry@ai_api_manager/ets/internal/AiApiTypes";
/**
 * 流水线输出上限（64K）。多数网关（含 agnes）max_tokens 硬上限即 65536，
 * 超限会 500；reasoning 与 content 共享预算，推理型模型写满后正文无空间
 * 由 SSE watchdog 提前失败 + FAILOVER 兜底。
 */
const DEFAULT_MAX_OUTPUT_TOKENS = 65536;
/** 单 API 连续整请求传输失败次数达此值 → 标记 failed 触发 FAILOVER */
const AI_API_TRANSPORT_FAIL_FAILOVER = 2;
/** 复杂原理图 LLM 单次回复可能极慢（深推理/长 JSON）。 */
const AI_HTTP_CONNECT_TIMEOUT_MS = 120000;
const AI_HTTP_READ_TIMEOUT_MS = 1800000;
/** 连接测试用短超时，避免 DNS/代理失败时干等 */
const AI_HTTP_TEST_CONNECT_TIMEOUT_MS = 20000;
const AI_HTTP_TEST_READ_TIMEOUT_MS = 60000;
/** sticky 档遇瞬时传输错误时的同档额外重试次数（不含首次）；长请求不宜过多 */
const AI_STICKY_TRANSIENT_RETRIES = 1;
/**
 * sticky=代理 时翻转直连的超时：连接给足时间（真连不上时连接阶段快速失败），
 * 读取用满额 —— 长生成可能数分钟，20s 探测会把可用的官方直连误杀
 *（如 agnes 官方直连：代理 2 分钟掐断，直连本身可用）。
 */
const AI_STICKY_FLIP_CONNECT_TIMEOUT_MS = 60000;
const AI_STICKY_FLIP_READ_TIMEOUT_MS = AI_HTTP_READ_TIMEOUT_MS;
/**
 * SSE 流式下「纯推理无正文」watchdog：reasoning 占满 max_tokens 的模型
 *（如 agnes 忽略 disableThinking）会流十几分钟推理却始终无 content。
 * 到点仍无 content 字段 → 主动断开并按空内容失败处理，避免一次请求耗光整轮重试预算。
 * 10 分钟：给慢模型/长推理更宽裕的窗口，正常模型 content 通常 1-2 分钟内出现；
 * 对 reasoning-only 模型（写满 64K 需 ~11 分钟）仍能在耗光预算前提前失败。
 */
const AI_SSE_REASONING_ONLY_TIMEOUT_MS = 600000;
/** 公共 DNS（直连 DNS 失败时兜底） */
const AI_PUBLIC_DNS_SERVERS: string[] = ['223.5.5.5', '119.29.29.29', '8.8.8.8'];
interface HttpTransportOpts {
    usingProxy: boolean;
    usePublicDns: boolean;
    connectTimeoutMs: number;
    readTimeoutMs: number;
}
/** 上次对该 API 成功的传输方式（进程内粘性 + 可落盘，避免重启后先直连超时） */
interface StickyTransport {
    usingProxy: boolean;
    usePublicDns: boolean;
}
/** 落盘/注入用快照（无密钥） */
export interface StickyTransportSnapshot {
    apiId: string;
    usingProxy: boolean;
    usePublicDns: boolean;
}
/** HarmonyOS http / BusinessError 常不是 Error 实例，`${e}` 会变成 [object Object] */
function formatCaughtError(e: Object | string | number | boolean | Error | null | undefined): string {
    if (e === null || e === undefined) {
        return 'unknown';
    }
    if (typeof e === 'string') {
        return e.length > 0 ? e : 'empty string error';
    }
    if (typeof e === 'number' || typeof e === 'boolean') {
        return `${e}`;
    }
    if (e instanceof Error) {
        return e.message.length > 0 ? e.message : e.name;
    }
    try {
        const anyErr = e as Record<string, Object>;
        const code = anyErr['code'];
        const message = anyErr['message'];
        const name = anyErr['name'];
        const parts: string[] = [];
        if (code !== undefined && code !== null) {
            parts.push(`code=${code}`);
        }
        if (typeof message === 'string' && message.length > 0) {
            parts.push(message);
        }
        else if (typeof name === 'string' && name.length > 0) {
            parts.push(name);
        }
        if (parts.length > 0) {
            return parts.join(' ');
        }
        return JSON.stringify(e);
    }
    catch (_jsonFail) {
        return 'unprintable error';
    }
}
function isDnsOrHostResolveError(errMsg: string): boolean {
    const m = errMsg.toLowerCase();
    return m.indexOf('2300006') >= 0
        || m.indexOf('resolve the host') >= 0
        || m.indexOf('resolve host') >= 0
        || m.indexOf('couldn\'t resolve') >= 0
        || m.indexOf('could not resolve') >= 0
        || m.indexOf('name not resolved') >= 0;
}
/** 已连通后的瞬时/可恢复传输错误：sticky 同档应重试 */
function isTransientTransportError(errMsg: string): boolean {
    const m = errMsg.toLowerCase();
    return m.indexOf('2300016') >= 0
        || m.indexOf('http2 framing') >= 0
        || m.indexOf('2300999') >= 0
        || m.indexOf('internal error') >= 0
        || m.indexOf('2300052') >= 0
        || m.indexOf('returned nothing') >= 0
        || m.indexOf('connection reset') >= 0
        || m.indexOf('broken pipe') >= 0
        || m.indexOf('stream closed') >= 0
        || m.indexOf('stream reset') >= 0
        || m.indexOf('goaway') >= 0
        || (m.indexOf('ssl') >= 0 && m.indexOf('error') >= 0)
        || m.indexOf('unexpected eof') >= 0;
}
/** thinking 占满 max_tokens → 空正文；可关推理再发一次（不回退 sticky） */
/**
 * OHOS http 的 response.result 可能是 string 或 ArrayBuffer：
 * 直接 `${result}` 会把 ArrayBuffer 变成 "[object ArrayBuffer]" 吞掉错误详情，
 * 统一解码为字符串。
 */
function responseBodyToString(result: Object): string {
    if (typeof result === 'string') {
        return result;
    }
    if (result !== null && typeof result === 'object') {
        const ab = result as ArrayBuffer;
        const len = ab.byteLength;
        if (len !== undefined && len >= 0) {
            const decoder = util.TextDecoder.create('utf-8', { ignoreBOM: true });
            return decoder.decode(new Uint8Array(ab));
        }
    }
    return `${result}`;
}
/** 从 500 错误体解析服务端 max_tokens 上限（如 agnes 限制 65536）；未命中返回 0 */
function parseMaxTokensLimitError(errMsg: string): number {
    const m = errMsg.match(/max_tokens exceeds the limit of (\d+)/i);
    if (m && m[1] && m[1].length > 0) {
        const n = parseInt(m[1], 10);
        if (n > 0) {
            return n;
        }
    }
    return 0;
}
function isThinkingAteOutputError(errMsg: string): boolean {
    const m = errMsg.toLowerCase();
    if (m.indexOf('empty content') < 0) {
        return false;
    }
    return m.indexOf('finish_reason=length') >= 0
        || m.indexOf('reasoninglen=') >= 0
        || m.indexOf('stop_reason=max_tokens') >= 0;
}
/** 空 choices / 散文 raw body — 再 nudge 一次要求纯 JSON */
function isNonJsonBodyError(errMsg: string): boolean {
    const m = errMsg.toLowerCase();
    return m.indexOf('non-json body') >= 0
        || m.indexOf('empty response body') >= 0;
}
function humanizeHttpError(errMsg: string, triedProxy: boolean): string {
    if (isDnsOrHostResolveError(errMsg)) {
        if (triedProxy) {
            return '域名解析失败(DNS)。已尝试系统代理仍失败：请确认 Clash/VPN 已开启且系统代理可用，或到「平台设置」清空全局代理后直连重试';
        }
        return '域名解析失败(DNS)。请检查设备能否上网；若使用 Clash/VPN，请在「平台设置」填写任意非空代理开关以启用系统代理后重试';
    }
    if (errMsg.indexOf('401') >= 0 || errMsg.toLowerCase().indexOf('unauthorized') >= 0) {
        return '认证失败(401)：请检查 API Key 是否正确、是否过期';
    }
    if (errMsg.indexOf('429') >= 0) {
        return '触发限流(429)：请稍后重试或更换额度充足的 Key';
    }
    if (errMsg.toLowerCase().indexOf('timeout') >= 0 || errMsg.indexOf('2300029') >= 0
        || errMsg.indexOf('2300028') >= 0) {
        return '请求超时：网络过慢或服务无响应，请检查代理/网络后重试';
    }
    if (errMsg.indexOf('2300016') >= 0 || errMsg.toLowerCase().indexOf('http2 framing') >= 0) {
        return 'HTTP/2 传输中断（代理长连接常见）。已强制 HTTP/1.1 重试；若仍失败请重启 Clash/VPN';
    }
    if (errMsg.indexOf('2300007') >= 0 || errMsg.toLowerCase().indexOf('failed to connect') >= 0) {
        return triedProxy
            ? '无法连接服务器（已走代理）。请确认 Clash/VPN 已开启且规则放行 apihub.agnes-ai.com'
            : '无法直连服务器。请到「平台设置」启用系统代理后重试';
    }
    if (errMsg.toLowerCase().indexOf('empty content') >= 0) {
        return '模型正文为空（推理可能占满输出额度）。系统会自动关推理重试；若仍失败请关「推理开」或换模型';
    }
    return errMsg;
}
export class AiApiManagerImpl implements IAiApiManager {
    private apis: Map<string, AiApiConfig> = new Map();
    private encryptedKeys: Map<string, string> = new Map();
    private strategy: LoadBalanceMode = LoadBalanceMode.PRIORITY;
    private roundRobinIndex: number = 0;
    private defaultApiId: string = '';
    private failedApiIds: Set<string> = new Set();
    /** apiId → 连续整请求传输失败次数（代理/直连/DNS 全档都失败才 +1）；达阈值标记 failed */
    private transportFailCountByApi: Map<string, number> = new Map();
    /** apiId → 服务端 max_tokens 上限（500 max_tokens exceeds the limit of N 时自动探测） */
    private maxTokensCapByApi: Map<string, number> = new Map();
    private dailyCallCounts: Map<string, number> = new Map();
    private lastCallDate: string = '';
    private quotaTracker: QuotaTracker = QuotaTracker.getInstance();
    readonly networkMode: NetworkModeManager = new NetworkModeManager();
    private networkFailCount: number = 0;
    /** 用户取消：中止 in-flight HTTP，并阻止重试 */
    private chatCancelRequested: boolean = false;
    private activeHttpRequests: http.HttpRequest[] = [];
    /** apiId → 上次成功的代理/DNS 组合；测试通了后生图优先走同一档（可落盘跨进程） */
    private stickyTransportByApi: Map<string, StickyTransport> = new Map();
    /** 粘性变更时写盘（由 AppService 注入） */
    private stickyPersistHandler: ((entries: StickyTransportSnapshot[]) => void) | null = null;
    // ---- v2 API ----
    /** 启动时从磁盘注入粘性传输，避免每次从直连 attempt#1 重试 */
    importStickyTransports(entries: StickyTransportSnapshot[]): void {
        let n = 0;
        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            if (!e.apiId || e.apiId.length === 0) {
                continue;
            }
            const sticky: StickyTransport = {
                usingProxy: e.usingProxy === true,
                usePublicDns: e.usePublicDns === true
            };
            this.stickyTransportByApi.set(e.apiId, sticky);
            n++;
            Logger.info(INSTR_TRACE_TAG, `[AI_API] sticky hydrate id=${e.apiId}` +
                ` usingProxy=${sticky.usingProxy} publicDns=${sticky.usePublicDns}`);
        }
        if (n > 0) {
            Logger.info(INSTR_TRACE_TAG, `[AI_API] sticky hydrate done count=${n}`);
        }
    }
    exportStickyTransports(): StickyTransportSnapshot[] {
        const out: StickyTransportSnapshot[] = [];
        this.stickyTransportByApi.forEach((v: StickyTransport, apiId: string) => {
            out.push({
                apiId: apiId,
                usingProxy: v.usingProxy,
                usePublicDns: v.usePublicDns
            });
        });
        return out;
    }
    setStickyPersistHandler(handler: ((entries: StickyTransportSnapshot[]) => void) | null): void {
        this.stickyPersistHandler = handler;
    }
    private flushStickyPersist(): void {
        if (this.stickyPersistHandler === null) {
            return;
        }
        try {
            this.stickyPersistHandler(this.exportStickyTransports());
        }
        catch (_e) {
            /* ignore persist errors */
        }
    }
    getAllApiConfig(): AiApiConfig[] {
        return this.listApis();
    }
    getDefaultApi(): ApiResult<AiApiConfig> {
        if (!this.defaultApiId)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'No default API set');
        const api = this.getApi(this.defaultApiId);
        if (!api.success || !api.data)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, api.error);
        return ResultHelper.ok(api.data);
    }
    async testApiConnect(id: string): Promise<AiTestResult> {
        const start = Date.now();
        Logger.info(INSTR_TRACE_TAG, `[AI_API] testApiConnect START id=${id}`);
        const result = await this.testConnection(id);
        const api = this.apis.get(id);
        let errCode = ErrCode.OK;
        if (!result.success) {
            if (result.error?.includes('401'))
                errCode = ErrCode.ERR_API_AUTH;
            else if (result.error?.includes('429'))
                errCode = ErrCode.ERR_API_LIMIT;
            else if (result.error?.includes('timeout'))
                errCode = ErrCode.ERR_API_TIMEOUT;
            else
                errCode = ErrCode.ERR_API_TIMEOUT;
        }
        const latencyMs = Date.now() - start;
        Logger.info(INSTR_TRACE_TAG, `[AI_API] testApiConnect END id=${id} ok=${result.success}` +
            ` latencyMs=${latencyMs} errCode=${errCode} err=${result.error ?? ''}`);
        return {
            success: result.success,
            errCode,
            latencyMs: latencyMs,
            modelResponse: result.data ? 'OK' : (result.error ?? ''),
            remainingQuota: api?.dailyCallCount !== undefined ? `${1000 - (api.dailyCallCount ?? 0)}` : 'unknown'
        };
    }
    getAvailableApiForTask(taskType: AiTaskType): ApiResult<AiApiConfig> {
        if (!this.networkMode.shouldAllowCloudApi()) {
            const local = Array.from(this.apis.values()).find(a => a.enabled && a.provider === AiProviderType.OLLAMA);
            if (local)
                return ResultHelper.ok(maskApiConfig(local));
            return ResultHelper.fail(ErrCode.ERR_API_TIMEOUT, '离线模式：仅本地 Ollama 可用');
        }
        const taskKey = `task_${taskType}`;
        const capability = taskTypeToCapability(taskType);
        const enabled = Array.from(this.apis.values()).filter(a => a.enabled && !this.failedApiIds.has(a.id));
        for (let i = 0; i < enabled.length; i++) {
            const api = enabled[i];
            if (api.taskBind && api.taskBind[taskKey]) {
                return ResultHelper.ok(maskApiConfig(api));
            }
            if (capability && api.capabilityBinding) {
                const boundId = getBoundApiIdForCapability(api.capabilityBinding, capability);
                if (boundId) {
                    const b = this.apis.get(boundId);
                    if (b && b.enabled && !this.failedApiIds.has(b.id)) {
                        return ResultHelper.ok(maskApiConfig(b));
                    }
                }
            }
        }
        if (this.defaultApiId) {
            const def = this.getApi(this.defaultApiId);
            if (def.success && def.data)
                return ResultHelper.ok(def.data);
        }
        if (enabled.length > 0)
            return ResultHelper.ok(maskApiConfig(enabled[0]));
        return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'No API available for task');
    }
    getFallbackApi(excludeId: string): ApiResult<AiApiConfig> {
        const enabled = Array.from(this.apis.values())
            .filter(a => a.enabled && a.id !== excludeId && !this.failedApiIds.has(a.id));
        enabled.sort((a, b) => a.priority - b.priority);
        if (enabled.length === 0)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'No fallback API');
        return ResultHelper.ok(maskApiConfig(enabled[0]));
    }
    recordApiCall(id: string, tokensUsed: number = 0): void {
        this.resetDailyCountsIfNeeded();
        const count = (this.dailyCallCounts.get(id) ?? 0) + 1;
        this.dailyCallCounts.set(id, count);
        const api = this.apis.get(id);
        const providerName = api?.name ?? id;
        this.quotaTracker.recordCall(id, providerName, tokensUsed);
        if (api) {
            api.dailyCallCount = count;
            this.apis.set(id, api);
        }
    }
    getUsageDashboard(): UsageDashboard {
        return this.quotaTracker.getDashboard();
    }
    isQuotaWarningActive(): boolean {
        return this.quotaTracker.isWarningActive();
    }
    checkGlobalAiQuota(): ApiResult<void> {
        return this.quotaTracker.checkBeforeCall('global', 'global');
    }
    getDailyCallCount(id: string): number {
        this.resetDailyCountsIfNeeded();
        return this.dailyCallCounts.get(id) ?? 0;
    }
    private resetDailyCountsIfNeeded(): void {
        const today = new Date().toISOString().substring(0, 10);
        if (this.lastCallDate !== today) {
            this.dailyCallCounts.clear();
            this.lastCallDate = today;
        }
    }
    // ---- v1 API ----
    addApi(config: AiApiConfig): Result<void> {
        return this.addApiInternal(config, false);
    }
    /**
     * 金库/工程恢复专用：跳过 FeatureGate（历史兼容；当前全功能开放时与 addApi 等价）。
     */
    restoreApi(config: AiApiConfig): Result<void> {
        return this.addApiInternal(config, true);
    }
    private addApiInternal(config: AiApiConfig, skipGate: boolean): Result<void> {
        if (this.apis.has(config.id)) {
            Logger.warn(INSTR_TRACE_TAG, `[AI_API] addApi REJECT duplicate id=${config.id}`);
            return { success: false, error: 'API ID already exists' };
        }
        if (!skipGate) {
            const gate = FeatureGate.canAddAiApi(this.apis.size);
            if (!gate.success) {
                Logger.warn(INSTR_TRACE_TAG, `[AI_API] addApi REJECT gate: ${gate.error}`);
                return { success: false, errCode: gate.errCode, error: gate.error };
            }
        }
        const stored = cloneAiApiConfig(config);
        // 输入防护：模型名/名称/URL 的意外首尾空格会直接 400（如 model=" deepseek-v4-flash"）
        stored.model = (stored.model ?? '').trim();
        stored.name = (stored.name ?? '').trim();
        stored.baseUrl = (stored.baseUrl ?? '').trim();
        if (stored.maxTokens < DEFAULT_MAX_OUTPUT_TOKENS) {
            stored.maxTokens = DEFAULT_MAX_OUTPUT_TOKENS;
        }
        if (config.apiKey && config.apiKey !== '***') {
            this.encryptedKeys.set(config.id, CryptoUtil.encryptWithHuks(config.apiKey));
            if (config.backupApiKey) {
                this.encryptedKeys.set(`${config.id}_backup`, CryptoUtil.encryptWithHuks(config.backupApiKey));
            }
        }
        this.apis.set(config.id, stored);
        this.failedApiIds.delete(config.id);
        this.transportFailCountByApi.delete(config.id);
        if (!this.defaultApiId && config.enabled)
            this.defaultApiId = config.id;
        Logger.info(INSTR_TRACE_TAG, `[AI_API] ${skipGate ? 'restoreApi' : 'addApi'} OK id=${config.id} name=${config.name}` +
            ` provider=${config.provider} model=${config.model}` +
            ` enabled=${config.enabled} keyLen=${config.apiKey && config.apiKey !== '***' ? config.apiKey.length : 0}` +
            ` total=${this.apis.size}`);
        return { success: true };
    }
    removeApi(id: string): Result<void> {
        if (!this.apis.delete(id))
            return { success: false, error: 'API not found' };
        this.encryptedKeys.delete(id);
        this.encryptedKeys.delete(`${id}_backup`);
        this.failedApiIds.delete(id);
        this.transportFailCountByApi.delete(id);
        this.stickyTransportByApi.delete(id);
        this.flushStickyPersist();
        if (this.defaultApiId === id)
            this.defaultApiId = '';
        return { success: true };
    }
    updateApi(id: string, updates: AiApiConfigUpdate): Result<void> {
        const existing = this.apis.get(id);
        if (!existing)
            return { success: false, error: 'API not found' };
        // 仅在明确传入有效新 Key 时轮换；空串 / *** / 未传 一律保留 encryptedKeys
        const newKey = updates.apiKey;
        const hasNewKey = newKey !== undefined &&
            newKey.length > 0 && newKey !== '***';
        if (hasNewKey) {
            this.encryptedKeys.set(id, CryptoUtil.encryptWithHuks(newKey as string));
            this.failedApiIds.delete(id);
            this.transportFailCountByApi.delete(id);
        }
        if (updates.backupApiKey !== undefined && updates.backupApiKey.length > 0 &&
            updates.backupApiKey !== '***') {
            this.encryptedKeys.set(`${id}_backup`, CryptoUtil.encryptWithHuks(updates.backupApiKey));
            this.failedApiIds.delete(id);
            this.transportFailCountByApi.delete(id);
        }
        const updated = mergeAiApiConfig(existing, updates);
        updated.model = (updated.model ?? '').trim();
        updated.name = (updated.name ?? '').trim();
        updated.baseUrl = (updated.baseUrl ?? '').trim();
        // 防止 merge 把 *** / 空串写进内存镜像；密钥以 encryptedKeys 为准
        if (!hasNewKey) {
            const kept = existing.apiKey;
            if (kept && kept !== '***') {
                updated.apiKey = kept;
            }
            else {
                const enc = this.encryptedKeys.get(id);
                if (enc && enc.length > 0) {
                    const plain = CryptoUtil.decrypt(enc);
                    if (plain.length > 0) {
                        updated.apiKey = plain;
                    }
                }
            }
        }
        this.apis.set(id, updated);
        return { success: true };
    }
    getApi(id: string): Result<AiApiConfig> {
        const api = this.apis.get(id);
        if (!api)
            return { success: false, error: 'API not found' };
        return { success: true, data: maskApiConfig(api) };
    }
    listApis(): AiApiConfig[] {
        return Array.from(this.apis.values()).map(a => maskApiConfig(a));
    }
    enableApi(id: string): Result<void> { return this.updateApi(id, { enabled: true }); }
    disableApi(id: string): Result<void> { return this.updateApi(id, { enabled: false }); }
    batchEnable(ids: string[]): Result<number> {
        let count = 0;
        for (let i = 0; i < ids.length; i++) {
            if (this.enableApi(ids[i]).success)
                count++;
        }
        return { success: true, data: count };
    }
    batchDisable(ids: string[]): Result<number> {
        let count = 0;
        for (let i = 0; i < ids.length; i++) {
            if (this.disableApi(ids[i]).success)
                count++;
        }
        return { success: true, data: count };
    }
    batchRemove(ids: string[]): Result<number> {
        let count = 0;
        for (let i = 0; i < ids.length; i++) {
            if (this.removeApi(ids[i]).success)
                count++;
        }
        return { success: true, data: count };
    }
    setDefaultApi(id: string): Result<void> {
        if (!this.apis.has(id))
            return { success: false, error: 'API not found' };
        this.defaultApiId = id;
        return { success: true };
    }
    async testConnection(id: string): Promise<Result<boolean>> {
        const api = this.apis.get(id);
        if (!api) {
            Logger.error(INSTR_TRACE_TAG, `[AI_API] testConnection FAIL id=${id} not found`);
            return { success: false, error: 'API not found' };
        }
        if (!this.networkMode.shouldAllowCloudApi() && api.provider !== AiProviderType.OLLAMA) {
            Logger.warn(INSTR_TRACE_TAG, `[AI_API] testConnection REJECT offline id=${id}`);
            return { success: false, error: '离线模式已开启：禁止测试云端 API，请先关闭离线模式' };
        }
        // 上次取消 PCB/生图会留下 cancel 标志；测试连接是新操作，必须清掉否则立刻 cancelled
        this.clearChatCancel();
        Logger.info(INSTR_TRACE_TAG, `[AI_API] testConnection START id=${id} name=${api.name}` +
            ` provider=${api.provider} model=${api.model} url=${api.baseUrl}` +
            ` preferProxy=${this.shouldUseSystemProxy(api.id)}`);
        const result = await this.sendRequest(api, CIRCUIT_TEST_PROMPT, {
            // deepseek-v4-pro 等带 thinking 的模型：50 tokens 会被推理耗尽 → finish_reason=length 空正文
            maxTokens: 256,
            temperature: 0,
            disableThinking: true,
            connectTimeoutMs: AI_HTTP_TEST_CONNECT_TIMEOUT_MS,
            readTimeoutMs: AI_HTTP_TEST_READ_TIMEOUT_MS
        });
        const err = result.error ?? '';
        const status = result.success ? ApiConnectionStatus.OK :
            (err.indexOf('401') >= 0 ? ApiConnectionStatus.AUTH_ERROR :
                err.indexOf('429') >= 0 ? ApiConnectionStatus.RATE_LIMIT :
                    (err.indexOf('超时') >= 0 || err.toLowerCase().indexOf('timeout') >= 0) ?
                        ApiConnectionStatus.TIMEOUT : ApiConnectionStatus.NETWORK_ERROR);
        this.updateApi(id, { lastStatus: status, lastTestedAt: new Date().toISOString() });
        Logger.info(INSTR_TRACE_TAG, `[AI_API] testConnection END id=${id} ok=${result.success}` +
            ` status=${status} err=${err}` +
            ` respPreview=${result.data ? result.data.substring(0, 80) : ''}`);
        return { success: result.success, data: result.success, error: result.error };
    }
    cancelPendingChat(): void {
        this.chatCancelRequested = true;
        const n = this.activeHttpRequests.length;
        Logger.info(INSTR_TRACE_TAG, `[AI_API] CANCEL pending chat requests n=${n}`);
        traceAiOp('AI_API', 'cancel_pending', `n=${n}`);
        const snapshot = this.activeHttpRequests.slice();
        this.activeHttpRequests = [];
        for (let i = 0; i < snapshot.length; i++) {
            try {
                snapshot[i].destroy();
            }
            catch (_e) {
                // destroy 可能对已结束请求抛错，忽略
            }
        }
    }
    clearChatCancel(): void {
        this.chatCancelRequested = false;
    }
    isChatCancelled(): boolean {
        return this.chatCancelRequested;
    }
    async chat(prompt: string, options?: ChatOptions): Promise<Result<string>> {
        // 新 chat 开启时清除遗留 cancel（取消只作用于当时 in-flight；否则后续全被 cancelled）
        this.clearChatCancel();
        if (!this.networkMode.shouldAllowCloudApi()) {
            const local = this.selectApi(options?.capability);
            const isLocal = local !== null && local.provider === AiProviderType.OLLAMA;
            if (!isLocal) {
                Logger.warn(INSTR_TRACE_TAG, '[AI_API] chat REJECT offline mode (cloud blocked)');
                return {
                    success: false,
                    errCode: ErrCode.ERR_API_TIMEOUT,
                    error: '离线模式：已禁止云端 AI，请关闭离线或配置本地 Ollama'
                };
            }
        }
        const safePrompt = AiContextSanitizer.sanitizePrompt(prompt);
        if (safePrompt.indexOf('<dist>') >= 0 || safePrompt.indexOf('<coord>') >= 0) {
            Logger.warn(INSTR_TRACE_TAG, '[AI_API] sanitize left placeholder <dist>/<coord> — geometry may be broken');
        }
        const api = this.selectApi(options?.capability);
        if (!api) {
            Logger.error(INSTR_TRACE_TAG, `[AI_API] chat REJECT no enabled API cap=${options?.capability ?? 'any'}`);
            return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: 'No enabled AI API configured' };
        }
        const quotaCheck = this.quotaTracker.checkBeforeCall(api.id, api.name);
        if (!quotaCheck.success) {
            Logger.warn(INSTR_TRACE_TAG, `[AI_API] chat REJECT quota id=${api.id} err=${quotaCheck.error ?? ''}`);
            return { success: false, errCode: quotaCheck.errCode, error: quotaCheck.error };
        }
        traceAiOp('AI_API', 'chat', `id=${api.id} name=${api.name} model=${api.model}` +
            ` cap=${options?.capability ?? 'any'} promptLen=${safePrompt.length}`);
        let result = await this.sendRequest(api, safePrompt, options);
        // reasoning 占满额度 → 空 content：抬高 maxTokens；若仍开着 thinking 则顺带关掉
        if (!result.success && isThinkingAteOutputError(result.error ?? '')) {
            if (this.chatCancelRequested) {
                return {
                    success: false,
                    errCode: ErrCode.ERR_ASYNC_CANCEL,
                    error: 'cancelled'
                };
            }
            const prevMax = options?.maxTokens ?? 0;
            const bumpMax = Math.max(prevMax, DEFAULT_MAX_OUTPUT_TOKENS);
            // 已是满额且已关 thinking 仍空正文：再发一次带硬提示（agnes 关 thinking 仍可能写 reasoning）
            const alreadyMaxed = prevMax >= DEFAULT_MAX_OUTPUT_TOKENS && options?.disableThinking === true;
            Logger.warn(INSTR_TRACE_TAG, `[AI_API] thinking ate output id=${api.id}` +
                ` prevMax=${prevMax} → ${bumpMax} disableThinking=true` +
                `${alreadyMaxed ? ' (nudge-only)' : ''} err=${result.error ?? ''}`);
            const retryOpts: ChatOptions = {
                capability: options?.capability,
                context: options?.context,
                temperature: options?.temperature,
                connectTimeoutMs: options?.connectTimeoutMs,
                readTimeoutMs: options?.readTimeoutMs,
                disableThinking: true,
                maxTokens: bumpMax
            };
            const nudge = '\n\n【系统重试 — 格式错误，必须重发】' +
                '上一轮回复不合格：content 为空（finish_reason=length，reasoning 占满额度），不是合法 JSON。' +
                '请忽略上一轮输出，重新发送：content 必须是且仅是一个完整 JSON 对象（首字符 { 末字符 }）；' +
                '禁止 markdown/说明文字；reasoning/thinking 尽量为空或极短，不得再耗尽 max_tokens。';
            result = await this.sendRequest(api, safePrompt + nudge, retryOpts);
            // 连续两轮 thinking 吃光输出额度：该模型在当前配置下结构性无法产出正文
            //（disableThinking 可能被服务端忽略，如 agnes/Qwen 系），重试无益。
            // 标记失败让后续调用 FAILOVER/ROUND_ROBIN 切到其它 API，不再每次打同一坏模型。
            if (!result.success && isThinkingAteOutputError(result.error ?? '')) {
                this.failedApiIds.add(api.id);
                Logger.warn(INSTR_TRACE_TAG, `[AI_API] thinking-ate-output twice → mark api failed id=${api.id}` +
                    ` (failover for next call)`);
            }
        }
        else if (!result.success && isNonJsonBodyError(result.error ?? '')) {
            if (this.chatCancelRequested) {
                return {
                    success: false,
                    errCode: ErrCode.ERR_ASYNC_CANCEL,
                    error: 'cancelled'
                };
            }
            Logger.warn(INSTR_TRACE_TAG, `[AI_API] non-JSON body retry id=${api.id} err=${result.error ?? ''}`);
            const retryOpts: ChatOptions = {
                capability: options?.capability,
                context: options?.context,
                temperature: options?.temperature,
                connectTimeoutMs: options?.connectTimeoutMs,
                readTimeoutMs: options?.readTimeoutMs,
                disableThinking: true,
                maxTokens: options?.maxTokens
            };
            const nudge = '\n\n【系统重试 — 格式错误，必须重发】' +
                '上一轮无有效 choices/content，或返回了非 JSON 散文。' +
                '请重新发送：content 必须是且仅是一个完整 JSON 对象（首字符 { 末字符 }）；' +
                '禁止 markdown、说明文字、空回复。';
            result = await this.sendRequest(api, safePrompt + nudge, retryOpts);
        }
        if (result.success)
            this.recordApiCall(api.id);
        return result;
    }
    exportConfigs(hideKeys: boolean = true): Result<string> {
        const configs: AiApiConfig[] = [];
        this.apis.forEach((api: AiApiConfig) => {
            const copy = cloneAiApiConfig(api);
            if (hideKeys) {
                copy.apiKey = '***';
                copy.backupApiKey = copy.backupApiKey ? '***' : undefined;
            }
            else {
                // 优先金库镜像；解密失败时绝不能用空串覆盖仍有效的明文，否则会写穿金库丢 Key
                const enc = this.encryptedKeys.get(api.id);
                if (enc && enc.length > 0) {
                    const plain = CryptoUtil.decrypt(enc);
                    if (plain.length > 0) {
                        copy.apiKey = plain;
                    }
                }
                if (!copy.apiKey || copy.apiKey.length === 0 || copy.apiKey === '***') {
                    Logger.warn(INSTR_TRACE_TAG, `[AI_API] exportConfigs missing key id=${api.id} name=${api.name}`);
                }
                const encBak = this.encryptedKeys.get(`${api.id}_backup`);
                if (encBak && encBak.length > 0) {
                    const bakPlain = CryptoUtil.decrypt(encBak);
                    if (bakPlain.length > 0) {
                        copy.backupApiKey = bakPlain;
                    }
                }
            }
            configs.push(copy);
        });
        return { success: true, data: JSON.stringify(configs, null, 2) };
    }
    importConfigs(json: string): Result<number> {
        try {
            const configs = JSON.parse(json) as AiApiConfig[];
            let count = 0;
            for (let i = 0; i < configs.length; i++) {
                const config = configs[i];
                if (!config.id)
                    config.id = IdUtil.generate('api');
                const existing = this.apis.get(config.id);
                if (existing) {
                    const upd = this.updateApi(config.id, {
                        name: config.name,
                        provider: config.provider,
                        baseUrl: config.baseUrl,
                        apiKey: config.apiKey,
                        backupApiKey: config.backupApiKey,
                        model: config.model,
                        enabled: config.enabled,
                        priority: config.priority,
                        maxTokens: config.maxTokens,
                        temperature: config.temperature,
                        contextLimit: config.contextLimit,
                        proxyUrl: config.proxyUrl,
                        customHeaders: config.customHeaders,
                        capabilityBinding: config.capabilityBinding,
                        stream: config.stream,
                        remark: config.remark
                    });
                    if (upd.success) {
                        count++;
                    }
                }
                else {
                    const addRes = this.addApi(config);
                    if (addRes.success) {
                        count++;
                    }
                    else {
                        Logger.warn(INSTR_TRACE_TAG, `[AI_API] importConfigs skip id=${config.id}: ${addRes.error}`);
                    }
                }
            }
            return { success: true, data: count };
        }
        catch (e) {
            return { success: false, error: `Invalid JSON: ${e}` };
        }
    }
    clearAllConfigs(): Result<void> {
        // 仅供 vault→manager 整表重载；禁止在未随后 addApi 时单独调用清空金库镜像
        // 注意：不清除 stickyTransportByApi — apiId 不变，跨重载/重启仍优先走上次成功传输档
        Logger.warn(INSTR_TRACE_TAG, `[AI_API] clearAllConfigs wiping in-memory manager (count=${this.apis.size})` +
            ` stickyKept=${this.stickyTransportByApi.size}`);
        this.apis.clear();
        this.encryptedKeys.clear();
        this.defaultApiId = '';
        this.failedApiIds.clear();
        this.transportFailCountByApi.clear();
        return { success: true };
    }
    getSupportedProviders(): AiProviderType[] {
        return PROVIDER_TEMPLATES.map(t => t.provider);
    }
    getProviderTemplates() { return PROVIDER_TEMPLATES; }
    createFromTemplate(provider: AiProviderType, name: string): Result<AiApiConfig> {
        const template = getTemplate(provider);
        if (!template)
            return { success: false, error: 'Unknown provider' };
        const config: AiApiConfig = {
            id: IdUtil.generate('api'),
            name,
            provider,
            baseUrl: template.defaultBaseUrl,
            apiKey: '',
            model: template.defaultModel,
            enabled: true,
            priority: 10,
            maxTokens: DEFAULT_MAX_OUTPUT_TOKENS,
            temperature: 0.7,
            contextLimit: 128000
        };
        return { success: true, data: config };
    }
    setLoadBalanceStrategy(strategy: LoadBalanceMode): void {
        this.strategy = strategy;
    }
    bindCapability(capability: AiCapability, apiId: string): Result<void> {
        const api = this.apis.get(apiId);
        if (!api)
            return { success: false, error: 'API not found' };
        const binding: Record<string, string> = {};
        if (api.capabilityBinding) {
            const keys = Object.keys(api.capabilityBinding);
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                binding[key] = api.capabilityBinding[key];
            }
        }
        binding[capability] = apiId;
        return this.updateApi(apiId, { capabilityBinding: binding });
    }
    private resolveMaxTokens(api: AiApiConfig, options?: ChatOptions): number {
        let effective = options?.maxTokens !== undefined
            ? options.maxTokens
            : (api.maxTokens >= DEFAULT_MAX_OUTPUT_TOKENS ? api.maxTokens : DEFAULT_MAX_OUTPUT_TOKENS);
        // 服务端上限（500 max_tokens exceeds the limit of N 时自动探测并记忆）
        const cap = this.maxTokensCapByApi.get(api.id);
        if (cap !== undefined && cap > 0 && effective > cap) {
            effective = cap;
        }
        return effective;
    }
    /**
     * 传输尝试顺序：若该 API 曾有成功档（如代理通、直连超时），优先复用；
     * sticky=代理时先试同代理对侧 DNS，再翻转直连 —— 直连给满读取超时
     *（长生成数分钟，探测式短超时会把可用直连误杀），成功一次后 sticky 即翻转为直连。
     */
    private buildTransportAttempts(apiId: string, preferProxy: boolean, connectTimeoutMs: number, readTimeoutMs: number): HttpTransportOpts[] {
        const mk = (usingProxy: boolean, usePublicDns: boolean, cMs: number, rMs: number): HttpTransportOpts => {
            return { usingProxy, usePublicDns, connectTimeoutMs: cMs, readTimeoutMs: rMs };
        };
        const pushUnique = (ordered: HttpTransportOpts[], opt: HttpTransportOpts): void => {
            for (let j = 0; j < ordered.length; j++) {
                if (ordered[j].usingProxy === opt.usingProxy &&
                    ordered[j].usePublicDns === opt.usePublicDns) {
                    return;
                }
            }
            ordered.push(opt);
        };
        const sticky = this.stickyTransportByApi.get(apiId);
        const ordered: HttpTransportOpts[] = [];
        if (sticky) {
            pushUnique(ordered, mk(sticky.usingProxy, sticky.usePublicDns, connectTimeoutMs, readTimeoutMs));
            pushUnique(ordered, mk(sticky.usingProxy, !sticky.usePublicDns, connectTimeoutMs, readTimeoutMs));
            if (sticky.usingProxy) {
                // 代理粘性：翻转直连给满读取超时（长生成需要）；连接阶段仍有界，
                // 真连不上时快速失败。直连成功一次后 sticky 自动翻转为直连。
                pushUnique(ordered, mk(false, false, AI_STICKY_FLIP_CONNECT_TIMEOUT_MS, AI_STICKY_FLIP_READ_TIMEOUT_MS));
                pushUnique(ordered, mk(false, true, AI_STICKY_FLIP_CONNECT_TIMEOUT_MS, AI_STICKY_FLIP_READ_TIMEOUT_MS));
            }
            else {
                // 直连粘性：可回退代理（满超时，因长回复需要）
                pushUnique(ordered, mk(true, false, connectTimeoutMs, readTimeoutMs));
                pushUnique(ordered, mk(true, true, connectTimeoutMs, readTimeoutMs));
            }
            Logger.info(INSTR_TRACE_TAG, `[AI_API] sticky transport first id=${apiId}` +
                ` usingProxy=${sticky.usingProxy} publicDns=${sticky.usePublicDns}`);
            return ordered;
        }
        // 无 sticky：探测顺序保持「公网 DNS 直连 → prefer → 翻转」
        pushUnique(ordered, mk(false, true, connectTimeoutMs, readTimeoutMs));
        pushUnique(ordered, mk(preferProxy, false, connectTimeoutMs, readTimeoutMs));
        pushUnique(ordered, mk(!preferProxy, false, connectTimeoutMs, readTimeoutMs));
        return ordered;
    }
    /**
     * 对 sticky 首档：瞬时传输错误（HTTP2 framing 等）同档重试，再才回退其它传输。
     */
    private async executeHttpPostWithStickyRetry(apiId: string, url: string, headers: Record<string, string>, body: string, opt: HttpTransportOpts, attemptIndex: number, hasSticky: boolean, logSuffix: string, streamMode: boolean = false): Promise<Result<string>> {
        const maxTries = (attemptIndex === 0 && hasSticky) ? (1 + AI_STICKY_TRANSIENT_RETRIES) : 1;
        let last: Result<string> = { success: false, error: 'unknown' };
        for (let t = 0; t < maxTries; t++) {
            if (this.chatCancelRequested) {
                return { success: false, errCode: ErrCode.ERR_ASYNC_CANCEL, error: 'cancelled' };
            }
            if (t > 0) {
                const prevErr = last.error ?? '';
                if (!isTransientTransportError(prevErr)) {
                    break;
                }
                Logger.info(INSTR_TRACE_TAG, `[AI_API] sticky transient retry#${t} id=${apiId}` +
                    ` usingProxy=${opt.usingProxy} publicDns=${opt.usePublicDns}${logSuffix}`);
            }
            last = await this.executeHttpPost(url, headers, body, opt, streamMode);
            if (last.success) {
                return last;
            }
            const err = last.error ?? '';
            if (err.indexOf('cancelled') >= 0 || err.indexOf('API returned') >= 0) {
                return last;
            }
            if (t + 1 < maxTries && !isTransientTransportError(err)) {
                break;
            }
        }
        return last;
    }
    private rememberStickyTransport(apiId: string, opt: HttpTransportOpts): void {
        const prev = this.stickyTransportByApi.get(apiId);
        if (prev && prev.usingProxy === opt.usingProxy && prev.usePublicDns === opt.usePublicDns) {
            return;
        }
        // 代理已用本机 DNS 成功过：勿被偶发 publicDns 成功覆盖（后者后续易 2300999）
        if (prev && prev.usingProxy && opt.usingProxy && !prev.usePublicDns && opt.usePublicDns) {
            Logger.info(INSTR_TRACE_TAG, `[AI_API] sticky keep localDns id=${apiId} (ignore publicDns success)`);
            return;
        }
        const sticky: StickyTransport = {
            usingProxy: opt.usingProxy,
            usePublicDns: opt.usePublicDns
        };
        this.stickyTransportByApi.set(apiId, sticky);
        Logger.info(INSTR_TRACE_TAG, `[AI_API] sticky transport saved id=${apiId}` +
            ` usingProxy=${opt.usingProxy} publicDns=${opt.usePublicDns}`);
        this.flushStickyPersist();
    }
    private async sendRequest(api: AiApiConfig, prompt: string, options?: ChatOptions): Promise<Result<string>> {
        const apiKey = this.getDecryptedKey(api.id);
        const template = getTemplate(api.provider);
        const chatPath = template?.chatPath ?? '/chat/completions';
        const base = api.baseUrl.endsWith('/') ? api.baseUrl.substring(0, api.baseUrl.length - 1) : api.baseUrl;
        const url = `${base}${chatPath}`;
        const maxTokens = this.resolveMaxTokens(api, options);
        const connectTimeoutMs = options?.connectTimeoutMs !== undefined
            ? options.connectTimeoutMs : AI_HTTP_CONNECT_TIMEOUT_MS;
        const readTimeoutMs = options?.readTimeoutMs !== undefined
            ? options.readTimeoutMs : AI_HTTP_READ_TIMEOUT_MS;
        const preferProxy = this.shouldUseSystemProxy(api.id);
        Logger.info(INSTR_TRACE_TAG, `[AI_API] HTTP POST id=${api.id} url=${url} model=${api.model}` +
            ` keyLen=${apiKey.length} promptLen=${prompt.length}` +
            ` maxTokens=${maxTokens}` +
            ` temp=${options?.temperature ?? api.temperature}` +
            ` disableThinking=${options?.disableThinking === true}` +
            ` preferProxy=${preferProxy}` +
            ` connectTimeoutMs=${connectTimeoutMs}` +
            ` readTimeoutMs=${readTimeoutMs}`);
        Logger.info(INSTR_TRACE_TAG, `[AI_API] WAIT long reply — complex prompts may take minutes; user cancel aborts HTTP`);
        traceAiPayload('AI_API', 'PROMPT', prompt, `id=${api.id} model=${api.model} cap=${options?.capability ?? 'any'}`);
        const headers: Record<string, string> = buildRequestHeaders(apiKey, api.customHeaders, api.provider);
        const messages: ChatRequestMessage[] = [{ role: 'user', content: prompt }];
        const temp = options?.temperature ?? api.temperature;
        let maxTokensUsed = maxTokens;
        let streamMode = api.stream === true;
        const buildBody = (tokens: number, stream: boolean): string => {
            const reqBody = api.provider === AiProviderType.CLAUDE
                ? buildAnthropicMessagesBody(api.model, messages, tokens, temp)
                : buildChatRequestBody(api.model, messages, tokens, temp, options?.disableThinking, api.provider, stream);
            return JSON.stringify(reqBody);
        };
        let body = buildBody(maxTokensUsed, streamMode);
        const attempts = this.buildTransportAttempts(api.id, preferProxy, connectTimeoutMs, readTimeoutMs);
        const hasSticky = this.stickyTransportByApi.has(api.id);
        let lastErr = '';
        let usedProxy = preferProxy;
        for (let i = 0; i < attempts.length; i++) {
            if (this.chatCancelRequested) {
                return {
                    success: false,
                    errCode: ErrCode.ERR_ASYNC_CANCEL,
                    error: 'cancelled'
                };
            }
            const opt = attempts[i];
            if (i > 0 && opt.usingProxy === attempts[i - 1].usingProxy &&
                opt.usePublicDns === attempts[i - 1].usePublicDns) {
                continue;
            }
            usedProxy = opt.usingProxy;
            Logger.info(INSTR_TRACE_TAG, `[AI_API] HTTP attempt#${i + 1} id=${api.id} usingProxy=${opt.usingProxy}` +
                ` publicDns=${opt.usePublicDns}`);
            const attempt = await this.executeHttpPostWithStickyRetry(api.id, url, headers, body, opt, i, hasSticky, '', streamMode);
            if (this.chatCancelRequested ||
                (attempt.error ?? '').indexOf('cancelled') >= 0) {
                return {
                    success: false,
                    errCode: ErrCode.ERR_ASYNC_CANCEL,
                    error: 'cancelled'
                };
            }
            if (attempt.success && attempt.data !== undefined) {
                this.networkFailCount = 0;
                this.transportFailCountByApi.delete(api.id);
                this.rememberStickyTransport(api.id, opt);
                const parsed = this.parseChatHttpSuccess(api, attempt.data);
                if (parsed.success) {
                    return parsed;
                }
                // HTTP 200 但正文不合格（whitespace/非 JSON/SSE 空）：多为代理/网关
                // 掐断长请求的伪装形态 —— 继续下一传输档，全部失败再计连续失败
                lastErr = parsed.error ?? 'empty body';
                Logger.warn(INSTR_TRACE_TAG, `[AI_API] HTTP 200 bad body id=${api.id}: ${lastErr} — try next transport`);
                continue;
            }
            lastErr = attempt.error ?? 'unknown';
            Logger.warn(INSTR_TRACE_TAG, `[AI_API] HTTP attempt#${i + 1} FAIL id=${api.id}: ${lastErr}`);
            // 服务端 max_tokens 上限：自动降级到上限并继续下一档（不标记失败）
            if (lastErr.indexOf('API returned') >= 0) {
                const cap = parseMaxTokensLimitError(lastErr);
                if (cap > 0 && maxTokensUsed > cap) {
                    this.maxTokensCapByApi.set(api.id, cap);
                    maxTokensUsed = cap;
                    body = buildBody(cap, streamMode);
                    Logger.warn(INSTR_TRACE_TAG, `[AI_API] max_tokens capped ${maxTokens}→${cap} id=${api.id}` +
                        ` (server limit, retry lower)`);
                    continue;
                }
                // 流式不被网关支持（部分端点对 stream:true 直接 400）→ 自动降级非流式重试
                if (streamMode && lastErr.indexOf('API returned 400') >= 0) {
                    streamMode = false;
                    body = buildBody(maxTokensUsed, false);
                    Logger.warn(INSTR_TRACE_TAG, `[AI_API] stream 400 → fallback non-stream id=${api.id} (retry)`);
                    continue;
                }
            }
            // 业务错误（401/429 等）不再翻代理
            if (lastErr.indexOf('API returned') >= 0) {
                if (lastErr.indexOf('401') >= 0) {
                    const backupKey = this.encryptedKeys.get(`${api.id}_backup`);
                    if (backupKey) {
                        Logger.info(INSTR_TRACE_TAG, `[AI_API] retry with backup key id=${api.id}`);
                        return this.sendRequestWithKey(api, prompt, CryptoUtil.decrypt(backupKey), options);
                    }
                    this.failedApiIds.add(api.id);
                }
                else if (lastErr.indexOf('API returned 4') >= 0) {
                    this.failedApiIds.add(api.id);
                }
                break;
            }
            if (!isDnsOrHostResolveError(lastErr)) {
                // 非 DNS 传输错误：仍尝试下一档（代理翻转）一次
                continue;
            }
        }
        // 该 API 全传输档（代理/直连/DNS）均失败：连续计数，
        // 达阈值后标记 failed → 后续调用 FAILOVER/ROUND_ROBIN 切到其它 API。
        // 长请求经代理 2 分钟被掐断（如 agnes + 慢生成）属结构性故障，重试同一通道无益。
        this.networkFailCount++;
        const tFailN = (this.transportFailCountByApi.get(api.id) ?? 0) + 1;
        this.transportFailCountByApi.set(api.id, tFailN);
        if (tFailN >= AI_API_TRANSPORT_FAIL_FAILOVER) {
            this.failedApiIds.add(api.id);
            Logger.warn(INSTR_TRACE_TAG, `[AI_API] transport fail x${tFailN} → mark api failed id=${api.id}` +
                ` (failover for next call)`);
        }
        else {
            Logger.warn(INSTR_TRACE_TAG, `[AI_API] transport fail x${tFailN} id=${api.id} (next call still retries)`);
        }
        const policy = this.networkMode.handleNetworkFailure(this.networkFailCount);
        Logger.warn(INSTR_TRACE_TAG, `[AI_API] network policy failCount=${this.networkFailCount} action=${policy}`);
        if (policy === 'offline') {
            this.networkMode.setOfflineMode(true);
            return {
                success: false,
                error: humanizeHttpError(lastErr, usedProxy) + '（连续失败，已建议离线模式）'
            };
        }
        return {
            success: false,
            error: humanizeHttpError(lastErr, usedProxy)
        };
    }
    private async executeHttpPost(url: string, headers: Record<string, string>, body: string, opt: HttpTransportOpts, streamMode: boolean = false): Promise<Result<string>> {
        if (this.chatCancelRequested) {
            return { success: false, errCode: ErrCode.ERR_ASYNC_CANCEL, error: 'cancelled' };
        }
        if (streamMode) {
            return this.executeHttpPostStreaming(url, headers, body, opt);
        }
        let httpRequest: http.HttpRequest | null = null;
        try {
            httpRequest = http.createHttp();
            this.activeHttpRequests.push(httpRequest);
            const reqOptions: http.HttpRequestOptions = {
                method: http.RequestMethod.POST,
                header: headers,
                extraData: body,
                connectTimeout: opt.connectTimeoutMs,
                readTimeout: opt.readTimeoutMs,
                usingProxy: opt.usingProxy,
                // 长回复经代理时 HTTP/2 framing(2300016) 高发；强制 HTTP/1.1
                usingProtocol: http.HttpProtocol.HTTP1_1
            };
            if (opt.usePublicDns) {
                // API 11+：指定公共 DNS，缓解本机 DNS/代理劫持导致的 2300006
                (reqOptions as http.HttpRequestOptions).dnsServers = AI_PUBLIC_DNS_SERVERS;
            }
            const response = await httpRequest.request(url, reqOptions);
            if (this.chatCancelRequested) {
                return { success: false, errCode: ErrCode.ERR_ASYNC_CANCEL, error: 'cancelled' };
            }
            if (response.responseCode === 200) {
                const rawBody = responseBodyToString(response.result);
                return { success: true, data: rawBody };
            }
            const errBody = responseBodyToString(response.result);
            Logger.warn(INSTR_TRACE_TAG, `[AI_API] HTTP ${response.responseCode} bodyPreview=${errBody.substring(0, 160)}`);
            traceAiPayload('AI_API', 'REPLY_ERR', errBody, `code=${response.responseCode}`);
            // 带回错误体：500 的 max_tokens 超限提示需在 sendRequest 层解析并自动降级
            return { success: false, error: `API returned ${response.responseCode}: ${errBody.substring(0, 300)}` };
        }
        catch (e) {
            if (this.chatCancelRequested) {
                Logger.info(INSTR_TRACE_TAG, '[AI_API] HTTP aborted by user cancel');
                return { success: false, errCode: ErrCode.ERR_ASYNC_CANCEL, error: 'cancelled' };
            }
            const errMsg = formatCaughtError(e);
            Logger.error(INSTR_TRACE_TAG, `[AI_API] HTTP exception url=${url} proxy=${opt.usingProxy} dns=${opt.usePublicDns}: ${errMsg}`);
            return { success: false, error: `Request failed: ${errMsg}` };
        }
        finally {
            if (httpRequest !== null) {
                const idx = this.activeHttpRequests.indexOf(httpRequest);
                if (idx >= 0) {
                    this.activeHttpRequests.splice(idx, 1);
                }
                try {
                    httpRequest.destroy();
                }
                catch (_d) {
                    // ignore
                }
            }
        }
    }
    /**
     * SSE 流式请求（事件式读取）：dataReceive 逐片累积字节并粗判 content 是否开始；
     * watchdog 到点仍无 content（纯推理流）→ 主动断开，按空内容失败处理，
     * 避免 reasoning 占满 max_tokens 的模型一次请求耗 10+ 分钟再空手而归。
     */
    private async executeHttpPostStreaming(url: string, headers: Record<string, string>, body: string, opt: HttpTransportOpts): Promise<Result<string>> {
        if (this.chatCancelRequested) {
            return { success: false, errCode: ErrCode.ERR_ASYNC_CANCEL, error: 'cancelled' };
        }
        return new Promise<Result<string>>((resolve) => {
            let httpRequest: http.HttpRequest | null = null;
            let timer: number = -1;
            let settled = false;
            const chunks: ArrayBuffer[] = [];
            let sawContentField = false;
            let prevTail = '';
            const cleanup = (): void => {
                if (timer >= 0) {
                    clearTimeout(timer);
                    timer = -1;
                }
                if (httpRequest !== null) {
                    const idx = this.activeHttpRequests.indexOf(httpRequest);
                    if (idx >= 0) {
                        this.activeHttpRequests.splice(idx, 1);
                    }
                    try {
                        httpRequest.destroy();
                    }
                    catch (_d) {
                        // ignore
                    }
                }
            };
            const settle = (r: Result<string>): void => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                resolve(r);
            };
            try {
                httpRequest = http.createHttp();
                this.activeHttpRequests.push(httpRequest);
                const reqOptions: http.HttpRequestOptions = {
                    method: http.RequestMethod.POST,
                    header: headers,
                    extraData: body,
                    connectTimeout: opt.connectTimeoutMs,
                    readTimeout: opt.readTimeoutMs,
                    usingProxy: opt.usingProxy,
                    // 长回复经代理时 HTTP/2 framing(2300016) 高发；强制 HTTP/1.1
                    usingProtocol: http.HttpProtocol.HTTP1_1
                };
                if (opt.usePublicDns) {
                    (reqOptions as http.HttpRequestOptions).dnsServers = AI_PUBLIC_DNS_SERVERS;
                }
                httpRequest.on('dataReceive', (data: ArrayBuffer) => {
                    if (!data || data.byteLength <= 0) {
                        return;
                    }
                    chunks.push(data);
                    if (sawContentField) {
                        return;
                    }
                    // 粗判 content 是否开始（区分 reasoning_content：后者前缀是 _content 无引号）
                    const decoder = util.TextDecoder.create('utf-8', { ignoreBOM: true });
                    const cur = decoder.decode(new Uint8Array(data));
                    const probe = prevTail + cur;
                    if (probe.indexOf('"content"') >= 0) {
                        sawContentField = true;
                    }
                    else {
                        prevTail = cur.length > 24 ? cur.substring(cur.length - 24) : cur;
                    }
                });
                // watchdog：纯推理无正文到点即断
                timer = setTimeout(() => {
                    if (!sawContentField) {
                        Logger.warn(INSTR_TRACE_TAG, `[AI_API] SSE reasoning-only ${AI_SSE_REASONING_ONLY_TIMEOUT_MS / 1000}s no content` +
                            ` url=${url} proxy=${opt.usingProxy} — abort`);
                        settle({
                            success: false,
                            error: 'LLM returned empty content (stream, finish_reason=length, reasoning ate output)'
                        });
                    }
                }, AI_SSE_REASONING_ONLY_TIMEOUT_MS);
                httpRequest.request(url, reqOptions).then((resp) => {
                    if (settled) {
                        return;
                    }
                    if (this.chatCancelRequested) {
                        settle({ success: false, errCode: ErrCode.ERR_ASYNC_CANCEL, error: 'cancelled' });
                        return;
                    }
                    if (resp.responseCode === 200) {
                        const full = this.decodeSseChunks(chunks);
                        settle({ success: true, data: full });
                        return;
                    }
                    const errBody = responseBodyToString(resp.result);
                    Logger.warn(INSTR_TRACE_TAG, `[AI_API] HTTP ${resp.responseCode} bodyPreview=${errBody.substring(0, 160)}`);
                    // 带回错误体：500 的 max_tokens 超限提示需在 sendRequest 层解析并自动降级
                    settle({ success: false, error: `API returned ${resp.responseCode}: ${errBody.substring(0, 300)}` });
                }).catch((e: Object) => {
                    if (settled) {
                        return;
                    }
                    if (this.chatCancelRequested) {
                        settle({ success: false, errCode: ErrCode.ERR_ASYNC_CANCEL, error: 'cancelled' });
                        return;
                    }
                    const errMsg = formatCaughtError(e);
                    Logger.error(INSTR_TRACE_TAG, `[AI_API] HTTP exception url=${url} proxy=${opt.usingProxy} dns=${opt.usePublicDns}: ${errMsg}`);
                    settle({ success: false, error: `Request failed: ${errMsg}` });
                });
            }
            catch (e) {
                if (this.chatCancelRequested) {
                    settle({ success: false, errCode: ErrCode.ERR_ASYNC_CANCEL, error: 'cancelled' });
                    return;
                }
                const errMsg = formatCaughtError(e);
                Logger.error(INSTR_TRACE_TAG, `[AI_API] HTTP setup exception url=${url}: ${errMsg}`);
                settle({ success: false, error: `Request failed: ${errMsg}` });
            }
        });
    }
    private decodeSseChunks(chunks: ArrayBuffer[]): string {
        if (chunks.length === 0) {
            return '';
        }
        let total = 0;
        for (let i = 0; i < chunks.length; i++) {
            total += chunks[i].byteLength;
        }
        const merged = new Uint8Array(total);
        let off = 0;
        for (let i = 0; i < chunks.length; i++) {
            merged.set(new Uint8Array(chunks[i]), off);
            off += chunks[i].byteLength;
        }
        const decoder = util.TextDecoder.create('utf-8', { ignoreBOM: true });
        return decoder.decode(merged);
    }
    private parseChatHttpSuccess(api: AiApiConfig, rawBody: string): Result<string> {
        this.failedApiIds.delete(api.id);
        const trimmedBody = (rawBody ?? '').trim();
        if (trimmedBody.length === 0) {
            Logger.warn(INSTR_TRACE_TAG, `[AI_API] HTTP 200 id=${api.id} whitespace-only body`);
            return { success: false, error: 'LLM returned empty response body' };
        }
        // SSE 流式（api.stream=true 或正文本身是 data: 行）：逐片累积 delta.content。
        // 长生成经流式持续回包，绕开网关非流式响应上限与代理空闲掐断。
        if (api.stream === true || trimmedBody.indexOf('\ndata:') >= 0 ||
            trimmedBody.startsWith('data:') || trimmedBody.startsWith('event:')) {
            const sseContent = parseSseContent(trimmedBody);
            if (sseContent !== null) {
                if (sseContent.length > 0) {
                    Logger.info(INSTR_TRACE_TAG, `[AI_API] HTTP 200 id=${api.id} sse contentLen=${sseContent.length}`);
                    traceAiPayload('AI_API', 'REPLY', sseContent, `id=${api.id} stream=true`);
                    return { success: true, data: sseContent };
                }
                Logger.warn(INSTR_TRACE_TAG, `[AI_API] HTTP 200 id=${api.id} sse empty content (reasoning-only or error)`);
                // 消息含 finish_reason=length，使 isThinkingAteOutputError 命中：
                // 触发 nudge 重试 → 仍空则标记 failed 走 FAILOVER
                return {
                    success: false,
                    error: 'LLM returned empty content (stream, finish_reason=length, reasoning ate output)'
                };
            }
            // 不是合法 SSE：网关可能不支持 stream，落入常规 JSON 解析
            Logger.warn(INSTR_TRACE_TAG, `[AI_API] HTTP 200 id=${api.id} stream requested but body not SSE — fallback parse`);
        }
        try {
            if (api.provider === AiProviderType.CLAUDE) {
                const anth = JSON.parse(trimmedBody) as AnthropicMessagesResponse;
                const content = extractAnthropicText(anth);
                Logger.info(INSTR_TRACE_TAG, `[AI_API] HTTP 200 id=${api.id} anthropic contentLen=${content.length}`);
                traceAiPayload('AI_API', 'REPLY', content, `id=${api.id} model=${api.model}`);
                if (content.length === 0) {
                    const stop = anth.stop_reason ?? 'unknown';
                    return {
                        success: false,
                        error: `LLM returned empty content (stop_reason=${stop})`
                    };
                }
                return { success: true, data: content };
            }
            const parsed = JSON.parse(trimmedBody) as ChatCompletionResponse;
            if (parsed.choices && parsed.choices.length > 0) {
                const choice0 = parsed.choices[0];
                const content = extractChoiceContent(choice0);
                const rcRaw = choice0.message !== undefined && choice0.message !== null
                    ? (choice0.message.reasoning_content ?? '') : '';
                const rcLen = rcRaw.length;
                Logger.info(INSTR_TRACE_TAG, `[AI_API] HTTP 200 id=${api.id} contentLen=${content.length}` +
                    `${rcLen > 0 ? ` reasoningLen=${rcLen}` : ''}`);
                traceAiPayload('AI_API', 'REPLY', content, `id=${api.id} model=${api.model}`);
                if (content.length === 0) {
                    let finishReason = 'unknown';
                    const fr = choice0.finish_reason;
                    if (fr !== undefined && fr !== null && fr.length > 0) {
                        finishReason = fr;
                    }
                    Logger.warn(INSTR_TRACE_TAG, `[AI_API] HTTP 200 id=${api.id} empty content finish_reason=${finishReason}` +
                        ` reasoningLen=${rcLen}`);
                    return {
                        success: false,
                        error: `LLM returned empty content (finish_reason=${finishReason}` +
                            `${rcLen > 0 ? `, reasoningLen=${rcLen}` : ''})`
                    };
                }
                return { success: true, data: content };
            }
            // OpenAI 外壳但 choices 为空数组：禁止把整段 envelope 当模型正文
            if (Array.isArray(parsed.choices)) {
                Logger.warn(INSTR_TRACE_TAG, `[AI_API] HTTP 200 id=${api.id} ChatCompletion with empty/missing choices`);
                return { success: false, error: 'LLM non-JSON body (no choices)' };
            }
        }
        catch (_parseErr) {
            // fall through — 可能是裸 JSON 对象正文
        }
        // 仅当正文像 JSON 对象时才 raw 放行；散文/空壳拒绝
        if (trimmedBody.charAt(0) === '{') {
            Logger.info(INSTR_TRACE_TAG, `[AI_API] HTTP 200 id=${api.id} raw JSON body (no choices)`);
            traceAiPayload('AI_API', 'REPLY', trimmedBody, `id=${api.id} raw=true`);
            return { success: true, data: trimmedBody };
        }
        Logger.warn(INSTR_TRACE_TAG, `[AI_API] HTTP 200 id=${api.id} reject non-JSON raw body len=${trimmedBody.length}`);
        return { success: false, error: 'LLM non-JSON body (no choices)' };
    }
    private async sendRequestWithKey(api: AiApiConfig, prompt: string, apiKey: string, options?: ChatOptions): Promise<Result<string>> {
        const template = getTemplate(api.provider);
        const base = api.baseUrl.endsWith('/') ? api.baseUrl.substring(0, api.baseUrl.length - 1) : api.baseUrl;
        const url = `${base}${template?.chatPath ?? '/chat/completions'}`;
        Logger.info(INSTR_TRACE_TAG, `[AI_API] HTTP POST (backupKey) id=${api.id} url=${url} model=${api.model}` +
            ` promptLen=${prompt.length}`);
        traceAiPayload('AI_API', 'PROMPT', prompt, `id=${api.id} backupKey=true`);
        const maxTokens = this.resolveMaxTokens(api, options);
        const connectTimeoutMs = options?.connectTimeoutMs !== undefined
            ? options.connectTimeoutMs : AI_HTTP_CONNECT_TIMEOUT_MS;
        const readTimeoutMs = options?.readTimeoutMs !== undefined
            ? options.readTimeoutMs : AI_HTTP_READ_TIMEOUT_MS;
        const headers: Record<string, string> = buildRequestHeaders(apiKey, api.customHeaders, api.provider);
        const messages: ChatRequestMessage[] = [{ role: 'user', content: prompt }];
        const temp = options?.temperature ?? api.temperature;
        let streamMode = api.stream === true;
        const buildBody = (tokens: number, stream: boolean): string => {
            const reqBody = api.provider === AiProviderType.CLAUDE
                ? buildAnthropicMessagesBody(api.model, messages, tokens, temp)
                : buildChatRequestBody(api.model, messages, tokens, temp, options?.disableThinking, api.provider, stream);
            return JSON.stringify(reqBody);
        };
        let body = buildBody(maxTokens, streamMode);
        const preferProxy = this.shouldUseSystemProxy(api.id);
        const attempts = this.buildTransportAttempts(api.id, preferProxy, connectTimeoutMs, readTimeoutMs);
        const hasSticky = this.stickyTransportByApi.has(api.id);
        let lastErr = '';
        let usedProxy = preferProxy;
        for (let i = 0; i < attempts.length; i++) {
            const opt = attempts[i];
            if (i > 0 && opt.usingProxy === attempts[i - 1].usingProxy &&
                opt.usePublicDns === attempts[i - 1].usePublicDns) {
                continue;
            }
            usedProxy = opt.usingProxy;
            Logger.info(INSTR_TRACE_TAG, `[AI_API] HTTP attempt#${i + 1} (backupKey) id=${api.id} usingProxy=${opt.usingProxy}` +
                ` publicDns=${opt.usePublicDns}`);
            const attempt = await this.executeHttpPostWithStickyRetry(api.id, url, headers, body, opt, i, hasSticky, ' (backupKey)', streamMode);
            if (attempt.success && attempt.data !== undefined) {
                this.rememberStickyTransport(api.id, opt);
                const parsed = this.parseChatHttpSuccess(api, attempt.data);
                if (parsed.success) {
                    return parsed;
                }
                // HTTP 200 但正文不合格：继续下一传输档（同主路径）
                lastErr = parsed.error ?? 'empty body';
                Logger.warn(INSTR_TRACE_TAG, `[AI_API] HTTP 200 bad body (backupKey) id=${api.id}: ${lastErr} — try next transport`);
                continue;
            }
            lastErr = attempt.error ?? 'unknown';
            if (lastErr.indexOf('API returned') >= 0) {
                // 流式不被网关支持 → 自动降级非流式重试（同主路径）
                if (streamMode && lastErr.indexOf('API returned 400') >= 0) {
                    streamMode = false;
                    body = buildBody(maxTokens, false);
                    Logger.warn(INSTR_TRACE_TAG, `[AI_API] stream 400 → fallback non-stream (backupKey) id=${api.id} (retry)`);
                    continue;
                }
                break;
            }
        }
        return { success: false, error: humanizeHttpError(lastErr, usedProxy) };
    }
    /** 用户配置了全局代理时启用 HTTP 系统代理（鸿蒙应用默认不走系统代理） */
    private shouldUseSystemProxy(apiId: string): boolean {
        const cfg = this.networkMode.getConfig();
        if (cfg.offlineMode) {
            return false;
        }
        if (cfg.systemProxy || cfg.globalProxy.trim().length > 0) {
            return true;
        }
        const effective = this.networkMode.getEffectiveProxy(apiId);
        return effective.length > 0 && effective !== 'system';
    }
    private selectApi(capability?: string): AiApiConfig | null {
        let enabled = Array.from(this.apis.values()).filter(a => a.enabled && !this.failedApiIds.has(a.id));
        if (!this.networkMode.shouldAllowCloudApi()) {
            enabled = enabled.filter(a => a.provider === AiProviderType.OLLAMA);
        }
        if (enabled.length === 0)
            return null;
        if (this.strategy === LoadBalanceMode.CAPABILITY_BINDING && capability) {
            for (let i = 0; i < enabled.length; i++) {
                const api = enabled[i];
                if (api.capabilityBinding && api.capabilityBinding[capability]) {
                    const bound = this.apis.get(api.capabilityBinding[capability]);
                    if (bound?.enabled)
                        return bound;
                }
            }
        }
        if (this.strategy === LoadBalanceMode.SINGLE_DEFAULT && this.defaultApiId) {
            const def = this.apis.get(this.defaultApiId);
            if (def?.enabled)
                return def;
        }
        switch (this.strategy) {
            case LoadBalanceMode.ROUND_ROBIN: {
                const api = enabled[this.roundRobinIndex % enabled.length];
                this.roundRobinIndex++;
                return api;
            }
            case LoadBalanceMode.FAILOVER:
            case LoadBalanceMode.PRIORITY:
            default:
                enabled.sort((a, b) => a.priority - b.priority);
                return enabled[0];
        }
    }
    private getDecryptedKey(id: string): string {
        const enc = this.encryptedKeys.get(id);
        if (enc)
            return CryptoUtil.decrypt(enc);
        const api = this.apis.get(id);
        return api?.apiKey ?? '';
    }
}
/** AiTaskType → AiCapability 字符串（与 capabilityBinding 键一致） */
function taskTypeToCapability(taskType: AiTaskType): string | undefined {
    switch (taskType) {
        case AiTaskType.TASK_AUTO_ROUTE_GLOBAL:
        case AiTaskType.TASK_AUTO_ROUTE_SELECT:
        case AiTaskType.TASK_ROUTE_OPTIMIZE:
        case AiTaskType.TASK_LAYOUT_PLACE:
            return AiCapability.AUTO_WIRING;
        case AiTaskType.TASK_CIRCUIT_DIAG_STATIC:
        case AiTaskType.TASK_CIRCUIT_DIAG_DYNAMIC:
            return AiCapability.FAULT_DIAGNOSIS;
        case AiTaskType.TASK_GEN_SCH_FULL:
        case AiTaskType.TASK_GEN_SUB_CIRCUIT:
        case AiTaskType.TASK_FULL_PIPELINE:
            return AiCapability.CIRCUIT_GENERATION;
        case AiTaskType.TASK_WAVE_ANALYZE:
            return AiCapability.WAVEFORM_ANALYSIS;
        case AiTaskType.TASK_COMPONENT_REC:
        case AiTaskType.TASK_COMPONENT_REPLACE:
        case AiTaskType.TASK_BOM_OPTIMIZE:
        case AiTaskType.TASK_DEVICE_SELECT:
            return AiCapability.COMPONENT_RECOMMEND;
        default:
            return undefined;
    }
}
