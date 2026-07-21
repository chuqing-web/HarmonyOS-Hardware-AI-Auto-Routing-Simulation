import type { IAiApiManager, ChatOptions } from './api/IAiApiManager';
import { PROVIDER_TEMPLATES, CIRCUIT_TEST_PROMPT, getTemplate } from "@bundle:com.elecdraw.aischsim/entry@ai_api_manager/ets/config/ProviderTemplates";
import { AiProviderType, AiCapability, LoadBalanceMode, ApiConnectionStatus, CryptoUtil, IdUtil, AiTaskType, ErrCode, ResultHelper, FeatureGate, AiContextSanitizer, Logger, INSTR_TRACE_TAG, traceAiPayload, traceAiOp } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { AiApiConfig, Result, AiTestResult, ApiResult, UsageDashboard } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { QuotaTracker } from "@bundle:com.elecdraw.aischsim/entry@ai_api_manager/ets/billing/QuotaTracker";
import http from "@ohos:net.http";
import { NetworkModeManager } from "@bundle:com.elecdraw.aischsim/entry@ai_api_manager/ets/NetworkModeManager";
import { buildChatRequestBody, buildAnthropicMessagesBody, buildRequestHeaders, cloneAiApiConfig, extractChoiceContent, extractAnthropicText, getBoundApiIdForCapability, maskApiConfig, mergeAiApiConfig } from "@bundle:com.elecdraw.aischsim/entry@ai_api_manager/ets/internal/AiApiTypes";
import type { AiApiConfigUpdate, ChatCompletionResponse, ChatRequestMessage, AnthropicMessagesResponse } from "@bundle:com.elecdraw.aischsim/entry@ai_api_manager/ets/internal/AiApiTypes";
/** 流水线输出上限；配合 disableThinking，避免推理占满额度 */
const DEFAULT_MAX_OUTPUT_TOKENS = 65536;
/** 复杂原理图 LLM 单次回复可能极慢（深推理/长 JSON）。 */
const AI_HTTP_CONNECT_TIMEOUT_MS = 120000;
const AI_HTTP_READ_TIMEOUT_MS = 1800000;
/** 连接测试用短超时，避免 DNS/代理失败时干等 */
const AI_HTTP_TEST_CONNECT_TIMEOUT_MS = 20000;
const AI_HTTP_TEST_READ_TIMEOUT_MS = 60000;
/** 公共 DNS（直连 DNS 失败时兜底） */
const AI_PUBLIC_DNS_SERVERS: string[] = ['223.5.5.5', '119.29.29.29', '8.8.8.8'];
interface HttpTransportOpts {
    usingProxy: boolean;
    usePublicDns: boolean;
    connectTimeoutMs: number;
    readTimeoutMs: number;
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
    if (errMsg.toLowerCase().indexOf('timeout') >= 0 || errMsg.indexOf('2300029') >= 0) {
        return '请求超时：网络过慢或服务无响应，请检查代理/网络后重试';
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
    private dailyCallCounts: Map<string, number> = new Map();
    private lastCallDate: string = '';
    private quotaTracker: QuotaTracker = QuotaTracker.getInstance();
    readonly networkMode: NetworkModeManager = new NetworkModeManager();
    private networkFailCount: number = 0;
    /** 用户取消：中止 in-flight HTTP，并阻止重试 */
    private chatCancelRequested: boolean = false;
    private activeHttpRequests: http.HttpRequest[] = [];
    // ---- v2 API ----
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
        if (this.apis.has(config.id)) {
            Logger.warn(INSTR_TRACE_TAG, `[AI_API] addApi REJECT duplicate id=${config.id}`);
            return { success: false, error: 'API ID already exists' };
        }
        const gate = FeatureGate.canAddAiApi(this.apis.size);
        if (!gate.success) {
            Logger.warn(INSTR_TRACE_TAG, `[AI_API] addApi REJECT gate: ${gate.error}`);
            return { success: false, errCode: gate.errCode, error: gate.error };
        }
        const stored = cloneAiApiConfig(config);
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
        if (!this.defaultApiId && config.enabled)
            this.defaultApiId = config.id;
        Logger.info(INSTR_TRACE_TAG, `[AI_API] addApi OK id=${config.id} name=${config.name}` +
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
        if (this.defaultApiId === id)
            this.defaultApiId = '';
        return { success: true };
    }
    updateApi(id: string, updates: AiApiConfigUpdate): Result<void> {
        const existing = this.apis.get(id);
        if (!existing)
            return { success: false, error: 'API not found' };
        if (updates.apiKey && updates.apiKey !== '***') {
            this.encryptedKeys.set(id, CryptoUtil.encryptWithHuks(updates.apiKey));
            this.failedApiIds.delete(id);
        }
        if (updates.backupApiKey) {
            this.encryptedKeys.set(`${id}_backup`, CryptoUtil.encryptWithHuks(updates.backupApiKey));
            this.failedApiIds.delete(id);
        }
        const updated = mergeAiApiConfig(existing, updates);
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
        Logger.info(INSTR_TRACE_TAG, `[AI_API] testConnection START id=${id} name=${api.name}` +
            ` provider=${api.provider} model=${api.model} url=${api.baseUrl}` +
            ` preferProxy=${this.shouldUseSystemProxy(api.id)}`);
        const result = await this.sendRequest(api, CIRCUIT_TEST_PROMPT, {
            maxTokens: 50,
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
        if (this.chatCancelRequested) {
            return {
                success: false,
                errCode: ErrCode.ERR_ASYNC_CANCEL,
                error: 'cancelled'
            };
        }
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
        const result = await this.sendRequest(api, safePrompt, options);
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
                const enc = this.encryptedKeys.get(api.id);
                if (enc) {
                    copy.apiKey = CryptoUtil.decrypt(enc);
                }
                const encBak = this.encryptedKeys.get(`${api.id}_backup`);
                if (encBak) {
                    copy.backupApiKey = CryptoUtil.decrypt(encBak);
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
        Logger.warn(INSTR_TRACE_TAG, `[AI_API] clearAllConfigs wiping in-memory manager (count=${this.apis.size})`);
        this.apis.clear();
        this.encryptedKeys.clear();
        this.defaultApiId = '';
        this.failedApiIds.clear();
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
        if (options?.maxTokens !== undefined) {
            return options.maxTokens;
        }
        return api.maxTokens >= DEFAULT_MAX_OUTPUT_TOKENS ? api.maxTokens : DEFAULT_MAX_OUTPUT_TOKENS;
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
        const reqBody = api.provider === AiProviderType.CLAUDE
            ? buildAnthropicMessagesBody(api.model, messages, maxTokens, temp)
            : buildChatRequestBody(api.model, messages, maxTokens, temp, options?.disableThinking);
        const body = JSON.stringify(reqBody);
        // 本机系统 DNS 常失败：优先公共 DNS 直连，再回退代理/系统 DNS
        const attempts: HttpTransportOpts[] = [
            { usingProxy: false, usePublicDns: true, connectTimeoutMs, readTimeoutMs },
            { usingProxy: preferProxy, usePublicDns: false, connectTimeoutMs, readTimeoutMs },
            { usingProxy: !preferProxy, usePublicDns: false, connectTimeoutMs, readTimeoutMs }
        ];
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
            const attempt = await this.executeHttpPost(url, headers, body, opt);
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
                return this.parseChatHttpSuccess(api, attempt.data);
            }
            lastErr = attempt.error ?? 'unknown';
            Logger.warn(INSTR_TRACE_TAG, `[AI_API] HTTP attempt#${i + 1} FAIL id=${api.id}: ${lastErr}`);
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
        this.networkFailCount++;
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
    private async executeHttpPost(url: string, headers: Record<string, string>, body: string, opt: HttpTransportOpts): Promise<Result<string>> {
        if (this.chatCancelRequested) {
            return { success: false, errCode: ErrCode.ERR_ASYNC_CANCEL, error: 'cancelled' };
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
                usingProxy: opt.usingProxy
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
                const rawBody = typeof response.result === 'string'
                    ? response.result : `${response.result}`;
                return { success: true, data: rawBody };
            }
            const errBody = typeof response.result === 'string' ? response.result : `${response.result}`;
            Logger.warn(INSTR_TRACE_TAG, `[AI_API] HTTP ${response.responseCode} bodyPreview=${errBody.substring(0, 160)}`);
            traceAiPayload('AI_API', 'REPLY_ERR', errBody, `code=${response.responseCode}`);
            return { success: false, error: `API returned ${response.responseCode}` };
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
    private parseChatHttpSuccess(api: AiApiConfig, rawBody: string): Result<string> {
        this.failedApiIds.delete(api.id);
        try {
            if (api.provider === AiProviderType.CLAUDE) {
                const anth = JSON.parse(rawBody) as AnthropicMessagesResponse;
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
            const parsed = JSON.parse(rawBody) as ChatCompletionResponse;
            if (parsed.choices && parsed.choices.length > 0) {
                const content = extractChoiceContent(parsed.choices[0]);
                Logger.info(INSTR_TRACE_TAG, `[AI_API] HTTP 200 id=${api.id} contentLen=${content.length}`);
                traceAiPayload('AI_API', 'REPLY', content, `id=${api.id} model=${api.model}`);
                if (content.length === 0) {
                    let finishReason = 'unknown';
                    const fr = parsed.choices[0].finish_reason;
                    if (fr !== undefined && fr !== null && fr.length > 0) {
                        finishReason = fr;
                    }
                    Logger.warn(INSTR_TRACE_TAG, `[AI_API] HTTP 200 id=${api.id} empty content finish_reason=${finishReason}`);
                    return {
                        success: false,
                        error: `LLM returned empty content (finish_reason=${finishReason})`
                    };
                }
                return { success: true, data: content };
            }
        }
        catch (_parseErr) {
            // fall through
        }
        Logger.info(INSTR_TRACE_TAG, `[AI_API] HTTP 200 id=${api.id} raw body (no choices)`);
        traceAiPayload('AI_API', 'REPLY', rawBody, `id=${api.id} raw=true`);
        if (rawBody.length === 0) {
            return { success: false, error: 'LLM returned empty response body' };
        }
        return { success: true, data: rawBody };
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
        const reqBody = api.provider === AiProviderType.CLAUDE
            ? buildAnthropicMessagesBody(api.model, messages, maxTokens, temp)
            : buildChatRequestBody(api.model, messages, maxTokens, temp, options?.disableThinking);
        const body = JSON.stringify(reqBody);
        const preferProxy = this.shouldUseSystemProxy(api.id);
        const attempts: HttpTransportOpts[] = [
            { usingProxy: false, usePublicDns: true, connectTimeoutMs, readTimeoutMs },
            { usingProxy: preferProxy, usePublicDns: false, connectTimeoutMs, readTimeoutMs },
            { usingProxy: !preferProxy, usePublicDns: false, connectTimeoutMs, readTimeoutMs }
        ];
        let lastErr = '';
        let usedProxy = preferProxy;
        for (let i = 0; i < attempts.length; i++) {
            const opt = attempts[i];
            usedProxy = opt.usingProxy;
            const attempt = await this.executeHttpPost(url, headers, body, opt);
            if (attempt.success && attempt.data !== undefined) {
                return this.parseChatHttpSuccess(api, attempt.data);
            }
            lastErr = attempt.error ?? 'unknown';
            if (lastErr.indexOf('API returned') >= 0) {
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
