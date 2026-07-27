/**
 * Generate PinIdRegistry.ets
 *
 * 三层约定（强制）：
 * 1) DeviceLibrary meta: pin_id = 封装数字；pin_label = 语义名（给人/LLM）
 * 2) BuiltinComponents:  pin.id = Kit/几何真脚（可语义可数字）；makePin 第3参 = 封装号
 * 3) Kit/NetPlan:        PinIdRegistry 把 数字/别名 → Builtin pin.id，再查 pinOffset
 *
 * Usage: node tools/gen_pin_id_registry.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const META_ROOT = path.join(ROOT, 'DeviceLibrary');
const OUT = path.join(ROOT, 'features/ai_engine/src/main/ets/algorithms/PinIdRegistry.ets');
const BC = path.join(ROOT, 'features/component_library/src/main/ets/data/BuiltinComponents.ets');
const NAMED = path.join(ROOT, 'features/component_library/src/main/ets/data/NamedDevicePins.ets');

function walk(d, acc = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.meta.json')) acc.push(p);
  }
  return acc;
}

function extractMakePins(block) {
  if (!block) return [];
  return [...block.matchAll(
    /makePin\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]*)['"`]\s*,\s*['"`]([^'"`]*)['"`]/g
  )].map(m => ({ id: m[1], name: m[2], pkg: m[3] }));
}

/** LLM / 手册别名 → 已落在 Builtin id 空间的 token（再经表解析） */
const EXTRA_ALIASES = {
  UA741: { 'V+': 'VCC', 'V-': 'VEE', '+IN': 'IN+', '-IN': 'IN-', 'INP': 'IN+', 'INN': 'IN-', 'OUTPUT': 'OUT', 'VDD': 'VCC', 'VSS': 'VEE' },
  OSCILLOSCOPE: { 'GROUND': 'GND', 'COM': 'GND', 'CHANNEL1': 'CH1', 'CHANNEL2': 'CH2', 'CHANNEL3': 'CH3', 'CHANNEL4': 'CH4' },
  LM555: { 'CONT': 'CTRL', 'CONTROL': 'CTRL', 'CV': 'CTRL', 'TRIGGER': 'TRIG', 'THR': 'THRES', 'THRESHOLD': 'THRES', 'DISCHARGE': 'DISCH', 'RST': 'RESET', 'OUTPUT': 'OUT' },
  LM358: {
    'OUTA': 'OUT1', 'OUTB': 'OUT2', 'INN1': 'IN-1', 'INP1': 'IN+1', 'INN2': 'IN-2', 'INP2': 'IN+2',
    '-IN1': 'IN-1', '+IN1': 'IN+1', '-IN2': 'IN-2', '+IN2': 'IN+2', 'VEE': 'V-', 'VCC': 'V+', 'VSS': 'V-', 'VDD': 'V+'
  },
  LM7805: { 'IN': '1', 'VIN': '1', 'INPUT': '1', 'GND': '2', 'GROUND': '2', 'ADJ': '2', 'OUT': '3', 'VOUT': '3', 'OUTPUT': '3' },
  SIGNAL_GEN: { 'OUTPUT': 'OUT', 'GROUND': 'GND', '1': 'OUT', '2': 'GND' },
  POT_GENERIC: { '3': 'W', 'W': 'W' },
  DIODE_GENERIC: { '1': 'A', '2': 'K', 'A': 'A', 'K': 'K' }
};

function aliasBucket(id) {
  if (id === 'LM741' || id === 'TL081' || id === 'TL071') return EXTRA_ALIASES.UA741;
  if (id === 'NE555') return EXTRA_ALIASES.LM555;
  if (id === 'TL082' || id === 'LM324') return EXTRA_ALIASES.LM358;
  if (id === 'LM7812' || id === 'AMS1117_3V3') return EXTRA_ALIASES.LM7805;
  if (id.startsWith('POT_')) return EXTRA_ALIASES.POT_GENERIC;
  if (id.startsWith('LED_') || id.startsWith('1N') || id.indexOf('DIODE') >= 0) return EXTRA_ALIASES.DIODE_GENERIC;
  return EXTRA_ALIASES[id] || {};
}

// ---- metas ----
const metas = {};
for (const f of walk(META_ROOT)) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  metas[j.lib_dev_id] = (j.pin_list || []).map(p => ({
    id: String(p.pin_id),
    label: String(p.pin_label || p.pin_id)
  }));
}

