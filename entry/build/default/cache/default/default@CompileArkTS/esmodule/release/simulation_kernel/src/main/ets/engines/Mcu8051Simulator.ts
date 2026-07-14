import { copyNumberMap, Mcu8051Engine } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ErrCode, Mcu8051State } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
export class Mcu8051Simulator {
    private state: Mcu8051State;
    constructor(o471: number = 65536) {
        this.state = Mcu8051Engine.createState();
        if (o471 !== 65536) {
            this.state.memory = new Uint8Array(o471);
        }
    }
    loadProgram(l471: Uint8Array, m471: number = 0): void {
        for (let n471 = 0; n471 < l471.length; n471++) {
            if (m471 + n471 < this.state.memory.length) {
                this.state.memory[m471 + n471] = l471[n471];
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
        const k471 = copyNumberMap(this.state.regs);
        k471.set('PC', this.state.pc);
        k471.set('P0', this.state.sfr.get(0x80) ?? 0xFF);
        k471.set('P1', this.state.sfr.get(0x90) ?? 0xFF);
        k471.set('P2', this.state.sfr.get(0xA0) ?? 0xFF);
        k471.set('P3', this.state.sfr.get(0xB0) ?? 0xFF);
        k471.set('TH0', this.state.sfr.get(0x8C) ?? 0);
        k471.set('TL0', this.state.sfr.get(0x8A) ?? 0);
        k471.set('TH1', this.state.sfr.get(0x8D) ?? 0);
        k471.set('TL1', this.state.sfr.get(0x8B) ?? 0);
        k471.set('TCON', this.state.sfr.get(0x88) ?? 0);
        k471.set('TMOD', this.state.sfr.get(0x89) ?? 0);
        k471.set('SCON', this.state.sfr.get(0x98) ?? 0);
        k471.set('SBUF', this.state.sfr.get(0x99) ?? 0);
        k471.set('IE', this.state.sfr.get(0xA8) ?? 0);
        k471.set('IP', this.state.sfr.get(0xB8) ?? 0);
        return k471;
    }
    getPc(): number { return this.state.pc; }
    getMemory(): Uint8Array { return this.state.memory; }
    getUartOutput(): string { return this.state.uartTx; }
    getLastError(): ErrCode { return this.state.lastError; }
    getPinLevel(f471: string, g471: number): number {
        const h471 = `${f471}.${g471}`;
        if (this.state.pinLevels.has(h471))
            return this.state.pinLevels.get(h471) ?? 0;
        const i471 = f471 === 'P1' ? 0x90 : f471 === 'P0' ? 0x80 : f471 === 'P2' ? 0xA0 : 0xB0;
        const j471 = this.state.sfr.get(i471) ?? 0xFF;
        return (j471 >> g471) & 1;
    }
    setPinLevel(z470: string, a471: number, b471: number): void {
        const c471 = `${z470}.${a471}`;
        this.state.pinLevels.set(c471, b471);
        const d471 = z470 === 'P1' ? 0x90 : z470 === 'P0' ? 0x80 : z470 === 'P2' ? 0xA0 : 0xB0;
        let e471 = this.state.sfr.get(d471) ?? 0xFF;
        if (b471 > 0)
            e471 |= (1 << a471);
        else
            e471 &= ~(1 << a471);
        this.state.sfr.set(d471, e471 & 0xFF);
    }
}
