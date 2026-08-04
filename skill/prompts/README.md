# AI Prompt 权威源（skill/prompts）

> **版本**: 5.1 | **同步目标**: `features/ai_engine/src/main/ets/prompts/templates/*.ets`
>
> **v5.1 / 仪器 v4.0**: 对齐四端万用表 `VIRTUAL_METER(V,A,OHM,COM)`、功率表 V并/I串、
> OSC/LA 真脚与 `SIM_CONN` 回线规则；改仪器相关条文后务必同步 md↔ets。

## 原则

1. **本目录是 Prompt 文案的唯一权威源**（与 `skill/SKILL.md` 规则总纲配套）。
2. **真机无法读磁盘上的 `skill/`**。运行时由 `PromptLoader` 加载 `templates/*.ets`（由本目录同步）。
3. **改 md 后必须同步同名 `.ets`**，否则 App 行为不变。

## 文件映射

| skill/prompts | runtime_key | templates/*.ets | 管线调用 |
|---------------|-------------|-----------------|----------|
| `00_shared_rules.md` | (公共) | `SharedPromptRules.ets` | `renderEnriched` 注入 |
| `01_device_select.md` | `device_select` | `DeviceSelectPrompt.ets` | `fetchDeviceSelectLlm` |
| `02_layout.md` | `layout` | `LayoutPrompt.ets` | `fetchLayoutLlm` |
| `03_net_plan.md` | `net_plan` | `NetPlanPrompt.ets` | `fetchNetPlanLlm` |
| `04_route.md` | `route` | `RoutePrompt.ets` | `fetchRoutingLlm` |
| `05_self_review.md` | `self_review` | `SelfReviewPrompt.ets` | `fetchSelfReviewLlm` |
| `06_diag.md` | `diag` | `DiagPrompt.ets` | 诊断任务 |
| `07_gen_sch.md` | `gen_sch` | `GenSchPrompt.ets` | 遗留整图 |
| `08_modular_plan.md` | `modular_plan` | `ModularPlanPrompt.ets` | `fetchModularPlanLlm` |
| `09_requirement.md` | `requirement` | `RequirementPrompt.ets` | `RequirementsAgent` |
| `10_pcb_placement.md` | `pcb_placement` | `PcbPlacementPrompt.ets` | `PcbPlacementAgent` |
| `11_pcb_net_plan.md` | `pcb_net_plan` | `PcbNetPlanPrompt.ets` | `PcbNetPlanAgent` |
| `12_pcb_route.md` | `pcb_route` | `PcbRoutePrompt.ets` | `PcbRoutePolicyAgent` |
| `13_pcb_qa_repair.md` | `pcb_qa_repair` | `PcbQaRepairPrompt.ets` | `PcbQaAgent` |

## md 结构

```markdown
---
id: device_select_v5
version: 5.0.0
runtime_key: device_select
---
## system
...
## userTemplate
...
```

## 常用变量

| 变量 | 用途 |
|------|------|
| `{{user_prompt}}` | 用户自然语言需求 |
| `{{library_catalog}}` / `{{library_summary}}` | 器件库摘要 |
| `{{device_detail}}` / `{{position_summary}}` | net_plan 器件+选中区 |
| `{{density_report}}` / `{{wire_summary}}` | self_review 几何 |
| `{{conversation_history}}` | 多轮对话 |

## 同步检查清单

- [ ] 改完 `00_shared_rules.md` → 更新 `SharedPromptRules.ets` + 各引用阶段
- [ ] 改完某阶段 md → 更新对应 `*Prompt.ets` 的 `system` / `userTemplate`
- [ ] 几何常量与 `DeviceHitGeometry` 一致：`HIT_PAD=22`，无关脚 `≥20mil`
