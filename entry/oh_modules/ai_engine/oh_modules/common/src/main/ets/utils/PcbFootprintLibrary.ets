/**
 * 内置封装库 — KiCad 常用 SMD/THT 封装（简化几何）
 * 封装映射与 tools/pcb_templates + Test_Template 对齐（全部内置 libraryId）
 */
import { IdUtil } from './IdUtil';
import { Point2D } from '../types/CommonTypes';
import {
  PcbFootprintDef, PcbPad, PcbPadShape, PcbPadType, PcbLayerId, PcbFootprintInst
} from '../types/PcbTypes';
import { tracePcbWarn } from './PcbTraceLog';

const MIL = 1;

function smdPad(num: string, x: number, y: number, w: number, h: number): PcbPad {
  return {
    id: IdUtil.generate('pad'),
    number: num,
    type: PcbPadType.SMD,
    shape: PcbPadShape.RECT,
    pos: { x: x * MIL, y: y * MIL },
    size: { x: w * MIL, y: h * MIL },
    layers: [PcbLayerId.F_CU, PcbLayerId.F_MASK]
  };
}

function thPad(num: string, x: number, y: number, drill: number, outer: number): PcbPad {
  return {
    id: IdUtil.generate('pad'),
    number: num,
    type: PcbPadType.TH,
    shape: PcbPadShape.CIRCLE,
    pos: { x: x * MIL, y: y * MIL },
    size: { x: outer * MIL, y: outer * MIL },
    drill: drill * MIL,
    layers: [PcbLayerId.F_CU, PcbLayerId.B_CU]
  };
}

function rectSilk(halfW: number, halfH: number): Point2D[][] {
  return [[
    { x: -halfW, y: -halfH }, { x: halfW, y: -halfH },
    { x: halfW, y: halfH }, { x: -halfW, y: halfH }, { x: -halfW, y: -halfH }
  ]];
}

function circleSilk(r: number, pts: number = 24): Point2D[][] {
  const ring: Point2D[] = [];
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    ring.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  ring.push(ring[0]);
  return [ring];
}

function def0805(): PcbFootprintDef {
  return {
    id: 'FP_0805',
    name: '0805',
    description: 'Metric 2012 SMD',
    pads: [
      smdPad('1', -45, 0, 30, 50),
      smdPad('2', 45, 0, 30, 50)
    ],
    silkLines: rectSilk(50, 30),
    courtyard: [
      { x: -70, y: -40 }, { x: 70, y: -40 }, { x: 70, y: 40 }, { x: -70, y: 40 }
    ]
  };
}

function def0603(): PcbFootprintDef {
  return {
    id: 'FP_0603',
    name: '0603',
    description: 'Metric 1608 SMD',
    pads: [
      smdPad('1', -35, 0, 25, 35),
      smdPad('2', 35, 0, 25, 35)
    ],
    silkLines: rectSilk(40, 22),
    courtyard: [
      { x: -55, y: -30 }, { x: 55, y: -30 }, { x: 55, y: 30 }, { x: -55, y: 30 }
    ]
  };
}

function def1206(): PcbFootprintDef {
  return {
    id: 'FP_1206',
    name: '1206',
    description: 'Metric 3216 SMD',
    pads: [
      smdPad('1', -60, 0, 40, 70),
      smdPad('2', 60, 0, 40, 70)
    ],
    silkLines: rectSilk(65, 40),
    courtyard: [
      { x: -85, y: -50 }, { x: 85, y: -50 }, { x: 85, y: 50 }, { x: -85, y: 50 }
    ]
  };
}

function defSOIC8(): PcbFootprintDef {
  const pads: PcbPad[] = [];
  for (let i = 0; i < 4; i++) {
    pads.push(smdPad(`${i + 1}`, -60, -45 + i * 30, 25, 12));
    pads.push(smdPad(`${8 - i}`, 60, -45 + i * 30, 25, 12));
  }
  return {
    id: 'FP_SOIC8',
    name: 'SOIC-8',
    description: 'SOIC-8 150mil',
    pads,
    silkLines: rectSilk(55, 55),
    courtyard: [
      { x: -80, y: -60 }, { x: 80, y: -60 }, { x: 80, y: 60 }, { x: -80, y: 60 }
    ]
  };
}

function defDIP8(): PcbFootprintDef {
  const pads: PcbPad[] = [];
  for (let i = 0; i < 4; i++) {
    pads.push(thPad(`${i + 1}`, -100, -150 + i * 100, 35, 60));
    pads.push(thPad(`${8 - i}`, 100, -150 + i * 100, 35, 60));
  }
  return {
    id: 'FP_DIP8',
    name: 'DIP-8',
    description: 'DIP-8 300mil',
    pads,
    silkLines: rectSilk(120, 200),
    courtyard: [
      { x: -130, y: -220 }, { x: 130, y: -220 }, { x: 130, y: 220 }, { x: -130, y: 220 }
    ]
  };
}