// ---- Builtin pin.id as canonical ----
const bcSrc = fs.readFileSync(BC, 'utf8');
const namedSrc = fs.readFileSync(NAMED, 'utf8');
const builtinMaps = {}; // libId → { tokenUpper → pin.id }

function addBuiltin(libId, pins, opts = {}) {
  if (!pins || pins.length === 0) return;
  const replace = opts.replace === true;
  if (!replace && builtinMaps[libId] && Object.keys(builtinMaps[libId]).length > 0) {
    // merge without clobbering existing pkg→id
    const m = builtinMaps[libId];
    for (const p of pins) {
      const idU = String(p.id).toUpperCase();
      if (m[idU] === undefined) m[idU] = p.id;
      if (p.name && m[String(p.name).toUpperCase()] === undefined) {
        m[String(p.name).toUpperCase()] = p.id;
      }
      if (p.pkg && m[String(p.pkg).toUpperCase()] === undefined) {
        m[String(p.pkg).toUpperCase()] = p.id;
      }
    }
    return;
  }
  const m = replace ? {} : (builtinMaps[libId] || {});
  for (const p of pins) {
    m[String(p.id).toUpperCase()] = p.id;
    if (p.name) m[String(p.name).toUpperCase()] = p.id;
    if (p.pkg) m[String(p.pkg).toUpperCase()] = p.id;
  }
  builtinMaps[libId] = m;
}

// id: 'FOO' blocks with nearby makePin — coarse: scan all makePin near id literals
// Prefer explicit function builders from audit script patterns
const builderIds = [
  ['makeRelaySpdt', ['RELAY_SPDT']],
  ['makeOscilloscope', ['OSCILLOSCOPE']],
  ['makeVirtualMeter', ['VIRTUAL_METER']],
  ['makeLogicAnalyzer', ['LOGIC_ANALYZER']],
  ['makeUartTerminal', ['UART_TERMINAL']],
  ['makeVoltmeter', ['VOLTMETER_DC']],
  ['makeAmmeter', ['AMMETER_DC']],
  ['makePowerMeter', ['POWER_METER']],
  ['makeFreqCounter', ['FREQ_COUNTER']],
  ['icOpAmp', null], // handled specially
  ['ic555', ['LM555']],
  ['icRegulator', null],
  ['makeSignalGen', ['SIGNAL_GEN']]
];

function extractFn(src, name) {
  const re = new RegExp('function ' + name + '\\b[\\s\\S]*?\\n\\}');
  const m = src.match(re);
  return m ? m[0] : '';
}

for (const [fn, ids] of builderIds) {
  const block = extractFn(bcSrc, fn);
  if (!block) continue;
  if (fn === 'icOpAmp') {
    addBuiltin('UA741', extractMakePins(block).filter(p => ['IN+', 'IN-', 'OUT', 'VCC', 'VEE'].includes(p.id)));
    // dual pins from genDualOpAmpPins
    const dualBlock = extractFn(bcSrc, 'genDualOpAmpPins') || extractFn(bcSrc, 'icOpAmp');
    const dualPins = [...bcSrc.matchAll(/makePin\(\s*['"`](OUT1|IN-1|IN\+1|V-|IN\+2|IN-2|OUT2|V\+)['"`]\s*,\s*['"`]([^'"`]*)['"`]\s*,\s*['"`]([^'"`]*)['"`]/g)]
      .map(m => ({ id: m[1], name: m[2], pkg: m[3] }));
    if (dualPins.length === 0) {
      // fallback hardcoded package map for dual
      const dual = [
        { id: 'OUT1', name: 'OUT1', pkg: '1' }, { id: 'IN-1', name: 'IN-1', pkg: '2' },
        { id: 'IN+1', name: 'IN+1', pkg: '3' }, { id: 'V-', name: 'V-', pkg: '4' },
        { id: 'IN+2', name: 'IN+2', pkg: '5' }, { id: 'IN-2', name: 'IN-2', pkg: '6' },
        { id: 'OUT2', name: 'OUT2', pkg: '7' }, { id: 'V+', name: 'V+', pkg: '8' }
      ];
      addBuiltin('LM358', dual);
      addBuiltin('TL082', dual);
    } else {
      addBuiltin('LM358', dualPins);
      addBuiltin('TL082', dualPins);
    }
    addBuiltin('LM741', builtinMaps.UA741 ? Object.entries(builtinMaps.UA741).map(([k, v]) => ({ id: v, name: k, pkg: k })) : []);
    continue;
  }
  if (fn === 'icRegulator') {
    const pins = [
      { id: '1', name: 'IN', pkg: '1' },
      { id: '2', name: 'GND', pkg: '2' },
      { id: '3', name: 'OUT', pkg: '3' }
    ];
    addBuiltin('LM7805', pins);
    addBuiltin('LM7812', pins);
    addBuiltin('AMS1117_3V3', pins);
    continue;
  }
  if (ids) {
    for (const id of ids) addBuiltin(id, extractMakePins(block));
  }
}

