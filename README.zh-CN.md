# AI-SCH 仿真器

**面向 HarmonyOS NEXT 的纯原理图硬件仿真与 AI 辅助电路设计平台**

对标 Proteus 核心编辑与仿真体验，在国产操作系统上提供混合信号仿真、8051/STM32 HEX 调试、虚拟仪器，以及「选型 → 摆放 → 布线 → ERC」全闭环 AI 流水线——服务高校实验、竞赛训练与方案预验证。

[English](./README.md) | 简体中文

---

## 目录

- [一、项目背景](#一项目背景)
- [二、核心创新点](#二核心创新点)
- [三、功能全景](#三功能全景)
- [四、技术架构](#四技术架构)
- [五、AI 闭环流水线](#五ai-闭环流水线)
- [六、仿真与调试能力](#六仿真与调试能力)
- [七、器件库与实验模板](#七器件库与实验模板)
- [八、工程结构与模块](#八工程结构与模块)
- [九、快速开始](#九快速开始)
- [十、演示建议（评审录屏）](#十演示建议评审录屏)
- [十一、应用场景](#十一应用场景)
- [十二、工程质量与验证](#十二工程质量与验证)
- [十三、发展展望](#十三发展展望)
- [十四、许可证与声明](#十四许可证与声明)

---

## 一、项目背景

电子设计与嵌入式教学长期依赖 **Windows + Proteus / Multisim** 等工具链。随着 HarmonyOS NEXT 在 PC（2in1）、平板与教室终端上的普及，生态中仍缺少一款：

1. **原生运行于 HarmonyOS** 的原理图级仿真软件；  
2. 同时覆盖 **模拟 / 数字 / MCU** 混合信号实验；  
3. 能把 **大模型能力落地为可执行拓扑**（而不仅是聊天答疑）；  
4. 面向课堂的 **实验模板、分步上电、故障注入与覆盖率评估**。

**AI-SCH 仿真器**（包名 `com.elecdraw.aischsim`，厂商 ElecDraw，版本 1.0.0）正是为填补上述空白而设计：在 ArkTS / ArkUI Stage 模型上构建模块化 HAR 架构，以统一拓扑契约 `SchTopology` 贯穿编辑、仿真、AI、持久化与教学全链路。

| 项目 | 说明 |
|------|------|
| 应用名称 | AI-SCH 仿真器 |
| Bundle | `com.elecdraw.aischsim` |
| 平台 | HarmonyOS NEXT 5.0+ / SDK API 12 |
| 设备形态 | **2in1（主推）**、tablet、default |
| 语言与 UI | ArkTS + ArkUI，Proteus 风格主题 |
| 许可证 | Apache-2.0 |

---

## 二、核心创新点

| # | 创新点 | 说明 |
|---|--------|------|
| 1 | **AI 全闭环 EDA** | LLM 输出约束 JSON → 本地 GA 摆放 → 语义建网 → A\* 约束布线 → ERC / 自检修复；云端不可用时可模板强匹配与降级路径 |
| 2 | **HarmonyOS 原生混合信号内核** | 自研 MNA 模拟引擎、事件驱动数字引擎、8051 / Cortex-M3 指令级路径，全局纳秒调度器协同 |
| 3 | **教学闭环** | 15 套 `.schsim` 实验工程 + HEX 固件 + 知识点提示 + 分步上电 + 器件覆盖率仪表盘 |
| 4 | **仪器 ↔ 原理图实时绑定** | 示波器 / 逻辑分析仪 / 万用表 / 信号源 / UART 与网络、MCU 串口回环联动 |
| 5 | **多厂商 AI 治理** | 17 类提供商模板、任务级 API 绑定、配额仪表盘、离线 / 代理 / 降级策略 |
| 6 | **模块化 HAR + EventBus** | 11 个模块、统一错误码与拓扑契约，便于扩展插件、导入与协作 |

相对传统桌面 EDA：本项目强调 **国产 OS 原生落地、AI 可执行输出、教学可度量**；相对纯 Chat 助手：本项目强调 **拓扑落地、ERC 校验与仿真可验证**。

---

## 三、功能全景

### 3.1 原理图编辑

- 画布交互、图层、网格吸附、撤销 / 重做、批量对齐与分布  
- 总线、网络标签、探针、注释、层次子电路  
- 电气规则检查：静态 ERC / 深度 ERC / 动态 ERC  
- Proteus 风格菜单、工具栏、主题（明暗）与快捷键配置  
- Proteus 器件别名表加载，便于习惯迁移  

### 3.2 混合信号仿真

- 模拟：`AnalogEngine`（MNA + Newton-Raphson，二极管 / LED / 三极管 / 运放 / 稳压 / 继电器 / 电位器等）  
- 数字：`DigitalEngine`（事件驱动，74HC 时序、扇出、建立保持）  
- MCU：8051 与 Cortex-M3 行为 / 指令路径，与模拟 / 数字网络同步（GPIO、ADC、USART）  
- 全局调度：`GlobalScheduler`（纳秒级、自适应步长）  
- 分析接口：瞬态 / 直流 / 交流 / 混合 / 噪声 / 蒙特卡洛 / 参数扫描  
- 交互：按键通断、电位器滑臂、继电器触点；故障注入 9 类场景与批量扫描  

### 3.3 MCU 调试

- Intel HEX32 解析与烧录适配检查  
- 8051 SFR、Cortex-M3 核心寄存器、断点（地址 / 数据）、单步 / 步入 / 步过  
- 虚拟 UART 日志；与仪器串口终端回环  

### 3.4 虚拟仪器

示波器（多通道、时基、触发、数学 / FFT、光标）、逻辑分析仪、万用表、直流电压 / 电流表、功率计、频率计、信号源、UART 终端（含定时脚本）。

### 3.5 AI 智能设计

自然语言驱动的器件选型、布局约束、全局 / 局部布线、全原理图 / 子电路生成、静态 / 动态诊断、波形解读、参数推荐、替换器件与 BOM 优化；完整闭环见 [第五节](#五ai-闭环流水线)。

### 3.6 工程与扩展

- `.schsim` 工程保存 / 加载、自动保存、崩溃保护、会话恢复  
- 导入：Proteus / KiCad / LTspice 解析骨架；导出：PNG / SVG / PDF、波形 CSV、BOM  
- 协作：快照、工程锁、批注、冲突解决骨架  
- 插件：清单、签名校验、沙箱权限、示例脚本加载  

---

## 四、技术架构

### 4.1 总体分层

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
├─────────────────────────────────────────────────────────────┤
│  资源层  DeviceLibrary · ai_prompt_lib · Test_Template · HEX    │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 统一拓扑契约 `SchTopology`

编辑器、仿真内核、AI 流水线、持久化、插件与教学模板共享同一拓扑模型（器件实例、网络、连线、总线、探针、网络标签、子电路、ERC 错误等）。`TopologyAdapter` 负责文档模型与拓扑互转，避免各模块各自为政。

### 4.3 事件总线解耦

`EventBus` 发布订阅覆盖原理图变更、仿真启停 / 步进、MCU 状态、AI 进度、文件存取、ERC 完成、波形刷新、断点命中、UART 收发、授权变更等。`AppService` 作为业务门面统一编排七大能力与场景闭环。

### 4.4 仿真线程路径

```
UI / AppService
    → SimWorkerHost
        → [优选] ThreadWorker（SimWorker）→ SimulationKernelImpl → 帧快照
        → [回退] 主线程泵（预算限流，保障流畅）
    → SimFrameStore → 仪器面板 / 画布刷新
```

### 4.5 模块依赖

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
```

---

## 五、AI 闭环流水线

`IAiEngine.runFullPipeline` 将自然语言需求落地为可仿真拓扑：

```
用户提示词
    │
    ▼
① 强模板匹配（CircuitTemplates）──命中则短路加速──┐
    │                                              │
    ▼                                              │
② LLM 选型 → LlmJsonNormalizer → DeviceSelectEngine（防幻觉 / OOD）
    │
    ▼
③ LLM 布局约束 → PlacementOptimizer / PlacementGaWorker（遗传算法）
    │
    ▼
④ SemanticNetBuilder + PinWorldResolver（语义建网与引脚世界坐标）
    │
    ▼
⑤ LLM 布线约束 → ConstrainedWiringEngine（A*，模拟/数字/晶振权重）
    │
    ▼
⑥ 半失败回退 / 模板补救 → ERC + FaultDiagnoser 自检修复
    │
    ▼
可编辑 · 可仿真 · 可教学的 SchTopology
```

| 能力 | API 要点 |
|------|----------|
| 全闭环 | `runFullPipeline` |
| 分步任务 | `aiSelectDevices` / `aiPlaceDevices` / `aiAutoRoute*` |
| 生成 | `aiGenFullSchematic` / `aiGenSubCircuit` |
| 诊断 | `aiStaticDiagnose` / `aiDynamicDiagnose` / `aiAnalyzeWave` |
| 工程辅助 | `aiRecommendParam` / `aiGetReplaceDevice` / `aiOptimizeBom` |

提示词资源位于 `ai_prompt_lib/`：`device_select`、`layout`、`route`、`gen_sch`、`diag`。  
AI 提供商模板覆盖豆包、通义、DeepSeek、文心、智谱、Kimi、OpenAI、Claude、Gemini、Ollama 等 **17 类**，支持任务级绑定与配额治理。

---

## 六、仿真与调试能力

| 类别 | 能力 |
|------|------|
| 引擎 | AnalogEngine、DigitalEngine、MCU（8051 / Cortex-M3）、GlobalScheduler |
| SPICE | SpiceMatrixBuilder、SpiceRunner；Ngspice NAPI 桩（当前降级至自研模拟引擎） |
| MCU 桥 | QemuMcuBridge 骨架（完整 QEMU STM32 为后续规划） |
| 分析 | 参数扫描、蒙特卡洛、噪声分析（高级能力受授权门闸约束） |
| 故障 | 电阻开/短路、电容漏电、电感开路、三极管击穿、MOS 损坏、IO 短路、晶振停振、复位粘滞等 |
| 调试 | HEX 加载、断点、单步、寄存器 / 内存、UART |
| 仪器 | 波形实时刷新、协议解码、测量读数与网络绑定 |

---

## 七、器件库与实验模板

### 7.1 器件库（约 79 个运行时器件）

运行时权威目录由 `component_library` 内置数据维护；磁盘 `DeviceLibrary/` 提供三分体样例与共享 SVG。

| 品类 | 数量级 | 示例 |
|------|--------|------|
| 电源 | 3 | VCC、GND、VAC |
| 无源 | ~23 | 电阻 / 电容 / 电感 / 晶振 / 熔断 / 电位器 |
| 分立 | ~10 | 二极管、LED、BJT、MOSFET |
| 模拟 IC | ~7 | UA741、LM358、LDO、Buck |
| 数字 IC | ~7 | 74HC 系列、CD4017 |
| 存储器 | 4 | 并行 / I2C / SPI Flash |
| MCU | 9 | AT89 / STC、STM32F103 / F407 / L431 等 |
| 外设与传感器 | ~8 | 按键、继电器、蜂鸣器、LCD/OLED、DS18B20 等 |
| 虚拟仪器 | 8 | 示波器、逻辑仪、各类表计、UART |

**三分体规范：** `{id}.meta.json` + `{id}.symbol.svg` + `{id}.model.*`

### 7.2 十五套实验模板

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
| `lab_memory` | 存储器接口 | 并行 / I2C / SPI | — |
| `lab_mcu_8051` | 8051 全系列 | 最小系统、晶振、复位 | ✓ |
| `lab_mcu_stm32` | STM32 全系列 | Cortex-M、HSE、NRST | ✓ |
| `lab_peripheral` | 外设接口 | GPIO、继电器、显示 | ✓ |
| `lab_sensor` | 传感器实验 | 1-Wire、数字入、ADC | — |
| `lab_instruments` | 仪器仪表检测 | 电压 / 电流 / 示波器绑定 | — |

资源目录：`Test_Template/`、`hex_files/`、`template_manifest.json`。教学面板展示模板覆盖率与 AI 答疑入口。

---

## 八、工程结构与模块

```
ElecDraw_Harmony/
├── AppScope/                    # 包配置与全局资源
├── entry/                       # HAP：页面、组件、AppService、SimWorker
├── common/                      # 公共类型、ERC、EventBus、授权
├── features/
│   ├── schematic_editor/        # 原理图编辑引擎
│   ├── component_library/       # 器件目录与加载器
│   ├── simulation_kernel/       # 混合仿真内核（含 native/ngspice_napi）
│   ├── hex_debugger/            # HEX / MCU 调试
│   ├── ai_engine/               # AI 流水线与教学
│   ├── ai_api_manager/          # 多厂商 API 与配额
│   ├── file_persistence/        # 工程持久化 / 导入导出 / 协作
│   ├── instruments/             # 虚拟仪器引擎
│   └── plugin_system/           # 插件沙箱
├── DeviceLibrary/               # 三分体器件与符号
├── ai_prompt_lib/               # LLM 提示词 JSON
├── Test_Template/               # 实验 .schsim
├── hex_files/                   # 实验固件 HEX
├── tools/                       # HEX / 模板构建与 verify 脚本
├── project/                     # 本地工程占位
├── docs/                        # 文档预留
├── build-profile.json5
└── oh-package.json5
```

| 模块 | 职责摘要 |
|------|----------|
| `entry` | UI 壳层、业务编排、Worker 宿主、主题与快捷键 |
| `common` | `SchTopology`、`ErrCode`、ERC、EventBus、License / FeatureGate |
| `schematic_editor` | 编辑命令、图层、拓扑导入导出、仿真互锁 |
| `component_library` | 内置目录、SVG 缓存、Proteus 别名 |
| `simulation_kernel` | 三引擎 + 调度器 + 故障注入 + SpiceRunner |
| `hex_debugger` | HEX、8051 / Cortex-M3、断点与行为仿真 |
| `ai_engine` | 流水线编排、GA / A\*、RAG 模板、TeachingService |
| `ai_api_manager` | 提供商、网络模式、配额仪表盘 |
| `file_persistence` | `.schsim`、崩溃保护、导出、协作骨架 |
| `instruments` | 各仪器引擎与绑定快照 |
| `plugin_system` | 插件生命周期与沙箱 |

**入口 UI 组件（节选）：** `SchematicCanvas`、`AppLeftPanel` / `AppRightPanel`、`AiSettingsPanel`、`McuDebugPanel`、`InstrumentPanel`、`FaultInjectionPanel`、`TeachingPanel`、`PlatformSettingsPanel` 等。

---

## 九、快速开始

### 环境要求

- [DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/) 5.0+  
- HarmonyOS SDK API 12+（产品目标 `5.0.0(12)`）  
- Node.js 18+（可选，用于 `tools/`）  
- 云端 AI：需网络权限；离线模式可走模板 / 本地算法降级  

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
```

### 可选图标资源

- `AppScope/resources/base/media/app_icon.png`  
- `entry/src/main/resources/base/media/startIcon.png`  
- `entry/src/main/resources/base/media/layered_image.json`  
- 源素材：`ico/ico.png`  

---

## 十、演示建议（评审录屏）

建议按 5～8 分钟分镜，突出「可运行、可教学、有 AI」：

1. **启动与界面** — Splash → Proteus 风格主界面，打开左侧器件库与导航。  
2. **教学模板** — 加载 `lab_uart` 或 `lab_51_led`，展示覆盖率与知识点。  
3. **HEX 调试** — 烧录配套 HEX，运行仿真，虚拟串口收发 / 流水灯现象。  
4. **仪器联动** — 打开 `lab_amp` / `lab_filter`，示波器观察运放或 RC 波形。  
5. **AI 全闭环** — 在 AI 面板输入「STM32 最小系统 + LED」，执行全流水线，展示选型 / 摆放 / 布线进度与 ERC 自检。  
6. **故障注入** — 注入电阻开路等故障，批量扫描并对照波形 / 诊断。  
7. **工程能力** — 保存 `.schsim`、主题切换、AI 配额 / 离线模式（可选）。  

---

## 十一、应用场景

| 场景 | 价值 |
|------|------|
| 高校模电 / 数电 / 单片机实验 | 无实体板也能完成原理图级实验与报告 |
| 电子设计 / 嵌入式竞赛培训 | 快速搭电路、烧 HEX、看波形与串口 |
| 工程师方案预验证 | AI 生成初稿 + 本地仿真筛错，降低原型成本 |
| HarmonyOS 教室 / 2in1 终端 | 国产 OS 原生部署，减少 Windows 依赖 |

---

## 十二、工程质量与验证

| 类型 | 位置 / 方式 |
|------|-------------|
| AI 验收套件 | `AiPipelineValidator`：`validateMinSystemLed`、幻觉芯片拦截、API 失败降级；经 `runValidationSuite()` 调用 |
| 工程 verify 脚本 | `tools/lab_templates/verify_*.mjs`（MNA、二极管 Newton、数字逻辑、几何审计、模板合并等） |
| 模板与固件构建 | `tools/_build_lab_*.py` / `.mjs`、`tools/lab_templates/` |
| 单元测试框架 | 根依赖 `@ohos/hypium`（持续扩充中） |
| 原生集成说明 | `features/simulation_kernel/native/ngspice_napi/README.md` |

**当前边界（诚实说明）：** Ngspice NAPI 与 QEMU-MCU 仍为桩 / 骨架，完整生产级 SPICE / QEMU 集成列入展望；默认仿真路径以保证 UI 流畅为优先（Worker 与主线程回退并存）。

---

## 十三、发展展望

1. **Ngspice NAPI 实装** — 交叉编译 Ngspice，替换模拟降级路径  
2. **QEMU-MCU** — 完整 STM32 外设级仿真  
3. **器件库扩充** — 三分体批量导入、Proteus `.lib` 全量兼容  
4. **性能** — 稳定启用独立仿真线程、大规模原理图渲染优化  
5. **协作与云** — 实时协同编辑与实验报告云同步  
6. **测试** — Hypium 自动化与更多验收用例  

---

## 十四、许可证与声明

- 软件许可证：**Apache-2.0**（见根目录 `oh-package.json5`）  
- 「Proteus」仅为能力对标与 UI 风格参考说明，与 Labcenter 无隶属关系  
- 云端 AI 能力依赖第三方提供商服务条款与配额；离线场景使用本地算法与实验模板  

---

**ElecDraw · AI-SCH Simulator · HarmonyOS NEXT**
