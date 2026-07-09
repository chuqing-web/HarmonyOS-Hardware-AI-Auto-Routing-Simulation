/**
 * 电路模板生成器 — 为每个实验模板生成完整、可仿真的电路
 * 包含正确的元器件放置、网络连接和导线路由
 */
import {
  SchematicDocument, ComponentInstance, Net, NetType, Wire, WireStyle,
  IdUtil, Point2D, emptyStringMap
} from 'common';

interface PinLocal {
  pinId: string;
  pinName: string;
  offset: Point2D;
}

export class CircuitTemplates {

  static generate(prompt: string, mcuFamily?: string): SchematicDocument {
    const lower = prompt.toLowerCase();

    const doc = CircuitTemplates.createDoc(prompt);

    // 根据关键字分派到具体模板
    if (lower.includes('7805') || lower.includes('稳压')) {
      CircuitTemplates.buildPowerSupply(doc);
    } else if (lower.includes('运放') || lower.includes('放大') || lower.includes('同相') || lower.includes('反相')) {
      CircuitTemplates.buildAmplifier(doc);
    } else if (lower.includes('rc') || lower.includes('滤波')) {
      CircuitTemplates.buildFilter(doc);
    } else if ((lower.includes('51') || lower.includes('stc')) && (lower.includes('流水') || lower.includes('led') || lower.includes('灯'))) {
      CircuitTemplates.build51Led(doc);
    } else if (lower.includes('uart') || lower.includes('串口')) {
      CircuitTemplates.buildUart(doc);
    } else {
      // 通用关键词处理（向后兼容）
      const isStm32 = mcuFamily?.includes('STM32') || lower.includes('stm32');
      const is51 = mcuFamily?.includes('8051') || lower.includes('51') || lower.includes('stc');
      const hasLcd = lower.includes('lcd') || lower.includes('显示');
      const hasLed = lower.includes('led') || lower.includes('灯');
      const hasKey = lower.includes('按键') || lower.includes('button') || lower.includes('key');

      if (is51 && hasLed) {
        CircuitTemplates.build51Led(doc);
      } else if (isStm32 && (hasLcd || hasKey || hasLed)) {
        CircuitTemplates.buildStm32Minimal(doc, hasLed, hasKey, hasLcd);
      } else {
        CircuitTemplates.buildStm32Minimal(doc, hasLed, hasKey, hasLcd);
      }
    }
    return doc;
  }

  // ──────────── Document factory ────────────

  private static createDoc(prompt: string): SchematicDocument {
    const now = new Date().toISOString();
    return {
      id: IdUtil.generate('sch'),
      name: 'AI Generated Circuit',
      version: '1.0',
      components: [],
      wires: [],
      nets: [],
      netLabels: [],
      subcircuits: [],
      metadata: {
        author: 'AI', createdAt: now, modifiedAt: now,
        description: prompt, gridSize: 10, units: 'mm', undoLimit: 1000
      }
    };
  }

  // ──────────── lab_power: LM7805 稳压电源 ────────────

  private static buildPowerSupply(doc: SchematicDocument): void {
    // 元器件布局
    const reg = CircuitTemplates.placeComp(doc, 'LM7805', 'U1', { x: 200, y: 150 });
    const cin = CircuitTemplates.placeComp(doc, 'C_100uF', 'C1', { x: 100, y: 150 });
    const cout = CircuitTemplates.placeComp(doc, 'C_10uF', 'C2', { x: 300, y: 150 });
    const vcc = CircuitTemplates.placeComp(doc, 'VCC', 'PWR1', { x: 50, y: 100 });
    const gndIn = CircuitTemplates.placeComp(doc, 'GND', 'GND1', { x: 150, y: 240 });
    const gndOut = CircuitTemplates.placeComp(doc, 'GND', 'GND2', { x: 300, y: 240 });
    // 增加: 负载电阻 + 电压表
    const rLoad = CircuitTemplates.placeComp(doc, 'R_10k', 'Rload', { x: 400, y: 220 });
    const voltmeter = CircuitTemplates.placeComp(doc, 'VOLTMETER_DC', 'M1', { x: 420, y: 120 });

    // 网络: LM7805 genPins(3) → pin 1=Input, pin 2=GND, pin 3=Output
    const netInput = CircuitTemplates.addNet(doc, 'VIN', NetType.SIGNAL, [
      CircuitTemplates.pinRef(vcc, '1', 'VCC'),
      CircuitTemplates.pinRef(cin, '1', '1'),
      CircuitTemplates.pinRef(reg, '1', '1'),
    ]);
    const netOut = CircuitTemplates.addNet(doc, 'VOUT', NetType.POWER, [
      CircuitTemplates.pinRef(reg, '3', '3'),
      CircuitTemplates.pinRef(cout, '1', '1'),
      CircuitTemplates.pinRef(rLoad, '1', '1'),
      CircuitTemplates.pinRef(voltmeter, 'V+', 'V+'),
    ]);
    CircuitTemplates.addNet(doc, 'GND', NetType.GROUND, [
      CircuitTemplates.pinRef(reg, '2', '2'),
      CircuitTemplates.pinRef(cin, '2', '2'),
      CircuitTemplates.pinRef(cout, '2', '2'),
      CircuitTemplates.pinRef(rLoad, '2', '2'),
      CircuitTemplates.pinRef(voltmeter, 'COM', 'COM'),
      CircuitTemplates.pinRef(gndIn, '1', 'GND'),
      CircuitTemplates.pinRef(gndOut, '1', 'GND'),
    ]);

    // 导线
    CircuitTemplates.addWire(doc, netInput,
      CircuitTemplates.pinWorld(vcc, '1', 'VCC'),
      CircuitTemplates.pinWorld(cin, '1', '1'),
      CircuitTemplates.pinWorld(reg, '1', '1'));
    CircuitTemplates.addWire(doc, netOut,
      CircuitTemplates.pinWorld(reg, '3', '3'),
      CircuitTemplates.pinWorld(cout, '1', '1'));
    // GND 导线
    const gndNetId = CircuitTemplates.netByName(doc, 'GND');
    CircuitTemplates.addWire(doc, gndNetId,
      CircuitTemplates.pinWorld(reg, '2', '2'),
      CircuitTemplates.pinWorld(gndIn, '1', 'GND'));
    CircuitTemplates.addWire(doc, gndNetId,
      CircuitTemplates.pinWorld(cin, '2', '2'),
      CircuitTemplates.pinWorld(gndIn, '1', 'GND'));
    CircuitTemplates.addWire(doc, gndNetId,
      CircuitTemplates.pinWorld(cout, '2', '2'),
      CircuitTemplates.pinWorld(gndOut, '1', 'GND'));
  }

