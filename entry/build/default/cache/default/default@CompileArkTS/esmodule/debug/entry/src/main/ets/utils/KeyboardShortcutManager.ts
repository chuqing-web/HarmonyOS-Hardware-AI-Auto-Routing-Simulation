/**
 * 统一快捷键注册与管理
 */
export type ShortcutHandler = () => void;
export interface ShortcutBinding {
    key: string;
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    description: string;
    handler: ShortcutHandler;
}
export class KeyboardShortcutManager {
    private static instance: KeyboardShortcutManager;
    private bindings: ShortcutBinding[] = [];
    static getInstance(): KeyboardShortcutManager {
        if (!KeyboardShortcutManager.instance) {
            KeyboardShortcutManager.instance = new KeyboardShortcutManager();
        }
        return KeyboardShortcutManager.instance;
    }
    register(binding: ShortcutBinding): void {
        this.bindings.push(binding);
    }
    unregister(key: string, ctrl: boolean = false): void {
        this.bindings = this.bindings.filter((b: ShortcutBinding) => !(b.key === key && (b.ctrl ?? false) === ctrl));
    }
    handleKey(key: string, ctrl: boolean = false, shift: boolean = false, alt: boolean = false): boolean {
        for (let i = 0; i < this.bindings.length; i++) {
            const b = this.bindings[i];
            if (b.key.toLowerCase() === key.toLowerCase() &&
                (b.ctrl ?? false) === ctrl &&
                (b.shift ?? false) === shift &&
                (b.alt ?? false) === alt) {
                b.handler();
                return true;
            }
        }
        return false;
    }
    getAllBindings(): ShortcutBinding[] {
        return this.bindings.slice();
    }
    rebindShortcut(key: string, ctrl: boolean, newKey: string, newCtrl: boolean): boolean {
        for (let i = 0; i < this.bindings.length; i++) {
            const b = this.bindings[i];
            if (b.key.toLowerCase() === key.toLowerCase() && (b.ctrl ?? false) === ctrl) {
                b.key = newKey;
                b.ctrl = newCtrl;
                return true;
            }
        }
        return false;
    }
    clear(): void {
        this.bindings = [];
    }
}
