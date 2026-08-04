#!/usr/bin/env node
/**
 * 从 Test_Template/lab_*.schsim 生成对应完整成品 PCB（lab_*.pcbsim）
 * - 铜层：自动推断 2/4/6/8，可用 pcbCopperCount 覆盖
 * - 板框：按内容自适应，可用 pcbBoardWidth / pcbBoardHeight（mil）放大
 * 用法: node tools/pcb_templates/export.mjs
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT_DIRS = [
  join(ROOT, 'Test_Template'),
  join(ROOT, 'entry', 'src', 'main', 'resources', 'rawfile', 'Test_Template')
];

let seq = 0;
function uid(prefix) {
  seq++;
  return `${prefix}_${Date.now()}_${seq}`;
}

/** 2/3 脚无源/分立：符号脚名 → 焊盘号（勿用于多脚 IC） */
const PIN_LABEL_TO_PAD = new Map([
  ['A', '1'], ['ANODE', '1'], ['C', '1'], ['IN', '1'], ['+', '1'],
  ['V+', '1'], ['I+', '1'], ['VP', '1'],
  ['K', '2'], ['CATHODE', '2'], ['E', '2'], ['GND', '2'], ['-', '2'],
  ['COM', '2'], ['I-', '2'], ['V-', '2'],
  ['B', '3'], ['OUT', '3'], ['G', '3']
]);

/**
 * 双运放 SOIC-8 / DIP-8（LM358 等）标准脚位：
 * 1 OUT1  2 IN-1  3 IN+1  4 V-  5 IN+2  6 IN-2  7 OUT2  8 V+
 * 若误用上面的 V+→1/V-→2，会把电源焊到错误脚并导致信号脚全浮空。
 */
const DUAL_OPAMP_PIN_TO_PAD = new Map([
  ['OUT1', '1'], ['IN-1', '2'], ['IN+1', '3'], ['V-', '4'], ['VEE', '4'],
  ['IN+2', '5'], ['IN-2', '6'], ['OUT2', '7'], ['V+', '8'], ['VCC', '8']
]);

function isDualOpAmpLib(libDevId) {
  const lib = (libDevId || '').toLowerCase();
  return lib.includes('lm358') || lib.includes('tl082') || lib.includes('lm324') ||
    lib.includes('ne5532') || lib === '741' || lib.includes('opamp');
}

/**
 * AT89C51 / 8051 DIP-40 符号脚名 → 焊盘号
 * 1-8=P1.0-P1.7  9=RST  18=XTAL2  19=XTAL1  20=GND  31=EA  40=VCC
 */
const MCU51_PIN_TO_PAD = new Map([
  ['P1.0', '1'], ['P1.1', '2'], ['P1.2', '3'], ['P1.3', '4'],
  ['P1.4', '5'], ['P1.5', '6'], ['P1.6', '7'], ['P1.7', '8'],
  ['RST', '9'], ['RESET', '9'], ['NRST', '9'],
  ['RXD', '10'], ['P3.0', '10'], ['TXD', '11'], ['P3.1', '11'],
  ['INT0', '12'], ['P3.2', '12'], ['INT1', '13'], ['P3.3', '13'],
  ['T0', '14'], ['P3.4', '14'], ['T1', '15'], ['P3.5', '15'],
  ['WR', '16'], ['P3.6', '16'], ['RD', '17'], ['P3.7', '17'],
  ['XTAL2', '18'], ['XTAL1', '19'],
  ['GND', '20'], ['VSS', '20'],
  ['P2.0', '21'], ['P2.1', '22'], ['P2.2', '23'], ['P2.3', '24'],
  ['P2.4', '25'], ['P2.5', '26'], ['P2.6', '27'], ['P2.7', '28'],
  ['PSEN', '29'], ['ALE', '30'], ['EA', '31'], ['EA/VPP', '31'],
  ['P0.7', '32'], ['P0.6', '33'], ['P0.5', '34'], ['P0.4', '35'],
  ['P0.3', '36'], ['P0.2', '37'], ['P0.1', '38'], ['P0.0', '39'],
  ['VCC', '40'], ['VDD', '40']
]);

function isMcu51Lib(libDevId) {
  const lib = (libDevId || '').toLowerCase();
  return lib.includes('at89') || lib.includes('at89c51') || lib.includes('8051') ||
    lib.includes('stc89') || lib.includes('stc90') || lib === 'mcs51';
}

function smdPad(num, x, y, w, h) {
  return {
    id: uid('pad'), number: String(num), type: 'smd', shape: 'rect',
    pos: { x, y }, size: { x: w, y: h },
    layers: ['F.Cu', 'F.Mask']
  };
}

function thPad(num, x, y, drill, outer) {
  return {
    id: uid('pad'), number: String(num), type: 'th', shape: 'circle',
    pos: { x, y }, size: { x: outer, y: outer }, drill,
    layers: ['F.Cu', 'B.Cu']
  };
}

function rectSilk(halfW, halfH) {
  return [[
    { x: -halfW, y: -halfH }, { x: halfW, y: -halfH },
    { x: halfW, y: halfH }, { x: -halfW, y: halfH }, { x: -halfW, y: -halfH }
  ]];
}

function def0805() {
  return {
    id: 'FP_0805', name: '0805', description: 'Metric 2012 SMD',
    pads: [smdPad('1', -45, 0, 30, 50), smdPad('2', 45, 0, 30, 50)],
    silkLines: rectSilk(50, 30),
    courtyard: [{ x: -70, y: -40 }, { x: 70, y: -40 }, { x: 70, y: 40 }, { x: -70, y: 40 }]
  };
}
function def0603() {
  return {
    id: 'FP_0603', name: '0603', description: 'Metric 1608 SMD',
    pads: [smdPad('1', -35, 0, 25, 35), smdPad('2', 35, 0, 25, 35)],
    silkLines: rectSilk(40, 22),
    courtyard: [{ x: -55, y: -30 }, { x: 55, y: -30 }, { x: 55, y: 30 }, { x: -55, y: 30 }]
  };
}
function def1206() {
  return {
    id: 'FP_1206', name: '1206', description: 'Metric 3216 SMD',
    pads: [smdPad('1', -60, 0, 40, 70), smdPad('2', 60, 0, 40, 70)],
    silkLines: rectSilk(65, 40),
    courtyard: [{ x: -85, y: -50 }, { x: 85, y: -50 }, { x: 85, y: 50 }, { x: -85, y: 50 }]
  };
}
function defSOIC8() {
  const pads = [];
  for (let i = 0; i < 4; i++) {
    pads.push(smdPad(`${i + 1}`, -60, -45 + i * 30, 25, 12));
    pads.push(smdPad(`${8 - i}`, 60, -45 + i * 30, 25, 12));
  }
  return {
    id: 'FP_SOIC8', name: 'SOIC-8', description: 'SOIC-8 150mil', pads,
    silkLines: rectSilk(55, 55),
    courtyard: [{ x: -80, y: -60 }, { x: 80, y: -60 }, { x: 80, y: 60 }, { x: -80, y: 60 }]
  };
}
function defDIP8() {
  const pads = [];
  for (let i = 0; i < 4; i++) {
    pads.push(thPad(`${i + 1}`, -100, -150 + i * 100, 35, 60));
    pads.push(thPad(`${8 - i}`, 100, -150 + i * 100, 35, 60));
  }
  return {
    id: 'FP_DIP8', name: 'DIP-8', description: 'DIP-8 300mil', pads,
    silkLines: rectSilk(120, 200),
    courtyard: [{ x: -130, y: -220 }, { x: 130, y: -220 }, { x: 130, y: 220 }, { x: -130, y: 220 }]
  };
}
/** DIP-40（600mil 宽）：AT89C51 / 8051 */
function defDIP40() {
  const pads = [];
  const pitch = 100;
  const halfRow = 300;
  const startY = -((40 / 2 - 1) * pitch) / 2; // -950
  for (let i = 0; i < 20; i++) {
    const y = startY + i * pitch;
    pads.push(thPad(`${i + 1}`, -halfRow, y, 35, 60));
    pads.push(thPad(`${40 - i}`, halfRow, y, 35, 60));
  }
  const halfH = ((20 - 1) * pitch) / 2 + 60;
  return {
    id: 'FP_DIP40', name: 'DIP-40', description: 'DIP-40 600mil', pads,
    silkLines: rectSilk(halfRow - 20, halfH - 20),
    courtyard: [
      { x: -halfRow - 40, y: -halfH }, { x: halfRow + 40, y: -halfH },
      { x: halfRow + 40, y: halfH }, { x: -halfRow - 40, y: halfH }
    ]
  };
}
/** 晶振 HC-49 两脚 */
function defHC49() {
  return {
    id: 'FP_HC49', name: 'HC-49', description: 'Crystal HC-49',
    pads: [thPad('1', -60, 0, 35, 60), thPad('2', 60, 0, 35, 60)],
    silkLines: rectSilk(80, 40),
    courtyard: [{ x: -100, y: -50 }, { x: 100, y: -50 }, { x: 100, y: 50 }, { x: -100, y: 50 }]
  };
}
function defSOT23() {
  return {
    id: 'FP_SOT23', name: 'SOT-23', description: 'SOT-23',
    pads: [smdPad('1', -35, 45, 25, 20), smdPad('2', 35, 45, 25, 20), smdPad('3', 0, -45, 25, 20)],
    silkLines: rectSilk(40, 55),
    courtyard: [{ x: -55, y: -65 }, { x: 55, y: -65 }, { x: 55, y: 65 }, { x: -55, y: 65 }]
  };
}
function defTHT2() {
  return {
    id: 'FP_THT2', name: 'THT-2', description: '2-pin THT',
    pads: [thPad('1', -50, 0, 35, 60), thPad('2', 50, 0, 35, 60)],
    silkLines: rectSilk(60, 30),
    courtyard: [{ x: -80, y: -40 }, { x: 80, y: -40 }, { x: 80, y: 40 }, { x: -80, y: 40 }]
  };
}
function defTO2203() {
  return {
    id: 'FP_TO2203', name: 'TO-220-3', description: 'TO-220-3',
    pads: [thPad('1', -90, 0, 40, 70), thPad('2', 0, 90, 40, 70), thPad('3', 90, 0, 40, 70)],
    silkLines: rectSilk(100, 110),
    courtyard: [{ x: -120, y: -50 }, { x: 120, y: -50 }, { x: 120, y: 130 }, { x: -120, y: 130 }]
  };
}
/** 1xN 排针 — 用于板边连接器，提升成品板密度观感 */
function defPinHeader(n) {
  const pads = [];
  const pitch = 100;
  const startY = -((n - 1) * pitch) / 2;
  for (let i = 0; i < n; i++) {
    pads.push(thPad(`${i + 1}`, 0, startY + i * pitch, 35, 60));
  }
  const halfH = ((n - 1) * pitch) / 2 + 50;
  return {
    id: `FP_PINHDR_${n}`, name: `PinHeader_1x${n}`, description: `1x${n} pin header`,
    pads,
    silkLines: rectSilk(40, halfH),
    courtyard: [{ x: -55, y: -halfH - 10 }, { x: 55, y: -halfH - 10 }, { x: 55, y: halfH + 10 }, { x: -55, y: halfH + 10 }]
  };
}
function defMountHole() {
  // 极紧凑安装孔：中心可贴到距边≈半焊盘处
  return {
    id: 'FP_MOUNT', name: 'MountingHole', description: 'Corner mounting hole',
    pads: [thPad('1', 0, 0, 32, 40)],
    silkLines: [[{ x: -22, y: 0 }, { x: 22, y: 0 }], [{ x: 0, y: -22 }, { x: 0, y: 22 }]],
    courtyard: [{ x: -24, y: -24 }, { x: 24, y: -24 }, { x: 24, y: 24 }, { x: -24, y: 24 }]
  };
}

const DEFS = new Map();
for (const d of [
  def0805(), def0603(), def1206(), defSOIC8(), defDIP8(), defDIP40(), defHC49(),
  defSOT23(), defTHT2(), defTO2203(),
  defPinHeader(4), defPinHeader(6), defPinHeader(8), defMountHole()
]) {
  DEFS.set(d.id, d);
}

function resolveFootprintId(footprintStr, libraryId) {
  const fp = (footprintStr || '').toLowerCase();
  const lib = (libraryId || '').toLowerCase();
  if (fp.includes('0402')) return 'FP_0805';
  if (fp.includes('0603')) return 'FP_0603';
  if (fp.includes('1206')) return 'FP_1206';
  if (fp.includes('0805')) return 'FP_0805';
  if (fp.includes('to-220') || fp.includes('to220')) return 'FP_TO2203';
  if (fp.includes('soic')) return 'FP_SOIC8';
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
}

