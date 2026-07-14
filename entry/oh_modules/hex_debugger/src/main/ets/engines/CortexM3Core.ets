/**
 * ARM Cortex-M3 Thumb-2 指令解释器 — 完整外设模型
 * v2.0: 35+指令 / NVIC (240IRQ) / SysTick / GPIO / SCB / xPSR
 */
import { copyNumberMap, ErrCode } from 'common';

interface InstructionRecord {
  pc: number;
  mnemonic: string;
}

// ---- 特殊寄存器 ----
const APSR = 0; const IAPSR = 1; const EAPSR = 2; const XPSR = 3;
const IPSR = 5; const EPSR = 6; const IEPSR = 7;
const MSP = 8; const PSP = 9; const PRIMASK = 16; const CONTROL = 20;
const NVIC_ISER0 = 0xE000E100; const NVIC_ICER0 = 0xE000E180;
const NVIC_ISPR0 = 0xE000E200; const NVIC_ICPR0 = 0xE000E280;
const NVIC_IABR0 = 0xE000E300; const NVIC_IPR0  = 0xE000E400;
const SYSTICK_BASE = 0xE000E010;
const SCB_BASE      = 0xE000ED00;
const SCB_ICSR  = SCB_BASE + 0x04;
const SCB_VTOR  = SCB_BASE + 0x08;
const SCB_AIRCR = SCB_BASE + 0x0C;
const SCB_SHCSR = SCB_BASE + 0x24;
const SCB_CFSR  = SCB_BASE + 0x28;
const SCB_HFSR  = SCB_BASE + 0x2C;
const SCB_MMFAR = SCB_BASE + 0x34;
const SCB_BFAR  = SCB_BASE + 0x38;

export class CortexM3Core {
  private memory: Uint8Array;
  private regs: Map<string, number> = new Map();
  private pc: number = 0;
  private sp: number = 0x20005000;
  private lr: number = 0xFFFFFFFF;
  private lastError: ErrCode = ErrCode.OK;
  private callStack: number[] = [];
  private specialRegs: Map<number, number> = new Map();
  // NVIC
  private nvicIser: Uint32Array = new Uint32Array(8);  // 8 × 32bit = 240 IRQ
  private nvicIcer: Uint32Array = new Uint32Array(8);
  private nvicIspr: Uint32Array = new Uint32Array(8);
  private nvicIabr: Uint32Array = new Uint32Array(8);
  private nvicIpr: Uint8Array = new Uint8Array(240);    // 240 × 8bit priority
  private nvicPriorityGroup: number = 0;
  private exceptionActive: number[] = [];
  // SysTick
  private systickCtrl: number = 0;
  private systickLoad: number = 0;
  private systickVal: number = 0;
  private systickCalib: number = 9000;
  // GPIO 模拟
  private gpioRegs: Map<number, number> = new Map();
  // 指令历史
  private instructionHistory: InstructionRecord[] = [];
  private maxHistory: number = 1000;

  constructor(memorySize: number = 262144) {
    this.memory = new Uint8Array(memorySize);
    this.reset();
  }

  loadProgram(data: Uint8Array, offset: number = 0): void {
    for (let i = 0; i < data.length; i++) {
      if (offset + i < this.memory.length) this.memory[offset + i] = data[i];
    }
    this.applyResetVector();
  }

  reset(): void {
    for (let i = 0; i < 16; i++) this.regs.set(`R${i}`, 0);
    this.pc = 0x08000000; this.sp = 0x20005000; this.lr = 0xFFFFFFFF;
    this.callStack = []; this.lastError = ErrCode.OK; this.instructionHistory = [];
    this.specialRegs.clear();
    this.nvicIser.fill(0); this.nvicIcer.fill(0); this.nvicIspr.fill(0); this.nvicIabr.fill(0);
    this.nvicIpr.fill(0); this.exceptionActive = [];
    this.systickCtrl = 0; this.systickLoad = 0; this.systickVal = 0;
    this.gpioRegs.clear();
    this.regs.set('R13', this.sp); this.regs.set('R14', this.lr); this.regs.set('R15', this.pc);
    this.specialRegs.set(CONTROL, 0); this.specialRegs.set(PRIMASK, 0);
  }

  /** Apply Cortex-M vector table (MSP @0, Reset @4) after flash image is present. */
  private applyResetVector(): void {
    if (this.memory.length < 8) {
      return;
    }
    const sp = this.memory[0] | (this.memory[1] << 8) | (this.memory[2] << 16) | (this.memory[3] << 24);
    const reset = this.memory[4] | (this.memory[5] << 8) | (this.memory[6] << 16) | (this.memory[7] << 24);
    if (sp >= 0x20000000 && sp < 0x20100000) {
      this.sp = sp >>> 0;
      this.regs.set('R13', this.sp);
    }
    if ((reset >>> 0) >= 0x08000000 && (reset >>> 0) < 0x08200000) {
      this.pc = (reset >>> 0) & 0xFFFFFFFE;
      this.regs.set('R15', this.pc);
    }
  }

