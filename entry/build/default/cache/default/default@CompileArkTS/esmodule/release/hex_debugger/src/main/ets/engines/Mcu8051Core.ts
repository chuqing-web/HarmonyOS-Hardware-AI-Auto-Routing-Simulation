import { copyNumberMap, Mcu8051Engine } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ErrCode, Mcu8051State } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
export class Mcu8051Core {
    private state: Mcu8051State;
    constructor(e375: number = 65536) {
        this.state = Mcu8051Engine.createState();
        if (e375 !== 65536) {
            this.state.memory = new Uint8Array(e375);
        }
    }
    loadProgram(b375: Uint8Array, c375: number = 0): void {
        for (let d375 = 0; d375 < b375.length; d375++) {
            if (c375 + d375 < this.state.memory.length) {
                this.state.memory[c375 + d375] = b375[d375];
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
        const a375 = copyNumberMap(this.state.regs);
        a375.set('PC', this.state.pc);
        a375.set('P1', this.state.sfr.get(0x90) ?? 0xFF);
        return a375;
    }
    getPc(): number { return this.state.pc; }
    getMemory(): Uint8Array { return this.state.memory; }
    getUartOutput(): string { return this.state.uartTx; }
    getLastError(): ErrCode { return this.state.lastError; }
    appendUart(z374: string): void { this.state.uartTx += z374; }
    getPinLevel(t374: string): number {
        if (this.state.pinLevels.has(t374))
            return this.state.pinLevels.get(t374) ?? 0;
        const u374 = t374.split('.');
        if (u374.length === 2) {
            const v374 = u374[0];
            const w374 = parseInt(u374[1]);
            const x374 = v374 === 'P1' ? 0x90 : v374 === 'P0' ? 0x80 : v374 === 'P2' ? 0xA0 : 0xB0;
            const y374 = this.state.sfr.get(x374) ?? 0xFF;
            return (y374 >> w374) & 1;
        }
        return this.state.pinLevels.get(t374) ?? 0;
    }
    setPinLevel(r374: string, s374: number): void {
        this.state.pinLevels.set(r374, s374);
    }
}
