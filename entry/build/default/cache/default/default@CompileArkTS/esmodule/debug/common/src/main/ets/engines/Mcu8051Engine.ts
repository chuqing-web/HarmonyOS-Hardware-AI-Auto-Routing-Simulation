import { ErrCode } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/ErrCode";
// 中断向量地址
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
    interruptSource: number; // 当前最高优先级中断源
    lastError: ErrCode;
    powerMode: Mcu8051PowerMode;
}
export class Mcu8051Engine {
    static createState(memorySize: number = 65536): Mcu8051State {
        const state: Mcu8051State = {
            memory: new Uint8Array(memorySize),
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
        Mcu8051Engine.initSfr(state);
        Mcu8051Engine.reset(state);
        return state;
    }
    static initSfr(state: Mcu8051State): void {
        state.sfr.set(0x80, 0xFF);
        state.sfr.set(0x90, 0xFF);
        state.sfr.set(0xA0, 0xFF);
        state.sfr.set(0xB0, 0xFF);
        state.sfr.set(0x88, 0x00);
        state.sfr.set(0x89, 0x00);
        state.sfr.set(0x8A, 0x00);
        state.sfr.set(0x8B, 0x00);
        state.sfr.set(0x8C, 0x00);
        state.sfr.set(0x8D, 0x00);
        state.sfr.set(0x98, 0x00);
        state.sfr.set(0x99, 0x00);
        state.sfr.set(0xA8, 0x00);
        state.sfr.set(0xB8, 0x00);
    }
    static reset(state: Mcu8051State): void {
        state.regs.set('ACC', 0);
        state.regs.set('B', 0);
        state.regs.set('PSW', 0);
        state.regs.set('SP', 0x07);
        state.regs.set('DPL', 0);
        state.regs.set('DPH', 0);
        // 初始化所有 bank 寄存器组 (2.3.12 修复)
        for (let i = 0; i < 8; i++) {
            state.regs.set(`R${i}`, 0);
            for (let bank = 1; bank <= 3; bank++) {
                state.regs.set(`R${bank}${i}`, 0);
            }
        }
        state.pc = 0;
        state.uartTx = '';
        state.uartRxBuffer = [];
        state.timer0Ticks = 0;
        state.timer1Ticks = 0;
        state.interruptPending = false;
        state.interruptSource = 0;
        state.lastError = ErrCode.OK;
        state.powerMode = Mcu8051PowerMode.NORMAL;
        Mcu8051Engine.initSfr(state);
    }
    static step(state: Mcu8051State): boolean {
        // 2.3.15 电源模式检查
        if (state.powerMode === Mcu8051PowerMode.PDOWN)
            return false;
        if (state.powerMode === Mcu8051PowerMode.IDLE) {
            Mcu8051Engine.tickTimers(state);
            Mcu8051Engine.tickUart(state);
            // 任何中断可唤醒 IDLE
            if (state.interruptPending)
                state.powerMode = Mcu8051PowerMode.NORMAL;
            return true;
        }
        // 2.3.13 中断向量调度 — 支持 IP 两级优先级
        if (state.interruptPending) {
            const ie = state.sfr.get(0xA8) ?? 0;
            const ip = state.sfr.get(0xB8) ?? 0;
            // Priority-ordered interrupt sources: (source, ieMask, ipMask, vector)
            const sources: Array<[
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
                [5, 0x20, 0x20, INT_VECTOR_TF2] // Timer 2 — lowest natural priority
            ];
            // Sort by IP first (high priority), then natural order
            let bestVector = 0;
            let bestPriority = -1;
            for (let si = 0; si < sources.length; si++) {
                const src = sources[si][0];
                const ieMask = sources[si][1];
                const ipMask = sources[si][2];
                const vector = sources[si][3];
                if (state.interruptSource === src && (ie & ieMask)) {
                    const prio = (ip & ipMask) ? 1 : 0;
                    if (prio > bestPriority) {
                        bestPriority = prio;
                        bestVector = vector;
                    }
                }
            }
            if (bestVector > 0) {
                Mcu8051Engine.pushReturnAddress(state, state.pc);
                state.pc = bestVector;
                state.interruptPending = false;
                return true;
            }
        }
        const opcode = state.memory[state.pc];
        if (opcode === undefined)
            return false;
        switch (opcode) {
            case 0x00:
                state.pc += 1;
                break;
            case 0x04:
                Mcu8051Engine.incAcc(state);
                state.pc += 1;
                break;
            case 0x05:
                Mcu8051Engine.incDirect(state, state.memory[state.pc + 1]);
                state.pc += 2;
                break;
            case 0x14:
                Mcu8051Engine.decAcc(state);
                state.pc += 1;
                break;
            case 0x24:
                Mcu8051Engine.addAccImm(state, state.memory[state.pc + 1]);
                state.pc += 2;
                break;
            case 0x25:
                Mcu8051Engine.addAccImm(state, Mcu8051Engine.readMem(state, state.memory[state.pc + 1]));
                state.pc += 2;
                break;
            case 0x34:
                Mcu8051Engine.addcAccImm(state, state.memory[state.pc + 1]);
                state.pc += 2;
                break;
            case 0x44:
                Mcu8051Engine.orlAccImm(state, state.memory[state.pc + 1]);
                state.pc += 2;
                break;
            case 0x54:
                Mcu8051Engine.anlAccImm(state, state.memory[state.pc + 1]);
                state.pc += 2;
                break;
            case 0x64:
                Mcu8051Engine.xrlAccImm(state, state.memory[state.pc + 1]);
                state.pc += 2;
                break;
            case 0x74:
                state.regs.set('ACC', state.memory[state.pc + 1]);
                state.pc += 2;
                break;
            case 0x75:
                Mcu8051Engine.writeMem(state, state.memory[state.pc + 1], state.memory[state.pc + 2]);
                state.pc += 3;
                break;
            case 0x85:
                Mcu8051Engine.movDirectDirect(state, state.memory[state.pc + 1], state.memory[state.pc + 2]);
                state.pc += 3;
                break;
            case 0xE5:
                state.regs.set('ACC', Mcu8051Engine.readMem(state, state.memory[state.pc + 1]));
                state.pc += 2;
                break;
            case 0xF5:
                Mcu8051Engine.writeMem(state, state.memory[state.pc + 1], state.regs.get('ACC') ?? 0);
                state.pc += 2;
                break;
            case 0xA3:
                Mcu8051Engine.incDPTR(state);
                state.pc += 1;
                break;
            case 0x03:
                Mcu8051Engine.rrAcc(state);
                state.pc += 1;
                break;
            case 0x13:
                Mcu8051Engine.rrcAcc(state);
                state.pc += 1;
                break;
            case 0x23:
                Mcu8051Engine.rlAcc(state);
                state.pc += 1;
                break;
            case 0x33:
                Mcu8051Engine.rlcAcc(state);
                state.pc += 1;
                break;
            case 0xC4:
                Mcu8051Engine.swapAcc(state);
                state.pc += 1;
                break;
            case 0x94:
                Mcu8051Engine.subbAccImm(state, state.memory[state.pc + 1]);
                state.pc += 2;
                break;
            case 0x95:
                Mcu8051Engine.subbAccImm(state, Mcu8051Engine.readMem(state, state.memory[state.pc + 1]));
                state.pc += 2;
                break;
            case 0xA4:
                Mcu8051Engine.mulAb(state);
                state.pc += 1;
                break;
            case 0x84:
                Mcu8051Engine.divAb(state);
                state.pc += 1;
                break;
            case 0xD4:
                Mcu8051Engine.daA(state);
                state.pc += 1;
                break;
            case 0xC3:
                Mcu8051Engine.setC(state, false);
                state.pc += 1;
                break;
            case 0xD3:
                Mcu8051Engine.setC(state, true);
                state.pc += 1;
                break;
            case 0xB5:
                Mcu8051Engine.cjneDirect(state, state.memory[state.pc + 1], state.memory[state.pc + 2], state.memory[state.pc + 3]);
                break;
            // DJNZ direct,rel = 0xD5 (3 bytes). DJNZ Rn,rel = 0xD8..0xDF (2 bytes) → dispatchFamily
            case 0xD5:
                Mcu8051Engine.djnzDirect(state, state.memory[state.pc + 1], state.memory[state.pc + 2]);
                break;
            case 0xC0:
                Mcu8051Engine.pushDirect(state, state.memory[state.pc + 1]);
                state.pc += 2;
                break;
            case 0xD0:
                Mcu8051Engine.popDirect(state, state.memory[state.pc + 1]);
                state.pc += 2;
                break;
            case 0x83:
                Mcu8051Engine.movcAccDptr(state);
                state.pc += 1;
                break;
            case 0x93:
                Mcu8051Engine.movcAccPc(state);
                state.pc += 1;
                break;
            case 0xE0:
                Mcu8051Engine.movxAccDptr(state);
                state.pc += 1;
                break;
            case 0xF0:
                Mcu8051Engine.movxDptrAcc(state);
                state.pc += 1;
                break;
            case 0xC5:
                Mcu8051Engine.xchDirect(state, state.memory[state.pc + 1]);
                state.pc += 2;
                break;
            case 0x80:
                Mcu8051Engine.sjmp(state, state.memory[state.pc + 1]);
                break;
            case 0x70:
                Mcu8051Engine.jnz(state, state.memory[state.pc + 1]);
                break;
            case 0x60:
                Mcu8051Engine.jz(state, state.memory[state.pc + 1]);
                break;
            case 0x40:
                Mcu8051Engine.jc(state, state.memory[state.pc + 1]);
                break;
            case 0x50:
                Mcu8051Engine.jnc(state, state.memory[state.pc + 1]);
                break;
            case 0x20:
                Mcu8051Engine.jb(state, state.memory[state.pc + 1], state.memory[state.pc + 2]);
                break;
            case 0x30:
                Mcu8051Engine.jnb(state, state.memory[state.pc + 1], state.memory[state.pc + 2]);
                break;
            case 0x10:
                Mcu8051Engine.jbc(state, state.memory[state.pc + 1], state.memory[state.pc + 2]);
                break;
            case 0x02:
                Mcu8051Engine.ljmp(state, state.memory[state.pc + 1], state.memory[state.pc + 2]);
                break;
            case 0x12:
                Mcu8051Engine.lcall(state, state.memory[state.pc + 1], state.memory[state.pc + 2]);
                break;
            case 0x22:
                state.pc = Mcu8051Engine.popReturnAddress(state);
                break;
            case 0x32:
                state.pc = Mcu8051Engine.popReturnAddress(state);
                Mcu8051Engine.clearInterrupt(state);
                break;
            default:
                if (Mcu8051Engine.dispatchFamily(state, opcode))
                    break;
                state.lastError = ErrCode.ERR_MCU_INVALID_OPCODE;
                state.pc += 1;
        }
        // Do NOT force pc+=1 when pc===prevPc: DJNZ Rn,$ / SJMP $ are valid self-loops
        // used by delay routines (lab_51_led: D9 FE). Advancing would collapse the delay
        // and make Port1 chase skip bits / stutter on the UI thread.
        Mcu8051Engine.tickTimers(state);
        Mcu8051Engine.tickUart(state);
        state.regs.set('PC', state.pc);
        return state.lastError === ErrCode.OK;
    }
    private static dispatchFamily(state: Mcu8051State, opcode: number): boolean {
        if ((opcode & 0xE1) === 0x01) {
            Mcu8051Engine.ajmp(state, (opcode >> 5) & 0x07, state.memory[state.pc + 1]);
            return true;
        }
        if ((opcode & 0xE1) === 0x11) {
            Mcu8051Engine.acall(state, (opcode >> 5) & 0x07, state.memory[state.pc + 1]);
            state.pc += 2;
            return true;
        }
        if (opcode >= 0x08 && opcode <= 0x0F) {
            Mcu8051Engine.incReg(state, opcode - 0x08);
            state.pc += 1;
            return true;
        }
        if (opcode >= 0x18 && opcode <= 0x1F) {
            Mcu8051Engine.decReg(state, opcode - 0x18);
            state.pc += 1;
            return true;
        }
        if (opcode >= 0xE8 && opcode <= 0xEF) {
            Mcu8051Engine.movAccReg(state, opcode - 0xE8);
            state.pc += 1;
            return true;
        }
        if (opcode >= 0xF8 && opcode <= 0xFF) {
            Mcu8051Engine.movRegAcc(state, opcode - 0xF8);
            state.pc += 1;
            return true;
        }
        if (opcode >= 0xE6 && opcode <= 0xE7) {
            state.regs.set('ACC', Mcu8051Engine.readMem(state, Mcu8051Engine.getRiAddr(state, opcode - 0xE6)));
            state.pc += 1;
            return true;
        }
        if (opcode >= 0xF6 && opcode <= 0xF7) {
            Mcu8051Engine.writeMem(state, Mcu8051Engine.getRiAddr(state, opcode - 0xF6), state.regs.get('ACC') ?? 0);
            state.pc += 1;
            return true;
        }
        if (opcode >= 0x76 && opcode <= 0x77) {
            Mcu8051Engine.writeMem(state, Mcu8051Engine.getRiAddr(state, opcode - 0x76), state.memory[state.pc + 1]);
            state.pc += 2;
            return true;
        }
        if (opcode >= 0xB8 && opcode <= 0xBF) {
            Mcu8051Engine.cjneReg(state, opcode - 0xB8, state.memory[state.pc + 1], state.memory[state.pc + 2]);
            return true;
        }
        if (opcode >= 0xD8 && opcode <= 0xDF) {
            Mcu8051Engine.djnzReg(state, opcode - 0xD8, state.memory[state.pc + 1]);
            return true;
        }
        if (opcode === 0xC2) {
            Mcu8051Engine.clrBit(state, state.memory[state.pc + 1]);
            state.pc += 2;
            return true;
        }
        if (opcode === 0xD2) {
            Mcu8051Engine.setBit(state, state.memory[state.pc + 1]);
            state.pc += 2;
            return true;
        }
        if (opcode === 0xB2) {
            Mcu8051Engine.cplBit(state, state.memory[state.pc + 1]);
            state.pc += 2;
            return true;
        }
        if (opcode === 0x92) {
            Mcu8051Engine.setCBit(state, state.memory[state.pc + 1]);
            state.pc += 2;
            return true;
        }
        if (opcode === 0x82) {
            Mcu8051Engine.clrCBit(state, state.memory[state.pc + 1]);
            state.pc += 2;
            return true;
        }
        if (opcode === 0xB3) {
            Mcu8051Engine.cplCBit(state, state.memory[state.pc + 1]);
            state.pc += 2;
            return true;
        }
        return false;
    }
    private static getRiAddr(state: Mcu8051State, ri: number): number {
        const r = Mcu8051Engine.getReg(state, ri);
        return r;
    }
    private static getReg(state: Mcu8051State, idx: number): number {
        const bank = ((state.regs.get('PSW') ?? 0) >> 3) & 0x03;
        // 2.3.12 修复: 使用统一键名 R0-R7 (bank 0) 和 R10-R17 (bank 1), R20-R27 (bank 2), R30-R37 (bank 3)
        if (bank === 0)
            return state.regs.get(`R${idx}`) ?? 0;
        return state.regs.get(`R${bank}${idx}`) ?? 0;
    }
    private static setReg(state: Mcu8051State, idx: number, val: number): void {
        const bank = ((state.regs.get('PSW') ?? 0) >> 3) & 0x03;
        if (bank === 0) {
            state.regs.set(`R${idx}`, val & 0xFF);
        }
        else {
            state.regs.set(`R${bank}${idx}`, val & 0xFF);
        }
    }
    static readMem(state: Mcu8051State, addr: number): number {
        if (addr >= 0x80 && addr <= 0xFF)
            return state.sfr.get(addr) ?? 0;
        return state.memory[addr] ?? 0;
    }
    static writeMem(state: Mcu8051State, addr: number, val: number): void {
        if (addr >= 0x80 && addr <= 0xFF) {
            state.sfr.set(addr, val & 0xFF);
            if (addr === 0x99)
                state.uartTx += String.fromCharCode(val & 0xFF);
            return;
        }
        state.memory[addr] = val & 0xFF;
    }
    private static incAcc(s: Mcu8051State): void { s.regs.set('ACC', ((s.regs.get('ACC') ?? 0) + 1) & 0xFF); }
    private static decAcc(s: Mcu8051State): void { s.regs.set('ACC', ((s.regs.get('ACC') ?? 0) - 1) & 0xFF); }
    private static incDirect(s: Mcu8051State, a: number): void { Mcu8051Engine.writeMem(s, a, (Mcu8051Engine.readMem(s, a) + 1) & 0xFF); }
    private static addAccImm(s: Mcu8051State, v: number): void { s.regs.set('ACC', ((s.regs.get('ACC') ?? 0) + v) & 0xFF); }
    private static addcAccImm(s: Mcu8051State, v: number): void {
        const c = Mcu8051Engine.getC(s) ? 1 : 0;
        const sum = (s.regs.get('ACC') ?? 0) + v + c;
        Mcu8051Engine.setC(s, sum > 255);
        s.regs.set('ACC', sum & 0xFF);
    }
    private static orlAccImm(s: Mcu8051State, v: number): void { s.regs.set('ACC', (s.regs.get('ACC') ?? 0) | v); }
    private static anlAccImm(s: Mcu8051State, v: number): void { s.regs.set('ACC', (s.regs.get('ACC') ?? 0) & v); }
    private static xrlAccImm(s: Mcu8051State, v: number): void { s.regs.set('ACC', (s.regs.get('ACC') ?? 0) ^ v); }
    private static subbAccImm(s: Mcu8051State, v: number): void {
        const c = Mcu8051Engine.getC(s) ? 1 : 0;
        const acc = (s.regs.get('ACC') ?? 0) - v - c;
        Mcu8051Engine.setC(s, acc < 0);
        s.regs.set('ACC', acc & 0xFF);
    }
    private static mulAb(s: Mcu8051State): void {
        const prod = (s.regs.get('ACC') ?? 0) * (s.regs.get('B') ?? 0);
        s.regs.set('ACC', prod & 0xFF);
        s.regs.set('B', (prod >> 8) & 0xFF);
        Mcu8051Engine.setC(s, false);
    }
    private static divAb(s: Mcu8051State): void {
        const a = s.regs.get('ACC') ?? 0;
        const b = s.regs.get('B') ?? 1;
        if (b === 0) {
            s.lastError = ErrCode.ERR_MCU_INVALID_OPCODE;
            return;
        }
        s.regs.set('ACC', Math.floor(a / b) & 0xFF);
        s.regs.set('B', (a % b) & 0xFF);
    }
    private static daA(s: Mcu8051State): void {
        let acc = s.regs.get('ACC') ?? 0;
        if ((acc & 0x0F) > 9 || Mcu8051Engine.getC(s))
            acc += 6;
        if (acc > 0x9F || Mcu8051Engine.getAC(s)) {
            acc += 0x60;
            Mcu8051Engine.setC(s, true);
        }
        s.regs.set('ACC', acc & 0xFF);
    }
    private static swapAcc(s: Mcu8051State): void {
        const a = s.regs.get('ACC') ?? 0;
        s.regs.set('ACC', ((a & 0x0F) << 4) | ((a >> 4) & 0x0F));
    }
    private static rrAcc(s: Mcu8051State): void {
        const a = s.regs.get('ACC') ?? 0;
        s.regs.set('ACC', ((a >> 1) | ((a & 1) << 7)) & 0xFF);
    }
    private static rrcAcc(s: Mcu8051State): void {
        const a = s.regs.get('ACC') ?? 0;
        const newC = (a & 1) !== 0;
        s.regs.set('ACC', ((a >> 1) | (Mcu8051Engine.getC(s) ? 0x80 : 0)) & 0xFF);
        Mcu8051Engine.setC(s, newC);
    }
    /** RL A: rotate ACC left through bit7→bit0 (not a plain shift) */
    private static rlAcc(s: Mcu8051State): void {
        const a = s.regs.get('ACC') ?? 0;
        s.regs.set('ACC', ((a << 1) | (a >> 7)) & 0xFF);
    }
    private static rlcAcc(s: Mcu8051State): void {
        const a = s.regs.get('ACC') ?? 0;
        const newC = (a & 0x80) !== 0;
        s.regs.set('ACC', (((a << 1) & 0xFF) | (Mcu8051Engine.getC(s) ? 1 : 0)) & 0xFF);
        Mcu8051Engine.setC(s, newC);
    }
    private static incReg(s: Mcu8051State, r: number): void { Mcu8051Engine.setReg(s, r, Mcu8051Engine.getReg(s, r) + 1); }
    private static decReg(s: Mcu8051State, r: number): void { Mcu8051Engine.setReg(s, r, Mcu8051Engine.getReg(s, r) - 1); }
    private static movAccReg(s: Mcu8051State, r: number): void { s.regs.set('ACC', Mcu8051Engine.getReg(s, r)); }
    private static movRegAcc(s: Mcu8051State, r: number): void { Mcu8051Engine.setReg(s, r, s.regs.get('ACC') ?? 0); }
    private static cjneDirect(s: Mcu8051State, a: number, imm: number, rel: number): void {
        if (Mcu8051Engine.readMem(s, a) !== imm)
            Mcu8051Engine.sjmp(s, rel);
        else
            s.pc += 3;
    }
    private static cjneReg(s: Mcu8051State, r: number, imm: number, rel: number): void {
        if (Mcu8051Engine.getReg(s, r) !== imm)
            Mcu8051Engine.sjmp(s, rel);
        else
            s.pc += 3;
    }
    private static djnzDirect(s: Mcu8051State, a: number, rel: number): void {
        // DJNZ direct,rel is 3 bytes — relative offset from next instruction after all 3 bytes
        const v = (Mcu8051Engine.readMem(s, a) - 1) & 0xFF;
        Mcu8051Engine.writeMem(s, a, v);
        if (v !== 0) {
            s.pc += 3 + (rel > 127 ? rel - 256 : rel);
        }
        else {
            s.pc += 3;
        }
    }
    private static djnzReg(s: Mcu8051State, r: number, rel: number): void {
        const v = (Mcu8051Engine.getReg(s, r) - 1) & 0xFF;
        Mcu8051Engine.setReg(s, r, v);
        if (v !== 0)
            Mcu8051Engine.sjmp(s, rel);
        else
            s.pc += 2;
    }
    private static ajmp(s: Mcu8051State, page: number, addrByte: number): void {
        s.pc = ((s.pc + 2) & 0xF800) | (page << 8) | addrByte;
    }
    private static acall(s: Mcu8051State, page: number, addrByte: number): void {
        Mcu8051Engine.pushReturnAddress(s, s.pc + 2);
        s.pc = ((s.pc + 2) & 0xF800) | (page << 8) | addrByte;
    }
    private static movDirectDirect(s: Mcu8051State, d1: number, d2: number): void {
        Mcu8051Engine.writeMem(s, d1, Mcu8051Engine.readMem(s, d2));
    }
    private static xchDirect(s: Mcu8051State, a: number): void {
        const acc = s.regs.get('ACC') ?? 0;
        const v = Mcu8051Engine.readMem(s, a);
        s.regs.set('ACC', v);
        Mcu8051Engine.writeMem(s, a, acc);
    }
    private static incDPTR(s: Mcu8051State): void {
        let ptr = ((s.regs.get('DPH') ?? 0) << 8) | (s.regs.get('DPL') ?? 0);
        ptr = (ptr + 1) & 0xFFFF;
        s.regs.set('DPL', ptr & 0xFF);
        s.regs.set('DPH', (ptr >> 8) & 0xFF);
    }
    private static movcAccDptr(s: Mcu8051State): void {
        const ptr = ((s.regs.get('DPH') ?? 0) << 8) | (s.regs.get('DPL') ?? 0);
        const idx = ((s.regs.get('ACC') ?? 0) + ptr) & 0xFFFF;
        s.regs.set('ACC', s.memory[idx] ?? 0);
    }
    private static movcAccPc(s: Mcu8051State): void {
        const idx = ((s.regs.get('ACC') ?? 0) + s.pc + 1) & 0xFFFF;
        s.regs.set('ACC', s.memory[idx] ?? 0);
    }
    private static movxAccDptr(s: Mcu8051State): void {
        const ptr = ((s.regs.get('DPH') ?? 0) << 8) | (s.regs.get('DPL') ?? 0);
        s.regs.set('ACC', Mcu8051Engine.readMem(s, ptr));
    }
    private static movxDptrAcc(s: Mcu8051State): void {
        const ptr = ((s.regs.get('DPH') ?? 0) << 8) | (s.regs.get('DPL') ?? 0);
        Mcu8051Engine.writeMem(s, ptr, s.regs.get('ACC') ?? 0);
    }
    private static pushDirect(s: Mcu8051State, a: number): void {
        let sp = s.regs.get('SP') ?? 0x07;
        sp += 1;
        s.memory[sp] = Mcu8051Engine.readMem(s, a);
        s.regs.set('SP', sp);
    }
    private static popDirect(s: Mcu8051State, a: number): void {
        let sp = s.regs.get('SP') ?? 0x07;
        Mcu8051Engine.writeMem(s, a, s.memory[sp]);
        sp -= 1;
        s.regs.set('SP', sp);
    }
    private static getC(s: Mcu8051State): boolean { return ((s.regs.get('PSW') ?? 0) & 0x80) !== 0; }
    private static getAC(s: Mcu8051State): boolean { return ((s.regs.get('PSW') ?? 0) & 0x40) !== 0; }
    private static setC(s: Mcu8051State, v: boolean): void {
        let psw = s.regs.get('PSW') ?? 0;
        psw = v ? (psw | 0x80) : (psw & 0x7F);
        s.regs.set('PSW', psw);
    }
    /** Compute byte address and bit mask from 8051 bit address (covers 0x00-0xFF) */
    private static resolveBitAddr(bitAddr: number): [
        number,
        number
    ] {
        if (bitAddr < 0x80) {
            return [0x20 + (bitAddr >> 3), bitAddr & 7];
        }
        return [bitAddr & 0xF8, bitAddr & 7];
    }
    private static setBit(s: Mcu8051State, bitAddr: number): void {
        const resolved = Mcu8051Engine.resolveBitAddr(bitAddr);
        const byteAddr = resolved[0];
        const bit = resolved[1];
        Mcu8051Engine.writeMem(s, byteAddr, Mcu8051Engine.readMem(s, byteAddr) | (1 << bit));
    }
    private static clrBit(s: Mcu8051State, bitAddr: number): void {
        const resolved = Mcu8051Engine.resolveBitAddr(bitAddr);
        const byteAddr = resolved[0];
        const bit = resolved[1];
        Mcu8051Engine.writeMem(s, byteAddr, Mcu8051Engine.readMem(s, byteAddr) & ~(1 << bit));
    }
    private static cplBit(s: Mcu8051State, bitAddr: number): void {
        const resolved = Mcu8051Engine.resolveBitAddr(bitAddr);
        const byteAddr = resolved[0];
        const bit = resolved[1];
        Mcu8051Engine.writeMem(s, byteAddr, Mcu8051Engine.readMem(s, byteAddr) ^ (1 << bit));
    }
    /** Read a bit from bit-addressable space */
    private static readBit(s: Mcu8051State, bitAddr: number): boolean {
        const resolved = Mcu8051Engine.resolveBitAddr(bitAddr);
        const byteAddr = resolved[0];
        const bit = resolved[1];
        return ((Mcu8051Engine.readMem(s, byteAddr) >> bit) & 1) !== 0;
    }
    private static setCBit(s: Mcu8051State, bit: number): void { Mcu8051Engine.setBit(s, bit); }
    private static clrCBit(s: Mcu8051State, bit: number): void { Mcu8051Engine.clrBit(s, bit); }
    private static cplCBit(s: Mcu8051State, bit: number): void { Mcu8051Engine.cplBit(s, bit); }
    private static sjmp(s: Mcu8051State, rel: number): void { s.pc += 2 + (rel > 127 ? rel - 256 : rel); }
    private static jnz(s: Mcu8051State, rel: number): void { if ((s.regs.get('ACC') ?? 0) !== 0)
        Mcu8051Engine.sjmp(s, rel);
    else
        s.pc += 2; }
    private static jz(s: Mcu8051State, rel: number): void { if ((s.regs.get('ACC') ?? 0) === 0)
        Mcu8051Engine.sjmp(s, rel);
    else
        s.pc += 2; }
    private static jc(s: Mcu8051State, rel: number): void { if (Mcu8051Engine.getC(s))
        Mcu8051Engine.sjmp(s, rel);
    else
        s.pc += 2; }
    private static jnc(s: Mcu8051State, rel: number): void { if (!Mcu8051Engine.getC(s))
        Mcu8051Engine.sjmp(s, rel);
    else
        s.pc += 2; }
    private static jb(s: Mcu8051State, bit: number, rel: number): void {
        if (Mcu8051Engine.readBit(s, bit))
            Mcu8051Engine.sjmp(s, rel);
        else
            s.pc += 3;
    }
    private static jnb(s: Mcu8051State, bit: number, rel: number): void {
        if (!Mcu8051Engine.readBit(s, bit))
            Mcu8051Engine.sjmp(s, rel);
        else
            s.pc += 3;
    }
    private static jbc(s: Mcu8051State, bit: number, rel: number): void {
        if (Mcu8051Engine.readBit(s, bit)) {
            Mcu8051Engine.clrBit(s, bit);
            Mcu8051Engine.sjmp(s, rel);
        }
        else
            s.pc += 3;
    }
    private static ljmp(s: Mcu8051State, hi: number, lo: number): void { s.pc = (hi << 8) | lo; }
    private static lcall(s: Mcu8051State, hi: number, lo: number): void {
        Mcu8051Engine.pushReturnAddress(s, s.pc + 3);
        s.pc = (hi << 8) | lo;
    }
    private static pushReturnAddress(s: Mcu8051State, addr: number): void {
        let sp = s.regs.get('SP') ?? 0x07;
        sp += 1;
        s.memory[sp] = addr & 0xFF;
        sp += 1;
        s.memory[sp] = (addr >> 8) & 0xFF;
        s.regs.set('SP', sp);
    }
    private static popReturnAddress(s: Mcu8051State): number {
        let sp = s.regs.get('SP') ?? 0x07;
        const hi = s.memory[sp];
        sp -= 1;
        const lo = s.memory[sp];
        sp -= 1;
        s.regs.set('SP', sp);
        return ((hi & 0xFF) << 8) | (lo & 0xFF);
    }
    private static clearInterrupt(s: Mcu8051State): void { s.interruptPending = false; }
    private static tickTimers(s: Mcu8051State): void {
        const tcon = s.sfr.get(0x88) ?? 0;
        const tmod = s.sfr.get(0x89) ?? 0;
        // Timer 0 — check TR0 (TCON.4)
        if (tcon & 0x10) {
            s.timer0Ticks++;
            const mode0 = tmod & 0x03;
            let period0 = Mcu8051Engine.getTimerPeriod(s, 0, mode0);
            if (s.timer0Ticks >= period0) {
                s.timer0Ticks = 0;
                Mcu8051Engine.handleTimerOverflow(s, 0, mode0, tcon);
            }
        }
        // Timer 1 — check TR1 (TCON.6)
        if (tcon & 0x40) {
            s.timer1Ticks++;
            const mode1 = (tmod >> 4) & 0x03;
            let period1 = Mcu8051Engine.getTimerPeriod(s, 1, mode1);
            if (s.timer1Ticks >= period1) {
                s.timer1Ticks = 0;
                Mcu8051Engine.handleTimerOverflow(s, 1, mode1, tcon);
            }
        }
    }
    private static getTimerPeriod(s: Mcu8051State, timerNum: number, mode: number): number {
        const thAddr = timerNum === 0 ? 0x8C : 0x8D;
        const tlAddr = timerNum === 0 ? 0x8A : 0x8B;
        const th = s.sfr.get(thAddr) ?? 0;
        const tl = s.sfr.get(tlAddr) ?? 0;
        switch (mode) {
            case 0: // 13-bit timer (TH[7:0] + TL[4:0])
                return 0x2000 - (((th << 5) | (tl & 0x1F)) & 0x1FFF);
            case 1: // 16-bit timer
                return 0x10000 - ((th << 8) | tl);
            case 2: // 8-bit auto-reload (TL counts, TH is reload value)
                return 256 - tl;
            case 3: // Split timer (Timer 0 only)
                if (timerNum === 0)
                    return 256 - tl; // TL0 as 8-bit
                return 0x10000; // Timer 1 in mode 3 just runs free
            default: return 0x10000;
        }
    }
    private static handleTimerOverflow(s: Mcu8051State, timerNum: number, mode: number, tcon: number): void {
        if (timerNum === 0) {
            if (mode === 3) {
                // TL0 overflow → TF0
                s.sfr.set(0x88, tcon | 0x20);
                if ((s.sfr.get(0xA8) ?? 0) & 0x02) {
                    s.interruptPending = true;
                    s.interruptSource = 1;
                }
                // TH0 overflow → TF1 (in mode 3)
                s.sfr.set(0x88, (s.sfr.get(0x88) ?? 0) | 0x80);
                if ((s.sfr.get(0xA8) ?? 0) & 0x08) {
                    s.interruptPending = true;
                    s.interruptSource = 3;
                }
                return;
            }
            // Mode 0,1,2: reload
            if (mode === 2) {
                const th0 = s.sfr.get(0x8C) ?? 0;
                s.sfr.set(0x8A, th0);
            }
            else {
                s.sfr.set(0x8A, 0);
                s.sfr.set(0x8C, 0);
            }
            s.sfr.set(0x88, tcon | 0x20); // TF0=1
            if ((s.sfr.get(0xA8) ?? 0) & 0x02) {
                s.interruptPending = true;
                s.interruptSource = 1;
            }
        }
        else {
            // Timer 1 overflow
            if (mode === 2) {
                const th1 = s.sfr.get(0x8D) ?? 0;
                s.sfr.set(0x8B, th1);
            }
            else {
                s.sfr.set(0x8B, 0);
                s.sfr.set(0x8D, 0);
            }
            s.sfr.set(0x88, tcon | 0x80); // TF1=1
            if ((s.sfr.get(0xA8) ?? 0) & 0x08) {
                s.interruptPending = true;
                s.interruptSource = 3;
            }
        }
    }
    // UART baud rate tracking (counts instructions until next bit)
    private static uartTxBitCounter: number = 0;
    private static uartRxBitCounter: number = 0;
    private static uartTxShift: number = 0;
    private static uartTxBitIdx: number = 0;
    private static uartTxBusy: boolean = false;
    // 2.3.14 串口模式支持 — 支持全部4种模式、真实波特率
    private static tickUart(s: Mcu8051State): void {
        const scon = s.sfr.get(0x98) ?? 0;
        const sm0 = (scon >> 7) & 1;
        const sm1 = (scon >> 6) & 1;
        const serialMode = sm0 === 0 ? sm1 : 3; // 0=Mode0, 1=Mode1, 2=Mode2, 3=Mode3
        const ren = (scon >> 4) & 1;
        const ti = (scon >> 1) & 1;
        const ri = scon & 1;
        const baudDiv = Mcu8051Engine.getUartBaudDiv(s, serialMode);
        if (baudDiv <= 0)
            return;
        // Transmit: when SBUF is written (detected by TI=0 and tx not busy), start shifting
        if (ti === 0 && !Mcu8051Engine.uartTxBusy) {
            const sbuf = s.sfr.get(0x99) ?? 0;
            Mcu8051Engine.uartTxShift = sbuf & 0xFF;
            Mcu8051Engine.uartTxBitIdx = 0;
            Mcu8051Engine.uartTxBitCounter = 0;
            Mcu8051Engine.uartTxBusy = true;
        }
        // Bit-level transmit timing
        if (Mcu8051Engine.uartTxBusy) {
            Mcu8051Engine.uartTxBitCounter++;
            const bitsPerFrame = serialMode === 0 ? 8 : 10; // Mode 0: 8 data bits, no start/stop
            if (Mcu8051Engine.uartTxBitCounter >= baudDiv) {
                Mcu8051Engine.uartTxBitCounter = 0;
                Mcu8051Engine.uartTxBitIdx++;
                if (Mcu8051Engine.uartTxBitIdx >= bitsPerFrame) {
                    // Frame complete
                    Mcu8051Engine.uartTxBusy = false;
                    s.sfr.set(0x98, (s.sfr.get(0x98) ?? 0) | 0x02); // TI=1
                    const ie = s.sfr.get(0xA8) ?? 0;
                    if (ie & 0x10) {
                        s.interruptPending = true;
                        s.interruptSource = 4;
                    }
                }
            }
        }
        // Receive: check buffer every baud period
        if (ren === 1 && s.uartRxBuffer.length > 0) {
            Mcu8051Engine.uartRxBitCounter++;
            if (Mcu8051Engine.uartRxBitCounter >= baudDiv * (serialMode === 0 ? 8 : 10)) {
                Mcu8051Engine.uartRxBitCounter = 0;
                const rxData = s.uartRxBuffer.shift()!;
                s.sfr.set(0x99, rxData & 0xFF);
                s.sfr.set(0x98, (s.sfr.get(0x98) ?? 0) | 0x01); // RI=1
                if ((s.sfr.get(0xA8) ?? 0) & 0x10) {
                    s.interruptPending = true;
                    s.interruptSource = 4;
                }
            }
        }
    }
    /** Calculate UART baud rate divisor (in instruction cycles per bit) */
    private static getUartBaudDiv(s: Mcu8051State, mode: number): number {
        const pcon = s.sfr.get(0x87) ?? 0;
        const smod = (pcon >> 7) & 1; // SMOD (PCON.7)
        switch (mode) {
            case 0: // f_osc / 12 per bit (fixed ~1 Mbps at 12 MHz)
                return 1;
            case 1: // Timer 1 overflow / 16 or / 32
            case 3: {
                const th1 = s.sfr.get(0x8D) ?? 0;
                const tmod = s.sfr.get(0x89) ?? 0;
                const t1mode = (tmod >> 4) & 0x03;
                let t1Period: number;
                if (t1mode === 2) {
                    t1Period = 256 - th1;
                }
                else {
                    const tl1 = s.sfr.get(0x8B) ?? 0;
                    t1Period = 0x10000 - ((th1 << 8) | tl1);
                }
                const divisor = smod ? 16 : 32;
                return Math.max(1, Math.floor(t1Period / divisor));
            }
            case 2: // f_osc / 32 or / 64
                return smod ? 2 : 4;
            default: return 12;
        }
    }
    /** 2.3.14 串口接收数据入队 */
    static uartReceive(state: Mcu8051State, data: number): void {
        state.uartRxBuffer.push(data & 0xFF);
    }
    /** 2.3.15 设置电源模式 */
    static setPowerMode(state: Mcu8051State, mode: Mcu8051PowerMode): void {
        state.powerMode = mode;
        if (mode === Mcu8051PowerMode.PDOWN) {
            // 停止全部时钟和外围
            state.timer0Ticks = 0;
            state.timer1Ticks = 0;
        }
    }
}
