import { readFileSync, writeFileSync } from 'fs';

const p = 'tools/pcb_templates/export.mjs';
let s = readFileSync(p, 'utf8');
const neu = readFileSync('tools/pcb_templates/_hand_analog_ic.mjs', 'utf8').trimEnd() + '\n\n';

const end = s.indexOf('function handLayoutLabDiscrete(doc)');
const startFn = s.indexOf('function handLayoutLabAnalogIc(doc)');
if (startFn < 0 || end < 0) {
  console.error('markers', startFn, end);
  process.exit(1);
}

// Remove ALL consecutive "模拟 IC" docblocks before the function
let cStart = startFn;
for (;;) {
  const chunk = s.slice(Math.max(0, cStart - 600), cStart);
  const m = chunk.match(/(\/\*\*[\s\S]*?模拟 IC[\s\S]*?\*\/)\s*$/);
  if (!m) break;
  cStart = cStart - m[0].length;
}

s = s.slice(0, cStart) + neu + s.slice(end);
writeFileSync(p, s);
console.log({
  nFn: (s.match(/function handLayoutLabAnalogIc/g) || []).length,
  nDoc: (s.match(/模拟 IC 检测手布/g) || []).length,
  has100: s.includes('b.x + 100')
});
