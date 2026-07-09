# 生产环境必备核心模块全景

> 版本 1.0.0 | 2026-07-07  
> 本文档梳理此前架构/器件/AI/仿真/UI/存储文档中**未展开或一笔带过**、但商用交付**必须落地**的 18 大体系。  
> 与 `ARCHITECTURE.md`（七大模块总览）、`ENGINEERING_SPEC.md`（细则 ID 与验收）、`DEVICE_LIBRARY_SPEC.md`（器件三文件）配套阅读。

---

## 总览：七大模块 + 待建平台层

当前工程以 **七大 HAR + entry 壳层** 为核心。下列 18 项中，约 60% 需在 **entry 平台服务层** 或 **新增 `platform_services` HAR** 中实现，通过 `common.EventBus` 与七大模块解耦联动。

```
                    ┌─────────────────────────────────────────┐
                    │  entry（UI 壳 + 平台服务编排）              │
                    │  授权 │ 协作 │ 插件 │ 帮助 │ 无障碍 │ 性能  │
                    └────────────────────┬────────────────────┘
                                         │ AppService 门面
     ┌───────────────┬──────────┬────────┴────────┬──────────────┐
     │ schematic_    │ component│ simulation_   │ hex_debugger │
     │ editor        │ _library │ kernel        │              │
     ├───────────────┼──────────┼───────────────┼──────────────┤
     │ ai_engine     │ ai_api_  │ file_         │ instruments* │
     │               │ manager  │ persistence   │ （虚拟仪器）   │
     └───────────────┴──────────┴───────────────┴──────────────┘
                              common
                    （类型 / EventBus / 工具 / 授权门闸）

* instruments 为扩展 HAR，与 simulation_kernel 联动
```

| 图例 | 含义 |
|------|------|
| ✅ | 已有代码骨架或基础实现 |
| 🔶 | 部分落地（类型/接口有，逻辑未完整） |
| ❌ | 完全未落地 |

---

## 一、授权、激活、商业计费管控

**作用**：将产品从「个人工具」升级为可销售、可分级、可计费的商用软件；防止未授权使用高级 AI、批量仿真与企业功能。

**落地规范**

| 子项 | 规范要点 | 目标实现 |
|------|----------|----------|
| 硬件指纹 | CPU ID + 磁盘 SN + MAC → SHA256 设备码 | `common/security/HardwareFingerprint.ets` |
| 授权文件 | `license.lic`：版本、到期、功能位图、签名校验 | `common/security/LicenseManager.ets` |
| 分级权限 | 免费 / 个人专业 / 企业多终端 / 教育 | `LicenseTier` 枚举 + `FeatureGate` |
| 离线授权 | 365 天离线；到期仅锁高级功能 | 启动校验 + 定时软校验 |
| AI 用量 | 按厂商 Token / 日调用统计 | `ai_api_manager/.../QuotaTracker.ets` |
| 防破解 | 核心模块动态校验；篡改降级免费版 | `FeatureGate.assert()` 嵌入仿真/AI 入口 |

**功能黑白名单（FeatureGate 矩阵）**

| 能力 | 免费 | 专业 | 企业 |
|------|------|------|------|
| 单工程器件数 | ≤200 | 无限 | 无限 |
| 日 AI 调用 | ≤50 | 无限 | 无限 |
| STM32 高级外设 | ❌ | ✅ | ✅ |
| 蒙特卡洛 / 故障注入 | ❌ | ✅ | ✅ |
| 插件系统 | ❌ | ✅ | ✅ |
| 工程 AES 加密 | ❌ | ✅ | ✅ |
| 多人批注 / 版本对比 | ❌ | ❌ | ✅ |
| 批量 BOM 导出 | 基础 | 完整 | 完整+API |

**七大模块联动**

