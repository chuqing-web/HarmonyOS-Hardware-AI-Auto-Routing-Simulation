import { Logger, INSTR_TRACE_TAG } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ProgressCallback } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { IAiApiManager } from 'ai_api_manager';
import { CreatePipelineCtx } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/AiPipelineOrchestrator";
import type { AiPipelineOrchestrator, PipelineOptions } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/AiPipelineOrchestrator";
import type { CircuitBlackboard } from './CircuitBlackboard';
import { withCritiqueLimit } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/agents/StageHooks";
import type { StageHooks, StageHookContext, CritiqueAttemptResult } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/agents/StageHooks";
import { critiqueWithLlm } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/agents/StageCritic";
export interface LayoutAgentRunResult {
    ok: boolean;
    ctx: CreatePipelineCtx;
    reason?: string;
}
export class LayoutAgent {
    begin(bb: CircuitBlackboard): void {
        bb.log('layout begin');
        Logger.info(INSTR_TRACE_TAG, `[AI_AGENT] stage=layout begin runId=${bb.runId}`);
    }
    async run(bb: CircuitBlackboard, orch: AiPipelineOrchestrator, opts: PipelineOptions, ctxIn: CreatePipelineCtx, onProgress?: ProgressCallback, hooks: StageHooks | null = null, api?: IAiApiManager | null): Promise<LayoutAgentRunResult> {
        this.begin(bb);
        const result = await withCritiqueLimit<LayoutAgentRunResult>('layout', bb.runId, hooks, async (attempt: number): Promise<CritiqueAttemptResult<LayoutAgentRunResult>> => {
            // 每 attempt 新 ctx，只继承选型；避免上轮 placement 污染与 ArkTS null 收窄
            const ctx = new CreatePipelineCtx();
            ctx.usedLlm = ctxIn.usedLlm;
            ctx.degradedMode = ctxIn.degradedMode;
            ctx.selectLlm = ctxIn.selectLlm;
            ctx.selectResult = ctxIn.selectResult;
            Logger.info(INSTR_TRACE_TAG, `[AI_AGENT] stage=layout attempt=${attempt} runId=${bb.runId}`);
            const ok = await orch.runLayoutStage(opts, onProgress, ctx);
            bb.usedLlm = bb.usedLlm || ctx.usedLlm;
            ctxIn.usedLlm = ctx.usedLlm;
            ctxIn.degradedMode = ctx.degradedMode;
            ctxIn.layoutLlm = ctx.layoutLlm;
            ctxIn.placement = ctx.placement;
            ctxIn.abort = ctx.abort;
            let placed = false;
            let posN = 0;
            if (ctx.placement !== null) {
                placed = (ctx.placement.topology.deviceList?.length ?? 0) > 0;
            }
            if (ctx.layoutLlm !== null) {
                posN = ctx.layoutLlm.output.positions?.length ?? 0;
            }
            const hardLines: string[] = [];
            if (!placed) {
                hardLines.push('no devices placed');
            }
            if (opts.qualityHardFail && !opts.skipLlm && posN === 0) {
                hardLines.push('no LLM positions');
            }
            const stageOk = ok && placed && hardLines.length === 0;
            const critiqueCtx: StageHookContext = {
                stage: 'layout',
                runId: bb.runId,
                attempt: attempt,
                hardLines: hardLines
            };
            let reason: string | undefined = undefined;
            if (ctx.abort !== null && ctx.abort.ercErrors && ctx.abort.ercErrors.length > 0) {
                reason = ctx.abort.ercErrors[0].desc;
            }
            else if (hardLines.length > 0) {
                reason = hardLines[0];
            }
            const value: LayoutAgentRunResult = {
                ok: stageOk,
                ctx: ctx,
                reason: reason
            };
            const out: CritiqueAttemptResult<LayoutAgentRunResult> = {
                ok: stageOk,
                value: value,
                critiqueCtx: critiqueCtx
            };
            return out;
        }, (_last, reason) => {
            Logger.error(INSTR_TRACE_TAG, `[AI_AGENT] stage=layout critique exhausted | ${reason}`);
            const fail: LayoutAgentRunResult = { ok: false, ctx: ctxIn, reason: reason };
            return fail;
        }, async (ctx, stageOk) => {
            const c = await critiqueWithLlm(api ?? null, 'layout', opts.prompt, ctx, stageOk, !!opts.skipLlm);
            return c.reason;
        });
        if (result.ok && result.ctx.placement) {
            bb.placement = result.ctx.placement;
            if (result.ctx.layoutLlm) {
                bb.layoutLlm = result.ctx.layoutLlm.output;
            }
            bb.markStageDone('layout');
        }
        this.end(bb, result.ok, result.reason ?? '');
        return result;
    }
    end(bb: CircuitBlackboard, ok: boolean, detail: string = ''): void {
        bb.log(`layout ${ok ? 'ok' : 'fail'} ${detail}`);
        Logger.info(INSTR_TRACE_TAG, `[AI_AGENT] stage=layout ${ok ? 'ok' : 'fail'} ${detail}`);
    }
}
