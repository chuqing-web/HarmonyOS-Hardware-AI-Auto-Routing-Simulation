# Agent Drawing Session UX — Implementation Plan

> **For agentic workers:** Checklist for lock / fit / `[Agent]` logs parity with in-app AI drawing.

**Goal:** External MCP/Agent schematic **and PCB** edits reuse AI overlay + AI panel logs, center viewport, and lock canvas.

**Spec:** `docs/superpowers/specs/2026-09-12-agent-drawing-session-ux-design.md`

---

### Task 1: Schematic trusted-edit bypass
- [x] `SchematicEditorImpl.setAgentTrustedEdit` — readOnly blocks user; Bridge may write

### Task 2: Host + AppService session
- [x] `IAgentDrawingHost` + `AgentDrawingHostAdapter`
- [x] `beginAgentDrawingSession` / `endAgentDrawingSession` / `agentFitAllInView` / `agentAppendSessionLog`
- [x] `canvasLockSource` `'ai' | 'agent'`
- [x] Cancel / AI begin mutual exclusion
- [x] PCB trusted-edit + `fitBoardInView` on end/fit
- [x] `onAiGeneratingChangedSecondary` / `onAiGenLogsChangedSecondary` for PcbPage

### Task 3: Bridge RPC + auto session
- [x] `sch.drawing_session_begin|end`, `sch.fit_all_in_view`, `sch.append_session_log`
- [x] `pcb.drawing_session_begin|end`, `pcb.append_session_log`, `pcb.fit_board_in_view`
- [x] Auto-log / auto-begin on sch + pcb mutations
- [x] PCB: `pads[]`, `move_footprint`, `clear_copper`, `add_track_segment`, `switch_route_layer`
- [x] Net/DRC fixes for Agent routing (`findNetAtPoint`, empty-net pad skip, relax clearance)

### Task 4: UI
- [x] Index overlay: 「Agent 绘制中」
- [x] PcbPage overlay: 「Agent 绘制中」 + log preview
- [x] AiSettingsPanel: session hint + 「结束绘制」

### Task 5: MCP
- [x] Tools in `tools/elecdraw-mcp/index.mjs` + README PCB flow

### Recommended Agent flow

**Schematic**
```
sch_drawing_session_begin → place/wire… → sch_drawing_session_end({fit:true})
```

**PCB**
```
pcb_drawing_session_begin
  → pcb_forward_annotate → pcb_set_copper_layer_count → pcb_clear_copper
  → pcb_move_footprint… → pcb_get_summary (pads[])
  → add_track_segment / start+commit / vias / switch_route_layer
pcb_drawing_session_end({fit:true})
```

Always call **end** to unlock.
