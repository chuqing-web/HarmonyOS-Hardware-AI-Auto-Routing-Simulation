/**
 * PCB 自动布线编排器：阶段 0–6 + 布局-布线回环（最多 3 轮）。
 * Placement / Strategy / Routing / Critic / Knowledge 按边界协作；几何由 autoRoutePcb 执行。
 */
import { PcbDocument, PcbLayerId, PcbRatsnestEdge, copperLayersFromStack } from '../../types/PcbTypes';
import {
  PcbRouteAgentBundle, PcbRouteEngineHooks, PcbAutoRouteAgentContext,
  PcbPlacementAgentAdvice, PcbCriticReport, isTrustedAutoAdvice
} from '../../types/PcbAiRouteTypes';
import { autoRoutePcb, AutoRouteResult } from '../PcbAutoRouter';
import { AccessoryNetHint } from '../PcbBoardAccessories';
import { applyPcbPlacementPlan } from './PcbPlacementExecutor';
import {
  buildMcuColumnPlacementPlan, detectMcuColumnClusters, mcuColumnNeedsRepair
} from './PcbMcuColumnPlacer';
import { buildRatsnest } from '../PcbNetUtil';
import { padWorldPosition } from '../PcbZoneUtil';
import { buildCongestionMap, buildPlacementCongestionFeedback } from './PcbGlobalRoute';
import { tracePcb, tracePcbWarn } from '../PcbTraceLog';

/** 布局-布线协同硬上限（不含初始布局轮） */
const MAX_PLACE_COITER = 3;

interface OrchNetPadAgg {
  netId: string;
  netName: string;
  pads: number;
  sx: number;
  sy: number;
}

/** 网 pad 数 + 质心（供 Placement 全局决策） */
function collectOrchNetPadAggs(doc: PcbDocument): Map<string, OrchNetPadAgg> {
  const map: Map<string, OrchNetPadAgg> = new Map();
  const fps = doc.footprints ?? [];
  for (let fi = 0; fi < fps.length; fi++) {
    const fp = fps[fi];
    if (fp.defId === 'FP_MOUNT') {
      continue;
    }
    for (let pi = 0; pi < fp.pads.length; pi++) {
      const pad = fp.pads[pi];
      const nid = pad.netId ?? '';
      if (nid.length === 0) {
        continue;
      }
      const pos = padWorldPosition(fp, pad);
      let agg = map.get(nid);
      if (agg === undefined) {
        agg = {
          netId: nid,
          netName: pad.netName !== undefined && pad.netName.length > 0 ? pad.netName : nid,
          pads: 0,
          sx: 0,
          sy: 0
        };
        map.set(nid, agg);
      }
      agg.pads++;
      agg.sx += pos.x;
      agg.sy += pos.y;
    }
  }
  return map;
}

/** 关键飞线：按 span 降序，优先长跨 / 未布通；顺带收集网 id */
function buildOrchCriticalRats(rats: PcbRatsnestEdge[], maxLines: number,
  outNetIds: string[]): string[] {
  const scored: PcbRatsnestEdge[] = rats.slice();
  scored.sort((a: PcbRatsnestEdge, b: PcbRatsnestEdge): number => {
    const sa = Math.hypot(a.a.x - a.b.x, a.a.y - a.b.y);
    const sb = Math.hypot(b.a.x - b.b.x, b.a.y - b.b.y);
    return sb - sa;
  });
  const lines: string[] = [];
  const seen: Record<string, boolean> = {};
  const netSeen: Record<string, boolean> = {};
  for (let i = 0; i < scored.length && lines.length < maxLines; i++) {
    const r = scored[i];
    const key = `${r.netId}|${Math.round(r.a.x)},${Math.round(r.a.y)}|` +
      `${Math.round(r.b.x)},${Math.round(r.b.y)}`;
    if (seen[key]) {
      continue;
    }
    seen[key] = true;
    const span = Math.round(Math.hypot(r.a.x - r.b.x, r.a.y - r.b.y));
    const name = r.netName !== undefined && r.netName.length > 0 ? r.netName : r.netId;
    lines.push(
      `${name}|a=(${Math.round(r.a.x)},${Math.round(r.a.y)})|` +
      `b=(${Math.round(r.b.x)},${Math.round(r.b.y)})|span=${span}`);
    if (!netSeen[r.netId] && outNetIds.length < 24) {
      netSeen[r.netId] = true;
      outNetIds.push(r.netId);
    }
  }
  return lines;
}