| 模块 | 联动方式 |
|------|----------|
| `common` | `LicenseManager`、`FeatureGate`；全局 `ERR_LICENSE_*` |
| `entry` | 激活向导、用量仪表盘、充值跳转 |
| `ai_api_manager` | 调用前 `QuotaTracker.consume()`；超额返回 `ERR_QUOTA_EXCEEDED` |
| `ai_engine` | 任务入口检查 `FeatureGate.canUseAiTask(type)` |
| `simulation_kernel` | 蒙特卡洛/故障注入前检查版本 |
| `schematic_editor` | `placeComponent` 前检查器件数上限 |
| `component_library` | 企业版解锁全库；教育版专用模板库 |
| `file_persistence` | 专业版 `encrypted: true` 工程保存 |

**状态**：❌ 类型与 ENGINEERING_SPEC §9.1 已规划；`LicenseManager.ets` 未创建。

---

## 二、多人协作、图纸批注、版本对比

**作用**：团队评审电路、追踪修改、教学批改；企业内审与外部 Git 网表协作的基础。

**落地规范**

| 子项 | 数据结构 | 存储位置 |
|------|----------|----------|
| 批注 | `Annotation`（已有 `PlatformTypes.ets`）扩展 type/status | `.schsim` 内 `annotations.json` |
| 批注类型 | 文字 / 矩形 / 箭头 / 故障标记 / 修改建议 | `AnnotationType` 枚举 |
| 绑定对象 | `targetUuid` → 器件 / 网络 / 区域 | `schematic_editor` 拾取 API |
| 快照 | `ProjectSnapshot`：拓扑 hash + 差异路径 | `snapshots/{id}.diff.json` |
| 版本对比 | `VersionDiff`：增删改器件/网络/布线 | `VersionCompareService.ets` |
| 变更日志 | `ChangeLogEntry`：操作人/时间/动作 | `changelog.json` 追加写 |
| 工程锁 | 只读 / 可编辑；`ProjectLock.ets` | `file_persistence` |

**差异化存储**：快照仅存 `topology` diff + `sim_config` 关键字段，**不复制** `wave_cache/`。

**七大模块联动**

| 模块 | 联动 |
|------|------|
| `schematic_editor` | 批注渲染层；点击批注 `focusComponent(uuid)` |
| `file_persistence` | 快照 CRUD、diff 计算、锁文件 |
| `entry` | 批注面板、版本对比 UI、PDF 导出选项 |
| `ai_engine` | 批注「修改建议」可触发 AI 诊断任务 |
| EventBus | `ANNOTATION_ADDED`、`SNAPSHOT_CREATED` |

**状态**：🔶 `PlatformTypes` 有 `Annotation`/`ProjectSnapshot`/`VersionDiff`；UI 与持久化 ❌。

---

## 三、内置插件系统

**作用**：第三方扩展 BOM 工具、自定义分析、新导入格式，无需改内核发版。

**落地规范**

| 层级 | 技术 | 沙箱 |
|------|------|------|
| 脚本插件 | Python（HarmonyOS 侧可先用 ArkTS 脚本或 JS 引擎） | 禁止 `READ_KEYS`、系统目录 |
| 原生插件 | C++/Rust NAPI | 签名验证 + 权限声明 |
| 清单 | `plugin.json`：`PluginManifest`（已有 `PluginTypes.ets`） | 启动权限弹窗 |
| 热插拔 | 加载/卸载不重启；不关闭当前工程 | `PluginRuntime.ets` |

**开放 API 面（经 `IPluginHost` 暴露）**

- 拓扑 CRUD → `ISchematicEditor` 包装
- 仿真波形 / MCU 寄存器 → `ISimulationKernel` / `IHexDebugger` 只读
- 自定义 AI 任务 → `IAiEngine.registerTaskHandler()`
- 自定义仪器 → `IVirtualInstruments` 扩展
- 导入导出 → `IFilePersistence` 注册解析器

**七大模块联动**

| 模块 | 联动 |
|------|------|
| 新增 `plugin_runtime` HAR（建议） | 沙箱、生命周期、权限 |
| `entry` | 插件管理面板、市场入口 |
| `common` | `PluginTypes.ets` 已定义 `PluginPermission` |
| 全模块 | 经 EventBus 订阅，禁止插件直接 import 实现类 |

**状态**：🔶 仅 `PluginTypes.ets`；运行时 ❌。