  step(): boolean {
    const addr = this.pc - 0x08000000;
    if (addr < 0 || addr + 1 >= this.memory.length) {
      this.lastError = ErrCode.ERR_MCU_INVALID_OPCODE;
      return false;
    }
    const hw = this.memory[addr] | (this.memory[addr + 1] << 8);
    const prevPc = this.pc;

    // ---- 16-bit Thumb decode ----
    const op5 = (hw >> 11) & 0x1F;
    if (op5 === 0x00) {
      // LSLS/LSRS/ASRS/MOVS reg
      this.shiftImm(hw);
    } else if (op5 === 0x01 || op5 === 0x02 || op5 === 0x03) {
      // ADD/SUB reg or ADD/SUB/CMP/MOV imm
      this.aluReg(hw);
    } else if ((hw & 0xFC00) === 0x4000) {
      this.andsImm5(hw);
    } else if ((hw & 0xFFC0) === 0x4080) {
      this.lslsImm5(hw);
    } else if ((hw & 0xFFC0) === 0x40C0) {
      this.lsrsImm5(hw);
    } else if ((hw & 0xFFC0) === 0x4100) {
      this.asrsImm5(hw);
    } else if ((hw & 0xFE00) === 0x4200) {
      this.subReg(hw);  // TST reg
    } else if ((hw & 0xFFC0) === 0x4340) {
      this.mulReg(hw);
    } else if ((hw & 0xFF00) === 0x4200) {
      this.subReg(hw);
    } else if ((hw & 0xF800) === 0x4000) {
      this.andReg(hw);
    } else if ((hw & 0xF800) === 0x4300) {
      this.orrReg(hw);
    } else if ((hw & 0xF800) === 0x4040) {
      this.eorReg(hw);
    } else if ((hw & 0xF800) === 0x1800) {
      this.addSubReg(hw);
    } else if ((hw & 0xFE00) === 0x1C00) {
      this.addImm3(hw);
    } else if ((hw & 0xFE00) === 0x1E00) {
      this.subImm3(hw);
    } else if ((hw & 0xF800) === 0x2000) {
      this.movImm(hw);
    } else if ((hw & 0xF800) === 0x2800) {
      this.cmpImm(hw);
    } else if ((hw & 0xF800) === 0x3000) {
      this.addImm8(hw);
    } else if ((hw & 0xF800) === 0x3800) {
      this.subImm8(hw);
    } else if ((hw & 0xF800) === 0x4800) {
      this.ldrLit(hw);
    } else if ((hw & 0xF200) === 0x5000) {
      this.ldrStrReg(hw);
    } else if ((hw & 0xF000) === 0x5000) {
      this.ldrStrBytReg(hw);
    } else if ((hw & 0xF800) === 0x6000) {
      this.strImm(hw);
    } else if ((hw & 0xF800) === 0x6800) {
      this.ldrImm(hw);
    } else if ((hw & 0xF800) === 0x7000) {
      this.strbImm(hw);  // STRB imm
    } else if ((hw & 0xF800) === 0x7800) {
      this.ldrbImm(hw);  // LDRB imm
    } else if ((hw & 0xF800) === 0x8000) {
      this.strhImm(hw);  // STRH imm
    } else if ((hw & 0xF800) === 0x8800) {
      this.ldrhImm(hw);  // LDRH imm
    } else if ((hw & 0xF800) === 0xA000) {
      this.addSpPc(hw);
    } else if ((hw & 0xFF00) === 0xB000) {
      this.addSpImm7(hw);
    } else if ((hw & 0xFF00) === 0xB500) {
      this.pushLr(hw);
    } else if ((hw & 0xFF00) === 0xBD00) {
      this.popPc(hw);
    } else if ((hw & 0xFE00) === 0xBC00) {
      this.popMulti(hw);
    } else if ((hw & 0xFE00) === 0xB400) {
      this.pushMulti(hw);
    } else if ((hw & 0xF600) === 0xB200) {
      this.sxtbUxtb(hw);
    } else if ((hw & 0xFFC0) === 0xBA00) {
      this.revReg(hw);
    } else if ((hw & 0xFFC0) === 0xBA40) {
      this.rev16Reg(hw);
    } else if ((hw & 0xF500) === 0xB100) {
      this.cbzCbnz(hw);
    } else if ((hw & 0xFF00) === 0xBE00) {
      this.bkpt(hw);
    } else if ((hw & 0xFF87) === 0x4680) {
      this.movReg(hw);
    } else if ((hw & 0xFF87) === 0x4780) {
      this.blxReg(hw);
    } else if ((hw & 0xFFC0) === 0xF380) {
      this.msrMrs(hw);
    } else if (hw === 0xBF00) {
      this.pc += 2; // NOP
    } else if ((hw & 0xFF00) === 0xBF00) {
      this.itBlock(hw);
    } else if ((hw & 0xF800) === 0xD000) {
      this.bCond(hw);
    } else if ((hw & 0xF800) === 0xE000) {
      this.bUncond(hw);
    } else if ((hw & 0xF800) === 0xF000) {
      this.pc += 2; // BL prefix — handled below
    } else if ((hw & 0xF800) === 0xE800) {
      this.pc += 2; // BLX prefix
    } else if ((hw & 0xF800) === 0xF000 && addr + 3 < this.memory.length) {
      const hw2 = this.memory[addr + 2] | (this.memory[addr + 3] << 8);
      this.decode32Bit(hw, hw2);
    } else {
      this.pc += 2;
    }

    if (this.pc === prevPc) this.pc += 2;
    this.tickSysTick();
    this.checkPendingExceptions();
    this.syncRegs();
    this.recordHistory(prevPc, hw);
    return this.lastError === ErrCode.OK;
  }

