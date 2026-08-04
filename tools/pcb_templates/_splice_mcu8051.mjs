import { readFileSync, writeFileSync } from 'fs';

const p = 'tools/pcb_templates/export.mjs';
let s = readFileSync(p, 'utf8');
const neu = readFileSync('tools/pcb_templates/_hand_mcu8051.mjs', 'utf8').trimEnd() + '\n\n';

if (s.includes('function handLayoutLabMcu8051')) {
  const startFn = s.indexOf('function handLayoutLabMcu8051');
  let cStart = startFn;
  const before = s.slice(Math.max(0, startFn - 800), startFn);
  const m = before.match(/(\/\*\*[\s\S]*?\*\/)\s*$/);
  if (m && m[0].includes('8051')) cStart = startFn - m[0].length;
  const endMem = s.indexOf('\nfunction handLayoutLabMemory', startFn);
  const endMain = s.indexOf('\nfunction main()', startFn);
  const endAt = endMem >= 0 ? endMem : endMain;
  if (endAt < 0) {
    console.error('end marker not found');
    process.exit(1);
  }
  s = s.slice(0, cStart) + neu + s.slice(endAt + 1);
} else {
  const mark = '\nfunction handLayoutLabMemory';
  const idx = s.indexOf(mark);
  if (idx < 0) {
    console.error('handLayoutLabMemory not found for insert');
    process.exit(1);
  }
  s = s.slice(0, idx) + '\n' + neu + s.slice(idx + 1);
}

// copper: force 4 for lab_mcu_8051
if (!s.includes("id === 'lab_mcu_8051'")) {
  s = s.replace(
    "  if (id === 'lab_memory') {\n    n = 6;\n  }",
    "  if (id === 'lab_memory') {\n    n = 6;\n  }\n  if (id === 'lab_mcu_8051' || id === 'lab_51_led') {\n    n = 4;\n  }"
  );
}

// board size
if (!s.includes("labId === 'lab_mcu_8051'")) {
  s = s.replace(
    "  if (labId === 'lab_51_led') return { w: 2000, h: 2900 };",
    "  if (labId === 'lab_51_led') return { w: 2000, h: 2900 };\n  if (labId === 'lab_mcu_8051') return { w: 6200, h: 2800 };"
  );
}

// main wiring
if (!s.includes("route = handLayoutLabMcu8051")) {
  s = s.replace(
    "    } else if (id === 'lab_memory') {\n      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);\n      doc.tracks = [];\n      doc.vias = [];\n      doc.zones = [];\n      route = handLayoutLabMemory(doc);",
    "    } else if (id === 'lab_mcu_8051') {\n      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);\n      doc.tracks = [];\n      doc.vias = [];\n      doc.zones = [];\n      route = handLayoutLabMcu8051(doc);\n    } else if (id === 'lab_memory') {\n      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);\n      doc.tracks = [];\n      doc.vias = [];\n      doc.zones = [];\n      route = handLayoutLabMemory(doc);"
  );
}

// mount holes + hand tag
s = s.replace(
  "if (id === 'lab_power' || id === 'lab_amp' || id === 'lab_filter' || id === 'lab_51_led' || id === 'lab_memory') {\n      addCornerMountHoles(doc, gndNet);\n    }",
  "if (id === 'lab_power' || id === 'lab_amp' || id === 'lab_filter' || id === 'lab_51_led' || id === 'lab_memory' || id === 'lab_mcu_8051') {\n      addCornerMountHoles(doc, gndNet);\n    }"
);
s = s.replace(
  "const handTag = (id === 'lab_power' || id === 'lab_amp' || id === 'lab_filter' || id === 'lab_51_led' || id === 'lab_memory') ? ' [hand]' : '';",
  "const handTag = (id === 'lab_power' || id === 'lab_amp' || id === 'lab_filter' || id === 'lab_51_led' || id === 'lab_memory' || id === 'lab_mcu_8051') ? ' [hand]' : '';"
);

writeFileSync(p, s);
console.log({
  nFn: (s.match(/function handLayoutLabMcu8051/g) || []).length,
  wired: s.includes('route = handLayoutLabMcu8051'),
  board: s.includes("lab_mcu_8051') return { w:"),
  stc15: s.includes("lib.includes('stc15')")
});

// force Cu=6 for lab_mcu_8051
s = readFileSync(p, 'utf8');
if (s.includes("id === 'lab_mcu_8051' || id === 'lab_51_led'")) {
  s = s.replace(
    "  if (id === 'lab_mcu_8051' || id === 'lab_51_led') {\n    n = 4;\n  }",
    "  if (id === 'lab_mcu_8051') {\n    n = 6;\n  }\n  if (id === 'lab_51_led') {\n    n = 4;\n  }"
  );
  writeFileSync(p, s);
}
if (!s.includes("id === 'lab_mcu_8051'") || !s.match(/lab_mcu_8051[\s\S]{0,40}n = 6/)) {
  // already handled or need insert near lab_memory
  let t = readFileSync(p, 'utf8');
  if (!t.includes("if (id === 'lab_mcu_8051')")) {
    t = t.replace(
      "  if (id === 'lab_memory') {\n    n = 6;\n  }",
      "  if (id === 'lab_memory') {\n    n = 6;\n  }\n  if (id === 'lab_mcu_8051') {\n    n = 6;\n  }"
    );
    writeFileSync(p, t);
  }
}