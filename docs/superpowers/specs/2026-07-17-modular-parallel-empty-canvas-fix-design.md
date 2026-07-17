# 模块并行空图失败修复设计

日期：2026-07-17  
状态：已批准（方案 1）· 已落地  
关联：`2026-07-17-modular-parallel-ai-gen-design.md`、本次 instr_trace（红灯+蜂鸣器交替）

## 问题

选「模块并行」后整次失败 / 空图（`modular_parallel FAIL` 或子模块无拓扑）。

根因（日志已证）：

1. **`modular_plan` 未注入 libDevId 清单**（`promptLen≈1.2k` vs 选型 `≈24k`），LLM 编造 **NE555 / 2N3906** 等库外型号。
2. **plan 门禁不校验库内型号**，脏 plan 进入并行。
3. **子 prompt 注入整电路 overview**，子模块 Intent 被「红灯/交替」污染（次要；主要导致错规则，偶发选型失败）。

## 目标

- plan 阶段强制库内器件；库外型号 HARD 拒收并重试。
- 子模块 prompt 不再因 overview 误触发 LED/blink 等无关意图。
- 同提示「红灯和蜂鸣器交替」应能得到非空合并拓扑（允许 joints 小瑕疵，但禁止空图）。

## 非目标

- 不新增模板回退 / 不静默改 oneshot。
- 不在本轮扩库加 NE555（用库内替代拓扑）。
- 不重写 merge / joints 主契约。

## 方案（已选 1）

| 项 | 做法 |
|----|------|
| Prompt | `modular_plan` 注入 libDevId 清单 + 库外禁止文案 |
| Critique | `critiqueModularPlan(plan, library)` 扫描经典库外型号 / 未解析 ID |
| 子 prompt | `buildModuleSubPrompt` 去掉完整 overview；保留 id/title/boundaryPins |
| 编排 | `fetchModularPlanLlm` 使用 `includeLibIds: true` |

## 验收

1. `[AI_API] PROMPT` modular_plan 含「可用器件 libDevId 清单」。
2. 若 plan 仍写 NE555 → 日志 `modular_plan critique reject` 含库外，不进入 parallel。
3. 通过后 parallel 三模块均 `deviceList.length > 0`，最终非空落图。
4. M1 子流水线 intent 不再因 overview 出现无依据的 `led_keyword`（本模块无灯时）。
