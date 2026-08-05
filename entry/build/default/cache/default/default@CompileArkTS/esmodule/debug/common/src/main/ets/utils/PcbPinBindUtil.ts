import type { PcbNetRef } from '../types/PcbTypes';
/** 2/3 脚无源/分立：符号脚名 → 焊盘号（勿用于多脚 IC） */
const PIN_LABEL_TO_PAD: Map<string, string> = new Map([
    ['A', '1'], ['ANODE', '1'], ['C', '1'], ['IN', '1'], ['+', '1'],
    ['V+', '1'], ['I+', '1'], ['VP', '1'],
    ['K', '2'], ['CATHODE', '2'], ['E', '2'], ['GND', '2'], ['-', '2'],
    ['COM', '2'], ['I-', '2'], ['V-', '2'],
    ['B', '3'], ['OUT', '3'], ['G', '3']
]);
/** 双运放 SOIC-8 / DIP-8（LM358 等） */
const DUAL_OPAMP_PIN_TO_PAD: Map<string, string> = new Map([
    ['OUT1', '1'], ['IN-1', '2'], ['IN+1', '3'], ['V-', '4'], ['VEE', '4'],
    ['IN+2', '5'], ['IN-2', '6'], ['OUT2', '7'], ['V+', '8'], ['VCC', '8']
]);
/** 单运放 UA741 / LM741 */
const UA741_PIN_TO_PAD: Map<string, string> = new Map([
    ['OFFSET1', '1'], ['NULL1', '1'], ['NULL', '1'],
    ['IN-', '2'], ['IN+', '3'],
    ['V-', '4'], ['VEE', '4'],
    ['OFFSET2', '5'], ['NULL2', '5'],
    ['OUT', '6'],
    ['V+', '7'], ['VCC', '7'],
    ['NC', '8']
]);
/** NE555 / LM555 */
const LM555_PIN_TO_PAD: Map<string, string> = new Map([
    ['GND', '1'], ['VSS', '1'],
    ['TRIG', '2'], ['TRIGGER', '2'],
    ['OUT', '3'], ['OUTPUT', '3'],
    ['RESET', '4'], ['RST', '4'],
    ['CTRL', '5'], ['CONTROL', '5'], ['CV', '5'],
    ['THRES', '6'], ['THRESHOLD', '6'],
    ['DISCH', '7'], ['DISCHARGE', '7'],
    ['VCC', '8'], ['VDD', '8']
]);
/** AT89C51 / 8051 DIP-40 */
const MCU51_PIN_TO_PAD: Map<string, string> = new Map([
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
/** STM32F103C8 教学 LQFP-48 */
const STM32F103C8_PIN_TO_PAD: Map<string, string> = new Map([
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
    ['PC4', '18'], ['PC5', '19'], ['PC6', '20'], ['PC7', '39'],
    ['BOOT0', '44']
]);
/** STM32F103RC LQFP-64 全脚位（VSS_1=24 / VDD_1=25，勿沿用 C8 的 23/24） */
const STM32F103RC_PIN_TO_PAD: Map<string, string> = new Map([
    ['PE2', '1'], ['PE3', '2'], ['PE4', '3'], ['PE5', '4'], ['PE6', '5'],
    ['PD1', '6'], ['OSC_OUT', '6'],
    ['PD0', '7'], ['OSC_IN', '7'],
    ['NRST', '8'], ['RESET', '8'],
    ['VSSA', '9'], ['VDDA', '10'],
    ['PA0', '11'], ['PA1', '12'], ['PA2', '13'], ['PA3', '14'],
    ['PA4', '15'], ['PA5', '16'], ['PA6', '17'], ['PA7', '18'],
    ['PB0', '19'], ['PB1', '20'], ['PB2', '21'],
    ['PB10', '22'], ['PB11', '23'],
    ['VSS', '24'], ['VSS_1', '24'], ['VDD', '25'], ['VDD_1', '25'],
    ['PB12', '26'], ['PB13', '27'], ['PB14', '28'], ['PB15', '29'],
    ['PA8', '30'], ['PA9', '31'], ['PA10', '32'], ['PA11', '33'],
    ['PA12', '34'], ['PA13', '35'],
    ['VSS_2', '36'], ['VDD_2', '37'],
    ['PA14', '38'], ['PA15', '39'],
    ['PB3', '40'], ['PB4', '41'], ['PB5', '42'],
    ['PB6', '43'], ['PB7', '44'], ['PB8', '45'], ['PB9', '46'],
    ['PE0', '47'], ['PE1', '48'],
    ['VSS_3', '49'], ['VDD_3', '50'],
    ['PE7', '51'], ['PE8', '52'], ['PE9', '53'], ['PE10', '54'],
    ['PE11', '55'], ['PE12', '56'], ['PE13', '57'], ['PE14', '58'],
    ['PE15', '59'],
    ['PC13', '62'], ['PC14', '63'], ['PC15', '64'],
    ['USART1_TX', '31'], ['USART1_RX', '32']
]);
/** STM32F407VG LQFP-100（确认脚位；全脚待补） */
const STM32F407_PIN_TO_PAD: Map<string, string> = new Map([
    ['VBAT', '6'],
    ['PC13', '7'], ['PC14', '8'], ['PC15', '9'],
    ['PF0', '10'], ['PF1', '11'],
    ['OSC_IN', '12'], ['PH0', '12'],
    ['OSC_OUT', '13'], ['PH1', '13'],
    ['NRST', '14'], ['RESET', '14'],
    ['PC0', '15'], ['PC1', '16'], ['PC2', '17'], ['PC3', '18'],
    ['VSSA', '19'], ['VDDA', '22'],
    ['PA0', '23'], ['PA1', '24'], ['PA2', '25'], ['PA3', '26'],
    ['PA4', '27'], ['PA5', '28'], ['PA6', '29'], ['PA7', '30']
]);
/** STM32F030F4 / L431CB 教学 TSSOP-20 */
const STM32_TSSOP20_PIN_TO_PAD: Map<string, string> = new Map([
    ['BOOT0', '1'],
    ['OSC_IN', '2'], ['PF0', '2'],
    ['OSC_OUT', '3'], ['PF1', '3'],
    ['NRST', '4'], ['RESET', '4'],
    ['VDDA', '5'],
    ['PA0', '6'], ['PA1', '7'], ['PA2', '8'], ['PA3', '9'],
    ['VSS', '15'], ['VDD', '16']
]);
const LCD1602_PIN_TO_PAD: Map<string, string> = new Map([
    ['VSS', '1'], ['GND', '1'],
    ['VDD', '2'], ['VCC', '2'],
    ['V0', '3'], ['VO', '3'], ['VEE', '3'],
    ['RS', '4'], ['RW', '5'], ['E', '6'], ['EN', '6'],
    ['D0', '7'], ['D1', '8'], ['D2', '9'], ['D3', '10'],
    ['D4', '11'], ['D5', '12'], ['D6', '13'], ['D7', '14'],
    ['A', '15'], ['LED+', '15'], ['BLA', '15'],
    ['K', '16'], ['LED-', '16'], ['BLK', '16']
]);
const OLED_PIN_TO_PAD: Map<string, string> = new Map([
    ['VCC', '1'], ['VDD', '1'],
    ['GND', '2'], ['VSS', '2'],
    ['SDA', '3'], ['SCL', '4']
]);
const RELAY_SPDT_PIN_TO_PAD: Map<string, string> = new Map([
    ['1', '1'], ['2', '2'],
    ['COM', '3'], ['NO', '4'], ['NC', '5']
]);
const DS18B20_PIN_TO_PAD: Map<string, string> = new Map([
    ['GND', '1'], ['DQ', '2'], ['VDD', '3'], ['VCC', '3']
]);
const HALL_PIN_TO_PAD: Map<string, string> = new Map([
    ['VCC', '1'], ['VDD', '1'], ['OUT', '2'], ['GND', '3']
]);
const POT3_PIN_TO_PAD: Map<string, string> = new Map([
    ['1', '1'], ['W', '2'], ['WIPER', '2'], ['2', '3'], ['3', '3']
]);
const CD4017_PIN_TO_PAD: Map<string, string> = new Map([
    ['Q5', '1'], ['Q1', '2'], ['Q0', '3'], ['Q2', '4'],
    ['Q6', '5'], ['Q7', '6'], ['Q3', '7'], ['VSS', '8'], ['GND', '8'],
    ['Q8', '9'], ['Q4', '10'], ['Q9', '11'], ['CO', '12'],
    ['CLK', '13'], ['EN', '14'], ['RST', '15'], ['VDD', '16'], ['VCC', '16']
]);
/**
 * 74HC/LS 系列逻辑 IC：键 `${型号}:${脚名}` → 焊盘号。
 * 00/02/04/08/14/32/86 为 DIP-14 标准；74=双 D 触发器；138=3-8 译码器；
 * 245=总线收发器；595=移位寄存器。符号脚名带 #/\/BAR 的取反脚加别名。
 */
const TTL74XX_PIN_TO_PAD: Map<string, string> = new Map([
    // 00 quad NAND（08/32/86 同构：1A 1B 1Y ... 4A 4B 4Y）
    ['00:1A', '1'], ['00:1B', '2'], ['00:1Y', '3'], ['00:2A', '4'], ['00:2B', '5'],
    ['00:2Y', '6'], ['00:3Y', '8'], ['00:3A', '9'], ['00:3B', '10'],
    ['00:4Y', '11'], ['00:4A', '12'], ['00:4B', '13'],
    // 02 quad NOR（输出在前）
    ['02:1Y', '1'], ['02:1A', '2'], ['02:1B', '3'], ['02:2Y', '4'], ['02:2A', '5'],
    ['02:2B', '6'], ['02:3A', '8'], ['02:3B', '9'], ['02:3Y', '10'],
    ['02:4A', '11'], ['02:4B', '12'], ['02:4Y', '13'],
    // 04/14 hex inverter
    ['04:1A', '1'], ['04:1Y', '2'], ['04:2A', '3'], ['04:2Y', '4'], ['04:3A', '5'],
    ['04:3Y', '6'], ['04:4Y', '8'], ['04:4A', '9'], ['04:5Y', '10'], ['04:5A', '11'],
    ['04:6Y', '12'], ['04:6A', '13'],
    // 74 dual D flip-flop
    ['74:1CLR', '1'], ['74:1D', '2'], ['74:1CLK', '3'], ['74:1PR', '4'],
    ['74:1Q', '5'], ['74:1Q#', '6'], ['74:1/Q', '6'], ['74:1QN', '6'],
    ['74:2Q#', '8'], ['74:2/Q', '8'], ['74:2QN', '8'], ['74:2Q', '9'],
    ['74:2PR', '10'], ['74:2CLK', '11'], ['74:2D', '12'], ['74:2CLR', '13'],
    // 138 3-to-8 decoder（E1/E2 低有效，E3 高有效；输出 Y0-Y7 / Q0-Q7）
    ['138:A0', '1'], ['138:A1', '2'], ['138:A2', '3'],
    ['138:E1', '4'], ['138:E2', '5'], ['138:E3', '6'],
    ['138:Y7', '7'], ['138:Q7', '7'],
    ['138:Y6', '9'], ['138:Q6', '9'],
    ['138:Y5', '10'], ['138:Q5', '10'],
    ['138:Y4', '11'], ['138:Q4', '11'],
    ['138:Y3', '12'], ['138:Q3', '12'],
    ['138:Y2', '13'], ['138:Q2', '13'],
    ['138:Y1', '14'], ['138:Q1', '14'],
    ['138:Y0', '15'], ['138:Q0', '15'],
    // 245 octal bus transceiver
    ['245:DIR', '1'], ['245:A0', '2'], ['245:A1', '3'], ['245:A2', '4'],
    ['245:A3', '5'], ['245:A4', '6'], ['245:A5', '7'], ['245:A6', '8'], ['245:A7', '9'],
    ['245:B0', '11'], ['245:B1', '12'], ['245:B2', '13'], ['245:B3', '14'],
    ['245:B4', '15'], ['245:B5', '16'], ['245:B6', '17'], ['245:B7', '18'],
    ['245:OE#', '19'], ['245:/OE', '19'], ['245:OEN', '19'],
    // 595 shift register
    ['595:QB', '1'], ['595:QC', '2'], ['595:QD', '3'], ['595:QE', '4'],
    ['595:QF', '5'], ['595:QG', '6'], ['595:QH', '7'],
    ['595:QH#', '9'], ['595:/QH', '9'], ['595:QHn', '9'],
    ['595:SRCLR#', '10'], ['595:/SRCLR', '10'],
    ['595:SRCLK', '11'], ['595:RCLK', '12'], ['595:LATCH', '12'],
    ['595:OE#', '13'], ['595:/OE', '13'],
    ['595:SER', '14'], ['595:QA', '15'],
    // 电源（按封装脚数）
    ['00:GND', '7'], ['00:VCC', '14'], ['00:VDD', '14'],
    ['02:GND', '7'], ['02:VCC', '14'], ['02:VDD', '14'],
    ['04:GND', '7'], ['04:VCC', '14'], ['04:VDD', '14'],
    ['08:GND', '7'], ['08:VCC', '14'], ['08:VDD', '14'],
    ['14:GND', '7'], ['14:VCC', '14'], ['14:VDD', '14'],
    ['32:GND', '7'], ['32:VCC', '14'], ['32:VDD', '14'],
    ['86:GND', '7'], ['86:VCC', '14'], ['86:VDD', '14'],
    ['74:GND', '7'], ['74:VCC', '14'], ['74:VDD', '14'],
    ['138:GND', '8'], ['138:VCC', '16'], ['138:VDD', '16'],
    ['245:GND', '10'], ['245:VCC', '20'], ['245:VDD', '20'],
    ['595:GND', '8'], ['595:VCC', '16'], ['595:VDD', '16']
]);
/** 从 libDevId 提取 74 系列型号号段（74HC00/74LS245/74HCT138 → 00/245/138） */
function extract74Model(libDevId: string): string {
    const m = libDevId.toLowerCase().match(/74(?:hc|hct|ls|als|ac|act|f|ahct)?(\d{2,3})/);
    if (m && m[1]) {
        return m[1];
    }
    return '';
}
function lookup74xxPad(libDevId: string, pinLabel: string): string | undefined {
    const model = extract74Model(libDevId);
    if (model.length === 0) {
        return undefined;
    }
    return TTL74XX_PIN_TO_PAD.get(`${model}:${pinLabel.toUpperCase()}`);
}
function is74xxLib(libDevId: string): boolean {
    return extract74Model(libDevId).length > 0;
}
const LM2596_PIN_TO_PAD: Map<string, string> = new Map([
    ['VIN', '1'], ['IN', '1'],
    ['OUT', '2'], ['VOUT', '2'],
    ['GND', '3'], ['VSS', '3'],
    ['FB', '4'], ['FEEDBACK', '4'],
    ['ON', '5'], ['ON/OFF', '5'], ['EN', '5'], ['ENABLE', '5']
]);
const MEM24C02_PIN_TO_PAD: Map<string, string> = new Map([
    ['A0', '1'], ['A1', '2'], ['A2', '3'], ['VSS', '4'], ['GND', '4'],
    ['SDA', '5'], ['SCL', '6'], ['WP', '7'], ['VCC', '8'], ['VDD', '8']
]);
const W25Q64_PIN_TO_PAD: Map<string, string> = new Map([
    ['CS', '1'], ['/CS', '1'], ['DO', '2'], ['MISO', '2'],
    ['WP', '3'], ['/WP', '3'], ['GND', '4'], ['VSS', '4'],
    ['DI', '5'], ['MOSI', '5'], ['CLK', '6'], ['SCK', '6'],
    ['HOLD', '7'], ['/HOLD', '7'], ['VCC', '8'], ['VDD', '8']
]);
const MEM2764_PIN_TO_PAD: Map<string, string> = new Map([
    ['VPP', '1'], ['A0', '2'], ['A1', '3'], ['A2', '4'], ['A3', '5'],
    ['A4', '6'], ['A5', '7'], ['A6', '8'], ['A7', '9'],
    ['D0', '10'], ['D1', '11'], ['D2', '12'], ['D3', '13'],
    ['D4', '14'], ['D5', '15'], ['D6', '16'], ['D7', '17'],
    ['GND', '18'], ['VSS', '18'],
    ['CE', '19'], ['/CE', '19'], ['OE', '20'], ['/OE', '20'],
    ['VCC', '26'], ['VDD', '26']
]);
const MEM62256_PIN_TO_PAD: Map<string, string> = new Map([
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
const SIGNAL_GEN_PIN_TO_PAD: Map<string, string> = new Map([['OUT', '1'], ['GND', '2']]);
const AMMETER_PIN_TO_PAD: Map<string, string> = new Map([['I+', '1'], ['I-', '2']]);
const POWER_METER_PIN_TO_PAD: Map<string, string> = new Map([
    ['I+', '1'], ['I-', '2'], ['V+', '3'], ['V-', '4'], ['GND', '4']
]);
const VOLTMETER_PIN_TO_PAD: Map<string, string> = new Map([['V+', '1'], ['COM', '2'], ['GND', '2']]);
const VIRTUAL_METER_PIN_TO_PAD: Map<string, string> = new Map([
    ['V', '1'], ['A', '2'], ['OHM', '3'], ['COM', '4'], ['GND', '4']
]);
const FREQ_COUNTER_PIN_TO_PAD: Map<string, string> = new Map([['IN', '1'], ['GND', '2']]);
const OSCILLOSCOPE_PIN_TO_PAD: Map<string, string> = new Map([
    ['CH1', '1'], ['CH2', '2'], ['CH3', '3'], ['CH4', '4'], ['GND', '5']
]);
const LOGIC_ANALYZER_PIN_TO_PAD: Map<string, string> = new Map([
    ['CH1', '1'], ['CH2', '2'], ['CH3', '3'], ['CH4', '4'],
    ['CH5', '5'], ['CH6', '6'], ['CH7', '7'], ['CH8', '8'], ['GND', '9']
]);
const UART_TERMINAL_PIN_TO_PAD: Map<string, string> = new Map([
    ['TX', '1'], ['RX', '2'], ['GND', '3']
]);
function isUa741Lib(libDevId: string): boolean {
    const lib = libDevId.toLowerCase();
    return lib.includes('ua741') || lib.includes('lm741') || lib === '741';
}
function isLm555Lib(libDevId: string): boolean {
    const lib = libDevId.toLowerCase();
    return lib.includes('555') || lib.includes('ne555') || lib.includes('lm555') || lib.includes('e555');
}
function isDualOpAmpLib(libDevId: string): boolean {
    const lib = libDevId.toLowerCase();
    if (isUa741Lib(libDevId)) {
        return false;
    }
    return lib.includes('lm358') || lib.includes('tl082') || lib.includes('lm324') ||
        lib.includes('ne5532') || lib.includes('opamp');
}
function isMcu51Lib(libDevId: string): boolean {
    const lib = libDevId.toLowerCase();
    return lib.includes('at89') || lib.includes('at89c51') || lib.includes('8051') ||
        lib.includes('stc89') || lib.includes('stc90') || lib.includes('stc15') ||
        lib === 'mcs51';
}
function isMcuStm32F103C8Lib(libDevId: string): boolean {
    const lib = libDevId.toLowerCase();
    return lib.includes('stm32f103c8') || lib === 'stm32f103c8tx';
}
function isMcuStm32F103RCLib(libDevId: string): boolean {
    return libDevId.toLowerCase().includes('stm32f103rc');
}
function isMcuStm32F407Lib(libDevId: string): boolean {
    return libDevId.toLowerCase().includes('stm32f407');
}
function isMcuStm32Tssop20Lib(libDevId: string): boolean {
    const lib = libDevId.toLowerCase();
    return lib.includes('stm32f030') || lib.includes('stm32l431');
}
function instrumentPinMap(libDevId: string): Map<string, string> | null {
    const lib = libDevId.toLowerCase();
    if (lib.includes('signal_gen')) {
        return SIGNAL_GEN_PIN_TO_PAD;
    }
    if (lib.includes('ammeter')) {
        return AMMETER_PIN_TO_PAD;
    }
    if (lib.includes('power_meter')) {
        return POWER_METER_PIN_TO_PAD;
    }
    if (lib.includes('voltmeter')) {
        return VOLTMETER_PIN_TO_PAD;
    }
    if (lib.includes('virtual_meter')) {
        return VIRTUAL_METER_PIN_TO_PAD;
    }
    if (lib.includes('freq_counter')) {
        return FREQ_COUNTER_PIN_TO_PAD;
    }
    if (lib.includes('oscilloscope')) {
        return OSCILLOSCOPE_PIN_TO_PAD;
    }
    if (lib.includes('logic_analyzer')) {
        return LOGIC_ANALYZER_PIN_TO_PAD;
    }
    if (lib.includes('uart_terminal')) {
        return UART_TERMINAL_PIN_TO_PAD;
    }
    return null;
}
/** 按器件库选取脚名→焊盘号表；无专用表则返回 null（走 2/3 脚别名） */
function devicePinMap(libDevId: string): Map<string, string> | null {
    const lib = libDevId.toLowerCase();
    if (isUa741Lib(libDevId)) {
        return UA741_PIN_TO_PAD;
    }
    if (isLm555Lib(libDevId)) {
        return LM555_PIN_TO_PAD;
    }
    if (isDualOpAmpLib(libDevId)) {
        return DUAL_OPAMP_PIN_TO_PAD;
    }
    if (isMcu51Lib(libDevId)) {
        return MCU51_PIN_TO_PAD;
    }
    if (isMcuStm32F103C8Lib(libDevId)) {
        return STM32F103C8_PIN_TO_PAD;
    }
    if (isMcuStm32F103RCLib(libDevId)) {
        return STM32F103RC_PIN_TO_PAD;
    }
    if (isMcuStm32F407Lib(libDevId)) {
        return STM32F407_PIN_TO_PAD;
    }
    if (isMcuStm32Tssop20Lib(libDevId)) {
        return STM32_TSSOP20_PIN_TO_PAD;
    }
    // 泛化 STM32 → F103C8 教学脚位（封装默认 QFP48）
    if (lib.includes('stm32')) {
        return STM32F103C8_PIN_TO_PAD;
    }
    if (lib.includes('lcd')) {
        return LCD1602_PIN_TO_PAD;
    }
    if (lib.includes('oled')) {
        return OLED_PIN_TO_PAD;
    }
    if (lib.includes('relay')) {
        return RELAY_SPDT_PIN_TO_PAD;
    }
    if (lib.includes('ds18')) {
        return DS18B20_PIN_TO_PAD;
    }
    if (lib.includes('hall')) {
        return HALL_PIN_TO_PAD;
    }
    if (lib.includes('pot')) {
        return POT3_PIN_TO_PAD;
    }
    if (lib.includes('cd4017') || lib === '4017') {
        return CD4017_PIN_TO_PAD;
    }
    if (lib.includes('lm2596')) {
        return LM2596_PIN_TO_PAD;
    }
    const instr = instrumentPinMap(libDevId);
    if (instr !== null) {
        return instr;
    }
    if (lib.includes('24c')) {
        return MEM24C02_PIN_TO_PAD;
    }
    if (lib.includes('w25q')) {
        return W25Q64_PIN_TO_PAD;
    }
    if (lib.includes('2764')) {
        return MEM2764_PIN_TO_PAD;
    }
    if (lib.includes('62256')) {
        return MEM62256_PIN_TO_PAD;
    }
    return null;
}
function applyPinMap(map: Map<string, PcbNetRef>, compId: string, pinId: string, pinName: string, netId: string, netName: string, pinMap: Map<string, string>): boolean {
    let hit = false;
    const labels: string[] = [pinId, pinName];
    for (let i = 0; i < labels.length; i++) {
        const pin = labels[i];
        if (pin.length === 0) {
            continue;
        }
        const pad = pinMap.get(pin.toUpperCase());
        if (pad !== undefined) {
            registerPadNetKey(map, compId, pad, netId, netName);
            hit = true;
        }
    }
    return hit;
}
export function registerPadNetKey(map: Map<string, PcbNetRef>, compId: string, key: string, netId: string, netName: string): void {
    if (key.length === 0) {
        return;
    }
    const entry: PcbNetRef = { netId, netName };
    map.set(`${compId}:${key}`, entry);
    map.set(`${compId}:${key.toUpperCase()}`, entry);
    const stripped = key.replace(/^p/i, '');
    if (stripped.length > 0 && stripped !== key) {
        map.set(`${compId}:${stripped}`, entry);
        map.set(`${compId}:${stripped.toUpperCase()}`, entry);
    }
}
function tryMcuStylePin(map: Map<string, PcbNetRef>, compId: string, pin: string, netId: string, netName: string): void {
    if (pin.length >= 2 && (pin.charAt(0) === 'P' || pin.charAt(0) === 'p')) {
        const rest = pin.substring(1);
        if (/^\d+$/.test(rest)) {
            registerPadNetKey(map, compId, rest, netId, netName);
        }
    }
}
function tryLabelAlias(map: Map<string, PcbNetRef>, compId: string, pin: string, netId: string, netName: string): void {
    const padNum = PIN_LABEL_TO_PAD.get(pin.toUpperCase());
    if (padNum !== undefined) {
        registerPadNetKey(map, compId, padNum, netId, netName);
    }
}
/**
 * 将原理图 net.pinIds 中的一脚注册到 compId:padKey 查找表。
 * @param libraryId 器件 libraryId；有专用脚位表时优先用表，禁止 2 脚别名污染 MCU
 */
export function registerSchPinToPadNet(map: Map<string, PcbNetRef>, compId: string, pinId: string, pinName: string, netId: string, netName: string, libraryId: string = ''): void {
    registerPadNetKey(map, compId, pinId, netId, netName);
    registerPadNetKey(map, compId, pinName, netId, netName);
    tryMcuStylePin(map, compId, pinId, netId, netName);
    tryMcuStylePin(map, compId, pinName, netId, netName);
    const pinMap = libraryId.length > 0 ? devicePinMap(libraryId) : null;
    if (pinMap !== null) {
        applyPinMap(map, compId, pinId, pinName, netId, netName, pinMap);
        return;
    }
    // 74 系列逻辑 IC：型号+脚名（74HC00/74LS245...）；命中型号但脚名未收录时不回退别名
    if (libraryId.length > 0 && is74xxLib(libraryId)) {
        let hit74 = false;
        const labels74: string[] = [pinId, pinName];
        for (let i = 0; i < labels74.length; i++) {
            const pad = lookup74xxPad(libraryId, labels74[i]);
            if (pad !== undefined) {
                registerPadNetKey(map, compId, pad, netId, netName);
                hit74 = true;
            }
        }
        if (hit74) {
            return;
        }
    }
    // 无专用表：2/3 脚无源/分立别名
    tryLabelAlias(map, compId, pinId, netId, netName);
    tryLabelAlias(map, compId, pinName, netId, netName);
}
/**
 * 按焊盘号查找网络。
 * 仅按焊盘号；脚名别名须在 register 阶段已写入焊盘号。
 * 勿在此回退 OUT→3 / GND→2，否则会把 MCU/运放绑到错误脚。
 */
export function lookupPadNet(map: Map<string, PcbNetRef>, compId: string, padNumber: string): PcbNetRef | undefined {
    const keys: string[] = [padNumber, padNumber.toUpperCase(), `p${padNumber}`, `P${padNumber}`];
    for (let i = 0; i < keys.length; i++) {
        const hit = map.get(`${compId}:${keys[i]}`);
        if (hit !== undefined) {
            return hit;
        }
    }
    return undefined;
}
/** 测试/诊断：解析 libraryId+脚名 → 焊盘号（无映射返回空串） */
export function resolveDevicePadNumber(libraryId: string, pinLabel: string): string {
    if (libraryId.length === 0 || pinLabel.length === 0) {
        return '';
    }
    if (is74xxLib(libraryId)) {
        return lookup74xxPad(libraryId, pinLabel) ?? '';
    }
    const pinMap = devicePinMap(libraryId);
    if (pinMap !== null) {
        return pinMap.get(pinLabel.toUpperCase()) ?? '';
    }
    return PIN_LABEL_TO_PAD.get(pinLabel.toUpperCase()) ?? '';
}
