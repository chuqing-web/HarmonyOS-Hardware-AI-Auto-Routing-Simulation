import { Logger, INSTR_TRACE_TAG, runPcbGeometryRoute } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { commitGeometryToWorkDoc } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbRouteBlackboard";
import type { PcbRouteBlackboard } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbRouteBlackboard";
import type { PcbAgentStageResult } from './PcbPlacementAgent';
export class PcbGeometryAgent {
    run(bb: PcbRouteBlackboard): PcbAgentStageResult {
        Logger.info(INSTR_TRACE_TAG, `[AI_PCB] stage=geometry begin runId=${bb.runId}`);
        if (!bb.workDoc || !bb.routePolicy || !bb.netPlan) {
            return { ok: false, reason: 'missing policy/netPlan/doc' };
        }
        if (!bb.routePolicy.fromLlm || !bb.netPlan.fromLlm) {
            return { ok: false, reason: 'geometry refuses non-LLM policy' };
        }
        // 全量重布：清空旧铜，避免旧线当障碍误杀
        bb.workDoc.tracks = [];
        bb.workDoc.vias = [];
        const geo = runPcbGeometryRoute(bb.workDoc, bb.routePolicy, bb.netPlan);
        bb.geometry = geo;
        if (!geo.ok) {
            // 部分成功（有铜）仍 commit，供 QA rip/retry；零铜不 commit
            if (geo.tracks.length > 0 || geo.vias.length > 0) {
                commitGeometryToWorkDoc(bb, geo.tracks, geo.vias);
                Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] stage=geometry partial commit tracks=${geo.tracks.length} | ${geo.reason}`);
            }
            else {
                Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] stage=geometry fail | ${geo.reason}`);
            }
            return { ok: false, reason: geo.reason, residualKind: 'signal_fail' };
        }
        commitGeometryToWorkDoc(bb, geo.tracks, geo.vias);
        bb.markStage('geometry');
        Logger.info(INSTR_TRACE_TAG, `[AI_PCB] stage=geometry ok tracks=${geo.tracks.length} vias=${geo.vias.length}`);
        return { ok: true, reason: 'ok' };
    }
}
