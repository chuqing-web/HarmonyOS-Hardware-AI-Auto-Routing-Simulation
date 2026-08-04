import { readFileSync, writeFileSync } from 'fs';

const p = 'tools/pcb_templates/export.mjs';
let s = readFileSync(p, 'utf8');
const neu = readFileSync('tools/pcb_templates/_hand_peripheral.mjs', 'utf8').trimEnd() + '\n\n';

if (s.includes('function handLayoutLabPeripheral')) {
  const startFn = s.indexOf('function handLayoutLabPeripheral');
  let cStart = startFn;
  const before = s.slice(Math.max(0, startFn - 900), startFn);
  const m = before.match(/(\/\*\*[\s\S]*?\*\/)\s*$/);
  if (m && m[0].includes('外设')) cStart = startFn - m[0].length;
  const candidates = [
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
  const mark = '\nfunction handLayoutLabMcuStm32';
  const idx = s.indexOf(mark);
  if (idx < 0) {
    console.error('insert mark not found');
    process.exit(1);
  }
  s = s.slice(0, idx) + '\n' + neu + s.slice(idx + 1);
}

if (!s.includes("id === 'lab_peripheral'") || !/lab_peripheral[\s\S]{0,40}n = 6/.test(s)) {
  if (!s.includes("if (id === 'lab_peripheral')")) {
    s = s.replace(
      "  if (id === 'lab_mcu_stm32') {\n    n = 6;\n  }",
      "  if (id === 'lab_mcu_stm32') {\n    n = 6;\n  }\n  if (id === 'lab_peripheral') {\n    n = 6;\n  }"
    );
  }
}

if (!s.includes("labId === 'lab_peripheral'")) {
  s = s.replace(
    "  if (labId === 'lab_mcu_stm32') return { w: 9200, h: 3600 };",
    "  if (labId === 'lab_mcu_stm32') return { w: 9200, h: 3600 };\n  if (labId === 'lab_peripheral') return { w: 5600, h: 3600 };"
  );
}

if (!s.includes('route = handLayoutLabPeripheral')) {
  s = s.replace(
    "    } else if (id === 'lab_mcu_stm32') {\n      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);\n      doc.tracks = [];\n      doc.vias = [];\n      doc.zones = [];\n      route = handLayoutLabMcuStm32(doc);",
    "    } else if (id === 'lab_peripheral') {\n      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);\n      doc.tracks = [];\n      doc.vias = [];\n      doc.zones = [];\n      route = handLayoutLabPeripheral(doc);\n    } else if (id === 'lab_mcu_stm32') {\n      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);\n      doc.tracks = [];\n      doc.vias = [];\n      doc.zones = [];\n      route = handLayoutLabMcuStm32(doc);"
  );
}

s = s.replace(
  "id === 'lab_memory' || id === 'lab_mcu_8051' || id === 'lab_mcu_stm32') {\n      addCornerMountHoles(doc, gndNet);\n    }",
  "id === 'lab_memory' || id === 'lab_mcu_8051' || id === 'lab_mcu_stm32' || id === 'lab_peripheral') {\n      addCornerMountHoles(doc, gndNet);\n    }"
);
s = s.replace(
  "id === 'lab_memory' || id === 'lab_mcu_8051' || id === 'lab_mcu_stm32') ? ' [hand]' : '';",
  "id === 'lab_memory' || id === 'lab_mcu_8051' || id === 'lab_mcu_stm32' || id === 'lab_peripheral') ? ' [hand]' : '';"
);

writeFileSync(p, s);
console.log({
  nFn: (s.match(/function handLayoutLabPeripheral/g) || []).length,
  wired: s.includes('route = handLayoutLabPeripheral'),
  board: s.includes("lab_peripheral') return { w:"),
  lcd: s.includes("id: 'FP_LCD1602'"),
  oled: s.includes("id: 'FP_OLED'")
});
