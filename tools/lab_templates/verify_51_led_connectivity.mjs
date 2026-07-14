/**
 * lab_51_led: local LED nets should be physical wires; VCC/GND may mix labels.
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
  // local LED chains should have physical wires (no exclusive label-only)
  const aWires = doc.wires.filter((w) => w.netId === a?.id);
  if (a && aWires.length === 0) issues.push(`L${i}_A should be physically wired`);
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
