/**
 * AgentPipelineCoordinator — Phase2 顺序调度：独立 await 阶段 + 批判 + 快照续跑
 */
import {
  AiPipelineResult, ProgressCallback, ClarificationAnswer,
  RequirementSpec, emptyRequirementSpec, Logger, INSTR_TRACE_TAG, IdUtil,
  emptySchTopology, makeProgress, SchTopology
} from 'common';
import { IAiApiManager } from 'ai_api_manager';
import { IComponentLibrary } from 'component_library';
import {
  AiPipelineOrchestrator, PipelineOptions, CreatePipelineCtx, LlmFetchResult
} from '../AiPipelineOrchestrator';
import { CircuitBlackboard, BlackboardSnapshot } from './CircuitBlackboard';
import { RequirementsAgent, RequirementsAgentResult } from './RequirementsAgent';
import { SelectAgent } from './SelectAgent';
import { LayoutAgent } from './LayoutAgent';
import { NetAgent } from './NetAgent';
import { RouteAgent } from './RouteAgent';
import { QaAgent } from './QaAgent';
import {
  StageHooks, canSkipStage, withCritiqueLimit, CritiqueLimits, StageHookContext,
  CritiqueAttemptResult
} from './StageHooks';
import { NetPlanResult, NetPlanWiringHints } from '../NetPlanExecutor';

export interface AgentCoordinatorOptions extends PipelineOptions {
  clarificationAnswers?: ClarificationAnswer[];
  qualityHardFail?: boolean;
  enableReasoning?: boolean;
  /** 从快照续跑（跳过已完成阶段） */
  resumeSnapshot?: BlackboardSnapshot;
}

export class AgentPipelineCoordinator {
  private apiManager: IAiApiManager;
  private orchestrator: AiPipelineOrchestrator;
  private requirementsAgent: RequirementsAgent;
  private selectAgent: SelectAgent = new SelectAgent();
  private layoutAgent: LayoutAgent = new LayoutAgent();
  private netAgent: NetAgent = new NetAgent();
  private routeAgent: RouteAgent;
  private qaAgent: QaAgent;
  private blackboard: CircuitBlackboard = new CircuitBlackboard();
  private lastSnapshot: BlackboardSnapshot | null = null;
  private hooks: StageHooks | null = null;

  constructor(apiManager: IAiApiManager, library: IComponentLibrary) {
    this.apiManager = apiManager;
    this.orchestrator = new AiPipelineOrchestrator(apiManager, library);
    this.requirementsAgent = new RequirementsAgent(apiManager, library);
    this.routeAgent = new RouteAgent(library);
    this.qaAgent = new QaAgent(this.routeAgent);
  }

  setStageHooks(hooks: StageHooks | null): void {
    this.hooks = hooks;
  }

  getBlackboard(): CircuitBlackboard {
    return this.blackboard;
  }

  getLastSnapshot(): BlackboardSnapshot | null {
    return this.lastSnapshot;
  }

  getOrchestrator(): AiPipelineOrchestrator {
    return this.orchestrator;
  }

  requestCancel(): void {
    this.orchestrator.requestCancel();
  }

  clearCancel(): void {
    this.orchestrator.clearCancel();
  }

  async runOneshot(opts: AgentCoordinatorOptions,
    onProgress?: ProgressCallback): Promise<AiPipelineResult> {
    if (opts.generationMode === 'edit') {
      return await this.runEdit(opts, onProgress);
    }
    return await this.runCreate(opts, onProgress);
  }

  async runEdit(opts: AgentCoordinatorOptions,
    onProgress?: ProgressCallback): Promise<AiPipelineResult> {
    const runId = IdUtil.generate('run');
    this.prepareRun(runId, opts);
    const hard = opts.qualityHardFail !== false && !opts.skipLlm;
    Logger.info(INSTR_TRACE_TAG, `[AI_AGENT] START edit runId=${runId} hardFail=${hard}`);

    const reqOk = await this.runRequirementsMaybe(opts, onProgress);
    if (reqOk === 'clarify') {
      return this.clarifyResult();
    }
    if (reqOk === 'abort') {
      return this.abortResult('requirements', this.blackboard.abortReason || '需求失败',
        this.blackboard.usedLlm);
    }

    const pipeOpts = this.toPipeOpts(opts, hard);
    pipeOpts.generationMode = 'edit';
    const result = await this.orchestrator.runEditPipeline(pipeOpts, onProgress);
    return this.afterPipe(opts, result, hard, onProgress);
  }

