# AI-SCH 开发任务排期

> 基于超细化接口文档 | 当前状态：阶段 0–1 已落实代码骨架

## 当前完成度（2026-07）

| 阶段 | 内容 | 状态 |
|------|------|------|
| 0 | ErrCode / SchTopology / Adapter / CallbackRegistry | ✅ 已落实 |
| 1 | 模块1 v2 API（批量/探针/ERC修复/布线回写） | ✅ 已落实 |
| 2 | 模块2–7 v2 API 接口 + 实现骨架 | ✅ 已落实 |
| 3 | AppService 场景闭环 + UI 回调 | ✅ 已落实 |
| 4 | Ngspice NAPI 原生集成 | ⏳ 待开发 |
| 5 | QEMU-MCU STM32 完整仿真 | ⏳ 待开发 |
| 6 | Proteus .lib 全量导入 | ⏳ 待开发 |
| 7 | OpenGL 十万级渲染 | ⏳ 待开发 |

## 团队编制（6–8 人）

| 角色 | 人数 | 负责 |
|------|------|------|
| 架构/基础 | 1 | common、Adapter、ErrCode |
| UI/编辑器 | 2 | Canvas、探针、仪器面板 |
| 器件/导入 | 1 | LibDevice、Proteus |
| 仿真原生 | 2 | Ngspice、调度器、GPU |
| 嵌入式 | 1 | 8051 全指令、QEMU |
| AI | 1 | 11 类任务、离线推理 |

## 后续排期

### Sprint 7–8（4 周）— Ngspice MVP
- C++ NAPI 封装 Ngspice
- `runSpiceStep` 替换简化 AnalogEngine
- 瞬态仿真精度验证
- **工时**：320h

### Sprint 9–10（4 周）— 8051 全指令
- 111 条指令完整实现
- SFR / 内外 RAM / UART 外设
- 与仿真内核引脚同步
- **工时**：280h

### Sprint 11–12（4 周）— STM32 QEMU
- QEMU-MCU F103 集成
- GPIO/ADC/UART 外设联动
- **工时**：320h

### Sprint 13–14（4 周）— Proteus 导入
- `.lib` 解析器
- `MapProteusDevId` 覆盖率 80%+
- **工时**：240h

### Sprint 15–16（4 周）— 集成发布
- 5 大场景 E2E 测试
- 性能基准、文档、示例工程
- **工时**：320h

## 总工时估算

| 项目 | 人时 |
|------|------|
| 已完成（阶段 0–3） | ~1,200 |
| 待开发（阶段 4–7） | ~3,200 |
| **合计** | **~4,400** |

**6 人全职**：剩余约 10 个月 | **8 人全职**：剩余约 7 个月

## 功能完备性清单

对标文档「全软件功能完备性校验清单」及 `PRODUCTION_MODULES.md` 十八大生产体系：

- ✅ 已实现（骨架/基础）：七大模块核心 ~55%
- 🔶 类型/接口已规划：协作、插件、故障注入、平台配置等（见 `common/types/PlatformTypes.ets` 等）
- ⏳ 需原生引擎：Ngspice、QEMU、GPU、OpenGL
- ⏳ 需商用体系：授权、计费、合规、隐私脱敏（P0）
- ⏳ 需数据扩充：Proteus 全库 500+ 器件
