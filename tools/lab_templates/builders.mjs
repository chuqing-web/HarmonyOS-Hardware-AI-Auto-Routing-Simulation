/** 15 个实验模板构建器 — 完整连线 + 可仿真；布局避开正交 T 结并网 */
import { K, R, C, NetTypeEnum as NetType } from './kit.mjs';

function p(comp, pinId, pinName = pinId) {
  return { comp, pinId, pinName };
}

/** lab_power: LM7805 稳压 + 滤波 + 负载测量 */
export function buildLabPower(doc) {
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
export function buildLabAmp(doc) {
  // VAC 脚同行易被 SIG 横穿；信号链分 y，GND/VCC 符号作 hub
  // 单电源 5V：小信号 + 偏置，增益 1+Rf/Rg=11 → Vout≈2.2±1.1V
  const vac = K.place(doc, 'VAC', 'AC1', { x: 60, y: 220 });
  vac.parameters.amplitude = '0.1V';
  vac.parameters.frequency = '1kHz';
  vac.parameters.offset = '0.2V';
  const ri = R(doc, 'R_10k', 'R1', 160, 160);
  const opa = K.place(doc, 'LM358', 'U1', { x: 340, y: 180 });
  const rf = R(doc, 'R_100k', 'Rf', 340, 60);
  const rg = R(doc, 'R_10k', 'Rg', 240, 300);
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 340, y: 20 });
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
}

/** lab_filter: RC 低通 + LM358 电压跟随 */
export function buildLabFilter(doc) {
  const vac = K.place(doc, 'VAC', 'AC1', { x: 60, y: 220 });
  vac.parameters.amplitude = '0.5V';
  vac.parameters.frequency = '1kHz';
  vac.parameters.offset = '1.5V';
  const r1 = R(doc, 'R_1k', 'R1', 160, 140);
  const c1 = C(doc, 'C_100nF', 'C1', 260, 260);
  const opa = K.place(doc, 'LM358', 'U1', { x: 400, y: 180 });
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 400, y: 20 });
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
}

/** 晶振负载电容：左右分列；间距 <80 以满足 DeepErcEngine 邻近检测 */
function placeXtalCaps(doc, xtalX, xtalY, tag) {
  const c1 = C(doc, 'C_100nF', `${tag}1`, xtalX - 60, xtalY + 40);
  const c2 = C(doc, 'C_100nF', `${tag}2`, xtalX + 60, xtalY + 40);
  return { c1, c2 };
}

/** lab_51_led: AT89C51 流水灯最小系统 */
export function buildLab51Led(doc) {
  // MCU 偏右；晶振贴 XTAL；流水灯灌电流：VCC→R→LED→P1.x（经典 51 低电平点亮）
  const mcu = K.place(doc, 'AT89C51', 'U1', { x: 400, y: 220 });
  const xtal = K.place(doc, 'XTAL_11M', 'Y1', { x: 270, y: 295 });
  const { c1, c2 } = placeXtalCaps(doc, 270, 295, 'CX');
  const cDec = C(doc, 'C_100nF', 'C3', 500, 360);
  // 复位：电阻在 RST 左，pin2→RST / pin1→VCC
  const rRst = R(doc, 'R_10k', 'R1', 270, 200);
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 120, y: 10 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 120, y: 480 });
  const rPwr = R(doc, 'R_1k', 'R_PWR', 540, 40);
  const ledPwr = K.place(doc, 'LED_GREEN', 'D9', { x: 640, y: 40 });
  // 电压表下移：避免 V+/COM stub 标号相互抢吸附（原先同 x 仅差 20）
  const vm = K.place(doc, 'VOLTMETER_DC', 'M1', { x: 560, y: 520 });

  K.crystal(doc, mcu, xtal, c1, c2, 'P18', 'P19', '', gnd);
  K.mcuCore(doc, mcu, vcc, gnd, rRst, cDec, 'P40', 'P20', 'P9', '', true);
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(mcu, 'P31', 'P31'), p(vm, 'V+', 'V+')]);
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(vm, 'COM', 'COM')]);
  K.ledBranch(doc, p(vcc, '1', 'VCC'), p(gnd, '1', 'GND'), rPwr, ledPwr, 'PWR', 'VCC');

  // 灌电流流水灯：y 与 AT89 左脚列对齐（P1@120 … P8@190，脚距 10）
  // R@180 → LED@260 → MCU@350；标号 stub=20，同网 stub 端点相接
  for (let i = 0; i < 8; i++) {
    const pinY = 120 + i * 10;
    const rl = R(doc, 'R_330', `RL${i + 1}`, 180, pinY);
    const led = K.place(doc, 'LED_RED', `D${i + 1}`, { x: 260, y: pinY });
    const pinId = `P${i + 1}`;
    K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(rl, '1')]);
    K.series2(doc, `L${i}_A`, p(rl, '2'), p(led, 'A', 'A'));
    K.join(doc, `L${i}_K`, NetType.SIGNAL, [p(led, 'K', 'K'), p(mcu, pinId, pinId)]);
  }
}