  // ──────────── lab_amp: UA741 同相放大器 ────────────

  private static buildAmplifier(doc: SchematicDocument): void {
    const opa = CircuitTemplates.placeComp(doc, 'UA741', 'U1', { x: 200, y: 150 });
    const ri = CircuitTemplates.placeComp(doc, 'R_10k', 'R1', { x: 100, y: 130 });
    const rf = CircuitTemplates.placeComp(doc, 'R_100k', 'Rf', { x: 200, y: 60 });
    const rg = CircuitTemplates.placeComp(doc, 'R_10k', 'Rg', { x: 150, y: 230 });
    const vcc = CircuitTemplates.placeComp(doc, 'VCC', 'PWR1', { x: 250, y: 60 });
    const vee = CircuitTemplates.placeComp(doc, 'GND', 'GND1', { x: 250, y: 240 });
    const gnd = CircuitTemplates.placeComp(doc, 'GND', 'GND2', { x: 100, y: 300 });
    // 增加: 输出端电压表
    const voltmeter = CircuitTemplates.placeComp(doc, 'VOLTMETER_DC', 'M1', { x: 450, y: 150 });

    // 网络连接 — UA741 pin IDs: IN+, IN-, OUT, VCC, VEE
    const netInput = CircuitTemplates.addNet(doc, 'SIG_IN', NetType.SIGNAL, [
      CircuitTemplates.pinRef(ri, '1', '1'),
      CircuitTemplates.pinRef(opa, 'IN+', 'IN+'),
    ]);
    CircuitTemplates.addNet(doc, 'FB', NetType.SIGNAL, [
      CircuitTemplates.pinRef(opa, 'IN-', 'IN-'),
      CircuitTemplates.pinRef(rf, '1', '1'),
      CircuitTemplates.pinRef(rg, '1', '1'),
    ]);
    CircuitTemplates.addNet(doc, 'SIG_OUT', NetType.SIGNAL, [
      CircuitTemplates.pinRef(opa, 'OUT', 'OUT'),
      CircuitTemplates.pinRef(rf, '2', '2'),
      CircuitTemplates.pinRef(voltmeter, 'V+', 'V+'),
    ]);
    CircuitTemplates.addNet(doc, 'VCC', NetType.POWER, [
      CircuitTemplates.pinRef(opa, 'VCC', 'VCC'),
      CircuitTemplates.pinRef(vcc, '1', 'VCC'),
    ]);
    CircuitTemplates.addNet(doc, 'GND', NetType.GROUND, [
      CircuitTemplates.pinRef(opa, 'VEE', 'VEE'),
      CircuitTemplates.pinRef(rg, '2', '2'),
      CircuitTemplates.pinRef(voltmeter, 'COM', 'COM'),
      CircuitTemplates.pinRef(vee, '1', 'GND'),
      CircuitTemplates.pinRef(gnd, '1', 'GND'),
    ]);

    // 导线
    const fbNetId = CircuitTemplates.netByName(doc, 'FB');
    const outNetId = CircuitTemplates.netByName(doc, 'SIG_OUT');
    const vccNetId = CircuitTemplates.netByName(doc, 'VCC');
    const gndNetId = CircuitTemplates.netByName(doc, 'GND');
    CircuitTemplates.addWire(doc, netInput,
      CircuitTemplates.pinWorld(ri, '1', '1'),
      CircuitTemplates.pinWorld(opa, 'IN+', 'IN+'));
    CircuitTemplates.addWire(doc, fbNetId,
      CircuitTemplates.pinWorld(opa, 'IN-', 'IN-'),
      CircuitTemplates.pinWorld(rf, '1', '1'),
      CircuitTemplates.pinWorld(rg, '1', '1'));
    CircuitTemplates.addWire(doc, outNetId,
      CircuitTemplates.pinWorld(opa, 'OUT', 'OUT'),
      CircuitTemplates.pinWorld(rf, '2', '2'));
    CircuitTemplates.addWire(doc, vccNetId,
      CircuitTemplates.pinWorld(opa, 'VCC', 'VCC'),
      CircuitTemplates.pinWorld(vcc, '1', 'VCC'));
    CircuitTemplates.addWire(doc, gndNetId,
      CircuitTemplates.pinWorld(opa, 'VEE', 'VEE'),
      CircuitTemplates.pinWorld(gnd, '1', 'GND'));
  }

  // ──────────── lab_filter: RC 低通/高通滤波器 ────────────

