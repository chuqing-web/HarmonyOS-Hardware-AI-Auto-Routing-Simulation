import { readFileSync, writeFileSync } from 'fs';

const p = 'tools/pcb_templates/export.mjs';
let s = readFileSync(p, 'utf8');
const neu = readFileSync('tools/pcb_templates/_hand_schmitt.mjs', 'utf8').trimEnd() + '\n\n';

if (s.includes('function handLayoutLabSchmitt')) {
  const startFn = s.indexOf('function handLayoutLabSchmitt');
  let cStart = startFn;
  const before = s.slice(Math.max(0, startFn - 900), startFn);
  const m = before.match(/(\/\*\*[\s\S]*?\*\/)\s*$/);
  if (m && m[0].includes('滞回')) cStart = startFn - m[0].length;
  const candidates = [
    s.indexOf('\nfunction handLayoutLabDigitalGates', startFn),
    s.indexOf('\nfunction handLayoutLabInstruments', startFn),
    s.indexOf('\nfunction handLayoutLabDigital(', startFn),
    s.indexOf('\nfunction main()', startFn)
  ].filter(x => x >= 0);
  const endAt = Math.min(...candidates);
  if (!Number.isFinite(endAt)) {
    console.error('end marker not found');
    process.exit(1);
  }
  s = s.slice(0, cStart) + neu + s.slice(endAt + 1);
} else {
  const mark = '\nfunction handLayoutLabDigitalGates';
  const idx = s.indexOf(mark);
  if (idx < 0) {
    console.error('insert mark not found');
    process.exit(1);
  }
  s = s.slice(0, idx) + '\n' + neu + s.slice(idx + 1);
}

if (!s.includes("if (id === 'lab_schmitt')")) {
  s = s.replace(
    "  if (id === 'lab_digital_gates') {\n    n = 4;\n  }",
    "  if (id === 'lab_digital_gates') {\n    n = 4;\n  }\n  if (id === 'lab_schmitt') {\n    n = 4;\n  }"
  );
}

if (!s.includes("labId === 'lab_schmitt'")) {
  s = s.replace(
    "  if (labId === 'lab_digital_gates') return { w: 6400, h: 3600 };",
    "  if (labId === 'lab_digital_gates') return { w: 6400, h: 3600 };\n  if (labId === 'lab_schmitt') return { w: 2800, h: 2000 };"
  );
}

if (!s.includes('route = handLayoutLabSchmitt')) {
  s = s.replace(
    "    } else if (id === 'lab_digital_gates') {\n      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);\n      doc.tracks = [];\n      doc.vias = [];\n      doc.zones = [];\n      route = handLayoutLabDigitalGates(doc);",
    "    } else if (id === 'lab_schmitt') {\n      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);\n      doc.tracks = [];\n      doc.vias = [];\n      doc.zones = [];\n      route = handLayoutLabSchmitt(doc);\n    } else if (id === 'lab_digital_gates') {\n      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);\n      doc.tracks = [];\n      doc.vias = [];\n      doc.zones = [];\n      route = handLayoutLabDigitalGates(doc);"
  );
}

s = s.replace(
  "id === 'lab_sensor' || id === 'lab_instruments' || id === 'lab_digital_gates') {\n      addCornerMountHoles(doc, gndNet);\n    }",
  "id === 'lab_sensor' || id === 'lab_instruments' || id === 'lab_digital_gates' || id === 'lab_schmitt') {\n      addCornerMountHoles(doc, gndNet);\n    }"
);
s = s.replace(
  "id === 'lab_sensor' || id === 'lab_instruments' || id === 'lab_digital_gates') ? ' [hand]' : '';",
  "id === 'lab_sensor' || id === 'lab_instruments' || id === 'lab_digital_gates' || id === 'lab_schmitt') ? ' [hand]' : '';"
);

writeFileSync(p, s);
console.log({
  nFn: (s.match(/function handLayoutLabSchmitt/g) || []).length,
  wired: s.includes('route = handLayoutLabSchmitt'),
  board: s.includes("lab_schmitt') return { w:"),
  cu4: s.includes("lab_schmitt') {\n    n = 4;")
});
