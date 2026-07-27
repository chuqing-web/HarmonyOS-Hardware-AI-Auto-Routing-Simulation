# Multi-Agent Quality Bus — Phase 1/2 Implementation Notes

> 对应设计：`docs/superpowers/specs/2026-07-24-multi-agent-quality-bus-design.md`

## 已落地

### Phase 1

WAR、硬失败、Cline、Requirements Ask；edit/append/自检经 Coordinator

### Phase 2

1. Select/Layout/Net 独立 await + `CreatePipelineCtx`
2. `withCritiqueLimit` + `CRITIQUE_LIMITS`
3. 黑板快照续跑 + UI `enableReasoning`
4. **Modular 子模块 Agent** — `ModularModuleAgent`：子模块内 Select→Layout→Net→Route/QA
5. **LLM 批判** — `StageCritic.critiqueWithLlm`（规则命中时补一句话自检 JSON）
6. **selectLlm 快照** — `selectLlmJson` / `selectLlmOutput`；跳过 select 时恢复真约束

## 验收日志

- `[AI_AGENT] modular_child START/END` / `via ModularModuleAgent`
- `[AI_AGENT] stage=… llm_critique retry=`
- `[AI_AGENT] skip select (snapshot)` + `hasSelectLlm=true`
- `[AI_UI] enableReasoning=`

---

## 阶段加固清单（下一迭代）

> 交互视图：Cursor Canvas `quality-bus-hardening`  
> 原则：质量硬失败、禁 FORCE_COMPLETE 脏交付、生产 WAR 唯一、禁快照伪造 `fromLlm`

### 已落地（2026-07-27 全面加固）

- Select partial BOM / Layout 空 positions / Net 空网 → hardFail ABORT
- 禁快照伪造 `fromLlm:true`；skip select 须有 `selectLlmOutput`
- 去双跑 WAR（`warDone`）+ cancel 贯通；生产禁 A* 主路径
- WAR 失败网 rollback；`stripNonStubWires` 公共化
- Critic hard 不可否决；softMiss fail-closed；outer 重试对齐 CritiqueLimits(=3)
- modular/oneshot 均 `qualityHardFail`；AppService/AiEngineImpl 拒 residual 落图
- Requirements：cancel、澄清题过滤、summary/modules 门禁

### 已落地（2026-07-27 续加固）

- BlackboardSnapshot 扩：layoutLlm/netPlanNotes/degraded/abort/completedStages/lastRequirementsError
- `canSkip` 产物断言；Requirements 有限重试 + cacheSalt
- hardFail 禁静默补 VCC/GND（改 oodFlags）；选型 cache 含澄清盐
- 摆放 overlap 二次门禁；clear-loop `rerouteAfterFix` → WAR
- RouteAgent 每轮清 partial；Modular cancel 贯通；UI「严格质量」提示

### P0（优先）

| # | 阶段 | 位置 | 问题 → 加固 |
|---|------|------|-------------|
| 1 | Select | `runSelectStage` partial BOM | hardFail 下 `matchedReq<requireN` → abort |
| 2 | Select | Coordinator skip select | 无 `selectLlmOutput` 时禁伪造 `fromLlm:true` 空 BOM |
| 3 | Layout | `runLayoutStage` | positions 空 + hardFail → 禁 GA 兜底 |
| 4 | Net | `runNetStage` / skip net | 禁空网 CONTINUE；禁伪造空 `netPlan` |
| 5 | Route | `afterPipe` / Modular | 去双跑 WAR；`ensureWar` 接 cancel |
| 6 | QA | AppService / FORCE_COMPLETE | oneshot success=`ercClean`；禁 residual 冒充 |
| 7 | 横切 | `runModular` | `qualityHardFail=false` 与子模块双标 → 合并后硬 QA |

### Requirements（12）

