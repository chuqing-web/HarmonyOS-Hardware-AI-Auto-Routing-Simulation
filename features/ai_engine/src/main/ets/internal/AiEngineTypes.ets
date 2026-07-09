import { WaveData, RoutingWeightPrefs } from 'common';

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
