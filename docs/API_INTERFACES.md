# AI-SCH仿真器 — API 接口定义文档

> 版本 1.0.0 | 七大模块完全解耦 | 开发团队可直接按此文档开工

---

## 一、模块总览

| 模块 | HAR 包名 | 接口 | 职责 |
|------|----------|------|------|
| 公共层 | `common` | `EventBus`, 类型定义 | 模块间通信标准 |
| 模块1 | `schematic_editor` | `ISchematicEditor` | 原理图绘制（纯视图层） |
| 模块2 | `component_library` | `IComponentLibrary` | Proteus 兼容器件库 |
| 模块3 | `simulation_kernel` | `ISimulationKernel` | 混合信号仿真内核 |
| 模块4 | `hex_debugger` | `IHexDebugger` | HEX 固件烧录与调试 |
| 模块5 | `ai_engine` | `IAiEngine` | AI 智能电路引擎 |
| 模块6 | `ai_api_manager` | `IAiApiManager` | 多厂商 AI API 管理 |
| 模块7 | `file_persistence` | `IFilePersistence` | 文件持久化与导入导出 |

---

## 二、模块间数据流

```
[schematic_editor] ──电气数据──→ [simulation_kernel]
        │                              ↑
        │                              │
[component_library] ──模型参数──→      │
                                       │
[hex_debugger] ←────MCU状态同步────→ [simulation_kernel]
        │
[ai_engine] ←──API调用──→ [ai_api_manager]
        │
[file_persistence] ←──读写──→ 所有模块
```

**通信机制**: 所有模块通过 `common.EventBus` 发布/订阅事件，禁止模块间直接 import 实现类。

### 事件类型

| 事件 | 发布者 | 订阅者 | 数据 |
|------|--------|--------|------|
| `SCHEMATIC_CHANGED` | schematic_editor | simulation_kernel, ai_engine | SchematicDocument |
| `SIMULATION_STARTED` | simulation_kernel | UI, hex_debugger | SimulationConfig |
| `SIMULATION_STEP` | simulation_kernel | UI | SimulationResult |
| `MCU_STATE_CHANGED` | hex_debugger | simulation_kernel, UI | DebugState |
| `AI_REQUEST_COMPLETED` | ai_engine | UI | AiResponse |
| `FILE_SAVED` / `FILE_LOADED` | file_persistence | UI | path, ProjectFile |
| `ERC_COMPLETED` | schematic_editor | UI | ErcViolation[] |

---

## 三、各模块 API 详细定义

### 3.1 ISchematicEditor（模块1）

**文件**: `features/schematic_editor/src/main/ets/api/ISchematicEditor.ets`

```typescript
interface ISchematicEditor {
  // 文档管理
  getDocument(): SchematicDocument;
  loadDocument(doc: SchematicDocument): Result<void>;
  createNew(name: string): SchematicDocument;

  // 器件操作
  placeComponent(libraryId: string, position: Point2D): Result<ComponentInstance>;
  moveComponent(componentId: string, position: Point2D): Result<void>;
  rotateComponent(componentId: string, rotation: Rotation): Result<void>;
  mirrorComponent(componentId: string): Result<void>;
  deleteComponent(componentId: string): Result<void>;
  updateComponentParams(componentId: string, params: Record<string, string>): Result<void>;

  // 布线
  startWire(netId: string, startPoint: Point2D): Result<Wire>;
  addWirePoint(wireId: string, point: Point2D): Result<void>;
  finishWire(wireId: string): Result<Wire>;
  deleteWire(wireId: string): Result<void>;
  createNet(name: string, type: string): Result<Net>;

  // 视图
  setZoom(level: number): void;
  panTo(point: Point2D): void;
  fitToView(): void;

  // 撤销重做
  undo(): Result<void>;
  redo(): Result<void>;

  // ERC
  runErc(): Result<ErcViolation[]>;

  // 导入导出
  importProteus(filePath: string): Result<SchematicDocument>;
  exportNetlist(): Result<string>;
}
```

**约束**: 本模块不参与任何仿真计算，仅维护 SchematicDocument 数据结构。

---

### 3.2 IComponentLibrary（模块2）

