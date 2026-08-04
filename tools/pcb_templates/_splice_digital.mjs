import { readFileSync, writeFileSync } from 'fs';

const p = 'tools/pcb_templates/export.mjs';
let s = readFileSync(p, 'utf8');
const neu = readFileSync('tools/pcb_templates/_hand_digital.mjs', 'utf8').trimEnd() + '\n\n';

const startFn = s.indexOf('function handLayoutLabDigital(doc)');
if (startFn < 0) {
  console.error('function not found');
  process.exit(1);
}
let cStart = startFn;
for (;;) {
  const chunk = s.slice(Math.max(0, cStart - 500), cStart);
  const m = chunk.match(/(\/\*\*[\s\S]*?\*\/)\s*$/);
  if (!m || !m[0].includes('数字逻辑')) break;
  cStart -= m[0].length;
}
const end = s.indexOf('\nfunction main()', startFn);
if (end < 0) {
  console.error('main not found');
  process.exit(1);
}
s = s.slice(0, cStart) + neu + s.slice(end + 1);
writeFileSync(p, s);
console.log({
  nFn: (s.match(/function handLayoutLabDigital/g) || []).length,
  hasSignalComment: s.includes('每层都有信号走线'),
  noGndTrunkComment: !s.includes('In1.Cu — GND 干线')
});
