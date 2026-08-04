/**
 * 模块5：AI智能电路引擎完整实现
 */
import { IAiEngine } from './api/IAiEngine';
import { AutoWiringEngine } from './algorithms/AutoWiringEngine';
import { ConstrainedWiringEngine } from './algorithms/ConstrainedWiringEngine';
import { FaultDiagnoser } from './algorithms/FaultDiagnoser';
import { AiPipelineOrchestrator, PipelineOptions } from './algorithms/AiPipelineOrchestrator';
import { AgentPipelineCoordinator } from './algorithms/agents/AgentPipelineCoordinator';
import { BlackboardSnapshot } from './algorithms/agents/CircuitBlackboard';
import { DeviceSelectEngine } from './algorithms/DeviceSelectEngine';
import { PlacementOptimizer } from './algorithms/PlacementOptimizer';
import { PromptLoader } from './prompts/PromptLoader';
import { BomPricingDatabase } from './internal/BomPricingDatabase';
import { AiDiagnosisReporter } from './internal/AiDiagnosisReporter';
import { AiPipelineValidator } from './validation/AiPipelineValidator';
import { AiResultCache } from './AiResultCache';
import { TeachingService } from './TeachingService';
import { IComponentLibrary } from 'component_library';
import {
  AiCapability, AiRequest, AiResponse, SchematicDocument,
  SimulationResult, ErcViolation, Result, EventBus, ModuleEvent,
  ErcSeverity, ErcRuleType, LogicState,
  SchTopology, AiTaskType, AiTaskResult, DiagError, BomOptResult,
  WaveData, ProgressCallback, ApiResult, RouteResult, RouteLine, ErrCode,
  ResultHelper, TopologyAdapter, DeviceSelectLlmOutput,
  RoutingLlmOutput, AiPipelineResult, RoutingWeightPrefs, DeviceSelectResult,
  makeProgress, makeRouteLine, emptySchTopology, DynamicErcEngine,
  Logger, INSTR_TRACE_TAG, AiErcGateUtil, traceAiDiag, traceAiOp,
  PcbDocument, PcbAiRouteResult, PcbDrcViolation
} from 'common';
import { IAiApiManager } from 'ai_api_manager';
import { AiTaskExtra, DiagLevel, DiagTargetType } from './internal/AiEngineTypes';
import {
  arrayMax, arrayMin, arraySum, buildBomCounts, buildBomReplacements,
  concatStringArrays, copyParamsFromRecord, countSignalKeys, filterSchematicComponents,
  getAllAiCapabilities, getTaskCapability, iterateSignalEntries, paramsMapToRecord,
  replacementsToMap
} from './internal/AiEngineHelpers';
import { PcbRouteCoordinator } from './algorithms/pcb_agents/PcbRouteCoordinator';

export class AiEngineImpl implements IAiEngine {
  private apiManager: IAiApiManager;
  private componentLibrary: IComponentLibrary | null = null;
  private enabledCapabilities: Set<AiCapability> = new Set(getAllAiCapabilities());
  private wiringEngine: AutoWiringEngine = new AutoWiringEngine();
  private constrainedWiring: ConstrainedWiringEngine = new ConstrainedWiringEngine();
  private pipeline: AiPipelineOrchestrator | null = null;
  private agentCoordinator: AgentPipelineCoordinator | null = null;
  private cancelled: boolean = false;
  private taskBindings: Map<AiTaskType, string> = new Map();
  private resultCache: AiResultCache = new AiResultCache();
  readonly teachingService: TeachingService = new TeachingService();

  constructor(apiManager: IAiApiManager, componentLibrary?: IComponentLibrary) {
    this.apiManager = apiManager;
    if (componentLibrary) {
      this.componentLibrary = componentLibrary;
      this.constrainedWiring.setComponentLibrary(componentLibrary);
      this.pipeline = new AiPipelineOrchestrator(apiManager, componentLibrary);
      this.agentCoordinator = new AgentPipelineCoordinator(apiManager, componentLibrary);
    }
  }

  setComponentLibrary(library: IComponentLibrary): void {
    this.componentLibrary = library;
    this.constrainedWiring.setComponentLibrary(library);
    this.pipeline = new AiPipelineOrchestrator(this.apiManager, library);
    this.agentCoordinator = new AgentPipelineCoordinator(this.apiManager, library);
  }

  // ---- v2 API ----

