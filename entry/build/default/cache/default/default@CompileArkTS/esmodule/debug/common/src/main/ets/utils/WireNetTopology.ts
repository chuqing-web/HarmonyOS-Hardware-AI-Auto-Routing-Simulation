import { NetType } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/CommonTypes";
import type { SchematicDocument, Point2D } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/CommonTypes";
import type { PinGeometry, PinGeometryResolver } from './NetPinRebuildUtil';
import { Logger } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/Logger";
import { INSTR_TRACE_TAG } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/InstrumentTraceLog";
import { namedMcuPinGeoms, namedDevicePinGeoms } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/NamedDevicePinDefaults";
// Re-export helper access — defaultPinsForLib is not exported from NetPinRebuildUtil,
// duplicate minimal pin lookup inline via resolver pattern.
enum JunctionKind {
    VCC = "vcc",
    GND = "gnd",
    VEE = "vee",
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
function makePinGeometry(id: string, name: string, x: number, y: number): PinGeometry {
    const geom: PinGeometry = { id: id, name: name, x: x, y: y };
    return geom;
}
function makePinWorldRef(compId: string, pinId: string, pinName: string, libraryId: string, worldX: number, worldY: number): PinWorldRef {
    const ref: PinWorldRef = {
        compId: compId, pinId: pinId, pinName: pinName, libraryId: libraryId,
        worldX: worldX, worldY: worldY
    };
    return ref;
}
function makeJunctionPinRef(compId: string, pinId: string, pinName: string, libraryId: string): JunctionPinRef {
    const ref: JunctionPinRef = {
        compId: compId, pinId: pinId, pinName: pinName, libraryId: libraryId
    };
    return ref;
}
function roundKey(p: Point2D): string {
    return `${Math.round(p.x)},${Math.round(p.y)}`;
}
function isVccLib(lib: string): boolean {
    const u = lib.toUpperCase();
    return u === 'VCC' || u.endsWith('/VCC') || u === 'VDD' || u.endsWith('/VDD');
}
function isGndLib(lib: string): boolean {
    const u = lib.toUpperCase();
    return u === 'GND' || u.endsWith('/GND') || u === 'VSS' || u.endsWith('/VSS') || u === '0';
}
function isVeeLib(lib: string): boolean {
    const u = lib.toUpperCase();
    return u === 'VEE' || u.endsWith('/VEE');
}
function isPassiveLib(lib: string): boolean {
    const u = lib.toUpperCase();
    return u.startsWith('R_') || u.includes('RESISTOR') || u.startsWith('C_') ||
        u.includes('CAP') || u.startsWith('L_') || u.includes('INDUCTOR');
}
/**
 * Dense multi-pin packages (MCU / logic IC). Their pin junctions must count as
 * SIGNAL barriers so VCC/GND BFS cannot paint Port pins → GPIO_MISS / LED always-on.
 */
function isDenseSignalLib(lib: string): boolean {
    const u = (lib ?? '').toUpperCase();
    if (u.includes('AT89') || u.includes('STC89') || u.includes('STC15') ||
        u.includes('8051') || u.includes('MCS51') || u.includes('STM32')) {
        return true;
    }
    if (u.startsWith('74HC') || u.startsWith('74LS') || u.startsWith('CD4') ||
        u.includes('LM555') || u.includes('NE555') || u === '555') {
        return true;
    }
    return false;
}
/** True if both junctions carry different pins of the same component (do not UF-merge). */
function sameComponentDistinctPins(a: Junction, b: Junction): boolean {
    for (let i = 0; i < a.pinRefs.length; i++) {
        const pa = a.pinRefs[i];
        for (let j = 0; j < b.pinRefs.length; j++) {
            const pb = b.pinRefs[j];
            if (pa.compId === pb.compId && pa.pinId !== pb.pinId) {
                return true;
            }
        }
    }
    return false;
}
function transformPin(local: Point2D, rotation: number, mirrored: boolean): Point2D {
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
function collectPins(doc: SchematicDocument, resolver?: PinGeometryResolver): PinWorldRef[] {
    const pins: PinWorldRef[] = [];
    for (let ci = 0; ci < doc.components.length; ci++) {
        const comp = doc.components[ci];
        let geoms: PinGeometry[] | null = null;
        if (resolver !== undefined) {
            geoms = resolver(comp.libraryId);
        }
        if (geoms === null || geoms.length === 0) {
            geoms = internalDefaultPins(comp.libraryId);
        }
        for (let pi = 0; pi < geoms.length; pi++) {
            const pin = geoms[pi];
            const local = transformPin({ x: pin.x, y: pin.y }, comp.rotation, comp.mirrored);
            pins.push(makePinWorldRef(comp.id, pin.id, pin.name, comp.libraryId, comp.position.x + local.x, comp.position.y + local.y));
        }
    }
    return pins;
}
function internalDefaultPins(libraryId: string): PinGeometry[] {
    const lib = (libraryId ?? '').toUpperCase();
    if (lib === 'VCC' || lib.endsWith('/VCC')) {
        return [makePinGeometry('1', 'VCC', 0, 10)];
    }
    if (lib === 'GND' || lib.endsWith('/GND')) {
        return [makePinGeometry('1', 'GND', 0, -10)];
    }
    if (lib === 'VEE' || lib.endsWith('/VEE')) {
        return [makePinGeometry('1', 'VEE', 0, -10)];
    }
    if (lib === 'SIGNAL_GEN' || lib.startsWith('SIGNAL_GEN')) {
        return [
            makePinGeometry('OUT', 'OUT', -30, 0),
            makePinGeometry('GND', 'GND', 30, 0)
        ];
    }
    if (lib.includes('LM7805') || lib.includes('LM7812') || lib.includes('AMS1117')) {
        return [
            makePinGeometry('1', 'IN', -40, 0),
            makePinGeometry('2', 'GND', 0, 40),
            makePinGeometry('3', 'OUT', 40, 0)
        ];
    }
    if (lib.includes('VOLTMETER')) {
        return [
            makePinGeometry('V+', 'V+', -30, -25),
            makePinGeometry('COM', 'COM', -30, 25)
        ];
    }
    if (lib.includes('AMMETER')) {
        return [
            makePinGeometry('I+', 'I+', -30, 0),
            makePinGeometry('I-', 'I-', -30, 20)
        ];
    }
    if (lib.includes('LOGIC_ANALYZER')) {
        const pins: PinGeometry[] = [];
        for (let i = 0; i < 8; i++) {
            pins.push(makePinGeometry(`CH${i + 1}`, `CH${i + 1}`, -40, -40 + i * 10));
        }
        pins.push(makePinGeometry('GND', 'GND', -40, 40));
        return pins;
    }
    if (lib.includes('UART_TERMINAL')) {
        return [
            makePinGeometry('TX', 'TX', -40, -10),
            makePinGeometry('RX', 'RX', -40, 10),
            makePinGeometry('GND', 'GND', -40, 30)
        ];
    }
    if (lib.includes('POWER_METER')) {
        return [
            makePinGeometry('V+', 'V+', -40, -20),
            makePinGeometry('V-', 'V-', -40, 0),
            makePinGeometry('I+', 'I+', -40, 20),
            makePinGeometry('I-', 'I-', -40, 40)
        ];
    }
    if (lib.includes('FREQ_COUNTER')) {
        return [
            makePinGeometry('IN', 'IN', -30, -10),
            makePinGeometry('GND', 'GND', -30, 10)
        ];
    }
    if (lib.includes('VIRTUAL_METER')) {
        return [
            makePinGeometry('V', 'V', -30, -30),
            makePinGeometry('A', 'A', -30, -10),
            makePinGeometry('OHM', 'OHM', -30, 10),
            makePinGeometry('COM', 'COM', -30, 30)
        ];
    }
    if (lib === 'VAC' || lib.startsWith('VAC')) {
        return [
            makePinGeometry('1', 'AC+', -20, 0),
            makePinGeometry('2', 'AC-', 20, 0)
        ];
    }
    if (lib.includes('LM358') || lib.includes('LM324') || lib.includes('TL08')) {
        return [
            makePinGeometry('OUT1', 'OUT1', 50, -30),
            makePinGeometry('IN-1', 'IN-1', -50, -20),
            makePinGeometry('IN+1', 'IN+1', -50, -40),
            makePinGeometry('V-', 'V-', 0, 50),
            makePinGeometry('IN+2', 'IN+2', -50, 20),
            makePinGeometry('IN-2', 'IN-2', -50, 40),
            makePinGeometry('OUT2', 'OUT2', 50, 30),
            makePinGeometry('V+', 'V+', 0, -50)
        ];
    }
    if (lib.includes('LM555') || lib.includes('NE555')) {
        return [
            makePinGeometry('GND', 'GND', -40, -30),
            makePinGeometry('TRIG', 'TRIG', -40, -10),
            makePinGeometry('OUT', 'OUT', -40, 10),
            makePinGeometry('RESET', 'RESET', -40, 30),
            makePinGeometry('CTRL', 'CTRL', 40, 30),
            makePinGeometry('THRES', 'THRES', 40, 10),
            makePinGeometry('DISCH', 'DISCH', 40, -10),
            makePinGeometry('VCC', 'VCC', 40, -30)
        ];
    }
    if (lib.includes('OSCILLOSCOPE')) {
        return [
            makePinGeometry('CH1', 'CH1', -40, -30),
            makePinGeometry('CH2', 'CH2', -40, -10),
            makePinGeometry('CH3', 'CH3', -40, 10),
            makePinGeometry('CH4', 'CH4', -40, 30),
            makePinGeometry('GND', 'GND', -40, 50)
        ];
    }
    const namedDev = namedDevicePinGeoms(lib);
    if (namedDev.length > 0) {
        const pins: PinGeometry[] = [];
        for (let i = 0; i < namedDev.length; i++) {
            const s = namedDev[i];
            pins.push(makePinGeometry(s.id, s.name, s.x, s.y));
        }
        return pins;
    }
    // MCU DIP — 具名脚（与 NamedDevicePins 对齐）
    const mcuPins = mcuInternalDefaultPins(lib);
    if (mcuPins.length > 0) {
        return mcuPins;
    }
    return [
        makePinGeometry('1', '1', -30, 0),
        makePinGeometry('2', '2', 30, 0)
    ];
}
function mcuInternalDefaultPins(libUpper: string): PinGeometry[] {
    const src = namedMcuPinGeoms(libUpper);
    const pins: PinGeometry[] = [];
    for (let i = 0; i < src.length; i++) {
        const s = src[i];
        pins.push(makePinGeometry(s.id, s.name, s.x, s.y));
    }
    return pins;
}
function findOrCreateJunction(junctions: Map<string, Junction>, key: string, pt: Point2D): Junction {
    let j = junctions.get(key);
    if (j === undefined) {
        j = { key: key, x: pt.x, y: pt.y, pinRefs: [] };
        junctions.set(key, j);
    }
    return j;
}
function pointOnSegment(p: Point2D, a: Point2D, b: Point2D, tol: number): boolean {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen2 = dx * dx + dy * dy;
    if (segLen2 < 1e-6) {
        return Math.abs(p.x - a.x) <= tol && Math.abs(p.y - a.y) <= tol;
    }
    const cross = Math.abs(dx * (a.y - p.y) - (a.x - p.x) * dy);
    const segLen = Math.sqrt(segLen2);
    if (cross / segLen > tol) {
        return false;
    }
    const dot = (p.x - a.x) * dx + (p.y - a.y) * dy;
    return dot >= -tol && dot <= segLen2 + tol;
}
/** Union-Find for junction keys */
class UnionFind {
    private parent: Map<string, string> = new Map();
    find(k: string): string {
        let p = this.parent.get(k);
        if (p === undefined) {
            this.parent.set(k, k);
            return k;
        }
        if (p !== k) {
            p = this.find(p);
            this.parent.set(k, p);
        }
        return p;
    }
    union(a: string, b: string): void {
        const ra = this.find(a);
        const rb = this.find(b);
        if (ra !== rb) {
            this.parent.set(rb, ra);
        }
    }
}
function classifyJunction(j: Junction): JunctionKind {
    let hasVccSym = false;
    let hasGndSym = false;
    let hasVeeSym = false;
    let hasPassive = false;
    let hasDenseSignal = false;
    for (let i = 0; i < j.pinRefs.length; i++) {
        const p = j.pinRefs[i];
        if (isVccLib(p.libraryId)) {
            hasVccSym = true;
        }
        else if (isGndLib(p.libraryId)) {
            hasGndSym = true;
        }
        else if (isVeeLib(p.libraryId)) {
            hasVeeSym = true;
        }
        else if (isPassiveLib(p.libraryId)) {
            hasPassive = true;
        }
        else if (isDenseSignalLib(p.libraryId)) {
            hasDenseSignal = true;
        }
    }
    // Mixed rails at one point → unknown (do not pick a winner)
    const railCount = (hasVccSym ? 1 : 0) + (hasGndSym ? 1 : 0) + (hasVeeSym ? 1 : 0);
    if (railCount > 1) {
        return JunctionKind.UNKNOWN;
    }
    if (hasVccSym) {
        return JunctionKind.VCC;
    }
    if (hasGndSym) {
        return JunctionKind.GND;
    }
    if (hasVeeSym) {
        return JunctionKind.VEE;
    }
    // Passives + MCU/IC pins block rail BFS (UNKNOWN previously allowed GND to paint P1..P8)
    if (hasPassive || hasDenseSignal) {
        return JunctionKind.SIGNAL;
    }
    return JunctionKind.UNKNOWN;
}
function kindPriority(k: JunctionKind): number {
    if (k === JunctionKind.SIGNAL) {
        return 3;
    }
    if (k === JunctionKind.VCC || k === JunctionKind.VEE) {
        return 2;
    }
    if (k === JunctionKind.GND) {
        return 1;
    }
    return 0;
}
function mergeKind(a: JunctionKind, b: JunctionKind): JunctionKind {
    if (kindPriority(a) >= kindPriority(b)) {
        return a;
    }
    return b;
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
/** Rail kind by template net name/type — never T-junction-merge distinct rails. */
function wireSupplyRailKind(doc: SchematicDocument, netId: string): JunctionKind {
    for (let i = 0; i < doc.nets.length; i++) {
        const net = doc.nets[i];
        if (net.id !== netId) {
            continue;
        }
        const name = net.name.toUpperCase();
        if (name === 'GND' || name === 'VSS' || name === '0' ||
            (net.type === NetType.GROUND && name !== 'VEE')) {
            return JunctionKind.GND;
        }
        if (name === 'VEE' || name === 'V-') {
            return JunctionKind.VEE;
        }
        if (net.type === NetType.POWER || name === 'VCC' || name === 'VDD' ||
            name === 'V+' || name === '+5V' || name === '+3V3') {
            return JunctionKind.VCC;
        }
        return JunctionKind.UNKNOWN;
    }
    return JunctionKind.UNKNOWN;
}
/** Skip T-junction union when distinct rails would short (VCC/GND/VEE). */
function railsWouldShort(a: JunctionKind, b: JunctionKind): boolean {
    const isRail = (k: JunctionKind): boolean => k === JunctionKind.VCC || k === JunctionKind.GND || k === JunctionKind.VEE;
    if (isRail(a) && isRail(b) && a !== b) {
        return true;
    }
    // Layout stub rubbing a rail: do not absorb signal into rail
    if (isRail(a) !== isRail(b)) {
        return true;
    }
    return false;
}
function ensureNet(doc: SchematicDocument, netId: string, name: string, type: NetType): void {
    if (doc.nets.some(n => n.id === netId)) {
        return;
    }
    doc.nets.push({ id: netId, name: name, type: type, pinIds: [] });
}
/**
 * Reassign wire.netId from wire geometry and power-symbol reachability.
 * Only VCC/GND **power symbols** seed rail propagation — instrument COM
 * does not pull signal junctions onto GND.
 */
export function rebuildWireNetTopology(doc: SchematicDocument, gridSize: number = 10, resolver?: PinGeometryResolver): number {
    if (doc.wires.length === 0) {
        return 0;
    }
    // Cap snap radii: MCU/DIP pin pitch is 10px. junctionRadius≥10 (e.g. gridSize=20)
    // would UF-merge P1..P8+NRST into one net → lab_51_led GPIO all drive NET_1, LEDs stay off.
    const junctionRadius = Math.min(Math.max(2, gridSize * 0.5), 5);
    const tJunctionTol = Math.min(Math.max(3, gridSize * 0.4), 4);
    const pinThreshold = Math.max(gridSize * 1.5, 15);
    const junctions = new Map<string, Junction>();
    const uf = new UnionFind();
    // Map pins to nearest junction key
    const pinList = collectPins(doc, resolver);
    for (let i = 0; i < pinList.length; i++) {
        const p = pinList[i];
        const key = roundKey({ x: p.worldX, y: p.worldY });
        const j = findOrCreateJunction(junctions, key, { x: p.worldX, y: p.worldY });
        j.pinRefs.push(makeJunctionPinRef(p.compId, p.pinId, p.pinName, p.libraryId));
    }
    // Wire endpoints → junctions + union
    for (let wi = 0; wi < doc.wires.length; wi++) {
        const wire = doc.wires[wi];
        if (wire.points.length < 2) {
            continue;
        }
        const p0 = wire.points[0];
        const p1 = wire.points[wire.points.length - 1];
        const k0 = roundKey(p0);
        const k1 = roundKey(p1);
        findOrCreateJunction(junctions, k0, p0);
        findOrCreateJunction(junctions, k1, p1);
        uf.union(k0, k1);
    }
    // Co-locate nearby junction keys (endpoint snap groups).
    // Never glue two different pins of the same dense IC (10px pitch column).
    const keys = Array.from(junctions.keys());
    for (let i = 0; i < keys.length; i++) {
        const ji = junctions.get(keys[i])!;
        for (let j = i + 1; j < keys.length; j++) {
            const jj = junctions.get(keys[j])!;
            const dx = ji.x - jj.x;
            const dy = ji.y - jj.y;
            if (Math.abs(dx) > junctionRadius || Math.abs(dy) > junctionRadius) {
                continue;
            }
            if (sameComponentDistinctPins(ji, jj)) {
                continue;
            }
            uf.union(keys[i], keys[j]);
        }
    }
    // T-junctions: wire endpoint on another wire's segment
    // Skip VCC↔GND crossings — layout stub collisions must not short the rails.
    for (let wi = 0; wi < doc.wires.length; wi++) {
        const wA = doc.wires[wi];
        if (wA.points.length < 2) {
            continue;
        }
        const railA = wireSupplyRailKind(doc, wA.netId);
        const epA = [wA.points[0], wA.points[wA.points.length - 1]];
        for (let ei = 0; ei < 2; ei++) {
            const ep = epA[ei];
            const epKey = roundKey(ep);
            for (let wj = 0; wj < doc.wires.length; wj++) {
                if (wj === wi) {
                    continue;
                }
                const wB = doc.wires[wj];
                const railB = wireSupplyRailKind(doc, wB.netId);
                if (railsWouldShort(railA, railB)) {
                    continue;
                }
                for (let si = 0; si < wB.points.length - 1; si++) {
                    if (pointOnSegment(ep, wB.points[si], wB.points[si + 1], tJunctionTol)) {
                        // 在线段上取投影点（非中点），避免错误并网
                        const a = wB.points[si];
                        const b = wB.points[si + 1];
                        const abx = b.x - a.x;
                        const aby = b.y - a.y;
                        const len2 = abx * abx + aby * aby;
                        let t = 0;
                        if (len2 > 1e-6) {
                            t = ((ep.x - a.x) * abx + (ep.y - a.y) * aby) / len2;
                            if (t < 0) {
                                t = 0;
                            }
                            else if (t > 1) {
                                t = 1;
                            }
                        }
                        const foot: Point2D = { x: a.x + t * abx, y: a.y + t * aby };
                        const footKey = roundKey(foot);
                        findOrCreateJunction(junctions, epKey, ep);
                        findOrCreateJunction(junctions, footKey, foot);
                        uf.union(epKey, footKey);
                        uf.union(footKey, roundKey(a));
                        uf.union(footKey, roundKey(b));
                    }
                }
            }
        }
    }
    // Assign pins snapped to wire endpoints (within threshold).
    // Cap threshold by half the distance to the nearest sibling pin so dense
    // instrument pin rows (e.g. OSC CH4 vs GND at 20px) cannot steal each other's nets.
    for (let i = 0; i < pinList.length; i++) {
        const p = pinList[i];
        let siblingHalf = pinThreshold;
        for (let j = 0; j < pinList.length; j++) {
            if (j === i) {
                continue;
            }
            const o = pinList[j];
            if (o.compId !== p.compId) {
                continue;
            }
            const sdx = p.worldX - o.worldX;
            const sdy = p.worldY - o.worldY;
            const half = Math.sqrt(sdx * sdx + sdy * sdy) * 0.5;
            if (half > 1 && half < siblingHalf) {
                siblingHalf = half;
            }
        }
        let bestKey = '';
        let bestDist = siblingHalf;
        junctions.forEach((j: Junction, key: string) => {
            const dx = p.worldX - j.x;
            const dy = p.worldY - j.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < bestDist) {
                bestDist = dist;
                bestKey = key;
            }
        });
        if (bestKey.length > 0) {
            const j = junctions.get(bestKey)!;
            const exists = j.pinRefs.some(pr => pr.compId === p.compId && pr.pinId === p.pinId);
            if (!exists) {
                j.pinRefs.push(makeJunctionPinRef(p.compId, p.pinId, p.pinName, p.libraryId));
            }
            uf.union(roundKey({ x: p.worldX, y: p.worldY }), bestKey);
        }
    }
    // Per-junction kind from local pins
    const junctionKind = new Map<string, JunctionKind>();
    junctions.forEach((j: Junction, key: string) => {
        junctionKind.set(key, classifyJunction(j));
    });
    // BFS from VCC/GND power-symbol junctions along wire graph only
    const rootKind = new Map<string, JunctionKind>();
    junctions.forEach((_j: Junction, key: string) => {
        rootKind.set(uf.find(key), JunctionKind.UNKNOWN);
    });
    const seeds: string[] = [];
    junctions.forEach((j: Junction, key: string) => {
        const k = classifyJunction(j);
        if (k === JunctionKind.VCC || k === JunctionKind.GND || k === JunctionKind.VEE) {
            seeds.push(key);
            rootKind.set(uf.find(key), k);
        }
    });
    // Build adjacency between junction keys via wires
    const adj = new Map<string, Set<string>>();
    const addEdge = (a: string, b: string): void => {
        if (!adj.has(a)) {
            adj.set(a, new Set());
        }
        adj.get(a)!.add(b);
        if (!adj.has(b)) {
            adj.set(b, new Set());
        }
        adj.get(b)!.add(a);
    };
    for (let wi = 0; wi < doc.wires.length; wi++) {
        const wire = doc.wires[wi];
        if (wire.points.length < 2) {
            continue;
        }
        const k0 = roundKey(wire.points[0]);
        const k1 = roundKey(wire.points[wire.points.length - 1]);
        addEdge(k0, k1);
    }
    // Merge co-located keys in adjacency
    const keyToRep = new Map<string, string>();
    junctions.forEach((_j: Junction, key: string) => {
        keyToRep.set(key, uf.find(key));
    });
    const repAdj = new Map<string, Set<string>>();
    adj.forEach((neighbors: Set<string>, key: string) => {
        const rep = uf.find(key);
        if (!repAdj.has(rep)) {
            repAdj.set(rep, new Set());
        }
        neighbors.forEach((n: string) => {
            repAdj.get(rep)!.add(uf.find(n));
        });
    });
    // BFS propagate VCC/GND from seeds
    const repKind = new Map<string, JunctionKind>();
    repAdj.forEach((_v: Set<string>, rep: string) => {
        repKind.set(rep, JunctionKind.UNKNOWN);
    });
    const queue: string[] = [];
    for (let si = 0; si < seeds.length; si++) {
        const rep = uf.find(seeds[si]);
        const sk = classifyJunction(junctions.get(seeds[si])!);
        if (sk === JunctionKind.VCC || sk === JunctionKind.GND || sk === JunctionKind.VEE) {
            repKind.set(rep, sk);
            queue.push(rep);
        }
    }
    let qi = 0;
    while (qi < queue.length) {
        const cur = queue[qi++];
        const curK = repKind.get(cur)!;
        const neighbors = repAdj.get(cur);
        if (neighbors === undefined) {
            continue;
        }
        neighbors.forEach((n: string) => {
            if (repKind.get(n) !== JunctionKind.UNKNOWN) {
                return;
            }
            // 禁止电源轨 BFS 涂到纯信号/无源结（经被动器件体「吞掉」信号网）
            let neighborHasRailSym = false;
            let neighborHasSignal = false;
            junctions.forEach((j: Junction, key: string) => {
                if (uf.find(key) !== n) {
                    return;
                }
                const ck = classifyJunction(j);
                if (ck === JunctionKind.VCC || ck === JunctionKind.GND || ck === JunctionKind.VEE) {
                    neighborHasRailSym = true;
                }
                else if (ck === JunctionKind.SIGNAL) {
                    neighborHasSignal = true;
                }
            });
            if (neighborHasSignal && !neighborHasRailSym &&
                (curK === JunctionKind.VCC || curK === JunctionKind.GND || curK === JunctionKind.VEE)) {
                return;
            }
            repKind.set(n, curK);
            queue.push(n);
        });
    }
    // Final junction kind: BFS rail > local passive=SIGNAL > unknown=SIGNAL
    const finalKind = new Map<string, JunctionKind>();
    junctions.forEach((j: Junction, key: string) => {
        const rep = uf.find(key);
        const bfsK = repKind.get(rep);
        if (bfsK === JunctionKind.VCC || bfsK === JunctionKind.GND || bfsK === JunctionKind.VEE) {
            finalKind.set(key, bfsK);
            return;
        }
        const localK = classifyJunction(j);
        if (localK === JunctionKind.SIGNAL || localK === JunctionKind.UNKNOWN) {
            finalKind.set(key, JunctionKind.SIGNAL);
        }
        else {
            finalKind.set(key, localK);
        }
    });
    // Resolve net IDs for each kind
    const vccNetId = findNetByName(doc, 'VCC') ?? `net_topo_vcc_${doc.nets.length}`;
    const gndNetId = findNetByName(doc, 'GND') ?? `net_topo_gnd_${doc.nets.length + 1}`;
    const veeNetId = findNetByName(doc, 'VEE') ?? `net_topo_vee_${doc.nets.length + 2}`;
    ensureNet(doc, vccNetId, 'VCC', NetType.POWER);
    ensureNet(doc, gndNetId, 'GND', NetType.GROUND);
    ensureNet(doc, veeNetId, 'VEE', NetType.POWER);
    let signalIdx = 0;
    const signalNetForRep = new Map<string, string>();
    // 重建前：wire.netId → 有意义网名（非 NET_*），用于信号分量继承，避免 HYST_NODE 被改成 NET_13
    const nameByOldNetId = new Map<string, string>();
    for (let i = 0; i < doc.nets.length; i++) {
        const n = doc.nets[i];
        const nm = (n.name ?? '').trim();
        if (nm.length === 0 || /^NET_\d+$/i.test(nm) || /^net_topo/i.test(nm)) {
            continue;
        }
        nameByOldNetId.set(n.id, nm);
    }
    const inheritedNameForRep = new Map<string, string>();
    for (let wi = 0; wi < doc.wires.length; wi++) {
        const w = doc.wires[wi];
        if (w.points.length < 2 || w.netId.length === 0) {
            continue;
        }
        const inherited = nameByOldNetId.get(w.netId);
        if (inherited === undefined) {
            continue;
        }
        const k0 = roundKey(w.points[0]);
        const rep = uf.find(k0);
        const prev = inheritedNameForRep.get(rep);
        if (prev === undefined) {
            inheritedNameForRep.set(rep, inherited);
        }
        else if (prev !== inherited) {
            // 同几何分量冲突多名 → 放弃继承，走 NET_N
            inheritedNameForRep.set(rep, '');
        }
    }
    const wireKindForEndpoints = (k0: string, k1: string): JunctionKind => {
        const j0 = finalKind.get(k0) ?? JunctionKind.SIGNAL;
        const j1 = finalKind.get(k1) ?? JunctionKind.SIGNAL;
        // Never collapse distinct rails onto one net.
        if (railsWouldShort(j0, j1)) {
            return JunctionKind.SIGNAL;
        }
        if (j0 === JunctionKind.GND || j1 === JunctionKind.GND) {
            return JunctionKind.GND;
        }
        if (j0 === JunctionKind.VEE || j1 === JunctionKind.VEE) {
            return JunctionKind.VEE;
        }
        if (j0 === JunctionKind.VCC || j1 === JunctionKind.VCC) {
            return JunctionKind.VCC;
        }
        return mergeKind(j0, j1);
    };
    const netIdForKind = (kind: JunctionKind, rep: string): string => {
        if (kind === JunctionKind.VCC) {
            return vccNetId;
        }
        if (kind === JunctionKind.GND) {
            return gndNetId;
        }
        if (kind === JunctionKind.VEE) {
            return veeNetId;
        }
        let sid = signalNetForRep.get(rep);
        if (sid === undefined) {
            const keepName = inheritedNameForRep.get(rep) ?? '';
            if (keepName.length > 0) {
                const existing = findNetByName(doc, keepName);
                if (existing !== null) {
                    sid = existing;
                }
                else {
                    signalIdx++;
                    sid = `net_topo_sig_${signalIdx}`;
                    ensureNet(doc, sid, keepName, NetType.SIGNAL);
                }
            }
            else {
                signalIdx++;
                sid = `net_topo_sig_${signalIdx}`;
                ensureNet(doc, sid, `NET_${signalIdx}`, NetType.SIGNAL);
            }
            signalNetForRep.set(rep, sid);
        }
        return sid;
    };
    let reassignCount = 0;
    for (let wi = 0; wi < doc.wires.length; wi++) {
        const wire = doc.wires[wi];
        if (wire.points.length < 2) {
            continue;
        }
        const k0 = roundKey(wire.points[0]);
        const k1 = roundKey(wire.points[wire.points.length - 1]);
        const wKind = wireKindForEndpoints(k0, k1);
        const rep = uf.find(k0);
        const targetNet = netIdForKind(wKind, rep);
        if (wire.netId !== targetNet) {
            wire.netId = targetNet;
            reassignCount++;
        }
    }
    if (reassignCount > 0) {
        Logger.info(INSTR_TRACE_TAG, `[TOPO] rebuilt wire nets: ${reassignCount} wires reassigned, ` +
            `signalNets=${signalIdx} junctions=${junctions.size}`);
    }
    return reassignCount;
}
