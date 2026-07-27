/**
 * 具名封装脚 — MCU / 存储 / LCD / 传感器 / 部分 IC
 * pin.id = pin.name = 真实功能名；number = 封装脚号（教学用）
 */
import { Pin, PinType, Point2D } from 'common';
import { makePin, makePoint } from '../internal/ComponentLibHelpers';

export interface NamedPinDef {
  id: string;
  type: PinType;
}

/** 左右交错排布：与 genPins/genMcuPins 几何一致，便于 hit/offset */
export function layoutNamedPins(defs: NamedPinDef[], bodyX: number = 50): Pin[] {
  const pins: Pin[] = [];
  const leftCount = Math.ceil(defs.length / 2);
  const rightCount = Math.floor(defs.length / 2);
  const spacing = 10;
  const bodyHalf = Math.max(leftCount, rightCount) * spacing / 2;
  for (let i = 0; i < leftCount; i++) {
    const d = defs[i];
    pins.push(makePin(d.id, d.id, `${i + 1}`, d.type, -bodyX, i * spacing - bodyHalf));
  }
  for (let i = 0; i < rightCount; i++) {
    const d = defs[leftCount + i];
    const num = leftCount + i + 1;
    pins.push(makePin(d.id, d.id, `${num}`, d.type, bodyX, i * spacing - bodyHalf));
  }
  return pins;
}

export function pinOffsetFromLayout(defs: NamedPinDef[], pinId: string, bodyX: number = 50): Point2D {
  const leftCount = Math.ceil(defs.length / 2);
  const spacing = 10;
  const bodyHalf = Math.max(leftCount, Math.floor(defs.length / 2)) * spacing / 2;
  for (let i = 0; i < defs.length; i++) {
    if (defs[i].id !== pinId) {
      continue;
    }
    if (i < leftCount) {
      return makePoint(-bodyX, i * spacing - bodyHalf);
    }
    const rightIdx = i - leftCount;
    return makePoint(bodyX, rightIdx * spacing - bodyHalf);
  }
  return makePoint(0, 0);
}

function io(id: string): NamedPinDef {
  const d: NamedPinDef = { id: id, type: PinType.BIDIRECTIONAL };
  return d;
}
function inp(id: string): NamedPinDef {
  const d: NamedPinDef = { id: id, type: PinType.INPUT };
  return d;
}
function out(id: string): NamedPinDef {
  const d: NamedPinDef = { id: id, type: PinType.OUTPUT };
  return d;
}
function pwr(id: string): NamedPinDef {
  const d: NamedPinDef = { id: id, type: PinType.POWER };
  return d;
}
function gnd(id: string): NamedPinDef {
  const d: NamedPinDef = { id: id, type: PinType.GROUND };
  return d;
}

/** AT89/STC DIP-40 教学脚（与物理脚序一致） */
export function defs8051Dip40(): NamedPinDef[] {
  const d: NamedPinDef[] = [];
  for (let i = 0; i < 8; i++) {
    d.push(io(`P1.${i}`));
  }
  d.push(inp('RST'));
  for (let i = 0; i < 8; i++) {
    d.push(io(`P3.${i}`));
  }
  d.push(io('XTAL2'));
  d.push(io('XTAL1'));
  d.push(gnd('GND'));
  for (let i = 0; i < 8; i++) {
    d.push(io(`P2.${i}`));
  }
  d.push(out('PSEN'));
  d.push(io('ALE'));
  d.push(inp('EA'));
  for (let i = 7; i >= 0; i--) {
    d.push(io(`P0.${i}`));
  }
  d.push(pwr('VCC'));
  return d;
}

export function pins8051Dip40(): Pin[] {
  return layoutNamedPins(defs8051Dip40(), 50);
}

/**
 * STM32F103 类 48 脚教学符号：电源/时钟/复位 + GPIOA/B + PC0-7
 * 仿真已认 PA0 / PAx 形式
 */
export function defsStm32Teaching48(): NamedPinDef[] {
  const d: NamedPinDef[] = [
    pwr('VDD'), gnd('VSS'), pwr('VDDA'), gnd('VSSA'), inp('BOOT0'), inp('NRST'),
    io('OSC_IN'), io('OSC_OUT')
  ];
  for (let i = 0; i < 16; i++) {
    d.push(io(`PA${i}`));
  }
  for (let i = 0; i < 16; i++) {
    d.push(io(`PB${i}`));
  }
  for (let i = 0; i < 8; i++) {
    d.push(io(`PC${i}`));
  }
  return d;
}

export function pinsStm32Teaching48(): Pin[] {
  return layoutNamedPins(defsStm32Teaching48(), 50);
}

/** STM32F407 等大封装：在 48 脚基础上扩 PD/PE */
export function defsStm32Teaching100(): NamedPinDef[] {
  const d = defsStm32Teaching48().slice();
  for (let i = 0; i < 16; i++) {
    d.push(io(`PD${i}`));
  }
  for (let i = 0; i < 16; i++) {
    d.push(io(`PE${i}`));
  }
  for (let i = 8; i < 16; i++) {
    d.push(io(`PC${i}`));
  }
  // 48+16+16+8 = 88；再补 PF0-PF11 → 100
  for (let i = 0; i < 12; i++) {
    d.push(io(`PF${i}`));
  }
  return d;
}

export function pinsStm32Teaching100(): Pin[] {
  return layoutNamedPins(defsStm32Teaching100(), 50);
}

/** STM32F030 小封装教学脚 */
export function defsStm32Teaching32(): NamedPinDef[] {
  const d: NamedPinDef[] = [
    pwr('VDD'), gnd('VSS'), inp('NRST'), inp('BOOT0'),
    io('OSC_IN'), io('OSC_OUT')
  ];
  for (let i = 0; i < 16; i++) {
    d.push(io(`PA${i}`));
  }
  for (let i = 0; i < 10; i++) {
    d.push(io(`PB${i}`));
  }
  return d;
}

