/**
 * lab_mcu_8051: 每列 MCU.P1.0 ↔ LED.K 须双侧 stub+标号（防 GPIO_MISS）。
 */
import { resetSeq, K } from './kit.mjs';
import { TEMPLATE_DEFS } from './builders.mjs';

resetSeq();
const def = TEMPLATE_DEFS.find((d) => d.id === 'lab_mcu_8051');
const doc = K.createDoc(def.name, def.description);
def.build(doc);

const issues = [];
const byName = Object.fromEntries(doc.nets.map((n) => [n.name, n]));
const mcus = doc.components.filter((c) => /^U[1-4]$/.test(c.refDes)).sort(
  (a, b) => a.refDes.localeCompare(b.refDes)
);
if (mcus.length !== 4) {
  issues.push(`expected 4 MCUs, got ${mcus.length}`);
}

for (let i = 0; i < 4; i++) {
  const lk = byName[`L${i}_K`];
  const la = byName[`L${i}_A`];
  if (!lk || lk.pinIds.length < 2) {
    issues.push(`L${i}_K missing or <2 pins: ${lk?.pinIds?.join(',')}`);
  } else {
    const hasLedK = lk.pinIds.some((r) => r.includes(':K'));
    const hasP10 = lk.pinIds.some((r) => /:P1\.0(?::|$)/.test(r));
    const hasWrongGpio = lk.pinIds.some((r) => /:P1\.[1-7](?::|$)/.test(r));
    if (!hasLedK) issues.push(`L${i}_K missing LED.K`);
    if (!hasP10) issues.push(`L${i}_K missing MCU.P1.0 (got ${lk.pinIds.join(',')})`);
    if (hasWrongGpio) issues.push(`L${i}_K has non-P1.0 GPIO`);
  }
  if (!la || la.pinIds.length < 2) {
    issues.push(`L${i}_A incomplete`);
  }

  const labels = doc.netLabels.filter((l) => l.text === `L${i}_K`);
  if (labels.length < 2) {
    issues.push(`L${i}_K needs ≥2 net labels (LED+MCU stubs), got ${labels.length}`);
  }

  const mcu = mcus[i];
  if (mcu) {
    const p10 = K.pinWorld(mcu, 'P1.0', 'P1.0');
    const xtal1 = K.pinWorld(mcu, 'XTAL1', 'XTAL1');
    // 晶振区应在 XTAL 高度附近，勿远高于 P1.0（旧布局 y=40 竖线穿 P1 stub）
    const xtalComp = doc.components.find((c) => c.refDes === `Y${i + 1}`);
    if (xtalComp && xtalComp.position.y < p10.y + 40) {
      issues.push(
        `Y${i + 1} y=${xtalComp.position.y} too high vs P1.0@${p10.y} (risk stub/crystal collide)`
      );
    }
    if (xtalComp && Math.abs(xtalComp.position.y - xtal1.y) > 80) {
      issues.push(
        `Y${i + 1} y=${xtalComp.position.y} far from XTAL1@${xtal1.y}`
      );
    }
  }
}

console.log('nets L*_K', [0, 1, 2, 3].map((i) => `${i}:${byName[`L${i}_K`]?.pinIds?.length}`).join(' '));
console.log('labels', doc.netLabels.filter((l) => /^L\d_K$/.test(l.text)).length);
console.log('wires', doc.wires.length);
if (issues.length) {
  console.log('FAIL');
  for (const it of issues) console.log(' ', it);
  process.exit(1);
}
console.log('lab_mcu_8051 P1.0 joinByLabel OK');
