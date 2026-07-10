/**
 * 实验模板电路构建器 — 每个模板器件完整、连线正确、可仿真
 */
import { SchematicDocument, ComponentInstance, NetType } from 'common';
import { TemplateSchematicKit as K } from './TemplateSchematicKit';

const R = (doc: SchematicDocument, id: string, ref: string, x: number, y: number) =>
  K.place(doc, id, ref, { x: x, y: y });
const C = (doc: SchematicDocument, id: string, ref: string, x: number, y: number) =>
  K.place(doc, id, ref, { x: x, y: y });

/** lab_power: LM7805 稳压 + 滤波 + 负载测量 */
export function buildLabPower(doc: SchematicDocument): void {
  const reg = K.place(doc, 'LM7805', 'U1', { x: 220, y: 180 });
  const cin = K.place(doc, 'C_100uF', 'C1', { x: 100, y: 180 });
  const cout = K.place(doc, 'C_10uF', 'C2', { x: 340, y: 180 });
  const fuse = K.place(doc, 'FUSE_1A', 'F1', { x: 50, y: 180 });
  const rLoad = K.place(doc, 'R_10k', 'R1', { x: 440, y: 180 });
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 50, y: 100 });
  const gnd1 = K.place(doc, 'GND', 'GND1', { x: 220, y: 300 });
  const gnd2 = K.place(doc, 'GND', 'GND2', { x: 440, y: 300 });
  const vm = K.place(doc, 'VOLTMETER_DC', 'M1', { x: 440, y: 100 });

  K.join(doc, 'VIN', NetType.SIGNAL, [
    { comp: vcc, pinId: '1', pinName: 'VCC' },
    { comp: fuse, pinId: '1', pinName: '1' }
  ]);
  K.series2(doc, 'REG_IN',
    { comp: fuse, pinId: '2', pinName: '2' },
    { comp: cin, pinId: '1', pinName: '1' });
  K.join(doc, 'REG_IN', NetType.SIGNAL, [
    { comp: cin, pinId: '1', pinName: '1' },
    { comp: reg, pinId: '1', pinName: '1' }
  ]);
  K.join(doc, 'VOUT', NetType.POWER, [
    { comp: reg, pinId: '3', pinName: '3' },
    { comp: cout, pinId: '1', pinName: '1' },
    { comp: rLoad, pinId: '1', pinName: '1' },
    { comp: vm, pinId: 'V+', pinName: 'V+' }
  ]);
  K.join(doc, 'GND', NetType.GROUND, [
    { comp: reg, pinId: '2', pinName: '2' },
    { comp: cin, pinId: '2', pinName: '2' },
    { comp: cout, pinId: '2', pinName: '2' },
    { comp: rLoad, pinId: '2', pinName: '2' },
    { comp: vm, pinId: 'COM', pinName: 'COM' },
    { comp: gnd1, pinId: '1', pinName: 'GND' },
    { comp: gnd2, pinId: '1', pinName: 'GND' }
  ]);
}

/** lab_amp: LM358 同相放大 (MNA 可仿真) */
export function buildLabAmp(doc: SchematicDocument): void {
  const opa = K.place(doc, 'LM358', 'U1', { x: 260, y: 180 });
  const ri = R(doc, 'R_10k', 'R1', 120, 160);
  const rf = R(doc, 'R_100k', 'Rf', 260, 80);
  const rg = R(doc, 'R_10k', 'Rg', 180, 280);
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 260, y: 60 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 180, y: 340 });
  const vm = K.place(doc, 'VOLTMETER_DC', 'M1', { x: 420, y: 180 });

  K.join(doc, 'SIG_IN', NetType.SIGNAL, [
    { comp: ri, pinId: '1', pinName: '1' },
    { comp: opa, pinId: 'IN+1', pinName: 'IN+1' }
  ]);
  K.join(doc, 'FB', NetType.SIGNAL, [
    { comp: opa, pinId: 'IN-1', pinName: 'IN-1' },
    { comp: rf, pinId: '1', pinName: '1' },
    { comp: rg, pinId: '1', pinName: '1' }
  ]);
  K.join(doc, 'SIG_OUT', NetType.SIGNAL, [
    { comp: opa, pinId: 'OUT1', pinName: 'OUT1' },
    { comp: rf, pinId: '2', pinName: '2' },
    { comp: vm, pinId: 'V+', pinName: 'V+' }
  ]);
  K.join(doc, 'VCC', NetType.POWER, [
    { comp: opa, pinId: 'V+', pinName: 'V+' },
    { comp: vcc, pinId: '1', pinName: 'VCC' }
  ]);
  K.join(doc, 'GND', NetType.GROUND, [
    { comp: opa, pinId: 'V-', pinName: 'V-' },
    { comp: rg, pinId: '2', pinName: '2' },
    { comp: vm, pinId: 'COM', pinName: 'COM' },
    { comp: gnd, pinId: '1', pinName: 'GND' }
  ]);
}