  // ---- 指令历史追踪 (2.4.17) ----
  private recordHistory(prevPc: number, hw: number): void {
    if (this.instructionHistory.length >= this.maxHistory) {
      this.instructionHistory.shift();
    }
    const record: InstructionRecord = {
      pc: prevPc,
      mnemonic: `0x${hw.toString(16).padStart(4, '0')}`
    };
    this.instructionHistory.push(record);
  }

  getInstructionHistory(): InstructionRecord[] {
    return this.instructionHistory.slice();
  }

  // ---- 新增指令实现 ----

  private shiftImm(hw: number): void {
    const op = (hw >> 11) & 0x3;
    const imm5 = (hw >> 6) & 0x1F;
    const rs = (hw >> 3) & 0x7;
    const rd = hw & 0x7;
    const val = this.reg(rs);
    let result = 0;
    switch (op) {
      case 0: result = val << imm5; break;  // LSLS
      case 1: result = val >>> imm5; break; // LSRS
      case 2: {  // ASRS
        const s = val & 0x80000000;
        result = val >>> imm5;
        if (s) result |= (0xFFFFFFFF << (32 - imm5)) >>> 0;
        break;
      }
    }
    this.setReg(rd, result);
    this.pc += 2;
  }

  private aluReg(hw: number): void {
    const op = (hw >> 9) & 0x3;
    const rn = (hw >> 6) & 0x7;
    const rs = (hw >> 3) & 0x7;
    const rd = hw & 0x7;
    let val = this.reg(rs);
    if (op === 1) val = this.reg(rn) - val;    // SUB
    else if (op === 2) val = this.reg(rn) + val; // ADD
    this.setReg(rd, val);
    this.pc += 2;
  }

  private addSubReg(hw: number): void {
    const sub = (hw >> 9) & 1;
    const rn = (hw >> 3) & 0x7;
    const rd = hw & 0x7;
    const imm3 = (hw >> 6) & 0x7;
    const val = sub ? this.reg(rn) - imm3 : this.reg(rn) + imm3;
    this.setReg(rd, val);
    this.pc += 2;
  }

  private addImm3(hw: number): void { const rd = hw & 0x7; const imm = (hw >> 6) & 0x7; this.setReg(rd, this.reg(rd) + imm); this.pc += 2; }
  private subImm3(hw: number): void { const rd = hw & 0x7; const imm = (hw >> 6) & 0x7; this.setReg(rd, this.reg(rd) - imm); this.pc += 2; }
  private addImm8(hw: number): void { const rd = (hw >> 8) & 0x7; this.setReg(rd, this.reg(rd) + (hw & 0xFF)); this.pc += 2; }
  private subImm8(hw: number): void { const rd = (hw >> 8) & 0x7; this.setReg(rd, this.reg(rd) - (hw & 0xFF)); this.pc += 2; }

  private andsImm5(hw: number): void { const rd = hw & 0x7; const rm = (hw >> 3) & 0x7; this.setReg(rd, this.reg(rd) & this.reg(rm)); this.pc += 2; }
  private lslsImm5(hw: number): void { const rd = hw & 0x7; const rm = (hw >> 3) & 0x7; this.setReg(rd, this.reg(rd) << (rm & 0xFF)); this.pc += 2; }
  private lsrsImm5(hw: number): void { const rd = hw & 0x7; const rm = (hw >> 3) & 0x7; this.setReg(rd, this.reg(rd) >>> (rm & 0xFF)); this.pc += 2; }
  private asrsImm5(hw: number): void { const rd = hw & 0x7; const rm = (hw >> 3) & 0x7; this.setReg(rd, this.reg(rd) >> (rm & 0xFF)); this.pc += 2; }