  private static buildFilter(doc: SchematicDocument): void {
    // 低通: R_1k 串联 + C_100nF 对地，输出端用 UA741 缓冲
    const opa = CircuitTemplates.placeComp(doc, 'UA741', 'U1', { x: 300, y: 150 });
    const r1 = CircuitTemplates.placeComp(doc, 'R_1k', 'R1', { x: 150, y: 130 });
    const c1 = CircuitTemplates.placeComp(doc, 'C_100nF', 'C1', { x: 230, y: 230 });
    const vcc = CircuitTemplates.placeComp(doc, 'VCC', 'PWR1', { x: 350, y: 60 });
    const gnd1 = CircuitTemplates.placeComp(doc, 'GND', 'GND1', { x: 230, y: 300 });
    const gnd2 = CircuitTemplates.placeComp(doc, 'GND', 'GND2', { x: 350, y: 240 });
    // 增加: 输出端电压表
    const voltmeter = CircuitTemplates.placeComp(doc, 'VOLTMETER_DC', 'M1', { x: 450, y: 150 });

    CircuitTemplates.addNet(doc, 'SIG_IN', NetType.SIGNAL, [
      CircuitTemplates.pinRef(r1, '1', '1'),
    ]);
    CircuitTemplates.addNet(doc, 'SIG_MID', NetType.SIGNAL, [
      CircuitTemplates.pinRef(r1, '2', '2'),
      CircuitTemplates.pinRef(c1, '1', '1'),
      CircuitTemplates.pinRef(opa, 'IN+', 'IN+'),
    ]);
    CircuitTemplates.addNet(doc, 'SIG_OUT', NetType.SIGNAL, [
      CircuitTemplates.pinRef(opa, 'OUT', 'OUT'),
      CircuitTemplates.pinRef(voltmeter, 'V+', 'V+'),
    ]);
    CircuitTemplates.addNet(doc, 'VCC', NetType.POWER, [
      CircuitTemplates.pinRef(opa, 'VCC', 'VCC'),
      CircuitTemplates.pinRef(vcc, '1', 'VCC'),
    ]);
    CircuitTemplates.addNet(doc, 'GND', NetType.GROUND, [
      CircuitTemplates.pinRef(c1, '2', '2'),
      CircuitTemplates.pinRef(opa, 'VEE', 'VEE'),
      CircuitTemplates.pinRef(opa, 'IN-', 'IN-'),
      CircuitTemplates.pinRef(voltmeter, 'COM', 'COM'),
      CircuitTemplates.pinRef(gnd1, '1', 'GND'),
      CircuitTemplates.pinRef(gnd2, '1', 'GND'),
    ]);

    // 导线
    const sigMidId = CircuitTemplates.netByName(doc, 'SIG_MID');
    const sigOutId = CircuitTemplates.netByName(doc, 'SIG_OUT');
    const vccNetId = CircuitTemplates.netByName(doc, 'VCC');
    const gndNetId = CircuitTemplates.netByName(doc, 'GND');
    CircuitTemplates.addWire(doc, CircuitTemplates.netByName(doc, 'SIG_IN'),
      CircuitTemplates.pinWorld(r1, '1', '1'),
      { x: 100, y: 130 });
    CircuitTemplates.addWire(doc, sigMidId,
      CircuitTemplates.pinWorld(r1, '2', '2'),
      CircuitTemplates.pinWorld(opa, 'IN+', 'IN+'),
      CircuitTemplates.pinWorld(c1, '1', '1'));
    CircuitTemplates.addWire(doc, sigOutId,
      CircuitTemplates.pinWorld(opa, 'OUT', 'OUT'),
      CircuitTemplates.pinWorld(voltmeter, 'V+', 'V+'));
    CircuitTemplates.addWire(doc, vccNetId,
      CircuitTemplates.pinWorld(opa, 'VCC', 'VCC'),
      CircuitTemplates.pinWorld(vcc, '1', 'VCC'));
    CircuitTemplates.addWire(doc, gndNetId,
      CircuitTemplates.pinWorld(opa, 'VEE', 'VEE'),
      CircuitTemplates.pinWorld(gnd2, '1', 'GND'));
    CircuitTemplates.addWire(doc, gndNetId,
      CircuitTemplates.pinWorld(c1, '2', '2'),
      CircuitTemplates.pinWorld(gnd1, '1', 'GND'));
    CircuitTemplates.addWire(doc, gndNetId,
      CircuitTemplates.pinWorld(voltmeter, 'COM', 'COM'),
      CircuitTemplates.pinWorld(gnd1, '1', 'GND'));
  }

  // ──────────── lab_51_led: 51流水灯 ────────────