/** lab_filter: RC 低通 + LM358 缓冲 */
export function buildLabFilter(doc: SchematicDocument): void {
  const opa = K.place(doc, 'LM358', 'U1', { x: 320, y: 180 });
  const r1 = R(doc, 'R_1k', 'R1', 140, 160);
  const c1 = C(doc, 'C_100nF', 'C1', 240, 280);
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 320, y: 60 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 240, y: 360 });
  const vm = K.place(doc, 'VOLTMETER_DC', 'M1', { x: 460, y: 180 });

  K.join(doc, 'SIG_MID', NetType.SIGNAL, [
    { comp: r1, pinId: '2', pinName: '2' },
    { comp: c1, pinId: '1', pinName: '1' },
    { comp: opa, pinId: 'IN+1', pinName: 'IN+1' }
  ]);
  K.join(doc, 'SIG_OUT', NetType.SIGNAL, [
    { comp: opa, pinId: 'OUT1', pinName: 'OUT1' },
    { comp: vm, pinId: 'V+', pinName: 'V+' }
  ]);
  K.join(doc, 'VCC', NetType.POWER, [
    { comp: opa, pinId: 'V+', pinName: 'V+' },
    { comp: vcc, pinId: '1', pinName: 'VCC' }
  ]);
  K.join(doc, 'GND', NetType.GROUND, [
    { comp: c1, pinId: '2', pinName: '2' },
    { comp: opa, pinId: 'V-', pinName: 'V-' },
    { comp: opa, pinId: 'IN-1', pinName: 'IN-1' },
    { comp: vm, pinId: 'COM', pinName: 'COM' },
    { comp: gnd, pinId: '1', pinName: 'GND' }
  ]);
}

/** lab_51_led: AT89C51 流水灯 */
export function buildLab51Led(doc: SchematicDocument): void {
  const mcu = K.place(doc, 'AT89C51', 'U1', { x: 200, y: 180 });
  const xtal = K.place(doc, 'XTAL_11M', 'Y1', { x: 80, y: 60 });
  const c1 = C(doc, 'C_100nF', 'C1', 60, 100);
  const c2 = C(doc, 'C_100nF', 'C2', 60, 40);
  const cDec = C(doc, 'C_100nF', 'C3', 280, 300);
  const rRst = R(doc, 'R_10k', 'R1', 120, 260);
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 50, y: 120 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 50, y: 360 });
  const rPwr = R(doc, 'R_1k', 'R_PWR', 350, 120);
  const ledPwr = K.place(doc, 'LED_GREEN', 'D9', { x: 350, y: 60 });
  const vm = K.place(doc, 'VOLTMETER_DC', 'M1', { x: 420, y: 300 });

  K.crystal(doc, mcu, xtal, c1, c2, 'P18', 'P19');
  K.mcuCore(doc, mcu, vcc, gnd, rRst, cDec, 'P40', 'P20', 'P9');
  K.join(doc, 'VCC', NetType.POWER, [
    { comp: mcu, pinId: 'P31', pinName: 'P31' },
    { comp: rPwr, pinId: '1', pinName: '1' },
    { comp: vm, pinId: 'V+', pinName: 'V+' }
  ]);
  K.join(doc, 'GND', NetType.GROUND, [
    { comp: vm, pinId: 'COM', pinName: 'COM' },
    { comp: ledPwr, pinId: 'K', pinName: 'K' }
  ]);
  K.ledBranch(doc,
    { comp: vcc, pinId: '1', pinName: 'VCC' },
    { comp: gnd, pinId: '1', pinName: 'GND' },
    rPwr, ledPwr, 'PWR');

  for (let i = 0; i < 8; i++) {
    const rx = 400 + i * 36;
    const rl = R(doc, 'R_330', `RL${i + 1}`, rx, 200);
    const led = K.place(doc, 'LED_RED', `D${i + 1}`, { x: rx, y: 260 });
    const pinId = `P${i + 1}`;
    K.ledBranch(doc,
      { comp: mcu, pinId: pinId, pinName: pinId },
      { comp: gnd, pinId: '1', pinName: 'GND' },
      rl, led, `L${i}`);
  }
}

