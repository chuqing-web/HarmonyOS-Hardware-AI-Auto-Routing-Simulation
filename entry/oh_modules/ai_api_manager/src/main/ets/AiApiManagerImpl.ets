/**
 * 模块6：多厂商AI API管理中心完整实现
 */
import { IAiApiManager, ChatOptions } from './api/IAiApiManager';
import { PROVIDER_TEMPLATES, CIRCUIT_TEST_PROMPT, getTemplate } from './config/ProviderTemplates';
import {
  AiApiConfig, AiProviderType, AiCapability, LoadBalanceMode,
  ApiConnectionStatus, Result, CryptoUtil, IdUtil,
  AiTaskType, AiTestResult, ApiResult, ErrCode, ResultHelper,
  FeatureGate, UsageDashboard, AiContextSanitizer,
  Logger, INSTR_TRACE_TAG, traceAiPayload, traceAiOp
} from 'common';
import { QuotaTracker } from './billing/QuotaTracker';
import http from '@ohos.net.http';
import { NetworkModeManager } from './NetworkModeManager';
import {
  AiApiConfigUpdate, ChatCompletionResponse, ChatRequestMessage, buildChatRequestBody,
  buildRequestHeaders, cloneAiApiConfig, extractChoiceContent,
  getFirstBoundCapabilityId, maskApiConfig, mergeAiApiConfig
} from './internal/AiApiTypes';

/** 流水线输出上限；配合 disableThinking，避免推理占满额度 */
const DEFAULT_MAX_OUTPUT_TOKENS = 65536;

/**
 * 复杂原理图 LLM 单次回复可能极慢（深推理/长 JSON）。
 * 必须耐心等待：连接超时 2min，读超时 30min。
 */
