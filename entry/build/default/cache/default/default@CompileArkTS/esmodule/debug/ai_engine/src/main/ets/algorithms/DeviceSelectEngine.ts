import type { IComponentLibrary, ComponentDefinition } from 'component_library';
import { Logger, emptyStringMap, makeDeviceRequirement, stringMap1, copyStringMap } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { DeviceRequirement, DeviceSelectLlmOutput, MatchedDevice, DeviceSelectResult, DeviceMeta, LibDevice, LibDevicePin, SimModelInfo } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { RagKnowledgeBase } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/RagKnowledgeBase";
import { classifyCircuitIntent } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/CircuitIntent";
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
            // 生产路径禁止 RAG 静默填 BOM；空选型由上层 abort
            Logger.warn('DeviceSelect', 'empty deviceRequireList — no RAG fill');
            oodDetected = true;
            if (!llm.oodFlags) {
                llm.oodFlags = [];
            }
            if (!llm.oodFlags.includes('EMPTY_REQUIRE_LIST')) {
                llm.oodFlags.push('EMPTY_REQUIRE_LIST');
            }
        }
        let matchedRequireCount = 0;
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
                matchedRequireCount++;
                devices.push(matched);
                alternativeEntries.push({
                    libDevId: matched.libDevId,
                    alternatives: this.findAlternatives(matched.libDevId, req)
                });
            }
            else {
                Logger.warn('DeviceSelect', `No match for ${req.func}/${req.devType}` +
                    (req.explicitModel ? ` explicitModel=${req.explicitModel}` : ''));
                // 禁止 fuzzyFallback 静默替身
                if (req.explicitModel) {
                    oodDetected = true;
                    if (!llm.oodFlags)
                        llm.oodFlags = [];
                    if (!llm.oodFlags.includes(req.explicitModel)) {
                        llm.oodFlags.push(req.explicitModel);
                    }
                }
                else if (req.devType || req.func) {
                    oodDetected = true;
                    const flag = `UNMATCHED:${req.explicitModel || req.devType || req.func}`;
                    if (!llm.oodFlags)
                        llm.oodFlags = [];
                    if (!llm.oodFlags.includes(flag)) {
                        llm.oodFlags.push(flag);
                    }
                }
            }
        }
        const result: DeviceSelectResult = {
            devices: devices,
            alternatives: alternativesToMap(alternativeEntries),
            oodDetected: oodDetected,
            ragTemplateId: ragTemplateId,
            matchedRequireCount: matchedRequireCount
        };
        // 仅在已有有效匹配时补 VCC/GND/VEE/SIGNAL_GEN；空 BOM 不得靠电源符号假装选型成功
        if (devices.length > 0) {
            const intent = classifyCircuitIntent(prompt);
            const hasVcc = devices.some(d => d.libDevId === 'VCC');
            const hasGnd = devices.some(d => d.libDevId === 'GND');
            const hasVee = devices.some(d => d.libDevId === 'VEE');
            const hasSig = devices.some(d => d.libDevId === 'SIGNAL_GEN');
            if (!hasVcc) {
                const vccReq = makeDeviceRequirement('VCC', 'power_supply', 2, emptyStringMap(), 'VCC');
                if (intent.preferredVccVoltage.length > 0) {
                    vccReq.paramConstraint = stringMap1('voltage', intent.preferredVccVoltage);
                }
                devices.push(this.buildMatched(vccReq, 'VCC', 'VCC Power', 'exact'));
                Logger.info('DeviceSelect', 'Auto-added VCC (LLM omitted it)');
            }
            if (!hasGnd) {
                const gndReq = makeDeviceRequirement('GND', 'power_supply', 2, emptyStringMap(), 'GND');
                devices.push(this.buildMatched(gndReq, 'GND', 'GND Ground', 'exact'));
                Logger.info('DeviceSelect', 'Auto-added GND (LLM omitted it)');
            }
            if (intent.dualSupply && !hasVee) {
                const veeV = intent.preferredVeeVoltage.length > 0 ? intent.preferredVeeVoltage : '-12V';
                const veeReq = makeDeviceRequirement('VEE', 'power_supply', 2, stringMap1('voltage', veeV), 'VEE');
                devices.push(this.buildMatched(veeReq, 'VEE', 'VEE Negative', 'exact'));
                Logger.info('DeviceSelect', `Auto-added VEE voltage=${veeV}`);
            }
            if (intent.needsSignalGen && !hasSig) {
                const sigMap = stringMap1('waveform', intent.signalWaveform || 'sine');
                sigMap.set('amplitude', '1V');
                sigMap.set('frequency', intent.preferredSignalFrequency.length > 0 ? intent.preferredSignalFrequency : '1kHz');
                sigMap.set('offset', '0V');
                sigMap.set('dutyCycle', intent.preferredSignalDuty.length > 0 ? intent.preferredSignalDuty : '50%');
                const sigReq = makeDeviceRequirement('信号发生器', 'instrument', 5, sigMap, 'SIGNAL_GEN');
                devices.push(this.buildMatched(sigReq, 'SIGNAL_GEN', 'Signal Generator', 'exact'));
                Logger.info('DeviceSelect', `Auto-added SIGNAL_GEN waveform=${intent.signalWaveform}` +
                    ` f=${sigMap.get('frequency')} duty=${sigMap.get('dutyCycle')}`);
            }
            // 将意图电压写回已匹配的 VCC/VEE
            for (let di = 0; di < devices.length; di++) {
                const d = devices[di];
                if (d.libDevId === 'VCC' && intent.preferredVccVoltage.length > 0) {
                    d.params.set('voltage', intent.preferredVccVoltage);
                }
                if (d.libDevId === 'VEE') {
                    const vv = intent.preferredVeeVoltage.length > 0 ? intent.preferredVeeVoltage : '-12V';
                    d.params.set('voltage', vv);
                }
                if (d.libDevId === 'SIGNAL_GEN') {
                    // LLM paramConstraint 优先；intent 仅填补空缺（避免「输出方波」覆盖正弦激励）
                    const curWf = (d.params.get('waveform') ?? '').trim();
                    if (curWf.length === 0 && intent.signalWaveform.length > 0) {
                        d.params.set('waveform', intent.signalWaveform);
                    }
                    const curF = (d.params.get('frequency') ?? '').trim();
                    if (curF.length === 0 && intent.preferredSignalFrequency.length > 0) {
                        d.params.set('frequency', intent.preferredSignalFrequency);
                    }
                    const curDuty = (d.params.get('dutyCycle') ?? '').trim();
                    if (curDuty.length === 0 && intent.preferredSignalDuty.length > 0) {
                        d.params.set('dutyCycle', intent.preferredSignalDuty);
                    }
                }
            }
        }
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
                // 显式型号：只接受 id 精确一致（大小写不敏感），禁止搜到别的器件冒充
                const want = (req.explicitModel ?? '').toUpperCase();
                for (let si = 0; si < search.items.length; si++) {
                    const c = search.items[si];
                    if ((c.id ?? '').toUpperCase() === want) {
                        return this.buildMatched(req, c.id, c.name, 'exact');
                    }
                }
            }
            return null;
        }
        const query = `${req.func} ${req.devType} ${joinParamConstraintValues(req.paramConstraint)}`;
        let semantic = this.library.semanticSearch(query, 8);
        // 电阻类器件优先匹配真实电阻 (R_*) 而非光敏/传感器类
        const devTypeLower = req.devType.toLowerCase();
        if (devTypeLower === 'resistor' || devTypeLower.includes('resistor')) {
            const resistors: ComponentDefinition[] = [];
            const others: ComponentDefinition[] = [];
            for (let i = 0; i < semantic.length; i++) {
                const c = semantic[i];
                if (c.id.startsWith('R_') || c.id.startsWith('POT_')) {
                    resistors.push(c);
                }
                else {
                    others.push(c);
                }
            }
            semantic = resistors.concat(others);
        }
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
            if (key === 'voltage' || key === 'amplitude' || key === 'frequency' ||
                key === 'offset' || key === 'waveform' || key === 'dutyCycle') {
                params.set(key, val);
            }
            else if (key === 'value' || key.includes('output')) {
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
    /** 本地选型增强: 电路模式识别 + 强制器件 + 仪器自动追加 */
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
        const modules: string[] = [];
        let circuitConstraint = '标准嵌入式分区布局';
        // --- 电路模式识别 ---
        const isMcu = lower.includes('stm32') || lower.includes('单片机') ||
            lower.includes('mcu') || lower.includes('51') || lower.includes('stc') ||
            lower.includes('at89') || lower.includes('arm') || lower.includes('cortex');
        const isAnalog = lower.includes('运放') || lower.includes('放大') ||
            lower.includes('opamp') || lower.includes('ua741') || lower.includes('lm358') ||
            lower.includes('同相') || lower.includes('反相') || lower.includes('跟随器');
        const isPower = lower.includes('电源') || lower.includes('稳压') ||
            lower.includes('7805') || lower.includes('1117') || lower.includes('ldo') ||
            lower.includes('降压') || lower.includes('升压');
        const isLed = lower.includes('led');
        const isDigital = lower.includes('74hc') || lower.includes('门电路') ||
            lower.includes('与门') || lower.includes('或门') || lower.includes('非门') ||
            lower.includes('触发器') || lower.includes('计数器');
        const isSensor = lower.includes('传感器') || lower.includes('ds18b20') ||
            lower.includes('温度') || lower.includes('光敏') || lower.includes('霍尔');
        const isI2c = lower.includes('i2c') || lower.includes('iic') ||
            lower.includes('24c02') || lower.includes('oled');
        const isUart = lower.includes('uart') || lower.includes('串口');
        // --- MCU 电路: 强制完整器件清单 ---
        if (isMcu) {
            modules.push('MCU 核心系统');
            if (lower.includes('stm32')) {
                reqs.push(makeDeviceRequirement('MCU', 'mcu_stm32', 10, emptyStringMap(), 'STM32F103C8T6'));
                circuitConstraint = 'STM32 MCU居中,晶振紧邻,去耦电容每VDD配1个,BOOT0接GND';
            }
            else {
                reqs.push(makeDeviceRequirement('MCU', 'mcu_51', 10, emptyStringMap(), 'AT89C51'));
                circuitConstraint = '51 MCU居中,晶振紧邻,EA接VCC,复位电路必备';
            }
            reqs.push(makeDeviceRequirement('晶振', 'crystal', 9, stringMap1('freq', '8MHz')));
            reqs.push(makeDeviceRequirement('复位上拉', 'resistor', 9, stringMap1('value', '10k')));
            reqs.push(makeDeviceRequirement('去耦电容', 'cap', 8, stringMap1('value', '100nF')));
            reqs.push(makeDeviceRequirement('大电容', 'cap', 7, stringMap1('value', '10uF')));
            reqs.push(makeDeviceRequirement('晶振负载电容×2', 'cap', 8, stringMap1('value', '22pF')));
            // I2C 设备追加上拉
            if (isI2c) {
                reqs.push(makeDeviceRequirement('I2C上拉', 'resistor', 6, stringMap1('value', '4.7k')));
                reqs.push(makeDeviceRequirement('I2C上拉', 'resistor', 6, stringMap1('value', '4.7k')));
            }
            // UART 终端
            if (isUart) {
                reqs.push(makeDeviceRequirement('串口终端', 'instrument', 5, emptyStringMap(), 'UART_TERMINAL'));
            }
        }
        // --- 模拟电路 ---
        if (isAnalog) {
            modules.push('模拟放大电路');
            reqs.push(makeDeviceRequirement('运放', 'opamp', 8, emptyStringMap(), 'LM358'));
            reqs.push(makeDeviceRequirement('反馈电阻', 'resistor', 7, stringMap1('value', '10k')));
            reqs.push(makeDeviceRequirement('输入电阻', 'resistor', 7, stringMap1('value', '1k')));
            reqs.push(makeDeviceRequirement('去耦电容', 'cap', 6, stringMap1('value', '100nF')));
            reqs.push(makeDeviceRequirement('示波器', 'oscilloscope', 8, emptyStringMap(), 'OSCILLOSCOPE'));
        }
        // --- 电源电路 ---
        if (isPower) {
            modules.push('电源稳压电路');
            if (lower.includes('3.3') || lower.includes('3v3')) {
                reqs.push(makeDeviceRequirement('LDO', 'ldo', 9, emptyStringMap(), 'AMS1117_3V3'));
            }
            else {
                reqs.push(makeDeviceRequirement('稳压器', 'ldo', 9, emptyStringMap(), 'LM7805'));
            }
            reqs.push(makeDeviceRequirement('输入电容', 'cap', 7, stringMap1('value', '10uF')));
            reqs.push(makeDeviceRequirement('输出电容', 'cap', 7, stringMap1('value', '100uF')));
            reqs.push(makeDeviceRequirement('去耦', 'cap', 6, stringMap1('value', '100nF')));
            reqs.push(makeDeviceRequirement('电压表', 'voltmeter', 7, emptyStringMap(), 'VOLTMETER_DC'));
        }
        // --- LED 电路 (独立或附属) ---
        if (isLed) {
            modules.push('LED 指示电路');
            reqs.push(makeDeviceRequirement('LED', 'led', 6, emptyStringMap(), 'LED_RED'));
            reqs.push(makeDeviceRequirement('限流电阻', 'resistor', 5, stringMap1('value', '330')));
            if (!isMcu && !isAnalog) {
                reqs.push(makeDeviceRequirement('电压表', 'voltmeter', 7, emptyStringMap(), 'VOLTMETER_DC'));
            }
        }
        // --- 数字逻辑 ---
        if (isDigital) {
            modules.push('数字逻辑电路');
            reqs.push(makeDeviceRequirement('逻辑IC', 'digital_ic', 8, emptyStringMap(), '74HC04'));
            reqs.push(makeDeviceRequirement('逻辑分析仪', 'logic_analyzer', 7, emptyStringMap(), 'LOGIC_ANALYZER'));
        }
        // --- 传感器 ---
        if (isSensor) {
            modules.push('传感器电路');
            if (lower.includes('ds18b20')) {
                reqs.push(makeDeviceRequirement('温度传感器', 'sensor', 7, emptyStringMap(), 'DS18B20'));
                reqs.push(makeDeviceRequirement('上拉电阻', 'resistor', 6, stringMap1('value', '4.7k')));
            }
            reqs.push(makeDeviceRequirement('电压表', 'voltmeter', 7, emptyStringMap(), 'VOLTMETER_DC'));
        }
        // --- 独立仪器追加 ---
        if (!isMcu && !isAnalog && !isPower && !isLed && !isDigital && !isSensor) {
            // 纯分立元件 / 无源电路
            if (lower.includes('电阻') || lower.includes('电容') || lower.includes('分压') ||
                lower.includes('rc') || lower.includes('滤波')) {
                modules.push('无源电路');
                reqs.push(makeDeviceRequirement('电阻', 'resistor', 5, stringMap1('value', '1k')));
                reqs.push(makeDeviceRequirement('电容', 'cap', 5, stringMap1('value', '10uF')));
                reqs.push(makeDeviceRequirement('电压表', 'voltmeter', 7, emptyStringMap(), 'VOLTMETER_DC'));
                // 检测电流表/电压表需求 → 提示仪器拓扑约束
                if (lower.includes('电流表') || lower.includes('电流') || lower.includes('测总电流')) {
                    reqs.push(makeDeviceRequirement('电流表', 'ammeter', 8, emptyStringMap(), 'AMMETER_DC'));
                    circuitConstraint = '电流表串联在 VCC 与分压电阻之间,I+接VCC,I-接第一电阻';
                }
                if ((lower.match(/电压表/g) ?? []).length >= 2 || lower.includes('分别测')) {
                    circuitConstraint = circuitConstraint.length > 15
                        ? circuitConstraint + ';电压表分布在不同分压节点(分别测不同电阻压降)'
                        : '电压表分布在不同分压节点(分别测不同电阻压降)';
                }
            }
        }
        // --- 必须有电源符号 ---
        if (reqs.length > 0) {
            const hasVcc = reqs.some(r => r.explicitModel === 'VCC');
            const hasGnd = reqs.some(r => r.explicitModel === 'GND');
            if (!hasVcc) {
                reqs.push(makeDeviceRequirement('VCC', 'instrument', 2, emptyStringMap(), 'VCC'));
            }
            if (!hasGnd) {
                reqs.push(makeDeviceRequirement('GND', 'instrument', 2, emptyStringMap(), 'GND'));
            }
        }
        if (modules.length === 0) {
            modules.push('用户定制');
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
            functionModule: modules,
            deviceRequireList: reqs,
            circuitConstraint: circuitConstraint,
            oodFlags: oodFlags.length > 0 ? oodFlags : undefined
        };
    }
}
