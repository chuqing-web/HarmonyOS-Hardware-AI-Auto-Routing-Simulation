/**
 * 实验模板电路构建器 — 与 tools/lab_templates/builders.mjs 对齐
 * 每个模板器件完整、连线正确、可仿真
 */
import { SchematicDocument, ComponentInstance, NetType } from 'common';
import { TemplateSchematicKit as K, PinSpec } from './TemplateSchematicKit';

const R = (doc: SchematicDocument, id: string, ref: string, x: number, y: number): ComponentInstance =>
  K.place(doc, id, ref, { x: x, y: y });
const C = (doc: SchematicDocument, id: string, ref: string, x: number, y: number): ComponentInstance =>
  K.place(doc, id, ref, { x: x, y: y });

function p(comp: ComponentInstance, pinId: string, pinName: string = pinId): PinSpec {
  return { comp: comp, pinId: pinId, pinName: pinName };
}

interface GateDef {
  id: string;
  ref: string;
  dual: boolean;
}

function gate(id: string, ref: string, dual: boolean): GateDef {
  const g: GateDef = { id: id, ref: ref, dual: dual };
  return g;
}

/** lab_power: LM7805 稳压 + 滤波 + 负载测量 */
export function buildLabPower(doc: SchematicDocument): void {
  // 主轨 y=160；滤波/负载下挂。C2↔R1 中心距须 >120：
  // 同行对脚 20px stub 会在缝中间重合，WireNetTopology 会把 VOUT 并进 GND。
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 40, y: 100 });
  const fuse = K.place(doc, 'FUSE_1A', 'F1', { x: 100, y: 160 });
  const cin = K.place(doc, 'C_100uF', 'C1', { x: 180, y: 240 });
  const reg = K.place(doc, 'LM7805', 'U1', { x: 280, y: 160 });
  const cout = K.place(doc, 'C_10uF', 'C2', { x: 400, y: 240 });
  const rLoad = K.place(doc, 'R_10k', 'R1', { x: 560, y: 240 });
  const vm = K.place(doc, 'VOLTMETER_DC', 'M1', { x: 700, y: 170 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 280, y: 340 });

  K.join(doc, 'VIN_SRC', NetType.SIGNAL, [p(vcc, '1', 'VCC'), p(fuse, '1')]);
  K.join(doc, 'REG_IN', NetType.SIGNAL, [p(fuse, '2'), p(cin, '1'), p(reg, '1')]);
  K.join(doc, 'VOUT', NetType.POWER, [
    p(reg, '3'), p(cout, '1'), p(rLoad, '1'), p(vm, 'V+', 'V+')
  ]);
  K.join(doc, 'GND', NetType.GROUND, [
    p(gnd, '1', 'GND'), p(reg, '2'), p(cin, '2'), p(cout, '2'),
    p(rLoad, '2'), p(vm, 'COM', 'COM')
  ]);
}

/** lab_amp: LM358 同相放大器 + VAC 激励 */
export function buildLabAmp(doc: SchematicDocument): void {
  // VAC 脚同行易被 SIG 横穿；信号链分 y，GND/VCC 符号作 hub
  // 单电源 5V：小信号 + 偏置，增益 1+Rf/Rg=11 → Vout≈2.2±1.1V
  const vac = K.place(doc, 'VAC', 'AC1', { x: 60, y: 220 });
  vac.parameters.set('amplitude', '0.1V');
  vac.parameters.set('frequency', '1kHz');
  vac.parameters.set('offset', '0.2V');
  const ri = R(doc, 'R_10k', 'R1', 160, 160);
  const opa = K.place(doc, 'LM358', 'U1', { x: 340, y: 180 });
  const rf = R(doc, 'R_100k', 'Rf', 340, 60);
  const rg = R(doc, 'R_10k', 'Rg', 240, 300);
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 340, y: 20 });
  vcc.parameters.set('voltage', '5V');
  const gnd = K.place(doc, 'GND', 'GND1', { x: 240, y: 400 });
  const vm = K.place(doc, 'VOLTMETER_DC', 'M1', { x: 520, y: 140 });
  const osc = K.place(doc, 'OSCILLOSCOPE', 'OSC1', { x: 520, y: 300 });

  // 以 R1 为 hub，竖线落到 VAC.1，不横穿 VAC.2
  K.join(doc, 'SIG_SRC', NetType.SIGNAL, [p(ri, '1'), p(vac, '1')]);
  K.join(doc, 'SIG_IN', NetType.SIGNAL, [p(ri, '2'), p(opa, 'IN+1', 'IN+1')]);
  K.join(doc, 'FB', NetType.SIGNAL, [
    p(opa, 'IN-1', 'IN-1'), p(rf, '1'), p(rg, '1')
  ]);
  K.join(doc, 'SIG_OUT', NetType.SIGNAL, [
    p(opa, 'OUT1', 'OUT1'), p(rf, '2'), p(vm, 'V+', 'V+'), p(osc, 'CH1', 'CH1')
  ]);
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(opa, 'V+', 'V+')]);
  K.join(doc, 'GND', NetType.GROUND, [
    p(gnd, '1', 'GND'), p(vac, '2'), p(opa, 'V-', 'V-'), p(rg, '2'),
    p(vm, 'COM', 'COM'), p(osc, 'GND', 'GND')
  ]);
  // 未用 B 通道：跟随器 + IN+ 接地，避免浮空
  tieUnusedDualOpAmpB(doc, opa);
}

/** 双运放未用通道：OUT2↔IN-2 跟随，IN+2→GND（标号并网，避免挤占 A 通道布线） */
function tieUnusedDualOpAmpB(doc: SchematicDocument, opa: ComponentInstance): void {
  K.joinByLabel(doc, `${opa.refDes}_B_FB`, NetType.SIGNAL, [
    p(opa, 'OUT2', 'OUT2'), p(opa, 'IN-2', 'IN-2')
  ]);
  K.joinByLabel(doc, 'GND', NetType.GROUND, [
    p(opa, 'IN+2', 'IN+2')
  ]);
}

/** lab_filter: RC 低通 + LM358 电压跟随 */
export function buildLabFilter(doc: SchematicDocument): void {
  const vac = K.place(doc, 'VAC', 'AC1', { x: 60, y: 220 });
  vac.parameters.set('amplitude', '0.5V');
  vac.parameters.set('frequency', '1kHz');
  vac.parameters.set('offset', '1.5V');
  const r1 = R(doc, 'R_1k', 'R1', 160, 140);
  const c1 = C(doc, 'C_100nF', 'C1', 260, 260);
  const opa = K.place(doc, 'LM358', 'U1', { x: 400, y: 180 });
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 400, y: 20 });
  vcc.parameters.set('voltage', '5V');
  const gnd = K.place(doc, 'GND', 'GND1', { x: 260, y: 400 });
  const vm = K.place(doc, 'VOLTMETER_DC', 'M1', { x: 560, y: 140 });
  const osc = K.place(doc, 'OSCILLOSCOPE', 'OSC1', { x: 560, y: 300 });

  K.join(doc, 'SIG_SRC', NetType.SIGNAL, [p(r1, '1'), p(vac, '1')]);
  K.join(doc, 'SIG_MID', NetType.SIGNAL, [
    p(r1, '2'), p(c1, '1'), p(opa, 'IN+1', 'IN+1')
  ]);
  K.join(doc, 'BUF_FB', NetType.SIGNAL, [
    p(opa, 'OUT1', 'OUT1'), p(opa, 'IN-1', 'IN-1'),
    p(vm, 'V+', 'V+'), p(osc, 'CH1', 'CH1')
  ]);
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(opa, 'V+', 'V+')]);
  K.join(doc, 'GND', NetType.GROUND, [
    p(gnd, '1', 'GND'), p(vac, '2'), p(c1, '2'), p(opa, 'V-', 'V-'),
    p(vm, 'COM', 'COM'), p(osc, 'GND', 'GND')
  ]);
  tieUnusedDualOpAmpB(doc, opa);
}

/** 晶振负载电容：左右分列；间距 <80 以满足 DeepErcEngine 邻近检测 */
interface XtalCaps { c1: ComponentInstance; c2: ComponentInstance; }
function placeXtalCaps(doc: SchematicDocument, xtalX: number, xtalY: number, tag: string): XtalCaps {
  const c1 = C(doc, 'C_100nF', `${tag}1`, xtalX - 60, xtalY + 40);
  const c2 = C(doc, 'C_100nF', `${tag}2`, xtalX + 60, xtalY + 40);
  const out: XtalCaps = { c1: c1, c2: c2 };
  return out;
}

/**
 * lab_51_led: AT89C51 流水灯最小系统
 * 灌电流：VCC→R→LED.A / LED.K→P1.x（低电平点亮）
 * 布局：LED 列远离 MCU；晶振贴 P18/P19；全部 LED 网用 joinByLabel，
 * 避免旧版密排 joinWired 被 WireNetTopology T 结并成 L4_K/VCC（日志 signalNets=1）。
 */