/** lab_uart: STM32F103 UART + 终端 */
export function buildLabUart(doc) {
  const mcu = K.place(doc, 'STM32F103C8', 'U1', { x: 220, y: 220 });
  const xtal = K.place(doc, 'XTAL_8M', 'Y1', { x: 60, y: 60 });
  const { c1, c2 } = placeXtalCaps(doc, 60, 60, 'CX');
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

  K.crystal(doc, mcu, xtal, c1, c2, 'P5', 'P6', '', gnd);
  K.mcuCore(doc, mcu, vcc, gnd, rRst, cDec, 'P48', 'P24', 'P7');
  // 终端作 hub，TX/RX 各自高度横走，避免共享 MCU 左边脚列水平廊道
  K.join(doc, 'UART_TX', NetType.SIGNAL, [p(uart, 'TX', 'TX'), p(mcu, 'P10', 'P10')]);
  K.join(doc, 'UART_RX', NetType.SIGNAL, [p(uart, 'RX', 'RX'), p(mcu, 'P11', 'P11')]);
  K.join(doc, 'GND', NetType.GROUND, [
    p(gnd, '1', 'GND'), p(uart, 'GND', 'GND'), p(vm, 'COM', 'COM')
  ]);
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(vm, 'V+', 'V+')]);
  K.ledBranch(doc, p(vcc, '1', 'VCC'), p(gnd, '1', 'GND'), rPwr, ledPwr, 'PWR', 'VCC');
}

/** lab_passive: 电阻串/电容去耦/LC/交流支路 */
export function buildLabPassive(doc) {
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
  let prev = null;
  let r1 = null;
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

  // 电容去耦：中心距须 >100，否则 20px stub 与邻脚重合 → WireNetTopology 把 VCC∪GND
  x = 180;
  for (let i = 0; i < cIds.length; i++) {
    const cap = C(doc, cIds[i], `C${i + 1}`, x, 280);
    K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(cap, '1')]);
    K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(cap, '2')]);
    x += 120;
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
export function buildLabDiscrete(doc) {
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
export function buildLabAnalogIc(doc) {
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 40, y: 40 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 40, y: 560 });
  const vac = K.place(doc, 'VAC', 'AC1', { x: 40, y: 200 });
  // 单电源 5V：小信号 + 偏置（与 lab_amp 一致）。默认 220V/50Hz 会钉运放并让 DC 表读~1V
  vac.parameters.amplitude = '0.1V';
  vac.parameters.frequency = '1kHz';
  vac.parameters.offset = '0.2V';

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

  // Buck：右移避开 REG3，以 U4.GND 为 hub
  const buck = K.place(doc, 'LM2596', 'U4', { x: 980, y: 360 });
  const cBin = C(doc, 'C_100uF', 'CBI', 900, 430);
  const cBout = C(doc, 'C_100uF', 'CBO', 1120, 520);
  const lBuck = K.place(doc, 'L_10uH', 'LB', { x: 1080, y: 280 });
  const rBfb = R(doc, 'R_10k', 'RFB', 1040, 580);
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(cBin, '1'), p(buck, '1')]);
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(buck, '2')]);
  K.join(doc, 'GND', NetType.GROUND, [p(buck, '2'), p(cBin, '2')]);
  K.join(doc, 'GND', NetType.GROUND, [p(buck, '2'), p(cBout, '2'), p(rBfb, '2')]);
  K.join(doc, 'BUCK_SW', NetType.SIGNAL, [p(buck, '3'), p(lBuck, '1')]);
  K.join(doc, 'BUCK_OUT', NetType.POWER, [
    p(lBuck, '2'), p(cBout, '1'), p(buck, '4'), p(buck, '5'), p(rBfb, '1')
  ]);
}