  async runAiTask(taskType: AiTaskType, topo: SchTopology, extra?: AiTaskExtra,
    onProgress?: ProgressCallback): Promise<AiTaskResult> {
    this.cancelled = false;
    this.pipeline?.clearCancel();
    this.agentCoordinator?.clearCancel();
    this.apiManager.clearChatCancel();
    const quota = this.apiManager.checkGlobalAiQuota();
    if (!quota.success) {
      return {
        taskType, success: false, errCode: quota.errCode ?? ErrCode.ERR_QUOTA_EXCEEDED,
        errMsg: quota.error ?? 'AI 配额不足',
        progress: makeProgress(0, 'quota_exceeded')
      };
    }
    onProgress?.(makeProgress(0, `Starting task ${taskType}`));
    Logger.info(INSTR_TRACE_TAG, `[AI_TASK] START type=${taskType}`);
    let result: AiTaskResult = {
      taskType, success: false, errCode: ErrCode.OK, errMsg: '',
      progress: makeProgress(0, 'init')
    };

    try {
      switch (taskType) {
        case AiTaskType.TASK_AUTO_ROUTE_GLOBAL: {
          const route = await this.aiAutoRouteGlobal(topo, onProgress);
          result.success = route.success;
          result.errCode = route.errCode;
          if (route.data) {
            topo.wireList = route.data.routeLines;
          }
          result.topology = topo;
          break;
        }
        case AiTaskType.TASK_AUTO_ROUTE_SELECT: {
          const uuids = extra?.devUuids ?? [];
          const route = await this.aiAutoRouteSelect(topo, uuids, onProgress);
          result.success = route.success;
          result.errCode = route.errCode;
          if (route.data) topo.wireList = route.data.routeLines;
          result.topology = topo;
          break;
        }
        case AiTaskType.TASK_ROUTE_OPTIMIZE: {
          const route = await this.aiOptimizeExistRoute(topo);
          result.success = route.success;
          result.errCode = route.errCode;
          if (route.data) topo.wireList = route.data.routeLines;
          result.topology = topo;
          break;
        }
        case AiTaskType.TASK_CIRCUIT_DIAG_STATIC: {
          const diag = await this.aiStaticDiagnose(topo);
          result.success = diag.success;
          result.errCode = diag.errCode;
          result.diagErrors = diag.data;
          break;
        }
        case AiTaskType.TASK_CIRCUIT_DIAG_DYNAMIC: {
          const waves = extra?.waves ?? [];
          const diag = await this.aiDynamicDiagnose(topo, waves);
          result.success = diag.success;
          result.errCode = diag.errCode;
          result.diagErrors = diag.data;
          break;
        }
        case AiTaskType.TASK_GEN_SCH_FULL: {
          const prompt = extra?.prompt ?? '';
          const gen = await this.aiGenFullSchematic(prompt, extra);
          result.success = gen.success;
          result.errCode = gen.errCode;
          result.topology = gen.data;
          break;
        }
        case AiTaskType.TASK_GEN_SUB_CIRCUIT: {
          const prompt = extra?.prompt ?? '';
          const gen = await this.aiGenSubCircuit(prompt, topo);
          result.success = gen.success;
          result.errCode = gen.errCode;
          result.topology = gen.data;
          break;
        }
        case AiTaskType.TASK_WAVE_ANALYZE: {
          const waves = extra?.waves ?? [];
          const analysis = await this.aiAnalyzeWave(waves);
          result.success = analysis.success;
          result.errCode = analysis.errCode;
          result.analysisText = analysis.data;
          break;
        }
        case AiTaskType.TASK_COMPONENT_REC: {
          const desc = extra?.description ?? '';
          const recs = await this.recommendComponents(desc);
          result.success = recs.success;
          result.analysisText = recs.data?.join('\n');
          break;
        }
        case AiTaskType.TASK_COMPONENT_REPLACE: {
          const libId = extra?.libDevId ?? '';
          const req = extra?.requirement ?? '';
          const reps = await this.aiGetReplaceDevice(libId, req);
          result.success = reps.success;
          result.analysisText = reps.data?.join('\n');
          break;
        }
        case AiTaskType.TASK_BOM_OPTIMIZE: {
          const bom = await this.aiOptimizeBom(topo);
          result.success = bom.success;
          result.errCode = bom.errCode;
          break;
        }
        case AiTaskType.TASK_DEVICE_SELECT: {
          const prompt = extra?.prompt ?? '';
          const sel = await this.aiSelectDevices(prompt, topo);
          result.success = sel.success;
          result.errCode = sel.errCode;
          result.analysisText = JSON.stringify(sel.data);
          break;
        }
        case AiTaskType.TASK_LAYOUT_PLACE: {
          const place = await this.aiPlaceDevices(topo, extra);
          result.success = place.success;
          result.errCode = place.errCode;
          result.topology = place.data;
          break;
        }
        case AiTaskType.TASK_FULL_PIPELINE: {
          const prompt = extra?.prompt ?? '';
          Logger.info(INSTR_TRACE_TAG,
            `[AI_TASK] FULL_PIPELINE promptLen=${prompt.length} skipLlm=${!!extra?.skipLlm}`);
          const pipe = await this.runFullPipeline(prompt, topo, extra, onProgress);
          result.success = pipe.success;
          result.errCode = pipe.errCode;
          result.topology = pipe.data?.topology;
          if (pipe.data) {
            const nDev = pipe.data.selectResult?.devices.length ?? pipe.data.topology?.deviceList.length ?? 0;
            const nWire = pipe.data.topology?.wireList.length ?? 0;
            const nNet = pipe.data.topology?.netList.length ?? 0;
            const matchBits: string[] = [];
            const devices = pipe.data.selectResult?.devices;
            if (devices !== undefined) {
              for (let i = 0; i < Math.min(devices.length, 12); i++) {
                matchBits.push(`${devices[i].libDevId}:${devices[i].matchLevel}`);
              }
            }
            result.analysisText =
              `LLM:${pipe.data.usedLlm} degraded:${pipe.data.degradedMode}` +
              ` ercClean:${pipe.data.ercClean}` +
              ` residual:${!!pipe.data.deliveredWithResidual}` +
              ` devices:${nDev} nets:${nNet} wires:${nWire}` +
              (matchBits.length > 0 ? ` match=[${matchBits.join(',')}]` : '') +
              (pipe.data.selectResult?.ragTemplateId ?
                ` rag:${pipe.data.selectResult.ragTemplateId}` : '');
            result.usedLlm = pipe.data.usedLlm;
            result.ercClean = pipe.data.ercClean;
            result.deliveredWithResidual = !!pipe.data.deliveredWithResidual || !pipe.data.ercClean;
            result.agentAbortStage = pipe.data.agentAbortStage;
            result.agentAbortReason = pipe.data.agentAbortReason;
            if (pipe.data.needsClarification) {
              result.success = false;
              result.needsClarification = true;
              result.clarificationQuestions = pipe.data.clarificationQuestions;
              result.topology = undefined;
              result.deliveredWithResidual = false;
              result.errMsg = '需要补充需求澄清后再生成';
              Logger.info(INSTR_TRACE_TAG,
                `[AI_TASK] FULL_PIPELINE needsClarification n=${pipe.data.clarificationQuestions?.length ?? 0}`);
              break;
            }
            if (pipe.data.agentAbortStage && pipe.data.agentAbortStage.length > 0) {
              result.success = false;
              result.errCode = ErrCode.ERR_PARAM_INVALID;
              result.topology = undefined;
              result.deliveredWithResidual = false;
              result.errMsg = pipe.data.agentAbortReason ||
                `阶段失败: ${pipe.data.agentAbortStage}`;
              Logger.error(INSTR_TRACE_TAG,
                `[AI_TASK] FULL_PIPELINE ABORT stage=${pipe.data.agentAbortStage}`);
              break;
            }
            const cancelHit = this.cancelled ||
              (pipe.data.ercErrors ?? []).some(e => e.errType === 'cancelled');
            if (cancelHit) {
              result.success = false;
              result.errCode = ErrCode.ERR_ASYNC_CANCEL;
              result.errMsg = 'Task cancelled';
              result.topology = undefined;
              result.usedLlm = false;
              result.deliveredWithResidual = false;
              Logger.info(INSTR_TRACE_TAG, '[AI_TASK] FULL_PIPELINE CANCELLED');
            } else {
              // 阶段硬失败（选型/建网等）优先于 usedLlm 误判，避免把真实 abort 说成「API 不可用」
              const errsEarly = pipe.data.ercErrors ?? [];
              let stageHardEarly: string = '';
              let stageSuggestEarly: string = '';
              let stageTypeEarly: string = '';
              for (let ei = 0; ei < errsEarly.length; ei++) {
                const et = errsEarly[ei].errType;
                if (et === 'modular_plan' || et === 'modular_parallel' ||
                  et === 'device_select' || et === 'net_plan' || et === 'library_match' ||
                  et === 'modular_joint' || et === 'layout' || et === 'routing' ||
                  et === 'war_route' || et === 'qa_residual') {
                  stageTypeEarly = et;
                  stageHardEarly = errsEarly[ei].desc ?? '';
                  stageSuggestEarly = errsEarly[ei].suggest ?? '';
                  break;
                }
              }
              if (stageHardEarly.length > 0 && !pipe.data.ercClean) {
                result.success = false;
                result.errCode = ErrCode.ERR_PARAM_INVALID;
                result.topology = undefined;
                result.deliveredWithResidual = false;
                result.errMsg = stageHardEarly +
                  (stageSuggestEarly.length > 0 ? `。${stageSuggestEarly}` : '');
                Logger.error(INSTR_TRACE_TAG,
                  `[AI_TASK] FULL_PIPELINE FAIL stage=${stageTypeEarly} | ${result.analysisText}`);
              } else if (!extra?.skipLlm && !pipe.data.usedLlm) {
                // 整图生成必须走 LLM；禁止模板静默落图（结构化 usedLlm，禁止仅靠 analysisText）
                result.success = false;
                result.errCode = ErrCode.ERR_API_TIMEOUT;
                result.errMsg = 'AI API 不可用或未正确配置，已拒绝模板回退';
                result.topology = undefined;
                result.usedLlm = false;
                result.deliveredWithResidual = false;
                Logger.error(INSTR_TRACE_TAG,
                  `[AI_TASK] FULL_PIPELINE REJECT non-LLM | ${result.analysisText}`);
              } else if (!pipe.data.ercClean) {
                // 生图完整门禁：仅计划/空图/选型失败才拒交付；其余经强力收尾后必须交付
                const hardN = AiErcGateUtil.countBlocking(pipe.data.ercErrors ?? []);
                const geoN = pipe.data.geoBlocking ?? 0;
                const hint = AiErcGateUtil.summarizeBlocking(pipe.data.ercErrors ?? [], 4);
                const errs = pipe.data.ercErrors ?? [];
                let modularHard = false;
                let modularSuggest = '';
                for (let ei = 0; ei < errs.length; ei++) {
                  const et = errs[ei].errType;
                  if (et === 'modular_plan' || et === 'modular_parallel' ||
                    et === 'device_select' || et === 'net_plan' || et === 'library_match' ||
                    et === 'modular_joint' || et === 'layout' || et === 'routing' ||
                    et === 'war_route' || et === 'qa_residual') {
                    modularHard = true;
                    if (errs[ei].suggest.length > 0) {
                      modularSuggest = errs[ei].suggest;
                    }
                    if (errs[ei].desc.length > 0) {
                      result.errMsg = errs[ei].desc +
                        (modularSuggest.length > 0 ? `。${modularSuggest}` : '');
                    }
                    break;
                  }
                }
                const emptyTopo = (pipe.data.topology?.deviceList.length ?? 0) === 0;
                const hardFail = extra?.qualityHardFail !== false && !extra?.skipLlm;
                // 分级决策：只有空拓扑或选型/建网阶段硬失败才拒绝；ERC/几何残留允许带警告交付
                const hasUsableTopo = !emptyTopo && !modularHard;
                if (modularHard || emptyTopo) {
                  result.success = false;
                  result.errCode = ErrCode.ERR_PARAM_INVALID;
                  result.topology = undefined;
                  result.deliveredWithResidual = false;
                  result.ercClean = false;
                  if (!result.errMsg || result.errMsg.length === 0) {
                    result.errMsg = emptyTopo
                      ? '模块并行失败：无有效拓扑'
                      : (result.errMsg ?? '生图失败：选型/建网未成功');
                  }
                  Logger.error(INSTR_TRACE_TAG,
                    `[AI_TASK] FULL_PIPELINE HARD FAIL modularHard=${modularHard} empty=${emptyTopo}` +
                    ` | ${result.analysisText}`);
                } else if (hardFail && !emptyTopo) {
                  // 硬度模式但有可用拓扑：带警告标记交付（上层 AppService 做软接受决策）
                  result.success = true;
                  result.topology = pipe.data.topology;
                  result.deliveredWithResidual = true;
                  result.ercClean = pipe.data.ercClean;
                  if (!result.errMsg || result.errMsg.length === 0) {
                    result.errMsg = `终检未完全通过（ERC=${hardN}/几何=${geoN}），已尽力交付`;
                  }
                  Logger.warn(INSTR_TRACE_TAG,
                    `[AI_TASK] FULL_PIPELINE SOFT DELIVER hardFail with usable topo` +
                    ` ercHard=${hardN} geoHard=${geoN}` +
                    (hint.length > 0 ? ` (${hint})` : '') +
                    ` | ${result.analysisText}`);
                } else {
                  // skipLlm / 显式非硬失败：允许 residual 标记交付
                  result.success = true;
                  result.topology = pipe.data.topology;
                  result.deliveredWithResidual = true;
                  Logger.warn(INSTR_TRACE_TAG,
                    `[AI_TASK] FULL_PIPELINE DELIVER residualErc=${hardN} residualGeo=${geoN}` +
                    (hint.length > 0 ? ` (${hint})` : '') +
                    ` | ${result.analysisText}`);
                }
              } else {
                result.deliveredWithResidual = false;
                Logger.info(INSTR_TRACE_TAG,
                  `[AI_TASK] FULL_PIPELINE OK | ${result.analysisText}`);
              }
            } // end cancel/stage/usedLlm/erc chain
          } else {
            result.analysisText = '';
            Logger.error(INSTR_TRACE_TAG, '[AI_TASK] FULL_PIPELINE empty pipe.data');
          }
          break;
        }
        default:
          result.errCode = ErrCode.ERR_PARAM_INVALID;
          result.errMsg = 'Unknown task type';
      }
      if (this.cancelled) {
        result.success = false;
        result.errCode = ErrCode.ERR_ASYNC_CANCEL;
        result.errMsg = 'Task cancelled';
      }
      onProgress?.(makeProgress(100, 'Task complete', true));
      result.progress = makeProgress(100, 'done', true, result.errCode, result.errMsg);
    } catch (e) {
      result.success = false;
      result.errCode = ErrCode.ERR_PARAM_INVALID;
      const msg = e instanceof Error ? (e.message || `${e}`) : `${e}`;
      const stack = e instanceof Error ? (e.stack ?? '') : '';
      const stage = this.pipeline?.getDiagStage() ?? 'unknown';
      result.errMsg = `流水线异常[${stage}]: ${msg}`;
      Logger.error(INSTR_TRACE_TAG,
        `[AI_TASK] EXCEPTION type=${taskType} stage=${stage} msg=${msg}`);
      const diagLines: string[] = [
        `taskType=${taskType}`,
        `stage=${stage}`,
        `msg=${msg}`
      ];
      if (stack.length > 0) {
        const parts = stack.split('\n');
        for (let si = 0; si < Math.min(parts.length, 12); si++) {
          const line = parts[si].trim();
          if (line.length > 0) {
            diagLines.push(line.substring(0, 200));
          }
        }
      }
      traceAiDiag('AI_TASK', 'exception', diagLines, 16);
      traceAiOp('AI_TASK', 'exception', `stage=${stage} ${msg}`);
    }
    return result;
  }

