const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const metaDir = path.join(root, 'DeviceLibrary');

const metaPins = {};
function walkMeta(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkMeta(p);
    else if (ent.name.endsWith('.meta.json')) {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      metaPins[j.lib_dev_id] = {
        pins: (j.pin_list || []).map(x => x.pin_id),
        file: p.replace(/\\/g, '/')
      };
    }
  }
}
walkMeta(metaDir);

const bcPath = path.join(root, 'features/component_library/src/main/ets/data/BuiltinComponents.ets');
const bc = fs.readFileSync(bcPath, 'utf8');
const namedPinsPath = path.join(root, 'features/component_library/src/main/ets/data/NamedDevicePins.ets');
const namedPins = fs.readFileSync(namedPinsPath, 'utf8');

const builtinPins = {};

function extractMakePins(body) {
  return [...body.matchAll(/makePin\(\s*['"]([^'"]+)['"]/g)].map(x => x[1]);
}

const funcRegex = /(?:function|static)\s+(make[A-Za-z0-9_]+|ic[A-Za-z0-9_]+|twoPin|diode|led|transistor|mosfet|memChip|icOpAmp|ic555|icRegulator|makePotentiometer)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g;
let m;
while ((m = funcRegex.exec(bc)) !== null) {
  const pins = extractMakePins(m[2]);
  if (pins.length) builtinPins['__fn__' + m[1]] = pins;
}

// twoPin/diode/led etc inline calls
const inlineCalls = [...bc.matchAll(/(?:twoPin|diode|led|transistor|mosfet|memChip|icOpAmp|icRegulator|makePotentiometer)\(\s*['`]([^'"`]+)['`]/g)];
for (const sm of inlineCalls) {
  const line = bc.substring(Math.max(0, sm.index - 200), sm.index + 200);
  let fn = 'twoPin';
  if (line.includes('diode(')) fn = 'diode';
  else if (line.includes('led(')) fn = 'led';
  else if (line.includes('transistor(')) fn = 'transistor';
  else if (line.includes('mosfet(')) fn = 'mosfet';
  else if (line.includes('memChip(')) fn = 'memChip';
  else if (line.includes('icOpAmp(')) fn = 'icOpAmp';
  else if (line.includes('icRegulator(')) fn = 'icRegulator';
  else if (line.includes('makePotentiometer(')) fn = 'makePotentiometer';
  const devId = sm[1];
  if (fn === 'icOpAmp') {
    builtinPins[devId] = extractMakePins(bc.match(/function icOpAmp[\s\S]*?\n\}/)[0]);
  } else if (fn === 'icRegulator' && devId === 'LM2596') {
    // from NamedDevicePins
    const block = namedPins.match(/export function pinsLm2596[\s\S]*?\n\}/);
    if (block) builtinPins[devId] = extractMakePins(block[0]);
  } else if (fn === 'memChip') {
    const pinCount = parseInt(line.match(/,\s*(\d+)\s*\)/)?.[1] || '0');
    if (devId === '24C02') {
      const block = namedPins.match(/export function pins24C02[\s\S]*?\n\}/);
      if (block) builtinPins[devId] = extractMakePins(block[0]);
    } else if (devId === 'W25Q64') {
      const block = namedPins.match(/export function pinsW25Q64[\s\S]*?\n\}/);
      if (block) builtinPins[devId] = extractMakePins(block[0]);
    } else if (devId === '2764' || devId === '62256') {
      builtinPins[devId] = Array.from({ length: pinCount }, (_, i) => String(i + 1));
    }
  } else if (fn === 'makePotentiometer') {
    builtinPins[devId] = builtinPins['__fn__makePotentiometer'] || ['1', '2', 'W'];
  } else if (builtinPins['__fn__' + fn]) {
    builtinPins[devId] = builtinPins['__fn__' + fn];
  }
}

// Explicit device builders
const explicitFns = [
  ['makePowerSupplies', ['VCC', 'VEE', 'GND', 'VAC', 'SIGNAL_GEN']],
  ['makeRelaySpdt', ['RELAY_SPDT']],
  ['makeOscilloscope', ['OSCILLOSCOPE']],
  ['makeVirtualMeter', ['VIRTUAL_METER']],
  ['makeLogicAnalyzer', ['LOGIC_ANALYZER']],
  ['makeUartTerminal', ['UART_TERMINAL']],
  ['makeVoltmeter', ['VOLTMETER_DC']],
  ['makeAmmeter', ['AMMETER_DC']],
  ['makePowerMeter', ['POWER_METER']],
  ['makeFrequencyCounter', ['FREQ_COUNTER']],
  ['makeLcd1602', ['LCD1602']],
  ['makeOled12864', ['OLED_12864']],
  ['makeCd4017', ['CD4017']],
  ['ic555', ['LM555']],
  ['make8051Mcu', null],
  ['makeStm32Mcu', null],
];

