/**
 * 模块5：AI智能电路引擎 API（v2 完备版）
 */
import {
  AiCapability, AiRequest, AiResponse, SchematicDocument,
  SimulationResult, ErcViolation, Result,
  SchTopology, AiTaskType, AiTaskResult, DiagError, BomOptResult,
  WaveData, ProgressCallback, ApiResult, RouteResult,
  DeviceSelectResult, AiPipelineResult, PcbDocument, PcbAiRouteResult, PcbDrcViolation
} from 'common';
import { AiTaskExtra } from '../internal/AiEngineTypes';

import { IComponentLibrary } from 'component_library';

export interface IAiEngine {
  // ---- v2 API ----
  runAiTask(taskType: AiTaskType, topo: SchTopology, extra?: AiTaskExtra,
    onProgress?: ProgressCallback): Promise<AiTaskResult>;
  cancelAiTask(): ApiResult<void>;
  bindTaskAiConfig(taskType: AiTaskType, apiId: string): ApiResult<void>;
  /** 选型→摆放→布线→ERC 全闭环 */
  runFullPipeline(prompt: string, topo: SchTopology, extra?: AiTaskExtra,
    onProgress?: ProgressCallback): Promise<ApiResult<AiPipelineResult>>;
  aiSelectDevices(prompt: string, partialTopo?: SchTopology): Promise<ApiResult<DeviceSelectResult>>;
  aiPlaceDevices(topo: SchTopology, extra?: AiTaskExtra): Promise<ApiResult<SchTopology>>;
  aiAutoRouteGlobal(topo: SchTopology, onProgress?: ProgressCallback): Promise<ApiResult<RouteResult>>;
  aiAutoRouteSelect(topo: SchTopology, devUuids: string[], onProgress?: ProgressCallback): Promise<ApiResult<RouteResult>>;
  aiOptimizeExistRoute(topo: SchTopology): Promise<ApiResult<RouteResult>>;
  /** PCB AI 布局+布线（多 Agent，零回退） */
  aiPcbAutoRoute(doc: PcbDocument, runDrc: (d: PcbDocument) => PcbDrcViolation[],
    onProgress?: ProgressCallback): Promise<ApiResult<PcbAiRouteResult>>;
  aiStaticDiagnose(topo: SchTopology): Promise<ApiResult<DiagError[]>>;
  aiDynamicDiagnose(topo: SchTopology, waves: WaveData[]): Promise<ApiResult<DiagError[]>>;
  aiGenFullSchematic(prompt: string, extra?: AiTaskExtra): Promise<ApiResult<SchTopology>>;
  aiGenSubCircuit(prompt: string, parentTopo: SchTopology): Promise<ApiResult<SchTopology>>;
  aiAnalyzeWave(waves: WaveData[]): Promise<ApiResult<string>>;
  aiRecommendParam(topo: SchTopology, devInstUuid: string): Promise<ApiResult<Record<string, string>>>;
  aiGetReplaceDevice(libDevId: string, requirement: string): Promise<ApiResult<string[]>>;
  aiOptimizeBom(topo: SchTopology): Promise<ApiResult<BomOptResult>>;

  // ---- v1 兼容 ----
  autoWire(schematic: SchematicDocument): Promise<Result<SchematicDocument>>;
  diagnoseFaults(schematic: SchematicDocument): Promise<Result<ErcViolation[]>>;
  recommendComponents(description: string): Promise<Result<string[]>>;
  generateCircuit(prompt: string, mcuFamily?: string): Promise<Result<SchematicDocument>>;
  analyzeWaveform(result: SimulationResult): Promise<Result<string>>;
  request(req: AiRequest): Promise<AiResponse>;
  setEnabled(capability: AiCapability, enabled: boolean): void;
  isEnabled(capability: AiCapability): boolean;
  setComponentLibrary(library: IComponentLibrary): void;
}
