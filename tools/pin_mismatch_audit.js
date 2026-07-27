/**
 * Thorough pin_id audit: DeviceLibrary meta vs BuiltinComponents vs TemplateSchematicKit
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const metaDir = path.join(root, 'DeviceLibrary');
const rawDir = path.join(root, 'entry/src/main/resources/rawfile/DeviceLibrary');

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (ent.name.endsWith('.meta.json')) acc.push(p);
  }
  return acc;
}

function extractMakePins(block) {
  if (!block) return [];
  return [...block.matchAll(
    /makePin\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]*)['"`]\s*,\s*['"`]([^'"`]*)['"`]/g
  )].map(m => ({ id: m[1], name: m[2], pkg: m[3] }));
}

function extractFn(src, name) {
  const re = new RegExp('function ' + name + '\\b[\\s\\S]*?\\n\\}');
  const m = src.match(re);
  return m ? m[0] : '';
}

function extractNamedFn(src, name) {
  const re = new RegExp('export function ' + name + '[\\s\\S]*?\\n\\}');
  const m = src.match(re);
  return m ? m[0] : '';
}

const metas = {};
for (const p of walk(metaDir)) {
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  metas[j.lib_dev_id] = {
    pins: (j.pin_list || []).map(x => ({
      id: String(x.pin_id),
      label: String(x.pin_label ?? x.pin_id),
      x: x.x,
      y: x.y
    })),
    file: p.replace(/\\/g, '/'),
    category: j.category || '',
    sub: j.sub_category || ''
  };
}

const rawDiff = [];
for (const p of walk(rawDir)) {
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const id = j.lib_dev_id;
  const rawPins = (j.pin_list || []).map(x => String(x.pin_id));
  const m = metas[id];
  if (!m) {
    rawDiff.push({ id, issue: 'raw_only' });
    continue;
  }
  const mp = m.pins.map(x => x.id);
  if (JSON.stringify(mp) !== JSON.stringify(rawPins)) {
    rawDiff.push({ id, meta: mp, raw: rawPins });
  }
}

const bc = fs.readFileSync(
  path.join(root, 'features/component_library/src/main/ets/data/BuiltinComponents.ets'),
  'utf8'
);
const named = fs.readFileSync(
  path.join(root, 'features/component_library/src/main/ets/data/NamedDevicePins.ets'),
  'utf8'
);
const kit = fs.readFileSync(
  path.join(root, 'features/ai_engine/src/main/ets/algorithms/TemplateSchematicKit.ets'),
  'utf8'
);
const netPin = fs.readFileSync(
  path.join(root, 'common/src/main/ets/utils/NetPinRebuildUtil.ets'),
  'utf8'
);

const builtin = {};

// Explicit builders
const explicit = [
  ['makeRelaySpdt', ['RELAY_SPDT']],
  ['makeOscilloscope', ['OSCILLOSCOPE']],
  ['makeVirtualMeter', ['VIRTUAL_METER']],
  ['makeLogicAnalyzer', ['LOGIC_ANALYZER']],
  ['makeUartTerminal', ['UART_TERMINAL']],
  ['makeVoltmeter', ['VOLTMETER_DC']],
  ['makeAmmeter', ['AMMETER_DC']],
  ['makePowerMeter', ['POWER_METER']],
  ['makeFrequencyCounter', ['FREQ_COUNTER']],
  ['makeOled12864', ['OLED_12864']],
  ['ic555', ['LM555']]
];
for (const [fn, ids] of explicit) {
  const pins = extractMakePins(extractFn(bc, fn));
  for (const id of ids) builtin[id] = pins;
}

// Power supplies: parse each id block
const powerBody = extractFn(bc, 'makePowerSupplies');
for (const sm of powerBody.matchAll(/id:\s*'([^']+)'([\s\S]*?)(?=id:\s*'|]\s*;|\n\})/g)) {
  builtin[sm[1]] = extractMakePins(sm[2]);
}

// Factory helpers via call sites
function assignCalls(fnName, pins) {
  const re = new RegExp(fnName + '\\(\\s*[\'"`]([^\'"`]+)[\'"`]', 'g');
  let m;
  while ((m = re.exec(bc))) {
    builtin[m[1]] = typeof pins === 'function' ? pins(m[1]) : pins;
  }
}
assignCalls('twoPin', [
  { id: '1', name: '1', pkg: '1' },
  { id: '2', name: '2', pkg: '2' }
]);
assignCalls('diode', [
  { id: 'A', name: 'A', pkg: '1' },
  { id: 'K', name: 'K', pkg: '2' }
]);
assignCalls('led', [
  { id: 'A', name: 'A', pkg: '1' },
  { id: 'K', name: 'K', pkg: '2' }
]);
assignCalls('transistor', [
  { id: 'B', name: 'B', pkg: '1' },
  { id: 'C', name: 'C', pkg: '2' },
  { id: 'E', name: 'E', pkg: '3' }
]);
assignCalls('mosfet', [
  { id: 'G', name: 'G', pkg: '1' },
  { id: 'D', name: 'D', pkg: '2' },
  { id: 'S', name: 'S', pkg: '3' }
]);
assignCalls('icOpAmp', extractMakePins(extractFn(bc, 'icOpAmp')));
assignCalls('icRegulator', [
  { id: '1', name: 'IN', pkg: '1' },
  { id: '2', name: 'GND', pkg: '2' },
  { id: '3', name: 'OUT', pkg: '3' }
]);
assignCalls('makePotentiometer', [
  { id: '1', name: '1', pkg: '1' },
  { id: '2', name: '2', pkg: '2' },
  { id: 'W', name: 'W', pkg: '3' }
]);

// Dual op-amp pins (shared helper block)
const dualStart = bc.indexOf("makePin('OUT1'");
const dualEnd = bc.indexOf("makePin('V+'", dualStart);
const dualBlock = dualStart >= 0 ? bc.substring(dualStart, dualEnd + 80) : '';
const dualPins = extractMakePins(dualBlock);
builtin['LM358'] = dualPins;
builtin['TL082'] = dualPins;

// Sensors from NamedDevicePins
builtin['DS18B20'] = extractMakePins(extractNamedFn(named, 'pinsDs18b20'));
builtin['HALL_SENSOR'] = extractMakePins(extractNamedFn(named, 'pinsHallSensor'));

// Digital gates
for (const num of ['00', '02', '04', '08', '32', '74']) {
  const id = '74HC' + num;
  if (num === '04') {
    builtin[id] = [
      { id: '1', name: 'A', pkg: '1' },
      { id: '2', name: 'Y', pkg: '2' },
      { id: '7', name: 'GND', pkg: '7' },
      { id: '14', name: 'VCC', pkg: '14' }
    ];
  } else {
    builtin[id] = [
      { id: '1', name: 'A', pkg: '1' },
      { id: '2', name: 'B', pkg: '2' },
      { id: '3', name: 'Y', pkg: '3' },
      { id: '7', name: 'GND', pkg: '7' },
      { id: '14', name: 'VCC', pkg: '14' }
    ];
  }
}

function pinsFromNamed(fn) {
  return extractMakePins(extractNamedFn(named, fn));
}
const namedMap = {
  CD4017: 'pinsCd4017',
  LCD1602: 'pinsLcd1602',
  '24C02': 'pins24C02',
  W25Q64: 'pinsW25Q64',
  LM2596: 'pinsLm2596',
  '2764': 'pins2764',
  '62256': 'pins62256'
};
for (const [id, fn] of Object.entries(namedMap)) {
  const p = pinsFromNamed(fn);
  if (p.length) builtin[id] = p;
}

const p8051 = pinsFromNamed('pins8051Dip40');
for (const id of ['AT89C51', 'AT89C52', 'STC89C52', 'STC15W408AS']) {
  if (p8051.length) builtin[id] = p8051;
}
const p48 = pinsFromNamed('pinsStm32Teaching48');
const p100 = pinsFromNamed('pinsStm32Teaching100');
const p32 = pinsFromNamed('pinsStm32Teaching32');
for (const id of ['STM32F103C8', 'STM32F103RC', 'STM32L431CB', 'STM32F103C8T6']) {
  if (p48.length) builtin[id] = p48;
}
if (p100.length) builtin['STM32F407VG'] = p100;
if (p32.length) builtin['STM32F030F4'] = p32;

// Existing canonicalize* in Kit
const CANON_DEVICES = {
  LM555: 'canonicalize555Pin',
  NE555: 'canonicalize555Pin',
  LM358: 'canonicalizeDualOpAmpPin',
  TL082: 'canonicalizeDualOpAmpPin',
  UA741: 'canonicalizeUa741Pin',
  LM741: 'canonicalizeUa741Pin',
  TL081: 'canonicalizeUa741Pin',
  TL071: 'canonicalizeUa741Pin',
  LM7805: 'canonicalizeRegulatorPin',
  LM7812: 'canonicalizeRegulatorPin',
  AMS1117_3V3: 'canonicalizeRegulatorPin',
  OSCILLOSCOPE: 'canonicalizeOscilloscopePin'
};

// Known Kit pinOffset recognized keys (semantic + any numeric aliases hardcoded)
function kitOffsetKeys(id) {
  if (id === 'RELAY_SPDT') return ['1', '2', 'COM', 'NO', 'NC'];
  if (id === 'DS18B20') return ['GND', 'DQ', 'VDD'];
  if (id === 'HALL_SENSOR') return ['VCC', 'OUT', 'GND'];
  if (id === 'VCC' || id === 'GND' || id === 'VEE') return ['1'];
  if (id === 'VAC') return ['1', '2'];
  if (id === 'SIGNAL_GEN') return ['OUT', 'GND', '1', '2'];
  if (['UA741', 'LM741', 'TL081', 'TL071'].includes(id)) {
    return ['IN+', 'IN-', 'OUT', 'VCC', 'VEE', '2', '3', '4', '6', '7'];
  }
  if (id === 'LM555' || id === 'NE555') {
    return ['GND', 'TRIG', 'OUT', 'RESET', 'CTRL', 'THRES', 'DISCH', 'VCC', '1-8'];
  }
  if (id === 'LM358' || id === 'TL082') {
    return ['OUT1', 'IN-1', 'IN+1', 'V-', 'IN+2', 'IN-2', 'OUT2', 'V+', '1-8'];
  }
  if (['LM7805', 'LM7812', 'AMS1117_3V3'].includes(id)) {
    return ['1', '2', '3', 'IN', 'GND', 'OUT'];
  }
  if (id === 'LM2596') return ['VIN', 'OUT', 'GND', 'FB', 'ON'];
  if (id === 'CD4017') return ['Q5', 'Q1', 'Q0', 'Q2', 'Q6', 'Q7', 'Q3', 'VSS', 'Q8', 'Q4', 'Q9', 'CO', 'CLK', 'EN', 'RST', 'VDD', '1-16'];
  if (id.startsWith('74HC')) return ['1', '2', '3', '7', '14'];
  if (id === 'OSCILLOSCOPE') return ['CH1', 'CH2', 'CH3', 'CH4', 'GND', '1', '2', '3', '4', '5'];
  if (id === 'VOLTMETER_DC') return ['V+', 'V', 'COM'];
  if (id === 'AMMETER_DC') return ['I+', 'I-'];
  if (id === 'VIRTUAL_METER') return ['V', 'A', 'OHM', 'COM'];
  if (id === 'POWER_METER') return ['V+', 'V-', 'I+', 'I-'];
  if (id === 'FREQ_COUNTER') return ['IN', 'GND'];
  if (id === 'UART_TERMINAL') return ['TX', 'RX', 'GND'];
  if (id === 'LOGIC_ANALYZER') return ['CH1-8', 'GND'];
  if (id === 'OLED_12864') return ['VCC', 'GND', 'SDA', 'SCL'];
  if (id === 'LCD1602') {
    return ['VSS', 'VDD', 'V0', 'RS', 'RW', 'E', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'A', 'K'];
  }
  if (id === '24C02') return ['A0', 'A1', 'A2', 'VSS', 'SDA', 'SCL', 'WP', 'VCC'];
  if (id === 'W25Q64') return ['CS', 'DO', 'WP', 'GND', 'DI', 'CLK', 'HOLD', 'VCC'];
  if (['2N2222', '2N2907'].includes(id)) return ['B', 'C', 'E'];
  if (['2N7000', 'IRF540'].includes(id)) return ['G', 'D', 'S'];
  if (id.startsWith('POT_')) return ['1', '2', 'W'];
  if (
    id.startsWith('R_') || id.startsWith('C_') || id.startsWith('L_') ||
    id.startsWith('FUSE_') || id.startsWith('XTAL_') || id === 'LDR' ||
    id === 'BUZZER' || id.startsWith('SW_')
  ) {
    return ['1', '2'];
  }
  if (id.startsWith('LED_') || id.startsWith('1N')) return ['A', 'K'];
  if (id.startsWith('STM32') || id.startsWith('AT89') || id.startsWith('STC')) {
    return ['MCU named (mcuPinOffset)'];
  }
  if (id === '2764' || id === '62256') return ['1-28 numeric genPinOffset'];
  return ['fallback: numeric→genPinOffset(16)'];
}

function isNumeric(s) {
  return /^\d+$/.test(s);
}
function allNumeric(pins) {
  return pins.length > 0 && pins.every(p => isNumeric(p.id || p));
}
function anySemantic(pins) {
  return pins.some(p => !isNumeric(p.id || p));
}
function setEq(a, b) {
  if (!a || !b) return false;
  const A = new Set(a);
  const B = new Set(b);
  if (A.size !== B.size) return false;
  for (const x of A) if (!B.has(x)) return false;
  return true;
}

/**
 * Does Kit pinOffset correctly resolve this meta pin_id to non-center geometry?
 * Conservative: uses known canons + exact key lists.
 */
