import type { UartTerminalConfig } from 'common';
import type { TimedScriptCommand } from '../api/IVirtualInstruments';
export class UartTerminalEngine {
    private config: UartTerminalConfig = {
        hexMode: true,
        autoNewline: true,
        loopIntervalMs: 100,
        timestampLog: true
    };
    private txBuffer: string = '';
    private rxBuffer: string = '';
    private logLines: string[] = [];
    private scriptRunning: boolean = false;
    /** 空闲固件 TX 0x55 刷屏：累计后合并成一行，避免淹没回显 */
    private pendingIdle55: number = 0;
    private static readonly IDLE55_FLUSH = 48;
    private static readonly LOG_CAP = 200;
    setAutoNewline(enabled: boolean): void {
        this.config.autoNewline = enabled;
    }
    getConfig(): UartTerminalConfig {
        return {
            hexMode: this.config.hexMode,
            autoNewline: this.config.autoNewline,
            loopIntervalMs: this.config.loopIntervalMs,
            timestampLog: this.config.timestampLog
        };
    }
    hexSend(hex: string): void {
        const cleaned = hex.replace(/\s+/g, '').toUpperCase();
        if (!/^[0-9A-F]*$/.test(cleaned) || cleaned.length % 2 !== 0) {
            return;
        }
        this.flushIdle55();
        this.txBuffer += cleaned;
        this.appendLog(`TX: ${this.formatHex(cleaned)}`);
        // Real RX comes from MCU USART TX (ingestMcuTxBytes), not a local +1 stub.
    }
    /** MCU USART DR TX bytes arrive as terminal RX (crossing TX/RX wires). */
    ingestMcuTxBytes(bytes: number[]): void {
        if (bytes.length === 0) {
            return;
        }
        let all55 = true;
        for (let i = 0; i < bytes.length; i++) {
            if ((bytes[i] & 0xFF) !== 0x55) {
                all55 = false;
                break;
            }
        }
        let hex = '';
        for (let i = 0; i < bytes.length; i++) {
            hex += (bytes[i] & 0xFF).toString(16).toUpperCase().padStart(2, '0');
        }
        this.rxBuffer += hex;
        // Cap RX buffer so 「收」不会吐出几兆 55
        if (this.rxBuffer.length > 512) {
            this.rxBuffer = this.rxBuffer.substring(this.rxBuffer.length - 512);
        }
        if (all55) {
            this.pendingIdle55 += bytes.length;
            if (this.pendingIdle55 >= UartTerminalEngine.IDLE55_FLUSH) {
                this.flushIdle55();
            }
            return;
        }
        this.flushIdle55();
        this.appendLog(`RX: ${this.formatHex(hex)}`);
    }
    /**
     * Drain rxBuffer hex (side-effect). Prefer getLog() for UI display —
     * 「收」 historically bound to this and showed raw 5555… spam.
     */
    hexReceive(): string {
        this.flushIdle55();
        const data = this.rxBuffer;
        this.rxBuffer = '';
        return data;
    }
    getLog(): string {
        this.flushIdle55();
        return this.logLines.join('\n');
    }
    clearLog(): void {
        this.logLines = [];
        this.pendingIdle55 = 0;
        this.rxBuffer = '';
    }
    async runTimedScript(commands: TimedScriptCommand[]): Promise<void> {
        if (this.scriptRunning)
            return;
        this.scriptRunning = true;
        try {
            for (const cmd of commands) {
                await this.delay(cmd.delayMs);
                if (cmd.command.startsWith('SEND ')) {
                    this.hexSend(cmd.command.substring(5).trim());
                }
                else if (cmd.command === 'RECEIVE') {
                    this.hexReceive();
                }
                else {
                    this.appendLog(`SCRIPT: ${cmd.command}`);
                }
            }
        }
        finally {
            this.scriptRunning = false;
        }
    }
    private formatHex(hex: string): string {
        const parts: string[] = [];
        for (let i = 0; i < hex.length; i += 2) {
            parts.push(hex.substring(i, i + 2));
        }
        // Do NOT embed '\n' here — each appendLog entry is already one UI line
        return parts.join(' ');
    }
    private flushIdle55(): void {
        if (this.pendingIdle55 <= 0) {
            return;
        }
        const n = this.pendingIdle55;
        this.pendingIdle55 = 0;
        this.appendLog(`RX: (idle 0x55 ×${n})`);
    }
    private appendLog(line: string): void {
        const prefix = this.config.timestampLog ? `[${Date.now()}] ` : '';
        this.logLines.push(prefix + line);
        if (this.logLines.length > UartTerminalEngine.LOG_CAP) {
            this.logLines = this.logLines.slice(this.logLines.length - UartTerminalEngine.LOG_CAP);
        }
    }
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