  private static build51Led(doc: SchematicDocument): void {
    const mcu = CircuitTemplates.placeComp(doc, 'AT89C51', 'U1', { x: 200, y: 150 });
    const xtal = CircuitTemplates.placeComp(doc, 'XTAL_11M', 'Y1', { x: 80, y: 50 });
    const c1 = CircuitTemplates.placeComp(doc, 'C_100nF', 'C1', { x: 60, y: 90 });
    const c2 = CircuitTemplates.placeComp(doc, 'C_100nF', 'C2', { x: 60, y: 30 });
    const cDecouple = CircuitTemplates.placeComp(doc, 'C_100nF', 'C3', { x: 280, y: 260 });
    const rRst = CircuitTemplates.placeComp(doc, 'R_10k', 'R1', { x: 120, y: 220 });
    const vcc = CircuitTemplates.placeComp(doc, 'VCC', 'PWR1', { x: 50, y: 100 });
    const gnd = CircuitTemplates.placeComp(doc, 'GND', 'GND1', { x: 50, y: 320 });
    // 增加: EA直接接VCC (内部ROM), 电源指示灯, 电压表
    const ledPwr = CircuitTemplates.placeComp(doc, 'LED_GREEN', 'D9', { x: 350, y: 100 });
    const rLedPwr = CircuitTemplates.placeComp(doc, 'R_1k', 'R_PWR', { x: 350, y: 160 });
    const voltmeter = CircuitTemplates.placeComp(doc, 'VOLTMETER_DC', 'M1', { x: 420, y: 260 });

    // 8 个 LED + 限流电阻
    const leds: ComponentInstance[] = [];
    const ledResistors: ComponentInstance[] = [];
    for (let i = 0; i < 8; i++) {
      const rx = 400 + i * 40;
      leds.push(CircuitTemplates.placeComp(doc, 'LED_RED', `D${i + 1}`, { x: rx, y: 240 }));
      ledResistors.push(CircuitTemplates.placeComp(doc, 'R_330', `RL${i + 1}`, { x: rx, y: 180 }));
    }

    // 网络 — 每个 LED 通过限流电阻连接到 P1 端口
    for (let i = 0; i < 8; i++) {
      // AT89C51 P1 端口: genMcuPins(40), left has P1-P20, right has P21-P40
      // 使用 P1-P8 (左侧引脚 1-8) 作为 LED 输出
      const pinId = `P${i + 1}`;
      CircuitTemplates.addNet(doc, `LED${i}`, NetType.SIGNAL, [
        CircuitTemplates.pinRef(mcu, pinId, pinId),
        CircuitTemplates.pinRef(ledResistors[i], '1', '1'),
      ]);
      CircuitTemplates.addNet(doc, `LED${i}_OUT`, NetType.SIGNAL, [
        CircuitTemplates.pinRef(ledResistors[i], '2', '2'),
        CircuitTemplates.pinRef(leds[i], 'A', 'A'),
      ]);
      CircuitTemplates.addNet(doc, 'GND', NetType.GROUND, [
        CircuitTemplates.pinRef(leds[i], 'K', 'K'),
      ]);
    }

    // 晶振网络: AT89C51 P18, P19 用于 XTAL (通常 18=XTAL1, 19=XTAL2)
    CircuitTemplates.addNet(doc, 'XTAL1', NetType.SIGNAL, [
      CircuitTemplates.pinRef(mcu, 'P18', 'P18'),
      CircuitTemplates.pinRef(xtal, '1', '1'),
      CircuitTemplates.pinRef(c1, '1', '1'),
    ]);
    CircuitTemplates.addNet(doc, 'XTAL2', NetType.SIGNAL, [
      CircuitTemplates.pinRef(mcu, 'P19', 'P19'),
      CircuitTemplates.pinRef(xtal, '2', '2'),
      CircuitTemplates.pinRef(c2, '1', '1'),
    ]);

    // 复位: P9 (RST) 通过 R_10k 上拉到 VCC
    CircuitTemplates.addNet(doc, 'RST', NetType.SIGNAL, [
      CircuitTemplates.pinRef(mcu, 'P9', 'P9'),
      CircuitTemplates.pinRef(rRst, '1', '1'),
    ]);
    // VCC: 包含 EA (P31) 上拉, 电源 LED, 电压表
    CircuitTemplates.addNet(doc, 'VCC', NetType.POWER, [
      CircuitTemplates.pinRef(mcu, 'P40', 'P40'),
      CircuitTemplates.pinRef(mcu, 'P31', 'P31'), // EA 接 VCC
      CircuitTemplates.pinRef(rRst, '2', '2'),
      CircuitTemplates.pinRef(cDecouple, '1', '1'),
      CircuitTemplates.pinRef(rLedPwr, '1', '1'),
      CircuitTemplates.pinRef(voltmeter, 'V+', 'V+'),
      CircuitTemplates.pinRef(vcc, '1', 'VCC'),
    ]);
    CircuitTemplates.addNet(doc, 'GND', NetType.GROUND, [
      CircuitTemplates.pinRef(mcu, 'P20', 'P20'),
      CircuitTemplates.pinRef(c1, '2', '2'),
      CircuitTemplates.pinRef(c2, '2', '2'),
      CircuitTemplates.pinRef(cDecouple, '2', '2'),
      CircuitTemplates.pinRef(ledPwr, 'K', 'K'),
      CircuitTemplates.pinRef(voltmeter, 'COM', 'COM'),
      CircuitTemplates.pinRef(gnd, '1', 'GND'),
    ]);

    // === 导线路由 ===
    const xtal1Id = CircuitTemplates.netByName(doc, 'XTAL1');
    const xtal2Id = CircuitTemplates.netByName(doc, 'XTAL2');
    const rstId = CircuitTemplates.netByName(doc, 'RST');
    const vccNetId = CircuitTemplates.netByName(doc, 'VCC');
    const gndNetId = CircuitTemplates.netByName(doc, 'GND');

    // 晶振连接
    CircuitTemplates.addWire(doc, xtal1Id,
      CircuitTemplates.pinWorld(mcu, 'P18', 'P18'),
      CircuitTemplates.pinWorld(xtal, '1', '1'),
      CircuitTemplates.pinWorld(c1, '1', '1'));
    CircuitTemplates.addWire(doc, xtal2Id,
      CircuitTemplates.pinWorld(mcu, 'P19', 'P19'),
      CircuitTemplates.pinWorld(xtal, '2', '2'),
      CircuitTemplates.pinWorld(c2, '1', '1'));

    // 复位 + 电源
    CircuitTemplates.addWire(doc, rstId,
      CircuitTemplates.pinWorld(mcu, 'P9', 'P9'),
      CircuitTemplates.pinWorld(rRst, '1', '1'));
    CircuitTemplates.addWire(doc, vccNetId,
      CircuitTemplates.pinWorld(vcc, '1', 'VCC'),
      CircuitTemplates.pinWorld(mcu, 'P40', 'P40'),
      CircuitTemplates.pinWorld(mcu, 'P31', 'P31'),
      CircuitTemplates.pinWorld(rRst, '2', '2'),
      CircuitTemplates.pinWorld(cDecouple, '1', '1'),
      CircuitTemplates.pinWorld(rLedPwr, '1', '1'),
      CircuitTemplates.pinWorld(voltmeter, 'V+', 'V+'));

    // GND
    CircuitTemplates.addWire(doc, gndNetId,
      CircuitTemplates.pinWorld(mcu, 'P20', 'P20'),
      CircuitTemplates.pinWorld(c1, '2', '2'),
      CircuitTemplates.pinWorld(c2, '2', '2'),
      CircuitTemplates.pinWorld(cDecouple, '2', '2'),
      CircuitTemplates.pinWorld(ledPwr, 'K', 'K'),
      CircuitTemplates.pinWorld(voltmeter, 'COM', 'COM'),
      CircuitTemplates.pinWorld(gnd, '1', 'GND'));

    // 电源 LED 分支: R_PWR pin2 → LED_GREEN anode
    CircuitTemplates.addNet(doc, 'PWR_LED', NetType.SIGNAL, [
      CircuitTemplates.pinRef(rLedPwr, '2', '2'),
      CircuitTemplates.pinRef(ledPwr, 'A', 'A'),
    ]);
    const pwrLedId = CircuitTemplates.netByName(doc, 'PWR_LED');
    CircuitTemplates.addWire(doc, pwrLedId,
      CircuitTemplates.pinWorld(rLedPwr, '2', '2'),
      CircuitTemplates.pinWorld(ledPwr, 'A', 'A'));

    // LED 导线 (每个 LED 的电阻 → LED 阳极，从 MCU 引脚到电阻)
    for (let i = 0; i < 8; i++) {
      const pinId = `P${i + 1}`;
      const ledNetId = CircuitTemplates.netByName(doc, `LED${i}`);
      const ledOutNetId = CircuitTemplates.netByName(doc, `LED${i}_OUT`);
      CircuitTemplates.addWire(doc, ledNetId,
        CircuitTemplates.pinWorld(mcu, pinId, pinId),
        CircuitTemplates.pinWorld(ledResistors[i], '1', '1'));
      CircuitTemplates.addWire(doc, ledOutNetId,
        CircuitTemplates.pinWorld(ledResistors[i], '2', '2'),
        CircuitTemplates.pinWorld(leds[i], 'A', 'A'));
    }
  }

