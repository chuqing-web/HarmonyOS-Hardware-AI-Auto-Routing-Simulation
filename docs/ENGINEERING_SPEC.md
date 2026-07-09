# AI-SCH 仿真器 — 全维度工程落地规范

> 版本 2.1.0 | 基于七大模块 + 器件三文件规范 + API 接口文档  
> 平台主目标：**HarmonyOS NEXT 5.0+**（PC 2in1 / 平板）  
> 跨平台扩展：Windows / macOS / Linux（Qt6 路线，见 §八）  
> 状态图例：`✅` 已落地 · `🔶` 部分落地 · `❌` 待落地

---

## 文档索引

| 章节 | 主题 | 主责模块 |
|------|------|----------|
| §一 | 工程文件与存储底层 | `file_persistence` + `common` |
| §二 | 日志 / 报错 / 调试 | `common` + `entry` |
| §三 | 仿真内核底层 | `simulation_kernel` + `hex_debugger` |
| §四 | AI 引擎与安全调度 | `ai_engine` + `ai_api_manager` |
| §五 | 原理图编辑器交互 | `schematic_editor` + `entry` |
| §六 | 器件库全生命周期 | `component_library` + `DeviceLibrary/` |
| §七 | 导入导出兼容 | `file_persistence` |
| §八 | 跨平台部署打包 | 构建脚本 / CI |
| §九 | 权限 / 授权 / 合规 | `common` + `entry` |
| §十 | 多语言与辅助工具 | `entry` + `common` |
| §十一 | 异常容错与崩溃恢复 | 全模块 |
| §十二 | 性能监控面板 | `entry` + 各模块探针 |
| §十三 | 最终验收清单 | QA |

---

## §一、工程文件与存储底层细节

### 1.1 自有工程格式 `.schsim` ZIP 打包规范

| ID | 细则 | 状态 | 目标文件 | 落地标准 |
|----|------|------|----------|----------|
| 1.1.1 | ZIP 容器封装，后缀 `.schsim` | ❌ | `features/file_persistence/src/main/ets/archive/SchsimArchive.ets` | 保存/加载走 ZIP API；解压后目录结构符合下表；单测覆盖 round-trip |
| 1.1.2 | 内部 `topology.json` | 🔶 | `common/src/main/ets/types/TopologyTypes.ets` | `SchTopology` 完整序列化；与 `SchematicDocument` 双向转换经 `TopologyAdapter` |
| 1.1.3 | 内部 `sim_config.json` | 🔶 | `common/src/main/ets/types/SimExtendedTypes.ets` | 含 `SimulationConfig` 全字段；缺省用 `DEFAULT_SIM_CONFIG` |
| 1.1.4 | 内部 `ai_route_cache.json` | ❌ | `features/ai_engine/src/main/ets/cache/RouteCache.ets` | 打开工程命中缓存则跳过 AI 布线；缓存带 `topologyHash` |
| 1.1.5 | 内部 `wave_cache/` | ❌ | `features/simulation_kernel/src/main/ets/cache/WaveCache.ets` | 二进制帧格式：`[header][float64[]]`；按 netId 分文件 |
| 1.1.6 | 内部 `sub_circuits/` | 🔶 | `file_persistence/.../SchsimArchive.ets` | 子电路独立 `.schsim` 片段或 JSON；引用 `subCircuitId` |
| 1.1.7 | 内部 `mcu_firmware_cache/` | ❌ | `features/hex_debugger/src/main/ets/FirmwareCache.ets` | HEX 副本 SHA256 校验；支持内嵌/外链两种模式 |
| 1.1.8 | 内部 `erc_history.json` | ❌ | `common/src/main/ets/utils/ErcEngine.ets` | 每次 ERC 追加记录；含时间戳、违规列表 |
| 1.1.9 | 内部 `ui_view_state.json` | ❌ | `features/schematic_editor/.../ViewportState` | 持久化 zoom/pan/探针可见性/选中层 |
| 1.1.10 | 根级 `manifest.json` | ❌ | `file_persistence/.../SchsimManifest.ets` | 含 `schema_version`、`storage_mode`、`created_at` |

**ZIP 目录结构（强制）：**

```
project.schsim (ZIP)
├── manifest.json           # schema_version, name, storage_mode, encrypted
├── topology.json
├── sim_config.json
├── ai_route_cache.json     # 可选
├── erc_history.json        # 可选
├── ui_view_state.json      # 可选
├── wave_cache/
│   └── {netId}.wavebin
├── sub_circuits/
│   └── {subId}.json
└── mcu_firmware_cache/
    └── {mcuRefDes}.hex
```

**代码规范：**

```typescript
// SchsimManifest.ets
export interface SchsimManifest {
  schema_version: string;        // semver，当前 "2.0.0"
  project_name: string;
  storage_mode: 'embedded' | 'external_ref';
  encrypted: boolean;            // 商用版 AES
  created_at: string;            // ISO8601
  modified_at: string;
  external_refs?: ExternalRef[]; // storage_mode=external_ref 时必填
}

export interface ExternalRef {
  kind: 'hex' | 'wave' | 'sub_circuit';
  internal_path: string;
  absolute_path: string;       // 用户机器路径，换机需重定位
}
```

