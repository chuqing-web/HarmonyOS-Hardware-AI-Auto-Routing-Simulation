# PCB Layout AI 布线引擎设计

**Status:** Implementing  
**Date:** 2026-08-04

## Goal

产品内提供与原理图多 Agent 对齐的 PCB AI 布局+布线。全部策略/判断/修复由 LLM 决定；几何引擎只执行；零回退。

## Two separate features

| 功能 | 入口 | 实现 |
|------|------|------|
| **自动布线** | F8 / 工具栏 | 经典 `autoRoutePcb` |
| **AI 布线** | 右侧栏「AI布线」Tab（F9 打开） | `PcbAiRoutePanel` + 多 Agent；API 与原理图共用 `AiApiConfigSection` / 金库 |

UI 对齐原理图 `AiSettingsPanel`：顶栏标题 + ⚙ API 折叠 + 日志气泡 + 底部操作按钮。

## AI Pipeline

```
placement (LLM) → net_plan (LLM) → route_policy (LLM, 必跑)
  → geometry (local) → qa (DRC) → qa_repair (LLM) → re-exec → commit or ABORT
```

## Hard rules

- No skipLlm, no default layer-role table at runtime, no demotion
- Abort keeps board unchanged
- LLM never emits track/via polyline coordinates
- `layerRoles` must cover every copper layer
- QA repair requires `pcb_qa_repair` LLM before re-geometry
