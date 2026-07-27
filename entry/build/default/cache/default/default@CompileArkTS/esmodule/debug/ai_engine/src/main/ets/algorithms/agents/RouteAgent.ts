import { Logger, INSTR_TRACE_TAG } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchTopology } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { IComponentLibrary } from 'component_library';
import { WarRouteAdapter } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/WarRouteAdapter";
import type { WarRouteAdapterResult } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/WarRouteAdapter";
import type { CircuitBlackboard } from './CircuitBlackboard';
import { QA_FIX_ROUNDS } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/agents/StageHooks";
export interface RouteAgentResult {
    ok: boolean;
    routedNets: number;
    reason: string;
    rounds: number;
}
export class RouteAgent {
    private warAdapter: WarRouteAdapter = new WarRouteAdapter();
    constructor(library: IComponentLibrary) {
        this.warAdapter.setComponentLibrary(library);
    }
    begin(bb: CircuitBlackboard): void {
        bb.log('route begin');
        Logger.info(INSTR_TRACE_TAG, `[AI_AGENT] stage=route begin runId=${bb.runId}`);
    }
    /**
     * 对缺线网做 WAR；最多 QA_FIX_ROUNDS+1 次尝试。
     */
    async ensureWar(topo: SchTopology, isCancel?: () => boolean): Promise<RouteAgentResult> {
        let last: WarRouteAdapterResult = {
            ok: false, routedNets: 0, failedNets: [], demotedNets: [], reason: 'not_run'
        };
        for (let round = 0; round <= QA_FIX_ROUNDS; round++) {
            if (isCancel && isCancel()) {
                const cancelled: RouteAgentResult = {
                    ok: false, routedNets: 0, reason: 'cancelled', rounds: round
                };
                return cancelled;
            }
            // 每轮前清非 stub，避免失败 partial 污染
            topo.wireList = WarRouteAdapter.stripNonStubWires(topo.wireList);
            last = await this.warAdapter.routeTopology(topo, true, isCancel);
            if (last.ok) {
                Logger.info(INSTR_TRACE_TAG, `[AI_AGENT] route via WAR ok routedNets=${last.routedNets} round=${round}`);
                const okOut: RouteAgentResult = {
                    ok: true,
                    routedNets: last.routedNets,
                    reason: 'ok',
                    rounds: round
                };
                return okOut;
            }
            Logger.warn(INSTR_TRACE_TAG, `[AI_AGENT] WAR retry round=${round} failedNets=${last.failedNets.slice(0, 6).join(',')}` +
                ` | ${last.reason}`);
        }
        const failOut: RouteAgentResult = {
            ok: false,
            routedNets: last.routedNets,
            reason: last.reason,
            rounds: QA_FIX_ROUNDS
        };
        return failOut;
    }
    end(bb: CircuitBlackboard, ok: boolean, detail: string = ''): void {
        bb.log(`route ${ok ? 'ok' : 'fail'} ${detail}`);
        Logger.info(INSTR_TRACE_TAG, `[AI_AGENT] stage=route ${ok ? 'ok' : 'fail'} ${detail}`);
    }
}
