import { readFileSync, writeFileSync } from 'fs';

const p = 'tools/pcb_templates/export.mjs';
let s = readFileSync(p, 'utf8');
const neu = readFileSync('tools/pcb_templates/_hand_mcu_stm32.mjs', 'utf8').trimEnd() + '\n\n';

if (s.includes('function handLayoutLabMcuStm32')) {
  const startFn = s.indexOf('function handLayoutLabMcuStm32');
  let cStart = startFn;
  const before = s.slice(Math.max(0, startFn - 800), startFn);
  const m = before.match(/(\/\*\*[\s\S]*?\*\/)\s*$/);
  if (m && m[0].includes('STM32')) cStart = startFn - m[0].length;
  const end8051 = s.indexOf('\nfunction handLayoutLabMcu8051', startFn);
  const endMem = s.indexOf('\nfunction handLayoutLabMemory', startFn);
  const endMain = s.indexOf('\nfunction main()', startFn);
  const endAt = [end8051, endMem, endMain].filter(x => x >= 0).sort((a, b) => a - b)[0];
  if (endAt === undefined) {
    console.error('end marker not found');
    process.exit(1);
  }
  s = s.slice(0, cStart) + neu + s.slice(endAt + 1);
} else {
  const mark = '\nfunction handLayoutLabMcu8051';
  const idx = s.indexOf(mark);
  if (idx < 0) {
    console.error('handLayoutLabMcu8051 not found for insert');
    process.exit(1);
  }
  s = s.slice(0, idx) + '\n' + neu + s.slice(idx + 1);
}

if (!s.includes("id === 'lab_mcu_stm32'")) {
  s = s.replace(
    "  if (id === 'lab_mcu_8051') {\n    n = 6;\n  }",
    "  if (id === 'lab_mcu_8051') {\n    n = 6;\n  }\n  if (id === 'lab_mcu_stm32') {\n    n = 6;\n  }"
  );
}

if (!s.includes("labId === 'lab_mcu_stm32'")) {
  s = s.replace(
    "  if (labId === 'lab_mcu_8051') return { w: 6200, h: 2800 };",
    "  if (labId === 'lab_mcu_8051') return { w: 6200, h: 2800 };\n  if (labId === 'lab_mcu_stm32') return { w: 9200, h: 3600 };"
  );
}

if (!s.includes('route = handLayoutLabMcuStm32')) {
  s = s.replace(
    "    } else if (id === 'lab_mcu_8051') {\n      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);\n      doc.tracks = [];\n      doc.vias = [];\n      doc.zones = [];\n      route = handLayoutLabMcu8051(doc);",
    "    } else if (id === 'lab_mcu_stm32') {\n      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);\n      doc.tracks = [];\n      doc.vias = [];\n      doc.zones = [];\n      route = handLayoutLabMcuStm32(doc);\n    } else if (id === 'lab_mcu_8051') {\n      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);\n      doc.tracks = [];\n      doc.vias = [];\n      doc.zones = [];\n      route = handLayoutLabMcu8051(doc);"
  );
}

const mountNeed = "id === 'lab_mcu_stm32'";
if (!s.includes(`lab_mcu_8051') || ${mountNeed}`) && !s.includes("lab_mcu_stm32') {\n      addCornerMountHoles") &&
    !s.includes("lab_memory' || id === 'lab_mcu_8051' || id === 'lab_mcu_stm32'")) {
  s = s.replace(
    "id === 'lab_memory' || id === 'lab_mcu_8051') {\n      addCornerMountHoles(doc, gndNet);\n    }",
    "id === 'lab_memory' || id === 'lab_mcu_8051' || id === 'lab_mcu_stm32') {\n      addCornerMountHoles(doc, gndNet);\n    }"
  );
  s = s.replace(
    "id === 'lab_memory' || id === 'lab_mcu_8051') ? ' [hand]' : '';",
    "id === 'lab_memory' || id === 'lab_mcu_8051' || id === 'lab_mcu_stm32') ? ' [hand]' : '';"
  );
}

writeFileSync(p, s);
console.log({
  nFn: (s.match(/function handLayoutLabMcuStm32/g) || []).length,
  wired: s.includes('route = handLayoutLabMcuStm32'),
  board: s.includes("lab_mcu_stm32') return { w:"),
  cu: /lab_mcu_stm32[\s\S]{0,40}n = 6/.test(s),
  qfp100: s.includes("id: 'FP_QFP100'"),
  tssop: s.includes("id: 'FP_TSSOP20'")
});