for (const [fnName, ids] of explicitFns) {
  const fnMatch = bc.match(new RegExp(`function ${fnName}[\\s\\S]*?\\n\\}`));
  if (!fnMatch) continue;
  const pins = extractMakePins(fnMatch[0]);
  if (ids) {
    for (const id of ids) builtinPins[id] = pins;
  }
}

// 8051/STM32 MCUs
const m8051 = bc.match(/function make8051Mcu[\s\S]*?\n\}/);
const mStm = bc.match(/function makeStm32Mcu[\s\S]*?\n\}/);
const ids8051 = ['AT89C51', 'AT89C52', 'STC89C52', 'STC15W408AS'];
const idsStm = ['STM32F103C8', 'STM32F103RC', 'STM32F407VG', 'STM32L431CB', 'STM32F030F4', 'STM32F103C8T6'];
if (m8051) {
  const pins8051 = extractMakePins(namedPins.match(/export function pins8051Dip40[\s\S]*?\n\}/)[0]);
  for (const id of ids8051) builtinPins[id] = pins8051;
}
if (mStm) {
  for (const id of idsStm) {
    if (id.includes('F407')) {
      builtinPins[id] = extractMakePins(namedPins.match(/export function pinsStm32Teaching100[\s\S]*?\n\}/)[0]);
    } else if (id.includes('F030')) {
      builtinPins[id] = extractMakePins(namedPins.match(/export function pinsStm32Teaching32[\s\S]*?\n\}/)[0]);
    } else {
      builtinPins[id] = extractMakePins(namedPins.match(/export function pinsStm32Teaching48[\s\S]*?\n\}/)[0]);
    }
  }
}

// LM358/TL082 dual opamp
const dualBlock = bc.match(/function icDualOpAmp[\s\S]*?\n\}/);
if (dualBlock) {
  const pins = extractMakePins(dualBlock[0]);
  builtinPins['LM358'] = pins;
  builtinPins['TL082'] = pins;
}

// DS18B20, HALL from makeSensors inline
const dsBlock = bc.match(/id: 'DS18B20'[\s\S]*?pins: \[([\s\S]*?)\]/);
if (dsBlock) builtinPins['DS18B20'] = extractMakePins(dsBlock[0]);
const hallBlock = bc.match(/id: 'HALL_SENSOR'[\s\S]*?pins: \[([\s\S]*?)\]/);
if (hallBlock) builtinPins['HALL_SENSOR'] = extractMakePins(hallBlock[0]);

// Digital gates
for (const num of ['00', '02', '04', '08', '32', '74']) {
  const gateMatch = bc.match(new RegExp(`function makeDigitalGate[\\s\\S]*?num === '${num}'[\\s\\S]*?\\n\\}`));
}
const gateFn = bc.match(/function makeDigitalGate[\s\S]*?\n\}/);
if (gateFn) {
  const pins04 = extractMakePins(gateFn[0].split("num === '04'")[1] || gateFn[0]);
  const pinsOther = extractMakePins(gateFn[0].split('else')[1] || gateFn[0]);
  for (const id of ['74HC00', '74HC02', '74HC08', '74HC32', '74HC74']) {
    builtinPins[id] = id === '74HC04' ? pins04 : pinsOther;
  }
  builtinPins['74HC04'] = pins04;
}

// CD4017 from NamedDevicePins
const cd4017 = namedPins.match(/export function pinsCd4017[\s\S]*?\n\}/);
if (cd4017) builtinPins['CD4017'] = extractMakePins(cd4017[0]);

// Kit logic - mirror TemplateSchematicKit
function kitCommonPinIds(libraryId) {
  if (libraryId === 'VCC') return ['1', 'VCC'];
  if (libraryId === 'GND') return ['1', 'GND'];
  if (libraryId === 'AMMETER_DC') return ['I+', 'I-'];
  if (libraryId === 'VOLTMETER_DC') return ['V+', 'COM'];
  if (libraryId === 'VIRTUAL_METER') return ['V', 'A', 'OHM', 'COM'];
  if (libraryId === 'VAC') return ['1', '2'];
  if (/^(R_|C_|L_|FUSE_|XTAL_|POT_|SW_)/.test(libraryId)) return ['1', '2'];
  if (/^LED_/.test(libraryId) || libraryId.includes('DIODE') || /^1N/.test(libraryId)) return ['A', 'K', '1', '2'];
  if (['UA741', 'LM741', 'TL081', 'TL071'].includes(libraryId)) return ['IN+', 'IN-', 'OUT', 'VCC', 'VEE', '3', '2', '6', '7', '4'];
  if (libraryId === 'OSCILLOSCOPE') return ['CH1', 'CH2', 'CH3', 'CH4', 'GND', '1', '2', '3', '4', '5'];
  return [];
}

