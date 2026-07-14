import type { AiApiConfig, AiProviderType, ApiConnectionStatus } from 'common';
export interface AiApiConfigUpdate {
    name?: string;
    provider?: AiProviderType;
    baseUrl?: string;
    apiKey?: string;
    backupApiKey?: string;
    model?: string;
    enabled?: boolean;
    priority?: number;
    maxTokens?: number;
    temperature?: number;
    contextLimit?: number;
    proxyUrl?: string;
    customHeaders?: Record<string, string>;
    capabilityBinding?: Record<string, string>;
    remark?: string;
    lastStatus?: ApiConnectionStatus;
    lastTestedAt?: string;
}
export interface AiChatContext {
    signalCount?: number;
}
export interface ChatRequestMessage {
    role: string;
    content: string;
}
export interface ChatCompletionMessage {
    content: string;
}
export interface ChatCompletionChoice {
    message: ChatCompletionMessage;
}
export interface ChatCompletionResponse {
    choices: ChatCompletionChoice[];
}
export function maskApiConfig(f258: AiApiConfig): AiApiConfig {
    return {
        id: f258.id,
        name: f258.name,
        provider: f258.provider,
        baseUrl: f258.baseUrl,
        apiKey: '***',
        backupApiKey: f258.backupApiKey ? '***' : undefined,
        model: f258.model,
        enabled: f258.enabled,
        priority: f258.priority,
        maxTokens: f258.maxTokens,
        temperature: f258.temperature,
        contextLimit: f258.contextLimit,
        proxyUrl: f258.proxyUrl,
        customHeaders: f258.customHeaders,
        capabilityBinding: f258.capabilityBinding,
        remark: f258.remark,
        lastStatus: f258.lastStatus,
        lastTestedAt: f258.lastTestedAt,
        dailyCallCount: f258.dailyCallCount,
        taskBind: f258.taskBind
    };
}
export function cloneAiApiConfig(e258: AiApiConfig): AiApiConfig {
    return {
        id: e258.id,
        name: e258.name,
        provider: e258.provider,
        baseUrl: e258.baseUrl,
        apiKey: e258.apiKey,
        backupApiKey: e258.backupApiKey,
        model: e258.model,
        enabled: e258.enabled,
        priority: e258.priority,
        maxTokens: e258.maxTokens,
        temperature: e258.temperature,
        contextLimit: e258.contextLimit,
        proxyUrl: e258.proxyUrl,
        customHeaders: e258.customHeaders,
        capabilityBinding: e258.capabilityBinding,
        remark: e258.remark,
        lastStatus: e258.lastStatus,
        lastTestedAt: e258.lastTestedAt,
        dailyCallCount: e258.dailyCallCount,
        taskBind: e258.taskBind
    };
}
export function mergeAiApiConfig(c258: AiApiConfig, d258: AiApiConfigUpdate): AiApiConfig {
    return {
        id: c258.id,
        name: d258.name ?? c258.name,
        provider: d258.provider ?? c258.provider,
        baseUrl: d258.baseUrl ?? c258.baseUrl,
        apiKey: d258.apiKey && d258.apiKey !== '***' ? d258.apiKey : c258.apiKey,
        backupApiKey: d258.backupApiKey ?? c258.backupApiKey,
        model: d258.model ?? c258.model,
        enabled: d258.enabled ?? c258.enabled,
        priority: d258.priority ?? c258.priority,
        maxTokens: d258.maxTokens ?? c258.maxTokens,
        temperature: d258.temperature ?? c258.temperature,
        contextLimit: d258.contextLimit ?? c258.contextLimit,
        proxyUrl: d258.proxyUrl ?? c258.proxyUrl,
        customHeaders: d258.customHeaders ?? c258.customHeaders,
        capabilityBinding: d258.capabilityBinding ?? c258.capabilityBinding,
        remark: d258.remark ?? c258.remark,
        lastStatus: d258.lastStatus ?? c258.lastStatus,
        lastTestedAt: d258.lastTestedAt ?? c258.lastTestedAt,
        dailyCallCount: c258.dailyCallCount,
        taskBind: c258.taskBind
    };
}
export function buildRequestHeaders(w257: string, x257?: Record<string, string>): Record<string, string> {
    const y257: Record<string, string> = {};
    y257['Content-Type'] = 'application/json';
    y257['Authorization'] = `Bearer ${w257}`;
    if (x257) {
        const z257 = Object.keys(x257);
        for (let a258 = 0; a258 < z257.length; a258++) {
            const b258 = z257[a258];
            y257[b258] = x257[b258];
        }
    }
    return y257;
}
export function getFirstBoundCapabilityId(r257: Record<string, string>): string | undefined {
    const s257 = Object.keys(r257);
    for (let t257 = 0; t257 < s257.length; t257++) {
        const u257 = s257[t257];
        const v257 = r257[u257];
        if (typeof v257 === 'string') {
            return v257;
        }
    }
    return undefined;
}
