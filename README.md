# AI-SCH Simulator

**Schematic-centric hardware simulation and AI-assisted circuit design on HarmonyOS NEXT**

A Proteus-class editing and mixed-signal experience—native to HarmonyOS—with 8051/STM32 HEX debugging, virtual instruments, and a closed loop driven by **engineered AI Prompts**: **select → place → net-plan → route → self-review**. Built for university labs, contest training, and early design verification.

[简体中文](./README.zh-CN.md) | English

**Competition materials:** [作品说明文档 (Project Brief)](./docs/作品说明文档.md) (concept / design / intro / test report)

<p align="center">
  <img src="./picture/design-poster.png" alt="AI-SCH Simulator design poster" width="900">
</p>

---

## Contents

- [1. Background](#1-background)
- [2. Innovations](#2-innovations)
- [3. AI Prompt Engineering](#3-ai-prompt-engineering)
- [4. Feature Overview](#4-feature-overview)
- [5. Architecture](#5-architecture)
- [6. AI Closed-Loop Pipeline](#6-ai-closed-loop-pipeline)
- [7. Simulation & Debugging](#7-simulation--debugging)
- [8. Device Library & Lab Templates](#8-device-library--lab-templates)
- [9. Repository Layout & Modules](#9-repository-layout--modules)
- [10. Getting Started](#10-getting-started)
- [11. Demo Script for Judges](#11-demo-script-for-judges)
- [12. Application Scenarios](#12-application-scenarios)
- [13. Engineering Quality](#13-engineering-quality)
- [14. Roadmap](#14-roadmap)
- [15. License & Notices](#15-license--notices)

---

## 1. Background

Electronics education and embedded prototyping still rely heavily on **Windows + Proteus / Multisim**. As HarmonyOS NEXT spreads across 2in1 PCs, tablets, and classroom devices, the ecosystem still lacks a tool that is:

1. **Native to HarmonyOS** for schematic-level simulation;  
2. Capable of **analog / digital / MCU** mixed-signal labs in one product;  
3. Able to turn **LLM output into executable topology** (not chat-only Q&A)—with versioned, auditable, evolvable Prompts;  
4. Equipped for teaching: **lab templates, staged power-on, fault injection, coverage metrics**.

**AI-SCH Simulator** (`com.elecdraw.aischsim`, vendor ElecDraw, **v1.1.0**) addresses that gap. It is implemented in ArkTS / ArkUI (Stage model) with modular HAR packages, centered on a shared topology contract—`SchTopology`—across editing, simulation, AI, persistence, and teaching.

| Item | Detail |
|------|--------|
| Product name | AI-SCH Simulator |
| Bundle ID | `com.elecdraw.aischsim` |
| Version | **1.1.0** (`AppScope/app.json5` / `oh-package.json5`) |
| Platform | HarmonyOS NEXT 5.0+ / SDK API 12 |
| Device types | **2in1 (primary)**, tablet, default |
| Stack | ArkTS + ArkUI, Proteus-inspired theme |
| License | Apache-2.0 |

---

## 2. Innovations

The differentiator is not “another chatbot”—it is **constraining LLMs into simulatable schematics**, then packaging that capability as a teachable, testable, demo-ready application loop.

| # | Innovation | Detail |
|---|------------|--------|
| 1 | **Engineered AI Prompts (single source of truth)** | `skill/prompts/` is the staged Prompt authority; mirrored to `templates/*.ets` and loaded by `PromptLoader` at runtime; md↔ets sync prevents drift (device never reads on-disk `skill/`) |
| 2 | **Staged constraint JSON + local hard engines** | Select / layout / net-plan / route / self-review / modular-plan Prompts emit structured constraints only; GA placement, semantic nets, A\* routing, ERC / geometry gates run locally—no “text as circuit” |
| 3 | **Modular parallel generation** | For complex circuits: choose **oneshot** or **modular**—global plan + boundary gates → true parallel sub-pipelines → pin-to-pin joint merge; shorter wall-clock with correct cross-module nets |
| 4 | **Device usage-manual injection** | After library match, inject BOM-scoped `DeviceUsageManual` (real pins / typical wiring / anti-patterns) into layout / net-plan / route to cut hallucinated connections |
| 5 | **Native mixed-signal kernel** | In-house MNA analog, event-driven digital, 8051 / in-process Cortex-M3 teaching paths, global nanosecond scheduler |
| 6 | **Teach–sim–diagnose loop** | 20 `.schsim` labs + HEX + knowledge tips + staged power-on + fault injection + coverage dashboard; live instrument ↔ net binding |
| 7 | **Multi-vendor AI governance** | 17 provider templates, per-task API binding, quota dashboard, offline / proxy / degrade policies |

**Versus classic desktop EDA:** native HarmonyOS + executable AI + measurable teaching.  
**Versus chat-only assistants:** staged Prompt engineering, topology landing, ERC / sim verification, diagnosable failures.

---

## 3. AI Prompt Engineering

> Treat Prompts as **first-class engineering assets**, not ad-hoc strings buried in business code.

### 3.1 Authority → runtime mirror

```
skill/SKILL.md          (rule book: classification, anti-hallucination, MCU/op-amp must-haves…)
skill/prompts/*.md      (staged system + userTemplate with frontmatter)
        │ manual sync
        ▼
features/ai_engine/.../prompts/templates/*Prompt.ets
        │ PromptLoader.load(runtime_key)
        ▼
LLM constraint JSON  →  local algorithm engines  →  SchTopology
```

- **Authoritative copy:** [`skill/prompts/`](./skill/prompts/README.md) (v5.1)  
- **Rule book:** [`skill/SKILL.md`](./skill/SKILL.md)  
- **Index:** [`skill/references/prompt-templates.md`](./skill/references/prompt-templates.md)  
- **Loader:** `PromptLoader` (refuses unknown-template silent fallback; refuses empty render)  
- **Legacy:** root `ai_prompt_lib/*.json` is early assets—**current authority is `skill/`**

### 3.2 Staged Prompt map

| Stage | skill file | runtime_key | Role in pipeline |
|-------|------------|-------------|------------------|
| Shared rules | `00_shared_rules.md` | — | Injected via `renderEnriched` |
| Device select | `01_device_select.md` | `device_select` | Function modules + in-library models; anti-hallucination / OOD |
| Layout | `02_layout.md` | `layout` | Regions / adjacency / density → GA placement |
| Net plan | `03_net_plan.md` | `net_plan` | Pin-level net list (primary battlefield + usage manual) |
| Route | `04_route.md` | `route` | Analog / digital / xtal weights → A\* |
| Self-review | `05_self_review.md` | `self_review` | ERC + geometry → repair suggestions |
| Diagnosis | `06_diag.md` | `diag` | Static / dynamic diagnosis tasks |
| Legacy full sch | `07_gen_sch.md` | `gen_sch` | Compat path (do not rely on for production full-gen) |
| Modular plan | `08_modular_plan.md` | `modular_plan` | Parallel gen: module boundaries + joint gates |

Runtime fragments also exist: `IntentPromptFragments`, `DeviceInstrumentFragments`, `EditPlanPrompt` (local edit), injected with shared rules.

### 3.3 Runtime dynamic injection (not static body text)

`PromptLoader` assembles context from topology / BOM at call time—avoid dumping the entire library into every prompt:

| Injection | Purpose |
|-----------|---------|
| `library_catalog` / libDevId list | Select & modular plan stay in-library |
| `DeviceUsageManual` (full / compact) | Pin-level wiring & anti-patterns for layout / net-plan / route |
| Pin world coords / selection AABB | Geometry-aware net_plan |
| Wire-path / density reports | Geometry coverage for self_review |
| Topology anti-pattern guards | Enriched safeguards (e.g. mutually exclusive indicator / relay contact topology) |

### 3.4 Maintenance contract

1. Change rules → edit `skill/SKILL.md`  
2. Change a stage’s wording → edit the matching `skill/prompts/0x_*.md`  
3. **Must** sync the same `*Prompt.ets`, or App behavior will not change  
4. Keep geometry constants aligned with code (selection hit pad, foreign-pin clearance, …)  

---

## 4. Feature Overview

### 4.1 Schematic editing

- Canvas interaction, layers, grid snap, undo/redo, batch align/distribute  
- Buses, net labels, probes, annotations, hierarchical subcircuits  
- ERC: static / deep / dynamic  
- Proteus-style menus, toolbar, light/dark theme, keyboard shortcuts  
- Proteus component alias table for habit migration  

### 4.2 Mixed-signal simulation

- Analog: `AnalogEngine` (MNA + Newton–Raphson; diodes/LEDs/BJTs/op-amps/regulators/relays/pots)  
- Digital: `DigitalEngine` (event-driven; 74HC timing, fanout, setup/hold)  
- MCU: 8051 and Cortex-M3 **in-process** paths (`QemuMcuBridge` = teaching-grade Thumb interpreter—**not** external QEMU), synced with analog/digital nets (GPIO, ADC, USART)  
- Scheduler: `GlobalScheduler` (nanosecond, adaptive step)  
- Analysis APIs: transient / DC / AC / mixed / noise / Monte Carlo / parameter scan (advanced items gated by `FeatureGate`)  
- Interaction: pushbuttons, pot wipers, relay contacts  
- Fault injection: **9** enum types; wave/batch engines cover a common subset (open/short, cap leak, …)  

### 4.3 MCU debugging

- Intel HEX32 parse and flash fit checks  
- 8051 SFRs, Cortex-M3 core registers, breakpoints (address/data), step in/over  
- Virtual UART log; loopback with instrument UART terminal  

<p align="center">
  <img src="./picture/mcu-debug-panel.png" alt="MCU debug panel: HEX flash, registers, and UART" width="900">
</p>

### 4.4 Virtual instruments

Oscilloscope (multi-channel, timebase, trigger, math/FFT, cursors), logic analyzer, multimeter (four-terminal `V/A/OHM/COM`), DC volt/ammeter, power meter, frequency counter, signal generator, UART terminal (timed scripts).

<p align="center">
  <img src="./picture/instruments-1.png" alt="Virtual oscilloscope waveform example" width="900">
</p>

<p align="center">
  <img src="./picture/instruments-2.png" alt="Virtual instruments panel example" width="900">
</p>

### 4.5 AI-assisted design

Natural-language device select, layout constraints, net planning, global/local routing, oneshot / modular-parallel generation, multi-turn **edit** increments, static/dynamic diagnosis, waveform analysis, parameter tips, replacement devices, BOM optimization. Full loop in [Section 6](#6-ai-closed-loop-pipeline).

Production requires a **real LLM + local hard engines**; **no** lab-template / `CircuitTemplates` keyword shortcuts posing as AI generation. Lab templates load only via the teaching panel.

<p align="center">
  <img src="./picture/ai-gen-process-1.png" alt="AI schematic generation: select and layout constraints" width="900">
</p>

<p align="center">
  <img src="./picture/ai-gen-process-2.png" alt="AI schematic generation: net-plan and routing" width="900">
</p>

<p align="center">
  <img src="./picture/ai-gen-process-3.png" alt="AI schematic generation: commit and self-review" width="900">
</p>

### 4.6 Projects & extensibility

- `.schsim` save/load, autosave, crash guard, session restore  
- Import: Proteus / KiCad / LTspice **basic parsers** (common subsets, not full EDA parity)  
- Export: PNG / SVG (`exportSchImage`), minimal PDF, wave CSV, BOM / netlist  
- Collaboration: local snapshots, project locks, annotations; **live WebSocket sync needs an external server** (skeleton)  
- Plugins: manifest parse, signature check, permission gates; sandbox is a **permission-gated stub executor** (not a full script VM)  
- Licensing: `LicenseManager` / `TrialManager` / `FeatureGate` (Monte Carlo, fault injection, plugins, …)  

---

## 5. Architecture

### 5.1 Layered view

```
┌─────────────────────────────────────────────────────────────┐
│  entry (HAP)   UI shell · AppService façade · SimWorker host │
├─────────────────────────────────────────────────────────────┤
│  features/* (HAR)                                             │
│  schematic_editor │ component_library │ simulation_kernel     │
│  hex_debugger │ instruments │ ai_engine │ ai_api_manager      │
│  file_persistence │ plugin_system                             │
├─────────────────────────────────────────────────────────────┤
│  common (HAR)  SchTopology · ErrCode · EventBus · ERC · license│
├─────────────────────────────────────────────────────────────┤
│  Assets  DeviceLibrary · skill/prompts · Test_Template · HEX  │
│          (ai_prompt_lib = legacy JSON; authority is skill)    │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Shared contract: `SchTopology`

Editor, simulation kernel, AI pipeline, persistence, plugins, and teaching templates share one topology model (device instances, nets, wires, buses, probes, net labels, subcircuits, ERC errors). `TopologyAdapter` bridges document models and topology so modules stay interoperable.

### 5.3 EventBus decoupling

`EventBus` covers schematic changes, sim start/stop/step, MCU state, AI progress, file I/O, ERC completion, wave refresh, breakpoint hits, UART, license changes, and more. `AppService` orchestrates the major modules into end-to-end scenarios.

### 5.4 Simulation threading

`SimWorkerHost` implements a ThreadWorker path, but **`ENABLE_THREAD_WORKER = false` by default** (until frame payloads are dictionary-diffed, to avoid starving MMI). Production uses a **main-thread budget pump (~40 ms)** for UI fluidity; Worker remains optional / roadmap.

```
UI / AppService
    → SimWorkerHost
        → [default] main-thread budget pump → SimulationKernelImpl → frame snapshots
        → [optional · currently off] ThreadWorker (SimWorker) → same
    → SimFrameStore → instrument panels / canvas refresh
```

### 5.5 Module dependencies

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

## 6. AI Closed-Loop Pipeline

`AiPipelineOrchestrator` / `IAiEngine.runFullPipeline` turns a natural-language request into a simulatable topology. Complex circuits can switch `generateStrategy: 'modular'` for the parallel path.

### 6.1 Oneshot full pipeline

```
User prompt
    │
    ▼
① CircuitIntent rule classification (keywords / heuristics — not a lab-template shortcut)
    │
    ▼
② LLM device select → LlmJsonNormalizer → DeviceSelectEngine (anti-hallucination / OOD)
    │
    ▼
③ Inject DeviceUsageManual → LLM layout constraints → PlacementOptimizer / GA
    │
    ▼
④ LLM net_plan (pin-level nets) → NetPlanExecutor (production path; SemanticNetBuilder is skipLlm-only)
    │
    ▼
⑤ LLM routing constraints → ConstrainedWiringEngine (A*, analog/digital/xtal weights)
    │
    ▼
⑥ ERC + geometry gates → LLM self_review repair
    │
    ▼
Editable · simulatable · teachable SchTopology
```

Hard production rule: device-select / net_plan LLM failure **aborts with an error**—no silent template fake schematic; `CircuitTemplates` keyword matching is disabled.

### 6.2 Modular parallel

```
User chooses “modular”
    → ① LLM modular_plan (overview + modules[] + joints[], hard gates)
    → ② Promise.all: isolated orchestrators runFullPipeline(sub-prompt) in parallel
    → ③ pin-to-pin joint merge + unified power rails + ERC / geometry gates
    → Commit to canvas (replace / append to empty area)
```

Gate highlights: 2–4 modules, boundary pins present, joints resolvable, in-library models, power joints required; KEEP_RETRY critique loops on failure—**no** silent template fake schematic.

### 6.3 API highlights

| Capability | API highlights |
|------------|----------------|
| Full loop | `runFullPipeline` (`generateStrategy: oneshot \| modular`) |
| Modular parallel | `runModularParallelPipeline` |
| Step tasks | `aiSelectDevices` / `aiPlaceDevices` / `aiAutoRoute*` |
| Incremental edit | `generationMode: 'edit'` (multi-turn deltas; do not rebuild from scratch) |
| Generation | `aiGenFullSchematic` / `aiGenSubCircuit` (legacy; production full-gen uses `runFullPipeline`) |
| Diagnosis | `aiStaticDiagnose` / `aiDynamicDiagnose` / `aiAnalyzeWave` |
| Engineering aids | `aiRecommendParam` / `aiGetReplaceDevice` / `aiOptimizeBom` |

Provider templates cover Doubao, Tongyi, DeepSeek, Wenxin, Zhipu, Kimi, OpenAI, Claude, Gemini, Ollama, and more (**17**), with per-task binding and quota controls.

---

## 7. Simulation & Debugging

| Area | Capabilities |
|------|----------------|
| Engines | AnalogEngine, DigitalEngine, MCU (8051 / Cortex-M3), GlobalScheduler |
| SPICE | SpiceMatrixBuilder, SpiceRunner; Ngspice NAPI **stub** (`native=false` → in-house AnalogEngine) |
| MCU bridge | `QemuMcuBridge`: **in-process** teaching Thumb interpreter + register model (not external QEMU; full peripheral QEMU is roadmap) |
| Analysis | Parameter scan, Monte Carlo, noise analysis (`FeatureGate`-gated) |
| Faults | 9 enum types; wave/batch engines cover a common subset |
| Debug | HEX load, address/data breakpoints, stepping, registers/memory, UART |
| Instruments | Live waves, protocol decode, meter readings bound to nets |
| Threading | Default main-thread budget pump; ThreadWorker implemented but off by default |

---

## 8. Device Library & Lab Templates

### 8.1 Device library (**82** runtime devices)

The authoritative runtime catalog is `component_library` built-ins (`BuiltinComponents` / `ALL_CATALOG_LIBRARY_IDS`). On-disk `DeviceLibrary/` holds tri-part samples and shared SVGs.

| Category | Count | Examples |
|----------|-------|----------|
| Power rails / sources | 5 | VCC, GND, **VEE**, VAC, **SIGNAL_GEN** (instrument-class source) |
| Passive | 23 | R×8, POT×3, C×8, L, XTAL×2, FUSE |
| Discrete | 10 | 1N4148/4007/5819, LED_RED/GREEN/BLUE, BJT, MOS |
| Analog IC | 8 | **UA741** (single), **LM358/TL082** (dual), **LM555**, 7805/7812, AMS1117, LM2596 |
| Digital IC | 7 | 74HC00/02/04/08/32, **74HC74 (XOR in this library, not a D-FF)**, CD4017 |
| Memory | 4 | 2764, 62256, 24C02, W25Q64 |
| MCU | 9 | AT89C51/C52, STC89C52, STC15W408AS; STM32F103C8/RC, F407VG, L431CB, F030F4 |
| Peripheral & sensor | 8 | SW_PUSH, RELAY_SPDT, BUZZER, LCD1602, OLED; DS18B20, HALL, LDR |
| Virtual instruments | 8 | OSCILLOSCOPE, VIRTUAL_METER, LOGIC_ANALYZER, UART_TERMINAL, V/I/power/freq meters |

**Tri-part format:** `{id}.meta.json` + `{id}.symbol.svg` + `{id}.model.*`

**Op-amp pick tip:** single/classic → UA741; dual / single-supply → LM358; high-Z dual-supply → TL082. Spoken “LED / LED lamp” → `LED_RED|GREEN|BLUE` (series current-limit R required).

### 8.2 Twenty lab templates

| ID | Lab | Teaching focus | HEX |
|----|-----|----------------|-----|
| `lab_power` | DC power | Regulation, filtering, fuse | — |
| `lab_amp` | Op-amp | Virtual short/open, gain | — |
| `lab_filter` | RC filter | Cutoff, buffer | — |
| `lab_51_led` | 8051 LED chase | GPIO, timer, series R | ✓ |
| `lab_uart` | UART | Baud, TX/RX cross | ✓ |
| `lab_passive` | Passive check | Divider, decoupling, LC | — |
| `lab_discrete` | Discrete check | Rectify, switch, limit | — |
| `lab_analog_ic` | Analog IC | Op-amp, LDO, Buck | — |
| `lab_digital` | Digital logic | Gates, counter, LA | — |
| `lab_memory` | Memory I/F | Parallel / I2C / SPI | ✓ |
| `lab_mcu_8051` | 8051 family | Min-system, xtal, reset | ✓ |
| `lab_mcu_stm32` | STM32 family | Cortex-M, HSE, NRST | ✓ |
| `lab_peripheral` | Peripherals | GPIO, relay, display | ✓ |
| `lab_sensor` | Sensors | 1-Wire, digital in, ADC | ✓ |
| `lab_instruments` | Instruments | V/I/scope binding | — |
| `lab_potentiometer` | Potentiometer | Wiper, divider ratio | — |
| `lab_schmitt` | Schmitt trigger | Hysteresis, shaping | — |
| `lab_integrator` | Integrator | Op-amp integrate, τ | — |
| `lab_555_astable` | 555 astable | Multivibrator, duty | — |
| `lab_555_monostable` | 555 monostable | Timing, trigger | — |

Assets: `Test_Template/`, `hex_files/`, `template_manifest.json`. The teaching panel shows coverage metrics and AI Q&A (same source as `DeviceUsageManual`).

<p align="center">
  <img src="./picture/lab-templates-1.png" alt="Lab template example: 8051 LED chase" width="900">
</p>

<p align="center">
  <img src="./picture/lab-templates-2.png" alt="Lab template example: teaching assistant panel" width="900">
</p>

---

## 9. Repository Layout & Modules

```
ElecDraw_Harmony/
├── AppScope/                    # Bundle config & global resources
├── entry/                       # HAP: pages, components, AppService, SimWorker
├── common/                      # Shared types, ERC, EventBus, license
├── features/
│   ├── schematic_editor/        # Schematic edit engine
│   ├── component_library/       # Catalog & loaders
│   ├── simulation_kernel/       # Mixed-signal kernel (+ native/ngspice_napi)
│   ├── hex_debugger/            # HEX / MCU debug
│   ├── ai_engine/               # AI pipeline, PromptLoader, teaching
│   ├── ai_api_manager/          # Multi-vendor API & quotas
│   ├── file_persistence/        # Projects / import-export / collab
│   ├── instruments/             # Virtual instrument engines
│   └── plugin_system/           # Plugin sandbox
├── skill/                       # ★ AI rule book + Prompt authority
│   ├── SKILL.md
│   ├── prompts/                 # Staged md (sync → templates/*.ets)
│   └── references/              # Catalog, ERC, pin maps, …
├── DeviceLibrary/               # Tri-part devices & symbols
├── ai_prompt_lib/               # Legacy LLM prompt JSON (not authority)
├── Test_Template/               # Lab .schsim (20 sets)
├── hex_files/                   # Lab firmware HEX
├── picture/                     # README / brief screenshots (ASCII filenames)
├── tools/                       # HEX/template build & verify scripts
├── docs/                        # Design specs & plans (incl. modular parallel)
├── project/                     # Local project placeholder
├── build-profile.json5
└── oh-package.json5
```

| Module | Role |
|--------|------|
| `entry` | UI shell, orchestration, worker host, theme & shortcuts |
| `common` | `SchTopology`, `ErrCode`, ERC, EventBus, License / FeatureGate |
| `schematic_editor` | Edit commands, layers, topology I/O, sim interlock |
| `component_library` | Built-in catalog, SVG cache, Proteus aliases |
| `simulation_kernel` | Three engines + scheduler + fault injection + SpiceRunner |
| `hex_debugger` | HEX, 8051 / Cortex-M3, breakpoints & behavior sim |
| `ai_engine` | Pipeline orchestration, PromptLoader, GA / A\*, modular parallel, TeachingService |
| `ai_api_manager` | Providers, network modes, quota dashboard |
| `file_persistence` | `.schsim`, crash guard, export, collab skeleton |
| `instruments` | Instrument engines & binding snapshots |
| `plugin_system` | Plugin lifecycle & sandbox |

**Selected UI components:** `SchematicCanvas`, `AppLeftPanel` / `AppRightPanel`, `AiSettingsPanel`, `McuDebugPanel`, `InstrumentPanel`, `FaultInjectionPanel`, `TeachingPanel`, `PlatformSettingsPanel`, and more.

---

## 10. Getting Started

### Requirements

- [DevEco Studio](https://developer.huawei.com/consumer/en/deveco-studio/) 5.0+  
- HarmonyOS SDK API 12+ (product target `5.0.0(12)`)  
- Node.js 18+ (optional, for `tools/`)  
- Cloud AI needs network permission; offline still allows edit / load lab templates / local sim, but **production AI full-gen does not fake schematics from templates** (device-select / net_plan need a cloud LLM; failures surface as clear errors)  

### Permissions

| Permission | Purpose |
|------------|---------|
| `ohos.permission.INTERNET` | Cloud AI APIs |
| `ohos.permission.READ_MEDIA` / `WRITE_MEDIA` | Project file I/O |
| `ohos.permission.sec.ACCESS_UDID` | License / hardware fingerprint |

### Run

1. Clone the repo and open the **repository root** in DevEco Studio.  
2. Wait for `ohpm install` to finish.  
3. Select a **2in1** device or PC emulator.  
4. Click **Run** to build and launch `entry`.  

```bash
ohpm install
# Optional: rebuild lab HEX
node tools/_build_lab_mcu_stm32_hex.mjs
python tools/_build_lab_uart_hex.py
```

### Optional icons

- `AppScope/resources/base/media/app_icon.png`  
- `entry/src/main/resources/base/media/startIcon.png`  
- `entry/src/main/resources/base/media/layered_image.json`  
- Source art: `ico/ico.png`  

---

## 11. Demo Script for Judges

Suggested 5–8 minute recording emphasizing **engineered Prompt → simulatable topology → teachable verification**:

1. **Launch & shell** — Splash → Proteus-style main UI; library & navigator.  
2. **Teaching template** — Load `lab_uart` / `lab_555_astable`; show coverage and tips.  
3. **HEX debug** — Burn companion HEX, run sim, UART echo / LED chase.  
4. **Instruments** — Open `lab_amp` / `lab_filter`; observe op-amp or RC on the scope.  
5. **AI Prompt loop** — Prompt “STM32 min-system + LED”; show select / layout / net-plan / route / self-review and ERC.  
6. **Modular parallel (bonus)** — Complex request with “modular”; show plan → parallel sub-gens → joint merge.  
7. **Fault injection** — Inject resistor-open (etc.), batch scan, compare waves / diagnosis.  
8. **Project polish** — Save `.schsim`, theme toggle, AI quota / offline mode (optional).  

---

## 12. Application Scenarios

| Scenario | Value |
|----------|-------|
| University analog / digital / MCU labs | Schematic-level experiments without a board; Prompt-driven Q&A and topology gen |
| Electronics / embedded contest training | Fast circuits, HEX burn, waves & serial; modular parallel for complex briefs |
| Engineer pre-validation | AI draft + local sim to catch errors before hardware |
| HarmonyOS classrooms / 2in1 terminals | Native OS deployment, less Windows dependency |
| AI + EDA teaching demos | Full staged-Prompt engineering story—ideal for courses and reviews |

---

## 13. Engineering Quality

| Kind | Where / how |
|------|-------------|
| AI acceptance suite | `AiPipelineValidator`: min-system+LED, hallucination chip block, modular-merge checks, API-failure degrade; via `runValidationSuite()` |
| Engineering verify scripts | `tools/lab_templates/verify_*.mjs` (MNA, diode Newton, digital logic, geometry audit, template merge, …) |
| Template & firmware builders | `tools/_build_lab_*.py` / `.mjs`, `tools/lab_templates/` |
| Prompt sync | `skill/prompts` ↔ `features/ai_engine/.../templates/*.ets` |
| Unit-test framework | Root dep `@ohos/hypium` (expanding) |
| Native integration notes | `features/simulation_kernel/native/ngspice_napi/README.md` |

**Honest boundaries:**

- Ngspice NAPI remains a stub (`native=false`); default is the in-house AnalogEngine  
- MCU: in-process Thumb / 8051 teaching models; **external QEMU peripheral-level sim** is roadmap  
- Sim thread: default main-thread budget pump; ThreadWorker exists but is off by default  
- Fault injection / plugin sandbox / live collab: skeleton or subset—do not equate to full desktop EDA  
- Hypium automation is expanding; core acceptance is `AiPipelineValidator` + `tools/lab_templates/verify_*.mjs`  

---

## 14. Roadmap

1. **Ngspice NAPI** — Cross-compile Ngspice; replace analog fallback path  
2. **External QEMU-MCU** — Full STM32 peripheral-level simulation (replace in-process teaching interpreter)  
3. **Prompt / Skill toolchain** — Semi-auto md→ets sync and regression diffs  
4. **Library growth** — Bulk tri-part import, fuller Proteus `.lib` compatibility  
5. **Performance** — Enable ThreadWorker stably (frame diffs); large-schematic rendering  
6. **Collab & cloud** — Real-time co-edit and lab report sync  
7. **Testing** — Broader Hypium automation and acceptance cases  
8. **Fault injection / plugin sandbox** — Complete engine and executor coverage  

---

## 15. License & Notices

- License: **Apache-2.0** (see root `oh-package.json5`)  
- “Proteus” is used only as a capability/UI reference; no affiliation with Labcenter  
- Cloud AI depends on third-party terms and quotas; offline edit/sim/lab templates are available—**no** silent template posing as AI full-gen  

---

**ElecDraw · AI-SCH Simulator · HarmonyOS NEXT**
