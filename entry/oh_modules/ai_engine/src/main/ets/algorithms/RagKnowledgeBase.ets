/**
 * RAG 标准子电路知识库 — 成熟模板器件组合兜底
 */
import {
  DeviceRequirement, emptyStringMap, makeDeviceRequirement, stringMap1
} from 'common';

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
    makeDeviceRequirement('MCU主控', 'mcu_stm32', 10, emptyStringMap(), 'STM32F103C8'),
    makeDeviceRequirement('8M晶振', 'crystal', 9, stringMap1('freq', '8MHz')),
    makeDeviceRequirement('去耦电容', 'cap', 8, stringMap1('value', '100nF')),
    makeDeviceRequirement('复位上拉', 'resistor', 7, stringMap1('value', '10k')),
    makeDeviceRequirement('电源正极', 'instrument', 2, emptyStringMap(), 'VCC'),
    makeDeviceRequirement('电源地', 'instrument', 2, emptyStringMap(), 'GND')
  ];
  const m51Hints: DeviceRequirement[] = [
    makeDeviceRequirement('MCU主控', 'mcu_51', 10, emptyStringMap(), 'AT89C51'),
    makeDeviceRequirement('11M晶振', 'crystal', 9, stringMap1('freq', '11.0592MHz')),
    makeDeviceRequirement('复位上拉', 'resistor', 8, stringMap1('value', '10k')),
    makeDeviceRequirement('去耦电容', 'cap', 7, stringMap1('value', '100nF')),
    makeDeviceRequirement('电源正极', 'instrument', 2, emptyStringMap(), 'VCC'),
    makeDeviceRequirement('电源地', 'instrument', 2, emptyStringMap(), 'GND')
  ];
  const lcdHints: DeviceRequirement[] = [
    makeDeviceRequirement('LCD1602', 'lcd', 5, emptyStringMap()),
    makeDeviceRequirement('限流电阻', 'resistor', 4, stringMap1('value', '220'))
  ];
  const ledHints: DeviceRequirement[] = [
    makeDeviceRequirement('LED指示', 'led', 6, emptyStringMap(), 'LED_RED'),
    makeDeviceRequirement('限流电阻', 'resistor', 5, stringMap1('value', '330')),
    makeDeviceRequirement('电源正极', 'instrument', 2, emptyStringMap(), 'VCC'),
    makeDeviceRequirement('电源地', 'instrument', 2, emptyStringMap(), 'GND')
  ];
  const instrumentHints: DeviceRequirement[] = [
    makeDeviceRequirement('电压表', 'voltmeter', 8, emptyStringMap(), 'VOLTMETER_DC'),
    makeDeviceRequirement('电流表', 'ammeter', 7, emptyStringMap(), 'AMMETER_DC'),
    makeDeviceRequirement('示波器', 'oscilloscope', 9, emptyStringMap(), 'OSCILLOSCOPE'),
    makeDeviceRequirement('万用表', 'multimeter', 6, emptyStringMap(), 'VIRTUAL_METER'),
    makeDeviceRequirement('负载电阻', 'resistor', 5, stringMap1('value', '1k')),
    makeDeviceRequirement('电源正极', 'instrument', 2, emptyStringMap(), 'VCC'),
    makeDeviceRequirement('电源地', 'instrument', 2, emptyStringMap(), 'GND')
  ];
  const opampHints: DeviceRequirement[] = [
    makeDeviceRequirement('运放', 'opamp', 9, emptyStringMap(), 'UA741'),
    makeDeviceRequirement('反馈电阻', 'resistor', 6, stringMap1('value', '10k')),
    makeDeviceRequirement('输入电阻', 'resistor', 5, stringMap1('value', '1k')),
    makeDeviceRequirement('电源正极', 'instrument', 2, emptyStringMap(), 'VCC'),
    makeDeviceRequirement('电源地', 'instrument', 2, emptyStringMap(), 'GND')
  ];
  const timer555Hints: DeviceRequirement[] = [
    makeDeviceRequirement('555定时器', 'timer', 10, emptyStringMap(), 'LM555'),
    makeDeviceRequirement('定时电阻Ra', 'resistor', 8, stringMap1('value', '1k')),
    makeDeviceRequirement('定时电阻Rb', 'resistor', 8, stringMap1('value', '10k')),
    makeDeviceRequirement('定时电容', 'cap', 8, stringMap1('value', '10uF')),
    makeDeviceRequirement('控制端旁路', 'cap', 5, stringMap1('value', '100nF')),
    makeDeviceRequirement('LED指示', 'led', 6, emptyStringMap(), 'LED_RED'),
    makeDeviceRequirement('限流电阻', 'resistor', 5, stringMap1('value', '330')),
    makeDeviceRequirement('电源正极', 'instrument', 2, emptyStringMap(), 'VCC'),
    makeDeviceRequirement('电源地', 'instrument', 2, emptyStringMap(), 'GND')
  ];
  const timer555MonoHints: DeviceRequirement[] = [
    makeDeviceRequirement('555定时器', 'timer', 10, emptyStringMap(), 'LM555'),
    makeDeviceRequirement('触发按键', 'switch', 9, emptyStringMap(), 'SW_PUSH'),
    makeDeviceRequirement('定时电阻', 'resistor', 8, stringMap1('value', '100k')),
    makeDeviceRequirement('TRIG上拉', 'resistor', 7, stringMap1('value', '10k')),
    makeDeviceRequirement('定时电容', 'cap', 8, stringMap1('value', '10uF')),
    makeDeviceRequirement('控制端旁路', 'cap', 5, stringMap1('value', '100nF')),
    makeDeviceRequirement('LED指示', 'led', 6, emptyStringMap(), 'LED_RED'),
    makeDeviceRequirement('限流电阻', 'resistor', 5, stringMap1('value', '330')),
    makeDeviceRequirement('电源正极', 'instrument', 2, emptyStringMap(), 'VCC'),
    makeDeviceRequirement('电源地', 'instrument', 2, emptyStringMap(), 'GND')
  ];
  const powerHints: DeviceRequirement[] = [
    makeDeviceRequirement('7805稳压', 'ldo', 10, emptyStringMap(), 'LM7805'),
    makeDeviceRequirement('滤波电容', 'cap', 8, stringMap1('value', '100uF')),
    makeDeviceRequirement('去耦电容', 'cap', 7, stringMap1('value', '100nF')),
    makeDeviceRequirement('电压表', 'voltmeter', 5, emptyStringMap(), 'VOLTMETER_DC'),
    makeDeviceRequirement('电源正极', 'instrument', 2, emptyStringMap(), 'VCC'),
    makeDeviceRequirement('电源地', 'instrument', 2, emptyStringMap(), 'GND')
  ];

  return [
    {
      id: 'stm32_min_sys',
      keywords: ['stm32', '最小系统', 'min sys', 'f103'],
      mcuFamily: 'STM32',
      modules: ['电源模块', 'MCU最小系统', '时钟复位'],
      deviceHints: stm32Hints
    },
    {
      id: '51_min_sys',
      keywords: ['8051', 'at89', 'stc89', '单片机最小'],
      mcuFamily: '8051',
      modules: ['电源模块', 'MCU最小系统'],
      deviceHints: m51Hints
    },
    {
      id: 'lcd1602_periph',
      keywords: ['lcd', 'lcd1602', '显示'],
      mcuFamily: 'any',
      modules: ['显示外设'],
      deviceHints: lcdHints
    },
    {
      id: 'led_basic',
      keywords: ['led', '闪烁', '指示灯', '流水灯'],
      mcuFamily: 'any',
      modules: ['LED指示'],
      deviceHints: ledHints
    },
    {
      id: 'instruments_lab',
      keywords: ['示波器', '万用表', '电压表', '电流表', '仪器', '测量'],
      mcuFamily: 'any',
      modules: ['虚拟仪器'],
      deviceHints: instrumentHints
    },
    {
      id: 'opamp_basic',
      keywords: ['运放', '放大', 'ua741', '同相', '反相'],
      mcuFamily: 'any',
      modules: ['模拟运放'],
      deviceHints: opampHints
    },
    {
      id: 'timer555_monostable',
      keywords: ['555单稳', '单稳态', '单稳', 'monostable', 'one-shot', '延时熄灭', '按键触发'],
      mcuFamily: 'any',
      modules: ['555单稳态延时'],
      deviceHints: timer555MonoHints
    },
    {
      id: 'timer555_astable',
      keywords: ['555', 'ne555', 'lm555', '多谐', '无稳态', '振荡器', '定时器'],
      mcuFamily: 'any',
      modules: ['555振荡'],
      deviceHints: timer555Hints
    },
    {
      id: 'power_7805',
      keywords: ['7805', '稳压', '电源'],
      mcuFamily: 'any',
      modules: ['电源'],
      deviceHints: powerHints
    }
  ];
}

