import { copyNumberMap, ErrCode } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
interface InstructionRecord {
    pc: number;
    mnemonic: string;
}
const APSR = 0;
const IAPSR = 1;
const EAPSR = 2;
const XPSR = 3;
const IPSR = 5;
const EPSR = 6;
const IEPSR = 7;
const MSP = 8;
const PSP = 9;
const PRIMASK = 16;
const CONTROL = 20;
const NVIC_ISER0 = 0xE000E100;
const NVIC_ICER0 = 0xE000E180;
const NVIC_ISPR0 = 0xE000E200;
const NVIC_ICPR0 = 0xE000E280;
const NVIC_IABR0 = 0xE000E300;
const NVIC_IPR0 = 0xE000E400;
const SYSTICK_BASE = 0xE000E010;
const SCB_BASE = 0xE000ED00;
const SCB_ICSR = SCB_BASE + 0x04;
const SCB_VTOR = SCB_BASE + 0x08;
const SCB_AIRCR = SCB_BASE + 0x0C;
const SCB_SHCSR = SCB_BASE + 0x24;
const SCB_CFSR = SCB_BASE + 0x28;
const SCB_HFSR = SCB_BASE + 0x2C;
const SCB_MMFAR = SCB_BASE + 0x34;
const SCB_BFAR = SCB_BASE + 0x38;
export class CortexM3Core {
    private memory: Uint8Array;
    private regs: Map<string, number> = new Map();
    private pc: number = 0;
    private sp: number = 0x20005000;
    private lr: number = 0xFFFFFFFF;
    private lastError: ErrCode = ErrCode.OK;
    private callStack: number[] = [];
    private specialRegs: Map<number, number> = new Map();
    private nvicIser: Uint32Array = new Uint32Array(8);
    private nvicIcer: Uint32Array = new Uint32Array(8);
    private nvicIspr: Uint32Array = new Uint32Array(8);
    private nvicIabr: Uint32Array = new Uint32Array(8);
    private nvicIpr: Uint8Array = new Uint8Array(240);
    private nvicPriorityGroup: number = 0;
    private exceptionActive: number[] = [];
    private systickCtrl: number = 0;
    private systickLoad: number = 0;
    private systickVal: number = 0;
    private systickCalib: number = 9000;
    private gpioRegs: Map<number, number> = new Map();
    private instructionHistory: InstructionRecord[] = [];
    private maxHistory: number = 1000;
    constructor(q374: number = 262144) {
        this.memory = new Uint8Array(q374);
        this.reset();
    }
    loadProgram(n374: Uint8Array, o374: number = 0): void {
        for (let p374 = 0; p374 < n374.length; p374++) {
            if (o374 + p374 < this.memory.length)
                this.memory[o374 + p374] = n374[p374];
        }
    }
    reset(): void {
        for (let m374 = 0; m374 < 16; m374++)
            this.regs.set(`R${m374}`, 0);
        this.pc = 0x08000000;
        this.sp = 0x20005000;
        this.lr = 0xFFFFFFFF;
        this.callStack = [];
        this.lastError = ErrCode.OK;
        this.instructionHistory = [];
        this.specialRegs.clear();
        this.nvicIser.fill(0);
        this.nvicIcer.fill(0);
        this.nvicIspr.fill(0);
        this.nvicIabr.fill(0);
        this.nvicIpr.fill(0);
        this.exceptionActive = [];
        this.systickCtrl = 0;
        this.systickLoad = 0;
        this.systickVal = 0;
        this.gpioRegs.clear();
        this.regs.set('R13', this.sp);
        this.regs.set('R14', this.lr);
        this.regs.set('R15', this.pc);
        this.specialRegs.set(CONTROL, 0);
        this.specialRegs.set(PRIMASK, 0);
    }
    step(): boolean {
        const h374 = this.pc - 0x08000000;
        if (h374 < 0 || h374 + 1 >= this.memory.length) {
            this.lastError = ErrCode.ERR_MCU_INVALID_OPCODE;
            return false;
        }
        const i374 = this.memory[h374] | (this.memory[h374 + 1] << 8);
        const j374 = this.pc;
        const k374 = (i374 >> 11) & 0x1F;
        if (k374 === 0x00) {
            this.shiftImm(i374);
        }
        else if (k374 === 0x01 || k374 === 0x02 || k374 === 0x03) {
            this.aluReg(i374);
        }
        else if ((i374 & 0xFC00) === 0x4000) {
            this.andsImm5(i374);
        }
        else if ((i374 & 0xFFC0) === 0x4080) {
            this.lslsImm5(i374);
        }
        else if ((i374 & 0xFFC0) === 0x40C0) {
            this.lsrsImm5(i374);
        }
        else if ((i374 & 0xFFC0) === 0x4100) {
            this.asrsImm5(i374);
        }
        else if ((i374 & 0xFE00) === 0x4200) {
            this.subReg(i374);
        }
        else if ((i374 & 0xFFC0) === 0x4340) {
            this.mulReg(i374);
        }
        else if ((i374 & 0xFF00) === 0x4200) {
            this.subReg(i374);
        }
        else if ((i374 & 0xF800) === 0x4000) {
            this.andReg(i374);
        }
        else if ((i374 & 0xF800) === 0x4300) {
            this.orrReg(i374);
        }
        else if ((i374 & 0xF800) === 0x4040) {
            this.eorReg(i374);
        }
        else if ((i374 & 0xF800) === 0x1800) {
            this.addSubReg(i374);
        }
        else if ((i374 & 0xFE00) === 0x1C00) {
            this.addImm3(i374);
        }
        else if ((i374 & 0xFE00) === 0x1E00) {
            this.subImm3(i374);
        }
        else if ((i374 & 0xF800) === 0x2000) {
            this.movImm(i374);
        }
        else if ((i374 & 0xF800) === 0x2800) {
            this.cmpImm(i374);
        }
        else if ((i374 & 0xF800) === 0x3000) {
            this.addImm8(i374);
        }
        else if ((i374 & 0xF800) === 0x3800) {
            this.subImm8(i374);
        }
        else if ((i374 & 0xF800) === 0x4800) {
            this.ldrLit(i374);
        }
        else if ((i374 & 0xF200) === 0x5000) {
            this.ldrStrReg(i374);
        }
        else if ((i374 & 0xF000) === 0x5000) {
            this.ldrStrBytReg(i374);
        }
        else if ((i374 & 0xF800) === 0x6000) {
            this.strImm(i374);
        }
        else if ((i374 & 0xF800) === 0x6800) {
            this.ldrImm(i374);
        }
        else if ((i374 & 0xF800) === 0x7000) {
            this.strbImm(i374);
        }
        else if ((i374 & 0xF800) === 0x7800) {
            this.ldrbImm(i374);
        }
        else if ((i374 & 0xF800) === 0x8000) {
            this.strhImm(i374);
        }
        else if ((i374 & 0xF800) === 0x8800) {
            this.ldrhImm(i374);
        }
        else if ((i374 & 0xF800) === 0xA000) {
            this.addSpPc(i374);
        }
        else if ((i374 & 0xFF00) === 0xB000) {
            this.addSpImm7(i374);
        }
        else if ((i374 & 0xFF00) === 0xB500) {
            this.pushLr(i374);
        }
        else if ((i374 & 0xFF00) === 0xBD00) {
            this.popPc(i374);
        }
        else if ((i374 & 0xFE00) === 0xBC00) {
            this.popMulti(i374);
        }
        else if ((i374 & 0xFE00) === 0xB400) {
            this.pushMulti(i374);
        }
        else if ((i374 & 0xF600) === 0xB200) {
            this.sxtbUxtb(i374);
        }
        else if ((i374 & 0xFFC0) === 0xBA00) {
            this.revReg(i374);
        }
        else if ((i374 & 0xFFC0) === 0xBA40) {
            this.rev16Reg(i374);
        }
        else if ((i374 & 0xF500) === 0xB100) {
            this.cbzCbnz(i374);
        }
        else if ((i374 & 0xFF00) === 0xBE00) {
            this.bkpt(i374);
        }
        else if ((i374 & 0xFF87) === 0x4680) {
            this.movReg(i374);
        }
        else if ((i374 & 0xFF87) === 0x4780) {
            this.blxReg(i374);
        }
        else if ((i374 & 0xFFC0) === 0xF380) {
            this.msrMrs(i374);
        }
        else if (i374 === 0xBF00) {
            this.pc += 2;
        }
        else if ((i374 & 0xFF00) === 0xBF00) {
            this.itBlock(i374);
        }
        else if ((i374 & 0xF800) === 0xD000) {
            this.bCond(i374);
        }
        else if ((i374 & 0xF800) === 0xE000) {
            this.bUncond(i374);
        }
        else if ((i374 & 0xF800) === 0xF000) {
            this.pc += 2;
        }
        else if ((i374 & 0xF800) === 0xE800) {
            this.pc += 2;
        }
        else if ((i374 & 0xF800) === 0xF000 && h374 + 3 < this.memory.length) {
            const l374 = this.memory[h374 + 2] | (this.memory[h374 + 3] << 8);
            this.decode32Bit(i374, l374);
        }
        else {
            this.pc += 2;
        }
        if (this.pc === j374)
            this.pc += 2;
        this.tickSysTick();
        this.checkPendingExceptions();
        this.syncRegs();
        this.recordHistory(j374, i374);
        return this.lastError === ErrCode.OK;
    }
    private recordHistory(e374: number, f374: number): void {
        if (this.instructionHistory.length >= this.maxHistory) {
            this.instructionHistory.shift();
        }
        const g374: InstructionRecord = {
            pc: e374,
            mnemonic: `0x${f374.toString(16).padStart(4, '0')}`
        };
        this.instructionHistory.push(g374);
    }
    getInstructionHistory(): InstructionRecord[] {
        return this.instructionHistory.slice();
    }
    private shiftImm(w373: number): void {
        const x373 = (w373 >> 11) & 0x3;
        const y373 = (w373 >> 6) & 0x1F;
        const z373 = (w373 >> 3) & 0x7;
        const a374 = w373 & 0x7;
        const b374 = this.reg(z373);
        let c374 = 0;
        switch (x373) {
            case 0:
                c374 = b374 << y373;
                break;
            case 1:
                c374 = b374 >>> y373;
                break;
            case 2: {
                const d374 = b374 & 0x80000000;
                c374 = b374 >>> y373;
                if (d374)
                    c374 |= (0xFFFFFFFF << (32 - y373)) >>> 0;
                break;
            }
        }
        this.setReg(a374, c374);
        this.pc += 2;
    }
    private aluReg(q373: number): void {
        const r373 = (q373 >> 9) & 0x3;
        const s373 = (q373 >> 6) & 0x7;
        const t373 = (q373 >> 3) & 0x7;
        const u373 = q373 & 0x7;
        let v373 = this.reg(t373);
        if (r373 === 1)
            v373 = this.reg(s373) - v373;
        else if (r373 === 2)
            v373 = this.reg(s373) + v373;
        this.setReg(u373, v373);
        this.pc += 2;
    }
    private addSubReg(k373: number): void {
        const l373 = (k373 >> 9) & 1;
        const m373 = (k373 >> 3) & 0x7;
        const n373 = k373 & 0x7;
        const o373 = (k373 >> 6) & 0x7;
        const p373 = l373 ? this.reg(m373) - o373 : this.reg(m373) + o373;
        this.setReg(n373, p373);
        this.pc += 2;
    }
    private addImm3(h373: number): void { const i373 = h373 & 0x7; const j373 = (h373 >> 6) & 0x7; this.setReg(i373, this.reg(i373) + j373); this.pc += 2; }
    private subImm3(e373: number): void { const f373 = e373 & 0x7; const g373 = (e373 >> 6) & 0x7; this.setReg(f373, this.reg(f373) - g373); this.pc += 2; }
    private addImm8(c373: number): void { const d373 = (c373 >> 8) & 0x7; this.setReg(d373, this.reg(d373) + (c373 & 0xFF)); this.pc += 2; }
    private subImm8(a373: number): void { const b373 = (a373 >> 8) & 0x7; this.setReg(b373, this.reg(b373) - (a373 & 0xFF)); this.pc += 2; }
    private andsImm5(x372: number): void { const y372 = x372 & 0x7; const z372 = (x372 >> 3) & 0x7; this.setReg(y372, this.reg(y372) & this.reg(z372)); this.pc += 2; }
    private lslsImm5(u372: number): void { const v372 = u372 & 0x7; const w372 = (u372 >> 3) & 0x7; this.setReg(v372, this.reg(v372) << (w372 & 0xFF)); this.pc += 2; }
    private lsrsImm5(r372: number): void { const s372 = r372 & 0x7; const t372 = (r372 >> 3) & 0x7; this.setReg(s372, this.reg(s372) >>> (t372 & 0xFF)); this.pc += 2; }
    private asrsImm5(o372: number): void { const p372 = o372 & 0x7; const q372 = (o372 >> 3) & 0x7; this.setReg(p372, this.reg(p372) >> (q372 & 0xFF)); this.pc += 2; }
    private mulReg(l372: number): void { const m372 = l372 & 0x7; const n372 = (l372 >> 3) & 0x7; this.setReg(m372, (this.reg(n372) * this.reg(m372)) >>> 0); this.pc += 2; }
    private eorReg(i372: number): void { const j372 = i372 & 0x7; const k372 = (i372 >> 3) & 0x7; this.setReg(j372, this.reg(j372) ^ this.reg(k372)); this.pc += 2; }
    private sxtbUxtb(d372: number): void {
        const e372 = d372 & 0x7;
        const f372 = (d372 >> 3) & 0x7;
        const g372 = (d372 >> 6) & 1;
        const h372 = this.reg(f372) & 0xFF;
        this.setReg(e372, g372 && (h372 & 0x80) ? (h372 | 0xFFFFFF00) >>> 0 : h372);
        this.pc += 2;
    }
    private revReg(z371: number): void {
        const a372 = z371 & 0x7;
        const b372 = (z371 >> 3) & 0x7;
        const c372 = this.reg(b372);
        this.setReg(a372, ((c372 & 0xFF) << 24) | ((c372 >> 8) & 0xFF) << 16 | ((c372 >> 16) & 0xFF) << 8 | ((c372 >> 24) & 0xFF));
        this.pc += 2;
    }
    private rev16Reg(v371: number): void {
        const w371 = v371 & 0x7;
        const x371 = (v371 >> 3) & 0x7;
        const y371 = this.reg(x371);
        this.setReg(w371, ((y371 & 0xFF) << 8) | ((y371 >> 8) & 0xFF) | (y371 & 0xFFFF0000));
        this.pc += 2;
    }
    private cbzCbnz(o371: number): void {
        const p371 = (o371 >> 11) & 1;
        const q371 = (o371 >> 3) & 0x1F;
        const r371 = o371 & 0x7;
        const s371 = (o371 >> 9) & 1;
        const t371 = (s371 << 6) | (q371 << 1);
        const u371 = p371 ? (this.reg(r371) !== 0) : (this.reg(r371) === 0);
        this.pc += u371 ? (4 + t371) : 2;
    }
    private bkpt(n371: number): void { this.pc += 2; }
    private bUncond(m371: number): void { this.pc = (this.pc + 4 + (m371 & 0x7FF) * 2) & 0xFFFFFFFE; }
    private blxReg(k371: number): void {
        const l371 = (k371 >> 3) & 0xF;
        this.lr = (this.pc + 2) | 1;
        this.callStack.push(this.pc + 2);
        this.pc = this.reg(l371) & 0xFFFFFFFE;
    }
    private itBlock(j371: number): void {
        this.pc += 2;
    }
    private msrMrs(e371: number): void {
        const f371 = (e371 >> 3) & 0xF;
        const g371 = (e371 & 0x20) !== 0;
        if (g371) {
            const i371 = (e371 >> 8) & 0x7;
            this.setReg((e371 >> 8) & 0x7, this.specialRegs.get(i371) ?? 0);
        }
        else {
            const h371 = (e371 >> 8) & 0x7;
            this.specialRegs.set(h371, this.reg(f371));
        }
        this.pc += 2;
    }
    private strbImm(a371: number): void {
        const b371 = a371 & 0x7;
        const c371 = (a371 >> 3) & 0x7;
        const d371 = (a371 >> 6) & 0x1F;
        this.writeMem8(this.reg(c371) + d371, this.reg(b371) & 0xFF);
        this.pc += 2;
    }
    private ldrbImm(w370: number): void {
        const x370 = w370 & 0x7;
        const y370 = (w370 >> 3) & 0x7;
        const z370 = (w370 >> 6) & 0x1F;
        this.setReg(x370, this.readMem8(this.reg(y370) + z370));
        this.pc += 2;
    }
    private strhImm(s370: number): void {
        const t370 = s370 & 0x7;
        const u370 = (s370 >> 3) & 0x7;
        const v370 = (s370 >> 6) & 0x1F;
        this.writeMem16(this.reg(u370) + v370, this.reg(t370) & 0xFFFF);
        this.pc += 2;
    }
    private ldrhImm(o370: number): void {
        const p370 = o370 & 0x7;
        const q370 = (o370 >> 3) & 0x7;
        const r370 = (o370 >> 6) & 0x1F;
        this.setReg(p370, this.readMem16(this.reg(q370) + r370));
        this.pc += 2;
    }
    private ldrStrReg(j370: number): void {
        const k370 = j370 & 0x7;
        const l370 = (j370 >> 3) & 0x7;
        const m370 = (j370 >> 6) & 0x7;
        const n370 = (j370 >> 11) & 1;
        if (n370)
            this.setReg(k370, this.readMem32(this.reg(l370) + this.reg(m370)));
        else
            this.writeMem32(this.reg(l370) + this.reg(m370), this.reg(k370));
        this.pc += 2;
    }
    private ldrStrBytReg(e370: number): void {
        const f370 = e370 & 0x7;
        const g370 = (e370 >> 3) & 0x7;
        const h370 = (e370 >> 6) & 0x7;
        const i370 = (e370 >> 11) & 1;
        if (i370)
            this.setReg(f370, this.readMem8(this.reg(g370) + this.reg(h370)));
        else
            this.writeMem8(this.reg(g370) + this.reg(h370), this.reg(f370) & 0xFF);
        this.pc += 2;
    }
    private addSpPc(b370: number): void {
        const c370 = (b370 >> 8) & 0x7;
        const d370 = (b370 >> 11) & 1;
        this.setReg(c370, d370 ? this.sp + (b370 & 0xFF) * 4 : this.pc + (b370 & 0xFF) * 4);
        this.pc += 2;
    }
    private addSpImm7(a370: number): void { this.sp = (this.sp + ((a370 & 0x7F) << 2)) >>> 0; this.pc += 2; }
    private pushMulti(u369: number): void {
        const v369 = u369 & 0xFF;
        let w369 = 0;
        for (let z369 = 0; z369 < 8; z369++) {
            if (v369 & (1 << z369))
                w369++;
        }
        this.sp -= w369 * 4;
        let x369 = this.sp;
        for (let y369 = 0; y369 < 8; y369++) {
            if (v369 & (1 << y369)) {
                this.writeMem32(x369, this.reg(y369));
                x369 += 4;
            }
        }
        this.pc += 2;
    }
    private popMulti(o369: number): void {
        const p369 = o369 & 0xFF;
        let q369 = this.sp;
        for (let t369 = 0; t369 < 8; t369++) {
            if (p369 & (1 << t369)) {
                this.setReg(t369, this.readMem32(q369));
                q369 += 4;
            }
        }
        let r369 = 0;
        for (let s369 = 0; s369 < 8; s369++) {
            if (p369 & (1 << s369))
                r369++;
        }
        this.sp += r369 * 4;
        this.pc += 2;
    }
    private enterException(k369: number, l369: number): void {
        this.sp -= 32;
        let m369 = this.sp;
        this.writeMem32(m369, this.reg(0));
        m369 += 4;
        this.writeMem32(m369, this.reg(1));
        m369 += 4;
        this.writeMem32(m369, this.reg(2));
        m369 += 4;
        this.writeMem32(m369, this.reg(3));
        m369 += 4;
        this.writeMem32(m369, this.reg(12));
        m369 += 4;
        this.writeMem32(m369, this.lr);
        m369 += 4;
        this.writeMem32(m369, this.pc);
        m369 += 4;
        const n369 = this.encodeXpsr(k369);
        this.writeMem32(m369, n369);
        this.lr = 0xFFFFFFF9;
        this.pc = this.readMem32(l369);
        this.exceptionActive.push(k369);
    }
    private encodeXpsr(j369: number): number {
        return (this.specialRegs.get(APSR) ?? 0) | (j369 & 0x1FF);
    }
    private checkPendingExceptions(): void {
        for (let d369 = 0; d369 < 240; d369++) {
            const e369 = d369 >> 5;
            const f369 = d369 & 0x1F;
            const g369 = (this.nvicIspr[e369] >> f369) & 1;
            const h369 = (this.nvicIser[e369] >> f369) & 1;
            if (g369 && h369) {
                const i369 = 0x08000000 + 0x40 + d369 * 4;
                this.nvicIspr[e369] &= ~(1 << f369);
                this.enterException(16 + d369, i369);
                return;
            }
        }
        if (this.systickCtrl & 0x10000) {
            this.systickCtrl &= ~0x10000;
            if ((this.systickCtrl & 2) !== 0) {
                this.enterException(15, 0x0800003C);
            }
        }
    }
    private tickSysTick(): void {
        if ((this.systickCtrl & 1) === 0)
            return;
        this.systickVal--;
        if (this.systickVal <= 0) {
            this.systickVal = this.systickLoad;
            this.systickCtrl |= 0x10000;
        }
    }
    private exitException(): void {
        if (this.exceptionActive.length === 0)
            return;
        this.exceptionActive.pop();
        let c369 = this.sp;
        this.setReg(0, this.readMem32(c369));
        c369 += 4;
        this.setReg(1, this.readMem32(c369));
        c369 += 4;
        this.setReg(2, this.readMem32(c369));
        c369 += 4;
        this.setReg(3, this.readMem32(c369));
        c369 += 4;
        this.setReg(12, this.readMem32(c369));
        c369 += 4;
        this.lr = this.readMem32(c369);
        c369 += 4;
        this.pc = this.readMem32(c369);
        c369 += 4;
        this.sp += 32;
    }
    private readNvicReg(z368: number): number {
        const a369 = z368 - 0xE000E100;
        const b369 = Math.floor(a369 / 4);
        if (z368 >= NVIC_ISER0 && z368 < NVIC_ISER0 + 32)
            return this.nvicIser[b369];
        if (z368 >= NVIC_ICER0 && z368 < NVIC_ICER0 + 32)
            return this.nvicIcer[b369];
        if (z368 >= NVIC_ISPR0 && z368 < NVIC_ISPR0 + 32)
            return this.nvicIspr[b369];
        if (z368 >= NVIC_ICPR0 && z368 < NVIC_ICPR0 + 32)
            return 0;
        if (z368 >= NVIC_IABR0 && z368 < NVIC_IABR0 + 32)
            return this.nvicIabr[b369];
        if (z368 >= NVIC_IPR0 && z368 < NVIC_IPR0 + 240)
            return this.nvicIpr[z368 - NVIC_IPR0];
        return 0;
    }
    private writeNvicReg(w368: number, x368: number): void {
        const y368 = Math.floor((w368 - 0xE000E100) / 4);
        if (w368 >= NVIC_ISER0 && w368 < NVIC_ISER0 + 32) {
            this.nvicIser[y368] |= x368;
            return;
        }
        if (w368 >= NVIC_ICER0 && w368 < NVIC_ICER0 + 32) {
            this.nvicIser[y368] &= ~x368;
            return;
        }
        if (w368 >= NVIC_ISPR0 && w368 < NVIC_ISPR0 + 32) {
            this.nvicIspr[y368] |= x368;
            return;
        }
        if (w368 >= NVIC_ICPR0 && w368 < NVIC_ICPR0 + 32) {
            this.nvicIspr[y368] &= ~x368;
            return;
        }
        if (w368 >= NVIC_IPR0 && w368 < NVIC_IPR0 + 240) {
            this.nvicIpr[w368 - NVIC_IPR0] = x368 & 0xFF;
            return;
        }
    }
    private readMem8(u368: number): number {
        if (u368 >= 0xE000E100 && u368 < 0xE000EF00)
            return this.readNvicReg(u368) & 0xFF;
        if (u368 >= SYSTICK_BASE && u368 < SYSTICK_BASE + 0x10)
            return this.readSysTickReg(u368) & 0xFF;
        if (u368 >= SCB_BASE && u368 < SCB_BASE + 0x60)
            return this.readScbReg(u368) & 0xFF;
        const v368 = this.toMemOffset(u368);
        if (v368 < 0 || v368 >= this.memory.length)
            return 0;
        return this.memory[v368];
    }
    private readMem16(s368: number): number {
        if (s368 >= 0xE000E100 && s368 < 0xE000EF00)
            return this.readNvicReg(s368) & 0xFFFF;
        const t368 = this.toMemOffset(s368);
        if (t368 < 0 || t368 + 1 >= this.memory.length)
            return 0;
        return this.memory[t368] | (this.memory[t368 + 1] << 8);
    }
    readMem32(q368: number): number {
        if (q368 >= 0xE000E100 && q368 < 0xE000EF00)
            return this.readNvicReg(q368);
        if (q368 >= SYSTICK_BASE && q368 < SYSTICK_BASE + 0x10)
            return this.readSysTickReg(q368);
        if (q368 >= SCB_BASE && q368 < SCB_BASE + 0x60)
            return this.readScbReg(q368);
        const r368 = this.toMemOffset(q368);
        if (r368 < 0 || r368 + 3 >= this.memory.length)
            return 0;
        return this.memory[r368] | (this.memory[r368 + 1] << 8) |
            (this.memory[r368 + 2] << 16) | (this.memory[r368 + 3] << 24);
    }
    private writeMem8(n368: number, o368: number): void {
        if (n368 >= 0xE000E100 && n368 < 0xE000EF00) {
            this.writeNvicReg(n368, o368);
            return;
        }
        if (n368 >= SYSTICK_BASE && n368 < SYSTICK_BASE + 0x10) {
            this.writeSysTickReg(n368, o368);
            return;
        }
        if (n368 >= SCB_BASE && n368 < SCB_BASE + 0x60) {
            this.writeScbReg(n368, o368);
            return;
        }
        const p368 = this.toMemOffset(n368);
        if (p368 >= 0 && p368 < this.memory.length)
            this.memory[p368] = o368 & 0xFF;
    }
    private writeMem16(k368: number, l368: number): void {
        if (k368 >= 0xE000E100 && k368 < 0xE000EF00) {
            this.writeNvicReg(k368, l368);
            return;
        }
        const m368 = this.toMemOffset(k368);
        if (m368 >= 0 && m368 + 1 < this.memory.length) {
            this.memory[m368] = l368 & 0xFF;
            this.memory[m368 + 1] = (l368 >> 8) & 0xFF;
        }
    }
    writeMem32(h368: number, i368: number): void {
        if (h368 >= 0xE000E100 && h368 < 0xE000EF00) {
            this.writeNvicReg(h368, i368);
            return;
        }
        if (h368 >= SYSTICK_BASE && h368 < SYSTICK_BASE + 0x10) {
            this.writeSysTickReg(h368, i368);
            return;
        }
        if (h368 >= SCB_BASE && h368 < SCB_BASE + 0x60) {
            this.writeScbReg(h368, i368);
            return;
        }
        const j368 = this.toMemOffset(h368);
        if (j368 < 0 || j368 + 3 >= this.memory.length)
            return;
        this.memory[j368] = i368 & 0xFF;
        this.memory[j368 + 1] = (i368 >> 8) & 0xFF;
        this.memory[j368 + 2] = (i368 >> 16) & 0xFF;
        this.memory[j368 + 3] = (i368 >> 24) & 0xFF;
    }
    private toMemOffset(g368: number): number {
        if (g368 >= 0x08000000 && g368 < 0x08000000 + this.memory.length)
            return g368 - 0x08000000;
        if (g368 >= 0x20000000 && g368 < 0x20000000 + this.memory.length)
            return g368 - 0x20000000 + Math.min(this.memory.length - (g368 - 0x20000000), 0);
        return -1;
    }
    private readSysTickReg(f368: number): number {
        switch (f368 & 0xF) {
            case 0x0: return this.systickCtrl;
            case 0x4: return this.systickLoad;
            case 0x8: return this.systickVal;
            case 0xC: return this.systickCalib;
            default: return 0;
        }
    }
    private writeSysTickReg(d368: number, e368: number): void {
        switch (d368 & 0xF) {
            case 0x0:
                this.systickCtrl = e368 & 0x7;
                break;
            case 0x4:
                this.systickLoad = e368 & 0xFFFFFF;
                this.systickVal = this.systickLoad;
                break;
            case 0x8:
                this.systickVal = e368 & 0xFFFFFF;
                break;
        }
    }
    private readScbReg(c368: number): number {
        switch (c368 & 0xFF) {
            case 0x04: return (this.exceptionActive.length > 0 ? this.exceptionActive[this.exceptionActive.length - 1] : 0);
            case 0x08: return 0x08000000;
            case 0x0C: return (this.nvicPriorityGroup << 8);
            default: return 0;
        }
    }
    private writeScbReg(a368: number, b368: number): void {
        switch (a368 & 0xFF) {
            case 0x0C:
                this.nvicPriorityGroup = (b368 >> 8) & 0x7;
                break;
        }
    }
    getPeripheralRegs(): Map<string, Map<string, number>> {
        const w367 = new Map<string, Map<string, number>>();
        const x367 = new Map<string, number>();
        x367.set('ISER0', this.nvicIser[0]);
        x367.set('ISPR0', this.nvicIspr[0]);
        x367.set('IABR0', this.nvicIabr[0]);
        x367.set('IPR0', this.nvicIpr[0]);
        w367.set('NVIC', x367);
        const y367 = new Map<string, number>();
        y367.set('CTRL', this.systickCtrl);
        y367.set('LOAD', this.systickLoad);
        y367.set('VAL', this.systickVal);
        y367.set('CALIB', this.systickCalib);
        w367.set('SysTick', y367);
        const z367 = new Map<string, number>();
        z367.set('VTOR', this.readMem32(SCB_VTOR));
        z367.set('AIRCR', this.readMem32(SCB_AIRCR));
        z367.set('SHCSR', 0);
        z367.set('CFSR', 0);
        z367.set('HFSR', 0);
        w367.set('SCB', z367);
        return w367;
    }
    getRegisters(): Map<string, number> {
        const v367 = copyNumberMap(this.regs);
        v367.set('PC', this.pc);
        v367.set('SP', this.sp);
        v367.set('LR', this.lr);
        v367.set('xPSR', this.specialRegs.get(XPSR) ?? 0);
        v367.set('PRIMASK', this.specialRegs.get(PRIMASK) ?? 0);
        v367.set('CONTROL', this.specialRegs.get(CONTROL) ?? 0);
        return v367;
    }
    getPc(): number { return this.pc; }
    getMemory(): Uint8Array { return this.memory; }
    getCallStack(): number[] { return this.callStack.slice(); }
    getLastError(): ErrCode { return this.lastError; }
    private syncRegs(): void {
        this.regs.set('R13', this.sp);
        this.regs.set('R14', this.lr);
        this.regs.set('R15', this.pc);
    }
    private reg(u367: number): number { return this.regs.get(`R${u367}`) ?? 0; }
    private setReg(s367: number, t367: number): void {
        this.regs.set(`R${s367}`, t367 >>> 0);
        if (s367 === 13)
            this.sp = t367;
        if (s367 === 14)
            this.lr = t367;
        if (s367 === 15)
            this.pc = t367;
    }
    private bCond(o367: number): void {
        const p367 = (o367 >> 8) & 0xF;
        const q367 = o367 & 0xFF;
        const r367 = q367 >= 128 ? q367 - 256 : q367;
        if (this.evalCond(p367))
            this.pc += r367 * 2;
        this.pc += 2;
    }
    private evalCond(n367: number): boolean {
        switch (n367) {
            case 0x0: return false;
            case 0x1: return true;
            case 0xE: return true;
            default: return true;
        }
    }
    private ldrLit(k367: number): void {
        const l367 = (k367 >> 8) & 0x7;
        const m367 = k367 & 0xFF;
        this.setReg(l367, this.readMem32(this.pc + 4 + m367 * 4));
        this.pc += 2;
    }
    private movReg(j367: number): void { this.setReg((j367 >> 3) & 0x7, this.reg((j367 >> 6) & 0x7)); this.pc += 2; }
    private movImm(i367: number): void { this.setReg((i367 >> 8) & 0x7, i367 & 0xFF); this.pc += 2; }
    private strImm(h367: number): void {
        this.writeMem32(this.reg((h367 >> 3) & 0x7) + ((h367 >> 6) & 0x1F) * 4, this.reg(h367 & 0x7));
        this.pc += 2;
    }
    private ldrImm(g367: number): void {
        this.setReg(g367 & 0x7, this.readMem32(this.reg((g367 >> 3) & 0x7) + ((g367 >> 6) & 0x1F) * 4));
        this.pc += 2;
    }
    private pushLr(f367: number): void {
        this.callStack.push(this.pc + 2);
        this.sp -= 4;
        this.writeMem32(this.sp, this.lr);
        this.pc += 2;
    }
    private popPc(d367: number): void {
        const e367 = this.readMem32(this.sp);
        this.sp += 4;
        this.pc = e367 & 0xFFFFFFFE;
        if (this.callStack.length > 0)
            this.callStack.pop();
    }
    private subReg(c367: number): void {
        this.setReg(c367 & 0x7, (this.reg(c367 & 0x7) - this.reg((c367 >> 3) & 0x7)) >>> 0);
        this.pc += 2;
    }
    private andReg(b367: number): void {
        this.setReg(b367 & 0x7, this.reg(b367 & 0x7) & this.reg((b367 >> 3) & 0x7));
        this.pc += 2;
    }
    private orrReg(a367: number): void {
        this.setReg(a367 & 0x7, this.reg(a367 & 0x7) | this.reg((a367 >> 3) & 0x7));
        this.pc += 2;
    }
    private cmpImm(x366: number): void {
        const y366 = (x366 >> 8) & 0x7;
        const z366 = this.reg(y366) - (x366 & 0xFF);
        this.specialRegs.set(APSR, z366 === 0 ? (1 << 30) : 0);
        this.pc += 2;
    }
    private decode32Bit(n366: number, o366: number): void {
        if ((n366 & 0xF800) === 0xF000 && (o366 & 0xD000) === 0xD000) {
            const p366 = (n366 >> 10) & 1;
            const q366 = (o366 >> 13) & 1;
            const r366 = (o366 >> 11) & 1;
            const s366 = q366 !== p366;
            const t366 = r366 !== p366;
            const u366 = n366 & 0x3FF;
            const v366 = o366 & 0x7FF;
            let w366 = (p366 << 24) | ((s366 ? 1 : 0) << 23) | ((t366 ? 1 : 0) << 22) | (u366 << 12) | (v366 << 1);
            if (p366)
                w366 |= 0xFE000000;
            this.lr = (this.pc + 4) | 1;
            this.callStack.push(this.pc + 4);
            this.pc = ((this.pc + 4 + w366) & 0xFFFFFFFE) >>> 0;
        }
        else {
            this.pc += 4;
        }
    }
}
