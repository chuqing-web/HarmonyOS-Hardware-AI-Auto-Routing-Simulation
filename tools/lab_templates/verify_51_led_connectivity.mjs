/**
 * lab_51_led: L*_A 物理串联；L*_K 可为 stub+标号；VCC/GND 可混标号。
 */
import { resetSeq, K } from './kit.mjs';
import { TEMPLATE_DEFS } from './builders.mjs';

resetSeq();
const def = TEMPLATE_DEFS.find((d) => d.id === 'lab_51_led');
const doc = K.createDoc(def.name, def.description);
def.build(doc);

const issues = [];
const byName = Object.fromEntries(doc.nets.map((n) => [n.name, n]));
for (const name of ['GND', 'VCC']) {
  if (!byName[name] || byName[name].pinIds.length < 3) {
    issues.push(`${name} missing or too few pins`);
  }
}
for (let i = 0; i < 8; i++) {
  const a = byName[`L${i}_A`];
  const k = byName[`L${i}_K`];
  if (!a || a.pinIds.length < 2) issues.push(`L${i}_A incomplete`);
  if (!k || k.pinIds.length < 2) issues.push(`L${i}_K incomplete`);
  // anode / cathode 均可 stub+标号（避免密排布线 T 结）；须绑定 R/LED/MCU
  const hasRl = (a?.pinIds || []).some((r) => /:2:|:1:/.test(r) || r.includes(':2'));
  const hasLedA = (a?.pinIds || []).some((r) => r.includes(':A'));
  if (a && (!hasLedA || a.pinIds.length < 2)) issues.push(`L${i}_A missing R–LED.A`);
  // cathode: stub+label OK — must still bind LED.K and MCU.P1.i
  const hasLedK = (k?.pinIds || []).some((r) => r.includes(':K'));
  const hasMcuP = (k?.pinIds || []).some((r) => new RegExp(`:P1\\.${i}:`).test(r));
  if (k && (!hasLedK || !hasMcuP)) {
    issues.push(`L${i}_K missing LED.K or MCU.P1.${i}`);
  }
}
const m1 = doc.components.find((c) => c.refDes === 'M1');
const m1Nets = [];
for (const n of doc.nets) {
  for (const r of n.pinIds) {
    if (r.startsWith(m1.id + ':')) m1Nets.push(`${r.split(':')[1]}@${n.name}`);
  }
}
if (!m1Nets.includes('V+@VCC')) issues.push(`M1.V+ not VCC: ${m1Nets}`);
if (!m1Nets.includes('COM@GND')) issues.push(`M1.COM not GND: ${m1Nets}`);

console.log('VCC pins', byName.VCC?.pinIds.length, 'GND pins', byName.GND?.pinIds.length);
console.log('M1', m1Nets.join(' '));
console.log('wires', doc.wires.length, 'labels', doc.netLabels.length);
if (issues.length) {
  console.log('FAIL');
  for (const it of issues) console.log(' ', it);
  process.exit(1);
}
console.log('lab_51_led hybrid OK');