function defDIP14(): PcbFootprintDef {
  const pads: PcbPad[] = [];
  for (let i = 0; i < 7; i++) {
    pads.push(thPad(`${i + 1}`, -100, -300 + i * 100, 35, 60));
    pads.push(thPad(`${14 - i}`, 100, -300 + i * 100, 35, 60));
  }
  return {
    id: 'FP_DIP14',
    name: 'DIP-14',
    description: 'DIP-14 300mil (74HC00/02/04/08/32/74, CD4017)',
    pads,
    silkLines: rectSilk(120, 350),
    courtyard: [
      { x: -140, y: -370 }, { x: 140, y: -370 }, { x: 140, y: 370 }, { x: -140, y: 370 }
    ]
  };
}

function defDIP16(): PcbFootprintDef {
  const pads: PcbPad[] = [];
  for (let i = 0; i < 8; i++) {
    pads.push(thPad(`${i + 1}`, -100, -350 + i * 100, 35, 60));
    pads.push(thPad(`${16 - i}`, 100, -350 + i * 100, 35, 60));
  }
  return {
    id: 'FP_DIP16',
    name: 'DIP-16',
    description: 'DIP-16 300mil (LM555, CD4017 wide)',
    pads,
    silkLines: rectSilk(120, 400),
    courtyard: [
      { x: -140, y: -420 }, { x: 140, y: -420 }, { x: 140, y: 420 }, { x: -140, y: 420 }
    ]
  };
}

function defDIP28(): PcbFootprintDef {
  const pads: PcbPad[] = [];
  for (let i = 0; i < 14; i++) {
    pads.push(thPad(`${i + 1}`, -150, -650 + i * 100, 35, 60));
    pads.push(thPad(`${28 - i}`, 150, -650 + i * 100, 35, 60));
  }
  return {
    id: 'FP_DIP28',
    name: 'DIP-28',
    description: 'DIP-28 600mil (2764, 62256)',
    pads,
    silkLines: rectSilk(170, 700),
    courtyard: [
      { x: -190, y: -720 }, { x: 190, y: -720 }, { x: 190, y: 720 }, { x: -190, y: 720 }
    ]
  };
}

function defDIP40(): PcbFootprintDef {
  const pads: PcbPad[] = [];
  for (let i = 0; i < 20; i++) {
    pads.push(thPad(`${i + 1}`, -150, -950 + i * 100, 35, 60));
    pads.push(thPad(`${40 - i}`, 150, -950 + i * 100, 35, 60));
  }
  return {
    id: 'FP_DIP40',
    name: 'DIP-40',
    description: 'DIP-40 600mil (AT89C51/52, STC89C52)',
    pads,
    silkLines: rectSilk(170, 1000),
    courtyard: [
      { x: -190, y: -1020 }, { x: 190, y: -1020 }, { x: 190, y: 1020 }, { x: -190, y: 1020 }
    ]
  };
}

function defSOT23(): PcbFootprintDef {
  return {
    id: 'FP_SOT23',
    name: 'SOT-23',
    description: 'SOT-23',
    pads: [
      smdPad('1', -35, 45, 25, 20),
      smdPad('2', 35, 45, 25, 20),
      smdPad('3', 0, -45, 25, 20)
    ],
    silkLines: rectSilk(40, 55),
    courtyard: [
      { x: -55, y: -65 }, { x: 55, y: -65 }, { x: 55, y: 65 }, { x: -55, y: 65 }
    ]
  };
}

function def0402(): PcbFootprintDef {
  return {
    id: 'FP_0402',
    name: '0402',
    description: 'Metric 1005 SMD',
    pads: [
      smdPad('1', -25, 0, 18, 25),
      smdPad('2', 25, 0, 18, 25)
    ],
    silkLines: rectSilk(30, 18),
    courtyard: [
      { x: -45, y: -25 }, { x: 45, y: -25 }, { x: 45, y: 25 }, { x: -45, y: 25 }
    ]
  };
}

function defTHT2Pin(): PcbFootprintDef {
  return {
    id: 'FP_THT2',
    name: 'THT-2',
    description: '2-pin through-hole 100mil pitch',
    pads: [
      thPad('1', -50, 0, 35, 60),
      thPad('2', 50, 0, 35, 60)
    ],
    silkLines: rectSilk(60, 30),
    courtyard: [
      { x: -80, y: -40 }, { x: 80, y: -40 }, { x: 80, y: 40 }, { x: -80, y: 40 }
    ]
  };
}

/** TO-220 / 三端稳压器 */
function defTO2203(): PcbFootprintDef {
  return {
    id: 'FP_TO2203',
    name: 'TO-220-3',
    description: '3-pin linear regulator (TO-220)',
    pads: [
      thPad('1', -90, 0, 40, 70),
      thPad('2', 0, 90, 40, 70),
      thPad('3', 90, 0, 40, 70)
    ],
    silkLines: rectSilk(100, 110),
    courtyard: [
      { x: -120, y: -50 }, { x: 120, y: -50 }, { x: 120, y: 130 }, { x: -120, y: 130 }
    ]
  };
}

/** LM2596 等 5 脚直插（与模板 lab_analog_ic 一致） */
function defSIP5(): PcbFootprintDef {
  const pads: PcbPad[] = [];
  const pitch = 100;
  const startX = -200;
  for (let i = 0; i < 5; i++) {
    pads.push(thPad(`${i + 1}`, startX + i * pitch, 0, 40, 70));
  }
  return {
    id: 'FP_SIP5',
    name: 'SIP-5',
    description: '5-pin SIP (LM2596 teaching)',
    pads: pads,
    silkLines: rectSilk(220, 40),
    courtyard: [
      { x: -240, y: -50 }, { x: 240, y: -50 }, { x: 240, y: 50 }, { x: -240, y: 50 }
    ]
  };
}

