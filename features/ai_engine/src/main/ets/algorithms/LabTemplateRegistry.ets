/**
 * 实验模板注册表 — 可扩展、全器件覆盖检测
 */
import { SchematicDocument } from 'common';
import {
  buildLabPower, buildLabAmp, buildLabFilter, buildLab51Led, buildLabUart,
  buildLabPassive, buildLabDiscrete, buildLabAnalogIc, buildLabDigital,
  buildLabMemory, buildLabMcu8051, buildLabMcuStm32, buildLabPeripheral,
  buildLabSensor, buildLabInstruments, buildLabPotentiometer
} from './LabTemplateBuilders';
import { TemplateSchematicKit } from './TemplateSchematicKit';

export type LabTemplateBuilder = (doc: SchematicDocument) => void;

export interface LabCoverageReport {
  covered: string[];
  missing: string[];
  total: number;
  percent: number;
}

export interface LabTemplateDef {
  id: string;
  name: string;
  category: string;
  description: string;
  knowledgePoints: string[];
  /** 本模板使用的 libraryId 列表（用于覆盖检测） */
  libraryIds: string[];
  /** 关联固件: '8051' | 'STM32' | undefined */
  firmware?: string;
  /** hex_files 目录下的文件名 */
  hexFile?: string;
  build: LabTemplateBuilder;
}

/** 内置器件库全部 libraryId（与 BuiltinComponents 同步） */
export const ALL_CATALOG_LIBRARY_IDS: string[] = [
  'VCC', 'GND', 'VAC',
  'R_10', 'R_100', 'R_330', 'R_1k', 'R_4.7k', 'R_10k', 'R_47k', 'R_100k',
  'POT_1k', 'POT_10k', 'POT_100k',
  'C_10pF', 'C_100pF', 'C_1nF', 'C_10nF', 'C_100nF', 'C_1uF', 'C_10uF', 'C_100uF',
  'L_10uH', 'XTAL_11M', 'XTAL_8M', 'FUSE_1A',
  '1N4148', '1N4007', '1N5819', 'LED_RED', 'LED_GREEN', 'LED_BLUE',
  '2N2222', '2N2907', '2N7000', 'IRF540',
  'UA741', 'LM358', 'TL082', 'LM555', 'LM7805', 'LM7812', 'AMS1117_3V3', 'LM2596',
  '74HC00', '74HC02', '74HC04', '74HC08', '74HC32', '74HC74', 'CD4017',
  '2764', '62256', '24C02', 'W25Q64',
  'AT89C51', 'AT89C52', 'STC89C52', 'STC15W408AS',
  'STM32F103C8', 'STM32F103RC', 'STM32F407VG', 'STM32L431CB', 'STM32F030F4',
  'SW_PUSH', 'RELAY_SPDT', 'BUZZER', 'LCD1602', 'OLED_12864',
  'DS18B20', 'HALL_SENSOR', 'LDR',
  'OSCILLOSCOPE', 'VIRTUAL_METER', 'VOLTMETER_DC', 'AMMETER_DC',
  'POWER_METER', 'FREQ_COUNTER', 'LOGIC_ANALYZER', 'UART_TERMINAL'
];

const POWER_LIBS = ['VCC', 'GND', 'VAC', 'FUSE_1A', 'LM7805', 'LM7812', 'AMS1117_3V3', 'LM2596',
  'C_100uF', 'C_10uF', 'C_100nF', 'R_10k', 'VOLTMETER_DC'];
const ANALOG_LIBS = ['LM358', 'R_10k', 'R_100k', 'R_1k', 'C_100nF', 'VCC', 'GND', 'VOLTMETER_DC'];
const MCU51_LIBS = ['AT89C51', 'XTAL_11M', 'C_100nF', 'R_10k', 'R_330', 'LED_RED', 'LED_GREEN',
  'VCC', 'GND', 'VOLTMETER_DC'];
const MCU_UART_LIBS = ['STM32F103C8', 'XTAL_8M', 'C_100nF', 'R_10k', 'R_1k', 'LED_GREEN',
  'UART_TERMINAL', 'VCC', 'GND', 'VOLTMETER_DC'];
const PASSIVE_LIBS = ['VCC', 'GND', 'VAC', 'FUSE_1A', 'R_10', 'R_100', 'R_330', 'R_1k', 'R_4.7k',
  'R_10k', 'R_47k', 'R_100k', 'C_10pF', 'C_100pF', 'C_1nF', 'C_10nF', 'C_100nF', 'C_1uF',
  'C_10uF', 'C_100uF', 'L_10uH', 'AMMETER_DC'];
const DISCRETE_LIBS = ['VCC', 'GND', '1N4148', '1N4007', '1N5819', 'LED_RED', 'LED_GREEN', 'LED_BLUE',
  'R_330', 'R_1k', 'R_10k', '2N2222', '2N2907', '2N7000', 'IRF540'];
