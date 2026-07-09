/**
 * 主题切换与持久化（浅色 / 深色）
 */
import { ProteusColors, ProteusDarkColors } from './ProteusTheme';
import fs from '@ohos.file.fs';

export type ThemeMode = 'light' | 'dark';

export class ThemeManager {
  private static instance: ThemeManager;
  private mode: ThemeMode = 'light';
  private prefPath: string = '';

  static getInstance(): ThemeManager {
    if (!ThemeManager.instance) {
      ThemeManager.instance = new ThemeManager();
    }
    return ThemeManager.instance;
  }

  init(prefDir: string): void {
    this.prefPath = `${prefDir}/theme.pref`;
    this.loadFromDisk();
  }

  getMode(): ThemeMode { return this.mode; }
  isDark(): boolean { return this.mode === 'dark'; }

  setMode(mode: ThemeMode): void {
    this.mode = mode;
    this.saveToDisk();
  }

  toggle(): ThemeMode {
    this.mode = this.mode === 'light' ? 'dark' : 'light';
    this.saveToDisk();
    return this.mode;
  }

  menuBg(): string {
    return this.isDark() ? ProteusDarkColors.MENU_BG : ProteusColors.MENU_BG;
  }

  toolbarBg(): string {
    return this.isDark() ? ProteusDarkColors.TOOLBAR_BG : ProteusColors.TOOLBAR_BG;
  }

  canvasBg(): string {
    return this.isDark() ? ProteusDarkColors.CANVAS_BG : ProteusColors.CANVAS_BG;
  }

  textPrimary(): string {
    return this.isDark() ? ProteusDarkColors.TEXT_PRIMARY : ProteusColors.TEXT_PRIMARY;
  }

  gridDot(): string {
    return this.isDark() ? ProteusDarkColors.GRID_DOT : ProteusColors.GRID_DOT;
  }

  wireColor(): string {
    return this.isDark() ? ProteusDarkColors.WIRE : ProteusColors.WIRE;
  }

  selectedColor(): string {
    return this.isDark() ? ProteusDarkColors.SELECTED : ProteusColors.SELECTED;
  }

  private loadFromDisk(): void {
    if (this.prefPath.length === 0) return;
    try {
      fs.accessSync(this.prefPath);
      const file = fs.openSync(this.prefPath, fs.OpenMode.READ_ONLY);
      const stat = fs.statSync(this.prefPath);
      const buf = new ArrayBuffer(stat.size);
      fs.readSync(file.fd, buf);
      fs.closeSync(file);
      const view = new Uint8Array(buf);
      let text = '';
      for (let i = 0; i < view.length; i++) text += String.fromCharCode(view[i]);
      if (text.trim() === 'dark') this.mode = 'dark';
    } catch (_e) { /* default light */ }
  }

  private saveToDisk(): void {
    if (this.prefPath.length === 0) return;
    try {
      const file = fs.openSync(this.prefPath, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
      fs.writeSync(file.fd, this.mode);
      fs.closeSync(file);
    } catch (_e) { /* ignore */ }
  }
}