/** TO-92 三极管/传感器封装 */
function defTO92(): PcbFootprintDef {
  return {
    id: 'FP_TO92',
    name: 'TO-92',
    description: 'TO-92 3-pin transistor (2N2222/2N2907/2N7000)',
    pads: [
      thPad('1', -50, 0, 28, 50),
      thPad('2', 0, 0, 28, 50),
      thPad('3', 50, 0, 28, 50)
    ],
    silkLines: [
      [{ x: -60, y: -45 }, { x: 60, y: -45 }, { x: 60, y: 45 }, { x: -60, y: 45 }, { x: -60, y: -45 }]
    ],
    courtyard: [
      { x: -70, y: -55 }, { x: 70, y: -55 }, { x: 70, y: 55 }, { x: -70, y: 55 }
    ]
  };
}

/** TO-92 传感器（DS18B20 等 3 脚 + 无极性） */
function defTO92Sensor(): PcbFootprintDef {
  return {
    id: 'FP_TO92_SENSOR',
    name: 'TO-92-Sensor',
    description: 'TO-92 3-pin sensor (DS18B20, HALL)',
    pads: [
      thPad('1', -50, 0, 28, 50),
      thPad('2', 0, 0, 28, 50),
      thPad('3', 50, 0, 28, 50)
    ],
    silkLines: [
      [{ x: -55, y: -40 }, { x: 55, y: -40 }, { x: 55, y: 40 }, { x: -55, y: 40 }, { x: -55, y: -40 }]
    ],
    courtyard: [
      { x: -65, y: -50 }, { x: 65, y: -50 }, { x: 65, y: 50 }, { x: -65, y: 50 }
    ]
  };
}

/** LED 5mm 圆形 */
function defLED5mm(): PcbFootprintDef {
  return {
    id: 'FP_LED5',
    name: 'LED-5mm',
    description: '5mm LED through-hole',
    pads: [
      thPad('1', -50, 0, 32, 55),
      thPad('2', 50, 0, 32, 55)
    ],
    silkLines: circleSilk(42),
    courtyard: [
      { x: -65, y: -65 }, { x: 65, y: -65 }, { x: 65, y: 65 }, { x: -65, y: 65 }
    ]
  };
}

/** 轴向二极管 */
function defAxialDiode(): PcbFootprintDef {
  return {
    id: 'FP_AXIAL_DIODE',
    name: 'Axial-Diode',
    description: 'Axial diode (1N4148/1N4007/1N5819)',
    pads: [
      thPad('1', -140, 0, 35, 60),
      thPad('2', 140, 0, 35, 60)
    ],
    silkLines: [
      [{ x: -120, y: -30 }, { x: -50, y: -30 }, { x: -50, y: 30 }, { x: -120, y: 30 }, { x: -120, y: -30 }],
      [{ x: 50, y: -30 }, { x: 120, y: -30 }, { x: 120, y: 30 }, { x: 50, y: 30 }, { x: 50, y: -30 }],
      [{ x: -50, y: -18 }, { x: -50, y: 18 }]
    ],
    courtyard: [
      { x: -160, y: -45 }, { x: 160, y: -45 }, { x: 160, y: 45 }, { x: -160, y: 45 }
    ]
  };
}

/** 电解电容（径向）：脚距须大于焊盘外径，否则两盘相切/重叠 */
function defRadialCap(halfW: number = 100, padSpan: number = 200): PcbFootprintDef {
  // 默认 ~5mm 脚距、~70mil 盘径：边缘间隙 = padSpan - outer > 0
  const outer = 70;
  return {
    id: 'FP_RADIAL_CAP',
    name: 'Radial-Cap',
    description: 'Radial electrolytic capacitor',
    pads: [
      thPad('1', -padSpan / 2, 0, 35, outer),
      thPad('2', padSpan / 2, 0, 35, outer)
    ],
    silkLines: circleSilk(halfW + 8),
    courtyard: [
      { x: -(halfW + 20), y: -(halfW + 20) },
      { x: halfW + 20, y: -(halfW + 20) },
      { x: halfW + 20, y: halfW + 20 },
      { x: -(halfW + 20), y: halfW + 20 }
    ]
  };
}

function defPinHeader(n: number): PcbFootprintDef {
  const pads: PcbPad[] = [];
  const pitch = 100;
  const startY = -((n - 1) * pitch) / 2;
  for (let i = 0; i < n; i++) {
    pads.push(thPad(`${i + 1}`, 0, startY + i * pitch, 35, 60));
  }
  const halfH = ((n - 1) * pitch) / 2 + 50;
  return {
    id: `FP_PINHDR_${n}`,
    name: `PinHeader_1x${n}`,
    description: `1x${n} pin header`,
    pads,
    silkLines: rectSilk(40, halfH),
    courtyard: [
      { x: -55, y: -halfH - 10 }, { x: 55, y: -halfH - 10 },
      { x: 55, y: halfH + 10 }, { x: -55, y: halfH + 10 }
    ]
  };
}