const ANALOG_IC_LIBS = ['VCC', 'GND', 'UA741', 'LM358', 'TL082', 'LM555', 'LM7805', 'LM7812', 'AMS1117_3V3',
  'LM2596', 'R_10k', 'R_47k', 'R_1k', 'C_10uF', 'C_100nF', 'LED_RED', 'R_330'];
const DIGITAL_LIBS = ['VCC', 'GND', '74HC00', '74HC02', '74HC04', '74HC08', '74HC32', '74HC74',
  'CD4017', 'LOGIC_ANALYZER'];
const MEMORY_LIBS = ['STM32F103RC', '2764', '62256', '24C02', 'W25Q64', 'VCC', 'GND',
  'C_100nF', 'R_10k'];
const MCU8051_ALL = ['AT89C51', 'AT89C52', 'STC89C52', 'STC15W408AS', 'XTAL_11M', 'XTAL_8M',
  'C_100nF', 'R_10k', 'VCC', 'GND'];
const MCU_STM32_ALL = ['STM32F103C8', 'STM32F103RC', 'STM32F407VG', 'STM32L431CB', 'STM32F030F4',
  'XTAL_8M', 'C_100nF', 'C_10uF', 'R_10k', 'VCC', 'GND'];
const PERIPH_LIBS = ['STM32F103C8', 'SW_PUSH', 'RELAY_SPDT', 'BUZZER', 'LCD1602', 'OLED_12864',
  'LED_RED', 'LED_GREEN', 'R_10k', 'R_330', 'R_4.7k', 'C_100nF', 'XTAL_8M', 'VCC', 'GND'];
const SENSOR_LIBS = ['STM32F103C8', 'DS18B20', 'HALL_SENSOR', 'LDR', 'POT_10k', 'R_4.7k', 'R_10k',
  'C_100nF', 'VCC', 'GND', 'VOLTMETER_DC'];
const INSTRUMENT_LIBS = ['VCC', 'GND', 'R_10k', 'POT_10k', 'VOLTMETER_DC', 'AMMETER_DC', 'VIRTUAL_METER',
  'POWER_METER', 'FREQ_COUNTER', 'OSCILLOSCOPE'];
const POT_LIBS = ['VCC', 'GND', 'POT_1k', 'POT_10k', 'POT_100k', 'VOLTMETER_DC'];

export class LabTemplateRegistry {
  private static extraTemplates: LabTemplateDef[] = [];

