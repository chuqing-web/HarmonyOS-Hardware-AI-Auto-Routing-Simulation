/**
 * 模块6：多厂商AI API管理中心 API（v2 完备版）
 */
import {
  AiApiConfig, AiProviderType, AiCapability, LoadBalanceMode,
  Result, AiTaskType, AiTestResult, ApiResult, UsageDashboard
} from 'common';
import { AiApiConfigUpdate, AiChatContext } from '../internal/AiApiTypes';

export interface ChatOptions {
  capability?: string;
  context?: AiChatContext;
  maxTokens?: number;
  temperature?: number;
  /** 关闭 DeepSeek V4 等模型的 thinking，避免推理占满 max_tokens 导致 content 为空 */
  disableThinking?: boolean;
  /** 覆盖默认连接超时（测试连接用短超时） */
  connectTimeoutMs?: number;
  /** 覆盖默认读超时 */
  readTimeoutMs?: number;
}

export interface ProviderTemplateInfo {
  provider: AiProviderType;
  displayName: string;
  defaultBaseUrl: string;
  defaultModel: string;
}

export interface IAiApiManager {
  // ---- v2 API ----
  getAllApiConfig(): AiApiConfig[];
  getDefaultApi(): ApiResult<AiApiConfig>;
  testApiConnect(id: string): Promise<AiTestResult>;
  getAvailableApiForTask(taskType: AiTaskType): ApiResult<AiApiConfig>;
  getFallbackApi(excludeId: string): ApiResult<AiApiConfig>;
  recordApiCall(id: string, tokensUsed?: number): void;
  getDailyCallCount(id: string): number;

  getUsageDashboard(): UsageDashboard;
  isQuotaWarningActive(): boolean;
  checkGlobalAiQuota(): ApiResult<void>;

  // ---- v1 兼容 ----
  addApi(config: AiApiConfig): Result<void>;
  removeApi(id: string): Result<void>;
  updateApi(id: string, config: AiApiConfigUpdate): Result<void>;
  getApi(id: string): Result<AiApiConfig>;
  listApis(): AiApiConfig[];
  enableApi(id: string): Result<void>;
  disableApi(id: string): Result<void>;
  batchEnable(ids: string[]): Result<number>;
  batchDisable(ids: string[]): Result<number>;
  batchRemove(ids: string[]): Result<number>;
  setDefaultApi(id: string): Result<void>;
  testConnection(id: string): Promise<Result<boolean>>;
  chat(prompt: string, options?: ChatOptions): Promise<Result<string>>;
  exportConfigs(hideKeys?: boolean): Result<string>;
  importConfigs(json: string): Result<number>;
  clearAllConfigs(): Result<void>;
  getSupportedProviders(): AiProviderType[];
  getProviderTemplates(): ProviderTemplateInfo[];
  createFromTemplate(provider: AiProviderType, name: string): Result<AiApiConfig>;
  setLoadBalanceStrategy(strategy: LoadBalanceMode): void;
  bindCapability(capability: AiCapability, apiId: string): Result<void>;
}