/** lab_uart: STM32F103 UART */
export function buildLabUart(doc: SchematicDocument): void {
  const mcu = K.place(doc, 'STM32F103C8', 'U1', { x: 200, y: 180 });
  const xtal = K.place(doc, 'XTAL_8M', 'Y1', { x: 80, y: 60 });
  const c1 = C(doc, 'C_100nF', 'C1', 60, 100);
  const c2 = C(doc, 'C_100nF', 'C2', 60, 40);
  const cDec = C(doc, 'C_100nF', 'C3', 280, 320);
  const rRst = R(doc, 'R_10k', 'R1', 120, 260);
  const uart = K.place(doc, 'UART_TERMINAL', 'TERM1', { x: 450, y: 180 });
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 50, y: 120 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 50, y: 360 });
  const rPwr = R(doc, 'R_1k', 'R_PWR', 350, 120);
  const ledPwr = K.place(doc, 'LED_GREEN', 'D1', { x: 350, y: 60 });
  const vm = K.place(doc, 'VOLTMETER_DC', 'M1', { x: 420, y: 300 });

  K.crystal(doc, mcu, xtal, c1, c2, 'P5', 'P6');
  K.mcuCore(doc, mcu, vcc, gnd, rRst, cDec, 'P48', 'P24', 'P7');
  K.join(doc, 'UART_TX', NetType.SIGNAL, [
    { comp: mcu, pinId: 'P10', pinName: 'P10' },
    { comp: uart, pinId: 'TX', pinName: 'TX' }
  ]);
  K.join(doc, 'UART_RX', NetType.SIGNAL, [
    { comp: mcu, pinId: 'P11', pinName: 'P11' },
    { comp: uart, pinId: 'RX', pinName: 'RX' }
  ]);
  K.join(doc, 'GND', NetType.GROUND, [
    { comp: uart, pinId: 'GND', pinName: 'GND' },
    { comp: ledPwr, pinId: 'K', pinName: 'K' },
    { comp: vm, pinId: 'COM', pinName: 'COM' }
  ]);
  K.join(doc, 'VCC', NetType.POWER, [
    { comp: rPwr, pinId: '1', pinName: '1' },
    { comp: vm, pinId: 'V+', pinName: 'V+' }
  ]);
  K.ledBranch(doc,
    { comp: vcc, pinId: '1', pinName: 'VCC' },
    { comp: gnd, pinId: '1', pinName: 'GND' },
    rPwr, ledPwr, 'PWR');
}

/** lab_passive: 无源器件全覆盖 — 分压 + LC + 全阻值/电容 */
export function buildLabPassive(doc: SchematicDocument): void {
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 60, y: 80 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 60, y: 520 });
  const vac = K.place(doc, 'VAC', 'AC1', { x: 60, y: 200 });
  const rIds = ['R_10', 'R_100', 'R_330', 'R_1k', 'R_4.7k', 'R_10k', 'R_47k', 'R_100k'];
  const cIds = ['C_10pF', 'C_100pF', 'C_1nF', 'C_10nF', 'C_100nF', 'C_1uF', 'C_10uF', 'C_100uF'];
  let x = 160;
  let prev: ComponentInstance | null = null;
  for (let i = 0; i < rIds.length; i++) {
    const r = R(doc, rIds[i], `R${i + 1}`, x, 120);
    if (prev === null) {
      K.join(doc, 'DIV_TOP', NetType.SIGNAL, [
        { comp: vcc, pinId: '1', pinName: 'VCC' },
        { comp: r, pinId: '1', pinName: '1' }
      ]);
    } else {
      K.series2(doc, `NET_R${i}`, { comp: prev, pinId: '2', pinName: '2' },
        { comp: r, pinId: '1', pinName: '1' });
    }
    prev = r;
    x += 70;
  }
  if (prev !== null) {
    K.join(doc, 'DIV_BOT', NetType.SIGNAL, [
      { comp: prev, pinId: '2', pinName: '2' },
      { comp: gnd, pinId: '1', pinName: 'GND' }
    ]);
  }
  x = 160;
  for (let i = 0; i < cIds.length; i++) {
    const cap = C(doc, cIds[i], `C${i + 1}`, x, 280);
    K.join(doc, 'DECAP', NetType.SIGNAL, [
      { comp: vcc, pinId: '1', pinName: 'VCC' },
      { comp: cap, pinId: '1', pinName: '1' }
    ]);
    K.join(doc, 'GND', NetType.GROUND, [
      { comp: cap, pinId: '2', pinName: '2' },
      { comp: gnd, pinId: '1', pinName: 'GND' }
    ]);
    x += 70;
  }
  const l1 = K.place(doc, 'L_10uH', 'L1', { x: 400, y: 400 });
  const cLc = C(doc, 'C_1uF', 'CLC', 520, 400);
  K.join(doc, 'LC', NetType.SIGNAL, [
    { comp: vcc, pinId: '1', pinName: 'VCC' },
    { comp: l1, pinId: '1', pinName: '1' }
  ]);
  K.series2(doc, 'LC_MID',
    { comp: l1, pinId: '2', pinName: '2' },
    { comp: cLc, pinId: '1', pinName: '1' });
  K.join(doc, 'GND', NetType.GROUND, [
    { comp: cLc, pinId: '2', pinName: '2' },
    { comp: gnd, pinId: '1', pinName: 'GND' }
  ]);
  const fuse = K.place(doc, 'FUSE_1A', 'F1', { x: 200, y: 200 });
  K.join(doc, 'AC_PATH', NetType.SIGNAL, [
    { comp: vac, pinId: '1', pinName: '1' },
    { comp: fuse, pinId: '1', pinName: '1' }
  ]);
  K.join(doc, 'GND', NetType.GROUND, [
    { comp: vac, pinId: '2', pinName: '2' },
    { comp: fuse, pinId: '2', pinName: '2' },
    { comp: gnd, pinId: '1', pinName: 'GND' }
  ]);
  const am = K.place(doc, 'AMMETER_DC', 'A1', { x: 300, y: 120 });
  K.join(doc, 'DIV_TOP', NetType.SIGNAL, [
    { comp: am, pinId: 'I+', pinName: 'I+' }
  ]);
  K.join(doc, 'DIV_BOT', NetType.SIGNAL, [
    { comp: am, pinId: 'I-', pinName: 'I-' }
  ]);
}

