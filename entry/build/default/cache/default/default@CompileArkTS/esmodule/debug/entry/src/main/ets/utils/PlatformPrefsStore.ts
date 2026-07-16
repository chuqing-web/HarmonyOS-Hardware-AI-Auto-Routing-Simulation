import fs from "@ohos:file.fs";
export interface PlatformPrefs {
    offlineMode: boolean;
    globalProxy: string;
    highContrast: boolean;
    uiScale: number;
    screenReader: boolean;
}
const DEFAULT_PREFS: PlatformPrefs = {
    offlineMode: false,
    globalProxy: '',
    highContrast: false,
    uiScale: 1.0,
    screenReader: false
};
export class PlatformPrefsStore {
    private static instance: PlatformPrefsStore;
    private prefPath: string = '';
    private prefs: PlatformPrefs = {
        offlineMode: false,
        globalProxy: '',
        highContrast: false,
        uiScale: 1.0,
        screenReader: false
    };
    static getInstance(): PlatformPrefsStore {
        if (!PlatformPrefsStore.instance) {
            PlatformPrefsStore.instance = new PlatformPrefsStore();
        }
        return PlatformPrefsStore.instance;
    }
    init(prefDir: string): void {
        this.prefPath = `${prefDir}/platform_settings.json`;
        this.loadFromDisk();
    }
    get(): PlatformPrefs {
        return {
            offlineMode: this.prefs.offlineMode,
            globalProxy: this.prefs.globalProxy,
            highContrast: this.prefs.highContrast,
            uiScale: this.prefs.uiScale,
            screenReader: this.prefs.screenReader
        };
    }
    set(partial: PlatformPrefs): void {
        this.prefs = {
            offlineMode: partial.offlineMode,
            globalProxy: partial.globalProxy,
            highContrast: partial.highContrast,
            uiScale: Math.min(1.5, Math.max(1.0, partial.uiScale)),
            screenReader: partial.screenReader
        };
        this.saveToDisk();
    }
    private loadFromDisk(): void {
        if (this.prefPath.length === 0) {
            return;
        }
        try {
            fs.accessSync(this.prefPath);
            const file = fs.openSync(this.prefPath, fs.OpenMode.READ_ONLY);
            const stat = fs.statSync(this.prefPath);
            const buf = new ArrayBuffer(stat.size);
            fs.readSync(file.fd, buf);
            fs.closeSync(file);
            const view = new Uint8Array(buf);
            let text = '';
            for (let i = 0; i < view.length; i++) {
                text += String.fromCharCode(view[i]);
            }
            const parsed = JSON.parse(text) as PlatformPrefs;
            this.prefs = {
                offlineMode: parsed.offlineMode === true,
                globalProxy: typeof parsed.globalProxy === 'string' ? parsed.globalProxy : '',
                highContrast: parsed.highContrast === true,
                uiScale: typeof parsed.uiScale === 'number'
                    ? Math.min(1.5, Math.max(1.0, parsed.uiScale))
                    : DEFAULT_PREFS.uiScale,
                screenReader: parsed.screenReader === true
            };
        }
        catch (_e) {
            this.prefs = {
                offlineMode: DEFAULT_PREFS.offlineMode,
                globalProxy: DEFAULT_PREFS.globalProxy,
                highContrast: DEFAULT_PREFS.highContrast,
                uiScale: DEFAULT_PREFS.uiScale,
                screenReader: DEFAULT_PREFS.screenReader
            };
        }
    }
    private saveToDisk(): void {
        if (this.prefPath.length === 0) {
            return;
        }
        try {
            const text = JSON.stringify(this.prefs);
            const file = fs.openSync(this.prefPath, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
            fs.writeSync(file.fd, text);
            fs.closeSync(file);
        }
        catch (_e) {
            /* ignore */
        }
    }
}