/** lab_digital: 门电路激励 + LA 探头 */
export function buildLabDigital(doc) {
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 40, y: 40 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 40, y: 460 });

  const rHi = R(doc, 'R_10k', 'RHI', 120, 80);
  const rLo = R(doc, 'R_10k', 'RLO', 120, 220);
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(rHi, '1')]);
  K.join(doc, 'LOGIC_H', NetType.SIGNAL, [p(rHi, '2')]);
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(rLo, '2')]);
  K.join(doc, 'LOGIC_L', NetType.SIGNAL, [p(rLo, '1')]);

  const gateDefs = [
    { id: '74HC00', ref: 'U1', dual: true },
    { id: '74HC02', ref: 'U2', dual: true },
    { id: '74HC04', ref: 'U3', dual: false },
    { id: '74HC08', ref: 'U4', dual: true },
    { id: '74HC32', ref: 'U5', dual: true },
    { id: '74HC74', ref: 'U6', dual: true }
  ];
  const outs = [];
  for (let i = 0; i < gateDefs.length; i++) {
    const g = gateDefs[i];
    const u = K.place(doc, g.id, g.ref, { x: 260 + i * 160, y: 180 });
    K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(u, '14')]);
    K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(u, '7')]);
    if (g.dual) {
      K.join(doc, 'LOGIC_H', NetType.SIGNAL, [p(u, '1')]);
      K.join(doc, 'LOGIC_L', NetType.SIGNAL, [p(u, '2')]);
      outs.push(p(u, '3'));
    } else {
      K.join(doc, 'LOGIC_H', NetType.SIGNAL, [p(u, '1')]);
      outs.push(p(u, '2'));
    }
  }

  // 4017 放到最右，与 LA 错层，避免 CLK/EN 邻脚离脚 stub 互穿
  const cnt = K.place(doc, 'CD4017', 'U7', { x: 1180, y: 180 });
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(cnt, '16')]);
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(cnt, '8')]);
  K.join(doc, 'LOGIC_H', NetType.SIGNAL, [p(rHi, '2'), p(cnt, '14')]);
  K.join(doc, 'LOGIC_L', NetType.SIGNAL, [p(rLo, '1'), p(cnt, '13')]);
  // RST 用标号并网：物理布线在拓扑重建后易把 15 拆成孤立 NET_xx
  K.joinByLabel(doc, 'LOGIC_L', NetType.SIGNAL, [p(cnt, '15')]);
  outs.push(p(cnt, '3'));

  const la = K.place(doc, 'LOGIC_ANALYZER', 'LA1', { x: 1180, y: 400 });
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(la, 'GND', 'GND')]);
  for (let ch = 0; ch < Math.min(outs.length, 8); ch++) {
    K.join(doc, `LA_CH${ch + 1}`, NetType.SIGNAL, [
      p(la, `CH${ch + 1}`, `CH${ch + 1}`), outs[ch]
    ]);
  }
}