  async runSelfCheck(topo: SchTopology, hardFail: boolean = true,
    onProgress?: ProgressCallback): Promise<AiPipelineResult> {
    const runId = IdUtil.generate('run');
    this.blackboard.reset(runId, 'self_check');
    this.blackboard.topology = topo;
    Logger.info(INSTR_TRACE_TAG, `[AI_AGENT] START self_check runId=${runId}`);
    onProgress?.(makeProgress(20, '自检 WAR 补线'));
    this.routeAgent.begin(this.blackboard);
    const war = await this.routeAgent.ensureWar(topo,
      () => this.orchestrator.isCancelRequested());
    this.routeAgent.end(this.blackboard, war.ok, war.reason);
    onProgress?.(makeProgress(80, '自检 QA'));
    const result: AiPipelineResult = {
      topology: topo,
      usedLlm: false,
      degradedMode: false,
      ercClean: war.ok,
      geoBlocking: war.ok ? 0 : 1,
      deliveredWithResidual: !war.ok,
      warDone: war.ok,
      ercErrors: war.ok ? [] : [{
        errType: 'self_check_war',
        targetUuid: '',
        desc: war.reason,
        suggest: '调整器件间距后重试自检',
        severity: 'error'
      }]
    };
    this.qaAgent.begin(this.blackboard);
    const qa = await this.qaAgent.gate(this.blackboard, result, hardFail,
      () => this.orchestrator.isCancelRequested());
    this.lastSnapshot = this.blackboard.toSnapshot();
    onProgress?.(makeProgress(100, qa.ok ? '自检通过' : '自检未通过', true));
    return qa.result;
  }

  /** Modular：委派 Orchestrator，外层按 CRITIQUE_LIMITS 有限重试 */
  async runModular(opts: AgentCoordinatorOptions,
    onProgress?: ProgressCallback): Promise<AiPipelineResult> {
    const runId = IdUtil.generate('run');
    this.prepareRun(runId, opts);
    Logger.info(INSTR_TRACE_TAG,
      `[AI_AGENT] START modular runId=${runId} critiqueLimit=${CritiqueLimits.select}`);
    const pipeOpts = this.toPipeOpts(opts, opts.qualityHardFail !== false);
    pipeOpts.generateStrategy = 'modular';
    pipeOpts.qualityHardFail = opts.qualityHardFail !== false;

    const result = await withCritiqueLimit<AiPipelineResult>(
      'select', runId, this.hooks,
      async (attempt) => {
        Logger.info(INSTR_TRACE_TAG, `[AI_AGENT] modular attempt=${attempt + 1}`);
        onProgress?.(makeProgress(5, `模块并行 第${attempt + 1}次`));
        const r = await this.orchestrator.runModularParallelPipeline(pipeOpts, onProgress);
        const ok = !!(r.topology && (r.topology.deviceList?.length ?? 0) > 0) &&
          !r.agentAbortStage && (r.ercClean || !opts.qualityHardFail);
        const critiqueCtx: StageHookContext = {
          stage: 'select',
          runId: runId,
          attempt: attempt,
          zeroMatch: (r.topology?.deviceList?.length ?? 0) === 0,
          hardLines: r.ercClean ? [] : ['modular residual or empty']
        };
        const attemptOut: CritiqueAttemptResult<AiPipelineResult> = {
          ok: ok,
          value: r,
          critiqueCtx: critiqueCtx
        };
        return attemptOut;
      },
      (last, reason) => {
        Logger.error(INSTR_TRACE_TAG, `[AI_AGENT] modular critique exhausted | ${reason}`);
        if (last) {
          return last;
        }
        const exhausted: AiPipelineResult = {
          topology: emptySchTopology(),
          usedLlm: false,
          degradedMode: false,
          ercClean: false,
          geoBlocking: 0,
          agentAbortStage: 'modular',
          agentAbortReason: reason,
          ercErrors: [{
            errType: 'modular',
            targetUuid: '',
            desc: reason,
            suggest: '简化模块划分后重试',
            severity: 'error'
          }]
        };
        return exhausted;
      }
    );

    this.blackboard.topology = result.topology ?? emptySchTopology();
    this.blackboard.usedLlm = !!result.usedLlm;
    if (result.ercClean && !result.agentAbortStage) {
      this.blackboard.markStageDone('qa');
    }
    this.lastSnapshot = this.blackboard.toSnapshot();
    Logger.info(INSTR_TRACE_TAG,
      `[AI_AGENT] END modular usedLlm=${result.usedLlm} clean=${result.ercClean}`);
    return result;
  }

