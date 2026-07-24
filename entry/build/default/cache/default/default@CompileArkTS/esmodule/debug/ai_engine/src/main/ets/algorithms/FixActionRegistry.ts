/**
 * fixAction 单源注册表 — self_review LLM 工具 + 确定性 kit 共用。
 * Prompt 枚举 / sanitize 纠偏 / priority / unknown 丢弃 均以此为准。
 * 新增工具：先登记此处，再实现 applyOneAiFix + AiTopologyFixKit，最后同步 skill/prompts/05_self_review.md。
 */
export interface FixActionDef {
    /** canonical 名（写入 JSON / prompt schema） */
    id: string;
    /** 小写别名，canonicalize 时映射到 id */
    aliases: string[];
    /** 执行优先级，越小越先 */
    priority: number;
    /** 是否允许 LLM 在 self_review 输出（false=仅确定性/auto） */
    llmVisible: boolean;
    /** 一行说明（注入 prompt） */
    summary: string;
    /** 必填 fixDetail 字段，逗号分隔；空=无 */
    requireFields: string;
}
/** 全量登记（含 LLM 可见 + 仅代码路径） */
export const FIX_ACTION_DEFS: FixActionDef[] = [
    {
        id: 'split_power_short',
        aliases: ['split_power'],
        priority: 0,
        llmVisible: true,
        summary: 'VCC↔GND/电源轨同网短路拆分',
        requireFields: ''
    },
    {
        id: 'heal_electrical',
        aliases: ['heal_electrical_short', 'heal_electrical_shorts'],
        priority: 0,
        llmVisible: true,
        summary: '关键电气短路确定性修复（I+/I- 同网等）',
        requireFields: ''
    },
    {
        id: 'strip_phantom_pins',
        aliases: ['sanitize_pins'],
        priority: 0,
        llmVisible: true,
        summary: '剥离库外假脚节点（如 UA741 的 V+/V-）',
        requireFields: ''
    },
    {
        id: 'prune_unused_osc_channels',
        aliases: ['break_nc_bridge'],
        priority: 0,
        llmVisible: true,
        summary: '拆除示波器未用通道互连/NC 网',
        requireFields: ''
    },
    {
        id: 'prune_singleton_nets',
        aliases: ['prune_singleton'],
        priority: 0,
        llmVisible: true,
        summary: '剪单脚孤儿信号网',
        requireFields: ''
    },
    {
        id: 'rebuild_instrument',
        aliases: ['rebuild_topo', 'rebuild_net', 'rebuild'],
        priority: 1,
        llmVisible: true,
        summary: '仅仪器/测量拓扑重建；禁止用于纯几何',
        requireFields: ''
    },
    {
        id: 'remove_component',
        aliases: [],
        priority: 2,
        llmVisible: true,
        summary: '删除器件（refName 或 targetDevice）',
        requireFields: 'refName'
    },
    {
        id: 'disconnect_pin',
        aliases: ['float_pin'],
        priority: 2,
        llmVisible: true,
        summary: '拆除指定脚全部网络连接',
        requireFields: 'refName,pinId'
    },
    {
        id: 'add_component',
        aliases: [],
        priority: 3,
        llmVisible: true,
        summary: '添加库内器件（libDevId 必填）',
        requireFields: 'libDevId'
    },
    {
        id: 'wire_555_monostable',
        aliases: ['wire_555_mono'],
        priority: 3,
        llmVisible: true,
        summary: 'LM555 单稳态确定性接线（板上有 555+按键）',
        requireFields: ''
    },
    {
        id: 'wire_opamp_self_osc',
        aliases: ['wire_opamp_oscillator', 'wire_hyst_integrator'],
        priority: 3,
        llmVisible: true,
        summary: '运放自激（滞回比较器+积分器闭环）确定性接线；禁止 wire_series_rc',
        requireFields: ''
    },
    {
        id: 'wire_series_rc',
        aliases: ['wire_rc'],
        priority: 3,
        llmVisible: true,
        summary: '串联 RC 充放电确定性接线（板上无 LM555 / 非运放自激）',
        requireFields: ''
    },
    {
        id: 'wire_potentiometer',
        aliases: ['wire_pot'],
        priority: 3,
        llmVisible: true,
        summary: '电位器三端确定性接线',
        requireFields: ''
    },
    {
        id: 'wire_relay',
        aliases: ['wire_relay_spdt'],
        priority: 3,
        llmVisible: true,
        summary: '互斥双色 RELAY_SPDT 触点确定性接线',
        requireFields: ''
    },
    {
        id: 'wire_dual_supply',
        aliases: ['wire_dual_rails'],
        priority: 3,
        llmVisible: true,
        summary: '运放双电源 VCC/VEE 确定性接线',
        requireFields: ''
    },
    {
        id: 'wire_opamp_feedback',
        aliases: ['opamp_feedback'],
        priority: 3,
        llmVisible: true,
        summary: '运放开环→跟随闭环（比较器双输入已接则跳过）',
        requireFields: ''
    },
    {
        id: 'ensure_signal_gen',
        aliases: [],
        priority: 3,
        llmVisible: true,
        summary: 'SIGNAL_GEN GND→GND，OUT 入网（外激励场景）',
        requireFields: ''
    },
    {
        id: 'move_device',
        aliases: [],
        priority: 4,
        llmVisible: true,
        summary: '移动器件到绝对坐标 x/y（20mil 栅格）',
        requireFields: 'refName'
    },
    {
        id: 'nudge_device',
        aliases: [],
        priority: 4,
        llmVisible: true,
        summary: '相对位移 dx/dy 拉开碰撞',
        requireFields: 'refName'
    },
    {
        id: 'rotate_device',
        aliases: [],
        priority: 4,
        llmVisible: true,
        summary: '旋转器件 rotate=0/90/180/270（省略=+90）',
        requireFields: 'refName'
    },
    {
        id: 'heal_floating',
        aliases: ['fix_floating'],
        priority: 4,
        llmVisible: true,
        summary: '浮空关键脚确定性补接（非纯几何）',
        requireFields: ''
    },
    {
        id: 'reconnect_pin',
        aliases: ['rewire_net', 'move_pin'],
        priority: 5,
        llmVisible: true,
        summary: '将脚并入目标网（refName+pinId+netName）',
        requireFields: 'refName,pinId,netName'
    },
    {
        id: 'change_param',
        aliases: [],
        priority: 5,
        llmVisible: true,
        summary: '改器件参数 paramKey/paramValue',
        requireFields: 'paramKey,paramValue'
    },
    {
        id: 'join_by_label',
        aliases: [],
        priority: 6,
        llmVisible: true,
        summary: '同名标号并网（netName/toNet，可选 fromNet）',
        requireFields: 'netName'
    },
    {
        id: 'demote_geo_nets',
        aliases: [],
        priority: 7,
        llmVisible: true,
        summary: '当前全部几何违规网一次标号化（多网首选）',
        requireFields: ''
    },
    {
        id: 'demote_power_rails',
        aliases: [],
        priority: 7,
        llmVisible: true,
        summary: '仅 VCC/VEE/GND/VDD/VSS 标号化',
        requireFields: ''
    },
    {
        id: 'reroute',
        aliases: [],
        priority: 7,
        llmVisible: true,
        summary: '拓扑已正确，仅触发重布线',
        requireFields: ''
    },
    {
        id: 'demote_to_label',
        aliases: ['force_label'],
        priority: 8,
        llmVisible: true,
        summary: '指定网标号 stub（netName 必填）',
        requireFields: 'netName'
    },
    {
        id: 'demote_all_labels',
        aliases: ['label_all'],
        priority: 9,
        llmVisible: true,
        summary: '全网标号（极端 wire_cross）',
        requireFields: ''
    },
    {
        id: 'none',
        aliases: ['noop'],
        priority: 99,
        llmVisible: false,
        summary: '空操作',
        requireFields: ''
    }
];
let aliasMapCache: Map<string, string> | null = null;
function buildAliasMap(): Map<string, string> {
    if (aliasMapCache !== null) {
        return aliasMapCache;
    }
    const m = new Map<string, string>();
    for (let i = 0; i < FIX_ACTION_DEFS.length; i++) {
        const d = FIX_ACTION_DEFS[i];
        m.set(d.id, d.id);
        for (let ai = 0; ai < d.aliases.length; ai++) {
            m.set(d.aliases[ai].toLowerCase(), d.id);
        }
    }
    aliasMapCache = m;
    return m;
}
/** 别名 → canonical；未知返回空串 */
export function canonicalizeFixAction(raw: string): string {
    const key = (raw ?? '').trim().toLowerCase();
    if (key.length === 0) {
        return '';
    }
    return buildAliasMap().get(key) ?? '';
}
export function isKnownFixAction(raw: string): boolean {
    return canonicalizeFixAction(raw).length > 0;
}
export function fixActionPriorityOf(raw: string): number {
    const id = canonicalizeFixAction(raw);
    if (id.length === 0) {
        return 5;
    }
    for (let i = 0; i < FIX_ACTION_DEFS.length; i++) {
        if (FIX_ACTION_DEFS[i].id === id) {
            return FIX_ACTION_DEFS[i].priority;
        }
    }
    return 5;
}
export function findFixActionDef(raw: string): FixActionDef | null {
    const id = canonicalizeFixAction(raw);
    if (id.length === 0) {
        return null;
    }
    for (let i = 0; i < FIX_ACTION_DEFS.length; i++) {
        if (FIX_ACTION_DEFS[i].id === id) {
            return FIX_ACTION_DEFS[i];
        }
    }
    return null;
}
/** Schema 枚举串（仅 llmVisible） */
export function buildFixActionSchemaEnum(): string {
    const ids: string[] = [];
    for (let i = 0; i < FIX_ACTION_DEFS.length; i++) {
        const d = FIX_ACTION_DEFS[i];
        if (d.llmVisible && d.id !== 'none') {
            ids.push(d.id);
        }
    }
    return ids.join('|');
}
/** 注入 self_review system 的工具目录 */
export function buildFixActionPromptCatalog(): string {
    const lines: string[] = [
        '【可用修复工具 fixAction — 完整目录（仅允许下列名称）】:'
    ];
    for (let i = 0; i < FIX_ACTION_DEFS.length; i++) {
        const d = FIX_ACTION_DEFS[i];
        if (!d.llmVisible || d.id === 'none') {
            continue;
        }
        const req = d.requireFields.length > 0
            ? `；必填 fixDetail: ${d.requireFields}`
            : '';
        lines.push(`- ${d.id}: ${d.summary}${req}`);
    }
    lines.push('禁止输出目录外 fixAction；未知名会被丢弃。');
    return lines.join('\n');
}
/** applyOneAiFix 已实现的 canonical 集合（与 registry 对齐自检） */
export const IMPLEMENTED_FIX_ACTIONS: string[] = [
    'rebuild_instrument', 'demote_all_labels', 'heal_floating',
    'wire_555_monostable', 'wire_opamp_self_osc', 'wire_series_rc', 'wire_potentiometer', 'wire_relay',
    'heal_electrical', 'wire_dual_supply', 'wire_opamp_feedback', 'ensure_signal_gen',
    'strip_phantom_pins', 'prune_unused_osc_channels', 'prune_singleton_nets',
    'demote_power_rails', 'demote_geo_nets', 'split_power_short', 'reroute',
    'demote_to_label', 'join_by_label', 'reconnect_pin', 'disconnect_pin',
    'move_device', 'nudge_device', 'rotate_device',
    'add_component', 'remove_component', 'change_param', 'none'
];
/** 启动/首轮修复时打一次对齐日志；返回缺失数 */
export function auditFixActionRegistryCoverage(): number {
    const impl = new Set<string>();
    for (let i = 0; i < IMPLEMENTED_FIX_ACTIONS.length; i++) {
        impl.add(IMPLEMENTED_FIX_ACTIONS[i]);
    }
    let missing = 0;
    for (let i = 0; i < FIX_ACTION_DEFS.length; i++) {
        const id = FIX_ACTION_DEFS[i].id;
        if (id === 'none') {
            continue;
        }
        if (!impl.has(id)) {
            missing++;
        }
    }
    return missing;
}
