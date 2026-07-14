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
    private static ringBuffer: string[] = new Array<string>(RING_BUFFER_MAX);
    private static ringPos: number = 0;
    private static ringFull: boolean = false;
    private static eventLog: EventLogEntry[] = [];
    static setLogLevel(s39: LogLevel): void {
        Logger.logLevel = s39;
    }
    static getLogLevel(): LogLevel {
        return Logger.logLevel;
    }
    static debug(q39: string, r39: string): void {
        if (Logger.logLevel > LogLevel.DEBUG)
            return;
        console.debug(`[${TAG}][${q39}] ${r39}`);
        Logger.writeRing(`[DEBUG][${q39}] ${r39}`);
    }
    static info(o39: string, p39: string): void {
        if (Logger.logLevel > LogLevel.INFO)
            return;
        console.info(`[${TAG}][${o39}] ${p39}`);
        Logger.writeRing(`[INFO][${o39}] ${p39}`);
    }
    static warn(m39: string, n39: string): void {
        if (Logger.logLevel > LogLevel.WARN)
            return;
        console.warn(`[${TAG}][${m39}] ${n39}`);
        Logger.writeRing(`[WARN][${m39}] ${n39}`);
    }
    static error(k39: string, l39: string): void {
        if (Logger.logLevel > LogLevel.ERROR)
            return;
        console.error(`[${TAG}][${k39}] ${l39}`);
        Logger.writeRing(`[ERROR][${k39}] ${l39}`);
    }
    static logEvent(h39: string, i39: string): void {
        if (Logger.eventLog.length >= EVENT_LOG_MAX)
            Logger.eventLog.shift();
        const j39: EventLogEntry = { source: h39, event: i39, timestamp: new Date() };
        Logger.eventLog.push(j39);
    }
    static getEventLog(): EventLogEntry[] {
        return Logger.eventLog.slice();
    }
    static getRingBuffer(): string[] {
        if (!Logger.ringFull) {
            return Logger.ringBuffer.slice(0, Logger.ringPos);
        }
        const f39: string[] = [];
        for (let g39 = 0; g39 < RING_BUFFER_MAX; g39++) {
            f39.push(Logger.ringBuffer[(Logger.ringPos + g39) % RING_BUFFER_MAX]);
        }
        return f39;
    }
    static clearRingBuffer(): void {
        Logger.ringBuffer = new Array<string>(RING_BUFFER_MAX);
        Logger.ringPos = 0;
        Logger.ringFull = false;
    }
    private static writeRing(d39: string): void {
        const e39 = new Date().toISOString();
        Logger.ringBuffer[Logger.ringPos] = `[${e39}] ${d39}`;
        Logger.ringPos++;
        if (Logger.ringPos >= RING_BUFFER_MAX) {
            Logger.ringPos = 0;
            Logger.ringFull = true;
        }
    }
}
