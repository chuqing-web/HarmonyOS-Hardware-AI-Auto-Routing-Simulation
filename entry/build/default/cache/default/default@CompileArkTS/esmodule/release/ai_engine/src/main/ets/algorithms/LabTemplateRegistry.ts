import type { SchematicDocument } from 'common';
import { buildLabPower, buildLabAmp, buildLabFilter, buildLab51Led, buildLabUart, buildLabPassive, buildLabDiscrete, buildLabAnalogIc, buildLabDigital, buildLabMemory, buildLabMcu8051, buildLabMcuStm32, buildLabPeripheral, buildLabSensor, buildLabInstruments } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/LabTemplateBuilders";
import { TemplateSchematicKit } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/TemplateSchematicKit";
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
    libraryIds: string[];
    firmware?: string;
    hexFile?: string;
    build: LabTemplateBuilder;
}
export const ALL_CATALOG_LIBRARY_IDS: string[] = [
    'VCC', 'GND', 'VAC',
    'R_10', 'R_100', 'R_330', 'R_1k', 'R_4.7k', 'R_10k', 'R_47k', 'R_100k',
    'C_10pF', 'C_100pF', 'C_1nF', 'C_10nF', 'C_100nF', 'C_1uF', 'C_10uF', 'C_100uF',
    'L_10uH', 'XTAL_11M', 'XTAL_8M', 'FUSE_1A',
    '1N4148', '1N4007', '1N5819', 'LED_RED', 'LED_GREEN', 'LED_BLUE',
    '2N2222', '2N2907', '2N7000', 'IRF540',
    'UA741', 'LM358', 'TL082', 'LM7805', 'LM7812', 'AMS1117_3V3', 'LM2596',
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
const ANALOG_IC_LIBS = ['VCC', 'GND', 'UA741', 'LM358', 'TL082', 'LM7805', 'LM7812', 'AMS1117_3V3',
    'LM2596', 'R_10k', 'R_47k', 'C_10uF', 'C_100nF'];
const DIGITAL_LIBS = ['VCC', 'GND', '74HC00', '74HC02', '74HC04', '74HC08', '74HC32', '74HC74',
    'CD4017', 'LOGIC_ANALYZER'];
const MEMORY_LIBS = ['STM32F103RC', '2764', '62256', '24C02', 'W25Q64', 'VCC', 'GND',
    'C_100nF', 'R_10k'];
const MCU8051_ALL = ['AT89C51', 'AT89C52', 'STC89C52', 'STC15W408AS', 'XTAL_11M', 'XTAL_8M',
    'C_100nF', 'R_10k', 'VCC', 'GND'];
const MCU_STM32_ALL = ['STM32F103C8', 'STM32F103RC', 'STM32F407VG', 'STM32L431CB', 'STM32F030F4',
    'XTAL_8M', 'C_100nF', 'C_10uF', 'R_10k', 'VCC', 'GND'];
const PERIPH_LIBS = ['STM32F103C8', 'SW_PUSH', 'RELAY_SPDT', 'BUZZER', 'LCD1602', 'OLED_12864',
    'R_10k', 'R_330', 'C_100nF', 'VCC', 'GND'];
const SENSOR_LIBS = ['STM32F103C8', 'DS18B20', 'HALL_SENSOR', 'LDR', 'R_4.7k', 'R_10k',
    'C_100nF', 'VCC', 'GND'];
const INSTRUMENT_LIBS = ['VCC', 'GND', 'R_10k', 'VOLTMETER_DC', 'AMMETER_DC', 'VIRTUAL_METER',
    'POWER_METER', 'FREQ_COUNTER', 'OSCILLOSCOPE'];
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
            description: 'AT89C51 流水灯 + 晶振复位',
            knowledgePoints: ['IO口', '定时器', '限流电阻'],
            libraryIds: MCU51_LIBS, firmware: '8051', hexFile: 'lab_51_led.hex', build: buildLab51Led
        },
        {
            id: 'lab_uart', name: '串口通信', category: 'mcu',
            description: 'STM32F103 UART + 终端',
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
            description: '运放 + 全部稳压/开关电源 IC',
            knowledgePoints: ['运放', 'LDO', 'Buck'],
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
            description: 'AT89/STC 四款 MCU 最小系统',
            knowledgePoints: ['最小系统', '晶振', '复位'],
            libraryIds: MCU8051_ALL, firmware: '8051', hexFile: 'lab_mcu_8051.hex', build: buildLabMcu8051
        },
        {
            id: 'lab_mcu_stm32', name: 'STM32全系列', category: 'mcu',
            description: '五款 STM32 最小系统并排',
            knowledgePoints: ['Cortex-M', 'HSE', 'NRST'],
            libraryIds: MCU_STM32_ALL, firmware: 'STM32', hexFile: 'lab_uart.hex', build: buildLabMcuStm32
        },
        {
            id: 'lab_peripheral', name: '外设接口实验', category: 'peripheral',
            description: '按键/继电器/蜂鸣器/LCD/OLED',
            knowledgePoints: ['GPIO', '人机交互', '显示'],
            libraryIds: PERIPH_LIBS, build: buildLabPeripheral
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
        }
    ];
    static listTemplates(): LabTemplateDef[] {
        return LabTemplateRegistry.BUILTIN.concat(LabTemplateRegistry.extraTemplates);
    }
    static findById(p293: string): LabTemplateDef | undefined {
        return LabTemplateRegistry.listTemplates().find(q293 => q293.id === p293);
    }
    static registerTemplate(m293: LabTemplateDef): void {
        const n293 = LabTemplateRegistry.extraTemplates.findIndex(o293 => o293.id === m293.id);
        if (n293 >= 0) {
            LabTemplateRegistry.extraTemplates[n293] = m293;
        }
        else {
            LabTemplateRegistry.extraTemplates.push(m293);
        }
    }
    static generateById(j293: string): SchematicDocument | null {
        const k293 = LabTemplateRegistry.findById(j293);
        if (k293 === undefined) {
            return null;
        }
        const l293 = TemplateSchematicKit.createDoc(k293.name, k293.description);
        k293.build(l293);
        return l293;
    }
    static getCoverageReport(): LabCoverageReport {
        const z292 = new Set<string>();
        for (const h293 of LabTemplateRegistry.listTemplates()) {
            for (let i293 = 0; i293 < h293.libraryIds.length; i293++) {
                z292.add(h293.libraryIds[i293]);
            }
        }
        const a293: string[] = [];
        const b293: string[] = [];
        for (let f293 = 0; f293 < ALL_CATALOG_LIBRARY_IDS.length; f293++) {
            const g293 = ALL_CATALOG_LIBRARY_IDS[f293];
            if (z292.has(g293)) {
                a293.push(g293);
            }
            else {
                b293.push(g293);
            }
        }
        const c293 = ALL_CATALOG_LIBRARY_IDS.length;
        const d293 = c293 > 0 ? Math.round(a293.length / c293 * 100) : 0;
        const e293: LabCoverageReport = {
            covered: a293,
            missing: b293,
            total: c293,
            percent: d293
        };
        return e293;
    }
    static listCategories(): string[] {
        const x292 = new Set<string>();
        for (const y292 of LabTemplateRegistry.listTemplates()) {
            x292.add(y292.category);
        }
        return Array.from(x292);
    }
}
