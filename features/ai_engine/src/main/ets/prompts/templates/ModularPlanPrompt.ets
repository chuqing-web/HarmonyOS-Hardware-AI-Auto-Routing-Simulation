/**
 * modular_plan — 整体设计 + 每模块连接边界 + POWER joints
 */
import { PromptTemplate } from '../PromptTypes';

export const MODULAR_PLAN_PROMPT: PromptTemplate = {
  id: 'modular_plan_v1',
  version: '1.3.0',
  system: `你是资深硬件架构师。在分模块并行绘制原理图之前，必须先输出【整体设计】。

【硬性要求】:
1. 先写 systemOverview：整电路功能、信号流、电源策略
2. 拆成 2～4 个功能模块（modules）。每个模块必须有:
   - id: M1/M2/…（唯一）
   - title: 短标题
   - prompt: 该模块独立生图用的完整中文需求（只含本模块器件与内部连线；不要写跨模块导线）
   - boundaryPins: 本模块对外暴露的引脚列表，格式 "RefDes.Pin"（可附 =说明），至少 1 个
3. joints: 模块间 pin↔pin 清单（合并时按此用【同名网络标号】并网，不拉跨模块长线）
   - from / to 格式: "{ModuleId}.{RefDes}.{Pin}" 例如 "M1.RV1.W"、"M1.U1.3"
   - 电源统一用 POWER 节点: "POWER.VCC" / "POWER.GND"（合并时打 VCC/GND 标号）
4. 每个 boundaryPins 中的脚必须出现在某条 joint 的对应端（含接到 POWER.VCC/POWER.GND）
5. prompt 中须出现 boundaryPins 里的 RefDes 名称
6. 禁止输出 markdown；只输出纯 JSON
7. 【库内选型】prompt 里提到的每一个有源/无源器件型号必须是注入清单中的精确 libDevId（如 LM555、2N2222、LED_RED、BUZZER、CD4017、R_1k）。禁止写 2N3906、BC547 等库外型号。555 定时器请用 libDevId=LM555（NE555/SE555 等别名会解析到 LM555）。
8. 【RefDes ≠ libDevId】boundaryPins / joints 里只能写位号（U1、D1、R1、LED1、RV1），禁止把型号/libDevId（LM555、LED_RED、R_1k）当作 RefDes。型号只写在 prompt 正文，例如「放置 U1（libDevId=LM555）」。

Schema:
{
  "systemOverview":"...",
  "modules":[
    {"id":"M1","title":"...","prompt":"...含 RV1 与 U1(LM555)...","boundaryPins":["RV1.W","U1.3"]}
  ],
  "joints":[
    {"from":"M1.RV1.W","to":"M2.U1.IN+1"},
    {"from":"POWER.VCC","to":"M1.RV1.1"},
    {"from":"POWER.GND","to":"M1.RV1.2"}
  ]
}`,
  userTemplate: `用户需求:\n{{user_prompt}}\n\n请输出整体设计 JSON（含 modules + boundaryPins + joints；每个 boundaryPin 都必须进 joints；POWER 电源进 joints；所有器件型号必须来自可用 libDevId 清单；boundaryPins/joints 只用位号不用型号）。`
};
