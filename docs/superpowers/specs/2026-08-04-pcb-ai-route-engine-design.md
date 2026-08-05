# PCB Layout AI 布线引擎设计

**Status:** Implementing  
**Date:** 2026-08-04（2026-08-05 更新：几何阶段引入本地确定性兜底）

## Goal

产品内提供与原理图多 Agent 对齐的 PCB AI 布局+布线。策略/判断/修复由 LLM 决定；几何执行层做 clearance/连通性门禁；当 LLM 折线不可用或反复违反空间约束时，本地确定性路由器（jog/板边走廊/环形绕行）兜底重布，保证一次通过率。

## Two separate features

| 功能 | 入口 | 实现 |
|------|------|------|
| **自动布线** | F8 / 工具栏 | 经典 `autoRoutePcb` |
| **AI 布线** | 右侧栏「AI布线」Tab（F9 打开） | `PcbAiRoutePanel` + 多 Agent；API 与原理图共用 `AiApiConfigSection` / 金库 |

UI 对齐原理图 `AiSettingsPanel`：顶栏标题 + ⚙ API 折叠 + 日志气泡 + 底部操作按钮。

## AI Pipeline

```
placement (LLM) → net_plan (LLM) → route_policy (LLM, 必跑)
  → geometry (LLM 折线 + 本地门禁；LLM 不可用/失败 → 本地确定性重布)
  → qa (DRC) → qa_repair (LLM) → re-exec → commit or ABORT
```

几何阶段（`PcbGeometryAgent`）：
1. LLM 输出正交折线 → `applyLlmPcbGeometry` 做 clearance + 焊盘连通性门禁
2. LLM 回复杂质 / JSON 非法 / 琐碎覆盖 / 门禁失败 → `runPcbGeometryRoute` 本地全量确定性重布（L 型、jog 偏移、板边走廊、环形绕行、电源 hub 生长）
3. 两边都失败 → 选失败网更少者提交部分铜，原因回流 QA
4. 本地路由结果同样过「连通性复核」（`netCopperConnectsPads`），有铜未连通的网直接撕铜判失败

## Hard rules

- No skipLlm, no default layer-role table at runtime, no demotion
- Abort keeps board unchanged
- LLM 几何不可用≠网络失败：仅 API 未成功时不走本地兜底（`usedLlm` 未置位，交付本就拒绝）
- `layerRoles` must cover every copper layer
- QA repair requires `pcb_qa_repair` LLM before re-geometry
- 几何 prompt 附焊盘禁区 bbox（`padBlockSummary`）：DIP/多列器件按区域避障；长 H/V 分走 signal_h/signal_v 层，禁止全部堆单层
