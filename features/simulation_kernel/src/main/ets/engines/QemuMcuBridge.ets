/**
 * QEMU-MCU 桥接 — STM32 外设寄存器同步 + 二进制IPC协议
 * v2.0: 结构化IPC协议 / 完整STM32F103外设寄存器映射 / CRC8校验 / 超时管理
 */
import { ErrCode, ResultHelper, ApiResult, traceUart, formatUartBytesHex } from 'common';

// ---- IPC 协议常量 ----
const PROTO_MAGIC = [0x51, 0x45, 0x4D, 0x55]; // "QEMU"
const CMD_REG_READ    = 0x01;
const CMD_REG_WRITE   = 0x02;
const CMD_MEM_READ    = 0x03;
const CMD_MEM_WRITE   = 0x04;
const CMD_STEP        = 0x05;
const CMD_GET_STATE   = 0x06;
const CMD_RESET       = 0x07;
const CMD_INTERRUPT   = 0x08;

const MAX_PAYLOAD_LEN = 4096;

// ---- STM32F103 外设基地址 ----
const PERIPH_BASE    = 0x40000000;
const APB2_BASE      = 0x40010000;
const APB1_BASE      = 0x40000000;
const AHB_BASE       = 0x40018000;
const GPIOA_BASE     = 0x40010800;
const GPIOB_BASE     = 0x40010C00;
const GPIOC_BASE     = 0x40011000;
const GPIOD_BASE     = 0x40011400;
const GPIOE_BASE     = 0x40011800;
const RCC_BASE       = 0x40021000;
const USART1_BASE    = 0x40013800;
const USART2_BASE    = 0x40004400;
const USART3_BASE    = 0x40004800;
const TIM1_BASE      = 0x40012C00;
const TIM2_BASE      = 0x40000000;
const TIM3_BASE      = 0x40000400;
const TIM4_BASE      = 0x40000800;
const ADC1_BASE      = 0x40012400;
const ADC2_BASE      = 0x40012800;
const NVIC_BASE      = 0xE000E100;
const SCB_BASE       = 0xE000ED00;
const FLASH_BASE     = 0x08000000;
const SRAM_BASE      = 0x20000000;

// ---- GPIO 寄存器偏移 ----
const GPIO_CRL   = 0x00;
const GPIO_CRH   = 0x04;
const GPIO_IDR   = 0x08;
const GPIO_ODR   = 0x0C;
const GPIO_BSRR  = 0x10;
const GPIO_BRR   = 0x14;
const GPIO_LCKR  = 0x18;

// ---- RCC 寄存器偏移 ----
const RCC_CR     = 0x00;
const RCC_CFGR   = 0x04;
const RCC_CIR    = 0x08;
const RCC_APB2RSTR = 0x0C;
const RCC_APB1RSTR = 0x10;
const RCC_AHBENR   = 0x14;
const RCC_APB2ENR  = 0x18;
const RCC_APB1ENR  = 0x1C;
const RCC_BDCR     = 0x20;
const RCC_CSR      = 0x24;

// ---- USART 寄存器偏移 ----
const USART_SR   = 0x00;
const USART_DR   = 0x04;
const USART_BRR  = 0x08;
const USART_CR1  = 0x0C;
const USART_CR2  = 0x10;
const USART_CR3  = 0x14;
const USART_GTPR = 0x18;

