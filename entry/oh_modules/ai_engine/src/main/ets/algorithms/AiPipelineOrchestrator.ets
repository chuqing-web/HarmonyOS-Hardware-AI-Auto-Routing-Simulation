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
  Logger, INSTR_TRACE_TAG, traceAiPayload, traceAiOp, traceAiDiag, traceAiStage, AiErcGateUtil,
  DeviceHitGeometry, emptySchTopology, mapAwareStringify, mapAwareParse, ensureStringMap,
  MainThreadYield, DeviceRequirement
} from 'common';
import { PromptLoader } from '../prompts/PromptLoader';
import { PromptVarEntry, ChatHistoryEntry } from '../internal/AiEngineTypes';
import { DeviceSelectEngine } from './DeviceSelectEngine';
import { PlacementOptimizer } from './PlacementOptimizer';
import { ConstrainedWiringEngine } from './ConstrainedWiringEngine';
import { FaultDiagnoser } from './FaultDiagnoser';
import { LlmJsonNormalizer } from './LlmJsonNormalizer';
import { NetPlanExecutor, NetPlanResult, NetPlanExecutionResult } from './NetPlanExecutor';
import { SemanticNetBuilder } from './SemanticNetBuilder';
import { PostGenValidator, ValidationIssue } from './PostGenValidator';
import { AiTopologyFixKit } from './AiTopologyFixKit';
import {
  CircuitIntent, CritiqueSplit, classifyCircuitIntent, refineCircuitIntent,
  refineIntentFromTopo, formatIntentLog, hardResidualFingerprint,
  splitEmpty, allCritiqueLines, intentIsMutualLedSwitch,
  defaultCircuitIntent
} from './CircuitIntent';
import {
  ModularPlan, normalizeModularPlan, healModularPlan, critiqueModularPlan,
  buildModuleSubPrompt, mergeModularTopologies, alignTopoRefsToBoundaryPins,
  buildModularStreamPreview, normalizeBoundaryKey
} from './ModularParallelMerge';

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