const TEMPLATES: RagTemplate[] = buildTemplates();

export class RagKnowledgeBase {
  static search(prompt: string): RagTemplate | null {
    const lower = prompt.toLowerCase();
    const wantStm = lower.indexOf('stm32') >= 0 || lower.indexOf('f103') >= 0;
    const want51 = lower.indexOf('8051') >= 0 || lower.indexOf('at89') >= 0 ||
      lower.indexOf('stc') >= 0 || (lower.indexOf('51') >= 0 && lower.indexOf('stm') < 0);
    let best: RagTemplate | null = null;
    let bestScore = 0;
    for (let ti = 0; ti < TEMPLATES.length; ti++) {
      const t = TEMPLATES[ti];
      if (t.mcuFamily === 'STM32' && want51 && !wantStm) {
        continue;
      }
      if (t.mcuFamily === '8051' && wantStm && !want51) {
        continue;
      }
      let score = 0;
      for (let ki = 0; ki < t.keywords.length; ki++) {
        const kw = t.keywords[ki];
        if (kw.length < 2) {
          continue;
        }
        if (lower.includes(kw.toLowerCase())) {
          score += kw.length >= 4 ? 2 : 1;
        }
      }
      if (t.mcuFamily === 'STM32' && wantStm) {
        score += 3;
      }
      if (t.mcuFamily === '8051' && want51) {
        score += 3;
      }
      if (score > bestScore) {
        bestScore = score;
        best = t;
      } else if (score === bestScore && best !== null && score > 0) {
        // 平分：偏好关键词更多的更具体模板
        if (t.keywords.length > best.keywords.length) {
          best = t;
        }
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
