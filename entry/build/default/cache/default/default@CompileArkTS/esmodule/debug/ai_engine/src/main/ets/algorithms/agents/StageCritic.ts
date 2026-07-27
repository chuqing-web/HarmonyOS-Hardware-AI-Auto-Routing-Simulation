import { AiCapability, Logger, INSTR_TRACE_TAG } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { IAiApiManager, ChatOptions } from 'ai_api_manager';
import { defaultCritique } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/agents/StageHooks";
import type { AgentStageId, StageHookContext } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/agents/StageHooks";
export interface StageCritiqueResult {
    /** null = 通过，不重试 */
    reason: string | null;
    fromLlm: boolean;
}
interface LlmCritiqueParsed {
    retry: boolean;
    reason: string;
}
/**
 * 合并规则批判与 LLM 一句话批判。
 * 仅在规则命中或 stageOk=false 时调用 LLM（省额度）。
 */
export async function critiqueWithLlm(api: IAiApiManager | null, stage: AgentStageId, userPrompt: string, ctx: StageHookContext, stageOk: boolean, skipLlm: boolean): Promise<StageCritiqueResult> {
    const rule = defaultCritique(ctx);
    if (stageOk && !rule) {
        const pass: StageCritiqueResult = { reason: null, fromLlm: false };
        return pass;
    }
    const ruleReason = rule ?? (stageOk ? null : 'stage not ok');
    if (skipLlm || !api) {
        const out: StageCritiqueResult = { reason: ruleReason, fromLlm: false };
        return out;
    }
    const facts: string[] = [];
    facts.push(`stage=${stage}`);
    facts.push(`attempt=${ctx.attempt ?? 0}`);
    if (ctx.zeroMatch) {
        facts.push('zeroMatch=true');
    }
    if (ctx.warFailed) {
        facts.push('warFailed=true');
    }
    if (ctx.softMiss !== undefined) {
        facts.push(`softMiss=${ctx.softMiss}`);
    }
    if (ctx.hardLines && ctx.hardLines.length > 0) {
        facts.push(`hard=${ctx.hardLines.slice(0, 4).join(' | ')}`);
    }
    if (ruleReason) {
        facts.push(`rule=${ruleReason}`);
    }
    const prompt = `你是原理图流水线阶段批判器（只裁决是否重试，不生成电路）。\n` +
        `用户需求摘要: ${userPrompt.substring(0, 400)}\n` +
        `事实:\n- ${facts.join('\n- ')}\n\n` +
        `只输出一个 JSON：{"retry":true或false,"reason":"一句话中文原因"}\n` +
        `规则: 零匹配/空网/布局无器件 → retry=true；仅轻微告警可 retry=false。\n` +
        `禁止 markdown、代码围栏、其它文字。`;
    try {
        const chatOpts: ChatOptions = {
            capability: AiCapability.COMPONENT_RECOMMEND,
            temperature: 0.1,
            maxTokens: 256,
            disableThinking: true
        };
        const apiRes = await api.chat(prompt, chatOpts);
        if (!apiRes.success || !apiRes.data) {
            Logger.warn(INSTR_TRACE_TAG, `[AI_AGENT] stage=${stage} llm_critique unavailable — use rule`);
            const fallback: StageCritiqueResult = { reason: ruleReason, fromLlm: false };
            return fallback;
        }
        const parsed = StageCriticParse.parse(apiRes.data);
        if (!parsed) {
            const fallback: StageCritiqueResult = { reason: ruleReason, fromLlm: false };
            return fallback;
        }
        Logger.info(INSTR_TRACE_TAG, `[AI_AGENT] stage=${stage} llm_critique retry=${parsed.retry} | ${parsed.reason}`);
        if (!parsed.retry) {
            // hard 规则不可被 LLM retry:false 否决
            if (ctx.zeroMatch || ctx.warFailed ||
                (ctx.hardLines && ctx.hardLines.length > 0)) {
                const hard: StageCritiqueResult = {
                    reason: parsed.reason || ruleReason || 'hard gate', fromLlm: true
                };
                return hard;
            }
            const passLlm: StageCritiqueResult = { reason: null, fromLlm: true };
            return passLlm;
        }
        const retryOut: StageCritiqueResult = {
            reason: parsed.reason || ruleReason || 'llm retry', fromLlm: true
        };
        return retryOut;
    }
    catch (e) {
        Logger.warn(INSTR_TRACE_TAG, `[AI_AGENT] stage=${stage} llm_critique exception | ${e}`);
        const ex: StageCritiqueResult = { reason: ruleReason, fromLlm: false };
        return ex;
    }
}
class StageCriticParse {
    static parse(raw: string): LlmCritiqueParsed | null {
        let text = raw.trim();
        const a = text.indexOf('{');
        const b = text.lastIndexOf('}');
        if (a < 0 || b <= a) {
            return null;
        }
        text = text.substring(a, b + 1);
        try {
            const obj = JSON.parse(text) as Record<string, Object>;
            const retry = obj['retry'] === true || String(obj['retry']) === 'true';
            const reason = String(obj['reason'] ?? '');
            const parsed: LlmCritiqueParsed = { retry: retry, reason: reason };
            return parsed;
        }
        catch (_e) {
            return null;
        }
    }
}
