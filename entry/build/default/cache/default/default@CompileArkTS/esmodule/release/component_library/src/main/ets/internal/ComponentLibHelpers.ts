import type { Point2D, Pin, PinType, DeviceParamValue, DeviceMeta, LibDevice } from 'common';
import type { ComponentDefinition } from '../api/IComponentLibrary';
import util from "@ohos:util";
export function makePoint(f327: number, g327: number): Point2D {
    const h327: Point2D = { x: f327, y: g327 };
    return h327;
}
export function makePin(y326: string, z326: string, a327: string, b327: PinType, c327: number, d327: number): Pin {
    const e327: Pin = {
        id: y326,
        name: z326,
        number: a327,
        type: b327,
        position: makePoint(c327, d327)
    };
    return e327;
}
export function emptyParams(): Map<string, string> {
    return new Map<string, string>();
}
export function params1(v326: string, w326: string): Map<string, string> {
    const x326 = new Map<string, string>();
    x326.set(v326, w326);
    return x326;
}
export function params2(q326: string, r326: string, s326: string, t326: string): Map<string, string> {
    const u326 = new Map<string, string>();
    u326.set(q326, r326);
    u326.set(s326, t326);
    return u326;
}
export function params3(j326: string, k326: string, l326: string, m326: string, n326: string, o326: string): Map<string, string> {
    const p326 = new Map<string, string>();
    p326.set(j326, k326);
    p326.set(l326, m326);
    p326.set(n326, o326);
    return p326;
}
export function copyParamMap(f326: Map<string, string>): Map<string, string> {
    const g326 = new Map<string, string>();
    f326.forEach((h326: string, i326: string) => {
        g326.set(i326, h326);
    });
    return g326;
}
export function deviceMetaParamsToMap(x325: DeviceMeta, y325: (val: DeviceParamValue) => string): Map<string, string> {
    const z325 = new Map<string, string>();
    const a326: Record<string, Object> = x325.default_params;
    const b326 = Object.keys(a326);
    for (let c326 = 0; c326 < b326.length; c326++) {
        const d326 = b326[c326];
        const e326: Object = a326[d326];
        z325.set(d326, y325(e326 as DeviceParamValue));
    }
    return z325;
}
export function copyStringArray(u325: string[]): string[] {
    const v325: string[] = [];
    for (let w325 = 0; w325 < u325.length; w325++) {
        v325.push(u325[w325]);
    }
    return v325;
}
export function appendComponents(r325: ComponentDefinition[], s325: ComponentDefinition[]): void {
    for (let t325 = 0; t325 < s325.length; t325++) {
        r325.push(s325[t325]);
    }
}
export function arrayBufferToString(n325: ArrayBuffer): string {
    const o325 = util.TextDecoder.create('utf-8', { ignoreBOM: true });
    const p325 = new Uint8Array(n325);
    const q325 = o325.decodeToString(p325);
    return q325;
}
export function libDeviceParamsToMap(m325: LibDevice): Map<string, string> {
    return copyParamMap(m325.defaultParams);
}
export function applyParamsToLibRecord(i325: LibDevice, j325: Map<string, string>): void {
    j325.forEach((k325: string, l325: string) => {
        i325.defaultParams.set(l325, k325);
    });
}
export function paramMapGet(e325: Map<string, string>, f325: string, g325: string): string {
    const h325 = e325.get(f325);
    if (h325 !== undefined) {
        return h325;
    }
    return g325;
}
