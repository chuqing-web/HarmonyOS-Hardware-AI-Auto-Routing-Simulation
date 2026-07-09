# AI-SCH 仿真器 — 架构设计文档

> 版本 2.0.0 | 最终交付版 | 七大模块完全解耦

---

## 一、产品定位

纯原理图硬件仿真系统，对标 Proteus 核心能力，超越 Proteus 的 AI 智能化能力。

| 维度 | 说明 |
|------|------|
| 平台 | HarmonyOS NEXT 5.0+（PC 2in1 / 平板） |
| 语言 | ArkTS + Stage 模型 |
| 架构 | 七大独立 HAR 模块 + EventBus 解耦 |
| 零 PCB | 无 PCB 设计冗余，专注原理图仿真 |

---

## 二、七大模块架构

```
┌─────────────────────────────────────────────────────────────┐
│                      entry (UI 壳层)                         │
│  Toolbar │ ComponentPanel │ SchematicCanvas │ RightPanel    │
└──────────────────────────┬──────────────────────────────────┘
                           │ AppService 门面
┌──────────────────────────┼──────────────────────────────────┐
│  schematic_editor  │  component_library  │  simulation_kernel │
│  (纯视图层)         │  (器件资源层)        │  (混合仿真内核)     │
├────────────────────┼─────────────────────┼────────────────────┤
│  hex_debugger      │  ai_engine          │  ai_api_manager    │
│  (HEX调试层)        │  (AI智能引擎)        │  (多厂商API管理)    │
├────────────────────┴─────────────────────┴────────────────────┤
│              file_persistence (文件持久化层)                     │
├───────────────────────────────────────────────────────────────┤
│              common (类型定义 + EventBus + 工具)                │
└───────────────────────────────────────────────────────────────┘
```

---

## 三、模块详细规格

### 模块1：原理图图形编辑器 (`schematic_editor`)

**定位**：纯视图交互，不参与仿真计算。

| 功能 | 实现状态 | 文件 |
|------|---------|------|
| Canvas 2D 硬件加速渲染 | ✅ | `entry/components/SchematicCanvas.ets` |
| 无级缩放/平移/框选 | ✅ | `SchematicEditorImpl.ets` |
| 网格吸附 (10/20/50mil) | ✅ | `ViewportState` |
| 撤销/重做 (1000步) | ✅ | undoStack |
| 器件拖拽/旋转/镜像/对齐 | ✅ | `alignComponents()` |
| 直角/45°/自由布线 | ✅ | `WireStyle` |
| 总线系统 (8/16/32位) | ✅ | `createBus()` |
| 层次化子电路 | ✅ | `SubcircuitRef` + ports |
| ERC 电气规则检查 | ✅ | `common/ErcEngine.ets` |
| 拓扑 JSON 导出 | ✅ | `exportTopologyJson()` |

### 模块2：器件库 (`component_library`)

**定位**：三分体文件规范（meta.json + symbol.svg + model）+ 内置器件双源合并。

| 品类 | 数量 | 说明 |
|------|------|------|
| 无源器件 | 20+ | 电阻/电容/电感/晶振/保险丝 |
| 分立半导体 | 10+ | 二极管/LED/三极管/MOS |
| 模拟IC | 7+ | 运放/稳压器 |
| 数字IC | 7+ | 74HC系列/CD4017 |
| 存储芯片 | 4 | ROM/RAM/I2C/SPI Flash |
| 单片机 | 9 | 51/STM32 全系 |
| 外设传感器 | 6+ | LCD/OLED/按键/传感器 |
| 虚拟仪器 | 4 | 示波器/万用表/逻辑分析仪/UART |

**文件规范**：详见 `docs/DEVICE_LIBRARY_SPEC.md`，根目录 `DeviceLibrary/`。

| 组件 | 文件 |
|------|------|
| 三分体加载器 | `loader/DeviceLibraryLoader.ets` |
| Meta 适配器 | `loader/DeviceMetaAdapter.ets` |
| 内置器件（兼容） | `data/BuiltinComponents.ets` |

### 模块3：混合仿真内核 (`simulation_kernel`)

**三引擎 + 全局调度器**：

| 子引擎 | 技术 | 文件 |
|--------|------|------|
| 模拟引擎 | SPICE 网表 + 瞬态求解 | `engines/AnalogEngine.ets` |
| 数字引擎 | 事件驱动 0/1/X/Z | `engines/DigitalEngine.ets` |
| MCU 引擎 | 8051 指令级 + STM32 骨架 | `hex_debugger/Mcu8051Core.ets` |
| 调度器 | 纳秒级全局时间轴 | `engines/GlobalScheduler.ets` |

时序执行顺序：MCU 指令 → 引脚电平 → SPICE 迭代 → 仪器采集

### 模块4：HEX 调试 (`hex_debugger`)

| 功能 | 状态 |
|------|------|
| Intel HEX32 解析 | ✅ `common/HexParser.ets` |
| 8051 指令级仿真 | ✅ `Mcu8051Core.ets` |
| 断点/单步/复位 | ✅ |
| 寄存器/内存查看 | ✅ |
| UART 虚拟终端 | ✅ |
| STM32 调试骨架 | ✅ |

### 模块5：AI 智能引擎 (`ai_engine`)

