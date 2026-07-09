# AI-SCH 仿真器

纯原理图硬件仿真系统 — 对标 Proteus 核心能力，支持 8051/STM32 HEX 仿真、混合信号仿真与 AI 智能布线。

[English](./README.md) | 简体中文

## 功能亮点

- **原理图编辑器** — Canvas 2D 渲染、网格吸附、撤销/重做、总线布线、层次化子电路、ERC 电气规则检查
- **混合信号仿真** — 模拟（SPICE 网表）、数字（事件驱动）、MCU 三引擎，由全局纳秒级调度器协同
- **MCU 调试** — Intel HEX32 解析、8051 指令级仿真、断点/单步、寄存器/内存查看、虚拟 UART 终端
- **虚拟仪器** — 示波器、逻辑分析仪、万用表、信号源、串口终端
- **AI 智能引擎** — 自动布线（A* + LLM）、故障诊断、电路生成、器件推荐、波形分析
- **多厂商 AI API** — 提供商模板、负载均衡、配额追踪、离线/降级模式
- **器件库** — 三分体文件（`meta.json` + `symbol.svg` + 模型文件）、内置器件、Proteus 导入支持
- **故障注入** — 无源/半导体/MCU 故障场景，批量扫描与 AI 汇总
- **教学辅助** — 分步上电仿真、知识点提示、实验模板、AI 答疑
- **插件系统** — 可扩展插件清单、沙箱与热重载骨架

## 技术栈

| 项目 | 说明 |
|------|------|
| 平台 | HarmonyOS NEXT 5.0+（PC 2in1 / 平板 / 默认设备） |
| 语言 | ArkTS |
| 架构 | Stage 模型 + 模块化 HAR 包 |
| UI | ArkUI 声明式组件（Proteus 风格主题） |
| 通信 | `EventBus` 事件总线解耦 |

## 环境要求

- [DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/) 5.0+
- HarmonyOS SDK API 12+（兼容 SDK 5.0.0）
- Node.js 18+

## 快速开始

1. 克隆仓库，用 DevEco Studio 打开项目根目录。
2. 等待依赖同步完成（`ohpm install`）。
3. 选择 **2in1** 设备或 PC 模拟器作为运行目标。
4. 点击 **Run** 编译运行。

### 应用图标（可选）

发布构建前放置图标资源：

- `AppScope/resources/base/media/app_icon.png`
- `entry/src/main/resources/base/media/startIcon.png`
- `entry/src/main/resources/base/media/layered_image.json`

## 工程结构

```
ElecDraw_Harmony/
├── AppScope/                    # 应用全局配置
├── common/                      # 公共类型、EventBus、工具、授权
├── entry/                       # 主入口模块（UI 壳层 + AppService）
├── features/                    # 功能模块（HAR 包）
│   ├── schematic_editor/        # 原理图编辑器
│   ├── component_library/       # 器件库
│   ├── simulation_kernel/       # 混合仿真内核
│   ├── hex_debugger/            # HEX / MCU 调试
│   ├── ai_engine/               # AI 智能引擎
│   ├── ai_api_manager/          # 多厂商 AI API 管理
│   ├── file_persistence/        # 文件持久化与版本管理
│   ├── instruments/             # 虚拟仪器
│   └── plugin_system/           # 插件扩展系统
├── DeviceLibrary/               # 器件库三分体文件（meta + svg + model）
├── docs/                        # 架构与 API 文档
├── build-profile.json5
└── oh-package.json5
```

## 模块说明

