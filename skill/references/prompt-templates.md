# AI Prompt 模板索引（v5）

> **权威文案**：[`skill/prompts/`](../prompts/README.md)  
> **运行时镜像**：`features/ai_engine/src/main/ets/prompts/templates/*.ets`  
> **加载器**：`PromptLoader.load(runtime_key)`  
>
> 本文件仅作索引，**不要**在此粘贴完整 system prompt（避免与权威源双份漂移）。

---

## 映射表

| 阶段 | skill 文件 | runtime_key | templates | 管线入口 |
|------|------------|-------------|-----------|----------|
| 共享规则 | [00_shared_rules.md](../prompts/00_shared_rules.md) | — | `SharedPromptRules.ets` | `renderEnriched` |
| 器件选型 | [01_device_select.md](../prompts/01_device_select.md) | `device_select` | `DeviceSelectPrompt.ets` | `AiPipelineOrchestrator.fetchDeviceSelectLlm` |
| 布局 | [02_layout.md](../prompts/02_layout.md) | `layout` | `LayoutPrompt.ets` | `fetchLayoutLlm` |
| 建网计划 | [03_net_plan.md](../prompts/03_net_plan.md) | `net_plan` | `NetPlanPrompt.ets` | `fetchNetPlanLlm` |
| 布线约束 | [04_route.md](../prompts/04_route.md) | `route` | `RoutePrompt.ets` | `fetchRoutingLlm` / `AiEngineImpl.fetchRoutingConstraints` |
| 自检修复 | [05_self_review.md](../prompts/05_self_review.md) | `self_review` | `SelfReviewPrompt.ets` | `fetchSelfReviewLlm` |
| 故障诊断 | [06_diag.md](../prompts/06_diag.md) | `diag` | `DiagPrompt.ets` | 诊断任务 |
| 遗留整图 | [07_gen_sch.md](../prompts/07_gen_sch.md) | `gen_sch` | `GenSchPrompt.ets` | 遗留路径（生产整图勿用） |

---

## 维护流程

1. 改规则总纲 → [`skill/SKILL.md`](../SKILL.md)
2. 改某阶段 Prompt → 对应 `skill/prompts/0x_*.md`
3. **必须**同步到 `features/.../prompts/templates/*Prompt.ets`
4. 重新编译 App 后生效（真机不读磁盘 skill）

---

## 关键常量（须与代码一致）

| 常量 | 值 | 代码 |
|------|-----|------|
| 选中命中区 pad | 14 | `DeviceHitGeometry.SELECTION_HIT_PAD` |
| 无关引脚安全距 | 20 mil | `FOREIGN_PIN_CLEARANCE` |

---

## 注入辅助（非 LLM 模板正文）

`PromptLoader` 在运行时动态注入（不写入 md 正文）：

- `buildDeviceDetailForNetPlan` — 引脚世界坐标 + 选中区 AABB
- `buildPositionSummary` — 位置/拥挤度/选中区
- `buildWirePathReport` — 导线完整路径覆盖
- `TOPOLOGY_ANTIPATTERN_GUARD` — enriched 反模式警示
- 器件库 `library_catalog` / libDevId 清单
