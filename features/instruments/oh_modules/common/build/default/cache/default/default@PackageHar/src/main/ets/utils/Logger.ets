/**
 * 统一日志工具 — 支持级别控制 + 环形缓冲区文件输出 (7.2.8/7.2.9)
 * instr_trace 单独保留一份可读缓冲区，供右侧「运行日志」面板展示。
 */
const TAG = 'AI-SCH';

/** 与 InstrumentTraceLog.INSTR_TRACE_TAG 保持一致（避免循环依赖） */
const INSTR_TRACE_MODULE = 'instr_trace';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  OFF = 4
}

const RING_BUFFER_MAX = 200;
const EVENT_LOG_MAX = 100;
const INSTR_TRACE_UI_MAX = 800;

interface EventLogEntry {
  source: string;
  event: string;
  timestamp: Date;
}

export class Logger {
  private static logLevel: LogLevel = LogLevel.INFO;
  private static ringBuffer: string[] = new Array<string>(RING_BUFFER_MAX);
  private static ringPos: number = 0;
  private static ringFull: boolean = false;
  private static eventLog: EventLogEntry[] = [];
  private static instrTraceLines: string[] = [];
  private static instrTraceSeq: number = 0;

  static setLogLevel(level: LogLevel): void {
    Logger.logLevel = level;
  }

  static getLogLevel(): LogLevel {
    return Logger.logLevel;
  }

  static debug(module: string, msg: string): void {
    Logger.captureInstrTrace(module, 'DEBUG', msg);
    if (Logger.logLevel > LogLevel.DEBUG) return;
    console.debug(`[${TAG}][${module}] ${msg}`);
    Logger.writeRing(`[DEBUG][${module}] ${msg}`);
  }

  static info(module: string, msg: string): void {
    Logger.captureInstrTrace(module, 'INFO', msg);
    if (Logger.logLevel > LogLevel.INFO) return;
    console.info(`[${TAG}][${module}] ${msg}`);
    Logger.writeRing(`[INFO][${module}] ${msg}`);
  }

  static warn(module: string, msg: string): void {
    Logger.captureInstrTrace(module, 'WARN', msg);
    if (Logger.logLevel > LogLevel.WARN) return;
    console.warn(`[${TAG}][${module}] ${msg}`);
    Logger.writeRing(`[WARN][${module}] ${msg}`);
  }

  static error(module: string, msg: string): void {
    Logger.captureInstrTrace(module, 'ERROR', msg);
    if (Logger.logLevel > LogLevel.ERROR) return;
    console.error(`[${TAG}][${module}] ${msg}`);
    Logger.writeRing(`[ERROR][${module}] ${msg}`);
  }

  /** 7.2.6 EventBus 事件日志 */
  static logEvent(source: string, event: string): void {
    if (Logger.eventLog.length >= EVENT_LOG_MAX) Logger.eventLog.shift();
    const entry: EventLogEntry = { source: source, event: event, timestamp: new Date() };
    Logger.eventLog.push(entry);
  }

  static getEventLog(): EventLogEntry[] {
    return Logger.eventLog.slice();
  }

  /** 7.2.9 获取环形缓冲区日志 (可用于崩溃后分析) */
  static getRingBuffer(): string[] {
    if (!Logger.ringFull) {
      return Logger.ringBuffer.slice(0, Logger.ringPos);
    }
    const result: string[] = [];
    for (let i = 0; i < RING_BUFFER_MAX; i++) {
      result.push(Logger.ringBuffer[(Logger.ringPos + i) % RING_BUFFER_MAX]);
    }
    return result;
  }

  /** 清空环形缓冲区 */
  static clearRingBuffer(): void {
    Logger.ringBuffer = new Array<string>(RING_BUFFER_MAX);
    Logger.ringPos = 0;
    Logger.ringFull = false;
  }

  /** instr_trace 行数变化序号 — UI 可轮询避免无变化时重建大文本 */
  static getInstrTraceSeq(): number {
    return Logger.instrTraceSeq;
  }

  static getInstrTraceLineCount(): number {
    return Logger.instrTraceLines.length;
  }

  static getInstrTraceLines(): string[] {
    return Logger.instrTraceLines.slice();
  }

  static getInstrTraceText(): string {
    return Logger.instrTraceLines.join('\n');
  }

  static clearInstrTrace(): void {
    Logger.instrTraceLines = [];
    Logger.instrTraceSeq++;
  }

  private static captureInstrTrace(module: string, level: string, msg: string): void {
    if (module !== INSTR_TRACE_MODULE) {
      return;
    }
    const now = new Date();
    const hh = now.getHours().toString().padStart(2, '0');
    const mm = now.getMinutes().toString().padStart(2, '0');
    const ss = now.getSeconds().toString().padStart(2, '0');
    const ms = now.getMilliseconds().toString().padStart(3, '0');
    Logger.instrTraceLines.push(`${hh}:${mm}:${ss}.${ms} [${level}] ${msg}`);
    if (Logger.instrTraceLines.length > INSTR_TRACE_UI_MAX) {
      Logger.instrTraceLines = Logger.instrTraceLines.slice(Logger.instrTraceLines.length - INSTR_TRACE_UI_MAX);
    }
    Logger.instrTraceSeq++;
  }

  private static writeRing(entry: string): void {
    const ts = new Date().toISOString();
    Logger.ringBuffer[Logger.ringPos] = `[${ts}] ${entry}`;
    Logger.ringPos++;
    if (Logger.ringPos >= RING_BUFFER_MAX) {
      Logger.ringPos = 0;
      Logger.ringFull = true;
    }
  }
}
