import { Logger, INSTR_TRACE_TAG, PcbDrcSeverity, copperLayersFromStack, ensureAllCopperUsed, policyHasStub, applyCopperLayerCount, netCopperConnectsPads } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { PcbDocument, PcbDrcViolation, PcbLayerRole, PcbResidualKind, PcbRouteMode, PcbQaRepairPlan } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { IAiApiManager } from 'ai_api_manager';
import { PromptLoader } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/prompts/PromptLoader";
import type { PcbRouteBlackboard } from './PcbRouteBlackboard';
import { PcbDocSummarizer } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbDocSummarizer";
import { parsePcbQaRepair } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbLlmParsers";
import { PcbPlacementAgent } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbPlacementAgent";
import type { PcbAgentStageResult } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbPlacementAgent";
import { PcbGeometryAgent } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbGeometryAgent";
import { pcbStageChatOpts } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbChatOpts";
import { normalizeRePlaceFootprintIds, pcbImpureReplyReason } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbLlmReplyGuard";
import { fillDefaultRolesAfterRaise, localDemotePowerPour, localApplyBusYOffset, localRaiseCopperIfCrowded, localNudgePadBlockers, isSignalRouteFailReason, onlyPadOrViaBlocks } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbLocalEscalate";
const PCB_QA_FIX_ROUNDS: number = 3;
export type PcbDrcRunner = (doc: PcbDocument) => PcbDrcViolation[];
function roleExists(roles: Record<string, PcbLayerRole>, role: PcbLayerRole): boolean {
    const keys = Object.keys(roles);
    for (let i = 0; i < keys.length; i++) {
        if (roles[keys[i]] === role) {
            return true;
        }
    }
    return false;
}
function restoreStubIfStolen(roles: Record<string, PcbLayerRole>, hadStub: boolean): void {
    if (!hadStub || roleExists(roles, 'stub')) {
        return;
    }
    let signalHCount = 0;
    const keys = Object.keys(roles);
    for (let i = 0; i < keys.length; i++) {
        if (roles[keys[i]] === 'signal_h') {
            signalHCount++;
        }
    }
    if (roles['F.Cu'] === 'signal_h' && signalHCount > 1) {
        Logger.warn(INSTR_TRACE_TAG, '[AI_PCB] qa_repair restore stub on F.Cu (dup signal_h)');
        roles['F.Cu'] = 'stub';
        return;
    }
    if (roles['B.Cu'] === 'signal_h' && signalHCount > 1) {
        Logger.warn(INSTR_TRACE_TAG, '[AI_PCB] qa_repair restore stub on B.Cu (dup signal_h)');
        roles['B.Cu'] = 'stub';
        return;
    }
    const candidates = ['F.Cu', 'B.Cu'];
    for (let i = 0; i < candidates.length; i++) {
        const lid = candidates[i];
        const r = roles[lid];
        if (r === undefined) {
            continue;
        }
        if (r === 'power_h' || r === 'power_v' || r === 'signal_v') {
            Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] qa_repair restore stub on ${lid} (was ${r})`);
            roles[lid] = 'stub';
            return;
        }
    }
    if (roles['F.Cu'] !== undefined && roles['F.Cu'] !== 'gnd_bus' && roles['F.Cu'] !== 'vcc_bus') {
        Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] qa_repair restore stub on F.Cu (was ${roles['F.Cu']})`);
        roles['F.Cu'] = 'stub';
    }
}
/** ripNetIds 可能是 netId 或网名 */
function resolveRipNetIds(doc: PcbDocument, keys: string[]): Set<string> {
    const out = new Set<string>();
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        out.add(k);
        for (let ni = 0; ni < doc.nets.length; ni++) {
            const n = doc.nets[ni];
            if (n.id === k || n.name === k) {
                out.add(n.id);
            }
        }
    }
    return out;
}
function matchNetKey(netId: string, netName: string, key: string): boolean {
    return netId === key || netName === key;
}
export class PcbQaAgent {
    private placementAgent: PcbPlacementAgent = new PcbPlacementAgent();
    private geometryAgent: PcbGeometryAgent = new PcbGeometryAgent();
    async gate(bb: PcbRouteBlackboard, api: IAiApiManager, runDrc: PcbDrcRunner): Promise<PcbAgentStageResult> {
        Logger.info(INSTR_TRACE_TAG, `[AI_PCB] stage=qa begin runId=${bb.runId}`);
        if (!bb.workDoc || !bb.routePolicy || !bb.netPlan) {
            return { ok: false, reason: 'qa missing state' };
        }
        // 几何从未落板且无铜：勿空转 3 轮 QA LLM（由外层 KEEP_RETRY 重跑 geometry）
        if (!bb.geometry &&
            (bb.workDoc.tracks?.length ?? 0) === 0 &&
            (bb.workDoc.vias?.length ?? 0) === 0) {
            Logger.warn(INSTR_TRACE_TAG, '[AI_PCB] stage=qa short-circuit: no geometry applied');
            return {
                ok: false,
                reason: 'geometry never applied (no copper)',
                residualKind: 'signal_fail'
            };
        }
        let lastReason = 'qa residual';
        let lastKind: PcbResidualKind = 'drc';
        for (let round = 0; round <= PCB_QA_FIX_ROUNDS; round++) {
            const report = this.buildReport(bb, runDrc);
            if (report.ok) {
                bb.markStage('qa');
                Logger.info(INSTR_TRACE_TAG, `[AI_PCB] stage=qa ok round=${round}`);
                return { ok: true, reason: 'ok' };
            }
            lastReason = report.reason;
            lastKind = report.residualKind ?? 'drc';
            if (round >= PCB_QA_FIX_ROUNDS) {
                Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] stage=qa critique exhausted → RETRY (no abort) | ${report.reason}`);
                return { ok: false, reason: report.reason, residualKind: lastKind };
            }
            Logger.info(INSTR_TRACE_TAG, `[AI_PCB] stage=qa_repair begin round=${round}`);
            // 加固：本地 escalate → 立即重布 → 同轮复检；仍失败再 LLM（勿空耗一轮）
            let activeReport = report;
            let localFixed = false;
            if (activeReport.reason.indexOf('power bus clearance') >= 0 && this.autoDemotePowerPour(bb)) {
                Logger.warn(INSTR_TRACE_TAG, '[AI_PCB] qa_repair local-first demote forcePour→forceTrack');
                localFixed = true;
            }
            else if (this.autoEscalateOnSignalFail(bb, activeReport.reason, round)) {
                Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] qa_repair local-first escalate round=${round}`);
                localFixed = true;
            }
            if (localFixed) {
                const geoRes = await this.geometryAgent.run(bb, api, activeReport.reason);
                if (!geoRes.ok) {
                    Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] qa local-first re-geometry fail | ${geoRes.reason}`);
                    lastReason = geoRes.reason;
                    lastKind = geoRes.residualKind ?? 'signal_fail';
                }
                const afterLocal = this.buildReport(bb, runDrc);
                if (afterLocal.ok) {
                    bb.markStage('qa');
                    Logger.info(INSTR_TRACE_TAG, `[AI_PCB] stage=qa ok after local escalate round=${round}`);
                    return { ok: true, reason: 'ok' };
                }
                activeReport = afterLocal;
                lastReason = afterLocal.reason;
                lastKind = afterLocal.residualKind ?? 'drc';
                Logger.info(INSTR_TRACE_TAG, `[AI_PCB] qa local escalate insufficient → next | ${afterLocal.reason}`);
            }
            // Cu≥4 且仅 pad/via_block：再强挪一次后跳过 QA LLM（Agnes 长 reasoning 极慢且帮不上）
            const cuNow = bb.workDoc.layerStack?.copperCount ?? 2;
            if (cuNow >= 4 && onlyPadOrViaBlocks(bb.geometry?.failDetails)) {
                if (localNudgePadBlockers(bb, bb.geometry?.failDetails, 100, true)) {
                    Logger.warn(INSTR_TRACE_TAG, '[AI_PCB] qa skip-LLM: Cu≥4 pad_block → strong nudge + re-geo');
                    const geo2 = await this.geometryAgent.run(bb, api, activeReport.reason);
                    const after2 = this.buildReport(bb, runDrc);
                    if (after2.ok) {
                        bb.markStage('qa');
                        return { ok: true, reason: 'ok' };
                    }
                    activeReport = after2;
                    lastReason = after2.reason;
                    lastKind = after2.residualKind ?? 'signal_fail';
                    if (!geo2.ok) {
                        lastReason = geo2.reason;
                        lastKind = geo2.residualKind ?? 'signal_fail';
                    }
                }
                Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] qa skip LLM (Cu=${cuNow} pad/via_block only) → residual | ${lastReason}`);
                continue;
            }
            const tpl = PromptLoader.load('pcb_qa_repair');
            if (!tpl.system || tpl.system.length === 0) {
                lastReason = 'pcb_qa_repair prompt missing';
                continue;
            }
            const roles = JSON.stringify(bb.routePolicy.layerRoles);
            // 短诊断：勿注入整板焊盘详表（原 promptLen≈4.5k，Agnes 易拖数分钟）
            const drcFull = `${activeReport.reason}\n${PcbDocSummarizer.qaFailBrief(bb.workDoc, bb.geometry)}`;
            const prompt = PromptLoader.render(tpl, [
                { key: 'copper_layers', value: PcbDocSummarizer.copperLayers(bb.workDoc) },
                { key: 'layer_roles', value: roles },
                { key: 'drc_report', value: drcFull },
                { key: 'failed_nets', value: (bb.geometry?.failedNetIds ?? []).join(',') }
            ]);
            Logger.info(INSTR_TRACE_TAG, `[AI_PCB] qa_repair LLM promptLen≈${prompt.length} (compact diag)`);
            const apiRes = await api.chat(prompt, pcbStageChatOpts(false, 0.05));
            if (!apiRes.success || !apiRes.data) {
                Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] KEEP_RETRY qa_repair LLM fail | ${apiRes.error ?? 'unknown'}`);
                lastReason = apiRes.error ?? 'qa_repair LLM failed';
                // 电源总线 clearance：本地自动 demote forcePour→forceTrack 再试
                if (activeReport.reason.indexOf('power bus clearance') >= 0 && this.autoDemotePowerPour(bb)) {
                    Logger.warn(INSTR_TRACE_TAG, '[AI_PCB] qa_repair auto routeModePatch forcePour→forceTrack');
                }
                else if (this.autoEscalateOnSignalFail(bb, activeReport.reason, round)) {
                    Logger.warn(INSTR_TRACE_TAG, '[AI_PCB] qa_repair local escalate after LLM fail');
                }
                else {
                    continue;
                }
            }
            else {
                bb.usedLlm = true;
                const impure = pcbImpureReplyReason('qa_repair', apiRes.data);
                let repair: PcbQaRepairPlan | null = null;
                if (impure) {
                    Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] KEEP_RETRY qa_repair | ${impure}`);
                    lastReason = impure;
                    if (activeReport.reason.indexOf('power bus clearance') >= 0 && this.autoDemotePowerPour(bb)) {
                        Logger.warn(INSTR_TRACE_TAG, '[AI_PCB] qa_repair auto demote after impure JSON');
                    }
                    else if (this.autoEscalateOnSignalFail(bb, activeReport.reason, round)) {
                        Logger.warn(INSTR_TRACE_TAG, '[AI_PCB] qa_repair local escalate after impure JSON');
                    }
                    else {
                        continue;
                    }
                }
                else {
                    repair = parsePcbQaRepair(apiRes.data);
                    if (!repair || !repair.fromLlm) {
                        Logger.warn(INSTR_TRACE_TAG, '[AI_PCB] KEEP_RETRY qa_repair JSON invalid');
                        lastReason = `qa_repair LLM JSON invalid (${PromptLoader.describeJsonImpurity(apiRes.data)})`;
                        if (activeReport.reason.indexOf('power bus clearance') >= 0 && this.autoDemotePowerPour(bb)) {
                            Logger.warn(INSTR_TRACE_TAG, '[AI_PCB] qa_repair auto demote after invalid JSON');
                        }
                        else if (this.autoEscalateOnSignalFail(bb, activeReport.reason, round)) {
                            Logger.warn(INSTR_TRACE_TAG, '[AI_PCB] qa_repair local escalate after invalid JSON');
                        }
                        else {
                            continue;
                        }
                        repair = null;
                    }
                }
                if (repair && repair.fromLlm) {
                    Logger.info(INSTR_TRACE_TAG, `[AI_PCB] stage=qa_repair ok rip=${repair.ripNetIds.length}` +
                        ` raise=${repair.raiseCopperTo ?? 0} notes=${repair.notes}`);
                    let mutated = false;
                    if (repair.raiseCopperTo !== undefined && bb.workDoc) {
                        const cur = bb.workDoc.layerStack?.copperCount ?? 2;
                        if (repair.raiseCopperTo > cur) {
                            if (bb.copperLocked) {
                                Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] qa_repair ignore raiseCopper ${cur}→${repair.raiseCopperTo} — copper locked`);
                            }
                            else {
                                applyCopperLayerCount(bb.workDoc, repair.raiseCopperTo);
                                const copper = copperLayersFromStack(bb.workDoc.layerStack);
                                fillDefaultRolesAfterRaise(bb.routePolicy.layerRoles, copper);
                                Logger.info(INSTR_TRACE_TAG, `[AI_PCB] qa_repair raiseCopper ${cur}→${repair.raiseCopperTo}`);
                                mutated = true;
                            }
                        }
                    }
                    if (repair.layerRolePatch) {
                        const hadStub = policyHasStub(bb.routePolicy);
                        const keys = Object.keys(repair.layerRolePatch);
                        for (let i = 0; i < keys.length; i++) {
                            const lid = keys[i];
                            const looksLikeCu = lid.indexOf('.Cu') >= 0 || lid.indexOf('.cu') >= 0;
                            const alreadyRole = bb.routePolicy.layerRoles[lid] !== undefined;
                            if (!looksLikeCu && !alreadyRole) {
                                Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] qa_repair skip non-copper layerRolePatch key=${lid}`);
                                continue;
                            }
                            bb.routePolicy.layerRoles[lid] = repair.layerRolePatch[lid] as PcbLayerRole;
                            mutated = true;
                        }
                        restoreStubIfStolen(bb.routePolicy.layerRoles, hadStub);
                    }
                    if (repair.routeModePatch && bb.netPlan) {
                        const keys = Object.keys(repair.routeModePatch);
                        for (let i = 0; i < keys.length; i++) {
                            const k = keys[i];
                            const mode = repair.routeModePatch[k] as PcbRouteMode;
                            for (let ni = 0; ni < bb.netPlan.nets.length; ni++) {
                                const ne = bb.netPlan.nets[ni];
                                if (matchNetKey(ne.netId, ne.netName, k)) {
                                    Logger.info(INSTR_TRACE_TAG, `[AI_PCB] qa_repair routeModePatch ${ne.netName}: ${ne.routeMode}→${mode}`);
                                    ne.routeMode = mode;
                                    mutated = true;
                                }
                            }
                        }
                    }
                    if (repair.busYOffsetPatch && bb.netPlan) {
                        const keys = Object.keys(repair.busYOffsetPatch);
                        for (let i = 0; i < keys.length; i++) {
                            const k = keys[i];
                            const off = repair.busYOffsetPatch[k];
                            for (let ni = 0; ni < bb.netPlan.nets.length; ni++) {
                                const ne = bb.netPlan.nets[ni];
                                if (matchNetKey(ne.netId, ne.netName, k)) {
                                    ne.busYOffset = off;
                                    mutated = true;
                                    Logger.info(INSTR_TRACE_TAG, `[AI_PCB] qa_repair busYOffset ${ne.netName}=${off}`);
                                }
                            }
                        }
                    }
                    // 电源总线失败且 LLM 未改 routeMode：自动 demote
                    if (activeReport.reason.indexOf('power bus clearance') >= 0 &&
                        !repair.routeModePatch && this.autoDemotePowerPour(bb)) {
                        mutated = true;
                        Logger.warn(INSTR_TRACE_TAG, '[AI_PCB] qa_repair auto demote power forcePour→forceTrack (bus clearance)');
                    }
                    let ripped = false;
                    if (repair.ripNetIds.length > 0 && bb.workDoc) {
                        const rip = resolveRipNetIds(bb.workDoc, repair.ripNetIds);
                        bb.workDoc.tracks = bb.workDoc.tracks.filter(t => !rip.has(t.netId));
                        bb.workDoc.vias = bb.workDoc.vias.filter(v => !rip.has(v.netId));
                        ripped = true;
                        mutated = true;
                    }
                    else if (bb.geometry && bb.geometry.failedNetIds.length > 0 &&
                        (activeReport.reason.indexOf('signal nets failed') >= 0 ||
                            activeReport.reason.indexOf('unrouted') >= 0)) {
                        const rip = new Set(bb.geometry.failedNetIds);
                        Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] qa_repair auto-rip failed nets n=${rip.size}`);
                        bb.workDoc.tracks = bb.workDoc.tracks.filter(t => !rip.has(t.netId));
                        bb.workDoc.vias = bb.workDoc.vias.filter(v => !rip.has(v.netId));
                        ripped = true;
                        mutated = true;
                    }
                    if (repair.rePlaceFootprintIds && repair.rePlaceFootprintIds.length > 0) {
                        const moveIds = normalizeRePlaceFootprintIds(repair.rePlaceFootprintIds, bb.workDoc);
                        if (moveIds.length === 0) {
                            Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] qa_repair rePlaceFootprintIds all invalid` +
                                ` raw=${repair.rePlaceFootprintIds.slice(0, 5).join(',')} — skip re-place`);
                        }
                        else {
                            repair.rePlaceFootprintIds = moveIds;
                            if (bb.placementPlan) {
                                const move = new Set(moveIds);
                                const lockIds: string[] = [];
                                for (const fp of bb.workDoc.footprints) {
                                    if (!move.has(fp.id)) {
                                        lockIds.push(fp.id);
                                    }
                                }
                                bb.placementPlan.lockedIds = lockIds;
                            }
                            const place = await this.placementAgent.run(bb, api, `rePlace only: ${moveIds.join(',')} — footprintId must be list id/refDes, never RefDes.PadNum`);
                            if (!place.ok) {
                                Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] KEEP_RETRY qa re-place fail | ${place.reason}`);
                                lastReason = `qa re-place failed: ${place.reason}`;
                                if (this.autoEscalateOnSignalFail(bb, activeReport.reason, round)) {
                                    Logger.warn(INSTR_TRACE_TAG, '[AI_PCB] qa_repair local escalate after re-place fail');
                                }
                                else {
                                    continue;
                                }
                            }
                            mutated = true;
                        }
                    }
                    // LLM 只 rip / 空补丁 → 本地升级；禁止无变化时假 mutated 空转清铜
                    const onlyRip = ripped &&
                        (!repair.layerRolePatch || Object.keys(repair.layerRolePatch).length === 0) &&
                        (!repair.routeModePatch || Object.keys(repair.routeModePatch).length === 0) &&
                        (!repair.busYOffsetPatch || Object.keys(repair.busYOffsetPatch).length === 0) &&
                        (repair.raiseCopperTo === undefined || repair.raiseCopperTo <= 0) &&
                        (!repair.rePlaceFootprintIds || repair.rePlaceFootprintIds.length === 0);
                    if ((onlyRip || !mutated) &&
                        this.autoEscalateOnSignalFail(bb, activeReport.reason, round)) {
                        mutated = true;
                        Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] qa_repair local escalate round=${round} (LLM rip-only/empty)`);
                    }
                    if (ripped || mutated) {
                        bb.workDoc.tracks = [];
                        bb.workDoc.vias = [];
                    }
                }
            }
            // 策略/布局有变，或上轮几何失败 → 重跑本地几何；无变化且几何已 ok 则跳过
            const needReGeo = !(bb.geometry?.ok) ||
                (bb.workDoc.tracks.length === 0 && bb.workDoc.vias.length === 0);
            if (!needReGeo) {
                const mid = this.buildReport(bb, runDrc);
                if (mid.ok) {
                    bb.markStage('qa');
                    Logger.info(INSTR_TRACE_TAG, `[AI_PCB] stage=qa ok mid-round=${round}`);
                    return { ok: true, reason: 'ok' };
                }
                continue;
            }
            const geoRes = await this.geometryAgent.run(bb, api, activeReport.reason);
            if (!geoRes.ok) {
                Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] qa re-geometry fail | ${geoRes.reason}`);
                lastReason = geoRes.reason;
                lastKind = geoRes.residualKind ?? 'signal_fail';
            }
            else {
                const afterGeo = this.buildReport(bb, runDrc);
                if (afterGeo.ok) {
                    bb.markStage('qa');
                    Logger.info(INSTR_TRACE_TAG, `[AI_PCB] stage=qa ok after re-geometry round=${round}`);
                    return { ok: true, reason: 'ok' };
                }
                lastReason = afterGeo.reason;
                lastKind = afterGeo.residualKind ?? 'drc';
            }
        }
        return { ok: false, reason: lastReason, residualKind: lastKind };
    }
    /**
     * QA 本地 escalate（与 geometry 共用逻辑）：
     * round0：busY + 轻挪（层数已锁定，升层无效）；round≥1 再补未用手段
     */
    private autoEscalateOnSignalFail(bb: PcbRouteBlackboard, reason: string, round: number): boolean {
        if (!bb.workDoc || !bb.netPlan || !bb.routePolicy) {
            return false;
        }
        if (!isSignalRouteFailReason(reason)) {
            return false;
        }
        const failN = bb.geometry?.failedNetIds?.length ?? 0;
        const details = bb.geometry?.failDetails;
        let changed = localApplyBusYOffset(bb);
        const raiseFailN = round >= 1 ? Math.max(failN, 2) : failN;
        if (localRaiseCopperIfCrowded(bb, raiseFailN, details, reason)) {
            changed = true;
        }
        // round0 法向50；round≥1 换轴强挪（浮空焊盘挡水平走廊）
        if (localNudgePadBlockers(bb, details, round >= 1 ? 100 : 50, round >= 1)) {
            changed = true;
        }
        return changed;
    }
    private autoDemotePowerPour(bb: PcbRouteBlackboard): boolean {
        return localDemotePowerPour(bb);
    }
    private buildReport(bb: PcbRouteBlackboard, runDrc: PcbDrcRunner): PcbAgentStageResult {
        if (!bb.workDoc || !bb.geometry) {
            return { ok: false, reason: 'no geometry', residualKind: 'signal_fail' };
        }
        if (!bb.geometry.ok) {
            const kind: PcbResidualKind = bb.geometry.reason.indexOf('unused') >= 0
                ? 'unused_copper' : 'signal_fail';
            return { ok: false, reason: bb.geometry.reason, residualKind: kind };
        }
        const missing = ensureAllCopperUsed(bb.workDoc, bb.workDoc.tracks);
        if (missing.length > 0) {
            return {
                ok: false,
                reason: `unused copper: ${missing.join(',')}`,
                residualKind: 'unused_copper'
            };
        }
        const copper = copperLayersFromStack(bb.workDoc.layerStack);
        if (copper.length === 0) {
            return { ok: false, reason: 'no copper stack', residualKind: 'drc' };
        }
        if (bb.netPlan) {
            const unrouted: string[] = [];
            const disconnected: string[] = [];
            for (let i = 0; i < bb.netPlan.nets.length; i++) {
                const ne = bb.netPlan.nets[i];
                if (ne.routeMode === 'defer') {
                    continue;
                }
                if (ne.routeMode !== 'forceTrack' && ne.routeMode !== 'forcePour') {
                    continue;
                }
                let pads = 0;
                for (const fp of bb.workDoc.footprints) {
                    for (const pad of fp.pads) {
                        if ((pad.netId ?? '') === ne.netId) {
                            pads++;
                        }
                    }
                }
                if (pads < 2) {
                    continue;
                }
                const hasCu = bb.workDoc.tracks.some(t => t.netId === ne.netId) ||
                    bb.workDoc.vias.some(v => v.netId === ne.netId);
                const connected = netCopperConnectsPads(bb.workDoc, ne.netId, bb.workDoc.tracks, bb.workDoc.vias);
                if (!connected) {
                    if (hasCu) {
                        disconnected.push(ne.netName.length > 0 ? ne.netName : ne.netId);
                    }
                    else {
                        unrouted.push(ne.netName.length > 0 ? ne.netName : ne.netId);
                    }
                }
            }
            if (disconnected.length > 0) {
                return {
                    ok: false,
                    reason: `disconnected nets: ${disconnected.join(',')}`,
                    residualKind: 'signal_fail'
                };
            }
            if (unrouted.length > 0) {
                return {
                    ok: false,
                    reason: `unrouted nets: ${unrouted.join(',')}`,
                    residualKind: 'unrouted'
                };
            }
        }
        const violations = runDrc(bb.workDoc);
        const errors: string[] = [];
        for (let i = 0; i < violations.length; i++) {
            const v = violations[i];
            if (v.severity === PcbDrcSeverity.ERROR) {
                errors.push(`${v.ruleType}:${v.message}`);
            }
        }
        if (errors.length > 0) {
            return {
                ok: false,
                reason: errors.slice(0, 12).join(' | '),
                residualKind: 'drc'
            };
        }
        return { ok: true, reason: 'ok' };
    }
}
