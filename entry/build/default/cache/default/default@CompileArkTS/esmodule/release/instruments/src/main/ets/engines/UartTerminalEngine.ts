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
    setAutoNewline(b395: boolean): void {
        this.config.autoNewline = b395;
    }
    getConfig(): UartTerminalConfig {
        return {
            hexMode: this.config.hexMode,
            autoNewline: this.config.autoNewline,
            loopIntervalMs: this.config.loopIntervalMs,
            timestampLog: this.config.timestampLog
        };
    }
    hexSend(z394: string): void {
        const a395 = z394.replace(/\s+/g, '').toUpperCase();
        if (!/^[0-9A-F]*$/.test(a395) || a395.length % 2 !== 0) {
            return;
        }
        this.txBuffer += a395;
        this.appendLog(`TX: ${this.formatHex(a395)}`);
        this.simulateEcho(a395);
    }
    hexReceive(): string {
        const y394 = this.rxBuffer;
        this.rxBuffer = '';
        if (y394.length > 0) {
            this.appendLog(`RX: ${this.formatHex(y394)}`);
        }
        return y394;
    }
    getLog(): string {
        return this.logLines.join('\n');
    }
    clearLog(): void {
        this.logLines = [];
    }
    async runTimedScript(w394: TimedScriptCommand[]): Promise<void> {
        if (this.scriptRunning)
            return;
        this.scriptRunning = true;
        try {
            for (const x394 of w394) {
                await this.delay(x394.delayMs);
                if (x394.command.startsWith('SEND ')) {
                    this.hexSend(x394.command.substring(5).trim());
                }
                else if (x394.command === 'RECEIVE') {
                    this.hexReceive();
                }
                else {
                    this.appendLog(`SCRIPT: ${x394.command}`);
                }
            }
        }
        finally {
            this.scriptRunning = false;
        }
    }
    private simulateEcho(r394: string): void {
        const s394: number[] = [];
        for (let v394 = 0; v394 < r394.length; v394 += 2) {
            s394.push(parseInt(r394.substring(v394, v394 + 2), 16));
        }
        const t394 = s394.map(u394 => ((u394 + 1) & 0xFF).toString(16).toUpperCase().padStart(2, '0')).join('');
        this.rxBuffer += t394;
    }
    private formatHex(n394: string): string {
        const o394: string[] = [];
        for (let q394 = 0; q394 < n394.length; q394 += 2) {
            o394.push(n394.substring(q394, q394 + 2));
        }
        let p394 = o394.join(' ');
        if (this.config.autoNewline)
            p394 += '\n';
        return p394;
    }
    private appendLog(l394: string): void {
        const m394 = this.config.timestampLog ? `[${Date.now()}] ` : '';
        this.logLines.push(m394 + l394);
    }
    private delay(j394: number): Promise<void> {
        return new Promise(k394 => setTimeout(k394, j394));
    }
}
