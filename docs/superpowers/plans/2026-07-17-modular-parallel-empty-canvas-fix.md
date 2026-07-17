# Modular Parallel Empty-Canvas Fix Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Stop modular parallel from failing to empty canvas when plan invents out-of-library parts (e.g. NE555).

**Architecture:** Inject lib IDs into modular_plan; HARD-reject OOD mentions in critique; strip overview from module sub-prompts to avoid intent pollution.

**Tech Stack:** ArkTS, existing `PromptLoader` / `ModularParallelMerge` / `AiPipelineOrchestrator`.

---

## File map

| File | Change |
|------|--------|
| `PromptLoader.ets` | `includeLibIds` option |
| `ModularPlanPrompt.ets` | library-only rules + no-555 guidance |
| `ModularParallelMerge.ets` | OOD critique + slim `buildModuleSubPrompt` |
| `AiPipelineOrchestrator.ets` | pass `includeLibIds` + library into critique |

## Tasks

### Task 1: PromptLoader includeLibIds
- [x] Add `includeLibIds?: boolean` to `RenderEnrichOptions`
- [x] When set, append libDevId list + modular库约束文案（无需全脚）

### Task 2: ModularPlanPrompt
- [x] System 增加：只能用清单内 libDevId；禁止 NE555 等；无定时器则用 CD4017/逻辑门/三极管多谐/MCU

### Task 3: critique OOD + subprompt
- [x] `critiqueModularPlan(plan, library?)` 扫经典库外型号
- [x] `buildModuleSubPrompt` 不注入完整 overview

### Task 4: Orchestrator wire
- [x] `renderEnriched(..., { includeLibIds: true })`
- [x] `critiqueModularPlan(parsed, this.componentLibrary)`

### Task 5: Verify
- [x] 改动文件无新增 lint；逻辑自洽
