# 模块化并行 AI 生图设计

日期：2026-07-17  
状态：已批准（用户确认）· 实现加固中（失败不落空图 / 子模块重试 / joint 门禁）

## 问题

复杂电路走单次 `runFullPipeline` 时，选型/布局/建网/布线多轮 LLM 串行，墙钟时间很长。需要在保持 **AI 全权生图**（无模板假图）的前提下加速，并保证跨模块电气连接正确。

## 目标

1. **每次生成都询问**用户选择：`整图一次` 或 `模块并行`。
2. 选模块并行时：**先整体设计 + 连接边界门禁**，再 **真并行** 各模块生图，最后按 **pin-to-pin joints** 合并。
3. **VCC/GND** 用统一 `POWER` 节点进入 `joints`，不在各模块重复各自为政的电源符号策略（合并时按 POWER 契约接电源地）。
4. 全程真实 LLM；禁止静默模板回退。

## 非目标

- 不做「假并行」（UI 串行多次 append 冒充加速）。
- 不在本阶段做自动复杂度检测（用户明确选 B：每次都问）。
- 不引入命名网络接口作为主契约（用户选边界器件+引脚）。

## 用户交互

入口：`AiSettingsPanel` 点「生成整图」。

对话框：

1. **生成策略（必选）**
   - 整图一次 → 现有 `TASK_FULL_PIPELINE` / `runFullPipeline`
   - 模块并行 → 新任务 / `runModularParallelPipeline`
2. **画布模式**（画布已有电路时）
   - 替换整图 / 追加到空白区
3. 取消

状态文案示例：`整体设计中…` → `并行生成模块 2/3…` → `按边界合并中…`

日志标签：`[AI_PIPE] modular_plan` / `modular_parallel` / `modular_merge`；UI：`[AI_UI] OP modular_*`。

## 流水线

```
用户选「模块并行」
  → ① LLM 整体设计（1 次，门禁）
  → ② Promise.all：各模块 forkForModule 隔离子编排器 → runFullPipeline(子 prompt)
       （独立 intent / wiringEngine / placement / select；共享 apiManager + 器件库）
  → ③ 按 joints pin-to-pin 合并 + 通道消解 + ERC/几何门禁
  → 落图画布（replace / append 与现网一致）
```

### ① 整体设计（硬门禁）

单次 LLM，输出 JSON（snake/camel 均可，经 `LlmJsonNormalizer`）：

| 字段 | 要求 |
|------|------|
| `systemOverview` | 整电路功能与信号流简述 |
| `modules[]` | 2～4 个模块；每项含 `id`, `title`, `prompt`, `boundaryPins[]` |
| `joints[]` | 模块间（及与 POWER）的 pin↔pin：`from` / `to` |

`boundaryPins`：本模块对外暴露的 `ref.pin`（或带说明），**每个模块至少一个对外边界脚**（纯内部无界面的模块不允许，除非仅通过 POWER 联接且 joints 已写明）。

`joints` 引用格式：`{ModuleId}.{RefDes}.{PinLabel}`，例如 `M1.RV1.W`；电源用 `POWER.VCC` / `POWER.GND`。

**门禁（未过不得并行）：**

- `modules.length` ∈ [2, 4]
- 每个 module 有非空 `prompt` 与非空 `boundaryPins`
- 每个 `boundaryPins` 项能在该模块 prompt/约定 ref 中对应
- 每条 joint 的两端可解析；跨模块脚必须出现在对应模块的 `boundaryPins` 中（POWER 端除外）
- 至少有电源相关 joints（接到 `POWER.VCC` / `POWER.GND`），除非 overview 明确无源（教学浮空除外，默认要求电源）
- **库内型号**：`modular_plan` 注入 libDevId 清单；prompt/overview 不得出现无法解析的经典库外型号（如 NE555）；无 555 时须用库内替代拓扑

失败：KEEP_RETRY 回灌批判（最多有限轮），仍失败则报错给用户（**不**静默改走模板；可选提示改选「整图一次」）。

子模块 `runFullPipeline` 的 prompt **仅**含模块需求 + boundary 约束，**不**注入完整 `systemOverview`（避免 Intent 关键词污染）。

### ② 真并行子流水线

对每个 module：

- 调用现有 `runFullPipeline`，`prompt` = 模块子 prompt + 注入「本模块 boundaryPins；禁止发明 joints 外的跨模块连线；电源脚留给 POWER 合并」
- 布局偏移：按模块索引平移到不重叠画布分区（如列偏移 400mil）
- `refDes` 加模块前缀（如 `M1_`），保证合并不撞名；joints 解析时同步映射
- `Promise.all` 等待全部完成；单模块失败：KEEP_RETRY 该模块；全部失败则整体失败

进度：按完成数更新 `并行生成模块 i/n`。

### ③ 合并

1. 拼接各模块 `deviceList` / `wires` / `nets` / labels（uuid 重映射）
2. 物化 `POWER.VCC` / `POWER.GND`：若合并结果尚无 VCC/GND 符号则放置一对，并按 joints 接到各模块边界电源脚
3. 按 `joints` **同名网络标号**并网（`joinByLabel`；含 POWER.VCC/GND），不拉跨模块长导线
4. `resolveSelectionOverlaps` + `routeUntilClean`（已有 stub/标号脚不再 A* 长线）
5. 既有 ERC + 几何完成门禁（`AiErcGateUtil`）；未清零 → INCOMPLETE 落图供检视（与现行为一致）

## API / 类型面

| 层 | 变更 |
|----|------|
| UI | `AiSettingsPanel`：策略 + replace/append |
| AppService | `aiGenerateCircuitFromPrompt(prompt, mode, strategy?: 'oneshot' \| 'modular')` |
| AiEngine | 新 task 或 `extra.strategy='modular'` 分支到 `runModularParallelPipeline` |
| Orchestrator | `runModularParallelPipeline`；plan fetch + critique；parallel + merge |
| Prompts | 新 `modular_plan` 模板（skill/prompts + runtime templates） |

## 约束与质量

- 生产路径禁止 `CircuitTemplates` 冒充整图
- HTTP 长等待策略不变（复杂模块仍可能慢，但墙钟≈最慢模块 + 计划 + 合并）
- 模块数硬顶 4，避免 API 打满
- 编辑模式（多轮对话）：首期可禁用模块并行或仅 oneshot；若启用须基于当前拓扑做增量整体设计（实现阶段二选一，默认：**编辑模式强制 oneshot**）

## 验收

1. 每次点生成都出现策略选择。
2. 选整图一次：行为与现网一致。
3. 选模块并行：日志可见 plan → parallel → merge；画布出现多模块且 joints 对应脚已连通。
4. 故意缺 boundary 的 plan 被拒并重试，不进入并行。
5. VCC/GND 仅经 POWER joints 接到模块，无悬空电源脚（门禁清零时）。

## 决议记录

- 并行模式：真并行多路再合并（B）
- 联合契约：边界器件 + 引脚 pin-to-pin（2）
- 询问时机：每次生成都问（B）
- 先整体设计 + 边界门禁，再并行（用户追加确认）
- POWER 统一进 joints（用户确认）
