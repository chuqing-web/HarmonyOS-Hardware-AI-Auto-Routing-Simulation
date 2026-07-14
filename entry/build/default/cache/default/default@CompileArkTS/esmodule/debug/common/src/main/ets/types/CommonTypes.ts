import type { ErrCode } from './ErrCode';
import type { CollaborationData, SchematicAnnotation } from './CollaborationTypes';
// ==================== 基础几何类型 ====================
export interface Point2D {
    x: number;
    y: number;
}
export interface Rect2D {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface WorldRect {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}
export type Rotation = 0 | 90 | 180 | 270;
export interface ViewportState {
    zoom: number;
    panOffset: Point2D;
    gridVisible: boolean;
    gridSize: number;
    snapToGrid: boolean;
}
// ==================== 电气基础类型 ====================
export enum PinType {
    INPUT = "input",
    OUTPUT = "output",
    BIDIRECTIONAL = "bidirectional",
    POWER = "power",
    GROUND = "ground",
    PASSIVE = "passive",
    OPEN_COLLECTOR = "open_collector",
    ANALOG = "analog"
}
export enum NetType {
    SIGNAL = "signal",
    POWER = "power",
    GROUND = "ground",
    BUS = "bus"
}
export enum LogicState {
    LOW = "0",
    HIGH = "1",
    UNKNOWN = "X",
    HIGH_Z = "Z"
}
export enum BusWidth {
    BUS_8 = 8,
    BUS_16 = 16,
    BUS_32 = 32
}
export enum WireStyle {
    ORTHOGONAL = "orthogonal",
    DIAGONAL_45 = "diagonal_45",
    FREE = "free"
}
export interface Pin {
    id: string;
    name: string;
    number: string;
    type: PinType;
    position: Point2D;
    netId?: string;
    defaultLevel?: LogicState;
    pullType?: 'none' | 'pull_up' | 'pull_down';
}
export interface Net {
    id: string;
    name: string;
    type: NetType;
    pinIds: string[];
    busWidth?: BusWidth;
    branchIndex?: number;
}
export interface NetLabel {
    id: string;
    netId: string;
    text: string;
    position: Point2D;
    global: boolean;
}
export interface Wire {
    id: string;
    netId: string;
    points: Point2D[];
    style: WireStyle;
}
export interface Port {
    id: string;
    name: string;
    type: PinType;
    direction: 'input' | 'output' | 'bidirectional';
    position: Point2D;
}
// ==================== 器件类型 ====================
export enum ComponentCategory {
    PASSIVE = "passive",
    DISCRETE = "discrete",
    ANALOG_IC = "analog_ic",
    DIGITAL_IC = "digital_ic",
    MEMORY = "memory",
    SENSOR = "sensor",
    PERIPHERAL = "peripheral",
    MCU_8051 = "mcu_8051",
    MCU_STM32 = "mcu_stm32",
    INSTRUMENT = "instrument",
    POWER_SUPPLY = "power_supply"
}
export interface ComponentInstance {
    id: string;
    libraryId: string;
    refDes: string;
    name?: string;
    position: Point2D;
    rotation: Rotation;
    mirrored: boolean;
    x?: number;
    y?: number;
    parameters: Map<string, string>;
    pinIds?: string[];
    attributes?: Map<string, string>;
    pinOverrides?: Map<string, string>;
    subcircuitId?: string;
}
// ==================== 原理图文档 ====================
export interface SchematicDocument {
    id: string;
    name: string;
    version: string;
    components: ComponentInstance[];
    wires: Wire[];
    nets: Net[];
    netLabels: NetLabel[];
    subcircuits: SubcircuitRef[];
    metadata: SchematicMetadata;
    annotations?: SchematicAnnotation[];
    probes?: ProbeMeta[];
    simulationConfig?: SimulationConfig;
}
export interface ProbeMeta {
    id: string;
    netId: string;
    label: string;
    color: string;
}
export interface SubcircuitRef {
    id: string;
    name: string;
    documentId: string;
    position: Point2D;
    ports: Port[];
    embeddedDocument?: SchematicDocument;
}
export interface SchematicMetadata {
    author: string;
    createdAt: string;
    modifiedAt: string;
    description: string;
    gridSize: number;
    units: 'mm' | 'mil' | 'inch';
    undoLimit: number;
}
// ==================== 仿真类型 ====================
export enum SimulationMode {
    DC = "dc",
    AC = "ac",
    TRANSIENT = "transient",
    NOISE = "noise",
    PARAMETER_SWEEP = "parameter_sweep",
    MONTE_CARLO = "monte_carlo",
    MIXED = "mixed"
}
export enum SimulationState {
    IDLE = "idle",
    RUNNING = "running",
    PAUSED = "paused",
    STOPPED = "stopped",
    ERROR = "error"
}
export interface SimulationConfig {
    mode: SimulationMode;
    startTime: number;
    stopTime: number;
    stepSize: number;
    maxStep: number;
    temperature: number;
    convergence: number;
    mcuClockHz?: number;
}
export interface SimulationResult {
    time: number[];
    signals: Map<string, number[]>;
    digitalStates: Map<string, LogicState[]>;
    mcuRegisters?: McuRegisterSnapshot[];
}
export interface McuRegisterSnapshot {
    timestamp: number;
    registers: Map<string, number>;
    memory: Uint8Array;
    pinStates: Map<string, number>;
}
// ==================== HEX调试类型 ====================
export enum McuFamily {
    MCU_8051 = "8051",
    MCU_STM32F1 = "STM32F1",
    MCU_STM32F4 = "STM32F4",
    MCU_STM32L4 = "STM32L4"
}
export enum DebugState {
    RESET = "reset",
    RUNNING = "running",
    PAUSED = "paused",
    HALTED = "halted",
    BREAKPOINT = "breakpoint"
}
export interface HexFirmware {
    filePath: string;
    mcuFamily: McuFamily;
    entryPoint: number;
    data: Uint8Array;
    checksum: string;
    segments: HexSegment[];
}
export interface HexSegment {
    address: number;
    data: Uint8Array;
}
export interface McuDebugConfig {
    mcuFamily: McuFamily;
    crystalFreq: number;
    bootPin: number;
    bootPin1?: number;
    resetVector: number;
    firmware?: HexFirmware;
    externalMemory?: boolean;
    watchdogEnabled?: boolean;
    maxRunSteps?: number;
}
// ==================== AI类型 ====================
export enum AiCapability {
    AUTO_WIRING = "auto_wiring",
    FAULT_DIAGNOSIS = "fault_diagnosis",
    COMPONENT_RECOMMEND = "component_recommend",
    CIRCUIT_GENERATION = "circuit_generation",
    WAVEFORM_ANALYSIS = "waveform_analysis"
}
export enum AiProviderType {
    DOUBAO = "doubao",
    QWEN = "qwen",
    DEEPSEEK = "deepseek",
    WENXIN = "wenxin",
    ZHIPU = "zhipu",
    KIMI = "kimi",
    YI = "yi",
    BAICHUAN = "baichuan",
    SILICONFLOW = "siliconflow",
    OPENAI = "openai",
    CLAUDE = "claude",
    GEMINI = "gemini",
    MISTRAL = "mistral",
    GROQ = "groq",
    OPENROUTER = "openrouter",
    OLLAMA = "ollama",
    CUSTOM = "custom"
}
export enum LoadBalanceMode {
    SINGLE_DEFAULT = "single_default",
    PRIORITY = "priority",
    ROUND_ROBIN = "round_robin",
    FAILOVER = "failover",
    CAPABILITY_BINDING = "capability_binding"
}
export enum ApiConnectionStatus {
    UNKNOWN = "unknown",
    OK = "ok",
    AUTH_ERROR = "auth_error",
    RATE_LIMIT = "rate_limit",
    TIMEOUT = "timeout",
    NETWORK_ERROR = "network_error"
}
export interface AiApiConfig {
    id: string;
    name: string;
    provider: AiProviderType;
    baseUrl: string;
    apiKey: string;
    backupApiKey?: string;
    model: string;
    enabled: boolean;
    priority: number;
    maxTokens: number;
    temperature: number;
    contextLimit?: number;
    proxyUrl?: string;
    customHeaders?: Record<string, string>;
    capabilityBinding?: Record<string, string>;
    remark?: string;
    lastStatus?: ApiConnectionStatus;
    lastTestedAt?: string;
    dailyCallCount?: number;
    taskBind?: Map<string, boolean>;
}
export interface AiRequest {
    capability: AiCapability;
    prompt: string;
    context?: Record<string, Object>;
    schematic?: SchematicDocument;
}
export interface AiResponse {
    success: boolean;
    content: string;
    provider: string;
    tokensUsed: number;
    latencyMs: number;
    error?: string;
}
// ==================== 文件持久化类型 ====================
export enum FileFormat {
    SCHSIM = "schsim",
    PROTEUS_SCH = "proteus_sch",
    PROTEUS_LIB = "proteus_lib",
    LTSPICE = "ltspice",
    KICAD = "kicad",
    NETLIST = "netlist",
    BOM = "bom",
    PDF = "pdf",
    PNG = "png",
    SVG = "svg",
    CSV = "csv"
}
export interface ProjectFile {
    version: string;
    name: string;
    schematic: SchematicDocument;
    simulationConfig: SimulationConfig;
    mcuDebugConfig?: McuDebugConfig;
    aiConfigs: AiApiConfig[];
    createdAt: string;
    modifiedAt: string;
    autoSavePath?: string;
    collaboration?: CollaborationData;
}
// ==================== ERC电气规则检查 ====================
export enum ErcSeverity {
    ERROR = "error",
    WARNING = "warning",
    INFO = "info"
}
export enum ErcRuleType {
    PIN_CONFLICT = "pin_conflict",
    FLOATING_NET = "floating_net",
    DUPLICATE_NET = "duplicate_net",
    UNCONNECTED_PIN = "unconnected_pin",
    MISSING_CRYSTAL = "missing_crystal",
    MISSING_RESET = "missing_reset",
    POWER_REVERSED = "power_reversed",
    IO_OVERCURRENT = "io_overcurrent",
    PARAM_MISMATCH = "param_mismatch",
    PORT_MISMATCH = "port_mismatch"
}
export interface ErcViolation {
    id: string;
    severity: ErcSeverity;
    ruleType: ErcRuleType;
    message: string;
    componentId?: string;
    netId?: string;
    pinId?: string;
    position?: Point2D;
    fixSuggestion?: string;
}
// ==================== 模块事件总线 ====================
export enum ModuleEvent {
    SCHEMATIC_CHANGED = "schematic_changed",
    SIMULATION_STARTED = "simulation_started",
    SIMULATION_STOPPED = "simulation_stopped",
    SIMULATION_STEP = "simulation_step",
    MCU_STATE_CHANGED = "mcu_state_changed",
    AI_REQUEST_COMPLETED = "ai_request_completed",
    FILE_SAVED = "file_saved",
    FILE_LOADED = "file_loaded",
    ERC_COMPLETED = "erc_completed",
    VIEWPORT_CHANGED = "viewport_changed",
    SELECTION_CHANGED = "selection_changed",
    AI_TASK_PROGRESS = "ai_task_progress",
    WAVE_REFRESH = "wave_refresh",
    BREAKPOINT_HIT = "breakpoint_hit",
    UART_RECV = "uart_recv",
    LICENSE_CHANGED = "license_changed",
    ANNOTATION_CHANGED = "annotation_changed",
    SNAPSHOT_CREATED = "snapshot_created",
    PROJECT_LOCK_CHANGED = "project_lock_changed"
}
export interface ModuleEventPayload {
    event: ModuleEvent;
    source: string;
    timestamp: number;
    data: Object;
}
export type ModuleEventHandler = (payload: ModuleEventPayload) => void;
// ==================== 通用结果类型 ====================
export interface Result<T> {
    success: boolean;
    errCode?: ErrCode;
    data?: T;
    error?: string;
}
export interface PaginatedResult<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
}