---

## 四、串口硬件互通、真实外设联动

**作用**：虚实结合——仿真 MCU UART 与真实硬件通信，示波器 CSV 作激励，缩短软硬件联调周期。

**落地规范**

| 能力 | 规范 |
|------|------|
| 虚拟↔物理串口 | 绑定真实 COM/tty；波特率/校验/数据位/停止位同步 |
| 双向透传 | 仿真 TX → 物理 RX；物理 TX → 仿真 RX 引脚 |
| 外部波形 | CSV 导入为激励源 → `instruments` 信号发生器 |
| 波形导出 | 仿真结果 → CSV → 外部 Python FFT 分析 |
| 日志 | UART 缓冲持久化 TXT |

**七大模块联动**

| 模块 | 联动 |
|------|------|
| `hex_debugger` | 虚拟 UART 终端；扩展 `bindPhysicalPort(portId)` |
| `simulation_kernel` | 引脚电平与串口桥同步 |
| `instruments` | 外部 CSV 激励、`exportWaveCsv` |
| `file_persistence` | 串口日志导出 |
| `entry` | 串口配置面板（`McuDebugPanel` 扩展） |

**平台枚举**：Windows `COMx` / macOS `/dev/tty.usb*` / Linux `/dev/ttyUSB*` → `SerialPortEnumerator.ets`（跨平台 Qt 路线见 ENGINEERING_SPEC §8）。

**状态**：🔶 虚拟 UART 骨架；物理串口绑定 ❌。

---

## 五、全局热更新、增量升级

**作用**：器件库/AI 模板/程序可增量更新；升级失败可回滚；企业内网离线更新。

**落地规范**

| 包类型 | 后缀 | 内容 |
|--------|------|------|
| 器件库增量 | `.devpack` | 变更 `DeviceLibrary/` 子集 + `index.lib.json` patch |
| Prompt 模板 | `.promptpack` | `ai_prompt_lib/` 变更 |
| 程序核心 | `.corepack` | HAP/HSP 或二进制 |
| 语言包 | `.i18npack` | `i18n/*.json` |
| 帮助文档 | `.docpack` | 离线 HTML |

**安全兜底**：更新前备份 AI 配置 / 自定义器件 / 布局；包 SHA256 校验；`HotUpdateInfo.rollbackAvailable`（`PlatformTypes` 已有字段）。

**七大模块联动**

| 模块 | 联动 |
|------|------|
| `entry` | 更新检查 UI、回滚入口 |
| `component_library` | `updateLibrary(devpack)` 已有目录加载能力，需扩展增量 merge |
| `ai_engine` | `PromptLoader` 热重载 |
| `file_persistence` | 备份/恢复 `AppPaths` 下配置 |
| `common` | `HotUpdateInfo`、`AppPaths` |

**状态**：❌ `HotUpdateService` 未实现；器件库目录加载 🔶。

---

## 六、内置帮助文档、教学实验模板库

**作用**：教育市场刚需；降低学习成本；离线可用。

**落地规范**

| 资源 | 路径 | 内容 |
|------|------|------|
| 离线帮助 | `entry/resources/rawfile/help/` HTML | 器件库、HEX 仿真、AI 布线、ERC 对照、API 接入 |
| 实验模板 | `DeviceLibrary/Templates/` 或 `templates/*.schsim` | 分压/滤波/74 逻辑/51 流水灯/STM32 PWM 等 |
| 模板附属 | 每模板含 HEX + `README.md` 说明 | |
| 分步教学 | 单步上电仿真阶段标记 | `simulation_kernel` 分阶段 `pauseAt(t)` |
| 知识点气泡 | 选中器件读 `meta.json` + 内置知识库 | `RagKnowledgeBase.ets` 扩展 |
| AI 答疑 | 框选局部拓扑 → `TASK_CIRCUIT_DIAG_STATIC` | `ai_engine` 已有 |

**七大模块联动**

| 模块 | 联动 |
|------|------|
| `entry` | 帮助浏览器、模板库面板、教学模式开关 |
| `file_persistence` | 模板工程一键打开 |
| `component_library` | 模板内器件 ID 校验 |
| `ai_engine` | 选中电路问答 |