  /** MUL Rd, Rn, Rd (2.1.1) */
  private mulReg(hw: number): void { const rd = hw & 0x7; const rn = (hw >> 3) & 0x7; this.setReg(rd, (this.reg(rn) * this.reg(rd)) >>> 0); this.pc += 2; }

  private eorReg(hw: number): void { const rd = hw & 0x7; const rn = (hw >> 3) & 0x7; this.setReg(rd, this.reg(rd) ^ this.reg(rn)); this.pc += 2; }

  /** SXTB/UXTB (2.1.1) */
  private sxtbUxtb(hw: number): void {
    const rd = hw & 0x7; const rm = (hw >> 3) & 0x7;
    const s = (hw >> 6) & 1; // 0=UXTB, 1=SXTB
    const byte = this.reg(rm) & 0xFF;
    this.setReg(rd, s && (byte & 0x80) ? (byte | 0xFFFFFF00) >>> 0 : byte);
    this.pc += 2;
  }

  /** REV (2.1.1) */
  private revReg(hw: number): void {
    const rd = hw & 0x7; const rm = (hw >> 3) & 0x7; const v = this.reg(rm);
    this.setReg(rd, ((v & 0xFF) << 24) | ((v >> 8) & 0xFF) << 16 | ((v >> 16) & 0xFF) << 8 | ((v >> 24) & 0xFF));
    this.pc += 2;
  }
  private rev16Reg(hw: number): void {
    const rd = hw & 0x7; const rm = (hw >> 3) & 0x7; const v = this.reg(rm);
    this.setReg(rd, ((v & 0xFF) << 8) | ((v >> 8) & 0xFF) | (v & 0xFFFF0000));
    this.pc += 2;
  }

  /** CBZ/CBNZ (2.1.3) */
  private cbzCbnz(hw: number): void {
    const nonzero = (hw >> 11) & 1;
    const imm5 = (hw >> 3) & 0x1F;
    const rn = hw & 0x7;
    const i = (hw >> 9) & 1;
    const offset = (i << 6) | (imm5 << 1);
    const cond = nonzero ? (this.reg(rn) !== 0) : (this.reg(rn) === 0);
    this.pc += cond ? (4 + offset) : 2;
  }

  private bkpt(hw: number): void { this.pc += 2; } // BKPT — 视为 NOP
  private bUncond(hw: number): void { this.pc = (this.pc + 4 + (hw & 0x7FF) * 2) & 0xFFFFFFFE; }

  /** BLX register (2.1.3) */
  private blxReg(hw: number): void {
    const rm = (hw >> 3) & 0xF;
    this.lr = (this.pc + 2) | 1;
    this.callStack.push(this.pc + 2);
    this.pc = this.reg(rm) & 0xFFFFFFFE;
  }

  /** IT block (2.1.3) */
  private itBlock(hw: number): void {
    // IT <cond> — 简化处理: 仅读取条件码, 下一条指令条件执行
    this.pc += 2;
  }

  /** MSR/MRS (2.1.4) */
  private msrMrs(hw: number): void {
    const rn = (hw >> 3) & 0xF;
    const isMrs = (hw & 0x20) !== 0;
    if (isMrs) {
      // MRS Rd, SPECIAL
      const specReg = (hw >> 8) & 0x7;
      this.setReg((hw >> 8) & 0x7, this.specialRegs.get(specReg) ?? 0);
    } else {
      // MSR SPECIAL, Rn
      const specReg = (hw >> 8) & 0x7;
      this.specialRegs.set(specReg, this.reg(rn));
    }
    this.pc += 2;
  }

  /** STRB imm5 (2.1.2) */
  private strbImm(hw: number): void {
    const rt = hw & 0x7; const rn = (hw >> 3) & 0x7; const imm = (hw >> 6) & 0x1F;
    this.writeMem8(this.reg(rn) + imm, this.reg(rt) & 0xFF);
    this.pc += 2;
  }
  /** LDRB imm5 (2.1.2) */
  private ldrbImm(hw: number): void {
    const rt = hw & 0x7; const rn = (hw >> 3) & 0x7; const imm = (hw >> 6) & 0x1F;
    this.setReg(rt, this.readMem8(this.reg(rn) + imm));
    this.pc += 2;
  }
  /** STRH imm5 (2.1.2) */
  private strhImm(hw: number): void {
    const rt = hw & 0x7; const rn = (hw >> 3) & 0x7; const imm = (hw >> 6) & 0x1F;
    this.writeMem16(this.reg(rn) + imm, this.reg(rt) & 0xFFFF);
    this.pc += 2;
  }
  /** LDRH imm5 (2.1.2) */
  private ldrhImm(hw: number): void {
    const rt = hw & 0x7; const rn = (hw >> 3) & 0x7; const imm = (hw >> 6) & 0x1F;
    this.setReg(rt, this.readMem16(this.reg(rn) + imm));
    this.pc += 2;
  }

