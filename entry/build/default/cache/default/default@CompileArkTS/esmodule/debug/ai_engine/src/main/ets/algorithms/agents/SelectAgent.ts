import { Logger, INSTR_TRACE_TAG } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ProgressCallback } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { IAiApiManager } from 'ai_api_manager';
import { CreatePipelineCtx } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/AiPipelineOrchestrator";
import type { AiPipelineOrchestrator, PipelineOptions } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/AiPipelineOrchestrator";
import type { CircuitBlackboard } from './CircuitBlackboard';
import { withCritiqueLimit } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/agents/StageHooks";
import type { StageHooks, StageHookContext, CritiqueAttemptResult } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/agents/StageHooks";
import { critiqueWithLlm } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/agents/StageCritic";
export interface SelectAgentRunResult {
    ok: boolean;
    ctx: CreatePipelineCtx;
    reason?: string;
}
export class SelectAgent {
    begin(bb: CircuitBlackboard): void {
        bb.log('select begin');
        Logger.info(INSTR_TRACE_TAG, `[AI_AGENT] stage=select begin runId=${bb.runId}`);
    }
    async run(bb: CircuitBlackboard, orch: AiPipelineOrchestrator, opts: PipelineOptions, onProgress?: ProgressCallback, hooks: StageHooks | null = null, api?: IAiApiManager | null): Promise<SelectAgentRunResult> {
        this.begin(bb);
        const hard = !!opts.qualityHardFail && !opts.skipLlm;
        const result = await withCritiqueLimit<SelectAgentRunResult>('select', bb.runId, hooks, async (attempt: number): Promise<CritiqueAttemptResult<SelectAgentRunResult>> => {
            const ctx = new CreatePipelineCtx();
            ctx.usedLlm = bb.usedLlm;
            Logger.info(INSTR_TRACE_TAG, `[AI_AGENT] stage=select attempt=${attempt} runId=${bb.runId}`);
            const ok = await orch.runSelectStage(opts, onProgress, ctx);
            bb.usedLlm = bb.usedLlm || ctx.usedLlm;
            // 失败也写快照，便于诊断/续跑
            if (ctx.selectLlm) {
                bb.selectLlmOutput = ctx.selectLlm.output;
                bb.selectLlmFromLlm = ctx.selectLlm.fromLlm;
            }
            if (ctx.selectResult) {
                bb.selectResult = ctx.selectResult;
                bb.matchedDevices = ctx.selectResult.devices ?? [];
            }
            const zero = !ctx.selectResult || ctx.selectResult.devices.length === 0;
            const requireN = ctx.selectLlm?.output?.deviceRequireList?.length ?? 0;
            const matchedReq = ctx.selectResult?.matchedRequireCount ?? 0;
            const partial = hard && requireN > 0 && matchedReq < requireN;
            const oodN = ctx.selectLlm?.output?.oodFlags?.length ?? 0;
            const hardLines: string[] = [];
            if (partial) {
                hardLines.push(`partial BOM ${matchedReq}/${requireN}`);
            }
            const stageOk = ok && !zero && !partial;
            const critiqueCtx: StageHookContext = {
                stage: 'select',
                runId: bb.runId,
                attempt: attempt,
                zeroMatch: zero,
                softMiss: oodN > 0 ? oodN : 0,
                hardLines: hardLines
            };
            const value: SelectAgentRunResult = {
                ok: stageOk,
                ctx: ctx,
                reason: ctx.abort?.ercErrors?.[0]?.desc ??
                    (partial ? `partial BOM ${matchedReq}/${requireN}` : undefined)
            };
            const out: CritiqueAttemptResult<SelectAgentRunResult> = {
                ok: stageOk,
                value: value,
                critiqueCtx: critiqueCtx
            };
            return out;
        }, (_last, reason) => {
            Logger.error(INSTR_TRACE_TAG, `[AI_AGENT] stage=select critique exhausted | ${reason}`);
            const fail: SelectAgentRunResult = {
                ok: false, ctx: new CreatePipelineCtx(), reason: reason
            };
            return fail;
        }, async (ctx, stageOk) => {
            const c = await critiqueWithLlm(api ?? null, 'select', opts.prompt, ctx, stageOk, !!opts.skipLlm);
            return c.reason;
        });
        if (result.ok && result.ctx.selectResult) {
            bb.selectResult = result.ctx.selectResult;
            bb.matchedDevices = result.ctx.selectResult.devices ?? [];
            if (result.ctx.selectLlm) {
                bb.selectLlmOutput = result.ctx.selectLlm.output;
                bb.selectLlmFromLlm = result.ctx.selectLlm.fromLlm;
            }
            bb.markStageDone('select');
        }
        this.end(bb, result.ok, result.reason ?? '');
        return result;
    }
    end(bb: CircuitBlackboard, ok: boolean, detail: string = ''): void {
        bb.log(`select ${ok ? 'ok' : 'fail'} ${detail}`);
        Logger.info(INSTR_TRACE_TAG, `[AI_AGENT] stage=select ${ok ? 'ok' : 'fail'} ${detail}`);
    }
}
