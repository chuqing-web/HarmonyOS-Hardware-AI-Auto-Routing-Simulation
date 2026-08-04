/**
 * PcbPlacementAgent — LLM 位姿 + 本地 Executor 应用
 */
import {
  AiCapability, Logger, INSTR_TRACE_TAG, applyPcbPlacementPlan, PcbResidualKind
} from 'common';
import { IAiApiManager } from 'ai_api_manager';
import { PromptLoader } from '../../prompts/PromptLoader';
import { PcbRouteBlackboard } from './PcbRouteBlackboard';
import { PcbDocSummarizer } from './PcbDocSummarizer';
import { parsePcbPlacementPlan } from './PcbLlmParsers';

export interface PcbAgentStageResult {
  ok: boolean;
  reason: string;
  residual?: boolean;
  residualKind?: PcbResidualKind;
}

export class PcbPlacementAgent {
  async run(bb: PcbRouteBlackboard, api: IAiApiManager,
    priorFailHint?: string): Promise<PcbAgentStageResult> {
    Logger.info(INSTR_TRACE_TAG, `[AI_PCB] stage=placement begin runId=${bb.runId}`);
    if (!bb.workDoc) {
      return { ok: false, reason: 'no work doc' };
    }
    const tpl = PromptLoader.load('pcb_placement');
    if (!tpl.system || tpl.system.length === 0) {
      return { ok: false, reason: 'pcb_placement prompt missing' };
    }
    let fpList = PcbDocSummarizer.footprintList(bb.workDoc);
    if (priorFailHint && priorFailHint.length > 0) {
      fpList = `${fpList}\n【上轮失败须修正】${priorFailHint}`;
    }
    const prompt = PromptLoader.render(tpl, [
      { key: 'board_outline', value: PcbDocSummarizer.boardOutline(bb.workDoc) },
      { key: 'copper_count', value: String(bb.workDoc.layerStack.copperCount) },
      { key: 'footprint_list', value: fpList }
    ]);
    const apiRes = await api.chat(prompt, {
      capability: AiCapability.PCB_AUTO_ROUTE,
      temperature: 0.1,
      disableThinking: false
    });
    if (!apiRes.success || !apiRes.data) {
      return { ok: false, reason: apiRes.error ?? 'placement LLM failed' };
    }
    bb.usedLlm = true;
    const plan = parsePcbPlacementPlan(apiRes.data);
    if (!plan) {
      return { ok: false, reason: 'placement LLM JSON invalid' };
    }
    const applied = applyPcbPlacementPlan(bb.workDoc, plan);
    if (!applied.ok) {
      return { ok: false, reason: applied.reason };
    }
    bb.placementPlan = plan;
    bb.markStage('placement');
    Logger.info(INSTR_TRACE_TAG, `[AI_PCB] stage=placement ok placed=${applied.placedCount}`);
    return { ok: true, reason: 'ok' };
  }
}