  private ldrStrReg(hw: number): void {
    const rt = hw & 0x7; const rn = (hw >> 3) & 0x7; const rm = (hw >> 6) & 0x7;
    const load = (hw >> 11) & 1;
    if (load) this.setReg(rt, this.readMem32(this.reg(rn) + this.reg(rm)));
    else this.writeMem32(this.reg(rn) + this.reg(rm), this.reg(rt));
    this.pc += 2;
  }
  private ldrStrBytReg(hw: number): void {
    const rt = hw & 0x7; const rn = (hw >> 3) & 0x7; const rm = (hw >> 6) & 0x7;
    const load = (hw >> 11) & 1;
    if (load) this.setReg(rt, this.readMem8(this.reg(rn) + this.reg(rm))); // LDRB reg
    else this.writeMem8(this.reg(rn) + this.reg(rm), this.reg(rt) & 0xFF); // STRB reg
    this.pc += 2;
  }

  /** ADD SP/PC (2.1.3) */
  private addSpPc(hw: number): void {
    const rd = (hw >> 8) & 0x7;
    const sp = (hw >> 11) & 1;
    this.setReg(rd, sp ? this.sp + (hw & 0xFF) * 4 : this.pc + (hw & 0xFF) * 4);
    this.pc += 2;
  }
  private addSpImm7(hw: number): void { this.sp = (this.sp + ((hw & 0x7F) << 2)) >>> 0; this.pc += 2; }

  /** PUSH multi (2.1.2) */
  private pushMulti(hw: number): void {
    const regList = hw & 0xFF;
    let count = 0;
    for (let r = 0; r < 8; r++) { if (regList & (1 << r)) count++; }
    this.sp -= count * 4;
    let addr = this.sp;
    for (let r = 0; r < 8; r++) {
      if (regList & (1 << r)) { this.writeMem32(addr, this.reg(r)); addr += 4; }
    }
    this.pc += 2;
  }
  /** POP multi (2.1.2) */
  private popMulti(hw: number): void {
    const regList = hw & 0xFF;
    let addr = this.sp;
    for (let r = 0; r < 8; r++) {
      if (regList & (1 << r)) { this.setReg(r, this.readMem32(addr)); addr += 4; }
    }
    let count = 0;
    for (let r = 0; r < 8; r++) { if (regList & (1 << r)) count++; }
    this.sp += count * 4;
    this.pc += 2;
  }

  // ---- 异常入口/退出 (2.1.5) ----
  private enterException(excNum: number, vectorAddr: number): void {
    // 硬件自动压栈: R0-R3, R12, LR, PC, xPSR (8 words)
    this.sp -= 32;
    let addr = this.sp;
    this.writeMem32(addr, this.reg(0));  addr += 4;
    this.writeMem32(addr, this.reg(1));  addr += 4;
    this.writeMem32(addr, this.reg(2));  addr += 4;
    this.writeMem32(addr, this.reg(3));  addr += 4;
    this.writeMem32(addr, this.reg(12)); addr += 4;
    this.writeMem32(addr, this.lr);      addr += 4;
    this.writeMem32(addr, this.pc);      addr += 4;
    const xpsr = this.encodeXpsr(excNum);
    this.writeMem32(addr, xpsr);

    this.lr = 0xFFFFFFF9; // EXC_RETURN to Handler mode
    this.pc = this.readMem32(vectorAddr);
    this.exceptionActive.push(excNum);
  }

  private encodeXpsr(excNum: number): number {
    return (this.specialRegs.get(APSR) ?? 0) | (excNum & 0x1FF);
  }

  private checkPendingExceptions(): void {
    // 检查 NVIC 挂起中断
    for (let irq = 0; irq < 240; irq++) {
      const regIdx = irq >> 5;
      const bit = irq & 0x1F;
      const pending = (this.nvicIspr[regIdx] >> bit) & 1;
      const enabled = (this.nvicIser[regIdx] >> bit) & 1;
      if (pending && enabled) {
        const vectorAddr = 0x08000000 + 0x40 + irq * 4; // vector table IRQ entries
        this.nvicIspr[regIdx] &= ~(1 << bit);
        this.enterException(16 + irq, vectorAddr);
        return;
      }
    }
    // SysTick
    if (this.systickCtrl & 0x10000) {
      this.systickCtrl &= ~0x10000;
      if ((this.systickCtrl & 2) !== 0) { // TICKINT enabled
        this.enterException(15, 0x0800003C);
      }
    }
  }