/** lab_discrete: 分立器件全覆盖 */
export function buildLabDiscrete(doc: SchematicDocument): void {
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 60, y: 100 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 60, y: 480 });

  const diodes = ['1N4148', '1N4007', '1N5819'];
  for (let i = 0; i < diodes.length; i++) {
    const d = K.place(doc, diodes[i], `D${i + 1}`, { x: 180 + i * 100, y: 140 });
    const rd = R(doc, 'R_1k', `RD${i + 1}`, 180 + i * 100, 80);
    K.join(doc, 'VCC', NetType.POWER, [
      { comp: rd, pinId: '1', pinName: '1' },
      { comp: vcc, pinId: '1', pinName: 'VCC' }
    ]);
    K.series2(doc, `DIO${i}`,
      { comp: rd, pinId: '2', pinName: '2' },
      { comp: d, pinId: 'A', pinName: 'A' });
    K.join(doc, 'GND', NetType.GROUND, [
      { comp: d, pinId: 'K', pinName: 'K' },
      { comp: gnd, pinId: '1', pinName: 'GND' }
    ]);
  }

  const leds = ['LED_RED', 'LED_GREEN', 'LED_BLUE'];
  for (let i = 0; i < leds.length; i++) {
    const rl = R(doc, 'R_330', `RL${i + 1}`, 180 + i * 100, 240);
    const led = K.place(doc, leds[i], `LED${i + 1}`, { x: 180 + i * 100, y: 300 });
    K.ledBranch(doc,
      { comp: vcc, pinId: '1', pinName: 'VCC' },
      { comp: gnd, pinId: '1', pinName: 'GND' },
      rl, led, `L${i}`);
  }

  const npn = K.place(doc, '2N2222', 'Q1', { x: 520, y: 160 });
  const rb = R(doc, 'R_10k', 'RB1', 420, 160);
  const rc = R(doc, 'R_1k', 'RC1', 620, 120);
  K.join(doc, 'VCC', NetType.POWER, [
    { comp: rc, pinId: '1', pinName: '1' }
  ]);
  K.series2(doc, 'BASE',
    { comp: rb, pinId: '2', pinName: '2' },
    { comp: npn, pinId: 'B', pinName: 'B' });
  K.join(doc, 'VCC', NetType.POWER, [
    { comp: rb, pinId: '1', pinName: '1' }
  ]);
  K.join(doc, 'COLL', NetType.SIGNAL, [
    { comp: npn, pinId: 'C', pinName: 'C' },
    { comp: rc, pinId: '2', pinName: '2' }
  ]);
  K.join(doc, 'GND', NetType.GROUND, [
    { comp: npn, pinId: 'E', pinName: 'E' }
  ]);

  const pnp = K.place(doc, '2N2907', 'Q2', { x: 520, y: 320 });
  const rb2 = R(doc, 'R_10k', 'RB2', 420, 320);
  K.series2(doc, 'BASE_P',
    { comp: rb2, pinId: '2', pinName: '2' },
    { comp: pnp, pinId: 'B', pinName: 'B' });
  K.join(doc, 'GND', NetType.GROUND, [
    { comp: rb2, pinId: '1', pinName: '1' },
    { comp: pnp, pinId: 'E', pinName: 'E' }
  ]);
  K.join(doc, 'VCC', NetType.POWER, [
    { comp: pnp, pinId: 'C', pinName: 'C' }
  ]);

  const nmos = K.place(doc, '2N7000', 'M1', { x: 720, y: 160 });
  const rg = R(doc, 'R_10k', 'RG1', 620, 160);
  const rd = R(doc, 'R_330', 'RD1', 820, 120);
  K.join(doc, 'VCC', NetType.POWER, [{ comp: rd, pinId: '1', pinName: '1' }]);
  K.series2(doc, 'GATE', { comp: rg, pinId: '2', pinName: '2' },
    { comp: nmos, pinId: 'G', pinName: 'G' });
  K.join(doc, 'VCC', NetType.POWER, [{ comp: rg, pinId: '1', pinName: '1' }]);
  K.join(doc, 'DRAIN', NetType.SIGNAL, [
    { comp: nmos, pinId: 'D', pinName: 'D' },
    { comp: rd, pinId: '2', pinName: '2' }
  ]);
  K.join(doc, 'GND', NetType.GROUND, [{ comp: nmos, pinId: 'S', pinName: 'S' }]);

  const pfet = K.place(doc, 'IRF540', 'M2', { x: 720, y: 320 });
  const rg2 = R(doc, 'R_10k', 'RG2', 620, 320);
  K.series2(doc, 'GATE2', { comp: rg2, pinId: '2', pinName: '2' },
    { comp: pfet, pinId: 'G', pinName: 'G' });
  K.join(doc, 'GND', NetType.GROUND, [{ comp: rg2, pinId: '1', pinName: '1' }]);
  K.join(doc, 'VCC', NetType.POWER, [{ comp: pfet, pinId: 'D', pinName: 'D' }]);
  K.join(doc, 'GND', NetType.GROUND, [{ comp: pfet, pinId: 'S', pinName: 'S' }]);
}

