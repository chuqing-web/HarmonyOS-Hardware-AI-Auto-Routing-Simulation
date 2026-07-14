import { ErrCode, ResultHelper } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ApiResult } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
const PROTO_MAGIC = [0x51, 0x45, 0x4D, 0x55];
const CMD_REG_READ = 0x01;
const CMD_REG_WRITE = 0x02;
const CMD_MEM_READ = 0x03;
const CMD_MEM_WRITE = 0x04;
const CMD_STEP = 0x05;
const CMD_GET_STATE = 0x06;
const CMD_RESET = 0x07;
const CMD_INTERRUPT = 0x08;
const IPC_TIMEOUT_MS = 5000;
const MAX_PAYLOAD_LEN = 4096;
const PERIPH_BASE = 0x40000000;
const APB2_BASE = 0x40010000;
const APB1_BASE = 0x40000000;
const AHB_BASE = 0x40018000;
const GPIOA_BASE = 0x40010800;
const GPIOB_BASE = 0x40010C00;
const GPIOC_BASE = 0x40011000;
const GPIOD_BASE = 0x40011400;
const GPIOE_BASE = 0x40011800;
const RCC_BASE = 0x40021000;
const USART1_BASE = 0x40013800;
const USART2_BASE = 0x40004400;
const USART3_BASE = 0x40004800;
const TIM1_BASE = 0x40012C00;
const TIM2_BASE = 0x40000000;
const TIM3_BASE = 0x40000400;
const TIM4_BASE = 0x40000800;
const ADC1_BASE = 0x40012400;
const ADC2_BASE = 0x40012800;
const NVIC_BASE = 0xE000E100;
const SCB_BASE = 0xE000ED00;
const FLASH_BASE = 0x08000000;
const SRAM_BASE = 0x20000000;
const GPIO_CRL = 0x00;
const GPIO_CRH = 0x04;
const GPIO_IDR = 0x08;
const GPIO_ODR = 0x0C;
const GPIO_BSRR = 0x10;
const GPIO_BRR = 0x14;
const GPIO_LCKR = 0x18;
const RCC_CR = 0x00;
const RCC_CFGR = 0x04;
const RCC_CIR = 0x08;
const RCC_APB2RSTR = 0x0C;
const RCC_APB1RSTR = 0x10;
const RCC_AHBENR = 0x14;
const RCC_APB2ENR = 0x18;
const RCC_APB1ENR = 0x1C;
const RCC_BDCR = 0x20;
const RCC_CSR = 0x24;
const USART_SR = 0x00;
const USART_DR = 0x04;
const USART_BRR = 0x08;
const USART_CR1 = 0x0C;
const USART_CR2 = 0x10;
const USART_CR3 = 0x14;
const USART_GTPR = 0x18;
const TIM_CR1 = 0x00;
const TIM_CR2 = 0x04;
const TIM_SMCR = 0x08;
const TIM_DIER = 0x0C;
const TIM_SR = 0x10;
const TIM_EGR = 0x14;
const TIM_CCMR1 = 0x18;
const TIM_CCMR2 = 0x1C;
const TIM_CCER = 0x20;
const TIM_CNT = 0x24;
const TIM_PSC = 0x28;
const TIM_ARR = 0x2C;
const TIM_CCR1 = 0x34;
const TIM_CCR2 = 0x38;
const TIM_CCR3 = 0x3C;
const TIM_CCR4 = 0x40;
export interface QemuMcuState {
    running: boolean;
    pc: number;
    gpioRegs: Map<number, number>;
    adcRegs: Map<number, number>;
}
interface IpcMessage {
    command: number;
    payload: Uint8Array;
}
export class QemuMcuBridge {
    private state: QemuMcuState;
    private processHandle: number = -1;
    private firmware: Uint8Array = new Uint8Array(0);
    private machine: string = 'stm32f103';
    private periphRegs: Map<number, number> = new Map();
    private sram: Uint8Array = new Uint8Array(20 * 1024);
    private lastCommandTime: number = 0;
    private connected: boolean = false;
    constructor() {
        this.state = {
            running: false,
            pc: FLASH_BASE,
            gpioRegs: new Map(),
            adcRegs: new Map()
        };
    }
    private buildFrame(e475: number, f475: Uint8Array): Uint8Array {
        const g475 = 8 + f475.length;
        const h475 = new Uint8Array(g475);
        h475[0] = PROTO_MAGIC[0];
        h475[1] = PROTO_MAGIC[1];
        h475[2] = PROTO_MAGIC[2];
        h475[3] = PROTO_MAGIC[3];
        h475[4] = e475;
        h475[5] = (f475.length >> 8) & 0xFF;
        h475[6] = f475.length & 0xFF;
        h475.set(f475, 7);
        h475[g475 - 1] = this.crc8(h475.subarray(0, g475 - 1));
        return h475;
    }
    private parseFrame(a475: Uint8Array): IpcMessage | null {
        if (a475.length < 8)
            return null;
        if (a475[0] !== PROTO_MAGIC[0] || a475[1] !== PROTO_MAGIC[1] ||
            a475[2] !== PROTO_MAGIC[2] || a475[3] !== PROTO_MAGIC[3]) {
            return null;
        }
        const b475 = (a475[5] << 8) | a475[6];
        if (b475 > MAX_PAYLOAD_LEN)
            return null;
        const c475 = a475[7 + b475];
        const d475 = this.crc8(a475.subarray(0, 7 + b475));
        if (c475 !== d475)
            return null;
        return {
            command: a475[4],
            payload: a475.subarray(7, 7 + b475)
        };
    }
    private crc8(w474: Uint8Array): number {
        let x474 = 0;
        for (let y474 = 0; y474 < w474.length; y474++) {
            x474 ^= w474[y474];
            for (let z474 = 0; z474 < 8; z474++) {
                if (x474 & 0x80) {
                    x474 = ((x474 << 1) ^ 0x07) & 0xFF;
                }
                else {
                    x474 = (x474 << 1) & 0xFF;
                }
            }
        }
        return x474;
    }
    private packU32(t474: number, u474: Uint8Array, v474: number): void {
        u474[v474] = (t474 >> 24) & 0xFF;
        u474[v474 + 1] = (t474 >> 16) & 0xFF;
        u474[v474 + 2] = (t474 >> 8) & 0xFF;
        u474[v474 + 3] = t474 & 0xFF;
    }
    private packU16(q474: number, r474: Uint8Array, s474: number): void {
        r474[s474] = (q474 >> 8) & 0xFF;
        r474[s474 + 1] = q474 & 0xFF;
    }
    private unpackU32(o474: Uint8Array, p474: number): number {
        return ((o474[p474] << 24) | (o474[p474 + 1] << 16) |
            (o474[p474 + 2] << 8) | o474[p474 + 3]) >>> 0;
    }
    start(m474: string, n474: string = 'stm32f103'): ApiResult<void> {
        if (m474.length === 0) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'firmware path empty');
        }
        this.machine = n474;
        this.state.running = true;
        this.state.pc = FLASH_BASE;
        this.processHandle = Date.now();
        this.connected = true;
        this.lastCommandTime = Date.now();
        this.initPeripheralResetState();
        return ResultHelper.ok();
    }
    loadFirmware(l474: Uint8Array): void {
        this.firmware = new Uint8Array(l474);
    }
    step(j474: number = 1): ApiResult<number> {
        if (!this.state.running) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'QEMU not running');
        }
        for (let k474 = 0; k474 < j474; k474++) {
            this.executeOneInstruction();
        }
        this.lastCommandTime = Date.now();
        return ResultHelper.ok(this.state.pc);
    }
    regRead(g474: number): ApiResult<number> {
        const h474 = new Uint8Array(4);
        this.packU32(g474, h474, 0);
        const i474 = this.readPeriphInternal(g474);
        this.lastCommandTime = Date.now();
        return ResultHelper.ok(i474);
    }
    regWrite(e474: number, f474: number): ApiResult<void> {
        this.writePeriphInternal(e474, f474);
        this.lastCommandTime = Date.now();
        return ResultHelper.ok();
    }
    memRead(a474: number, b474: number): ApiResult<Uint8Array> {
        const c474 = new Uint8Array(b474);
        for (let d474 = 0; d474 < b474; d474++) {
            c474[d474] = this.readByte(a474 + d474);
        }
        this.lastCommandTime = Date.now();
        return ResultHelper.ok(c474);
    }
    memWrite(x473: number, y473: Uint8Array): ApiResult<void> {
        for (let z473 = 0; z473 < y473.length; z473++) {
            this.writeByte(x473 + z473, y473[z473]);
        }
        this.lastCommandTime = Date.now();
        return ResultHelper.ok();
    }
    sendInterrupt(u473: number): ApiResult<void> {
        const v473 = NVIC_BASE + 0x00 + (u473 >> 5) * 4;
        const w473 = this.readPeriphInternal(v473);
        this.writePeriphInternal(v473, w473 | (1 << (u473 & 0x1F)));
        this.lastCommandTime = Date.now();
        return ResultHelper.ok();
    }
    isConnectionAlive(): boolean {
        return this.connected && (Date.now() - this.lastCommandTime) < IPC_TIMEOUT_MS;
    }
    readPeriph(t473: number): number {
        return this.readPeriphInternal(t473);
    }
    writePeriph(r473: number, s473: number): void {
        this.writePeriphInternal(r473, s473);
    }
    syncGpioToSpice(p473: number, q473: number): number {
        return q473 > 0.5 ? 3.3 : 0;
    }
    syncSpiceToAdc(m473: number, n473: number): number {
        const o473 = Math.round((n473 / 3.3) * 4095);
        this.state.adcRegs.set(0x4001244C + m473 * 4, o473);
        this.writePeriphInternal(ADC1_BASE + 0x4C + m473 * 4, o473);
        return o473;
    }
    stop(): void {
        this.state.running = false;
        this.processHandle = -1;
        this.connected = false;
    }
    isRunning(): boolean { return this.state.running && this.isConnectionAlive(); }
    getPc(): number { return this.state.pc; }
    getState(): QemuMcuState { return this.state; }
    private readPeriphInternal(l473: number): number {
        if (this.periphRegs.has(l473))
            return this.periphRegs.get(l473)!;
        if (l473 >= GPIOA_BASE && l473 < GPIOE_BASE + 0x400) {
            return this.readGpioReg(l473);
        }
        return 0;
    }
    private writePeriphInternal(j473: number, k473: number): void {
        this.periphRegs.set(j473, k473);
        if (j473 >= GPIOA_BASE && j473 < GPIOE_BASE + 0x400) {
            this.writeGpioReg(j473, k473);
        }
        if (this.isGpioBsrr(j473)) {
            this.applyBsrr(j473, k473);
        }
        if (this.isGpioBrr(j473)) {
            this.applyBrr(j473, k473);
        }
    }
    private readByte(i473: number): number {
        if (i473 >= FLASH_BASE && i473 < FLASH_BASE + this.firmware.length) {
            return this.firmware[i473 - FLASH_BASE];
        }
        if (i473 >= SRAM_BASE && i473 < SRAM_BASE + this.sram.length) {
            return this.sram[i473 - SRAM_BASE];
        }
        return 0;
    }
    private writeByte(g473: number, h473: number): void {
        if (g473 >= SRAM_BASE && g473 < SRAM_BASE + this.sram.length) {
            this.sram[g473 - SRAM_BASE] = h473 & 0xFF;
        }
    }
    private readGpioReg(b473: number): number {
        const c473 = b473 & 0x3FF;
        if (this.periphRegs.has(b473))
            return this.periphRegs.get(b473)!;
        if (c473 === GPIO_IDR) {
            let d473 = 0;
            this.state.gpioRegs.forEach((e473: number, f473: number) => {
                if (f473 >= b473 - GPIO_IDR && f473 < b473 - GPIO_IDR + 4) {
                }
            });
            return 0;
        }
        return this.periphRegs.get(b473) ?? 0;
    }
    private writeGpioReg(w472: number, x472: number): void {
        this.periphRegs.set(w472, x472);
        const y472 = w472 & 0xFFFFFC00;
        const z472 = w472 & 0x3FF;
        if (z472 === GPIO_ODR) {
            for (let a473 = 0; a473 < 16; a473++) {
                this.state.gpioRegs.set(y472 + a473, (x472 >> a473) & 1);
            }
        }
    }
    private isGpioBsrr(v472: number): boolean {
        return (v472 & 0x3FF) === GPIO_BSRR;
    }
    private applyBsrr(p472: number, q472: number): void {
        const r472 = p472 & 0xFFFFFC00;
        const s472 = r472 + GPIO_ODR;
        let t472 = this.periphRegs.get(s472) ?? 0;
        for (let u472 = 0; u472 < 16; u472++) {
            if (q472 & (1 << u472)) {
                t472 |= (1 << u472);
            }
            if (q472 & (1 << (u472 + 16))) {
                t472 &= ~(1 << u472);
            }
        }
        this.writePeriphInternal(s472, t472);
    }
    private isGpioBrr(o472: number): boolean {
        return (o472 & 0x3FF) === GPIO_BRR;
    }
    private applyBrr(j472: number, k472: number): void {
        const l472 = j472 & 0xFFFFFC00;
        const m472 = l472 + GPIO_ODR;
        let n472 = this.periphRegs.get(m472) ?? 0;
        n472 &= ~k472;
        this.writePeriphInternal(m472, n472);
    }
    private executeOneInstruction(): void {
        const z471 = this.state.pc;
        if (z471 < FLASH_BASE || z471 >= FLASH_BASE + this.firmware.length) {
            this.state.running = false;
            return;
        }
        const a472 = z471 - FLASH_BASE;
        if (a472 + 1 >= this.firmware.length) {
            this.state.running = false;
            return;
        }
        const b472 = (this.firmware[a472] | (this.firmware[a472 + 1] << 8));
        const c472 = (b472 >> 11) & 0x1F;
        let d472 = z471 + 2;
        if (c472 === 0x00) {
            d472 = z471 + 2;
        }
        else if (c472 === 0x01 || c472 === 0x02 || c472 === 0x03) {
            d472 = z471 + 2;
        }
        else if (c472 === 0x08) {
            d472 = z471 + 2;
        }
        else if (c472 === 0x09 || c472 === 0x0A || c472 === 0x0B) {
            d472 = z471 + 2;
        }
        else if ((b472 & 0xF000) === 0xD000) {
            const g472 = (b472 >> 8) & 0x0F;
            if (g472 !== 0x0F) {
                const h472 = (b472 & 0xFF);
                const i472 = h472 >= 0x80 ? h472 - 256 : h472;
                d472 = z471 + 4 + i472 * 2;
            }
        }
        else if ((b472 & 0xF800) === 0xE000) {
            const e472 = b472 & 0x7FF;
            const f472 = e472 >= 0x400 ? e472 - 2048 : e472;
            d472 = z471 + 4 + f472 * 2;
        }
        else if ((b472 & 0xF800) === 0xF000 || (b472 & 0xF800) === 0xF800) {
            if (a472 + 3 < this.firmware.length) {
                d472 = z471 + 4;
            }
        }
        this.state.pc = d472;
        this.tickSysTick();
    }
    private tickSysTick(): void {
        const w471 = this.periphRegs.get(0xE000E010) ?? 0;
        if (w471 & 1) {
            let x471 = this.periphRegs.get(0xE000E018) ?? 0;
            x471--;
            if (x471 <= 0) {
                const y471 = this.periphRegs.get(0xE000E014) ?? 0;
                x471 = y471;
                this.periphRegs.set(0xE000E010, (w471 | 0x10000));
            }
            this.periphRegs.set(0xE000E018, x471);
        }
    }
    private initPeripheralResetState(): void {
        this.periphRegs.clear();
        this.state.gpioRegs.clear();
        this.periphRegs.set(RCC_BASE + RCC_CR, 0x00000083);
        this.periphRegs.set(RCC_BASE + RCC_CFGR, 0x00000000);
        const p471 = [GPIOA_BASE, GPIOB_BASE, GPIOC_BASE, GPIOD_BASE, GPIOE_BASE];
        for (const v471 of p471) {
            this.periphRegs.set(v471 + GPIO_CRL, 0x44444444);
            this.periphRegs.set(v471 + GPIO_CRH, 0x44444444);
            this.periphRegs.set(v471 + GPIO_ODR, 0x00000000);
            this.periphRegs.set(v471 + GPIO_IDR, 0x00000000);
        }
        const q471 = [USART1_BASE, USART2_BASE, USART3_BASE];
        for (const u471 of q471) {
            this.periphRegs.set(u471 + USART_SR, 0x000000C0);
            this.periphRegs.set(u471 + USART_CR1, 0x00000000);
        }
        const r471 = [TIM1_BASE, TIM2_BASE, TIM3_BASE, TIM4_BASE];
        for (const t471 of r471) {
            this.periphRegs.set(t471 + TIM_CR1, 0x00000000);
            this.periphRegs.set(t471 + TIM_CNT, 0x00000000);
            this.periphRegs.set(t471 + TIM_PSC, 0x00000000);
            this.periphRegs.set(t471 + TIM_ARR, 0x0000FFFF);
            this.periphRegs.set(t471 + TIM_SR, 0x00000000);
        }
        for (const s471 of [ADC1_BASE, ADC2_BASE]) {
            this.periphRegs.set(s471 + 0x00, 0x00000000);
            this.periphRegs.set(s471 + 0x04, 0x00000000);
            this.periphRegs.set(s471 + 0x08, 0x00000000);
        }
        this.periphRegs.set(0xE000E010, 0x00000000);
        this.periphRegs.set(0xE000E014, 0x00000000);
        this.periphRegs.set(0xE000E018, 0x00000000);
        this.periphRegs.set(SCB_BASE + 0x0C, 0x00000000);
    }
}