  private tickSysTick(): void {
    if ((this.systickCtrl & 1) === 0) return; // ENABLE off
    this.systickVal--;
    if (this.systickVal <= 0) {
      this.systickVal = this.systickLoad;
      this.systickCtrl |= 0x10000; // COUNTFLAG
    }
  }

  // ---- 异常退出 ----
  private exitException(): void {
    if (this.exceptionActive.length === 0) return;
    this.exceptionActive.pop();
    // 硬件自动出栈
    let addr = this.sp;
    this.setReg(0, this.readMem32(addr)); addr += 4;
    this.setReg(1, this.readMem32(addr)); addr += 4;
    this.setReg(2, this.readMem32(addr)); addr += 4;
    this.setReg(3, this.readMem32(addr)); addr += 4;
    this.setReg(12, this.readMem32(addr)); addr += 4;
    this.lr = this.readMem32(addr); addr += 4;
    this.pc = this.readMem32(addr); addr += 4;
    this.sp += 32;
  }

  // ---- NVIC 外设寄存器访问 (2.2.6) ----
  private readNvicReg(addr: number): number {
    const base = addr - 0xE000E100;
    const regIdx = Math.floor(base / 4);
    if (addr >= NVIC_ISER0 && addr < NVIC_ISER0 + 32) return this.nvicIser[regIdx];
    if (addr >= NVIC_ICER0 && addr < NVIC_ICER0 + 32) return this.nvicIcer[regIdx];
    if (addr >= NVIC_ISPR0 && addr < NVIC_ISPR0 + 32) return this.nvicIspr[regIdx];
    if (addr >= NVIC_ICPR0 && addr < NVIC_ICPR0 + 32) return 0;
    if (addr >= NVIC_IABR0 && addr < NVIC_IABR0 + 32) return this.nvicIabr[regIdx];
    if (addr >= NVIC_IPR0  && addr < NVIC_IPR0 + 240)  return this.nvicIpr[addr - NVIC_IPR0];
    return 0;
  }

  private writeNvicReg(addr: number, value: number): void {
    const regIdx = Math.floor((addr - 0xE000E100) / 4);
    if (addr >= NVIC_ISER0 && addr < NVIC_ISER0 + 32) { this.nvicIser[regIdx] |= value; return; }
    if (addr >= NVIC_ICER0 && addr < NVIC_ICER0 + 32) { this.nvicIser[regIdx] &= ~value; return; }
    if (addr >= NVIC_ISPR0 && addr < NVIC_ISPR0 + 32) { this.nvicIspr[regIdx] |= value; return; }
    if (addr >= NVIC_ICPR0 && addr < NVIC_ICPR0 + 32) { this.nvicIspr[regIdx] &= ~value; return; }
    if (addr >= NVIC_IPR0  && addr < NVIC_IPR0 + 240)  { this.nvicIpr[addr - NVIC_IPR0] = value & 0xFF; return; }
  }

  // ---- 内存访问 ----

  private readMem8(addr: number): number {
    if (addr >= 0xE000E100 && addr < 0xE000EF00) return this.readNvicReg(addr) & 0xFF;
    if (addr >= SYSTICK_BASE && addr < SYSTICK_BASE + 0x10) return this.readSysTickReg(addr) & 0xFF;
    if (addr >= SCB_BASE && addr < SCB_BASE + 0x60) return this.readScbReg(addr) & 0xFF;
    const off = this.toMemOffset(addr);
    if (off < 0 || off >= this.memory.length) return 0;
    return this.memory[off];
  }

  private readMem16(addr: number): number {
    if (addr >= 0xE000E100 && addr < 0xE000EF00) return this.readNvicReg(addr) & 0xFFFF;
    const off = this.toMemOffset(addr);
    if (off < 0 || off + 1 >= this.memory.length) return 0;
    return this.memory[off] | (this.memory[off + 1] << 8);
  }

  readMem32(addr: number): number {
    if (addr >= 0xE000E100 && addr < 0xE000EF00) return this.readNvicReg(addr);
    if (addr >= SYSTICK_BASE && addr < SYSTICK_BASE + 0x10) return this.readSysTickReg(addr);
    if (addr >= SCB_BASE && addr < SCB_BASE + 0x60) return this.readScbReg(addr);
    const off = this.toMemOffset(addr);
    if (off < 0 || off + 3 >= this.memory.length) return 0;
    return this.memory[off] | (this.memory[off + 1] << 8) |
      (this.memory[off + 2] << 16) | (this.memory[off + 3] << 24);
  }