  private async runCreate(opts: AgentCoordinatorOptions,
    onProgress?: ProgressCallback): Promise<AiPipelineResult> {
    const runId = IdUtil.generate('run');
    this.prepareRun(runId, opts);
    const hard = opts.qualityHardFail !== false && !opts.skipLlm;
    Logger.info(INSTR_TRACE_TAG,
      `[AI_AGENT] START runId=${runId} promptLen=${opts.prompt.length} hardFail=${hard}` +
      ` resume=${!!opts.resumeSnapshot} stage=${this.blackboard.stageCompleted}`);

    const reqOk = await this.runRequirementsMaybe(opts, onProgress);
    if (reqOk === 'clarify') {
      return this.clarifyResult();
    }
    if (reqOk === 'abort') {
      return this.abortResult('requirements', this.blackboard.abortReason || '需求失败',
        this.blackboard.usedLlm);
    }

    const pipeOpts = this.toPipeOpts(opts, hard);
    let ctx = new CreatePipelineCtx();
    ctx.usedLlm = this.blackboard.usedLlm;

    // Select：产物断言 + 禁伪造 fromLlm
    if (this.blackboard.canSkip('select') && this.blackboard.selectResult &&
      this.blackboard.selectLlmOutput) {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_AGENT] skip select (snapshot) hasSelectLlm=true`);
      ctx.selectResult = this.blackboard.selectResult;
      ctx.selectLlm = {
        fromLlm: this.blackboard.selectLlmFromLlm,
        output: this.blackboard.selectLlmOutput
      };
      this.selectAgent.end(this.blackboard, true, 'skipped');
    } else {
      if (canSkipStage(this.blackboard.stageCompleted, 'select') &&
        (!this.blackboard.selectLlmOutput || !this.blackboard.selectResult)) {
        Logger.warn(INSTR_TRACE_TAG,
          '[AI_AGENT] skip select blocked — missing artifacts, force re-run');
      }
      const sel = await this.selectAgent.run(this.blackboard, this.orchestrator, pipeOpts,
        onProgress, this.hooks, this.apiManager);
      if (!sel.ok) {
        this.lastSnapshot = this.blackboard.toSnapshot();
        return sel.ctx.abort ?? this.abortResult('select', sel.reason ?? '选型失败',
          this.blackboard.usedLlm);
      }
      ctx = sel.ctx;
      this.lastSnapshot = this.blackboard.toSnapshot();
    }

    // Layout
    if (this.blackboard.canSkip('layout') && this.blackboard.placement) {
      Logger.info(INSTR_TRACE_TAG, '[AI_AGENT] skip layout (snapshot)');
      ctx.placement = this.blackboard.placement;
      if (this.blackboard.layoutLlm) {
        ctx.layoutLlm = { fromLlm: true, output: this.blackboard.layoutLlm };
      }
      this.layoutAgent.end(this.blackboard, true, 'skipped');
    } else {
      const lay = await this.layoutAgent.run(this.blackboard, this.orchestrator, pipeOpts, ctx,
        onProgress, this.hooks, this.apiManager);
      if (!lay.ok) {
        this.lastSnapshot = this.blackboard.toSnapshot();
        return lay.ctx.abort ?? this.abortResult('layout', lay.reason ?? '布局失败',
          this.blackboard.usedLlm);
      }
      ctx = lay.ctx;
      this.lastSnapshot = this.blackboard.toSnapshot();
    }

    // Net：有真实网才可 skip
    if (this.blackboard.canSkip('net')) {
      Logger.info(INSTR_TRACE_TAG, '[AI_AGENT] skip net (snapshot)');
      ctx.topoWithNets = this.blackboard.topology;
      ctx.placement = this.blackboard.placement;
      ctx.netPlanNotes = this.blackboard.netPlanNotes;
      const skipHints: NetPlanWiringHints = {
        priorityOrder: [],
        forceWire: [],
        forceLabel: []
      };
      const skipPlan: NetPlanResult = {
        nets: [],
        labels: [],
        wiringHints: skipHints,
        topologyNotes: this.blackboard.netPlanNotes || 'snapshot-skip'
      };
      const skipFetch: LlmFetchResult<NetPlanResult> = {
        fromLlm: this.blackboard.usedLlm,
        output: skipPlan
      };
      ctx.netPlanResult = skipFetch;
      this.netAgent.end(this.blackboard, true, 'skipped');
    } else {
      const net = await this.netAgent.run(this.blackboard, this.orchestrator, pipeOpts, ctx,
        onProgress, this.hooks, this.apiManager);
      if (!net.ok) {
        this.lastSnapshot = this.blackboard.toSnapshot();
        return net.ctx.abort ?? this.abortResult('net', net.reason ?? '建网失败',
          this.blackboard.usedLlm);
      }
      ctx = net.ctx;
      this.blackboard.netPlanNotes = ctx.netPlanNotes;
      this.lastSnapshot = this.blackboard.toSnapshot();
    }

    // Route + QA（Orchestrator 尾段）
    onProgress?.(makeProgress(75, '布线与门禁'));
    const result = await this.orchestrator.runRouteQaStage(pipeOpts, onProgress, ctx);
    result.usedLlm = result.usedLlm || this.blackboard.usedLlm;
    return this.afterPipe(opts, result, hard, onProgress);
  }

  /**
   * Requirements：快照已完成且无新澄清需求时可跳过；
   * 有 clarificationAnswers 时强制再跑（产出 RequirementSpec），不再 Ask。
   */
  private async runRequirementsMaybe(opts: AgentCoordinatorOptions,
    onProgress: ProgressCallback | undefined): Promise<'ok' | 'clarify' | 'abort' | 'skipped'> {
    if (opts.skipLlm) {
      Logger.warn(INSTR_TRACE_TAG,
        '[AI_AGENT] skipLlm in Coordinator — acceptance path only');
      if (opts.clarificationAnswers && opts.clarificationAnswers.length > 0) {
        this.applyClarificationToSpec(opts);
      }
      return 'ok';
    }

    const hasAnswers = (opts.clarificationAnswers?.length ?? 0) > 0;
    const canSkipReq = this.blackboard.canSkip('requirements') && !hasAnswers &&
      (this.blackboard.userPrompt === opts.prompt ||
        opts.prompt.indexOf(this.blackboard.userPrompt) >= 0);

    if (canSkipReq) {
      Logger.info(INSTR_TRACE_TAG, '[AI_AGENT] skip requirements (snapshot)');
      this.enrichPrompt(opts, this.blackboard.requirementSpec);
      return 'skipped';
    }

    onProgress?.(makeProgress(3, '需求理解'));
    const cancelFn = (): boolean => this.orchestrator.isCancelRequested();
    let lastReq: RequirementsAgentResult | null = null;
    const limit = CritiqueLimits.requirements;
    for (let attempt = 0; attempt < limit; attempt++) {
      if (cancelFn()) {
        this.blackboard.abort('requirements', 'cancelled');
        return 'abort';
      }
      Logger.info(INSTR_TRACE_TAG,
        `[AI_AGENT] stage=requirements attempt=${attempt} runId=${this.blackboard.runId}`);
      const req = await this.requirementsAgent.run(this.blackboard, cancelFn);
      lastReq = req;
      if (req.ok && req.needsClarification) {
        this.blackboard.markStageDone('requirements');
        this.lastSnapshot = this.blackboard.toSnapshot();
        Logger.info(INSTR_TRACE_TAG,
          `[AI_AGENT] needsClarification n=${req.questions.length} snapshot saved`);
        return 'clarify';
      }
      if (req.ok && !req.needsClarification) {
        this.blackboard.markStageDone('requirements');
        this.enrichPrompt(opts, req.spec);
        this.lastSnapshot = this.blackboard.toSnapshot();
        return 'ok';
      }
      this.blackboard.lastRequirementsError = req.error ?? '需求理解失败';
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_AGENT] requirements retry ${attempt + 1}/${limit} | ${req.error}`);
    }
    this.blackboard.abort('requirements',
      lastReq?.error ?? (this.blackboard.lastRequirementsError || '需求理解失败'));
    this.lastSnapshot = this.blackboard.toSnapshot();
    return 'abort';
  }

  private prepareRun(runId: string, opts: AgentCoordinatorOptions): void {
    if (opts.resumeSnapshot) {
      this.blackboard.resumeFromSnapshot(opts.resumeSnapshot);
      this.blackboard.runId = runId;
      if (opts.clarificationAnswers && opts.clarificationAnswers.length > 0) {
        this.blackboard.clarificationAnswers = opts.clarificationAnswers.slice();
      }
      if (opts.prompt && opts.prompt.length > 0) {
        this.blackboard.userPrompt = opts.prompt;
      }
      Logger.info(INSTR_TRACE_TAG,
        `[AI_AGENT] resume snapshot stage=${this.blackboard.stageCompleted}`);
    } else {
      this.blackboard.reset(runId, opts.prompt, opts.clarificationAnswers);
    }
    if (opts.enableReasoning) {
      this.orchestrator.setEnableReasoning(true);
    } else if (opts.enableReasoning === false) {
      this.orchestrator.setEnableReasoning(false);
    }
  }

  private async afterPipe(opts: AgentCoordinatorOptions, result: AiPipelineResult,
    hard: boolean, onProgress?: ProgressCallback): Promise<AiPipelineResult> {
    if (!result.topology || (result.topology.deviceList?.length ?? 0) === 0) {
      this.lastSnapshot = this.blackboard.toSnapshot();
      if (result.agentAbortStage) {
        result.requirementSpec = this.blackboard.requirementSpec;
        return result;
      }
      // Orchestrator abort 若未带 agentAbortStage，优先保留 ercErrors 真因，勿统一改写「空拓扑」
      const errDesc = (result.ercErrors && result.ercErrors.length > 0) ?
        (result.ercErrors[0].desc ?? '') : '';
      if (errDesc.length > 0) {
        result.agentAbortStage = result.ercErrors![0].errType || 'qa';
        result.agentAbortReason = errDesc;
        result.requirementSpec = this.blackboard.requirementSpec;
        return result;
      }
      return this.abortResult('qa', '空拓扑，禁止交付',
        result.usedLlm || this.blackboard.usedLlm);
    }

    const cancelFn = (): boolean => this.orchestrator.isCancelRequested();
    // Orchestrator 已 WAR → 跳过双跑；否则补 WAR
    if (!opts.skipLlm && !result.warDone) {
      onProgress?.(makeProgress(88, 'WAR 布线'));
      this.routeAgent.begin(this.blackboard);
      const war = await this.routeAgent.ensureWar(result.topology, cancelFn);
      this.routeAgent.end(this.blackboard, war.ok, war.reason);
      this.blackboard.markStageDone('route');
      if (!war.ok && hard) {
        this.lastSnapshot = this.blackboard.toSnapshot();
        return this.abortResult('route', war.reason, result.usedLlm || this.blackboard.usedLlm);
      }
    } else if (result.warDone) {
      Logger.info(INSTR_TRACE_TAG, '[AI_AGENT] skip duplicate WAR (warDone=true)');
      this.blackboard.markStageDone('route');
    }

    result.requirementSpec = this.blackboard.requirementSpec;
    result.usedLlm = result.usedLlm || this.blackboard.usedLlm;
    this.blackboard.topology = result.topology;

    onProgress?.(makeProgress(96, '终检 QA'));
    this.qaAgent.begin(this.blackboard);
    const qa = await this.qaAgent.gate(this.blackboard, result, hard, cancelFn);
    if (qa.ok && !qa.abort) {
      this.blackboard.markStageDone('qa');
    }
    this.lastSnapshot = this.blackboard.toSnapshot();
    if (qa.abort) {
      return qa.result;
    }
    // 交付时带残留标记：不阻断，让上层做软接受决策
    if (qa.result.deliveredWithResidual || !qa.result.ercClean) {
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_AGENT] QA residual warn ercClean=${qa.result.ercClean}` +
        ` deliveredWithResidual=${!!qa.result.deliveredWithResidual}`);
      return qa.result;
    }
    Logger.info(INSTR_TRACE_TAG,
      `[AI_AGENT] END usedLlm=${qa.result.usedLlm} clean=${qa.result.ercClean}`);
    return qa.result;
  }

  private toPipeOpts(opts: AgentCoordinatorOptions, hard: boolean): PipelineOptions {
    let salt = '';
    const answers = opts.clarificationAnswers;
    if (answers && answers.length > 0) {
      const parts: string[] = [];
      for (let i = 0; i < answers.length; i++) {
        const a = answers[i];
        parts.push(`${a.questionId}:${a.choice ?? ''}:${a.freeText ?? ''}`);
      }
      salt = parts.join('|');
    }
    return {
      prompt: opts.prompt,
      scene: opts.scene,
      partialTopo: opts.partialTopo,
      lockedDeviceUuids: opts.lockedDeviceUuids,
      mcuFamily: opts.mcuFamily,
      skipLlm: opts.skipLlm,
      routingWeights: opts.routingWeights,
      onStreamSnapshot: opts.onStreamSnapshot,
      conversationHistory: opts.conversationHistory,
      generationMode: opts.generationMode,
      generateStrategy: opts.generateStrategy,
      qualityHardFail: hard,
      enableReasoning: opts.enableReasoning,
      cacheSalt: salt
    };
  }

  private enrichPrompt(opts: AgentCoordinatorOptions, spec: RequirementSpec): void {
    if (spec.summary.length === 0) {
      return;
    }
    const rails = spec.power.rails.map(r => r.toUpperCase());
    const hasVee = rails.indexOf('VEE') >= 0;
    const single = !hasVee && (rails.indexOf('VCC') >= 0 || rails.indexOf('GND') >= 0);
    const supplyContract = single
      ? `\n【硬·电源契约】单电源${spec.power.voltageHint ? `(${spec.power.voltageHint})` : ''}：只允许 VCC+GND，禁止 VEE`
      : (hasVee
        ? `\n【硬·电源契约】双电源${spec.power.voltageHint ? `(${spec.power.voltageHint})` : ''}：必须含 VEE`
        : '');
    opts.prompt = `${opts.prompt}\n\n【已确认需求摘要】${spec.summary}` +
      `\n模块:${spec.modules.join(',')}` +
      `\n电源:${spec.power.rails.join('/')}` +
      (spec.power.voltageHint ? `(${spec.power.voltageHint})` : '') +
      `\n仪器:${spec.instruments.join(',')}` +
      `\n约束:${spec.constraints.join(';')}` +
      supplyContract;
  }

  private clarifyResult(): AiPipelineResult {
    const out: AiPipelineResult = {
      topology: emptySchTopology(),
      usedLlm: true,
      degradedMode: false,
      ercClean: false,
      geoBlocking: 0,
      needsClarification: true,
      clarificationQuestions: this.blackboard.clarificationQuestions,
      requirementSpec: this.blackboard.requirementSpec
    };
    return out;
  }

  private abortResult(stage: string, reason: string, usedLlm: boolean): AiPipelineResult {
    Logger.error(INSTR_TRACE_TAG, `[AI_AGENT] ABORT ${stage} | ${reason}`);
    this.blackboard.abort(stage, reason);
    this.lastSnapshot = this.blackboard.toSnapshot();
    const out: AiPipelineResult = {
      topology: emptySchTopology(),
      usedLlm: usedLlm,
      degradedMode: false,
      ercClean: false,
      geoBlocking: 0,
      agentAbortStage: stage,
      agentAbortReason: reason,
      requirementSpec: this.blackboard.requirementSpec,
      ercErrors: [{
        errType: stage,
        targetUuid: '',
        desc: reason,
        suggest: '检查 API 或调整需求后重试',
        severity: 'error'
      }]
    };
    return out;
  }

  private applyClarificationToSpec(opts: AgentCoordinatorOptions): void {
    const spec: RequirementSpec = emptyRequirementSpec();
    spec.summary = opts.prompt;
    const answers = opts.clarificationAnswers ?? [];
    for (let i = 0; i < answers.length; i++) {
      const a = answers[i];
      const text = (a.freeText && a.freeText.trim().length > 0)
        ? a.freeText.trim()
        : (a.choice ? `choice=${a.choice}` : '');
      if (text.length > 0) {
        spec.constraints.push(`${a.questionId}:${text}`);
      }
    }
    const gated = RequirementsAgent.enforceAnswersOnSpec(
      spec, answers, this.blackboard.clarificationQuestions);
    this.blackboard.requirementSpec = gated.ok ? gated.spec : spec;
  }
}