export function pinsStm32Teaching32(): Pin[] {
  return layoutNamedPins(defsStm32Teaching32(), 50);
}

/** HD44780 LCD1602 16 脚 */
export function defsLcd1602(): NamedPinDef[] {
  return [
    gnd('VSS'), pwr('VDD'), inp('V0'),
    inp('RS'), inp('RW'), inp('E'),
    io('D0'), io('D1'), io('D2'), io('D3'),
    io('D4'), io('D5'), io('D6'), io('D7'),
    pwr('A'), gnd('K')
  ];
}

export function pinsLcd1602(): Pin[] {
  return layoutNamedPins(defsLcd1602(), 40);
}

/** 24C02 I2C EEPROM DIP-8 */
export function defs24C02(): NamedPinDef[] {
  return [
    inp('A0'), inp('A1'), inp('A2'), gnd('VSS'),
    io('SDA'), inp('SCL'), inp('WP'), pwr('VCC')
  ];
}

export function pins24C02(): Pin[] {
  return layoutNamedPins(defs24C02(), 40);
}

/** W25Q64 SPI Flash SOIC-8 */
export function defsW25Q64(): NamedPinDef[] {
  return [
    inp('CS'), out('DO'), inp('WP'), gnd('GND'),
    inp('DI'), inp('CLK'), inp('HOLD'), pwr('VCC')
  ];
}

export function pinsW25Q64(): Pin[] {
  return layoutNamedPins(defsW25Q64(), 40);
}

/** 2764 EPROM DIP-28 教学脚（地址/数据/控制具名） */
export function defs2764(): NamedPinDef[] {
  const d: NamedPinDef[] = [pwr('VPP')];
  for (let i = 0; i < 8; i++) {
    d.push(io(`A${i}`));
  }
  for (let i = 0; i < 8; i++) {
    d.push(io(`D${i}`));
  }
  d.push(gnd('GND'));
  d.push(inp('CE'));
  d.push(inp('OE'));
  for (let i = 8; i < 13; i++) {
    d.push(io(`A${i}`));
  }
  d.push(pwr('VCC'));
  // pad to 28 for layout stability
  while (d.length < 28) {
    d.push(io(`NC${d.length}`));
  }
  return d.slice(0, 28);
}

export function pins2764(): Pin[] {
  return layoutNamedPins(defs2764(), 40);
}

/** 62256 SRAM DIP-28 */
export function defs62256(): NamedPinDef[] {
  const d: NamedPinDef[] = [io('A14')];
  for (let i = 0; i < 8; i++) {
    d.push(io(`A${i}`));
  }
  for (let i = 0; i < 8; i++) {
    d.push(io(`D${i}`));
  }
  d.push(gnd('GND'));
  d.push(inp('CE'));
  d.push(inp('OE'));
  for (let i = 8; i < 14; i++) {
    d.push(io(`A${i}`));
  }
  d.push(inp('WE'));
  d.push(pwr('VCC'));
  while (d.length < 28) {
    d.push(io(`NC${d.length}`));
  }
  return d.slice(0, 28);
}

export function pins62256(): Pin[] {
  return layoutNamedPins(defs62256(), 40);
}

/** DS18B20 三端 */
export function defsDs18b20(): NamedPinDef[] {
  return [gnd('GND'), io('DQ'), pwr('VDD')];
}

export function pinsDs18b20(): Pin[] {
  // 左 GND / 中 DQ / 右 VDD — 专用几何
  return [
    makePin('GND', 'GND', '1', PinType.GROUND, -30, 0),
    makePin('DQ', 'DQ', '2', PinType.BIDIRECTIONAL, 0, 28),
    makePin('VDD', 'VDD', '3', PinType.POWER, 30, 0)
  ];
}

/** 霍尔开关三端 */
export function defsHallSensor(): NamedPinDef[] {
  return [pwr('VCC'), out('OUT'), gnd('GND')];
}

export function pinsHallSensor(): Pin[] {
  return [
    makePin('VCC', 'VCC', '1', PinType.POWER, -30, -20),
    makePin('OUT', 'OUT', '2', PinType.OUTPUT, 30, 0),
    makePin('GND', 'GND', '3', PinType.GROUND, -30, 20)
  ];
}

/** CD4017 十进制计数 */
export function defsCd4017(): NamedPinDef[] {
  return [
    out('Q5'), out('Q1'), out('Q0'), out('Q2'), out('Q6'), out('Q7'), out('Q3'), gnd('VSS'),
    out('Q8'), out('Q4'), out('Q9'), out('CO'), inp('CLK'), inp('EN'), inp('RST'), pwr('VDD')
  ];
}

export function pinsCd4017(): Pin[] {
  return layoutNamedPins(defsCd4017(), 40);
}

/** LM2596 五端教学脚（几何与 TemplateSchematicKit / kit.mjs 对齐） */
export function defsLm2596(): NamedPinDef[] {
  return [pwr('VIN'), out('OUT'), gnd('GND'), inp('FB'), inp('ON')];
}

export function pinsLm2596(): Pin[] {
  return [
    makePin('VIN', 'VIN', '1', PinType.POWER, -40, -20),
    makePin('OUT', 'OUT', '2', PinType.OUTPUT, 40, -20),
    makePin('GND', 'GND', '3', PinType.GROUND, 0, 40),
    makePin('FB', 'FB', '4', PinType.INPUT, 40, 10),
    makePin('ON', 'ON', '5', PinType.INPUT, -40, 10)
  ];
}
