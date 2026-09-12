# Agent Bridge + MCP Design

**Date:** 2026-09-12  
**Status:** Approved for implementation (user requested immediate落地)

## Goal

Allow external AI agents (Cursor, OpenClaw, etc.) to **live-control** a running ElecDraw app: schematic library search / place / wire, and PCB layer / footprint / track / via — via **fine-grained atomic tools**. Reasoning stays in the external agent; **no** in-app LLM pipeline or auto-router tools are exposed.

## Architecture

```
Cursor / OpenClaw  --MCP/stdio-->  tools/elecdraw-mcp (Node)
                                      |
                               HTTP JSON-RPC + Bearer token
                                      |
                         features/agent_bridge (ArkTS)
                           127.0.0.1:<port>
                                      |
              IComponentLibrary / ISchematicEditor / IPcbEditor
```

## Decisions

| Topic | Choice |
|-------|--------|
| Integration | MCP Server |
| Control model | Live running app |
| Tool grain | Fine-grained atomic ops |
| Reasoning | External agent only |
| Auto place/route | Not exposed |
| Listen direction | App listens on localhost |
| Auth | `127.0.0.1` + random token at start |

## App module (`agent_bridge`)

- TCP HTTP server on `127.0.0.1` (Harmony `TCPSocketServer`)
- `POST /rpc` JSON-RPC 2.0: `{ method, params, id }`
- Auth: `Authorization: Bearer <token>`
- Discovery: write `agent-bridge.json` under app base dir; show port/token in AI settings
- Dispatcher maps `lib.*` / `sch.*` / `pcb.*` / `sys.*` to editor APIs

## MCP (`tools/elecdraw-mcp`)

- Stdio MCP; each tool → HTTP RPC method
- Config: env `ELECDRAW_AGENT_URL` + `ELECDRAW_AGENT_TOKEN`, or read discovery path

## Out of scope (v1)

- In-app AI pipeline tools
- WAR / PCB auto-route tools
- Reverse-connect sidecar
- Multi-document sessions

## Follow-up (done same day)

Drawing-session UX (lock / fit / `[Agent]` logs): see `2026-09-12-agent-drawing-session-ux-design.md`.
