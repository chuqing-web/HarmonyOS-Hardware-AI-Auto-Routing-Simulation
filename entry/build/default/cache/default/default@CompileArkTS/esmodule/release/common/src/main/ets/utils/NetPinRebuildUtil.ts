import { NetType } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/CommonTypes";
import type { SchematicDocument, Point2D, Rotation } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/CommonTypes";
import { buildPinRef, parsePinRef } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PinRefUtil";
import { traceNetConnectivity } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/InstrumentTraceLog";
import { rebuildWireNetTopology } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/WireNetTopology";
export interface PinGeometry {
    id: string;
    name: string;
    x: number;
    y: number;
}
export type PinGeometryResolver = (libraryId: string) => PinGeometry[] | null;
function transformPin(t47: Point2D, u47: Rotation, v47: boolean): Point2D {
    let w47 = t47.x;
    let x47 = t47.y;
    if (v47) {
        w47 = -w47;
    }
    switch (u47) {
        case 90: return { x: -x47, y: w47 };
        case 180: return { x: -w47, y: -x47 };
        case 270: return { x: x47, y: -w47 };
        default: return { x: w47, y: x47 };
    }
}
function defaultPinsForLib(p47: string, q47?: PinGeometryResolver): PinGeometry[] {
    if (q47 !== undefined) {
        const s47 = q47(p47);
        if (s47 !== null && s47.length > 0) {
            return s47;
        }
    }
    const r47 = p47.toUpperCase();
    if (r47 === 'VCC' || r47.endsWith('/VCC')) {
        return [{ id: '1', name: 'VCC', x: 0, y: 10 }];
    }
    if (r47 === 'GND' || r47.endsWith('/GND')) {
        return [{ id: '1', name: 'GND', x: 0, y: -10 }];
    }
    if (r47 === 'VOLTMETER_DC' || r47.includes('VOLTMETER')) {
        return [
            { id: 'V+', name: 'V+', x: -30, y: -10 },
            { id: 'COM', name: 'COM', x: -30, y: 10 }
        ];
    }
    if (r47 === 'AMMETER_DC' || r47.includes('AMMETER')) {
        return [
            { id: 'I+', name: 'I+', x: -30, y: 0 },
            { id: 'I-', name: 'I-', x: -30, y: 20 }
        ];
    }
    if (r47.includes('LM7805') || r47.includes('LM7812') || r47.includes('AMS1117')) {
        return [
            { id: '1', name: 'IN', x: -40, y: 0 },
            { id: '2', name: 'GND', x: 0, y: 40 },
            { id: '3', name: 'OUT', x: 40, y: 0 }
        ];
    }
    if (r47.includes('LM358') || r47.includes('LM324') || r47.includes('UA741') || r47.includes('OP')) {
        return [
            { id: 'IN+', name: 'IN+', x: -50, y: -20 },
            { id: 'IN-', name: 'IN-', x: -50, y: 20 },
            { id: 'OUT', name: 'OUT', x: 50, y: 0 },
            { id: 'VCC', name: 'VCC', x: 0, y: -50 },
            { id: 'VEE', name: 'VEE', x: 0, y: 50 }
        ];
    }
    if (r47.includes('DIODE') || r47.startsWith('1N') || r47.includes('LED')) {
        return [
            { id: 'A', name: 'A', x: -30, y: 0 },
            { id: 'K', name: 'K', x: 30, y: 0 }
        ];
    }
    return [
        { id: '1', name: '1', x: -30, y: 0 },
        { id: '2', name: '2', x: 30, y: 0 }
    ];
}
function countPinRefs(m47: SchematicDocument): number {
    let n47 = 0;
    for (let o47 = 0; o47 < m47.nets.length; o47++) {
        n47 += m47.nets[o47].pinIds.length;
    }
    return n47;
}
function findNetByName(i47: SchematicDocument, j47: string): string | null {
    const k47 = j47.toUpperCase();
    for (let l47 = 0; l47 < i47.nets.length; l47++) {
        if (i47.nets[l47].name.toUpperCase() === k47) {
            return i47.nets[l47].id;
        }
    }
    return null;
}
function ensureNet(f47: SchematicDocument, g47: string): void {
    if (f47.nets.some(h47 => h47.id === g47)) {
        return;
    }
    f47.nets.push({ id: g47, name: '', type: NetType.SIGNAL, pinIds: [] });
}
function addPinToNet(v46: SchematicDocument, w46: string, x46: string, y46: string, z46: string): void {
    ensureNet(v46, w46);
    const a47 = v46.nets.find(e47 => e47.id === w46);
    if (a47 === undefined) {
        return;
    }
    const b47 = buildPinRef(x46, y46, z46);
    if (a47.pinIds.includes(b47)) {
        return;
    }
    for (const c47 of v46.nets) {
        if (c47.id !== w46) {
            const d47 = c47.pinIds.indexOf(b47);
            if (d47 >= 0) {
                c47.pinIds.splice(d47, 1);
            }
        }
    }
    a47.pinIds.push(b47);
}
function countCompPinConnections(o46: SchematicDocument, p46: string): number {
    let q46 = 0;
    for (let r46 = 0; r46 < o46.nets.length; r46++) {
        const s46 = o46.nets[r46];
        for (let t46 = 0; t46 < s46.pinIds.length; t46++) {
            const u46 = parsePinRef(s46.pinIds[t46]);
            if (u46 !== null && u46.compId === p46) {
                q46++;
            }
        }
    }
    return q46;
}
function expectedPinCount(m46: string): number {
    const n46 = m46.toUpperCase();
    if (n46 === 'VCC' || n46.endsWith('/VCC') || n46 === 'GND' || n46.endsWith('/GND')) {
        return 1;
    }
    return 2;
}
function needsWireRebuild(i46: SchematicDocument): boolean {
    if (countPinRefs(i46) < Math.max(2, i46.components.length)) {
        return true;
    }
    for (let j46 = 0; j46 < i46.components.length; j46++) {
        const k46 = i46.components[j46];
        const l46 = expectedPinCount(k46.libraryId);
        if (countCompPinConnections(i46, k46.id) < l46) {
            return true;
        }
    }
    return false;
}
function connectWireEndpoints(e45: SchematicDocument, f45: number, g45?: PinGeometryResolver): number {
    const h45 = 2;
    interface i45 {
        compId: string;
        pinId: string;
        pinName: string;
        world: Point2D;
    }
    const j45: i45[] = [];
    for (let c46 = 0; c46 < e45.components.length; c46++) {
        const d46 = e45.components[c46];
        const e46 = defaultPinsForLib(d46.libraryId, g45);
        for (let f46 = 0; f46 < e46.length; f46++) {
            const g46 = e46[f46];
            const h46 = transformPin({ x: g46.x, y: g46.y }, d46.rotation, d46.mirrored);
            j45.push({
                compId: d46.id,
                pinId: g46.id,
                pinName: g46.name,
                world: { x: d46.position.x + h46.x, y: d46.position.y + h46.y }
            });
        }
    }
    let k45 = 0;
    for (let l45 = 0; l45 < e45.wires.length; l45++) {
        const m45 = e45.wires[l45];
        if (m45.points.length < 2) {
            continue;
        }
        ensureNet(e45, m45.netId);
        const n45 = [m45.points[0], m45.points[m45.points.length - 1]];
        for (let o45 = 0; o45 < n45.length; o45++) {
            const p45 = n45[o45];
            let q45 = f45;
            let r45 = -1;
            for (let x45 = 0; x45 < j45.length; x45++) {
                const y45 = j45[x45];
                const z45 = p45.x - y45.world.x;
                const a46 = p45.y - y45.world.y;
                const b46 = Math.sqrt(z45 * z45 + a46 * a46);
                if (b46 < q45) {
                    q45 = b46;
                    r45 = x45;
                }
            }
            if (r45 >= 0) {
                const s45 = j45[r45];
                addPinToNet(e45, m45.netId, s45.compId, s45.pinId, s45.pinName);
                k45++;
                for (let t45 = 0; t45 < j45.length; t45++) {
                    if (t45 === r45) {
                        continue;
                    }
                    const u45 = j45[t45];
                    const v45 = s45.world.x - u45.world.x;
                    const w45 = s45.world.y - u45.world.y;
                    if (Math.abs(v45) <= h45 && Math.abs(w45) <= h45) {
                        addPinToNet(e45, m45.netId, u45.compId, u45.pinId, u45.pinName);
                        k45++;
                    }
                }
            }
        }
    }
    return k45;
}
function pruneOrphanNets(x44: SchematicDocument): number {
    const y44 = new Set<string>();
    for (let c45 = 0; c45 < x44.wires.length; c45++) {
        const d45 = x44.wires[c45].netId;
        if (d45.length > 0) {
            y44.add(d45);
        }
    }
    const z44 = x44.nets.length;
    const a45 = new Set(['VCC', 'VDD', 'GND', 'VSS', 'VEE', '0']);
    x44.nets = x44.nets.filter((b45) => {
        if (y44.has(b45.id)) {
            return true;
        }
        if (b45.pinIds.length > 0) {
            return true;
        }
        if (b45.type === NetType.POWER || b45.type === NetType.GROUND) {
            return a45.has(b45.name.toUpperCase());
        }
        return false;
    });
    return z44 - x44.nets.length;
}
function mergeRailNets(n44: SchematicDocument): void {
    const o44 = ['VCC', 'VDD', 'GND', 'VSS', '0'];
    for (let p44 = 0; p44 < o44.length; p44++) {
        const q44 = o44[p44];
        const r44 = findNetByName(n44, q44);
        if (r44 === null) {
            continue;
        }
        for (let s44 = 0; s44 < n44.nets.length; s44++) {
            const t44 = n44.nets[s44];
            if (t44.id === r44 || t44.name.toUpperCase() !== q44) {
                continue;
            }
            const u44 = n44.nets.find(w44 => w44.id === r44);
            if (u44 === undefined) {
                continue;
            }
            for (let v44 = 0; v44 < t44.pinIds.length; v44++) {
                if (!u44.pinIds.includes(t44.pinIds[v44])) {
                    u44.pinIds.push(t44.pinIds[v44]);
                }
            }
        }
    }
}
export function ensureNetPinConnectivity(f44: SchematicDocument, g44: number = 10, h44?: PinGeometryResolver): void {
    const i44 = countPinRefs(f44);
    rebuildWireNetTopology(f44, g44, h44);
    for (let m44 = 0; m44 < f44.nets.length; m44++) {
        f44.nets[m44].pinIds = [];
    }
    const j44 = Math.max(g44 * 2.5, 20);
    const k44 = connectWireEndpoints(f44, j44, h44);
    mergeRailNets(f44);
    pruneOrphanNets(f44);
    const l44 = countPinRefs(f44);
    traceNetConnectivity(i44, l44, k44, f44.components.length, f44.wires.length);
}
export function rebuildAllNetPinConnectivity(b44: SchematicDocument, c44: number = 10, d44?: PinGeometryResolver): void {
    for (let e44 = 0; e44 < b44.nets.length; e44++) {
        b44.nets[e44].pinIds = [];
    }
    ensureNetPinConnectivity(b44, c44, d44);
}
export function summarizeNetPins(v43: SchematicDocument, w43: number = 6): string {
    const x43: string[] = [];
    let y43 = 0;
    for (let z43 = 0; z43 < v43.nets.length && y43 < w43; z43++) {
        const a44 = v43.nets[z43];
        if (a44.pinIds.length === 0) {
            continue;
        }
        x43.push(`${a44.name || a44.id}(${a44.pinIds.length})`);
        y43++;
    }
    return x43.length > 0 ? x43.join(', ') : '(no pins)';
}
