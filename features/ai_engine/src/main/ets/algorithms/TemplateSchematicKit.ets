/**
 * 实验模板共享工具 — 器件放置、网络/导线、引脚坐标
 */
import {
  SchematicDocument, ComponentInstance, NetType, WireStyle,
  IdUtil, Point2D, emptyStringMap
} from 'common';

export interface PinSpec {
  comp: ComponentInstance;
  pinId: string;
  pinName: string;
}

export class TemplateSchematicKit {

  static createDoc(name: string, description: string): SchematicDocument {
    const now = new Date().toISOString();
    return {
      id: IdUtil.generate('sch'),
      name: name,
      version: '1.0',
      components: [],
      wires: [],
      nets: [],
      netLabels: [],
      subcircuits: [],
      metadata: {
        author: 'LabTemplate', createdAt: now, modifiedAt: now,
        description: description, gridSize: 10, units: 'mm', undoLimit: 1000
      }
    };
  }

  static place(doc: SchematicDocument, libraryId: string, refDes: string,
    pos: Point2D): ComponentInstance {
    const comp: ComponentInstance = {
      id: IdUtil.generate('comp'),
      libraryId: libraryId,
      refDes: refDes,
      position: pos,
      rotation: 0,
      mirrored: false,
      parameters: emptyStringMap()
    };
    doc.components.push(comp);
    return comp;
  }

  static pinRef(c: ComponentInstance, pinId: string, pinName: string): string {
    return `${c.id}:${pinId}:${pinName}`;
  }

  static pinWorld(c: ComponentInstance, pinId: string, pinName: string): Point2D {
    const local = TemplateSchematicKit.pinOffset(c.libraryId, pinId, pinName);
    return { x: c.position.x + local.x, y: c.position.y + local.y };
  }

  static addNet(doc: SchematicDocument, name: string, type: NetType, pinRefs: string[]): string {
    let net = doc.nets.find(n => n.name === name);
    if (net === undefined) {
      net = { id: IdUtil.generate('net'), name: name, type: type, pinIds: [] };
      doc.nets.push(net);
    }
    for (let i = 0; i < pinRefs.length; i++) {
      if (!net.pinIds.includes(pinRefs[i])) {
        net.pinIds.push(pinRefs[i]);
      }
    }
    return net.id;
  }

  static netId(doc: SchematicDocument, name: string): string {
    const net = doc.nets.find(n => n.name === name);
    return net !== undefined ? net.id : name;
  }

  static addWire(doc: SchematicDocument, netId: string, ...pts: Point2D[]): void {
    const points: Point2D[] = [];
    for (let i = 0; i < pts.length; i++) {
      points.push({ x: pts[i].x, y: pts[i].y });
    }
    doc.wires.push({
      id: IdUtil.generate('wire'),
      netId: netId,
      points: points,
      style: WireStyle.ORTHOGONAL
    });
  }

  /** 将多个引脚并入同一网络并布线 */
  static join(doc: SchematicDocument, netName: string, type: NetType, pins: PinSpec[]): string {
    const refs: string[] = [];
    for (let i = 0; i < pins.length; i++) {
      const p = pins[i];
      refs.push(TemplateSchematicKit.pinRef(p.comp, p.pinId, p.pinName));
    }
    const nid = TemplateSchematicKit.addNet(doc, netName, type, refs);
    if (pins.length >= 2) {
      const pts: Point2D[] = [];
      for (let i = 0; i < pins.length; i++) {
        const p = pins[i];
        pts.push(TemplateSchematicKit.pinWorld(p.comp, p.pinId, p.pinName));
      }
      TemplateSchematicKit.addWire(doc, nid, ...pts);
    }
    return nid;
  }

  /** 串联两脚器件: A.1 — R — B.1 */
  static series2(doc: SchematicDocument, netMid: string,
    left: PinSpec, right: PinSpec): void {
    TemplateSchematicKit.join(doc, netMid, NetType.SIGNAL, [left, right]);
  }

  /** VCC/GND 电源轨 */
  static powerRails(doc: SchematicDocument, vccPin: PinSpec, gndPin: PinSpec,
    vccLoads: PinSpec[], gndLoads: PinSpec[]): void {
    const vccPins: PinSpec[] = [vccPin];
    for (let i = 0; i < vccLoads.length; i++) {
      vccPins.push(vccLoads[i]);
    }
    TemplateSchematicKit.join(doc, 'VCC', NetType.POWER, vccPins);
    const gndPins: PinSpec[] = [gndPin];
    for (let i = 0; i < gndLoads.length; i++) {
      gndPins.push(gndLoads[i]);
    }
    TemplateSchematicKit.join(doc, 'GND', NetType.GROUND, gndPins);
  }

  /** LED + 限流电阻: VCC/netHi — R.1; R.2 — LED.A; LED.K — GND */
  static ledBranch(doc: SchematicDocument, drive: PinSpec, gndPin: PinSpec,
    resistor: ComponentInstance, led: ComponentInstance, prefix: string): void {
    TemplateSchematicKit.series2(doc, `${prefix}_R`, drive,
      { comp: resistor, pinId: '1', pinName: '1' });
    TemplateSchematicKit.series2(doc, `${prefix}_LED`,
      { comp: resistor, pinId: '2', pinName: '2' },
      { comp: led, pinId: 'A', pinName: 'A' });
    TemplateSchematicKit.join(doc, 'GND', NetType.GROUND, [
      gndPin, { comp: led, pinId: 'K', pinName: 'K' }
    ]);
  }