  private static readonly BUILTIN: LabTemplateDef[] = [
    {
      id: 'lab_power', name: '直流电源电路', category: 'power',
      description: 'LM7805 稳压电源 + 滤波 + 负载测量',
      knowledgePoints: ['稳压原理', '滤波电容', '熔断保护'],
      libraryIds: POWER_LIBS, build: buildLabPower
    },
    {
      id: 'lab_amp', name: '运算放大电路', category: 'analog',
      description: 'LM358 同相放大器（可 MNA 仿真）',
      knowledgePoints: ['虚短虚断', '增益计算'],
      libraryIds: ANALOG_LIBS, build: buildLabAmp
    },
    {
      id: 'lab_filter', name: 'RC滤波电路', category: 'analog',
      description: 'RC 低通 + LM358 缓冲输出',
      knowledgePoints: ['截止频率', '缓冲跟随'],
      libraryIds: ANALOG_LIBS, build: buildLabFilter
    },
    {
      id: 'lab_51_led', name: '51流水灯', category: 'mcu',
      description: 'AT89C51 流水灯 + 晶振复位；需烧录 lab_51_led.hex',
      knowledgePoints: ['IO口', '定时器', '限流电阻'],
      libraryIds: MCU51_LIBS, firmware: '8051', hexFile: 'lab_51_led.hex', build: buildLab51Led
    },
    {
      id: 'lab_uart', name: '串口通信', category: 'mcu',
      description: 'STM32F103 UART + 终端；需烧录 lab_uart.hex',
      knowledgePoints: ['波特率', '帧格式', 'TX/RX 交叉'],
      libraryIds: MCU_UART_LIBS, firmware: 'STM32', hexFile: 'lab_uart.hex', build: buildLabUart
    },
    {
      id: 'lab_passive', name: '无源器件检测', category: 'passive',
      description: '全部电阻/电容/电感/LC/交流源',
      knowledgePoints: ['分压', '去耦', 'LC谐振'],
      libraryIds: PASSIVE_LIBS, build: buildLabPassive
    },
    {
      id: 'lab_discrete', name: '分立器件检测', category: 'discrete',
      description: '二极管/LED/三极管/MOSFET 典型接法',
      knowledgePoints: ['整流', '开关', '限流'],
      libraryIds: DISCRETE_LIBS, build: buildLabDiscrete
    },
    {
      id: 'lab_analog_ic', name: '模拟IC检测', category: 'analog',
      description: '运放 + LM555 无稳态 + 全部稳压/开关电源 IC',
      knowledgePoints: ['运放', '555振荡', 'LDO', 'Buck'],
      libraryIds: ANALOG_IC_LIBS, build: buildLabAnalogIc
    },
    {
      id: 'lab_digital', name: '数字逻辑检测', category: 'digital',
      description: '全部 74HC 逻辑门 + CD4017 + 逻辑分析仪',
      knowledgePoints: ['门电路', '计数器', '逻辑分析'],
      libraryIds: DIGITAL_LIBS, build: buildLabDigital
    },
    {
      id: 'lab_memory', name: '存储器接口', category: 'memory',
      description: 'EPROM/SRAM/EEPROM/Flash 与 MCU 连接',
      knowledgePoints: ['并行总线', 'I2C', 'SPI'],
      libraryIds: MEMORY_LIBS, build: buildLabMemory
    },
    {
      id: 'lab_mcu_8051', name: '8051全系列', category: 'mcu',
      description: 'AT89/STC 四款 MCU 最小系统；需烧录 lab_mcu_8051.hex',
      knowledgePoints: ['最小系统', '晶振', '复位'],
      libraryIds: MCU8051_ALL, firmware: '8051', hexFile: 'lab_mcu_8051.hex', build: buildLabMcu8051
    },
    {
      id: 'lab_mcu_stm32', name: 'STM32全系列', category: 'mcu',
      description: '五款 STM32 最小系统并排；需烧录 lab_mcu_stm32.hex',
      knowledgePoints: ['Cortex-M', 'HSE', 'NRST'],
      libraryIds: MCU_STM32_ALL, firmware: 'STM32', hexFile: 'lab_mcu_stm32.hex', build: buildLabMcuStm32
    },
    {
      id: 'lab_peripheral', name: '外设接口实验', category: 'peripheral',
      description: '按键/继电器触点指示/蜂鸣器/LCD/OLED；需烧录 lab_peripheral.hex',
      knowledgePoints: ['GPIO', '继电器触点', '人机交互', '显示'],
      libraryIds: PERIPH_LIBS, firmware: 'STM32', hexFile: 'lab_peripheral.hex',
      build: buildLabPeripheral
    },
    {
      id: 'lab_sensor', name: '传感器实验', category: 'sensor',
      description: 'DS18B20/霍尔/光敏 接入 MCU',
      knowledgePoints: ['1-Wire', '数字输入', 'ADC'],
      libraryIds: SENSOR_LIBS, build: buildLabSensor
    },
    {
      id: 'lab_instruments', name: '仪器仪表检测', category: 'instrument',
      description: '全部虚拟仪器接入分压测试点',
      knowledgePoints: ['电压表', '电流表', '示波器'],
      libraryIds: INSTRUMENT_LIBS, build: buildLabInstruments
    },
    {
      id: 'lab_potentiometer', name: '滑动变阻器实验', category: 'passive',
      description: 'POT_1k/10k/100k 三档分压 + 电压表',
      knowledgePoints: ['分压比', '滑臂调节', '线性电位器'],
      libraryIds: POT_LIBS, build: buildLabPotentiometer
    }
  ];

  static listTemplates(): LabTemplateDef[] {
    return LabTemplateRegistry.BUILTIN.concat(LabTemplateRegistry.extraTemplates);
  }

  static findById(id: string): LabTemplateDef | undefined {
    return LabTemplateRegistry.listTemplates().find(t => t.id === id);
  }

  /** 运行时注册新实验模板 */
  static registerTemplate(def: LabTemplateDef): void {
    const idx = LabTemplateRegistry.extraTemplates.findIndex(t => t.id === def.id);
    if (idx >= 0) {
      LabTemplateRegistry.extraTemplates[idx] = def;
    } else {
      LabTemplateRegistry.extraTemplates.push(def);
    }
  }

  static generateById(templateId: string): SchematicDocument | null {
    const def = LabTemplateRegistry.findById(templateId);
    if (def === undefined) {
      return null;
    }
    const doc = TemplateSchematicKit.createDoc(def.name, def.description);
    def.build(doc);
    return doc;
  }

  /** 全库器件覆盖统计 */
  static getCoverageReport(): LabCoverageReport {
    const coveredSet = new Set<string>();
    for (const tpl of LabTemplateRegistry.listTemplates()) {
      for (let i = 0; i < tpl.libraryIds.length; i++) {
        coveredSet.add(tpl.libraryIds[i]);
      }
    }
    const covered: string[] = [];
    const missing: string[] = [];
    for (let i = 0; i < ALL_CATALOG_LIBRARY_IDS.length; i++) {
      const id = ALL_CATALOG_LIBRARY_IDS[i];
      if (coveredSet.has(id)) {
        covered.push(id);
      } else {
        missing.push(id);
      }
    }
    const total = ALL_CATALOG_LIBRARY_IDS.length;
    const percent = total > 0 ? Math.round(covered.length / total * 100) : 0;
    const result: LabCoverageReport = {
      covered: covered,
      missing: missing,
      total: total,
      percent: percent
    };
    return result;
  }

  static listCategories(): string[] {
    const cats = new Set<string>();
    for (const t of LabTemplateRegistry.listTemplates()) {
      cats.add(t.category);
    }
    return Array.from(cats);
  }
}