// ---- TIM 寄存器偏移 ----
const TIM_CR1   = 0x00;
const TIM_CR2   = 0x04;
const TIM_SMCR  = 0x08;
const TIM_DIER  = 0x0C;
const TIM_SR    = 0x10;
const TIM_EGR   = 0x14;
const TIM_CCMR1 = 0x18;
const TIM_CCMR2 = 0x1C;
const TIM_CCER  = 0x20;
const TIM_CNT   = 0x24;
const TIM_PSC   = 0x28;
const TIM_ARR   = 0x2C;
const TIM_CCR1  = 0x34;
const TIM_CCR2  = 0x38;
const TIM_CCR3  = 0x3C;
const TIM_CCR4  = 0x40;

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
  private sram: Uint8Array = new Uint8Array(20 * 1024); // 20KB SRAM
  private lastCommandTime: number = 0;
  private connected: boolean = false;
  /** R0–R12, SP(R13), LR(R14), PC mirrored in state.pc */
  private regs: number[] = new Array<number>(16).fill(0);
  private zFlag: boolean = false;
  private uartTxPend: number[] = [];
  private uartRxQueue: number[] = [];
  private usartTxBusyLeft: number = 0;

  constructor() {
    this.state = {
      running: false,
      pc: FLASH_BASE,
      gpioRegs: new Map(),
      adcRegs: new Map()
    };
  }

  // ---- IPC 协议编码 ----

  /** 构建二进制IPC消息帧 */
  private buildFrame(command: number, payload: Uint8Array): Uint8Array {
    const totalLen = 8 + payload.length;
    const frame = new Uint8Array(totalLen);
    frame[0] = PROTO_MAGIC[0];
    frame[1] = PROTO_MAGIC[1];
    frame[2] = PROTO_MAGIC[2];
    frame[3] = PROTO_MAGIC[3];
    frame[4] = command;
    frame[5] = (payload.length >> 8) & 0xFF;
    frame[6] = payload.length & 0xFF;
    frame.set(payload, 7);
    frame[totalLen - 1] = this.crc8(frame.subarray(0, totalLen - 1));
    return frame;
  }

  /** 解析IPC响应帧 */
  private parseFrame(data: Uint8Array): IpcMessage | null {
    if (data.length < 8) return null;
    if (data[0] !== PROTO_MAGIC[0] || data[1] !== PROTO_MAGIC[1] ||
        data[2] !== PROTO_MAGIC[2] || data[3] !== PROTO_MAGIC[3]) {
      return null;
    }
    const payloadLen = (data[5] << 8) | data[6];
    if (payloadLen > MAX_PAYLOAD_LEN) return null;
    const expectedCrc = data[7 + payloadLen];
    const actualCrc = this.crc8(data.subarray(0, 7 + payloadLen));
    if (expectedCrc !== actualCrc) return null;
    return {
      command: data[4],
      payload: data.subarray(7, 7 + payloadLen)
    };
  }

  /** CRC-8 (polynomial 0x07, ITU-T) */
  private crc8(data: Uint8Array): number {
    let crc = 0;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let bit = 0; bit < 8; bit++) {
        if (crc & 0x80) {
          crc = ((crc << 1) ^ 0x07) & 0xFF;
        } else {
          crc = (crc << 1) & 0xFF;
        }
      }
    }
    return crc;
  }

  // ---- 命令编码辅助 ----

  private packU32(val: number, dst: Uint8Array, offset: number): void {
    dst[offset] = (val >> 24) & 0xFF;
    dst[offset + 1] = (val >> 16) & 0xFF;
    dst[offset + 2] = (val >> 8) & 0xFF;
    dst[offset + 3] = val & 0xFF;
  }

  private packU16(val: number, dst: Uint8Array, offset: number): void {
    dst[offset] = (val >> 8) & 0xFF;
    dst[offset + 1] = val & 0xFF;
  }

  private unpackU32(src: Uint8Array, offset: number): number {
    return ((src[offset] << 24) | (src[offset + 1] << 16) |
            (src[offset + 2] << 8) | src[offset + 3]) >>> 0;
  }

  // ---- 公共接口 ----

  start(firmwarePath: string, machine: string = 'stm32f103'): ApiResult<void> {
    if (firmwarePath.length === 0) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'firmware path empty');
    }
    this.machine = machine;
    this.state.running = true;
    this.state.pc = FLASH_BASE;
    this.processHandle = Date.now();
    this.connected = true;
    this.lastCommandTime = Date.now();
    this.uartTxPend = [];
    this.uartRxQueue = [];
    this.usartTxBusyLeft = 0;
    this.zFlag = false;
    this.initPeripheralResetState();
    this.applyResetVector();
    return ResultHelper.ok();
  }

  /** Host UART terminal TX → MCU USART1 RX (RXNE + DR). */
  injectUsartRx(bytes: number[]): void {
    for (let i = 0; i < bytes.length; i++) {
      this.uartRxQueue.push(bytes[i] & 0xFF);
    }
    this.refreshUsartRxne(USART1_BASE);
    const sr = this.periphRegs.get(USART1_BASE + USART_SR) ?? 0;
    const dr = this.periphRegs.get(USART1_BASE + USART_DR) ?? 0;
    traceUart('QEMU_RX_QUEUE',
      `pushed=${bytes.length} qLen=${this.uartRxQueue.length} ` +
      `SR=0x${(sr >>> 0).toString(16)} RXNE=${((sr >> 5) & 1)} DR=0x${(dr & 0xFF).toString(16)} ` +
      `hex=${formatUartBytesHex(bytes)}`);
  }

  /** 加载固件二进制到Flash */
  loadFirmware(data: Uint8Array): void {
    this.firmware = new Uint8Array(data);
    this.applyResetVector();
  }

  /** Cortex-M vector table: MSP @ flash+0, Reset @ flash+4 */
  private applyResetVector(): void {
    for (let i = 0; i < 16; i++) {
      this.regs[i] = 0;
    }
    if (this.firmware.length < 8) {
      this.state.pc = FLASH_BASE;
      this.regs[15] = this.state.pc;
      return;
    }
    const msp = this.readU32Flash(0);
    if (msp >= SRAM_BASE && msp < SRAM_BASE + this.sram.length + 0x1000) {
      this.regs[13] = msp >>> 0;
    } else {
      this.regs[13] = SRAM_BASE + 0x1000;
    }
    const reset = this.readU32Flash(4);
    if (reset >= FLASH_BASE && reset < FLASH_BASE + 0x200000) {
      this.state.pc = reset & 0xFFFFFFFE;
    } else {
      this.state.pc = FLASH_BASE;
    }
    this.regs[15] = this.state.pc;
  }

  /** Drain pending USART TX bytes since last call (for Worker/UI frame). */
  drainUartTx(): number[] {
    if (this.uartTxPend.length === 0) {
      return [];
    }
    const out = this.uartTxPend.slice();
    this.uartTxPend = [];
    return out;
  }

  getUartOutput(): string {
    return this.uartTxPend.map((b: number) => String.fromCharCode(b & 0xFF)).join('');
  }

  private readU32Flash(offset: number): number {
    if (offset + 3 >= this.firmware.length) {
      return 0;
    }
    return (this.firmware[offset] | (this.firmware[offset + 1] << 8) |
      (this.firmware[offset + 2] << 16) | (this.firmware[offset + 3] << 24)) >>> 0;
  }

  /** 单步/多步执行，返回新的 PC */
  step(cycles: number = 1): ApiResult<number> {
    if (!this.state.running) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'QEMU not running');
    }
    for (let c = 0; c < cycles; c++) {
      this.executeOneInstruction();
    }
    this.lastCommandTime = Date.now();
    return ResultHelper.ok(this.state.pc);
  }

  /** 寄存器读取命令 (CMD_REG_READ) */
  regRead(addr: number): ApiResult<number> {
    const payload = new Uint8Array(4);
    this.packU32(addr, payload, 0);
    // 模拟QEMU响应
    const val = this.readPeriphInternal(addr);
    this.lastCommandTime = Date.now();
    return ResultHelper.ok(val);
  }

  /** 寄存器写入命令 (CMD_REG_WRITE) */
  regWrite(addr: number, value: number): ApiResult<void> {
    this.writePeriphInternal(addr, value);
    this.lastCommandTime = Date.now();
    return ResultHelper.ok();
  }

  /** 内存读取 (CMD_MEM_READ) */
  memRead(addr: number, length: number): ApiResult<Uint8Array> {
    const buf = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      buf[i] = this.readByte(addr + i);
    }
    this.lastCommandTime = Date.now();
    return ResultHelper.ok(buf);
  }

  /** 内存写入 (CMD_MEM_WRITE) */
  memWrite(addr: number, data: Uint8Array): ApiResult<void> {
    for (let i = 0; i < data.length; i++) {
      this.writeByte(addr + i, data[i]);
    }
    this.lastCommandTime = Date.now();
    return ResultHelper.ok();
  }

  /** 发送中断 (CMD_INTERRUPT) */
  sendInterrupt(irqNum: number): ApiResult<void> {
    // NVIC ISPR 寄存器位设置
    const isprAddr = NVIC_BASE + 0x00 + (irqNum >> 5) * 4;
    const current = this.readPeriphInternal(isprAddr);
    this.writePeriphInternal(isprAddr, current | (1 << (irqNum & 0x1F)));
    this.lastCommandTime = Date.now();
    return ResultHelper.ok();
  }

  /**
   * Local Thumb interpreter is in-process — do NOT treat idle gaps as IPC death.
   * Old IPC_TIMEOUT_MS(5s) made isRunning() false after burn→start delays (>5s),
   * so tickMcuCore never stepped and GPIO stayed reset (lab_memory LA flat).
   */
  isConnectionAlive(): boolean {
    return this.connected;
  }

  /** Refresh heartbeat (diagnostics / future real-QEMU path). */
  touch(): void {
    if (this.connected) {
      this.lastCommandTime = Date.now();
    }
  }

  /** Seconds since last step/reg access (-1 if never). */
  idleMs(): number {
    if (this.lastCommandTime <= 0) {
      return -1;
    }
    return Date.now() - this.lastCommandTime;
  }

  /**
   * Re-arm interpreter after false IPC death or PC OOB halt, without wiping firmware.
   * Re-applies reset vector so PC returns to entry.
   */
  ensureRunning(): boolean {
    if (this.firmware.length < 8) {
      return false;
    }
    const wasRunning = this.state.running && this.connected;
    this.connected = true;
    this.state.running = true;
    this.lastCommandTime = Date.now();
    if (!wasRunning) {
      this.applyResetVector();
    }
    return true;
  }

  readPeriph(addr: number): number {
    return this.readPeriphInternal(addr);
  }

  writePeriph(addr: number, value: number): void {
    this.writePeriphInternal(addr, value);
  }

  syncGpioToSpice(pinIndex: number, level: number): number {
    return level > 0.5 ? 3.3 : 0;
  }

  syncSpiceToAdc(channel: number, voltage: number): number {
    const raw = Math.round((voltage / 3.3) * 4095);
    this.state.adcRegs.set(0x4001244C + channel * 4, raw);
    this.writePeriphInternal(ADC1_BASE + 0x4C + channel * 4, raw);
    return raw;
  }

  stop(): void {
    this.state.running = false;
    this.processHandle = -1;
    this.connected = false;
  }

  isRunning(): boolean { return this.state.running && this.isConnectionAlive(); }
  getPc(): number { return this.state.pc; }
  getState(): QemuMcuState { return this.state; }
  getFirmwareSize(): number { return this.firmware.length; }

  // ---- 内部: 外设寄存器读/写 ----

  private readPeriphInternal(addr: number): number {
    if (addr === USART1_BASE + USART_DR || addr === USART2_BASE + USART_DR ||
        addr === USART3_BASE + USART_DR) {
      return this.onUsartDrRead(addr - USART_DR);
    }
    if (this.periphRegs.has(addr)) return this.periphRegs.get(addr)!;
    return 0;
  }

  private writePeriphInternal(addr: number, value: number): void {
    if (addr === USART1_BASE + USART_DR || addr === USART2_BASE + USART_DR ||
        addr === USART3_BASE + USART_DR) {
      this.onUsartDrWrite(addr - USART_DR, value);
      return;
    }
    this.periphRegs.set(addr, value >>> 0);
    if (addr >= GPIOA_BASE && addr < GPIOE_BASE + 0x400) {
      this.writeGpioReg(addr, value);
    }
    if (this.isGpioBsrr(addr)) {
      this.applyBsrr(addr, value);
    }
    if (this.isGpioBrr(addr)) {
      this.applyBrr(addr, value);
    }
  }

  private onUsartDrWrite(usartBase: number, value: number): void {
    const byte = value & 0xFF;
    this.periphRegs.set(usartBase + USART_DR, byte);
    this.uartTxPend.push(byte);
    // Clear TXE briefly so firmware TXE poll does real work (not 1:1 spam)
    let sr = this.periphRegs.get(usartBase + USART_SR) ?? 0xC0;
    sr = (sr & ~0x80) | 0x40; // TXE=0, TC=1 still eventually
    this.periphRegs.set(usartBase + USART_SR, sr);
    this.usartTxBusyLeft = 64;
    if (byte !== 0x55) {
      traceUart('QEMU_TX_DR_WR',
        `base=0x${usartBase.toString(16)} byte=0x${byte.toString(16).padStart(2, '0')} ` +
        `pend=${this.uartTxPend.length} rxQ=${this.uartRxQueue.length}`);
    }
    // Drive PA9 idle-high after a character for lab visual (USART1_TX)
    const odrAddr = GPIOA_BASE + GPIO_ODR;
    let odr = this.periphRegs.get(odrAddr) ?? 0;
    odr |= (1 << 9);
    this.writeGpioReg(odrAddr, odr);
    this.periphRegs.set(odrAddr, odr);
  }

  private refreshUsartRxne(usartBase: number): void {
    let sr = this.periphRegs.get(usartBase + USART_SR) ?? 0xC0;
    if (this.uartRxQueue.length > 0) {
      sr |= 0x20; // RXNE
      this.periphRegs.set(usartBase + USART_DR, this.uartRxQueue[0] & 0xFF);
    } else {
      sr &= ~0x20;
    }
    this.periphRegs.set(usartBase + USART_SR, sr);
  }

  private onUsartDrRead(usartBase: number): number {
    const qBefore = this.uartRxQueue.length;
    let byte = 0;
    let fromQueue = false;
    if (this.uartRxQueue.length > 0) {
      byte = this.uartRxQueue.shift()! & 0xFF;
      fromQueue = true;
    } else {
      byte = (this.periphRegs.get(usartBase + USART_DR) ?? 0) & 0xFF;
    }
    this.periphRegs.set(usartBase + USART_DR, byte);
    this.refreshUsartRxne(usartBase);
    // FW echo/RXNE polls read DR — log meaningful RX; throttle empty/0x55 noise
    if (fromQueue || byte !== 0x55) {
      const sr = this.periphRegs.get(usartBase + USART_SR) ?? 0;
      traceUart('QEMU_RX_DR_RD',
        `base=0x${usartBase.toString(16)} byte=0x${(byte & 0xFF).toString(16).padStart(2, '0')} ` +
        `fromQ=${fromQueue ? 1 : 0} qBefore=${qBefore} qAfter=${this.uartRxQueue.length} ` +
        `RXNE=${((sr >> 5) & 1)}`);
    }
    return byte;
  }

  private tickUsartTxe(): void {
    if (this.usartTxBusyLeft <= 0) {
      return;
    }
    this.usartTxBusyLeft--;
    if (this.usartTxBusyLeft > 0) {
      return;
    }
    const usartBases = [USART1_BASE, USART2_BASE, USART3_BASE];
    for (let i = 0; i < usartBases.length; i++) {
      const base = usartBases[i];
      const sr = this.periphRegs.get(base + USART_SR) ?? 0xC0;
      this.periphRegs.set(base + USART_SR, sr | 0xC0);
    }
  }

  private readByte(addr: number): number {
    if (addr >= FLASH_BASE && addr < FLASH_BASE + this.firmware.length) {
      return this.firmware[addr - FLASH_BASE];
    }
    if (addr >= SRAM_BASE && addr < SRAM_BASE + this.sram.length) {
      return this.sram[addr - SRAM_BASE];
    }
    const wordAddr = addr & ~0x3;
    if (wordAddr === USART1_BASE + USART_DR || wordAddr === USART2_BASE + USART_DR ||
        wordAddr === USART3_BASE + USART_DR) {
      // Byte access to DR consumes one RX byte (low byte)
      return this.onUsartDrRead(wordAddr - USART_DR) & 0xFF;
    }
    return (this.readPeriphInternal(wordAddr) >> ((addr & 3) * 8)) & 0xFF;
  }

  private writeByte(addr: number, value: number): void {
    if (addr >= SRAM_BASE && addr < SRAM_BASE + this.sram.length) {
      this.sram[addr - SRAM_BASE] = value & 0xFF;
      return;
    }
    if (addr === USART1_BASE + USART_DR || addr === USART2_BASE + USART_DR ||
        addr === USART3_BASE + USART_DR) {
      this.onUsartDrWrite(addr - USART_DR, value);
      return;
    }
    // RMW byte into aligned periph word
    if (addr >= PERIPH_BASE && addr < 0x50000000) {
      const wordAddr = addr & ~0x3;
      const shift = (addr & 3) * 8;
      let word = this.readPeriphInternal(wordAddr);
      word = (word & ~(0xFF << shift)) | ((value & 0xFF) << shift);
      this.writePeriphInternal(wordAddr, word);
    }
  }

  private readMem32(addr: number): number {
    const a = addr >>> 0;
    if (a >= FLASH_BASE && a + 3 < FLASH_BASE + this.firmware.length) {
      return this.readU32Flash(a - FLASH_BASE);
    }
    if (a >= SRAM_BASE && a + 3 < SRAM_BASE + this.sram.length) {
      const o = a - SRAM_BASE;
      return (this.sram[o] | (this.sram[o + 1] << 8) |
        (this.sram[o + 2] << 16) | (this.sram[o + 3] << 24)) >>> 0;
    }
    return this.readPeriphInternal(a & ~0x3) >>> 0;
  }

  private writeMem32(addr: number, value: number): void {
    const a = addr >>> 0;
    if (a >= SRAM_BASE && a + 3 < SRAM_BASE + this.sram.length) {
      const o = a - SRAM_BASE;
      const v = value >>> 0;
      this.sram[o] = v & 0xFF;
      this.sram[o + 1] = (v >> 8) & 0xFF;
      this.sram[o + 2] = (v >> 16) & 0xFF;
      this.sram[o + 3] = (v >> 24) & 0xFF;
      return;
    }
    if (a === USART1_BASE + USART_DR || a === USART2_BASE + USART_DR ||
        a === USART3_BASE + USART_DR) {
      this.onUsartDrWrite(a - USART_DR, value);
      return;
    }
    this.writePeriphInternal(a & ~0x3, value >>> 0);
  }

  private reg(n: number): number {
    if (n === 15) {
      return this.state.pc >>> 0;
    }
    return (this.regs[n] ?? 0) >>> 0;
  }

  private setReg(n: number, v: number): void {
    const val = v >>> 0;
    if (n === 15) {
      this.state.pc = val & 0xFFFFFFFE;
      this.regs[15] = this.state.pc;
      return;
    }
    this.regs[n] = val;
  }

  // ---- GPIO 寄存器读/写 ----

  private writeGpioReg(addr: number, value: number): void {
    this.periphRegs.set(addr, value);
    const baseAddr = addr & 0xFFFFFC00;
    const offset = addr & 0x3FF;
    if (offset === GPIO_ODR) {
      for (let bit = 0; bit < 16; bit++) {
        this.state.gpioRegs.set(baseAddr + bit, (value >> bit) & 1);
      }
    }
  }

  private isGpioBsrr(addr: number): boolean {
    return (addr & 0x3FF) === GPIO_BSRR;
  }

  private applyBsrr(addr: number, value: number): void {
    const baseAddr = addr & 0xFFFFFC00;
    const odrAddr = baseAddr + GPIO_ODR;
    let odr = this.periphRegs.get(odrAddr) ?? 0;
    for (let bit = 0; bit < 16; bit++) {
      if (value & (1 << bit)) {
        odr |= (1 << bit);
      }
      if (value & (1 << (bit + 16))) {
        odr &= ~(1 << bit);
      }
    }
    this.periphRegs.set(odrAddr, odr);
    this.writeGpioReg(odrAddr, odr);
  }

  private isGpioBrr(addr: number): boolean {
    return (addr & 0x3FF) === GPIO_BRR;
  }

  private applyBrr(addr: number, value: number): void {
    const baseAddr = addr & 0xFFFFFC00;
    const odrAddr = baseAddr + GPIO_ODR;
    let odr = this.periphRegs.get(odrAddr) ?? 0;
    odr &= ~value;
    this.periphRegs.set(odrAddr, odr);
    this.writeGpioReg(odrAddr, odr);
  }

  // ---- Thumb instruction execution (lab_uart + teaching stubs) ----

  private executeOneInstruction(): void {
    const pc = this.state.pc >>> 0;
    if (pc < FLASH_BASE || pc >= FLASH_BASE + this.firmware.length) {
      this.state.running = false;
      return;
    }
    const offset = pc - FLASH_BASE;
    if (offset + 1 >= this.firmware.length) {
      this.state.running = false;
      return;
    }

    const hw = (this.firmware[offset] | (this.firmware[offset + 1] << 8)) & 0xFFFF;

    // MOVS Rd, #imm8
    if ((hw & 0xF800) === 0x2000) {
      const rd = (hw >> 8) & 0x7;
      const imm = hw & 0xFF;
      this.setReg(rd, imm);
      this.zFlag = imm === 0;
      this.state.pc = pc + 2;
    } else if ((hw & 0xE000) === 0x0000) {
      // Move shifted register: LSL/LSR/ASR Rd, Rm, #imm5  (000op)
      // op=11 is ADD/SUB format — not handled here
      const op = (hw >> 11) & 0x3;
      if (op <= 2) {
        const rd = hw & 0x7;
        const rm = (hw >> 3) & 0x7;
        const imm5 = (hw >> 6) & 0x1F;
        const src = this.reg(rm) >>> 0;
        let val = src;
        if (op === 0) {
          // LSL — imm5==0 encodes MOV Rd,Rm
          if (imm5 > 0) {
            val = (src << imm5) >>> 0;
          }
        } else if (op === 1) {
          // LSR — imm5==0 means shift 32
          const sh = imm5 === 0 ? 32 : imm5;
          val = sh >= 32 ? 0 : (src >>> sh);
        } else {
          // ASR — imm5==0 means shift 32
          const sh = imm5 === 0 ? 32 : imm5;
          const signed = this.reg(rm) | 0;
          if (sh >= 32) {
            val = signed < 0 ? 0xFFFFFFFF : 0;
          } else {
            val = (signed >> sh) >>> 0;
          }
        }
        this.setReg(rd, val);
        this.zFlag = (val >>> 0) === 0;
        this.state.pc = pc + 2;
      } else {
        // ADD/SUB (register/imm3) — advance to avoid hang
        this.state.pc = pc + 2;
      }
    } else if ((hw & 0xF800) === 0x4800) {
      // LDR Rd, [PC, #imm8]
      const rd = (hw >> 8) & 0x7;
      const imm8 = hw & 0xFF;
      const base = (pc + 4) & ~0x3;
      this.setReg(rd, this.readMem32(base + imm8 * 4));
      this.state.pc = pc + 2;
    } else if ((hw & 0xF800) === 0x6000) {
      // STR Rt, [Rn, #imm5*4]
      const rt = hw & 0x7;
      const rn = (hw >> 3) & 0x7;
      const imm5 = (hw >> 6) & 0x1F;
      this.writeMem32(this.reg(rn) + imm5 * 4, this.reg(rt));
      this.state.pc = pc + 2;
    } else if ((hw & 0xF800) === 0x6800) {
      // LDR Rt, [Rn, #imm5*4]
      const rt = hw & 0x7;
      const rn = (hw >> 3) & 0x7;
      const imm5 = (hw >> 6) & 0x1F;
      this.setReg(rt, this.readMem32(this.reg(rn) + imm5 * 4));
      this.state.pc = pc + 2;
    } else if ((hw & 0xF800) === 0x7000) {
      // STRB Rt, [Rn, #imm5]
      const rt = hw & 0x7;
      const rn = (hw >> 3) & 0x7;
      const imm5 = (hw >> 6) & 0x1F;
      this.writeByte(this.reg(rn) + imm5, this.reg(rt) & 0xFF);
      this.state.pc = pc + 2;
    } else if ((hw & 0xF800) === 0x7800) {
      // LDRB Rt, [Rn, #imm5]
      const rt = hw & 0x7;
      const rn = (hw >> 3) & 0x7;
      const imm5 = (hw >> 6) & 0x1F;
      this.setReg(rt, this.readByte(this.reg(rn) + imm5));
      this.state.pc = pc + 2;
    } else if ((hw & 0xFC00) === 0x4000) {
      // Data-processing: 010000 ooooo Rm Rd  (AND/EOR/TST/CMP/ORR/BIC/MVN/…)
      // lab_sensor.hex uses ORR Rd,Rm — missing this made ODR stay 0 (ORR was a silent NOP).
      const dpOp = (hw >> 6) & 0x1F;
      const rd = hw & 0x7;
      const rm = (hw >> 3) & 0x7;
      const a = this.reg(rd) >>> 0;
      const b = this.reg(rm) >>> 0;
      if (dpOp === 0x8) {
        this.zFlag = ((a & b) >>> 0) === 0; // TST
      } else if (dpOp === 0xA) {
        this.zFlag = (((a - b) | 0) === 0); // CMP (Z only)
      } else if (dpOp === 0x0 || dpOp === 0x1 || dpOp === 0xC || dpOp === 0xE || dpOp === 0xF) {
        let val = a;
        if (dpOp === 0x0) {
          val = (a & b) >>> 0;
        } else if (dpOp === 0x1) {
          val = (a ^ b) >>> 0;
        } else if (dpOp === 0xC) {
          val = (a | b) >>> 0;
        } else if (dpOp === 0xE) {
          val = (a & (~b >>> 0)) >>> 0;
        } else {
          val = (~b) >>> 0;
        }
        this.setReg(rd, val);
        this.zFlag = val === 0;
      }
      // else: unsupported dp op — advance PC only
      this.state.pc = pc + 2;
    } else if ((hw & 0xF000) === 0xD000) {
      // B<cond>
      const cond = (hw >> 8) & 0x0F;
      const imm8 = hw & 0xFF;
      const sign = imm8 >= 0x80 ? imm8 - 256 : imm8;
      let take = false;
      if (cond === 0x0) {
        take = this.zFlag; // EQ
      } else if (cond === 0x1) {
        take = !this.zFlag; // NE
      } else if (cond === 0xE) {
        take = true; // AL (rare in 16-bit)
      }
      if (cond === 0xF) {
        // SVC — skip
        this.state.pc = pc + 2;
      } else {
        this.state.pc = take ? ((pc + 4 + sign * 2) >>> 0) : (pc + 2);
      }
    } else if ((hw & 0xF800) === 0xE000) {
      // B (unconditional)
      const imm11 = hw & 0x7FF;
      const sign = imm11 >= 0x400 ? imm11 - 2048 : imm11;
      this.state.pc = (pc + 4 + sign * 2) >>> 0;
    } else if ((hw & 0xFFFF) === 0xBF00) {
      // NOP
      this.state.pc = pc + 2;
    } else if ((hw & 0xF800) === 0xF000 || (hw & 0xF800) === 0xF800) {
      // BL/32-bit — skip half
      this.state.pc = (offset + 3 < this.firmware.length) ? (pc + 4) : (pc + 2);
    } else {
      // Unknown — advance to avoid hang
      this.state.pc = pc + 2;
    }

    this.regs[15] = this.state.pc;
    this.tickUsartTxe();
    this.tickSysTick();
  }

  private tickSysTick(): void {
    const stCtrl = this.periphRegs.get(0xE000E010) ?? 0;
    if (stCtrl & 1) {
      let count = this.periphRegs.get(0xE000E018) ?? 0;
      count--;
      if (count <= 0) {
        const reload = this.periphRegs.get(0xE000E014) ?? 0;
        count = reload;
        this.periphRegs.set(0xE000E010, (stCtrl | 0x10000));
      }
      this.periphRegs.set(0xE000E018, count);
    }
  }

  // ---- 外设复位状态初始化 ----

  /** 设置 STM32F103 上电复位默认值 */
  private initPeripheralResetState(): void {
    this.periphRegs.clear();
    this.state.gpioRegs.clear();

    this.periphRegs.set(RCC_BASE + RCC_CR, 0x00000083);
    this.periphRegs.set(RCC_BASE + RCC_CFGR, 0x00000000);

    const gpioBases = [GPIOA_BASE, GPIOB_BASE, GPIOC_BASE, GPIOD_BASE, GPIOE_BASE];
    for (const base of gpioBases) {
      this.periphRegs.set(base + GPIO_CRL, 0x44444444);
      this.periphRegs.set(base + GPIO_CRH, 0x44444444);
      this.periphRegs.set(base + GPIO_ODR, 0x00000000);
      this.periphRegs.set(base + GPIO_IDR, 0x00000000);
    }

    const usartBases = [USART1_BASE, USART2_BASE, USART3_BASE];
    for (const base of usartBases) {
      this.periphRegs.set(base + USART_SR, 0x000000C0);  // TC=1, TXE=1
      this.periphRegs.set(base + USART_DR, 0x00000000);
      this.periphRegs.set(base + USART_CR1, 0x00000000);
    }

    const timBases = [TIM1_BASE, TIM2_BASE, TIM3_BASE, TIM4_BASE];
    for (const base of timBases) {
      this.periphRegs.set(base + TIM_CR1, 0x00000000);
      this.periphRegs.set(base + TIM_CNT, 0x00000000);
      this.periphRegs.set(base + TIM_PSC, 0x00000000);
      this.periphRegs.set(base + TIM_ARR, 0x0000FFFF);
      this.periphRegs.set(base + TIM_SR, 0x00000000);
    }

    for (const base of [ADC1_BASE, ADC2_BASE]) {
      this.periphRegs.set(base + 0x00, 0x00000000);
      this.periphRegs.set(base + 0x04, 0x00000000);
      this.periphRegs.set(base + 0x08, 0x00000000);
    }

    this.periphRegs.set(0xE000E010, 0x00000000);
    this.periphRegs.set(0xE000E014, 0x00000000);
    this.periphRegs.set(0xE000E018, 0x00000000);

    this.periphRegs.set(SCB_BASE + 0x0C, 0x00000000);
  }
}