// Dual opamp from source text
{
  const dual = [
    { id: 'OUT1', name: 'OUT1', pkg: '1' }, { id: 'IN-1', name: 'IN-1', pkg: '2' },
    { id: 'IN+1', name: 'IN+1', pkg: '3' }, { id: 'V-', name: 'V-', pkg: '4' },
    { id: 'IN+2', name: 'IN+2', pkg: '5' }, { id: 'IN-2', name: 'IN-2', pkg: '6' },
    { id: 'OUT2', name: 'OUT2', pkg: '7' }, { id: 'V+', name: 'V+', pkg: '8' }
  ];
  addBuiltin('LM358', dual);
  addBuiltin('TL082', dual);
  addBuiltin('LM324', dual);
}

// Single opamp
{
  const single = [
    { id: 'IN+', name: 'IN+', pkg: '3' }, { id: 'IN-', name: 'IN-', pkg: '2' },
    { id: 'OUT', name: 'OUT', pkg: '6' }, { id: 'VCC', name: 'VCC', pkg: '7' },
    { id: 'VEE', name: 'VEE', pkg: '4' }
  ];
  for (const id of ['UA741', 'LM741', 'TL081', 'TL071']) addBuiltin(id, single);
}

// 555
{
  const t555 = [
    { id: 'GND', name: 'GND', pkg: '1' }, { id: 'TRIG', name: 'TRIG', pkg: '2' },
    { id: 'OUT', name: 'OUT', pkg: '3' }, { id: 'RESET', name: 'RESET', pkg: '4' },
    { id: 'CTRL', name: 'CTRL', pkg: '5' }, { id: 'THRES', name: 'THRES', pkg: '6' },
    { id: 'DISCH', name: 'DISCH', pkg: '7' }, { id: 'VCC', name: 'VCC', pkg: '8' }
  ];
  addBuiltin('LM555', t555);
  addBuiltin('NE555', t555);
}

