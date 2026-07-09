# AI-SCH 完整规格落地对照表（20 大类）

> 状态说明：**已实现** = ArkTS 代码可调用；**骨架** = 接口/占位逻辑，需 Native/后续迭代；**待Native** = 需 NAPI/Python/硬件驱动

---

## 一、虚拟仪器面板（对标 Proteus）

| 功能 | 状态 | 代码位置 |
|------|------|----------|
| 四通道示波器：时基/电压/耦合/触发/游标/捕获/数学通道/FFT | **已实现** | `features/instruments/engines/OscilloscopeEngine.ets` |
| 逻辑分析仪：8/16/32 通道、阈值、UART/I2C/SPI/CAN 解码 | **已实现** | `features/instruments/engines/LogicAnalyzerEngine.ets` |
| 虚拟万用表：DC/AC/电阻/电流、自动量程 | **已实现** | `features/instruments/engines/MultimeterEngine.ets` |
| 信号源：多波形、Burst、参数控制 | **已实现** | `features/instruments/engines/SignalGeneratorEngine.ets` |
| 串口终端：HEX 收发、定时脚本、日志导出 | **已实现** | `features/instruments/engines/UartTerminalEngine.ets` |
| UI 控制面板 | **已实现** | `entry/components/InstrumentPanel.ets` |

---

## 二、单片机仿真边界场景

| 功能 | 状态 | 代码位置 |
|------|------|----------|
| IO 模式（推挽/开漏/高阻/上下拉） | **骨架** | `hex_debugger/engines/McuBehaviorSimulator.ets` |
| 时钟 HSI/HSE/PLL/晶振失效 | **骨架** | `McuBehaviorSimulator.setClockSource()` |
| 中断优先级排队、ISR 过长检测 | **骨架** | `McuBehaviorSimulator.processInterruptQueue()` |
| Flash/SRAM 越界、I2C EEPROM 时序 | **待Native** | 需 QEMU-MCU / 8051 内核扩展 |
| 复位 POR/IWDG/WWDG/LVR | **骨架** | `McuBehaviorSimulator.applyReset()` |
| 8051 指令级仿真 | **已实现（子集）** | `hex_debugger/engines/Mcu8051Core.ets` |

---

## 三、ERC 深度规则

| 功能 | 状态 | 代码位置 |
|------|------|----------|
| 静态 ERC：电源/引脚/参数细分规则 | **已实现** | `common/utils/DeepErcEngine.ets` |
| 动态 ERC：过压/饱和/总线冲突/不起振 | **已实现** | `common/utils/DynamicErcEngine.ets` |
| 编辑器集成 DeepErc | **已实现** | `SchematicEditorImpl.runERC()` |
| 仿真步进动态 ERC | **已实现** | `SimulationKernelImpl.step()` |

---

## 四、插件扩展系统

| 功能 | 状态 | 代码位置 |
|------|------|----------|
| 插件目录结构规范 | **已实现（文档+接口）** | `Plugins/` 约定于 `PluginTypes.ets` |
| 插件 API（拓扑/波形/AI Prompt/仪器/导入导出） | **骨架** | `plugin_system/PluginManagerImpl.ets` |
| 沙箱/权限/签名校验/热重载 | **骨架** | `PluginManagerImpl` |
| Python 脚本插件 | **待Native** | 需嵌入式 Python 或外部进程 |

---

## 五、打印与图纸标准化

| 功能 | 状态 | 代码位置 |
|------|------|----------|
| 页面设置 A4/A3/A2、彩色/黑白/制版 | **骨架** | `PlatformTypes.PrintConfig` + `PlatformSettingsPanel` |
| 分层打印、页眉页脚、PDF 分层 | **待Native** | 需 PDF/Canvas 渲染引擎 |

---

## 六、多版本工程迭代

| 功能 | 状态 | 代码位置 |
|------|------|----------|
| 版本快照、变更日志 | **已实现** | `file_persistence/platform/CrashGuard.ets` → `VersionManager` |
| 版本对比 diff | **已实现** | `VersionManager.compare()` |
| Git 联动导出网表 | **骨架** | `SimulationKernelImpl.generateSpiceNetlistFromTopo()` |

---

## 七、性能优化

| 功能 | 状态 | 代码位置 |
|------|------|----------|
| 视口外器件剔除 | **骨架** | `common/utils/PerformanceOptimizer.ets` |
| 仿真冻结网络/自适应步长 | **骨架** | `PerformanceOptimizer.adaptiveStepSize()` |
| AI 结果缓存 | **已实现** | `ai_engine/AiResultCache.ets` |
| 波形视口分块 | **骨架** | `PerformanceOptimizer.waveViewportSlice()` |
| 万器件 OpenGL 渲染 | **待Native** | 需 GPU 渲染层 |

---

## 八、网络代理与离线模式

| 功能 | 状态 | 代码位置 |
|------|------|----------|
| 三级代理优先级 | **已实现** | `ai_api_manager/NetworkModeManager.ets` |
| 离线模式开关 | **已实现** | `NetworkModeManager` + `PlatformSettingsPanel` |
| 网络故障分级重试/切换/降级 | **骨架** | `NetworkModeManager.handleNetworkFailure()` |

---

## 九、用户权限与协作

