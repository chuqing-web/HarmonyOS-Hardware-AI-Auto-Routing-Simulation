# Sim Worker + 60fps DisplayPump Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move simulation compute off the UI critical path via a persistent Worker (with adaptive main-thread fallback), drive instruments/canvas at 60fps, and debounce editor heavy work so edit + simulate stay smooth.

**Architecture:** Worker (or fallback compute pump) owns `SimulationKernelImpl` stepping under a ~13ms time budget; main thread runs DisplayPump @16ms consuming the latest frame snapshot; SchematicCanvas redraw throttle = 16ms; ERC/schematic reload debounced.

**Tech Stack:** HarmonyOS ArkTS, `worker.ThreadWorker`, `simulation_kernel` HAR, `common` EventBus / mapAware JSON.

---

## File map

| File | Role |
|------|------|
| `entry/src/main/ets/services/sim/SimProtocol.ets` | Command/frame message types |
| `entry/src/main/ets/services/sim/SimFrameStore.ets` | Latest-frame triple buffer on UI thread |
| `entry/src/main/ets/services/sim/SimWorkerHost.ets` | ThreadWorker host + fallback compute pump |
| `entry/src/main/ets/workers/SimWorker.ets` | Worker entry: kernel + budget loop |
| `entry/build-profile.json5` | Register worker script |
| `features/simulation_kernel/.../SimulationKernelImpl.ets` | `runBudgetSteps`, `build/applyFrameSnapshot`, wave 16k |
| `entry/.../AppService.ets` | DisplayPump, wire host, debounce ERC reload |
| `entry/.../SchematicCanvas.ets` | REDRAW_INTERVAL_MS = 16 |

---

### Task 1: Protocol + FrameStore

**Files:**
- Create: `entry/src/main/ets/services/sim/SimProtocol.ets`
- Create: `entry/src/main/ets/services/sim/SimFrameStore.ets`

- [ ] **Step 1: Add protocol types** (`SimCmdType`, `SimMsgType`, plain frame with parallel `netKeys` / `voltages` / `currents` / MCU fields)
- [ ] **Step 2: Add `SimFrameStore` with `publish` / `consumeLatest` (overwrite unread frames)

### Task 2: Kernel budget + snapshot API

**Files:**
- Modify: `features/simulation_kernel/src/main/ets/SimulationKernelImpl.ets`
- Modify: `features/simulation_kernel/Index.ets` (export helpers if needed)

- [ ] **Step 1:** `runBudgetSteps(budgetMs): number` — MCU once + spice/digital until deadline; return step count
- [ ] **Step 2:** `buildFrameSnapshot(): SimFramePlain` / `applyFrameSnapshot(frame)` for UI mirror
- [ ] **Step 3:** `MAX_WAVE_POINTS = 16384`; prefer O(1) ring overwrite when possible

### Task 3: SimWorker + Host

**Files:**
- Create: `entry/src/main/ets/workers/SimWorker.ets`
- Create: `entry/src/main/ets/services/sim/SimWorkerHost.ets`
- Modify: `entry/build-profile.json5`

- [ ] **Step 1:** Register worker path in `buildOption.sourceOption.workers`
- [ ] **Step 2:** Worker handles INIT/START/PAUSE/RESUME/STOP/LOAD_MCU/SHUTDOWN; posts READY/FRAME/STATUS/ERROR
- [ ] **Step 3:** Host starts Worker; on failure enable **fallback** `setTimeout` compute pump calling local `runBudgetSteps(13)`
- [ ] **Step 4:** Host exposes `start/stop/pause/resume/loadMcu/consumeFrame/isWorkerMode`

### Task 4: AppService DisplayPump @60fps

**Files:**
- Modify: `entry/src/main/ets/services/AppService.ets`

- [ ] **Step 1:** Replace `scheduleSimTick` + `runSimBatch` path with DisplayPump 16ms + SimWorkerHost
- [ ] **Step 2:** On start: local `startSimulation` for API mirror, then host START with JSON; warm instruments from pump
- [ ] **Step 3:** Pump: consume frame → `applyFrameSnapshot` → instrument feed → EventBus STEP (throttled)
- [ ] **Step 4:** Debounce `onSchematicChanged` → ERC/reload (~150ms)

### Task 5: Canvas + editor smoothness

**Files:**
- Modify: `entry/src/main/ets/components/SchematicCanvas.ets`

- [ ] **Step 1:** `REDRAW_INTERVAL_MS = 16`
- [ ] **Step 2:** Ensure sim-step path only dirties wire/foreground layer (already mostly true — verify)

### Task 6: Verify

- [ ] Build / ArkTS check for new worker files
- [ ] Manual: edit while sim runs; lab_51_led + stm32 templates

---

**Spec coverage:** G1–G6 Worker+Pump+editor+memory+STM32(in Worker kernel)+API surface. QEMU proxy fallback = Host stays on UI-thread compute if Worker cannot load bridge (same fallback path).
