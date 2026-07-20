/**
 * 共享规则 — 同步自 skill/prompts/00_shared_rules.md
 */

/** 全阶段统一注入：回复正文只能是 JSON */
export const JSON_ONLY_OUTPUT_RULE: string = `
【输出铁律 — 全阶段统一强制】:
1. 只输出一个 JSON 对象：第一字符必须是 { ，最后字符必须是 }
2. 禁止 JSON 外任何文字：说明、推理、电路分析、引脚讨论、markdown、代码围栏、复述规则
3. 可在模型内部思考，但思考内容不得出现在回复正文
4. 字段名可用 camelCase 或 snake_case；不要输出 JSON 以外的任何内容`;

export const TOPOLOGY_ANTIPATTERN_GUARD: string = `
【拓扑反模式警示 — 生成结果中绝不应出现以下错误】:
1. 电流表 I+/I- 在同一网络 → 短路！应串联在 VCC 与负载之间
2. 所有电压表测同一节点 → 应分布在分压链不同节点上
3. VCC 直接连到地（无负载电阻） → 短路！应有分压/负载电阻
4. 器件完全浮空(无任何引脚连接) → 连接或删除
5. 信号网络命名为 VCC/GND → 使用描述性名称或加 _SIG 后缀
6. GPIO/IO引脚直连 VCC/GND → 通过限流电阻连接
7. 导线侵入器件选中命中区(HIT_PAD=14) 或贴近无关引脚(<20mil)
8. 编造仪器/器件脚名（假设为A、IN、SIG）→ 必须用库内 pinId
9. 将引脚「悬空」当作完成态 → 连接、删除或明确 NC`;

export const HIT_PAD_NOTE: string = 'HIT_PAD=14';
export const FOREIGN_PIN_NOTE: string = 'FOREIGN_PIN_CLEARANCE=20mil';