/** 关键网焊盘端点采样（优先失败网 / 长飞线网） */
function buildOrchPadSamples(doc: PcbDocument, wantNetIds: string[], maxLines: number): string[] {
  const want: Record<string, boolean> = {};
  for (let i = 0; i < wantNetIds.length; i++) {
    want[wantNetIds[i]] = true;
  }
  const lines: string[] = [];
  const fps = doc.footprints ?? [];
  for (let fi = 0; fi < fps.length && lines.length < maxLines; fi++) {
    const fp = fps[fi];
    for (let pi = 0; pi < fp.pads.length && lines.length < maxLines; pi++) {
      const pad = fp.pads[pi];
      const nid = pad.netId ?? '';
      if (nid.length === 0 || !want[nid]) {
        continue;
      }
      const pos = padWorldPosition(fp, pad);
      const nm = pad.netName !== undefined && pad.netName.length > 0 ? pad.netName : nid;
      const pn = pad.number.length > 0 ? pad.number : pad.id;
      lines.push(`${nm}|${fp.refDes}.${pn}@(${Math.round(pos.x)},${Math.round(pos.y)})`);
    }
  }
  return lines;
}

function buildOrchestratorCtx(doc: PcbDocument, placeRound: number,
  knowledgeHints: string[], metricsSummary: string): PcbAutoRouteAgentContext {
  const copper = copperLayersFromStack(doc.layerStack);
  const cuIds: string[] = [];
  for (let i = 0; i < copper.length; i++) {
    cuIds.push(copper[i] as string);
  }
  const fps = doc.footprints ?? [];
  const fpLines: string[] = [];
  const movableIds: string[] = [];
  for (let i = 0; i < fps.length && i < 96; i++) {
    const fp = fps[i];
    fpLines.push(`${fp.id}|${fp.refDes ?? ''}|${fp.defId ?? ''}|` +
      `x=${fp.position.x.toFixed(1)},y=${fp.position.y.toFixed(1)},r=${String(fp.rotation)}`);
    const defU = (fp.defId ?? '').toUpperCase();
    const refU = (fp.refDes ?? '').toUpperCase();
    const isMount = defU.indexOf('MOUNT') >= 0 ||
      (refU.length >= 2 && refU.charAt(0) === 'H' && defU.indexOf('PINHDR') < 0);
    if (!isMount && !fp.locked) {
      movableIds.push(fp.id);
    }
  }

  const padAggs = collectOrchNetPadAggs(doc);
  const netSummaries: string[] = [];
  const nets = doc.nets ?? [];
  for (let i = 0; i < nets.length && netSummaries.length < 80; i++) {
    const n = nets[i];
    const agg = padAggs.get(n.id);
    if (agg !== undefined && agg.pads > 0) {
      const cx = Math.round(agg.sx / agg.pads);
      const cy = Math.round(agg.sy / agg.pads);
      netSummaries.push(`${n.id}|${n.name}|pads=${agg.pads}|c=(${cx},${cy})`);
    } else {
      netSummaries.push(`${n.id}|${n.name}|pads=0`);
    }
  }
  // 文档 nets 可能不全：补上仅出现在焊盘上的网
  padAggs.forEach((agg: OrchNetPadAgg, nid: string) => {
    if (netSummaries.length >= 80) {
      return;
    }
    let found = false;
    for (let i = 0; i < nets.length; i++) {
      if (nets[i].id === nid) {
        found = true;
        break;
      }
    }
    if (!found) {
      const cx = Math.round(agg.sx / Math.max(1, agg.pads));
      const cy = Math.round(agg.sy / Math.max(1, agg.pads));
      netSummaries.push(`${nid}|${agg.netName}|pads=${agg.pads}|c=(${cx},${cy})`);
    }
  });

  const rats = buildRatsnest(doc);
  const failSummaries: string[] = [];
  const failSeen: Record<string, boolean> = {};
  for (let i = 0; i < rats.length && failSummaries.length < 40; i++) {
    const id = rats[i].netId;
    if (failSeen[id]) {
      continue;
    }
    failSeen[id] = true;
    failSummaries.push(`${id}|${rats[i].netName ?? ''}`);
  }
  const criticalNetIds: string[] = [];
  const ratsDetails = buildOrchCriticalRats(rats, 28, criticalNetIds);
  const padSamples = buildOrchPadSamples(doc, criticalNetIds, 36);

  const outline = doc.boardOutline?.points ?? [];
  let boardLine = 'board=unknown';
  if (outline.length >= 2) {
    let minX = outline[0].x;
    let minY = outline[0].y;
    let maxX = outline[0].x;
    let maxY = outline[0].y;
    for (let i = 1; i < outline.length; i++) {
      if (outline[i].x < minX) {
        minX = outline[i].x;
      }
      if (outline[i].y < minY) {
        minY = outline[i].y;
      }
      if (outline[i].x > maxX) {
        maxX = outline[i].x;
      }
      if (outline[i].y > maxY) {
        maxY = outline[i].y;
      }
    }
    boardLine = `board=${(maxX - minX).toFixed(0)}x${(maxY - minY).toFixed(0)} mil`;
  }
  const situationLines: string[] = [
    boardLine,
    `copper=${cuIds.length} [${cuIds.join(',')}]`,
    `footprints=${fps.length}`,
    `rats=${rats.length}`,
    `placeRound=${placeRound}`
  ];
  if (fpLines.length > 0) {
    situationLines.push('fps: ' + fpLines.slice(0, 96).join('; '));
  }
  if (movableIds.length > 0) {
    situationLines.push(
      `movable=${movableIds.length} ids: ${movableIds.slice(0, 96).join(',')}`);
  }

  // 拥塞热点：有铜时才有意义；首轮贴装前多为空
  try {
    const cong = buildCongestionMap(doc, 80);
    const fb = buildPlacementCongestionFeedback(cong, 8);
    situationLines.push(
      `cong maxD=${fb.maxDensity.toFixed(0)} meanD=${fb.meanDensity.toFixed(1)} ` +
      `hotspots=${fb.hotspots.length} ${fb.suggestReplace ? 'HIGH' : 'ok'}`);
    const hotParts: string[] = [];
    for (let i = 0; i < fb.hotspots.length && i < 8; i++) {
      const h = fb.hotspots[i];
      hotParts.push(
        `${h.layer}@(${Math.round(h.x)},${Math.round(h.y)})d=${h.density.toFixed(0)}`);
    }
    if (hotParts.length > 0) {
      situationLines.push('congHot: ' + hotParts.join('; '));
    }
  } catch (_e) {
    situationLines.push('cong=(unavailable)');
  }

  const ctx: PcbAutoRouteAgentContext = {
    copperLayers: cuIds,
    netSummaries: netSummaries,
    failSummaries: failSummaries,
    metricsSummary: metricsSummary,
    situationLines: situationLines,
    ratsDetails: ratsDetails,
    padSamples: padSamples,
    knowledgeHints: knowledgeHints,
    placeRound: placeRound
  };
  return ctx;
}

