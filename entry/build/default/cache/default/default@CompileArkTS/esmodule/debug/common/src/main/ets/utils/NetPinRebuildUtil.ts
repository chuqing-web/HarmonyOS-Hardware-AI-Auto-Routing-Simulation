import { NetType } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/CommonTypes";
import type { SchematicDocument, Point2D, Rotation } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/CommonTypes";
import { buildPinRef, parsePinRef } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PinRefUtil";
import { traceNetConnectivity } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/InstrumentTraceLog";
import { rebuildWireNetTopology } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/WireNetTopology";
import { applyNetLabelConnectivity } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/NetLabelConnectivity";
export interface PinGeometry {
    id: string;
    name: string;
    x: number;
    y: number;
}
/** Optional callback to resolve real pin positions from component library. */
export type PinGeometryResolver = (libraryId: string) => PinGeometry[] | null;
function transformPin(local: Point2D, rotation: Rotation, mirrored: boolean): Point2D {
    let x = local.x;
    let y = local.y;
    if (mirrored) {
        x = -x;
    }
    switch (rotation) {
        case 90: return { x: -y, y: x };
        case 180: return { x: -x, y: -y };
        case 270: return { x: y, y: -x };
        default: return { x: x, y: y };
    }
}
function defaultPinsForLib(libraryId: string, resolver?: PinGeometryResolver): PinGeometry[] {
    if (resolver !== undefined) {
        const resolved = resolver(libraryId);
        if (resolved !== null && resolved.length > 0) {
            return resolved;
        }
    }
    const lib = (libraryId ?? '').toUpperCase();
    if (lib === 'VCC' || lib.endsWith('/VCC')) {
        return [{ id: '1', name: 'VCC', x: 0, y: 10 }];
    }
    if (lib === 'GND' || lib.endsWith('/GND')) {
        return [{ id: '1', name: 'GND', x: 0, y: -10 }];
    }
    if (lib === 'VEE' || lib.endsWith('/VEE')) {
        return [{ id: '1', name: 'VEE', x: 0, y: -10 }];
    }
    if (lib === 'SIGNAL_GEN' || lib.startsWith('SIGNAL_GEN')) {
        return [
            { id: 'OUT', name: 'OUT', x: -30, y: 0 },
            { id: 'GND', name: 'GND', x: 30, y: 0 }
        ];
    }
    if (lib === 'VOLTMETER_DC' || lib.includes('VOLTMETER')) {
        return [
            { id: 'V+', name: 'V+', x: -30, y: -25 },
            { id: 'COM', name: 'COM', x: -30, y: 25 }
        ];
    }
    if (lib === 'AMMETER_DC' || lib.includes('AMMETER')) {
        return [
            { id: 'I+', name: 'I+', x: -30, y: 0 },
            { id: 'I-', name: 'I-', x: -30, y: 20 }
        ];
    }
    if (lib.includes('LM7805') || lib.includes('LM7812') || lib.includes('AMS1117')) {
        return [
            { id: '1', name: 'IN', x: -40, y: 0 },
            { id: '2', name: 'GND', x: 0, y: 40 },
            { id: '3', name: 'OUT', x: 40, y: 0 }
        ];
    }
    if (lib === 'VAC' || lib.startsWith('VAC')) {
        return [
            { id: '1', name: 'AC+', x: -20, y: 0 },
            { id: '2', name: 'AC-', x: 20, y: 0 }
        ];
    }
    // Dual LM358/TL082 (match BuiltinComponents.genDualOpAmpPins / kit.mjs)
    if (lib.includes('LM358') || lib.includes('LM324') || lib.includes('TL08')) {
        return [
            { id: 'OUT1', name: 'OUT1', x: 50, y: -30 },
            { id: 'IN-1', name: 'IN-1', x: -50, y: -20 },
            { id: 'IN+1', name: 'IN+1', x: -50, y: -40 },
            { id: 'V-', name: 'V-', x: 0, y: 50 },
            { id: 'IN+2', name: 'IN+2', x: -50, y: 20 },
            { id: 'IN-2', name: 'IN-2', x: -50, y: 40 },
            { id: 'OUT2', name: 'OUT2', x: 50, y: 30 },
            { id: 'V+', name: 'V+', x: 0, y: -50 }
        ];
    }
    if (lib.includes('UA741') || lib.includes('OP')) {
        return [
            { id: 'IN+', name: 'IN+', x: -50, y: -20 },
            { id: 'IN-', name: 'IN-', x: -50, y: 20 },
            { id: 'OUT', name: 'OUT', x: 50, y: 0 },
            { id: 'VCC', name: 'VCC', x: 0, y: -50 },
            { id: 'VEE', name: 'VEE', x: 0, y: 50 }
        ];
    }
    if (lib.includes('LM555') || lib.includes('NE555') || lib === '555') {
        return [
            { id: 'GND', name: 'GND', x: -40, y: -30 },
            { id: 'TRIG', name: 'TRIG', x: -40, y: -10 },
            { id: 'OUT', name: 'OUT', x: -40, y: 10 },
            { id: 'RESET', name: 'RESET', x: -40, y: 30 },
            { id: 'CTRL', name: 'CTRL', x: 40, y: 30 },
            { id: 'THRES', name: 'THRES', x: 40, y: 10 },
            { id: 'DISCH', name: 'DISCH', x: 40, y: -10 },
            { id: 'VCC', name: 'VCC', x: 40, y: -30 }
        ];
    }
    if (lib.includes('DIODE') || lib.startsWith('1N') || lib.includes('LED')) {
        return [
            { id: 'A', name: 'A', x: -30, y: 0 },
            { id: 'K', name: 'K', x: 30, y: 0 }
        ];
    }
    // Generic two-terminal passives (R/C/L/fuse/crystal…)
    return [
        { id: '1', name: '1', x: -30, y: 0 },
        { id: '2', name: '2', x: 30, y: 0 }
    ];
}
function countPinRefs(doc: SchematicDocument): number {
    let total = 0;
    for (let i = 0; i < doc.nets.length; i++) {
        total += doc.nets[i].pinIds.length;
    }
    return total;
}
function findNetByName(doc: SchematicDocument, name: string): string | null {
    const upper = name.toUpperCase();
    for (let i = 0; i < doc.nets.length; i++) {
        if (doc.nets[i].name.toUpperCase() === upper) {
            return doc.nets[i].id;
        }
    }
    return null;
}
function ensureNet(doc: SchematicDocument, netId: string): void {
    if (doc.nets.some(n => n.id === netId)) {
        return;
    }
    doc.nets.push({ id: netId, name: '', type: NetType.SIGNAL, pinIds: [] });
}
function addPinToNet(doc: SchematicDocument, netId: string, compId: string, pinId: string, pinName: string): void {
    ensureNet(doc, netId);
    const net = doc.nets.find(n => n.id === netId);
    if (net === undefined) {
        return;
    }
    const pinRef = buildPinRef(compId, pinId, pinName);
    if (net.pinIds.includes(pinRef)) {
        return;
    }
    // Remove this pin from any other nets — a pin must belong to exactly one net
    for (const other of doc.nets) {
        if (other.id !== netId) {
            const idx = other.pinIds.indexOf(pinRef);
            if (idx >= 0) {
                other.pinIds.splice(idx, 1);
            }
        }
    }
    net.pinIds.push(pinRef);
}
function countCompPinConnections(doc: SchematicDocument, compId: string): number {
    let count = 0;
    for (let ni = 0; ni < doc.nets.length; ni++) {
        const net = doc.nets[ni];
        for (let pi = 0; pi < net.pinIds.length; pi++) {
            const parsed = parsePinRef(net.pinIds[pi]);
            if (parsed !== null && parsed.compId === compId) {
                count++;
            }
        }
    }
    return count;
}
function expectedPinCount(libraryId: string): number {
    const lib = (libraryId ?? '').toUpperCase();
    if (lib === 'VCC' || lib.endsWith('/VCC') || lib === 'GND' || lib.endsWith('/GND')) {
        return 1;
    }
    return 2;
}
function needsWireRebuild(doc: SchematicDocument): boolean {
    if (countPinRefs(doc) < Math.max(2, doc.components.length)) {
        return true;
    }
    for (let ci = 0; ci < doc.components.length; ci++) {
        const comp = doc.components[ci];
        const expected = expectedPinCount(comp.libraryId);
        if (countCompPinConnections(doc, comp.id) < expected) {
            return true;
        }
    }
    return false;
}
function connectWireEndpoints(doc: SchematicDocument, threshold: number, resolver?: PinGeometryResolver): number {
    const junctionRadius = 2;
    // 松吸附阈值内不允许把电源/地符号脚吸到信号 stub 游离端（lab_passive DIV_TOP 根因）
    const strictSnap = Math.min(5, threshold);
    // Pre-collect all pin candidates with world positions
    interface PinCandidate {
        compId: string;
        pinId: string;
        pinName: string;
        libraryId: string;
        world: Point2D;
    }
    const allCandidates: PinCandidate[] = [];
    for (let ci = 0; ci < doc.components.length; ci++) {
        const comp = doc.components[ci];
        const pins = defaultPinsForLib(comp.libraryId, resolver);
        for (let pi = 0; pi < pins.length; pi++) {
            const pin = pins[pi];
            const local = transformPin({ x: pin.x, y: pin.y }, comp.rotation, comp.mirrored);
            allCandidates.push({
                compId: comp.id,
                pinId: pin.id,
                pinName: pin.name,
                libraryId: comp.libraryId,
                world: { x: comp.position.x + local.x, y: comp.position.y + local.y }
            });
        }
    }
    let connected = 0;
    for (let wi = 0; wi < doc.wires.length; wi++) {
        const wire = doc.wires[wi];
        if (wire.points.length < 2) {
            continue;
        }
        ensureNet(doc, wire.netId);
        const endpoints = [wire.points[0], wire.points[wire.points.length - 1]];
        for (let ei = 0; ei < endpoints.length; ei++) {
            const ep = endpoints[ei];
            let bestDist = threshold;
            let bestIdx = -1;
            for (let ci = 0; ci < allCandidates.length; ci++) {
                const c = allCandidates[ci];
                const dx = ep.x - c.world.x;
                const dy = ep.y - c.world.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist >= bestDist) {
                    continue;
                }
                // 宽松阈值：禁止掠夺电源/地符号脚（精确接触仍允许）
                if (dist > strictSnap && (c.libraryId === 'VCC' || c.libraryId === 'GND')) {
                    continue;
                }
                bestDist = dist;
                bestIdx = ci;
            }
            if (bestIdx >= 0) {
                const best = allCandidates[bestIdx];
                addPinToNet(doc, wire.netId, best.compId, best.pinId, best.pinName);
                connected++;
                // Also add co-located pins (junction)
                for (let ci = 0; ci < allCandidates.length; ci++) {
                    if (ci === bestIdx) {
                        continue;
                    }
                    const c = allCandidates[ci];
                    const dx = best.world.x - c.world.x;
                    const dy = best.world.y - c.world.y;
                    if (Math.abs(dx) <= junctionRadius && Math.abs(dy) <= junctionRadius) {
                        addPinToNet(doc, wire.netId, c.compId, c.pinId, c.pinName);
                        connected++;
                    }
                }
            }
        }
    }
    return connected;
}
/** Merge pin refs that share the same comp:pin onto named VCC/GND nets when possible. */
/** Drop signal nets no longer referenced by any wire (stale netId after topology rebuild). */
function pruneOrphanNets(doc: SchematicDocument): number {
    const wireNetIds = new Set<string>();
    for (let wi = 0; wi < doc.wires.length; wi++) {
        const nid = doc.wires[wi].netId;
        if (nid.length > 0) {
            wireNetIds.add(nid);
        }
    }
    const before = doc.nets.length;
    const railNames = new Set(['VCC', 'VDD', 'GND', 'VSS', 'VEE', '0']);
    doc.nets = doc.nets.filter((net) => {
        if (wireNetIds.has(net.id)) {
            return true;
        }
        if (net.pinIds.length > 0) {
            return true;
        }
        // 保留真正的电源/地轨；丢弃拓扑重建后悬空的命名电源网（如空 VOUT）
        if (net.type === NetType.POWER || net.type === NetType.GROUND) {
            return railNames.has(net.name.toUpperCase());
        }
        return false;
    });
    return before - doc.nets.length;
}
function mergeRailNets(doc: SchematicDocument): void {
    const rails = ['VCC', 'VDD', 'GND', 'VSS', '0'];
    for (let ri = 0; ri < rails.length; ri++) {
        const rail = rails[ri];
        const canonical = findNetByName(doc, rail);
        if (canonical === null) {
            continue;
        }
        for (let ni = 0; ni < doc.nets.length; ni++) {
            const net = doc.nets[ni];
            if (net.id === canonical || net.name.toUpperCase() !== rail) {
                continue;
            }
            const canonNet = doc.nets.find(n => n.id === canonical);
            if (canonNet === undefined) {
                continue;
            }
            for (let pi = 0; pi < net.pinIds.length; pi++) {
                if (!canonNet.pinIds.includes(net.pinIds[pi])) {
                    canonNet.pinIds.push(net.pinIds[pi]);
                }
            }
        }
    }
}
/**
 * Ensure net.pinIds reflect wire connectivity only.
 * Rebuilds wire netIds from geometry, then assigns pins at wire endpoints.
 */
