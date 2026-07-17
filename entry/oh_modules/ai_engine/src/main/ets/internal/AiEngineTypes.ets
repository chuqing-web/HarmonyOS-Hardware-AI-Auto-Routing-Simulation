import { WaveData, RoutingWeightPrefs, SchTopology } from 'common';

export interface AiTaskExtra {
  devUuids?: string[];
  waves?: WaveData[];
  prompt?: string;
  mcuFamily?: string;
  description?: string;
  libDevId?: string;
  requirement?: string;
  scene?: 'text_gen' | 'partial_assist';
  lockedUuids?: string[];
  skipLlm?: boolean;
  routingWeights?: RoutingWeightPrefs;
  onStreamSnapshot?: (topo: SchTopology, stage: string) => void;
  /** 多轮对话历史，用于 LLM 上下文继承 */
  conversationHistory?: ChatHistoryEntry[];
  /** 生成模式: create=从零创建, edit=基于现有电路修改 */
  generationMode?: 'create' | 'edit';
  /** oneshot=整图一次；modular=整体设计+边界后真并行合并 */
  generateStrategy?: 'oneshot' | 'modular';
}

export interface ChatHistoryEntry {
  role: string;
  content: string;
}

export interface ParamValidationResult {
  params: Map<string, string>;
  adjusted: boolean;
  reason?: string;
}

export interface AlternativeEntry {
  libDevId: string;
  alternatives: string[];
}

export interface BomPartCount {
  libDevId: string;
  count: number;
}

export interface BomReplacementEntry {
  original: string;
  replacement: string;
}

export interface DevicePosition {
  x: number;
  y: number;
  rotate: number;
}

export interface PositionEntry {
  deviceId: string;
  position: DevicePosition;
}

export type DiagLevel = 'warning' | 'error' | 'critical';
export type DiagTargetType = 'device' | 'net' | 'pin';
export type MatchLevel = 'exact' | 'fuzzy' | 'domestic_alt' | 'rag';
export type ModuleZoneType = 'power' | 'mcu_core' | 'analog' | 'digital_periph' | 'interface';

export interface PromptVarEntry {
  key: string;
  value: string;
}
