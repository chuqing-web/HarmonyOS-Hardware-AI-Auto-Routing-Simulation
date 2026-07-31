import { readFileSync, writeFileSync } from 'fs';
const p = new URL('./export.mjs', import.meta.url);
let s = readFileSync(p, 'utf8');
const a = s.indexOf('function handLayoutLab51Led');
const b = s.indexOf('\nfunction main()', a);
let body = s.slice(a, b);
const reps = [
  ['smdToB(gnd, cx1b, -1, 14)', 'smdToB(gnd, cx1b, 0, 45, 14)'],
  ['smdToB(gnd, cx2b, -1, 14)', 'smdToB(gnd, cx2b, 0, 45, 14)'],
  ['smdToB(vcc, r1a, -1, 14)', 'smdToB(vcc, r1a, -45, 0, 14)'],
  ['smdToB(vcc, c3a, 1, 14)', 'smdToB(vcc, c3a, 45, 0, 14)'],
  ['smdToB(gnd, c3b, 1, 14)', 'smdToB(gnd, c3b, 45, 0, 14)'],
  ['smdToB(vcc, rpA, 1, 14)', 'smdToB(vcc, rpA, 45, 0, 14)'],
  ['smdToB(gnd, d9k, 1, 14)', 'smdToB(gnd, d9k, 0, 45, 14)'],
  ['smdToB(vcc, rlA, -1, 14)', 'smdToB(vcc, rlA, -45, 0, 14)'],
  ['smdToB(pwrLed, d9a, 1, 12)', 'smdToB(pwrLed, d9a, 45, 0, 12)'],
  ['const eRst = { x: uRst.x - 50, y: uRst.y };', 'const eRst = { x: uRst.x - 70, y: uRst.y };'],
];
for (const [x, y] of reps) body = body.split(x).join(y);
body = body.replace(
  `add(vcc, { x: ledVccX, y: pinY(1) }, { x: ledVccX, y: pinY(8) }, 16, 'B.Cu');
      add(vcc, { x: ledVccX, y: pinY(1) }, { x: vccRailX, y: pinY(1) }, 16, 'B.Cu');
      add(vcc, { x: vccRailX, y: pinY(1) }, { x: vccRailX, y: uVcc.y }, 16, 'B.Cu');`,
  `add(vcc, { x: ledVccX, y: pinY(1) }, { x: ledVccX, y: pinY(8) }, 16, 'B.Cu');
      const bridgeY = pinY(1) - 80;
      add(vcc, { x: ledVccX, y: pinY(1) }, { x: ledVccX, y: bridgeY }, 16, 'B.Cu');
      add(vcc, { x: ledVccX, y: bridgeY }, { x: vccRailX, y: bridgeY }, 16, 'B.Cu');
      add(vcc, { x: vccRailX, y: bridgeY }, { x: vccRailX, y: uVcc.y }, 16, 'B.Cu');`
);
writeFileSync(p, s.slice(0, a) + body + s.slice(b));
console.log('ok');