| ID | 细则 | 状态 | 落地标准 |
|----|------|------|----------|
| 1.1.11 | 内嵌模式 | ❌ | 所有资源写入 ZIP；便携单文件；验收：拷贝后另一台可开 |
| 1.1.12 | 外部引用模式 | ❌ | 大文件仅存路径；保存时弹窗确认；缺失外链弹 `ERR_FILE_NOT_FOUND` |
| 1.1.13 | `schema_version` 兼容 | 🔶 | 当前仅 `version: "1.0.0"` 平铺 JSON；需迁移器 `SchemaMigrator.ets` |
| 1.1.14 | 低版本打开高版本工程 | ❌ | 弹窗 WARN；丢弃未知字段；写迁移日志 |
| 1.1.15 | 商用 AES 加密 | ❌ | `CryptoUtil` 升级 AES-256-CBC；免费版 `encrypted: false` |

> **现状说明**：`FilePersistenceImpl.ets` 当前为**明文单 JSON**，非 ZIP。迁移路径：读取旧 JSON → 写入新 ZIP 包。

---

### 1.2 全局缓存目录分层规范

HarmonyOS 路径映射（替代 `%AppData%/AISchSim/`）：

| 规范路径 | HarmonyOS 实现 | 状态 | 目标文件 |
|----------|----------------|------|----------|
| `ai_config/ai_api_encrypt.bin` | `filesDir/AISchSim/ai_config/` | ❌ | `common/.../AppPaths.ets` |
| `device_lib_cache/` | `cacheDir/AISchSim/device_lib_cache/` | ❌ | `component_library/.../ThumbnailCache.ets` |
| `auto_backup/` | `filesDir/AISchSim/auto_backup/` | 🔶 | 现有 `schsim_recovery/` 需迁移 |
| `temp_sim_wave/` | `cacheDir/AISchSim/temp_sim_wave/` | ❌ | `simulation_kernel/.../WaveCache.ets` |
| `user_log/` | `filesDir/AISchSim/user_log/` | ❌ | `common/.../FileLogger.ets` |
| `import_temp/` | `cacheDir/AISchSim/import_temp/` | ❌ | `file_persistence/.../ImportTemp.ets` |
| `local_ollama_model_cache/` | `filesDir/AISchSim/ollama/` | ❌ | `ai_api_manager/.../OllamaProbe.ets` |

**`AppPaths.ets` 规范：**

```typescript
export class AppPaths {
  static init(context: Context): void { /* 绑定 filesDir / cacheDir */ }
  static aiConfigDir(): string;
  static deviceLibCache(): string;
  static autoBackup(): string;
  static tempSimWave(): string;
  static userLog(): string;
  static importTemp(): string;
  static ollamaCache(): string;
}
```

| ID | 细则 | 状态 | 落地标准 |
|----|------|------|----------|
| 1.2.1 | 启动时创建缺失目录 | ❌ | `EntryAbility.onCreate` 调用 `AppPaths.ensureAll()` |
| 1.2.2 | 7 天自动清理临时目录 | ❌ | `CacheCleaner.ets` 每日首次启动扫描 `mtime` |
| 1.2.3 | 清理范围 | ❌ | `temp_sim_wave/`、`import_temp/`；不清理 `auto_backup/` |
| 1.2.4 | 磁盘配额告警 | ❌ | 缓存总量 > 2GB 弹 WARN |

---

### 1.3 文件锁与多开冲突

| ID | 细则 | 状态 | 目标文件 | 落地标准 |
|----|------|------|----------|----------|
| 1.3.1 | `.schsim.lock` 锁文件 | ❌ | `file_persistence/.../ProjectLock.ets` | 打开写锁；内容含 PID、主机名、打开时间 |
| 1.3.2 | 重复打开提示 | ❌ | `entry/.../Index.ets` | 弹窗三选项：取消 / 只读 / 强制（慎用） |
| 1.3.3 | 只读模式 | ❌ | `ISchematicEditor` 增 `setReadOnly(bool)` | 禁用保存、布线、参数修改 |
| 1.3.4 | 崩溃锁清理 | ❌ | `ProjectLock.ets` | 启动扫描 stale lock（PID 不存在则删） |
| 1.3.5 | 正常关闭释放锁 | ❌ | `EntryAbility.onDestroy` | 必须 `finally` 释放 |

**锁文件格式：**

```json
{
  "pid": 12345,
  "host": "device-name",
  "opened_at": "2026-07-07T08:00:00Z",
  "app_version": "2.1.0"
}
```

---

## §二、全局日志、报错、调试信息体系

### 2.1 日志分级标准

| 级别 | 用途 | 状态 | 目标文件 |
|------|------|------|----------|
| TRACE | 细粒度调试（默认关闭） | ❌ | `common/.../Logger.ets` |
| DEBUG | 开发调试 | ❌ | 同上 |
| INFO | 正常操作 | 🔶 | 现有仅 `info/warn/error` |
| WARN | 可恢复异常 | 🔶 | 同上 |
| ERROR | 操作失败 | 🔶 | 同上 |
| FATAL | 致命，触发保存退出 | ❌ | 同上 + `CrashHandler.ets` |

