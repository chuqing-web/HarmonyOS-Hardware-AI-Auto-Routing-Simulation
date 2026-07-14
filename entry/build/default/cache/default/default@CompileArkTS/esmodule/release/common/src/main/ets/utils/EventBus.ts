import type { ModuleEvent, ModuleEventHandler, ModuleEventPayload } from '../types/CommonTypes';
import { Logger } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/Logger";
export class EventBus {
    private static instance: EventBus;
    private handlers: Map<ModuleEvent, ModuleEventHandler[]> = new Map();
    private failedHandlers: Set<ModuleEventHandler> = new Set();
    static getInstance(): EventBus {
        if (!EventBus.instance) {
            EventBus.instance = new EventBus();
        }
        return EventBus.instance;
    }
    subscribe(i22: ModuleEvent, j22: ModuleEventHandler): void {
        const k22 = this.handlers.get(i22) ?? [];
        k22.push(j22);
        this.handlers.set(i22, k22);
    }
    unsubscribe(e22: ModuleEvent, f22: ModuleEventHandler): void {
        const g22 = this.handlers.get(e22);
        if (g22) {
            const h22 = g22.indexOf(f22);
            if (h22 >= 0) {
                g22.splice(h22, 1);
            }
            if (g22.length === 0) {
                this.handlers.delete(e22);
            }
        }
        this.failedHandlers.delete(f22);
    }
    publish(y21: ModuleEventPayload): void {
        const z21 = this.handlers.get(y21.event);
        if (!z21) {
            return;
        }
        const a22 = z21.slice();
        for (let b22 = 0; b22 < a22.length; b22++) {
            const c22 = a22[b22];
            if (this.failedHandlers.has(c22)) {
                continue;
            }
            try {
                c22(y21);
            }
            catch (d22) {
                Logger.error('EventBus', `Handler failed for ${y21.event}: ${d22}`);
                this.failedHandlers.add(c22);
            }
        }
    }
    async publishAsync(s21: ModuleEventPayload): Promise<void> {
        const t21 = this.handlers.get(s21.event);
        if (!t21) {
            return;
        }
        const u21 = t21.slice();
        for (let v21 = 0; v21 < u21.length; v21++) {
            const w21 = u21[v21];
            if (this.failedHandlers.has(w21)) {
                continue;
            }
            try {
                w21(s21);
            }
            catch (x21) {
                Logger.error('EventBus', `Async handler failed for ${s21.event}: ${x21}`);
                this.failedHandlers.add(w21);
            }
        }
    }
    clearFailedHandlers(): void {
        this.failedHandlers.clear();
    }
    clear(): void {
        this.handlers.clear();
        this.failedHandlers.clear();
    }
}