**状态**：🔶 `CircuitTemplates.ets`、`RagKnowledgeBase.ets` 骨架；离线帮助与模板库 ❌。

---

## 七、无障碍、高 DPI、多显示器适配

**作用**：合规（无障碍）、高分辨率体验、工程师多屏工作流。

**落地规范**

| 能力 | 配置项（`AccessibilityConfig` 已有） |
|------|--------------------------------------|
| 全键盘操作 | `HotkeyManager` 覆盖绘图/仿真/AI |
| 高对比度 / 色弱主题 | `ThemeManager` + `ui_theme.json` |
| UI 缩放 | `uiScale` 100/125/150/200% |
| 语音朗读 | `screenReader` 开关 → 报错 TTS |
| 面板分离 | 画布/示波器/调试/AI/BOM 独立 Window |
| 布局记忆 | `ui_layout.json` 多屏坐标 |
| 高 DPI | SVG 符号矢量渲染（`DeviceLibrary` 已规范）；ArkUI 密度适配 |

**七大模块联动**

| 模块 | 联动 |
|------|------|
| `entry` | 全部 UI 面板、`ThemeManager`、`LayoutManager` |
| `schematic_editor` | 画布独立窗口、缩放 |
| `instruments` | 示波器分离窗口 |
| `hex_debugger` | 调试面板分离 |
| `component_library` | SVG 符号不受 DPI 影响 |

**状态**：🔶 `AccessibilityConfig` 类型；实现 ❌。

---

## 八、隐私安全、一键清理、数据脱敏

**作用**：商用强制项；防止 AI 上传泄露路径、密钥、固件；满足企业内审。

**落地规范**

| 规则 | 实现 |
|------|------|
| AI 上传脱敏 | `TopologySanitizer`：剔除绝对路径、私有器件名、HEX 二进制 |
| 隐私开关 | 「禁止 AI 上传拓扑」→ `ai_engine` 仅本地 `AutoWiringEngine` |
| 一键清理 | 清空：密钥缓存、波形临时、导入缓存、日志、自动备份、撤销栈 |
| 密钥内存 | `CryptoUtil` 请求时解密，用完 `zeroize()` |
| 崩溃快照 | 不含 key/HEX 原文 | `CrashSnapshot.ets` |

**七大模块联动**

| 模块 | 联动 |
|------|------|
| `ai_api_manager` | 密钥加密存储 🔶；内存擦除需加强 |
| `ai_engine` | 上传前 `TopologySanitizer.sanitize()` |
| `file_persistence` | 清理 `AppPaths` 各缓存目录 |
| `common` | `CryptoUtil`、`AppPaths`、`FileLogger` 脱敏 |
| `entry` | 隐私设置页、一键清理按钮 |

**状态**：🔶 `CryptoUtil` 存在；脱敏器与一键清理 ❌。

---

## 九、全局单位体系、数值容错、批量换算

**作用**：mil/mm 切换、用户输入容错、批量参数换算——日常绘图高频边界场景。

**落地规范**

| 能力 | 规范 |
|------|------|
| 双单位 | `LengthUnit.MIL | MM`（`PlatformTypes` 已有）；全局切换重算网格与坐标 |
| 参数解析 | `UnitParser.parse("10k")` → 归一化 `10000`；支持 `10 K`、`10KΩ`、`1e4` |
| 非法拦截 | 负电阻、超耐压 → ERC + 弹窗 `ERR_PARAM_OUT_OF_RANGE` |
| 换算面板 | 电阻/电容/电感/频率/电压批量换算 | `UnitConverter.ets` |

**七大模块联动**

| 模块 | 联动 |
|------|------|
| `common` | `UnitParser`、`UnitConverter` |
| `schematic_editor` | `ViewportState` 网格单位、`metadata.units` |
| `component_library` | `param_limit` 校验 |
| `common/ErcEngine` | 参数合法性 |
| `entry` | 换算工具面板 |

