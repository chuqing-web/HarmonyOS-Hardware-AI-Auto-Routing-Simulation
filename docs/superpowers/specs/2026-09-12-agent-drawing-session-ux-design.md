# Agent Drawing Session UX

**Date:** 2026-09-12  
**Status:** Implemented (schematic + PCB)  
**Related:** `2026-09-12-agent-bridge-mcp-design.md`

## Goal

When an external Agent (Cursor MCP / JSON-RPC) draws a **schematic or PCB**, match in-app AI drawing UX:

1. **Center** — fit schematic / board on session end (and after place where applicable)  
2. **Lock canvas** — reuse AI overlay + `setReadOnly` (Agent trusted-edit on both editors)  
3. **Live session logs** — reuse AI panel timeline with `[Agent]` prefix  

## Approach (chosen)

Reuse AI generating overlay + AI panel logs (`canvasLockSource = 'agent'`). Minimal UI fork.

## RPC

| Method | Role |
|--------|------|
| `sch.drawing_session_begin` / `pcb.drawing_session_begin` | Lock both editors, AI UX, log start |
| `sch.drawing_session_end` / `pcb.drawing_session_end` | Optional fit (default true), unlock |
| `sch.fit_all_in_view` / `pcb.fit_board_in_view` | Mid-session center (sch + board) |
| `sch.append_session_log` / `pcb.append_session_log` | Manual `[Agent]` log line |

Mutating sch/pcb ops auto-append `[Agent]` logs; first mutation **auto-begins** if no session (still call `end` to unlock).

## PCB-specific

- `PcbEditorImpl.setAgentTrustedEdit` + relaxed clearance DRC (cross-net still blocked)  
- `pcb.get_summary.pads[]` — pad world coords + nets  
- `pcb.move_footprint`, `pcb.clear_copper`, `pcb.add_track_segment`, `pcb.switch_route_layer`  
- Rich `commit_route` reject reasons (`cross_net` / `drc` / `too_short` / …)  
- PcbPage overlay: 「Agent 绘制中」 + recent `[Agent]` log preview (same AppService stream)

## Implementation notes

- `SchematicEditorImpl` / `PcbEditorImpl` agentTrustedEdit — readOnly blocks user; Bridge writes allowed  
- `AppService` implements `IAgentDrawingHost`; secondary listeners for PcbPage  
- Mutual exclusion: AI LLM busy → Agent begin fails; starting AI ends Agent session  
- Cancel / AI 面板「结束绘制」ends Agent session  
- Index + PcbPage overlays when `canvasLockSource === 'agent'`

## Out of scope

- In-app LLM pipeline / WAR auto-router from Bridge  
- Separate Agent log UI channel  