function isLayoutable(libDevId, refName) {
  const lib = (libDevId || '').toLowerCase();
  if ((refName || '').startsWith('#')) return false;
  if (lib.startsWith('gnd') || lib.startsWith('vcc') || lib.startsWith('vee') || lib.startsWith('vac') ||
      lib.startsWith('power') || lib.includes('probe') || lib.includes('instrument') ||
      lib.includes('oscilloscope') || lib.includes('multimeter') || lib.includes('generator') ||
      lib.includes('voltmeter') || lib.includes('ammeter') || lib.includes('power_meter') ||
      lib.includes('freq_counter') || lib.includes('logic_analyzer') || lib.includes('uart_terminal') ||
      lib.includes('virtual_meter') || lib.includes('signal_gen')) {
    return false;
  }
  return true;
}

function paramGet(params, key) {
  if (!params || typeof params !== 'object') return '';
  const v = params[key];
  return typeof v === 'string' ? v : '';
}

function halfExtents(defId) {
  const def = DEFS.get(defId) || DEFS.get('FP_0805');
  let halfW = 60, halfH = 40;
  for (const pad of def.pads) {
    halfW = Math.max(halfW, Math.abs(pad.pos.x) + pad.size.x / 2);
    halfH = Math.max(halfH, Math.abs(pad.pos.y) + pad.size.y / 2);
  }
  for (const pt of def.courtyard) {
    halfW = Math.max(halfW, Math.abs(pt.x));
    halfH = Math.max(halfH, Math.abs(pt.y));
  }
  return { halfW, halfH };
}

function instantiate(defId, refDes, value, pos, rotation, schId) {
  const def = DEFS.get(defId) || DEFS.get('FP_0805');
  const pads = def.pads.map(p => ({
    id: uid('pad'), number: p.number, type: p.type, shape: p.shape,
    pos: { x: p.pos.x, y: p.pos.y }, size: { x: p.size.x, y: p.size.y },
    drill: p.drill, layers: [...p.layers]
  }));
  return {
    id: uid('fp'), defId: def.id, refDes, value,
    position: { x: pos.x, y: pos.y },
    rotation: ((rotation || 0) % 360),
    mirrored: false, layer: 'F.Cu', locked: false, pads,
    schematicCompId: schId
  };
}

function registerPadNetKey(map, compId, key, netId, netName) {
  if (!key) return;
  const entry = { netId, netName };
  map.set(`${compId}:${key}`, entry);
  map.set(`${compId}:${key.toUpperCase()}`, entry);
  const stripped = key.replace(/^p/i, '');
  if (stripped && stripped !== key) {
    map.set(`${compId}:${stripped}`, entry);
    map.set(`${compId}:${stripped.toUpperCase()}`, entry);
  }
}

function registerSchPin(map, compId, pinId, pinName, netId, netName, libDevId) {
  registerPadNetKey(map, compId, pinId, netId, netName);
  registerPadNetKey(map, compId, pinName, netId, netName);
  for (const pin of [pinId, pinName]) {
    if (pin && pin.length >= 2 && (pin[0] === 'P' || pin[0] === 'p') && /^\d+$/.test(pin.slice(1))) {
      registerPadNetKey(map, compId, pin.slice(1), netId, netName);
    }
  }
  if (isDualOpAmpLib(libDevId)) {
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
}

function lookupPadNet(map, compId, padNumber) {
  const keys = [padNumber, padNumber.toUpperCase(), `p${padNumber}`, `P${padNumber}`];
  if (padNumber === '1') keys.push('A', 'C', 'IN', 'ANODE', '+', 'V+', 'I+');
  if (padNumber === '2') keys.push('K', 'E', 'GND', 'CATHODE', '-', 'COM', 'I-', 'V-');
  if (padNumber === '3') keys.push('B', 'OUT', 'G');
  for (const k of keys) {
    const hit = map.get(`${compId}:${k}`);
    if (hit) return hit;
  }
  return undefined;
}

function padWorld(fp, pad) {
  let lx = pad.pos.x, ly = pad.pos.y;
  if (fp.mirrored) lx = -lx;
  if (fp.rotation === 90) { const t = lx; lx = -ly; ly = t; }
  else if (fp.rotation === 180) { lx = -lx; ly = -ly; }
  else if (fp.rotation === 270) { const t = lx; lx = ly; ly = -t; }
  return { x: fp.position.x + lx, y: fp.position.y + ly };
}

function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function snap(v, grid) {
  if (grid <= 0) return v;
  return Math.round(v / grid) * grid;
}

function routeL(a, b, grid) {
  const s = { x: a.x, y: a.y }, e = { x: b.x, y: b.y };
  if (dist(s, e) < 0.5) return [];
  const midH = { x: e.x, y: snap(s.y, grid) };
  const midV = { x: snap(s.x, grid), y: e.y };
  const lenH = dist(s, midH) + dist(midH, e);
  const lenV = dist(s, midV) + dist(midV, e);
  if (lenH <= lenV) {
    if (dist(s, midH) > 0.5 && dist(midH, e) > 0.5) return [s, midH, e];
    return [s, e];
  }
  if (dist(s, midV) > 0.5 && dist(midV, e) > 0.5) return [s, midV, e];
  return [s, e];
}

function orderNearest(points) {
  if (points.length <= 1) return points.slice();
  const remaining = points.slice();
  const ordered = [remaining.shift()];
  while (remaining.length) {
    const last = ordered[ordered.length - 1];
    let bi = 0, bd = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = dist(last, remaining[i]);
      if (d < bd) { bd = d; bi = i; }
    }
    ordered.push(remaining.splice(bi, 1)[0]);
  }
  return ordered;
}

function isGndNet(name) {
  const nm = (name || '').toUpperCase();
  return nm === 'GND' || nm === 'VSS' || nm === 'AGND';
}
/** 电源轨：线宽/网络类用（含稳压输入输出） */
function isVccNet(name) {
  const nm = (name || '').toUpperCase();
  return nm === 'VCC' || nm === 'VDD' || nm === 'VEE' || nm === '3V3' || nm === '5V' ||
    nm === 'VIN' || nm === 'VIN_SRC' || nm === 'VOUT' || nm === 'REG_IN' ||
    nm.startsWith('VCC') || nm.startsWith('VDD') || nm.startsWith('VIN');
}
/** 顶层辅助铺铜：仅经典电源名，避免 VIN/VOUT 误铺大铜皮 */
function isPourableVccNet(name) {
  const nm = (name || '').toUpperCase();
  return nm === 'VCC' || nm === 'VDD' || nm === '3V3' || nm === '5V' ||
    nm.startsWith('VCC') || nm.startsWith('VDD');
}
function isPowerNet(name) {
  return isGndNet(name) || isVccNet(name);
}

function guessNetClassId(netName, classes) {
  const upper = (netName || '').toUpperCase();
  let powerId = 'nc_power';
  let signalId = 'nc_signal';
  let defaultId = 'nc_default';
  for (const c of classes || []) {
    if (c.name === 'Power') powerId = c.id;
    if (c.name === 'Signal') signalId = c.id;
    if (c.name === 'Default') defaultId = c.id;
  }
  if (isPowerNet(upper) || upper.indexOf('VBAT') >= 0 || upper.indexOf('3V3') >= 0 ||
    upper.indexOf('5V') >= 0) {
    return powerId;
  }
  if (upper.length > 0) return signalId;
  return defaultId;
}

function assignNetClasses(doc) {
  for (const n of doc.nets) {
    n.classId = guessNetClassId(n.name, doc.netClasses);
  }
}

/** 合法铜层数：2 / 4 / 6 / 8 */
function normalizeCopperCount(n) {
  const v = Number(n);
  if (v === 4 || v === 6 || v === 8) return v;
  return 2;
}

/**
 * 与 common createDefaultLayerStack 对齐的物理层栈。
 */
function buildLayerStack(copperCount) {
  const n = normalizeCopperCount(copperCount);
  const layers = [
    { id: 'sm_top', type: 'soldermask', name: 'F.Mask', thicknessMm: 0.02 },
    { id: 'cu_f', type: 'copper', name: 'F.Cu', copperLayerId: 'F.Cu', thicknessMm: 0.035, copperOz: 1 }
  ];
  if (n >= 4) {
    layers.push(
      { id: 'diel_1', type: 'dielectric', name: 'Prepreg', thicknessMm: 0.2, dielectricDk: 4.5 },
      { id: 'cu_in1', type: 'copper', name: 'In1.Cu', copperLayerId: 'In1.Cu', thicknessMm: 0.035, copperOz: 1 },
      { id: 'diel_core', type: 'dielectric', name: 'Core', thicknessMm: 0.8, dielectricDk: 4.3 },
      { id: 'cu_in2', type: 'copper', name: 'In2.Cu', copperLayerId: 'In2.Cu', thicknessMm: 0.035, copperOz: 1 }
    );
  } else {
    layers.push(
      { id: 'diel_core', type: 'dielectric', name: 'Core', thicknessMm: 1.5, dielectricDk: 4.3 }
    );
  }
  if (n >= 6) {
    layers.push(
      { id: 'diel_3', type: 'dielectric', name: 'Prepreg2', thicknessMm: 0.2, dielectricDk: 4.5 },
      { id: 'cu_in3', type: 'copper', name: 'In3.Cu', copperLayerId: 'In3.Cu', thicknessMm: 0.035, copperOz: 1 },
      { id: 'diel_3b', type: 'dielectric', name: 'Prepreg2b', thicknessMm: 0.2, dielectricDk: 4.5 },
      { id: 'cu_in4', type: 'copper', name: 'In4.Cu', copperLayerId: 'In4.Cu', thicknessMm: 0.035, copperOz: 1 }
    );
  }
  if (n >= 8) {
    layers.push(
      { id: 'diel_4', type: 'dielectric', name: 'Prepreg3', thicknessMm: 0.2, dielectricDk: 4.5 },
      { id: 'cu_in5', type: 'copper', name: 'In5.Cu', copperLayerId: 'In5.Cu', thicknessMm: 0.035, copperOz: 1 },
      { id: 'diel_4b', type: 'dielectric', name: 'Prepreg3b', thicknessMm: 0.2, dielectricDk: 4.5 },
      { id: 'cu_in6', type: 'copper', name: 'In6.Cu', copperLayerId: 'In6.Cu', thicknessMm: 0.035, copperOz: 1 }
    );
  }
  layers.push(
    { id: 'cu_b', type: 'copper', name: 'B.Cu', copperLayerId: 'B.Cu', thicknessMm: 0.035, copperOz: 1 },
    { id: 'sm_bot', type: 'soldermask', name: 'B.Mask', thicknessMm: 0.02 }
  );
  return { copperCount: n, layers };
}

function buildPcbLayers(copperCount) {
  const n = normalizeCopperCount(copperCount);
  const layers = [
    { id: 'F.Cu', name: 'Front Copper', visible: true, color: '#FF2A2A', opacity: 0.92 }
  ];
  if (n >= 4) {
    layers.push(
      { id: 'In1.Cu', name: 'Inner1 Copper', visible: true, color: '#D500F9', opacity: 0.88 },
      { id: 'In2.Cu', name: 'Inner2 Copper', visible: true, color: '#FF9100', opacity: 0.88 }
    );
  }
  if (n >= 6) {
    layers.push(
      { id: 'In3.Cu', name: 'Inner3 Copper', visible: true, color: '#651FFF', opacity: 0.85 },
      { id: 'In4.Cu', name: 'Inner4 Copper', visible: true, color: '#00E5FF', opacity: 0.85 }
    );
  }
  if (n >= 8) {
    layers.push(
      { id: 'In5.Cu', name: 'Inner5 Copper', visible: true, color: '#FFD740', opacity: 0.85 },
      { id: 'In6.Cu', name: 'Inner6 Copper', visible: true, color: '#69F0AE', opacity: 0.85 }
    );
  }
  layers.push(
    { id: 'B.Cu', name: 'Back Copper', visible: true, color: '#00C853', opacity: 0.78 },
    { id: 'F.SilkS', name: 'Front Silk', visible: true, color: '#5CE1E6', opacity: 1 },
    { id: 'B.SilkS', name: 'Back Silk', visible: false, color: '#80A0B0', opacity: 1 },
    { id: 'F.Mask', name: 'Front Mask', visible: false, color: '#1B5E20', opacity: 0.35 },
    { id: 'B.Mask', name: 'Back Mask', visible: false, color: '#1B5E20', opacity: 0.35 },
    { id: 'Edge.Cuts', name: 'Edge Cuts', visible: true, color: '#E8A020', opacity: 1 },
    { id: 'F.CrtYd', name: 'Courtyard', visible: false, color: '#808080', opacity: 1 }
  );
  return layers;
}

function applyCopperCount(doc, copperCount) {
  const n = normalizeCopperCount(copperCount);
  doc.layerStack = buildLayerStack(n);
  doc.layers = buildPcbLayers(n);
  return n;
}

/**
 * 按原理图/器件规模推断铜层数（可被 schsim 字段或表覆盖）。
 * 简单实验 2 层；中等密度 4；MCU/总线类 6；超高密度 8。
 */