| ID | 记录域 | 状态 | 日志字段规范 |
|----|--------|------|--------------|
| 2.1.1 | 画布操作 | ❌ | `module=editor action=place_component refDes=U1` |
| 2.1.2 | 仿真行为 | ❌ | `module=sim action=start step=1e-6 time=0.001` |
| 2.1.3 | HEX 解析 | 🔶 | `HexParser` 需补全 path、checksum、loadAddr |
| 2.1.4 | AI 调用 | ❌ | `provider, latencyMs, tokens, statusCode`；**禁止记录 key** |
| 2.1.5 | 文件 IO | ❌ | `op=import format=proteus path_hash=xxx` |
| 2.1.6 | 器件库 | ❌ | `lib_dev_id, error=ERR_MODEL_MISS` |

**`Logger.ets` 升级规范：**

```typescript
export enum LogLevel { TRACE=0, DEBUG=1, INFO=2, WARN=3, ERROR=4, FATAL=5 }

export class Logger {
  static configure(opts: { level: LogLevel; persist: boolean }): void;
  static trace(module: string, msg: string, fields?: Record<string, string>): void;
  // ... DEBUG ~ FATAL 同理
  static exportLogs(destPath: string): Promise<Result<void>>;
  static clearLogs(): Promise<Result<void>>;
}
```

---

### 2.2 日志持久化规则

| ID | 细则 | 状态 | 落地标准 |
|----|------|------|----------|
| 2.2.1 | 按天分割 `log_YYYY-MM-DD.log` | ❌ | `FileLogger` 自动切换日期 |
| 2.2.2 | 单文件 20MB 分卷 | ❌ | 达上限创建 `.1.log`、`.2.log` |
| 2.2.3 | 导出 / 清空 | ❌ | 设置面板按钮；清空需二次确认 |
| 2.2.4 | 仿真崩溃快照 | ❌ | `CrashSnapshot.ets` 写 `auto_backup/crash_{ts}/` |
| 2.2.5 | 日志脱敏 | ❌ | 路径替换为 `~/***`；key 用 `CryptoUtil.maskKey` |

**崩溃快照内容：**

```
crash_20260707_160000/
├── topology.json
├── sim_config.json
├── last_wave_sample.json   # 最近 1000 采样点
└── crash_meta.json         # 异常栈、版本号
```

---

### 2.3 全局统一弹窗错误提示

| ID | 弹窗类型 | 状态 | 目标文件 | 落地标准 |
|----|----------|------|----------|----------|
| 2.3.1 | INFO 提示框 | ❌ | `entry/.../DialogService.ets` | 绿色图标；3s 可自动关闭 |
| 2.3.2 | WARN 警告框 | ❌ | 同上 | 黄色；需用户确认 |
| 2.3.3 | ERROR 错误弹窗 | 🔶 | `ErrCode.ets` 有文案；无统一 UI | 红色；展示 `errCodeMessage` + 建议操作 |
| 2.3.4 | FATAL 致命弹窗 | ❌ | `DialogService` + `CrashHandler` | 自动保存 → 倒计时退出 |

**`ErrCode` 扩展规范（`common/.../ErrCode.ets`）：**

```typescript
export enum ErrCode {
  // 现有 0-14 保留
  ERR_SCHEMA_VERSION = 15,
  ERR_PROJECT_LOCKED = 16,
  ERR_SIM_CRASH = 17,
  ERR_LICENSE_INVALID = 18,
  ERR_OOM = 19,
  // ...
}

export enum DialogSeverity { INFO, WARN, ERROR, FATAL }

export interface ErrDialogSpec {
  code: ErrCode;
  severity: DialogSeverity;
  titleKey: string;      // i18n key
  messageKey: string;
  actionHintKey?: string;
}
```

每个 `ErrCode` 必须在 `ERR_DIALOG_MAP` 注册 severity 与 i18n key。

---

## §三、仿真内核底层补充落地细节

### 3.1 多线程调度规则

| ID | 细则 | 状态 | 目标文件 | 落地标准 |
|----|------|------|----------|----------|
| 3.1.1 | UI 主线程不阻塞仿真 | 🔶 | `SimulationKernelImpl.ets` | 仿真 `Worker` / `TaskPool`；UI 仅收 `SIMULATION_STEP` 事件 |
| 3.1.2 | 线程1：Ngspice 模拟 | ❌ | `engines/AnalogEngine.ets` → NAPI | 替换当前简化求解 |
| 3.1.3 | 线程2：数字逻辑 | 🔶 | `engines/DigitalEngine.ets` | 事件队列独立循环 |
| 3.1.4 | 线程3：MCU 指令 | 🔶 | `hex_debugger/Mcu8051Core.ets` | 与调度器解耦 |
| 3.1.5 | 线程4：波形采样 | ❌ | `engines/WaveSampler.ets` | 异步写 `wave_cache` |
| 3.1.6 | AI 独立线程池 | ❌ | `ai_engine/.../AiTaskPool.ets` | 并发上限可配置，默认 3 |
| 3.1.7 | 拓扑读写锁 | ❌ | `common/.../RwLock.ets` | 仿真中 `readLock`；编辑前检查 `ERR_SIM_BUSY` |

