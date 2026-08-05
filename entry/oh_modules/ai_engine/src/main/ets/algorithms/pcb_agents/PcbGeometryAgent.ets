/**
 * PcbGeometryAgent — LLM 决定折线拐弯与过孔位置；本地只校验 clearance 并落铜
 */
import {
  Logger, INSTR_TRACE_TAG, applyLlmPcbGeometry, runPcbGeometryRoute
} from 'common';
import { IAiApiManager } from 'ai_api_manager';
import { PromptLoader } from '../../prompts/PromptLoader';
import { PcbRouteBlackboard, commitGeometryToWorkDoc } from './PcbRouteBlackboard';
import { PcbDocSummarizer } from './PcbDocSummarizer';
import { parsePcbGeometryPlan } from './PcbLlmParsers';
import { PcbAgentStageResult } from './PcbPlacementAgent';
import { pcbStageChatOpts } from './PcbChatOpts';
import { countFloatPads, pcbImpureReplyReason } from './PcbLlmReplyGuard';

export class PcbGeometryAgent {
  async run(bb: PcbRouteBlackboard, api: IAiApiManager,
    priorFailHint?: string): Promise<PcbAgentStageResult> {
    Logger.info(INSTR_TRACE_TAG, `[AI_PCB] stage=geometry begin runId=${bb.runId}`);
    if (!bb.workDoc || !bb.routePolicy || !bb.netPlan) {
      return { ok: false, reason: 'missing policy/netPlan/doc' };
    }
    if (!bb.routePolicy.fromLlm || !bb.netPlan.fromLlm) {
      return { ok: false, reason: 'geometry refuses non-LLM policy' };
    }

    const tpl = PromptLoader.load('pcb_geometry');
    if (!tpl.system || tpl.system.length === 0) {
      return { ok: false, reason: 'pcb_geometry prompt missing' };
    }

    const netSummary = bb.netPlan.nets.map(n =>
      `${n.netName}:${n.kind}/${n.routeMode}/p${n.priority}` +
      (n.layerHint ? `/L=${n.layerHint}` : '') +
      (n.busYOffset !== undefined ? `/busY=${n.busYOffset}` : '')
    ).join(',');
    const layerRoles = JSON.stringify(bb.routePolicy.layerRoles);
    let failHint = PcbDocSummarizer.boardDiagSnapshot(bb.workDoc, bb.geometry);
    const floatN = countFloatPads(bb.workDoc);
    if (floatN > 0) {
      failHint = `${failHint}\n【注意】未绑定网络焊盘 floatPads=${floatN}，折线须避开这些 pad_block(float)；` +
        `端点落在焊盘中心可豁免`;
    }
    if (priorFailHint && priorFailHint.length > 0) {
      failHint = `${failHint}\n【上轮失败须修正折点/过孔】${priorFailHint}`;
    }

    const prompt = PromptLoader.render(tpl, [
      { key: 'board_outline', value: PcbDocSummarizer.boardOutline(bb.workDoc) },
      { key: 'copper_layers', value: PcbDocSummarizer.copperLayers(bb.workDoc) },
      { key: 'layer_roles', value: layerRoles },
      { key: 'net_plan_summary', value: netSummary },
      { key: 'pad_detail', value: PcbDocSummarizer.padDetailSummary(bb.workDoc, 80) },
      { key: 'pad_blocks', value: PcbDocSummarizer.padBlockSummary(bb.workDoc) },
      { key: 'fail_hint', value: failHint }
    ]);

    const apiRes = await api.chat(prompt, pcbStageChatOpts(bb.enableReasoning, 0.1));
    if (!apiRes.success || !apiRes.data) {
      const apiErr = apiRes.error ?? 'geometry LLM failed';
      // thinking 吃光输出额度（空 content）：API 层已 nudge 重试过一次，
      // 两轮空正文说明该模型结构性无法产出 → 本地确定性兜底，不再空转重试
      if (apiErr.indexOf('empty content') >= 0) {
        return this.localFallback(bb, `geometry LLM empty content: ${apiErr}`);
      }
      return { ok: false, reason: apiErr };
    }
    bb.usedLlm = true;

    const impure = pcbImpureReplyReason('geometry', apiRes.data);
    if (impure) {
      return this.localFallback(bb, impure);
    }

    const plan = parsePcbGeometryPlan(apiRes.data);
    if (!plan) {
      const impurity = PromptLoader.describeJsonImpurity(apiRes.data);
      return this.localFallback(bb, `geometry LLM JSON invalid (${impurity})`);
    }

    // 覆盖率门禁：有效折线网数远少于 net_plan → 拒收琐碎输出
    const planNetKeys: Set<string> = new Set();
    for (let i = 0; i < plan.tracks.length; i++) {
      const t = plan.tracks[i];
      const k = (t.netId && t.netId.length > 0) ? t.netId :
        ((t.netName && t.netName.length > 0) ? t.netName : '');
      if (k.length > 0) {
        planNetKeys.add(k);
      }
    }
    for (let i = 0; i < plan.vias.length; i++) {
      const v = plan.vias[i];
      const k = (v.netId && v.netId.length > 0) ? v.netId :
        ((v.netName && v.netName.length > 0) ? v.netName : '');
      if (k.length > 0) {
        planNetKeys.add(k);
      }
    }
    const needNets = bb.netPlan.nets.length;
    if (needNets >= 4 && planNetKeys.size < Math.max(2, Math.ceil(needNets * 0.25))) {
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PCB] geometry trivial coverage nets=${planNetKeys.size}/${needNets}` +
        ` tracks=${plan.tracks.length}`);
      return this.localFallback(bb,
        `geometry trivial coverage ${planNetKeys.size}/${needNets} nets` +
        ` (tracks=${plan.tracks.length}) — need fuller route set`);
    }

    // 全量重布：清空旧铜，避免旧线当障碍误杀
    bb.workDoc.tracks = [];
    bb.workDoc.vias = [];
    let geo = applyLlmPcbGeometry(bb.workDoc, bb.routePolicy, bb.netPlan, plan);
    bb.geometry = geo;
    if (!geo.ok) {
      // 本地确定性兜底：LLM 折线 clearance/连通性反复失败（pad_block 等）时，
      // 用本地正交路由器（L/jog/板边走廊/环形绕行）全量重布，不依赖 LLM 空间推理。
      // 该路由器只提交过 clearance 的段，产物天然合法。
      const local = runPcbGeometryRoute(bb.workDoc, bb.routePolicy, bb.netPlan);
      if (local.ok) {
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PCB] stage=geometry LLM fail → local deterministic ok` +
          ` tracks=${local.tracks.length} vias=${local.vias.length} | ${geo.reason}`);
        geo = local;
        bb.geometry = geo;
      } else if (local.tracks.length + local.vias.length > geo.tracks.length + geo.vias.length ||
        local.failedNetIds.length < geo.failedNetIds.length) {
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PCB] stage=geometry both fail → prefer local (fewer failed)` +
          ` llmFail=${geo.failedNetIds.length} localFail=${local.failedNetIds.length}`);
        geo = local;
        bb.geometry = geo;
      } else {
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PCB] stage=geometry local fallback no better` +
          ` llmFail=${geo.failedNetIds.length} localFail=${local.failedNetIds.length}`);
      }
    }
    if (!geo.ok) {
      const details = geo.failDetails ?? [];
      for (let i = 0; i < details.length && i < 8; i++) {
        const d = details[i];
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PCB] geo_fail_detail ${d.netName} ${d.cause}` +
          ` (${Math.round(d.from.x)},${Math.round(d.from.y)})→` +
          `(${Math.round(d.to.x)},${Math.round(d.to.y)})` +
          (d.blocker ? ` | ${d.blocker}` : ''));
      }
      if (geo.tracks.length > 0 || geo.vias.length > 0) {
        commitGeometryToWorkDoc(bb, geo.tracks, geo.vias);
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PCB] stage=geometry partial commit tracks=${geo.tracks.length} | ${geo.reason}`);
      } else {
        Logger.warn(INSTR_TRACE_TAG, `[AI_PCB] stage=geometry fail | ${geo.reason}`);
      }
      return { ok: false, reason: geo.reason, residualKind: 'signal_fail' };
    }
    commitGeometryToWorkDoc(bb, geo.tracks, geo.vias);
    bb.markStage('geometry');
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PCB] stage=geometry ok tracks=${geo.tracks.length} vias=${geo.vias.length}` +
      ` (${geo.reason === 'ok' ? 'LLM paths' : 'local deterministic'})`);
    return { ok: true, reason: 'ok' };
  }

  /**
   * LLM 几何不可用（杂质 / JSON 非法 / 琐碎覆盖）时的本地确定性兜底：
   * 全量重布并落铜；成功则 stage ok，失败则提交部分铜并返回失败原因。
   * 网络失败（api.chat 未成功）不触发 —— 那是环境问题，交由外层 KEEP_RETRY，
   * 且 usedLlm 未置位时交付本就被拒。
   */
  private localFallback(bb: PcbRouteBlackboard, llmNote: string): PcbAgentStageResult {
    if (!bb.workDoc || !bb.routePolicy || !bb.netPlan) {
      return { ok: false, reason: 'missing policy/netPlan/doc' };
    }
    bb.workDoc.tracks = [];
    bb.workDoc.vias = [];
    const local = runPcbGeometryRoute(bb.workDoc, bb.routePolicy, bb.netPlan);
    bb.geometry = local;
    if (local.ok) {
      commitGeometryToWorkDoc(bb, local.tracks, local.vias);
      bb.markStage('geometry');
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PCB] stage=geometry local deterministic ok tracks=${local.tracks.length}` +
        ` vias=${local.vias.length} | LLM unusable: ${llmNote}`);
      return { ok: true, reason: 'ok' };
    }
    const details = local.failDetails ?? [];
    for (let i = 0; i < details.length && i < 8; i++) {
      const d = details[i];
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PCB] geo_fail_detail ${d.netName} ${d.cause}` +
        ` (${Math.round(d.from.x)},${Math.round(d.from.y)})→` +
        `(${Math.round(d.to.x)},${Math.round(d.to.y)})` +
        (d.blocker ? ` | ${d.blocker}` : ''));
    }
    if (local.tracks.length > 0 || local.vias.length > 0) {
      commitGeometryToWorkDoc(bb, local.tracks, local.vias);
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PCB] stage=geometry local partial commit tracks=${local.tracks.length} | ${local.reason}`);
    } else {
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PCB] stage=geometry fail | ${local.reason} | LLM unusable: ${llmNote}`);
    }
    return { ok: false, reason: local.reason, residualKind: 'signal_fail' };
  }
}
