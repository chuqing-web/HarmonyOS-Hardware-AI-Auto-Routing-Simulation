# AI Gen Intent Critique Implementation Plan

> **For agentic workers:** Use executing-plans / continue from remaining checkboxes if any.

**Goal:** CircuitIntent-gated HARD/SOFT critiques, shorter LLM retry loops with residual early-stop, intent-conditional prompt injection; never ABORT; geo severity stays error.

**Status:** Implemented 2026-07-17

**Architecture:** `CircuitIntent.ets` + `IntentPromptFragments.ets` + Orchestrator critique/fetch loops + PostGen gating + restored `runModularParallelPipeline`.

**Tech Stack:** ArkTS `features/ai_engine`

---

## Done

- [x] CircuitIntent classify / refine / fingerprint
- [x] PromptLoader.loadForIntent + renderEnriched intent
- [x] Device/net_plan HARD/SOFT + CRITIQUE_INNER=4 / LAYOUT=3 + early_stop
- [x] PostGen setCircuitIntent + dual-LED gate
- [x] Restore modular parallel pipeline (lost during git checkout)
- [x] Spec status updated
