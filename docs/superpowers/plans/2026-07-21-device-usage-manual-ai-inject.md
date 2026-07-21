# Device Usage Manual AI Inject Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** After library_match, inject handbook-level usage for selected devices into layout/net_plan/route prompts.

**Architecture:** Independent `DeviceUsageManual` + PromptLoader formatter + orchestrator injection; skill prompts synced to `.ets`.

**Tech Stack:** ArkTS / HarmonyOS ElecDraw AI pipeline

---

### Task 1: DeviceUsageManual data + resolver

**Files:**
- Create: `features/ai_engine/src/main/ets/algorithms/DeviceUsageManual.ets`
- Modify: `features/ai_engine/Index.ets`

- [x] Exact + family entries covering ALL_CATALOG_LIBRARY_IDS
- [x] `resolve` / `buildForLibIds(full|compact)` / coverage report

### Task 2: PromptLoader + pipeline inject

**Files:**
- Modify: `PromptLoader.ets`, `AiPipelineOrchestrator.ets`
- Modify: `skill/prompts/02_layout.md`, `03_net_plan.md`, `04_route.md` + matching `.ets`

### Task 3: TeachingService reuse + validator coverage

**Files:**
- Modify: `TeachingService.ets`, `AiPipelineValidator.ets`
