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
    const stm32Hints: DeviceRequirement[] = [
        makeDeviceRequirement('3.3V稳压', 'ldo', 1, stringMap1('output', '3.3V')),
        makeDeviceRequirement('MCU主控', 'mcu_stm32', 10, emptyStringMap(), 'STM32F103C8T6'),
        makeDeviceRequirement('8M晶振', 'crystal', 9, stringMap1('freq', '8MHz')),
        makeDeviceRequirement('去耦电容', 'cap', 8, stringMap1('value', '100nF')),
        makeDeviceRequirement('复位上拉', 'resistor', 7, stringMap1('value', '10k'))
    ];
    const m51Hints: DeviceRequirement[] = [
        makeDeviceRequirement('MCU主控', 'mcu_51', 10, emptyStringMap(), 'AT89C51'),
        makeDeviceRequirement('11M晶振', 'crystal', 9, stringMap1('freq', '11.0592MHz')),
        makeDeviceRequirement('P0上拉排阻', 'resistor', 8, stringMap1('value', '10k')),
        makeDeviceRequirement('去耦电容', 'cap', 7, stringMap1('value', '100nF'))
    ];
    const lcdHints: DeviceRequirement[] = [
        makeDeviceRequirement('LCD1602', 'lcd', 5, emptyStringMap()),
        makeDeviceRequirement('限流电阻', 'resistor', 4, stringMap1('value', '220'))
    ];
    const tpl1: RagTemplate = {
        id: 'stm32_min_sys',
        keywords: ['stm32', '最小系统', 'min sys', 'f103'],
        mcuFamily: 'STM32',
        modules: ['电源模块', 'MCU最小系统', '时钟复位'],
        deviceHints: stm32Hints
    };
    const tpl2: RagTemplate = {
        id: '51_min_sys',
        keywords: ['51', '8051', 'at89', 'stc'],
        mcuFamily: '8051',
        modules: ['电源模块', 'MCU最小系统'],
        deviceHints: m51Hints
    };
    const tpl3: RagTemplate = {
        id: 'lcd1602_periph',
        keywords: ['lcd', 'lcd1602', '显示'],
        mcuFamily: 'any',
        modules: ['显示外设'],
        deviceHints: lcdHints
    };
    return [tpl1, tpl2, tpl3];
}
const TEMPLATES: RagTemplate[] = buildTemplates();
export class RagKnowledgeBase {
    static search(prompt: string): RagTemplate | null {
        const lower = prompt.toLowerCase();
        let best: RagTemplate | null = null;
        let bestScore = 0;
        for (let ti = 0; ti < TEMPLATES.length; ti++) {
            const t = TEMPLATES[ti];
            let score = 0;
            for (let ki = 0; ki < t.keywords.length; ki++) {
                const kw = t.keywords[ki];
                if (lower.includes(kw.toLowerCase())) {
                    score++;
                }
            }
            if (score > bestScore) {
                bestScore = score;
                best = t;
            }
        }
        return bestScore > 0 ? best : null;
    }
    static getTemplate(id: string): RagTemplate | null {
        for (let i = 0; i < TEMPLATES.length; i++) {
            if (TEMPLATES[i].id === id) {
                return TEMPLATES[i];
            }
        }
        return null;
    }
}
