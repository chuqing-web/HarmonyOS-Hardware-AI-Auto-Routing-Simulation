/**

 * 仿真性能优化：视口剔除 + 动态步长调度

 */

import { SchTopology } from '../types/TopologyTypes';

import { SimConfig } from '../types/SimExtendedTypes';

import { copySchTopologyWithDevices } from './MapHelpers';



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

  static filterVisibleDevices(topo: SchTopology, viewport: ViewportBounds): SchTopology {

    const defaultSize = 80;

    const visible = topo.deviceList.filter(d =>

      d.x + defaultSize >= viewport.x &&

      d.x <= viewport.x + viewport.width &&

      d.y + defaultSize >= viewport.y &&

      d.y <= viewport.y + viewport.height

    );

    return copySchTopologyWithDevices(topo, visible);

  }



  static adaptiveStepSize(config: SimConfig, maxFreqHz: number): number {

    if (maxFreqHz > 1e6) {

      return Math.min(config.minTimeStep, 1e-8);

    }

    if (maxFreqHz > 1e3) {

      return Math.min(config.minTimeStep, 1e-6);

    }

    return Math.max(config.minTimeStep, 1e-4);

  }



  static shouldFreezeNet(lastVoltage: number, currentVoltage: number, threshold: number = 1e-6): boolean {

    return Math.abs(lastVoltage - currentVoltage) < threshold;

  }



  static waveViewportSlice(timeAxis: number[], voltageAxis: number[],

    tMin: number, tMax: number): WaveViewportSlice {

    const start = timeAxis.findIndex(t => t >= tMin);

    const end = timeAxis.findIndex(t => t > tMax);

    const s = start < 0 ? 0 : start;

    const e = end < 0 ? timeAxis.length : end;

    const slice: WaveViewportSlice = {

      timeAxis: timeAxis.slice(s, e),

      voltageAxis: voltageAxis.slice(s, e)

    };

    return slice;

  }

}

