const fs = require('fs');
const named = fs.readFileSync('features/component_library/src/main/ets/data/NamedDevicePins.ets', 'utf8');

function defs(name) {
  const m = named.match(new RegExp('export function ' + name + '[\\s\\S]*?\\n\\}'));
  if (!m) return [];
  const ids = [];
  const re = /(?:io|inp|out|pwr|gnd)\(`([^`]+)`\)|(?:io|inp|out|pwr|gnd)\('([^']+)'\)/g;
  let x;
  while ((x = re.exec(m[0]))) ids.push(x[1] || x[2]);
  return ids;
}

const maps = {
  CD4017: defs('defsCd4017'),
  LCD1602: defs('defsLcd1602'),
  '24C02': defs('defs24C02'),
  W25Q64: defs('defsW25Q64'),
  '2764': defs('defs2764'),
  '62256': defs('defs62256'),
  '8051': defs('defs8051Dip40'),
  stm48: defs('defsStm32Teaching48'),
  stm32: defs('defsStm32Teaching32'),
  stm100: defs('defsStm32Teaching100')
};

for (const [k, v] of Object.entries(maps)) {
  const proposed = {};
  v.forEach((id, i) => { proposed[String(i + 1)] = id; });
  console.log('\n' + k + ' count=' + v.length);
  console.log('ids: ' + v.join(','));
  console.log('map: ' + JSON.stringify(proposed));
}

const r = JSON.parse(fs.readFileSync('tools/_pin_mismatch_report.json', 'utf8'));
const mcus = r.all.filter(x => /^(STM|AT89|STC)/.test(x.id));
console.log('\nMCU:', JSON.stringify(mcus.map(x => ({
  id: x.id, risk: x.risk, builtinStyle: x.builtinStyle,
  n: (x.builtinIds || []).length, issues: x.issues
})), null, 2));

const low = r.all.filter(x => x.risk === 'LOW' && !x.issues.includes('passive_numeric_ok'));
console.log('\nLOW non-passive:', low.map(x => x.id + ' [' + x.issues.join(',') + ']'));

// Meta pin_label based maps for HIGH devices
const path = require('path');
function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (ent.name.endsWith('.meta.json')) acc.push(p);
  }
  return acc;
}
const highs = new Set(r.highRisk.map(x => x.id));
console.log('\n=== HIGH proposed from meta pin_label ===');
for (const p of walk('DeviceLibrary')) {
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!highs.has(j.lib_dev_id)) continue;
  const map = {};
  for (const pin of j.pin_list || []) {
    map[String(pin.pin_id)] = String(pin.pin_label ?? pin.pin_id);
  }
  console.log(j.lib_dev_id + ': ' + JSON.stringify(map));
}
