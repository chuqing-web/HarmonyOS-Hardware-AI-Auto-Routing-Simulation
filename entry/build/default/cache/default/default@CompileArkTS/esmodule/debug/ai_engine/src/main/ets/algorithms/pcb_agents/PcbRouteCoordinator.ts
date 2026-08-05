import { emptyPcbAiRouteResult, IdUtil, Logger, INSTR_TRACE_TAG, makeProgress } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { PcbDocument, PcbAiRouteResult, PcbResidualKind, ProgressCallback } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { IAiApiManager } from 'ai_api_manager';
import { PcbRouteBlackboard } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbRouteBlackboard";
import { PcbPlacementAgent } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbPlacementAgent";
import type { PcbAgentStageResult } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbPlacementAgent";
import { PcbNetPlanAgent } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbNetPlanAgent";
import { PcbRoutePolicyAgent } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbRoutePolicyAgent";
import { PcbGeometryAgent } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbGeometryAgent";
import { PcbQaAgent } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbQaAgent";
import type { PcbDrcRunner } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbQaAgent";
import { shouldSkipQaAfterGeometryFail } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbLlmReplyGuard";
const PCB_KEEP_RETRY_OUTER: number = 3;
/** 网络/传输类失败（与布局规则失败区分，避免掩盖「已有 LLM 回复」） */
function isNetworkishFailReason(reason: string): boolean {
    const m = reason.toLowerCase();
    return m.indexOf('request failed') >= 0
        || m.indexOf('timeout') >= 0
        || m.indexOf('超时') >= 0
        || m.indexOf('2300') >= 0
        || m.indexOf('network') >= 0
        || m.indexOf('connect') >= 0
        || m.indexOf('代理') >= 0
        || m.indexOf('http') >= 0
        || m.indexOf('cancelled') >= 0
        || m.indexOf('empty content') >= 0
        || m.indexOf('non-json body') >= 0
        || m.indexOf('llm failed') >= 0
        || m.indexOf('placement llm failed') >= 0;
}
/** 可软接受的 residual：仅少量未布网；硬 DRC / 缺铜 / 信号失败拒写 */
function isSoftAcceptableResidual(kind: PcbResidualKind, reason: string): boolean {
    if (kind === 'unused_copper' || kind === 'signal_fail' || kind === 'placement_only') {
        return false;
    }
    const u = reason.toUpperCase();
    if (u.indexOf('SHORT') >= 0 || u.indexOf('CLEARANCE') >= 0) {
        return false;
    }
    if (kind === 'unrouted') {
        return true;
    }
    // 轻微 drc 且无 SHORT/CLEARANCE：仍拒（避免脏板写回）；仅 unrouted 可 soft
    return false;
}
export class PcbRouteCoordinator {
    private bb: PcbRouteBlackboard = new PcbRouteBlackboard();
    private placement = new PcbPlacementAgent();
    private netPlan = new PcbNetPlanAgent();
    private routePolicy = new PcbRoutePolicyAgent();
    private geometry = new PcbGeometryAgent();
    private qa = new PcbQaAgent();
    async run(sourceDoc: PcbDocument, api: IAiApiManager, runDrc: PcbDrcRunner, isCancel?: () => boolean, onProgress?: ProgressCallback, enableReasoning: boolean = false): Promise<PcbAiRouteResult> {
        const runId = IdUtil.generate('pcbai');
        Logger.info(INSTR_TRACE_TAG, `[AI_PCB] START runId=${runId} fp=${sourceDoc.footprints.length} nets=${sourceDoc.nets.length}` +
            ` reasoning=${enableReasoning}`);
        this.bb.reset(runId, sourceDoc, enableReasoning);
        onProgress?.(makeProgress(8, 'PCB AI 准备'));
        if (isCancel && isCancel()) {
            return emptyPcbAiRouteResult('start', 'cancelled', false);
        }
        let placeHint = '';
        onProgress?.(makeProgress(15, 'PCB 布局'));
        const p1 = await this.keepRetry('placement', isCancel, placeHint, (hint) => this.placement.run(this.bb, api, hint));
        if (!p1.ok) {
            return this.stageFail('placement', p1.reason);
        }
        if (isCancel && isCancel()) {
            return emptyPcbAiRouteResult('placement', 'cancelled', this.bb.usedLlm);
        }
        let netHint = '';
        onProgress?.(makeProgress(30, 'PCB 网络计划'));
        const p2 = await this.keepRetry('net_plan', isCancel, netHint, (hint) => this.netPlan.run(this.bb, api, hint));
        if (!p2.ok) {
            return this.stageFail('net_plan', p2.reason);
        }
        let lastQaReason = '';
        let lastResidualKind: PcbResidualKind = 'drc';
        for (let outer = 0; outer < PCB_KEEP_RETRY_OUTER; outer++) {
            if (isCancel && isCancel()) {
                return emptyPcbAiRouteResult('route_policy', 'cancelled', this.bb.usedLlm);
            }
            const failHint = lastQaReason.length > 0 ? lastQaReason : undefined;
            onProgress?.(makeProgress(45 + outer * 5, `PCB 层角色策略 (${outer + 1})`));
            const p3 = await this.keepRetry('route_policy', isCancel, failHint ?? '', (hint) => this.routePolicy.run(this.bb, api, hint.length > 0 ? hint : failHint));
            if (!p3.ok) {
                Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] KEEP_RETRY route_policy exhausted outer=${outer + 1}/${PCB_KEEP_RETRY_OUTER} | ${p3.reason}`);
                lastQaReason = p3.reason;
                lastResidualKind = 'drc';
                continue;
            }
            onProgress?.(makeProgress(65 + outer * 3, 'PCB 几何布线(LLM)'));
            const p4 = await this.keepRetry('geometry', isCancel, failHint ?? '', (hint) => this.geometry.run(this.bb, api, hint.length > 0 ? hint : failHint));
            if (!p4.ok) {
                if (shouldSkipQaAfterGeometryFail(p4.reason)) {
                    Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] geometry not applied → skip qa_repair outer=${outer + 1} | ${p4.reason}`);
                    lastQaReason = p4.reason;
                    lastResidualKind = 'signal_fail';
                    continue;
                }
                Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] geometry soft-fail → qa_repair | ${p4.reason}`);
            }
            onProgress?.(makeProgress(78 + outer * 3, 'PCB DRC/QA'));
            const p5 = await this.qa.gate(this.bb, api, runDrc);
            if (p5.ok) {
                const kind: PcbResidualKind = p5.residual
                    ? (p5.residualKind ?? 'drc')
                    : 'none';
                return this.successResult(!!p5.residual, kind, p5.residual ? p5.reason : '');
            }
            lastQaReason = p5.reason;
            lastResidualKind = p5.residualKind ?? 'drc';
            Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] KEEP_RETRY demote ABORT→RETRY outer=${outer + 1}/${PCB_KEEP_RETRY_OUTER} | ${p5.reason}`);
        }
        // 仅 soft residual + 有铜 才 ACCEPT；硬残留 STAGE_FAIL
        if (this.bb.usedLlm && this.hasDeliverableGeometry() &&
            isSoftAcceptableResidual(lastResidualKind, lastQaReason)) {
            Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] KEEP_RETRY ACCEPT soft residual kind=${lastResidualKind} | ${lastQaReason}`);
            return this.successResult(true, lastResidualKind, lastQaReason.length > 0 ? lastQaReason : 'residual after retries');
        }
        if (this.hasDeliverableGeometry() && !isSoftAcceptableResidual(lastResidualKind, lastQaReason)) {
            Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] refuse dirty residual kind=${lastResidualKind} | ${lastQaReason}`);
        }
        return this.stageFail('qa', lastQaReason.length > 0 ? lastQaReason : 'PCB AI exhausted without deliverable copper');
    }
    private async keepRetry(stage: string, isCancel: (() => boolean) | undefined, initialHint: string, fn: (hint: string) => Promise<PcbAgentStageResult>): Promise<PcbAgentStageResult> {
        let last: PcbAgentStageResult = { ok: false, reason: `${stage} not run` };
        let hint = initialHint;
        let layoutFailReason = '';
        for (let outer = 0; outer < PCB_KEEP_RETRY_OUTER; outer++) {
            if (isCancel && isCancel()) {
                return { ok: false, reason: 'cancelled' };
            }
            last = await fn(hint);
            if (last.ok) {
                return last;
            }
            hint = last.reason;
            // 区分布局规则失败 vs 后续网络失败，避免「明明有回复却报网络」
            if (!isNetworkishFailReason(last.reason)) {
                layoutFailReason = last.reason;
            }
            Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] KEEP_RETRY ${stage} outer=${outer + 1}/${PCB_KEEP_RETRY_OUTER} | ${last.reason}`);
        }
        if (layoutFailReason.length > 0 && isNetworkishFailReason(last.reason)) {
            return {
                ok: false,
                reason: `${layoutFailReason}；其后重试网络失败: ${last.reason}`
            };
        }
        return last;
    }
    private hasDeliverableGeometry(): boolean {
        const tracks = this.bb.workDoc?.tracks?.length ?? 0;
        const vias = this.bb.workDoc?.vias?.length ?? 0;
        return tracks > 0 || vias > 0;
    }
    private successResult(residual: boolean, kind: PcbResidualKind, residualNote: string = ''): PcbAiRouteResult {
        if (!this.bb.usedLlm) {
            return this.stageFail('gate', 'usedLlm=false — refuse non-AI delivery');
        }
        if (!this.hasDeliverableGeometry()) {
            return this.stageFail('gate', 'refuse empty-copper delivery');
        }
        if (residual && !isSoftAcceptableResidual(kind, residualNote)) {
            return this.stageFail('gate', `refuse dirty residual[${kind}]: ${residualNote.length > 0 ? residualNote : kind}`);
        }
        const tracks = this.bb.workDoc?.tracks ?? [];
        const vias = this.bb.workDoc?.vias ?? [];
        const footprints = this.bb.workDoc?.footprints;
        const msg = residual
            ? `AI PCB route residual[${kind}] tracks=${tracks.length} vias=${vias.length}` +
                (residualNote.length > 0 ? ` | ${residualNote}` : '')
            : `AI PCB route ok tracks=${tracks.length} vias=${vias.length}`;
        const result: PcbAiRouteResult = {
            success: true,
            usedLlm: true,
            abortStage: '',
            abortReason: '',
            deliveredWithResidual: residual,
            residualKind: residual ? kind : 'none',
            trackCount: tracks.length,
            viaCount: vias.length,
            netCount: this.bb.geometry?.routedNetIds.length ?? 0,
            placedCount: this.bb.placementPlan?.placements.length ?? 0,
            messages: [msg],
            tracks,
            vias,
            footprints,
            placementPlan: this.bb.placementPlan ?? undefined,
            netPlan: this.bb.netPlan ?? undefined,
            routePolicy: this.bb.routePolicy ?? undefined
        };
        Logger.info(INSTR_TRACE_TAG, `[AI_PCB] DONE runId=${this.bb.runId} residual=${residual} kind=${kind}` +
            ` tracks=${tracks.length} vias=${vias.length}`);
        return result;
    }
    private stageFail(stage: string, reason: string): PcbAiRouteResult {
        Logger.error(INSTR_TRACE_TAG, `[AI_PCB] STAGE_FAIL ${stage} | ${reason}`);
        this.bb.abort(stage, reason);
        return emptyPcbAiRouteResult(this.bb.abortStage, this.bb.abortReason, this.bb.usedLlm);
    }
}