export function buildLab51Led(doc: SchematicDocument): void {
  const mcu = K.place(doc, 'AT89C51', 'U1', { x: 720, y: 300 });
  // 晶振贴 XTAL 脚高度（P18/P19 ≈ y370），勿与 LED 列重叠
  const xtal = K.place(doc, 'XTAL_11M', 'Y1', { x: 560, y: 370 });
  const _caps = placeXtalCaps(doc, 560, 370, 'CX');
  const c1 = _caps.c1;
  const c2 = _caps.c2;
  const cDec = C(doc, 'C_100nF', 'C3', 860, 420);
  const rRst = R(doc, 'R_10k', 'R1', 560, 280);
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 60, y: 20 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 60, y: 560 });
  const rPwr = R(doc, 'R_1k', 'R_PWR', 880, 40);
  const ledPwr = K.place(doc, 'LED_GREEN', 'D9', { x: 1000, y: 40 });
  const vm = K.place(doc, 'VOLTMETER_DC', 'M1', { x: 960, y: 520 });

  K.crystal(doc, mcu, xtal, c1, c2, 'XTAL1', 'XTAL2', '', gnd);
  K.mcuCore(doc, mcu, vcc, gnd, rRst, cDec, 'VCC', 'GND', 'RST', '', true);
  // EA / 表笔：标号并入电源轨，勿拉跨板长线
  K.joinByLabel(doc, 'VCC', NetType.POWER, [
    p(vcc, '1', 'VCC'), p(mcu, 'EA', 'EA'), p(vm, 'V+', 'V+')
  ]);
  K.joinByLabel(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(vm, 'COM', 'COM')]);
  K.joinByLabel(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(rPwr, '1')]);
  K.joinByLabel(doc, 'PWR_LED', NetType.SIGNAL, [p(rPwr, '2'), p(ledPwr, 'A', 'A')]);
  K.joinByLabel(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(ledPwr, 'K', 'K')]);

  // 行距 55：电阻/LED 本体与 stub 端点互不落入 5px 吸附；纯标号无跨列导线
  for (let i = 0; i < 8; i++) {
    const y = 80 + i * 55;
    const rl = R(doc, 'R_330', `RL${i + 1}`, 140, y);
    const led = K.place(doc, 'LED_RED', `D${i + 1}`, { x: 280, y });
    const pinId = `P1.${i}`;
    K.joinByLabel(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(rl, '1')]);
    K.joinByLabel(doc, `L${i}_A`, NetType.SIGNAL, [p(rl, '2'), p(led, 'A', 'A')]);
    K.joinByLabel(doc, `L${i}_K`, NetType.SIGNAL, [p(led, 'K', 'K'), p(mcu, pinId, pinId)]);
  }
}

/** lab_uart: STM32F103 UART + 终端 */
export function buildLabUart(doc: SchematicDocument): void {
  // MCU y=240：VDD 与 CX2 不同高，避免负载电容 GND 脚落在 VCC→VDD 水平线上
  const mcu = K.place(doc, 'STM32F103C8', 'U1', { x: 220, y: 240 });
  const xtal = K.place(doc, 'XTAL_8M', 'Y1', { x: 60, y: 60 });
  const _caps = placeXtalCaps(doc, 60, 60, 'CX');
  const c1 = _caps.c1;
  const c2 = _caps.c2;
  // C3 下移：避开电压表 V+@(vm.x-30, vm.y-25) 与 C3.pin2 端点 5px 重合
  const cDec = C(doc, 'C_100nF', 'C3', 340, 440);
  // rRst.pin2 避开晶振脚 x（xtal@60 → pin2@90）
  const rRst = R(doc, 'R_10k', 'R1', 20, 360);
  const uart = K.place(doc, 'UART_TERMINAL', 'TERM1', { x: 560, y: 200 });
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 40, y: 10 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 40, y: 480 });
  const rPwr = R(doc, 'R_1k', 'R_PWR', 400, 60);
  const ledPwr = K.place(doc, 'LED_GREEN', 'D1', { x: 500, y: 60 });
  const vm = K.place(doc, 'VOLTMETER_DC', 'M1', { x: 520, y: 400 });

  K.crystal(doc, mcu, xtal, c1, c2, 'OSC_IN', 'OSC_OUT', '', gnd);
  K.mcuCore(doc, mcu, vcc, gnd, rRst, cDec, 'VDD', 'VSS', 'NRST');
  // 终端作 hub，TX/RX 各自高度横走，避免共享 MCU 左边脚列水平廊道
  K.join(doc, 'UART_TX', NetType.SIGNAL, [p(uart, 'TX', 'TX'), p(mcu, 'PA9', 'PA9')]);
  K.join(doc, 'UART_RX', NetType.SIGNAL, [p(uart, 'RX', 'RX'), p(mcu, 'PA10', 'PA10')]);
  K.join(doc, 'GND', NetType.GROUND, [
    p(gnd, '1', 'GND'), p(uart, 'GND', 'GND'), p(vm, 'COM', 'COM')
  ]);
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(vm, 'V+', 'V+')]);
  K.ledBranch(doc, p(vcc, '1', 'VCC'), p(gnd, '1', 'GND'), rPwr, ledPwr, 'PWR', 'VCC');
}

/** lab_passive: 电阻串/电容去耦/LC/交流支路 */
export function buildLabPassive(doc: SchematicDocument): void {
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 40, y: 40 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 40, y: 560 });
  const vac = K.place(doc, 'VAC', 'AC1', { x: 40, y: 300 });
  const rIds = ['R_10', 'R_100', 'R_330', 'R_1k', 'R_4.7k', 'R_10k', 'R_47k', 'R_100k'];
  const cIds = ['C_10pF', 'C_100pF', 'C_1nF', 'C_10nF', 'C_100nF', 'C_1uF', 'C_10uF', 'C_100uF'];

  // 电流表串在分压顶端：远离 PWR1(40,40)，避免 DIV_TOP stub 在 25px 吸附时吞掉电源脚
  const am = K.place(doc, 'AMMETER_DC', 'A1', { x: 140, y: 80 });
  const vm = K.place(doc, 'VOLTMETER_DC', 'M1', { x: 980, y: 80 });

  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(am, 'I+', 'I+')]);

  // 电阻链：A1.I- 物理接到 R1；其余串联。电压表必须同名标号并入，否则重建后 DIV_TOP 只剩 M1 悬空
  let x = 240;
  let prev: ComponentInstance | null = null;
  let r1: ComponentInstance | null = null;
  for (let i = 0; i < rIds.length; i++) {
    const r = R(doc, rIds[i], `R${i + 1}`, x, 140);
    if (prev === null) {
      r1 = r;
      K.series2(doc, 'DIV_TOP', p(am, 'I-', 'I-'), p(r, '1'));
    } else {
      K.series2(doc, `NET_R${i}`, p(prev, '2'), p(r, '1'));
    }
    prev = r;
    x += 80;
  }
  // 同名 Net Label 让 M1.V+ 在几何重建后合并进 DIV_TOP（与 A1.I-/R1.1）
  if (r1 !== null) {
    K.joinByLabel(doc, 'DIV_TOP', NetType.SIGNAL, [
      p(am, 'I-', 'I-'), p(r1, '1'), p(vm, 'V+', 'V+')
    ]);
  }
  if (prev !== null) {
    K.join(doc, 'GND', NetType.GROUND, [
      p(gnd, '1', 'GND'), p(prev, '2'), p(vm, 'COM', 'COM')
    ]);
  } else {
    K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(vm, 'COM', 'COM')]);
  }

  // 电容去耦：中心距 ≥200，左右 stub 才不在邻帽间隙 T 接
  x = 180;
  for (let i = 0; i < cIds.length; i++) {
    const cap = C(doc, cIds[i], `C${i + 1}`, x, 280);
    K.joinByLabel(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(cap, '1')]);
    K.joinByLabel(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(cap, '2')]);
    x += 200;
  }

  const l1 = K.place(doc, 'L_10uH', 'L1', { x: 560, y: 420 });
  const cLc = C(doc, 'C_1uF', 'CLC', 720, 420);
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(l1, '1')]);
  K.series2(doc, 'LC_MID', p(l1, '2'), p(cLc, '1'));
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(cLc, '2')]);

  // AC 支路：与 LC/VCC 垂线错开 x
  const fuse = K.place(doc, 'FUSE_1A', 'F1', { x: 200, y: 360 });
  const rAc = R(doc, 'R_1k', 'RAC', 340, 360);
  K.join(doc, 'AC_PATH', NetType.SIGNAL, [p(fuse, '1'), p(vac, '1')]);
  K.series2(doc, 'AC_LOAD', p(fuse, '2'), p(rAc, '1'));
  K.join(doc, 'GND', NetType.GROUND, [
    p(gnd, '1', 'GND'), p(vac, '2'), p(rAc, '2')
  ]);
}

/** lab_discrete: 二极管/LED/BJT/MOS 典型接法 */
export function buildLabDiscrete(doc: SchematicDocument): void {
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 40, y: 40 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 40, y: 520 });

  // 二极管：电阻在上、二极管在中、地母线在下，列距拉开
  const diodes = ['1N4148', '1N4007', '1N5819'];
  for (let i = 0; i < diodes.length; i++) {
    const ox = 180 + i * 140;
    const rd = R(doc, 'R_1k', `RD${i + 1}`, ox, 100);
    const d = K.place(doc, diodes[i], `D${i + 1}`, { x: ox, y: 200 });
    K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(rd, '1')]);
    K.series2(doc, `DIO${i}`, p(rd, '2'), p(d, 'A', 'A'));
    K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(d, 'K', 'K')]);
  }

  // LED：与二极管同为竖直支路（R↑ / LED↓），避免 ledBranch 横连穿越 VCC/GND 轨
  const leds = ['LED_RED', 'LED_GREEN', 'LED_BLUE'];
  for (let i = 0; i < leds.length; i++) {
    const ox = 180 + i * 140;
    const rl = R(doc, 'R_330', `RL${i + 1}`, ox, 300);
    const led = K.place(doc, leds[i], `LED${i + 1}`, { x: ox, y: 400 });
    K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(rl, '1')]);
    K.series2(doc, `LED${i}`, p(rl, '2'), p(led, 'A', 'A'));
    K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(led, 'K', 'K')]);
  }

  // NPN / PNP / MOS：错开 x，避免 VCC/GND 垂线共柱；PNP 区远离 LED 行
  const npn = K.place(doc, '2N2222', 'Q1', { x: 760, y: 120 });
  const rb = R(doc, 'R_10k', 'RB1', 620, 120);
  const rc = R(doc, 'R_330', 'RC1', 880, 60);
  const ledN = K.place(doc, 'LED_RED', 'DN', { x: 1000, y: 60 });
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(rb, '1'), p(rc, '1')]);
  K.series2(doc, 'BASE', p(rb, '2'), p(npn, 'B', 'B'));
  K.series2(doc, 'COLL', p(rc, '2'), p(ledN, 'A', 'A'));
  K.join(doc, 'COLL_LED', NetType.SIGNAL, [p(ledN, 'K', 'K'), p(npn, 'C', 'C')]);
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(npn, 'E', 'E')]);

  const pnp = K.place(doc, '2N2907', 'Q2', { x: 860, y: 420 });
  const rb2 = R(doc, 'R_10k', 'RB2', 720, 420);
  const rc2 = R(doc, 'R_1k', 'RC2', 980, 460);
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(pnp, 'E', 'E')]);
  K.series2(doc, 'BASE_P', p(rb2, '2'), p(pnp, 'B', 'B'));
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(rb2, '1')]);
  K.join(doc, 'COLL_P', NetType.SIGNAL, [p(pnp, 'C', 'C'), p(rc2, '1')]);
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(rc2, '2')]);

  const nmos = K.place(doc, '2N7000', 'M1', { x: 1180, y: 120 });
  const rg = R(doc, 'R_10k', 'RG1', 1040, 120);
  const rm1 = R(doc, 'R_330', 'RM1', 1300, 60);
  const ledM = K.place(doc, 'LED_GREEN', 'DM', { x: 1420, y: 60 });
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(rg, '1'), p(rm1, '1')]);
  K.series2(doc, 'GATE', p(rg, '2'), p(nmos, 'G', 'G'));
  K.series2(doc, 'DRAIN', p(rm1, '2'), p(ledM, 'A', 'A'));
  K.join(doc, 'DRAIN_LED', NetType.SIGNAL, [p(ledM, 'K', 'K'), p(nmos, 'D', 'D')]);
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(nmos, 'S', 'S')]);

  // M2 关断示范：栅极下拉到 GND；远离 LED 行与 PNP 区
  const pfet = K.place(doc, 'IRF540', 'M2', { x: 1180, y: 440 });
  const rg2 = R(doc, 'R_10k', 'RG2', 1040, 440);
  const rm2 = R(doc, 'R_330', 'RM2', 1300, 380);
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(rm2, '1')]);
  K.series2(doc, 'GATE2', p(rg2, '2'), p(pfet, 'G', 'G'));
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(rg2, '1')]);
  K.join(doc, 'DRAIN2', NetType.SIGNAL, [p(pfet, 'D', 'D'), p(rm2, '2')]);
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(pfet, 'S', 'S')]);
}

