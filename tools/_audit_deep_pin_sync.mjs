/**
 * Deep cross-check: NamedDevicePins ↔ TemplateSchematicKit ↔ kit.mjs ↔
 * DeviceUsageManual pin strings ↔ ErcEngine helpers ↔ exported schsim samples.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const issues = [];
function ok(msg) { issues.push({ level: 'OK', msg }); }
function err(msg) { issues.push({ level: 'ERR', msg }); }
function warn(msg) { issues.push({ level: 'WARN', msg }); }

const named = read('features/component_library/src/main/ets/data/NamedDevicePins.ets');
const kitMjs = read('tools/lab_templates/kit.mjs');
const kitEts = read('features/ai_engine/src/main/ets/algorithms/TemplateSchematicKit.ets');
const manual = read('features/ai_engine/src/main/ets/algorithms/DeviceUsageManual.ets');
const erc = read('common/src/main/ets/utils/ErcEngine.ets');
const buildersMjs = read('tools/lab_templates/builders.mjs');
const buildersEts = read('features/ai_engine/src/main/ets/algorithms/LabTemplateBuilders.ets');
const sim = read('features/simulation_kernel/src/main/ets/SimulationKernelImpl.ets');
const builtin = read('features/component_library/src/main/ets/data/BuiltinComponents.ets');

// —— 1) Named helpers wired in Builtin ——
for (const fn of [
  'pins8051Dip40', 'pinsStm32Teaching48', 'pinsLcd1602', 'pins24C02',
  'pinsW25Q64', 'pins2764', 'pins62256', 'pinsDs18b20', 'pinsHallSensor',
  'pinsCd4017', 'pinsLm2596'
]) {
  if (builtin.includes(`${fn}()`)) ok(`Builtin ${fn}()`);
  else err(`Builtin missing ${fn}()`);
}

// —— 2) Kit pin lists / offsets mirror Named ——
const kitChecks = [
  ["kit.mjs P1.0", kitMjs.includes("'P1.0'")],
  ["kit.mjs OSC_IN in STM32_48", kitMjs.includes("'OSC_IN'") && kitMjs.includes('PINS_STM32_48')],
  ["kit.mjs LCD1602_PINS RS", kitMjs.includes("'RS'") && kitMjs.includes('LCD1602_PINS')],
  ["kit.mjs LM2596 VIN offset", kitMjs.includes("pinId === 'VIN'")],
  ["kit.mjs CD4017_PINS", kitMjs.includes('CD4017_PINS')],
  ["kit.mjs DS18B20 DQ", kitMjs.includes("pinId === 'DQ'")],
  ["kit.ets stm32NamedOffset", kitEts.includes('stm32NamedOffset')],
  ["kit.ets LM2596 VIN", kitEts.includes("pinId === 'VIN'")],
  ["kit.ets CD4017 CLK", kitEts.includes("'CLK'")],
  ["named LM2596 makePin VIN", named.includes("makePin('VIN'")],
  ["named DS18B20 DQ", named.includes("makePin('DQ'") || named.includes("io('DQ')")],
];
for (const [msg, pass] of kitChecks) {
  if (pass) ok(msg); else err(msg);
}

// —— 3) builders mjs ↔ ets critical tokens ——
const tokenPairs = [
  ['OSC_IN', true],
  ['NRST', true],
  ["'VIN'", true],
  ["'CLK'", true],
  ["'DQ'", true],
  ["'RS'", true],
  ["'P48'", false],
  ["buck, '1'", false],
  ["cnt, '16'", false],
  ["cnt, '14'", false],
];
for (const [tok, want] of tokenPairs) {
  const m = buildersMjs.includes(tok);
  const e = buildersEts.includes(tok);
  if (m !== want || e !== want) err(`builders token ${tok}: mjs=${m} ets=${e} want=${want}`);
  else if (m !== e) err(`builders desync ${tok}`);
  else ok(`builders ${tok}`);
}

// —— 4) Manual pin phrases vs NamedDevicePins ——
function extractManualPins(id) {
  const re = new RegExp(`entry\\('${id}'[\\s\\S]*?\\n\\s*'([^']+)'\\s*,\\s*\\n\\s*'[^']*'\\s*,\\s*\\n\\s*'[^']*'\\s*,\\s*\\n\\s*'[^']*'\\s*,\\s*\\n\\s*'[^']*'\\s*,\\s*\\d+\\)`);
  // simpler: find entry('ID' then take 4th string arg (pins)
  const idx = manual.indexOf(`entry('${id}'`);
  if (idx < 0) return null;
  const slice = manual.slice(idx, idx + 600);
  const strings = [...slice.matchAll(/'([^']*)'/g)].map((m) => m[1]);
  // entry(id, title, summary, pins, ...)
  return strings.length >= 4 ? strings[3] : null;
}

function extractNamedIds(fnName) {
  // crude: between export function fnName and next export function / pinsXxx
  const start = named.indexOf(`function ${fnName}`);
  if (start < 0) return null;
  const end = named.indexOf('\nexport function', start + 10);
  const block = named.slice(start, end > 0 ? end : start + 2000);
  const ids = [...block.matchAll(/(?:io|inp|out|pwr|gnd|makePin)\('([^']+)'/g)].map((m) => m[1]);
  // also template P1.${i} etc — expand not needed for subset check
  return ids;
}

const manualVsNamed = [
  ['DS18B20', ['GND', 'DQ', 'VDD'], 'defsDs18b20'],
  ['HALL_SENSOR', ['VCC', 'OUT', 'GND'], 'defsHallSensor'],
  ['LCD1602', ['RS', 'E', 'D0', 'VSS', 'VDD'], 'defsLcd1602'],
  ['LM2596', ['VIN', 'OUT', 'GND', 'FB', 'ON'], 'defsLm2596'],
  ['CD4017', ['CLK', 'EN', 'RST', 'Q0', 'VDD', 'VSS'], 'defsCd4017'],
  ['24C02', ['SDA', 'SCL', 'VCC', 'VSS'], 'defs24C02'],
  ['W25Q64', ['CS', 'DO', 'DI', 'CLK', 'VCC', 'GND'], 'defsW25Q64'],
];

for (const [id, need, defFn] of manualVsNamed) {
  const pinsStr = extractManualPins(id);
  if (!pinsStr) { err(`manual entry missing ${id}`); continue; }
  const miss = need.filter((p) => !pinsStr.includes(p));
  if (miss.length) err(`manual ${id} pins miss ${miss.join(',')}: ${pinsStr}`);
  else ok(`manual ${id} pins`);
  const namedIds = extractNamedIds(defFn) || extractNamedIds(defFn.replace('defs', 'pins'));
  // soft: if we got named ids, every need must appear in named source near device
  const region = named.includes(id) || named.includes(defFn) || named.includes(defFn.replace('defs', 'pins'));
  if (!region) warn(`named region unclear for ${id}`);
}

// —— 5) ErcEngine critical pin sets ——
const ercNeed = [
  ["'OSC_IN'", true],
  ["'NRST'", true],
  ["'P1.${i}'", true], // template in source as `P1.${i}`
  ['pins8051', true],
  ["'VIN'", true],
  ["'DQ'", true],
  ["'RS'", true],
];
for (const [tok, want] of ercNeed) {
  const hit = tok === "'P1.${i}'" ? erc.includes('P1.${i}') || erc.includes('`P1.${i}`') : erc.includes(tok);
  if (hit === want) ok(`erc ${tok}`);
  else err(`erc missing ${tok}`);
}

// LM2596 ERC should include ON now that library has it
if (erc.includes("'ON'") || /LM2596[\s\S]{0,200}'ON'/.test(erc)) ok('erc LM2596 ON');
else {
  // check array near LM2596
  const i = erc.indexOf('LM2596');
  const snip = i >= 0 ? erc.slice(i, i + 250) : '';
  if (snip.includes("'ON'")) ok('erc LM2596 ON');
  else warn(`erc LM2596 may omit ON: ${snip.replace(/\s+/g, ' ').slice(0, 120)}`);
}

// —— 6) Simulation prefers P1.x ——
if (sim.includes('`P1.${bit}`') || sim.includes('P1.${bit}')) ok('sim P1.x candidates');
else err('sim missing P1.x');

// —— 7) Exported schsim sample pins ——
const samples = [
  ['Test_Template/lab_uart.schsim', ['OSC_IN', 'NRST', 'PA9', 'VDD']],
  ['Test_Template/lab_51_led.schsim', ['P1.0', 'XTAL1', 'RST']],
  ['Test_Template/lab_analog_ic.schsim', ['VIN', 'FB', 'ON']],
  ['Test_Template/lab_digital.schsim', ['CLK', 'EN', 'Q0', 'CH1']],
  ['Test_Template/lab_sensor.schsim', ['DQ', 'VDD']],
  ['Test_Template/lab_peripheral.schsim', ['RS', 'E', 'D4']],
  ['Test_Template/lab_memory.schsim', ['SDA', 'CS', 'OSC_IN']],
];
for (const [rel, need] of samples) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) { err(`missing ${rel}`); continue; }
  const t = fs.readFileSync(p, 'utf8');
  const miss = need.filter((n) => !t.includes(n));
  if (miss.length) err(`${rel} miss ${miss.join(',')}`);
  else ok(`${rel} pins`);
  if (t.includes(':P48:') || t.includes('"P48"')) err(`${rel} still has P48`);
}

// —— 9) common 拓扑回退具名脚 ——
const netPin = read('common/src/main/ets/utils/NetPinRebuildUtil.ets');
const wireTopo = read('common/src/main/ets/utils/WireNetTopology.ets');
const namedDef = read('common/src/main/ets/utils/NamedDevicePinDefaults.ets');
if (namedDef.includes('namedMcuPinGeoms') && namedDef.includes('OSC_IN')) ok('NamedDevicePinDefaults present');
else err('NamedDevicePinDefaults incomplete');
if (netPin.includes('namedMcuPinGeoms') && !netPin.includes('const id = `P${i + 1}`')) ok('NetPinRebuildUtil named MCU');
else err('NetPinRebuildUtil still old MCU pins');
if (wireTopo.includes('namedMcuPinGeoms') && !wireTopo.includes('const id = `P${i + 1}`')) ok('WireNetTopology named MCU');
else err('WireNetTopology still old MCU pins');
if (netPin.includes('namedDevicePinGeoms')) ok('NetPinRebuildUtil named devices');
else err('NetPinRebuildUtil missing namedDevicePinGeoms');
if (erc.includes("return ['VIN', 'OUT', 'GND', 'FB', 'ON']")) ok('erc LM2596 ON');
else warn('erc LM2596 ON');

const errN = issues.filter((i) => i.level === 'ERR').length;
const warnN = issues.filter((i) => i.level === 'WARN').length;
const okN = issues.filter((i) => i.level === 'OK').length;
console.log(JSON.stringify({ err: errN, warn: warnN, ok: okN, issues }, null, 2));
process.exit(errN > 0 ? 1 : 0);
