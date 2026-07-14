import type { IAiApiManager, ChatOptions } from './api/IAiApiManager';
import { PROVIDER_TEMPLATES, CIRCUIT_TEST_PROMPT, getTemplate } from "@bundle:com.elecdraw.aischsim/entry@ai_api_manager/ets/config/ProviderTemplates";
import { AiProviderType, LoadBalanceMode, ApiConnectionStatus, CryptoUtil, IdUtil, ErrCode, ResultHelper, FeatureGate, AiContextSanitizer } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { AiApiConfig, AiCapability, Result, AiTaskType, AiTestResult, ApiResult, UsageDashboard } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { QuotaTracker } from "@bundle:com.elecdraw.aischsim/entry@ai_api_manager/ets/billing/QuotaTracker";
import http from "@ohos:net.http";
import { NetworkModeManager } from "@bundle:com.elecdraw.aischsim/entry@ai_api_manager/ets/NetworkModeManager";
import { buildRequestHeaders, cloneAiApiConfig, getFirstBoundCapabilityId, maskApiConfig, mergeAiApiConfig } from "@bundle:com.elecdraw.aischsim/entry@ai_api_manager/ets/internal/AiApiTypes";
import type { AiApiConfigUpdate, ChatCompletionResponse, ChatRequestMessage } from "@bundle:com.elecdraw.aischsim/entry@ai_api_manager/ets/internal/AiApiTypes";
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
    getAllApiConfig(): AiApiConfig[] {
        return this.listApis();
    }
    getDefaultApi(): ApiResult<AiApiConfig> {
        if (!this.defaultApiId)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'No default API set');
        const x256 = this.getApi(this.defaultApiId);
        if (!x256.success || !x256.data)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, x256.error);
        return ResultHelper.ok(x256.data);
    }
    async testApiConnect(s256: string): Promise<AiTestResult> {
        const t256 = Date.now();
        const u256 = await this.testConnection(s256);
        const v256 = this.apis.get(s256);
        let w256 = ErrCode.OK;
        if (!u256.success) {
            if (u256.error?.includes('401'))
                w256 = ErrCode.ERR_API_AUTH;
            else if (u256.error?.includes('429'))
                w256 = ErrCode.ERR_API_LIMIT;
            else if (u256.error?.includes('timeout'))
                w256 = ErrCode.ERR_API_TIMEOUT;
            else
                w256 = ErrCode.ERR_API_TIMEOUT;
        }
        return {
            success: u256.success,
            errCode: w256,
            latencyMs: Date.now() - t256,
            modelResponse: u256.data ? 'OK' : (u256.error ?? ''),
            remainingQuota: v256?.dailyCallCount !== undefined ? `${1000 - (v256.dailyCallCount ?? 0)}` : 'unknown'
        };
    }
    getAvailableApiForTask(h256: AiTaskType): ApiResult<AiApiConfig> {
        if (!this.networkMode.shouldAllowCloudApi()) {
            const q256 = Array.from(this.apis.values()).find(r256 => r256.enabled && r256.provider === AiProviderType.OLLAMA);
            if (q256)
                return ResultHelper.ok(maskApiConfig(q256));
            return ResultHelper.fail(ErrCode.ERR_API_TIMEOUT, '离线模式：仅本地 Ollama 可用');
        }
        const i256 = `task_${h256}`;
        const j256 = Array.from(this.apis.values()).filter(p256 => p256.enabled && !this.failedApiIds.has(p256.id));
        for (let l256 = 0; l256 < j256.length; l256++) {
            const m256 = j256[l256];
            if (m256.taskBind && m256.taskBind[i256]) {
                return ResultHelper.ok(maskApiConfig(m256));
            }
            if (m256.capabilityBinding) {
                const n256 = getFirstBoundCapabilityId(m256.capabilityBinding);
                if (n256) {
                    const o256 = this.apis.get(n256);
                    if (o256)
                        return ResultHelper.ok(maskApiConfig(o256));
                }
            }
        }
        if (this.defaultApiId) {
            const k256 = this.getApi(this.defaultApiId);
            if (k256.success && k256.data)
                return ResultHelper.ok(k256.data);
        }
        if (j256.length > 0)
            return ResultHelper.ok(maskApiConfig(j256[0]));
        return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'No API available for task');
    }
    getFallbackApi(c256: string): ApiResult<AiApiConfig> {
        const d256 = Array.from(this.apis.values())
            .filter(g256 => g256.enabled && g256.id !== c256 && !this.failedApiIds.has(g256.id));
        d256.sort((e256, f256) => e256.priority - f256.priority);
        if (d256.length === 0)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'No fallback API');
        return ResultHelper.ok(maskApiConfig(d256[0]));
    }
    recordApiCall(x255: string, y255: number = 0): void {
        this.resetDailyCountsIfNeeded();
        const z255 = (this.dailyCallCounts.get(x255) ?? 0) + 1;
        this.dailyCallCounts.set(x255, z255);
        const a256 = this.apis.get(x255);
        const b256 = a256?.name ?? x255;
        this.quotaTracker.recordCall(x255, b256, y255);
        if (a256) {
            a256.dailyCallCount = z255;
            this.apis.set(x255, a256);
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
    getDailyCallCount(w255: string): number {
        this.resetDailyCountsIfNeeded();
        return this.dailyCallCounts.get(w255) ?? 0;
    }
    private resetDailyCountsIfNeeded(): void {
        const v255 = new Date().toISOString().substring(0, 10);
        if (this.lastCallDate !== v255) {
            this.dailyCallCounts.clear();
            this.lastCallDate = v255;
        }
    }
    addApi(s255: AiApiConfig): Result<void> {
        if (this.apis.has(s255.id))
            return { success: false, error: 'API ID already exists' };
        const t255 = FeatureGate.canAddAiApi(this.apis.size);
        if (!t255.success) {
            return { success: false, errCode: t255.errCode, error: t255.error };
        }
        const u255 = cloneAiApiConfig(s255);
        if (s255.apiKey && s255.apiKey !== '***') {
            this.encryptedKeys.set(s255.id, CryptoUtil.encryptWithHuks(s255.apiKey));
            if (s255.backupApiKey) {
                this.encryptedKeys.set(`${s255.id}_backup`, CryptoUtil.encryptWithHuks(s255.backupApiKey));
            }
        }
        this.apis.set(s255.id, u255);
        if (!this.defaultApiId && s255.enabled)
            this.defaultApiId = s255.id;
        return { success: true };
    }
    removeApi(r255: string): Result<void> {
        if (!this.apis.delete(r255))
            return { success: false, error: 'API not found' };
        this.encryptedKeys.delete(r255);
        this.encryptedKeys.delete(`${r255}_backup`);
        if (this.defaultApiId === r255)
            this.defaultApiId = '';
        return { success: true };
    }
    updateApi(n255: string, o255: AiApiConfigUpdate): Result<void> {
        const p255 = this.apis.get(n255);
        if (!p255)
            return { success: false, error: 'API not found' };
        if (o255.apiKey && o255.apiKey !== '***') {
            this.encryptedKeys.set(n255, CryptoUtil.encryptWithHuks(o255.apiKey));
        }
        if (o255.backupApiKey) {
            this.encryptedKeys.set(`${n255}_backup`, CryptoUtil.encryptWithHuks(o255.backupApiKey));
        }
        const q255 = mergeAiApiConfig(p255, o255);
        this.apis.set(n255, q255);
        return { success: true };
    }
    getApi(l255: string): Result<AiApiConfig> {
        const m255 = this.apis.get(l255);
        if (!m255)
            return { success: false, error: 'API not found' };
        return { success: true, data: maskApiConfig(m255) };
    }
    listApis(): AiApiConfig[] {
        return Array.from(this.apis.values()).map(k255 => maskApiConfig(k255));
    }
    enableApi(j255: string): Result<void> { return this.updateApi(j255, { enabled: true }); }
    disableApi(i255: string): Result<void> { return this.updateApi(i255, { enabled: false }); }
    batchEnable(f255: string[]): Result<number> {
        let g255 = 0;
        for (let h255 = 0; h255 < f255.length; h255++) {
            if (this.enableApi(f255[h255]).success)
                g255++;
        }
        return { success: true, data: g255 };
    }
    batchDisable(c255: string[]): Result<number> {
        let d255 = 0;
        for (let e255 = 0; e255 < c255.length; e255++) {
            if (this.disableApi(c255[e255]).success)
                d255++;
        }
        return { success: true, data: d255 };
    }
    batchRemove(z254: string[]): Result<number> {
        let a255 = 0;
        for (let b255 = 0; b255 < z254.length; b255++) {
            if (this.removeApi(z254[b255]).success)
                a255++;
        }
        return { success: true, data: a255 };
    }
    setDefaultApi(y254: string): Result<void> {
        if (!this.apis.has(y254))
            return { success: false, error: 'API not found' };
        this.defaultApiId = y254;
        return { success: true };
    }
    async testConnection(u254: string): Promise<Result<boolean>> {
        const v254 = this.apis.get(u254);
        if (!v254)
            return { success: false, error: 'API not found' };
        const w254 = await this.sendRequest(v254, CIRCUIT_TEST_PROMPT, { maxTokens: 50 });
        const x254 = w254.success ? ApiConnectionStatus.OK :
            (w254.error?.includes('401') ? ApiConnectionStatus.AUTH_ERROR :
                w254.error?.includes('429') ? ApiConnectionStatus.RATE_LIMIT :
                    w254.error?.includes('timeout') ? ApiConnectionStatus.TIMEOUT :
                        ApiConnectionStatus.NETWORK_ERROR);
        this.updateApi(u254, { lastStatus: x254, lastTestedAt: new Date().toISOString() });
        return { success: w254.success, data: w254.success, error: w254.error };
    }
    async chat(o254: string, p254?: ChatOptions): Promise<Result<string>> {
        const q254 = AiContextSanitizer.sanitizePrompt(o254);
        const r254 = this.selectApi(p254?.capability);
        if (!r254)
            return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: 'No enabled AI API configured' };
        const s254 = this.quotaTracker.checkBeforeCall(r254.id, r254.name);
        if (!s254.success) {
            return { success: false, errCode: s254.errCode, error: s254.error };
        }
        const t254 = await this.sendRequest(r254, q254, p254);
        if (t254.success)
            this.recordApiCall(r254.id);
        return t254;
    }
    exportConfigs(j254: boolean = true): Result<string> {
        const k254: AiApiConfig[] = [];
        this.apis.forEach((l254: AiApiConfig) => {
            const m254 = cloneAiApiConfig(l254);
            if (j254) {
                m254.apiKey = '***';
                m254.backupApiKey = m254.backupApiKey ? '***' : undefined;
            }
            else {
                const n254 = this.encryptedKeys.get(l254.id);
                if (n254)
                    m254.apiKey = CryptoUtil.decrypt(n254);
            }
            k254.push(m254);
        });
        return { success: true, data: JSON.stringify(k254, null, 2) };
    }
    importConfigs(d254: string): Result<number> {
        try {
            const f254 = JSON.parse(d254) as AiApiConfig[];
            let g254 = 0;
            for (let h254 = 0; h254 < f254.length; h254++) {
                const i254 = f254[h254];
                if (!i254.id)
                    i254.id = IdUtil.generate('api');
                this.addApi(i254);
                g254++;
            }
            return { success: true, data: g254 };
        }
        catch (e254) {
            return { success: false, error: `Invalid JSON: ${e254}` };
        }
    }
    clearAllConfigs(): Result<void> {
        this.apis.clear();
        this.encryptedKeys.clear();
        this.defaultApiId = '';
        this.failedApiIds.clear();
        return { success: true };
    }
    getSupportedProviders(): AiProviderType[] {
        return PROVIDER_TEMPLATES.map(c254 => c254.provider);
    }
    getProviderTemplates() { return PROVIDER_TEMPLATES; }
    createFromTemplate(y253: AiProviderType, z253: string): Result<AiApiConfig> {
        const a254 = getTemplate(y253);
        if (!a254)
            return { success: false, error: 'Unknown provider' };
        const b254: AiApiConfig = {
            id: IdUtil.generate('api'),
            name: z253,
            provider: y253,
            baseUrl: a254.defaultBaseUrl,
            apiKey: '',
            model: a254.defaultModel,
            enabled: true,
            priority: 10,
            maxTokens: 4096,
            temperature: 0.7,
            contextLimit: 128000
        };
        return { success: true, data: b254 };
    }
    setLoadBalanceStrategy(x253: LoadBalanceMode): void {
        this.strategy = x253;
    }
    bindCapability(q253: AiCapability, r253: string): Result<void> {
        const s253 = this.apis.get(r253);
        if (!s253)
            return { success: false, error: 'API not found' };
        const t253: Record<string, string> = {};
        if (s253.capabilityBinding) {
            const u253 = Object.keys(s253.capabilityBinding);
            for (let v253 = 0; v253 < u253.length; v253++) {
                const w253 = u253[v253];
                t253[w253] = s253.capabilityBinding[w253];
            }
        }
        t253[q253] = r253;
        return this.updateApi(r253, { capabilityBinding: t253 });
    }
    private async sendRequest(b253: AiApiConfig, c253: string, d253?: ChatOptions): Promise<Result<string>> {
        const e253 = this.getDecryptedKey(b253.id);
        const f253 = getTemplate(b253.provider);
        const g253 = f253?.chatPath ?? '/chat/completions';
        const h253 = `${b253.baseUrl}${g253}`;
        try {
            const j253 = http.createHttp();
            const k253: Record<string, string> = buildRequestHeaders(e253, b253.customHeaders);
            const l253: ChatRequestMessage[] = [{ role: 'user', content: c253 }];
            const m253 = JSON.stringify({
                model: b253.model,
                messages: l253,
                max_tokens: d253?.maxTokens ?? b253.maxTokens,
                temperature: d253?.temperature ?? b253.temperature
            });
            const n253 = await j253.request(h253, {
                method: http.RequestMethod.POST,
                header: k253,
                extraData: m253,
                connectTimeout: 10000,
                readTimeout: 60000
            });
            j253.destroy();
            if (n253.responseCode === 200) {
                this.failedApiIds.delete(b253.id);
                const p253 = JSON.parse(n253.result as string) as ChatCompletionResponse;
                if (p253.choices && p253.choices.length > 0) {
                    return { success: true, data: p253.choices[0].message.content };
                }
                return { success: true, data: n253.result as string };
            }
            if (n253.responseCode === 401) {
                const o253 = this.encryptedKeys.get(`${b253.id}_backup`);
                if (o253) {
                    return this.sendRequestWithKey(b253, c253, CryptoUtil.decrypt(o253), d253);
                }
            }
            this.failedApiIds.add(b253.id);
            return { success: false, error: `API returned ${n253.responseCode}` };
        }
        catch (i253) {
            this.failedApiIds.add(b253.id);
            return { success: false, error: `Request failed: ${i253}` };
        }
    }
    private async sendRequestWithKey(n252: AiApiConfig, o252: string, p252: string, q252?: ChatOptions): Promise<Result<string>> {
        const r252 = getTemplate(n252.provider);
        const s252 = `${n252.baseUrl}${r252?.chatPath ?? '/chat/completions'}`;
        try {
            const u252 = http.createHttp();
            const v252: Record<string, string> = buildRequestHeaders(p252, n252.customHeaders);
            const w252: ChatRequestMessage[] = [{ role: 'user', content: o252 }];
            const x252 = JSON.stringify({
                model: n252.model,
                messages: w252,
                max_tokens: q252?.maxTokens ?? n252.maxTokens,
                temperature: q252?.temperature ?? n252.temperature
            });
            const y252 = await u252.request(s252, {
                method: http.RequestMethod.POST,
                header: v252,
                extraData: x252,
                connectTimeout: 10000,
                readTimeout: 60000
            });
            u252.destroy();
            if (y252.responseCode === 200) {
                const z252 = JSON.parse(y252.result as string) as ChatCompletionResponse;
                const a253 = z252.choices;
                if (a253 && a253.length > 0) {
                    return { success: true, data: a253[0].message.content };
                }
                return { success: false, error: 'Empty response' };
            }
            return { success: false, error: `Backup key failed: ${y252.responseCode}` };
        }
        catch (t252) {
            return { success: false, error: `Backup request failed: ${t252}` };
        }
    }
    private selectApi(d252?: string): AiApiConfig | null {
        const e252 = Array.from(this.apis.values()).filter(m252 => m252.enabled && !this.failedApiIds.has(m252.id));
        if (e252.length === 0)
            return null;
        if (this.strategy === LoadBalanceMode.CAPABILITY_BINDING && d252) {
            for (let j252 = 0; j252 < e252.length; j252++) {
                const k252 = e252[j252];
                if (k252.capabilityBinding && k252.capabilityBinding[d252]) {
                    const l252 = this.apis.get(k252.capabilityBinding[d252]);
                    if (l252?.enabled)
                        return l252;
                }
            }
        }
        if (this.strategy === LoadBalanceMode.SINGLE_DEFAULT && this.defaultApiId) {
            const i252 = this.apis.get(this.defaultApiId);
            if (i252?.enabled)
                return i252;
        }
        switch (this.strategy) {
            case LoadBalanceMode.ROUND_ROBIN: {
                const h252 = e252[this.roundRobinIndex % e252.length];
                this.roundRobinIndex++;
                return h252;
            }
            case LoadBalanceMode.FAILOVER:
            case LoadBalanceMode.PRIORITY:
            default:
                e252.sort((f252, g252) => f252.priority - g252.priority);
                return e252[0];
        }
    }
    private getDecryptedKey(a252: string): string {
        const b252 = this.encryptedKeys.get(a252);
        if (b252)
            return CryptoUtil.decrypt(b252);
        const c252 = this.apis.get(a252);
        return c252?.apiKey ?? '';
    }
}
