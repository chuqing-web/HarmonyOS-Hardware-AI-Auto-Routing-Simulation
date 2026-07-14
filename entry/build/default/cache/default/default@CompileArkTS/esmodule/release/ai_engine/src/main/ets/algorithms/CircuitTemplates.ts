import type { SchematicDocument } from 'common';
import { LabTemplateRegistry } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/LabTemplateRegistry";
export class CircuitTemplates {
    static generateById(o272: string): SchematicDocument | null {
        return LabTemplateRegistry.generateById(o272);
    }
    static generate(j272: string, k272?: string): SchematicDocument {
        const l272 = j272.toLowerCase();
        if (l272.includes('7805') || l272.includes('稳压')) {
            return CircuitTemplates.generateById('lab_power') ??
                CircuitTemplates.fallbackDoc(j272);
        }
        if (l272.includes('运放') || l272.includes('放大') || l272.includes('同相') || l272.includes('反相')) {
            return CircuitTemplates.generateById('lab_amp') ?? CircuitTemplates.fallbackDoc(j272);
        }
        if (l272.includes('rc') || l272.includes('滤波')) {
            return CircuitTemplates.generateById('lab_filter') ?? CircuitTemplates.fallbackDoc(j272);
        }
        if ((l272.includes('51') || l272.includes('stc')) &&
            (l272.includes('流水') || l272.includes('led') || l272.includes('灯'))) {
            return CircuitTemplates.generateById('lab_51_led') ?? CircuitTemplates.fallbackDoc(j272);
        }
        if (l272.includes('uart') || l272.includes('串口')) {
            return CircuitTemplates.generateById('lab_uart') ?? CircuitTemplates.fallbackDoc(j272);
        }
        if (l272.includes('无源') || l272.includes('电阻') || l272.includes('电容')) {
            return CircuitTemplates.generateById('lab_passive') ?? CircuitTemplates.fallbackDoc(j272);
        }
        if (l272.includes('分立') || l272.includes('三极管') || l272.includes('mosfet')) {
            return CircuitTemplates.generateById('lab_discrete') ?? CircuitTemplates.fallbackDoc(j272);
        }
        if (l272.includes('74hc') || l272.includes('逻辑') || l272.includes('数字')) {
            return CircuitTemplates.generateById('lab_digital') ?? CircuitTemplates.fallbackDoc(j272);
        }
        if (l272.includes('存储') || l272.includes('eeprom') || l272.includes('flash')) {
            return CircuitTemplates.generateById('lab_memory') ?? CircuitTemplates.fallbackDoc(j272);
        }
        if (l272.includes('传感器') || l272.includes('ds18') || l272.includes('霍尔')) {
            return CircuitTemplates.generateById('lab_sensor') ?? CircuitTemplates.fallbackDoc(j272);
        }
        if (l272.includes('仪器') || l272.includes('示波器') || l272.includes('万用表')) {
            return CircuitTemplates.generateById('lab_instruments') ?? CircuitTemplates.fallbackDoc(j272);
        }
        const m272 = k272?.includes('STM32') || l272.includes('stm32');
        const n272 = k272?.includes('8051') || l272.includes('51') || l272.includes('stc');
        if (n272 && (l272.includes('led') || l272.includes('灯'))) {
            return CircuitTemplates.generateById('lab_51_led') ?? CircuitTemplates.fallbackDoc(j272);
        }
        if (m272) {
            return CircuitTemplates.generateById('lab_uart') ?? CircuitTemplates.fallbackDoc(j272);
        }
        return CircuitTemplates.generateById('lab_power') ?? CircuitTemplates.fallbackDoc(j272);
    }
    private static fallbackDoc(h272: string): SchematicDocument {
        const i272 = LabTemplateRegistry.generateById('lab_power');
        if (i272 !== null) {
            i272.metadata.description = h272;
            return i272;
        }
        throw new Error('No template available');
    }
}
