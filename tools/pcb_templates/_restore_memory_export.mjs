/**
 * Reconstruct lost export.mjs pieces for lab_memory (and deps),
 * then splice handLayoutLabMemory and wire main — without wiping the file.
 */
import { readFileSync, writeFileSync, copyFileSync } from 'fs';

const p = 'tools/pcb_templates/export.mjs';
copyFileSync(p, 'tools/pcb_templates/export.mjs.bak_restore');
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

function mustInclude(label, needle) {
  if (!s.includes(needle)) throw new Error('missing expected: ' + label);
}

function replaceOnce(label, oldStr, newStr) {
  if (!s.includes(oldStr)) {
    // already applied?
    if (s.includes(newStr.slice(0, Math.min(80, newStr.length))) ||
        (label.includes('optional') && true)) {
      console.log('skip (already?)', label);
      return;
    }
    throw new Error('old_string not found: ' + label);
  }
  const i = s.indexOf(oldStr);
  s = s.slice(0, i) + newStr + s.slice(i + oldStr.length);
  console.log('ok', label);
}

// ——— 1) STM32 helpers + pin maps after isMcu51Lib ———
if (!s.includes('function isMcuStm32F103C8Lib')) {
  replaceOnce('stm32+maps',
`function isMcu51Lib(libDevId) {
  const lib = (libDevId || '').toLowerCase();
  return lib.includes('at89') || lib.includes('at89c51') || lib.includes('8051') ||
    lib.includes('stc89') || lib.includes('stc90') || lib === 'mcs51';
}`,
`function isMcu51Lib(libDevId) {
  const lib = (libDevId || '').toLowerCase();
  return lib.includes('at89') || lib.includes('at89c51') || lib.includes('8051') ||
    lib.includes('stc89') || lib.includes('stc90') || lib === 'mcs51';
}

function isMcuStm32F103C8Lib(libDevId) {
  const lib = (libDevId || '').toLowerCase();
  return lib.includes('stm32f103c8') || lib === 'stm32f103c8tx' ||
    lib.includes('stm32f103rc') || lib.includes('stm32f103');
}

/** STM32F103C8/RC 教学 LQFP-48：符号脚名 → 焊盘号（含 PC0–7 教学脚） */
const STM32F103C8_PIN_TO_PAD = new Map([
  ['OSC_IN', '5'], ['PD0', '5'],
  ['OSC_OUT', '6'], ['PD1', '6'],
  ['NRST', '7'], ['RESET', '7'],
  ['VSSA', '8'],
  ['VDDA', '9'],
  ['PA0', '10'], ['PA1', '11'], ['PA2', '12'], ['PA3', '13'],
  ['PA4', '14'], ['PA5', '15'], ['PA6', '16'], ['PA7', '17'],
  ['PB0', '18'], ['PB1', '19'], ['PB2', '20'],
  ['PB10', '21'], ['PB11', '22'],
  ['VSS', '23'], ['VSS_1', '23'], ['VSS_2', '35'], ['VSS_3', '47'],
  ['VDD', '24'], ['VDD_1', '24'], ['VDD_2', '36'], ['VDD_3', '48'],
  ['PB12', '25'],
  ['PA8', '29'], ['PA9', '30'], ['PA10', '31'], ['PA11', '32'],
  ['PA12', '33'], ['PA13', '34'], ['PA14', '37'], ['PA15', '38'],
  ['PB3', '39'], ['PB4', '40'], ['PB5', '41'],
  ['PB6', '42'], ['PB7', '43'], ['PB8', '45'], ['PB9', '46'],
  ['USART1_TX', '30'], ['USART1_RX', '31'],
  // 教学：PC0–7 映射到 C8 空脚位焊盘（与 handLayout 一致）
  ['PC0', '10'], ['PC1', '11'], ['PC2', '12'], ['PC3', '13'],
  ['PC4', '18'], ['PC5', '19'], ['PC6', '20'], ['PC7', '39']
]);

/** 24C02 SOIC-8 */
const MEM24C02_PIN_TO_PAD = new Map([
  ['A0', '1'], ['A1', '2'], ['A2', '3'], ['VSS', '4'], ['GND', '4'],
  ['SDA', '5'], ['SCL', '6'], ['WP', '7'], ['VCC', '8'], ['VDD', '8']
]);
/** W25Q64 SOIC-8 */
const W25Q64_PIN_TO_PAD = new Map([
  ['CS', '1'], ['/CS', '1'], ['DO', '2'], ['MISO', '2'],
  ['WP', '3'], ['/WP', '3'], ['GND', '4'], ['VSS', '4'],
  ['DI', '5'], ['MOSI', '5'], ['CLK', '6'], ['SCK', '6'],
  ['HOLD', '7'], ['/HOLD', '7'], ['VCC', '8'], ['VDD', '8']
]);
/** 2764/62256 教学 DIP-28（与 handLayout 焊盘号一致，非 JEDEC 全脚） */
const MEM2764_PIN_TO_PAD = new Map([
  ['VPP', '1'], ['A0', '2'], ['A1', '3'], ['A2', '4'], ['A3', '5'],
  ['A4', '6'], ['A5', '7'], ['A6', '8'], ['A7', '9'],
  ['D0', '10'], ['D1', '11'], ['D2', '12'], ['D3', '13'],
  ['D4', '14'], ['D5', '15'], ['D6', '16'], ['D7', '17'],
  ['GND', '18'], ['VSS', '18'],
  ['CE', '19'], ['/CE', '19'], ['OE', '20'], ['/OE', '20'],
  ['VCC', '26'], ['VDD', '26']
]);
const MEM62256_PIN_TO_PAD = new Map([
  ['A14', '1'], ['A0', '2'], ['A1', '3'], ['A2', '4'], ['A3', '5'],
  ['A4', '6'], ['A5', '7'], ['A6', '8'], ['A7', '9'],
  ['D0', '10'], ['IO0', '10'], ['D1', '11'], ['IO1', '11'],
  ['D2', '12'], ['IO2', '12'], ['D3', '13'], ['IO3', '13'],
  ['D4', '14'], ['IO4', '14'], ['D5', '15'], ['IO5', '15'],
  ['D6', '16'], ['IO6', '16'], ['D7', '17'], ['IO7', '17'],
  ['GND', '18'], ['VSS', '18'],
  ['CE', '19'], ['/CE', '19'], ['CS', '19'], ['/CS', '19'],
  ['OE', '20'], ['/OE', '20'],
  ['WE', '27'], ['/WE', '27'],
  ['VCC', '28'], ['VDD', '28']
]);`);
}