/** lab_analog_ic: 运放 + 稳压完整电路 */
export function buildLabAnalogIc(doc: SchematicDocument): void {
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 40, y: 40 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 40, y: 560 });
  const vac = K.place(doc, 'VAC', 'AC1', { x: 40, y: 200 });
  // 单电源 5V：小信号 + 偏置（与 lab_amp 一致）。默认 220V/50Hz 会钉运放并让 DC 表读~1V
  vac.parameters.set('amplitude', '0.1V');
  vac.parameters.set('frequency', '1kHz');
  vac.parameters.set('offset', '0.2V');

  // U1 UA741 电压跟随（OUT↔IN-）。单电源反相到 GND 会钉在 VEE+0.1，再经 ×11 ≈1.1V 假读数
  const ua = K.place(doc, 'UA741', 'U1', { x: 240, y: 140 });
  const rIn = R(doc, 'R_10k', 'R1', 120, 100);
  K.join(doc, 'SIG', NetType.SIGNAL, [p(rIn, '1'), p(vac, '1')]);
  K.join(doc, 'BUF_IN', NetType.SIGNAL, [p(rIn, '2'), p(ua, 'IN+', 'IN+')]);
  K.join(doc, 'OUT741', NetType.SIGNAL, [p(ua, 'OUT', 'OUT'), p(ua, 'IN-', 'IN-')]);
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(ua, 'VCC', 'VCC')]);
  K.join(doc, 'GND', NetType.GROUND, [
    p(gnd, '1', 'GND'), p(vac, '2'), p(ua, 'VEE', 'VEE')
  ]);

  // U2 TL082 跟随缓冲
  const tl = K.place(doc, 'TL082', 'U2', { x: 480, y: 140 });
  const rTl = R(doc, 'R_10k', 'R2', 360, 100);
  K.join(doc, 'OUT741', NetType.SIGNAL, [p(rTl, '1')]);
  K.join(doc, 'TL_IN', NetType.SIGNAL, [p(rTl, '2'), p(tl, 'IN+1', 'IN+1')]);
  K.join(doc, 'TL_OUT', NetType.SIGNAL, [
    p(tl, 'OUT1', 'OUT1'), p(tl, 'IN-1', 'IN-1')
  ]);
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(tl, 'V+', 'V+')]);
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(tl, 'V-', 'V-')]);
  tieUnusedDualOpAmpB(doc, tl);

  // U3 LM358 同相增益 1+Rf/Rg=11 → DC≈2.2V（0.2V 偏置）
  const lm = K.place(doc, 'LM358', 'U3', { x: 720, y: 140 });
  const ri3 = R(doc, 'R_10k', 'R3', 600, 100);
  const rf3 = R(doc, 'R_100k', 'Rf3', 720, 40);
  const rg3 = R(doc, 'R_10k', 'Rg3', 620, 240);
  K.join(doc, 'TL_OUT', NetType.SIGNAL, [p(ri3, '1')]);
  K.join(doc, 'LM_IN', NetType.SIGNAL, [p(ri3, '2'), p(lm, 'IN+1', 'IN+1')]);
  K.join(doc, 'LM_FB', NetType.SIGNAL, [p(lm, 'IN-1', 'IN-1'), p(rf3, '1'), p(rg3, '1')]);
  K.join(doc, 'LM_OUT', NetType.SIGNAL, [p(lm, 'OUT1', 'OUT1'), p(rf3, '2')]);
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(lm, 'V+', 'V+')]);
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(lm, 'V-', 'V-'), p(rg3, '2')]);
  tieUnusedDualOpAmpB(doc, lm);

  const vm = K.place(doc, 'VOLTMETER_DC', 'M1', { x: 840, y: 100 });
  K.join(doc, 'LM_OUT', NetType.SIGNAL, [p(vm, 'V+', 'V+')]);
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(vm, 'COM', 'COM')]);

  // 线性稳压：列距≥260，避免 CO.GND 竖线与下一列 CI.VCC 脚同 x 被 WireNetTopology T 结短路
  // （旧 ox+i*200：CO@ox+160 pin2 与下一 CI@ox+20 pin1 同落 x=350/550）
  const regs = ['LM7805', 'LM7812', 'AMS1117_3V3'];
  for (let i = 0; i < regs.length; i++) {
    const ox = 140 + i * 260;
    const u = K.place(doc, regs[i], `REG${i + 1}`, { x: ox + 80, y: 360 });
    const ci = C(doc, 'C_10uF', `CI${i + 1}`, ox + 40, 430);
    const co = C(doc, 'C_100nF', `CO${i + 1}`, ox + 140, 520);
    const rl = R(doc, 'R_10k', `RL${i + 1}`, ox + 140, 580);
    K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(ci, '1'), p(u, '1')]);
    K.join(doc, `VOUT_R${i}`, NetType.POWER, [p(u, '3'), p(co, '1'), p(rl, '1')]);
    K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(u, '2')]);
    K.join(doc, 'GND', NetType.GROUND, [p(u, '2'), p(ci, '2')]);
    K.join(doc, 'GND', NetType.GROUND, [p(u, '2'), p(co, '2'), p(rl, '2')]);
  }

  // Buck：右移避开 REG3；具名脚 VIN/OUT/GND/FB/ON（勿用旧数字脚，否则偏移落原点短路）
  const buck = K.place(doc, 'LM2596', 'U4', { x: 980, y: 360 });
  const cBin = C(doc, 'C_100uF', 'CBI', 900, 430);
  const cBout = C(doc, 'C_100uF', 'CBO', 1120, 520);
  const lBuck = K.place(doc, 'L_10uH', 'LB', { x: 1080, y: 280 });
  const rBfb = R(doc, 'R_10k', 'RFB', 1040, 580);
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(cBin, '1'), p(buck, 'VIN', 'VIN')]);
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(buck, 'GND', 'GND')]);
  K.join(doc, 'GND', NetType.GROUND, [p(buck, 'GND', 'GND'), p(cBin, '2')]);
  K.join(doc, 'GND', NetType.GROUND, [p(buck, 'GND', 'GND'), p(cBout, '2'), p(rBfb, '2')]);
  K.join(doc, 'BUCK_SW', NetType.SIGNAL, [p(buck, 'OUT', 'OUT'), p(lBuck, '1')]);
  K.join(doc, 'BUCK_OUT', NetType.POWER, [
    p(lBuck, '2'), p(cBout, '1'), p(buck, 'FB', 'FB'), p(buck, 'ON', 'ON'), p(rBfb, '1')
  ]);

  // U5 LM555 无稳态：独立岛（x≥1400），远离 Buck；信号用标号并网
  // 根因1：kit 缺 555 脚偏移 → 全脚落中心 → VCC∪GND 短路
  // 根因2：DISCH 水平线 y=TRIG → T 结并入 555_CAP
  // CT=100µF → f≈0.69Hz（RA=1k RB=10k），肉眼可见闪烁；1µF≈69Hz 会被视觉暂留看成常亮
  const t555 = K.place(doc, 'LM555', 'U5', { x: 1560, y: 160 });
  const ra = R(doc, 'R_1k', 'RA', 1400, 60);
  const rb = R(doc, 'R_10k', 'RB', 1400, 200);
  const ct = C(doc, 'C_100uF', 'CT', 1400, 320);
  const cDec555 = C(doc, 'C_100nF', 'CD555', 1720, 40);
  const cCtrl = C(doc, 'C_100nF', 'CC555', 1720, 300);
  const rLed = R(doc, 'R_330', 'RLED', 1780, 160);
  const led555 = K.place(doc, 'LED_RED', 'D555', { x: 1920, y: 160 });
  K.joinByLabel(doc, 'VCC', NetType.POWER, [
    p(vcc, '1', 'VCC'), p(t555, 'VCC', 'VCC'), p(t555, 'RESET', 'RESET'),
    p(ra, '1'), p(cDec555, '1')
  ]);
  K.joinByLabel(doc, 'DISCH', NetType.SIGNAL, [
    p(ra, '2'), p(rb, '1'), p(t555, 'DISCH', 'DISCH')
  ]);
  K.joinByLabel(doc, '555_CAP', NetType.SIGNAL, [
    p(rb, '2'), p(t555, 'THRES', 'THRES'), p(t555, 'TRIG', 'TRIG'), p(ct, '1')
  ]);
  K.joinByLabel(doc, 'LM555_OUT', NetType.SIGNAL, [
    p(t555, 'OUT', 'OUT'), p(rLed, '1')
  ]);
  K.series2(doc, 'LED555', p(rLed, '2'), p(led555, 'A', 'A'));
  K.joinByLabel(doc, 'CTRL', NetType.SIGNAL, [
    p(t555, 'CTRL', 'CTRL'), p(cCtrl, '1')
  ]);
  K.joinByLabel(doc, 'GND', NetType.GROUND, [
    p(gnd, '1', 'GND'), p(t555, 'GND', 'GND'), p(ct, '2'),
    p(cDec555, '2'), p(cCtrl, '2'), p(led555, 'K', 'K')
  ]);
}