const AI_HTTP_CONNECT_TIMEOUT_MS = 120000;
const AI_HTTP_READ_TIMEOUT_MS = 1800000;

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
  // BusinessError / 普通对象：优先 code+message
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
    } else if (typeof name === 'string' && name.length > 0) {
      parts.push(name);
    }
    if (parts.length > 0) {
      return parts.join(' ');
    }
    return JSON.stringify(e);
  } catch (_jsonFail) {
    return 'unprintable error';
  }
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
    Logger.info(INSTR_TRACE_TAG, `[AI_API] testApiConnect START id=${id}`);
    const result = await this.testConnection(id);
    const api = this.apis.get(id);
    let errCode = ErrCode.OK;
    if (!result.success) {
      if (result.error?.includes('401')) errCode = ErrCode.ERR_API_AUTH;
      else if (result.error?.includes('429')) errCode = ErrCode.ERR_API_LIMIT;
      else if (result.error?.includes('timeout')) errCode = ErrCode.ERR_API_TIMEOUT;
      else errCode = ErrCode.ERR_API_TIMEOUT;
    }
    const latencyMs = Date.now() - start;
    Logger.info(INSTR_TRACE_TAG,
      `[AI_API] testApiConnect END id=${id} ok=${result.success}` +
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
    if (!this.defaultApiId && config.enabled) this.defaultApiId = config.id;
    Logger.info(INSTR_TRACE_TAG,
      `[AI_API] addApi OK id=${config.id} name=${config.name}` +
      ` provider=${config.provider} model=${config.model}` +
      ` enabled=${config.enabled} keyLen=${config.apiKey && config.apiKey !== '***' ? config.apiKey.length : 0}` +
      ` total=${this.apis.size}`);
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
    if (!api) {
      Logger.error(INSTR_TRACE_TAG, `[AI_API] testConnection FAIL id=${id} not found`);
      return { success: false, error: 'API not found' };
    }

    Logger.info(INSTR_TRACE_TAG,
      `[AI_API] testConnection START id=${id} name=${api.name}` +
      ` provider=${api.provider} model=${api.model} url=${api.baseUrl}`);
    const result = await this.sendRequest(api, CIRCUIT_TEST_PROMPT, { maxTokens: 50 });
    const status = result.success ? ApiConnectionStatus.OK :
      (result.error?.includes('401') ? ApiConnectionStatus.AUTH_ERROR :
        result.error?.includes('429') ? ApiConnectionStatus.RATE_LIMIT :
          result.error?.includes('timeout') ? ApiConnectionStatus.TIMEOUT :
            ApiConnectionStatus.NETWORK_ERROR);

    this.updateApi(id, { lastStatus: status, lastTestedAt: new Date().toISOString() });
    Logger.info(INSTR_TRACE_TAG,
      `[AI_API] testConnection END id=${id} ok=${result.success}` +
      ` status=${status} err=${result.error ?? ''}` +
      ` respPreview=${result.data ? result.data.substring(0, 80) : ''}`);
    return { success: result.success, data: result.success, error: result.error };
  }

  async chat(prompt: string, options?: ChatOptions): Promise<Result<string>> {
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
      Logger.warn(INSTR_TRACE_TAG,
        '[AI_API] sanitize left placeholder <dist>/<coord> — geometry may be broken');
    }
    const api = this.selectApi(options?.capability);
    if (!api) {
      Logger.error(INSTR_TRACE_TAG,
        `[AI_API] chat REJECT no enabled API cap=${options?.capability ?? 'any'}`);
      return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: 'No enabled AI API configured' };
    }
    const quotaCheck = this.quotaTracker.checkBeforeCall(api.id, api.name);
    if (!quotaCheck.success) {
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_API] chat REJECT quota id=${api.id} err=${quotaCheck.error ?? ''}`);
      return { success: false, errCode: quotaCheck.errCode, error: quotaCheck.error };
    }
    traceAiOp('AI_API', 'chat',
      `id=${api.id} name=${api.name} model=${api.model}` +
      ` cap=${options?.capability ?? 'any'} promptLen=${safePrompt.length}`);
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
    const url = `${api.baseUrl}${chatPath}`;

    const maxTokens = this.resolveMaxTokens(api, options);
    Logger.info(INSTR_TRACE_TAG,
      `[AI_API] HTTP POST id=${api.id} url=${url} model=${api.model}` +
      ` keyLen=${apiKey.length} promptLen=${prompt.length}` +
      ` maxTokens=${maxTokens}` +
      ` temp=${options?.temperature ?? api.temperature}` +
      ` disableThinking=${options?.disableThinking === true}` +
      ` connectTimeoutMs=${AI_HTTP_CONNECT_TIMEOUT_MS}` +
      ` readTimeoutMs=${AI_HTTP_READ_TIMEOUT_MS}`);
    Logger.info(INSTR_TRACE_TAG,
      `[AI_API] WAIT long reply — complex prompts may take many minutes, do not cancel`);
    traceAiPayload('AI_API', 'PROMPT', prompt,
      `id=${api.id} model=${api.model} cap=${options?.capability ?? 'any'}`);

    try {
      const httpRequest = http.createHttp();
      const headers: Record<string, string> = buildRequestHeaders(apiKey, api.customHeaders);

      const messages: ChatRequestMessage[] = [{ role: 'user', content: prompt }];
      const body = JSON.stringify(buildChatRequestBody(
        api.model, messages, maxTokens,
        options?.temperature ?? api.temperature,
        options?.disableThinking
      ));

      const useProxy = this.shouldUseSystemProxy(api.id);
      const response = await httpRequest.request(url, {
        method: http.RequestMethod.POST,
        header: headers,
        extraData: body,
        connectTimeout: AI_HTTP_CONNECT_TIMEOUT_MS,
        readTimeout: AI_HTTP_READ_TIMEOUT_MS,
        usingProxy: useProxy
      });
      httpRequest.destroy();

      if (response.responseCode === 200) {
        this.failedApiIds.delete(api.id);
        const rawBody = response.result as string;
        const parsed = JSON.parse(rawBody) as ChatCompletionResponse;
        if (parsed.choices && parsed.choices.length > 0) {
          const content = extractChoiceContent(parsed.choices[0]);
          Logger.info(INSTR_TRACE_TAG,
            `[AI_API] HTTP 200 id=${api.id} contentLen=${content.length}`);
          traceAiPayload('AI_API', 'REPLY', content, `id=${api.id} model=${api.model}`);
          if (content.length === 0) {
            let finishReason = 'unknown';
            const fr = parsed.choices[0].finish_reason;
            if (fr !== undefined && fr !== null && fr.length > 0) {
              finishReason = fr;
            }
            Logger.warn(INSTR_TRACE_TAG,
              `[AI_API] HTTP 200 id=${api.id} empty content finish_reason=${finishReason}`);
            return { success: false,
              error: `LLM returned empty content (finish_reason=${finishReason})` };
          }
          return { success: true, data: content };
        }
        Logger.info(INSTR_TRACE_TAG, `[AI_API] HTTP 200 id=${api.id} raw body (no choices)`);
        traceAiPayload('AI_API', 'REPLY', rawBody, `id=${api.id} raw=true`);
        if (rawBody.length === 0) {
          Logger.warn(INSTR_TRACE_TAG, `[AI_API] HTTP 200 id=${api.id} empty response body`);
          return { success: false, error: 'LLM returned empty response body' };
        }
        return { success: true, data: rawBody };
      }

      const errBody = typeof response.result === 'string' ? response.result : `${response.result}`;
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_API] HTTP ${response.responseCode} id=${api.id}`);
      traceAiPayload('AI_API', 'REPLY_ERR', errBody,
        `id=${api.id} code=${response.responseCode}`);
      if (response.responseCode === 401) {
        const backupKey = this.encryptedKeys.get(`${api.id}_backup`);
        if (backupKey) {
          Logger.info(INSTR_TRACE_TAG, `[AI_API] retry with backup key id=${api.id}`);
          return this.sendRequestWithKey(api, prompt, CryptoUtil.decrypt(backupKey), options);
        }
      }

      // Only blacklist on permanent client errors (4xx); 5xx/network errors are transient
      if (response.responseCode >= 400 && response.responseCode < 500) {
        this.failedApiIds.add(api.id);
      }
      return { success: false, error: `API returned ${response.responseCode}` };
    } catch (e) {
      // Network exceptions are transient — do NOT blacklist, allow retries
      const errMsg = formatCaughtError(e);
      Logger.error(INSTR_TRACE_TAG,
        `[AI_API] HTTP exception id=${api.id} url=${url}: ${errMsg}`);
      return { success: false, error: `Request failed: ${errMsg}` };
    }
  }

  private async sendRequestWithKey(api: AiApiConfig, prompt: string, apiKey: string,
    options?: ChatOptions): Promise<Result<string>> {
    const template = getTemplate(api.provider);
    const url = `${api.baseUrl}${template?.chatPath ?? '/chat/completions'}`;
    Logger.info(INSTR_TRACE_TAG,
      `[AI_API] HTTP POST (backupKey) id=${api.id} url=${url} model=${api.model}` +
      ` promptLen=${prompt.length}`);
    traceAiPayload('AI_API', 'PROMPT', prompt, `id=${api.id} backupKey=true`);
    const maxTokens = this.resolveMaxTokens(api, options);
    try {
      const httpRequest = http.createHttp();
      const reqHeaders: Record<string, string> = buildRequestHeaders(apiKey, api.customHeaders);
      const messages: ChatRequestMessage[] = [{ role: 'user', content: prompt }];
      const body = JSON.stringify(buildChatRequestBody(
        api.model, messages, maxTokens,
        options?.temperature ?? api.temperature,
        options?.disableThinking
      ));
      const useProxy = this.shouldUseSystemProxy(api.id);
      const response = await httpRequest.request(url, {
        method: http.RequestMethod.POST,
        header: reqHeaders,
        extraData: body,
        connectTimeout: AI_HTTP_CONNECT_TIMEOUT_MS,
        readTimeout: AI_HTTP_READ_TIMEOUT_MS,
        usingProxy: useProxy
      });
      httpRequest.destroy();
      if (response.responseCode === 200) {
        const parsed = JSON.parse(response.result as string) as ChatCompletionResponse;
        const choices = parsed.choices;
        if (choices && choices.length > 0) {
          const content = extractChoiceContent(choices[0]);
          traceAiPayload('AI_API', 'REPLY', content, `id=${api.id} backupKey=true`);
          return { success: true, data: content };
        }
        return { success: false, error: 'Empty response' };
      }
      const errBody = typeof response.result === 'string' ? response.result : `${response.result}`;
      traceAiPayload('AI_API', 'REPLY_ERR', errBody,
        `id=${api.id} backupKey=true code=${response.responseCode}`);
      return { success: false, error: `Backup key failed: ${response.responseCode}` };
    } catch (e) {
      const errMsg = formatCaughtError(e);
      Logger.error(INSTR_TRACE_TAG,
        `[AI_API] HTTP exception backupKey id=${api.id} url=${url}: ${errMsg}`);
      return { success: false, error: `Backup request failed: ${errMsg}` };
    }
  }

  /** 用户配置了全局/API 代理时启用 HTTP 系统代理 */
  private shouldUseSystemProxy(apiId: string): boolean {
    const cfg = this.networkMode.getConfig();
    if (cfg.offlineMode) {
      return false;
    }
    if (cfg.globalProxy.trim().length > 0) {
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
