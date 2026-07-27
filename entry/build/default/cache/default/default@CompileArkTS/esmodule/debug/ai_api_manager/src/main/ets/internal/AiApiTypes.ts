import { AiProviderType } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { AiApiConfig, ApiConnectionStatus } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
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
    temperature?: number;
    thinking?: ThinkingParam;
}
/** Anthropic /messages 响应片段 */
export interface AnthropicContentBlock {
    type?: string;
    text?: string;
}
export interface AnthropicMessagesResponse {
    content?: AnthropicContentBlock[];
    stop_reason?: string;
}
export function buildChatRequestBody(model: string, messages: ChatRequestMessage[], maxTokens: number, temperature: number, disableThinking?: boolean): ChatRequestBody {
    const body: ChatRequestBody = {
        model: model,
        messages: messages,
        max_tokens: maxTokens,
        temperature: temperature
    };
    // DeepSeek V4 等：显式 enabled/disabled；未传则不带 thinking 字段（兼容旧模型）
    if (disableThinking === true) {
        const thinking: ThinkingParam = { type: 'disabled' };
        body.thinking = thinking;
    }
    else if (disableThinking === false) {
        const thinkingOn: ThinkingParam = { type: 'enabled' };
        body.thinking = thinkingOn;
    }
    return body;
}
/** Claude Messages API：与 OpenAI Chat Completions 字段相近，但勿带 thinking，且需 anthropic-version 头 */
export function buildAnthropicMessagesBody(model: string, messages: ChatRequestMessage[], maxTokens: number, temperature: number): ChatRequestBody {
    const body: ChatRequestBody = {
        model: model,
        messages: messages,
        max_tokens: maxTokens,
        temperature: temperature
    };
    return body;
}
export function extractAnthropicText(parsed: AnthropicMessagesResponse): string {
    const blocks = parsed.content;
    if (!blocks || blocks.length === 0) {
        return '';
    }
    const parts: string[] = [];
    for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (b && b.type === 'text' && typeof b.text === 'string' && b.text.length > 0) {
            parts.push(b.text);
        }
    }
    return parts.join('');
}
export function extractChoiceContent(choice: ChatCompletionChoice): string {
    const msg = choice.message;
    let content = (msg.content ?? '').trim();
    const reasoning = (msg.reasoning_content ?? '').trim();
    // 正文优先；剥 think 标签后再用
    if (content.length > 0) {
        content = stripInlineThinkTags(content).trim();
        if (content.length > 0) {
            return content;
        }
    }
    // content 空：从 reasoning 里隔离 JSON（禁止把纯中文推理当正文）
    if (reasoning.length > 0) {
        const fromReason = isolateJsonFromText(reasoning);
        if (fromReason !== null) {
            return fromReason;
        }
        if (reasoning.charAt(0) === '{' && reasoning.charAt(reasoning.length - 1) === '}') {
            return reasoning;
        }
    }
    return '';
}
/** 轻量剥标签（API 层不依赖 PromptLoader，避免循环依赖） */
function stripInlineThinkTags(text: string): string {
    let s = text;
    s = s.replace(/<think>[\s\S]*?<\/think>/gi, '');
    s = s.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
    s = s.replace(/<\/?think>/gi, '');
    s = s.replace(/<\/?thinking>/gi, '');
    return s;
}
function isolateJsonFromText(text: string): string | null {
    const s = stripInlineThinkTags(text).trim();
    if (s.length < 2) {
        return null;
    }
    if (s.charAt(0) === '{' && s.charAt(s.length - 1) === '}') {
        try {
            JSON.parse(s);
            return s;
        }
        catch (_e) {
            // scan
        }
    }
    let lastOk: string | null = null;
    for (let i = 0; i < s.length; i++) {
        if (s.charAt(i) !== '{') {
            continue;
        }
        let depth = 0;
        let inStr = false;
        let esc = false;
        for (let j = i; j < s.length; j++) {
            const ch = s.charAt(j);
            if (inStr) {
                if (esc) {
                    esc = false;
                }
                else if (ch === '\\') {
                    esc = true;
                }
                else if (ch === '"') {
                    inStr = false;
                }
                continue;
            }
            if (ch === '"') {
                inStr = true;
                continue;
            }
            if (ch === '{') {
                depth++;
            }
            else if (ch === '}') {
                depth--;
                if (depth === 0) {
                    const cand = s.substring(i, j + 1);
                    try {
                        const v: Object = JSON.parse(cand) as Object;
                        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
                            lastOk = cand;
                        }
                    }
                    catch (_e2) {
                        // ignore
                    }
                    break;
                }
            }
        }
    }
    return lastOk;
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
export function buildRequestHeaders(apiKey: string, customHeaders?: Record<string, string>, provider?: AiProviderType): Record<string, string> {
    const headers: Record<string, string> = {};
    headers['Content-Type'] = 'application/json';
    let customHasAuth = false;
    if (customHeaders) {
        const keys = Object.keys(customHeaders);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const lower = key.toLowerCase();
            if (lower === 'authorization' || lower === 'x-api-key' || lower === 'api-key') {
                customHasAuth = true;
            }
            headers[key] = customHeaders[key];
        }
    }
    if (provider === AiProviderType.CLAUDE) {
        headers['anthropic-version'] = '2023-06-01';
        if (!customHasAuth && apiKey.length > 0) {
            headers['x-api-key'] = apiKey;
        }
        return headers;
    }
    // Claude 等用 x-api-key；仅当自定义头未带认证时才默认 Bearer
    if (!customHasAuth && apiKey.length > 0) {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }
    return headers;
}
/** capabilityBinding: capability → apiId；按能力键查找，禁止取任意第一个 value */
export function getBoundApiIdForCapability(binding: Record<string, string>, capability: string): string | undefined {
    if (!capability || capability.length === 0) {
        return undefined;
    }
    const v = binding[capability];
    if (typeof v === 'string' && v.length > 0) {
        return v;
    }
    return undefined;
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