/**
 * lab_digital: 门电路静态真值（原理图示意）+ 方波时钟驱动 CD4017 + LA
 * LA: CH1–CH7=Q0–Q6（走动脉冲）；CH8=CLK（~10Hz 方波）
 */
export function buildLabDigital(doc: SchematicDocument): void {
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 40, y: 40 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 40, y: 460 });
  // 0–5V 脉冲（OP=0V 种子为 L，暂态边沿干净）；10Hz → LA 可见，Q 走动约 1s/圈
  const clk = K.place(doc, 'SIGNAL_GEN', 'SG1', { x: 40, y: 340 });
  clk.parameters.set('waveform', 'pulse');
  clk.parameters.set('amplitude', '5V');
  clk.parameters.set('frequency', '10Hz');
  clk.parameters.set('offset', '0V');
  clk.parameters.set('dutyCycle', '50%');

  const rHi = R(doc, 'R_10k', 'RHI', 120, 80);
  const rLo = R(doc, 'R_10k', 'RLO', 120, 220);
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(rHi, '1')]);
  K.join(doc, 'LOGIC_H', NetType.SIGNAL, [p(rHi, '2')]);
  K.join(doc, 'GND', NetType.GROUND, [
    p(gnd, '1', 'GND'), p(rLo, '2'), p(clk, 'GND', 'GND')
  ]);
  K.join(doc, 'LOGIC_L', NetType.SIGNAL, [p(rLo, '1')]);

  const gateDefs: GateDef[] = [
    gate('74HC00', 'U1', true),
    gate('74HC02', 'U2', true),
    gate('74HC04', 'U3', false),
    gate('74HC08', 'U4', true),
    gate('74HC32', 'U5', true),
    gate('74HC74', 'U6', true)
  ];
  for (let i = 0; i < gateDefs.length; i++) {
    const g = gateDefs[i];
    const u = K.place(doc, g.id, g.ref, { x: 260 + i * 160, y: 180 });
    K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(u, '14')]);
    K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(u, '7')]);
    if (g.dual) {
      K.join(doc, 'LOGIC_H', NetType.SIGNAL, [p(u, '1')]);
      K.join(doc, 'LOGIC_L', NetType.SIGNAL, [p(u, '2')]);
    } else {
      K.join(doc, 'LOGIC_H', NetType.SIGNAL, [p(u, '1')]);
    }
  }

  // 4017 放到最右，与 LA 错层；具名脚（数字脚偏移为 0 会与 LA 原点短路）
  const cnt = K.place(doc, 'CD4017', 'U7', { x: 1180, y: 180 });
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(cnt, 'VDD', 'VDD')]);
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(cnt, 'VSS', 'VSS')]);
  // CLK 用标号并网：避免与门电路 LOGIC_H 水平廊道误并
  K.joinByLabel(doc, 'CLK', NetType.SIGNAL, [
    p(clk, 'OUT', 'OUT'), p(cnt, 'CLK', 'CLK')
  ]);
  K.join(doc, 'LOGIC_L', NetType.SIGNAL, [p(rLo, '1'), p(cnt, 'EN', 'EN')]);
  // RST 用标号并网：物理布线在拓扑重建后易拆成孤立 NET_xx
  K.joinByLabel(doc, 'LOGIC_L', NetType.SIGNAL, [p(cnt, 'RST', 'RST')]);

  const la = K.place(doc, 'LOGIC_ANALYZER', 'LA1', { x: 1180, y: 400 });
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(la, 'GND', 'GND')]);
  // LA 看走动输出：Q0..Q6 → CH1..CH7；CLK → CH8
  const qPins = ['Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'];
  for (let ch = 0; ch < qPins.length; ch++) {
    const qn = qPins[ch];
    K.join(doc, `LA_CH${ch + 1}`, NetType.SIGNAL, [
      p(la, `CH${ch + 1}`, `CH${ch + 1}`), p(cnt, qn, qn)
    ]);
  }
  K.joinByLabel(doc, 'CLK', NetType.SIGNAL, [p(la, 'CH8', 'CH8')]);
}

/** lab_memory: MCU + I2C/SPI/并行存储器 + LA；固件 lab_memory.hex 位带演示总线活动。
 *  电源/I2C/SPI 一律 joinByLabel，避免物理 GND 轨穿过 OSC 廊道把晶振与 I2C 并成 NET_1。
 *  LA: CH1=SCL CH2=SDA CH3=SCK CH4=CS CH5=MOSI CH6=MEM_CE CH7=SRAM_CE CH8=A0
 */
export function buildLabMemory(doc: SchematicDocument): void {
  const mcu = K.place(doc, 'STM32F103RC', 'U1', { x: 200, y: 260 });
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 40, y: 10 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 40, y: 500 });
  const cDec = C(doc, 'C_100nF', 'C1', 320, 420);
  const rRst = R(doc, 'R_10k', 'R1', 20, 400);
  const xtal = K.place(doc, 'XTAL_8M', 'Y1', { x: 60, y: 50 });
  const _caps = placeXtalCaps(doc, 60, 50, 'CX');
  const c1 = _caps.c1;
  const c2 = _caps.c2;
  K.crystal(doc, mcu, xtal, c1, c2, 'OSC_IN', 'OSC_OUT', '', gnd);
  K.mcuCore(doc, mcu, vcc, gnd, rRst, cDec, 'VDD', 'VSS', 'NRST');

  const eep = K.place(doc, '24C02', 'M1', { x: 500, y: 140 });
  const rSda = R(doc, 'R_4.7k', 'RSDA', 400, 100);
  const rScl = R(doc, 'R_4.7k', 'RSCL', 400, 180);
  const flash = K.place(doc, 'W25Q64', 'M2', { x: 680, y: 140 });
  const eprom = K.place(doc, '2764', 'M3', { x: 900, y: 220 });
  const sram = K.place(doc, '62256', 'M4', { x: 1100, y: 220 });

  const gndEep = K.place(doc, 'GND', 'GND_EEP', { x: 500, y: 300 });
  const vccEep = K.place(doc, 'VCC', 'VCC_EEP', { x: 500, y: 20 });
  const gndFlash = K.place(doc, 'GND', 'GND_FL', { x: 680, y: 300 });
  const vccFlash = K.place(doc, 'VCC', 'VCC_FL', { x: 680, y: 20 });
  const gndMcuL = K.place(doc, 'GND', 'GND_MCU_L', { x: 80, y: 520 });
  const gndMcuR = K.place(doc, 'GND', 'GND_MCU_R', { x: 360, y: 520 });

  K.joinByLabel(doc, 'I2C_SDA', NetType.SIGNAL, [
    p(mcu, 'PB7', 'PB7'), p(eep, 'SDA', 'SDA'), p(rSda, '2')
  ]);
  K.joinByLabel(doc, 'I2C_SCL', NetType.SIGNAL, [
    p(mcu, 'PB6', 'PB6'), p(eep, 'SCL', 'SCL'), p(rScl, '2')
  ]);
  K.joinByLabel(doc, 'SPI_CS', NetType.SIGNAL, [p(flash, 'CS', 'CS'), p(mcu, 'PA4', 'PA4')]);
  K.joinByLabel(doc, 'SPI_MISO', NetType.SIGNAL, [p(flash, 'DO', 'DO'), p(mcu, 'PA6', 'PA6')]);
  K.joinByLabel(doc, 'SPI_MOSI', NetType.SIGNAL, [p(flash, 'DI', 'DI'), p(mcu, 'PA7', 'PA7')]);
  K.joinByLabel(doc, 'SPI_SCK', NetType.SIGNAL, [p(flash, 'CLK', 'CLK'), p(mcu, 'PA5', 'PA5')]);

  K.joinByLabel(doc, 'MEM_CE', NetType.SIGNAL, [p(eprom, 'CE', 'CE'), p(mcu, 'PB8', 'PB8')]);
  K.joinByLabel(doc, 'MEM_OE', NetType.SIGNAL, [p(eprom, 'OE', 'OE'), p(mcu, 'PB9', 'PB9')]);
  K.joinByLabel(doc, 'SRAM_CE', NetType.SIGNAL, [p(sram, 'CE', 'CE'), p(mcu, 'PB10', 'PB10')]);
  K.joinByLabel(doc, 'SRAM_OE', NetType.SIGNAL, [p(sram, 'OE', 'OE'), p(mcu, 'PB11', 'PB11')]);
  K.joinByLabel(doc, 'SRAM_WE', NetType.SIGNAL, [p(sram, 'WE', 'WE'), p(mcu, 'PB12', 'PB12')]);

  const addrMem = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'];
  const addrMcu = ['PC0', 'PC1', 'PC2', 'PC3', 'PC4', 'PC5', 'PC6', 'PC7'];
  for (let ai = 0; ai < 8; ai++) {
    K.joinByLabel(doc, `MEM_A${ai}`, NetType.SIGNAL, [
      p(eprom, addrMem[ai]), p(sram, addrMem[ai]),
      p(mcu, addrMcu[ai], addrMcu[ai])
    ]);
  }
  const dataMem = ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'];
  const dataMcu = ['PA8', 'PA9', 'PA10', 'PA11', 'PA12', 'PA13', 'PA14', 'PA15'];
  for (let di = 0; di < 8; di++) {
    K.joinByLabel(doc, `MEM_D${di}`, NetType.SIGNAL, [
      p(eprom, dataMem[di]), p(sram, dataMem[di]),
      p(mcu, dataMcu[di], dataMcu[di])
    ]);
  }

  K.joinByLabel(doc, 'GND', NetType.GROUND, [
    p(gndEep, '1', 'GND'), p(eep, 'A0', 'A0'), p(eep, 'A1', 'A1'), p(eep, 'A2', 'A2'),
    p(eep, 'VSS', 'VSS'), p(eep, 'WP', 'WP')
  ]);
  K.joinByLabel(doc, 'VCC', NetType.POWER, [
    p(vccEep, '1', 'VCC'), p(eep, 'VCC', 'VCC'), p(rSda, '1'), p(rScl, '1')
  ]);
  K.joinByLabel(doc, 'VCC', NetType.POWER, [
    p(vccFlash, '1', 'VCC'), p(flash, 'VCC', 'VCC'), p(flash, 'WP', 'WP'), p(flash, 'HOLD', 'HOLD')
  ]);
  K.joinByLabel(doc, 'GND', NetType.GROUND, [p(gndFlash, '1', 'GND'), p(flash, 'GND', 'GND')]);

  const gndMem = K.place(doc, 'GND', 'GND_MEM', { x: 1250, y: 400 });
  const vccMem = K.place(doc, 'VCC', 'VCC_MEM', { x: 1250, y: 40 });
  K.joinByLabel(doc, 'GND', NetType.GROUND, [
    p(gndMem, '1', 'GND'), p(eprom, 'GND', 'GND'), p(sram, 'GND', 'GND')
  ]);
  K.joinByLabel(doc, 'VCC', NetType.POWER, [
    p(vccMem, '1', 'VCC'), p(eprom, 'VCC', 'VCC'), p(sram, 'VCC', 'VCC'), p(eprom, 'VPP', 'VPP')
  ]);

  K.joinByLabel(doc, 'GND', NetType.GROUND, [
    p(gndMcuL, '1', 'GND'), p(mcu, 'VSS', 'VSS')
  ]);
  K.joinByLabel(doc, 'GND', NetType.GROUND, [
    p(gndMcuR, '1', 'GND'), p(mcu, 'VSSA', 'VSSA')
  ]);

  K.joinByLabel(doc, 'GND', NetType.GROUND, [
    p(gnd, '1', 'GND'), p(gndEep, '1', 'GND'), p(gndFlash, '1', 'GND'),
    p(gndMem, '1', 'GND'), p(gndMcuL, '1', 'GND'), p(gndMcuR, '1', 'GND')
  ]);
  K.joinByLabel(doc, 'VCC', NetType.POWER, [
    p(vcc, '1', 'VCC'), p(vccEep, '1', 'VCC'), p(vccFlash, '1', 'VCC'), p(vccMem, '1', 'VCC')
  ]);

  const la = K.place(doc, 'LOGIC_ANALYZER', 'LA1', { x: 1280, y: 520 });
  K.joinByLabel(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(la, 'GND', 'GND')]);
  K.joinByLabel(doc, 'I2C_SCL', NetType.SIGNAL, [p(la, 'CH1', 'CH1')]);
  K.joinByLabel(doc, 'I2C_SDA', NetType.SIGNAL, [p(la, 'CH2', 'CH2')]);
  K.joinByLabel(doc, 'SPI_SCK', NetType.SIGNAL, [p(la, 'CH3', 'CH3')]);
  K.joinByLabel(doc, 'SPI_CS', NetType.SIGNAL, [p(la, 'CH4', 'CH4')]);
  K.joinByLabel(doc, 'SPI_MOSI', NetType.SIGNAL, [p(la, 'CH5', 'CH5')]);
  K.joinByLabel(doc, 'MEM_CE', NetType.SIGNAL, [p(la, 'CH6', 'CH6')]);
  K.joinByLabel(doc, 'SRAM_CE', NetType.SIGNAL, [p(la, 'CH7', 'CH7')]);
  K.joinByLabel(doc, 'MEM_A0', NetType.SIGNAL, [p(la, 'CH8', 'CH8')]);
}

