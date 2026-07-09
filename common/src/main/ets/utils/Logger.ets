/**
 * 统一日志工具 — 支持级别控制 + 环形缓冲区文件输出 (7.2.8/7.2.9)
 */
const TAG = 'AI-SCH';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  OFF = 4
}

const RING_BUFFER_MAX = 200;
const EVENT_LOG_MAX = 100;

interface EventLogEntry {
  source: string;
  event: string;
  timestamp: Date;
}

export class Logger {
  private static logLevel: LogLevel = LogLevel.INFO;
  private static ringBuffer: string[] = [];
  private static eventLog: EventLogEntry[] = [];

  static setLogLevel(level: LogLevel): void {
    Logger.logLevel = level;
  }

  static getLogLevel(): LogLevel {
    return Logger.logLevel;
  }

  static debug(module: string, msg: string): void {
    if (Logger.logLevel > LogLevel.DEBUG) return;
    console.debug(`[${TAG}][${module}] ${msg}`);
    Logger.writeRing(`[DEBUG][${module}] ${msg}`);
  }

  static info(module: string, msg: string): void {
    if (Logger.logLevel > LogLevel.INFO) return;
    console.info(`[${TAG}][${module}] ${msg}`);
    Logger.writeRing(`[INFO][${module}] ${msg}`);
  }

  static warn(module: string, msg: string): void {
    if (Logger.logLevel > LogLevel.WARN) return;
    console.warn(`[${TAG}][${module}] ${msg}`);
    Logger.writeRing(`[WARN][${module}] ${msg}`);
  }

  static error(module: string, msg: string): void {
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
    return Logger.ringBuffer.slice();
  }

  /** 清空环形缓冲区 */
  static clearRingBuffer(): void {
    Logger.ringBuffer = [];
  }

  private static writeRing(entry: string): void {
    if (Logger.ringBuffer.length >= RING_BUFFER_MAX) Logger.ringBuffer.shift();
    Logger.ringBuffer.push(`[${new Date().toISOString()}] ${entry}`);
  }
}