function defMountHole(): PcbFootprintDef {
  // 与 tools/pcb_templates 一致：紧凑孔，中心可贴到距边≈半焊盘处
  return {
    id: 'FP_MOUNT',
    name: 'MountingHole',
    description: 'Corner mounting hole',
    pads: [thPad('1', 0, 0, 32, 40)],
    silkLines: [
      [{ x: -22, y: 0 }, { x: 22, y: 0 }],
      [{ x: 0, y: -22 }, { x: 0, y: 22 }]
    ],
    courtyard: [
      { x: -24, y: -24 }, { x: 24, y: -24 }, { x: 24, y: 24 }, { x: -24, y: 24 }
    ]
  };
}

/** SOP-8 窄体（24C02 EEPROM） */
function defSOP8(): PcbFootprintDef {
  const pads: PcbPad[] = [];
  for (let i = 0; i < 4; i++) {
    pads.push(smdPad(`${i + 1}`, -80, -75 + i * 50, 30, 14));
    pads.push(smdPad(`${8 - i}`, 80, -75 + i * 50, 30, 14));
  }
  return {
    id: 'FP_SOP8',
    name: 'SOP-8',
    description: 'SOP-8 200mil (24C02)',
    pads,
    silkLines: rectSilk(65, 80),
    courtyard: [
      { x: -95, y: -90 }, { x: 95, y: -90 }, { x: 95, y: 90 }, { x: -95, y: 90 }
    ]
  };
}

/** SOIC-8 Wide (W25Q64) */
function defSOIC8W(): PcbFootprintDef {
  const pads: PcbPad[] = [];
  for (let i = 0; i < 4; i++) {
    pads.push(smdPad(`${i + 1}`, -75, -90 + i * 60, 30, 16));
    pads.push(smdPad(`${8 - i}`, 75, -90 + i * 60, 30, 16));
  }
  return {
    id: 'FP_SOIC8W',
    name: 'SOIC-8W',
    description: 'SOIC-8 Wide 208mil (W25Q64)',
    pads,
    silkLines: rectSilk(70, 95),
    courtyard: [
      { x: -90, y: -105 }, { x: 90, y: -105 }, { x: 90, y: 105 }, { x: -90, y: 105 }
    ]
  };
}

/** QFP-44 (STC15W408AS) */
function defQFP44(): PcbFootprintDef {
  const pads: PcbPad[] = [];
  for (let i = 0; i < 11; i++) {
    pads.push(smdPad(`${i + 1}`, -260, -250 + i * 50, 50, 12));
    pads.push(smdPad(`${11 + i + 1}`, -250 + i * 50, 260, 50, 12));
    pads.push(smdPad(`${22 + i + 1}`, 260, 250 - i * 50, 50, 12));
    pads.push(smdPad(`${33 + i + 1}`, 250 - i * 50, -260, 50, 12));
  }
  return {
    id: 'FP_QFP44',
    name: 'QFP-44',
    description: 'QFP-44 0.8mm (STC15W408AS)',
    pads,
    silkLines: rectSilk(260, 260),
    courtyard: [
      { x: -280, y: -280 }, { x: 280, y: -280 }, { x: 280, y: 280 }, { x: -280, y: 280 }
    ]
  };
}

/** QFP-48 (STM32F103C8) */
function defQFP48(): PcbFootprintDef {
  const pads: PcbPad[] = [];
  for (let i = 0; i < 12; i++) {
    pads.push(smdPad(`${i + 1}`, -280, -275 + i * 50, 50, 14));
    pads.push(smdPad(`${12 + i + 1}`, -275 + i * 50, 280, 50, 14));
    pads.push(smdPad(`${24 + i + 1}`, 280, 275 - i * 50, 50, 14));
    pads.push(smdPad(`${36 + i + 1}`, 275 - i * 50, -280, 50, 14));
  }
  return {
    id: 'FP_QFP48',
    name: 'QFP-48',
    description: 'QFP-48 0.5mm (STM32F103C8)',
    pads,
    silkLines: rectSilk(280, 280),
    courtyard: [
      { x: -300, y: -300 }, { x: 300, y: -300 }, { x: 300, y: 300 }, { x: -300, y: 300 }
    ]
  };
}

/** QFP-64 (STM32F103RC) */
function defQFP64(): PcbFootprintDef {
  const pads: PcbPad[] = [];
  for (let i = 0; i < 16; i++) {
    pads.push(smdPad(`${i + 1}`, -375, -375 + i * 50, 50, 16));
    pads.push(smdPad(`${16 + i + 1}`, -375 + i * 50, 375, 50, 16));
    pads.push(smdPad(`${32 + i + 1}`, 375, 375 - i * 50, 50, 16));
    pads.push(smdPad(`${48 + i + 1}`, 375 - i * 50, -375, 50, 16));
  }
  return {
    id: 'FP_QFP64',
    name: 'QFP-64',
    description: 'QFP-64 0.5mm (STM32F103RC)',
    pads,
    silkLines: rectSilk(375, 375),
    courtyard: [
      { x: -395, y: -395 }, { x: 395, y: -395 }, { x: 395, y: 395 }, { x: -395, y: 395 }
    ]
  };
}

