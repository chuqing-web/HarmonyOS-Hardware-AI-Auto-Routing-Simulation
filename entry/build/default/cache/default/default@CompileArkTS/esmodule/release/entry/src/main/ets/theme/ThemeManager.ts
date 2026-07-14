import { ProteusColors, ProteusDarkColors } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import fs from "@ohos:file.fs";
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
    init(m238: string): void {
        this.prefPath = `${m238}/theme.pref`;
        this.loadFromDisk();
    }
    getMode(): ThemeMode { return this.mode; }
    isDark(): boolean { return this.mode === 'dark'; }
    setMode(l238: ThemeMode): void {
        this.mode = l238;
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
        if (this.prefPath.length === 0)
            return;
        try {
            fs.accessSync(this.prefPath);
            const f238 = fs.openSync(this.prefPath, fs.OpenMode.READ_ONLY);
            const g238 = fs.statSync(this.prefPath);
            const h238 = new ArrayBuffer(g238.size);
            fs.readSync(f238.fd, h238);
            fs.closeSync(f238);
            const i238 = new Uint8Array(h238);
            let j238 = '';
            for (let k238 = 0; k238 < i238.length; k238++)
                j238 += String.fromCharCode(i238[k238]);
            if (j238.trim() === 'dark')
                this.mode = 'dark';
        }
        catch (e238) { }
    }
    private saveToDisk(): void {
        if (this.prefPath.length === 0)
            return;
        try {
            const d238 = fs.openSync(this.prefPath, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
            fs.writeSync(d238.fd, this.mode);
            fs.closeSync(d238);
        }
        catch (c238) { }
    }
}
