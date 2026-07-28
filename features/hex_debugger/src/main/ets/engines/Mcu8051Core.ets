/**
 * 8051 指令级仿真核心 — HEX 调试器版（委托 Mcu8051Engine）
 */
import { copyNumberMap, ErrCode, Mcu8051Engine, Mcu8051State } from 'common';

export class Mcu8051Core {
  private state: Mcu8051State;

  constructor(memorySize: number = 65536) {
    this.state = Mcu8051Engine.createState();
    if (memorySize !== 65536) {
      this.state.memory = new Uint8Array(memorySize);
    }
  }

  loadProgram(data: Uint8Array, offset: number = 0): void {
    for (let i = 0; i < data.length; i++) {
      if (offset + i < this.state.memory.length) {
        this.state.memory[offset + i] = data[i];
      }
    }
  }

  reset(): void {
    Mcu8051Engine.reset(this.state);
  }

  step(): boolean {
    return Mcu8051Engine.step(this.state);
  }

  getRegisters(): Map<string, number> {
    const result = copyNumberMap(this.state.regs);
    result.set('PC', this.state.pc);
    result.set('P0', this.state.sfr.get(0x80) ?? 0xFF);
    result.set('P1', this.state.sfr.get(0x90) ?? 0xFF);
    result.set('P2', this.state.sfr.get(0xA0) ?? 0xFF);
    result.set('P3', this.state.sfr.get(0xB0) ?? 0xFF);
    result.set('TH0', this.state.sfr.get(0x8C) ?? 0);
    result.set('TL0', this.state.sfr.get(0x8A) ?? 0);
    result.set('TH1', this.state.sfr.get(0x8D) ?? 0);
    result.set('TL1', this.state.sfr.get(0x8B) ?? 0);
    result.set('TCON', this.state.sfr.get(0x88) ?? 0);
    result.set('TMOD', this.state.sfr.get(0x89) ?? 0);
    result.set('SCON', this.state.sfr.get(0x98) ?? 0);
    result.set('SBUF', this.state.sfr.get(0x99) ?? 0);
    result.set('IE', this.state.sfr.get(0xA8) ?? 0);
    result.set('IP', this.state.sfr.get(0xB8) ?? 0);
    const dpl = this.state.regs.get('DPL') ?? 0;
    const dph = this.state.regs.get('DPH') ?? 0;
    result.set('DPTR', ((dph << 8) | dpl) & 0xFFFF);
    return result;
  }

  getPc(): number { return this.state.pc; }
  getMemory(): Uint8Array { return this.state.memory; }
  getUartOutput(): string { return this.state.uartTx; }
  getLastError(): ErrCode { return this.state.lastError; }
  appendUart(char: string): void { this.state.uartTx += char; }

  getPinLevel(pin: string): number {
    if (this.state.pinLevels.has(pin)) return this.state.pinLevels.get(pin) ?? 0;
    const parts = pin.split('.');
    if (parts.length === 2) {
      const port = parts[0];
      const bit = parseInt(parts[1]);
      const portAddr = port === 'P1' ? 0x90 : port === 'P0' ? 0x80 : port === 'P2' ? 0xA0 : 0xB0;
      const val = this.state.sfr.get(portAddr) ?? 0xFF;
      return (val >> bit) & 1;
    }
    return this.state.pinLevels.get(pin) ?? 0;
  }

  setPinLevel(pin: string, level: number): void {
    this.state.pinLevels.set(pin, level);
  }
}