  /** 8051/STM32 最小系统电源+复位+去耦 */
  static mcuCore(doc: SchematicDocument, mcu: ComponentInstance,
    vcc: ComponentInstance, gnd: ComponentInstance,
    rRst: ComponentInstance, cDec: ComponentInstance,
    vccPin: string, gndPin: string, rstPin: string): void {
    TemplateSchematicKit.join(doc, 'NRST', NetType.SIGNAL, [
      { comp: mcu, pinId: rstPin, pinName: rstPin },
      { comp: rRst, pinId: '1', pinName: '1' }
    ]);
    TemplateSchematicKit.powerRails(doc,
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

  /** 晶振 + 负载电容 */
  static crystal(doc: SchematicDocument, mcu: ComponentInstance,
    xtal: ComponentInstance, c1: ComponentInstance, c2: ComponentInstance,
    inPin: string, outPin: string): void {
    TemplateSchematicKit.join(doc, 'XTAL1', NetType.SIGNAL, [
      { comp: mcu, pinId: inPin, pinName: inPin },
      { comp: xtal, pinId: '1', pinName: '1' },
      { comp: c1, pinId: '1', pinName: '1' }
    ]);
    TemplateSchematicKit.join(doc, 'XTAL2', NetType.SIGNAL, [
      { comp: mcu, pinId: outPin, pinName: outPin },
      { comp: xtal, pinId: '2', pinName: '2' },
      { comp: c2, pinId: '1', pinName: '1' }
    ]);
    TemplateSchematicKit.join(doc, 'GND', NetType.GROUND, [
      { comp: c1, pinId: '2', pinName: '2' },
      { comp: c2, pinId: '2', pinName: '2' }
    ]);
  }

  static pinOffset(libraryId: string, pinId: string, _pinName: string): Point2D {
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
    if (libraryId === 'SW_PUSH') {
      return pinId === '1' ? { x: -30, y: 0 } : { x: 30, y: 0 };
    }
    if (libraryId === 'VCC') {
      return { x: 0, y: 10 };
    }
    if (libraryId === 'GND') {
      return { x: 0, y: -10 };
    }
    if (libraryId === 'VAC') {
      return pinId === '1' ? { x: -20, y: 0 } : { x: 20, y: 0 };
    }
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
    if (libraryId === 'LM7805' || libraryId === 'LM7812' ||
      libraryId === 'AMS1117_3V3') {
      if (pinId === '1') return { x: -40, y: -10 };
      if (pinId === '2') return { x: -40, y: 0 };
      if (pinId === '3') return { x: 40, y: -10 };
      return { x: 0, y: 0 };
    }
    if (libraryId === 'LM2596') {
      return TemplateSchematicKit.genPinOffset(5, pinId, 40);
    }
    if (libraryId.startsWith('74HC') || libraryId === 'CD4017') {
      return TemplateSchematicKit.genPinOffset(14, pinId, 40);
    }
    if (libraryId === '2764' || libraryId === '62256') {
      return TemplateSchematicKit.genPinOffset(28, pinId, 40);
    }
    if (libraryId === '24C02' || libraryId === 'W25Q64') {
      return TemplateSchematicKit.genPinOffset(8, pinId, 40);
    }
    if (libraryId.startsWith('STM32')) {
      const pinCount = libraryId.includes('F407') ? 100 : 48;
      return TemplateSchematicKit.mcuPinOffset(pinCount, pinId);
    }
    if (libraryId === 'AT89C51' || libraryId === 'AT89C52' ||
      libraryId.startsWith('STC')) {
      return TemplateSchematicKit.mcuPinOffset(40, pinId);
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
      const chNum = pinId.startsWith('CH') ? parseInt(pinId.substring(2)) : 0;
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
    if (libraryId === 'LCD1602') {
      return TemplateSchematicKit.genPinOffset(16, pinId, 40);
    }
    if (libraryId === 'OLED_12864') {
      return TemplateSchematicKit.genPinOffset(8, pinId, 40);
    }
    const pinNum = parseInt(pinId);
    if (!isNaN(pinNum)) {
      return TemplateSchematicKit.genPinOffset(16, pinId, 40);
    }
    if (pinId.startsWith('P')) {
      const n = parseInt(pinId.substring(1));
      if (!isNaN(n)) {
        return TemplateSchematicKit.mcuPinOffset(48, pinId);
      }
    }
    return { x: 0, y: 0 };
  }

  private static genPinOffset(count: number, pinId: string, bodyX: number): Point2D {
    const pinNum = parseInt(pinId);
    const leftCount = Math.ceil(count / 2);
    const bodyHalf = leftCount * 10 / 2;
    const idx = pinNum - 1;
    if (idx < leftCount) {
      return { x: -bodyX, y: idx * 10 - bodyHalf };
    }
    const rightIdx = idx - leftCount;
    return { x: bodyX, y: rightIdx * 10 - bodyHalf };
  }

  private static mcuPinOffset(count: number, pinId: string): Point2D {
    const n = parseInt(pinId.substring(1));
    const leftCount = Math.ceil(count / 2);
    const bodyHalf = leftCount * 10 / 2;
    const idx = n - 1;
    if (idx < leftCount) {
      return { x: -50, y: idx * 10 - bodyHalf };
    }
    const rightIdx = idx - leftCount;
    return { x: 50, y: rightIdx * 10 - bodyHalf };
  }
}