/** lab_memory: MCU + I2C/SPI/并行存储器接口 */
export function buildLabMemory(doc) {
  const mcu = K.place(doc, 'STM32F103RC', 'U1', { x: 200, y: 260 });
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 40, y: 10 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 40, y: 500 });
  const cDec = C(doc, 'C_100nF', 'C1', 320, 420);
  const rRst = R(doc, 'R_10k', 'R1', 20, 400);
  const xtal = K.place(doc, 'XTAL_8M', 'Y1', { x: 60, y: 50 });
  const { c1, c2 } = placeXtalCaps(doc, 60, 50, 'CX');
  K.crystal(doc, mcu, xtal, c1, c2, 'P5', 'P6', '', gnd);
  K.mcuCore(doc, mcu, vcc, gnd, rRst, cDec, 'P48', 'P24', 'P7');

  const eep = K.place(doc, '24C02', 'M1', { x: 500, y: 140 });
  const rSda = R(doc, 'R_4.7k', 'RSDA', 400, 100);
  const rScl = R(doc, 'R_4.7k', 'RSCL', 400, 180);
  const flash = K.place(doc, 'W25Q64', 'M2', { x: 680, y: 140 });
  const eprom = K.place(doc, '2764', 'M3', { x: 900, y: 220 });
  const sram = K.place(doc, '62256', 'M4', { x: 1100, y: 220 });

  // 局部电源放外侧；信号先布线，再 joinWired 电源，利用 pathConflicts 绕开总线
  const gndEep = K.place(doc, 'GND', 'GND_EEP', { x: 500, y: 300 });
  const vccEep = K.place(doc, 'VCC', 'VCC_EEP', { x: 500, y: 20 });
  const gndFlash = K.place(doc, 'GND', 'GND_FL', { x: 680, y: 300 });
  const vccFlash = K.place(doc, 'VCC', 'VCC_FL', { x: 680, y: 20 });
  const gndMcuL = K.place(doc, 'GND', 'GND_MCU_L', { x: 60, y: 220 });
  const gndMcuR = K.place(doc, 'GND', 'GND_MCU_R', { x: 360, y: 400 });

  // —— 信号总线（先于电源物理线）——
  K.join(doc, 'I2C_SDA', NetType.SIGNAL, [
    p(mcu, 'P18', 'P18'), p(eep, '5'), p(rSda, '2')
  ]);
  K.join(doc, 'I2C_SCL', NetType.SIGNAL, [
    p(mcu, 'P19', 'P19'), p(eep, '6'), p(rScl, '2')
  ]);
  K.join(doc, 'SPI_CS', NetType.SIGNAL, [p(flash, '1'), p(mcu, 'P20', 'P20')]);
  K.join(doc, 'SPI_MISO', NetType.SIGNAL, [p(flash, '2'), p(mcu, 'P21', 'P21')]);
  K.join(doc, 'SPI_MOSI', NetType.SIGNAL, [p(flash, '5'), p(mcu, 'P22', 'P22')]);
  K.join(doc, 'SPI_SCK', NetType.SIGNAL, [p(flash, '6'), p(mcu, 'P23', 'P23')]);

  K.joinByLabel(doc, 'MEM_CE', NetType.SIGNAL, [p(eprom, '20'), p(mcu, 'P25', 'P25')]);
  K.joinByLabel(doc, 'MEM_OE', NetType.SIGNAL, [p(eprom, '22'), p(mcu, 'P26', 'P26')]);
  K.joinByLabel(doc, 'SRAM_CE', NetType.SIGNAL, [p(sram, '20'), p(mcu, 'P28', 'P28')]);
  K.joinByLabel(doc, 'SRAM_OE', NetType.SIGNAL, [p(sram, '22'), p(mcu, 'P29', 'P29')]);
  K.joinByLabel(doc, 'SRAM_WE', NetType.SIGNAL, [p(sram, '27'), p(mcu, 'P30', 'P30')]);

  const addrMem = ['10', '9', '8', '7', '6', '5', '4', '3'];
  const addrMcu = ['P8', 'P9', 'P10', 'P11', 'P12', 'P13', 'P14', 'P15'];
  for (let ai = 0; ai < 8; ai++) {
    K.joinByLabel(doc, `MEM_A${ai}`, NetType.SIGNAL, [
      p(eprom, addrMem[ai]), p(sram, addrMem[ai]),
      p(mcu, addrMcu[ai], addrMcu[ai])
    ]);
  }
  const dataMem = ['11', '12', '13', '15', '16', '17', '18', '19'];
  const dataMcu = ['P27', 'P31', 'P32', 'P33', 'P34', 'P35', 'P36', 'P37'];
  for (let di = 0; di < 8; di++) {
    K.joinByLabel(doc, `MEM_D${di}`, NetType.SIGNAL, [
      p(eprom, dataMem[di]), p(sram, dataMem[di]),
      p(mcu, dataMcu[di], dataMcu[di])
    ]);
  }

  // —— 就近电源：物理短线接到局部符号，拓扑 BFS 不依赖标号 ——
  K.joinWired(doc, 'GND', NetType.GROUND, [
    p(gndEep, '1', 'GND'), p(eep, '1'), p(eep, '2'), p(eep, '3'), p(eep, '4'), p(eep, '7')
  ]);
  K.joinWired(doc, 'VCC', NetType.POWER, [
    p(vccEep, '1', 'VCC'), p(eep, '8'), p(rSda, '1'), p(rScl, '1')
  ]);
  K.joinWired(doc, 'VCC', NetType.POWER, [
    p(vccFlash, '1', 'VCC'), p(flash, '8'), p(flash, '3'), p(flash, '7')
  ]);
  K.joinWired(doc, 'GND', NetType.GROUND, [p(gndFlash, '1', 'GND'), p(flash, '4')]);

  // 并行封装高位脚：标号并到局部符号（物理长轨会与 MEM 总线 T 接短路）
  const gndMem = K.place(doc, 'GND', 'GND_MEM', { x: 1250, y: 400 });
  const vccMem = K.place(doc, 'VCC', 'VCC_MEM', { x: 1250, y: 40 });
  K.joinByLabel(doc, 'GND', NetType.GROUND, [
    p(gndMem, '1', 'GND'), p(eprom, '14'), p(sram, '14'),
    p(eprom, '2'), p(eprom, '21'), p(eprom, '23'), p(eprom, '24'),
    p(eprom, '25'), p(eprom, '26'), p(eprom, '27'),
    p(sram, '1'), p(sram, '2'), p(sram, '21'), p(sram, '23'),
    p(sram, '24'), p(sram, '25'), p(sram, '26')
  ]);
  K.joinByLabel(doc, 'VCC', NetType.POWER, [
    p(vccMem, '1', 'VCC'), p(eprom, '28'), p(sram, '28'), p(eprom, '1')
  ]);

  K.joinWired(doc, 'GND', NetType.GROUND, [
    p(gndMcuL, '1', 'GND'),
    p(mcu, 'P1', 'P1'), p(mcu, 'P2', 'P2'), p(mcu, 'P3', 'P3'), p(mcu, 'P4', 'P4'),
    p(mcu, 'P16', 'P16'), p(mcu, 'P17', 'P17')
  ]);
  K.joinWired(doc, 'GND', NetType.GROUND, [
    p(gndMcuR, '1', 'GND'),
    p(mcu, 'P38', 'P38'), p(mcu, 'P39', 'P39'), p(mcu, 'P40', 'P40'), p(mcu, 'P41', 'P41'),
    p(mcu, 'P42', 'P42'), p(mcu, 'P43', 'P43'), p(mcu, 'P44', 'P44'), p(mcu, 'P45', 'P45'),
    p(mcu, 'P46', 'P46'), p(mcu, 'P47', 'P47')
  ]);

  K.joinByLabel(doc, 'GND', NetType.GROUND, [
    p(gnd, '1', 'GND'), p(gndEep, '1', 'GND'), p(gndFlash, '1', 'GND'),
    p(gndMem, '1', 'GND'), p(gndMcuL, '1', 'GND'), p(gndMcuR, '1', 'GND')
  ]);
  K.joinByLabel(doc, 'VCC', NetType.POWER, [
    p(vcc, '1', 'VCC'), p(vccEep, '1', 'VCC'), p(vccFlash, '1', 'VCC'), p(vccMem, '1', 'VCC')
  ]);
}

