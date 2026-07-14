import { ErrCode } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/ErrCode";
const INT_VECTOR_INT0 = 0x0003;
const INT_VECTOR_TF0 = 0x000B;
const INT_VECTOR_INT1 = 0x0013;
const INT_VECTOR_TF1 = 0x001B;
const INT_VECTOR_SERIAL = 0x0023;
const INT_VECTOR_TF2 = 0x002B;
export enum Mcu8051PowerMode {
    NORMAL = "normal",
    IDLE = "idle",
    PDOWN = "pdown"
}
export interface Mcu8051State {
    memory: Uint8Array;
    regs: Map<string, number>;
    sfr: Map<number, number>;
    pc: number;
    uartTx: string;
    uartRxBuffer: number[];
    pinLevels: Map<string, number>;
    timer0Ticks: number;
    timer1Ticks: number;
    interruptPending: boolean;
    interruptSource: number;
    lastError: ErrCode;
    powerMode: Mcu8051PowerMode;
}
export class Mcu8051Engine {
    static createState(a9: number = 65536): Mcu8051State {
        const b9: Mcu8051State = {
            memory: new Uint8Array(a9),
            regs: new Map(),
            sfr: new Map(),
            pc: 0,
            uartTx: '',
            uartRxBuffer: [],
            pinLevels: new Map(),
            timer0Ticks: 0,
            timer1Ticks: 0,
            interruptPending: false,
            interruptSource: 0,
            lastError: ErrCode.OK,
            powerMode: Mcu8051PowerMode.NORMAL
        };
        Mcu8051Engine.initSfr(b9);
        Mcu8051Engine.reset(b9);
        return b9;
    }
    static initSfr(z8: Mcu8051State): void {
        z8.sfr.set(0x80, 0xFF);
        z8.sfr.set(0x90, 0xFF);
        z8.sfr.set(0xA0, 0xFF);
        z8.sfr.set(0xB0, 0xFF);
        z8.sfr.set(0x88, 0x00);
        z8.sfr.set(0x89, 0x00);
        z8.sfr.set(0x8A, 0x00);
        z8.sfr.set(0x8B, 0x00);
        z8.sfr.set(0x8C, 0x00);
        z8.sfr.set(0x8D, 0x00);
        z8.sfr.set(0x98, 0x00);
        z8.sfr.set(0x99, 0x00);
        z8.sfr.set(0xA8, 0x00);
        z8.sfr.set(0xB8, 0x00);
    }
    static reset(w8: Mcu8051State): void {
        w8.regs.set('ACC', 0);
        w8.regs.set('B', 0);
        w8.regs.set('PSW', 0);
        w8.regs.set('SP', 0x07);
        w8.regs.set('DPL', 0);
        w8.regs.set('DPH', 0);
        for (let x8 = 0; x8 < 8; x8++) {
            w8.regs.set(`R${x8}`, 0);
            for (let y8 = 1; y8 <= 3; y8++) {
                w8.regs.set(`R${y8}${x8}`, 0);
            }
        }
        w8.pc = 0;
        w8.uartTx = '';
        w8.uartRxBuffer = [];
        w8.timer0Ticks = 0;
        w8.timer1Ticks = 0;
        w8.interruptPending = false;
        w8.interruptSource = 0;
        w8.lastError = ErrCode.OK;
        w8.powerMode = Mcu8051PowerMode.NORMAL;
        Mcu8051Engine.initSfr(w8);
    }
    static step(i8: Mcu8051State): boolean {
        if (i8.powerMode === Mcu8051PowerMode.PDOWN)
            return false;
        if (i8.powerMode === Mcu8051PowerMode.IDLE) {
            Mcu8051Engine.tickTimers(i8);
            Mcu8051Engine.tickUart(i8);
            if (i8.interruptPending)
                i8.powerMode = Mcu8051PowerMode.NORMAL;
            return true;
        }
        if (i8.interruptPending) {
            const l8 = i8.sfr.get(0xA8) ?? 0;
            const m8 = i8.sfr.get(0xB8) ?? 0;
            const n8: Array<[
                number,
                number,
                number,
                number
            ]> = [
                [0, 0x01, 0x01, INT_VECTOR_INT0],
                [1, 0x02, 0x02, INT_VECTOR_TF0],
                [2, 0x04, 0x04, INT_VECTOR_INT1],
                [3, 0x08, 0x08, INT_VECTOR_TF1],
                [4, 0x10, 0x10, INT_VECTOR_SERIAL],
                [5, 0x20, 0x20, INT_VECTOR_TF2]
            ];
            let o8 = 0;
            let p8 = -1;
            for (let q8 = 0; q8 < n8.length; q8++) {
                const r8 = n8[q8][0];
                const s8 = n8[q8][1];
                const t8 = n8[q8][2];
                const u8 = n8[q8][3];
                if (i8.interruptSource === r8 && (l8 & s8)) {
                    const v8 = (m8 & t8) ? 1 : 0;
                    if (v8 > p8) {
                        p8 = v8;
                        o8 = u8;
                    }
                }
            }
            if (o8 > 0) {
                Mcu8051Engine.pushReturnAddress(i8, i8.pc);
                i8.pc = o8;
                i8.interruptPending = false;
                return true;
            }
        }
        const j8 = i8.memory[i8.pc];
        if (j8 === undefined)
            return false;
        const k8 = i8.pc;
        switch (j8) {
            case 0x00:
                i8.pc += 1;
                break;
            case 0x04:
                Mcu8051Engine.incAcc(i8);
                i8.pc += 1;
                break;
            case 0x05:
                Mcu8051Engine.incDirect(i8, i8.memory[i8.pc + 1]);
                i8.pc += 2;
                break;
            case 0x14:
                Mcu8051Engine.decAcc(i8);
                i8.pc += 1;
                break;
            case 0x24:
                Mcu8051Engine.addAccImm(i8, i8.memory[i8.pc + 1]);
                i8.pc += 2;
                break;
            case 0x25:
                Mcu8051Engine.addAccImm(i8, Mcu8051Engine.readMem(i8, i8.memory[i8.pc + 1]));
                i8.pc += 2;
                break;
            case 0x34:
                Mcu8051Engine.addcAccImm(i8, i8.memory[i8.pc + 1]);
                i8.pc += 2;
                break;
            case 0x44:
                Mcu8051Engine.orlAccImm(i8, i8.memory[i8.pc + 1]);
                i8.pc += 2;
                break;
            case 0x54:
                Mcu8051Engine.anlAccImm(i8, i8.memory[i8.pc + 1]);
                i8.pc += 2;
                break;
            case 0x64:
                Mcu8051Engine.xrlAccImm(i8, i8.memory[i8.pc + 1]);
                i8.pc += 2;
                break;
            case 0x74:
                i8.regs.set('ACC', i8.memory[i8.pc + 1]);
                i8.pc += 2;
                break;
            case 0x75:
                Mcu8051Engine.writeMem(i8, i8.memory[i8.pc + 1], i8.memory[i8.pc + 2]);
                i8.pc += 3;
                break;
            case 0x85:
                Mcu8051Engine.movDirectDirect(i8, i8.memory[i8.pc + 1], i8.memory[i8.pc + 2]);
                i8.pc += 3;
                break;
            case 0xE5:
                i8.regs.set('ACC', Mcu8051Engine.readMem(i8, i8.memory[i8.pc + 1]));
                i8.pc += 2;
                break;
            case 0xF5:
                Mcu8051Engine.writeMem(i8, i8.memory[i8.pc + 1], i8.regs.get('ACC') ?? 0);
                i8.pc += 2;
                break;
            case 0xA3:
                Mcu8051Engine.incDPTR(i8);
                i8.pc += 1;
                break;
            case 0x03:
                Mcu8051Engine.rrAcc(i8);
                i8.pc += 1;
                break;
            case 0x13:
                Mcu8051Engine.rrcAcc(i8);
                i8.pc += 1;
                break;
            case 0x23:
                Mcu8051Engine.rlAcc(i8);
                i8.pc += 1;
                break;
            case 0x33:
                Mcu8051Engine.rlcAcc(i8);
                i8.pc += 1;
                break;
            case 0xC4:
                Mcu8051Engine.swapAcc(i8);
                i8.pc += 1;
                break;
            case 0x94:
                Mcu8051Engine.subbAccImm(i8, i8.memory[i8.pc + 1]);
                i8.pc += 2;
                break;
            case 0x95:
                Mcu8051Engine.subbAccImm(i8, Mcu8051Engine.readMem(i8, i8.memory[i8.pc + 1]));
                i8.pc += 2;
                break;
            case 0xA4:
                Mcu8051Engine.mulAb(i8);
                i8.pc += 1;
                break;
            case 0x84:
                Mcu8051Engine.divAb(i8);
                i8.pc += 1;
                break;
            case 0xD4:
                Mcu8051Engine.daA(i8);
                i8.pc += 1;
                break;
            case 0xC3:
                Mcu8051Engine.setC(i8, false);
                i8.pc += 1;
                break;
            case 0xD3:
                Mcu8051Engine.setC(i8, true);
                i8.pc += 1;
                break;
            case 0xB5:
                Mcu8051Engine.cjneDirect(i8, i8.memory[i8.pc + 1], i8.memory[i8.pc + 2], i8.memory[i8.pc + 3]);
                break;
            case 0xD8:
                Mcu8051Engine.djnzDirect(i8, i8.memory[i8.pc + 1], i8.memory[i8.pc + 2]);
                break;
            case 0xC0:
                Mcu8051Engine.pushDirect(i8, i8.memory[i8.pc + 1]);
                i8.pc += 2;
                break;
            case 0xD0:
                Mcu8051Engine.popDirect(i8, i8.memory[i8.pc + 1]);
                i8.pc += 2;
                break;
            case 0x83:
                Mcu8051Engine.movcAccDptr(i8);
                i8.pc += 1;
                break;
            case 0x93:
                Mcu8051Engine.movcAccPc(i8);
                i8.pc += 1;
                break;
            case 0xE0:
                Mcu8051Engine.movxAccDptr(i8);
                i8.pc += 1;
                break;
            case 0xF0:
                Mcu8051Engine.movxDptrAcc(i8);
                i8.pc += 1;
                break;
            case 0xC5:
                Mcu8051Engine.xchDirect(i8, i8.memory[i8.pc + 1]);
                i8.pc += 2;
                break;
            case 0x80:
                Mcu8051Engine.sjmp(i8, i8.memory[i8.pc + 1]);
                break;
            case 0x70:
                Mcu8051Engine.jnz(i8, i8.memory[i8.pc + 1]);
                break;
            case 0x60:
                Mcu8051Engine.jz(i8, i8.memory[i8.pc + 1]);
                break;
            case 0x40:
                Mcu8051Engine.jc(i8, i8.memory[i8.pc + 1]);
                break;
            case 0x50:
                Mcu8051Engine.jnc(i8, i8.memory[i8.pc + 1]);
                break;
            case 0x20:
                Mcu8051Engine.jb(i8, i8.memory[i8.pc + 1], i8.memory[i8.pc + 2]);
                break;
            case 0x30:
                Mcu8051Engine.jnb(i8, i8.memory[i8.pc + 1], i8.memory[i8.pc + 2]);
                break;
            case 0x10:
                Mcu8051Engine.jbc(i8, i8.memory[i8.pc + 1], i8.memory[i8.pc + 2]);
                break;
            case 0x02:
                Mcu8051Engine.ljmp(i8, i8.memory[i8.pc + 1], i8.memory[i8.pc + 2]);
                break;
            case 0x12:
                Mcu8051Engine.lcall(i8, i8.memory[i8.pc + 1], i8.memory[i8.pc + 2]);
                break;
            case 0x22:
                i8.pc = Mcu8051Engine.popReturnAddress(i8);
                break;
            case 0x32:
                i8.pc = Mcu8051Engine.popReturnAddress(i8);
                Mcu8051Engine.clearInterrupt(i8);
                break;
            default:
                if (Mcu8051Engine.dispatchFamily(i8, j8))
                    break;
                i8.lastError = ErrCode.ERR_MCU_INVALID_OPCODE;
                i8.pc += 1;
        }
        if (i8.pc === k8 && j8 !== 0x00)
            i8.pc += 1;
        Mcu8051Engine.tickTimers(i8);
        Mcu8051Engine.tickUart(i8);
        i8.regs.set('PC', i8.pc);
        return i8.lastError === ErrCode.OK;
    }
    private static dispatchFamily(g8: Mcu8051State, h8: number): boolean {
        if ((h8 & 0xE1) === 0x01) {
            Mcu8051Engine.ajmp(g8, (h8 >> 5) & 0x07, g8.memory[g8.pc + 1]);
            return true;
        }
        if ((h8 & 0xE1) === 0x11) {
            Mcu8051Engine.acall(g8, (h8 >> 5) & 0x07, g8.memory[g8.pc + 1]);
            g8.pc += 2;
            return true;
        }
        if (h8 >= 0x08 && h8 <= 0x0F) {
            Mcu8051Engine.incReg(g8, h8 - 0x08);
            g8.pc += 1;
            return true;
        }
        if (h8 >= 0x18 && h8 <= 0x1F) {
            Mcu8051Engine.decReg(g8, h8 - 0x18);
            g8.pc += 1;
            return true;
        }
        if (h8 >= 0xE8 && h8 <= 0xEF) {
            Mcu8051Engine.movAccReg(g8, h8 - 0xE8);
            g8.pc += 1;
            return true;
        }
        if (h8 >= 0xF8 && h8 <= 0xFF) {
            Mcu8051Engine.movRegAcc(g8, h8 - 0xF8);
            g8.pc += 1;
            return true;
        }
        if (h8 >= 0xE6 && h8 <= 0xE7) {
            g8.regs.set('ACC', Mcu8051Engine.readMem(g8, Mcu8051Engine.getRiAddr(g8, h8 - 0xE6)));
            g8.pc += 1;
            return true;
        }
        if (h8 >= 0xF6 && h8 <= 0xF7) {
            Mcu8051Engine.writeMem(g8, Mcu8051Engine.getRiAddr(g8, h8 - 0xF6), g8.regs.get('ACC') ?? 0);
            g8.pc += 1;
            return true;
        }
        if (h8 >= 0x76 && h8 <= 0x77) {
            Mcu8051Engine.writeMem(g8, Mcu8051Engine.getRiAddr(g8, h8 - 0x76), g8.memory[g8.pc + 1]);
            g8.pc += 2;
            return true;
        }
        if (h8 >= 0xB8 && h8 <= 0xBF) {
            Mcu8051Engine.cjneReg(g8, h8 - 0xB8, g8.memory[g8.pc + 1], g8.memory[g8.pc + 2]);
            return true;
        }
        if (h8 >= 0xD8 && h8 <= 0xDF && h8 !== 0xD8) {
            Mcu8051Engine.djnzReg(g8, h8 - 0xD8, g8.memory[g8.pc + 1]);
            return true;
        }
        if (h8 === 0xC2) {
            Mcu8051Engine.clrBit(g8, g8.memory[g8.pc + 1]);
            g8.pc += 2;
            return true;
        }
        if (h8 === 0xD2) {
            Mcu8051Engine.setBit(g8, g8.memory[g8.pc + 1]);
            g8.pc += 2;
            return true;
        }
        if (h8 === 0xB2) {
            Mcu8051Engine.cplBit(g8, g8.memory[g8.pc + 1]);
            g8.pc += 2;
            return true;
        }
        if (h8 === 0x92) {
            Mcu8051Engine.setCBit(g8, g8.memory[g8.pc + 1]);
            g8.pc += 2;
            return true;
        }
        if (h8 === 0x82) {
            Mcu8051Engine.clrCBit(g8, g8.memory[g8.pc + 1]);
            g8.pc += 2;
            return true;
        }
        if (h8 === 0xB3) {
            Mcu8051Engine.cplCBit(g8, g8.memory[g8.pc + 1]);
            g8.pc += 2;
            return true;
        }
        return false;
    }
    private static getRiAddr(d8: Mcu8051State, e8: number): number {
        const f8 = Mcu8051Engine.getReg(d8, e8);
        return f8;
    }
    private static getReg(a8: Mcu8051State, b8: number): number {
        const c8 = ((a8.regs.get('PSW') ?? 0) >> 3) & 0x03;
        if (c8 === 0)
            return a8.regs.get(`R${b8}`) ?? 0;
        return a8.regs.get(`R${c8}${b8}`) ?? 0;
    }
    private static setReg(w7: Mcu8051State, x7: number, y7: number): void {
        const z7 = ((w7.regs.get('PSW') ?? 0) >> 3) & 0x03;
        if (z7 === 0) {
            w7.regs.set(`R${x7}`, y7 & 0xFF);
        }
        else {
            w7.regs.set(`R${z7}${x7}`, y7 & 0xFF);
        }
    }
    static readMem(u7: Mcu8051State, v7: number): number {
        if (v7 >= 0x80 && v7 <= 0xFF)
            return u7.sfr.get(v7) ?? 0;
        return u7.memory[v7] ?? 0;
    }
    static writeMem(r7: Mcu8051State, s7: number, t7: number): void {
        if (s7 >= 0x80 && s7 <= 0xFF) {
            r7.sfr.set(s7, t7 & 0xFF);
            if (s7 === 0x99)
                r7.uartTx += String.fromCharCode(t7 & 0xFF);
            return;
        }
        r7.memory[s7] = t7 & 0xFF;
    }
    private static incAcc(q7: Mcu8051State): void { q7.regs.set('ACC', ((q7.regs.get('ACC') ?? 0) + 1) & 0xFF); }
    private static decAcc(p7: Mcu8051State): void { p7.regs.set('ACC', ((p7.regs.get('ACC') ?? 0) - 1) & 0xFF); }
    private static incDirect(n7: Mcu8051State, o7: number): void { Mcu8051Engine.writeMem(n7, o7, (Mcu8051Engine.readMem(n7, o7) + 1) & 0xFF); }
    private static addAccImm(l7: Mcu8051State, m7: number): void { l7.regs.set('ACC', ((l7.regs.get('ACC') ?? 0) + m7) & 0xFF); }
    private static addcAccImm(h7: Mcu8051State, i7: number): void {
        const j7 = Mcu8051Engine.getC(h7) ? 1 : 0;
        const k7 = (h7.regs.get('ACC') ?? 0) + i7 + j7;
        Mcu8051Engine.setC(h7, k7 > 255);
        h7.regs.set('ACC', k7 & 0xFF);
    }
    private static orlAccImm(f7: Mcu8051State, g7: number): void { f7.regs.set('ACC', (f7.regs.get('ACC') ?? 0) | g7); }
    private static anlAccImm(d7: Mcu8051State, e7: number): void { d7.regs.set('ACC', (d7.regs.get('ACC') ?? 0) & e7); }
    private static xrlAccImm(b7: Mcu8051State, c7: number): void { b7.regs.set('ACC', (b7.regs.get('ACC') ?? 0) ^ c7); }
    private static subbAccImm(x6: Mcu8051State, y6: number): void {
        const z6 = Mcu8051Engine.getC(x6) ? 1 : 0;
        const a7 = (x6.regs.get('ACC') ?? 0) - y6 - z6;
        Mcu8051Engine.setC(x6, a7 < 0);
        x6.regs.set('ACC', a7 & 0xFF);
    }
    private static mulAb(v6: Mcu8051State): void {
        const w6 = (v6.regs.get('ACC') ?? 0) * (v6.regs.get('B') ?? 0);
        v6.regs.set('ACC', w6 & 0xFF);
        v6.regs.set('B', (w6 >> 8) & 0xFF);
        Mcu8051Engine.setC(v6, false);
    }
    private static divAb(s6: Mcu8051State): void {
        const t6 = s6.regs.get('ACC') ?? 0;
        const u6 = s6.regs.get('B') ?? 1;
        if (u6 === 0) {
            s6.lastError = ErrCode.ERR_MCU_INVALID_OPCODE;
            return;
        }
        s6.regs.set('ACC', Math.floor(t6 / u6) & 0xFF);
        s6.regs.set('B', (t6 % u6) & 0xFF);
    }
    private static daA(q6: Mcu8051State): void {
        let r6 = q6.regs.get('ACC') ?? 0;
        if ((r6 & 0x0F) > 9 || Mcu8051Engine.getC(q6))
            r6 += 6;
        if (r6 > 0x9F || Mcu8051Engine.getAC(q6)) {
            r6 += 0x60;
            Mcu8051Engine.setC(q6, true);
        }
        q6.regs.set('ACC', r6 & 0xFF);
    }
    private static swapAcc(o6: Mcu8051State): void {
        const p6 = o6.regs.get('ACC') ?? 0;
        o6.regs.set('ACC', ((p6 & 0x0F) << 4) | ((p6 >> 4) & 0x0F));
    }
    private static rrAcc(n6: Mcu8051State): void { n6.regs.set('ACC', ((n6.regs.get('ACC') ?? 0) >> 1) | (((n6.regs.get('ACC') ?? 0) & 1) << 7)); }
    private static rrcAcc(m6: Mcu8051State): void { m6.regs.set('ACC', ((m6.regs.get('ACC') ?? 0) >> 1) | (Mcu8051Engine.getC(m6) ? 0x80 : 0)); }
    private static rlAcc(l6: Mcu8051State): void { l6.regs.set('ACC', ((l6.regs.get('ACC') ?? 0) << 1) & 0xFF); }
    private static rlcAcc(k6: Mcu8051State): void { k6.regs.set('ACC', (((k6.regs.get('ACC') ?? 0) << 1) & 0xFF) | (Mcu8051Engine.getC(k6) ? 1 : 0)); }
    private static incReg(i6: Mcu8051State, j6: number): void { Mcu8051Engine.setReg(i6, j6, Mcu8051Engine.getReg(i6, j6) + 1); }
    private static decReg(g6: Mcu8051State, h6: number): void { Mcu8051Engine.setReg(g6, h6, Mcu8051Engine.getReg(g6, h6) - 1); }
    private static movAccReg(e6: Mcu8051State, f6: number): void { e6.regs.set('ACC', Mcu8051Engine.getReg(e6, f6)); }
    private static movRegAcc(c6: Mcu8051State, d6: number): void { Mcu8051Engine.setReg(c6, d6, c6.regs.get('ACC') ?? 0); }
    private static cjneDirect(y5: Mcu8051State, z5: number, a6: number, b6: number): void {
        if (Mcu8051Engine.readMem(y5, z5) !== a6)
            Mcu8051Engine.sjmp(y5, b6);
        else
            y5.pc += 3;
    }
    private static cjneReg(u5: Mcu8051State, v5: number, w5: number, x5: number): void {
        if (Mcu8051Engine.getReg(u5, v5) !== w5)
            Mcu8051Engine.sjmp(u5, x5);
        else
            u5.pc += 3;
    }
    private static djnzDirect(q5: Mcu8051State, r5: number, s5: number): void {
        const t5 = (Mcu8051Engine.readMem(q5, r5) - 1) & 0xFF;
        Mcu8051Engine.writeMem(q5, r5, t5);
        if (t5 !== 0)
            Mcu8051Engine.sjmp(q5, s5);
        else
            q5.pc += 2;
    }
    private static djnzReg(m5: Mcu8051State, n5: number, o5: number): void {
        const p5 = (Mcu8051Engine.getReg(m5, n5) - 1) & 0xFF;
        Mcu8051Engine.setReg(m5, n5, p5);
        if (p5 !== 0)
            Mcu8051Engine.sjmp(m5, o5);
        else
            m5.pc += 2;
    }
    private static ajmp(j5: Mcu8051State, k5: number, l5: number): void {
        j5.pc = ((j5.pc + 2) & 0xF800) | (k5 << 8) | l5;
    }
    private static acall(g5: Mcu8051State, h5: number, i5: number): void {
        Mcu8051Engine.pushReturnAddress(g5, g5.pc + 2);
        g5.pc = ((g5.pc + 2) & 0xF800) | (h5 << 8) | i5;
    }
    private static movDirectDirect(d5: Mcu8051State, e5: number, f5: number): void {
        Mcu8051Engine.writeMem(d5, e5, Mcu8051Engine.readMem(d5, f5));
    }
    private static xchDirect(z4: Mcu8051State, a5: number): void {
        const b5 = z4.regs.get('ACC') ?? 0;
        const c5 = Mcu8051Engine.readMem(z4, a5);
        z4.regs.set('ACC', c5);
        Mcu8051Engine.writeMem(z4, a5, b5);
    }
    private static incDPTR(x4: Mcu8051State): void {
        let y4 = ((x4.regs.get('DPH') ?? 0) << 8) | (x4.regs.get('DPL') ?? 0);
        y4 = (y4 + 1) & 0xFFFF;
        x4.regs.set('DPL', y4 & 0xFF);
        x4.regs.set('DPH', (y4 >> 8) & 0xFF);
    }
    private static movcAccDptr(u4: Mcu8051State): void {
        const v4 = ((u4.regs.get('DPH') ?? 0) << 8) | (u4.regs.get('DPL') ?? 0);
        const w4 = ((u4.regs.get('ACC') ?? 0) + v4) & 0xFFFF;
        u4.regs.set('ACC', u4.memory[w4] ?? 0);
    }
    private static movcAccPc(s4: Mcu8051State): void {
        const t4 = ((s4.regs.get('ACC') ?? 0) + s4.pc + 1) & 0xFFFF;
        s4.regs.set('ACC', s4.memory[t4] ?? 0);
    }
    private static movxAccDptr(q4: Mcu8051State): void {
        const r4 = ((q4.regs.get('DPH') ?? 0) << 8) | (q4.regs.get('DPL') ?? 0);
        q4.regs.set('ACC', Mcu8051Engine.readMem(q4, r4));
    }
    private static movxDptrAcc(o4: Mcu8051State): void {
        const p4 = ((o4.regs.get('DPH') ?? 0) << 8) | (o4.regs.get('DPL') ?? 0);
        Mcu8051Engine.writeMem(o4, p4, o4.regs.get('ACC') ?? 0);
    }
    private static pushDirect(l4: Mcu8051State, m4: number): void {
        let n4 = l4.regs.get('SP') ?? 0x07;
        n4 += 1;
        l4.memory[n4] = Mcu8051Engine.readMem(l4, m4);
        l4.regs.set('SP', n4);
    }
    private static popDirect(i4: Mcu8051State, j4: number): void {
        let k4 = i4.regs.get('SP') ?? 0x07;
        Mcu8051Engine.writeMem(i4, j4, i4.memory[k4]);
        k4 -= 1;
        i4.regs.set('SP', k4);
    }
    private static getC(h4: Mcu8051State): boolean { return ((h4.regs.get('PSW') ?? 0) & 0x80) !== 0; }
    private static getAC(g4: Mcu8051State): boolean { return ((g4.regs.get('PSW') ?? 0) & 0x40) !== 0; }
    private static setC(d4: Mcu8051State, e4: boolean): void {
        let f4 = d4.regs.get('PSW') ?? 0;
        f4 = e4 ? (f4 | 0x80) : (f4 & 0x7F);
        d4.regs.set('PSW', f4);
    }
    private static resolveBitAddr(c4: number): [
        number,
        number
    ] {
        if (c4 < 0x80) {
            return [0x20 + (c4 >> 3), c4 & 7];
        }
        return [c4 & 0xF8, c4 & 7];
    }
    private static setBit(x3: Mcu8051State, y3: number): void {
        const z3 = Mcu8051Engine.resolveBitAddr(y3);
        const a4 = z3[0];
        const b4 = z3[1];
        Mcu8051Engine.writeMem(x3, a4, Mcu8051Engine.readMem(x3, a4) | (1 << b4));
    }
    private static clrBit(s3: Mcu8051State, t3: number): void {
        const u3 = Mcu8051Engine.resolveBitAddr(t3);
        const v3 = u3[0];
        const w3 = u3[1];
        Mcu8051Engine.writeMem(s3, v3, Mcu8051Engine.readMem(s3, v3) & ~(1 << w3));
    }
    private static cplBit(n3: Mcu8051State, o3: number): void {
        const p3 = Mcu8051Engine.resolveBitAddr(o3);
        const q3 = p3[0];
        const r3 = p3[1];
        Mcu8051Engine.writeMem(n3, q3, Mcu8051Engine.readMem(n3, q3) ^ (1 << r3));
    }
    private static readBit(i3: Mcu8051State, j3: number): boolean {
        const k3 = Mcu8051Engine.resolveBitAddr(j3);
        const l3 = k3[0];
        const m3 = k3[1];
        return ((Mcu8051Engine.readMem(i3, l3) >> m3) & 1) !== 0;
    }
    private static setCBit(g3: Mcu8051State, h3: number): void { Mcu8051Engine.setBit(g3, h3); }
    private static clrCBit(e3: Mcu8051State, f3: number): void { Mcu8051Engine.clrBit(e3, f3); }
    private static cplCBit(c3: Mcu8051State, d3: number): void { Mcu8051Engine.cplBit(c3, d3); }
    private static sjmp(a3: Mcu8051State, b3: number): void { a3.pc += 2 + (b3 > 127 ? b3 - 256 : b3); }
    private static jnz(y2: Mcu8051State, z2: number): void {
        if ((y2.regs.get('ACC') ?? 0) !== 0)
            Mcu8051Engine.sjmp(y2, z2);
        else
            y2.pc += 2;
    }
    private static jz(w2: Mcu8051State, x2: number): void {
        if ((w2.regs.get('ACC') ?? 0) === 0)
            Mcu8051Engine.sjmp(w2, x2);
        else
            w2.pc += 2;
    }
    private static jc(u2: Mcu8051State, v2: number): void {
        if (Mcu8051Engine.getC(u2))
            Mcu8051Engine.sjmp(u2, v2);
        else
            u2.pc += 2;
    }
    private static jnc(s2: Mcu8051State, t2: number): void {
        if (!Mcu8051Engine.getC(s2))
            Mcu8051Engine.sjmp(s2, t2);
        else
            s2.pc += 2;
    }
    private static jb(p2: Mcu8051State, q2: number, r2: number): void {
        if (Mcu8051Engine.readBit(p2, q2))
            Mcu8051Engine.sjmp(p2, r2);
        else
            p2.pc += 3;
    }
    private static jnb(m2: Mcu8051State, n2: number, o2: number): void {
        if (!Mcu8051Engine.readBit(m2, n2))
            Mcu8051Engine.sjmp(m2, o2);
        else
            m2.pc += 3;
    }
    private static jbc(j2: Mcu8051State, k2: number, l2: number): void {
        if (Mcu8051Engine.readBit(j2, k2)) {
            Mcu8051Engine.clrBit(j2, k2);
            Mcu8051Engine.sjmp(j2, l2);
        }
        else
            j2.pc += 3;
    }
    private static ljmp(g2: Mcu8051State, h2: number, i2: number): void { g2.pc = (h2 << 8) | i2; }
    private static lcall(d2: Mcu8051State, e2: number, f2: number): void {
        Mcu8051Engine.pushReturnAddress(d2, d2.pc + 3);
        d2.pc = (e2 << 8) | f2;
    }
    private static pushReturnAddress(a2: Mcu8051State, b2: number): void {
        let c2 = a2.regs.get('SP') ?? 0x07;
        c2 += 1;
        a2.memory[c2] = b2 & 0xFF;
        c2 += 1;
        a2.memory[c2] = (b2 >> 8) & 0xFF;
        a2.regs.set('SP', c2);
    }
    private static popReturnAddress(w1: Mcu8051State): number {
        let x1 = w1.regs.get('SP') ?? 0x07;
        const y1 = w1.memory[x1];
        x1 -= 1;
        const z1 = w1.memory[x1];
        x1 -= 1;
        w1.regs.set('SP', x1);
        return ((y1 & 0xFF) << 8) | (z1 & 0xFF);
    }
    private static clearInterrupt(v1: Mcu8051State): void { v1.interruptPending = false; }
    private static tickTimers(o1: Mcu8051State): void {
        const p1 = o1.sfr.get(0x88) ?? 0;
        const q1 = o1.sfr.get(0x89) ?? 0;
        if (p1 & 0x10) {
            o1.timer0Ticks++;
            const t1 = q1 & 0x03;
            let u1 = Mcu8051Engine.getTimerPeriod(o1, 0, t1);
            if (o1.timer0Ticks >= u1) {
                o1.timer0Ticks = 0;
                Mcu8051Engine.handleTimerOverflow(o1, 0, t1, p1);
            }
        }
        if (p1 & 0x40) {
            o1.timer1Ticks++;
            const r1 = (q1 >> 4) & 0x03;
            let s1 = Mcu8051Engine.getTimerPeriod(o1, 1, r1);
            if (o1.timer1Ticks >= s1) {
                o1.timer1Ticks = 0;
                Mcu8051Engine.handleTimerOverflow(o1, 1, r1, p1);
            }
        }
    }
    private static getTimerPeriod(h1: Mcu8051State, i1: number, j1: number): number {
        const k1 = i1 === 0 ? 0x8C : 0x8D;
        const l1 = i1 === 0 ? 0x8A : 0x8B;
        const m1 = h1.sfr.get(k1) ?? 0;
        const n1 = h1.sfr.get(l1) ?? 0;
        switch (j1) {
            case 0:
                return 0x2000 - (((m1 << 5) | (n1 & 0x1F)) & 0x1FFF);
            case 1:
                return 0x10000 - ((m1 << 8) | n1);
            case 2:
                return 256 - n1;
            case 3:
                if (i1 === 0)
                    return 256 - n1;
                return 0x10000;
            default: return 0x10000;
        }
    }
    private static handleTimerOverflow(b1: Mcu8051State, c1: number, d1: number, e1: number): void {
        if (c1 === 0) {
            if (d1 === 3) {
                b1.sfr.set(0x88, e1 | 0x20);
                if ((b1.sfr.get(0xA8) ?? 0) & 0x02) {
                    b1.interruptPending = true;
                    b1.interruptSource = 1;
                }
                b1.sfr.set(0x88, (b1.sfr.get(0x88) ?? 0) | 0x80);
                if ((b1.sfr.get(0xA8) ?? 0) & 0x08) {
                    b1.interruptPending = true;
                    b1.interruptSource = 3;
                }
                return;
            }
            if (d1 === 2) {
                const g1 = b1.sfr.get(0x8C) ?? 0;
                b1.sfr.set(0x8A, g1);
            }
            else {
                b1.sfr.set(0x8A, 0);
                b1.sfr.set(0x8C, 0);
            }
            b1.sfr.set(0x88, e1 | 0x20);
            if ((b1.sfr.get(0xA8) ?? 0) & 0x02) {
                b1.interruptPending = true;
                b1.interruptSource = 1;
            }
        }
        else {
            if (d1 === 2) {
                const f1 = b1.sfr.get(0x8D) ?? 0;
                b1.sfr.set(0x8B, f1);
            }
            else {
                b1.sfr.set(0x8B, 0);
                b1.sfr.set(0x8D, 0);
            }
            b1.sfr.set(0x88, e1 | 0x80);
            if ((b1.sfr.get(0xA8) ?? 0) & 0x08) {
                b1.interruptPending = true;
                b1.interruptSource = 3;
            }
        }
    }
    private static uartTxBitCounter: number = 0;
    private static uartRxBitCounter: number = 0;
    private static uartTxShift: number = 0;
    private static uartTxBitIdx: number = 0;
    private static uartTxBusy: boolean = false;
    private static tickUart(o: Mcu8051State): void {
        const p = o.sfr.get(0x98) ?? 0;
        const q = (p >> 7) & 1;
        const r = (p >> 6) & 1;
        const s = q === 0 ? r : 3;
        const t = (p >> 4) & 1;
        const u = (p >> 1) & 1;
        const v = p & 1;
        const w = Mcu8051Engine.getUartBaudDiv(o, s);
        if (w <= 0)
            return;
        if (u === 0 && !Mcu8051Engine.uartTxBusy) {
            const a1 = o.sfr.get(0x99) ?? 0;
            Mcu8051Engine.uartTxShift = a1 & 0xFF;
            Mcu8051Engine.uartTxBitIdx = 0;
            Mcu8051Engine.uartTxBitCounter = 0;
            Mcu8051Engine.uartTxBusy = true;
        }
        if (Mcu8051Engine.uartTxBusy) {
            Mcu8051Engine.uartTxBitCounter++;
            const y = s === 0 ? 8 : 10;
            if (Mcu8051Engine.uartTxBitCounter >= w) {
                Mcu8051Engine.uartTxBitCounter = 0;
                Mcu8051Engine.uartTxBitIdx++;
                if (Mcu8051Engine.uartTxBitIdx >= y) {
                    Mcu8051Engine.uartTxBusy = false;
                    o.sfr.set(0x98, (o.sfr.get(0x98) ?? 0) | 0x02);
                    const z = o.sfr.get(0xA8) ?? 0;
                    if (z & 0x10) {
                        o.interruptPending = true;
                        o.interruptSource = 4;
                    }
                }
            }
        }
        if (t === 1 && o.uartRxBuffer.length > 0) {
            Mcu8051Engine.uartRxBitCounter++;
            if (Mcu8051Engine.uartRxBitCounter >= w * (s === 0 ? 8 : 10)) {
                Mcu8051Engine.uartRxBitCounter = 0;
                const x = o.uartRxBuffer.shift()!;
                o.sfr.set(0x99, x & 0xFF);
                o.sfr.set(0x98, (o.sfr.get(0x98) ?? 0) | 0x01);
                if ((o.sfr.get(0xA8) ?? 0) & 0x10) {
                    o.interruptPending = true;
                    o.interruptSource = 4;
                }
            }
        }
    }
    private static getUartBaudDiv(e: Mcu8051State, f: number): number {
        const g = e.sfr.get(0x87) ?? 0;
        const h = (g >> 7) & 1;
        switch (f) {
            case 0:
                return 1;
            case 1:
            case 3: {
                const i = e.sfr.get(0x8D) ?? 0;
                const j = e.sfr.get(0x89) ?? 0;
                const k = (j >> 4) & 0x03;
                let l: number;
                if (k === 2) {
                    l = 256 - i;
                }
                else {
                    const n = e.sfr.get(0x8B) ?? 0;
                    l = 0x10000 - ((i << 8) | n);
                }
                const m = h ? 16 : 32;
                return Math.max(1, Math.floor(l / m));
            }
            case 2:
                return h ? 2 : 4;
            default: return 12;
        }
    }
    static uartReceive(c: Mcu8051State, d: number): void {
        c.uartRxBuffer.push(d & 0xFF);
    }
    static setPowerMode(a: Mcu8051State, b: Mcu8051PowerMode): void {
        a.powerMode = b;
        if (b === Mcu8051PowerMode.PDOWN) {
            a.timer0Ticks = 0;
            a.timer1Ticks = 0;
        }
    }
}