/** QFP-100 (STM32F407VG) */
function defQFP100(): PcbFootprintDef {
  const pads: PcbPad[] = [];
  for (let i = 0; i < 25; i++) {
    pads.push(smdPad(`${i + 1}`, -585, -600 + i * 50, 50, 18));
    pads.push(smdPad(`${25 + i + 1}`, -600 + i * 50, 585, 50, 18));
    pads.push(smdPad(`${50 + i + 1}`, 585, 600 - i * 50, 50, 18));
    pads.push(smdPad(`${75 + i + 1}`, 600 - i * 50, -585, 50, 18));
  }
  return {
    id: 'FP_QFP100',
    name: 'QFP-100',
    description: 'QFP-100 0.5mm (STM32F407VG)',
    pads,
    silkLines: rectSilk(585, 585),
    courtyard: [
      { x: -605, y: -605 }, { x: 605, y: -605 }, { x: 605, y: 605 }, { x: -605, y: 605 }
    ]
  };
}

/** TSSOP-20 (STM32L431CB, STM32F030F4) */
function defTSSOP20(): PcbFootprintDef {
  const pads: PcbPad[] = [];
  for (let i = 0; i < 10; i++) {
    pads.push(smdPad(`${i + 1}`, -100, -112 + i * 25, 40, 8));
    pads.push(smdPad(`${20 - i}`, 100, -112 + i * 25, 40, 8));
  }
  return {
    id: 'FP_TSSOP20',
    name: 'TSSOP-20',
    description: 'TSSOP-20 0.65mm (STM32L431CB, STM32F030F4)',
    pads,
    silkLines: rectSilk(85, 120),
    courtyard: [
      { x: -115, y: -140 }, { x: 115, y: -140 }, { x: 115, y: 140 }, { x: -115, y: 140 }
    ]
  };
}

/** 电位器 3 脚 */
function defPot3Pin(): PcbFootprintDef {
  return {
    id: 'FP_POT3',
    name: 'Pot-3Pin',
    description: '3-pin potentiometer',
    pads: [
      thPad('1', -50, 0, 40, 65),
      thPad('2', 0, -60, 40, 65),
      thPad('3', 50, 0, 40, 65)
    ],
    silkLines: rectSilk(65, 60),
    courtyard: [
      { x: -80, y: -80 }, { x: 80, y: -80 }, { x: 80, y: 45 }, { x: -80, y: 45 }
    ]
  };
}

/** 晶振 HC-49（与模板 FP_HC49 一致） */
function defHC49(): PcbFootprintDef {
  return {
    id: 'FP_HC49',
    name: 'HC-49',
    description: 'Crystal HC-49',
    pads: [
      thPad('1', -60, 0, 35, 60),
      thPad('2', 60, 0, 35, 60)
    ],
    silkLines: rectSilk(80, 40),
    courtyard: [
      { x: -100, y: -50 }, { x: 100, y: -50 }, { x: 100, y: 50 }, { x: -100, y: 50 }
    ]
  };
}

/** 兼容旧 id */
function defXtal2Pin(): PcbFootprintDef {
  const d = defHC49();
  return {
    id: 'FP_XTAL2',
    name: 'Crystal-2Pin',
    description: d.description,
    pads: d.pads,
    silkLines: d.silkLines,
    courtyard: d.courtyard
  };
}

/** 微动开关 4 脚 */
function defSwPush(): PcbFootprintDef {
  return {
    id: 'FP_SW_PUSH',
    name: 'SW-Push',
    description: 'Tactile push button 6x6mm',
    pads: [
      thPad('1', -60, -60, 32, 55),
      thPad('2', 60, -60, 32, 55),
      thPad('3', -60, 60, 32, 55),
      thPad('4', 60, 60, 32, 55)
    ],
    silkLines: rectSilk(55, 55),
    courtyard: [
      { x: -75, y: -75 }, { x: 75, y: -75 }, { x: 75, y: 75 }, { x: -75, y: 75 }
    ]
  };
}

/** 继电器 SPDT 5 脚 */
function defRelaySpdt(): PcbFootprintDef {
  return {
    id: 'FP_RELAY_SPDT',
    name: 'Relay-SPDT',
    description: 'SPDT relay 5-pin',
    pads: [
      thPad('1', -150, 0, 42, 70),
      thPad('2', 0, -150, 42, 70),
      thPad('3', 150, 0, 42, 70),
      thPad('4', -55, 80, 42, 70),
      thPad('5', 55, 80, 42, 70)
    ],
    silkLines: rectSilk(160, 120),
    courtyard: [
      { x: -180, y: -90 }, { x: 180, y: -90 }, { x: 180, y: 140 }, { x: -180, y: 140 }
    ]
  };
}

/** 蜂鸣器 2 脚 */
function defBuzzer(): PcbFootprintDef {
  return {
    id: 'FP_BUZZER',
    name: 'Buzzer',
    description: 'Piezo buzzer 2-pin',
    pads: [
      thPad('1', -100, 0, 42, 70),
      thPad('2', 100, 0, 42, 70)
    ],
    silkLines: circleSilk(75),
    courtyard: [
      { x: -90, y: -90 }, { x: 90, y: -90 }, { x: 90, y: 90 }, { x: -90, y: 90 }
    ]
  };
}

