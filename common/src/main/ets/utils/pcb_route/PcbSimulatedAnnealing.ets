/**
 * 模拟退火后优化：捷径 / 折点 / 删过孔邻域，可回滚。
 * 对齐路线图阶段四「模拟退火全局优化」。
 */
import { PcbDocument, PcbTrack, PcbVia } from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';
import { IdUtil } from '../IdUtil';
import { pathClearBlockReason } from './PcbClearanceOracle';
import { tracePcb } from '../PcbTraceLog';

export interface AnnealResult {
  accepted: number;
  lengthBefore: number;
  lengthAfter: number;
  viasRemoved: number;
  improvedPct: number;
}

function cloneTracks(tracks: PcbTrack[]): PcbTrack[] {
  const out: PcbTrack[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    out.push({
      id: t.id,
      layer: t.layer,
      start: { x: t.start.x, y: t.start.y },
      end: { x: t.end.x, y: t.end.y },
      width: t.width,
      netId: t.netId,
      netName: t.netName
    });
  }
  return out;
}

function cloneVias(vias: PcbVia[]): PcbVia[] {
  const out: PcbVia[] = [];
  for (let i = 0; i < vias.length; i++) {
    const v = vias[i];
    out.push({
      id: v.id,
      position: { x: v.position.x, y: v.position.y },
      drill: v.drill,
      diameter: v.diameter,
      netId: v.netId,
      netName: v.netName,
      layers: v.layers.slice(),
      kind: v.kind
    });
  }
  return out;
}

function totalWire(tracks: PcbTrack[]): number {
  let s = 0;
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    s += Math.hypot(t.end.x - t.start.x, t.end.y - t.start.y);
  }
  return s;
}

