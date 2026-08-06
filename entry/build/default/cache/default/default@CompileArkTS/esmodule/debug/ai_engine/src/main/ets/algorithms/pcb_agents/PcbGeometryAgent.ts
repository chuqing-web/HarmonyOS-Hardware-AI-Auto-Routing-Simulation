import { Logger, INSTR_TRACE_TAG, runPcbGeometryRoute, copperLayersFromStack } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { PcbGeoFailDetail, PcbResidualKind, PcbGeometryResult } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { IAiApiManager } from 'ai_api_manager';
import { commitGeometryToWorkDoc } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbRouteBlackboard";
import type { PcbRouteBlackboard } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbRouteBlackboard";
import type { PcbAgentStageResult } from './PcbPlacementAgent';
import { applyLocalEscalatePhase, isSignalRouteFailReason } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbLocalEscalate";
/** busY+demote / 升层(若未锁) / 竖层脱stub / 轻挪×3 */
const GEO_ESCALATE_KINDS: number = 6;
/** 首次 + 每次 escalate 后重布 */
const GEO_MAX_ROUTE_PASSES: number = 7;
export class PcbGeometryAgent {
    async run(bb: PcbRouteBlackboard, _api: IAiApiManager, priorFailHint?: string): Promise<PcbAgentStageResult> {
        Logger.info(INSTR_TRACE_TAG, `[AI_PCB] stage=geometry begin runId=${bb.runId} mode=local`);
        if (!bb.workDoc || !bb.routePolicy || !bb.netPlan) {
            return { ok: false, reason: 'missing policy/netPlan/doc' };
        }
        if (!bb.routePolicy.fromLlm || !bb.netPlan.fromLlm) {
            return { ok: false, reason: 'geometry requires LLM net_plan + route_policy' };
        }
        if (priorFailHint && priorFailHint.length > 0) {
            Logger.info(INSTR_TRACE_TAG, `[AI_PCB] geometry local hint: ${priorFailHint.substring(0, 160)}`);
        }
        let lastGeo: PcbGeometryResult | null = null;
        let nextEscalate = 0;
        for (let pass = 0; pass < GEO_MAX_ROUTE_PASSES; pass++) {
            bb.workDoc.tracks = [];
            bb.workDoc.vias = [];
            const geo = runPcbGeometryRoute(bb.workDoc, bb.routePolicy, bb.netPlan);
            bb.geometry = geo;
            lastGeo = geo;
            if (geo.ok) {
                commitGeometryToWorkDoc(bb, geo.tracks, geo.vias);
                bb.markStage('geometry');
                const cu = copperLayersFromStack(bb.workDoc.layerStack).length;
                Logger.info(INSTR_TRACE_TAG, `[AI_PCB] stage=geometry ok local tracks=${geo.tracks.length}` +
                    ` vias=${geo.vias.length} routed=${geo.routedNetIds.length} cu=${cu}` +
                    ` pass=${pass}`);
                return { ok: true, reason: 'ok' };
            }
            this.logFailDetails(geo.failDetails);
            Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] geometry pass=${pass} fail failed=${geo.failedNetIds.length}` +
                ` | ${geo.reason}`);
            if (!isSignalRouteFailReason(geo.reason) && geo.failedNetIds.length === 0) {
                break;
            }
            let changed = false;
            while (nextEscalate < GEO_ESCALATE_KINDS && !changed) {
                changed = applyLocalEscalatePhase(bb, nextEscalate, geo.reason, geo.failedNetIds.length, geo.failDetails);
                Logger.info(INSTR_TRACE_TAG, `[AI_PCB] geometry local escalate kind=${nextEscalate} changed=${changed}`);
                nextEscalate++;
            }
            if (!changed) {
                Logger.warn(INSTR_TRACE_TAG, '[AI_PCB] geometry local escalate exhausted → hand off QA');
                break;
            }
            Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] geometry local escalate applied → re-route pass=${pass + 1}`);
        }
        const geo = lastGeo;
        if (!geo) {
            return { ok: false, reason: 'geometry never ran', residualKind: 'signal_fail' };
        }
        let residualKind: PcbResidualKind = 'signal_fail';
        if (geo.reason.indexOf('unused') >= 0 ||
            geo.reason.indexOf('copper layers unused') >= 0) {
            residualKind = 'unused_copper';
        }
        if (geo.tracks.length > 0 || geo.vias.length > 0) {
            commitGeometryToWorkDoc(bb, geo.tracks, geo.vias);
            Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] stage=geometry partial local commit tracks=${geo.tracks.length}` +
                ` failed=${geo.failedNetIds.length} | ${geo.reason}`);
            return { ok: false, reason: geo.reason, residualKind };
        }
        Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] stage=geometry fail (no copper) | ${geo.reason}`);
        return { ok: false, reason: geo.reason, residualKind };
    }
    private logFailDetails(details: PcbGeoFailDetail[] | undefined): void {
        if (!details) {
            return;
        }
        for (let i = 0; i < details.length && i < 8; i++) {
            const d = details[i];
            Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] geo_fail_detail ${d.netName} ${d.cause}` +
                ` (${Math.round(d.from.x)},${Math.round(d.from.y)})→` +
                `(${Math.round(d.to.x)},${Math.round(d.to.y)})` +
                (d.blocker ? ` | ${d.blocker}` : ''));
        }
    }
}
