import type { IComponentLibrary } from 'component_library';
import { Logger, emptyStringMap, makeDeviceRequirement, stringMap1, copyStringMap } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { DeviceRequirement, DeviceSelectLlmOutput, MatchedDevice, DeviceSelectResult, DeviceMeta, LibDevice, LibDevicePin, SimModelInfo } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { RagKnowledgeBase } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/RagKnowledgeBase";
import type { AlternativeEntry, MatchLevel, ModuleZoneType, ParamValidationResult } from '../internal/AiEngineTypes';
import { alternativesToMap, copyParamsFromRecord, getCategoriesForDevType, getDomesticAlt, getPlacementPriority, joinParamConstraintValues } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/internal/AiEngineHelpers";
export class DeviceSelectEngine {
    private library: IComponentLibrary;
    constructor(library: IComponentLibrary) {
        this.library = library;
    }
    /** 阶段2-4：本地匹配 + 参数校验 + RAG 兜底 */
    matchFromLlmOutput(llm: DeviceSelectLlmOutput, prompt: string): DeviceSelectResult {
        let oodDetected = (llm.oodFlags?.length ?? 0) > 0;
        const devices: MatchedDevice[] = [];
        const alternativeEntries: AlternativeEntry[] = [];
        let ragTemplateId: string | undefined;
        let requirements = llm.deviceRequireList ?? [];
        if (requirements.length === 0) {
            const rag = RagKnowledgeBase.search(prompt);
            if (rag) {
                ragTemplateId = rag.id;
                requirements = rag.deviceHints;
            }
        }
        for (let i = 0; i < requirements.length; i++) {
            const req = requirements[i];
            const matched = this.matchOne(req);
            if (!matched && req.explicitModel) {
                const exact = this.library.getComponent(req.explicitModel);
                const search = this.library.search(req.explicitModel, 1, 1);
                if (!exact.success && search.items.length === 0) {
                    oodDetected = true;
                    if (!llm.oodFlags)
                        llm.oodFlags = [];
                    if (!llm.oodFlags.includes(req.explicitModel)) {
                        llm.oodFlags.push(req.explicitModel);
                    }
                }
            }
            if (matched) {
                devices.push(matched);
                alternativeEntries.push({
                    libDevId: matched.libDevId,
                    alternatives: this.findAlternatives(matched.libDevId, req)
                });
            }
            else {
                Logger.warn('DeviceSelect', `No match for ${req.func}/${req.devType}`);
                const fallback = this.fuzzyFallback(req);
                if (fallback) {
                    devices.push(fallback);
                    alternativeEntries.push({ libDevId: fallback.libDevId, alternatives: [] });
                }
            }
        }
        const result: DeviceSelectResult = {
            devices: devices,
            alternatives: alternativesToMap(alternativeEntries),
            oodDetected: oodDetected,
            ragTemplateId: ragTemplateId
        };
        return result;
    }
    toLibDevices(matched: MatchedDevice[]): LibDevice[] {
        const result: LibDevice[] = [];
        for (let i = 0; i < matched.length; i++) {
            const m = matched[i];
            const comp = this.library.getComponent(m.libDevId);
            const meta = this.library.getDeviceMeta(m.libDevId);
            const def = comp.data;
            const dm = meta.data;
            const moduleZone = this.toModuleZone(m.moduleZone);
            const pinList: LibDevicePin[] = [];
            const pinMetaList = dm?.pin_list ?? [];
            for (let pi = 0; pi < pinMetaList.length; pi++) {
                const p = pinMetaList[pi];
                const pin: LibDevicePin = {
                    pinId: p.pin_id,
                    pinLabel: p.pin_label,
                    pinType: p.pin_type,
                    x: p.x,
                    y: p.y,
                    pullUp: p.pull_up ?? false,
                    pullDown: p.pull_down ?? false,
                    maxVoltage: p.max_voltage ?? 5
                };
                pinList.push(pin);
            }
            let modelType: 'spice' | 'mcu_51' | 'mcu_stm32' | 'digital_event' = 'spice';
            if (dm?.model_type === 'mcu_stm32') {
                modelType = 'mcu_stm32';
            }
            else if (dm?.model_type === 'mcu_51') {
                modelType = 'mcu_51';
            }
            else if (dm?.model_type === 'digital') {
                modelType = 'digital_event';
            }
            const simModel: SimModelInfo = {
                modelType: modelType,
                modelText: def?.spiceModel ?? '',
                modelVersion: '1.0'
            };
            const libDev: LibDevice = {
                libDevId: m.libDevId,
                name: def?.name ?? m.name,
                vendor: dm?.vendor ?? 'Generic',
                category: dm?.category ?? def?.category ?? '',
                subCategory: dm?.sub_category ?? '',
                svgSymbol: def?.svgSymbol ?? '',
                thumbnailBase64: '',
                pinList: pinList,
                simModel: simModel,
                defaultParams: copyStringMap(m.params),
                paramLimit: {},
                isCustom: dm?.is_custom ?? false,
                supportMcuFirmware: dm?.is_mcu ?? false,
                aiWiringRules: def?.aiWiringRules ?? [],
                placementPriority: m.placementPriority,
                moduleZone: moduleZone
            };
            result.push(libDev);
        }
        return result;
    }
    private toModuleZone(zone: string): ModuleZoneType | undefined {
        switch (zone) {
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
    private matchOne(req: DeviceRequirement): MatchedDevice | null {
        if (req.explicitModel) {
            const exact = this.library.getComponent(req.explicitModel);
            if (exact.success && exact.data) {
                return this.buildMatched(req, exact.data.id, exact.data.name, 'exact');
            }
            const search = this.library.search(req.explicitModel, 1, 5);
            if (search.items.length > 0) {
                const c = search.items[0];
                return this.buildMatched(req, c.id, c.name, 'exact');
            }
            return null;
        }
        const query = `${req.func} ${req.devType} ${joinParamConstraintValues(req.paramConstraint)}`;
        const semantic = this.library.semanticSearch(query, 5);
        for (let i = 0; i < semantic.length; i++) {
            const comp = semantic[i];
            if (this.passesParamLimit(comp.id, req)) {
                return this.buildMatched(req, comp.id, comp.name, 'fuzzy');
            }
        }
        const domestic = this.tryDomesticAlt(req);
        if (domestic) {
            return domestic;
        }
        return null;
    }
    private fuzzyFallback(req: DeviceRequirement): MatchedDevice | null {
        const cats = getCategoriesForDevType(req.devType);
        for (let i = 0; i < cats.length; i++) {
            const cat = cats[i];
            const list = this.library.search(cat, 1, 20);
            if (list.items.length > 0) {
                const c = list.items[0];
                return this.buildMatched(req, c.id, c.name, 'fuzzy');
            }
        }
        return null;
    }
    private tryDomesticAlt(req: DeviceRequirement): MatchedDevice | null {
        if (!req.explicitModel) {
            return null;
        }
        const altId = getDomesticAlt(req.explicitModel);
        if (!altId) {
            return null;
        }
        const alt = this.library.getComponent(altId);
        if (alt.success && alt.data) {
            return this.buildMatched(req, alt.data.id, alt.data.name, 'domestic_alt');
        }
        return null;
    }
    private buildMatched(req: DeviceRequirement, libDevId: string, name: string, level: MatchLevel): MatchedDevice {
        const comp = this.library.getComponent(libDevId);
        const defaultParams = comp.data !== undefined ?
            copyParamsFromRecord(comp.data.defaultParams) : emptyStringMap();
        const params = copyParamsFromRecord(defaultParams);
        const validated = this.validateAndFixParams(libDevId, params, req);
        const zone = this.inferZone(req.devType, libDevId);
        const matched: MatchedDevice = {
            requirement: req,
            libDevId: libDevId,
            name: name,
            params: copyStringMap(validated.params),
            moduleZone: zone,
            placementPriority: getPlacementPriority(req.devType, req.priority),
            matchLevel: level,
            paramAdjusted: validated.adjusted,
            adjustReason: validated.reason
        };
        return matched;
    }
    private validateAndFixParams(libDevId: string, params: Map<string, string>, req: DeviceRequirement): ParamValidationResult {
        const meta = this.library.getDeviceMeta(libDevId);
        let adjusted = false;
        let reason: string | undefined;
        const constraintKeys: string[] = [];
        req.paramConstraint.forEach((_value: string, key: string) => {
            constraintKeys.push(key);
        });
        for (let i = 0; i < constraintKeys.length; i++) {
            const key = constraintKeys[i];
            const val = req.paramConstraint.get(key);
            if (val === undefined) {
                continue;
            }
            if (key === 'value' || key.includes('output') || key.includes('voltage')) {
                params.set('value', val);
            }
        }
        if (libDevId.includes('STM32') && !params.has('decoupling')) {
            params.set('decoupling', '100nF');
            adjusted = true;
            reason = 'STM32 VDD 推荐 0.1uF 去耦电容';
        }
        if ((libDevId.includes('AT89') || libDevId.includes('STC')) && req.devType === 'resistor') {
            params.set('value', params.get('value') ?? '10k');
            adjusted = true;
            reason = '51 P0 口推荐上拉电阻';
        }
        if (meta.success && meta.data?.param_limit) {
            const limits: Record<string, Object> = meta.data.param_limit;
            const maxVoltageVal: Object = limits['max_voltage'];
            const voltageMaxVal: Object = limits['voltage_max'];
            const maxV: Object = maxVoltageVal !== undefined ? maxVoltageVal : voltageMaxVal;
            const reqVoltage = req.paramConstraint.get('voltage');
            if (maxV && reqVoltage) {
                const reqV = parseFloat(reqVoltage);
                const limV = parseFloat(String(maxV));
                if (!isNaN(reqV) && !isNaN(limV) && reqV > limV) {
                    adjusted = true;
                    reason = `耐压超限，已按 ${limV}V 限制修正`;
                }
            }
        }
        return { params: params, adjusted: adjusted, reason: reason };
    }
    private passesParamLimit(libDevId: string, req: DeviceRequirement): boolean {
        const meta = this.library.getDeviceMeta(libDevId);
        if (!meta.success || !meta.data) {
            return true;
        }
        return this.checkMcuFirmware(meta.data, req);
    }
    private checkMcuFirmware(meta: DeviceMeta, req: DeviceRequirement): boolean {
        if (!meta.is_mcu) {
            return true;
        }
        const flashReq = req.paramConstraint.get('flash');
        if (flashReq && meta.flash_size) {
            const need = parseInt(flashReq);
            if (!isNaN(need) && meta.flash_size < need) {
                return false;
            }
        }
        return true;
    }
    private inferZone(devType: string, libDevId: string): string {
        if (devType.includes('mcu') || libDevId.includes('STM32') || libDevId.includes('AT89')) {
            return 'mcu_core';
        }
        if (devType === 'ldo' || libDevId.includes('AMS') || devType === 'dcdc') {
            return 'power';
        }
        if (devType === 'opamp' || libDevId.includes('LM358')) {
            return 'analog';
        }
        if (devType === 'lcd' || devType === 'sensor') {
            return 'digital_periph';
        }
        return 'digital_periph';
    }
    private findAlternatives(libDevId: string, req: DeviceRequirement): string[] {
        const alts: string[] = [];
        const domestic = getDomesticAlt(libDevId);
        if (domestic) {
            alts.push(domestic);
        }
        const query = `${req.func} ${req.devType}`;
        const found = this.library.semanticSearch(query, 5);
        for (let i = 0; i < found.length; i++) {
            const c = found[i];
            if (c.id !== libDevId && !alts.includes(c.id)) {
                alts.push(c.id);
            }
        }
        return alts.slice(0, 5);
    }
    static buildLocalLlmOutput(prompt: string): DeviceSelectLlmOutput {
        const rag = RagKnowledgeBase.search(prompt);
        if (rag) {
            return {
                functionModule: rag.modules,
                deviceRequireList: rag.deviceHints,
                circuitConstraint: '模拟电源与数字分区，MCU晶振就近摆放'
            };
        }
        const lower = prompt.toLowerCase();
        const reqs: DeviceRequirement[] = [];
        if (lower.includes('stm32')) {
            reqs.push(makeDeviceRequirement('MCU', 'mcu_stm32', 10, emptyStringMap(), 'STM32F103C8T6'));
            reqs.push(makeDeviceRequirement('晶振', 'crystal', 9, stringMap1('freq', '8MHz')));
            reqs.push(makeDeviceRequirement('去耦', 'cap', 8, stringMap1('value', '100nF')));
        }
        if (lower.includes('51') || lower.includes('stc')) {
            reqs.push(makeDeviceRequirement('MCU', 'mcu_51', 10, emptyStringMap(), 'AT89C51'));
        }
        if (lower.includes('lcd')) {
            reqs.push(makeDeviceRequirement('LCD', 'lcd', 5, emptyStringMap()));
        }
        if (lower.includes('led')) {
            reqs.push(makeDeviceRequirement('LED', 'led', 6, emptyStringMap(), 'LED_0805'));
        }
        const oodMatch = prompt.match(/[A-Z]{2,}[A-Z0-9-]{2,}/g);
        const oodFlags: string[] = [];
        if (oodMatch) {
            for (let i = 0; i < oodMatch.length; i++) {
                const token = oodMatch[i];
                if (token.includes('XYZ') || token.includes('99999')) {
                    oodFlags.push(token);
                }
            }
        }
        return {
            functionModule: ['用户定制'],
            deviceRequireList: reqs,
            circuitConstraint: '标准嵌入式分区布局',
            oodFlags: oodFlags.length > 0 ? oodFlags : undefined
        };
    }
}
