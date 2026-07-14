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
    register(k240: ShortcutBinding): void {
        this.bindings.push(k240);
    }
    unregister(h240: string, i240: boolean = false): void {
        this.bindings = this.bindings.filter((j240: ShortcutBinding) => !(j240.key === h240 && (j240.ctrl ?? false) === i240));
    }
    handleKey(b240: string, c240: boolean = false, d240: boolean = false, e240: boolean = false): boolean {
        for (let f240 = 0; f240 < this.bindings.length; f240++) {
            const g240 = this.bindings[f240];
            if (g240.key.toLowerCase() === b240.toLowerCase() &&
                (g240.ctrl ?? false) === c240 &&
                (g240.shift ?? false) === d240 &&
                (g240.alt ?? false) === e240) {
                g240.handler();
                return true;
            }
        }
        return false;
    }
    getAllBindings(): ShortcutBinding[] {
        return this.bindings.slice();
    }
    rebindShortcut(v239: string, w239: boolean, x239: string, y239: boolean): boolean {
        for (let z239 = 0; z239 < this.bindings.length; z239++) {
            const a240 = this.bindings[z239];
            if (a240.key.toLowerCase() === v239.toLowerCase() && (a240.ctrl ?? false) === w239) {
                a240.key = x239;
                a240.ctrl = y239;
                return true;
            }
        }
        return false;
    }
    clear(): void {
        this.bindings = [];
    }
}
