/**
 * 实验模板注册表 — 可扩展、全器件覆盖检测
 */
import { SchematicDocument } from 'common';
import {
  buildLabPower, buildLabAmp, buildLabFilter, buildLab51Led, buildLabUart,
  buildLabPassive, buildLabDiscrete, buildLabAnalogIc, buildLabDigital,
  buildLabMemory, buildLabMcu8051, buildLabMcuStm32, buildLabPeripheral,
  buildLabSensor, buildLabInstruments, buildLabPotentiometer,
  buildLabSchmitt, buildLabIntegrator, buildLab555Astable, buildLab555Monostable
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
  'VCC', 'GND', 'VEE', 'VAC', 'SIGNAL_GEN',
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
const DIGITAL_LIBS = ['VCC', 'GND', 'SIGNAL_GEN', '74HC00', '74HC02', '74HC04', '74HC08', '74HC32', '74HC74',
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
  'R_330', 'C_100nF', 'XTAL_8M', 'VCC', 'GND', 'VOLTMETER_DC', 'LED_RED', 'LED_GREEN', 'LED_BLUE'];
const INSTRUMENT_LIBS = ['VCC', 'GND', 'R_10k', 'R_1k', 'R_330', 'POT_10k', 'SIGNAL_GEN', 'CD4017',
  'LED_RED', '1N4148', 'VOLTMETER_DC', 'AMMETER_DC', 'VIRTUAL_METER', 'POWER_METER', 'FREQ_COUNTER',
  'OSCILLOSCOPE', 'LOGIC_ANALYZER', 'UART_TERMINAL'];
const POT_LIBS = ['VCC', 'GND', 'POT_1k', 'POT_10k', 'POT_100k', 'VOLTMETER_DC'];
const SCHMITT_LIBS = ['VCC', 'VEE', 'GND', 'UA741', 'R_100k', 'R_10k', 'SIGNAL_GEN', 'OSCILLOSCOPE'];
const INTEGRATOR_LIBS = ['VCC', 'VEE', 'GND', 'UA741', 'R_10k', 'R_100k', 'C_100nF', 'SIGNAL_GEN',
  'OSCILLOSCOPE'];
const ASTABLE_555_LIBS = ['VCC', 'GND', 'LM555', 'R_1k', 'R_10k', 'R_330', 'C_1uF', 'C_100nF',
  'LED_RED', 'OSCILLOSCOPE'];
const MONOSTABLE_555_LIBS = ['VCC', 'GND', 'LM555', 'SW_PUSH', 'R_100k', 'R_10k', 'R_330',
  'C_10uF', 'C_100nF', 'LED_RED'];

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
      description: '74HC 门真值(平线) + 10Hz 脉冲时钟驱动 CD4017 + LA(CH8=CLK)',
      knowledgePoints: ['门电路', '计数器', '逻辑分析'],
      libraryIds: DIGITAL_LIBS, build: buildLabDigital
    },
    {
      id: 'lab_memory', name: '存储器接口', category: 'memory',
      description: 'I2C EEPROM + SPI Flash + 并行 EPROM/SRAM；LA 看总线；需烧录 lab_memory.hex',
      knowledgePoints: [
        '①插入模板并确认预装 lab_memory.hex',
        '②启动仿真 → 打开逻辑分析仪',
        '③CH1/2=I2C SCL/SDA 周期位带；CH3–5=SPI SCK/CS/MOSI；CH6/7=CE 脉冲；CH8=A0',
        '④拓扑：I2C≠OSC；VCC=5V；无 PIN_CONFLICT'
      ],
      libraryIds: MEMORY_LIBS, firmware: 'STM32', hexFile: 'lab_memory.hex',
      build: buildLabMemory
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
      description: 'DS18B20 拖温 / 霍尔点击 / 电位器 ADC → 三色指示灯；需烧录 lab_sensor.hex',
      knowledgePoints: [
        '①插入模板并确认预装 lab_sensor.hex',
        '②仿真后拖 T1 滑条：温度↑ → M2 电压↑ → D_TEMP(蓝)亮',
        '③点击 H1：磁场 ON → HALL 拉低 → D_HALL(红)亮',
        '④拖 RV1：ADC 电压过阈 → D_ADC(绿)亮'
      ],
      libraryIds: SENSOR_LIBS, firmware: 'STM32', hexFile: 'lab_sensor.hex',
      build: buildLabSensor
    },
    {
      id: 'lab_instruments', name: '仪器仪表检测', category: 'instrument',
      description: '全套虚拟仪器 + 四端万用表五档(DCV/ACV/Ω/AMP/二极管)',
      knowledgePoints: ['电压表', '电流表', '功率表串联', '万用表DCV', '万用表ACV',
        '万用表电阻', '万用表电流', '二极管档', '信号发生器', '频率计',
        '示波器多通道', '逻辑分析仪', 'UART 环回'],
      libraryIds: INSTRUMENT_LIBS, build: buildLabInstruments
    },
    {
      id: 'lab_potentiometer', name: '滑动变阻器实验', category: 'passive',
      description: 'POT_1k/10k/100k 三档分压 + 电压表',
      knowledgePoints: ['分压比', '滑臂调节', '线性电位器'],
      libraryIds: POT_LIBS, build: buildLabPotentiometer
    },
    {
      id: 'lab_schmitt', name: '运放滞回比较器整形', category: 'analog',
      description: 'UA741 正反馈滞回 + 正弦激励，示波器观测整形方波',
      knowledgePoints: ['滞回比较器', '正反馈', '正弦整形方波', '双电源'],
      libraryIds: SCHMITT_LIBS, build: buildLabSchmitt
    },
    {
      id: 'lab_integrator', name: 'RC积分电路', category: 'analog',
      description: 'UA741 反相积分 + 方波激励，示波器观测三角波',
      knowledgePoints: ['反相积分', 'RC 时间常数', '方波变三角', '双电源'],
      libraryIds: INTEGRATOR_LIBS, build: buildLabIntegrator
    },
    {
      id: 'lab_555_astable', name: '555多谐振荡器', category: 'analog',
      description: 'LM555 无稳态振荡(~69Hz) + LED，示波器 10ms/div 观测方波',
      knowledgePoints: ['多谐振荡', 'RC 定时', '方波输出', 'LED 限流'],
      libraryIds: ASTABLE_555_LIBS, build: buildLab555Astable
    },
    {
      id: 'lab_555_monostable', name: '555单稳态延时', category: 'analog',
      description: 'LM555(NE555同类) 单稳态 + 按键触发 + RC(~1.1s) + LED 延时熄灭',
      knowledgePoints: [
        '①单稳态：按下 SW1 拉低 TRIG → OUT 高 → LED 亮',
        '②延时 t≈1.1·RT·CT≈1.1s（RT=100k CT=10µF）后 OUT 低 → LED 熄灭',
        '③THRES≡DISCH≡定时 RC 节点；TRIG 经 RP 上拉，禁止与 THRES 并网',
        '④库内型号用 LM555（NE555 同类）'
      ],
      libraryIds: MONOSTABLE_555_LIBS, build: buildLab555Monostable
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