/** LCD1602 16 脚（单排 16 × 2.54mm） */
function defLcd1602(): PcbFootprintDef {
  const pads: PcbPad[] = [];
  for (let i = 0; i < 16; i++) {
    pads.push(thPad(`${i + 1}`, -300 + i * 100, 0, 42, 70));
  }
  return {
    id: 'FP_LCD1602',
    name: 'LCD-1602',
    description: 'LCD1602 16-pin header',
    pads,
    silkLines: rectSilk(500, 60),
    courtyard: [
      { x: -550, y: -80 }, { x: 850, y: -80 }, { x: 850, y: 80 }, { x: -550, y: 80 }
    ]
  };
}

/** OLED 12864 4 脚 I2C */
function defOled12864(): PcbFootprintDef {
  return {
    id: 'FP_OLED',
    name: 'OLED-12864',
    description: 'OLED 128x64 I2C 4-pin',
    pads: [
      smdPad('1', -120, 0, 40, 20),
      smdPad('2', -40, 0, 40, 20),
      smdPad('3', 40, 0, 40, 20),
      smdPad('4', 120, 0, 40, 20)
    ],
    silkLines: rectSilk(135, 40),
    courtyard: [
      { x: -150, y: -55 }, { x: 150, y: -55 }, { x: 150, y: 55 }, { x: -150, y: 55 }
    ]
  };
}

/** LDR 光敏电阻 2 脚 */
function defLdr(): PcbFootprintDef {
  return {
    id: 'FP_LDR',
    name: 'LDR',
    description: 'Photoresistor 2-pin',
    pads: [
      thPad('1', -80, 0, 35, 60),
      thPad('2', 80, 0, 35, 60)
    ],
    silkLines: circleSilk(50),
    courtyard: [
      { x: -70, y: -70 }, { x: 70, y: -70 }, { x: 70, y: 70 }, { x: -70, y: 70 }
    ]
  };
}

/** 仪器探针 4 脚 */
function defInstrument4Pin(): PcbFootprintDef {
  return {
    id: 'FP_INSTRUMENT',
    name: 'Instrument-4Pin',
    description: 'Virtual instrument probe 4-pin',
    pads: [
      thPad('1', -150, -100, 40, 65),
      thPad('2', 150, -100, 40, 65),
      thPad('3', -150, 100, 40, 65),
      thPad('4', 150, 100, 40, 65)
    ],
    silkLines: rectSilk(165, 115),
    courtyard: [
      { x: -180, y: -130 }, { x: 180, y: -130 }, { x: 180, y: 130 }, { x: -180, y: 130 }
    ]
  };
}

/** 电感（轴向 THT） */
function defAxialInductor(): PcbFootprintDef {
  return {
    id: 'FP_AXIAL_IND',
    name: 'Axial-Inductor',
    description: 'Axial inductor 2-pin',
    pads: [
      thPad('1', -120, 0, 35, 60),
      thPad('2', 120, 0, 35, 60)
    ],
    silkLines: [
      [{ x: -100, y: -35 }, { x: 100, y: -35 }, { x: 100, y: 35 }, { x: -100, y: 35 }, { x: -100, y: -35 }]
    ],
    courtyard: [
      { x: -140, y: -50 }, { x: 140, y: -50 }, { x: 140, y: 50 }, { x: -140, y: 50 }
    ]
  };
}

/** 保险丝（轴向） */
function defAxialFuse(): PcbFootprintDef {
  return {
    id: 'FP_FUSE',
    name: 'Axial-Fuse',
    description: 'Axial fuse 2-pin',
    pads: [
      thPad('1', -150, 0, 38, 65),
      thPad('2', 150, 0, 38, 65)
    ],
    silkLines: [
      [{ x: -120, y: -28 }, { x: 120, y: -28 }, { x: 120, y: 28 }, { x: -120, y: 28 }, { x: -120, y: -28 }]
    ],
    courtyard: [
      { x: -170, y: -45 }, { x: 170, y: -45 }, { x: 170, y: 45 }, { x: -170, y: 45 }
    ]
  };
}

/** 电源/信号源端子 2 脚 */
function defTerminal2Pin(): PcbFootprintDef {
  return {
    id: 'FP_TERMINAL2',
    name: 'Terminal-2Pin',
    description: 'Power/signal terminal 2-pin',
    pads: [
      thPad('1', -80, 0, 38, 65),
      thPad('2', 80, 0, 38, 65)
    ],
    silkLines: rectSilk(65, 25),
    courtyard: [
      { x: -100, y: -40 }, { x: 100, y: -40 }, { x: 100, y: 40 }, { x: -100, y: 40 }
    ]
  };
}

function defGeneric2Pin(): PcbFootprintDef {
  return def0805();
}

/** MCU 分类（与 tools/pcb_templates/export.mjs 一致） */
function isMcu51Lib(lib: string): boolean {
  return lib.includes('at89') || lib.includes('at89c51') || lib.includes('8051') ||
    lib.includes('stc89') || lib.includes('stc90') || lib.includes('stc15') ||
    lib === 'mcs51';
}

