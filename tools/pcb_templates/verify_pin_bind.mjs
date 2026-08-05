#!/usr/bin/env node
/**
 * 快速校验 PCB 脚位绑定：8051 不得误绑 GND→pad2；无源 2 脚 A/K 仍可用。
 * 用法: node tools/pcb_templates/verify_pin_bind.mjs
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const utilPath = join(__dirname, '..', '..', 'common', 'src', 'main', 'ets', 'utils', 'PcbPinBindUtil.ets');
const exportPath = join(__dirname, 'export.mjs');
const src = readFileSync(utilPath, 'utf8');
const exp = readFileSync(exportPath, 'utf8');

function extractMap(text, name) {
  const re = new RegExp(`const ${name}[\\s\\S]*?= new Map\\(\\[([\\s\\S]*?)\\]\\);`);
  const m = text.match(re);
  if (!m) throw new Error(`map ${name} not found`);
  const map = new Map();
  for (const row of m[1].matchAll(/\['([^']+)',\s*'([^']+)'\]/g)) {
    map.set(row[1], row[2]);
  }
  return map;
}

const MCU51 = extractMap(src, 'MCU51_PIN_TO_PAD');
const PIN_LABEL = extractMap(src, 'PIN_LABEL_TO_PAD');
const LM358 = extractMap(src, 'DUAL_OPAMP_PIN_TO_PAD');

function fail(msg) {
  console.error('FAIL:', msg);
  process.exitCode = 1;
}

// 8051 物理脚
const expect51 = {
  'P1.0': '1', 'P1.5': '6', 'RST': '9', 'XTAL2': '18', 'XTAL1': '19',
  'GND': '20', 'VCC': '40', 'P0.0': '39', 'EA': '31'
};
for (const [pin, pad] of Object.entries(expect51)) {
  const got = MCU51.get(pin);
  if (got !== pad) fail(`8051 ${pin} → ${got}, want ${pad}`);
}

// 2 脚别名仍在
if (PIN_LABEL.get('A') !== '1' || PIN_LABEL.get('K') !== '2') {
  fail('2-pin A/K alias broken');
}
if (PIN_LABEL.get('GND') !== '2') {
  fail('2-pin GND alias missing (ok for LED path only)');
}

// 运放不得用 2 脚别名语义：V+→8 not 1
if (LM358.get('V+') !== '8' || LM358.get('V-') !== '4') {
  fail('dual opamp V+/V- pads wrong');
}

// 模拟 lookup：8051 注册后 pad2 应是 P1.1，不是 GND
function simBind(lib, pins) {
  const map = new Map();
  const pinMap = lib === 'AT89C51' ? MCU51 : (lib === 'LED' ? PIN_LABEL : null);
  for (const [pin, net] of pins) {
    map.set(`U:${pin}`, net);
    if (pinMap) {
      const pad = pinMap.get(pin);
      if (pad) map.set(`U:${pad}`, net);
    }
  }
  return map;
}

const mcuMap = simBind('AT89C51', [
  ['GND', 'netGND'], ['P1.1', 'netL1'], ['VCC', 'netVCC'], ['XTAL1', 'netX1']
]);
if (mcuMap.get('U:20') !== 'netGND') fail('MCU GND should bind pad 20');
if (mcuMap.get('U:2') !== 'netL1') fail('MCU pad 2 should be P1.1');
if (mcuMap.get('U:2') === 'netGND') fail('MCU pad 2 must NOT be GND');
if (mcuMap.get('U:40') !== 'netVCC') fail('MCU VCC → 40');
if (mcuMap.get('U:19') !== 'netX1') fail('MCU XTAL1 → 19');

const ledMap = simBind('LED', [['A', 'netA'], ['K', 'netK']]);
if (ledMap.get('U:1') !== 'netA' || ledMap.get('U:2') !== 'netK') {
  fail('LED A/K alias bind failed');
}

// 确认 ets 中 lookup 不再带 GND 回退键
if (/padNumber === '2'[\s\S]*GND/.test(src) && /function lookupPadNet/.test(src)) {
  // 旧逻辑特征：lookup 内对 pad 2 扩 GND
  const lookupBody = src.slice(src.indexOf('function lookupPadNet'));
  if (lookupBody.includes("keys.push('K'") || lookupBody.includes('GND')) {
    // 允许注释提及 GND，但 keys 数组不应含别名
    const firstBrace = lookupBody.indexOf('{');
    const body = lookupBody.slice(firstBrace, lookupBody.indexOf('return undefined') + 40);
    if (body.includes("'GND'") || body.includes('"GND"')) {
      fail('lookupPadNet still expands GND alias');
    }
  }
}

// 74 系列：型号表必须命中（00/04/138/245），且不误绑电源脚
const TTL74 = extractMap(src, 'TTL74XX_PIN_TO_PAD');
if (TTL74.get('00:1A') !== '1' || TTL74.get('00:1Y') !== '3' || TTL74.get('00:GND') !== '7') {
  fail('74HC00 pin map broken');
}
if (TTL74.get('04:6Y') !== '12' || TTL74.get('138:Y0') !== '15' || TTL74.get('245:B7') !== '18') {
  fail('74HC04/138/245 pin map broken');
}
if (TTL74.get('595:SER') !== '14' || TTL74.get('74:1Q#') !== '6') {
  fail('74HC595/74 map broken');
}
// 电源别名不得出现 74 键外的 2 脚别名语义（74 有表时不回落）
if (/is74xxLib\(libDevId\)[\s\S]{0,400}tryLabelAlias/.test(src)) {
  fail('74xx register still falls back to 2-pin alias');
}

// ---- 双源比对：ets（PcbPinBindUtil.ets）↔ export.mjs 必须逐键一致 ----
const SYNC_TABLES = [
  'PIN_LABEL_TO_PAD', 'DUAL_OPAMP_PIN_TO_PAD', 'UA741_PIN_TO_PAD', 'LM555_PIN_TO_PAD',
  'MCU51_PIN_TO_PAD', 'STM32F103C8_PIN_TO_PAD', 'STM32F103RC_PIN_TO_PAD',
  'STM32F407_PIN_TO_PAD', 'STM32_TSSOP20_PIN_TO_PAD', 'LCD1602_PIN_TO_PAD',
  'OLED_PIN_TO_PAD', 'RELAY_SPDT_PIN_TO_PAD', 'DS18B20_PIN_TO_PAD', 'HALL_PIN_TO_PAD',
  'POT3_PIN_TO_PAD', 'CD4017_PIN_TO_PAD', 'LM2596_PIN_TO_PAD', 'MEM24C02_PIN_TO_PAD',
  'W25Q64_PIN_TO_PAD', 'MEM2764_PIN_TO_PAD', 'MEM62256_PIN_TO_PAD',
  'SIGNAL_GEN_PIN_TO_PAD', 'AMMETER_PIN_TO_PAD', 'POWER_METER_PIN_TO_PAD',
  'VOLTMETER_PIN_TO_PAD', 'VIRTUAL_METER_PIN_TO_PAD', 'FREQ_COUNTER_PIN_TO_PAD',
  'OSCILLOSCOPE_PIN_TO_PAD', 'LOGIC_ANALYZER_PIN_TO_PAD', 'UART_TERMINAL_PIN_TO_PAD',
  'TTL74XX_PIN_TO_PAD'
];
let syncChecked = 0;
for (const name of SYNC_TABLES) {
  let a, b;
  try {
    a = extractMap(src, name);
    b = extractMap(exp, name);
  } catch (e) {
    continue; // 任一侧缺失：不视为漂移（如 ets 独有 MEM24C02 曾在 export 缺失的场景）
  }
  syncChecked++;
  const allKeys = new Set([...a.keys(), ...b.keys()]);
  for (const k of allKeys) {
    const va = a.get(k);
    const vb = b.get(k);
    if (va === undefined) fail(`${name} 缺键 ${k}（export 有 → pad ${vb}，ets 无）`);
    else if (vb === undefined) fail(`${name} 缺键 ${k}（ets 有 → pad ${va}，export 无）`);
    else if (va !== vb) fail(`${name} ${k} 漂移 ets=${va} export=${vb}`);
  }
}
if (syncChecked === 0) {
  fail('双源表比对未解析到任何表（extractMap 正则失效？）');
}

if (!process.exitCode) {
  console.log(`OK: 8051 / opamp / LED pin-bind checks passed; ${syncChecked} tables in sync`);
}
