# AI-SCH Simulator

Pure schematic hardware simulation for HarmonyOS — Proteus-class editing, 8051/STM32 HEX debugging, mixed-signal simulation, and AI-assisted routing.

[简体中文](./README.zh-CN.md) | English

## Highlights

- **Schematic editor** — Canvas 2D rendering, grid snap, undo/redo, bus routing, hierarchical subcircuits, and ERC (Electrical Rules Check)
- **Mixed-signal simulation** — Analog (SPICE netlist), digital (event-driven), and MCU engines coordinated by a global nanosecond scheduler
- **MCU debugging** — Intel HEX32 parsing, 8051 instruction-level simulation, breakpoints, single-step, register/memory views, and virtual UART
- **Virtual instruments** — Oscilloscope, logic analyzer, multimeter, signal generator, and UART terminal
- **AI engine** — Auto-wiring (A* + LLM), fault diagnosis, circuit generation, component recommendation, and waveform analysis
- **Multi-vendor AI APIs** — Provider templates, load balancing, quota tracking, and offline/degraded modes
- **Device library** — Tri-part device files (`meta.json` + `symbol.svg` + model), built-in components, and Proteus import support
- **Fault injection** — Resistor/capacitor/MCU fault scenarios with batch scan and AI summary
- **Teaching assistant** — Step-by-step power-on simulation, knowledge tips, experiment templates, and AI Q&A
- **Plugin system** — Extensible plugin manifest, sandbox, and hot-reload skeleton

## Tech Stack

| Item | Details |
|------|---------|
| Platform | HarmonyOS NEXT 5.0+ (PC 2in1 / tablet / default device) |
| Language | ArkTS |
| Architecture | Stage model + modular HAR packages |
| UI | ArkUI declarative components (Proteus-inspired theme) |
| Communication | `EventBus` decoupled inter-module messaging |

## Requirements

- [DevEco Studio](https://developer.huawei.com/consumer/en/deveco-studio/) 5.0+
- HarmonyOS SDK API 12+ (compatible SDK 5.0.0)
- Node.js 18+

## Quick Start

1. Clone the repository and open the project root in DevEco Studio.
2. Wait for dependency sync to finish (`ohpm install`).
3. Select a **2in1** device or PC emulator as the run target.
4. Click **Run** to build and launch the app.

### App Icons (optional)

Place icon assets before release builds:

- `AppScope/resources/base/media/app_icon.png`
- `entry/src/main/resources/base/media/startIcon.png`
- `entry/src/main/resources/base/media/layered_image.json`

## Project Structure

```
ElecDraw_Harmony/
├── AppScope/                    # Global app configuration
├── common/                      # Shared types, EventBus, utilities, security
├── entry/                       # Main entry module (UI shell + AppService)
├── features/                    # Feature modules (HAR packages)
│   ├── schematic_editor/        # Schematic editor
│   ├── component_library/       # Component library
│   ├── simulation_kernel/       # Mixed-signal simulation kernel
│   ├── hex_debugger/            # HEX / MCU debugging
│   ├── ai_engine/               # AI engine
│   ├── ai_api_manager/          # Multi-vendor AI API management
│   ├── file_persistence/        # File persistence & versioning
│   ├── instruments/             # Virtual instruments
│   └── plugin_system/           # Plugin extension system
├── DeviceLibrary/               # Tri-part device files (meta + svg + model)
├── docs/                        # Architecture & API documentation
├── build-profile.json5
└── oh-package.json5
```

## Modules

| Module | Role |
|--------|------|
| `schematic_editor` | Pure view layer — canvas interaction, wiring, ERC, topology export |
| `component_library` | Device resources — built-in library + tri-part file loader |
| `simulation_kernel` | Mixed simulation — analog / digital / MCU engines + fault injection |
| `hex_debugger` | HEX firmware parsing, 8051 core, breakpoints, MCU behavior simulation |
| `ai_engine` | Auto-wiring, diagnosis, circuit generation, teaching service |
| `ai_api_manager` | Provider config, network modes, quota & billing tracking |
| `file_persistence` | Project save/load, crash guard, version snapshots & diff |
| `instruments` | Virtual oscilloscope, logic analyzer, multimeter, signal gen, UART |
| `plugin_system` | Plugin lifecycle, permissions, sandbox |
| `common` | Types, `ErrCode`, `SchTopology`, adapters, license & feature gates |

### Dependency Graph

```
entry
 ├── schematic_editor  → common
 ├── component_library → common
 ├── simulation_kernel → common
 ├── hex_debugger      → common
 ├── ai_engine         → common, ai_api_manager
 ├── ai_api_manager    → common
 ├── file_persistence  → common
 ├── instruments       → common
 └── plugin_system     → common
```

Modules communicate through `EventBus`. See `docs/API_INTERFACES.md` and `docs/API_V2.md` for the full v2 contract.

## Device Library

Every component follows a **tri-part file format**:

| File | Purpose |
|------|---------|
| `{id}.meta.json` | Metadata, pins, parameters, ERC rules, model binding |
| `{id}.symbol.svg` | Schematic symbol (vector) |
| `{id}.model.spice` / `.model.mcu` / `.model.digital` | Simulation model |

Built-in categories include passives, discretes, analog ICs, digital logic, memory, MCUs (8051/STM32), sensors, peripherals, and virtual instruments. See `docs/DEVICE_LIBRARY_SPEC.md`.

## Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System architecture & module specs |
| [API_V2.md](./docs/API_V2.md) | v2 API contract (ErrCode, SchTopology, callbacks) |
| [API_INTERFACES.md](./docs/API_INTERFACES.md) | Module interface reference |
| [DEVICE_LIBRARY_SPEC.md](./docs/DEVICE_LIBRARY_SPEC.md) | Device library file format |
| [AI_PIPELINE_SPEC.md](./docs/AI_PIPELINE_SPEC.md) | AI task pipeline specification |
| [ENGINEERING_SPEC.md](./docs/ENGINEERING_SPEC.md) | Engineering requirements & acceptance IDs |
| [COMPLETE_SPEC.md](./docs/COMPLETE_SPEC.md) | Feature implementation status (20 categories) |
| [PRODUCTION_MODULES.md](./docs/PRODUCTION_MODULES.md) | Production-ready module checklist |
| [DEVELOPMENT_SCHEDULE.md](./docs/DEVELOPMENT_SCHEDULE.md) | Development roadmap & sprint plan |
| [ACCEPTANCE_TESTS.md](./docs/ACCEPTANCE_TESTS.md) | Acceptance test scenarios |

## Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| P0 | Project skeleton + seven core module APIs | Done |
| P1 | Schematic Canvas 2D rendering + ERC | Done |
| P2 | Mixed-signal three-engine + global scheduler | Skeleton done |
| P3 | 8051 HEX simulation + debug panel | Done |
| P4 | AI API management + smart routing/generation | Done |
| P5 | Proteus import + device library expansion | Basic done |
| P6 | Ngspice NAPI + QEMU-MCU native integration | Planned |
| v2 | Fine-grained API contract + SchTopology + ErrCode | Done |

Upcoming native integrations: Ngspice NAPI, QEMU-MCU for full STM32 simulation, OpenGL large-scale rendering, and full Proteus `.lib` import.

## License

Apache-2.0 — see `oh-package.json5`.
