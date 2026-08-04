import { readFileSync, writeFileSync } from 'fs';

const p = 'tools/pcb_templates/export.mjs';
let s = readFileSync(p, 'utf8');
const neu = readFileSync('tools/pcb_templates/_hand_sensor.mjs', 'utf8').trimEnd() + '\n\n';

if (s.includes('function handLayoutLabSensor')) {
  const startFn = s.indexOf('function handLayoutLabSensor');
  let cStart = startFn;
  const before = s.slice(Math.max(0, startFn - 900), startFn);
  const m = before.match(/(\/\*\*[\s\S]*?\*\/)\s*$/);
  if (m && m[0].includes('传感器')) cStart = startFn - m[0].length;
  const candidates = [
    s.indexOf('\nfunction handLayoutLabPeripheral', startFn),
    s.indexOf('\nfunction handLayoutLabMcuStm32', startFn),
    s.indexOf('\nfunction handLayoutLabMcu8051', startFn),
    s.indexOf('\nfunction handLayoutLabMemory', startFn),
    s.indexOf('\nfunction main()', startFn)
  ].filter(x => x >= 0);
  const endAt = Math.min(...candidates);
  if (!Number.isFinite(endAt)) {
    console.error('end marker not found');
    process.exit(1);
  }
  s = s.slice(0, cStart) + neu + s.slice(endAt + 1);
} else {
  const mark = '\nfunction handLayoutLabPeripheral';
  const idx = s.indexOf(mark);
  if (idx < 0) {
    console.error('insert mark not found');
    process.exit(1);
  }
  s = s.slice(0, idx) + '\n' + neu + s.slice(idx + 1);
}

if (!s.includes("id === 'lab_sensor'") || !/lab_sensor[\s\S]{0,40}n = 6/.test(s)) {
  if (!s.includes("if (id === 'lab_sensor')")) {
    s = s.replace(
      "  if (id === 'lab_peripheral') {\n    n = 6;\n  }",
      "  if (id === 'lab_peripheral') {\n    n = 6;\n  }\n  if (id === 'lab_sensor') {\n    n = 6;\n  }"
    );
  }
}

if (!s.includes("labId === 'lab_sensor'")) {
  s = s.replace(
    "  if (labId === 'lab_peripheral') return { w: 6200, h: 4000 };",
    "  if (labId === 'lab_peripheral') return { w: 6200, h: 4000 };\n  if (labId === 'lab_sensor') return { w: 5600, h: 3600 };"
  );
}

if (!s.includes('route = handLayoutLabSensor')) {
  s = s.replace(
    "    } else if (id === 'lab_peripheral') {\n      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);\n      doc.tracks = [];\n      doc.vias = [];\n      doc.zones = [];\n      route = handLayoutLabPeripheral(doc);",
    "    } else if (id === 'lab_sensor') {\n      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);\n      doc.tracks = [];\n      doc.vias = [];\n      doc.zones = [];\n      route = handLayoutLabSensor(doc);\n    } else if (id === 'lab_peripheral') {\n      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);\n      doc.tracks = [];\n      doc.vias = [];\n      doc.zones = [];\n      route = handLayoutLabPeripheral(doc);"
  );
}

s = s.replace(
  "id === 'lab_memory' || id === 'lab_mcu_8051' || id === 'lab_mcu_stm32' || id === 'lab_peripheral') {\n      addCornerMountHoles(doc, gndNet);\n    }",
  "id === 'lab_memory' || id === 'lab_mcu_8051' || id === 'lab_mcu_stm32' || id === 'lab_peripheral' || id === 'lab_sensor') {\n      addCornerMountHoles(doc, gndNet);\n    }"
);
s = s.replace(
  "id === 'lab_memory' || id === 'lab_mcu_8051' || id === 'lab_mcu_stm32' || id === 'lab_peripheral') ? ' [hand]' : '';",
  "id === 'lab_memory' || id === 'lab_mcu_8051' || id === 'lab_mcu_stm32' || id === 'lab_peripheral' || id === 'lab_sensor') ? ' [hand]' : '';"
);

writeFileSync(p, s);
console.log({
  nFn: (s.match(/function handLayoutLabSensor/g) || []).length,
  wired: s.includes('route = handLayoutLabSensor'),
  board: s.includes("lab_sensor') return { w:"),
  to92: s.includes("id: 'FP_TO92_SENSOR'"),
  pot: s.includes("id: 'FP_POT3'")
});