  // ──────────── lab_uart: STM32 UART 实验 ────────────

  private static buildUart(doc: SchematicDocument): void {
    const mcu = CircuitTemplates.placeComp(doc, 'STM32F103C8', 'U1', { x: 200, y: 150 });
    const xtal = CircuitTemplates.placeComp(doc, 'XTAL_8M', 'Y1', { x: 80, y: 50 });
    const c1 = CircuitTemplates.placeComp(doc, 'C_100nF', 'C1', { x: 60, y: 90 });
    const c2 = CircuitTemplates.placeComp(doc, 'C_100nF', 'C2', { x: 60, y: 30 });
    const cDecouple = CircuitTemplates.placeComp(doc, 'C_100nF', 'C3', { x: 280, y: 280 });
    const rRst = CircuitTemplates.placeComp(doc, 'R_10k', 'R1', { x: 120, y: 220 });
    const uart = CircuitTemplates.placeComp(doc, 'UART_TERMINAL', 'TERM1', { x: 450, y: 150 });
    const vcc = CircuitTemplates.placeComp(doc, 'VCC', 'PWR1', { x: 50, y: 100 });
    const gnd = CircuitTemplates.placeComp(doc, 'GND', 'GND1', { x: 50, y: 320 });
    // 增加: 电源 LED, 电压表
    const ledPwr = CircuitTemplates.placeComp(doc, 'LED_GREEN', 'D1', { x: 350, y: 100 });
    const rLedPwr = CircuitTemplates.placeComp(doc, 'R_1k', 'R_PWR', { x: 350, y: 160 });
    const voltmeter = CircuitTemplates.placeComp(doc, 'VOLTMETER_DC', 'M1', { x: 420, y: 260 });

    // 网络
    // STM32 genMcuPins(48): P1-P24 left, P25-P48 right
    // 使用 P10 (USART1_TX) 和 P11 (USART1_RX) 作为 UART
    CircuitTemplates.addNet(doc, 'UART_TX', NetType.SIGNAL, [
      CircuitTemplates.pinRef(mcu, 'P10', 'P10'),
      CircuitTemplates.pinRef(uart, 'TX', 'TX'),
    ]);
    CircuitTemplates.addNet(doc, 'UART_RX', NetType.SIGNAL, [
      CircuitTemplates.pinRef(mcu, 'P11', 'P11'),
      CircuitTemplates.pinRef(uart, 'RX', 'RX'),
    ]);

    // 晶振: P5 (OSC_IN) 和 P6 (OSC_OUT)
    CircuitTemplates.addNet(doc, 'OSC_IN', NetType.SIGNAL, [
      CircuitTemplates.pinRef(mcu, 'P5', 'P5'),
      CircuitTemplates.pinRef(xtal, '1', '1'),
      CircuitTemplates.pinRef(c1, '1', '1'),
    ]);
    CircuitTemplates.addNet(doc, 'OSC_OUT', NetType.SIGNAL, [
      CircuitTemplates.pinRef(mcu, 'P6', 'P6'),
      CircuitTemplates.pinRef(xtal, '2', '2'),
      CircuitTemplates.pinRef(c2, '1', '1'),
    ]);

    // 复位 P7 (NRST) + 电源
    CircuitTemplates.addNet(doc, 'NRST', NetType.SIGNAL, [
      CircuitTemplates.pinRef(mcu, 'P7', 'P7'),
      CircuitTemplates.pinRef(rRst, '1', '1'),
    ]);
    CircuitTemplates.addNet(doc, 'VCC', NetType.POWER, [
      CircuitTemplates.pinRef(mcu, 'P48', 'P48'),
      CircuitTemplates.pinRef(rRst, '2', '2'),
      CircuitTemplates.pinRef(cDecouple, '1', '1'),
      CircuitTemplates.pinRef(rLedPwr, '1', '1'),
      CircuitTemplates.pinRef(voltmeter, 'V+', 'V+'),
      CircuitTemplates.pinRef(vcc, '1', 'VCC'),
    ]);
    CircuitTemplates.addNet(doc, 'GND', NetType.GROUND, [
      CircuitTemplates.pinRef(mcu, 'P24', 'P24'),
      CircuitTemplates.pinRef(c1, '2', '2'),
      CircuitTemplates.pinRef(c2, '2', '2'),
      CircuitTemplates.pinRef(cDecouple, '2', '2'),
      CircuitTemplates.pinRef(uart, 'GND', 'GND'),
      CircuitTemplates.pinRef(ledPwr, 'K', 'K'),
      CircuitTemplates.pinRef(voltmeter, 'COM', 'COM'),
      CircuitTemplates.pinRef(gnd, '1', 'GND'),
    ]);

    // === 导线 ===
    const uartTxId = CircuitTemplates.netByName(doc, 'UART_TX');
    const uartRxId = CircuitTemplates.netByName(doc, 'UART_RX');
    const oscInId = CircuitTemplates.netByName(doc, 'OSC_IN');
    const oscOutId = CircuitTemplates.netByName(doc, 'OSC_OUT');
    const nrstId = CircuitTemplates.netByName(doc, 'NRST');
    const vccNetId = CircuitTemplates.netByName(doc, 'VCC');
    const gndNetId = CircuitTemplates.netByName(doc, 'GND');

    // UART
    CircuitTemplates.addWire(doc, uartTxId,
      CircuitTemplates.pinWorld(mcu, 'P10', 'P10'),
      CircuitTemplates.pinWorld(uart, 'TX', 'TX'));
    CircuitTemplates.addWire(doc, uartRxId,
      CircuitTemplates.pinWorld(mcu, 'P11', 'P11'),
      CircuitTemplates.pinWorld(uart, 'RX', 'RX'));

    // 晶振
    CircuitTemplates.addWire(doc, oscInId,
      CircuitTemplates.pinWorld(mcu, 'P5', 'P5'),
      CircuitTemplates.pinWorld(xtal, '1', '1'),
      CircuitTemplates.pinWorld(c1, '1', '1'));
    CircuitTemplates.addWire(doc, oscOutId,
      CircuitTemplates.pinWorld(mcu, 'P6', 'P6'),
      CircuitTemplates.pinWorld(xtal, '2', '2'),
      CircuitTemplates.pinWorld(c2, '1', '1'));

    // 复位 + 电源
    CircuitTemplates.addWire(doc, nrstId,
      CircuitTemplates.pinWorld(mcu, 'P7', 'P7'),
      CircuitTemplates.pinWorld(rRst, '1', '1'));
    CircuitTemplates.addWire(doc, vccNetId,
      CircuitTemplates.pinWorld(vcc, '1', 'VCC'),
      CircuitTemplates.pinWorld(mcu, 'P48', 'P48'),
      CircuitTemplates.pinWorld(rRst, '2', '2'),
      CircuitTemplates.pinWorld(cDecouple, '1', '1'),
      CircuitTemplates.pinWorld(rLedPwr, '1', '1'),
      CircuitTemplates.pinWorld(voltmeter, 'V+', 'V+'));

    // GND
    CircuitTemplates.addWire(doc, gndNetId,
      CircuitTemplates.pinWorld(mcu, 'P24', 'P24'),
      CircuitTemplates.pinWorld(cDecouple, '2', '2'),
      CircuitTemplates.pinWorld(ledPwr, 'K', 'K'),
      CircuitTemplates.pinWorld(voltmeter, 'COM', 'COM'),
      CircuitTemplates.pinWorld(gnd, '1', 'GND'));

    // 电源 LED 分支: R_PWR pin2 → LED_GREEN anode
    CircuitTemplates.addNet(doc, 'PWR_LED', NetType.SIGNAL, [
      CircuitTemplates.pinRef(rLedPwr, '2', '2'),
      CircuitTemplates.pinRef(ledPwr, 'A', 'A'),
    ]);
    const pwrLedId = CircuitTemplates.netByName(doc, 'PWR_LED');
    CircuitTemplates.addWire(doc, pwrLedId,
      CircuitTemplates.pinWorld(rLedPwr, '2', '2'),
      CircuitTemplates.pinWorld(ledPwr, 'A', 'A'));
  }