/** lab_analog_ic: 模拟 IC 全覆盖 */
export function buildLabAnalogIc(doc: SchematicDocument): void {
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 60, y: 80 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 60, y: 520 });

  const ua = K.place(doc, 'UA741', 'U1', { x: 200, y: 160 });
  const r1 = R(doc, 'R_10k', 'R1', 100, 140);
  const rf = R(doc, 'R_47k', 'Rf', 200, 80);
  K.join(doc, 'SIG', NetType.SIGNAL, [
    { comp: r1, pinId: '1', pinName: '1' },
    { comp: ua, pinId: 'IN+', pinName: 'IN+' }
  ]);
  K.join(doc, 'FB', NetType.SIGNAL, [
    { comp: ua, pinId: 'IN-', pinName: 'IN-' },
    { comp: rf, pinId: '1', pinName: '1' }
  ]);
  K.join(doc, 'OUT', NetType.SIGNAL, [
    { comp: ua, pinId: 'OUT', pinName: 'OUT' },
    { comp: rf, pinId: '2', pinName: '2' }
  ]);
  K.join(doc, 'VCC', NetType.POWER, [
    { comp: ua, pinId: 'VCC', pinName: 'VCC' },
    { comp: vcc, pinId: '1', pinName: 'VCC' }
  ]);
  K.join(doc, 'GND', NetType.GROUND, [
    { comp: ua, pinId: 'VEE', pinName: 'VEE' },
    { comp: gnd, pinId: '1', pinName: 'GND' }
  ]);

  const lm = K.place(doc, 'LM358', 'U3', { x: 560, y: 160 });
  K.join(doc, 'VCC', NetType.POWER, [{ comp: lm, pinId: 'V+', pinName: 'V+' }]);
  K.join(doc, 'GND', NetType.GROUND, [{ comp: lm, pinId: 'V-', pinName: 'V-' }]);

  const tl = K.place(doc, 'TL082', 'U2', { x: 400, y: 160 });
  K.join(doc, 'VCC', NetType.POWER, [{ comp: tl, pinId: 'V+', pinName: 'V+' }]);
  K.join(doc, 'GND', NetType.GROUND, [{ comp: tl, pinId: 'V-', pinName: 'V-' }]);

  const regs = ['LM7805', 'LM7812', 'AMS1117_3V3'];
  for (let i = 0; i < regs.length; i++) {
    const u = K.place(doc, regs[i], `REG${i + 1}`, { x: 200 + i * 120, y: 360 });
    const ci = C(doc, 'C_10uF', `CI${i + 1}`, 140 + i * 120, 360);
    const co = C(doc, 'C_100nF', `CO${i + 1}`, 260 + i * 120, 360);
    K.join(doc, 'VIN_R', NetType.SIGNAL, [
      { comp: vcc, pinId: '1', pinName: 'VCC' },
      { comp: ci, pinId: '1', pinName: '1' },
      { comp: u, pinId: '1', pinName: '1' }
    ]);
    K.join(doc, 'VOUT_R', NetType.POWER, [
      { comp: u, pinId: '3', pinName: '3' },
      { comp: co, pinId: '1', pinName: '1' }
    ]);
    K.join(doc, 'GND', NetType.GROUND, [
      { comp: u, pinId: '2', pinName: '2' },
      { comp: ci, pinId: '2', pinName: '2' },
      { comp: co, pinId: '2', pinName: '2' }
    ]);
  }
  const buck = K.place(doc, 'LM2596', 'U4', { x: 560, y: 360 });
  K.join(doc, 'VIN_R', NetType.SIGNAL, [{ comp: buck, pinId: '1', pinName: '1' }]);
  K.join(doc, 'GND', NetType.GROUND, [{ comp: buck, pinId: '2', pinName: '2' }]);
}

