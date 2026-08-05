/**
 * PcbRoutePolicyAgent — 每次必跑 LLM；禁止 skip / 默认层表
 * 覆盖铜层 key + 相对 netPlan 的语义角色校验
 */
import {
  Logger, INSTR_TRACE_TAG, copperLayersFromStack,
  policyCoversCopperLayers, validateLayerRoleSemantics
} from 'common';
import { IAiApiManager } from 'ai_api_manager';
import { PromptLoader } from '../../prompts/PromptLoader';
import { PcbRouteBlackboard } from './PcbRouteBlackboard';
import { PcbDocSummarizer } from './PcbDocSummarizer';
import { parsePcbRoutePolicy } from './PcbLlmParsers';
import { PcbAgentStageResult } from './PcbPlacementAgent';
import { pcbStageChatOpts } from './PcbChatOpts';
import { pcbImpureReplyReason } from './PcbLlmReplyGuard';

export class PcbRoutePolicyAgent {
  async run(bb: PcbRouteBlackboard, api: IAiApiManager,
    priorFailHint?: string): Promise<PcbAgentStageResult> {
    Logger.info(INSTR_TRACE_TAG, `[AI_PCB] stage=route_policy begin runId=${bb.runId}`);
    if (!bb.workDoc || !bb.netPlan) {
      return { ok: false, reason: 'missing workDoc/netPlan' };
    }
    const tpl = PromptLoader.load('pcb_route');
    if (!tpl.system || tpl.system.length === 0) {
      return { ok: false, reason: 'pcb_route prompt missing' };
    }
    const netSummary = bb.netPlan.nets.map(n =>
      `${n.netName}:${n.kind}/${n.routeMode}/p${n.priority}`).join(',');
    let boardSummary = PcbDocSummarizer.boardDiagSnapshot(bb.workDoc, bb.geometry);
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
    const copper = copperLayersFromStack(bb.workDoc.layerStack);
    const missing = policyCoversCopperLayers(policy, copper);
    if (missing.length > 0) {
      return { ok: false, reason: `layerRoles missing: ${missing.join(',')}` };
    }
    const sem = validateLayerRoleSemantics(policy, bb.netPlan);
    if (sem.length > 0) {
      return { ok: false, reason: `layerRoles semantic: ${sem.join('; ')}` };
    }
    bb.routePolicy = policy;
    bb.markStage('route_policy');
    Logger.info(INSTR_TRACE_TAG, `[AI_PCB] stage=route_policy ok layers=${copper.length}`);
    return { ok: true, reason: 'ok' };
  }
}