/** lab_mcu_8051: 四款 8051 最小系统 */
export function buildLabMcu8051(doc) {
  const ids = ['AT89C51', 'AT89C52', 'STC89C52', 'STC15W408AS'];
  const xtals = ['XTAL_11M', 'XTAL_11M', 'XTAL_11M', 'XTAL_8M'];
  for (let i = 0; i < ids.length; i++) {
    // 列距 ≥420：LED 阴极线勿切穿邻列 MCU 左脚（原先 340 会把 L*_K 并到下一颗 P15）
    const ox = 40 + i * 420;
    const mcu = K.place(doc, ids[i], `U${i + 1}`, { x: ox + 160, y: 240 });
    const xtal = K.place(doc, xtals[i], `Y${i + 1}`, { x: ox + 40, y: 40 });
    const { c1, c2 } = placeXtalCaps(doc, ox + 40, 40, `CX${i}`);
    const cDec = C(doc, 'C_100nF', `CD${i + 1}`, ox + 280, 380);
    const rRst = R(doc, 'R_10k', `R${i + 1}`, ox + 10, 400);
    const vcc = K.place(doc, 'VCC', `PWR${i + 1}`, { x: ox, y: 10 });
    const gnd = K.place(doc, 'GND', `GND${i + 1}`, { x: ox, y: 480 });
    // 灌电流：VCC→R→LED→P1.0；LED 落在本列右侧、低于晶振，避免跨列短路
    const ledR = R(doc, 'R_330', `RL${i + 1}`, ox + 280, 320);
    const led = K.place(doc, 'LED_RED', `D${i + 1}`, { x: ox + 360, y: 320 });
    K.crystal(doc, mcu, xtal, c1, c2, 'P18', 'P19', `M${i}_`, gnd);
    K.mcuCore(doc, mcu, vcc, gnd, rRst, cDec, 'P40', 'P20', 'P9', `M${i}_`);
    K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(mcu, 'P31', 'P31'), p(ledR, '1')]);
    K.series2(doc, `L${i}_A`, p(ledR, '2'), p(led, 'A', 'A'));
    K.join(doc, `L${i}_K`, NetType.SIGNAL, [p(led, 'K', 'K'), p(mcu, 'P1', 'P1')]);
  }
}

/** lab_mcu_stm32: 五款 STM32 最小系统 */
export function buildLabMcuStm32(doc) {
  const ids = ['STM32F103C8', 'STM32F103RC', 'STM32F407VG', 'STM32L431CB', 'STM32F030F4'];
  // F407 百脚封装极宽：列宽 ≥720，GND 下沉，避免 P11 等空脚 stub 并入电源地轨
  let ox = 40;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const isF407 = id.includes('F407');
    const colW = isF407 ? 720 : 520;
    const vccPin = isF407 ? 'P100' : 'P48';
    const gndPin = isF407 ? 'P50' : 'P24';
    const mcu = K.place(doc, id, `U${i + 1}`, { x: ox + (isF407 ? 260 : 160), y: 240 });
    const xtal = K.place(doc, 'XTAL_8M', `Y${i + 1}`, { x: ox + 40, y: 40 });
    // DeepErcEngine：两侧负载电容须 |Δx|<80（placeXtalCaps = ±60）
    const { c1, c2 } = placeXtalCaps(doc, ox + 40, 40, `CX${i}`);
    const cDec = C(doc, 'C_10uF', `CD${i + 1}`, ox + 300, 460);
    const rRst = R(doc, 'R_10k', `R${i + 1}`, ox + 10, 420);
    const vcc = K.place(doc, 'VCC', `PWR${i + 1}`, { x: ox, y: 10 });
    const gnd = K.place(doc, 'GND', `GND${i + 1}`, { x: ox, y: isF407 ? 580 : 520 });
    const ledR = R(doc, 'R_330', `RL${i + 1}`, ox + 320, 340);
    const led = K.place(doc, 'LED_GREEN', `D${i + 1}`, { x: ox + 420, y: 340 });
    K.crystal(doc, mcu, xtal, c1, c2, 'P5', 'P6', `S${i}_`, gnd);
    K.mcuCore(doc, mcu, vcc, gnd, rRst, cDec, vccPin, gndPin, 'P7', `S${i}_`);
    K.ledBranch(doc, p(mcu, 'P1', 'P1'), p(gnd, '1', 'GND'), ledR, led, `L${i}`);
    ox += colW;
  }
}