export function ensureNetPinConnectivity(doc: SchematicDocument, gridSize: number = 10, resolver?: PinGeometryResolver): void {
    const before = countPinRefs(doc);
    rebuildWireNetTopology(doc, gridSize, resolver);
    for (let i = 0; i < doc.nets.length; i++) {
        doc.nets[i].pinIds = [];
    }
    const threshold = Math.max(gridSize * 2.5, 20);
    const wired = connectWireEndpoints(doc, threshold, resolver);
    // Proteus: same net-label text (case-sensitive) ⇒ same net — must run after geometry rebuild
    applyNetLabelConnectivity(doc, gridSize);
    mergeRailNets(doc);
    pruneOrphanNets(doc);
    const after = countPinRefs(doc);
    traceNetConnectivity(before, after, wired, doc.components.length, doc.wires.length);
}
/** Strip and rebuild all pinIds from wires (simulation reload). */
export function rebuildAllNetPinConnectivity(doc: SchematicDocument, gridSize: number = 10, resolver?: PinGeometryResolver): void {
    for (let i = 0; i < doc.nets.length; i++) {
        doc.nets[i].pinIds = [];
    }
    ensureNetPinConnectivity(doc, gridSize, resolver);
}
export function summarizeNetPins(doc: SchematicDocument, maxNets: number = 6): string {
    const parts: string[] = [];
    let count = 0;
    for (let i = 0; i < doc.nets.length && count < maxNets; i++) {
        const net = doc.nets[i];
        if (net.pinIds.length === 0) {
            continue;
        }
        parts.push(`${net.name || net.id}(${net.pinIds.length})`);
        count++;
    }
    return parts.length > 0 ? parts.join(', ') : '(no pins)';
}
