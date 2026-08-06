import { Logger, INSTR_TRACE_TAG } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { PcbNetPlanEntry } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
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
        const padSummary = `【UNITS】coord=mil size=mil\n` +
            `${PcbDocSummarizer.padSummary(bb.workDoc)}\n` +
            `【焊盘详表】\n${PcbDocSummarizer.padDetailSummary(bb.workDoc, 80)}`;
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
        if (!plan.fromLlm) {
            return { ok: false, reason: 'net_plan not from LLM — refuse local spoof' };
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
        const invented: string[] = [];
        const resolved: PcbNetPlanEntry[] = [];
        for (let i = 0; i < plan.nets.length; i++) {
            const e = plan.nets[i];
            const byId = bb.workDoc.nets.find(n => n.id === e.netId);
            if (byId) {
                e.netId = byId.id;
                e.netName = byId.name;
                resolved.push(e);
                continue;
            }
            const byName = bb.workDoc.nets.find(n => n.name === e.netName || n.name === e.netId);
            if (byName) {
                e.netId = byName.id;
                e.netName = byName.name;
                resolved.push(e);
                continue;
            }
            invented.push(e.netName.length > 0 ? e.netName : e.netId);
        }
        // 加固：拒绝编造电气网（禁止 LLM 发明新网）
        if (invented.length > 0) {
            return {
                ok: false,
                reason: `net_plan invented nets: ${invented.slice(0, 6).join(',')}` +
                    `${invented.length > 6 ? '…' : ''} — only use nets from board netlist`
            };
        }
        plan.nets = resolved;
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
        const missingNames: string[] = [];
        for (let i = 0; i < mustRoute.length; i++) {
            if (!covered.has(mustRoute[i])) {
                const n = bb.workDoc.nets.find(x => x.id === mustRoute[i]);
                missingNames.push(n?.name ?? mustRoute[i]);
            }
        }
        // 加固：可布网必须全部覆盖（不再 25% 软放过）
        if (missingNames.length > 0) {
            return {
                ok: false,
                reason: `net_plan coverage incomplete: missing ${missingNames.length}/` +
                    `${mustRoute.length} routable — ${missingNames.slice(0, 8).join(',')}` +
                    `${missingNames.length > 8 ? '…' : ''}`
            };
        }
        // 无 zone 阶段：forcePour → forceTrack；电源/地补 busYOffset
        let powerSlot = 0;
        for (let i = 0; i < plan.nets.length; i++) {
            const e = plan.nets[i];
            if (e.routeMode === 'forcePour') {
                Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] net_plan demote ${e.netName} forcePour→forceTrack (no zone stage)`);
                e.routeMode = 'forceTrack';
                if (!e.layerHint || e.layerHint.length === 0) {
                    e.layerHint = e.kind === 'gnd' ? 'gnd_bus' :
                        (e.kind === 'power' ? 'vcc_bus' : 'signal_h');
                }
            }
            if (e.routeMode === 'defer') {
                continue;
            }
            if (e.kind === 'gnd' && e.busYOffset === undefined) {
                e.busYOffset = -80;
            }
            else if (e.kind === 'power' && e.busYOffset === undefined) {
                e.busYOffset = 80 + powerSlot * 40;
                powerSlot++;
            }
            if ((!e.layerHint || e.layerHint.length === 0) && e.kind === 'signal') {
                e.layerHint = 'signal_h';
            }
        }
        bb.netPlan = plan;
        bb.markStage('net_plan');
        Logger.info(INSTR_TRACE_TAG, `[AI_PCB] stage=net_plan ok fromLlm nets=${plan.nets.length} mustRoute=${mustRoute.length}`);
        return { ok: true, reason: 'ok' };
    }
}