**互斥规范：**

```typescript
// SimulationKernelImpl
async startSimulation(): Promise<Result<void>> {
  if (!this.topologyLock.tryReadLock()) return err(ErrCode.ERR_SIM_BUSY);
  // 发布 SIMULATION_STARTED；Worker 内循环 step
}
```

---

### 3.2 内存管控机制

| ID | 细则 | 状态 | 落地标准 |
|----|------|------|----------|
| 3.2.1 | 闲置子电路冻结 | ❌ | 无活动节点的子矩阵不分配；解冻有事件触发 |
| 3.2.2 | 波形缓存上限 128MB | ❌ | `WaveCache` 配置项；LRU 淘汰 |
| 3.2.3 | MCU 内存即时释放 | 🔶 | `unloadHex()` 必须清空 Flash/SRAM 缓冲区 |
| 3.2.4 | 最小化降采样 | ❌ | 监听窗口状态；采样率 ×0.25 |

---

### 3.3 数值精度与单位统一

| ID | 细则 | 状态 | 目标文件 | 落地标准 |
|----|------|------|----------|----------|
| 3.3.1 | SI 底层单位 | 🔶 | `common/.../UnitConverter.ets`（新建） | V/A/s/Ω/F/H 内部一律 SI |
| 3.3.2 | 界面格式化 | ❌ | `UnitFormatter.ets` | `10000→10kΩ`，`1e-6→1µF` |
| 3.3.3 | double 精度 | ✅ | ArkTS `number` | 显示 3 位有效数字 |
| 3.3.4 | 溢出 ERC 警告 | 🔶 | `ErcEngine.ets` | 扩展规则 `param_out_of_range` |

---

### 3.4 单片机仿真补充

| ID | 细则 | 状态 | 目标文件 | 落地标准 |
|----|------|------|----------|----------|
| 3.4.1 | 51 RAM 随机初值 | ❌ | `Mcu8051Core.ets` | 上电 `0x00/0xFF` 随机 |
| 3.4.2 | STM32 外设复位默认值 | ❌ | `Stm32PeripheralReset.ets` | 寄存器表驱动 |
| 3.4.3 | NVIC 优先级竞争 | ❌ | `hex_debugger/.../NvicSim.ets` | 抢占+子优先级排序 |
| 3.4.4 | 硬件故障模拟 | ❌ | 高级功能开关 | IO 短路、停振、ADC 漂移 |
| 3.4.5 | 断点类型 | 🔶 | `IHexDebugger` | 补数据断点、中断断点 |

---

### 3.5 SPICE 仿真补充

| ID | 细则 | 状态 | 落地标准 |
|----|------|------|----------|
| 3.5.1 | 不收敛自动减小步长 | ❌ | 最多 5 次减半；仍失败 WARN |
| 3.5.2 | 温度仿真 -40~125℃ | 🔶 | `SimulationConfig.temperature` 已有字段 |
| 3.5.3 | 蒙特卡洛容差扫描 | ❌ | 专业版功能；统计 min/max |

---

## §四、AI 引擎与 API 管理安全、调度

### 4.1 API 密钥加密

| ID | 细则 | 状态 | 现状 / 目标 |
|----|------|------|-------------|
| 4.1.1 | AES-256-CBC + 设备盐 | ❌ | 现为 XOR+Base64（`CryptoUtil.ets`） |
| 4.1.2 | 磁盘无明文 | 🔶 | 内存 `encryptedKeys` Map 已分离 |
| 4.1.3 | 用后清零 | ❌ | 请求结束 `apiKey = ''` |
| 4.1.4 | 导出隐藏密钥 | 🔶 | 导出 JSON 时 key 为 `***` |
| 4.1.5 | 日志/崩溃不含密钥 | 🔶 | 需审计所有 `Logger` 调用 |

**升级后 `CryptoUtil` 接口：**

```typescript
export class CryptoUtil {
  static encrypt(plain: string, deviceSalt?: string): string;
  static decrypt(cipher: string, deviceSalt?: string): string;
  static getDeviceSalt(): string;  // 硬件特征哈希
  static secureZero(str: string): void;  // 覆写内存引用
}
```

---

### 4.2 AI 任务限流与配额

| ID | 细则 | 状态 | 目标文件 | 落地标准 |
|----|------|------|----------|----------|
| 4.2.1 | 按 API 日/月计数 | ❌ | `ai_api_manager/.../QuotaTracker.ets` | 持久化 `ai_config/quota.json`（加密） |
| 4.2.2 | 80% 阈值告警 | ❌ | `entry/.../AiSettingsPanel.ets` | WARN 弹窗 |
| 4.2.3 | 429 自动切换备用 Key | 🔶 | `AiApiManagerImpl` 有 `failedApiIds` | 完善备用链 |
| 4.2.4 | 全失效降级 Ollama | ❌ | `OllamaProbe.ets` | 自动探测 `127.0.0.1:11434` |
| 4.2.5 | 优先级队列 | ❌ | `AiTaskPool.ets` | 诊断 > 布线 > 文字生成 |

