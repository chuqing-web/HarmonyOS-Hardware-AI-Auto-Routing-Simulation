/**
 * Sim Worker ↔ UI 消息协议（扁平可克隆结构）
 */

export enum SimCmdType {
  INIT = 'INIT',
  START = 'START',
  PAUSE = 'PAUSE',
  RESUME = 'RESUME',
  STOP = 'STOP',
  LOAD_MCU = 'LOAD_MCU',
  UART_RX = 'UART_RX',
  SET_BUDGET = 'SET_BUDGET',
  STEP_ONCE = 'STEP_ONCE',
  SHUTDOWN = 'SHUTDOWN'
}

export enum SimMsgType {
  READY = 'READY',
  FRAME = 'FRAME',
  STATUS = 'STATUS',
  ERROR = 'ERROR'
}

/** 跨线程帧快照 — 仅基础类型 / 数组 */
export interface SimFramePlain {
  t: number;
  stepCount: number;
  netKeys: string[];
  voltages: number[];
  branchKeys: string[];
  currents: number[];
  mcuFamily: string;
  mcuPc: number;
  mcuP1: number;
  gpioWords: number[];
  uartBytes: number[];
  state: string;
}

export interface SimHostCommand {
  type: string;
  topoJson?: string;
  docJson?: string;
  cfgJson?: string;
  budgetMs?: number;
  family?: string;
  offset?: number;
  /** base64 of firmware bytes */
  firmwareB64?: string;
  /** Host→MCU UART RX bytes as hex (e.g. "55AA") */
  uartHex?: string;
}

export interface SimWorkerMessage {
  type: string;
  frame?: SimFramePlain;
  state?: string;
  message?: string;
  code?: number;
}

export function emptySimFrame(): SimFramePlain {
  const f: SimFramePlain = {
    t: 0,
    stepCount: 0,
    netKeys: [],
    voltages: [],
    branchKeys: [],
    currents: [],
    mcuFamily: '',
    mcuPc: 0,
    mcuP1: 0,
    gpioWords: [],
    uartBytes: [],
    state: 'IDLE'
  };
  return f;
}

export function makeSimHostCommand(
  type: string,
  budgetMs?: number,
  topoJson?: string,
  docJson?: string,
  cfgJson?: string,
  family?: string,
  offset?: number,
  firmwareB64?: string
): SimHostCommand {
  const cmd: SimHostCommand = { type: type };
  if (budgetMs !== undefined) {
    cmd.budgetMs = budgetMs;
  }
  if (topoJson !== undefined) {
    cmd.topoJson = topoJson;
  }
  if (docJson !== undefined) {
    cmd.docJson = docJson;
  }
  if (cfgJson !== undefined) {
    cmd.cfgJson = cfgJson;
  }
  if (family !== undefined) {
    cmd.family = family;
  }
  if (offset !== undefined) {
    cmd.offset = offset;
  }
  if (firmwareB64 !== undefined) {
    cmd.firmwareB64 = firmwareB64;
  }
  return cmd;
}

export function makeUartRxCommand(uartHex: string): SimHostCommand {
  // Single-object literal (avoid post-create mutation) for reliable Worker clone
  const cmd: SimHostCommand = { type: 'UART_RX', uartHex: uartHex };
  return cmd;
}

export function makeSimWorkerMessage(
  type: string,
  frame?: SimFramePlain,
  state?: string,
  message?: string,
  code?: number
): SimWorkerMessage {
  const msg: SimWorkerMessage = { type: type };
  if (frame !== undefined) {
    msg.frame = frame;
  }
  if (state !== undefined) {
    msg.state = state;
  }
  if (message !== undefined) {
    msg.message = message;
  }
  if (code !== undefined) {
    msg.code = code;
  }
  return msg;
}

export function toSimFramePlain(
  t: number,
  stepCount: number,
  netKeys: string[],
  voltages: number[],
  branchKeys: string[],
  currents: number[],
  mcuFamily: string,
  mcuPc: number,
  mcuP1: number,
  gpioWords: number[],
  state: string,
  uartBytes: number[]
): SimFramePlain {
  const f: SimFramePlain = {
    t: t,
    stepCount: stepCount,
    netKeys: netKeys,
    voltages: voltages,
    branchKeys: branchKeys,
    currents: currents,
    mcuFamily: mcuFamily,
    mcuPc: mcuPc,
    mcuP1: mcuP1,
    gpioWords: gpioWords,
    uartBytes: uartBytes,
    state: state
  };
  return f;
}