// ——— 2) Footprints: DIP14/16/28 + QFP48 ———
if (!s.includes('function defDIP14')) {
  replaceOnce('defDIP14/16',
`function defDIP8() {
  const pads = [];
  for (let i = 0; i < 4; i++) {
    pads.push(thPad(\`\${i + 1}\`, -100, -150 + i * 100, 35, 60));
    pads.push(thPad(\`\${8 - i}\`, 100, -150 + i * 100, 35, 60));
  }
  return {
    id: 'FP_DIP8', name: 'DIP-8', description: 'DIP-8 300mil', pads,
    silkLines: rectSilk(120, 200),
    courtyard: [{ x: -130, y: -220 }, { x: 130, y: -220 }, { x: 130, y: 220 }, { x: -130, y: 220 }]
  };
}
/** DIP-40（600mil 宽）：AT89C51 / 8051 */`,
`function defDIP8() {
  const pads = [];
  for (let i = 0; i < 4; i++) {
    pads.push(thPad(\`\${i + 1}\`, -100, -150 + i * 100, 35, 60));
    pads.push(thPad(\`\${8 - i}\`, 100, -150 + i * 100, 35, 60));
  }
  return {
    id: 'FP_DIP8', name: 'DIP-8', description: 'DIP-8 300mil', pads,
    silkLines: rectSilk(120, 200),
    courtyard: [{ x: -130, y: -220 }, { x: 130, y: -220 }, { x: 130, y: 220 }, { x: -130, y: 220 }]
  };
}
/** DIP-14（300mil）：74HC 系列门电路 */
function defDIP14() {
  const pads = [];
  const pitch = 100;
  const halfRow = 150;
  const startY = -((14 / 2 - 1) * pitch) / 2;
  for (let i = 0; i < 7; i++) {
    const y = startY + i * pitch;
    pads.push(thPad(\`\${i + 1}\`, -halfRow, y, 35, 60));
    pads.push(thPad(\`\${14 - i}\`, halfRow, y, 35, 60));
  }
  const halfH = ((7 - 1) * pitch) / 2 + 60;
  return {
    id: 'FP_DIP14', name: 'DIP-14', description: 'DIP-14 300mil (74HC)', pads,
    silkLines: rectSilk(halfRow - 20, halfH - 20),
    courtyard: [
      { x: -halfRow - 40, y: -halfH }, { x: halfRow + 40, y: -halfH },
      { x: halfRow + 40, y: halfH }, { x: -halfRow - 40, y: halfH }
    ]
  };
}
/** DIP-16（300mil）：CD4017 */
function defDIP16() {
  const pads = [];
  const pitch = 100;
  const halfRow = 150;
  const startY = -((16 / 2 - 1) * pitch) / 2;
  for (let i = 0; i < 8; i++) {
    const y = startY + i * pitch;
    pads.push(thPad(\`\${i + 1}\`, -halfRow, y, 35, 60));
    pads.push(thPad(\`\${16 - i}\`, halfRow, y, 35, 60));
  }
  const halfH = ((8 - 1) * pitch) / 2 + 60;
  return {
    id: 'FP_DIP16', name: 'DIP-16', description: 'DIP-16 300mil (CD4017)', pads,
    silkLines: rectSilk(halfRow - 20, halfH - 20),
    courtyard: [
      { x: -halfRow - 40, y: -halfH }, { x: halfRow + 40, y: -halfH },
      { x: halfRow + 40, y: halfH }, { x: -halfRow - 40, y: halfH }
    ]
  };
}
/** DIP-28（600mil）：2764 / 62256 教学 */
function defDIP28() {
  const pads = [];
  const pitch = 100;
  const halfRow = 300;
  const startY = -((28 / 2 - 1) * pitch) / 2; // -650
  for (let i = 0; i < 14; i++) {
    const y = startY + i * pitch;
    pads.push(thPad(\`\${i + 1}\`, -halfRow, y, 35, 60));
    pads.push(thPad(\`\${28 - i}\`, halfRow, y, 35, 60));
  }
  const halfH = ((14 - 1) * pitch) / 2 + 60;
  return {
    id: 'FP_DIP28', name: 'DIP-28', description: 'DIP-28 600mil (2764/62256)', pads,
    silkLines: rectSilk(halfRow - 20, halfH - 20),
    courtyard: [
      { x: -halfRow - 40, y: -halfH }, { x: halfRow + 40, y: -halfH },
      { x: halfRow + 40, y: halfH }, { x: -halfRow - 40, y: halfH }
    ]
  };
}
/** DIP-40（600mil 宽）：AT89C51 / 8051 */`);
}

