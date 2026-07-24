/**
 * AI 厂商 API 模板配置
 */
import { AiProviderType } from 'common';

export interface ProviderTemplate {
  provider: AiProviderType;
  displayName: string;
  defaultBaseUrl: string;
  defaultModel: string;
  chatPath: string;
  authHeader: string;
}

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  { provider: AiProviderType.DOUBAO, displayName: '豆包', defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3', defaultModel: 'doubao-pro-32k', chatPath: '/chat/completions', authHeader: 'Bearer' },
  { provider: AiProviderType.QWEN, displayName: '通义千问', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen-plus', chatPath: '/chat/completions', authHeader: 'Bearer' },
  { provider: AiProviderType.DEEPSEEK, displayName: 'DeepSeek', defaultBaseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat', chatPath: '/chat/completions', authHeader: 'Bearer' },
  { provider: AiProviderType.WENXIN, displayName: '文心一言', defaultBaseUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop', defaultModel: 'ernie-4.0', chatPath: '/chat/completions', authHeader: 'Bearer' },
  { provider: AiProviderType.ZHIPU, displayName: '智谱AI', defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-4', chatPath: '/chat/completions', authHeader: 'Bearer' },
  { provider: AiProviderType.KIMI, displayName: 'Kimi', defaultBaseUrl: 'https://api.moonshot.cn/v1', defaultModel: 'moonshot-v1-8k', chatPath: '/chat/completions', authHeader: 'Bearer' },
  { provider: AiProviderType.YI, displayName: '零一万物', defaultBaseUrl: 'https://api.lingyiwanwu.com/v1', defaultModel: 'yi-large', chatPath: '/chat/completions', authHeader: 'Bearer' },
  { provider: AiProviderType.BAICHUAN, displayName: '百川', defaultBaseUrl: 'https://api.baichuan-ai.com/v1', defaultModel: 'Baichuan4', chatPath: '/chat/completions', authHeader: 'Bearer' },
  { provider: AiProviderType.SILICONFLOW, displayName: '硅基流动', defaultBaseUrl: 'https://api.siliconflow.cn/v1', defaultModel: 'deepseek-ai/DeepSeek-V2.5', chatPath: '/chat/completions', authHeader: 'Bearer' },
  { provider: AiProviderType.OPENAI, displayName: 'OpenAI GPT', defaultBaseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o', chatPath: '/chat/completions', authHeader: 'Bearer' },
  { provider: AiProviderType.CLAUDE, displayName: 'Claude', defaultBaseUrl: 'https://api.anthropic.com/v1', defaultModel: 'claude-3-5-sonnet-20241022', chatPath: '/messages', authHeader: 'x-api-key' },
  // Gemini OpenAI 兼容代理常用 /chat/completions；原生 generateContent 需另拼 model 路径
  { provider: AiProviderType.GEMINI, displayName: 'Gemini', defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', defaultModel: 'gemini-2.0-flash', chatPath: '/chat/completions', authHeader: 'Bearer' },
  { provider: AiProviderType.MISTRAL, displayName: 'Mistral', defaultBaseUrl: 'https://api.mistral.ai/v1', defaultModel: 'mistral-large-latest', chatPath: '/chat/completions', authHeader: 'Bearer' },
  { provider: AiProviderType.GROQ, displayName: 'Groq', defaultBaseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile', chatPath: '/chat/completions', authHeader: 'Bearer' },
  { provider: AiProviderType.OPENROUTER, displayName: 'OpenRouter', defaultBaseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'openai/gpt-4o', chatPath: '/chat/completions', authHeader: 'Bearer' },
  { provider: AiProviderType.OLLAMA, displayName: 'Ollama 本地', defaultBaseUrl: 'http://localhost:11434/v1', defaultModel: 'llama3', chatPath: '/chat/completions', authHeader: 'Bearer' },
  { provider: AiProviderType.CUSTOM, displayName: '自定义', defaultBaseUrl: '', defaultModel: '', chatPath: '/chat/completions', authHeader: 'Bearer' },
];

export function getTemplate(provider: AiProviderType): ProviderTemplate | undefined {
  return PROVIDER_TEMPLATES.find(t => t.provider === provider);
}

export const CIRCUIT_TEST_PROMPT =
  'Reply with exactly the two letters OK and nothing else.';
