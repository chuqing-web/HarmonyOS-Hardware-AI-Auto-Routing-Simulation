/**
 * UART 终端仿真引擎
 */
import { UartTerminalConfig } from 'common';
import { TimedScriptCommand } from '../api/IVirtualInstruments';

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
    this.txBuffer += cleaned;
    this.appendLog(`TX: ${this.formatHex(cleaned)}`);
    this.simulateEcho(cleaned);
  }

  hexReceive(): string {
    const data = this.rxBuffer;
    this.rxBuffer = '';
    if (data.length > 0) {
      this.appendLog(`RX: ${this.formatHex(data)}`);
    }
    return data;
  }

  getLog(): string {
    return this.logLines.join('\n');
  }

  clearLog(): void {
    this.logLines = [];
  }

  async runTimedScript(commands: TimedScriptCommand[]): Promise<void> {
    if (this.scriptRunning) return;
    this.scriptRunning = true;
    try {
      for (const cmd of commands) {
        await this.delay(cmd.delayMs);
        if (cmd.command.startsWith('SEND ')) {
          this.hexSend(cmd.command.substring(5).trim());
        } else if (cmd.command === 'RECEIVE') {
          this.hexReceive();
        } else {
          this.appendLog(`SCRIPT: ${cmd.command}`);
        }
      }
    } finally {
      this.scriptRunning = false;
    }
  }

  private simulateEcho(hex: string): void {
    const bytes: number[] = [];
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.substring(i, i + 2), 16));
    }
    const echo = bytes.map(b => ((b + 1) & 0xFF).toString(16).toUpperCase().padStart(2, '0')).join('');
    this.rxBuffer += echo;
  }

  private formatHex(hex: string): string {
    const parts: string[] = [];
    for (let i = 0; i < hex.length; i += 2) {
      parts.push(hex.substring(i, i + 2));
    }
    let result = parts.join(' ');
    if (this.config.autoNewline) result += '\n';
    return result;
  }

  private appendLog(line: string): void {
    const prefix = this.config.timestampLog ? `[${Date.now()}] ` : '';
    this.logLines.push(prefix + line);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
