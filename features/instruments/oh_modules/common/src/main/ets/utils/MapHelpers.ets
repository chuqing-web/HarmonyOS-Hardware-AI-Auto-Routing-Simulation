/**
 * ArkTS-safe map/array helpers (no spread, no Record utility types).
 */
import { Point2D, Rotation } from '../types/CommonTypes';
import { SchTopology, DeviceInst, RouteLine, NetNodeRef } from '../types/TopologyTypes';
import { DeviceRequirement } from '../types/AiExtendedTypes';
import util from '@ohos.util';

export function copyStringMap(source: Map<string, string>): Map<string, string> {
  const copy = new Map<string, string>();
  if (source !== undefined && source !== null && typeof (source as Map<string, string>).forEach === 'function') {
    source.forEach((value: string, key: string) => {
      copy.set(key, value);
    });
  }
  return copy;
}

/**
 * 确保 params 为可写 Map。
 * JSON.parse(JSON.stringify) 会把 Map 变成普通对象，调用 .set 会抛 "undefined is not callable"。
 */
export function ensureStringMap(source: Map<string, string> | Record<string, string> | null | undefined):
  Map<string, string> {
  if (source !== undefined && source !== null &&
    typeof (source as Map<string, string>).set === 'function' &&
    typeof (source as Map<string, string>).forEach === 'function') {
    return source as Map<string, string>;
  }
  const map = new Map<string, string>();
  if (source !== undefined && source !== null && typeof source === 'object') {
    const keys = Object.keys(source as Record<string, string>);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = (source as Record<string, string>)[k];
      if (v !== undefined && v !== null) {
        map.set(k, `${v}`);
      }
    }
  }
  return map;
}

export function copyNumberMap(source: Map<string, number>): Map<string, number> {
  const copy = new Map<string, number>();
  source.forEach((value: number, key: string) => {
    copy.set(key, value);
  });
  return copy;
}

export function paramMapGet(params: Map<string, string>, key: string, fallback: string): string {
  const val = params.get(key);
  if (val !== undefined) {
    return val;
  }
  return fallback;
}

/** 解析 "5V" / "3.3" 等为伏特数值 */
export function parseVoltageVolts(value: string, fallback: number = 5): number {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return fallback;
  }
  const numeric = parseFloat(trimmed.replace(/[^\d.]/g, ''));
  if (isNaN(numeric) || numeric <= 0) {
    return fallback;
  }
  return numeric;
}

export function appendArray<T>(target: T[], source: T[]): void {
  for (let i = 0; i < source.length; i++) {
    target.push(source[i]);
  }
}

export function arrayMin(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  let min = values[0];
  for (let i = 1; i < values.length; i++) {
    if (values[i] < min) {
      min = values[i];
    }
  }
  return min;
}

export function arrayMax(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  let max = values[0];
  for (let i = 1; i < values.length; i++) {
    if (values[i] > max) {
      max = values[i];
    }
  }
  return max;
}

export function arrayBufferToString(buffer: ArrayBuffer): string {
  const decoder = util.TextDecoder.create('utf-8', { ignoreBOM: true });
  const input = new Uint8Array(buffer);
  const result = decoder.decodeToString(input);
  return result;
}

export function normalizeRotation(degrees: number): Rotation {
  const normalized = ((degrees % 360) + 360) % 360;
  if (normalized === 90) {
    return 90;
  }
  if (normalized === 180) {
    return 180;
  }
  if (normalized === 270) {
    return 270;
  }
  return 0;
}

export function copySchTopologyWithDevices(topo: SchTopology, deviceList: DeviceInst[]): SchTopology {
  return {
    schUuid: topo.schUuid,
    schName: topo.schName,
    layerDepth: topo.layerDepth,
    deviceList: deviceList,
    netList: topo.netList,
    busList: topo.busList,
    wireList: topo.wireList,
    subCircuitList: topo.subCircuitList,
    probeList: topo.probeList,
    textAnnotate: topo.textAnnotate,
    netLabelList: topo.netLabelList,
    ercErrorList: topo.ercErrorList,
    gridStep: topo.gridStep,
    bgColor: topo.bgColor
  };
}

export function emptyStringMap(): Map<string, string> {
  return new Map<string, string>();
}

export function emptyNumberMap(): Map<string, number> {
  return new Map<string, number>();
}

export function stringMap1(k1: string, v1: string): Map<string, string> {
  const m = new Map<string, string>();
  m.set(k1, v1);
  return m;
}

export function stringMap2(k1: string, v1: string, k2: string, v2: string): Map<string, string> {
  const m = new Map<string, string>();
  m.set(k1, v1);
  m.set(k2, v2);
  return m;
}

export function makeRouteLine(netUuid: string, points: Point2D[], isBus: boolean): RouteLine {
  const line: RouteLine = { netUuid: netUuid, points: points, isBus: isBus };
  return line;
}

export function makeNetNodeRef(devUuid: string, pinId: string, pinName: string = ''): NetNodeRef {
  const name = pinName.length > 0 ? pinName : pinId;
  const ref: NetNodeRef = { devUuid: devUuid, pinId: pinId, pinName: name };
  return ref;
}

export function makeDeviceInst(
  instUuid: string, libDevId: string, refName: string,
  x: number, y: number, rotate: number, params: Map<string, string>
): DeviceInst {
  const inst: DeviceInst = {
    instUuid: instUuid,
    libDevId: libDevId,
    refName: refName,
    x: x,
    y: y,
    rotate: rotate,
    mirrorH: false,
    mirrorV: false,
    params: params,
    pinVoltage: emptyNumberMap(),
    hidden: false,
    subCircuitRef: '',
    ercErrorMsg: ''
  };
  return inst;
}

export function makeDeviceRequirement(
  func: string, devType: string, priority: number,
  paramConstraint: Map<string, string>, explicitModel?: string
): DeviceRequirement {
  const req: DeviceRequirement = {
    func: func,
    devType: devType,
    paramConstraint: paramConstraint,
    priority: priority
  };
  if (explicitModel !== undefined) {
    req.explicitModel = explicitModel;
  }
  return req;
}

export function emptySchTopology(): SchTopology {
  const topo: SchTopology = {
    schUuid: '',
    schName: '',
    layerDepth: 0,
    deviceList: [],
    netList: [],
    busList: [],
    wireList: [],
    subCircuitList: [],
    probeList: [],
    textAnnotate: [],
    netLabelList: [],
    ercErrorList: [],
    gridStep: 10,
    bgColor: '#0a0a1a'
  };
  return topo;
}
