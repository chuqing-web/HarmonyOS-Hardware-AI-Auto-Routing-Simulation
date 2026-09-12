/**
 * 45° 拐角后处理：同网同层相邻正交段的 90° 折点做倒角（短 45° 斜切）。
 */
import { PcbDocument, PcbTrack } from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';
import { IdUtil } from '../IdUtil';
import { pathClearBlockReason } from './PcbClearanceOracle';
import { tracePcb } from '../PcbTraceLog';

function almostEq(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.5;
}

function isOrtho(a: Point2D, b: Point2D): boolean {
  return almostEq(a.x, b.x) || almostEq(a.y, b.y);
}

function samePt(a: Point2D, b: Point2D): boolean {
  return almostEq(a.x, b.x) && almostEq(a.y, b.y);
}

function segLen(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * 扫描同网同层首尾相接的 H-V 拐角，切掉直角换成 45° 斜段。
 */
export function chamferOrthoCorners(doc: PcbDocument, maxPasses: number = 2): number {
  let count = 0;
  for (let pass = 0; pass < maxPasses; pass++) {
    let hits = 0;
    const tracks = doc.tracks;
    for (let i = 0; i < tracks.length; i++) {
      const t1 = tracks[i];
      if (t1.netId.length === 0 || !isOrtho(t1.start, t1.end)) {
        continue;
      }
      for (let j = 0; j < tracks.length; j++) {
        if (i === j) {
          continue;
        }
        const t2 = tracks[j];
        if (t2.netId !== t1.netId || t2.layer !== t1.layer || !isOrtho(t2.start, t2.end)) {
          continue;
        }
        let joint: Point2D | null = null;
        let a: Point2D | null = null;
        let c: Point2D | null = null;
        if (samePt(t1.end, t2.start)) {
          joint = t1.end;
          a = t1.start;
          c = t2.end;
        } else if (samePt(t1.end, t2.end)) {
          joint = t1.end;
          a = t1.start;
          c = t2.start;
        } else if (samePt(t1.start, t2.start)) {
          joint = t1.start;
          a = t1.end;
          c = t2.end;
        } else if (samePt(t1.start, t2.end)) {
          joint = t1.start;
          a = t1.end;
          c = t2.start;
        }
        if (joint === null || a === null || c === null) {
          continue;
        }
        const h1 = almostEq(a.y, joint.y);
        const h2 = almostEq(joint.y, c.y);
        if (h1 === h2) {
          continue; // 非拐角
        }
        const L1 = segLen(a, joint);
        const L2 = segLen(joint, c);
        const cut = Math.min(L1, L2, Math.max(t1.width * 2, 8)) * 0.45;
        if (cut < 3 || L1 < cut * 2 || L2 < cut * 2) {
          continue;
        }
        // 沿边回退 cut 得到倒角端点
        const ux1 = (joint.x - a.x) / L1;
        const uy1 = (joint.y - a.y) / L1;
        const ux2 = (c.x - joint.x) / L2;
        const uy2 = (c.y - joint.y) / L2;
        const p1: Point2D = { x: joint.x - ux1 * cut, y: joint.y - uy1 * cut };
        const p2: Point2D = { x: joint.x + ux2 * cut, y: joint.y + uy2 * cut };
        const existing: PcbTrack[] = [];
        for (let k = 0; k < doc.tracks.length; k++) {
          if (doc.tracks[k].id !== t1.id && doc.tracks[k].id !== t2.id) {
            existing.push(doc.tracks[k]);
          }
        }
        if (pathClearBlockReason(doc, t1.layer, p1, p2, t1.netId, t1.width, existing, doc.vias) !== null) {
          continue;
        }
        if (pathClearBlockReason(doc, t1.layer, a, p1, t1.netId, t1.width, existing, doc.vias) !== null) {
          continue;
        }
        if (pathClearBlockReason(doc, t1.layer, p2, c, t1.netId, t1.width, existing, doc.vias) !== null) {
          continue;
        }
        // 替换 t1/t2 → a-p1, p1-p2(45°), p2-c
        const next: PcbTrack[] = [];
        for (let k = 0; k < doc.tracks.length; k++) {
          if (doc.tracks[k].id === t1.id || doc.tracks[k].id === t2.id) {
            continue;
          }
          next.push(doc.tracks[k]);
        }
        const mk = (s: Point2D, e: Point2D): void => {
          if (segLen(s, e) < 0.5) {
            return;
          }
          next.push({
            id: IdUtil.generate('trk'),
            layer: t1.layer,
            start: { x: s.x, y: s.y },
            end: { x: e.x, y: e.y },
            width: t1.width,
            netId: t1.netId,
            netName: t1.netName
          });
        };
        mk(a, p1);
        mk(p1, p2);
        mk(p2, c);
        doc.tracks = next;
        hits++;
        count++;
        i = tracks.length;
        break;
      }
    }
    if (hits === 0) {
      break;
    }
  }
  if (count > 0) {
    tracePcb('CHAMFER45', `corners=${count}`);
  }
  return count;
}

/** 删除疑似残桩短段（一端无同网连接） */
export function pruneStubTracks(doc: PcbDocument, maxLen: number = 20): number {
  let removed = 0;
  const keep: PcbTrack[] = [];
  for (let i = 0; i < doc.tracks.length; i++) {
    const t = doc.tracks[i];
    const len = segLen(t.start, t.end);
    if (t.netId.length === 0 || len > maxLen || len < 0.5) {
      keep.push(t);
      continue;
    }
    let touchS = 0;
    let touchE = 0;
    for (let j = 0; j < doc.tracks.length; j++) {
      if (j === i || doc.tracks[j].netId !== t.netId) {
        continue;
      }
      const o = doc.tracks[j];
      if (samePt(o.start, t.start) || samePt(o.end, t.start)) {
        touchS++;
      }
      if (samePt(o.start, t.end) || samePt(o.end, t.end)) {
        touchE++;
      }
    }
    for (let j = 0; j < doc.vias.length; j++) {
      const v = doc.vias[j];
      if (v.netId !== t.netId) {
        continue;
      }
      if (Math.hypot(v.position.x - t.start.x, v.position.y - t.start.y) < v.diameter) {
        touchS++;
      }
      if (Math.hypot(v.position.x - t.end.x, v.position.y - t.end.y) < v.diameter) {
        touchE++;
      }
    }
    // 仅一端有铜 → 残桩
    if ((touchS === 0 && touchE > 0) || (touchE === 0 && touchS > 0)) {
      removed++;
      continue;
    }
    keep.push(t);
  }
  if (removed > 0) {
    doc.tracks = keep;
    tracePcb('STUB_PRUNE', `removed=${removed}`);
  }
  return removed;
}