---

### 4.3 本地离线 AI

| ID | 细则 | 状态 | 落地标准 |
|----|------|------|----------|
| 4.3.1 | Ollama/Hermes 自动探测 | 🔶 | 模板已有 Ollama；需端口扫描 |
| 4.3.2 | Q4/Q5 量化适配 | ❌ | 根据 RAM 限制 `contextLimit` |
| 4.3.3 | 离线模式禁用云端 | ❌ | 设置开关；云端 API 灰色 |
| 4.3.4 | 离线能力边界 | ❌ | UI 标注「仅基础布线/推荐」 |

---

### 4.4 AI Prompt 工程固化

| ID | 细则 | 状态 | 目标目录 |
|----|------|------|----------|
| 4.4.1 | `route_prompt.json` | ❌ | `ai_prompt_lib/route_prompt.json` |
| 4.4.2 | `diag_prompt.json` | ❌ | `ai_prompt_lib/diag_prompt.json` |
| 4.4.3 | `gen_sch_prompt.json` | ❌ | `ai_prompt_lib/gen_sch_prompt.json` |
| 4.4.4 | 加载器 | ❌ | `ai_engine/.../PromptLoader.ets` |

**Prompt 模板 JSON 规范：**

```json
{
  "id": "route_v1",
  "version": "1.0.0",
  "system": "你是专业 PCB/原理图布线工程师...",
  "user_template": "拓扑 JSON：{{topology}}\n约束：{{constraints}}",
  "output_format": "json",
  "constraints": ["模拟数字分区", "晶振最短路径", "总线规整"]
}
```

代码中**禁止硬编码**长 prompt；仅允许 `PromptLoader.load('route')` 。

---

## §五、原理图编辑器 UI 交互规范

### 5.1 网格、吸附、标尺

| ID | 细则 | 状态 | 落地标准 |
|----|------|------|----------|
| 5.1.1 | 电气网格固定 10mil | 🔶 | `snapToGrid` 存在；需区分电气/显示网格 |
| 5.1.2 | 显示网格 5/10/20/50mil 可选 | 🔶 | `ViewportState.gridSize` |
| 5.1.3 | 双标尺 + 可设原点 | ❌ | `SchematicCanvas.ets` 扩展 |
| 5.1.4 | 吸附优先级 | ❌ | 引脚 > 节点 > 网格 > 边框 |

---

### 5.2 批量编辑

| ID | 功能 | 状态 | API 扩展 |
|----|------|------|----------|
| 5.2.1 | 按类型/位号/参数筛选 | ❌ | `ISchematicEditor.batchSelect(filter)` |
| 5.2.2 | 同类型一键替换 | ❌ | `batchReplaceComponent(oldId, newId)` |
| 5.2.3 | 参数批量增减 | ❌ | `batchUpdateParams(delta\|scale)` |
| 5.2.4 | 批量 ERC 修复 | ❌ | `batchApplyErcFix(fixIds[])` |

---

### 5.3 撤销/重做

| ID | 细则 | 状态 | 落地标准 |
|----|------|------|----------|
| 5.3.1 | 可配置 500~5000，默认 1000 | 🔶 | `metadata.undoLimit` 已有 |
| 5.3.2 | 子电路独立栈 | ❌ | `SubcircuitEditorContext.undoStack` |
| 5.3.3 | 仿真中不入栈 | ❌ | `if (simRunning) return` |

---

### 5.4 快捷键

| ID | 细则 | 状态 | 目标文件 |
|----|------|------|----------|
| 5.4.1 | `hotkey.cfg` | ❌ | `entry/resources/rawfile/hotkey.cfg` |
| 5.4.2 | 默认对标 Proteus | ❌ | `HotkeyDefaults.ets` |
| 5.4.3 | 冲突检测 | ❌ | `HotkeyManager.ets` |

---

### 5.5 画布主题

| ID | 细则 | 状态 | 目标文件 |
|----|------|------|----------|
| 5.5.1 | 三套主题 | ❌ | `entry/.../ThemeManager.ets` |
| 5.5.2 | 线条/文字/探针/电源色 | ❌ | `ui_theme.json` 全局配置 |
| 5.5.3 | 配置持久化 | ❌ | `filesDir/AISchSim/ui_theme.json` |

---

## §六、器件库全生命周期管理

### 6.1 检索索引

| ID | 细则 | 状态 | 现状 |
|----|------|------|------|
| 6.1.1 | `index.lib.json` 倒排索引 | 🔶 | 已有基础索引；缺关键词/向量 |
| 6.1.2 | 字段索引 | ❌ | 扩展 `keywords: string[]` |
| 6.1.3 | 向量索引（AI 语义） | ❌ | `index.lib.embedding.bin` |
| 6.1.4 | 懒加载 SVG/SPICE | 🔶 | `DeviceLibraryLoader` 按 `meta_path` 加载 |

