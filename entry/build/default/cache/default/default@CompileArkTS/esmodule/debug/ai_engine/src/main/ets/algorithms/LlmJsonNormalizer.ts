import { emptyStringMap, makeDeviceRequirement } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { DeviceSelectLlmOutput, LayoutLlmOutput, RoutingLlmOutput, DeviceRequirement, LayoutConstraintRule, SpecialNetRule, LayoutPositionItem } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
/** 选型 LLM 原始字段（camel + snake 双写） */
interface RawDeviceSelect {
    functionModule?: Object;
    function_module?: Object;
    functionModules?: Object;
    function_modules?: Object;
    deviceRequireList?: Object;
    device_require_list?: Object;
    deviceRequirements?: Object;
    device_requirements?: Object;
    circuitConstraint?: Object;
    circuit_constraint?: Object;
    constraint?: Object;
    oodFlags?: Object;
    ood_flags?: Object;
}
interface RawDeviceReq {
    func?: Object;
    function?: Object;
    devType?: Object;
    dev_type?: Object;
    type?: Object;
    priority?: Object;
    paramConstraint?: Object;
    param_constraint?: Object;
    explicitModel?: Object;
    explicit_model?: Object;
}
interface RawLayoutOut {
    constraintRules?: Object;
    constraint_rules?: Object;
    constraints?: Object;
    moduleGroup?: Object;
    module_group?: Object;
    moduleGroups?: Object;
    module_groups?: Object;
    signalWeight?: Object;
    signal_weight?: Object;
}
interface RawLayoutRule {
    type?: Object;
    weight?: Object;
    target?: Object;
    a?: Object;
    b?: Object;
}
interface RawRoutingOut {
    netPriority?: Object;
    net_priority?: Object;
    specialNetRules?: Object;
    special_net_rules?: Object;
    globalConstraint?: Object;
    global_constraint?: Object;
    connectionModeHints?: Object;
    connection_mode_hints?: Object;
}
interface RawSpecialNetRule {
    netGroup?: Object;
    net_group?: Object;
    rule?: Object;
}
export class LlmJsonNormalizer {
    static toCamelKey(key: string): string {
        if (key.indexOf('_') < 0) {
            return key;
        }
        const parts = key.split('_');
        let result = parts[0];
        for (let i = 1; i < parts.length; i++) {
            const p = parts[i];
            if (p.length === 0) {
                continue;
            }
            result += p.charAt(0).toUpperCase() + p.substring(1);
        }
        return result;
    }
    private static firstDefined(a?: Object, b?: Object, c?: Object, d?: Object): Object | null {
        if (a !== undefined && a !== null) {
            return a;
        }
        if (b !== undefined && b !== null) {
            return b;
        }
        if (c !== undefined && c !== null) {
            return c;
        }
        if (d !== undefined && d !== null) {
            return d;
        }
        return null;
    }
    private static asText(value: Object | null | undefined, fallback: string): string {
        if (value === null || value === undefined) {
            return fallback;
        }
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            return `${value}`;
        }
        // 对象/数组禁止 `${obj}` → "[object Object]"
        if (Array.isArray(value)) {
            return (value as Object[]).map(v => LlmJsonNormalizer.asText(v, '')).filter(s => s.length > 0).join(',');
        }
        if (typeof value === 'object') {
            return LlmJsonNormalizer.objectToConstraintText(value as Record<string, Object>);
        }
        return fallback;
    }
    /** 将 LLM 嵌套对象压成可读约束串（避免 [object Object]） */
    private static objectToConstraintText(rec: Record<string, Object>): string {
        const parts: string[] = [];
        const ks = Object.keys(rec);
        for (let i = 0; i < ks.length; i++) {
            const k = ks[i];
            const cell = rec[k];
            if (cell === null || cell === undefined) {
                continue;
            }
            if (typeof cell === 'boolean' || typeof cell === 'number') {
                if (cell === true || (typeof cell === 'number' && cell !== 0)) {
                    parts.push(`${k}`);
                }
                continue;
            }
            if (typeof cell === 'string') {
                if ((cell as string).length > 0) {
                    parts.push(`${k}=${cell}`);
                }
                continue;
            }
            parts.push(`${k}=${LlmJsonNormalizer.asText(cell, '')}`);
        }
        return parts.join(',');
    }
    private static asNumber(value: Object | null | undefined, fallback: number): number {
        if (value === null || value === undefined) {
            return fallback;
        }
        const n = Number(`${value}`);
        return isNaN(n) ? fallback : n;
    }
    private static asStringArray(value: Object | null): string[] {
        const out: string[] = [];
        if (value === null || !Array.isArray(value)) {
            return out;
        }
        const arr: Object[] = value as Object[];
        for (let i = 0; i < arr.length; i++) {
            if (arr[i] === null || arr[i] === undefined) {
                continue;
            }
            const cell = arr[i];
            let s = '';
            if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') {
                s = `${cell}`.trim();
            }
            else if (typeof cell === 'object') {
                s = LlmJsonNormalizer.objectToConstraintText(cell as Record<string, Object>).trim();
            }
            else {
                s = `${cell}`.trim();
            }
            if (s.length > 0 && s !== 'undefined' && s !== 'null' && s.indexOf('[object Object]') < 0) {
                out.push(s);
            }
        }
        return out;
    }
    private static asObjectArray(value: Object | null): Object[] {
        if (value === null || !Array.isArray(value)) {
            return [];
        }
        return value as Object[];
    }
    static asStringMap(value: Object | undefined | null): Map<string, string> {
        const map = emptyStringMap();
        if (value === undefined || value === null) {
            return map;
        }
        if (value instanceof Map) {
            (value as Map<string, string>).forEach((v: string, k: string) => {
                map.set(k, `${v}`);
            });
            return map;
        }
        if (typeof value === 'object') {
            const rec = value as Record<string, Object>;
            const ks: string[] = Object.keys(rec);
            for (let i = 0; i < ks.length; i++) {
                const cell: Object = rec[ks[i]] as Object;
                if (cell === undefined || cell === null) {
                    continue;
                }
                if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') {
                    map.set(ks[i], `${cell}`);
                }
                else if (typeof cell === 'object') {
                    const flat = LlmJsonNormalizer.objectToConstraintText(cell as Record<string, Object>);
                    if (flat.length > 0 && flat.indexOf('[object Object]') < 0) {
                        map.set(ks[i], flat);
                    }
                }
                else {
                    map.set(ks[i], `${cell}`);
                }
            }
        }
        return map;
    }
    private static toStringArrayRecord(value: Object | null): Record<string, string[]> {
        const result: Record<string, string[]> = {};
        if (value === null) {
            return result;
        }
        if (Array.isArray(value)) {
            result['default'] = LlmJsonNormalizer.asStringArray(value);
            return result;
        }
        if (typeof value === 'object') {
            const rec = value as Record<string, Object>;
            const ks: string[] = Object.keys(rec);
            for (let i = 0; i < ks.length; i++) {
                const cell: Object = rec[ks[i]] as Object;
                result[ks[i]] = LlmJsonNormalizer.asStringArray(cell);
            }
        }
        return result;
    }
    private static toNumberRecord(value: Object | null): Record<string, number> {
        const result: Record<string, number> = {};
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
            return result;
        }
        const rec = value as Record<string, Object>;
        const ks: string[] = Object.keys(rec);
        for (let i = 0; i < ks.length; i++) {
            const cell: Object = rec[ks[i]] as Object;
            result[ks[i]] = LlmJsonNormalizer.asNumber(cell, 0);
        }
        return result;
    }
    static normalizeDeviceSelect(raw: Object | null): DeviceSelectLlmOutput | null {
        if (!raw) {
            return null;
        }
        const src = raw as RawDeviceSelect;
        const functionModule = LlmJsonNormalizer.asStringArray(LlmJsonNormalizer.firstDefined(src.functionModule, src.function_module, src.functionModules, src.function_modules));
        const reqArr = LlmJsonNormalizer.asObjectArray(LlmJsonNormalizer.firstDefined(src.deviceRequireList, src.device_require_list, src.deviceRequirements, src.device_requirements));
        const deviceRequireList: DeviceRequirement[] = [];
        for (let i = 0; i < reqArr.length; i++) {
            const item = reqArr[i] as RawDeviceReq;
            const func = LlmJsonNormalizer.asText(LlmJsonNormalizer.firstDefined(item.func, item.function), 'device');
            const devType = LlmJsonNormalizer.asText(LlmJsonNormalizer.firstDefined(item.devType, item.dev_type, item.type), 'passive');
            const priority = LlmJsonNormalizer.asNumber(item.priority, 5);
            const params = LlmJsonNormalizer.asStringMap(LlmJsonNormalizer.firstDefined(item.paramConstraint, item.param_constraint));
            const explicitObj = LlmJsonNormalizer.firstDefined(item.explicitModel, item.explicit_model);
            let explicit: string | undefined = undefined;
            if (explicitObj !== null) {
                explicit = LlmJsonNormalizer.asText(explicitObj, '');
                if (explicit.length === 0) {
                    explicit = undefined;
                }
            }
            deviceRequireList.push(makeDeviceRequirement(func, devType, priority, params, explicit));
        }
        const circuitConstraint = LlmJsonNormalizer.asText(LlmJsonNormalizer.firstDefined(src.circuitConstraint, src.circuit_constraint, src.constraint), '');
        const oodFlags = LlmJsonNormalizer.asStringArray(LlmJsonNormalizer.firstDefined(src.oodFlags, src.ood_flags));
        if (deviceRequireList.length === 0) {
            // 生产选型必须有 BOM；仅有模块名/约束不算有效 device_select
            return null;
        }
        const out: DeviceSelectLlmOutput = {
            functionModule: functionModule.length > 0 ? functionModule : ['auto'],
            deviceRequireList: deviceRequireList,
            circuitConstraint: circuitConstraint.length > 0 ? circuitConstraint : '标准分区布局'
        };
        if (oodFlags.length > 0) {
            out.oodFlags = oodFlags;
        }
        return out;
    }
    static normalizeLayout(raw: Object | null): LayoutLlmOutput | null {
        if (!raw) {
            return null;
        }
        const src = raw as RawLayoutOut;
        const rulesArr = LlmJsonNormalizer.asObjectArray(LlmJsonNormalizer.firstDefined(src.constraintRules, src.constraint_rules, src.constraints));
        const constraintRules: LayoutConstraintRule[] = [];
        for (let i = 0; i < rulesArr.length; i++) {
            const r = rulesArr[i] as RawLayoutRule;
            const rule: LayoutConstraintRule = {
                type: 'adjacent',
                weight: LlmJsonNormalizer.asNumber(r.weight, 50)
            };
            const rt = LlmJsonNormalizer.asText(r.type, 'adjacent');
            if (rt === 'separate' || rt === 'central' || rt === 'edge' || rt === 'adjacent') {
                rule.type = rt;
            }
            if (r.target !== undefined && r.target !== null) {
                rule.target = LlmJsonNormalizer.asText(r.target, '');
            }
            if (r.a !== undefined && r.a !== null) {
                rule.a = LlmJsonNormalizer.asText(r.a, '');
            }
            if (r.b !== undefined && r.b !== null) {
                rule.b = LlmJsonNormalizer.asText(r.b, '');
            }
            constraintRules.push(rule);
        }
        const moduleGroupRec = LlmJsonNormalizer.toStringArrayRecord(LlmJsonNormalizer.firstDefined(src.moduleGroup, src.module_group, src.moduleGroups, src.module_groups));
        const signalWeight = LlmJsonNormalizer.toNumberRecord(LlmJsonNormalizer.firstDefined(src.signalWeight, src.signal_weight));
        // AI 驱动布局: 解析 LLM 直接输出的器件坐标（兼容多别名）
        const rawRec = raw as Record<string, Object>;
        const altPos = LlmJsonNormalizer.firstDefined(rawRec['placement'], rawRec['devices']);
        const positionsRaw = LlmJsonNormalizer.firstDefined(rawRec['positions'], rawRec['devicePositions'], rawRec['device_positions'], altPos !== null ? altPos : undefined);
        const positions: LayoutPositionItem[] = [];
        if (Array.isArray(positionsRaw)) {
            for (const posObj of positionsRaw as Object[]) {
                const p = posObj as Record<string, Object>;
                const deviceId = LlmJsonNormalizer.asText(p['deviceId'] ?? p['device_id'] ?? p['refName'] ?? p['ref_name'] ??
                    p['id'] ?? p['name'] ?? p['libDevId'] ?? p['lib_dev_id'], '');
                let x = LlmJsonNormalizer.asNumber(p['x'], NaN);
                let y = LlmJsonNormalizer.asNumber(p['y'], NaN);
                // 部分模型把坐标写成字符串 "540"
                if (isNaN(x) && p['x'] !== undefined && p['x'] !== null) {
                    x = Number(`${p['x']}`);
                }
                if (isNaN(y) && p['y'] !== undefined && p['y'] !== null) {
                    y = Number(`${p['y']}`);
                }
                const rotate = LlmJsonNormalizer.asNumber(p['rotate'] ?? p['rotation'], 0);
                if (deviceId.length > 0 && !isNaN(x) && !isNaN(y) && x >= 0 && y >= 0) {
                    // 入库即 snap 到 20mil，避免 critique 因栅格反复 reject
                    const sx = Math.round(x / 20) * 20;
                    const sy = Math.round(y / 20) * 20;
                    const item: LayoutPositionItem = {
                        deviceId: deviceId,
                        x: Math.max(40, Math.min(1200, sx)),
                        y: Math.max(40, Math.min(800, sy)),
                        rotate: rotate
                    };
                    positions.push(item);
                }
            }
        }
        // 允许仅输出 positions (AI 驱动布局), 不强制要求 constraint_rules
        if (constraintRules.length === 0 && Object.keys(moduleGroupRec).length === 0 && positions.length === 0) {
            return null;
        }
        const layoutOut: LayoutLlmOutput = {
            moduleGroup: moduleGroupRec,
            constraintRules: constraintRules,
            signalWeight: signalWeight
        };
        if (positions.length > 0) {
            layoutOut.positions = positions;
        }
        return layoutOut;
    }
    /**
     * special_net_rules 支持:
     * - 数组 [{netGroup, rule}]
     * - 对象映射 { "VCC": "direct_route,...", "COIL_CTRL": "avoid_cross" }
     */
    private static parseSpecialNetRules(value: Object | null): SpecialNetRule[] {
        const specialNetRules: SpecialNetRule[] = [];
        if (value === null) {
            return specialNetRules;
        }
        if (Array.isArray(value)) {
            const rulesArr = value as Object[];
            for (let i = 0; i < rulesArr.length; i++) {
                const r = rulesArr[i] as RawSpecialNetRule;
                const rule: SpecialNetRule = {
                    netGroup: LlmJsonNormalizer.asText(LlmJsonNormalizer.firstDefined(r.netGroup, r.net_group), ''),
                    rule: LlmJsonNormalizer.asText(r.rule, '')
                };
                if (rule.netGroup.length > 0 || rule.rule.length > 0) {
                    specialNetRules.push(rule);
                }
            }
            return specialNetRules;
        }
        if (typeof value === 'object') {
            const rec = value as Record<string, Object>;
            const ks = Object.keys(rec);
            for (let i = 0; i < ks.length; i++) {
                const netGroup = ks[i];
                const ruleText = LlmJsonNormalizer.asText(rec[netGroup], '');
                if (netGroup.length > 0 && ruleText.length > 0) {
                    const rule: SpecialNetRule = { netGroup: netGroup, rule: ruleText };
                    specialNetRules.push(rule);
                }
            }
        }
        return specialNetRules;
    }
    private static parseModeHintNets(hints: Object | null): string[][] {
        const forceWire: string[] = [];
        const forceLabel: string[] = [];
        if (hints === null || typeof hints !== 'object') {
            return [forceWire, forceLabel];
        }
        const rec = hints as Record<string, Object>;
        const wireRaw = LlmJsonNormalizer.firstDefined(rec['forceWire'], rec['force_wire']);
        const labelRaw = LlmJsonNormalizer.firstDefined(rec['forceLabel'], rec['force_label']);
        const w = LlmJsonNormalizer.asStringArray(wireRaw);
        const l = LlmJsonNormalizer.asStringArray(labelRaw);
        for (let i = 0; i < w.length; i++) {
            forceWire.push(w[i]);
        }
        for (let i = 0; i < l.length; i++) {
            forceLabel.push(l[i]);
        }
        return [forceWire, forceLabel];
    }
    static normalizeRouting(raw: Object | null): RoutingLlmOutput | null {
        if (!raw) {
            return null;
        }
        const src = raw as RawRoutingOut;
        const netPriority = LlmJsonNormalizer.toNumberRecord(LlmJsonNormalizer.firstDefined(src.netPriority, src.net_priority));
        const specialNetRules = LlmJsonNormalizer.parseSpecialNetRules(LlmJsonNormalizer.firstDefined(src.specialNetRules, src.special_net_rules));
        const globalConstraint = LlmJsonNormalizer.asText(LlmJsonNormalizer.firstDefined(src.globalConstraint, src.global_constraint), '');
        const modeHints = LlmJsonNormalizer.parseModeHintNets(LlmJsonNormalizer.firstDefined(src.connectionModeHints, src.connection_mode_hints));
        const forceWireNets = modeHints[0];
        const forceLabelNets = modeHints[1];
        if (Object.keys(netPriority).length === 0 && specialNetRules.length === 0 &&
            globalConstraint.length === 0 && forceWireNets.length === 0 && forceLabelNets.length === 0) {
            return null;
        }
        const routeOut: RoutingLlmOutput = {
            netPriority: netPriority,
            specialNetRules: specialNetRules,
            globalConstraint: globalConstraint.length > 0 ? globalConstraint : 'analog_net_area separate from digital',
            forceWireNets: forceWireNets,
            forceLabelNets: forceLabelNets
        };
        return routeOut;
    }
    static deviceSelectScoreFields(): string[] {
        // 仅 BOM 非空才算有效；勿用默认 functionModule/circuitConstraint 虚高 fill-rate
        return ['deviceRequireList'];
    }
    static layoutScoreFields(): string[] {
        return ['positions', 'constraintRules', 'moduleGroup'];
    }
    static routingScoreFields(): string[] {
        return ['netPriority', 'specialNetRules', 'globalConstraint'];
    }
}
