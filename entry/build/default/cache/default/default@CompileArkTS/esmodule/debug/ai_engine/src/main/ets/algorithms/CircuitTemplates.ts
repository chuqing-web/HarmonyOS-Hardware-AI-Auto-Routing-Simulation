import type { SchematicDocument } from 'common';
import { LabTemplateRegistry } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/LabTemplateRegistry";
export class CircuitTemplates {
    /** 按实验模板 ID 生成（教学面板专用） */
    static generateById(templateId: string): SchematicDocument | null {
        return LabTemplateRegistry.generateById(templateId);
    }
    static generate(prompt: string, mcuFamily?: string): SchematicDocument {
        const lower = prompt.toLowerCase();
        if (lower.includes('7805') || lower.includes('稳压')) {
            return CircuitTemplates.generateById('lab_power') ??
                CircuitTemplates.fallbackDoc(prompt);
        }
        if (lower.includes('运放') || lower.includes('放大') || lower.includes('同相') || lower.includes('反相')) {
            return CircuitTemplates.generateById('lab_amp') ?? CircuitTemplates.fallbackDoc(prompt);
        }
        if (lower.includes('rc') || lower.includes('滤波')) {
            return CircuitTemplates.generateById('lab_filter') ?? CircuitTemplates.fallbackDoc(prompt);
        }
        if ((lower.includes('51') || lower.includes('stc')) &&
            (lower.includes('流水') || lower.includes('led') || lower.includes('灯'))) {
            return CircuitTemplates.generateById('lab_51_led') ?? CircuitTemplates.fallbackDoc(prompt);
        }
        if (lower.includes('uart') || lower.includes('串口')) {
            return CircuitTemplates.generateById('lab_uart') ?? CircuitTemplates.fallbackDoc(prompt);
        }
        if (lower.includes('无源') || lower.includes('电阻') || lower.includes('电容')) {
            return CircuitTemplates.generateById('lab_passive') ?? CircuitTemplates.fallbackDoc(prompt);
        }
        if (lower.includes('分立') || lower.includes('三极管') || lower.includes('mosfet')) {
            return CircuitTemplates.generateById('lab_discrete') ?? CircuitTemplates.fallbackDoc(prompt);
        }
        if (lower.includes('74hc') || lower.includes('逻辑') || lower.includes('数字')) {
            return CircuitTemplates.generateById('lab_digital') ?? CircuitTemplates.fallbackDoc(prompt);
        }
        if (lower.includes('存储') || lower.includes('eeprom') || lower.includes('flash')) {
            return CircuitTemplates.generateById('lab_memory') ?? CircuitTemplates.fallbackDoc(prompt);
        }
        if (lower.includes('传感器') || lower.includes('ds18') || lower.includes('霍尔')) {
            return CircuitTemplates.generateById('lab_sensor') ?? CircuitTemplates.fallbackDoc(prompt);
        }
        if (lower.includes('仪器') || lower.includes('示波器') || lower.includes('万用表')) {
            return CircuitTemplates.generateById('lab_instruments') ?? CircuitTemplates.fallbackDoc(prompt);
        }
        const isStm32 = mcuFamily?.includes('STM32') || lower.includes('stm32');
        const is51 = mcuFamily?.includes('8051') || lower.includes('51') || lower.includes('stc');
        if (is51 && (lower.includes('led') || lower.includes('灯'))) {
            return CircuitTemplates.generateById('lab_51_led') ?? CircuitTemplates.fallbackDoc(prompt);
        }
        if (isStm32) {
            return CircuitTemplates.generateById('lab_uart') ?? CircuitTemplates.fallbackDoc(prompt);
        }
        return CircuitTemplates.generateById('lab_power') ?? CircuitTemplates.fallbackDoc(prompt);
    }
    private static fallbackDoc(prompt: string): SchematicDocument {
        const doc = LabTemplateRegistry.generateById('lab_power');
        if (doc !== null) {
            doc.metadata.description = prompt;
            return doc;
        }
        throw new Error('No template available');
    }
}
