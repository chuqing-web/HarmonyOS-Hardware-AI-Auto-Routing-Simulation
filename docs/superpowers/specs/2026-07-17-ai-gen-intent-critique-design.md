# AI 生图意图门控与 Critique 治理设计

日期：2026-07-17  
状态：已批准 · 已落地（CircuitIntent + HARD/SOFT + 重试早停 + Prompt 意图注入；modular 路径已恢复）  
关联：方案 C（CircuitIntent + HARD/SOFT + 重试早停 + Prompt 按意图注入）

## 问题

当前流水线 critique / prompt / PostGen 存在系统性缺陷：

1. **专属拓扑当全电路铁律**：互斥双色、MCU 最小系统、仪器追加、LED:R 1:1 等规则在无意图时仍拒收，导致假阳性重试（如「脚踢+红绿灯闪烁」被当成 SPDT 互斥）。
2. **内循环过长**：device_select / net_plan 内层可达约 25 轮，layout 约 6 轮；不可修复的启发式残差反复烧 LLM，最后仍 `KEEP_RETRY` 接受脏结果。
3. **Prompt 默认过宽**：`DeviceSelectPrompt` / `NetPlanPrompt` / `SelfReviewPrompt` 把教材级「铁律」写进每次请求，与 critique 双重误导模型。
4. **无统一意图中枢**：仅散落 `isMutualLedSwitchPrompt` 等字符串匹配，各阶段门控不一致。

日志典型症状：layout 连续 6 轮间距拒收 → residual ACCEPT；net_plan 连续多轮「无 RELAY_SPDT」误杀 → 墙钟数十分钟。

## 目标

1. 引入共享 **`CircuitIntent`**，在流水线早期一次分类，供 prompt 注入、critique、PostGen 共用。
2. Critique 分为 **HARD**（可拒收重试）与 **SOFT**（不堵死内循环，记 residual / 交 self-review）。
3. **压缩内循环 + 稳定残差早停**；layout 尽早交给确定性间距消解。
4. **Prompt 按意图注入**：默认只保留通用硬约束；专属拓扑片段仅在 intent 命中时追加。
5. 坚持：**永不 ABORT**；内循环耗尽或早停后 **残差 ACCEPT，继续流水线**（与现 KEEP_RETRY 一致）。
6. **几何接近、跨网交叉等非短路几何项保持 error**（不降为 warning）；仍可通过残差 ACCEPT 进入后续自审/布线修复，但不改变其 severity。

## 非目标

- 不引入模板 / `CircuitTemplates` 假图回退。
- 不缩短 HTTP 读超时；不因「觉得太久」取消 LLM。
- 不把几何/跨网交叉降为 warning。
- 不改变 modular 并行主契约（`joints` / POWER）；modular_plan 门禁可复用 intent，但不在本设计重写合并逻辑。
- 不做自动「用户复杂度检测」；oneshot / modular 仍由用户选择。

## 用户确认约束

| 项 | 决定 |
|----|------|
| 方案 | C：Intent + HARD/SOFT + 重试早停 + Prompt 注入 |
| HARD 失败策略 | 永不 ABORT；残差 ACCEPT 继续流水线 |
| 几何/跨网交叉 | 保持 `error`，不降 warning |

## 架构

```
prompt
  → classifyCircuitIntent(prompt)          // 选型前：粗意图
  → device_select LLM（prompt 按 intent 注入）
  → refineCircuitIntent(prompt, BOM)       // 选型后：精修
  → layout / net_plan / routing / self_review / PostGen
       全部读同一 CircuitIntent
```

### `CircuitIntent` 字段（建议）

```typescript
interface CircuitIntent {
  needsPowerRails: boolean;      // 默认 true；明确无源/教学浮空可 false
  hasMcuMinSystem: boolean;      // 含 MCU 且非纯外设拼接
  mutualLedIndicator: boolean;   // 开/闭互斥双色（需 RELAY_SPDT）
  blinkOscillator: boolean;      // 闪烁/多谐/交替 → 禁止互斥继电器规则
  relayContactTopo: boolean;     // BOM 已含继电器且需触点拓扑校验
  hasInstruments: boolean;       // 用户要或 BOM 已含仪器
  needsLedSeriesR: boolean;      // LED 驱动需限流（非共享例外留给 SOFT）
  needsI2cPullup: boolean;
  needsOpAmpFeedback: boolean;
  passiveOnly: boolean;
  // 诊断用
  reasons: string[];             // 命中关键词/BOM 证据，打 instr_trace
}
```

