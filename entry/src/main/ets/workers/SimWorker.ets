/**
 * 持久化仿真 Worker — 持有 SimulationKernelImpl，按时间预算步进并回传 FRAME
 */
import { ErrorEvent, MessageEvents, ThreadWorkerGlobalScope, worker, util } from '@kit.ArkTS';
import {
  SimulationKernelImpl, KernelFrameSnapshot
} from 'simulation_kernel';
import {
  SchTopology, SimConfig, SchematicDocument, SimulationState,
  mapAwareParse, defaultSimConfig, traceUart, formatUartBytesHex
} from 'common';
import {
  SimFramePlain, SimHostCommand, SimMsgType, SimWorkerMessage,
  makeSimWorkerMessage, toSimFramePlain
} from '../services/sim/SimProtocol';

const workerPort: ThreadWorkerGlobalScope = worker.workerPort;

let kernel: SimulationKernelImpl = new SimulationKernelImpl();
let running: boolean = false;
let paused: boolean = false;
let loopTimer: number = -1;
let budgetMs: number = 5;
let loopGeneration: number = 0;
let lastFramePostMs: number = 0;
/** ≤60fps host frames — never busy-loop (APP_INPUT_BLOCK) */
const LOOP_INTERVAL_MS = 16;

function snapToPlain(snap: KernelFrameSnapshot): SimFramePlain {
  const uart: number[] = snap.uartBytes !== undefined ? snap.uartBytes : [];
  return toSimFramePlain(
    snap.t,
    snap.stepCount,
    snap.netKeys,
    snap.voltages,
    snap.branchKeys,
    snap.currents,
    snap.mcuFamily,
    snap.mcuPc,
    snap.mcuP1,
    snap.gpioWords,
    snap.state,
    uart
  );
}

function postToHost(msg: SimWorkerMessage): void {
  try {
    workerPort.postMessage(msg);
  } catch (_e) {
    // Host may have terminated the worker
  }
}

function postFrame(force: boolean = false): void {
  const now = Date.now();
  // Never flood host: each FRAME becomes WorkerHostOnMessageTask on UI thread.
  // APP_INPUT_BLOCK dumps showed hundreds of these starving MMI.
  if (!force && now - lastFramePostMs < LOOP_INTERVAL_MS) {
    return;
  }
  lastFramePostMs = now;
  const snap: KernelFrameSnapshot = kernel.buildFrameSnapshot();
  postToHost(makeSimWorkerMessage(SimMsgType.FRAME, snapToPlain(snap)));
}

function postStatus(state: string, message: string = ''): void {
  postToHost(makeSimWorkerMessage(SimMsgType.STATUS, undefined, state, message));
}

function postError(message: string, code: number = 1): void {
  postToHost(makeSimWorkerMessage(SimMsgType.ERROR, undefined, undefined, message, code));
}

function stopLoop(): void {
  running = false;
  if (loopTimer >= 0) {
    clearTimeout(loopTimer);
    loopTimer = -1;
  }
  loopGeneration++;
}