**`index.lib.json` 扩展：**

```json
{
  "lib_dev_id": "R_10k",
  "keywords": ["10k", "电阻", "0805", "resistor"],
  "embedding_id": "emb_R_10k"
}
```

---

### 6.2 器件版本与更新

| ID | 细则 | 状态 | 落地标准 |
|----|------|------|----------|
| 6.2.1 | `meta.json` 含 `lib_version` | ❌ | semver 字段 |
| 6.2.2 | 官方增量更新包 | ❌ | `*.devpack` ZIP；仅变更器件 |
| 6.2.3 | 用户修改冲突 | ❌ | `is_custom_modified` 标记；弹窗覆盖/保留 |

---

### 6.3 Proteus 库导入

| ID | 细则 | 状态 | 目标文件 |
|----|------|------|----------|
| 6.3.1 | `.LIB` / `.PRTL` 解析 | ❌ | `file_persistence/.../ProteusLibParser.ets` |
| 6.3.2 | 引脚类型映射 | ❌ | `ProteusPinMapper.ets` → `PinType` |
| 6.3.3 | 不兼容器件占位 | ❌ | 生成空白自定义器件 + WARN |
| 6.3.4 | 缺失模型清单导出 | ❌ | CSV `missing_models.csv` |

---

### 6.4 自定义器件编辑器

| ID | 功能 | 状态 | 目标 |
|----|------|------|------|
| 6.4.1 | SVG 符号绘制 | ❌ | `entry/.../DeviceEditorPanel.ets` |
| 6.4.2 | 引脚拖拽配置 | ❌ | 同上 |
| 6.4.3 | SPICE/数字模型粘贴 | ❌ | 三文件一键生成 |
| 6.4.4 | 仿真预览 | ❌ | 调用 `ISimulationKernel` 单器件测试 |
| 6.4.5 | 保存至 UserCustom | ❌ | `DeviceLibrary/UserCustom/` |

**器件三文件规范（强制）：**

| 文件 | 命名 | 内容 |
|------|------|------|
| `*.meta.json` | `{lib_dev_id}.meta.json` | 引脚、参数、ERC、AI 约束 |
| `*.symbol.svg` | 同名 | 符号矢量图 |
| `*.model.spice` / `*.model.digital` / `*.model.mcu` | 按 `model_type` | 仿真模型 |

---

## §七、导入导出全兼容格式

### 7.1 导入

| 格式 | 状态 | 目标文件 | 落地标准 |
|------|------|----------|----------|
| Proteus `.sch` 7/8/9 | 🔶 | `ProteusParser.ets` | 覆盖总线、端口、电源符号 |
| KiCad `.kicad_sch` | 🔶 | 基础解析 | 总线/网络标号/子电路端口 |
| LTspice `.asc` | 🔶 | 基础解析 | 分立器件、运放模型 |
| SPICE 网表 | ❌ | `NetlistImporter.ets` | 反向布局 + 空白框架 |
| Intel HEX | ✅ | `HexParser.ets` | — |
| ELF → HEX | ❌ | `ElfExtractor.ets` | 提取 `.text` 段 |

---

### 7.2 导出

| 格式 | 状态 | 落地标准 |
|------|------|----------|
| PNG / SVG | 🔶 | Canvas 截图 / SVG 序列化 |
| PDF | ❌ | 打印服务或 PDF 库 |
| CSV BOM | ✅ | `exportBom` |
| CSV 波形 | ❌ | `exportWaveCsv` |
| SPICE 网表 | ✅ | `exportNetlist` |
| 串口日志 TXT | ❌ | `hex_debugger` UART 缓冲导出 |
| 器件库 ZIP | ❌ | 打包 `DeviceLibrary` 子集 |
| AI 配置 JSON | 🔶 | `saveAiConfig` |
| 打印模式 | ❌ | 黑白加粗、隐藏彩色 |

---

## §八、跨平台、部署、编译打包

### 8.1 多平台（主+扩展）

| 平台 | 状态 | 打包规范 |
|------|------|----------|
| HarmonyOS NEXT | ✅ 主平台 | HAP/HSP；`hvigorw assembleHap` |
| Windows (Qt6) | ❌ 扩展 | MSVC + NSIS；自带 VC 运行库 |
| macOS | ❌ 扩展 | DMG + 公证；Universal Binary |
| Linux | ❌ 扩展 | AppImage + deb |

