import type { SchTopology } from '../types/TopologyTypes';
import type { SimConfig } from '../types/SimExtendedTypes';
import { copySchTopologyWithDevices } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/MapHelpers";
export interface ViewportBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface WaveViewportSlice {
    timeAxis: number[];
    voltageAxis: number[];
}
export class PerformanceOptimizer {
    static filterVisibleDevices(o48: SchTopology, p48: ViewportBounds): SchTopology {
        const q48 = 80;
        const r48 = o48.deviceList.filter(s48 => s48.x + q48 >= p48.x &&
            s48.x <= p48.x + p48.width &&
            s48.y + q48 >= p48.y &&
            s48.y <= p48.y + p48.height);
        return copySchTopologyWithDevices(o48, r48);
    }
    static adaptiveStepSize(m48: SimConfig, n48: number): number {
        if (n48 > 1e6) {
            return Math.min(m48.minTimeStep, 1e-8);
        }
        if (n48 > 1e3) {
            return Math.min(m48.minTimeStep, 1e-6);
        }
        return Math.max(m48.minTimeStep, 1e-4);
    }
    static shouldFreezeNet(j48: number, k48: number, l48: number = 1e-6): boolean {
        return Math.abs(j48 - k48) < l48;
    }
    static waveViewportSlice(y47: number[], z47: number[], a48: number, b48: number): WaveViewportSlice {
        const c48 = y47.findIndex(i48 => i48 >= a48);
        const d48 = y47.findIndex(h48 => h48 > b48);
        const e48 = c48 < 0 ? 0 : c48;
        const f48 = d48 < 0 ? y47.length : d48;
        const g48: WaveViewportSlice = {
            timeAxis: y47.slice(e48, f48),
            voltageAxis: z47.slice(e48, f48)
        };
        return g48;
    }
}