/** lab_digital: 数字逻辑全覆盖 */
export function buildLabDigital(doc: SchematicDocument): void {
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 60, y: 80 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 60, y: 400 });
  const gates = ['74HC00', '74HC02', '74HC04', '74HC08', '74HC32', '74HC74'];
  for (let i = 0; i < gates.length; i++) {
    const u = K.place(doc, gates[i], `U${i + 1}`, { x: 160 + i * 90, y: 180 });
    K.join(doc, 'VCC', NetType.POWER, [
      { comp: u, pinId: '14', pinName: '14' },
      { comp: vcc, pinId: '1', pinName: 'VCC' }
    ]);
    K.join(doc, 'GND', NetType.GROUND, [
      { comp: u, pinId: '7', pinName: '7' },
      { comp: gnd, pinId: '1', pinName: 'GND' }
    ]);
  }
  const cnt = K.place(doc, 'CD4017', 'U7', { x: 720, y: 180 });
  K.join(doc, 'VCC', NetType.POWER, [{ comp: cnt, pinId: '16', pinName: '16' }]);
  K.join(doc, 'GND', NetType.GROUND, [{ comp: cnt, pinId: '8', pinName: '8' }]);
  const la = K.place(doc, 'LOGIC_ANALYZER', 'LA1', { x: 720, y: 320 });
  K.join(doc, 'GND', NetType.GROUND, [{ comp: la, pinId: 'GND', pinName: 'GND' }]);
  for (let ch = 1; ch <= 4; ch++) {
    K.join(doc, `CH${ch}`, NetType.SIGNAL, [
      { comp: la, pinId: `CH${ch}`, pinName: `CH${ch}` }
    ]);
  }
}

/** lab_memory: 存储器 + STM32 总线连接 */
export function buildLabMemory(doc: SchematicDocument): void {
  const mcu = K.place(doc, 'STM32F103RC', 'U1', { x: 200, y: 200 });
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 60, y: 120 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 60, y: 400 });
  const cDec = C(doc, 'C_100nF', 'C1', 280, 360);
  const rRst = R(doc, 'R_10k', 'R1', 120, 320);
  K.mcuCore(doc, mcu, vcc, gnd, rRst, cDec, 'P48', 'P24', 'P7');

  const mems = ['2764', '62256', '24C02', 'W25Q64'];
  for (let i = 0; i < mems.length; i++) {
    const m = K.place(doc, mems[i], `M${i + 1}`, { x: 480 + i * 100, y: 160 });
    K.join(doc, 'VCC', NetType.POWER, [{ comp: m, pinId: '1', pinName: '1' }]);
    K.join(doc, 'GND', NetType.GROUND, [{ comp: m, pinId: '2', pinName: '2' }]);
    K.join(doc, `MEM${i}`, NetType.SIGNAL, [
      { comp: mcu, pinId: `P${10 + i}`, pinName: `P${10 + i}` },
      { comp: m, pinId: '3', pinName: '3' }
    ]);
  }
}

/** lab_mcu_8051: 全部 8051 型号最小系统 */
export function buildLabMcu8051(doc: SchematicDocument): void {
  const ids = ['AT89C51', 'AT89C52', 'STC89C52', 'STC15W408AS'];
  const xtals = ['XTAL_11M', 'XTAL_11M', 'XTAL_11M', 'XTAL_8M'];
  for (let i = 0; i < ids.length; i++) {
    const ox = 80 + i * 280;
    const mcu = K.place(doc, ids[i], `U${i + 1}`, { x: ox + 120, y: 200 });
    const xtal = K.place(doc, xtals[i], `Y${i + 1}`, { x: ox, y: 80 });
    const c1 = C(doc, 'C_100nF', `C${i * 2 + 1}`, ox - 20, 120);
    const c2 = C(doc, 'C_100nF', `C${i * 2 + 2}`, ox - 20, 60);
    const cDec = C(doc, 'C_100nF', `CD${i + 1}`, ox + 200, 320);
    const rRst = R(doc, 'R_10k', `R${i + 1}`, ox + 40, 280);
    const vcc = K.place(doc, 'VCC', `PWR${i + 1}`, { x: ox, y: 140 });
    const gnd = K.place(doc, 'GND', `GND${i + 1}`, { x: ox, y: 360 });
    K.crystal(doc, mcu, xtal, c1, c2, 'P18', 'P19');
    K.mcuCore(doc, mcu, vcc, gnd, rRst, cDec, 'P40', 'P20', 'P9');
  }
}

/** lab_mcu_stm32: 全部 STM32 型号最小系统 */
export function buildLabMcuStm32(doc: SchematicDocument): void {
  const ids = ['STM32F103C8', 'STM32F103RC', 'STM32F407VG', 'STM32L431CB', 'STM32F030F4'];
  for (let i = 0; i < ids.length; i++) {
    const ox = 60 + i * 240;
    const mcu = K.place(doc, ids[i], `U${i + 1}`, { x: ox + 120, y: 200 });
    const xtal = K.place(doc, 'XTAL_8M', `Y${i + 1}`, { x: ox, y: 80 });
    const c1 = C(doc, 'C_100nF', `C${i * 2 + 1}`, ox - 20, 120);
    const c2 = C(doc, 'C_100nF', `C${i * 2 + 2}`, ox - 20, 60);
    const cDec = C(doc, 'C_10uF', `CD${i + 1}`, ox + 200, 320);
    const rRst = R(doc, 'R_10k', `R${i + 1}`, ox + 40, 280);
    const vcc = K.place(doc, 'VCC', `PWR${i + 1}`, { x: ox, y: 140 });
    const gnd = K.place(doc, 'GND', `GND${i + 1}`, { x: ox, y: 360 });
    K.crystal(doc, mcu, xtal, c1, c2, 'P5', 'P6');
    K.mcuCore(doc, mcu, vcc, gnd, rRst, cDec, 'P48', 'P24', 'P7');
  }
}

