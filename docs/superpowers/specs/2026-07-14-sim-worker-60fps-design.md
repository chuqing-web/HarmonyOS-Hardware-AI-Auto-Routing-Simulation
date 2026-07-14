# 持久化 Sim Worker + 60fps DisplayPump 防卡顿设计

**日期**: 2026-07-14  
**范围**: `AppService` 仿真调度、`SimulationKernelImpl`（含 8051 / STM32·QEMU / SPICE / 数字）、`SchematicCanvas` 重绘、仪器喂数、堆与环形缓冲  
**已确认决策**:
- 架构采用 **持久化 Sim Worker + 主线程 60fps DisplayPump**
- **本轮全面执行**：8051、模拟/数字、**STM32/QEMU 一并迁入 Worker**；编辑侧异步与节流同步做完
- 成功标准：编辑拖拽与仿真运行时界面无明显卡顿，显示侧稳定约 60fps

---

## 1. 背景与问题

当前路径（卡顿根因）：

1. **仿真占主线程**：`AppService.scheduleSimTick` → `setTimeout(50ms)` → `runSimBatch(10)` 在 UI 线程执行 MCU（最多约 280 条指令）、SPICE、数字事件、仪器采样、`EventBus` 广播。
2. **UI 刷新与仿真耦合**：每批结束后 `onWaveUpdate` + `SIMULATION_STEP` → `SchematicCanvas.scheduleRedraw`（现网 `REDRAW_INTERVAL_MS = 32`），仪器侧重复 `getNodeVoltageMap()` 拷贝 `Map`。
3. **编辑与仿真争用同一线程**：拖拽/缩放触发 `SCHEMATIC_CHANGED` / 全量背景重绘时，若同时在跑仿真，两者互相饿死。
4. **内存抖动**：步级短命 `Map`/数组分配诱发 GC；波形上限 `MAX_WAVE_POINTS = 4096` 在高采样下易翻转与抖动。
5. **STM32/QEMU**：`QemuMcuBridge.step` / `readPeriph` 走 IPC，若在主线程同步调用，单步延迟会直接冻住触摸与绘制。

单纯加大主线程 batch（更多步 / 更大定时器）会加重卡顿。必须把**状态重计算**移出 UI 线程，主线程只做**最新帧展示**与**交互**。

---

## 2. 目标与非目标

### 2.1 目标

| 编号 | 目标 |
|------|------|
| G1 | 仿真内核（SPICE + 数字 + 8051 + STM32/QEMU 桥）常驻后台 Worker |
| G2 | 主线程 DisplayPump **固定 ~16.7ms（60Hz）** 消费最新帧，丢弃过期帧 |
| G3 | 编辑路径：重绘节流到 16ms、交互合并、重 ERC/拓扑异步化 |
| G4 | 预分配波形/帧缓冲，减少热路径分配；在允许范围内提高堆与缓冲上限 |
| G5 | 仪器与示波器读 Worker 采样结果，不再每步在主线程扫全网 |
| G6 | 对外 API 行为尽量不变：`startSimulation` / `stop` / `pause` / `loadMcuProgram` / 调试单步仍可用 |

### 2.2 非目标

- 不重写 SPICE 数值算法本身（可后续再优化）。
- 不改变 `.schsim` 文件格式。
- 不把 AI GA TaskPool 与 Sim Worker 合并为同一 Worker。
- 不在本轮引入多核并行求解同一电路（单 Worker 内串行步进即可）。

---

## 3. 架构

```
┌─────────────────────────────────────────────────────────┐
│  UI Thread (Entry / AppService / Canvas / Instruments)  │
│  · 触摸与原理图编辑                                       │
│  · DisplayPump @ 60Hz 取 LatestFrame                     │
│  · 轻量绘制：导线电压色、仪器表盘、示波器折线               │
│  · 控制面：START/PAUSE/STOP/LOAD_FIRMWARE/STEP_ONCE       │
└──────────────────────────┬──────────────────────────────┘
                           │ postMessage / onmessage
                           │ (扁平 Sendable / 普通可克隆结构)
┌──────────────────────────▼──────────────────────────────┐
│  Sim Worker (persist)                                    │
│  · SimulationKernelImpl 实例常驻                        │
│  · AnalogEngine / DigitalEngine / Mcu8051 / QemuBridge │
│  · SimLoop：时间预算步进 → 写 FrameBuffer（三缓冲）       │
│  · 仪器采样、波形环形缓冲写在此侧                         │
└─────────────────────────────────────────────────────────┘
```

