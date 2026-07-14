/**
 * Sim Worker 宿主 — 优先 ThreadWorker；失败则主线程时间预算回退泵
 *
 * ANR 注意：回退泵绝不能用 setTimeout(0) 忙等，否则会占满主线程 UV，
 * WorkerHostOnMessageTask(READY/FRAME) 排不上队 → Worker 永远升不上去 → THREAD_BLOCK_6S。
 */
import { worker, MessageEvents, ErrorEvent, util } from '@kit.ArkTS';
import { SimulationKernelImpl, KernelFrameSnapshot } from 'simulation_kernel';
import {
  SchTopology, SimConfig, SchematicDocument, SimulationState,
  mapAwareStringify, Logger, traceUart, formatUartBytesHex
} from 'common';
import {
  SimCmdType, SimFramePlain, SimHostCommand, SimMsgType, SimWorkerMessage,
  emptySimFrame, makeSimHostCommand, makeUartRxCommand, toSimFramePlain
} from './SimProtocol';
import { SimFrameStore } from './SimFrameStore';

const TAG = 'SimWorkerHost';
const WORKER_SCRIPT = 'entry/ets/workers/SimWorker.ets';
/**
 * Emulator APP_INPUT_BLOCK root cause: Worker FRAME floods → WorkerHostOnMessageTask
 * queues starve MMI. Keep ThreadWorker opt-in until frame payload is dictionary-diffed.
 * Fallback pump @16ms + hard spice cap keeps UI alive.
 */
const ENABLE_THREAD_WORKER: boolean = false;
/** 主线程回退泵间隔：勿与触摸/绘制抢 UI（16ms×SPICE 易 THREAD_BLOCK） */
const FALLBACK_INTERVAL_MS = 40;
/** 等待 Worker READY 超时后再上主线程回退泵 */
const WORKER_READY_WAIT_MS = 280;
export class SimWorkerHost {
  private tw: worker.ThreadWorker | null = null;
  private store: SimFrameStore = new SimFrameStore();
  private workerReady: boolean = false;
  private workerMode: boolean = false;
  private fallbackActive: boolean = false;
  private fallbackTimer: number = -1;
  private fallbackGen: number = 0;
  private readyWaitTimer: number = -1;
  private budgetMs: number = 3;
  private localKernel: SimulationKernelImpl | null = null;
  private pendingFirmware: Uint8Array | null = null;
  private pendingFirmwareOffset: number = 0;
  private pendingFirmwareFamily: string = '8051';
  private pendingTopoJson: string = '';
  private pendingDocJson: string = '';
  private pendingCfgJson: string = '';
  private hasPendingStart: boolean = false;
  private onError: (msg: string) => void = () => {};
  /** UI pinch/pan — skip spice budget ticks so UV can drain MMI */
  private uiGestureBusy: boolean = false;

  setErrorHandler(handler: (msg: string) => void): void {
    this.onError = handler;
  }

  setUiGestureBusy(busy: boolean): void {
    this.uiGestureBusy = busy;
  }

  getFrameStore(): SimFrameStore {
    return this.store;
  }

  isWorkerMode(): boolean {
    return this.workerMode && this.workerReady;
  }

  isFallbackMode(): boolean {
    return this.fallbackActive;
  }

  ensureStarted(): void {
    if (!ENABLE_THREAD_WORKER) {
      return;
    }
    if (this.tw !== null) {
      return;
    }
    try {
      const instance = new worker.ThreadWorker(WORKER_SCRIPT);
      instance.onmessage = (e: MessageEvents): void => {
        this.handleWorkerMessage(e.data as SimWorkerMessage);
      };
      instance.onerror = (err: ErrorEvent): void => {
        Logger.warn(TAG, `worker onerror: ${err.message}`);
        this.downgradeToFallback(`worker error: ${err.message}`);
      };
      instance.onexit = (_code: number): void => {
        Logger.info(TAG, 'worker exited');
        this.workerReady = false;
        this.workerMode = false;
      };
      this.tw = instance;
      this.workerMode = true;
      this.postToWorker(makeSimHostCommand(SimCmdType.INIT, this.budgetMs));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'ThreadWorker create failed';
      Logger.warn(TAG, msg);
      this.downgradeToFallback(msg);
    }
  }

  private postToWorker(cmd: SimHostCommand): void {
    if (this.tw === null) {
      return;
    }
    try {
      this.tw.postMessage(cmd);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'postMessage failed';
      Logger.warn(TAG, msg);
    }
  }

  private clearReadyWait(): void {
    if (this.readyWaitTimer >= 0) {
      clearTimeout(this.readyWaitTimer);
      this.readyWaitTimer = -1;
    }
  }

