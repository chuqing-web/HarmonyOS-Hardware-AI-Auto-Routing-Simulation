/**
 * 走线推挤（方案 2）：拖动后对同层异网冲突段做局部 L 重布绕开
 */
import { Point2D } from '../types/CommonTypes';
import { PcbDocument, PcbTrack, PcbLayerId } from '../types/PcbTypes';
import { IdUtil } from './IdUtil';
import { routeLPoints } from './PcbNetUtil';
import { pathClearOfTracks, clearanceForNet } from './pcb_route/PcbClearanceOracle';
import { lockTrackEndpointsToPads } from './PcbTrackBindUtil';
import { tracePcb } from './PcbTraceLog';

const MAX_FOREIGN_REROUTE = 4;

function pointDist(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function distPointSeg(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) {
    return pointDist(p, a);
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  if (t < 0) {
    t = 0;
  } else if (t > 1) {
    t = 1;
  }
  return pointDist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

function segClearance(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): number {
  return Math.min(
    distPointSeg(a1, b1, b2),
    distPointSeg(a2, b1, b2),
    distPointSeg(b1, a1, a2),
    distPointSeg(b2, a1, a2)
  );
}

function tracksClearanceConflict(a: PcbTrack, b: PcbTrack, doc: PcbDocument): boolean {
  if (a.layer !== b.layer) {
    return false;
  }
  if (a.netId.length > 0 && a.netId === b.netId) {
    return false;
  }
  const need = Math.max(clearanceForNet(doc, a.netId), clearanceForNet(doc, b.netId))
    + a.width / 2 + b.width / 2;
  return segClearance(a.start, a.end, b.start, b.end) < need;
}

function addTrack(doc: PcbDocument, layer: PcbLayerId, a: Point2D, b: Point2D,
  netId: string, netName: string, width: number): PcbTrack | null {
  if (pointDist(a, b) < 0.5) {
    return null;
  }
  const track: PcbTrack = {
    id: IdUtil.generate('trk'),
    layer,
    start: { x: a.x, y: a.y },
    end: { x: b.x, y: b.y },
    width,
    netId,
    netName
  };
  doc.tracks.push(track);
  return track;
}

/** 两端均在焊盘上的选中段：改成 U 折，中间段可继续拖，焊盘不断开。返回已 dogleg 的 trackId */
export function doglegPadToPadSelectedTracks(
  doc: PcbDocument,
  trackIds: Set<string>,
  padLockedEnds: Set<string>,
  dx: number,
  dy: number
): Set<string> {
  const doglegged: Set<string> = new Set();
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
    return doglegged;
  }
  let created = 0;
  const toDogleg: PcbTrack[] = [];
  for (const trk of doc.tracks) {
    if (!trackIds.has(trk.id)) {
      continue;
    }
    const sLock = padLockedEnds.has(`${trk.id}|S`);
    const eLock = padLockedEnds.has(`${trk.id}|E`);
    if (sLock && eLock) {
      toDogleg.push(trk);
    }
  }
  for (const trk of toDogleg) {
    const a: Point2D = { x: trk.start.x, y: trk.start.y };
    const b: Point2D = { x: trk.end.x, y: trk.end.y };
    const a2: Point2D = { x: a.x + dx, y: a.y + dy };
    const b2: Point2D = { x: b.x + dx, y: b.y + dy };
    trk.start.x = a2.x;
    trk.start.y = a2.y;
    trk.end.x = b2.x;
    trk.end.y = b2.y;
    doglegged.add(trk.id);
    if (addTrack(doc, trk.layer, a, a2, trk.netId, trk.netName, trk.width)) {
      created++;
    }
    if (addTrack(doc, trk.layer, b2, b, trk.netId, trk.netName, trk.width)) {
      created++;
    }
  }
  if (created > 0) {
    tracePcb('TRACK_SHOVE_DOGLEG', `padToPad=${toDogleg.length} stubs=${created}`);
  }
  return doglegged;
}

function lCandidates(a: Point2D, b: Point2D): Point2D[][] {
  const out: Point2D[][] = [];
  if (pointDist(a, b) < 0.5) {
    return out;
  }
  const midH: Point2D = { x: b.x, y: a.y };
  out.push([a, midH, b]);
  const midV: Point2D = { x: a.x, y: b.y };
  if (pointDist(midH, midV) > 0.5) {
    out.push([a, midV, b]);
  }
  const def = routeLPoints(a, b);
  if (def.length >= 2) {
    out.push(def);
  }
  return out;
}

function pathOk(doc: PcbDocument, layer: PcbLayerId, pts: Point2D[],
  netId: string, width: number, existing: PcbTrack[]): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    if (!pathClearOfTracks(doc, layer, pts[i], pts[i + 1], netId, width, existing)) {
      return false;
    }
  }
  return true;
}

