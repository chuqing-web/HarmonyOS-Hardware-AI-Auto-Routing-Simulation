/**
 * 模块6：多厂商AI API管理中心完整实现
 */
import { IAiApiManager, ChatOptions } from './api/IAiApiManager';
import { PROVIDER_TEMPLATES, CIRCUIT_TEST_PROMPT, getTemplate } from './config/ProviderTemplates';
import {
  AiApiConfig, AiProviderType, AiCapability, LoadBalanceMode,
  ApiConnectionStatus, Result, CryptoUtil, IdUtil,
  AiTaskType, AiTestResult, ApiResult, ErrCode, ResultHelper,
  FeatureGate, UsageDashboard, AiContextSanitizer
} from 'common';
import { QuotaTracker } from './billing/QuotaTracker';
import http from '@ohos.net.http';
import { NetworkModeManager } from './NetworkModeManager';
import {
  AiApiConfigUpdate, ChatCompletionResponse, ChatRequestMessage, buildRequestHeaders, cloneAiApiConfig,
  getFirstBoundCapabilityId, maskApiConfig, mergeAiApiConfig
} from './internal/AiApiTypes';

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

  // ---- v2 API ----

  getAllApiConfig(): AiApiConfig[] {
    return this.listApis();
  }

  getDefaultApi(): ApiResult<AiApiConfig> {
    if (!this.defaultApiId) return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'No default API set');
    const api = this.getApi(this.defaultApiId);
    if (!api.success || !api.data) return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, api.error);
    return ResultHelper.ok(api.data);
  }

  async testApiConnect(id: string): Promise<AiTestResult> {
    const start = Date.now();
    const result = await this.testConnection(id);
    const api = this.apis.get(id);
    let errCode = ErrCode.OK;
    if (!result.success) {
      if (result.error?.includes('401')) errCode = ErrCode.ERR_API_AUTH;
      else if (result.error?.includes('429')) errCode = ErrCode.ERR_API_LIMIT;
      else if (result.error?.includes('timeout')) errCode = ErrCode.ERR_API_TIMEOUT;
      else errCode = ErrCode.ERR_API_TIMEOUT;
    }
    return {
      success: result.success,
      errCode,
      latencyMs: Date.now() - start,
      modelResponse: result.data ? 'OK' : (result.error ?? ''),
      remainingQuota: api?.dailyCallCount !== undefined ? `${1000 - (api.dailyCallCount ?? 0)}` : 'unknown'
    };
  }

  getAvailableApiForTask(taskType: AiTaskType): ApiResult<AiApiConfig> {
    if (!this.networkMode.shouldAllowCloudApi()) {
      const local = Array.from(this.apis.values()).find(a =>
        a.enabled && a.provider === AiProviderType.OLLAMA);
      if (local) return ResultHelper.ok(maskApiConfig(local));
      return ResultHelper.fail(ErrCode.ERR_API_TIMEOUT, '离线模式：仅本地 Ollama 可用');
    }
    const taskKey = `task_${taskType}`;
    const enabled = Array.from(this.apis.values()).filter(a => a.enabled && !this.failedApiIds.has(a.id));
    for (let i = 0; i < enabled.length; i++) {
      const api = enabled[i];
      if (api.taskBind && api.taskBind[taskKey]) {
        return ResultHelper.ok(maskApiConfig(api));
      }
      if (api.capabilityBinding) {
        const bound = getFirstBoundCapabilityId(api.capabilityBinding);
        if (bound) {
          const b = this.apis.get(bound);
          if (b) return ResultHelper.ok(maskApiConfig(b));
        }
      }
    }
    if (this.defaultApiId) {
      const def = this.getApi(this.defaultApiId);
      if (def.success && def.data) return ResultHelper.ok(def.data);
    }
    if (enabled.length > 0) return ResultHelper.ok(maskApiConfig(enabled[0]));
    return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'No API available for task');
  }

  getFallbackApi(excludeId: string): ApiResult<AiApiConfig> {
    const enabled = Array.from(this.apis.values())
      .filter(a => a.enabled && a.id !== excludeId && !this.failedApiIds.has(a.id));
    enabled.sort((a, b) => a.priority - b.priority);
    if (enabled.length === 0) return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'No fallback API');
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
    if (this.apis.has(config.id)) return { success: false, error: 'API ID already exists' };
    const gate = FeatureGate.canAddAiApi(this.apis.size);
    if (!gate.success) {
      return { success: false, errCode: gate.errCode, error: gate.error };
    }
    const stored = cloneAiApiConfig(config);
    if (config.apiKey && config.apiKey !== '***') {
      this.encryptedKeys.set(config.id, CryptoUtil.encryptWithHuks(config.apiKey));
      if (config.backupApiKey) {
        this.encryptedKeys.set(`${config.id}_backup`, CryptoUtil.encryptWithHuks(config.backupApiKey));
      }
    }
    this.apis.set(config.id, stored);
    if (!this.defaultApiId && config.enabled) this.defaultApiId = config.id;
    return { success: true };
  }

  removeApi(id: string): Result<void> {
    if (!this.apis.delete(id)) return { success: false, error: 'API not found' };
    this.encryptedKeys.delete(id);
    this.encryptedKeys.delete(`${id}_backup`);
    if (this.defaultApiId === id) this.defaultApiId = '';
    return { success: true };
  }

  updateApi(id: string, updates: AiApiConfigUpdate): Result<void> {
    const existing = this.apis.get(id);
    if (!existing) return { success: false, error: 'API not found' };

    if (updates.apiKey && updates.apiKey !== '***') {
      this.encryptedKeys.set(id, CryptoUtil.encryptWithHuks(updates.apiKey));
    }
    if (updates.backupApiKey) {
      this.encryptedKeys.set(`${id}_backup`, CryptoUtil.encryptWithHuks(updates.backupApiKey));
    }

    const updated = mergeAiApiConfig(existing, updates);
    this.apis.set(id, updated);
    return { success: true };
  }

  getApi(id: string): Result<AiApiConfig> {
    const api = this.apis.get(id);
    if (!api) return { success: false, error: 'API not found' };
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
      if (this.enableApi(ids[i]).success) count++;
    }
    return { success: true, data: count };
  }

  batchDisable(ids: string[]): Result<number> {
    let count = 0;
    for (let i = 0; i < ids.length; i++) {
      if (this.disableApi(ids[i]).success) count++;
    }
    return { success: true, data: count };
  }

  batchRemove(ids: string[]): Result<number> {
    let count = 0;
    for (let i = 0; i < ids.length; i++) {
      if (this.removeApi(ids[i]).success) count++;
    }
    return { success: true, data: count };
  }

  setDefaultApi(id: string): Result<void> {
    if (!this.apis.has(id)) return { success: false, error: 'API not found' };
    this.defaultApiId = id;
    return { success: true };
  }

  async testConnection(id: string): Promise<Result<boolean>> {
    const api = this.apis.get(id);
    if (!api) return { success: false, error: 'API not found' };

    const result = await this.sendRequest(api, CIRCUIT_TEST_PROMPT, { maxTokens: 50 });
    const status = result.success ? ApiConnectionStatus.OK :
      (result.error?.includes('401') ? ApiConnectionStatus.AUTH_ERROR :
        result.error?.includes('429') ? ApiConnectionStatus.RATE_LIMIT :
          result.error?.includes('timeout') ? ApiConnectionStatus.TIMEOUT :
            ApiConnectionStatus.NETWORK_ERROR);

    this.updateApi(id, { lastStatus: status, lastTestedAt: new Date().toISOString() });
    return { success: result.success, data: result.success, error: result.error };
  }

  async chat(prompt: string, options?: ChatOptions): Promise<Result<string>> {
    const safePrompt = AiContextSanitizer.sanitizePrompt(prompt);
    const api = this.selectApi(options?.capability);
    if (!api) return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: 'No enabled AI API configured' };
    const quotaCheck = this.quotaTracker.checkBeforeCall(api.id, api.name);
    if (!quotaCheck.success) {
      return { success: false, errCode: quotaCheck.errCode, error: quotaCheck.error };
    }
    const result = await this.sendRequest(api, safePrompt, options);
    if (result.success) this.recordApiCall(api.id);
    return result;
  }

  exportConfigs(hideKeys: boolean = true): Result<string> {
    const configs: AiApiConfig[] = [];
    this.apis.forEach((api: AiApiConfig) => {
      const copy = cloneAiApiConfig(api);
      if (hideKeys) {
        copy.apiKey = '***';
        copy.backupApiKey = copy.backupApiKey ? '***' : undefined;
      } else {
        const enc = this.encryptedKeys.get(api.id);
        if (enc) copy.apiKey = CryptoUtil.decrypt(enc);
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
        if (!config.id) config.id = IdUtil.generate('api');
        this.addApi(config);
        count++;
      }
      return { success: true, data: count };
    } catch (e) {
      return { success: false, error: `Invalid JSON: ${e}` };
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
    return PROVIDER_TEMPLATES.map(t => t.provider);
  }

  getProviderTemplates() { return PROVIDER_TEMPLATES; }

  createFromTemplate(provider: AiProviderType, name: string): Result<AiApiConfig> {
    const template = getTemplate(provider);
    if (!template) return { success: false, error: 'Unknown provider' };
    const config: AiApiConfig = {
      id: IdUtil.generate('api'),
      name,
      provider,
      baseUrl: template.defaultBaseUrl,
      apiKey: '',
      model: template.defaultModel,
      enabled: true,
      priority: 10,
      maxTokens: 4096,
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
    if (!api) return { success: false, error: 'API not found' };
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

  private async sendRequest(api: AiApiConfig, prompt: string, options?: ChatOptions): Promise<Result<string>> {
    const apiKey = this.getDecryptedKey(api.id);
    const template = getTemplate(api.provider);
    const chatPath = template?.chatPath ?? '/chat/completions';
    const url = `${api.baseUrl}${chatPath}`;

    try {
      const httpRequest = http.createHttp();
      const headers: Record<string, string> = buildRequestHeaders(apiKey, api.customHeaders);

      const messages: ChatRequestMessage[] = [{ role: 'user', content: prompt }];
      const body = JSON.stringify({
        model: api.model,
        messages: messages,
        max_tokens: options?.maxTokens ?? api.maxTokens,
        temperature: options?.temperature ?? api.temperature
      });

      const response = await httpRequest.request(url, {
        method: http.RequestMethod.POST,
        header: headers,
        extraData: body,
        connectTimeout: 10000,
        readTimeout: 60000
      });
      httpRequest.destroy();

      if (response.responseCode === 200) {
        this.failedApiIds.delete(api.id);
        const parsed = JSON.parse(response.result as string) as ChatCompletionResponse;
        if (parsed.choices && parsed.choices.length > 0) {
          return { success: true, data: parsed.choices[0].message.content };
        }
        return { success: true, data: response.result as string };
      }

      if (response.responseCode === 401) {
        const backupKey = this.encryptedKeys.get(`${api.id}_backup`);
        if (backupKey) {
          return this.sendRequestWithKey(api, prompt, CryptoUtil.decrypt(backupKey), options);
        }
      }

      this.failedApiIds.add(api.id);
      return { success: false, error: `API returned ${response.responseCode}` };
    } catch (e) {
      this.failedApiIds.add(api.id);
      return { success: false, error: `Request failed: ${e}` };
    }
  }

  private async sendRequestWithKey(api: AiApiConfig, prompt: string, apiKey: string,
    options?: ChatOptions): Promise<Result<string>> {
    const template = getTemplate(api.provider);
    const url = `${api.baseUrl}${template?.chatPath ?? '/chat/completions'}`;
    try {
      const httpRequest = http.createHttp();
      const reqHeaders: Record<string, string> = buildRequestHeaders(apiKey, api.customHeaders);
      const messages: ChatRequestMessage[] = [{ role: 'user', content: prompt }];
      const body = JSON.stringify({
        model: api.model,
        messages: messages,
        max_tokens: options?.maxTokens ?? api.maxTokens,
        temperature: options?.temperature ?? api.temperature
      });
      const response = await httpRequest.request(url, {
        method: http.RequestMethod.POST,
        header: reqHeaders,
        extraData: body,
        connectTimeout: 10000,
        readTimeout: 60000
      });
      httpRequest.destroy();
      if (response.responseCode === 200) {
        const parsed = JSON.parse(response.result as string) as ChatCompletionResponse;
        const choices = parsed.choices;
        if (choices && choices.length > 0) {
          return { success: true, data: choices[0].message.content };
        }
        return { success: false, error: 'Empty response' };
      }
      return { success: false, error: `Backup key failed: ${response.responseCode}` };
    } catch (e) {
      return { success: false, error: `Backup request failed: ${e}` };
    }
  }

  private selectApi(capability?: string): AiApiConfig | null {
    const enabled = Array.from(this.apis.values()).filter(a => a.enabled && !this.failedApiIds.has(a.id));
    if (enabled.length === 0) return null;

    if (this.strategy === LoadBalanceMode.CAPABILITY_BINDING && capability) {
      for (let i = 0; i < enabled.length; i++) {
        const api = enabled[i];
        if (api.capabilityBinding && api.capabilityBinding[capability]) {
          const bound = this.apis.get(api.capabilityBinding[capability]);
          if (bound?.enabled) return bound;
        }
      }
    }

    if (this.strategy === LoadBalanceMode.SINGLE_DEFAULT && this.defaultApiId) {
      const def = this.apis.get(this.defaultApiId);
      if (def?.enabled) return def;
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
    if (enc) return CryptoUtil.decrypt(enc);
    const api = this.apis.get(id);
    return api?.apiKey ?? '';
  }
}
