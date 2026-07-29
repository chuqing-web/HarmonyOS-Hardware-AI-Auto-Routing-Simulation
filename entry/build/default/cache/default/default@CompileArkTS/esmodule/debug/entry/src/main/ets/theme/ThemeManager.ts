import ConfigurationConstant from "@ohos:app.ability.ConfigurationConstant";
import type common from "@ohos:app.ability.common";
import { ProteusColors, PcbColors } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import fs from "@ohos:file.fs";
export type ThemeMode = 'light' | 'dark';
export const PROTEUS_THEME_REV_KEY: string = 'proteusThemeRev';
export class ThemeManager {
    private static instance: ThemeManager;
    private mode: ThemeMode = 'light';
    private highContrast: boolean = false;
    private prefPath: string = '';
    private appContext: common.ApplicationContext | null = null;
    static getInstance(): ThemeManager {
        if (!ThemeManager.instance) {
            ThemeManager.instance = new ThemeManager();
        }
        return ThemeManager.instance;
    }
    /** 绑定 ApplicationContext，用于 setColorMode；可在 init 前或后调用 */
    bindApplicationContext(ctx: common.ApplicationContext): void {
        this.appContext = ctx;
        this.syncSystemColorMode();
    }
    init(prefDir: string): void {
        this.prefPath = `${prefDir}/theme.pref`;
        AppStorage.setOrCreate(PROTEUS_THEME_REV_KEY, 0);
        this.loadFromDisk();
        this.applyActivePalette();
    }
    getMode(): ThemeMode { return this.mode; }
    isDark(): boolean { return this.mode === 'dark'; }
    isHighContrast(): boolean { return this.highContrast; }
    setMode(mode: ThemeMode): void {
        this.mode = mode;
        this.saveToDisk();
        this.applyActivePalette();
    }
    setHighContrast(enabled: boolean): void {
        this.highContrast = enabled;
        this.applyActivePalette();
    }
    toggle(): ThemeMode {
        this.mode = this.mode === 'light' ? 'dark' : 'light';
        this.saveToDisk();
        this.applyActivePalette();
        return this.mode;
    }
    applyActivePalette(): void {
        ProteusColors.applyTheme(this.mode === 'dark', this.highContrast);
        PcbColors.applyTheme(this.mode === 'dark');
        this.syncSystemColorMode();
        this.publishThemeRev();
    }
    menuBg(): string {
        return ProteusColors.MENU_BG;
    }
    toolbarBg(): string {
        return ProteusColors.TOOLBAR_BG;
    }
    canvasBg(): string {
        return ProteusColors.CANVAS_BG;
    }
    textPrimary(): string {
        return ProteusColors.TEXT_PRIMARY;
    }
    gridDot(): string {
        return ProteusColors.GRID_DOT;
    }
    wireColor(): string {
        return ProteusColors.WIRE;
    }
    selectedColor(): string {
        return ProteusColors.SELECTED;
    }
    private syncSystemColorMode(): void {
        if (this.appContext === null) {
            return;
        }
        try {
            this.appContext.setColorMode(this.mode === 'dark'
                ? ConfigurationConstant.ColorMode.COLOR_MODE_DARK
                : ConfigurationConstant.ColorMode.COLOR_MODE_LIGHT);
        }
        catch (_e) { /* ignore */ }
    }
    private publishThemeRev(): void {
        let rev = 0;
        const cur = AppStorage.get<number>(PROTEUS_THEME_REV_KEY);
        if (cur !== undefined) {
            rev = cur;
        }
        AppStorage.setOrCreate(PROTEUS_THEME_REV_KEY, rev + 1);
    }
    private loadFromDisk(): void {
        if (this.prefPath.length === 0)
            return;
        try {
            fs.accessSync(this.prefPath);
            const file = fs.openSync(this.prefPath, fs.OpenMode.READ_ONLY);
            const stat = fs.statSync(this.prefPath);
            const buf = new ArrayBuffer(stat.size);
            fs.readSync(file.fd, buf);
            fs.closeSync(file);
            const view = new Uint8Array(buf);
            let text = '';
            for (let i = 0; i < view.length; i++)
                text += String.fromCharCode(view[i]);
            if (text.trim() === 'dark')
                this.mode = 'dark';
        }
        catch (_e) { /* default light */ }
    }
    private saveToDisk(): void {
        if (this.prefPath.length === 0)
            return;
        try {
            const file = fs.openSync(this.prefPath, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
            fs.writeSync(file.fd, this.mode);
            fs.closeSync(file);
        }
        catch (_e) { /* ignore */ }
    }
}
