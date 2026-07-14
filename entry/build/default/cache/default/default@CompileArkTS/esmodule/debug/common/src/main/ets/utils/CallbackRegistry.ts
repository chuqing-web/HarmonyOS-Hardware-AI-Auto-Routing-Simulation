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
    onSelectionChange(handler: SelectionChangeHandler): void {
        this.selectionHandlers.push(handler);
    }
    onErcUpdate(handler: ErcUpdateHandler): void {
        this.ercHandlers.push(handler);
    }
    onWaveRefresh(handler: WaveRefreshHandler): void {
        this.waveHandlers.push(handler);
    }
    onAiRouteProgress(handler: AiRouteProgressHandler): void {
        this.aiRouteHandlers.push(handler);
    }
    onSubCircuitSwitch(handler: SubCircuitSwitchHandler): void {
        this.subCircuitHandlers.push(handler);
    }
    onBreakpointHit(handler: BreakpointHitHandler): void {
        this.breakpointHandlers.push(handler);
    }
    onUartRecv(handler: UartRecvHandler): void {
        this.uartHandlers.push(handler);
    }
    emitSelection(devs: DeviceInst[], nets: NetInfo[]): void {
        for (const h of this.selectionHandlers)
            h(devs, nets);
    }
    emitErc(errors: ErcError[]): void {
        for (const h of this.ercHandlers)
            h(errors);
    }
    emitWave(waves: WaveData[]): void {
        for (const h of this.waveHandlers)
            h(waves);
    }
    emitAiRoute(progress: ProgressInfo): void {
        for (const h of this.aiRouteHandlers)
            h(progress);
    }
    emitSubCircuit(subUuid: string): void {
        for (const h of this.subCircuitHandlers)
            h(subUuid);
    }
    emitBreakpoint(mcuUuid: string, addr: number): void {
        for (const h of this.breakpointHandlers)
            h(mcuUuid, addr);
    }
    emitUart(mcuUuid: string, byte: number): void {
        for (const h of this.uartHandlers)
            h(mcuUuid, byte);
    }
}
