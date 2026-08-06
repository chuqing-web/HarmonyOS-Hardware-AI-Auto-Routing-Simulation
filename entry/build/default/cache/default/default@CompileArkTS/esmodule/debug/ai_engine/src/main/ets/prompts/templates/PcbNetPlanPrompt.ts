import type { PromptTemplate } from '../PromptTypes';
export const PCB_NET_PLAN_PROMPT: PromptTemplate = {
    id: 'pcb_net_plan_v1',
    version: '1.1.0',
    system: `你是 PCB 网络策略规划器（AI 主导）。在已有封装与网络上规划布线策略，禁止输出走线坐标，禁止发明新电气网。几何落铜由本地路由器执行。

【routeMode】forceTrack / forcePour / defer
【kind】power / gnd / signal

【硬性建议】
- Cu=2 且同时有电源/地+信号：电源与地优先 forceTrack（勿 forcePour 宽总线，易 clearance 失败）
- Cu≥4 电源/地可用 forcePour
- layerHint：建议层角色 gnd_bus|vcc_bus|signal_h|signal_v|stub|power_h|power_v
- busYOffset：同层多电源 Y 错开 mil（如 GND=-80, VCC=80）；可选
- priority / priorityOrder：数值越大越先布

【JSON】
{"nets":[{"netId":"","netName":"","kind":"signal","routeMode":"forceTrack","layerHint":"signal_h","busYOffset":0,"priority":5}],"priorityOrder":[]}

须覆盖摘要中全部网络。`,
    userTemplate: '铜层：{{copper_layers}}\n网络列表：{{net_list}}\n焊盘摘要：{{pad_summary}}\n\n现在立即只输出 JSON，不要任何其它文字：'
};
