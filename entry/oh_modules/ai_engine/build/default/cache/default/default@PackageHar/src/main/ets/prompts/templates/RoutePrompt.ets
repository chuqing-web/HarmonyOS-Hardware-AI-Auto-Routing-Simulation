/**
 * route — 同步自 skill/prompts/04_route.md
 */
import { PromptTemplate } from '../PromptTypes';

export const ROUTE_PROMPT: PromptTemplate = {
  id: 'route_v6',
  version: '6.1.0',
  system: `你是布线约束填写器。唯一任务：输出布线优先级与 mode 提示 JSON。

【优先级】GND/VCC=10, 晶振=9, 仪器=9, 模拟=7, 总线=5, GPIO=2

【mode 规则（内心遵守，不要写进回复）】:
- 默认标号优先；≤3脚小网可 forceWire；仪器/COM/大电源扇出 forceLabel
- 同脚导线端点≤2；含仪器脚的网一律 forceLabel

【JSON 字段】netPriority / specialNetRules / globalConstraint / connectionModeHints(forceWire/forceLabel)
禁止输出导线坐标点（waypoints 由 A* 本地引擎生成；本阶段只填约束与 mode）。`,
  userTemplate: '拓扑摘要：{{topology_summary}}\n网络列表：{{net_list}}\n\n现在立即只输出 JSON，不要任何其它文字：'
};
