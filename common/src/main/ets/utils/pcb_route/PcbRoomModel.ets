/**
 * 惰性 Room 模型：从起点膨胀自由 AABB，门口通向下一房间直至终点。
 * 对齐路线图阶段四「Room Model」轻量实现。
 */
import { PcbDocument, PcbLayerId, PcbTrack, PcbVia } from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';
import { pathClearBlockReason, clearanceForNet } from './PcbClearanceOracle';
import { padWorldPosition } from '../PcbZoneUtil';
import { tracePcb, tracePcbWarn } from '../PcbTraceLog';

export interface RouteRoom {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layer: PcbLayerId;
  /** 通向下一房间的门口（在边界上） */
  doorOut: Point2D | null;
}

function pointClear(
  doc: PcbDocument,
  layer: PcbLayerId,
  p: Point2D,
  netId: string,
  width: number
): boolean {
  const eps = Math.max(width * 0.5, 2);
  const q: Point2D = { x: p.x + eps, y: p.y };
  return pathClearBlockReason(doc, layer, p, q, netId, width, doc.tracks, doc.vias) === null;
}

function segClear(
  doc: PcbDocument,
  layer: PcbLayerId,
  a: Point2D,
  b: Point2D,
  netId: string,
  width: number
): boolean {
  return pathClearBlockReason(doc, layer, a, b, netId, width, doc.tracks, doc.vias) === null;
}

interface RoomBlocker {
  x: number;
  y: number;
  r: number;
}

/** 障碍近似：收集附近圆/盒，用于限制房间膨胀 */
function nearbyBlockers(
  doc: PcbDocument,
  layer: PcbLayerId,
  center: Point2D,
  netId: string,
  radius: number
): RoomBlocker[] {
  const out: RoomBlocker[] = [];
  const clr = clearanceForNet(doc, netId);
  for (let fi = 0; fi < doc.footprints.length; fi++) {
    const fp = doc.footprints[fi];
    for (let pi = 0; pi < fp.pads.length; pi++) {
      const pad = fp.pads[pi];
      if ((pad.netId ?? '') === netId) {
        continue;
      }
      const wp = padWorldPosition(fp, pad);
      if (Math.hypot(wp.x - center.x, wp.y - center.y) > radius) {
        continue;
      }
      const blk: RoomBlocker = {
        x: wp.x,
        y: wp.y,
        r: Math.max(pad.size.x, pad.size.y) * 0.5 + clr
      };
      out.push(blk);
    }
  }
  for (let i = 0; i < doc.vias.length; i++) {
    const v: PcbVia = doc.vias[i];
    if (v.netId === netId) {
      continue;
    }
    if (Math.hypot(v.position.x - center.x, v.position.y - center.y) > radius) {
      continue;
    }
    const blkV: RoomBlocker = {
      x: v.position.x,
      y: v.position.y,
      r: v.diameter * 0.5 + clr
    };
    out.push(blkV);
  }
  for (let i = 0; i < doc.tracks.length; i++) {
    const t: PcbTrack = doc.tracks[i];
    if (t.layer !== layer || t.netId === netId) {
      continue;
    }
    const mx = (t.start.x + t.end.x) * 0.5;
    const my = (t.start.y + t.end.y) * 0.5;
    if (Math.hypot(mx - center.x, my - center.y) > radius) {
      continue;
    }
    const blkT: RoomBlocker = { x: mx, y: my, r: t.width * 0.5 + clr + 4 };
    out.push(blkT);
  }
  return out;
}

function roomContains(room: RouteRoom, p: Point2D, margin: number = 0): boolean {
  return p.x >= room.x1 - margin && p.x <= room.x2 + margin &&
    p.y >= room.y1 - margin && p.y <= room.y2 + margin;
}

/**
 * 从 seed 向四向膨胀自由矩形（步长探测），直到碰到障碍或达到 maxSpan。
 */
export function expandRoomFromSeed(
  doc: PcbDocument,
  layer: PcbLayerId,
  seed: Point2D,
  netId: string,
  width: number,
  maxSpan: number = 400
): RouteRoom {
  const step = Math.max(width, 8);
  const blockers = nearbyBlockers(doc, layer, seed, netId, maxSpan + 80);

  const hits = (x: number, y: number): boolean => {
    for (let i = 0; i < blockers.length; i++) {
      const b = blockers[i];
      if (Math.hypot(x - b.x, y - b.y) < b.r + width * 0.5) {
        return true;
      }
    }
    // 精细：短段探测
    return !pointClear(doc, layer, { x, y }, netId, width);
  };

  let x1 = seed.x;
  let x2 = seed.x;
  let y1 = seed.y;
  let y2 = seed.y;

  // 左
  for (let s = step; s <= maxSpan; s += step) {
    if (hits(seed.x - s, seed.y)) {
      break;
    }
    x1 = seed.x - s;
  }
  for (let s = step; s <= maxSpan; s += step) {
    if (hits(seed.x + s, seed.y)) {
      break;
    }
    x2 = seed.x + s;
  }
  for (let s = step; s <= maxSpan; s += step) {
    if (hits(seed.x, seed.y - s)) {
      break;
    }
    y1 = seed.y - s;
  }
  for (let s = step; s <= maxSpan; s += step) {
    if (hits(seed.x, seed.y + s)) {
      break;
    }
    y2 = seed.y + s;
  }

  // 角点收缩：四角也需净空
  const shrink = step;
  if (hits(x1, y1) || hits(x1, y2) || hits(x2, y1) || hits(x2, y2)) {
    x1 = Math.min(x1 + shrink, seed.x);
    x2 = Math.max(x2 - shrink, seed.x);
    y1 = Math.min(y1 + shrink, seed.y);
    y2 = Math.max(y2 - shrink, seed.y);
  }

  return { x1, y1, x2, y2, layer, doorOut: null };
}