function isMcuStm32F103C8Lib(lib: string): boolean {
  return lib.includes('stm32f103c8') || lib === 'stm32f103c8tx';
}

function isMcuStm32F103RCLib(lib: string): boolean {
  return lib.includes('stm32f103rc');
}

function isMcuStm32F407Lib(lib: string): boolean {
  return lib.includes('stm32f407');
}

function isMcuStm32Tssop20Lib(lib: string): boolean {
  return lib.includes('stm32f030') || lib.includes('stm32l431');
}

const BUILTIN_DEFS: PcbFootprintDef[] = [
  // SMD 片式
  def0805(), def0603(), def0402(), def1206(),
  // SOIC/SOP
  defSOIC8(), defSOP8(), defSOIC8W(),
  // DIP 系列
  defDIP8(), defDIP14(), defDIP16(), defDIP28(), defDIP40(),
  // 晶体管 / 稳压 / SIP
  defSOT23(), defTO92(), defTO2203(), defSIP5(),
  // 连接器
  defTHT2Pin(), defPinHeader(4), defPinHeader(6), defPinHeader(8), defPinHeader(10),
  // 安装孔
  defMountHole(),
  // LED / 二极管
  defLED5mm(), defAxialDiode(),
  // 电容
  defRadialCap(),
  // QFP / TSSOP
  defQFP44(), defQFP48(), defQFP64(), defQFP100(), defTSSOP20(),
  // 电位器 / 晶振（HC-49 与模板一致；XTAL2 兼容旧 id）
  defPot3Pin(), defHC49(), defXtal2Pin(),
  // 开关 / 继电器 / 蜂鸣器
  defSwPush(), defRelaySpdt(), defBuzzer(),
  // 显示
  defLcd1602(), defOled12864(),
  // 传感器
  defTO92Sensor(), defLdr(),
  // 仪器 / 电源
  defInstrument4Pin(), defTerminal2Pin(),
  // 电感 / 保险丝
  defAxialInductor(), defAxialFuse()
];

export class PcbFootprintLibrary {
  private defs: Map<string, PcbFootprintDef> = new Map();

  constructor() {
    for (const d of BUILTIN_DEFS) {
      this.defs.set(d.id, d);
    }
  }

  getDef(id: string): PcbFootprintDef | null {
    return this.defs.get(id) ?? null;
  }

  listDefs(): PcbFootprintDef[] {
    return Array.from(this.defs.values());
  }

  /** 从 BOM footprint 字符串 + libraryId 解析封装 ID
   * 标准：tools/pcb_templates/export.mjs + Test_Template 板级结果（83 种器件） */
  resolveFootprintId(footprintStr: string, libraryId: string): string {
    const fp = footprintStr.toLowerCase();
    const lib = libraryId.toLowerCase();

    // --- 显式 footprint 字符串（与模板同序） ---
    if (fp.includes('0402')) return 'FP_0805';
    if (fp.includes('0603') || fp.includes('1608')) return 'FP_0603';
    if (fp.includes('1206') || fp.includes('3216')) return 'FP_1206';
    if (fp.includes('0805') || fp.includes('2012')) return 'FP_0805';
    if (fp.includes('to-220') || fp.includes('to220')) return 'FP_TO2203';
    if (fp.includes('sip') && fp.includes('5')) return 'FP_SIP5';
    if (fp.includes('soic')) return 'FP_SOIC8';
    if (fp.includes('dip-28') || fp.includes('dip28') || fp.includes('pdip-28')) return 'FP_DIP28';
    if (fp.includes('dip-16') || fp.includes('dip16') || fp.includes('pdip-16')) return 'FP_DIP16';
    if (fp.includes('dip-14') || fp.includes('dip14') || fp.includes('pdip-14')) return 'FP_DIP14';
    if (fp.includes('dip-40') || fp.includes('dip40') || fp.includes('pdip-40')) return 'FP_DIP40';
    if (fp.includes('dip') || fp.includes('pdip')) return 'FP_DIP8';
    if (fp.includes('hc-49') || fp.includes('hc49') || fp.includes('crystal')) return 'FP_HC49';
    if (fp.includes('sot') && fp.includes('23')) return 'FP_SOT23';
    if (fp.includes('tssop') && (fp.includes('20') || fp.includes('-20'))) return 'FP_TSSOP20';
    if (fp.includes('qfp') && fp.includes('100')) return 'FP_QFP100';
    if (fp.includes('qfp') && fp.includes('64')) return 'FP_QFP64';
    if (fp.includes('qfp') && fp.includes('48')) return 'FP_QFP48';

    // --- libraryId（与 Test_Template 板级封装对齐） ---
    // OLED 必须先于 led_，避免 oled 被当成 led
    if (lib.includes('oled')) return 'FP_OLED';
    if (lib.includes('lcd')) return 'FP_LCD1602';
    if (lib.includes('lm2596')) return 'FP_SIP5';
    if (lib.includes('7805') || lib.includes('7812') || lib.includes('ams1117')) return 'FP_TO2203';
    if (lib.startsWith('r_') || lib.startsWith('c_') || lib.startsWith('l_') ||
      lib.startsWith('led_') || lib.includes('1n') || lib.includes('fuse')) {
      return lib.includes('fuse') ? 'FP_1206' : 'FP_0805';
    }
    if (lib.includes('irf')) return 'FP_TO2203';
    if (lib.includes('2n') || lib.includes('mos') || lib.includes('bjt')) return 'FP_SOT23';
    if (lib.includes('pot')) return 'FP_POT3';
    if (lib.includes('ds18')) return 'FP_TO92_SENSOR';
    if (lib.includes('hall')) return 'FP_TO92_SENSOR';
    if (lib.includes('ldr')) return 'FP_LDR';
    if (lib.includes('sw_')) return 'FP_SW_PUSH';
    if (lib.includes('buzzer')) return 'FP_BUZZER';
    if (lib.includes('relay')) return 'FP_RELAY_SPDT';
    if (lib.includes('xtal') || lib.includes('crystal')) return 'FP_HC49';
    if (isMcu51Lib(lib)) return 'FP_DIP40';
    if (isMcuStm32F103C8Lib(lib)) return 'FP_QFP48';
    if (isMcuStm32F103RCLib(lib)) return 'FP_QFP64';
    if (isMcuStm32F407Lib(lib)) return 'FP_QFP100';
    if (isMcuStm32Tssop20Lib(lib)) return 'FP_TSSOP20';
    if (lib.includes('2764') || lib.includes('62256')) return 'FP_DIP28';
    if (lib.includes('cd4017') || lib.includes('4017')) return 'FP_DIP16';
    if (lib.includes('74hc') || lib.includes('74ls') || lib.includes('cd40')) return 'FP_DIP14';
    if (lib.includes('555') || lib.includes('741') || lib.includes('lm358') || lib.includes('tl082') ||
      lib.includes('stm32') || lib.includes('24c') || lib.includes('w25q')) {
      return lib.includes('stm32') ? 'FP_QFP48' : 'FP_SOIC8';
    }

    // 仪器探针（与 lab_instruments 手布探针封装一致）
    if (lib.includes('logic_analyzer')) return 'FP_PINHDR_10';
    if (lib.includes('oscilloscope')) return 'FP_PINHDR_6';
    if (lib.includes('power_meter') || lib.includes('uart_terminal') || lib.includes('virtual_meter')) {
      return 'FP_PINHDR_4';
    }
    if (lib.includes('ammeter') || lib.includes('voltmeter') || lib.includes('freq_counter') ||
      lib.includes('signal_gen')) {
      return 'FP_THT2';
    }

    // 无规则命中：静默回退 FP_0805 会掩盖脚数/几何全错（PIN_COUNT / PIN_BIND 难辨），
    // 此处显式审计，提示补库或改封装参数
    tracePcbWarn('FP_FALLBACK_0805',
      `lib=${libraryId} fp=${footprintStr} — 未命中封装规则，回退 FP_0805`);
    return 'FP_0805';
  }

