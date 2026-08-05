# AI-SCH Simulator

**Schematic-centric hardware simulation, PCB layout, and AI-assisted circuit design on HarmonyOS NEXT**

Native HarmonyOS mixed-signal editing and simulation—8051/STM32 HEX debugging, virtual instruments, **PCB 2D layout & 3D board preview**, and closed loops driven by **engineered AI Prompts** and a **multi-agent quality bus**: schematic **clarify → select → place → net-plan → WAR route → QA**, plus PCB **placement → net-plan → layer policy → LLM geometry → QA**. Built for university labs, contest training, and early design verification.

[简体中文](./README.zh-CN.md) | English

**Competition materials:** [作品说明文档 (Project Brief)](./docs/作品说明文档.md)  
**Source / releases:** [GitHub](https://github.com/chuqing-web/AI-Auto-Routing-Hardware-Simulation)

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

Electronics education and embedded prototyping still lean on Windows desktop toolchains. As HarmonyOS NEXT spreads across 2in1 PCs, tablets, and classroom devices, the ecosystem still lacks a tool that is:

1. **Native to HarmonyOS** for schematic-level simulation **and** PCB layout;  
2. Capable of **analog / digital / MCU** mixed-signal labs plus **SCH↔PCB** teaching boards in one product;  
3. Able to turn **LLM output into executable topology and copper-aware boards** (not chat-only Q&A)—with versioned, auditable, evolvable Prompts;  
4. Equipped for teaching: **lab templates (.schsim / .pcbsim), staged power-on, fault injection, coverage metrics**.

**AI-SCH Simulator** (`com.elecdraw.aischsim`, vendor ElecDraw, **v1.1.1**) addresses that gap. It is implemented in ArkTS / ArkUI (Stage model) with modular HAR packages, centered on a shared topology contract—`SchTopology`—across editing, simulation, AI, persistence, and teaching.

| Item | Detail |
|------|--------|
| Product name | AI-SCH Simulator |
| Bundle ID | `com.elecdraw.aischsim` |
| Version | **1.1.1** (`versionCode` **1001001**; `AppScope/app.json5` / `AppVersion.ets` / `oh-package.json5`) |
| Platform | HarmonyOS NEXT · product SDK **`6.1.1(24)`** (`build-profile.json5.example`) |
| Device types | **2in1 (primary)**, tablet, default |
| Stack | ArkTS + ArkUI · Stage model · modular HAR |
| License | [Apache-2.0](LICENSE) |

---

## 2. Innovations

The differentiator is not “another chatbot”—it is **constraining LLMs into simulatable schematics and DRC-checked copper**, then packaging that capability as a teachable, testable, demo-ready application loop.

| # | Innovation | Detail |
|---|------------|--------|
| 1 | **Engineered AI Prompts (single source of truth)** | `skill/prompts/` is the staged Prompt authority (SCH 00–09 + PCB 10–14); mirrored to `templates/*.ets` and loaded by `PromptLoader` at runtime; md↔ets sync prevents drift (device never reads on-disk `skill/`) |
| 2 | **Multi-agent quality bus** | `AgentPipelineCoordinator` + `CircuitBlackboard`: Requirements → Select → Layout → Net → WAR Route → QA; stage critique, `qualityHardFail`, snapshot resume after clarification |
| 3 | **Staged constraint JSON + local hard engines** | Prompts emit structured constraints / geometry plans; GA placement, semantic nets, **WAR** (`WireAutoRouter`), ERC / clearance / DRC gates run locally |
| 4 | **Requirement clarification (A/B/C)** | `RequirementsAgent` asks only topology-critical questions; no silent fake schematic; resume via blackboard snapshot |
| 5 | **Modular parallel generation** | Complex circuits: **oneshot** or **modular**—global plan + boundary gates → parallel sub-pipelines → pin-to-pin joint merge |
| 6 | **Device usage-manual injection** | After library match, inject BOM-scoped `DeviceUsageManual` into layout / net-plan / route |
| 7 | **Native mixed-signal kernel** | In-house MNA analog, event-driven digital, 8051 / in-process Cortex-M3 teaching paths, global nanosecond scheduler |
| 8 | **Teach–sim–diagnose loop** | 20 paired `.schsim` / `.pcbsim` labs + HEX + knowledge tips + staged power-on + fault injection + coverage dashboard; live instrument ↔ net binding |
| 9 | **Multi-vendor AI governance** | **17** provider templates, per-task API binding, quota dashboard, offline / proxy / degrade policies |
| 10 | **PCB 2D/3D + AI copper pipeline** | Multi-layer copper (F/B + In1…In6); `PcbRouteCoordinator`: placement → net-plan → **layer roles for every Cu** → **LLM `pcb_geometry`** → QA; DRC; Gerber / PCB exchange / STEP preview; interactive 3D |

**Versus classic desktop EDA:** native HarmonyOS + executable AI + SCH/PCB teaching loop.  
**Versus chat-only assistants:** staged Prompt engineering, multi-agent gates, topology & copper landing, ERC / DRC / sim verification, diagnosable failures.

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
LLM JSON  →  Agent stages + local engines  →  SchTopology / PcbDocument
```

- **Authoritative copy:** [`skill/prompts/`](./skill/prompts/README.md) (v5.1)  
- **Rule book:** [`skill/SKILL.md`](./skill/SKILL.md)  
- **Pipeline stages:** [`skill/references/pipeline-stages.md`](./skill/references/pipeline-stages.md)  
- **Index:** [`skill/references/prompt-templates.md`](./skill/references/prompt-templates.md)  
- **Loader:** `PromptLoader` (refuses unknown-template silent fallback; refuses empty render)  
- **Legacy:** root `ai_prompt_lib/*.json` is early assets—**current authority is `skill/`**

### 3.2 Staged Prompt map

| Stage | skill file | runtime_key | Role in pipeline |
|-------|------------|-------------|------------------|
| Shared rules | `00_shared_rules.md` | — | Injected via `renderEnriched` |
| Requirement | `09_requirement.md` | `requirement` | `RequirementsAgent`: `RequirementSpec` or A/B/C clarification |
| Device select | `01_device_select.md` | `device_select` | Function modules + in-library models; anti-hallucination / OOD |
| Layout | `02_layout.md` | `layout` | Regions / adjacency / density → GA placement |
| Net plan | `03_net_plan.md` | `net_plan` | Pin-level net list (primary battlefield + usage manual) |
| Route | `04_route.md` | `route` | Analog / digital / xtal weights → WAR |
| Self-review | `05_self_review.md` | `self_review` | ERC + geometry → repair suggestions (QA agent) |
| Diagnosis | `06_diag.md` | `diag` | Static / dynamic diagnosis tasks |
| Legacy full sch | `07_gen_sch.md` | `gen_sch` | Compat path (do not rely on for production full-gen) |
| Modular plan | `08_modular_plan.md` | `modular_plan` | Parallel gen: module boundaries + joint gates |
| PCB placement | `10_pcb_placement.md` | `pcb_placement` | `PcbPlacementAgent`: footprint poses (no track coords) |
| PCB net plan | `11_pcb_net_plan.md` | `pcb_net_plan` | `PcbNetPlanAgent`: forceTrack / pour / defer per net |
| PCB route policy | `12_pcb_route.md` | `pcb_route` | `PcbRoutePolicyAgent`: **every copper layer** gets a role |
| PCB QA repair | `13_pcb_qa_repair.md` | `pcb_qa_repair` | `PcbQaAgent`: DRC / missing-layer repair decisions |
| PCB geometry | `14_pcb_geometry.md` | `pcb_geometry` | `PcbGeometryAgent`: ortho polylines + vias; local clearance apply |

Runtime fragments also exist: `IntentPromptFragments`, `DeviceInstrumentFragments`, `EditPlanPrompt`, `StageCapabilities`, injected with shared rules.

### 3.3 Runtime dynamic injection (not static body text)

`PromptLoader` assembles context from topology / BOM / board at call time—avoid dumping the entire library into every prompt:

| Injection | Purpose |
|-----------|---------|
| `library_catalog` / libDevId list | Select & modular plan stay in-library |
| `DeviceUsageManual` (full / compact) | Pin-level wiring & anti-patterns |
| Pin world coords / selection AABB | Geometry-aware net_plan |
| Named pin defaults | MCU / op-amp pin geometry (`NamedDevicePinDefaults`) |
| Wire-path / density reports | Geometry coverage for self_review |
| Board outline / copper / pad_blocks | `pcb_geometry` orthogonal routing context |
| Topology anti-pattern guards | Enriched safeguards |

### 3.4 Maintenance contract

1. Change rules → edit `skill/SKILL.md`  
2. Change a stage’s wording → edit the matching `skill/prompts/0x_*.md` (incl. `14_pcb_geometry.md`)  
3. **Must** sync the same `*Prompt.ets`, or App behavior will not change  
4. Keep geometry constants aligned with code (`HIT_PAD=22`, foreign-pin clearance ≥20 mil, …)  

---

## 4. Feature Overview

### 4.1 App shell & home

- `SplashPage` → `HomePage` → schematic (`Index`) or PCB (`PcbPage`)  
- Home: Getting Started / Start / Help / About; announcement panel; GitHub release news (`HomeAnnouncementService` / `HomeReleaseService`)  
- Project wizard for `.schsim` / `.pcbsim`; recent projects; recovery prompts  
- Licensing strip: Free by default; Pro unlock via GitHub Star + OAuth Device Flow  

### 4.2 Schematic editing

- Canvas interaction, layers, grid snap, undo/redo, batch align/distribute  
- Buses, net labels, probes, annotations, hierarchical subcircuits  
- ERC: static / deep / dynamic  
- Menus, toolbar, light/dark theme, keyboard shortcuts  
- Component alias table for habit migration  
- Named device pins + WAR route ordering (shared with AI routing)

### 4.3 Mixed-signal simulation

- Analog: `AnalogEngine` (MNA + Newton–Raphson; diodes/LEDs/BJTs/op-amps/regulators/relays/pots)  
- Digital: `DigitalEngine` (event-driven; 74HC timing, fanout, setup/hold)  
- MCU: 8051 and Cortex-M3 **in-process** paths (`QemuMcuBridge` = teaching-grade Thumb interpreter—**not** an external full-system emulator), synced with analog/digital nets (GPIO, ADC, USART)  
- Scheduler: `GlobalScheduler` (nanosecond, adaptive step)  
- Analysis APIs: transient / DC / AC / mixed / noise / Monte Carlo / parameter scan  
- Interaction: pushbuttons, pot wipers, relay contacts  
- Fault injection: **9** enum types; wave/batch engines cover a common subset  

### 4.4 MCU debugging

- Intel HEX32 parse and flash fit checks  
- 8051 SFRs, Cortex-M3 core registers, breakpoints (address/data), step in/over  
- Virtual UART log; loopback with instrument UART terminal  

<p align="center">
  <img src="./picture/mcu-debug-panel.png" alt="MCU debug panel: HEX flash, registers, and UART" width="900">
</p>

### 4.5 Virtual instruments

Oscilloscope (CH1–4, timebase, trigger, math/FFT, cursors), logic analyzer, multimeter (four-terminal `V/A/OHM/COM`), DC volt/ammeter, power meter, frequency counter, signal generator, UART terminal (timed scripts). Engines live under `features/instruments/.../engines/`; the side panel binds live nets and refreshes from sim frames.

**Oscilloscope display path (current):**

| Layer | Behavior |
|-------|----------|
| Side panel | ROLL write → scroll; auto timebase / V/div from live signal; windowed capture for CRT-style refresh |
| Full-history API | `getOscilloscopeWaveFull` / `captureWaveFullHistory` — peak-preserved export of the whole run |
| Expand overlay | Double-click a wave → `InstrumentWaveExpandOverlay`: default **fit-all**, zoom/pan, “全览” reset |
| Canvas | `OscilloscopeWaveCanvas`: min/max envelope per pixel; NaN gaps during write-fill |

<p align="center">
  <img src="./picture/instruments-1.png" alt="Virtual oscilloscope waveform example" width="900">
</p>

<p align="center">
  <img src="./picture/instruments-2.png" alt="Virtual instruments panel example" width="900">
</p>

### 4.6 AI-assisted design

Natural-language **requirement understanding** (optional A/B/C clarification), device select, layout constraints, net planning, WAR routing, oneshot / modular-parallel generation, multi-turn **edit** increments, **self-check** (WAR + QA), static/dynamic diagnosis, waveform analysis, parameter tips, replacement devices, BOM optimization. Full loop in [Section 6](#6-ai-closed-loop-pipeline).

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

### 4.7 Projects & extensibility

- `.schsim` / `.pcbsim` save/load, autosave, crash guard, session restore  
- Import: **basic parsers** for common third-party schematic formats (common subsets, not full EDA parity)  
- Export: PNG / SVG (`exportSchImage`), minimal PDF, wave CSV, BOM / netlist; PCB **Gerber** / **PCB exchange file** / simplified STEP  
- Collaboration: local snapshots, project locks, annotations; **live WebSocket sync needs an external server** (skeleton)  
- Plugins: manifest parse, signature check, permission gates; sandbox is a **permission-gated stub executor**  
- Licensing: `LicenseManager` / `FeatureGate`; **Free tier by default**; unlock Pro via GitHub OAuth Device Flow after starring [`HarmonyOS-Hardware-AI-Auto-Routing-Simulation`](https://github.com/chuqing-web/HarmonyOS-Hardware-AI-Auto-Routing-Simulation); **re-check on every launch; offline = Free**  

### 4.8 PCB layout & 3D preview

PCB workspace (`features/pcb_editor` + `entry` `PcbPage` / `PcbCanvas`):

| Capability | Detail |
|------------|--------|
| Layers | F.Cu / B.Cu, In1…In6, silk / mask / paste, Edge.Cuts; configurable copper count (2 / 4 / 6 / 8) |
| Edit tools | Select, route (90° / 45° / arc), via (through / blind / buried), pour & polygon zones, outline, measure, place footprint |
| SCH↔PCB | `forwardAnnotateFromSchematic` / `reverseAnnotateToSchematic`; ratsnest; pad–net binding |
| Auto-route | Classic L-chain `runAutoRoute`; AI path `aiPcbAutoRoute` → `PcbRouteCoordinator` + LLM geometry / local clearance fallback |
| DRC | Clearance, shorts, unconnected, missing copper usage (`ensureAllCopperUsed` for teaching boards) |
| 2D view | Layer solo / dim / overlay, net highlight, shove & serpentine helpers |
| 3D view | Orbit / presets / ortho, realistic · x-ray · explode · cutaway · heightmap; optional STEP bind & PBR/MSAA |
| Export | Gerber set, PCB exchange file, simplified STEP preview |

<p align="center">
  <img src="./picture/pcb-2D.png" alt="PCB 2D copper layout and placement" width="900">
</p>

<p align="center">
  <img src="./picture/pcb-3D.png" alt="PCB 3D board preview" width="900">
</p>

---

## 5. Architecture

### 5.1 Layered view

```
┌─────────────────────────────────────────────────────────────┐
│  entry (HAP)                                                 │
│  Splash → Home → Index / PcbPage · AppService · SimWorker    │
├─────────────────────────────────────────────────────────────┤
│  features/* (HAR) × 10                                        │
│  schematic_editor │ pcb_editor │ component_library            │
│  simulation_kernel │ hex_debugger │ instruments               │
│  ai_engine │ ai_api_manager │ file_persistence │ plugin_system│
├─────────────────────────────────────────────────────────────┤
│  common (HAR)  SchTopology · PcbDocument · ERC/DRC helpers    │
│               WAR · pcb_route · Gerber / exchange / License   │
├─────────────────────────────────────────────────────────────┤
│  Assets  DeviceLibrary · skill/prompts · Test_Template        │
│          (.schsim + .pcbsim) · hex_files · picture            │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Shared contracts: `SchTopology` & `PcbDocument`

Editor, simulation kernel, AI pipeline, persistence, plugins, and teaching templates share **`SchTopology`**. The PCB path shares **`PcbDocument`**. Forward/reverse annotators and `TopologyAdapter` keep SCH ↔ PCB interoperable.

### 5.3 EventBus decoupling

`EventBus` covers schematic / PCB changes, sim start/stop/step, MCU state, AI progress, file I/O, ERC/DRC, wave refresh, breakpoints, UART, license changes, and more. `AppService` orchestrates end-to-end scenarios.

### 5.4 Simulation threading

`SimWorkerHost` implements a ThreadWorker path, but **`ENABLE_THREAD_WORKER = false` by default**. Production uses a **main-thread budget pump (~40 ms)** for UI fluidity; Worker remains optional / roadmap.

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
├── pcb_editor            → common
├── component_library     → common
├── simulation_kernel     → common
├── hex_debugger          → common
├── instruments           → common
├── file_persistence      → common
├── plugin_system         → common
├── ai_api_manager        → common
└── ai_engine             → common, ai_api_manager, component_library
    ├── algorithms/agents/       # SCH multi-agent quality bus
    └── algorithms/pcb_agents/   # PCB AI route coordinator
```

Modules are declared in `build-profile.json5` (local copy from `.example`). Root package name: `aischsim` (`oh-package.json5`).

---

## 6. AI Closed-Loop Pipeline

Production path: `AiEngineImpl.runFullPipeline` → **`AgentPipelineCoordinator`**. Legacy `AiPipelineOrchestrator` remains the shared executor / modular merge backend and the `skipLlm` fallback.

PCB AI path: `aiPcbAutoRoute` → **`PcbRouteCoordinator`**.

### 6.1 Oneshot (multi-agent)

```
User prompt
    │
    ▼
⓪ RequirementsAgent → RequirementSpec
       or need_clarification (A/B/C + UI free-text D) → save BlackboardSnapshot → NO commit
    │ (after answers: resume / re-run)
    ▼
① SelectAgent → LLM device select → DeviceSelectEngine (anti-hallucination / OOD)
    │
    ▼
② LayoutAgent → LLM layout constraints → PlacementOptimizer / GA
    │
    ▼
③ NetAgent → LLM net_plan → NetPlanExecutor (production; SemanticNetBuilder is skipLlm-only)
    │
    ▼
④ RouteAgent → WAR / WireAutoRouter (same engine as the schematic editor)
    │
    ▼
⑤ QaAgent → ERC + geometry + limited WAR re-route / finalize (≤2 fix rounds)
    │
    ▼
Editable · simulatable · teachable SchTopology
```

Hard production rules: device-select / net_plan / QA residual failures **abort with empty topology**—no silent template fake schematic; `qualityHardFail` defaults **on** for LLM runs.

### 6.2 Modular parallel

```
User chooses “modular”
    → AgentPipelineCoordinator.runModular
    → ① LLM modular_plan (overview + modules[] + joints[], hard gates)
    → ② Promise.all: ModularModuleAgent / isolated sub-pipelines in parallel
    → ③ pin-to-pin joint merge + unified power rails + ERC / geometry gates
    → Commit to canvas (replace / append to empty area)
```

### 6.3 PCB AI copper pipeline

```
PcbDocument (after forward annotate / load .pcbsim)
    │
    ▼
① PcbPlacementAgent → LLM pcb_placement → PlacementExecutor
    │
    ▼
② PcbNetPlanAgent → LLM pcb_net_plan (forceTrack / pour / defer)
    │
    ▼
③ PcbRoutePolicyAgent → LLM pcb_route (layerRoles cover ALL Cu layers)
    │
    ▼
④ PcbGeometryAgent → LLM pcb_geometry (ortho tracks + vias)
       → applyLlmPcbGeometry (clearance / pad reachability)
       → fallback: runPcbGeometryRoute; ensureAllCopperUsed
    │
    ▼
⑤ PcbQaAgent → DRC + LLM pcb_qa_repair (rip / re-place / role patch / re-geometry)
    │
    ▼
Routable · DRC-checked PcbDocument (2D edit + 3D preview)
```

Hard rules: placement / net-plan / layer-policy stages emit **poses and policies**—not freestyle CAD dumps; **geometry stage** may emit orthogonal polylines + vias, then local engines validate clearance and connectivity; teaching labs prefer clash≈0 / every copper layer used.

### 6.4 API highlights

| Capability | API highlights |
|------------|----------------|
| Full SCH loop | `runFullPipeline` → Coordinator (`generateStrategy: oneshot \| modular`) |
| Modular parallel | `runModular` / `runModularParallelPipeline` |
| Self-check | `runSelfCheckPipeline` (WAR + QA) |
| Clarification resume | `clarificationAnswers` + `resumeSnapshotJson` / `getLastAgentSnapshotJson` |
| Step tasks | `aiSelectDevices` / `aiPlaceDevices` / `aiAutoRoute*` |
| Incremental edit | `generationMode: 'edit'` |
| Diagnosis | `aiStaticDiagnose` / `aiDynamicDiagnose` / `aiAnalyzeWave` |
| Engineering aids | `aiRecommendParam` / `aiGetReplaceDevice` / `aiOptimizeBom` |
| PCB AI route | `aiPcbAutoRoute` → `PcbRouteCoordinator`; editor `applyAiRouteResult` / `runAutoRoute` |
| SCH↔PCB | `forwardAnnotateFromSchematic` / `reverseAnnotateToSchematic` |

Provider templates (**17**): Doubao, Qwen, DeepSeek, Wenxin, Zhipu, Kimi, Yi, Baichuan, SiliconFlow, OpenAI, Claude, Gemini, Mistral, Groq, OpenRouter, Ollama, Custom.

---

## 7. Simulation & Debugging

| Area | Capabilities |
|------|----------------|
| Engines | AnalogEngine, DigitalEngine, MCU (8051 / Cortex-M3), GlobalScheduler |
| SPICE path | SpiceMatrixBuilder, SpiceRunner; native SPICE NAPI **stub** (`native=false` → in-house AnalogEngine) |
| MCU bridge | `QemuMcuBridge`: **in-process** teaching Thumb interpreter (not an external full-system emulator) |
| Analysis | Parameter scan, Monte Carlo, noise analysis |
| Faults | 9 enum types; wave/batch engines cover a common subset |
| Debug | HEX load, address/data breakpoints, stepping, registers/memory, UART |
| Instruments | Live waves, protocol decode, meter↔net binding; scope full-history expand |
| PCB board | Forward/reverse annotate, classic + AI copper route, DRC, 2D/3D preview, Gerber / PCB exchange export |
| Threading | Default main-thread budget pump; ThreadWorker implemented but off by default |

---

## 8. Device Library & Lab Templates

### 8.1 Device library (**82** runtime / **83** on-disk)

Authoritative runtime catalog: `component_library` `BuiltinComponents` (**82**). On-disk `DeviceLibrary/` holds tri-part samples + `index.lib.json` (**83**; extra `STM32F103C8T6` aliases to teaching `STM32F103C8`).

| Category | Runtime | On-disk folder | Examples |
|----------|---------|----------------|----------|
| Power rails / sources | 5 | `Power/` (4) + `SIGNAL_GEN` under `Instrument/` | VCC, GND, VEE, VAC, **SIGNAL_GEN** |
| Passive | 23 | `Passive/` | R×8, POT×3, C×8, L, XTAL×2, FUSE |
| Discrete | 10 | `Discrete/` | 1N4148/4007/5819, LED_RED/GREEN/BLUE, BJT, MOS |
| Analog IC | 8 | `AnalogIC/` | UA741, LM358, TL082, LM555, 7805/7812, AMS1117, LM2596 |
| Digital IC | 7 | `DigitalLogic/` | 74HC00/02/04/08/32, **74HC74 (XOR in this library)**, CD4017 |
| Memory | 4 | `Memory/` | 2764, 62256, 24C02, W25Q64 |
| MCU | 9 | `MCU/` (10 incl. C8T6 alias) | AT89C51/C52, STC89C52, STC15W408AS; STM32F103C8/RC, F407VG, L431CB, F030F4 |
| Peripheral | 5 | `Peripheral/` | SW_PUSH, RELAY_SPDT, BUZZER, LCD1602, OLED |
| Sensor | 3 | `Sensor/` | DS18B20, HALL_SENSOR, LDR |
| Virtual instruments | 8 | `Instrument/` (9 with SIGNAL_GEN) | OSC, VIRTUAL_METER, LA, UART, V/I/power/freq meters |

**Tri-part format:** `{id}.meta.json` + `{id}.symbol.svg` + `{id}.model.*`  
**Also:** `Common/` (shared SVG), `UserCustom/`

**Op-amp tip:** single/classic → UA741; dual / single-supply → LM358; high-Z dual-supply → TL082. Spoken “LED” → `LED_RED|GREEN|BLUE` (series R required).

### 8.2 Twenty paired lab templates

Each official lab ships **`.schsim` + `.pcbsim`** (`template_manifest.json` `pcbFile`). Hand-laid copper aims for clash≈0 and used inner layers when Cu≥4.

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
| `lab_digital_gates` | Digital gates | SW truth table, 74HC×6+CD4017 LEDs | — |
| `lab_schmitt` | Schmitt trigger | Hysteresis, shaping | — |
| `lab_integrator` | Integrator | Op-amp integrate, τ | — |
| `lab_555_astable` | 555 astable | Multivibrator, duty | — |
| `lab_555_monostable` | 555 monostable | Timing, trigger | — |

Assets: `Test_Template/` (20× `.schsim` + 20× `.pcbsim`), `hex_files/` (7 HEX), packed into `entry/.../rawfile/`. Builders/audits under `tools/lab_templates/` and `tools/pcb_templates/`. Teaching UI: `TeachingPanel` / `PcbTeachingPanel`.

> Note: `lab_differentiator.schsim` may exist as a draft; it is **not** in the official 20-pair manifest.

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
├── entry/                       # HAP: UI shell + orchestration
│   ├── src/main/ets/
│   │   ├── pages/               # SplashPage · HomePage · Index · PcbPage
│   │   ├── services/            # AppService · HomeAnnouncement · HomeRelease
│   │   ├── components/          # Shell UI, instruments, TeachingPanel, PcbCanvas…
│   │   ├── theme/ · utils/ · workers/
│   │   └── …
│   └── src/main/resources/rawfile/
│       DeviceLibrary / Test_Template / hex_files / i18n / aliases
├── common/                      # Shared HAR
│   └── src/main/ets/
│       ├── types/               # SchTopology · PcbDocument · AI / License types
│       ├── utils/               # ERC/DRC · WAR · Gerber · annotators
│       │   └── pcb_route/       # Geometry route · clearance · placement apply
│       ├── security/            # License · FeatureGate · GitHub OAuth / Star
│       └── engines/             # Shared MCU teaching helpers
├── features/                    # 10 feature HARs (see build-profile modules)
│   ├── schematic_editor/        # Schematic edit + WAR
│   ├── pcb_editor/              # IPcbEditor / PcbEditorImpl
│   ├── component_library/       # BuiltinComponents + loaders
│   ├── simulation_kernel/       # Mixed-signal kernel (+ native SPICE NAPI stub)
│   ├── hex_debugger/            # HEX / MCU debug
│   ├── ai_engine/               # PromptLoader, SCH agents, PCB agents, teaching
│   ├── ai_api_manager/          # 17 provider templates & quotas
│   ├── file_persistence/        # Projects / import-export / collab skeleton
│   ├── instruments/             # Virtual instrument engines
│   └── plugin_system/           # Plugin sandbox
├── skill/                       # ★ AI rule book + Prompt authority (00–14)
│   ├── SKILL.md
│   ├── prompts/                 # SCH 00–09 + PCB 10–14 → templates/*.ets
│   └── references/              # catalog, ERC, pin maps, pipeline-stages, …
├── DeviceLibrary/               # Tri-part devices (83) + index.lib.json
│   AnalogIC · Common · DigitalLogic · Discrete · Instrument
│   MCU · Memory · Passive · Peripheral · Power · Sensor · UserCustom
├── ai_prompt_lib/               # Legacy LLM prompt JSON (not authority)
├── Test_Template/               # 20 paired labs + template_manifest.json
├── hex_files/                   # 7 lab firmware HEX
├── picture/                     # README / brief screenshots
├── tools/                       # Builders, verify, audit, PCB/SCH smoke
│   ├── lab_templates/
│   └── pcb_templates/
├── docs/                        # Competition brief + design plans/specs
│   └── superpowers/             # specs/ · plans/
├── project/                     # Local project placeholder
├── build-profile.json5.example  # ★ Copy → build-profile.json5 (gitignored)
├── oh-package.json5
├── hvigorfile.ts
└── LICENSE
```

> **Note:** `entry/oh_modules/*` and feature `oh_modules/common` are junctions into sources—edit `features/` and `common/`, not the junction copies.  
> **Signing:** `build-profile.json5` is gitignored (may contain cert paths). Copy from `build-profile.json5.example` and fill local signing as needed.

| Module | Role |
|--------|------|
| `entry` | UI shell, home / announcements / releases, orchestration, worker host, theme & shortcuts; instrument panels; **PcbPage / PcbCanvas / 3D** |
| `common` | `SchTopology`, `PcbDocument`, ERC/DRC, EventBus, License / FeatureGate / GitHub auth, WAR, **pcb_route / Gerber / exchange exporters / annotators** |
| `schematic_editor` | Edit commands, layers, topology I/O, sim interlock, WireAutoRouter |
| `pcb_editor` | Layers, route, via, zone, DRC, annotate, classic/AI route apply |
| `component_library` | Built-in catalog, SVG cache, component aliases |
| `simulation_kernel` | Three engines + scheduler + fault injection + SpiceRunner |
| `hex_debugger` | HEX, 8051 / Cortex-M3, breakpoints & behavior sim |
| `ai_engine` | `AgentPipelineCoordinator`, **`PcbRouteCoordinator`**, PromptLoader, GA / WAR, modular parallel, TeachingService |
| `ai_api_manager` | Providers, network modes, quota dashboard |
| `file_persistence` | `.schsim` / `.pcbsim`, crash guard, export, third-party import parsers, collab skeleton |
| `instruments` | `VirtualInstrumentsImpl`, scope/LA/meter engines |
| `plugin_system` | Plugin lifecycle & sandbox |

**SCH agents:** `AgentPipelineCoordinator`, `CircuitBlackboard`, `RequirementsAgent`, `SelectAgent`, `LayoutAgent`, `NetAgent`, `RouteAgent`, `QaAgent`, `StageCritic`, `StageHooks`, `ModularModuleAgent`.

**PCB agents:** `PcbRouteCoordinator`, `PcbPlacementAgent`, `PcbNetPlanAgent`, `PcbRoutePolicyAgent`, `PcbGeometryAgent`, `PcbQaAgent`.

---

## 10. Getting Started

### Requirements

- [DevEco Studio](https://developer.huawei.com/consumer/en/deveco-studio/) with HarmonyOS SDK supporting product **`6.1.1(24)`**  
- Node.js 18+ (optional, for `tools/`)  
- Cloud AI needs network permission; offline still allows edit / load lab templates / local sim, but **production AI full-gen does not fake schematics from templates**

### First-time setup

```bash
# 1. Clone and open the repository root in DevEco Studio
git clone https://github.com/chuqing-web/AI-Auto-Routing-Hardware-Simulation.git
cd AI-Auto-Routing-Hardware-Simulation   # or your local folder name

# 2. Create local build profile (gitignored; may hold signing paths)
cp build-profile.json5.example build-profile.json5
# On Windows PowerShell:
# Copy-Item build-profile.json5.example build-profile.json5

# 3. Install OHPM deps, then Run on a 2in1 device / PC emulator
ohpm install
```

### Permissions (`entry/src/main/module.json5`)

| Permission | Purpose |
|------------|---------|
| `ohos.permission.INTERNET` | Cloud AI APIs |
| `ohos.permission.GET_NETWORK_INFO` | Network status for AI / license flows |
| `ohos.permission.READ_MEDIA` / `WRITE_MEDIA` | Project file I/O |

### Optional tooling

```bash
# Rebuild lab HEX
node tools/_build_lab_mcu_stm32_hex.mjs
python tools/_build_lab_uart_hex.py

# Export runtime catalog → DeviceLibrary tri-part
node tools/export-builtin-device-library.mjs

# PCB AI geometry smokes
node tools/pcb_ai_geo_smoke.mjs
node tools/pcb_ai_llm_geo_smoke.mjs
```

### App icons

- `AppScope/resources/base/media/app_icon.png`  
- `entry/src/main/resources/base/media/startIcon.png`  
- `entry/src/main/resources/base/media/layered_image.json`  

---

## 11. Demo Script for Judges

Suggested 5–10 minute recording emphasizing **engineered Prompt → multi-agent gates → simulatable topology → PCB copper → teachable verification**:

1. **Launch & home** — Splash → Home; announcements / releases; open library & navigator.  
2. **Teaching template** — Load `lab_uart` / `lab_555_astable`; show coverage and tips.  
3. **HEX debug** — Burn companion HEX, run sim, UART echo / LED chase.  
4. **Instruments** — Open `lab_amp` / `lab_filter`; observe on the scope; double-click wave to **fit-all**, then zoom/pan.  
5. **AI Prompt loop** — Prompt “STM32 min-system + LED”; show clarify / select / layout / net-plan / WAR / QA and ERC.  
6. **PCB 2D / 3D** — Open paired `.pcbsim` or forward-annotate; copper layers, ratsnest, classic or AI auto-route (incl. geometry stage); **3D** orbit / cutaway.  
7. **Modular parallel (bonus)** — Complex request with “modular”; plan → parallel sub-gens → joint merge.  
8. **Self-check / fault injection** — AI self-check, or inject resistor-open and compare waves / diagnosis.  
9. **Project polish** — Save `.schsim` / `.pcbsim`, Gerber preview, theme toggle, AI quota / offline mode (optional).  

---

## 12. Application Scenarios

| Scenario | Value |
|----------|-------|
| University analog / digital / MCU labs | Schematic-level experiments without a board; paired PCB templates; Prompt-driven Q&A and topology gen |
| Electronics / embedded contest training | Fast circuits, HEX burn, waves & serial; modular SCH + AI PCB copper |
| Engineer pre-validation | AI draft + local sim + Gerber / PCB exchange export before hardware |
| HarmonyOS classrooms / 2in1 terminals | Native OS deployment, less Windows dependency |
| AI + EDA teaching demos | Full staged-Prompt + multi-agent SCH/PCB story |

---

## 13. Engineering Quality

| Kind | Where / how |
|------|-------------|
| AI acceptance suite | `AiPipelineValidator` via `runValidationSuite()` |
| Multi-agent gates | `qualityHardFail`, stage critique, QA residual abort, `usedLlm` commit gates |
| PCB route gates | Layer-role coverage, geometry clearance, DRC residual, `ensureAllCopperUsed` |
| Engineering verify | `tools/lab_templates/verify_*.mjs` |
| PCB template tooling | `tools/pcb_templates/` hand-layout / splice / export; `tools/test_pcb_*.mjs` |
| Audit / smoke | `tools/_audit_*.mjs`, `osc_*_smoke.mjs`, `war_route_order_smoke.mjs`, `pcb_ai_*_smoke.mjs` |
| Catalog export | `tools/export-builtin-device-library.mjs` |
| Prompt sync | `skill/prompts` (00–14) ↔ `features/ai_engine/.../templates/*.ets` |
| Unit-test framework | Root dep `@ohos/hypium` (expanding) |
| Native notes | `features/simulation_kernel/native/` (SPICE NAPI stub) |
| Design specs | `docs/superpowers/specs/`, `docs/superpowers/plans/` |

**Honest boundaries:**

- Native SPICE NAPI remains a stub (`native=false`); default is the in-house AnalogEngine  
- MCU: in-process Thumb / 8051 teaching models; **external full-system MCU emulator** is roadmap  
- Sim thread: default main-thread budget pump; ThreadWorker off by default  
- PCB 3D is a Canvas approximation (not full CAD kernel)  
- Fault injection / plugin sandbox / live collab: skeleton or subset  
- Hypium automation is expanding; core acceptance is `AiPipelineValidator` + `tools/` smokes  

---

## 14. Roadmap

1. **Native SPICE NAPI** — Cross-compile SPICE backend; replace analog fallback path  
2. **External MCU emulator** — Fuller STM32 peripheral-level simulation  
3. **Prompt / Skill toolchain** — Semi-auto md→ets sync and regression diffs (SCH + PCB, incl. geometry)  
4. **Library growth** — Bulk tri-part import; richer footprint / STEP library  
5. **PCB depth** — Stronger AI geometry, blind/buried via flows, fab-ready Gerber QA  
6. **Performance** — Enable ThreadWorker stably (frame diffs); large-board rendering  
7. **Collab & cloud** — Real-time co-edit and lab report sync  
8. **Testing** — Broader Hypium automation  
9. **Fault injection / plugin sandbox** — Complete coverage  
10. **Product site / announcements** — Continue bilingual homepage + release feed polish (see `docs/superpowers/plans/`)  

---

## 15. License & Notices

- License: **Apache-2.0** — full text in root [`LICENSE`](LICENSE); also declared in `oh-package.json5`  
- Cloud AI depends on third-party terms and quotas; offline edit / sim / SCH·PCB lab templates are available—**no** silent template posing as AI full-gen  
- Local `build-profile.json5` may contain signing secrets—never commit it (see `.gitignore`)  

---

**ElecDraw · AI-SCH Simulator · HarmonyOS NEXT**
