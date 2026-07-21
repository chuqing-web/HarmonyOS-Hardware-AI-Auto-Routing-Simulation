/**
 * Full sync audit: NamedDevicePins ↔ BuiltinComponents ↔ builders ↔ kit ↔ ERC ↔ manual ↔ sim
 */
import fs from 'fs';
import path from 'path';

const ROOT = 'c:/Projects/ElecDraw_Harmony';
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const issues = [];
const warn = (msg) => issues.push({ level: 'WARN', msg });
const err = (msg) => issues.push({ level: 'ERR', msg });
const info = (msg) => issues.push({ level: 'OK', msg });

const named = read('features/component_library/src/main/ets/data/NamedDevicePins.ets');
const builtin = read('features/component_library/src/main/ets/data/BuiltinComponents.ets');
const buildersEts = read('features/ai_engine/src/main/ets/algorithms/LabTemplateBuilders.ets');
const buildersMjs = read('tools/lab_templates/builders.mjs');
const kitMjs = read('tools/lab_templates/kit.mjs');
const kitEts = read('features/ai_engine/src/main/ets/algorithms/TemplateSchematicKit.ets');
const erc = read('common/src/main/ets/utils/ErcEngine.ets');
const manual = read('features/ai_engine/src/main/ets/algorithms/DeviceUsageManual.ets');
const sim = read('features/simulation_kernel/src/main/ets/SimulationKernelImpl.ets');
const deepErc = read('common/src/main/ets/utils/DeepErcEngine.ets');

// --- Builtin uses named helpers ---
for (const h of [
  'pins8051Dip40', 'pinsStm32Teaching48', 'pinsLcd1602', 'pins24C02',
  'pinsW25Q64', 'pins2764', 'pins62256', 'pinsDs18b20', 'pinsHallSensor',
  'pinsCd4017', 'pinsLm2596'
]) {
  if (!builtin.includes(`${h}()`) && !builtin.includes(`${h}(`)) {
    err(`BuiltinComponents missing ${h}()`);
  } else {
    info(`Builtin uses ${h}`);
  }
}

// --- Forbidden old MCU package pins in builders ---
const oldMcuPins = ["'P48'", "'P24'", "'P7'", "'P5'", "'P6'", "'P40'", "'P20'", "'P9'", "'P18'", "'P19'", "'P31'"];
for (const src of [
  ['LabTemplateBuilders.ets', buildersEts],
  ['builders.mjs', buildersMjs]
]) {
  for (const pin of oldMcuPins) {
    // allow comments
    const re = new RegExp(`p\\(mcu,\\s*${pin.replace(/'/g, "'")}|crystal\\([^)]*${pin}|mcuCore\\([^)]*${pin}`);
    if (src[1].includes(`p(mcu, ${pin}`) || src[1].includes(`, ${pin},`) && src[1].includes('mcuCore')) {
      // more precise
    }
    if (src[1].match(new RegExp(`p\\(mcu,\\s*${pin}`)) ||
      src[1].match(new RegExp(`crystal\\(doc, mcu,[^)]*${pin}`)) ||
      src[1].match(new RegExp(`mcuCore\\(doc, mcu,[^)]*${pin}`))) {
      err(`${src[0]} still uses old MCU pin ${pin}`);
    }
  }
}

// Required new pins in builders
for (const need of ["'OSC_IN'", "'NRST'", "'VDD'", "'VSS'", "'XTAL1'", "'RST'", "'EA'", "'DQ'", "'PA0'", "'PA9'"]) {
  if (!buildersEts.includes(need)) err(`builders.ets missing ${need}`);
  if (!buildersMjs.includes(need)) err(`builders.mjs missing ${need}`);
}

// LCD named
for (const need of ["'RS'", "'D4'", "'VSS'", "'VDD'"]) {
  if (!buildersEts.includes(`p(lcd, ${need}`) && !buildersEts.includes(`p(lcd, ${need.replace(/'/g, '')}`)) {
    // check p(lcd, 'RS'
    if (!buildersEts.includes(`p(lcd, ${need}`)) {
      err(`builders.ets LCD missing ${need}`);
    }
  }
}
if (!buildersEts.includes("p(lcd, 'RS'")) err(`builders.ets LCD RS`);
else info('builders.ets LCD RS ok');
if (!buildersMjs.includes("p(lcd, 'RS'")) err(`builders.mjs LCD RS`);
else info('builders.mjs LCD RS ok');