if (!s.includes('function defQFP48')) {
  replaceOnce('defQFP48',
`/** 晶振 HC-49 两脚 */
function defHC49() {`,
`/** LQFP-48（0.5mm pitch 教学简化）：STM32F103C8/RC */
function defQFP48() {
  const pads = [];
  const pitch = 50;
  const half = 280;
  // left 1-12, bottom 13-24, right 25-36, top 37-48
  for (let i = 0; i < 12; i++) {
    const o = -275 + i * pitch;
    pads.push(smdPad(\`\${i + 1}\`, -half, o, 50, 14));
    pads.push(smdPad(\`\${13 + i}\`, o, half, 50, 14));
    pads.push(smdPad(\`\${25 + i}\`, half, -o, 50, 14));
    pads.push(smdPad(\`\${37 + i}\`, -o, -half, 50, 14));
  }
  return {
    id: 'FP_QFP48', name: 'LQFP-48', description: 'LQFP-48 teaching (STM32)',
    pads,
    silkLines: rectSilk(240, 240),
    courtyard: [
      { x: -320, y: -320 }, { x: 320, y: -320 },
      { x: 320, y: 320 }, { x: -320, y: 320 }
    ]
  };
}
/** 晶振 HC-49 两脚 */
function defHC49() {`);
}