**状态**：🔶 `LengthUnit` 枚举；解析器与面板 ❌。

---

## 十、故障注入仿真

**作用**：工业调试与教学排障差异化能力；自动遍历故障 + AI 汇总。

**落地规范**

| 层级 | 内容 |
|------|------|
| 故障类型 | `FaultType` 枚举（`FaultTypes.ets` 已定义 9 类） |
| 注入实例 | `FaultInjection` 绑定 `targetInstUuid` |
| 批量扫描 | 依次注入 → 运行仿真 → 采集波形特征 |
| AI 汇总 | `FaultScanResult.aiDiagnosis` → `FaultDiagnoser` 扩展 |
| 教学模式 | 预设故障场景模板 |

**七大模块联动**

| 模块 | 联动 |
|------|------|
| `simulation_kernel` | 注入修改网表/行为模型参数 |
| `ai_engine` | `FaultDiagnoser` 批量分析 |
| `schematic_editor` | 故障标记可视化 |
| `entry` | 故障注入面板 |
| `common` | `FaultTypes.ets` ✅ |

**权限**：需 `FeatureGate` 专业版及以上。

**状态**：🔶 类型已定义；注入引擎与 UI ❌。

---

## 十一、打印与工业图纸输出

**作用**：生产出图、归档、黑白制版——对标 Proteus 打印能力。

**落地规范**

| 能力 | `PrintConfig`（`PlatformTypes` 已有）扩展 |
|------|------------------------------------------|
| 纸张 | A2/A3/A4、横/纵、页边距 mm |
| 模式 | 彩色 / 黑白工程 / 制版极简（隐文字） |
| 页眉页脚 | 工程名、版本、设计师、日期、页码 |
| PDF 分层 | 布线层 / 器件层 / 注释层 独立导出 |
| 子电路 | 批量打印多页 |

**七大模块联动**

| 模块 | 联动 |
|------|------|
| `schematic_editor` | 渲染层分离、打印预览 |
| `entry` | 打印对话框 |
| `file_persistence` | PDF/PNG 导出（ENGINEERING_SPEC §7.2） |

**状态**：🔶 `PrintConfig` 类型；打印服务 ❌。

---

## 十二、跨平台统一底层适配

**作用**：HarmonyOS 为主平台，Windows/macOS/Linux（Qt6）扩展时路径、代理、串口、打包一致。

**落地规范**

| 项 | 规范 |
|----|------|
| 路径 | 统一 `AppPaths`，禁止硬编码分隔符 |
| 代理 | 三级：单 API > 全局 > 系统（`ProxyConfig` 已有） |
| 串口枚举 | 平台特定 `SerialPortEnumerator` |
| 依赖检测 | 首次启动检测 OpenGL/串口/字体 |
| 打包 | HAP（主）/ NSIS exe / DMG / AppImage |

**七大模块联动**

| 模块 | 联动 |
|------|------|
| `common` | `AppPaths`、`ProxyConfig` |
| `ai_api_manager` | 代理注入 HTTP 客户端 |
| `entry` | 首次运行向导 |
| 构建 CI | `build-profile.json5`、多 target |

**状态**：❌ `AppPaths` 未创建；HarmonyOS 主平台 ✅。

---

## 十三、性能监控与调试诊断面板

**作用**：用户定位卡顿；开发优化 Ngspice/MCU/AI 瓶颈。

**落地规范**

| 指标 | 数据源 |
|------|--------|
| 分线程 CPU | UI / Ngspice Worker / MCU / AI |
| 内存明细 | 器件缓存、波形 LRU、固件、AI 缓存 |
| AI 统计 | 日请求数、平均延迟、失败率 |
| 仿真效率 | 仿真秒/墙钟秒、SPICE 迭代耗时 |

**目标**：`entry/.../PerfMonitorPanel.ets` + `common/.../PerfProbe.ets`。

**七大模块联动**：各模块实现 `getPerfSnapshot(): PerfSnapshot`；`entry` 聚合刷新 ≤1s。

**状态**：❌

---

## 十四、全局热重载机制

**作用**：提升迭代与运维体验，减少重启。

