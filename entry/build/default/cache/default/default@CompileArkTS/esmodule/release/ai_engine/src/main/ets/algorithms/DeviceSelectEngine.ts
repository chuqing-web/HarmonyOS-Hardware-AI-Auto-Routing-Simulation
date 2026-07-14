import type { IComponentLibrary } from 'component_library';
import { Logger, emptyStringMap, makeDeviceRequirement, stringMap1, copyStringMap } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { DeviceRequirement, DeviceSelectLlmOutput, MatchedDevice, DeviceSelectResult, DeviceMeta, LibDevice, LibDevicePin, SimModelInfo } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { RagKnowledgeBase } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/RagKnowledgeBase";
import type { AlternativeEntry, MatchLevel, ModuleZoneType, ParamValidationResult } from '../internal/AiEngineTypes';
import { alternativesToMap, copyParamsFromRecord, getCategoriesForDevType, getDomesticAlt, getPlacementPriority, joinParamConstraintValues } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/internal/AiEngineHelpers";
export class DeviceSelectEngine {
    private library: IComponentLibrary;
    constructor(g282: IComponentLibrary) {
        this.library = g282;
    }
    matchFromLlmOutput(r281: DeviceSelectLlmOutput, s281: string): DeviceSelectResult {
        let t281 = (r281.oodFlags?.length ?? 0) > 0;
        const u281: MatchedDevice[] = [];
        const v281: AlternativeEntry[] = [];
        let w281: string | undefined;
        let x281 = r281.deviceRequireList ?? [];
        if (x281.length === 0) {
            const f282 = RagKnowledgeBase.search(s281);
            if (f282) {
                w281 = f282.id;
                x281 = f282.deviceHints;
            }
        }
        for (let z281 = 0; z281 < x281.length; z281++) {
            const a282 = x281[z281];
            const b282 = this.matchOne(a282);
            if (!b282 && a282.explicitModel) {
                const d282 = this.library.getComponent(a282.explicitModel);
                const e282 = this.library.search(a282.explicitModel, 1, 1);
                if (!d282.success && e282.items.length === 0) {
                    t281 = true;
                    if (!r281.oodFlags)
                        r281.oodFlags = [];
                    if (!r281.oodFlags.includes(a282.explicitModel)) {
                        r281.oodFlags.push(a282.explicitModel);
                    }
                }
            }
            if (b282) {
                u281.push(b282);
                v281.push({
                    libDevId: b282.libDevId,
                    alternatives: this.findAlternatives(b282.libDevId, a282)
                });
            }
            else {
                Logger.warn('DeviceSelect', `No match for ${a282.func}/${a282.devType}`);
                const c282 = this.fuzzyFallback(a282);
                if (c282) {
                    u281.push(c282);
                    v281.push({ libDevId: c282.libDevId, alternatives: [] });
                }
            }
        }
        const y281: DeviceSelectResult = {
            devices: u281,
            alternatives: alternativesToMap(v281),
            oodDetected: t281,
            ragTemplateId: w281
        };
        return y281;
    }
    toLibDevices(a281: MatchedDevice[]): LibDevice[] {
        const b281: LibDevice[] = [];
        for (let c281 = 0; c281 < a281.length; c281++) {
            const d281 = a281[c281];
            const e281 = this.library.getComponent(d281.libDevId);
            const f281 = this.library.getDeviceMeta(d281.libDevId);
            const g281 = e281.data;
            const h281 = f281.data;
            const i281 = this.toModuleZone(d281.moduleZone);
            const j281: LibDevicePin[] = [];
            const k281 = h281?.pin_list ?? [];
            for (let o281 = 0; o281 < k281.length; o281++) {
                const p281 = k281[o281];
                const q281: LibDevicePin = {
                    pinId: p281.pin_id,
                    pinLabel: p281.pin_label,
                    pinType: p281.pin_type,
                    x: p281.x,
                    y: p281.y,
                    pullUp: p281.pull_up ?? false,
                    pullDown: p281.pull_down ?? false,
                    maxVoltage: p281.max_voltage ?? 5
                };
                j281.push(q281);
            }
            let l281: 'spice' | 'mcu_51' | 'mcu_stm32' | 'digital_event' = 'spice';
            if (h281?.model_type === 'mcu_stm32') {
                l281 = 'mcu_stm32';
            }
            else if (h281?.model_type === 'mcu_51') {
                l281 = 'mcu_51';
            }
            else if (h281?.model_type === 'digital') {
                l281 = 'digital_event';
            }
            const m281: SimModelInfo = {
                modelType: l281,
                modelText: g281?.spiceModel ?? '',
                modelVersion: '1.0'
            };
            const n281: LibDevice = {
                libDevId: d281.libDevId,
                name: g281?.name ?? d281.name,
                vendor: h281?.vendor ?? 'Generic',
                category: h281?.category ?? g281?.category ?? '',
                subCategory: h281?.sub_category ?? '',
                svgSymbol: g281?.svgSymbol ?? '',
                thumbnailBase64: '',
                pinList: j281,
                simModel: m281,
                defaultParams: copyStringMap(d281.params),
                paramLimit: {},
                isCustom: h281?.is_custom ?? false,
                supportMcuFirmware: h281?.is_mcu ?? false,
                aiWiringRules: g281?.aiWiringRules ?? [],
                placementPriority: d281.placementPriority,
                moduleZone: i281
            };
            b281.push(n281);
        }
        return b281;
    }
    private toModuleZone(z280: string): ModuleZoneType | undefined {
        switch (z280) {
            case 'power':
                return 'power';
            case 'mcu_core':
                return 'mcu_core';
            case 'analog':
                return 'analog';
            case 'digital_periph':
                return 'digital_periph';
            case 'interface':
                return 'interface';
            default:
                return undefined;
        }
    }
    private matchOne(q280: DeviceRequirement): MatchedDevice | null {
        if (q280.explicitModel) {
            const w280 = this.library.getComponent(q280.explicitModel);
            if (w280.success && w280.data) {
                return this.buildMatched(q280, w280.data.id, w280.data.name, 'exact');
            }
            const x280 = this.library.search(q280.explicitModel, 1, 5);
            if (x280.items.length > 0) {
                const y280 = x280.items[0];
                return this.buildMatched(q280, y280.id, y280.name, 'exact');
            }
            return null;
        }
        const r280 = `${q280.func} ${q280.devType} ${joinParamConstraintValues(q280.paramConstraint)}`;
        const s280 = this.library.semanticSearch(r280, 5);
        for (let u280 = 0; u280 < s280.length; u280++) {
            const v280 = s280[u280];
            if (this.passesParamLimit(v280.id, q280)) {
                return this.buildMatched(q280, v280.id, v280.name, 'fuzzy');
            }
        }
        const t280 = this.tryDomesticAlt(q280);
        if (t280) {
            return t280;
        }
        return null;
    }
    private fuzzyFallback(k280: DeviceRequirement): MatchedDevice | null {
        const l280 = getCategoriesForDevType(k280.devType);
        for (let m280 = 0; m280 < l280.length; m280++) {
            const n280 = l280[m280];
            const o280 = this.library.search(n280, 1, 20);
            if (o280.items.length > 0) {
                const p280 = o280.items[0];
                return this.buildMatched(k280, p280.id, p280.name, 'fuzzy');
            }
        }
        return null;
    }
    private tryDomesticAlt(h280: DeviceRequirement): MatchedDevice | null {
        if (!h280.explicitModel) {
            return null;
        }
        const i280 = getDomesticAlt(h280.explicitModel);
        if (!i280) {
            return null;
        }
        const j280 = this.library.getComponent(i280);
        if (j280.success && j280.data) {
            return this.buildMatched(h280, j280.data.id, j280.data.name, 'domestic_alt');
        }
        return null;
    }
    private buildMatched(x279: DeviceRequirement, y279: string, z279: string, a280: MatchLevel): MatchedDevice {
        const b280 = this.library.getComponent(y279);
        const c280 = b280.data !== undefined ?
            copyParamsFromRecord(b280.data.defaultParams) : emptyStringMap();
        const d280 = copyParamsFromRecord(c280);
        const e280 = this.validateAndFixParams(y279, d280, x279);
        const f280 = this.inferZone(x279.devType, y279);
        const g280: MatchedDevice = {
            requirement: x279,
            libDevId: y279,
            name: z279,
            params: copyStringMap(e280.params),
            moduleZone: f280,
            placementPriority: getPlacementPriority(x279.devType, x279.priority),
            matchLevel: a280,
            paramAdjusted: e280.adjusted,
            adjustReason: e280.reason
        };
        return g280;
    }
    private validateAndFixParams(e279: string, f279: Map<string, string>, g279: DeviceRequirement): ParamValidationResult {
        const h279 = this.library.getDeviceMeta(e279);
        let i279 = false;
        let j279: string | undefined;
        const k279: string[] = [];
        g279.paramConstraint.forEach((v279: string, w279: string) => {
            k279.push(w279);
        });
        for (let s279 = 0; s279 < k279.length; s279++) {
            const t279 = k279[s279];
            const u279 = g279.paramConstraint.get(t279);
            if (u279 === undefined) {
                continue;
            }
            if (t279 === 'value' || t279.includes('output') || t279.includes('voltage')) {
                f279.set('value', u279);
            }
        }
        if (e279.includes('STM32') && !f279.has('decoupling')) {
            f279.set('decoupling', '100nF');
            i279 = true;
            j279 = 'STM32 VDD 推荐 0.1uF 去耦电容';
        }
        if ((e279.includes('AT89') || e279.includes('STC')) && g279.devType === 'resistor') {
            f279.set('value', f279.get('value') ?? '10k');
            i279 = true;
            j279 = '51 P0 口推荐上拉电阻';
        }
        if (h279.success && h279.data?.param_limit) {
            const l279: Record<string, Object> = h279.data.param_limit;
            const m279: Object = l279['max_voltage'];
            const n279: Object = l279['voltage_max'];
            const o279: Object = m279 !== undefined ? m279 : n279;
            const p279 = g279.paramConstraint.get('voltage');
            if (o279 && p279) {
                const q279 = parseFloat(p279);
                const r279 = parseFloat(String(o279));
                if (!isNaN(q279) && !isNaN(r279) && q279 > r279) {
                    i279 = true;
                    j279 = `耐压超限，已按 ${r279}V 限制修正`;
                }
            }
        }
        return { params: f279, adjusted: i279, reason: j279 };
    }
    private passesParamLimit(b279: string, c279: DeviceRequirement): boolean {
        const d279 = this.library.getDeviceMeta(b279);
        if (!d279.success || !d279.data) {
            return true;
        }
        return this.checkMcuFirmware(d279.data, c279);
    }
    private checkMcuFirmware(x278: DeviceMeta, y278: DeviceRequirement): boolean {
        if (!x278.is_mcu) {
            return true;
        }
        const z278 = y278.paramConstraint.get('flash');
        if (z278 && x278.flash_size) {
            const a279 = parseInt(z278);
            if (!isNaN(a279) && x278.flash_size < a279) {
                return false;
            }
        }
        return true;
    }
    private inferZone(v278: string, w278: string): string {
        if (v278.includes('mcu') || w278.includes('STM32') || w278.includes('AT89')) {
            return 'mcu_core';
        }
        if (v278 === 'ldo' || w278.includes('AMS') || v278 === 'dcdc') {
            return 'power';
        }
        if (v278 === 'opamp' || w278.includes('LM358')) {
            return 'analog';
        }
        if (v278 === 'lcd' || v278 === 'sensor') {
            return 'digital_periph';
        }
        return 'digital_periph';
    }
    private findAlternatives(n278: string, o278: DeviceRequirement): string[] {
        const p278: string[] = [];
        const q278 = getDomesticAlt(n278);
        if (q278) {
            p278.push(q278);
        }
        const r278 = `${o278.func} ${o278.devType}`;
        const s278 = this.library.semanticSearch(r278, 5);
        for (let t278 = 0; t278 < s278.length; t278++) {
            const u278 = s278[t278];
            if (u278.id !== n278 && !p278.includes(u278.id)) {
                p278.push(u278.id);
            }
        }
        return p278.slice(0, 5);
    }
    static buildLocalLlmOutput(f278: string): DeviceSelectLlmOutput {
        const g278 = RagKnowledgeBase.search(f278);
        if (g278) {
            return {
                functionModule: g278.modules,
                deviceRequireList: g278.deviceHints,
                circuitConstraint: '模拟电源与数字分区，MCU晶振就近摆放'
            };
        }
        const h278 = f278.toLowerCase();
        const i278: DeviceRequirement[] = [];
        if (h278.includes('stm32')) {
            i278.push(makeDeviceRequirement('MCU', 'mcu_stm32', 10, emptyStringMap(), 'STM32F103C8T6'));
            i278.push(makeDeviceRequirement('晶振', 'crystal', 9, stringMap1('freq', '8MHz')));
            i278.push(makeDeviceRequirement('去耦', 'cap', 8, stringMap1('value', '100nF')));
        }
        if (h278.includes('51') || h278.includes('stc')) {
            i278.push(makeDeviceRequirement('MCU', 'mcu_51', 10, emptyStringMap(), 'AT89C51'));
        }
        if (h278.includes('lcd')) {
            i278.push(makeDeviceRequirement('LCD', 'lcd', 5, emptyStringMap()));
        }
        if (h278.includes('led')) {
            i278.push(makeDeviceRequirement('LED', 'led', 6, emptyStringMap(), 'LED_0805'));
        }
        const j278 = f278.match(/[A-Z]{2,}[A-Z0-9-]{2,}/g);
        const k278: string[] = [];
        if (j278) {
            for (let l278 = 0; l278 < j278.length; l278++) {
                const m278 = j278[l278];
                if (m278.includes('XYZ') || m278.includes('99999')) {
                    k278.push(m278);
                }
            }
        }
        return {
            functionModule: ['用户定制'],
            deviceRequireList: i278,
            circuitConstraint: '标准嵌入式分区布局',
            oodFlags: k278.length > 0 ? k278 : undefined
        };
    }
}
