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
        return `${value}`;
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
            out.push(`${arr[i]}`);
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
                if (cell !== undefined && cell !== null) {
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
        if (deviceRequireList.length === 0 && functionModule.length === 0 && circuitConstraint.length === 0) {
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
        // AI 驱动布局: 解析 LLM 直接输出的器件坐标
        const positionsRaw = (raw as Record<string, Object>)['positions'];
        const positions: LayoutPositionItem[] = [];
        if (Array.isArray(positionsRaw)) {
            for (const posObj of positionsRaw as Object[]) {
                const p = posObj as Record<string, Object>;
                const deviceId = LlmJsonNormalizer.asText(p['deviceId'] ?? p['device_id'] ?? p['refName'] ?? p['ref_name'], '');
                const x = LlmJsonNormalizer.asNumber(p['x'], 0);
                const y = LlmJsonNormalizer.asNumber(p['y'], 0);
                const rotate = LlmJsonNormalizer.asNumber(p['rotate'] ?? p['rotation'], 0);
                if (deviceId.length > 0 && x > 0 && y > 0) {
                    const item: LayoutPositionItem = { deviceId: deviceId, x: x, y: y, rotate: rotate };
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
    static normalizeRouting(raw: Object | null): RoutingLlmOutput | null {
        if (!raw) {
            return null;
        }
        const src = raw as RawRoutingOut;
        const netPriority = LlmJsonNormalizer.toNumberRecord(LlmJsonNormalizer.firstDefined(src.netPriority, src.net_priority));
        const rulesArr = LlmJsonNormalizer.asObjectArray(LlmJsonNormalizer.firstDefined(src.specialNetRules, src.special_net_rules));
        const specialNetRules: SpecialNetRule[] = [];
        for (let i = 0; i < rulesArr.length; i++) {
            const r = rulesArr[i] as RawSpecialNetRule;
            const rule: SpecialNetRule = {
                netGroup: LlmJsonNormalizer.asText(LlmJsonNormalizer.firstDefined(r.netGroup, r.net_group), ''),
                rule: LlmJsonNormalizer.asText(r.rule, '')
            };
            specialNetRules.push(rule);
        }
        const globalConstraint = LlmJsonNormalizer.asText(LlmJsonNormalizer.firstDefined(src.globalConstraint, src.global_constraint), '');
        if (Object.keys(netPriority).length === 0 && specialNetRules.length === 0 && globalConstraint.length === 0) {
            return null;
        }
        const routeOut: RoutingLlmOutput = {
            netPriority: netPriority,
            specialNetRules: specialNetRules,
            globalConstraint: globalConstraint.length > 0 ? globalConstraint : 'analog_net_area separate from digital'
        };
        return routeOut;
    }
    static deviceSelectScoreFields(): string[] {
        return ['deviceRequireList', 'circuitConstraint', 'functionModule'];
    }
    static layoutScoreFields(): string[] {
        return ['positions', 'constraintRules', 'moduleGroup', 'signalWeight'];
    }
    static routingScoreFields(): string[] {
        return ['netPriority', 'specialNetRules', 'globalConstraint'];
    }
}