| 对象 | 热重载入口 | 模块 |
|------|------------|------|
| 器件库 | `DeviceLibraryLoader.loadAll()` | `component_library` |
| AI Prompt | `PromptLoader.reload()` | `ai_engine` 🔶 |
| 插件 | `PluginRuntime.reload(id)` | 待建 |
| 主题/快捷键 | 文件监视 `ui_theme.json` / `hotkey.cfg` | `entry` |

**EventBus**：`HOT_RELOAD_COMPLETED` 通知 UI 刷新。

**状态**：🔶 器件库加载器、PromptLoader 可扩展；文件监视 ❌。

---

## 十五、开源第三方组件合规

**作用**：商用法律必备；GPL 隔离；企业内审导出。

**落地规范**

- `entry/resources/rawfile/THIRD_PARTY_LICENSES.md`
- 关于页 `AboutPanel.ets` 展示
- 强 GPL（Ngspice）进程隔离或动态链接方案文档化
- 菜单「导出合规报告」→ PDF/ZIP

**七大模块联动**：`entry` 展示；`common` 维护依赖清单常量。

**状态**：❌

---

## 十六、全局快捷键、自定义热键

**作用**：对标 Proteus 默认键位；绘图/仿真双模式；可导入导出配置。

**落地规范**

- `hotkey.cfg` JSON：`{ action, keys[], mode: "draw"|"sim" }`
- `HotkeyManager.ets`：冲突检测、注册、持久化
- `HotkeyDefaults.ets`：Proteus 对标表

**七大模块联动**

| 模块 | 联动 |
|------|------|
| `entry` | 全局键监听、配置面板 |
| `schematic_editor` | 绘图模式快捷键 |
| `simulation_kernel` | 仿真模式快捷键（空格=运行/暂停） |

**状态**：❌（ENGINEERING_SPEC §5.4）

---

## 十七、网络代理与离线模式

**作用**：企业内网、断网实验室、多 API 容灾。

**落地规范**（`ProxyConfig` 已有）

| 优先级 | 来源 |
|--------|------|
| 1 | 单 AI 接口 `AiApiConfig.proxy` |
| 2 | 软件全局 `globalProxy` |
| 3 | 系统代理 `systemProxy: true` |
| 离线模式 | `offlineMode: true` → 仅 Ollama；云端 API 禁用 |
| 重试 | 3 次超时 → 备用 Key → 本地 Ollama |
| 网络日志 | `ai_api_manager` 连接/超时/429 记录面板 |

**七大模块联动**：`ai_api_manager` 核心；`ai_engine` 感知离线降级。

**状态**：🔶 类型；逻辑 ❌。

---

## 十八、崩溃守护、三重故障恢复

**作用**：仿真卡死不死进程；崩溃丢数据最小化；工程损坏分级修复。

**落地规范**

| 层级 | 机制 |
|------|------|
| 守护 | 仿真 Worker 超时 → 终止仿真线程，保存工程 |
| 内存快照 | 定时 `auto_backup/`；崩溃后恢复向导 |
| 分级修复 | 波形丢→清空 cache；网络丢→补空+ERC；拓扑坏→选备份 |
| 锁清理 | 陈旧 `ProjectLock` 启动扫描 |

**七大模块联动**

| 模块 | 联动 |
|------|------|
| `file_persistence` | `recovery_*.schsim`、`CrashSnapshot`、`ProjectLock` 🔶 |
| `simulation_kernel` | Worker 化、可终止 |
| `entry` | 恢复对话框 |

**状态**：🔶 自动保存基础；守护进程与分级修复 ❌。

---

## 模块—体系对照总表

