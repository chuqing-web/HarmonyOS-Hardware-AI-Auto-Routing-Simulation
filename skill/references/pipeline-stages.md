# AI 整图流水线阶段详解

> 对齐多 Agent 质量总线（2026-07-27）：Coordinator + WAR + qualityHardFail

## 调用链

```
AiSettingsPanel.runGenerate(mode) / submitClarification / 自检
  → AppService.aiGenerateCircuitFromPrompt | aiSelfCheckAndFix
  → AiEngineImpl.runAiTask(TASK_FULL_PIPELINE) | runSelfCheckPipeline
  → oneshot/edit/append: AgentPipelineCoordinator.runOneshot / runEdit
  → modular: AgentPipelineCoordinator.runModular → Orchestrator.runModularParallelPipeline
  → self-check: AgentPipelineCoordinator.runSelfCheck (WAR + QA)
  → AppService: usedLlm 门禁 → loadTopology → pin 重建 → ERC/sim
```

| 路径 | Coordinator 入口 | qualityHardFail |
|------|------------------|-----------------|
| oneshot create | `runOneshot` → `runCreate` | 默认 true |
| edit | `runEdit` → `Orchestrator.runEditPipeline` | 默认 true |
| append | 同 oneshot（落图后 merge） | 默认 true |
| modular | `runModular`（Phase2 再 Agent 化） | false |
| 自检 | `runSelfCheck` | true |

## 阶段明细

### 0. Requirements（LLM，必要时澄清）

- **Agent**: `RequirementsAgent`
- **Prompt**: `requirement` / `RequirementPrompt.ets`（权威源 `skill/prompts/09_requirement.md`）
- **输出**: `RequirementSpec` 或 `need_clarification` + Ask（A/B/C+D）
- **失败**: ABORT；澄清时 **不落图**，保存 `BlackboardSnapshot`
- **续跑**: Phase1 答完整链重跑；Phase2 可用 `resumeFromSnapshot`

### 1. Device Select（LLM，硬门槛）

- **Agent**: `SelectAgent`（commit 黑板）；执行 `fetchDeviceSelectLlm` → `DeviceSelectEngine.matchFromLlmOutput`
- **Prompt ID**: `device_select`
- **失败**: ABORT，无拓扑；禁止模板回退

### 2. Library Match（本地）

- `MatchedDevice[]`；零匹配 ABORT；部分 BOM 在非硬失败路径可 degraded

### 3. Layout Constraints（LLM soft hint）

- **Agent**: `LayoutAgent`
- **Prompt ID**: `layout` — `positions` 仅为 **GA soft hint**；最终坐标来自 PlacementOptimizer
- **qualityHardFail**: layout LLM 不可用 → ABORT（禁止 defaultConstraints 冒充）

### 4. Placement GA（本地）

- `PlacementOptimizer.optimizeAsync` / `applyAiPositions`
- 禁止 LLM 输出导线几何

### 5. Net Plan（LLM，硬门槛）

- **Agent**: `NetAgent`
- **Prompt ID**: `net_plan` → `NetPlanExecutor`（label-first）
- **失败**: 生产禁止 SemanticNetBuilder 回退；仅 `skipLlm` 可用 Semantic

### 6. Routing Constraints（LLM）

- **Prompt ID**: `route`；可被 net_plan `wiringHints` 跳过
- **qualityHardFail**: 无有效约束 → ABORT

### 7. WAR 几何布线（生产唯一路径）

- **Agent**: `RouteAgent` / `WarRouteAdapter` → `WireAutoRouter`（与主编辑器同源）
- 日志：`[AI_AGENT] route via WAR`
- **禁止**生产主路径用 `ConstrainedWiringEngine.route*`（skipLlm / 非硬失败可 A*）
- edit 变更网：hardFail 下同样 WAR

### 8. QA 终检（有限 2 轮）

- **Agent**: `QaAgent`；`QA_FIX_ROUNDS=2`
- 有限修复：WAR 重拉 + `finalizeForGate`；**禁止 FORCE_COMPLETE / demote_all 脏交付**
- 仍脏 → `qa_residual` ABORT 空拓扑

### 9. usedLlm 三重门禁

| 层 | 条件 | 行为 |
|----|------|------|
| Orchestrator | device_select / net_plan 无 LLM | 不返回可用拓扑 |
| AiEngineImpl | `!skipLlm && !usedLlm` | 拒交付 |
| AppService | analysis 含 `LLM:false` | 拒绝落图 |

### 10. 落图与后处理（AppService）

1. `loadTopology` / append 合并  
2. `rebuildNetPinConnectivity` + `ensureNetPinConnectivity`  
3. ERC / sim / 可选自检询问  

## Prompt 能力映射

| 阶段 | AiCapability |
|------|--------------|
| requirement / device_select | `COMPONENT_RECOMMEND` |
| layout / route / net_plan | `AUTO_WIRING`（按现实现） |

## Phase2 开关

| 开关 | 位置 | 行为 |
|------|------|------|
| `enableReasoning` | `AiTaskExtra` / `PipelineOptions` | `setEnableReasoning` → chat `disableThinking=false` |
| `BlackboardSnapshot` | `CircuitBlackboard.toSnapshot/resumeFromSnapshot` | 澄清后续跑跳过已完成阶段（逐步启用） |
| Modular Agent 化 | `Coordinator.runModular` | 现委派 Orchestrator；子模块再 Agent 化待续 |

## 拓扑契约（SchTopology）

关键字段：`deviceList`, `netList`(含 `nodeList`), `wireList`, `netLabelList`, `ercErrorList`, `gridStep`。

LLM **不得**输出毫米导线坐标；坐标只来自 PlacementOptimizer / Kit / PinWorldResolver / WAR。

## HTTP / 重试

- 读超时约 30min；禁止因「觉得太久」缩短
- Orchestrator：`LLM_MAX_RETRIES`，指数退避；4xx 不重试

## 验收日志关键字

- `[AI_AGENT] START` / `stage=requirements|select|layout|net|route|qa`
- `[AI_AGENT] route via WAR`
- `[AI_PIPE] skip FORCE_COMPLETE under qualityHardFail`
- `[AI_PIPE] ABORT layout/routing/war_route/qa_residual/edit_plan`
- `[AI_UI] clarify Ask cards`
- `[AI_GEN] self_check via Coordinator`
