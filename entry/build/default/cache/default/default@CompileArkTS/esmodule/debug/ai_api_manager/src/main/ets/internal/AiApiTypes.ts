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
    content?: string;
    reasoning_content?: string;
}
export interface ChatCompletionChoice {
    message: ChatCompletionMessage;
    finish_reason?: string;
}
export interface ChatCompletionResponse {
    choices: ChatCompletionChoice[];
}
export interface ThinkingParam {
    type: string;
}
export interface ChatRequestBody {
    model: string;
    messages: ChatRequestMessage[];
    max_tokens: number;
    temperature: number;
    thinking?: ThinkingParam;
}
export function buildChatRequestBody(model: string, messages: ChatRequestMessage[], maxTokens: number, temperature: number, disableThinking?: boolean): ChatRequestBody {
    const body: ChatRequestBody = {
        model: model,
        messages: messages,
        max_tokens: maxTokens,
        temperature: temperature
    };
    if (disableThinking) {
        const thinking: ThinkingParam = { type: 'disabled' };
        body.thinking = thinking;
    }
    return body;
}
export function extractChoiceContent(choice: ChatCompletionChoice): string {
    const msg = choice.message;
    const content = msg.content ?? '';
    if (content.length > 0) {
        return content;
    }
    const reasoning = msg.reasoning_content ?? '';
    return reasoning;
}
export function maskApiConfig(api: AiApiConfig): AiApiConfig {
    return {
        id: api.id,
        name: api.name,
        provider: api.provider,
        baseUrl: api.baseUrl,
        apiKey: '***',
        backupApiKey: api.backupApiKey ? '***' : undefined,
        model: api.model,
        enabled: api.enabled,
        priority: api.priority,
        maxTokens: api.maxTokens,
        temperature: api.temperature,
        contextLimit: api.contextLimit,
        proxyUrl: api.proxyUrl,
        customHeaders: api.customHeaders,
        capabilityBinding: api.capabilityBinding,
        remark: api.remark,
        lastStatus: api.lastStatus,
        lastTestedAt: api.lastTestedAt,
        dailyCallCount: api.dailyCallCount,
        taskBind: api.taskBind
    };
}
export function cloneAiApiConfig(source: AiApiConfig): AiApiConfig {
    return {
        id: source.id,
        name: source.name,
        provider: source.provider,
        baseUrl: source.baseUrl,
        apiKey: source.apiKey,
        backupApiKey: source.backupApiKey,
        model: source.model,
        enabled: source.enabled,
        priority: source.priority,
        maxTokens: source.maxTokens,
        temperature: source.temperature,
        contextLimit: source.contextLimit,
        proxyUrl: source.proxyUrl,
        customHeaders: source.customHeaders,
        capabilityBinding: source.capabilityBinding,
        remark: source.remark,
        lastStatus: source.lastStatus,
        lastTestedAt: source.lastTestedAt,
        dailyCallCount: source.dailyCallCount,
        taskBind: source.taskBind
    };
}
export function mergeAiApiConfig(existing: AiApiConfig, updates: AiApiConfigUpdate): AiApiConfig {
    return {
        id: existing.id,
        name: updates.name ?? existing.name,
        provider: updates.provider ?? existing.provider,
        baseUrl: updates.baseUrl ?? existing.baseUrl,
        apiKey: updates.apiKey && updates.apiKey !== '***' ? updates.apiKey : existing.apiKey,
        backupApiKey: updates.backupApiKey ?? existing.backupApiKey,
        model: updates.model ?? existing.model,
        enabled: updates.enabled ?? existing.enabled,
        priority: updates.priority ?? existing.priority,
        maxTokens: updates.maxTokens ?? existing.maxTokens,
        temperature: updates.temperature ?? existing.temperature,
        contextLimit: updates.contextLimit ?? existing.contextLimit,
        proxyUrl: updates.proxyUrl ?? existing.proxyUrl,
        customHeaders: updates.customHeaders ?? existing.customHeaders,
        capabilityBinding: updates.capabilityBinding ?? existing.capabilityBinding,
        remark: updates.remark ?? existing.remark,
        lastStatus: updates.lastStatus ?? existing.lastStatus,
        lastTestedAt: updates.lastTestedAt ?? existing.lastTestedAt,
        dailyCallCount: existing.dailyCallCount,
        taskBind: existing.taskBind
    };
}
export function buildRequestHeaders(apiKey: string, customHeaders?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {};
    headers['Content-Type'] = 'application/json';
    headers['Authorization'] = `Bearer ${apiKey}`;
    if (customHeaders) {
        const keys = Object.keys(customHeaders);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            headers[key] = customHeaders[key];
        }
    }
    return headers;
}
export function getFirstBoundCapabilityId(binding: Record<string, string>): string | undefined {
    const keys = Object.keys(binding);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = binding[key];
        if (typeof value === 'string') {
            return value;
        }
    }
    return undefined;
}
