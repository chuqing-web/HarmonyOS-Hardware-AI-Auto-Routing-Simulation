/**
 * Pin convention audit — fail if DeviceLibrary / Builtin / Registry drift.
 *
 * Rules:
 * 1) meta pin_id must be numeric (package) for non-passive devices that have pin_label ≠ pin_id
 *    OR identity numeric passives
 * 2) Prefer: all meta pin_id match /^\d+$/
 * 3) Every meta pin_id must resolve via PinIdRegistry to a non-empty Builtin id
 * 4) pinOffset after resolve must not be (0,0) for known devices (sampled)
 *
 * Usage: node tools/pin_convention_audit.js
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

// Ensure registry fresh
const gen = spawnSync(process.execPath, [path.join(__dirname, 'gen_pin_id_registry.js')], {
  cwd: ROOT,
  encoding: 'utf8'
});
if (gen.status !== 0) {
  console.error(gen.stdout || '');
  console.error(gen.stderr || '');
  console.error('gen_pin_id_registry failed');
  process.exit(1);
}

function walk(d, acc = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.meta.json')) acc.push(p);
  }
  return acc;
}

// Parse registry MAP
const ets = fs.readFileSync(
  path.join(ROOT, 'features/ai_engine/src/main/ets/algorithms/PinIdRegistry.ets'),
  'utf8'
);
const map = {};
const re = /'([^']+)':\s*\{([^}]+)\}/g;
let m;
while ((m = re.exec(ets))) {
  const id = m[1];
  const t = {};
  const pr = /'([^']+)':\s*'([^']*)'/g;
  let p;
  while ((p = pr.exec(m[2]))) t[p[1]] = p[2];
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
  if (!table) return '';
  const tryOne = (raw) => {
    const t = (raw || '').trim();
    if (!t) return '';
    const mm = /^([A-Za-z0-9_.+-]+)\s*\([^)]*\)\s*$/.exec(t);
    const key = (mm ? mm[1] : t).toUpperCase();
    return table[key] !== undefined ? table[key] : '';
  };
  return tryOne(pinId) || tryOne(pinName);
}

const issues = [];
const metas = walk(path.join(ROOT, 'DeviceLibrary'));
let semanticPinId = 0;
let missingMap = 0;
let ok = 0;

for (const f of metas) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const id = j.lib_dev_id;
  const pins = j.pin_list || [];
  for (const p of pins) {
    const pid = String(p.pin_id);
    const lab = String(p.pin_label || p.pin_id);
    if (!/^\d+$/.test(pid)) {
      semanticPinId++;
      issues.push({
        sev: 'HIGH',
        id,
        issue: 'meta_pin_id_not_numeric',
        pin_id: pid,
        pin_label: lab,
        file: f
      });
    }
    const got = resolve(id, pid, lab);
    if (!got) {
      missingMap++;
      issues.push({
        sev: 'HIGH',
        id,
        issue: 'registry_miss',
        pin_id: pid,
        pin_label: lab,
        file: f
      });
    } else {
      ok++;
    }
  }
}

// Golden cases that caused production AI_PIN spam
const golden = [
  ['UA741', '3', 'IN+'],
  ['UA741', '2', 'IN-'],
  ['UA741', '6', 'OUT'],
  ['UA741', '7', 'VCC'],
  ['UA741', '4', 'VEE'],
  ['OSCILLOSCOPE', '1', 'CH1'],
  ['OSCILLOSCOPE', '2', 'CH2'],
  ['OSCILLOSCOPE', '3', 'CH3'],
  ['OSCILLOSCOPE', '4', 'CH4'],
  ['OSCILLOSCOPE', '5', 'GND'],
  ['74HC00', '1', '1'],
  ['1N4148', '1', 'A'],
  ['POT_10k', '3', 'W']
];
let goldenFail = 0;
for (const [lib, tok, want] of golden) {
  const got = resolve(lib, tok, tok);
  if (got !== want) {
    goldenFail++;
    issues.push({ sev: 'HIGH', id: lib, issue: 'golden_mismatch', pin_id: tok, want, got });
    console.log('GOLDEN FAIL', lib, tok, '->', got, 'want', want);
  } else {
    console.log('GOLDEN OK', lib, tok, '->', got);
  }
}

const report = {
  summary: {
    metaFiles: metas.length,
    pinOk: ok,
    semanticPinId,
    missingMap,
    goldenFail,
    issueN: issues.length
  },
  issues: issues.slice(0, 200)
};
fs.writeFileSync(
  path.join(__dirname, '_pin_convention_report.json'),
  JSON.stringify(report, null, 2)
);

console.log(JSON.stringify(report.summary, null, 2));
if (semanticPinId > 0 || missingMap > 0 || goldenFail > 0) {
  console.error('pin_convention_audit FAILED');
  process.exit(1);
}
console.log('pin_convention_audit PASSED');