function kitResolves(id, pinId) {
  const keys = kitOffsetKeys(id);
  if (keys.includes(pinId)) return true;
  if (CANON_DEVICES[id]) {
    // canons accept both numeric and semantic for those families
    return true;
  }
  if (id.startsWith('74HC') && isNumeric(pinId)) return true;
  if ((id === '2764' || id === '62256') && isNumeric(pinId)) return true;
  if (id.startsWith('STM32') || id.startsWith('AT89') || id.startsWith('STC')) return true;
  if (id === 'CD4017' && isNumeric(pinId)) return true; // falls through namedDip then gen
  if (
    (id.startsWith('R_') || id.startsWith('C_') || id.startsWith('L_') ||
      id.startsWith('FUSE_') || id.startsWith('XTAL_') || id === 'LDR' ||
      id === 'BUZZER' || id.startsWith('SW_') || id === 'VAC' ||
      id === 'VCC' || id === 'GND' || id === 'VEE') &&
    (pinId === '1' || pinId === '2')
  ) {
    return true;
  }
  if (id.startsWith('POT_') && ['1', '2', 'W'].includes(pinId)) return true;
  // diode trap: pinOffset uses (pinId==='A' ? left : right) — so '1' maps to K (wrong side)
  if ((id.startsWith('LED_') || id.startsWith('1N')) && (pinId === 'A' || pinId === 'K')) return true;
  if ((id.startsWith('LED_') || id.startsWith('1N')) && isNumeric(pinId)) return false;
  if (['2N2222', '2N2907', '2N7000', 'IRF540'].includes(id) && isNumeric(pinId)) return false;
  // instruments / named: numeric meta without canon
  if (keys.includes(pinId)) return true;
  if (isNumeric(pinId) && keys.some(k => !isNumeric(k) && k !== '1-8' && !k.includes('numeric'))) {
    // kit only has semantic keys
    return false;
  }
  return false;
}

