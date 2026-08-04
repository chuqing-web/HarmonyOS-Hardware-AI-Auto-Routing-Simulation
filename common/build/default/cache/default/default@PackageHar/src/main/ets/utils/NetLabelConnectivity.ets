/**
 * Proteus/KiCad Net Label semantics: same label text (case-sensitive) ⇒ same net.
 * Rebinds labels to nearby wire geometry after topology rebuild, then unions nets.
 * KiCad 对齐：标号须触到铜皮（半格内），禁止松散垂距误并邻线。
 */
import { SchematicDocument, Net, NetType, NetLabel, Point2D } from '../types/CommonTypes';
import { IdUtil } from './IdUtil';

function dist2(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function wirePathLength(wirePoints: Point2D[]): number {
  let len = 0;
  for (let i = 1; i < wirePoints.length; i++) {
    len += Math.hypot(wirePoints[i].x - wirePoints[i - 1].x, wirePoints[i].y - wirePoints[i - 1].y);
  }
  return len;
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

/**
 * KiCad-like copper touch tolerance：半格（下限 5mil）。
 * 标号锚点须落在导线端点或线段上，禁止 1.5×grid 松吸附误并邻 stub。
 */
export function labelCopperTouchTol(gridSize: number): number {
  const g = gridSize > 0 ? gridSize : 10;
  return Math.max(g * 0.5, 5);
}

/**
 * 半格触铜过严时：把标号吸附到最近导线端点（优先搜索半径 searchTol），
 * 避免 AI stub/浮点导致「标号未并网」。返回吸附次数。
 */
export function snapLabelsOntoCopper(doc: SchematicDocument, gridSize: number = 10): number {
  if (doc.netLabels === undefined || doc.netLabels.length === 0 || doc.wires.length === 0) {
    return 0;
  }
  const touchTol = labelCopperTouchTol(gridSize);
  const searchTol = Math.max(touchTol * 4, gridSize * 2, 20);
  let snapped = 0;
  for (let li = 0; li < doc.netLabels.length; li++) {
    const label = doc.netLabels[li];
    if (isAutoNetLabelText(label.text)) {
      continue;
    }
    // 已在触铜范围内则不动
    if (findNearestWireNetId(doc, label.position, touchTol) !== null) {
      continue;
    }
    let best: Point2D | null = null;
    let bestD = searchTol;
    let preferNet = label.netId;
    for (let wi = 0; wi < doc.wires.length; wi++) {
      const w = doc.wires[wi];
      if (w.points.length < 2) {
        continue;
      }
      // 优先吸到已声明同网的导线端点
      const sameNet = preferNet.length > 0 && w.netId === preferNet;
      const ends: Point2D[] = [w.points[0], w.points[w.points.length - 1]];
      for (let ei = 0; ei < ends.length; ei++) {
        const d = Math.hypot(label.position.x - ends[ei].x, label.position.y - ends[ei].y);
        const score = sameNet ? d - 1 : d;
        if (score < bestD) {
          bestD = score;
          best = { x: ends[ei].x, y: ends[ei].y };
        }
      }
    }
    if (best !== null) {
      label.position = best;
      snapped++;
    }
  }
  return snapped;
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

/** Power / ground rail label texts (display as symbols, merge as rails). */
export function isPowerRailLabelText(text: string): boolean {
  const upper = text.toUpperCase();
  return upper === 'VCC' || upper === 'VDD' || upper === 'V+' ||
    upper === 'GND' || upper === 'VSS' || upper === 'VEE' || upper === '0';
}

export function isGroundLabelText(text: string): boolean {
  const upper = text.toUpperCase();
  return upper === 'GND' || upper === 'VSS' || upper === '0';
}

export function isPowerSupplyLabelText(text: string): boolean {
  const upper = text.toUpperCase();
  return upper === 'VCC' || upper === 'VDD' || upper === 'V+' || upper === 'VEE';
}

/** Canonical rail text for sim merge (case-insensitive aliases → one name). */
export function canonicalizeRailLabelText(text: string): string | null {
  const upper = text.toUpperCase();
  if (upper === 'GND' || upper === 'VSS' || upper === '0') {
    return 'GND';
  }
  if (upper === 'VCC' || upper === 'VDD' || upper === 'V+') {
    return 'VCC';
  }
  if (upper === 'VEE' || upper === 'V-') {
    return 'VEE';
  }
  return null;
}

/** Normalize AI/template stubs so power names use global flag for round-trips. */
export function normalizePowerLabelFlags(doc: SchematicDocument): number {
  if (doc.netLabels === undefined) {
    return 0;
  }
  let n = 0;
  for (let i = 0; i < doc.netLabels.length; i++) {
    const label = doc.netLabels[i];
    const canon = canonicalizeRailLabelText(label.text);
    if (canon !== null) {
      if (label.text !== canon) {
        label.text = canon;
        n++;
      }
      if (!label.global) {
        label.global = true;
        n++;
      }
    }
  }
  return n;
}

/**
 * Nearest wire net for a label. Prefer endpoints (especially short stubs);
 * mid-segment only within copper-touch tol so adjacent parallel stubs
 * (e.g. V+/COM) do not steal.
 */
function findNearestWireNetId(doc: SchematicDocument, pos: Point2D, touchTol: number): string | null {
  let bestId: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const endTol2 = touchTol * touchTol;
  const segPerpTol = touchTol;
  const stubLenMax = Math.max(touchTol * 8, 80);

  for (let wi = 0; wi < doc.wires.length; wi++) {
    const wire = doc.wires[wi];
    if (wire.points.length < 2 || wire.netId.length === 0) {
      continue;
    }
    const p0 = wire.points[0];
    const p1 = wire.points[wire.points.length - 1];
    const d0 = dist2(pos, p0);
    const d1 = dist2(pos, p1);
    const dEnd = Math.min(d0, d1);
    if (dEnd <= endTol2) {
      const pathLen = wirePathLength(wire.points);
      // Prefer short stubs over long routes when both endpoints are in range
      const score = Math.sqrt(dEnd) + (pathLen <= stubLenMax ? 0 : touchTol * 0.5);
      if (score < bestScore) {
        bestScore = score;
        bestId = wire.netId;
      }
    }
    for (let si = 0; si < wire.points.length - 1; si++) {
      const a = wire.points[si];
      const b = wire.points[si + 1];
      const perp = perpDistToSegment(pos, a, b, touchTol);
      if (perp < 0 || perp > segPerpTol) {
        continue;
      }
      // Mid-segment hits are secondary to endpoint/stub matches
      const score = perp + touchTol;
      if (score < bestScore) {
        bestScore = score;
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
  const canon = canonicalizeRailLabelText(text);
  const name = canon !== null ? canon : text;
  let net = doc.nets.find(n => n.name === name ||
    (canon !== null && n.name.toUpperCase() === name.toUpperCase()));
  if (net !== undefined) {
    if (canon !== null && net.name !== canon) {
      net.name = canon;
    }
    return net;
  }
  let netType = NetType.SIGNAL;
  if (canon === 'VCC' || canon === 'VEE') {
    netType = NetType.POWER;
  } else if (canon === 'GND') {
    netType = NetType.GROUND;
  }
  net = {
    id: IdUtil.generate('net'),
    name: name,
    type: netType,
    pinIds: []
  };
  doc.nets.push(net);
  return net;
}

/** Full net merge: wires + labels + pinIds + drop from-net. */
export function mergeNetInto(doc: SchematicDocument, fromId: string, toId: string): void {
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
  if (doc.netLabels !== undefined) {
    for (let li = 0; li < doc.netLabels.length; li++) {
      if (doc.netLabels[li].netId === fromId) {
        doc.netLabels[li].netId = toId;
      }
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
 * After geometric topology rebuild: bind labels to copper (half-grid touch),
 * then union all nets that share the same exclusive label text (case-sensitive).
 * Geo-nets claimed by conflicting label texts are left unmerged.
 */
export function applyNetLabelConnectivity(doc: SchematicDocument, gridSize: number = 10): number {
  if (doc.netLabels === undefined || doc.netLabels.length === 0) {
    return 0;
  }
  normalizePowerLabelFlags(doc);
  // 先吸附到铜皮端点，再半格触铜绑定（兼容 AI stub 浮点/过松放置）
  snapLabelsOntoCopper(doc, gridSize);
  const touchTol = labelCopperTouchTol(gridSize);
  let mergeCount = 0;

  for (let li = 0; li < doc.netLabels.length; li++) {
    const label = doc.netLabels[li];
    if (isAutoNetLabelText(label.text)) {
      continue;
    }
    const hit = findNearestWireNetId(doc, label.position, touchTol);
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
    // 多文案冲突：不静默选字典序赢家并网；仅单文案网参与同名合并
    if (texts.size !== 1) {
      return;
    }
    let only = '';
    texts.forEach((t: string) => { only = t; });
    if (only.length === 0) {
      return;
    }
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
        const nid = doc.netLabels[li].netId;
        const claim = textsOnNet.get(nid);
        if (nid === canonical.id || (claim !== undefined && claim.size === 1 && claim.has(text))) {
          doc.netLabels[li].netId = canonical.id;
        }
      }
    }
    canonical.name = text;
    if (isPowerSupplyLabelText(text)) {
      canonical.type = NetType.POWER;
    } else if (isGroundLabelText(text)) {
      canonical.type = NetType.GROUND;
    }
  });

  return mergeCount;
}