**路径兼容：** 统一经 `AppPaths`，禁止硬编码 `\` 或 `/`。

---

### 8.2 两种运行模式

| 模式 | 状态 | 说明 |
|------|------|------|
| 客户端完整版 | 🔶 | 内置简化仿真；Ngspice/QEMU 待 NAPI |
| 轻量网页版 | ❌ | Ngspice WASM + WebGL；仅云端 AI |

---

### 8.3 依赖自动管理

| ID | 细则 | 状态 | 落地标准 |
|----|------|------|----------|
| 8.3.1 | 首次启动检测 | ❌ | OpenGL、串口、Ollama |
| 8.3.2 | 一键安装缺失依赖 | ❌ | 离线包内置 |

---

## §九、权限、商用授权、合规

### 9.1 授权体系

| 能力 | 免费版 | 专业版 | 状态 |
|------|--------|--------|------|
| 最大器件数 | 200 | 无限 | ❌ |
| STM32 高级外设 | 禁 | 开 | ❌ |
| 蒙特卡洛 | 禁 | 开 | ❌ |
| AI 日调用上限 | 有 | 无 | ❌ |
| AI API 数量 | 1 | 无限 | ❌ |
| 设备绑定 | — | 硬件码 | ❌ |

**目标文件：** `common/.../LicenseManager.ets`  
**验收：** 篡改授权文件 → 自动降级免费版 + `ERR_LICENSE_INVALID`

---

### 9.2 开源合规

| ID | 细则 | 状态 | 目标文件 |
|----|------|------|----------|
| 9.2.1 | 第三方许可证清单 | ❌ | `entry/resources/rawfile/THIRD_PARTY_LICENSES.md` |
| 9.2.2 | 关于页面展示 | ❌ | `entry/.../AboutPanel.ets` |

**必须列入：** Ngspice、Qt6、QEMU、ONNX Runtime、Eigen、ZIP 库等。

---

### 9.3 数据合规

| ID | 细则 | 状态 | 落地标准 |
|----|------|------|----------|
| 9.3.1 | AI 上传脱敏 | ❌ | 剥离路径、私有器件名 |
| 9.3.2 | 不上传 HEX/私有电路 | ❌ | 默认关闭；设置说明 |
| 9.3.3 | 隐私开关 | ❌ | 「仅本地布线」禁用云端拓扑上传 |

---

## §十、多语言、辅助工具、配套功能

### 10.1 国际化

| ID | 细则 | 状态 | 目标目录 |
|----|------|------|----------|
| 10.1.1 | `i18n/zh-CN.json` | ❌ | `entry/resources/rawfile/i18n/` |
| 10.1.2 | `i18n/en-US.json` | ❌ | 同上 |
| 10.1.3 | 实时切换 | ❌ | `I18nService.ets`；无需重启 |
| 10.1.4 | 覆盖范围 | ❌ | UI + ErrCode + 器件分类 |

---

### 10.2 辅助工具

| 工具 | 状态 | 目标组件 |
|------|------|----------|
| BOM 编辑器 | 🔶 | 导出已有；编辑器 ❌ |
| 单位换算 | ❌ | `UnitConverterPanel.ets` |
| 最小系统模板 | ❌ | `DeviceLibrary/Templates/` |
| 波形测量计算器 | ❌ | `WaveMeasurePanel.ets` |

---

### 10.3 串口终端

| ID | 细则 | 状态 | 落地标准 |
|----|------|------|----------|
| 10.3.1 | 波特率 1200~115200 | 🔶 | `McuDebugPanel` 扩展 |
| 10.3.2 | ASCII / HEX 切换 | ❌ | 双模式显示 |
| 10.3.3 | 时间戳 / 自动换行 | ❌ | 可配置 |
| 10.3.4 | 日志保存 | ❌ | 导出 TXT |
| 10.3.5 | 循环发送 | ❌ | 测试指令定时器 |

---

## §十一、异常容错与崩溃恢复

| ID | 场景 | 状态 | 落地标准 |
|----|------|------|----------|
| 11.1 | 仿真卡死 | ❌ | 显示「终止仿真」；不关闭工程 |
| 11.2 | 轻度损坏（波形丢失） | ❌ | 正常打开；清空 `wave_cache/` |
| 11.3 | 中度损坏（网络丢失） | ❌ | 补空网络 + ERC 标红 |
| 11.4 | 重度损坏（拓扑损坏） | 🔶 | 有 `recovery_*.schsim`；需弹窗选择备份 |
| 11.5 | OpenGL 失败降级 | ❌ | Canvas 软渲染 fallback |
| 11.6 | AI 断网续跑 | ❌ | 任务队列持久化；联网恢复 |

---

## §十二、性能监控面板

| 指标 | 状态 | 数据源 |
|------|------|--------|
| CPU（UI/仿真/AI） | ❌ | `PerfProbe.ets` |
| 内存（库/波形/MCU） | ❌ | 各模块 `getMemoryUsage()` |
| AI 调用统计 | ❌ | `QuotaTracker` |
| 仿真速度（步/秒） | ❌ | `GlobalScheduler` |

**目标组件：** `entry/.../PerfMonitorPanel.ets`（高级用户 / 开发者模式开关）

---

## §十三、最终落地交付验收清单

### 13.1 分维度验收表

| # | 维度 | 必测项 | 通过标准 |
|---|------|--------|----------|
| 1 | 文件体系 | ZIP schsim 开保存 | round-trip 无数据丢失 |
| 2 | 文件体系 | 缓存目录 + 7 天清理 | 临时文件过期删除 |
| 3 | 文件体系 | 工程锁 | 双开提示 + 只读模式 |
| 4 | 文件体系 | AES 加密工程 | 无密码无法解析 topology |
| 5 | 仿真底层 | 多线程 | UI 拖动不卡顿（60fps） |
| 6 | 仿真底层 | 波形 128MB 上限 | LRU 淘汰最早通道 |
| 7 | 仿真底层 | 51 上电随机 RAM | 两次上电数据不同 |
| 8 | 仿真底层 | SPICE 不收敛 | 自动减小步长 + WARN |
| 9 | AI 系统 | 密钥加密 | 磁盘无明文 key |
| 10 | AI 系统 | 429 降级 | 自动切备用 / Ollama |
| 11 | AI 系统 | Prompt 模板 | 改 JSON 不改代码生效 |
| 12 | 编辑器 | 电气 10mil 吸附 | 引脚始终对齐网格 |
| 13 | 编辑器 | 仿真中禁止编辑 | `ERR_SIM_BUSY` |
| 14 | 器件库 | 十万级索引启动 | 冷启动 < 3s |
| 15 | 器件库 | Proteus 导入 | 引脚映射率 > 90% |
| 16 | 导入导出 | 全格式回归 | 见 §7 矩阵逐项 |
| 17 | 容错 | 崩溃恢复 | 重启可恢复最近自动备份 |
| 18 | 安全 | 日志脱敏 | 无绝对路径、无 key |
| 19 | 合规 | 许可证页面 | 所有 OSS 组件可追溯 |
| 20 | 部署 | HarmonyOS HAP | 安装运行无缺失依赖 |
| 21 | 配套 | 串口终端 | 115200 双向通信 |
| 22 | 配套 | 多语言 | 中英文切换实时生效 |
| 23 | 配套 | 性能面板 | 指标刷新 ≤ 1s |

---

### 13.2 推荐实施优先级（P0→P3）

```
P0（阻塞交付）
  ├── 1.1 ZIP schsim + manifest + SchemaMigrator
  ├── 1.2 AppPaths + CacheCleaner
  ├── 2.1 FileLogger + 脱敏
  ├── 2.3 DialogService + ErrCode 扩展
  └── 3.1 仿真 Worker 化 + 读写锁