| 能力 | 算法 | 文件 |
|------|------|------|
| 自动布线 | A* + 路径简化 + LLM 优化 | `AutoWiringEngine.ets` |
| 故障诊断 | ERC + 参数检查 + LLM | `FaultDiagnoser.ets` |
| 电路生成 | 模板 + 布线 | `CircuitTemplates.ets` |
| 器件推荐 | 本地规则 + LLM | `AiEngineImpl.ets` |
| 波形分析 | 统计 + LLM | `AiEngineImpl.ets` |

### 模块6：AI API 管理 (`ai_api_manager`)

支持 17 个厂商模板：豆包/通义/DeepSeek/文心/智谱/Kimi/零一万物/百川/硅基流动/GPT/Claude/Gemini/Mistral/Groq/OpenRouter/Ollama/自定义

| 功能 | 状态 |
|------|------|
| CRUD + 批量操作 | ✅ |
| 密钥加密存储 | ✅ `CryptoUtil.ets` |
| 备用 Key 故障切换 | ✅ |
| 连通性测试 | ✅ |
| 负载均衡 (4种模式) | ✅ |
| 功能绑定模式 | ✅ |
| JSON 导入导出 | ✅ |

### 模块7：文件持久化 (`file_persistence`)

| 格式 | 方向 | 状态 |
|------|------|------|
| `.schsim` | 读写 | ✅ |
| Proteus `.sch` | 导入 | ✅ `ProteusParser.ets` |
| KiCad / LTspice | 导入 | ✅ 基础解析 |
| SPICE 网表 / BOM CSV | 导出 | ✅ |
| 自动保存 / 崩溃恢复 | | ✅ |

---

## 四、模块间通信

所有模块通过 `common.EventBus` 通信，禁止跨模块 import 实现类。

| 事件 | 发布者 | 订阅者 |
|------|--------|--------|
| `SCHEMATIC_CHANGED` | schematic_editor | simulation_kernel, ai_engine |
| `SIMULATION_STEP` | simulation_kernel | UI |
| `MCU_STATE_CHANGED` | hex_debugger | simulation_kernel, UI |
| `AI_REQUEST_COMPLETED` | ai_engine | UI |
| `ERC_COMPLETED` | schematic_editor | UI |
| `VIEWPORT_CHANGED` | schematic_editor | Canvas |

---

## 五、工程文件格式 (.schsim)

```json
{
  "version": "1.0.0",
  "name": "My Circuit",
  "schematic": { "components": [], "wires": [], "nets": [], "netLabels": [], "subcircuits": [] },
  "simulationConfig": { "mode": "mixed", "mcuClockHz": 11059200 },
  "mcuDebugConfig": { "mcuFamily": "8051", "crystalFreq": 11059200 },
  "aiConfigs": [],
  "createdAt": "...", "modifiedAt": "..."
}
```

---

## 六、vs Proteus 对标

| 能力 | Proteus | AI-SCH |
|------|---------|--------|
| 全品类器件库 | ✅ | ✅ 70+ 款（可扩展） |
| 51/STM32 HEX 仿真 | ✅ | ✅ |
| 混合信号仿真 | ✅ | ✅ 三引擎调度 |
| 虚拟仪器 | ✅ | ✅ |
| ERC 检查 | ✅ | ✅ |
| AI 智能布线 | ❌ | ✅ |
| 多厂商 AI API | ❌ | ✅ 17 厂商 |
| 时序精准同步 | 部分 | ✅ 全局调度器 |
| 无 PCB 冗余 | ❌ | ✅ |
| 私有化模型 | ❌ | ✅ Ollama |

---

## 七、工程落地规范

| 文档 | 内容 |
|------|------|
| [ENGINEERING_SPEC.md](./ENGINEERING_SPEC.md) | 存储、日志、仿真线程、AI 安全、导入导出、验收清单（细则 ID） |
| [AI_PIPELINE_SPEC.md](./AI_PIPELINE_SPEC.md) | AI 选型→摆放→布线双分层闭环（LLM 约束 + 本地 GA/A*） |
| [PRODUCTION_MODULES.md](./PRODUCTION_MODULES.md) | **18 大生产必备体系**：授权、协作、插件、虚实串口、热更新、教学、无障碍、隐私、故障注入、打印、跨平台、性能、热重载、合规、快捷键、代理、崩溃恢复 |
| [DEVICE_LIBRARY_SPEC.md](./DEVICE_LIBRARY_SPEC.md) | 器件三分体文件规范 |

---

## 八、后续集成路线

| 优先级 | 内容 | 说明 |
|--------|------|------|
| P1 | Ngspice NAPI 原生集成 | 替换 AnalogEngine 简化求解 |
| P2 | QEMU-MCU STM32 完整仿真 | 替换 STM32 骨架 |
| P3 | Proteus .lib 器件库导入 | 扩展器件覆盖 |
| P4 | OpenGL 原生渲染 | 替换 Canvas 2D 为 GPU 加速 |
| P5 | 遗传算法布线优化 | 增强 AutoWiringEngine |

---

## 九、开发分工

| 团队 | 模块 | 入口文件 |
|------|------|---------|
| UI 组 | entry + Canvas | `pages/Index.ets` |
| 编辑器组 | schematic_editor | `SchematicEditorImpl.ets` |
| 器件组 | component_library | `BuiltinComponents.ets` |
| 仿真组 | simulation_kernel | `SimulationKernelImpl.ets` |
| 嵌入式组 | hex_debugger | `HexDebuggerImpl.ets` |
| AI 组 | ai_engine + ai_api_manager | `AiEngineImpl.ets` |
| 基础组 | common + file_persistence | `CommonTypes.ets` |

每个模块可独立编译为 HAR 包，单独测试，单独发版。