function energy(doc: PcbDocument): number {
  return totalWire(doc.tracks) + doc.vias.length * 40;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nearVia(p: Point2D, v: Point2D, tol: number = 1.5): boolean {
  return Math.hypot(p.x - v.x, p.y - v.y) < tol;
}

interface ViaHit {
  ti: number;
  atStart: boolean;
}

function tryRemoveVia(doc: PcbDocument, viaIdx: number): boolean {
  if (viaIdx < 0 || viaIdx >= doc.vias.length) {
    return false;
  }
  const via = doc.vias[viaIdx];
  const hits: ViaHit[] = [];
  for (let i = 0; i < doc.tracks.length; i++) {
    const t = doc.tracks[i];
    if (t.netId !== via.netId) {
      continue;
    }
    if (nearVia(t.start, via.position)) {
      const h0: ViaHit = { ti: i, atStart: true };
      hits.push(h0);
    } else if (nearVia(t.end, via.position)) {
      const h1: ViaHit = { ti: i, atStart: false };
      hits.push(h1);
    }
  }
  if (hits.length < 2) {
    return false;
  }
  const h0 = hits[0];
  const h1 = hits[1];
  const t0 = doc.tracks[h0.ti];
  const t1 = doc.tracks[h1.ti];
  const far0 = h0.atStart ? t0.end : t0.start;
  const far1 = h1.atStart ? t1.end : t1.start;
  const others: PcbTrack[] = [];
  for (let k = 0; k < doc.tracks.length; k++) {
    if (k !== h0.ti && k !== h1.ti) {
      others.push(doc.tracks[k]);
    }
  }
  const layer = t0.layer;
  const mid = via.position;
  if (t0.layer === t1.layer) {
    if (pathClearBlockReason(doc, layer, far0, far1, via.netId, t0.width, others, doc.vias) !== null) {
      return false;
    }
    const hi = Math.max(h0.ti, h1.ti);
    const lo = Math.min(h0.ti, h1.ti);
    doc.tracks.splice(hi, 1);
    doc.tracks.splice(lo, 1);
    doc.tracks.push({
      id: IdUtil.generate('trk'),
      layer,
      start: { x: far0.x, y: far0.y },
      end: { x: far1.x, y: far1.y },
      width: t0.width,
      netId: via.netId,
      netName: via.netName
    });
    doc.vias.splice(viaIdx, 1);
    return true;
  }
  if (pathClearBlockReason(doc, layer, far0, mid, via.netId, t0.width, others, doc.vias) !== null) {
    return false;
  }
  if (pathClearBlockReason(doc, layer, mid, far1, via.netId, t0.width, others, doc.vias) !== null) {
    return false;
  }
  const hi = Math.max(h0.ti, h1.ti);
  const lo = Math.min(h0.ti, h1.ti);
  doc.tracks.splice(hi, 1);
  doc.tracks.splice(lo, 1);
  doc.tracks.push({
    id: IdUtil.generate('trk'),
    layer,
    start: { x: far0.x, y: far0.y },
    end: { x: mid.x, y: mid.y },
    width: t0.width,
    netId: via.netId,
    netName: via.netName
  });
  doc.tracks.push({
    id: IdUtil.generate('trk'),
    layer,
    start: { x: mid.x, y: mid.y },
    end: { x: far1.x, y: far1.y },
    width: t0.width,
    netId: via.netId,
    netName: via.netName
  });
  doc.vias.splice(viaIdx, 1);
  return true;
}

function tryStraightShortcut(doc: PcbDocument, i: number, j: number): boolean {
  if (i === j || i < 0 || j < 0 || i >= doc.tracks.length || j >= doc.tracks.length) {
    return false;
  }
  const t1 = doc.tracks[i];
  const t2 = doc.tracks[j];
  if (t1.netId !== t2.netId || t1.layer !== t2.layer || t1.netId.length === 0) {
    return false;
  }
  let a: Point2D | null = null;
  let b: Point2D | null = null;
  let jointHit = false;
  if (Math.abs(t1.end.x - t2.start.x) < 0.5 && Math.abs(t1.end.y - t2.start.y) < 0.5) {
    a = t1.start;
    b = t2.end;
    jointHit = true;
  } else if (Math.abs(t1.end.x - t2.end.x) < 0.5 && Math.abs(t1.end.y - t2.end.y) < 0.5) {
    a = t1.start;
    b = t2.start;
    jointHit = true;
  } else if (Math.abs(t1.start.x - t2.start.x) < 0.5 && Math.abs(t1.start.y - t2.start.y) < 0.5) {
    a = t1.end;
    b = t2.end;
    jointHit = true;
  }
  if (!jointHit || a === null || b === null) {
    return false;
  }
  if (Math.hypot(b.x - a.x, b.y - a.y) < 0.5) {
    return false;
  }
  const others: PcbTrack[] = [];
  for (let k = 0; k < doc.tracks.length; k++) {
    if (k !== i && k !== j) {
      others.push(doc.tracks[k]);
    }
  }
  if (pathClearBlockReason(doc, t1.layer, a, b, t1.netId, t1.width, others, doc.vias) !== null) {
    return false;
  }
  const oldLen =
    Math.hypot(t1.end.x - t1.start.x, t1.end.y - t1.start.y) +
    Math.hypot(t2.end.x - t2.start.x, t2.end.y - t2.start.y);
  const newLen = Math.hypot(b.x - a.x, b.y - a.y);
  if (newLen >= oldLen - 0.5) {
    return false;
  }
  const hi = Math.max(i, j);
  const lo = Math.min(i, j);
  doc.tracks.splice(hi, 1);
  doc.tracks.splice(lo, 1);
  doc.tracks.push({
    id: IdUtil.generate('trk'),
    layer: t1.layer,
    start: { x: a.x, y: a.y },
    end: { x: b.x, y: b.y },
    width: t1.width,
    netId: t1.netId,
    netName: t1.netName
  });
  return true;
}

function tryJogReduce(doc: PcbDocument, idx: number): boolean {
  if (idx < 0 || idx >= doc.tracks.length) {
    return false;
  }
  const t = doc.tracks[idx];
  for (let j = 0; j < doc.tracks.length; j++) {
    if (j === idx) {
      continue;
    }
    const t2 = doc.tracks[j];
    if (t2.netId !== t.netId || t2.layer !== t.layer) {
      continue;
    }
    if (Math.abs(t.end.x - t2.start.x) >= 0.5 || Math.abs(t.end.y - t2.start.y) >= 0.5) {
      continue;
    }
    const a = t.start;
    const b = t2.end;
    const midH: Point2D = { x: b.x, y: a.y };
    const midV: Point2D = { x: a.x, y: b.y };
    const others: PcbTrack[] = [];
    for (let k = 0; k < doc.tracks.length; k++) {
      if (k !== idx && k !== j) {
        others.push(doc.tracks[k]);
      }
    }
    const tryMid = (mid: Point2D): boolean => {
      if (pathClearBlockReason(doc, t.layer, a, mid, t.netId, t.width, others, doc.vias) !== null) {
        return false;
      }
      if (pathClearBlockReason(doc, t.layer, mid, b, t.netId, t.width, others, doc.vias) !== null) {
        return false;
      }
      const oldL =
        Math.hypot(t.end.x - t.start.x, t.end.y - t.start.y) +
        Math.hypot(t2.end.x - t2.start.x, t2.end.y - t2.start.y);
      const newL = Math.hypot(mid.x - a.x, mid.y - a.y) + Math.hypot(b.x - mid.x, b.y - mid.y);
      if (newL >= oldL - 0.5) {
        return false;
      }
      const hi = Math.max(idx, j);
      const lo = Math.min(idx, j);
      doc.tracks.splice(hi, 1);
      doc.tracks.splice(lo, 1);
      if (Math.hypot(mid.x - a.x, mid.y - a.y) >= 0.5) {
        doc.tracks.push({
          id: IdUtil.generate('trk'),
          layer: t.layer,
          start: { x: a.x, y: a.y },
          end: { x: mid.x, y: mid.y },
          width: t.width,
          netId: t.netId,
          netName: t.netName
        });
      }
      if (Math.hypot(b.x - mid.x, b.y - mid.y) >= 0.5) {
        doc.tracks.push({
          id: IdUtil.generate('trk'),
          layer: t.layer,
          start: { x: mid.x, y: mid.y },
          end: { x: b.x, y: b.y },
          width: t.width,
          netId: t.netId,
          netName: t.netName
        });
      }
      return true;
    };
    if (tryMid(midH) || tryMid(midV)) {
      return true;
    }
  }
  return false;
}

export function annealRouteOptimize(
  doc: PcbDocument,
  iterations: number = 120,
  seed: number = 42
): AnnealResult {
  const before = totalWire(doc.tracks);
  const viasBefore = doc.vias.length;
  let current = energy(doc);
  let best = current;
  let bestTracks = cloneTracks(doc.tracks);
  let bestVias = cloneVias(doc.vias);
  let accepted = 0;
  let T = 60;
  const alpha = 0.955;
  const rand = mulberry32(seed);

  if ((doc.tracks.length < 2 && doc.vias.length === 0) || iterations <= 0) {
    return {
      accepted: 0,
      lengthBefore: before,
      lengthAfter: before,
      viasRemoved: 0,
      improvedPct: 0
    };
  }

  for (let it = 0; it < iterations; it++) {
    const backupT = cloneTracks(doc.tracks);
    const backupV = cloneVias(doc.vias);
    const eBefore = current;
    let moved = false;
    const roll = rand();
    if (roll < 0.25 && doc.vias.length > 0) {
      moved = tryRemoveVia(doc, Math.floor(rand() * doc.vias.length));
    } else if (roll < 0.65 && doc.tracks.length >= 2) {
      const i = Math.floor(rand() * doc.tracks.length);
      const j = Math.floor(rand() * doc.tracks.length);
      moved = tryStraightShortcut(doc, i, j);
    } else if (doc.tracks.length > 0) {
      moved = tryJogReduce(doc, Math.floor(rand() * doc.tracks.length));
    }
    if (!moved) {
      doc.tracks = backupT;
      doc.vias = backupV;
      if ((it % 10) === 9) {
        T *= alpha;
      }
      continue;
    }
    const eAfter = energy(doc);
    const dE = eAfter - eBefore;
    const accept = dE < 0 || rand() < Math.exp(-dE / Math.max(T, 0.05));
    if (accept) {
      accepted++;
      current = eAfter;
      if (eAfter < best) {
        best = eAfter;
        bestTracks = cloneTracks(doc.tracks);
        bestVias = cloneVias(doc.vias);
      }
    } else {
      doc.tracks = backupT;
      doc.vias = backupV;
      current = eBefore;
    }
    if ((it % 10) === 9) {
      T *= alpha;
    }
  }

  doc.tracks = bestTracks;
  doc.vias = bestVias;
  const after = totalWire(doc.tracks);
  const viasRemoved = Math.max(0, viasBefore - doc.vias.length);
  const improvedPct = before > 0 ? ((before - after) / before) * 100 : 0;
  tracePcb('ANNEAL',
    `iters=${iterations} accepted=${accepted} wire ${before.toFixed(0)}→${after.toFixed(0)} ` +
    `(${improvedPct.toFixed(2)}%) viasRemoved=${viasRemoved}`);
  return {
    accepted,
    lengthBefore: before,
    lengthAfter: after,
    viasRemoved,
    improvedPct
  };
}
