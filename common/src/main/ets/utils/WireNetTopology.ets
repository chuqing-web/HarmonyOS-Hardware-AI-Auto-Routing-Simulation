/**
 * Rebuild wire netId assignments from geometry + power-symbol reachability.
 * Fixes cases where visually-correct wires were saved with wrong net UUIDs
 * (e.g. R1–R2 series segment labelled GND).
 */
import { SchematicDocument, ComponentInstance, NetType, Point2D, Wire } from '../types/CommonTypes';
import { PinGeometry, PinGeometryResolver } from './NetPinRebuildUtil';
import { Logger } from './Logger';
import { INSTR_TRACE_TAG } from './InstrumentTraceLog';

// Re-export helper access — defaultPinsForLib is not exported from NetPinRebuildUtil,
// duplicate minimal pin lookup inline via resolver pattern.

enum JunctionKind {
  VCC = 'vcc',
  GND = 'gnd',
  SIGNAL = 'signal',
  UNKNOWN = 'unknown'
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

function makePinWorldRef(compId: string, pinId: string, pinName: string, libraryId: string,
  worldX: number, worldY: number): PinWorldRef {
  const ref: PinWorldRef = {
    compId: compId, pinId: pinId, pinName: pinName, libraryId: libraryId,
    worldX: worldX, worldY: worldY
  };
  return ref;
}

function makeJunctionPinRef(compId: string, pinId: string, pinName: string,
  libraryId: string): JunctionPinRef {
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
  return u === 'VCC' || u.endsWith('/VCC') || u.includes('VDD');
}

function isGndLib(lib: string): boolean {
  const u = lib.toUpperCase();
  return u === 'GND' || u.endsWith('/GND') || u === 'VSS' || u === '0';
}

function isPassiveLib(lib: string): boolean {
  const u = lib.toUpperCase();
  return u.startsWith('R_') || u.includes('RESISTOR') || u.startsWith('C_') ||
    u.includes('CAP') || u.startsWith('L_') || u.includes('INDUCTOR');
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
      pins.push(makePinWorldRef(
        comp.id, pin.id, pin.name, comp.libraryId,
        comp.position.x + local.x, comp.position.y + local.y));
    }
  }
  return pins;
}

