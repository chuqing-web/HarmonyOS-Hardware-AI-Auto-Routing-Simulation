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
    stream?: boolean;
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
    /** Qwen 系（DashScope 兼容端点）：OpenAI 兼容参数，等价 thinking disabled */
    enable_thinking?: boolean;
    /** SSE 流式：长生成持续回包，绕开网关非流式响应上限与代理空闲掐断 */
    stream?: boolean;
}
/** SSE 流式 chunk（OpenAI 兼容：choices[0].delta.content 逐片累积） */
export interface ChatCompletionStreamChunk {
    choices?: ChatCompletionStreamChoice[];
    error?: Record<string, Object> | null;
}
export interface ChatCompletionStreamChoice {
    delta?: ChatCompletionMessage;
    message?: ChatCompletionMessage;
    finish_reason?: string;
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
export function buildChatRequestBody(model: string, messages: ChatRequestMessage[], maxTokens: number, temperature: number, disableThinking?: boolean, provider?: string, stream?: boolean): ChatRequestBody {
    const body: ChatRequestBody = {
        model: model,
        messages: messages,
        max_tokens: maxTokens,
        temperature: temperature
    };
    // Qwen 系（agnes/DashScope 兼容端点）忽略 thinking 对象，只认 enable_thinking；
    // 否则 thinking 会继续吃光 max_tokens → finish_reason=length 空 content。
    const isQwen = provider === AiProviderType.QWEN;
    if (disableThinking === true) {
        if (isQwen) {
            body.enable_thinking = false;
        }
        else {
            const thinking: ThinkingParam = { type: 'disabled' };
            body.thinking = thinking;
        }
    }
    else if (disableThinking === false && !isQwen) {
        const thinkingOn: ThinkingParam = { type: 'enabled' };
        body.thinking = thinkingOn;
    }
    if (stream === true) {
        body.stream = true;
    }
    return body;
}
/**
 * 解析 OpenAI 兼容 SSE 流式正文：累积 data: 行中 delta.content。
 * 返回 null = 不是合法 SSE（网关可能不支持 stream，返回了普通 JSON/错误）。
 * content 为空时尝试从 reasoning 通道恢复（模型常在推理末尾写出完整答案 JSON）。
 */
export function parseSseContent(raw: string): string | null {
    const lines = raw.split('\n');
    let out = '';
    let reasoning = '';
    let sawData = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.length === 0) {
            continue;
        }
        if (line.charAt(0) === ':' || line.charAt(0) === '#') {
            continue; // SSE 注释行
        }
        if (line.indexOf('data:') !== 0) {
            continue; // event:/id:/retry: 等忽略
        }
        const payload = line.substring(5).trim();
        if (payload === '[DONE]') {
            break;
        }
        sawData = true;
        let chunk: ChatCompletionStreamChunk | null = null;
        try {
            chunk = JSON.parse(payload) as ChatCompletionStreamChunk;
        }
        catch (_e) {
            continue; // 分片可能被网关拆行，忽略残缺 JSON
        }
        if (chunk === null || typeof chunk !== 'object') {
            continue;
        }
        if (chunk.error !== undefined && chunk.error !== null) {
            continue; // data: {"error":...} —— 正文累积保持为空，走空内容失败路径
        }
        const choices = chunk.choices;
        if (!choices || choices.length === 0) {
            continue;
        }
        const delta = choices[0].delta;
        if (!delta) {
            continue;
        }
        const c = delta.content ?? '';
        if (c.length > 0) {
            out += c;
        }
        const rc = delta.reasoning_content ?? '';
        if (rc.length > 0) {
            reasoning += rc;
        }
    }
    if (!sawData) {
        return null;
    }
    if (out.length > 0) {
        return out;
    }
    // 正文为空但推理非空：推理常被 finish_reason=length 截断，
    // 但模型常在推理末尾写出完整答案 —— 隔离最后一个完整 JSON 恢复
    if (reasoning.length > 0) {
        const fromReason = isolateJsonFromText(reasoning);
        if (fromReason !== null && fromReason.length > 0) {
            return fromReason;
        }
    }
    return '';
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
            // 短前言 + JSON：隔离出对象，避免英文推理污染下游 parser
            if (content.charAt(0) === '{') {
                return content;
            }
            const fromContent = isolateJsonFromText(content);
            if (fromContent !== null) {
                const pre = content.indexOf('{');
                if (pre >= 0 && pre <= 200) {
                    return fromContent;
                }
            }
            return content;
        }
    }
    // content 空：从 reasoning 里隔离 JSON（禁止把纯中文推理当正文）
    if (reasoning.length > 0) {
        const fromReason = isolateJsonFromText(reasoning);
        if (fromReason !== null) {
            const pre = reasoning.indexOf('{');
            if (pre < 0 || pre <= 200) {
                return fromReason;
            }
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
        stream: api.stream,
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
        stream: source.stream,
        remark: source.remark,
        lastStatus: source.lastStatus,
        lastTestedAt: source.lastTestedAt,
        dailyCallCount: source.dailyCallCount,
        taskBind: source.taskBind
    };
}
export function mergeAiApiConfig(existing: AiApiConfig, updates: AiApiConfigUpdate): AiApiConfig {
    // apiKey：仅接受非空且非掩码的新值；未传 / 空 / *** 一律保留原值（避免编辑保存冲掉 Key）
    let nextKey = existing.apiKey;
    if (updates.apiKey !== undefined) {
        const k = updates.apiKey;
        if (k.length > 0 && k !== '***') {
            nextKey = k;
        }
    }
    let nextBackup = existing.backupApiKey;
    if (updates.backupApiKey !== undefined) {
        const b = updates.backupApiKey;
        if (b.length > 0 && b !== '***') {
            nextBackup = b;
        }
    }
    return {
        id: existing.id,
        name: updates.name !== undefined ? updates.name : existing.name,
        provider: updates.provider !== undefined ? updates.provider : existing.provider,
        baseUrl: updates.baseUrl !== undefined ? updates.baseUrl : existing.baseUrl,
        apiKey: nextKey,
        backupApiKey: nextBackup,
        model: updates.model !== undefined ? updates.model : existing.model,
        enabled: updates.enabled !== undefined ? updates.enabled : existing.enabled,
        priority: updates.priority !== undefined ? updates.priority : existing.priority,
        maxTokens: updates.maxTokens !== undefined ? updates.maxTokens : existing.maxTokens,
        temperature: updates.temperature !== undefined ? updates.temperature : existing.temperature,
        contextLimit: updates.contextLimit !== undefined ? updates.contextLimit : existing.contextLimit,
        proxyUrl: updates.proxyUrl !== undefined ? updates.proxyUrl : existing.proxyUrl,
        customHeaders: updates.customHeaders !== undefined ? updates.customHeaders : existing.customHeaders,
        capabilityBinding: updates.capabilityBinding !== undefined ? updates.capabilityBinding : existing.capabilityBinding,
        stream: updates.stream !== undefined ? updates.stream : existing.stream,
        remark: updates.remark !== undefined ? updates.remark : existing.remark,
        lastStatus: updates.lastStatus !== undefined ? updates.lastStatus : existing.lastStatus,
        lastTestedAt: updates.lastTestedAt !== undefined ? updates.lastTestedAt : existing.lastTestedAt,
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