/** lab_peripheral: 外设全覆盖 */
export function buildLabPeripheral(doc: SchematicDocument): void {
  const mcu = K.place(doc, 'STM32F103C8', 'U1', { x: 200, y: 200 });
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 60, y: 120 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 60, y: 480 });
  const cDec = C(doc, 'C_100nF', 'C1', 280, 360);
  const rRst = R(doc, 'R_10k', 'R1', 120, 320);
  K.mcuCore(doc, mcu, vcc, gnd, rRst, cDec, 'P48', 'P24', 'P7');

  const sw = K.place(doc, 'SW_PUSH', 'SW1', { x: 420, y: 200 });
  const rPull = R(doc, 'R_10k', 'R2', 340, 200);
  K.join(doc, 'KEY', NetType.SIGNAL, [
    { comp: mcu, pinId: 'P2', pinName: 'P2' },
    { comp: sw, pinId: '1', pinName: '1' },
    { comp: rPull, pinId: '1', pinName: '1' }
  ]);
  K.join(doc, 'VCC', NetType.POWER, [{ comp: rPull, pinId: '2', pinName: '2' }]);
  K.join(doc, 'GND', NetType.GROUND, [{ comp: sw, pinId: '2', pinName: '2' }]);

  const relay = K.place(doc, 'RELAY_SPDT', 'K1', { x: 520, y: 280 });
  K.join(doc, 'VCC', NetType.POWER, [{ comp: relay, pinId: '1', pinName: '1' }]);
  K.join(doc, 'GND', NetType.GROUND, [{ comp: relay, pinId: '2', pinName: '2' }]);

  const buzz = K.place(doc, 'BUZZER', 'BZ1', { x: 620, y: 280 });
  const rb = R(doc, 'R_330', 'RBZ', 520, 340);
  K.join(doc, 'BUZ', NetType.SIGNAL, [
    { comp: mcu, pinId: 'P3', pinName: 'P3' },
    { comp: rb, pinId: '1', pinName: '1' }
  ]);
  K.series2(doc, 'BUZ_DRV', { comp: rb, pinId: '2', pinName: '2' },
    { comp: buzz, pinId: '1', pinName: '1' });
  K.join(doc, 'GND', NetType.GROUND, [{ comp: buzz, pinId: '2', pinName: '2' }]);

  const lcd = K.place(doc, 'LCD1602', 'LCD1', { x: 720, y: 160 });
  K.join(doc, 'VCC', NetType.POWER, [{ comp: lcd, pinId: '2', pinName: '2' }]);
  K.join(doc, 'GND', NetType.GROUND, [
    { comp: lcd, pinId: '1', pinName: '1' },
    { comp: lcd, pinId: '5', pinName: '5' }
  ]);
  K.join(doc, 'LCD_RS', NetType.SIGNAL, [
    { comp: mcu, pinId: 'P17', pinName: 'P17' },
    { comp: lcd, pinId: '4', pinName: '4' }
  ]);

  const oled = K.place(doc, 'OLED_12864', 'OLED1', { x: 720, y: 360 });
  K.join(doc, 'VCC', NetType.POWER, [{ comp: oled, pinId: '1', pinName: '1' }]);
  K.join(doc, 'GND', NetType.GROUND, [{ comp: oled, pinId: '2', pinName: '2' }]);
  K.join(doc, 'OLED_SDA', NetType.SIGNAL, [
    { comp: mcu, pinId: 'P18', pinName: 'P18' },
    { comp: oled, pinId: '3', pinName: '3' }
  ]);
}