| 模块 | 职责 |
|------|------|
| `schematic_editor` | 纯视图层 — 画布交互、布线、ERC、拓扑导出 |
| `component_library` | 器件资源 — 内置库 + 三分体文件加载器 |
| `simulation_kernel` | 混合仿真 — 模拟/数字/MCU 引擎 + 故障注入 |
| `hex_debugger` | HEX 固件解析、8051 内核、断点、MCU 行为仿真 |
| `ai_engine` | 自动布线、诊断、电路生成、教学服务 |
| `ai_api_manager` | 提供商配置、网络模式、配额与计费追踪 |
| `file_persistence` | 工程保存/加载、崩溃保护、版本快照与对比 |
| `instruments` | 虚拟示波器、逻辑分析仪、万用表、信号源、UART |
| `plugin_system` | 插件生命周期、权限、沙箱 |
| `common` | 类型定义、`ErrCode`、`SchTopology`、适配器、授权与功能门闸 |

### 模块依赖关系

```
entry
 ├── schematic_editor  → common
 ├── component_library → common
 ├── simulation_kernel → common
 ├── hex_debugger      → common
 ├── ai_engine         → common, ai_api_manager
 ├── ai_api_manager    → common
 ├── file_persistence  → common
 ├── instruments       → common
 └── plugin_system     → common
```

模块间通过 `EventBus` 解耦通信，详见 `docs/API_INTERFACES.md` 与 `docs/API_V2.md`（v2 完备版）。

## 器件库

所有器件遵循 **三分体文件规范**：

| 文件 | 用途 |
|------|------|
| `{id}.meta.json` | 元数据、引脚、参数、ERC 规则、模型绑定 |
| `{id}.symbol.svg` | 原理图符号（矢量） |
| `{id}.model.spice` / `.model.mcu` / `.model.digital` | 仿真模型 |

内置品类涵盖无源器件、分立半导体、模拟 IC、数字逻辑、存储器、MCU（8051/STM32）、传感器、外设与虚拟仪器。详见 `docs/DEVICE_LIBRARY_SPEC.md`。

## 文档索引

| 文档 | 说明 |
|------|------|
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 系统架构与模块规格 |
| [API_V2.md](./docs/API_V2.md) | v2 API 契约（ErrCode、SchTopology、回调） |
| [API_INTERFACES.md](./docs/API_INTERFACES.md) | 模块接口参考 |
| [DEVICE_LIBRARY_SPEC.md](./docs/DEVICE_LIBRARY_SPEC.md) | 器件库文件格式 |
| [AI_PIPELINE_SPEC.md](./docs/AI_PIPELINE_SPEC.md) | AI 任务流水线规范 |
| [ENGINEERING_SPEC.md](./docs/ENGINEERING_SPEC.md) | 工程需求与验收 ID |
| [COMPLETE_SPEC.md](./docs/COMPLETE_SPEC.md) | 功能实现状态对照（20 大类） |
| [PRODUCTION_MODULES.md](./docs/PRODUCTION_MODULES.md) | 生产环境模块清单 |
| [DEVELOPMENT_SCHEDULE.md](./docs/DEVELOPMENT_SCHEDULE.md) | 开发排期与 Sprint 计划 |
| [ACCEPTANCE_TESTS.md](./docs/ACCEPTANCE_TESTS.md) | 验收测试场景 |

## 开发路线

| 阶段 | 内容 | 状态 |
|------|------|------|
| P0 | 工程骨架 + 七大模块 API | ✅ 完成 |
| P1 | 原理图 Canvas 2D 渲染 + ERC | ✅ 完成 |
| P2 | 混合仿真三引擎 + 全局调度器 | ✅ 骨架完成 |
| P3 | 8051 HEX 仿真 + 调试面板 | ✅ 完成 |
| P4 | AI API 管理 + 智能布线/生成 | ✅ 完成 |
| P5 | Proteus 导入 + 器件库扩展 | ✅ 基础完成 |
| P6 | Ngspice NAPI + QEMU-MCU 原生集成 | 待开发 |
| v2 | 超细化 API 契约 + SchTopology + ErrCode | ✅ 已落实 |

后续原生集成：Ngspice NAPI、QEMU-MCU 完整 STM32 仿真、OpenGL 大规模渲染、Proteus `.lib` 全量导入。

## 许可证

Apache-2.0 — 见 `oh-package.json5`。