**文件**: `features/component_library/src/main/ets/api/IComponentLibrary.ets`

```typescript
interface ComponentDefinition {
  id: string;
  name: string;
  category: ComponentCategory;  // PASSIVE | MCU_8051 | MCU_STM32 | ...
  pins: Pin[];
  defaultParams: Record<string, string>;
  spiceModel: string;           // SPICE 网表模型
  behaviorModel: string;        // 行为仿真模型 ID
  svgSymbol: string;            // SVG 符号路径
  aiWiringRules: string[];      // AI 布线规则标签
}

interface IComponentLibrary {
  listByCategory(category: ComponentCategory): PaginatedResult<ComponentDefinition>;
  search(keyword: string): PaginatedResult<ComponentDefinition>;
  getComponent(libraryId: string): Result<ComponentDefinition>;
  getSpiceModel(libraryId: string): Result<string>;
  getSvgSymbol(libraryId: string): Result<string>;
  importComponent(definition: ComponentDefinition): Result<void>;
  updateLibrary(packagePath: string): Result<number>;
}
```

**内置器件**: 电阻、电容、AT89C51、STC89C52、STM32F103/F407、74HC 系列、LED、示波器。

---

### 3.3 ISimulationKernel（模块3）

**文件**: `features/simulation_kernel/src/main/ets/api/ISimulationKernel.ets`

三引擎架构：

| 子引擎 | 技术 | 职责 |
|--------|------|------|
| 模拟引擎 | Ngspice (C++ NAPI) | DC/AC/瞬态/噪声 |
| 数字引擎 | 自研事件驱动 | 74/4000 逻辑仿真 |
| MCU 引擎 | 8051指令级 + QEMU-MCU | HEX 固件执行 |
| 调度器 | 自研全局时间轴 | 三引擎时序同步 |

```typescript
interface ISimulationKernel {
  loadSchematic(doc: SchematicDocument): Result<void>;
  setConfig(config: SimulationConfig): void;

  start(): Result<void>;
  pause(): Result<void>;
  stop(): Result<void>;
  step(): Result<SimulationResult>;
  getState(): SimulationState;

  getSignalData(signalName: string): Result<number[]>;
  getDigitalState(pinId: string): boolean;
  getMcuSnapshot(): McuRegisterSnapshot | null;
  generateSpiceNetlist(): Result<string>;
}
```

---

### 3.4 IHexDebugger（模块4）

**文件**: `features/hex_debugger/src/main/ets/api/IHexDebugger.ets`

```typescript
interface IHexDebugger {
  configure(config: McuDebugConfig): Result<void>;
  loadHex(filePath: string): Result<HexFirmware>;
  loadHexData(data: Uint8Array, mcuFamily: McuFamily): Result<HexFirmware>;

  run(): Result<void>;
  pause(): Result<void>;
  step(): Result<void>;
  reset(): Result<void>;

  setBreakpoint(address: number): Result<void>;
  readRegister(name: string): Result<number>;
  writeRegister(name: string, value: number): Result<void>;
  readMemory(address: number, length: number): Result<Uint8Array>;

  getPinLevel(pinName: string): Result<number>;
  getUartOutput(): string;
  sendUartInput(data: string): void;
}
```

**支持 MCU**: AT89C51, STC89C52, STM32F103, STM32F407, STM32L4

---

### 3.5 IAiEngine（模块5）

**文件**: `features/ai_engine/src/main/ets/api/IAiEngine.ets`

五大 AI 能力：

| 能力 | 枚举值 | 说明 |
|------|--------|------|
| 自动布线 | `AUTO_WIRING` | 单片机电路专用规则 |
| 故障诊断 | `FAULT_DIAGNOSIS` | 短路/虚焊/参数错误 |
| 器件推荐 | `COMPONENT_RECOMMEND` | 参数优化/替代推荐 |
| 电路生成 | `CIRCUIT_GENERATION` | 文字描述→完整电路 |
| 波形分析 | `WAVEFORM_ANALYSIS` | 仿真结果解读 |