function suggestCopperCountFromDoc(labId, doc) {
  const fps = (doc.footprints || []).filter(f => f.schematicCompId);
  const nets = doc.nets || [];
  let pads = 0;
  let icLike = 0;
  for (const fp of fps) {
    pads += (fp.pads || []).length;
    const def = (fp.defId || '').toUpperCase();
    if (def.indexOf('SOIC') >= 0 || def.indexOf('DIP') >= 0 || def.indexOf('QFP') >= 0 ||
      def.indexOf('LQFP') >= 0 || (fp.pads || []).length >= 8) {
      icLike++;
    }
  }
  const id = (labId || '').toLowerCase();
  let n = 2;
  if (fps.length > 28 || nets.length > 36 || pads > 120) n = 8;
  else if (fps.length > 16 || nets.length > 22 || pads > 64 || icLike >= 3) n = 6;
  else if (fps.length > 8 || nets.length > 10 || pads > 28 || icLike >= 1) n = 4;

  // 类别抬升：数字/MCU/存储/外设通常走线更多
  if (/mcu|stm32|8051|memory|digital|peripheral|uart|sensor/.test(id)) {
    n = Math.max(n, 4);
  }
  if (/mcu_stm32|memory|peripheral/.test(id)) {
    n = Math.max(n, 6);
  }
  // 手布双面板保持 2 层（仅用 F/B）
  if (id === 'lab_power' || id === 'lab_amp' || id === 'lab_filter' || id === 'lab_51_led') {
    n = 2;
  }
  return normalizeCopperCount(n);
}

/**
 * 解析本模板铜层数：
 * 1) schsim 显式字段 pcbCopperCount / topology.pcbCopperCount / metadata.pcbCopperCount
 * 2) 否则按器件与网络规模自动推断
 */
function resolveLabCopperCount(labId, sch, doc) {
  const raw = sch?.pcbCopperCount ?? sch?.topology?.pcbCopperCount ??
    sch?.metadata?.pcbCopperCount ?? sch?.simConfig?.pcbCopperCount;
  if (raw !== undefined && raw !== null && `${raw}`.length > 0) {
    return normalizeCopperCount(raw);
  }
  return suggestCopperCountFromDoc(labId, doc);
}

/** schsim 可选 pcbBoardWidth / pcbBoardHeight（mil），缺省则按内容自适应 */
function resolveLabBoardSize(sch) {
  const w = Number(sch?.pcbBoardWidth ?? sch?.topology?.pcbBoardWidth ??
    sch?.metadata?.pcbBoardWidth ?? sch?.simConfig?.pcbBoardWidth);
  const h = Number(sch?.pcbBoardHeight ?? sch?.topology?.pcbBoardHeight ??
    sch?.metadata?.pcbBoardHeight ?? sch?.simConfig?.pcbBoardHeight);
  if (Number.isFinite(w) && Number.isFinite(h) && w >= 400 && h >= 300) {
    return { w: Math.round(w), h: Math.round(h) };
  }
  return null;
}

/**
 * 先按内容 fit；若 schsim 指定了更大尺寸则扩展外框（不小于内容）。
 */
function applyLabBoardSize(doc, sch) {
  fitBoardToContent(doc);
  const fixed = resolveLabBoardSize(sch);
  if (!fixed) return;
  const pts = doc.boardOutline.points || [];
  const curW = pts.length ? Math.max(...pts.map(p => p.x)) : 0;
  const curH = pts.length ? Math.max(...pts.map(p => p.y)) : 0;
  const boardW = Math.max(curW, fixed.w);
  const boardH = Math.max(curH, fixed.h);
  doc.boardOutline.points = [
    { x: 0, y: 0 }, { x: boardW, y: 0 }, { x: boardW, y: boardH }, { x: 0, y: boardH }
  ];
}

/** 在最终板框四角放置 GND 安装孔 */
function addCornerMountHoles(doc, gndNet) {
  const pts = doc.boardOutline.points || [];
  if (pts.length < 2) return;
  const boardW = Math.max(...pts.map(p => p.x));
  const boardH = Math.max(...pts.map(p => p.y));
  // 中心 = 半焊盘，铜皮外缘贴齐板边四角
  const inset = 20;
  const holes = [
    { x: inset, y: inset },
    { x: boardW - inset, y: inset },
    { x: inset, y: boardH - inset },
    { x: boardW - inset, y: boardH - inset }
  ];
  let hi = 1;
  for (const hp of holes) {
    const hole = instantiate('FP_MOUNT', `H${hi}`, 'MH', hp, 0);
    if (gndNet) {
      for (const pad of hole.pads) {
        pad.netId = gndNet.id;
        pad.netName = gndNet.name;
      }
    }
    doc.footprints.push(hole);
    hi++;
  }
}

function createEmptyPcb(name, copperCount = 2) {
  const now = new Date().toISOString();
  const n = normalizeCopperCount(copperCount);
  return {
    id: uid('pcb'), name, version: '1.1',
    boardOutline: {
      points: [{ x: 0, y: 0 }, { x: 1200, y: 0 }, { x: 1200, y: 800 }, { x: 0, y: 800 }],
      width: 5
    },
    footprints: [], tracks: [], vias: [], zones: [],
    layers: buildPcbLayers(n),
    nets: [],
    netClasses: [
      { id: 'nc_default', name: 'Default', trackWidth: 10, clearance: 6, viaDiameter: 24, viaDrill: 12 },
      { id: 'nc_power', name: 'Power', trackWidth: 20, clearance: 10, viaDiameter: 30, viaDrill: 16 },
      { id: 'nc_signal', name: 'Signal', trackWidth: 8, clearance: 6, viaDiameter: 22, viaDrill: 12 }
    ],
    layerStack: buildLayerStack(n),
    diffPairs: [],
    metadata: {
      author: 'pcb_templates/export',
      createdAt: now, modifiedAt: now,
      description: 'Lab PCB template (auto-generated)',
      gridSize: 5, units: 'mil',
      designRules: {
        minTrackWidth: 8, minClearance: 6, minViaDrill: 12,
        defaultTrackWidth: 14, minAnnularRing: 4, minHoleToHole: 10
      }
    }
  };
}

/** 点到线段距离 */
function pointSegDist(p, s, e) {
  const abx = e.x - s.x, aby = e.y - s.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 0.01) return dist(p, s);
  let t = ((p.x - s.x) * abx + (p.y - s.y) * aby) / len2;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  return Math.hypot(p.x - (s.x + t * abx), p.y - (s.y + t * aby));
}

/** 两线段中心线间距（端点投影近似，与运行时 CROWD_TRACK 一致） */
function segClearance(a0, a1, b0, b1) {
  return Math.min(
    pointSegDist(a0, b0, b1), pointSegDist(a1, b0, b1),
    pointSegDist(b0, a0, a1), pointSegDist(b1, a0, a1)
  );
}

/** 路径是否与已有异网同层走线冲突 */
function pathClearOfTracks(doc, path, netId, layer, width, clr) {
  if (!path || path.length < 2) return true;
  for (let i = 0; i < path.length - 1; i++) {
    const a0 = path[i], a1 = path[i + 1];
    if (dist(a0, a1) < 0.5) continue;
    for (const t of doc.tracks) {
      if (t.layer !== layer || !t.netId || t.netId === netId) continue;
      const gap = segClearance(a0, a1, t.start, t.end) - (width + t.width) * 0.5;
      if (gap < clr) return false;
    }
  }
  return true;
}

/** L 型候选：水平优先 / 垂直优先 */
function routeLCandidates(a, b, grid) {
  const s = { x: a.x, y: a.y }, e = { x: b.x, y: b.y };
  if (dist(s, e) < 0.5) return [];
  const midH = { x: e.x, y: snap(s.y, grid) };
  const midV = { x: snap(s.x, grid), y: e.y };
  const out = [];
  const push = (mid) => {
    if (dist(s, mid) > 0.5 && dist(mid, e) > 0.5) out.push([s, mid, e]);
    else out.push([s, e]);
  };
  push(midH);
  push(midV);
  // 直连（同轴）
  if (Math.abs(s.x - e.x) < 0.5 || Math.abs(s.y - e.y) < 0.5) out.unshift([s, e]);
  return out;
}

/**
 * 正交优先布线；必要时用带偏移的总线绕行，避免 45° 斜线跨网短路。
 * preferH: true 时优先水平-再垂直
 * 返回 { path, layer }；若需 B.Cu 绕行由调用方处理 vias（本函数仅返回 F 层路径，
 * 冲突时返回 null 表示建议层切换）
 */
function routeSafe(a, b, grid, doc, netId, layer, width, clr, preferH) {
  const cands = routeLCandidates(a, b, grid);
  if (!preferH && cands.length >= 2) {
    const tmp = cands[0]; cands[0] = cands[1]; cands[1] = tmp;
  }
  for (const path of cands) {
    if (pathClearOfTracks(doc, path, netId, layer, width, clr)) return path;
  }
  // 绕行：更大偏移的正交折线
  const offsets = [];
  for (const mag of [40, 80, 120, 160, 200, 260]) {
    if (preferH) {
      offsets.push({ x: 0, y: mag }, { x: 0, y: -mag });
    } else {
      offsets.push({ x: mag, y: 0 }, { x: -mag, y: 0 });
    }
  }
  // 也试另一轴偏移
  for (const mag of [60, 120, 180]) {
    if (preferH) offsets.push({ x: mag, y: 0 }, { x: -mag, y: 0 });
    else offsets.push({ x: 0, y: mag }, { x: 0, y: -mag });
  }
  for (const off of offsets) {
    const mid1 = { x: snap(a.x + off.x, grid), y: snap(a.y + off.y, grid) };
    const mid2 = preferH
      ? { x: snap(b.x, grid), y: mid1.y }
      : { x: mid1.x, y: snap(b.y, grid) };
    const raw = [a, mid1, mid2, b];
    const path = [];
    for (let i = 0; i < raw.length; i++) {
      if (i === 0 || dist(raw[i], path[path.length - 1]) > 0.5) path.push(raw[i]);
    }
    if (path.length >= 2 && pathClearOfTracks(doc, path, netId, layer, width, clr)) {
      return path;
    }
  }
  return null;
}

/** 兼容旧调用 */
function route45(a, b, grid) {
  return routeL(a, b, grid);
}

function footprintKind(defId) {
  if (defId.includes('SOIC') || defId.includes('DIP') || defId.includes('TO220')) return 'ic';
  if (defId.includes('SOT')) return 'active';
  return 'passive';
}

function annotateFromSchsim(sch) {
  const topo = sch.topology;
  const doc = createEmptyPcb(sch.name || topo.schName || 'Lab PCB');
  const courtyardGap = 80;
  const originX = 260, originY = 260;
  const items = [];

  for (const d of topo.deviceList || []) {
    if (!isLayoutable(d.libDevId, d.refName)) continue;
    const fpStr = paramGet(d.params, 'footprint') || paramGet(d.params, 'package') || paramGet(d.params, '封装');
    const defId = resolveFootprintId(fpStr, d.libDevId);
    const value = paramGet(d.params, 'value') || paramGet(d.params, 'Value') || d.libDevId;
    const ext = halfExtents(defId);
    items.push({
      d, defId, value, ext,
      kind: footprintKind(defId),
      slotW: Math.max(ext.halfW * 2 + courtyardGap * 2, 200),
      slotH: Math.max(ext.halfH * 2 + courtyardGap * 2, 160)
    });
  }

  // IC/有源器件优先居中，无源件环绕 — 更接近模块化成品板
  items.sort((a, b) => {
    const rank = { ic: 0, active: 1, passive: 2 };
    return (rank[a.kind] ?? 3) - (rank[b.kind] ?? 3);
  });

  const n = Math.max(items.length, 1);
  // 少列多行：减少同行焊盘，降低 B 横线互穿
  const cols = n <= 4 ? 1 : n <= 12 ? 2 : Math.max(2, Math.ceil(Math.sqrt(n)));
  const maxRowWidth = Math.max(cols * 280, 560);
  let cursorX = originX, cursorY = originY, rowMaxH = 0;
  let placed = 0;
  let skipped = (topo.deviceList || []).length - items.length;

  for (const it of items) {
    if (cursorX - originX + it.slotW > maxRowWidth && cursorX > originX) {
      cursorX = originX;
      cursorY += rowMaxH;
      rowMaxH = 0;
    }
    const placeX = cursorX + it.ext.halfW + courtyardGap;
    const placeY = cursorY + it.ext.halfH + courtyardGap;
    cursorX += it.slotW;
    rowMaxH = Math.max(rowMaxH, it.slotH);
    // 无源件交替旋转 90°，便于走线扇出
    let rot = it.d.rotate || 0;
    if (it.kind === 'passive' && placed % 3 === 1) rot = (rot + 90) % 360;
    doc.footprints.push(instantiate(it.defId, it.d.refName, it.value,
      { x: placeX, y: placeY }, rot, it.d.instUuid));
    placed++;
  }

  const libByUuid = new Map();
  for (const d of topo.deviceList || []) {
    libByUuid.set(d.instUuid, d.libDevId || '');
  }
  const netMap = new Map();
  const pcbNets = new Map();
  for (const nNet of topo.netList || []) {
    const netId = nNet.netUuid;
    const netName = nNet.netName || nNet.displayName || netId;
    pcbNets.set(netId, { id: netId, name: netName });
    for (const node of nNet.nodeList || []) {
      const pinName = (node.pinName && node.pinName.length > 0) ? node.pinName : node.pinId;
      registerSchPin(netMap, node.devUuid, node.pinId, pinName, netId, netName,
        libByUuid.get(node.devUuid) || '');
    }
  }
  doc.nets = Array.from(pcbNets.values());

  for (const fp of doc.footprints) {
    if (!fp.schematicCompId) continue;
    for (const pad of fp.pads) {
      const bound = lookupPadNet(netMap, fp.schematicCompId, pad.number);
      if (bound) {
        pad.netId = bound.netId;
        pad.netName = bound.netName;
      }
    }
  }

  fitBoardToContent(doc);
  separateClosePads(doc, 50);
  addBoardAccessories(doc);
  separateClosePads(doc, 50);
  return { doc, placed, skipped };
}