/** lab_mcu_8051: 四款 8051 最小系统
 *  固件 lab_mcu_8051.hex 驱动 P1.0 灌电流闪烁。
 *  布局对齐 lab_51_led：晶振贴 XTAL 脚高度；LED 在 MCU 左侧（P1 侧）；
 *  L*_K 用 joinByLabel 双侧 stub——仅 LED stub 时几何重建会丢掉 MCU 脚 → GPIO_MISS。
 */
export function buildLabMcu8051(doc: SchematicDocument): void {
  const ids = ['AT89C51', 'AT89C52', 'STC89C52', 'STC15W408AS'];
  const xtals = ['XTAL_11M', 'XTAL_11M', 'XTAL_11M', 'XTAL_8M'];
  for (let i = 0; i < ids.length; i++) {
    // 列距 ≥420：邻列勿切穿本列 P1 stub / 晶振区
    const ox = 40 + i * 420;
    const mcu = K.place(doc, ids[i], `U${i + 1}`, { x: ox + 200, y: 240 });
    // XTAL1/2 ≈ y310–320（mcu@240）；勿放 y=40，否则竖线穿过全部 P1 stub
    const xtal = K.place(doc, xtals[i], `Y${i + 1}`, { x: ox + 40, y: 310 });
    const _caps = placeXtalCaps(doc, ox + 40, 310, `CX${i}`);
  const c1 = _caps.c1;
  const c2 = _caps.c2;
    const cDec = C(doc, 'C_100nF', `CD${i + 1}`, ox + 320, 380);
    const rRst = R(doc, 'R_10k', `R${i + 1}`, ox + 10, 400);
    const vcc = K.place(doc, 'VCC', `PWR${i + 1}`, { x: ox, y: 10 });
    const gnd = K.place(doc, 'GND', `GND${i + 1}`, { x: ox, y: 480 });
    // 灌电流：VCC→R→LED→P1.0；LED 贴 P1.0 高度（≈140）在 MCU 左侧
    const ledR = R(doc, 'R_330', `RL${i + 1}`, ox + 20, 140);
    const led = K.place(doc, 'LED_RED', `D${i + 1}`, { x: ox + 90, y: 140 });
    K.crystal(doc, mcu, xtal, c1, c2, 'XTAL1', 'XTAL2', `M${i}_`, gnd);
    K.mcuCore(doc, mcu, vcc, gnd, rRst, cDec, 'VCC', 'GND', 'RST', `M${i}_`);
    K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(mcu, 'EA', 'EA'), p(ledR, '1')]);
    K.series2(doc, `L${i}_A`, p(ledR, '2'), p(led, 'A', 'A'));
    K.joinByLabel(doc, `L${i}_K`, NetType.SIGNAL, [
      p(led, 'K', 'K'),
      p(mcu, 'P1.0', 'P1.0')
    ]);
  }
}

/** lab_mcu_stm32: 五款 STM32 最小系统 */
export function buildLabMcuStm32(doc: SchematicDocument): void {
  const ids = ['STM32F103C8', 'STM32F103RC', 'STM32F407VG', 'STM32L431CB', 'STM32F030F4'];
  // F407 百脚封装极宽：列宽 ≥720，GND 下沉，避免 P11 等空脚 stub 并入电源地轨
  let ox = 40;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const isF407 = id.includes('F407');
    const colW = isF407 ? 720 : 520;
    const vccPin = 'VDD';
    const gndPin = 'VSS';
    const mcu = K.place(doc, id, `U${i + 1}`, { x: ox + (isF407 ? 260 : 160), y: 240 });
    const xtal = K.place(doc, 'XTAL_8M', `Y${i + 1}`, { x: ox + 40, y: 40 });
    // DeepErcEngine：两侧负载电容须 |Δx|<80（placeXtalCaps = ±60）
    const _caps = placeXtalCaps(doc, ox + 40, 40, `CX${i}`);
  const c1 = _caps.c1;
  const c2 = _caps.c2;
    const cDec = C(doc, 'C_10uF', `CD${i + 1}`, ox + 300, 460);
    const rRst = R(doc, 'R_10k', `R${i + 1}`, ox + 10, 420);
    const vcc = K.place(doc, 'VCC', `PWR${i + 1}`, { x: ox, y: 10 });
    const gnd = K.place(doc, 'GND', `GND${i + 1}`, { x: ox, y: isF407 ? 580 : 520 });
    const ledR = R(doc, 'R_330', `RL${i + 1}`, ox + 320, 340);
    const led = K.place(doc, 'LED_GREEN', `D${i + 1}`, { x: ox + 420, y: 340 });
    K.crystal(doc, mcu, xtal, c1, c2, 'OSC_IN', 'OSC_OUT', `S${i}_`, gnd);
    K.mcuCore(doc, mcu, vcc, gnd, rRst, cDec, vccPin, gndPin, 'NRST', `S${i}_`);
    K.ledBranch(doc, p(mcu, 'PA0', 'PA0'), p(gnd, '1', 'GND'), ledR, led, `L${i}`);
    ox += colW;
  }
}

/** lab_peripheral: 按键/继电器(触点指示)/蜂鸣器/LCD/OLED
 *  引脚均落在 GPIOA→Pn 教学映射内（P1=PA0…P16=PA15），配合 lab_peripheral.hex：
 *  KEY=P2(PA1) REL=P3(PA2) BUZ=P4(PA3) OLED=P8/P9(PA7/8) LCD RS=P11 E=P16 D4–D7=P12–P15
 *  继电器：线圈 P3→RR→K1.1→K1.2→GND；触点 VCC→R→LED→NO/NC，COM→GND
 *  （线圈吸合后红灯 DNO 亮、绿灯 DNC 灭；释放则相反）
 */
