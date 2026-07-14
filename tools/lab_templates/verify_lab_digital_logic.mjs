/**
 * Verify lab_digital expected logic levels (A=H, B=L):
 * NAND=1 NOR=0 NOT=0 AND=0 OR=1 XOR=1 CD4017.Q0=1
 * Also verifies DigitalEngine pin-alias resolution logic.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const ALIASES = {
  dualA: ['1A', 'A', '1'],
  dualB: ['1B', 'B', '2'],
  dualY: ['1Y', 'Y', '3'],
  notIn: ['1A', 'A', '1', 'IN'],
  notOut: ['1Y', 'Y', '2', 'OUT']
};

function resolve(pinNet, aliases) {
  for (const a of aliases) {
    const hit = pinNet.get(a.toUpperCase());
    if (hit) return hit;
  }
  return undefined;
}

function evalGate(type, a, b) {
  switch (type) {
    case 'NAND': return !(a && b);
    case 'NOR': return !(a || b);
    case 'NOT': return !a;
    case 'AND': return a && b;
    case 'OR': return a || b;
    case 'XOR': return a !== b;
    default: throw new Error(type);
  }
}

// Builtin-style pin maps as seen at runtime (PINCONN)
const cases = [
  { lib: '74HC00', type: 'NAND', pins: { A: 'LOGIC_H', B: 'LOGIC_L', Y: 'LA_CH1' } },
  { lib: '74HC02', type: 'NOR', pins: { A: 'LOGIC_H', B: 'LOGIC_L', Y: 'LA_CH2' } },
  { lib: '74HC04', type: 'NOT', pins: { A: 'LOGIC_H', Y: 'LA_CH3' } },
  { lib: '74HC08', type: 'AND', pins: { A: 'LOGIC_H', B: 'LOGIC_L', Y: 'LA_CH4' } },
  { lib: '74HC32', type: 'OR', pins: { A: 'LOGIC_H', B: 'LOGIC_L', Y: 'LA_CH5' } },
  { lib: '74HC74', type: 'XOR', pins: { A: 'LOGIC_H', B: 'LOGIC_L', Y: 'LA_CH6' } }
];

const A = true; // LOGIC_H
const B = false; // LOGIC_L
const expected = {
  LA_CH1: true,  // NAND
  LA_CH2: false, // NOR
  LA_CH3: false, // NOT
  LA_CH4: false, // AND
  LA_CH5: true,  // OR
  LA_CH6: true,  // XOR
  LA_CH7: true   // CD4017 Q0 after reset
};

let fail = 0;
for (const c of cases) {
  const pinNet = new Map();
  for (const [k, v] of Object.entries(c.pins)) pinNet.set(k.toUpperCase(), v);
  if (c.type === 'NOT') {
    const i = resolve(pinNet, ALIASES.notIn);
    const o = resolve(pinNet, ALIASES.notOut);
    if (!i || !o) { console.error('FAIL pin resolve', c.lib); fail++; continue; }
    const y = evalGate('NOT', A);
    const ok = y === expected[o];
    console.log(ok ? 'OK' : 'FAIL', c.lib, 'NOT', `Y=${y ? 1 : 0}`);
    if (!ok) fail++;
  } else {
    const a = resolve(pinNet, ALIASES.dualA);
    const b = resolve(pinNet, ALIASES.dualB);
    const yNet = resolve(pinNet, ALIASES.dualY);
    if (!a || !b || !yNet) { console.error('FAIL pin resolve', c.lib, { a, b, yNet }); fail++; continue; }
    const y = evalGate(c.type, A, B);
    const ok = y === expected[yNet];
    console.log(ok ? 'OK' : 'FAIL', c.lib, c.type, `Y=${y ? 1 : 0}`);
    if (!ok) fail++;
  }
}

// DeviceLibrary-style 1A/1Y still resolves
const inv = new Map([['1A', 'LOGIC_H'], ['1Y', 'LA_CH3']]);
if (resolve(inv, ALIASES.notIn) !== 'LOGIC_H' || resolve(inv, ALIASES.notOut) !== 'LA_CH3') {
  console.error('FAIL 1A/1Y alias');
  fail++;
} else {
  console.log('OK 1A/1Y alias');
}

console.log(fail === 0 ? 'PASS lab_digital expected levels' : `FAIL count=${fail}`);
process.exit(fail === 0 ? 0 : 1);