/** 异封装焊盘 Y 向至少错开 pitch，避免 B 横线近距平行互穿 */
function separateClosePads(doc, pitch = 50) {
  const grid = doc.metadata.gridSize || 5;
  const fps = doc.footprints.filter(f => !/^H\d+$/.test(f.refDes));
  let guard = 0;
  let changed = true;
  while (changed && guard++ < 400) {
    changed = false;
    const pads = [];
    for (const fp of fps) {
      for (const pad of fp.pads) {
        if (!pad.netId) continue;
        pads.push({ fp, c: padWorld(fp, pad), ref: fp.refDes });
      }
    }
    for (let i = 0; i < pads.length; i++) {
      for (let j = i + 1; j < pads.length; j++) {
        const a = pads[i];
        const b = pads[j];
        if (a.fp === b.fp) continue;
        const dy = Math.abs(a.c.y - b.c.y);
        if (dy < pitch) {
          const move = b.ref === 'J1' ? a.fp : b.fp;
          move.position.y = snap(move.position.y + pitch, grid);
          changed = true;
        }
      }
    }
  }
  fitBoardToContent(doc);
}

/** 板框紧贴内容，消除大片空白 */
function fitBoardToContent(doc) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let has = false;
  const absorb = (x, y) => {
    has = true;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };
  for (const fp of doc.footprints) {
    const ext = halfExtents(fp.defId);
    absorb(fp.position.x - ext.halfW, fp.position.y - ext.halfH);
    absorb(fp.position.x + ext.halfW, fp.position.y + ext.halfH);
  }
  for (const t of doc.tracks) {
    absorb(t.start.x, t.start.y); absorb(t.end.x, t.end.y);
  }
  for (const v of doc.vias) absorb(v.position.x, v.position.y);
  if (!has) {
    doc.boardOutline.points = [
      { x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 700 }, { x: 0, y: 700 }
    ];
    return;
  }
  const margin = 60;
  // 归一化到原点附近
  const shiftX = minX - margin;
  const shiftY = minY - margin;
  if (Math.abs(shiftX) > 0.5 || Math.abs(shiftY) > 0.5) {
    for (const fp of doc.footprints) {
      fp.position.x -= shiftX;
      fp.position.y -= shiftY;
    }
    for (const t of doc.tracks) {
      t.start.x -= shiftX; t.start.y -= shiftY;
      t.end.x -= shiftX; t.end.y -= shiftY;
    }
    for (const v of doc.vias) {
      v.position.x -= shiftX; v.position.y -= shiftY;
    }
    maxX -= shiftX; maxY -= shiftY;
    minX = margin; minY = margin;
  }
  const boardW = Math.max(maxX + margin, 800);
  const boardH = Math.max(maxY + margin, 600);
  doc.boardOutline.points = [
    { x: 0, y: 0 }, { x: boardW, y: 0 }, { x: boardW, y: boardH }, { x: 0, y: boardH }
  ];
}