  private writeMem8(addr: number, val: number): void {
    if (addr >= 0xE000E100 && addr < 0xE000EF00) { this.writeNvicReg(addr, val); return; }
    if (addr >= SYSTICK_BASE && addr < SYSTICK_BASE + 0x10) { this.writeSysTickReg(addr, val); return; }
    if (addr >= SCB_BASE && addr < SCB_BASE + 0x60) { this.writeScbReg(addr, val); return; }
    const off = this.toMemOffset(addr);
    if (off >= 0 && off < this.memory.length) this.memory[off] = val & 0xFF;
  }

  private writeMem16(addr: number, val: number): void {
    if (addr >= 0xE000E100 && addr < 0xE000EF00) { this.writeNvicReg(addr, val); return; }
    const off = this.toMemOffset(addr);
    if (off >= 0 && off + 1 < this.memory.length) {
      this.memory[off] = val & 0xFF;
      this.memory[off + 1] = (val >> 8) & 0xFF;
    }
  }

  writeMem32(addr: number, val: number): void {
    if (addr >= 0xE000E100 && addr < 0xE000EF00) { this.writeNvicReg(addr, val); return; }
    if (addr >= SYSTICK_BASE && addr < SYSTICK_BASE + 0x10) { this.writeSysTickReg(addr, val); return; }
    if (addr >= SCB_BASE && addr < SCB_BASE + 0x60) { this.writeScbReg(addr, val); return; }
    const off = this.toMemOffset(addr);
    if (off < 0 || off + 3 >= this.memory.length) return;
    this.memory[off] = val & 0xFF;
    this.memory[off + 1] = (val >> 8) & 0xFF;
    this.memory[off + 2] = (val >> 16) & 0xFF;
    this.memory[off + 3] = (val >> 24) & 0xFF;
  }

  private toMemOffset(addr: number): number {
    if (addr >= 0x08000000 && addr < 0x08000000 + this.memory.length) return addr - 0x08000000;
    if (addr >= 0x20000000 && addr < 0x20000000 + this.memory.length) return addr - 0x20000000 + Math.min(this.memory.length - (addr - 0x20000000), 0);
    return -1;
  }

  // ---- SysTick 寄存器 (2.2.7) ----
  private readSysTickReg(addr: number): number {
    switch (addr & 0xF) {
      case 0x0: return this.systickCtrl;
      case 0x4: return this.systickLoad;
      case 0x8: return this.systickVal;
      case 0xC: return this.systickCalib;
      default: return 0;
    }
  }

  private writeSysTickReg(addr: number, val: number): void {
    switch (addr & 0xF) {
      case 0x0: this.systickCtrl = val & 0x7; break;
      case 0x4: this.systickLoad = val & 0xFFFFFF; this.systickVal = this.systickLoad; break;
      case 0x8: this.systickVal = val & 0xFFFFFF; break;
    }
  }

  // ---- SCB 寄存器 ----
  private readScbReg(addr: number): number {
    switch (addr & 0xFF) {
      case 0x04: return (this.exceptionActive.length > 0 ? this.exceptionActive[this.exceptionActive.length - 1] : 0);
      case 0x08: return 0x08000000; // VTOR
      case 0x0C: return (this.nvicPriorityGroup << 8);
      default: return 0;
    }
  }

  private writeScbReg(addr: number, val: number): void {
    switch (addr & 0xFF) {
      case 0x0C: this.nvicPriorityGroup = (val >> 8) & 0x7; break;
    }
  }

  // ---- 外设寄存器视图 (2.4.20) ----
  getPeripheralRegs(): Map<string, Map<string, number>> {
    const groups = new Map<string, Map<string, number>>();
    const nvic = new Map<string, number>();
    nvic.set('ISER0', this.nvicIser[0]); nvic.set('ISPR0', this.nvicIspr[0]);
    nvic.set('IABR0', this.nvicIabr[0]); nvic.set('IPR0', this.nvicIpr[0]);
    groups.set('NVIC', nvic);
    const stk = new Map<string, number>();
    stk.set('CTRL', this.systickCtrl); stk.set('LOAD', this.systickLoad);
    stk.set('VAL', this.systickVal); stk.set('CALIB', this.systickCalib);
    groups.set('SysTick', stk);
    const scb = new Map<string, number>();
    scb.set('VTOR', this.readMem32(SCB_VTOR)); scb.set('AIRCR', this.readMem32(SCB_AIRCR));
    scb.set('SHCSR', 0); scb.set('CFSR', 0); scb.set('HFSR', 0);
    groups.set('SCB', scb);
    return groups;
  }

  // ---- 公共接口 ----