// DEFS registration
if (!s.includes('defDIP28()')) {
  replaceOnce('DEFS list',
`for (const d of [
  def0805(), def0603(), def1206(), defSOIC8(), defDIP8(), defDIP40(), defHC49(),
  defSOT23(), defTHT2(), defTO2203(),
  defPinHeader(4), defPinHeader(6), defPinHeader(8), defMountHole()
]) {`,
`for (const d of [
  def0805(), def0603(), def1206(), defSOIC8(), defDIP8(), defDIP14(), defDIP16(), defDIP28(),
  defDIP40(), defQFP48(), defHC49(),
  defSOT23(), defTHT2(), defTO2203(),
  defPinHeader(4), defPinHeader(6), defPinHeader(8), defMountHole()
]) {`);
}

// resolveFootprintId
if (!s.includes("return 'FP_DIP28'") && !s.includes('FP_DIP28')) {
  replaceOnce('resolveFootprintId',
`  if (fp.includes('soic')) return 'FP_SOIC8';
  if (fp.includes('dip-40') || fp.includes('dip40') || fp.includes('pdip-40')) return 'FP_DIP40';
  if (fp.includes('dip')) return 'FP_DIP8';
  if (fp.includes('hc-49') || fp.includes('hc49') || fp.includes('crystal')) return 'FP_HC49';
  if (fp.includes('sot') && fp.includes('23')) return 'FP_SOT23';
  if (lib.includes('7805') || lib.includes('7812') || lib.includes('ams1117') || lib.includes('lm2596')) return 'FP_TO2203';
  if (lib.startsWith('r_') || lib.startsWith('c_') || lib.startsWith('l_') || lib.includes('led') || lib.includes('1n') || lib.includes('fuse')) {
    return lib.includes('fuse') ? 'FP_1206' : 'FP_0805';
  }
  if (lib.includes('2n') || lib.includes('irf') || lib.includes('mos') || lib.includes('bjt')) return 'FP_SOT23';
  if (lib.includes('pot') || lib.includes('sw_') || lib.includes('buzzer') || lib.includes('relay')) return 'FP_THT2';
  if (lib.includes('xtal') || lib.includes('crystal') || lib.includes('hz')) return 'FP_HC49';
  if (isMcu51Lib(lib)) return 'FP_DIP40';
  if (lib.includes('555') || lib.includes('741') || lib.includes('lm358') || lib.includes('tl082') ||
      lib.includes('74hc') || lib.includes('cd4017') ||
      lib.includes('stm32') || lib.includes('2764') || lib.includes('62256') || lib.includes('24c') ||
      lib.includes('w25q') || lib.includes('lcd') || lib.includes('oled') || lib.includes('ds18') ||
      lib.includes('hall') || lib.includes('ldr')) {
    return lib.includes('stm32') ? 'FP_DIP8' : 'FP_SOIC8';
  }
  return 'FP_0805';
}`,
`  if (fp.includes('soic')) return 'FP_SOIC8';
  if (fp.includes('dip-28') || fp.includes('dip28') || fp.includes('pdip-28')) return 'FP_DIP28';
  if (fp.includes('dip-16') || fp.includes('dip16') || fp.includes('pdip-16')) return 'FP_DIP16';
  if (fp.includes('dip-14') || fp.includes('dip14') || fp.includes('pdip-14')) return 'FP_DIP14';
  if (fp.includes('dip-40') || fp.includes('dip40') || fp.includes('pdip-40')) return 'FP_DIP40';
  if (fp.includes('dip')) return 'FP_DIP8';
  if (fp.includes('hc-49') || fp.includes('hc49') || fp.includes('crystal')) return 'FP_HC49';
  if (fp.includes('sot') && fp.includes('23')) return 'FP_SOT23';
  if (fp.includes('qfp') && fp.includes('48')) return 'FP_QFP48';
  if (lib.includes('7805') || lib.includes('7812') || lib.includes('ams1117') || lib.includes('lm2596')) return 'FP_TO2203';
  if (lib.startsWith('r_') || lib.startsWith('c_') || lib.startsWith('l_') || lib.includes('led') || lib.includes('1n') || lib.includes('fuse')) {
    return lib.includes('fuse') ? 'FP_1206' : 'FP_0805';
  }
  if (lib.includes('2n') || lib.includes('irf') || lib.includes('mos') || lib.includes('bjt')) return 'FP_SOT23';
  if (lib.includes('pot') || lib.includes('sw_') || lib.includes('buzzer') || lib.includes('relay')) return 'FP_THT2';
  if (lib.includes('xtal') || lib.includes('crystal') || lib.includes('hz')) return 'FP_HC49';
  if (isMcu51Lib(lib)) return 'FP_DIP40';
  if (isMcuStm32F103C8Lib(lib) || lib.includes('stm32f103')) return 'FP_QFP48';
  if (lib.includes('2764') || lib.includes('62256')) return 'FP_DIP28';
  if (lib.includes('cd4017') || lib.includes('4017')) return 'FP_DIP16';
  if (lib.includes('74hc') || lib.includes('74ls') || lib.includes('cd40')) return 'FP_DIP14';
  if (lib.includes('555') || lib.includes('741') || lib.includes('lm358') || lib.includes('tl082') ||
      lib.includes('stm32') || lib.includes('24c') ||
      lib.includes('w25q') || lib.includes('lcd') || lib.includes('oled') || lib.includes('ds18') ||
      lib.includes('hall') || lib.includes('ldr')) {
    return lib.includes('stm32') ? 'FP_QFP48' : 'FP_SOIC8';
  }
  return 'FP_0805';
}`);
}

