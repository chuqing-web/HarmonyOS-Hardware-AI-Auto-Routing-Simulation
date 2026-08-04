import { readFileSync, writeFileSync } from 'fs';

const p = 'tools/pcb_templates/export.mjs';
let s = readFileSync(p, 'utf8');
const neu = readFileSync('tools/pcb_templates/_hand_555_astable.mjs', 'utf8').trimEnd() + '\n\n';

if (s.includes('function handLayoutLab555Astable')) {
  const startFn = s.indexOf('function handLayoutLab555Astable');
  let cStart = startFn;
  const before = s.slice(Math.max(0, startFn - 900), startFn);
  const m = before.match(/(\/\*\*[\s\S]*?\*\/)\s*$/);
  if (m && m[0].includes('555')) cStart = startFn - m[0].length;
  const candidates = [
    s.indexOf('\nfunction handLayoutLabIntegrator', startFn),
    s.indexOf('\nfunction handLayoutLabSchmitt', startFn),
    s.indexOf('\nfunction handLayoutLabDigitalGates', startFn),
    s.indexOf('\nfunction main()', startFn)
  ].filter(x => x >= 0);
  const endAt = Math.min(...candidates);
  if (!Number.isFinite(endAt)) {
    console.error('end marker not found');
    process.exit(1);
  }
  s = s.slice(0, cStart) + neu + s.slice(endAt + 1);
} else {
  const mark = '\nfunction handLayoutLabIntegrator';
  const idx = s.indexOf(mark);
  if (idx < 0) {
    console.error('insert mark not found');
    process.exit(1);
  }
  s = s.slice(0, idx) + '\n' + neu + s.slice(idx + 1);
}

if (!s.includes("if (id === 'lab_555_astable')")) {
  s = s.replace(
    "  if (id === 'lab_integrator') {\n    n = 4;\n  }",
    "  if (id === 'lab_integrator') {\n    n = 4;\n  }\n  if (id === 'lab_555_astable') {\n    n = 4;\n  }"
  );
}

if (!s.includes("labId === 'lab_555_astable'")) {
  s = s.replace(
    "  if (labId === 'lab_integrator') return { w: 3000, h: 2200 };",
    "  if (labId === 'lab_integrator') return { w: 3000, h: 2200 };\n  if (labId === 'lab_555_astable') return { w: 2800, h: 2400 }; // board H for GND bus"
  );
}

if (!s.includes('route = handLayoutLab555Astable')) {
  s = s.replace(
    "    } else if (id === 'lab_integrator') {\n      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);\n      doc.tracks = [];\n      doc.vias = [];\n      doc.zones = [];\n      route = handLayoutLabIntegrator(doc);",
    "    } else if (id === 'lab_555_astable') {\n      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);\n      doc.tracks = [];\n      doc.vias = [];\n      doc.zones = [];\n      route = handLayoutLab555Astable(doc);\n    } else if (id === 'lab_integrator') {\n      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);\n      doc.tracks = [];\n      doc.vias = [];\n      doc.zones = [];\n      route = handLayoutLabIntegrator(doc);"
  );
}

s = s.replace(
  "id === 'lab_schmitt' || id === 'lab_integrator') {\n      addCornerMountHoles(doc, gndNet);\n    }",
  "id === 'lab_schmitt' || id === 'lab_integrator' || id === 'lab_555_astable') {\n      addCornerMountHoles(doc, gndNet);\n    }"
);
s = s.replace(
  "id === 'lab_schmitt' || id === 'lab_integrator') ? ' [hand]' : '';",
  "id === 'lab_schmitt' || id === 'lab_integrator' || id === 'lab_555_astable') ? ' [hand]' : '';"
);

writeFileSync(p, s);
console.log({
  nFn: (s.match(/function handLayoutLab555Astable/g) || []).length,
  wired: s.includes('route = handLayoutLab555Astable'),
  board: s.includes("lab_555_astable') return { w:"),
  cu4: s.includes("lab_555_astable') {\n    n = 4;"),
  pinMap: s.includes('LM555_PIN_TO_PAD')
});