function canon555(id, name) {
  const tryCanon = raw => {
    const u = raw.trim().toUpperCase();
    const m = { '1': 'GND', '2': 'TRIG', '3': 'OUT', '4': 'RESET', '5': 'CTRL', '6': 'THRES', '7': 'DISCH', '8': 'VCC' };
    return m[u] || (['GND', 'TRIG', 'OUT', 'RESET', 'CTRL', 'THRES', 'DISCH', 'VCC'].includes(u) ? u : '');
  };
  return tryCanon(id) || tryCanon(name);
}
function canonDual(id, name) {
  const tryCanon = raw => {
    const u = raw.trim().toUpperCase();
    const m = { '1': 'OUT1', '2': 'IN-1', '3': 'IN+1', '4': 'V-', '5': 'IN+2', '6': 'IN-2', '7': 'OUT2', '8': 'V+' };
    return m[u] || '';
  };
  return tryCanon(id) || tryCanon(name);
}
function canonReg(id, name) {
  const tryCanon = raw => {
    const u = raw.trim().toUpperCase();
    if (['1', 'IN', 'VIN', 'INPUT'].includes(u)) return '1';
    if (['2', 'GND', 'GROUND', 'ADJ'].includes(u)) return '2';
    if (['3', 'OUT', 'VOUT', 'OUTPUT'].includes(u)) return '3';
    return '';
  };
  return tryCanon(id) || tryCanon(name);
}
function canonUa741(id, name) {
  const tryCanon = raw => {
    const u = raw.trim().toUpperCase();
    if (['3', 'IN+', '+IN', 'INP', 'NONINV'].includes(u)) return 'IN+';
    if (['2', 'IN-', '-IN', 'INN', 'INV'].includes(u)) return 'IN-';
    if (['6', 'OUT', 'OUTPUT'].includes(u)) return 'OUT';
    if (['7', 'VCC', 'V+', 'VDD'].includes(u)) return 'VCC';
    if (['4', 'VEE', 'V-', 'VSS'].includes(u)) return 'VEE';
    return '';
  };
  return tryCanon(id) || tryCanon(name);
}
function canonOsc(id, name) {
  const tryCanon = raw => {
    const u = raw.trim().toUpperCase();
    if (['1', 'CH1', 'CHANNEL1'].includes(u)) return 'CH1';
    if (['2', 'CH2', 'CHANNEL2'].includes(u)) return 'CH2';
    if (['3', 'CH3', 'CHANNEL3'].includes(u)) return 'CH3';
    if (['4', 'CH4', 'CHANNEL4'].includes(u)) return 'CH4';
    if (['5', 'GND', 'GROUND', 'COM'].includes(u)) return 'GND';
    return '';
  };
  return tryCanon(id) || tryCanon(name);
}

