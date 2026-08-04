#!/usr/bin/env node
/**
 * 从 Test_Template/lab_*.schsim 生成对应完整成品 PCB（lab_*.pcbsim）
 * - 铜层：自动推断 2/4/6/8，可用 pcbCopperCount 覆盖
 * - 板框：按内容自适应，可用 pcbBoardWidth / pcbBoardHeight（mil）放大
 * 用法: node tools/pcb_templates/export.mjs
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT_DIRS = [
  join(ROOT, 'Test_Template'),
  join(ROOT, 'entry', 'src', 'main', 'resources', 'rawfile', 'Test_Template')
];

let seq = 0;
function uid(prefix) {
  seq++;
  return `${prefix}_${Date.now()}_${seq}`;
}

/** 2/3 脚无源/分立：符号脚名 → 焊盘号（勿用于多脚 IC） */
const PIN_LABEL_TO_PAD = new Map([
  ['A', '1'], ['ANODE', '1'], ['C', '1'], ['IN', '1'], ['+', '1'],
  ['V+', '1'], ['I+', '1'], ['VP', '1'],
  ['K', '2'], ['CATHODE', '2'], ['E', '2'], ['GND', '2'], ['-', '2'],
  ['COM', '2'], ['I-', '2'], ['V-', '2'],
  ['B', '3'], ['OUT', '3'], ['G', '3']
]);

/**
 * 双运放 SOIC-8 / DIP-8（LM358 等）标准脚位：
 * 1 OUT1  2 IN-1  3 IN+1  4 V-  5 IN+2  6 IN-2  7 OUT2  8 V+
 * 若误用上面的 V+→1/V-→2，会把电源焊到错误脚并导致信号脚全浮空。
 */
const DUAL_OPAMP_PIN_TO_PAD = new Map([
  ['OUT1', '1'], ['IN-1', '2'], ['IN+1', '3'], ['V-', '4'], ['VEE', '4'],
  ['IN+2', '5'], ['IN-2', '6'], ['OUT2', '7'], ['V+', '8'], ['VCC', '8']
]);

/** 单运放 UA741 / LM741：1 NULL  2 IN-  3 IN+  4 V-  5 NULL  6 OUT  7 V+  8 NC */
const UA741_PIN_TO_PAD = new Map([
  ['OFFSET1', '1'], ['NULL1', '1'], ['NULL', '1'],
  ['IN-', '2'], ['IN+', '3'],
  ['V-', '4'], ['VEE', '4'],
  ['OFFSET2', '5'], ['NULL2', '5'],
  ['OUT', '6'],
  ['V+', '7'], ['VCC', '7'],
  ['NC', '8']
]);

/** NE555 / LM555：1 GND  2 TRIG  3 OUT  4 RESET  5 CTRL  6 THRES  7 DISCH  8 VCC */
const LM555_PIN_TO_PAD = new Map([
  ['GND', '1'], ['VSS', '1'],
  ['TRIG', '2'], ['TRIGGER', '2'],
  ['OUT', '3'], ['OUTPUT', '3'],
  ['RESET', '4'], ['RST', '4'],
  ['CTRL', '5'], ['CONTROL', '5'], ['CV', '5'],
  ['THRES', '6'], ['THRESHOLD', '6'],
  ['DISCH', '7'], ['DISCHARGE', '7'],
  ['VCC', '8'], ['VDD', '8']
]);

function isUa741Lib(libDevId) {
  const lib = (libDevId || '').toLowerCase();
  return lib.includes('ua741') || lib.includes('lm741') || lib === '741';
}

function isLm555Lib(libDevId) {
  const lib = (libDevId || '').toLowerCase();
  return lib.includes('555') || lib.includes('ne555') || lib.includes('lm555') || lib.includes('e555');
}

function isDualOpAmpLib(libDevId) {
  const lib = (libDevId || '').toLowerCase();
  if (isUa741Lib(libDevId)) return false;
  return lib.includes('lm358') || lib.includes('tl082') || lib.includes('lm324') ||
    lib.includes('ne5532') || lib.includes('opamp');
}

/**
 * AT89C51 / 8051 DIP-40 符号脚名 → 焊盘号
 * 1-8=P1.0-P1.7  9=RST  18=XTAL2  19=XTAL1  20=GND  31=EA  40=VCC
 */
const MCU51_PIN_TO_PAD = new Map([
  ['P1.0', '1'], ['P1.1', '2'], ['P1.2', '3'], ['P1.3', '4'],
  ['P1.4', '5'], ['P1.5', '6'], ['P1.6', '7'], ['P1.7', '8'],
  ['RST', '9'], ['RESET', '9'], ['NRST', '9'],
  ['RXD', '10'], ['P3.0', '10'], ['TXD', '11'], ['P3.1', '11'],
  ['INT0', '12'], ['P3.2', '12'], ['INT1', '13'], ['P3.3', '13'],
  ['T0', '14'], ['P3.4', '14'], ['T1', '15'], ['P3.5', '15'],
  ['WR', '16'], ['P3.6', '16'], ['RD', '17'], ['P3.7', '17'],
  ['XTAL2', '18'], ['XTAL1', '19'],
  ['GND', '20'], ['VSS', '20'],
  ['P2.0', '21'], ['P2.1', '22'], ['P2.2', '23'], ['P2.3', '24'],
  ['P2.4', '25'], ['P2.5', '26'], ['P2.6', '27'], ['P2.7', '28'],
  ['PSEN', '29'], ['ALE', '30'], ['EA', '31'], ['EA/VPP', '31'],
  ['P0.7', '32'], ['P0.6', '33'], ['P0.5', '34'], ['P0.4', '35'],
  ['P0.3', '36'], ['P0.2', '37'], ['P0.1', '38'], ['P0.0', '39'],
  ['VCC', '40'], ['VDD', '40']
]);

function isMcu51Lib(libDevId) {
  const lib = (libDevId || '').toLowerCase();
  return lib.includes('at89') || lib.includes('at89c51') || lib.includes('8051') ||
    lib.includes('stc89') || lib.includes('stc90') || lib.includes('stc15') ||
    lib === 'mcs51';
}

function isMcuStm32F103C8Lib(libDevId) {
  const lib = (libDevId || '').toLowerCase();
  return lib.includes('stm32f103c8') || lib === 'stm32f103c8tx';
}
function isMcuStm32F103RCLib(libDevId) {
  return (libDevId || '').toLowerCase().includes('stm32f103rc');
}
function isMcuStm32F407Lib(libDevId) {
  return (libDevId || '').toLowerCase().includes('stm32f407');
}
function isMcuStm32Tssop20Lib(libDevId) {
  const lib = (libDevId || '').toLowerCase();
  return lib.includes('stm32f030') || lib.includes('stm32l431');
}

/** STM32F103C8 教学 LQFP-48：符号脚名 → 焊盘号 */
const STM32F103C8_PIN_TO_PAD = new Map([
  ['OSC_IN', '5'], ['PD0', '5'],
  ['OSC_OUT', '6'], ['PD1', '6'],
  ['NRST', '7'], ['RESET', '7'],
  ['VSSA', '8'],
  ['VDDA', '9'],
  ['PA0', '10'], ['PA1', '11'], ['PA2', '12'], ['PA3', '13'],
  ['PA4', '14'], ['PA5', '15'], ['PA6', '16'], ['PA7', '17'],
  ['PB0', '18'], ['PB1', '19'], ['PB2', '20'],
  ['PB10', '21'], ['PB11', '22'],
  ['VSS', '23'], ['VSS_1', '23'], ['VSS_2', '35'], ['VSS_3', '47'],
  ['VDD', '24'], ['VDD_1', '24'], ['VDD_2', '36'], ['VDD_3', '48'],
  ['PB12', '25'], ['PB13', '26'], ['PB14', '27'], ['PB15', '28'],
  ['PA8', '29'], ['PA9', '30'], ['PA10', '31'], ['PA11', '32'],
  ['PA12', '33'], ['PA13', '34'], ['PA14', '37'], ['PA15', '38'],
  ['PB3', '39'], ['PB4', '40'], ['PB5', '41'],
  ['PB6', '42'], ['PB7', '43'], ['PB8', '45'], ['PB9', '46'],
  ['USART1_TX', '30'], ['USART1_RX', '31'],
  ['PC0', '10'], ['PC1', '11'], ['PC2', '12'], ['PC3', '13'],
  ['PC4', '18'], ['PC5', '19'], ['PC6', '20'], ['PC7', '39']
]);

/** LCD1602 单排 16 脚 */
const LCD1602_PIN_TO_PAD = new Map([
  ['VSS', '1'], ['GND', '1'],
  ['VDD', '2'], ['VCC', '2'],
  ['V0', '3'], ['VO', '3'], ['VEE', '3'],
  ['RS', '4'], ['RW', '5'], ['E', '6'], ['EN', '6'],
  ['D0', '7'], ['D1', '8'], ['D2', '9'], ['D3', '10'],
  ['D4', '11'], ['D5', '12'], ['D6', '13'], ['D7', '14'],
  ['A', '15'], ['LED+', '15'], ['BLA', '15'],
  ['K', '16'], ['LED-', '16'], ['BLK', '16']
]);

/** OLED 12864 I2C 4 脚：VCC/GND/SDA/SCL */
const OLED_PIN_TO_PAD = new Map([
  ['VCC', '1'], ['VDD', '1'],
  ['GND', '2'], ['VSS', '2'],
  ['SDA', '3'], ['SCL', '4']
]);

/** 继电器 SPDT：线圈 1/2 + COM/NO/NC */
const RELAY_SPDT_PIN_TO_PAD = new Map([
  ['1', '1'], ['2', '2'],
  ['COM', '3'], ['NO', '4'], ['NC', '5']
]);

/** DS18B20 TO-92：1=GND 2=DQ 3=VDD */
const DS18B20_PIN_TO_PAD = new Map([
  ['GND', '1'], ['DQ', '2'], ['VDD', '3'], ['VCC', '3']
]);

/** 霍尔开关 TO-92：1=VCC 2=OUT 3=GND */
const HALL_PIN_TO_PAD = new Map([
  ['VCC', '1'], ['VDD', '1'], ['OUT', '2'], ['GND', '3']
]);

/** 电位器 3 脚：1=端 A  2=W  3=端 B（原理图脚 2 为地端） */
const POT3_PIN_TO_PAD = new Map([
  ['1', '1'], ['W', '2'], ['WIPER', '2'], ['2', '3'], ['3', '3']
]);

/** CD4017 DIP-16 标准脚位 */
const CD4017_PIN_TO_PAD = new Map([
  ['Q5', '1'], ['Q1', '2'], ['Q0', '3'], ['Q2', '4'],
  ['Q6', '5'], ['Q7', '6'], ['Q3', '7'], ['VSS', '8'], ['GND', '8'],
  ['Q8', '9'], ['Q4', '10'], ['Q9', '11'], ['CO', '12'],
  ['CLK', '13'], ['EN', '14'], ['RST', '15'], ['VDD', '16'], ['VCC', '16']
]);

/** 仪器仪表探针排针脚位（与 lab_instruments 手布一致） */
const SIGNAL_GEN_PIN_TO_PAD = new Map([['OUT', '1'], ['GND', '2']]);
const AMMETER_PIN_TO_PAD = new Map([['I+', '1'], ['I-', '2']]);
const POWER_METER_PIN_TO_PAD = new Map([
  ['I+', '1'], ['I-', '2'], ['V+', '3'], ['V-', '4'], ['GND', '4']
]);
const VOLTMETER_PIN_TO_PAD = new Map([['V+', '1'], ['COM', '2'], ['GND', '2']]);
const VIRTUAL_METER_PIN_TO_PAD = new Map([
  ['V', '1'], ['A', '2'], ['OHM', '3'], ['COM', '4'], ['GND', '4']
]);
const FREQ_COUNTER_PIN_TO_PAD = new Map([['IN', '1'], ['GND', '2']]);
const OSCILLOSCOPE_PIN_TO_PAD = new Map([
  ['CH1', '1'], ['CH2', '2'], ['CH3', '3'], ['CH4', '4'], ['GND', '5']
]);
const LOGIC_ANALYZER_PIN_TO_PAD = new Map([
  ['CH1', '1'], ['CH2', '2'], ['CH3', '3'], ['CH4', '4'],
  ['CH5', '5'], ['CH6', '6'], ['CH7', '7'], ['CH8', '8'], ['GND', '9']
]);
const UART_TERMINAL_PIN_TO_PAD = new Map([
  ['TX', '1'], ['RX', '2'], ['GND', '3']
]);

function instrumentPinMap(libDevId) {
  const lib = (libDevId || '').toLowerCase();
  if (lib.includes('signal_gen')) return SIGNAL_GEN_PIN_TO_PAD;
  if (lib.includes('ammeter')) return AMMETER_PIN_TO_PAD;
  if (lib.includes('power_meter')) return POWER_METER_PIN_TO_PAD;
  if (lib.includes('voltmeter')) return VOLTMETER_PIN_TO_PAD;
  if (lib.includes('virtual_meter')) return VIRTUAL_METER_PIN_TO_PAD;
  if (lib.includes('freq_counter')) return FREQ_COUNTER_PIN_TO_PAD;
  if (lib.includes('oscilloscope')) return OSCILLOSCOPE_PIN_TO_PAD;
  if (lib.includes('logic_analyzer')) return LOGIC_ANALYZER_PIN_TO_PAD;
  if (lib.includes('uart_terminal')) return UART_TERMINAL_PIN_TO_PAD;
  return null;
}

/** STM32F103RC 教学 LQFP-64（关键电源/晶振/PA0） */
const STM32F103RC_PIN_TO_PAD = new Map([
  ['OSC_IN', '5'], ['PD0', '5'],
  ['OSC_OUT', '6'], ['PD1', '6'],
  ['NRST', '7'], ['RESET', '7'],
  ['VSSA', '12'], ['VDDA', '13'],
  ['PA0', '14'], ['PA1', '15'], ['PA2', '16'], ['PA3', '17'],
  ['VSS', '22'], ['VSS_1', '22'], ['VDD', '23'], ['VDD_1', '23']
]);

/** STM32F407VG 教学 LQFP-100（关键电源/晶振/PA0） */
const STM32F407_PIN_TO_PAD = new Map([
  ['OSC_IN', '12'], ['PH0', '12'],
  ['OSC_OUT', '13'], ['PH1', '13'],
  ['NRST', '14'], ['RESET', '14'],
  ['VSS', '18'], ['VSS_1', '18'], ['VDD', '19'], ['VDD_1', '19'],
  ['PA0', '23'], ['PA1', '24'], ['PA2', '25']
]);

/** STM32F030F4 / L431CB 教学 TSSOP-20 */
const STM32_TSSOP20_PIN_TO_PAD = new Map([
  ['BOOT0', '1'],
  ['OSC_IN', '2'], ['PF0', '2'],
  ['OSC_OUT', '3'], ['PF1', '3'],
  ['NRST', '4'], ['RESET', '4'],
  ['VDDA', '5'],
  ['PA0', '6'], ['PA1', '7'], ['PA2', '8'], ['PA3', '9'],
  ['VSS', '15'], ['VDD', '16']
]);

/** 24C02 SOIC-8 */
const MEM24C02_PIN_TO_PAD = new Map([
  ['A0', '1'], ['A1', '2'], ['A2', '3'], ['VSS', '4'], ['GND', '4'],
  ['SDA', '5'], ['SCL', '6'], ['WP', '7'], ['VCC', '8'], ['VDD', '8']
]);
/** W25Q64 SOIC-8 */
const W25Q64_PIN_TO_PAD = new Map([
  ['CS', '1'], ['/CS', '1'], ['DO', '2'], ['MISO', '2'],
  ['WP', '3'], ['/WP', '3'], ['GND', '4'], ['VSS', '4'],
  ['DI', '5'], ['MOSI', '5'], ['CLK', '6'], ['SCK', '6'],
  ['HOLD', '7'], ['/HOLD', '7'], ['VCC', '8'], ['VDD', '8']
]);
/** 2764/62256 教学 DIP-28（与 handLayout 焊盘号一致，非 JEDEC 全脚） */
const MEM2764_PIN_TO_PAD = new Map([
  ['VPP', '1'], ['A0', '2'], ['A1', '3'], ['A2', '4'], ['A3', '5'],
  ['A4', '6'], ['A5', '7'], ['A6', '8'], ['A7', '9'],
  ['D0', '10'], ['D1', '11'], ['D2', '12'], ['D3', '13'],
  ['D4', '14'], ['D5', '15'], ['D6', '16'], ['D7', '17'],
  ['GND', '18'], ['VSS', '18'],
  ['CE', '19'], ['/CE', '19'], ['OE', '20'], ['/OE', '20'],
  ['VCC', '26'], ['VDD', '26']
]);
const MEM62256_PIN_TO_PAD = new Map([
  ['A14', '1'], ['A0', '2'], ['A1', '3'], ['A2', '4'], ['A3', '5'],
  ['A4', '6'], ['A5', '7'], ['A6', '8'], ['A7', '9'],
  ['D0', '10'], ['IO0', '10'], ['D1', '11'], ['IO1', '11'],
  ['D2', '12'], ['IO2', '12'], ['D3', '13'], ['IO3', '13'],
  ['D4', '14'], ['IO4', '14'], ['D5', '15'], ['IO5', '15'],
  ['D6', '16'], ['IO6', '16'], ['D7', '17'], ['IO7', '17'],
  ['GND', '18'], ['VSS', '18'],
  ['CE', '19'], ['/CE', '19'], ['CS', '19'], ['/CS', '19'],
  ['OE', '20'], ['/OE', '20'],
  ['WE', '27'], ['/WE', '27'],
  ['VCC', '28'], ['VDD', '28']
]);

function smdPad(num, x, y, w, h) {
  return {
    id: uid('pad'), number: String(num), type: 'smd', shape: 'rect',
    pos: { x, y }, size: { x: w, y: h },
    layers: ['F.Cu', 'F.Mask']
  };
}

function thPad(num, x, y, drill, outer) {
  return {
    id: uid('pad'), number: String(num), type: 'th', shape: 'circle',
    pos: { x, y }, size: { x: outer, y: outer }, drill,
    layers: ['F.Cu', 'B.Cu']
  };
}

function rectSilk(halfW, halfH) {
  return [[
    { x: -halfW, y: -halfH }, { x: halfW, y: -halfH },
    { x: halfW, y: halfH }, { x: -halfW, y: halfH }, { x: -halfW, y: -halfH }
  ]];
}

function def0805() {
  return {
    id: 'FP_0805', name: '0805', description: 'Metric 2012 SMD',
    pads: [smdPad('1', -45, 0, 30, 50), smdPad('2', 45, 0, 30, 50)],
    silkLines: rectSilk(50, 30),
    courtyard: [{ x: -70, y: -40 }, { x: 70, y: -40 }, { x: 70, y: 40 }, { x: -70, y: 40 }]
  };
}
function def0603() {
  return {
    id: 'FP_0603', name: '0603', description: 'Metric 1608 SMD',
    pads: [smdPad('1', -35, 0, 25, 35), smdPad('2', 35, 0, 25, 35)],
    silkLines: rectSilk(40, 22),
    courtyard: [{ x: -55, y: -30 }, { x: 55, y: -30 }, { x: 55, y: 30 }, { x: -55, y: 30 }]
  };
}
function def1206() {
  return {
    id: 'FP_1206', name: '1206', description: 'Metric 3216 SMD',
    pads: [smdPad('1', -60, 0, 40, 70), smdPad('2', 60, 0, 40, 70)],
    silkLines: rectSilk(65, 40),
    courtyard: [{ x: -85, y: -50 }, { x: 85, y: -50 }, { x: 85, y: 50 }, { x: -85, y: 50 }]
  };
}
function defSOIC8() {
  const pads = [];
  for (let i = 0; i < 4; i++) {
    pads.push(smdPad(`${i + 1}`, -60, -45 + i * 30, 25, 12));
    pads.push(smdPad(`${8 - i}`, 60, -45 + i * 30, 25, 12));
  }
  return {
    id: 'FP_SOIC8', name: 'SOIC-8', description: 'SOIC-8 150mil', pads,
    silkLines: rectSilk(55, 55),
    courtyard: [{ x: -80, y: -60 }, { x: 80, y: -60 }, { x: 80, y: 60 }, { x: -80, y: 60 }]
  };
}
function defDIP8() {
  const pads = [];
  for (let i = 0; i < 4; i++) {
    pads.push(thPad(`${i + 1}`, -100, -150 + i * 100, 35, 60));
    pads.push(thPad(`${8 - i}`, 100, -150 + i * 100, 35, 60));
  }
  return {
    id: 'FP_DIP8', name: 'DIP-8', description: 'DIP-8 300mil', pads,
    silkLines: rectSilk(120, 200),
    courtyard: [{ x: -130, y: -220 }, { x: 130, y: -220 }, { x: 130, y: 220 }, { x: -130, y: 220 }]
  };
}
/** DIP-14（300mil）：74HC 系列门电路 */
function defDIP14() {
  const pads = [];
  const pitch = 100;
  const halfRow = 150;
  const startY = -((14 / 2 - 1) * pitch) / 2;
  for (let i = 0; i < 7; i++) {
    const y = startY + i * pitch;
    pads.push(thPad(`${i + 1}`, -halfRow, y, 35, 60));
    pads.push(thPad(`${14 - i}`, halfRow, y, 35, 60));
  }
  const halfH = ((7 - 1) * pitch) / 2 + 60;
  return {
    id: 'FP_DIP14', name: 'DIP-14', description: 'DIP-14 300mil (74HC)', pads,
    silkLines: rectSilk(halfRow - 20, halfH - 20),
    courtyard: [
      { x: -halfRow - 40, y: -halfH }, { x: halfRow + 40, y: -halfH },
      { x: halfRow + 40, y: halfH }, { x: -halfRow - 40, y: halfH }
    ]
  };
}
/** DIP-16（300mil）：CD4017 */
function defDIP16() {
  const pads = [];
  const pitch = 100;
  const halfRow = 150;
  const startY = -((16 / 2 - 1) * pitch) / 2;
  for (let i = 0; i < 8; i++) {
    const y = startY + i * pitch;
    pads.push(thPad(`${i + 1}`, -halfRow, y, 35, 60));
    pads.push(thPad(`${16 - i}`, halfRow, y, 35, 60));
  }
  const halfH = ((8 - 1) * pitch) / 2 + 60;
  return {
    id: 'FP_DIP16', name: 'DIP-16', description: 'DIP-16 300mil (CD4017)', pads,
    silkLines: rectSilk(halfRow - 20, halfH - 20),
    courtyard: [
      { x: -halfRow - 40, y: -halfH }, { x: halfRow + 40, y: -halfH },
      { x: halfRow + 40, y: halfH }, { x: -halfRow - 40, y: halfH }
    ]
  };
}
/** DIP-28（600mil）：2764 / 62256 教学 */
function defDIP28() {
  const pads = [];
  const pitch = 100;
  const halfRow = 300;
  const startY = -((28 / 2 - 1) * pitch) / 2; // -650
  for (let i = 0; i < 14; i++) {
    const y = startY + i * pitch;
    pads.push(thPad(`${i + 1}`, -halfRow, y, 35, 60));
    pads.push(thPad(`${28 - i}`, halfRow, y, 35, 60));
  }
  const halfH = ((14 - 1) * pitch) / 2 + 60;
  return {
    id: 'FP_DIP28', name: 'DIP-28', description: 'DIP-28 600mil (2764/62256)', pads,
    silkLines: rectSilk(halfRow - 20, halfH - 20),
    courtyard: [
      { x: -halfRow - 40, y: -halfH }, { x: halfRow + 40, y: -halfH },
      { x: halfRow + 40, y: halfH }, { x: -halfRow - 40, y: halfH }
    ]
  };
}
/** DIP-40（600mil 宽）：AT89C51 / 8051 */
function defDIP40() {
  const pads = [];
  const pitch = 100;
  const halfRow = 300;
  const startY = -((40 / 2 - 1) * pitch) / 2; // -950
  for (let i = 0; i < 20; i++) {
    const y = startY + i * pitch;
    pads.push(thPad(`${i + 1}`, -halfRow, y, 35, 60));
    pads.push(thPad(`${40 - i}`, halfRow, y, 35, 60));
  }
  const halfH = ((20 - 1) * pitch) / 2 + 60;
  return {
    id: 'FP_DIP40', name: 'DIP-40', description: 'DIP-40 600mil', pads,
    silkLines: rectSilk(halfRow - 20, halfH - 20),
    courtyard: [
      { x: -halfRow - 40, y: -halfH }, { x: halfRow + 40, y: -halfH },
      { x: halfRow + 40, y: halfH }, { x: -halfRow - 40, y: halfH }
    ]
  };
}
/** LQFP-48（0.5mm pitch 教学简化）：STM32F103C8 */
function defQFP48() {
  const pads = [];
  const pitch = 50;
  const half = 280;
  // left 1-12, bottom 13-24, right 25-36, top 37-48
  for (let i = 0; i < 12; i++) {
    const o = -275 + i * pitch;
    pads.push(smdPad(`${i + 1}`, -half, o, 50, 14));
    pads.push(smdPad(`${13 + i}`, o, half, 50, 14));
    pads.push(smdPad(`${25 + i}`, half, -o, 50, 14));
    pads.push(smdPad(`${37 + i}`, -o, -half, 50, 14));
  }
  return {
    id: 'FP_QFP48', name: 'LQFP-48', description: 'LQFP-48 teaching (STM32F103C8)',
    pads,
    silkLines: rectSilk(240, 240),
    courtyard: [
      { x: -320, y: -320 }, { x: 320, y: -320 },
      { x: 320, y: 320 }, { x: -320, y: 320 }
    ]
  };
}
/** LQFP-64：STM32F103RC */
function defQFP64() {
  const pads = [];
  for (let i = 0; i < 16; i++) {
    pads.push(smdPad(`${i + 1}`, -375, -375 + i * 50, 50, 16));
    pads.push(smdPad(`${17 + i}`, -375 + i * 50, 375, 50, 16));
    pads.push(smdPad(`${33 + i}`, 375, 375 - i * 50, 50, 16));
    pads.push(smdPad(`${49 + i}`, 375 - i * 50, -375, 50, 16));
  }
  return {
    id: 'FP_QFP64', name: 'LQFP-64', description: 'LQFP-64 teaching (STM32F103RC)',
    pads,
    silkLines: rectSilk(360, 360),
    courtyard: [
      { x: -395, y: -395 }, { x: 395, y: -395 },
      { x: 395, y: 395 }, { x: -395, y: 395 }
    ]
  };
}
/** LQFP-100：STM32F407VG */
function defQFP100() {
  const pads = [];
  for (let i = 0; i < 25; i++) {
    pads.push(smdPad(`${i + 1}`, -585, -600 + i * 50, 50, 18));
    pads.push(smdPad(`${26 + i}`, -600 + i * 50, 585, 50, 18));
    pads.push(smdPad(`${51 + i}`, 585, 600 - i * 50, 50, 18));
    pads.push(smdPad(`${76 + i}`, 600 - i * 50, -585, 50, 18));
  }
  return {
    id: 'FP_QFP100', name: 'LQFP-100', description: 'LQFP-100 teaching (STM32F407VG)',
    pads,
    silkLines: rectSilk(560, 560),
    courtyard: [
      { x: -605, y: -605 }, { x: 605, y: -605 },
      { x: 605, y: 605 }, { x: -605, y: 605 }
    ]
  };
}
/** TSSOP-20：STM32F030F4 / L431CB 教学 */
function defTSSOP20() {
  const pads = [];
  for (let i = 0; i < 10; i++) {
    pads.push(smdPad(`${i + 1}`, -100, -112 + i * 25, 40, 8));
    pads.push(smdPad(`${20 - i}`, 100, -112 + i * 25, 40, 8));
  }
  return {
    id: 'FP_TSSOP20', name: 'TSSOP-20', description: 'TSSOP-20 teaching (F030/L431)',
    pads,
    silkLines: rectSilk(85, 120),
    courtyard: [
      { x: -115, y: -140 }, { x: 115, y: -140 },
      { x: 115, y: 140 }, { x: -115, y: 140 }
    ]
  };
}
/** 微动开关 4 脚（教学：用 1/2，3/4 可并到同网） */
function defSwPush() {
  return {
    id: 'FP_SW_PUSH', name: 'SW-Push', description: 'Tactile push 6x6',
    pads: [
      thPad('1', -60, -60, 32, 55), thPad('2', 60, -60, 32, 55),
      thPad('3', -60, 60, 32, 55), thPad('4', 60, 60, 32, 55)
    ],
    silkLines: rectSilk(55, 55),
    courtyard: [
      { x: -75, y: -75 }, { x: 75, y: -75 }, { x: 75, y: 75 }, { x: -75, y: 75 }
    ]
  };
}
/** 继电器 SPDT 5 脚 */
function defRelaySpdt() {
  return {
    id: 'FP_RELAY_SPDT', name: 'Relay-SPDT', description: 'SPDT relay 5-pin',
    pads: [
      thPad('1', -150, 0, 42, 70), thPad('2', 0, -150, 42, 70), thPad('3', 150, 0, 42, 70),
      thPad('4', -55, 80, 42, 70), thPad('5', 55, 80, 42, 70)
    ],
    silkLines: rectSilk(160, 120),
    courtyard: [
      { x: -180, y: -90 }, { x: 180, y: -90 }, { x: 180, y: 140 }, { x: -180, y: 140 }
    ]
  };
}
/** 蜂鸣器 2 脚 */
function defBuzzer() {
  return {
    id: 'FP_BUZZER', name: 'Buzzer', description: 'Piezo buzzer 2-pin',
    pads: [thPad('1', -100, 0, 42, 70), thPad('2', 100, 0, 42, 70)],
    silkLines: rectSilk(80, 80),
    courtyard: [
      { x: -90, y: -90 }, { x: 90, y: -90 }, { x: 90, y: 90 }, { x: -90, y: 90 }
    ]
  };
}
/** LCD1602 16 脚单排 */
function defLcd1602() {
  const pads = [];
  for (let i = 0; i < 16; i++) pads.push(thPad(`${i + 1}`, -750 + i * 100, 0, 42, 70));
  return {
    id: 'FP_LCD1602', name: 'LCD-1602', description: 'LCD1602 16-pin header',
    pads,
    silkLines: rectSilk(800, 60),
    courtyard: [
      { x: -820, y: -80 }, { x: 820, y: -80 }, { x: 820, y: 80 }, { x: -820, y: 80 }
    ]
  };
}
/** OLED 12864 I2C 4 脚 */
function defOled12864() {
  return {
    id: 'FP_OLED', name: 'OLED-12864', description: 'OLED 128x64 I2C 4-pin',
    pads: [
      smdPad('1', -120, 0, 40, 20), smdPad('2', -40, 0, 40, 20),
      smdPad('3', 40, 0, 40, 20), smdPad('4', 120, 0, 40, 20)
    ],
    silkLines: rectSilk(135, 40),
    courtyard: [
      { x: -150, y: -55 }, { x: 150, y: -55 }, { x: 150, y: 55 }, { x: -150, y: 55 }
    ]
  };
}
/** 晶振 HC-49 两脚 */
function defHC49() {
  return {
    id: 'FP_HC49', name: 'HC-49', description: 'Crystal HC-49',
    pads: [thPad('1', -60, 0, 35, 60), thPad('2', 60, 0, 35, 60)],
    silkLines: rectSilk(80, 40),
    courtyard: [{ x: -100, y: -50 }, { x: 100, y: -50 }, { x: 100, y: 50 }, { x: -100, y: 50 }]
  };
}
function defSOT23() {
  return {
    id: 'FP_SOT23', name: 'SOT-23', description: 'SOT-23',
    pads: [smdPad('1', -35, 45, 25, 20), smdPad('2', 35, 45, 25, 20), smdPad('3', 0, -45, 25, 20)],
    silkLines: rectSilk(40, 55),
    courtyard: [{ x: -55, y: -65 }, { x: 55, y: -65 }, { x: 55, y: 65 }, { x: -55, y: 65 }]
  };
}
function defTHT2() {
  return {
    id: 'FP_THT2', name: 'THT-2', description: '2-pin THT',
    pads: [thPad('1', -50, 0, 35, 60), thPad('2', 50, 0, 35, 60)],
    silkLines: rectSilk(60, 30),
    courtyard: [{ x: -80, y: -40 }, { x: 80, y: -40 }, { x: 80, y: 40 }, { x: -80, y: 40 }]
  };
}
/** TO-92 传感器（DS18B20 / 霍尔） */
function defTO92Sensor() {
  return {
    id: 'FP_TO92_SENSOR', name: 'TO-92-Sensor', description: 'TO-92 3-pin sensor',
    pads: [thPad('1', -50, 0, 28, 50), thPad('2', 0, 0, 28, 50), thPad('3', 50, 0, 28, 50)],
    silkLines: rectSilk(55, 40),
    courtyard: [
      { x: -65, y: -50 }, { x: 65, y: -50 }, { x: 65, y: 50 }, { x: -65, y: 50 }
    ]
  };
}
/** 电位器 3 脚 */
function defPot3() {
  return {
    id: 'FP_POT3', name: 'Pot-3Pin', description: '3-pin potentiometer',
    pads: [thPad('1', -50, 0, 40, 65), thPad('2', 0, -60, 40, 65), thPad('3', 50, 0, 40, 65)],
    silkLines: rectSilk(65, 60),
    courtyard: [
      { x: -80, y: -80 }, { x: 80, y: -80 }, { x: 80, y: 45 }, { x: -80, y: 45 }
    ]
  };
}
/** 光敏电阻 2 脚 */
function defLdr() {
  return {
    id: 'FP_LDR', name: 'LDR', description: 'Photoresistor 2-pin',
    pads: [thPad('1', -80, 0, 35, 60), thPad('2', 80, 0, 35, 60)],
    silkLines: rectSilk(70, 50),
    courtyard: [
      { x: -100, y: -70 }, { x: 100, y: -70 }, { x: 100, y: 70 }, { x: -100, y: 70 }
    ]
  };
}
function defTO2203() {
  return {
    id: 'FP_TO2203', name: 'TO-220-3', description: 'TO-220-3',
    pads: [thPad('1', -90, 0, 40, 70), thPad('2', 0, 90, 40, 70), thPad('3', 90, 0, 40, 70)],
    silkLines: rectSilk(100, 110),
    courtyard: [{ x: -120, y: -50 }, { x: 120, y: -50 }, { x: 120, y: 130 }, { x: -120, y: 130 }]
  };
}
/** LM2596 等 5 脚直插：1 VIN  2 OUT  3 GND  4 FB  5 ON */
function defSIP5() {
  const pads = [];
  const pitch = 100;
  const startX = -200;
  for (let i = 0; i < 5; i++) {
    pads.push(thPad(`${i + 1}`, startX + i * pitch, 0, 40, 70));
  }
  return {
    id: 'FP_SIP5', name: 'SIP-5', description: '5-pin SIP (LM2596 teaching)',
    pads,
    silkLines: rectSilk(220, 40),
    courtyard: [{ x: -240, y: -50 }, { x: 240, y: -50 }, { x: 240, y: 50 }, { x: -240, y: 50 }]
  };
}
/** 1xN 排针 — 用于板边连接器，提升成品板密度观感 */
function defPinHeader(n) {
  const pads = [];
  const pitch = 100;
  const startY = -((n - 1) * pitch) / 2;
  for (let i = 0; i < n; i++) {
    pads.push(thPad(`${i + 1}`, 0, startY + i * pitch, 35, 60));
  }
  const halfH = ((n - 1) * pitch) / 2 + 50;
  return {
    id: `FP_PINHDR_${n}`, name: `PinHeader_1x${n}`, description: `1x${n} pin header`,
    pads,
    silkLines: rectSilk(40, halfH),
    courtyard: [{ x: -55, y: -halfH - 10 }, { x: 55, y: -halfH - 10 }, { x: 55, y: halfH + 10 }, { x: -55, y: halfH + 10 }]
  };
}
function defMountHole() {
  // 极紧凑安装孔：中心可贴到距边≈半焊盘处
  return {
    id: 'FP_MOUNT', name: 'MountingHole', description: 'Corner mounting hole',
    pads: [thPad('1', 0, 0, 32, 40)],
    silkLines: [[{ x: -22, y: 0 }, { x: 22, y: 0 }], [{ x: 0, y: -22 }, { x: 0, y: 22 }]],
    courtyard: [{ x: -24, y: -24 }, { x: 24, y: -24 }, { x: 24, y: 24 }, { x: -24, y: 24 }]
  };
}

const DEFS = new Map();
for (const d of [
  def0805(), def0603(), def1206(), defSOIC8(), defDIP8(), defDIP14(), defDIP16(), defDIP28(),
  defDIP40(), defQFP48(), defQFP64(), defQFP100(), defTSSOP20(), defHC49(),
  defSwPush(), defRelaySpdt(), defBuzzer(), defLcd1602(), defOled12864(),
  defSOT23(), defTHT2(), defTO2203(), defSIP5(), defTO92Sensor(), defPot3(), defLdr(),
  defPinHeader(3), defPinHeader(4), defPinHeader(5), defPinHeader(6),
  defPinHeader(8), defPinHeader(9), defPinHeader(10), defMountHole()
]) {
  DEFS.set(d.id, d);
}

function resolveFootprintId(footprintStr, libraryId) {
  const fp = (footprintStr || '').toLowerCase();
  const lib = (libraryId || '').toLowerCase();
  if (fp.includes('0402')) return 'FP_0805';
  if (fp.includes('0603')) return 'FP_0603';
  if (fp.includes('1206')) return 'FP_1206';
  if (fp.includes('0805')) return 'FP_0805';
  if (fp.includes('to-220') || fp.includes('to220')) return 'FP_TO2203';
  if (fp.includes('sip') && fp.includes('5')) return 'FP_SIP5';
  if (fp.includes('soic')) return 'FP_SOIC8';
  if (fp.includes('dip-28') || fp.includes('dip28') || fp.includes('pdip-28')) return 'FP_DIP28';
  if (fp.includes('dip-16') || fp.includes('dip16') || fp.includes('pdip-16')) return 'FP_DIP16';
  if (fp.includes('dip-14') || fp.includes('dip14') || fp.includes('pdip-14')) return 'FP_DIP14';
  if (fp.includes('dip-40') || fp.includes('dip40') || fp.includes('pdip-40')) return 'FP_DIP40';
  if (fp.includes('dip')) return 'FP_DIP8';
  if (fp.includes('hc-49') || fp.includes('hc49') || fp.includes('crystal')) return 'FP_HC49';
  if (fp.includes('sot') && fp.includes('23')) return 'FP_SOT23';
  if (fp.includes('tssop') && (fp.includes('20') || fp.includes('-20'))) return 'FP_TSSOP20';
  if (fp.includes('qfp') && fp.includes('100')) return 'FP_QFP100';
  if (fp.includes('qfp') && fp.includes('64')) return 'FP_QFP64';
  if (fp.includes('qfp') && fp.includes('48')) return 'FP_QFP48';
  // OLED 必须先于 led，避免 oled 被当成 led → 0805
  if (lib.includes('oled')) return 'FP_OLED';
  if (lib.includes('lcd')) return 'FP_LCD1602';
  if (lib.includes('lm2596')) return 'FP_SIP5';
  if (lib.includes('7805') || lib.includes('7812') || lib.includes('ams1117')) return 'FP_TO2203';
  if (lib.startsWith('r_') || lib.startsWith('c_') || lib.startsWith('l_') ||
      lib.startsWith('led_') || lib.includes('1n') || lib.includes('fuse')) {
    return lib.includes('fuse') ? 'FP_1206' : 'FP_0805';
  }
  if (lib.includes('irf')) return 'FP_TO2203';
  if (lib.includes('2n') || lib.includes('mos') || lib.includes('bjt')) return 'FP_SOT23';
  if (lib.includes('pot')) return 'FP_POT3';
  if (lib.includes('ds18')) return 'FP_TO92_SENSOR';
  if (lib.includes('hall')) return 'FP_TO92_SENSOR';
  if (lib.includes('ldr')) return 'FP_LDR';
  if (lib.includes('sw_')) return 'FP_SW_PUSH';
  if (lib.includes('buzzer')) return 'FP_BUZZER';
  if (lib.includes('relay')) return 'FP_RELAY_SPDT';
  if (lib.includes('xtal') || lib.includes('crystal')) return 'FP_HC49';
  if (isMcu51Lib(lib)) return 'FP_DIP40';
  if (isMcuStm32F103C8Lib(lib)) return 'FP_QFP48';
  if (isMcuStm32F103RCLib(lib)) return 'FP_QFP64';
  if (isMcuStm32F407Lib(lib)) return 'FP_QFP100';
  if (isMcuStm32Tssop20Lib(lib)) return 'FP_TSSOP20';
  if (lib.includes('2764') || lib.includes('62256')) return 'FP_DIP28';
  if (lib.includes('cd4017') || lib.includes('4017')) return 'FP_DIP16';
  if (lib.includes('74hc') || lib.includes('74ls') || lib.includes('cd40')) return 'FP_DIP14';
  if (lib.includes('555') || lib.includes('741') || lib.includes('lm358') || lib.includes('tl082') ||
      lib.includes('stm32') || lib.includes('24c') || lib.includes('w25q')) {
    return lib.includes('stm32') ? 'FP_QFP48' : 'FP_SOIC8';
  }
  // 仪器探针（与 lab_instruments 手布探针封装一致）
  if (lib.includes('logic_analyzer')) return 'FP_PINHDR_10';
  if (lib.includes('oscilloscope')) return 'FP_PINHDR_6';
  if (lib.includes('power_meter') || lib.includes('uart_terminal') || lib.includes('virtual_meter')) {
    return 'FP_PINHDR_4';
  }
  if (lib.includes('ammeter') || lib.includes('voltmeter') || lib.includes('freq_counter') ||
      lib.includes('signal_gen')) {
    return 'FP_THT2';
  }
  return 'FP_0805';
}

function isLayoutable(libDevId, refName) {
  const lib = (libDevId || '').toLowerCase();
  if ((refName || '').startsWith('#')) return false;
  if (lib.startsWith('gnd') || lib.startsWith('vcc') || lib.startsWith('vee') || lib.startsWith('vac') ||
      lib.startsWith('power') || lib.includes('probe') || lib.includes('instrument') ||
      lib.includes('oscilloscope') || lib.includes('multimeter') || lib.includes('generator') ||
      lib.includes('voltmeter') || lib.includes('ammeter') || lib.includes('power_meter') ||
      lib.includes('freq_counter') || lib.includes('logic_analyzer') || lib.includes('uart_terminal') ||
      lib.includes('virtual_meter') || lib.includes('signal_gen')) {
    return false;
  }
  return true;
}

function paramGet(params, key) {
  if (!params || typeof params !== 'object') return '';
  const v = params[key];
  return typeof v === 'string' ? v : '';
}

function halfExtents(defId) {
  const def = DEFS.get(defId) || DEFS.get('FP_0805');
  let halfW = 60, halfH = 40;
  for (const pad of def.pads) {
    halfW = Math.max(halfW, Math.abs(pad.pos.x) + pad.size.x / 2);
    halfH = Math.max(halfH, Math.abs(pad.pos.y) + pad.size.y / 2);
  }
  for (const pt of def.courtyard) {
    halfW = Math.max(halfW, Math.abs(pt.x));
    halfH = Math.max(halfH, Math.abs(pt.y));
  }
  return { halfW, halfH };
}

function instantiate(defId, refDes, value, pos, rotation, schId) {
  const def = DEFS.get(defId) || DEFS.get('FP_0805');
  const pads = def.pads.map(p => ({
    id: uid('pad'), number: p.number, type: p.type, shape: p.shape,
    pos: { x: p.pos.x, y: p.pos.y }, size: { x: p.size.x, y: p.size.y },
    drill: p.drill, layers: [...p.layers]
  }));
  return {
    id: uid('fp'), defId: def.id, refDes, value,
    position: { x: pos.x, y: pos.y },
    rotation: ((rotation || 0) % 360),
    mirrored: false, layer: 'F.Cu', locked: false, pads,
    schematicCompId: schId
  };
}

function registerPadNetKey(map, compId, key, netId, netName) {
  if (!key) return;
  const entry = { netId, netName };
  map.set(`${compId}:${key}`, entry);
  map.set(`${compId}:${key.toUpperCase()}`, entry);
  const stripped = key.replace(/^p/i, '');
  if (stripped && stripped !== key) {
    map.set(`${compId}:${stripped}`, entry);
    map.set(`${compId}:${stripped.toUpperCase()}`, entry);
  }
}

function registerSchPin(map, compId, pinId, pinName, netId, netName, libDevId) {
  registerPadNetKey(map, compId, pinId, netId, netName);
  registerPadNetKey(map, compId, pinName, netId, netName);
  for (const pin of [pinId, pinName]) {
    if (pin && pin.length >= 2 && (pin[0] === 'P' || pin[0] === 'p') && /^\d+$/.test(pin.slice(1))) {
      registerPadNetKey(map, compId, pin.slice(1), netId, netName);
    }
  }
  if (isUa741Lib(libDevId)) {
    for (const pin of [pinId, pinName]) {
      const pad = UA741_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else if (isLm555Lib(libDevId)) {
    for (const pin of [pinId, pinName]) {
      const pad = LM555_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else if (isDualOpAmpLib(libDevId)) {
    for (const pin of [pinId, pinName]) {
      const pad = DUAL_OPAMP_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else if (isMcu51Lib(libDevId)) {
    for (const pin of [pinId, pinName]) {
      const pad = MCU51_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else if (isMcuStm32F103C8Lib(libDevId)) {
    for (const pin of [pinId, pinName]) {
      const pad = STM32F103C8_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else if (isMcuStm32F103RCLib(libDevId)) {
    for (const pin of [pinId, pinName]) {
      const pad = STM32F103RC_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else if (isMcuStm32F407Lib(libDevId)) {
    for (const pin of [pinId, pinName]) {
      const pad = STM32F407_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else if (isMcuStm32Tssop20Lib(libDevId)) {
    for (const pin of [pinId, pinName]) {
      const pad = STM32_TSSOP20_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else if ((libDevId || '').toLowerCase().includes('lcd')) {
    for (const pin of [pinId, pinName]) {
      const pad = LCD1602_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else if ((libDevId || '').toLowerCase().includes('oled')) {
    for (const pin of [pinId, pinName]) {
      const pad = OLED_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else if ((libDevId || '').toLowerCase().includes('relay')) {
    for (const pin of [pinId, pinName]) {
      const pad = RELAY_SPDT_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else if ((libDevId || '').toLowerCase().includes('ds18')) {
    for (const pin of [pinId, pinName]) {
      const pad = DS18B20_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else if ((libDevId || '').toLowerCase().includes('hall')) {
    for (const pin of [pinId, pinName]) {
      const pad = HALL_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else if ((libDevId || '').toLowerCase().includes('pot')) {
    for (const pin of [pinId, pinName]) {
      const pad = POT3_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else if ((libDevId || '').toLowerCase().includes('cd4017') || (libDevId || '').toLowerCase() === '4017') {
    for (const pin of [pinId, pinName]) {
      const pad = CD4017_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else if (instrumentPinMap(libDevId)) {
    const imap = instrumentPinMap(libDevId);
    for (const pin of [pinId, pinName]) {
      const pad = imap.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else if ((libDevId || '').toLowerCase().includes('24c')) {
    for (const pin of [pinId, pinName]) {
      const pad = MEM24C02_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else if ((libDevId || '').toLowerCase().includes('w25q')) {
    for (const pin of [pinId, pinName]) {
      const pad = W25Q64_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else if ((libDevId || '').toLowerCase().includes('2764')) {
    for (const pin of [pinId, pinName]) {
      const pad = MEM2764_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else if ((libDevId || '').toLowerCase().includes('62256')) {
    for (const pin of [pinId, pinName]) {
      const pad = MEM62256_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else {
    for (const pin of [pinId, pinName]) {
      const alias = PIN_LABEL_TO_PAD.get((pin || '').toUpperCase());
      if (alias) registerPadNetKey(map, compId, alias, netId, netName);
    }
  }
}

function lookupPadNet(map, compId, padNumber) {
  // 仅按焊盘号查找；脚名别名已在 registerSchPin / PIN_LABEL 阶段写入焊盘号。
  // 勿在此回退 OUT→3 / V+→1，否则会把 UA741 等 IC 的 OUT/VCC 绑到错误脚。
  const keys = [padNumber, padNumber.toUpperCase(), `p${padNumber}`, `P${padNumber}`];
  for (const k of keys) {
    const hit = map.get(`${compId}:${k}`);
    if (hit) return hit;
  }
  return undefined;
}

function padWorld(fp, pad) {
  let lx = pad.pos.x, ly = pad.pos.y;
  if (fp.mirrored) lx = -lx;
  if (fp.rotation === 90) { const t = lx; lx = -ly; ly = t; }
  else if (fp.rotation === 180) { lx = -lx; ly = -ly; }
  else if (fp.rotation === 270) { const t = lx; lx = ly; ly = -t; }
  return { x: fp.position.x + lx, y: fp.position.y + ly };
}

function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function snap(v, grid) {
  if (grid <= 0) return v;
  return Math.round(v / grid) * grid;
}

function routeL(a, b, grid) {
  const s = { x: a.x, y: a.y }, e = { x: b.x, y: b.y };
  if (dist(s, e) < 0.5) return [];
  const midH = { x: e.x, y: snap(s.y, grid) };
  const midV = { x: snap(s.x, grid), y: e.y };
  const lenH = dist(s, midH) + dist(midH, e);
  const lenV = dist(s, midV) + dist(midV, e);
  if (lenH <= lenV) {
    if (dist(s, midH) > 0.5 && dist(midH, e) > 0.5) return [s, midH, e];
    return [s, e];
  }
  if (dist(s, midV) > 0.5 && dist(midV, e) > 0.5) return [s, midV, e];
  return [s, e];
}

function orderNearest(points) {
  if (points.length <= 1) return points.slice();
  const remaining = points.slice();
  const ordered = [remaining.shift()];
  while (remaining.length) {
    const last = ordered[ordered.length - 1];
    let bi = 0, bd = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = dist(last, remaining[i]);
      if (d < bd) { bd = d; bi = i; }
    }
    ordered.push(remaining.splice(bi, 1)[0]);
  }
  return ordered;
}

function isGndNet(name) {
  const nm = (name || '').toUpperCase();
  return nm === 'GND' || nm === 'VSS' || nm === 'AGND';
}
/** 电源轨：线宽/网络类用（含稳压输入输出） */
function isVccNet(name) {
  const nm = (name || '').toUpperCase();
  return nm === 'VCC' || nm === 'VDD' || nm === 'VEE' || nm === '3V3' || nm === '5V' ||
    nm === 'VIN' || nm === 'VIN_SRC' || nm === 'VOUT' || nm === 'REG_IN' ||
    nm.startsWith('VCC') || nm.startsWith('VDD') || nm.startsWith('VIN');
}
/** 顶层辅助铺铜：仅经典电源名，避免 VIN/VOUT 误铺大铜皮 */
function isPourableVccNet(name) {
  const nm = (name || '').toUpperCase();
  return nm === 'VCC' || nm === 'VDD' || nm === '3V3' || nm === '5V' ||
    nm.startsWith('VCC') || nm.startsWith('VDD');
}
function isPowerNet(name) {
  return isGndNet(name) || isVccNet(name);
}

function guessNetClassId(netName, classes) {
  const upper = (netName || '').toUpperCase();
  let powerId = 'nc_power';
  let signalId = 'nc_signal';
  let defaultId = 'nc_default';
  for (const c of classes || []) {
    if (c.name === 'Power') powerId = c.id;
    if (c.name === 'Signal') signalId = c.id;
    if (c.name === 'Default') defaultId = c.id;
  }
  if (isPowerNet(upper) || upper.indexOf('VBAT') >= 0 || upper.indexOf('3V3') >= 0 ||
    upper.indexOf('5V') >= 0) {
    return powerId;
  }
  if (upper.length > 0) return signalId;
  return defaultId;
}

function assignNetClasses(doc) {
  for (const n of doc.nets) {
    n.classId = guessNetClassId(n.name, doc.netClasses);
  }
}

/** 合法铜层数：2 / 4 / 6 / 8 */
function normalizeCopperCount(n) {
  const v = Number(n);
  if (v === 4 || v === 6 || v === 8) return v;
  return 2;
}

/**
 * 与 common createDefaultLayerStack 对齐的物理层栈。
 */
function buildLayerStack(copperCount) {
  const n = normalizeCopperCount(copperCount);
  const layers = [
    { id: 'sm_top', type: 'soldermask', name: 'F.Mask', thicknessMm: 0.02 },
    { id: 'cu_f', type: 'copper', name: 'F.Cu', copperLayerId: 'F.Cu', thicknessMm: 0.035, copperOz: 1 }
  ];
  if (n >= 4) {
    layers.push(
      { id: 'diel_1', type: 'dielectric', name: 'Prepreg', thicknessMm: 0.2, dielectricDk: 4.5 },
      { id: 'cu_in1', type: 'copper', name: 'In1.Cu', copperLayerId: 'In1.Cu', thicknessMm: 0.035, copperOz: 1 },
      { id: 'diel_core', type: 'dielectric', name: 'Core', thicknessMm: 0.8, dielectricDk: 4.3 },
      { id: 'cu_in2', type: 'copper', name: 'In2.Cu', copperLayerId: 'In2.Cu', thicknessMm: 0.035, copperOz: 1 }
    );
  } else {
    layers.push(
      { id: 'diel_core', type: 'dielectric', name: 'Core', thicknessMm: 1.5, dielectricDk: 4.3 }
    );
  }
  if (n >= 6) {
    layers.push(
      { id: 'diel_3', type: 'dielectric', name: 'Prepreg2', thicknessMm: 0.2, dielectricDk: 4.5 },
      { id: 'cu_in3', type: 'copper', name: 'In3.Cu', copperLayerId: 'In3.Cu', thicknessMm: 0.035, copperOz: 1 },
      { id: 'diel_3b', type: 'dielectric', name: 'Prepreg2b', thicknessMm: 0.2, dielectricDk: 4.5 },
      { id: 'cu_in4', type: 'copper', name: 'In4.Cu', copperLayerId: 'In4.Cu', thicknessMm: 0.035, copperOz: 1 }
    );
  }
  if (n >= 8) {
    layers.push(
      { id: 'diel_4', type: 'dielectric', name: 'Prepreg3', thicknessMm: 0.2, dielectricDk: 4.5 },
      { id: 'cu_in5', type: 'copper', name: 'In5.Cu', copperLayerId: 'In5.Cu', thicknessMm: 0.035, copperOz: 1 },
      { id: 'diel_4b', type: 'dielectric', name: 'Prepreg3b', thicknessMm: 0.2, dielectricDk: 4.5 },
      { id: 'cu_in6', type: 'copper', name: 'In6.Cu', copperLayerId: 'In6.Cu', thicknessMm: 0.035, copperOz: 1 }
    );
  }
  layers.push(
    { id: 'cu_b', type: 'copper', name: 'B.Cu', copperLayerId: 'B.Cu', thicknessMm: 0.035, copperOz: 1 },
    { id: 'sm_bot', type: 'soldermask', name: 'B.Mask', thicknessMm: 0.02 }
  );
  return { copperCount: n, layers };
}

function buildPcbLayers(copperCount) {
  const n = normalizeCopperCount(copperCount);
  const layers = [
    { id: 'F.Cu', name: 'Front Copper', visible: true, color: '#FF2A2A', opacity: 0.92 }
  ];
  if (n >= 4) {
    layers.push(
      { id: 'In1.Cu', name: 'Inner1 Copper', visible: true, color: '#D500F9', opacity: 0.88 },
      { id: 'In2.Cu', name: 'Inner2 Copper', visible: true, color: '#FF9100', opacity: 0.88 }
    );
  }
  if (n >= 6) {
    layers.push(
      { id: 'In3.Cu', name: 'Inner3 Copper', visible: true, color: '#651FFF', opacity: 0.85 },
      { id: 'In4.Cu', name: 'Inner4 Copper', visible: true, color: '#00E5FF', opacity: 0.85 }
    );
  }
  if (n >= 8) {
    layers.push(
      { id: 'In5.Cu', name: 'Inner5 Copper', visible: true, color: '#FFD740', opacity: 0.85 },
      { id: 'In6.Cu', name: 'Inner6 Copper', visible: true, color: '#69F0AE', opacity: 0.85 }
    );
  }
  layers.push(
    { id: 'B.Cu', name: 'Back Copper', visible: true, color: '#00C853', opacity: 0.78 },
    { id: 'F.SilkS', name: 'Front Silk', visible: true, color: '#5CE1E6', opacity: 1 },
    { id: 'B.SilkS', name: 'Back Silk', visible: false, color: '#80A0B0', opacity: 1 },
    { id: 'F.Mask', name: 'Front Mask', visible: false, color: '#1B5E20', opacity: 0.35 },
    { id: 'B.Mask', name: 'Back Mask', visible: false, color: '#1B5E20', opacity: 0.35 },
    { id: 'Edge.Cuts', name: 'Edge Cuts', visible: true, color: '#E8A020', opacity: 1 },
    { id: 'F.CrtYd', name: 'Courtyard', visible: false, color: '#808080', opacity: 1 }
  );
  return layers;
}

function applyCopperCount(doc, copperCount) {
  const n = normalizeCopperCount(copperCount);
  doc.layerStack = buildLayerStack(n);
  doc.layers = buildPcbLayers(n);
  return n;
}

/**
 * 按原理图/器件规模推断铜层数（可被 schsim 字段或表覆盖）。
 * 简单实验 2 层；中等密度 4；MCU/总线类 6；超高密度 8。
 */
function suggestCopperCountFromDoc(labId, doc) {
  const fps = (doc.footprints || []).filter(f => f.schematicCompId);
  const nets = doc.nets || [];
  let pads = 0;
  let icLike = 0;
  for (const fp of fps) {
    pads += (fp.pads || []).length;
    const def = (fp.defId || '').toUpperCase();
    if (def.indexOf('SOIC') >= 0 || def.indexOf('DIP') >= 0 || def.indexOf('QFP') >= 0 ||
      def.indexOf('LQFP') >= 0 || (fp.pads || []).length >= 8) {
      icLike++;
    }
  }
  const id = (labId || '').toLowerCase();
  let n = 2;
  if (fps.length > 28 || nets.length > 36 || pads > 120) n = 8;
  else if (fps.length > 16 || nets.length > 22 || pads > 64 || icLike >= 3) n = 6;
  else if (fps.length > 8 || nets.length > 10 || pads > 28 || icLike >= 1) n = 4;

  // 类别抬升：数字/MCU/存储/外设通常走线更多
  if (/mcu|stm32|8051|memory|digital|peripheral|uart|sensor/.test(id)) {
    n = Math.max(n, 4);
  }
  if (/mcu_stm32|memory|peripheral/.test(id)) {
    n = Math.max(n, 6);
  }
  // 手布双面板保持 2 层（仅用 F/B）
  if (id === 'lab_power' || id === 'lab_amp' || id === 'lab_filter') {
    n = 2;
  }
  if (id === 'lab_51_led' || id === 'lab_uart') {
    n = 4;
  }
  if (id === 'lab_memory') {
    n = 6;
  }
  if (id === 'lab_mcu_8051') {
    n = 6;
  }
  if (id === 'lab_mcu_stm32') {
    n = 6;
  }
  if (id === 'lab_peripheral') {
    n = 6;
  }
  if (id === 'lab_sensor') {
    n = 6;
  }
  if (id === 'lab_instruments') {
    n = 6;
  }
  if (id === 'lab_digital_gates') {
    n = 4;
  }
  if (id === 'lab_schmitt') {
    n = 4;
  }
  if (id === 'lab_integrator') {
    n = 4;
  }
  if (id === 'lab_555_astable') {
    n = 4;
  }
  if (id === 'lab_555_monostable') {
    n = 4;
  }
  return normalizeCopperCount(n);
}

/**
 * 解析本模板铜层数：
 * 1) schsim 显式字段 pcbCopperCount / topology.pcbCopperCount / metadata.pcbCopperCount
 * 2) 否则按器件与网络规模自动推断
 */
function resolveLabCopperCount(labId, sch, doc) {
  const raw = sch?.pcbCopperCount ?? sch?.topology?.pcbCopperCount ??
    sch?.metadata?.pcbCopperCount ?? sch?.simConfig?.pcbCopperCount;
  if (raw !== undefined && raw !== null && `${raw}`.length > 0) {
    return normalizeCopperCount(raw);
  }
  return suggestCopperCountFromDoc(labId, doc);
}

/** schsim 可选 pcbBoardWidth / pcbBoardHeight（mil），缺省则按内容自适应 */
function resolveLabBoardSize(sch) {
  const w = Number(sch?.pcbBoardWidth ?? sch?.topology?.pcbBoardWidth ??
    sch?.metadata?.pcbBoardWidth ?? sch?.simConfig?.pcbBoardWidth);
  const h = Number(sch?.pcbBoardHeight ?? sch?.topology?.pcbBoardHeight ??
    sch?.metadata?.pcbBoardHeight ?? sch?.simConfig?.pcbBoardHeight);
  if (Number.isFinite(w) && Number.isFinite(h) && w >= 400 && h >= 300) {
    return { w: Math.round(w), h: Math.round(h) };
  }
  return null;
}

/**
 * 先按内容 fit；若 schsim 指定了更大尺寸则扩展外框（不小于内容）。
 */
function forcedLabBoardSize(labId) {
  if (labId === 'lab_51_led') return { w: 2000, h: 2900 };
  if (labId === 'lab_mcu_8051') return { w: 6200, h: 2800 };
  if (labId === 'lab_mcu_stm32') return { w: 9200, h: 3600 };
  if (labId === 'lab_peripheral') return { w: 6200, h: 4000 };
  if (labId === 'lab_sensor') return { w: 5600, h: 3600 };
  if (labId === 'lab_instruments') return { w: 7200, h: 4200 };
  if (labId === 'lab_digital_gates') return { w: 6400, h: 3600 };
  if (labId === 'lab_schmitt') return { w: 2800, h: 2000 };
  if (labId === 'lab_integrator') return { w: 3000, h: 2200 };
  if (labId === 'lab_555_astable') return { w: 2800, h: 2400 };
  if (labId === 'lab_555_monostable') return { w: 2800, h: 2400 };
  if (labId === 'lab_uart') return { w: 1800, h: 1800 };
  if (labId === 'lab_memory') return { w: 7200, h: 4200 };
  return null;
}

function applyLabBoardSize(doc, sch, labId) {
  fitBoardToContent(doc);
  const fixed = resolveLabBoardSize(sch) || (labId ? forcedLabBoardSize(labId) : null);
  if (!fixed) return;
  const pts = doc.boardOutline.points || [];
  const curW = pts.length ? Math.max(...pts.map(p => p.x)) : 0;
  const curH = pts.length ? Math.max(...pts.map(p => p.y)) : 0;
  const boardW = Math.max(curW, fixed.w);
  const boardH = Math.max(curH, fixed.h);
  doc.boardOutline.points = [
    { x: 0, y: 0 }, { x: boardW, y: 0 }, { x: boardW, y: boardH }, { x: 0, y: boardH }
  ];
}

/** 在最终板框四角放置 GND 安装孔 */
function addCornerMountHoles(doc, gndNet) {
  const pts = doc.boardOutline.points || [];
  if (pts.length < 2) return;
  const boardW = Math.max(...pts.map(p => p.x));
  const boardH = Math.max(...pts.map(p => p.y));
  // 中心 = 半焊盘，铜皮外缘贴齐板边四角
  const inset = 20;
  const holes = [
    { x: inset, y: inset },
    { x: boardW - inset, y: inset },
    { x: inset, y: boardH - inset },
    { x: boardW - inset, y: boardH - inset }
  ];
  const used = new Set((doc.footprints || []).map(f => f.refDes));
  let hi = 1;
  for (const hp of holes) {
    // 霍尔等器件占用 H1 时改用 MH*，避免 refDes 冲突
    let ref = `H${hi}`;
    if (used.has(ref)) ref = `MH${hi}`;
    while (used.has(ref)) { hi++; ref = `MH${hi}`; }
    used.add(ref);
    const hole = instantiate('FP_MOUNT', ref, 'MH', hp, 0);
    if (gndNet) {
      for (const pad of hole.pads) {
        pad.netId = gndNet.id;
        pad.netName = gndNet.name;
      }
    }
    doc.footprints.push(hole);
    hi++;
  }
}

function createEmptyPcb(name, copperCount = 2) {
  const now = new Date().toISOString();
  const n = normalizeCopperCount(copperCount);
  return {
    id: uid('pcb'), name, version: '1.1',
    boardOutline: {
      points: [{ x: 0, y: 0 }, { x: 1200, y: 0 }, { x: 1200, y: 800 }, { x: 0, y: 800 }],
      width: 5
    },
    footprints: [], tracks: [], vias: [], zones: [],
    layers: buildPcbLayers(n),
    nets: [],
    netClasses: [
      { id: 'nc_default', name: 'Default', trackWidth: 10, clearance: 6, viaDiameter: 24, viaDrill: 12 },
      { id: 'nc_power', name: 'Power', trackWidth: 20, clearance: 10, viaDiameter: 30, viaDrill: 16 },
      { id: 'nc_signal', name: 'Signal', trackWidth: 8, clearance: 6, viaDiameter: 22, viaDrill: 12 }
    ],
    layerStack: buildLayerStack(n),
    diffPairs: [],
    metadata: {
      author: 'pcb_templates/export',
      createdAt: now, modifiedAt: now,
      description: 'Lab PCB template (auto-generated)',
      gridSize: 5, units: 'mil',
      designRules: {
        minTrackWidth: 8, minClearance: 6, minViaDrill: 12,
        defaultTrackWidth: 14, minAnnularRing: 4, minHoleToHole: 10
      }
    }
  };
}

/** 点到线段距离 */
function pointSegDist(p, s, e) {
  const abx = e.x - s.x, aby = e.y - s.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 0.01) return dist(p, s);
  let t = ((p.x - s.x) * abx + (p.y - s.y) * aby) / len2;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  return Math.hypot(p.x - (s.x + t * abx), p.y - (s.y + t * aby));
}

/** 两线段中心线间距（端点投影近似，与运行时 CROWD_TRACK 一致） */
function segClearance(a0, a1, b0, b1) {
  return Math.min(
    pointSegDist(a0, b0, b1), pointSegDist(a1, b0, b1),
    pointSegDist(b0, a0, a1), pointSegDist(b1, a0, a1)
  );
}

/** 路径是否与已有异网同层走线冲突 */
function pathClearOfTracks(doc, path, netId, layer, width, clr) {
  if (!path || path.length < 2) return true;
  for (let i = 0; i < path.length - 1; i++) {
    const a0 = path[i], a1 = path[i + 1];
    if (dist(a0, a1) < 0.5) continue;
    for (const t of doc.tracks) {
      if (t.layer !== layer || !t.netId || t.netId === netId) continue;
      const gap = segClearance(a0, a1, t.start, t.end) - (width + t.width) * 0.5;
      if (gap < clr) return false;
    }
  }
  return true;
}

/** L 型候选：水平优先 / 垂直优先 */
function routeLCandidates(a, b, grid) {
  const s = { x: a.x, y: a.y }, e = { x: b.x, y: b.y };
  if (dist(s, e) < 0.5) return [];
  const midH = { x: e.x, y: snap(s.y, grid) };
  const midV = { x: snap(s.x, grid), y: e.y };
  const out = [];
  const push = (mid) => {
    if (dist(s, mid) > 0.5 && dist(mid, e) > 0.5) out.push([s, mid, e]);
    else out.push([s, e]);
  };
  push(midH);
  push(midV);
  // 直连（同轴）
  if (Math.abs(s.x - e.x) < 0.5 || Math.abs(s.y - e.y) < 0.5) out.unshift([s, e]);
  return out;
}

/**
 * 正交优先布线；必要时用带偏移的总线绕行，避免 45° 斜线跨网短路。
 * preferH: true 时优先水平-再垂直
 * 返回 { path, layer }；若需 B.Cu 绕行由调用方处理 vias（本函数仅返回 F 层路径，
 * 冲突时返回 null 表示建议层切换）
 */
function routeSafe(a, b, grid, doc, netId, layer, width, clr, preferH) {
  const cands = routeLCandidates(a, b, grid);
  if (!preferH && cands.length >= 2) {
    const tmp = cands[0]; cands[0] = cands[1]; cands[1] = tmp;
  }
  for (const path of cands) {
    if (pathClearOfTracks(doc, path, netId, layer, width, clr)) return path;
  }
  // 绕行：更大偏移的正交折线
  const offsets = [];
  for (const mag of [40, 80, 120, 160, 200, 260]) {
    if (preferH) {
      offsets.push({ x: 0, y: mag }, { x: 0, y: -mag });
    } else {
      offsets.push({ x: mag, y: 0 }, { x: -mag, y: 0 });
    }
  }
  // 也试另一轴偏移
  for (const mag of [60, 120, 180]) {
    if (preferH) offsets.push({ x: mag, y: 0 }, { x: -mag, y: 0 });
    else offsets.push({ x: 0, y: mag }, { x: 0, y: -mag });
  }
  for (const off of offsets) {
    const mid1 = { x: snap(a.x + off.x, grid), y: snap(a.y + off.y, grid) };
    const mid2 = preferH
      ? { x: snap(b.x, grid), y: mid1.y }
      : { x: mid1.x, y: snap(b.y, grid) };
    const raw = [a, mid1, mid2, b];
    const path = [];
    for (let i = 0; i < raw.length; i++) {
      if (i === 0 || dist(raw[i], path[path.length - 1]) > 0.5) path.push(raw[i]);
    }
    if (path.length >= 2 && pathClearOfTracks(doc, path, netId, layer, width, clr)) {
      return path;
    }
  }
  return null;
}

/** 兼容旧调用 */
function route45(a, b, grid) {
  return routeL(a, b, grid);
}

function footprintKind(defId) {
  if (defId.includes('SOIC') || defId.includes('DIP') || defId.includes('TO220')) return 'ic';
  if (defId.includes('SOT')) return 'active';
  return 'passive';
}

function annotateFromSchsim(sch) {
  const topo = sch.topology;
  const doc = createEmptyPcb(sch.name || topo.schName || 'Lab PCB');
  const courtyardGap = 80;
  const originX = 260, originY = 260;
  const items = [];

  for (const d of topo.deviceList || []) {
    if (!isLayoutable(d.libDevId, d.refName)) continue;
    const fpStr = paramGet(d.params, 'footprint') || paramGet(d.params, 'package') || paramGet(d.params, '封装');
    const defId = resolveFootprintId(fpStr, d.libDevId);
    const value = paramGet(d.params, 'value') || paramGet(d.params, 'Value') || d.libDevId;
    const ext = halfExtents(defId);
    items.push({
      d, defId, value, ext,
      kind: footprintKind(defId),
      slotW: Math.max(ext.halfW * 2 + courtyardGap * 2, 200),
      slotH: Math.max(ext.halfH * 2 + courtyardGap * 2, 160)
    });
  }

  // IC/有源器件优先居中，无源件环绕 — 更接近模块化成品板
  items.sort((a, b) => {
    const rank = { ic: 0, active: 1, passive: 2 };
    return (rank[a.kind] ?? 3) - (rank[b.kind] ?? 3);
  });

  const n = Math.max(items.length, 1);
  // 少列多行：减少同行焊盘，降低 B 横线互穿
  const cols = n <= 4 ? 1 : n <= 12 ? 2 : Math.max(2, Math.ceil(Math.sqrt(n)));
  const maxRowWidth = Math.max(cols * 280, 560);
  let cursorX = originX, cursorY = originY, rowMaxH = 0;
  let placed = 0;
  let skipped = (topo.deviceList || []).length - items.length;

  for (const it of items) {
    if (cursorX - originX + it.slotW > maxRowWidth && cursorX > originX) {
      cursorX = originX;
      cursorY += rowMaxH;
      rowMaxH = 0;
    }
    const placeX = cursorX + it.ext.halfW + courtyardGap;
    const placeY = cursorY + it.ext.halfH + courtyardGap;
    cursorX += it.slotW;
    rowMaxH = Math.max(rowMaxH, it.slotH);
    // 无源件交替旋转 90°，便于走线扇出
    let rot = it.d.rotate || 0;
    if (it.kind === 'passive' && placed % 3 === 1) rot = (rot + 90) % 360;
    doc.footprints.push(instantiate(it.defId, it.d.refName, it.value,
      { x: placeX, y: placeY }, rot, it.d.instUuid));
    placed++;
  }

  const libByUuid = new Map();
  for (const d of topo.deviceList || []) {
    libByUuid.set(d.instUuid, d.libDevId || '');
  }
  const netMap = new Map();
  const pcbNets = new Map();
  for (const nNet of topo.netList || []) {
    const netId = nNet.netUuid;
    const netName = nNet.netName || nNet.displayName || netId;
    pcbNets.set(netId, { id: netId, name: netName });
    for (const node of nNet.nodeList || []) {
      const pinName = (node.pinName && node.pinName.length > 0) ? node.pinName : node.pinId;
      registerSchPin(netMap, node.devUuid, node.pinId, pinName, netId, netName,
        libByUuid.get(node.devUuid) || '');
    }
  }
  doc.nets = Array.from(pcbNets.values());

  for (const fp of doc.footprints) {
    if (!fp.schematicCompId) continue;
    for (const pad of fp.pads) {
      const bound = lookupPadNet(netMap, fp.schematicCompId, pad.number);
      if (bound) {
        pad.netId = bound.netId;
        pad.netName = bound.netName;
      }
    }
  }

  // 供手布 addProbe 关联原理图 UUID（仪器等 isLayoutable=false 的器件）
  const refToSchId = {};
  for (const d of topo.deviceList || []) {
    if (d.refName && d.instUuid) refToSchId[d.refName] = d.instUuid;
  }
  doc._refToSchId = refToSchId;

  fitBoardToContent(doc);
  separateClosePads(doc, 50);
  addBoardAccessories(doc);
  separateClosePads(doc, 50);
  return { doc, placed, skipped };
}

/** 异封装焊盘 Y 向至少错开 pitch，避免 B 横线近距平行互穿 */
function separateClosePads(doc, pitch = 50) {
  const grid = doc.metadata.gridSize || 5;
  const fps = doc.footprints.filter(f => !/^H\d+$/.test(f.refDes));
  let guard = 0;
  let changed = true;
  while (changed && guard++ < 400) {
    changed = false;
    const pads = [];
    for (const fp of fps) {
      for (const pad of fp.pads) {
        if (!pad.netId) continue;
        pads.push({ fp, c: padWorld(fp, pad), ref: fp.refDes });
      }
    }
    for (let i = 0; i < pads.length; i++) {
      for (let j = i + 1; j < pads.length; j++) {
        const a = pads[i];
        const b = pads[j];
        if (a.fp === b.fp) continue;
        const dy = Math.abs(a.c.y - b.c.y);
        if (dy < pitch) {
          const move = b.ref === 'J1' ? a.fp : b.fp;
          move.position.y = snap(move.position.y + pitch, grid);
          changed = true;
        }
      }
    }
  }
  fitBoardToContent(doc);
}

/** 板框紧贴内容，消除大片空白 */
function fitBoardToContent(doc) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let has = false;
  const absorb = (x, y) => {
    has = true;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };
  for (const fp of doc.footprints) {
    const ext = halfExtents(fp.defId);
    absorb(fp.position.x - ext.halfW, fp.position.y - ext.halfH);
    absorb(fp.position.x + ext.halfW, fp.position.y + ext.halfH);
  }
  for (const t of doc.tracks) {
    absorb(t.start.x, t.start.y); absorb(t.end.x, t.end.y);
  }
  for (const v of doc.vias) absorb(v.position.x, v.position.y);
  if (!has) {
    doc.boardOutline.points = [
      { x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 700 }, { x: 0, y: 700 }
    ];
    return;
  }
  const margin = 60;
  // 归一化到原点附近
  const shiftX = minX - margin;
  const shiftY = minY - margin;
  if (Math.abs(shiftX) > 0.5 || Math.abs(shiftY) > 0.5) {
    for (const fp of doc.footprints) {
      fp.position.x -= shiftX;
      fp.position.y -= shiftY;
    }
    for (const t of doc.tracks) {
      t.start.x -= shiftX; t.start.y -= shiftY;
      t.end.x -= shiftX; t.end.y -= shiftY;
    }
    for (const v of doc.vias) {
      v.position.x -= shiftX; v.position.y -= shiftY;
    }
    maxX -= shiftX; maxY -= shiftY;
    minX = margin; minY = margin;
  }
  const boardW = Math.max(maxX + margin, 800);
  const boardH = Math.max(maxY + margin, 600);
  doc.boardOutline.points = [
    { x: 0, y: 0 }, { x: boardW, y: 0 }, { x: boardW, y: boardH }, { x: 0, y: boardH }
  ];
}

/** 添加安装孔 + 板边排针，提升成品板密度与专业感 */
function addBoardAccessories(doc) {
  const pts = doc.boardOutline.points;
  let maxX = 0, maxY = 0;
  for (const p of pts) {
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  const pinCount = Math.min(12, Math.max(6, Math.ceil(Math.max(doc.nets.length, 2))));
  const hdrDef = `FP_PINHDR_${pinCount <= 4 ? 4 : pinCount <= 6 ? 6 : 8}`;
  const hdrHalfH = ((pinCount - 1) * 100) / 2 + 50;
  const reserve = 380;
  maxX = maxX + reserve;
  maxY = Math.max(maxY, Math.max(900, hdrHalfH * 2 + 480));
  doc.boardOutline.points = [
    { x: 0, y: 0 }, { x: maxX, y: 0 }, { x: maxX, y: maxY }, { x: 0, y: maxY }
  ];

  const gnd = doc.nets.find(n => isGndNet(n.name));
  const holeInset = 20;
  const hdrX = maxX - 280;
  const hdrY = Math.min(Math.max(maxY / 2, holeInset + hdrHalfH + 120),
    maxY - holeInset - hdrHalfH - 120);
  const holePositions = [
    { x: holeInset, y: holeInset },
    { x: maxX - holeInset, y: holeInset },
    { x: holeInset, y: maxY - holeInset },
    { x: maxX - holeInset, y: maxY - holeInset }
  ];

  const padClearOk = (ax, ay, ar, bx, by, br) =>
    Math.hypot(ax - bx, ay - by) - ar - br >= 12;

  let hi = 1;
  for (const hp of holePositions) {
    let clash = false;
    for (const fp of doc.footprints) {
      const ext = halfExtents(fp.defId);
      if (Math.abs(fp.position.x - hp.x) < ext.halfW + 70 &&
        Math.abs(fp.position.y - hp.y) < ext.halfH + 70) {
        clash = true;
        break;
      }
    }
    for (let pi = 0; pi < pinCount; pi++) {
      const pitch = 100;
      const startY = -((pinCount - 1) * pitch) / 2;
      const py = hdrY + startY + pi * pitch;
      if (!padClearOk(hp.x, hp.y, 35, hdrX, py, 30)) {
        clash = true;
        break;
      }
    }
    if (clash) continue;
    const hole = instantiate('FP_MOUNT', `H${hi}`, 'MH', hp, 0);
    if (gnd) {
      for (const pad of hole.pads) {
        pad.netId = gnd.id;
        pad.netName = gnd.name;
      }
    }
    doc.footprints.push(hole);
    hi++;
  }

  const hdr = instantiate(hdrDef, 'J1', `1x${pinCount}`, { x: hdrX, y: hdrY }, 0);
  const padCountByNet = new Map();
  for (const fp of doc.footprints) {
    for (const pad of fp.pads) {
      if (!pad.netId) continue;
      padCountByNet.set(pad.netId, (padCountByNet.get(pad.netId) || 0) + 1);
    }
  }
  const candidateNets = doc.nets
    .filter(n => !isGndNet(n.name) && (padCountByNet.get(n.id) || 0) >= 1)
    .sort((a, b) => {
      const ca = padCountByNet.get(a.id) || 0;
      const cb = padCountByNet.get(b.id) || 0;
      // 孤儿网（单焊盘）优先接到排针，避免无法布线
      if (ca !== cb) return ca - cb;
      const ap = isVccNet(a.name) ? 0 : 1;
      const bp = isVccNet(b.name) ? 0 : 1;
      return ap - bp;
    });
  // 尽量让每个候选网至少占一针，再循环填充
  for (let i = 0; i < hdr.pads.length; i++) {
    if (i === 0 && gnd) {
      hdr.pads[i].netId = gnd.id;
      hdr.pads[i].netName = gnd.name;
    } else if (candidateNets.length > 0) {
      const n = candidateNets[(i - 1) % candidateNets.length];
      hdr.pads[i].netId = n.id;
      hdr.pads[i].netName = n.name;
    }
  }
  doc.footprints.push(hdr);
}

/**
 * 通道总线布线（严格分层正交）：
 * - 每焊盘唯一 stubY（内容下方）+ 唯一走廊列
 * - 同列多焊盘：先 B 短横到唯一 jogX，再 F 竖
 * - 独列焊盘：直接 F 竖到 stubY
 * - 之后 B 横到走廊、F 竖到总线、B 总线汇合
 */
function autoRoute(doc) {
  const grid = doc.metadata.gridSize || 5;
  const signalW = Math.max(12, doc.metadata.designRules.defaultTrackWidth);
  const powerW = 24;
  const clr = Math.max(6, doc.metadata.designRules?.minClearance ?? 6);
  const pitch = Math.max(powerW, signalW) + clr * 2 + 8;

  const groups = new Map();
  for (const fp of doc.footprints) {
    for (const pad of fp.pads) {
      if (!pad.netId) continue;
      let g = groups.get(pad.netId);
      if (!g) {
        g = { netId: pad.netId, netName: pad.netName || '', points: [] };
        groups.set(pad.netId, g);
      }
      g.points.push(padWorld(fp, pad));
    }
  }

  const routeNets = Array.from(groups.values())
    .filter(g => g.points.length >= 2 && !isGndNet(g.netName))
    .sort((a, b) => {
      const ap = isVccNet(a.netName) ? 0 : 1;
      const bp = isVccNet(b.netName) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return b.points.length - a.points.length;
    });

  let maxContentY = 0;
  let maxContentX = 0;
  for (const fp of doc.footprints) {
    if (/^H\d+$/.test(fp.refDes)) continue;
    const ext = halfExtents(fp.defId);
    maxContentY = Math.max(maxContentY, fp.position.y + ext.halfH);
    maxContentX = Math.max(maxContentX, fp.position.x + ext.halfW);
  }
  for (const g of routeNets) {
    for (const p of g.points) {
      maxContentY = Math.max(maxContentY, p.y);
      maxContentX = Math.max(maxContentX, p.x);
    }
  }

  const allPads = [];
  for (const g of routeNets) {
    for (const p of g.points) {
      allPads.push({ g, p, key: `${g.netId}@${Math.round(p.x)}@${Math.round(p.y)}` });
    }
  }
  allPads.sort((a, b) => a.p.x - b.p.x || a.p.y - b.p.y || a.key.localeCompare(b.key));

  const xCount = new Map();
  for (const item of allPads) {
    const xi = snap(item.p.x, grid);
    xCount.set(xi, (xCount.get(xi) || 0) + 1);
  }

  // 每焊盘唯一 stubY / jogX / 走廊列（jog 带与走廊带串行分配，禁止交错）
  const padStubY = new Map();
  const padCol = new Map();
  const padJogX = new Map();
  let stubY = snap(maxContentY + 60, grid);
  let jogCursor = snap(maxContentX + 40, grid);
  const usedJog = [];

  for (const item of allPads) {
    padStubY.set(item.key, stubY);
    stubY = snap(stubY + pitch, grid);

    const px = snap(item.p.x, grid);
    let jx = px;
    const needJog = (xCount.get(px) || 0) > 1 ||
      usedJog.some(u => Math.abs(u - jx) < pitch);
    if (needJog) {
      jx = jogCursor;
      while (usedJog.some(u => Math.abs(u - jx) < pitch)) jx = snap(jx + pitch, grid);
      jogCursor = snap(jx + pitch, grid);
    }
    usedJog.push(jx);
    padJogX.set(item.key, jx);
  }

  // 走廊列全部在 jog 带右侧，且与所有 jog/px 竖线保持 pitch
  let colX = snap(Math.max(maxContentX + 120, jogCursor + 60), grid);
  for (const item of allPads) {
    while (usedJog.some(u => Math.abs(u - colX) < pitch)) colX = snap(colX + pitch, grid);
    padCol.set(item.key, colX);
    usedJog.push(colX);
    colX = snap(colX + pitch, grid);
  }

  const busStartY = snap(stubY + 60, grid);
  const busBottom = busStartY + Math.max(routeNets.length, 1) * pitch + 80;
  let boardW = Math.max(...doc.boardOutline.points.map(p => p.x), colX + 120);
  let boardH = Math.max(...doc.boardOutline.points.map(p => p.y), busBottom + 80);
  doc.boardOutline.points = [
    { x: 0, y: 0 }, { x: boardW, y: 0 }, { x: boardW, y: boardH }, { x: 0, y: boardH }
  ];

  const addVia = (pos, netId, netName) => {
    if (doc.vias.some(v => v.netId === netId && dist(v.position, pos) < 1)) return;
    doc.vias.push({
      id: uid('via'), position: { x: pos.x, y: pos.y },
      drill: 12, diameter: 24, netId, netName, layers: ['F.Cu', 'B.Cu']
    });
  };
  const pushSeg = (a, b, layer, netId, netName, width) => {
    if (dist(a, b) < 0.5) return;
    doc.tracks.push({
      id: uid('trk'), layer,
      start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
      width, netId, netName
    });
  };

  for (let i = 0; i < routeNets.length; i++) {
    const g = routeNets[i];
    const width = isVccNet(g.netName) ? powerW : signalW;
    const busY = snap(busStartY + i * pitch, grid);
    const pts = g.points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    const hub = pts[0];
    const hubKey = `${g.netId}@${Math.round(hub.x)}@${Math.round(hub.y)}`;
    const hubSx = padCol.get(hubKey);
    const hubBus = { x: hubSx, y: busY };

    for (const p of pts) {
      const key = `${g.netId}@${Math.round(p.x)}@${Math.round(p.y)}`;
      const jx = padJogX.get(key);
      const sy = padStubY.get(key);
      const sx = padCol.get(key);
      const px = snap(p.x, grid);
      const py = snap(p.y, grid);
      const atJog = { x: jx, y: py };
      const atJogStub = { x: jx, y: sy };
      const atColStub = { x: sx, y: sy };
      const atBus = { x: sx, y: busY };

      addVia(p, g.netId, g.netName);
      // 同列：B 短横到 jog；独列：jogX==px，无横线
      pushSeg(p, atJog, 'B.Cu', g.netId, g.netName, width);
      addVia(atJog, g.netId, g.netName);
      // F 竖到唯一 stubY
      pushSeg(atJog, atJogStub, 'F.Cu', g.netId, g.netName, width);
      addVia(atJogStub, g.netId, g.netName);
      // B 横到走廊
      pushSeg(atJogStub, atColStub, 'B.Cu', g.netId, g.netName, width);
      addVia(atColStub, g.netId, g.netName);
      // F 竖到总线 + B 汇合
      pushSeg(atColStub, atBus, 'F.Cu', g.netId, g.netName, width);
      addVia(atBus, g.netId, g.netName);
      if (Math.abs(sx - hubSx) > 0.5) {
        pushSeg(atBus, hubBus, 'B.Cu', g.netId, g.netName, width);
      }
    }
  }

  return { trackCount: doc.tracks.length, netCount: routeNets.length, viaCount: doc.vias.length };
}

function zoneOutlineFromBoard(doc, margin = 40) {
  const pts = doc.boardOutline.points;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return [
    { x: minX + margin, y: minY + margin },
    { x: maxX - margin, y: minY + margin },
    { x: maxX - margin, y: maxY - margin },
    { x: minX + margin, y: maxY - margin }
  ];
}

function buildCutouts(doc, netId) {
  const cutouts = [];
  for (const fp of doc.footprints) {
    for (const pad of fp.pads) {
      if (pad.netId === netId) continue;
      const c = padWorld(fp, pad);
      const hw = Math.max(pad.size.x, pad.size.y) / 2 + 12;
      cutouts.push([
        { x: c.x - hw, y: c.y - hw }, { x: c.x + hw, y: c.y - hw },
        { x: c.x + hw, y: c.y + hw }, { x: c.x - hw, y: c.y + hw }
      ]);
    }
  }
  return cutouts;
}

function pourPlanes(doc) {
  let count = 0;
  const outline = zoneOutlineFromBoard(doc, 40);
  const gnd = doc.nets.find(n => isGndNet(n.name));
  if (gnd) {
    doc.zones.push({
      id: uid('zone'), layer: 'B.Cu', netId: gnd.id, netName: gnd.name,
      outline: outline.map(p => ({ x: p.x, y: p.y })),
      priority: 0, clearance: 10, cutouts: buildCutouts(doc, gnd.id),
      manualCutouts: [], thermalRelief: true, thermalGap: 12, thermalWidth: 10
    });
    count++;
  }
  // 较大板上补一层经典 VCC 顶层铺铜（局部感），提升专业观感
  const vcc = doc.nets.find(n => isPourableVccNet(n.name));
  const boardW = Math.max(...doc.boardOutline.points.map(p => p.x));
  const boardH = Math.max(...doc.boardOutline.points.map(p => p.y));
  if (vcc && boardW * boardH > 900000 && doc.footprints.length >= 8) {
    const topStrip = [
      { x: outline[0].x, y: outline[0].y },
      { x: outline[1].x, y: outline[0].y },
      { x: outline[1].x, y: outline[0].y + Math.min(220, boardH * 0.18) },
      { x: outline[0].x, y: outline[0].y + Math.min(220, boardH * 0.18) }
    ];
    doc.zones.push({
      id: uid('zone'), layer: 'F.Cu', netId: vcc.id, netName: vcc.name,
      outline: topStrip, priority: 1, clearance: 12,
      cutouts: buildCutouts(doc, vcc.id),
      manualCutouts: [], thermalRelief: true, thermalGap: 12, thermalWidth: 12
    });
    count++;
  }
  return count;
}

/**
 * SMD GND 焊盘仅在 F.Cu，B.Cu 铺铜接不到 → 短线 + 缝合过孔接到地铺铜。
 * 通孔焊盘已含 B.Cu，可由铺铜直接连通。
 */
function stitchGndToPour(doc) {
  const gnd = doc.nets.find(n => isGndNet(n.name));
  if (!gnd) return { vias: 0, tracks: 0 };
  const grid = doc.metadata.gridSize || 5;
  const clr = Math.max(6, doc.metadata.designRules?.minClearance ?? 6);
  let viaCount = 0;
  let trackCount = 0;
  for (const fp of doc.footprints) {
    for (const pad of fp.pads) {
      if (pad.netId !== gnd.id) continue;
      const layers = pad.layers || [];
      if (pad.type === 'th' || layers.includes('B.Cu')) continue;
      const pos = padWorld(fp, pad);
      // 已有同网过孔/逃逸走线则不再贴焊盘打缝合孔（避免与 SOIC 焊盘视觉重合）
      const alreadyVia = doc.vias.some(v =>
        v.netId === gnd.id && dist(v.position, pos) < 100);
      if (alreadyVia) continue;
      const alreadyFanout = doc.tracks.some(t =>
        t.netId === gnd.id &&
        (dist(t.start, pos) < 12 || dist(t.end, pos) < 12));
      if (alreadyFanout) continue;
      const ox = Math.abs(pad.size?.x || 40) / 2 + 28;
      const oy = Math.abs(pad.size?.y || 40) / 2 + 28;
      const candidates = [
        { x: snap(pos.x + ox, grid), y: snap(pos.y, grid) },
        { x: snap(pos.x - ox, grid), y: snap(pos.y, grid) },
        { x: snap(pos.x, grid), y: snap(pos.y + oy, grid) },
        { x: snap(pos.x, grid), y: snap(pos.y - oy, grid) }
      ];
      let placed = false;
      for (const stitch of candidates) {
        // 优先：无走线，过孔足够近即算连通；否则短线且不撞线
        const nearEnough = dist(pos, stitch) <= 24;
        if (!nearEnough &&
          !pathClearOfTracks(doc, [pos, stitch], gnd.id, 'F.Cu', 12, clr)) {
          continue;
        }
        if (!nearEnough) {
          doc.tracks.push({
            id: uid('trk'), layer: 'F.Cu',
            start: { x: pos.x, y: pos.y },
            end: { x: stitch.x, y: stitch.y },
            width: 12, netId: gnd.id, netName: gnd.name
          });
          trackCount++;
        }
        doc.vias.push({
          id: uid('via'), position: { x: stitch.x, y: stitch.y },
          drill: 12, diameter: 24, netId: gnd.id, netName: gnd.name,
          layers: ['F.Cu', 'B.Cu']
        });
        viaCount++;
        placed = true;
        break;
      }
      if (!placed) {
        const stitch = candidates[0];
        doc.vias.push({
          id: uid('via'), position: { x: stitch.x, y: stitch.y },
          drill: 12, diameter: 24, netId: gnd.id, netName: gnd.name,
          layers: ['F.Cu', 'B.Cu']
        });
        viaCount++;
      }
    }
  }
  return { vias: viaCount, tracks: trackCount };
}

function integrityHash(obj) {
  const raw = JSON.stringify(obj);
  return createHash('sha256').update(raw).digest('hex');
}

function buildPcbsim(sch, pcb) {
  const now = new Date().toISOString();
  const body = {
    magic: 'SCHSIM',
    version: sch.version || '2.0.0',
    name: sch.name || pcb.name,
    topology: sch.topology,
    pcb,
    simConfig: sch.simConfig || { simMode: 'mixed' },
    aiConfigs: sch.aiConfigs || [],
    createdAt: sch.createdAt || now,
    modifiedAt: now
  };
  body.integrityHash = integrityHash({
    topology: body.topology, pcb: body.pcb, simConfig: body.simConfig
  });
  return body;
}

function updateManifest(dir) {
  const manifestPath = join(dir, 'template_manifest.json');
  if (!existsSync(manifestPath)) return;
  const man = JSON.parse(readFileSync(manifestPath, 'utf8'));
  man.description =
    'Each .schsim / .pcbsim is a lab template, packed to rawfile/Test_Template';
  for (const t of man.templates || []) {
    t.pcbFile = `${t.id}.pcbsim`;
  }
  writeFileSync(manifestPath, JSON.stringify(man, null, 2) + '\n', 'utf8');
}

/**
 * 直流电源电路手写成品布局：正交总线 + 水平接入排针，保证间距/连通。
 * 自动布线在小电源板上易斜穿/共线，教学模板以本布局为准。
 */
function handLayoutLabPower(doc) {
  doc.tracks = [];
  doc.vias = [];
  doc.zones = [];
  // 去掉自动配件，仅保留原理图关联器件
  doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
  const byRef = new Map(doc.footprints.map(f => [f.refDes, f]));
  const setPos = (ref, x, y, rot) => {
    const fp = byRef.get(ref);
    if (!fp) return;
    fp.position = { x, y };
    fp.rotation = rot;
    fp.mirrored = false;
    fp.layer = 'F.Cu';
  };
  // 左：保险/稳压/滤波；右：排针（板框与安装孔由 fit + addCornerMountHoles 决定）
  setPos('U1', 700, 420, 0);
  setPos('F1', 480, 280, 90);
  setPos('C1', 520, 680, 0);
  setPos('C2', 880, 680, 0);
  setPos('R1', 1080, 680, 90);

  const gnd = doc.nets.find(n => isGndNet(n.name));
  const netByName = (name) => doc.nets.find(n => (n.name || '').toUpperCase() === name);
  const vin = netByName('VIN_SRC');
  const reg = netByName('REG_IN');
  const vout = netByName('VOUT');

  const hdr = instantiate('FP_PINHDR_4', 'J1', '1x4', { x: 1420, y: 550 }, 0);
  const hdrNets = [gnd, vin, reg, vout];
  for (let i = 0; i < hdr.pads.length; i++) {
    const n = hdrNets[i];
    if (!n) continue;
    hdr.pads[i].netId = n.id;
    hdr.pads[i].netName = n.name;
  }
  doc.footprints.push(hdr);

  const pw = (ref, num) => {
    const fp = doc.footprints.find(f => f.refDes === ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    return padWorld(fp, pad);
  };
  const add = (net, a, b, w = 24, layer = 'F.Cu') => {
    if (!net || dist(a, b) < 0.5) return;
    doc.tracks.push({
      id: uid('trk'), layer,
      start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
      width: w, netId: net.id, netName: net.name
    });
  };
  const L = (net, pts, w = 24) => {
    for (let i = 0; i < pts.length - 1; i++) add(net, pts[i], pts[i + 1], w);
  };

  const u1in = pw('U1', 1), u1g = pw('U1', 2), u1out = pw('U1', 3);
  const f1a = pw('F1', 1), f1b = pw('F1', 2);
  const c1a = pw('C1', 1), c1b = pw('C1', 2);
  const c2a = pw('C2', 1), c2b = pw('C2', 2);
  const r1a = pw('R1', 1), r1b = pw('R1', 2);
  const jGnd = pw('J1', 1), jVin = pw('J1', 2), jReg = pw('J1', 3), jVout = pw('J1', 4);

  // VIN_SRC：顶层水平总线 y=220，竖脊 x=1300，水平接入 J1.P2
  L(vin, [f1a, { x: 1300, y: f1a.y }, { x: 1300, y: jVin.y }, jVin], 24);

  // REG_IN：从上方竖直接入 C1.P1，避免 y=680 横线穿过 C1.P2(GND)
  L(reg, [u1in, { x: c1a.x, y: u1in.y }, c1a], 24);
  L(reg, [f1b, { x: u1in.x, y: f1b.y }, u1in], 24);
  L(reg, [
    { x: u1in.x, y: f1b.y },
    { x: 1220, y: f1b.y },
    { x: 1220, y: jReg.y },
    jReg
  ], 24);

  // VOUT：接到 C2.P1 后走下方总线；侧向接入 R1.P1，避免沿 x=1080 竖穿 R1.P2(GND)
  L(vout, [u1out, { x: u1out.x, y: c2a.y }, c2a], 24);
  const vBusY = 850;
  const rApproachX = r1a.x - 80;
  L(vout, [
    c2a,
    { x: c2a.x, y: vBusY },
    { x: rApproachX, y: vBusY },
    { x: rApproachX, y: r1a.y },
    r1a
  ], 24);
  L(vout, [
    { x: rApproachX, y: vBusY },
    { x: 1340, y: vBusY },
    { x: 1340, y: jVout.y },
    jVout
  ], 24);

  // GND：SMD 焊盘打过孔后走 B.Cu 总线，连通 U1.GND / C1·C2·R1 / J1.1
  // （顶层电源走线密集，地线放底层避免与 REG/VOUT 共线）
  const addVia = (net, p) => {
    if (!net) return;
    for (const v of doc.vias) {
      if (v.netId === net.id && Math.abs(v.position.x - p.x) < 0.5 &&
        Math.abs(v.position.y - p.y) < 0.5) return;
    }
    doc.vias.push({
      id: uid('via'),
      position: { x: p.x, y: p.y },
      drill: 12, diameter: 24,
      netId: net.id, netName: net.name,
      layers: ['F.Cu', 'B.Cu'], kind: 'through'
    });
  };
  const addB = (net, a, b, w = 20) => add(net, a, b, w, 'B.Cu');
  if (gnd) {
    addVia(gnd, c1b);
    addVia(gnd, c2b);
    addVia(gnd, r1b);
    const gndY = c1b.y;
    addB(gnd, u1g, { x: u1g.x, y: gndY });
    addB(gnd, { x: u1g.x, y: gndY }, c1b);
    addB(gnd, c1b, c2b);
    addB(gnd, c2b, { x: r1b.x, y: gndY });
    addB(gnd, { x: r1b.x, y: gndY }, r1b);
    const gndRiseX = 1180;
    addB(gnd, c2b, { x: gndRiseX, y: gndY });
    addB(gnd, { x: gndRiseX, y: gndY }, { x: gndRiseX, y: jGnd.y });
    addB(gnd, { x: gndRiseX, y: jGnd.y }, jGnd);
  }

  return {
    trackCount: doc.tracks.length,
    netCount: [vin, reg, vout, gnd].filter(Boolean).length,
    viaCount: doc.vias.length
  };
}

/**
 * 运算放大电路手写成品布局：LM358 同相放大 + 反馈网络。
 * 布局：Rf 上 / U1 中 / R1·Rg 下。
 * 到排针：器件区用 F 上升到板顶专属 runY（避免 B 竖穿 FB 的 B 横线），再 B 横到 riseX 下落。
 *
 * LM358 SOIC-8：1 OUT1  2 IN-1  3 IN+1  4 V-  5 IN+2  6 IN-2  7 OUT2  8 V+
 */
function handLayoutLabAmp(doc) {
  doc.tracks = [];
  doc.vias = [];
  doc.zones = [];
  doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
  const byRef = new Map(doc.footprints.map(f => [f.refDes, f]));
  const setPos = (ref, x, y, rot) => {
    const fp = byRef.get(ref);
    if (!fp) return;
    fp.position = { x, y };
    fp.rotation = rot;
    fp.mirrored = false;
    fp.layer = 'F.Cu';
  };

  const gnd = doc.nets.find(n => isGndNet(n.name));
  const netByName = (name) => doc.nets.find(n => (n.name || '').toUpperCase() === name);
  const vcc = netByName('VCC');
  const sigSrc = netByName('SIG_SRC');
  const sigIn = netByName('SIG_IN');
  const fb = netByName('FB');
  const sigOut = netByName('SIG_OUT');
  const bFb = netByName('U1_B_FB');

  setPos('Rf', 640, 250, 0);
  setPos('U1', 640, 470, 0);
  setPos('R1', 420, 740, 0);
  setPos('Rg', 420, 920, 0);

  const hdr = instantiate('FP_PINHDR_6', 'J1', '1x6', { x: 1480, y: 580 }, 0);
  const hdrNets = [gnd, vcc, sigSrc, sigIn, sigOut, fb];
  for (let i = 0; i < hdr.pads.length; i++) {
    const n = hdrNets[i];
    if (!n) continue;
    hdr.pads[i].netId = n.id;
    hdr.pads[i].netName = n.name;
  }
  doc.footprints.push(hdr);

  const pw = (ref, num) => {
    const fp = doc.footprints.find(f => f.refDes === ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    return padWorld(fp, pad);
  };

  const add = (net, a, b, w = 14, layer = 'F.Cu') => {
    if (!net || dist(a, b) < 0.5) return;
    doc.tracks.push({
      id: uid('trk'), layer,
      start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
      width: w, netId: net.id, netName: net.name
    });
  };
  const addVia = (net, p) => {
    if (!net) return;
    for (const v of doc.vias) {
      if (v.netId === net.id && Math.abs(v.position.x - p.x) < 0.5 &&
        Math.abs(v.position.y - p.y) < 0.5) return;
    }
    doc.vias.push({
      id: uid('via'),
      position: { x: p.x, y: p.y },
      drill: 12, diameter: 24,
      netId: net.id, netName: net.name,
      layers: ['F.Cu', 'B.Cu'], kind: 'through'
    });
  };

  const escape = (net, padPt, dirX, w = 14, stubLen = 50) => {
    const e = { x: padPt.x + dirX * stubLen, y: padPt.y };
    add(net, padPt, e, w, 'F.Cu');
    addVia(net, e);
    return e;
  };

  /**
   * 到排针：从 esc 用 F 升到板顶 runY（器件左侧走廊），B 横到 riseX，F 下落进针。
   * 右侧起点（x>=900）可直接 B 升，少占 F。
   */
  let slot = 0;
  const toHeader = (net, esc, jPad, w = 14) => {
    if (!net) return;
    const s = slot++;
    const riseX = 1080 + s * 40;
    const runY = 70 + s * 30;
    const atRun = { x: esc.x, y: runY };
    const atCol = { x: riseX, y: runY };
    const atRow = { x: riseX, y: jPad.y };
    const riseLayer = esc.x < 900 ? 'F.Cu' : 'B.Cu';
    add(net, esc, atRun, w, riseLayer);
    addVia(net, atRun);
    add(net, atRun, atCol, w, 'B.Cu');
    addVia(net, atCol);
    add(net, atCol, atRow, w, 'F.Cu');
    addVia(net, atRow);
    add(net, atRow, { x: jPad.x, y: jPad.y }, w, 'B.Cu');
    addVia(net, jPad);
  };

  const uOut1 = pw('U1', 1), uInM1 = pw('U1', 2), uInP1 = pw('U1', 3), uVm = pw('U1', 4);
  const uInP2 = pw('U1', 5), uInM2 = pw('U1', 6), uOut2 = pw('U1', 7), uVp = pw('U1', 8);
  const r1a = pw('R1', 1), r1b = pw('R1', 2);
  const rfa = pw('Rf', 1), rfb = pw('Rf', 2);
  const rga = pw('Rg', 1), rgb = pw('Rg', 2);
  const jGnd = pw('J1', 1), jVcc = pw('J1', 2), jSrc = pw('J1', 3);
  const jIn = pw('J1', 4), jOut = pw('J1', 5), jFb = pw('J1', 6);

  add(bFb, uOut2, uInM2, 10, 'F.Cu');

  // GND：底边 B；Rg 右侧接到 eGndR，避免竖穿 R1
  const eGndL = escape(gnd, uVm, -1, 12, 120);
  const eGndR = escape(gnd, uInP2, 1, 12, 55);
  add(gnd, eGndL, eGndR, 12, 'B.Cu');
  const eRgb = escape(gnd, rgb, 1, 12, 40);
  add(gnd, eRgb, { x: eGndR.x, y: eRgb.y }, 12, 'B.Cu');
  addVia(gnd, { x: eGndR.x, y: eRgb.y });
  add(gnd, { x: eGndR.x, y: eRgb.y }, eGndR, 12, 'F.Cu');

  // SIG_OUT：左逃远离 FB stub；通道放在 Rf 与 U1 之间，避开板顶 header runY 带
  const eOut = escape(sigOut, uOut1, -1, 14, 95);
  const eRfb = escape(sigOut, rfb, 1, 14, 45);
  const outChanY = Math.round((rfb.y + uOut1.y) / 2);
  const outMid = { x: eOut.x, y: outChanY };
  const outAtRfb = { x: eRfb.x, y: outChanY };
  add(sigOut, eOut, outMid, 14, 'F.Cu');
  addVia(sigOut, outMid);
  add(sigOut, outMid, outAtRfb, 14, 'B.Cu');
  addVia(sigOut, outAtRfb);
  add(sigOut, outAtRfb, eRfb, 14, 'F.Cu');

  // SIG_IN：专属 inCol（在 GND/OUT 逃逸以左）F 上升，两端 B 接入
  const eR1b = escape(sigIn, r1b, 1, 14, 45);
  const eInP = escape(sigIn, uInP1, -1, 14, 45);
  const inCol = Math.min(eGndL.x, eOut.x) - 45;
  const inAtR1 = { x: inCol, y: eR1b.y };
  const inAtPad = { x: inCol, y: eInP.y };
  add(sigIn, eR1b, inAtR1, 14, 'B.Cu');
  addVia(sigIn, inAtR1);
  add(sigIn, inAtR1, inAtPad, 14, 'F.Cu');
  addVia(sigIn, inAtPad);
  add(sigIn, inAtPad, eInP, 14, 'B.Cu');

  // FB 左 rail
  const eInM = escape(fb, uInM1, -1, 14, 70);
  const eRfa = escape(fb, rfa, -1, 14, 50);
  const eRga = escape(fb, rga, -1, 14, 45);
  const fbRail = Math.min(eInM.x, eRfa.x, eRga.x, eOut.x, eGndL.x, inCol, r1a.x - 50) - 50;
  add(fb, eInM, { x: fbRail, y: eInM.y }, 14, 'B.Cu');
  addVia(fb, { x: fbRail, y: eInM.y });
  add(fb, { x: fbRail, y: eInM.y }, { x: fbRail, y: eRfa.y }, 14, 'F.Cu');
  addVia(fb, { x: fbRail, y: eRfa.y });
  add(fb, { x: fbRail, y: eRfa.y }, eRfa, 14, 'B.Cu');
  add(fb, { x: fbRail, y: eRfa.y }, { x: fbRail, y: eRga.y }, 14, 'F.Cu');
  addVia(fb, { x: fbRail, y: eRga.y });
  add(fb, { x: fbRail, y: eRga.y }, eRga, 14, 'B.Cu');

  // 扇出：左侧网从走廊点出发（F 升），右侧网从逃逸点出发
  const eSrc = escape(sigSrc, r1a, -1, 14, 40);
  // SIG_SRC 先 B 到 inCol 左侧专属列，避免与 inCol 上 SIG_IN 共列
  const srcCol = inCol - 40;
  add(sigSrc, eSrc, { x: srcCol, y: eSrc.y }, 14, 'B.Cu');
  addVia(sigSrc, { x: srcCol, y: eSrc.y });
  toHeader(sigSrc, { x: srcCol, y: eSrc.y }, jSrc, 14);
  toHeader(sigIn, inAtPad, jIn, 14);
  toHeader(fb, { x: fbRail, y: eRga.y }, jFb, 14);
  toHeader(sigOut, eRfb, jOut, 14);
  // 右侧 VCC/GND：短 stub 后 B 横到互异列再 F 升，避免竖穿对方 stub
  const eVcc = escape(vcc, uVp, 1, 20, 55);
  const vccCol = { x: eVcc.x + 90, y: eVcc.y };
  const gndColPt = { x: eGndR.x + 140, y: eGndR.y };
  add(vcc, eVcc, vccCol, 20, 'B.Cu');
  addVia(vcc, vccCol);
  add(gnd, eGndR, gndColPt, 16, 'B.Cu');
  addVia(gnd, gndColPt);
  toHeader(vcc, vccCol, jVcc, 20);
  toHeader(gnd, gndColPt, jGnd, 16);

  return {
    trackCount: doc.tracks.length,
    netCount: [sigSrc, sigIn, fb, sigOut, vcc, bFb].filter(Boolean).length,
    viaCount: doc.vias.length
  };
}

/**
 * RC 滤波 + LM358 电压跟随手写布局。
 * SIG_SRC→R1→SIG_MID（C1 到地）→U1 IN+；OUT1↔IN- 为 BUF_FB 跟随输出。
 */
function handLayoutLabFilter(doc) {
  doc.tracks = [];
  doc.vias = [];
  doc.zones = [];
  doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
  const byRef = new Map(doc.footprints.map(f => [f.refDes, f]));
  const setPos = (ref, x, y, rot) => {
    const fp = byRef.get(ref);
    if (!fp) return;
    fp.position = { x, y };
    fp.rotation = rot;
    fp.mirrored = false;
    fp.layer = 'F.Cu';
  };

  const gnd = doc.nets.find(n => isGndNet(n.name));
  const netByName = (name) => doc.nets.find(n => (n.name || '').toUpperCase() === name);
  const vcc = netByName('VCC');
  const sigSrc = netByName('SIG_SRC');
  const sigMid = netByName('SIG_MID');
  const bufFb = netByName('BUF_FB');
  const bFb = netByName('U1_B_FB');

  setPos('R1', 300, 380, 0);
  setPos('C1', 480, 560, 90);
  setPos('U1', 700, 400, 0);

  const hdr = instantiate('FP_PINHDR_6', 'J1', '1x5', { x: 1280, y: 460 }, 0);
  const hdrNets = [gnd, vcc, sigSrc, sigMid, bufFb];
  for (let i = 0; i < hdr.pads.length; i++) {
    const n = hdrNets[i];
    if (!n) continue;
    hdr.pads[i].netId = n.id;
    hdr.pads[i].netName = n.name;
  }
  doc.footprints.push(hdr);

  const pw = (ref, num) => {
    const fp = doc.footprints.find(f => f.refDes === ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    return padWorld(fp, pad);
  };
  const add = (net, a, b, w = 14, layer = 'F.Cu') => {
    if (!net || dist(a, b) < 0.5) return;
    doc.tracks.push({
      id: uid('trk'), layer,
      start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
      width: w, netId: net.id, netName: net.name
    });
  };
  const addVia = (net, p) => {
    if (!net) return;
    for (const v of doc.vias) {
      if (v.netId === net.id && Math.abs(v.position.x - p.x) < 0.5 &&
        Math.abs(v.position.y - p.y) < 0.5) return;
    }
    doc.vias.push({
      id: uid('via'),
      position: { x: p.x, y: p.y },
      drill: 12, diameter: 24,
      netId: net.id, netName: net.name,
      layers: ['F.Cu', 'B.Cu'], kind: 'through'
    });
  };
  const escape = (net, padPt, dirX, w = 14, stubLen = 50) => {
    const e = { x: padPt.x + dirX * stubLen, y: padPt.y };
    add(net, padPt, e, w, 'F.Cu');
    addVia(net, e);
    return e;
  };

  let slot = 0;
  const toHeader = (net, esc, jPad, w = 14) => {
    if (!net) return;
    const s = slot++;
    const riseX = 1000 + s * 40;
    const runY = 70 + s * 28;
    const atRun = { x: esc.x, y: runY };
    const atCol = { x: riseX, y: runY };
    const atRow = { x: riseX, y: jPad.y };
    const riseLayer = esc.x < 900 ? 'F.Cu' : 'B.Cu';
    add(net, esc, atRun, w, riseLayer);
    addVia(net, atRun);
    add(net, atRun, atCol, w, 'B.Cu');
    addVia(net, atCol);
    add(net, atCol, atRow, w, 'F.Cu');
    addVia(net, atRow);
    add(net, atRow, { x: jPad.x, y: jPad.y }, w, 'B.Cu');
    addVia(net, jPad);
  };

  const uOut1 = pw('U1', 1), uInM1 = pw('U1', 2), uInP1 = pw('U1', 3), uVm = pw('U1', 4);
  const uInP2 = pw('U1', 5), uInM2 = pw('U1', 6), uOut2 = pw('U1', 7), uVp = pw('U1', 8);
  const r1a = pw('R1', 1), r1b = pw('R1', 2);
  const c1a = pw('C1', 1), c1b = pw('C1', 2);
  const jGnd = pw('J1', 1), jVcc = pw('J1', 2), jSrc = pw('J1', 3);
  const jMid = pw('J1', 4), jOut = pw('J1', 5);

  add(bFb, uOut2, uInM2, 10, 'F.Cu');
  add(bufFb, uOut1, uInM1, 12, 'F.Cu');

  // GND 先布：左逃加长，给 SIG_MID 左侧走廊留空
  const eC1b = escape(gnd, c1b, 1, 14, 40);
  const eGndL = escape(gnd, uVm, -1, 12, 100);
  const eGndR = escape(gnd, uInP2, 1, 12, 55);
  add(gnd, eGndL, eGndR, 12, 'B.Cu');
  add(gnd, eC1b, { x: eC1b.x, y: eGndL.y }, 14, 'F.Cu');
  addVia(gnd, { x: eC1b.x, y: eGndL.y });
  add(gnd, { x: eC1b.x, y: eGndL.y }, eGndL, 14, 'B.Cu');

  // SIG_MID：R1→C1→左侧走廊→IN+（不穿 GND/OUT stub 列）
  const eR1b = escape(sigMid, r1b, 1, 14, 40);
  const eC1a = escape(sigMid, c1a, -1, 14, 40);
  const eInP = escape(sigMid, uInP1, -1, 14, 40);
  const inCol = Math.min(eGndL.x, eC1a.x) - 45;
  add(sigMid, eR1b, { x: eR1b.x, y: eC1a.y }, 14, 'F.Cu');
  addVia(sigMid, { x: eR1b.x, y: eC1a.y });
  add(sigMid, { x: eR1b.x, y: eC1a.y }, eC1a, 14, 'B.Cu');
  const midAtC = { x: inCol, y: eC1a.y };
  const midAtIn = { x: inCol, y: eInP.y };
  add(sigMid, eC1a, midAtC, 14, 'B.Cu');
  addVia(sigMid, midAtC);
  add(sigMid, midAtC, midAtIn, 14, 'F.Cu');
  addVia(sigMid, midAtIn);
  add(sigMid, midAtIn, eInP, 14, 'B.Cu');

  // BUF_FB 扇出：从 OUT1 上绕到芯片右侧再进排针
  const eOut = escape(bufFb, uOut1, -1, 14, 55);
  const outJog = { x: eOut.x, y: eOut.y - 70 };
  add(bufFb, eOut, outJog, 14, 'F.Cu');
  addVia(bufFb, outJog);
  const outCol = { x: uVp.x + 100, y: outJog.y };
  add(bufFb, outJog, outCol, 14, 'B.Cu');
  addVia(bufFb, outCol);

  const eSrc = escape(sigSrc, r1a, -1, 14, 45);
  const srcCol = Math.min(eSrc.x, inCol) - 40;
  add(sigSrc, eSrc, { x: srcCol, y: eSrc.y }, 14, 'B.Cu');
  addVia(sigSrc, { x: srcCol, y: eSrc.y });
  toHeader(sigSrc, { x: srcCol, y: eSrc.y }, jSrc, 14);
  toHeader(sigMid, midAtIn, jMid, 14);
  toHeader(bufFb, outCol, jOut, 14);
  const eVcc = escape(vcc, uVp, 1, 20, 55);
  const vccCol = { x: eVcc.x + 90, y: eVcc.y };
  add(vcc, eVcc, vccCol, 20, 'B.Cu');
  addVia(vcc, vccCol);
  toHeader(vcc, vccCol, jVcc, 20);
  const gndCol = { x: eGndR.x + 130, y: eGndR.y };
  add(gnd, eGndR, gndCol, 16, 'B.Cu');
  addVia(gnd, gndCol);
  toHeader(gnd, gndCol, jGnd, 16);

  return {
    trackCount: doc.tracks.length,
    netCount: [sigSrc, sigMid, bufFb, vcc, bFb].filter(Boolean).length,
    viaCount: doc.vias.length
  };
}



/**
 * 51 流水灯手写布局：AT89C51 DIP-40 + 晶振/复位 + 8 路 LED。
 * P1.0-P1.7 左侧对齐 LED 行；VCC/GND 分列 B 总线；排针各网专属上升列。
 */
function handLayoutLab51Led(doc) {
  doc.tracks = [];
  doc.vias = [];
  doc.zones = [];
  doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);

  for (const fp of doc.footprints) {
    if (fp.refDes === 'U1') {
      const neu = instantiate('FP_DIP40', 'U1', fp.value || 'AT89C51', fp.position, 0, fp.schematicCompId);
      fp.defId = neu.defId;
      fp.pads = neu.pads;
      for (const p of fp.pads) { p.netId = undefined; p.netName = undefined; }
    } else if (fp.refDes === 'Y1' && fp.defId !== 'FP_HC49') {
      const neu = instantiate('FP_HC49', 'Y1', fp.value || '11.0592M', fp.position, 0, fp.schematicCompId);
      fp.defId = neu.defId;
      fp.pads = neu.pads;
      for (const p of fp.pads) { p.netId = undefined; p.netName = undefined; }
    }
  }

  const byRef = new Map(doc.footprints.map(f => [f.refDes, f]));
  const setPos = (ref, x, y, rot = 0) => {
    const fp = byRef.get(ref);
    if (!fp) return;
    fp.position = { x, y };
    fp.rotation = rot;
    fp.mirrored = false;
    fp.layer = 'F.Cu';
  };

  const gnd = doc.nets.find(n => isGndNet(n.name));
  const netByName = (name) => doc.nets.find(n => (n.name || '').toUpperCase() === name);
  const vcc = netByName('VCC');
  const xtal1 = netByName('XTAL1');
  const xtal2 = netByName('XTAL2');
  const nrst = netByName('NRST');
  const pwrLed = netByName('PWR_LED');

  const ux = 820, uy = 1200;
  const leftX = ux - 300;
  const rightX = ux + 300;
  const pinY = (n) => uy - 950 + (n - 1) * 100; // pad 1..20 left column

  setPos('U1', ux, uy, 0);
  for (let i = 0; i < 8; i++) {
    const y = pinY(i + 1);
    setPos(`RL${i + 1}`, 260, y, 0);
    setPos(`D${i + 1}`, 400, y, 0);
  }
  // 晶振竖放；CX 旋转 180°：pad1(信号)朝 Y1，pad2(GND)朝外，避免 XTAL 线穿 GND 焊盘
  setPos('Y1', leftX - 200, (pinY(18) + pinY(19)) / 2, 90);
  setPos('CX1', leftX - 360, pinY(19), 180);
  setPos('CX2', leftX - 360, pinY(18), 180);
  setPos('R1', leftX - 160, pinY(9), 0);
  // 右区：gndRight < U1.VCC < vccRail < 排针升列
  setPos('C3', rightX + 120, pinY(1) + 100, 0);
  setPos('R_PWR', rightX + 120, pinY(1) - 180, 0);
  setPos('D9', rightX + 280, pinY(1) - 180, 0);

  const hdr = instantiate('FP_PINHDR_4', 'J1', '1x4', { x: 1580, y: uy }, 0);
  const hdrNets = [gnd, vcc, nrst, pwrLed];
  for (let i = 0; i < hdr.pads.length; i++) {
    const n = hdrNets[i];
    if (!n) continue;
    hdr.pads[i].netId = n.id;
    hdr.pads[i].netName = n.name;
  }
  doc.footprints.push(hdr);

  const bindU1 = (padNum, net) => {
    const fp = byRef.get('U1');
    const pad = fp?.pads.find(p => p.number === String(padNum));
    if (pad && net) { pad.netId = net.id; pad.netName = net.name; }
  };
  for (let i = 0; i < 8; i++) bindU1(i + 1, netByName(`L${i}_K`));
  bindU1(9, nrst);
  bindU1(18, xtal2);
  bindU1(19, xtal1);
  bindU1(20, gnd);
  bindU1(31, vcc);
  bindU1(40, vcc);
  const y1 = byRef.get('Y1');
  if (y1) {
    const p1 = y1.pads.find(p => p.number === '1');
    const p2 = y1.pads.find(p => p.number === '2');
    if (p1 && xtal2) { p1.netId = xtal2.id; p1.netName = xtal2.name; }
    if (p2 && xtal1) { p2.netId = xtal1.id; p2.netName = xtal1.name; }
  }

  const pw = (ref, num) => {
    const fp = doc.footprints.find(f => f.refDes === ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    return padWorld(fp, pad);
  };
  const add = (net, a, b, w = 14, layer = 'F.Cu') => {
    if (!net || !a || !b || dist(a, b) < 0.5) return;
    doc.tracks.push({
      id: uid('trk'), layer,
      start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
      width: w, netId: net.id, netName: net.name
    });
  };
  const addVia = (net, p) => {
    if (!net || !p) return;
    for (const v of doc.vias) {
      if (v.netId === net.id && Math.abs(v.position.x - p.x) < 0.5 &&
        Math.abs(v.position.y - p.y) < 0.5) return;
    }
    doc.vias.push({
      id: uid('via'), position: { x: p.x, y: p.y },
      drill: 12, diameter: 24,
      netId: net.id, netName: net.name,
      layers: ['F.Cu', 'B.Cu'], kind: 'through'
    });
  };
  const smdToB = (net, padPt, dx, dy, w = 14) => {
    const e = { x: padPt.x + dx, y: padPt.y + dy };
    add(net, padPt, e, w, 'F.Cu');
    addVia(net, e);
    return e;
  };

  const gndLeftX = leftX - 200;
  // gndRight 必须在 U1 右侧 VCC 焊盘左侧，避免 VCC 焊盘→轨 的 B 横穿
  const gndRightX = ux + 200;
  const vccRailX = rightX + 180;
  const ledVccX = 90;
  const gndJoinY = uy + 1100;
  const j1x = 1580;
  const nrstLeftCol = gndLeftX - 280; // 在 CX 的 GND 短横左侧，避免竖线穿晶振 GND

  /**
   * 右侧网：B 短横到专属列 → F 竖到针脚行 → B 短进焊盘（末段 B 避免 F 横穿其它升列）
   */
  let slot = 0;
  const toHeaderRight = (net, esc, jPad, w = 16) => {
    if (!net || !esc || !jPad) return;
    const s = slot++;
    const riseX = j1x - 60 - s * 60;
    const atCol = { x: riseX, y: esc.y };
    const atRow = { x: riseX, y: jPad.y };
    add(net, esc, atCol, w, 'B.Cu');
    addVia(net, atCol);
    add(net, atCol, atRow, w, 'F.Cu');
    addVia(net, atRow);
    add(net, atRow, jPad, w, 'B.Cu');
  };
  /** 左侧网：外侧列下到底通道再横到 riseX */
  const toHeaderLeft = (net, esc, jPad, w = 16) => {
    if (!net || !esc || !jPad) return;
    const s = slot++;
    const riseX = j1x - 60 - s * 60;
    const chanY = gndJoinY + 80 + s * 40;
    const atLeft = { x: nrstLeftCol, y: esc.y };
    const atChan = { x: nrstLeftCol, y: chanY };
    const atCol = { x: riseX, y: chanY };
    const atRow = { x: riseX, y: jPad.y };
    add(net, esc, atLeft, w, 'B.Cu');
    add(net, atLeft, atChan, w, 'B.Cu');
    add(net, atChan, atCol, w, 'B.Cu');
    addVia(net, atCol);
    add(net, atCol, atRow, w, 'F.Cu');
    addVia(net, atRow);
    add(net, atRow, jPad, w, 'B.Cu');
  };

  const uGnd = pw('U1', 20), uVcc = pw('U1', 40), uEa = pw('U1', 31);
  const uRst = pw('U1', 9), uX1 = pw('U1', 19), uX2 = pw('U1', 18);
  const yA = pw('Y1', 1), yB = pw('Y1', 2);
  const cx1a = pw('CX1', 1), cx1b = pw('CX1', 2);
  const cx2a = pw('CX2', 1), cx2b = pw('CX2', 2);
  const r1a = pw('R1', 1), r1b = pw('R1', 2);
  const c3a = pw('C3', 1), c3b = pw('C3', 2);
  const rpA = pw('R_PWR', 1), rpB = pw('R_PWR', 2);
  const d9a = pw('D9', 1), d9k = pw('D9', 2);
  const jGnd = pw('J1', 1), jVcc = pw('J1', 2), jRst = pw('J1', 3), jPwr = pw('J1', 4);

  // —— 晶振：MCU↔Y1↔CX(pad1 朝内)；GND 自 pad2 向外 ——
  add(xtal1, uX1, { x: yB.x, y: uX1.y }, 12, 'F.Cu');
  add(xtal1, { x: yB.x, y: uX1.y }, yB, 12, 'F.Cu');
  add(xtal2, uX2, { x: yA.x, y: uX2.y }, 12, 'F.Cu');
  add(xtal2, { x: yA.x, y: uX2.y }, yA, 12, 'F.Cu');
  add(xtal1, yB, { x: cx1a.x, y: yB.y }, 12, 'F.Cu');
  add(xtal1, { x: cx1a.x, y: yB.y }, cx1a, 12, 'F.Cu');
  add(xtal2, yA, { x: cx2a.x, y: yA.y }, 12, 'F.Cu');
  add(xtal2, { x: cx2a.x, y: yA.y }, cx2a, 12, 'F.Cu');
  const eCx1g = smdToB(gnd, cx1b, -55, 0, 14);
  const eCx2g = smdToB(gnd, cx2b, -55, 0, 14);
  add(gnd, eCx1g, { x: gndLeftX, y: eCx1g.y }, 16, 'B.Cu');
  add(gnd, eCx2g, { x: gndLeftX, y: eCx2g.y }, 16, 'B.Cu');
  add(gnd, { x: gndLeftX, y: Math.min(eCx1g.y, eCx2g.y) },
    { x: gndLeftX, y: gndJoinY }, 16, 'B.Cu');
  add(gnd, uGnd, { x: gndLeftX, y: uGnd.y }, 16, 'B.Cu');
  add(gnd, { x: gndLeftX, y: uGnd.y }, { x: gndLeftX, y: gndJoinY }, 16, 'B.Cu');

  // —— 复位：NRST 先向上逃逸，避免与 R1 的 VCC 同行对穿 ——
  add(nrst, r1b, uRst, 12, 'F.Cu');
  const eR1v = smdToB(vcc, r1a, -50, 0, 14);
  add(vcc, eR1v, { x: ledVccX, y: eR1v.y }, 16, 'B.Cu');

  // —— 右侧退耦：VCC 上逃 / GND 下逃 ——
  const eC3v = smdToB(vcc, c3a, 0, -55, 14);
  const eC3g = smdToB(gnd, c3b, 0, 55, 14);
  add(vcc, eC3v, { x: vccRailX, y: eC3v.y }, 16, 'B.Cu');
  add(vcc, { x: vccRailX, y: eC3v.y }, { x: vccRailX, y: uVcc.y }, 16, 'B.Cu');
  const eUvcc = { x: Math.max(uVcc.x + 40, gndRightX + 50), y: uVcc.y };
  add(vcc, uVcc, eUvcc, 16, 'F.Cu');
  addVia(vcc, eUvcc);
  add(vcc, eUvcc, { x: vccRailX, y: uVcc.y }, 16, 'B.Cu');
  add(vcc, uVcc, { x: uVcc.x + 55, y: uVcc.y }, 16, 'F.Cu');
  add(vcc, { x: uVcc.x + 55, y: uVcc.y }, { x: uEa.x + 55, y: uEa.y }, 16, 'F.Cu');
  add(vcc, { x: uEa.x + 55, y: uEa.y }, uEa, 16, 'F.Cu');
  add(gnd, eC3g, { x: gndRightX, y: eC3g.y }, 16, 'B.Cu');
  add(gnd, { x: gndRightX, y: eC3g.y }, { x: gndRightX, y: gndJoinY }, 16, 'B.Cu');

  // —— 电源 LED ——
  const eRpv = smdToB(vcc, rpA, 0, -55, 14);
  add(vcc, eRpv, { x: vccRailX, y: eRpv.y }, 16, 'B.Cu');
  add(vcc, { x: vccRailX, y: eRpv.y }, { x: vccRailX, y: uVcc.y }, 16, 'B.Cu');
  add(pwrLed, rpB, d9a, 12, 'F.Cu');
  // D9 在 VCC 轨右侧：GND 先竖下到接合线，再沿接合线接 gndRight（不横穿 VCC 轨）
  const eD9g = smdToB(gnd, d9k, 0, 60, 14);
  add(gnd, eD9g, { x: eD9g.x, y: gndJoinY }, 16, 'B.Cu');
  add(gnd, { x: eD9g.x, y: gndJoinY }, { x: gndRightX, y: gndJoinY }, 16, 'B.Cu');

  add(gnd, { x: gndLeftX, y: gndJoinY }, { x: gndRightX, y: gndJoinY }, 16, 'B.Cu');

  // —— 8 路 LED ——
  for (let i = 0; i < 8; i++) {
    const rlA = pw(`RL${i + 1}`, 1);
    const rlB = pw(`RL${i + 1}`, 2);
    const dA = pw(`D${i + 1}`, 1);
    const dK = pw(`D${i + 1}`, 2);
    const uP = pw('U1', i + 1);
    const netA = netByName(`L${i}_A`);
    const netK = netByName(`L${i}_K`);
    const eRl = smdToB(vcc, rlA, -50, 0, 14);
    add(vcc, eRl, { x: ledVccX, y: eRl.y }, 16, 'B.Cu');
    if (i === 0) {
      add(vcc, { x: ledVccX, y: pinY(1) }, { x: ledVccX, y: pinY(8) }, 16, 'B.Cu');
      const topY = pinY(1) - 120;
      add(vcc, { x: ledVccX, y: pinY(1) }, { x: ledVccX, y: topY }, 16, 'B.Cu');
      add(vcc, { x: ledVccX, y: topY }, { x: vccRailX, y: topY }, 16, 'B.Cu');
      add(vcc, { x: vccRailX, y: topY }, { x: vccRailX, y: uVcc.y }, 16, 'B.Cu');
    }
    add(netA, rlB, dA, 12, 'F.Cu');
    add(netK, dK, uP, 12, 'F.Cu');
  }
  add(vcc, { x: ledVccX, y: eR1v.y }, { x: ledVccX, y: pinY(8) }, 16, 'B.Cu');

  // —— 排针 ——
  const gndHdrEsc = { x: vccRailX + 50, y: gndJoinY };
  add(gnd, { x: gndRightX, y: gndJoinY }, gndHdrEsc, 16, 'B.Cu');
  toHeaderRight(gnd, gndHdrEsc, jGnd, 16);
  toHeaderRight(vcc, { x: vccRailX, y: uVcc.y }, jVcc, 16);
  const eRst = smdToB(nrst, uRst, 0, -80, 12);
  toHeaderLeft(nrst, eRst, jRst, 12);
  const ePwr = smdToB(pwrLed, d9a, 70, 0, 12);
  toHeaderRight(pwrLed, ePwr, jPwr, 12);

  const ledNets = [];
  for (let i = 0; i < 8; i++) {
    ledNets.push(netByName(`L${i}_A`), netByName(`L${i}_K`));
  }
  return {
    trackCount: doc.tracks.length,
    netCount: [vcc, gnd, xtal1, xtal2, nrst, pwrLed, ...ledNets].filter(Boolean).length,
    viaCount: doc.vias.length
  };
}


/**
 * 555 单稳态延时手布（Cu=4，每层都有走线）：
 *   F.Cu   — 本地短连（555_RC 右侧、TRIG/OUT/LED 左侧）
 *   In1.Cu — GND 显式连线干线（底边横贯 + 竖馈，非覆铜）
 *   In2.Cu — VCC 显式连线干线（顶边横贯 + 竖馈，非覆铜）
 *   B.Cu   — CTRL、TRIG→按键、OUT→示波器
 *
 * LM555：1 GND  2 TRIG  3 OUT  4 RESET  5 CTRL  6 THRES  7 DISCH  8 VCC
 * 单稳态：THRES+DISCH=555_RC；TRIG 经 RP 上拉，SW1 对地触发
 */
function handLayoutLab555Monostable(doc) {
  doc.tracks = [];
  doc.vias = [];
  doc.zones = [];
  doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);

  const byRef = new Map(doc.footprints.map(f => [f.refDes, f]));
  const setPos = (ref, x, y, rot = 0) => {
    const fp = byRef.get(ref);
    if (!fp) return;
    fp.position = { x, y };
    fp.rotation = rot;
    fp.mirrored = false;
    fp.layer = 'F.Cu';
  };
  const netByName = (name) => doc.nets.find(n => (n.name || '').toUpperCase() === (name || '').toUpperCase());
  const gnd = doc.nets.find(n => isGndNet(n.name));
  const vcc = netByName('VCC');
  const rc = netByName('555_RC');
  const trig = netByName('TRIG');
  const out = netByName('555_OUT');
  const ledPath = netByName('LED_PATH');
  const ctrl = netByName('555_CTRL');

  const bindPad = (ref, num, net) => {
    const fp = byRef.get(ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    if (pad && net) { pad.netId = net.id; pad.netName = net.name; }
  };

  const addProbe = (ref, defId, value, x, y, rot = 0) => {
    const schId = doc._refToSchId?.[ref];
    const fp = instantiate(defId, ref, value, { x, y }, rot, schId);
    if (!fp) return null;
    doc.footprints.push(fp);
    byRef.set(ref, fp);
    return fp;
  };

  setPos('U1', 1100, 1000, 0);
  setPos('RT', 1550, 780, 0);
  setPos('CT', 1780, 1200, 0);
  setPos('CD1', 1550, 520, 0);
  setPos('CC1', 1950, 1000, 0);
  // RP/SW 靠左下，避开 OUT 左廊；RP pad2 朝右接 TRIG
  setPos('RP', 380, 980, 0);
  setPos('SW1', 380, 1350, 0);
  // RLED 在芯片左侧：pad2 朝芯片接 OUT，pad1 朝左接 LED
  setPos('RLED', 600, 720, 0);
  setPos('D1', 320, 720, 0);
  addProbe('OSC1', 'FP_PINHDR_6', 'SCOPE', 2450, 1000, 0);

  const hdr = instantiate('FP_PINHDR_4', 'J1', 'PWR', { x: 1100, y: 1850 }, 0);
  const hdrNets = [gnd, vcc];
  for (let i = 0; i < hdr.pads.length; i++) {
    const n = hdrNets[i];
    if (!n) continue;
    hdr.pads[i].netId = n.id;
    hdr.pads[i].netName = n.name;
  }
  doc.footprints.push(hdr);
  byRef.set('J1', hdr);

  bindPad('U1', 1, gnd);
  bindPad('U1', 2, trig);
  bindPad('U1', 3, out);
  bindPad('U1', 4, vcc);
  bindPad('U1', 5, ctrl);
  bindPad('U1', 6, rc);
  bindPad('U1', 7, rc);
  bindPad('U1', 8, vcc);
  bindPad('RT', 1, vcc); bindPad('RT', 2, rc);
  bindPad('CT', 1, rc); bindPad('CT', 2, gnd);
  bindPad('RP', 1, vcc); bindPad('RP', 2, trig);
  // 6x6 轻触：1↔3、2↔4 内短
  bindPad('SW1', 1, gnd); bindPad('SW1', 3, gnd);
  bindPad('SW1', 2, trig); bindPad('SW1', 4, trig);
  bindPad('CD1', 1, vcc); bindPad('CD1', 2, gnd);
  bindPad('CC1', 1, ctrl); bindPad('CC1', 2, gnd);
  bindPad('RLED', 2, out); bindPad('RLED', 1, ledPath);
  bindPad('D1', 2, ledPath); bindPad('D1', 1, gnd);
  bindPad('OSC1', 1, out); bindPad('OSC1', 5, gnd);

  const pw = (ref, num) => {
    const fp = byRef.get(ref) || doc.footprints.find(f => f.refDes === ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    return pad ? padWorld(fp, pad) : null;
  };
  const add = (net, a, b, w = 12, layer = 'F.Cu') => {
    if (!net || !a || !b || dist(a, b) < 0.5) return;
    doc.tracks.push({
      id: uid('trk'), layer,
      start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
      width: w, netId: net.id, netName: net.name
    });
  };
  const viaLayers = ['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu'];
  const addVia = (net, pt) => {
    if (!net || !pt) return;
    for (const v of doc.vias) {
      if (v.netId === net.id && Math.abs(v.position.x - pt.x) < 0.5 &&
        Math.abs(v.position.y - pt.y) < 0.5) return;
    }
    doc.vias.push({
      id: uid('via'), position: { x: pt.x, y: pt.y },
      drill: 12, diameter: 24,
      netId: net.id, netName: net.name,
      layers: [...viaLayers], kind: 'through'
    });
  };
  const L = (net, pts, w = 12, layer = 'F.Cu') => {
    for (let i = 0; i < pts.length - 1; i++) add(net, pts[i], pts[i + 1], w, layer);
  };
  const planeBus = (net, vias, busY, w = 18, layer = 'In1.Cu') => {
    if (!net || !vias.length) return;
    const js = vias.map(v => ({ x: v.x, y: busY })).sort((a, b) => a.x - b.x);
    for (const v of vias) L(net, [v, { x: v.x, y: busY }], w, layer);
    const left = { x: js[0].x - 120, y: busY };
    const right = { x: js[js.length - 1].x + 120, y: busY };
    L(net, [left, ...js, right], w + 2, layer);
  };

  const uGnd = pw('U1', 1), uTrig = pw('U1', 2), uOut = pw('U1', 3), uRst = pw('U1', 4);
  const uCtrl = pw('U1', 5), uThres = pw('U1', 6), uDisch = pw('U1', 7), uVcc = pw('U1', 8);
  const rt1 = pw('RT', 1), rt2 = pw('RT', 2);
  const ct1 = pw('CT', 1), ct2 = pw('CT', 2);
  const rp1 = pw('RP', 1), rp2 = pw('RP', 2);
  const swGnd = pw('SW1', 1), swTrig = pw('SW1', 2);
  const cd1 = pw('CD1', 1), cd2 = pw('CD1', 2);
  const cc1 = pw('CC1', 1), cc2 = pw('CC1', 2);
  const rlOut = pw('RLED', 2), rlLed = pw('RLED', 1);
  const dA = pw('D1', 2), dK = pw('D1', 1);
  const oscCh1 = pw('OSC1', 1), oscGnd = pw('OSC1', 5);
  const jGnd = pw('J1', 1), jVcc = pw('J1', 2);

  // —— F：555_RC 短接 THRES↔DISCH，再连 RT.2 / CT.1 ——
  if (rc && uThres && uDisch) {
    add(rc, uThres, uDisch, 12, 'F.Cu');
  }
  if (rc && uDisch && rt2) {
    const atRt = { x: rt2.x, y: uDisch.y };
    add(rc, uDisch, atRt, 12, 'F.Cu');
    add(rc, atRt, rt2, 12, 'F.Cu');
  }
  if (rc && rt2 && ct1) {
    const midY = (rt2.y + ct1.y) / 2;
    L(rc, [rt2, { x: rt2.x, y: midY }, { x: ct1.x, y: midY }, ct1], 12, 'F.Cu');
  }

  // —— B：TRIG（F 仅短左 stub，避免与 GND/OUT 同层打架）——
  if (trig && uTrig && rp2 && swTrig) {
    const eU = { x: uTrig.x - 55, y: uTrig.y };
    const eR = { x: rp2.x + 50, y: rp2.y };
    const eS = { x: swTrig.x, y: swTrig.y - 55 };
    const runY = 1600;
    add(trig, uTrig, eU, 12, 'F.Cu');
    addVia(trig, eU);
    add(trig, rp2, eR, 12, 'F.Cu');
    addVia(trig, eR);
    add(trig, swTrig, eS, 12, 'F.Cu');
    addVia(trig, eS);
    L(trig, [
      eU, { x: eU.x, y: runY },
      { x: eR.x, y: runY }, eR
    ], 12, 'B.Cu');
    L(trig, [
      { x: eR.x, y: runY },
      { x: eS.x, y: runY }, eS
    ], 12, 'B.Cu');
  }

  // —— B：CTRL → CC1（上廊 y=400）——
  if (ctrl && uCtrl && cc1) {
    const eU = { x: uCtrl.x + 120, y: uCtrl.y };
    const eC = { x: cc1.x, y: cc1.y - 55 };
    const runY = 400;
    add(ctrl, uCtrl, eU, 12, 'F.Cu');
    addVia(ctrl, eU);
    add(ctrl, cc1, eC, 12, 'F.Cu');
    addVia(ctrl, eC);
    L(ctrl, [eU, { x: eU.x, y: runY }, { x: eC.x, y: runY }, eC], 12, 'B.Cu');
  }

  // —— F：OUT → RLED.2（先左再走，避开 TRIG / pad4 VCC）——
  if (out && uOut && rlOut) {
    const esc = { x: Math.min(uOut.x - 120, rlOut.x + 40), y: uOut.y };
    L(out, [uOut, esc, { x: esc.x, y: rlOut.y }, rlOut], 12, 'F.Cu');
  }
  if (ledPath && rlLed && dA) {
    add(ledPath, rlLed, dA, 12, 'F.Cu');
  }

  // —— B：OUT → OSC（最上廊 y=220）——
  if (out && rlOut && oscCh1) {
    const eR = { x: rlOut.x, y: rlOut.y - 55 };
    const eOsc = { x: oscCh1.x - 70, y: oscCh1.y };
    const runY = 220;
    add(out, rlOut, eR, 12, 'F.Cu');
    addVia(out, eR);
    L(out, [eR, { x: eR.x, y: runY }, { x: eOsc.x, y: runY }, eOsc], 12, 'B.Cu');
    addVia(out, eOsc);
    add(out, eOsc, oscCh1, 12, 'F.Cu');
  }

  // —— In2.Cu：VCC 顶边干线 ——
  if (vcc) {
    const busY = 120;
    const vias = [];
    if (uVcc) {
      const v = { x: uVcc.x, y: uVcc.y - 55 };
      add(vcc, uVcc, v, 16, 'F.Cu');
      addVia(vcc, v);
      vias.push(v);
    }
    if (uRst) {
      const v = { x: uRst.x + 55, y: uRst.y };
      add(vcc, uRst, v, 14, 'F.Cu');
      addVia(vcc, v);
      vias.push(v);
    }
    if (rt1) {
      const v = { x: rt1.x, y: rt1.y - 50 };
      add(vcc, rt1, v, 14, 'F.Cu');
      addVia(vcc, v);
      vias.push(v);
    }
    if (rp1) {
      const v = { x: rp1.x - 50, y: rp1.y };
      add(vcc, rp1, v, 14, 'F.Cu');
      addVia(vcc, v);
      vias.push(v);
    }
    if (cd1) {
      const v = { x: cd1.x, y: cd1.y - 50 };
      add(vcc, cd1, v, 14, 'F.Cu');
      addVia(vcc, v);
      vias.push(v);
    }
    if (jVcc) {
      addVia(vcc, jVcc);
      vias.push(jVcc);
    }
    planeBus(vcc, vias, busY, 18, 'In2.Cu');
  }

  // —— In1.Cu：GND 底边干线 ——
  if (gnd) {
    const busY = 2100;
    const vias = [];
    if (uGnd) {
      // 仅水平左逃，勿竖穿同列 TRIG/OUT
      const v = { x: uGnd.x - 90, y: uGnd.y };
      add(gnd, uGnd, v, 14, 'F.Cu');
      addVia(gnd, v);
      vias.push(v);
    }
    const gndFeed = (pad, dx, dy) => {
      if (!pad) return;
      const v = { x: pad.x + dx, y: pad.y + dy };
      add(gnd, pad, v, 12, 'F.Cu');
      addVia(gnd, v);
      vias.push(v);
    };
    gndFeed(ct2, 90, 80);
    gndFeed(cd2, 70, 55);
    gndFeed(cc2, 0, 55);
    gndFeed(dK, -60, 0);
    gndFeed(swGnd, -70, 0);
    if (oscGnd) {
      const v = { x: oscGnd.x - 60, y: oscGnd.y };
      add(gnd, oscGnd, v, 12, 'F.Cu');
      addVia(gnd, v);
      vias.push(v);
    }
    if (jGnd) {
      addVia(gnd, jGnd);
      vias.push(jGnd);
    }
    planeBus(gnd, vias, busY, 14, 'In1.Cu');
  }

  return {
    trackCount: doc.tracks.length,
    netCount: 7,
    viaCount: doc.vias.length
  };
}

function handLayoutLab555Astable(doc) {
  doc.tracks = [];
  doc.vias = [];
  doc.zones = [];
  doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);

  const byRef = new Map(doc.footprints.map(f => [f.refDes, f]));
  const setPos = (ref, x, y, rot = 0) => {
    const fp = byRef.get(ref);
    if (!fp) return;
    fp.position = { x, y };
    fp.rotation = rot;
    fp.mirrored = false;
    fp.layer = 'F.Cu';
  };
  const netByName = (name) => doc.nets.find(n => (n.name || '').toUpperCase() === (name || '').toUpperCase());
  const gnd = doc.nets.find(n => isGndNet(n.name));
  const vcc = netByName('VCC');
  const disch = netByName('DISCH');
  const cap = netByName('555_CAP');
  const out = netByName('555_OUT');
  const ledPath = netByName('LED_PATH');
  const ctrl = netByName('555_CTRL');

  const bindPad = (ref, num, net) => {
    const fp = byRef.get(ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    if (pad && net) { pad.netId = net.id; pad.netName = net.name; }
  };

  const addProbe = (ref, defId, value, x, y, rot = 0) => {
    const schId = doc._refToSchId?.[ref];
    const fp = instantiate(defId, ref, value, { x, y }, rot, schId);
    if (!fp) return null;
    doc.footprints.push(fp);
    byRef.set(ref, fp);
    return fp;
  };

  setPos('U1', 1100, 1000, 0);
  setPos('RA', 1550, 780, 0);
  setPos('RB', 1780, 1100, 0);
  setPos('CT', 1780, 1400, 0);
  setPos('CD1', 1550, 520, 0);
  setPos('CC1', 1950, 1000, 0);
  // RLED 在芯片左侧：pad2 朝芯片接 OUT，pad1 朝左接 LED
  setPos('RLED', 600, 720, 0);
  setPos('D1', 320, 720, 0);
  addProbe('OSC1', 'FP_PINHDR_6', 'SCOPE', 2450, 1000, 0);

  const hdr = instantiate('FP_PINHDR_4', 'J1', 'PWR', { x: 1100, y: 1850 }, 0);
  const hdrNets = [gnd, vcc];
  for (let i = 0; i < hdr.pads.length; i++) {
    const n = hdrNets[i];
    if (!n) continue;
    hdr.pads[i].netId = n.id;
    hdr.pads[i].netName = n.name;
  }
  doc.footprints.push(hdr);
  byRef.set('J1', hdr);

  bindPad('U1', 1, gnd);
  bindPad('U1', 2, cap);
  bindPad('U1', 3, out);
  bindPad('U1', 4, vcc);
  bindPad('U1', 5, ctrl);
  bindPad('U1', 6, cap);
  bindPad('U1', 7, disch);
  bindPad('U1', 8, vcc);
  bindPad('RA', 1, vcc); bindPad('RA', 2, disch);
  bindPad('RB', 1, disch); bindPad('RB', 2, cap);
  bindPad('CT', 1, cap); bindPad('CT', 2, gnd);
  bindPad('CD1', 1, vcc); bindPad('CD1', 2, gnd);
  bindPad('CC1', 1, ctrl); bindPad('CC1', 2, gnd);
  bindPad('RLED', 2, out); bindPad('RLED', 1, ledPath);
  // D1 在 RLED 左侧：pad2（右）朝电阻接 LED_PATH，pad1（左）接 GND
  bindPad('D1', 2, ledPath); bindPad('D1', 1, gnd);
  bindPad('OSC1', 1, out); bindPad('OSC1', 5, gnd);

  const pw = (ref, num) => {
    const fp = byRef.get(ref) || doc.footprints.find(f => f.refDes === ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    return pad ? padWorld(fp, pad) : null;
  };
  const add = (net, a, b, w = 12, layer = 'F.Cu') => {
    if (!net || !a || !b || dist(a, b) < 0.5) return;
    doc.tracks.push({
      id: uid('trk'), layer,
      start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
      width: w, netId: net.id, netName: net.name
    });
  };
  const viaLayers = ['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu'];
  const addVia = (net, pt) => {
    if (!net || !pt) return;
    for (const v of doc.vias) {
      if (v.netId === net.id && Math.abs(v.position.x - pt.x) < 0.5 &&
        Math.abs(v.position.y - pt.y) < 0.5) return;
    }
    doc.vias.push({
      id: uid('via'), position: { x: pt.x, y: pt.y },
      drill: 12, diameter: 24,
      netId: net.id, netName: net.name,
      layers: [...viaLayers], kind: 'through'
    });
  };
  const L = (net, pts, w = 12, layer = 'F.Cu') => {
    for (let i = 0; i < pts.length - 1; i++) add(net, pts[i], pts[i + 1], w, layer);
  };
  const planeBus = (net, vias, busY, w = 18, layer = 'In1.Cu') => {
    if (!net || !vias.length) return;
    const js = vias.map(v => ({ x: v.x, y: busY })).sort((a, b) => a.x - b.x);
    for (const v of vias) L(net, [v, { x: v.x, y: busY }], w, layer);
    const left = { x: js[0].x - 120, y: busY };
    const right = { x: js[js.length - 1].x + 120, y: busY };
    L(net, [left, ...js, right], w + 2, layer);
  };

  const uGnd = pw('U1', 1), uTrig = pw('U1', 2), uOut = pw('U1', 3), uRst = pw('U1', 4);
  const uCtrl = pw('U1', 5), uThres = pw('U1', 6), uDisch = pw('U1', 7), uVcc = pw('U1', 8);
  const ra1 = pw('RA', 1), ra2 = pw('RA', 2);
  const rb1 = pw('RB', 1), rb2 = pw('RB', 2);
  const ct1 = pw('CT', 1), ct2 = pw('CT', 2);
  const cd1 = pw('CD1', 1), cd2 = pw('CD1', 2);
  const cc1 = pw('CC1', 1), cc2 = pw('CC1', 2);
  const rlOut = pw('RLED', 2), rlLed = pw('RLED', 1);
  const dA = pw('D1', 2), dK = pw('D1', 1);
  const oscCh1 = pw('OSC1', 1), oscGnd = pw('OSC1', 5);
  const jGnd = pw('J1', 1), jVcc = pw('J1', 2);

  // —— F：DISCH U1.7 → RA.2；B：RA → RB（下廊 y=1550）——
  if (disch && uDisch && ra2) {
    const atRa = { x: ra2.x, y: uDisch.y };
    add(disch, uDisch, atRa, 12, 'F.Cu');
    add(disch, atRa, ra2, 12, 'F.Cu');
  }
  if (disch && ra2 && rb1) {
    const eA = { x: ra2.x + 50, y: ra2.y };
    const eB = { x: rb1.x - 50, y: rb1.y };
    const runY = 1550;
    add(disch, ra2, eA, 12, 'F.Cu');
    addVia(disch, eA);
    add(disch, rb1, eB, 12, 'F.Cu');
    addVia(disch, eB);
    L(disch, [eA, { x: eA.x, y: runY }, { x: eB.x, y: runY }, eB], 12, 'B.Cu');
  }

  // —— F：CAP U1.6 → RB.2 → CT.1（折线避开 CT.2 GND）——
  if (cap && uThres && rb2 && ct1) {
    const atRb = { x: rb2.x, y: uThres.y };
    add(cap, uThres, atRb, 12, 'F.Cu');
    add(cap, atRb, rb2, 12, 'F.Cu');
    const midY = (rb2.y + ct1.y) / 2;
    L(cap, [rb2, { x: rb2.x, y: midY }, { x: ct1.x, y: midY }, ct1], 12, 'F.Cu');
  }
  // —— B：TRIG ↔ THRES（F 仅短左 stub，下潜走 B，避开 OUT）——
  if (cap && uTrig && uThres) {
    const eTr = { x: uTrig.x - 55, y: uTrig.y };
    const eTh = { x: uThres.x + 70, y: uThres.y };
    const runY = 1750;
    add(cap, uTrig, eTr, 12, 'F.Cu');
    addVia(cap, eTr);
    add(cap, uThres, eTh, 12, 'F.Cu');
    addVia(cap, eTh);
    L(cap, [eTr, { x: eTr.x, y: runY }, { x: eTh.x, y: runY }, eTh], 12, 'B.Cu');
  }

  // —— B：CTRL → CC1（上廊 y=400，避开 DISCH/CAP 下廊）——
  if (ctrl && uCtrl && cc1) {
    const eU = { x: uCtrl.x + 120, y: uCtrl.y };
    const eC = { x: cc1.x, y: cc1.y - 55 };
    const runY = 400;
    add(ctrl, uCtrl, eU, 12, 'F.Cu');
    addVia(ctrl, eU);
    add(ctrl, cc1, eC, 12, 'F.Cu');
    addVia(ctrl, eC);
    L(ctrl, [eU, { x: eU.x, y: runY }, { x: eC.x, y: runY }, eC], 12, 'B.Cu');
  }

  // —— F：OUT → RLED.2（先左再走，避开同列 pad4 VCC stub）——
  if (out && uOut && rlOut) {
    const esc = { x: Math.min(uOut.x - 120, rlOut.x + 40), y: uOut.y };
    L(out, [uOut, esc, { x: esc.x, y: rlOut.y }, rlOut], 12, 'F.Cu');
  }
  if (ledPath && rlLed && dA) {
    add(ledPath, rlLed, dA, 12, 'F.Cu');
  }

  // —— B：OUT → OSC（最上廊 y=220）——
  if (out && rlOut && oscCh1) {
    const eR = { x: rlOut.x, y: rlOut.y - 55 };
    const eOsc = { x: oscCh1.x - 70, y: oscCh1.y };
    const runY = 220;
    add(out, rlOut, eR, 12, 'F.Cu');
    addVia(out, eR);
    L(out, [eR, { x: eR.x, y: runY }, { x: eOsc.x, y: runY }, eOsc], 12, 'B.Cu');
    addVia(out, eOsc);
    add(out, eOsc, oscCh1, 12, 'F.Cu');
  }

  // —— In2.Cu：VCC 顶边干线 ——
  if (vcc) {
    const busY = 120;
    const vias = [];
    if (uVcc) {
      const v = { x: uVcc.x, y: uVcc.y - 55 };
      add(vcc, uVcc, v, 16, 'F.Cu');
      addVia(vcc, v);
      vias.push(v);
    }
    if (uRst) {
      const v = { x: uRst.x + 55, y: uRst.y };
      add(vcc, uRst, v, 14, 'F.Cu');
      addVia(vcc, v);
      vias.push(v);
    }
    if (ra1) {
      const v = { x: ra1.x, y: ra1.y - 50 };
      add(vcc, ra1, v, 14, 'F.Cu');
      addVia(vcc, v);
      vias.push(v);
    }
    if (cd1) {
      const v = { x: cd1.x, y: cd1.y - 50 };
      add(vcc, cd1, v, 14, 'F.Cu');
      addVia(vcc, v);
      vias.push(v);
    }
    if (jVcc) {
      addVia(vcc, jVcc);
      vias.push(jVcc);
    }
    planeBus(vcc, vias, busY, 18, 'In2.Cu');
  }

  // —— In1.Cu：GND 底边干线 ——
  if (gnd) {
    const busY = 2100;
    const vias = [];
    if (uGnd) {
      const v = { x: uGnd.x - 55, y: uGnd.y };
      add(gnd, uGnd, v, 14, 'F.Cu');
      addVia(gnd, v);
      vias.push(v);
    }
    const gndFeed = (pad, dx, dy) => {
      if (!pad) return;
      const v = { x: pad.x + dx, y: pad.y + dy };
      add(gnd, pad, v, 12, 'F.Cu');
      addVia(gnd, v);
      vias.push(v);
    };
    gndFeed(ct2, 90, 80);
    gndFeed(cd2, 70, 55);
    gndFeed(cc2, 0, 55);
    gndFeed(dK, -60, 0);
    if (oscGnd) {
      const v = { x: oscGnd.x - 60, y: oscGnd.y };
      add(gnd, oscGnd, v, 12, 'F.Cu');
      addVia(gnd, v);
      vias.push(v);
    }
    if (jGnd) {
      addVia(gnd, jGnd);
      vias.push(jGnd);
    }
    planeBus(gnd, vias, busY, 14, 'In1.Cu');
  }

  return {
    trackCount: doc.tracks.length,
    netCount: 7,
    viaCount: doc.vias.length
  };
}

function handLayoutLabIntegrator(doc) {
  doc.tracks = [];
  doc.vias = [];
  doc.zones = [];
  doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);

  const byRef = new Map(doc.footprints.map(f => [f.refDes, f]));
  const setPos = (ref, x, y, rot = 0) => {
    const fp = byRef.get(ref);
    if (!fp) return;
    fp.position = { x, y };
    fp.rotation = rot;
    fp.mirrored = false;
    fp.layer = 'F.Cu';
  };
  const netByName = (name) => doc.nets.find(n => (n.name || '').toUpperCase() === (name || '').toUpperCase());
  const gnd = doc.nets.find(n => isGndNet(n.name));
  const vcc = netByName('VCC');
  const vee = netByName('VEE');
  const inputSig = netByName('INPUT_SIG');
  const intNode = netByName('INT_NODE');
  const outputSig = netByName('OUTPUT_SIG');

  const bindPad = (ref, num, net) => {
    const fp = byRef.get(ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    if (pad && net) { pad.netId = net.id; pad.netName = net.name; }
  };

  const addProbe = (ref, defId, value, x, y, rot = 0) => {
    const schId = doc._refToSchId?.[ref];
    const fp = instantiate(defId, ref, value, { x, y }, rot, schId);
    if (!fp) return null;
    doc.footprints.push(fp);
    byRef.set(ref, fp);
    return fp;
  };

  // —— 放置 ——
  setPos('U1', 1300, 750, 0);
  setPos('R1', 900, 720, 0);     // 1=INPUT  2=INT
  setPos('Cf', 1680, 620, 0);    // 1=INT    2=OUT
  setPos('Rf', 1680, 920, 0);    // 1=INT    2=OUT
  addProbe('SG1', 'FP_THT2', 'SIG_GEN', 380, 650, 0);
  addProbe('OSC1', 'FP_PINHDR_6', 'SCOPE', 2500, 780, 0);

  const hdr = instantiate('FP_PINHDR_4', 'J1', 'PWR', { x: 1300, y: 1680 }, 0);
  const hdrNets = [gnd, vcc, vee];
  for (let i = 0; i < hdr.pads.length; i++) {
    const n = hdrNets[i];
    if (!n) continue;
    hdr.pads[i].netId = n.id;
    hdr.pads[i].netName = n.name;
  }
  doc.footprints.push(hdr);
  byRef.set('J1', hdr);

  bindPad('U1', 2, intNode);
  bindPad('U1', 3, gnd);
  bindPad('U1', 4, vee);
  bindPad('U1', 6, outputSig);
  bindPad('U1', 7, vcc);
  bindPad('R1', 1, inputSig); bindPad('R1', 2, intNode);
  bindPad('Cf', 1, intNode); bindPad('Cf', 2, outputSig);
  bindPad('Rf', 1, intNode); bindPad('Rf', 2, outputSig);
  bindPad('SG1', 1, inputSig); bindPad('SG1', 2, gnd);
  bindPad('OSC1', 1, inputSig); bindPad('OSC1', 2, outputSig); bindPad('OSC1', 5, gnd);

  const pw = (ref, num) => {
    const fp = byRef.get(ref) || doc.footprints.find(f => f.refDes === ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    return pad ? padWorld(fp, pad) : null;
  };
  const add = (net, a, b, w = 12, layer = 'F.Cu') => {
    if (!net || !a || !b || dist(a, b) < 0.5) return;
    doc.tracks.push({
      id: uid('trk'), layer,
      start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
      width: w, netId: net.id, netName: net.name
    });
  };
  const viaLayers = ['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu'];
  const addVia = (net, pt) => {
    if (!net || !pt) return;
    for (const v of doc.vias) {
      if (v.netId === net.id && Math.abs(v.position.x - pt.x) < 0.5 &&
        Math.abs(v.position.y - pt.y) < 0.5) return;
    }
    doc.vias.push({
      id: uid('via'), position: { x: pt.x, y: pt.y },
      drill: 12, diameter: 24,
      netId: net.id, netName: net.name,
      layers: [...viaLayers], kind: 'through'
    });
  };
  const L = (net, pts, w = 12, layer = 'F.Cu') => {
    for (let i = 0; i < pts.length - 1; i++) add(net, pts[i], pts[i + 1], w, layer);
  };
  /** 内层干线：竖馈到 busY 后，按 x 排序显式折线串过每个馈点 */
  const planeBus = (net, vias, busY, w = 18, layer = 'In1.Cu') => {
    if (!net || !vias.length) return;
    const js = vias.map(v => ({ x: v.x, y: busY })).sort((a, b) => a.x - b.x);
    for (const v of vias) L(net, [v, { x: v.x, y: busY }], w, layer);
    const left = { x: js[0].x - 100, y: busY };
    const right = { x: js[js.length - 1].x + 100, y: busY };
    L(net, [left, ...js, right], w + 2, layer);
  };

  const uInM = pw('U1', 2), uInP = pw('U1', 3), uVee = pw('U1', 4);
  const uOut = pw('U1', 6), uVcc = pw('U1', 7);
  const r1a = pw('R1', 1), r1b = pw('R1', 2);
  const cf1 = pw('Cf', 1), cf2 = pw('Cf', 2);
  const rf1 = pw('Rf', 1), rf2 = pw('Rf', 2);
  const sgOut = pw('SG1', 1), sgGnd = pw('SG1', 2);
  const oscCh1 = pw('OSC1', 1), oscCh2 = pw('OSC1', 2), oscGnd = pw('OSC1', 5);
  const jGnd = pw('J1', 1), jVcc = pw('J1', 2), jVee = pw('J1', 3);

  // —— F：R1.2→IN-（左逃超过 VEE stub）——
  if (intNode && r1b && uInM) {
    const esc = { x: uInM.x - 130, y: uInM.y };
    const atR = { x: esc.x, y: r1b.y };
    add(intNode, uInM, esc, 12, 'F.Cu');
    add(intNode, esc, atR, 12, 'F.Cu');
    add(intNode, atR, r1b, 12, 'F.Cu');
  }

  // —— F：INT 底绕至 Cf/Rf 左廊 ——
  if (intNode && cf1 && rf1 && uInM) {
    const busX = Math.min(cf1.x, rf1.x) - 55;
    const esc = { x: uInM.x - 130, y: uInM.y };
    const underY = Math.max(rf1.y, uInM.y) + 80;
    const atUnder = { x: esc.x, y: underY };
    const atBus = { x: busX, y: underY };
    add(intNode, esc, atUnder, 12, 'F.Cu');
    add(intNode, atUnder, atBus, 12, 'F.Cu');
    add(intNode, atBus, { x: busX, y: rf1.y }, 12, 'F.Cu');
    add(intNode, { x: busX, y: rf1.y }, rf1, 12, 'F.Cu');
    add(intNode, { x: busX, y: rf1.y }, { x: busX, y: cf1.y }, 12, 'F.Cu');
    add(intNode, { x: busX, y: cf1.y }, cf1, 12, 'F.Cu');
  }

  // —— F：OUT 顶绕至 Cf/Rf 右廊，再从右廊扇出到示波器 ——
  let outBusX = null;
  if (outputSig && uOut && cf2 && rf2) {
    outBusX = Math.max(cf2.x, rf2.x) + 55;
    const overY = Math.min(cf2.y, uOut.y) - 80;
    const esc = { x: uOut.x + 90, y: uOut.y };
    const up = { x: esc.x, y: overY };
    const atTop = { x: outBusX, y: overY };
    add(outputSig, uOut, esc, 12, 'F.Cu');
    add(outputSig, esc, up, 12, 'F.Cu');
    add(outputSig, up, atTop, 12, 'F.Cu');
    add(outputSig, atTop, { x: outBusX, y: cf2.y }, 12, 'F.Cu');
    add(outputSig, { x: outBusX, y: cf2.y }, cf2, 12, 'F.Cu');
    add(outputSig, { x: outBusX, y: cf2.y }, { x: outBusX, y: rf2.y }, 12, 'F.Cu');
    add(outputSig, { x: outBusX, y: rf2.y }, rf2, 12, 'F.Cu');
  }

  // —— B：INPUT_SIG  SG1 → R1.1 → OSC CH1 ——
  if (inputSig && sgOut && r1a && oscCh1) {
    const eSg = { x: sgOut.x + 70, y: sgOut.y };
    const eR = { x: r1a.x - 55, y: r1a.y };
    const eOsc = { x: oscCh1.x - 70, y: oscCh1.y };
    const runY = 280;
    add(inputSig, sgOut, eSg, 12, 'F.Cu');
    addVia(inputSig, eSg);
    L(inputSig, [eSg, { x: eSg.x, y: runY }, { x: eR.x, y: runY }, eR], 12, 'B.Cu');
    addVia(inputSig, eR);
    add(inputSig, eR, r1a, 12, 'F.Cu');
    L(inputSig, [eR, { x: eR.x, y: runY }, { x: eOsc.x, y: runY }, eOsc], 12, 'B.Cu');
    addVia(inputSig, eOsc);
    add(inputSig, eOsc, oscCh1, 12, 'F.Cu');
  }

  // —— B：OUTPUT_SIG → OSC CH2（从右廊出发，避免折返穿 Rf）——
  if (outputSig && rf2 && oscCh2 && outBusX !== null) {
    const eRf = { x: outBusX + 45, y: rf2.y };
    const eOsc = { x: oscCh2.x - 70, y: oscCh2.y };
    const runY = 1280;
    add(outputSig, { x: outBusX, y: rf2.y }, eRf, 12, 'F.Cu');
    addVia(outputSig, eRf);
    L(outputSig, [eRf, { x: eRf.x, y: runY }, { x: eOsc.x, y: runY }, eOsc], 12, 'B.Cu');
    addVia(outputSig, eOsc);
    add(outputSig, eOsc, oscCh2, 12, 'F.Cu');
  }

  // —— In2.Cu：VCC 顶边干线 ——
  if (vcc && uVcc && jVcc) {
    const busY = 120;
    const eU = { x: uVcc.x, y: uVcc.y - 55 };
    add(vcc, uVcc, eU, 16, 'F.Cu');
    addVia(vcc, eU);
    addVia(vcc, jVcc);
    planeBus(vcc, [eU, jVcc], busY, 18, 'In2.Cu');
  }

  // —— In1.Cu：GND 底边干线 ——
  if (gnd) {
    const busY = 1900;
    const vias = [];
    if (uInP) {
      const v = { x: uInP.x + 50, y: uInP.y };
      add(gnd, uInP, v, 12, 'F.Cu');
      addVia(gnd, v);
      vias.push(v);
    }
    if (sgGnd) {
      const v = { x: sgGnd.x, y: sgGnd.y + 60 };
      add(gnd, sgGnd, v, 12, 'F.Cu');
      addVia(gnd, v);
      vias.push(v);
    }
    if (oscGnd) {
      const v = { x: oscGnd.x - 60, y: oscGnd.y };
      add(gnd, oscGnd, v, 12, 'F.Cu');
      addVia(gnd, v);
      vias.push(v);
    }
    if (jGnd) {
      addVia(gnd, jGnd);
      vias.push(jGnd);
    }
    planeBus(gnd, vias, busY, 14, 'In1.Cu');
  }

  // —— B：VEE ——
  if (vee && uVee && jVee) {
    const eU = { x: uVee.x - 100, y: uVee.y };
    const eJ = { x: jVee.x - 80, y: jVee.y };
    const runY = 1480;
    add(vee, uVee, eU, 16, 'F.Cu');
    addVia(vee, eU);
    L(vee, [eU, { x: eU.x, y: runY }, { x: eJ.x, y: runY }, eJ], 16, 'B.Cu');
    addVia(vee, eJ);
    add(vee, eJ, jVee, 16, 'F.Cu');
  }

  return {
    trackCount: doc.tracks.length,
    netCount: 6,
    viaCount: doc.vias.length
  };
}

function handLayoutLabSchmitt(doc) {
  doc.tracks = [];
  doc.vias = [];
  doc.zones = [];
  doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);

  const byRef = new Map(doc.footprints.map(f => [f.refDes, f]));
  const setPos = (ref, x, y, rot = 0) => {
    const fp = byRef.get(ref);
    if (!fp) return;
    fp.position = { x, y };
    fp.rotation = rot;
    fp.mirrored = false;
    fp.layer = 'F.Cu';
  };
  const netByName = (name) => doc.nets.find(n => (n.name || '').toUpperCase() === (name || '').toUpperCase());
  const gnd = doc.nets.find(n => isGndNet(n.name));
  const vcc = netByName('VCC');
  const vee = netByName('VEE');
  const inputSig = netByName('INPUT_SIG');
  const hyst = netByName('HYST');
  const outputSig = netByName('OUTPUT_SIG');

  const bindPad = (ref, num, net) => {
    const fp = byRef.get(ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    if (pad && net) { pad.netId = net.id; pad.netName = net.name; }
  };

  const addProbe = (ref, defId, value, x, y, rot = 0) => {
    const schId = doc._refToSchId?.[ref];
    const fp = instantiate(defId, ref, value, { x, y }, rot, schId);
    if (!fp) return null;
    doc.footprints.push(fp);
    byRef.set(ref, fp);
    return fp;
  };

  // —— 放置 ——
  setPos('U1', 1200, 700, 0);
  setPos('Rf', 1580, 1100, 0);  // 1=HYST  2=OUT
  setPos('Rg', 820, 1100, 0);   // 1=HYST  2=GND
  addProbe('SG1', 'FP_THT2', 'SIG_GEN', 380, 600, 0);
  addProbe('OSC1', 'FP_PINHDR_6', 'SCOPE', 2400, 750, 0);

  const hdr = instantiate('FP_PINHDR_4', 'J1', 'PWR', { x: 1200, y: 1650 }, 0);
  const hdrNets = [gnd, vcc, vee];
  for (let i = 0; i < hdr.pads.length; i++) {
    const n = hdrNets[i];
    if (!n) continue;
    hdr.pads[i].netId = n.id;
    hdr.pads[i].netName = n.name;
  }
  doc.footprints.push(hdr);
  byRef.set('J1', hdr);

  bindPad('U1', 2, inputSig);
  bindPad('U1', 3, hyst);
  bindPad('U1', 4, vee);
  bindPad('U1', 6, outputSig);
  bindPad('U1', 7, vcc);
  bindPad('Rf', 1, hyst); bindPad('Rf', 2, outputSig);
  bindPad('Rg', 1, hyst); bindPad('Rg', 2, gnd);
  bindPad('SG1', 1, inputSig); bindPad('SG1', 2, gnd);
  bindPad('OSC1', 1, inputSig); bindPad('OSC1', 2, outputSig); bindPad('OSC1', 5, gnd);

  const pw = (ref, num) => {
    const fp = byRef.get(ref) || doc.footprints.find(f => f.refDes === ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    return pad ? padWorld(fp, pad) : null;
  };
  const add = (net, a, b, w = 12, layer = 'F.Cu') => {
    if (!net || !a || !b || dist(a, b) < 0.5) return;
    doc.tracks.push({
      id: uid('trk'), layer,
      start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
      width: w, netId: net.id, netName: net.name
    });
  };
  const viaLayers = ['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu'];
  const addVia = (net, pt) => {
    if (!net || !pt) return;
    for (const v of doc.vias) {
      if (v.netId === net.id && Math.abs(v.position.x - pt.x) < 0.5 &&
        Math.abs(v.position.y - pt.y) < 0.5) return;
    }
    doc.vias.push({
      id: uid('via'), position: { x: pt.x, y: pt.y },
      drill: 12, diameter: 24,
      netId: net.id, netName: net.name,
      layers: [...viaLayers], kind: 'through'
    });
  };
  const L = (net, pts, w = 12, layer = 'F.Cu') => {
    for (let i = 0; i < pts.length - 1; i++) add(net, pts[i], pts[i + 1], w, layer);
  };

  const uInM = pw('U1', 2), uInP = pw('U1', 3), uVee = pw('U1', 4);
  const uOut = pw('U1', 6), uVcc = pw('U1', 7);
  const rf1 = pw('Rf', 1), rf2 = pw('Rf', 2);
  const rg1 = pw('Rg', 1), rg2 = pw('Rg', 2);
  const sgOut = pw('SG1', 1), sgGnd = pw('SG1', 2);
  const oscCh1 = pw('OSC1', 1), oscCh2 = pw('OSC1', 2), oscGnd = pw('OSC1', 5);
  const jGnd = pw('J1', 1), jVcc = pw('J1', 2), jVee = pw('J1', 3);

  // —— F：HYST — 左逃超过 INPUT 入焊盘 stub，再上绕到电阻横廊 ——
  if (hyst && uInP && rg1 && rf1 && uInM) {
    const pastIn = uInM.x - 110;
    const esc = { x: pastIn, y: uInP.y };
    const up = { x: esc.x, y: uInP.y - 80 };
    const col = { x: Math.min(esc.x, rg1.x) - 20, y: up.y };
    const drop = { x: col.x, y: rg1.y - 50 };
    const atRg = { x: rg1.x, y: drop.y };
    const atRf = { x: rf1.x, y: drop.y };
    add(hyst, uInP, esc, 12, 'F.Cu');
    add(hyst, esc, up, 12, 'F.Cu');
    add(hyst, up, col, 12, 'F.Cu');
    add(hyst, col, drop, 12, 'F.Cu');
    add(hyst, drop, atRg, 12, 'F.Cu');
    add(hyst, atRg, rg1, 12, 'F.Cu');
    add(hyst, atRg, atRf, 12, 'F.Cu');
    add(hyst, atRf, rf1, 12, 'F.Cu');
  }

  // —— F：OUT → Rf.2 ——
  if (outputSig && uOut && rf2) {
    const mid = { x: rf2.x, y: uOut.y };
    add(outputSig, uOut, mid, 12, 'F.Cu');
    add(outputSig, mid, rf2, 12, 'F.Cu');
  }

  // —— B：INPUT_SIG ——
  if (inputSig && sgOut && uInM && oscCh1) {
    const eSg = { x: sgOut.x + 70, y: sgOut.y };
    const eIn = { x: uInM.x - 70, y: uInM.y };
    const eOsc = { x: oscCh1.x - 70, y: oscCh1.y };
    const runY = 280;
    add(inputSig, sgOut, eSg, 12, 'F.Cu');
    addVia(inputSig, eSg);
    L(inputSig, [eSg, { x: eSg.x, y: runY }, { x: eIn.x, y: runY }, eIn], 12, 'B.Cu');
    addVia(inputSig, eIn);
    add(inputSig, eIn, uInM, 12, 'F.Cu');
    L(inputSig, [eIn, { x: eIn.x, y: runY }, { x: eOsc.x, y: runY }, eOsc], 12, 'B.Cu');
    addVia(inputSig, eOsc);
    add(inputSig, eOsc, oscCh1, 12, 'F.Cu');
  }

  // —— B：OUTPUT_SIG → OSC CH2 ——
  if (outputSig && rf2 && oscCh2) {
    const eRf = { x: rf2.x + 60, y: rf2.y };
    const eOsc = { x: oscCh2.x - 70, y: oscCh2.y };
    const runY = 1280;
    add(outputSig, rf2, eRf, 12, 'F.Cu');
    addVia(outputSig, eRf);
    L(outputSig, [eRf, { x: eRf.x, y: runY }, { x: eOsc.x, y: runY }, eOsc], 12, 'B.Cu');
    addVia(outputSig, eOsc);
    add(outputSig, eOsc, oscCh2, 12, 'F.Cu');
  }

  // —— In2.Cu：VCC 顶边干线 ——
  if (vcc && uVcc && jVcc) {
    const busY = 120;
    const eU = { x: uVcc.x + 60, y: uVcc.y };
    add(vcc, uVcc, eU, 16, 'F.Cu');
    addVia(vcc, eU);
    L(vcc, [eU, { x: eU.x, y: busY }], 18, 'In2.Cu');
    add(vcc, { x: 160, y: busY }, { x: 2640, y: busY }, 20, 'In2.Cu');
    addVia(vcc, jVcc);
    L(vcc, [jVcc, { x: jVcc.x, y: busY }], 18, 'In2.Cu');
  }

  // —— In1.Cu：GND 底边干线 ——
  if (gnd) {
    const busY = 1880;
    add(gnd, { x: 160, y: busY }, { x: 2640, y: busY }, 20, 'In1.Cu');
    if (rg2) {
      const v = { x: rg2.x, y: rg2.y + 60 };
      add(gnd, rg2, v, 12, 'F.Cu');
      addVia(gnd, v);
      L(gnd, [v, { x: v.x, y: busY }], 14, 'In1.Cu');
    }
    if (sgGnd) {
      const v = { x: sgGnd.x, y: sgGnd.y + 60 };
      add(gnd, sgGnd, v, 12, 'F.Cu');
      addVia(gnd, v);
      L(gnd, [v, { x: v.x, y: busY }], 14, 'In1.Cu');
    }
    if (oscGnd) {
      const v = { x: oscGnd.x - 60, y: oscGnd.y };
      add(gnd, oscGnd, v, 12, 'F.Cu');
      addVia(gnd, v);
      L(gnd, [v, { x: v.x, y: busY }], 14, 'In1.Cu');
    }
    if (jGnd) {
      addVia(gnd, jGnd);
      L(gnd, [jGnd, { x: jGnd.x, y: busY }], 14, 'In1.Cu');
    }
  }

  // —— B：VEE（焊盘直接左逃，HYST 已改走上绕）——
  if (vee && uVee && jVee) {
    const eU = { x: uVee.x - 100, y: uVee.y };
    const eJ = { x: jVee.x - 80, y: jVee.y };
    const runY = 1450;
    add(vee, uVee, eU, 16, 'F.Cu');
    addVia(vee, eU);
    L(vee, [eU, { x: eU.x, y: runY }, { x: eJ.x, y: runY }, eJ], 16, 'B.Cu');
    addVia(vee, eJ);
    add(vee, eJ, jVee, 16, 'F.Cu');
  }

  return {
    trackCount: doc.tracks.length,
    netCount: 6,
    viaCount: doc.vias.length
  };
}

function handLayoutLabDigitalGates(doc) {
  doc.tracks = [];
  doc.vias = [];
  doc.zones = [];
  doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);

  for (const fp of doc.footprints) {
    const want = fp.refDes === 'U7' ? 'FP_DIP16'
      : /^U[1-6]$/.test(fp.refDes) ? 'FP_DIP14' : null;
    if (!want || fp.defId === want) continue;
    const neu = instantiate(want, fp.refDes, fp.value || fp.refDes, fp.position, 0, fp.schematicCompId);
    fp.defId = neu.defId;
    fp.pads = neu.pads;
    for (const pad of fp.pads) { pad.netId = undefined; pad.netName = undefined; }
  }

  const byRef = new Map(doc.footprints.map(f => [f.refDes, f]));
  const setPos = (ref, x, y, rot = 0) => {
    const fp = byRef.get(ref);
    if (!fp) return;
    fp.position = { x, y };
    fp.rotation = rot;
    fp.mirrored = false;
    fp.layer = 'F.Cu';
  };
  const netByName = (name) => doc.nets.find(n => (n.name || '').toUpperCase() === (name || '').toUpperCase());
  const gnd = doc.nets.find(n => isGndNet(n.name));
  const vcc = netByName('VCC');
  const inA = netByName('INPUT_A');
  const inB = netByName('INPUT_B');
  const clk = netByName('CLK');
  const q0 = netByName('Q0');
  const q0Led = netByName('Q0_LED');
  const gateY = [];
  const ledA = [];
  for (let i = 1; i <= 6; i++) {
    gateY[i] = netByName(`GATE_Y${i}`);
    ledA[i] = netByName(`LED_A${i}`);
  }

  const bindPad = (ref, num, net) => {
    const fp = byRef.get(ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    if (pad && net) { pad.netId = net.id; pad.netName = net.name; }
  };

  const addProbe = (ref, defId, value, x, y, rot = 0) => {
    const schId = doc._refToSchId?.[ref];
    const fp = instantiate(defId, ref, value, { x, y }, rot, schId);
    if (!fp) return null;
    doc.footprints.push(fp);
    byRef.set(ref, fp);
    return fp;
  };

  // —— 放置 ——
  setPos('CDEC', 420, 420, 0);
  setPos('RPUA', 420, 900, 0);
  setPos('SWA', 780, 900, 0);
  setPos('RPUB', 420, 1400, 0);
  setPos('SWB', 780, 1400, 0);
  addProbe('SG1', 'FP_THT2', 'SIG_GEN', 420, 2600, 0);

  for (let i = 0; i < 6; i++) {
    const x = 1200 + i * 750;
    setPos(`U${i + 1}`, x, 2000, 0);
    setPos(`RL${i + 1}`, x, 1150, 0);
    setPos(`D${i + 1}`, x, 800, 0);
  }

  setPos('U7', 5800, 2000, 0);
  setPos('RQ0', 5450, 1150, 0);
  setPos('DQ0', 5450, 800, 0);

  const hdr = instantiate('FP_PINHDR_4', 'J1', 'PWR', { x: 6200, y: 3000 }, 0);
  if (hdr) {
    for (const [idx, n] of [[0, gnd], [1, vcc]]) {
      if (!n || !hdr.pads[idx]) continue;
      hdr.pads[idx].netId = n.id;
      hdr.pads[idx].netName = n.name;
    }
    doc.footprints.push(hdr);
    byRef.set('J1', hdr);
  }

  // —— 绑定（按原理图焊盘号）——
  bindPad('CDEC', 1, vcc); bindPad('CDEC', 2, gnd);
  bindPad('RPUA', 1, vcc); bindPad('RPUA', 2, inA);
  bindPad('SWA', 1, inA); bindPad('SWA', 2, gnd);
  bindPad('RPUB', 1, vcc); bindPad('RPUB', 2, inB);
  bindPad('SWB', 1, inB); bindPad('SWB', 2, gnd);
  bindPad('SG1', 1, clk); bindPad('SG1', 2, gnd);

  for (let i = 1; i <= 6; i++) {
    bindPad(`U${i}`, 14, vcc);
    bindPad(`U${i}`, 7, gnd);
    bindPad(`U${i}`, 1, inA);
    if (i !== 3) bindPad(`U${i}`, 2, inB);
    const yPad = i === 3 ? 2 : 3;
    bindPad(`U${i}`, yPad, gateY[i]);
    bindPad(`RL${i}`, 1, gateY[i]);
    bindPad(`RL${i}`, 2, ledA[i]);
    bindPad(`D${i}`, 1, ledA[i]);
    bindPad(`D${i}`, 2, gnd);
  }

  bindPad('U7', 16, vcc); bindPad('U7', 8, gnd);
  bindPad('U7', 13, clk); bindPad('U7', 14, gnd); bindPad('U7', 15, gnd);
  bindPad('U7', 3, q0);
  bindPad('RQ0', 1, q0); bindPad('RQ0', 2, q0Led);
  bindPad('DQ0', 1, q0Led); bindPad('DQ0', 2, gnd);

  const pw = (ref, num) => {
    const fp = byRef.get(ref) || doc.footprints.find(f => f.refDes === ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    return pad ? padWorld(fp, pad) : null;
  };
  const add = (net, a, b, w = 12, layer = 'F.Cu') => {
    if (!net || !a || !b || dist(a, b) < 0.5) return;
    doc.tracks.push({
      id: uid('trk'), layer,
      start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
      width: w, netId: net.id, netName: net.name
    });
  };
  const viaLayers = ['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu'];
  const addVia = (net, pt) => {
    if (!net || !pt) return;
    for (const v of doc.vias) {
      if (v.netId === net.id && Math.abs(v.position.x - pt.x) < 0.5 &&
        Math.abs(v.position.y - pt.y) < 0.5) return;
    }
    doc.vias.push({
      id: uid('via'), position: { x: pt.x, y: pt.y },
      drill: 12, diameter: 24,
      netId: net.id, netName: net.name,
      layers: [...viaLayers], kind: 'through'
    });
  };
  const L = (net, pts, w = 12, layer = 'F.Cu') => {
    for (let i = 0; i < pts.length - 1; i++) add(net, pts[i], pts[i + 1], w, layer);
  };

  /** F stub → 内层短桩（电源靠铺铜/干线连通） */
  const toPlane = (net, padPt, dx, dy, plane, w = 14) => {
    if (!net || !padPt) return;
    const e = { x: padPt.x + dx, y: padPt.y + dy };
    add(net, padPt, e, w, 'F.Cu');
    addVia(net, e);
    add(net, e, {
      x: e.x + (Math.abs(dx) > Math.abs(dy) ? Math.sign(dx || 1) * 40 : 0),
      y: e.y + (Math.abs(dy) >= Math.abs(dx) ? Math.sign(dy || 1) * 40 : 0)
    }, w, plane);
  };

  /** 地焊盘：过孔直接进 In1，避免 F 横穿信号扇出 */
  const gndVia = (pad) => {
    if (!gnd || !pad) return;
    addVia(gnd, pad);
    add(gnd, pad, { x: pad.x, y: pad.y + 45 }, 12, 'In1.Cu');
  };
  const vccVia = (pad) => {
    if (!vcc || !pad) return;
    addVia(vcc, pad);
    add(vcc, pad, { x: pad.x, y: pad.y - 45 }, 14, 'In2.Cu');
  };

  /** 多焊盘总线：水平离开左列后再竖到 busY（F），干线走内层 */
  const runBus = (net, pads, busY, layer, sideX) => {
    if (!net || pads.length < 2) return null;
    const vias = [];
    for (const p of pads) {
      if (!p) continue;
      const mid = { x: p.x + sideX, y: p.y };
      const e = { x: mid.x, y: busY };
      add(net, p, mid, 12, 'F.Cu');
      add(net, mid, e, 12, 'F.Cu');
      addVia(net, e);
      vias.push(e);
    }
    vias.sort((a, b) => a.x - b.x);
    for (let i = 0; i + 1 < vias.length; i++) add(net, vias[i], vias[i + 1], 12, layer);
    return vias;
  };

  // —— 本地：按键/上拉 ——
  if (inA && pw('RPUA', 2) && pw('SWA', 1)) add(inA, pw('RPUA', 2), pw('SWA', 1), 12, 'F.Cu');
  if (inB && pw('RPUB', 2) && pw('SWB', 1)) add(inB, pw('RPUB', 2), pw('SWB', 1), 12, 'F.Cu');
  vccVia(pw('RPUA', 1));
  vccVia(pw('RPUB', 1));
  vccVia(pw('CDEC', 1));
  gndVia(pw('SWA', 2));
  gndVia(pw('SWB', 2));
  gndVia(pw('CDEC', 2));
  gndVia(pw('SG1', 2));

  // —— 门输出 → RL → LED：GATE 走 B，避开 INPUT 的 F 扇出 ——
  for (let i = 1; i <= 6; i++) {
    const yPad = i === 3 ? 2 : 3;
    const a = pw(`U${i}`, yPad);
    const r1 = pw(`RL${i}`, 1);
    const r2 = pw(`RL${i}`, 2);
    const d1 = pw(`D${i}`, 1);
    const d2 = pw(`D${i}`, 2);
    if (gateY[i] && a && r1) {
      const ea = { x: a.x - 55, y: a.y };
      const eb = { x: r1.x, y: r1.y + 40 };
      add(gateY[i], a, ea, 12, 'F.Cu');
      addVia(gateY[i], ea);
      L(gateY[i], [ea, { x: ea.x, y: eb.y }, eb], 12, 'B.Cu');
      addVia(gateY[i], eb);
      add(gateY[i], eb, r1, 12, 'F.Cu');
    }
    if (ledA[i] && r2 && d1) {
      add(ledA[i], r2, { x: r2.x, y: d1.y }, 12, 'F.Cu');
      add(ledA[i], { x: r2.x, y: d1.y }, d1, 12, 'F.Cu');
    }
    gndVia(d2);
    vccVia(pw(`U${i}`, 14));
    gndVia(pw(`U${i}`, 7));
  }

  // —— In1：INPUT_A（上廊，扇出列 x-130）——
  const aPads = [pw('RPUA', 2)];
  for (let i = 1; i <= 6; i++) aPads.push(pw(`U${i}`, 1));
  runBus(inA, aPads, 1050, 'In1.Cu', -130);

  // —— In2：INPUT_B（下廊，扇出列 x-130）——
  const bPads = [pw('RPUB', 2)];
  for (const ref of ['U1', 'U2', 'U4', 'U5', 'U6']) bPads.push(pw(ref, 2));
  runBus(inB, bPads, 2750, 'In2.Cu', -130);

  // —— U7 电源 / EN·RST ——
  vccVia(pw('U7', 16));
  gndVia(pw('U7', 8));
  if (gnd && pw('U7', 14) && pw('U7', 15)) {
    const a = pw('U7', 14), b = pw('U7', 15);
    add(gnd, a, { x: a.x + 70, y: a.y }, 12, 'F.Cu');
    add(gnd, { x: a.x + 70, y: a.y }, { x: b.x + 70, y: b.y }, 12, 'F.Cu');
    add(gnd, { x: b.x + 70, y: b.y }, b, 12, 'F.Cu');
    const mid = { x: a.x + 70, y: (a.y + b.y) / 2 };
    addVia(gnd, mid);
    add(gnd, mid, { x: mid.x + 40, y: mid.y }, 12, 'In1.Cu');
  }

  // —— Q0 → LED（B 层，避开 U6）——
  if (q0 && pw('U7', 3) && pw('RQ0', 1)) {
    const a = pw('U7', 3), b = pw('RQ0', 1);
    const ea = { x: a.x - 55, y: a.y };
    const eb = { x: b.x, y: b.y + 40 };
    add(q0, a, ea, 12, 'F.Cu');
    addVia(q0, ea);
    L(q0, [ea, { x: ea.x, y: eb.y }, eb], 12, 'B.Cu');
    addVia(q0, eb);
    add(q0, eb, b, 12, 'F.Cu');
  }
  if (q0Led && pw('RQ0', 2) && pw('DQ0', 1)) {
    add(q0Led, pw('RQ0', 2), { x: pw('RQ0', 2).x, y: pw('DQ0', 1).y }, 12, 'F.Cu');
    add(q0Led, { x: pw('RQ0', 2).x, y: pw('DQ0', 1).y }, pw('DQ0', 1), 12, 'F.Cu');
  }
  gndVia(pw('DQ0', 2));

  // —— B：CLK SG1 → U7 ——
  if (clk && pw('SG1', 1) && pw('U7', 13)) {
    const a = pw('SG1', 1), b = pw('U7', 13);
    const ea = { x: a.x + 80, y: a.y };
    const eb = { x: b.x + 90, y: b.y };
    const runY = 3100;
    add(clk, a, ea, 12, 'F.Cu');
    addVia(clk, ea);
    L(clk, [ea, { x: ea.x, y: runY }, { x: eb.x, y: runY }, eb], 12, 'B.Cu');
    addVia(clk, eb);
    add(clk, eb, b, 12, 'F.Cu');
  }

  // —— 电源排针 ——
  const jGnd = pw('J1', 1), jVcc = pw('J1', 2);
  if (jGnd) {
    addVia(gnd, jGnd);
    add(gnd, jGnd, { x: jGnd.x - 50, y: jGnd.y }, 14, 'In1.Cu');
  }
  if (jVcc) {
    addVia(vcc, jVcc);
    add(vcc, jVcc, { x: jVcc.x - 50, y: jVcc.y }, 14, 'In2.Cu');
  }

  const x0 = 80, x1 = 6300;
  add(vcc, { x: x0, y: 160 }, { x: x1, y: 160 }, 20, 'In2.Cu');
  add(gnd, { x: x0, y: 3400 }, { x: x1, y: 3400 }, 20, 'In1.Cu');

  return {
    trackCount: doc.tracks.length,
    netCount: 19,
    viaCount: doc.vias.length
  };
}

function handLayoutLabInstruments(doc) {
  doc.tracks = [];
  doc.vias = [];
  doc.zones = [];
  doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);

  const forceFp = (ref, defId, value) => {
    const fp = doc.footprints.find(f => f.refDes === ref);
    if (!fp) return;
    const neu = instantiate(defId, ref, value || fp.value || ref, fp.position, 0, fp.schematicCompId);
    fp.defId = neu.defId;
    fp.pads = neu.pads;
    for (const pad of fp.pads) { pad.netId = undefined; pad.netName = undefined; }
  };

  forceFp('U7', 'FP_DIP16', 'CD4017');
  forceFp('RV1', 'FP_POT3', 'POT_10k');

  const byRef = new Map(doc.footprints.map(f => [f.refDes, f]));
  const setPos = (ref, x, y, rot = 0) => {
    const fp = byRef.get(ref);
    if (!fp) return;
    fp.position = { x, y };
    fp.rotation = rot;
    fp.mirrored = false;
    fp.layer = 'F.Cu';
  };

  const netByName = (name) => doc.nets.find(n => (n.name || '').toUpperCase() === (name || '').toUpperCase());
  const gnd = doc.nets.find(n => isGndNet(n.name));
  const vcc = netByName('VCC');
  const amOut = netByName('AM_OUT');
  const hi = netByName('HI');
  const top = netByName('TOP');
  const mid = netByName('MID');
  const clk = netByName('CLK');
  const dmmA = netByName('DMM_A');
  const dmmARet = netByName('DMM_A_RET');
  const dmmOhm = netByName('DMM_OHM');
  const logicL = netByName('LOGIC_L');
  const uartLb = netByName('UART_LB');
  const laCh = [];
  for (let i = 1; i <= 7; i++) laCh[i] = netByName(`LA_CH${i}`);

  const bindPad = (ref, num, net) => {
    const fp = byRef.get(ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    if (pad && net) { pad.netId = net.id; pad.netName = net.name; }
  };

  const addProbe = (ref, defId, value, x, y, rot = 0) => {
    const schId = doc._refToSchId?.[ref];
    const fp = instantiate(defId, ref, value, { x, y }, rot, schId);
    if (!fp) return null;
    doc.footprints.push(fp);
    byRef.set(ref, fp);
    return fp;
  };

  const gndBusY = 3800;
  const vccBusY = 200;

  // —— 放置 ——
  // 左：电源链 SG / A1 / PM1
  addProbe('SG1', 'FP_THT2', 'SIG_GEN', 600, 900, 0);
  addProbe('A1', 'FP_THT2', 'AMMETER', 600, 1400, 0);
  addProbe('PM1', 'FP_PINHDR_4', 'PWR_METER', 600, 2000, 0);

  // 中上：分压 + 电压表
  setPos('R1', 1600, 1400, 0);
  setPos('RV1', 2100, 1400, 0);
  addProbe('M1', 'FP_THT2', 'VOLTMETER', 2600, 1400, 0);

  // 中：万用表支路（VM 与电阻列错开 X，避免竖线共柱）
  addProbe('VM1', 'FP_PINHDR_4', 'DMM', 3000, 900, 0);
  setPos('RAMP', 3600, 1600, 0);
  setPos('DAMP', 4000, 1600, 0);
  setPos('ROHM', 3600, 2200, 0);
  setPos('DOHM', 4000, 2200, 0);
  addProbe('FC1', 'FP_THT2', 'FREQ', 4000, 2700, 0);

  // 右：示波器 / CD4017 / LA / UART
  addProbe('OSC1', 'FP_PINHDR_6', 'SCOPE', 4200, 700, 0);
  setPos('U7', 4800, 2000, 0);
  addProbe('LA1', 'FP_PINHDR_10', 'LA', 6400, 2000, 0);
  addProbe('TERM1', 'FP_PINHDR_4', 'UART', 6400, 900, 0);

  const hdr = instantiate('FP_PINHDR_4', 'J1', 'PWR', { x: 6800, y: 3400 }, 0);
  if (hdr) {
    for (const [idx, n] of [[0, gnd], [1, vcc]]) {
      if (!n || !hdr.pads[idx]) continue;
      hdr.pads[idx].netId = n.id;
      hdr.pads[idx].netName = n.name;
    }
    doc.footprints.push(hdr);
    byRef.set('J1', hdr);
  }

  // —— 绑定 ——
  bindPad('SG1', 1, clk); bindPad('SG1', 2, gnd);
  bindPad('A1', 1, vcc); bindPad('A1', 2, amOut);
  bindPad('PM1', 1, amOut); bindPad('PM1', 2, hi);
  bindPad('PM1', 3, hi); bindPad('PM1', 4, gnd);

  bindPad('R1', 1, hi); bindPad('R1', 2, top);
  bindPad('RV1', 1, top); bindPad('RV1', 2, mid); bindPad('RV1', 3, gnd);
  bindPad('M1', 1, mid); bindPad('M1', 2, gnd);

  bindPad('VM1', 1, clk); bindPad('VM1', 2, dmmARet);
  bindPad('VM1', 3, dmmOhm); bindPad('VM1', 4, gnd);
  bindPad('RAMP', 1, vcc); bindPad('RAMP', 2, dmmA);
  bindPad('DAMP', 1, dmmA); bindPad('DAMP', 2, dmmARet);
  bindPad('ROHM', 1, dmmOhm); bindPad('ROHM', 2, gnd);
  bindPad('DOHM', 1, dmmOhm); bindPad('DOHM', 2, gnd);
  bindPad('FC1', 1, clk); bindPad('FC1', 2, gnd);

  bindPad('OSC1', 1, clk); bindPad('OSC1', 2, hi);
  bindPad('OSC1', 3, mid); bindPad('OSC1', 4, top);
  bindPad('OSC1', 5, gnd);

  // CD4017
  bindPad('U7', 16, vcc); bindPad('U7', 8, gnd);
  bindPad('U7', 13, clk); bindPad('U7', 14, logicL); bindPad('U7', 15, logicL);
  bindPad('U7', 3, laCh[1]);  // Q0
  bindPad('U7', 2, laCh[2]);  // Q1
  bindPad('U7', 4, laCh[3]);  // Q2
  bindPad('U7', 7, laCh[4]);  // Q3
  bindPad('U7', 10, laCh[5]); // Q4
  bindPad('U7', 1, laCh[6]);  // Q5
  bindPad('U7', 5, laCh[7]);  // Q6
  bindPad('RLO', 1, logicL); bindPad('RLO', 2, gnd);

  for (let i = 1; i <= 7; i++) bindPad('LA1', i, laCh[i]);
  bindPad('LA1', 8, clk); bindPad('LA1', 9, gnd);

  bindPad('TERM1', 1, uartLb); bindPad('TERM1', 2, uartLb); bindPad('TERM1', 3, gnd);

  const pw = (ref, num) => {
    const fp = byRef.get(ref) || doc.footprints.find(f => f.refDes === ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    return pad ? padWorld(fp, pad) : null;
  };
  const add = (net, a, b, w = 12, layer = 'F.Cu') => {
    if (!net || !a || !b || dist(a, b) < 0.5) return;
    doc.tracks.push({
      id: uid('trk'), layer,
      start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
      width: w, netId: net.id, netName: net.name
    });
  };
  const viaLayers = ['F.Cu', 'In1.Cu', 'In2.Cu', 'In3.Cu', 'In4.Cu', 'B.Cu'];
  const addVia = (net, pt) => {
    if (!net || !pt) return;
    for (const v of doc.vias) {
      if (v.netId === net.id && Math.abs(v.position.x - pt.x) < 0.5 &&
        Math.abs(v.position.y - pt.y) < 0.5) return;
    }
    doc.vias.push({
      id: uid('via'), position: { x: pt.x, y: pt.y },
      drill: 12, diameter: 24,
      netId: net.id, netName: net.name,
      layers: [...viaLayers], kind: 'through'
    });
  };
  const esc = (net, padPt, dx, dy, w = 12) => {
    const e = { x: padPt.x + dx, y: padPt.y + dy };
    add(net, padPt, e, w, 'F.Cu');
    addVia(net, e);
    return e;
  };

  let escSlot = 0;
  const usedCols = [];
  const usedTrunkY = [];
  const colTaken = (x) => usedCols.some(c => Math.abs(c - x) < 48);
  const pickCol = (baseX, slot) => {
    let x = Math.round(baseX + ((slot % 2 === 0) ? -1 : 1) * (50 + (slot % 7) * 24));
    let guard = 0;
    while (colTaken(x) && guard++ < 80) x += (x >= baseX ? 48 : -48);
    usedCols.push(x);
    return x;
  };
  const pickTrunkY = (baseY) => {
    let y = Math.round(baseY);
    let guard = 0;
    while (usedTrunkY.some(r => Math.abs(r - y) < 48) && guard++ < 80) y += 48;
    usedTrunkY.push(y);
    return y;
  };
  /** F 短引出到唯一列；In3 竖直；干线按 slot 分到 B/In1/In2（每层都有信号） */
  const fan = (net, pad, dir, slot) => {
    const step = 120 + (slot % 5) * 28;
    let prefer = pad.x;
    if (dir === 'L') prefer -= step;
    else if (dir === 'R') prefer += step;
    else prefer += ((slot % 2 === 0) ? -1 : 1) * step;
    const x = pickCol(prefer, slot);
    let y = pad.y;
    if (dir === 'U') y -= step;
    else if (dir === 'D') y += step;
    if (dir === 'L' || dir === 'R') {
      add(net, pad, { x, y: pad.y }, 12, 'F.Cu');
      y = pad.y;
    } else if (Math.abs(x - pad.x) > 0.5) {
      add(net, pad, { x: pad.x, y }, 12, 'F.Cu');
      add(net, { x: pad.x, y }, { x, y }, 12, 'F.Cu');
    } else {
      add(net, pad, { x, y }, 12, 'F.Cu');
    }
    addVia(net, { x, y });
    return { x, y };
  };
  const trunkLayer = (slot) => {
    const m = slot % 3;
    if (m === 0) return 'B.Cu';
    if (m === 1) return 'In1.Cu';
    return 'In2.Cu';
  };
  const runSig = (net, fromPad, toPad, chanY, fromDir, toDir) => {
    if (!net || !fromPad || !toPad) return;
    const slot = escSlot++;
    const a0 = fan(net, fromPad, fromDir, slot);
    const b0 = fan(net, toPad, toDir, slot + 2);
    const ty = pickTrunkY(chanY);
    const tl = trunkLayer(slot);
    add(net, a0, { x: a0.x, y: ty }, 12, 'In3.Cu');
    addVia(net, { x: a0.x, y: ty });
    add(net, b0, { x: b0.x, y: ty }, 12, 'In3.Cu');
    addVia(net, { x: b0.x, y: ty });
    add(net, { x: a0.x, y: ty }, { x: b0.x, y: ty }, 12, tl);
  };

  const feedVcc = (pad, dx, dy) => {
    if (!vcc || !pad) return;
    const e = esc(vcc, pad, dx, dy, 12);
    usedCols.push(Math.round(e.x));
    add(vcc, e, { x: e.x, y: vccBusY }, 14, 'In3.Cu');
    addVia(vcc, { x: e.x, y: vccBusY });
  };
  const feedGnd = (pad, dx, dy) => {
    if (!gnd || !pad) return;
    const e = esc(gnd, pad, dx, dy, 12);
    add(gnd, e, { x: e.x, y: gndBusY }, 14, 'In4.Cu');
    addVia(gnd, { x: e.x, y: gndBusY });
  };

  const x0 = 60, x1 = 7000;
  add(vcc, { x: x0, y: vccBusY }, { x: x1, y: vccBusY }, 22, 'In1.Cu');
  add(gnd, { x: x0, y: gndBusY }, { x: x1, y: gndBusY }, 22, 'In2.Cu');
  add(vcc, { x: x0, y: vccBusY + 70 }, { x: x1, y: vccBusY + 70 }, 14, 'B.Cu');
  add(gnd, { x: x0, y: gndBusY - 70 }, { x: x1, y: gndBusY - 70 }, 14, 'B.Cu');
  usedTrunkY.push(vccBusY, gndBusY, vccBusY + 70, gndBusY - 70, 560);

  // —— 电源链本地 ——
  feedVcc(pw('A1', 1), 0, -70);
  if (amOut && pw('A1', 2) && pw('PM1', 1)) {
    const a = pw('A1', 2), b = pw('PM1', 1);
    add(amOut, a, { x: a.x, y: b.y }, 12, 'F.Cu');
    add(amOut, { x: a.x, y: b.y }, b, 12, 'F.Cu');
  }
  // HI: PM1.2 → R1.1 本地；PM1.3 同网短连
  if (hi && pw('PM1', 2) && pw('PM1', 3)) add(hi, pw('PM1', 2), pw('PM1', 3), 12, 'F.Cu');
  if (hi && pw('PM1', 2) && pw('R1', 1)) {
    const a = pw('PM1', 2), b = pw('R1', 1);
    add(hi, a, { x: b.x, y: a.y }, 12, 'F.Cu');
    add(hi, { x: b.x, y: a.y }, b, 12, 'F.Cu');
  }
  feedGnd(pw('PM1', 4), 70, 0);
  // SG：地向下，CLK 向上引出再进总线，避免共 Y
  if (clk && pw('SG1', 1)) {
    add(clk, pw('SG1', 1), { x: pw('SG1', 1).x, y: pw('SG1', 1).y - 80 }, 12, 'F.Cu');
  }
  feedGnd(pw('SG1', 2), 0, 100);

  // TOP / MID 本地分压
  if (top && pw('R1', 2) && pw('RV1', 1)) add(top, pw('R1', 2), pw('RV1', 1), 12, 'F.Cu');
  if (mid && pw('RV1', 2) && pw('M1', 1)) {
    const a = pw('RV1', 2), b = pw('M1', 1);
    add(mid, a, { x: b.x, y: a.y }, 12, 'F.Cu');
    add(mid, { x: b.x, y: a.y }, b, 12, 'F.Cu');
  }
  feedGnd(pw('RV1', 3), 0, 70);
  feedGnd(pw('M1', 2), 0, 70);

  // DMM 支路本地（正交，不共柱）
  feedVcc(pw('RAMP', 1), -80, 0);
  if (dmmA && pw('RAMP', 2) && pw('DAMP', 1)) add(dmmA, pw('RAMP', 2), pw('DAMP', 1), 12, 'F.Cu');
  if (dmmARet && pw('DAMP', 2) && pw('VM1', 2)) {
    const a = pw('DAMP', 2), b = pw('VM1', 2);
    add(dmmARet, a, { x: a.x, y: b.y }, 12, 'F.Cu');
    add(dmmARet, { x: a.x, y: b.y }, b, 12, 'F.Cu');
  }
  // DMM_OHM：VM→ROHM 走内层，避免 F 长竖穿越 LA 扇出
  runSig(dmmOhm, pw('VM1', 3), pw('ROHM', 1), 2480, 'R', 'U');
  // OHM 桥接在地引出下方
  if (dmmOhm && pw('ROHM', 1) && pw('DOHM', 1)) {
    const a = pw('ROHM', 1), b = pw('DOHM', 1);
    const y = Math.max(a.y, b.y) + 140;
    add(dmmOhm, a, { x: a.x, y }, 12, 'F.Cu');
    add(dmmOhm, { x: a.x, y }, { x: b.x, y }, 12, 'F.Cu');
    add(dmmOhm, { x: b.x, y }, b, 12, 'F.Cu');
  }
  feedGnd(pw('ROHM', 2), 90, 0);
  feedGnd(pw('DOHM', 2), 90, 0);
  feedGnd(pw('VM1', 4), 80, 0);
  feedGnd(pw('FC1', 2), 0, 80);

  // UART 环回
  if (uartLb && pw('TERM1', 1) && pw('TERM1', 2)) add(uartLb, pw('TERM1', 1), pw('TERM1', 2), 12, 'F.Cu');
  feedGnd(pw('TERM1', 3), 70, 0);

  // LOGIC_L：EN/RST 在芯片右侧更远短连，避开 CLK(pin13)
  if (logicL && pw('U7', 14) && pw('U7', 15)) {
    const a = pw('U7', 14), b = pw('U7', 15);
    add(logicL, a, { x: a.x + 140, y: a.y }, 12, 'F.Cu');
    add(logicL, { x: a.x + 140, y: a.y }, { x: b.x + 140, y: b.y }, 12, 'F.Cu');
    add(logicL, { x: b.x + 140, y: b.y }, b, 12, 'F.Cu');
  }
  setPos('RLO', 5400, 3000, 0);
  runSig(logicL, pw('U7', 14), pw('RLO', 1), 2900, 'U', 'U');
  feedGnd(pw('RLO', 2), 0, 70);
  feedVcc(pw('U7', 16), 70, 0);
  feedGnd(pw('U7', 8), -70, 0);
  feedGnd(pw('OSC1', 5), 70, 0);
  feedGnd(pw('LA1', 9), 70, 0);

  // —— CLK 总线：各探针垂到 B@clkY，再按 X 串联（避免同焊盘多次 fan）——
  const clkY = 560;
  const clkPads = [
    [{ x: pw('SG1', 1).x, y: pw('SG1', 1).y - 80 }, 'R', true],
    [pw('OSC1', 1), 'U', false],
    [pw('VM1', 1), 'U', false],
    [pw('FC1', 1), 'U', false],
    [pw('U7', 13), 'D', false],
    [pw('LA1', 8), 'R', false]
  ];
  const clkCols = [];
  for (const [pad, dir, preEsc] of clkPads) {
    if (!clk || !pad) continue;
    const slot = escSlot++;
    if (preEsc) addVia(clk, pad);
    const a0 = fan(clk, pad, dir, slot);
    add(clk, a0, { x: a0.x, y: clkY }, 12, 'In3.Cu');
    addVia(clk, { x: a0.x, y: clkY });
    clkCols.push(a0.x);
  }
  clkCols.sort((a, b) => a - b);
  for (let i = 0; i + 1 < clkCols.length; i++) {
    add(clk, { x: clkCols[i], y: clkY }, { x: clkCols[i + 1], y: clkY }, 12, 'B.Cu');
  }

  // HI / MID / TOP → 示波器（扇出方向错开，避免电位器焊盘区交叉）
  runSig(hi, pw('R1', 1), pw('OSC1', 2), 1500, 'L', 'L');
  runSig(mid, pw('RV1', 2), pw('OSC1', 3), 1620, 'D', 'L');
  runSig(top, pw('RV1', 1), pw('OSC1', 4), 1740, 'U', 'L');

  // LA_CH：U7 向左扇、LA 向右扇，F 短线不相向穿越
  const qPads = [
    [1, 3, 'L'], [2, 2, 'L'], [3, 4, 'L'], [4, 7, 'L'],
    [5, 10, 'R'], [6, 1, 'L'], [7, 5, 'L']
  ];
  let cy = 1860;
  for (const [ch, padN, dir] of qPads) {
    runSig(laCh[ch], pw('U7', padN), pw('LA1', ch), cy, dir, 'R');
    cy += 110;
  }

  const jGnd = pw('J1', 1), jVcc = pw('J1', 2);
  if (jGnd) {
    const e = esc(gnd, jGnd, -50, 0, 14);
    const gx = pickCol(e.x - 60, escSlot++);
    if (Math.abs(gx - e.x) > 0.5) {
      add(gnd, e, { x: gx, y: e.y }, 14, 'In2.Cu');
      addVia(gnd, { x: gx, y: e.y });
    }
    add(gnd, { x: gx, y: e.y }, { x: gx, y: gndBusY }, 14, 'In4.Cu');
    addVia(gnd, { x: gx, y: gndBusY });
  }
  if (jVcc) {
    const e = esc(vcc, jVcc, -50, 0, 14);
    const vx = pickCol(e.x - 60, escSlot++);
    if (Math.abs(vx - e.x) > 0.5) {
      add(vcc, e, { x: vx, y: e.y }, 14, 'In1.Cu');
      addVia(vcc, { x: vx, y: e.y });
    }
    add(vcc, { x: vx, y: e.y }, { x: vx, y: vccBusY }, 14, 'In3.Cu');
    addVia(vcc, { x: vx, y: vccBusY });
  }

  return {
    trackCount: doc.tracks.length,
    netCount: 19,
    viaCount: doc.vias.length
  };
}

function handLayoutLabSensor(doc) {
  doc.tracks = [];
  doc.vias = [];
  doc.zones = [];
  doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);

  const forceFp = (ref, defId, value) => {
    const fp = doc.footprints.find(f => f.refDes === ref);
    if (!fp) return;
    const neu = instantiate(defId, ref, value || fp.value || ref, fp.position, 0, fp.schematicCompId);
    fp.defId = neu.defId;
    fp.pads = neu.pads;
    for (const pad of fp.pads) { pad.netId = undefined; pad.netName = undefined; }
  };

  forceFp('U1', 'FP_QFP48', 'STM32F103C8');
  forceFp('Y1', 'FP_HC49', '8M');
  forceFp('T1', 'FP_TO92_SENSOR', 'DS18B20');
  forceFp('H1', 'FP_TO92_SENSOR', 'HALL');
  forceFp('RV1', 'FP_POT3', 'POT_10k');
  forceFp('LDR1', 'FP_LDR', 'LDR');

  const byRef = new Map(doc.footprints.map(f => [f.refDes, f]));
  const setPos = (ref, x, y, rot = 0) => {
    const fp = byRef.get(ref);
    if (!fp) return;
    fp.position = { x, y };
    fp.rotation = rot;
    fp.mirrored = false;
    fp.layer = 'F.Cu';
  };

  const netByName = (name) => doc.nets.find(n => (n.name || '').toUpperCase() === (name || '').toUpperCase());
  const gnd = doc.nets.find(n => isGndNet(n.name));
  const vcc = netByName('VCC');
  const xtal1 = netByName('XTAL1');
  const xtal2 = netByName('XTAL2');
  const nrst = netByName('NRST');
  const oneWire = netByName('1WIRE');
  const hall = netByName('HALL');
  const adc = netByName('ADC');
  const ledPa4 = netByName('LED_PA4');
  const ledPa4A = netByName('LED_PA4_A');
  const ledPa5 = netByName('LED_PA5');
  const ledPa5A = netByName('LED_PA5_A');
  const ledPa6 = netByName('LED_PA6');
  const ledPa6A = netByName('LED_PA6_A');

  const bindPad = (ref, num, net) => {
    const fp = byRef.get(ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    if (pad && net) { pad.netId = net.id; pad.netName = net.name; }
  };

  const ux = 1200, uy = 1700;
  const gndBusY = uy + 1500;
  const vccBusY = uy - 1500;

  setPos('U1', ux, uy, 0);
  setPos('Y1', ux - 580, uy - 200, 0);
  setPos('CX1', ux - 640, uy - 380, 180);
  setPos('CX2', ux - 520, uy - 380, 180);
  setPos('R1', ux - 540, uy + 240, 180);
  setPos('C1', ux + 480, uy - 120, 0);

  // 传感器列：上拉在器件上方，避免与信号横线共 Y
  setPos('T1', 2800, 800, 0);
  setPos('R2', 2800, 550, 90);
  setPos('H1', 2800, 1600, 0);
  setPos('RH', 2800, 1350, 90);
  setPos('RV1', 2800, 2400, 0);
  setPos('LDR1', 3200, 2600, 0);

  // LED 列
  setPos('RL1', 4200, 800, 0);
  setPos('D_ADC', 4600, 800, 0);
  setPos('RL2', 4200, 1500, 0);
  setPos('D_HALL', 4600, 1500, 0);
  setPos('RL3', 4200, 2200, 0);
  setPos('D_TEMP', 4600, 2200, 0);

  const hdr = instantiate('FP_PINHDR_4', 'J1', 'PWR', { x: 5200, y: uy }, 0);
  if (hdr) {
    for (const [idx, n] of [[0, gnd], [1, vcc]]) {
      if (!n || !hdr.pads[idx]) continue;
      hdr.pads[idx].netId = n.id;
      hdr.pads[idx].netName = n.name;
    }
    doc.footprints.push(hdr);
    byRef.set('J1', hdr);
  }

  bindPad('U1', 5, xtal1); bindPad('U1', 6, xtal2);
  bindPad('U1', 7, nrst);
  bindPad('U1', 23, gnd); bindPad('U1', 24, vcc);
  bindPad('U1', 10, adc);   // PA0
  bindPad('U1', 13, oneWire); // PA3
  bindPad('U1', 14, ledPa4);  // PA4
  bindPad('U1', 15, ledPa5);  // PA5
  bindPad('U1', 16, ledPa6);  // PA6
  bindPad('U1', 18, hall);    // PB0

  const y1 = byRef.get('Y1');
  if (y1) {
    const p1 = y1.pads.find(p => p.number === '1');
    const p2 = y1.pads.find(p => p.number === '2');
    if (p1 && xtal1) { p1.netId = xtal1.id; p1.netName = xtal1.name; }
    if (p2 && xtal2) { p2.netId = xtal2.id; p2.netName = xtal2.name; }
  }
  bindPad('CX1', 1, xtal1); bindPad('CX1', 2, gnd);
  bindPad('CX2', 1, xtal2); bindPad('CX2', 2, gnd);
  bindPad('R1', 1, nrst); bindPad('R1', 2, vcc);
  bindPad('C1', 1, vcc); bindPad('C1', 2, gnd);

  bindPad('T1', 1, gnd); bindPad('T1', 2, oneWire); bindPad('T1', 3, vcc);
  bindPad('R2', 1, oneWire); bindPad('R2', 2, vcc);

  bindPad('H1', 1, vcc); bindPad('H1', 2, hall); bindPad('H1', 3, gnd);
  bindPad('RH', 1, vcc); bindPad('RH', 2, hall);

  bindPad('RV1', 1, vcc); bindPad('RV1', 2, adc); bindPad('RV1', 3, gnd);
  bindPad('LDR1', 1, adc); bindPad('LDR1', 2, gnd);

  bindPad('RL1', 1, ledPa4); bindPad('RL1', 2, ledPa4A);
  bindPad('D_ADC', 1, ledPa4A); bindPad('D_ADC', 2, gnd);
  bindPad('RL2', 1, ledPa5); bindPad('RL2', 2, ledPa5A);
  bindPad('D_HALL', 1, ledPa5A); bindPad('D_HALL', 2, gnd);
  bindPad('RL3', 1, ledPa6); bindPad('RL3', 2, ledPa6A);
  bindPad('D_TEMP', 1, ledPa6A); bindPad('D_TEMP', 2, gnd);

  const pw = (ref, num) => {
    const fp = byRef.get(ref) || doc.footprints.find(f => f.refDes === ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    return pad ? padWorld(fp, pad) : null;
  };
  const add = (net, a, b, w = 12, layer = 'F.Cu') => {
    if (!net || !a || !b || dist(a, b) < 0.5) return;
    doc.tracks.push({
      id: uid('trk'), layer,
      start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
      width: w, netId: net.id, netName: net.name
    });
  };
  const viaLayers = ['F.Cu', 'In1.Cu', 'In2.Cu', 'In3.Cu', 'In4.Cu', 'B.Cu'];
  const addVia = (net, pt) => {
    if (!net || !pt) return;
    for (const v of doc.vias) {
      if (v.netId === net.id && Math.abs(v.position.x - pt.x) < 0.5 &&
        Math.abs(v.position.y - pt.y) < 0.5) return;
    }
    doc.vias.push({
      id: uid('via'), position: { x: pt.x, y: pt.y },
      drill: 12, diameter: 24,
      netId: net.id, netName: net.name,
      layers: [...viaLayers], kind: 'through'
    });
  };
  const esc = (net, padPt, dx, dy, w = 12) => {
    const e = { x: padPt.x + dx, y: padPt.y + dy };
    add(net, padPt, e, w, 'F.Cu');
    addVia(net, e);
    return e;
  };

  let escSlot = 0;
  const usedCols = [];
  const colTaken = (x) => usedCols.some(c => Math.abs(c - x) < 36);
  const pickCol = (baseX, slot) => {
    let x = Math.round(baseX + ((slot % 2 === 0) ? -1 : 1) * (60 + slot * 32));
    let guard = 0;
    while (colTaken(x) && guard++ < 50) x += (x >= baseX ? 36 : -36);
    usedCols.push(x);
    return x;
  };
  const fan = (net, pad, dir, slot) => {
    const step = 100 + slot * 40;
    let x = pad.x, y = pad.y;
    if (dir === 'L') x -= step;
    else if (dir === 'R') x += step;
    else if (dir === 'U') y -= step;
    else y += step;
    add(net, pad, { x, y }, 12, 'F.Cu');
    addVia(net, { x, y });
    return { x, y };
  };
  const runSig = (net, fromPad, toPad, chanY, fromDir, toDir) => {
    if (!net || !fromPad || !toPad) return;
    const slot = escSlot++;
    const a0 = fan(net, fromPad, fromDir, slot);
    const b0 = fan(net, toPad, toDir, slot + 2);
    const ax = pickCol(a0.x, slot);
    const bx = pickCol(b0.x, slot + 13);
    const jogA = (slot % 2 === 0) ? 'In1.Cu' : 'In2.Cu';
    const jogB = (slot % 2 === 0) ? 'In2.Cu' : 'In1.Cu';
    // 错列高度按 slot 错开，避免同层平行横线贴边
    const ay = a0.y + ((slot % 2 === 0) ? -1 : 1) * (20 + slot * 18);
    const by = b0.y + ((slot % 2 === 0) ? 1 : -1) * (20 + slot * 18);
    add(net, a0, { x: a0.x, y: ay }, 12, 'In3.Cu');
    addVia(net, { x: a0.x, y: ay });
    if (Math.abs(ax - a0.x) > 0.5) {
      add(net, { x: a0.x, y: ay }, { x: ax, y: ay }, 12, jogA);
      addVia(net, { x: ax, y: ay });
    }
    add(net, b0, { x: b0.x, y: by }, 12, 'In3.Cu');
    addVia(net, { x: b0.x, y: by });
    if (Math.abs(bx - b0.x) > 0.5) {
      add(net, { x: b0.x, y: by }, { x: bx, y: by }, 12, jogB);
      addVia(net, { x: bx, y: by });
    }
    add(net, { x: ax, y: ay }, { x: ax, y: chanY }, 12, 'In3.Cu');
    addVia(net, { x: ax, y: chanY });
    add(net, { x: bx, y: by }, { x: bx, y: chanY }, 12, 'In3.Cu');
    addVia(net, { x: bx, y: chanY });
    add(net, { x: ax, y: chanY }, { x: bx, y: chanY }, 12, 'B.Cu');
  };

  const feedVcc = (pad, dx, dy) => {
    if (!vcc || !pad) return;
    const e = esc(vcc, pad, dx, dy, 12);
    usedCols.push(Math.round(e.x));
    add(vcc, e, { x: e.x, y: vccBusY }, 14, 'In3.Cu');
    addVia(vcc, { x: e.x, y: vccBusY });
  };
  const feedGnd = (pad, dx, dy) => {
    if (!gnd || !pad) return;
    const e = esc(gnd, pad, dx, dy, 12);
    add(gnd, e, { x: e.x, y: gndBusY }, 14, 'In4.Cu');
    addVia(gnd, { x: e.x, y: gndBusY });
  };

  const x0 = 60, x1 = 5400;
  add(vcc, { x: x0, y: vccBusY }, { x: x1, y: vccBusY }, 22, 'In1.Cu');
  add(gnd, { x: x0, y: gndBusY }, { x: x1, y: gndBusY }, 22, 'In2.Cu');
  add(vcc, { x: x0, y: vccBusY + 80 }, { x: x1, y: vccBusY + 80 }, 14, 'B.Cu');
  add(gnd, { x: x0, y: gndBusY - 80 }, { x: x1, y: gndBusY - 80 }, 14, 'B.Cu');

  const vccFeedX = ux + 520;
  const uGnd = pw('U1', 23), uVcc = pw('U1', 24);
  const uRst = pw('U1', 7), uX1 = pw('U1', 5), uX2 = pw('U1', 6);
  const yA = pw('Y1', 1), yB = pw('Y1', 2);
  const cx1a = pw('CX1', 1), cx1b = pw('CX1', 2);
  const cx2a = pw('CX2', 1), cx2b = pw('CX2', 2);
  const r1a = pw('R1', 1), r1b = pw('R1', 2);
  const c1a = pw('C1', 1), c1b = pw('C1', 2);

  if (xtal1 && uX1 && yA) {
    const e = esc(xtal1, uX1, -50, 0, 12);
    add(xtal1, e, { x: yA.x, y: e.y }, 12, 'In2.Cu');
    addVia(xtal1, { x: yA.x, y: e.y });
    add(xtal1, { x: yA.x, y: e.y }, yA, 12, 'F.Cu');
  }
  if (xtal2 && uX2 && yB) {
    const e = esc(xtal2, uX2, -55, 0, 12);
    add(xtal2, e, { x: yB.x, y: e.y }, 12, 'In1.Cu');
    addVia(xtal2, { x: yB.x, y: e.y });
    add(xtal2, { x: yB.x, y: e.y }, yB, 12, 'F.Cu');
  }
  if (xtal1 && yA && cx1a) {
    add(xtal1, yA, { x: yA.x, y: cx1a.y }, 12, 'F.Cu');
    add(xtal1, { x: yA.x, y: cx1a.y }, cx1a, 12, 'F.Cu');
  }
  if (xtal2 && yB && cx2a) {
    add(xtal2, yB, { x: yB.x, y: cx2a.y }, 12, 'F.Cu');
    add(xtal2, { x: yB.x, y: cx2a.y }, cx2a, 12, 'F.Cu');
  }
  for (const pad of [cx1b, cx2b]) {
    if (!pad) continue;
    const e = esc(gnd, pad, 0, 55, 12);
    add(gnd, e, { x: e.x, y: gndBusY }, 14, 'In4.Cu');
    addVia(gnd, { x: e.x, y: gndBusY });
  }

  if (uGnd) {
    const e = esc(gnd, uGnd, 0, 90, 14);
    add(gnd, e, { x: e.x, y: gndBusY }, 14, 'In4.Cu');
    addVia(gnd, { x: e.x, y: gndBusY });
  }
  if (uVcc) {
    // 焊盘过孔后先上到远离底边信号带，再错列（避免与 PA* In2 共 Y）
    addVia(vcc, uVcc);
    usedCols.push(Math.round(uVcc.x));
    const midY = uVcc.y - 120;
    add(vcc, uVcc, { x: uVcc.x, y: midY }, 14, 'In3.Cu');
    addVia(vcc, { x: uVcc.x, y: midY });
    const col = uVcc.x - 160;
    usedCols.push(Math.round(col));
    add(vcc, { x: uVcc.x, y: midY }, { x: col, y: midY }, 14, 'In1.Cu');
    addVia(vcc, { x: col, y: midY });
    add(vcc, { x: col, y: midY }, { x: col, y: vccBusY }, 14, 'In3.Cu');
    addVia(vcc, { x: col, y: vccBusY });
    add(vcc, { x: col, y: vccBusY }, { x: vccFeedX, y: vccBusY }, 14, 'In1.Cu');
  }
  if (c1a) {
    const e = esc(vcc, c1a, 55, -50, 12);
    usedCols.push(Math.round(e.x));
    add(vcc, e, { x: e.x, y: vccBusY }, 14, 'In3.Cu');
    addVia(vcc, { x: e.x, y: vccBusY });
  }
  if (c1b) {
    const e = esc(gnd, c1b, 60, 50, 12);
    add(gnd, e, { x: e.x, y: gndBusY }, 14, 'In4.Cu');
    addVia(gnd, { x: e.x, y: gndBusY });
  }
  if (nrst && r1a && uRst) {
    const colX = Math.min(r1a.x, uRst.x) - 55;
    add(nrst, r1a, { x: colX, y: r1a.y }, 12, 'F.Cu');
    add(nrst, { x: colX, y: r1a.y }, { x: colX, y: uRst.y }, 12, 'F.Cu');
    add(nrst, { x: colX, y: uRst.y }, uRst, 12, 'F.Cu');
  }
  if (r1b) feedVcc(r1b, -60, 0);

  // QFP48：1-12 左 / 13-24 底 / 25-36 右 / 37-48 顶
  // PA0=10 左；PA3=13、PA4-6=14-16、PB0=18 底

  // 1-Wire：底边向下出；上拉在 T1 上方竖连；电源向外/向下，不横穿中间脚
  runSig(oneWire, pw('U1', 13), pw('T1', 2), 480, 'D', 'U');
  if (oneWire && pw('R2', 2) && pw('T1', 2)) add(oneWire, pw('R2', 2), pw('T1', 2), 12, 'F.Cu');
  feedVcc(pw('R2', 1), -80, 0);
  feedVcc(pw('T1', 3), 0, 80);
  feedGnd(pw('T1', 1), 0, 80);

  // 霍尔：电源向下出，信号从上拉竖入
  runSig(hall, pw('U1', 18), pw('H1', 2), 1200, 'D', 'U');
  if (hall && pw('RH', 2) && pw('H1', 2)) add(hall, pw('RH', 2), pw('H1', 2), 12, 'F.Cu');
  feedVcc(pw('RH', 1), -80, 0);
  feedVcc(pw('H1', 1), 0, 90);
  feedGnd(pw('H1', 3), 0, 90);

  // ADC：PA0 左侧出
  runSig(adc, pw('U1', 10), pw('RV1', 2), 2100, 'L', 'U');
  if (adc && pw('RV1', 2) && pw('LDR1', 1)) {
    const a = pw('RV1', 2), b = pw('LDR1', 1);
    add(adc, a, { x: a.x, y: b.y }, 12, 'F.Cu');
    add(adc, { x: a.x, y: b.y }, b, 12, 'F.Cu');
  }
  feedVcc(pw('RV1', 1), -70, 0);
  feedGnd(pw('RV1', 3), 70, 0);
  feedGnd(pw('LDR1', 2), 0, 70);

  // LED：底边焊盘一律向下短引出，避免共 Y 水平互贴
  runSig(ledPa4, pw('U1', 14), pw('RL1', 1), 640, 'D', 'L');
  runSig(ledPa5, pw('U1', 15), pw('RL2', 1), 1320, 'D', 'L');
  runSig(ledPa6, pw('U1', 16), pw('RL3', 1), 1980, 'D', 'L');
  if (ledPa4A && pw('RL1', 2) && pw('D_ADC', 1)) add(ledPa4A, pw('RL1', 2), pw('D_ADC', 1), 12, 'F.Cu');
  if (ledPa5A && pw('RL2', 2) && pw('D_HALL', 1)) add(ledPa5A, pw('RL2', 2), pw('D_HALL', 1), 12, 'F.Cu');
  if (ledPa6A && pw('RL3', 2) && pw('D_TEMP', 1)) add(ledPa6A, pw('RL3', 2), pw('D_TEMP', 1), 12, 'F.Cu');
  feedGnd(pw('D_ADC', 2), 0, 70);
  feedGnd(pw('D_HALL', 2), 0, 70);
  feedGnd(pw('D_TEMP', 2), 0, 70);

  const jGnd = pw('J1', 1), jVcc = pw('J1', 2);
  if (jGnd) {
    const e = esc(gnd, jGnd, -50, 0, 14);
    add(gnd, e, { x: e.x, y: gndBusY }, 14, 'In4.Cu');
    addVia(gnd, { x: e.x, y: gndBusY });
  }
  if (jVcc) {
    const e = esc(vcc, jVcc, -50, 0, 14);
    usedCols.push(Math.round(e.x));
    add(vcc, e, { x: e.x, y: vccBusY }, 14, 'In3.Cu');
    addVia(vcc, { x: e.x, y: vccBusY });
  }

  return {
    trackCount: doc.tracks.length,
    netCount: 14,
    viaCount: doc.vias.length
  };
}

function handLayoutLabPeripheral(doc) {
  doc.tracks = [];
  doc.vias = [];
  doc.zones = [];
  doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);

  const forceFp = (ref, defId, value) => {
    const fp = doc.footprints.find(f => f.refDes === ref);
    if (!fp) return;
    const neu = instantiate(defId, ref, value || fp.value || ref, fp.position, 0, fp.schematicCompId);
    fp.defId = neu.defId;
    fp.pads = neu.pads;
    for (const pad of fp.pads) { pad.netId = undefined; pad.netName = undefined; }
  };

  forceFp('U1', 'FP_QFP48', 'STM32F103C8');
  forceFp('Y1', 'FP_HC49', '8M');
  forceFp('SW1', 'FP_SW_PUSH', 'SW_PUSH');
  forceFp('K1', 'FP_RELAY_SPDT', 'RELAY_SPDT');
  forceFp('BZ1', 'FP_BUZZER', 'BUZZER');
  forceFp('LCD1', 'FP_LCD1602', 'LCD1602');
  forceFp('OLED1', 'FP_OLED', 'OLED_12864');

  const byRef = new Map(doc.footprints.map(f => [f.refDes, f]));
  const setPos = (ref, x, y, rot = 0) => {
    const fp = byRef.get(ref);
    if (!fp) return;
    fp.position = { x, y };
    fp.rotation = rot;
    fp.mirrored = false;
    fp.layer = 'F.Cu';
  };

  const netByName = (name) => doc.nets.find(n => (n.name || '').toUpperCase() === (name || '').toUpperCase());
  const gnd = doc.nets.find(n => isGndNet(n.name));
  const vcc = netByName('VCC');
  const xtal1 = netByName('XTAL1');
  const xtal2 = netByName('XTAL2');
  const nrst = netByName('NRST');
  const key = netByName('KEY');
  const relDrv = netByName('REL_DRV');
  const relCoil = netByName('REL_COIL');
  const relNoA = netByName('REL_NO_A');
  const relNo = netByName('REL_NO');
  const relNcA = netByName('REL_NC_A');
  const relNc = netByName('REL_NC');
  const buz = netByName('BUZ');
  const buzDrv = netByName('BUZ_DRV');
  const lcdVo = netByName('LCD_VO');
  const lcdRs = netByName('LCD_RS');
  const lcdE = netByName('LCD_E');
  const lcdD4 = netByName('LCD_D4');
  const lcdD5 = netByName('LCD_D5');
  const lcdD6 = netByName('LCD_D6');
  const lcdD7 = netByName('LCD_D7');
  const oledSda = netByName('OLED_SDA');
  const oledScl = netByName('OLED_SCL');

  const bindPad = (ref, num, net) => {
    const fp = byRef.get(ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    if (pad && net) { pad.netId = net.id; pad.netName = net.name; }
  };

  const ux = 1200, uy = 1800;
  const gndBusY = uy + 1600;
  const vccBusY = uy - 1600;

  setPos('U1', ux, uy, 0);
  setPos('Y1', ux - 580, uy - 200, 0);
  setPos('CX1', ux - 640, uy - 380, 180);
  setPos('CX2', ux - 520, uy - 380, 180);
  setPos('R1', ux - 540, uy + 240, 180);
  setPos('C1', ux + 480, uy - 120, 0);

  // R2 旋转 180：pad1(KEY) 朝右接 SW
  setPos('R2', 2100, 520, 180);
  setPos('SW1', 2450, 520, 0);
  setPos('K1', 2600, 1500, 0);
  setPos('RR', 2100, 1400, 0);
  setPos('RLNO', 3300, 400, 0);
  setPos('DNO', 3600, 400, 0);
  setPos('RLNC', 3300, 1800, 0);
  setPos('DNC', 3600, 1800, 0);
  setPos('RBZ', 2100, 2550, 0);
  setPos('BZ1', 2550, 2550, 0);

  setPos('LCD1', 4600, 800, 0);
  setPos('RVO', 3900, 1300, 90);
  setPos('OLED1', 4600, 2800, 0);
  // 上拉与 SDA/SCL 焊盘同 X，只做竖连
  // pad2(信号) 朝向 OLED：上方用 90，下方用 270
  setPos('RODA', 4540, 2500, 90);
  setPos('ROCL', 4720, 3100, 270);

  const hdr = instantiate('FP_PINHDR_4', 'J1', 'PWR', { x: 5800, y: uy }, 0);
  if (hdr) {
    for (const [idx, n] of [[0, gnd], [1, vcc]]) {
      if (!n || !hdr.pads[idx]) continue;
      hdr.pads[idx].netId = n.id;
      hdr.pads[idx].netName = n.name;
    }
    doc.footprints.push(hdr);
    byRef.set('J1', hdr);
  }

  bindPad('U1', 5, xtal1); bindPad('U1', 6, xtal2);
  bindPad('U1', 7, nrst);
  bindPad('U1', 23, gnd); bindPad('U1', 24, vcc);
  bindPad('U1', 11, key); bindPad('U1', 12, relDrv); bindPad('U1', 13, buz);
  bindPad('U1', 18, lcdRs); bindPad('U1', 19, lcdE);
  bindPad('U1', 25, lcdD4); bindPad('U1', 26, lcdD5);
  bindPad('U1', 27, lcdD6); bindPad('U1', 28, lcdD7);
  bindPad('U1', 42, oledScl); bindPad('U1', 43, oledSda);

  const y1 = byRef.get('Y1');
  if (y1) {
    const p1 = y1.pads.find(p => p.number === '1');
    const p2 = y1.pads.find(p => p.number === '2');
    if (p1 && xtal1) { p1.netId = xtal1.id; p1.netName = xtal1.name; }
    if (p2 && xtal2) { p2.netId = xtal2.id; p2.netName = xtal2.name; }
  }
  bindPad('CX1', 1, xtal1); bindPad('CX1', 2, gnd);
  bindPad('CX2', 1, xtal2); bindPad('CX2', 2, gnd);
  bindPad('R1', 1, nrst); bindPad('R1', 2, vcc);
  bindPad('C1', 1, vcc); bindPad('C1', 2, gnd);

  bindPad('SW1', 1, key); bindPad('SW1', 2, gnd);
  bindPad('SW1', 3, key); bindPad('SW1', 4, gnd);
  bindPad('R2', 1, key); bindPad('R2', 2, vcc);

  bindPad('RR', 1, relDrv); bindPad('RR', 2, relCoil);
  bindPad('K1', 1, relCoil); bindPad('K1', 2, gnd);
  bindPad('K1', 3, gnd); bindPad('K1', 4, relNo); bindPad('K1', 5, relNc);

  bindPad('RLNO', 1, vcc); bindPad('RLNO', 2, relNoA);
  bindPad('DNO', 1, relNoA); bindPad('DNO', 2, relNo);
  bindPad('RLNC', 1, vcc); bindPad('RLNC', 2, relNcA);
  bindPad('DNC', 1, relNcA); bindPad('DNC', 2, relNc);

  bindPad('RBZ', 1, buz); bindPad('RBZ', 2, buzDrv);
  bindPad('BZ1', 1, buzDrv); bindPad('BZ1', 2, gnd);

  bindPad('LCD1', 1, gnd); bindPad('LCD1', 2, vcc); bindPad('LCD1', 3, lcdVo);
  bindPad('LCD1', 4, lcdRs); bindPad('LCD1', 5, gnd); bindPad('LCD1', 6, lcdE);
  bindPad('LCD1', 11, lcdD4); bindPad('LCD1', 12, lcdD5);
  bindPad('LCD1', 13, lcdD6); bindPad('LCD1', 14, lcdD7);
  bindPad('LCD1', 15, vcc); bindPad('LCD1', 16, gnd);
  bindPad('RVO', 1, lcdVo); bindPad('RVO', 2, gnd);

  bindPad('OLED1', 1, vcc); bindPad('OLED1', 2, gnd);
  bindPad('OLED1', 3, oledSda); bindPad('OLED1', 4, oledScl);
  bindPad('RODA', 1, vcc); bindPad('RODA', 2, oledSda);
  bindPad('ROCL', 1, vcc); bindPad('ROCL', 2, oledScl);

  const pw = (ref, num) => {
    const fp = byRef.get(ref) || doc.footprints.find(f => f.refDes === ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    return pad ? padWorld(fp, pad) : null;
  };
  const add = (net, a, b, w = 12, layer = 'F.Cu') => {
    if (!net || !a || !b || dist(a, b) < 0.5) return;
    doc.tracks.push({
      id: uid('trk'), layer,
      start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
      width: w, netId: net.id, netName: net.name
    });
  };
  const viaLayers = ['F.Cu', 'In1.Cu', 'In2.Cu', 'In3.Cu', 'In4.Cu', 'B.Cu'];
  const addVia = (net, pt) => {
    if (!net || !pt) return;
    for (const v of doc.vias) {
      if (v.netId === net.id && Math.abs(v.position.x - pt.x) < 0.5 &&
        Math.abs(v.position.y - pt.y) < 0.5) return;
    }
    doc.vias.push({
      id: uid('via'), position: { x: pt.x, y: pt.y },
      drill: 12, diameter: 24,
      netId: net.id, netName: net.name,
      layers: [...viaLayers], kind: 'through'
    });
  };
  const esc = (net, padPt, dx, dy, w = 12) => {
    const e = { x: padPt.x + dx, y: padPt.y + dy };
    add(net, padPt, e, w, 'F.Cu');
    addVia(net, e);
    return e;
  };

  /**
   * F：按焊盘边单段短引出（左 L / 底 D / 右 R / 顶 U）。
   * 错列横线交替走 In1/In2（异层不碰）；In3 竖直；B 水平。
   */
  let escSlot = 0;
  const usedCols = [];
  const colTaken = (x) => usedCols.some(c => Math.abs(c - x) < 36);
  const pickCol = (baseX, slot) => {
    let x = Math.round(baseX + ((slot % 2 === 0) ? -1 : 1) * (60 + slot * 32));
    let guard = 0;
    while (colTaken(x) && guard++ < 50) x += (x >= baseX ? 36 : -36);
    usedCols.push(x);
    return x;
  };
  const fan = (net, pad, dir, slot) => {
    const step = 100 + (slot % 4) * 40;
    let x = pad.x, y = pad.y;
    if (dir === 'L') x -= step;
    else if (dir === 'R') x += step;
    else if (dir === 'U') y -= step;
    else y += step;
    add(net, pad, { x, y }, 12, 'F.Cu');
    addVia(net, { x, y });
    return { x, y };
  };
  const runSig = (net, fromPad, toPad, chanY, fromDir, toDir) => {
    if (!net || !fromPad || !toPad) return;
    const slot = escSlot++;
    const a0 = fan(net, fromPad, fromDir, slot);
    const b0 = fan(net, toPad, toDir, slot + 2);
    const ax = pickCol(a0.x, slot);
    const bx = pickCol(b0.x, slot + 13);
    const jogA = (slot % 2 === 0) ? 'In1.Cu' : 'In2.Cu';
    const jogB = (slot % 2 === 0) ? 'In2.Cu' : 'In1.Cu';
    if (Math.abs(ax - a0.x) > 0.5) {
      add(net, a0, { x: ax, y: a0.y }, 12, jogA);
      addVia(net, { x: ax, y: a0.y });
    }
    if (Math.abs(bx - b0.x) > 0.5) {
      add(net, b0, { x: bx, y: b0.y }, 12, jogB);
      addVia(net, { x: bx, y: b0.y });
    }
    add(net, { x: ax, y: a0.y }, { x: ax, y: chanY }, 12, 'In3.Cu');
    addVia(net, { x: ax, y: chanY });
    add(net, { x: bx, y: b0.y }, { x: bx, y: chanY }, 12, 'In3.Cu');
    addVia(net, { x: bx, y: chanY });
    add(net, { x: ax, y: chanY }, { x: bx, y: chanY }, 12, 'B.Cu');
  };

  const feedVcc = (pad, dx, dy) => {
    if (!vcc || !pad) return;
    const e = esc(vcc, pad, dx, dy, 12);
    usedCols.push(Math.round(e.x));
    add(vcc, e, { x: e.x, y: vccBusY }, 14, 'In3.Cu');
    addVia(vcc, { x: e.x, y: vccBusY });
  };
  const feedGnd = (pad, dx, dy) => {
    if (!gnd || !pad) return;
    const e = esc(gnd, pad, dx, dy, 12);
    add(gnd, e, { x: e.x, y: gndBusY }, 14, 'In4.Cu');
    addVia(gnd, { x: e.x, y: gndBusY });
  };

  const x0 = 60, x1 = 6100;
  add(vcc, { x: x0, y: vccBusY }, { x: x1, y: vccBusY }, 22, 'In1.Cu');
  add(gnd, { x: x0, y: gndBusY }, { x: x1, y: gndBusY }, 22, 'In2.Cu');
  // B 层板边平行电源（Y 远离信号通道 380~2850）
  add(vcc, { x: x0, y: vccBusY + 80 }, { x: x1, y: vccBusY + 80 }, 14, 'B.Cu');
  add(gnd, { x: x0, y: gndBusY - 80 }, { x: x1, y: gndBusY - 80 }, 14, 'B.Cu');

  const vccFeedX = ux + 520;

  const uGnd = pw('U1', 23), uVcc = pw('U1', 24);
  const uRst = pw('U1', 7), uX1 = pw('U1', 5), uX2 = pw('U1', 6);
  const yA = pw('Y1', 1), yB = pw('Y1', 2);
  const cx1a = pw('CX1', 1), cx1b = pw('CX1', 2);
  const cx2a = pw('CX2', 1), cx2b = pw('CX2', 2);
  const r1a = pw('R1', 1), r1b = pw('R1', 2);
  const c1a = pw('C1', 1), c1b = pw('C1', 2);

  // 晶振
  if (xtal1 && uX1 && yA) {
    const e = esc(xtal1, uX1, -50, 0, 12);
    add(xtal1, e, { x: yA.x, y: e.y }, 12, 'In2.Cu');
    addVia(xtal1, { x: yA.x, y: e.y });
    add(xtal1, { x: yA.x, y: e.y }, yA, 12, 'F.Cu');
  }
  if (xtal2 && uX2 && yB) {
    const e = esc(xtal2, uX2, -55, 0, 12);
    add(xtal2, e, { x: yB.x, y: e.y }, 12, 'In1.Cu');
    addVia(xtal2, { x: yB.x, y: e.y });
    add(xtal2, { x: yB.x, y: e.y }, yB, 12, 'F.Cu');
  }
  if (xtal1 && yA && cx1a) {
    add(xtal1, yA, { x: yA.x, y: cx1a.y }, 12, 'F.Cu');
    add(xtal1, { x: yA.x, y: cx1a.y }, cx1a, 12, 'F.Cu');
  }
  if (xtal2 && yB && cx2a) {
    add(xtal2, yB, { x: yB.x, y: cx2a.y }, 12, 'F.Cu');
    add(xtal2, { x: yB.x, y: cx2a.y }, cx2a, 12, 'F.Cu');
  }
  for (const pad of [cx1b, cx2b]) {
    if (!pad) continue;
    const e = esc(gnd, pad, 0, 55, 12);
    add(gnd, e, { x: e.x, y: gndBusY }, 14, 'In4.Cu');
    addVia(gnd, { x: e.x, y: gndBusY });
  }

  if (uGnd) {
    // 底边地：向下出，避免与 VCC 共水平
    const e = esc(gnd, uGnd, 0, 90, 14);
    add(gnd, e, { x: e.x, y: gndBusY }, 14, 'In4.Cu');
    addVia(gnd, { x: e.x, y: gndBusY });
  }
  if (uVcc) {
    // 焊盘内过孔直下 In3，避免 F 竖线贴住右侧 LCD_Dx
    addVia(vcc, uVcc);
    usedCols.push(Math.round(uVcc.x));
    // 先错到安全列再上到电源轨
    const col = uVcc.x - 160;
    usedCols.push(Math.round(col));
    add(vcc, uVcc, { x: col, y: uVcc.y }, 14, 'In2.Cu');
    addVia(vcc, { x: col, y: uVcc.y });
    add(vcc, { x: col, y: uVcc.y }, { x: col, y: vccBusY }, 14, 'In3.Cu');
    addVia(vcc, { x: col, y: vccBusY });
    add(vcc, { x: col, y: vccBusY }, { x: vccFeedX, y: vccBusY }, 14, 'In1.Cu');
  }
  if (c1a) {
    const e = esc(vcc, c1a, 55, -50, 12);
    add(vcc, e, { x: e.x, y: vccBusY }, 14, 'In3.Cu');
    addVia(vcc, { x: e.x, y: vccBusY });
  }
  if (c1b) {
    const e = esc(gnd, c1b, 60, 50, 12);
    add(gnd, e, { x: e.x, y: gndBusY }, 14, 'In4.Cu');
    addVia(gnd, { x: e.x, y: gndBusY });
  }
  if (nrst && r1a && uRst) {
    const colX = Math.min(r1a.x, uRst.x) - 55;
    add(nrst, r1a, { x: colX, y: r1a.y }, 12, 'F.Cu');
    add(nrst, { x: colX, y: r1a.y }, { x: colX, y: uRst.y }, 12, 'F.Cu');
    add(nrst, { x: colX, y: uRst.y }, uRst, 12, 'F.Cu');
  }
  if (r1b) {
    const e = esc(vcc, r1b, -60, 0, 12);
    add(vcc, e, { x: e.x, y: vccBusY }, 14, 'In3.Cu');
    addVia(vcc, { x: e.x, y: vccBusY });
  }

  // —— 信号（QFP48：1-12 左 / 13-24 底 / 25-36 右 / 37-48 顶）——
  runSig(key, pw('U1', 11), pw('R2', 1), 560, 'L', 'R');
  if (key && pw('R2', 1) && pw('SW1', 1)) {
    const a = pw('R2', 1), b = pw('SW1', 1);
    add(key, a, { x: b.x, y: a.y }, 12, 'F.Cu');
    add(key, { x: b.x, y: a.y }, b, 12, 'F.Cu');
  }
  feedVcc(pw('R2', 2), -70, 0);
  feedGnd(pw('SW1', 2), 0, 70);

  // pad12 左 / pad13 底：拐角用焊盘过孔，避免 F 短段互贴
  {
    const relPad = pw('U1', 12), rrPad = pw('RR', 1);
    if (relDrv && relPad && rrPad) {
      addVia(relDrv, relPad);
      usedCols.push(Math.round(relPad.x));
      const a0 = { x: relPad.x, y: relPad.y };
      const b0 = fan(relDrv, rrPad, 'L', escSlot + 2);
      const slot = escSlot++;
      const ax = pickCol(a0.x - 80, slot);
      const bx = pickCol(b0.x, slot + 13);
      const jogA = 'In1.Cu', jogB = 'In2.Cu';
      add(relDrv, a0, { x: ax, y: a0.y }, 12, jogA);
      addVia(relDrv, { x: ax, y: a0.y });
      if (Math.abs(bx - b0.x) > 0.5) {
        add(relDrv, b0, { x: bx, y: b0.y }, 12, jogB);
        addVia(relDrv, { x: bx, y: b0.y });
      }
      add(relDrv, { x: ax, y: a0.y }, { x: ax, y: 1280 }, 12, 'In3.Cu');
      addVia(relDrv, { x: ax, y: 1280 });
      add(relDrv, { x: bx, y: b0.y }, { x: bx, y: 1280 }, 12, 'In3.Cu');
      addVia(relDrv, { x: bx, y: 1280 });
      add(relDrv, { x: ax, y: 1280 }, { x: bx, y: 1280 }, 12, 'B.Cu');
    }
  }
  if (relCoil && pw('RR', 2) && pw('K1', 1)) add(relCoil, pw('RR', 2), pw('K1', 1), 12, 'F.Cu');
  feedGnd(pw('K1', 2), 0, -55);
  feedGnd(pw('K1', 3), 55, 0);

  feedVcc(pw('RLNO', 1), 0, -55);
  if (relNoA && pw('RLNO', 2) && pw('DNO', 1)) add(relNoA, pw('RLNO', 2), pw('DNO', 1), 12, 'F.Cu');
  runSig(relNo, pw('DNO', 2), pw('K1', 4), 360, 'D', 'U');

  feedVcc(pw('RLNC', 1), 0, -55);
  if (relNcA && pw('RLNC', 2) && pw('DNC', 1)) add(relNcA, pw('RLNC', 2), pw('DNC', 1), 12, 'F.Cu');
  runSig(relNc, pw('DNC', 2), pw('K1', 5), 1920, 'D', 'D');

  {
    const buzPad = pw('U1', 13), rbzPad = pw('RBZ', 1);
    if (buz && buzPad && rbzPad) {
      addVia(buz, buzPad);
      usedCols.push(Math.round(buzPad.x));
      const a0 = { x: buzPad.x, y: buzPad.y };
      const b0 = fan(buz, rbzPad, 'L', escSlot + 2);
      const slot = escSlot++;
      const ax = pickCol(a0.x + 80, slot);
      const bx = pickCol(b0.x, slot + 13);
      add(buz, a0, { x: ax, y: a0.y }, 12, 'In2.Cu');
      addVia(buz, { x: ax, y: a0.y });
      if (Math.abs(bx - b0.x) > 0.5) {
        add(buz, b0, { x: bx, y: b0.y }, 12, 'In1.Cu');
        addVia(buz, { x: bx, y: b0.y });
      }
      add(buz, { x: ax, y: a0.y }, { x: ax, y: 2420 }, 12, 'In3.Cu');
      addVia(buz, { x: ax, y: 2420 });
      add(buz, { x: bx, y: b0.y }, { x: bx, y: 2420 }, 12, 'In3.Cu');
      addVia(buz, { x: bx, y: 2420 });
      add(buz, { x: ax, y: 2420 }, { x: bx, y: 2420 }, 12, 'B.Cu');
    }
  }
  if (buzDrv && pw('RBZ', 2) && pw('BZ1', 1)) add(buzDrv, pw('RBZ', 2), pw('BZ1', 1), 12, 'F.Cu');
  feedGnd(pw('BZ1', 2), 0, 55);

  // 先占住 LCD 电源竖列，再布信号，避免 In3 共列
  for (const padN of [1, 2, 5, 15, 16]) {
    const pad = pw('LCD1', padN);
    if (!pad) continue;
    if (padN === 2 || padN === 15) feedVcc(pad, 0, -90);
    else feedGnd(pad, 0, -90);
  }

  runSig(lcdRs, pw('U1', 18), pw('LCD1', 4), 960, 'D', 'D');
  runSig(lcdE, pw('U1', 19), pw('LCD1', 6), 1080, 'D', 'D');
  runSig(lcdD4, pw('U1', 25), pw('LCD1', 11), 700, 'R', 'D');
  runSig(lcdD5, pw('U1', 26), pw('LCD1', 12), 820, 'R', 'D');
  runSig(lcdD6, pw('U1', 27), pw('LCD1', 13), 1180, 'R', 'D');
  runSig(lcdD7, pw('U1', 28), pw('LCD1', 14), 1400, 'R', 'D');

  // VO：在 pad1 高度横连，GND 从 pad2 向下出，互不穿越本体
  if (lcdVo && pw('LCD1', 3) && pw('RVO', 1)) {
    const p = pw('LCD1', 3), r = pw('RVO', 1);
    add(lcdVo, p, { x: p.x, y: r.y }, 12, 'F.Cu');
    add(lcdVo, { x: p.x, y: r.y }, r, 12, 'F.Cu');
  }
  feedGnd(pw('RVO', 2), 0, 100);

  // OLED：SDA 上出 / SCL 下出，避免焊盘行水平互穿
  runSig(oledSda, pw('U1', 43), pw('OLED1', 3), 2580, 'U', 'U');
  runSig(oledScl, pw('U1', 42), pw('OLED1', 4), 2980, 'U', 'D');
  if (oledSda && pw('RODA', 2) && pw('OLED1', 3)) {
    const a = pw('RODA', 2), b = pw('OLED1', 3);
    add(oledSda, a, { x: b.x, y: a.y }, 12, 'F.Cu');
    add(oledSda, { x: b.x, y: a.y }, b, 12, 'F.Cu');
  }
  if (oledScl && pw('ROCL', 2) && pw('OLED1', 4)) {
    const a = pw('ROCL', 2), b = pw('OLED1', 4);
    add(oledScl, a, { x: b.x, y: a.y }, 12, 'F.Cu');
    add(oledScl, { x: b.x, y: a.y }, b, 12, 'F.Cu');
  }
  // 上拉 VCC 横向离开信号竖线
  feedVcc(pw('RODA', 1), -100, 0);
  feedVcc(pw('ROCL', 1), 100, 0);
  feedVcc(pw('OLED1', 1), -70, -120);
  feedGnd(pw('OLED1', 2), 70, 120);

  // J1：只走内层竖馈，禁止 B 层长竖线贯穿信号通道
  const jGnd = pw('J1', 1), jVcc = pw('J1', 2);
  if (jGnd) {
    const e = esc(gnd, jGnd, -50, 0, 14);
    add(gnd, e, { x: e.x, y: gndBusY }, 14, 'In4.Cu');
    addVia(gnd, { x: e.x, y: gndBusY });
  }
  if (jVcc) {
    const e = esc(vcc, jVcc, -50, 0, 14);
    add(vcc, e, { x: e.x, y: vccBusY }, 14, 'In3.Cu');
    addVia(vcc, { x: e.x, y: vccBusY });
  }

  return {
    trackCount: doc.tracks.length,
    netCount: 23,
    viaCount: doc.vias.length
  };
}

function handLayoutLabMcuStm32(doc) {
  doc.tracks = [];
  doc.vias = [];
  doc.zones = [];
  doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);

  const forceFp = (ref, defId, value) => {
    const fp = doc.footprints.find(f => f.refDes === ref);
    if (!fp) return;
    const neu = instantiate(defId, ref, value || fp.value || ref, fp.position, 0, fp.schematicCompId);
    fp.defId = neu.defId;
    fp.pads = neu.pads;
    for (const pad of fp.pads) { pad.netId = undefined; pad.netName = undefined; }
  };

  const COLS = [
    { val: 'STM32F103C8', fp: 'FP_QFP48', w: 1500,
      p: { oscIn: '5', oscOut: '6', nrst: '7', gnd: '23', vdd: '24', pa0: '10' } },
    { val: 'STM32F103RC', fp: 'FP_QFP64', w: 1700,
      p: { oscIn: '5', oscOut: '6', nrst: '7', gnd: '22', vdd: '23', pa0: '14' } },
    { val: 'STM32F407VG', fp: 'FP_QFP100', w: 2100,
      p: { oscIn: '12', oscOut: '13', nrst: '14', gnd: '18', vdd: '19', pa0: '23' } },
    { val: 'STM32L431CB', fp: 'FP_TSSOP20', w: 1200,
      p: { oscIn: '2', oscOut: '3', nrst: '4', gnd: '15', vdd: '16', pa0: '6' } },
    { val: 'STM32F030F4', fp: 'FP_TSSOP20', w: 1200,
      p: { oscIn: '2', oscOut: '3', nrst: '4', gnd: '15', vdd: '16', pa0: '6' } }
  ];

  for (let i = 0; i < COLS.length; i++) {
    forceFp(`U${i + 1}`, COLS[i].fp, COLS[i].val);
    forceFp(`Y${i + 1}`, 'FP_HC49', '8M');
  }

  const byRef = new Map(doc.footprints.map(f => [f.refDes, f]));
  const setPos = (ref, x, y, rot = 0) => {
    const fp = byRef.get(ref);
    if (!fp) return;
    fp.position = { x, y };
    fp.rotation = rot;
    fp.mirrored = false;
    fp.layer = 'F.Cu';
  };

  const netByName = (name) => doc.nets.find(n => (n.name || '').toUpperCase() === (name || '').toUpperCase());
  const gnd = doc.nets.find(n => isGndNet(n.name));
  const vcc = netByName('VCC');

  const bindPad = (ref, num, net) => {
    const fp = byRef.get(ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    if (pad && net) { pad.netId = net.id; pad.netName = net.name; }
  };

  const uy = 1600;
  const gndBusY = uy + 1300;
  const vccBusY = uy - 1300;
  const colXs = [];
  let ox = 700;
  for (let i = 0; i < COLS.length; i++) {
    colXs.push(ox);
    ox += COLS[i].w;
  }

  for (let i = 0; i < COLS.length; i++) {
    const ux = colXs[i];
    const { p } = COLS[i];
    const u = `U${i + 1}`;
    const half = halfExtents(COLS[i].fp).halfW;
    const leftX = ux - half - 40;
    const rightX = ux + half + 40;
    const xtal1 = netByName(`S${i}_XTAL1`);
    const xtal2 = netByName(`S${i}_XTAL2`);
    const nrst = netByName(`S${i}_NRST`);
    const ledR = netByName(`L${i}_R`);
    const ledA = netByName(`L${i}_LED`);

    setPos(u, ux, uy, 0);
    // 晶振水平放置：两脚不同 X，XTAL1/2 各走一柱
    setPos(`Y${i + 1}`, leftX - 280, uy - 160, 0);
    setPos(`CX${i}1`, leftX - 340, uy - 320, 180);
    setPos(`CX${i}2`, leftX - 220, uy - 320, 180);
    // 复位：R 更靠下，NRST 水平带远离 OSC
    setPos(`R${i + 1}`, leftX - 160, uy + 200, 180);
    setPos(`CD${i + 1}`, rightX + 40, uy - 80, 0);
    setPos(`RL${i + 1}`, leftX - 200, uy + 320, 0);
    setPos(`D${i + 1}`, leftX - 420, uy + 320, 0);

    bindPad(u, p.oscIn, xtal1);
    bindPad(u, p.oscOut, xtal2);
    bindPad(u, p.nrst, nrst);
    bindPad(u, p.gnd, gnd);
    bindPad(u, p.vdd, vcc);
    bindPad(u, p.pa0, ledR);

    const y = byRef.get(`Y${i + 1}`);
    if (y) {
      const p1 = y.pads.find(pp => pp.number === '1');
      const p2 = y.pads.find(pp => pp.number === '2');
      if (p1 && xtal1) { p1.netId = xtal1.id; p1.netName = xtal1.name; }
      if (p2 && xtal2) { p2.netId = xtal2.id; p2.netName = xtal2.name; }
    }
    bindPad(`CX${i}1`, 1, xtal1); bindPad(`CX${i}1`, 2, gnd);
    bindPad(`CX${i}2`, 1, xtal2); bindPad(`CX${i}2`, 2, gnd);
    bindPad(`R${i + 1}`, 1, nrst); bindPad(`R${i + 1}`, 2, vcc);
    bindPad(`CD${i + 1}`, 1, vcc); bindPad(`CD${i + 1}`, 2, gnd);
    bindPad(`RL${i + 1}`, 1, ledR); bindPad(`RL${i + 1}`, 2, ledA);
    bindPad(`D${i + 1}`, 1, ledA); bindPad(`D${i + 1}`, 2, gnd);
  }

  const hdrX = ox + 80;
  const hdr = instantiate('FP_PINHDR_4', 'J1', 'PWR', { x: hdrX, y: uy }, 0);
  if (hdr) {
    for (const [idx, n] of [[0, gnd], [1, vcc]]) {
      if (!n || !hdr.pads[idx]) continue;
      hdr.pads[idx].netId = n.id;
      hdr.pads[idx].netName = n.name;
    }
    doc.footprints.push(hdr);
    byRef.set('J1', hdr);
  }

  const pw = (ref, num) => {
    const fp = byRef.get(ref) || doc.footprints.find(f => f.refDes === ref);
    const pad = fp?.pads.find(pp => pp.number === String(num));
    return pad ? padWorld(fp, pad) : null;
  };
  const add = (net, a, b, w = 12, layer = 'F.Cu') => {
    if (!net || !a || !b || dist(a, b) < 0.5) return;
    doc.tracks.push({
      id: uid('trk'), layer,
      start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
      width: w, netId: net.id, netName: net.name
    });
  };
  const viaLayers = ['F.Cu', 'In1.Cu', 'In2.Cu', 'In3.Cu', 'In4.Cu', 'B.Cu'];
  const addVia = (net, pt) => {
    if (!net || !pt) return;
    for (const v of doc.vias) {
      if (v.netId === net.id && Math.abs(v.position.x - pt.x) < 0.5 &&
        Math.abs(v.position.y - pt.y) < 0.5) return;
    }
    doc.vias.push({
      id: uid('via'), position: { x: pt.x, y: pt.y },
      drill: 12, diameter: 24,
      netId: net.id, netName: net.name,
      layers: [...viaLayers], kind: 'through'
    });
  };
  const esc = (net, padPt, dx, dy, w = 12) => {
    const e = { x: padPt.x + dx, y: padPt.y + dy };
    add(net, padPt, e, w, 'F.Cu');
    addVia(net, e);
    return e;
  };
  const escOut = (net, padPt, ux, distN = 55, w = 12) => {
    const dx = padPt.x - ux;
    const dy = padPt.y - uy;
    let ex = 0, ey = 0;
    if (Math.abs(dx) >= Math.abs(dy)) ex = dx >= 0 ? distN : -distN;
    else ey = dy >= 0 ? distN : -distN;
    return esc(net, padPt, ex, ey, w);
  };

  const x0 = 60;
  const x1 = hdrX + 120;
  add(vcc, { x: x0, y: vccBusY }, { x: x1, y: vccBusY }, 22, 'In1.Cu');
  add(gnd, { x: x0, y: gndBusY }, { x: x1, y: gndBusY }, 22, 'In2.Cu');
  add(vcc, { x: x0, y: vccBusY + 50 }, { x: x1, y: vccBusY + 50 }, 16, 'B.Cu');
  add(gnd, { x: x0, y: gndBusY - 50 }, { x: x1, y: gndBusY - 50 }, 16, 'B.Cu');

  for (let i = 0; i < COLS.length; i++) {
    const ux = colXs[i];
    const { p } = COLS[i];
    const half = halfExtents(COLS[i].fp).halfW;
    const leftX = ux - half - 40;
    const rightX = ux + half + 40;
    const u = `U${i + 1}`;
    const xtal1 = netByName(`S${i}_XTAL1`);
    const xtal2 = netByName(`S${i}_XTAL2`);
    const nrst = netByName(`S${i}_NRST`);
    const ledR = netByName(`L${i}_R`);
    const ledA = netByName(`L${i}_LED`);

    const vccFeedX = rightX + 200;
    const gndFeedL = leftX - 200;
    const gndFeedR = rightX + 40;
    const vccFeedL = leftX - 400;

    const uGnd = pw(u, p.gnd), uVcc = pw(u, p.vdd);
    const uRst = pw(u, p.nrst), uX1 = pw(u, p.oscIn), uX2 = pw(u, p.oscOut);
    const uPa0 = pw(u, p.pa0);
    const yA = pw(`Y${i + 1}`, 1), yB = pw(`Y${i + 1}`, 2);
    const cx1a = pw(`CX${i}1`, 1), cx1b = pw(`CX${i}1`, 2);
    const cx2a = pw(`CX${i}2`, 1), cx2b = pw(`CX${i}2`, 2);
    const r1a = pw(`R${i + 1}`, 1), r1b = pw(`R${i + 1}`, 2);
    const cda = pw(`CD${i + 1}`, 1), cdb = pw(`CD${i + 1}`, 2);
    const rlA = pw(`RL${i + 1}`, 1), rlB = pw(`RL${i + 1}`, 2);
    const dA = pw(`D${i + 1}`, 1), dK = pw(`D${i + 1}`, 2);

    // 晶振：两脚 fanout 分走 B / In1，F 仅留焊盘短桩，避免水平穿叠
    if (xtal1 && uX1 && yA) {
      const e = esc(xtal1, uX1, -50, 0, 12);
      add(xtal1, e, { x: yA.x, y: e.y }, 12, 'B.Cu');
      addVia(xtal1, { x: yA.x, y: e.y });
      add(xtal1, { x: yA.x, y: e.y }, yA, 12, 'F.Cu');
    }
    if (xtal2 && uX2 && yB) {
      const e = esc(xtal2, uX2, -55, 0, 12);
      add(xtal2, e, { x: yB.x, y: e.y }, 12, 'In1.Cu');
      addVia(xtal2, { x: yB.x, y: e.y });
      add(xtal2, { x: yB.x, y: e.y }, yB, 12, 'F.Cu');
    }
    if (xtal1 && yA && cx1a) {
      add(xtal1, yA, { x: yA.x, y: cx1a.y }, 12, 'F.Cu');
      add(xtal1, { x: yA.x, y: cx1a.y }, cx1a, 12, 'F.Cu');
    }
    if (xtal2 && yB && cx2a) {
      add(xtal2, yB, { x: yB.x, y: cx2a.y }, 12, 'F.Cu');
      add(xtal2, { x: yB.x, y: cx2a.y }, cx2a, 12, 'F.Cu');
    }

    for (const pad of [cx1b, cx2b]) {
      if (!pad) continue;
      const e = esc(gnd, pad, 0, 55, 12);
      add(gnd, e, { x: gndFeedL, y: e.y }, 14, 'In4.Cu');
      add(gnd, { x: gndFeedL, y: e.y }, { x: gndFeedL, y: gndBusY }, 14, 'In4.Cu');
      addVia(gnd, { x: gndFeedL, y: gndBusY });
    }

    if (uGnd) {
      // 底边/侧边焊盘：GND 与 VCC 反方向逃逸，避免同带重叠
      const e = esc(gnd, uGnd, -70, 0, 14);
      add(gnd, e, { x: gndFeedL, y: e.y }, 14, 'In4.Cu');
      add(gnd, { x: gndFeedL, y: e.y }, { x: gndFeedL, y: gndBusY }, 14, 'In4.Cu');
      addVia(gnd, { x: gndFeedL, y: gndBusY });
    }
    if (uVcc) {
      const e = esc(vcc, uVcc, 70, 0, 14);
      add(vcc, e, { x: vccFeedX, y: e.y }, 14, 'In3.Cu');
      add(vcc, { x: vccFeedX, y: e.y }, { x: vccFeedX, y: vccBusY }, 14, 'In3.Cu');
      addVia(vcc, { x: vccFeedX, y: vccBusY });
    }

    if (cdb) {
      const e = esc(gnd, cdb, 60, 0, 12);
      add(gnd, e, { x: gndFeedR, y: e.y }, 14, 'In4.Cu');
      add(gnd, { x: gndFeedR, y: e.y }, { x: gndFeedR, y: gndBusY }, 14, 'In4.Cu');
      addVia(gnd, { x: gndFeedR, y: gndBusY });
      add(gnd, { x: gndFeedR, y: gndBusY }, { x: gndFeedL, y: gndBusY }, 14, 'In2.Cu');
    }

    if (dK) {
      const e = esc(gnd, dK, -55, 0, 12);
      add(gnd, e, { x: e.x, y: gndBusY }, 14, 'In4.Cu');
      addVia(gnd, { x: e.x, y: gndBusY });
      add(gnd, { x: e.x, y: gndBusY }, { x: gndFeedL, y: gndBusY }, 14, 'In2.Cu');
    }

    // 复位：在 MCU 焊盘列外侧竖走，避免与 PA0 同 X 对穿
    if (nrst && r1a && uRst) {
      const colX = Math.min(r1a.x, uRst.x) - 50;
      add(nrst, r1a, { x: colX, y: r1a.y }, 12, 'F.Cu');
      add(nrst, { x: colX, y: r1a.y }, { x: colX, y: uRst.y }, 12, 'F.Cu');
      add(nrst, { x: colX, y: uRst.y }, uRst, 12, 'F.Cu');
    }
    if (r1b) {
      const e = esc(vcc, r1b, -60, 0, 12);
      add(vcc, e, { x: vccFeedL, y: e.y }, 14, 'In3.Cu');
      add(vcc, { x: vccFeedL, y: e.y }, { x: vccFeedL, y: vccBusY }, 14, 'In3.Cu');
      addVia(vcc, { x: vccFeedL, y: vccBusY });
      add(vcc, { x: vccFeedL, y: vccBusY }, { x: vccFeedX, y: vccBusY }, 14, 'In1.Cu');
    }

    if (cda) {
      const e = esc(vcc, cda, 55, 0, 12);
      add(vcc, e, { x: vccFeedX, y: e.y }, 14, 'In3.Cu');
      add(vcc, { x: vccFeedX, y: e.y }, { x: vccFeedX, y: vccBusY }, 14, 'In3.Cu');
      addVia(vcc, { x: vccFeedX, y: vccBusY });
    }

    if (ledR && uPa0 && rlA) {
      const e = esc(ledR, uPa0, -60, 0, 12);
      const jx = rlA.x - 80;
      add(ledR, e, { x: e.x, y: rlA.y + 90 }, 12, 'B.Cu');
      add(ledR, { x: e.x, y: rlA.y + 90 }, { x: jx, y: rlA.y + 90 }, 12, 'B.Cu');
      addVia(ledR, { x: jx, y: rlA.y + 90 });
      add(ledR, { x: jx, y: rlA.y + 90 }, { x: jx, y: rlA.y }, 12, 'F.Cu');
      add(ledR, { x: jx, y: rlA.y }, rlA, 12, 'F.Cu');
    }
    if (ledA && rlB && dA) {
      const e1 = esc(ledA, rlB, 0, 70, 12);
      const e2 = esc(ledA, dA, 0, 70, 12);
      add(ledA, e1, e2, 12, 'B.Cu');
    }

    addVia(vcc, { x: vccFeedX, y: vccBusY });
    addVia(gnd, { x: gndFeedL, y: gndBusY });
  }

  const jGnd = pw('J1', 1), jVcc = pw('J1', 2);
  if (jGnd) {
    const e = esc(gnd, jGnd, -50, 0, 14);
    add(gnd, e, { x: e.x, y: gndBusY - 50 }, 14, 'B.Cu');
    addVia(gnd, { x: e.x, y: gndBusY - 50 });
    add(gnd, { x: e.x, y: gndBusY - 50 }, { x: e.x, y: gndBusY }, 14, 'In4.Cu');
    addVia(gnd, { x: e.x, y: gndBusY });
    add(gnd, { x: e.x, y: gndBusY }, { x: x1, y: gndBusY }, 14, 'In2.Cu');
  }
  if (jVcc) {
    const e = esc(vcc, jVcc, -120, 0, 14);
    add(vcc, e, { x: e.x, y: vccBusY + 50 }, 14, 'B.Cu');
    addVia(vcc, { x: e.x, y: vccBusY + 50 });
    add(vcc, { x: e.x, y: vccBusY + 50 }, { x: e.x, y: vccBusY }, 14, 'In3.Cu');
    addVia(vcc, { x: e.x, y: vccBusY });
    add(vcc, { x: e.x, y: vccBusY }, { x: x1, y: vccBusY }, 14, 'In1.Cu');
  }

  return {
    trackCount: doc.tracks.length,
    netCount: 27,
    viaCount: doc.vias.length
  };
}

function handLayoutLabMcu8051(doc) {
  doc.tracks = [];
  doc.vias = [];
  doc.zones = [];
  doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);

  const forceFp = (ref, defId, value) => {
    const fp = doc.footprints.find(f => f.refDes === ref);
    if (!fp) return;
    const neu = instantiate(defId, ref, value || fp.value || ref, fp.position, 0, fp.schematicCompId);
    fp.defId = neu.defId;
    fp.pads = neu.pads;
    for (const pad of fp.pads) { pad.netId = undefined; pad.netName = undefined; }
  };

  const mcuVals = ['AT89C51', 'AT89C52', 'STC89C52', 'STC15W408AS'];
  for (let i = 0; i < 4; i++) {
    forceFp(`U${i + 1}`, 'FP_DIP40', mcuVals[i]);
    forceFp(`Y${i + 1}`, 'FP_HC49', i === 3 ? '8M' : '11.0592M');
  }

  const byRef = new Map(doc.footprints.map(f => [f.refDes, f]));
  const setPos = (ref, x, y, rot = 0) => {
    const fp = byRef.get(ref);
    if (!fp) return;
    fp.position = { x, y };
    fp.rotation = rot;
    fp.mirrored = false;
    fp.layer = 'F.Cu';
  };

  const netByName = (name) => doc.nets.find(n => (n.name || '').toUpperCase() === (name || '').toUpperCase());
  const gnd = doc.nets.find(n => isGndNet(n.name));
  const vcc = netByName('VCC');

  const bindPad = (ref, num, net) => {
    const fp = byRef.get(ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    if (pad && net) { pad.netId = net.id; pad.netName = net.name; }
  };

  // 列距要够：CD 与下一列 RL 不能挤在同一 Y
  const colW = 1350;
  const uy = 1300;
  const pinY = (n) => uy - 950 + (n - 1) * 100;
  const gndBusY = uy + 1150;
  const vccBusY = uy - 1150;

  for (let i = 0; i < 4; i++) {
    const ux = 560 + i * colW;
    const leftX = ux - 300;
    const rightX = ux + 300;
    const u = `U${i + 1}`;
    const xtal1 = netByName(`M${i}_XTAL1`);
    const xtal2 = netByName(`M${i}_XTAL2`);
    const nrst = netByName(`M${i}_NRST`);
    const ledA = netByName(`L${i}_A`);
    const ledK = netByName(`L${i}_K`);

    setPos(u, ux, uy, 0);
    setPos(`RL${i + 1}`, leftX - 280, pinY(1), 0);
    setPos(`D${i + 1}`, leftX - 140, pinY(1), 0);
    setPos(`Y${i + 1}`, leftX - 220, (pinY(18) + pinY(19)) / 2, 90);
    setPos(`CX${i}1`, leftX - 380, pinY(19), 180);
    setPos(`CX${i}2`, leftX - 380, pinY(18), 180);
    setPos(`R${i + 1}`, leftX - 180, pinY(9), 0);
    // 去耦略偏下，避开 pin40 与邻列 RL 的同一水平带
    setPos(`CD${i + 1}`, rightX + 160, pinY(3), 0);

    bindPad(u, 1, ledK);
    bindPad(u, 9, nrst);
    bindPad(u, 18, xtal2);
    bindPad(u, 19, xtal1);
    bindPad(u, 20, gnd);
    bindPad(u, 31, vcc);
    bindPad(u, 40, vcc);

    const y = byRef.get(`Y${i + 1}`);
    if (y) {
      const p1 = y.pads.find(p => p.number === '1');
      const p2 = y.pads.find(p => p.number === '2');
      if (p1 && xtal2) { p1.netId = xtal2.id; p1.netName = xtal2.name; }
      if (p2 && xtal1) { p2.netId = xtal1.id; p2.netName = xtal1.name; }
    }
    bindPad(`CX${i}1`, 1, xtal1); bindPad(`CX${i}1`, 2, gnd);
    bindPad(`CX${i}2`, 1, xtal2); bindPad(`CX${i}2`, 2, gnd);
    bindPad(`R${i + 1}`, 1, nrst); bindPad(`R${i + 1}`, 2, vcc);
    bindPad(`CD${i + 1}`, 1, vcc); bindPad(`CD${i + 1}`, 2, gnd);
    bindPad(`RL${i + 1}`, 1, vcc); bindPad(`RL${i + 1}`, 2, ledA);
    bindPad(`D${i + 1}`, 1, ledA); bindPad(`D${i + 1}`, 2, ledK);
  }

  const hdr = instantiate('FP_PINHDR_4', 'J1', 'PWR', { x: 280 + 4 * colW, y: uy }, 0);
  if (hdr) {
    for (const [idx, n] of [[0, gnd], [1, vcc]]) {
      if (!n || !hdr.pads[idx]) continue;
      hdr.pads[idx].netId = n.id;
      hdr.pads[idx].netName = n.name;
    }
    doc.footprints.push(hdr);
    byRef.set('J1', hdr);
  }

  const pw = (ref, num) => {
    const fp = byRef.get(ref) || doc.footprints.find(f => f.refDes === ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    return pad ? padWorld(fp, pad) : null;
  };
  const add = (net, a, b, w = 12, layer = 'F.Cu') => {
    if (!net || !a || !b || dist(a, b) < 0.5) return;
    doc.tracks.push({
      id: uid('trk'), layer,
      start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
      width: w, netId: net.id, netName: net.name
    });
  };
  const viaLayers = ['F.Cu', 'In1.Cu', 'In2.Cu', 'In3.Cu', 'In4.Cu', 'B.Cu'];
  const addVia = (net, p) => {
    if (!net || !p) return;
    for (const v of doc.vias) {
      if (v.netId === net.id && Math.abs(v.position.x - p.x) < 0.5 &&
        Math.abs(v.position.y - p.y) < 0.5) return;
    }
    doc.vias.push({
      id: uid('via'), position: { x: p.x, y: p.y },
      drill: 12, diameter: 24,
      netId: net.id, netName: net.name,
      layers: [...viaLayers], kind: 'through'
    });
  };
  /** 焊盘短桩到过孔，返回过孔坐标 */
  const esc = (net, padPt, dx, dy, w = 12) => {
    const e = { x: padPt.x + dx, y: padPt.y + dy };
    add(net, padPt, e, w, 'F.Cu');
    addVia(net, e);
    return e;
  };

  const x0 = 60;
  const x1 = 320 + 4 * colW;

  // —— 全板电源水平干线（分属 In1 / In2，互不交叉）——
  add(vcc, { x: x0, y: vccBusY }, { x: x1, y: vccBusY }, 22, 'In1.Cu');
  add(gnd, { x: x0, y: gndBusY }, { x: x1, y: gndBusY }, 22, 'In2.Cu');
  // B 层平行复走，保证 B 也有铜线
  add(vcc, { x: x0, y: vccBusY + 40 }, { x: x1, y: vccBusY + 40 }, 16, 'B.Cu');
  add(gnd, { x: x0, y: gndBusY - 40 }, { x: x1, y: gndBusY - 40 }, 16, 'B.Cu');

  for (let i = 0; i < 4; i++) {
    const ux = 560 + i * colW;
    const leftX = ux - 300;
    const rightX = ux + 300;
    const u = `U${i + 1}`;
    const xtal1 = netByName(`M${i}_XTAL1`);
    const xtal2 = netByName(`M${i}_XTAL2`);
    const nrst = netByName(`M${i}_NRST`);
    const ledA = netByName(`L${i}_A`);
    const ledK = netByName(`L${i}_K`);

    // 每列专用竖馈：VCC→In3，GND→In4（与水平干线分层）
    const vccFeedX = rightX + 180;
    const gndFeedL = leftX - 200;
    const gndFeedR = ux + 200;
    const vccFeedL = leftX - 460;

    const uGnd = pw(u, 20), uVcc = pw(u, 40), uEa = pw(u, 31);
    const uRst = pw(u, 9), uX1 = pw(u, 19), uX2 = pw(u, 18), uP10 = pw(u, 1);
    const yA = pw(`Y${i + 1}`, 1), yB = pw(`Y${i + 1}`, 2);
    const cx1a = pw(`CX${i}1`, 1), cx1b = pw(`CX${i}1`, 2);
    const cx2a = pw(`CX${i}2`, 1), cx2b = pw(`CX${i}2`, 2);
    const r1a = pw(`R${i + 1}`, 1), r1b = pw(`R${i + 1}`, 2);
    const cda = pw(`CD${i + 1}`, 1), cdb = pw(`CD${i + 1}`, 2);
    const rlA = pw(`RL${i + 1}`, 1), rlB = pw(`RL${i + 1}`, 2);
    const dA = pw(`D${i + 1}`, 1), dK = pw(`D${i + 1}`, 2);

    // F：晶振本地
    if (xtal1 && uX1 && yB) {
      add(xtal1, uX1, { x: yB.x, y: uX1.y }, 12, 'F.Cu');
      add(xtal1, { x: yB.x, y: uX1.y }, yB, 12, 'F.Cu');
    }
    if (xtal2 && uX2 && yA) {
      add(xtal2, uX2, { x: yA.x, y: uX2.y }, 12, 'F.Cu');
      add(xtal2, { x: yA.x, y: uX2.y }, yA, 12, 'F.Cu');
    }
    if (xtal1 && yB && cx1a) {
      add(xtal1, yB, { x: cx1a.x, y: yB.y }, 12, 'F.Cu');
      add(xtal1, { x: cx1a.x, y: yB.y }, cx1a, 12, 'F.Cu');
    }
    if (xtal2 && yA && cx2a) {
      add(xtal2, yA, { x: cx2a.x, y: yA.y }, 12, 'F.Cu');
      add(xtal2, { x: cx2a.x, y: yA.y }, cx2a, 12, 'F.Cu');
    }

    // CX GND → In4 竖馈 → In2 底轨
    for (const pad of [cx1b, cx2b]) {
      if (!pad) continue;
      const e = esc(gnd, pad, -50, 0, 12);
      add(gnd, e, { x: e.x, y: gndBusY }, 14, 'In4.Cu');
      addVia(gnd, { x: e.x, y: gndBusY });
      add(gnd, { x: e.x, y: gndBusY }, { x: gndFeedL, y: gndBusY }, 14, 'In2.Cu');
    }

    // MCU GND
    if (uGnd) {
      const e = esc(gnd, uGnd, -50, 0, 14);
      add(gnd, e, { x: gndFeedL, y: e.y }, 14, 'In4.Cu');
      add(gnd, { x: gndFeedL, y: e.y }, { x: gndFeedL, y: gndBusY }, 14, 'In4.Cu');
      addVia(gnd, { x: gndFeedL, y: gndBusY });
    }

    // CD GND（先右再下，远离 VCC 焊盘）
    if (cdb) {
      const e = esc(gnd, cdb, 60, 0, 12);
      add(gnd, e, { x: gndFeedR, y: e.y }, 14, 'In4.Cu');
      add(gnd, { x: gndFeedR, y: e.y }, { x: gndFeedR, y: gndBusY }, 14, 'In4.Cu');
      addVia(gnd, { x: gndFeedR, y: gndBusY });
      add(gnd, { x: gndFeedR, y: gndBusY }, { x: gndFeedL, y: gndBusY }, 14, 'In2.Cu');
    }

    // 复位 F 短连；R 上拉 → VCC 经 In3 上顶轨
    if (nrst && r1b && uRst) add(nrst, r1b, uRst, 12, 'F.Cu');
    if (r1a) {
      const e = esc(vcc, r1a, -50, 0, 12);
      add(vcc, e, { x: vccFeedL, y: e.y }, 14, 'In3.Cu');
      add(vcc, { x: vccFeedL, y: e.y }, { x: vccFeedL, y: vccBusY }, 14, 'In3.Cu');
      addVia(vcc, { x: vccFeedL, y: vccBusY });
      add(vcc, { x: vccFeedL, y: vccBusY }, { x: vccFeedX, y: vccBusY }, 14, 'In1.Cu');
    }

    // CD / MCU VCC → In3 竖馈 → In1 顶轨
    if (cda) {
      const e = esc(vcc, cda, 0, -50, 12);
      add(vcc, e, { x: vccFeedX, y: e.y }, 14, 'In3.Cu');
      add(vcc, { x: vccFeedX, y: e.y }, { x: vccFeedX, y: vccBusY }, 14, 'In3.Cu');
      addVia(vcc, { x: vccFeedX, y: vccBusY });
    }
    if (uVcc) {
      const e = esc(vcc, uVcc, 50, 0, 14);
      add(vcc, e, { x: vccFeedX, y: e.y }, 14, 'In3.Cu');
      add(vcc, { x: vccFeedX, y: e.y }, { x: vccFeedX, y: vccBusY }, 14, 'In3.Cu');
      addVia(vcc, { x: vccFeedX, y: vccBusY });
    }
    if (uVcc && uEa) {
      add(vcc, uVcc, { x: uVcc.x + 55, y: uVcc.y }, 12, 'F.Cu');
      add(vcc, { x: uVcc.x + 55, y: uVcc.y }, { x: uEa.x + 55, y: uEa.y }, 12, 'F.Cu');
      add(vcc, { x: uEa.x + 55, y: uEa.y }, uEa, 12, 'F.Cu');
    }

    // LED：F 串联；限流电阻 VCC 上 In3
    if (rlA) {
      const e = esc(vcc, rlA, -50, 0, 12);
      add(vcc, e, { x: vccFeedL, y: e.y }, 14, 'In3.Cu');
      add(vcc, { x: vccFeedL, y: e.y }, { x: vccFeedL, y: vccBusY }, 14, 'In3.Cu');
      addVia(vcc, { x: vccFeedL, y: vccBusY });
    }
    if (ledA && rlB && dA) add(ledA, rlB, dA, 12, 'F.Cu');
    if (ledK && dK && uP10) add(ledK, dK, uP10, 12, 'F.Cu');

    // 列间：用 In1/In2 把本列馈点接到全板干线（已在 via 处）
    addVia(vcc, { x: vccFeedX, y: vccBusY });
    addVia(gnd, { x: gndFeedL, y: gndBusY });
  }

  // 排针：GND/VCC 用不同 X 的 B 竖线，避免同柱重叠
  const jGnd = pw('J1', 1), jVcc = pw('J1', 2);
  if (jGnd) {
    const e = esc(gnd, jGnd, -50, 0, 14);
    add(gnd, e, { x: e.x, y: gndBusY - 40 }, 14, 'B.Cu');
    addVia(gnd, { x: e.x, y: gndBusY - 40 });
    add(gnd, { x: e.x, y: gndBusY - 40 }, { x: e.x, y: gndBusY }, 14, 'In4.Cu');
    addVia(gnd, { x: e.x, y: gndBusY });
    add(gnd, { x: e.x, y: gndBusY }, { x: x1, y: gndBusY }, 14, 'In2.Cu');
  }
  if (jVcc) {
    const e = esc(vcc, jVcc, -120, 0, 14);
    add(vcc, e, { x: e.x, y: vccBusY + 40 }, 14, 'B.Cu');
    addVia(vcc, { x: e.x, y: vccBusY + 40 });
    add(vcc, { x: e.x, y: vccBusY + 40 }, { x: e.x, y: vccBusY }, 14, 'In3.Cu');
    addVia(vcc, { x: e.x, y: vccBusY });
    add(vcc, { x: e.x, y: vccBusY }, { x: x1, y: vccBusY }, 14, 'In1.Cu');
  }

  return {
    trackCount: doc.tracks.length,
    netCount: 22,
    viaCount: doc.vias.length
  };
}

function handLayoutLabMemory(doc) {
  doc.tracks = [];
  doc.vias = [];
  doc.zones = [];
  doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);

  const forceFp = (ref, defId, value) => {
    const fp = doc.footprints.find(f => f.refDes === ref);
    if (!fp || fp.defId === defId) return;
    const neu = instantiate(defId, ref, value || fp.value || ref, fp.position, 0, fp.schematicCompId);
    fp.defId = neu.defId;
    fp.pads = neu.pads;
    for (const pad of fp.pads) { pad.netId = undefined; pad.netName = undefined; }
  };
  forceFp('U1', 'FP_QFP48', 'STM32F103RC');
  forceFp('M1', 'FP_SOIC8', '24C02');
  forceFp('M2', 'FP_SOIC8', 'W25Q64');
  forceFp('M3', 'FP_DIP28', '2764');
  forceFp('M4', 'FP_DIP28', '62256');
  forceFp('Y1', 'FP_HC49', '8M');

  const byRef = new Map(doc.footprints.map(f => [f.refDes, f]));
  const setPos = (ref, x, y, rot = 0) => {
    const fp = byRef.get(ref);
    if (!fp) return;
    fp.position = { x, y };
    fp.rotation = rot;
    fp.mirrored = false;
    fp.layer = 'F.Cu';
  };
  const netByName = (name) => doc.nets.find(n => (n.name || '').toUpperCase() === name);
  const gnd = doc.nets.find(n => isGndNet(n.name));
  const vcc = netByName('VCC');
  const xtal1 = netByName('XTAL1');
  const xtal2 = netByName('XTAL2');
  const nrst = netByName('NRST');
  const sda = netByName('I2C_SDA');
  const scl = netByName('I2C_SCL');
  const spiCs = netByName('SPI_CS');
  const spiMiso = netByName('SPI_MISO');
  const spiMosi = netByName('SPI_MOSI');
  const spiSck = netByName('SPI_SCK');
  const memCe = netByName('MEM_CE');
  const memOe = netByName('MEM_OE');
  const sramCe = netByName('SRAM_CE');
  const sramOe = netByName('SRAM_OE');
  const sramWe = netByName('SRAM_WE');
  const memA = [], memD = [];
  for (let i = 0; i < 8; i++) {
    memA.push(netByName(`MEM_A${i}`));
    memD.push(netByName(`MEM_D${i}`));
  }

  const bindPad = (ref, num, net) => {
    const fp = byRef.get(ref) || doc.footprints.find(f => f.refDes === ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    if (!pad || !net) return;
    pad.netId = net.id;
    pad.netName = net.name;
  };

  for (const n of ['8', '23', '35', '47']) bindPad('U1', n, gnd);
  for (const n of ['9', '24', '36', '48']) bindPad('U1', n, vcc);
  bindPad('U1', '5', xtal1); bindPad('U1', '6', xtal2); bindPad('U1', '7', nrst);
  bindPad('U1', '14', spiCs); bindPad('U1', '15', spiSck);
  bindPad('U1', '16', spiMiso); bindPad('U1', '17', spiMosi);
  bindPad('U1', '42', scl); bindPad('U1', '43', sda);
  bindPad('U1', '45', memCe); bindPad('U1', '46', memOe);
  bindPad('U1', '21', sramCe); bindPad('U1', '22', sramOe); bindPad('U1', '25', sramWe);
  const mcuAPads = ['10', '11', '12', '13', '18', '19', '20', '39'];
  const mcuDPads = ['29', '30', '31', '32', '33', '34', '37', '38'];
  for (let i = 0; i < 8; i++) {
    bindPad('U1', mcuAPads[i], memA[i]);
    bindPad('U1', mcuDPads[i], memD[i]);
  }
  bindPad('M1', '1', gnd); bindPad('M1', '2', gnd); bindPad('M1', '3', gnd);
  bindPad('M1', '4', gnd); bindPad('M1', '5', sda); bindPad('M1', '6', scl);
  bindPad('M1', '7', gnd); bindPad('M1', '8', vcc);
  bindPad('M2', '1', spiCs); bindPad('M2', '2', spiMiso); bindPad('M2', '3', vcc);
  bindPad('M2', '4', gnd); bindPad('M2', '5', spiMosi); bindPad('M2', '6', spiSck);
  bindPad('M2', '7', vcc); bindPad('M2', '8', vcc);
  bindPad('M3', '1', vcc); bindPad('M4', '1', gnd);
  bindPad('M3', '18', gnd); bindPad('M3', '19', memCe); bindPad('M3', '20', memOe); bindPad('M3', '26', vcc);
  bindPad('M4', '18', gnd); bindPad('M4', '19', sramCe); bindPad('M4', '20', sramOe);
  bindPad('M4', '27', sramWe); bindPad('M4', '28', vcc);
  bindPad('Y1', '1', xtal1); bindPad('Y1', '2', xtal2);
  bindPad('CX1', '1', xtal1); bindPad('CX1', '2', gnd);
  bindPad('CX2', '1', xtal2); bindPad('CX2', '2', gnd);
  bindPad('R1', '1', nrst); bindPad('R1', '2', vcc);
  bindPad('C1', '1', vcc); bindPad('C1', '2', gnd);
  bindPad('RSDA', '1', vcc); bindPad('RSDA', '2', sda);
  bindPad('RSCL', '1', vcc); bindPad('RSCL', '2', scl);

  setPos('U1', 900, 1500, 0);
  setPos('Y1', 420, 2100, 0);
  setPos('CX1', 260, 2240, 0);
  setPos('CX2', 580, 2240, 0);
  setPos('R1', 220, 700, 0);
  setPos('C1', 220, 1500, 0);
  setPos('RSDA', 1500, 220, 0);
  setPos('RSCL', 1500, 520, 0);
  setPos('M1', 1900, 380, 0);
  setPos('M2', 2400, 380, 0);
  // DIP 东移，保证地址 farm 列始终在左排焊盘西侧（朝干线）
  setPos('M3', 4200, 1500, 0);
  setPos('M4', 5600, 1500, 0);

  const hdr = instantiate('FP_PINHDR_8', 'J1', 'LA', { x: 6400, y: 1500 }, 0);
  const hdrNets = [gnd, scl, sda, spiSck, spiCs, spiMosi, memCe, sramCe];
  for (let i = 0; i < hdr.pads.length; i++) {
    const n = hdrNets[i];
    if (!n) continue;
    hdr.pads[i].netId = n.id;
    hdr.pads[i].netName = n.name;
  }
  doc.footprints.push(hdr);
  byRef.set('J1', hdr);

  const pw = (ref, num) => {
    const fp = byRef.get(ref) || doc.footprints.find(f => f.refDes === ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    return pad ? padWorld(fp, pad) : null;
  };

  // 教学脚位：MCU 焊盘 Y 序 ↔ DIP 焊盘 Y 序一一对应，两侧 farm 同序
  const sortByPadY = (ref, padNums) => [...padNums].sort((a, b) => {
    const pa = pw(ref, a), pb = pw(ref, b);
    if (!pa || !pb) return 0;
    const dy = pa.y - pb.y;
    return Math.abs(dy) > 0.5 ? dy : pa.x - pb.x;
  });
  const clearMemPads = (ref, keep) => {
    const fp = byRef.get(ref);
    if (!fp) return;
    for (const pad of fp.pads) {
      if (keep.has(pad.number)) continue;
      pad.netId = undefined;
      pad.netName = undefined;
    }
  };
  clearMemPads('M3', new Set(['1', '18', '19', '20', '26']));
  clearMemPads('M4', new Set(['1', '18', '19', '20', '27', '28']));
  const m3APins = [], m3DPins = [], m4APins = [], m4DPins = [];
  {
    const aOrder = sortByPadY('U1', mcuAPads);
    aOrder.forEach((padNum, rank) => {
      const i = mcuAPads.indexOf(padNum);
      const pin = String(2 + rank);
      bindPad('M3', pin, memA[i]);
      bindPad('M4', pin, memA[i]);
      m3APins[i] = pin;
      m4APins[i] = pin;
    });
    // 数据全走右排（避开 18-20 控制脚），farm 一律在焊盘西侧朝干线
    const dOrder = sortByPadY('U1', mcuDPads);
    const dipDSorted = sortByPadY('M3', ['15', '16', '17', '21', '22', '23', '24', '25']);
    dOrder.forEach((padNum, rank) => {
      const i = mcuDPads.indexOf(padNum);
      const pin = dipDSorted[rank];
      bindPad('M3', pin, memD[i]);
      bindPad('M4', pin, memD[i]);
      m3DPins[i] = pin;
      m4DPins[i] = pin;
    });
  }
  const add = (net, a, b, w = 12, layer = 'F.Cu') => {
    if (!net || !a || !b || dist(a, b) < 0.5) return;
    doc.tracks.push({
      id: uid('trk'), layer,
      start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
      width: w, netId: net.id, netName: net.name
    });
  };
  const viaLayers = ['F.Cu', 'In1.Cu', 'In2.Cu', 'In3.Cu', 'In4.Cu', 'B.Cu'];
  const addVia = (net, p) => {
    if (!net || !p) return;
    for (const v of doc.vias) {
      if (v.netId === net.id && Math.abs(v.position.x - p.x) < 0.5 &&
        Math.abs(v.position.y - p.y) < 0.5) return;
    }
    doc.vias.push({
      id: uid('via'), position: { x: p.x, y: p.y },
      drill: 12, diameter: 24,
      netId: net.id, netName: net.name,
      layers: [...viaLayers], kind: 'through'
    });
  };
  const L = (net, pts, w = 12, layer = 'F.Cu') => {
    for (let i = 0; i < pts.length - 1; i++) add(net, pts[i], pts[i + 1], w, layer);
  };
  const pwrStub = (net, padPt) => { if (net && padPt) addVia(net, padPt); };

  // 焊盘内过孔 + 纯曼哈顿 farm 总线
  const padToTrunk = (net, pad, layer, runY, farmX, trunkX, w = 8) => {
    if (!net || !pad) return;
    addVia(net, pad);
    L(net, [
      pad,
      { x: farmX, y: pad.y },
      { x: farmX, y: runY },
      { x: trunkX, y: runY }
    ], w, layer);
  };

  const spurFromJoin = (net, pad, spurLayer, runY, farmX, joinX, w = 8) => {
    if (!net || !pad) return;
    const join = { x: joinX, y: runY };
    addVia(net, join);
    addVia(net, pad);
    L(net, [
      pad,
      { x: farmX, y: pad.y },
      { x: farmX, y: runY },
      join
    ], w, spurLayer);
  };

  /**
   * 按参考焊盘 Y 分配 runY / farm，避免竖线切横线。
   * south=true（南廊，竖线向下）：北焊盘→内列+近廊；南焊盘→外列+远廊
   * south=false（北廊，竖线向上）：南焊盘→内列+近廊；北焊盘→外列+远廊
   */
  const assignFarmBus = (entries, baseRy, south, tL, tR, P) => {
    const sorted = [...entries].filter(e => e.refPad).sort((a, b) => {
      const dy = a.refPad.y - b.refPad.y;
      return Math.abs(dy) > 0.5 ? dy : a.refPad.x - b.refPad.x;
    });
    const n = sorted.length;
    for (let rank = 0; rank < n; rank++) {
      const e = sorted[rank];
      if (south) {
        e.ry = baseRy + rank * P;
        e.fW = tL - (rank + 1) * P;
        e.fE = tR + (rank + 1) * P;
      } else {
        e.ry = baseRy + rank * P;
        e.fW = tL - (n - rank) * P;
        e.fE = tR + (n - rank) * P;
      }
    }
    return sorted;
  };

  for (const n of ['9', '24', '36', '48']) pwrStub(vcc, pw('U1', n));
  for (const n of ['8', '23', '35', '47']) pwrStub(gnd, pw('U1', n));
  for (const [ref, num] of [
    ['M1', 8], ['M2', 8], ['M2', 3], ['M2', 7], ['M3', 1], ['M3', 26], ['M4', 28],
    ['C1', 1], ['R1', 2], ['RSDA', 1], ['RSCL', 1]
  ]) pwrStub(vcc, pw(ref, num));
  for (const [ref, num] of [
    ['M1', 4], ['M1', 1], ['M1', 2], ['M1', 3], ['M1', 7],
    ['M2', 4], ['M3', 18], ['M4', 18], ['M4', 1],
    ['C1', 2], ['CX1', 2], ['CX2', 2]
  ]) pwrStub(gnd, pw(ref, num));

  {
    const a = pw('U1', 5), b = pw('Y1', 1), c = pw('CX1', 1);
    if (xtal1 && a && b) {
      const mid = { x: Math.min(a.x, b.x) - 50, y: a.y };
      L(xtal1, [a, mid, { x: mid.x, y: b.y }, b], 12, 'F.Cu');
    }
    if (xtal1 && b && c) add(xtal1, b, c, 12, 'F.Cu');
  }
  {
    const a = pw('U1', 6), b = pw('Y1', 2), c = pw('CX2', 1);
    if (xtal2 && a && b) {
      const mid = { x: Math.min(a.x, b.x) - 100, y: a.y };
      L(xtal2, [a, mid, { x: mid.x, y: b.y }, b], 12, 'F.Cu');
    }
    if (xtal2 && b && c) add(xtal2, b, c, 12, 'F.Cu');
  }
  {
    const a = pw('U1', 7), b = pw('R1', 1);
    if (nrst && a && b) {
      L(nrst, [a, { x: a.x + 50, y: a.y }, { x: a.x + 50, y: b.y }, b], 12, 'F.Cu');
    }
  }

  const P = 80;
  const tL = 2000;
  const tR = 2900;
  const wSig = 8;

  // In1：MEM_A MCU↔M3；In3：M4 支路（南廊）
  {
    const entries = [];
    for (let i = 0; i < 8; i++) {
      if (!memA[i] || !m3APins[i]) continue;
      const pU = pw('U1', mcuAPads[i]);
      entries.push({
        net: memA[i], refPad: pU, pU,
        p3: pw('M3', m3APins[i]), p4: pw('M4', m4APins[i])
      });
    }
    for (const e of assignFarmBus(entries, 2600, true, tL, tR, P)) {
      padToTrunk(e.net, e.pU, 'In1.Cu', e.ry, e.fW, tL, wSig);
      padToTrunk(e.net, e.p3, 'In1.Cu', e.ry, e.fE, tR, wSig);
      add(e.net, { x: tL, y: e.ry }, { x: tR, y: e.ry }, wSig, 'In1.Cu');
      spurFromJoin(e.net, e.p4, 'In3.Cu', e.ry, e.fE + 12 * P, tR, wSig);
    }
  }

  // In2：MEM_D MCU↔M3；In4：M4 支路（北廊，与地址支路分层）
  {
    const entries = [];
    for (let i = 0; i < 8; i++) {
      if (!memD[i] || !m3DPins[i]) continue;
      const pU = pw('U1', mcuDPads[i]);
      entries.push({
        net: memD[i], refPad: pU, pU,
        p3: pw('M3', m3DPins[i]), p4: pw('M4', m4DPins[i])
      });
    }
    for (const e of assignFarmBus(entries, 200, false, tL, tR, P)) {
      padToTrunk(e.net, e.pU, 'In2.Cu', e.ry, e.fW, tL, wSig);
      padToTrunk(e.net, e.p3, 'In2.Cu', e.ry, e.fE, tR, wSig);
      add(e.net, { x: tL, y: e.ry }, { x: tR, y: e.ry }, wSig, 'In2.Cu');
      spurFromJoin(e.net, e.p4, 'In4.Cu', e.ry, e.fE + 12 * P, tR, wSig);
    }
  }

  // In3：I2C（最上，避开 M4 支路）
  {
    const a = pw('U1', 42), b = pw('M1', 6), c = pw('RSCL', 2);
    if (scl && a && b) {
      const ea = { x: a.x, y: a.y - 50 };
      const eb = { x: b.x, y: b.y + 50 };
      add(scl, a, ea, 10, 'F.Cu'); addVia(scl, ea);
      add(scl, b, eb, 10, 'F.Cu'); addVia(scl, eb);
      L(scl, [ea, { x: 1100, y: ea.y }, { x: 1100, y: 60 }, { x: eb.x, y: 60 }, eb], 10, 'In3.Cu');
      if (c) L(scl, [c, { x: b.x, y: c.y }, b], 10, 'F.Cu');
    }
  }
  {
    const a = pw('U1', 43), b = pw('M1', 5), c = pw('RSDA', 2);
    if (sda && a && b) {
      const ea = { x: a.x, y: a.y - 50 };
      const eb = { x: b.x, y: b.y + 50 };
      add(sda, a, ea, 10, 'F.Cu'); addVia(sda, ea);
      add(sda, b, eb, 10, 'F.Cu'); addVia(sda, eb);
      L(sda, [ea, { x: 1200, y: ea.y }, { x: 1200, y: 140 }, { x: eb.x, y: 140 }, eb], 10, 'In3.Cu');
      if (c) L(sda, [c, { x: b.x, y: c.y }, b], 10, 'F.Cu');
    }
  }

  // 控制：U1 侧 F 逃逸；存储器侧焊盘过孔；In3 横连+竖降
  {
    const ctrlEntries = [
      { net: memCe, pA: pw('U1', 45), pB: pw('M3', 19) },
      { net: memOe, pA: pw('U1', 46), pB: pw('M3', 20) },
      { net: sramCe, pA: pw('U1', 21), pB: pw('M4', 19) },
      { net: sramOe, pA: pw('U1', 22), pB: pw('M4', 20) },
      { net: sramWe, pA: pw('U1', 25), pB: pw('M4', 27) }
    ].filter(e => e.net && e.pA && e.pB);
    ctrlEntries.forEach((e, i) => {
      const ry = 3300 + i * P;
      const gA = { x: e.pA.x, y: ry };
      add(e.net, e.pA, gA, wSig, 'F.Cu');
      addVia(e.net, gA);
      addVia(e.net, e.pB);
      L(e.net, [
        gA,
        { x: e.pB.x, y: ry },
        e.pB
      ], wSig, 'In3.Cu');
    });
  }

  // SPI：B 横连到门孔；M2 端 F 短降（避免 B 上竖线切横线）
  {
    const spiEntries = [
      { net: spiCs, pA: pw('U1', 14), pB: pw('M2', 1) },
      { net: spiSck, pA: pw('U1', 15), pB: pw('M2', 6) },
      { net: spiMosi, pA: pw('U1', 17), pB: pw('M2', 5) },
      { net: spiMiso, pA: pw('U1', 16), pB: pw('M2', 2) }
    ].filter(e => e.net && e.pA && e.pB)
      .sort((a, b) => a.pA.x - b.pA.x);
    spiEntries.forEach((e, i) => {
      const ry = 600 + i * P;
      const gB = { x: e.pB.x, y: ry };
      addVia(e.net, e.pA);
      addVia(e.net, gB);
      L(e.net, [
        e.pA,
        { x: e.pA.x, y: ry },
        gB
      ], wSig, 'B.Cu');
      add(e.net, gB, e.pB, wSig, 'In4.Cu');
    });
  }

  // LA：F，先东后南，南廊在 MEM_A 干线以南
  const j = (n) => pw('J1', n);
  if (gnd && j(1)) addVia(gnd, j(1));
  const tapLA = (net, src, jPad, runY) => {
    if (!net || !src || !jPad) return;
    const col = 6200;
    L(net, [
      src, { x: col, y: src.y }, { x: col, y: runY },
      { x: jPad.x, y: runY }, jPad
    ], 10, 'F.Cu');
  };
  tapLA(scl, pw('M1', 6), j(2), 3400);
  tapLA(sda, pw('M1', 5), j(3), 3480);
  tapLA(spiSck, pw('M2', 6), j(4), 3560);
  tapLA(spiCs, pw('M2', 1), j(5), 3640);
  tapLA(spiMosi, pw('M2', 5), j(6), 3720);
  tapLA(memCe, pw('M3', 19), j(7), 3800);
  tapLA(sramCe, pw('M4', 19), j(8), 3880);

  return {
    trackCount: doc.tracks.length,
    netCount: 32,
    viaCount: doc.vias.length
  };
}

function main() {
  const srcDir = join(ROOT, 'Test_Template');
  const only = process.env.ONLY_LAB || '';
  const files = readdirSync(srcDir).filter(f => f.endsWith('.schsim') && f.startsWith('lab_') &&
    (!only || f === only + '.schsim' || f.startsWith(only + '_')));
  console.log(`PCB template export: ${files.length} schematics`);

  for (const dir of OUT_DIRS) mkdirSync(dir, { recursive: true });

  for (const file of files) {
    const id = file.replace(/\.schsim$/, '');
    const sch = JSON.parse(readFileSync(join(srcDir, file), 'utf8'));
    const { doc, placed, skipped } = annotateFromSchsim(sch);
    const copperCount = resolveLabCopperCount(id, sch, doc);
    applyCopperCount(doc, copperCount);
    let route;
    if (id === 'lab_power') {
      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
      doc.tracks = [];
      doc.vias = [];
      doc.zones = [];
      route = handLayoutLabPower(doc);
    } else if (id === 'lab_amp') {
      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
      doc.tracks = [];
      doc.vias = [];
      doc.zones = [];
      route = handLayoutLabAmp(doc);
    } else if (id === 'lab_filter') {
      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
      doc.tracks = [];
      doc.vias = [];
      doc.zones = [];
      route = handLayoutLabFilter(doc);
    } else if (id === 'lab_51_led') {
      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
      doc.tracks = [];
      doc.vias = [];
      doc.zones = [];
      route = handLayoutLab51Led(doc);
    } else if (id === 'lab_555_monostable') {
      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
      doc.tracks = [];
      doc.vias = [];
      doc.zones = [];
      route = handLayoutLab555Monostable(doc);
    } else if (id === 'lab_555_astable') {
      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
      doc.tracks = [];
      doc.vias = [];
      doc.zones = [];
      route = handLayoutLab555Astable(doc);
    } else if (id === 'lab_integrator') {
      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
      doc.tracks = [];
      doc.vias = [];
      doc.zones = [];
      route = handLayoutLabIntegrator(doc);
    } else if (id === 'lab_schmitt') {
      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
      doc.tracks = [];
      doc.vias = [];
      doc.zones = [];
      route = handLayoutLabSchmitt(doc);
    } else if (id === 'lab_digital_gates') {
      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
      doc.tracks = [];
      doc.vias = [];
      doc.zones = [];
      route = handLayoutLabDigitalGates(doc);
    } else if (id === 'lab_instruments') {
      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
      doc.tracks = [];
      doc.vias = [];
      doc.zones = [];
      route = handLayoutLabInstruments(doc);
    } else if (id === 'lab_sensor') {
      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
      doc.tracks = [];
      doc.vias = [];
      doc.zones = [];
      route = handLayoutLabSensor(doc);
    } else if (id === 'lab_peripheral') {
      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
      doc.tracks = [];
      doc.vias = [];
      doc.zones = [];
      route = handLayoutLabPeripheral(doc);
    } else if (id === 'lab_mcu_stm32') {
      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
      doc.tracks = [];
      doc.vias = [];
      doc.zones = [];
      route = handLayoutLabMcuStm32(doc);
    } else if (id === 'lab_mcu_8051') {
      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
      doc.tracks = [];
      doc.vias = [];
      doc.zones = [];
      route = handLayoutLabMcu8051(doc);
    } else if (id === 'lab_memory') {
      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
      doc.tracks = [];
      doc.vias = [];
      doc.zones = [];
      route = handLayoutLabMemory(doc);
    } else {
      route = autoRoute(doc);
    }
    applyLabBoardSize(doc, sch, id);
    const gndNet = doc.nets.find(n => isGndNet(n.name));
    if (id === 'lab_power' || id === 'lab_amp' || id === 'lab_filter' || id === 'lab_51_led' || id === 'lab_memory' || id === 'lab_mcu_8051' || id === 'lab_mcu_stm32' || id === 'lab_peripheral' || id === 'lab_sensor' || id === 'lab_instruments' || id === 'lab_digital_gates' || id === 'lab_schmitt' || id === 'lab_integrator' || id === 'lab_555_astable' || id === 'lab_555_monostable') {
      addCornerMountHoles(doc, gndNet);
    }
    const zones = pourPlanes(doc);
    const stitch = stitchGndToPour(doc);
    assignNetClasses(doc);
    delete doc._refToSchId;
    doc.metadata.modifiedAt = new Date().toISOString();
    const bw = Math.max(...doc.boardOutline.points.map(p => p.x));
    const bh = Math.max(...doc.boardOutline.points.map(p => p.y));
    doc.metadata.description =
      `PCB lab template for ${id} (${copperCount}-layer, ${bw}x${bh} mil)`;
    const out = buildPcbsim(sch, doc);
    const json = JSON.stringify(out);
    for (const dir of OUT_DIRS) {
      writeFileSync(join(dir, `${id}.pcbsim`), json, 'utf8');
    }
    const handTag = (id === 'lab_power' || id === 'lab_amp' || id === 'lab_filter' || id === 'lab_51_led' || id === 'lab_memory' || id === 'lab_mcu_8051' || id === 'lab_mcu_stm32' || id === 'lab_peripheral' || id === 'lab_sensor' || id === 'lab_instruments' || id === 'lab_digital_gates' || id === 'lab_schmitt' || id === 'lab_integrator' || id === 'lab_555_astable' || id === 'lab_555_monostable') ? ' [hand]' : '';
    console.log(
      `  ${id}: Cu=${copperCount} board=${bw}x${bh} placed=${placed} skipped=${skipped} ` +
      `tracks=${route.trackCount + stitch.tracks} vias=${route.viaCount + stitch.vias} ` +
      `nets=${route.netCount} zones=${zones} gndStitch=${stitch.vias}` +
      handTag
    );
  }

  for (const dir of OUT_DIRS) updateManifest(dir);
  console.log('Done.');
}

main();
