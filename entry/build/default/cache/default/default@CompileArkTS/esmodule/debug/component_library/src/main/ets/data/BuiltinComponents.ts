import { ComponentCategory, PinType } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { Pin } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ComponentDefinition } from '../api/IComponentLibrary';
import { appendComponents, emptyParams, makePin, params1, params2, params3, params5 } from "@bundle:com.elecdraw.aischsim/entry@component_library/ets/internal/ComponentLibHelpers";
import { pins8051Dip40, pinsStm32Teaching48, pinsStm32Teaching100, pinsStm32Teaching32, pinsLcd1602, pins24C02, pinsW25Q64, pins2764, pins62256, pinsDs18b20, pinsHallSensor, pinsCd4017, pinsLm2596 } from "@bundle:com.elecdraw.aischsim/entry@component_library/ets/data/NamedDevicePins";
export function getAllBuiltinComponents(): ComponentDefinition[] {
    const list: ComponentDefinition[] = [];
    appendComponents(list, makePowerSupplies());
    appendComponents(list, makePassives());
    appendComponents(list, makeDiscretes());
    appendComponents(list, makeAnalogIcs());
    appendComponents(list, makeDigitalIcs());
    appendComponents(list, makeMemory());
    appendComponents(list, makeMcus());
    appendComponents(list, makePeripherals());
    appendComponents(list, makeSensors());
    appendComponents(list, makeInstruments());
    return list;
}
function makePowerSupplies(): ComponentDefinition[] {
    return [
        {
            id: 'VCC',
            name: 'VCC 电源',
            category: ComponentCategory.POWER_SUPPLY,
            manufacturer: 'Generic',
            description: '正电源 VCC / VDD（voltage 可调，如 5V/3.3V/12V）',
            pins: [
                makePin('1', 'VCC', '1', PinType.POWER, 0, 10)
            ],
            defaultParams: params1('voltage', '5V'),
            spiceModel: '',
            behaviorModel: 'vcc',
            svgSymbol: 'vcc.svg',
            aiWiringRules: ['power-rail']
        },
        {
            id: 'VEE',
            name: 'VEE 负电源',
            category: ComponentCategory.POWER_SUPPLY,
            manufacturer: 'Generic',
            description: '负电源 VEE（voltage 为负值，如 -5V/-12V；运放双电源必备）',
            pins: [
                makePin('1', 'VEE', '1', PinType.POWER, 0, -10)
            ],
            defaultParams: params1('voltage', '-12V'),
            spiceModel: '',
            behaviorModel: 'vee',
            svgSymbol: 'gnd.svg',
            aiWiringRules: ['power-rail', 'negative-rail']
        },
        {
            id: 'GND',
            name: 'GND 接地',
            category: ComponentCategory.POWER_SUPPLY,
            manufacturer: 'Generic',
            description: '地 GND / VSS',
            pins: [
                makePin('1', 'GND', '1', PinType.GROUND, 0, -10)
            ],
            defaultParams: emptyParams(),
            spiceModel: '',
            behaviorModel: 'gnd',
            svgSymbol: 'gnd.svg',
            aiWiringRules: ['ground']
        },
        {
            id: 'VAC',
            name: 'VAC 交流电源',
            category: ComponentCategory.POWER_SUPPLY,
            manufacturer: 'Generic',
            description: '交流电压源 (正弦波)',
            pins: [
                makePin('1', 'AC+', '1', PinType.POWER, -20, 0),
                makePin('2', 'AC-', '2', PinType.POWER, 20, 0)
            ],
            defaultParams: params2('amplitude', '220V', 'frequency', '50Hz'),
            spiceModel: 'V{name} {AC+} {AC-} SIN(0 {amplitude} {frequency})',
            behaviorModel: 'ac_source',
            svgSymbol: 'vac.svg',
            aiWiringRules: ['ac-power']
        },
        {
            id: 'SIGNAL_GEN',
            name: '信号发生器',
            category: ComponentCategory.INSTRUMENT,
            manufacturer: 'AI-SCH',
            description: '函数信号源：正弦/方波/三角/锯齿/脉冲；frequency 与 dutyCycle(方波/脉冲)可调',
            pins: [
                makePin('OUT', 'OUT', '1', PinType.OUTPUT, -30, 0),
                makePin('GND', 'GND', '2', PinType.GROUND, 30, 0)
            ],
            defaultParams: params5('waveform', 'sine', 'amplitude', '1V', 'frequency', '1kHz', 'offset', '0V', 'dutyCycle', '50%'),
            spiceModel: '',
            behaviorModel: 'signal_gen',
            svgSymbol: 'vac.svg',
            aiWiringRules: ['signal-source', 'series-gnd']
        }
    ];
}
function makePassives(): ComponentDefinition[] {
    const items: ComponentDefinition[] = [];
    const resistors = ['10', '100', '330', '1k', '4.7k', '10k', '47k', '100k'];
    for (let i = 0; i < resistors.length; i++) {
        const v = resistors[i];
        items.push(twoPin(`R_${v}`, `Resistor ${v}Ω`, ComponentCategory.PASSIVE, params3('value', `${v}Ω`, 'tolerance', '5%', 'power', '0.25W'), `R{name} {1} {2} {value}`, ['pull-up', 'pull-down', 'voltage-divider']));
    }
    const pots = ['1k', '10k', '100k'];
    for (let i = 0; i < pots.length; i++) {
        const v = pots[i];
        items.push(makePotentiometer(`POT_${v}`, `滑动变阻器 ${v}Ω`, v));
    }
    const caps = ['10pF', '100pF', '1nF', '10nF', '100nF', '1uF', '10uF', '100uF'];
    for (let i = 0; i < caps.length; i++) {
        const v = caps[i];
        items.push(twoPin(`C_${v}`, `Capacitor ${v}`, ComponentCategory.PASSIVE, params2('value', v, 'voltage', '50V'), `C{name} {1} {2} {value}`, ['decoupling', 'filter']));
    }
    items.push(twoPin('L_10uH', 'Inductor 10uH', ComponentCategory.PASSIVE, params2('value', '10uH', 'current', '1A'), `L{name} {1} {2} 10u`, ['filter', 'power']));
    items.push(twoPin('XTAL_11M', 'Crystal 11.0592MHz', ComponentCategory.PASSIVE, params2('frequency', '11.0592MHz', 'loadCap', '30pF'), '', ['mcu-crystal']));
    items.push(twoPin('XTAL_8M', 'Crystal 8MHz', ComponentCategory.PASSIVE, params2('frequency', '8MHz', 'loadCap', '20pF'), '', ['mcu-crystal']));
    items.push(twoPin('FUSE_1A', 'Fuse 1A', ComponentCategory.PASSIVE, params1('rating', '1A'), '', []));
    return items;
}
function makeDiscretes(): ComponentDefinition[] {
    return [
        diode('1N4148', 'Signal Diode'),
        diode('1N4007', 'Rectifier Diode'),
        diode('1N5819', 'Schottky Diode'),
        led('LED_RED', 'Red LED', 'red'),
        led('LED_GREEN', 'Green LED', 'green'),
        led('LED_BLUE', 'Blue LED', 'blue'),
        transistor('2N2222', 'NPN Transistor', 'npn'),
        transistor('2N2907', 'PNP Transistor', 'pnp'),
        mosfet('2N7000', 'N-MOSFET', 'nmos'),
        mosfet('IRF540', 'N-MOSFET Power', 'nmos'),
    ];
}
function makeAnalogIcs(): ComponentDefinition[] {
    return [
        icOpAmp('UA741', 'UA741 Op-Amp'),
        icOpAmp('LM358', 'LM358 Dual Op-Amp'),
        icOpAmp('TL082', 'TL082 JFET Op-Amp'),
        ic555(),
        icRegulator('LM7805', '5V Regulator', 3),
        icRegulator('LM7812', '12V Regulator', 3),
        icRegulator('AMS1117_3V3', '3.3V LDO', 3),
        icRegulator('LM2596', 'Buck Converter', 5),
    ];
}
function makeDigitalIcs(): ComponentDefinition[] {
    const gates = ['00:NAND', '02:NOR', '04:NOT', '08:AND', '32:OR', '74:XOR'];
    const items: ComponentDefinition[] = [];
    for (let i = 0; i < gates.length; i++) {
        const g = gates[i];
        const parts = g.split(':');
        const num = parts[0];
        const type = parts[1];
        items.push(makeDigitalGate(num, type));
    }
    items.push(makeCd4017());
    return items;
}
function makeMemory(): ComponentDefinition[] {
    return [
        memChip('2764', 'EPROM 8Kx8', ComponentCategory.MEMORY, 28),
        memChip('62256', 'SRAM 32Kx8', ComponentCategory.MEMORY, 28),
        memChip('24C02', 'I2C EEPROM 256B', ComponentCategory.MEMORY, 8),
        memChip('W25Q64', 'SPI Flash 64Mbit', ComponentCategory.MEMORY, 8),
    ];
}
function makeMcus(): ComponentDefinition[] {
    const mcus: ComponentDefinition[] = [];
    const ids8051 = ['AT89C51', 'AT89C52', 'STC89C52', 'STC15W408AS'];
    for (let i = 0; i < ids8051.length; i++) {
        const id = ids8051[i];
        mcus.push(make8051Mcu(id));
    }
    const idsStm32 = ['STM32F103C8', 'STM32F103RC', 'STM32F407VG', 'STM32L431CB', 'STM32F030F4'];
    for (let i = 0; i < idsStm32.length; i++) {
        const id = idsStm32[i];
        mcus.push(makeStm32Mcu(id));
    }
    return mcus;
}
function makePeripherals(): ComponentDefinition[] {
    return [
        twoPin('SW_PUSH', 'Push Button', ComponentCategory.PERIPHERAL, params2('type', 'momentary', 'pressed', '0'), '', ['input']),
        makeRelaySpdt(),
        twoPin('BUZZER', 'Buzzer', ComponentCategory.PERIPHERAL, params1('voltage', '5V'), '', ['output']),
        makeLcd1602(),
        makeOled12864(),
    ];
}
/** Coil = pins 1/2 (template wiring); optional COM/NO/NC for contact model. */
function makeRelaySpdt(): ComponentDefinition {
    const def: ComponentDefinition = {
        id: 'RELAY_SPDT',
        name: 'SPDT Relay',
        category: ComponentCategory.PERIPHERAL,
        manufacturer: 'Generic',
        description: '线圈 1/2 + 触点 COM/NO/NC',
        pins: [
            makePin('1', '1', '1', PinType.PASSIVE, -30, -10),
            makePin('2', '2', '2', PinType.PASSIVE, 30, -10),
            makePin('COM', 'COM', '3', PinType.PASSIVE, 0, 20),
            makePin('NO', 'NO', '4', PinType.PASSIVE, 20, 20),
            makePin('NC', 'NC', '5', PinType.PASSIVE, -20, 20)
        ],
        defaultParams: params1('coilVoltage', '5V'),
        spiceModel: '',
        behaviorModel: 'relay_spdt',
        svgSymbol: 'RELAY_SPDT.svg',
        aiWiringRules: ['output']
    };
    return def;
}
function makeSensors(): ComponentDefinition[] {
    return [
        {
            id: 'DS18B20',
            name: 'DS18B20 Temperature',
            category: ComponentCategory.SENSOR,
            manufacturer: 'Maxim',
            description: '1-Wire 温度传感器（GND/DQ/VDD）',
            pins: pinsDs18b20(),
            defaultParams: params2('range', '-55~125°C', 'interface', '1-Wire'),
            spiceModel: '',
            behaviorModel: 'ds18b20',
            svgSymbol: 'ds18b20.svg',
            aiWiringRules: ['one-wire', 'pull-up']
        },
        {
            id: 'HALL_SENSOR',
            name: 'Hall Sensor',
            category: ComponentCategory.SENSOR,
            manufacturer: 'Generic',
            description: '霍尔开关（VCC/OUT/GND）',
            pins: pinsHallSensor(),
            defaultParams: params1('type', 'digital'),
            spiceModel: '',
            behaviorModel: 'hall',
            svgSymbol: 'hall.svg',
            aiWiringRules: ['input', 'pull-up']
        },
        twoPin('LDR', 'Photoresistor', ComponentCategory.SENSOR, params2('type', 'analog', 'value', '50k'), '', ['adc-input'])
    ];
}
function makeInstruments(): ComponentDefinition[] {
    return [
        makeOscilloscope(),
        makeVirtualMeter(),
        makeLogicAnalyzer(),
        makeUartTerminal(),
        makeVoltmeter(),
        makeAmmeter(),
        makePowerMeter(),
        makeFrequencyCounter(),
    ];
}
function twoPin(id: string, name: string, cat: ComponentCategory, params: Map<string, string>, spice: string, rules: string[]): ComponentDefinition {
    const def: ComponentDefinition = {
        id: id,
        name: name,
        category: cat,
        manufacturer: 'Generic',
        description: name,
        pins: [
            makePin('1', '1', '1', PinType.PASSIVE, -30, 0),
            makePin('2', '2', '2', PinType.PASSIVE, 30, 0)
        ],
        defaultParams: params,
        spiceModel: spice,
        behaviorModel: '',
        svgSymbol: `${id}.svg`,
        aiWiringRules: rules
    };
    return def;
}
/** 三端滑动变阻器：1/2 为端，W 为抽头（wiper 0~1） */
function makePotentiometer(id: string, name: string, value: string): ComponentDefinition {
    const def: ComponentDefinition = {
        id: id,
        name: name,
        category: ComponentCategory.PASSIVE,
        manufacturer: 'Generic',
        description: `${name}，可调抽头分压`,
        pins: [
            makePin('1', '1', '1', PinType.PASSIVE, -30, 0),
            makePin('2', '2', '2', PinType.PASSIVE, 30, 0),
            makePin('W', 'W', '3', PinType.PASSIVE, 0, 28)
        ],
        defaultParams: params3('value', `${value}Ω`, 'wiper', '0.5', 'power', '0.25W'),
        spiceModel: 'R{name}A {1} {W} {value}*{wiper}\nR{name}B {W} {2} {value}*(1-{wiper})',
        behaviorModel: 'potentiometer',
        svgSymbol: 'potentiometer.svg',
        aiWiringRules: ['voltage-divider', 'adjustable']
    };
    return def;
}
function diode(id: string, desc: string): ComponentDefinition {
    const def: ComponentDefinition = {
        id: id,
        name: id,
        category: ComponentCategory.DISCRETE,
        manufacturer: 'Generic',
        description: desc,
        pins: [
            makePin('A', 'A', '1', PinType.PASSIVE, -30, 0),
            makePin('K', 'K', '2', PinType.PASSIVE, 30, 0)
        ],
        defaultParams: params1('type', 'signal'),
        spiceModel: `D{name} {A} {K}`,
        behaviorModel: 'diode',
        svgSymbol: 'diode.svg',
        aiWiringRules: ['rectifier']
    };
    return def;
}
function led(id: string, name: string, color: string): ComponentDefinition {
    const def: ComponentDefinition = {
        id: id,
        name: name,
        category: ComponentCategory.DISCRETE,
        manufacturer: 'Generic',
        description: name,
        pins: [
            makePin('A', 'A', '1', PinType.PASSIVE, -30, 0),
            makePin('K', 'K', '2', PinType.PASSIVE, 30, 0)
        ],
        defaultParams: params2('color', color, 'forwardVoltage', '2.0V'),
        spiceModel: 'D{name} {A} {K} LED',
        behaviorModel: 'led',
        svgSymbol: 'led.svg',
        aiWiringRules: ['led-indicator']
    };
    return def;
}
function transistor(id: string, name: string, type: string): ComponentDefinition {
    const def: ComponentDefinition = {
        id: id,
        name: name,
        category: ComponentCategory.DISCRETE,
        manufacturer: 'Generic',
        description: name,
        pins: [
            makePin('B', 'B', '1', PinType.INPUT, -30, 0),
            makePin('C', 'C', '2', PinType.OUTPUT, 30, -20),
            makePin('E', 'E', '3', PinType.PASSIVE, 30, 20)
        ],
        defaultParams: params1('type', type),
        spiceModel: `Q{name} {C} {B} {E}`,
        behaviorModel: type,
        svgSymbol: 'transistor.svg',
        aiWiringRules: ['switching']
    };
    return def;
}
function mosfet(id: string, name: string, type: string): ComponentDefinition {
    const def: ComponentDefinition = {
        id: id,
        name: name,
        category: ComponentCategory.DISCRETE,
        manufacturer: 'Generic',
        description: name,
        pins: [
            makePin('G', 'G', '1', PinType.INPUT, -30, 0),
            makePin('D', 'D', '2', PinType.OUTPUT, 30, -10),
            makePin('S', 'S', '3', PinType.PASSIVE, 30, 10)
        ],
        defaultParams: params1('type', type),
        spiceModel: '',
        behaviorModel: type,
        svgSymbol: 'mosfet.svg',
        aiWiringRules: ['power-switch']
    };
    return def;
}
function icOpAmp(id: string, name: string): ComponentDefinition {
    const isDual = id === 'LM358' || id === 'TL082';
    const pins: Pin[] = isDual ? genDualOpAmpPins() : [
        makePin('IN+', 'IN+', '3', PinType.INPUT, -30, -10),
        makePin('IN-', 'IN-', '2', PinType.INPUT, -30, 10),
        makePin('OUT', 'OUT', '6', PinType.OUTPUT, 30, 0),
        makePin('VCC', 'VCC', '7', PinType.POWER, 0, -40),
        makePin('VEE', 'VEE', '4', PinType.GROUND, 0, 40)
    ];
    const def: ComponentDefinition = {
        id: id,
        name: name,
        category: ComponentCategory.ANALOG_IC,
        manufacturer: 'Generic',
        description: name,
        pins: pins,
        defaultParams: params1('gain', '100dB'),
        spiceModel: `X{name} {IN+} {IN-} {OUT} opamp`,
        behaviorModel: 'opamp',
        svgSymbol: 'opamp.svg',
        aiWiringRules: ['analog-signal']
    };
    return def;
}
/** LM555 定时器 DIP-8：左 GND/TRIG/OUT/RESET，右 VCC/DISCH/THRES/CTRL */
function ic555(): ComponentDefinition {
    const pins: Pin[] = [
        makePin('GND', 'GND', '1', PinType.GROUND, -40, -30),
        makePin('TRIG', 'TRIG', '2', PinType.INPUT, -40, -10),
        makePin('OUT', 'OUT', '3', PinType.OUTPUT, -40, 10),
        makePin('RESET', 'RESET', '4', PinType.INPUT, -40, 30),
        makePin('CTRL', 'CTRL', '5', PinType.INPUT, 40, 30),
        makePin('THRES', 'THRES', '6', PinType.INPUT, 40, 10),
        makePin('DISCH', 'DISCH', '7', PinType.BIDIRECTIONAL, 40, -10),
        makePin('VCC', 'VCC', '8', PinType.POWER, 40, -30)
    ];
    const def: ComponentDefinition = {
        id: 'LM555',
        name: 'LM555 Timer',
        category: ComponentCategory.ANALOG_IC,
        manufacturer: 'TI',
        description: '555 Timer (astable/monostable)',
        pins: pins,
        defaultParams: emptyParams(),
        spiceModel: '',
        behaviorModel: 'timer555',
        svgSymbol: 'timer555.svg',
        aiWiringRules: ['timer', 'oscillator']
    };
    return def;
}
function icRegulator(id: string, name: string, pinCount: number): ComponentDefinition {
    let output = '5V';
    if (name.includes('3V3')) {
        output = '3.3V';
    }
    // 3-pin linear：TO-220 式符号（IN 左 / GND 下 / OUT 右），避免 genPins(3)
    // 把 1、2 叠在左侧导致正交走线弯点落在邻脚上、拓扑重建时并网短路。
    const pins = pinCount === 3
        ? [
            makePin('1', 'IN', '1', PinType.INPUT, -40, 0),
            makePin('2', 'GND', '2', PinType.GROUND, 0, 40),
            makePin('3', 'OUT', '3', PinType.OUTPUT, 40, 0)
        ]
        : (id === 'LM2596' ? pinsLm2596() : genPins(pinCount));
    const def: ComponentDefinition = {
        id: id,
        name: name,
        category: ComponentCategory.ANALOG_IC,
        manufacturer: 'Generic',
        description: name,
        pins: pins,
        defaultParams: params1('output', output),
        spiceModel: '',
        behaviorModel: 'regulator',
        svgSymbol: 'regulator.svg',
        aiWiringRules: ['power-rail']
    };
    return def;
}
function memChip(id: string, name: string, cat: ComponentCategory, pinCount: number): ComponentDefinition {
    let pins = genPins(pinCount);
    if (id === '24C02') {
        pins = pins24C02();
    }
    else if (id === 'W25Q64') {
        pins = pinsW25Q64();
    }
    else if (id === '2764') {
        pins = pins2764();
    }
    else if (id === '62256') {
        pins = pins62256();
    }
    const def: ComponentDefinition = {
        id: id,
        name: name,
        category: cat,
        manufacturer: 'Generic',
        description: name,
        pins: pins,
        defaultParams: emptyParams(),
        spiceModel: '',
        behaviorModel: `mem_${id.toLowerCase()}`,
        svgSymbol: 'memory.svg',
        aiWiringRules: ['bus']
    };
    return def;
}
function makeDigitalGate(num: string, type: string): ComponentDefinition {
    let pins: Pin[];
    if (type === 'NOT') {
        pins = [
            makePin('1', 'A', '1', PinType.INPUT, -40, 0),
            makePin('2', 'Y', '2', PinType.OUTPUT, 40, 0),
            makePin('7', 'GND', '7', PinType.GROUND, 0, 40),
            makePin('14', 'VCC', '14', PinType.POWER, 0, -40)
        ];
    }
    else {
        pins = [
            makePin('1', 'A', '1', PinType.INPUT, -40, -10),
            makePin('2', 'B', '2', PinType.INPUT, -40, 10),
            makePin('3', 'Y', '3', PinType.OUTPUT, 40, 0),
            makePin('7', 'GND', '7', PinType.GROUND, 0, 40),
            makePin('14', 'VCC', '14', PinType.POWER, 0, -40)
        ];
    }
    const def: ComponentDefinition = {
        id: `74HC${num}`,
        name: `74HC${num} ${type}`,
        category: ComponentCategory.DIGITAL_IC,
        manufacturer: 'TI',
        description: `${type} Gate`,
        pins: pins,
        defaultParams: params1('family', 'HC'),
        spiceModel: '',
        behaviorModel: `74hc_${type.toLowerCase()}`,
        svgSymbol: `gate_${type.toLowerCase()}.svg`,
        aiWiringRules: ['logic-input', 'logic-output']
    };
    return def;
}
function makeCd4017(): ComponentDefinition {
    const def: ComponentDefinition = {
        id: 'CD4017',
        name: 'CD4017 Decade Counter',
        category: ComponentCategory.DIGITAL_IC,
        manufacturer: 'TI',
        description: 'Johnson Decade Counter',
        pins: pinsCd4017(),
        defaultParams: params1('family', '4000'),
        spiceModel: '',
        behaviorModel: 'cd4017',
        svgSymbol: 'cd4017.svg',
        aiWiringRules: ['counter']
    };
    return def;
}
function make8051Mcu(id: string): ComponentDefinition {
    let manufacturer = 'Atmel';
    if (id.startsWith('STC')) {
        manufacturer = 'STC';
    }
    const def: ComponentDefinition = {
        id: id,
        name: id,
        category: ComponentCategory.MCU_8051,
        manufacturer: manufacturer,
        description: `8051 MCU ${id}`,
        pins: pins8051Dip40(),
        defaultParams: params1('clock', '11.0592MHz'),
        spiceModel: '',
        behaviorModel: '8051_behavioral',
        svgSymbol: 'mcu_8051.svg',
        aiWiringRules: ['mcu-reset', 'mcu-crystal', 'mcu-power', 'mcu-uart']
    };
    return def;
}
function makeStm32Mcu(id: string): ComponentDefinition {
    let pins = pinsStm32Teaching48();
    let clock = '72MHz';
    if (id.includes('F407')) {
        pins = pinsStm32Teaching100();
        clock = '168MHz';
    }
    else if (id.includes('F030')) {
        pins = pinsStm32Teaching32();
        clock = '48MHz';
    }
    const def: ComponentDefinition = {
        id: id,
        name: id,
        category: ComponentCategory.MCU_STM32,
        manufacturer: 'STMicroelectronics',
        description: `STM32 MCU ${id}`,
        pins: pins,
        defaultParams: params1('clock', clock),
        spiceModel: '',
        behaviorModel: 'stm32_behavioral',
        svgSymbol: 'mcu_stm32.svg',
        aiWiringRules: ['mcu-reset', 'mcu-crystal', 'mcu-power', 'mcu-swdebug']
    };
    return def;
}
function makeLcd1602(): ComponentDefinition {
    const def: ComponentDefinition = {
        id: 'LCD1602',
        name: 'LCD1602',
        category: ComponentCategory.PERIPHERAL,
        manufacturer: 'Generic',
        description: '16x2 Character LCD',
        pins: pinsLcd1602(),
        defaultParams: params1('interface', 'parallel'),
        spiceModel: '',
        behaviorModel: 'lcd1602',
        svgSymbol: 'lcd1602.svg',
        aiWiringRules: ['lcd-data', 'lcd-control']
    };
    return def;
}
function makeOled12864(): ComponentDefinition {
    const def: ComponentDefinition = {
        id: 'OLED_12864',
        name: 'OLED 128x64',
        category: ComponentCategory.PERIPHERAL,
        manufacturer: 'Generic',
        description: '128x64 OLED Display',
        pins: [
            makePin('VCC', 'VCC', '1', PinType.POWER, -30, -10),
            makePin('GND', 'GND', '2', PinType.GROUND, -30, 10),
            makePin('SDA', 'SDA', '3', PinType.BIDIRECTIONAL, 30, -10),
            makePin('SCL', 'SCL', '4', PinType.INPUT, 30, 10)
        ],
        defaultParams: params1('interface', 'I2C'),
        spiceModel: '',
        behaviorModel: 'oled',
        svgSymbol: 'oled.svg',
        aiWiringRules: ['i2c-bus']
    };
    return def;
}
function makeOscilloscope(): ComponentDefinition {
    const def: ComponentDefinition = {
        id: 'OSCILLOSCOPE',
        name: 'Virtual Oscilloscope',
        category: ComponentCategory.INSTRUMENT,
        manufacturer: 'AI-SCH',
        description: '4-channel virtual oscilloscope',
        pins: [
            // 与 DeviceLibrary/OSCILLOSCOPE 一致：全部左插，主体在原点右侧
            makePin('CH1', 'CH1', '1', PinType.INPUT, -40, -30),
            makePin('CH2', 'CH2', '2', PinType.INPUT, -40, -10),
            makePin('CH3', 'CH3', '3', PinType.INPUT, -40, 10),
            makePin('CH4', 'CH4', '4', PinType.INPUT, -40, 30),
            makePin('GND', 'GND', '5', PinType.GROUND, -40, 50)
        ],
        defaultParams: params2('channels', '4', 'sampleRate', '1MHz'),
        spiceModel: '',
        behaviorModel: 'oscilloscope',
        svgSymbol: 'oscilloscope.svg',
        aiWiringRules: []
    };
    return def;
}
function makeVirtualMeter(): ComponentDefinition {
    const def: ComponentDefinition = {
        id: 'VIRTUAL_METER',
        name: 'Virtual Multimeter',
        category: ComponentCategory.INSTRUMENT,
        manufacturer: 'AI-SCH',
        description: 'Virtual multimeter',
        pins: [
            makePin('V', 'V', '1', PinType.INPUT, -30, -25),
            makePin('COM', 'COM', '2', PinType.GROUND, -30, 25)
        ],
        defaultParams: params1('modes', 'V,A,Ω'),
        spiceModel: '',
        behaviorModel: 'multimeter',
        svgSymbol: 'multimeter.svg',
        aiWiringRules: []
    };
    return def;
}
function makeLogicAnalyzer(): ComponentDefinition {
    const pins: Pin[] = [];
    for (let i = 0; i < 8; i++) {
        pins.push(makePin(`CH${i + 1}`, `CH${i + 1}`, `${i + 1}`, PinType.INPUT, -40, -40 + i * 10));
    }
    pins.push(makePin('GND', 'GND', '9', PinType.GROUND, -40, 40));
    const def: ComponentDefinition = {
        id: 'LOGIC_ANALYZER',
        name: 'Logic Analyzer',
        category: ComponentCategory.INSTRUMENT,
        manufacturer: 'AI-SCH',
        description: '8-channel logic analyzer',
        pins: pins,
        defaultParams: params1('channels', '8'),
        spiceModel: '',
        behaviorModel: 'logic_analyzer',
        svgSymbol: 'logic_analyzer.svg',
        aiWiringRules: []
    };
    return def;
}
function makeUartTerminal(): ComponentDefinition {
    const def: ComponentDefinition = {
        id: 'UART_TERMINAL',
        name: 'UART Virtual Terminal',
        category: ComponentCategory.INSTRUMENT,
        manufacturer: 'AI-SCH',
        description: 'Serial virtual terminal',
        pins: [
            makePin('TX', 'TX', '1', PinType.INPUT, -40, -10),
            makePin('RX', 'RX', '2', PinType.OUTPUT, -40, 10),
            makePin('GND', 'GND', '3', PinType.GROUND, -40, 30)
        ],
        defaultParams: params1('baudRate', '9600'),
        spiceModel: '',
        behaviorModel: 'uart_terminal',
        svgSymbol: 'uart_terminal.svg',
        aiWiringRules: ['mcu-uart']
    };
    return def;
}
function genPins(count: number): Pin[] {
    const pins: Pin[] = [];
    const leftCount = Math.ceil(count / 2);
    const rightCount = Math.floor(count / 2);
    const spacing = 10;
    const bodyHalf = Math.max(leftCount, rightCount) * spacing / 2;
    for (let i = 0; i < leftCount; i++) {
        pins.push(makePin(`${i + 1}`, `${i + 1}`, `${i + 1}`, PinType.BIDIRECTIONAL, -40, i * spacing - bodyHalf));
    }
    for (let i = 0; i < rightCount; i++) {
        const pinNum = leftCount + i + 1;
        pins.push(makePin(`${pinNum}`, `${pinNum}`, `${pinNum}`, PinType.BIDIRECTIONAL, 40, i * spacing - bodyHalf));
    }
    return pins;
}
function genMcuPins(count: number): Pin[] {
    const pins: Pin[] = [];
    const leftCount = Math.ceil(count / 2);
    const rightCount = Math.floor(count / 2);
    const spacing = 10;
    const bodyHalf = Math.max(leftCount, rightCount) * spacing / 2;
    for (let i = 0; i < leftCount; i++) {
        pins.push(makePin(`P${i + 1}`, `P${i + 1}`, `${i + 1}`, PinType.BIDIRECTIONAL, -50, i * spacing - bodyHalf));
    }
    for (let i = 0; i < rightCount; i++) {
        const pinNum = leftCount + i + 1;
        pins.push(makePin(`P${pinNum}`, `P${pinNum}`, `${pinNum}`, PinType.BIDIRECTIONAL, 50, i * spacing - bodyHalf));
    }
    return pins;
}
function genDualOpAmpPins(): Pin[] {
    return [
        makePin('OUT1', 'OUT1', '1', PinType.OUTPUT, 50, -30),
        makePin('IN-1', 'IN-1', '2', PinType.INPUT, -50, -20),
        makePin('IN+1', 'IN+1', '3', PinType.INPUT, -50, -40),
        makePin('V-', 'V-', '4', PinType.GROUND, 0, 50),
        makePin('IN+2', 'IN+2', '5', PinType.INPUT, -50, 20),
        makePin('IN-2', 'IN-2', '6', PinType.INPUT, -50, 40),
        makePin('OUT2', 'OUT2', '7', PinType.OUTPUT, 50, 30),
        makePin('V+', 'V+', '8', PinType.POWER, 0, -50)
    ];
}
function makeVoltmeter(): ComponentDefinition {
    return {
        id: 'VOLTMETER_DC',
        name: 'DC 电压表',
        category: ComponentCategory.INSTRUMENT,
        manufacturer: 'AI-SCH',
        description: '直流电压表 — 并联测量 DC 电压',
        pins: [
            makePin('V+', 'V+', '1', PinType.INPUT, -30, -25),
            makePin('COM', 'COM', '2', PinType.GROUND, -30, 25)
        ],
        defaultParams: params2('type', 'dc', 'range', '20V'),
        spiceModel: '',
        behaviorModel: 'voltmeter_dc',
        svgSymbol: 'voltmeter.svg',
        aiWiringRules: ['voltage-probe']
    };
}
function makeAmmeter(): ComponentDefinition {
    return {
        id: 'AMMETER_DC',
        name: 'DC 电流表',
        category: ComponentCategory.INSTRUMENT,
        manufacturer: 'AI-SCH',
        description: '直流电流表 — 串联测量 DC 电流',
        pins: [
            makePin('I+', 'I+', '1', PinType.INPUT, -30, 0),
            makePin('I-', 'I-', '2', PinType.OUTPUT, -30, 20)
        ],
        defaultParams: params2('type', 'dc', 'range', '200mA'),
        spiceModel: '',
        behaviorModel: 'ammeter_dc',
        svgSymbol: 'ammeter.svg',
        aiWiringRules: ['current-sense']
    };
}
function makePowerMeter(): ComponentDefinition {
    return {
        id: 'POWER_METER',
        name: '功率表',
        category: ComponentCategory.INSTRUMENT,
        manufacturer: 'AI-SCH',
        description: '功率表 — 同时测量电压、电流、功率、功率因数',
        pins: [
            makePin('V+', 'V+', '1', PinType.INPUT, -40, -20),
            makePin('V-', 'V-', '2', PinType.INPUT, -40, 0),
            makePin('I+', 'I+', '3', PinType.INPUT, -40, 20),
            makePin('I-', 'I-', '4', PinType.OUTPUT, -40, 40)
        ],
        defaultParams: params1('range', '1000V/10A'),
        spiceModel: '',
        behaviorModel: 'power_meter',
        svgSymbol: 'power_meter.svg',
        aiWiringRules: ['power-measure']
    };
}
function makeFrequencyCounter(): ComponentDefinition {
    return {
        id: 'FREQ_COUNTER',
        name: '频率计',
        category: ComponentCategory.INSTRUMENT,
        manufacturer: 'AI-SCH',
        description: '频率计 — 测量信号频率',
        pins: [
            makePin('IN', 'IN', '1', PinType.INPUT, -30, -10),
            makePin('GND', 'GND', '2', PinType.GROUND, -30, 10)
        ],
        defaultParams: params2('gateTime', '1s', 'range', '10MHz'),
        spiceModel: '',
        behaviorModel: 'freq_counter',
        svgSymbol: 'freq_counter.svg',
        aiWiringRules: ['freq-measure']
    };
}
