import { NetType } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/CommonTypes";
import type { SchematicDocument, Point2D } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/CommonTypes";
import type { PinGeometry, PinGeometryResolver } from './NetPinRebuildUtil';
import { Logger } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/Logger";
import { INSTR_TRACE_TAG } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/InstrumentTraceLog";
enum JunctionKind {
    VCC = "vcc",
    GND = "gnd",
    SIGNAL = "signal",
    UNKNOWN = "unknown"
}
interface JunctionPinRef {
    compId: string;
    pinId: string;
    pinName: string;
    libraryId: string;
}
interface PinWorldRef {
    compId: string;
    pinId: string;
    pinName: string;
    libraryId: string;
    worldX: number;
    worldY: number;
}
interface Junction {
    key: string;
    x: number;
    y: number;
    pinRefs: JunctionPinRef[];
}
function makePinGeometry(k62: string, l62: string, m62: number, n62: number): PinGeometry {
    const o62: PinGeometry = { id: k62, name: l62, x: m62, y: n62 };
    return o62;
}
function makePinWorldRef(d62: string, e62: string, f62: string, g62: string, h62: number, i62: number): PinWorldRef {
    const j62: PinWorldRef = {
        compId: d62, pinId: e62, pinName: f62, libraryId: g62,
        worldX: h62, worldY: i62
    };
    return j62;
}
function makeJunctionPinRef(y61: string, z61: string, a62: string, b62: string): JunctionPinRef {
    const c62: JunctionPinRef = {
        compId: y61, pinId: z61, pinName: a62, libraryId: b62
    };
    return c62;
}
function roundKey(x61: Point2D): string {
    return `${Math.round(x61.x)},${Math.round(x61.y)}`;
}
function isVccLib(v61: string): boolean {
    const w61 = v61.toUpperCase();
    return w61 === 'VCC' || w61.endsWith('/VCC') || w61.includes('VDD');
}
function isGndLib(t61: string): boolean {
    const u61 = t61.toUpperCase();
    return u61 === 'GND' || u61.endsWith('/GND') || u61 === 'VSS' || u61 === '0';
}
function isPassiveLib(r61: string): boolean {
    const s61 = r61.toUpperCase();
    return s61.startsWith('R_') || s61.includes('RESISTOR') || s61.startsWith('C_') ||
        s61.includes('CAP') || s61.startsWith('L_') || s61.includes('INDUCTOR');
}
function transformPin(m61: Point2D, n61: number, o61: boolean): Point2D {
    let p61 = m61.x;
    let q61 = m61.y;
    if (o61) {
        p61 = -p61;
    }
    switch (n61) {
        case 90: return { x: -q61, y: p61 };
        case 180: return { x: -p61, y: -q61 };
        case 270: return { x: q61, y: -p61 };
        default: return { x: p61, y: q61 };
    }
}
function collectPins(d61: SchematicDocument, e61?: PinGeometryResolver): PinWorldRef[] {
    const f61: PinWorldRef[] = [];
    for (let g61 = 0; g61 < d61.components.length; g61++) {
        const h61 = d61.components[g61];
        let i61: PinGeometry[] | null = null;
        if (e61 !== undefined) {
            i61 = e61(h61.libraryId);
        }
        if (i61 === null || i61.length === 0) {
            i61 = internalDefaultPins(h61.libraryId);
        }
        for (let j61 = 0; j61 < i61.length; j61++) {
            const k61 = i61[j61];
            const l61 = transformPin({ x: k61.x, y: k61.y }, h61.rotation, h61.mirrored);
            f61.push(makePinWorldRef(h61.id, k61.id, k61.name, h61.libraryId, h61.position.x + l61.x, h61.position.y + l61.y));
        }
    }
    return f61;
}
function internalDefaultPins(b61: string): PinGeometry[] {
    const c61 = b61.toUpperCase();
    if (c61 === 'VCC' || c61.endsWith('/VCC')) {
        return [makePinGeometry('1', 'VCC', 0, 10)];
    }
    if (c61 === 'GND' || c61.endsWith('/GND')) {
        return [makePinGeometry('1', 'GND', 0, -10)];
    }
    if (c61.includes('LM7805') || c61.includes('LM7812') || c61.includes('AMS1117')) {
        return [
            makePinGeometry('1', 'IN', -40, 0),
            makePinGeometry('2', 'GND', 0, 40),
            makePinGeometry('3', 'OUT', 40, 0)
        ];
    }
    if (c61.includes('VOLTMETER')) {
        return [
            makePinGeometry('V+', 'V+', -30, -10),
            makePinGeometry('COM', 'COM', -30, 10)
        ];
    }
    if (c61.includes('AMMETER')) {
        return [
            makePinGeometry('I+', 'I+', -30, 0),
            makePinGeometry('I-', 'I-', -30, 20)
        ];
    }
    return [
        makePinGeometry('1', '1', -30, 0),
        makePinGeometry('2', '2', 30, 0)
    ];
}
function findOrCreateJunction(x60: Map<string, Junction>, y60: string, z60: Point2D): Junction {
    let a61 = x60.get(y60);
    if (a61 === undefined) {
        a61 = { key: y60, x: z60.x, y: z60.y, pinRefs: [] };
        x60.set(y60, a61);
    }
    return a61;
}
function pointOnSegment(n60: Point2D, o60: Point2D, p60: Point2D, q60: number): boolean {
    const r60 = p60.x - o60.x;
    const s60 = p60.y - o60.y;
    const t60 = r60 * r60 + s60 * s60;
    if (t60 < 1e-6) {
        return Math.abs(n60.x - o60.x) <= q60 && Math.abs(n60.y - o60.y) <= q60;
    }
    const u60 = Math.abs(r60 * (o60.y - n60.y) - (o60.x - n60.x) * s60);
    const v60 = Math.sqrt(t60);
    if (u60 / v60 > q60) {
        return false;
    }
    const w60 = (n60.x - o60.x) * r60 + (n60.y - o60.y) * s60;
    return w60 >= -q60 && w60 <= t60 + q60;
}
class UnionFind {
    private parent: Map<string, string> = new Map();
    find(l60: string): string {
        let m60 = this.parent.get(l60);
        if (m60 === undefined) {
            this.parent.set(l60, l60);
            return l60;
        }
        if (m60 !== l60) {
            m60 = this.find(m60);
            this.parent.set(l60, m60);
        }
        return m60;
    }
    union(h60: string, i60: string): void {
        const j60 = this.find(h60);
        const k60 = this.find(i60);
        if (j60 !== k60) {
            this.parent.set(k60, j60);
        }
    }
}
function classifyJunction(b60: Junction): JunctionKind {
    let c60 = false;
    let d60 = false;
    let e60 = false;
    for (let f60 = 0; f60 < b60.pinRefs.length; f60++) {
        const g60 = b60.pinRefs[f60];
        if (isVccLib(g60.libraryId)) {
            c60 = true;
        }
        else if (isGndLib(g60.libraryId)) {
            d60 = true;
        }
        else if (isPassiveLib(g60.libraryId)) {
            e60 = true;
        }
    }
    if (c60 && !d60) {
        return JunctionKind.VCC;
    }
    if (d60 && !c60) {
        return JunctionKind.GND;
    }
    if (e60) {
        return JunctionKind.SIGNAL;
    }
    return JunctionKind.UNKNOWN;
}
function kindPriority(a60: JunctionKind): number {
    if (a60 === JunctionKind.SIGNAL) {
        return 3;
    }
    if (a60 === JunctionKind.VCC) {
        return 2;
    }
    if (a60 === JunctionKind.GND) {
        return 1;
    }
    return 0;
}
function mergeKind(y59: JunctionKind, z59: JunctionKind): JunctionKind {
    if (kindPriority(y59) >= kindPriority(z59)) {
        return y59;
    }
    return z59;
}
function findNetByName(u59: SchematicDocument, v59: string): string | null {
    const w59 = v59.toUpperCase();
    for (let x59 = 0; x59 < u59.nets.length; x59++) {
        if (u59.nets[x59].name.toUpperCase() === w59) {
            return u59.nets[x59].id;
        }
    }
    return null;
}
function ensureNet(p59: SchematicDocument, q59: string, r59: string, s59: NetType): void {
    if (p59.nets.some(t59 => t59.id === q59)) {
        return;
    }
    p59.nets.push({ id: q59, name: r59, type: s59, pinIds: [] });
}
export function rebuildWireNetTopology(g55: SchematicDocument, h55: number = 10, i55?: PinGeometryResolver): number {
    if (g55.wires.length === 0) {
        return 0;
    }
    const j55 = Math.max(2, h55 * 0.5);
    const k55 = Math.max(3, h55 * 0.4);
    const l55 = Math.max(h55 * 1.5, 15);
    const m55 = new Map<string, Junction>();
    const n55 = new UnionFind();
    const o55 = collectPins(g55, i55);
    for (let l59 = 0; l59 < o55.length; l59++) {
        const m59 = o55[l59];
        const n59 = roundKey({ x: m59.worldX, y: m59.worldY });
        const o59 = findOrCreateJunction(m55, n59, { x: m59.worldX, y: m59.worldY });
        o59.pinRefs.push(makeJunctionPinRef(m59.compId, m59.pinId, m59.pinName, m59.libraryId));
    }
    for (let f59 = 0; f59 < g55.wires.length; f59++) {
        const g59 = g55.wires[f59];
        if (g59.points.length < 2) {
            continue;
        }
        const h59 = g59.points[0];
        const i59 = g59.points[g59.points.length - 1];
        const j59 = roundKey(h59);
        const k59 = roundKey(i59);
        findOrCreateJunction(m55, j59, h59);
        findOrCreateJunction(m55, k59, i59);
        n55.union(j59, k59);
    }
    const p55 = Array.from(m55.keys());
    for (let z58 = 0; z58 < p55.length; z58++) {
        const a59 = m55.get(p55[z58])!;
        for (let b59 = z58 + 1; b59 < p55.length; b59++) {
            const c59 = m55.get(p55[b59])!;
            const d59 = a59.x - c59.x;
            const e59 = a59.y - c59.y;
            if (Math.abs(d59) <= j55 && Math.abs(e59) <= j55) {
                n55.union(p55[z58], p55[b59]);
            }
        }
    }
    for (let p58 = 0; p58 < g55.wires.length; p58++) {
        const q58 = g55.wires[p58];
        if (q58.points.length < 2) {
            continue;
        }
        const r58 = [q58.points[0], q58.points[q58.points.length - 1]];
        for (let s58 = 0; s58 < 2; s58++) {
            const t58 = r58[s58];
            const u58 = roundKey(t58);
            for (let v58 = 0; v58 < g55.wires.length; v58++) {
                if (v58 === p58) {
                    continue;
                }
                const w58 = g55.wires[v58];
                for (let x58 = 0; x58 < w58.points.length - 1; x58++) {
                    if (pointOnSegment(t58, w58.points[x58], w58.points[x58 + 1], k55)) {
                        const y58 = roundKey({
                            x: (w58.points[x58].x + w58.points[x58 + 1].x) / 2,
                            y: (w58.points[x58].y + w58.points[x58 + 1].y) / 2
                        });
                        findOrCreateJunction(m55, u58, t58);
                        findOrCreateJunction(m55, y58, w58.points[x58]);
                        n55.union(u58, y58);
                        n55.union(y58, roundKey(w58.points[x58]));
                        n55.union(y58, roundKey(w58.points[x58 + 1]));
                    }
                }
            }
        }
    }
    for (let d58 = 0; d58 < o55.length; d58++) {
        const e58 = o55[d58];
        let f58 = '';
        let g58 = l55;
        m55.forEach((k58: Junction, l58: string) => {
            const m58 = e58.worldX - k58.x;
            const n58 = e58.worldY - k58.y;
            const o58 = Math.sqrt(m58 * m58 + n58 * n58);
            if (o58 < g58) {
                g58 = o58;
                f58 = l58;
            }
        });
        if (f58.length > 0) {
            const h58 = m55.get(f58)!;
            const i58 = h58.pinRefs.some(j58 => j58.compId === e58.compId && j58.pinId === e58.pinId);
            if (!i58) {
                h58.pinRefs.push(makeJunctionPinRef(e58.compId, e58.pinId, e58.pinName, e58.libraryId));
            }
            n55.union(roundKey({ x: e58.worldX, y: e58.worldY }), f58);
        }
    }
    const q55 = new Map<string, JunctionKind>();
    m55.forEach((b58: Junction, c58: string) => {
        q55.set(c58, classifyJunction(b58));
    });
    const r55 = new Map<string, JunctionKind>();
    m55.forEach((z57: Junction, a58: string) => {
        r55.set(n55.find(a58), JunctionKind.UNKNOWN);
    });
    const s55: string[] = [];
    m55.forEach((w57: Junction, x57: string) => {
        const y57 = classifyJunction(w57);
        if (y57 === JunctionKind.VCC || y57 === JunctionKind.GND) {
            s55.push(x57);
            r55.set(n55.find(x57), y57);
        }
    });
    const t55 = new Map<string, Set<string>>();
    const u55 = (u57: string, v57: string): void => {
        if (!t55.has(u57)) {
            t55.set(u57, new Set());
        }
        t55.get(u57)!.add(v57);
        if (!t55.has(v57)) {
            t55.set(v57, new Set());
        }
        t55.get(v57)!.add(u57);
    };
    for (let q57 = 0; q57 < g55.wires.length; q57++) {
        const r57 = g55.wires[q57];
        if (r57.points.length < 2) {
            continue;
        }
        const s57 = roundKey(r57.points[0]);
        const t57 = roundKey(r57.points[r57.points.length - 1]);
        u55(s57, t57);
    }
    const v55 = new Map<string, string>();
    m55.forEach((o57: Junction, p57: string) => {
        v55.set(p57, n55.find(p57));
    });
    const w55 = new Map<string, Set<string>>();
    t55.forEach((k57: Set<string>, l57: string) => {
        const m57 = n55.find(l57);
        if (!w55.has(m57)) {
            w55.set(m57, new Set());
        }
        k57.forEach((n57: string) => {
            w55.get(m57)!.add(n55.find(n57));
        });
    });
    const x55 = new Map<string, JunctionKind>();
    w55.forEach((i57: Set<string>, j57: string) => {
        x55.set(j57, JunctionKind.UNKNOWN);
    });
    const y55: string[] = [];
    for (let f57 = 0; f57 < s55.length; f57++) {
        const g57 = n55.find(s55[f57]);
        const h57 = classifyJunction(m55.get(s55[f57])!);
        if (h57 === JunctionKind.VCC || h57 === JunctionKind.GND) {
            x55.set(g57, h57);
            y55.push(g57);
        }
    }
    let z55 = 0;
    while (z55 < y55.length) {
        const b57 = y55[z55++];
        const c57 = x55.get(b57)!;
        const d57 = w55.get(b57);
        if (d57 === undefined) {
            continue;
        }
        d57.forEach((e57: string) => {
            if (x55.get(e57) !== JunctionKind.UNKNOWN) {
                return;
            }
            x55.set(e57, c57);
            y55.push(e57);
        });
    }
    const a56 = new Map<string, JunctionKind>();
    m55.forEach((w56: Junction, x56: string) => {
        const y56 = n55.find(x56);
        const z56 = x55.get(y56);
        if (z56 === JunctionKind.VCC || z56 === JunctionKind.GND) {
            a56.set(x56, z56);
            return;
        }
        const a57 = classifyJunction(w56);
        if (a57 === JunctionKind.SIGNAL || a57 === JunctionKind.UNKNOWN) {
            a56.set(x56, JunctionKind.SIGNAL);
        }
        else {
            a56.set(x56, a57);
        }
    });
    const b56 = findNetByName(g55, 'VCC') ?? `net_topo_vcc_${g55.nets.length}`;
    const c56 = findNetByName(g55, 'GND') ?? `net_topo_gnd_${g55.nets.length + 1}`;
    ensureNet(g55, b56, 'VCC', NetType.POWER);
    ensureNet(g55, c56, 'GND', NetType.GROUND);
    let d56 = 0;
    const e56 = new Map<string, string>();
    const f56 = (s56: string, t56: string): JunctionKind => {
        const u56 = a56.get(s56) ?? JunctionKind.SIGNAL;
        const v56 = a56.get(t56) ?? JunctionKind.SIGNAL;
        if (u56 === JunctionKind.GND || v56 === JunctionKind.GND) {
            return JunctionKind.GND;
        }
        if (u56 === JunctionKind.VCC || v56 === JunctionKind.VCC) {
            return JunctionKind.VCC;
        }
        return mergeKind(u56, v56);
    };
    const g56 = (p56: JunctionKind, q56: string): string => {
        if (p56 === JunctionKind.VCC) {
            return b56;
        }
        if (p56 === JunctionKind.GND) {
            return c56;
        }
        let r56 = e56.get(q56);
        if (r56 === undefined) {
            d56++;
            r56 = `net_topo_sig_${d56}`;
            ensureNet(g55, r56, `NET_${d56}`, NetType.SIGNAL);
            e56.set(q56, r56);
        }
        return r56;
    };
    let h56 = 0;
    for (let i56 = 0; i56 < g55.wires.length; i56++) {
        const j56 = g55.wires[i56];
        if (j56.points.length < 2) {
            continue;
        }
        const k56 = roundKey(j56.points[0]);
        const l56 = roundKey(j56.points[j56.points.length - 1]);
        const m56 = f56(k56, l56);
        const n56 = n55.find(k56);
        const o56 = g56(m56, n56);
        if (j56.netId !== o56) {
            j56.netId = o56;
            h56++;
        }
    }
    if (h56 > 0) {
        Logger.info(INSTR_TRACE_TAG, `[TOPO] rebuilt wire nets: ${h56} wires reassigned, ` +
            `signalNets=${d56} junctions=${m55.size}`);
    }
    return h56;
}