P1（核心体验）
  ├── 4.1 CryptoUtil AES 升级
  ├── 4.4 ai_prompt_lib
  ├── 5.2 批量编辑
  ├── 6.1 索引扩展 + 懒加载完善
  └── 11.x 分级损坏修复

P2（商用与扩展）
  ├── 9.1 LicenseManager
  ├── 9.2 开源合规清单
  ├── 3.2 Ngspice NAPI
  └── 6.3 Proteus .LIB 导入

P3（增强）
  ├── 8.x 跨平台 Qt 打包
  ├── 12.x 性能监控面板
  ├── 3.4.4 硬件故障模拟
  └── 轻量网页版
```

---

### 13.3 模块—文件快速对照

| 模块 HAR | 本规范新增/修改重点文件 |
|----------|-------------------------|
| `common` | `AppPaths.ets`, `FileLogger.ets`, `UnitConverter.ets`, `RwLock.ets`, `LicenseManager.ets`, `ErrCode.ets` |
| `file_persistence` | `SchsimArchive.ets`, `SchemaMigrator.ets`, `ProjectLock.ets`, `ProteusLibParser.ets` |
| `simulation_kernel` | `WaveCache.ets`, `WaveSampler.ets`, NAPI `NgspiceBridge` |
| `hex_debugger` | `FirmwareCache.ets`, `NvicSim.ets`, `Stm32PeripheralReset.ets` |
| `ai_engine` | `PromptLoader.ets`, `AiTaskPool.ets`, `RouteCache.ets` |
| `ai_api_manager` | `QuotaTracker.ets`, `OllamaProbe.ets` |
| `schematic_editor` | 批量 API、`SubcircuitEditorContext` |
| `component_library` | `ThumbnailCache.ets`, `EmbeddingIndex.ets` |
| `entry` | `DialogService.ets`, `I18nService.ets`, `HotkeyManager.ets`, `PerfMonitorPanel.ets` |
| 资源目录 | `ai_prompt_lib/`, `i18n/`, `hotkey.cfg`, `ui_theme.json` |

---

## 附录 A：与现有架构文档关系

| 文档 | 关系 |
|------|------|
| `docs/ARCHITECTURE.md` | 七大模块总览；本规范是其**落地细则** |
| `docs/API_INTERFACES.md` | 接口契约；本规范 §5/§6/§7 驱动 API 增量 |
| `DeviceLibrary/*.meta.json` | 器件三文件规范实例 |

## 附录 B：`schema_version` 迁移链

| 版本 | 变更 |
|------|------|
| 1.0.0 | 单 JSON 明文（当前） |
| 2.0.0 | ZIP 分包 + manifest |
| 2.1.0 | 增加 `ai_route_cache`、`erc_history` |
| 2.2.0 | 外部引用模式 + AES 加密 |

迁移器：`SchemaMigrator.migrate(from, to, raw): ProjectFile`

---

*本文档随实现进度更新状态列。开发者在 PR 中应标注所覆盖的规范 ID（如 `1.1.1`, `4.4.1`）。*