/** lab_peripheral: 按键/继电器(触点指示)/蜂鸣器/LCD/OLED
 *  引脚均落在 GPIOA→Pn 教学映射内（P1=PA0…P16=PA15），配合 lab_peripheral.hex：
 *  KEY=P2(PA1) REL=P3(PA2) BUZ=P4(PA3) OLED=P8/P9(PA7/8) LCD RS=P11 E=P16 D4–D7=P12–P15
 *  继电器：线圈 P3→RR→K1.1→K1.2→GND；触点 VCC→R→LED→NO/NC，COM→GND
 *  （线圈吸合后红灯 DNO 亮、绿灯 DNC 灭；释放则相反）
 */
export function buildLabPeripheral(doc) {
  const mcu = K.place(doc, 'STM32F103C8', 'U1', { x: 200, y: 260 });
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 40, y: 10 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 40, y: 560 });
  const cDec = C(doc, 'C_100nF', 'C1', 320, 440);
  const rRst = R(doc, 'R_10k', 'R1', 20, 400);
  // 晶振贴顶：CX 在 y≈40，勿与 KEY(y≈160)/REL 左脚总线交叉导致拓扑并网
  const xtal = K.place(doc, 'XTAL_8M', 'Y1', { x: 40, y: 0 });
  const { c1: cx1, c2: cx2 } = placeXtalCaps(doc, 40, 0, 'CX');
  K.crystal(doc, mcu, xtal, cx1, cx2, 'P5', 'P6', '', gnd);
  K.mcuCore(doc, mcu, vcc, gnd, rRst, cDec, 'P48', 'P24', 'P7');

  // 外设分带：按键上 / 驱动中 / 触点指示右中 / 显示右下；中心距须 >120
  const sw = K.place(doc, 'SW_PUSH', 'SW1', { x: 560, y: 160 });
  const rPull = R(doc, 'R_10k', 'R2', 360, 160);
  K.join(doc, 'KEY', NetType.SIGNAL, [p(sw, '1'), p(mcu, 'P2', 'P2'), p(rPull, '1')]);
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(rPull, '2')]);
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(sw, '2')]);

  const relay = K.place(doc, 'RELAY_SPDT', 'K1', { x: 560, y: 220 });
  const rRel = R(doc, 'R_330', 'RR', 440, 220);
  K.join(doc, 'REL_DRV', NetType.SIGNAL, [p(rRel, '1'), p(mcu, 'P3', 'P3')]);
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
  K.join(doc, 'BUZ', NetType.SIGNAL, [p(rb, '1'), p(mcu, 'P4', 'P4')]);
  K.series2(doc, 'BUZ_DRV', p(rb, '2'), p(buzz, '1'));
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(buzz, '2')]);

  const lcd = K.place(doc, 'LCD1602', 'LCD1', { x: 960, y: 160 });
  const rVo = R(doc, 'R_10k', 'RVO', 800, 240);
  K.join(doc, 'GND', NetType.GROUND, [
    p(gnd, '1', 'GND'), p(lcd, '1'), p(lcd, '5'), p(lcd, '16'), p(rVo, '2')
  ]);
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(lcd, '2'), p(lcd, '15')]);
  K.join(doc, 'LCD_VO', NetType.SIGNAL, [p(lcd, '3'), p(rVo, '1')]);
  K.join(doc, 'LCD_RS', NetType.SIGNAL, [p(lcd, '4'), p(mcu, 'P11', 'P11')]);
  K.join(doc, 'LCD_E', NetType.SIGNAL, [p(lcd, '6'), p(mcu, 'P16', 'P16')]);
  K.join(doc, 'LCD_D4', NetType.SIGNAL, [p(lcd, '11'), p(mcu, 'P12', 'P12')]);
  K.join(doc, 'LCD_D5', NetType.SIGNAL, [p(lcd, '12'), p(mcu, 'P13', 'P13')]);
  K.join(doc, 'LCD_D6', NetType.SIGNAL, [p(lcd, '13'), p(mcu, 'P14', 'P14')]);
  K.join(doc, 'LCD_D7', NetType.SIGNAL, [p(lcd, '14'), p(mcu, 'P15', 'P15')]);

  const oled = K.place(doc, 'OLED_12864', 'OLED1', { x: 960, y: 420 });
  const rOsda = R(doc, 'R_4.7k', 'RODA', 800, 380);
  const rOscl = R(doc, 'R_4.7k', 'ROCL', 800, 440);
  K.join(doc, 'VCC', NetType.POWER, [
    p(vcc, '1', 'VCC'), p(oled, 'VCC', 'VCC'), p(rOsda, '1'), p(rOscl, '1')
  ]);
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(oled, 'GND', 'GND')]);
  K.join(doc, 'OLED_SDA', NetType.SIGNAL, [
    p(oled, 'SDA', 'SDA'), p(mcu, 'P8', 'P8'), p(rOsda, '2')
  ]);
  K.join(doc, 'OLED_SCL', NetType.SIGNAL, [
    p(oled, 'SCL', 'SCL'), p(mcu, 'P9', 'P9'), p(rOscl, '2')
  ]);
}

