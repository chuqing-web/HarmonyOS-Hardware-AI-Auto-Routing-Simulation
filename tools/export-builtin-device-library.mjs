/**
 * Export BuiltinComponents → DeviceLibrary triplets + index.lib.json, sync to rawfile.
 * Convention: pin_id = DIP number string; pin_label = semantic name (runtime Pin.id).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'DeviceLibrary');
const COMMON = path.join(LIB, 'Common');
const RAW = path.join(ROOT, 'entry/src/main/resources/rawfile/DeviceLibrary');

const T = {
  input: 'input',
  output: 'output',
  bidirectional: 'bidirectional',
  power: 'power',
  power_pos: 'power_pos',
  power_neg: 'power_neg',
  ground: 'ground',
  passive: 'passive',
  analog_in: 'analog_in',
};

function pin(idNum, label, type, x, y, extra = {}) {
  return { pin_id: String(idNum), pin_label: label, pin_type: type, x, y, ...extra };
}

function layoutNamed(defs, bodyX = 50) {
  const pins = [];
  const leftCount = Math.ceil(defs.length / 2);
  const rightCount = Math.floor(defs.length / 2);
  const spacing = 10;
  const bodyHalf = Math.max(leftCount, rightCount) * spacing / 2;
  for (let i = 0; i < leftCount; i++) {
    const d = defs[i];
    pins.push(pin(i + 1, d.id, d.type, -bodyX, i * spacing - bodyHalf));
  }
  for (let i = 0; i < rightCount; i++) {
    const d = defs[leftCount + i];
    const num = leftCount + i + 1;
    pins.push(pin(num, d.id, d.type, bodyX, i * spacing - bodyHalf));
  }
  return pins;
}

const io = (id) => ({ id, type: T.bidirectional });
const inp = (id) => ({ id, type: T.input });
const out = (id) => ({ id, type: T.output });
const pwr = (id) => ({ id, type: T.power });
const gnd = (id) => ({ id, type: T.ground });

function defs8051() {
  const d = [];
  for (let i = 0; i < 8; i++) d.push(io(`P1.${i}`));
  d.push(inp('RST'));
  for (let i = 0; i < 8; i++) d.push(io(`P3.${i}`));
  d.push(io('XTAL2'), io('XTAL1'), gnd('GND'));
  for (let i = 0; i < 8; i++) d.push(io(`P2.${i}`));
  d.push(out('PSEN'), io('ALE'), inp('EA'));
  for (let i = 7; i >= 0; i--) d.push(io(`P0.${i}`));
  d.push(pwr('VCC'));
  return d;
}

function defsStm32_48() {
  const d = [pwr('VDD'), gnd('VSS'), pwr('VDDA'), gnd('VSSA'), inp('BOOT0'), inp('NRST'), io('OSC_IN'), io('OSC_OUT')];
  for (let i = 0; i < 16; i++) d.push(io(`PA${i}`));
  for (let i = 0; i < 16; i++) d.push(io(`PB${i}`));
  for (let i = 0; i < 8; i++) d.push(io(`PC${i}`));
  return d;
}

function defsStm32_100() {
  const d = defsStm32_48().slice();
  for (let i = 0; i < 16; i++) d.push(io(`PD${i}`));
  for (let i = 0; i < 16; i++) d.push(io(`PE${i}`));
  for (let i = 8; i < 16; i++) d.push(io(`PC${i}`));
  for (let i = 0; i < 12; i++) d.push(io(`PF${i}`));
  return d;
}

function defsStm32_32() {
  const d = [pwr('VDD'), gnd('VSS'), inp('NRST'), inp('BOOT0'), io('OSC_IN'), io('OSC_OUT')];
  for (let i = 0; i < 16; i++) d.push(io(`PA${i}`));
  for (let i = 0; i < 10; i++) d.push(io(`PB${i}`));
  return d;
}

function defsLcd1602() {
  return [
    gnd('VSS'), pwr('VDD'), inp('V0'), inp('RS'), inp('RW'), inp('E'),
    io('D0'), io('D1'), io('D2'), io('D3'), io('D4'), io('D5'), io('D6'), io('D7'),
    pwr('A'), gnd('K'),
  ];
}

function defs24C02() {
  return [inp('A0'), inp('A1'), inp('A2'), gnd('VSS'), io('SDA'), inp('SCL'), inp('WP'), pwr('VCC')];
}

function defsW25Q64() {
  return [inp('CS'), out('DO'), inp('WP'), gnd('GND'), inp('DI'), inp('CLK'), inp('HOLD'), pwr('VCC')];
}

function defs2764() {
  const d = [pwr('VPP')];
  for (let i = 0; i < 8; i++) d.push(io(`A${i}`));
  for (let i = 0; i < 8; i++) d.push(io(`D${i}`));
  d.push(gnd('GND'), inp('CE'), inp('OE'));
  for (let i = 8; i < 13; i++) d.push(io(`A${i}`));
  d.push(pwr('VCC'));
  while (d.length < 28) d.push(io(`NC${d.length}`));
  return d.slice(0, 28);
}

function defs62256() {
  const d = [io('A14')];
  for (let i = 0; i < 8; i++) d.push(io(`A${i}`));
  for (let i = 0; i < 8; i++) d.push(io(`D${i}`));
  d.push(gnd('GND'), inp('CE'), inp('OE'));
  for (let i = 8; i < 14; i++) d.push(io(`A${i}`));
  d.push(inp('WE'), pwr('VCC'));
  while (d.length < 28) d.push(io(`NC${d.length}`));
  return d.slice(0, 28);
}

function defsCd4017() {
  return [
    out('Q5'), out('Q1'), out('Q0'), out('Q2'), out('Q6'), out('Q7'), out('Q3'), gnd('VSS'),
    out('Q8'), out('Q4'), out('Q9'), out('CO'), inp('CLK'), inp('EN'), inp('RST'), pwr('VDD'),
  ];
}

function twoPinPassive() {
  return [pin(1, '1', T.passive, -30, 0), pin(2, '2', T.passive, 30, 0)];
}

function commonExists(name) {
  return fs.existsSync(path.join(COMMON, name));
}

/** Prefer device-specific Common SVG, then family fallbacks. */
function resolveSymbol(candidates) {
  for (const c of candidates) {
    if (commonExists(c)) return `../Common/${c}`;
  }
  // deeper dirs (MCU/STM32 → ../../Common)
  return null;
}