function internalDefaultPins(libraryId: string): PinGeometry[] {
  const lib = libraryId.toUpperCase();
  if (lib === 'VCC' || lib.endsWith('/VCC')) {
    return [makePinGeometry('1', 'VCC', 0, 10)];
  }
  if (lib === 'GND' || lib.endsWith('/GND')) {
    return [makePinGeometry('1', 'GND', 0, -10)];
  }
  if (lib.includes('VOLTMETER')) {
    return [
      makePinGeometry('V+', 'V+', -30, -10),
      makePinGeometry('COM', 'COM', -30, 10)
    ];
  }
  if (lib.includes('AMMETER')) {
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
  let hasPassive = false;
  for (let i = 0; i < j.pinRefs.length; i++) {
    const p = j.pinRefs[i];
    if (isVccLib(p.libraryId)) {
      hasVccSym = true;
    } else if (isGndLib(p.libraryId)) {
      hasGndSym = true;
    } else if (isPassiveLib(p.libraryId)) {
      hasPassive = true;
    }
  }
  if (hasVccSym && !hasGndSym) {
    return JunctionKind.VCC;
  }
  if (hasGndSym && !hasVccSym) {
    return JunctionKind.GND;
  }
  if (hasPassive) {
    return JunctionKind.SIGNAL;
  }
  return JunctionKind.UNKNOWN;
}

function kindPriority(k: JunctionKind): number {
  if (k === JunctionKind.SIGNAL) {
    return 3;
  }
  if (k === JunctionKind.VCC) {
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
export function rebuildWireNetTopology(doc: SchematicDocument, gridSize: number = 10,
  resolver?: PinGeometryResolver): number {
  if (doc.wires.length === 0) {
    return 0;
  }

  const junctionRadius = Math.max(2, gridSize * 0.5);
  const tJunctionTol = Math.max(3, gridSize * 0.4);
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

  // Co-locate nearby junction keys (endpoint snap groups)
  const keys = Array.from(junctions.keys());
  for (let i = 0; i < keys.length; i++) {
    const ji = junctions.get(keys[i])!;
    for (let j = i + 1; j < keys.length; j++) {
      const jj = junctions.get(keys[j])!;
      const dx = ji.x - jj.x;
      const dy = ji.y - jj.y;
      if (Math.abs(dx) <= junctionRadius && Math.abs(dy) <= junctionRadius) {
        uf.union(keys[i], keys[j]);
      }
    }
  }

  // T-junctions: wire endpoint on another wire's segment
  for (let wi = 0; wi < doc.wires.length; wi++) {
    const wA = doc.wires[wi];
    if (wA.points.length < 2) {
      continue;
    }
    const epA = [wA.points[0], wA.points[wA.points.length - 1]];
    for (let ei = 0; ei < 2; ei++) {
      const ep = epA[ei];
      const epKey = roundKey(ep);
      for (let wj = 0; wj < doc.wires.length; wj++) {
        if (wj === wi) {
          continue;
        }
        const wB = doc.wires[wj];
        for (let si = 0; si < wB.points.length - 1; si++) {
          if (pointOnSegment(ep, wB.points[si], wB.points[si + 1], tJunctionTol)) {
            const midKey = roundKey({
              x: (wB.points[si].x + wB.points[si + 1].x) / 2,
              y: (wB.points[si].y + wB.points[si + 1].y) / 2
            });
            findOrCreateJunction(junctions, epKey, ep);
            findOrCreateJunction(junctions, midKey, wB.points[si]);
            uf.union(epKey, midKey);
            uf.union(midKey, roundKey(wB.points[si]));
            uf.union(midKey, roundKey(wB.points[si + 1]));
          }
        }
      }
    }
  }

  // Assign pins snapped to wire endpoints (within threshold)
  for (let i = 0; i < pinList.length; i++) {
    const p = pinList[i];
    let bestKey = '';
    let bestDist = pinThreshold;
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
    if (k === JunctionKind.VCC || k === JunctionKind.GND) {
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
    if (sk === JunctionKind.VCC || sk === JunctionKind.GND) {
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
      repKind.set(n, curK);
      queue.push(n);
    });
  }

  // Final junction kind: BFS rail > local passive=SIGNAL > unknown=SIGNAL
  const finalKind = new Map<string, JunctionKind>();
  junctions.forEach((j: Junction, key: string) => {
    const rep = uf.find(key);
    const bfsK = repKind.get(rep);
    if (bfsK === JunctionKind.VCC || bfsK === JunctionKind.GND) {
      finalKind.set(key, bfsK);
      return;
    }
    const localK = classifyJunction(j);
    if (localK === JunctionKind.SIGNAL || localK === JunctionKind.UNKNOWN) {
      finalKind.set(key, JunctionKind.SIGNAL);
    } else {
      finalKind.set(key, localK);
    }
  });

  // Resolve net IDs for each kind
  const vccNetId = findNetByName(doc, 'VCC') ?? `net_topo_vcc_${doc.nets.length}`;
  const gndNetId = findNetByName(doc, 'GND') ?? `net_topo_gnd_${doc.nets.length + 1}`;
  ensureNet(doc, vccNetId, 'VCC', NetType.POWER);
  ensureNet(doc, gndNetId, 'GND', NetType.GROUND);

  let signalIdx = 0;
  const signalNetForRep = new Map<string, string>();

  const wireKindForEndpoints = (k0: string, k1: string): JunctionKind => {
    const j0 = finalKind.get(k0) ?? JunctionKind.SIGNAL;
    const j1 = finalKind.get(k1) ?? JunctionKind.SIGNAL;
    // Any endpoint on a GND/VCC rail pulls the whole wire onto that rail.
    if (j0 === JunctionKind.GND || j1 === JunctionKind.GND) {
      return JunctionKind.GND;
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
    let sid = signalNetForRep.get(rep);
    if (sid === undefined) {
      signalIdx++;
      sid = `net_topo_sig_${signalIdx}`;
      ensureNet(doc, sid, `NET_${signalIdx}`, NetType.SIGNAL);
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
    Logger.info(INSTR_TRACE_TAG,
      `[TOPO] rebuilt wire nets: ${reassignCount} wires reassigned, ` +
      `signalNets=${signalIdx} junctions=${junctions.size}`);
  }

  return reassignCount;
}
