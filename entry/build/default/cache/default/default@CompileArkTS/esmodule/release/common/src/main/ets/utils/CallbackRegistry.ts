import type { DeviceInst, NetInfo, ErcError } from '../types/TopologyTypes';
import type { WaveData } from '../types/SimExtendedTypes';
import type { ProgressInfo } from '../types/ProgressTypes';
export type SelectionChangeHandler = (devs: DeviceInst[], nets: NetInfo[]) => void;
export type ErcUpdateHandler = (errors: ErcError[]) => void;
export type WaveRefreshHandler = (waves: WaveData[]) => void;
export type AiRouteProgressHandler = (progress: ProgressInfo) => void;
export type SubCircuitSwitchHandler = (subUuid: string) => void;
export type BreakpointHitHandler = (mcuInstUuid: string, hitAddr: number) => void;
export type UartRecvHandler = (mcuInstUuid: string, byteData: number) => void;
export class CallbackRegistry {
    private static instance: CallbackRegistry;
    private selectionHandlers: SelectionChangeHandler[] = [];
    private ercHandlers: ErcUpdateHandler[] = [];
    private waveHandlers: WaveRefreshHandler[] = [];
    private aiRouteHandlers: AiRouteProgressHandler[] = [];
    private subCircuitHandlers: SubCircuitSwitchHandler[] = [];
    private breakpointHandlers: BreakpointHitHandler[] = [];
    private uartHandlers: UartRecvHandler[] = [];
    static getInstance(): CallbackRegistry {
        if (!CallbackRegistry.instance) {
            CallbackRegistry.instance = new CallbackRegistry();
        }
        return CallbackRegistry.instance;
    }
    onSelectionChange(d13: SelectionChangeHandler): void {
        this.selectionHandlers.push(d13);
    }
    onErcUpdate(c13: ErcUpdateHandler): void {
        this.ercHandlers.push(c13);
    }
    onWaveRefresh(b13: WaveRefreshHandler): void {
        this.waveHandlers.push(b13);
    }
    onAiRouteProgress(a13: AiRouteProgressHandler): void {
        this.aiRouteHandlers.push(a13);
    }
    onSubCircuitSwitch(z12: SubCircuitSwitchHandler): void {
        this.subCircuitHandlers.push(z12);
    }
    onBreakpointHit(y12: BreakpointHitHandler): void {
        this.breakpointHandlers.push(y12);
    }
    onUartRecv(x12: UartRecvHandler): void {
        this.uartHandlers.push(x12);
    }
    emitSelection(u12: DeviceInst[], v12: NetInfo[]): void {
        for (const w12 of this.selectionHandlers)
            w12(u12, v12);
    }
    emitErc(s12: ErcError[]): void {
        for (const t12 of this.ercHandlers)
            t12(s12);
    }
    emitWave(q12: WaveData[]): void {
        for (const r12 of this.waveHandlers)
            r12(q12);
    }
    emitAiRoute(o12: ProgressInfo): void {
        for (const p12 of this.aiRouteHandlers)
            p12(o12);
    }
    emitSubCircuit(m12: string): void {
        for (const n12 of this.subCircuitHandlers)
            n12(m12);
    }
    emitBreakpoint(j12: string, k12: number): void {
        for (const l12 of this.breakpointHandlers)
            l12(j12, k12);
    }
    emitUart(g12: string, h12: number): void {
        for (const i12 of this.uartHandlers)
            i12(g12, h12);
    }
}
