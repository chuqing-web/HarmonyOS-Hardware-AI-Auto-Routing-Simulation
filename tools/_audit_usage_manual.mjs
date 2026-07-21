/**
 * Audit DeviceUsageManual vs BuiltinComponents vs ALL_CATALOG_LIBRARY_IDS
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

/** Reconstruct builtin IDs from BuiltinComponents loops (source of truth). */
function buildLibIds() {
  const resistors = ['10', '100', '330', '1k', '4.7k', '10k', '47k', '100k'].map((v) => `R_${v}`);
  const pots = ['1k', '10k', '100k'].map((v) => `POT_${v}`);
  const caps = ['10pF', '100pF', '1nF', '10nF', '100nF', '1uF', '10uF', '100uF'].map((v) => `C_${v}`);
  const gates = ['00', '02', '04', '08', '32', '74'].map((n) => `74HC${n}`);
  const mcu51 = ['AT89C51', 'AT89C52', 'STC89C52', 'STC15W408AS'];
  const stm = ['STM32F103C8', 'STM32F103RC', 'STM32F407VG', 'STM32L431CB', 'STM32F030F4'];
  return [
    'VCC', 'VEE', 'GND', 'VAC', 'SIGNAL_GEN',
    ...resistors, ...pots, ...caps, 'L_10uH', 'XTAL_11M', 'XTAL_8M', 'FUSE_1A',
    '1N4148', '1N4007', '1N5819', 'LED_RED', 'LED_GREEN', 'LED_BLUE',
    '2N2222', '2N2907', '2N7000', 'IRF540',
    'UA741', 'LM358', 'TL082', 'LM555', 'LM7805', 'LM7812', 'AMS1117_3V3', 'LM2596',
    ...gates, 'CD4017',
    '2764', '62256', '24C02', 'W25Q64',
    ...mcu51, ...stm,
    'SW_PUSH', 'RELAY_SPDT', 'BUZZER', 'LCD1602', 'OLED_12864',
    'DS18B20', 'HALL_SENSOR', 'LDR',
    'OSCILLOSCOPE', 'VIRTUAL_METER', 'LOGIC_ANALYZER', 'UART_TERMINAL',
    'VOLTMETER_DC', 'AMMETER_DC', 'POWER_METER', 'FREQ_COUNTER'
  ];
}

/** Known real pin names from BuiltinComponents (hand-extracted for pin fidelity). */
const LIB_PINS = {
  VCC: ['1'],
  VEE: ['1'],
  GND: ['1'],
  VAC: ['1', '2'], // names AC+/AC-
  SIGNAL_GEN: ['OUT', 'GND'],
  SW_PUSH: ['1', '2'],
  BUZZER: ['1', '2'],
  RELAY_SPDT: ['1', '2', 'COM', 'NO', 'NC'],
  '1N4148': ['A', 'K'],
  LED_RED: ['A', 'K'],
  '2N2222': ['B', 'C', 'E'],
  '2N7000': ['G', 'D', 'S'],
  UA741: ['IN+', 'IN-', 'OUT', 'VCC', 'VEE'],
  LM555: ['GND', 'TRIG', 'OUT', 'RESET', 'CTRL', 'THRES', 'DISCH', 'VCC'],
  LM7805: ['1', '2', '3'], // names IN/GND/OUT
  LM2596: ['VIN', 'OUT', 'GND', 'FB', 'ON'],
  CD4017: ['CLK', 'EN', 'RST', 'Q0', 'VDD', 'VSS'],
  '2764': null,
  '24C02': ['A0', 'A1', 'A2', 'VSS', 'SDA', 'SCL', 'WP', 'VCC'],
  LCD1602: ['VSS', 'VDD', 'V0', 'RS', 'RW', 'E', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'A', 'K'],
  OLED_12864: ['VCC', 'GND', 'SDA', 'SCL'],
  DS18B20: ['GND', 'DQ', 'VDD'],
  HALL_SENSOR: ['VCC', 'OUT', 'GND'],
  LDR: ['1', '2'],
  OSCILLOSCOPE: ['CH1', 'CH2', 'CH3', 'CH4', 'GND'],
  VIRTUAL_METER: ['V', 'COM'],
  VOLTMETER_DC: null, // need read
  AMMETER_DC: null,
  LOGIC_ANALYZER: ['CH1', 'CH2', 'CH3', 'CH4', 'CH5', 'CH6', 'CH7', 'CH8', 'GND'],
  UART_TERMINAL: ['TX', 'RX', 'GND'],
  POT_10k: ['1', '2', 'W'],
  '74HC00': ['1', '2', '3', '7', '14'], // A,B,Y,GND,VCC by name
};