function doorToward(room: RouteRoom, target: Point2D): Point2D {
  const cx = (room.x1 + room.x2) * 0.5;
  const cy = (room.y1 + room.y2) * 0.5;
  const dx = target.x - cx;
  const dy = target.y - cy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    // 左右门
    const x = dx >= 0 ? room.x2 : room.x1;
    const y = Math.max(room.y1, Math.min(room.y2, target.y));
    return { x, y };
  }
  const y = dy >= 0 ? room.y2 : room.y1;
  const x = Math.max(room.x1, Math.min(room.x2, target.x));
  return { x, y };
}

function lInside(a: Point2D, b: Point2D, preferH: boolean): Point2D[] {
  if (Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5) {
    return [a, b];
  }
  if (preferH) {
    return [a, { x: b.x, y: a.y }, b];
  }
  return [a, { x: a.x, y: b.y }, b];
}

/**
 * Room 走廊寻路：惰性展开房间链，盒内 L 连接。
 */
export function routeRoomModel(
  doc: PcbDocument,
  layer: PcbLayerId,
  from: Point2D,
  to: Point2D,
  netId: string,
  width: number,
  maxRooms: number = 12,
  budgetMs: number = 0
): Point2D[] {
  if (Math.hypot(from.x - to.x, from.y - to.y) < 0.5) {
    return [];
  }
  if (segClear(doc, layer, from, to, netId, width)) {
    return [{ x: from.x, y: from.y }, { x: to.x, y: to.y }];
  }

  const t0 = Date.now();
  const parts: Point2D[][] = [];
  let cursor: Point2D = { x: from.x, y: from.y };
  let rooms = 0;

  while (rooms < maxRooms) {
    if (budgetMs > 0 && (Date.now() - t0) > budgetMs) {
      tracePcbWarn('ROOM_FAIL', `${netId} budget=${budgetMs}ms rooms=${rooms}`);
      return [];
    }
    rooms++;
    const expandCap = budgetMs > 0 && budgetMs <= 120 ? 180 : 360;
    const room = expandRoomFromSeed(doc, layer, cursor, netId, width, expandCap);
    if (roomContains(room, to, width)) {
      const preferH = Math.abs(to.x - cursor.x) >= Math.abs(to.y - cursor.y);
      let path = lInside(cursor, to, preferH);
      if (!segClear(doc, layer, path[0], path[1], netId, width) ||
        (path.length > 2 && !segClear(doc, layer, path[1], path[2], netId, width))) {
        path = lInside(cursor, to, !preferH);
      }
      if (path.length >= 2 &&
        segClear(doc, layer, path[0], path[1], netId, width) &&
        (path.length < 3 || segClear(doc, layer, path[1], path[2], netId, width))) {
        parts.push(path);
        break;
      }
      // 房间含终点但 L 不通：直连试一次
      if (segClear(doc, layer, cursor, to, netId, width)) {
        parts.push([cursor, to]);
        break;
      }
      tracePcbWarn('ROOM_FAIL', `${netId} inside-room blocked rooms=${rooms}`);
      return [];
    }

    const door = doorToward(room, to);
    room.doorOut = door;
    // 门口外推一小步进入下一房间种子
    const cx = (room.x1 + room.x2) * 0.5;
    const cy = (room.y1 + room.y2) * 0.5;
    const ox = door.x - cx;
    const oy = door.y - cy;
    const len = Math.hypot(ox, oy) || 1;
    const push = Math.max(width, 10);
    const nextSeed: Point2D = {
      x: door.x + (ox / len) * push,
      y: door.y + (oy / len) * push
    };

    const preferH = Math.abs(door.x - cursor.x) >= Math.abs(door.y - cursor.y);
    let hop = lInside(cursor, door, preferH);
    if (!(segClear(doc, layer, hop[0], hop[1], netId, width) &&
      (hop.length < 3 || segClear(doc, layer, hop[1], hop[2], netId, width)))) {
      hop = lInside(cursor, door, !preferH);
    }
    if (!(segClear(doc, layer, hop[0], hop[1], netId, width) &&
      (hop.length < 3 || segClear(doc, layer, hop[1], hop[2], netId, width)))) {
      // 门直连
      if (!segClear(doc, layer, cursor, door, netId, width)) {
        tracePcbWarn('ROOM_FAIL', `${netId} door blocked rooms=${rooms}`);
        return [];
      }
      hop = [cursor, door];
    }
    parts.push(hop);
    cursor = nextSeed;
    // 防止原地打转
    if (Math.hypot(cursor.x - from.x, cursor.y - from.y) < 1 && rooms > 2) {
      break;
    }
  }

  // 拼接
  const out: Point2D[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    for (let j = 0; j < p.length; j++) {
      if (out.length === 0) {
        out.push(p[j]);
        continue;
      }
      const last = out[out.length - 1];
      if (Math.abs(last.x - p[j].x) < 0.5 && Math.abs(last.y - p[j].y) < 0.5) {
        continue;
      }
      out.push(p[j]);
    }
  }
  // 确保落到 to
  if (out.length >= 1) {
    const last = out[out.length - 1];
    if (Math.abs(last.x - to.x) >= 0.5 || Math.abs(last.y - to.y) >= 0.5) {
      if (segClear(doc, layer, last, to, netId, width)) {
        out.push({ x: to.x, y: to.y });
      } else {
        tracePcbWarn('ROOM_FAIL', `${netId} final hop rooms=${rooms}`);
        return [];
      }
    }
  }
  if (out.length < 2) {
    return [];
  }
  tracePcb('ROOM_OK', `${netId} rooms=${rooms} pts=${out.length}`);
  return out;
}