// Discrete / diode / LED / BJT / MOSFET — only fill gaps (greedy regex can span devices)
function scrapeIdBlocks() {
  const re = /id:\s*['"`]([^'"`]+)['"`][\s\S]*?pins:\s*\[([\s\S]*?)\]/g;
  let m;
  while ((m = re.exec(bcSrc))) {
    const id = m[1];
    const pins = extractMakePins(m[2]);
    if (pins.length > 0) addBuiltin(id, pins); // merge-only if already present
  }
}
scrapeIdBlocks();

// Named / MCU / 存储：直接用 meta pin_id→pin_label（与 Builtin 语义脚一致，避免 extractFn 截断）
function seedFromMetaLabels(ids) {
  for (const id of ids) {
    if (!metas[id]) continue;
    const pins = metas[id].map(p => ({ id: p.label, name: p.label, pkg: p.id }));
    addBuiltin(id, pins, { replace: true });
  }
}
seedFromMetaLabels([
  'AT89C51', 'AT89C52', 'LCD1602', '24C02', 'W25Q64', '2764', '62256',
  'DS18B20', 'HALL_SENSOR', 'CD4017', 'LM2596', 'OLED_12864'
]);
for (const id of Object.keys(metas)) {
  if (id.startsWith('STC')) {
    seedFromMetaLabels([id]);
  }
}

// 关键器件：强制覆盖（防 scrape 污染）
{
  const single = [
    { id: 'IN+', name: 'IN+', pkg: '3' }, { id: 'IN-', name: 'IN-', pkg: '2' },
    { id: 'OUT', name: 'OUT', pkg: '6' }, { id: 'VCC', name: 'VCC', pkg: '7' },
    { id: 'VEE', name: 'VEE', pkg: '4' }
  ];
  for (const id of ['UA741', 'LM741', 'TL081', 'TL071']) addBuiltin(id, single, { replace: true });
}
{
  const t555 = [
    { id: 'GND', name: 'GND', pkg: '1' }, { id: 'TRIG', name: 'TRIG', pkg: '2' },
    { id: 'OUT', name: 'OUT', pkg: '3' }, { id: 'RESET', name: 'RESET', pkg: '4' },
    { id: 'CTRL', name: 'CTRL', pkg: '5' }, { id: 'THRES', name: 'THRES', pkg: '6' },
    { id: 'DISCH', name: 'DISCH', pkg: '7' }, { id: 'VCC', name: 'VCC', pkg: '8' }
  ];
  addBuiltin('LM555', t555, { replace: true });
  addBuiltin('NE555', t555, { replace: true });
}
{
  const dual = [
    { id: 'OUT1', name: 'OUT1', pkg: '1' }, { id: 'IN-1', name: 'IN-1', pkg: '2' },
    { id: 'IN+1', name: 'IN+1', pkg: '3' }, { id: 'V-', name: 'V-', pkg: '4' },
    { id: 'IN+2', name: 'IN+2', pkg: '5' }, { id: 'IN-2', name: 'IN-2', pkg: '6' },
    { id: 'OUT2', name: 'OUT2', pkg: '7' }, { id: 'V+', name: 'V+', pkg: '8' }
  ];
  for (const id of ['LM358', 'TL082', 'LM324']) addBuiltin(id, dual, { replace: true });
}
{
  const osc = [
    { id: 'CH1', name: 'CH1', pkg: '1' }, { id: 'CH2', name: 'CH2', pkg: '2' },
    { id: 'CH3', name: 'CH3', pkg: '3' }, { id: 'CH4', name: 'CH4', pkg: '4' },
    { id: 'GND', name: 'GND', pkg: '5' }
  ];
  addBuiltin('OSCILLOSCOPE', osc, { replace: true });
}

// NamedDevicePins layout helpers — obsolete path kept as no-op comment
function scrapeNamedExports() {
  // meta seed above is authoritative for DIP named devices
}
scrapeNamedExports();

// STC MCUs share 8051 map
if (builtinMaps.AT89C51) {
  for (const id of Object.keys(metas)) {
    if (id.startsWith('STC')) builtinMaps[id] = Object.assign({}, builtinMaps.AT89C51);
  }
}

// STM32 from meta labels as Builtin named ids (package = pin_id)
for (const id of Object.keys(metas)) {
  if (!id.startsWith('STM32')) continue;
  const pins = metas[id].map(p => ({ id: p.label, name: p.label, pkg: p.id }));
  addBuiltin(id, pins);
}

// 74HC: Builtin pin.id is numeric
for (const id of Object.keys(metas)) {
  if (!id.startsWith('74HC')) continue;
  const pins = metas[id].map(p => ({ id: p.id, name: p.label, pkg: p.id }));
  addBuiltin(id, pins);
}

// Passives R_/C_/…: identity
for (const id of Object.keys(metas)) {
  if (/^(R_|C_|L_|FUSE_|XTAL_|SW_|LDR|BUZZER|VCC|GND|VEE|VAC)/.test(id)) {
    const pins = metas[id].map(p => ({ id: p.id, name: p.label, pkg: p.id }));
    addBuiltin(id, pins);
  }
}

// Merge: start from Builtin maps; ensure meta pin_id and pin_label tokens resolve
const outMaps = {};
for (const id of new Set([...Object.keys(metas), ...Object.keys(builtinMaps)])) {
  const m = Object.assign({}, builtinMaps[id] || {});
  // meta: package number / label → Builtin id when we can resolve label via Builtin
  for (const p of (metas[id] || [])) {
    const pkg = p.id;
    const lab = p.label;
    // If Builtin already maps pkg → id, keep
    // Else if Builtin maps lab → id, then pkg should map to that id
    const viaLab = m[lab.toUpperCase()];
    const viaPkg = m[pkg.toUpperCase()];
    if (viaPkg) {
      // ok
    } else if (viaLab) {
      m[pkg.toUpperCase()] = viaLab;
    } else if (builtinMaps[id]) {
      // Builtin exists but neither — map pkg→lab only if lab is also a Builtin id key
      // Prefer keeping numeric as numeric when no Builtin: identity
      m[pkg.toUpperCase()] = viaLab || lab;
      m[lab.toUpperCase()] = viaLab || lab;
    } else {
      // No Builtin: map number→label (legacy Kit semantic tables) AND label→label
      m[pkg.toUpperCase()] = lab;
      m[lab.toUpperCase()] = lab;
    }
  }
  // EXTRA aliases: alias → token, then resolve once into Builtin id
  const extra = aliasBucket(id);
  for (const [a, b] of Object.entries(extra)) {
    const target = m[String(b).toUpperCase()] || b;
    m[String(a).toUpperCase()] = target;
  }
  // Force UA741/OSC package maps (meta may temporarily be wrong)
  if (id === 'UA741' || id === 'LM741' || id === 'TL081' || id === 'TL071') {
    Object.assign(m, {
      '2': 'IN-', '3': 'IN+', '4': 'VEE', '6': 'OUT', '7': 'VCC',
      'IN+': 'IN+', 'IN-': 'IN-', 'OUT': 'OUT', 'VCC': 'VCC', 'VEE': 'VEE'
    });
    for (const [a, b] of Object.entries(EXTRA_ALIASES.UA741)) m[a.toUpperCase()] = b;
  }
  if (id === 'OSCILLOSCOPE') {
    Object.assign(m, {
      '1': 'CH1', '2': 'CH2', '3': 'CH3', '4': 'CH4', '5': 'GND',
      'CH1': 'CH1', 'CH2': 'CH2', 'CH3': 'CH3', 'CH4': 'CH4', 'GND': 'GND'
    });
    for (const [a, b] of Object.entries(EXTRA_ALIASES.OSCILLOSCOPE)) m[a.toUpperCase()] = b;
  }
  outMaps[id] = m;
}

function shouldEmit(id, m) {
  // 全量收录：审计要求每个 meta 的 pin_id 都能 resolve
  return Object.keys(m).length > 0;
}

function pairsOf(m) {
  const pairs = [];
  const seen = new Set();
  for (const [k, v] of Object.entries(m)) {
    const ku = String(k).toUpperCase();
    if (seen.has(ku)) continue;
    seen.add(ku);
    pairs.push(`'${ku}': '${String(v).replace(/'/g, "\\'")}'`);
  }
  return pairs.join(', ');
}

