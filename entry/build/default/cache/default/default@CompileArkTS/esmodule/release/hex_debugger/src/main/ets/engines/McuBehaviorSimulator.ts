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
    configurePin(h376: string, i376: string, j376: IoMode, k376: number = 10000): void {
        const l376 = `${h376}:${i376}`;
        this.pinStates.set(l376, {
            pinId: i376, mode: j376,
            level: 0,
            pullResistor: k376,
            alternateFunction: 'GPIO', overCurrent: false
        });
    }
    setAlternateFunction(c376: string, d376: string, e376: string): ApiResult<void> {
        const f376 = `${c376}:${d376}`;
        const g376 = this.pinStates.get(f376);
        if (!g376)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Pin not configured');
        g376.alternateFunction = e376;
        return ResultHelper.ok();
    }
    setClockSource(a376: ClockSource, b376?: number): void {
        this.clockSource = a376;
        if (a376 === ClockSource.HSE && b376) {
            this.clockHz = b376;
        }
        else if (a376 === ClockSource.HSI) {
            this.clockHz = 8000000;
        }
        else if (a376 === ClockSource.PLL) {
            this.clockHz = (b376 ?? 8000000) * this.pllMultiplier;
        }
        if (!this.crystalAlive && (a376 === ClockSource.HSE || a376 === ClockSource.LSE)) {
            this.clockHz = 0;
            Logger.warn('McuBehavior', '晶振失效，时钟停振');
        }
    }
    setCrystalAlive(z375: boolean): void {
        this.crystalAlive = z375;
        if (!z375)
            this.clockHz = 0;
    }
    getEffectiveClockHz(): number { return this.clockHz; }
    getBaudRateDivider(y375: number): number {
        if (this.clockHz <= 0)
            return 0;
        return Math.round(this.clockHz / (16 * y375));
    }
    triggerInterrupt(u375: string, v375: number): void {
        this.interruptQueue.push({ name: u375, priority: v375, pending: true, enabled: true });
        this.interruptQueue.sort((w375: InterruptEntry, x375: InterruptEntry) => w375.priority - x375.priority);
    }
    processInterruptQueue(r375: number): string[] {
        const s375: string[] = [];
        while (this.interruptQueue.length > 0 && this.interruptQueue[0].pending) {
            const t375 = this.interruptQueue.shift()!;
            s375.push(t375.name);
            if (r375 > 1000) {
                Logger.warn('McuBehavior', `ISR ${t375.name} 执行过长 (${r375} cycles)，建议优化`);
            }
        }
        return s375;
    }
    checkIoOverCurrent(m375: string, n375: string, o375: number): boolean {
        const p375 = `${m375}:${n375}`;
        const q375 = this.pinStates.get(p375);
        if (!q375)
            return false;
        if (o375 > 25) {
            q375.overCurrent = true;
            q375.level *= 0.8;
            return true;
        }
        return false;
    }
    checkP0NoPullUp(j375: string, k375: string, l375: boolean): string | null {
        if (k375.startsWith('P0') && l375) {
            return `51 P0口 ${k375} 无内部上拉，空载警告`;
        }
        return null;
    }
    applyReset(h375: 'POR' | 'MANUAL' | 'IWDG' | 'WWDG' | 'LVR'): void {
        this.resetReason = h375;
        this.interruptQueue = [];
        this.pinStates.forEach((i375: McuPinState) => { i375.level = 0; i375.overCurrent = false; });
        if (h375 === 'LVR')
            Logger.warn('McuBehavior', '低电压检测触发复位');
    }
    getResetReason(): string { return this.resetReason; }
    getPinState(f375: string, g375: string): McuPinState | null {
        return this.pinStates.get(`${f375}:${g375}`) ?? null;
    }
}
