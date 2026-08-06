import { Logger, INSTR_TRACE_TAG, copperLayersFromStack, policyCoversCopperLayers, validateLayerRoleSemantics, policyHasStub } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { IAiApiManager } from 'ai_api_manager';
import { PromptLoader } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/prompts/PromptLoader";
import type { PcbRouteBlackboard } from './PcbRouteBlackboard';
import { PcbDocSummarizer } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbDocSummarizer";
import { parsePcbRoutePolicy } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbLlmParsers";
import type { PcbAgentStageResult } from './PcbPlacementAgent';
import { pcbStageChatOpts } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbChatOpts";
import { pcbImpureReplyReason } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbLlmReplyGuard";
export class PcbRoutePolicyAgent {
    async run(bb: PcbRouteBlackboard, api: IAiApiManager, priorFailHint?: string): Promise<PcbAgentStageResult> {
        Logger.info(INSTR_TRACE_TAG, `[AI_PCB] stage=route_policy begin runId=${bb.runId}`);
        if (!bb.workDoc || !bb.netPlan) {
            return { ok: false, reason: 'missing workDoc/netPlan' };
        }
        const tpl = PromptLoader.load('pcb_route');
        if (!tpl.system || tpl.system.length === 0) {
            return { ok: false, reason: 'pcb_route prompt missing' };
        }
        const netSummary = bb.netPlan.nets.map(n => `${n.netName}:${n.kind}/${n.routeMode}/p${n.priority}` +
            (n.layerHint ? `/L=${n.layerHint}` : '') +
            (n.busYOffset !== undefined ? `/busY=${n.busYOffset}` : '')).join(',');
        let boardSummary = `【UNITS】coord=mil\n` +
            PcbDocSummarizer.boardDiagSnapshot(bb.workDoc, bb.geometry);
        if (priorFailHint && priorFailHint.length > 0) {
            boardSummary = `${boardSummary}\n【上轮失败须修正】${priorFailHint}`;
        }
        const prompt = PromptLoader.render(tpl, [
            { key: 'copper_layers', value: PcbDocSummarizer.copperLayers(bb.workDoc) },
            { key: 'net_plan_summary', value: netSummary },
            { key: 'board_summary', value: boardSummary }
        ]);
        const apiRes = await api.chat(prompt, pcbStageChatOpts(bb.enableReasoning, 0.05));
        if (!apiRes.success || !apiRes.data) {
            return { ok: false, reason: apiRes.error ?? 'route_policy LLM failed' };
        }
        bb.usedLlm = true;
        const impure = pcbImpureReplyReason('route_policy', apiRes.data);
        if (impure) {
            return { ok: false, reason: impure };
        }
        const policy = parsePcbRoutePolicy(apiRes.data);
        if (!policy) {
            return { ok: false, reason: `route_policy LLM JSON invalid (${PromptLoader.describeJsonImpurity(apiRes.data)})` };
        }
        if (!policy.fromLlm) {
            return { ok: false, reason: 'route_policy not from LLM — refuse local spoof' };
        }
        const copper = copperLayersFromStack(bb.workDoc.layerStack);
        const copperSet: Set<string> = new Set();
        for (let i = 0; i < copper.length; i++) {
            copperSet.add(copper[i] as string);
        }
        // 加固：layerRoles 的 key 必须是当前板铜层，禁止 Silk/Mask/编造层
        const roleKeys = Object.keys(policy.layerRoles);
        const badKeys: string[] = [];
        for (let i = 0; i < roleKeys.length; i++) {
            if (!copperSet.has(roleKeys[i])) {
                badKeys.push(roleKeys[i]);
            }
        }
        if (badKeys.length > 0) {
            return {
                ok: false,
                reason: `layerRoles illegal keys: ${badKeys.join(',')} — must be copper only (${Array.from(copperSet).join(',')})`
            };
        }
        const missing = policyCoversCopperLayers(policy, copper);
        if (missing.length > 0) {
            return { ok: false, reason: `layerRoles missing: ${missing.join(',')}` };
        }
        if (!policyHasStub(policy)) {
            return { ok: false, reason: 'layerRoles missing stub — at least one copper layer must be stub' };
        }
        const sem = validateLayerRoleSemantics(policy, bb.netPlan);
        if (sem.length > 0) {
            return { ok: false, reason: `layerRoles semantic: ${sem.join('; ')}` };
        }
        // 加固：routable 网的 netPriority 缺省时从 net_plan.priority 补齐（不改角色）
        if (!policy.netPriority) {
            policy.netPriority = {};
        }
        for (let i = 0; i < bb.netPlan.nets.length; i++) {
            const ne = bb.netPlan.nets[i];
            if (ne.routeMode === 'defer') {
                continue;
            }
            if (policy.netPriority[ne.netId] === undefined &&
                policy.netPriority[ne.netName] === undefined) {
                policy.netPriority[ne.netId] = ne.priority;
            }
        }
        bb.routePolicy = policy;
        bb.markStage('route_policy');
        Logger.info(INSTR_TRACE_TAG, `[AI_PCB] stage=route_policy ok fromLlm layers=${copper.length}` +
            ` roles=${JSON.stringify(policy.layerRoles)}`);
        return { ok: true, reason: 'ok' };
    }
}
