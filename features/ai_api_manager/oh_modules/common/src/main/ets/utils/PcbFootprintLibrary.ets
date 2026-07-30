/**
 * 内置封装库 — KiCad 常用 SMD/THT 封装（简化几何）
 */
import { IdUtil } from './IdUtil';
import { Point2D } from '../types/CommonTypes';
import {
  PcbFootprintDef, PcbPad, PcbPadShape, PcbPadType, PcbLayerId, PcbFootprintInst,
  PcbPadNetPreserved
} from '../types/PcbTypes';

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

/** TO-220 / 三端稳压器 — 脚位与原理图 LM7805 一致：1=IN 2=GND 3=OUT */
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
  return {
    id: 'FP_MOUNT',
    name: 'MountingHole',
    description: 'M3 mounting hole',
    pads: [thPad('1', 0, 0, 120, 160)],
    silkLines: [
      [{ x: -90, y: 0 }, { x: 90, y: 0 }],
      [{ x: 0, y: -90 }, { x: 0, y: 90 }]
    ],
    courtyard: [
      { x: -100, y: -100 }, { x: 100, y: -100 }, { x: 100, y: 100 }, { x: -100, y: 100 }
    ]
  };
}

function defGeneric2Pin(): PcbFootprintDef {
  return def0805();
}

const BUILTIN_DEFS: PcbFootprintDef[] = [
  def0805(), def0603(), def0402(), def1206(), defSOIC8(), defDIP8(), defSOT23(),
  defTHT2Pin(), defTO2203(), defPinHeader(4), defPinHeader(6), defPinHeader(8), defMountHole()
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

  /** 从 BOM footprint 字符串解析封装 ID */
  resolveFootprintId(footprintStr: string, libraryId: string): string {
    const fp = footprintStr.toLowerCase();
    const lib = libraryId.toLowerCase();
    if (fp.includes('0402') || fp.includes('1005')) return 'FP_0402';
    if (fp.includes('0603') || fp.includes('1608')) return 'FP_0603';
    if (fp.includes('1206') || fp.includes('3216')) return 'FP_1206';
    if (fp.includes('0805') || fp.includes('2012')) return 'FP_0805';
    if (fp.includes('to-220') || fp.includes('to220') || fp.includes('to220-3')) return 'FP_TO2203';
    if (fp.includes('soic') && (fp.includes('8') || fp.includes('-8'))) return 'FP_SOIC8';
    if (fp.includes('dip') && fp.includes('8')) return 'FP_DIP8';
    if (fp.includes('sot') && fp.includes('23')) return 'FP_SOT23';
    if (fp.includes('dip') || fp.includes('pdip')) return 'FP_DIP8';
    // 三端线性稳压器（LM7805 / LM1117 等）
    if (lib.includes('7805') || lib.includes('7812') || lib.includes('7824') ||
      lib.includes('lm78') || lib.includes('lm1117') || lib.includes('ams1117') ||
      lib.includes('regulator') || lib.includes('ldo')) {
      return 'FP_TO2203';
    }
    if (lib.startsWith('r_') || lib.startsWith('c_') || lib.startsWith('l_')) return 'FP_0805';
    if (lib.includes('fuse')) return 'FP_1206';
    if (lib.includes('led')) return 'FP_0805';
    if (lib.includes('diode')) return 'FP_0805';
    if (lib.includes('transistor') || lib.includes('bjt') || lib.includes('mosfet')) return 'FP_SOT23';
    // 仪器探针 — 2 脚 THT（V+/COM、I+/I-）
    if (lib.includes('voltmeter') || lib.includes('ammeter') || lib.includes('multimeter') ||
      lib.includes('oscilloscope') || lib.includes('probe')) {
      return 'FP_THT2';
    }
    if (lib.includes('ic') || lib.includes('mcu') || lib.includes('opamp')) return 'FP_SOIC8';
    if (lib.includes('conn') || lib.includes('header')) return 'FP_THT2';
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

  /** 按库定义刷新焊盘几何，保留同号焊盘的网络绑定 */
  resyncPadsFromDef(inst: PcbFootprintInst, defId?: string): void {
    const targetId = defId ?? inst.defId;
    const def = this.defs.get(targetId) ?? this.defs.get('FP_0805');
    if (!def) return;
    const netByNumber: Map<string, PcbPadNetPreserved> = new Map();
    for (const p of inst.pads) {
      const preserved: PcbPadNetPreserved = { netId: p.netId, netName: p.netName };
      netByNumber.set(p.number, preserved);
    }
    const pads: PcbPad[] = [];
    for (const p of def.pads) {
      const preserved = netByNumber.get(p.number);
      pads.push({
        id: IdUtil.generate('pad'),
        number: p.number,
        type: p.type,
        shape: p.shape,
        pos: { x: p.pos.x, y: p.pos.y },
        size: { x: p.size.x, y: p.size.y },
        drill: p.drill,
        layers: [...p.layers],
        netId: preserved?.netId,
        netName: preserved?.netName
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