  private handleWorkerMessage(msg: SimWorkerMessage): void {
    if (msg === undefined || msg === null || msg.type === undefined) {
      return;
    }
    if (msg.type === SimMsgType.READY) {
      this.workerReady = true;
      this.workerMode = true;
      this.clearReadyWait();
      this.stopFallbackPump();
      Logger.info(TAG, 'worker READY');
      if (this.hasPendingStart) {
        this.upgradeToWorkerWithPending();
      }
      return;
    }
    if (msg.type === SimMsgType.FRAME && msg.frame !== undefined) {
      this.store.publish(msg.frame);
      return;
    }
    if (msg.type === SimMsgType.ERROR) {
      Logger.warn(TAG, `worker ERROR: ${msg.message ?? ''}`);
      this.onError(msg.message ?? 'sim worker error');
      this.downgradeToFallback(msg.message ?? 'sim worker error');
      return;
    }
  }

  private downgradeToFallback(reason: string): void {
    Logger.warn(TAG, `fallback compute pump: ${reason}`);
    this.workerMode = false;
    this.workerReady = false;
    this.clearReadyWait();
    if (this.tw !== null) {
      try {
        this.tw.terminate();
      } catch (_e) {
        // ignore
      }
      this.tw = null;
    }
    if (this.localKernel !== null &&
        this.localKernel.getState() === SimulationState.RUNNING) {
      this.startFallbackPump();
    }
  }

  private upgradeToWorkerWithPending(): void {
    if (this.tw === null || !this.workerReady || !this.hasPendingStart) {
      return;
    }
    this.stopFallbackPump();
    this.workerMode = true;
    this.fallbackActive = false;
    this.postToWorker(makeSimHostCommand(
      SimCmdType.START, this.budgetMs,
      this.pendingTopoJson, this.pendingDocJson, this.pendingCfgJson));
    if (this.pendingFirmware !== null) {
      this.postFirmwareToWorker(this.pendingFirmware, this.pendingFirmwareOffset,
        this.pendingFirmwareFamily);
    }
    this.hasPendingStart = false;
    Logger.info(TAG, 'upgraded to ThreadWorker compute path');
  }

  /**
   * Prefer ThreadWorker. Do NOT run a main-thread busy pump until READY has had a chance
   * to arrive — otherwise UV is starved and WorkerHostOnMessageTask never runs (ANR).
   */
  startRemote(topo: SchTopology, cfg: SimConfig, doc: SchematicDocument,
    localKernel: SimulationKernelImpl): void {
    this.localKernel = localKernel;
    this.stopFallbackPump();
    this.clearReadyWait();
    this.hasPendingStart = false;
    this.workerMode = false;

    if (!ENABLE_THREAD_WORKER) {
      Logger.info(TAG, `ThreadWorker disabled — budget fallback @${FALLBACK_INTERVAL_MS}ms (anti-ANR)`);
      this.startFallbackPump();
      return;
    }

    this.ensureStarted();
    this.hasPendingStart = true;
    this.workerMode = this.workerReady;

    // Yield so INIT↔READY can land before heavy stringify / START
    setTimeout((): void => {
      try {
        this.pendingTopoJson = mapAwareStringify(topo as Object);
        this.pendingDocJson = mapAwareStringify(doc as Object);
        this.pendingCfgJson = mapAwareStringify(cfg as Object);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'stringify failed';
        Logger.warn(TAG, msg);
        this.downgradeToFallback(msg);
        return;
      }
      if (this.workerReady) {
        this.upgradeToWorkerWithPending();
        return;
      }
      this.readyWaitTimer = setTimeout((): void => {
        this.readyWaitTimer = -1;
        if (this.workerReady) {
          this.upgradeToWorkerWithPending();
        } else {
          Logger.info(TAG, `Worker not READY in ${WORKER_READY_WAIT_MS}ms — budget fallback @${FALLBACK_INTERVAL_MS}ms`);
          this.workerMode = false;
          this.startFallbackPump();
        }
      }, WORKER_READY_WAIT_MS);
    }, 16);
  }

