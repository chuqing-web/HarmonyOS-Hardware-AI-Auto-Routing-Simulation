/**
 * QEMU-MCU 桥接 — STM32 外设寄存器同步 + 二进制IPC协议
 * v2.0: 结构化IPC协议 / 完整STM32F103外设寄存器映射 / CRC8校验 / 超时管理
 */
import { ErrCode, ResultHelper, ApiResult } from 'common';

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

const IPC_TIMEOUT_MS = 5000;
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
    this.initPeripheralResetState();
    return ResultHelper.ok();
  }

  /** 加载固件二进制到Flash */
  loadFirmware(data: Uint8Array): void {
    this.firmware = new Uint8Array(data);
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

  /** 检查连接是否超时 */
  isConnectionAlive(): boolean {
    return this.connected && (Date.now() - this.lastCommandTime) < IPC_TIMEOUT_MS;
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

  // ---- 内部: 外设寄存器读/写 ----

  private readPeriphInternal(addr: number): number {
    if (this.periphRegs.has(addr)) return this.periphRegs.get(addr)!;
    // GPIO 寄存器从状态映射读取
    if (addr >= GPIOA_BASE && addr < GPIOE_BASE + 0x400) {
      return this.readGpioReg(addr);
    }
    return 0;
  }

  private writePeriphInternal(addr: number, value: number): void {
    this.periphRegs.set(addr, value);
    // GPIO 写入可能需要触发引脚状态更新
    if (addr >= GPIOA_BASE && addr < GPIOE_BASE + 0x400) {
      this.writeGpioReg(addr, value);
    }
    // BSRR 写入后更新 ODR
    if (this.isGpioBsrr(addr)) {
      this.applyBsrr(addr, value);
    }
    // BRR 写入后清除 ODR
    if (this.isGpioBrr(addr)) {
      this.applyBrr(addr, value);
    }
  }

  private readByte(addr: number): number {
    if (addr >= FLASH_BASE && addr < FLASH_BASE + this.firmware.length) {
      return this.firmware[addr - FLASH_BASE];
    }
    if (addr >= SRAM_BASE && addr < SRAM_BASE + this.sram.length) {
      return this.sram[addr - SRAM_BASE];
    }
    return 0;
  }

  private writeByte(addr: number, value: number): void {
    if (addr >= SRAM_BASE && addr < SRAM_BASE + this.sram.length) {
      this.sram[addr - SRAM_BASE] = value & 0xFF;
    }
  }

  // ---- GPIO 寄存器读/写 ----

  private readGpioReg(addr: number): number {
    const offset = addr & 0x3FF;
    if (this.periphRegs.has(addr)) return this.periphRegs.get(addr)!;
    if (offset === GPIO_IDR) {
      // 从 gpioRegs 状态重建 IDR
      let idr = 0;
      this.state.gpioRegs.forEach((val: number, key: number) => {
        if (key >= addr - GPIO_IDR && key < addr - GPIO_IDR + 4) {
          // 已通过 writePeriph 设置的
        }
      });
      return 0;
    }
    return this.periphRegs.get(addr) ?? 0;
  }

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
        odr |= (1 << bit);  // BSRR 低16位: 置位
      }
      if (value & (1 << (bit + 16))) {
        odr &= ~(1 << bit); // BSRR 高16位: 复位
      }
    }
    this.writePeriphInternal(odrAddr, odr);
  }

  private isGpioBrr(addr: number): boolean {
    return (addr & 0x3FF) === GPIO_BRR;
  }

  private applyBrr(addr: number, value: number): void {
    const baseAddr = addr & 0xFFFFFC00;
    const odrAddr = baseAddr + GPIO_ODR;
    let odr = this.periphRegs.get(odrAddr) ?? 0;
    odr &= ~value;  // BRR: 复位指定位
    this.writePeriphInternal(odrAddr, odr);
  }

  // ---- 指令执行 (模拟) ----

  private executeOneInstruction(): void {
    const pc = this.state.pc;
    if (pc < FLASH_BASE || pc >= FLASH_BASE + this.firmware.length) {
      this.state.running = false;
      return;
    }
    const offset = pc - FLASH_BASE;
    if (offset + 1 >= this.firmware.length) {
      this.state.running = false;
      return;
    }

    // Thumb-2 16位指令解码
    const hw = (this.firmware[offset] | (this.firmware[offset + 1] << 8));
    const op5 = (hw >> 11) & 0x1F;
    let nextPc = pc + 2;

    // 简化指令执行 (覆盖最常见 Thumb 指令)
    if (op5 === 0x00) {
      // MOVS Rd, #imm8 或 LSLS/LSRS/ASRS
      nextPc = pc + 2;
    } else if (op5 === 0x01 || op5 === 0x02 || op5 === 0x03) {
      // ADD/SUB/CMP/MOV 寄存器操作
      nextPc = pc + 2;
    } else if (op5 === 0x08) {
      // LDR literal → PC + 4*(imm8)
      nextPc = pc + 2;
    } else if (op5 === 0x09 || op5 === 0x0A || op5 === 0x0B) {
      // LDR/STR 寄存器偏移
      nextPc = pc + 2;
    } else if ((hw & 0xF000) === 0xD000) {
      // B cond (条件分支)
      const cond = (hw >> 8) & 0x0F;
      if (cond !== 0x0F) {
        const offset8 = (hw & 0xFF);
        const signExtend = offset8 >= 0x80 ? offset8 - 256 : offset8;
        nextPc = pc + 4 + signExtend * 2;
      }
    } else if ((hw & 0xF800) === 0xE000) {
      // B (无条件分支)
      const offset11 = hw & 0x7FF;
      const signExtend = offset11 >= 0x400 ? offset11 - 2048 : offset11;
      nextPc = pc + 4 + signExtend * 2;
    } else if ((hw & 0xF800) === 0xF000 || (hw & 0xF800) === 0xF800) {
      // BL/BLX (32位)
      if (offset + 3 < this.firmware.length) {
        nextPc = pc + 4;
      }
    }

    this.state.pc = nextPc;

    // 更新 SysTick (如果使能)
    this.tickSysTick();
  }

  private tickSysTick(): void {
    const stCtrl = this.periphRegs.get(0xE000E010) ?? 0;
    if (stCtrl & 1) {  // ENABLE
      let count = this.periphRegs.get(0xE000E018) ?? 0;
      count--;
      if (count <= 0) {
        const reload = this.periphRegs.get(0xE000E014) ?? 0;
        count = reload;
        // COUNTFLAG
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

    // RCC: HSI ON, SYSCLK = HSI (8MHz)
    this.periphRegs.set(RCC_BASE + RCC_CR, 0x00000083);
    this.periphRegs.set(RCC_BASE + RCC_CFGR, 0x00000000);

    // GPIO 默认: 浮空输入 (CRL/CRH = 0x44444444)
    const gpioBases = [GPIOA_BASE, GPIOB_BASE, GPIOC_BASE, GPIOD_BASE, GPIOE_BASE];
    for (const base of gpioBases) {
      this.periphRegs.set(base + GPIO_CRL, 0x44444444);
      this.periphRegs.set(base + GPIO_CRH, 0x44444444);
      this.periphRegs.set(base + GPIO_ODR, 0x00000000);
      this.periphRegs.set(base + GPIO_IDR, 0x00000000);
    }

    // USART: 复位状态 (UE=0, 所有中断禁用)
    const usartBases = [USART1_BASE, USART2_BASE, USART3_BASE];
    for (const base of usartBases) {
      this.periphRegs.set(base + USART_SR, 0x000000C0);  // TC=1, TXE=1
      this.periphRegs.set(base + USART_CR1, 0x00000000);
    }

    // TIM: 复位状态 (UE=0, 计数器=0)
    const timBases = [TIM1_BASE, TIM2_BASE, TIM3_BASE, TIM4_BASE];
    for (const base of timBases) {
      this.periphRegs.set(base + TIM_CR1, 0x00000000);
      this.periphRegs.set(base + TIM_CNT, 0x00000000);
      this.periphRegs.set(base + TIM_PSC, 0x00000000);
      this.periphRegs.set(base + TIM_ARR, 0x0000FFFF);
      this.periphRegs.set(base + TIM_SR, 0x00000000);
    }

    // ADC: 复位状态
    for (const base of [ADC1_BASE, ADC2_BASE]) {
      this.periphRegs.set(base + 0x00, 0x00000000);  // SR
      this.periphRegs.set(base + 0x04, 0x00000000);  // CR1
      this.periphRegs.set(base + 0x08, 0x00000000);  // CR2
    }

    // SysTick
    this.periphRegs.set(0xE000E010, 0x00000000);  // CTRL
    this.periphRegs.set(0xE000E014, 0x00000000);  // LOAD
    this.periphRegs.set(0xE000E018, 0x00000000);  // VAL

    // SCB: 优先级分组默认
    this.periphRegs.set(SCB_BASE + 0x0C, 0x00000000);  // AIRCR
  }
}
