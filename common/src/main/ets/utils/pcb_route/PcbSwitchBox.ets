/**
 * Switch-Box 详细布线：沿全局指南把走廊切成盒子，盒内迷宫/ L 拼接。
 * 对齐路线图阶段二「详细布线 Switch Box」轻量实现。
 */
import { PcbDocument, PcbLayerId } from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';
import { mazeRouteRectilinear, MazeLayerPair } from './PcbMazeRouter';
import { GlobalNetGuide } from './PcbGlobalChannel';
import { pathClearBlockReason } from './PcbClearanceOracle';
import { tracePcb } from '../PcbTraceLog';

export interface SwitchBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  entry: Point2D;
  exit: Point2D;
}

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 沿指南 waypoints 切盒：相邻折点 + 边距 */
export function buildSwitchBoxes(
  from: Point2D,
  to: Point2D,
  guide: GlobalNetGuide | null,
  boxPad: number
): SwitchBox[] {
  const pts: Point2D[] = [{ x: from.x, y: from.y }];
  if (guide !== null && guide.waypoints.length >= 2) {
    for (let i = 0; i < guide.waypoints.length; i++) {
      const w = guide.waypoints[i];
      const last = pts[pts.length - 1];
      if (dist(last, w) > 1) {
        pts.push({ x: w.x, y: w.y });
      }
    }
  }
  const last = pts[pts.length - 1];
  if (dist(last, to) > 1) {
    pts.push({ x: to.x, y: to.y });
  } else {
    pts[pts.length - 1] = { x: to.x, y: to.y };
  }

  // 合并过近点
  const compact: Point2D[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (dist(compact[compact.length - 1], pts[i]) >= Math.max(boxPad * 0.5, 8)) {
      compact.push(pts[i]);
    } else {
      compact[compact.length - 1] = pts[i];
    }
  }
  if (compact.length < 2) {
    return [{
      x1: Math.min(from.x, to.x) - boxPad,
      y1: Math.min(from.y, to.y) - boxPad,
      x2: Math.max(from.x, to.x) + boxPad,
      y2: Math.max(from.y, to.y) + boxPad,
      entry: from,
      exit: to
    }];
  }

  const boxes: SwitchBox[] = [];
  for (let i = 0; i < compact.length - 1; i++) {
    const a = compact[i];
    const b = compact[i + 1];
    boxes.push({
      x1: Math.min(a.x, b.x) - boxPad,
      y1: Math.min(a.y, b.y) - boxPad,
      x2: Math.max(a.x, b.x) + boxPad,
      y2: Math.max(a.y, b.y) + boxPad,
      entry: a,
      exit: b
    });
  }
  return boxes;
}

function lInBox(a: Point2D, b: Point2D, preferH: boolean): Point2D[] {
  if (Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5) {
    return [a, b];
  }
  if (preferH) {
    return [a, { x: b.x, y: a.y }, b];
  }
  return [a, { x: a.x, y: b.y }, b];
}

function pathClear(
  doc: PcbDocument,
  pair: MazeLayerPair,
  pts: Point2D[],
  netId: string,
  width: number
): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    if (dist(pts[i], pts[i + 1]) < 0.5) {
      continue;
    }
    const horiz = Math.abs(pts[i].y - pts[i + 1].y) < 0.5;
    const ly: PcbLayerId = horiz ? pair.h : pair.v;
    if (pathClearBlockReason(doc, ly, pts[i], pts[i + 1], netId, width,
      doc.tracks, doc.vias) !== null) {
      return false;
    }
  }
  return true;
}

function stitch(parts: Point2D[][]): Point2D[] {
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
  return out;
}

/**
 * 沿 Switch-Box 走廊详细布线：盒内先 L，失败则紧窗迷宫。
 */
export function routeSwitchBoxCorridor(
  doc: PcbDocument,
  pair: MazeLayerPair,
  from: Point2D,
  to: Point2D,
  netId: string,
  width: number,
  grid: number,
  guide: GlobalNetGuide | null,
  preferHFirst: boolean
): Point2D[] {
  const pad = Math.max(grid * 4, width * 6, 40);
  const boxes = buildSwitchBoxes(from, to, guide, pad);
  if (boxes.length === 0) {
    return [];
  }

  const parts: Point2D[][] = [];
  let cursor: Point2D = { x: from.x, y: from.y };

  for (let bi = 0; bi < boxes.length; bi++) {
    const box = boxes[bi];
    const target = bi === boxes.length - 1 ? to : box.exit;
    // 入口接到 cursor
    const start: Point2D = cursor;

    let seg: Point2D[] = [];
    const l1 = lInBox(start, target, preferHFirst);
    if (pathClear(doc, pair, l1, netId, width)) {
      seg = l1;
    } else {
      const l2 = lInBox(start, target, !preferHFirst);
      if (pathClear(doc, pair, l2, netId, width)) {
        seg = l2;
      }
    }

    if (seg.length < 2) {
      // 紧窗迷宫：用较小 pad 限制搜索（maze 内部仍自算窗，但段短）
      const mazePadScale = 0.55;
      const path = mazeRouteRectilinear(doc, pair, start, target, netId, width, grid, 1);
      if (path.length >= 2) {
        // 过滤明显飞出盒子的路径：若中点远离盒则放弃
        let midOk = true;
        for (let k = 0; k < path.length; k++) {
          const p = path[k];
          const expand = pad * mazePadScale;
          if (p.x < box.x1 - expand || p.x > box.x2 + expand ||
            p.y < box.y1 - expand || p.y > box.y2 + expand) {
            midOk = false;
            break;
          }
        }
        if (midOk) {
          seg = path;
        }
      }
    }

    if (seg.length < 2) {
      tracePcb('SBOX_FAIL', `net=${netId} box=${bi}/${boxes.length}`);
      return [];
    }
    parts.push(seg);
    cursor = seg[seg.length - 1];
  }

  const full = stitch(parts);
  if (full.length >= 2 && pathClear(doc, pair, full, netId, width)) {
    tracePcb('SBOX_OK', `net=${netId} boxes=${boxes.length} pts=${full.length}`);
    return full;
  }
  // 拼接后可能 clearance 因共享端点失败 —— 仍返回供 tryCommit 硬校验
  if (full.length >= 2) {
    tracePcb('SBOX_SOFT', `net=${netId} boxes=${boxes.length} pts=${full.length}`);
    return full;
  }
  return [];
}
