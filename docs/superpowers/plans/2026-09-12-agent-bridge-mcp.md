# Agent Bridge + MCP Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox syntax.

**Goal:** Ship localhost Agent Bridge in-app + Node MCP so Cursor/OpenClaw can atomically edit schematic/PCB live.

**Architecture:** App HAR `agent_bridge` listens on 127.0.0.1 with Bearer token; Node `tools/elecdraw-mcp` maps MCP tools to HTTP JSON-RPC.

**Tech Stack:** ArkTS + `@ohos.net.socket`, Node stdio MCP, existing `ISchematicEditor` / `IPcbEditor` / `IComponentLibrary`.

---

### Task 1: HAR scaffold + HTTP + dispatcher
- Create `features/agent_bridge/**`
- Wire into `build-profile.json5` + `entry/oh-package.json5`

### Task 2: AppService start + AI settings UI
- Start bridge in `initPlatform`
- Show port/token/MCP snippet in `AiSettingsPanel`

### Task 3: Node MCP package
- `tools/elecdraw-mcp` with tool catalog mirroring RPC methods

### Task 4: Smoke docs
- README for MCP config (Cursor mcp.json)

### Task 5: Drawing session UX (follow-up)
- See `2026-09-12-agent-drawing-session-ux.md` — lock / fit / `[Agent]` logs
