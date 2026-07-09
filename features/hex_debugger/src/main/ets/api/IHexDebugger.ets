/**
 * 模块4：HEX固件烧录与调试 API（v2 完备版）
 */
import {
  HexFirmware, McuDebugConfig, McuFamily, DebugState,
  McuRegisterSnapshot, Result,
  HexFileInfo, ProgressCallback, ApiResult
} from 'common';

export interface CortexCoreRegs {
  r0: number; r1: number; r2: number; r3: number;
  r4: number; r5: number; r6: number; r7: number;
  r8: number; r9: number; r10: number; r11: number;
  r12: number; sp: number; lr: number; pc: number; xpsr: number;
}

export interface Sfr51Regs {
  acc: number; b: number; psw: number; sp: number;
  dpl: number; dph: number; p0: number; p1: number; p2: number; p3: number;
  ie: number; tcon: number; th0: number; tl0: number; th1: number; tl1: number;
  scon: number; sbuf: number; pc: number;
}

export interface BootConfig {
  bootPin: number;
  bootPin1?: number;
  resetVector: number;
  externalMemory?: boolean;
  watchdogEnabled?: boolean;
}

export type BreakpointHitCallback = (mcuInstUuid: string, hitAddr: number) => void;

export interface IHexDebugger {
  // ---- v2 API ----
  parseHexFile(filePath: string): ApiResult<HexFileInfo>;
  parseHexData(data: Uint8Array): ApiResult<HexFileInfo>;
  loadHexToMcu(mcuInstUuid: string, hexInfo: HexFileInfo): ApiResult<void>;
  unloadMcuHex(mcuInstUuid: string): ApiResult<void>;
  checkHexFitMcuFlash(hexInfo: HexFileInfo, mcuFamily: McuFamily): ApiResult<void>;
  setMcuFreq(mcuInstUuid: string, freqHz: number): ApiResult<void>;
  setBootConfig(mcuInstUuid: string, boot: BootConfig): ApiResult<void>;
  stepInto(): ApiResult<void>;
  stepOut(): ApiResult<void>;
  stepOver(): ApiResult<void>;
  runToBreakpoint(): ApiResult<void>;
  mcuSoftReset(mcuInstUuid?: string): ApiResult<void>;
  setAddrBreakpoint(address: number): ApiResult<void>;
  setDataBreakpoint(address: number, expectedValue?: number): ApiResult<void>;
  get51Sfr(): ApiResult<Sfr51Regs>;
  getCortexCoreRegs(): ApiResult<CortexCoreRegs>;
  getUartLog(): string;
  sendUartString(data: string): ApiResult<void>;
  clearUartLog(): void;
  exportUartLog(path: string): Promise<ApiResult<void>>;
  onBreakpointHit(callback: BreakpointHitCallback): void;
  offBreakpointHit(callback: BreakpointHitCallback): void;

  // ---- v1 兼容 ----
  configure(config: McuDebugConfig): Result<void>;
  getConfig(): McuDebugConfig | null;
  loadHex(filePath: string): Result<HexFirmware>;
  loadHexData(data: Uint8Array, mcuFamily: McuFamily): Result<HexFirmware>;
  loadHexFromString(hexText: string, mcuFamily: McuFamily): Result<HexFirmware>;
  run(): Result<void>;
  pause(): Result<void>;
  step(): Result<void>;
  reset(): Result<void>;
  getDebugState(): DebugState;
  setBreakpoint(address: number): Result<void>;
  removeBreakpoint(address: number): Result<void>;
  clearBreakpoints(): void;
  getBreakpoints(): number[];
  readRegister(name: string): Result<number>;
  writeRegister(name: string, value: number): Result<void>;
  readMemory(address: number, length: number): Result<Uint8Array>;
  writeMemory(address: number, data: Uint8Array): Result<void>;
  getRegisterSnapshot(): McuRegisterSnapshot | null;
  getParsedHexInfo(): HexFileInfo | null;
  getPinLevel(pinName: string): Result<number>;
  setPinLevel(pinName: string, level: number): Result<void>;
  getUartOutput(): string;
  sendUartInput(data: string): void;
}