分类原则：

- **闪烁/振荡/多谐/跑马灯** → `blinkOscillator=true`，强制 `mutualLedIndicator=false`。
- **互斥**仅当明确开/闭、常开/常闭、松开+按下等语义，且非 blink。
- **禁止**用「双 LED + SW_PUSH」推断互斥。
- **继电器触点专项**：仅 `mutualLedIndicator || relayContactTopo`（后者 = BOM 有 RELAY 且 intent/约束写明触点指示，或自审标注）。

### 日志

- `[AI_PIPE] intent | power=… mcu=… mutual=… blink=… relay=… reasons=…`
- `[AI_PIPE] critique HARD=n SOFT=n` / `early_stop residual_stable`
- `[AI_PIPE] KEEP_RETRY … residual ACCEPT`（语义不变）

## Critique：HARD vs SOFT

### HARD（可触发内循环拒收；耗尽仍 ACCEPT）

| 规则 | 门控 |
|------|------|
| JSON / schema / 非空 positions·nets | 始终 |
| explicitModel 在库内 | device_select |
| 一脚不得属两网 | net_plan |
| 电流表 I+/I- 同网 | 有电流表时 |
| VCC/GND **网络**存在 | `needsPowerRails` |
| VCC/GND **符号**在选型列表 | `needsPowerRails` |
| 布局：positions 数量、画布范围、严重重叠（可选：通道不足可归 SOFT 或交确定性修复） | layout |
| 几何接近 / 跨网交叉 / 穿选中区 | **保持 error**（PostGen / geo gate）；不因本设计降级 |

说明：layout 的「两选中区通道 ≥80mil」若导致 LLM 反复无法满足，**优先 2–3 轮后 ACCEPT + `resolveSelectionOverlaps`**，而不是把规则删掉。

### SOFT（不堵死内循环；写入 residual / self-review 提示）

| 规则 | 门控 |
|------|------|
| MCU → 晶振 / 去耦 / 复位上拉 | `hasMcuMinSystem` |
| LED 颗数 ≤ 限流电阻颗数 | `needsLedSeriesR && !blinkOscillator` 可仍检查，但仅 SOFT；或 blink 时放宽 |
| 运放反馈电阻 | `needsOpAmpFeedback` |
| I2C 上拉 | `needsI2cPullup` |
| GPIO 禁止直连电源（子串启发式） | SOFT；后续用库 pin 元数据硬化为 HARD |
| 互斥缺 RELAY / NC·NO·COM 拓扑 | `mutualLedIndicator` |
| 继电器线圈须经 SW | `mutualLedIndicator` |
| 孤儿电容 | 非 MCU 且无功能描述时 SOFT；不整网重建 |

**关键修正**：`hasRelay && ledN >= 2` **不得**自动启用完整 SPDT 铁律；必须 `mutualLedIndicator || relayContactTopo`。

## 重试策略

| 阶段 | 现况（约） | 目标 |
|------|------------|------|
| device_select 内循环 | 25 | **4** |
| layout 内循环 | 6 | **3**，其后 ACCEPT + 确定性间距消解 |
| net_plan 内循环 | 25 | **4** |
| 外层 KEEP_RETRY | 8 | 保持 8（或略降到 4，实现时按回归定） |
| 稳定残差早停 | 无 | 同一 HARD residual **指纹连续 2 轮不变** → 立即 ACCEPT |

指纹：HARD issue 文案规范化后排序拼接（忽略轮次号）。SOFT 不参与拒收指纹。

外层：`fromLlm=false` / 空结果仍 KEEP_RETRY；**禁止**模板兜底。

## Prompt 按意图注入

### 默认骨架（每次都有）

- 输出纯 JSON、库内 ID、一脚一网
- 电流表串联 / 电压表分布（仅当有仪器意图或 BOM 含仪器时加强）
- 反模式警示中的**通用短路类**（I+/I- 同网、VCC 直地无负载等）

### 条件片段（intent 命中才 append）

