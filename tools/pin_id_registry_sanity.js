/**
 * Sanity: PinIdRegistry numeric→semantic + non-center offsets for HIGH devices.
 * Mimics TemplateSchematicKit.pinOffset resolve-then-switch for key devices.
 */
const fs = require('fs');
const path = require('path');

// Load MAP from generated ets (parse string literals)
const ets = fs.readFileSync(
  path.join(__dirname, '../features/ai_engine/src/main/ets/algorithms/PinIdRegistry.ets'),
  'utf8'
);
const map = {};
const re = /'([^']+)':\s*\{([^}]+)\}/g;
let m;
while ((m = re.exec(ets))) {
  const id = m[1];
  const body = m[2];
  const t = {};
  const pr = /'([^']+)':\s*'([^']*)'/g;
  let p;
  while ((p = pr.exec(body))) t[p[1]] = p[2];
  map[id] = t;
}

function familyKey(lib) {
  const u = (lib || '').toUpperCase();
  if (u.startsWith('POT_')) return 'POT_*';
  if (u.startsWith('LED_')) return 'LED_*';
  if (u.startsWith('1N') || u.indexOf('DIODE') >= 0) return '1N*';
  return u;
}
function resolve(lib, pinId, pinName = '') {
  const table = map[(lib || '').toUpperCase()] || map[familyKey(lib)];
  if (!table) return pinId;
  const tryOne = (raw) => {
    const t = (raw || '').trim();
    if (!t) return '';
    const mm = /^([A-Za-z0-9_.+-]+)\s*\([^)]*\)\s*$/.exec(t);
    const key = (mm ? mm[1] : t).toUpperCase();
    return table[key] !== undefined ? table[key] : '';
  };
  return tryOne(pinId) || tryOne(pinName) || pinId;
}

const cases = [
  ['UA741', '3', 'IN+', [-30, -10]],
  ['UA741', '2', 'IN-', [-30, 10]],
  ['UA741', '6', 'OUT', [30, 0]],
  ['OSCILLOSCOPE', '1', 'CH1', null],
  ['OSCILLOSCOPE', '5', 'GND', null],
  ['1N4148', '1', 'A', null],
  ['1N4148', '2', 'K', null],
  ['LED_RED', '1', 'A', null],
  ['2N2222', '1', 'B', null],
  ['2N7000', '1', 'G', null],
  ['LM2596', '1', 'VIN', null],
  ['AMMETER_DC', '1', 'I+', null],
  ['VOLTMETER_DC', '1', 'V+', null],
  ['UART_TERMINAL', '1', 'TX', null],
  ['LOGIC_ANALYZER', '9', 'GND', null],
  ['POT_10k', '3', 'W', null],
  ['RELAY_SPDT', '3', 'COM', null],
  ['CD4017', '1', 'Q5', null],
  ['LCD1602', '1', 'VSS', null],
  ['24C02', '5', 'SDA', null],
  ['W25Q64', '1', 'CS', null],
  ['OLED_12864', '1', 'VCC', null],
  ['DS18B20', '2', 'DQ', null],
  ['HALL_SENSOR', '2', 'OUT', null],
  ['LM555', '1', 'GND', null],
  ['LM358', '1', 'OUT1', null],
  ['SIGNAL_GEN', '1', 'OUT', null],
  ['VIRTUAL_METER', '1', 'V', null],
  ['POWER_METER', '3', 'I+', null],
  ['FREQ_COUNTER', '1', 'IN', null],
];

let fail = 0;
for (const [lib, num, want] of cases) {
  const got = resolve(lib, num, num);
  if (got !== want) {
    console.log('FAIL', lib, num, '->', got, 'want', want);
    fail++;
  } else {
    console.log('OK', lib, num, '->', got);
  }
}
console.log(fail === 0 ? `ALL PASS (${cases.length})` : `FAILS=${fail}`);
process.exit(fail ? 1 : 0);