| 功能 | 状态 | 代码位置 |
|------|------|----------|
| 工程只读/读写标记 | **骨架** | `PlatformTypes` + `VersionManager.logChange()` |
| 图纸批注、PDF 导出批注 | **骨架** | `PlatformTypes.Annotation` |
| 操作痕迹记录 | **已实现** | `VersionManager.logChange()` |

---

## 十、单位与数值解析

| 功能 | 状态 | 代码位置 |
|------|------|----------|
| 10k / 10KΩ / 1e-6F 容错 | **已实现** | `common/utils/UnitParser.ets` |
| 非法参数拦截 | **骨架** | `UnitParser.validateParam()` |
| mil/mm 全局切换 | **骨架** | `UnitParser` + `LengthUnit` |

---

## 十一、故障注入仿真

| 功能 | 状态 | 代码位置 |
|------|------|----------|
| 无源/半导体/MCU 故障注入 | **已实现** | `simulation_kernel/engines/FaultInjectionEngine.ets` |
| 批量故障遍历 + AI 汇总 | **已实现** | `FaultInjectionEngine.batchScan()` |
| UI 故障面板 | **已实现** | `entry/components/FaultInjectionPanel.ets` |

---

## 十二、教学辅助模块

| 功能 | 状态 | 代码位置 |
|------|------|----------|
| 分步上电仿真 | **已实现** | `ai_engine/TeachingService.stepPowerOnSequence()` |
| 知识点悬浮提示 | **已实现** | `TeachingService.getKnowledgeTip()` |
| 实验模板库 | **已实现** | `TeachingService.listTemplates()` |
| AI 答疑 | **已实现** | `TeachingPanel` + `TeachingService.buildAiQuestion()` |

---

## 十三、硬件外设联动

| 功能 | 状态 | 说明 |
|------|------|------|
| 仿真串口 ↔ 真实 COM | **待Native** | 需 `@ohos.serial` 或平台驱动 |
| 波形导出 Python 分析 | **已实现** | `ExportPostProcessor.waveCsvWithHeader()` |
| 外接信号发生器同步 | **待Native** | 需 VISA/SCPI 驱动 |

---

## 十四、安全兜底

| 功能 | 状态 | 代码位置 |
|------|------|----------|
| 定时内存快照 | **已实现** | `CrashGuard.enable()` |
| 守护进程/关机拦截 | **待Native** | 需系统级 Service Extension |
| 密钥内存清理 | **骨架** | `CrashGuard.clearSensitiveData()` |
| 工程文件校验码 | **骨架** | `VersionManager.checkFileIntegrity()` |

---

## 十五、热更新与版本升级

| 功能 | 状态 | 代码位置 |
|------|------|----------|
| 增量更新/回滚/更新弹窗 | **骨架** | `PlatformTypes.HotUpdateInfo` |

---

## 十六、无障碍交互

| 功能 | 状态 | 代码位置 |
|------|------|----------|
| 高对比度/键盘全操作/DPI/语音朗读 | **骨架** | `PlatformSettingsPanel` + `AccessibilityConfig` |

---

## 十七、数据导出后处理

| 功能 | 状态 | 代码位置 |
|------|------|----------|
| BOM 去重合并 | **已实现** | `ExportPostProcessor.mergeBom()` |
| 波形 CSV 表头 | **已实现** | `ExportPostProcessor.waveCsvWithHeader()` |
| SPICE 剔除虚拟仪器 | **已实现** | `ExportPostProcessor.spiceNetlistFilter()` |
| 自动时间戳命名 | **已实现** | `ExportPostProcessor.autoFileName()` |

---

## 十八、热重载机制

| 功能 | 状态 | 代码位置 |
|------|------|----------|
| 器件库热重载 | **骨架** | `ComponentLibraryImpl.reloadLibrary()` |
| Prompt 热重载 | **骨架** | `ai_engine/prompts/PromptLoader.ets` |
| 插件热插拔 | **骨架** | `PluginManagerImpl.hotReload()` |

---

## 十九、多显示器适配

| 功能 | 状态 | 说明 |
|------|------|------|
| 多窗口分离/布局保存/高 DPI | **待Native** | HarmonyOS 多窗口 API + 布局持久化 |

---

## 二十、验收测试用例

| 类别 | 状态 | 位置 |
|------|------|------|
| 边界电路/极端参数/异常文件 | **骨架** | `entry/src/ohosTest/` 待补充 |
| AI 极限/跨平台一致性 | **骨架** | 需 CI 矩阵 |

---

## 模块依赖总览

```
entry
 ├── common (类型/ERC/UnitParser/Export/Performance)
 ├── schematic_editor (DeepErcEngine)
 ├── simulation_kernel (DynamicErc + FaultInjection)
 ├── hex_debugger (McuBehaviorSimulator)
 ├── ai_engine (TeachingService + AiResultCache)
 ├── ai_api_manager (NetworkModeManager)
 ├── file_persistence (CrashGuard + VersionManager)
 ├── instruments (VirtualInstrumentsImpl)
 └── plugin_system (PluginManagerImpl)
```

## 下一步建议（P0）

1. **Native 层**：Ngspice NAPI、QEMU-MCU STM32、OpenGL 大画布
2. **测试**：补充 `ohosTest` 验收用例（第 20 节）
3. **硬件**：COM 口双向桥接、VISA 仪器驱动
4. **协作**：批注 UI + 只读权限持久化到工程文件
