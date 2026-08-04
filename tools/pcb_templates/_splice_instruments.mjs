import { readFileSync, writeFileSync } from 'fs';

const p = 'tools/pcb_templates/export.mjs';
let s = readFileSync(p, 'utf8');
const neu = readFileSync('tools/pcb_templates/_hand_instruments.mjs', 'utf8').trimEnd() + '\n\n';

if (s.includes('function handLayoutLabInstruments')) {
  const startFn = s.indexOf('function handLayoutLabInstruments');
  let cStart = startFn;
  const before = s.slice(Math.max(0, startFn - 900), startFn);
  const m = before.match(/(\/\*\*[\s\S]*?\*\/)\s*$/);
  if (m && m[0].includes('仪器')) cStart = startFn - m[0].length;
  const candidates = [
    s.indexOf('\nfunction handLayoutLabSensor', startFn),
    s.indexOf('\nfunction handLayoutLabPeripheral', startFn),
    s.indexOf('\nfunction handLayoutLabMcuStm32', startFn),
    s.indexOf('\nfunction main()', startFn)
  ].filter(x => x >= 0);
  const endAt = Math.min(...candidates);
  if (!Number.isFinite(endAt)) {
    console.error('end marker not found');
    process.exit(1);
  }
  s = s.slice(0, cStart) + neu + s.slice(endAt + 1);
} else {
  const mark = '\nfunction handLayoutLabSensor';
  const idx = s.indexOf(mark);
  if (idx < 0) {
    console.error('insert mark not found');
    process.exit(1);
  }
  s = s.slice(0, idx) + '\n' + neu + s.slice(idx + 1);
}

if (!s.includes("if (id === 'lab_instruments')")) {
  s = s.replace(
    "  if (id === 'lab_sensor') {\n    n = 6;\n  }",
    "  if (id === 'lab_sensor') {\n    n = 6;\n  }\n  if (id === 'lab_instruments') {\n    n = 6;\n  }"
  );
}

if (!s.includes("labId === 'lab_instruments'")) {
  s = s.replace(
    "  if (labId === 'lab_sensor') return { w: 5600, h: 3600 };",
    "  if (labId === 'lab_sensor') return { w: 5600, h: 3600 };\n  if (labId === 'lab_instruments') return { w: 7200, h: 4200 };"
  );
}

if (!s.includes('route = handLayoutLabInstruments')) {
  s = s.replace(
    "    } else if (id === 'lab_sensor') {\n      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);\n      doc.tracks = [];\n      doc.vias = [];\n      doc.zones = [];\n      route = handLayoutLabSensor(doc);",
    "    } else if (id === 'lab_instruments') {\n      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);\n      doc.tracks = [];\n      doc.vias = [];\n      doc.zones = [];\n      route = handLayoutLabInstruments(doc);\n    } else if (id === 'lab_sensor') {\n      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);\n      doc.tracks = [];\n      doc.vias = [];\n      doc.zones = [];\n      route = handLayoutLabSensor(doc);"
  );
}

s = s.replace(
  "id === 'lab_peripheral' || id === 'lab_sensor') {\n      addCornerMountHoles(doc, gndNet);\n    }",
  "id === 'lab_peripheral' || id === 'lab_sensor' || id === 'lab_instruments') {\n      addCornerMountHoles(doc, gndNet);\n    }"
);
s = s.replace(
  "id === 'lab_peripheral' || id === 'lab_sensor') ? ' [hand]' : '';",
  "id === 'lab_peripheral' || id === 'lab_sensor' || id === 'lab_instruments') ? ' [hand]' : '';"
);

writeFileSync(p, s);
console.log({
  nFn: (s.match(/function handLayoutLabInstruments/g) || []).length,
  wired: s.includes('route = handLayoutLabInstruments'),
  board: s.includes("lab_instruments') return { w:"),
  hdr10: s.includes('defPinHeader(10)')
});