/** lab_sensor: 传感器全覆盖 */
export function buildLabSensor(doc: SchematicDocument): void {
  const mcu = K.place(doc, 'STM32F103C8', 'U1', { x: 200, y: 200 });
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 60, y: 120 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 60, y: 400 });
  const cDec = C(doc, 'C_100nF', 'C1', 280, 360);
  const rRst = R(doc, 'R_10k', 'R1', 120, 320);
  K.mcuCore(doc, mcu, vcc, gnd, rRst, cDec, 'P48', 'P24', 'P7');

  const ds = K.place(doc, 'DS18B20', 'T1', { x: 420, y: 180 });
  const rDs = R(doc, 'R_4.7k', 'R2', 340, 180);
  K.join(doc, '1WIRE', NetType.SIGNAL, [
    { comp: mcu, pinId: 'P4', pinName: 'P4' },
    { comp: rDs, pinId: '1', pinName: '1' },
    { comp: ds, pinId: '1', pinName: '1' }
  ]);
  K.join(doc, 'VCC', NetType.POWER, [{ comp: rDs, pinId: '2', pinName: '2' }]);
  K.join(doc, 'GND', NetType.GROUND, [{ comp: ds, pinId: '2', pinName: '2' }]);

  const hall = K.place(doc, 'HALL_SENSOR', 'H1', { x: 420, y: 280 });
  K.join(doc, 'VCC', NetType.POWER, [{ comp: hall, pinId: '1', pinName: '1' }]);
  K.join(doc, 'HALL', NetType.SIGNAL, [
    { comp: mcu, pinId: 'P5', pinName: 'P5' },
    { comp: hall, pinId: '2', pinName: '2' }
  ]);

  const ldr = K.place(doc, 'LDR', 'LDR1', { x: 520, y: 280 });
  const rLdr = R(doc, 'R_10k', 'R3', 440, 280);
  K.join(doc, 'VCC', NetType.POWER, [{ comp: rLdr, pinId: '1', pinName: '1' }]);
  K.series2(doc, 'LDR_DIV', { comp: rLdr, pinId: '2', pinName: '2' },
    { comp: ldr, pinId: '1', pinName: '1' });
  K.join(doc, 'ADC', NetType.SIGNAL, [
    { comp: mcu, pinId: 'P6', pinName: 'P6' },
    { comp: rLdr, pinId: '2', pinName: '2' }
  ]);
  K.join(doc, 'GND', NetType.GROUND, [{ comp: ldr, pinId: '2', pinName: '2' }]);
}

/** lab_instruments: 仪器仪表全覆盖 */
export function buildLabInstruments(doc: SchematicDocument): void {
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 60, y: 100 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 60, y: 400 });
  const r1 = R(doc, 'R_10k', 'R1', 160, 160);
  const r2 = R(doc, 'R_10k', 'R2', 260, 160);
  K.join(doc, 'VCC', NetType.POWER, [
    { comp: vcc, pinId: '1', pinName: 'VCC' },
    { comp: r1, pinId: '1', pinName: '1' }
  ]);
  K.series2(doc, 'MID', { comp: r1, pinId: '2', pinName: '2' },
    { comp: r2, pinId: '1', pinName: '1' });
  K.join(doc, 'GND', NetType.GROUND, [
    { comp: r2, pinId: '2', pinName: '2' },
    { comp: gnd, pinId: '1', pinName: 'GND' }
  ]);

  const vm = K.place(doc, 'VOLTMETER_DC', 'M1', { x: 400, y: 120 });
  K.join(doc, 'VCC', NetType.POWER, [{ comp: vm, pinId: 'V+', pinName: 'V+' }]);
  K.join(doc, 'MID', NetType.SIGNAL, [{ comp: vm, pinId: 'COM', pinName: 'COM' }]);

  const am = K.place(doc, 'AMMETER_DC', 'A1', { x: 200, y: 160 });
  K.join(doc, 'VCC', NetType.POWER, [{ comp: am, pinId: 'I+', pinName: 'I+' }]);
  K.join(doc, 'MID', NetType.SIGNAL, [{ comp: am, pinId: 'I-', pinName: 'I-' }]);

  const virt = K.place(doc, 'VIRTUAL_METER', 'VM1', { x: 400, y: 220 });
  K.join(doc, 'MID', NetType.SIGNAL, [{ comp: virt, pinId: 'V', pinName: 'V' }]);
  K.join(doc, 'GND', NetType.GROUND, [{ comp: virt, pinId: 'COM', pinName: 'COM' }]);

  const pm = K.place(doc, 'POWER_METER', 'PM1', { x: 520, y: 160 });
  K.join(doc, 'VCC', NetType.POWER, [
    { comp: pm, pinId: 'V+', pinName: 'V+' },
    { comp: pm, pinId: 'I+', pinName: 'I+' }
  ]);
  K.join(doc, 'GND', NetType.GROUND, [
    { comp: pm, pinId: 'V-', pinName: 'V-' },
    { comp: pm, pinId: 'I-', pinName: 'I-' }
  ]);

  const fc = K.place(doc, 'FREQ_COUNTER', 'FC1', { x: 520, y: 280 });
  K.join(doc, 'MID', NetType.SIGNAL, [{ comp: fc, pinId: 'IN', pinName: 'IN' }]);
  K.join(doc, 'GND', NetType.GROUND, [{ comp: fc, pinId: 'GND', pinName: 'GND' }]);

  const osc = K.place(doc, 'OSCILLOSCOPE', 'OSC1', { x: 640, y: 160 });
  K.join(doc, 'VCC', NetType.SIGNAL, [{ comp: osc, pinId: 'CH1', pinName: 'CH1' }]);
  K.join(doc, 'MID', NetType.SIGNAL, [{ comp: osc, pinId: 'CH2', pinName: 'CH2' }]);
  K.join(doc, 'GND', NetType.GROUND, [{ comp: osc, pinId: 'GND', pinName: 'GND' }]);
}
