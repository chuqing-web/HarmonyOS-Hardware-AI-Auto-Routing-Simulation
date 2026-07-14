import { ResultHelper, ErrCode, Logger } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ApiResult } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
export enum IoMode {
    PUSH_PULL = "push_pull",
    OPEN_DRAIN = "open_drain",
    HIGH_Z = "high_z",
    PULL_UP = "pull_up",
    PULL_DOWN = "pull_down"
}
export enum ClockSource {
    HSI = "HSI",
    HSE = "HSE",
    LSI = "LSI",
    LSE = "LSE",
    PLL = "PLL"
}
export interface McuPinState {
    pinId: string;
    mode: IoMode;
    level: number;
    pullResistor: number;
    alternateFunction: string;
    overCurrent: boolean;
}
export interface InterruptEntry {
    name: string;
    priority: number;
    pending: boolean;
    enabled: boolean;
}
export class McuBehaviorSimulator {
    private pinStates: Map<string, McuPinState> = new Map();
    private clockSource: ClockSource = ClockSource.HSE;
    private clockHz: number = 11059200;
    private pllMultiplier: number = 9;
    private crystalAlive: boolean = true;
    private interruptQueue: InterruptEntry[] = [];
    private resetReason: string = 'POR';
    configurePin(mcuUuid: string, pinId: string, mode: IoMode, pullR: number = 10000): void {
        const key = `${mcuUuid}:${pinId}`;
        this.pinStates.set(key, {
            pinId: pinId, mode: mode, level: 0, pullResistor: pullR,
            alternateFunction: 'GPIO', overCurrent: false
        });
    }
    setAlternateFunction(mcuUuid: string, pinId: string, func: string): ApiResult<void> {
        const key = `${mcuUuid}:${pinId}`;
        const pin = this.pinStates.get(key);
        if (!pin)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Pin not configured');
        pin.alternateFunction = func;
        return ResultHelper.ok();
    }
    setClockSource(source: ClockSource, extHz?: number): void {
        this.clockSource = source;
        if (source === ClockSource.HSE && extHz) {
            this.clockHz = extHz;
        }
        else if (source === ClockSource.HSI) {
            this.clockHz = 8000000;
        }
        else if (source === ClockSource.PLL) {
            this.clockHz = (extHz ?? 8000000) * this.pllMultiplier;
        }
        if (!this.crystalAlive && (source === ClockSource.HSE || source === ClockSource.LSE)) {
            this.clockHz = 0;
            Logger.warn('McuBehavior', '晶振失效，时钟停振');
        }
    }
    setCrystalAlive(alive: boolean): void {
        this.crystalAlive = alive;
        if (!alive)
            this.clockHz = 0;
    }
    getEffectiveClockHz(): number { return this.clockHz; }
    getBaudRateDivider(baseBaud: number): number {
        if (this.clockHz <= 0)
            return 0;
        return Math.round(this.clockHz / (16 * baseBaud));
    }
    triggerInterrupt(name: string, priority: number): void {
        this.interruptQueue.push({ name: name, priority: priority, pending: true, enabled: true });
        this.interruptQueue.sort((a: InterruptEntry, b: InterruptEntry) => a.priority - b.priority);
    }
    processInterruptQueue(isrDurationCycles: number): string[] {
        const executed: string[] = [];
        while (this.interruptQueue.length > 0 && this.interruptQueue[0].pending) {
            const entry = this.interruptQueue.shift()!;
            executed.push(entry.name);
            if (isrDurationCycles > 1000) {
                Logger.warn('McuBehavior', `ISR ${entry.name} 执行过长 (${isrDurationCycles} cycles)，建议优化`);
            }
        }
        return executed;
    }
    checkIoOverCurrent(mcuUuid: string, pinId: string, currentMa: number): boolean {
        const key = `${mcuUuid}:${pinId}`;
        const pin = this.pinStates.get(key);
        if (!pin)
            return false;
        if (currentMa > 25) {
            pin.overCurrent = true;
            pin.level *= 0.8;
            return true;
        }
        return false;
    }
    checkP0NoPullUp(mcuUuid: string, pinId: string, floating: boolean): string | null {
        if (pinId.startsWith('P0') && floating) {
            return `51 P0口 ${pinId} 无内部上拉，空载警告`;
        }
        return null;
    }
    applyReset(reason: 'POR' | 'MANUAL' | 'IWDG' | 'WWDG' | 'LVR'): void {
        this.resetReason = reason;
        this.interruptQueue = [];
        this.pinStates.forEach((p: McuPinState) => { p.level = 0; p.overCurrent = false; });
        if (reason === 'LVR')
            Logger.warn('McuBehavior', '低电压检测触发复位');
    }
    getResetReason(): string { return this.resetReason; }
    getPinState(mcuUuid: string, pinId: string): McuPinState | null {
        return this.pinStates.get(`${mcuUuid}:${pinId}`) ?? null;
    }
}