/** lab_sensor: DS18B20 / 霍尔 / 光敏 + 滑动变阻器分压测 ADC */
export function buildLabSensor(doc) {
  const mcu = K.place(doc, 'STM32F103C8', 'U1', { x: 200, y: 260 });
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 40, y: 10 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 40, y: 500 });
  const cDec = C(doc, 'C_100nF', 'C1', 320, 420);
  const rRst = R(doc, 'R_10k', 'R1', 20, 400);
  const xtal = K.place(doc, 'XTAL_8M', 'Y1', { x: 60, y: 50 });
  const { c1: cx1, c2: cx2 } = placeXtalCaps(doc, 60, 50, 'CX');
  K.crystal(doc, mcu, xtal, cx1, cx2, 'P5', 'P6', '', gnd);
  K.mcuCore(doc, mcu, vcc, gnd, rRst, cDec, 'P48', 'P24', 'P7');

  const ds = K.place(doc, 'DS18B20', 'T1', { x: 500, y: 120 });
  const rDs = R(doc, 'R_4.7k', 'R2', 400, 80);
  K.join(doc, '1WIRE', NetType.SIGNAL, [p(ds, '1'), p(mcu, 'P4', 'P4'), p(rDs, '1')]);
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(rDs, '2')]);
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(ds, '2')]);

  const hall = K.place(doc, 'HALL_SENSOR', 'H1', { x: 500, y: 240 });
  const rHall = R(doc, 'R_10k', 'RH', 400, 240);
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(rHall, '1')]);
  K.join(doc, 'HALL', NetType.SIGNAL, [
    p(hall, '1'), p(mcu, 'P8', 'P8'), p(rHall, '2')
  ]);
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(hall, '2')]);

  // VCC—RV1—GND 分压；抽头接 ADC / 光敏并联 / 电压表
  const pot = K.place(doc, 'POT_10k', 'RV1', { x: 480, y: 360 });
  pot.parameters.wiper = '0.5';
  const ldr = K.place(doc, 'LDR', 'LDR1', { x: 620, y: 420 });
  ldr.parameters.value = '50k';
  const vm = K.place(doc, 'VOLTMETER_DC', 'M1', { x: 760, y: 340 });
  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(pot, '1')]);
  K.join(doc, 'ADC', NetType.SIGNAL, [
    p(pot, 'W', 'W'), p(mcu, 'P9', 'P9'), p(vm, 'V+', 'V+'), p(ldr, '1')
  ]);
  K.join(doc, 'GND', NetType.GROUND, [
    p(gnd, '1', 'GND'), p(pot, '2'), p(vm, 'COM', 'COM'), p(ldr, '2')
  ]);
}

