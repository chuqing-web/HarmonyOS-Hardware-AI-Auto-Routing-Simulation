import { Logger, INSTR_TRACE_TAG } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ProgressCallback } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { IAiApiManager } from 'ai_api_manager';
import { CreatePipelineCtx } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/AiPipelineOrchestrator";
import type { AiPipelineOrchestrator, PipelineOptions } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/AiPipelineOrchestrator";
import type { CircuitBlackboard } from './CircuitBlackboard';
import { withCritiqueLimit } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/agents/StageHooks";
import type { StageHooks, StageHookContext, CritiqueAttemptResult } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/agents/StageHooks";
import { critiqueWithLlm } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/agents/StageCritic";
export interface NetAgentRunResult {
    ok: boolean;
    ctx: CreatePipelineCtx;
    reason?: string;
}
export class NetAgent {
    begin(bb: CircuitBlackboard): void {
        bb.log('net begin');
        Logger.info(INSTR_TRACE_TAG, `[AI_AGENT] stage=net begin runId=${bb.runId}`);
    }
    async run(bb: CircuitBlackboard, orch: AiPipelineOrchestrator, opts: PipelineOptions, ctxIn: CreatePipelineCtx, onProgress?: ProgressCallback, hooks: StageHooks | null = null, api?: IAiApiManager | null): Promise<NetAgentRunResult> {
        this.begin(bb);
        const result = await withCritiqueLimit<NetAgentRunResult>('net', bb.runId, hooks, async (attempt: number): Promise<CritiqueAttemptResult<NetAgentRunResult>> => {
            // 每 attempt 新 ctx，继承选型+摆放；避免半成品与 null 收窄
            const ctx = new CreatePipelineCtx();
            ctx.usedLlm = ctxIn.usedLlm;
            ctx.degradedMode = ctxIn.degradedMode;
            ctx.selectLlm = ctxIn.selectLlm;
            ctx.selectResult = ctxIn.selectResult;
            ctx.layoutLlm = ctxIn.layoutLlm;
            ctx.placement = ctxIn.placement;
            Logger.info(INSTR_TRACE_TAG, `[AI_AGENT] stage=net attempt=${attempt} runId=${bb.runId}`);
            const ok = await orch.runNetStage(opts, onProgress, ctx);
            bb.usedLlm = bb.usedLlm || ctx.usedLlm;
            ctxIn.usedLlm = ctx.usedLlm;
            ctxIn.degradedMode = ctx.degradedMode;
            ctxIn.netPlanResult = ctx.netPlanResult;
            ctxIn.topoWithNets = ctx.topoWithNets;
            ctxIn.netPlanNotes = ctx.netPlanNotes;
            ctxIn.abort = ctx.abort;
            let nets = 0;
            if (ctx.topoWithNets !== null) {
                nets = ctx.topoWithNets.netList?.length ?? 0;
            }
            let fromLlm = false;
            if (ctx.netPlanResult !== null) {
                fromLlm = ctx.netPlanResult.fromLlm;
            }
            const softMiss = fromLlm || opts.skipLlm ? 0 : 1;
            const hardLines: string[] = [];
            if (nets === 0) {
                hardLines.push('empty nets');
            }
            const stageOk = ok && nets > 0;
            const critiqueCtx: StageHookContext = {
                stage: 'net',
                runId: bb.runId,
                attempt: attempt,
                softMiss: softMiss,
                hardLines: hardLines
            };
            let reason: string | undefined = undefined;
            if (ctx.abort !== null && ctx.abort.ercErrors && ctx.abort.ercErrors.length > 0) {
                reason = ctx.abort.ercErrors[0].desc;
            }
            else if (nets === 0) {
                reason = 'empty nets';
            }
            const value: NetAgentRunResult = {
                ok: stageOk,
                ctx: ctx,
                reason: reason
            };
            const out: CritiqueAttemptResult<NetAgentRunResult> = {
                ok: stageOk,
                value: value,
                critiqueCtx: critiqueCtx
            };
            return out;
        }, (_last, reason) => {
            Logger.error(INSTR_TRACE_TAG, `[AI_AGENT] stage=net critique exhausted | ${reason}`);
            const fail: NetAgentRunResult = { ok: false, ctx: ctxIn, reason: reason };
            return fail;
        }, async (ctx, stageOk) => {
            const c = await critiqueWithLlm(api ?? null, 'net', opts.prompt, ctx, stageOk, !!opts.skipLlm);
            return c.reason;
        });
        if (result.ok && result.ctx.topoWithNets) {
            bb.topology = result.ctx.topoWithNets;
            bb.degradedMode = bb.degradedMode || !!result.ctx.degradedMode;
            bb.markStageDone('net');
        }
        this.end(bb, result.ok, result.reason ?? `nets=${result.ctx.topoWithNets?.netList?.length ?? 0}`);
        return result;
    }
    end(bb: CircuitBlackboard, ok: boolean, detail: string = ''): void {
        bb.log(`net ${ok ? 'ok' : 'fail'} ${detail}`);
        Logger.info(INSTR_TRACE_TAG, `[AI_AGENT] stage=net ${ok ? 'ok' : 'fail'} ${detail}`);
    }
}
