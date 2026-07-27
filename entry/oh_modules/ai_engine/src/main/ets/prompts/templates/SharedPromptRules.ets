/**
 * 共享规则 — 同步自 skill/prompts/00_shared_rules.md
 */

/** 全阶段统一注入：回复正文只能是 JSON */
export const JSON_ONLY_OUTPUT_RULE: string = `
【输出铁律 — 全阶段统一强制 — 违反即重试】:
1. 回复正文必须是且仅是一个 JSON 对象：trim 后第一字符 { ，最后字符 }
2. 禁止 JSON 外任何文字：中文/英文说明、推理、电路分析、引脚讨论、复述规则
3. 禁止 markdown、代码围栏（禁止 \`\`\`json 或 \`\`\`）
4. 可在模型内部思考（reasoning / thinking 通道）；思考内容不得出现在 content 正文
5. 若开启推理后 content 仍混入说明，系统会尝试隔离最后一个完整 JSON，但仍应尽量只出纯 JSON
6. 字段名可用 camelCase 或 snake_case；除上述 JSON 外不得有任何字符（含前后空行以外的说明）`;

/** 仪器拓扑铁律 — 与 device-catalog / lab_instruments / SIM_CONN 对齐 */
export const INSTRUMENT_TOPOLOGY_RULES: string = `
【仪器拓扑铁律 — 严禁违反】:
1. AMMETER_DC 串联: VCC→I+→I-→负载；I+/I- 绝不同网
2. VOLTMETER_DC: V+/COM 并联；多表须测不同节点对
3. POWER_METER: V+/V- 跨负载；I+/I- 串联；禁止 I 路与 V 路完全同节点对
4. VIRTUAL_METER 四端 V,A,OHM,COM — 档位 DCV/ACV/OHM/AMP/DIODE
   V∥测压；A–COM 串联测流；OHM–COM 测阻/二极管；COM→GND
5. OSCILLOSCOPE: CH1–CH4+GND；至少 CH1+GND；教学/全套仪器优先接满四通道；GND 用 stubLabel
6. LOGIC_ANALYZER: CH1–CH8+GND（禁止 CH0/D0）
7. UART_TERMINAL: TX/RX/GND；FREQ_COUNTER: IN/GND；SIGNAL_GEN: OUT/GND
8. 仪器探针一律 joinByLabel；禁止仪器脚跨板长导线
9. 【SIM_CONN】有信号脚入网则必须有 GND/COM（或 V-/I-）回线，否则仿真阻断`;

export const TOPOLOGY_ANTIPATTERN_GUARD: string = `
【拓扑反模式警示 — 生成结果中绝不应出现以下错误】:
1. 电流表 I+/I- 在同一网络 → 短路！应串联在 VCC 与负载之间
2. 功率表 I 路与 V 路完全同节点对 → 电流未串联切入
3. 万用表 A 脚当电压探针并联 / OHM 跨电源网
4. 所有电压表测同一节点 → 应分布在分压链不同节点上
5. VCC 直接连到地（无负载电阻） → 短路！应有分压/负载电阻
6. 器件完全浮空(无任何引脚连接) → 连接或删除
7. 信号网络命名为 VCC/GND → 使用描述性名称或加 _SIG 后缀
8. GPIO/IO引脚直连 VCC/GND → 通过限流电阻连接（例外：BOOT0/BOOT1 接地、8051 EA 接 VCC、专用 strap/复位网络）
9. 导线侵入器件选中命中区(HIT_PAD=22) 或贴近无关引脚(<20mil)
10. 编造仪器/器件脚名（假设为A、IN、SIG、CH0、D0）→ 必须用库内 pinId
11. 仪器有信号脚无 GND/COM 回线 → SIM_CONN 阻断「缺GND/COM」
12. 将关键脚「悬空」当作完成态 → 连接或明确 NC（未用 OSC/LA 通道可悬空；教学全套仪器应接满）
13. 禁止输出 lab_* 实验模板字段或预置拓扑冒充 AI 生图`;

/** 与 DeviceHitGeometry.SELECTION_HIT_PAD 保持一致 */
export const HIT_PAD_NOTE: string = 'HIT_PAD=22';
export const FOREIGN_PIN_NOTE: string = 'FOREIGN_PIN_CLEARANCE=20mil';
