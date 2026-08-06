import { Logger, INSTR_TRACE_TAG, applyPcbPlacementPlan } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { PcbResidualKind, PcbPlacementMode, PcbPlacementDecision } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { IAiApiManager } from 'ai_api_manager';
import { PromptLoader } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/prompts/PromptLoader";
import type { PcbRouteBlackboard } from './PcbRouteBlackboard';
import { PcbDocSummarizer } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbDocSummarizer";
import { parsePcbPlacementPlan, diagnosePcbPlacementReply } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbLlmParsers";
import { pcbStageChatOpts } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbChatOpts";
import { pcbImpureReplyReason } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbLlmReplyGuard";
export interface PcbAgentStageResult {
    ok: boolean;
    reason: string;
    residual?: boolean;
    residualKind?: PcbResidualKind;
}
function isMountRef(defId: string, refDes: string): boolean {
    const d = (defId ?? '').toUpperCase();
    if (d.indexOf('MOUNT') >= 0) {
        return true;
    }
    const r = (refDes ?? '').toUpperCase();
    return r.length >= 2 && r.charAt(0) === 'H' && d.indexOf('PINHDR') < 0;
}
function boardSizeFromDoc(bb: PcbRouteBlackboard): number[] {
    const pts = bb.workDoc?.boardOutline?.points ?? [];
    if (pts.length < 2) {
        return [1200, 1000];
    }
    let minX = pts[0].x;
    let minY = pts[0].y;
    let maxX = pts[0].x;
    let maxY = pts[0].y;
    for (let i = 1; i < pts.length; i++) {
        if (pts[i].x < minX) {
            minX = pts[i].x;
        }
        if (pts[i].y < minY) {
            minY = pts[i].y;
        }
        if (pts[i].x > maxX) {
            maxX = pts[i].x;
        }
        if (pts[i].y > maxY) {
            maxY = pts[i].y;
        }
    }
    return [Math.max(400, Math.round(maxX - minX)), Math.max(400, Math.round(maxY - minY))];
}
function countFunctionalFp(bb: PcbRouteBlackboard): number {
    if (!bb.workDoc) {
        return 0;
    }
    let n = 0;
    for (let i = 0; i < bb.workDoc.footprints.length; i++) {
        const fp = bb.workDoc.footprints[i];
        if (!isMountRef(fp.defId, fp.refDes)) {
            n++;
        }
    }
    return n;
}
export class PcbPlacementAgent {
    async run(bb: PcbRouteBlackboard, api: IAiApiManager, priorFailHint?: string): Promise<PcbAgentStageResult> {
        let mode: PcbPlacementMode = bb.placementMode ?? 'full';
        // 有功能封装却传了 full：升为 auto，避免无脑重排
        if (mode === 'full' && countFunctionalFp(bb) > 0) {
            mode = 'auto';
            bb.placementMode = 'auto';
            Logger.info(INSTR_TRACE_TAG, `[AI_PCB] stage=placement promote full→auto (functional fp present)`);
        }
        Logger.info(INSTR_TRACE_TAG, `[AI_PCB] stage=placement begin runId=${bb.runId} mode=${mode}`);
        if (!bb.workDoc) {
            return { ok: false, reason: 'no work doc' };
        }
        if (mode === 'skip') {
            return this.keepExisting(bb, false, 'skip: keep existing placement');
        }
        const tpl = PromptLoader.load('pcb_placement');
        if (!tpl.system || tpl.system.length === 0) {
            return { ok: false, reason: 'pcb_placement prompt missing' };
        }
        let fpList = PcbDocSummarizer.footprintList(bb.workDoc);
        const padDetail = PcbDocSummarizer.padDetailSummary(bb.workDoc, 80);
        if (priorFailHint && priorFailHint.length > 0) {
            fpList = `${fpList}\n【上轮失败须修正】${priorFailHint}`;
        }
        fpList = `【UNITS】coord=mil size=mil origin=board(0,0)\n${fpList}\n` +
            `【焊盘详表 — 布局时错开异网焊盘，勿共线】\n${padDetail}`;
        if (mode === 'auto') {
            const wh = boardSizeFromDoc(bb);
            fpList = `${fpList}\n` +
                `【模式=auto — 严格根 JSON】\n` +
                `- 必须输出完整根对象，字段顺序建议：decision, boardWidthMil, boardHeightMil, placements, lockedIds, reason\n` +
                `- 合理 → {"decision":"keep","boardWidthMil":${wh[0]},"boardHeightMil":${wh[1]},"placements":[],"lockedIds":[],"reason":"ok"}\n` +
                `- 不合理 → decision="revise" 且 placements 非空（可增量微调）\n` +
                `- 禁止只输出 name/footprintIds/note（那是 groups 碎片，非法）\n` +
                `- 禁止省略 decision；禁止省略 board 宽高；groups 默认不要输出`;
        }
        else if (mode === 'revise') {
            fpList = `${fpList}\n` +
                `【模式=revise — 严格根 JSON】\n` +
                `- 必须 decision="revise" + boardWidthMil + boardHeightMil + 非空 placements\n` +
                `- 禁止 groups 碎片作根；footprintId 逐字复制列表 id`;
        }
        else {
            fpList = `${fpList}\n` +
                `【模式=full — 严格根 JSON】\n` +
                `- 必须 boardWidthMil + boardHeightMil + 非空 placements（建议 decision="revise"）\n` +
                `- 禁止 groups 碎片作根；禁止原位 echo`;
        }
        const prompt = PromptLoader.render(tpl, [
            { key: 'board_outline', value: PcbDocSummarizer.boardOutline(bb.workDoc) },
            { key: 'copper_count', value: String(bb.workDoc.layerStack.copperCount) },
            { key: 'footprint_list', value: fpList }
        ]);
        const apiRes = await api.chat(prompt, pcbStageChatOpts(bb.enableReasoning, 0.1));
        if (!apiRes.success || !apiRes.data) {
            return { ok: false, reason: apiRes.error ?? 'placement LLM failed' };
        }
        bb.usedLlm = true;
        const impure = pcbImpureReplyReason('placement', apiRes.data);
        if (impure) {
            return { ok: false, reason: impure };
        }
        const schemaDiag = diagnosePcbPlacementReply(apiRes.data, mode);
        if (schemaDiag.length > 0) {
            Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] placement schema reject mode=${mode} | ${schemaDiag}`);
            return { ok: false, reason: `placement LLM JSON invalid (${schemaDiag})` };
        }
        const plan = parsePcbPlacementPlan(apiRes.data, mode);
        if (!plan) {
            return {
                ok: false,
                reason: `placement LLM JSON invalid (${diagnosePcbPlacementReply(apiRes.data, mode) || 'parse_fail'})`
            };
        }
        if (!plan.fromLlm) {
            return { ok: false, reason: 'placement plan not from LLM' };
        }
        const decision: PcbPlacementDecision = plan.decision === 'keep' ? 'keep' : 'revise';
        if (mode === 'auto' && decision === 'keep') {
            return this.keepExisting(bb, true, plan.reason ?? 'auto: LLM keep existing');
        }
        if (mode === 'auto' && decision === 'revise' && plan.placements.length === 0) {
            return { ok: false, reason: 'auto revise but placements empty' };
        }
        const allowEcho = mode === 'revise' || mode === 'auto';
        const applied = applyPcbPlacementPlan(bb.workDoc, plan, { allowEcho });
        if (!applied.ok) {
            return { ok: false, reason: applied.reason };
        }
        if (applied.placedCount <= 0 && bb.workDoc.footprints.length > 0 && mode === 'full') {
            return { ok: false, reason: 'placement applied 0 footprints — refuse empty layout' };
        }
        bb.placementPlan = plan;
        bb.markStage('placement');
        Logger.info(INSTR_TRACE_TAG, `[AI_PCB] stage=placement ok mode=${mode} decision=${decision}` +
            ` placed=${applied.placedCount}` +
            ` board=${plan.boardWidthMil ?? '?'}x${plan.boardHeightMil ?? '?'}`);
        return { ok: true, reason: 'ok' };
    }
    /** 沿用现有位姿（skip 或 auto/keep） */
    private keepExisting(bb: PcbRouteBlackboard, fromLlm: boolean, reason: string): PcbAgentStageResult {
        if (!bb.workDoc) {
            return { ok: false, reason: 'no work doc' };
        }
        const lockedIds: string[] = [];
        for (let i = 0; i < bb.workDoc.footprints.length; i++) {
            const fp = bb.workDoc.footprints[i];
            if (fp.locked || isMountRef(fp.defId, fp.refDes)) {
                lockedIds.push(fp.id);
            }
        }
        const wh = boardSizeFromDoc(bb);
        bb.placementPlan = {
            fromLlm,
            placements: [],
            lockedIds,
            decision: 'keep',
            boardWidthMil: wh[0],
            boardHeightMil: wh[1],
            reason
        };
        bb.markStage('placement');
        Logger.info(INSTR_TRACE_TAG, `[AI_PCB] stage=placement keep existing fromLlm=${fromLlm}` +
            ` fp=${bb.workDoc.footprints.length} board=${wh[0]}x${wh[1]} reason=${reason}`);
        return { ok: true, reason: 'ok' };
    }
}