function symbolRel(dirDepth, file) {
  const prefix = '../'.repeat(dirDepth);
  return `${prefix}Common/${file}`;
}

function pickSymbol(dirDepth, candidates, fallback) {
  for (const c of candidates) {
    if (commonExists(c)) return symbolRel(dirDepth, c);
  }
  if (fallback && commonExists(fallback)) return symbolRel(dirDepth, fallback);
  // last resort: first candidate path even if missing (loader falls back to generated)
  return symbolRel(dirDepth, candidates[0] || fallback || 'sensor.svg');
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJson(filePath, obj) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

function stubModel(filePath, kind) {
  if (fs.existsSync(filePath)) return;
  ensureDir(path.dirname(filePath));
  const stubs = {
    spice: '* auto-exported stub — behavior from Builtin\n',
    digital: '# auto-exported digital stub\n',
    mcu: '{\n  "core_name": "stub",\n  "note": "auto-exported from Builtin"\n}\n',
    instrument: '# instrument stub\n',
  };
  fs.writeFileSync(filePath, stubs[kind] || stubs.spice, 'utf8');
}

/** @type {Array<object>} */
const devices = [];

function add(dev) {
  devices.push(dev);
}

// ——— Power ———
add({
  id: 'VCC', name: 'VCC 电源', vendor: 'Generic', category: 'power_supply', sub: 'rail',
  dir: 'Power', depth: 1, model: 'vcc', modelType: 'spice', isMcu: false,
  symbols: ['regulator.svg'],
  pins: [pin(1, 'VCC', T.power, 0, 10)],
  params: { voltage: '5V' },
});
add({
  id: 'VEE', name: 'VEE 负电源', vendor: 'Generic', category: 'power_supply', sub: 'rail',
  dir: 'Power', depth: 1, model: 'vee', modelType: 'spice', isMcu: false,
  symbols: ['regulator.svg'],
  pins: [pin(1, 'VEE', T.power_neg, 0, -10)],
  params: { voltage: '-12V' },
});
add({
  id: 'GND', name: 'GND 接地', vendor: 'Generic', category: 'power_supply', sub: 'ground',
  dir: 'Power', depth: 1, model: 'gnd', modelType: 'spice', isMcu: false,
  symbols: ['regulator.svg'],
  pins: [pin(1, 'GND', T.ground, 0, -10)],
  params: {},
});
add({
  id: 'VAC', name: 'VAC 交流电源', vendor: 'Generic', category: 'power_supply', sub: 'ac',
  dir: 'Power', depth: 1, model: 'ac_source', modelType: 'spice', isMcu: false,
  symbols: ['regulator.svg'],
  // PASSIVE：AC- 并 GND 时勿触发电源/地同网误报
  pins: [pin(1, 'AC+', T.passive, -20, 0), pin(2, 'AC-', T.passive, 20, 0)],
  params: { amplitude: '220V', frequency: '50Hz' },
});
add({
  id: 'SIGNAL_GEN', name: '信号发生器', vendor: 'AI-SCH', category: 'instrument', sub: 'signal_gen',
  dir: 'Instrument', depth: 1, model: 'signal_gen', modelType: 'instrument', isMcu: false,
  symbols: ['oscilloscope.svg', 'voltmeter.svg'],
  pins: [pin(1, 'OUT', T.output, -30, 0), pin(2, 'GND', T.ground, 30, 0)],
  params: { waveform: 'sine', amplitude: '1V', frequency: '1kHz', offset: '0V', dutyCycle: '50%' },
});

// ——— Passives ———
for (const v of ['10', '100', '330', '1k', '4.7k', '10k', '47k', '100k']) {
  const id = `R_${v}`;
  add({
    id, name: `Resistor ${v}Ω`, vendor: 'Generic', category: 'passive_resistor', sub: 'tht',
    dir: 'Passive/Resistor', depth: 2, model: 'resistor', modelType: 'spice', isMcu: false,
    symbols: [`${id}.svg`, 'R_1k.svg', 'R_10.svg'],
    pins: twoPinPassive(),
    params: { value: v, tolerance: '5%', power: '0.25W' },
    spiceStub: `R{name} {1} {2} {value}\n`,
  });
}
for (const v of ['1k', '10k', '100k']) {
  add({
    id: `POT_${v}`, name: `滑动变阻器 ${v}Ω`, vendor: 'Generic', category: 'passive_resistor', sub: 'potentiometer',
    dir: 'Passive/Resistor', depth: 2, model: 'potentiometer', modelType: 'spice', isMcu: false,
    symbols: ['switch.svg', 'sensor.svg'],
    pins: [pin(1, '1', T.passive, -30, 0), pin(2, '2', T.passive, 30, 0), pin(3, 'W', T.passive, 0, 28)],
    params: { value: v, wiper: '0.5', power: '0.25W' },
  });
}
for (const v of ['10pF', '100pF', '1nF', '10nF', '100nF', '1uF', '10uF', '100uF']) {
  const id = `C_${v}`;
  add({
    id, name: `Capacitor ${v}`, vendor: 'Generic', category: 'passive_capacitor', sub: 'tht',
    dir: 'Passive/Capacitor', depth: 2, model: 'capacitor', modelType: 'spice', isMcu: false,
    symbols: [`${id}.svg`, 'capacitor.svg'],
    pins: twoPinPassive(),
    params: { value: v, voltage: '50V' },
    spiceStub: `C{name} {1} {2} {value}\n`,
  });
}
add({
  id: 'L_10uH', name: 'Inductor 10uH', vendor: 'Generic', category: 'passive_inductor', sub: 'tht',
  dir: 'Passive/Inductor', depth: 2, model: 'inductor', modelType: 'spice', isMcu: false,
  symbols: ['L_10uH.svg', 'inductor.svg'],
  pins: twoPinPassive(),
  params: { value: '10uH', current: '1A' },
});
for (const [id, name, freq, load] of [
  ['XTAL_11M', 'Crystal 11.0592MHz', '11.0592MHz', '30pF'],
  ['XTAL_8M', 'Crystal 8MHz', '8MHz', '20pF'],
]) {
  add({
    id, name, vendor: 'Generic', category: 'passive_crystal', sub: 'hc49',
    dir: 'Passive/Crystal', depth: 2, model: 'crystal', modelType: 'spice', isMcu: false,
    symbols: [`${id}.svg`, 'crystal.svg'],
    pins: twoPinPassive(),
    params: { frequency: freq, loadCap: load },
  });
}
add({
  id: 'FUSE_1A', name: 'Fuse 1A', vendor: 'Generic', category: 'passive_fuse', sub: 'fuse',
  dir: 'Passive/Fuse', depth: 2, model: 'fuse', modelType: 'spice', isMcu: false,
  symbols: ['FUSE_1A.svg', 'fuse.svg'],
  pins: twoPinPassive(),
  params: { rating: '1A' },
});

// ——— Discretes ———
for (const [id, desc] of [['1N4148', 'Signal Diode'], ['1N4007', 'Rectifier Diode'], ['1N5819', 'Schottky Diode']]) {
  add({
    id, name: id, vendor: 'Generic', category: 'discrete_diode', sub: 'diode',
    dir: 'Discrete/Diode', depth: 2, model: 'diode', modelType: 'spice', isMcu: false,
    symbols: ['diode.svg'],
    pins: [pin(1, 'A', T.passive, -30, 0), pin(2, 'K', T.passive, 30, 0)],
    params: { type: 'signal' },
  });
}
for (const [id, name, color] of [['LED_RED', 'Red LED', 'red'], ['LED_GREEN', 'Green LED', 'green'], ['LED_BLUE', 'Blue LED', 'blue']]) {
  add({
    id, name, vendor: 'Generic', category: 'discrete_led', sub: 'led',
    dir: 'Discrete/LED', depth: 2, model: 'led', modelType: 'spice', isMcu: false,
    symbols: ['led.svg'],
    pins: [pin(1, 'A', T.passive, -30, 0), pin(2, 'K', T.passive, 30, 0)],
    params: { color, forwardVoltage: '2.0V', litVf: '1.2', litVkMax: '0.9', litImA: '0.5' },
  });
}
for (const [id, name, type] of [['2N2222', 'NPN Transistor', 'npn'], ['2N2907', 'PNP Transistor', 'pnp']]) {
  add({
    id, name, vendor: 'Generic', category: 'discrete_bjt', sub: type,
    dir: 'Discrete/Transistor', depth: 2, model: type, modelType: 'spice', isMcu: false,
    symbols: ['transistor.svg'],
    pins: [pin(1, 'B', T.input, -30, 0), pin(2, 'C', T.output, 30, -20), pin(3, 'E', T.passive, 30, 20)],
    params: { type },
  });
}
for (const [id, name, type] of [['2N7000', 'N-MOSFET', 'nmos'], ['IRF540', 'N-MOSFET Power', 'nmos']]) {
  add({
    id, name, vendor: 'Generic', category: 'discrete_mosfet', sub: type,
    dir: 'Discrete/Mosfet', depth: 2, model: type, modelType: 'spice', isMcu: false,
    symbols: ['mosfet.svg'],
    pins: [pin(1, 'G', T.input, -30, 0), pin(2, 'D', T.output, 30, -10), pin(3, 'S', T.passive, 30, 10)],
    params: { type },
  });
}

// ——— Analog IC ———
add({
  id: 'UA741', name: 'UA741 Op-Amp', vendor: 'Generic', category: 'analog_opamp', sub: 'single',
  dir: 'AnalogIC', depth: 1, model: 'opamp', modelType: 'opamp', isMcu: false,
  symbols: ['opamp.svg'],
  pins: [
    pin(3, 'IN+', T.input, -30, -10), pin(2, 'IN-', T.input, -30, 10), pin(6, 'OUT', T.output, 30, 0),
    pin(7, 'VCC', T.power, 0, -40), pin(4, 'VEE', T.ground, 0, 40),
  ],
  params: { gain: '100dB' },
});
for (const id of ['LM358', 'TL082']) {
  add({
    id,
    name: id === 'LM358' ? 'LM358 双路通用运算放大器' : 'TL082 JFET Op-Amp',
    vendor: id === 'LM358' ? 'TI' : 'Generic',
    category: 'analog_opamp', sub: 'dual_opamp',
    dir: 'AnalogIC', depth: 1, model: 'opamp', modelType: 'opamp', isMcu: false,
    symbols: ['opamp.svg'],
    pins: [
      pin(1, 'OUT1', T.output, 50, -30),
      pin(2, 'IN-1', T.input, -50, -20),
      pin(3, 'IN+1', T.input, -50, -40),
      pin(4, 'V-', T.power_neg, 0, 50),
      pin(5, 'IN+2', T.input, -50, 20),
      pin(6, 'IN-2', T.input, -50, 40),
      pin(7, 'OUT2', T.output, 50, 30),
      pin(8, 'V+', T.power_pos, 0, -50),
    ],
    params: id === 'LM358' ? { supply_voltage: '12V' } : { gain: '100dB' },
    extra: id === 'LM358' ? {
      param_limit: { supply_min: '3V', supply_max: '32V' },
      erc_check_rules: ['power_pin_unconnected'],
      ai_route_constraint: { is_analog_component: true, priority: 'high' },
    } : {},
  });
}
add({
  id: 'LM555', name: 'LM555 Timer', vendor: 'TI', category: 'analog_ic', sub: 'timer',
  dir: 'AnalogIC', depth: 1, model: 'timer555', modelType: 'spice', isMcu: false,
  symbols: ['timer555.svg'],
  pins: [
    pin(1, 'GND', T.ground, -40, -30), pin(2, 'TRIG', T.input, -40, -10),
    pin(3, 'OUT', T.output, -40, 10), pin(4, 'RESET', T.input, -40, 30),
    pin(5, 'CTRL', T.input, 40, 30), pin(6, 'THRES', T.input, 40, 10),
    pin(7, 'DISCH', T.bidirectional, 40, -10), pin(8, 'VCC', T.power, 40, -30),
  ],
  params: {},
});
for (const [id, name, outV] of [
  ['LM7805', '5V Regulator', '5V'],
  ['LM7812', '12V Regulator', '12V'],
  ['AMS1117_3V3', '3.3V LDO', '3.3V'],
]) {
  add({
    id, name, vendor: 'Generic', category: 'analog_regulator', sub: 'ldo',
    dir: 'AnalogIC', depth: 1, model: 'regulator', modelType: 'spice', isMcu: false,
    symbols: ['regulator.svg'],
    // Builtin id is "1"/"2"/"3"; name IN/GND/OUT — keep numeric ids for template wire sync
    pins: [
      pin(1, '1', T.input, -40, 0),
      pin(2, '2', T.ground, 0, 40),
      pin(3, '3', T.output, 40, 0),
    ],
    params: { output: outV },
  });
}
add({
  id: 'LM2596', name: 'Buck Converter', vendor: 'Generic', category: 'analog_regulator', sub: 'buck',
  dir: 'AnalogIC', depth: 1, model: 'regulator', modelType: 'spice', isMcu: false,
  symbols: ['regulator.svg'],
  pins: [
    pin(1, 'VIN', T.power, -40, -20), pin(2, 'OUT', T.output, 40, -20),
    pin(3, 'GND', T.ground, 0, 40), pin(4, 'FB', T.input, 40, 10), pin(5, 'ON', T.input, -40, 10),
  ],
  params: { output: '5V' },
});

// ——— Digital ———
const gates = [
  ['00', 'NAND', 'gate_nand.svg'],
  ['02', 'NOR', 'gate_nor.svg'],
  ['04', 'NOT', 'gate_not.svg'],
  ['08', 'AND', 'gate_and.svg'],
  ['32', 'OR', 'gate_or.svg'],
  ['74', 'XOR', 'gate_xor.svg'],
];
for (const [num, type, svg] of gates) {
  const id = `74HC${num}`;
  const pins = type === 'NOT'
    ? [pin(1, 'A', T.input, -40, 0), pin(2, 'Y', T.output, 40, 0), pin(7, 'GND', T.ground, 0, 40), pin(14, 'VCC', T.power, 0, -40)]
    : [
      pin(1, 'A', T.input, -40, -10), pin(2, 'B', T.input, -40, 10), pin(3, 'Y', T.output, 40, 0),
      pin(7, 'GND', T.ground, 0, 40), pin(14, 'VCC', T.power, 0, -40),
    ];
  add({
    id, name: `74HC${num} ${type}`, vendor: 'TI', category: 'digital_logic', sub: 'hc_series',
    dir: 'DigitalLogic', depth: 1, model: `74hc_${type.toLowerCase()}`, modelType: 'digital', isMcu: false,
    symbols: [svg],
    pins,
    params: { family: 'HC' },
    extra: { erc_check_rules: ['power_pin_unconnected'] },
  });
}
add({
  id: 'CD4017', name: 'CD4017 Decade Counter', vendor: 'TI', category: 'digital_logic', sub: 'counter',
  dir: 'DigitalLogic', depth: 1, model: 'cd4017', modelType: 'digital', isMcu: false,
  symbols: ['cd4017.svg'],
  pins: layoutNamed(defsCd4017(), 40),
  params: { family: '4000' },
});

// ——— Memory ———
add({
  id: '2764', name: 'EPROM 8Kx8', vendor: 'Generic', category: 'memory', sub: 'eprom',
  dir: 'Memory', depth: 1, model: 'mem_2764', modelType: 'digital', isMcu: false,
  symbols: ['memory.svg'], pins: layoutNamed(defs2764(), 40), params: {},
});
add({
  id: '62256', name: 'SRAM 32Kx8', vendor: 'Generic', category: 'memory', sub: 'sram',
  dir: 'Memory', depth: 1, model: 'mem_62256', modelType: 'digital', isMcu: false,
  symbols: ['memory.svg'], pins: layoutNamed(defs62256(), 40), params: {},
});
add({
  id: '24C02', name: 'I2C EEPROM 256B', vendor: 'Generic', category: 'memory', sub: 'eeprom',
  dir: 'Memory', depth: 1, model: 'mem_24c02', modelType: 'digital', isMcu: false,
  symbols: ['memory.svg'], pins: layoutNamed(defs24C02(), 40), params: {},
});
add({
  id: 'W25Q64', name: 'SPI Flash 64Mbit', vendor: 'Generic', category: 'memory', sub: 'flash',
  dir: 'Memory', depth: 1, model: 'mem_w25q64', modelType: 'digital', isMcu: false,
  symbols: ['memory.svg'], pins: layoutNamed(defsW25Q64(), 40), params: {},
});

// ——— MCU ———
for (const id of ['AT89C51', 'AT89C52', 'STC89C52', 'STC15W408AS']) {
  add({
    id, name: id, vendor: id.startsWith('STC') ? 'STC' : 'Atmel',
    category: 'mcu_8051', sub: 'mcs51',
    dir: 'MCU/8051', depth: 2, model: '8051_behavioral', modelType: 'mcu_51', isMcu: true,
    symbols: ['mcu_8051.svg'],
    pins: layoutNamed(defs8051(), 50),
    params: { clock: '11.0592MHz' },
  });
}
const stm32s = [
  ['STM32F103C8', '72MHz', defsStm32_48],
  ['STM32F103RC', '72MHz', defsStm32_48],
  ['STM32F407VG', '168MHz', defsStm32_100],
  ['STM32L431CB', '72MHz', defsStm32_48],
  ['STM32F030F4', '48MHz', defsStm32_32],
];
for (const [id, clock, defsFn] of stm32s) {
  add({
    id, name: id, vendor: 'STMicroelectronics', category: 'mcu_stm32', sub: 'teaching',
    dir: 'MCU/STM32', depth: 2, model: 'stm32_behavioral', modelType: 'mcu_stm32', isMcu: true,
    symbols: ['mcu_stm32.svg'],
    pins: layoutNamed(defsFn(), 50),
    params: { clock },
  });
}

// ——— Peripheral / Sensor ———
add({
  id: 'SW_PUSH', name: 'Push Button', vendor: 'Generic', category: 'peripheral', sub: 'switch',
  dir: 'Peripheral', depth: 1, model: 'switch', modelType: 'spice', isMcu: false,
  symbols: ['SW_PUSH.svg', 'switch.svg'],
  pins: twoPinPassive(),
  params: { type: 'momentary', pressed: '0' },
});
add({
  id: 'RELAY_SPDT', name: 'SPDT Relay', vendor: 'Generic', category: 'peripheral', sub: 'relay',
  dir: 'Peripheral', depth: 1, model: 'relay_spdt', modelType: 'spice', isMcu: false,
  symbols: ['RELAY_SPDT.svg', 'relay.svg'],
  pins: [
    pin(1, '1', T.passive, -30, -10), pin(2, '2', T.passive, 30, -10),
    pin(3, 'COM', T.passive, 0, 20), pin(4, 'NO', T.passive, 20, 20), pin(5, 'NC', T.passive, -20, 20),
  ],
  params: { coilVoltage: '5V' },
});
add({
  id: 'BUZZER', name: 'Buzzer', vendor: 'Generic', category: 'peripheral', sub: 'buzzer',
  dir: 'Peripheral', depth: 1, model: 'buzzer', modelType: 'spice', isMcu: false,
  symbols: ['buzzer.svg'],
  pins: twoPinPassive(),
  params: { voltage: '5V' },
});
add({
  id: 'LCD1602', name: 'LCD1602', vendor: 'Generic', category: 'peripheral', sub: 'display',
  dir: 'Peripheral', depth: 1, model: 'lcd1602', modelType: 'digital', isMcu: false,
  symbols: ['lcd1602.svg'],
  pins: layoutNamed(defsLcd1602(), 40),
  params: { interface: 'parallel' },
});
add({
  id: 'OLED_12864', name: 'OLED 128x64', vendor: 'Generic', category: 'peripheral', sub: 'display',
  dir: 'Peripheral', depth: 1, model: 'oled', modelType: 'digital', isMcu: false,
  symbols: ['oled.svg'],
  pins: [
    pin(1, 'VCC', T.power, -30, -10), pin(2, 'GND', T.ground, -30, 10),
    pin(3, 'SDA', T.bidirectional, 30, -10), pin(4, 'SCL', T.input, 30, 10),
  ],
  params: { interface: 'I2C' },
});
add({
  id: 'DS18B20', name: 'DS18B20 Temperature', vendor: 'Maxim', category: 'sensor', sub: 'temp',
  dir: 'Sensor', depth: 1, model: 'ds18b20', modelType: 'spice', isMcu: false,
  symbols: ['DS18B20.svg', 'sensor.svg'],
  pins: [
    pin(1, 'GND', T.ground, -30, 0), pin(2, 'DQ', T.bidirectional, 0, 28), pin(3, 'VDD', T.power, 30, 0),
  ],
  params: { range: '-55~125°C', interface: '1-Wire', temp_c: '25' },
});
add({
  id: 'HALL_SENSOR', name: 'Hall Sensor', vendor: 'Generic', category: 'sensor', sub: 'hall',
  dir: 'Sensor', depth: 1, model: 'hall', modelType: 'spice', isMcu: false,
  symbols: ['HALL_SENSOR.svg', 'sensor.svg'],
  pins: [
    pin(1, 'VCC', T.power, -30, -10), pin(2, 'OUT', T.output, 30, 0), pin(3, 'GND', T.ground, -30, 10),
  ],
  params: { type: 'digital', active: '0' },
});
add({
  id: 'LDR', name: 'Photoresistor', vendor: 'Generic', category: 'sensor', sub: 'light',
  dir: 'Sensor', depth: 1, model: 'ldr', modelType: 'spice', isMcu: false,
  symbols: ['LDR.svg', 'sensor.svg'],
  pins: twoPinPassive(),
  params: { type: 'analog', value: '50k' },
});

// ——— Instruments ———
add({
  id: 'OSCILLOSCOPE', name: '虚拟四通道示波器', vendor: 'AI-SCH', category: 'instrument', sub: 'oscilloscope',
  dir: 'Instrument', depth: 1, model: 'oscilloscope', modelType: 'instrument', isMcu: false,
  symbols: ['oscilloscope.svg'],
  pins: [
    pin(1, 'CH1', T.analog_in, -40, -30), pin(2, 'CH2', T.analog_in, -40, -10),
    pin(3, 'CH3', T.analog_in, -40, 10), pin(4, 'CH4', T.analog_in, -40, 30),
    pin(5, 'GND', T.ground, -40, 50),
  ],
  params: { channels: '4', sample_rate: '1MHz', time_div: '1ms' },
});
add({
  id: 'VIRTUAL_METER', name: 'Virtual Multimeter', vendor: 'AI-SCH', category: 'instrument', sub: 'multimeter',
  dir: 'Instrument', depth: 1, model: 'multimeter', modelType: 'instrument', isMcu: false,
  symbols: ['multimeter.svg'],
  pins: [
    pin(1, 'V', T.input, -30, -30), pin(2, 'A', T.input, -30, -10),
    pin(3, 'OHM', T.input, -30, 10), pin(4, 'COM', T.ground, -30, 30),
  ],
  params: { modes: 'DCV,ACV,OHM,AMP,DIODE' },
});
{
  const pins = [];
  for (let i = 0; i < 8; i++) pins.push(pin(i + 1, `CH${i + 1}`, T.input, -40, -40 + i * 10));
  pins.push(pin(9, 'GND', T.ground, -40, 40));
  add({
    id: 'LOGIC_ANALYZER', name: 'Logic Analyzer', vendor: 'AI-SCH', category: 'instrument', sub: 'logic',
    dir: 'Instrument', depth: 1, model: 'logic_analyzer', modelType: 'instrument', isMcu: false,
    symbols: ['logic_analyzer.svg'],
    pins, params: { channels: '8' },
  });
}
add({
  id: 'UART_TERMINAL', name: 'UART Virtual Terminal', vendor: 'AI-SCH', category: 'instrument', sub: 'uart',
  dir: 'Instrument', depth: 1, model: 'uart_terminal', modelType: 'instrument', isMcu: false,
  symbols: ['uart_terminal.svg'],
  pins: [
    pin(1, 'TX', T.input, -40, -10), pin(2, 'RX', T.output, -40, 10), pin(3, 'GND', T.ground, -40, 30),
  ],
  params: { baudRate: '9600' },
});
add({
  id: 'VOLTMETER_DC', name: 'DC 电压表', vendor: 'AI-SCH', category: 'instrument', sub: 'voltmeter',
  dir: 'Instrument', depth: 1, model: 'voltmeter_dc', modelType: 'instrument', isMcu: false,
  symbols: ['voltmeter.svg'],
  pins: [pin(1, 'V+', T.input, -30, -25), pin(2, 'COM', T.ground, -30, 25)],
  params: { type: 'dc', range: '20V' },
});
add({
  id: 'AMMETER_DC', name: 'DC 电流表', vendor: 'AI-SCH', category: 'instrument', sub: 'ammeter',
  dir: 'Instrument', depth: 1, model: 'ammeter_dc', modelType: 'instrument', isMcu: false,
  symbols: ['ammeter.svg'],
  pins: [pin(1, 'I+', T.input, -40, 0), pin(2, 'I-', T.output, 40, 0)],
  params: { type: 'dc', range: '200mA' },
});
add({
  id: 'POWER_METER', name: '功率表', vendor: 'AI-SCH', category: 'instrument', sub: 'power',
  dir: 'Instrument', depth: 1, model: 'power_meter', modelType: 'instrument', isMcu: false,
  symbols: ['power_meter.svg'],
  pins: [
    pin(1, 'V+', T.input, -40, -20), pin(2, 'V-', T.input, -40, 0),
    pin(3, 'I+', T.input, -40, 20), pin(4, 'I-', T.output, -40, 40),
  ],
  params: { range: '1000V/10A' },
});
add({
  id: 'FREQ_COUNTER', name: '频率计', vendor: 'AI-SCH', category: 'instrument', sub: 'freq',
  dir: 'Instrument', depth: 1, model: 'freq_counter', modelType: 'instrument', isMcu: false,
  symbols: ['freq_counter.svg'],
  pins: [pin(1, 'IN', T.input, -30, -10), pin(2, 'GND', T.ground, -30, 10)],
  params: { gateTime: '1s', range: '10MHz' },
});

// Ensure missing Common symbols that Builtin expects
function ensureCommonCopies() {
  const copies = [
    ['R_1k.svg', 'R_10k.svg'], // Builtin R_10k; Common lacked it
  ];
  for (const [src, dst] of copies) {
    const from = path.join(COMMON, src);
    const to = path.join(COMMON, dst);
    if (fs.existsSync(from) && !fs.existsSync(to)) {
      fs.copyFileSync(from, to);
      console.log(`Common: copied ${src} → ${dst}`);
    }
  }
}

function modelExt(modelType) {
  if (modelType === 'digital') return 'model.digital';
  if (modelType === 'mcu_51' || modelType === 'mcu_stm32') return 'model.mcu';
  if (modelType === 'instrument') return 'model.txt';
  if (modelType === 'opamp') return 'model.spice';
  return 'model.spice';
}

function modelKind(modelType) {
  if (modelType === 'digital') return 'digital';
  if (modelType === 'mcu_51' || modelType === 'mcu_stm32') return 'mcu';
  if (modelType === 'instrument') return 'instrument';
  return 'spice';
}

function exportAll() {
  ensureCommonCopies();
  const indexDevices = [];
  const now = new Date().toISOString();

  for (const d of devices) {
    const metaDir = path.join(LIB, d.dir);
    ensureDir(metaDir);
    const symbolFile = pickSymbol(d.depth, d.symbols, d.symbols[d.symbols.length - 1]);

    const modelFile = `${d.id}.${modelExt(d.modelType)}`;
    const modelPath = path.join(metaDir, modelFile);
    // Keep existing rich models (LM358.model.spice, STM32F1.model.mcu shared, etc.)
    const existingSpice = path.join(metaDir, `${d.id}.model.spice`);
    const existingDigital = path.join(metaDir, `${d.id}.model.digital`);
    let simModelFile = modelFile;
    if (fs.existsSync(existingSpice)) {
      simModelFile = `${d.id}.model.spice`;
    } else if (fs.existsSync(existingDigital)) {
      simModelFile = `${d.id}.model.digital`;
    } else if (d.id.startsWith('STM32') && fs.existsSync(path.join(metaDir, 'STM32F1.model.mcu'))) {
      simModelFile = 'STM32F1.model.mcu';
    } else {
      if (d.spiceStub) {
        fs.writeFileSync(modelPath, d.spiceStub, 'utf8');
      } else {
        stubModel(modelPath, modelKind(d.modelType));
      }
    }

    const meta = {
      lib_dev_id: d.id,
      name: d.name,
      vendor: d.vendor,
      category: d.category,
      sub_category: d.sub,
      symbol_file: symbolFile,
      sim_model_file: simModelFile,
      model_type: d.modelType,
      is_mcu: d.isMcu,
      is_custom: false,
      pin_list: d.pins,
      default_params: d.params || {},
      ...(d.extra || {}),
    };
    writeJson(path.join(metaDir, `${d.id}.meta.json`), meta);

    const metaPath = `${d.dir.replace(/\\/g, '/')}/${d.id}.meta.json`;
    indexDevices.push({
      lib_dev_id: d.id,
      name: d.name,
      category: d.category,
      sub_category: d.sub,
      meta_path: metaPath,
      is_custom: false,
    });
  }

  // Preserve detailed LQFP48 STM32F103C8T6 (not in Builtin teaching list)
  const c8t6Meta = path.join(LIB, 'MCU/STM32/STM32F103C8T6.meta.json');
  if (fs.existsSync(c8t6Meta)) {
    const existing = JSON.parse(fs.readFileSync(c8t6Meta, 'utf8'));
    // Normalize any legacy if needed — keep as-is if already numeric pin_id
    indexDevices.push({
      lib_dev_id: 'STM32F103C8T6',
      name: existing.name || 'STM32F103C8T6 Cortex-M3',
      category: existing.category || 'mcu_stm32',
      sub_category: existing.sub_category || 'f103',
      meta_path: 'MCU/STM32/STM32F103C8T6.meta.json',
      is_custom: false,
    });
  }

  indexDevices.sort((a, b) => a.lib_dev_id.localeCompare(b.lib_dev_id));
  const index = {
    version: '2.0.0',
    generated_at: now,
    total_count: indexDevices.length,
    devices: indexDevices,
  };
  writeJson(path.join(LIB, 'index.lib.json'), index);
  console.log(`Exported ${indexDevices.length} devices → DeviceLibrary/index.lib.json`);
  return indexDevices.length;
}

function copyDir(src, dest) {
  ensureDir(dest);
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function syncRawfile() {
  // Replace rawfile DeviceLibrary with source (preserve nothing stale)
  if (fs.existsSync(RAW)) {
    fs.rmSync(RAW, { recursive: true, force: true });
  }
  copyDir(LIB, RAW);
  console.log(`Synced → ${RAW}`);
}

const count = exportAll();
syncRawfile();
console.log(`Done. total=${count}`);
