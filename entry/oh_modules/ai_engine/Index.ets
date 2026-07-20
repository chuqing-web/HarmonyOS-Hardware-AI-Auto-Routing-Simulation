export { IAiEngine } from './src/main/ets/api/IAiEngine';
export { AiEngineImpl } from './src/main/ets/AiEngineImpl';
export { TeachingService, LabTemplate, KnowledgeTip, TemplateFirmware } from './src/main/ets/TeachingService';
export {
  LabTemplateRegistry, LabTemplateDef, LabTemplateBuilder, LabCoverageReport, ALL_CATALOG_LIBRARY_IDS
} from './src/main/ets/algorithms/LabTemplateRegistry';
export { TemplateSchematicKit } from './src/main/ets/algorithms/TemplateSchematicKit';
export { SemanticNetBuilder, SemanticNetBuildResult } from './src/main/ets/algorithms/SemanticNetBuilder';
export { NetPlanExecutor, NetPlanResult, NetPlanExecutionResult, NetPlanWiringHints, WiredCompactPair } from './src/main/ets/algorithms/NetPlanExecutor';
export { AiTopologyFixKit, TopologyFixResult } from './src/main/ets/algorithms/AiTopologyFixKit';
export { LlmJsonNormalizer } from './src/main/ets/algorithms/LlmJsonNormalizer';
export { PinWorldResolver } from './src/main/ets/algorithms/PinWorldResolver';
export { AiResultCache } from './src/main/ets/AiResultCache';
export { AiPipelineValidator, AiValidationResult } from './src/main/ets/validation/AiPipelineValidator';
export { ChatHistoryEntry } from './src/main/ets/internal/AiEngineTypes';