// registerSchPin branches
if (!s.includes('MEM24C02_PIN_TO_PAD')) {
  // maps were added in step 1; wire register
}
if (!s.includes('MEM2764_PIN_TO_PAD.get') && s.includes('MEM2764_PIN_TO_PAD')) {
  replaceOnce('registerSchPin',
`  if (isDualOpAmpLib(libDevId)) {
    for (const pin of [pinId, pinName]) {
      const pad = DUAL_OPAMP_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else if (isMcu51Lib(libDevId)) {
    for (const pin of [pinId, pinName]) {
      const pad = MCU51_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else {
    for (const pin of [pinId, pinName]) {
      const alias = PIN_LABEL_TO_PAD.get((pin || '').toUpperCase());
      if (alias) registerPadNetKey(map, compId, alias, netId, netName);
    }
  }
}`,
`  if (isDualOpAmpLib(libDevId)) {
    for (const pin of [pinId, pinName]) {
      const pad = DUAL_OPAMP_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else if (isMcu51Lib(libDevId)) {
    for (const pin of [pinId, pinName]) {
      const pad = MCU51_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else if (isMcuStm32F103C8Lib(libDevId)) {
    for (const pin of [pinId, pinName]) {
      const pad = STM32F103C8_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else if ((libDevId || '').toLowerCase().includes('24c')) {
    for (const pin of [pinId, pinName]) {
      const pad = MEM24C02_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else if ((libDevId || '').toLowerCase().includes('w25q')) {
    for (const pin of [pinId, pinName]) {
      const pad = W25Q64_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else if ((libDevId || '').toLowerCase().includes('2764')) {
    for (const pin of [pinId, pinName]) {
      const pad = MEM2764_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else if ((libDevId || '').toLowerCase().includes('62256')) {
    for (const pin of [pinId, pinName]) {
      const pad = MEM62256_PIN_TO_PAD.get((pin || '').toUpperCase());
      if (pad) registerPadNetKey(map, compId, pad, netId, netName);
    }
  } else {
    for (const pin of [pinId, pinName]) {
      const alias = PIN_LABEL_TO_PAD.get((pin || '').toUpperCase());
      if (alias) registerPadNetKey(map, compId, alias, netId, netName);
    }
  }
}`);
}

// copper count
if (!s.includes("'lab_memory'")) {
  replaceOnce('copper',
`  if (id === 'lab_power' || id === 'lab_amp' || id === 'lab_filter' || id === 'lab_51_led') {
    n = 2;
  }`,
`  if (id === 'lab_power' || id === 'lab_amp' || id === 'lab_filter') {
    n = 2;
  }
  if (id === 'lab_51_led' || id === 'lab_uart' || id === 'lab_memory') {
    n = 4;
  }`);
}