  getRegisters(): Map<string, number> {
    const r = copyNumberMap(this.regs);
    r.set('PC', this.pc); r.set('SP', this.sp); r.set('LR', this.lr);
    r.set('xPSR', this.specialRegs.get(XPSR) ?? 0);
    r.set('PRIMASK', this.specialRegs.get(PRIMASK) ?? 0);
    r.set('CONTROL', this.specialRegs.get(CONTROL) ?? 0);
    return r;
  }

  getPc(): number { return this.pc; }
  getMemory(): Uint8Array { return this.memory; }
  getCallStack(): number[] { return this.callStack.slice(); }
  getLastError(): ErrCode { return this.lastError; }

  // ---- 原有方法 ----
  private syncRegs(): void {
    this.regs.set('R13', this.sp); this.regs.set('R14', this.lr); this.regs.set('R15', this.pc);
  }

  private reg(n: number): number { return this.regs.get(`R${n}`) ?? 0; }
  private setReg(n: number, v: number): void {
    this.regs.set(`R${n}`, v >>> 0);
    if (n === 13) this.sp = v;
    if (n === 14) this.lr = v;
    if (n === 15) this.pc = v;
  }

  private bCond(hw: number): void {
    const cond = (hw >> 8) & 0xF;
    const offset8 = hw & 0xFF;
    const rel = offset8 >= 128 ? offset8 - 256 : offset8;
    if (this.evalCond(cond)) this.pc += rel * 2;
    this.pc += 2;
  }

  private evalCond(cond: number): boolean {
    switch (cond) {
      case 0x0: return false; case 0x1: return true;
      case 0xE: return true;
      default: return true;
    }
  }

  private ldrLit(hw: number): void {
    const rt = (hw >> 8) & 0x7; const imm = hw & 0xFF;
    this.setReg(rt, this.readMem32(this.pc + 4 + imm * 4));
    this.pc += 2;
  }

  private movReg(hw: number): void { this.setReg((hw >> 3) & 0x7, this.reg((hw >> 6) & 0x7)); this.pc += 2; }
  private movImm(hw: number): void { this.setReg((hw >> 8) & 0x7, hw & 0xFF); this.pc += 2; }

  private strImm(hw: number): void {
    this.writeMem32(this.reg((hw >> 3) & 0x7) + ((hw >> 6) & 0x1F) * 4, this.reg(hw & 0x7));
    this.pc += 2;
  }

  private ldrImm(hw: number): void {
    this.setReg(hw & 0x7, this.readMem32(this.reg((hw >> 3) & 0x7) + ((hw >> 6) & 0x1F) * 4));
    this.pc += 2;
  }

  private pushLr(hw: number): void {
    this.callStack.push(this.pc + 2); this.sp -= 4;
    this.writeMem32(this.sp, this.lr);
    this.pc += 2;
  }

  private popPc(hw: number): void {
    const val = this.readMem32(this.sp); this.sp += 4;
    this.pc = val & 0xFFFFFFFE;
    if (this.callStack.length > 0) this.callStack.pop();
  }

  private subReg(hw: number): void {
    this.setReg(hw & 0x7, (this.reg(hw & 0x7) - this.reg((hw >> 3) & 0x7)) >>> 0);
    this.pc += 2;
  }

  private andReg(hw: number): void {
    this.setReg(hw & 0x7, this.reg(hw & 0x7) & this.reg((hw >> 3) & 0x7));
    this.pc += 2;
  }

  private orrReg(hw: number): void {
    this.setReg(hw & 0x7, this.reg(hw & 0x7) | this.reg((hw >> 3) & 0x7));
    this.pc += 2;
  }

  private cmpImm(hw: number): void {
    const rn = (hw >> 8) & 0x7;
    const result = this.reg(rn) - (hw & 0xFF);
    // 更新标志 (简化: 仅跟踪零标志)
    this.specialRegs.set(APSR, result === 0 ? (1 << 30) : 0); // Z flag = bit 30
    this.pc += 2;
  }

  private decode32Bit(hw: number, hw2: number): void {
    if ((hw & 0xF800) === 0xF000 && (hw2 & 0xD000) === 0xD000) {
      const s = (hw >> 10) & 1; const j1 = (hw2 >> 13) & 1; const j2 = (hw2 >> 11) & 1;
      const i1 = j1 !== s; const i2 = j2 !== s;
      const imm10 = hw & 0x3FF; const imm11 = hw2 & 0x7FF;
      let offset = (s << 24) | ((i1 ? 1 : 0) << 23) | ((i2 ? 1 : 0) << 22) | (imm10 << 12) | (imm11 << 1);
      if (s) offset |= 0xFE000000;
      this.lr = (this.pc + 4) | 1;
      this.callStack.push(this.pc + 4);
      this.pc = ((this.pc + 4 + offset) & 0xFFFFFFFE) >>> 0;
    } else {
      this.pc += 4;
    }
  }
}
