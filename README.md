# AI-SCH Simulator

**Schematic-centric hardware simulation and AI-assisted circuit design on HarmonyOS NEXT**

A Proteus-class editing and mixed-signal experience—native to HarmonyOS—with 8051/STM32 HEX debugging, virtual instruments, and a closed-loop AI pipeline (**select → place → route → ERC**). Built for university labs, contest training, and early design verification.

[简体中文](./README.zh-CN.md) | English

---

## Contents

- [1. Background](#1-background)
- [2. Innovations](#2-innovations)
- [3. Feature Overview](#3-feature-overview)
- [4. Architecture](#4-architecture)
- [5. AI Closed-Loop Pipeline](#5-ai-closed-loop-pipeline)
- [6. Simulation & Debugging](#6-simulation--debugging)
- [7. Device Library & Lab Templates](#7-device-library--lab-templates)
- [8. Repository Layout & Modules](#8-repository-layout--modules)
- [9. Getting Started](#9-getting-started)
- [10. Demo Script for Judges](#10-demo-script-for-judges)
- [11. Application Scenarios](#11-application-scenarios)
- [12. Engineering Quality](#12-engineering-quality)
- [13. Roadmap](#13-roadmap)
- [14. License & Notices](#14-license--notices)

---

## 1. Background

Electronics education and embedded prototyping still rely heavily on **Windows + Proteus / Multisim**. As HarmonyOS NEXT spreads across 2in1 PCs, tablets, and classroom devices, the ecosystem still lacks a tool that is:

1. **Native to HarmonyOS** for schematic-level simulation;  
2. Capable of **analog / digital / MCU** mixed-signal labs in one product;  
3. Able to turn **LLM output into executable topology** (not chat-only Q&A);  
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

| # | Innovation | Detail |
|---|------------|--------|
| 1 | **Closed-loop AI EDA** | LLM constraint JSON → local GA placement → semantic nets → constrained A\* routing → ERC / self-check repair; strong template match + degraded path when cloud AI is unavailable |
| 2 | **Native mixed-signal kernel** | In-house MNA analog engine, event-driven digital engine, 8051 / Cortex-M3 instruction paths, global nanosecond scheduler |
| 3 | **Teaching loop** | 15 `.schsim` labs + HEX firmware + knowledge tips + staged power-on + catalog coverage dashboard |
| 4 | **Live instrument ↔ schematic binding** | Scope / logic analyzer / meters / signal gen / UART linked to nets and MCU serial loops |
| 5 | **Multi-vendor AI governance** | 17 provider templates, per-task API binding, quota dashboard, offline / proxy / degrade policies |
| 6 | **Modular HAR + EventBus** | 11 modules, unified `ErrCode` and topology contracts—ready for plugins, import, and collaboration |

Versus classic desktop EDA: focus on **native HarmonyOS, executable AI, measurable teaching**. Versus chat-only assistants: focus on **topology landing, ERC, and simulation-backed verification**.

---

## 3. Feature Overview

### 3.1 Schematic editing

- Canvas interaction, layers, grid snap, undo/redo, batch align/distribute  
- Buses, net labels, probes, annotations, hierarchical subcircuits  
- ERC: static / deep / dynamic  
- Proteus-style menus, toolbar, light/dark theme, keyboard shortcuts  
- Proteus component alias table for habit migration  

### 3.2 Mixed-signal simulation

- Analog: `AnalogEngine` (MNA + Newton–Raphson; diodes/LEDs/BJTs/op-amps/regulators/relays/pots)  
- Digital: `DigitalEngine` (event-driven; 74HC timing, fanout, setup/hold)  
- MCU: 8051 and Cortex-M3 paths synced with analog/digital nets (GPIO, ADC, USART)  
- Scheduler: `GlobalScheduler` (nanosecond, adaptive step)  
- Analysis APIs: transient / DC / AC / mixed / noise / Monte Carlo / parameter scan  
- Interaction: pushbuttons, pot wipers, relay contacts; **9 fault types** + batch scan  

### 3.3 MCU debugging

- Intel HEX32 parse and flash fit checks  
- 8051 SFRs, Cortex-M3 core registers, breakpoints (address/data), step in/over  
- Virtual UART log; loopback with instrument UART terminal  

### 3.4 Virtual instruments

Oscilloscope (multi-channel, timebase, trigger, math/FFT, cursors), logic analyzer, multimeter, DC volt/ammeter, power meter, frequency counter, signal generator, UART terminal (timed scripts).

### 3.5 AI-assisted design

Natural-language device select, layout constraints, global/local routing, full/subcircuit generation, static/dynamic diagnosis, waveform analysis, parameter tips, replacement devices, BOM optimization. Full loop in [Section 5](#5-ai-closed-loop-pipeline).

### 3.6 Projects & extensibility

- `.schsim` save/load, autosave, crash guard, session restore  
- Import skeletons: Proteus / KiCad / LTspice; export: PNG / SVG / PDF, wave CSV, BOM  
- Collaboration skeleton: snapshots, project lock, annotations, conflict resolve  
- Plugins: manifest, signature check, sandbox permissions, sample script load  

---

## 4. Architecture

### 4.1 Layered view

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
│  Assets  DeviceLibrary · ai_prompt_lib · Test_Template · HEX   │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Shared contract: `SchTopology`

Editor, simulation kernel, AI pipeline, persistence, plugins, and teaching templates share one topology model (device instances, nets, wires, buses, probes, net labels, subcircuits, ERC errors). `TopologyAdapter` bridges document models and topology so modules stay interoperable.

### 4.3 EventBus decoupling

`EventBus` covers schematic changes, sim start/stop/step, MCU state, AI progress, file I/O, ERC completion, wave refresh, breakpoint hits, UART, license changes, and more. `AppService` orchestrates the major modules into end-to-end scenarios.

### 4.4 Simulation threading

```
UI / AppService
    → SimWorkerHost
        → [preferred] ThreadWorker (SimWorker) → SimulationKernelImpl → frame snapshots
        → [fallback] main-thread pump (budget-capped for fluidity)
    → SimFrameStore → instrument panels / canvas refresh
```

### 4.5 Module dependencies

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

## 5. AI Closed-Loop Pipeline

`IAiEngine.runFullPipeline` turns a natural-language request into a simulatable topology:

```
User prompt
    │
    ▼
① Strong template match (CircuitTemplates) ── hit → fast path ──┐
    │                                                            │
    ▼                                                            │
② LLM device select → LlmJsonNormalizer → DeviceSelectEngine (anti-hallucination / OOD)
    │
    ▼
③ LLM layout constraints → PlacementOptimizer / PlacementGaWorker (genetic algorithm)
    │
    ▼
④ SemanticNetBuilder + PinWorldResolver (semantic nets & pin world coords)
    │
    ▼
⑤ LLM routing constraints → ConstrainedWiringEngine (A*, analog/digital/xtal weights)
    │
    ▼
⑥ Half-failure fallback / template salvage → ERC + FaultDiagnoser self-check
    │
    ▼
Editable · simulatable · teachable SchTopology
```

| Capability | API highlights |
|------------|----------------|
| Full loop | `runFullPipeline` |
| Step tasks | `aiSelectDevices` / `aiPlaceDevices` / `aiAutoRoute*` |
| Generation | `aiGenFullSchematic` / `aiGenSubCircuit` |
| Diagnosis | `aiStaticDiagnose` / `aiDynamicDiagnose` / `aiAnalyzeWave` |
| Engineering aids | `aiRecommendParam` / `aiGetReplaceDevice` / `aiOptimizeBom` |

Prompt assets live in `ai_prompt_lib/` (`device_select`, `layout`, `route`, `gen_sch`, `diag`).  
Provider templates cover Doubao, Tongyi, DeepSeek, Wenxin, Zhipu, Kimi, OpenAI, Claude, Gemini, Ollama, and more (**17**), with per-task binding and quota controls.

---

## 6. Simulation & Debugging

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

## 7. Device Library & Lab Templates

### 7.1 Device library (~79 runtime devices)

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

### 7.2 Fifteen lab templates

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
| `lab_memory` | Memory I/F | Parallel / I2C / SPI | — |
| `lab_mcu_8051` | 8051 family | Min-system, xtal, reset | ✓ |
| `lab_mcu_stm32` | STM32 family | Cortex-M, HSE, NRST | ✓ |
| `lab_peripheral` | Peripherals | GPIO, relay, display | ✓ |
| `lab_sensor` | Sensors | 1-Wire, digital in, ADC | — |
| `lab_instruments` | Instruments | V/I/scope binding | — |

Assets: `Test_Template/`, `hex_files/`, `template_manifest.json`. The teaching panel shows coverage metrics and AI Q&A.

---

## 8. Repository Layout & Modules

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
│   ├── ai_engine/               # AI pipeline & teaching
│   ├── ai_api_manager/          # Multi-vendor API & quotas
│   ├── file_persistence/        # Projects / import-export / collab
│   ├── instruments/             # Virtual instrument engines
│   └── plugin_system/           # Plugin sandbox
├── DeviceLibrary/               # Tri-part devices & symbols
├── ai_prompt_lib/               # LLM prompt JSON
├── Test_Template/               # Lab .schsim projects
├── hex_files/                   # Lab firmware HEX
├── tools/                       # HEX/template build & verify scripts
├── project/                     # Local project placeholder
├── docs/                        # Docs reserved
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
| `ai_engine` | Pipeline orchestration, GA / A\*, RAG templates, TeachingService |
| `ai_api_manager` | Providers, network modes, quota dashboard |
| `file_persistence` | `.schsim`, crash guard, export, collab skeleton |
| `instruments` | Instrument engines & binding snapshots |
| `plugin_system` | Plugin lifecycle & sandbox |

**Selected UI components:** `SchematicCanvas`, `AppLeftPanel` / `AppRightPanel`, `AiSettingsPanel`, `McuDebugPanel`, `InstrumentPanel`, `FaultInjectionPanel`, `TeachingPanel`, `PlatformSettingsPanel`, and more.

---

## 9. Getting Started

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

## 10. Demo Script for Judges

Suggested 5–8 minute recording emphasizing runnable, teachable, AI-backed value:

1. **Launch & shell** — Splash → Proteus-style main UI; library & navigator.  
2. **Teaching template** — Load `lab_uart` or `lab_51_led`; show coverage and tips.  
3. **HEX debug** — Burn companion HEX, run sim, UART echo / LED chase.  
4. **Instruments** — Open `lab_amp` / `lab_filter`; observe op-amp or RC on the scope.  
5. **AI full pipeline** — Prompt “STM32 min-system + LED”; show select/place/route progress and ERC self-check.  
6. **Fault injection** — Inject resistor-open (etc.), batch scan, compare waves / diagnosis.  
7. **Project polish** — Save `.schsim`, theme toggle, AI quota / offline mode (optional).  

---

## 11. Application Scenarios

| Scenario | Value |
|----------|-------|
| University analog / digital / MCU labs | Schematic-level experiments without a physical board |
| Electronics / embedded contest training | Fast circuits, HEX burn, waves & serial |
| Engineer pre-validation | AI draft + local sim to catch errors before hardware |
| HarmonyOS classrooms / 2in1 terminals | Native OS deployment, less Windows dependency |

---

## 12. Engineering Quality

| Kind | Where / how |
|------|-------------|
| AI acceptance suite | `AiPipelineValidator`: min-system+LED, hallucination chip block, API-failure degrade; via `runValidationSuite()` |
| Engineering verify scripts | `tools/lab_templates/verify_*.mjs` (MNA, diode Newton, digital logic, geometry audit, template merge, …) |
| Template & firmware builders | `tools/_build_lab_*.py` / `.mjs`, `tools/lab_templates/` |
| Unit-test framework | Root dep `@ohos/hypium` (expanding) |
| Native integration notes | `features/simulation_kernel/native/ngspice_napi/README.md` |

**Honest boundaries:** Ngspice NAPI and QEMU-MCU remain stub/skeleton; production-grade SPICE/QEMU integration is on the roadmap. The default sim path prioritizes UI fluidity (worker + main-thread fallback coexist).

---

## 13. Roadmap

1. **Ngspice NAPI** — Cross-compile Ngspice; replace analog fallback path  
2. **QEMU-MCU** — Full STM32 peripheral-level simulation  
3. **Library growth** — Bulk tri-part import, fuller Proteus `.lib` compatibility  
4. **Performance** — Stable dedicated sim thread; large-schematic rendering  
5. **Collab & cloud** — Real-time co-edit and lab report sync  
6. **Testing** — Broader Hypium automation and acceptance cases  

---

## 14. License & Notices

- License: **Apache-2.0** (see root `oh-package.json5`)  
- “Proteus” is used only as a capability/UI reference; no affiliation with Labcenter  
- Cloud AI depends on third-party terms and quotas; offline use relies on local algorithms and lab templates  

---

**ElecDraw · AI-SCH Simulator · HarmonyOS NEXT**