| 生产体系 | 主责 | 协作者 | 状态 |
|----------|------|--------|------|
| ① 授权计费 | `common` | entry, ai_api_manager, 全模块门闸 | ✅ 已落地 |
| ② 协作批注版本 | `file_persistence` | schematic_editor, entry | ✅ 已落地 |
| ③ 插件系统 | 新 `plugin_runtime` | 全模块 API 宿主 | 🔶 |
| ④ 虚实串口 | `hex_debugger` | simulation_kernel, instruments | 🔶 |
| ⑤ 热更新 | `entry` | component_library, ai_engine | ❌ |
| ⑥ 帮助与模板 | `entry` | file_persistence, ai_engine | 🔶 |
| ⑦ 无障碍多屏 | `entry` | schematic_editor, instruments | 🔶 |
| ⑧ 隐私脱敏 | `common` | ai_engine, ai_api_manager | 🔶 |
| ⑨ 单位换算 | `common` | schematic_editor, ErcEngine | 🔶 |
| ⑩ 故障注入 | `simulation_kernel` | ai_engine, common | 🔶 |
| ⑪ 打印出图 | `entry` | schematic_editor, file_persistence | 🔶 |
| ⑫ 跨平台 | `common` | 构建/CI | ❌ |
| ⑬ 性能监控 | `entry` | 全模块探针 | ❌ |
| ⑭ 热重载 | 各资源模块 | EventBus | 🔶 |
| ⑮ 开源合规 | `entry` | — | ❌ |
| ⑯ 快捷键 | `entry` | schematic_editor, simulation_kernel | ❌ |
| ⑰ 代理离线 | `ai_api_manager` | ai_engine | 🔶 |
| ⑱ 崩溃恢复 | `file_persistence` | simulation_kernel, entry | 🔶 |

---

## 推荐新增 HAR（平台层扩展）

为避免 `entry` 膨胀，建议 Phase 2 拆分：

| HAR | 职责 |
|-----|------|
| `platform_services` | LicenseManager、FeatureGate、AppPaths、HotUpdate、ProjectLock |
| `plugin_runtime` | 插件沙箱、IPluginHost、权限 |
| `collaboration` | 批注、快照、版本 diff、changelog |

均只依赖 `common`，经 `AppService` 与七大模块编排。

---

## 实施优先级（在 ENGINEERING_SPEC P0–P3 之上）

```
P0 商用阻塞
  ├── ① LicenseManager + FeatureGate
  ├── ⑧ TopologySanitizer + 密钥内存擦除
  ├── ⑱ 崩溃快照 + 分级修复（加强现有 auto_backup）
  └── ⑤ 器件库 .devpack 增量更新

P1 团队/教育
  ├── ② 批注 + 快照 diff
  ├── ⑥ 模板库 + 离线帮助
  └── ⑪ PDF 打印基础

P2 差异化
  ├── ⑩ 故障注入引擎
  ├── ④ 物理串口绑定
  └── ③ 脚本插件 MVP

P3 体验与合规
  ├── ⑦ 无障碍 + 多显示器布局
  ├── ⑬ 性能面板
  ├── ⑮ 开源合规清单
  ├── ⑯ 快捷键系统
  └── ⑫ Qt 跨平台打包
```

---

## 与现有文档关系

| 文档 | 关系 |
|------|------|
| `ARCHITECTURE.md` | 七大模块总览；本文档为其**生产扩展层** |
| `ENGINEERING_SPEC.md` | 细则 ID、验收表、文件路径；本文档为其**业务域归类** |
| `DEVICE_LIBRARY_SPEC.md` | 器件三文件；支撑 ⑤⑥⑭ |
| `DEVELOPMENT_SCHEDULE.md` | 排期；应将本文档 P0–P3 并入 Sprint |

---

## 已有类型骨架索引（`common/src/main/ets/types/`）

| 文件 | 覆盖体系 |
|------|----------|
| `PlatformTypes.ets` | ②⑦⑨⑪⑫⑭⑰ |
| `FaultTypes.ets` | ⑩ |
| `PluginTypes.ets` | ③ |
| `DeviceLibraryTypes.ets` | ⑤⑥⑭ |
| `AiExtendedTypes.ets` | ①⑧（Quota 待扩展） |

> 上述类型需在 `common/Index.ets` 统一导出，供各 HAR 引用。

---

*缺少上述任意 P0/P1 项，产品仍可作为个人原型运行；补齐后方可达到对标 Proteus 的工业级商用标准。*