### 3.1 为何用 Worker 而不是每步 TaskPool

- 内核状态巨大（节点电压 `Map`、MNA、MCU 内存、QEMU IPC 会话）；每步序列化进 `@Concurrent` 任务成本过高。
- QEMU 桥需要**长寿命会话**；Worker 适合持有 `QemuMcuBridge`。
- 已有 GA `taskpool` 模式保留给无状态短任务；仿真用 **Worker 常驻**。

### 3.2 组件职责

| 组件 | 职责 |
|------|------|
| `SimWorkerHost`（主线程） | 创建/销毁 Worker；发送控制命令；接收 FRAME/ERROR；暴露 `getLatestFrame()` |
| `SimWorker`（后台脚本） | 持有 kernel；跑 `simLoop`；发包 |
| `DisplayPump`（`AppService` 内） | 60Hz：把 LatestFrame 推给 instruments + EventBus（合并后的轻量事件） |
| `SimFrameBuffer` | 三槽：Worker 写 back、ready 交换、UI 读 front |
| `SchematicCanvas` | 16ms 节流；仿真电压只脏前景层 |
| `EditorWorkScheduler` | ERC / 拓扑 / 仪器 rebind 防抖异步 |

---

## 4. 消息协议

所有跨线程载荷优先 **扁平数组 + 并行 id 表**，禁止每帧深拷整棵 `WaveData[]` / `Map`。

### 4.1 UI → Worker

| 命令 | 载荷 | 说明 |
|------|------|------|
| `INIT` | 可选配置（stepSize、stopTime、预算 ms） | Worker 就绪后 ACK |
| `LOAD_TOPOLOGY` | 拓扑 + 必要原理图针脚索引（扁平化） | start 前或拓扑变更 |
| `START` | — | 进入 RUNNING，启动 simLoop |
| `PAUSE` / `RESUME` | — | 暂停预算循环，保留状态 |
| `STOP` | — | 停循环、重置/半重置按现网语义 |
| `LOAD_MCU` | `{ family, offset, bytes: ArrayBuffer }` | 8051 或 STM32 |
| `STEP_ONCE` | `{ spiceSteps?: number }` | 调试：单批步进后仍发 FRAME |
| `SET_BUDGET` | `{ frameBudgetMs: number }` | 默认 12–14ms |
| `SHUTDOWN` | — | Ability 销毁时 |

### 4.2 Worker → UI

| 消息 | 载荷 | 说明 |
|------|------|------|
| `READY` | — | Worker 启动完成 |
| `FRAME` | `SimFrameSnapshot` | 最新完整帧（可增量 wave） |
| `STATUS` | `{ state, simStepCount, message? }` | 状态变更 |
| `ERROR` | `{ code, message }` | 不可恢复或逐步失败 |
| `MCU_DEBUG` | `{ pc, regs… }` | 调试面板按需，可低于 60Hz |

### 4.3 `SimFrameSnapshot`（示意）

```
t: number
stepCount: number
netCount: number
netKeys: string[]          // 仅在拓扑变更时全量下发；稳态用 index
voltages: Float64Array     // 与 net index 对齐
currents: Float64Array     // 支路，配合 branchKeys
mcuFamily: string
mcuPc: number
mcuP1: number              // 8051
gpioWords: Uint32Array     // STM32 GPIO ODR 等摘要
scopeDeltaTimes: Float64Array
scopeDeltaChannels: Float64Array  // 交错或分通道约定
digitalLevels: Uint8Array  // 0/1，与 net index 对齐（可选）
```

拓扑变更时发 `TOPOLOGY_DICT`（netKeys/branchKeys）；之后 FRAME 只带数组，避免字符串反复过桥。

---

## 5. Worker 内仿真循环

伪逻辑：

```
while (state == RUNNING):
  deadline = now + frameBudgetMs   // 默认 13ms
  tickMcuCore()                    // 8051: maxSteps+P1 early-out；STM32: qemu.step 预算
  while (now < deadline):
    runSpiceStep()
    tickDigitalLogic()
    sampleInstrumentsInline()
  publishFrameIfNewer()            // 写三缓冲 + postMessage FRAME（可合并：若 UI 未取走则覆盖）
  yield / sleep(0)                 // 避免饿死 Worker 消息队列
```

