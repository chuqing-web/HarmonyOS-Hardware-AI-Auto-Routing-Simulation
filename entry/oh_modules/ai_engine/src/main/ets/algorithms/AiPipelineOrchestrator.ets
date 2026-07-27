/**
 * AI 选型 → 摆放 → 语义建网 → 布线 → ERC 全闭环编排器
 * v3.0: 仪器拓扑错误自动修复、netLabel 完整性保障、全自主仪器布线
 */
import { IAiApiManager, ChatOptions } from 'ai_api_manager';
import { IComponentLibrary } from 'component_library';
import {
  SchTopology, AiPipelineResult, DeviceSelectLlmOutput, LayoutLlmOutput,
  RoutingLlmOutput, AiCapability, ProgressCallback, makeProgress,
  IdUtil, DiagError, ErcSeverity, TopologyAdapter, MatchedDevice, RoutingWeightPrefs,
  ErcError, makeDeviceInst, stringMap1, Point2D, DeviceInst,
  LayoutPositionItem, PlacementResult, PlacementCandidate, DevicePosition,
  EventBus, ModuleEvent, ModuleEventPayload,
  Logger, INSTR_TRACE_TAG, traceAiPayload, traceAiOp, traceAiDiag, traceAiStage,
  traceAiWireInventory, AiErcGateUtil,
  DeviceHitGeometry, emptySchTopology, mapAwareStringify, mapAwareParse, ensureStringMap,
  MainThreadYield, DeviceRequirement, ErrCode, DeviceSelectResult, RouteResult, emptyStringMap,
  RouteLine
} from 'common';
import { PromptLoader } from '../prompts/PromptLoader';
import { PromptVarEntry, ChatHistoryEntry, EditPlanMove } from '../internal/AiEngineTypes';
import { DeviceSelectEngine } from './DeviceSelectEngine';
import { PlacementOptimizer } from './PlacementOptimizer';
import { ConstrainedWiringEngine } from './ConstrainedWiringEngine';
import { WarRouteAdapter } from './WarRouteAdapter';
import { QA_FIX_ROUNDS } from './agents/StageHooks';
import { ModularModuleAgent } from './agents/ModularModuleAgent';
import { FaultDiagnoser } from './FaultDiagnoser';
import { LlmJsonNormalizer } from './LlmJsonNormalizer';
import { NetPlanExecutor, NetPlanResult, NetPlanExecutionResult } from './NetPlanExecutor';
import { SemanticNetBuilder } from './SemanticNetBuilder';
import { PostGenValidator, ValidationIssue } from './PostGenValidator';
import { AiTopologyFixKit, FinalizeGateOpts, TopologyFixResult } from './AiTopologyFixKit';
import {
  canonicalizeFixAction, fixActionPriorityOf, findFixActionDef,
  auditFixActionRegistryCoverage
} from './FixActionRegistry';
import {
  CircuitIntent, CritiqueSplit, classifyCircuitIntent, refineCircuitIntent,
  refineIntentFromTopo, formatIntentLog, hardResidualFingerprint,
  splitEmpty, allCritiqueLines, intentIsMutualLedSwitch,
  defaultCircuitIntent, parseSignalAmplitudeVolts,
  isOpAmpSelfOscillatorPrompt, intentIsOpAmpSelfOscillator, applySelfOscSignalGenGuard,
  HYSTERESIS_MIN_SIGNAL_AMP_V, HYSTERESIS_RECOMMENDED_SIGNAL_AMP
} from './CircuitIntent';
import {
  ModularPlan, normalizeModularPlan, healModularPlan, critiqueModularPlan,
  buildModuleSubPrompt, mergeModularTopologies, alignTopoRefsToBoundaryPins,
  buildModularStreamPreview, normalizeBoundaryKey
} from './ModularParallelMerge';
import {
  FRAG_555_ASTABLE, FRAG_NET_555_ASTABLE, FRAG_555_MONOSTABLE, FRAG_NET_555_MONOSTABLE
} from '../prompts/templates/IntentPromptFragments';
import {
  assembleEditDeviceInstrumentFragments, countDevInstrCatalog
} from '../prompts/templates/DeviceInstrumentFragments';

export interface PipelineOptions {
  prompt: string;
  scene?: 'text_gen' | 'partial_assist';
  partialTopo?: SchTopology;
  lockedDeviceUuids?: string[];
  mcuFamily?: string;
  /** 仅验收/离线单测显式开启；生产整图生成不得依赖此路径 */
  skipLlm?: boolean;
  routingWeights?: RoutingWeightPrefs;
  /** 流式画布回调：每完成一个视觉阶段（摆放/建网/布线）即触发，用于逐帧渲染 */
  onStreamSnapshot?: (topo: SchTopology, stage: string) => void;
  /** 多轮对话历史，用于 LLM 上下文继承 */
  conversationHistory?: ChatHistoryEntry[];
  /** 生成模式: create=从零创建, edit=基于现有电路修改 */
  generationMode?: 'create' | 'edit';
  /** oneshot 走 runFullPipeline；modular 走 runModularParallelPipeline */
  generateStrategy?: 'oneshot' | 'modular';
  /** 预置电路意图（可选；缺省则 classifyCircuitIntent） */
  circuitIntent?: CircuitIntent;
  /**
   * 模块并行子流水线：本模块 boundaryPins（如 OSC1.CH1）。
   * 用于 ERC 门禁放行边界单脚标号网、安全删除未用电源符号。
   */
  modularBoundaryPins?: string[];
  /** Phase1 质量总线：生产硬失败（禁 layout/route 降级与残留交付） */
  qualityHardFail?: boolean;
  /** Phase2：开启推理/思考链（chat 时 disableThinking=false） */
  enableReasoning?: boolean;
  /** 澄清答案盐：参与 LLM cache key，防澄清后 stale */
  cacheSalt?: string;
}

interface AiDiagnoseFixResult {
  topo: SchTopology;
  fixes: number;
  diag: DiagError[];
}

/** runErcGeoClearLoop 返回值 — ArkTS 禁止匿名对象类型 */
interface ErcGeoClearResult {
  topo: SchTopology;
  ercErrors: ErcError[];
  geoIssues: ValidationIssue[];
  ercHard: number;
  geoHard: number;
  aiFixApplied: number;
  usedLlm: boolean;
}

export interface LlmFetchResult<T> {
  output: T;
  fromLlm: boolean;
}

interface CacheEntry {
  value: object;
  timestamp: number;
}

interface ChatResult {
  success: boolean;
  data?: string;
  error?: string;
  errCode?: number;
}

interface EarlyStopStableResult {
  accept: boolean;
  lastFp: string;
  stableCount: number;
}

interface AiFixDetail {
  libDevId?: string;
  refName?: string;
  x?: number;
  y?: number;
  /** nudge_device 相对位移 */
  dx?: number;
  dy?: number;
  /** rotate_device 目标角度 0/90/180/270；省略则 +90 */
  rotate?: number;
  paramKey?: string;
  paramValue?: string;
  reason?: string;
  /** reconnect_pin / demote_to_label / rewire_net */
  netName?: string;
  pinId?: string;
  /** 可选：从某网移出 */
  fromNet?: string;
  toNet?: string;
}

interface AiReviewIssue {
  type: string;
  severity: 'error' | 'warning';
  desc: string;
  targetDevice?: string;
  fixAction: string;
  fixDetail?: AiFixDetail;
}

interface AiSelfReviewResult {
  passed: boolean;
  issues: AiReviewIssue[];
  summary: string;
}

interface AiFixExecResult {
  fixCount: number;
  needReroute: boolean;
  /** 本轮是否执行了拓扑级 kit（RC/RELAY），需在 clear-loop 后保留 needReroute */
  needTopoKit: boolean;
}

interface AiFixExecState {
  fixCount: number;
  needReroute: boolean;
  needTopoKit: boolean;
}

interface DeviceIndexPair {
  d: DeviceInst;
  i: number;
}

interface SolePinInfo {
  pinKey: string;
  libDevId: string;
}

interface DegradedEventData {
  message: string;
}

/** 编辑模式注入 prompt 的器件摘要（避免匿名对象字面量） */
interface PartialTopoPromptItem {
  ref: string;
  id: string;
  x: number;
  y: number;
  rot: number;
}

interface EditCtxDevice {
  instUuid: string;
  ref: string;
  id: string;
  x: number;
  y: number;
  rot: number;
  params: Record<string, string>;
}

interface EditCtxNet {
  name: string;
  power: boolean;
  pins: string[];
}

interface EditCtxStats {
  devices: number;
  nets: number;
  wires: number;
  labels: number;
}

interface EditCtxRoot {
  devices: EditCtxDevice[];
  nets: EditCtxNet[];
  labels: string[];
  wireSummary: string;
  stats: EditCtxStats;
}

interface EditPlanParsed {
  keepAllDevices: boolean;
  addRequireList: DeviceRequirement[];
  removeRefs: string[];
  moves: EditPlanMove[];
  netMode: string;
  netPlan: NetPlanResult;
  removeNetNames: string[];
}

interface EditApplyStat {
  added: number;
  removed: number;
  moved: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const LLM_MAX_RETRIES = 2;
/** 关键阶段（选型/建网）critique 内轮；达上限后 ACCEPT 残差继续（永不 ABORT） */
const CRITIQUE_INNER_ROUNDS = 3;
const LAYOUT_INNER_ROUNDS = 3;
/** 选型/建网 outer；与 CritiqueLimits(=3) 对齐，禁止 8×3 叠加 */
const CRITICAL_OUTER = 3;
const SOFT_OUTER = 3;
const NEVER_ABORT_OUTER = CRITICAL_OUTER;
const NEVER_ABORT_ROUNDS = CRITIQUE_INNER_ROUNDS;
/** ERC+几何清零轮次；确定性优先后通常 1–2 轮即可 */
const ERC_CLEAR_MAX_ROUNDS = 8;
/** 门禁前强力收尾：多策略轮换直至 ERC+几何清零 */
const FORCE_COMPLETE_MAX_ASSAULTS = 6;
const LLM_BASE_BACKOFF_MS = 1000;
const LLM_MAX_OUTPUT_TOKENS = 65536;
/** layout/route/self_review 输出上限（提速） */
const LLM_SOFT_OUTPUT_TOKENS = 12288;
const QUALITY_MIN_FILL_RATE = 0.6;

function abortPipelineResult(errType: string, desc: string, suggest: string,
  usedLlm: boolean = false): AiPipelineResult {
  // 仅用户取消应走 cancelPipelineResult；其余终端失败记 STAGE_FAIL（禁止 STAGE_ABORT）
  Logger.error(INSTR_TRACE_TAG,
    `[AI_PIPE] STAGE_FAIL ${errType} | ${desc}`);
  traceAiStage('AI_PIPE', errType, 'FAIL', desc);
  // agentAbortStage 必须带上，避免 Coordinator 见空拓扑后改写成「空拓扑，禁止交付」掩盖真因
  return {
    topology: emptySchTopology(),
    usedLlm,
    degradedMode: false,
    ercClean: false,
    agentAbortStage: errType,
    agentAbortReason: desc,
    ercErrors: [{
      errType,
      targetUuid: '',
      desc,
      suggest,
      severity: 'error'
    }],
    geoBlocking: 0
  };
}


/** Phase2：create 路径跨阶段共享状态（独立 await） */
export class CreatePipelineCtx {
  usedLlm: boolean = false;
  degradedMode: boolean = false;
  selectLlm: LlmFetchResult<DeviceSelectLlmOutput> | null = null;
  selectResult: DeviceSelectResult | null = null;
  layoutLlm: LlmFetchResult<LayoutLlmOutput> | null = null;
  placement: PlacementResult | null = null;
  netPlanResult: LlmFetchResult<NetPlanResult> | null = null;
  topoWithNets: SchTopology | null = null;
  netPlanNotes: string = '';
  routeResult: RouteResult | null = null;
  abort: AiPipelineResult | null = null;
  /** 本阶段已 WAR，避免 Coordinator 双跑 */
  warDone: boolean = false;
}

export class AiPipelineOrchestrator {
  private apiManager: IAiApiManager;
  private componentLibrary: IComponentLibrary;
  private selectEngine: DeviceSelectEngine;
  private placementOptimizer: PlacementOptimizer = new PlacementOptimizer();
  private wiringEngine: ConstrainedWiringEngine = new ConstrainedWiringEngine();
  private warAdapter: WarRouteAdapter = new WarRouteAdapter();
  private postGenValidator: PostGenValidator | null = null;
  private constraintCache: Map<string, CacheEntry> = new Map();
  private activeIntent: CircuitIntent = defaultCircuitIntent();
  /** 当前流水线阶段（异常日志用） */
  private diagStage: string = 'idle';
  /** 模块并行子实例标签（如 M1）；空=主流水线 */
  private moduleTag: string = '';
  /** 模块并行有界并发，避免 N 路全开打爆内存与主线程 */
  private readonly MODULAR_CONCURRENCY: number = 2;
  /** 最近一次布线约束（含 forceLabel），供 clear-loop 重布复用 */
  private lastRoutingConstraints: RoutingLlmOutput | null = null;
  /** 最近一次 net_plan 路径点，供 clear-loop / 违规重布复用 */
  private lastNetWaypoints: Map<string, Point2D[]> | null = null;
  /** Phase2 推理开关：true 时 chat 不关 thinking */
  private enableReasoningFlag: boolean = false;
  /** 当前 STAGE 计时起点 */
  private stageT0: number = 0;
  /** 当前 STAGE 名（与 diagStage 同步） */
  private stageName: string = 'idle';
  /** 用户取消：各阶段与 chatWithRetry 轮询 */
  private cancelled: boolean = false;

  constructor(apiManager: IAiApiManager, library: IComponentLibrary, moduleTag: string = '') {
    this.apiManager = apiManager;
    this.componentLibrary = library;
    this.moduleTag = moduleTag;
    this.selectEngine = new DeviceSelectEngine(library);
    this.wiringEngine.setComponentLibrary(library);
    this.warAdapter.setComponentLibrary(library);
    this.placementOptimizer.setComponentLibrary(library);
    this.postGenValidator = new PostGenValidator(library);
    AiTopologyFixKit.setComponentLibrary(library);
  }

  private getPostGen(): PostGenValidator {
    if (!this.postGenValidator) {
      this.postGenValidator = new PostGenValidator(this.componentLibrary);
    }
    this.postGenValidator.setCircuitIntent(this.activeIntent);
    return this.postGenValidator;
  }

  /**
   * 模块并行：派生隔离子编排器。
   * 共享 apiManager / 器件库（只读+HTTP 可并发）；独立 intent / wiring / placement / select / cache。
   */
  forkForModule(moduleId: string): AiPipelineOrchestrator {
    return new AiPipelineOrchestrator(this.apiManager, this.componentLibrary, moduleId);
  }

  getDiagStage(): string {
    return this.diagStage;
  }

  requestCancel(): void {
    this.cancelled = true;
    Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] ${this.logTag()}CANCEL requested`);
  }

  clearCancel(): void {
    this.cancelled = false;
  }

  isCancelRequested(): boolean {
    return this.cancelled || this.apiManager.isChatCancelled();
  }

  private cancelPipelineResult(): AiPipelineResult {
    return abortPipelineResult('cancelled', '用户已取消生成', '可重新发起生成');
  }

  private logTag(): string {
    return this.moduleTag.length > 0 ? `[${this.moduleTag}] ` : '';
  }

  private markStage(stage: string): void {
    this.diagStage = stage;
    this.stageName = stage;
    this.stageT0 = Date.now();
    Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] ${this.logTag()}STAGE ${stage}`);
    traceAiStage('AI_PIPE', stage, 'BEGIN', this.logTag().trim());
  }

  /** 结束当前阶段并打 STAGE_END（含耗时与关键指标） */
  private endStage(ok: boolean, detail: string = ''): void {
    const ms = Date.now() - this.stageT0;
    const d = `ok=${ok} ms=${ms}${detail.length > 0 ? ` ${detail}` : ''}`;
    traceAiStage('AI_PIPE', this.stageName.length > 0 ? this.stageName : this.diagStage,
      'END', `${this.logTag()}${d}`);
  }

  /** 阶段内关键指标（BOM 数量、网名、阻断项等） */
  private stageMetric(key: string, detail: string): void {
    traceAiStage('AI_PIPE', this.stageName.length > 0 ? this.stageName : this.diagStage,
      'METRIC', `${this.logTag()}${key}=${detail}`);
  }

  /** 阶段中止 / 外层重试 — 生产路径禁止 ABORT，统一降为 RETRY */
  private stageAbortOrRetry(phase: 'ABORT' | 'RETRY', detail: string): void {
    const p: 'ABORT' | 'RETRY' = phase === 'ABORT' ? 'RETRY' : phase;
    if (phase === 'ABORT') {
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] NEVER_ABORT demote ABORT→RETRY | ${detail}`);
    }
    traceAiStage('AI_PIPE', this.stageName.length > 0 ? this.stageName : this.diagStage,
      p, `${this.logTag()}${detail}`);
  }

  /** 扫描拓扑中可能触发 toUpperCase 崩溃的空字段 + 样本摘要 */
  private logTopoFieldDiag(stage: string, topo: SchTopology): void {
    const bad: string[] = [];
    for (let i = 0; i < topo.deviceList.length; i++) {
      const d = topo.deviceList[i];
      if (d.libDevId === undefined || d.libDevId === null || `${d.libDevId}`.length === 0) {
        bad.push(`dev[${i}] ref=${d.refName ?? '?'} libDevId=EMPTY`);
      }
      if (d.refName === undefined || d.refName === null) {
        bad.push(`dev[${i}] lib=${d.libDevId ?? '?'} refName=undefined`);
      }
    }
    for (let i = 0; i < topo.netList.length; i++) {
      const n = topo.netList[i];
      if (n.netName === undefined || n.netName === null) {
        bad.push(`net[${i}] uuid=${n.netUuid ?? '?'} netName=undefined`);
      }
      const nodes = n.nodeList ?? [];
      for (let j = 0; j < nodes.length; j++) {
        const p = nodes[j];
        if (p === undefined || p === null) {
          bad.push(`net[${i}].node[${j}]=null`);
          continue;
        }
        if (p.pinId === undefined || p.pinId === null) {
          bad.push(`net[${i}](${n.netName}).node[${j}] pinId=undefined`);
        }
      }
    }
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] ${this.logTag()}topo_diag ${stage} devices=${topo.deviceList.length}` +
      ` nets=${topo.netList.length} wires=${topo.wireList.length}` +
      ` labels=${topo.netLabelList?.length ?? 0} badFields=${bad.length}`);
    if (bad.length > 0) {
      traceAiDiag('AI_PIPE', `topo_bad_${stage}`, bad, 24);
    }
    // 样本：便于排错时对照位号/网名
    const devSample = topo.deviceList.slice(0, 12)
      .map(d => `${d.refName}:${d.libDevId}@(${Math.round(d.x)},${Math.round(d.y)})`);
    const netSample = topo.netList.slice(0, 12)
      .map(n => `${n.netName}#${n.nodeList?.length ?? 0}`);
    if (devSample.length > 0) {
      traceAiDiag('AI_PIPE', `topo_devs_${stage}`, devSample, 12);
    }
    if (netSample.length > 0) {
      traceAiDiag('AI_PIPE', `topo_nets_${stage}`, netSample, 12);
    }
    this.stageMetric('topo',
      `devices=${topo.deviceList.length} nets=${topo.netList.length}` +
      ` wires=${topo.wireList.length} labels=${topo.netLabelList?.length ?? 0}` +
      ` bad=${bad.length}`);
  }

  async runFullPipeline(opts: PipelineOptions, onProgress?: ProgressCallback): Promise<AiPipelineResult> {
    let usedLlm = false;
    let degradedMode = false;
    // 子模块 fork 后继承父级取消态；oneshot 在 AiEngine.runAiTask 已 clear
    if (this.isCancelRequested()) {
      return this.cancelPipelineResult();
    }

    // 真正增量 edit：读全图后局部修改，禁止整图重选型/重摆/清空重布
    if (opts.generationMode === 'edit' &&
      opts.partialTopo && opts.partialTopo.deviceList.length > 0) {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] edit incremental branch | devices=${opts.partialTopo.deviceList.length}` +
        ` nets=${opts.partialTopo.netList.length} wires=${opts.partialTopo.wireList.length}`);
      return await this.runEditIncrementalPipeline(opts, onProgress);
    }

    if (opts.enableReasoning !== undefined) {
      this.setEnableReasoning(!!opts.enableReasoning);
    }

    this.markStage('intent');
    this.activeIntent = opts.circuitIntent ?? classifyCircuitIntent(opts.prompt);
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] intent | ${formatIntentLog(this.activeIntent)}`);
    this.stageMetric('intent', formatIntentLog(this.activeIntent));
    this.endStage(true, formatIntentLog(this.activeIntent));

    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] START promptLen=${opts.prompt.length} skipLlm=${!!opts.skipLlm}` +
      ` scene=${opts.scene ?? 'text_gen'} mcu=${opts.mcuFamily ?? 'auto'}` +
      ` module=${this.moduleTag || 'oneshot'}`);
    traceAiPayload('AI_PIPE', 'USER', opts.prompt,
      `scene=${opts.scene ?? 'text_gen'} skipLlm=${!!opts.skipLlm}`);
    traceAiOp('AI_PIPE', 'pipeline_start',
      `scene=${opts.scene ?? 'text_gen'} mcu=${opts.mcuFamily ?? 'auto'} module=${this.moduleTag || 'oneshot'}`);
    traceAiStage('AI_PIPE', 'pipeline', 'BEGIN',
      `${this.logTag()}promptLen=${opts.prompt.length} skipLlm=${!!opts.skipLlm}`);

    const ctx = new CreatePipelineCtx();
    ctx.usedLlm = usedLlm;
    ctx.degradedMode = degradedMode;
    if (!(await this.runSelectStage(opts, onProgress, ctx))) {
      return ctx.abort ?? abortPipelineResult('device_select', '选型阶段中止', '重试', ctx.usedLlm);
    }
    usedLlm = ctx.usedLlm;
    degradedMode = ctx.degradedMode;
    if (!(await this.runLayoutStage(opts, onProgress, ctx))) {
      return ctx.abort ?? abortPipelineResult('layout', '布局阶段中止', '重试', ctx.usedLlm);
    }
    usedLlm = ctx.usedLlm;
    degradedMode = ctx.degradedMode;
    if (!(await this.runNetStage(opts, onProgress, ctx))) {
      return ctx.abort ?? abortPipelineResult('net_plan', '建网阶段中止', '重试', ctx.usedLlm);
    }
    usedLlm = ctx.usedLlm;
    degradedMode = ctx.degradedMode;
    return await this.runRouteQaStage(opts, onProgress, ctx);
  }


  /**
   * Phase2：选型阶段（可独立 await）
   * @returns false 且 ctx.abort 已设 → 中止
   */
  async runSelectStage(opts: PipelineOptions, onProgress: ProgressCallback | undefined,
    ctx: CreatePipelineCtx): Promise<boolean> {
        // Agent 路径直接调本阶段，须先分类意图，否则 seriesRc 等 HARD 门禁失效
        this.activeIntent = opts.circuitIntent ?? classifyCircuitIntent(opts.prompt);
        Logger.info(INSTR_TRACE_TAG,
          `[AI_PIPE] intent(select) | ${formatIntentLog(this.activeIntent)}`);
        onProgress?.(makeProgress(5, '解析器件需求(LLM)'));
        this.markStage('device_select');
        traceAiOp('AI_PIPE', 'device_select', 'fetch LLM JSON');
        ctx.selectLlm = await this.fetchDeviceSelectLlm(opts);
        if (this.isCancelRequested()) {
          ctx.abort = this.cancelPipelineResult();
          return false;
        }
        for (let outer = 0; !ctx.selectLlm.fromLlm && !opts.skipLlm && outer < NEVER_ABORT_OUTER; outer++) {
          if (this.isCancelRequested()) {
            ctx.abort = this.cancelPipelineResult();
          return false;
          }
          this.stageAbortOrRetry('RETRY', `outer=${outer + 1}/${NEVER_ABORT_OUTER}`);
          Logger.warn(INSTR_TRACE_TAG,
            `[AI_PIPE] KEEP_RETRY device_select outer=${outer + 1}/${NEVER_ABORT_OUTER}`);
          onProgress?.(makeProgress(5, `器件选型重试 ${outer + 1}`));
          ctx.selectLlm = await this.fetchDeviceSelectLlm(opts);
        }
        if (this.isCancelRequested()) {
          ctx.abort = this.cancelPipelineResult();
          return false;
        }
        if (ctx.selectLlm.fromLlm) {
          ctx.usedLlm = true;
          Logger.info(INSTR_TRACE_TAG, '[AI_PIPE] device_select from LLM');
          const reqN0 = ctx.selectLlm.output.deviceRequireList?.length ?? 0;
          this.stageMetric('bom',
            `fromLlm=true requireN=${reqN0} ood=${(ctx.selectLlm.output.oodFlags ?? []).length}`);
          try {
            traceAiPayload('AI_PIPE', 'SELECT_JSON', mapAwareStringify(ctx.selectLlm.output),
              'stage=device_select');
          } catch (_e) {
            Logger.warn(INSTR_TRACE_TAG,
              `[AI_PIPE] SELECT_JSON stringify failed: ${_e instanceof Error ? _e.message : String(_e)}`);
          }
          this.endStage(true, `requireN=${reqN0}`);
        } else if (!opts.skipLlm) {
          // NEVER_ABORT：再外层强刷；仍失败则 STAGE_FAIL（非 ABORT），禁止模板
          for (let hard = 0; !ctx.selectLlm.fromLlm && hard < NEVER_ABORT_OUTER; hard++) {
            if (this.isCancelRequested()) {
              ctx.abort = this.cancelPipelineResult();
          return false;
            }
            this.stageAbortOrRetry('RETRY', `device_select hard=${hard + 1}`);
            Logger.warn(INSTR_TRACE_TAG,
              `[AI_PIPE] KEEP_RETRY device_select hard outer=${hard + 1}/${NEVER_ABORT_OUTER}`);
            onProgress?.(makeProgress(10, `选型强刷 ${hard + 1}`));
            ctx.selectLlm = await this.fetchDeviceSelectLlm(opts);
          }
          if (ctx.selectLlm.fromLlm) {
            ctx.usedLlm = true;
            const reqN0 = ctx.selectLlm.output.deviceRequireList?.length ?? 0;
            Logger.info(INSTR_TRACE_TAG,
              `[AI_PIPE] device_select recovered after hard retry requireN=${reqN0}`);
            this.endStage(true, `requireN=${reqN0} hard_retry`);
          } else {
            this.stageAbortOrRetry('RETRY', 'LLM unavailable after hard retry');
            this.endStage(false, 'LLM unavailable');
            Logger.error(INSTR_TRACE_TAG,
              '[AI_PIPE] STAGE_FAIL: device_select LLM unavailable — refuse local/template (no ABORT)');
            ctx.abort = abortPipelineResult('device_select',
              '器件选型 LLM 不可用，已拒绝本地/模板回退',
              '检查 AI API 配置、模型与连通性测试',
              ctx.usedLlm);
          return false;
          }
        } else {
          ctx.degradedMode = true;
          this.endStage(true, 'skipLlm local');
          Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] device_select local (skipLlm)');
          this.notifyDegraded('器件选型');
        }
    
        onProgress?.(makeProgress(20, '本地器件库匹配'));
        this.markStage('library_match');
        traceAiOp('AI_PIPE', 'library_match', 'matchFromLlmOutput');
        ctx.selectResult = this.selectEngine.matchFromLlmOutput(ctx.selectLlm.output, opts.prompt,
          !(opts.qualityHardFail && !opts.skipLlm));
        for (let outer = 0; ctx.selectResult.devices.length === 0 && !opts.skipLlm && outer < NEVER_ABORT_OUTER; outer++) {
          Logger.warn(INSTR_TRACE_TAG,
            `[AI_PIPE] KEEP_RETRY zero matches → re-select outer=${outer + 1}/${NEVER_ABORT_OUTER}`);
          onProgress?.(makeProgress(20, `库匹配为空，重选 ${outer + 1}`));
          ctx.selectLlm = await this.fetchDeviceSelectLlm(opts);
          if (ctx.selectLlm.fromLlm) {
            ctx.usedLlm = true;
          }
          ctx.selectResult = this.selectEngine.matchFromLlmOutput(ctx.selectLlm.output, opts.prompt,
          !(opts.qualityHardFail && !opts.skipLlm));
        }
        if (ctx.selectResult.devices.length === 0 && !opts.skipLlm) {
          this.stageAbortOrRetry('RETRY', 'zero library matches — hard re-select');
          for (let hard = 0; ctx.selectResult.devices.length === 0 && hard < NEVER_ABORT_OUTER; hard++) {
            if (this.isCancelRequested()) {
              ctx.abort = this.cancelPipelineResult();
          return false;
            }
            Logger.warn(INSTR_TRACE_TAG,
              `[AI_PIPE] KEEP_RETRY zero matches hard=${hard + 1}/${NEVER_ABORT_OUTER}`);
            onProgress?.(makeProgress(20, `库匹配强刷 ${hard + 1}`));
            ctx.selectLlm = await this.fetchDeviceSelectLlm(opts);
            if (ctx.selectLlm.fromLlm) {
              ctx.usedLlm = true;
            }
            ctx.selectResult = this.selectEngine.matchFromLlmOutput(ctx.selectLlm.output, opts.prompt,
          !(opts.qualityHardFail && !opts.skipLlm));
          }
          if (ctx.selectResult.devices.length === 0) {
            this.endStage(false, 'matched=0');
            Logger.error(INSTR_TRACE_TAG,
              '[AI_PIPE] STAGE_FAIL: zero library matches (no ABORT)');
            ctx.abort = abortPipelineResult('library_match',
              '器件库匹配为空，已拒绝空图/模板回退',
              '检查选型 JSON 的 explicitModel 是否为库内 libDevId',
              ctx.usedLlm);
          return false;
          }
          Logger.warn(INSTR_TRACE_TAG,
            `[AI_PIPE] KEEP_RETRY zero matches recovered n=${ctx.selectResult.devices.length}`);
        }
        if (ctx.selectLlm.output.oodFlags && ctx.selectLlm.output.oodFlags.length > 0) {
          Logger.warn(INSTR_TRACE_TAG,
            `[AI_PIPE] OOD notes (non-fatal): ${ctx.selectLlm.output.oodFlags.join(',')}`);
          this.stageMetric('ood', ctx.selectLlm.output.oodFlags.slice(0, 8).join(','));
        }
        const matchHint = ctx.selectResult.devices
          .slice(0, 8)
          .map(d => `${d.libDevId}/${d.matchLevel}`)
          .join(', ');
        Logger.info(INSTR_TRACE_TAG,
          `[AI_PIPE] matched ${ctx.selectResult.devices.length}: ${matchHint}`);
        traceAiOp('AI_PIPE', 'library_match_done',
          `count=${ctx.selectResult.devices.length} ${matchHint}`);
        this.stageMetric('matched', `${ctx.selectResult.devices.length} ${matchHint}`);
    
        // 部分 BOM：qualityHardFail → ABORT；否则 degraded 继续
        const requireN = ctx.selectLlm.output.deviceRequireList?.length ?? 0;
        const matchedReq = ctx.selectResult.matchedRequireCount ?? 0;
        if (!opts.skipLlm && requireN > 0 && matchedReq < requireN) {
          const missFlags = (ctx.selectLlm.output.oodFlags ?? []).slice(0, 6).join(',') ||
            `matchedRequire=${matchedReq}/${requireN}`;
          if (opts.qualityHardFail) {
            Logger.error(INSTR_TRACE_TAG,
              `[AI_PIPE] ABORT partial BOM require=${requireN} matchedRequire=${matchedReq}`);
            this.endStage(false, `ABORT partial BOM ${matchedReq}/${requireN}`);
            ctx.abort = abortPipelineResult('select',
              `选型未完整匹配 ${matchedReq}/${requireN}`,
              '补充库内器件或简化需求后重试', ctx.usedLlm);
            return false;
          }
          ctx.degradedMode = true;
          this.stageAbortOrRetry('RETRY',
            `partial BOM accept require=${requireN} matchedRequire=${matchedReq}`);
          Logger.warn(INSTR_TRACE_TAG,
            `[AI_PIPE] KEEP_RETRY ACCEPT partial BOM require=${requireN}` +
            ` matchedRequire=${matchedReq} devices=${ctx.selectResult.devices.length} flags=${missFlags}`);
          this.stageMetric('partial_bom', missFlags);
        }
        this.endStage(true, `matchedRequire=${matchedReq}/${requireN} devices=${ctx.selectResult.devices.length}`);
        onProgress?.(makeProgress(28, `匹配 ${ctx.selectResult.devices.length}: ${matchHint}`));
        if (this.isCancelRequested()) {
          ctx.abort = this.cancelPipelineResult();
          return false;
        }
    
        this.activeIntent = refineCircuitIntent(opts.prompt, ctx.selectLlm.output, ctx.selectResult.devices);
        Logger.info(INSTR_TRACE_TAG,
          `[AI_PIPE] intent refined | ${formatIntentLog(this.activeIntent)}`);
        // 精修后只补空电参（LLM 已写值不覆盖；错配靠选型 HARD 重试）
        const elecN = this.selectEngine.applyElectricalSourceParams(
          ctx.selectResult.devices, this.activeIntent);
        if (elecN > 0) {
          Logger.info(INSTR_TRACE_TAG,
            `[AI_PIPE] electrical fill-empty n=${elecN} ` +
            `vcc=${this.activeIntent.preferredVccVoltage || '-'} ` +
            `vee=${this.activeIntent.preferredVeeVoltage || '-'} ` +
            `amp=${this.activeIntent.preferredSignalAmplitude || '-'}`);
        }
    return true;
  }

  /**
   * Phase2：布局+摆放阶段（可独立 await）
   */
  async runLayoutStage(opts: PipelineOptions, onProgress: ProgressCallback | undefined,
    ctx: CreatePipelineCtx): Promise<boolean> {
        if (!ctx.selectResult || !ctx.selectLlm) {
          ctx.abort = abortPipelineResult('layout', '布局前缺少选型结果', '重试选型', ctx.usedLlm);
          return false;
        }
        onProgress?.(makeProgress(35, '获取布局约束'));
        this.markStage('layout');
        traceAiOp('AI_PIPE', 'layout_constraints', 'fetch LLM or default');
        ctx.layoutLlm = await this.fetchLayoutLlm(ctx.selectResult.devices, ctx.selectLlm.output.circuitConstraint, opts);
        if (this.isCancelRequested()) {
          ctx.abort = this.cancelPipelineResult();
          return false;
        }
        for (let outer = 0;
          (!ctx.layoutLlm.fromLlm || !(ctx.layoutLlm.output.positions && ctx.layoutLlm.output.positions.length > 0)) &&
          !opts.skipLlm && ctx.selectResult.devices.length > 0 && outer < SOFT_OUTER; outer++) {
          Logger.warn(INSTR_TRACE_TAG,
            `[AI_PIPE] KEEP_RETRY layout outer=${outer + 1}/${SOFT_OUTER}`);
          onProgress?.(makeProgress(35, `布局重试 ${outer + 1}`));
          ctx.layoutLlm = await this.fetchLayoutLlm(ctx.selectResult.devices, ctx.selectLlm.output.circuitConstraint, opts);
        }
        if (ctx.layoutLlm.fromLlm) {
          ctx.usedLlm = true;
          Logger.info(INSTR_TRACE_TAG, '[AI_PIPE] layout constraints from LLM');
          this.stageMetric('positions',
            `${ctx.layoutLlm.output.positions?.length ?? 0}`);
          try {
            traceAiPayload('AI_PIPE', 'LAYOUT_JSON', JSON.stringify(ctx.layoutLlm.output),
              'stage=layout');
          } catch (_e) {
            Logger.warn(INSTR_TRACE_TAG,
              `[AI_PIPE] LAYOUT_JSON stringify failed: ${_e instanceof Error ? _e.message : String(_e)}`);
          }
          this.endStage(true, `positions=${ctx.layoutLlm.output.positions?.length ?? 0}`);
        } else if (!opts.skipLlm) {
          if (opts.qualityHardFail) {
            Logger.error(INSTR_TRACE_TAG, '[AI_PIPE] ABORT layout LLM unavailable (qualityHardFail)');
            this.endStage(false, 'ABORT no layout LLM');
            ctx.abort = abortPipelineResult('layout',
              '布局约束 LLM 不可用或无效，质量硬失败中止',
              '检查 API 配置后重试', ctx.usedLlm);
          return false;
          }
          Logger.warn(INSTR_TRACE_TAG,
            '[AI_PIPE] layout weak — GA/default (degraded, ctx.usedLlm 不伪造)');
          ctx.degradedMode = true;
          this.stageMetric('degraded', 'layout weak');
          this.endStage(false, 'degraded GA/default');
          this.notifyDegraded('布局约束');
        } else {
          ctx.degradedMode = true;
          Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] layout constraints local (skipLlm)');
          this.endStage(true, 'skipLlm');
          this.notifyDegraded('布局约束');
        }
    
        // AI 坐标布局；qualityHardFail 下无坐标 → ABORT（禁 GA 兜底）
        const aiPositions = ctx.layoutLlm.output.positions;
        this.markStage('placement');
        if (aiPositions && aiPositions.length > 0) {
          onProgress?.(makeProgress(50, 'AI 坐标布局'));
          traceAiOp('AI_PIPE', 'placement', 'AI position-driven');
          ctx.placement = this.applyAiPositions(ctx.selectResult.devices, aiPositions,
            opts.lockedDeviceUuids ?? [], opts.partialTopo);
          this.placementOptimizer.resolveSelectionOverlaps(ctx.placement.topology);
          Logger.info(INSTR_TRACE_TAG,
            `[AI_PIPE] placement AI-driven: ${aiPositions.length} positions (hit-overlap resolved)`);
        } else if (opts.qualityHardFail && !opts.skipLlm) {
          Logger.error(INSTR_TRACE_TAG,
            '[AI_PIPE] ABORT placement — no LLM positions (qualityHardFail)');
          this.endStage(false, 'ABORT no positions');
          ctx.abort = abortPipelineResult('layout',
            '布局 LLM 未给出有效坐标，质量硬失败中止',
            '检查 API 或简化器件数后重试', ctx.usedLlm);
          return false;
        } else {
          onProgress?.(makeProgress(50, '坐标缺失→确定性摆放继续'));
          traceAiOp('AI_PIPE', 'placement', 'GA/default continue');
          ctx.placement = await this.placementOptimizer.optimizeAsync(
            ctx.selectResult.devices,
            ctx.layoutLlm.output,
            opts.lockedDeviceUuids ?? [],
            opts.partialTopo
          );
          this.placementOptimizer.resolveSelectionOverlaps(ctx.placement.topology);
          Logger.warn(INSTR_TRACE_TAG,
            `[AI_PIPE] KEEP_RETRY placement without LLM positions — placed=${ctx.placement.topology.deviceList.length}`);
        }
        // 同行器件交错：为 WAR 链式布线留垂直通道，修复 TL082 挡路导致 3 脚网死锁
        this.placementOptimizer.staggerRowDevices(ctx.placement.topology);
        const overlapLeft = this.placementOptimizer.countSelectionOverlaps(ctx.placement.topology);
        if (overlapLeft > 0 && opts.qualityHardFail && !opts.skipLlm) {
          Logger.error(INSTR_TRACE_TAG,
            `[AI_PIPE] ABORT placement residual overlap=${overlapLeft}`);
          this.endStage(false, `ABORT overlap=${overlapLeft}`);
          ctx.abort = abortPipelineResult('layout',
            `摆放仍有 ${overlapLeft} 处重叠`,
            '调整布局约束或减少器件后重试', ctx.usedLlm);
          return false;
        }
        if (overlapLeft > 0) {
          ctx.degradedMode = true;
          Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] placement residual overlap=${overlapLeft}`);
        }
        const placeHint = ctx.placement.topology.deviceList
          .slice(0, 10)
          .map(d => `${d.refName || d.libDevId}@(${Math.round(d.x)},${Math.round(d.y)})`)
          .join(', ');
        Logger.info(INSTR_TRACE_TAG,
          `[AI_PIPE] placement devices=${ctx.placement.topology.deviceList.length}`);
        traceAiOp('AI_PIPE', 'placement_done',
          `devices=${ctx.placement.topology.deviceList.length} ${placeHint}`);
        this.stageMetric('placed', placeHint);
        this.endStage(true, `devices=${ctx.placement.topology.deviceList.length}`);
        this.logTopoFieldDiag('placement', ctx.placement.topology);
        if (this.isCancelRequested()) {
          ctx.abort = this.cancelPipelineResult();
          return false;
        }
    
        // 流式快照 #1: 器件已摆放，尚无网络/导线
        opts.onStreamSnapshot?.(ctx.placement.topology, 'placement');
    
        // LLM 网络拓扑：KEEP_RETRY，永不因 critique 主动 ABORT
    return true;
  }

  /**
   * Phase2：建网阶段（可独立 await）
   */
  async runNetStage(opts: PipelineOptions, onProgress: ProgressCallback | undefined,
    ctx: CreatePipelineCtx): Promise<boolean> {
        if (!ctx.placement) {
          ctx.abort = abortPipelineResult('net_plan', '建网前缺少摆放结果', '重试布局', ctx.usedLlm);
          return false;
        }
        onProgress?.(makeProgress(62, 'LLM 网络拓扑规划'));
        this.markStage('net_plan');
        traceAiOp('AI_PIPE', 'net_plan', 'LLM net_plan + NetPlanExecutor');
        ctx.netPlanResult = await this.fetchNetPlanLlm(ctx.placement.topology, opts);
        if (this.isCancelRequested()) {
          ctx.abort = this.cancelPipelineResult();
          return false;
        }
        for (let outer = 0; !ctx.netPlanResult.fromLlm && !opts.skipLlm && outer < NEVER_ABORT_OUTER; outer++) {
          if (this.isCancelRequested()) {
            ctx.abort = this.cancelPipelineResult();
          return false;
          }
          Logger.warn(INSTR_TRACE_TAG,
            `[AI_PIPE] KEEP_RETRY net_plan outer=${outer + 1}/${NEVER_ABORT_OUTER}`);
          onProgress?.(makeProgress(62, `网络规划重试 ${outer + 1}`));
          ctx.netPlanResult = await this.fetchNetPlanLlm(ctx.placement.topology, opts);
        }
        ctx.netPlanNotes = '';
        if (ctx.netPlanResult.fromLlm) {
          ctx.usedLlm = true;
          NetPlanExecutor.sanitizeDuplicatePins(ctx.netPlanResult.output, ctx.placement.topology);
          const execResult = this.executeNetPlanLabelFirst(ctx.placement.topology, ctx.netPlanResult.output);
          ctx.topoWithNets = execResult.topology;
          ctx.netPlanNotes = execResult.notes;
          Logger.info(INSTR_TRACE_TAG,
            `[AI_PIPE] LLM netPlan: ${execResult.netCount}网/${execResult.labelCount}标号` +
            `/${execResult.stubWireCount}stubs failures=${execResult.failures.length}`);
          this.stageMetric('exec',
            `nets=${execResult.netCount} labels=${execResult.labelCount}` +
            ` stubs=${execResult.stubWireCount} failures=${execResult.failures.length}`);
          const wpN = (ctx.netPlanResult.output.nets ?? [])
            .filter(n => (n.routeWaypoints?.length ?? 0) > 0).length;
          this.stageMetric('waypoints', `netsWithWp=${wpN}`);
          traceAiOp('AI_PIPE', 'net_plan_done',
            `nets=${execResult.netCount} labels=${execResult.labelCount}` +
            ` stubs=${execResult.stubWireCount} failures=${execResult.failures.length} wpNets=${wpN}`);
          if (execResult.failures.length > 0) {
            Logger.warn(INSTR_TRACE_TAG,
              `[AI_PIPE] KEEP_RETRY netPlan exec failures: ${execResult.failures.join('; ')}`);
            traceAiDiag('AI_PIPE', 'net_plan_exec_fail', execResult.failures.slice(0, 12), 12);
            this.stageMetric('exec_fail', execResult.failures.slice(0, 4).join(' | '));
            // NEVER_ABORT：清洗后重执行；qualityHardFail 下残留仍失败则 ABORT
            if (!opts.skipLlm) {
              NetPlanExecutor.sanitizeUnknownDeviceRefs(ctx.netPlanResult.output, ctx.placement.topology);
              NetPlanExecutor.sanitizeDuplicatePins(ctx.netPlanResult.output, ctx.placement.topology);
              NetPlanExecutor.healOpAmpFloatingInputsInPlan(ctx.netPlanResult.output, ctx.placement.topology);
              const retryExec = this.executeNetPlanLabelFirst(ctx.placement.topology, ctx.netPlanResult.output);
              if (retryExec.netCount >= execResult.netCount) {
                ctx.topoWithNets = retryExec.topology;
                ctx.netPlanNotes = retryExec.notes;
              } else if (retryExec.netCount > 0) {
                ctx.topoWithNets = retryExec.topology;
                ctx.netPlanNotes = retryExec.notes;
              }
              if (retryExec.failures.length > 0 || execResult.failures.length > 0) {
                ctx.degradedMode = true;
              }
              if (opts.qualityHardFail && retryExec.failures.length > 0) {
                Logger.error(INSTR_TRACE_TAG,
                  `[AI_PIPE] ABORT net_plan exec failures=${retryExec.failures.length}`);
                this.endStage(false, 'ABORT net exec');
                ctx.abort = abortPipelineResult('net_plan',
                  `建网执行失败: ${retryExec.failures.slice(0, 3).join('; ')}`,
                  '检查器件脚名与网络计划后重试', ctx.usedLlm);
                return false;
              }
              this.stageAbortOrRetry('RETRY',
                `exec accept nets=${retryExec.netCount} failLeft=${retryExec.failures.length}`);
              Logger.warn(INSTR_TRACE_TAG,
                `[AI_PIPE] KEEP_RETRY ACCEPT net_plan exec nets=${retryExec.netCount}` +
                ` failLeft=${retryExec.failures.length}`);
              if (retryExec.failures.length > 0) {
                this.stageMetric('exec_accept_residual',
                  retryExec.failures.slice(0, 4).join(' | '));
              }
            }
          }
          this.endStage(true,
            `nets=${execResult.netCount} stubs=${execResult.stubWireCount} wpNets=${wpN}`);
        } else if (opts.skipLlm) {
          traceAiOp('AI_PIPE', 'net_plan_fallback', 'SemanticNetBuilder (skipLlm only)');
          const clone = mapAwareParse<SchTopology>(mapAwareStringify(ctx.placement.topology));
          clone.netList = [];
          clone.netLabelList = [];
          clone.wireList = [];
          try {
            const semResult = new SemanticNetBuilder(this.componentLibrary).build(clone);
            ctx.topoWithNets = semResult.topology;
            ctx.netPlanNotes = `SemanticNetBuilder(skipLlm): ${semResult.summary}`;
            Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] net_plan skipLlm: ${ctx.netPlanNotes}`);
            if ((ctx.topoWithNets.netList?.length ?? 0) === 0) {
              ctx.abort = abortPipelineResult('net_plan',
                'skipLlm SemanticNetBuilder 产出空网', '检查验收拓扑', ctx.usedLlm);
              return false;
            }
          } catch (_e) {
            ctx.topoWithNets = clone;
            ctx.degradedMode = true;
            ctx.netPlanNotes = 'skipLlm SemanticNetBuilder failed';
            Logger.error(INSTR_TRACE_TAG,
              `[AI_PIPE] SemanticNetBuilder skipLlm failed: ${_e instanceof Error ? _e.message : String(_e)}`);
            ctx.abort = abortPipelineResult('net_plan', ctx.netPlanNotes, '检查验收拓扑', ctx.usedLlm);
            return false;
          }
        } else {
          // qualityHardFail：空网 ABORT；否则 CONTINUE degraded
          for (let hard = 0; !ctx.netPlanResult.fromLlm && hard < NEVER_ABORT_OUTER; hard++) {
            if (this.isCancelRequested()) {
              ctx.abort = this.cancelPipelineResult();
              return false;
            }
            this.stageAbortOrRetry('RETRY', `net_plan hard=${hard + 1}`);
            Logger.warn(INSTR_TRACE_TAG,
              `[AI_PIPE] KEEP_RETRY net_plan hard outer=${hard + 1}/${NEVER_ABORT_OUTER}`);
            onProgress?.(makeProgress(62, `网络规划强刷 ${hard + 1}`));
            ctx.netPlanResult = await this.fetchNetPlanLlm(ctx.placement.topology, opts);
          }
          if (ctx.netPlanResult.fromLlm) {
            ctx.usedLlm = true;
            NetPlanExecutor.sanitizeUnknownDeviceRefs(ctx.netPlanResult.output, ctx.placement.topology);
            NetPlanExecutor.sanitizeDuplicatePins(ctx.netPlanResult.output, ctx.placement.topology);
            NetPlanExecutor.healOpAmpFloatingInputsInPlan(ctx.netPlanResult.output, ctx.placement.topology);
            const execHard = this.executeNetPlanLabelFirst(ctx.placement.topology, ctx.netPlanResult.output);
            ctx.topoWithNets = execHard.topology;
            ctx.netPlanNotes = execHard.notes;
            if (execHard.failures.length > 0) {
              ctx.degradedMode = true;
            }
            Logger.warn(INSTR_TRACE_TAG,
              `[AI_PIPE] KEEP_RETRY net_plan recovered nets=${execHard.netCount}`);
            this.endStage(true, `nets=${execHard.netCount} hard_retry`);
          } else if (opts.qualityHardFail) {
            Logger.error(INSTR_TRACE_TAG, '[AI_PIPE] ABORT empty net_plan (qualityHardFail)');
            this.endStage(false, 'ABORT empty net_plan');
            ctx.abort = abortPipelineResult('net_plan',
              '网络计划 LLM 不可用或为空，质量硬失败中止',
              '检查 API 配置后重试', ctx.usedLlm);
            return false;
          } else {
            ctx.degradedMode = true;
            ctx.topoWithNets = mapAwareParse<SchTopology>(mapAwareStringify(ctx.placement.topology));
            ctx.topoWithNets.netList = ctx.topoWithNets.netList ?? [];
            ctx.topoWithNets.netLabelList = ctx.topoWithNets.netLabelList ?? [];
            ctx.topoWithNets.wireList = ctx.topoWithNets.wireList ?? [];
            ctx.netPlanNotes = 'net_plan empty — CONTINUE with ctx.placement';
            this.stageAbortOrRetry('RETRY', 'net_plan empty CONTINUE');
            this.endStage(true, 'empty CONTINUE');
            Logger.warn(INSTR_TRACE_TAG,
              '[AI_PIPE] KEEP_RETRY ACCEPT empty net_plan — continue ctx.placement topology');
            this.notifyDegraded('网络规划');
          }
        }
        // hardFail：空网不得进布线
        if (opts.qualityHardFail && !opts.skipLlm &&
          (ctx.topoWithNets?.netList?.length ?? 0) === 0) {
          Logger.error(INSTR_TRACE_TAG, '[AI_PIPE] ABORT empty nets after net_plan');
          ctx.abort = abortPipelineResult('net_plan', '建网结果为空网',
            '检查器件与网络计划后重试', ctx.usedLlm);
          return false;
        }
        onProgress?.(makeProgress(70, ctx.netPlanNotes));
    
        // 流式快照 #2: 网络/标号/stub导线已创建，布线尚未开始
        opts.onStreamSnapshot?.(ctx.topoWithNets, 'net_plan');
        this.logTopoFieldDiag('net_plan', ctx.topoWithNets);
    
    return true;
  }

  /**
   * Phase2：布线+ERC+门禁（可独立 await）
   */
  async runRouteQaStage(opts: PipelineOptions, onProgress: ProgressCallback | undefined,
    ctx: CreatePipelineCtx): Promise<AiPipelineResult> {
        if (!ctx.topoWithNets || !ctx.placement || !ctx.selectResult || !ctx.netPlanResult) {
          return abortPipelineResult('routing', '布线前缺少建网/摆放结果', '重试流水线', ctx.usedLlm);
        }
        onProgress?.(makeProgress(75, '获取布线约束'));
        this.markStage('routing');
        // 提速：net_plan 已带 wiringHints 时跳过 route LLM，用默认约束+hints（拓扑正确性仍由 net_plan 保证）
        const npHints = ctx.netPlanResult.fromLlm ? ctx.netPlanResult.output.wiringHints : undefined;
        const hintN = (npHints?.forceLabel?.length ?? 0) + (npHints?.forceWire?.length ?? 0);
        let routeLlm: LlmFetchResult<RoutingLlmOutput>;
        if (!opts.skipLlm && ctx.netPlanResult.fromLlm && hintN > 0) {
          routeLlm = {
            output: ConstrainedWiringEngine.defaultConstraints(ctx.topoWithNets),
            fromLlm: false
          };
          this.mergeNetPlanHintsIntoRouting(routeLlm.output, ctx.netPlanResult);
          this.sanitizeRoutingForceModes(routeLlm.output, ctx.topoWithNets);
          Logger.info(INSTR_TRACE_TAG,
            `[AI_PIPE] SPEED skip route LLM — use net_plan wiringHints n=${hintN}`);
          this.stageMetric('speed', `skip_route_llm hints=${hintN}`);
          this.endStage(true, `skip_route_llm hints=${hintN}`);
        } else {
          traceAiOp('AI_PIPE', 'routing_constraints', 'fetch LLM or default');
          routeLlm = await this.fetchRoutingLlm(ctx.topoWithNets, opts, ctx.netPlanResult);
          for (let outer = 0; !routeLlm.fromLlm && !opts.skipLlm && outer < SOFT_OUTER; outer++) {
            Logger.warn(INSTR_TRACE_TAG,
              `[AI_PIPE] KEEP_RETRY routing outer=${outer + 1}/${SOFT_OUTER}`);
            onProgress?.(makeProgress(75, `布线约束重试 ${outer + 1}`));
            routeLlm = await this.fetchRoutingLlm(ctx.topoWithNets, opts, ctx.netPlanResult);
          }
          this.mergeNetPlanHintsIntoRouting(routeLlm.output, ctx.netPlanResult);
        }
        this.lastRoutingConstraints = routeLlm.output;
        if (routeLlm.fromLlm) {
          ctx.usedLlm = true;
          Logger.info(INSTR_TRACE_TAG, '[AI_PIPE] routing constraints from LLM');
          this.stageMetric('forceLabel',
            `[${(routeLlm.output.forceLabelNets ?? []).slice(0, 12).join(',')}]`);
          this.stageMetric('forceWire',
            `[${(routeLlm.output.forceWireNets ?? []).slice(0, 12).join(',')}]`);
          try {
            traceAiPayload('AI_PIPE', 'ROUTE_JSON', JSON.stringify(routeLlm.output),
              'stage=route');
          } catch (_e) {
            Logger.warn(INSTR_TRACE_TAG,
              `[AI_PIPE] ROUTE_JSON stringify failed: ${_e instanceof Error ? _e.message : String(_e)}`);
          }
          this.endStage(true,
            `forceLabel=${routeLlm.output.forceLabelNets?.length ?? 0}` +
            ` forceWire=${routeLlm.output.forceWireNets?.length ?? 0}`);
        } else if (!(ctx.netPlanResult.fromLlm && hintN > 0)) {
          const hasModes = ((routeLlm.output?.forceLabelNets?.length ?? 0) > 0) ||
            ((routeLlm.output?.forceWireNets?.length ?? 0) > 0);
          if (!hasModes) {
            if (opts.qualityHardFail && !opts.skipLlm) {
              Logger.error(INSTR_TRACE_TAG,
                '[AI_PIPE] ABORT routing LLM unavailable (qualityHardFail)');
              this.endStage(false, 'ABORT no route LLM');
              return abortPipelineResult('routing',
                '布线约束 LLM 不可用，质量硬失败中止',
                '检查 API 配置后重试', ctx.usedLlm);
            }
            Logger.warn(INSTR_TRACE_TAG,
              '[AI_PIPE] routing use defaultConstraints (degraded, ctx.usedLlm 不伪造)');
            routeLlm = {
              output: ConstrainedWiringEngine.defaultConstraints(ctx.topoWithNets),
              fromLlm: false
            };
            this.mergeNetPlanHintsIntoRouting(routeLlm.output, ctx.netPlanResult);
          } else {
            Logger.warn(INSTR_TRACE_TAG,
              '[AI_PIPE] routing residual/degraded keep sanitized constraints (degraded)');
          }
          this.lastRoutingConstraints = routeLlm.output;
          ctx.degradedMode = true;
          this.endStage(false, 'degraded defaultConstraints');
          this.notifyDegraded('布线约束');
        }
    
        onProgress?.(makeProgress(85, opts.qualityHardFail ? 'WAR 真脚补线' : '真脚补线 A*'));
        this.markStage('astar');
        const netWaypoints = new Map<string, Point2D[]>();
        if (ctx.netPlanResult.fromLlm && ctx.netPlanResult.output.nets) {
          for (const net of ctx.netPlanResult.output.nets) {
            if (net.routeWaypoints && net.routeWaypoints.length > 0) {
              const flat: Point2D[] = [];
              for (const seg of net.routeWaypoints) {
                for (const wp of seg) {
                  flat.push(wp);
                }
              }
              if (flat.length > 0) {
                netWaypoints.set(net.name, flat);
              }
            }
          }
        }
        this.lastNetWaypoints = netWaypoints.size > 0 ? netWaypoints : null;
        if (netWaypoints.size > 0) {
          Logger.info(INSTR_TRACE_TAG,
            `[AI_PIPE] netWaypoints nets=${netWaypoints.size} ` +
            `[${Array.from(netWaypoints.keys()).slice(0, 8).join(',')}]`);
        }
        const astarT0 = Date.now();
        if (opts.qualityHardFail && !opts.skipLlm) {
          traceAiOp('AI_PIPE', 'war_route', 'WarRouteAdapter / WireAutoRouter');
          // 先清非 stub 长线，再 WAR 重布
          const keptWires = WarRouteAdapter.stripNonStubWires(ctx.topoWithNets.wireList);
          ctx.topoWithNets.wireList = keptWires;
          const war = await this.warAdapter.routeTopology(ctx.topoWithNets, true,
            () => this.isCancelRequested());
          if (!war.ok) {
            Logger.error(INSTR_TRACE_TAG, `[AI_PIPE] ABORT WAR | ${war.reason}`);
            this.endStage(false, war.reason);
            return abortPipelineResult('war_route', war.reason,
              '调整摆放间距后重试', ctx.usedLlm);
          }
          if (war.demotedNets && war.demotedNets.length > 0) {
            Logger.warn(INSTR_TRACE_TAG,
              `[AI_PIPE] WAR salvage → joinByLabel demoted=` +
              `[${war.demotedNets.slice(0, 8).join(',')}]`);
          }
          ctx.warDone = true;
          ctx.routeResult = {
            routeLines: ctx.topoWithNets.wireList,
            crossCount: 0,
            totalLineLength: 0,
            isolateAnalogDigital: false,
            xtalShortPath: false,
            diffLineEqualLength: false
          };
          Logger.info(INSTR_TRACE_TAG,
            `[AI_AGENT] route via WAR wires=${ctx.topoWithNets.wireList.length}` +
            ` routedNets=${war.routedNets} demoted=${war.demotedNets?.length ?? 0}` +
            ` ms=${Date.now() - astarT0}`);
          this.endStage(true, `WAR wires=${ctx.topoWithNets.wireList.length}` +
            (war.demotedNets && war.demotedNets.length > 0
              ? ` demoted=${war.demotedNets.length}` : ''));
          traceAiOp('AI_PIPE', 'war_route_done',
            `wires=${ctx.topoWithNets.wireList.length} ms=${Date.now() - astarT0}` +
            ` demoted=${war.demotedNets?.length ?? 0}`);
        } else if (!opts.skipLlm) {
          // 生产非 skipLlm：禁止 A* 主路径，强制 WAR
          Logger.warn(INSTR_TRACE_TAG,
            '[AI_PIPE] force WAR (production path, no A*)');
          const keptWires = WarRouteAdapter.stripNonStubWires(ctx.topoWithNets.wireList);
          ctx.topoWithNets.wireList = keptWires;
          const war = await this.warAdapter.routeTopology(ctx.topoWithNets, true,
            () => this.isCancelRequested());
          if (!war.ok) {
            Logger.error(INSTR_TRACE_TAG, `[AI_PIPE] ABORT WAR | ${war.reason}`);
            return abortPipelineResult('war_route', war.reason,
              '调整摆放间距后重试', ctx.usedLlm);
          }
          if (war.demotedNets && war.demotedNets.length > 0) {
            Logger.warn(INSTR_TRACE_TAG,
              `[AI_PIPE] WAR salvage → joinByLabel demoted=` +
              `[${war.demotedNets.slice(0, 8).join(',')}]`);
          }
          ctx.warDone = true;
          ctx.routeResult = {
            routeLines: ctx.topoWithNets.wireList,
            crossCount: 0,
            totalLineLength: 0,
            isolateAnalogDigital: false,
            xtalShortPath: false,
            diffLineEqualLength: false
          };
          this.endStage(true, `WAR wires=${ctx.topoWithNets.wireList.length}`);
        } else {
          traceAiOp('AI_PIPE', 'astar_route', 'ConstrainedWiringEngine.routeAsync (skipLlm only)');
          ctx.routeResult = await this.wiringEngine.routeUntilCleanAsync(ctx.topoWithNets, routeLlm.output,
            opts.routingWeights, netWaypoints, 3);
          ctx.topoWithNets.wireList = ctx.routeResult.routeLines;
          Logger.info(INSTR_TRACE_TAG,
            `[AI_PIPE] routed wires=${ctx.topoWithNets.wireList.length}` +
            ` ms=${Date.now() - astarT0} (async A*, no template fallback)`);
          this.stageMetric('wires', `${ctx.topoWithNets.wireList.length}`);
          this.stageMetric('waypoints_used', `${netWaypoints.size}`);
          this.endStage(true,
            `wires=${ctx.topoWithNets.wireList.length} wpNets=${netWaypoints.size} ms=${Date.now() - astarT0}`);
          traceAiOp('AI_PIPE', 'astar_route_done',
            `wires=${ctx.topoWithNets.wireList.length} nets=${ctx.topoWithNets.netList.length}` +
            ` ms=${Date.now() - astarT0}`);
        }
    
        // 流式快照 #3: 布线完成，完整拓扑
        opts.onStreamSnapshot?.(ctx.topoWithNets, 'routing');
        this.logTopoFieldDiag('routing', ctx.topoWithNets);
    
        // ─── ERC 静态校验 + pin/stub 连通审计 ───
        onProgress?.(makeProgress(90, 'ERC 静态校验'));
        this.markStage('erc');
        traceAiOp('AI_PIPE', 'erc', 'FaultDiagnoser / collectErc');
        let ercErrors = this.collectErc(ctx.topoWithNets);
        const pinConnIssues = this.auditNetPinConnectivity(ctx.topoWithNets);
        if (pinConnIssues.length > 0) {
          for (let pi = 0; pi < pinConnIssues.length; pi++) {
            ercErrors.push(pinConnIssues[pi]);
          }
          Logger.warn(INSTR_TRACE_TAG,
            `[AI_PIPE] pin_connectivity issues=${pinConnIssues.length}`);
          traceAiDiag('AI_PIPE', 'pin_connectivity',
            pinConnIssues.map(e => e.desc), 8);
        }
        ctx.topoWithNets.ercErrorList = ercErrors;
        // 模块并行子图：先清孤立电源，再按边界脚软化 ERC 门禁
        if (this.isModularChildOpts(opts)) {
          const pruned = this.pruneOrphanPowerSymbols(ctx.topoWithNets);
          if (pruned > 0) {
            Logger.info(INSTR_TRACE_TAG,
              `[AI_PIPE] modular heal pruned ${pruned} orphan VCC/GND before ERC`);
            ercErrors = this.collectErc(ctx.topoWithNets);
            const pinAgain = this.auditNetPinConnectivity(ctx.topoWithNets);
            for (let pi = 0; pi < pinAgain.length; pi++) {
              ercErrors.push(pinAgain[pi]);
            }
            ctx.topoWithNets.ercErrorList = ercErrors;
          }
        }
        let ercHard = this.countPipelineBlocking(ercErrors, opts, ctx.topoWithNets);
        const ercWarnN = ercErrors.filter(e => e.severity === 'warning').length;
        Logger.info(INSTR_TRACE_TAG,
          `[AI_PIPE] ERC blocking=${ercHard} warnings=${ercWarnN} total=${ercErrors.length}`);
        this.stageMetric('blocking', `${ercHard}`);
        this.stageMetric('warnings', `${ercWarnN}`);
        if (ercHard > 0) {
          const hardList = this.filterPipelineBlocking(ercErrors, opts, ctx.topoWithNets);
          traceAiDiag('AI_PIPE', 'erc_block',
            hardList.slice(0, 12).map(e => `${e.severity}/${e.errType}: ${(e.desc ?? '').substring(0, 100)}`),
            12);
        }
        this.endStage(ercHard === 0, `blocking=${ercHard} total=${ercErrors.length}`);
        traceAiOp('AI_PIPE', 'erc_done',
          `total=${ercErrors.length} blocking=${ercHard} warnings=${ercWarnN}`);
    
        // ─── 几何碰撞检测 (函数: 确定性几何计算) ───
        onProgress?.(makeProgress(92, '几何碰撞检测'));
        let geoIssues = this.collectGeometricIssues(ctx.topoWithNets);
        const congestionIssues = this.collectCongestionIssues(ctx.topoWithNets);
        for (const ci of congestionIssues) {
          geoIssues.push(ci);
        }
        if (geoIssues.length > 0) {
          Logger.info(INSTR_TRACE_TAG,
            `[AI_PIPE] geometric issues: ${geoIssues.map(i => i.type).join(',')}` +
            ` blocking=${this.countGeoBlocking(geoIssues)}`);
          const geoDiag: string[] = [];
          for (let gi = 0; gi < geoIssues.length && geoDiag.length < 12; gi++) {
            const g = geoIssues[gi];
            geoDiag.push(`${g.severity}/${g.type}: ${(g.desc ?? '').substring(0, 120)}`);
          }
          traceAiDiag('AI_PIPE', 'geo_issues', geoDiag, 12);
        } else {
          Logger.info(INSTR_TRACE_TAG, '[AI_PIPE] geometric issues: (none)');
        }
    
        // ─── AI 自检 + 修复闭环（oneshot / 模块合并共用）───
        this.markStage('self_review_clear');
        this.stageMetric('pre_clear',
          `ercBlocking=${ercHard} geoBlocking=${this.countGeoBlocking(geoIssues)}`);
        const cleared = await this.runErcGeoClearLoop(ctx.topoWithNets, ercErrors, geoIssues, opts,
          onProgress, ctx.usedLlm, 93);
        ctx.topoWithNets = cleared.topo;
        ercErrors = cleared.ercErrors;
        ctx.usedLlm = cleared.usedLlm;
        const aiFixApplied = cleared.aiFixApplied;
        const ercHardFinal = cleared.ercHard;
        const geoHard = cleared.geoHard;
        const finalGeoIssues = cleared.geoIssues;
        const finalErcWarns = ercErrors.filter(e => e.severity === 'warning').length;
        const ercClean = ercHardFinal === 0 && geoHard === 0;
        // selfReviewPassed 不再伪装成 ercClean；无独立 review 结果时与 ercClean 同值但日志区分
        const selfReviewPassed = ercClean;
        const fixDesc = ercClean
          ? (aiFixApplied > 0 ? `门禁通过 · AI修复${aiFixApplied}处` : '门禁通过(ERC+几何)')
          : `强力收尾后残留 ERC${ercHardFinal}/几何${geoHard} · 仍交付可用图`;
        this.stageMetric('post_clear',
          `ercBlocking=${ercHardFinal} geoBlocking=${geoHard} aiFixes=${aiFixApplied}`);
        this.endStage(true,
          `ercClean=${ercClean} fixes=${aiFixApplied} geo=${geoHard}`);
    
        onProgress?.(makeProgress(98, fixDesc));
        this.markStage('gate');
        if (!ercClean) {
          const hardList = this.filterPipelineBlocking(ercErrors, opts, ctx.topoWithNets);
          const hardDesc = AiErcGateUtil.summarizeBlocking(hardList, 6);
          const geoDesc = finalGeoIssues.filter(g => g.severity === 'error')
            .slice(0, 4).map(g => g.desc).join('; ');
          Logger.warn(INSTR_TRACE_TAG,
            `[AI_PIPE] GATE_DELIVER_WITH_RESIDUAL ercBlocking=${ercHardFinal} geoBlocking=${geoHard}` +
            ` — ${hardDesc}${geoDesc.length > 0 ? ' | ' + geoDesc : ''}`);
          this.stageAbortOrRetry('RETRY',
            `deliver residual erc=${ercHardFinal} geo=${geoHard}`);
          traceAiOp('AI_PIPE', 'erc_gate_deliver_residual',
            `ercBlocking=${ercHardFinal} geoBlocking=${geoHard} desc=${hardDesc.substring(0, 160)}`);
          if (opts.qualityHardFail && !opts.skipLlm) {
            this.endStage(false, `ABORT residual ${hardDesc.substring(0, 80)}`);
          } else {
            this.endStage(true, `DELIVER residual ${hardDesc.substring(0, 80)}`);
          }
        } else {
          Logger.info(INSTR_TRACE_TAG, '[AI_PIPE] gate PASS — zero ERC+geo blocking issues');
          traceAiOp('AI_PIPE', 'erc_gate_pass', 'ercBlocking=0 geoBlocking=0');
          this.endStage(true, 'PASS');
        }
    
        Logger.info(INSTR_TRACE_TAG,
          `[AI_PIPE] END usedLlm=${ctx.usedLlm} degraded=${ctx.degradedMode}` +
          ` devices=${ctx.topoWithNets.deviceList.length} wires=${ctx.topoWithNets.wireList.length}` +
          ` ercBlocking=${ercHardFinal} ercWarn=${finalErcWarns} ercClean=${ercClean}` +
          ` geoIssues=${finalGeoIssues.length} reviewPassed=${selfReviewPassed}` +
          ` residual=${!ercClean}`);
        traceAiOp('AI_PIPE', 'pipeline_end',
          `usedLlm=${ctx.usedLlm} degraded=${ctx.degradedMode}` +
          ` devices=${ctx.topoWithNets.deviceList.length} wires=${ctx.topoWithNets.wireList.length}` +
          ` ercBlocking=${ercHardFinal} ercClean=${ercClean} reviewPassed=${selfReviewPassed}`);
        traceAiStage('AI_PIPE', 'pipeline', 'END',
          `${this.logTag()}ok=true usedLlm=${ctx.usedLlm} degraded=${ctx.degradedMode}` +
          ` devices=${ctx.topoWithNets.deviceList.length} wires=${ctx.topoWithNets.wireList.length}` +
          ` ercBlocking=${ercHardFinal} geoBlocking=${geoHard} aiFixes=${aiFixApplied}`);
        this.logTopoFieldDiag('pipeline_end', ctx.topoWithNets);
    
        // oneshot：尽力交付拓扑；残留标记由上层 QaAgent / AppService 做软接受决策
        if (opts.qualityHardFail && !opts.skipLlm && !ercClean) {
          Logger.warn(INSTR_TRACE_TAG,
            `[AI_PIPE] residual deliver with qualityHardFail ercClean=false geo=${geoHard} — soft accept`);
        }
        onProgress?.(makeProgress(100, ercClean ? '闭环完成' : '已交付（强力收尾后残留已尽力）', true));
        return {
          selectResult: ctx.selectResult ?? undefined,
          placementResult: ctx.placement ?? undefined,
          routeResult: ctx.routeResult ?? undefined,
          ercErrors,
          topology: ctx.topoWithNets ?? emptySchTopology(),
          usedLlm: ctx.usedLlm,
          degradedMode: ctx.degradedMode,
          ercClean,
          geoBlocking: geoHard,
          deliveredWithResidual: !ercClean,
          warDone: ctx.warDone
        };
  }


  /**
   * 模块并行：整体设计+边界门禁 → Promise.all 隔离子编排器 → POWER joints 合并
   *
   * 真并行约束：每个子模块 forkForModule 得到独立 intent/wiring/placement/select，
   * 仅共享 apiManager 与器件库；禁止多模块共抢同一 wiringEngine / activeIntent。
   */
  async runModularParallelPipeline(opts: PipelineOptions,
    onProgress?: ProgressCallback): Promise<AiPipelineResult> {
    if (this.isCancelRequested()) {
      return this.cancelPipelineResult();
    }
    this.markStage('modular_plan');
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] modular_plan START promptLen=${opts.prompt.length}`);
    traceAiOp('AI_PIPE', 'modular_plan', `promptLen=${opts.prompt.length}`);
    onProgress?.(makeProgress(5, '整体设计中…'));

    const plan = await this.fetchModularPlanLlm(opts);
    if (this.isCancelRequested()) {
      return this.cancelPipelineResult();
    }
    if (!plan) {
      this.endStage(false, 'no valid plan');
      Logger.error(INSTR_TRACE_TAG, '[AI_PIPE] modular_plan FAIL — no valid plan');
      return {
        topology: emptySchTopology(),
        // 无有效 plan 不得伪称 usedLlm=true（上层会误判为「已用 LLM」）
        usedLlm: false,
        degradedMode: false,
        ercClean: false,
        deliveredWithResidual: false,
        ercErrors: [{
          errType: 'modular_plan',
          targetUuid: '',
          desc: '整体设计失败：缺少有效 modules/boundaryPins/joints',
          suggest: '改选「整图一次」，或简化需求后重试模块并行',
          severity: 'error'
        }],
        geoBlocking: 0
      };
    }
    this.endStage(true, `modules=${plan.modules.length} joints=${plan.joints.length}`);
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] modular_plan OK modules=${plan.modules.length} joints=${plan.joints.length}`);
    try {
      traceAiPayload('AI_PIPE', 'MODULAR_PLAN', JSON.stringify(plan), 'stage=modular_plan');
    } catch (_e) {
      // ignore
    }

    const moduleCount = plan.modules.length;
    onProgress?.(makeProgress(12, `并行生成模块 0/${moduleCount}`));
    this.markStage('modular_parallel');
    traceAiOp('AI_PIPE', 'modular_parallel', `count=${moduleCount}`);

    const MODULE_RETRY = 1;
    let completedCount = 0;
    // 各模块最新快照（未偏移）；流式时按列拼合推画布
    const streamSlots: Array<SchTopology | null> = [];
    for (let si = 0; si < moduleCount; si++) {
      streamSlots.push(null);
    }
    const emitModularStream = (modIdx: number, topo: SchTopology, stage: string): void => {
      if (!opts.onStreamSnapshot || !topo || topo.deviceList.length === 0) {
        return;
      }
      streamSlots[modIdx] = topo;
      const preview = buildModularStreamPreview(streamSlots, plan);
      if (preview.deviceList.length === 0) {
        return;
      }
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] modular_stream ${plan.modules[modIdx].id}/${stage}` +
        ` previewDevs=${preview.deviceList.length}`);
      opts.onStreamSnapshot(preview, stage);
    };

    const runOneModule = async (modIdx: number): Promise<AiPipelineResult> => {
      const mod = plan.modules[modIdx];
      // 每模块独立编排器：避免 activeIntent / wiringEngine 缓存互相踩踏
      const child = this.forkForModule(mod.id);
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] modular_parallel spawn isolated child=${mod.id}`);
      const subPrompt = buildModuleSubPrompt(mod, plan.systemOverview, this.componentLibrary);
      const childOpts: PipelineOptions = {
        prompt: subPrompt,
        scene: 'text_gen',
        mcuFamily: opts.mcuFamily,
        skipLlm: opts.skipLlm,
        routingWeights: opts.routingWeights,
        generationMode: 'create',
        generateStrategy: 'oneshot',
        modularBoundaryPins: mod.boundaryPins.slice(),
        enableReasoning: opts.enableReasoning,
        onStreamSnapshot: (snap: SchTopology, stage: string) => {
          emitModularStream(modIdx, snap, stage);
        }
      };
      const modAgent = new ModularModuleAgent(this.apiManager, this.componentLibrary);
      let last: AiPipelineResult | null = null;
      for (let attempt = 0; attempt <= MODULE_RETRY; attempt++) {
        Logger.info(INSTR_TRACE_TAG,
          `[AI_AGENT] modular_child via ModularModuleAgent module=${mod.id} attempt=${attempt + 1}`);
        last = await modAgent.run(child, childOpts, mod.id, (p) => {
          const pct = 12 + Math.floor((70 * completedCount) / moduleCount);
          onProgress?.(makeProgress(pct,
            `并行生成模块 ${completedCount}/${moduleCount} · ${mod.id} ${p.stage}`));
        });
        if (last.topology && last.topology.deviceList.length > 0 && last.usedLlm &&
          last.ercClean && !this.isPipelineAbortResult(last)) {
          const n = alignTopoRefsToBoundaryPins(last.topology, mod.boundaryPins);
          if (n > 0) {
            Logger.info(INSTR_TRACE_TAG,
              `[AI_PIPE] modular ${mod.id} boundary_ref_align renamed=${n}`);
          }
          emitModularStream(modIdx, last.topology, 'routing');
          break;
        }
        if (last.topology && last.topology.deviceList.length > 0 && last.usedLlm &&
          !last.ercClean) {
          Logger.warn(INSTR_TRACE_TAG,
            `[AI_PIPE] modular ${mod.id} reject residual ercClean=false` +
            ` geoBlocking=${last.geoBlocking ?? 0} — retry`);
        }
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] modular_parallel retry module=${mod.id} attempt=${attempt + 1}` +
          ` usedLlm=${last?.usedLlm} ercClean=${last?.ercClean}` +
          ` devices=${last?.topology?.deviceList.length ?? 0}` +
          ` erc=${AiErcGateUtil.summarizeBlocking(
            this.filterPipelineBlocking(last?.ercErrors ?? [], childOpts, last?.topology ?? emptySchTopology()),
            3)}`);
      }
      completedCount++;
      onProgress?.(makeProgress(
        12 + Math.floor((70 * completedCount) / moduleCount),
        `并行生成模块 ${completedCount}/${moduleCount}`));
      return last!;
    };

    const results: AiPipelineResult[] = [];
    for (let i = 0; i < moduleCount; i++) {
      results.push({
        topology: emptySchTopology(),
        usedLlm: false,
        degradedMode: false,
        ercClean: false,
        ercErrors: [],
        geoBlocking: 0
      });
    }
    let nextIdx = 0;
    const runWorker = async (): Promise<void> => {
      while (true) {
        const i = nextIdx;
        nextIdx++;
        if (i >= moduleCount) {
          return;
        }
        results[i] = await runOneModule(i);
        await MainThreadYield.yield();
      }
    };
    const workers: Promise<void>[] = [];
    const parallel = this.MODULAR_CONCURRENCY < moduleCount ?
      this.MODULAR_CONCURRENCY : moduleCount;
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] modular_parallel concurrency=${parallel}/${moduleCount}`);
    for (let w = 0; w < parallel; w++) {
      workers.push(runWorker());
    }
    await Promise.all(workers);

    let usedLlm = true;
    let degradedMode = false;
    const moduleTopos: SchTopology[] = [];
    const failedIds: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (!r.usedLlm) {
        usedLlm = false;
      }
      if (r.degradedMode) {
        degradedMode = true;
      }
      if (r.topology && r.topology.deviceList.length > 0 && r.usedLlm &&
        r.ercClean && !this.isPipelineAbortResult(r)) {
        moduleTopos.push(r.topology);
      } else {
        failedIds.push(plan.modules[i].id);
        moduleTopos.push(emptySchTopology());
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] modular child incomplete id=${plan.modules[i].id}` +
          ` usedLlm=${r.usedLlm} ercClean=${r.ercClean}` +
          ` devices=${r.topology?.deviceList.length ?? 0}` +
          ` blocking=${AiErcGateUtil.summarizeBlocking(
            this.filterPipelineBlocking(
              r.ercErrors ?? [],
              {
                prompt: buildModuleSubPrompt(plan.modules[i], plan.systemOverview,
                  this.componentLibrary),
                modularBoundaryPins: plan.modules[i].boundaryPins.slice()
              },
              r.topology ?? emptySchTopology()
            ),
            4)}`);
      }
    }

    if (failedIds.length > 0) {
      this.endStage(false, `failed=[${failedIds.join(',')}]`);
      Logger.error(INSTR_TRACE_TAG,
        `[AI_PIPE] modular_parallel FAIL modules=[${failedIds.join(',')}]` +
        ` — 子模块边界单脚/孤立电源应已软化；请查 net_plan 别名与 AI_FIX remove`);
      return {
        topology: emptySchTopology(),
        usedLlm,
        degradedMode,
        ercClean: false,
        ercErrors: [{
          errType: 'modular_parallel',
          targetUuid: '',
          desc: `模块并行失败：${failedIds.join(', ')} 无有效拓扑（已重试）`,
          suggest: '检查 AI API；确认整体设计仅用库内 libDevId（555 用 LM555）；或改选「整图一次」',
          severity: 'error'
        }],
        geoBlocking: 0
      };
    }
    if (!usedLlm) {
      this.endStage(false, 'non-LLM child');
      Logger.error(INSTR_TRACE_TAG, '[AI_PIPE] modular_parallel REJECT non-LLM child');
      return {
        topology: emptySchTopology(),
        usedLlm: false,
        degradedMode,
        ercClean: false,
        ercErrors: [{
          errType: 'modular_parallel',
          targetUuid: '',
          desc: '子模块未走真实 LLM，已拒绝模板回退',
          suggest: '检查 AI API 配置与连通性',
          severity: 'error'
        }],
        geoBlocking: 0
      };
    }
    this.endStage(true, `okModules=${moduleTopos.length}`);

    onProgress?.(makeProgress(88, '按边界 joints 网络标号合并中…'));
    this.markStage('modular_merge');
    traceAiOp('AI_PIPE', 'modular_merge', `modules=${moduleTopos.length} mode=joinByLabel`);
    const pinLookup = (libId: string, hint: string): string => {
      const h = `${hint ?? ''}`.toUpperCase();
      if (h.length === 0) {
        return '';
      }
      const comp = this.componentLibrary.getComponent(libId ?? '');
      if (!comp?.success || !comp.data) {
        return '';
      }
      const pins = comp.data.pins ?? [];
      for (let pi = 0; pi < pins.length; pi++) {
        const p = pins[pi];
        const pid = `${p.id ?? ''}`.toUpperCase();
        const pname = `${p.name ?? ''}`.toUpperCase();
        if (pid === h || pname === h) {
          return p.id ?? '';
        }
      }
      for (let pi = 0; pi < pins.length; pi++) {
        const p = pins[pi];
        const pid = `${p.id ?? ''}`.toUpperCase();
        const pname = `${p.name ?? ''}`.toUpperCase();
        if (pid === h || pname === h) {
          return p.id ?? '';
        }
        if (pname.length > 0 && (pname.endsWith(h) || h.endsWith(pname))) {
          return p.id ?? '';
        }
      }
      return '';
    };

    const mergeOut = mergeModularTopologies(moduleTopos, plan, pinLookup);
    let merged = mergeOut.topology;
    this.placementOptimizer.resolveSelectionOverlaps(merged);
    // 跨模块已用网络标号并网；默认约束自动 forceLabel 仪器网
    opts.onStreamSnapshot?.(merged, 'net_plan');
    const mergeRouteCons = ConstrainedWiringEngine.defaultConstraints(merged);
    this.lastRoutingConstraints = mergeRouteCons;
    this.lastNetWaypoints = null;
    const routed = await this.wiringEngine.routeUntilCleanAsync(
      merged, mergeRouteCons,
      opts.routingWeights, undefined, 4);
    merged.wireList = routed.routeLines;

    let ercErrors = this.collectErc(merged);
    if (mergeOut.jointFail > 0) {
      const detail = mergeOut.jointFailReasons.slice(0, 6).join('；');
      ercErrors.push({
        errType: 'modular_joint',
        targetUuid: '',
        desc: `模块边界 joints 失败 ${mergeOut.jointFail}/${plan.joints.length}` +
          (detail.length > 0 ? `：${detail}` : ''),
        suggest: '检查 boundaryPins 与子模块 RefDes/引脚是否一致后重试',
        severity: 'error'
      });
    }
    merged.ercErrorList = ercErrors;
    let geoIssues = this.collectGeometricIssues(merged);
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] modular_merge pre-clear devices=${merged.deviceList.length}` +
      ` wires=${merged.wireList.length} jointsOk=${mergeOut.jointOk}` +
      ` jointsFail=${mergeOut.jointFail}` +
      ` ercBlocking=${AiErcGateUtil.countBlocking(ercErrors)}`);

    // 合并后走与 oneshot 相同的 ERC+几何 AI 自检闭环（此前缺失导致 joints/并网瑕疵无法清零）
    onProgress?.(makeProgress(90, '合并后 AI 自检闭环…'));
    const cleared = await this.runErcGeoClearLoop(merged, ercErrors, geoIssues, opts,
      onProgress, usedLlm, 90);
    merged = cleared.topo;
    ercErrors = cleared.ercErrors;
    usedLlm = cleared.usedLlm;
    // joints 失败必须保留为阻断（clear 可能重算 ERC 丢掉自定义项）
    if (mergeOut.jointFail > 0) {
      const stillJoint = ercErrors.some(e => e.errType === 'modular_joint');
      if (!stillJoint) {
        const detail = mergeOut.jointFailReasons.slice(0, 6).join('；');
        ercErrors.push({
          errType: 'modular_joint',
          targetUuid: '',
          desc: `模块边界 joints 失败 ${mergeOut.jointFail}/${plan.joints.length}` +
            (detail.length > 0 ? `：${detail}` : ''),
          suggest: '检查 boundaryPins 与子模块 RefDes/引脚是否一致后重试',
          severity: 'error'
        });
        merged.ercErrorList = ercErrors;
      }
    }
    const ercHard = AiErcGateUtil.countBlocking(ercErrors);
    const geoHard = cleared.geoHard;
    const ercClean = ercHard === 0 && geoHard === 0;
    opts.onStreamSnapshot?.(merged, 'modular_merge');

    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] modular_merge END devices=${merged.deviceList.length}` +
      ` wires=${merged.wireList.length} jointsOk=${mergeOut.jointOk}` +
      ` jointsFail=${mergeOut.jointFail} ercBlocking=${ercHard} geoBlocking=${geoHard}` +
      ` ercClean=${ercClean} aiFixes=${cleared.aiFixApplied}`);
    this.endStage(true,
      `devs=${merged.deviceList.length} jointsOk=${mergeOut.jointOk}` +
      ` jointsFail=${mergeOut.jointFail} erc=${ercHard} geo=${geoHard}`);
    this.logTopoFieldDiag('modular_merge', merged);
    if (mergeOut.jointFailReasons.length > 0) {
      traceAiDiag('AI_PIPE', 'modular_joint_fail', mergeOut.jointFailReasons, 16);
    }
    // joints 失败仍属硬失败（边界未并上）；ercClean 必须真实，供上层判定
    const deliverOk = mergeOut.jointFail === 0 && merged.deviceList.length > 0;
    onProgress?.(makeProgress(100,
      deliverOk
        ? (ercClean ? '模块并行闭环完成' : '模块并行已交付（残留已尽力）')
        : '模块并行失败(joints)', true));
    return {
      topology: deliverOk ? merged : emptySchTopology(),
      usedLlm,
      degradedMode: false,
      ercClean: deliverOk && ercClean,
      deliveredWithResidual: deliverOk && !ercClean,
      ercErrors,
      geoBlocking: geoHard
    };
  }

  /**
   * ERC + 几何 AI 自检修复闭环（oneshot 末尾与 modular 合并后共用）。
   * 禁止跳过：否则 joints/并网引入的阻断无法被 LLM 清零。
   */
  private async runErcGeoClearLoop(
    topoIn: SchTopology,
    ercIn: ErcError[],
    geoIn: ValidationIssue[],
    opts: PipelineOptions,
    onProgress: ProgressCallback | undefined,
    usedLlmIn: boolean,
    progressBase: number
  ): Promise<ErcGeoClearResult> {
    let topo = topoIn;
    let ercErrors = ercIn;
    let geoIssues = geoIn;
    if (this.isModularChildOpts(opts)) {
      const pruned = this.pruneOrphanPowerSymbols(topo);
      if (pruned > 0) {
        Logger.info(INSTR_TRACE_TAG,
          `[AI_FIX] modular pre-clear pruned ${pruned} orphan power symbols`);
        ercErrors = this.collectErc(topo);
        topo.ercErrorList = ercErrors;
      }
    }
    let ercHard = this.countPipelineBlocking(ercErrors, opts, topo);
    let usedLlm = usedLlmIn;
    let aiFixApplied = 0;
    let clearRound = 0;
    let stallKitTried = 0;
    let lastGeoFingerprint = '';
    let geoStallRounds = 0;

    // 提速：门禁前先跑确定性 kit；已干净则跳过全部 self-review LLM
    const preLooksRc = this.activeIntent.seriesRcCharge || this.topoLooksLikeSeriesRc(topo);
    if (preLooksRc && !this.activeIntent.mutualLedIndicator) {
      this.stripStrayRelaysForSeriesRc(topo);
    }
    const preFin = AiTopologyFixKit.finalizeForGate(topo, this.wiringEngine, this.buildFinalizeGateOpts(opts, preLooksRc));
    if (preFin.fixed > 0) {
      aiFixApplied += preFin.fixed;
      Logger.info(INSTR_TRACE_TAG,
        `[AI_FIX] SPEED pre-clear finalizeForGate fixed=${preFin.fixed}`);
      if (preFin.needReroute) {
        await this.rerouteAfterFix(topo, opts);
      }
      ercErrors = this.collectErc(topo);
      topo.ercErrorList = ercErrors;
      geoIssues = this.collectGeometricIssues(topo);
      ercHard = this.countPipelineBlocking(ercErrors, opts, topo);
    }
    if (ercHard === 0 && this.countGeoBlocking(geoIssues) === 0) {
      Logger.info(INSTR_TRACE_TAG,
        '[AI_PIPE] SPEED skip clear-loop — already ERC+geo clean after pre-kit');
      const earlyOut: ErcGeoClearResult = {
        topo: topo,
        ercErrors: ercErrors,
        geoIssues: geoIssues,
        ercHard: 0,
        geoHard: 0,
        aiFixApplied: aiFixApplied,
        usedLlm: usedLlm
      };
      return earlyOut;
    }

    while (clearRound < ERC_CLEAR_MAX_ROUNDS) {
      clearRound++;
      await MainThreadYield.yield();
      onProgress?.(makeProgress(progressBase + clearRound,
        ercHard > 0 ? `AI 消 ERC 阻断项 第${clearRound}轮` : 'AI 自检审查'));
      traceAiOp('AI_PIPE', 'self_review',
        `round=${clearRound} ercBlocking=${ercHard}`);

      // 提速：每轮先确定性修复；仍阻断才调 self-review LLM
      const detFirst = this.buildDeterministicReviewFixes(topo, ercErrors, geoIssues);
      if (detFirst.issues.length > 0) {
        const detExec = this.executeAiFixes(topo, detFirst.issues, opts);
        if (detExec.fixCount > 0) {
          aiFixApplied += detExec.fixCount;
          if (detExec.needReroute) {
            const routeCons = this.lastRoutingConstraints ??
              ConstrainedWiringEngine.defaultConstraints(topo);
            const rr = await this.wiringEngine.routeUntilCleanAsync(topo, routeCons,
              opts.routingWeights, this.lastNetWaypoints ?? undefined, 1);
            topo.wireList = rr.routeLines;
          }
          ercErrors = this.collectErc(topo);
          topo.ercErrorList = ercErrors;
          geoIssues = this.collectGeometricIssues(topo);
          ercHard = this.countPipelineBlocking(ercErrors, opts, topo);
          Logger.info(INSTR_TRACE_TAG,
            `[AI_FIX] SPEED det-first r${clearRound} fixed=${detExec.fixCount}` +
            ` ercBlocking=${ercHard} geoBlocking=${this.countGeoBlocking(geoIssues)}`);
          if (ercHard === 0 && this.countGeoBlocking(geoIssues) === 0) {
            Logger.info(INSTR_TRACE_TAG,
              `[AI_PIPE] SPEED skip self-review LLM r${clearRound} — det-first cleaned`);
            break;
          }
        }
      }

      // 几何指纹不变：跳过昂贵 self-review LLM，避免 demote↔LLM 空转
      const geoFpPreLlm = this.buildGeoBlockingFingerprint(geoIssues);
      const skipSelfReviewLlm = ercHard === 0 && geoFpPreLlm.length > 0 &&
        geoFpPreLlm === lastGeoFingerprint;
      let reviewResult: LlmFetchResult<AiSelfReviewResult> = {
        fromLlm: false,
        output: { passed: false, issues: [], summary: '' }
      };
      if (skipSelfReviewLlm) {
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] skip self-review LLM r${clearRound} — geo fingerprint unchanged`);
        reviewResult.output = this.buildDeterministicReviewFixes(topo, ercErrors, geoIssues);
      } else {
        reviewResult = await this.fetchSelfReviewLlm(topo, ercErrors, geoIssues, opts);
      }
      if (reviewResult.fromLlm) {
        usedLlm = true;
        Logger.info(INSTR_TRACE_TAG,
          `[AI_PIPE] AI self-review r${clearRound}: passed=${reviewResult.output.passed}` +
          ` issues=${reviewResult.output.issues.length} ercBlocking=${ercHard}`);
        traceAiOp('AI_PIPE', 'self_review_done',
          `round=${clearRound} passed=${reviewResult.output.passed}` +
          ` issues=${reviewResult.output.issues.length}` +
          ` summary=${reviewResult.output.summary.substring(0, 80)}`);
      } else {
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] self-review LLM unavailable round=${clearRound}`);
        // 确定性回退：ERC/几何仍阻断时注入可执行 fixActions
        if (ercHard > 0 || this.countGeoBlocking(geoIssues) > 0) {
          const det = this.buildDeterministicReviewFixes(topo, ercErrors, geoIssues);
          if (det.issues.length > 0) {
            reviewResult.output = det;
            Logger.warn(INSTR_TRACE_TAG,
              `[AI_PIPE] self-review deterministic fallback issues=${det.issues.length}`);
          }
        }
      }

      let roundFixCount = 0;
      let roundNeedReroute = false;
      if (reviewResult.output.issues.length > 0) {
        onProgress?.(makeProgress(Math.min(99, progressBase + 3),
          `AI 驱动修复 第${clearRound}轮`));
        const fixExec = this.executeAiFixes(topo, reviewResult.output.issues, opts);
        aiFixApplied += fixExec.fixCount;
        roundFixCount = fixExec.fixCount;
        roundNeedReroute = fixExec.needReroute;
        // 有实质拓扑变更或显式 needReroute 时重布（纯 reroute 的 fixCount=0 也要跑）
        if (fixExec.fixCount > 0 || fixExec.needReroute) {
          if (fixExec.needReroute) {
            const routeCons = this.lastRoutingConstraints ??
              ConstrainedWiringEngine.defaultConstraints(topo);
            const reRoute = await this.wiringEngine.routeUntilCleanAsync(topo,
              routeCons,
              opts.routingWeights, this.lastNetWaypoints ?? undefined, 2);
            topo.wireList = reRoute.routeLines;
            const geoAfterFix = this.collectGeometricIssues(topo);
            const badNets = this.collectGeoBadNetUuids(geoAfterFix);
            if (badNets.size > 0) {
              const n = this.wiringEngine.demoteNetsToLabelStubs(topo, badNets);
              Logger.warn(INSTR_TRACE_TAG,
                `[AI_FIX] post-reroute demote ${badNets.size} nets → labels (${n} stubs)`);
            }
          }
          const pruned = this.pruneOrphanFixDevices(topo);
          if (pruned > 0) {
            Logger.info(INSTR_TRACE_TAG, `[AI_FIX] pruned ${pruned} floating orphan devices`);
          }
          if (this.isModularChildOpts(opts)) {
            const pwr = this.pruneOrphanPowerSymbols(topo);
            if (pwr > 0) {
              Logger.info(INSTR_TRACE_TAG,
                `[AI_FIX] modular pruned ${pwr} orphan VCC/GND after AI fix`);
            }
          }
        }
      }

      const validator = this.getPostGen();
      const valResult = await validator.validateAndFixAsync(topo);
      if (valResult.fixedCount > 0) {
        topo = valResult.topo;
        Logger.info(INSTR_TRACE_TAG,
          `[AI_PIPE] PostGenValidator r${clearRound} fixed=${valResult.fixedCount}`);
        traceAiOp('AI_PIPE', 'postgen_fix',
          `round=${clearRound} fixed=${valResult.fixedCount}`);
      }
      // 每轮剪单脚信号网，避免 PIN_CONNECTIVITY 拖到门禁
      const pruneR = this.pruneSingletonsPreservingBoundary(topo, opts);
      if (pruneR.fixed > 0) {
        aiFixApplied += pruneR.fixed;
        Logger.info(INSTR_TRACE_TAG,
          `[AI_FIX] clear-round pruneSingleton fixed=${pruneR.fixed}`);
      }

      ercErrors = this.collectErc(topo);
      topo.ercErrorList = ercErrors;
      ercHard = this.countPipelineBlocking(ercErrors, opts, topo);
      geoIssues = this.collectGeometricIssues(topo);
      const geoHardNow = this.countGeoBlocking(geoIssues);
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] after clear-round ${clearRound}: ercBlocking=${ercHard}` +
        ` geoBlocking=${geoHardNow} fixesTotal=${aiFixApplied}` +
        ` needReroute=${roundNeedReroute}`);
      if (geoHardNow > 0) {
        const geoSummary: string[] = [];
        for (let gi = 0; gi < geoIssues.length && geoSummary.length < 4; gi++) {
          const g = geoIssues[gi];
          if (g.severity !== 'error') {
            continue;
          }
          let netHint = g.targetUuid ?? '';
          if (g.targetUuid && g.targetUuid.length > 0) {
            const net = topo.netList.find(n => n.netUuid === g.targetUuid);
            if (net && (net.netName ?? '').length > 0) {
              netHint = net.netName;
            }
          }
          const descShort = (g.desc ?? '').substring(0, 80);
          geoSummary.push(`${g.type}@${netHint}:${descShort}`);
        }
        Logger.info(INSTR_TRACE_TAG,
          `[AI_PIPE] geoBlocking detail r${clearRound}: ${geoSummary.join(' | ')}`);
        traceAiDiag('AI_PIPE', `geo_blocking_r${clearRound}`, geoSummary, 4);
      }
      traceAiStage('AI_PIPE', 'self_review_clear', 'METRIC',
        `${this.logTag()}round=${clearRound} ercBlocking=${ercHard}` +
        ` geoBlocking=${geoHardNow} fixesTotal=${aiFixApplied}`);

      if (ercHard === 0 && geoHardNow === 0) {
        Logger.info(INSTR_TRACE_TAG,
          `[AI_PIPE] ERC+GEO CLEAN after round=${clearRound} — generation gate passed`);
        break;
      }

      // 几何阻断指纹不变：demote/rebuild 假进度 → 尽快 FORCE_COMPLETE，禁止空转 LLM
      const geoFpNow = this.buildGeoBlockingFingerprint(geoIssues);
      if (ercHard === 0 && geoHardNow > 0) {
        if (geoFpNow.length > 0 && geoFpNow === lastGeoFingerprint) {
          geoStallRounds++;
        } else {
          geoStallRounds = 0;
          lastGeoFingerprint = geoFpNow;
        }
        if (geoStallRounds >= 2) {
          Logger.warn(INSTR_TRACE_TAG,
            `[AI_PIPE] clear geo-stall r${clearRound} fingerprint unchanged×${geoStallRounds}` +
            ` geoBlocking=${geoHardNow} — enter force-complete`);
          break;
        }
      } else {
        geoStallRounds = 0;
        lastGeoFingerprint = '';
      }

      // 本轮有实质修复或仅 reroute → 继续下一轮
      if (roundFixCount > 0 || valResult.fixedCount > 0 || roundNeedReroute || pruneR.fixed > 0) {
        continue;
      }
      if (!reviewResult.fromLlm || reviewResult.output.issues.length === 0) {
        if (geoHardNow > 0) {
          const routeCons = this.lastRoutingConstraints ??
            ConstrainedWiringEngine.defaultConstraints(topo);
          const forced = await this.wiringEngine.routeUntilCleanAsync(topo,
            routeCons,
            opts.routingWeights, this.lastNetWaypoints ?? undefined, 1);
          topo.wireList = forced.routeLines;
          geoIssues = this.collectGeometricIssues(topo);
          const geoAfter = this.countGeoBlocking(geoIssues);
          Logger.info(INSTR_TRACE_TAG,
            `[AI_PIPE] forced geo re-route round=${clearRound} geoBlocking=${geoAfter}`);
          if (geoAfter === 0 && ercHard === 0) {
            break;
          }
        }
        // stall：最多 3 次确定性 kit，避免过早放弃
        if (stallKitTried < 3) {
          stallKitTried++;
          const stallDet = this.buildDeterministicReviewFixes(topo, ercErrors, geoIssues);
          const stallExec = this.executeAiFixes(topo, stallDet.issues, opts);
          const stallFin = AiTopologyFixKit.finalizeForGate(topo, this.wiringEngine, this.buildFinalizeGateOpts(opts, this.activeIntent.seriesRcCharge || this.topoLooksLikeSeriesRc(topo)));
          const stallFixed = stallExec.fixCount + stallFin.fixed;
          if (stallFixed > 0) {
            aiFixApplied += stallFixed;
            Logger.warn(INSTR_TRACE_TAG,
              `[AI_FIX] clear stall kit#${stallKitTried} fixed=${stallFixed} — retry round`);
            if (stallExec.needReroute || stallFin.needReroute) {
              const routeCons2 = this.lastRoutingConstraints ??
                ConstrainedWiringEngine.defaultConstraints(topo);
              const rr = await this.wiringEngine.routeUntilCleanAsync(topo, routeCons2,
                opts.routingWeights, this.lastNetWaypoints ?? undefined, 1);
              topo.wireList = rr.routeLines;
            }
            continue;
          }
        }
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] clear stalled at round=${clearRound} ercBlocking=${ercHard}` +
          ` geoBlocking=${this.countGeoBlocking(geoIssues)} — enter force-complete`);
        break;
      }
    }

    ercErrors = this.collectErc(topo);
    topo.ercErrorList = ercErrors;
    const ercHardOut = this.countPipelineBlocking(ercErrors, opts, topo);
    let geoOut = this.collectGeometricIssues(topo);
    let geoHardOut = this.countGeoBlocking(geoOut);
    // 闭环末仍有几何阻断：强制标号化 + 拆电源短接 + 浮空补挂
    if (geoHardOut > 0) {
      AiTopologyFixKit.sanitizeTopoPinIds(topo);
      const split = AiTopologyFixKit.splitMergedPowerRails(topo);
      if (split.fixed > 0) {
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_FIX] final split_power fixed=${split.fixed}`);
        aiFixApplied += split.fixed;
      }
      const badNets = this.collectGeoBadNetUuids(geoOut);
      if (badNets.size > 0) {
        const n = this.wiringEngine.demoteNetsToLabelStubs(topo, badNets);
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_FIX] final geo demote ${badNets.size} nets → labels (${n} stubs)`);
        geoOut = this.collectGeometricIssues(topo);
        geoHardOut = this.countGeoBlocking(geoOut);
      }
      if (geoHardOut > 0) {
        // 禁止 nuclear demote_all（会抹掉全部 WAR → 整图只剩标号）
        const reb = AiTopologyFixKit.rebuildInstrument(topo, this.wiringEngine);
        if (reb.fixed > 0) {
          Logger.warn(INSTR_TRACE_TAG,
            `[AI_FIX] nuclear pre-rebuild_instrument fixed=${reb.fixed}`);
          aiFixApplied += reb.fixed;
        }
        if (this.wantsOpAmpSelfOsc(topo)) {
          const osc = AiTopologyFixKit.wireOpAmpSelfOsc(topo, this.wiringEngine);
          Logger.warn(INSTR_TRACE_TAG,
            `[AI_FIX] nuclear→wireOpAmpSelfOsc fixed=${osc.fixed}`);
          aiFixApplied += osc.fixed;
        } else {
          const stillBad = this.collectGeoBadNetUuids(geoOut);
          if (stillBad.size > 0) {
            const n = this.wiringEngine.demoteNetsToLabelStubs(topo, stillBad);
            Logger.warn(INSTR_TRACE_TAG,
              `[AI_FIX] nuclear→geo demote nets=${stillBad.size} stubs=${n}`);
            aiFixApplied += n > 0 ? stillBad.size : 0;
          }
          const pwr = AiTopologyFixKit.demotePowerRails(topo, this.wiringEngine);
          if (pwr.fixed > 0) {
            Logger.warn(INSTR_TRACE_TAG,
              `[AI_FIX] nuclear→demote_power fixed=${pwr.fixed}`);
            aiFixApplied += pwr.fixed;
          }
        }
        // nuclear 后按意图重挂关键拓扑（避免 heal 把 R/C/LED/表短路）
        const looksRcNuke = this.activeIntent.seriesRcCharge || this.topoLooksLikeSeriesRc(topo);
        if (looksRcNuke && !this.activeIntent.mutualLedIndicator) {
          this.stripStrayRelaysForSeriesRc(topo);
        }
        const nukeFin = AiTopologyFixKit.finalizeForGate(topo, this.wiringEngine,
          this.buildFinalizeGateOpts(opts, looksRcNuke));
        if (nukeFin.fixed > 0) {
          Logger.warn(INSTR_TRACE_TAG,
            `[AI_FIX] nuclear finalizeForGate fixed=${nukeFin.fixed}`);
          aiFixApplied += nukeFin.fixed;
        }
        AiTopologyFixKit.pruneSingletonOrphanNets(topo);
        geoOut = this.collectGeometricIssues(topo);
        geoHardOut = this.countGeoBlocking(geoOut);
      }
      ercErrors = this.collectErc(topo);
      topo.ercErrorList = ercErrors;
    }

    // 门禁前最终确定性加固（RC/电位器/仪器/短路/单脚网）
    const looksRc = this.activeIntent.seriesRcCharge || this.topoLooksLikeSeriesRc(topo);
    if (looksRc && !this.activeIntent.mutualLedIndicator) {
      this.stripStrayRelaysForSeriesRc(topo);
    }
    const fin = AiTopologyFixKit.finalizeForGate(topo, this.wiringEngine, this.buildFinalizeGateOpts(opts, looksRc));
    if (fin.fixed > 0) {
      aiFixApplied += fin.fixed;
      Logger.info(INSTR_TRACE_TAG,
        `[AI_FIX] pre-gate finalizeForGate fixed=${fin.fixed}`);
      // 几何仍差则再 demote 违例网
      geoOut = this.collectGeometricIssues(topo);
      geoHardOut = this.countGeoBlocking(geoOut);
      if (geoHardOut > 0) {
        const bad2 = this.collectGeoBadNetUuids(geoOut);
        if (bad2.size > 0) {
          this.wiringEngine.demoteNetsToLabelStubs(topo, bad2);
          AiTopologyFixKit.rebuildInstrument(topo, this.wiringEngine);
          geoOut = this.collectGeometricIssues(topo);
          geoHardOut = this.countGeoBlocking(geoOut);
        }
      }
      ercErrors = this.collectErc(topo);
      topo.ercErrorList = ercErrors;
    }

    // 闭环后再做一次 pin 连通审计 + 关键电气语义审计
    const pinExtra = this.auditNetPinConnectivity(topo);
    if (pinExtra.length > 0) {
      // 先确定性补救再决定是否注入阻断
      const healPin = AiTopologyFixKit.healFloatingPins(topo, this.wiringEngine);
      const prunePin = this.pruneSingletonsPreservingBoundary(topo, opts);
      if (healPin.fixed + prunePin.fixed > 0) {
        aiFixApplied += healPin.fixed + prunePin.fixed;
      }
      const pinExtra2 = this.auditNetPinConnectivity(topo);
      for (let pi = 0; pi < pinExtra2.length; pi++) {
        ercErrors.push(pinExtra2[pi]);
      }
      topo.ercErrorList = ercErrors;
      if (pinExtra2.length > 0) {
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] post-clear pin_connectivity=${pinExtra2.length}`);
      }
    }
    let elecHard = AiTopologyFixKit.auditCriticalElectrical(topo);
    if (elecHard.length > 0) {
      const healed = AiTopologyFixKit.healCriticalElectricalShorts(topo, this.wiringEngine);
      if (healed.fixed > 0) {
        aiFixApplied += healed.fixed;
        // 拆短后重钉自激闭环，再复审
        if (this.wantsOpAmpSelfOsc(topo)) {
          aiFixApplied += AiTopologyFixKit.wireOpAmpSelfOsc(topo, this.wiringEngine).fixed;
          if (topo.deviceList.some(d => (d.libDevId ?? '').toUpperCase() === 'VEE')) {
            aiFixApplied += AiTopologyFixKit.wireDualSupplyRails(topo, this.wiringEngine).fixed;
          }
        }
        elecHard = AiTopologyFixKit.auditCriticalElectrical(topo);
      }
    }
    if (elecHard.length > 0) {
      for (let ei = 0; ei < elecHard.length; ei++) {
        ercErrors.push({
          errType: 'electrical_short',
          targetUuid: '',
          desc: elecHard[ei],
          suggest: 'rebuild_instrument / wire_series_rc / reconnect_pin',
          severity: 'error'
        });
      }
      topo.ercErrorList = ercErrors;
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] post-clear electrical_hard=${elecHard.length}`);
      traceAiDiag('AI_PIPE', 'electrical_hard', elecHard, 12);
      if (geoHardOut === 0) {
        Logger.warn(INSTR_TRACE_TAG,
          '[AI_PIPE] geo clean but electrical blocking — gate stays FAIL');
      }
    }
    // 刷新几何计数
    geoOut = this.collectGeometricIssues(topo);
    geoHardOut = this.countGeoBlocking(geoOut);
    let ercHardFinal = this.countPipelineBlocking(ercErrors, opts, topo);

    // qualityHardFail：禁止 FORCE_COMPLETE 脏交付；仅允许有限 QA（WAR/Kit）再硬失败
    if (ercHardFinal > 0 || geoHardOut > 0) {
      if (opts.qualityHardFail && !opts.skipLlm) {
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] skip FORCE_COMPLETE under qualityHardFail` +
          ` erc=${ercHardFinal} geo=${geoHardOut} — QaAgent limited fix`);
        const qaLimited = await this.runQaLimitedWarFix(topo, ercErrors, geoOut, opts, aiFixApplied);
        topo = qaLimited.topo;
        ercErrors = qaLimited.ercErrors;
        geoOut = qaLimited.geoIssues;
        ercHardFinal = qaLimited.ercHard;
        geoHardOut = qaLimited.geoHard;
        aiFixApplied = qaLimited.aiFixApplied;
      } else {
        const assault = await this.runForceCompleteAssault(topo, ercErrors, geoOut, opts,
          onProgress, usedLlm, aiFixApplied);
        topo = assault.topo;
        ercErrors = assault.ercErrors;
        geoOut = assault.geoIssues;
        ercHardFinal = assault.ercHard;
        geoHardOut = assault.geoHard;
        aiFixApplied = assault.aiFixApplied;
        usedLlm = assault.usedLlm;
      }
    }

    const out: ErcGeoClearResult = {
      topo: topo,
      ercErrors: ercErrors,
      geoIssues: geoOut,
      ercHard: ercHardFinal,
      geoHard: geoHardOut,
      aiFixApplied: aiFixApplied,
      usedLlm: usedLlm
    };
    return out;
  }

  /**
   * qualityHardFail 下有限 QA：最多 QA_FIX_ROUNDS 轮 WAR 重拉 + finalizeForGate，
   * 禁止 FORCE_COMPLETE / demote_all。
   */
  private async runQaLimitedWarFix(
    topoIn: SchTopology,
    ercIn: ErcError[],
    geoIn: ValidationIssue[],
    opts: PipelineOptions,
    aiFixIn: number
  ): Promise<ErcGeoClearResult> {
    let topo = topoIn;
    let ercErrors = ercIn;
    let geoIssues = geoIn;
    let aiFixApplied = aiFixIn;
    let ercHard = this.countPipelineBlocking(ercErrors, opts, topo);
    let geoHard = this.countGeoBlocking(geoIssues);

    for (let round = 1; round <= QA_FIX_ROUNDS; round++) {
      if (ercHard === 0 && geoHard === 0) {
        break;
      }
      Logger.info(INSTR_TRACE_TAG,
        `[AI_AGENT] QaAgent limited fix round=${round}/${QA_FIX_ROUNDS}` +
        ` erc=${ercHard} geo=${geoHard}`);

      // 清非 stub 长线后 WAR 重布
      topo.wireList = WarRouteAdapter.stripNonStubWires(topo.wireList);
      const war = await this.warAdapter.routeTopology(topo, true,
        () => this.isCancelRequested());
      if (war.ok) {
        aiFixApplied += war.routedNets;
        Logger.info(INSTR_TRACE_TAG,
          `[AI_AGENT] route via WAR qa-fix routedNets=${war.routedNets}`);
      } else {
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_AGENT] QaAgent WAR fail round=${round} | ${war.reason}`);
      }

      const looksRc = this.activeIntent.seriesRcCharge || this.topoLooksLikeSeriesRc(topo);
      const fin = AiTopologyFixKit.finalizeForGate(topo, this.wiringEngine,
        this.buildFinalizeGateOpts(opts, looksRc));
      aiFixApplied += fin.fixed;

      geoIssues = this.collectGeometricIssues(topo);
      geoHard = this.countGeoBlocking(geoIssues);
      ercErrors = this.collectErc(topo);
      topo.ercErrorList = ercErrors;
      ercHard = this.countPipelineBlocking(ercErrors, opts, topo);
    }

    return {
      topo: topo,
      ercErrors: ercErrors,
      geoIssues: geoIssues,
      ercHard: ercHard,
      geoHard: geoHard,
      aiFixApplied: aiFixApplied,
      usedLlm: false
    };
  }

  /**
   * 强力收尾：轮换确定性 kit / 标号降级 / 运放闭环 / 仪器重建 / LLM 自检，
   * 直到 ERC+几何阻断为 0。用户明确要求必须完成生图。
   */
  private async runForceCompleteAssault(
    topoIn: SchTopology,
    ercIn: ErcError[],
    geoIn: ValidationIssue[],
    opts: PipelineOptions,
    onProgress: ProgressCallback | undefined,
    usedLlmIn: boolean,
    aiFixIn: number
  ): Promise<ErcGeoClearResult> {
    let topo = topoIn;
    let ercErrors = ercIn;
    let geoIssues = geoIn;
    let usedLlm = usedLlmIn;
    let aiFixApplied = aiFixIn;
    let ercHard = this.countPipelineBlocking(ercErrors, opts, topo);
    let geoHard = this.countGeoBlocking(geoIssues);

    for (let assault = 1; assault <= FORCE_COMPLETE_MAX_ASSAULTS; assault++) {
      if (ercHard === 0 && geoHard === 0) {
        break;
      }
      onProgress?.(makeProgress(Math.min(99, 94 + assault),
        `强力收尾完成生图 · 策略${assault}/${FORCE_COMPLETE_MAX_ASSAULTS}`));
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] FORCE_COMPLETE assault=${assault}` +
        ` ercBlocking=${ercHard} geoBlocking=${geoHard}`);
      traceAiOp('AI_PIPE', 'force_complete',
        `assault=${assault} erc=${ercHard} geo=${geoHard}`);

      const looksRc = this.activeIntent.seriesRcCharge || this.topoLooksLikeSeriesRc(topo);
      if (looksRc && !this.activeIntent.mutualLedIndicator) {
        this.stripStrayRelaysForSeriesRc(topo);
      }

      // 策略轮换
      if (assault === 1 || assault === 4) {
        const fin = AiTopologyFixKit.finalizeForGate(topo, this.wiringEngine, this.buildFinalizeGateOpts(opts, looksRc));
        aiFixApplied += fin.fixed;
        const opa = AiTopologyFixKit.wireOpAmpFeedback(topo, this.wiringEngine);
        aiFixApplied += opa.fixed;
      }
      if (assault === 2 || assault === 5) {
        const det = this.buildDeterministicReviewFixes(topo, ercErrors, geoIssues);
        const exec = this.executeAiFixes(topo, det.issues, opts);
        aiFixApplied += exec.fixCount;
        const reb = AiTopologyFixKit.rebuildInstrument(topo, this.wiringEngine);
        aiFixApplied += reb.fixed;
        if (exec.needReroute || reb.needReroute) {
          const routeCons = this.lastRoutingConstraints ??
            ConstrainedWiringEngine.defaultConstraints(topo);
          const rr = await this.wiringEngine.routeUntilCleanAsync(topo, routeCons,
            opts.routingWeights, this.lastNetWaypoints ?? undefined, 1);
          topo.wireList = rr.routeLines;
        }
      }
      if (assault === 3 || assault === 6) {
        // 几何打击：仅冲突网+电源标号（禁止整图 demote_all 抹掉 WAR）
        const badNuke = this.collectGeoBadNetUuids(geoIssues);
        if (badNuke.size > 0) {
          aiFixApplied += this.wiringEngine.demoteNetsToLabelStubs(topo, badNuke) > 0
            ? badNuke.size : 0;
        }
        const pwrNuke = AiTopologyFixKit.demotePowerRails(topo, this.wiringEngine);
        aiFixApplied += pwrNuke.fixed;
        if (this.wantsOpAmpSelfOsc(topo)) {
          aiFixApplied += AiTopologyFixKit.wireOpAmpSelfOsc(topo, this.wiringEngine).fixed;
        }
        const fin2 = AiTopologyFixKit.finalizeForGate(topo, this.wiringEngine, this.buildFinalizeGateOpts(opts, looksRc));
        aiFixApplied += fin2.fixed;
        AiTopologyFixKit.wireOpAmpFeedback(topo, this.wiringEngine);
        AiTopologyFixKit.healCriticalElectricalShorts(topo, this.wiringEngine);
        AiTopologyFixKit.dropFullyFloatingDevices(topo);
        this.pruneSingletonsPreservingBoundary(topo, opts);
      }

      // 每轮尝试 LLM 自检（真修复，非模板）
      const review = await this.fetchSelfReviewLlm(topo, ercErrors, geoIssues, opts);
      if (review.fromLlm) {
        usedLlm = true;
        if (review.output.issues.length > 0) {
          const fx = this.executeAiFixes(topo, review.output.issues, opts);
          aiFixApplied += fx.fixCount;
          if (fx.needReroute) {
            const routeCons = this.lastRoutingConstraints ??
              ConstrainedWiringEngine.defaultConstraints(topo);
            const rr = await this.wiringEngine.routeUntilCleanAsync(topo, routeCons,
              opts.routingWeights, this.lastNetWaypoints ?? undefined, 1);
            topo.wireList = rr.routeLines;
          }
        }
      } else {
        const det2 = this.buildDeterministicReviewFixes(topo, ercErrors, geoIssues);
        const fx2 = this.executeAiFixes(topo, det2.issues, opts);
        aiFixApplied += fx2.fixCount;
      }

      const validator = this.getPostGen();
      const val = await validator.validateAndFixAsync(topo);
      if (val.fixedCount > 0) {
        topo = val.topo;
        aiFixApplied += val.fixedCount;
      }

      ercErrors = this.collectErc(topo);
      topo.ercErrorList = ercErrors;
      geoIssues = this.collectGeometricIssues(topo);
      // 几何仍阻断 → 强制 demote 违例网
      geoHard = this.countGeoBlocking(geoIssues);
      if (geoHard > 0) {
        const bad = this.collectGeoBadNetUuids(geoIssues);
        if (bad.size > 0) {
          this.wiringEngine.demoteNetsToLabelStubs(topo, bad);
        } else {
          AiTopologyFixKit.demotePowerRails(topo, this.wiringEngine);
        }
        AiTopologyFixKit.rebuildInstrument(topo, this.wiringEngine);
        AiTopologyFixKit.finalizeForGate(topo, this.wiringEngine, this.buildFinalizeGateOpts(opts, looksRc));
        geoIssues = this.collectGeometricIssues(topo);
        geoHard = this.countGeoBlocking(geoIssues);
        ercErrors = this.collectErc(topo);
        topo.ercErrorList = ercErrors;
      }
      // 电气硬短路再愈合
      let elec = AiTopologyFixKit.auditCriticalElectrical(topo);
      if (elec.length > 0) {
        AiTopologyFixKit.healCriticalElectricalShorts(topo, this.wiringEngine);
        elec = AiTopologyFixKit.auditCriticalElectrical(topo);
      }
      ercHard = this.countPipelineBlocking(ercErrors, opts, topo);
      // 电气审计仍有 → 注入并继续下一轮
      if (elec.length > 0 && ercHard === 0) {
        // heal 后仍短路则保持努力；不提前注入以免假进度
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] FORCE_COMPLETE elec residual=${elec.length}`);
      }
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] FORCE_COMPLETE after assault=${assault}` +
        ` ercBlocking=${ercHard} geoBlocking=${geoHard} fixes=${aiFixApplied}`);
    }

    // 最终兜底：几何必须清零；禁止 demote_all 抹掉全部导线
    if (geoHard > 0) {
      const badFinal = this.collectGeoBadNetUuids(geoIssues);
      if (badFinal.size > 0) {
        this.wiringEngine.demoteNetsToLabelStubs(topo, badFinal);
      }
      AiTopologyFixKit.demotePowerRails(topo, this.wiringEngine);
      AiTopologyFixKit.finalizeForGate(topo, this.wiringEngine, this.buildFinalizeGateOpts(opts, this.activeIntent.seriesRcCharge || this.topoLooksLikeSeriesRc(topo)));
      AiTopologyFixKit.wireOpAmpFeedback(topo, this.wiringEngine);
      AiTopologyFixKit.dropFullyFloatingDevices(topo);
      geoIssues = this.collectGeometricIssues(topo);
      geoHard = this.countGeoBlocking(geoIssues);
      ercErrors = this.collectErc(topo);
      topo.ercErrorList = ercErrors;
      ercHard = this.countPipelineBlocking(ercErrors, opts, topo);
    }
    if (ercHard > 0) {
      AiTopologyFixKit.healCriticalElectricalShorts(topo, this.wiringEngine);
      AiTopologyFixKit.wireOpAmpFeedback(topo, this.wiringEngine);
      AiTopologyFixKit.healFloatingPins(topo, this.wiringEngine);
      AiTopologyFixKit.dropFullyFloatingDevices(topo);
      this.pruneSingletonsPreservingBoundary(topo, opts);
      ercErrors = this.collectErc(topo);
      topo.ercErrorList = ercErrors;
      ercHard = this.countPipelineBlocking(ercErrors, opts, topo);
      geoIssues = this.collectGeometricIssues(topo);
      geoHard = this.countGeoBlocking(geoIssues);
    }

    if (ercHard === 0 && geoHard === 0) {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] FORCE_COMPLETE SUCCESS fixes=${aiFixApplied}`);
    } else {
      Logger.error(INSTR_TRACE_TAG,
        `[AI_PIPE] FORCE_COMPLETE still dirty erc=${ercHard} geo=${geoHard} — keep delivering after max assault`);
    }

    const out: ErcGeoClearResult = {
      topo: topo,
      ercErrors: ercErrors,
      geoIssues: geoIssues,
      ercHard: ercHard,
      geoHard: geoHard,
      aiFixApplied: aiFixApplied,
      usedLlm: usedLlm
    };
    return out;
  }

  /** 从几何 issues 收集需 demote 的 netUuid（含 wire_cross 描述中的两侧） */
  private collectGeoBadNetUuids(geoIssues: ValidationIssue[]): Set<string> {
    const badNets = new Set<string>();
    for (let gi = 0; gi < geoIssues.length; gi++) {
      const g = geoIssues[gi];
      if (g.severity !== 'error') {
        continue;
      }
      if (g.type !== 'wire_body' && g.type !== 'wire_cross' && g.type !== 'pin_proximity') {
        continue;
      }
      if (g.targetUuid && g.targetUuid.length > 0) {
        badNets.add(g.targetUuid);
      }
      // desc: "… net_xxx ↔ net_yyy"
      const desc = g.desc ?? '';
      const arrow = desc.indexOf('↔');
      if (arrow >= 0) {
        const left = desc.substring(0, arrow);
        const right = desc.substring(arrow + 1);
        const grab = (s: string): void => {
          const m = s.match(/net_[A-Za-z0-9_]+/g);
          if (m) {
            for (let i = 0; i < m.length; i++) {
              badNets.add(m[i]);
            }
          }
        };
        grab(left);
        grab(right);
      }
    }
    return badNets;
  }

  private async fetchModularPlanLlm(opts: PipelineOptions): Promise<ModularPlan | null> {
    if (opts.skipLlm) {
      return null;
    }
    const tpl = PromptLoader.load('modular_plan');
    const basePrompt = PromptLoader.renderEnriched(tpl, [
      { key: 'user_prompt', value: opts.prompt }
    ], this.componentLibrary, { includeLibIds: true });
    let critique = '';
    const rounds = 5;
    for (let round = 0; round <= rounds; round++) {
      const roundPrompt = critique.length > 0
        ? `${basePrompt}\n\n【上次整体设计被拒绝 — 必须重出完整 JSON】:\n${critique}`
        : basePrompt;
      const api = await this.chatWithRetry(roundPrompt, AiCapability.COMPONENT_RECOMMEND,
        this.stageChatOpts({ temperature: 0.1 }));
      if (api.success && api.data) {
        const raw = PromptLoader.extractJson<Object>(api.data);
        const parsed0 = normalizeModularPlan(raw);
        if (parsed0) {
          const parsed = healModularPlan(parsed0);
          const issues = critiqueModularPlan(parsed, this.componentLibrary, opts.prompt);
          if (issues.length === 0) {
            return parsed;
          }
          critique = issues.map((s, i) => `${i + 1}. ${s}`).join('\n');
          Logger.warn(INSTR_TRACE_TAG,
            `[AI_PIPE] modular_plan critique reject round=${round + 1}: ${critique}`);
          continue;
        }
      }
      if (round === rounds) {
        break;
      }
    }
    Logger.warn(INSTR_TRACE_TAG,
      '[AI_PIPE] modular_plan residual — refuse parallel (no ABORT to template)');
    return null;
  }

  /** @deprecated 使用 AiErcGateUtil.countBlocking — 含功能影响 warning */
  private static countHardErc(ercErrors: ErcError[]): number {
    return AiErcGateUtil.countBlocking(ercErrors);
  }

  /**
   * 局部小网导线优先：prepareModes → 导线对拉近 → execute 建网。
   */
  private executeNetPlanLabelFirst(topo: SchTopology,
    plan: NetPlanResult): NetPlanExecutionResult {
    NetPlanExecutor.setComponentLibrary(this.componentLibrary);
    NetPlanExecutor.prepareModes(plan);
    const pairs = NetPlanExecutor.collectWiredCompactPairs(plan);
    if (pairs.length > 0) {
      this.placementOptimizer.compactDevicesForWiredNets(topo, pairs, 120);
    }
    return NetPlanExecutor.execute(topo, plan);
  }

  private collectErc(topo: SchTopology): ErcError[] {
    const doc = TopologyAdapter.fromTopology(topo);
    const violations = FaultDiagnoser.diagnose(doc);
    const ercErrors: ErcError[] = [];
    for (let vi = 0; vi < violations.length; vi++) {
      const v = violations[vi];
      let severity: 'error' | 'warning' | 'info' = 'info';
      if (v.severity === ErcSeverity.ERROR) {
        severity = 'error';
      } else if (v.severity === ErcSeverity.WARNING) {
        severity = 'warning';
      }
      ercErrors.push({
        errType: v.ruleType,
        targetUuid: v.componentId ?? v.netId ?? '',
        desc: v.message,
        suggest: v.fixSuggestion ?? '',
        severity: severity
      });
    }
    return ercErrors;
  }

  /**
   * 审计：每个 net 节点应有 stub/导线端点贴近引脚世界坐标；
   * 关键器件（R/C/SW/仪器 CH1+GND）两端须入网。阻断项 errType=PIN_CONNECTIVITY。
   */
  private auditNetPinConnectivity(topo: SchTopology): ErcError[] {
    const out: ErcError[] = [];
    const connected = new Set<string>();
    for (let ni = 0; ni < topo.netList.length; ni++) {
      const net = topo.netList[ni];
      for (let ki = 0; ki < (net.nodeList?.length ?? 0); ki++) {
        const node = net.nodeList[ki];
        connected.add(`${node.devUuid}:${(node.pinId ?? '').toUpperCase()}`);
      }
    }
    for (let di = 0; di < topo.deviceList.length; di++) {
      const d = topo.deviceList[di];
      const lib = (d.libDevId ?? '').toUpperCase();
      const needPins: string[] = [];
      if (lib.startsWith('R_') || lib.startsWith('C_') || lib.startsWith('L_') ||
        lib.startsWith('SW_')) {
        needPins.push('1', '2');
      } else if (lib.indexOf('OSCILLOSCOPE') >= 0) {
        needPins.push('CH1', 'GND');
      } else if (lib.indexOf('VOLTMETER') >= 0 || lib === 'VIRTUAL_METER') {
        needPins.push('V+', 'V', 'COM', '1', '2');
      } else if (lib.indexOf('AMMETER') >= 0) {
        needPins.push('I+', 'I-', '1', '2');
      } else if (lib === 'VCC' || lib === 'GND' || lib === 'VDD' || lib === 'VSS' ||
        lib === 'VEE') {
        // Builtin 用 '1'；语义库用 VCC/VEE/GND — 任一命中即可
        needPins.push('1', lib);
      } else if (lib === 'SIGNAL_GEN') {
        needPins.push('OUT', 'GND');
      } else if (lib.indexOf('RELAY') >= 0) {
        needPins.push('COM', 'NC', 'NO');
      } else if (lib.indexOf('POT') >= 0 || lib.indexOf('POTENTIOMETER') >= 0 ||
        lib.startsWith('RV_')) {
        needPins.push('1', '2', 'W');
      } else if (lib.indexOf('UART') >= 0) {
        needPins.push('TX', 'RX', 'GND');
      } else if (lib.indexOf('STM32') >= 0 || lib.indexOf('AT89') >= 0 ||
        lib.indexOf('STC') >= 0) {
        needPins.push('VDD', 'VSS', 'NRST');
      }
      if (needPins.length === 0) {
        continue;
      }
      let anyHit = false;
      const missing: string[] = [];
      for (let pi = 0; pi < needPins.length; pi++) {
        const p = needPins[pi];
        if (connected.has(`${d.instUuid}:${p}`)) {
          anyHit = true;
        } else {
          // 电压表 V+/V/1 任一同义；电流表同理 — 分组检查
          missing.push(p);
        }
      }
      if (lib.indexOf('VOLTMETER') >= 0 || lib === 'VIRTUAL_METER') {
        const hasSense = connected.has(`${d.instUuid}:V+`) ||
          connected.has(`${d.instUuid}:V`) || connected.has(`${d.instUuid}:1`);
        const hasCom = connected.has(`${d.instUuid}:COM`) ||
          connected.has(`${d.instUuid}:2`);
        if (!hasSense || !hasCom) {
          out.push({
            errType: 'PIN_CONNECTIVITY',
            targetUuid: d.instUuid,
            desc: `电压表 ${d.refName} 测量脚未完整入网`,
            suggest: 'heal_floating 或 rebuild_instrument',
            severity: 'error'
          });
        }
        continue;
      }
      if (lib.indexOf('AMMETER') >= 0) {
        const hasP = connected.has(`${d.instUuid}:I+`) || connected.has(`${d.instUuid}:1`);
        const hasM = connected.has(`${d.instUuid}:I-`) || connected.has(`${d.instUuid}:2`);
        if (!hasP || !hasM) {
          out.push({
            errType: 'PIN_CONNECTIVITY',
            targetUuid: d.instUuid,
            desc: `电流表 ${d.refName} I+/I- 未完整入网`,
            suggest: 'heal_floating 或 rebuild_instrument',
            severity: 'error'
          });
        }
        continue;
      }
      if (lib.indexOf('OSCILLOSCOPE') >= 0) {
        const hasCh = connected.has(`${d.instUuid}:CH1`) || connected.has(`${d.instUuid}:1`);
        const hasG = connected.has(`${d.instUuid}:GND`) || connected.has(`${d.instUuid}:5`);
        if (!hasCh || !hasG) {
          out.push({
            errType: 'PIN_CONNECTIVITY',
            targetUuid: d.instUuid,
            desc: `示波器 ${d.refName} CH1/GND 未完整入网`,
            suggest: 'rebuild_instrument：CH1→信号节点，GND→系统地',
            severity: 'error'
          });
        }
        continue;
      }
      if (lib.indexOf('RELAY') >= 0) {
        const hasCom = connected.has(`${d.instUuid}:COM`);
        const hasNc = connected.has(`${d.instUuid}:NC`);
        const hasNo = connected.has(`${d.instUuid}:NO`);
        const hasCoil1 = connected.has(`${d.instUuid}:1`);
        const hasCoil2 = connected.has(`${d.instUuid}:2`);
        if (this.activeIntent.mutualLedIndicator || this.activeIntent.relayContactTopo) {
          if (!hasCom || !hasNc || !hasNo) {
            out.push({
              errType: 'PIN_CONNECTIVITY',
              targetUuid: d.instUuid,
              desc: `继电器 ${d.refName} COM/NC/NO 未完整入网`,
              suggest: 'wire_relay 或 reconnect_pin 补齐触点网络',
              severity: 'error'
            });
          }
        } else if (hasCoil1 && hasCoil2 && !hasCom && !hasNc && !hasNo) {
          continue;
        } else if (!hasCom || (!hasNc && !hasNo)) {
          out.push({
            errType: 'PIN_CONNECTIVITY',
            targetUuid: d.instUuid,
            desc: `继电器 ${d.refName} 触点未入网（需 COM + NC/NO 之一）`,
            suggest: 'reconnect_pin 或 remove_component（若多余）',
            severity: 'error'
          });
        }
        continue;
      }
      if (lib.indexOf('POT') >= 0 || lib.indexOf('POTENTIOMETER') >= 0 ||
        lib.startsWith('RV_')) {
        const has1 = connected.has(`${d.instUuid}:1`);
        const has2 = connected.has(`${d.instUuid}:2`);
        const hasW = connected.has(`${d.instUuid}:W`) ||
          connected.has(`${d.instUuid}:WIPER`) || connected.has(`${d.instUuid}:3`);
        if (!has1 || !has2 || !hasW) {
          out.push({
            errType: 'PIN_CONNECTIVITY',
            targetUuid: d.instUuid,
            desc: `电位器 ${d.refName} 1/2/Wiper 未完整入网`,
            suggest: 'heal_floating：Wiper 接信号节点',
            severity: 'error'
          });
        }
        continue;
      }
      if (lib.indexOf('UART') >= 0) {
        const hasTx = connected.has(`${d.instUuid}:TX`) || connected.has(`${d.instUuid}:1`);
        const hasRx = connected.has(`${d.instUuid}:RX`) || connected.has(`${d.instUuid}:2`);
        const hasG = connected.has(`${d.instUuid}:GND`) || connected.has(`${d.instUuid}:3`);
        if (!hasG || (!hasTx && !hasRx)) {
          out.push({
            errType: 'PIN_CONNECTIVITY',
            targetUuid: d.instUuid,
            desc: `UART ${d.refName} 信号/地未入网`,
            suggest: '至少 GND + TX 或 RX',
            severity: 'error'
          });
        }
        continue;
      }
      if (lib.indexOf('STM32') >= 0 || lib.indexOf('AT89') >= 0 ||
        lib.indexOf('STC') >= 0) {
        const hasPwr = connected.has(`${d.instUuid}:VDD`) ||
          connected.has(`${d.instUuid}:VCC`) || connected.has(`${d.instUuid}:VSS`) ||
          connected.has(`${d.instUuid}:GND`) || connected.has(`${d.instUuid}:AVDD`);
        if (!hasPwr && !anyHit) {
          out.push({
            errType: 'PIN_CONNECTIVITY',
            targetUuid: d.instUuid,
            desc: `MCU ${d.refName} 电源脚未入网`,
            suggest: '连接 VDD/VSS 或 VCC/GND',
            severity: 'error'
          });
        }
        continue;
      }
      // 两端无源/开关须两脚入网；其余多脚器件不按脚表全量误杀
      if (lib.startsWith('R_') || lib.startsWith('C_') || lib.startsWith('L_') ||
        lib.startsWith('SW_')) {
        const missCritical = needPins.filter(p =>
          !connected.has(`${d.instUuid}:${p}`));
        if (missCritical.length > 0) {
          out.push({
            errType: 'PIN_CONNECTIVITY',
            targetUuid: d.instUuid,
            desc: `${d.refName}(${d.libDevId}) 引脚浮空: ${missCritical.join(',')}`,
            suggest: 'heal_floating / reconnect_pin',
            severity: 'error'
          });
        }
      } else if (lib === 'VCC' || lib === 'GND' || lib === 'VEE' || lib === 'VDD' ||
        lib === 'VSS') {
        const hasPwr = connected.has(`${d.instUuid}:1`) ||
          connected.has(`${d.instUuid}:${lib}`) ||
          (lib === 'VDD' && connected.has(`${d.instUuid}:VCC`)) ||
          (lib === 'VSS' && connected.has(`${d.instUuid}:GND`));
        if (!hasPwr) {
          out.push({
            errType: 'PIN_CONNECTIVITY',
            targetUuid: d.instUuid,
            desc: `${d.refName}(${d.libDevId}) 未入网`,
            suggest: 'heal_floating',
            severity: 'error'
          });
        }
      } else if (lib === 'SIGNAL_GEN' && !anyHit && missing.length > 0) {
        out.push({
          errType: 'PIN_CONNECTIVITY',
          targetUuid: d.instUuid,
          desc: `${d.refName}(${d.libDevId}) 未入网`,
          suggest: 'heal_floating',
          severity: 'error'
        });
      }
    }
    // 单脚网络（非电源符号）— warning，由 prune 清理，不挡门禁
    for (let ni = 0; ni < topo.netList.length; ni++) {
      const net = topo.netList[ni];
      const n = net.nodeList?.length ?? 0;
      if (n === 1) {
        const name = (net.netName ?? '').toUpperCase();
        if (name === 'VCC' || name === 'GND' || name === 'VEE' || name === 'VDD' ||
          name === 'VSS') {
          continue;
        }
        out.push({
          errType: 'PIN_CONNECTIVITY',
          targetUuid: net.netUuid,
          desc: `网络 ${net.netName} 仅 1 个节点 — 开路`,
          suggest: 'prune_singleton / reconnect_pin',
          severity: 'warning'
        });
      }
    }
    return out;
  }

  /** self_review LLM 不可用时：由 ERC/几何确定性生成 fixActions */
  private buildDeterministicReviewFixes(topo: SchTopology, ercErrors: ErcError[],
    geoIssues: ValidationIssue[]): AiSelfReviewResult {
    const issues: AiReviewIssue[] = [];
    let needRebuild = false;
    let needHeal = false;
    let needSplit = false;
    let needDemoteAll = false;
    const demoteNets = new Set<string>();

    // 互斥双色缺继电器 → 先 add_component（意图或双色 LED 启发式）
    const hasRelay = topo.deviceList.some(d =>
      d.libDevId === 'RELAY_SPDT' || (d.libDevId ?? '').toUpperCase().indexOf('RELAY') >= 0);
    const hasLedRed = topo.deviceList.some(d => (d.libDevId ?? '').toUpperCase().indexOf('LED_RED') >= 0);
    const hasLedGreen = topo.deviceList.some(d =>
      (d.libDevId ?? '').toUpperCase().indexOf('LED_GREEN') >= 0);
    const looksMutual = this.activeIntent.mutualLedIndicator ||
      (hasLedRed && hasLedGreen && !this.activeIntent.seriesRcCharge);
    if (looksMutual && !hasRelay) {
      issues.push({
        type: 'component_value',
        severity: 'error',
        desc: '互斥双色缺 RELAY_SPDT — 确定性补加',
        targetDevice: '',
        fixAction: 'add_component',
        fixDetail: { libDevId: 'RELAY_SPDT', refName: 'K1', x: 700, y: 300 }
      });
    }
    // 双 LED 仅 1 颗 R → 补限流电阻
    if (looksMutual) {
      const ledN = topo.deviceList.filter(d =>
        (d.libDevId ?? '').toUpperCase().startsWith('LED_')).length;
      const rN = topo.deviceList.filter(d =>
        (d.libDevId ?? '').startsWith('R_')).length;
      if (ledN >= 2 && rN < ledN) {
        issues.push({
          type: 'component_value',
          severity: 'error',
          desc: `双色 LED 缺限流电阻（有 ${rN} 需 ${ledN}）— 确定性补加 R_330`,
          targetDevice: '',
          fixAction: 'add_component',
          fixDetail: { libDevId: 'R_330', refName: `R${rN + 1}`, x: 640, y: 260 }
        });
      }
    }
    // 任意 LED 缺共网限流 → 补 R_330
    const ledList = topo.deviceList.filter(d =>
      (d.libDevId ?? '').toUpperCase().indexOf('LED') >= 0);
    for (let li = 0; li < ledList.length; li++) {
      const led = ledList[li];
      let hasR = false;
      for (let ni = 0; ni < topo.netList.length && !hasR; ni++) {
        const net = topo.netList[ni];
        const onLed = net.nodeList.some(n => n.devUuid === led.instUuid);
        if (!onLed) {
          continue;
        }
        for (let ki = 0; ki < net.nodeList.length; ki++) {
          const o = topo.deviceList.find(x => x.instUuid === net.nodeList[ki].devUuid);
          if (o && (o.libDevId ?? '').startsWith('R_')) {
            hasR = true;
            break;
          }
        }
      }
      if (!hasR) {
        issues.push({
          type: 'component_value',
          severity: 'error',
          desc: `LED ${led.refName} 缺少限流电阻 — 确定性补加 R_330`,
          targetDevice: led.refName,
          fixAction: 'add_component',
          fixDetail: {
            libDevId: 'R_330',
            refName: `R_LED_${led.refName}`,
            x: led.x + 80,
            y: led.y
          }
        });
      }
    }

    for (let i = 0; i < ercErrors.length; i++) {
      const e = ercErrors[i];
      if (e.severity !== 'error' && e.severity !== 'warning') {
        continue;
      }
      const desc = (e.desc ?? '').toUpperCase();
      const typ = (e.errType ?? '').toUpperCase();
      if (desc.indexOf('短路') >= 0 ||
        (desc.indexOf('VCC') >= 0 && desc.indexOf('GND') >= 0 && desc.indexOf('同') >= 0)) {
        needSplit = true;
      }
      if (typ.indexOf('UNCONNECTED') >= 0 || typ === 'PIN_CONNECTIVITY' ||
        desc.indexOf('浮空') >= 0 || desc.indexOf('未入网') >= 0 ||
        desc.indexOf('未连接') >= 0) {
        needHeal = true;
      }
      if (desc.indexOf('示波器') >= 0 || desc.indexOf('电流表') >= 0 ||
        desc.indexOf('电压表') >= 0 || desc.indexOf('仪器') >= 0 ||
        desc.indexOf('OSC') >= 0) {
        needRebuild = true;
      }
    }
    let geoErrN = 0;
    for (let gi = 0; gi < geoIssues.length; gi++) {
      const g = geoIssues[gi];
      if (g.severity !== 'error') {
        continue;
      }
      geoErrN++;
      if (g.type === 'wire_cross' || g.type === 'wire_body' || g.type === 'pin_proximity') {
        if (g.targetUuid && g.targetUuid.length > 0) {
          const net = topo.netList.find(n => n.netUuid === g.targetUuid);
          if (net) {
            const nm = net.netName ?? '';
            if (nm.length > 0) {
              demoteNets.add(nm);
            }
          }
        }
      }
    }
    if (geoErrN >= 4) {
      needDemoteAll = true;
    }
    if (needSplit) {
      issues.push({
        type: 'net_integrity',
        severity: 'error',
        desc: '电源轨短路 — 确定性拆分',
        targetDevice: '',
        fixAction: 'split_power_short'
      });
    }
    if (this.topoWants555Monostable(topo)) {
      issues.push({
        type: 'net_integrity',
        severity: 'error',
        desc: '555 单稳态 — 确定性 wire_555_monostable',
        targetDevice: '',
        fixAction: 'wire_555_monostable'
      });
    } else if (this.wantsOpAmpSelfOsc(topo)) {
      issues.push({
        type: 'net_integrity',
        severity: 'error',
        desc: '运放自激 — 确定性 wire_opamp_self_osc',
        targetDevice: '',
        fixAction: 'wire_opamp_self_osc'
      });
    } else if (this.topoLooksLikeSeriesRc(topo)) {
      issues.push({
        type: 'net_integrity',
        severity: 'error',
        desc: '串联 RC — 确定性 wire_series_rc',
        targetDevice: '',
        fixAction: 'wire_series_rc'
      });
    }
    const hasPot = topo.deviceList.some(d => {
      const u = (d.libDevId ?? '').toUpperCase();
      return u.indexOf('POT') >= 0 || u.indexOf('POTENTIOMETER') >= 0 || u.startsWith('RV_');
    });
    if (hasPot) {
      issues.push({
        type: 'net_integrity',
        severity: 'error',
        desc: '电位器分压 — 确定性 wire_potentiometer',
        targetDevice: '',
        fixAction: 'wire_potentiometer'
      });
    }
    if (hasRelay && looksMutual) {
      issues.push({
        type: 'net_integrity',
        severity: 'error',
        desc: 'RELAY 互斥双色 — 确定性 wire_relay',
        targetDevice: '',
        fixAction: 'wire_relay'
      });
    }
    // electrical_short → 先确定性 heal
    const hasElecShort = ercErrors.some(e =>
      (e.errType ?? '').toLowerCase().indexOf('electrical') >= 0 ||
      ((e.desc ?? '').indexOf('短路') >= 0));
    if (hasElecShort || needSplit) {
      issues.push({
        type: 'net_integrity',
        severity: 'error',
        desc: '电气短路 — 确定性 heal_electrical',
        targetDevice: '',
        fixAction: 'heal_electrical'
      });
    }
    if (needRebuild) {
      issues.push({
        type: 'instrument_topo',
        severity: 'error',
        desc: '仪器/浮空拓扑 — 确定性 rebuild_instrument',
        targetDevice: '',
        fixAction: 'rebuild_instrument'
      });
    } else if (needHeal) {
      issues.push({
        type: 'floating_pin',
        severity: 'error',
        desc: '浮空引脚 — 确定性 heal_floating',
        targetDevice: '',
        fixAction: 'heal_floating'
      });
    }
    if (needDemoteAll) {
      if (this.wantsOpAmpSelfOsc(topo)) {
        issues.push({
          type: 'net_integrity',
          severity: 'error',
          desc: '几何阻断过多但自激场景 — wire_opamp_self_osc（禁止 demote_all 抹掉 WAR）',
          targetDevice: '',
          fixAction: 'wire_opamp_self_osc'
        });
        issues.push({
          type: 'wire_layout',
          severity: 'error',
          desc: '自激几何残留 — demote_geo_nets（保留局部导线）',
          targetDevice: '',
          fixAction: 'demote_geo_nets'
        });
      } else {
        // 禁止 nuclear demote_all：会抹掉全部 WAR 导线导致「整图只剩标号」
        issues.push({
          type: 'wire_layout',
          severity: 'error',
          desc: '几何阻断过多 — demote_geo_nets（保留局部导线）',
          targetDevice: '',
          fixAction: 'demote_geo_nets'
        });
        issues.push({
          type: 'wire_layout',
          severity: 'error',
          desc: '电源扇出 — demote_power_rails',
          targetDevice: '',
          fixAction: 'demote_power_rails'
        });
      }
    } else {
      const demoteArr = Array.from(demoteNets).filter(n => n.length > 0).slice(0, 4);
      for (let di = 0; di < demoteArr.length; di++) {
        issues.push({
          type: 'wire_layout',
          severity: 'error',
          desc: `几何冲突网 ${demoteArr[di]} → 标号`,
          targetDevice: '',
          fixAction: 'demote_to_label',
          fixDetail: { netName: demoteArr[di] }
        });
      }
    }
    // 纯几何残留：优先一次性 demote_geo_nets
    if (issues.length === 0 && geoErrN > 0) {
      issues.push({
        type: 'wire_layout',
        severity: 'error',
        desc: '几何残留 — demote_geo_nets',
        targetDevice: '',
        fixAction: 'demote_geo_nets',
        fixDetail: { reason: 'deterministic geo residual' }
      });
      issues.push({
        type: 'wire_layout',
        severity: 'error',
        desc: '几何残留 — strip_phantom_pins',
        targetDevice: '',
        fixAction: 'strip_phantom_pins'
      });
    } else if (issues.length === 0 && ercErrors.length > 0) {
      issues.push({
        type: 'floating_pin',
        severity: 'error',
        desc: '残留 ERC — heal_floating',
        targetDevice: '',
        fixAction: 'heal_floating'
      });
    }
    return {
      passed: issues.length === 0,
      issues: issues,
      summary: `deterministic fallback issues=${issues.length}`
    };
  }

  // ─── AI 驱动布局: LLM 坐标 → 器件实例 ───

  private applyAiPositions(devices: MatchedDevice[],
    positions: LayoutPositionItem[],
    lockedUuids: string[], partialTopo?: SchTopology): PlacementResult {
    const topo: SchTopology = {
      schUuid: IdUtil.generate('sch'),
      schName: 'AI Generated',
      layerDepth: 1,
      deviceList: [],
      netList: [],
      busList: [],
      wireList: [],
      subCircuitList: [],
      probeList: [],
      textAnnotate: [],
      netLabelList: [],
      ercErrorList: [],
      gridStep: 20,
      bgColor: '#FFFFFF'
    };
    // 先复制锁定器件（编辑模式保留 instUuid）
    const lockedPool = new Map<string, DeviceInst[]>();
    if (partialTopo) {
      for (const d of partialTopo.deviceList) {
        if (lockedUuids.includes(d.instUuid)) {
          topo.deviceList.push(d);
          const pool = lockedPool.get(d.libDevId) ?? [];
          pool.push(d);
          lockedPool.set(d.libDevId, pool);
        }
      }
    }
    // 队列消费坐标：同 libDevId 多实例不得 Map 覆盖（曾导致两颗 R_330 叠在同一点）
    const posQueues = new Map<string, DevicePosition[]>();
    for (const p of positions) {
      const dp: DevicePosition = { x: p.x, y: p.y, rotate: p.rotate ?? 0 };
      const list = posQueues.get(p.deviceId) ?? [];
      list.push(dp);
      posQueues.set(p.deviceId, list);
    }
    const usedRefs = new Set<string>();
    for (const d of topo.deviceList) {
      usedRefs.add(d.refName);
    }
    const occupied = new Set<string>();
    for (const d of topo.deviceList) {
      occupied.add(`${Math.round(d.x)},${Math.round(d.y)}`);
    }
    const reused = new Set<string>();
    for (let i = 0; i < devices.length; i++) {
      const dev = devices[i];
      const pos = this.takeQueuedPosition(posQueues, dev.name, dev.libDevId);
      let x = pos?.x ?? (200 + i * 80);
      let y = pos?.y ?? (200 + (i % 4) * 100);
      const rotate = pos?.rotate ?? 0;
      // 编辑模式：优先复用同型号未占用的锁定实例，避免整图复制
      const pool = lockedPool.get(dev.libDevId) ?? [];
      let reusedInst: DeviceInst | null = null;
      for (let pi = 0; pi < pool.length; pi++) {
        if (!reused.has(pool[pi].instUuid)) {
          reusedInst = pool[pi];
          reused.add(pool[pi].instUuid);
          break;
        }
      }
      if (reusedInst) {
        reusedInst.x = x;
        reusedInst.y = y;
        reusedInst.rotate = rotate;
        occupied.add(`${Math.round(x)},${Math.round(y)}`);
        continue;
      }
      // 同坐标避让：第二颗同型号器件至少错开一格
      let key = `${Math.round(x)},${Math.round(y)}`;
      let bump = 0;
      while (occupied.has(key) && bump < 20) {
        bump++;
        y += 80;
        key = `${Math.round(x)},${Math.round(y)}`;
      }
      occupied.add(key);
      const refName = this.allocUniqueRefName(dev.libDevId, usedRefs);
      const inst = makeDeviceInst(
        IdUtil.generate('inst'),
        dev.libDevId,
        refName,
        x, y, rotate,
        dev.params
      );
      topo.deviceList.push(inst);
    }
    const emptyPositions: Record<string, DevicePosition> = {};
    const candidate: PlacementCandidate = {
      devicePositions: emptyPositions,
      fitnessScore: 1.0
    };
    const result: PlacementResult = { topology: topo, candidates: [candidate], selectedIndex: 0 };
    return result;
  }

  /** 按 name / libDevId / 位号前缀依次弹出坐标，支持同 ID 多实例与 LLM 用 R1/OSC1 */
  private takeQueuedPosition(queues: Map<string, DevicePosition[]>,
    name: string, libDevId: string): DevicePosition | null {
    const keys = [name, libDevId];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (!k || k.length === 0) {
        continue;
      }
      const q = queues.get(k);
      if (q !== undefined && q.length > 0) {
        return q.shift() as DevicePosition;
      }
    }
    // LLM 常用位号作 deviceId（R1/C1/OSC1）——按库型号前缀匹配
    const entries = Array.from(queues.entries());
    for (let ei = 0; ei < entries.length; ei++) {
      const k = entries[ei][0];
      const q = entries[ei][1];
      if (!q || q.length === 0) {
        continue;
      }
      if (this.refDesMatchesLib(k, libDevId, name)) {
        return q.shift() as DevicePosition;
      }
    }
    return null;
  }

  /** deviceId/refDes 是否可映射到该库型号（R1↔R_330, OSC1↔OSCILLOSCOPE） */
  private refDesMatchesLib(deviceId: string, libDevId: string, name?: string): boolean {
    const id = (deviceId ?? '').toUpperCase().trim();
    const lib = (libDevId ?? '').toUpperCase();
    const nm = (name ?? '').toUpperCase();
    if (id.length === 0) {
      return false;
    }
    if (id === lib || (nm.length > 0 && id === nm)) {
      return true;
    }
    if (lib.startsWith('R_') && /^R\d+$/.test(id)) {
      return true;
    }
    if (lib.startsWith('C_') && /^C\d+$/.test(id)) {
      return true;
    }
    if (lib.startsWith('L_') && /^L\d+$/.test(id)) {
      return true;
    }
    if (lib.startsWith('SW_') && /^SW\d+$/.test(id)) {
      return true;
    }
    if ((lib.startsWith('LED_') || lib.indexOf('DIODE') >= 0) && /^D\d+$/.test(id)) {
      return true;
    }
    if (lib.indexOf('OSCILLOSCOPE') >= 0 && /^OSC\d*$/.test(id)) {
      return true;
    }
    if (lib.indexOf('VOLTMETER') >= 0 && /^VM\d*$/.test(id)) {
      return true;
    }
    if (lib.indexOf('AMMETER') >= 0 && /^AM\d*$/.test(id)) {
      return true;
    }
    if ((lib === 'VCC' || lib === 'GND' || lib === 'VDD' || lib === 'VSS') && id === lib) {
      return true;
    }
    return false;
  }

  /** 唯一位号: R1/R2、D1/D2、SW1… — 避免两颗电阻都叫 "Resistor 330Ω" */
  private allocUniqueRefName(libDevId: string, used: Set<string>): string {
    const safeId = libDevId ?? '';
    const id = safeId.toUpperCase();
    if ((safeId === 'VCC' || safeId === 'GND') && !used.has(safeId)) {
      used.add(safeId);
      return safeId;
    }
    let prefix = 'U';
    if (safeId.startsWith('R_')) {
      prefix = 'R';
    } else if (safeId.startsWith('C_')) {
      prefix = 'C';
    } else if (id.startsWith('LED_') || id.includes('DIODE') || id.startsWith('1N')) {
      prefix = 'D';
    } else if (id.includes('RELAY')) {
      prefix = 'K';
    } else if (id.startsWith('SW_')) {
      prefix = 'SW';
    } else if (id.includes('OSCILLOSCOPE')) {
      prefix = 'OSC';
    } else if (id.includes('AMMETER') || id.includes('VOLTMETER') ||
      id.includes('UART') || id.includes('LOGIC_ANALYZER') || id.includes('FREQ')) {
      prefix = 'M';
    } else if (id.includes('STM32') || id.includes('AT89') || id.includes('STC') ||
      id.includes('LM555') || id.includes('555')) {
      prefix = 'U';
    } else if (safeId === 'VCC') {
      prefix = 'VCC';
    } else if (safeId === 'GND') {
      prefix = 'GND';
    }
    let n = 1;
    let ref = `${prefix}${n}`;
    while (used.has(ref)) {
      n++;
      ref = `${prefix}${n}`;
    }
    used.add(ref);
    return ref;
  }

  // ─── 几何碰撞检测 (函数: 确定性几何计算) ───

  private collectGeometricIssues(topo: SchTopology): ValidationIssue[] {
    const validator = this.getPostGen();
    const allIssues = validator.collectIssues(topo);
    const geoIssues: ValidationIssue[] = [];
    for (const iss of allIssues) {
      if (iss.type === 'wire_body' || iss.type === 'wire_cross' || iss.type === 'pin_proximity') {
        geoIssues.push(iss);
      }
    }
    return geoIssues;
  }

  /** 几何阻断：仅 error 级穿选中区/碰无关脚/跨网重叠（拥挤 warning 不挡门禁） */
  private countGeoBlocking(issues: ValidationIssue[]): number {
    let n = 0;
    for (let i = 0; i < issues.length; i++) {
      if (issues[i].severity === 'error') {
        n++;
      }
    }
    return n;
  }

  /** 几何阻断指纹：用于 clear-loop 检测 demote 假进度 */
  private buildGeoBlockingFingerprint(issues: ValidationIssue[]): string {
    const parts: string[] = [];
    for (let i = 0; i < issues.length; i++) {
      const g = issues[i];
      if (g.severity !== 'error') {
        continue;
      }
      if (g.type !== 'wire_body' && g.type !== 'wire_cross' && g.type !== 'pin_proximity') {
        continue;
      }
      // 去掉动态 netUuid 数字噪声，保留 type+网名提示
      const desc = (g.desc ?? '').replace(/net_\d+/g, 'net_*').substring(0, 96);
      parts.push(`${g.type}|${desc}`);
    }
    parts.sort();
    return parts.join(';;');
  }

  /** 连线拥挤检测: 50mil网格, 统计每格导线数, >4条不同网络→拥挤 */
  private collectCongestionIssues(topo: SchTopology): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const CELL = 50;
    const cellMap = new Map<string, Set<string>>();

    for (const wire of topo.wireList) {
      const touched = new Set<string>();
      for (const pt of wire.points) {
        const key = `${Math.floor(pt.x / CELL)},${Math.floor(pt.y / CELL)}`;
        if (touched.has(key)) continue;
        touched.add(key);
        let nets = cellMap.get(key);
        if (!nets) {
          nets = new Set<string>();
          cellMap.set(key, nets);
        }
        nets.add(wire.netUuid);
      }
    }

    cellMap.forEach((netSet, key) => {
      if (netSet.size > 4) {
        const parts = key.split(',');
        const cx = Number(parts[0]) * CELL;
        const cy = Number(parts[1]) * CELL;
        const netNames: string[] = [];
        netSet.forEach(n => netNames.push(n));
        issues.push({
          type: 'wire_cross',
          severity: 'warning',
          desc: `连线拥挤: 格(${cx},${cy}) ${netSet.size}条不同网络导线汇聚 → 建议LLM考虑使用 joinByLabel 标号替代`,
          targetUuid: netNames[0]
        });
      }
    });
    return issues;
  }

  // ─── AI 自检审查 (LLM 决策: 检查拓扑并输出修复方案) ───

  private async fetchSelfReviewLlm(topo: SchTopology, ercErrors: ErcError[],
    geoIssues: ValidationIssue[], opts: PipelineOptions):
    Promise<LlmFetchResult<AiSelfReviewResult>> {
    if (opts.skipLlm) {
      const empty: AiSelfReviewResult = { passed: true, issues: [], summary: 'skipLlm' };
      return { output: empty, fromLlm: false };
    }

    const tpl = PromptLoader.load('self_review');
    const vars = this.buildSelfReviewVars(topo, ercErrors, geoIssues, opts);
    const prompt = PromptLoader.renderEnriched(tpl, vars, this.componentLibrary,
      { includeLibIds: true });

    const api = await this.chatWithRetry(prompt, AiCapability.COMPONENT_RECOMMEND,
      this.stageChatOpts({
        temperature: AiPipelineOrchestrator.temperatureForStage('self_review'),
        maxTokens: AiPipelineOrchestrator.maxTokensForStage('self_review')
      }));
    if (!api.success || !api.data) {
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] self_review LLM failed: ${api.error ?? 'no response'}`);
      const fallback: AiSelfReviewResult = {
        passed: ercErrors.length === 0 && geoIssues.length === 0,
        issues: [],
        summary: 'LLM不可用, 仅进行了ERC+几何检测'
      };
      return { output: fallback, fromLlm: false };
    }

    const raw = PromptLoader.extractJson<AiSelfReviewResult>(api.data);
    if (!raw) {
      Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] self_review JSON parse failed');
      const fallback: AiSelfReviewResult = {
        passed: ercErrors.length === 0 && geoIssues.length === 0,
        issues: [],
        summary: 'JSON解析失败'
      };
      return { output: fallback, fromLlm: false };
    }

    // 规范化 + 纠错工具选择（几何≠rebuild_instrument）
    const rawIssues: AiReviewIssue[] =
      Array.isArray(raw.issues) ? raw.issues as AiReviewIssue[] : [];
    const result: AiSelfReviewResult = {
      passed: raw.passed !== undefined ? raw.passed : rawIssues.length === 0,
      issues: this.sanitizeReviewFixActions(rawIssues, topo),
      summary: raw.summary ?? ''
    };
    try {
      traceAiPayload('AI_PIPE', 'SELF_REVIEW_JSON', JSON.stringify(result),
        `passed=${result.passed} issues=${result.issues.length}`);
    } catch (_e) {
      // ignore
    }
    return { output: result, fromLlm: true };
  }

  /**
   * 按问题类型纠错 fixAction：布线/几何只能用 demote/reroute/join，
   * 禁止对纯几何问题选 rebuild_instrument / heal / 拓扑 kit。
   */
  private sanitizeReviewFixActions(issues: AiReviewIssue[],
    topo: SchTopology): AiReviewIssue[] {
    const out: AiReviewIssue[] = [];
    for (let i = 0; i < issues.length; i++) {
      const iss = issues[i];
      const rawAction = (iss.fixAction ?? '').trim().toLowerCase();
      const canonical = canonicalizeFixAction(rawAction);
      if (canonical.length === 0) {
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_FIX] tool_select drop unknown fixAction=${iss.fixAction} type=${iss.type}`);
        continue;
      }
      if (canonical === 'none') {
        continue;
      }
      // 规范名为 canonical，后续逻辑统一
      if (canonical !== rawAction) {
        Logger.info(INSTR_TRACE_TAG,
          `[AI_FIX] tool_select canonicalize ${rawAction}→${canonical}`);
      }
      iss.fixAction = canonical;
      const action = canonical;
      const typ = (iss.type ?? '').toLowerCase();
      const desc = iss.desc ?? '';
      const descU = desc.toUpperCase();

      // 必填字段：缺则尽量补；仍缺则降级/丢弃
      const def = findFixActionDef(action);
      if (def && def.requireFields.length > 0) {
        const need = def.requireFields.split(',');
        let missing = false;
        for (let ni = 0; ni < need.length; ni++) {
          const f = need[ni].trim();
          if (f === 'refName') {
            const ref = iss.fixDetail?.refName ?? iss.targetDevice ?? '';
            if (ref.length === 0) {
              missing = true;
            } else if (!iss.fixDetail) {
              iss.fixDetail = { refName: ref };
            } else if (!(iss.fixDetail.refName ?? '').length) {
              iss.fixDetail.refName = ref;
            }
          } else if (f === 'netName') {
            const nn = iss.fixDetail?.netName ?? iss.fixDetail?.toNet ?? '';
            if (nn.length === 0) {
              // 交给后面 demote 补网名逻辑
            }
          } else if (f === 'pinId') {
            if (!(iss.fixDetail?.pinId ?? '').length) {
              missing = true;
            }
          } else if (f === 'libDevId') {
            if (!(iss.fixDetail?.libDevId ?? '').length) {
              missing = true;
            }
          } else if (f === 'paramKey' || f === 'paramValue') {
            if (!(iss.fixDetail?.paramKey ?? '').length ||
              !(iss.fixDetail?.paramValue ?? '').length) {
              missing = true;
            }
          }
        }
        if (missing && (action === 'add_component' || action === 'change_param' ||
          action === 'disconnect_pin' || action === 'reconnect_pin')) {
          Logger.warn(INSTR_TRACE_TAG,
            `[AI_FIX] tool_select drop ${action} missing fixDetail fields`);
          continue;
        }
      }

      const isInstrument = typ === 'instrument_topo' ||
        desc.indexOf('示波器') >= 0 || desc.indexOf('电流表') >= 0 ||
        desc.indexOf('电压表') >= 0 || desc.indexOf('仪器') >= 0 ||
        descU.indexOf('OSC') >= 0;
      const isUnusedOscCh = desc.indexOf('未用') >= 0 || desc.indexOf('未使用') >= 0 ||
        (descU.indexOf('CH3') >= 0 && descU.indexOf('CH4') >= 0) ||
        (descU.indexOf('NC') >= 0 && descU.indexOf('CH') >= 0);
      // 未用通道互连：禁止 rebuild_instrument 空转，改 prune_unused_osc_channels
      if (isUnusedOscCh && (action === 'rebuild_instrument')) {
        Logger.info(INSTR_TRACE_TAG,
          '[AI_FIX] tool_select remap rebuild→prune_unused_osc_channels');
        out.push({
          type: 'instrument_topo',
          severity: iss.severity,
          desc: iss.desc,
          targetDevice: iss.targetDevice,
          fixAction: 'prune_unused_osc_channels',
          fixDetail: { reason: 'unused OSC CH → prune NC bridge' }
        });
        continue;
      }
      const isGeo = typ === 'wire_layout' ||
        desc.indexOf('选中区') >= 0 || desc.indexOf('安全间距') >= 0 ||
        desc.indexOf('穿') >= 0 || desc.indexOf('重叠') >= 0 ||
        desc.indexOf('碰无关') >= 0 || desc.indexOf('贴近') >= 0 ||
        descU.indexOf('WIRE_BODY') >= 0 || descU.indexOf('PIN_PROXIMITY') >= 0 ||
        descU.indexOf('WIRE_CROSS') >= 0;

      const geoOk = action === 'demote_to_label' ||
        action === 'demote_all_labels' ||
        action === 'join_by_label' || action === 'reroute' ||
        action === 'demote_geo_nets' || action === 'demote_power_rails' ||
        action === 'move_device' || action === 'nudge_device' || action === 'rotate_device' ||
        action === 'strip_phantom_pins';
      // 纯几何多网：优先 demote_geo_nets
      if (isGeo && !isInstrument &&
        (action === 'rebuild_instrument' || action === 'heal_floating' ||
          action === 'wire_series_rc' || action === 'wire_relay')) {
        Logger.info(INSTR_TRACE_TAG,
          `[AI_FIX] tool_select remap ${action}→demote_geo_nets (geo≠topo)`);
        const remapped: AiReviewIssue = {
          type: 'wire_layout',
          severity: iss.severity,
          desc: iss.desc,
          targetDevice: iss.targetDevice,
          fixAction: 'demote_geo_nets',
          fixDetail: {
            reason: `remap ${action}→demote_geo_nets (geo≠topo)`
          }
        };
        out.push(remapped);
        continue;
      }
      // 纯几何：强制几何工具
      if (isGeo && !isInstrument && !geoOk) {
        const netName = this.extractFixNetName(iss, topo);
        const detail = this.cloneFixDetail(iss.fixDetail);
        if (netName.length > 0) {
          detail.netName = netName;
        }
        detail.reason = `remap ${action}→${netName.length > 0 ? 'demote_to_label' : 'demote_geo_nets'} (geo≠topo)`;
        const remapped: AiReviewIssue = {
          type: 'wire_layout',
          severity: iss.severity,
          desc: iss.desc,
          targetDevice: iss.targetDevice,
          fixAction: netName.length > 0 ? 'demote_to_label' : 'demote_geo_nets',
          fixDetail: detail
        };
        Logger.info(INSTR_TRACE_TAG,
          `[AI_FIX] tool_select remap ${action}→${remapped.fixAction}` +
          ` net=${netName || '-'} type=${typ}`);
        out.push(remapped);
        continue;
      }

      // RC / 互斥意图纠错：选错拓扑 kit
      if ((action === 'wire_relay') &&
        (this.activeIntent.seriesRcCharge || this.topoLooksLikeSeriesRc(topo)) &&
        !this.activeIntent.mutualLedIndicator) {
        Logger.info(INSTR_TRACE_TAG,
          '[AI_FIX] tool_select remap wire_relay→wire_series_rc (RC intent)');
        const detail = this.cloneFixDetail(iss.fixDetail);
        detail.reason = 'remap wire_relay→wire_series_rc';
        out.push({
          type: iss.type,
          severity: iss.severity,
          desc: iss.desc,
          targetDevice: iss.targetDevice,
          fixAction: 'wire_series_rc',
          fixDetail: detail
        });
        continue;
      }
      // 555 单稳态：禁止 wire_series_rc 误伤
      if ((action === 'wire_series_rc') &&
        this.topoWants555Monostable(topo)) {
        Logger.info(INSTR_TRACE_TAG,
          '[AI_FIX] tool_select remap wire_series_rc→wire_555_monostable');
        const detail = this.cloneFixDetail(iss.fixDetail);
        detail.reason = 'remap wire_series_rc→wire_555_monostable';
        out.push({
          type: iss.type,
          severity: iss.severity,
          desc: iss.desc,
          targetDevice: iss.targetDevice,
          fixAction: 'wire_555_monostable',
          fixDetail: detail
        });
        continue;
      }
      if ((action === 'wire_series_rc') &&
        (AiTopologyFixKit.topoHas555(topo) || this.activeIntent.timer555Astable)) {
        Logger.info(INSTR_TRACE_TAG,
          '[AI_FIX] tool_select drop wire_series_rc — 555 present');
        continue;
      }
      if ((action === 'wire_series_rc') &&
        this.activeIntent.mutualLedIndicator) {
        Logger.info(INSTR_TRACE_TAG,
          '[AI_FIX] tool_select remap wire_series_rc→wire_relay (mutual LED)');
        const detail = this.cloneFixDetail(iss.fixDetail);
        detail.reason = 'remap wire_series_rc→wire_relay';
        out.push({
          type: iss.type,
          severity: iss.severity,
          desc: iss.desc,
          targetDevice: iss.targetDevice,
          fixAction: 'wire_relay',
          fixDetail: detail
        });
        continue;
      }
      // 运放自激：禁止 wire_series_rc / demote_all 误伤
      if ((action === 'wire_series_rc') && this.wantsOpAmpSelfOsc(topo)) {
        Logger.info(INSTR_TRACE_TAG,
          '[AI_FIX] tool_select remap wire_series_rc→wire_opamp_self_osc');
        const detail = this.cloneFixDetail(iss.fixDetail);
        detail.reason = 'remap wire_series_rc→wire_opamp_self_osc';
        out.push({
          type: iss.type,
          severity: iss.severity,
          desc: iss.desc,
          targetDevice: iss.targetDevice,
          fixAction: 'wire_opamp_self_osc',
          fixDetail: detail
        });
        continue;
      }
      if (action === 'demote_all_labels' || action === 'label_all') {
        if (this.wantsOpAmpSelfOsc(topo)) {
          Logger.info(INSTR_TRACE_TAG,
            '[AI_FIX] tool_select remap demote_all→wire_opamp_self_osc (preserve WAR)');
          const detail = this.cloneFixDetail(iss.fixDetail);
          detail.reason = 'remap demote_all→wire_opamp_self_osc';
          out.push({
            type: iss.type,
            severity: iss.severity,
            desc: iss.desc,
            targetDevice: iss.targetDevice,
            fixAction: 'wire_opamp_self_osc',
            fixDetail: detail
          });
          continue;
        }
        // 通用：nuclear 标号 → 仅几何/电源 demote，保留 DUT 导线
        Logger.info(INSTR_TRACE_TAG,
          '[AI_FIX] tool_select remap demote_all→demote_geo_nets (preserve WAR)');
        const detail = this.cloneFixDetail(iss.fixDetail);
        detail.reason = 'remap demote_all→demote_geo_nets';
        out.push({
          type: iss.type,
          severity: iss.severity,
          desc: iss.desc,
          targetDevice: iss.targetDevice,
          fixAction: 'demote_geo_nets',
          fixDetail: detail
        });
        continue;
      }

      // demote 缺网名：尽量补全，否则降为 reroute
      if ((action === 'demote_to_label') &&
        !(iss.fixDetail?.netName ?? iss.fixDetail?.toNet ?? '').length) {
        const netName = this.extractFixNetName(iss, topo);
        if (netName.length > 0) {
          const detail = this.cloneFixDetail(iss.fixDetail);
          detail.netName = netName;
          out.push({
            type: iss.type,
            severity: iss.severity,
            desc: iss.desc,
            targetDevice: iss.targetDevice,
            fixAction: 'demote_to_label',
            fixDetail: detail
          });
          continue;
        }
        Logger.info(INSTR_TRACE_TAG,
          '[AI_FIX] tool_select demote缺网名 → reroute');
        const detail = this.cloneFixDetail(iss.fixDetail);
        detail.reason = 'demote缺网名→reroute';
        out.push({
          type: 'wire_layout',
          severity: iss.severity,
          desc: iss.desc,
          targetDevice: iss.targetDevice,
          fixAction: 'reroute',
          fixDetail: detail
        });
        continue;
      }

      out.push(iss);
    }
    return out;
  }

  private cloneFixDetail(src?: AiFixDetail): AiFixDetail {
    const d: AiFixDetail = {};
    if (!src) {
      return d;
    }
    if (src.libDevId !== undefined) {
      d.libDevId = src.libDevId;
    }
    if (src.refName !== undefined) {
      d.refName = src.refName;
    }
    if (src.x !== undefined) {
      d.x = src.x;
    }
    if (src.y !== undefined) {
      d.y = src.y;
    }
    if (src.paramKey !== undefined) {
      d.paramKey = src.paramKey;
    }
    if (src.paramValue !== undefined) {
      d.paramValue = src.paramValue;
    }
    if (src.reason !== undefined) {
      d.reason = src.reason;
    }
    if (src.netName !== undefined) {
      d.netName = src.netName;
    }
    if (src.pinId !== undefined) {
      d.pinId = src.pinId;
    }
    if (src.fromNet !== undefined) {
      d.fromNet = src.fromNet;
    }
    if (src.toNet !== undefined) {
      d.toNet = src.toNet;
    }
    return d;
  }

  /** 从 fixDetail / desc / 目标器件推断网名 */
  private extractFixNetName(iss: AiReviewIssue, topo: SchTopology): string {
    const d = iss.fixDetail;
    if (d) {
      const n = (d.netName ?? d.toNet ?? '').trim();
      if (n.length > 0) {
        return n;
      }
    }
    const desc = iss.desc ?? '';
    // 「导线 xxx (VCC)」或「网 VCC」
    const paren = desc.match(/\(([A-Za-z][A-Za-z0-9_]*)\)/);
    if (paren && paren[1]) {
      const cand = paren[1];
      if (topo.netList.some(n => (n.netName ?? '') === cand)) {
        return cand;
      }
      // 即使板上暂无此名，常见电源轨也保留
      const u = cand.toUpperCase();
      if (u === 'VCC' || u === 'GND' || u === 'VEE' || u === 'VDD' || u === 'VSS') {
        return cand;
      }
    }
    const named = desc.match(/(?:网|net)\s*[=:]?\s*([A-Za-z][A-Za-z0-9_]*)/i);
    if (named && named[1]) {
      return named[1];
    }
    return '';
  }

  private buildSelfReviewVars(topo: SchTopology, ercErrors: ErcError[],
    geoIssues: ValidationIssue[], opts: PipelineOptions): PromptVarEntry[] {
    // 器件摘要 + 合法脚清单（供 reconnect_pin 禁止幻觉脚名）
    const devLines: string[] = [];
    for (const d of topo.deviceList) {
      let pinHint = '';
      try {
        const comp = this.componentLibrary.getComponent(d.libDevId);
        if (comp.success && comp.data && comp.data.pins && comp.data.pins.length > 0) {
          const ids: string[] = [];
          for (let pi = 0; pi < comp.data.pins.length && ids.length < 12; pi++) {
            const p = comp.data.pins[pi];
            ids.push(`${p.id}${p.name && p.name !== p.id ? `(${p.name})` : ''}`);
          }
          pinHint = ` pins=[${ids.join(',')}]`;
        }
      } catch (_e) {
        // ignore
      }
      devLines.push(
        `  ${d.refName ?? d.libDevId} (${d.libDevId}) @(${Math.round(d.x)},${Math.round(d.y)})${pinHint}`);
    }
    // 网络摘要（含引脚，供 reconnect_pin）
    const netLines: string[] = [];
    for (const n of topo.netList) {
      const pins: string[] = [];
      for (let ki = 0; ki < (n.nodeList?.length ?? 0) && pins.length < 8; ki++) {
        const node = n.nodeList[ki];
        const dev = topo.deviceList.find(d => d.instUuid === node.devUuid);
        const ref = dev?.refName ?? '?';
        pins.push(`${ref}.${node.pinId}`);
      }
      netLines.push(`  ${n.netName}: ${n.nodeList?.length ?? 0} nodes [${pins.join(',')}]`);
    }
    // 导线完整路径覆盖（供 AI 审查穿体/碰脚）
    const wireLines: string[] = [];
    for (const w of topo.wireList) {
      wireLines.push('  ' + DeviceHitGeometry.formatWireCoverage(DeviceHitGeometry.wireCoverage(w)));
    }
    // ERC 摘要
    const ercLines: string[] = [];
    for (const e of ercErrors) {
      ercLines.push(`  [${e.severity}] ${e.errType}: ${e.desc}`);
    }
    // 几何问题摘要
    const geoLines: string[] = [];
    for (const g of geoIssues) {
      geoLines.push(`  [${g.severity}] ${g.type}: ${g.desc}`);
    }
    const combinedIssues = ercLines.concat(geoLines);

    // 位置+密度+选中区+导线路径 (帮助 LLM 避让与 reroute)
    const densityReport = PromptLoader.buildPositionSummary(topo, this.componentLibrary) +
      '\n\n' + PromptLoader.buildWirePathReport(topo);

    // 对话历史
    let historyText = '';
    if (opts.conversationHistory && opts.conversationHistory.length > 0) {
      historyText = '对话历史（前序轮次）：\n' +
        opts.conversationHistory.map(h => `[${h.role}]: ${h.content}`).join('\n') + '\n\n';
    }

    // 选中器件使用手册（AI 全权路径：审查/修复必须遵守，勿用串联 RC 冲掉 555 等）
    const usage = PromptLoader.buildDeviceUsageBlock(
      PromptLoader.libIdsFromTopo(topo), 'full', this.componentLibrary);
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] usage_manual stage=self_review devices=${usage.deviceCount} ` +
      `included=${usage.includedCount} miss=${usage.missIds.length} ` +
      `criticalMiss=${usage.criticalMissIds.length} chars=${usage.charCount}` +
      (usage.missIds.length > 0 ? ` missIds=${usage.missIds.slice(0, 8).join(',')}` : '') +
      (usage.criticalMissIds.length > 0
        ? ` criticalMissIds=${usage.criticalMissIds.slice(0, 8).join(',')}` : ''));
    try {
      traceAiPayload('AI_PIPE', 'USAGE_MANUAL', usage.text,
        `stage=self_review mode=full chars=${usage.charCount}`);
    } catch (_e) {
      // ignore
    }

    return [
      { key: 'conversation_history', value: historyText },
      { key: 'user_prompt', value: opts.prompt },
      { key: 'device_count', value: `${topo.deviceList.length}` },
      { key: 'device_summary', value: devLines.join('\n') },
      { key: 'device_usage', value: usage.text },
      { key: 'net_count', value: `${topo.netList.length}` },
      { key: 'net_summary', value: netLines.join('\n') },
      { key: 'wire_count', value: `${topo.wireList.length}` },
      { key: 'wire_summary', value: wireLines.join('\n') },
      { key: 'erc_count', value: `${ercErrors.length}` },
      { key: 'erc_summary', value: combinedIssues.length > 0 ? combinedIssues.join('\n') : '无ERC违规' },
      { key: 'density_report', value: densityReport }
    ];
  }

  // ─── AI 驱动修复执行 (LLM 决策修复策略, 函数执行具体操作) ───

  private executeAiFixes(topo: SchTopology, issues: AiReviewIssue[],
    opts?: PipelineOptions): AiFixExecResult {
    const missingReg = auditFixActionRegistryCoverage();
    if (missingReg > 0) {
      Logger.error(INSTR_TRACE_TAG,
        `[AI_FIX] FixActionRegistry coverage gap missing=${missingReg}`);
    }
    const seenKeys = new Set<string>();
    const state: AiFixExecState = { fixCount: 0, needReroute: false, needTopoKit: false };
    // 确定性/LLM 出口统一纠错工具选择
    const normalized = this.sanitizeReviewFixActions(issues, topo);

    // 任何一轮修复前先清洗脏 pinId + 拆电源短接（确定性，不依赖 LLM）
    const preSanitize = AiTopologyFixKit.sanitizeTopoPinIds(topo);
    if (preSanitize > 0) {
      state.fixCount += preSanitize;
      state.needReroute = true;
    }
    const prePhantom = AiTopologyFixKit.stripUnknownDevicePinNodes(topo);
    if (prePhantom.fixed > 0) {
      state.fixCount += prePhantom.fixed;
      state.needReroute = true;
    }
    const preOscNc = AiTopologyFixKit.pruneUnusedOscChannelNets(topo);
    if (preOscNc.fixed > 0) {
      state.fixCount += preOscNc.fixed;
      state.needReroute = true;
    }
    const preSplit = AiTopologyFixKit.splitMergedPowerRails(topo);
    if (preSplit.fixed > 0) {
      state.fixCount += preSplit.fixed;
      state.needReroute = true;
    }

    // RC 充放电：先剥离多余 RELAY（避免 wireSeriesRc 被挡住 / 线圈短路）
    if (this.activeIntent.seriesRcCharge) {
      const stripped = this.stripStrayRelaysForSeriesRc(topo);
      if (stripped > 0) {
        state.fixCount += stripped;
        state.needReroute = true;
        state.needTopoKit = true;
      }
    }

    // 修复顺序：拆短路 → 重建仪器 → 删多余 → 加器件 → heal → 重挂 → 标号并网 → demote
    const sorted = normalized.slice().sort((a, b) =>
      AiPipelineOrchestrator.fixActionPriority(a.fixAction) -
      AiPipelineOrchestrator.fixActionPriority(b.fixAction));

    for (const issue of sorted) {
      try {
        this.applyOneAiFix(topo, issue, seenKeys, state, opts);
      } catch (e) {
        const msg = e instanceof Error ? e.message : `${e}`;
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_FIX] skip crashed fixAction=${issue.fixAction} type=${issue.type}: ${msg}`);
      }
    }

    // 若审查提到浮空/网络完整性且尚未 heal，补一轮（纯几何 demote/reroute 不触发）
    const needHeal = normalized.some(i => {
      const t = (i.type ?? '').toLowerCase();
      const a = (i.fixAction ?? '').toLowerCase();
      if (t === 'wire_layout' || a === 'demote_to_label' || a === 'reroute' ||
        a === 'demote_all_labels' || a === 'join_by_label') {
        return false;
      }
      return t.indexOf('float') >= 0 || t.indexOf('net_integrity') >= 0 ||
        t.indexOf('unconnected') >= 0 || a.indexOf('heal') >= 0 ||
        a === 'rebuild_instrument';
    });
    if (needHeal && !seenKeys.has('heal_floating|*')) {
      seenKeys.add('heal_floating|*');
      const h = AiTopologyFixKit.healFloatingPins(topo, this.wiringEngine);
      state.fixCount += h.fixed;
      state.needReroute = state.needReroute || h.needReroute;
    }

    // 确定性拓扑 kit：RC / 互斥继电器（在 heal 后，避免浮空脚抢错网）
    if (this.activeIntent.seriesRcCharge) {
      const stripped2 = this.stripStrayRelaysForSeriesRc(topo);
      if (stripped2 > 0) {
        state.fixCount += stripped2;
        state.needReroute = true;
      }
    }
    if (!seenKeys.has('wire_555_monostable|*') && this.topoWants555Monostable(topo)) {
      seenKeys.add('wire_555_monostable|*');
      const mono = AiTopologyFixKit.wire555Monostable(topo, this.wiringEngine);
      if (mono.fixed > 0) {
        state.fixCount += mono.fixed;
        state.needReroute = true;
        state.needTopoKit = true;
        Logger.info(INSTR_TRACE_TAG,
          `[AI_FIX] auto wire555Monostable fixed=${mono.fixed}`);
      }
    }
    if (!seenKeys.has('wire_series_rc|*') && this.topoLooksLikeSeriesRc(topo)) {
      seenKeys.add('wire_series_rc|*');
      const rc = AiTopologyFixKit.wireSeriesRc(topo, this.wiringEngine);
      if (rc.fixed > 0) {
        state.fixCount += rc.fixed;
        state.needReroute = true;
        state.needTopoKit = true;
        Logger.info(INSTR_TRACE_TAG,
          `[AI_FIX] auto wireSeriesRc fixed=${rc.fixed}`);
      }
    }
    if (!seenKeys.has('wire_potentiometer|*') &&
      topo.deviceList.some(d => {
        const u = (d.libDevId ?? '').toUpperCase();
        return u.indexOf('POT') >= 0 || u.indexOf('POTENTIOMETER') >= 0 || u.startsWith('RV_');
      })) {
      seenKeys.add('wire_potentiometer|*');
      const pot = AiTopologyFixKit.wirePotentiometer(topo, this.wiringEngine);
      if (pot.fixed > 0) {
        state.fixCount += pot.fixed;
        state.needReroute = true;
        state.needTopoKit = true;
        Logger.info(INSTR_TRACE_TAG,
          `[AI_FIX] auto wirePotentiometer fixed=${pot.fixed}`);
      }
    }
    const ledNForRelay = topo.deviceList.filter(d =>
      (d.libDevId ?? '').toUpperCase().startsWith('LED_')).length;
    if (!seenKeys.has('wire_relay|*') &&
      !this.activeIntent.seriesRcCharge &&
      (this.activeIntent.mutualLedIndicator || ledNForRelay >= 2) &&
      topo.deviceList.some(d => (d.libDevId ?? '').toUpperCase().indexOf('RELAY') >= 0)) {
      seenKeys.add('wire_relay|*');
      const wr = AiTopologyFixKit.wireRelaySpdtDualLed(topo, this.wiringEngine);
      if (wr.fixed > 0) {
        state.fixCount += wr.fixed;
        state.needReroute = true;
        state.needTopoKit = true;
        Logger.info(INSTR_TRACE_TAG,
          `[AI_FIX] auto wireRelay fixed=${wr.fixed}`);
      }
    }
    if (!seenKeys.has('heal_electrical|*')) {
      const elecAudit = AiTopologyFixKit.auditCriticalElectrical(topo);
      if (elecAudit.length > 0) {
        seenKeys.add('heal_electrical|*');
        const he = AiTopologyFixKit.healCriticalElectricalShorts(topo, this.wiringEngine);
        if (he.fixed > 0) {
          state.fixCount += he.fixed;
          state.needReroute = true;
          state.needTopoKit = true;
          Logger.info(INSTR_TRACE_TAG,
            `[AI_FIX] auto healElectrical fixed=${he.fixed}`);
        }
      }
    }

    // heal/rebuild/电气拆短之后：自激必须幂等重钉（即使本轮已跑过 wire_opamp）
    if (this.wantsOpAmpSelfOsc(topo)) {
      seenKeys.add('wire_opamp_self_osc|*');
      const osc = AiTopologyFixKit.wireOpAmpSelfOsc(topo, this.wiringEngine);
      if (osc.fixed > 0) {
        state.fixCount += osc.fixed;
        state.needReroute = true;
        state.needTopoKit = true;
        Logger.info(INSTR_TRACE_TAG,
          `[AI_FIX] post-heal wireOpAmpSelfOsc fixed=${osc.fixed}`);
      }
      if (topo.deviceList.some(d => (d.libDevId ?? '').toUpperCase() === 'VEE')) {
        const dual = AiTopologyFixKit.wireDualSupplyRails(topo, this.wiringEngine);
        if (dual.fixed > 0) {
          state.fixCount += dual.fixed;
          state.needReroute = true;
        }
      }
    }

    const pruned = AiTopologyFixKit.pruneSingletonOrphanNets(topo);
    if (pruned.fixed > 0) {
      state.fixCount += pruned.fixed;
      state.needReroute = true;
    }

    if (opts && this.isModularChildOpts(opts)) {
      const pwr = this.pruneOrphanPowerSymbols(topo);
      if (pwr > 0) {
        state.fixCount += pwr;
        state.needReroute = true;
        Logger.info(INSTR_TRACE_TAG,
          `[AI_FIX] modular auto-prune ${pwr} orphan power after issue batch`);
      }
    }
    const netNameOf = (uuid: string): string => {
      const n = topo.netList.find(x => x.netUuid === uuid);
      return n?.netName ?? uuid.substring(0, 10);
    };
    traceAiWireInventory('fix_batch_end', topo.wireList, netNameOf, 48);
    Logger.info(INSTR_TRACE_TAG,
      `[AI_FIX] executeAiFixes done fixCount=${state.fixCount}` +
      ` needReroute=${state.needReroute} needTopoKit=${state.needTopoKit}` +
      ` issues=${normalized.length} wires=${topo.wireList.length}`);
    const out: AiFixExecResult = {
      fixCount: state.fixCount,
      needReroute: state.needReroute,
      needTopoKit: state.needTopoKit
    };
    return out;
  }

  private static fixActionPriority(action: string | undefined): number {
    return fixActionPriorityOf(action ?? '');
  }

  /** RC 意图或 RC 启发式下强制拆除多余 RELAY（拆网后删除），并补 SW_PUSH */
  private stripStrayRelaysForSeriesRc(topo: SchTopology): number {
    if (this.activeIntent.mutualLedIndicator) {
      return 0;
    }
    if (!this.activeIntent.seriesRcCharge && !this.topoLooksLikeSeriesRc(topo)) {
      return 0;
    }
    let removed = 0;
    for (let i = topo.deviceList.length - 1; i >= 0; i--) {
      const d = topo.deviceList[i];
      if ((d.libDevId ?? '').toUpperCase().indexOf('RELAY') < 0) {
        continue;
      }
      this.forceRemoveDeviceAt(topo, i);
      removed++;
      Logger.info(INSTR_TRACE_TAG,
        `[AI_FIX] strip stray RELAY ${d.refName} for seriesRcCharge`);
    }
    if (removed > 0) {
      AiTopologyFixKit.pruneSingletonOrphanNets(topo);
    }
    const swAdded = this.ensureSeriesRcPushSwitch(topo);
    return removed + swAdded;
  }

  /**
   * 串联 RC 缺 SW_PUSH 时本地补一颗（剥 RELAY 后的安全网；选型 HARD 应已拦住）。
   * 摆在 VCC 与 R 之间，便于 wireSeriesRc 接成 VCC→SW→R→RC_MID→C→GND。
   */
  private ensureSeriesRcPushSwitch(topo: SchTopology): number {
    if (this.activeIntent.mutualLedIndicator) {
      return 0;
    }
    if (!this.activeIntent.seriesRcCharge && !this.topoLooksLikeSeriesRc(topo)) {
      return 0;
    }
    const hasSw = topo.deviceList.some(d =>
      (d.libDevId ?? '').toUpperCase().startsWith('SW_'));
    if (hasSw) {
      return 0;
    }
    const swId = this.componentLibrary.resolveLibraryId('SW_PUSH');
    const got = this.componentLibrary.getComponent(swId);
    if (!got.success || !got.data) {
      Logger.warn(INSTR_TRACE_TAG,
        '[AI_FIX] ensureSeriesRcPushSwitch failed — SW_PUSH not in library');
      return 0;
    }
    const usedRefs = new Set<string>();
    for (let i = 0; i < topo.deviceList.length; i++) {
      usedRefs.add(topo.deviceList[i].refName);
    }
    const rDev = topo.deviceList.find(d => (d.libDevId ?? '').startsWith('R_'));
    const vcc = topo.deviceList.find(d => {
      const u = (d.libDevId ?? '').toUpperCase();
      return u === 'VCC' || u === 'VDD';
    });
    const sx = rDev && vcc
      ? Math.round(((vcc.x + rDev.x) / 2) / 20) * 20
      : (rDev ? rDev.x - 120 : 300);
    const sy = rDev ? rDev.y : 300;
    const refName = this.allocUniqueRefName(swId, usedRefs);
    topo.deviceList.push(makeDeviceInst(
      IdUtil.generate('inst'),
      swId,
      refName,
      sx,
      sy,
      0,
      new Map<string, string>()
    ));
    Logger.info(INSTR_TRACE_TAG,
      `[AI_FIX] ensureSeriesRcPushSwitch added ${refName}=${swId} @(${sx},${sy})`);
    return 1;
  }

  /** 拆网后删除指定下标器件，并清掉触及其脚的 orphan 导线 */
  private forceRemoveDeviceAt(topo: SchTopology, idx: number): void {
    if (idx < 0 || idx >= topo.deviceList.length) {
      return;
    }
    const removed = topo.deviceList[idx];
    const purged = AiTopologyFixKit.purgeWiresTouchingDevice(topo, removed, 'force_remove');
    if (purged > 0) {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_FIX] force_remove purge wires=${purged} near ${removed.refName}`);
    }
    topo.deviceList.splice(idx, 1);
    for (const net of topo.netList) {
      net.nodeList = net.nodeList.filter(n => n.devUuid !== removed.instUuid);
    }
    const orphanNets = new Set<string>();
    for (const net of topo.netList) {
      if (net.nodeList.length < 1) {
        orphanNets.add(net.netUuid);
      }
    }
    topo.netList = topo.netList.filter(n => n.nodeList.length >= 1);
    topo.wireList = topo.wireList.filter(w => !orphanNets.has(w.netUuid));
    topo.netLabelList = topo.netLabelList.filter(l => !orphanNets.has(l.netUuid));
  }

  private wantsOpAmpSelfOsc(topo: SchTopology, opts?: PipelineOptions): boolean {
    const prompt = opts?.prompt ?? '';
    return intentIsOpAmpSelfOscillator(this.activeIntent, prompt) ||
      AiTopologyFixKit.topoLooksLikeOpAmpSelfOsc(topo);
  }

  /** 简单 RC 充放电拓扑启发式（意图优先；允许板上有 stray RELAY 以便剥离） */
  private topoLooksLikeSeriesRc(topo: SchTopology): boolean {
    if (this.activeIntent.timer555Monostable || this.activeIntent.timer555Astable) {
      return false;
    }
    if (AiTopologyFixKit.topoHas555(topo)) {
      return false;
    }
    // 运放自激 / 滞回+积分：绝不可套用串联 RC（会把积分 C 接到 GND）
    if (this.wantsOpAmpSelfOsc(topo)) {
      return false;
    }
    if (this.activeIntent.seriesRcCharge) {
      return true;
    }
    if (this.activeIntent.mutualLedIndicator) {
      return false;
    }
    const hasR = topo.deviceList.some(d => (d.libDevId ?? '').startsWith('R_'));
    const hasC = topo.deviceList.some(d => (d.libDevId ?? '').startsWith('C_'));
    const ledN = topo.deviceList.filter(d =>
      (d.libDevId ?? '').toUpperCase().startsWith('LED_')).length;
    // 不因 stray RELAY 否定 RC：剥离后再 wireSeriesRc
    return hasR && hasC && ledN < 2;
  }

  private topoWants555Monostable(topo: SchTopology): boolean {
    if (this.activeIntent.timer555Monostable) {
      return true;
    }
    if (this.activeIntent.timer555Astable) {
      return false;
    }
    // 板上有 555 + 按键且非闪烁意图 → 按单稳态加固
    if (!AiTopologyFixKit.topoHas555(topo)) {
      return false;
    }
    const hasSw = topo.deviceList.some(d =>
      (d.libDevId ?? '').toUpperCase().startsWith('SW_'));
    return hasSw && !this.activeIntent.blinkOscillator;
  }

  private applyOneAiFix(topo: SchTopology, issue: AiReviewIssue, seenKeys: Set<string>,
    state: AiFixExecState, opts?: PipelineOptions): void {
    const raw = (issue.fixAction ?? '').trim();
    if (raw === 'none' || raw === 'noop') {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_FIX] noop fixAction=${issue.fixAction} type=${issue.type}`);
      return;
    }

    const action = canonicalizeFixAction(raw);
    if (action.length === 0) {
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_FIX] unknown fixAction=${issue.fixAction} type=${issue.type} (not in FixActionRegistry)`);
      return;
    }
    issue.fixAction = action;
    const wiresBefore = topo.wireList.length;
    Logger.info(INSTR_TRACE_TAG,
      `[AI_WIRE] FIX_BEGIN action=${action} type=${issue.type ?? ''}` +
      ` target=${issue.targetDevice ?? issue.fixDetail?.refName ?? '*'}` +
      ` wires=${wiresBefore} desc=${(issue.desc ?? '').substring(0, 80)}`);

    // ── 真修复：rebuild_instrument（整轮去重一次）──
    if (action === 'rebuild_instrument') {
      if (!seenKeys.has('rebuild_instrument|*')) {
        seenKeys.add('rebuild_instrument|*');
        const target = issue.targetDevice ?? issue.fixDetail?.refName;
        const r = AiTopologyFixKit.rebuildInstrument(topo, this.wiringEngine, target);
        state.fixCount += r.fixed;
        state.needReroute = state.needReroute || r.needReroute;
        const reason = issue.fixDetail?.reason ?? issue.desc;
        Logger.info(INSTR_TRACE_TAG,
          `[AI_FIX] rebuild_instrument REAL fixed=${r.fixed} needReroute=${r.needReroute}` +
          ` wires=${wiresBefore}→${topo.wireList.length}` +
          ` reason=${(reason ?? '').substring(0, 100)}`);
      }
      if (opts && this.isModularChildOpts(opts)) {
        const pwr = this.pruneOrphanPowerSymbols(topo);
        if (pwr > 0) {
          state.fixCount += pwr;
          Logger.info(INSTR_TRACE_TAG,
            `[AI_FIX] rebuild_instrument also pruned ${pwr} orphan power`);
        }
      }
      return;
    }

    // ── demote_all_labels / nuclear 标号（默认禁止整图抹线）──
    if (action === 'demote_all_labels' || action === 'label_all') {
      if (this.wantsOpAmpSelfOsc(topo)) {
        if (!seenKeys.has('wire_opamp_self_osc|*')) {
          seenKeys.add('wire_opamp_self_osc|*');
          const r = AiTopologyFixKit.wireOpAmpSelfOsc(topo, this.wiringEngine);
          state.fixCount += r.fixed;
          state.needReroute = state.needReroute || r.needReroute;
          state.needTopoKit = state.needTopoKit || r.fixed > 0;
          Logger.info(INSTR_TRACE_TAG,
            '[AI_FIX] demote_all redirected → wireOpAmpSelfOsc (preserve WAR)');
        }
        return;
      }
      // 改为几何冲突网 + 电源轨标号，保留 2～4 脚 DUT 导线
      if (!seenKeys.has('demote_all|*')) {
        seenKeys.add('demote_all|*');
        Logger.info(INSTR_TRACE_TAG,
          '[AI_FIX] demote_all redirected → demote_geo + demote_power (preserve WAR)');
        const geo = this.collectGeometricIssues(topo);
        const bad = this.collectGeoBadNetUuids(geo);
        if (bad.size > 0) {
          const n = this.wiringEngine.demoteNetsToLabelStubs(topo, bad);
          state.fixCount += n > 0 ? bad.size : 0;
          state.needReroute = true;
          Logger.info(INSTR_TRACE_TAG,
            `[AI_FIX] demote_all→geo nets=${bad.size} stubs=${n}`);
        }
        const pwr = AiTopologyFixKit.demotePowerRails(topo, this.wiringEngine);
        state.fixCount += pwr.fixed;
        state.needReroute = state.needReroute || pwr.needReroute;
      }
      return;
    }

    // ── heal_floating ──
    if (action === 'heal_floating' || action === 'fix_floating') {
      if (!seenKeys.has('heal_floating|*')) {
        seenKeys.add('heal_floating|*');
        const r = AiTopologyFixKit.healFloatingPins(topo, this.wiringEngine);
        state.fixCount += r.fixed;
        state.needReroute = state.needReroute || r.needReroute;
      }
      return;
    }

    // ── wire_series_rc / wire_relay / pot / electrical 确定性 kit ──
    if (action === 'wire_555_monostable' || action === 'wire_555_mono') {
      if (!seenKeys.has('wire_555_monostable|*')) {
        seenKeys.add('wire_555_monostable|*');
        const r = AiTopologyFixKit.wire555Monostable(topo, this.wiringEngine);
        state.fixCount += r.fixed;
        state.needReroute = state.needReroute || r.needReroute;
        state.needTopoKit = state.needTopoKit || r.fixed > 0;
      }
      return;
    }
    if (action === 'wire_opamp_self_osc' || action === 'wire_opamp_oscillator' ||
      action === 'wire_hyst_integrator') {
      if (!seenKeys.has('wire_opamp_self_osc|*')) {
        seenKeys.add('wire_opamp_self_osc|*');
        const r = AiTopologyFixKit.wireOpAmpSelfOsc(topo, this.wiringEngine);
        state.fixCount += r.fixed;
        state.needReroute = state.needReroute || r.needReroute;
        state.needTopoKit = state.needTopoKit || r.fixed > 0;
      }
      return;
    }
    if (action === 'wire_series_rc' || action === 'wire_rc') {
      if (!seenKeys.has('wire_series_rc|*')) {
        seenKeys.add('wire_series_rc|*');
        if (this.wantsOpAmpSelfOsc(topo)) {
          const r = AiTopologyFixKit.wireOpAmpSelfOsc(topo, this.wiringEngine);
          state.fixCount += r.fixed;
          state.needReroute = state.needReroute || r.needReroute;
          state.needTopoKit = state.needTopoKit || r.fixed > 0;
          Logger.info(INSTR_TRACE_TAG,
            '[AI_FIX] wire_series_rc redirected → wireOpAmpSelfOsc');
        } else if (this.topoWants555Monostable(topo)) {
          const r = AiTopologyFixKit.wire555Monostable(topo, this.wiringEngine);
          state.fixCount += r.fixed;
          state.needReroute = state.needReroute || r.needReroute;
          state.needTopoKit = state.needTopoKit || r.fixed > 0;
          Logger.info(INSTR_TRACE_TAG,
            '[AI_FIX] wire_series_rc redirected → wire555Monostable');
        } else if (!AiTopologyFixKit.topoHas555(topo)) {
          const r = AiTopologyFixKit.wireSeriesRc(topo, this.wiringEngine);
          state.fixCount += r.fixed;
          state.needReroute = state.needReroute || r.needReroute;
          state.needTopoKit = state.needTopoKit || r.fixed > 0;
        } else {
          Logger.info(INSTR_TRACE_TAG,
            '[AI_FIX] wire_series_rc skipped — 555 on board');
        }
      }
      return;
    }
    if (action === 'wire_potentiometer' || action === 'wire_pot') {
      if (!seenKeys.has('wire_potentiometer|*')) {
        seenKeys.add('wire_potentiometer|*');
        const r = AiTopologyFixKit.wirePotentiometer(topo, this.wiringEngine);
        state.fixCount += r.fixed;
        state.needReroute = state.needReroute || r.needReroute;
        state.needTopoKit = state.needTopoKit || r.fixed > 0;
      }
      return;
    }
    if (action === 'wire_relay' || action === 'wire_relay_spdt') {
      if (!seenKeys.has('wire_relay|*')) {
        seenKeys.add('wire_relay|*');
        const r = AiTopologyFixKit.wireRelaySpdtDualLed(topo, this.wiringEngine);
        state.fixCount += r.fixed;
        state.needReroute = state.needReroute || r.needReroute;
        state.needTopoKit = state.needTopoKit || r.fixed > 0;
      }
      return;
    }
    if (action === 'heal_electrical' || action === 'heal_electrical_short') {
      if (!seenKeys.has('heal_electrical|*')) {
        seenKeys.add('heal_electrical|*');
        const r = AiTopologyFixKit.healCriticalElectricalShorts(topo, this.wiringEngine);
        state.fixCount += r.fixed;
        state.needReroute = state.needReroute || r.needReroute;
        state.needTopoKit = state.needTopoKit || r.fixed > 0;
      }
      return;
    }
    if (action === 'wire_dual_supply' || action === 'wire_dual_rails') {
      if (!seenKeys.has('wire_dual_supply|*')) {
        seenKeys.add('wire_dual_supply|*');
        const r = AiTopologyFixKit.wireDualSupplyRails(topo, this.wiringEngine);
        state.fixCount += r.fixed;
        state.needReroute = state.needReroute || r.needReroute;
        state.needTopoKit = state.needTopoKit || r.fixed > 0;
      }
      return;
    }
    if (action === 'wire_opamp_feedback' || action === 'opamp_feedback') {
      if (!seenKeys.has('wire_opamp_feedback|*')) {
        seenKeys.add('wire_opamp_feedback|*');
        const r = AiTopologyFixKit.wireOpAmpFeedback(topo, this.wiringEngine);
        state.fixCount += r.fixed;
        state.needReroute = state.needReroute || r.needReroute;
        state.needTopoKit = state.needTopoKit || r.fixed > 0;
      }
      return;
    }
    if (action === 'ensure_signal_gen') {
      if (!seenKeys.has('ensure_signal_gen|*')) {
        seenKeys.add('ensure_signal_gen|*');
        const r = AiTopologyFixKit.ensureSignalGenWired(topo, this.wiringEngine);
        state.fixCount += r.fixed;
        state.needReroute = state.needReroute || r.needReroute;
      }
      return;
    }
    if (action === 'strip_phantom_pins' || action === 'sanitize_pins') {
      if (!seenKeys.has('strip_phantom_pins|*')) {
        seenKeys.add('strip_phantom_pins|*');
        const r = AiTopologyFixKit.stripUnknownDevicePinNodes(topo);
        state.fixCount += r.fixed;
        state.needReroute = state.needReroute || r.needReroute;
      }
      return;
    }
    if (action === 'prune_unused_osc_channels' || action === 'break_nc_bridge') {
      if (!seenKeys.has('prune_unused_osc|*')) {
        seenKeys.add('prune_unused_osc|*');
        const r = AiTopologyFixKit.pruneUnusedOscChannelNets(topo);
        state.fixCount += r.fixed;
        state.needReroute = state.needReroute || r.needReroute;
      }
      return;
    }
    if (action === 'prune_singleton_nets') {
      if (!seenKeys.has('prune_singleton|*')) {
        seenKeys.add('prune_singleton|*');
        const r1 = AiTopologyFixKit.pruneSingletonOrphanNets(topo);
        const r2 = AiTopologyFixKit.pruneAllSingletonSignalNets(topo,
          opts ? this.buildFinalizeGateOpts(opts, false).preserveBoundaryKeys : undefined);
        state.fixCount += r1.fixed + r2.fixed;
        state.needReroute = state.needReroute || r1.needReroute || r2.needReroute;
      }
      return;
    }
    if (action === 'demote_power_rails') {
      if (!seenKeys.has('demote_power_rails|*')) {
        seenKeys.add('demote_power_rails|*');
        const r = AiTopologyFixKit.demotePowerRails(topo, this.wiringEngine);
        state.fixCount += r.fixed;
        state.needReroute = state.needReroute || r.needReroute;
      }
      return;
    }
    if (action === 'demote_geo_nets') {
      if (!seenKeys.has('demote_geo_nets|*')) {
        seenKeys.add('demote_geo_nets|*');
        const geo = this.collectGeometricIssues(topo);
        const bad = this.collectGeoBadNetUuids(geo);
        if (bad.size > 0) {
          const n = this.wiringEngine.demoteNetsToLabelStubs(topo, bad);
          state.fixCount += n > 0 ? bad.size : 0;
          state.needReroute = true;
          Logger.info(INSTR_TRACE_TAG,
            `[AI_FIX] demote_geo_nets nets=${bad.size} stubs=${n}`);
        } else {
          // 无当前几何指纹时退化为电源轨标号
          const r = AiTopologyFixKit.demotePowerRails(topo, this.wiringEngine);
          state.fixCount += r.fixed;
          state.needReroute = state.needReroute || r.needReroute;
        }
      }
      return;
    }

    // ── split_power_short ──
    if (action === 'split_power' || action === 'split_power_short') {
      if (!seenKeys.has('split_power|*')) {
        seenKeys.add('split_power|*');
        const r = AiTopologyFixKit.splitMergedPowerRails(topo);
        state.fixCount += r.fixed;
        state.needReroute = state.needReroute || r.needReroute;
      }
      return;
    }

    // ── reroute：仅标 needReroute（不计入假进度）──
    if (action === 'reroute') {
      if (!seenKeys.has('reroute|*')) {
        seenKeys.add('reroute|*');
        state.needReroute = true;
        const reason = (issue.fixDetail !== undefined && issue.fixDetail !== null)
          ? (issue.fixDetail.reason ?? issue.desc)
          : issue.desc;
        Logger.info(INSTR_TRACE_TAG,
          `[AI_FIX] reroute batched (no fixCount) reason=${reason}`);
      }
      return;
    }

    // 以下动作需要 fixDetail（部分可从 targetDevice 推断）
    const detail: AiFixDetail = issue.fixDetail ?? {};

    // ── demote_to_label / join_by_label ──
    if (action === 'demote_to_label' || action === 'join_by_label' ||
      action === 'force_label') {
      const netName = detail.netName ?? detail.toNet ?? '';
      if (netName.length === 0) {
        state.needReroute = true;
        Logger.info(INSTR_TRACE_TAG,
          `[AI_FIX] ${action} without netName → needReroute only (no fake fixCount)`);
        return;
      }
      const dedupe = `${action}|${netName}|${detail.fromNet ?? ''}`;
      if (seenKeys.has(dedupe)) {
        return;
      }
      seenKeys.add(dedupe);
      if (action === 'join_by_label') {
        const r = AiTopologyFixKit.joinNetsByLabel(topo, this.wiringEngine,
          netName, detail.fromNet);
        state.fixCount += r.fixed;
        state.needReroute = state.needReroute || r.needReroute;
      } else {
        const r = AiTopologyFixKit.demoteNetByName(topo, this.wiringEngine, netName);
        state.fixCount += r.fixed;
        state.needReroute = state.needReroute || r.needReroute;
      }
      return;
    }

    // ── reconnect_pin / rewire_net ──
    if (action === 'reconnect_pin' || action === 'rewire_net' || action === 'move_pin') {
      const ref = detail.refName ?? issue.targetDevice ?? '';
      const pinId = detail.pinId ?? '';
      const netName = detail.netName ?? detail.toNet ?? '';
      if (ref.length === 0 || pinId.length === 0 || netName.length === 0) {
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_FIX] ${action} missing ref/pinId/netName` +
          ` ref=${ref} pin=${pinId} net=${netName}`);
        // 缺字段时尝试 rebuild + heal（仅真实 fixed 计入）
        if (!seenKeys.has('rebuild_instrument|*')) {
          seenKeys.add('rebuild_instrument|*');
          const r = AiTopologyFixKit.rebuildInstrument(topo, this.wiringEngine, ref);
          state.fixCount += r.fixed;
          state.needReroute = true;
        }
        return;
      }
      const dedupe = `${action}|${ref}|${pinId}|${netName}`;
      if (seenKeys.has(dedupe)) {
        return;
      }
      // 示波器未用通道：禁止接到 GND / NC / 单脚悬空网（制造 ERC 开路）
      const pinU = pinId.toUpperCase();
      const netU = netName.toUpperCase();
      if (/^CH[2-9]$/.test(pinU) || /^CH\d{2,}$/.test(pinU)) {
        if (netU === 'GND' || netU === 'NC' || netU.indexOf('OSC_CH') >= 0 ||
          netU.endsWith('_SIG')) {
          Logger.info(INSTR_TRACE_TAG,
            `[AI_FIX] skip reconnect unused ${ref}.${pinId} → ${netName} (leave floating)`);
          return;
        }
      }
      seenKeys.add(dedupe);
      const r = AiTopologyFixKit.reconnectPin(topo, this.wiringEngine, ref, pinId, netName);
      state.fixCount += r.fixed;
      state.needReroute = state.needReroute || r.needReroute;
      return;
    }

    // ── disconnect_pin：拆除错误连接 / 未用通道悬空 ──
    if (action === 'disconnect_pin' || action === 'float_pin') {
      const ref = detail.refName ?? issue.targetDevice ?? '';
      const pinId = detail.pinId ?? '';
      if (ref.length === 0 || pinId.length === 0) {
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_FIX] disconnect_pin missing ref/pinId ref=${ref} pin=${pinId}`);
        return;
      }
      const dedupe = `disconnect|${ref}|${pinId}`;
      if (seenKeys.has(dedupe)) {
        return;
      }
      seenKeys.add(dedupe);
      const r = AiTopologyFixKit.disconnectPin(topo, this.wiringEngine, ref, pinId);
      state.fixCount += r.fixed;
      state.needReroute = state.needReroute || r.needReroute;
      return;
    }

    // ── move_device / nudge_device / rotate_device ──
    if (action === 'move_device' || action === 'nudge_device') {
      const ref = detail.refName ?? issue.targetDevice ?? '';
      if (ref.length === 0) {
        return;
      }
      const dedupe = `move|${ref}|${detail.x ?? ''}|${detail.y ?? ''}|${detail.dx ?? ''}|${detail.dy ?? ''}`;
      if (seenKeys.has(dedupe)) {
        return;
      }
      seenKeys.add(dedupe);
      const r = AiTopologyFixKit.moveDevice(topo, ref, detail.x, detail.y, detail.dx, detail.dy);
      state.fixCount += r.fixed;
      state.needReroute = state.needReroute || r.needReroute;
      return;
    }
    if (action === 'rotate_device') {
      const ref = detail.refName ?? issue.targetDevice ?? '';
      if (ref.length === 0) {
        return;
      }
      const dedupe = `rotate|${ref}|${detail.rotate ?? 'rel90'}`;
      if (seenKeys.has(dedupe)) {
        return;
      }
      seenKeys.add(dedupe);
      const r = AiTopologyFixKit.rotateDevice(topo, ref, detail.rotate);
      state.fixCount += r.fixed;
      state.needReroute = state.needReroute || r.needReroute;
      return;
    }

    if (!issue.fixDetail) {
      return;
    }
    const detailFull = issue.fixDetail;
    const dedupeKey = `${issue.fixAction}|${issue.targetDevice ?? ''}|` +
      `${detailFull.libDevId ?? ''}|${detailFull.refName ?? ''}|${detailFull.x ?? ''}|${detailFull.y ?? ''}|${issue.desc}`;
    if (seenKeys.has(dedupeKey)) {
      return;
    }
    seenKeys.add(dedupeKey);

    switch (action) {
      case 'add_component': {
        // warning 级「可选电容/装饰件」一律不添加 — 这是多出多余器件的主因
        if (issue.severity === 'warning') {
          Logger.info(INSTR_TRACE_TAG,
            `[AI_FIX] skip warning add_component: ${issue.desc}`);
          break;
        }
        const resolvedId = this.resolveAiFixLibDevId(detailFull);
        if (!resolvedId) {
          Logger.warn(INSTR_TRACE_TAG,
            `[AI_FIX] reject invalid libDevId=${detailFull.libDevId} (not in library)`);
          break;
        }
        // LED 已有足够限流电阻时禁止再加 R
        if (resolvedId.startsWith('R_')) {
          const ledN = topo.deviceList.filter(d => d.libDevId.startsWith('LED_')).length;
          const rN = topo.deviceList.filter(d => d.libDevId.startsWith('R_')).length;
          if (ledN > 0 && rN >= ledN) {
            Logger.info(INSTR_TRACE_TAG,
              `[AI_FIX] skip add ${resolvedId}: already ${rN} resistors for ${ledN} LEDs`);
            break;
          }
        }
        // 非 MCU 电路禁止自审追加滤波电容；运放自激积分反馈电容除外
        if (resolvedId.startsWith('C_') && !this.topoHasMcu(topo) &&
          issue.type !== 'mcu_system' && !this.wantsOpAmpSelfOsc(topo)) {
          Logger.info(INSTR_TRACE_TAG,
            `[AI_FIX] skip optional cap ${resolvedId} on non-MCU circuit`);
          break;
        }
        const existCheck = topo.deviceList.some(d =>
          d.libDevId === resolvedId &&
          Math.abs(d.x - (detailFull.x ?? 0)) < 30 &&
          Math.abs(d.y - (detailFull.y ?? 0)) < 30);
        if (!existCheck) {
          const params = new Map<string, string>();
          if (detailFull.paramKey && detailFull.paramValue) {
            params.set(detailFull.paramKey, detailFull.paramValue);
          }
          const usedRefs = new Set<string>();
          for (const d of topo.deviceList) {
            usedRefs.add(d.refName);
          }
          const refName = detailFull.refName && detailFull.refName.length > 0 &&
            !usedRefs.has(detailFull.refName)
            ? detailFull.refName
            : this.allocUniqueRefName(resolvedId, usedRefs);
          topo.deviceList.push(makeDeviceInst(
            IdUtil.generate('inst'),
            resolvedId,
            refName,
            detailFull.x ?? 200 + state.fixCount * 60,
            detailFull.y ?? 300,
            0,
            params
          ));
          state.fixCount++;
          state.needReroute = true;
          state.needTopoKit = true;

          // RELAY_SPDT：先确保双 LED 各有独立限流 R，再确定性触点接线
          if (resolvedId === 'RELAY_SPDT' ||
            resolvedId.toUpperCase().indexOf('RELAY') >= 0) {
            const ledN = topo.deviceList.filter(d =>
              (d.libDevId ?? '').startsWith('LED_')).length;
            let rN = topo.deviceList.filter(d =>
              (d.libDevId ?? '').startsWith('R_')).length;
            const needR = Math.max(ledN, 2) - rN;
            for (let ri = 0; ri < needR; ri++) {
              const rId = this.componentLibrary.resolveLibraryId('R_330');
              const rGot = this.componentLibrary.getComponent(rId);
              if (!rGot.success || !rGot.data) {
                break;
              }
              usedRefs.add(refName);
              const rRef = this.allocUniqueRefName(rId, usedRefs);
              usedRefs.add(rRef);
              topo.deviceList.push(makeDeviceInst(
                IdUtil.generate('inst'),
                rId,
                rRef,
                (detailFull.x ?? 200) + 80 + ri * 60,
                (detailFull.y ?? 300) + 40,
                0,
                new Map<string, string>()
              ));
              state.fixCount++;
              rN++;
              Logger.info(INSTR_TRACE_TAG,
                `[AI_FIX] add_component auto R for RELAY: ${rRef}`);
            }
            const wr = AiTopologyFixKit.wireRelaySpdtDualLed(topo, this.wiringEngine);
            if (wr.fixed > 0) {
              state.fixCount += wr.fixed;
              state.needReroute = true;
              Logger.info(INSTR_TRACE_TAG,
                `[AI_FIX] add_component wireRelay fixed=${wr.fixed}`);
            }
            seenKeys.add('wire_relay|*');
          } else if (resolvedId.startsWith('R_') || resolvedId.startsWith('C_') ||
            resolvedId.toUpperCase().indexOf('OSCILLOSCOPE') >= 0 ||
            resolvedId.toUpperCase().indexOf('AMMETER') >= 0 ||
            resolvedId.toUpperCase().indexOf('VOLTMETER') >= 0) {
            // RC / 仪器：自激优先；否则串联 RC；禁止自激场景套用 wireSeriesRc
            if (this.wantsOpAmpSelfOsc(topo)) {
              const oscKit = AiTopologyFixKit.wireOpAmpSelfOsc(topo, this.wiringEngine);
              if (oscKit.fixed > 0) {
                state.fixCount += oscKit.fixed;
                state.needReroute = true;
                seenKeys.add('wire_opamp_self_osc|*');
                Logger.info(INSTR_TRACE_TAG,
                  `[AI_FIX] add_component wireOpAmpSelfOsc fixed=${oscKit.fixed}`);
              }
            } else if (this.topoLooksLikeSeriesRc(topo)) {
              const rcKit = AiTopologyFixKit.wireSeriesRc(topo, this.wiringEngine);
              if (rcKit.fixed > 0) {
                state.fixCount += rcKit.fixed;
                state.needReroute = true;
                seenKeys.add('wire_series_rc|*');
                Logger.info(INSTR_TRACE_TAG,
                  `[AI_FIX] add_component wireSeriesRc fixed=${rcKit.fixed}`);
              }
            }
            const heal = AiTopologyFixKit.healFloatingPins(topo, this.wiringEngine);
            if (heal.fixed > 0) {
              state.fixCount += heal.fixed;
              Logger.info(INSTR_TRACE_TAG,
                `[AI_FIX] add_component heal_floating fixed=${heal.fixed} for ${refName}`);
            }
          } else {
            const heal = AiTopologyFixKit.healFloatingPins(topo, this.wiringEngine);
            if (heal.fixed > 0) {
              state.fixCount += heal.fixed;
              Logger.info(INSTR_TRACE_TAG,
                `[AI_FIX] add_component heal_floating fixed=${heal.fixed} for ${refName}`);
            }
          }
          Logger.info(INSTR_TRACE_TAG,
            `[AI_FIX] add ${resolvedId} as ${refName} at (${detailFull.x},${detailFull.y})` +
            ` reason=${detailFull.reason ?? ''}`);
        }
        break;
      }
      case 'remove_component': {
        const idx = this.findSafeRemoveIndex(topo, issue, detailFull);
        if (idx >= 0) {
          const removed = topo.deviceList[idx];
          this.forceRemoveDeviceAt(topo, idx);
          AiTopologyFixKit.pruneSingletonOrphanNets(topo);
          state.fixCount++;
          state.needReroute = true;
          Logger.info(INSTR_TRACE_TAG,
            `[AI_FIX] removed ${removed.refName}(${removed.libDevId})` +
            ` reason=${detailFull.reason ?? ''}`);
        } else {
          const why = this.describeUnsafeRemove(topo, issue, detailFull);
          Logger.info(INSTR_TRACE_TAG,
            `[AI_FIX] skip remove — ${why}` +
            ` target=${issue.targetDevice ?? detailFull.refName ?? detailFull.libDevId}`);
        }
        break;
      }
      case 'change_param': {
        if (!detailFull.paramKey || !detailFull.paramValue) {
          break;
        }
        // 伪参数（如 bypass_cap 建议）不写进器件，避免污染与无意义写入
        const pk = detailFull.paramKey.toLowerCase();
        if (pk === 'bypass_cap' || pk === 'none' || pk.indexOf('建议') >= 0) {
          Logger.info(INSTR_TRACE_TAG,
            `[AI_FIX] skip pseudo change_param key=${detailFull.paramKey}`);
          break;
        }
        const targetRef = detailFull.refName ?? issue.targetDevice ?? '';
        const dev = topo.deviceList.find(d =>
          (d.refName ?? '').toUpperCase() === targetRef.toUpperCase() ||
          (detailFull.libDevId !== undefined && d.libDevId === detailFull.libDevId));
        if (dev) {
          if (!dev.params) {
            dev.params = new Map<string, string>();
          }
          const prev = dev.params.get(detailFull.paramKey);
          if (prev === detailFull.paramValue) {
            Logger.info(INSTR_TRACE_TAG,
              `[AI_FIX] change_param noop ${dev.refName}.${detailFull.paramKey}`);
            break;
          }
          dev.params.set(detailFull.paramKey, detailFull.paramValue);
          state.fixCount++;
          Logger.info(INSTR_TRACE_TAG,
            `[AI_FIX] change_param ${dev.refName}.${detailFull.paramKey}=${detailFull.paramValue}`);
        }
        break;
      }
      default: {
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_FIX] unhandled fixAction=${action} type=${issue.type}` +
          ` (registered but no switch case — check applyOneAiFix)`);
        break;
      }
    }
  }

  /** 将 LLM 幻觉 ID (R / CAP_ELECTRO) 映射到库内真实 libDevId */
  private resolveAiFixLibDevId(detail: AiFixDetail): string | null {
    const raw = (detail.libDevId ?? '').trim();
    if (raw.length === 0) {
      return null;
    }
    const upper = raw.toUpperCase();
    let candidate = raw;
    const pv = (detail.paramValue ?? '').toLowerCase();
    if (upper === 'R' || upper === 'RES' || upper === 'RESISTOR') {
      if (pv.indexOf('330') >= 0) {
        candidate = 'R_330';
      } else if (pv.indexOf('4.7') >= 0 || pv.indexOf('4k7') >= 0) {
        candidate = 'R_4.7k';
      } else if (pv.indexOf('10k') >= 0) {
        candidate = 'R_10k';
      } else if (pv.indexOf('1k') >= 0) {
        candidate = 'R_1k';
      } else {
        candidate = 'R_330';
      }
    } else if (upper === 'CAP_ELECTRO' || upper === 'CAP' || upper === 'C' ||
      upper === 'CAPACITOR' || upper.indexOf('ELECTRO') >= 0) {
      if (pv.indexOf('100n') >= 0) {
        candidate = 'C_100nF';
      } else if (pv.indexOf('10u') >= 0 || pv.indexOf('10µ') >= 0) {
        candidate = 'C_10uF';
      } else {
        candidate = 'C_10uF';
      }
    }
    const resolved = this.componentLibrary.resolveLibraryId(candidate);
    const got = this.componentLibrary.getComponent(resolved);
    if (!got.success || !got.data) {
      return null;
    }
    return resolved;
  }

  private topoHasMcu(topo: SchTopology): boolean {
    return topo.deviceList.some(d => {
      const id = (d.libDevId ?? '').toUpperCase();
      return id.indexOf('STM32') >= 0 || id.indexOf('AT89') >= 0 || id.indexOf('STC') >= 0;
    });
  }

  private isDeviceOnAnyNet(topo: SchTopology, instUuid: string): boolean {
    for (const net of topo.netList) {
      for (const n of net.nodeList) {
        if (n.devUuid === instUuid) {
          return true;
        }
      }
    }
    return false;
  }

  private isModularChildOpts(opts: PipelineOptions): boolean {
    if (opts.modularBoundaryPins && opts.modularBoundaryPins.length > 0) {
      return true;
    }
    return (opts.prompt ?? '').indexOf('【模块并行约束') >= 0;
  }

  /** 选型/建网/库匹配等硬中止：空拓扑或 abort 类 errType，残留 ERC 不算 abort */
  private isPipelineAbortResult(r: AiPipelineResult): boolean {
    if (!r.topology || r.topology.deviceList.length === 0) {
      return true;
    }
    const errs = r.ercErrors ?? [];
    for (let i = 0; i < errs.length; i++) {
      const et = errs[i].errType ?? '';
      if (et === 'device_select' || et === 'net_plan' || et === 'library_match' ||
        et === 'modular_plan' || et === 'modular_parallel' || et === 'placement') {
        return true;
      }
    }
    return false;
  }

  /** finalize/prune 共用：带上模块边界脚白名单，禁止剪掉跨模块 joinByLabel 单脚网 */
  private buildFinalizeGateOpts(opts: PipelineOptions, seriesRc: boolean): FinalizeGateOpts {
    const has555Intent = this.activeIntent.timer555Monostable ||
      this.activeIntent.timer555Astable ||
      this.activeIntent.reasons.some(r => r.indexOf('555') >= 0);
    const selfOsc = intentIsOpAmpSelfOscillator(this.activeIntent, opts.prompt);
    const gateOpts: FinalizeGateOpts = {
      seriesRcCharge: seriesRc && !this.activeIntent.mutualLedIndicator &&
        !has555Intent && !selfOsc,
      mutualLedIndicator: this.activeIntent.mutualLedIndicator,
      timer555Monostable: this.activeIntent.timer555Monostable,
      hasTimer555: has555Intent,
      opAmpSelfOscillator: selfOsc,
      preserveBoundaryKeys: this.resolveModularBoundaryKeys(opts)
    };
    return gateOpts;
  }

  private pruneSingletonsPreservingBoundary(topo: SchTopology,
    opts: PipelineOptions): TopologyFixResult {
    return AiTopologyFixKit.pruneAllSingletonSignalNets(topo,
      this.resolveModularBoundaryKeys(opts));
  }

  private resolveModularBoundaryKeys(opts: PipelineOptions): string[] {
    const raw = opts.modularBoundaryPins && opts.modularBoundaryPins.length > 0
      ? opts.modularBoundaryPins
      : this.parseBoundaryPinsFromPrompt(opts.prompt);
    const keys: string[] = [];
    for (let i = 0; i < raw.length; i++) {
      const k = normalizeBoundaryKey(raw[i]);
      if (k.length > 0 && keys.indexOf(k) < 0) {
        keys.push(k);
      }
    }
    return keys;
  }

  private parseBoundaryPinsFromPrompt(prompt: string): string[] {
    const m = (prompt ?? '').match(/boundaryPins\)?:\s*([^\n]+)/i);
    if (!m || !m[1]) {
      return [];
    }
    const parts = m[1].split(',');
    const out: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      const s = parts[i].trim();
      if (s.indexOf('.') > 0) {
        out.push(s);
      }
    }
    return out;
  }

  /** 电源符号仅自身入网（或仅与其它电源符号共网）→ 可安全删除 */
  private isOrphanPowerSymbol(topo: SchTopology, d: DeviceInst): boolean {
    const id = (d.libDevId ?? '').toUpperCase();
    if (id !== 'VCC' && id !== 'GND' && id !== 'VEE' && id !== 'VDD' && id !== 'VSS') {
      return false;
    }
    for (let ni = 0; ni < topo.netList.length; ni++) {
      const net = topo.netList[ni];
      let hasThis = false;
      for (let j = 0; j < net.nodeList.length; j++) {
        if (net.nodeList[j].devUuid === d.instUuid) {
          hasThis = true;
          break;
        }
      }
      if (!hasThis) {
        continue;
      }
      for (let j = 0; j < net.nodeList.length; j++) {
        const node = net.nodeList[j];
        if (node.devUuid === d.instUuid) {
          continue;
        }
        let other: DeviceInst | null = null;
        for (let di = 0; di < topo.deviceList.length; di++) {
          if (topo.deviceList[di].instUuid === node.devUuid) {
            other = topo.deviceList[di];
            break;
          }
        }
        if (!other) {
          continue;
        }
        const oid = (other.libDevId ?? '').toUpperCase();
        if (oid !== 'VCC' && oid !== 'GND') {
          return false;
        }
      }
    }
    // 完全未入网也算孤儿
    return true;
  }

  private pruneOrphanPowerSymbols(topo: SchTopology): number {
    const removeUuids: string[] = [];
    for (let i = 0; i < topo.deviceList.length; i++) {
      const d = topo.deviceList[i];
      if (this.isOrphanPowerSymbol(topo, d)) {
        removeUuids.push(d.instUuid);
        Logger.info(INSTR_TRACE_TAG,
          `[AI_FIX] prune orphan power ${d.refName}(${d.libDevId})`);
      }
    }
    if (removeUuids.length === 0) {
      return 0;
    }
    const drop = new Set<string>(removeUuids);
    topo.deviceList = topo.deviceList.filter(d => !drop.has(d.instUuid));
    for (const net of topo.netList) {
      net.nodeList = net.nodeList.filter(n => !drop.has(n.devUuid));
    }
    const orphanNets = new Set<string>();
    for (const net of topo.netList) {
      if (net.nodeList.length < 1) {
        orphanNets.add(net.netUuid);
      }
    }
    topo.netList = topo.netList.filter(n => n.nodeList.length >= 1);
    topo.wireList = topo.wireList.filter(w => !orphanNets.has(w.netUuid));
    topo.netLabelList = topo.netLabelList.filter(l => !orphanNets.has(l.netUuid));
    return removeUuids.length;
  }

  private countPipelineBlocking(erc: ErcError[], opts: PipelineOptions,
    topo: SchTopology): number {
    return this.filterPipelineBlocking(erc, opts, topo).length;
  }

  private filterPipelineBlocking(erc: ErcError[], opts: PipelineOptions,
    topo: SchTopology): ErcError[] {
    const hard = AiErcGateUtil.filterBlocking(erc);
    if (!this.isModularChildOpts(opts)) {
      return hard;
    }
    const bps = this.resolveModularBoundaryKeys(opts);
    const out: ErcError[] = [];
    for (let i = 0; i < hard.length; i++) {
      const e = hard[i];
      const sole = this.resolveErcSolePin(topo, e);
      if (AiErcGateUtil.isModularChildExpectedSoft(e, bps, sole.pinKey, sole.libDevId)) {
        Logger.info(INSTR_TRACE_TAG,
          `[AI_PIPE] modular ERC soft-skip: ${e.desc}` +
          ` sole=${sole.pinKey || sole.libDevId || '?'}`);
        continue;
      }
      out.push(e);
    }
    return out;
  }

  private resolveErcSolePin(topo: SchTopology, e: ErcError): SolePinInfo {
    const empty: SolePinInfo = { pinKey: '', libDevId: '' };
    let netUuid = e.targetUuid ?? '';
    let net = topo.netList.find(n => n.netUuid === netUuid);
    if (!net) {
      const m = (e.desc ?? '').match(/网络\s*[「"']?([^」"'\s]+)[」"']?/);
      if (m && m[1]) {
        const name = m[1];
        net = topo.netList.find(n => (n.netName ?? '') === name ||
          (n.netName ?? '').toUpperCase() === name.toUpperCase());
      }
    }
    if (!net || net.nodeList.length !== 1) {
      return empty;
    }
    const node = net.nodeList[0];
    let dev: DeviceInst | null = null;
    for (let i = 0; i < topo.deviceList.length; i++) {
      if (topo.deviceList[i].instUuid === node.devUuid) {
        dev = topo.deviceList[i];
        break;
      }
    }
    if (!dev) {
      return empty;
    }
    const pinKey = normalizeBoundaryKey(`${dev.refName}.${node.pinId}`);
    return { pinKey, libDevId: dev.libDevId ?? '' };
  }

  /**
   * 只删除「一个」安全目标：优先浮空器件 / 精确位号，绝不按 libDevId 批量删光。
   * 历史 bug: filter(libDevId!==R) 会删掉刚 add 的电阻，或一次删掉全部 R_330。
   * 模块并行：允许删除未接负载的孤立 VCC/GND 符号。
   */
  private findSafeRemoveIndex(topo: SchTopology, issue: AiReviewIssue,
    detail: AiFixDetail): number {
    const target = (issue.targetDevice ?? detail.refName ?? '').trim();
    // 0) 孤立电源符号（仅自身入网，无负载）
    if (target.length > 0) {
      for (let i = 0; i < topo.deviceList.length; i++) {
        const d = topo.deviceList[i];
        if ((d.refName === target || d.libDevId === target) &&
          this.isOrphanPowerSymbol(topo, d)) {
          return i;
        }
      }
    }
    const resolvedPwr = this.resolveAiFixLibDevId(detail) ?? detail.libDevId;
    if (resolvedPwr === 'VCC' || resolvedPwr === 'GND' ||
      target === 'VCC' || target === 'GND') {
      for (let i = 0; i < topo.deviceList.length; i++) {
        const d = topo.deviceList[i];
        if ((d.libDevId === 'VCC' || d.libDevId === 'GND') &&
          (d.libDevId === resolvedPwr || d.libDevId === target ||
            d.refName === target) &&
          this.isOrphanPowerSymbol(topo, d)) {
          return i;
        }
      }
    }
    // 1) 精确位号且浮空（非电源 — 电源走上方孤儿规则）
    if (target.length > 0) {
      for (let i = 0; i < topo.deviceList.length; i++) {
        const d = topo.deviceList[i];
        if ((d.refName === target || d.libDevId === target) &&
          d.libDevId !== 'VCC' && d.libDevId !== 'GND' &&
          !this.isDeviceOnAnyNet(topo, d.instUuid)) {
          return i;
        }
      }
    }
    // 1b) severity=error/critical + 精确位号：仅允许拆除 RELAY（禁止误删 R/C/SW/OSC 等关键件）
    const sev = (issue.severity ?? '').toLowerCase();
    if (target.length > 0 && (sev === 'error' || sev === 'critical')) {
      for (let i = 0; i < topo.deviceList.length; i++) {
        const d = topo.deviceList[i];
        if (d.refName !== target || d.libDevId === 'VCC' || d.libDevId === 'GND') {
          continue;
        }
        const lib = (d.libDevId ?? '').toUpperCase();
        if (lib.indexOf('RELAY') >= 0) {
          return i;
        }
        // RC/测量关键件入网后禁止 remove — 只许 reconnect/demote
        if (lib.startsWith('R_') || lib.startsWith('C_') || lib.startsWith('SW_') ||
          lib.indexOf('OSC') >= 0 || lib.indexOf('VOLTMETER') >= 0 ||
          lib.indexOf('AMMETER') >= 0 || lib.startsWith('LED_') ||
          lib.indexOf('POT') >= 0) {
          Logger.info(INSTR_TRACE_TAG,
            `[AI_FIX] refuse remove on-net essential ${d.refName}/${d.libDevId}`);
          return -1;
        }
      }
    }
    // 1c) RC 意图下按型号拆除多余 RELAY
    if (this.activeIntent.seriesRcCharge && !this.activeIntent.mutualLedIndicator) {
      const wantRelay = target.toUpperCase().indexOf('RELAY') >= 0 ||
        (detail.libDevId ?? '').toUpperCase().indexOf('RELAY') >= 0 ||
        (detail.reason ?? '').indexOf('继电器') >= 0;
      if (wantRelay) {
        for (let i = 0; i < topo.deviceList.length; i++) {
          const d = topo.deviceList[i];
          if ((d.libDevId ?? '').toUpperCase().indexOf('RELAY') >= 0 &&
            (target.length === 0 || d.refName === target || d.libDevId === target)) {
            return i;
          }
        }
      }
    }
    // 2) 坐标附近的同型号浮空器件
    const resolved = this.resolveAiFixLibDevId(detail) ?? detail.libDevId;
    if (resolved && detail.x !== undefined && detail.y !== undefined) {
      for (let i = 0; i < topo.deviceList.length; i++) {
        const d = topo.deviceList[i];
        if (d.libDevId === resolved &&
          Math.abs(d.x - (detail.x ?? 0)) < 40 &&
          Math.abs(d.y - (detail.y ?? 0)) < 40 &&
          d.libDevId !== 'VCC' && d.libDevId !== 'GND' &&
          !this.isDeviceOnAnyNet(topo, d.instUuid)) {
          return i;
        }
      }
    }
    // 3) 同 libDevId 的浮空副本（保留至少一个已入网实例）
    if (resolved) {
      const same: DeviceIndexPair[] = [];
      for (let i = 0; i < topo.deviceList.length; i++) {
        const d = topo.deviceList[i];
        if (d.libDevId === resolved || d.refName === target) {
          const pair: DeviceIndexPair = { d: d, i: i };
          same.push(pair);
        }
      }
      const floating: DeviceIndexPair[] = [];
      const wired: DeviceIndexPair[] = [];
      for (let si = 0; si < same.length; si++) {
        const e = same[si];
        if (this.isDeviceOnAnyNet(topo, e.d.instUuid)) {
          wired.push(e);
        } else {
          floating.push(e);
        }
      }
      if (floating.length > 0 && (wired.length > 0 || same.length > 1)) {
        return floating[0].i;
      }
    }
    return -1;
  }

  private describeUnsafeRemove(topo: SchTopology, issue: AiReviewIssue,
    detail: AiFixDetail): string {
    const target = (issue.targetDevice ?? detail.refName ?? detail.libDevId ?? '').trim();
    for (let i = 0; i < topo.deviceList.length; i++) {
      const d = topo.deviceList[i];
      if (d.refName !== target && d.libDevId !== target) {
        continue;
      }
      if (d.libDevId === 'VCC' || d.libDevId === 'GND') {
        if (!this.isOrphanPowerSymbol(topo, d)) {
          return `power ${d.refName} still wired to load`;
        }
      } else if (this.isDeviceOnAnyNet(topo, d.instUuid)) {
        return `${d.refName} still on a net`;
      }
    }
    return 'no safe single target';
  }

  /** 非 MCU 电路：删除自审误加且完全浮空的滤波电容（不碰 LED/开关/电阻） */
  private pruneOrphanFixDevices(topo: SchTopology): number {
    if (this.topoHasMcu(topo)) {
      return 0;
    }
    const before = topo.deviceList.length;
    topo.deviceList = topo.deviceList.filter(d => {
      if (!d.libDevId.startsWith('C_')) {
        return true;
      }
      return this.isDeviceOnAnyNet(topo, d.instUuid);
    });
    return before - topo.deviceList.length;
  }

  private notifyDegraded(stage: string): void {
    const eventData: DegradedEventData = {
      message: `AI服务不可用 [${stage}]，已拒绝模板回退`
    };
    const payload: ModuleEventPayload = {
      event: ModuleEvent.SIMULATION_STOPPED,
      source: 'ai_pipeline',
      timestamp: Date.now(),
      data: eventData
    };
    EventBus.getInstance().publish(payload);
  }

  /** ≥2 LED + (RELAY 或 SW)：用于 AI 纠错提示，不替代 LLM */
  /** 编辑模式 partialTopo → prompt JSON（显式接口，避免匿名对象字面量） */
  private static formatPartialTopoForPrompt(topo: SchTopology): string {
    const items: PartialTopoPromptItem[] = [];
    for (let i = 0; i < topo.deviceList.length; i++) {
      const d = topo.deviceList[i];
      const item: PartialTopoPromptItem = {
        ref: d.refName,
        id: d.libDevId,
        x: d.x,
        y: d.y,
        rot: d.rotate
      };
      items.push(item);
    }
    return JSON.stringify(items);
  }

  /**
   * 增量 edit 全量现图上下文：器件+网脚+标号+导线摘要。
   * 供 edit_plan LLM 阅读后局部修改。
   */
  private static formatEditContextForPrompt(topo: SchTopology): string {
    const uuidToRef = new Map<string, string>();
    const devices: EditCtxDevice[] = [];
    for (let i = 0; i < topo.deviceList.length; i++) {
      const d = topo.deviceList[i];
      uuidToRef.set(d.instUuid, d.refName);
      const params: Record<string, string> = {};
      if (d.params) {
        const pKeys = Array.from(d.params.keys());
        for (let pi = 0; pi < pKeys.length; pi++) {
          const pk = pKeys[pi];
          params[pk] = d.params.get(pk) ?? '';
        }
      }
      const item: EditCtxDevice = {
        instUuid: d.instUuid,
        ref: d.refName,
        id: d.libDevId,
        x: Math.round(d.x),
        y: Math.round(d.y),
        rot: d.rotate ?? 0,
        params: params
      };
      devices.push(item);
    }
    const nets: EditCtxNet[] = [];
    for (let ni = 0; ni < topo.netList.length; ni++) {
      const net = topo.netList[ni];
      const pins: string[] = [];
      for (let ki = 0; ki < (net.nodeList?.length ?? 0); ki++) {
        const node = net.nodeList[ki];
        const ref = uuidToRef.get(node.devUuid) ?? node.devUuid;
        pins.push(`${ref}.${node.pinId}`);
      }
      const nItem: EditCtxNet = {
        name: net.netName,
        power: !!net.isPower,
        pins: pins
      };
      nets.push(nItem);
    }
    const labels: string[] = [];
    for (let li = 0; li < topo.netLabelList.length; li++) {
      const lb = topo.netLabelList[li];
      labels.push(`${lb.text}@(${Math.round(lb.x)},${Math.round(lb.y)})`);
    }
    const wireReport = PromptLoader.buildWirePathReport(topo);
    const ctx: EditCtxRoot = {
      devices: devices,
      nets: nets,
      labels: labels,
      wireSummary: wireReport.length > 3500 ? wireReport.substring(0, 3500) + '…' : wireReport,
      stats: {
        devices: devices.length,
        nets: nets.length,
        wires: topo.wireList.length,
        labels: labels.length
      }
    };
    return JSON.stringify(ctx);
  }

  /**
   * 真正增量 edit 流水线：深拷贝现图 → edit_plan LLM → 增删/移动器件 → merge 建网 → 仅布变更网 → ERC。
   * 跳过全量 device_select / layout。qualityHardFail 下 WAR + 禁残留。
   */
  async runEditPipeline(opts: PipelineOptions,
    onProgress?: ProgressCallback): Promise<AiPipelineResult> {
    return await this.runEditIncrementalPipeline(opts, onProgress);
  }

  /**
   * 真正增量 edit 流水线：深拷贝现图 → edit_plan LLM → 增删/移动器件 → merge 建网 → 仅布变更网 → ERC。
   * 跳过全量 device_select / layout。
   */
  private async runEditIncrementalPipeline(opts: PipelineOptions,
    onProgress?: ProgressCallback): Promise<AiPipelineResult> {
    let usedLlm = false;
    let degradedMode = false;
    const src = opts.partialTopo as SchTopology;
    let topo = mapAwareParse<SchTopology>(mapAwareStringify(src));
    if (!(topo.schName && topo.schName.length > 0)) {
      topo.schName = 'AI Edited';
    }

    this.markStage('intent');
    this.activeIntent = opts.circuitIntent ?? classifyCircuitIntent(opts.prompt);
    this.activeIntent = refineIntentFromTopo(this.activeIntent, topo);
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] edit incremental START | ${formatIntentLog(this.activeIntent)}` +
      ` keepDevs=${topo.deviceList.length} nets=${topo.netList.length} wires=${topo.wireList.length}`);
    this.stageMetric('intent', `edit|${formatIntentLog(this.activeIntent)}`);
    this.endStage(true, 'edit incremental');
    traceAiOp('AI_PIPE', 'pipeline_start',
      `mode=edit incremental devices=${topo.deviceList.length}`);

    onProgress?.(makeProgress(8, '读取现有电路并规划增量修改'));
    this.markStage('edit_plan');
    opts.onStreamSnapshot?.(topo, 'edit_plan');

    let editPlan = await this.fetchEditPlanLlm(topo, opts);
    if (this.isCancelRequested()) {
      return this.cancelPipelineResult();
    }
    for (let outer = 0; !editPlan.fromLlm && !opts.skipLlm && outer < NEVER_ABORT_OUTER; outer++) {
      if (this.isCancelRequested()) {
        return this.cancelPipelineResult();
      }
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] KEEP_RETRY edit_plan outer=${outer + 1}/${NEVER_ABORT_OUTER}`);
      onProgress?.(makeProgress(8, `增量计划重试 ${outer + 1}`));
      editPlan = await this.fetchEditPlanLlm(topo, opts);
    }
    if (!editPlan.fromLlm && !opts.skipLlm) {
      for (let hard = 0; !editPlan.fromLlm && hard < NEVER_ABORT_OUTER; hard++) {
        if (this.isCancelRequested()) {
          return this.cancelPipelineResult();
        }
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] KEEP_RETRY edit_plan hard=${hard + 1}/${NEVER_ABORT_OUTER}`);
        onProgress?.(makeProgress(8, `增量计划强刷 ${hard + 1}`));
        editPlan = await this.fetchEditPlanLlm(topo, opts);
      }
      if (!editPlan.fromLlm) {
        if (opts.qualityHardFail && !opts.skipLlm) {
          this.endStage(false, 'ABORT no edit_plan');
          Logger.error(INSTR_TRACE_TAG,
            '[AI_PIPE] ABORT edit_plan LLM unavailable (qualityHardFail)');
          return abortPipelineResult('edit_plan',
            '增量编辑计划 LLM 不可用，质量硬失败中止',
            '检查 AI API 配置后重试', usedLlm);
        }
        // 非硬失败：无增量计划则保持现图继续（不整图重生成）
        degradedMode = true;
        this.endStage(true, 'edit_plan keep-as-is');
        Logger.warn(INSTR_TRACE_TAG,
          '[AI_PIPE] KEEP_RETRY ACCEPT edit_plan unavailable — keep current topology (no ABORT)');
        return {
          topology: topo,
          usedLlm,
          degradedMode: true,
          ercClean: false,
          ercErrors: [{
            errType: 'edit_plan',
            targetUuid: '',
            desc: '增量编辑计划 LLM 暂不可用，已保留现图（未中止）',
            suggest: '检查 AI API 后重试增量编辑',
            severity: 'warning'
          }],
          geoBlocking: 0,
          selectResult: undefined
        };
      }
    }
    if (editPlan.fromLlm) {
      usedLlm = true;
    }
    const addN = editPlan.output.addRequireList.length;
    const remN = editPlan.output.removeRefs.length;
    const moveN = editPlan.output.moves.length;
    const planNetN = editPlan.output.netPlan.nets.length;
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] edit incremental | keepDevs=${topo.deviceList.length} add=${addN}` +
      ` remove=${remN} moves=${moveN} planNets=${planNetN}`);
    this.stageMetric('edit_plan',
      `add=${addN} remove=${remN} moves=${moveN} nets=${planNetN}`);
    this.endStage(true, `add=${addN} remove=${remN} nets=${planNetN}`);
    onProgress?.(makeProgress(20,
      `增量计划: +${addN}/-${remN} 器件, 目标网${planNetN}`));

    // 应用器件增删与局部移动（不跑全量 layout）
    this.markStage('edit_apply_devices');
    const applyStat = this.applyEditDeviceChanges(topo, editPlan.output);
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] edit apply devices | added=${applyStat.added} removed=${applyStat.removed}` +
      ` moved=${applyStat.moved} now=${topo.deviceList.length}`);
    this.endStage(true, `added=${applyStat.added} removed=${applyStat.removed}`);
    opts.onStreamSnapshot?.(topo, 'placement');
    this.logTopoFieldDiag('edit_placement', topo);

    // merge 建网
    onProgress?.(makeProgress(45, '增量合并网络'));
    this.markStage('net_plan');
    let netPlan: NetPlanResult = editPlan.output.netPlan;
    if (netPlan.nets.length === 0) {
      // 计划未带 nets 时再拉 net_plan，但注入现图上下文
      const npFetch = await this.fetchNetPlanLlmForEdit(topo, opts);
      if (npFetch.fromLlm) {
        usedLlm = true;
        netPlan = npFetch.output;
      }
    }
    let preservedNetNames: string[] = [];
    let changedNetNames: string[] = [];
    if (netPlan.nets.length === 0) {
      if (opts.qualityHardFail && !opts.skipLlm) {
        this.endStage(false, 'ABORT empty nets');
        Logger.error(INSTR_TRACE_TAG,
          '[AI_PIPE] ABORT edit empty nets (qualityHardFail)');
        return abortPipelineResult('net_plan',
          '增量编辑无有效网络计划，质量硬失败中止',
          '补充修改说明或检查 API 后重试', usedLlm);
      }
      // 非硬失败：无增量网则保留现图网络继续
      degradedMode = true;
      this.endStage(true, 'empty nets KEEP');
      Logger.warn(INSTR_TRACE_TAG,
        '[AI_PIPE] KEEP_RETRY ACCEPT edit empty nets — keep existing topology nets (no ABORT)');
    } else {
      NetPlanExecutor.setComponentLibrary(this.componentLibrary);
      NetPlanExecutor.prepareModes(netPlan);
      const pairs = NetPlanExecutor.collectWiredCompactPairs(netPlan);
      // 增量：仅对变更相关的导线对拉近（compact 仍安全，未改网指纹不变则 merge 保留）
      if (pairs.length > 0) {
        this.placementOptimizer.compactDevicesForWiredNets(topo, pairs, 120);
      }
      const mergeResult = NetPlanExecutor.executeMerge(topo, netPlan, editPlan.output.removeNetNames);
      topo = mergeResult.topology;
      preservedNetNames = mergeResult.preservedNetNames;
      changedNetNames = mergeResult.changedNetNames;
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] edit merge | preserve=${preservedNetNames.length}` +
        ` change=${changedNetNames.length} wires=${topo.wireList.length}`);
      this.stageMetric('net_plan',
        `merge preserve=${preservedNetNames.length} change=${changedNetNames.length}`);
      this.endStage(true,
        `preserve=${preservedNetNames.length} change=${changedNetNames.length}`);
      opts.onStreamSnapshot?.(topo, 'net_plan');
      this.logTopoFieldDiag('net_plan', topo);
      onProgress?.(makeProgress(70,
        `合并网络: 保留${preservedNetNames.length}/变更${changedNetNames.length}`));
    }

    // 布线：仅变更网
    onProgress?.(makeProgress(78, '局部布线'));
    this.markStage('astar');
    const routeLlm: LlmFetchResult<RoutingLlmOutput> = {
      output: ConstrainedWiringEngine.defaultConstraints(topo),
      fromLlm: false
    };
    this.mergeNetPlanHintsIntoRouting(routeLlm.output, { output: netPlan, fromLlm: true });
    this.sanitizeRoutingForceModes(routeLlm.output, topo);
    this.lastRoutingConstraints = routeLlm.output;

    const netWaypoints = new Map<string, Point2D[]>();
    for (const net of netPlan.nets) {
      if (net.routeWaypoints && net.routeWaypoints.length > 0 &&
        changedNetNames.indexOf(net.name) >= 0) {
        const flat: Point2D[] = [];
        for (const seg of net.routeWaypoints) {
          for (const wp of seg) {
            flat.push(wp);
          }
        }
        if (flat.length > 0) {
          netWaypoints.set(net.name, flat);
        }
      }
    }
    this.lastNetWaypoints = netWaypoints.size > 0 ? netWaypoints : null;

    let routeResult: RouteResult = {
      routeLines: topo.wireList.slice(),
      crossCount: 0,
      totalLineLength: 0,
      isolateAnalogDigital: false,
      xtalShortPath: true,
      diffLineEqualLength: true,
      spacingIssues: []
    };
    if (changedNetNames.length > 0) {
      const astarT0 = Date.now();
      if (opts.qualityHardFail && !opts.skipLlm) {
        // 仅清变更网导线后 WAR 重布
        const preserve = new Set<string>();
        for (let i = 0; i < preservedNetNames.length; i++) {
          preserve.add(preservedNetNames[i]);
        }
        const kept: RouteLine[] = [];
        for (let wi = 0; wi < topo.wireList.length; wi++) {
          const w = topo.wireList[wi];
          const net = topo.netList.find(n => n.netUuid === w.netUuid);
          const nName = net?.netName ?? '';
          if (preserve.has(nName) || changedNetNames.indexOf(nName) < 0) {
            kept.push(w);
          }
        }
        topo.wireList = kept;
        const war = await this.warAdapter.routeTopology(topo, true,
          () => this.isCancelRequested());
        if (!war.ok) {
          Logger.error(INSTR_TRACE_TAG, `[AI_PIPE] ABORT edit WAR | ${war.reason}`);
          this.endStage(false, war.reason);
          return abortPipelineResult('war_route', war.reason,
            '调整摆放间距后重试增量编辑', usedLlm);
        }
        routeResult = {
          routeLines: topo.wireList,
          crossCount: 0,
          totalLineLength: 0,
          isolateAnalogDigital: false,
          xtalShortPath: false,
          diffLineEqualLength: false
        };
        Logger.info(INSTR_TRACE_TAG,
          `[AI_AGENT] route via WAR edit wires=${topo.wireList.length}` +
          ` routedNets=${war.routedNets} ms=${Date.now() - astarT0}`);
      } else {
        this.wiringEngine.setPreserveNetNames(topo, preservedNetNames);
        routeResult = await this.wiringEngine.routeUntilCleanAsync(topo, routeLlm.output,
          opts.routingWeights, netWaypoints, 3);
        topo.wireList = routeResult.routeLines;
        Logger.info(INSTR_TRACE_TAG,
          `[AI_PIPE] edit routed wires=${topo.wireList.length} ms=${Date.now() - astarT0}` +
          ` changed=[${changedNetNames.slice(0, 8).join(',')}]`);
      }
    } else {
      Logger.info(INSTR_TRACE_TAG, '[AI_PIPE] edit skip route — no changed nets');
      this.wiringEngine.clearPreserveNets();
    }
    this.stageMetric('astar', `wires=${topo.wireList.length} changed=${changedNetNames.length}`);
    this.endStage(true, `wires=${topo.wireList.length}`);
    opts.onStreamSnapshot?.(topo, 'routing');
    this.logTopoFieldDiag('routing', topo);

    // ERC + 自检闭环（与 oneshot 共用）
    onProgress?.(makeProgress(90, 'ERC 静态校验'));
    this.markStage('erc');
    let ercErrors = this.collectErc(topo);
    const pinConnIssues = this.auditNetPinConnectivity(topo);
    for (let pi = 0; pi < pinConnIssues.length; pi++) {
      ercErrors.push(pinConnIssues[pi]);
    }
    topo.ercErrorList = ercErrors;
    let ercHard = this.countPipelineBlocking(ercErrors, opts, topo);
    this.endStage(ercHard === 0, `blocking=${ercHard}`);

    let geoIssues = this.collectGeometricIssues(topo);
    const congestionIssues = this.collectCongestionIssues(topo);
    for (const ci of congestionIssues) {
      geoIssues.push(ci);
    }

    this.markStage('self_review_clear');
    const cleared = await this.runErcGeoClearLoop(topo, ercErrors, geoIssues, opts,
      onProgress, usedLlm, 93);
    topo = cleared.topo;
    ercErrors = cleared.ercErrors;
    usedLlm = cleared.usedLlm;
    const aiFixApplied = cleared.aiFixApplied;
    const ercHardFinal = cleared.ercHard;
    const geoHard = cleared.geoHard;
    const ercClean = ercHardFinal === 0 && geoHard === 0;

    this.markStage('gate');
    if (ercClean) {
      Logger.info(INSTR_TRACE_TAG, '[AI_PIPE] edit gate PASS');
      this.endStage(true, 'PASS');
    } else {
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] edit GATE_DELIVER residual erc=${ercHardFinal} geo=${geoHard}`);
      this.endStage(true, `DELIVER residual erc=${ercHardFinal}`);
    }

    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] END edit incremental usedLlm=${usedLlm} degraded=${degradedMode}` +
      ` devices=${topo.deviceList.length} wires=${topo.wireList.length}` +
      ` preserveNets=${preservedNetNames.length}` +
      ` changedNets=${changedNetNames.length}` +
      ` add=${applyStat.added} remove=${applyStat.removed} ercClean=${ercClean}`);
    traceAiOp('AI_PIPE', 'pipeline_end',
      `mode=edit incremental devices=${topo.deviceList.length} wires=${topo.wireList.length}` +
      ` changedNets=${changedNetNames.length} ercClean=${ercClean}`);
    this.logTopoFieldDiag('pipeline_end', topo);

    // 编辑路径：残留标记由上层做软接受决策
    if (opts.qualityHardFail && !opts.skipLlm && !ercClean) {
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] edit residual deliver with qualityHardFail ercClean=false geo=${geoHard} — soft accept`);
    }

    const emptyPos: Record<string, DevicePosition> = {};
    const placement: PlacementResult = {
      topology: topo,
      candidates: [{ devicePositions: emptyPos, fitnessScore: 1.0 }],
      selectedIndex: 0
    };
    const selectResult: DeviceSelectResult = {
      devices: [],
      alternatives: new Map<string, string[]>(),
      oodDetected: false,
      matchedRequireCount: 0
    };

    onProgress?.(makeProgress(100,
      ercClean
        ? `增量编辑完成 · 保留网${preservedNetNames.length}/变更${changedNetNames.length}`
        : '增量编辑已交付（残留已尽力）',
      true));
    return {
      selectResult,
      placementResult: placement,
      routeResult,
      ercErrors,
      topology: topo,
      usedLlm,
      degradedMode,
      ercClean,
      geoBlocking: geoHard,
      deliveredWithResidual: !ercClean
    };
  }

  /** 应用 edit_plan 的增删器件与局部移动 */
  private applyEditDeviceChanges(topo: SchTopology, plan: EditPlanParsed): EditApplyStat {
    let removed = 0;
    let added = 0;
    let moved = 0;
    // remove
    if (plan.removeRefs.length > 0) {
      const rem = new Set<string>();
      for (let i = 0; i < plan.removeRefs.length; i++) {
        rem.add(plan.removeRefs[i].toUpperCase());
      }
      const kept: DeviceInst[] = [];
      for (let i = 0; i < topo.deviceList.length; i++) {
        const d = topo.deviceList[i];
        const refU = (d.refName ?? '').toUpperCase();
        const uuidU = (d.instUuid ?? '').toUpperCase();
        if (rem.has(refU) || rem.has(uuidU)) {
          removed++;
          continue;
        }
        kept.push(d);
      }
      topo.deviceList = kept;
    }
    // moves
    for (let i = 0; i < plan.moves.length; i++) {
      const m = plan.moves[i];
      const key = (m.ref ?? '').trim();
      if (key.length === 0) {
        continue;
      }
      for (let di = 0; di < topo.deviceList.length; di++) {
        const d = topo.deviceList[di];
        if (d.refName === key || d.instUuid === key) {
          d.x = m.x;
          d.y = m.y;
          if (m.rotate !== undefined) {
            d.rotate = m.rotate;
          }
          moved++;
          break;
        }
      }
    }
    // add
    if (plan.addRequireList.length > 0) {
      const llmOut: DeviceSelectLlmOutput = {
        functionModule: ['edit_add'],
        deviceRequireList: plan.addRequireList,
        circuitConstraint: '',
        oodFlags: []
      };
      const matched = this.selectEngine.matchFromLlmOutput(llmOut, 'edit_add');
      const usedRefs = new Set<string>();
      for (let i = 0; i < topo.deviceList.length; i++) {
        usedRefs.add(topo.deviceList[i].refName);
      }
      let maxX = 200;
      let maxY = 200;
      for (let i = 0; i < topo.deviceList.length; i++) {
        maxX = Math.max(maxX, topo.deviceList[i].x);
        maxY = Math.max(maxY, topo.deviceList[i].y);
      }
      let placeX = Math.min(1200, Math.round(maxX / 20) * 20 + 160);
      let placeY = Math.min(800, Math.round(maxY / 20) * 20);
      for (let i = 0; i < matched.devices.length; i++) {
        const md = matched.devices[i];
        const refName = this.allocUniqueRefName(md.libDevId, usedRefs);
        const inst = makeDeviceInst(
          IdUtil.generate('inst'),
          md.libDevId,
          refName,
          placeX,
          placeY,
          0,
          md.params
        );
        topo.deviceList.push(inst);
        added++;
        placeY += 100;
        if (placeY > 720) {
          placeY = 200;
          placeX = Math.min(1200, placeX + 140);
        }
      }
    }
    const stat: EditApplyStat = { added, removed, moved };
    return stat;
  }

  private async fetchEditPlanLlm(topo: SchTopology, opts: PipelineOptions):
    Promise<LlmFetchResult<EditPlanParsed>> {
    const emptyPlan: EditPlanParsed = {
      keepAllDevices: true,
      addRequireList: [],
      removeRefs: [],
      moves: [],
      netMode: 'merge',
      netPlan: {
        nets: [],
        labels: [],
        wiringHints: { priorityOrder: [], forceWire: [], forceLabel: [] },
        topologyNotes: ''
      },
      removeNetNames: []
    };
    if (opts.skipLlm) {
      return { output: emptyPlan, fromLlm: false };
    }
    const tpl = PromptLoader.load('edit_plan');
    if (!tpl.system || tpl.system.length === 0) {
      return { output: emptyPlan, fromLlm: false };
    }
    const editCtx = AiPipelineOrchestrator.formatEditContextForPrompt(topo);
    try {
      traceAiPayload('AI_PIPE', 'EDIT_CONTEXT', editCtx,
        `stage=edit_plan devices=${topo.deviceList.length} nets=${topo.netList.length}`);
    } catch (_e) {
      // ignore
    }
    const deviceDetail = PromptLoader.buildDeviceDetailForNetPlan(topo, this.componentLibrary);
    const usage = PromptLoader.buildDeviceUsageBlock(
      PromptLoader.libIdsFromTopo(topo), 'full', this.componentLibrary);
    // 手册 + 全库器件/仪器意图片段 + 555 脚级配方（有则叠加）
    let usageText = usage.text;
    const boardLibIds = PromptLoader.libIdsFromTopo(topo);
    const boardFrags = assembleEditDeviceInstrumentFragments(this.activeIntent, boardLibIds);
    if (boardFrags.length > 0) {
      usageText = `${boardFrags}\n${usageText}`;
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] edit_plan inject device/instrument fragments ` +
        `libIds=${boardLibIds.length} catalog=${countDevInstrCatalog()} chars=${boardFrags.length}`);
    }
    const has555OnBoard = AiTopologyFixKit.topoHas555(topo);
    if (this.activeIntent.timer555Monostable ||
      (has555OnBoard && this.topoWants555Monostable(topo))) {
      usageText = `${FRAG_555_MONOSTABLE}\n${FRAG_NET_555_MONOSTABLE}\n${usageText}`;
      Logger.info(INSTR_TRACE_TAG, '[AI_PIPE] edit_plan inject 555 monostable manual fragments');
    } else if (this.activeIntent.timer555Astable ||
      this.activeIntent.reasons.indexOf('555_astable') >= 0 ||
      this.activeIntent.reasons.indexOf('555_astable_topo') >= 0 ||
      (has555OnBoard && (this.activeIntent.blinkOscillator || this.activeIntent.needsLedSeriesR))) {
      usageText = `${FRAG_555_ASTABLE}\n${FRAG_NET_555_ASTABLE}\n${usageText}`;
      Logger.info(INSTR_TRACE_TAG, '[AI_PIPE] edit_plan inject 555 astable manual fragments');
    } else if (has555OnBoard) {
      // 板上有 555 但意图未分清：默认按无稳态脚级清单约束（修接更常见）
      usageText = `${FRAG_555_ASTABLE}\n${FRAG_NET_555_ASTABLE}\n${usageText}`;
      Logger.info(INSTR_TRACE_TAG, '[AI_PIPE] edit_plan inject 555 astable (board has LM555)');
    }
    const vars: PromptVarEntry[] = [
      { key: 'user_prompt', value: opts.prompt },
      { key: 'edit_context', value: editCtx },
      { key: 'device_detail', value: deviceDetail },
      { key: 'device_usage', value: usageText }
    ];
    if (opts.conversationHistory && opts.conversationHistory.length > 0) {
      const historyText = opts.conversationHistory
        .map(h => `[${h.role}]: ${h.content}`)
        .join('\n');
      vars.push({
        key: 'conversation_history',
        value: `对话历史（前序轮次）：\n${historyText}\n\n`
      });
    } else {
      vars.push({ key: 'conversation_history', value: '' });
    }
    const prompt = PromptLoader.renderEnriched(tpl, vars, this.componentLibrary,
      { intent: this.activeIntent });

    const api = await this.chatWithRetry(prompt, AiCapability.COMPONENT_RECOMMEND,
      this.stageChatOpts({
        temperature: 0.05,
        maxTokens: AiPipelineOrchestrator.maxTokensForStage('net_plan')
      }));
    if (!api.success || !api.data || api.data.length === 0) {
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] edit_plan API failed: ${api.error ?? 'empty'}`);
      return { output: emptyPlan, fromLlm: false };
    }
    if (!PromptLoader.isStrictJsonObjectReply(api.data)) {
      Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] edit_plan JSON impurity — try extract');
    }
    const raw = PromptLoader.extractJson<Object>(api.data);
    const parsed = this.normalizeEditPlan(raw);
    if (!parsed || parsed.netPlan.nets.length === 0) {
      Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] edit_plan normalize empty nets');
      return { output: emptyPlan, fromLlm: false };
    }
    try {
      traceAiPayload('AI_PIPE', 'EDIT_PLAN_JSON', mapAwareStringify(parsed),
        `stage=edit_plan nets=${parsed.netPlan.nets.length}`);
    } catch (_e) {
      // ignore
    }
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] edit_plan OK nets=${parsed.netPlan.nets.length}` +
      ` add=${parsed.addRequireList.length} remove=${parsed.removeRefs.length}`);
    return { output: parsed, fromLlm: true };
  }

  /** edit 态专用 net_plan：注入现图网摘要，要求基于现图修改 */
  private async fetchNetPlanLlmForEdit(topo: SchTopology, opts: PipelineOptions):
    Promise<LlmFetchResult<NetPlanResult>> {
    const base = await this.fetchNetPlanLlm(topo, opts);
    return base;
  }

  private normalizeEditPlan(raw: Object | null): EditPlanParsed | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const src = raw as Record<string, Object>;
    const netPlan = NetPlanExecutor.normalizeLlmPlan(raw);
    if (!netPlan) {
      return null;
    }
    const addRaw = src['addRequireList'] ?? src['add_require_list'] ?? [];
    const addRequireList: DeviceRequirement[] = [];
    if (Array.isArray(addRaw)) {
      for (let i = 0; i < (addRaw as Object[]).length; i++) {
        const o = (addRaw as Object[])[i];
        if (!o || typeof o !== 'object') {
          continue;
        }
        const r = o as Record<string, Object>;
        const func = `${r['func'] ?? r['function'] ?? ''}`.trim();
        const devType = `${r['devType'] ?? r['dev_type'] ?? ''}`.trim();
        const model = `${r['explicitModel'] ?? r['explicit_model'] ?? ''}`.trim();
        const pri = Number(r['priority'] ?? 5);
        const paramRaw = r['paramConstraint'] ?? r['param_constraint'];
        let paramConstraint = emptyStringMap();
        if (paramRaw !== undefined && paramRaw !== null && typeof paramRaw === 'object') {
          paramConstraint = ensureStringMap(paramRaw as Record<string, string>);
        }
        const req: DeviceRequirement = {
          func: func.length > 0 ? func : (model || 'add'),
          devType: devType.length > 0 ? devType : 'device',
          paramConstraint: paramConstraint,
          priority: isNaN(pri) ? 5 : pri,
          explicitModel: model.length > 0 ? model : undefined
        };
        addRequireList.push(req);
      }
    }
    const removeRefs: string[] = [];
    const remRaw = src['removeRefs'] ?? src['remove_refs'] ?? [];
    if (Array.isArray(remRaw)) {
      for (let i = 0; i < (remRaw as Object[]).length; i++) {
        const s = `${(remRaw as Object[])[i]}`.trim();
        if (s.length > 0) {
          removeRefs.push(s);
        }
      }
    }
    const moves: EditPlanMove[] = [];
    const movesRaw = src['moves'] ?? [];
    if (Array.isArray(movesRaw)) {
      for (let i = 0; i < (movesRaw as Object[]).length; i++) {
        const o = (movesRaw as Object[])[i];
        if (!o || typeof o !== 'object') {
          continue;
        }
        const m = o as Record<string, Object>;
        const ref = `${m['ref'] ?? m['refDes'] ?? m['deviceId'] ?? m['instUuid'] ?? ''}`.trim();
        const x = Number(m['x'] ?? 0);
        const y = Number(m['y'] ?? 0);
        const rotate = Number(m['rotate'] ?? m['rotation'] ?? 0);
        if (ref.length > 0 && !isNaN(x) && !isNaN(y)) {
          const mv: EditPlanMove = { ref, x, y, rotate: isNaN(rotate) ? 0 : rotate };
          moves.push(mv);
        }
      }
    }
    const removeNetNames: string[] = [];
    const rnRaw = src['removeNetNames'] ?? src['remove_net_names'] ?? [];
    if (Array.isArray(rnRaw)) {
      for (let i = 0; i < (rnRaw as Object[]).length; i++) {
        const s = `${(rnRaw as Object[])[i]}`.trim();
        if (s.length > 0) {
          removeNetNames.push(s);
        }
      }
    }
    const keepAll = src['keepAllDevices'] ?? src['keep_all_devices'];
    const parsed: EditPlanParsed = {
      keepAllDevices: keepAll === undefined || keepAll === null ? true : !!keepAll,
      addRequireList,
      removeRefs,
      moves,
      netMode: `${src['netMode'] ?? src['net_mode'] ?? 'merge'}`,
      netPlan,
      removeNetNames
    };
    return parsed;
  }

  private static isMutualLedSwitchPrompt(prompt: string): boolean {
    return intentIsMutualLedSwitch(prompt);
  }

  /** AI 选型结果审查：HARD/SOFT 分流 */
  private critiqueDeviceSelectSplit(out: DeviceSelectLlmOutput, prompt: string,
    intent: CircuitIntent): CritiqueSplit {
    const split = splitEmpty();
    const list = out.deviceRequireList ?? [];
    for (let i = 0; i < list.length; i++) {
      const req = list[i];
      const model = (req.explicitModel ?? '').trim();
      if (model.length === 0) {
        split.hard.push(`器件「${req.func}/${req.devType}」缺少 explicitModel — 必须填写库内精确 libDevId`);
        continue;
      }
      const got = this.componentLibrary.getComponent(model);
      if (!got.success || !got.data) {
        split.hard.push(`explicitModel=${model} 不在器件库中 — 只能从注入的库清单中选精确 ID，禁止编造`);
      }
    }

    if (intent.mutualLedIndicator) {
      const mutualSplit = AiPipelineOrchestrator.critiqueMutualLedSelectSplit(out);
      for (let mh = 0; mh < mutualSplit.hard.length; mh++) {
        split.hard.push(mutualSplit.hard[mh]);
      }
      for (let ms = 0; ms < mutualSplit.soft.length; ms++) {
        split.soft.push(mutualSplit.soft[ms]);
      }
    }

    const models = list.map(r => (r.explicitModel ?? '').toUpperCase());
    const devTypes = list.map(r => (r.devType ?? '').toUpperCase());
    const allIds = models.concat(devTypes);

    if (intent.needsPowerRails) {
      const hasVcc = allIds.some(m => m === 'VCC');
      const hasGnd = allIds.some(m => m === 'GND');
      const hasVee = allIds.some(m => m === 'VEE');
      const isModular = prompt.indexOf('【模块并行约束') >= 0;
      const instrumentOnly = this.isInstrumentOnlyDeviceSelect(list);
      if (!hasVcc) {
        // 仪器观测子模块：电源由 POWER joints 合并，强制 VCC 会造成孤立电源 ERC
        if (isModular && instrumentOnly) {
          split.soft.push('模块并行仪器子模块可省略 VCC（合并阶段 POWER joints 供电源）');
        } else {
          split.hard.push('缺失 VCC 电源符号 — 任何电路都必须包含 VCC');
        }
      }
      if (!hasGnd) {
        split.hard.push('缺失 GND 接地符号 — 任何电路都必须包含 GND');
      }
      if (intent.dualSupply && !hasVee) {
        split.hard.push('双电源意图缺失 VEE 负压符号 — 须输出 explicitModel=VEE');
      }
    }
    // 防御：prompt 自激时强制清 SIGNAL_GEN 意图，避免误 HARD
    const selfOsc = isOpAmpSelfOscillatorPrompt(prompt);
    if (selfOsc) {
      applySelfOscSignalGenGuard(intent, prompt);
    }
    const hasSigBom = allIds.some(m => m.indexOf('SIGNAL_GEN') >= 0);
    if (selfOsc && hasSigBom) {
      split.hard.push(
        '运放自激/闭环振荡（滞回+积分）禁止 SIGNAL_GEN — 方波由比较器自产，请删除信号发生器');
    }
    // 自激 BOM：≥2 运放通道 + ≥3R + ≥1C + 示波器（防漏滞回电阻导致 clear-loop 乱修）
    if (selfOsc) {
      let opChannels = 0;
      for (let oi = 0; oi < models.length; oi++) {
        const m = models[oi];
        if (m.indexOf('LM358') >= 0 || m.indexOf('TL082') >= 0 || m.indexOf('LM324') >= 0) {
          opChannels += 2;
        } else if (m.indexOf('UA741') >= 0 || m.indexOf('LM741') >= 0 ||
          (m.indexOf('741') >= 0 && m.indexOf('74HC') < 0)) {
          opChannels += 1;
        }
      }
      const rCnt = models.filter(m => m.startsWith('R_')).length;
      const cCnt = models.filter(m => m.startsWith('C_')).length;
      const hasOsc = allIds.some(m => m.indexOf('OSCILLOSCOPE') >= 0);
      if (opChannels < 2) {
        split.hard.push(
          '自激振荡须≥2 路运放：两片 UA741，或一片 LM358/TL082（双通道）');
      }
      if (rCnt < 3) {
        split.hard.push(
          '自激振荡须≥3 电阻：滞回 Rf+Rg + 积分 Rin（推荐 R_100k/R_10k/R_10k）');
      }
      if (cCnt < 1) {
        split.hard.push('自激振荡须含积分反馈电容 C_*（推荐 C_100nF）');
      }
      if (!hasOsc) {
        split.hard.push('自激振荡须含 OSCILLOSCOPE（CH1∥方波、CH2∥三角）');
      }
    }
    if (intent.needsSignalGen && !selfOsc) {
      if (!hasSigBom) {
        split.hard.push('需要 SIGNAL_GEN 信号发生器（waveform=sine|square|triangle）');
      }
    }
    if (intent.needsOpAmpIntegrator) {
      const hasOp = allIds.some(m =>
        m.indexOf('UA741') >= 0 || m.indexOf('TL082') >= 0 || m.indexOf('LM358') >= 0 ||
        m.indexOf('LM324') >= 0 || m.indexOf('741') >= 0);
      const hasR = models.some(m => m.startsWith('R_'));
      const hasC = models.some(m => m.startsWith('C_'));
      const hasVee = allIds.some(m => m === 'VEE');
      if (!hasOp) {
        split.hard.push('积分电路必须含运放（UA741/TL082/LM358 等库内型号）');
      }
      if (!hasR || !hasC) {
        split.hard.push('积分电路必须含积分电阻 R_* 与反馈电容 C_*');
      }
      // 仅外激励积分示教要求 SIGNAL_GEN；自激闭环勿硬卡
      if (intent.needsSignalGen && !selfOsc && !hasSigBom) {
        split.hard.push('积分电路必须含 SIGNAL_GEN（方波激励）');
      }
      if (!hasVee) {
        split.hard.push('积分电路必须双电源：输出 VEE（voltage=-12V）与 VCC=12V');
      }
      // 波形：方波激励（仅当 BOM 里真有 SIGNAL_GEN 且非自激）
      if (!selfOsc) {
        for (let ii = 0; ii < list.length; ii++) {
          const id = `${list[ii].explicitModel ?? ''}`.toUpperCase();
          if (id.indexOf('SIGNAL_GEN') < 0) {
            continue;
          }
          const wf = (list[ii].paramConstraint?.get('waveform') ?? '').trim().toLowerCase();
          if (wf.length === 0 || (wf !== 'square' && wf !== 'pulse')) {
            split.hard.push(
              '积分电路 SIGNAL_GEN.waveform 必须为 square（三角是运放输出观测，禁止写成信号源 waveform）');
          }
          const amp = (list[ii].paramConstraint?.get('amplitude') ?? '').trim();
          if (amp.length === 0) {
            split.hard.push('积分电路 SIGNAL_GEN 必须写 param_constraint.amplitude（推荐 "5V"）');
          }
          break;
        }
      }
    }

    // 滞回：幅度过小 → HARD（逼 AI 重出，禁止默默用 1V）
    if (intent.needsHysteresisComparator) {
      for (let hi = 0; hi < list.length; hi++) {
        const id = `${list[hi].explicitModel ?? ''}`.toUpperCase();
        if (id.indexOf('SIGNAL_GEN') < 0) {
          continue;
        }
        const amp = (list[hi].paramConstraint?.get('amplitude') ?? '').trim();
        const ampV = parseSignalAmplitudeVolts(amp);
        if (!Number.isFinite(ampV) || ampV < HYSTERESIS_MIN_SIGNAL_AMP_V) {
          split.hard.push(
            `滞回比较器 SIGNAL_GEN.amplitude 须≥${HYSTERESIS_MIN_SIGNAL_AMP_V}V` +
            `（推荐 ${HYSTERESIS_RECOMMENDED_SIGNAL_AMP}）；禁止 ${amp.length > 0 ? amp : '空/1V'} — 过小会锁死负饱和`);
        }
        break;
      }
    }

    const ledN = models.filter(m => m.indexOf('LED') >= 0).length;
    const rN = models.filter(m => m.startsWith('R_')).length;
    if (intent.needsLedSeriesR && ledN > 0 && rN < ledN && !intent.blinkOscillator) {
      split.soft.push(`有 ${ledN} 颗 LED 但只有 ${rN} 颗电阻 — 每颗 LED 建议配一颗限流电阻(R_330)`);
    }

    if (intent.needsOpAmpFeedback) {
      const hasOpAmp = allIds.some(m =>
        m.indexOf('LM358') >= 0 || m.indexOf('LM324') >= 0 || m.indexOf('OP') >= 0 || m.indexOf('OPAMP') >= 0);
      if (hasOpAmp && rN === 0) {
        split.soft.push('运放电路建议有反馈电阻 — 禁止开环');
      }
    }

    if (intent.needsI2cPullup) {
      const hasI2c = list.some(r =>
        (r.func ?? '').indexOf('I2C') >= 0 || (r.devType ?? '').toUpperCase().indexOf('I2C') >= 0);
      const has4k7 = models.some(m => m === 'R_4.7k' || m === 'R_4K7');
      if (hasI2c && !has4k7) {
        split.soft.push('I2C 器件建议配 4.7kΩ 上拉电阻 (R_4.7k)');
      }
    }

    if (intent.hasMcuMinSystem) {
      const hasMcu = allIds.some(m =>
        m.indexOf('STM32') >= 0 || m.indexOf('AT89') >= 0 || m.indexOf('STC') >= 0 || m.indexOf('MCU') >= 0);
      if (hasMcu) {
        const hasXtal = allIds.some(m =>
          m.indexOf('XTAL') >= 0 || m.indexOf('CRYSTAL') >= 0 || m.indexOf('OSC') >= 0);
        const hasDecap = models.some(m => m === 'C_100nF' || m === 'C_100NF');
        if (!hasXtal) {
          split.soft.push('MCU 最小系统建议包含晶振 (XTAL)');
        }
        if (!hasDecap) {
          split.soft.push('MCU 最小系统建议包含去耦电容 (C_100nF)');
        }
        const hasRstR = models.some(m => m === 'R_10k' || m === 'R_10K');
        if (!hasRstR) {
          split.soft.push('MCU 最小系统建议包含 RST 上拉电阻 (R_10k)');
        }
      }
    }

    if (intent.hasInstruments) {
      const voltN = models.filter(m => m === 'VOLTMETER_DC').length;
      const userWantsNVolt = prompt.match(/(\d+)\s*[个块只]\s*电压表/);
      if (userWantsNVolt && voltN !== parseInt(userWantsNVolt[1])) {
        split.hard.push(`用户要求 ${userWantsNVolt[1]} 个电压表，但输出了 ${voltN} 个`);
      }
      const userWantsAmmeter = prompt.indexOf('电流表') >= 0 || prompt.indexOf('测电流') >= 0;
      const hasAmmeter = models.some(m => m === 'AMMETER_DC');
      if (userWantsAmmeter && !hasAmmeter) {
        split.hard.push('用户要求测电流但缺少 AMMETER_DC');
      }
    }

    // 意图标志 + prompt 双判：防 Agent 路径 intent 未就绪时漏拦 RELAY
    const seriesRc = intent.seriesRcCharge ||
      classifyCircuitIntent(prompt).seriesRcCharge;
    if (seriesRc && !intent.mutualLedIndicator) {
      const hasR = models.some(m => m.startsWith('R_'));
      const hasC = models.some(m => m.startsWith('C_'));
      const hasSw = models.some(m => m.indexOf('SW_') >= 0 || m === 'SW_PUSH');
      const hasRelay = models.some(m => m.indexOf('RELAY') >= 0);
      if (!hasR || !hasC) {
        split.hard.push('串联 RC 充放电必须包含至少一颗 R_* 与一颗 C_*');
      }
      if (hasRelay) {
        split.hard.push(
          'RC 充放电禁止选用 RELAY_SPDT — 用 SW_PUSH 作充电通断，配方为 VCC→SW→R→C→GND');
      }
      if (!hasSw) {
        split.hard.push(
          'RC 充放电必须含 SW_PUSH（VCC→SW→R→RC_MID→C→GND）；禁止用 RELAY 冒充开关');
      }
    }

    // 555 无稳态：强制库内 LM555；缺 CTRL/去耦 → HARD（AI 重出，禁止本地静默补件）
    const has555 = allIds.some(m => m.indexOf('LM555') >= 0 || m === '555');
    const prompt555 = prompt.indexOf('555') >= 0 || prompt.toLowerCase().indexOf('lm555') >= 0;
    if (has555 || prompt555) {
      const hasNe = models.some(m => m.indexOf('NE555') >= 0);
      if (hasNe) {
        split.hard.push('禁止 NE555 等库外型号 — 必须用 explicitModel=LM555');
      }
      if (has555) {
        const hasDecap = models.some(m => m === 'C_100nF' || m === 'C_100NF' || m === 'C_10nF');
        if (!hasDecap) {
          split.hard.push('555 电路必须含 C_100nF（CTRL 旁路到 GND；可再加 VCC 去耦）— 请在 BOM 中输出');
        }
        const hasRa = models.some(m => m.startsWith('R_'));
        const hasCt = models.some(m =>
          m.startsWith('C_') && m.indexOf('100NF') < 0 && m.indexOf('10NF') < 0);
        if (!hasRa || !hasCt) {
          split.hard.push('555 无稳态必须含定时电阻(R_*)与定时电容(C_1uF/C_10uF/C_100uF)');
        }
      }
    }

    // 双电源：缺 voltage / 不对称 → HARD，逼 LLM 改，不本地改电压
    if (intent.dualSupply) {
      let vccBom = '';
      let veeBom = '';
      let hasVccSym = false;
      let hasVeeSym = false;
      for (let bi = 0; bi < list.length; bi++) {
        const id = `${list[bi].explicitModel ?? ''} ${list[bi].devType ?? ''}`.toUpperCase();
        const vv = (list[bi].paramConstraint?.get('voltage') ?? '').trim();
        if (id.indexOf('VEE') >= 0) {
          hasVeeSym = true;
          if (vv.length > 0) {
            veeBom = vv;
          }
        }
        if (id.indexOf('VCC') >= 0 && id.indexOf('VEE') < 0) {
          hasVccSym = true;
          if (vv.length > 0) {
            vccBom = vv;
          }
        }
      }
      if (hasVccSym && vccBom.length === 0) {
        split.hard.push('双电源 VCC 必须写 param_constraint.voltage（如 "12V"）');
      }
      if (hasVeeSym && veeBom.length === 0) {
        split.hard.push('双电源 VEE 必须写 param_constraint.voltage（如 "-12V"）');
      }
      const vccN = parseFloat(vccBom.replace(/[Vv]/g, ''));
      const veeN = parseFloat(veeBom.replace(/[Vv]/g, ''));
      const absVee = Number.isFinite(veeN) ? Math.abs(veeN) : 0;
      if (Number.isFinite(vccN) && vccN === 5 && absVee >= 12) {
        split.hard.push(
          `双电源禁止 VCC=${vccBom} 配 VEE=${veeBom} — 请改为对称轨（如 VCC=12V 与 VEE=-12V）`);
      }
    }

    return split;
  }

  /** 选型清单是否仅仪器 + 电源符号（无 R/C/MCU/有源） */
  private isInstrumentOnlyDeviceSelect(list: DeviceRequirement[]): boolean {
    if (!list || list.length === 0) {
      return false;
    }
    let hasInstr = false;
    for (let i = 0; i < list.length; i++) {
      const m = ((list[i].explicitModel ?? list[i].devType) ?? '').toUpperCase();
      if (m === 'VCC' || m === 'GND' || m === 'VDD' || m === 'VSS') {
        continue;
      }
      if (m.indexOf('OSCILLOSCOPE') >= 0 || m.indexOf('VOLTMETER') >= 0 ||
        m.indexOf('AMMETER') >= 0 || m.indexOf('LOGIC_ANALYZER') >= 0 ||
        m.indexOf('UART_TERMINAL') >= 0 || m.indexOf('FREQ_COUNTER') >= 0 ||
        m.indexOf('POWER_METER') >= 0 || m.indexOf('VIRTUAL_METER') >= 0) {
        hasInstr = true;
        continue;
      }
      return false;
    }
    return hasInstr;
  }

  /** 兼容旧调用：返回 HARD+SOFT 合并行 */
  private critiqueDeviceSelect(out: DeviceSelectLlmOutput, prompt: string): string[] {
    return allCritiqueLines(this.critiqueDeviceSelectSplit(out, prompt, this.activeIntent));
  }

  private static critiqueMutualLedSelectSplit(out: DeviceSelectLlmOutput): CritiqueSplit {
    const split = splitEmpty();
    const list = out.deviceRequireList ?? [];
    const models = list.map(r => (r.explicitModel ?? r.devType ?? '').toUpperCase());
    const hasRelay = models.some(m => m.indexOf('RELAY') >= 0);
    const ledN = models.filter(m => m.indexOf('LED') >= 0).length;
    const hasSw = models.some(m => m.indexOf('SW_') >= 0 || m === 'SW_PUSH');
    if (ledN < 2) {
      split.hard.push('互斥双色指示必须包含至少两颗 LED（如 LED_GREEN + LED_RED）');
    }
    if (!hasRelay) {
      split.hard.push(
        '开/闭互斥双色禁止只用 SW_PUSH(SPST)。必须增加 explicitModel=RELAY_SPDT，' +
        '并用 SW_PUSH 仅驱动继电器线圈；触点 NC→绿灯支路、NO→红灯支路、COM→GND');
    }
    if (!hasSw) {
      split.hard.push('需要 SW_PUSH 驱动 RELAY_SPDT 线圈（VCC→SW→coil→GND）');
    }
    const rN = models.filter(m => m.startsWith('R_')).length;
    if (rN < 2) {
      split.hard.push('双 LED 必须各配一颗限流电阻（两颗 R_330）');
    }
    return split;
  }

  /** AI net_plan 审查：HARD/SOFT 分流 + 意图门控 */
  private static critiqueNetPlanSplit(plan: NetPlanResult, topo: SchTopology, prompt: string,
    intent: CircuitIntent): CritiqueSplit {
    const split = splitEmpty();
    const nets = plan.nets ?? [];
    const ledN = topo.deviceList.filter(d => d.libDevId.startsWith('LED_')).length;
    const hasRelay = topo.deviceList.some(d =>
      d.libDevId === 'RELAY_SPDT' || (d.libDevId ?? '').toUpperCase().indexOf('RELAY') >= 0);

    for (let i = 0; i < nets.length; i++) {
      const conns = nets[i].connections ?? [];
      const pins = conns.map(c => `${c.compRef}:${c.pinName || c.pinId}`.toUpperCase());
      const hasIPlus = pins.some(p => p.endsWith(':I+') || p.endsWith(':I_PLUS'));
      const hasIMinus = pins.some(p => p.endsWith(':I-') || p.endsWith(':I_MINUS'));
      if (hasIPlus && hasIMinus) {
        split.hard.push(`电流表 I+/I- 在同一网络 "${nets[i].name}" → 短路！必须分到不同网络`);
      }
    }

    const netNames = nets.map(n => (n.name ?? '').toUpperCase());
    if (intent.needsPowerRails) {
      const hasVccNet = netNames.some(n => n === 'VCC');
      const hasGndNet = netNames.some(n => n === 'GND');
      const hasVeeNet = netNames.some(n => n === 'VEE');
      const isModular = prompt.indexOf('【模块并行约束') >= 0;
      const instrOnly = topo.deviceList.every(d => {
        const id = (d.libDevId ?? '').toUpperCase();
        return id === 'VCC' || id === 'GND' || id === 'VDD' || id === 'VSS' || id === 'VEE' ||
          id === 'SIGNAL_GEN' ||
          id.indexOf('OSCILLOSCOPE') >= 0 || id.indexOf('VOLTMETER') >= 0 ||
          id.indexOf('AMMETER') >= 0 || id.indexOf('LOGIC_ANALYZER') >= 0 ||
          id.indexOf('UART_TERMINAL') >= 0 || id.indexOf('FREQ_COUNTER') >= 0 ||
          id.indexOf('POWER_METER') >= 0 || id.indexOf('VIRTUAL_METER') >= 0;
      }) && topo.deviceList.some(d => {
        const id = (d.libDevId ?? '').toUpperCase();
        return id.indexOf('OSCILLOSCOPE') >= 0 || id.indexOf('VOLTMETER') >= 0 ||
          id.indexOf('AMMETER') >= 0 || id.indexOf('LOGIC_ANALYZER') >= 0 ||
          id === 'SIGNAL_GEN';
      });
      if (!hasVccNet) {
        if (isModular && instrOnly) {
          split.soft.push('模块并行仪器子模块可省略 VCC 网（合并阶段 POWER joints 供电源）');
        } else {
          split.hard.push('netPlan 缺少 VCC 网络 — 必须创建 VCC 电源网络并连接 VCC 符号引脚');
        }
      }
      if (!hasGndNet) {
        split.hard.push('netPlan 缺少 GND 网络 — 必须创建 GND 地网络并连接 GND 符号引脚');
      }
      if (intent.dualSupply && !hasVeeNet) {
        split.hard.push('双电源 netPlan 缺少 VEE 网络 — 负压符号与运放 VEE/V- 须入 VEE 网');
      }
    }

    for (let i = 0; i < nets.length; i++) {
      const name = (nets[i].name ?? '').toUpperCase();
      const type = nets[i].type ?? '';
      // 按网名已强制纠正 type 后，此条不应再 HARD 拒收；保留作防御
      if ((name === 'VCC' || name === 'GND' || name === 'VEE') && type === 'signal') {
        split.soft.push(`信号网络 "${nets[i].name}" 使用了电源名 — 已建议改为 power/ground 类型`);
      }
    }

    const pinOwner = new Map<string, string>();
    for (let i = 0; i < nets.length; i++) {
      const netName = (nets[i].name ?? '').toUpperCase();
      const conns = nets[i].connections ?? [];
      for (let ci = 0; ci < conns.length; ci++) {
        const c = conns[ci];
        const pinKey = `${c.compRef}:${c.pinId}`.toUpperCase();
        const prev = pinOwner.get(pinKey);
        if (prev !== undefined && prev !== netName) {
          split.hard.push(
            `引脚 ${pinKey} 同时出现在网络 ${prev} 与 ${netName}：一脚只能属一网；` +
            `若 ${netName} 是探针/PROBE，请把仪器脚并入 ${prev} 并删除重复 DUT 脚；` +
            `若是驱动冲突（如三极管 B），只保留正确驱动网`);
        } else {
          pinOwner.set(pinKey, netName);
        }
      }
    }

    for (let i = 0; i < nets.length; i++) {
      const name = (nets[i].name ?? '').toUpperCase();
      if (name !== 'VCC' && name !== 'GND') {
        continue;
      }
      const conns = nets[i].connections ?? [];
      for (const c of conns) {
        const pin = (c.pinName ?? c.pinId ?? '').toUpperCase();
        const ref = (c.compRef ?? '').toUpperCase();
        if ((pin.indexOf('GPIO') >= 0 || pin.indexOf('IO') >= 0 || pin.indexOf('PA') === 0 ||
          pin.indexOf('PB') === 0 || pin.indexOf('PC') === 0 || pin.indexOf('PD') === 0 ||
          pin.indexOf('P1') === 0 || pin.indexOf('P2') === 0 || pin.indexOf('P3') === 0) &&
          !ref.startsWith('R_') && pin !== 'VDD' && pin !== 'VSS' && pin !== 'VCC' && pin !== 'GND' &&
          pin.indexOf('BOOT') < 0) {
          split.soft.push(`GPIO/IO引脚 ${c.compRef}:${c.pinName || c.pinId} 直连 ${name} — 建议经限流电阻`);
        }
      }
    }

    const allConnectedPins = new Set<string>();
    for (let i = 0; i < nets.length; i++) {
      const conns = nets[i].connections ?? [];
      for (const c of conns) {
        allConnectedPins.add(`${c.compRef}:${c.pinId}`);
      }
    }
    for (const dev of topo.deviceList) {
      const id = (dev.libDevId ?? '').toUpperCase();
      if (id.indexOf('STM32') >= 0 || id.indexOf('AT89') >= 0 || id.indexOf('STC') >= 0) {
        const criticalPins = ['NRST', 'RST', 'VDD', 'VSS', 'VCC', 'GND'];
        for (const pin of criticalPins) {
          const key = `${dev.refName}:${pin}`;
          if (!allConnectedPins.has(key) &&
            !Array.from(allConnectedPins).some(k => k.startsWith(`${dev.refName}:`) &&
              k.toUpperCase().indexOf(pin) >= 0)) {
            if (intent.hasMcuMinSystem) {
              split.hard.push(`MCU 关键引脚 ${dev.refName}:${pin} 未入网 — 最小系统不得浮空`);
            } else {
              split.soft.push(`MCU 关键引脚 ${dev.refName}:${pin} 未入网 — 建议不得浮空`);
            }
          }
        }
      }
    }

    // joinWired 网缺少 routeWaypoints → SOFT（有则更好；无则 A* 仍可跑）
    for (let i = 0; i < nets.length; i++) {
      const net = nets[i];
      const conns = net.connections ?? [];
      const hasWired = conns.some(c => c.mode === 'joinWired');
      if (!hasWired || conns.length < 2) {
        continue;
      }
      const nUp = (net.name ?? '').toUpperCase();
      if (nUp === 'VCC' || nUp === 'GND') {
        continue;
      }
      const wps = net.routeWaypoints;
      if (!wps || wps.length === 0) {
        split.soft.push(
          `网络 "${net.name}" 含 joinWired 但缺少 routeWaypoints — 建议给出栅格路径点避开器件选中区`);
      }
    }

    // 仪器测量脚禁止并入 VCC 电源网（反模式：示波器 CH1 接 VCC → 恒压无意义）
    const isInstrLib = (lib: string): boolean => {
      const u = (lib ?? '').toUpperCase();
      return u.indexOf('OSCILLOSCOPE') >= 0 || u.indexOf('VOLTMETER') >= 0 ||
        u.indexOf('AMMETER') >= 0 || u.indexOf('LOGIC_ANALYZER') >= 0 ||
        u.indexOf('FREQ') >= 0 || u.indexOf('UART') >= 0 || u.indexOf('POWER_METER') >= 0;
    };
    const libOfRef = (ref: string): string => {
      const want = (ref ?? '').toUpperCase();
      const d = topo.deviceList.find(x => (x.refName ?? '').toUpperCase() === want);
      return d ? (d.libDevId ?? '') : '';
    };
    for (let i = 0; i < nets.length; i++) {
      const name = (nets[i].name ?? '').toUpperCase();
      if (name !== 'VCC' && name !== 'VDD' && name !== '+5V') {
        continue;
      }
      const conns = nets[i].connections ?? [];
      for (let ci = 0; ci < conns.length; ci++) {
        const c = conns[ci];
        const pin = (c.pinName ?? c.pinId ?? '').toUpperCase();
        const isSense = /^CH\d+$/.test(pin) || pin === 'V+' || pin === 'V' || pin === 'IN' ||
          pin === 'I+' || pin === 'I-';
        if (!isSense) {
          continue;
        }
        if (!isInstrLib(libOfRef(c.compRef ?? ''))) {
          continue;
        }
        split.hard.push(
          `仪器测量脚 ${c.compRef}.${pin} 不可并入电源网 ${name} — ` +
          `应接到被测信号节点；模块边界脚请用独立标号网(joinByLabel)，勿与 VCC 符号同网`);
      }
    }

    // 运放自激 netPlan：示波器双踪分测 + 禁 CH∩GND；VEE 不得入信号网；须有方波/三角网
    const selfOscNet = isOpAmpSelfOscillatorPrompt(prompt) ||
      (intent.needsHysteresisComparator && intent.needsOpAmpIntegrator && !intent.needsSignalGen);
    if (selfOscNet) {
      const pinNetMap = new Map<string, string>();
      for (let ni = 0; ni < nets.length; ni++) {
        const nn = (nets[ni].name ?? '').toUpperCase();
        const conns = nets[ni].connections ?? [];
        for (let ci = 0; ci < conns.length; ci++) {
          const c = conns[ci];
          const key = `${(c.compRef ?? '').toUpperCase()}:${(c.pinName ?? c.pinId ?? '').toUpperCase()}`;
          pinNetMap.set(key, nn);
        }
      }
      for (let di = 0; di < topo.deviceList.length; di++) {
        const d = topo.deviceList[di];
        const lib = (d.libDevId ?? '').toUpperCase();
        const ref = (d.refName ?? '').toUpperCase();
        if (lib.indexOf('OSCILLOSCOPE') >= 0) {
          const ch1 = pinNetMap.get(`${ref}:CH1`) ?? '';
          const ch2 = pinNetMap.get(`${ref}:CH2`) ?? '';
          const gnd = pinNetMap.get(`${ref}:GND`) ?? '';
          if (ch1.length > 0 && gnd.length > 0 && ch1 === gnd) {
            split.hard.push(
              `示波器 ${d.refName} CH1 与 GND 同网 ${ch1} — 无差分；CH1∥SQUARE_OUT，GND→GND`);
          }
          if (ch2.length > 0 && gnd.length > 0 && ch2 === gnd) {
            split.hard.push(
              `示波器 ${d.refName} CH2 与 GND 同网 ${ch2} — CH2∥TRIANGLE_OUT，GND→GND`);
          }
          if (ch1.length > 0 && ch2.length > 0 && ch1 === ch2) {
            split.hard.push(
              `示波器 ${d.refName} CH1 与 CH2 同网 ${ch1} — 双踪须分测方波/三角，禁止并网`);
          }
        }
        if (lib === 'VEE') {
          const veePin = pinNetMap.get(`${ref}:VEE`) ?? pinNetMap.get(`${ref}:1`) ?? '';
          if (veePin.length > 0 && veePin !== 'VEE') {
            split.hard.push(
              `VEE 符号 ${d.refName} 误入信号网 ${veePin} — 必须 joinByLabel 到 VEE 网`);
          }
        }
      }
      const hasSq = netNames.some(n => n === 'SQUARE_OUT' || n.indexOf('SQUARE') >= 0);
      const hasTri = netNames.some(n =>
        n === 'TRIANGLE_OUT' || n === 'TRI_OUT' || n.indexOf('TRIANG') >= 0 || n === 'FB_SIG');
      if (!hasSq) {
        split.hard.push('自激 netPlan 须含方波网（推荐 SQUARE_OUT：比较器 OUT）');
      }
      if (!hasTri) {
        split.hard.push('自激 netPlan 须含三角/反馈网（推荐 TRIANGLE_OUT 或 TRI_OUT）');
      }
      const rFloat = topo.deviceList.filter(d => {
        if (!(d.libDevId ?? '').startsWith('R_')) {
          return false;
        }
        const ref = (d.refName ?? '').toUpperCase();
        const p1 = Array.from(pinNetMap.keys()).some(k => k.startsWith(`${ref}:`));
        return !p1;
      }).length;
      if (rFloat >= 2) {
        split.soft.push(
          `有 ${rFloat} 颗电阻未入网 — 滞回须 OUT→Rf→IN+、IN+→Rg→GND，积分须 Rin`);
      }
    }

    const needMutualTopo = (intent.mutualLedIndicator || intent.relayContactTopo) &&
      !intent.blinkOscillator && ledN >= 2;
    if (!needMutualTopo) {
      return split;
    }
    if (!hasRelay) {
      if (intent.mutualLedIndicator) {
        split.hard.push(
          '器件列表无 RELAY_SPDT：互斥双色必须含 RELAY_SPDT，' +
          '当前 netPlan 不得用 SW_PUSH 当常开/常闭三端。');
      }
      return split;
    }

    const relayRef = topo.deviceList.find(d =>
      d.libDevId === 'RELAY_SPDT' || (d.libDevId ?? '').toUpperCase().indexOf('RELAY') >= 0)?.refName ?? 'K1';
    const swRef = topo.deviceList.find(d => d.libDevId.startsWith('SW_'))?.refName ?? 'SW1';
    const leds = topo.deviceList.filter(d => d.libDevId.startsWith('LED_'));
    const ledGreen = leds.find(d => (d.libDevId ?? '').toUpperCase().indexOf('GREEN') >= 0)?.refName;
    const ledRed = leds.find(d => (d.libDevId ?? '').toUpperCase().indexOf('RED') >= 0)?.refName;
    const resistors = topo.deviceList.filter(d => d.libDevId.startsWith('R_'));
    const rRefs = resistors.slice(0, 2).map(d => d.refName);
    const greenR = rRefs[0] ?? 'R1';
    const redR = rRefs[1] ?? 'R2';
    const greenLedRef = ledGreen ?? 'D1';
    const redLedRef = ledRed ?? 'D2';

    let ncHit = 0;
    let noHit = 0;
    let comGnd = false;
    for (let i = 0; i < nets.length; i++) {
      const conns = nets[i].connections ?? [];
      const pins = conns.map(c => `${c.compRef}:${c.pinId}`.toUpperCase());
      const hasNc = pins.some(p => p.indexOf(':NC') >= 0);
      const hasNo = pins.some(p => p.indexOf(':NO') >= 0);
      const hasCom = pins.some(p => p.indexOf(':COM') >= 0);
      const hasLedK = pins.some(p =>
        (p.indexOf('LED') >= 0 || p.indexOf('D') === 0 || p.indexOf(greenLedRef.toUpperCase()) >= 0 ||
          p.indexOf(redLedRef.toUpperCase()) >= 0) && p.endsWith(':K'));
      const hasLed = pins.some(p => p.indexOf('LED') >= 0 ||
        p.indexOf(greenLedRef.toUpperCase()) >= 0 || p.indexOf(redLedRef.toUpperCase()) >= 0);
      if (hasNc && (hasLedK || hasLed)) {
        ncHit++;
      }
      if (hasNo && (hasLedK || hasLed)) {
        noHit++;
      }
      if (hasCom && ((nets[i].name ?? '').toUpperCase() === 'GND' ||
        pins.some(p => p.indexOf('GND') >= 0))) {
        comGnd = true;
      }
      if (hasCom && ((nets[i].name ?? '').toUpperCase() === 'VCC' ||
        pins.some(p => p.endsWith(':VCC') || p.indexOf(':VCC') >= 0))) {
        split.hard.push('禁止 RELAY.COM 接到 VCC：COM 必须接 GND');
      }
    }
    if (ncHit < 1) {
      split.hard.push(
        `缺少 NC 触点支路：LED_GREEN.K(${greenLedRef}:K)→RELAY.NC(${relayRef}:NC) ` +
        `断开(未按下)时绿灯常亮。正确示例: ` +
        `VCC→${greenR}.1→${greenR}.2→${greenLedRef}.A, ${greenLedRef}.K→${relayRef}.NC`);
    }
    if (noHit < 1) {
      split.hard.push(
        `缺少 NO 触点支路：LED_RED.K(${redLedRef}:K)→RELAY.NO(${relayRef}:NO) ` +
        `闭合(按下)时红灯常亮。正确示例: ` +
        `VCC→${redR}.1→${redR}.2→${redLedRef}.A, ${redLedRef}.K→${relayRef}.NO`);
    }
    if (!comGnd) {
      split.hard.push(`RELAY.COM(${relayRef}:COM) 必须接到 GND 网络，作为两路 LED 的公共回流路径`);
    }

    let ledKToGndOnly = 0;
    for (let i = 0; i < nets.length; i++) {
      if ((nets[i].name ?? '').toUpperCase() !== 'GND' && nets[i].type !== 'ground') {
        continue;
      }
      const conns = nets[i].connections ?? [];
      for (const c of conns) {
        if ((c.pinId === 'K' || c.pinName === 'K') &&
          ((c.compRef ?? '').toUpperCase().indexOf('LED') >= 0 || c.compRef.startsWith('D') ||
            c.compRef === greenLedRef || c.compRef === redLedRef)) {
          ledKToGndOnly++;
        }
      }
    }
    if (ledKToGndOnly >= 2 && ncHit + noHit < 2) {
      split.hard.push(
        '禁止两颗 LED 阴极都直连 GND：互斥指示必须经 NC/NO 触点，否则开关无法切换颜色');
    }

    let coilPinsOnPlan: string[] = [];
    let coilNetNames: string[] = [];
    for (let i = 0; i < nets.length; i++) {
      const conns = nets[i].connections ?? [];
      for (let ci = 0; ci < conns.length; ci++) {
        const c = conns[ci];
        const pid = (c.pinId ?? '').toUpperCase();
        const pref = (c.compRef ?? '').toUpperCase();
        const isRelayRef = pref.indexOf('RELAY') >= 0 ||
          /^K\d+$/.test(pref) ||
          pref === relayRef.toUpperCase() ||
          topo.deviceList.some(d =>
            d.refName.toUpperCase() === pref &&
            (d.libDevId === 'RELAY_SPDT' || (d.libDevId ?? '').toUpperCase().indexOf('RELAY') >= 0));
        if (!isRelayRef) {
          continue;
        }
        if (pid === 'COM' || pid === 'NC' || pid === 'NO') {
          continue;
        }
        if (pid === '1' || pid === '2' || pid === 'A' || pid === 'B' ||
          pid.indexOf('COIL') >= 0) {
          coilPinsOnPlan.push(`${pref}:${pid}`);
          coilNetNames.push((nets[i].name ?? '').toUpperCase());
        }
      }
    }
    const uniqueCoilPins = Array.from(new Set(coilPinsOnPlan));
    if (uniqueCoilPins.length < 2) {
      split.hard.push(
        `RELAY 线圈(${relayRef})两端未完整入网：` +
        `正确回路 VCC→${swRef}.1→${swRef}.2→${relayRef}.1, ${relayRef}.2→GND。` +
        `线圈两脚 1/2 各自独立入网，不可浮空`);
    } else {
      const uniqNets = Array.from(new Set(coilNetNames));
      if (uniqNets.length < 2) {
        split.hard.push(
          `RELAY 线圈两端(${relayRef}:1,${relayRef}:2)不得同网：` +
          `必须分到两个不同网络，一端经 ${swRef} 接 VCC，另一端接 GND`);
      }
      let hasSwOnCoilPath = false;
      let hasPowerOnCoilPath = false;
      for (let i = 0; i < nets.length; i++) {
        const conns = nets[i].connections ?? [];
        const pins = conns.map(c => `${c.compRef}:${c.pinId}`.toUpperCase());
        const hasCoil = pins.some(p => uniqueCoilPins.indexOf(p) >= 0);
        if (!hasCoil) {
          continue;
        }
        if (pins.some(p => {
          const ref = p.split(':')[0];
          return ref === swRef.toUpperCase() || topo.deviceList.some(d =>
            d.refName.toUpperCase() === ref && d.libDevId.startsWith('SW_'));
        })) {
          hasSwOnCoilPath = true;
        }
        const n = (nets[i].name ?? '').toUpperCase();
        if (n === 'VCC' || n === 'GND' || pins.some(p =>
          p.indexOf('VCC') >= 0 || p.indexOf(':GND') >= 0 || p.endsWith(':VCC'))) {
          hasPowerOnCoilPath = true;
        }
      }
      if (!hasSwOnCoilPath) {
        split.hard.push(`线圈驱动回路缺少 ${swRef}：须 SW_PUSH 串联在 VCC 与 ${relayRef}:1 之间`);
      }
      if (!hasPowerOnCoilPath) {
        split.hard.push(`线圈驱动回路缺少电源轨：完整回路 VCC→${swRef}→${relayRef}:1, ${relayRef}:2→GND`);
      }
    }

    return split;
  }

  /** 兼容旧调用 */
  private static critiqueNetPlan(plan: NetPlanResult, topo: SchTopology, prompt: string,
    intent?: CircuitIntent): string[] {
    const effective = intent ?? defaultCircuitIntent();
    return allCritiqueLines(AiPipelineOrchestrator.critiqueNetPlanSplit(plan, topo, prompt, effective));
  }

  private static formatCritiqueFeedback(split: CritiqueSplit): string {
    const lines: string[] = [];
    for (let i = 0; i < split.hard.length; i++) {
      lines.push(`${i + 1}. [HARD] ${split.hard[i]}`);
    }
    if (split.soft.length > 0) {
      lines.push('');
      lines.push('软性建议（可选改进，不阻塞输出）:');
      for (let j = 0; j < split.soft.length; j++) {
        lines.push(`${j + 1}. [SOFT] ${split.soft[j]}`);
      }
    }
    return lines.join('\n');
  }

  private static tryEarlyStopStable(
    hard: string[], lastFp: string, stableCount: number, stage: string
  ): EarlyStopStableResult {
    const fp = hardResidualFingerprint(hard);
    if (fp.length === 0) {
      const emptyStop: EarlyStopStableResult = { accept: false, lastFp: fp, stableCount: 0 };
      return emptyStop;
    }
    if (fp === lastFp) {
      const next = stableCount + 1;
      if (next >= 2) {
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] early_stop residual_stable stage=${stage} fp=${fp.substring(0, 80)}`);
        const acceptStop: EarlyStopStableResult = { accept: true, lastFp: fp, stableCount: next };
        return acceptStop;
      }
      const continueStop: EarlyStopStableResult = { accept: false, lastFp: fp, stableCount: next };
      return continueStop;
    }
    const resetStop: EarlyStopStableResult = { accept: false, lastFp: fp, stableCount: 0 };
    return resetStop;
  }

  private cacheGet<T extends object>(key: string): T | null {
    const entry = this.constraintCache.get(key);
    if (!entry) {
      return null;
    }
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.constraintCache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  private cacheSet(key: string, value: object): void {
    this.constraintCache.set(key, { value: value, timestamp: Date.now() });
  }

  /**
   * DeepSeek V4 等：默认关 thinking 保纯 JSON；
   * PipelineOptions.enableReasoning / UI「推理开」→ setEnableReasoning(true) 时允许 thinking，
   * 并由 PromptLoader.isolateJsonObject 剥离推理泄漏。
   */
  setEnableReasoning(on: boolean): void {
    this.enableReasoningFlag = on;
    Logger.info(INSTR_TRACE_TAG, `[AI_PIPE] enableReasoning=${on}`);
  }

  private needsThinking(_capability: string): boolean {
    return this.enableReasoningFlag;
  }

  /** 阶段 chat 附加项：推理关时强制 disableThinking；开时显式 enable 并抬高 maxTokens */
  private stageChatOpts(base: ChatOptions): ChatOptions {
    const opts: ChatOptions = {
      temperature: base.temperature,
      maxTokens: base.maxTokens,
      capability: base.capability,
      context: base.context,
      connectTimeoutMs: base.connectTimeoutMs,
      readTimeoutMs: base.readTimeoutMs
    };
    if (this.enableReasoningFlag) {
      opts.disableThinking = false;
      const floor = 32768;
      const cur = opts.maxTokens ?? LLM_SOFT_OUTPUT_TOKENS;
      opts.maxTokens = Math.min(LLM_MAX_OUTPUT_TOKENS, Math.max(cur, floor));
    } else {
      opts.disableThinking = true;
    }
    return opts;
  }

  private static maxTokensForStage(stage: string): number {
    switch (stage) {
      case 'layout':
        // positions 随器件数膨胀；过低易截断 → extractJson 失败 → no parse
        return 24576;
      case 'route':
      case 'self_review':
        return LLM_SOFT_OUTPUT_TOKENS;
      case 'device_select':
        return 24576;
      case 'net_plan':
        return LLM_MAX_OUTPUT_TOKENS;
      default:
        return LLM_MAX_OUTPUT_TOKENS;
    }
  }

  /** 电路生图所有阶段均需极高精确性 — 温度统一压低以防幻觉 */
  private static temperatureForStage(stage: string): number | undefined {
    switch (stage) {
      case 'device_select': return 0.08;
      case 'net_plan': return 0.05;
      case 'layout': return 0.08;
      case 'route': return 0.05;
      case 'self_review': return 0.05;
      default: return 0.1;
    }
  }

  private async chatWithRetry(prompt: string, capability: string, extraOpts?: ChatOptions): Promise<ChatResult> {
    let lastError = '';
    const tag = this.logTag();
    if (this.isCancelRequested()) {
      return { success: false, errCode: ErrCode.ERR_ASYNC_CANCEL, error: 'cancelled' };
    }
    traceAiOp('AI_PIPE', 'llm_chat',
      `${tag}cap=${capability} promptLen=${prompt.length} maxRetries=${LLM_MAX_RETRIES}`);
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] ${tag}WAIT LLM cap=${capability} promptLen=${prompt.length} — complex replies may take a long time`);
    for (let attempt = 0; attempt <= LLM_MAX_RETRIES; attempt++) {
      if (this.isCancelRequested()) {
        return { success: false, errCode: ErrCode.ERR_ASYNC_CANCEL, error: 'cancelled' };
      }
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] ${tag}chat attempt=${attempt + 1}/${LLM_MAX_RETRIES + 1} cap=${capability}`);
      const useThinking = this.needsThinking(capability);
      let maxTok = extraOpts?.maxTokens ?? LLM_MAX_OUTPUT_TOKENS;
      if (useThinking && maxTok < 32768) {
        maxTok = Math.min(LLM_MAX_OUTPUT_TOKENS, 32768);
      }
      const chatOpts: ChatOptions = {
        capability: capability as AiCapability,
        maxTokens: maxTok,
        disableThinking: !useThinking
      };
      if (extraOpts?.temperature !== undefined) {
        chatOpts.temperature = extraOpts.temperature;
      }
      // 仅当调用方显式传入时覆盖；阶段应走 stageChatOpts，勿再硬塞 disableThinking:true
      if (extraOpts?.disableThinking !== undefined) {
        chatOpts.disableThinking = extraOpts.disableThinking;
      }
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] ${tag}chat thinking=${chatOpts.disableThinking === true ? 'off' : 'on'}` +
        ` maxTokens=${chatOpts.maxTokens} cap=${capability}`);
      const result = await this.apiManager.chat(prompt, chatOpts);
      if (this.isCancelRequested() ||
        result.errCode === ErrCode.ERR_ASYNC_CANCEL ||
        (result.error ?? '').indexOf('cancelled') >= 0) {
        return { success: false, errCode: ErrCode.ERR_ASYNC_CANCEL, error: 'cancelled' };
      }
      if (result.success && result.data) {
        Logger.info(INSTR_TRACE_TAG,
          `[AI_PIPE] ${tag}chat OK cap=${capability} len=${result.data.length}`);
        traceAiOp('AI_PIPE', 'llm_chat_ok',
          `${tag}cap=${capability} attempt=${attempt + 1} replyLen=${result.data.length}`);
        return result;
      }
      if (result.errCode && result.errCode >= 400 && result.errCode < 500) {
        Logger.error(INSTR_TRACE_TAG,
          `[AI_PIPE] chat 4xx cap=${capability} err=${result.error}`);
        traceAiOp('AI_PIPE', 'llm_chat_4xx',
          `cap=${capability} err=${result.error ?? ''}`);
        return result;
      }
      lastError = result.error ?? 'unknown';
      const isTimeout = lastError.toLowerCase().indexOf('timeout') >= 0 ||
        lastError.indexOf('超时') >= 0;
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] chat fail cap=${capability} err=${lastError}` +
        `${isTimeout ? ' (will wait longer before retry)' : ''}`);
      traceAiOp('AI_PIPE', 'llm_chat_retry',
        `cap=${capability} attempt=${attempt + 1} err=${lastError}`);
      if (attempt < LLM_MAX_RETRIES) {
        // 超时后更长退避，给模型/网络喘息，避免立刻再打爆
        const base = isTimeout ? LLM_BASE_BACKOFF_MS * 8 : LLM_BASE_BACKOFF_MS;
        const delay = base * Math.pow(2, attempt);
        Logger.info(INSTR_TRACE_TAG,
          `[AI_PIPE] WAIT backoff ${delay}ms before retry cap=${capability}`);
        await new Promise<void>(r => setTimeout(r, delay));
        if (this.isCancelRequested()) {
          return { success: false, errCode: ErrCode.ERR_ASYNC_CANCEL, error: 'cancelled' };
        }
      }
    }
    return { success: false, error: lastError };
  }

  async aiDiagnoseAndFix(topo: SchTopology): Promise<AiDiagnoseFixResult> {
    const doc = TopologyAdapter.fromTopology(topo);
    const violations = FaultDiagnoser.diagnose(doc);
    let fixes = 0;
    const diag: DiagError[] = [];
    const usedRefs = new Set<string>();
    for (let di = 0; di < topo.deviceList.length; di++) {
      usedRefs.add((topo.deviceList[di].refName ?? '').toUpperCase());
    }
    for (let i = 0; i < violations.length; i++) {
      const v = violations[i];
      diag.push({
        level: v.severity === ErcSeverity.ERROR ? 'error' : 'warning',
        targetType: v.componentId ? 'device' : 'net',
        targetUuid: v.componentId ?? v.netId ?? '',
        errorDesc: v.message,
        repairSuggest: v.fixSuggestion ?? '',
        devReference: v.componentId ?? ''
      });
      if (v.fixSuggestion?.includes('pull') || v.message.includes('上拉')) {
        const hasR = topo.deviceList.some(d => d.libDevId.startsWith('R_'));
        if (!hasR) {
          // 仅追加器件，禁止 SemanticNetBuilder 整网重建（会覆盖 LLM net_plan）
          const refName = this.allocUniqueRefName('R_10k', usedRefs);
          usedRefs.add(refName.toUpperCase());
          topo.deviceList.push(makeDeviceInst(
            IdUtil.generate('inst'), 'R_10k', refName,
            400, 300, 0, stringMap1('value', '10k')
          ));
          fixes++;
          Logger.info(INSTR_TRACE_TAG,
            `[AI_PIPE] diagnose add pull-up ${refName} without SemanticNetBuilder wipe`);
        }
      }
    }
    if (fixes > 0) {
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] diagnose added ${fixes} devices — nets preserved (no SemanticNetBuilder)`);
    }
    return { topo, fixes, diag };
  }

  private scoreLlmJson<T extends object>(parsed: T | null, expectedFields: string[]): number {
    if (!parsed) {
      return 0;
    }
    let filled = 0;
    for (const f of expectedFields) {
      const val = parsed[f as keyof T];
      if (val !== undefined && val !== null && val !== '') {
        if (Array.isArray(val) && (val as Object[]).length === 0) {
          continue;
        }
        filled++;
      }
    }
    return expectedFields.length > 0 ? filled / expectedFields.length : 0;
  }

  /**
   * clear-loop / kit 后重布：qualityHardFail 走 WAR-only，否则 A*。
   */
  private async rerouteAfterFix(topo: SchTopology, opts: PipelineOptions): Promise<void> {
    if (opts.qualityHardFail && !opts.skipLlm) {
      topo.wireList = WarRouteAdapter.stripNonStubWires(topo.wireList);
      const war = await this.warAdapter.routeTopology(topo, true,
        () => this.isCancelRequested());
      if (!war.ok) {
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] clear-loop WAR residual | ${war.reason}`);
      } else {
        Logger.info(INSTR_TRACE_TAG,
          `[AI_AGENT] clear-loop route via WAR routedNets=${war.routedNets}`);
      }
      return;
    }
    const routeCons = this.lastRoutingConstraints ??
      ConstrainedWiringEngine.defaultConstraints(topo);
    const rr = await this.wiringEngine.routeUntilCleanAsync(topo, routeCons,
      opts.routingWeights, this.lastNetWaypoints ?? undefined, 1);
    topo.wireList = rr.routeLines;
  }

  private async fetchDeviceSelectLlm(opts: PipelineOptions):
    Promise<LlmFetchResult<DeviceSelectLlmOutput>> {
    // 编辑模式不缓存 — 结果依赖对话上下文
    const isEdit = opts.generationMode === 'edit';
    const salt = opts.cacheSalt ?? '';
    const cacheKey = isEdit ? '' : `select:${opts.prompt}|ca:${salt}`;
    if (!isEdit) {
      const cached = this.cacheGet<DeviceSelectLlmOutput>(cacheKey);
      if (cached) {
        Logger.info(INSTR_TRACE_TAG, '[AI_PIPE] device_select cache hit');
        return { output: cached, fromLlm: true };
      }
    }

    if (opts.skipLlm) {
      return { output: DeviceSelectEngine.buildLocalLlmOutput(opts.prompt), fromLlm: false };
    }

    const tpl = PromptLoader.load('device_select');
    const vars: PromptVarEntry[] = [
      { key: 'user_prompt', value: opts.prompt },
      { key: 'scene', value: opts.scene ?? 'text_gen' },
      {
        key: 'partial_topo',
        value: opts.partialTopo
          ? AiPipelineOrchestrator.formatPartialTopoForPrompt(opts.partialTopo)
          : ''
      }
    ];
    // 多轮对话: 注入历史上下文 + 编辑模式指令
    if (opts.conversationHistory && opts.conversationHistory.length > 0) {
      const historyText = opts.conversationHistory
        .map(h => `[${h.role}]: ${h.content}`)
        .join('\n');
      vars.push({ key: 'conversation_history',
        value: `对话历史（前序轮次）：\n${historyText}\n\n` });
    } else {
      vars.push({ key: 'conversation_history', value: '' });
    }
    if (opts.generationMode === 'edit') {
      vars.push({ key: 'generation_mode',
        value: '生成模式：edit — 在当前电路基础上增量修改，保留未涉及的现有器件，只调整用户要求变更的部分\n\n' });
    } else {
      vars.push({ key: 'generation_mode', value: '' });
    }
    const isModularChild = opts.prompt.indexOf('【模块并行约束') >= 0;
    let editLibIds: string[] = [];
    if (opts.generationMode === 'edit' && opts.partialTopo) {
      editLibIds = PromptLoader.libIdsFromTopo(opts.partialTopo);
    }
    const prompt = PromptLoader.renderEnriched(tpl, vars, this.componentLibrary,
      {
        includeFullPins: true,
        intent: this.activeIntent,
        filterPinsByPrompt: isModularChild ? opts.prompt : undefined,
        libIdsForFragments: editLibIds
      });
    if (isModularChild) {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] device_select modular_child catalog_filter=on promptLen≈` +
        `${prompt.length}`);
    }

    // AI 驱动纠错：选型不过关则把 critique 喂回 LLM 重试，不本地硬塞器件
    let critique = '';
    let lastParsed: DeviceSelectLlmOutput | null = null;
    let lastHardFp = '';
    let stableCount = 0;
    for (let round = 0; round <= CRITIQUE_INNER_ROUNDS; round++) {
      const roundPrompt = critique.length > 0
        ? `${prompt}\n\n【上次选型被审查拒绝 — 必须按下列要求重出完整 JSON】:\n${critique}`
        : prompt;
      const api = await this.chatWithRetry(roundPrompt, AiCapability.COMPONENT_RECOMMEND,
        this.stageChatOpts({
          temperature: AiPipelineOrchestrator.temperatureForStage('device_select'),
          maxTokens: AiPipelineOrchestrator.maxTokensForStage('device_select')
        }));
      if (api.success && api.data) {
        const pure = PromptLoader.isStrictJsonObjectReply(api.data);
        if (!pure) {
          const impurity = PromptLoader.describeJsonImpurity(api.data);
          Logger.warn(INSTR_TRACE_TAG,
            `[AI_PIPE] device_select JSON impurity=${impurity} round=${round + 1} — critique retry`);
          critique =
            '【硬】上次回复违反「只出 JSON」：正文必须以 { 开头、以 } 结尾；' +
            '禁止中文/英文推理、说明、markdown、``` 代码围栏。请重出完整纯 JSON。' +
            `（检测到: ${impurity}）`;
          // 仍尝试抽取，作末轮兜底
          const rawLoose = PromptLoader.extractJson<Object>(api.data);
          const parsedLoose = LlmJsonNormalizer.normalizeDeviceSelect(rawLoose);
          if (parsedLoose && (parsedLoose.deviceRequireList?.length ?? 0) > 0) {
            lastParsed = parsedLoose;
          }
          if (round < CRITIQUE_INNER_ROUNDS) {
            continue;
          }
          // 末轮：已抽取则接受并告警，避免因杂质空跑
          if (lastParsed) {
            Logger.warn(INSTR_TRACE_TAG,
              '[AI_PIPE] device_select accept impure JSON on last round (extracted)');
            if (!isEdit) {
              this.cacheSet(cacheKey, lastParsed);
            }
            return { output: lastParsed, fromLlm: true };
          }
        }
        const raw = PromptLoader.extractJson<Object>(api.data);
        const parsed = LlmJsonNormalizer.normalizeDeviceSelect(raw);
        const score = this.scoreLlmJson(parsed, LlmJsonNormalizer.deviceSelectScoreFields());
        Logger.info(INSTR_TRACE_TAG,
          `[AI_PIPE] device_select parse score=${score.toFixed(2)} round=${round + 1}` +
          ` pureJson=${pure}`);
        if (parsed && (parsed.deviceRequireList?.length ?? 0) > 0 &&
          score >= QUALITY_MIN_FILL_RATE) {
          lastParsed = parsed;
          const split = this.critiqueDeviceSelectSplit(parsed, opts.prompt, this.activeIntent);
          Logger.info(INSTR_TRACE_TAG,
            `[AI_PIPE] critique HARD=${split.hard.length} SOFT=${split.soft.length}`);
          if (split.hard.length === 0) {
            if (split.soft.length > 0) {
              Logger.warn(INSTR_TRACE_TAG,
                `[AI_PIPE] device_select SOFT residual=${split.soft.length}: ${split.soft.join('; ')}`);
            }
            if (!isEdit) {
              this.cacheSet(cacheKey, parsed);
            }
            return { output: parsed, fromLlm: true };
          }
          const early = AiPipelineOrchestrator.tryEarlyStopStable(
            split.hard, lastHardFp, stableCount, 'device_select');
          lastHardFp = early.lastFp;
          stableCount = early.stableCount;
          if (early.accept) {
            // NEVER_ABORT：稳定 HARD 残差也 ACCEPT，进入后续匹配/落图
            Logger.warn(INSTR_TRACE_TAG,
              `[AI_PIPE] KEEP_RETRY ACCEPT device_select early_stop residual HARD=${split.hard.length}`);
            if (!parsed.oodFlags) {
              parsed.oodFlags = [];
            }
            for (let hi = 0; hi < split.hard.length; hi++) {
              parsed.oodFlags.push(split.hard[hi]);
            }
            if (cacheKey.length > 0) {
              this.cacheSet(cacheKey, parsed);
            }
            return { output: parsed, fromLlm: true };
          }
          critique = AiPipelineOrchestrator.formatCritiqueFeedback(split);
          Logger.warn(INSTR_TRACE_TAG,
            `[AI_PIPE] device_select AI-critique reject round=${round + 1}: HARD=${split.hard.length}`);
          continue;
        }
      }
      if (round === CRITIQUE_INNER_ROUNDS) {
        break;
      }
    }
    if (lastParsed) {
      const stillSplit = this.critiqueDeviceSelectSplit(lastParsed, opts.prompt, this.activeIntent);
      if (stillSplit.hard.length === 0) {
        Logger.warn(INSTR_TRACE_TAG,
          '[AI_PIPE] device_select critique exhausted but last output now clean — accept without cache');
        return { output: lastParsed, fromLlm: true };
      }
      // NEVER_ABORT：生产路径也 ACCEPT 残差选型（带 oodFlags），禁止伪空 fromLlm=false
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] KEEP_RETRY ACCEPT device_select residual HARD=${stillSplit.hard.length}: ` +
        `${stillSplit.hard.join('; ')}`);
      if (!lastParsed.oodFlags) {
        lastParsed.oodFlags = [];
      }
      for (let hi = 0; hi < stillSplit.hard.length; hi++) {
        lastParsed.oodFlags.push(stillSplit.hard[hi]);
      }
      return { output: lastParsed, fromLlm: true };
    }
    if (opts.skipLlm) {
      Logger.warn(INSTR_TRACE_TAG,
        '[AI_PIPE] device_select no parse — local shell (skipLlm only)');
      return { output: DeviceSelectEngine.buildLocalLlmOutput(opts.prompt), fromLlm: false };
    }
    Logger.error(INSTR_TRACE_TAG,
      '[AI_PIPE] STAGE_FAIL device_select no parse — refuse local shell (no ABORT label)');
    const emptySelect: DeviceSelectLlmOutput = {
      functionModule: [],
      deviceRequireList: [],
      circuitConstraint: '',
      oodFlags: ['device_select_llm_unavailable']
    };
    const failEmpty: LlmFetchResult<DeviceSelectLlmOutput> = { output: emptySelect, fromLlm: false };
    return failEmpty;
  }

  private async fetchLayoutLlm(devices: MatchedDevice[], constraint: string,
    opts: PipelineOptions): Promise<LlmFetchResult<LayoutLlmOutput>> {
    const defaultOut = PlacementOptimizer.defaultConstraints(devices);
    if (opts.skipLlm) {
      return { output: defaultOut, fromLlm: false };
    }

    const tpl = PromptLoader.load('layout');
    const deviceList = PromptLoader.buildLayoutDeviceHitSummary(devices, this.componentLibrary);
    const usage = PromptLoader.buildDeviceUsageBlock(
      PromptLoader.libIdsFromMatched(devices), 'compact', this.componentLibrary);
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] usage_manual stage=layout devices=${usage.deviceCount} ` +
      `included=${usage.includedCount} miss=${usage.missIds.length} chars=${usage.charCount}` +
      (usage.missIds.length > 0 ? ` missIds=${usage.missIds.slice(0, 8).join(',')}` : ''));
    try {
      traceAiPayload('AI_PIPE', 'USAGE_MANUAL', usage.text,
        `stage=layout mode=compact chars=${usage.charCount}`);
    } catch (_e) {
      // ignore
    }
    const basePrompt = PromptLoader.renderEnriched(tpl, [
      { key: 'device_list', value: deviceList },
      { key: 'device_usage', value: usage.text },
      { key: 'circuit_constraint', value: constraint },
      { key: 'mcu_family', value: opts.mcuFamily ?? 'auto' }
    ], this.componentLibrary);

    let critique = '';
    let lastParsed: LayoutLlmOutput | null = null;
    let lastHardFp = '';
    let stableCount = 0;
    const needPos = Math.max(1, devices.length);
    for (let round = 0; round <= LAYOUT_INNER_ROUNDS; round++) {
      const roundPrompt = critique.length > 0
        ? `${basePrompt}\n\n【上次布局被审查拒绝 — 按下列要求重出】:\n${critique}\n` +
          `【硬】只输出一个 JSON 对象，禁止任何说明/推理/markdown；positions.length=${needPos}；x/y 为 20 的倍数。第一字符必须是 {。`
        : basePrompt;
      const api = await this.chatWithRetry(roundPrompt, AiCapability.AUTO_WIRING,
        this.stageChatOpts({
          temperature: AiPipelineOrchestrator.temperatureForStage('layout'),
          maxTokens: AiPipelineOrchestrator.maxTokensForStage('layout')
        }));
      if (!api.success || !api.data) {
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] layout round=${round + 1} API fail: ${api.error ?? 'empty'}`);
        if (round === LAYOUT_INNER_ROUNDS) {
          break;
        }
        continue;
      }
      if (!PromptLoader.isStrictJsonObjectReply(api.data)) {
        const impurity = PromptLoader.describeJsonImpurity(api.data);
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] layout JSON impurity=${impurity} round=${round + 1} — critique retry`);
        critique =
          '【硬】上次回复违反「只出 JSON」：正文必须以 { 开头、以 } 结尾；' +
          '禁止中文/英文推理、说明、markdown、``` 代码围栏。请重出完整纯 JSON（含 positions[]）。' +
          `（检测到: ${impurity}）`;
        const rawLoose = PromptLoader.extractJson<Object>(api.data);
        if (rawLoose) {
          const parsedLoose = LlmJsonNormalizer.normalizeLayout(rawLoose);
          if (parsedLoose && (parsedLoose.positions?.length ?? 0) > 0) {
            this.sanitizeLayoutPositions(parsedLoose);
            lastParsed = parsedLoose;
          }
        }
        if (round < LAYOUT_INNER_ROUNDS) {
          continue;
        }
        if (lastParsed) {
          Logger.warn(INSTR_TRACE_TAG,
            '[AI_PIPE] layout accept impure JSON on last round (extracted)');
          return { output: lastParsed, fromLlm: true };
        }
      }
      const raw = PromptLoader.extractJson<Object>(api.data);
      if (!raw) {
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] layout round=${round + 1} extractJson fail len=${api.data.length}`);
        critique = '输出无法解析为 JSON。请只输出纯 JSON 对象（不要 markdown），必须含非空 positions[]。';
        if (round === LAYOUT_INNER_ROUNDS) {
          break;
        }
        continue;
      }
      const parsed = LlmJsonNormalizer.normalizeLayout(raw);
      const posN = parsed?.positions?.length ?? 0;
      const posOk = posN >= Math.ceil(needPos * 0.5);
      const score = this.scoreLlmJson(parsed, LlmJsonNormalizer.layoutScoreFields());
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] layout parse score=${score.toFixed(2)} positions=${posN}/${needPos} round=${round + 1}`);
      if (parsed && (posOk || score >= QUALITY_MIN_FILL_RATE)) {
        this.sanitizeLayoutPositions(parsed);
        lastParsed = parsed;
        const issues = this.critiqueLayout(parsed, devices);
        Logger.info(INSTR_TRACE_TAG,
          `[AI_PIPE] critique HARD=${issues.length} SOFT=0`);
        if (issues.length === 0) {
          return { output: parsed, fromLlm: true };
        }
        const onlySoftish = issues.every(s =>
          s.indexOf('间距不足') >= 0 || s.indexOf('通道') >= 0 ||
          s.indexOf('少于器件数') >= 0 || s.indexOf('中央区域') >= 0);
        const early = AiPipelineOrchestrator.tryEarlyStopStable(
          issues, lastHardFp, stableCount, 'layout');
        lastHardFp = early.lastFp;
        stableCount = early.stableCount;
        if (early.accept || (onlySoftish && posN >= needPos)) {
          Logger.warn(INSTR_TRACE_TAG,
            `[AI_PIPE] layout ACCEPT residual=${issues.length} onlySoftish=${onlySoftish}` +
            ` positions=${posN} (gap resolve later)`);
          return { output: parsed, fromLlm: true };
        }
        critique = issues.map((s, i) => `${i + 1}. [HARD] ${s}`).join('\n');
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] layout AI-critique reject round=${round + 1}: ${critique}`);
        continue;
      }
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] layout round=${round + 1} reject score/pos posN=${posN} score=${score.toFixed(2)}`);
      critique = `positions 无效或过少(当前${posN}，需要${needPos})。请为每个器件输出 {deviceId,x,y,rotate}。`;
      if (round === LAYOUT_INNER_ROUNDS) {
        break;
      }
    }
    if (lastParsed && (lastParsed.positions?.length ?? 0) > 0) {
      this.sanitizeLayoutPositions(lastParsed);
      const still = this.critiqueLayout(lastParsed, devices);
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] KEEP_RETRY layout residual=${still.length} — ACCEPT + gap resolve (no ABORT)`);
      return { output: lastParsed, fromLlm: true };
    }
    Logger.warn(INSTR_TRACE_TAG,
      '[AI_PIPE] KEEP_RETRY layout no parse — continue default constraints (no ABORT)');
    return { output: defaultOut, fromLlm: false };
  }

  /** 坐标 snap 20 + clamp，减少栅格 HARD 误杀 */
  private sanitizeLayoutPositions(out: LayoutLlmOutput): void {
    const positions = out.positions;
    if (!positions || positions.length === 0) {
      return;
    }
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      if (p.x === undefined || p.y === undefined || isNaN(p.x) || isNaN(p.y)) {
        continue;
      }
      p.x = Math.max(40, Math.min(1200, Math.round(p.x / 20) * 20));
      p.y = Math.max(40, Math.min(800, Math.round(p.y / 20) * 20));
    }
  }

  /**
   * 验证 LLM 布局：坐标有效 + 选中区边到边通道 ≥80mil。
   * 间隙公式与 PlacementOptimizer.resolveOverlaps 一致：
   * 投影分离为正间隙，投影相交为负重叠；两轴都不足 CHANNEL 才算违规。
   * （旧实现误把相交宽度 clamp 成「间隙」，分离器件永远 gap=0 → 无限 reject）
   */
  private critiqueLayout(out: LayoutLlmOutput, devices: MatchedDevice[]): string[] {
    const issues: string[] = [];
    const positions = out.positions ?? [];
    if (positions.length === 0) {
      issues.push('positions 数组为空 — 必须为每个器件输出坐标');
      return issues;
    }
    if (positions.length < devices.length) {
      issues.push(`positions 数量(${positions.length})少于器件数(${devices.length}) — 每个器件必须有一个坐标`);
    }

    interface Rect { x1: number; y1: number; x2: number; y2: number; id: string; }
    const rects: Rect[] = [];
    const usedDevIdx = new Set<number>();

    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      if (p.x === undefined || p.y === undefined || isNaN(p.x) || isNaN(p.y)) {
        issues.push(`第${i + 1}个坐标无效: x=${p.x}, y=${p.y}`);
        continue;
      }
      if (p.x < 20 || p.x > 1300 || p.y < 20 || p.y > 900) {
        issues.push(`器件 "${p.deviceId}" 坐标(${Math.round(p.x)},${Math.round(p.y)})超出画布有效范围[20..1300, 20..900]`);
      }
      // 栅格由 sanitizeLayoutPositions 已 snap；不再 HARD reject

      const rot = p.rotate ?? 0;
      let x1 = p.x - 54;
      let y1 = p.y - 44;
      let x2 = p.x + 54;
      let y2 = p.y + 44;
      let matchedIdx = -1;
      for (let di = 0; di < devices.length; di++) {
        if (usedDevIdx.has(di)) {
          continue;
        }
        const d = devices[di];
        if (d.libDevId === p.deviceId || d.name === p.deviceId ||
          this.refDesMatchesLib(p.deviceId ?? '', d.libDevId, d.name)) {
          matchedIdx = di;
          break;
        }
      }
      if (matchedIdx >= 0) {
        usedDevIdx.add(matchedIdx);
        const libId = devices[matchedIdx].libDevId;
        const comp = this.componentLibrary.getComponent(libId);
        if (comp?.success && comp.data && comp.data.pins.length > 0) {
          const hr = DeviceHitGeometry.hitRectFromPins(
            comp.data.pins, p.x, p.y, rot, false);
          x1 = hr.x;
          y1 = hr.y;
          x2 = hr.x + hr.w;
          y2 = hr.y + hr.h;
        }
      }
      rects.push({
        x1: x1, y1: y1, x2: x2, y2: y2,
        id: p.deviceId ?? `pos_${i}`
      });
    }

    const CHANNEL = 80;
    const MAX_GAP_ISSUES = 12;
    let gapIssues = 0;
    for (let i = 0; i < rects.length && gapIssues < MAX_GAP_ISSUES; i++) {
      for (let j = i + 1; j < rects.length && gapIssues < MAX_GAP_ISSUES; j++) {
        const a = rects[i];
        const b = rects[j];
        // 与 PlacementOptimizer 相同：分离为正，重叠为负
        const gapX = (a.x2 < b.x1) ? (b.x1 - a.x2)
          : ((b.x2 < a.x1) ? (a.x1 - b.x2) : -(Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)));
        const gapY = (a.y2 < b.y1) ? (b.y1 - a.y2)
          : ((b.y2 < a.y1) ? (a.y1 - b.y2) : -(Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1)));
        if (gapX < CHANNEL && gapY < CHANNEL) {
          const gx = Math.round(gapX);
          const gy = Math.round(gapY);
          const sx = gx < 0 ? `水平重叠${-gx}mil` : `水平间隙${gx}mil`;
          const sy = gy < 0 ? `垂直重叠${-gy}mil` : `垂直间隙${gy}mil`;
          issues.push(
            `器件 "${a.id}" 与 "${b.id}" 选中区间距不足(${sx}, ${sy}，需≥${CHANNEL}mil通道) — 请拉开距离`);
          gapIssues++;
        }
      }
    }
    if (gapIssues >= MAX_GAP_ISSUES) {
      issues.push(`…另有更多间距问题已截断，请整体加大器件间距并保证通道≥${CHANNEL}mil`);
    }

    const hasMcu = devices.some(d => {
      const id = (d.libDevId ?? '').toUpperCase();
      return id.indexOf('STM32') >= 0 || id.indexOf('AT89') >= 0 || id.indexOf('STC') >= 0;
    });
    if (hasMcu) {
      const mcuPos = positions.find(p => {
        const id = (p.deviceId ?? '').toUpperCase();
        return id.indexOf('STM32') >= 0 || id.indexOf('AT89') >= 0 ||
          id.indexOf('STC') >= 0 || id.indexOf('MCU') >= 0;
      });
      if (mcuPos) {
        if (mcuPos.x < 400 || mcuPos.x > 700 || mcuPos.y < 250 || mcuPos.y > 450) {
          issues.push(
            `MCU "${mcuPos.deviceId}" 不在画布中央区域 (x∈[400,700], y∈[250,450])，` +
            `当前(${Math.round(mcuPos.x)},${Math.round(mcuPos.y)})`);
        }
      }
    }

    return issues;
  }

  /** v3.1: LLM 全权负责网络拓扑规划 */
  private async fetchNetPlanLlm(topo: SchTopology, opts: PipelineOptions):
    Promise<LlmFetchResult<NetPlanResult>> {
    if (opts.skipLlm) {
      Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] net_plan skipLlm');
      const skipOut: NetPlanResult = {
        nets: [],
        labels: [],
        wiringHints: { priorityOrder: [], forceWire: [], forceLabel: [] },
        topologyNotes: 'skipLlm'
      };
      return { output: skipOut, fromLlm: false };
    }

    this.activeIntent = refineIntentFromTopo(this.activeIntent, topo);
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] intent topo-refined | ${formatIntentLog(this.activeIntent)}`);

    const tpl = PromptLoader.load('net_plan');
    const deviceDetail = PromptLoader.buildDeviceDetailForNetPlan(topo, this.componentLibrary);
    const posSummary = PromptLoader.buildPositionSummary(topo, this.componentLibrary);
    const usage = PromptLoader.buildDeviceUsageBlock(
      PromptLoader.libIdsFromTopo(topo), 'full', this.componentLibrary);
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] usage_manual stage=net_plan devices=${usage.deviceCount} ` +
      `included=${usage.includedCount} miss=${usage.missIds.length} ` +
      `criticalMiss=${usage.criticalMissIds.length} chars=${usage.charCount}` +
      (usage.missIds.length > 0 ? ` missIds=${usage.missIds.slice(0, 8).join(',')}` : '') +
      (usage.criticalMissIds.length > 0
        ? ` criticalMissIds=${usage.criticalMissIds.slice(0, 8).join(',')}` : ''));
    try {
      traceAiPayload('AI_PIPE', 'USAGE_MANUAL', usage.text,
        `stage=net_plan mode=full chars=${usage.charCount}`);
    } catch (_e) {
      // ignore
    }

    const prompt = PromptLoader.renderEnriched(tpl, [
      { key: 'user_prompt', value: opts.prompt },
      { key: 'device_detail', value: deviceDetail },
      { key: 'device_usage', value: usage.text },
      { key: 'position_summary', value: posSummary }
    ], this.componentLibrary, {
      intent: this.activeIntent,
      libIdsForFragments: PromptLoader.libIdsFromTopo(topo)
    });

    // edit 回退路径：在 prompt 末尾附上现图网络摘要，要求基于现图改而非从零
    let editAugment = '';
    if (opts.generationMode === 'edit') {
      editAugment =
        `\n\n【增量编辑模式 — 必须遵守】:\n` +
        `以下是现有电路网络/导线摘要，请在此基础上修正，不要整图重造：\n` +
        AiPipelineOrchestrator.formatEditContextForPrompt(topo) + '\n';
    }

    // AI 驱动纠错：net_plan 触点拓扑不过关则 critique 回灌 LLM
    let critique = '';
    let lastPlan: NetPlanResult | null = null;
    let lastHardFp = '';
    let stableCount = 0;
    for (let round = 0; round <= CRITIQUE_INNER_ROUNDS; round++) {
      const roundPrompt = critique.length > 0
        ? `${prompt}${editAugment}\n\n【上次网络计划被审查拒绝 — 必须按下列要求重出完整 netPlan JSON】:\n${critique}\n` +
          `【铁律】仪器 CH/V+ 必须并入被测信号网同名，禁止 PROBE_* 重复列出被测脚；一脚只能属一网。`
        : `${prompt}${editAugment}`;
      const api = await this.chatWithRetry(roundPrompt, AiCapability.COMPONENT_RECOMMEND,
        this.stageChatOpts({
          temperature: AiPipelineOrchestrator.temperatureForStage('net_plan'),
          maxTokens: AiPipelineOrchestrator.maxTokensForStage('net_plan')
        }));
      if (!api.success) {
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] KEEP_RETRY net_plan API failed: ${api.error ?? 'no error info'} round=${round + 1}`);
        continue;
      }
      if (!api.data || api.data.length === 0) {
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] KEEP_RETRY net_plan empty data round=${round + 1}`);
        continue;
      }
      if (!PromptLoader.isStrictJsonObjectReply(api.data)) {
        const impurity = PromptLoader.describeJsonImpurity(api.data);
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] net_plan JSON impurity=${impurity} round=${round + 1}`);
        critique =
          '【硬】上次回复违反「只出 JSON」：必须以 { 开头、} 结尾，禁止推理/markdown/代码围栏。' +
          `（${impurity}）`;
        const rawLoose = PromptLoader.extractJson<Object>(api.data);
        const planLoose = NetPlanExecutor.normalizeLlmPlan(rawLoose);
        if (planLoose && planLoose.nets && planLoose.nets.length > 0) {
          lastPlan = planLoose;
        }
        if (round < CRITIQUE_INNER_ROUNDS) {
          continue;
        }
        Logger.warn(INSTR_TRACE_TAG,
          '[AI_PIPE] net_plan accept impure JSON on last round (will still validate)');
      }
      const rawObj = PromptLoader.extractJson<Object>(api.data);
      const raw = NetPlanExecutor.normalizeLlmPlan(rawObj);
      if (!raw || !raw.nets || !Array.isArray(raw.nets) || raw.nets.length === 0) {
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] KEEP_RETRY net_plan JSON invalid round=${round + 1}`);
        critique = '输出必须是含非空 nets[] 的完整 JSON，每网含 connections(compRef/pinId/mode)';
        continue;
      }

      const repaired = NetPlanExecutor.sanitizeDuplicatePins(raw, topo);
      if (repaired > 0) {
        Logger.info(INSTR_TRACE_TAG,
          `[AI_PIPE] net_plan sanitize duplicate-pins fixes=${repaired} round=${round + 1}`);
      }
      lastPlan = raw;
      const split = AiPipelineOrchestrator.critiqueNetPlanSplit(
        raw, topo, opts.prompt, this.activeIntent);
      const pinHard = NetPlanExecutor.validatePinsAgainstLibrary(
        raw, topo, this.componentLibrary);
      for (let phi = 0; phi < pinHard.length; phi++) {
        split.hard.push(pinHard[phi]);
      }
      // 关键器件无手册精确/族条目：禁止仅靠弱 description 兜底建网
      if (usage.criticalMissIds.length > 0) {
        split.hard.push(
          `关键器件无手册条目: ${usage.criticalMissIds.slice(0, 6).join(',')}` +
          ` — 请改用库内标准 libDevId 或补手册后再建网`);
      }
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] critique HARD=${split.hard.length} SOFT=${split.soft.length}`);
      if (split.hard.length > 0) {
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] critique HARD reasons: ${split.hard.slice(0, 4).join(' | ')}`);
      }
      if (split.hard.length === 0) {
        if (split.soft.length > 0) {
          Logger.warn(INSTR_TRACE_TAG,
            `[AI_PIPE] net_plan SOFT residual=${split.soft.length}: ${split.soft.join('; ')}`);
        }
        Logger.info(INSTR_TRACE_TAG,
          `[AI_PIPE] net_plan LLM OK nets=${raw.nets.length}` +
          ` labels=${raw.labels?.length ?? 0} round=${round + 1}`);
        try {
          traceAiPayload('AI_PIPE', 'NETPLAN_JSON', JSON.stringify(raw),
            'stage=net_plan');
        } catch (_e) {
          // ignore
        }
        return { output: raw, fromLlm: true };
      }
      const early = AiPipelineOrchestrator.tryEarlyStopStable(
        split.hard, lastHardFp, stableCount, 'net_plan');
      lastHardFp = early.lastFp;
      stableCount = early.stableCount;
      if (early.accept) {
        // NEVER_ABORT：稳定 HARD 残差也 ACCEPT（sanitize 后继续执行）
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] KEEP_RETRY ACCEPT net_plan early_stop residual HARD=${split.hard.length}`);
        NetPlanExecutor.sanitizeDuplicatePins(raw, topo);
        NetPlanExecutor.healOpAmpFloatingInputsInPlan(raw, topo);
        return { output: raw, fromLlm: true };
      }
      critique = AiPipelineOrchestrator.formatCritiqueFeedback(split);
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] net_plan AI-critique reject round=${round + 1}: HARD=${split.hard.length}` +
        ` | ${split.hard.slice(0, 3).join('; ')}`);
    }

    if (lastPlan) {
      const again = NetPlanExecutor.sanitizeDuplicatePins(lastPlan, topo);
      if (again > 0) {
        Logger.info(INSTR_TRACE_TAG,
          `[AI_PIPE] net_plan final sanitize fixes=${again}`);
      }
      const stillSplit = AiPipelineOrchestrator.critiqueNetPlanSplit(
        lastPlan, topo, opts.prompt, this.activeIntent);
      const pinHard2 = NetPlanExecutor.validatePinsAgainstLibrary(
        lastPlan, topo, this.componentLibrary);
      for (let phi = 0; phi < pinHard2.length; phi++) {
        stillSplit.hard.push(pinHard2[phi]);
      }
      if (usage.criticalMissIds.length > 0) {
        stillSplit.hard.push(
          `关键器件无手册条目: ${usage.criticalMissIds.slice(0, 6).join(',')}` +
          ` — 请改用库内标准 libDevId 或补手册后再建网`);
      }
      if (stillSplit.hard.length === 0) {
        Logger.warn(INSTR_TRACE_TAG,
          '[AI_PIPE] net_plan critique exhausted but sanitized plan clean — accept');
        return { output: lastPlan, fromLlm: true };
      }
      // NEVER_ABORT：生产路径也 ACCEPT 清洗后的 plan（带 HARD 备注），禁止空网 fromLlm=false
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] KEEP_RETRY ACCEPT net_plan residual HARD=${stillSplit.hard.length}:` +
        ` ${stillSplit.hard.slice(0, 4).join('; ')}`);
      lastPlan.topologyNotes =
        `${lastPlan.topologyNotes ?? ''}|residualHARD:${stillSplit.hard.slice(0, 3).join('; ')}`;
      return { output: lastPlan, fromLlm: true };
    }

    Logger.warn(INSTR_TRACE_TAG,
      '[AI_PIPE] KEEP_RETRY net_plan no plan yet — return empty for outer retry (no ABORT)');
    const failOut: NetPlanResult = {
      nets: [], labels: [],
      wiringHints: { priorityOrder: [], forceWire: [], forceLabel: [] },
      topologyNotes: 'net_plan pending KEEP_RETRY'
    };
    return { output: failOut, fromLlm: false };
  }

  /** 将 net_plan.wiringHints 合并进布线约束（局部小网 forceWire 优先保留） */
  private mergeNetPlanHintsIntoRouting(
    route: RoutingLlmOutput,
    netPlanFetch: LlmFetchResult<NetPlanResult>
  ): void {
    if (!netPlanFetch.fromLlm || !netPlanFetch.output.wiringHints) {
      return;
    }
    const hints = netPlanFetch.output.wiringHints;
    const mergeUnique = (base: string[] | undefined, extra: string[]): string[] => {
      const out: string[] = [];
      const seen = new Set<string>();
      const src = (base ?? []).concat(extra ?? []);
      for (let i = 0; i < src.length; i++) {
        if (src[i] === undefined || src[i] === null) {
          continue;
        }
        const u = `${src[i]}`.toUpperCase();
        if (u.length === 0 || u === 'UNDEFINED' || u === 'NULL' || seen.has(u)) {
          continue;
        }
        seen.add(u);
        out.push(`${src[i]}`);
      }
      return out;
    };
    route.forceLabelNets = mergeUnique(route.forceLabelNets, hints.forceLabel ?? []);
    route.forceWireNets = mergeUnique(route.forceWireNets, hints.forceWire ?? []);
    if ((route.forceLabelNets?.length ?? 0) > 0 || (route.forceWireNets?.length ?? 0) > 0) {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] route modeHints forceLabel=[${(route.forceLabelNets ?? []).join(',')}]` +
        ` forceWire=[${(route.forceWireNets ?? []).join(',')}]`);
    }
  }

  private async fetchRoutingLlm(topo: SchTopology, opts: PipelineOptions,
    netPlanFetch?: LlmFetchResult<NetPlanResult>):
    Promise<LlmFetchResult<RoutingLlmOutput>> {
    const netNamesSorted = topo.netList.map(n => n.netName ?? '').slice().sort().join(',');
    const hintsFp = netPlanFetch?.fromLlm
      ? `${(netPlanFetch.output.wiringHints?.forceLabel ?? []).join(',')}|` +
        `${(netPlanFetch.output.wiringHints?.forceWire ?? []).join(',')}`
      : '';
    const idHint = topo.deviceList.slice(0, 24).map(d => d.libDevId).join(',') +
      '|' + netNamesSorted.substring(0, 120) + '|' + hintsFp.substring(0, 80);
    const cacheKey = `route:${topo.deviceList.length}:${topo.netList.length}:${idHint}`;
    const cached = this.cacheGet<RoutingLlmOutput>(cacheKey);
    if (cached) {
      return { output: cached, fromLlm: true };
    }

    const defaultOut = ConstrainedWiringEngine.defaultConstraints(topo);
    if (opts.skipLlm) {
      return { output: defaultOut, fromLlm: false };
    }

    const tpl = PromptLoader.load('route');
    const netDetailLines: string[] = [];
    for (let i = 0; i < topo.netList.length && i < 40; i++) {
      const n = topo.netList[i];
      const pins: string[] = [];
      for (let ki = 0; ki < (n.nodeList?.length ?? 0) && pins.length < 6; ki++) {
        const node = n.nodeList[ki];
        const dev = topo.deviceList.find(d => d.instUuid === node.devUuid);
        pins.push(`${dev?.refName ?? '?'}.${node.pinId}`);
      }
      netDetailLines.push(`${n.netName}(${n.nodeList?.length ?? 0}): ${pins.join(',')}`);
    }
    const hints = netPlanFetch?.output?.wiringHints;
    const hintText = hints
      ? `forceLabel=[${(hints.forceLabel ?? []).join(',')}] forceWire=[${(hints.forceWire ?? []).join(',')}]`
      : '(无 net_plan wiringHints)';
    const usage = PromptLoader.buildDeviceUsageBlock(
      PromptLoader.libIdsFromTopo(topo), 'compact', this.componentLibrary);
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] usage_manual stage=route devices=${usage.deviceCount} ` +
      `included=${usage.includedCount} miss=${usage.missIds.length} chars=${usage.charCount}` +
      (usage.missIds.length > 0 ? ` missIds=${usage.missIds.slice(0, 8).join(',')}` : ''));
    try {
      traceAiPayload('AI_PIPE', 'USAGE_MANUAL', usage.text,
        `stage=route mode=compact chars=${usage.charCount}`);
    } catch (_e) {
      // ignore
    }
    const basePrompt = PromptLoader.renderEnriched(tpl, [
      {
        key: 'topology_summary',
        value: `${topo.deviceList.length} devices, ${topo.netList.length} nets | ${hintText}`
      },
      { key: 'net_list', value: netDetailLines.join('\n') },
      { key: 'device_usage', value: usage.text }
    ], this.componentLibrary);

    let critique = '';
    let lastParsed: RoutingLlmOutput | null = null;
    let lastHardFp = '';
    let stableCount = 0;
    const ROUTE_ROUNDS = 3;
    for (let round = 0; round <= ROUTE_ROUNDS; round++) {
      const roundPrompt = critique.length > 0
        ? `${basePrompt}\n\n【上次布线约束被审查拒绝 — 必须重出完整 JSON】:\n${critique}`
        : basePrompt;
      const api = await this.chatWithRetry(roundPrompt, AiCapability.AUTO_WIRING,
        this.stageChatOpts({
          temperature: AiPipelineOrchestrator.temperatureForStage('route'),
          maxTokens: AiPipelineOrchestrator.maxTokensForStage('route')
        }));
      if (api.success && api.data) {
        const raw = PromptLoader.extractJson<Object>(api.data);
        const parsed = LlmJsonNormalizer.normalizeRouting(raw);
        const score = this.scoreLlmJson(parsed, LlmJsonNormalizer.routingScoreFields());
        if (parsed && score >= QUALITY_MIN_FILL_RATE) {
          lastParsed = parsed;
          this.sanitizeRoutingForceModes(parsed, topo);
          const hard = this.critiqueRouting(parsed, topo, netPlanFetch);
          Logger.info(INSTR_TRACE_TAG,
            `[AI_PIPE] route critique HARD=${hard.length} round=${round + 1}`);
          if (hard.length === 0) {
            this.cacheSet(cacheKey, parsed);
            return { output: parsed, fromLlm: true };
          }
          const early = AiPipelineOrchestrator.tryEarlyStopStable(
            hard, lastHardFp, stableCount, 'route');
          lastHardFp = early.lastFp;
          stableCount = early.stableCount;
          if (early.accept) {
            Logger.warn(INSTR_TRACE_TAG,
              `[AI_PIPE] route early_stop blocked HARD=${hard.length} — continue critique`);
          }
          critique = hard.map((s, i) => `${i + 1}. [HARD] ${s}`).join('\n');
          continue;
        }
      }
      if (round === ROUTE_ROUNDS) {
        break;
      }
    }
    if (lastParsed) {
      this.sanitizeRoutingForceModes(lastParsed, topo);
      const still = this.critiqueRouting(lastParsed, topo, netPlanFetch);
      if (still.length === 0) {
        this.cacheSet(cacheKey, lastParsed);
        return { output: lastParsed, fromLlm: true };
      }
      // 残差 HARD：强制标号兜底，fromLlm=false 以免假绿；保留已清洗约束
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] route residual HARD=${still.length} — forceLabel degrade (not LLM-clean): ` +
        `${still.slice(0, 3).join('; ')}`);
      this.forceRoutingLabelDegrade(lastParsed, topo, netPlanFetch);
      this.sanitizeRoutingForceModes(lastParsed, topo);
      return { output: lastParsed, fromLlm: false };
    }
    Logger.warn(INSTR_TRACE_TAG,
      '[AI_PIPE] route LLM fail — defaultConstraints with instrument forceLabel');
    return { output: defaultOut, fromLlm: false };
  }

  /** 布线约束审查：未知网名、纯仪器网误入 forceWire、缺 forceLabel */
  private critiqueRouting(route: RoutingLlmOutput, topo: SchTopology,
    netPlanFetch?: LlmFetchResult<NetPlanResult>): string[] {
    const hard: string[] = [];
    const known = new Set<string>();
    for (let i = 0; i < topo.netList.length; i++) {
      known.add((topo.netList[i].netName ?? '').toUpperCase());
    }
    const checkNames = (names: string[] | undefined, label: string): void => {
      if (!names) {
        return;
      }
      for (let i = 0; i < names.length; i++) {
        const n = (names[i] ?? '').toUpperCase();
        if (n.length === 0) {
          continue;
        }
        if (!known.has(n)) {
          hard.push(`${label} 含未知网名 "${names[i]}" — 必须与拓扑网名一致`);
        }
      }
    };
    checkNames(route.forceLabelNets, 'forceLabel');
    checkNames(route.forceWireNets, 'forceWire');

    const instrOnly = this.collectInstrumentOnlyNetNames(topo);
    const fw = route.forceWireNets ?? [];
    for (let i = 0; i < fw.length; i++) {
      if (instrOnly.has((fw[i] ?? '').toUpperCase())) {
        hard.push(`纯仪器网 "${fw[i]}" 禁止 forceWire — 必须 forceLabel`);
      }
    }
    // 有纯仪器网但 forceLabel 完全为空 → HARD
    if (instrOnly.size > 0 && (route.forceLabelNets?.length ?? 0) === 0) {
      const planLabels = netPlanFetch?.output?.wiringHints?.forceLabel ?? [];
      if (planLabels.length === 0) {
        hard.push(
          `拓扑含纯仪器测量网(${Array.from(instrOnly).slice(0, 4).join(',')})` +
          ` — forceLabel 不得为空`);
      }
    }
    return hard;
  }

  /** 含仪器引脚的网络名（含示波器 GND 所在地网） */
  private collectInstrumentNetNames(topo: SchTopology): Set<string> {
    const instrNetNames = new Set<string>();
    const isInstr = (lib: string): boolean => {
      const u = (lib ?? '').toUpperCase();
      return u.indexOf('OSCILLOSCOPE') >= 0 || u.indexOf('VOLTMETER') >= 0 ||
        u.indexOf('AMMETER') >= 0 || u.indexOf('UART') >= 0 ||
        u.indexOf('LOGIC_ANALYZER') >= 0 || u.indexOf('FREQ_COUNTER') >= 0 ||
        u.indexOf('POWER_METER') >= 0 || u.indexOf('VIRTUAL_METER') >= 0;
    };
    for (let ni = 0; ni < topo.netList.length; ni++) {
      const net = topo.netList[ni];
      for (let ki = 0; ki < (net.nodeList?.length ?? 0); ki++) {
        const node = net.nodeList[ki];
        const dev = topo.deviceList.find(d => d.instUuid === node.devUuid);
        if (dev && isInstr(dev.libDevId ?? '')) {
          instrNetNames.add((net.netName ?? '').toUpperCase());
          break;
        }
      }
    }
    return instrNetNames;
  }

  /** 仅仪器脚（DUT <2）的网：必须 forceLabel；DUT≥2 的探针并网可 forceWire */
  private collectInstrumentOnlyNetNames(topo: SchTopology): Set<string> {
    const all = this.collectInstrumentNetNames(topo);
    const out = new Set<string>();
    const allArr = Array.from(all);
    for (let i = 0; i < allArr.length; i++) {
      const up = allArr[i];
      if (this.countDutPinsOnNet(topo, up) < 2) {
        out.add(up);
      }
    }
    return out;
  }

  private countDutPinsOnNet(topo: SchTopology, netNameUp: string): number {
    const isInstrDev = (lib: string): boolean => {
      const u = (lib ?? '').toUpperCase();
      return u.indexOf('OSCILLOSCOPE') >= 0 || u.indexOf('VOLTMETER') >= 0 ||
        u.indexOf('AMMETER') >= 0 || u.indexOf('UART') >= 0 ||
        u.indexOf('LOGIC_ANALYZER') >= 0 || u.indexOf('FREQ_COUNTER') >= 0 ||
        u.indexOf('POWER_METER') >= 0 || u.indexOf('VIRTUAL_METER') >= 0 ||
        u.indexOf('SIGNAL_GEN') >= 0;
    };
    const isInstrPin = (pinId: string): boolean => {
      const p = (pinId ?? '').toUpperCase();
      if (/^CH\d+$/.test(p)) {
        return true;
      }
      return p === 'V+' || p === 'I+' || p === 'I-' || p === 'COM' ||
        p === 'PROBE' || p === 'V' || p === 'A';
    };
    let n = 0;
    for (let ni = 0; ni < topo.netList.length; ni++) {
      const net = topo.netList[ni];
      if ((net.netName ?? '').toUpperCase() !== netNameUp) {
        continue;
      }
      for (let ki = 0; ki < (net.nodeList?.length ?? 0); ki++) {
        const node = net.nodeList[ki];
        const dev = topo.deviceList.find(d => d.instUuid === node.devUuid);
        if (!dev) {
          continue;
        }
        if (isInstrDev(dev.libDevId ?? '') || isInstrPin(node.pinId ?? '')) {
          continue;
        }
        n++;
      }
      break;
    }
    return n;
  }

  /**
   * route residual HARD：把 forceWire 全部并入 forceLabel，并合并 default/hints，
   * 避免残差仍当 LLM 成功。
   */
  private forceRoutingLabelDegrade(route: RoutingLlmOutput, topo: SchTopology,
    netPlanFetch?: LlmFetchResult<NetPlanResult>): void {
    const defaults = ConstrainedWiringEngine.defaultConstraints(topo);
    if (netPlanFetch) {
      this.mergeNetPlanHintsIntoRouting(route, netPlanFetch);
    }
    const fl = route.forceLabelNets ?? [];
    const fw = route.forceWireNets ?? [];
    const seen = new Set<string>();
    const merged: string[] = [];
    const push = (name: string): void => {
      const up = (name ?? '').toUpperCase();
      if (up.length === 0 || seen.has(up)) {
        return;
      }
      seen.add(up);
      merged.push(name);
    };
    for (let i = 0; i < fl.length; i++) {
      push(fl[i] ?? '');
    }
    for (let i = 0; i < fw.length; i++) {
      push(fw[i] ?? '');
    }
    const dFl = defaults.forceLabelNets ?? [];
    for (let i = 0; i < dFl.length; i++) {
      push(dFl[i] ?? '');
    }
    route.forceLabelNets = merged;
    route.forceWireNets = [];
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] route forceLabel degrade n=${merged.length}`);
  }

  /**
   * 确定性清洗布线约束：
   * - 纯仪器网（DUT <2）或电源轨：forceWire → forceLabel
   * - DUT≥2 的探针并网：保留 forceWire（A* 画 DUT 导线；仪器脚用 stub）
   */
  private sanitizeRoutingForceModes(route: RoutingLlmOutput, topo: SchTopology): void {
    const instr = this.collectInstrumentNetNames(topo);
    if (instr.size === 0) {
      return;
    }
    const fw = route.forceWireNets ?? [];
    const fl = route.forceLabelNets ?? [];
    const flUp = new Set<string>();
    for (let i = 0; i < fl.length; i++) {
      flUp.add((fl[i] ?? '').toUpperCase());
    }
    const newFw: string[] = [];
    let moved = 0;
    let keptMixed = 0;
    for (let i = 0; i < fw.length; i++) {
      const name = fw[i] ?? '';
      const up = name.toUpperCase();
      if (instr.has(up)) {
        const dutN = this.countDutPinsOnNet(topo, up);
        const powerLike = up === 'GND' || up === 'VCC' || up === 'VEE' || up === 'VDD' ||
          up === 'VSS' || up.indexOf('GND') === 0 || up.indexOf('VCC') === 0;
        if (dutN < 2 || powerLike) {
          if (!flUp.has(up) && name.length > 0) {
            fl.push(name);
            flUp.add(up);
          }
          moved++;
        } else {
          // 混挂：保留 forceWire，并从 forceLabel 剔除以免 demote 覆盖 A*
          newFw.push(name);
          keptMixed++;
          for (let li = fl.length - 1; li >= 0; li--) {
            if ((fl[li] ?? '').toUpperCase() === up) {
              fl.splice(li, 1);
              flUp.delete(up);
            }
          }
        }
      } else if (name.length > 0) {
        newFw.push(name);
      }
    }
    // 仅补齐纯仪器网到 forceLabel
    const instrOnly = this.collectInstrumentOnlyNetNames(topo);
    const instrArr = Array.from(instrOnly);
    for (let i = 0; i < instrArr.length; i++) {
      const up = instrArr[i];
      if (!flUp.has(up) && up.length > 0) {
        fl.push(up);
        flUp.add(up);
      }
    }
    route.forceWireNets = newFw;
    route.forceLabelNets = fl;
    if (moved > 0 || keptMixed > 0) {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] route sanitize forceWire→forceLabel moved=${moved}` +
        ` keepMixedWire=${keptMixed}` +
        ` forceLabel=[${fl.join(',')}] forceWire=[${newFw.join(',')}]`);
    }
  }
}
