/**
 * Hybrid connectivity: multi-pin nets must be linked by physical wires and/or net labels.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetSeq, K } from './kit.mjs';
import { TEMPLATE_DEFS } from './builders.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

function isAuto(text) {
  return !text || /^NET_\d+$/i.test(text) || /^net_topo/i.test(text);
}

function verifyDoc(doc) {
  const labeled = new Set();
  for (const lb of doc.netLabels || []) {
    if (!isAuto(lb.text)) labeled.add(lb.text);
  }
  const wireNetIds = new Set(doc.wires.map((w) => w.netId));
  const issues = [];
  for (const net of doc.nets) {
    if (isAuto(net.name) || net.pinIds.length < 2) continue;
    const hasWire = wireNetIds.has(net.id);
    const hasLabel = labeled.has(net.name);
    if (!hasWire && !hasLabel) {
      issues.push(`"${net.name}" has ${net.pinIds.length} pins but no wire and no label`);
    }
  }
  return issues;
}

let fail = 0;
for (const def of TEMPLATE_DEFS) {
  resetSeq();
  const doc = K.createDoc(def.name, def.description);
  def.build(doc);
  const issues = verifyDoc(doc);
  const schPath = join(ROOT, 'Test_Template', `${def.id}.schsim`);
  try {
    const raw = JSON.parse(readFileSync(schPath, 'utf8'));
    const nll = raw?.topology?.netLabelList;
    if (!Array.isArray(nll)) {
      issues.push('exported .schsim missing topology.netLabelList array');
    }
  } catch (e) {
    issues.push(`read schsim: ${e.message}`);
  }
  const labeled = (doc.netLabels || []).length;
  const wires = doc.wires.length;
  if (issues.length) {
    fail++;
    console.log(`[FAIL] ${def.id} wires=${wires} labels=${labeled}`);
    for (const it of issues.slice(0, 8)) console.log('  ', it);
  } else {
    console.log(`[ok] ${def.id} wires=${wires} labels=${labeled} nets=${doc.nets.length}`);
  }
}
console.log(fail ? `FAILED ${fail}` : 'ALL CONNECTIVITY CHECKS PASSED');
process.exit(fail ? 1 : 0);