function clearAllCopper(doc: PcbDocument): void {
  doc.tracks = [];
  doc.vias = [];
}

/**
 * 编排自动布线：Placement → Knowledge/Strategy → RoutingCore → Critic →（布局回环）→ Knowledge 沉淀。
 */
export async function orchestratePcbAutoRoute(
  doc: PcbDocument,
  layer: PcbLayerId,
  schNets: AccessoryNetHint[] | undefined,
  agents: PcbRouteAgentBundle
): Promise<AutoRouteResult> {
  const messages: string[] = [];
  let last: AutoRouteResult = {
    trackCount: 0,
    netCount: 0,
    messages: ['编排未执行'],
    completionRate: 0
  };
  let layoutIssue = true;
  let knowledgeHints: string[] = [];

  for (let round = 0; round <= MAX_PLACE_COITER; round++) {
    tracePcb('ORCH_ROUND_BEGIN', `placeRound=${round}/${MAX_PLACE_COITER}`);
    const prepCtx = buildOrchestratorCtx(doc, round, knowledgeHints, `round=${round}`);
    try {
      const snap = await agents.knowledgePrepare(prepCtx);
      if (snap !== null) {
        knowledgeHints = snap.ruleHints.slice();
        if (snap.sessionNotes.length > 0) {
          knowledgeHints = knowledgeHints.concat(snap.sessionNotes);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : `${e}`;
      tracePcbWarn('ORCH_KNOWLEDGE_FAIL', msg);
    }

    // 阶段 0：布局（首轮必做；之后仅 Critic 判定 layoutIssue 时重做）
    // LLM 按模板列式配方决策；本地列式贴簇兜底（模板手摆配方，非靠 maze 硬冲）
    if (round === 0 || layoutIssue) {
      tracePcb('ORCH_STAGE', `placement round=${round}`);
      const pctx = buildOrchestratorCtx(doc, round, knowledgeHints, `placement round=${round}`);
      let llmPlaced = false;
      try {
        const placeAdvice: PcbPlacementAgentAdvice | null = await agents.placementOptimize(pctx);
        if (placeAdvice !== null &&
          isTrustedAutoAdvice(placeAdvice.fromLlm, placeAdvice.fromLocal) &&
          placeAdvice.plan.placements.length > 0 &&
          placeAdvice.plan.decision !== 'keep') {
          if (round > 0) {
            clearAllCopper(doc);
          }
          const applied = applyPcbPlacementPlan(doc, placeAdvice.plan, { allowEcho: true });
          if (applied.ok) {
            llmPlaced = true;
            messages.push(
              `布局${placeAdvice.plan.decision === 'relayout' ? '整板重排' : '优化'}: ` +
              `移动 ${applied.placedCount} 个器件 (r${round})`);
            tracePcb('ORCH_PLACE_APPLY',
              `round=${round} decision=${placeAdvice.plan.decision ?? 'revise'} ` +
              `placed=${applied.placedCount} src=` +
              `${placeAdvice.fromLlm ? 'llm' : 'local'}`);
          } else {
            tracePcbWarn('ORCH_PLACE_FAIL', applied.reason);
          }
        } else {
          tracePcb('ORCH_PLACE_SKIP',
            `round=${round} keep_or_empty`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : `${e}`;
        tracePcbWarn('ORCH_PLACE_FAIL', msg);
      }

      const clusters = detectMcuColumnClusters(doc);
      const needCol = clusters > 0 &&
        (mcuColumnNeedsRepair(doc) || (round > 0 && layoutIssue));
      if (needCol) {
        const colPlan = buildMcuColumnPlacementPlan(doc, {
          packColumns: round > 0 || !llmPlaced
        });
        if (colPlan !== null && colPlan.placements.length > 0) {
          if (round > 0 && !llmPlaced) {
            clearAllCopper(doc);
          }
          const colApplied = applyPcbPlacementPlan(doc, colPlan, { allowEcho: true, allowLocal: true });
          if (colApplied.ok) {
            messages.push(
              `列式贴簇: 移动 ${colApplied.placedCount} 个器件 (MCU×${clusters}, r${round})`);
            tracePcb('ORCH_PLACE_COLUMN',
              `round=${round} placed=${colApplied.placedCount} clusters=${clusters} ` +
              `afterLlm=${llmPlaced ? 1 : 0}`);
          } else {
            tracePcbWarn('ORCH_PLACE_COLUMN_FAIL', colApplied.reason);
          }
        }
      }
    }

    // 阶段 1–3：Strategy + RoutingCore（几何）
    const engine: PcbRouteEngineHooks = {
      strategyPlan: agents.strategyPlan,
      strategyOnFail: agents.strategyOnFail,
      routingSalvage: agents.routingSalvage
    };
    tracePcb('ORCH_STAGE', `routingCore round=${round}`);
    last = await autoRoutePcb(doc, layer, schNets, engine);
    for (let i = 0; i < last.messages.length; i++) {
      messages.push(last.messages[i]);
    }

    const rate = last.completionRate !== undefined ? last.completionRate : 0;
    const ratsN = buildRatsnest(doc).length;
    const metricsSummary =
      `completion=${(rate * 100).toFixed(1)}% unrouted=${ratsN} ` +
      `tracks=${last.trackCount} vias=${last.viaCount ?? 0} ` +
      `drc=${last.drcErrorCount ?? 0}`;

    // 阶段 4：Critic
    layoutIssue = false;
    let critic: PcbCriticReport | null = null;
    const cctx = buildOrchestratorCtx(doc, round, knowledgeHints, metricsSummary);
    try {
      critic = await agents.criticReview(cctx);
      if (critic !== null && isTrustedAutoAdvice(critic.fromLlm, critic.fromLocal)) {
        layoutIssue = critic.layoutIssue === true && rate < 0.999;
        messages.push(
          `评审: 分=${critic.overallScore} layoutIssue=${layoutIssue ? 1 : 0} ` +
          `${(critic.notes ?? '').substring(0, 60)}`);
        tracePcb('ORCH_CRITIC',
          `score=${critic.overallScore} layoutIssue=${layoutIssue ? 1 : 0} ` +
          `rate=${(rate * 100).toFixed(1)}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : `${e}`;
      tracePcbWarn('ORCH_CRITIC_FAIL', msg);
    }

    // 阶段 5：布通则结束；layoutIssue → 改布局回环；否则低布通 → 仅清铜重布
    if (rate >= 0.999 || ratsN === 0) {
      tracePcb('ORCH_DONE', `routed rate=${(rate * 100).toFixed(1)} round=${round}`);
      break;
    }
    if (round >= MAX_PLACE_COITER) {
      tracePcbWarn('ORCH_STOP',
        `place_cap rate=${(rate * 100).toFixed(1)} round=${round}`);
      break;
    }
    if (layoutIssue) {
      clearAllCopper(doc);
      tracePcb('ORCH_RELOOP', `clear_copper → placeRound=${round + 1}`);
      continue;
    }
    // Critic 未判布局问题，但布通仍低：保留贴装，清铜再走 LLM 大脑布线
    if (rate < 0.95) {
      clearAllCopper(doc);
      layoutIssue = false;
      tracePcb('ORCH_RELOOP',
        `clear_copper route_only → round=${round + 1} rate=${(rate * 100).toFixed(1)}`);
      continue;
    }
    tracePcb('ORCH_STOP',
      `not_layout_issue rate=${(rate * 100).toFixed(1)} round=${round}`);
    break;
  }

  // 阶段 6：知识沉淀
  const finalRate = last.completionRate !== undefined ? last.completionRate : 0;
  const summary =
    `completion=${(finalRate * 100).toFixed(1)}% nets=${last.netCount} ` +
    `tracks=${last.trackCount} vias=${last.viaCount ?? 0}`;
  try {
    const rctx = buildOrchestratorCtx(doc, 0, knowledgeHints, summary);
    agents.knowledgeRecord(rctx, summary);
  } catch (e) {
    const msg = e instanceof Error ? e.message : `${e}`;
    tracePcbWarn('ORCH_KNOWLEDGE_RECORD_FAIL', msg);
  }

  last.messages = messages;
  return last;
}
