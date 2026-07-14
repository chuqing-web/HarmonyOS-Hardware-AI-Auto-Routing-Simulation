import { ComponentCategory, PinType } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { Pin } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ComponentDefinition } from '../api/IComponentLibrary';
import { appendComponents, emptyParams, makePin, params1, params2, params3 } from "@bundle:com.elecdraw.aischsim/entry@component_library/ets/internal/ComponentLibHelpers";
export function getAllBuiltinComponents(): ComponentDefinition[] {
    const d325: ComponentDefinition[] = [];
    appendComponents(d325, makePowerSupplies());
    appendComponents(d325, makePassives());
    appendComponents(d325, makeDiscretes());
    appendComponents(d325, makeAnalogIcs());
    appendComponents(d325, makeDigitalIcs());
    appendComponents(d325, makeMemory());
    appendComponents(d325, makeMcus());
    appendComponents(d325, makePeripherals());
    appendComponents(d325, makeSensors());
    appendComponents(d325, makeInstruments());
    return d325;
}
function makePowerSupplies(): ComponentDefinition[] {
    return [
        {
            id: 'VCC',
            name: 'VCC 电源',
            category: ComponentCategory.POWER_SUPPLY,
            manufacturer: 'Generic',
            description: '正电源 VCC / VDD',
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
        }
    ];
}
function makePassives(): ComponentDefinition[] {
    const w324: ComponentDefinition[] = [];
    const x324 = ['10', '100', '330', '1k', '4.7k', '10k', '47k', '100k'];
    for (let b325 = 0; b325 < x324.length; b325++) {
        const c325 = x324[b325];
        w324.push(twoPin(`R_${c325}`, `Resistor ${c325}Ω`, ComponentCategory.PASSIVE, params3('value', `${c325}Ω`, 'tolerance', '5%', 'power', '0.25W'), `R{name} {1} {2} {value}`, ['pull-up', 'pull-down', 'voltage-divider']));
    }
    const y324 = ['10pF', '100pF', '1nF', '10nF', '100nF', '1uF', '10uF', '100uF'];
    for (let z324 = 0; z324 < y324.length; z324++) {
        const a325 = y324[z324];
        w324.push(twoPin(`C_${a325}`, `Capacitor ${a325}`, ComponentCategory.PASSIVE, params2('value', a325, 'voltage', '50V'), `C{name} {1} {2} {value}`, ['decoupling', 'filter']));
    }
    w324.push(twoPin('L_10uH', 'Inductor 10uH', ComponentCategory.PASSIVE, params2('value', '10uH', 'current', '1A'), `L{name} {1} {2} 10u`, ['filter', 'power']));
    w324.push(twoPin('XTAL_11M', 'Crystal 11.0592MHz', ComponentCategory.PASSIVE, params2('frequency', '11.0592MHz', 'loadCap', '30pF'), '', ['mcu-crystal']));
    w324.push(twoPin('XTAL_8M', 'Crystal 8MHz', ComponentCategory.PASSIVE, params2('frequency', '8MHz', 'loadCap', '20pF'), '', ['mcu-crystal']));
    w324.push(twoPin('FUSE_1A', 'Fuse 1A', ComponentCategory.PASSIVE, params1('rating', '1A'), '', []));
    return w324;
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
        icRegulator('LM7805', '5V Regulator', 3),
        icRegulator('LM7812', '12V Regulator', 3),
        icRegulator('AMS1117_3V3', '3.3V LDO', 3),
        icRegulator('LM2596', 'Buck Converter', 5),
    ];
}
function makeDigitalIcs(): ComponentDefinition[] {
    const p324 = ['00:NAND', '02:NOR', '04:NOT', '08:AND', '32:OR', '74:XOR'];
    const q324: ComponentDefinition[] = [];
    for (let r324 = 0; r324 < p324.length; r324++) {
        const s324 = p324[r324];
        const t324 = s324.split(':');
        const u324 = t324[0];
        const v324 = t324[1];
        q324.push(makeDigitalGate(u324, v324));
    }
    q324.push(makeCd4017());
    return q324;
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
    const i324: ComponentDefinition[] = [];
    const j324 = ['AT89C51', 'AT89C52', 'STC89C52', 'STC15W408AS'];
    for (let n324 = 0; n324 < j324.length; n324++) {
        const o324 = j324[n324];
        i324.push(make8051Mcu(o324));
    }
    const k324 = ['STM32F103C8', 'STM32F103RC', 'STM32F407VG', 'STM32L431CB', 'STM32F030F4'];
    for (let l324 = 0; l324 < k324.length; l324++) {
        const m324 = k324[l324];
        i324.push(makeStm32Mcu(m324));
    }
    return i324;
}
function makePeripherals(): ComponentDefinition[] {
    return [
        twoPin('SW_PUSH', 'Push Button', ComponentCategory.PERIPHERAL, params1('type', 'momentary'), '', ['input']),
        twoPin('RELAY_SPDT', 'SPDT Relay', ComponentCategory.PERIPHERAL, params1('coilVoltage', '5V'), '', ['output']),
        twoPin('BUZZER', 'Buzzer', ComponentCategory.PERIPHERAL, params1('voltage', '5V'), '', ['output']),
        makeLcd1602(),
        makeOled12864(),
    ];
}
function makeSensors(): ComponentDefinition[] {
    return [
        twoPin('DS18B20', 'DS18B20 Temperature', ComponentCategory.SENSOR, params2('range', '-55~125°C', 'interface', '1-Wire'), '', ['one-wire']),
        twoPin('HALL_SENSOR', 'Hall Sensor', ComponentCategory.SENSOR, params1('type', 'digital'), '', ['input']),
        twoPin('LDR', 'Photoresistor', ComponentCategory.SENSOR, params1('type', 'analog'), '', ['adc-input']),
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
function twoPin(b324: string, c324: string, d324: ComponentCategory, e324: Map<string, string>, f324: string, g324: string[]): ComponentDefinition {
    const h324: ComponentDefinition = {
        id: b324,
        name: c324,
        category: d324,
        manufacturer: 'Generic',
        description: c324,
        pins: [
            makePin('1', '1', '1', PinType.PASSIVE, -30, 0),
            makePin('2', '2', '2', PinType.PASSIVE, 30, 0)
        ],
        defaultParams: e324,
        spiceModel: f324,
        behaviorModel: '',
        svgSymbol: `${b324}.svg`,
        aiWiringRules: g324
    };
    return h324;
}
function diode(y323: string, z323: string): ComponentDefinition {
    const a324: ComponentDefinition = {
        id: y323,
        name: y323,
        category: ComponentCategory.DISCRETE,
        manufacturer: 'Generic',
        description: z323,
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
    return a324;
}
function led(u323: string, v323: string, w323: string): ComponentDefinition {
    const x323: ComponentDefinition = {
        id: u323,
        name: v323,
        category: ComponentCategory.DISCRETE,
        manufacturer: 'Generic',
        description: v323,
        pins: [
            makePin('A', 'A', '1', PinType.PASSIVE, -30, 0),
            makePin('K', 'K', '2', PinType.PASSIVE, 30, 0)
        ],
        defaultParams: params2('color', w323, 'forwardVoltage', '2.0V'),
        spiceModel: 'D{name} {A} {K} LED',
        behaviorModel: 'led',
        svgSymbol: 'led.svg',
        aiWiringRules: ['led-indicator']
    };
    return x323;
}
function transistor(q323: string, r323: string, s323: string): ComponentDefinition {
    const t323: ComponentDefinition = {
        id: q323,
        name: r323,
        category: ComponentCategory.DISCRETE,
        manufacturer: 'Generic',
        description: r323,
        pins: [
            makePin('B', 'B', '1', PinType.INPUT, -30, 0),
            makePin('C', 'C', '2', PinType.OUTPUT, 30, -20),
            makePin('E', 'E', '3', PinType.PASSIVE, 30, 20)
        ],
        defaultParams: params1('type', s323),
        spiceModel: `Q{name} {C} {B} {E}`,
        behaviorModel: s323,
        svgSymbol: 'transistor.svg',
        aiWiringRules: ['switching']
    };
    return t323;
}
function mosfet(m323: string, n323: string, o323: string): ComponentDefinition {
    const p323: ComponentDefinition = {
        id: m323,
        name: n323,
        category: ComponentCategory.DISCRETE,
        manufacturer: 'Generic',
        description: n323,
        pins: [
            makePin('G', 'G', '1', PinType.INPUT, -30, 0),
            makePin('D', 'D', '2', PinType.OUTPUT, 30, -10),
            makePin('S', 'S', '3', PinType.PASSIVE, 30, 10)
        ],
        defaultParams: params1('type', o323),
        spiceModel: '',
        behaviorModel: o323,
        svgSymbol: 'mosfet.svg',
        aiWiringRules: ['power-switch']
    };
    return p323;
}
function icOpAmp(h323: string, i323: string): ComponentDefinition {
    const j323 = h323 === 'LM358' || h323 === 'TL082';
    const k323: Pin[] = j323 ? genDualOpAmpPins() : [
        makePin('IN+', 'IN+', '3', PinType.INPUT, -30, -10),
        makePin('IN-', 'IN-', '2', PinType.INPUT, -30, 10),
        makePin('OUT', 'OUT', '6', PinType.OUTPUT, 30, 0),
        makePin('VCC', 'VCC', '7', PinType.POWER, 0, -40),
        makePin('VEE', 'VEE', '4', PinType.GROUND, 0, 40)
    ];
    const l323: ComponentDefinition = {
        id: h323,
        name: i323,
        category: ComponentCategory.ANALOG_IC,
        manufacturer: 'Generic',
        description: i323,
        pins: k323,
        defaultParams: params1('gain', '100dB'),
        spiceModel: `X{name} {IN+} {IN-} {OUT} opamp`,
        behaviorModel: 'opamp',
        svgSymbol: 'opamp.svg',
        aiWiringRules: ['analog-signal']
    };
    return l323;
}
function icRegulator(b323: string, c323: string, d323: number): ComponentDefinition {
    let e323 = '5V';
    if (c323.includes('3V3')) {
        e323 = '3.3V';
    }
    const f323 = d323 === 3
        ? [
            makePin('1', 'IN', '1', PinType.INPUT, -40, 0),
            makePin('2', 'GND', '2', PinType.GROUND, 0, 40),
            makePin('3', 'OUT', '3', PinType.OUTPUT, 40, 0)
        ]
        : genPins(d323);
    const g323: ComponentDefinition = {
        id: b323,
        name: c323,
        category: ComponentCategory.ANALOG_IC,
        manufacturer: 'Generic',
        description: c323,
        pins: f323,
        defaultParams: params1('output', e323),
        spiceModel: '',
        behaviorModel: 'regulator',
        svgSymbol: 'regulator.svg',
        aiWiringRules: ['power-rail']
    };
    return g323;
}
function memChip(w322: string, x322: string, y322: ComponentCategory, z322: number): ComponentDefinition {
    const a323: ComponentDefinition = {
        id: w322,
        name: x322,
        category: y322,
        manufacturer: 'Generic',
        description: x322,
        pins: genPins(z322),
        defaultParams: emptyParams(),
        spiceModel: '',
        behaviorModel: `mem_${w322.toLowerCase()}`,
        svgSymbol: 'memory.svg',
        aiWiringRules: ['bus']
    };
    return a323;
}
function makeDigitalGate(s322: string, t322: string): ComponentDefinition {
    let u322: Pin[];
    if (t322 === 'NOT') {
        u322 = [
            makePin('1', 'A', '1', PinType.INPUT, -40, 0),
            makePin('2', 'Y', '2', PinType.OUTPUT, 40, 0),
            makePin('7', 'GND', '7', PinType.GROUND, 0, 40),
            makePin('14', 'VCC', '14', PinType.POWER, 0, -40)
        ];
    }
    else {
        u322 = [
            makePin('1', 'A', '1', PinType.INPUT, -40, -10),
            makePin('2', 'B', '2', PinType.INPUT, -40, 10),
            makePin('3', 'Y', '3', PinType.OUTPUT, 40, 0),
            makePin('7', 'GND', '7', PinType.GROUND, 0, 40),
            makePin('14', 'VCC', '14', PinType.POWER, 0, -40)
        ];
    }
    const v322: ComponentDefinition = {
        id: `74HC${s322}`,
        name: `74HC${s322} ${t322}`,
        category: ComponentCategory.DIGITAL_IC,
        manufacturer: 'TI',
        description: `${t322} Gate`,
        pins: u322,
        defaultParams: params1('family', 'HC'),
        spiceModel: '',
        behaviorModel: `74hc_${t322.toLowerCase()}`,
        svgSymbol: `gate_${t322.toLowerCase()}.svg`,
        aiWiringRules: ['logic-input', 'logic-output']
    };
    return v322;
}
function makeCd4017(): ComponentDefinition {
    const r322: ComponentDefinition = {
        id: 'CD4017',
        name: 'CD4017 Decade Counter',
        category: ComponentCategory.DIGITAL_IC,
        manufacturer: 'TI',
        description: 'Johnson Decade Counter',
        pins: genPins(16),
        defaultParams: params1('family', '4000'),
        spiceModel: '',
        behaviorModel: 'cd4017',
        svgSymbol: 'cd4017.svg',
        aiWiringRules: ['counter']
    };
    return r322;
}
function make8051Mcu(o322: string): ComponentDefinition {
    let p322 = 'Atmel';
    if (o322.startsWith('STC')) {
        p322 = 'STC';
    }
    const q322: ComponentDefinition = {
        id: o322,
        name: o322,
        category: ComponentCategory.MCU_8051,
        manufacturer: p322,
        description: `8051 MCU ${o322}`,
        pins: genMcuPins(40),
        defaultParams: params1('clock', '11.0592MHz'),
        spiceModel: '',
        behaviorModel: '8051_behavioral',
        svgSymbol: 'mcu_8051.svg',
        aiWiringRules: ['mcu-reset', 'mcu-crystal', 'mcu-power', 'mcu-uart']
    };
    return q322;
}
function makeStm32Mcu(k322: string): ComponentDefinition {
    let l322 = 48;
    let m322 = '72MHz';
    if (k322.includes('F407')) {
        l322 = 100;
        m322 = '168MHz';
    }
    const n322: ComponentDefinition = {
        id: k322,
        name: k322,
        category: ComponentCategory.MCU_STM32,
        manufacturer: 'STMicroelectronics',
        description: `STM32 MCU ${k322}`,
        pins: genMcuPins(l322),
        defaultParams: params1('clock', m322),
        spiceModel: '',
        behaviorModel: 'stm32_behavioral',
        svgSymbol: 'mcu_stm32.svg',
        aiWiringRules: ['mcu-reset', 'mcu-crystal', 'mcu-power', 'mcu-swdebug']
    };
    return n322;
}
function makeLcd1602(): ComponentDefinition {
    const j322: ComponentDefinition = {
        id: 'LCD1602',
        name: 'LCD1602',
        category: ComponentCategory.PERIPHERAL,
        manufacturer: 'Generic',
        description: '16x2 Character LCD',
        pins: genPins(16),
        defaultParams: params1('interface', 'parallel'),
        spiceModel: '',
        behaviorModel: 'lcd1602',
        svgSymbol: 'lcd1602.svg',
        aiWiringRules: ['lcd-data', 'lcd-control']
    };
    return j322;
}
function makeOled12864(): ComponentDefinition {
    const i322: ComponentDefinition = {
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
    return i322;
}
function makeOscilloscope(): ComponentDefinition {
    const h322: ComponentDefinition = {
        id: 'OSCILLOSCOPE',
        name: 'Virtual Oscilloscope',
        category: ComponentCategory.INSTRUMENT,
        manufacturer: 'AI-SCH',
        description: '4-channel virtual oscilloscope',
        pins: [
            makePin('CH1', 'CH1', '1', PinType.INPUT, -40, -20),
            makePin('CH2', 'CH2', '2', PinType.INPUT, -40, -10),
            makePin('CH3', 'CH3', '3', PinType.INPUT, -40, 10),
            makePin('CH4', 'CH4', '4', PinType.INPUT, -40, 20),
            makePin('GND', 'GND', '5', PinType.GROUND, -40, 40)
        ],
        defaultParams: params2('channels', '4', 'sampleRate', '1MHz'),
        spiceModel: '',
        behaviorModel: 'oscilloscope',
        svgSymbol: 'oscilloscope.svg',
        aiWiringRules: []
    };
    return h322;
}
function makeVirtualMeter(): ComponentDefinition {
    const g322: ComponentDefinition = {
        id: 'VIRTUAL_METER',
        name: 'Virtual Multimeter',
        category: ComponentCategory.INSTRUMENT,
        manufacturer: 'AI-SCH',
        description: 'Virtual multimeter',
        pins: [
            makePin('V', 'V', '1', PinType.INPUT, -30, -10),
            makePin('COM', 'COM', '2', PinType.GROUND, -30, 10)
        ],
        defaultParams: params1('modes', 'V,A,Ω'),
        spiceModel: '',
        behaviorModel: 'multimeter',
        svgSymbol: 'multimeter.svg',
        aiWiringRules: []
    };
    return g322;
}
function makeLogicAnalyzer(): ComponentDefinition {
    const d322: Pin[] = [];
    for (let f322 = 0; f322 < 8; f322++) {
        d322.push(makePin(`CH${f322 + 1}`, `CH${f322 + 1}`, `${f322 + 1}`, PinType.INPUT, -40, -40 + f322 * 10));
    }
    d322.push(makePin('GND', 'GND', '9', PinType.GROUND, -40, 40));
    const e322: ComponentDefinition = {
        id: 'LOGIC_ANALYZER',
        name: 'Logic Analyzer',
        category: ComponentCategory.INSTRUMENT,
        manufacturer: 'AI-SCH',
        description: '8-channel logic analyzer',
        pins: d322,
        defaultParams: params1('channels', '8'),
        spiceModel: '',
        behaviorModel: 'logic_analyzer',
        svgSymbol: 'logic_analyzer.svg',
        aiWiringRules: []
    };
    return e322;
}
function makeUartTerminal(): ComponentDefinition {
    const c322: ComponentDefinition = {
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
    return c322;
}
function genPins(t321: number): Pin[] {
    const u321: Pin[] = [];
    const v321 = Math.ceil(t321 / 2);
    const w321 = Math.floor(t321 / 2);
    const x321 = 10;
    const y321 = Math.max(v321, w321) * x321 / 2;
    for (let b322 = 0; b322 < v321; b322++) {
        u321.push(makePin(`${b322 + 1}`, `${b322 + 1}`, `${b322 + 1}`, PinType.BIDIRECTIONAL, -40, b322 * x321 - y321));
    }
    for (let z321 = 0; z321 < w321; z321++) {
        const a322 = v321 + z321 + 1;
        u321.push(makePin(`${a322}`, `${a322}`, `${a322}`, PinType.BIDIRECTIONAL, 40, z321 * x321 - y321));
    }
    return u321;
}
function genMcuPins(k321: number): Pin[] {
    const l321: Pin[] = [];
    const m321 = Math.ceil(k321 / 2);
    const n321 = Math.floor(k321 / 2);
    const o321 = 10;
    const p321 = Math.max(m321, n321) * o321 / 2;
    for (let s321 = 0; s321 < m321; s321++) {
        l321.push(makePin(`P${s321 + 1}`, `P${s321 + 1}`, `${s321 + 1}`, PinType.BIDIRECTIONAL, -50, s321 * o321 - p321));
    }
    for (let q321 = 0; q321 < n321; q321++) {
        const r321 = m321 + q321 + 1;
        l321.push(makePin(`P${r321}`, `P${r321}`, `${r321}`, PinType.BIDIRECTIONAL, 50, q321 * o321 - p321));
    }
    return l321;
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
            makePin('V+', 'V+', '1', PinType.INPUT, -30, -10),
            makePin('COM', 'COM', '2', PinType.GROUND, -30, 10)
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