function scheduleLoop(): void {
  if (!running || paused) {
    return;
  }
  const gen = loopGeneration;
  loopTimer = setTimeout(() => {
    loopTimer = -1;
    if (gen !== loopGeneration || !running || paused) {
      return;
    }
    try {
      if (kernel.getState() === SimulationState.RUNNING) {
        kernel.runBudgetSteps(budgetMs);
        postFrame(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'sim loop error';
      postError(msg);
      stopLoop();
      return;
    }
    scheduleLoop();
  }, LOOP_INTERVAL_MS);
}

function decodeFirmware(b64: string): Uint8Array {
  const helper = new util.Base64Helper();
  return helper.decodeSync(b64);
}

workerPort.onmessage = (e: MessageEvents): void => {
  const cmd = e.data as SimHostCommand;
  if (cmd === undefined || cmd === null || cmd.type === undefined) {
    traceUart('WORKER_CMD_DROP', 'null/undefined message or type');
    return;
  }
  if (cmd.type === 'UART_RX' || cmd.type === 'LOAD_MCU' || cmd.type === 'STOP' ||
      cmd.type === 'PAUSE' || cmd.type === 'RESUME') {
    traceUart('WORKER_CMD',
      `type=${cmd.type} uartHex=${cmd.uartHex ?? '(none)'} fam=${cmd.family ?? ''}`);
  }
  try {
    switch (cmd.type) {
      case 'INIT':
        if (cmd.budgetMs !== undefined && cmd.budgetMs > 0) {
          budgetMs = cmd.budgetMs;
        }
        postToHost(makeSimWorkerMessage(SimMsgType.READY));
        break;
      case 'SET_BUDGET':
        if (cmd.budgetMs !== undefined && cmd.budgetMs > 0) {
          budgetMs = cmd.budgetMs;
        }
        break;
      case 'START': {
        stopLoop();
        const topo = mapAwareParse<SchTopology>(cmd.topoJson ?? '{}');
        const cfg = cmd.cfgJson !== undefined && cmd.cfgJson.length > 0
          ? mapAwareParse<SimConfig>(cmd.cfgJson)
          : defaultSimConfig();
        let doc: SchematicDocument | undefined = undefined;
        if (cmd.docJson !== undefined && cmd.docJson.length > 0) {
          doc = mapAwareParse<SchematicDocument>(cmd.docJson);
        }
        const result = kernel.startSimulation(topo, cfg, undefined, doc);
        if (!result.success) {
          postError(result.error ?? 'startSimulation failed');
          break;
        }
        running = true;
        paused = false;
        postStatus('running', 'started');
        kernel.runBudgetSteps(budgetMs);
        postFrame(true);
        scheduleLoop();
        break;
      }
      case 'PAUSE':
        paused = true;
        kernel.pauseSim();
        postStatus('paused');
        break;
      case 'RESUME':
        paused = false;
        kernel.resumeSim();
        postStatus('running', 'resumed');
        scheduleLoop();
        break;
      case 'STOP':
        stopLoop();
        kernel.stopSim();
        postStatus('stopped');
        break;
      case 'STEP_ONCE':
        if (kernel.getState() === SimulationState.RUNNING ||
            kernel.getState() === SimulationState.PAUSED) {
          kernel.runBudgetSteps(budgetMs);
          postFrame();
        }
        break;
      case 'LOAD_MCU': {
        const fam = cmd.family ?? '8051';
        const off = cmd.offset ?? 0;
        const b64 = cmd.firmwareB64 ?? '';
        if (b64.length > 0) {
          const bytes = decodeFirmware(b64);
          kernel.loadMcuProgram(bytes, off, fam);
          postStatus(kernel.getState() as string, `mcu_loaded:${fam}`);
          if (running && !paused) {
            postFrame();
          }
        }
        break;
      }
      case 'UART_RX': {
        const hx = (cmd.uartHex ?? '').replace(/\s+/g, '').toUpperCase();
        if (/^[0-9A-F]*$/.test(hx) && hx.length % 2 === 0 && hx.length > 0) {
          const bytes: number[] = [];
          for (let i = 0; i < hx.length; i += 2) {
            bytes.push(parseInt(hx.substring(i, i + 2), 16));
          }
          traceUart('WORKER_RX_CMD',
            `hex=${hx} n=${bytes.length} bytes=[${formatUartBytesHex(bytes)}]`);
          kernel.injectUsartRx(bytes);
        } else {
          traceUart('WORKER_RX_BAD', `uartHex=${cmd.uartHex ?? '(nil)'}`);
        }
        break;
      }
      case 'SHUTDOWN':
        stopLoop();
        kernel.stopSim();
        kernel.releaseSimResource();
        break;
      default:
        traceUart('WORKER_CMD_UNKNOWN', `type=${cmd.type}`);
        break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'worker command error';
    postError(msg);
  }
};

workerPort.onerror = (err: ErrorEvent): void => {
  postError(err.message ?? 'worker onerror');
};
