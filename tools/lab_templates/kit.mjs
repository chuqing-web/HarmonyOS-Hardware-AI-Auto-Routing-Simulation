/** TemplateSchematicKit — Node 版，与 ArkTS 构建器对齐 */

const NetType = { SIGNAL: 'signal', POWER: 'power', GROUND: 'ground', BUS: 'bus' };
const WireStyle = { ORTHOGONAL: 'orthogonal' };

let _seq = 0;
function genId(prefix) {
  _seq += 1;
  return `${prefix}_${Date.now()}_${_seq}`;
}

export function resetSeq() {
  _seq = 0;
}

export class K {
  static createDoc(name, description) {
    const now = new Date().toISOString();
    return {
      id: genId('sch'),
      name,
      version: '1.0',
      components: [],
      wires: [],
      nets: [],
      netLabels: [],
      subcircuits: [],
      metadata: {
        author: 'LabTemplate',
        createdAt: now,
        modifiedAt: now,
        description,
        gridSize: 10,
        units: 'mm',
        undoLimit: 1000
      }
    };
  }

  static place(doc, libraryId, refDes, pos) {
    const comp = {
      id: genId('comp'),
      libraryId,
      refDes,
      position: { x: pos.x, y: pos.y },
      rotation: 0,
      mirrored: false,
      parameters: {}
    };
    doc.components.push(comp);
    return comp;
  }

  static pinRef(c, pinId, pinName) {
    return `${c.id}:${pinId}:${pinName}`;
  }

  static pinWorld(c, pinId, pinName) {
    const local = K.pinOffset(c.libraryId, pinId, pinName);
    return { x: c.position.x + local.x, y: c.position.y + local.y };
  }

  static addNet(doc, name, type, pinRefs) {
    let net = doc.nets.find(n => n.name === name);
    if (!net) {
      net = { id: genId('net'), name, type, pinIds: [] };
      doc.nets.push(net);
    }
    for (const ref of pinRefs) {
      if (!net.pinIds.includes(ref)) net.pinIds.push(ref);
    }
    return net.id;
  }

  static addWire(doc, netId, ...pts) {
    doc.wires.push({
      id: genId('wire'),
      netId,
      points: pts.map(p => ({ x: p.x, y: p.y })),
      style: WireStyle.ORTHOGONAL
    });
  }

  static join(doc, netName, type, pins) {
    const refs = pins.map(p => K.pinRef(p.comp, p.pinId, p.pinName));
    const nid = K.addNet(doc, netName, type, refs);
    if (pins.length >= 2) {
      const pts = pins.map(p => K.pinWorld(p.comp, p.pinId, p.pinName));
      K.addWire(doc, nid, ...pts);
    }
    return nid;
  }

  static series2(doc, netMid, left, right) {
    K.join(doc, netMid, NetType.SIGNAL, [left, right]);
  }

  static powerRails(doc, vccPin, gndPin, vccLoads, gndLoads) {
    K.join(doc, 'VCC', NetType.POWER, [vccPin, ...vccLoads]);
    K.join(doc, 'GND', NetType.GROUND, [gndPin, ...gndLoads]);
  }

  static ledBranch(doc, drive, gndPin, resistor, led, prefix) {
    K.series2(doc, `${prefix}_R`, drive, { comp: resistor, pinId: '1', pinName: '1' });
    K.series2(doc, `${prefix}_LED`,
      { comp: resistor, pinId: '2', pinName: '2' },
      { comp: led, pinId: 'A', pinName: 'A' });
    K.join(doc, 'GND', NetType.GROUND, [gndPin, { comp: led, pinId: 'K', pinName: 'K' }]);
  }

  static mcuCore(doc, mcu, vcc, gnd, rRst, cDec, vccPin, gndPin, rstPin) {
    K.join(doc, 'NRST', NetType.SIGNAL, [
      { comp: mcu, pinId: rstPin, pinName: rstPin },
      { comp: rRst, pinId: '1', pinName: '1' }
    ]);
    K.powerRails(doc,
      { comp: vcc, pinId: '1', pinName: 'VCC' },
      { comp: gnd, pinId: '1', pinName: 'GND' },
      [
        { comp: mcu, pinId: vccPin, pinName: vccPin },
        { comp: rRst, pinId: '2', pinName: '2' },
        { comp: cDec, pinId: '1', pinName: '1' }
      ],
      [
        { comp: mcu, pinId: gndPin, pinName: gndPin },
        { comp: cDec, pinId: '2', pinName: '2' }
      ]);
  }

