# Modular Parallel AI Gen Implementation Plan

> **For agentic workers:** Implement task-by-task per this plan.

**Goal:** Always ask oneshot vs modular; modular = overall design+boundary gate → parallel pipelines → POWER pin joints merge.

**Architecture:** UI strategy → AppService `strategy` → AiEngine extra → `AiPipelineOrchestrator.runModularParallelPipeline`.

**Tech Stack:** ArkTS / HarmonyOS, existing ai_engine pipeline.

---

## File map

| File | Role |
|------|------|
| `entry/.../AiSettingsPanel.ets` | Strategy + replace/append dialogs |
| `entry/.../AppService.ets` | Pass strategy; edit mode force oneshot |
| `features/ai_engine/.../AiEngineImpl.ets` | Branch modular |
| `features/ai_engine/.../AiPipelineOrchestrator.ets` | Plan / parallel / merge |
| `features/ai_engine/.../prompts/templates/ModularPlanPrompt.ets` | New prompt |
| `features/ai_engine/.../LlmJsonNormalizer.ets` | Normalize plan JSON |
| `common` types if needed | ModularPlan types (or keep local in orchestrator) |

## Tasks

1. UI strategy dialog — done
2. AppService + engine wire — done
3. ModularPlan prompt + normalize + critique — done (`ModularParallelMerge` + `ModularPlanPrompt`)
4. Parallel run + merge joints/POWER — done (`runModularParallelPipeline`)
5. Skill blurb — done