  cancelAiTask(): ApiResult<void> {
    this.cancelled = true;
    this.pipeline?.requestCancel();
    this.agentCoordinator?.requestCancel();
    this.apiManager.cancelPendingChat();
    Logger.info(INSTR_TRACE_TAG, '[AI_TASK] CANCEL requested — abort HTTP + pipeline');
    traceAiOp('AI_TASK', 'cancel', 'http+pipeline');
    return ResultHelper.ok();
  }

  bindTaskAiConfig(taskType: AiTaskType, apiId: string): ApiResult<void> {
    this.taskBindings.set(taskType, apiId);
    const cap = getTaskCapability(taskType);
    if (cap) this.apiManager.bindCapability(cap, apiId);
    return ResultHelper.ok();
  }

  clearAiCache(): void {
    this.resultCache.clear();
  }

  async aiAutoRouteGlobal(topo: SchTopology, onProgress?: ProgressCallback): Promise<ApiResult<RouteResult>> {
    const cached = this.resultCache.getCachedRoute(topo);
    if (cached) {
      onProgress?.(makeProgress(100, '使用缓存布线结果', true));
      return ResultHelper.ok(cached);
    }
    onProgress?.(makeProgress(15, '序列化拓扑'));
    const routeLlm = await this.fetchRoutingConstraints(topo);
    onProgress?.(makeProgress(40, 'A* 约束布线'));
    let routeResult = await this.constrainedWiring.routeUntilCleanAsync(topo, routeLlm, undefined, undefined, 3);
    this.resultCache.cacheRoute(topo, routeResult);
    onProgress?.(makeProgress(100, 'Routing complete', true));
    return ResultHelper.ok(routeResult);
  }

