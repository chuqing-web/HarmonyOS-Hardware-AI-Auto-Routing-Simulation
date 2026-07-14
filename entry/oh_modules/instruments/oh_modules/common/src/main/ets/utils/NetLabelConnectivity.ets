/**
 * Proteus/KiCad Net Label semantics: same label text (case-sensitive) ⇒ same net.
 * Rebinds labels to nearby wire geometry after topology rebuild, then unions nets.
 */
import { SchematicDocument, Net, NetType, NetLabel, Point2D } from '../types/CommonTypes';
import { IdUtil } from './IdUtil';

function dist2(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Perp distance from point to segment; -1 if projection outside segment pad. */
function perpDistToSegment(p: Point2D, a: Point2D, b: Point2D, endPad: number): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const segLen2 = dx * dx + dy * dy;
  if (segLen2 < 1e-6) {
    return Math.sqrt(dist2(p, a));
  }
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / segLen2;
  const segLen = Math.sqrt(segLen2);
  const padT = endPad / segLen;
  if (t < -padT || t > 1 + padT) {
    return -1;
  }
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

/** Auto-generated topo names must not participate in label merging. */
export function isAutoNetLabelText(text: string): boolean {
  if (text.length === 0) {
    return true;
  }
  if (/^NET_\d+$/i.test(text)) {
    return true;
  }
  if (/^net_topo/i.test(text)) {
    return true;
  }
  return false;
}

/**
 * Nearest wire net for a label. Prefer endpoints; mid-segment only with tight
 * perpendicular distance so adjacent parallel stubs (e.g. V+/COM) do not steal.
 */
function findNearestWireNetId(doc: SchematicDocument, pos: Point2D, endTol: number): string | null {
  let bestId: string | null = null;
  let bestD2 = endTol * endTol;
  const segPerpTol = Math.min(4, endTol * 0.25);

  for (let wi = 0; wi < doc.wires.length; wi++) {
    const wire = doc.wires[wi];
    if (wire.points.length < 2 || wire.netId.length === 0) {
      continue;
    }
    const p0 = wire.points[0];
    const p1 = wire.points[wire.points.length - 1];
    const dEnd = Math.min(dist2(pos, p0), dist2(pos, p1));
    if (dEnd < bestD2) {
      bestD2 = dEnd;
      bestId = wire.netId;
    }
    for (let si = 0; si < wire.points.length - 1; si++) {
      const a = wire.points[si];
      const b = wire.points[si + 1];
      const perp = perpDistToSegment(pos, a, b, endTol);
      if (perp < 0 || perp > segPerpTol) {
        continue;
      }
      const d2 = perp * perp;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestId = wire.netId;
      }
    }
  }
  return bestId;
}

function findNet(doc: SchematicDocument, netId: string): Net | undefined {
  return doc.nets.find(n => n.id === netId);
}

function ensureNamedNet(doc: SchematicDocument, text: string): Net {
  let net = doc.nets.find(n => n.name === text);
  if (net !== undefined) {
    return net;
  }
  let netType = NetType.SIGNAL;
  const upper = text.toUpperCase();
  if (upper === 'VCC' || upper === 'VDD') {
    netType = NetType.POWER;
  } else if (upper === 'GND' || upper === 'VSS' || upper === '0') {
    netType = NetType.GROUND;
  }
  net = {
    id: IdUtil.generate('net'),
    name: text,
    type: netType,
    pinIds: []
  };
  doc.nets.push(net);
  return net;
}

function mergeNetInto(doc: SchematicDocument, fromId: string, toId: string): void {
  if (fromId === toId) {
    return;
  }
  const fromNet = findNet(doc, fromId);
  const toNet = findNet(doc, toId);
  if (toNet === undefined) {
    return;
  }
  for (let wi = 0; wi < doc.wires.length; wi++) {
    if (doc.wires[wi].netId === fromId) {
      doc.wires[wi].netId = toId;
    }
  }
  for (let li = 0; li < doc.netLabels.length; li++) {
    if (doc.netLabels[li].netId === fromId) {
      doc.netLabels[li].netId = toId;
    }
  }
  if (fromNet !== undefined) {
    for (let pi = 0; pi < fromNet.pinIds.length; pi++) {
      const ref = fromNet.pinIds[pi];
      if (!toNet.pinIds.includes(ref)) {
        toNet.pinIds.push(ref);
      }
    }
    doc.nets = doc.nets.filter(n => n.id !== fromId);
  }
}

/**
 * After geometric topology rebuild: bind labels to nearby wires, then union
 * all nets that share the same exclusive label text (case-sensitive).
 * Geo-nets claimed by conflicting label texts are left unmerged.
 */
export function applyNetLabelConnectivity(doc: SchematicDocument, gridSize: number = 10): number {
  if (doc.netLabels === undefined || doc.netLabels.length === 0) {
    return 0;
  }
  // Tight endpoint snap — loose mid-segment previously pulled COM→V+ (20px apart)
  const endTol = Math.max(gridSize * 1.2, 10);
  let mergeCount = 0;

  for (let li = 0; li < doc.netLabels.length; li++) {
    const label = doc.netLabels[li];
    if (isAutoNetLabelText(label.text)) {
      continue;
    }
    const hit = findNearestWireNetId(doc, label.position, endTol);
    if (hit !== null) {
      label.netId = hit;
    }
  }

  // Which label texts claim each geometric net?
  const textsOnNet = new Map<string, Set<string>>();
  for (let li = 0; li < doc.netLabels.length; li++) {
    const label = doc.netLabels[li];
    if (isAutoNetLabelText(label.text) || label.netId.length === 0) {
      continue;
    }
    let set = textsOnNet.get(label.netId);
    if (set === undefined) {
      set = new Set<string>();
      textsOnNet.set(label.netId, set);
    }
    set.add(label.text);
  }

  // text → exclusive geo-nets (no conflicting other texts)
  const netIdsByText = new Map<string, string[]>();
  textsOnNet.forEach((texts: Set<string>, netId: string) => {
    if (texts.size !== 1) {
      return;
    }
    let only = '';
    texts.forEach((t: string) => { only = t; });
    let list = netIdsByText.get(only);
    if (list === undefined) {
      list = [];
      netIdsByText.set(only, list);
    }
    if (!list.includes(netId)) {
      list.push(netId);
    }
  });

  netIdsByText.forEach((netIds: string[], text: string) => {
    const canonical = ensureNamedNet(doc, text);
    for (let i = 0; i < netIds.length; i++) {
      if (netIds[i] !== canonical.id) {
        mergeNetInto(doc, netIds[i], canonical.id);
        mergeCount++;
      }
    }
    for (let li = 0; li < doc.netLabels.length; li++) {
      if (doc.netLabels[li].text === text && !isAutoNetLabelText(text)) {
        // Only retarget labels whose geo-net is exclusive to this text (or already canonical)
        const nid = doc.netLabels[li].netId;
        const claim = textsOnNet.get(nid);
        if (nid === canonical.id || (claim !== undefined && claim.size === 1 && claim.has(text))) {
          doc.netLabels[li].netId = canonical.id;
        }
      }
    }
    canonical.name = text;
    if (text === 'VCC' || text === 'VDD') {
      canonical.type = NetType.POWER;
    } else if (text === 'GND' || text === 'VSS' || text === '0') {
      canonical.type = NetType.GROUND;
    }
  });

  return mergeCount;
}