  // ──────────── STM32 最小系统（通用/向后兼容） ────────────

  private static buildStm32Minimal(doc: SchematicDocument, hasLed: boolean,
    hasKey: boolean, hasLcd: boolean): void {
    const mcu = CircuitTemplates.placeComp(doc, 'STM32F103C8', 'U1', { x: 200, y: 150 });
    CircuitTemplates.placeComp(doc, 'XTAL_8M', 'Y1', { x: 80, y: 50 });
    CircuitTemplates.placeComp(doc, 'C_100nF', 'C1', { x: 60, y: 90 });
    CircuitTemplates.placeComp(doc, 'C_100nF', 'C2', { x: 60, y: 30 });
    CircuitTemplates.placeComp(doc, 'C_10uF', 'C3', { x: 330, y: 80 });
    CircuitTemplates.placeComp(doc, 'R_10k', 'R1', { x: 120, y: 220 });
    const vcc = CircuitTemplates.placeComp(doc, 'VCC', 'PWR1', { x: 50, y: 100 });
    const gnd = CircuitTemplates.placeComp(doc, 'GND', 'GND1', { x: 50, y: 320 });
    // 增加: 电压表
    const voltmeter = CircuitTemplates.placeComp(doc, 'VOLTMETER_DC', 'M1', { x: 420, y: 260 });

    // 晶振网络
    CircuitTemplates.addNet(doc, 'OSC_IN', NetType.SIGNAL, [
      CircuitTemplates.pinRef(mcu, 'P5', 'P5'),
    ]);
    CircuitTemplates.addNet(doc, 'OSC_OUT', NetType.SIGNAL, [
      CircuitTemplates.pinRef(mcu, 'P6', 'P6'),
    ]);

    // 复位 + 电源
    CircuitTemplates.addNet(doc, 'NRST', NetType.SIGNAL, [
      CircuitTemplates.pinRef(mcu, 'P7', 'P7'),
    ]);
    CircuitTemplates.addNet(doc, 'VCC', NetType.POWER, [
      CircuitTemplates.pinRef(mcu, 'P48', 'P48'),
      CircuitTemplates.pinRef(voltmeter, 'V+', 'V+'),
      CircuitTemplates.pinRef(vcc, '1', 'VCC'),
    ]);
    CircuitTemplates.addNet(doc, 'GND', NetType.GROUND, [
      CircuitTemplates.pinRef(mcu, 'P24', 'P24'),
      CircuitTemplates.pinRef(voltmeter, 'COM', 'COM'),
      CircuitTemplates.pinRef(gnd, '1', 'GND'),
    ]);

    // VCC/GND 导线
    const vccNetId = CircuitTemplates.netByName(doc, 'VCC');
    const gndNetId = CircuitTemplates.netByName(doc, 'GND');
    CircuitTemplates.addWire(doc, vccNetId,
      CircuitTemplates.pinWorld(vcc, '1', 'VCC'),
      CircuitTemplates.pinWorld(mcu, 'P48', 'P48'),
      CircuitTemplates.pinWorld(voltmeter, 'V+', 'V+'));
    CircuitTemplates.addWire(doc, gndNetId,
      CircuitTemplates.pinWorld(mcu, 'P24', 'P24'),
      CircuitTemplates.pinWorld(voltmeter, 'COM', 'COM'),
      CircuitTemplates.pinWorld(gnd, '1', 'GND'));

    // 可选外设
    if (hasLed) {
      const led = CircuitTemplates.placeComp(doc, 'LED_RED', 'D1', { x: 450, y: 240 });
      const r = CircuitTemplates.placeComp(doc, 'R_330', 'RL1', { x: 450, y: 180 });
      CircuitTemplates.addNet(doc, 'USER_LED', NetType.SIGNAL, [
        CircuitTemplates.pinRef(mcu, 'P1', 'P1'),
        CircuitTemplates.pinRef(r, '1', '1'),
      ]);
      CircuitTemplates.addNet(doc, 'LED_OUT', NetType.SIGNAL, [
        CircuitTemplates.pinRef(r, '2', '2'),
        CircuitTemplates.pinRef(led, 'A', 'A'),
      ]);
      CircuitTemplates.addNet(doc, 'GND', NetType.GROUND, [
        CircuitTemplates.pinRef(led, 'K', 'K'),
      ]);
      const userLedId = CircuitTemplates.netByName(doc, 'USER_LED');
      const ledOutId = CircuitTemplates.netByName(doc, 'LED_OUT');
      CircuitTemplates.addWire(doc, userLedId,
        CircuitTemplates.pinWorld(mcu, 'P1', 'P1'),
        CircuitTemplates.pinWorld(r, '1', '1'));
      CircuitTemplates.addWire(doc, ledOutId,
        CircuitTemplates.pinWorld(r, '2', '2'),
        CircuitTemplates.pinWorld(led, 'A', 'A'));
    }

    if (hasKey) {
      const sw = CircuitTemplates.placeComp(doc, 'SW_PUSH', 'SW1', { x: 450, y: 300 });
      const r = CircuitTemplates.placeComp(doc, 'R_10k', 'R3', { x: 350, y: 300 });
      CircuitTemplates.addNet(doc, 'KEY_IN', NetType.SIGNAL, [
        CircuitTemplates.pinRef(mcu, 'P2', 'P2'),
        CircuitTemplates.pinRef(sw, '1', '1'),
        CircuitTemplates.pinRef(r, '1', '1'),
      ]);
      CircuitTemplates.addNet(doc, 'VCC', NetType.POWER, [
        CircuitTemplates.pinRef(r, '2', '2'),
      ]);
      CircuitTemplates.addNet(doc, 'GND', NetType.GROUND, [
        CircuitTemplates.pinRef(sw, '2', '2'),
      ]);
      const keyInId = CircuitTemplates.netByName(doc, 'KEY_IN');
      CircuitTemplates.addWire(doc, keyInId,
        CircuitTemplates.pinWorld(mcu, 'P2', 'P2'),
        CircuitTemplates.pinWorld(r, '1', '1'),
        CircuitTemplates.pinWorld(sw, '1', '1'));
    }

    if (hasLcd) {
      const lcd = CircuitTemplates.placeComp(doc, 'LCD1602', 'LCD1', { x: 500, y: 100 });
      // LCD1602 genPins(16): left pins 1-8, right pins 9-16
      // 连接数据引脚到 MCU P9-P16
      for (let i = 0; i < 8; i++) {
        const mcPin = `P${9 + i}`;
        const lcdPin = `${7 + i}`; // LCD D0-D7 on pins 7-14
        CircuitTemplates.addNet(doc, `LCD_D${i}`, NetType.SIGNAL, [
          CircuitTemplates.pinRef(mcu, mcPin, mcPin),
          CircuitTemplates.pinRef(lcd, lcdPin, lcdPin),
        ]);
        const lcdDataId = CircuitTemplates.netByName(doc, `LCD_D${i}`);
        CircuitTemplates.addWire(doc, lcdDataId,
          CircuitTemplates.pinWorld(mcu, mcPin, mcPin),
          CircuitTemplates.pinWorld(lcd, lcdPin, lcdPin));
      }
      // LCD RS(pin 4), RW(pin 5), E(pin 6)
      CircuitTemplates.addNet(doc, 'LCD_RS', NetType.SIGNAL, [
        CircuitTemplates.pinRef(mcu, 'P17', 'P17'),
        CircuitTemplates.pinRef(lcd, '4', '4'),
      ]);
      CircuitTemplates.addNet(doc, 'LCD_E', NetType.SIGNAL, [
        CircuitTemplates.pinRef(mcu, 'P18', 'P18'),
        CircuitTemplates.pinRef(lcd, '6', '6'),
      ]);
      // LCD VCC(pin 2), GND(pin 1), V0(pin 3 via contrast pot)
      CircuitTemplates.addNet(doc, 'VCC', NetType.POWER, [
        CircuitTemplates.pinRef(lcd, '2', '2'),
      ]);
      CircuitTemplates.addNet(doc, 'GND', NetType.GROUND, [
        CircuitTemplates.pinRef(lcd, '1', '1'),
        CircuitTemplates.pinRef(lcd, '5', '5'),
      ]);
      const lcdRsId = CircuitTemplates.netByName(doc, 'LCD_RS');
      const lcdEId = CircuitTemplates.netByName(doc, 'LCD_E');
      CircuitTemplates.addWire(doc, lcdRsId,
        CircuitTemplates.pinWorld(mcu, 'P17', 'P17'),
        CircuitTemplates.pinWorld(lcd, '4', '4'));
      CircuitTemplates.addWire(doc, lcdEId,
        CircuitTemplates.pinWorld(mcu, 'P18', 'P18'),
        CircuitTemplates.pinWorld(lcd, '6', '6'));
    }
  }

