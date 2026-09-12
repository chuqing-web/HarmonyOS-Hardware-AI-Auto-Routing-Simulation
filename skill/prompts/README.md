# AI Prompt 权威源（skill/prompts）

> **版本**: 5.9 | **同步目标**: `features/ai_engine/.../prompts/templates/*.ets` +
> PCB 五 Agent：`entry/.../PcbAutoRouteAgent.ets`（Placement/Strategy/Routing/Critic/Knowledge）
>
> **v5.9**: 删除 F8 `10`–`15` 挂点 prompts；自动布线改为 Orchestrator + 五 Agent（prompts 内联于 `PcbAutoRouteAgent.ets`）。

## 原则

1. **本目录是 Prompt 文案的唯一权威源**（与 `skill/SKILL.md` 规则总纲配套）。
2. **真机无法读磁盘上的 `skill/`**。运行时由 `PromptLoader` 加载 `templates/*.ets`（由本目录同步）；F8 由 `PcbAutoRouteAgent` 内联字符串加载（须与本目录 md 对齐）。
3. **改 md 后必须同步对应运行时文件**，否则 App 行为不变。

## 文件映射

| skill/prompts | runtime_key | templates/*.ets / 实现 | 管线调用 |
|---------------|-------------|------------------------|----------|
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
| （内联） | pcb_route_agents | `PcbAutoRouteAgent.ets` | Orchestrator 五 Agent |

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
| `{{copper_layers}}` | F8 铜层 JSON 数组 |
| `{{net_summaries}}` | F8 网摘要行 |
| `{{fail_summaries}}` | F8 失败/未连通网 |
| `{{metrics_summary}}` | F8 布通率等指标 |

## 同步检查清单

- [ ] 改完 `00_shared_rules.md` → 更新 `SharedPromptRules.ets` + 各引用阶段
- [ ] 改完某阶段 md → 更新对应 `*Prompt.ets` 的 `system` / `userTemplate`
- [ ] 改完 `10`–`14` F8 md → 更新 `entry/.../PcbAutoRouteAgent.ets` 全部 build*Prompt + HARD_REPLY_CONTRACT
- [ ] 几何常量与 `DeviceHitGeometry` 一致：`HIT_PAD=22`，无关脚 `≥20mil`