export function buildLabPeripheral(doc: SchematicDocument): void {
  const mcu = K.place(doc, 'STM32F103C8', 'U1', { x: 200, y: 260 });
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 40, y: 10 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 40, y: 560 });
  const cDec = C(doc, 'C_100nF', 'C1', 320, 440);
  const rRst = R(doc, 'R_10k', 'R1', 20, 400);
  // 晶振贴顶：CX 在 y≈40，勿与 KEY(y≈160)/REL 左脚总线交叉导致拓扑并网
  const xtal = K.place(doc, 'XTAL_8M', 'Y1', { x: 40, y: 0 });
  const _caps = placeXtalCaps(doc, 40, 0, 'CX');
  const cx1 = _caps.c1;
  const cx2 = _caps.c2;
  K.crystal(doc, mcu, xtal, cx1, cx2, 'OSC_IN', 'OSC_OUT', '', gnd);
  K.mcuCore(doc, mcu, vcc, gnd, rRst, cDec, 'VDD', 'VSS', 'NRST');

  // 外设分带：按键上 / 驱动中 / 触点指示右中 / 显示右下；中心距须 >120
  const sw = K.place(doc, 'SW_PUSH', 'SW1', { x: 560, y: 160 });
  const rPull = R(doc, 'R_10k', 'R2', 360, 160);
  K.join(doc, 'KEY', NetType.SIGNAL, [p(sw, '1'), p(mcu, 'PA1', 'PA1'), p(rPull, '1')]);
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(rPull, '2')]);
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(sw, '2')]);

  const relay = K.place(doc, 'RELAY_SPDT', 'K1', { x: 560, y: 220 });
  const rRel = R(doc, 'R_330', 'RR', 440, 220);
  K.join(doc, 'REL_DRV', NetType.SIGNAL, [p(rRel, '1'), p(mcu, 'PA2', 'PA2')]);
  K.series2(doc, 'REL_COIL', p(rRel, '2'), p(relay, '1'));
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(relay, '2'), p(relay, 'COM', 'COM')]);

  // 触点指示：VCC→R→LED→NO/NC；COM 已接 GND。吸合 DNO 亮 / 释放 DNC 亮
  // NO/NC 跨 LCD 区用标号并网，避免 y=240 总线穿 RVO
  const rNo = R(doc, 'R_330', 'RLNO', 680, 80);
  const ledNo = K.place(doc, 'LED_RED', 'DNO', { x: 800, y: 80 });
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(rNo, '1')]);
  K.series2(doc, 'REL_NO_A', p(rNo, '2'), p(ledNo, 'A', 'A'));
  K.joinByLabel(doc, 'REL_NO', NetType.SIGNAL, [p(ledNo, 'K', 'K'), p(relay, 'NO', 'NO')]);

  const rNc = R(doc, 'R_330', 'RLNC', 680, 280);
  const ledNc = K.place(doc, 'LED_GREEN', 'DNC', { x: 800, y: 280 });
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(rNc, '1')]);
  K.series2(doc, 'REL_NC_A', p(rNc, '2'), p(ledNc, 'A', 'A'));
  K.joinByLabel(doc, 'REL_NC', NetType.SIGNAL, [p(ledNc, 'K', 'K'), p(relay, 'NC', 'NC')]);

  const buzz = K.place(doc, 'BUZZER', 'BZ1', { x: 680, y: 340 });
  const rb = R(doc, 'R_330', 'RBZ', 560, 340);
  K.join(doc, 'BUZ', NetType.SIGNAL, [p(rb, '1'), p(mcu, 'PA3', 'PA3')]);
  K.series2(doc, 'BUZ_DRV', p(rb, '2'), p(buzz, '1'));
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(buzz, '2')]);

  const lcd = K.place(doc, 'LCD1602', 'LCD1', { x: 960, y: 160 });
  const rVo = R(doc, 'R_10k', 'RVO', 800, 240);
  K.join(doc, 'GND', NetType.GROUND, [
    p(gnd, '1', 'GND'), p(lcd, 'VSS', 'VSS'), p(lcd, 'RW', 'RW'), p(lcd, 'K', 'K'), p(rVo, '2')
  ]);
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(lcd, 'VDD', 'VDD'), p(lcd, 'A', 'A')]);
  K.join(doc, 'LCD_VO', NetType.SIGNAL, [p(lcd, 'V0', 'V0'), p(rVo, '1')]);
  K.join(doc, 'LCD_RS', NetType.SIGNAL, [p(lcd, 'RS', 'RS'), p(mcu, 'PB0', 'PB0')]);
  K.join(doc, 'LCD_E', NetType.SIGNAL, [p(lcd, 'E', 'E'), p(mcu, 'PB1', 'PB1')]);
  K.join(doc, 'LCD_D4', NetType.SIGNAL, [p(lcd, 'D4', 'D4'), p(mcu, 'PB12', 'PB12')]);
  K.join(doc, 'LCD_D5', NetType.SIGNAL, [p(lcd, 'D5', 'D5'), p(mcu, 'PB13', 'PB13')]);
  K.join(doc, 'LCD_D6', NetType.SIGNAL, [p(lcd, 'D6', 'D6'), p(mcu, 'PB14', 'PB14')]);
  K.join(doc, 'LCD_D7', NetType.SIGNAL, [p(lcd, 'D7', 'D7'), p(mcu, 'PB15', 'PB15')]);

  const oled = K.place(doc, 'OLED_12864', 'OLED1', { x: 960, y: 420 });
  const rOsda = R(doc, 'R_4.7k', 'RODA', 800, 380);
  const rOscl = R(doc, 'R_4.7k', 'ROCL', 800, 440);
  K.join(doc, 'VCC', NetType.POWER, [
    p(vcc, '1', 'VCC'), p(oled, 'VCC', 'VCC'), p(rOsda, '1'), p(rOscl, '1')
  ]);
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(oled, 'GND', 'GND')]);
  K.join(doc, 'OLED_SDA', NetType.SIGNAL, [
    p(oled, 'SDA', 'SDA'), p(mcu, 'PB7', 'PB7'), p(rOsda, '2')
  ]);
  K.join(doc, 'OLED_SCL', NetType.SIGNAL, [
    p(oled, 'SCL', 'SCL'), p(mcu, 'PB6', 'PB6'), p(rOscl, '2')
  ]);
}

/** lab_sensor: DS18B20(可拖温)+霍尔(点击磁场)+电位器/光敏；需烧录 lab_sensor.hex
 *  固件：PA0/PA3/PB0 输入 → PA4/PA5/PA6 指示灯
 *  信号/电源一律 joinByLabel，避免 TOPO 把 HALL 与 OSC_IN 并成 NET_1。
 */
export function buildLabSensor(doc: SchematicDocument): void {
  const mcu = K.place(doc, 'STM32F103C8', 'U1', { x: 200, y: 280 });
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 40, y: 10 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 40, y: 560 });
  const cDec = C(doc, 'C_100nF', 'C1', 320, 480);
  const rRst = R(doc, 'R_10k', 'R1', 20, 440);
  const xtal = K.place(doc, 'XTAL_8M', 'Y1', { x: 60, y: 50 });
  const _caps = placeXtalCaps(doc, 60, 50, 'CX');
  const cx1 = _caps.c1;
  const cx2 = _caps.c2;
  K.crystal(doc, mcu, xtal, cx1, cx2, 'OSC_IN', 'OSC_OUT', '', gnd);
  K.mcuCore(doc, mcu, vcc, gnd, rRst, cDec, 'VDD', 'VSS', 'NRST');

  const ds = K.place(doc, 'DS18B20', 'T1', { x: 620, y: 100 });
  ds.parameters.set('temp_c', '25');
  const rDs = R(doc, 'R_4.7k', 'R2', 500, 60);
  const vmTemp = K.place(doc, 'VOLTMETER_DC', 'M2', { x: 820, y: 80 });
  K.joinByLabel(doc, '1WIRE', NetType.SIGNAL, [
    p(ds, 'DQ', 'DQ'), p(mcu, 'PA3', 'PA3'), p(rDs, '1'), p(vmTemp, 'V+', 'V+')
  ]);
  K.joinByLabel(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(rDs, '2'), p(ds, 'VDD', 'VDD')]);
  K.joinByLabel(doc, 'GND', NetType.GROUND, [
    p(gnd, '1', 'GND'), p(ds, 'GND', 'GND'), p(vmTemp, 'COM', 'COM')
  ]);

  const hall = K.place(doc, 'HALL_SENSOR', 'H1', { x: 620, y: 240 });
  hall.parameters.set('active', '0');
  const rHall = R(doc, 'R_10k', 'RH', 500, 240);
  K.joinByLabel(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(rHall, '1'), p(hall, 'VCC', 'VCC')]);
  K.joinByLabel(doc, 'HALL', NetType.SIGNAL, [
    p(hall, 'OUT', 'OUT'), p(mcu, 'PB0', 'PB0'), p(rHall, '2')
  ]);
  K.joinByLabel(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(hall, 'GND', 'GND')]);

  const pot = K.place(doc, 'POT_10k', 'RV1', { x: 600, y: 380 });
  pot.parameters.set('wiper', '0.5');
  const ldr = K.place(doc, 'LDR', 'LDR1', { x: 740, y: 440 });
  ldr.parameters.set('value', '50k');
  const vm = K.place(doc, 'VOLTMETER_DC', 'M1', { x: 820, y: 360 });
  K.joinByLabel(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(pot, '1')]);
  K.joinByLabel(doc, 'ADC', NetType.SIGNAL, [
    p(pot, 'W', 'W'), p(mcu, 'PA0', 'PA0'), p(vm, 'V+', 'V+'), p(ldr, '1')
  ]);
  K.joinByLabel(doc, 'GND', NetType.GROUND, [
    p(gnd, '1', 'GND'), p(pot, '2'), p(vm, 'COM', 'COM'), p(ldr, '2')
  ]);

  const ledLibs = ['LED_GREEN', 'LED_RED', 'LED_BLUE'];
  const ledRefs = ['D_ADC', 'D_HALL', 'D_TEMP'];
  const ledPins = ['PA4', 'PA5', 'PA6'];
  for (let i = 0; i < 3; i++) {
    const y = 100 + i * 90;
    const led = K.place(doc, ledLibs[i], ledRefs[i], { x: 1020, y });
    const rl = R(doc, 'R_330', `RL${i + 1}`, 920, y);
    const pin = ledPins[i];
    K.joinByLabel(doc, `LED_${pin}`, NetType.SIGNAL, [p(mcu, pin, pin), p(rl, '1')]);
    K.joinByLabel(doc, `LED_${pin}_A`, NetType.SIGNAL, [p(rl, '2'), p(led, 'A', 'A')]);
    K.joinByLabel(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(led, 'K', 'K')]);
  }
}

