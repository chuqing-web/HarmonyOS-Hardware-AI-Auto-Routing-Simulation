/**
 * 电路模板生成器 v3.0 — AI 关键词分派 + 实验模板 ID 分派 + 仪器感知复合匹配
 * v3.0: 复合仪器检测(如"分压+电压表")、仪器需求标记、模板组合策略
 */
import { SchematicDocument } from 'common';
import { LabTemplateRegistry } from './LabTemplateRegistry';

/** v3.0: 模板匹配结果 — 携带仪器需求标记 */
export interface TemplateMatchResult {
  templateId: string;
  /** 用户需求中隐含的仪器类型列表 */
  instrumentsNeeded: string[];
  /** 是否为复合场景（如"分压+电压表"） */
  isCompound: boolean;
}

export class CircuitTemplates {

  /** 按实验模板 ID 生成（教学面板专用） */
  static generateById(templateId: string): SchematicDocument | null {
    return LabTemplateRegistry.generateById(templateId);
  }

  static generate(prompt: string, mcuFamily?: string): SchematicDocument | null {
    const match = CircuitTemplates.matchWithInstruments(prompt, mcuFamily);
    if (match !== null) {
      return CircuitTemplates.generateById(match.templateId);
    }
    // 禁止静默 lab_power 兜底（生产路径不得调用本方法）
    return null;
  }

  /**
   * v3.0: 带仪器感知的模板匹配 — 检测电路类型 + 隐含的仪器需求。
   * 返回匹配结果（含仪器列表），供上层在布线/布局时追加仪器处理。
   */
  static matchWithInstruments(prompt: string, mcuFamily?: string): TemplateMatchResult | null {
    const lower = prompt.toLowerCase();
    const instruments: string[] = [];

    // 先检测仪器需求（独立于电路类型）
    if (lower.includes('电流表') || lower.includes('测电流') || lower.includes('总电流')) {
      instruments.push('AMMETER_DC');
    }
    // 检测"N个电压表"或"N块电压表"
    const vmMatch = lower.match(/(\d+)\s*[个块只台]\s*电压表/);
    if (vmMatch) {
      const count = parseInt(vmMatch[1]);
      for (let vi = 0; vi < count; vi++) {
        instruments.push('VOLTMETER_DC');
      }
    } else if (lower.includes('电压表') || lower.includes('测电压')) {
      // 分压电路默认配1块电压表（需轮换测量），N个电阻则推荐N块
      instruments.push('VOLTMETER_DC');
    }
    if (lower.includes('示波器') || lower.includes('波形') || lower.includes('oscilloscope')) {
      instruments.push('OSCILLOSCOPE');
    }
    if (lower.includes('逻辑分析仪') || lower.includes('时序')) {
      instruments.push('LOGIC_ANALYZER');
    }

    // 复合场景匹配: 电路类型 + 仪器
    // "分压" 或 "电阻分压" + 仪器 → lab_passive + instruments
    if ((lower.includes('分压') || (lower.includes('电阻') && lower.includes('串联'))) &&
      instruments.length > 0) {
      return { templateId: 'lab_passive', instrumentsNeeded: instruments, isCompound: true };
    }
    // "LED" + 电流表 → lab_51_led + ammeter
    if ((lower.includes('led') || lower.includes('灯') || lower.includes('流水')) &&
      instruments.some(i => i.includes('AMMETER'))) {
      const is51 = (mcuFamily !== undefined && mcuFamily.includes('8051')) ||
        lower.includes('8051') || lower.includes('at89') || lower.includes('stc89') ||
        lower.includes('stc') || /\b51\b/.test(lower);
      return {
        templateId: is51 ? 'lab_51_led' : 'lab_digital',
        instrumentsNeeded: instruments, isCompound: true
      };
    }
    // "积分/方波→三角" + 示波器 → lab_integrator
    if ((lower.includes('积分') || lower.includes('integrator') ||
      (lower.includes('方波') && lower.includes('三角'))) &&
      instruments.some(i => i.includes('OSCILLOSCOPE'))) {
      return { templateId: 'lab_integrator', instrumentsNeeded: instruments, isCompound: true };
    }
    // "运放/放大" + 示波器 → lab_amp + scope
    if ((lower.includes('运放') || lower.includes('放大') || lower.includes('同相')) &&
      instruments.some(i => i.includes('OSCILLOSCOPE'))) {
      return { templateId: 'lab_amp', instrumentsNeeded: instruments, isCompound: true };
    }
    // "稳压/电源" + 电压表 → lab_power + voltmeter
    if ((lower.includes('7805') || lower.includes('稳压') || lower.includes('电源')) &&
      instruments.some(i => i.includes('VOLTMETER'))) {
      return { templateId: 'lab_power', instrumentsNeeded: instruments, isCompound: true };
    }
    // "传感器" + 仪器 → lab_sensor + instruments
    if (lower.includes('传感器') && instruments.length > 0) {
      return { templateId: 'lab_sensor', instrumentsNeeded: instruments, isCompound: true };
    }

    // 纯仪器场景（只有仪器没有具体电路）
    if (instruments.length >= 2 && !lower.includes('电阻') && !lower.includes('运放') &&
      !lower.includes('单片机') && !lower.includes('led')) {
      return { templateId: 'lab_passive', instrumentsNeeded: instruments, isCompound: true };
    }

    // 纯仪器场景 fallback
    if (lower.includes('仪器') || lower.includes('示波器') || lower.includes('万用表') ||
      lower.includes('电流表') || lower.includes('电压表')) {
      return { templateId: 'lab_instruments', instrumentsNeeded: instruments, isCompound: false };
    }

    // 强关键词匹配电路类型（无仪器需求）
    const baseId = CircuitTemplates.matchStrongTemplateId(prompt, mcuFamily);
    if (baseId !== null) {
      return { templateId: baseId, instrumentsNeeded: instruments, isCompound: instruments.length > 0 };
    }
    return null;
  }