  static crystal(doc, mcu, xtal, c1, c2, inPin, outPin) {
    K.join(doc, 'XTAL1', NetType.SIGNAL, [
      { comp: mcu, pinId: inPin, pinName: inPin },
      { comp: xtal, pinId: '1', pinName: '1' },
      { comp: c1, pinId: '1', pinName: '1' }
    ]);
    K.join(doc, 'XTAL2', NetType.SIGNAL, [
      { comp: mcu, pinId: outPin, pinName: outPin },
      { comp: xtal, pinId: '2', pinName: '2' },
      { comp: c2, pinId: '1', pinName: '1' }
    ]);
    K.join(doc, 'GND', NetType.GROUND, [
      { comp: c1, pinId: '2', pinName: '2' },
      { comp: c2, pinId: '2', pinName: '2' }
    ]);
  }

  static pinOffset(libraryId, pinId, _pinName) {
    if (libraryId.startsWith('R_') || libraryId.startsWith('C_') ||
      libraryId.startsWith('XTAL_') || libraryId.startsWith('L_') ||
      libraryId.startsWith('FUSE_') || libraryId === 'DS18B20' ||
      libraryId === 'HALL_SENSOR' || libraryId === 'LDR' ||
      libraryId === 'BUZZER' || libraryId === 'RELAY_SPDT') {
      return pinId === '1' ? { x: -30, y: 0 } : { x: 30, y: 0 };
    }
    if (libraryId.startsWith('LED_') || libraryId === '1N4148' ||
      libraryId === '1N4007' || libraryId === '1N5819') {
      return pinId === 'A' ? { x: -30, y: 0 } : { x: 30, y: 0 };
    }
    if (libraryId === 'SW_PUSH') return pinId === '1' ? { x: -30, y: 0 } : { x: 30, y: 0 };
    if (libraryId === 'VCC') return { x: 0, y: 10 };
    if (libraryId === 'GND') return { x: 0, y: -10 };
    if (libraryId === 'VAC') return pinId === '1' ? { x: -20, y: 0 } : { x: 20, y: 0 };
    if (libraryId === 'UA741') {
      switch (pinId) {
        case 'IN+': return { x: -30, y: -10 };
        case 'IN-': return { x: -30, y: 10 };
        case 'OUT': return { x: 30, y: 0 };
        case 'VCC': return { x: 0, y: -40 };
        case 'VEE': return { x: 0, y: 40 };
        default: return { x: 0, y: 0 };
      }
    }
    if (libraryId === 'LM358' || libraryId === 'TL082') {
      switch (pinId) {
        case 'IN+1': return { x: -50, y: -40 };
        case 'IN-1': return { x: -50, y: -20 };
        case 'OUT1': return { x: 50, y: -30 };
        case 'IN+2': return { x: -50, y: 20 };
        case 'IN-2': return { x: -50, y: 40 };
        case 'OUT2': return { x: 50, y: 30 };
        case 'V+': return { x: 0, y: -50 };
        case 'V-': return { x: 0, y: 50 };
        default: return { x: 0, y: 0 };
      }
    }
    if (libraryId === 'LM7805' || libraryId === 'LM7812' || libraryId === 'AMS1117_3V3') {
      if (pinId === '1') return { x: -40, y: -10 };
      if (pinId === '2') return { x: -40, y: 0 };
      if (pinId === '3') return { x: 40, y: -10 };
      return { x: 0, y: 0 };
    }
    if (libraryId === 'LM2596') return K.genPinOffset(5, pinId, 40);
    if (libraryId.startsWith('74HC') || libraryId === 'CD4017') return K.genPinOffset(14, pinId, 40);
    if (libraryId === '2764' || libraryId === '62256') return K.genPinOffset(28, pinId, 40);
    if (libraryId === '24C02' || libraryId === 'W25Q64') return K.genPinOffset(8, pinId, 40);
    if (libraryId.startsWith('STM32')) {
      const pinCount = libraryId.includes('F407') ? 100 : 48;
      return K.mcuPinOffset(pinCount, pinId);
    }
    if (libraryId === 'AT89C51' || libraryId === 'AT89C52' || libraryId.startsWith('STC')) {
      return K.mcuPinOffset(40, pinId);
    }
    if (libraryId === '2N2222' || libraryId === '2N2907') {
      if (pinId === 'B') return { x: -30, y: 0 };
      if (pinId === 'C') return { x: 30, y: -20 };
      if (pinId === 'E') return { x: 30, y: 20 };
      return { x: 0, y: 0 };
    }
    if (libraryId === '2N7000' || libraryId === 'IRF540') {
      if (pinId === 'G') return { x: -30, y: 0 };
      if (pinId === 'D') return { x: 30, y: -10 };
      if (pinId === 'S') return { x: 30, y: 10 };
      return { x: 0, y: 0 };
    }
    if (libraryId === 'VOLTMETER_DC' || libraryId === 'VIRTUAL_METER') {
      if (pinId === 'V+' || pinId === 'V') return { x: -30, y: -10 };
      if (pinId === 'COM') return { x: -30, y: 10 };
      return { x: 0, y: 0 };
    }
    if (libraryId === 'AMMETER_DC') {
      if (pinId === 'I+') return { x: -30, y: 0 };
      if (pinId === 'I-') return { x: -30, y: 20 };
      return { x: 0, y: 0 };
    }
    if (libraryId === 'FREQ_COUNTER') {
      if (pinId === 'IN') return { x: -30, y: -10 };
      if (pinId === 'GND') return { x: -30, y: 10 };
      return { x: 0, y: 0 };
    }
    if (libraryId === 'OSCILLOSCOPE') {
      if (pinId === 'CH1') return { x: -40, y: -20 };
      if (pinId === 'CH2') return { x: -40, y: -10 };
      if (pinId === 'CH3') return { x: -40, y: 10 };
      if (pinId === 'CH4') return { x: -40, y: 20 };
      if (pinId === 'GND') return { x: -40, y: 40 };
      return { x: 0, y: 0 };
    }
    if (libraryId === 'LOGIC_ANALYZER') {
      const chNum = pinId.startsWith('CH') ? parseInt(pinId.substring(2), 10) : 0;
      if (chNum >= 1 && chNum <= 8) return { x: -40, y: -40 + (chNum - 1) * 10 };
      if (pinId === 'GND') return { x: -40, y: 40 };
      return { x: 0, y: 0 };
    }
    if (libraryId === 'POWER_METER') {
      if (pinId === 'V+') return { x: -40, y: -20 };
      if (pinId === 'V-') return { x: -40, y: 0 };
      if (pinId === 'I+') return { x: -40, y: 20 };
      if (pinId === 'I-') return { x: -40, y: 40 };
      return { x: 0, y: 0 };
    }
    if (libraryId === 'UART_TERMINAL') {
      if (pinId === 'TX') return { x: -40, y: -10 };
      if (pinId === 'RX') return { x: -40, y: 10 };
      if (pinId === 'GND') return { x: -40, y: 30 };
      return { x: 0, y: 0 };
    }
    if (libraryId === 'LCD1602') return K.genPinOffset(16, pinId, 40);
    if (libraryId === 'OLED_12864') return K.genPinOffset(8, pinId, 40);
    const pinNum = parseInt(pinId, 10);
    if (!isNaN(pinNum)) return K.genPinOffset(16, pinId, 40);
    if (pinId.startsWith('P')) {
      const n = parseInt(pinId.substring(1), 10);
      if (!isNaN(n)) return K.mcuPinOffset(48, pinId);
    }
    return { x: 0, y: 0 };
  }

  static genPinOffset(count, pinId, bodyX) {
    const pinNum = parseInt(pinId, 10);
    const leftCount = Math.ceil(count / 2);
    const bodyHalf = leftCount * 10 / 2;
    const idx = pinNum - 1;
    if (idx < leftCount) return { x: -bodyX, y: idx * 10 - bodyHalf };
    const rightIdx = idx - leftCount;
    return { x: bodyX, y: rightIdx * 10 - bodyHalf };
  }

  static mcuPinOffset(count, pinId) {
    const n = parseInt(pinId.substring(1), 10);
    const leftCount = Math.ceil(count / 2);
    const bodyHalf = leftCount * 10 / 2;
    const idx = n - 1;
    if (idx < leftCount) return { x: -50, y: idx * 10 - bodyHalf };
    const rightIdx = idx - leftCount;
    return { x: 50, y: rightIdx * 10 - bodyHalf };
  }
}

export const R = (doc, id, ref, x, y) => K.place(doc, id, ref, { x, y });
export const C = (doc, id, ref, x, y) => K.place(doc, id, ref, { x, y });
export const NetTypeEnum = NetType;