// forced board size helper — inject near applyLabBoardSize
if (!s.includes("labId === 'lab_memory'")) {
  replaceOnce('boardSizeHelper',
`function applyLabBoardSize(doc, sch) {
  fitBoardToContent(doc);
  const fixed = resolveLabBoardSize(sch);
  if (!fixed) return;`,
`function forcedLabBoardSize(labId) {
  if (labId === 'lab_51_led') return { w: 2000, h: 2900 };
  if (labId === 'lab_uart') return { w: 1800, h: 1800 };
  if (labId === 'lab_memory') return { w: 4200, h: 2600 };
  return null;
}

function applyLabBoardSize(doc, sch, labId) {
  fitBoardToContent(doc);
  const fixed = resolveLabBoardSize(sch) || (labId ? forcedLabBoardSize(labId) : null);
  if (!fixed) return;`);

  // update call site
  replaceOnce('applyLabBoardSize call',
`    applyLabBoardSize(doc, sch);`,
`    applyLabBoardSize(doc, sch, id);`);
}

// splice hand layout
if (!s.includes('function handLayoutLabMemory')) {
  const neu = readFileSync('tools/pcb_templates/_hand_memory.mjs', 'utf8').trimEnd() + '\n\n';
  const mark = '\nfunction main()';
  const idx = s.indexOf(mark);
  if (idx < 0) throw new Error('main not found');
  // keep leading newline of mark
  s = s.slice(0, idx) + '\n' + neu + s.slice(idx);
  console.log('ok insert handLayoutLabMemory');
}

// wire main branch
if (!s.includes("route = handLayoutLabMemory")) {
  replaceOnce('main branch',
`    } else if (id === 'lab_51_led') {
      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
      doc.tracks = [];
      doc.vias = [];
      doc.zones = [];
      route = handLayoutLab51Led(doc);
    } else {
      route = autoRoute(doc);
    }`,
`    } else if (id === 'lab_51_led') {
      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
      doc.tracks = [];
      doc.vias = [];
      doc.zones = [];
      route = handLayoutLab51Led(doc);
    } else if (id === 'lab_memory') {
      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
      doc.tracks = [];
      doc.vias = [];
      doc.zones = [];
      route = handLayoutLabMemory(doc);
    } else {
      route = autoRoute(doc);
    }`);

  replaceOnce('mount holes',
`    if (id === 'lab_power' || id === 'lab_amp' || id === 'lab_filter' || id === 'lab_51_led') {
      addCornerMountHoles(doc, gndNet);
    }`,
`    if (id === 'lab_power' || id === 'lab_amp' || id === 'lab_filter' || id === 'lab_51_led' || id === 'lab_memory') {
      addCornerMountHoles(doc, gndNet);
    }`);

  replaceOnce('handTag',
`    const handTag = (id === 'lab_power' || id === 'lab_amp' || id === 'lab_filter' || id === 'lab_51_led') ? ' [hand]' : '';`,
`    const handTag = (id === 'lab_power' || id === 'lab_amp' || id === 'lab_filter' || id === 'lab_51_led' || id === 'lab_memory') ? ' [hand]' : '';`);
}

// Only export lab_memory when ONLY_LAB is set (protect other finished templates)
if (!s.includes('process.env.ONLY_LAB')) {
  replaceOnce('onlyLab filter',
`  const files = readdirSync(srcDir).filter(f => f.endsWith('.schsim') && f.startsWith('lab_'));`,
`  const only = process.env.ONLY_LAB || '';
  const files = readdirSync(srcDir).filter(f => f.endsWith('.schsim') && f.startsWith('lab_') &&
    (!only || f === only + '.schsim' || f.startsWith(only + '_')));`);
}

writeFileSync(p, s);
mustInclude('handLayout', 'function handLayoutLabMemory');
mustInclude('DIP28', 'function defDIP28');
mustInclude('QFP48', 'function defQFP48');
mustInclude('wired', "route = handLayoutLabMemory");
console.log({
  lines: s.split(/\n/).length,
  bytes: s.length,
  nMemory: (s.match(/function handLayoutLabMemory/g) || []).length
});