/**
 * lab_instruments: 全套虚拟仪器功能台
 * 万用表 VM1 四端：V→CLK(DCV/ACV)、A 串 LED(AMP)、OHM→R_1k+二极管(Ω/DIODE)、COM→GND
 */
export function buildLabInstruments(doc: SchematicDocument): void {
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 40, y: 40 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 40, y: 560 });
  const sg = K.place(doc, 'SIGNAL_GEN', 'SG1', { x: 40, y: 300 });
  sg.parameters.set('waveform', 'pulse');
  sg.parameters.set('amplitude', '5V');
  sg.parameters.set('frequency', '1kHz');
  sg.parameters.set('offset', '0V');
  sg.parameters.set('dutyCycle', '50%');

  const am = K.place(doc, 'AMMETER_DC', 'A1', { x: 140, y: 80 });
  const pm = K.place(doc, 'POWER_METER', 'PM1', { x: 260, y: 40 });
  const r1 = R(doc, 'R_10k', 'R1', 420, 200);
  const pot = K.place(doc, 'POT_10k', 'RV1', { x: 560, y: 200 });
  pot.parameters.set('wiper', '0.5');

  K.joinByLabel(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(am, 'I+', 'I+')]);
  K.series2(doc, 'AM_OUT', p(am, 'I-', 'I-'), p(pm, 'I+', 'I+'));
  K.series2(doc, 'HI', p(pm, 'I-', 'I-'), p(r1, '1'));
  K.joinByLabel(doc, 'TOP', NetType.SIGNAL, [p(r1, '2'), p(pot, '1')]);
  K.joinByLabel(doc, 'GND', NetType.GROUND, [
    p(gnd, '1', 'GND'), p(pot, '2'), p(sg, 'GND', 'GND')
  ]);
  K.joinByLabel(doc, 'HI', NetType.SIGNAL, [p(pm, 'V+', 'V+')]);
  K.joinByLabel(doc, 'GND', NetType.GROUND, [p(pm, 'V-', 'V-')]);

  const vm = K.place(doc, 'VOLTMETER_DC', 'M1', { x: 700, y: 40 });
  K.joinByLabel(doc, 'MID', NetType.SIGNAL, [p(pot, 'W', 'W'), p(vm, 'V+', 'V+')]);
  K.joinByLabel(doc, 'GND', NetType.GROUND, [p(vm, 'COM', 'COM')]);

  K.joinByLabel(doc, 'CLK', NetType.SIGNAL, [p(sg, 'OUT', 'OUT')]);

  const dmm = K.place(doc, 'VIRTUAL_METER', 'VM1', { x: 700, y: 160 });
  K.joinByLabel(doc, 'CLK', NetType.SIGNAL, [p(dmm, 'V', 'V')]);
  const rAmp = R(doc, 'R_330', 'RAMP', 620, 260);
  const ledAmp = K.place(doc, 'LED_RED', 'DAMP', { x: 700, y: 260 });
  K.joinByLabel(doc, 'VCC', NetType.POWER, [p(rAmp, '1')]);
  K.series2(doc, 'DMM_A', p(rAmp, '2'), p(ledAmp, 'A', 'A'));
  K.series2(doc, 'DMM_A_RET', p(ledAmp, 'K', 'K'), p(dmm, 'A', 'A'));
  const rOhm = R(doc, 'R_1k', 'ROHM', 620, 340);
  const dOhm = K.place(doc, '1N4148', 'DOHM', { x: 700, y: 340 });
  K.joinByLabel(doc, 'DMM_OHM', NetType.SIGNAL, [
    p(dmm, 'OHM', 'OHM'), p(rOhm, '1'), p(dOhm, 'A', 'A')
  ]);
  K.joinByLabel(doc, 'GND', NetType.GROUND, [
    p(dmm, 'COM', 'COM'), p(rOhm, '2'), p(dOhm, 'K', 'K')
  ]);

  const fc = K.place(doc, 'FREQ_COUNTER', 'FC1', { x: 700, y: 420 });
  K.joinByLabel(doc, 'CLK', NetType.SIGNAL, [p(fc, 'IN', 'IN')]);
  K.joinByLabel(doc, 'GND', NetType.GROUND, [p(fc, 'GND', 'GND')]);

  const osc = K.place(doc, 'OSCILLOSCOPE', 'OSC1', { x: 920, y: 60 });
  K.joinByLabel(doc, 'CLK', NetType.SIGNAL, [p(osc, 'CH1', 'CH1')]);
  K.joinByLabel(doc, 'HI', NetType.SIGNAL, [p(osc, 'CH2', 'CH2')]);
  K.joinByLabel(doc, 'MID', NetType.SIGNAL, [p(osc, 'CH3', 'CH3')]);
  K.joinByLabel(doc, 'TOP', NetType.SIGNAL, [p(osc, 'CH4', 'CH4')]);
  K.stubLabel(doc, p(osc, 'GND', 'GND'), 'GND', NetType.GROUND);

  const cnt = K.place(doc, 'CD4017', 'U7', { x: 920, y: 340 });
  K.joinByLabel(doc, 'VCC', NetType.POWER, [p(cnt, 'VDD', 'VDD')]);
  K.joinByLabel(doc, 'GND', NetType.GROUND, [p(cnt, 'VSS', 'VSS')]);
  K.joinByLabel(doc, 'CLK', NetType.SIGNAL, [p(cnt, 'CLK', 'CLK')]);
  K.joinByLabel(doc, 'LOGIC_L', NetType.SIGNAL, [p(cnt, 'EN', 'EN'), p(cnt, 'RST', 'RST')]);
  const rLo = R(doc, 'R_10k', 'RLO', 820, 500);
  K.joinByLabel(doc, 'LOGIC_L', NetType.SIGNAL, [p(rLo, '1')]);
  K.joinByLabel(doc, 'GND', NetType.GROUND, [p(rLo, '2')]);

  const la = K.place(doc, 'LOGIC_ANALYZER', 'LA1', { x: 1120, y: 300 });
  K.joinByLabel(doc, 'GND', NetType.GROUND, [p(la, 'GND', 'GND')]);
  const qPins = ['Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'];
  for (let ch = 0; ch < qPins.length; ch++) {
    const qn = qPins[ch];
    K.joinByLabel(doc, `LA_CH${ch + 1}`, NetType.SIGNAL, [
      p(la, `CH${ch + 1}`, `CH${ch + 1}`), p(cnt, qn, qn)
    ]);
  }
  K.joinByLabel(doc, 'CLK', NetType.SIGNAL, [p(la, 'CH8', 'CH8')]);

  const uart = K.place(doc, 'UART_TERMINAL', 'TERM1', { x: 1120, y: 60 });
  K.joinByLabel(doc, 'UART_LB', NetType.SIGNAL, [
    p(uart, 'TX', 'TX'), p(uart, 'RX', 'RX')
  ]);
  K.joinByLabel(doc, 'GND', NetType.GROUND, [p(uart, 'GND', 'GND')]);
}

/** lab_potentiometer: 三档滑动变阻器分压 + 电压表（补齐 POT_1k/10k/100k 覆盖） */
export function buildLabPotentiometer(doc: SchematicDocument): void {
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 40, y: 40 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 40, y: 420 });
  const potIds = ['POT_1k', 'POT_10k', 'POT_100k'];
  for (let i = 0; i < potIds.length; i++) {
    const ox = 200 + i * 280;
    const pot = K.place(doc, potIds[i], `RV${i + 1}`, { x: ox, y: 200 });
    pot.parameters.set('wiper', '0.5');
    const vm = K.place(doc, 'VOLTMETER_DC', `M${i + 1}`, { x: ox + 120, y: 80 });
    K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(pot, '1')]);
    K.join(doc, `WIPER${i + 1}`, NetType.SIGNAL, [p(pot, 'W', 'W'), p(vm, 'V+', 'V+')]);
    K.join(doc, 'GND', NetType.GROUND, [
      p(gnd, '1', 'GND'), p(pot, '2'), p(vm, 'COM', 'COM')
    ]);
  }
}

/**
 * lab_schmitt: UA741 滞回比较器（正反馈分压）+ 正弦激励 → 方波整形
 * β=Rg/(Rf+Rg)≈0.091；饱和约 +10.5/−11.9 → 阈值约 +0.95/−1.08V
 * 激励须 >|Vth|：1V 峰刚好够不到负阈值，输出会卡在一轨；用 2V 峰可靠翻转
 * CH1=激励 CH2=整形输出；全部 joinByLabel（避免 TOPO T 结并网）
 */
export function buildLabSchmitt(doc: SchematicDocument): void {
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 200, y: 40 });
  vcc.parameters.set('voltage', '12V');
  const vee = K.place(doc, 'VEE', 'VEE1', { x: 200, y: 360 });
  vee.parameters.set('voltage', '-12V');
  const gnd = K.place(doc, 'GND', 'GND1', { x: 60, y: 360 });
  const sig = K.place(doc, 'SIGNAL_GEN', 'SG1', { x: 60, y: 180 });
  sig.parameters.set('waveform', 'sine');
  sig.parameters.set('amplitude', '5V');
  sig.parameters.set('frequency', '1kHz');
  sig.parameters.set('offset', '0V');
  const opa = K.place(doc, 'UA741', 'U1', { x: 320, y: 180 });
  // Rf 放在 OUT 右侧，勿与运放/VCC 同 x（否则竖线踩电阻中段）
  const rf = R(doc, 'R_100k', 'Rf', 480, 100);
  const rg = R(doc, 'R_10k', 'Rg', 200, 280);
  const osc = K.place(doc, 'OSCILLOSCOPE', 'OSC1', { x: 640, y: 180 });

  K.joinByLabel(doc, 'INPUT_SIG', NetType.SIGNAL, [
    p(sig, 'OUT', 'OUT'), p(opa, 'IN-', 'IN-'), p(osc, 'CH1', 'CH1')
  ]);
  K.joinByLabel(doc, 'HYST', NetType.SIGNAL, [
    p(opa, 'IN+', 'IN+'), p(rf, '1'), p(rg, '1')
  ]);
  K.joinByLabel(doc, 'OUTPUT_SIG', NetType.SIGNAL, [
    p(opa, 'OUT', 'OUT'), p(rf, '2'), p(osc, 'CH2', 'CH2')
  ]);
  K.joinByLabel(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(opa, 'VCC', 'VCC')]);
  K.joinByLabel(doc, 'VEE', NetType.POWER, [p(vee, '1', 'VEE'), p(opa, 'VEE', 'VEE')]);
  // OSC GND 单独 stub+标号：勿与 CH stub 同批 joinByLabel，避免左插密排被 TOPO 并丢 GND
  // （同 lab_instruments；否则 SIM_CONN_BLOCK hard=OSC1(缺GND/COM)）
  K.joinByLabel(doc, 'GND', NetType.GROUND, [
    p(gnd, '1', 'GND'), p(sig, 'GND', 'GND'), p(rg, '2')
  ]);
  K.stubLabel(doc, p(osc, 'GND', 'GND'), 'GND', NetType.GROUND);
}

