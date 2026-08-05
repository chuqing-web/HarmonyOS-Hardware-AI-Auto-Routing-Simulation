/**
 * PCB 阶段 chat 选项 — 与原理图 Orchestrator.stageChatOpts 对齐：
 * 推理关 → disableThinking=true；推理开 → thinking 显式开启。
 * maxTokens 满额 64K（多数网关硬上限即 65536，超限 500）；
 * reasoning 与 content 共享预算，推理写满时由 SSE watchdog + FAILOVER 兜底。
 */
import { AiCapability } from 'common';
import { ChatOptions } from 'ai_api_manager';

const PCB_MAX_TOKENS: number = 65536;

export function pcbStageChatOpts(enableReasoning: boolean, temperature: number): ChatOptions {
  const opts: ChatOptions = {
    capability: AiCapability.PCB_AUTO_ROUTE,
    temperature: temperature,
    maxTokens: PCB_MAX_TOKENS
  };
  if (enableReasoning) {
    opts.disableThinking = false;
  } else {
    opts.disableThinking = true;
  }
  return opts;
}