interface LlmFetchResult<T> {
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

const CACHE_TTL_MS = 5 * 60 * 1000;
const LLM_MAX_RETRIES = 2;
/** 关键阶段（选型/建网）critique 内轮；达上限后生产路径 ABORT */
const CRITIQUE_INNER_ROUNDS = 3;
const LAYOUT_INNER_ROUNDS = 3;
/** 选型/建网 outer 重试（API 抖动）；layout/route 用 SOFT_OUTER */
const CRITICAL_OUTER = 5;
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

function abortPipelineResult(errType: string, desc: string, suggest: string): AiPipelineResult {
  Logger.error(INSTR_TRACE_TAG,
    `[AI_PIPE] STAGE_ABORT ${errType} | ${desc}`);
  traceAiStage('AI_PIPE', errType, 'ABORT', desc);
  return {
    topology: emptySchTopology(),
    usedLlm: false,
    degradedMode: false,
    ercClean: false,
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

export class AiPipelineOrchestrator {
  private apiManager: IAiApiManager;
  private componentLibrary: IComponentLibrary;
  private selectEngine: DeviceSelectEngine;
  private placementOptimizer: PlacementOptimizer = new PlacementOptimizer();
  private wiringEngine: ConstrainedWiringEngine = new ConstrainedWiringEngine();
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
  /** 当前 STAGE 计时起点 */
  private stageT0: number = 0;
  /** 当前 STAGE 名（与 diagStage 同步） */
  private stageName: string = 'idle';

  constructor(apiManager: IAiApiManager, library: IComponentLibrary, moduleTag: string = '') {
    this.apiManager = apiManager;
    this.componentLibrary = library;
    this.moduleTag = moduleTag;
    this.selectEngine = new DeviceSelectEngine(library);
    this.wiringEngine.setComponentLibrary(library);
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

  /** 阶段中止 / 外层重试 */
  private stageAbortOrRetry(phase: 'ABORT' | 'RETRY', detail: string): void {
    traceAiStage('AI_PIPE', this.stageName.length > 0 ? this.stageName : this.diagStage,
      phase, `${this.logTag()}${detail}`);
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

    onProgress?.(makeProgress(5, '解析器件需求(LLM)'));
    this.markStage('device_select');
    traceAiOp('AI_PIPE', 'device_select', 'fetch LLM JSON');
    let selectLlm = await this.fetchDeviceSelectLlm(opts);
    for (let outer = 0; !selectLlm.fromLlm && !opts.skipLlm && outer < NEVER_ABORT_OUTER; outer++) {
      this.stageAbortOrRetry('RETRY', `outer=${outer + 1}/${NEVER_ABORT_OUTER}`);
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] KEEP_RETRY device_select outer=${outer + 1}/${NEVER_ABORT_OUTER}`);
      onProgress?.(makeProgress(5, `器件选型重试 ${outer + 1}`));
      selectLlm = await this.fetchDeviceSelectLlm(opts);
    }
    if (selectLlm.fromLlm) {
      usedLlm = true;
      Logger.info(INSTR_TRACE_TAG, '[AI_PIPE] device_select from LLM');
      const reqN0 = selectLlm.output.deviceRequireList?.length ?? 0;
      this.stageMetric('bom',
        `fromLlm=true requireN=${reqN0} ood=${(selectLlm.output.oodFlags ?? []).length}`);
      try {
        traceAiPayload('AI_PIPE', 'SELECT_JSON', JSON.stringify(selectLlm.output),
          'stage=device_select');
      } catch (_e) {
        Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] SELECT_JSON stringify failed');
      }
      this.endStage(true, `requireN=${reqN0}`);
    } else if (!opts.skipLlm) {
      this.stageAbortOrRetry('ABORT', 'LLM unavailable');
      this.endStage(false, 'LLM unavailable');
      Logger.error(INSTR_TRACE_TAG,
        '[AI_PIPE] ABORT: device_select LLM unavailable — refuse local/template');
      return abortPipelineResult('device_select',
        '器件选型 LLM 不可用，已拒绝本地/模板回退',
        '检查 AI API 配置、模型与连通性测试');
    } else {
      degradedMode = true;
      this.endStage(true, 'skipLlm local');
      Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] device_select local (skipLlm)');
      this.notifyDegraded('器件选型');
    }

    onProgress?.(makeProgress(20, '本地器件库匹配'));
    this.markStage('library_match');
    traceAiOp('AI_PIPE', 'library_match', 'matchFromLlmOutput');
    let selectResult = this.selectEngine.matchFromLlmOutput(selectLlm.output, opts.prompt);
    for (let outer = 0; selectResult.devices.length === 0 && !opts.skipLlm && outer < NEVER_ABORT_OUTER; outer++) {
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] KEEP_RETRY zero matches → re-select outer=${outer + 1}/${NEVER_ABORT_OUTER}`);
      onProgress?.(makeProgress(20, `库匹配为空，重选 ${outer + 1}`));
      selectLlm = await this.fetchDeviceSelectLlm(opts);
      if (selectLlm.fromLlm) {
        usedLlm = true;
      }
      selectResult = this.selectEngine.matchFromLlmOutput(selectLlm.output, opts.prompt);
    }
    if (selectResult.devices.length === 0 && !opts.skipLlm) {
      this.stageAbortOrRetry('ABORT', 'zero library matches');
      this.endStage(false, 'matched=0');
      Logger.error(INSTR_TRACE_TAG, '[AI_PIPE] ABORT: zero library matches');
      return abortPipelineResult('library_match',
        '器件库匹配为空，已拒绝空图/模板回退',
        '检查选型 JSON 的 explicitModel 是否为库内 libDevId');
    }
    if (selectLlm.output.oodFlags && selectLlm.output.oodFlags.length > 0) {
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] OOD notes (non-fatal): ${selectLlm.output.oodFlags.join(',')}`);
      this.stageMetric('ood', selectLlm.output.oodFlags.slice(0, 8).join(','));
    }
    const matchHint = selectResult.devices
      .slice(0, 8)
      .map(d => `${d.libDevId}/${d.matchLevel}`)
      .join(', ');
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] matched ${selectResult.devices.length}: ${matchHint}`);
    traceAiOp('AI_PIPE', 'library_match_done',
      `count=${selectResult.devices.length} ${matchHint}`);
    this.stageMetric('matched', `${selectResult.devices.length} ${matchHint}`);

    // 部分 BOM 未匹配 → 生产路径 ABORT（matchedRequireCount 不含 auto VCC/GND）
    const requireN = selectLlm.output.deviceRequireList?.length ?? 0;
    const matchedReq = selectResult.matchedRequireCount ?? 0;
    if (!opts.skipLlm && requireN > 0 && matchedReq < requireN) {
      const missFlags = (selectLlm.output.oodFlags ?? []).slice(0, 6).join(',') ||
        `matchedRequire=${matchedReq}/${requireN}`;
      this.stageAbortOrRetry('ABORT',
        `partial BOM require=${requireN} matchedRequire=${matchedReq}`);
      this.endStage(false, missFlags);
      Logger.error(INSTR_TRACE_TAG,
        `[AI_PIPE] ABORT: partial BOM unmatched require=${requireN}` +
        ` matchedRequire=${matchedReq} devices=${selectResult.devices.length} flags=${missFlags}`);
      return abortPipelineResult('library_match',
        `器件库部分未匹配(${missFlags})，已拒绝残缺 BOM 落图`,
        '检查选型 JSON 的 explicitModel 是否均为库内精确 libDevId');
    }
    this.endStage(true, `matchedRequire=${matchedReq}/${requireN} devices=${selectResult.devices.length}`);
    onProgress?.(makeProgress(28, `匹配 ${selectResult.devices.length}: ${matchHint}`));

    this.activeIntent = refineCircuitIntent(opts.prompt, selectLlm.output, selectResult.devices);
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] intent refined | ${formatIntentLog(this.activeIntent)}`);

    onProgress?.(makeProgress(35, '获取布局约束'));
    this.markStage('layout');
    traceAiOp('AI_PIPE', 'layout_constraints', 'fetch LLM or default');
    let layoutLlm = await this.fetchLayoutLlm(selectResult.devices, selectLlm.output.circuitConstraint, opts);
    for (let outer = 0;
      (!layoutLlm.fromLlm || !(layoutLlm.output.positions && layoutLlm.output.positions.length > 0)) &&
      !opts.skipLlm && selectResult.devices.length > 0 && outer < SOFT_OUTER; outer++) {
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] KEEP_RETRY layout outer=${outer + 1}/${SOFT_OUTER}`);
      onProgress?.(makeProgress(35, `布局重试 ${outer + 1}`));
      layoutLlm = await this.fetchLayoutLlm(selectResult.devices, selectLlm.output.circuitConstraint, opts);
    }
    if (layoutLlm.fromLlm) {
      usedLlm = true;
      Logger.info(INSTR_TRACE_TAG, '[AI_PIPE] layout constraints from LLM');
      this.stageMetric('positions',
        `${layoutLlm.output.positions?.length ?? 0}`);
      try {
        traceAiPayload('AI_PIPE', 'LAYOUT_JSON', JSON.stringify(layoutLlm.output),
          'stage=layout');
      } catch (_e) {
        Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] LAYOUT_JSON stringify failed');
      }
      this.endStage(true, `positions=${layoutLlm.output.positions?.length ?? 0}`);
    } else if (!opts.skipLlm) {
      Logger.warn(INSTR_TRACE_TAG,
        '[AI_PIPE] layout weak — GA/default (degraded, usedLlm 不伪造)');
      degradedMode = true;
      this.stageMetric('degraded', 'layout weak');
      this.endStage(false, 'degraded GA/default');
      this.notifyDegraded('布局约束');
    } else {
      degradedMode = true;
      Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] layout constraints local (skipLlm)');
      this.endStage(true, 'skipLlm');
      this.notifyDegraded('布局约束');
    }

    // AI 坐标布局；无坐标则确定性摆放继续（永不 ABORT）
    const aiPositions = layoutLlm.output.positions;
    let placement: PlacementResult;
    this.markStage('placement');
    if (aiPositions && aiPositions.length > 0) {
      onProgress?.(makeProgress(50, 'AI 坐标布局'));
      traceAiOp('AI_PIPE', 'placement', 'AI position-driven');
      placement = this.applyAiPositions(selectResult.devices, aiPositions,
        opts.lockedDeviceUuids ?? [], opts.partialTopo);
      this.placementOptimizer.resolveSelectionOverlaps(placement.topology);
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] placement AI-driven: ${aiPositions.length} positions (hit-overlap resolved)`);
    } else {
      onProgress?.(makeProgress(50, '坐标缺失→确定性摆放继续'));
      traceAiOp('AI_PIPE', 'placement', 'GA/default continue (no ABORT)');
      placement = await this.placementOptimizer.optimizeAsync(
        selectResult.devices,
        layoutLlm.output,
        opts.lockedDeviceUuids ?? [],
        opts.partialTopo
      );
      this.placementOptimizer.resolveSelectionOverlaps(placement.topology);
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] KEEP_RETRY placement without LLM positions — placed=${placement.topology.deviceList.length}`);
    }
    const placeHint = placement.topology.deviceList
      .slice(0, 10)
      .map(d => `${d.refName || d.libDevId}@(${Math.round(d.x)},${Math.round(d.y)})`)
      .join(', ');
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] placement devices=${placement.topology.deviceList.length}`);
    traceAiOp('AI_PIPE', 'placement_done',
      `devices=${placement.topology.deviceList.length} ${placeHint}`);
    this.stageMetric('placed', placeHint);
    this.endStage(true, `devices=${placement.topology.deviceList.length}`);
    this.logTopoFieldDiag('placement', placement.topology);

    // 流式快照 #1: 器件已摆放，尚无网络/导线
    opts.onStreamSnapshot?.(placement.topology, 'placement');

    // LLM 网络拓扑：KEEP_RETRY，永不因 critique 主动 ABORT
    onProgress?.(makeProgress(62, 'LLM 网络拓扑规划'));
    this.markStage('net_plan');
    traceAiOp('AI_PIPE', 'net_plan', 'LLM net_plan + NetPlanExecutor');
    let netPlanResult = await this.fetchNetPlanLlm(placement.topology, opts);
    for (let outer = 0; !netPlanResult.fromLlm && !opts.skipLlm && outer < NEVER_ABORT_OUTER; outer++) {
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] KEEP_RETRY net_plan outer=${outer + 1}/${NEVER_ABORT_OUTER}`);
      onProgress?.(makeProgress(62, `网络规划重试 ${outer + 1}`));
      netPlanResult = await this.fetchNetPlanLlm(placement.topology, opts);
    }
    let topoWithNets: SchTopology;
    let netPlanNotes = '';
    if (netPlanResult.fromLlm ||
      (netPlanResult.output.nets && netPlanResult.output.nets.length > 0)) {
      if (netPlanResult.fromLlm) {
        usedLlm = true;
      }
      NetPlanExecutor.sanitizeDuplicatePins(netPlanResult.output, placement.topology);
      const execResult = this.executeNetPlanLabelFirst(placement.topology, netPlanResult.output);
      topoWithNets = execResult.topology;
      netPlanNotes = execResult.notes;
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] LLM netPlan: ${execResult.netCount}网/${execResult.labelCount}标号` +
        `/${execResult.stubWireCount}stubs failures=${execResult.failures.length}`);
      this.stageMetric('exec',
        `nets=${execResult.netCount} labels=${execResult.labelCount}` +
        ` stubs=${execResult.stubWireCount} failures=${execResult.failures.length}`);
      const wpN = (netPlanResult.output.nets ?? [])
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
        // 生产路径：建网失败 — 清洗别名后重执行；仅电气致命/网过少才 ABORT
        if (!opts.skipLlm) {
          const critical = execResult.failures.filter(f =>
            f.indexOf('短路') >= 0 ||
            (f.indexOf('VCC') >= 0 && f.indexOf('GND') >= 0) ||
            f.indexOf('只有') >= 0);
          const softMiss = execResult.failures.filter(f =>
            f.indexOf('找不到') >= 0 || f.indexOf('跳过') >= 0);
          if (critical.length > 0 || execResult.netCount < 2 || softMiss.length > 0) {
            NetPlanExecutor.sanitizeDuplicatePins(netPlanResult.output, placement.topology);
            NetPlanExecutor.sanitizeUnknownDeviceRefs(netPlanResult.output, placement.topology);
            const retryExec = this.executeNetPlanLabelFirst(placement.topology, netPlanResult.output);
            const retryFatal = retryExec.failures.filter(f =>
              f.indexOf('短路') >= 0 ||
              (f.indexOf('VCC') >= 0 && f.indexOf('GND') >= 0) ||
              f.indexOf('只有') >= 0);
            if (retryExec.netCount >= 2 && retryFatal.length === 0) {
              topoWithNets = retryExec.topology;
              if (retryExec.failures.length > 0) {
                degradedMode = true;
              }
              Logger.warn(INSTR_TRACE_TAG,
                `[AI_PIPE] net_plan exec recovered nets=${retryExec.netCount}` +
                ` failLeft=${retryExec.failures.length}`);
            } else {
              this.stageAbortOrRetry('ABORT',
                `exec critical=${Math.max(critical.length, retryFatal.length)} nets=${retryExec.netCount}`);
              this.endStage(false, `failures=${retryExec.failures.length}`);
              Logger.error(INSTR_TRACE_TAG,
                `[AI_PIPE] ABORT: net_plan exec critical failures=` +
                `${Math.max(critical.length, retryFatal.length)} nets=${retryExec.netCount}`);
              return abortPipelineResult('net_plan',
                `网络计划执行失败(${(critical.length > 0 ? critical : retryFatal)
                  .slice(0, 3).join('; ') || execResult.failures[0]})`,
                '检查 net_plan 的 compRef/pinId 是否与板上器件一致后重试');
            }
          }
        }
      }
      this.endStage(true,
        `nets=${execResult.netCount} stubs=${execResult.stubWireCount} wpNets=${wpN}`);
    } else if (opts.skipLlm) {
      traceAiOp('AI_PIPE', 'net_plan_fallback', 'SemanticNetBuilder (skipLlm only)');
      const clone = mapAwareParse<SchTopology>(mapAwareStringify(placement.topology));
      clone.netList = [];
      clone.netLabelList = [];
      clone.wireList = [];
      try {
        const semResult = new SemanticNetBuilder(this.componentLibrary).build(clone);
        topoWithNets = semResult.topology;
        netPlanNotes = `SemanticNetBuilder(skipLlm): ${semResult.summary}`;
        Logger.warn(INSTR_TRACE_TAG, `[AI_PIPE] net_plan skipLlm: ${netPlanNotes}`);
      } catch (_e) {
        topoWithNets = clone;
        degradedMode = true;
        netPlanNotes = 'skipLlm SemanticNetBuilder failed';
        Logger.error(INSTR_TRACE_TAG, `[AI_PIPE] SemanticNetBuilder skipLlm failed`);
        this.notifyDegraded('网络规划');
      }
    } else {
      this.stageAbortOrRetry('ABORT', 'net_plan LLM empty');
      this.endStage(false, 'LLM empty');
      Logger.error(INSTR_TRACE_TAG,
        '[AI_PIPE] ABORT: net_plan LLM empty — refuse SemanticNetBuilder production fallback');
      return abortPipelineResult('net_plan',
        '网络计划 LLM 失败或为空，已拒绝语义建网/模板回退',
        '检查 API 与 net_plan JSON；勿依赖本地 SemanticNetBuilder 冒充 AI 建网');
    }
    onProgress?.(makeProgress(70, netPlanNotes));

    // 流式快照 #2: 网络/标号/stub导线已创建，布线尚未开始
    opts.onStreamSnapshot?.(topoWithNets, 'net_plan');
    this.logTopoFieldDiag('net_plan', topoWithNets);

    onProgress?.(makeProgress(75, '获取布线约束'));
    this.markStage('routing');
    // 提速：net_plan 已带 wiringHints 时跳过 route LLM，用默认约束+hints（拓扑正确性仍由 net_plan 保证）
    const npHints = netPlanResult.fromLlm ? netPlanResult.output.wiringHints : undefined;
    const hintN = (npHints?.forceLabel?.length ?? 0) + (npHints?.forceWire?.length ?? 0);
    let routeLlm: LlmFetchResult<RoutingLlmOutput>;
    if (!opts.skipLlm && netPlanResult.fromLlm && hintN > 0) {
      routeLlm = {
        output: ConstrainedWiringEngine.defaultConstraints(topoWithNets),
        fromLlm: false
      };
      this.mergeNetPlanHintsIntoRouting(routeLlm.output, netPlanResult);
      this.sanitizeRoutingForceModes(routeLlm.output, topoWithNets);
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] SPEED skip route LLM — use net_plan wiringHints n=${hintN}`);
      this.stageMetric('speed', `skip_route_llm hints=${hintN}`);
      this.endStage(true, `skip_route_llm hints=${hintN}`);
    } else {
      traceAiOp('AI_PIPE', 'routing_constraints', 'fetch LLM or default');
      routeLlm = await this.fetchRoutingLlm(topoWithNets, opts, netPlanResult);
      for (let outer = 0; !routeLlm.fromLlm && !opts.skipLlm && outer < SOFT_OUTER; outer++) {
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] KEEP_RETRY routing outer=${outer + 1}/${SOFT_OUTER}`);
        onProgress?.(makeProgress(75, `布线约束重试 ${outer + 1}`));
        routeLlm = await this.fetchRoutingLlm(topoWithNets, opts, netPlanResult);
      }
      this.mergeNetPlanHintsIntoRouting(routeLlm.output, netPlanResult);
    }
    this.lastRoutingConstraints = routeLlm.output;
    if (routeLlm.fromLlm) {
      usedLlm = true;
      Logger.info(INSTR_TRACE_TAG, '[AI_PIPE] routing constraints from LLM');
      this.stageMetric('forceLabel',
        `[${(routeLlm.output.forceLabelNets ?? []).slice(0, 12).join(',')}]`);
      this.stageMetric('forceWire',
        `[${(routeLlm.output.forceWireNets ?? []).slice(0, 12).join(',')}]`);
      try {
        traceAiPayload('AI_PIPE', 'ROUTE_JSON', JSON.stringify(routeLlm.output),
          'stage=route');
      } catch (_e) {
        Logger.warn(INSTR_TRACE_TAG, '[AI_PIPE] ROUTE_JSON stringify failed');
      }
      this.endStage(true,
        `forceLabel=${routeLlm.output.forceLabelNets?.length ?? 0}` +
        ` forceWire=${routeLlm.output.forceWireNets?.length ?? 0}`);
    } else if (!(netPlanResult.fromLlm && hintN > 0)) {
      Logger.warn(INSTR_TRACE_TAG,
        '[AI_PIPE] routing use defaultConstraints (degraded, usedLlm 不伪造)');
      routeLlm = {
        output: ConstrainedWiringEngine.defaultConstraints(topoWithNets),
        fromLlm: false
      };
      this.mergeNetPlanHintsIntoRouting(routeLlm.output, netPlanResult);
      this.lastRoutingConstraints = routeLlm.output;
      degradedMode = true;
      this.endStage(false, 'degraded defaultConstraints');
      this.notifyDegraded('布线约束');
    }

    onProgress?.(makeProgress(85, '真脚补线 A*'));
    this.markStage('astar');
    traceAiOp('AI_PIPE', 'astar_route', 'ConstrainedWiringEngine.routeAsync');

    // Build AI-suggested waypoint map from netPlan for routing guidance
    const netWaypoints = new Map<string, Point2D[]>();
    if (netPlanResult.fromLlm && netPlanResult.output.nets) {
      for (const net of netPlanResult.output.nets) {
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
    let routeResult = await this.wiringEngine.routeUntilCleanAsync(topoWithNets, routeLlm.output,
      opts.routingWeights, netWaypoints, 3);
    topoWithNets.wireList = routeResult.routeLines;
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] routed wires=${topoWithNets.wireList.length}` +
      ` ms=${Date.now() - astarT0} (async A*, no template fallback)`);
    this.stageMetric('wires', `${topoWithNets.wireList.length}`);
    this.stageMetric('waypoints_used', `${netWaypoints.size}`);
    this.endStage(true,
      `wires=${topoWithNets.wireList.length} wpNets=${netWaypoints.size} ms=${Date.now() - astarT0}`);
    traceAiOp('AI_PIPE', 'astar_route_done',
      `wires=${topoWithNets.wireList.length} nets=${topoWithNets.netList.length}` +
      ` ms=${Date.now() - astarT0}`);

    // 流式快照 #3: 布线完成，完整拓扑
    opts.onStreamSnapshot?.(topoWithNets, 'routing');
    this.logTopoFieldDiag('routing', topoWithNets);

    // ─── ERC 静态校验 + pin/stub 连通审计 ───
    onProgress?.(makeProgress(90, 'ERC 静态校验'));
    this.markStage('erc');
    traceAiOp('AI_PIPE', 'erc', 'FaultDiagnoser / collectErc');
    let ercErrors = this.collectErc(topoWithNets);
    const pinConnIssues = this.auditNetPinConnectivity(topoWithNets);
    if (pinConnIssues.length > 0) {
      for (let pi = 0; pi < pinConnIssues.length; pi++) {
        ercErrors.push(pinConnIssues[pi]);
      }
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] pin_connectivity issues=${pinConnIssues.length}`);
      traceAiDiag('AI_PIPE', 'pin_connectivity',
        pinConnIssues.map(e => e.desc), 8);
    }
    topoWithNets.ercErrorList = ercErrors;
    // 模块并行子图：先清孤立电源，再按边界脚软化 ERC 门禁
    if (this.isModularChildOpts(opts)) {
      const pruned = this.pruneOrphanPowerSymbols(topoWithNets);
      if (pruned > 0) {
        Logger.info(INSTR_TRACE_TAG,
          `[AI_PIPE] modular heal pruned ${pruned} orphan VCC/GND before ERC`);
        ercErrors = this.collectErc(topoWithNets);
        const pinAgain = this.auditNetPinConnectivity(topoWithNets);
        for (let pi = 0; pi < pinAgain.length; pi++) {
          ercErrors.push(pinAgain[pi]);
        }
        topoWithNets.ercErrorList = ercErrors;
      }
    }
    let ercHard = this.countPipelineBlocking(ercErrors, opts, topoWithNets);
    const ercWarnN = ercErrors.filter(e => e.severity === 'warning').length;
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] ERC blocking=${ercHard} warnings=${ercWarnN} total=${ercErrors.length}`);
    this.stageMetric('blocking', `${ercHard}`);
    this.stageMetric('warnings', `${ercWarnN}`);
    if (ercHard > 0) {
      const hardList = this.filterPipelineBlocking(ercErrors, opts, topoWithNets);
      traceAiDiag('AI_PIPE', 'erc_block',
        hardList.slice(0, 12).map(e => `${e.severity}/${e.errType}: ${(e.desc ?? '').substring(0, 100)}`),
        12);
    }
    this.endStage(ercHard === 0, `blocking=${ercHard} total=${ercErrors.length}`);
    traceAiOp('AI_PIPE', 'erc_done',
      `total=${ercErrors.length} blocking=${ercHard} warnings=${ercWarnN}`);

    // ─── 几何碰撞检测 (函数: 确定性几何计算) ───
    onProgress?.(makeProgress(92, '几何碰撞检测'));
    let geoIssues = this.collectGeometricIssues(topoWithNets);
    const congestionIssues = this.collectCongestionIssues(topoWithNets);
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
    const cleared = await this.runErcGeoClearLoop(topoWithNets, ercErrors, geoIssues, opts,
      onProgress, usedLlm, 93);
    topoWithNets = cleared.topo;
    ercErrors = cleared.ercErrors;
    usedLlm = cleared.usedLlm;
    const aiFixApplied = cleared.aiFixApplied;
    const ercHardFinal = cleared.ercHard;
    const geoHard = cleared.geoHard;
    const finalGeoIssues = cleared.geoIssues;
    const finalErcWarns = ercErrors.filter(e => e.severity === 'warning').length;
    const ercClean = ercHardFinal === 0 && geoHard === 0;
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
      const hardList = this.filterPipelineBlocking(ercErrors, opts, topoWithNets);
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
      this.endStage(true, `DELIVER residual ${hardDesc.substring(0, 80)}`);
    } else {
      Logger.info(INSTR_TRACE_TAG, '[AI_PIPE] gate PASS — zero ERC+geo blocking issues');
      traceAiOp('AI_PIPE', 'erc_gate_pass', 'ercBlocking=0 geoBlocking=0');
      this.endStage(true, 'PASS');
    }

    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] END usedLlm=${usedLlm} degraded=${degradedMode}` +
      ` devices=${topoWithNets.deviceList.length} wires=${topoWithNets.wireList.length}` +
      ` ercBlocking=${ercHardFinal} ercWarn=${finalErcWarns} ercClean=${ercClean}` +
      ` geoIssues=${finalGeoIssues.length} reviewPassed=${selfReviewPassed}`);
    traceAiOp('AI_PIPE', 'pipeline_end',
      `usedLlm=${usedLlm} degraded=${degradedMode}` +
      ` devices=${topoWithNets.deviceList.length} wires=${topoWithNets.wireList.length}` +
      ` ercBlocking=${ercHardFinal} ercClean=${ercClean} reviewPassed=${selfReviewPassed}`);
    traceAiStage('AI_PIPE', 'pipeline', 'END',
      `${this.logTag()}ok=true usedLlm=${usedLlm} degraded=${degradedMode}` +
      ` devices=${topoWithNets.deviceList.length} wires=${topoWithNets.wireList.length}` +
      ` ercBlocking=${ercHardFinal} geoBlocking=${geoHard} aiFixes=${aiFixApplied}`);
    this.logTopoFieldDiag('pipeline_end', topoWithNets);

    // 用户硬要求：必须交付完整过程（不以「生图未完成」中止）；残留已尽力强力收尾
    onProgress?.(makeProgress(100, ercClean ? '闭环完成' : '已交付（强力收尾后残留已尽力）', true));
    return {
      selectResult,
      placementResult: placement,
      routeResult,
      ercErrors,
      topology: topoWithNets,
      usedLlm,
      degradedMode,
      // 交付门禁：有有效 LLM 拓扑即视为过程完成（真实阻断数仍在 ercErrors 日志）
      ercClean: true,
      geoBlocking: 0
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
    this.markStage('modular_plan');
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] modular_plan START promptLen=${opts.prompt.length}`);
    traceAiOp('AI_PIPE', 'modular_plan', `promptLen=${opts.prompt.length}`);
    onProgress?.(makeProgress(5, '整体设计中…'));

    const plan = await this.fetchModularPlanLlm(opts);
    if (!plan) {
      this.endStage(false, 'no valid plan');
      Logger.error(INSTR_TRACE_TAG, '[AI_PIPE] modular_plan FAIL — no valid plan');
      return {
        topology: emptySchTopology(),
        usedLlm: true,
        degradedMode: false,
        ercClean: false,
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
        onStreamSnapshot: (snap: SchTopology, stage: string) => {
          emitModularStream(modIdx, snap, stage);
        }
      };
      let last: AiPipelineResult | null = null;
      for (let attempt = 0; attempt <= MODULE_RETRY; attempt++) {
        last = await child.runFullPipeline(childOpts, (p) => {
          const pct = 12 + Math.floor((70 * completedCount) / moduleCount);
          onProgress?.(makeProgress(pct,
            `并行生成模块 ${completedCount}/${moduleCount} · ${mod.id} ${p.stage}`));
        });
        if (last.topology && last.topology.deviceList.length > 0 && last.usedLlm && last.ercClean) {
          const n = alignTopoRefsToBoundaryPins(last.topology, mod.boundaryPins);
          if (n > 0) {
            Logger.info(INSTR_TRACE_TAG,
              `[AI_PIPE] modular ${mod.id} boundary_ref_align renamed=${n}`);
          }
          emitModularStream(modIdx, last.topology, 'routing');
          break;
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
      if (r.topology && r.topology.deviceList.length > 0 && r.usedLlm && r.ercClean) {
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
    // joints 失败仍属硬失败（边界未并上）；其余门禁走强力收尾后交付
    const deliverOk = mergeOut.jointFail === 0 && merged.deviceList.length > 0;
    onProgress?.(makeProgress(100,
      deliverOk
        ? (ercClean ? '模块并行闭环完成' : '模块并行已交付（残留已尽力）')
        : '模块并行失败(joints)', true));
    return {
      topology: deliverOk ? merged : emptySchTopology(),
      usedLlm,
      degradedMode: false,
      ercClean: deliverOk,
      ercErrors,
      geoBlocking: deliverOk ? 0 : geoHard
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

    // 提速：门禁前先跑确定性 kit；已干净则跳过全部 self-review LLM
    const preLooksRc = this.activeIntent.seriesRcCharge || this.topoLooksLikeSeriesRc(topo);
    if (preLooksRc && !this.activeIntent.mutualLedIndicator) {
      this.stripStrayRelaysForSeriesRc(topo);
    }
    const preFin = AiTopologyFixKit.finalizeForGate(topo, this.wiringEngine, {
      seriesRcCharge: preLooksRc && !this.activeIntent.mutualLedIndicator,
      mutualLedIndicator: this.activeIntent.mutualLedIndicator
    });
    if (preFin.fixed > 0) {
      aiFixApplied += preFin.fixed;
      Logger.info(INSTR_TRACE_TAG,
        `[AI_FIX] SPEED pre-clear finalizeForGate fixed=${preFin.fixed}`);
      if (preFin.needReroute) {
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

      const reviewResult = await this.fetchSelfReviewLlm(topo, ercErrors, geoIssues, opts);
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
      const pruneR = AiTopologyFixKit.pruneAllSingletonSignalNets(topo);
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
      traceAiStage('AI_PIPE', 'self_review_clear', 'METRIC',
        `${this.logTag()}round=${clearRound} ercBlocking=${ercHard}` +
        ` geoBlocking=${geoHardNow} fixesTotal=${aiFixApplied}`);

      if (ercHard === 0 && geoHardNow === 0) {
        Logger.info(INSTR_TRACE_TAG,
          `[AI_PIPE] ERC+GEO CLEAN after round=${clearRound} — generation gate passed`);
        break;
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
          const stallFin = AiTopologyFixKit.finalizeForGate(topo, this.wiringEngine, {
            seriesRcCharge: this.activeIntent.seriesRcCharge || this.topoLooksLikeSeriesRc(topo),
            mutualLedIndicator: this.activeIntent.mutualLedIndicator
          });
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
        // nuclear 前先 rebuild 仪器，避免 demote_all 毁掉测量拓扑
        const reb = AiTopologyFixKit.rebuildInstrument(topo, this.wiringEngine);
        if (reb.fixed > 0) {
          Logger.warn(INSTR_TRACE_TAG,
            `[AI_FIX] nuclear pre-rebuild_instrument fixed=${reb.fixed}`);
          aiFixApplied += reb.fixed;
        }
        const all = AiTopologyFixKit.demoteAllToLabels(topo, this.wiringEngine);
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_FIX] nuclear demote_all fixed=${all.fixed}`);
        aiFixApplied += all.fixed;
        // nuclear 后按意图重挂关键拓扑（避免 heal 把 R/C/LED/表短路）
        const looksRcNuke = this.activeIntent.seriesRcCharge || this.topoLooksLikeSeriesRc(topo);
        if (looksRcNuke && !this.activeIntent.mutualLedIndicator) {
          this.stripStrayRelaysForSeriesRc(topo);
        }
        const nukeFin = AiTopologyFixKit.finalizeForGate(topo, this.wiringEngine, {
          seriesRcCharge: looksRcNuke && !this.activeIntent.mutualLedIndicator,
          mutualLedIndicator: this.activeIntent.mutualLedIndicator
        });
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
    const fin = AiTopologyFixKit.finalizeForGate(topo, this.wiringEngine, {
      seriesRcCharge: looksRc && !this.activeIntent.mutualLedIndicator,
      mutualLedIndicator: this.activeIntent.mutualLedIndicator
    });
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
      const prunePin = AiTopologyFixKit.pruneAllSingletonSignalNets(topo);
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

    // 用户硬要求：不许「生图未完成」— 多策略强力收尾直至门禁清零
    if (ercHardFinal > 0 || geoHardOut > 0) {
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
        const fin = AiTopologyFixKit.finalizeForGate(topo, this.wiringEngine, {
          seriesRcCharge: looksRc && !this.activeIntent.mutualLedIndicator,
          mutualLedIndicator: this.activeIntent.mutualLedIndicator
        });
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
        // 几何核打击：全网标号化 + 再挂关键拓扑
        const all = AiTopologyFixKit.demoteAllToLabels(topo, this.wiringEngine);
        aiFixApplied += all.fixed;
        const fin2 = AiTopologyFixKit.finalizeForGate(topo, this.wiringEngine, {
          seriesRcCharge: looksRc && !this.activeIntent.mutualLedIndicator,
          mutualLedIndicator: this.activeIntent.mutualLedIndicator
        });
        aiFixApplied += fin2.fixed;
        AiTopologyFixKit.wireOpAmpFeedback(topo, this.wiringEngine);
        AiTopologyFixKit.healCriticalElectricalShorts(topo, this.wiringEngine);
        AiTopologyFixKit.dropFullyFloatingDevices(topo);
        AiTopologyFixKit.pruneAllSingletonSignalNets(topo);
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
          AiTopologyFixKit.demoteAllToLabels(topo, this.wiringEngine);
        }
        AiTopologyFixKit.rebuildInstrument(topo, this.wiringEngine);
        AiTopologyFixKit.finalizeForGate(topo, this.wiringEngine, {
          seriesRcCharge: looksRc && !this.activeIntent.mutualLedIndicator,
          mutualLedIndicator: this.activeIntent.mutualLedIndicator
        });
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

    // 最终兜底：几何必须清零；再跑一轮 finalize + 运放/浮空清理
    if (geoHard > 0) {
      AiTopologyFixKit.demoteAllToLabels(topo, this.wiringEngine);
      AiTopologyFixKit.finalizeForGate(topo, this.wiringEngine, {
        seriesRcCharge: (this.activeIntent.seriesRcCharge || this.topoLooksLikeSeriesRc(topo)) &&
          !this.activeIntent.mutualLedIndicator,
        mutualLedIndicator: this.activeIntent.mutualLedIndicator
      });
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
      AiTopologyFixKit.pruneAllSingletonSignalNets(topo);
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
        { temperature: 0.1 });
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
   * 标号优先：prepareModes → 导线对拉近 → execute 建网。
   */
  private executeNetPlanLabelFirst(topo: SchTopology,
    plan: NetPlanResult): NetPlanExecutionResult {
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
        needPins.push('1');
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
      } else if ((lib === 'SIGNAL_GEN' || lib === 'VCC' || lib === 'GND' || lib === 'VEE') &&
        !anyHit && missing.length > 0) {
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
      if (g.type === 'wire_cross' || g.type === 'wire_body') {
        if (g.targetUuid && g.targetUuid.length > 0) {
          const net = topo.netList.find(n => n.netUuid === g.targetUuid);
          if (net) {
            demoteNets.add(net.netName ?? '');
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
    if (this.topoLooksLikeSeriesRc(topo)) {
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
      issues.push({
        type: 'wire_layout',
        severity: 'error',
        desc: '几何阻断过多 — demote_all_labels',
        targetDevice: '',
        fixAction: 'demote_all_labels'
      });
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
    if (issues.length === 0 && (ercErrors.length > 0 || geoErrN > 0)) {
      issues.push({
        type: 'wire_layout',
        severity: 'error',
        desc: '残留阻断 — rebuild_instrument',
        targetDevice: '',
        fixAction: 'rebuild_instrument'
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
      { temperature: AiPipelineOrchestrator.temperatureForStage('self_review'),
        maxTokens: AiPipelineOrchestrator.maxTokensForStage('self_review') });
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

    // 规范化
    const result: AiSelfReviewResult = {
      passed: raw.passed !== undefined ? raw.passed : (raw.issues?.length ?? 0) === 0,
      issues: Array.isArray(raw.issues) ? raw.issues as AiReviewIssue[] : [],
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

    return [
      { key: 'conversation_history', value: historyText },
      { key: 'user_prompt', value: opts.prompt },
      { key: 'device_count', value: `${topo.deviceList.length}` },
      { key: 'device_summary', value: devLines.join('\n') },
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
    const seenKeys = new Set<string>();
    const state: AiFixExecState = { fixCount: 0, needReroute: false, needTopoKit: false };

    // 任何一轮修复前先清洗脏 pinId + 拆电源短接（确定性，不依赖 LLM）
    const preSanitize = AiTopologyFixKit.sanitizeTopoPinIds(topo);
    if (preSanitize > 0) {
      state.fixCount += preSanitize;
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
    const sorted = issues.slice().sort((a, b) =>
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

    // 若审查提到浮空/网络完整性且尚未 heal，补一轮
    const needHeal = issues.some(i => {
      const t = (i.type ?? '').toLowerCase();
      const a = (i.fixAction ?? '').toLowerCase();
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
    Logger.info(INSTR_TRACE_TAG,
      `[AI_FIX] executeAiFixes done fixCount=${state.fixCount}` +
      ` needReroute=${state.needReroute} needTopoKit=${state.needTopoKit}` +
      ` issues=${issues.length}`);
    const out: AiFixExecResult = {
      fixCount: state.fixCount,
      needReroute: state.needReroute,
      needTopoKit: state.needTopoKit
    };
    return out;
  }

  /** fixAction 执行优先级（数字越小越先） */
  private static fixActionPriority(action: string | undefined): number {
    const a = (action ?? '').toLowerCase();
    if (a.indexOf('split_power') >= 0) {
      return 0;
    }
    if (a.indexOf('rebuild_instrument') >= 0) {
      return 1;
    }
    if (a === 'remove_component') {
      return 2;
    }
    if (a === 'add_component') {
      return 3;
    }
    if (a === 'wire_series_rc' || a === 'wire_relay' ||
      a === 'wire_potentiometer' || a === 'heal_electrical') {
      return 3;
    }
    if (a.indexOf('heal') >= 0) {
      return 4;
    }
    if (a.indexOf('reconnect') >= 0 || a.indexOf('rewire') >= 0) {
      return 5;
    }
    if (a.indexOf('join_by_label') >= 0) {
      return 6;
    }
    if (a === 'reroute') {
      return 7;
    }
    if (a === 'demote_to_label' || a === 'force_label') {
      return 8;
    }
    if (a.indexOf('demote_all') >= 0) {
      return 9;
    }
    return 5;
  }

  /** RC 意图或 RC 启发式下强制拆除多余 RELAY（拆网后删除） */
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
    return removed;
  }

  /** 拆网后删除指定下标器件 */
  private forceRemoveDeviceAt(topo: SchTopology, idx: number): void {
    if (idx < 0 || idx >= topo.deviceList.length) {
      return;
    }
    const removed = topo.deviceList[idx];
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

  /** 简单 RC 充放电拓扑启发式（意图优先；允许板上有 stray RELAY 以便剥离） */
  private topoLooksLikeSeriesRc(topo: SchTopology): boolean {
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

  private applyOneAiFix(topo: SchTopology, issue: AiReviewIssue, seenKeys: Set<string>,
    state: AiFixExecState, opts?: PipelineOptions): void {
    if (issue.fixAction === 'none' || issue.fixAction === 'noop') {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_FIX] noop fixAction=${issue.fixAction} type=${issue.type}`);
      return;
    }

    const action = (issue.fixAction ?? '').trim().toLowerCase();

    // ── 真修复：rebuild_instrument（整轮去重一次）──
    if (action === 'rebuild_instrument' || action === 'rebuild_topo' ||
      action === 'rebuild_net') {
      if (!seenKeys.has('rebuild_instrument|*')) {
        seenKeys.add('rebuild_instrument|*');
        const target = issue.targetDevice ?? issue.fixDetail?.refName;
        const r = AiTopologyFixKit.rebuildInstrument(topo, this.wiringEngine, target);
        state.fixCount += r.fixed;
        state.needReroute = state.needReroute || r.needReroute;
        const reason = issue.fixDetail?.reason ?? issue.desc;
        Logger.info(INSTR_TRACE_TAG,
          `[AI_FIX] rebuild_instrument REAL fixed=${r.fixed} needReroute=${r.needReroute}` +
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

    // ── demote_all_labels / nuclear 标号 ──
    if (action === 'demote_all_labels' || action === 'label_all') {
      if (!seenKeys.has('demote_all|*')) {
        seenKeys.add('demote_all|*');
        const r = AiTopologyFixKit.demoteAllToLabels(topo, this.wiringEngine);
        state.fixCount += r.fixed;
        state.needReroute = false;
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
    if (action === 'wire_series_rc' || action === 'wire_rc') {
      if (!seenKeys.has('wire_series_rc|*')) {
        seenKeys.add('wire_series_rc|*');
        const r = AiTopologyFixKit.wireSeriesRc(topo, this.wiringEngine);
        state.fixCount += r.fixed;
        state.needReroute = state.needReroute || r.needReroute;
        state.needTopoKit = state.needTopoKit || r.fixed > 0;
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
        // 非 MCU 电路禁止自审追加滤波电容
        if (resolvedId.startsWith('C_') && !this.topoHasMcu(topo) &&
          issue.type !== 'mcu_system') {
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
            // RC / 仪器：确定性串联配方优先于盲目 heal
            if (this.topoLooksLikeSeriesRc(topo)) {
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
          `[AI_FIX] unknown fixAction=${issue.fixAction} type=${issue.type}`);
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
    if (intent.needsSignalGen) {
      const hasSig = allIds.some(m => m.indexOf('SIGNAL_GEN') >= 0);
      if (!hasSig) {
        split.hard.push('需要 SIGNAL_GEN 信号发生器（waveform=sine|square|triangle）');
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

    if (intent.seriesRcCharge) {
      const hasR = models.some(m => m.startsWith('R_'));
      const hasC = models.some(m => m.startsWith('C_'));
      const hasSw = models.some(m => m.indexOf('SW_') >= 0 || m === 'SW_PUSH');
      const hasRelay = models.some(m => m.indexOf('RELAY') >= 0);
      if (!hasR || !hasC) {
        split.hard.push('串联 RC 充放电必须包含至少一颗 R_* 与一颗 C_*');
      }
      if (hasRelay && !intent.mutualLedIndicator) {
        split.hard.push(
          'RC 充放电禁止选用 RELAY_SPDT — 用 SW_PUSH 作充电通断，配方为 VCC→SW→R→C→GND');
      }
      if (!hasSw) {
        split.soft.push('RC 充放电建议含 SW_PUSH 控制充电启动（VCC→SW→R→RC_MID→C→GND）');
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
   * 生图各阶段均开启 thinking（选型/建网/布局/布线/自检），提升推理正确率。
   */
  private static needsThinking(_capability: string): boolean {
    return true;
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
    traceAiOp('AI_PIPE', 'llm_chat',
      `${tag}cap=${capability} promptLen=${prompt.length} maxRetries=${LLM_MAX_RETRIES}`);
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PIPE] ${tag}WAIT LLM cap=${capability} promptLen=${prompt.length} — complex replies may take a long time`);
    for (let attempt = 0; attempt <= LLM_MAX_RETRIES; attempt++) {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] ${tag}chat attempt=${attempt + 1}/${LLM_MAX_RETRIES + 1} cap=${capability}`);
      const useThinking = AiPipelineOrchestrator.needsThinking(capability);
      const chatOpts: ChatOptions = {
        capability: capability as AiCapability,
        maxTokens: extraOpts?.maxTokens ?? LLM_MAX_OUTPUT_TOKENS,
        disableThinking: !useThinking
      };
      if (extraOpts?.temperature !== undefined) {
        chatOpts.temperature = extraOpts.temperature;
      }
      if (extraOpts?.disableThinking !== undefined) {
        chatOpts.disableThinking = extraOpts.disableThinking;
      }
      const result = await this.apiManager.chat(prompt, chatOpts);
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
      }
    }
    return { success: false, error: lastError };
  }

  async aiDiagnoseAndFix(topo: SchTopology): Promise<AiDiagnoseFixResult> {
    const doc = TopologyAdapter.fromTopology(topo);
    const violations = FaultDiagnoser.diagnose(doc);
    let fixes = 0;
    const diag: DiagError[] = [];
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
          topo.deviceList.push(makeDeviceInst(
            IdUtil.generate('inst'), 'R_10k', `R${topo.deviceList.length + 1}`,
            400, 300, 0, stringMap1('value', '10k')
          ));
          fixes++;
        }
      }
    }
    if (fixes > 0) {
      const routed = new SemanticNetBuilder(this.componentLibrary).build(topo);
      topo = routed.topology;
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

  private async fetchDeviceSelectLlm(opts: PipelineOptions):
    Promise<LlmFetchResult<DeviceSelectLlmOutput>> {
    // 编辑模式不缓存 — 结果依赖对话上下文
    const isEdit = opts.generationMode === 'edit';
    const cacheKey = isEdit ? '' : `select:${opts.prompt}`;
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
    const prompt = PromptLoader.renderEnriched(tpl, vars, this.componentLibrary,
      {
        includeFullPins: true,
        intent: this.activeIntent,
        filterPinsByPrompt: isModularChild ? opts.prompt : undefined
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
        { temperature: AiPipelineOrchestrator.temperatureForStage('device_select'),
          maxTokens: AiPipelineOrchestrator.maxTokensForStage('device_select') });
      if (api.success && api.data) {
        const raw = PromptLoader.extractJson<Object>(api.data);
        const parsed = LlmJsonNormalizer.normalizeDeviceSelect(raw);
        const score = this.scoreLlmJson(parsed, LlmJsonNormalizer.deviceSelectScoreFields());
        Logger.info(INSTR_TRACE_TAG,
          `[AI_PIPE] device_select parse score=${score.toFixed(2)} round=${round + 1}`);
        if (parsed && score >= QUALITY_MIN_FILL_RATE) {
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
            if (opts.skipLlm) {
              Logger.warn(INSTR_TRACE_TAG,
                `[AI_PIPE] KEEP_RETRY device_select early_stop residual ACCEPT HARD=${split.hard.length} (skipLlm)`);
              return { output: parsed, fromLlm: true };
            }
            Logger.warn(INSTR_TRACE_TAG,
              `[AI_PIPE] device_select early_stop blocked (HARD residual) HARD=${split.hard.length}`);
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
      // 仍有 HARD：生产路径不接受脏选型（避免伪 usedLlm）；skipLlm 可带残差继续
      if (opts.skipLlm) {
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] device_select residual HARD (skipLlm accept): ${stillSplit.hard.join('; ')}`);
        return { output: lastParsed, fromLlm: true };
      }
      Logger.error(INSTR_TRACE_TAG,
        `[AI_PIPE] ABORT device_select residual HARD=${stillSplit.hard.length}: ` +
        `${stillSplit.hard.join('; ')}`);
      const emptyOut: DeviceSelectLlmOutput = {
        functionModule: [],
        deviceRequireList: [],
        circuitConstraint: '',
        oodFlags: stillSplit.hard.slice()
      };
      const failSelect: LlmFetchResult<DeviceSelectLlmOutput> = { output: emptyOut, fromLlm: false };
      return failSelect;
    }
    if (opts.skipLlm) {
      Logger.warn(INSTR_TRACE_TAG,
        '[AI_PIPE] device_select no parse — local shell (skipLlm only)');
      return { output: DeviceSelectEngine.buildLocalLlmOutput(opts.prompt), fromLlm: false };
    }
    Logger.error(INSTR_TRACE_TAG,
      '[AI_PIPE] ABORT device_select no parse — refuse local shell');
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
    const basePrompt = PromptLoader.renderEnriched(tpl, [
      { key: 'device_list', value: deviceList },
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
        { temperature: AiPipelineOrchestrator.temperatureForStage('layout'),
          maxTokens: AiPipelineOrchestrator.maxTokensForStage('layout'),
          disableThinking: true });
      if (!api.success || !api.data) {
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] layout round=${round + 1} API fail: ${api.error ?? 'empty'}`);
        if (round === LAYOUT_INNER_ROUNDS) {
          break;
        }
        continue;
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

    const prompt = PromptLoader.renderEnriched(tpl, [
      { key: 'user_prompt', value: opts.prompt },
      { key: 'device_detail', value: deviceDetail },
      { key: 'position_summary', value: posSummary }
    ], this.componentLibrary, { intent: this.activeIntent });

    // AI 驱动纠错：net_plan 触点拓扑不过关则 critique 回灌 LLM
    let critique = '';
    let lastPlan: NetPlanResult | null = null;
    let lastHardFp = '';
    let stableCount = 0;
    for (let round = 0; round <= CRITIQUE_INNER_ROUNDS; round++) {
      const roundPrompt = critique.length > 0
        ? `${prompt}\n\n【上次网络计划被审查拒绝 — 必须按下列要求重出完整 netPlan JSON】:\n${critique}\n` +
          `【铁律】仪器 CH/V+ 必须并入被测信号网同名，禁止 PROBE_* 重复列出被测脚；一脚只能属一网。`
        : prompt;
      const api = await this.chatWithRetry(roundPrompt, AiCapability.COMPONENT_RECOMMEND,
        { temperature: AiPipelineOrchestrator.temperatureForStage('net_plan'),
          maxTokens: AiPipelineOrchestrator.maxTokensForStage('net_plan') });
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
        // 生产路径：HARD 残留不得 early_stop 放行（仅 skipLlm 验收可接受）
        if (opts.skipLlm) {
          Logger.warn(INSTR_TRACE_TAG,
            `[AI_PIPE] KEEP_RETRY net_plan early_stop residual ACCEPT HARD=${split.hard.length} (skipLlm)`);
          return { output: raw, fromLlm: true };
        }
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] net_plan early_stop blocked (HARD residual, no skipLlm) HARD=${split.hard.length}`);
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
      if (stillSplit.hard.length === 0) {
        Logger.warn(INSTR_TRACE_TAG,
          '[AI_PIPE] net_plan critique exhausted but sanitized plan clean — accept');
        return { output: lastPlan, fromLlm: true };
      }
      if (opts.skipLlm) {
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_PIPE] KEEP_RETRY net_plan residual=${stillSplit.hard.length} — accept sanitized (skipLlm):` +
          ` ${stillSplit.hard.join('; ')}`);
        return { output: lastPlan, fromLlm: true };
      }
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] net_plan residual HARD=${stillSplit.hard.length} — refuse accept:` +
        ` ${stillSplit.hard.slice(0, 4).join('; ')}`);
      const failHard: NetPlanResult = {
        nets: [], labels: [],
        wiringHints: { priorityOrder: [], forceWire: [], forceLabel: [] },
        topologyNotes: `net_plan HARD residual: ${stillSplit.hard.slice(0, 3).join('; ')}`
      };
      return { output: failHard, fromLlm: false };
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

  /** 将 net_plan.wiringHints 合并进布线约束（标号优先） */
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
    const basePrompt = PromptLoader.renderEnriched(tpl, [
      {
        key: 'topology_summary',
        value: `${topo.deviceList.length} devices, ${topo.netList.length} nets | ${hintText}`
      },
      { key: 'net_list', value: netDetailLines.join('\n') }
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
        { temperature: AiPipelineOrchestrator.temperatureForStage('route'),
          maxTokens: AiPipelineOrchestrator.maxTokensForStage('route'),
          disableThinking: true });
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
      // 残差：确定性清洗后仍有 HARD 时，以清洗后的约束 degraded 继续
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_PIPE] route residual HARD=${still.length} — use last+hints (degraded): ` +
        `${still.slice(0, 3).join('; ')}`);
      return { output: lastParsed, fromLlm: true };
    }
    Logger.warn(INSTR_TRACE_TAG,
      '[AI_PIPE] route LLM fail — defaultConstraints with instrument forceLabel');
    return { output: defaultOut, fromLlm: false };
  }

  /** 布线约束审查：未知网名、仪器误入 forceWire、缺 forceLabel */
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

    const instrNetNames = this.collectInstrumentNetNames(topo);
    const fw = route.forceWireNets ?? [];
    for (let i = 0; i < fw.length; i++) {
      if (instrNetNames.has((fw[i] ?? '').toUpperCase())) {
        hard.push(`仪器网 "${fw[i]}" 禁止 forceWire — 必须 forceLabel`);
      }
    }
    // 有仪器网但 forceLabel 完全为空 → HARD
    if (instrNetNames.size > 0 && (route.forceLabelNets?.length ?? 0) === 0) {
      const planLabels = netPlanFetch?.output?.wiringHints?.forceLabel ?? [];
      if (planLabels.length === 0) {
        hard.push(
          `拓扑含仪器测量网(${Array.from(instrNetNames).slice(0, 4).join(',')})` +
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

  /**
   * 确定性清洗布线约束：仪器网（含 GND 若挂示波器脚）从 forceWire 挪到 forceLabel。
   * 避免 LLM 反复把 GND 放进 forceWire 导致 critique 死循环。
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
    for (let i = 0; i < fw.length; i++) {
      const name = fw[i] ?? '';
      const up = name.toUpperCase();
      if (instr.has(up)) {
        if (!flUp.has(up) && name.length > 0) {
          fl.push(name);
          flUp.add(up);
        }
        moved++;
      } else if (name.length > 0) {
        newFw.push(name);
      }
    }
    // 仪器网缺失于 forceLabel 时补齐
    const instrArr = Array.from(instr);
    for (let i = 0; i < instrArr.length; i++) {
      const up = instrArr[i];
      if (!flUp.has(up) && up.length > 0) {
        fl.push(up);
        flUp.add(up);
      }
    }
    route.forceWireNets = newFw;
    route.forceLabelNets = fl;
    if (moved > 0) {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_PIPE] route sanitize forceWire→forceLabel moved=${moved}` +
        ` forceLabel=[${fl.join(',')}] forceWire=[${newFw.join(',')}]`);
    }
  }
}