  /** 克隆封装定义生成板上实例（深拷贝焊盘） */
  instantiate(defId: string, refDes: string, value: string, pos: Point2D,
    rotation: number = 0, schematicCompId?: string): PcbFootprintInst | null {
    const def = this.defs.get(defId) ?? this.defs.get('FP_0805');
    if (!def) return null;
    const pads: PcbPad[] = [];
    for (const p of def.pads) {
      pads.push({
        id: IdUtil.generate('pad'),
        number: p.number,
        type: p.type,
        shape: p.shape,
        pos: { x: p.pos.x, y: p.pos.y },
        size: { x: p.size.x, y: p.size.y },
        drill: p.drill,
        layers: [...p.layers]
      });
    }
    return {
      id: IdUtil.generate('fp'),
      defId: def.id,
      refDes,
      value,
      position: { x: pos.x, y: pos.y },
      rotation: (rotation % 360) as 0 | 90 | 180 | 270,
      mirrored: false,
      layer: PcbLayerId.F_CU,
      locked: false,
      pads,
      schematicCompId
    };
  }

  /** 按库定义刷新焊盘几何，保留同号焊盘的网络绑定与 id（便于走线跟随） */
  resyncPadsFromDef(inst: PcbFootprintInst, defId?: string): void {
    const targetId = defId ?? inst.defId;
    const def = this.defs.get(targetId) ?? this.defs.get('FP_0805');
    if (!def) return;
    const oldByNumber: Map<string, PcbPad> = new Map();
    for (const p of inst.pads) {
      oldByNumber.set(p.number, p);
    }
    const pads: PcbPad[] = [];
    for (const p of def.pads) {
      const old = oldByNumber.get(p.number);
      pads.push({
        id: old !== undefined ? old.id : IdUtil.generate('pad'),
        number: p.number,
        type: p.type,
        shape: p.shape,
        pos: { x: p.pos.x, y: p.pos.y },
        size: { x: p.size.x, y: p.size.y },
        drill: p.drill,
        layers: [...p.layers],
        netId: old?.netId,
        netName: old?.netName
      });
    }
    inst.defId = def.id;
    inst.pads = pads;
  }
}

export function getGlobalPcbFootprintLibrary(): PcbFootprintLibrary {
  if (!globalPcbLib) {
    globalPcbLib = new PcbFootprintLibrary();
  }
  return globalPcbLib;
}

let globalPcbLib: PcbFootprintLibrary | null = null;
