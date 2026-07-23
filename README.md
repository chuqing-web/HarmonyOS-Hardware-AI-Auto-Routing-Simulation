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

**AI-SCH Simulator** (`com.elecdraw.aischsim`, vendor ElecDraw, v1.0.0) addresses that gap. It is implemented in ArkTS / ArkUI (Stage model) with modular HAR packages, centered on a shared topology contract—`SchTopology`—across editing, simulation, AI, persistence, and teaching.

| Item | Detail |
|------|--------|
| Product name | AI-SCH Simulator |
| Bundle ID | `com.elecdraw.aischsim` |
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
| 5 | **Native mixed-signal kernel** | In-house MNA analog engine, event-driven digital engine, 8051 / Cortex-M3 paths, global nanosecond scheduler |
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
- MCU: 8051 and Cortex-M3 paths synced with analog/digital nets (GPIO, ADC, USART)  
- Scheduler: `GlobalScheduler` (nanosecond, adaptive step)  
- Analysis APIs: transient / DC / AC / mixed / noise / Monte Carlo / parameter scan  
- Interaction: pushbuttons, pot wipers, relay contacts; **9 fault types** + batch scan  

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

Natural-language device select, layout constraints, net planning, global/local routing, oneshot / modular-parallel generation, static/dynamic diagnosis, waveform analysis, parameter tips, replacement devices, BOM optimization. Full loop in [Section 6](#6-ai-closed-loop-pipeline).

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
- Import skeletons: Proteus / KiCad / LTspice; export: PNG / SVG / PDF, wave CSV, BOM  
- Collaboration skeleton: snapshots, project lock, annotations, conflict resolve  
- Plugins: manifest, signature check, sandbox permissions, sample script load  

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

```
UI / AppService
    → SimWorkerHost
        → [preferred] ThreadWorker (SimWorker) → SimulationKernelImpl → frame snapshots
        → [fallback] main-thread pump (budget-capped for fluidity)
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
① Intent parse / strong template match (accelerate when hit; no silent fake schematic on failure)
    │
    ▼
② LLM device select → LlmJsonNormalizer → DeviceSelectEngine (anti-hallucination / OOD)
    │
    ▼
③ Inject DeviceUsageManual → LLM layout constraints → PlacementOptimizer / GA
    │
    ▼
④ LLM net_plan (pin-level nets) → SemanticNetBuilder + PinWorldResolver
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
| Generation | `aiGenFullSchematic` / `aiGenSubCircuit` |
| Diagnosis | `aiStaticDiagnose` / `aiDynamicDiagnose` / `aiAnalyzeWave` |
| Engineering aids | `aiRecommendParam` / `aiGetReplaceDevice` / `aiOptimizeBom` |

Provider templates cover Doubao, Tongyi, DeepSeek, Wenxin, Zhipu, Kimi, OpenAI, Claude, Gemini, Ollama, and more (**17**), with per-task binding and quota controls.

---

## 7. Simulation & Debugging

| Area | Capabilities |
|------|----------------|
| Engines | AnalogEngine, DigitalEngine, MCU (8051 / Cortex-M3), GlobalScheduler |
| SPICE | SpiceMatrixBuilder, SpiceRunner; Ngspice NAPI stub (falls back to in-house analog) |
| MCU bridge | QemuMcuBridge skeleton (full QEMU STM32 planned) |
| Analysis | Parameter scan, Monte Carlo, noise analysis (advanced features license-gated) |
| Faults | Resistor open/short, cap leak, inductor open, transistor breakdown, MOS damage, IO short, crystal stop, reset stuck, … |
| Debug | HEX load, breakpoints, stepping, registers/memory, UART |
| Instruments | Live waves, protocol decode, meter readings bound to nets |

---

## 8. Device Library & Lab Templates

### 8.1 Device library (~79 runtime devices)

The authoritative runtime catalog is maintained in `component_library` built-in data. On-disk `DeviceLibrary/` holds tri-part samples and shared SVGs.

| Category | Scale | Examples |
|----------|-------|----------|
| Power | 3 | VCC, GND, VAC |
| Passive | ~23 | R/C/L, crystals, fuse, pots |
| Discrete | ~10 | Diodes, LEDs, BJTs, MOSFETs |
| Analog IC | ~7 | UA741, LM358, LDO, Buck |
| Digital IC | ~7 | 74HC series, CD4017 |
| Memory | 4 | Parallel / I2C / SPI Flash |
| MCU | 9 | AT89 / STC, STM32F103 / F407 / L431, … |
| Peripheral & sensor | ~8 | Switch, relay, buzzer, LCD/OLED, DS18B20, … |
| Virtual instruments | 8 | Scope, LA, meters, UART |

**Tri-part format:** `{id}.meta.json` + `{id}.symbol.svg` + `{id}.model.*`

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
- Cloud AI needs network permission; offline mode uses templates / local algorithms  

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

**Honest boundaries:** Ngspice NAPI and QEMU-MCU remain stub/skeleton; production-grade SPICE/QEMU integration is on the roadmap. The default sim path prioritizes UI fluidity (worker + main-thread fallback coexist).

---

## 14. Roadmap

1. **Ngspice NAPI** — Cross-compile Ngspice; replace analog fallback path  
2. **QEMU-MCU** — Full STM32 peripheral-level simulation  
3. **Prompt / Skill toolchain** — Semi-auto md→ets sync and regression diffs  
4. **Library growth** — Bulk tri-part import, fuller Proteus `.lib` compatibility  
5. **Performance** — Stable dedicated sim thread; large-schematic rendering  
6. **Collab & cloud** — Real-time co-edit and lab report sync  
7. **Testing** — Broader Hypium automation and acceptance cases  

---

## 15. License & Notices

- License: **Apache-2.0** (see root `oh-package.json5`)  
- “Proteus” is used only as a capability/UI reference; no affiliation with Labcenter  
- Cloud AI depends on third-party terms and quotas; offline use relies on local algorithms and lab templates  

---

**ElecDraw · AI-SCH Simulator · HarmonyOS NEXT**