| Intent | 注入内容 |
|--------|----------|
| `hasMcuMinSystem` | 晶振、去耦、复位、BOOT/EA |
| `needsLedSeriesR` | LED+限流配对 |
| `mutualLedIndicator` | RELAY_SPDT + NC/NO/COM + SW 驱线圈 |
| `blinkOscillator` | **显式写**：电源开关+交替闪烁合法；禁止套用互斥继电器规则 |
| `needsI2cPullup` / `needsOpAmpFeedback` | 对应片段 |
| `hasInstruments` | 仪器追加与入网规则 |

文件约定：

- 改 `skill/prompts/*.md`（若有）再同步 `features/ai_engine/.../prompts/templates/*.ets`
- `PromptLoader` 增加 `buildXxxPrompt(intent, vars)` 或等价拼装，避免巨型恒定字符串。

LayoutPrompt 与 `critiqueLayout`：**MCU 中心区数值对齐**（统一为一套区间）。

## PostGenValidator

- `checkDualLedSwitchTopology`：仅 `mutualLedIndicator || relayContactTopo`；无继电器时不报「缺少 RELAY」。
- 几何接近、跨网交叉、穿选中区：**保持 error**。
- 缺 RELAY 触发的 Semantic 整网重建：仅在 `mutualLedIndicator && 缺 RELAY` 时触发；闪烁类禁止。
- 孤儿电容等：SOFT 语义（可记 issue，避免清空已成功 LLM net_plan）。

## 与模块并行的关系

- `runModularParallelPipeline` 整体设计阶段可对 overview 做粗 intent；子模块子 prompt 继承/裁剪 tags。
- modular_plan 门禁失败策略本设计不改（仍可硬失败或 KEEP_RETRY，以现网为准）；intent 仅减少子流水线误杀。

## 实现落点（文件）

| 文件 | 变更 |
|------|------|
| 新建 `algorithms/CircuitIntent.ets`（或 `internal/`） | 分类 + refine + 指纹工具 |
| `AiPipelineOrchestrator.ets` | 接入 intent；HARD/SOFT；轮次与早停；critique 门控 |
| `PostGenValidator.ets` | 门控双 LED/继电器；去掉无意图缺 RELAY |
| `DeviceSelectPrompt.ets` / `NetPlanPrompt.ets` / `LayoutPrompt.ets` / `SelfReviewPrompt.ets` | 拆默认 + 条件片段 |
| `PromptLoader.ets` | 按 intent 组装 |
| （可选）`skill/prompts/*.md` | 与 ets 同步 |

## 验收标准

1. 提示「生成一个红绿灯脚踢闪烁的电路」：选型可含 SW+双 LED+三极管；**net_plan 不得**因缺 RELAY_SPDT 拒收循环。
2. 提示明确「开关打开绿灯、闭合红灯」：选型必须含 RELAY_SPDT；缺则 HARD 拒收（有限轮后仍 ACCEPT 交后续，但不误杀闪烁类）。
3. 同 HARD 残差连续 2 轮：日志出现 `early_stop residual_stable`，不再打满 4 轮无意义重试。
4. layout：≤3 轮 LLM 后可 ACCEPT，并有 hit-overlap / 通道确定性修复日志。
5. instr_trace 含 `[AI_PIPE] intent | …`。
6. 几何/跨网交叉仍以 error 出现在 PostGen/geo（若触发）；流水线仍可不 ABORT 继续。
7. 无新增模板回退路径。

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| Intent 漏检互斥 → 少强制继电器 | 保留明确关键词；自审 prompt 在 `mutualLedIndicator` 时加强 |
| Intent 过检 → 仍误杀 | blink 优先否决；禁止 SW+双LED 推断 |
| 轮次减少后质量下降 | SOFT 进 self-review；HARD 残差仍进后续修复 |
| Prompt 拆分回归 | 对照旧全量 prompt 做片段清单 + 回归用例表 |

## 实现顺序建议

1. `CircuitIntent` + 日志 + 接入 orchestrator（先只改 critique 门控，prompt 仍全量）
2. HARD/SOFT + 轮次/早停
3. Prompt 按意图拆分注入
4. PostGen 对齐
5. 用闪烁 / 互斥 / MCU 最小系统三类提示做真机回归

## 开放项（实现时可定默认）

- 外层 `NEVER_ABORT_OUTER` 保持 8 或降为 4：默认 **保持 8**，除非回归显示过慢。
- layout「通道不足」算 HARD 还是交确定性修复后 SOFT：默认 **内循环计 HARD，但早停后确定性修复优先**。
