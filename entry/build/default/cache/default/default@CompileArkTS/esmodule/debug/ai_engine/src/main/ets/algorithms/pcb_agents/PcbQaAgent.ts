import { AiCapability, Logger, INSTR_TRACE_TAG, PcbDrcSeverity, copperLayersFromStack, ensureAllCopperUsed, runPcbGeometryRoute, policyHasStub, applyCopperLayerCount } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { PcbDocument, PcbDrcViolation, PcbLayerRole, PcbResidualKind, PcbRouteMode, PcbLayerId } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { IAiApiManager } from 'ai_api_manager';
import { PromptLoader } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/prompts/PromptLoader";
import { commitGeometryToWorkDoc } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbRouteBlackboard";
import type { PcbRouteBlackboard } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbRouteBlackboard";
import { PcbDocSummarizer } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbDocSummarizer";
import { parsePcbQaRepair } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbLlmParsers";
import { PcbPlacementAgent } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbPlacementAgent";
import type { PcbAgentStageResult } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/pcb_agents/PcbPlacementAgent";
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
/** Cu 升层后为缺失铜层填默认角色（保留已有；保证 stub） */
function fillDefaultRolesAfterRaise(roles: Record<string, PcbLayerRole>, copper: PcbLayerId[]): void {
    const defaults: PcbLayerRole[] = [
        'stub', 'signal_h', 'gnd_bus', 'vcc_bus', 'signal_v', 'power_h', 'power_v', 'stub'
    ];
    let di = 0;
    for (let i = 0; i < copper.length; i++) {
        const lid = copper[i] as string;
        if (roles[lid] !== undefined) {
            continue;
        }
        roles[lid] = defaults[Math.min(di, defaults.length - 1)];
        di++;
    }
    if (!roleExists(roles, 'stub') && copper.length > 0) {
        roles[copper[0] as string] = 'stub';
    }
}
export class PcbQaAgent {
    private placementAgent: PcbPlacementAgent = new PcbPlacementAgent();
    async gate(bb: PcbRouteBlackboard, api: IAiApiManager, runDrc: PcbDrcRunner): Promise<PcbAgentStageResult> {
        Logger.info(INSTR_TRACE_TAG, `[AI_PCB] stage=qa begin runId=${bb.runId}`);
        if (!bb.workDoc || !bb.routePolicy || !bb.netPlan) {
            return { ok: false, reason: 'qa missing state' };
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
            const tpl = PromptLoader.load('pcb_qa_repair');
            if (!tpl.system || tpl.system.length === 0) {
                lastReason = 'pcb_qa_repair prompt missing';
                continue;
            }
            const roles = JSON.stringify(bb.routePolicy.layerRoles);
            const prompt = PromptLoader.render(tpl, [
                { key: 'copper_layers', value: PcbDocSummarizer.copperLayers(bb.workDoc) },
                { key: 'layer_roles', value: roles },
                { key: 'drc_report', value: report.reason },
                { key: 'failed_nets', value: (bb.geometry?.failedNetIds ?? []).join(',') }
            ]);
            const apiRes = await api.chat(prompt, {
                capability: AiCapability.PCB_AUTO_ROUTE,
                temperature: 0.05,
                disableThinking: false
            });
            if (!apiRes.success || !apiRes.data) {
                Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] KEEP_RETRY qa_repair LLM fail | ${apiRes.error ?? 'unknown'}`);
                lastReason = apiRes.error ?? 'qa_repair LLM failed';
                // 电源总线 clearance：本地自动 demote forcePour→forceTrack 再试
                if (report.reason.indexOf('power bus clearance') >= 0 && this.autoDemotePowerPour(bb)) {
                    Logger.warn(INSTR_TRACE_TAG, '[AI_PCB] qa_repair auto routeModePatch forcePour→forceTrack');
                }
                else {
                    continue;
                }
            }
            else {
                bb.usedLlm = true;
                const repair = parsePcbQaRepair(apiRes.data);
                if (!repair || !repair.fromLlm) {
                    Logger.warn(INSTR_TRACE_TAG, '[AI_PCB] KEEP_RETRY qa_repair JSON invalid');
                    lastReason = 'qa_repair LLM JSON invalid';
                    if (report.reason.indexOf('power bus clearance') >= 0 && this.autoDemotePowerPour(bb)) {
                        Logger.warn(INSTR_TRACE_TAG, '[AI_PCB] qa_repair auto demote after invalid JSON');
                    }
                    else {
                        continue;
                    }
                }
                else {
                    Logger.info(INSTR_TRACE_TAG, `[AI_PCB] stage=qa_repair ok rip=${repair.ripNetIds.length}` +
                        ` raise=${repair.raiseCopperTo ?? 0} notes=${repair.notes}`);
                    let mutated = false;
                    if (repair.raiseCopperTo !== undefined && bb.workDoc) {
                        const cur = bb.workDoc.layerStack?.copperCount ?? 2;
                        if (repair.raiseCopperTo > cur) {
                            applyCopperLayerCount(bb.workDoc, repair.raiseCopperTo);
                            const copper = copperLayersFromStack(bb.workDoc.layerStack);
                            fillDefaultRolesAfterRaise(bb.routePolicy.layerRoles, copper);
                            Logger.info(INSTR_TRACE_TAG, `[AI_PCB] qa_repair raiseCopper ${cur}→${repair.raiseCopperTo}`);
                            mutated = true;
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
                    if (report.reason.indexOf('power bus clearance') >= 0 &&
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
                        (report.reason.indexOf('signal nets failed') >= 0 ||
                            report.reason.indexOf('unrouted') >= 0)) {
                        const rip = new Set(bb.geometry.failedNetIds);
                        Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] qa_repair auto-rip failed nets n=${rip.size}`);
                        bb.workDoc.tracks = bb.workDoc.tracks.filter(t => !rip.has(t.netId));
                        bb.workDoc.vias = bb.workDoc.vias.filter(v => !rip.has(v.netId));
                        ripped = true;
                        mutated = true;
                    }
                    if (repair.rePlaceFootprintIds && repair.rePlaceFootprintIds.length > 0) {
                        if (bb.placementPlan) {
                            const move = new Set(repair.rePlaceFootprintIds);
                            const lockIds: string[] = [];
                            for (const fp of bb.workDoc.footprints) {
                                if (!move.has(fp.id)) {
                                    lockIds.push(fp.id);
                                }
                            }
                            bb.placementPlan.lockedIds = lockIds;
                        }
                        const place = await this.placementAgent.run(bb, api, `rePlace only: ${repair.rePlaceFootprintIds.join(',')}`);
                        if (!place.ok) {
                            Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] KEEP_RETRY qa re-place fail | ${place.reason}`);
                            lastReason = `qa re-place failed: ${place.reason}`;
                            continue;
                        }
                        mutated = true;
                    }
                    if (!mutated && !ripped) {
                        // 无工具生效时仍清铜重布（层角色可能未变但几何可借 soft-skip）
                        mutated = true;
                    }
                    if (ripped || mutated) {
                        bb.workDoc.tracks = [];
                        bb.workDoc.vias = [];
                    }
                }
            }
            const geo = runPcbGeometryRoute(bb.workDoc, bb.routePolicy, bb.netPlan);
            bb.geometry = geo;
            if (geo.tracks.length > 0 || geo.vias.length > 0) {
                commitGeometryToWorkDoc(bb, geo.tracks, geo.vias);
            }
            if (!geo.ok) {
                Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] qa re-geometry fail | ${geo.reason}`);
                lastReason = geo.reason;
                lastKind = 'signal_fail';
            }
        }
        return { ok: false, reason: lastReason, residualKind: lastKind };
    }
    /** Cu=2 多电源总线 clearance：把 forcePour 电源/地改为 forceTrack */
    private autoDemotePowerPour(bb: PcbRouteBlackboard): boolean {
        if (!bb.netPlan) {
            return false;
        }
        let changed = false;
        for (let i = 0; i < bb.netPlan.nets.length; i++) {
            const ne = bb.netPlan.nets[i];
            if ((ne.kind === 'gnd' || ne.kind === 'power') && ne.routeMode === 'forcePour') {
                ne.routeMode = 'forceTrack';
                changed = true;
            }
        }
        if (changed && bb.workDoc) {
            bb.workDoc.tracks = [];
            bb.workDoc.vias = [];
        }
        return changed;
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
            const routed = new Set(bb.geometry.routedNetIds);
            const unrouted: string[] = [];
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
                if (pads >= 2 && !routed.has(ne.netId)) {
                    unrouted.push(ne.netName.length > 0 ? ne.netName : ne.netId);
                }
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
