import { emptyStringMap, makeDeviceRequirement, stringMap1 } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { DeviceRequirement } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
export interface RagTemplate {
    id: string;
    keywords: string[];
    mcuFamily: '8051' | 'STM32' | 'any';
    modules: string[];
    deviceHints: DeviceRequirement[];
}
function buildTemplates(): RagTemplate[] {
    const h303: DeviceRequirement[] = [
        makeDeviceRequirement('3.3V稳压', 'ldo', 1, stringMap1('output', '3.3V')),
        makeDeviceRequirement('MCU主控', 'mcu_stm32', 10, emptyStringMap(), 'STM32F103C8T6'),
        makeDeviceRequirement('8M晶振', 'crystal', 9, stringMap1('freq', '8MHz')),
        makeDeviceRequirement('去耦电容', 'cap', 8, stringMap1('value', '100nF')),
        makeDeviceRequirement('复位上拉', 'resistor', 7, stringMap1('value', '10k'))
    ];
    const i303: DeviceRequirement[] = [
        makeDeviceRequirement('MCU主控', 'mcu_51', 10, emptyStringMap(), 'AT89C51'),
        makeDeviceRequirement('11M晶振', 'crystal', 9, stringMap1('freq', '11.0592MHz')),
        makeDeviceRequirement('P0上拉排阻', 'resistor', 8, stringMap1('value', '10k')),
        makeDeviceRequirement('去耦电容', 'cap', 7, stringMap1('value', '100nF'))
    ];
    const j303: DeviceRequirement[] = [
        makeDeviceRequirement('LCD1602', 'lcd', 5, emptyStringMap()),
        makeDeviceRequirement('限流电阻', 'resistor', 4, stringMap1('value', '220'))
    ];
    const k303: RagTemplate = {
        id: 'stm32_min_sys',
        keywords: ['stm32', '最小系统', 'min sys', 'f103'],
        mcuFamily: 'STM32',
        modules: ['电源模块', 'MCU最小系统', '时钟复位'],
        deviceHints: h303
    };
    const l303: RagTemplate = {
        id: '51_min_sys',
        keywords: ['51', '8051', 'at89', 'stc'],
        mcuFamily: '8051',
        modules: ['电源模块', 'MCU最小系统'],
        deviceHints: i303
    };
    const m303: RagTemplate = {
        id: 'lcd1602_periph',
        keywords: ['lcd', 'lcd1602', '显示'],
        mcuFamily: 'any',
        modules: ['显示外设'],
        deviceHints: j303
    };
    return [k303, l303, m303];
}
const TEMPLATES: RagTemplate[] = buildTemplates();
export class RagKnowledgeBase {
    static search(y302: string): RagTemplate | null {
        const z302 = y302.toLowerCase();
        let a303: RagTemplate | null = null;
        let b303 = 0;
        for (let c303 = 0; c303 < TEMPLATES.length; c303++) {
            const d303 = TEMPLATES[c303];
            let e303 = 0;
            for (let f303 = 0; f303 < d303.keywords.length; f303++) {
                const g303 = d303.keywords[f303];
                if (z302.includes(g303.toLowerCase())) {
                    e303++;
                }
            }
            if (e303 > b303) {
                b303 = e303;
                a303 = d303;
            }
        }
        return b303 > 0 ? a303 : null;
    }
    static getTemplate(w302: string): RagTemplate | null {
        for (let x302 = 0; x302 < TEMPLATES.length; x302++) {
            if (TEMPLATES[x302].id === w302) {
                return TEMPLATES[x302];
            }
        }
        return null;
    }
}