function replaceTrackWithPolyline(doc: PcbDocument, old: PcbTrack, pts: Point2D[]): number {
  const idx = doc.tracks.findIndex((t: PcbTrack) => t.id === old.id);
  if (idx < 0) {
    return 0;
  }
  doc.tracks.splice(idx, 1);
  let n = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    if (addTrack(doc, old.layer, pts[i], pts[i + 1], old.netId, old.netName, old.width)) {
      n++;
    }
  }
  return n;
}

/**
 * 拖动选中走线后：对与之冲突的同层异网段做局部 L 重布。
 */
export function shoveForeignTracksByLReroute(
  doc: PcbDocument,
  movedTrackIds: Set<string>
): number {
  if (movedTrackIds.size === 0) {
    return 0;
  }

  const moved: PcbTrack[] = [];
  for (const trk of doc.tracks) {
    if (movedTrackIds.has(trk.id)) {
      moved.push(trk);
    }
  }
  if (moved.length === 0) {
    return 0;
  }

  const colliding: PcbTrack[] = [];
  for (const fr of doc.tracks) {
    if (movedTrackIds.has(fr.id)) {
      continue;
    }
    let hit = false;
    for (const mv of moved) {
      if (tracksClearanceConflict(fr, mv, doc)) {
        hit = true;
        break;
      }
    }
    if (hit) {
      colliding.push(fr);
    }
  }

  const seenNet: Set<string> = new Set();
  const ordered: PcbTrack[] = [];
  for (const fr of colliding) {
    if (fr.netId.length > 0 && seenNet.has(fr.netId)) {
      continue;
    }
    if (fr.netId.length > 0) {
      seenNet.add(fr.netId);
    }
    ordered.push(fr);
    if (ordered.length >= MAX_FOREIGN_REROUTE) {
      break;
    }
  }
  if (ordered.length < MAX_FOREIGN_REROUTE) {
    for (const fr of colliding) {
      let already = false;
      for (const o of ordered) {
        if (o.id === fr.id) {
          already = true;
          break;
        }
      }
      if (already) {
        continue;
      }
      ordered.push(fr);
      if (ordered.length >= MAX_FOREIGN_REROUTE) {
        break;
      }
    }
  }

  let rerouted = 0;
  for (const fr of ordered) {
    const candidates = lCandidates(fr.start, fr.end);
    const obstacles: PcbTrack[] = [];
    for (const t of doc.tracks) {
      if (t.id !== fr.id) {
        obstacles.push(t);
      }
    }
    let chosen: Point2D[] | null = null;
    for (const pts of candidates) {
      if (pts.length < 2) {
        continue;
      }
      if (pathOk(doc, fr.layer, pts, fr.netId, fr.width, obstacles)) {
        chosen = pts;
        break;
      }
    }
    if (chosen === null) {
      continue;
    }
    if (chosen.length === 2
      && pointDist(chosen[0], fr.start) < 0.5
      && pointDist(chosen[1], fr.end) < 0.5) {
      continue;
    }
    const n = replaceTrackWithPolyline(doc, fr, chosen);
    if (n > 0) {
      rerouted++;
    }
  }

  if (rerouted > 0 || colliding.length > 0) {
    tracePcb('TRACK_SHOVE_L',
      `moved=${movedTrackIds.size} collide=${colliding.length} rerouted=${rerouted}`);
  }
  return rerouted;
}
