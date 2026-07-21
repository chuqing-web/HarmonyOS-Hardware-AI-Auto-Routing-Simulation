import fs from 'fs';
const path = 'c:/Projects/ElecDraw_Harmony/tools/lab_templates/builders.mjs';
let s = fs.readFileSync(path, 'utf8');
s = s.replace(
  "p(led, 'K', 'K'), p(mcu, 'P1.0', 'P1.0')",
  'p(led, \'K\', \'K\'), p(mcu, `P1.${i}`, `P1.${i}`)'
);
s = s.replace(
  "K.ledBranch(doc, p(mcu, 'P1.0', 'P1.0')",
  "K.ledBranch(doc, p(mcu, 'PA0', 'PA0')"
);
s = s.replace(
  "K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(rDs, '2')]);",
  "K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(rDs, '2'), p(ds, 'VDD', 'VDD')]);"
);
s = s.replace(
  "K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(rHall, '1')]);",
  "K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(rHall, '1'), p(hall, 'VCC', 'VCC')]);"
);
s = s.replace(
  /K\.joinByLabel\(doc, 'GND', NetType\.GROUND, \[\s*p\(gndMem, '1', 'GND'\), p\(eprom, 'GND', 'GND'\), p\(sram, 'GND', 'GND'\),[\s\S]*?p\(sram, '26'\)\s*\]\);/,
  `K.joinByLabel(doc, 'GND', NetType.GROUND, [
    p(gndMem, '1', 'GND'), p(eprom, 'GND', 'GND'), p(sram, 'GND', 'GND')
  ]);`
);
fs.writeFileSync(path, s);
console.log('ok');
