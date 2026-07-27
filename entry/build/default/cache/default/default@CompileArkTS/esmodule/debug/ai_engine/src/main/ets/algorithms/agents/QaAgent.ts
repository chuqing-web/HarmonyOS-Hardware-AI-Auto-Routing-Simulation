import { emptySchTopology, Logger, INSTR_TRACE_TAG } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { AiPipelineResult } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { CircuitBlackboard } from './CircuitBlackboard';
import type { RouteAgent } from './RouteAgent';
import { QA_FIX_ROUNDS } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/agents/StageHooks";
import { WarRouteAdapter } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/WarRouteAdapter";
export interface QaAgentResult {
    ok: boolean;
    abort: boolean;
    result: AiPipelineResult;
}
export class QaAgent {
    private routeAgent: RouteAgent;
    constructor(routeAgent: RouteAgent) {
        this.routeAgent = routeAgent;
    }
    begin(bb: CircuitBlackboard): void {
        bb.log('qa begin');
        Logger.info(INSTR_TRACE_TAG, `[AI_AGENT] stage=qa begin runId=${bb.runId}`);
    }
    /**
     * hardFail：残留则先有限 WAR 再检；仍脏 → ABORT 空拓扑。
     */
    async gate(bb: CircuitBlackboard, result: AiPipelineResult, hardFail: boolean, isCancel?: () => boolean): Promise<QaAgentResult> {
        if (!hardFail) {
            this.end(bb, !!result.ercClean, 'soft');
            const soft: QaAgentResult = { ok: !!result.ercClean, abort: false, result: result };
            return soft;
        }
        if (result.deliveredWithResidual || !result.ercClean) {
            Logger.warn(INSTR_TRACE_TAG, `[AI_AGENT] QaAgent residual — limited WAR x${QA_FIX_ROUNDS}`);
            if (result.topology && result.topology.deviceList.length > 0) {
                result.topology.wireList = WarRouteAdapter.stripNonStubWires(result.topology.wireList);
                const war = await this.routeAgent.ensureWar(result.topology, isCancel);
                if (!war.ok) {
                    Logger.error(INSTR_TRACE_TAG, `[AI_AGENT] ABORT qa | WAR ${war.reason}`);
                    this.end(bb, false, war.reason);
                    bb.abort('qa', war.reason);
                    const abortPipe: AiPipelineResult = {
                        topology: emptySchTopology(),
                        usedLlm: result.usedLlm,
                        degradedMode: false,
                        ercClean: false,
                        geoBlocking: result.geoBlocking ?? 0,
                        agentAbortStage: 'qa',
                        agentAbortReason: war.reason,
                        requirementSpec: bb.requirementSpec,
                        ercErrors: [{
                                errType: 'qa_war',
                                targetUuid: '',
                                desc: war.reason,
                                suggest: '调整摆放或简化连线后重试',
                                severity: 'error'
                            }]
                    };
                    const abortOut: QaAgentResult = { ok: false, abort: true, result: abortPipe };
                    return abortOut;
                }
            }
            // 残留/未清零：非阻塞，带警告交付（上层 AppService 做软接受决策）
            if (result.deliveredWithResidual || !result.ercClean) {
                Logger.warn(INSTR_TRACE_TAG, `[AI_AGENT] QA residual warn ercClean=${result.ercClean}` +
                    ` residual=${!!result.deliveredWithResidual}`);
                this.end(bb, false, 'residual_warn');
                // 不抹除拓扑：保留有用结果，标记 deliveredWithResidual 让上层知情
                const warnPipe: AiPipelineResult = {
                    topology: result.topology,
                    usedLlm: result.usedLlm,
                    degradedMode: false,
                    ercClean: result.ercClean,
                    geoBlocking: result.geoBlocking ?? 0,
                    deliveredWithResidual: true,
                    agentAbortStage: '',
                    agentAbortReason: '',
                    requirementSpec: bb.requirementSpec,
                    selectResult: result.selectResult,
                    ercErrors: result.ercErrors ?? [],
                    needsClarification: false,
                    clarificationQuestions: []
                };
                const warnOut: QaAgentResult = { ok: true, abort: false, result: warnPipe };
                return warnOut;
            }
        }
        this.end(bb, true, 'pass');
        const pass: QaAgentResult = { ok: true, abort: false, result: result };
        return pass;
    }
    end(bb: CircuitBlackboard, ok: boolean, detail: string = ''): void {
        bb.log(`qa ${ok ? 'ok' : 'fail'} ${detail}`);
        Logger.info(INSTR_TRACE_TAG, `[AI_AGENT] stage=qa ${ok ? 'ok' : 'fail'} ${detail}`);
    }
}
