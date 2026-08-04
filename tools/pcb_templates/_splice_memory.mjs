import { readFileSync, writeFileSync } from 'fs';

const p = 'tools/pcb_templates/export.mjs';
let s = readFileSync(p, 'utf8');
const neu = readFileSync('tools/pcb_templates/_hand_memory.mjs', 'utf8').trimEnd() + '\n\n';

const startFn = s.indexOf('function handLayoutLabMemory');
if (startFn < 0) {
  console.error('handLayoutLabMemory not found');
  process.exit(1);
}
let cStart = startFn;
const before = s.slice(Math.max(0, startFn - 1200), startFn);
const m = before.match(/(\/\*\*[\s\S]*?\*\/)\s*$/);
if (m && m[0].includes('存储器')) cStart = startFn - m[0].length;

const end = s.indexOf('\nfunction main()', startFn);
const endCR = s.indexOf('\r\nfunction main()', startFn);
const endAt = end >= 0 ? end : endCR;
if (endAt < 0) {
  console.error('main not found');
  process.exit(1);
}
const keepFrom = s[endAt] === '\r' ? endAt + 2 : endAt + 1;
s = s.slice(0, cStart) + neu + s.slice(keepFrom);
writeFileSync(p, s);

const ok = s.includes("setPos('M3', 4200") && s.includes("add(e.net, gB, e.pB, wSig, 'In4.Cu')");
console.log({
  nFn: (s.match(/function handLayoutLabMemory/g) || []).length,
  wired: s.includes('route = handLayoutLabMemory'),
  ok
});
if (!ok) process.exit(1);
