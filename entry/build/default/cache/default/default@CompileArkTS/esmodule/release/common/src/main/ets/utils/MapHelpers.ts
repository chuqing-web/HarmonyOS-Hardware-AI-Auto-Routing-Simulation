import type { Point2D, Rotation } from '../types/CommonTypes';
import type { SchTopology, DeviceInst, RouteLine, NetNodeRef } from '../types/TopologyTypes';
import type { DeviceRequirement } from '../types/AiExtendedTypes';
import util from "@ohos:util";
export function copyStringMap(b42: Map<string, string>): Map<string, string> {
    const c42 = new Map<string, string>();
    if (b42 !== undefined && b42 !== null && typeof (b42 as Map<string, string>).forEach === 'function') {
        b42.forEach((d42: string, e42: string) => {
            c42.set(e42, d42);
        });
    }
    return c42;
}
export function copyNumberMap(x41: Map<string, number>): Map<string, number> {
    const y41 = new Map<string, number>();
    x41.forEach((z41: number, a42: string) => {
        y41.set(a42, z41);
    });
    return y41;
}
export function paramMapGet(t41: Map<string, string>, u41: string, v41: string): string {
    const w41 = t41.get(u41);
    if (w41 !== undefined) {
        return w41;
    }
    return v41;
}
export function parseVoltageVolts(p41: string, q41: number = 5): number {
    const r41 = p41.trim();
    if (r41.length === 0) {
        return q41;
    }
    const s41 = parseFloat(r41.replace(/[^\d.]/g, ''));
    if (isNaN(s41) || s41 <= 0) {
        return q41;
    }
    return s41;
}
export function appendArray<l41>(m41: l41[], n41: l41[]): void {
    for (let o41 = 0; o41 < n41.length; o41++) {
        m41.push(n41[o41]);
    }
}
export function arrayMin(i41: number[]): number {
    if (i41.length === 0) {
        return 0;
    }
    let j41 = i41[0];
    for (let k41 = 1; k41 < i41.length; k41++) {
        if (i41[k41] < j41) {
            j41 = i41[k41];
        }
    }
    return j41;
}
export function arrayMax(f41: number[]): number {
    if (f41.length === 0) {
        return 0;
    }
    let g41 = f41[0];
    for (let h41 = 1; h41 < f41.length; h41++) {
        if (f41[h41] > g41) {
            g41 = f41[h41];
        }
    }
    return g41;
}
export function arrayBufferToString(b41: ArrayBuffer): string {
    const c41 = util.TextDecoder.create('utf-8', { ignoreBOM: true });
    const d41 = new Uint8Array(b41);
    const e41 = c41.decodeToString(d41);
    return e41;
}
export function normalizeRotation(z40: number): Rotation {
    const a41 = ((z40 % 360) + 360) % 360;
    if (a41 === 90) {
        return 90;
    }
    if (a41 === 180) {
        return 180;
    }
    if (a41 === 270) {
        return 270;
    }
    return 0;
}
export function copySchTopologyWithDevices(x40: SchTopology, y40: DeviceInst[]): SchTopology {
    return {
        schUuid: x40.schUuid,
        schName: x40.schName,
        layerDepth: x40.layerDepth,
        deviceList: y40,
        netList: x40.netList,
        busList: x40.busList,
        wireList: x40.wireList,
        subCircuitList: x40.subCircuitList,
        probeList: x40.probeList,
        textAnnotate: x40.textAnnotate,
        ercErrorList: x40.ercErrorList,
        gridStep: x40.gridStep,
        bgColor: x40.bgColor
    };
}
export function emptyStringMap(): Map<string, string> {
    return new Map<string, string>();
}
export function emptyNumberMap(): Map<string, number> {
    return new Map<string, number>();
}
export function stringMap1(u40: string, v40: string): Map<string, string> {
    const w40 = new Map<string, string>();
    w40.set(u40, v40);
    return w40;
}
export function stringMap2(p40: string, q40: string, r40: string, s40: string): Map<string, string> {
    const t40 = new Map<string, string>();
    t40.set(p40, q40);
    t40.set(r40, s40);
    return t40;
}
export function makeRouteLine(l40: string, m40: Point2D[], n40: boolean): RouteLine {
    const o40: RouteLine = { netUuid: l40, points: m40, isBus: n40 };
    return o40;
}
export function makeNetNodeRef(i40: string, j40: string): NetNodeRef {
    const k40: NetNodeRef = { devUuid: i40, pinId: j40 };
    return k40;
}
export function makeDeviceInst(a40: string, b40: string, c40: string, d40: number, e40: number, f40: number, g40: Map<string, string>): DeviceInst {
    const h40: DeviceInst = {
        instUuid: a40,
        libDevId: b40,
        refName: c40,
        x: d40,
        y: e40,
        rotate: f40,
        mirrorH: false,
        mirrorV: false,
        params: g40,
        pinVoltage: emptyNumberMap(),
        hidden: false,
        subCircuitRef: '',
        ercErrorMsg: ''
    };
    return h40;
}
export function makeDeviceRequirement(u39: string, v39: string, w39: number, x39: Map<string, string>, y39?: string): DeviceRequirement {
    const z39: DeviceRequirement = {
        func: u39,
        devType: v39,
        paramConstraint: x39,
        priority: w39
    };
    if (y39 !== undefined) {
        z39.explicitModel = y39;
    }
    return z39;
}
export function emptySchTopology(): SchTopology {
    const t39: SchTopology = {
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
        ercErrorList: [],
        gridStep: 10,
        bgColor: '#0a0a1a'
    };
    return t39;
}
