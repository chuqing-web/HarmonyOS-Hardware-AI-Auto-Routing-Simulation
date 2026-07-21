# 选型后注入器件用法手册（全库）

## Goal

AI 整图流水线在 `library_match` 完成后，将**本次选中器件**的手册级用法注入后续 LLM 阶段，减少瞎连线与脚名臆造。

## Non-goals

- 不在 `device_select` 注入（选型前型号未定）
- 不把整库手册一次塞进 prompt（只注入本次 BOM）
- 不新增 LLM fallback / 模板回退

## Architecture

1. **数据**：`DeviceUsageManual`（独立于 `BuiltinComponents`）
   - 精确 `libDevId` 条目 + 族前缀模板（`R_*` / `C_*` / `POT_*` / `LED_*` / `74HC*` / `STM32*` / `AT89*` / `STC*` / `XTAL_*`）
   - 覆盖 `ALL_CATALOG_LIBRARY_IDS` 全量；缺失时用库 `description`+引脚兜底并打 `usage_manual miss` 日志
2. **格式化**：`PromptLoader.buildDeviceUsageForLibIds(ids, mode)`
   - `full`：用途 / 真脚 / 典型接法 / 禁例 / 参数 / 仿真注意
   - `compact`：1～3 行摘要（layout/route）
   - Token：单器件 full ≤800 字；整块 ≤8k；裁剪优先级 IC/MCU/仪器 > 分立 > 无源
3. **注入点**
   - `fetchLayoutLlm` → `{{device_usage}}` compact
   - `fetchNetPlanLlm` → `{{device_usage}}` full（主战场）
   - `fetchRoutingLlm` → `{{device_usage}}` compact
4. **复用**：`TeachingService.getKnowledgeTip` / `buildAiQuestion` 读同一手册源

## Success

- 全库 ID `resolve(id)` 非空
- net_plan prompt 含 `【本次选型器件使用说明】` 且含所选 `libDevId`
- `instr_trace`：`[AI_PIPE] usage_manual devices=N miss=M chars=C`