/** 添加安装孔 + 板边排针，提升成品板密度与专业感 */
function addBoardAccessories(doc) {
  const pts = doc.boardOutline.points;
  let maxX = 0, maxY = 0;
  for (const p of pts) {
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  const pinCount = Math.min(12, Math.max(6, Math.ceil(Math.max(doc.nets.length, 2))));
  const hdrDef = `FP_PINHDR_${pinCount <= 4 ? 4 : pinCount <= 6 ? 6 : 8}`;
  const hdrHalfH = ((pinCount - 1) * 100) / 2 + 50;
  const reserve = 380;
  maxX = maxX + reserve;
  maxY = Math.max(maxY, Math.max(900, hdrHalfH * 2 + 480));
  doc.boardOutline.points = [
    { x: 0, y: 0 }, { x: maxX, y: 0 }, { x: maxX, y: maxY }, { x: 0, y: maxY }
  ];

  const gnd = doc.nets.find(n => isGndNet(n.name));
  const holeInset = 20;
  const hdrX = maxX - 280;
  const hdrY = Math.min(Math.max(maxY / 2, holeInset + hdrHalfH + 120),
    maxY - holeInset - hdrHalfH - 120);
  const holePositions = [
    { x: holeInset, y: holeInset },
    { x: maxX - holeInset, y: holeInset },
    { x: holeInset, y: maxY - holeInset },
    { x: maxX - holeInset, y: maxY - holeInset }
  ];

  const padClearOk = (ax, ay, ar, bx, by, br) =>
    Math.hypot(ax - bx, ay - by) - ar - br >= 12;

  let hi = 1;
  for (const hp of holePositions) {
    let clash = false;
    for (const fp of doc.footprints) {
      const ext = halfExtents(fp.defId);
      if (Math.abs(fp.position.x - hp.x) < ext.halfW + 70 &&
        Math.abs(fp.position.y - hp.y) < ext.halfH + 70) {
        clash = true;
        break;
      }
    }
    for (let pi = 0; pi < pinCount; pi++) {
      const pitch = 100;
      const startY = -((pinCount - 1) * pitch) / 2;
      const py = hdrY + startY + pi * pitch;
      if (!padClearOk(hp.x, hp.y, 35, hdrX, py, 30)) {
        clash = true;
        break;
      }
    }
    if (clash) continue;
    const hole = instantiate('FP_MOUNT', `H${hi}`, 'MH', hp, 0);
    if (gnd) {
      for (const pad of hole.pads) {
        pad.netId = gnd.id;
        pad.netName = gnd.name;
      }
    }
    doc.footprints.push(hole);
    hi++;
  }

  const hdr = instantiate(hdrDef, 'J1', `1x${pinCount}`, { x: hdrX, y: hdrY }, 0);
  const padCountByNet = new Map();
  for (const fp of doc.footprints) {
    for (const pad of fp.pads) {
      if (!pad.netId) continue;
      padCountByNet.set(pad.netId, (padCountByNet.get(pad.netId) || 0) + 1);
    }
  }
  const candidateNets = doc.nets
    .filter(n => !isGndNet(n.name) && (padCountByNet.get(n.id) || 0) >= 1)
    .sort((a, b) => {
      const ca = padCountByNet.get(a.id) || 0;
      const cb = padCountByNet.get(b.id) || 0;
      // 孤儿网（单焊盘）优先接到排针，避免无法布线
      if (ca !== cb) return ca - cb;
      const ap = isVccNet(a.name) ? 0 : 1;
      const bp = isVccNet(b.name) ? 0 : 1;
      return ap - bp;
    });
  // 尽量让每个候选网至少占一针，再循环填充
  for (let i = 0; i < hdr.pads.length; i++) {
    if (i === 0 && gnd) {
      hdr.pads[i].netId = gnd.id;
      hdr.pads[i].netName = gnd.name;
    } else if (candidateNets.length > 0) {
      const n = candidateNets[(i - 1) % candidateNets.length];
      hdr.pads[i].netId = n.id;
      hdr.pads[i].netName = n.name;
    }
  }
  doc.footprints.push(hdr);
}

/**
 * 通道总线布线（严格分层正交）：
 * - 每焊盘唯一 stubY（内容下方）+ 唯一走廊列
 * - 同列多焊盘：先 B 短横到唯一 jogX，再 F 竖
 * - 独列焊盘：直接 F 竖到 stubY
 * - 之后 B 横到走廊、F 竖到总线、B 总线汇合
 */
function autoRoute(doc) {
  const grid = doc.metadata.gridSize || 5;
  const signalW = Math.max(12, doc.metadata.designRules.defaultTrackWidth);
  const powerW = 24;
  const clr = Math.max(6, doc.metadata.designRules?.minClearance ?? 6);
  const pitch = Math.max(powerW, signalW) + clr * 2 + 8;

  const groups = new Map();
  for (const fp of doc.footprints) {
    for (const pad of fp.pads) {
      if (!pad.netId) continue;
      let g = groups.get(pad.netId);
      if (!g) {
        g = { netId: pad.netId, netName: pad.netName || '', points: [] };
        groups.set(pad.netId, g);
      }
      g.points.push(padWorld(fp, pad));
    }
  }

  const routeNets = Array.from(groups.values())
    .filter(g => g.points.length >= 2 && !isGndNet(g.netName))
    .sort((a, b) => {
      const ap = isVccNet(a.netName) ? 0 : 1;
      const bp = isVccNet(b.netName) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return b.points.length - a.points.length;
    });

  let maxContentY = 0;
  let maxContentX = 0;
  for (const fp of doc.footprints) {
    if (/^H\d+$/.test(fp.refDes)) continue;
    const ext = halfExtents(fp.defId);
    maxContentY = Math.max(maxContentY, fp.position.y + ext.halfH);
    maxContentX = Math.max(maxContentX, fp.position.x + ext.halfW);
  }
  for (const g of routeNets) {
    for (const p of g.points) {
      maxContentY = Math.max(maxContentY, p.y);
      maxContentX = Math.max(maxContentX, p.x);
    }
  }

  const allPads = [];
  for (const g of routeNets) {
    for (const p of g.points) {
      allPads.push({ g, p, key: `${g.netId}@${Math.round(p.x)}@${Math.round(p.y)}` });
    }
  }
  allPads.sort((a, b) => a.p.x - b.p.x || a.p.y - b.p.y || a.key.localeCompare(b.key));

  const xCount = new Map();
  for (const item of allPads) {
    const xi = snap(item.p.x, grid);
    xCount.set(xi, (xCount.get(xi) || 0) + 1);
  }

  // 每焊盘唯一 stubY / jogX / 走廊列（jog 带与走廊带串行分配，禁止交错）
  const padStubY = new Map();
  const padCol = new Map();
  const padJogX = new Map();
  let stubY = snap(maxContentY + 60, grid);
  let jogCursor = snap(maxContentX + 40, grid);
  const usedJog = [];

  for (const item of allPads) {
    padStubY.set(item.key, stubY);
    stubY = snap(stubY + pitch, grid);

    const px = snap(item.p.x, grid);
    let jx = px;
    const needJog = (xCount.get(px) || 0) > 1 ||
      usedJog.some(u => Math.abs(u - jx) < pitch);
    if (needJog) {
      jx = jogCursor;
      while (usedJog.some(u => Math.abs(u - jx) < pitch)) jx = snap(jx + pitch, grid);
      jogCursor = snap(jx + pitch, grid);
    }
    usedJog.push(jx);
    padJogX.set(item.key, jx);
  }

  // 走廊列全部在 jog 带右侧，且与所有 jog/px 竖线保持 pitch
  let colX = snap(Math.max(maxContentX + 120, jogCursor + 60), grid);
  for (const item of allPads) {
    while (usedJog.some(u => Math.abs(u - colX) < pitch)) colX = snap(colX + pitch, grid);
    padCol.set(item.key, colX);
    usedJog.push(colX);
    colX = snap(colX + pitch, grid);
  }

  const busStartY = snap(stubY + 60, grid);
  const busBottom = busStartY + Math.max(routeNets.length, 1) * pitch + 80;
  let boardW = Math.max(...doc.boardOutline.points.map(p => p.x), colX + 120);
  let boardH = Math.max(...doc.boardOutline.points.map(p => p.y), busBottom + 80);
  doc.boardOutline.points = [
    { x: 0, y: 0 }, { x: boardW, y: 0 }, { x: boardW, y: boardH }, { x: 0, y: boardH }
  ];

  const addVia = (pos, netId, netName) => {
    if (doc.vias.some(v => v.netId === netId && dist(v.position, pos) < 1)) return;
    doc.vias.push({
      id: uid('via'), position: { x: pos.x, y: pos.y },
      drill: 12, diameter: 24, netId, netName, layers: ['F.Cu', 'B.Cu']
    });
  };
  const pushSeg = (a, b, layer, netId, netName, width) => {
    if (dist(a, b) < 0.5) return;
    doc.tracks.push({
      id: uid('trk'), layer,
      start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
      width, netId, netName
    });
  };

  for (let i = 0; i < routeNets.length; i++) {
    const g = routeNets[i];
    const width = isVccNet(g.netName) ? powerW : signalW;
    const busY = snap(busStartY + i * pitch, grid);
    const pts = g.points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    const hub = pts[0];
    const hubKey = `${g.netId}@${Math.round(hub.x)}@${Math.round(hub.y)}`;
    const hubSx = padCol.get(hubKey);
    const hubBus = { x: hubSx, y: busY };

    for (const p of pts) {
      const key = `${g.netId}@${Math.round(p.x)}@${Math.round(p.y)}`;
      const jx = padJogX.get(key);
      const sy = padStubY.get(key);
      const sx = padCol.get(key);
      const px = snap(p.x, grid);
      const py = snap(p.y, grid);
      const atJog = { x: jx, y: py };
      const atJogStub = { x: jx, y: sy };
      const atColStub = { x: sx, y: sy };
      const atBus = { x: sx, y: busY };

      addVia(p, g.netId, g.netName);
      // 同列：B 短横到 jog；独列：jogX==px，无横线
      pushSeg(p, atJog, 'B.Cu', g.netId, g.netName, width);
      addVia(atJog, g.netId, g.netName);
      // F 竖到唯一 stubY
      pushSeg(atJog, atJogStub, 'F.Cu', g.netId, g.netName, width);
      addVia(atJogStub, g.netId, g.netName);
      // B 横到走廊
      pushSeg(atJogStub, atColStub, 'B.Cu', g.netId, g.netName, width);
      addVia(atColStub, g.netId, g.netName);
      // F 竖到总线 + B 汇合
      pushSeg(atColStub, atBus, 'F.Cu', g.netId, g.netName, width);
      addVia(atBus, g.netId, g.netName);
      if (Math.abs(sx - hubSx) > 0.5) {
        pushSeg(atBus, hubBus, 'B.Cu', g.netId, g.netName, width);
      }
    }
  }

  return { trackCount: doc.tracks.length, netCount: routeNets.length, viaCount: doc.vias.length };
}

function zoneOutlineFromBoard(doc, margin = 40) {
  const pts = doc.boardOutline.points;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return [
    { x: minX + margin, y: minY + margin },
    { x: maxX - margin, y: minY + margin },
    { x: maxX - margin, y: maxY - margin },
    { x: minX + margin, y: maxY - margin }
  ];
}

function buildCutouts(doc, netId) {
  const cutouts = [];
  for (const fp of doc.footprints) {
    for (const pad of fp.pads) {
      if (pad.netId === netId) continue;
      const c = padWorld(fp, pad);
      const hw = Math.max(pad.size.x, pad.size.y) / 2 + 12;
      cutouts.push([
        { x: c.x - hw, y: c.y - hw }, { x: c.x + hw, y: c.y - hw },
        { x: c.x + hw, y: c.y + hw }, { x: c.x - hw, y: c.y + hw }
      ]);
    }
  }
  return cutouts;
}

function pourPlanes(doc) {
  let count = 0;
  const outline = zoneOutlineFromBoard(doc, 40);
  const gnd = doc.nets.find(n => isGndNet(n.name));
  if (gnd) {
    doc.zones.push({
      id: uid('zone'), layer: 'B.Cu', netId: gnd.id, netName: gnd.name,
      outline: outline.map(p => ({ x: p.x, y: p.y })),
      priority: 0, clearance: 10, cutouts: buildCutouts(doc, gnd.id),
      manualCutouts: [], thermalRelief: true, thermalGap: 12, thermalWidth: 10
    });
    count++;
  }
  // 较大板上补一层经典 VCC 顶层铺铜（局部感），提升专业观感
  const vcc = doc.nets.find(n => isPourableVccNet(n.name));
  const boardW = Math.max(...doc.boardOutline.points.map(p => p.x));
  const boardH = Math.max(...doc.boardOutline.points.map(p => p.y));
  if (vcc && boardW * boardH > 900000 && doc.footprints.length >= 8) {
    const topStrip = [
      { x: outline[0].x, y: outline[0].y },
      { x: outline[1].x, y: outline[0].y },
      { x: outline[1].x, y: outline[0].y + Math.min(220, boardH * 0.18) },
      { x: outline[0].x, y: outline[0].y + Math.min(220, boardH * 0.18) }
    ];
    doc.zones.push({
      id: uid('zone'), layer: 'F.Cu', netId: vcc.id, netName: vcc.name,
      outline: topStrip, priority: 1, clearance: 12,
      cutouts: buildCutouts(doc, vcc.id),
      manualCutouts: [], thermalRelief: true, thermalGap: 12, thermalWidth: 12
    });
    count++;
  }
  return count;
}

/**
 * SMD GND 焊盘仅在 F.Cu，B.Cu 铺铜接不到 → 短线 + 缝合过孔接到地铺铜。
 * 通孔焊盘已含 B.Cu，可由铺铜直接连通。
 */
function stitchGndToPour(doc) {
  const gnd = doc.nets.find(n => isGndNet(n.name));
  if (!gnd) return { vias: 0, tracks: 0 };
  const grid = doc.metadata.gridSize || 5;
  const clr = Math.max(6, doc.metadata.designRules?.minClearance ?? 6);
  let viaCount = 0;
  let trackCount = 0;
  for (const fp of doc.footprints) {
    for (const pad of fp.pads) {
      if (pad.netId !== gnd.id) continue;
      const layers = pad.layers || [];
      if (pad.type === 'th' || layers.includes('B.Cu')) continue;
      const pos = padWorld(fp, pad);
      // 已有同网过孔/逃逸走线则不再贴焊盘打缝合孔（避免与 SOIC 焊盘视觉重合）
      const alreadyVia = doc.vias.some(v =>
        v.netId === gnd.id && dist(v.position, pos) < 100);
      if (alreadyVia) continue;
      const alreadyFanout = doc.tracks.some(t =>
        t.netId === gnd.id &&
        (dist(t.start, pos) < 12 || dist(t.end, pos) < 12));
      if (alreadyFanout) continue;
      const ox = Math.abs(pad.size?.x || 40) / 2 + 28;
      const oy = Math.abs(pad.size?.y || 40) / 2 + 28;
      const candidates = [
        { x: snap(pos.x + ox, grid), y: snap(pos.y, grid) },
        { x: snap(pos.x - ox, grid), y: snap(pos.y, grid) },
        { x: snap(pos.x, grid), y: snap(pos.y + oy, grid) },
        { x: snap(pos.x, grid), y: snap(pos.y - oy, grid) }
      ];
      let placed = false;
      for (const stitch of candidates) {
        // 优先：无走线，过孔足够近即算连通；否则短线且不撞线
        const nearEnough = dist(pos, stitch) <= 24;
        if (!nearEnough &&
          !pathClearOfTracks(doc, [pos, stitch], gnd.id, 'F.Cu', 12, clr)) {
          continue;
        }
        if (!nearEnough) {
          doc.tracks.push({
            id: uid('trk'), layer: 'F.Cu',
            start: { x: pos.x, y: pos.y },
            end: { x: stitch.x, y: stitch.y },
            width: 12, netId: gnd.id, netName: gnd.name
          });
          trackCount++;
        }
        doc.vias.push({
          id: uid('via'), position: { x: stitch.x, y: stitch.y },
          drill: 12, diameter: 24, netId: gnd.id, netName: gnd.name,
          layers: ['F.Cu', 'B.Cu']
        });
        viaCount++;
        placed = true;
        break;
      }
      if (!placed) {
        const stitch = candidates[0];
        doc.vias.push({
          id: uid('via'), position: { x: stitch.x, y: stitch.y },
          drill: 12, diameter: 24, netId: gnd.id, netName: gnd.name,
          layers: ['F.Cu', 'B.Cu']
        });
        viaCount++;
      }
    }
  }
  return { vias: viaCount, tracks: trackCount };
}

function integrityHash(obj) {
  const raw = JSON.stringify(obj);
  return createHash('sha256').update(raw).digest('hex');
}

function buildPcbsim(sch, pcb) {
  const now = new Date().toISOString();
  const body = {
    magic: 'SCHSIM',
    version: sch.version || '2.0.0',
    name: sch.name || pcb.name,
    topology: sch.topology,
    pcb,
    simConfig: sch.simConfig || { simMode: 'mixed' },
    aiConfigs: sch.aiConfigs || [],
    createdAt: sch.createdAt || now,
    modifiedAt: now
  };
  body.integrityHash = integrityHash({
    topology: body.topology, pcb: body.pcb, simConfig: body.simConfig
  });
  return body;
}

function updateManifest(dir) {
  const manifestPath = join(dir, 'template_manifest.json');
  if (!existsSync(manifestPath)) return;
  const man = JSON.parse(readFileSync(manifestPath, 'utf8'));
  man.description =
    'Each .schsim / .pcbsim is a lab template, packed to rawfile/Test_Template';
  for (const t of man.templates || []) {
    t.pcbFile = `${t.id}.pcbsim`;
  }
  writeFileSync(manifestPath, JSON.stringify(man, null, 2) + '\n', 'utf8');
}

/**
 * 直流电源电路手写成品布局：正交总线 + 水平接入排针，保证间距/连通。
 * 自动布线在小电源板上易斜穿/共线，教学模板以本布局为准。
 */
function handLayoutLabPower(doc) {
  doc.tracks = [];
  doc.vias = [];
  doc.zones = [];
  // 去掉自动配件，仅保留原理图关联器件
  doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
  const byRef = new Map(doc.footprints.map(f => [f.refDes, f]));
  const setPos = (ref, x, y, rot) => {
    const fp = byRef.get(ref);
    if (!fp) return;
    fp.position = { x, y };
    fp.rotation = rot;
    fp.mirrored = false;
    fp.layer = 'F.Cu';
  };
  // 左：保险/稳压/滤波；右：排针（板框与安装孔由 fit + addCornerMountHoles 决定）
  setPos('U1', 700, 420, 0);
  setPos('F1', 480, 280, 90);
  setPos('C1', 520, 680, 0);
  setPos('C2', 880, 680, 0);
  setPos('R1', 1080, 680, 90);

  const gnd = doc.nets.find(n => isGndNet(n.name));
  const netByName = (name) => doc.nets.find(n => (n.name || '').toUpperCase() === name);
  const vin = netByName('VIN_SRC');
  const reg = netByName('REG_IN');
  const vout = netByName('VOUT');

  const hdr = instantiate('FP_PINHDR_4', 'J1', '1x4', { x: 1420, y: 550 }, 0);
  const hdrNets = [gnd, vin, reg, vout];
  for (let i = 0; i < hdr.pads.length; i++) {
    const n = hdrNets[i];
    if (!n) continue;
    hdr.pads[i].netId = n.id;
    hdr.pads[i].netName = n.name;
  }
  doc.footprints.push(hdr);

  const pw = (ref, num) => {
    const fp = doc.footprints.find(f => f.refDes === ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    return padWorld(fp, pad);
  };
  const add = (net, a, b, w = 24, layer = 'F.Cu') => {
    if (!net || dist(a, b) < 0.5) return;
    doc.tracks.push({
      id: uid('trk'), layer,
      start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
      width: w, netId: net.id, netName: net.name
    });
  };
  const L = (net, pts, w = 24) => {
    for (let i = 0; i < pts.length - 1; i++) add(net, pts[i], pts[i + 1], w);
  };

  const u1in = pw('U1', 1), u1g = pw('U1', 2), u1out = pw('U1', 3);
  const f1a = pw('F1', 1), f1b = pw('F1', 2);
  const c1a = pw('C1', 1), c1b = pw('C1', 2);
  const c2a = pw('C2', 1), c2b = pw('C2', 2);
  const r1a = pw('R1', 1), r1b = pw('R1', 2);
  const jGnd = pw('J1', 1), jVin = pw('J1', 2), jReg = pw('J1', 3), jVout = pw('J1', 4);

  // VIN_SRC：顶层水平总线 y=220，竖脊 x=1300，水平接入 J1.P2
  L(vin, [f1a, { x: 1300, y: f1a.y }, { x: 1300, y: jVin.y }, jVin], 24);

  // REG_IN：从上方竖直接入 C1.P1，避免 y=680 横线穿过 C1.P2(GND)
  L(reg, [u1in, { x: c1a.x, y: u1in.y }, c1a], 24);
  L(reg, [f1b, { x: u1in.x, y: f1b.y }, u1in], 24);
  L(reg, [
    { x: u1in.x, y: f1b.y },
    { x: 1220, y: f1b.y },
    { x: 1220, y: jReg.y },
    jReg
  ], 24);

  // VOUT：接到 C2.P1 后走下方总线；侧向接入 R1.P1，避免沿 x=1080 竖穿 R1.P2(GND)
  L(vout, [u1out, { x: u1out.x, y: c2a.y }, c2a], 24);
  const vBusY = 850;
  const rApproachX = r1a.x - 80;
  L(vout, [
    c2a,
    { x: c2a.x, y: vBusY },
    { x: rApproachX, y: vBusY },
    { x: rApproachX, y: r1a.y },
    r1a
  ], 24);
  L(vout, [
    { x: rApproachX, y: vBusY },
    { x: 1340, y: vBusY },
    { x: 1340, y: jVout.y },
    jVout
  ], 24);

  // GND：SMD 焊盘打过孔后走 B.Cu 总线，连通 U1.GND / C1·C2·R1 / J1.1
  // （顶层电源走线密集，地线放底层避免与 REG/VOUT 共线）
  const addVia = (net, p) => {
    if (!net) return;
    for (const v of doc.vias) {
      if (v.netId === net.id && Math.abs(v.position.x - p.x) < 0.5 &&
        Math.abs(v.position.y - p.y) < 0.5) return;
    }
    doc.vias.push({
      id: uid('via'),
      position: { x: p.x, y: p.y },
      drill: 12, diameter: 24,
      netId: net.id, netName: net.name,
      layers: ['F.Cu', 'B.Cu'], kind: 'through'
    });
  };
  const addB = (net, a, b, w = 20) => add(net, a, b, w, 'B.Cu');
  if (gnd) {
    addVia(gnd, c1b);
    addVia(gnd, c2b);
    addVia(gnd, r1b);
    const gndY = c1b.y;
    addB(gnd, u1g, { x: u1g.x, y: gndY });
    addB(gnd, { x: u1g.x, y: gndY }, c1b);
    addB(gnd, c1b, c2b);
    addB(gnd, c2b, { x: r1b.x, y: gndY });
    addB(gnd, { x: r1b.x, y: gndY }, r1b);
    const gndRiseX = 1180;
    addB(gnd, c2b, { x: gndRiseX, y: gndY });
    addB(gnd, { x: gndRiseX, y: gndY }, { x: gndRiseX, y: jGnd.y });
    addB(gnd, { x: gndRiseX, y: jGnd.y }, jGnd);
  }

  return {
    trackCount: doc.tracks.length,
    netCount: [vin, reg, vout, gnd].filter(Boolean).length,
    viaCount: doc.vias.length
  };
}

/**
 * 运算放大电路手写成品布局：LM358 同相放大 + 反馈网络。
 * 布局：Rf 上 / U1 中 / R1·Rg 下。
 * 到排针：器件区用 F 上升到板顶专属 runY（避免 B 竖穿 FB 的 B 横线），再 B 横到 riseX 下落。
 *
 * LM358 SOIC-8：1 OUT1  2 IN-1  3 IN+1  4 V-  5 IN+2  6 IN-2  7 OUT2  8 V+
 */
function handLayoutLabAmp(doc) {
  doc.tracks = [];
  doc.vias = [];
  doc.zones = [];
  doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
  const byRef = new Map(doc.footprints.map(f => [f.refDes, f]));
  const setPos = (ref, x, y, rot) => {
    const fp = byRef.get(ref);
    if (!fp) return;
    fp.position = { x, y };
    fp.rotation = rot;
    fp.mirrored = false;
    fp.layer = 'F.Cu';
  };

  const gnd = doc.nets.find(n => isGndNet(n.name));
  const netByName = (name) => doc.nets.find(n => (n.name || '').toUpperCase() === name);
  const vcc = netByName('VCC');
  const sigSrc = netByName('SIG_SRC');
  const sigIn = netByName('SIG_IN');
  const fb = netByName('FB');
  const sigOut = netByName('SIG_OUT');
  const bFb = netByName('U1_B_FB');

  setPos('Rf', 640, 250, 0);
  setPos('U1', 640, 470, 0);
  setPos('R1', 420, 740, 0);
  setPos('Rg', 420, 920, 0);

  const hdr = instantiate('FP_PINHDR_6', 'J1', '1x6', { x: 1480, y: 580 }, 0);
  const hdrNets = [gnd, vcc, sigSrc, sigIn, sigOut, fb];
  for (let i = 0; i < hdr.pads.length; i++) {
    const n = hdrNets[i];
    if (!n) continue;
    hdr.pads[i].netId = n.id;
    hdr.pads[i].netName = n.name;
  }
  doc.footprints.push(hdr);

  const pw = (ref, num) => {
    const fp = doc.footprints.find(f => f.refDes === ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    return padWorld(fp, pad);
  };

  const add = (net, a, b, w = 14, layer = 'F.Cu') => {
    if (!net || dist(a, b) < 0.5) return;
    doc.tracks.push({
      id: uid('trk'), layer,
      start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
      width: w, netId: net.id, netName: net.name
    });
  };
  const addVia = (net, p) => {
    if (!net) return;
    for (const v of doc.vias) {
      if (v.netId === net.id && Math.abs(v.position.x - p.x) < 0.5 &&
        Math.abs(v.position.y - p.y) < 0.5) return;
    }
    doc.vias.push({
      id: uid('via'),
      position: { x: p.x, y: p.y },
      drill: 12, diameter: 24,
      netId: net.id, netName: net.name,
      layers: ['F.Cu', 'B.Cu'], kind: 'through'
    });
  };

  const escape = (net, padPt, dirX, w = 14, stubLen = 50) => {
    const e = { x: padPt.x + dirX * stubLen, y: padPt.y };
    add(net, padPt, e, w, 'F.Cu');
    addVia(net, e);
    return e;
  };

  /**
   * 到排针：从 esc 用 F 升到板顶 runY（器件左侧走廊），B 横到 riseX，F 下落进针。
   * 右侧起点（x>=900）可直接 B 升，少占 F。
   */
  let slot = 0;
  const toHeader = (net, esc, jPad, w = 14) => {
    if (!net) return;
    const s = slot++;
    const riseX = 1080 + s * 40;
    const runY = 70 + s * 30;
    const atRun = { x: esc.x, y: runY };
    const atCol = { x: riseX, y: runY };
    const atRow = { x: riseX, y: jPad.y };
    const riseLayer = esc.x < 900 ? 'F.Cu' : 'B.Cu';
    add(net, esc, atRun, w, riseLayer);
    addVia(net, atRun);
    add(net, atRun, atCol, w, 'B.Cu');
    addVia(net, atCol);
    add(net, atCol, atRow, w, 'F.Cu');
    addVia(net, atRow);
    add(net, atRow, { x: jPad.x, y: jPad.y }, w, 'B.Cu');
    addVia(net, jPad);
  };

  const uOut1 = pw('U1', 1), uInM1 = pw('U1', 2), uInP1 = pw('U1', 3), uVm = pw('U1', 4);
  const uInP2 = pw('U1', 5), uInM2 = pw('U1', 6), uOut2 = pw('U1', 7), uVp = pw('U1', 8);
  const r1a = pw('R1', 1), r1b = pw('R1', 2);
  const rfa = pw('Rf', 1), rfb = pw('Rf', 2);
  const rga = pw('Rg', 1), rgb = pw('Rg', 2);
  const jGnd = pw('J1', 1), jVcc = pw('J1', 2), jSrc = pw('J1', 3);
  const jIn = pw('J1', 4), jOut = pw('J1', 5), jFb = pw('J1', 6);

  add(bFb, uOut2, uInM2, 10, 'F.Cu');

  // GND：底边 B；Rg 右侧接到 eGndR，避免竖穿 R1
  const eGndL = escape(gnd, uVm, -1, 12, 120);
  const eGndR = escape(gnd, uInP2, 1, 12, 55);
  add(gnd, eGndL, eGndR, 12, 'B.Cu');
  const eRgb = escape(gnd, rgb, 1, 12, 40);
  add(gnd, eRgb, { x: eGndR.x, y: eRgb.y }, 12, 'B.Cu');
  addVia(gnd, { x: eGndR.x, y: eRgb.y });
  add(gnd, { x: eGndR.x, y: eRgb.y }, eGndR, 12, 'F.Cu');

  // SIG_OUT：左逃远离 FB stub；通道放在 Rf 与 U1 之间，避开板顶 header runY 带
  const eOut = escape(sigOut, uOut1, -1, 14, 95);
  const eRfb = escape(sigOut, rfb, 1, 14, 45);
  const outChanY = Math.round((rfb.y + uOut1.y) / 2);
  const outMid = { x: eOut.x, y: outChanY };
  const outAtRfb = { x: eRfb.x, y: outChanY };
  add(sigOut, eOut, outMid, 14, 'F.Cu');
  addVia(sigOut, outMid);
  add(sigOut, outMid, outAtRfb, 14, 'B.Cu');
  addVia(sigOut, outAtRfb);
  add(sigOut, outAtRfb, eRfb, 14, 'F.Cu');

  // SIG_IN：专属 inCol（在 GND/OUT 逃逸以左）F 上升，两端 B 接入
  const eR1b = escape(sigIn, r1b, 1, 14, 45);
  const eInP = escape(sigIn, uInP1, -1, 14, 45);
  const inCol = Math.min(eGndL.x, eOut.x) - 45;
  const inAtR1 = { x: inCol, y: eR1b.y };
  const inAtPad = { x: inCol, y: eInP.y };
  add(sigIn, eR1b, inAtR1, 14, 'B.Cu');
  addVia(sigIn, inAtR1);
  add(sigIn, inAtR1, inAtPad, 14, 'F.Cu');
  addVia(sigIn, inAtPad);
  add(sigIn, inAtPad, eInP, 14, 'B.Cu');

  // FB 左 rail
  const eInM = escape(fb, uInM1, -1, 14, 70);
  const eRfa = escape(fb, rfa, -1, 14, 50);
  const eRga = escape(fb, rga, -1, 14, 45);
  const fbRail = Math.min(eInM.x, eRfa.x, eRga.x, eOut.x, eGndL.x, inCol, r1a.x - 50) - 50;
  add(fb, eInM, { x: fbRail, y: eInM.y }, 14, 'B.Cu');
  addVia(fb, { x: fbRail, y: eInM.y });
  add(fb, { x: fbRail, y: eInM.y }, { x: fbRail, y: eRfa.y }, 14, 'F.Cu');
  addVia(fb, { x: fbRail, y: eRfa.y });
  add(fb, { x: fbRail, y: eRfa.y }, eRfa, 14, 'B.Cu');
  add(fb, { x: fbRail, y: eRfa.y }, { x: fbRail, y: eRga.y }, 14, 'F.Cu');
  addVia(fb, { x: fbRail, y: eRga.y });
  add(fb, { x: fbRail, y: eRga.y }, eRga, 14, 'B.Cu');

  // 扇出：左侧网从走廊点出发（F 升），右侧网从逃逸点出发
  const eSrc = escape(sigSrc, r1a, -1, 14, 40);
  // SIG_SRC 先 B 到 inCol 左侧专属列，避免与 inCol 上 SIG_IN 共列
  const srcCol = inCol - 40;
  add(sigSrc, eSrc, { x: srcCol, y: eSrc.y }, 14, 'B.Cu');
  addVia(sigSrc, { x: srcCol, y: eSrc.y });
  toHeader(sigSrc, { x: srcCol, y: eSrc.y }, jSrc, 14);
  toHeader(sigIn, inAtPad, jIn, 14);
  toHeader(fb, { x: fbRail, y: eRga.y }, jFb, 14);
  toHeader(sigOut, eRfb, jOut, 14);
  // 右侧 VCC/GND：短 stub 后 B 横到互异列再 F 升，避免竖穿对方 stub
  const eVcc = escape(vcc, uVp, 1, 20, 55);
  const vccCol = { x: eVcc.x + 90, y: eVcc.y };
  const gndColPt = { x: eGndR.x + 140, y: eGndR.y };
  add(vcc, eVcc, vccCol, 20, 'B.Cu');
  addVia(vcc, vccCol);
  add(gnd, eGndR, gndColPt, 16, 'B.Cu');
  addVia(gnd, gndColPt);
  toHeader(vcc, vccCol, jVcc, 20);
  toHeader(gnd, gndColPt, jGnd, 16);

  return {
    trackCount: doc.tracks.length,
    netCount: [sigSrc, sigIn, fb, sigOut, vcc, bFb].filter(Boolean).length,
    viaCount: doc.vias.length
  };
}

/**
 * RC 滤波 + LM358 电压跟随手写布局。
 * SIG_SRC→R1→SIG_MID（C1 到地）→U1 IN+；OUT1↔IN- 为 BUF_FB 跟随输出。
 */
function handLayoutLabFilter(doc) {
  doc.tracks = [];
  doc.vias = [];
  doc.zones = [];
  doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
  const byRef = new Map(doc.footprints.map(f => [f.refDes, f]));
  const setPos = (ref, x, y, rot) => {
    const fp = byRef.get(ref);
    if (!fp) return;
    fp.position = { x, y };
    fp.rotation = rot;
    fp.mirrored = false;
    fp.layer = 'F.Cu';
  };

  const gnd = doc.nets.find(n => isGndNet(n.name));
  const netByName = (name) => doc.nets.find(n => (n.name || '').toUpperCase() === name);
  const vcc = netByName('VCC');
  const sigSrc = netByName('SIG_SRC');
  const sigMid = netByName('SIG_MID');
  const bufFb = netByName('BUF_FB');
  const bFb = netByName('U1_B_FB');

  setPos('R1', 300, 380, 0);
  setPos('C1', 480, 560, 90);
  setPos('U1', 700, 400, 0);

  const hdr = instantiate('FP_PINHDR_6', 'J1', '1x5', { x: 1280, y: 460 }, 0);
  const hdrNets = [gnd, vcc, sigSrc, sigMid, bufFb];
  for (let i = 0; i < hdr.pads.length; i++) {
    const n = hdrNets[i];
    if (!n) continue;
    hdr.pads[i].netId = n.id;
    hdr.pads[i].netName = n.name;
  }
  doc.footprints.push(hdr);

  const pw = (ref, num) => {
    const fp = doc.footprints.find(f => f.refDes === ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    return padWorld(fp, pad);
  };
  const add = (net, a, b, w = 14, layer = 'F.Cu') => {
    if (!net || dist(a, b) < 0.5) return;
    doc.tracks.push({
      id: uid('trk'), layer,
      start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
      width: w, netId: net.id, netName: net.name
    });
  };
  const addVia = (net, p) => {
    if (!net) return;
    for (const v of doc.vias) {
      if (v.netId === net.id && Math.abs(v.position.x - p.x) < 0.5 &&
        Math.abs(v.position.y - p.y) < 0.5) return;
    }
    doc.vias.push({
      id: uid('via'),
      position: { x: p.x, y: p.y },
      drill: 12, diameter: 24,
      netId: net.id, netName: net.name,
      layers: ['F.Cu', 'B.Cu'], kind: 'through'
    });
  };
  const escape = (net, padPt, dirX, w = 14, stubLen = 50) => {
    const e = { x: padPt.x + dirX * stubLen, y: padPt.y };
    add(net, padPt, e, w, 'F.Cu');
    addVia(net, e);
    return e;
  };

  let slot = 0;
  const toHeader = (net, esc, jPad, w = 14) => {
    if (!net) return;
    const s = slot++;
    const riseX = 1000 + s * 40;
    const runY = 70 + s * 28;
    const atRun = { x: esc.x, y: runY };
    const atCol = { x: riseX, y: runY };
    const atRow = { x: riseX, y: jPad.y };
    const riseLayer = esc.x < 900 ? 'F.Cu' : 'B.Cu';
    add(net, esc, atRun, w, riseLayer);
    addVia(net, atRun);
    add(net, atRun, atCol, w, 'B.Cu');
    addVia(net, atCol);
    add(net, atCol, atRow, w, 'F.Cu');
    addVia(net, atRow);
    add(net, atRow, { x: jPad.x, y: jPad.y }, w, 'B.Cu');
    addVia(net, jPad);
  };

  const uOut1 = pw('U1', 1), uInM1 = pw('U1', 2), uInP1 = pw('U1', 3), uVm = pw('U1', 4);
  const uInP2 = pw('U1', 5), uInM2 = pw('U1', 6), uOut2 = pw('U1', 7), uVp = pw('U1', 8);
  const r1a = pw('R1', 1), r1b = pw('R1', 2);
  const c1a = pw('C1', 1), c1b = pw('C1', 2);
  const jGnd = pw('J1', 1), jVcc = pw('J1', 2), jSrc = pw('J1', 3);
  const jMid = pw('J1', 4), jOut = pw('J1', 5);

  add(bFb, uOut2, uInM2, 10, 'F.Cu');
  add(bufFb, uOut1, uInM1, 12, 'F.Cu');

  // GND 先布：左逃加长，给 SIG_MID 左侧走廊留空
  const eC1b = escape(gnd, c1b, 1, 14, 40);
  const eGndL = escape(gnd, uVm, -1, 12, 100);
  const eGndR = escape(gnd, uInP2, 1, 12, 55);
  add(gnd, eGndL, eGndR, 12, 'B.Cu');
  add(gnd, eC1b, { x: eC1b.x, y: eGndL.y }, 14, 'F.Cu');
  addVia(gnd, { x: eC1b.x, y: eGndL.y });
  add(gnd, { x: eC1b.x, y: eGndL.y }, eGndL, 14, 'B.Cu');

  // SIG_MID：R1→C1→左侧走廊→IN+（不穿 GND/OUT stub 列）
  const eR1b = escape(sigMid, r1b, 1, 14, 40);
  const eC1a = escape(sigMid, c1a, -1, 14, 40);
  const eInP = escape(sigMid, uInP1, -1, 14, 40);
  const inCol = Math.min(eGndL.x, eC1a.x) - 45;
  add(sigMid, eR1b, { x: eR1b.x, y: eC1a.y }, 14, 'F.Cu');
  addVia(sigMid, { x: eR1b.x, y: eC1a.y });
  add(sigMid, { x: eR1b.x, y: eC1a.y }, eC1a, 14, 'B.Cu');
  const midAtC = { x: inCol, y: eC1a.y };
  const midAtIn = { x: inCol, y: eInP.y };
  add(sigMid, eC1a, midAtC, 14, 'B.Cu');
  addVia(sigMid, midAtC);
  add(sigMid, midAtC, midAtIn, 14, 'F.Cu');
  addVia(sigMid, midAtIn);
  add(sigMid, midAtIn, eInP, 14, 'B.Cu');

  // BUF_FB 扇出：从 OUT1 上绕到芯片右侧再进排针
  const eOut = escape(bufFb, uOut1, -1, 14, 55);
  const outJog = { x: eOut.x, y: eOut.y - 70 };
  add(bufFb, eOut, outJog, 14, 'F.Cu');
  addVia(bufFb, outJog);
  const outCol = { x: uVp.x + 100, y: outJog.y };
  add(bufFb, outJog, outCol, 14, 'B.Cu');
  addVia(bufFb, outCol);

  const eSrc = escape(sigSrc, r1a, -1, 14, 45);
  const srcCol = Math.min(eSrc.x, inCol) - 40;
  add(sigSrc, eSrc, { x: srcCol, y: eSrc.y }, 14, 'B.Cu');
  addVia(sigSrc, { x: srcCol, y: eSrc.y });
  toHeader(sigSrc, { x: srcCol, y: eSrc.y }, jSrc, 14);
  toHeader(sigMid, midAtIn, jMid, 14);
  toHeader(bufFb, outCol, jOut, 14);
  const eVcc = escape(vcc, uVp, 1, 20, 55);
  const vccCol = { x: eVcc.x + 90, y: eVcc.y };
  add(vcc, eVcc, vccCol, 20, 'B.Cu');
  addVia(vcc, vccCol);
  toHeader(vcc, vccCol, jVcc, 20);
  const gndCol = { x: eGndR.x + 130, y: eGndR.y };
  add(gnd, eGndR, gndCol, 16, 'B.Cu');
  addVia(gnd, gndCol);
  toHeader(gnd, gndCol, jGnd, 16);

  return {
    trackCount: doc.tracks.length,
    netCount: [sigSrc, sigMid, bufFb, vcc, bFb].filter(Boolean).length,
    viaCount: doc.vias.length
  };
}



/**
 * 51 流水灯手写布局：AT89C51 DIP-40 + 晶振/复位 + 8 路 LED。
 * P1.0-P1.7 左侧对齐 LED 行；VCC/GND 分列 B 总线；排针各网专属上升列。
 */
function handLayoutLab51Led(doc) {
  doc.tracks = [];
  doc.vias = [];
  doc.zones = [];
  doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);

  for (const fp of doc.footprints) {
    if (fp.refDes === 'U1') {
      const neu = instantiate('FP_DIP40', 'U1', fp.value || 'AT89C51', fp.position, 0, fp.schematicCompId);
      fp.defId = neu.defId;
      fp.pads = neu.pads;
      for (const p of fp.pads) { p.netId = undefined; p.netName = undefined; }
    } else if (fp.refDes === 'Y1' && fp.defId !== 'FP_HC49') {
      const neu = instantiate('FP_HC49', 'Y1', fp.value || '11.0592M', fp.position, 0, fp.schematicCompId);
      fp.defId = neu.defId;
      fp.pads = neu.pads;
      for (const p of fp.pads) { p.netId = undefined; p.netName = undefined; }
    }
  }

  const byRef = new Map(doc.footprints.map(f => [f.refDes, f]));
  const setPos = (ref, x, y, rot = 0) => {
    const fp = byRef.get(ref);
    if (!fp) return;
    fp.position = { x, y };
    fp.rotation = rot;
    fp.mirrored = false;
    fp.layer = 'F.Cu';
  };

  const gnd = doc.nets.find(n => isGndNet(n.name));
  const netByName = (name) => doc.nets.find(n => (n.name || '').toUpperCase() === name);
  const vcc = netByName('VCC');
  const xtal1 = netByName('XTAL1');
  const xtal2 = netByName('XTAL2');
  const nrst = netByName('NRST');
  const pwrLed = netByName('PWR_LED');

  const ux = 820, uy = 1200;
  const leftX = ux - 300;
  const rightX = ux + 300;
  const pinY = (n) => uy - 950 + (n - 1) * 100; // pad 1..20 left column

  setPos('U1', ux, uy, 0);
  for (let i = 0; i < 8; i++) {
    const y = pinY(i + 1);
    setPos(`RL${i + 1}`, 260, y, 0);
    setPos(`D${i + 1}`, 400, y, 0);
  }
  // 晶振竖放；CX 旋转 180°：pad1(信号)朝 Y1，pad2(GND)朝外，避免 XTAL 线穿 GND 焊盘
  setPos('Y1', leftX - 200, (pinY(18) + pinY(19)) / 2, 90);
  setPos('CX1', leftX - 360, pinY(19), 180);
  setPos('CX2', leftX - 360, pinY(18), 180);
  setPos('R1', leftX - 160, pinY(9), 0);
  // 右区：gndRight < U1.VCC < vccRail < 排针升列
  setPos('C3', rightX + 120, pinY(1) + 100, 0);
  setPos('R_PWR', rightX + 120, pinY(1) - 180, 0);
  setPos('D9', rightX + 280, pinY(1) - 180, 0);

  const hdr = instantiate('FP_PINHDR_4', 'J1', '1x4', { x: 1580, y: uy }, 0);
  const hdrNets = [gnd, vcc, nrst, pwrLed];
  for (let i = 0; i < hdr.pads.length; i++) {
    const n = hdrNets[i];
    if (!n) continue;
    hdr.pads[i].netId = n.id;
    hdr.pads[i].netName = n.name;
  }
  doc.footprints.push(hdr);

  const bindU1 = (padNum, net) => {
    const fp = byRef.get('U1');
    const pad = fp?.pads.find(p => p.number === String(padNum));
    if (pad && net) { pad.netId = net.id; pad.netName = net.name; }
  };
  for (let i = 0; i < 8; i++) bindU1(i + 1, netByName(`L${i}_K`));
  bindU1(9, nrst);
  bindU1(18, xtal2);
  bindU1(19, xtal1);
  bindU1(20, gnd);
  bindU1(31, vcc);
  bindU1(40, vcc);
  const y1 = byRef.get('Y1');
  if (y1) {
    const p1 = y1.pads.find(p => p.number === '1');
    const p2 = y1.pads.find(p => p.number === '2');
    if (p1 && xtal2) { p1.netId = xtal2.id; p1.netName = xtal2.name; }
    if (p2 && xtal1) { p2.netId = xtal1.id; p2.netName = xtal1.name; }
  }

  const pw = (ref, num) => {
    const fp = doc.footprints.find(f => f.refDes === ref);
    const pad = fp?.pads.find(p => p.number === String(num));
    return padWorld(fp, pad);
  };
  const add = (net, a, b, w = 14, layer = 'F.Cu') => {
    if (!net || !a || !b || dist(a, b) < 0.5) return;
    doc.tracks.push({
      id: uid('trk'), layer,
      start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
      width: w, netId: net.id, netName: net.name
    });
  };
  const addVia = (net, p) => {
    if (!net || !p) return;
    for (const v of doc.vias) {
      if (v.netId === net.id && Math.abs(v.position.x - p.x) < 0.5 &&
        Math.abs(v.position.y - p.y) < 0.5) return;
    }
    doc.vias.push({
      id: uid('via'), position: { x: p.x, y: p.y },
      drill: 12, diameter: 24,
      netId: net.id, netName: net.name,
      layers: ['F.Cu', 'B.Cu'], kind: 'through'
    });
  };
  const smdToB = (net, padPt, dx, dy, w = 14) => {
    const e = { x: padPt.x + dx, y: padPt.y + dy };
    add(net, padPt, e, w, 'F.Cu');
    addVia(net, e);
    return e;
  };

  const gndLeftX = leftX - 200;
  // gndRight 必须在 U1 右侧 VCC 焊盘左侧，避免 VCC 焊盘→轨 的 B 横穿
  const gndRightX = ux + 200;
  const vccRailX = rightX + 180;
  const ledVccX = 90;
  const gndJoinY = uy + 1100;
  const j1x = 1580;
  const nrstLeftCol = gndLeftX - 280; // 在 CX 的 GND 短横左侧，避免竖线穿晶振 GND

  /**
   * 右侧网：B 短横到专属列 → F 竖到针脚行 → B 短进焊盘（末段 B 避免 F 横穿其它升列）
   */
  let slot = 0;
  const toHeaderRight = (net, esc, jPad, w = 16) => {
    if (!net || !esc || !jPad) return;
    const s = slot++;
    const riseX = j1x - 60 - s * 60;
    const atCol = { x: riseX, y: esc.y };
    const atRow = { x: riseX, y: jPad.y };
    add(net, esc, atCol, w, 'B.Cu');
    addVia(net, atCol);
    add(net, atCol, atRow, w, 'F.Cu');
    addVia(net, atRow);
    add(net, atRow, jPad, w, 'B.Cu');
  };
  /** 左侧网：外侧列下到底通道再横到 riseX */
  const toHeaderLeft = (net, esc, jPad, w = 16) => {
    if (!net || !esc || !jPad) return;
    const s = slot++;
    const riseX = j1x - 60 - s * 60;
    const chanY = gndJoinY + 80 + s * 40;
    const atLeft = { x: nrstLeftCol, y: esc.y };
    const atChan = { x: nrstLeftCol, y: chanY };
    const atCol = { x: riseX, y: chanY };
    const atRow = { x: riseX, y: jPad.y };
    add(net, esc, atLeft, w, 'B.Cu');
    add(net, atLeft, atChan, w, 'B.Cu');
    add(net, atChan, atCol, w, 'B.Cu');
    addVia(net, atCol);
    add(net, atCol, atRow, w, 'F.Cu');
    addVia(net, atRow);
    add(net, atRow, jPad, w, 'B.Cu');
  };

  const uGnd = pw('U1', 20), uVcc = pw('U1', 40), uEa = pw('U1', 31);
  const uRst = pw('U1', 9), uX1 = pw('U1', 19), uX2 = pw('U1', 18);
  const yA = pw('Y1', 1), yB = pw('Y1', 2);
  const cx1a = pw('CX1', 1), cx1b = pw('CX1', 2);
  const cx2a = pw('CX2', 1), cx2b = pw('CX2', 2);
  const r1a = pw('R1', 1), r1b = pw('R1', 2);
  const c3a = pw('C3', 1), c3b = pw('C3', 2);
  const rpA = pw('R_PWR', 1), rpB = pw('R_PWR', 2);
  const d9a = pw('D9', 1), d9k = pw('D9', 2);
  const jGnd = pw('J1', 1), jVcc = pw('J1', 2), jRst = pw('J1', 3), jPwr = pw('J1', 4);

  // —— 晶振：MCU↔Y1↔CX(pad1 朝内)；GND 自 pad2 向外 ——
  add(xtal1, uX1, { x: yB.x, y: uX1.y }, 12, 'F.Cu');
  add(xtal1, { x: yB.x, y: uX1.y }, yB, 12, 'F.Cu');
  add(xtal2, uX2, { x: yA.x, y: uX2.y }, 12, 'F.Cu');
  add(xtal2, { x: yA.x, y: uX2.y }, yA, 12, 'F.Cu');
  add(xtal1, yB, { x: cx1a.x, y: yB.y }, 12, 'F.Cu');
  add(xtal1, { x: cx1a.x, y: yB.y }, cx1a, 12, 'F.Cu');
  add(xtal2, yA, { x: cx2a.x, y: yA.y }, 12, 'F.Cu');
  add(xtal2, { x: cx2a.x, y: yA.y }, cx2a, 12, 'F.Cu');
  const eCx1g = smdToB(gnd, cx1b, -55, 0, 14);
  const eCx2g = smdToB(gnd, cx2b, -55, 0, 14);
  add(gnd, eCx1g, { x: gndLeftX, y: eCx1g.y }, 16, 'B.Cu');
  add(gnd, eCx2g, { x: gndLeftX, y: eCx2g.y }, 16, 'B.Cu');
  add(gnd, { x: gndLeftX, y: Math.min(eCx1g.y, eCx2g.y) },
    { x: gndLeftX, y: gndJoinY }, 16, 'B.Cu');
  add(gnd, uGnd, { x: gndLeftX, y: uGnd.y }, 16, 'B.Cu');
  add(gnd, { x: gndLeftX, y: uGnd.y }, { x: gndLeftX, y: gndJoinY }, 16, 'B.Cu');

  // —— 复位：NRST 先向上逃逸，避免与 R1 的 VCC 同行对穿 ——
  add(nrst, r1b, uRst, 12, 'F.Cu');
  const eR1v = smdToB(vcc, r1a, -50, 0, 14);
  add(vcc, eR1v, { x: ledVccX, y: eR1v.y }, 16, 'B.Cu');

  // —— 右侧退耦：VCC 上逃 / GND 下逃 ——
  const eC3v = smdToB(vcc, c3a, 0, -55, 14);
  const eC3g = smdToB(gnd, c3b, 0, 55, 14);
  add(vcc, eC3v, { x: vccRailX, y: eC3v.y }, 16, 'B.Cu');
  add(vcc, { x: vccRailX, y: eC3v.y }, { x: vccRailX, y: uVcc.y }, 16, 'B.Cu');
  const eUvcc = { x: Math.max(uVcc.x + 40, gndRightX + 50), y: uVcc.y };
  add(vcc, uVcc, eUvcc, 16, 'F.Cu');
  addVia(vcc, eUvcc);
  add(vcc, eUvcc, { x: vccRailX, y: uVcc.y }, 16, 'B.Cu');
  add(vcc, uVcc, { x: uVcc.x + 55, y: uVcc.y }, 16, 'F.Cu');
  add(vcc, { x: uVcc.x + 55, y: uVcc.y }, { x: uEa.x + 55, y: uEa.y }, 16, 'F.Cu');
  add(vcc, { x: uEa.x + 55, y: uEa.y }, uEa, 16, 'F.Cu');
  add(gnd, eC3g, { x: gndRightX, y: eC3g.y }, 16, 'B.Cu');
  add(gnd, { x: gndRightX, y: eC3g.y }, { x: gndRightX, y: gndJoinY }, 16, 'B.Cu');

  // —— 电源 LED ——
  const eRpv = smdToB(vcc, rpA, 0, -55, 14);
  add(vcc, eRpv, { x: vccRailX, y: eRpv.y }, 16, 'B.Cu');
  add(vcc, { x: vccRailX, y: eRpv.y }, { x: vccRailX, y: uVcc.y }, 16, 'B.Cu');
  add(pwrLed, rpB, d9a, 12, 'F.Cu');
  // D9 在 VCC 轨右侧：GND 先竖下到接合线，再沿接合线接 gndRight（不横穿 VCC 轨）
  const eD9g = smdToB(gnd, d9k, 0, 60, 14);
  add(gnd, eD9g, { x: eD9g.x, y: gndJoinY }, 16, 'B.Cu');
  add(gnd, { x: eD9g.x, y: gndJoinY }, { x: gndRightX, y: gndJoinY }, 16, 'B.Cu');

  add(gnd, { x: gndLeftX, y: gndJoinY }, { x: gndRightX, y: gndJoinY }, 16, 'B.Cu');

  // —— 8 路 LED ——
  for (let i = 0; i < 8; i++) {
    const rlA = pw(`RL${i + 1}`, 1);
    const rlB = pw(`RL${i + 1}`, 2);
    const dA = pw(`D${i + 1}`, 1);
    const dK = pw(`D${i + 1}`, 2);
    const uP = pw('U1', i + 1);
    const netA = netByName(`L${i}_A`);
    const netK = netByName(`L${i}_K`);
    const eRl = smdToB(vcc, rlA, -50, 0, 14);
    add(vcc, eRl, { x: ledVccX, y: eRl.y }, 16, 'B.Cu');
    if (i === 0) {
      add(vcc, { x: ledVccX, y: pinY(1) }, { x: ledVccX, y: pinY(8) }, 16, 'B.Cu');
      const topY = pinY(1) - 120;
      add(vcc, { x: ledVccX, y: pinY(1) }, { x: ledVccX, y: topY }, 16, 'B.Cu');
      add(vcc, { x: ledVccX, y: topY }, { x: vccRailX, y: topY }, 16, 'B.Cu');
      add(vcc, { x: vccRailX, y: topY }, { x: vccRailX, y: uVcc.y }, 16, 'B.Cu');
    }
    add(netA, rlB, dA, 12, 'F.Cu');
    add(netK, dK, uP, 12, 'F.Cu');
  }
  add(vcc, { x: ledVccX, y: eR1v.y }, { x: ledVccX, y: pinY(8) }, 16, 'B.Cu');

  // —— 排针 ——
  const gndHdrEsc = { x: vccRailX + 50, y: gndJoinY };
  add(gnd, { x: gndRightX, y: gndJoinY }, gndHdrEsc, 16, 'B.Cu');
  toHeaderRight(gnd, gndHdrEsc, jGnd, 16);
  toHeaderRight(vcc, { x: vccRailX, y: uVcc.y }, jVcc, 16);
  const eRst = smdToB(nrst, uRst, 0, -80, 12);
  toHeaderLeft(nrst, eRst, jRst, 12);
  const ePwr = smdToB(pwrLed, d9a, 70, 0, 12);
  toHeaderRight(pwrLed, ePwr, jPwr, 12);

  const ledNets = [];
  for (let i = 0; i < 8; i++) {
    ledNets.push(netByName(`L${i}_A`), netByName(`L${i}_K`));
  }
  return {
    trackCount: doc.tracks.length,
    netCount: [vcc, gnd, xtal1, xtal2, nrst, pwrLed, ...ledNets].filter(Boolean).length,
    viaCount: doc.vias.length
  };
}


function main() {
  const srcDir = join(ROOT, 'Test_Template');
  const files = readdirSync(srcDir).filter(f => f.endsWith('.schsim') && f.startsWith('lab_'));
  console.log(`PCB template export: ${files.length} schematics`);

  for (const dir of OUT_DIRS) mkdirSync(dir, { recursive: true });

  for (const file of files) {
    const id = file.replace(/\.schsim$/, '');
    const sch = JSON.parse(readFileSync(join(srcDir, file), 'utf8'));
    const { doc, placed, skipped } = annotateFromSchsim(sch);
    const copperCount = resolveLabCopperCount(id, sch, doc);
    applyCopperCount(doc, copperCount);
    let route;
    if (id === 'lab_power') {
      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
      doc.tracks = [];
      doc.vias = [];
      doc.zones = [];
      route = handLayoutLabPower(doc);
    } else if (id === 'lab_amp') {
      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
      doc.tracks = [];
      doc.vias = [];
      doc.zones = [];
      route = handLayoutLabAmp(doc);
    } else if (id === 'lab_filter') {
      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
      doc.tracks = [];
      doc.vias = [];
      doc.zones = [];
      route = handLayoutLabFilter(doc);
    } else if (id === 'lab_51_led') {
      doc.footprints = doc.footprints.filter(f => !!f.schematicCompId);
      doc.tracks = [];
      doc.vias = [];
      doc.zones = [];
      route = handLayoutLab51Led(doc);
    } else {
      route = autoRoute(doc);
    }
    applyLabBoardSize(doc, sch);
    const gndNet = doc.nets.find(n => isGndNet(n.name));
    if (id === 'lab_power' || id === 'lab_amp' || id === 'lab_filter' || id === 'lab_51_led') {
      addCornerMountHoles(doc, gndNet);
    }
    const zones = pourPlanes(doc);
    const stitch = stitchGndToPour(doc);
    assignNetClasses(doc);
    doc.metadata.modifiedAt = new Date().toISOString();
    const bw = Math.max(...doc.boardOutline.points.map(p => p.x));
    const bh = Math.max(...doc.boardOutline.points.map(p => p.y));
    doc.metadata.description =
      `PCB lab template for ${id} (${copperCount}-layer, ${bw}x${bh} mil)`;
    const out = buildPcbsim(sch, doc);
    const json = JSON.stringify(out);
    for (const dir of OUT_DIRS) {
      writeFileSync(join(dir, `${id}.pcbsim`), json, 'utf8');
    }
    const handTag = (id === 'lab_power' || id === 'lab_amp' || id === 'lab_filter' || id === 'lab_51_led') ? ' [hand]' : '';
    console.log(
      `  ${id}: Cu=${copperCount} board=${bw}x${bh} placed=${placed} skipped=${skipped} ` +
      `tracks=${route.trackCount + stitch.tracks} vias=${route.viaCount + stitch.vias} ` +
      `nets=${route.netCount} zones=${zones} gndStitch=${stitch.vias}` +
      handTag
    );
  }

  for (const dir of OUT_DIRS) updateManifest(dir);
  console.log('Done.');
}

main();