const rows = [];
for (const id of Object.keys(metas).sort()) {
  const meta = metas[id];
  const mp = meta.pins;
  const bp = builtin[id] || null;
  const metaIds = mp.map(p => p.id);
  const metaLabels = mp.map(p => p.label);
  const builtinIds = bp ? bp.map(p => p.id) : null;
  const builtinPkgs = bp ? bp.map(p => p.pkg) : null;
  const metaNum = allNumeric(mp);
  const metaSem = anySemantic(mp);
  const builtinSem = bp ? anySemantic(bp.map(p => ({ id: p.id }))) : null;
  const metaEqBuiltin = setEq(metaIds, builtinIds);
  const hasCanon = !!CANON_DEVICES[id];
  const canonName = CANON_DEVICES[id] || '';

  // Proposed numeric → semantic (for wiring/geometry)
  const proposed = {};
  if (bp) {
    for (const p of bp) {
      if (p.pkg && p.pkg !== p.id) {
        proposed[p.pkg] = p.id;
      }
    }
  }
  // If meta already numeric with labels that look semantic, include label hints
  if (metaNum) {
    for (const p of mp) {
      if (p.label && p.label !== p.id && !isNumeric(p.label)) {
        if (!proposed[p.id]) proposed[p.id] = p.label;
      }
    }
  }
  // UA741 special: Builtin package numbers even if meta currently semantic
  if (['UA741', 'LM741', 'TL081', 'TL071'].includes(id) && Object.keys(proposed).length === 0) {
    Object.assign(proposed, { '3': 'IN+', '2': 'IN-', '6': 'OUT', '7': 'VCC', '4': 'VEE' });
  }

  const unresolvedMeta = metaIds.filter(pid => !kitResolves(id, pid));
  const issues = [];
  let risk = 'LOW';

  if (metaSem) {
    issues.push('meta_semantic_pin_id');
    risk = 'MED';
  }
  if (metaNum && builtinSem && !hasCanon) {
    issues.push('meta_numeric_builtin_semantic_no_canon');
    risk = 'HIGH';
  }
  if (metaNum && builtinSem && hasCanon) {
    issues.push('meta_numeric_builtin_semantic_has_canon');
    if (risk === 'LOW') risk = 'MED';
  }
  if (builtinIds && !metaEqBuiltin) {
    issues.push('meta_ne_builtin_ids');
    if (risk === 'LOW') risk = 'MED';
  }
  if (unresolvedMeta.length) {
    issues.push('kit_unresolved:' + unresolvedMeta.join(','));
    risk = 'HIGH';
  }
  // Diode/LED: meta 1/2 → pinOffset treats non-A as K
  if ((id.startsWith('1N') || id.startsWith('LED_')) && metaNum) {
    issues.push('diode_numeric_maps_wrong_side');
    risk = 'HIGH';
  }
  if (['2N2222', '2N2907'].includes(id) && metaNum) {
    issues.push('bjt_needs_1→B,2→C,3→E');
    risk = 'HIGH';
  }
  if (['2N7000', 'IRF540'].includes(id) && metaNum) {
    issues.push('mosfet_needs_1→G,2→D,3→S');
    risk = 'HIGH';
  }
  if (id.startsWith('POT_') && metaIds.includes('3') && !metaIds.includes('W')) {
    issues.push('pot_meta_3_vs_builtin_W');
    risk = 'HIGH';
  }
  // Regulator: already has canon (semantic→numeric). Meta is numeric = OK for kit.
  // LM2596: meta numeric, kit expects VIN/OUT/...
  if (id === 'LM2596' && metaNum) {
    issues.push('lm2596_needs_numeric_canon');
    risk = 'HIGH';
  }
  // CD4017 / LCD / memory: meta numeric, kit namedDipOffset expects names
  if (['CD4017', 'LCD1602', '24C02', 'W25Q64'].includes(id) && metaNum) {
    issues.push('named_dip_meta_numeric_no_canon');
    risk = 'HIGH';
  }
  // MCU: meta numeric, builtin named — mcuPinOffset may accept numbers poorly
  if ((id.startsWith('STM32') || id.startsWith('AT89') || id.startsWith('STC')) && metaNum && builtinSem) {
    issues.push('mcu_meta_numeric_builtin_named');
    risk = 'HIGH';
  }
  // Instruments
  const instrNoCanon = [
    'AMMETER_DC', 'VOLTMETER_DC', 'LOGIC_ANALYZER', 'UART_TERMINAL',
    'POWER_METER', 'FREQ_COUNTER', 'VIRTUAL_METER'
  ];
  if (instrNoCanon.includes(id) && metaNum) {
    issues.push('instrument_numeric_meta_kit_semantic_only');
    risk = 'HIGH';
  }
  if (id === 'SIGNAL_GEN' && metaNum) {
    // Kit accepts 1/2 as aliases — LOW/MED
    issues.push('signal_gen_has_1_2_alias');
    if (risk === 'HIGH' && unresolvedMeta.length === 0) risk = 'LOW';
  }
  if (id === 'OSCILLOSCOPE' && metaNum) {
    issues.push('scope_has_canon');
    if (risk === 'HIGH' && unresolvedMeta.length === 0) risk = 'MED';
  }
  if (id === 'RELAY_SPDT' && metaIds.includes('3')) {
    issues.push('relay_3/4/5_vs_COM/NO/NC');
    risk = 'HIGH';
  }
  if (id === 'OLED_12864' && metaNum) {
    issues.push('oled_numeric_vs_VCC/GND/SDA/SCL');
    risk = 'HIGH';
  }
  if (['DS18B20', 'HALL_SENSOR'].includes(id) && metaNum) {
    issues.push('sensor_numeric_vs_named');
    risk = 'HIGH';
  }

  // Passives both numeric: low risk
  if (
    (id.startsWith('R_') || id.startsWith('C_') || id.startsWith('L_') ||
      id.startsWith('FUSE_') || id.startsWith('XTAL_') || id === 'LDR' ||
      id === 'BUZZER' || (id.startsWith('SW_') && id !== 'SW_PUSH')) &&
    metaNum && (!builtinIds || !builtinSem)
  ) {
    risk = 'LOW';
    issues.push('passive_numeric_ok');
  }
  if (id === 'SW_PUSH' && metaNum) {
    risk = 'LOW';
    issues.push('passive_numeric_ok');
  }

  // Regulators with canon: meta numeric is actually desired
  if (['LM7805', 'LM7812', 'AMS1117_3V3'].includes(id) && metaNum && hasCanon) {
    risk = 'LOW';
    issues.push('regulator_numeric_meta_ok_with_canon');
  }

  // Dual/555 with canon: meta numeric OK for kit geometry
  if (['LM555', 'LM358', 'TL082'].includes(id) && metaNum && hasCanon) {
    risk = 'MED'; // still meta≠builtin for validate if commonPinIds empty
    issues.push('ic_numeric_meta_canon_ok_but_validatePinExists_empty_common');
  }

  // UA741 currently semantic — matches Builtin; user wants revert to numeric
  if (id === 'UA741' && metaSem) {
    risk = 'MED';
    issues.push('ua741_semantic_meta_matches_builtin_user_wants_numeric');
  }

  rows.push({
    id,
    metaIds,
    metaLabels,
    builtinIds,
    builtinPkgs,
    kitKeys: kitOffsetKeys(id),
    hasCanon,
    canonName,
    metaStyle: metaNum ? 'numeric' : metaSem ? 'semantic' : 'mixed',
    builtinStyle: !bp ? 'missing' : builtinSem ? 'semantic' : 'numeric',
    metaEqBuiltin,
    proposed,
    unresolvedMeta,
    risk,
    issues,
    cat: meta.category,
    file: meta.file
  });
}