约束：

- **显示 60Hz ≠ 仿真固定 60 步/秒**。仿真尽量在预算内多跑；显示永远只取最新。
- MCU：保留「P1 变化提前 break」，避免一帧跳过多位 LED；STM32：每预算内限制 `qemu.step` 次数（可配置，默认与现网相当或略增），GPIO 同步仍在 Worker 内 `syncStm32GpioToSpice`。
- QEMU IPC 超时（现 `IPC_TIMEOUT_MS = 5000`）必须只堵 Worker；UI 超时则显示「MCU 无响应」而非冻屏。若桥接本身不可进 Worker 线程（平台限制），则改为：Worker 发 `QEMU_REQ`、宿主侧专用 Qemu 代理线程/模块回传结果——**默认假设桥接可随 kernel 同 Worker；若联调失败走代理回退，接口仍对 AppService 透明**。

---

## 6. 主线程 DisplayPump（60fps）

替换现网：

- 删除/停用：`SIM_TICK_MS = 50` + 主线程 `runSimBatch`
- 新增：`DISPLAY_PUMP_MS = 16`，`setInterval` 或自校准 `setTimeout` 链

每拍：

1. `frame = simWorkerHost.consumeLatestFrame()`；无新帧则跳过重绘制（可选仍刷仪器 hold）
2. `instruments.applyFrame(frame)`（示波器、电压表、逻辑分析仪）
3. 发布**一个**合并事件（如 `SIMULATION_FRAME`），Canvas / 面板订阅它
4. **禁止**在 Pump 内调用 `tickMcuCore` / `runSpiceStep` / 全量拓扑扫描

启动瞬间：`LOAD_TOPOLOGY` → `START`；可选 Worker 内跑 warm-up 步数后立刻 `FRAME`，代替主线程 `runSimBatch(20)`。

---

## 7. STM32 / QEMU（本轮必做）

1. `QemuMcuBridge` 实例迁入 Worker，与 `loadMcuProgram(..., 'STM32...')` / `tickMcuCore` 路径一致。
2. 固件字节用 `ArrayBuffer` 传输，避免主线程长期持有大副本。
3. `syncStm32GpioToSpice` 仅 Worker 执行；UI 只收 `gpioWords` / 电压快照用于 LED 着色。
4. 调试面板：`STEP_ONCE` / 读寄存器走异步请求–响应，不在 UI 线程忙等 IPC。
5. 验收模板：`lab_mcu_stm32`、`lab_uart` 在仿真+拖动画布同时进行时 UI 可操作。

回退策略（写进实现计划任务）：若 Harmony Worker 内无法使用现有 IPC，实现 `QemuProxy` 于主进程旁路线程，Worker 只持逻辑时间与 SPICE，MCU 步进经代理——对外仍是同一 `SimWorkerHost` API。

---

## 8. 编辑侧流畅性

| 项 | 现况 | 目标 |
|----|------|------|
| 重绘节流 | 32ms | **16ms**（`REDRAW_INTERVAL_MS`） |
| 仿真重绘 | `SIMULATION_STEP` 可能连带背景 | 仅 `simFrameDirty` → **只重前景导线层** |
| 文档变更 | 立即全量 | **合并到下一显示帧**；拖拽中不跑全量 ERC |
| ERC / DeepErc | 同步主线程风险 | `EditorWorkScheduler`：`requestIdle`/防抖 100–200ms |
| 仪器 rebind | `simStepCount % 50` 全表扫描 | 拓扑版本号变化时才 rebind；Pump 内不做全文档扫描 |

交互优先级：触摸移动 > DisplayPump 绘制 > 后台 ERC。仿真不得阻断 `Pan/Zoom/Select`。

---

## 9. 内存与堆预算

| 资源 | 目标 |
|------|------|
| 波形环 | `MAX_WAVE_POINTS`：**4096 → 16384**（可配置；环形覆写） |
| 逻辑分析 | 与现网 `MAX_SAMPLES` 对齐或升至 16384 |
| 帧缓冲 | 3 × `SimFrameSnapshot` 预分配；`voltages`/`currents` 复用 `Float64Array` |
| 热路径 | Worker 内避免每步 `new Map` 对外拷贝；对外只填预分配数组 |
| 进程堆 | 在 `module.json5` / 产品配置允许范围内提高 JS 堆或相关 limit（以 DevEco/Harmony 官方字段为准，实现时写入具体键值） |