  /**
   * 强关键词匹配实验模板 ID；无命中返回 null（不回落 lab_power）。
   * AI 全闭环仅在强命中时走模板捷径。
   */
  static matchStrongTemplateId(prompt: string, mcuFamily?: string): string | null {
    const lower = prompt.toLowerCase();

    if (lower.includes('7805') || lower.includes('稳压')) {
      return 'lab_power';
    }
    // 须先于「运放/反相/rc」，避免积分被误分到 amp/filter
    if (lower.includes('积分') || lower.includes('integrator') ||
      (lower.includes('方波') && lower.includes('三角'))) {
      return 'lab_integrator';
    }
    if (lower.includes('运放') || lower.includes('放大') || lower.includes('同相') || lower.includes('反相')) {
      return 'lab_amp';
    }
    if (lower.includes('rc') || lower.includes('滤波')) {
      return 'lab_filter';
    }
    if ((lower.includes('8051') || lower.includes('at89') || lower.includes('stc89') ||
      lower.includes('stc') || /\b51\b/.test(lower)) &&
      (lower.includes('流水') || lower.includes('led') || lower.includes('灯'))) {
      return 'lab_51_led';
    }
    if (lower.includes('uart') || lower.includes('串口')) {
      return 'lab_uart';
    }
    if (lower.includes('电位器') || lower.includes('滑动变阻') || lower.includes('potentiometer') ||
      lower.includes('pot_')) {
      return 'lab_passive';
    }
    if (lower.includes('数字门') || lower.includes('真值表') || lower.includes('与非') ||
      lower.includes('异或')) {
      return 'lab_digital_gates';
    }
    if (lower.includes('无源') && (lower.includes('电阻') || lower.includes('电容') || lower.includes('实验'))) {
      return 'lab_passive';
    }
    if (lower.includes('555') || lower.includes('多谐') || lower.includes('无稳态') ||
      lower.includes('astable')) {
      return 'lab_analog_ic';
    }
    if (lower.includes('分立') || lower.includes('三极管') || lower.includes('mosfet')) {
      return 'lab_discrete';
    }
    if (lower.includes('74hc') || (lower.includes('逻辑') && lower.includes('门'))) {
      return 'lab_digital';
    }
    if (lower.includes('存储') || lower.includes('eeprom') || lower.includes('flash')) {
      return 'lab_memory';
    }
    if (lower.includes('传感器') || lower.includes('ds18') || lower.includes('霍尔')) {
      return 'lab_sensor';
    }
    if (lower.includes('仪器') || lower.includes('示波器') || lower.includes('万用表') ||
      lower.includes('电流表') || lower.includes('电压表')) {
      return 'lab_instruments';
    }

    const isStm32 = (mcuFamily !== undefined && mcuFamily.includes('STM32')) || lower.includes('stm32');
    const is51 = (mcuFamily !== undefined && mcuFamily.includes('8051')) ||
      lower.includes('8051') || (lower.includes('stc') && lower.includes('单片机'));
    if (is51 && (lower.includes('led') || lower.includes('灯') || lower.includes('最小系统'))) {
      return 'lab_51_led';
    }
    if (isStm32 && (lower.includes('最小系统') || lower.includes('uart') || lower.includes('串口'))) {
      return 'lab_uart';
    }
    return null;
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