/** lab_instruments: 滑动变阻器分压 + 全套仪器 */
export function buildLabInstruments(doc) {
  const vcc = K.place(doc, 'VCC', 'PWR1', { x: 40, y: 40 });
  const gnd = K.place(doc, 'GND', 'GND1', { x: 40, y: 480 });
  const am = K.place(doc, 'AMMETER_DC', 'A1', { x: 120, y: 100 });
  const r1 = R(doc, 'R_10k', 'R1', 260, 200);
  const pot = K.place(doc, 'POT_10k', 'RV1', { x: 420, y: 200 });
  pot.parameters.wiper = '0.5';

  K.join(doc, 'VCC', NetType.POWER, [p(vcc, '1', 'VCC'), p(am, 'I+', 'I+')]);
  K.series2(doc, 'HI', p(am, 'I-', 'I-'), p(r1, '1'));
  K.join(doc, 'TOP', NetType.SIGNAL, [p(r1, '2'), p(pot, '1')]);
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(pot, '2')]);

  const vm = K.place(doc, 'VOLTMETER_DC', 'M1', { x: 620, y: 40 });
  K.join(doc, 'MID', NetType.SIGNAL, [p(pot, 'W', 'W'), p(vm, 'V+', 'V+')]);
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(vm, 'COM', 'COM')]);

  const virt = K.place(doc, 'VIRTUAL_METER', 'VM1', { x: 720, y: 80 });
  K.join(doc, 'MID', NetType.SIGNAL, [p(pot, 'W', 'W'), p(virt, 'V', 'V')]);
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(virt, 'COM', 'COM')]);

  const pm = K.place(doc, 'POWER_METER', 'PM1', { x: 820, y: 40 });
  K.join(doc, 'HI', NetType.SIGNAL, [p(r1, '1'), p(pm, 'V+', 'V+')]);
  K.join(doc, 'HI', NetType.SIGNAL, [p(r1, '1'), p(pm, 'I+', 'I+')]);
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(pm, 'V-', 'V-')]);
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(pm, 'I-', 'I-')]);

  const fc = K.place(doc, 'FREQ_COUNTER', 'FC1', { x: 820, y: 320 });
  K.join(doc, 'MID', NetType.SIGNAL, [p(pot, 'W', 'W'), p(fc, 'IN', 'IN')]);
  K.join(doc, 'GND', NetType.GROUND, [p(gnd, '1', 'GND'), p(fc, 'GND', 'GND')]);

  const osc = K.place(doc, 'OSCILLOSCOPE', 'OSC1', { x: 1000, y: 100 });
  K.join(doc, 'HI', NetType.SIGNAL, [p(r1, '1'), p(osc, 'CH1', 'CH1')]);
  K.join(doc, 'MID', NetType.SIGNAL, [p(pot, 'W', 'W'), p(osc, 'CH2', 'CH2')]);
  // stub+标号：GND 母线横穿 OSC 易把 CH4 并地（与滤波电容接地同一策略）
  K.stubLabel(doc, p(osc, 'GND', 'GND'), 'GND', NetType.GROUND);
}

export const TEMPLATE_DEFS = [
  { id: 'lab_power', name: '直流电源电路', description: 'LM7805 稳压电源 + 滤波 + 负载测量', build: buildLabPower },
  { id: 'lab_amp', name: '运算放大电路', description: 'LM358 同相放大器（可 MNA 仿真）', build: buildLabAmp },
  { id: 'lab_filter', name: 'RC滤波电路', description: 'RC 低通 + LM358 缓冲输出', build: buildLabFilter },
  { id: 'lab_51_led', name: '51流水灯', description: 'AT89C51 流水灯 + 晶振复位', build: buildLab51Led },
  { id: 'lab_uart', name: '串口通信', description: 'STM32F103 UART + 终端', build: buildLabUart },
  { id: 'lab_passive', name: '无源器件检测', description: '全部电阻/电容/电感/LC/交流源', build: buildLabPassive },
  { id: 'lab_discrete', name: '分立器件检测', description: '二极管/LED/三极管/MOSFET 典型接法', build: buildLabDiscrete },
  { id: 'lab_analog_ic', name: '模拟IC检测', description: '运放 + 全部稳压/开关电源 IC', build: buildLabAnalogIc },
  { id: 'lab_digital', name: '数字逻辑检测', description: '全部 74HC 逻辑门 + CD4017 + 逻辑分析仪', build: buildLabDigital },
  { id: 'lab_memory', name: '存储器接口', description: 'EPROM/SRAM/EEPROM/Flash 与 MCU 连接', build: buildLabMemory },
  { id: 'lab_mcu_8051', name: '8051全系列', description: 'AT89/STC 四款 MCU 最小系统', build: buildLabMcu8051 },
  { id: 'lab_mcu_stm32', name: 'STM32全系列', description: '五款 STM32 最小系统并排', build: buildLabMcuStm32 },
  { id: 'lab_peripheral', name: '外设接口实验', description: '按键/继电器触点指示/蜂鸣器/LCD/OLED；需烧录 lab_peripheral.hex', build: buildLabPeripheral },
  { id: 'lab_sensor', name: '传感器实验', description: 'DS18B20/霍尔/光敏 接入 MCU', build: buildLabSensor },
  { id: 'lab_instruments', name: '仪器仪表检测', description: '全部虚拟仪器接入分压测试点', build: buildLabInstruments }
];
