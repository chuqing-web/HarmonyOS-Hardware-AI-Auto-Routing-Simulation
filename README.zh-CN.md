# AI-SCH 仿真器

**面向 HarmonyOS NEXT 的纯原理图硬件仿真与 AI 辅助电路设计平台**

对标 Proteus 核心编辑与仿真体验，在国产操作系统上提供混合信号仿真、8051/STM32 HEX 调试、虚拟仪器，以及以 **工程化 AI Prompt** 与 **多 Agent 质量总线** 驱动的「澄清 → 选型 → 布局 → 建网 → WAR 布线 → QA」全闭环——服务高校实验、竞赛训练与方案预验证。

[English](./README.md) | 简体中文

**比赛材料：** [作品说明文档](./docs/作品说明文档.md)（创意描述 / 设计稿 / 介绍 / 测试报告）

<p align="center">
  <img src="./picture/design-poster.png" alt="AI-SCH 仿真器设计稿" width="900">
</p>

---

## 目录

- [一、项目背景](#一项目背景)
- [二、核心创新点](#二核心创新点)
- [三、AI Prompt 工程体系](#三ai-prompt-工程体系)
- [四、功能全景](#四功能全景)
- [五、技术架构](#五技术架构)
- [六、AI 闭环流水线](#六ai-闭环流水线)
- [七、仿真与调试能力](#七仿真与调试能力)
- [八、器件库与实验模板](#八器件库与实验模板)
- [九、工程结构与模块](#九工程结构与模块)
- [十、快速开始](#十快速开始)
- [十一、演示建议（评审录屏）](#十一演示建议评审录屏)
- [十二、应用场景](#十二应用场景)
- [十三、工程质量与验证](#十三工程质量与验证)
- [十四、发展展望](#十四发展展望)
- [十五、许可证与声明](#十五许可证与声明)

---

## 一、项目背景

电子设计与嵌入式教学长期依赖 **Windows + Proteus / Multisim** 等工具链。随着 HarmonyOS NEXT 在 PC（2in1）、平板与教室终端上的普及，生态中仍缺少一款：

1. **原生运行于 HarmonyOS** 的原理图级仿真软件；  
2. 同时覆盖 **模拟 / 数字 / MCU** 混合信号实验；  
3. 能把 **大模型能力落地为可执行拓扑**（而不仅是聊天答疑）——且 Prompt 可版本化、可审计、可演进；  
4. 面向课堂的 **实验模板、分步上电、故障注入与覆盖率评估**。

**AI-SCH 仿真器**（包名 `com.elecdraw.aischsim`，厂商 ElecDraw，版本 **1.1.0**）正是为填补上述空白而设计：在 ArkTS / ArkUI Stage 模型上构建模块化 HAR 架构，以统一拓扑契约 `SchTopology` 贯穿编辑、仿真、AI、持久化与教学全链路。

| 项目 | 说明 |
|------|------|
| 应用名称 | AI-SCH 仿真器 |
| Bundle | `com.elecdraw.aischsim` |
| 版本 | **1.1.0**（`AppScope/app.json5` / `oh-package.json5`） |
| 平台 | HarmonyOS NEXT 5.0+ / SDK API 12 |
| 设备形态 | **2in1（主推）**、tablet、default |
| 语言与 UI | ArkTS + ArkUI，Proteus 风格主题 |
| 许可证 | [Apache-2.0](LICENSE) |

---

## 二、核心创新点

本项目的差异化不在「再做一个聊天框」，而在 **把 LLM 约束成可仿真原理图**，并把这条能力做成可教、可测、可演示的应用闭环。

| # | 创新点 | 说明 |
|---|--------|------|
| 1 | **工程化 AI Prompt（权威源）** | `skill/prompts/` 为分阶段 Prompt 唯一权威源；同步镜像到 `templates/*.ets`，由 `PromptLoader` 运行时加载；md↔ets 防漂移，真机不读磁盘 skill |
| 2 | **多 Agent 质量总线** | `AgentPipelineCoordinator` + `CircuitBlackboard`：需求 → 选型 → 布局 → 建网 → WAR 布线 → QA；阶段批判、`qualityHardFail`、澄清后快照续跑 |
| 3 | **分阶段约束 JSON + 本地硬引擎** | Prompt 只产出结构化约束；GA 摆放、语义建网、**WAR**（`WireAutoRouter`，与编辑器同源）、ERC / 几何门禁在本地执行，杜绝「生成一段文字当电路」 |
| 4 | **需求澄清（A/B/C）** | `RequirementsAgent` 仅追问影响拓扑的关键歧义；禁止静默假图；经黑板快照续跑 |
| 5 | **模块化并行生图** | 复杂电路可选「整图一次」或「模块并行」：整体设计 + 边界门禁 → 真并行子流水线 → pin-to-pin joints 合并 |
| 6 | **器件用法手册注入** | 选型落地后，按本次 BOM 注入全库 `DeviceUsageManual`（真脚 / 典型接法 / 禁例），降低瞎连线与脚名臆造 |
| 7 | **HarmonyOS 原生混合信号内核** | 自研 MNA 模拟引擎、事件驱动数字引擎、8051 / 进程内 Cortex-M3 教学路径，全局纳秒调度器协同 |
| 8 | **教学—仿真—诊断闭环** | 20 套 `.schsim` 实验 + HEX 固件 + 知识点提示 + 分步上电 + 故障注入 + 覆盖率仪表盘；仪器与原理图网络实时绑定 |
| 9 | **多厂商 AI 治理** | 17 类提供商模板、任务级 API 绑定、配额仪表盘、离线 / 代理 / 降级策略 |

**相对传统桌面 EDA：** 国产 OS 原生落地 + AI 可执行输出 + 教学可度量。  
**相对纯 Chat 助手：** Prompt 分阶段工程化、多 Agent 门禁、拓扑落地、ERC / 仿真可验证、失败可诊断。

---

## 三、AI Prompt 工程体系

> 把 Prompt 当作**一等工程资产**，而不是散落在业务代码里的字符串。

### 3.1 权威源 → 运行时镜像

```
skill/SKILL.md          （规则总纲：电路分类、防幻觉、MCU/运放强制清单…）
skill/prompts/*.md      （分阶段 system + userTemplate，含 frontmatter）
        │ 人工同步
        ▼
features/ai_engine/.../prompts/templates/*Prompt.ets
        │ PromptLoader.load(runtime_key)
        ▼
LLM 约束 JSON  →  Agent 阶段 + 本地算法引擎  →  SchTopology
```

- **权威文案**：[`skill/prompts/`](./skill/prompts/README.md)（v5.1）  
- **规则总纲**：[`skill/SKILL.md`](./skill/SKILL.md)  
- **流水线阶段**：[`skill/references/pipeline-stages.md`](./skill/references/pipeline-stages.md)  
- **索引**：[`skill/references/prompt-templates.md`](./skill/references/prompt-templates.md)  
- **加载器**：`PromptLoader`（拒绝未知模板静默回退；空模板拒绝渲染）  
- **遗留资源**：根目录 `ai_prompt_lib/*.json` 为早期资产，**现行权威源以 skill 为准**

### 3.2 分阶段 Prompt 一览

| 阶段 | skill 文件 | runtime_key | 管线作用 |
|------|------------|-------------|----------|
| 共享规则 | `00_shared_rules.md` | — | `renderEnriched` 注入公共约束 |
| 需求理解 | `09_requirement.md` | `requirement` | `RequirementsAgent`：`RequirementSpec` 或 A/B/C 澄清 |
| 器件选型 | `01_device_select.md` | `device_select` | 功能模块拆解 + 库内型号；防幻觉 / OOD |
| 布局约束 | `02_layout.md` | `layout` | 区域 / 邻接 / 密度 → GA 摆放 |
| 建网计划 | `03_net_plan.md` | `net_plan` | 引脚级网络清单（主战场，含用法手册） |
| 布线约束 | `04_route.md` | `route` | 模拟 / 数字 / 晶振权重 → WAR（可由 net_plan hints 跳过） |
| 自检修复 | `05_self_review.md` | `self_review` | ERC + 几何问题 → 修复建议（QA Agent） |
| 故障诊断 | `06_diag.md` | `diag` | 静态 / 动态诊断任务 |
| 遗留整图 | `07_gen_sch.md` | `gen_sch` | 兼容路径（生产整图勿依赖） |
| 模块规划 | `08_modular_plan.md` | `modular_plan` | 并行生图：模块边界 + joints 门禁 |

另有运行时片段：`IntentPromptFragments`、`DeviceInstrumentFragments`、`EditPlanPrompt`（局部编辑）、`StageCapabilities` 等，与共享规则一并注入。

### 3.3 运行时动态注入（非静态正文）

`PromptLoader` 在调用时按拓扑 / BOM 动态拼装，避免「整库塞进 prompt」：

| 注入项 | 用途 |
|--------|------|
| `library_catalog` / libDevId 清单 | 选型与模块规划只允许库内型号 |
| `DeviceUsageManual`（full / compact） | 布局 / 建网 / 布线阶段的脚级接法与禁例 |
| 引脚世界坐标 / 选中区 AABB | net_plan 几何感知 |
| 命名脚默认几何 | MCU / 运放脚几何（`NamedDevicePinDefaults`） |
| 导线路径 / 密度报告 | self_review 几何覆盖 |
| 拓扑反模式警示 | enriched 防护（如互斥指示灯触点拓扑） |

### 3.4 维护约定

1. 改规则 → 改 `skill/SKILL.md`  
2. 改某阶段文案 → 改对应 `skill/prompts/0x_*.md`  
3. **必须**同步同名 `*Prompt.ets`，否则 App 行为不变  
4. 几何常量与代码一致：`HIT_PAD=22`、无关脚安全距 ≥20 mil 等  

---

## 四、功能全景

### 4.1 原理图编辑

- 画布交互、图层、网格吸附、撤销 / 重做、批量对齐与分布  
- 总线、网络标签、探针、注释、层次子电路  
- 电气规则检查：静态 ERC / 深度 ERC / 动态 ERC  
- Proteus 风格菜单、工具栏、主题（明暗）与快捷键配置  
- Proteus 器件别名表加载，便于习惯迁移  
- 命名器件脚 + WAR 布线序（与 AI 布线同源）

### 4.2 混合信号仿真

- 模拟：`AnalogEngine`（MNA + Newton-Raphson，二极管 / LED / 三极管 / 运放 / 稳压 / 继电器 / 电位器等）  
- 数字：`DigitalEngine`（事件驱动，74HC 时序、扇出、建立保持）  
- MCU：8051 与 Cortex-M3 **进程内**行为 / 指令路径（`QemuMcuBridge` 为 Thumb 教学级解释器，**非**外部 QEMU 进程），与模拟 / 数字网络同步（GPIO、ADC、USART）  
- 全局调度：`GlobalScheduler`（纳秒级、自适应步长）  
- 分析接口：瞬态 / 直流 / 交流 / 混合 / 噪声 / 蒙特卡洛 / 参数扫描（高级项受 `FeatureGate` 授权门闸）  
- 交互：按键通断、电位器滑臂、继电器触点  
- 故障注入：枚举 **9 类**故障类型；波形修改 / 批量扫描引擎覆盖其中常用子集（开短路、电容漏电等），持续扩充中  

### 4.3 MCU 调试

- Intel HEX32 解析与烧录适配检查  
- 8051 SFR、Cortex-M3 核心寄存器、断点（地址 / 数据）、单步 / 步入 / 步过  
- 虚拟 UART 日志；与仪器串口终端回环  

<p align="center">
  <img src="./picture/mcu-debug-panel.png" alt="MCU 调试面板：HEX 烧录、寄存器与 UART" width="900">
</p>

### 4.4 虚拟仪器

示波器（CH1–4、时基、触发、数学 / FFT、光标）、逻辑分析仪、万用表（四端 `V/A/OHM/COM`）、直流电压 / 电流表、功率计、频率计、信号源、UART 终端（含定时脚本）。引擎位于 `features/instruments/.../engines/`；侧栏与原理图网络实时绑定，随仿真帧刷新。

**示波器显示链路（现行）：**

| 层级 | 行为 |
|------|------|
| 侧栏 | ROLL 写屏 → 滚动；按活信号自适应时基 / V/div；按时基截窗刷新（CRT 观感） |
| 全历史 API | `getOscilloscopeWaveFull` / `captureWaveFullHistory` — 峰值保留导出整次仿真（不按时基截断） |
| 放大弹窗 | 双击波形 → `InstrumentWaveExpandOverlay`：默认 **全览** 一次仿真，可缩放 / 平移看细节，「全览」复位 |
| Canvas | `OscilloscopeWaveCanvas`：像素桶 min/max 包络；写屏阶段 NaN 空隙；`/div` 跟随当前可视窗 |

电压 / 电流 / 频率表面板用内核高采样重建波形（避免 UI 环缓冲混叠），并共用同一放大弹窗做全程回看。

<p align="center">
  <img src="./picture/instruments-1.png" alt="虚拟示波器波形示例" width="900">
</p>

<p align="center">
  <img src="./picture/instruments-2.png" alt="虚拟仪器面板示例" width="900">
</p>

### 4.5 AI 智能设计

自然语言 **需求理解**（可选 A/B/C 澄清）、器件选型、布局约束、建网计划、WAR 布线、整图一次 / 模块并行生成、多轮 **edit 增量**、**自检**（WAR + QA）、静态 / 动态诊断、波形解读、参数推荐、替换器件与 BOM 优化；完整闭环见 [第六节](#六ai-闭环流水线)。

生产路径要求 **真实 LLM + 本地硬引擎**；**禁止**用实验模板 / `CircuitTemplates` 关键词捷径冒充 AI 落图。实验模板仅通过教学面板加载。

<p align="center">
  <img src="./picture/ai-gen-process-1.png" alt="AI 生图过程：选型与布局约束" width="900">
</p>

<p align="center">
  <img src="./picture/ai-gen-process-2.png" alt="AI 生图过程：建网与布线" width="900">
</p>

<p align="center">
  <img src="./picture/ai-gen-process-3.png" alt="AI 生图过程：落图与自检" width="900">
</p>

### 4.6 工程与扩展

- `.schsim` 工程保存 / 加载、自动保存、崩溃保护、会话恢复  
- 导入：Proteus / KiCad / LTspice **基础解析器**（覆盖常见子集，非全量 EDA 兼容）  
- 导出：PNG / SVG（`exportSchImage`）、简化 PDF、波形 CSV、BOM / 网表  
- 协作：本地快照、工程锁、批注与冲突辅助；**实时 WebSocket 协同需外部服务端**（骨架）  
- 插件：清单解析、签名校验、权限门闸；沙箱执行当前为 **权限约束下的桩执行器**（非完整脚本 VM）  
- 授权：`LicenseManager` / `TrialManager` / `FeatureGate`（蒙特卡洛、故障注入、插件等能力门闸）  

---

## 五、技术架构

### 5.1 总体分层

```
┌─────────────────────────────────────────────────────────────┐
│  entry（HAP）  UI 壳层 · AppService 门面 · SimWorker 宿主     │
├─────────────────────────────────────────────────────────────┤
│  features/*（HAR）                                            │
│  schematic_editor │ component_library │ simulation_kernel     │
│  hex_debugger │ instruments │ ai_engine │ ai_api_manager      │
│  file_persistence │ plugin_system                             │
├─────────────────────────────────────────────────────────────┤
│  common（HAR）  SchTopology · ErrCode · EventBus · ERC · 授权  │
│                NamedDevicePinDefaults · WarRouteOrder · AI 门禁│
├─────────────────────────────────────────────────────────────┤
│  资源层  DeviceLibrary · skill/prompts · Test_Template · HEX  │
│         （ai_prompt_lib 为遗留 JSON，权威源见 skill）          │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 统一拓扑契约 `SchTopology`

编辑器、仿真内核、AI 流水线、持久化、插件与教学模板共享同一拓扑模型（器件实例、网络、连线、总线、探针、网络标签、子电路、ERC 错误等）。`TopologyAdapter` 负责文档模型与拓扑互转，避免各模块各自为政。

### 5.3 事件总线解耦

`EventBus` 发布订阅覆盖原理图变更、仿真启停 / 步进、MCU 状态、AI 进度、文件存取、ERC 完成、波形刷新、断点命中、UART 收发、授权变更等。`AppService` 作为业务门面统一编排七大能力与场景闭环。

### 5.4 仿真线程路径

`SimWorkerHost` 已实现 ThreadWorker 路径，但当前默认 **`ENABLE_THREAD_WORKER = false`**（帧载荷尚未做字典差分前，避免 Worker 队列饿死 MMI）。生产默认走主线程 **预算泵（约 40ms）**，保证 UI 流畅；Worker 为可选项 / 路线图能力。

```
UI / AppService
    → SimWorkerHost
        → [默认] 主线程预算泵 → SimulationKernelImpl → 帧快照
        → [可选·当前关闭] ThreadWorker（SimWorker）→ 同上
    → SimFrameStore → 仪器面板 / 画布刷新
```

### 5.5 模块依赖

```
entry
├── common
├── schematic_editor      → common
├── component_library     → common
├── simulation_kernel     → common
├── hex_debugger          → common
├── instruments           → common
├── file_persistence      → common
├── plugin_system         → common
├── ai_api_manager        → common
└── ai_engine             → common, ai_api_manager, component_library
    └── algorithms/agents/   AgentPipelineCoordinator + 各阶段 Agent
```

---

## 六、AI 闭环流水线

生产路径：`AiEngineImpl.runFullPipeline` → **`AgentPipelineCoordinator`**（oneshot / edit / append；modular 走 `runModular`）。遗留 `AiPipelineOrchestrator` 仍为共享执行器 / 模块合并后端，以及 `skipLlm` 回退路径。

### 6.1 整图一次（多 Agent）

```
用户提示词
    │
    ▼
⓪ RequirementsAgent → RequirementSpec
       或 need_clarification（A/B/C + UI 自由输入 D）→ 保存 BlackboardSnapshot → 不落图
    │ （答完后：续跑 / 重跑）
    ▼
① SelectAgent → LLM 选型 → DeviceSelectEngine（防幻觉 / OOD）
    │
    ▼
② LayoutAgent → LLM 布局约束 → PlacementOptimizer / GA
    │
    ▼
③ NetAgent → LLM net_plan → NetPlanExecutor（生产主路径；SemanticNetBuilder 仅 skipLlm）
    │
    ▼
④ RouteAgent → WAR / WireAutoRouter（与原理图编辑器同源）
    │
    ▼
⑤ QaAgent → ERC + 几何 + 有限 WAR 重拉 / finalize（≤2 轮修复）
    │
    ▼
可编辑 · 可仿真 · 可教学的 SchTopology
```

生产硬约束：选型 / net_plan / QA 残留失败则 **中止并交空拓扑**，禁止静默模板假图；LLM 跑时默认开启 `qualityHardFail`；`CircuitTemplates` 关键词匹配路径已禁用。

### 6.2 模块并行（modular）

```
用户选「模块并行」
    → AgentPipelineCoordinator.runModular
    → ① LLM modular_plan（整体设计 + modules[] + joints[]，硬门禁）
    → ② Promise.all：ModularModuleAgent / 隔离子流水线并行
    → ③ pin-to-pin joints 合并 + 电源轨统一 + ERC / 几何门禁
    → 落图画布（替换整图 / 追加空白区）
```

门禁要点：模块数 2～4、边界脚齐全、joints 可解析、库内型号、电源关节齐全；失败 KEEP_RETRY 批判回灌，**不**静默改走模板假图。

### 6.3 API 要点

| 能力 | API 要点 |
|------|----------|
| 全闭环 | `runFullPipeline` → Coordinator（`generateStrategy: oneshot \| modular`） |
| 模块并行 | `runModular` / `runModularParallelPipeline` |
| 自检 | `runSelfCheckPipeline`（WAR + QA） |
| 澄清续跑 | `clarificationAnswers` + `resumeSnapshotJson` / `getLastAgentSnapshotJson` |
| 分步任务 | `aiSelectDevices` / `aiPlaceDevices` / `aiAutoRoute*` |
| 增量编辑 | `generationMode: 'edit'`（多轮对话增量，勿整图重建） |
| 生成 | `aiGenFullSchematic` / `aiGenSubCircuit`（遗留入口；生产整图走 `runFullPipeline`） |
| 诊断 | `aiStaticDiagnose` / `aiDynamicDiagnose` / `aiAnalyzeWave` |
| 工程辅助 | `aiRecommendParam` / `aiGetReplaceDevice` / `aiOptimizeBom` |

AI 提供商模板覆盖豆包、通义、DeepSeek、文心、智谱、Kimi、OpenAI、Claude、Gemini、Ollama 等 **17 类**，支持任务级绑定与配额治理。

---

## 七、仿真与调试能力

| 类别 | 能力 |
|------|------|
| 引擎 | AnalogEngine、DigitalEngine、MCU（8051 / Cortex-M3）、GlobalScheduler |
| SPICE | SpiceMatrixBuilder、SpiceRunner；Ngspice NAPI **桩**（`native=false`，降级自研 AnalogEngine） |
| MCU 桥 | `QemuMcuBridge`：**进程内** Thumb 教学级解释器 + 寄存器模型（非外部 QEMU；完整外设级 QEMU 列入展望） |
| 分析 | 参数扫描、蒙特卡洛、噪声分析（高级能力受 `FeatureGate` 约束） |
| 故障 | 枚举 9 类；引擎波形/批量扫描覆盖常用子集 |
| 调试 | HEX 加载、地址/数据断点、单步、寄存器 / 内存、UART |
| 仪器 | 波形实时刷新、协议解码、表计↔网络绑定；示波器全历史放大 + 峰值保留滚动重采样 |
| 线程 | 默认主线程预算泵；ThreadWorker 已实现但默认关闭 |

---

## 八、器件库与实验模板

### 8.1 器件库（**82** 运行时 / **83** 磁盘三分体）

运行时权威目录由 `component_library` 内置数据（`BuiltinComponents`）维护；磁盘 `DeviceLibrary/` 提供三分体样例、共享 SVG 与 `index.lib.json`。

| 品类 | 数量 | 示例 |
|------|------|------|
| 电源轨 / 激励 | 5 | VCC、GND、**VEE**、VAC、**SIGNAL_GEN**（信号源归 INSTRUMENT 类） |
| 无源 | 23 | R×8、POT×3、C×8、L、XTAL×2、FUSE |
| 分立 | 10 | 1N4148/4007/5819、LED_RED/GREEN/BLUE、BJT、MOS |
| 模拟 IC | 8 | **UA741**（单运放）、**LM358/TL082**（双运放）、**LM555**、7805/7812、AMS1117、LM2596 |
| 数字 IC | 7 | 74HC00/02/04/08/32、**74HC74（库内为 XOR，非 D 触发器）**、CD4017 |
| 存储器 | 4 | 2764、62256、24C02、W25Q64 |
| MCU | 9 | AT89C51/C52、STC89C52、STC15W408AS；STM32F103C8/RC、F407VG、L431CB、F030F4 |
| 外设与传感器 | 8 | SW_PUSH、RELAY_SPDT、BUZZER、LCD1602、OLED；DS18B20、HALL、LDR |
| 虚拟仪器 | 8 | OSCILLOSCOPE、VIRTUAL_METER、LOGIC_ANALYZER、UART_TERMINAL、电压/电流/功率/频率计 |

**磁盘额外样例：** `STM32F103C8T6`（详细 LQFP48）与教学型号 `STM32F103C8` 双向别名——存在于 `DeviceLibrary/` / `index.lib.json`，不单独计入运行时目录。

**三分体规范：** `{id}.meta.json` + `{id}.symbol.svg` + `{id}.model.*`

**品类目录：** `Power/`、`Passive/`、`Discrete/`、`AnalogIC/`、`DigitalLogic/`、`Memory/`、`MCU/`、`Peripheral/`、`Sensor/`、`Instrument/`、`Common/`（共享 SVG）、`UserCustom/`

**运放选型提示：** 普通单运放 → UA741；单片双运放 / 单电源 → LM358；高阻双电源 → TL082。口语「LED / LED灯」→ `LED_RED|GREEN|BLUE`（须限流电阻）。

### 8.2 二十套实验模板

| ID | 实验名称 | 教学要点 | HEX |
|----|----------|----------|-----|
| `lab_power` | 直流电源电路 | 稳压、滤波、熔断 | — |
| `lab_amp` | 运算放大电路 | 虚短虚断、增益 | — |
| `lab_filter` | RC 滤波电路 | 截止频率、缓冲 | — |
| `lab_51_led` | 51 流水灯 | IO、定时器、限流 | ✓ |
| `lab_uart` | 串口通信 | 波特率、TX/RX | ✓ |
| `lab_passive` | 无源器件检测 | 分压、去耦、谐振 | — |
| `lab_discrete` | 分立器件检测 | 整流、开关、限流 | — |
| `lab_analog_ic` | 模拟 IC 检测 | 运放、LDO、Buck | — |
| `lab_digital` | 数字逻辑检测 | 门电路、计数、LA | — |
| `lab_memory` | 存储器接口 | 并行 / I2C / SPI + LA | ✓ |
| `lab_mcu_8051` | 8051 全系列 | 最小系统、晶振、复位 | ✓ |
| `lab_mcu_stm32` | STM32 全系列 | Cortex-M、HSE、NRST | ✓ |
| `lab_peripheral` | 外设接口 | GPIO、继电器、显示 | ✓ |
| `lab_sensor` | 传感器实验 | 1-Wire、数字入、ADC | ✓ |
| `lab_instruments` | 仪器仪表检测 | 电压 / 电流 / 示波器绑定 | — |
| `lab_digital_gates` | 数字门电路 | 按键真值表、74HC×6+CD4017 LED | — |
| `lab_schmitt` | 施密特触发 | 迟滞、整形 | — |
| `lab_integrator` | 积分电路 | 运放积分、时间常数 | — |
| `lab_555_astable` | 555 无稳态 | 多谐振荡、占空比 | — |
| `lab_555_monostable` | 555 单稳态 | 定时、触发 | — |

资源目录：`Test_Template/`、`hex_files/`（7 个 HEX）、`template_manifest.json`。教学面板展示模板覆盖率与 AI 答疑入口（与 `DeviceUsageManual` 同源）。

<p align="center">
  <img src="./picture/lab-templates-1.png" alt="实验模板库示例：51 流水灯" width="900">
</p>

<p align="center">
  <img src="./picture/lab-templates-2.png" alt="实验模板库示例：教学辅助面板" width="900">
</p>

---

## 九、工程结构与模块

```
ElecDraw_Harmony/
├── AppScope/                    # 包配置与全局资源
├── entry/                       # HAP：页面、组件、AppService、SimWorker
│   └── src/main/resources/rawfile/  # 打包 DeviceLibrary / 模板 / HEX / i18n
├── common/                      # 公共类型、ERC、EventBus、授权、WAR 辅助
├── features/
│   ├── schematic_editor/        # 原理图编辑引擎
│   ├── component_library/       # 器件目录与加载器（BuiltinComponents）
│   ├── simulation_kernel/       # 混合仿真内核（含 native/ngspice_napi）
│   ├── hex_debugger/            # HEX / MCU 调试
│   ├── ai_engine/               # AI 流水线、PromptLoader、教学
│   │   └── .../algorithms/agents/  # ★ 多 Agent 质量总线
│   ├── ai_api_manager/          # 多厂商 API 与配额
│   ├── file_persistence/        # 工程持久化 / 导入导出 / 协作
│   ├── instruments/             # 虚拟仪器引擎 + IVirtualInstruments
│   │   └── .../engines/         # 示波器 / LA / 表计 / 信号源 / UART …
│   └── plugin_system/           # 插件沙箱
├── skill/                       # ★ AI 规则总纲 + Prompt 权威源
│   ├── SKILL.md
│   ├── prompts/                 # 分阶段 md 00–09（同步至 templates/*.ets）
│   └── references/              # 器件目录、ERC、管脚图、pipeline-stages 等
├── DeviceLibrary/               # 三分体器件、符号、index.lib.json
├── ai_prompt_lib/               # 遗留 LLM 提示词 JSON（非权威源）
├── Test_Template/               # 实验 .schsim（20 套）+ template_manifest.json
├── hex_files/                   # 实验固件 HEX（7 个）
├── picture/                     # README / 作品说明配图（ASCII 文件名）
├── tools/                       # HEX / 模板构建、verify、audit、smoke
│   └── lab_templates/           # builders / export / verify_*.mjs
├── docs/                        # 比赛材料（作品说明文档.md）
├── project/                     # 本地工程占位
├── build-profile.json5
└── oh-package.json5
```

> **说明：** `entry/oh_modules/*` 为指向 `features/*` / `common` 的 junction——请改 `features/` 与 `common/` 源码，勿直接改 junction 副本。

| 模块 | 职责摘要 |
|------|----------|
| `entry` | UI 壳层、业务编排、Worker 宿主、主题与快捷键；仪器面板与放大弹窗 |
| `common` | `SchTopology`、`ErrCode`、ERC、EventBus、License / FeatureGate、命名脚 / WAR / 网络标号工具、`InstrumentTraceLog` |
| `schematic_editor` | 编辑命令、图层、拓扑导入导出、仿真互锁、WireAutoRouter |
| `component_library` | 内置目录、SVG 缓存、Proteus 别名 |
| `simulation_kernel` | 三引擎 + 调度器 + 故障注入 + SpiceRunner |
| `hex_debugger` | HEX、8051 / Cortex-M3、断点与行为仿真 |
| `ai_engine` | `AgentPipelineCoordinator`、PromptLoader、GA / WAR、模块并行、TeachingService |
| `ai_api_manager` | 提供商、网络模式、配额仪表盘 |
| `file_persistence` | `.schsim`、崩溃保护、导出、协作骨架 |
| `instruments` | `VirtualInstrumentsImpl`、示波器 / LA / 表计引擎、`getOscilloscopeWave` / `getOscilloscopeWaveFull` |
| `plugin_system` | 插件生命周期与沙箱 |

**Agent 模块**（`features/ai_engine/.../algorithms/agents/`）：`AgentPipelineCoordinator`、`CircuitBlackboard`、`RequirementsAgent`、`SelectAgent`、`LayoutAgent`、`NetAgent`、`RouteAgent`、`QaAgent`、`StageCritic`、`StageHooks`、`ModularModuleAgent`。

**入口 UI 组件（节选）：** `SchematicCanvas`、`AppLeftPanel` / `AppRightPanel`、`AiSettingsPanel`、`McuDebugPanel`、`InstrumentPanel`、`InstrumentWaveExpandOverlay` / `InstrumentWaveExpandStore`、`OscilloscopeWaveCanvas`、`LogicAnalyzerWaveCanvas`、`FaultInjectionPanel`、`TeachingPanel`、`PlatformSettingsPanel` 等。

---

## 十、快速开始

### 环境要求

- [DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/) 5.0+  
- HarmonyOS SDK API 12+（产品目标 `5.0.0(12)`）  
- Node.js 18+（可选，用于 `tools/`）  
- 云端 AI：需网络权限；离线时仍可编辑 / 加载实验模板 / 跑本地仿真，但 **生产 AI 整图不走模板假图**（选型 / net_plan 依赖云端 LLM，失败则明确报错）  

### 权限说明

| 权限 | 用途 |
|------|------|
| `ohos.permission.INTERNET` | 调用云端 AI API |
| `ohos.permission.READ_MEDIA` / `WRITE_MEDIA` | 工程文件读写 |
| `ohos.permission.sec.ACCESS_UDID` | 授权与硬件指纹绑定 |

### 运行步骤

1. 克隆仓库，用 DevEco Studio 打开**仓库根目录**。  
2. 等待 `ohpm install` 同步完成。  
3. 选择 **2in1** 设备或 PC 模拟器。  
4. 点击 **Run** 编译并启动 `entry`。  

```bash
ohpm install
# 可选：重建实验 HEX
node tools/_build_lab_mcu_stm32_hex.mjs
python tools/_build_lab_uart_hex.py
# 可选：导出运行时目录 → DeviceLibrary 三分体
node tools/export-builtin-device-library.mjs
```

### 应用图标

- `AppScope/resources/base/media/app_icon.png`  
- `entry/src/main/resources/base/media/startIcon.png`  
- `entry/src/main/resources/base/media/layered_image.json`  

---

## 十一、演示建议（评审录屏）

建议按 5～8 分钟分镜，突出 **「工程化 Prompt → 多 Agent 门禁 → 可仿真拓扑 → 可教学验证」**：

1. **启动与界面** — Splash → Proteus 风格主界面，打开左侧器件库与导航。  
2. **教学模板** — 加载 `lab_uart` / `lab_555_astable` 等，展示覆盖率与知识点。  
3. **HEX 调试** — 烧录配套 HEX，运行仿真，虚拟串口收发 / 流水灯现象。  
4. **仪器联动** — 打开 `lab_amp` / `lab_filter`，示波器观察波形；双击波形放大，**全览**整次仿真后再缩放 / 平移看细节。  
5. **AI Prompt 闭环** — AI 面板输入「STM32 最小系统 + LED」；展示澄清（如有）/ 选型 / 布局 / 建网 / WAR / QA 与 ERC。  
6. **模块并行（加分项）** — 复杂需求选「模块并行」，展示整体设计 → 并行子图 → joints 合并。  
7. **自检 / 故障注入** — 跑 AI 自检，或注入电阻开路等对照波形 / 诊断。  
8. **工程能力** — 保存 `.schsim`、主题切换、AI 配额 / 离线模式（可选）。  

---

## 十二、应用场景

| 场景 | 价值 |
|------|------|
| 高校模电 / 数电 / 单片机实验 | 无实体板也能完成原理图级实验与报告；Prompt 驱动答疑与拓扑生成 |
| 电子设计 / 嵌入式竞赛培训 | 快速搭电路、烧 HEX、看波形与串口；复杂题可用模块并行加速出图 |
| 工程师方案预验证 | AI 生成初稿 + 本地仿真筛错，降低原型成本 |
| HarmonyOS 教室 / 2in1 终端 | 国产 OS 原生部署，减少 Windows 依赖 |
| AI + EDA 教学示范 | 可展示「Prompt 分阶段 + 多 Agent 工程化」完整链路，适合课程与评审 |

---

## 十三、工程质量与验证

| 类型 | 位置 / 方式 |
|------|-------------|
| AI 验收套件 | `AiPipelineValidator`：最小系统 + LED、幻觉芯片拦截、模块合并校验、API 失败降级；经 `runValidationSuite()` 调用 |
| 多 Agent 门禁 | `qualityHardFail`、阶段批判限额、QA 残留中止、落图前 `usedLlm` 三重门禁 |
| 工程 verify 脚本 | `tools/lab_templates/verify_*.mjs`（MNA、二极管 Newton、数字逻辑、几何审计、模板合并等） |
| Audit / smoke | `tools/_audit_*.mjs`、`osc_*_smoke.mjs`、`war_route_order_smoke.mjs` |
| 模板与固件构建 | `tools/_build_lab_*.py` / `.mjs`、`tools/lab_templates/` |
| 目录导出 | `tools/export-builtin-device-library.mjs` |
| Prompt 同步 | `skill/prompts` ↔ `features/ai_engine/.../templates/*.ets` |
| 单元测试框架 | 根依赖 `@ohos/hypium`（持续扩充中） |
| 原生集成说明 | `features/simulation_kernel/native/ngspice_napi/README.md` |

**当前边界（诚实说明）：**

- Ngspice NAPI 仍为桩（`native=false`），默认自研 AnalogEngine  
- MCU：进程内 Thumb / 8051 教学级模型；**外部 QEMU 外设级仿真**列入展望  
- 仿真线程：默认主线程预算泵；ThreadWorker 已实现但默认关闭  
- 故障注入 / 插件沙箱 / 实时协作：能力骨架或子集实现，勿按桌面商业 EDA 全量对标  
- Hypium 自动化用例持续扩充；核心验收以 `AiPipelineValidator` + `tools/lab_templates/verify_*.mjs` 为主  

---

## 十四、发展展望

1. **Ngspice NAPI 实装** — 交叉编译 Ngspice，替换模拟降级路径  
2. **外部 QEMU-MCU** — 完整 STM32 外设级仿真（替换进程内教学解释器）  
3. **Prompt / Skill 工具链** — md→ets 半自动同步与回归 diff  
4. **器件库扩充** — 三分体批量导入、Proteus `.lib` 全量兼容  
5. **性能** — 稳定启用 ThreadWorker（帧差分）、大规模原理图渲染优化  
6. **协作与云** — 实时协同编辑与实验报告云同步  
7. **测试** — Hypium 自动化与更多验收用例  
8. **故障注入 / 插件沙箱** — 引擎与执行器覆盖补全  
9. **Agent 模块并行 Phase-2** — 加深 modular 路径的 Agent 化  

---

## 十五、许可证与声明

- 软件许可证：**Apache-2.0** — 完整文本见根目录 [`LICENSE`](LICENSE)；并在 `oh-package.json5` 中声明  

- 「Proteus」仅为能力对标与 UI 风格参考说明，与 Labcenter 无隶属关系  
- 云端 AI 能力依赖第三方提供商服务条款与配额；离线可编辑、仿真与加载实验模板，**不**静默用模板冒充 AI 整图  

---

**ElecDraw · AI-SCH Simulator · HarmonyOS NEXT**
