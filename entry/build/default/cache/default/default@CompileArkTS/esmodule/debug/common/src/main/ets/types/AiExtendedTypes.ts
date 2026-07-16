import type { SchTopology, RouteResult, ErcError } from './TopologyTypes';
import type { ErrCode } from './ErrCode';
import type { ProgressInfo } from './ProgressTypes';
export enum AiTaskType {
    TASK_AUTO_ROUTE_GLOBAL = 0,
    TASK_AUTO_ROUTE_SELECT = 1,
    TASK_ROUTE_OPTIMIZE = 2,
    TASK_CIRCUIT_DIAG_STATIC = 3,
    TASK_CIRCUIT_DIAG_DYNAMIC = 4,
    TASK_GEN_SCH_FULL = 5,
    TASK_GEN_SUB_CIRCUIT = 6,
    TASK_WAVE_ANALYZE = 7,
    TASK_COMPONENT_REC = 8,
    TASK_COMPONENT_REPLACE = 9,
    TASK_BOM_OPTIMIZE = 10,
    /** LLM 语义拆解 + 本地库匹配选型 */
    TASK_DEVICE_SELECT = 11,
    /** LLM 布局约束 + GA 坐标优化 */
    TASK_LAYOUT_PLACE = 12,
    /** 选型 → 摆放 → 布线 → ERC 全闭环 */
    TASK_FULL_PIPELINE = 13
}
export interface DiagError {
    level: 'warning' | 'error' | 'critical';
    targetType: 'device' | 'net' | 'pin';
    targetUuid: string;
    errorDesc: string;
    repairSuggest: string;
    devReference: string;
}
export interface AiTaskResult {
    taskType: AiTaskType;
    success: boolean;
    errCode: ErrCode;
    errMsg: string;
    topology?: SchTopology;
    diagErrors?: DiagError[];
    analysisText?: string;
    progress: ProgressInfo;
}
export interface AiTestResult {
    success: boolean;
    errCode: ErrCode;
    latencyMs: number;
    modelResponse: string;
    remainingQuota: string;
}
export interface BomOptResult {
    originalCost: number;
    optimizedCost: number;
    replacements: Map<string, string>;
    suggestions: string[];
}
export interface LibDevicePin {
    pinId: string;
    pinLabel: string;
    pinType: string;
    x: number;
    y: number;
    pullUp: boolean;
    pullDown: boolean;
    maxVoltage: number;
}
export interface SimModelInfo {
    modelType: 'spice' | 'mcu_51' | 'mcu_stm32' | 'digital_event';
    modelText: string;
    modelVersion: string;
}
export interface ParamLimit {
    resistanceMin?: string;
    resistanceMax?: string;
    voltageMax?: string;
    powerMax?: string;
    freqMax?: string;
}
export interface LibDevice {
    libDevId: string;
    name: string;
    vendor: string;
    category: string;
    subCategory: string;
    svgSymbol: string;
    thumbnailBase64: string;
    pinList: LibDevicePin[];
    simModel: SimModelInfo;
    defaultParams: Map<string, string>;
    paramLimit: ParamLimit;
    isCustom: boolean;
    supportMcuFirmware: boolean;
    aiWiringRules: string[];
    /** 摆放优先级权重，MCU 最高 */
    placementPriority?: number;
    /** 功能分区标签 */
    moduleZone?: 'power' | 'mcu_core' | 'analog' | 'digital_periph' | 'interface';
}
/** LLM 选型输出（禁止具体型号，仅功能+参数区间） */
export interface DeviceRequirement {
    func: string;
    devType: string;
    paramConstraint: Map<string, string>;
    priority: number;
    explicitModel?: string;
}
export interface DeviceSelectLlmOutput {
    functionModule: string[];
    deviceRequireList: DeviceRequirement[];
    circuitConstraint: string;
    oodFlags?: string[];
}
export interface MatchedDevice {
    requirement: DeviceRequirement;
    libDevId: string;
    name: string;
    params: Map<string, string>;
    moduleZone: string;
    placementPriority: number;
    matchLevel: 'exact' | 'fuzzy' | 'domestic_alt' | 'rag';
    paramAdjusted: boolean;
    adjustReason?: string;
}
export interface DeviceSelectResult {
    devices: MatchedDevice[];
    alternatives: Map<string, string[]>;
    oodDetected: boolean;
    ragTemplateId?: string;
}
/** LLM 布局约束（CCG），不输出坐标 */
export type LayoutConstraintType = 'adjacent' | 'separate' | 'central' | 'edge';
export interface LayoutConstraintRule {
    type: LayoutConstraintType;
    a?: string;
    b?: string;
    target?: string;
    weight: number;
    minDistance?: number;
}
export interface DevicePosition {
    x: number;
    y: number;
    rotate: number;
}
export interface LayoutPositionItem {
    deviceId: string;
    x: number;
    y: number;
    rotate: number;
}
export interface LayoutLlmOutput {
    moduleGroup: Record<string, string[]>;
    constraintRules: LayoutConstraintRule[];
    signalWeight: Record<string, number>;
    /** LLM 直接输出的器件坐标 (AI 驱动布局) */
    positions?: LayoutPositionItem[];
}
export interface PlacementCandidate {
    devicePositions: Record<string, DevicePosition>;
    fitnessScore: number;
}
export interface PlacementResult {
    topology: SchTopology;
    candidates: PlacementCandidate[];
    selectedIndex: number;
}
/** LLM 布线约束（无坐标） */
export interface NetPriorityRule {
    netGroup: string;
    priority: number;
}
export interface SpecialNetRule {
    netGroup: string;
    rule: string;
}
export interface RoutingLlmOutput {
    netPriority: Record<string, number>;
    specialNetRules: SpecialNetRule[];
    globalConstraint: string;
}
export interface RoutingWeightPrefs {
    lineLength: number;
    crossPenalty: number;
    analogDigitalIsolate: number;
    xtalShortPath: number;
    diffEqualLength: number;
}
export interface AiPipelineResult {
    selectResult?: DeviceSelectResult;
    placementResult?: PlacementResult;
    routeResult?: RouteResult;
    ercErrors?: ErcError[];
    topology?: SchTopology;
    usedLlm: boolean;
    degradedMode: boolean;
}
