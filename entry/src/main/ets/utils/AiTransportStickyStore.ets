/**
 * AI HTTP 传输粘性（proxy/DNS）持久化 — 跨进程复用上次成功档，避免每次从直连重试。
 * 存于应用沙箱 api_vault/transport_sticky.json（无密钥）。
 */
import fs from '@ohos.file.fs';
import { Logger, INSTR_TRACE_TAG } from 'common';

export interface StickyTransportEntry {
  apiId: string;
  usingProxy: boolean;
  usePublicDns: boolean;
}

interface StickyFileEnvelope {
  version: number;
  entries: StickyTransportEntry[];
  updatedAt: string;
}

export class AiTransportStickyStore {
  private static instance: AiTransportStickyStore;
  private filePath: string = '';

  static getInstance(): AiTransportStickyStore {
    if (!AiTransportStickyStore.instance) {
      AiTransportStickyStore.instance = new AiTransportStickyStore();
    }
    return AiTransportStickyStore.instance;
  }

  /** baseDir = filesDir/AISchSim */
  init(baseDir: string): void {
    const dir = `${baseDir}/api_vault`;
    this.filePath = `${dir}/transport_sticky.json`;
    try {
      fs.accessSync(dir);
    } catch (_e) {
      try {
        fs.mkdirSync(dir, true);
      } catch (_e2) {
        /* ignore */
      }
    }
  }

  loadAll(): StickyTransportEntry[] {
    if (this.filePath.length === 0) {
      return [];
    }
    try {
      fs.accessSync(this.filePath);
      const file = fs.openSync(this.filePath, fs.OpenMode.READ_ONLY);
      const stat = fs.statSync(this.filePath);
      const buf = new ArrayBuffer(stat.size);
      fs.readSync(file.fd, buf);
      fs.closeSync(file);
      const view = new Uint8Array(buf);
      let text = '';
      for (let i = 0; i < view.length; i++) {
        text += String.fromCharCode(view[i]);
      }
      const parsed = JSON.parse(text) as StickyFileEnvelope;
      if (!parsed || !Array.isArray(parsed.entries)) {
        return [];
      }
      const out: StickyTransportEntry[] = [];
      for (let i = 0; i < parsed.entries.length; i++) {
        const e = parsed.entries[i];
        if (!e || typeof e.apiId !== 'string' || e.apiId.length === 0) {
          continue;
        }
        out.push({
          apiId: e.apiId,
          usingProxy: e.usingProxy === true,
          usePublicDns: e.usePublicDns === true
        });
      }
      Logger.info(INSTR_TRACE_TAG,
        `[AI_API] sticky disk load count=${out.length} path=${this.filePath}`);
      return out;
    } catch (_e) {
      return [];
    }
  }

  saveAll(entries: StickyTransportEntry[]): void {
    if (this.filePath.length === 0) {
      return;
    }
    try {
      const env: StickyFileEnvelope = {
        version: 1,
        entries: entries,
        updatedAt: new Date().toISOString()
      };
      const text = JSON.stringify(env);
      const file = fs.openSync(this.filePath,
        fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
      fs.writeSync(file.fd, text);
      fs.closeSync(file);
      Logger.info(INSTR_TRACE_TAG,
        `[AI_API] sticky disk save count=${entries.length}`);
    } catch (e) {
      Logger.warn(INSTR_TRACE_TAG, `[AI_API] sticky disk save failed: ${e}`);
    }
  }
}