  // ════════════════════════ 基础设施辅助方法 ════════════════════════

  private static placeComp(doc: SchematicDocument, libraryId: string,
    refDes: string, pos: Point2D): ComponentInstance {
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

  private static addNet(doc: SchematicDocument, name: string, type: NetType,
    pinRefs: string[]): string {
    // 检查是否已存在同名网络
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

  private static netByName(doc: SchematicDocument, name: string): string {
    const net = doc.nets.find(n => n.name === name);
    return net ? net.id : name;
  }

  private static addWire(doc: SchematicDocument, netId: string, ...pts: Point2D[]): void {
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

  private static pinRef(c: ComponentInstance, pinId: string, pinName: string): string {
    return `${c.id}:${pinId}:${pinName}`;
  }

  private static pinWorld(c: ComponentInstance, pinId: string,
    pinName: string): Point2D {
    const local = CircuitTemplates.pinOffset(c.libraryId, pinId, pinName);
    return { x: c.position.x + local.x, y: c.position.y + local.y };
  }

  // ──────────── 元器件引脚偏移表（基于 BuiltinComponents 定义） ────────────

  private static pinOffset(libraryId: string, pinId: string,
    _pinName: string): Point2D {
    // 两脚无源器件 (R, C, XTAL, FUSE, inductor)
    if (libraryId.startsWith('R_') || libraryId.startsWith('C_') ||
      libraryId.startsWith('XTAL_') || libraryId.startsWith('L_') ||
      libraryId.startsWith('FUSE_')) {
      return pinId === '1' ? { x: -30, y: 0 } : { x: 30, y: 0 };
    }
    // LED / 二极管
    if (libraryId.startsWith('LED_')) {
      return pinId === 'A' ? { x: -30, y: 0 } : { x: 30, y: 0 };
    }
    if (libraryId === '1N4148' || libraryId === '1N4007' || libraryId === '1N5819') {
      return pinId === 'A' ? { x: -30, y: 0 } : { x: 30, y: 0 };
    }
    // 开关
    if (libraryId === 'SW_PUSH') {
      return pinId === '1' ? { x: -30, y: 0 } : { x: 30, y: 0 };
    }
    // 电源符号
    if (libraryId === 'VCC') {
      return { x: 0, y: 10 }; // VCC pin points up
    }
    if (libraryId === 'GND') {
      return { x: 0, y: -10 }; // GND pin points down
    }
    // UA741 单运放 — pin IDs: 'IN+', 'IN-', 'OUT', 'VCC', 'VEE'
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
    // LM358 双运放 — pin IDs: 'IN+1', 'IN-1', 'OUT1', 'IN+2', 'IN-2', 'OUT2', 'V+', 'V-'
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
    // LM7805/LM7812 三端稳压 (genPins 3, IDs='1','2','3')
    if (libraryId === 'LM7805' || libraryId === 'LM7812') {
      if (pinId === '1') return { x: -40, y: -10 };
      if (pinId === '2') return { x: -40, y: 0 };
      if (pinId === '3') return { x: 40, y: -10 };
      return { x: 0, y: 0 };
    }
    // AMS1117 LDO (genPins 3, IDs='1','2','3')
    if (libraryId === 'AMS1117_3V3') {
      if (pinId === '1') return { x: -40, y: -10 };
      if (pinId === '2') return { x: -40, y: 0 };
      if (pinId === '3') return { x: 40, y: -10 };
      return { x: 0, y: 0 };
    }
    // STM32 (genMcuPins, IDs='P1'..'P{N}')
    if (libraryId.startsWith('STM32')) {
      const pinCount = libraryId.includes('F407') ? 100 : 48;
      return CircuitTemplates.mcuPinOffset(pinCount, pinId);
    }
    // 8051 (genMcuPins 40, IDs='P1'..'P40')
    if (libraryId === 'AT89C51' || libraryId === 'AT89C52' ||
      libraryId.startsWith('STC')) {
      return CircuitTemplates.mcuPinOffset(40, pinId);
    }
    // 仪器仪表组件
    if (libraryId === 'VOLTMETER_DC') {
      if (pinId === 'V+') return { x: -30, y: -10 };
      if (pinId === 'COM') return { x: -30, y: 10 };
      return { x: 0, y: 0 };
    }
    if (libraryId === 'AMMETER_DC') {
      if (pinId === 'I+') return { x: -30, y: 0 };
      if (pinId === 'I-') return { x: -30, y: 20 };
      return { x: 0, y: 0 };
    }
    if (libraryId === 'VIRTUAL_METER') {
      if (pinId === 'V') return { x: -30, y: -10 };
      if (pinId === 'COM') return { x: -30, y: 10 };
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
    // UART_TERMINAL — pin IDs: 'TX', 'RX', 'GND'
    if (libraryId === 'UART_TERMINAL') {
      if (pinId === 'TX') return { x: -40, y: -10 };
      if (pinId === 'RX') return { x: -40, y: 10 };
      if (pinId === 'GND') return { x: -40, y: 30 };
      return { x: 0, y: 0 };
    }
    // LCD1602 (genPins 16)
    if (libraryId === 'LCD1602') {
      return CircuitTemplates.genPinOffset(16, pinId);
    }
    // 通用 genPins / genMcuPins 兜底
    // 尝试解析为数字 pin ID
    const pinNum = parseInt(pinId);
    if (!isNaN(pinNum)) {
      // 假设是 genPins 类型的 16 脚 IC
      return CircuitTemplates.genPinOffset(16, pinId);
    }
    // 尝试解析 Pn 格式 (MCU)
    if (pinId.startsWith('P')) {
      const n = parseInt(pinId.substring(1));
      if (!isNaN(n)) {
        return CircuitTemplates.mcuPinOffset(48, pinId);
      }
    }
    return { x: 0, y: 0 };
  }

  /** genPins: left side pins half, right side half, spacing 10 */
  private static genPinOffset(count: number, pinId: string): Point2D {
    const pinNum = parseInt(pinId);
    const leftCount = Math.ceil(count / 2);
    const bodyHalf = leftCount * 10 / 2; // = leftCount * 5
    const idx = pinNum - 1; // 0-indexed
    if (idx < leftCount) {
      return { x: -40, y: idx * 10 - bodyHalf };
    } else {
      const rightIdx = idx - leftCount;
      return { x: 40, y: rightIdx * 10 - bodyHalf };
    }
  }

  /** genMcuPins: same as genPins but x = ±50 */
  private static mcuPinOffset(count: number, pinId: string): Point2D {
    const n = parseInt(pinId.substring(1)); // strip 'P' prefix
    const leftCount = Math.ceil(count / 2);
    const bodyHalf = leftCount * 10 / 2;
    const idx = n - 1;
    if (idx < leftCount) {
      return { x: -50, y: idx * 10 - bodyHalf };
    } else {
      const rightIdx = idx - leftCount;
      return { x: 50, y: rightIdx * 10 - bodyHalf };
    }
  }
}