const summary = {
  metaCount: Object.keys(metas).length,
  builtinParsed: Object.keys(builtin).length,
  semanticMeta: rows.filter(r => r.metaStyle === 'semantic').length,
  numericMeta: rows.filter(r => r.metaStyle === 'numeric').length,
  high: rows.filter(r => r.risk === 'HIGH').length,
  med: rows.filter(r => r.risk === 'MED').length,
  low: rows.filter(r => r.risk === 'LOW').length,
  withCanon: rows.filter(r => r.hasCanon).length,
  metaNeBuiltin: rows.filter(r => r.builtinIds && !r.metaEqBuiltin).length,
  rawfileDiffs: rawDiff.length,
  kitCanonFns: [
    'canonicalize555Pin',
    'canonicalizeDualOpAmpPin',
    'canonicalizeRegulatorPin',
    'canonicalizeUa741Pin',
    'canonicalizeOscilloscopePin'
  ]
};

const out = {
  summary,
  rawDiff,
  semanticMetas: rows.filter(r => r.metaStyle === 'semantic'),
  highRisk: rows.filter(r => r.risk === 'HIGH'),
  medRisk: rows.filter(r => r.risk === 'MED'),
  numMetaSemBuiltin: rows.filter(r => r.metaStyle === 'numeric' && r.builtinStyle === 'semantic'),
  all: rows,
  builtinSample: Object.fromEntries(
    Object.entries(builtin).slice(0, 5).map(([k, v]) => [k, v])
  )
};

fs.writeFileSync(path.join(root, 'tools/_pin_mismatch_report.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log('\n=== SEMANTIC METAS ===');
for (const r of out.semanticMetas) {
  console.log(r.id, r.metaIds.join(','), 'builtin=', (r.builtinIds || []).join(','), 'risk=', r.risk);
}
console.log('\n=== HIGH RISK count', out.highRisk.length, '===');
for (const r of out.highRisk) {
  console.log(
    r.id,
    '| meta:', r.metaIds.join(','),
    '| builtin:', (r.builtinIds || ['?']).join(','),
    '| canon:', r.hasCanon ? r.canonName : 'NO',
    '| issues:', r.issues.join('; ')
  );
}
console.log('\n=== RAWFILE DIFFS ===');
console.log(JSON.stringify(rawDiff, null, 2));
console.log('\n=== MED RISK (non-passive) ===');
for (const r of out.medRisk.filter(x => !x.issues.includes('passive_numeric_ok'))) {
  console.log(r.id, r.issues.join('; '), 'proposed', JSON.stringify(r.proposed));
}