// Sensor power
if (!buildersEts.includes("p(ds, 'VDD'") && !buildersEts.includes("p(ds, 'VDD'")) {
  err('builders.ets DS18B20 missing VDD join');
} else info('DS18B20 VDD present');
if (!buildersEts.includes("p(hall, 'VCC'")) err('builders.ets HALL missing VCC');
else info('HALL VCC present');

// Memory named
if (!buildersEts.includes("p(eep, 'SDA'")) err('24C02 SDA');
if (!buildersEts.includes("p(flash, 'CS'")) err('W25Q64 CS');
if (!buildersEts.includes("p(eprom, 'CE'")) err('2764 CE');

// kit.mjs sensor pins
if (kitMjs.includes("lib === 'DS18B20'") && kitMjs.includes("ids.push('GND', 'DQ', 'VDD')")) {
  info('kit.mjs DS18B20 pins ok');
} else if (kitMjs.match(/DS18B20[\s\S]{0,80}ids\.push\('1', '2'\)/)) {
  err('kit.mjs still treats DS18B20 as 1/2');
} else {
  warn('kit.mjs DS18B20 pin enum unclear');
}

// TemplateSchematicKit geometry
if (!kitEts.includes("libraryId === 'DS18B20'") || !kitEts.includes("pinId === 'DQ'")) {
  err('TemplateSchematicKit missing DS18B20 DQ geometry');
} else info('Kit ets DS18B20 geometry');
if (!kitEts.includes("OSC_IN") || !kitEts.includes('stm32NamedOffset')) {
  err('TemplateSchematicKit missing STM32 named offset');
} else info('Kit ets STM32 named offset');
if (!kitEts.includes("namedDipOffset") || !kitEts.includes("'VSS', 'VDD', 'V0', 'RS'")) {
  err('TemplateSchematicKit missing LCD named offset');
} else info('Kit ets LCD named offset');

// ERC
if (!erc.includes('stm32Pins48') || !erc.includes('pins8051')) {
  err('ErcEngine missing named MCU helpers');
} else info('ErcEngine MCU helpers');
if (!erc.includes("'VDD', 'DQ', 'GND'") && !erc.includes("'DQ'")) {
  // check DS18B20 return
  if (!erc.includes("return ['VDD', 'DQ', 'GND']") && !erc.includes('return [\'VDD\', \'DQ\', \'GND\']')) {
    // try alternate order
    if (!erc.includes("'DQ'") || !erc.includes('DS18B20')) err('ErcEngine DS18B20 pins');
    else info('ErcEngine has DQ');
  }
}
if (erc.includes("return ['VCC', 'DATA', 'GND']")) {
  err('ErcEngine still has old DS18B20 DATA pin');
}
if (erc.includes("buildPinArray(48, 'P')") || erc.includes("buildPinArray(40, 'P')")) {
  err('ErcEngine still uses genMcuPins-style buildPinArray for MCU');
} else info('ErcEngine no old MCU buildPinArray');
if (!erc.includes("return ['V', 'COM']")) {
  warn('ErcEngine VIRTUAL_METER may still be V+/COM');
}

// Manual
const manualChecks = [
  ["DS18B20", 'GND/DQ/VDD'],
  ['HALL_SENSOR', 'VCC/OUT/GND'],
  ['LCD1602', 'VSS/VDD/V0/RS'],
  ['LOGIC_ANALYZER', 'CH1'],
  ['VIRTUAL_METER', 'V/COM'],
  ['LM358', 'OUT1'],
  ['LM2596', 'VIN/OUT/GND/FB'],
  ['CD4017', 'CLK'],
  ['LM555', 'GND/TRIG'],
  ['LM7805', '1=IN']
];
for (const [id, needle] of manualChecks) {
  const idx = manual.indexOf(`entry('${id}'`);
  if (idx < 0) { err(`manual missing ${id}`); continue; }
  const slice = manual.slice(idx, idx + 500);
  if (!slice.includes(needle)) err(`manual ${id} missing ${needle}`);
  else info(`manual ${id} ok`);
}
// 555 禁止裸数字接法
const idx555 = manual.indexOf("entry('LM555'");
if (idx555 >= 0) {
  const s = manual.slice(idx555, idx555 + 450);
  if (s.includes('Ra(VCC-7)') || s.includes('Rb(7-6')) err('manual LM555 still uses bare DIP wiring');
  else info('manual LM555 named wiring');
}