  private startFallbackPump(): void {
    if (this.localKernel === null) {
      return;
    }
    if (this.workerMode && this.workerReady) {
      return;
    }
    this.fallbackActive = true;
    this.fallbackGen++;
    const gen = this.fallbackGen;
    const tick = (): void => {
      if (gen !== this.fallbackGen || !this.fallbackActive || this.localKernel === null) {
        return;
      }
      // Worker took over mid-flight
      if (this.workerMode && this.workerReady) {
        this.fallbackActive = false;
        this.fallbackTimer = -1;
        return;
      }
      if (this.localKernel.getState() !== SimulationState.RUNNING) {
        this.fallbackTimer = setTimeout(tick, FALLBACK_INTERVAL_MS);
        return;
      }
      if (this.uiGestureBusy) {
        this.fallbackTimer = setTimeout(tick, FALLBACK_INTERVAL_MS);
        return;
      }
      this.localKernel.runBudgetSteps(this.budgetMs);
      const snap: KernelFrameSnapshot = this.localKernel.buildFrameSnapshot();
      this.store.publish(this.toPlain(snap));
      this.fallbackTimer = setTimeout(tick, FALLBACK_INTERVAL_MS);
    };
    if (this.fallbackTimer >= 0) {
      clearTimeout(this.fallbackTimer);
    }
    this.fallbackTimer = setTimeout(tick, FALLBACK_INTERVAL_MS);
    Logger.info(TAG, `fallback compute pump started @${FALLBACK_INTERVAL_MS}ms`);
  }

  private stopFallbackPump(): void {
    this.fallbackGen++;
    this.fallbackActive = false;
    if (this.fallbackTimer >= 0) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = -1;
    }
  }

  private toPlain(snap: KernelFrameSnapshot): SimFramePlain {
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

  pause(): void {
    if (this.tw !== null && this.workerReady) {
      this.postToWorker(makeSimHostCommand(SimCmdType.PAUSE));
    }
    this.stopFallbackPump();
  }

  resume(localKernel: SimulationKernelImpl): void {
    this.localKernel = localKernel;
    if (this.tw !== null && this.workerReady && this.workerMode) {
      this.postToWorker(makeSimHostCommand(SimCmdType.RESUME));
      return;
    }
    this.startFallbackPump();
  }

  stop(): void {
    this.hasPendingStart = false;
    this.clearReadyWait();
    if (this.tw !== null) {
      this.postToWorker(makeSimHostCommand(SimCmdType.STOP));
    }
    this.stopFallbackPump();
    this.store.clear();
  }

  loadMcu(data: Uint8Array, offset: number, family: string, localKernel: SimulationKernelImpl): void {
    this.localKernel = localKernel;
    this.pendingFirmware = data;
    this.pendingFirmwareOffset = offset;
    this.pendingFirmwareFamily = family;
    // Always load locally so mirror/debug panels work in fallback
    localKernel.loadMcuProgram(data, offset, family);
    if (this.tw !== null && this.workerReady && this.workerMode) {
      this.postFirmwareToWorker(data, offset, family);
    }
  }

  /**
   * Terminal TX → MCU USART RX (local kernel + worker if active).
   * UI frames come from the Worker kernel — UART_RX must reach the Worker;
   * Worker loop must not use setTimeout(0) (starves onmessage).
   */
  injectUsartRx(bytes: number[], localKernel: SimulationKernelImpl): void {
    if (bytes.length === 0) {
      return;
    }
    const toWorker = this.tw !== null && this.workerReady && this.workerMode;
    traceUart('HOST_RX_FWD',
      `n=${bytes.length} hex=${formatUartBytesHex(bytes)} ` +
      `workerMode=${this.workerMode ? 1 : 0} workerReady=${this.workerReady ? 1 : 0} ` +
      `postWorker=${toWorker ? 1 : 0} (UI frames come from ${toWorker ? 'worker' : 'local'} kernel)`);
    this.localKernel = localKernel;
    localKernel.injectUsartRx(bytes);
    if (toWorker) {
      let hex = '';
      for (let i = 0; i < bytes.length; i++) {
        hex += (bytes[i] & 0xFF).toString(16).toUpperCase().padStart(2, '0');
      }
      this.postToWorker(makeUartRxCommand(hex));
      traceUart('HOST_RX_WORKER_POST', `uartHex=${hex}`);
    }
  }

  private postFirmwareToWorker(data: Uint8Array, offset: number, family: string): void {
    if (this.tw === null) {
      return;
    }
    try {
      const helper = new util.Base64Helper();
      const b64 = helper.encodeToStringSync(data);
      this.postToWorker(makeSimHostCommand(
        SimCmdType.LOAD_MCU, undefined, undefined, undefined, undefined,
        family, offset, b64));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'encode firmware failed';
      Logger.warn(TAG, msg);
    }
  }

  consumeLatest(): SimFramePlain | null {
    return this.store.consumeLatest();
  }

  peek(): SimFramePlain {
    return this.store.peek() ?? emptySimFrame();
  }

  shutdown(): void {
    this.stop();
    if (this.tw !== null) {
      this.postToWorker(makeSimHostCommand(SimCmdType.SHUTDOWN));
      try {
        this.tw.terminate();
      } catch (_e) {
        // ignore
      }
      this.tw = null;
    }
    this.workerReady = false;
    this.workerMode = false;
  }
}
