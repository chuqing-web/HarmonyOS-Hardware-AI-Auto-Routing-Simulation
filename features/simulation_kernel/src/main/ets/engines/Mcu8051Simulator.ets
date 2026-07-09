/**
 * 8051 指令级仿真核心 — 委托 Mcu8051Engine 共享引擎
 */
import { copyNumberMap, ErrCode, Mcu8051Engine, Mcu8051State } from 'common';

export class Mcu8051Simulator {
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
    return result;
  }

  getPc(): number { return this.state.pc; }
  getMemory(): Uint8Array { return this.state.memory; }
  getUartOutput(): string { return this.state.uartTx; }
  getLastError(): ErrCode { return this.state.lastError; }

  getPinLevel(port: string, bit: number): number {
    const key = `${port}.${bit}`;
    if (this.state.pinLevels.has(key)) return this.state.pinLevels.get(key) ?? 0;
    const portAddr = port === 'P1' ? 0x90 : port === 'P0' ? 0x80 : port === 'P2' ? 0xA0 : 0xB0;
    const val = this.state.sfr.get(portAddr) ?? 0xFF;
    return (val >> bit) & 1;
  }

  setPinLevel(port: string, bit: number, level: number): void {
    const key = `${port}.${bit}`;
    this.state.pinLevels.set(key, level);
    const portAddr = port === 'P1' ? 0x90 : port === 'P0' ? 0x80 : port === 'P2' ? 0xA0 : 0xB0;
    let val = this.state.sfr.get(portAddr) ?? 0xFF;
    if (level > 0) val |= (1 << bit);
    else val &= ~(1 << bit);
    this.state.sfr.set(portAddr, val & 0xFF);
  }
}