function pinOffsetRecognized(libraryId, pinId) {
  pinId = String(pinId).replace(/^([A-Za-z0-9_+-]+)\s*\([^)]*\)\s*$/, '$1');
  const common = kitCommonPinIds(libraryId);
  if (common.length && common.includes(pinId)) return true;

  if (libraryId === 'VEE') return pinId === '1';
  if (libraryId === 'SIGNAL_GEN') return ['OUT', 'GND', '1', '2'].includes(pinId);
  if (libraryId === 'LM555' || libraryId === 'NE555') return !!canon555(pinId, '');
  if (libraryId === 'LM358' || libraryId === 'TL082') return !!canonDual(pinId, '') || ['OUT1', 'IN-1', 'IN+1', 'V-', 'IN+2', 'IN-2', 'OUT2', 'V+'].includes(pinId);
  if (['UA741', 'LM741', 'TL081', 'TL071'].includes(libraryId)) return !!canonUa741(pinId, '');
  if (libraryId === 'OSCILLOSCOPE') return !!canonOsc(pinId, '');
  if (['LM7805', 'LM7812', 'AMS1117_3V3'].includes(libraryId)) return !!canonReg(pinId, '') || ['1', '2', '3'].includes(pinId);
  if (libraryId === 'LM2596') return ['VIN', 'OUT', 'GND', 'FB', 'ON'].includes(pinId);
  if (libraryId === 'DS18B20') return ['GND', 'DQ', 'VDD'].includes(pinId);
  if (libraryId === 'HALL_SENSOR') return ['VCC', 'OUT', 'GND'].includes(pinId);
  if (libraryId.startsWith('POT_')) return ['1', '2', 'W'].includes(pinId);
  if (libraryId === 'RELAY_SPDT') return ['1', '2', 'COM', 'NO', 'NC'].includes(pinId);
  if (libraryId === 'VOLTMETER_DC') return ['V+', 'V', 'COM'].includes(pinId);
  if (libraryId === 'VIRTUAL_METER') return ['V', 'A', 'OHM', 'COM'].includes(pinId);
  if (libraryId === 'AMMETER_DC') return ['I+', 'I-'].includes(pinId);
  if (libraryId === 'POWER_METER') return ['V+', 'V-', 'I+', 'I-'].includes(pinId);
  if (libraryId === 'FREQ_COUNTER') return ['IN', 'GND'].includes(pinId);
  if (libraryId === 'UART_TERMINAL') return ['TX', 'RX', 'GND'].includes(pinId);
  if (libraryId === 'LOGIC_ANALYZER') return pinId === 'GND' || /^CH\d+$/.test(pinId);
  if (libraryId === 'OLED_12864') return ['VCC', 'GND', 'SDA', 'SCL'].includes(pinId);
  if (libraryId === 'LCD1602') return ['VSS', 'VDD', 'V0', 'RS', 'RW', 'E', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'A', 'K'].includes(pinId);
  if (libraryId === '24C02') return ['A0', 'A1', 'A2', 'VSS', 'SDA', 'SCL', 'WP', 'VCC'].includes(pinId);
  if (libraryId === 'W25Q64') return ['CS', 'DO', 'WP', 'GND', 'DI', 'CLK', 'HOLD', 'VCC'].includes(pinId);
  if (libraryId === 'CD4017') return true; // named + numeric fallback
  if (libraryId.startsWith('74HC')) return !isNaN(parseInt(pinId));
  if (libraryId === '2764' || libraryId === '62256') return !isNaN(parseInt(pinId));
  if (libraryId.startsWith('STM32') || libraryId.startsWith('AT89') || libraryId.startsWith('STC')) return true;
  if (['2N2222', '2N2907'].includes(libraryId)) return ['B', 'C', 'E'].includes(pinId);
  if (['2N7000', 'IRF540'].includes(libraryId)) return ['G', 'D', 'S'].includes(pinId);
  if (['BUZZER', 'LDR', 'SW_PUSH'].includes(libraryId) || libraryId.startsWith('R_') || libraryId.startsWith('C_') ||
    libraryId.startsWith('L_') || libraryId.startsWith('FUSE_') || libraryId.startsWith('XTAL_') ||
    libraryId.startsWith('SW_') || libraryId.startsWith('LED_') || ['1N4148', '1N4007', '1N5819'].includes(libraryId)) {
    return ['1', '2', 'A', 'K'].includes(pinId);
  }
  if (libraryId === 'VAC') return ['1', '2'].includes(pinId);
  return false;
}

function validatePinExists(libDevId, pinId) {
  const known = kitCommonPinIds(libDevId);
  if (known.length > 0) return known.includes(pinId);
  return pinOffsetRecognized(libDevId, pinId);
}

const allIds = new Set([
  ...Object.keys(metaPins),
  ...Object.keys(builtinPins).filter(k => !k.startsWith('__fn__'))
]);

const match = [], mismatch = [], missingKit = [], metaOnly = [], builtinOnly = [];

for (const id of [...allIds].sort()) {
  const meta = metaPins[id]?.pins ?? null;
  const builtin = builtinPins[id] ?? null;
  if (!meta && builtin) { builtinOnly.push({ id, builtin }); continue; }
  if (meta && !builtin) { metaOnly.push({ id, meta, file: metaPins[id].file }); continue; }
  if (!meta || !builtin) continue;

  const metaSet = new Set(meta);
  const builtinSet = new Set(builtin);
  const metaEqBuiltin = meta.length === builtin.length && meta.every(p => builtinSet.has(p)) && builtin.every(p => metaSet.has(p));

  const kitMissingMeta = meta.filter(p => !validatePinExists(id, p));
  const kitMissingBuiltin = builtin.filter(p => !validatePinExists(id, p));
  const kitRecognized = [...new Set([...meta, ...builtin])].filter(p => validatePinExists(id, p));

  const row = {
    id,
    meta,
    builtin,
    kitRecognized,
    metaEqBuiltin,
    kitMissingMeta,
    kitMissingBuiltin,
    metaFile: metaPins[id].file
  };

  if (metaEqBuiltin && kitMissingMeta.length === 0 && kitMissingBuiltin.length === 0) {
    match.push(id);
  } else {
    mismatch.push(row);
  }
  if (kitMissingMeta.length || kitMissingBuiltin.length) {
    missingKit.push(row);
  }
}

const out = {
  summary: {
    metaCount: Object.keys(metaPins).length,
    builtinCount: Object.keys(builtinPins).filter(k => !k.startsWith('__fn__')).length,
    match: match.length,
    mismatch: mismatch.length,
    missingKit: missingKit.length,
    metaOnly: metaOnly.length,
    builtinOnly: builtinOnly.length
  },
  match,
  mismatch,
  missingKit,
  metaOnly,
  builtinOnly
};

console.log(JSON.stringify(out, null, 2));
