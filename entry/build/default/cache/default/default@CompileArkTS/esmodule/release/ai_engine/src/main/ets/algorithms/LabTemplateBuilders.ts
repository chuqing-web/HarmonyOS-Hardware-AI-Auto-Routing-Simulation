import { NetType } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchematicDocument, ComponentInstance } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { TemplateSchematicKit as K } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/TemplateSchematicKit";
import type { PinSpec } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/TemplateSchematicKit";
const R = (s292: SchematicDocument, t292: string, u292: string, v292: number, w292: number): ComponentInstance => K.place(s292, t292, u292, { x: v292, y: w292 });
const C = (n292: SchematicDocument, o292: string, p292: string, q292: number, r292: number): ComponentInstance => K.place(n292, o292, p292, { x: q292, y: r292 });
function p(k292: ComponentInstance, l292: string, m292: string = l292): PinSpec {
    return { comp: k292, pinId: l292, pinName: m292 };
}
interface GateDef {
    id: string;
    ref: string;
    dual: boolean;
}
function gate(g292: string, h292: string, i292: boolean): GateDef {
    const j292: GateDef = { id: g292, ref: h292, dual: i292 };
    return j292;
}
export function buildLabPower(x291: SchematicDocument): void {
    const y291 = K.place(x291, 'VCC', 'PWR1', { x: 40, y: 100 });
    const z291 = K.place(x291, 'FUSE_1A', 'F1', { x: 100, y: 160 });
    const a292 = K.place(x291, 'C_100uF', 'C1', { x: 180, y: 240 });
    const b292 = K.place(x291, 'LM7805', 'U1', { x: 280, y: 160 });
    const c292 = K.place(x291, 'C_10uF', 'C2', { x: 400, y: 240 });
    const d292 = K.place(x291, 'R_10k', 'R1', { x: 500, y: 240 });
    const e292 = K.place(x291, 'VOLTMETER_DC', 'M1', { x: 620, y: 170 });
    const f292 = K.place(x291, 'GND', 'GND1', { x: 280, y: 340 });
    K.join(x291, 'VIN_SRC', NetType.SIGNAL, [p(y291, '1', 'VCC'), p(z291, '1')]);
    K.join(x291, 'REG_IN', NetType.SIGNAL, [p(z291, '2'), p(a292, '1'), p(b292, '1')]);
    K.join(x291, 'VOUT', NetType.POWER, [
        p(b292, '3'), p(c292, '1'), p(d292, '1'), p(e292, 'V+', 'V+')
    ]);
    K.join(x291, 'GND', NetType.GROUND, [
        p(f292, '1', 'GND'), p(b292, '2'), p(a292, '2'), p(c292, '2'),
        p(d292, '2'), p(e292, 'COM', 'COM')
    ]);
}
export function buildLabAmp(n291: SchematicDocument): void {
    const o291 = K.place(n291, 'VAC', 'AC1', { x: 60, y: 200 });
    const p291 = R(n291, 'R_10k', 'R1', 160, 160);
    const q291 = K.place(n291, 'LM358', 'U1', { x: 300, y: 180 });
    const r291 = R(n291, 'R_100k', 'Rf', 300, 80);
    const s291 = R(n291, 'R_10k', 'Rg', 220, 280);
    const t291 = K.place(n291, 'VCC', 'PWR1', { x: 300, y: 40 });
    const u291 = K.place(n291, 'GND', 'GND1', { x: 220, y: 360 });
    const v291 = K.place(n291, 'VOLTMETER_DC', 'M1', { x: 480, y: 160 });
    const w291 = K.place(n291, 'OSCILLOSCOPE', 'OSC1', { x: 480, y: 280 });
    K.join(n291, 'SIG_SRC', NetType.SIGNAL, [p(o291, '1'), p(p291, '1')]);
    K.join(n291, 'SIG_IN', NetType.SIGNAL, [p(p291, '2'), p(q291, 'IN+1', 'IN+1')]);
    K.join(n291, 'FB', NetType.SIGNAL, [
        p(q291, 'IN-1', 'IN-1'), p(r291, '1'), p(s291, '1')
    ]);
    K.join(n291, 'SIG_OUT', NetType.SIGNAL, [
        p(q291, 'OUT1', 'OUT1'), p(r291, '2'), p(v291, 'V+', 'V+'), p(w291, 'CH1', 'CH1')
    ]);
    K.join(n291, 'VCC', NetType.POWER, [p(t291, '1', 'VCC'), p(q291, 'V+', 'V+')]);
    K.join(n291, 'GND', NetType.GROUND, [
        p(u291, '1', 'GND'), p(o291, '2'), p(q291, 'V-', 'V-'), p(s291, '2'),
        p(v291, 'COM', 'COM'), p(w291, 'GND', 'GND')
    ]);
}
export function buildLabFilter(e291: SchematicDocument): void {
    const f291 = K.place(e291, 'VAC', 'AC1', { x: 60, y: 180 });
    const g291 = R(e291, 'R_1k', 'R1', 160, 160);
    const h291 = C(e291, 'C_100nF', 'C1', 260, 260);
    const i291 = K.place(e291, 'LM358', 'U1', { x: 360, y: 180 });
    const j291 = K.place(e291, 'VCC', 'PWR1', { x: 360, y: 40 });
    const k291 = K.place(e291, 'GND', 'GND1', { x: 260, y: 360 });
    const l291 = K.place(e291, 'VOLTMETER_DC', 'M1', { x: 520, y: 160 });
    const m291 = K.place(e291, 'OSCILLOSCOPE', 'OSC1', { x: 520, y: 280 });
    K.join(e291, 'SIG_SRC', NetType.SIGNAL, [p(f291, '1'), p(g291, '1')]);
    K.join(e291, 'SIG_MID', NetType.SIGNAL, [
        p(g291, '2'), p(h291, '1'), p(i291, 'IN+1', 'IN+1')
    ]);
    K.join(e291, 'BUF_FB', NetType.SIGNAL, [
        p(i291, 'OUT1', 'OUT1'), p(i291, 'IN-1', 'IN-1'),
        p(l291, 'V+', 'V+'), p(m291, 'CH1', 'CH1')
    ]);
    K.join(e291, 'VCC', NetType.POWER, [p(j291, '1', 'VCC'), p(i291, 'V+', 'V+')]);
    K.join(e291, 'GND', NetType.GROUND, [
        p(k291, '1', 'GND'), p(f291, '2'), p(h291, '2'), p(i291, 'V-', 'V-'),
        p(l291, 'COM', 'COM'), p(m291, 'GND', 'GND')
    ]);
}
export function buildLab51Led(n290: SchematicDocument): void {
    const o290 = K.place(n290, 'AT89C51', 'U1', { x: 200, y: 200 });
    const p290 = K.place(n290, 'XTAL_11M', 'Y1', { x: 60, y: 60 });
    const q290 = C(n290, 'C_100nF', 'C1', 40, 100);
    const r290 = C(n290, 'C_100nF', 'C2', 40, 40);
    const s290 = C(n290, 'C_100nF', 'C3', 300, 320);
    const t290 = R(n290, 'R_10k', 'R1', 100, 280);
    const u290 = K.place(n290, 'VCC', 'PWR1', { x: 40, y: 140 });
    const v290 = K.place(n290, 'GND', 'GND1', { x: 40, y: 380 });
    const w290 = R(n290, 'R_1k', 'R_PWR', 360, 120);
    const x290 = K.place(n290, 'LED_GREEN', 'D9', { x: 440, y: 120 });
    const y290 = K.place(n290, 'VOLTMETER_DC', 'M1', { x: 360, y: 320 });
    K.crystal(n290, o290, p290, q290, r290, 'P18', 'P19');
    K.mcuCore(n290, o290, u290, v290, t290, s290, 'P40', 'P20', 'P9');
    K.join(n290, 'VCC', NetType.POWER, [p(o290, 'P31', 'P31'), p(y290, 'V+', 'V+')]);
    K.join(n290, 'GND', NetType.GROUND, [p(y290, 'COM', 'COM')]);
    K.ledBranch(n290, p(u290, '1', 'VCC'), p(v290, '1', 'GND'), w290, x290, 'PWR', 'VCC');
    for (let z290 = 0; z290 < 8; z290++) {
        const a291 = 420 + z290 * 40;
        const b291 = R(n290, 'R_330', `RL${z290 + 1}`, a291, 200);
        const c291 = K.place(n290, 'LED_RED', `D${z290 + 1}`, { x: a291, y: 280 });
        const d291 = `P${z290 + 1}`;
        K.ledBranch(n290, p(o290, d291, d291), p(v290, '1', 'GND'), b291, c291, `L${z290}`);
    }
}
export function buildLabUart(a290: SchematicDocument): void {
    const b290 = K.place(a290, 'STM32F103C8', 'U1', { x: 200, y: 200 });
    const c290 = K.place(a290, 'XTAL_8M', 'Y1', { x: 60, y: 60 });
    const d290 = C(a290, 'C_100nF', 'C1', 40, 100);
    const e290 = C(a290, 'C_100nF', 'C2', 40, 40);
    const f290 = C(a290, 'C_100nF', 'C3', 300, 340);
    const g290 = R(a290, 'R_10k', 'R1', 100, 280);
    const h290 = K.place(a290, 'UART_TERMINAL', 'TERM1', { x: 480, y: 180 });
    const i290 = K.place(a290, 'VCC', 'PWR1', { x: 40, y: 140 });
    const j290 = K.place(a290, 'GND', 'GND1', { x: 40, y: 380 });
    const k290 = R(a290, 'R_1k', 'R_PWR', 360, 100);
    const l290 = K.place(a290, 'LED_GREEN', 'D1', { x: 440, y: 100 });
    const m290 = K.place(a290, 'VOLTMETER_DC', 'M1', { x: 360, y: 340 });
    K.crystal(a290, b290, c290, d290, e290, 'P5', 'P6');
    K.mcuCore(a290, b290, i290, j290, g290, f290, 'P48', 'P24', 'P7');
    K.join(a290, 'UART_TX', NetType.SIGNAL, [p(b290, 'P10', 'P10'), p(h290, 'TX', 'TX')]);
    K.join(a290, 'UART_RX', NetType.SIGNAL, [p(b290, 'P11', 'P11'), p(h290, 'RX', 'RX')]);
    K.join(a290, 'GND', NetType.GROUND, [
        p(h290, 'GND', 'GND'), p(m290, 'COM', 'COM')
    ]);
    K.join(a290, 'VCC', NetType.POWER, [p(m290, 'V+', 'V+')]);
    K.ledBranch(a290, p(i290, '1', 'VCC'), p(j290, '1', 'GND'), k290, l290, 'PWR', 'VCC');
}
export function buildLabPassive(i289: SchematicDocument): void {
    const j289 = K.place(i289, 'VCC', 'PWR1', { x: 40, y: 60 });
    const k289 = K.place(i289, 'GND', 'GND1', { x: 40, y: 520 });
    const l289 = K.place(i289, 'VAC', 'AC1', { x: 40, y: 200 });
    const m289 = ['R_10', 'R_100', 'R_330', 'R_1k', 'R_4.7k', 'R_10k', 'R_47k', 'R_100k'];
    const n289 = ['C_10pF', 'C_100pF', 'C_1nF', 'C_10nF', 'C_100nF', 'C_1uF', 'C_10uF', 'C_100uF'];
    let o289 = 160;
    let p289: ComponentInstance | null = null;
    for (let y289 = 0; y289 < m289.length; y289++) {
        const z289 = R(i289, m289[y289], `R${y289 + 1}`, o289, 100);
        if (p289 === null) {
            K.join(i289, 'DIV_TOP', NetType.SIGNAL, [p(z289, '1')]);
        }
        else {
            K.series2(i289, `NET_R${y289}`, p(p289, '2'), p(z289, '1'));
        }
        p289 = z289;
        o289 += 70;
    }
    if (p289 !== null) {
        K.join(i289, 'GND', NetType.GROUND, [p(p289, '2'), p(k289, '1', 'GND')]);
    }
    o289 = 160;
    for (let w289 = 0; w289 < n289.length; w289++) {
        const x289 = C(i289, n289[w289], `C${w289 + 1}`, o289, 240);
        K.join(i289, 'VCC', NetType.POWER, [p(j289, '1', 'VCC'), p(x289, '1')]);
        K.join(i289, 'GND', NetType.GROUND, [p(x289, '2'), p(k289, '1', 'GND')]);
        o289 += 70;
    }
    const q289 = K.place(i289, 'L_10uH', 'L1', { x: 200, y: 360 });
    const r289 = C(i289, 'C_1uF', 'CLC', 320, 360);
    K.join(i289, 'VCC', NetType.POWER, [p(j289, '1', 'VCC'), p(q289, '1')]);
    K.series2(i289, 'LC_MID', p(q289, '2'), p(r289, '1'));
    K.join(i289, 'GND', NetType.GROUND, [p(r289, '2'), p(k289, '1', 'GND')]);
    const s289 = K.place(i289, 'FUSE_1A', 'F1', { x: 140, y: 200 });
    const t289 = R(i289, 'R_1k', 'RAC', 240, 200);
    K.join(i289, 'AC_PATH', NetType.SIGNAL, [p(l289, '1'), p(s289, '1')]);
    K.series2(i289, 'AC_LOAD', p(s289, '2'), p(t289, '1'));
    K.join(i289, 'GND', NetType.GROUND, [
        p(l289, '2'), p(t289, '2'), p(k289, '1', 'GND')
    ]);
    const u289 = K.place(i289, 'AMMETER_DC', 'A1', { x: 100, y: 40 });
    const v289 = K.place(i289, 'VOLTMETER_DC', 'M1', { x: 400, y: 40 });
    K.join(i289, 'VCC', NetType.POWER, [p(j289, '1', 'VCC'), p(u289, 'I+', 'I+')]);
    K.join(i289, 'DIV_TOP', NetType.SIGNAL, [p(u289, 'I-', 'I-')]);
    K.join(i289, 'DIV_TOP', NetType.SIGNAL, [p(v289, 'V+', 'V+')]);
    K.join(i289, 'GND', NetType.GROUND, [p(v289, 'COM', 'COM')]);
}
export function buildLabDiscrete(j288: SchematicDocument): void {
    const k288 = K.place(j288, 'VCC', 'PWR1', { x: 40, y: 80 });
    const l288 = K.place(j288, 'GND', 'GND1', { x: 40, y: 480 });
    const m288 = ['1N4148', '1N4007', '1N5819'];
    for (let f289 = 0; f289 < m288.length; f289++) {
        const g289 = K.place(j288, m288[f289], `D${f289 + 1}`, { x: 200 + f289 * 110, y: 160 });
        const h289 = R(j288, 'R_1k', `RD${f289 + 1}`, 200 + f289 * 110, 100);
        K.join(j288, 'VCC', NetType.POWER, [p(k288, '1', 'VCC'), p(h289, '1')]);
        K.series2(j288, `DIO${f289}`, p(h289, '2'), p(g289, 'A', 'A'));
        K.join(j288, 'GND', NetType.GROUND, [p(g289, 'K', 'K'), p(l288, '1', 'GND')]);
    }
    const n288 = ['LED_RED', 'LED_GREEN', 'LED_BLUE'];
    for (let c289 = 0; c289 < n288.length; c289++) {
        const d289 = R(j288, 'R_330', `RL${c289 + 1}`, 200 + c289 * 110, 240);
        const e289 = K.place(j288, n288[c289], `LED${c289 + 1}`, { x: 200 + c289 * 110, y: 300 });
        K.ledBranch(j288, p(k288, '1', 'VCC'), p(l288, '1', 'GND'), d289, e289, `L${c289}`, 'VCC');
    }
    const o288 = K.place(j288, '2N2222', 'Q1', { x: 560, y: 160 });
    const p288 = R(j288, 'R_10k', 'RB1', 460, 160);
    const q288 = R(j288, 'R_330', 'RC1', 660, 100);
    const r288 = K.place(j288, 'LED_RED', 'DN', { x: 740, y: 100 });
    K.join(j288, 'VCC', NetType.POWER, [p(k288, '1', 'VCC'), p(p288, '1'), p(q288, '1')]);
    K.series2(j288, 'BASE', p(p288, '2'), p(o288, 'B', 'B'));
    K.series2(j288, 'COLL', p(q288, '2'), p(r288, 'A', 'A'));
    K.join(j288, 'COLL_LED', NetType.SIGNAL, [p(r288, 'K', 'K'), p(o288, 'C', 'C')]);
    K.join(j288, 'GND', NetType.GROUND, [p(o288, 'E', 'E'), p(l288, '1', 'GND')]);
    const s288 = K.place(j288, '2N2907', 'Q2', { x: 560, y: 320 });
    const t288 = R(j288, 'R_10k', 'RB2', 460, 320);
    const u288 = R(j288, 'R_1k', 'RC2', 660, 360);
    K.join(j288, 'VCC', NetType.POWER, [p(k288, '1', 'VCC'), p(s288, 'E', 'E')]);
    K.series2(j288, 'BASE_P', p(t288, '2'), p(s288, 'B', 'B'));
    K.join(j288, 'GND', NetType.GROUND, [p(t288, '1'), p(l288, '1', 'GND')]);
    K.join(j288, 'COLL_P', NetType.SIGNAL, [p(s288, 'C', 'C'), p(u288, '1')]);
    K.join(j288, 'GND', NetType.GROUND, [p(u288, '2')]);
    const v288 = K.place(j288, '2N7000', 'M1', { x: 820, y: 160 });
    const w288 = R(j288, 'R_10k', 'RG1', 720, 160);
    const x288 = R(j288, 'R_330', 'RD1', 920, 100);
    const y288 = K.place(j288, 'LED_GREEN', 'DM', { x: 1000, y: 100 });
    K.join(j288, 'VCC', NetType.POWER, [p(k288, '1', 'VCC'), p(w288, '1'), p(x288, '1')]);
    K.series2(j288, 'GATE', p(w288, '2'), p(v288, 'G', 'G'));
    K.series2(j288, 'DRAIN', p(x288, '2'), p(y288, 'A', 'A'));
    K.join(j288, 'DRAIN_LED', NetType.SIGNAL, [p(y288, 'K', 'K'), p(v288, 'D', 'D')]);
    K.join(j288, 'GND', NetType.GROUND, [p(v288, 'S', 'S'), p(l288, '1', 'GND')]);
    const z288 = K.place(j288, 'IRF540', 'M2', { x: 820, y: 320 });
    const a289 = R(j288, 'R_10k', 'RG2', 720, 320);
    const b289 = R(j288, 'R_330', 'RD2', 920, 280);
    K.join(j288, 'VCC', NetType.POWER, [p(k288, '1', 'VCC'), p(b289, '1')]);
    K.series2(j288, 'GATE2', p(a289, '2'), p(z288, 'G', 'G'));
    K.join(j288, 'GND', NetType.GROUND, [p(a289, '1'), p(l288, '1', 'GND')]);
    K.join(j288, 'DRAIN2', NetType.SIGNAL, [p(z288, 'D', 'D'), p(b289, '2')]);
    K.join(j288, 'GND', NetType.GROUND, [p(z288, 'S', 'S')]);
}
export function buildLabAnalogIc(i287: SchematicDocument): void {
    const j287 = K.place(i287, 'VCC', 'PWR1', { x: 40, y: 60 });
    const k287 = K.place(i287, 'GND', 'GND1', { x: 40, y: 520 });
    const l287 = K.place(i287, 'VAC', 'AC1', { x: 40, y: 160 });
    const m287 = K.place(i287, 'UA741', 'U1', { x: 220, y: 140 });
    const n287 = R(i287, 'R_10k', 'R1', 120, 120);
    const o287 = R(i287, 'R_47k', 'Rf', 220, 60);
    const p287 = R(i287, 'R_10k', 'Rg1', 120, 180);
    K.join(i287, 'SIG', NetType.SIGNAL, [p(l287, '1'), p(n287, '1')]);
    K.join(i287, 'INV_IN', NetType.SIGNAL, [p(n287, '2'), p(m287, 'IN-', 'IN-'), p(o287, '1')]);
    K.join(i287, 'GND_BIAS', NetType.GROUND, [p(m287, 'IN+', 'IN+'), p(p287, '1')]);
    K.join(i287, 'OUT741', NetType.SIGNAL, [p(m287, 'OUT', 'OUT'), p(o287, '2')]);
    K.join(i287, 'VCC', NetType.POWER, [p(j287, '1', 'VCC'), p(m287, 'VCC', 'VCC')]);
    K.join(i287, 'GND', NetType.GROUND, [
        p(k287, '1', 'GND'), p(l287, '2'), p(m287, 'VEE', 'VEE'), p(p287, '2')
    ]);
    const q287 = K.place(i287, 'TL082', 'U2', { x: 420, y: 140 });
    const r287 = R(i287, 'R_10k', 'R2', 340, 120);
    K.join(i287, 'OUT741', NetType.SIGNAL, [p(r287, '1')]);
    K.join(i287, 'TL_IN', NetType.SIGNAL, [p(r287, '2'), p(q287, 'IN+1', 'IN+1')]);
    K.join(i287, 'TL_OUT', NetType.SIGNAL, [
        p(q287, 'OUT1', 'OUT1'), p(q287, 'IN-1', 'IN-1')
    ]);
    K.join(i287, 'VCC', NetType.POWER, [p(q287, 'V+', 'V+')]);
    K.join(i287, 'GND', NetType.GROUND, [p(q287, 'V-', 'V-')]);
    const s287 = K.place(i287, 'LM358', 'U3', { x: 620, y: 140 });
    const t287 = R(i287, 'R_10k', 'R3', 520, 120);
    const u287 = R(i287, 'R_100k', 'Rf3', 620, 60);
    const v287 = R(i287, 'R_10k', 'Rg3', 540, 220);
    K.join(i287, 'TL_OUT', NetType.SIGNAL, [p(t287, '1')]);
    K.join(i287, 'LM_IN', NetType.SIGNAL, [p(t287, '2'), p(s287, 'IN+1', 'IN+1')]);
    K.join(i287, 'LM_FB', NetType.SIGNAL, [p(s287, 'IN-1', 'IN-1'), p(u287, '1'), p(v287, '1')]);
    K.join(i287, 'LM_OUT', NetType.SIGNAL, [p(s287, 'OUT1', 'OUT1'), p(u287, '2')]);
    K.join(i287, 'VCC', NetType.POWER, [p(s287, 'V+', 'V+')]);
    K.join(i287, 'GND', NetType.GROUND, [p(s287, 'V-', 'V-'), p(v287, '2')]);
    const w287 = K.place(i287, 'VOLTMETER_DC', 'M1', { x: 760, y: 120 });
    K.join(i287, 'LM_OUT', NetType.SIGNAL, [p(w287, 'V+', 'V+')]);
    K.join(i287, 'GND', NetType.GROUND, [p(w287, 'COM', 'COM')]);
    const x287 = ['LM7805', 'LM7812', 'AMS1117_3V3'];
    for (let d288 = 0; d288 < x287.length; d288++) {
        const e288 = 160 + d288 * 160;
        const f288 = K.place(i287, x287[d288], `REG${d288 + 1}`, { x: e288 + 60, y: 360 });
        const g288 = C(i287, 'C_10uF', `CI${d288 + 1}`, e288, 440);
        const h288 = C(i287, 'C_100nF', `CO${d288 + 1}`, e288 + 140, 440);
        const i288 = R(i287, 'R_10k', `RL${d288 + 1}`, e288 + 140, 500);
        K.join(i287, 'VCC', NetType.POWER, [p(j287, '1', 'VCC'), p(g288, '1'), p(f288, '1')]);
        K.join(i287, `VOUT_R${d288}`, NetType.POWER, [p(f288, '3'), p(h288, '1'), p(i288, '1')]);
        K.join(i287, 'GND', NetType.GROUND, [
            p(f288, '2'), p(g288, '2'), p(h288, '2'), p(i288, '2'), p(k287, '1', 'GND')
        ]);
    }
    const y287 = K.place(i287, 'LM2596', 'U4', { x: 720, y: 360 });
    const z287 = C(i287, 'C_100uF', 'CBI', 640, 360);
    const a288 = C(i287, 'C_100uF', 'CBO', 820, 360);
    const b288 = K.place(i287, 'L_10uH', 'LB', { x: 820, y: 300 });
    const c288 = R(i287, 'R_10k', 'RFB', 760, 420);
    K.join(i287, 'VCC', NetType.POWER, [p(j287, '1', 'VCC'), p(z287, '1'), p(y287, '1')]);
    K.join(i287, 'GND', NetType.GROUND, [p(y287, '2'), p(z287, '2'), p(a288, '2'), p(c288, '2')]);
    K.join(i287, 'BUCK_SW', NetType.SIGNAL, [p(y287, '3'), p(b288, '1')]);
    K.join(i287, 'BUCK_OUT', NetType.POWER, [
        p(b288, '2'), p(a288, '1'), p(y287, '4'), p(y287, '5'), p(c288, '1')
    ]);
}
export function buildLabDigital(v286: SchematicDocument): void {
    const w286 = K.place(v286, 'VCC', 'PWR1', { x: 40, y: 60 });
    const x286 = K.place(v286, 'GND', 'GND1', { x: 40, y: 420 });
    const y286 = R(v286, 'R_10k', 'RHI', 120, 100);
    const z286 = R(v286, 'R_10k', 'RLO', 120, 200);
    K.join(v286, 'VCC', NetType.POWER, [p(w286, '1', 'VCC'), p(y286, '1')]);
    K.join(v286, 'LOGIC_H', NetType.SIGNAL, [p(y286, '2')]);
    K.join(v286, 'GND', NetType.GROUND, [p(x286, '1', 'GND'), p(z286, '2')]);
    K.join(v286, 'LOGIC_L', NetType.SIGNAL, [p(z286, '1')]);
    const a287: GateDef[] = [
        gate('74HC00', 'U1', true),
        gate('74HC02', 'U2', true),
        gate('74HC04', 'U3', false),
        gate('74HC08', 'U4', true),
        gate('74HC32', 'U5', true),
        gate('74HC74', 'U6', true)
    ];
    const b287: PinSpec[] = [];
    for (let f287 = 0; f287 < a287.length; f287++) {
        const g287 = a287[f287];
        const h287 = K.place(v286, g287.id, g287.ref, { x: 220 + f287 * 100, y: 180 });
        K.join(v286, 'VCC', NetType.POWER, [p(h287, '14'), p(w286, '1', 'VCC')]);
        K.join(v286, 'GND', NetType.GROUND, [p(h287, '7'), p(x286, '1', 'GND')]);
        if (g287.dual) {
            K.join(v286, 'LOGIC_H', NetType.SIGNAL, [p(h287, '1')]);
            K.join(v286, 'LOGIC_L', NetType.SIGNAL, [p(h287, '2')]);
            b287.push(p(h287, '3'));
        }
        else {
            K.join(v286, 'LOGIC_H', NetType.SIGNAL, [p(h287, '1')]);
            b287.push(p(h287, '2'));
        }
    }
    const c287 = K.place(v286, 'CD4017', 'U7', { x: 860, y: 180 });
    K.join(v286, 'VCC', NetType.POWER, [p(c287, '16'), p(w286, '1', 'VCC')]);
    K.join(v286, 'GND', NetType.GROUND, [p(c287, '8'), p(x286, '1', 'GND')]);
    K.join(v286, 'LOGIC_H', NetType.SIGNAL, [p(c287, '14')]);
    K.join(v286, 'LOGIC_L', NetType.SIGNAL, [p(c287, '13'), p(c287, '15')]);
    b287.push(p(c287, '3'));
    const d287 = K.place(v286, 'LOGIC_ANALYZER', 'LA1', { x: 860, y: 340 });
    K.join(v286, 'GND', NetType.GROUND, [p(d287, 'GND', 'GND')]);
    for (let e287 = 0; e287 < Math.min(b287.length, 8); e287++) {
        K.join(v286, `LA_CH${e287 + 1}`, NetType.SIGNAL, [
            b287[e287], p(d287, `CH${e287 + 1}`, `CH${e287 + 1}`)
        ]);
    }
}
export function buildLabMemory(g286: SchematicDocument): void {
    const h286 = K.place(g286, 'STM32F103RC', 'U1', { x: 180, y: 220 });
    const i286 = K.place(g286, 'VCC', 'PWR1', { x: 40, y: 100 });
    const j286 = K.place(g286, 'GND', 'GND1', { x: 40, y: 420 });
    const k286 = C(g286, 'C_100nF', 'C1', 280, 380);
    const l286 = R(g286, 'R_10k', 'R1', 100, 340);
    const m286 = K.place(g286, 'XTAL_8M', 'Y1', { x: 40, y: 60 });
    const n286 = C(g286, 'C_100nF', 'CX1', 20, 100);
    const o286 = C(g286, 'C_100nF', 'CX2', 20, 40);
    K.crystal(g286, h286, m286, n286, o286, 'P5', 'P6');
    K.mcuCore(g286, h286, i286, j286, l286, k286, 'P48', 'P24', 'P7');
    const p286 = K.place(g286, '24C02', 'M1', { x: 420, y: 120 });
    const q286 = R(g286, 'R_4.7k', 'RSDA', 360, 80);
    const r286 = R(g286, 'R_4.7k', 'RSCL', 360, 140);
    K.join(g286, 'GND', NetType.GROUND, [
        p(p286, '1'), p(p286, '2'), p(p286, '3'), p(p286, '4'), p(p286, '7')
    ]);
    K.join(g286, 'VCC', NetType.POWER, [p(p286, '8'), p(q286, '1'), p(r286, '1')]);
    K.join(g286, 'I2C_SDA', NetType.SIGNAL, [
        p(h286, 'P18', 'P18'), p(p286, '5'), p(q286, '2')
    ]);
    K.join(g286, 'I2C_SCL', NetType.SIGNAL, [
        p(h286, 'P19', 'P19'), p(p286, '6'), p(r286, '2')
    ]);
    const s286 = K.place(g286, 'W25Q64', 'M2', { x: 560, y: 120 });
    K.join(g286, 'VCC', NetType.POWER, [p(s286, '8'), p(s286, '3'), p(s286, '7')]);
    K.join(g286, 'GND', NetType.GROUND, [p(s286, '4')]);
    K.join(g286, 'SPI_CS', NetType.SIGNAL, [p(h286, 'P20', 'P20'), p(s286, '1')]);
    K.join(g286, 'SPI_MISO', NetType.SIGNAL, [p(h286, 'P21', 'P21'), p(s286, '2')]);
    K.join(g286, 'SPI_MOSI', NetType.SIGNAL, [p(h286, 'P22', 'P22'), p(s286, '5')]);
    K.join(g286, 'SPI_SCK', NetType.SIGNAL, [p(h286, 'P23', 'P23'), p(s286, '6')]);
    const t286 = K.place(g286, '2764', 'M3', { x: 720, y: 160 });
    K.join(g286, 'VCC', NetType.POWER, [p(t286, '28')]);
    K.join(g286, 'GND', NetType.GROUND, [p(t286, '14')]);
    K.join(g286, 'MEM_CE', NetType.SIGNAL, [p(h286, 'P25', 'P25'), p(t286, '20')]);
    K.join(g286, 'MEM_OE', NetType.SIGNAL, [p(h286, 'P26', 'P26'), p(t286, '22')]);
    K.join(g286, 'MEM_D0', NetType.SIGNAL, [p(h286, 'P27', 'P27'), p(t286, '11')]);
    const u286 = K.place(g286, '62256', 'M4', { x: 860, y: 160 });
    K.join(g286, 'VCC', NetType.POWER, [p(u286, '28')]);
    K.join(g286, 'GND', NetType.GROUND, [p(u286, '14')]);
    K.join(g286, 'SRAM_CE', NetType.SIGNAL, [p(h286, 'P28', 'P28'), p(u286, '20')]);
    K.join(g286, 'SRAM_OE', NetType.SIGNAL, [p(h286, 'P29', 'P29'), p(u286, '22')]);
    K.join(g286, 'SRAM_WE', NetType.SIGNAL, [p(h286, 'P30', 'P30'), p(u286, '27')]);
    K.join(g286, 'MEM_D0', NetType.SIGNAL, [p(u286, '11')]);
}
export function buildLabMcu8051(r285: SchematicDocument): void {
    const s285 = ['AT89C51', 'AT89C52', 'STC89C52', 'STC15W408AS'];
    const t285 = ['XTAL_11M', 'XTAL_11M', 'XTAL_11M', 'XTAL_8M'];
    for (let u285 = 0; u285 < s285.length; u285++) {
        const v285 = 60 + u285 * 300;
        const w285 = K.place(r285, s285[u285], `U${u285 + 1}`, { x: v285 + 140, y: 220 });
        const x285 = K.place(r285, t285[u285], `Y${u285 + 1}`, { x: v285 + 20, y: 60 });
        const y285 = C(r285, 'C_100nF', `C${u285 * 2 + 1}`, v285, 100);
        const z285 = C(r285, 'C_100nF', `C${u285 * 2 + 2}`, v285, 40);
        const a286 = C(r285, 'C_100nF', `CD${u285 + 1}`, v285 + 240, 340);
        const b286 = R(r285, 'R_10k', `R${u285 + 1}`, v285 + 60, 300);
        const c286 = K.place(r285, 'VCC', `PWR${u285 + 1}`, { x: v285, y: 140 });
        const d286 = K.place(r285, 'GND', `GND${u285 + 1}`, { x: v285, y: 380 });
        const e286 = R(r285, 'R_330', `RL${u285 + 1}`, v285 + 240, 160);
        const f286 = K.place(r285, 'LED_RED', `D${u285 + 1}`, { x: v285 + 320, y: 160 });
        K.crystal(r285, w285, x285, y285, z285, 'P18', 'P19', `M${u285}_`);
        K.mcuCore(r285, w285, c286, d286, b286, a286, 'P40', 'P20', 'P9', `M${u285}_`);
        K.join(r285, 'VCC', NetType.POWER, [p(w285, 'P31', 'P31')]);
        K.ledBranch(r285, p(w285, 'P1', 'P1'), p(d286, '1', 'GND'), e286, f286, `L${u285}`);
    }
}
export function buildLabMcuStm32(z284: SchematicDocument): void {
    const a285 = ['STM32F103C8', 'STM32F103RC', 'STM32F407VG', 'STM32L431CB', 'STM32F030F4'];
    for (let b285 = 0; b285 < a285.length; b285++) {
        const c285 = 40 + b285 * 260;
        const d285 = a285[b285];
        const e285 = d285.includes('F407');
        const f285 = e285 ? 'P100' : 'P48';
        const g285 = e285 ? 'P50' : 'P24';
        const h285 = K.place(z284, d285, `U${b285 + 1}`, { x: c285 + 130, y: 220 });
        const i285 = K.place(z284, 'XTAL_8M', `Y${b285 + 1}`, { x: c285 + 10, y: 60 });
        const j285 = C(z284, 'C_100nF', `C${b285 * 2 + 1}`, c285 - 10, 100);
        const k285 = C(z284, 'C_100nF', `C${b285 * 2 + 2}`, c285 - 10, 40);
        const l285 = C(z284, 'C_10uF', `CD${b285 + 1}`, c285 + 220, 340);
        const m285 = R(z284, 'R_10k', `R${b285 + 1}`, c285 + 50, 300);
        const n285 = K.place(z284, 'VCC', `PWR${b285 + 1}`, { x: c285, y: 140 });
        const o285 = K.place(z284, 'GND', `GND${b285 + 1}`, { x: c285, y: 400 });
        const p285 = R(z284, 'R_330', `RL${b285 + 1}`, c285 + 220, 160);
        const q285 = K.place(z284, 'LED_GREEN', `D${b285 + 1}`, { x: c285 + 300, y: 160 });
        K.crystal(z284, h285, i285, j285, k285, 'P5', 'P6', `S${b285}_`);
        K.mcuCore(z284, h285, n285, o285, m285, l285, f285, g285, 'P7', `S${b285}_`);
        K.ledBranch(z284, p(h285, 'P1', 'P1'), p(o285, '1', 'GND'), p285, q285, `L${b285}`);
    }
}
export function buildLabPeripheral(f284: SchematicDocument): void {
    const g284 = K.place(f284, 'STM32F103C8', 'U1', { x: 180, y: 220 });
    const h284 = K.place(f284, 'VCC', 'PWR1', { x: 40, y: 100 });
    const i284 = K.place(f284, 'GND', 'GND1', { x: 40, y: 480 });
    const j284 = C(f284, 'C_100nF', 'C1', 280, 380);
    const k284 = R(f284, 'R_10k', 'R1', 100, 340);
    const l284 = K.place(f284, 'XTAL_8M', 'Y1', { x: 40, y: 60 });
    const m284 = C(f284, 'C_100nF', 'CX1', 20, 100);
    const n284 = C(f284, 'C_100nF', 'CX2', 20, 40);
    K.crystal(f284, g284, l284, m284, n284, 'P5', 'P6');
    K.mcuCore(f284, g284, h284, i284, k284, j284, 'P48', 'P24', 'P7');
    const o284 = K.place(f284, 'SW_PUSH', 'SW1', { x: 400, y: 140 });
    const p284 = R(f284, 'R_10k', 'R2', 320, 140);
    K.join(f284, 'KEY', NetType.SIGNAL, [p(g284, 'P2', 'P2'), p(o284, '1'), p(p284, '1')]);
    K.join(f284, 'VCC', NetType.POWER, [p(p284, '2')]);
    K.join(f284, 'GND', NetType.GROUND, [p(o284, '2')]);
    const q284 = K.place(f284, 'RELAY_SPDT', 'K1', { x: 480, y: 240 });
    const r284 = R(f284, 'R_330', 'RR', 400, 240);
    K.join(f284, 'REL_DRV', NetType.SIGNAL, [p(g284, 'P3', 'P3'), p(r284, '1')]);
    K.series2(f284, 'REL_COIL', p(r284, '2'), p(q284, '1'));
    K.join(f284, 'GND', NetType.GROUND, [p(q284, '2')]);
    const s284 = K.place(f284, 'BUZZER', 'BZ1', { x: 600, y: 240 });
    const t284 = R(f284, 'R_330', 'RBZ', 520, 300);
    K.join(f284, 'BUZ', NetType.SIGNAL, [p(g284, 'P4', 'P4'), p(t284, '1')]);
    K.series2(f284, 'BUZ_DRV', p(t284, '2'), p(s284, '1'));
    K.join(f284, 'GND', NetType.GROUND, [p(s284, '2')]);
    const u284 = K.place(f284, 'LCD1602', 'LCD1', { x: 740, y: 160 });
    const v284 = R(f284, 'R_10k', 'RVO', 640, 200);
    K.join(f284, 'GND', NetType.GROUND, [p(u284, '1'), p(u284, '5'), p(u284, '16'), p(v284, '2')]);
    K.join(f284, 'VCC', NetType.POWER, [p(u284, '2'), p(u284, '15')]);
    K.join(f284, 'LCD_VO', NetType.SIGNAL, [p(u284, '3'), p(v284, '1')]);
    K.join(f284, 'GND', NetType.GROUND, [p(v284, '2')]);
    K.join(f284, 'LCD_RS', NetType.SIGNAL, [p(g284, 'P17', 'P17'), p(u284, '4')]);
    K.join(f284, 'LCD_E', NetType.SIGNAL, [p(g284, 'P16', 'P16'), p(u284, '6')]);
    K.join(f284, 'LCD_D4', NetType.SIGNAL, [p(g284, 'P12', 'P12'), p(u284, '11')]);
    K.join(f284, 'LCD_D5', NetType.SIGNAL, [p(g284, 'P13', 'P13'), p(u284, '12')]);
    K.join(f284, 'LCD_D6', NetType.SIGNAL, [p(g284, 'P14', 'P14'), p(u284, '13')]);
    K.join(f284, 'LCD_D7', NetType.SIGNAL, [p(g284, 'P15', 'P15'), p(u284, '14')]);
    const w284 = K.place(f284, 'OLED_12864', 'OLED1', { x: 740, y: 360 });
    const x284 = R(f284, 'R_4.7k', 'RODA', 640, 340);
    const y284 = R(f284, 'R_4.7k', 'ROCL', 640, 380);
    K.join(f284, 'VCC', NetType.POWER, [
        p(w284, 'VCC', 'VCC'), p(x284, '1'), p(y284, '1')
    ]);
    K.join(f284, 'GND', NetType.GROUND, [p(w284, 'GND', 'GND')]);
    K.join(f284, 'OLED_SDA', NetType.SIGNAL, [
        p(g284, 'P18', 'P18'), p(w284, 'SDA', 'SDA'), p(x284, '2')
    ]);
    K.join(f284, 'OLED_SCL', NetType.SIGNAL, [
        p(g284, 'P19', 'P19'), p(w284, 'SCL', 'SCL'), p(y284, '2')
    ]);
}
export function buildLabSensor(p283: SchematicDocument): void {
    const q283 = K.place(p283, 'STM32F103C8', 'U1', { x: 180, y: 220 });
    const r283 = K.place(p283, 'VCC', 'PWR1', { x: 40, y: 100 });
    const s283 = K.place(p283, 'GND', 'GND1', { x: 40, y: 420 });
    const t283 = C(p283, 'C_100nF', 'C1', 280, 380);
    const u283 = R(p283, 'R_10k', 'R1', 100, 340);
    const v283 = K.place(p283, 'XTAL_8M', 'Y1', { x: 40, y: 60 });
    const w283 = C(p283, 'C_100nF', 'CX1', 20, 100);
    const x283 = C(p283, 'C_100nF', 'CX2', 20, 40);
    K.crystal(p283, q283, v283, w283, x283, 'P5', 'P6');
    K.mcuCore(p283, q283, r283, s283, u283, t283, 'P48', 'P24', 'P7');
    const y283 = K.place(p283, 'DS18B20', 'T1', { x: 420, y: 140 });
    const z283 = R(p283, 'R_4.7k', 'R2', 340, 100);
    K.join(p283, '1WIRE', NetType.SIGNAL, [p(q283, 'P4', 'P4'), p(z283, '1'), p(y283, '1')]);
    K.join(p283, 'VCC', NetType.POWER, [p(z283, '2')]);
    K.join(p283, 'GND', NetType.GROUND, [p(y283, '2')]);
    const a284 = K.place(p283, 'HALL_SENSOR', 'H1', { x: 420, y: 240 });
    const b284 = R(p283, 'R_10k', 'RH', 340, 240);
    K.join(p283, 'VCC', NetType.POWER, [p(b284, '1')]);
    K.join(p283, 'HALL', NetType.SIGNAL, [
        p(q283, 'P8', 'P8'), p(a284, '1'), p(b284, '2')
    ]);
    K.join(p283, 'GND', NetType.GROUND, [p(a284, '2')]);
    const c284 = K.place(p283, 'LDR', 'LDR1', { x: 520, y: 320 });
    const d284 = R(p283, 'R_10k', 'R3', 420, 320);
    const e284 = K.place(p283, 'VOLTMETER_DC', 'M1', { x: 620, y: 280 });
    K.join(p283, 'VCC', NetType.POWER, [p(d284, '1')]);
    K.join(p283, 'ADC', NetType.SIGNAL, [
        p(q283, 'P9', 'P9'), p(d284, '2'), p(c284, '1'), p(e284, 'V+', 'V+')
    ]);
    K.join(p283, 'GND', NetType.GROUND, [p(c284, '2'), p(e284, 'COM', 'COM')]);
}
export function buildLabInstruments(e283: SchematicDocument): void {
    const f283 = K.place(e283, 'VCC', 'PWR1', { x: 40, y: 80 });
    const g283 = K.place(e283, 'GND', 'GND1', { x: 40, y: 400 });
    const h283 = K.place(e283, 'AMMETER_DC', 'A1', { x: 140, y: 140 });
    const i283 = R(e283, 'R_10k', 'R1', 240, 160);
    const j283 = R(e283, 'R_10k', 'R2', 360, 160);
    K.join(e283, 'VCC', NetType.POWER, [p(f283, '1', 'VCC'), p(h283, 'I+', 'I+')]);
    K.series2(e283, 'HI', p(h283, 'I-', 'I-'), p(i283, '1'));
    K.series2(e283, 'MID', p(i283, '2'), p(j283, '1'));
    K.join(e283, 'GND', NetType.GROUND, [p(j283, '2'), p(g283, '1', 'GND')]);
    const k283 = K.place(e283, 'VOLTMETER_DC', 'M1', { x: 480, y: 80 });
    K.join(e283, 'MID', NetType.SIGNAL, [p(k283, 'V+', 'V+')]);
    K.join(e283, 'GND', NetType.GROUND, [p(k283, 'COM', 'COM')]);
    const l283 = K.place(e283, 'VIRTUAL_METER', 'VM1', { x: 480, y: 180 });
    K.join(e283, 'MID', NetType.SIGNAL, [p(l283, 'V', 'V')]);
    K.join(e283, 'GND', NetType.GROUND, [p(l283, 'COM', 'COM')]);
    const m283 = K.place(e283, 'POWER_METER', 'PM1', { x: 600, y: 120 });
    K.join(e283, 'HI', NetType.SIGNAL, [p(m283, 'V+', 'V+'), p(m283, 'I+', 'I+')]);
    K.join(e283, 'GND', NetType.GROUND, [p(m283, 'V-', 'V-'), p(m283, 'I-', 'I-')]);
    const n283 = K.place(e283, 'FREQ_COUNTER', 'FC1', { x: 600, y: 260 });
    K.join(e283, 'MID', NetType.SIGNAL, [p(n283, 'IN', 'IN')]);
    K.join(e283, 'GND', NetType.GROUND, [p(n283, 'GND', 'GND')]);
    const o283 = K.place(e283, 'OSCILLOSCOPE', 'OSC1', { x: 740, y: 140 });
    K.join(e283, 'HI', NetType.SIGNAL, [p(o283, 'CH1', 'CH1')]);
    K.join(e283, 'MID', NetType.SIGNAL, [p(o283, 'CH2', 'CH2')]);
    K.join(e283, 'GND', NetType.GROUND, [p(o283, 'GND', 'GND')]);
}
