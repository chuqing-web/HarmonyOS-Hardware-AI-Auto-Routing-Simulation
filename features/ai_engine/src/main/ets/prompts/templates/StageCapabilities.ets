/**
 * 各流水线阶段「能做什么」— 注入 Prompt，避免混用 fixAction / 建网词汇。
 * 注意：仅 self_review /（部分）确定性回退可执行 fixAction；其它阶段输出各自 JSON 契约。
 * ArkTS：禁止未标注类型的对象字面量作 Record，改用 switch。
 */

export function stageCapabilityBlurb(stage: string): string {
  const key = (stage ?? '').trim().toLowerCase();
  let body = '';
  if (key === 'device_select') {
    body = '【本阶段能力 — device_select】:\n' +
      '- 输出：选型 BOM JSON（libDevId/数量/意图约束）\n' +
      '- 不可用：fixAction 修复工具、建网 nets、布线 waypoints\n' +
      '- 工具边界：只能从库内选型；禁止输出整图拓扑或假模板';
  } else if (key === 'layout') {
    body = '【本阶段能力 — layout】:\n' +
      '- 输出：布局约束 JSON（分组/间距/禁区）\n' +
      '- 不可用：fixAction、nets 建网、forceWire/forceLabel\n' +
      '- 工具边界：只约束摆放；连线留给 net_plan/route';
  } else if (key === 'net_plan') {
    body = '【本阶段能力 — net_plan】:\n' +
      '- 输出：nets[] + connections.mode=joinWired|joinByLabel + wiringHints\n' +
      '- 可用连接原语：joinWired / joinByLabel（不是 fixAction）\n' +
      '- 不可用：self_review 的 fixAction（demote_*/wire_*/rebuild_*）\n' +
      '- 工具边界：一脚一网；禁止单脚 joinWired 网；仪器脚优先 joinByLabel';
  } else if (key === 'route') {
    body = '【本阶段能力 — route】:\n' +
      '- 输出：布线约束 JSON（forceLabelNets / forceWireNets / 禁穿区）\n' +
      '- 不可用：fixAction 拓扑修复；改拓扑请等 self_review\n' +
      '- 工具边界：纯仪器网 forceLabel；DUT≥2 探针并网可 forceWire（仪器脚 stub）';
  } else if (key === 'self_review') {
    body = '【本阶段能力 — self_review】:\n' +
      '- 输出：issues[].fixAction（必须来自「可用修复工具」目录）\n' +
      '- 可用：全部 llmVisible fixAction（见目录）；由服务端 applyOneAiFix 执行\n' +
      '- 不可用：编造目录外动作；不可改用 net_plan 的 joinWired 字段冒充修复\n' +
      '- 工具边界：纯几何→demote_*；仪器→rebuild_instrument；555→wire_555_monostable/reconnect；' +
      '运放自激→wire_opamp_self_osc；RC充放电→wire_series_rc（禁止自激场景用 RC）';
  } else if (key === 'diag') {
    body = '【本阶段能力 — diag】:\n' +
      '- 输出：诊断建议 JSON（含 fixPriority 文本建议）\n' +
      '- 不可用：直接执行 fixAction；建议名应尽量对齐 self_review 工具目录\n' +
      '- 工具边界：诊断只报告，修复走 self_review 或确定性 kit';
  } else if (key === 'modular_plan') {
    body = '【本阶段能力 — modular_plan】:\n' +
      '- 输出：模块划分 + boundaryPins + joints\n' +
      '- 不可用：fixAction；子模块建网在各自 net_plan\n' +
      '- 工具边界：joints 用位号；电源关节必有 POWER.VCC/GND';
  } else if (key === 'edit_plan') {
    body = '【本阶段能力 — edit_plan】:\n' +
      '- 输出：增量编辑 JSON（addRequireList/removeRefs/moves/nets）\n' +
      '- 不可用：self_review fixAction 枚举（用编辑字段表达变更）\n' +
      '- 工具边界：nets 走增量 merge；禁止整图模板替换';
  } else if (key === 'gen_sch') {
    body = '【本阶段能力 — gen_sch（遗留）】:\n' +
      '- 非生产整图路径；生产请走 full pipeline\n' +
      '- 不可用：当作模板回退入口';
  } else if (key === 'pcb_placement') {
    body = '【本阶段能力 — pcb_placement】:\n' +
      '- 输出：placements 位姿 + groups 分组 + lockedIds\n' +
      '- 安装孔写入 lockedIds；禁止原位复读（echo 门禁）\n' +
      '- groups 同组须空间聚集，否则失败\n' +
      '- 不可用：track/via 折点坐标；本地网格冒充布局\n' +
      '- 工具边界：只规划位姿；走线由 pcb_route + 几何引擎';
  } else if (key === 'pcb_net_plan') {
    body = '【本阶段能力 — pcb_net_plan】:\n' +
      '- 输出：nets[] kind/routeMode/priority/layerHint/busYOffset + priorityOrder\n' +
      '- Cu=2 有信号时电源/地优先 forceTrack（勿 forcePour）\n' +
      '- busYOffset：同层多电源 Y 错开；layerHint 供几何选层\n' +
      '- 不可用：发明新电气网；输出铜线坐标\n' +
      '- 工具边界：覆盖已有网络策略；层角色留给 pcb_route';
  } else if (key === 'pcb_route') {
    body = '【本阶段能力 — pcb_route】:\n' +
      '- 输出：layerRoles（覆盖每一铜层）+ viaPreference + netPriority\n' +
      '- netPriority 被几何引擎用于布线先后（越大越先）\n' +
      '- gnd/power 非 defer 时需 gnd_bus|vcc_bus|power_h|power_v（Cu=2 可 B.Cu=signal_h 兼用）\n' +
      '- Cu≥4/6/8：禁止空层；每层须有真实角色；保留至少一层 stub\n' +
      '- 不可用：跳过本阶段；用本地 Cu 默认表冒充；输出走线折点\n' +
      '- 工具边界：策略填写；几何由 PcbGeometryAgent 执行';
  } else if (key === 'pcb_qa_repair') {
    body = '【本阶段能力 — pcb_qa_repair】:\n' +
      '- 输出：ripNetIds / layerRolePatch / routeModePatch / busYOffsetPatch / raiseCopperTo / rePlaceFootprintIds\n' +
      '- layerRolePatch 的 key=铜层名(F.Cu/B.Cu)，value=合法角色；禁止网络名作 key\n' +
      '- power bus clearance：优先 routeModePatch forcePour→forceTrack，或 busYOffsetPatch 错开；勿反复翻层角色\n' +
      '- Cu=2 持续冲突可 raiseCopperTo=4/6/8 并补齐新层角色\n' +
      '- 禁止删唯一 stub；信号 clearance 优先 ripNetIds（可用网名）\n' +
      '- 不可用：忽略违规继续交付；无 LLM 的盲重试几何\n' +
      '- 工具边界：只决定修复方案；执行仍走几何/布局 Agent\n' +
      '- 批判耗尽由管线 KEEP_RETRY/ACCEPT residual（须有铜），禁止因本阶段主动 ABORT';
  }
  return body.length > 0 ? `\n${body}\n` : '';
}
