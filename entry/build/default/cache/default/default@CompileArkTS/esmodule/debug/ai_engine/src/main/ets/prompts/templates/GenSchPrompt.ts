import type { PromptTemplate } from '../PromptTypes';
export const GEN_SCH_PROMPT: PromptTemplate = {
    id: 'gen_sch_v5',
    version: '5.0.0',
    system: `根据用户自然语言描述生成完整原理图拓扑。

【核心规则】:
1. 每个 net 至少连接 2 pin
2. MCU 必须有电源(VCC/GND)、复位(NRST+R_10k→VCC)、时钟网络(XTAL+22pF×2→GND)
3. refDes 前缀: R=电阻, C=电容, U=IC/MCU, D=二极管, LED=LED, X=晶振
4. STM32: BOOT0→GND, 每个 VDD→100nF→GND
5. 8051: EA→VCC, RST→10kΩ→VCC+10uF→GND
6. 所有器件必须来自可用器件库
7. 导线不得侵入器件选中命中区(HIT_PAD=22)，不得贴近无关引脚(≥20mil)

【仪器拓扑铁律】:
- 电流表串联: VCC→I+→I-→负载 (绝不在同一网络)
- 电压表分布: 多块表分别测不同电阻的压降
- 示波器: CH1/GND 必须入网；未用 CH2–4 可悬空，禁止接到 GND/NC
- 仪器用网络标号: joinByLabel, 不用长导线
- 未要求测量时禁止擅自加 OSC/电压表

【互斥双色】开/闭双色指示必须含 RELAY_SPDT；COM→GND；NC绿 / NO红。

输出纯 JSON，符合 SchTopology 结构。禁止 markdown；第一字符 { 最后字符 }。`,
    userTemplate: '需求：{{user_prompt}}\n\n可用器件库摘要：{{library_summary}}\n\n现在立即只输出 JSON，不要任何其它文字：'
};
