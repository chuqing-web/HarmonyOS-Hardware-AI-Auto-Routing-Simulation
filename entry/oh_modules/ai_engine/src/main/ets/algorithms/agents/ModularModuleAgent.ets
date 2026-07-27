/**
 * ModularModuleAgent — 子模块内 Select→Layout→Net→Route/QA（独立 await + 批判）
 */
import {
  AiPipelineResult, ProgressCallback, Logger, INSTR_TRACE_TAG, IdUtil,
  emptySchTopology, makeProgress
} from 'common';
import { IAiApiManager } from 'ai_api_manager';
import { IComponentLibrary } from 'component_library';
import {
  AiPipelineOrchestrator, PipelineOptions, CreatePipelineCtx
} from '../AiPipelineOrchestrator';
import { CircuitBlackboard } from './CircuitBlackboard';
import { SelectAgent } from './SelectAgent';
import { LayoutAgent } from './LayoutAgent';
import { NetAgent } from './NetAgent';
import { RouteAgent } from './RouteAgent';
import { QaAgent } from './QaAgent';
import { StageHooks } from './StageHooks';

export class ModularModuleAgent {
  private selectAgent: SelectAgent = new SelectAgent();
  private layoutAgent: LayoutAgent = new LayoutAgent();
  private netAgent: NetAgent = new NetAgent();
  private routeAgent: RouteAgent;
  private qaAgent: QaAgent;
  private apiManager: IAiApiManager;

  constructor(apiManager: IAiApiManager, library: IComponentLibrary) {
    this.apiManager = apiManager;
    this.routeAgent = new RouteAgent(library);
    this.qaAgent = new QaAgent(this.routeAgent);
  }