  async aiAutoRouteSelect(topo: SchTopology, devUuids: string[],
    onProgress?: ProgressCallback): Promise<ApiResult<RouteResult>> {
    onProgress?.(makeProgress(20, 'Auto routing selection'));
    const doc = TopologyAdapter.fromTopology(topo);
    const filtered = filterSchematicComponents(doc, devUuids);
    const wired = this.wiringEngine.autoWire(filtered);
    onProgress?.(makeProgress(100, 'Selection routing complete', true));
    return ResultHelper.ok(this.toRouteResult(wired));
  }

  async aiOptimizeExistRoute(topo: SchTopology): Promise<ApiResult<RouteResult>> {
    const routeLlm = await this.fetchRoutingConstraints(topo);
    let routeResult = await this.constrainedWiring.routeUntilCleanAsync(topo, routeLlm, undefined, undefined, 3);
    return ResultHelper.ok(routeResult);
  }

  async aiPcbAutoRoute(doc: PcbDocument, runDrc: (d: PcbDocument) => PcbDrcViolation[],
    onProgress?: ProgressCallback): Promise<ApiResult<PcbAiRouteResult>> {
    this.cancelled = false;
    this.apiManager.clearChatCancel();
    if (!this.isEnabled(AiCapability.PCB_AUTO_ROUTE)) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'PCB AI 布线未启用');
    }
    const quota = this.apiManager.checkGlobalAiQuota();
    if (!quota.success) {
      return ResultHelper.fail(quota.errCode ?? ErrCode.ERR_QUOTA_EXCEEDED, quota.error ?? 'AI 配额不足');
    }
    onProgress?.(makeProgress(5, 'PCB AI 布线开始'));
    Logger.info(INSTR_TRACE_TAG, '[AI_TASK] START TASK_PCB_AUTO_ROUTE');
    const coord = new PcbRouteCoordinator();
    const result = await coord.run(doc, this.apiManager, runDrc, () => this.cancelled, onProgress);
    onProgress?.(makeProgress(100, result.success ? 'PCB AI 布线完成' : 'PCB AI 布线失败', true));
    if (!result.success) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID,
        `${result.abortStage}: ${result.abortReason}`);
    }
    if (!result.usedLlm) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'PCB AI 拒绝非 LLM 交付');
    }
    // 硬 residual 双保险：unused_copper / signal_fail / SHORT|CLEARANCE 拒交付
    if (result.deliveredWithResidual) {
      const kind = result.residualKind ?? 'drc';
      const note = (result.messages[0] ?? '').toUpperCase();
      const hard = kind === 'unused_copper' || kind === 'signal_fail' || kind === 'placement_only' ||
        note.indexOf('SHORT') >= 0 || note.indexOf('CLEARANCE') >= 0 ||
        (kind !== 'unrouted' && kind !== 'none');
      if (hard) {
        Logger.error(INSTR_TRACE_TAG,
          `[AI_TASK] TASK_PCB_AUTO_ROUTE refuse dirty residual kind=${kind}`);
        return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID,
          `refuse dirty residual[${kind}]: ${result.messages[0] ?? ''}`);
      }
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_TASK] TASK_PCB_AUTO_ROUTE soft residual | ${result.messages[0] ?? ''}`);
    }
    return ResultHelper.ok(result);
  }

  async aiStaticDiagnose(topo: SchTopology): Promise<ApiResult<DiagError[]>> {
    const cached = this.resultCache.getCachedDiag(topo);
    if (cached) return ResultHelper.ok(cached);
    const doc = TopologyAdapter.fromTopology(topo);
    const violations = FaultDiagnoser.diagnose(doc);
    const errors: DiagError[] = [];
    for (let i = 0; i < violations.length; i++) {
      const v = violations[i];
      const err: DiagError = {
        level: this.toDiagLevel(v.severity),
        targetType: this.toDiagTargetType(v.componentId, v.netId, v.pinId),
        targetUuid: v.componentId ?? v.netId ?? v.pinId ?? '',
        errorDesc: v.message,
        repairSuggest: v.fixSuggestion ?? '',
        devReference: v.componentId ?? ''
      };
      errors.push(err);
    }
    this.resultCache.cacheDiag(topo, errors);
    return ResultHelper.ok(errors);
  }

  async aiDynamicDiagnose(topo: SchTopology, waves: WaveData[]): Promise<ApiResult<DiagError[]>> {
    const staticResult = await this.aiStaticDiagnose(topo);
    const errors = staticResult.data ?? [];
    const dynViolations = DynamicErcEngine.analyze(waves, new Map());
    const report = AiDiagnosisReporter.analyze(waves, dynViolations);
    for (let i = 0; i < report.suggestions.length; i++) {
      const sug = report.suggestions[i];
      const level: 'error' | 'warning' | 'critical' =
        report.severity === 'error' ? 'error' :
        (report.severity === 'warning' ? 'warning' : 'critical');
      errors.push({
        level: level, targetType: 'net', targetUuid: topo.schUuid,
        errorDesc: sug, repairSuggest: sug, devReference: 'AI'
      });
    }
    return ResultHelper.ok(errors);
  }

  async aiGenFullSchematic(prompt: string, extra?: AiTaskExtra): Promise<ApiResult<SchTopology>> {
    const emptyTopo = emptySchTopology();
    emptyTopo.schName = 'AI Generated';
    emptyTopo.bgColor = '#FFFFFF';
    Logger.info(INSTR_TRACE_TAG,
      `[AI_TASK] aiGenFullSchematic promptLen=${prompt.length} mcu=${extra?.mcuFamily ?? 'auto'}` +
      ` mode=${extra?.generationMode ?? 'create'}`);
    const merged: AiTaskExtra = {
      prompt: prompt,
      mcuFamily: extra?.mcuFamily,
      scene: extra?.scene,
      skipLlm: extra?.skipLlm,
      routingWeights: extra?.routingWeights,
      onStreamSnapshot: extra?.onStreamSnapshot,
      conversationHistory: extra?.conversationHistory,
      generationMode: extra?.generationMode,
      lockedUuids: extra?.lockedUuids
    };
    const pipe = await this.runFullPipeline(prompt, emptyTopo, merged);
    if (!pipe.success || !pipe.data?.topology) {
      Logger.error(INSTR_TRACE_TAG,
        `[AI_TASK] aiGenFullSchematic FAIL (no template fallback): ${pipe.error}`);
      return ResultHelper.fail(ErrCode.ERR_API_TIMEOUT,
        pipe.error ?? 'AI 整图生成失败：API 不可用且已禁用模板回退');
    }
    if (!pipe.data.usedLlm) {
      Logger.error(INSTR_TRACE_TAG, '[AI_TASK] aiGenFullSchematic REJECT non-LLM topology');
      return ResultHelper.fail(ErrCode.ERR_API_TIMEOUT,
        'AI API 未返回有效结果，已拒绝模板/本地回退');
    }
    if (!pipe.data.ercClean) {
      const hardN = AiErcGateUtil.countBlocking(pipe.data.ercErrors ?? []);
      const geoN = pipe.data.geoBlocking ?? 0;
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_TASK] aiGenFullSchematic DELIVER residualErc=${hardN} residualGeo=${geoN}`);
      // 用户硬要求：不许因门禁残留拒交付
    }
    return ResultHelper.ok(pipe.data.topology);
  }

  async runFullPipeline(prompt: string, topo: SchTopology, extra?: AiTaskExtra,
    onProgress?: ProgressCallback): Promise<ApiResult<AiPipelineResult>> {
    if (!this.pipeline) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Component library not configured');
    }
    const pipeOpts: PipelineOptions = {
      prompt: prompt,
      scene: extra?.scene ?? 'text_gen',
      partialTopo: topo.deviceList.length > 0 ? topo : undefined,
      lockedDeviceUuids: extra?.lockedUuids ?? (
        extra?.generationMode === 'edit' && topo.deviceList.length > 0
          ? topo.deviceList.map(d => d.instUuid)
          : []
      ),
      mcuFamily: extra?.mcuFamily,
      skipLlm: extra?.skipLlm,
      routingWeights: extra?.routingWeights,
      onStreamSnapshot: extra?.onStreamSnapshot,
      conversationHistory: extra?.conversationHistory,
      generationMode: extra?.generationMode,
      generateStrategy: extra?.generateStrategy,
      qualityHardFail: extra?.qualityHardFail ?? !extra?.skipLlm
    };
    // Phase1+：oneshot/edit/append → Coordinator；modular → Coordinator.runModular
    if (extra?.generateStrategy === 'modular') {
      if (this.agentCoordinator && !extra?.skipLlm) {
        let resumeSnapMod: BlackboardSnapshot | undefined = undefined;
        if (extra?.resumeSnapshotJson && extra.resumeSnapshotJson.length > 0) {
          try {
            resumeSnapMod = JSON.parse(extra.resumeSnapshotJson) as BlackboardSnapshot;
          } catch (_e) {
            Logger.warn(INSTR_TRACE_TAG, '[AI_TASK] modular resumeSnapshotJson parse fail');
          }
        }
        const result = await this.agentCoordinator.runModular({
          prompt: pipeOpts.prompt,
          scene: pipeOpts.scene,
          partialTopo: pipeOpts.partialTopo,
          lockedDeviceUuids: pipeOpts.lockedDeviceUuids,
          mcuFamily: pipeOpts.mcuFamily,
          skipLlm: pipeOpts.skipLlm,
          routingWeights: pipeOpts.routingWeights,
          onStreamSnapshot: pipeOpts.onStreamSnapshot,
          conversationHistory: pipeOpts.conversationHistory,
          generationMode: pipeOpts.generationMode,
          generateStrategy: 'modular',
          qualityHardFail: extra?.qualityHardFail !== false,
          enableReasoning: extra?.enableReasoning,
          clarificationAnswers: extra?.clarificationAnswers,
          resumeSnapshot: resumeSnapMod
        }, onProgress);
        return ResultHelper.ok(result);
      }
      const result = await this.pipeline.runModularParallelPipeline(pipeOpts, onProgress);
      return ResultHelper.ok(result);
    }
    if (this.agentCoordinator && !extra?.skipLlm) {
      let resumeSnap: BlackboardSnapshot | undefined = undefined;
      if (extra?.resumeSnapshotJson && extra.resumeSnapshotJson.length > 0) {
        try {
          resumeSnap = JSON.parse(extra.resumeSnapshotJson) as BlackboardSnapshot;
        } catch (_e) {
          Logger.warn(INSTR_TRACE_TAG, '[AI_TASK] resumeSnapshotJson parse fail');
        }
      }
      const result = await this.agentCoordinator.runOneshot({
        prompt: pipeOpts.prompt,
        scene: pipeOpts.scene,
        partialTopo: pipeOpts.partialTopo,
        lockedDeviceUuids: pipeOpts.lockedDeviceUuids,
        mcuFamily: pipeOpts.mcuFamily,
        skipLlm: pipeOpts.skipLlm,
        routingWeights: pipeOpts.routingWeights,
        onStreamSnapshot: pipeOpts.onStreamSnapshot,
        conversationHistory: pipeOpts.conversationHistory,
        generationMode: pipeOpts.generationMode,
        generateStrategy: pipeOpts.generateStrategy,
        qualityHardFail: pipeOpts.qualityHardFail,
        enableReasoning: extra?.enableReasoning,
        clarificationAnswers: extra?.clarificationAnswers,
        resumeSnapshot: resumeSnap
      }, onProgress);
      return ResultHelper.ok(result);
    }
    const result = await this.pipeline.runFullPipeline(pipeOpts, onProgress);
    return ResultHelper.ok(result);
  }

  /** 自检：经 Coordinator WAR + QA（硬失败可选） */
  async runSelfCheckPipeline(topo: SchTopology, hardFail: boolean = true,
    onProgress?: ProgressCallback): Promise<ApiResult<AiPipelineResult>> {
    if (!this.agentCoordinator) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Agent coordinator not ready');
    }
    const result = await this.agentCoordinator.runSelfCheck(topo, hardFail, onProgress);
    return ResultHelper.ok(result);
  }

  /** 最近一次 Agent 黑板快照（澄清后续跑） */
  getLastAgentSnapshotJson(): string {
    if (!this.agentCoordinator) {
      return '';
    }
    const snap = this.agentCoordinator.getLastSnapshot();
    if (!snap) {
      return '';
    }
    try {
      return JSON.stringify(snap);
    } catch (_e) {
      return '';
    }
  }

  async aiSelectDevices(prompt: string, partialTopo?: SchTopology): Promise<ApiResult<DeviceSelectResult>> {
    if (!this.componentLibrary) return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'No library');
    const engine = new DeviceSelectEngine(this.componentLibrary);
    const tpl = PromptLoader.load('device_select');
    const llmPrompt = PromptLoader.renderEnriched(tpl, [
      { key: 'user_prompt', value: prompt },
      { key: 'scene', value: 'partial_assist' },
      { key: 'partial_topo', value: partialTopo ? JSON.stringify(partialTopo.deviceList) : '' },
      { key: 'conversation_history', value: '' },
      { key: 'generation_mode', value: '' }
    ], this.componentLibrary, { includeFullPins: true });
    const api = await this.apiManager.chat(llmPrompt, {
      capability: AiCapability.COMPONENT_RECOMMEND,
      temperature: 0.08,
      disableThinking: false
    });
    if (!api.success || !api.data) {
      Logger.error(INSTR_TRACE_TAG,
        '[AI_TASK] aiSelectDevices FAIL: LLM unavailable — refuse local/template fallback');
      return ResultHelper.fail(ErrCode.ERR_API_TIMEOUT,
        '器件选型 LLM 失败，已拒绝本地/模板回退');
    }
    const llmOut = PromptLoader.extractJson<DeviceSelectLlmOutput>(api.data);
    if (!llmOut) {
      Logger.error(INSTR_TRACE_TAG,
        '[AI_TASK] aiSelectDevices FAIL: LLM JSON invalid — refuse local fallback');
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID,
        '器件选型 LLM JSON 无效，已拒绝本地回退');
    }
    return ResultHelper.ok(engine.matchFromLlmOutput(llmOut, prompt));
  }

  async aiPlaceDevices(topo: SchTopology, extra?: AiTaskExtra): Promise<ApiResult<SchTopology>> {
    if (!this.componentLibrary) return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'No library');
    const prompt = extra?.prompt ?? '';
    const select = await this.aiSelectDevices(prompt, topo);
    if (!select.success || !select.data || select.data.devices.length === 0) {
      return ResultHelper.fail(ErrCode.ERR_DEVICE_NOT_EXIST);
    }
    const layoutLlm = PlacementOptimizer.defaultConstraints(select.data.devices);
    const placement = await new PlacementOptimizer().optimizeAsync(
      select.data.devices, layoutLlm,
      extra?.lockedUuids ?? [], topo
    );
    return ResultHelper.ok(placement.topology);
  }

  private async fetchRoutingConstraints(topo: SchTopology): Promise<RoutingLlmOutput> {
    const tpl = PromptLoader.load('route');
    const prompt = PromptLoader.renderEnriched(tpl, [
      { key: 'topology_summary', value: `${topo.deviceList.length} devs` },
      { key: 'net_list', value: topo.netList.map(n => n.netName).join(',') }
    ], this.componentLibrary!);
    const api = await this.apiManager.chat(prompt, {
      capability: AiCapability.AUTO_WIRING,
      temperature: 0.05,
      disableThinking: false
    });
    if (api.success && api.data) {
      const parsed = PromptLoader.extractJson<RoutingLlmOutput>(api.data);
      if (parsed?.netPriority) return parsed;
    }
    return ConstrainedWiringEngine.defaultConstraints(topo);
  }

  async aiGenSubCircuit(_prompt: string, _parentTopo: SchTopology): Promise<ApiResult<SchTopology>> {
    Logger.error(INSTR_TRACE_TAG,
      '[AI_TASK] aiGenSubCircuit ABORT: legacy template path disabled — use TASK_FULL_PIPELINE');
    return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID,
      '遗留子电路模板路径已禁用；请使用整图流水线 TASK_FULL_PIPELINE');
  }

  async aiAnalyzeWave(waves: WaveData[]): Promise<ApiResult<string>> {
    const lines: string[] = [];
    for (let i = 0; i < waves.length; i++) {
      const wave = waves[i];
      if (wave.voltageAxis.length < 2) continue;
      const min = arrayMin(wave.voltageAxis);
      const max = arrayMax(wave.voltageAxis);
      const avg = arraySum(wave.voltageAxis) / wave.voltageAxis.length;
      lines.push(`${wave.probeName}: min=${min.toFixed(3)}V, max=${max.toFixed(3)}V, avg=${avg.toFixed(3)}V`);
    }
    const local = lines.length > 0 ? lines.join('\n') : 'No wave data';
    const simResult: SimulationResult = {
      time: [],
      signals: new Map<string, number[]>(),
      digitalStates: new Map<string, LogicState[]>()
    };
    for (let i = 0; i < waves.length; i++) {
      const w = waves[i];
      simResult.time = w.timeAxis;
      simResult.signals.set(w.probeName, w.voltageAxis);
    }
    const aiResult = await this.analyzeWaveform(simResult);
    return ResultHelper.ok(aiResult.data ?? local);
  }

  async aiRecommendParam(topo: SchTopology, devInstUuid: string): Promise<ApiResult<Record<string, string>>> {
    const dev = topo.deviceList.find(d => d.instUuid === devInstUuid);
    if (!dev) return ResultHelper.fail(ErrCode.ERR_DEVICE_NOT_EXIST);
    const params = copyParamsFromRecord(dev.params);
    if (dev.libDevId.startsWith('R_')) params.set('value', dev.params.get('value') ?? '10k');
    if (dev.libDevId.startsWith('C_')) params.set('value', dev.params.get('value') ?? '100nF');
    return ResultHelper.ok(paramsMapToRecord(params));
  }

  async aiGetReplaceDevice(libDevId: string, requirement: string): Promise<ApiResult<string[]>> {
    const recs = await this.recommendComponents(`${libDevId} replacement: ${requirement}`);
    if (!recs.success) return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, recs.error);
    return ResultHelper.ok(recs.data ?? []);
  }

  async aiOptimizeBom(topo: SchTopology): Promise<ApiResult<BomOptResult>> {
    const libIds: string[] = [];
    for (let i = 0; i < topo.deviceList.length; i++) {
      libIds.push(topo.deviceList[i].libDevId);
    }
    const bom = buildBomCounts(libIds);
    const replacementEntries = buildBomReplacements(bom);
    const cost = BomPricingDatabase.estimateBomCost(libIds);
    const suggestions: string[] = [];
    for (let i = 0; i < replacementEntries.length; i++) {
      const entry = replacementEntries[i];
      const alt = BomPricingDatabase.getDomesticReplacement(entry.original);
      if (alt) suggestions.push(`${entry.original} → 国产替代 ${alt}`);
      else suggestions.push(`Consider domestic replacement for ${entry.original}`);
    }
    const bomResult: BomOptResult = {
      originalCost: cost.original,
      optimizedCost: cost.optimized,
      replacements: replacementsToMap(replacementEntries),
      suggestions: suggestions
    };
    return ResultHelper.ok(bomResult);
  }

  // ---- v1 兼容 ----

  async autoWire(schematic: SchematicDocument): Promise<Result<SchematicDocument>> {
    if (!this.isEnabled(AiCapability.AUTO_WIRING)) {
      return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: 'Auto wiring is disabled' };
    }
    const wired = this.wiringEngine.autoWire(schematic);
    const aiResult = await this.request({
      capability: AiCapability.AUTO_WIRING,
      prompt: `Optimize wiring for MCU circuit with ${wired.components.length} components.`,
      schematic: wired
    });
    if (aiResult.success && aiResult.content) {
      wired.metadata.description += `\nAI: ${aiResult.content.substring(0, 200)}`;
    }
    return { success: true, errCode: ErrCode.OK, data: wired };
  }

  async diagnoseFaults(schematic: SchematicDocument): Promise<Result<ErcViolation[]>> {
    const staticViolations = FaultDiagnoser.diagnose(schematic);
    const aiResult = await this.request({
      capability: AiCapability.FAULT_DIAGNOSIS,
      prompt: `Diagnose circuit: ${schematic.components.length} components`,
      schematic
    });
    if (aiResult.success && aiResult.content) {
      staticViolations.push({
        id: `ai_diag_${Date.now()}`,
        severity: ErcSeverity.INFO,
        ruleType: ErcRuleType.PARAM_MISMATCH,
        message: `AI诊断: ${aiResult.content.substring(0, 300)}`,
        fixSuggestion: aiResult.content
      });
    }
    return { success: true, errCode: ErrCode.OK, data: staticViolations };
  }

  async recommendComponents(description: string): Promise<Result<string[]>> {
    const localRecs = this.localRecommend(description);
    const aiResult = await this.request({
      capability: AiCapability.COMPONENT_RECOMMEND,
      prompt: `Recommend electronic components for: ${description}`
    });
    if (aiResult.success && aiResult.content) {
      const lines = aiResult.content.split('\n').filter(l => l.trim().length > 0);
      return { success: true, errCode: ErrCode.OK, data: concatStringArrays(localRecs, lines) };
    }
    return { success: true, errCode: ErrCode.OK, data: localRecs };
  }

  async generateCircuit(_prompt: string, _mcuFamily?: string): Promise<Result<SchematicDocument>> {
    Logger.error(INSTR_TRACE_TAG,
      '[AI_TASK] generateCircuit ABORT: CircuitTemplates disabled — use TASK_FULL_PIPELINE');
    return {
      success: false,
      errCode: ErrCode.ERR_PARAM_INVALID,
      error: '遗留模板生图已禁用；请使用整图流水线 TASK_FULL_PIPELINE'
    };
  }

  async analyzeWaveform(result: SimulationResult): Promise<Result<string>> {
    const localAnalysis = this.localWaveformAnalysis(result);
    const aiResult = await this.request({
      capability: AiCapability.WAVEFORM_ANALYSIS,
      prompt: `Analyze simulation: ${result.time.length} points`
    });
    if (aiResult.success) {
      return { success: true, errCode: ErrCode.OK, data: `${localAnalysis}\n\nAI分析:\n${aiResult.content}` };
    }
    return { success: true, errCode: ErrCode.OK, data: localAnalysis };
  }

  async request(req: AiRequest): Promise<AiResponse> {
    const startTime = Date.now();
    const apiResult = await this.apiManager.chat(req.prompt, {
      capability: req.capability,
      context: req.context
    });
    const response: AiResponse = {
      success: apiResult.success,
      content: apiResult.data ?? '',
      provider: apiResult.success ? 'ai_api_manager' : '',
      tokensUsed: 0,
      latencyMs: Date.now() - startTime,
      error: apiResult.error
    };
    EventBus.getInstance().publish({
      event: ModuleEvent.AI_REQUEST_COMPLETED,
      source: 'ai_engine',
      timestamp: Date.now(),
      data: response
    });
    return response;
  }

  setEnabled(capability: AiCapability, enabled: boolean): void {
    if (enabled) this.enabledCapabilities.add(capability);
    else this.enabledCapabilities.delete(capability);
  }

  isEnabled(capability: AiCapability): boolean {
    return this.enabledCapabilities.has(capability);
  }

  private toRouteResult(doc: SchematicDocument): RouteResult {
    const routeLines: RouteLine[] = [];
    for (let i = 0; i < doc.wires.length; i++) {
      const w = doc.wires[i];
      routeLines.push(makeRouteLine(w.netId, w.points, false));
    }
    let totalLength = 0;
    for (let i = 0; i < doc.wires.length; i++) {
      totalLength += doc.wires[i].points.length * 10;
    }
    const result: RouteResult = {
      routeLines: routeLines,
      crossCount: 0,
      totalLineLength: totalLength,
      isolateAnalogDigital: true,
      xtalShortPath: true,
      diffLineEqualLength: false
    };
    return result;
  }

  private toDiagLevel(severity: ErcSeverity): DiagLevel {
    if (severity === ErcSeverity.ERROR) {
      return 'error';
    }
    if (severity === ErcSeverity.WARNING) {
      return 'warning';
    }
    return 'critical';
  }

  private toDiagTargetType(componentId?: string, netId?: string, pinId?: string): DiagTargetType {
    if (componentId) {
      return 'device';
    }
    if (netId) {
      return 'net';
    }
    return 'pin';
  }

  private localRecommend(description: string): string[] {
    const lower = description.toLowerCase();
    const recs: string[] = [];
    if (lower.includes('stm32') || lower.includes('最小系统')) {
      recs.push('STM32F103C8', 'XTAL_8M', 'C_100nF', 'C_10uF', 'R_10k');
    }
    if (lower.includes('51') || lower.includes('stc')) {
      recs.push('AT89C51', 'XTAL_11M', 'C_100nF', 'R_10k');
    }
    if (lower.includes('led')) recs.push('LED_RED', 'R_330');
    if (lower.includes('lcd')) recs.push('LCD1602', 'R_10k', 'C_100nF');
    return recs;
  }

  private localWaveformAnalysis(result: SimulationResult): string {
    const lines: string[] = [];
    iterateSignalEntries(result.signals, (name: string, data: number[]) => {
      if (data.length < 2) return;
      const min = arrayMin(data);
      const max = arrayMax(data);
      const avg = arraySum(data) / data.length;
      lines.push(`${name}: min=${min.toFixed(3)}V, max=${max.toFixed(3)}V, avg=${avg.toFixed(3)}V`);
      if (max - min < 0.01) lines.push(`  ⚠ ${name} 信号幅度过小`);
      if (max > 5.5) lines.push(`  ⚠ ${name} 电压超标`);
    });
    return lines.length > 0 ? lines.join('\n') : '无波形数据可分析';
  }

  async runValidationSuite(): Promise<string> {
    if (!this.pipeline || !this.componentLibrary) {
      return '验证跳过：器件库未初始化';
    }
    Logger.info(INSTR_TRACE_TAG, '[AI_VAL] runValidationSuite START');
    const validator = new AiPipelineValidator(this.componentLibrary, this.pipeline);
    const led = await validator.validateMinSystemLed();
    const ood = validator.validateHallucinationChip();
    const noFallback = await validator.validateApiFailureFallback();
    const modularMerge = validator.validateModularMerge();
    const usageManual = validator.validateUsageManualCoverage();
    const lines: string[] = [];
    lines.push(`[LED最小系统] ${led.passed ? 'PASS' : 'FAIL'}: ${led.checks.join('; ')}`);
    if (led.failures.length > 0) lines.push(`  失败: ${led.failures.join('; ')}`);
    lines.push(`[幻觉拦截] ${ood.success ? 'PASS' : 'FAIL'}`);
    lines.push(`[无模板回退] ${noFallback.passed ? 'PASS' : 'FAIL'}: ${noFallback.checks.join('; ')}`);
    if (noFallback.failures.length > 0) lines.push(`  失败: ${noFallback.failures.join('; ')}`);
    lines.push(`[模块并行合并] ${modularMerge.passed ? 'PASS' : 'FAIL'}: ${modularMerge.checks.join('; ')}`);
    if (modularMerge.failures.length > 0) {
      lines.push(`  失败: ${modularMerge.failures.join('; ')}`);
    }
    lines.push(`[器件用法手册] ${usageManual.passed ? 'PASS' : 'FAIL'}: ${usageManual.checks.join('; ')}`);
    if (usageManual.failures.length > 0) {
      lines.push(`  失败: ${usageManual.failures.join('; ')}`);
    }
    Logger.info(INSTR_TRACE_TAG, `[AI_VAL] runValidationSuite END\n${lines.join('\n')}`);
    return lines.join('\n');
  }
}
