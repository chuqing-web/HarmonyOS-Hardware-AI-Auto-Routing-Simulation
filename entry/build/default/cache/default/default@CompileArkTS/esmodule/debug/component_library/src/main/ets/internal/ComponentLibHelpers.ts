import type { Point2D, Pin, PinType, DeviceParamValue, DeviceMeta, LibDevice } from 'common';
import type { ComponentDefinition } from '../api/IComponentLibrary';
import util from "@ohos:util";
export function makePoint(x: number, y: number): Point2D {
    const point: Point2D = { x: x, y: y };
    return point;
}
export function makePin(id: string, name: string, number: string, type: PinType, x: number, y: number): Pin {
    const pin: Pin = {
        id: id,
        name: name,
        number: number,
        type: type,
        position: makePoint(x, y)
    };
    return pin;
}
export function emptyParams(): Map<string, string> {
    return new Map<string, string>();
}
export function params1(k1: string, v1: string): Map<string, string> {
    const m = new Map<string, string>();
    m.set(k1, v1);
    return m;
}
export function params2(k1: string, v1: string, k2: string, v2: string): Map<string, string> {
    const m = new Map<string, string>();
    m.set(k1, v1);
    m.set(k2, v2);
    return m;
}
export function params3(k1: string, v1: string, k2: string, v2: string, k3: string, v3: string): Map<string, string> {
    const m = new Map<string, string>();
    m.set(k1, v1);
    m.set(k2, v2);
    m.set(k3, v3);
    return m;
}
export function params4(k1: string, v1: string, k2: string, v2: string, k3: string, v3: string, k4: string, v4: string): Map<string, string> {
    const m = params3(k1, v1, k2, v2, k3, v3);
    m.set(k4, v4);
    return m;
}
export function params5(k1: string, v1: string, k2: string, v2: string, k3: string, v3: string, k4: string, v4: string, k5: string, v5: string): Map<string, string> {
    const m = params4(k1, v1, k2, v2, k3, v3, k4, v4);
    m.set(k5, v5);
    return m;
}
export function copyParamMap(source: Map<string, string>): Map<string, string> {
    const copy = new Map<string, string>();
    source.forEach((value: string, key: string) => {
        copy.set(key, value);
    });
    return copy;
}
export function deviceMetaParamsToMap(meta: DeviceMeta, converter: (val: DeviceParamValue) => string): Map<string, string> {
    const m = new Map<string, string>();
    const source: Record<string, Object> = meta.default_params;
    const keys = Object.keys(source);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const rawVal: Object = source[key];
        m.set(key, converter(rawVal as DeviceParamValue));
    }
    return m;
}
export function copyStringArray(source: string[]): string[] {
    const result: string[] = [];
    for (let i = 0; i < source.length; i++) {
        result.push(source[i]);
    }
    return result;
}
export function appendComponents(target: ComponentDefinition[], source: ComponentDefinition[]): void {
    for (let i = 0; i < source.length; i++) {
        target.push(source[i]);
    }
}
export function arrayBufferToString(buffer: ArrayBuffer): string {
    const decoder = util.TextDecoder.create('utf-8', { ignoreBOM: true });
    const input = new Uint8Array(buffer);
    const result = decoder.decodeToString(input);
    return result;
}
export function libDeviceParamsToMap(lib: LibDevice): Map<string, string> {
    return copyParamMap(lib.defaultParams);
}
export function applyParamsToLibRecord(target: LibDevice, params: Map<string, string>): void {
    params.forEach((value: string, key: string) => {
        target.defaultParams.set(key, value);
    });
}
export function paramMapGet(params: Map<string, string>, key: string, fallback: string): string {
    const val = params.get(key);
    if (val !== undefined) {
        return val;
    }
    return fallback;
}