“增大线程和内存开销”的正确含义：**固定常驻 Worker + 预分配大缓冲**，用可控内存换取零卡顿与更少 GC，而不是在主线程塞更多同步计算。

---

## 10. AppService / Kernel 边界改造

- `AppService`：门面保留；内部 `simWorkerHost` 替代 `simTimer`+`runSimBatch`。
- `SimulationKernelImpl`：可仍实现 `ISimulationKernel`，但**生产路径只在 Worker 内实例化**。主线程可保留薄代理（方法转消息）供尚未迁移的调用点渐进替换。
- `HexDebugger` / `McuDebugPanel`：读 PC/寄存器改为异步；显示 Pump 上的缓存 + 显式 `MCU_DEBUG` 拉取。
- 启动失败：Worker `ERROR` → `onStatusMessage`，`setSimBusy(false)`。

---

## 11. 错误处理

- Worker 未 READY 时 START → 排队或失败提示。
- FRAME 连续缺失超过 N 拍（如 30 帧 ≈ 0.5s）→ 状态栏告警，不阻塞编辑。
- QEMU/IPC 失败 → Worker `ERROR` 或降级 STATUS；UI 可停仿真。
- Ability `onDestroy`：`SHUTDOWN` + terminate Worker，防泄漏。

---

## 12. 验收标准

1. **编辑**：中等原理图连续拖拽/缩放，观感接近 60fps，无多帧级卡死。
2. **8051**：`lab_51_led` Port1 跑马平滑，同时可平移画布。
3. **模拟+仪器**：示波器波形连续，电压表更新流畅，主线程无 `runSimBatch`。
4. **STM32**：`lab_mcu_stm32` / `lab_uart` 启动与运行时 UI 可交互；调试单步不冻屏。
5. **停仿真**：立即恢复编辑，无残余 timer/pump。
6. Hilog：可选 `sim_perf` 统计 `workerBudgetMs`、`frameAgeMs`、`uiPumpMs`（调试开关，默认关）。

---

## 13. 交付阶段（仍属同一全面方案，便于联调）

| 阶段 | 内容 |
|------|------|
| P0 | `SimWorker` 骨架、协议、`SimWorkerHost`、空转 FRAME + DisplayPump 60Hz；主线程仿真定时器断开 |
| P1 | 拓扑加载 + SPICE + 数字 + 8051 迁入 Worker；instruments/Canvas 接 FRAME |
| P2 | **STM32/QEMU 迁入（含代理回退）**；调试异步化 |
| P3 | Canvas 16ms、前景脏区、ERC/rebind 调度器、波形 16k、堆配置 |
| P4 | 上述验收模板压测与性能日志收尾 |

P0→P4 连续实施，不作为“可选增强”；STM32 不延期到后续版本。

---

## 14. 主要触及文件（预期）

- 新增：`features/simulation_kernel/.../worker/SimWorker.ets`（或项目约定的 Worker 入口）、`SimProtocol.ets`、`SimFrameBuffer.ets`、`SimWorkerHost.ets`
- 修改：`entry/.../AppService.ets`、`SchematicCanvas.ets`、仪器实现、`SimulationKernelImpl.ets`（可抽循环）、`QemuMcuBridge.ets`（线程亲和/代理）、`entry/src/main/module.json5`（Worker 注册与堆相关配置）
- 文档：本规格；实现计划另见 `docs/superpowers/plans/`（待用户确认规格后编写）

---

## 15. 风险与明确选择

| 风险 | 选择 |
|------|------|
| ArkTS Worker 对象传递限制 | 协议只用扁平 typed array / 基础类型 |
| QEMU 无法进 Worker | 本轮仍交付等价异步：`QemuProxy`，UI 不堵 |
| 60Hz 消息风暴 | FRAME 覆盖写三缓冲；Pump 每拍最多处理一帧 |
| API 面过大 | 主线程保留 `ISimulationKernel` 代理，分文件替换调用点 |

---

## 16. 规格自审（已处理）

- 无 TBD：QEMU 回退路径已定义为必选实现分支而非“以后再说”。
- 范围：单规格覆盖线程、显示、编辑、内存、STM32；实现计划可按 P0–P4 拆任务，不必再拆子规格。
- 歧义消除：**目标流畅是 UI 60fps**；仿真步进率由 Worker 时间预算决定，不绑定 60steps/s。