  /**
   * 在 fork 出的 child Orchestrator 上跑完整 create 阶段链（无 Requirements）。
   */
  async run(child: AiPipelineOrchestrator, opts: PipelineOptions, moduleId: string,
    onProgress?: ProgressCallback, hooks: StageHooks | null = null): Promise<AiPipelineResult> {
    const bb = new CircuitBlackboard();
    const runId = IdUtil.generate(`mod_${moduleId}`);
    bb.reset(runId, opts.prompt);
    Logger.info(INSTR_TRACE_TAG,
      `[AI_AGENT] modular_child START module=${moduleId} runId=${runId}`);

    const pipeOpts: PipelineOptions = {
      prompt: opts.prompt,
      scene: opts.scene ?? 'text_gen',
      mcuFamily: opts.mcuFamily,
      skipLlm: opts.skipLlm,
      routingWeights: opts.routingWeights,
      generationMode: 'create',
      generateStrategy: 'oneshot',
      modularBoundaryPins: opts.modularBoundaryPins,
      onStreamSnapshot: opts.onStreamSnapshot,
      qualityHardFail: true,
      enableReasoning: opts.enableReasoning
    };
    if (opts.enableReasoning) {
      child.setEnableReasoning(true);
    }

    onProgress?.(makeProgress(10, `${moduleId} 选型`));
    if (child.isCancelRequested()) {
      return this.cancelMod(moduleId, bb.usedLlm);
    }
    const sel = await this.selectAgent.run(bb, child, pipeOpts, onProgress, hooks, this.apiManager);
    if (!sel.ok) {
      Logger.error(INSTR_TRACE_TAG,
        `[AI_AGENT] modular_child ABORT select module=${moduleId} | ${sel.reason}`);
      if (sel.ctx.abort) {
        return sel.ctx.abort;
      }
      const abortSel: AiPipelineResult = {
        topology: emptySchTopology(),
        usedLlm: bb.usedLlm,
        degradedMode: false,
        ercClean: false,
        geoBlocking: 0,
        agentAbortStage: 'select',
        agentAbortReason: sel.reason ?? '子模块选型失败',
        ercErrors: [{
          errType: 'modular_select',
          targetUuid: '',
          desc: sel.reason ?? '子模块选型失败',
          suggest: '检查模块边界器件是否在库内',
          severity: 'error'
        }]
      };
      return abortSel;
    }
    let ctx: CreatePipelineCtx = sel.ctx;

    onProgress?.(makeProgress(35, `${moduleId} 布局`));
    if (child.isCancelRequested()) {
      return this.cancelMod(moduleId, bb.usedLlm);
    }
    const lay = await this.layoutAgent.run(bb, child, pipeOpts, ctx, onProgress, hooks, this.apiManager);
    if (!lay.ok) {
      Logger.error(INSTR_TRACE_TAG,
        `[AI_AGENT] modular_child ABORT layout module=${moduleId}`);
      if (lay.ctx.abort) {
        return lay.ctx.abort;
      }
      const abortLay: AiPipelineResult = {
        topology: emptySchTopology(),
        usedLlm: bb.usedLlm,
        degradedMode: false,
        ercClean: false,
        geoBlocking: 0,
        agentAbortStage: 'layout',
        agentAbortReason: lay.reason ?? '子模块布局失败',
        ercErrors: [{
          errType: 'modular_layout',
          targetUuid: '',
          desc: lay.reason ?? '子模块布局失败',
          suggest: '简化该模块器件数后重试',
          severity: 'error'
        }]
      };
      return abortLay;
    }
    ctx = lay.ctx;

    onProgress?.(makeProgress(55, `${moduleId} 建网`));
    if (child.isCancelRequested()) {
      return this.cancelMod(moduleId, bb.usedLlm);
    }
    const net = await this.netAgent.run(bb, child, pipeOpts, ctx, onProgress, hooks, this.apiManager);
    if (!net.ok) {
      Logger.error(INSTR_TRACE_TAG,
        `[AI_AGENT] modular_child ABORT net module=${moduleId}`);
      if (net.ctx.abort) {
        return net.ctx.abort;
      }
      const abortNet: AiPipelineResult = {
        topology: emptySchTopology(),
        usedLlm: bb.usedLlm,
        degradedMode: false,
        ercClean: false,
        geoBlocking: 0,
        agentAbortStage: 'net',
        agentAbortReason: net.reason ?? '子模块建网失败',
        ercErrors: [{
          errType: 'modular_net',
          targetUuid: '',
          desc: net.reason ?? '子模块建网失败',
          suggest: '检查边界引脚命名',
          severity: 'error'
        }]
      };
      return abortNet;
    }
    ctx = net.ctx;

    onProgress?.(makeProgress(75, `${moduleId} 布线门禁`));
    let result = await child.runRouteQaStage(pipeOpts, onProgress, ctx);
    result.usedLlm = result.usedLlm || bb.usedLlm;

    if (result.topology && (result.topology.deviceList?.length ?? 0) > 0) {
      // runRouteQaStage 已含 WAR；仅当未 warDone 时补跑
      if (!result.warDone) {
        this.routeAgent.begin(bb);
        const war = await this.routeAgent.ensureWar(result.topology,
          () => child.isCancelRequested());
        this.routeAgent.end(bb, war.ok, war.reason);
        if (!war.ok) {
          Logger.error(INSTR_TRACE_TAG,
            `[AI_AGENT] modular_child ABORT WAR module=${moduleId} | ${war.reason}`);
          const abortWar: AiPipelineResult = {
            topology: emptySchTopology(),
            usedLlm: result.usedLlm,
            degradedMode: false,
            ercClean: false,
            geoBlocking: 1,
            agentAbortStage: 'route',
            agentAbortReason: war.reason,
            ercErrors: [{
              errType: 'modular_war',
              targetUuid: '',
              desc: war.reason,
              suggest: '调整该模块摆放间距',
              severity: 'error'
            }]
          };
          return abortWar;
        }
        result.warDone = true;
      } else {
        Logger.info(INSTR_TRACE_TAG,
          `[AI_AGENT] modular_child skip duplicate WAR module=${moduleId}`);
      }
      this.qaAgent.begin(bb);
      const qa = await this.qaAgent.gate(bb, result, true);
      result = qa.result;
    }

    Logger.info(INSTR_TRACE_TAG,
      `[AI_AGENT] modular_child END module=${moduleId}` +
      ` clean=${result.ercClean} devs=${result.topology?.deviceList?.length ?? 0}`);
    return result;
  }

  private cancelMod(moduleId: string, usedLlm: boolean): AiPipelineResult {
    Logger.info(INSTR_TRACE_TAG, `[AI_AGENT] modular_child CANCEL module=${moduleId}`);
    const out: AiPipelineResult = {
      topology: emptySchTopology(),
      usedLlm: usedLlm,
      degradedMode: false,
      ercClean: false,
      geoBlocking: 0,
      agentAbortStage: 'cancelled',
      agentAbortReason: `模块 ${moduleId} 已取消`,
      ercErrors: [{
        errType: 'cancelled',
        targetUuid: '',
        desc: 'cancelled',
        suggest: '',
        severity: 'error'
      }]
    };
    return out;
  }
}
