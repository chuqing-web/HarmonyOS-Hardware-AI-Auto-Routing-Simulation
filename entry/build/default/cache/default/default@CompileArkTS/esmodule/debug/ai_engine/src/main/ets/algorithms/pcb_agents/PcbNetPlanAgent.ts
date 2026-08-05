import { Logger, INSTR_TRACE_TAG } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { IAiApiManager } from 'ai_api_manager';
import { PromptLoader } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/prompts/PromptLoader";
import type { PcbRouteBlackboard } from './PcbRouteBlackboard';
import { PcbDocSummarizer } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbDocSummarizer";
import { parsePcbNetPlan } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbLlmParsers";
import type { PcbAgentStageResult } from './PcbPlacementAgent';
import { pcbStageChatOpts } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbChatOpts";
import { pcbImpureReplyReason } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbLlmReplyGuard";
export class PcbNetPlanAgent {
    async run(bb: PcbRouteBlackboard, api: IAiApiManager, priorFailHint?: string): Promise<PcbAgentStageResult> {
        Logger.info(INSTR_TRACE_TAG, `[AI_PCB] stage=net_plan begin runId=${bb.runId}`);
        if (!bb.workDoc) {
            return { ok: false, reason: 'no work doc' };
        }
        const tpl = PromptLoader.load('pcb_net_plan');
        if (!tpl.system || tpl.system.length === 0) {
            return { ok: false, reason: 'pcb_net_plan prompt missing' };
        }
        let netList = PcbDocSummarizer.netList(bb.workDoc);
        if (priorFailHint && priorFailHint.length > 0) {
            netList = `${netList}\n【上轮失败须修正】${priorFailHint}`;
        }
        const padSummary = `${PcbDocSummarizer.padSummary(bb.workDoc)}\n` +
            `【焊盘详表】\n${PcbDocSummarizer.padDetailSummary(bb.workDoc, 48)}`;
        const prompt = PromptLoader.render(tpl, [
            { key: 'copper_layers', value: PcbDocSummarizer.copperLayers(bb.workDoc) },
            { key: 'net_list', value: netList },
            { key: 'pad_summary', value: padSummary }
        ]);
        const apiRes = await api.chat(prompt, pcbStageChatOpts(bb.enableReasoning, 0.05));
        if (!apiRes.success || !apiRes.data) {
            return { ok: false, reason: apiRes.error ?? 'net_plan LLM failed' };
        }
        bb.usedLlm = true;
        const impure = pcbImpureReplyReason('net_plan', apiRes.data);
        if (impure) {
            return { ok: false, reason: impure };
        }
        const plan = parsePcbNetPlan(apiRes.data);
        if (!plan) {
            return { ok: false, reason: `net_plan LLM JSON invalid (${PromptLoader.describeJsonImpurity(apiRes.data)})` };
        }
        const padCountByNet: Map<string, number> = new Map();
        for (const fp of bb.workDoc.footprints) {
            for (const pad of fp.pads) {
                const nid = pad.netId ?? '';
                if (nid.length === 0) {
                    continue;
                }
                padCountByNet.set(nid, (padCountByNet.get(nid) ?? 0) + 1);
            }
        }
        for (let i = 0; i < plan.nets.length; i++) {
            const e = plan.nets[i];
            const byId = bb.workDoc.nets.find(n => n.id === e.netId);
            if (byId) {
                e.netId = byId.id;
                e.netName = byId.name;
                continue;
            }
            const byName = bb.workDoc.nets.find(n => n.name === e.netName || n.name === e.netId);
            if (byName) {
                e.netId = byName.id;
                e.netName = byName.name;
            }
        }
        const covered: Set<string> = new Set();
        for (let i = 0; i < plan.nets.length; i++) {
            if (plan.nets[i].netId.length > 0) {
                covered.add(plan.nets[i].netId);
            }
        }
        const mustRoute: string[] = [];
        const missingPowerGnd: string[] = [];
        for (let i = 0; i < bb.workDoc.nets.length; i++) {
            const n = bb.workDoc.nets[i];
            const pads = padCountByNet.get(n.id) ?? 0;
            if (pads < 2) {
                continue;
            }
            mustRoute.push(n.id);
            if (!covered.has(n.id)) {
                const uname = n.name.toUpperCase();
                if (uname === 'GND' || uname === 'VSS' || uname.indexOf('GND') >= 0 ||
                    uname === 'VCC' || uname === 'VDD' || uname === 'VOUT' || uname.indexOf('VCC') >= 0) {
                    missingPowerGnd.push(n.name);
                }
            }
        }
        if (missingPowerGnd.length > 0) {
            return {
                ok: false,
                reason: `net_plan missing power/gnd: ${missingPowerGnd.join(',')}`
            };
        }
        let missingMust = 0;
        for (let i = 0; i < mustRoute.length; i++) {
            if (!covered.has(mustRoute[i])) {
                missingMust++;
            }
        }
        if (mustRoute.length > 0 && missingMust > 0 && missingMust / mustRoute.length > 0.25) {
            return {
                ok: false,
                reason: `net_plan coverage low: missing ${missingMust}/${mustRoute.length} routable nets`
            };
        }
        if (missingMust > 0) {
            Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] net_plan soft-miss ${missingMust}/${mustRoute.length} routable nets`);
        }
        // LLM 几何无 zone 阶段：forcePour 一律按 forceTrack（宽总线亦由折线表达）
        let pourCount = 0;
        for (let i = 0; i < plan.nets.length; i++) {
            if (plan.nets[i].routeMode === 'forcePour') {
                pourCount++;
            }
        }
        if (pourCount > 0) {
            for (let i = 0; i < plan.nets.length; i++) {
                const e = plan.nets[i];
                if (e.routeMode !== 'forcePour') {
                    continue;
                }
                Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] net_plan demote ${e.netName} forcePour→forceTrack (no zone stage)`);
                e.routeMode = 'forceTrack';
                if (!e.layerHint || e.layerHint.length === 0) {
                    e.layerHint = e.kind === 'gnd' ? 'stub' :
                        (e.kind === 'power' ? 'signal_h' : 'signal_h');
                }
                if ((e.kind === 'gnd' || e.kind === 'power') && e.busYOffset === undefined) {
                    e.busYOffset = e.kind === 'gnd' ? -60 : 60;
                }
            }
        }
        bb.netPlan = plan;
        bb.markStage('net_plan');
        Logger.info(INSTR_TRACE_TAG, `[AI_PCB] stage=net_plan ok nets=${plan.nets.length}`);
        return { ok: true, reason: 'ok' };
    }
}
