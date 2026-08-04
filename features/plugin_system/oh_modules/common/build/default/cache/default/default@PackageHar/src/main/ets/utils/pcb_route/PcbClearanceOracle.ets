/**
 * 简易 clearance 查询 — 供几何引擎避障（不替代完整 DRC）
 */
import { PcbDocument, PcbLayerId, PcbTrack } from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';
import { findNetClass } from '../PcbNetUtil';

function distPointSeg(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) {
    const ex = p.x - a.x;
    const ey = p.y - a.y;
    return Math.sqrt(ex * ex + ey * ey);
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  if (t < 0) {
    t = 0;
  } else if (t > 1) {
    t = 1;
  }
  const qx = a.x + t * dx;
  const qy = a.y + t * dy;
  const ex = p.x - qx;
  const ey = p.y - qy;
  return Math.sqrt(ex * ex + ey * ey);
}

function segClearance(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): number {
  const d1 = distPointSeg(a1, b1, b2);
  const d2 = distPointSeg(a2, b1, b2);
  const d3 = distPointSeg(b1, a1, a2);
  const d4 = distPointSeg(b2, a1, a2);
  return Math.min(d1, d2, d3, d4);
}

export function clearanceForNet(doc: PcbDocument, netId: string): number {
  const base = doc.metadata.designRules.minClearance;
  if (netId.length === 0) {
    return base;
  }
  for (const n of doc.nets) {
    if (n.id === netId) {
      return findNetClass(doc, n.classId).clearance;
    }
  }
  return base;
}

export function trackWidthForNet(doc: PcbDocument, netId: string): number {
  const base = doc.metadata.designRules.defaultTrackWidth;
  if (netId.length === 0) {
    return base;
  }
  for (const n of doc.nets) {
    if (n.id === netId) {
      return findNetClass(doc, n.classId).trackWidth;
    }
  }
  return base;
}

/** 候选线段与已有异网同层走线是否冲突 */
export function pathClearOfTracks(
  doc: PcbDocument,
  layer: PcbLayerId,
  a: Point2D,
  b: Point2D,
  netId: string,
  width: number,
  existing: PcbTrack[]
): boolean {
  const need = clearanceForNet(doc, netId) + width / 2;
  for (let i = 0; i < existing.length; i++) {
    const t = existing[i];
    if (t.layer !== layer) {
      continue;
    }
    if (t.netId === netId && netId.length > 0) {
      continue;
    }
    const otherHalf = t.width / 2;
    if (segClearance(a, b, t.start, t.end) < need + otherHalf) {
      return false;
    }
  }
  return true;
}
