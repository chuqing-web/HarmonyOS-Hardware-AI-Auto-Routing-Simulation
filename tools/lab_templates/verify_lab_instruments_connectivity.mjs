/**
 * lab_instruments: 全套仪器 + 四端万用表五档 DUT
 * VM1: V→CLK, A 串联 LED, OHM→R_1k+二极管, COM→GND
 */
import { resetSeq, K } from './kit.mjs';
import { TEMPLATE_DEFS } from './builders.mjs';

resetSeq();
const def = TEMPLATE_DEFS.find((d) => d.id === 'lab_instruments');
const doc = K.createDoc(def.name, def.description);
def.build(doc);

const issues = [];

function pinNets(refDes) {
  const comp = doc.components.find((c) => c.refDes === refDes);
  if (!comp) {
    issues.push(`missing component ${refDes}`);
    return null;
  }
  const map = {};
  for (const n of doc.nets) {
    for (const r of n.pinIds) {
      if (!r.startsWith(comp.id + ':')) continue;
      const parts = r.split(':');
      const pin = parts[2] || parts[1];
      map[pin] = n.name || n.id;
    }
  }
  return map;
}

function requireLib(id) {
  if (!doc.components.some((c) => c.libraryId === id)) {
    issues.push(`missing libraryId ${id}`);
  }
}

for (const id of [
  'VCC', 'GND', 'SIGNAL_GEN', 'AMMETER_DC', 'POWER_METER', 'R_10k', 'R_1k', 'R_330',
  'POT_10k', 'LED_RED', '1N4148', 'VOLTMETER_DC', 'VIRTUAL_METER', 'FREQ_COUNTER',
  'OSCILLOSCOPE', 'CD4017', 'LOGIC_ANALYZER', 'UART_TERMINAL'
]) {
  requireLib(id);
}

const a1 = pinNets('A1');
if (a1) {
  if (!a1['I+'] || !a1['I-']) issues.push('A1 missing I+/I-');
  else if (a1['I+'] === a1['I-']) issues.push(`A1 I+/I- same net ${a1['I+']}`);
  else if (a1['I+'] !== 'VCC') issues.push(`A1.I+ expected VCC got ${a1['I+']}`);
}

const pm = pinNets('PM1');
if (pm) {
  for (const p of ['V+', 'V-', 'I+', 'I-']) {
    if (!pm[p]) issues.push(`PM1 missing ${p}`);
  }
  if (pm['I+'] && pm['I-'] && pm['I+'] === pm['I-']) {
    issues.push(`PM1 I+/I- same net ${pm['I+']}`);
  }
  if (pm['V+'] && pm['V-'] && pm['V+'] === pm['V-']) {
    issues.push(`PM1 V+/V- same net ${pm['V+']}`);
  }
  if (pm['I+'] && pm['I-'] && pm['V+'] && pm['V-'] &&
    pm['I+'] === pm['V+'] && pm['I-'] === pm['V-']) {
    issues.push('PM1 I path identical to V path (not series)');
  }
}

const m1 = pinNets('M1');
if (m1) {
  if (m1['V+'] !== 'MID') issues.push(`M1.V+ expected MID got ${m1['V+']}`);
  if (m1['COM'] !== 'GND') issues.push(`M1.COM expected GND got ${m1['COM']}`);
}

const vm1 = pinNets('VM1');
if (vm1) {
  for (const p of ['V', 'A', 'OHM', 'COM']) {
    if (!vm1[p]) issues.push(`VM1 missing ${p}`);
  }
  if (vm1['V'] !== 'CLK') issues.push(`VM1.V expected CLK (DCV/ACV) got ${vm1['V']}`);
  if (vm1['COM'] !== 'GND') issues.push(`VM1.COM expected GND got ${vm1['COM']}`);
  if (vm1['OHM'] !== 'DMM_OHM') issues.push(`VM1.OHM expected DMM_OHM got ${vm1['OHM']}`);
  if (vm1['A'] && vm1['COM'] && vm1['A'] === vm1['COM']) {
    issues.push('VM1 A/COM same net — AMP not series');
  }
  if (vm1['A'] && !String(vm1['A']).includes('DMM_A')) {
    issues.push(`VM1.A expected DMM_A* series net got ${vm1['A']}`);
  }
}

const fc = pinNets('FC1');
if (fc) {
  if (fc['IN'] !== 'CLK') issues.push(`FC1.IN expected CLK got ${fc['IN']}`);
  if (fc['GND'] !== 'GND') issues.push(`FC1.GND expected GND got ${fc['GND']}`);
}

const osc = pinNets('OSC1');
if (osc) {
  const expect = { CH1: 'CLK', CH2: 'HI', CH3: 'MID', CH4: 'TOP', GND: 'GND' };
  for (const [p, n] of Object.entries(expect)) {
    if (osc[p] !== n) issues.push(`OSC1.${p} expected ${n} got ${osc[p]}`);
  }
}

const la = pinNets('LA1');
if (la) {
  if (la['GND'] !== 'GND') issues.push(`LA1.GND expected GND got ${la['GND']}`);
  if (la['CH8'] !== 'CLK') issues.push(`LA1.CH8 expected CLK got ${la['CH8']}`);
}

const term = pinNets('TERM1');
if (term) {
  if (!term['TX'] || !term['RX'] || term['GND'] !== 'GND') {
    issues.push(`TERM1 incomplete: ${JSON.stringify(term)}`);
  } else if (term['TX'] !== term['RX']) {
    issues.push(`TERM1 TX/RX not looped`);
  }
}

console.log('components', doc.components.map((c) => c.refDes).join(','));
console.log('VM1', vm1);
console.log('wires', doc.wires.length, 'labels', doc.netLabels.length);
if (issues.length) {
  console.log('FAIL');
  for (const it of issues) console.log(' ', it);
  process.exit(1);
}
console.log('lab_instruments DMM+instruments connectivity OK');