const lines = [];
lines.push('/**');
lines.push(' * pin_id 数字/别名 → Builtin pin.id（Kit 几何真脚）');
lines.push(' *');
lines.push(' * 约定：');
lines.push(' * - DeviceLibrary: pin_id=封装数字, pin_label=语义名');
lines.push(' * - Builtin: pin.id=几何真脚, makePin 第3参=封装号');
lines.push(' * - Kit: 先 PinIdRegistry.resolve 再 pinOffset');
lines.push(' *');
lines.push(' * 生成：node tools/gen_pin_id_registry.js');
lines.push(' * 审计：node tools/pin_convention_audit.js');
lines.push(' */');
lines.push('');
lines.push('export class PinIdRegistry {');
lines.push('  /** libDevId(upper) / 族键 → pinToken(upper) → Builtin pin.id */');
lines.push('  private static readonly MAP: Record<string, Record<string, string>> = {');

for (const id of Object.keys(outMaps).sort()) {
  if (!shouldEmit(id, outMaps[id])) continue;
  lines.push(`    '${id.toUpperCase()}': { ${pairsOf(outMaps[id])} },`);
}
lines.push(`    'POT_*': { ${pairsOf(Object.assign({ '1': '1', '2': '2' }, (() => {
  const m = {};
  for (const [k, v] of Object.entries(EXTRA_ALIASES.POT_GENERIC)) m[k.toUpperCase()] = v;
  return m;
})()))} },`);
lines.push(`    'LED_*': { ${pairsOf((() => {
  const m = {};
  for (const [k, v] of Object.entries(EXTRA_ALIASES.DIODE_GENERIC)) m[k.toUpperCase()] = v;
  return m;
})())} },`);
lines.push(`    '1N*': { ${pairsOf((() => {
  const m = {};
  for (const [k, v] of Object.entries(EXTRA_ALIASES.DIODE_GENERIC)) m[k.toUpperCase()] = v;
  return m;
})())} },`);
lines.push('  };');
lines.push('');
lines.push('  private static familyKey(libDevId: string): string {');
lines.push("    const u = (libDevId ?? '').toUpperCase();");
lines.push("    if (u.startsWith('POT_')) { return 'POT_*'; }");
lines.push("    if (u.startsWith('LED_')) { return 'LED_*'; }");
lines.push("    if (u.startsWith('1N') || u.indexOf('DIODE') >= 0) { return '1N*'; }");
lines.push('    return u;');
lines.push('  }');
lines.push('');
lines.push('  private static tableFor(libDevId: string): Record<string, string> | undefined {');
lines.push("    const u = (libDevId ?? '').toUpperCase();");
lines.push('    return PinIdRegistry.MAP[u] ?? PinIdRegistry.MAP[PinIdRegistry.familyKey(libDevId)];');
lines.push('  }');
lines.push('');
lines.push('  /** 有映射返回 Builtin pin.id；无映射返回空串 */');
lines.push('  static canonicalize(libDevId: string, pinId: string, pinName: string = \'\'): string {');
lines.push('    const table = PinIdRegistry.tableFor(libDevId);');
lines.push('    if (!table) { return \'\'; }');
lines.push('    const tryOne = (raw: string): string => {');
lines.push('      const t = (raw ?? \'\').trim();');
lines.push('      if (t.length === 0) { return \'\'; }');
lines.push('      const m = /^([A-Za-z0-9_.+-]+)\\s*\\([^)]*\\)\\s*$/.exec(t);');
lines.push('      const key = (m ? m[1] : t).toUpperCase();');
lines.push('      const hit = table[key];');
lines.push('      return hit !== undefined ? hit : \'\';');
lines.push('    };');
lines.push('    const a = tryOne(pinId);');
lines.push('    if (a.length > 0) { return a; }');
lines.push('    return tryOne(pinName);');
lines.push('  }');
lines.push('');
lines.push('  /** 规范化；无映射时返回剥括号后的原 pinId */');
lines.push('  static resolve(libDevId: string, pinId: string, pinName: string = \'\'): string {');
lines.push('    const c = PinIdRegistry.canonicalize(libDevId, pinId, pinName);');
lines.push('    if (c.length > 0) { return c; }');
lines.push('    const t = (pinId ?? \'\').trim();');
lines.push('    const m = /^([A-Za-z0-9_.+-]+)\\s*\\([^)]*\\)\\s*$/.exec(t);');
lines.push('    return m ? m[1] : t;');
lines.push('  }');
lines.push('');
lines.push('  static knownTokens(libDevId: string): string[] {');
lines.push('    const table = PinIdRegistry.tableFor(libDevId);');
lines.push('    if (!table) { return []; }');
lines.push('    const out: string[] = [];');
lines.push('    const seen = new Set<string>();');
lines.push('    const keys = Object.keys(table);');
lines.push('    for (let i = 0; i < keys.length; i++) {');
lines.push('      const k = keys[i];');
lines.push('      const v = table[k];');
lines.push('      if (!seen.has(k)) { seen.add(k); out.push(k); }');
lines.push('      const vu = (v ?? \'\').toUpperCase();');
lines.push('      if (vu.length > 0 && !seen.has(vu)) { seen.add(vu); out.push(v); }');
lines.push('    }');
lines.push('    return out;');
lines.push('  }');
lines.push('');
lines.push('  static hasDevice(libDevId: string): boolean {');
lines.push('    return PinIdRegistry.tableFor(libDevId) !== undefined;');
lines.push('  }');
lines.push('}');
lines.push('');

fs.writeFileSync(OUT, lines.join('\n'));
console.log('Wrote', OUT);

// Quick checks
const checks = [
  ['UA741', '3', 'IN+'],
  ['OSCILLOSCOPE', '1', 'CH1'],
  ['74HC00', '1', '1'],
  ['1N4148', '1', 'A'],
  ['LM7805', 'IN', '1']
];
let fail = 0;
for (const [lib, tok, want] of checks) {
  const m = outMaps[lib] || {};
  const got = m[tok.toUpperCase()];
  if (got !== want) {
    console.log('CHECK FAIL', lib, tok, '->', got, 'want', want);
    fail++;
  } else console.log('CHECK OK', lib, tok, '->', got);
}
process.exit(fail ? 1 : 0);
