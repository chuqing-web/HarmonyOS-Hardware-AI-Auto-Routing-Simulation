/**
 * Re-audit pin fidelity after NamedDevicePins rollout
 */
import fs from 'fs';

function extractPinsBlock(src, id) {
  // For devices using helper pinsXxx() we hardcode expected
  return null;
}

const EXPECTED = {
  DS18B20: ['GND', 'DQ', 'VDD'],
  HALL_SENSOR: ['VCC', 'OUT', 'GND'],
  LCD1602: ['VSS', 'VDD', 'V0', 'RS', 'RW', 'E', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'A', 'K'],
  '24C02': ['A0', 'A1', 'A2', 'VSS', 'SDA', 'SCL', 'WP', 'VCC'],
  W25Q64: ['CS', 'DO', 'WP', 'GND', 'DI', 'CLK', 'HOLD', 'VCC'],
  LM555: ['GND', 'TRIG', 'OUT', 'RESET', 'CTRL', 'THRES', 'DISCH', 'VCC'],
  LM358: ['OUT1', 'IN-1', 'IN+1', 'V-', 'IN+2', 'IN-2', 'OUT2', 'V+'],
  AT89C51_sample: ['P1.0', 'RST', 'XTAL1', 'XTAL2', 'EA', 'VCC', 'GND'],
  STM32F103C8_sample: ['VDD', 'VSS', 'NRST', 'OSC_IN', 'OSC_OUT', 'PA0', 'PA9', 'PA10'],
  CD4017: ['CLK', 'RST', 'Q0', 'VDD', 'VSS'],
  LM2596: ['VIN', 'OUT', 'GND', 'FB', 'ON']
};

const builtin = fs.readFileSync('c:/Projects/ElecDraw_Harmony/features/component_library/src/main/ets/data/BuiltinComponents.ets', 'utf8');
const named = fs.readFileSync('c:/Projects/ElecDraw_Harmony/features/component_library/src/main/ets/data/NamedDevicePins.ets', 'utf8');
const builders = fs.readFileSync('c:/Projects/ElecDraw_Harmony/features/ai_engine/src/main/ets/algorithms/LabTemplateBuilders.ets', 'utf8');
const manual = fs.readFileSync('c:/Projects/ElecDraw_Harmony/features/ai_engine/src/main/ets/algorithms/DeviceUsageManual.ets', 'utf8');

const checks = [];
function ok(name, cond, detail) {
  checks.push({ name, pass: !!cond, detail: detail || '' });
}

ok('builtin imports NamedDevicePins', builtin.includes('NamedDevicePins'));
ok('sensors use pinsDs18b20', builtin.includes('pinsDs18b20()'));
ok('8051 uses pins8051Dip40', builtin.includes('pins8051Dip40()'));
ok('STM32 uses teaching pins', builtin.includes('pinsStm32Teaching48()'));
ok('LCD uses pinsLcd1602', builtin.includes('pinsLcd1602()'));
ok('builders use OSC_IN', builders.includes("'OSC_IN'"));
ok('builders use NRST', builders.includes("'NRST'"));
ok('builders use P1.${i}', builders.includes('P1.${i}') || builders.includes('`P1.${i}`'));
ok('builders use DQ', builders.includes("'DQ'"));
ok('builders avoid old P48', !builders.includes("'P48'"));
ok('manual DS18B20 GND/DQ/VDD', manual.includes("entry('DS18B20'") && manual.includes("'GND/DQ/VDD'"));
ok('manual LOGIC CH1', manual.includes('CH1..CH8'));
ok('named defs8051 has P1.0', named.includes('P1.${i}') || named.includes("'P1.0'"));
ok('named defs stm32 has PA0', named.includes("'PA0'") || named.includes('`PA${i}`'));

const failed = checks.filter(c => !c.pass);
console.log(JSON.stringify({ total: checks.length, failed: failed.length, checks }, null, 2));
process.exit(failed.length > 0 ? 1 : 0);