/**
 * lab_integrator: UA741 反相 RC 积分器 + 方波激励 → 示波器观三角波
 * R=10k C=100nF → τ=1ms；1kHz±5V 方波半周 ΔV≈2.5V（轨内）
 * Rf=100k 并电容作直流复位；CH1=方波 CH2=三角；全部 joinByLabel
 */
export function buildLabIntegrator(doc: SchematicDocument): void {
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 360, y: 40 });
  vcc.parameters.set('voltage', '12V');
  const vee = K.place(doc, 'VEE', 'VEE1', { x: 360, y: 360 });
  vee.parameters.set('voltage', '-12V');
  const gnd = K.place(doc, 'GND', 'GND1', { x: 60, y: 360 });
  const sig = K.place(doc, 'SIGNAL_GEN', 'SG1', { x: 60, y: 180 });
  sig.parameters.set('waveform', 'square');
  sig.parameters.set('amplitude', '5V');
  sig.parameters.set('frequency', '1kHz');
  sig.parameters.set('offset', '0V');
  sig.parameters.set('dutyCycle', '50%');
  const rIn = R(doc, 'R_10k', 'R1', 180, 180);
  const opa = K.place(doc, 'UA741', 'U1', { x: 360, y: 180 });
  // Cf/Rf 放 OUT 右侧上方，勿与运放同 x（竖线踩中段）
  const cf = C(doc, 'C_100nF', 'Cf', 500, 100);
  const rf = R(doc, 'R_100k', 'Rf', 500, 40);
  const osc = K.place(doc, 'OSCILLOSCOPE', 'OSC1', { x: 680, y: 180 });

  K.joinByLabel(doc, 'INPUT_SIG', NetType.SIGNAL, [
    p(sig, 'OUT', 'OUT'), p(rIn, '1'), p(osc, 'CH1', 'CH1')
  ]);
  K.joinByLabel(doc, 'INT_NODE', NetType.SIGNAL, [
    p(rIn, '2'), p(opa, 'IN-', 'IN-'), p(cf, '1'), p(rf, '1')
  ]);
  K.joinByLabel(doc, 'OUTPUT_SIG', NetType.SIGNAL, [
    p(opa, 'OUT', 'OUT'), p(cf, '2'), p(rf, '2'), p(osc, 'CH2', 'CH2')
  ]);
  K.joinByLabel(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(opa, 'VCC', 'VCC')]);
  K.joinByLabel(doc, 'VEE', NetType.POWER, [p(vee, '1', 'VEE'), p(opa, 'VEE', 'VEE')]);
  K.joinByLabel(doc, 'GND', NetType.GROUND, [
    p(gnd, '1', 'GND'), p(sig, 'GND', 'GND'), p(opa, 'IN+', 'IN+')
  ]);
  // OSC GND 单独 stub+标号（同 lab_schmitt / lab_instruments）
  K.stubLabel(doc, p(osc, 'GND', 'GND'), 'GND', NetType.GROUND);
}

/**
 * lab_555_astable: LM555（E555 同类）无稳态多谐振荡 + OUT→R→LED，示波器观方波
 * f≈1.44/((RA+2·RB)·C)≈69Hz（RA=1k RB=10k C=1µF）；默认示波器 10ms/div 可看方波
 * （10µF≈7Hz 时 1ms/div 整屏只有 10ms，波形会被截成平线）
 */
export function buildLab555Astable(doc: SchematicDocument): void {
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 40, y: 40 });
  vcc.parameters.set('voltage', '5V');
  const gnd = K.place(doc, 'GND', 'GND1', { x: 40, y: 360 });
  const t555 = K.place(doc, 'LM555', 'U1', { x: 280, y: 160 });
  const ra = R(doc, 'R_1k', 'RA', 120, 60);
  const rb = R(doc, 'R_10k', 'RB', 120, 200);
  const ct = C(doc, 'C_1uF', 'CT', 120, 320);
  const cDec = C(doc, 'C_100nF', 'CD1', 440, 40);
  const cCtrl = C(doc, 'C_100nF', 'CC1', 440, 300);
  const rLed = R(doc, 'R_330', 'RLED', 500, 160);
  const led = K.place(doc, 'LED_RED', 'D1', { x: 640, y: 160 });
  const osc = K.place(doc, 'OSCILLOSCOPE', 'OSC1', { x: 640, y: 300 });

  // 信号网用标号并网，避免 DISCH 水平线与 TRIG 同 y 被 T 结误并（同 lab_analog_ic）
  K.joinByLabel(doc, 'VCC', NetType.POWER, [
    p(vcc, '1', 'VCC'), p(t555, 'VCC', 'VCC'), p(t555, 'RESET', 'RESET'),
    p(ra, '1'), p(cDec, '1')
  ]);
  K.joinByLabel(doc, 'DISCH', NetType.SIGNAL, [
    p(ra, '2'), p(rb, '1'), p(t555, 'DISCH', 'DISCH')
  ]);
  K.joinByLabel(doc, '555_CAP', NetType.SIGNAL, [
    p(rb, '2'), p(t555, 'THRES', 'THRES'), p(t555, 'TRIG', 'TRIG'), p(ct, '1')
  ]);
  K.joinByLabel(doc, '555_OUT', NetType.SIGNAL, [
    p(t555, 'OUT', 'OUT'), p(rLed, '1'), p(osc, 'CH1', 'CH1')
  ]);
  K.series2(doc, 'LED_PATH', p(rLed, '2'), p(led, 'A', 'A'));
  K.joinByLabel(doc, '555_CTRL', NetType.SIGNAL, [
    p(t555, 'CTRL', 'CTRL'), p(cCtrl, '1')
  ]);
  K.joinByLabel(doc, 'GND', NetType.GROUND, [
    p(gnd, '1', 'GND'), p(t555, 'GND', 'GND'), p(ct, '2'),
    p(cDec, '2'), p(cCtrl, '2'), p(led, 'K', 'K'), p(osc, 'GND', 'GND')
  ]);
}

/**
 * lab_555_monostable: LM555（NE555 同类）单稳态延时 + 按键触发 + OUT→R→LED
 * t≈1.1·RT·CT≈1.1s（RT=100k CT=10µF）；按下 SW 拉低 TRIG → OUT 高亮 LED → 延时后熄灭
 * 拓扑对齐 AiTopologyFixKit.wire555Monostable / DeviceUsageManual LM555 单稳态
 */
export function buildLab555Monostable(doc: SchematicDocument): void {
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 40, y: 40 });
  vcc.parameters.set('voltage', '5V');
  const gnd = K.place(doc, 'GND', 'GND1', { x: 40, y: 360 });
  const t555 = K.place(doc, 'LM555', 'U1', { x: 320, y: 160 });
  const rt = R(doc, 'R_100k', 'RT', 160, 60);
  const rp = R(doc, 'R_10k', 'RP', 160, 200);
  const ct = C(doc, 'C_10uF', 'CT', 160, 320);
  const sw = K.place(doc, 'SW_PUSH', 'SW1', { x: 40, y: 200 });
  const cDec = C(doc, 'C_100nF', 'CD1', 480, 40);
  const cCtrl = C(doc, 'C_100nF', 'CC1', 480, 300);
  const rLed = R(doc, 'R_330', 'RLED', 540, 160);
  const led = K.place(doc, 'LED_RED', 'D1', { x: 680, y: 160 });

  // 电源：VCC / RESET / 定时电阻上端 / TRIG 上拉 / 去耦
  K.joinByLabel(doc, 'VCC', NetType.POWER, [
    p(vcc, '1', 'VCC'), p(t555, 'VCC', 'VCC'), p(t555, 'RESET', 'RESET'),
    p(rt, '1'), p(rp, '1'), p(cDec, '1')
  ]);
  // 定时节点：THRES ≡ DISCH ≡ RT.2 ≡ CT.1（禁止与 TRIG 并网）
  K.joinByLabel(doc, '555_RC', NetType.SIGNAL, [
    p(t555, 'THRES', 'THRES'), p(t555, 'DISCH', 'DISCH'),
    p(rt, '2'), p(ct, '1')
  ]);
  // 触发：TRIG ← RP 上拉；SW 另一端接 GND，按下拉低 TRIG
  K.joinByLabel(doc, 'TRIG', NetType.SIGNAL, [
    p(t555, 'TRIG', 'TRIG'), p(rp, '2'), p(sw, '2')
  ]);
  K.joinByLabel(doc, '555_OUT', NetType.SIGNAL, [
    p(t555, 'OUT', 'OUT'), p(rLed, '1')
  ]);
  K.series2(doc, 'LED_PATH', p(rLed, '2'), p(led, 'A', 'A'));
  K.joinByLabel(doc, '555_CTRL', NetType.SIGNAL, [
    p(t555, 'CTRL', 'CTRL'), p(cCtrl, '1')
  ]);
  K.joinByLabel(doc, 'GND', NetType.GROUND, [
    p(gnd, '1', 'GND'), p(t555, 'GND', 'GND'), p(ct, '2'),
    p(cDec, '2'), p(cCtrl, '2'), p(led, 'K', 'K'), p(sw, '1')
  ]);
}