function extractPinsForId(src, id) {
  const marker = `id: '${id}'`;
  const idx = src.indexOf(marker);
  if (idx < 0) return null;
  let end = src.indexOf(`id: '`, idx + marker.length);
  if (end < 0) end = idx + 900;
  end = Math.min(end, idx + 900);
  const slice = src.slice(idx, end);
  return [...slice.matchAll(/makePin\('([^']+)',\s*'([^']+)'/g)].map((m) => ({
    id: m[1],
    name: m[2]
  }));
}

function parseCatalog(src) {
  const start = src.indexOf('ALL_CATALOG_LIBRARY_IDS');
  const end = src.indexOf('];', start);
  const block = src.slice(start, end + 2);
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function parseManual(src) {
  const exact = [...src.matchAll(/entry\('([^']*)'/g)].map((m) => m[1]).filter((id) => id.length > 0);
  const families = [...src.matchAll(/prefix: '([^']+)'/g)].map((m) => m[1]);
  // pin field lines: pins: '...'
  const pinFields = {};
  const re = /entry\('([^']+)',\s*'([^']*)',\s*'([^']*)',\s*\n\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    pinFields[m[1]] = m[4];
  }
  return { exact, families, pinFields };
}

function resolve(id, exact, families) {
  if (exact.includes(id)) return { via: 'exact' };
  let best = null;
  for (const p of families) {
    if (id.startsWith(p) && (!best || p.length > best.length)) best = p;
  }
  return best ? { via: `family:${best}` } : null;
}

/** Tokens that look like pin ids in manual pin string */
function extractClaimedPins(pinStr) {
  if (!pinStr) return [];
  // split on common separators; keep tokens like CH1, IN+, VCC, 1, W
  const parts = pinStr.split(/[=,，/|;\s（）()]+/).map((s) => s.trim()).filter(Boolean);
  const skip = new Set([
    '以库脚为准', '以库为准', '查库引脚表', '等', '或', '两端', '输出脚', '两路',
    '电源脚', '按门型号', '输入', '输出', '无极性', '电解注意极性若库标注'
  ]);
  return parts.filter((p) => {
    if (skip.has(p)) return false;
    if (p.length > 12) return false;
    return /^[A-Za-z0-9_+]+$/.test(p) || p.includes('+') || p.includes('-');
  });
}

const builtinSrc = read('features/component_library/src/main/ets/data/BuiltinComponents.ets');
const catalogIds = parseCatalog(read('features/ai_engine/src/main/ets/algorithms/LabTemplateRegistry.ets'));
const { exact, families, pinFields } = parseManual(
  read('features/ai_engine/src/main/ets/algorithms/DeviceUsageManual.ets')
);
const libIds = buildLibIds();
for (const id of [
  'VOLTMETER_DC', 'AMMETER_DC', 'POWER_METER', 'FREQ_COUNTER',
  'UA741', 'LM555', 'OLED_12864', 'OSCILLOSCOPE',
  'VIRTUAL_METER', 'UART_TERMINAL', 'LOGIC_ANALYZER', 'LM7805', 'SIGNAL_GEN', 'RELAY_SPDT'
]) {
  const pins = extractPinsForId(builtinSrc, id);
  if (pins) LIB_PINS[id] = pins.map((p) => p.id);
}
// Dual opamps: pins come from genDualOpAmpPins(), not inline near id
LIB_PINS.LM358 = ['OUT1', 'IN-1', 'IN+1', 'V-', 'IN+2', 'IN-2', 'OUT2', 'V+'];
LIB_PINS.TL082 = LIB_PINS.LM358.slice();

// Dual opamp / genPins / MCU structural mismatches (library model vs handbook names)
const structural = [];
for (const id of ['LM358', 'TL082']) {
  const pins = LIB_PINS[id] || [];
  if (pins.includes('OUT1') || pins.includes('IN+1')) {
    structural.push({
      id,
      issue: '库为双运放脚 OUT1/IN±1/IN±2/V+/V-；手册写 IN+/IN-/OUT/VCC/GND',
      libPins: pins
    });
  }
}
for (const id of ['LM2596', 'CD4017', 'LCD1602', '2764', '62256', '24C02', 'W25Q64']) {
  structural.push({
    id,
    issue: '库为 genPins 数字脚(1..N)；手册写功能脚名（VIN/CLK/RS/SDA 等）',
    libPins: 'numeric genPins'
  });
}
structural.push({
  id: 'STM32*/AT89*/STC*',
  issue: '库 genMcuPins → P1..PN；手册写 VDD/NRST/BOOT0/P0.. 等具名脚',
  libPins: 'P1..Pn'
});
structural.push({
  id: 'DS18B20/HALL_SENSOR',
  issue: '库 twoPin 仅 1/2；手册写 DQ/VDD/OUT 等三端脚名',
  libPins: ['1', '2']
});
structural.push({
  id: 'LOGIC_ANALYZER',
  issue: '库 CH1..CH8+GND；手册写 D0..D7',
  libPins: LIB_PINS.LOGIC_ANALYZER
});
structural.push({
  id: 'VIRTUAL_METER',
  issue: '库 V/COM；手册表述含 V/I 模式脚',
  libPins: LIB_PINS.VIRTUAL_METER
});

const libSet = new Set(libIds);
const catSet = new Set(catalogIds);

const inLibNotCat = [...libSet].filter((id) => !catSet.has(id));
const inCatNotLib = [...catSet].filter((id) => !libSet.has(id));
const libNoManual = [...libSet].filter((id) => !resolve(id, exact, families));
const catalogNoManual = [...catSet].filter((id) => !resolve(id, exact, families));
const exactOrphan = exact.filter((id) => !libSet.has(id));

// Pin fidelity: for exact entries with known LIB_PINS, check claimed pins ⊆ lib OR lib ⊆ claimed loosely
const pinMismatches = [];
for (const id of exact) {
  const libPins = LIB_PINS[id];
  if (!libPins || libPins.length === 0) continue;
  const claimed = extractClaimedPins(pinFields[id] || '');
  if (claimed.length === 0) continue;
  const libUpper = libPins.map((p) => p.toUpperCase());
  const claimUpper = claimed.map((p) => p.toUpperCase());
  // names used in regulator: manual says IN/GND/OUT but ids are 1/2/3
  const aliasOk = {
    LM7805: { IN: '1', GND: '2', OUT: '3' },
    LM7812: { IN: '1', GND: '2', OUT: '3' },
    AMS1117_3V3: { IN: '1', GND: '2', OUT: '3' },
    VAC: { 'AC+': '1', 'AC-': '2' },
    VCC: { VCC: '1' },
    VEE: { VEE: '1' },
    GND: { GND: '1' }
  };
  const missingInLib = [];
  for (const c of claimUpper) {
    if (libUpper.includes(c)) continue;
    const map = aliasOk[id];
    if (map && map[c] && libUpper.includes(String(map[c]))) continue;
    // skip descriptive Chinese leftovers already filtered
    if (['OUT', 'GND', 'VCC', 'VEE'].includes(c) && libUpper.includes(c)) continue;
    missingInLib.push(c);
  }
  // hard contradictions: manual claims pin that cannot map
  const hard = missingInLib.filter((c) => !['等', 'NAME'].includes(c));
  // Known bad patterns
  if (id === 'VIRTUAL_METER' && (claimUpper.includes('V+') || claimUpper.includes('I+'))) {
    pinMismatches.push({ id, issue: '手册暗示 V+/I+，库脚实为 V/COM', libPins, claimed });
  }
  if (id === 'LOGIC_ANALYZER' && claimUpper.some((c) => /^D\d/.test(c))) {
    pinMismatches.push({ id, issue: '手册写 D0..D7，库脚为 CH1..CH8', libPins, claimed });
  }
  if (id === 'DS18B20' && (claimUpper.includes('DQ') || claimUpper.includes('VDD'))) {
    pinMismatches.push({ id, issue: '手册写 DQ/VDD/GND，库为 twoPin 1/2', libPins, claimed });
  }
  if (id === 'HALL_SENSOR' && (claimUpper.includes('OUT') || claimUpper.includes('VCC'))) {
    pinMismatches.push({ id, issue: '手册写 VCC/GND/OUT，库为 twoPin 1/2', libPins, claimed });
  }
  if (id === 'LM2596' && (claimUpper.includes('VIN') || claimUpper.includes('FB'))) {
    pinMismatches.push({ id, issue: '手册写 VIN/FB 等，库为 genPins(5) 数字脚', libPins: ['1..5'], claimed });
  }
  if (id === 'CD4017' && (claimUpper.includes('CLK') || claimUpper.includes('Q0'))) {
    pinMismatches.push({ id, issue: '手册写 CLK/Q0..，库为 genPins(16) 数字脚', libPins: ['1..16'], claimed });
  }
  if (id === 'LCD1602' && (claimUpper.includes('RS') || claimUpper.includes('D4'))) {
    pinMismatches.push({ id, issue: '手册写 RS/E/D4..，库为 genPins(16) 数字脚', libPins: ['1..16'], claimed });
  }
  if ((id === '2764' || id === '62256' || id === '24C02' || id === 'W25Q64') &&
    claimUpper.some((c) => ['SDA', 'SCL', 'CS', 'MOSI', 'A0', 'D0'].includes(c))) {
    pinMismatches.push({
      id,
      issue: '手册写功能脚名，库为 genPins 数字脚',
      libPins: id === '24C02' || id === 'W25Q64' ? ['1..8'] : ['1..28'],
      claimed
    });
  }
  if (id.startsWith('AT89') || id.startsWith('STM32') || id.startsWith('STC')) {
    // family templates claim named pins; MCU uses genMcuPins
  }
  if (hard.length > 0 && !pinMismatches.find((x) => x.id === id)) {
    // only report if clearly wrong known names
  }
}

// Family MCU pin claims vs genMcuPins
const mcuPinIssues = [
  {
    family: 'STM32*',
    issue: '手册写 VDD/NRST/BOOT0/OSC_IN 等具名脚；库 makeStm32Mcu→genMcuPins(N) 为数字脚 1..N'
  },
  {
    family: 'AT89*/STC*',
    issue: '手册写 P0..P3/EA/RST/XTAL；库 make8051Mcu→genMcuPins(40) 为数字脚 1..40'
  },
  {
    family: '74HC*',
    issue: '手册按门功能描述；库脚 id 为 1/2/3/7/14（name=A/B/Y），大体可映射'
  }
];

// Manual text claiming wrong instrument pins
const textIssues = [];
const manualSrc = read('features/ai_engine/src/main/ets/algorithms/DeviceUsageManual.ets');
if (manualSrc.includes("LOGIC_ANALYZER") && manualSrc.includes('D0..D7')) {
  textIssues.push('LOGIC_ANALYZER: D0..D7 ≠ CH1..CH8');
}
if (manualSrc.includes("VIRTUAL_METER") && manualSrc.includes('V/I 脚')) {
  textIssues.push('VIRTUAL_METER: 模糊 V/I，库仅 V/COM');
}
if (manualSrc.includes("DS18B20") && manualSrc.includes('DQ/VDD/GND')) {
  textIssues.push('DS18B20: DQ/VDD/GND ≠ 1/2');
}
if (manualSrc.includes("HALL_SENSOR") && manualSrc.includes('VCC/GND/OUT')) {
  textIssues.push('HALL_SENSOR: VCC/GND/OUT ≠ 1/2');
}
if (manualSrc.includes("CD4017") && manualSrc.includes('CLK/RST/Q0')) {
  textIssues.push('CD4017: 功能脚名 ≠ genPins(16)');
}
if (manualSrc.includes("LM2596") && manualSrc.includes('VIN/GND/OUT/FB')) {
  textIssues.push('LM2596: VIN/FB ≠ genPins(5)');
}
if (manualSrc.includes("LCD1602") && manualSrc.includes('RS/E/D4')) {
  textIssues.push('LCD1602: RS/E/D4 ≠ genPins(16)');
}
// instruments that match
const instrumentOk = [];
for (const [id, expect] of Object.entries({
  VOLTMETER_DC: ['V+', 'COM'],
  AMMETER_DC: ['I+', 'I-'],
  POWER_METER: ['V+', 'V-', 'I+', 'I-'],
  FREQ_COUNTER: ['IN', 'GND'],
  OSCILLOSCOPE: ['CH1', 'CH2', 'CH3', 'CH4', 'GND'],
  UART_TERMINAL: ['TX', 'RX', 'GND'],
  LM555: ['GND', 'TRIG', 'OUT', 'RESET', 'CTRL', 'THRES', 'DISCH', 'VCC'],
  RELAY_SPDT: ['1', '2', 'COM', 'NO', 'NC'],
  SIGNAL_GEN: ['OUT', 'GND'],
  OLED_12864: ['VCC', 'GND', 'SDA', 'SCL'],
  UA741: ['IN+', 'IN-', 'OUT', 'VCC', 'VEE'],
  LM7805: ['1', '2', '3']
})) {
  const got = (LIB_PINS[id] || []).join(',');
  const exp = expect.join(',');
  instrumentOk.push({ id, match: got === exp, libPins: got, expect: exp });
}

const report = {
  summary: {
    builtinCount: libIds.length,
    catalogCount: catalogIds.length,
    exactManualCount: exact.length,
    familyTemplateCount: families.length,
    idLayer: libNoManual.length === 0 && inLibNotCat.length === 0 && inCatNotLib.length === 0 && exactOrphan.length === 0
      ? 'PASS：Builtin ↔ Catalog ↔ Manual 可解析，82/82'
      : 'FAIL：ID 层不一致',
    pinLayer: structural.length > 0
      ? `FAIL：${structural.length} 类脚名/模型不一致（手册写功能名，库多为数字脚或简化脚）`
      : 'PASS'
  },
  idDiff: { inLibNotCat, inCatNotLib, libNoManual, catalogNoManual, exactOrphan },
  pinMismatches,
  structural,
  textIssues,
  mcuPinIssues,
  instrumentPinCheck: instrumentOk,
  families
};

console.log(JSON.stringify(report, null, 2));