1. 传入 `isCancel`（chat 前后检）
2. 生产禁 `skipLlm` 进 Coordinator
3. `summary/modules` 最小门禁
4. 澄清题 option 空 → 硬失败
5. resume 比对 prompt hash
6. 接入 `withCritiqueLimit(requirements)`
7. JSON 解析统一 `extractJson`
8. digest 按 prompt 扩样例
9. `errCode` → 可操作 suggest
10. skipLlm+answers 强制再跑 Requirements
11. `needsClarification` 禁 skip
12. 快照增 `lastRequirementsError`

### Select（12）

1. partial BOM ↔ hardFail（P0）
2. 成功条件含 matched/require
3. 禁假 `fromLlm` 空 BOM（P0）
4. KEEP_RETRY 与 CritiqueLimits 统一预算
5. Critic 不可否决 hard/zeroMatch
6. 静默补 VCC/GND → oodFlags
7. cache key + clarification hash
8. exhausted → `ok:false`
9. 失败也写 selectLlm 快照
10. oodFlags → softMiss
11. 空 requireList 内层 STAGE_FAIL
12. skipLlm 入口 assert

### Layout（12）

1. 空 positions + hardFail abort（P0）
2. 批判重试重置 placement
3. SOFT_OUTER × Critique 合并
4. overlap 二次验证
5. worker fallback → degradedMode
6. 快照 `layoutLlmJson`
7. optimizeAsync 统一 yield/cancel
8. 重叠进 hardLines
9. 分离 placementTopology
10. minClearance metric
11. 校验假 selectLlm 的 requireList
12. runId+attempt 日志贯穿

### Net（12）

1. 禁 `skipLlm` 伪造 fromLlm（P0）
2. 空网 hardFail abort（P0）
3. 禁 skip 伪造空 plan（P0）
4. exec failures 阻断
5. pin 连通审计进 hardLines
6. 每 attempt 从 placement 重建
7. sanitize 顺序：unknown→heal→exec
8. fetch 重试预算对齐
9. normalize null → abort
10. blackboard 存 netPlanNotes
11. Semantic 失败禁进 route
12. modular net abort fail-fast

### Route（12）

1. 生产 WAR-only，禁 A* 主路径（P0）
2. 去双跑 WAR（P0）
3. cancel 贯通（P0）
4. WAR 失败 rollback 该网线
5. clear-loop reroute → WAR
6. 缺 pin/dev 立即 fail
7. `stripNonStubWires` 公共化
8. RouteAgent StageHooks
9. hints sanitize 后再决定 skip LLM
10. assert library 已注入
11. 重试前清 failed partial
12. 修 net 快照后才能过缺 plan 检查

### QA（12）

1. hardFail 禁 GATE_DELIVER residual（P0）
2. oneshot 永不 FORCE_COMPLETE（P0）
3. 落图 success=`ercClean`（P0）
4. modular residual 硬失败或 UI 明示
5. abort 同步 `bb.abort`
6. 空拓扑统一 abortResult
7. geoStall → hard abort
8. 清 wire 公共函数
9. `qaPass` 避双 QA
10. abort 清空流式残图
11. floating hardFail 拒交付
12. gate 接 cancel

### 横切（10）

1. modular/oneshot 门禁统一（P0）
2. skipLlm 禁绕过 Coordinator（P0）
3. 扩 BlackboardSnapshot（layout/net/routing）
4. canSkip 验产物存在
5. `completedStages[]`
6. Modular 双实现收敛
7. child cancel 传播
8. 仅 pass 时 `markStageDone(qa)`
9. Requirements 批判配置落地或删 dead
10. UI「严格质量」状态 + modular 严格开关

### 建议 Sprint

- **A 硬门禁**：Select/Layout/Net/QA P0 + modular 双标
- **B 快照与 WAR**：禁伪造 fromLlm、扩快照、单 WAR、cancel
- **C 批判预算**：Critic hard 不可否决、统一 KEEP_RETRY、Requirements 接入批判