```typescript
interface IAiEngine {
  autoWire(schematic: SchematicDocument): Promise<Result<SchematicDocument>>;
  diagnoseFaults(schematic: SchematicDocument): Promise<Result<ErcViolation[]>>;
  recommendComponents(description: string): Promise<Result<string[]>>;
  generateCircuit(prompt: string, mcuFamily?: string): Promise<Result<SchematicDocument>>;
  analyzeWaveform(result: SimulationResult): Promise<Result<string>>;
  request(req: AiRequest): Promise<AiResponse>;
}
```

---

### 3.6 IAiApiManager（模块6）

**文件**: `features/ai_api_manager/src/main/ets/api/IAiApiManager.ets`

支持厂商：豆包、通义、DeepSeek、文心、智谱、Kimi、GPT、Claude、Gemini、Mistral、Ollama、自定义。

```typescript
interface IAiApiManager {
  addApi(config: AiApiConfig): Result<void>;
  removeApi(id: string): Result<void>;
  updateApi(id: string, config: Partial<AiApiConfig>): Result<void>;
  enableApi(id: string): Result<void>;
  disableApi(id: string): Result<void>;
  testConnection(id: string): Promise<Result<boolean>>;
  chat(prompt: string, options?: ChatOptions): Promise<Result<string>>;
  exportConfigs(): Result<string>;
  importConfigs(json: string): Result<number>;
  setLoadBalanceStrategy(strategy: 'priority' | 'round_robin' | 'failover'): void;
}
```

**负载均衡**: priority（优先级）/ round_robin（轮询）/ failover（故障切换）

---

### 3.7 IFilePersistence（模块7）

**文件**: `features/file_persistence/src/main/ets/api/IFilePersistence.ets`

| 格式 | 扩展名 | 方向 |
|------|--------|------|
| 自有工程 | `.schsim` | 读写 |
| Proteus | `.sch` | 导入 |
| KiCad | `.kicad_sch` | 导入 |
| LTspice | `.asc` | 导入 |
| 网表 | `.cir` | 导出 |
| BOM | `.csv` | 导出 |
| 图片/PDF | `.png`/`.pdf` | 导出 |

```typescript
interface IFilePersistence {
  saveProject(file: ProjectFile, path: string): Promise<Result<void>>;
  loadProject(path: string): Promise<Result<ProjectFile>>;
  importSchematic(path: string, format: FileFormat): Promise<Result<SchematicDocument>>;
  exportSchematic(doc: SchematicDocument, path: string, format: FileFormat): Promise<Result<void>>;
  exportNetlist(doc: SchematicDocument, path: string): Promise<Result<void>>;
  exportBom(doc: SchematicDocument, path: string): Promise<Result<void>>;
}
```

---

## 四、AppService 门面模式

**文件**: `entry/src/main/ets/services/AppService.ets`

UI 层不直接访问各模块实现，统一通过 `AppService` 单例：

```typescript
const app = AppService.getInstance();
app.schematicEditor.placeComponent('R_0402', { x: 100, y: 200 });
app.simulationKernel.start();
await app.aiEngine.autoWire(doc);
await app.saveProject('/path/to/project.schsim');
```

---

## 五、工程文件格式 (.schsim)

```json
{
  "version": "1.0.0",
  "name": "My Circuit",
  "schematic": { /* SchematicDocument */ },
  "simulationConfig": { /* SimulationConfig */ },
  "mcuDebugConfig": { /* McuDebugConfig */ },
  "aiConfigs": [ /* AiApiConfig[] */ ],
  "createdAt": "2026-07-07T00:00:00Z",
  "modifiedAt": "2026-07-07T00:00:00Z"
}
```

---

## 六、开发分工建议

| 团队 | 负责模块 | 优先级 |
|------|----------|--------|
| UI 组 | entry + schematic_editor 画布渲染 | P0 |
| 器件组 | component_library + Proteus 导入 | P0 |
| 仿真组 | simulation_kernel (Ngspice NAPI) | P1 |
| 嵌入式组 | hex_debugger (8051/STM32) | P1 |
| AI 组 | ai_engine + ai_api_manager | P2 |
| 基础组 | common + file_persistence | P0 |

每个模块可独立编译为 HAR 包，单独测试，单独发版。