// Sim 8051 candidates order
if (!sim.includes('`P1.${bit}`, `P1_${bit}`, `P${bit + 1}`') &&
  !sim.includes('P1.${bit}`, `P1_${bit}`')) {
  // check both occurrences prefer P1.
  const matches = [...sim.matchAll(/candidates: string\[\] = \[([^\]]+)\]/g)];
  let bad = 0;
  for (const m of matches) {
    if (m[1].includes('P1.${bit}') && m[1].trim().startsWith('`P${bit')) bad++;
  }
  if (bad > 0) err('Sim still prefers Pn before P1.x');
  else info('Sim candidate order checked');
} else {
  info('Sim prefers P1.x');
}

// DeepErc still accepts NRST
if (!deepErc.includes('NRST')) err('DeepErc missing NRST');
else info('DeepErc NRST ok');

// builders.ets vs mjs parity for key tokens
const keys = ['OSC_IN', 'NRST', 'VDD', 'XTAL1', 'P1.${i}', 'DQ', 'PB7', 'PA9', 'PB0'];
for (const k of keys) {
  const inE = buildersEts.includes(k) || buildersEts.includes(k.replace('${i}', '${i}'));
  const inM = buildersMjs.includes(k);
  if (inE !== inM) {
    warn(`ets/mjs parity: ${k} ets=${inE} mjs=${inM}`);
  }
}

// leftover numeric LCD/mem in builders
if (buildersEts.match(/p\(lcd, '\d+'/)) err('builders.ets numeric lcd pin');
if (buildersMjs.match(/p\(lcd, '\d+'/)) err('builders.mjs numeric lcd pin');
if (buildersEts.match(/p\(eep, '\d+'/)) err('builders.ets numeric eep pin');
if (buildersEts.match(/p\(flash, '\d+'/)) err('builders.ets numeric flash pin');

// common 拓扑回退须具名脚
const netPin = read('common/src/main/ets/utils/NetPinRebuildUtil.ets');
const wireTopo = read('common/src/main/ets/utils/WireNetTopology.ets');
const namedDefaults = read('common/src/main/ets/utils/NamedDevicePinDefaults.ets');
if (!namedDefaults.includes('namedMcuPinGeoms') || !namedDefaults.includes('P1.${i}') && !namedDefaults.includes('`P1.${i}`')) {
  if (!namedDefaults.includes('P1.${')) err('NamedDevicePinDefaults missing P1.x');
  else info('NamedDevicePinDefaults P1.x');
} else info('NamedDevicePinDefaults P1.x');
if (!namedDefaults.includes("'OSC_IN'") && !namedDefaults.includes('OSC_IN')) err('NamedDevicePinDefaults missing OSC_IN');
else info('NamedDevicePinDefaults OSC_IN');
if (!netPin.includes('namedMcuPinGeoms')) err('NetPinRebuildUtil not using namedMcuPinGeoms');
else info('NetPinRebuildUtil uses named MCU');
if (netPin.match(/const id = `P\$\{i \+ 1\}`/) || netPin.includes('const id = `P${i + 1}`')) {
  err('NetPinRebuildUtil still generates P1..Pn');
}
if (!wireTopo.includes('namedMcuPinGeoms')) err('WireNetTopology not using namedMcuPinGeoms');
else info('WireNetTopology uses named MCU');
if (wireTopo.includes('const id = `P${i + 1}`')) err('WireNetTopology still generates P1..Pn');
if (!erc.includes("'ON'") || !erc.includes('LM2596')) warn('ErcEngine LM2596 ON check soft');
else if (erc.includes("return ['VIN', 'OUT', 'GND', 'FB', 'ON']")) info('ErcEngine LM2596 includes ON');
else warn('ErcEngine LM2596 ON may be missing');

const summary = {
  err: issues.filter(i => i.level === 'ERR').length,
  warn: issues.filter(i => i.level === 'WARN').length,
  ok: issues.filter(i => i.level === 'OK').length,
  issues
};
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.err > 0 ? 1 : 0);
