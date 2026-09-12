/**
 * 全局通道分配：在粗 GCell 上为各网预留 L 形通道，写入拥塞图，
 * 并给出详细布线偏好折点（真·全局阶段的轻量实现，非 shape-based）。
 */
import { Point2D } from '../../types/CommonTypes';
import { GlobalCongestionMap } from './PcbGlobalRoute';
import { PcbLayerId } from '../../types/PcbTypes';

export interface GlobalNetGuide {
  netId: string;
  /** 粗 L：start → elbow → end */
  waypoints: Point2D[];
  preferHFirst: boolean;
  reservedCells: number;
  /** Track Assignment：水平轨道 Y / 垂直轨道 X（可选） */
  assignedTrackY?: number;
  assignedTrackX?: number;
}

export interface GlobalChannelPlan {
  guides: Map<string, GlobalNetGuide>;
  reservedTotal: number;
}

interface GCellCoord {
  c: number;
  r: number;
}

function manhattan(a: Point2D, b: Point2D): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function cellOf(map: GlobalCongestionMap, p: Point2D): GCellCoord {
  const c = Math.floor((p.x - map.originX) / map.cell);
  const r = Math.floor((p.y - map.originY) / map.cell);
  const out: GCellCoord = {
    c: Math.max(0, Math.min(map.cols - 1, c)),
    r: Math.max(0, Math.min(map.rows - 1, r))
  };
  return out;
}

function stampCell(map: GlobalCongestionMap, layer: PcbLayerId, c: number, r: number, w: number): void {
  const g = map.densityByLayer.get(layer);
  if (g === undefined) {
    return;
  }
  if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) {
    return;
  }
  g[r * map.cols + c] += w;
}

function corridorCost(map: GlobalCongestionMap, layer: PcbLayerId, path: Point2D[]): number {
  let cost = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const steps = Math.max(1, Math.ceil(manhattan(a, b) / Math.max(map.cell * 0.5, 1)));
    const g = map.densityByLayer.get(layer);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const p: Point2D = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const cr = cellOf(map, p);
      if (g !== undefined) {
        cost += g[cr.r * map.cols + cr.c];
      }
      cost += 1;
    }
  }
  return cost;
}

function reservePath(map: GlobalCongestionMap, layer: PcbLayerId, path: Point2D[], weight: number): number {
  let cells = 0;
  const seen: Set<number> = new Set();
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const steps = Math.max(1, Math.ceil(manhattan(a, b) / Math.max(map.cell * 0.5, 1)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const p: Point2D = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const cr = cellOf(map, p);
      const key = cr.r * map.cols + cr.c;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      stampCell(map, layer, cr.c, cr.r, weight);
      cells++;
    }
  }
  return cells;
}

export interface GlobalNetSeed {
  netId: string;
  a: Point2D;
  b: Point2D;
  layerH: PcbLayerId;
  layerV: PcbLayerId;
}

/**
 * 按曼哈顿长度升序为各网选代价更低的 H-first / V-first L，预留通道。
 */
export function assignGlobalChannels(
  map: GlobalCongestionMap,
  seeds: GlobalNetSeed[]
): GlobalChannelPlan {
  const ordered = seeds.slice();
  ordered.sort((x: GlobalNetSeed, y: GlobalNetSeed) => manhattan(x.a, x.b) - manhattan(y.a, y.b));
  const guides: Map<string, GlobalNetGuide> = new Map();
  let reservedTotal = 0;

  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i];
    if (manhattan(s.a, s.b) < 1) {
      continue;
    }
    const midH: Point2D = { x: s.b.x, y: s.a.y };
    const midV: Point2D = { x: s.a.x, y: s.b.y };
    const pathH: Point2D[] = [s.a, midH, s.b];
    const pathV: Point2D[] = [s.a, midV, s.b];
    // H 段走 H 层，V 段走 V 层：用混合代价近似
    const costH = corridorCost(map, s.layerH, [s.a, midH]) + corridorCost(map, s.layerV, [midH, s.b]);
    const costV = corridorCost(map, s.layerV, [s.a, midV]) + corridorCost(map, s.layerH, [midV, s.b]);
    const preferH = costH <= costV;
    const path = preferH ? pathH : pathV;
    let cells = 0;
    if (preferH) {
      cells += reservePath(map, s.layerH, [s.a, midH], 1.5);
      cells += reservePath(map, s.layerV, [midH, s.b], 1.5);
    } else {
      cells += reservePath(map, s.layerV, [s.a, midV], 1.5);
      cells += reservePath(map, s.layerH, [midV, s.b], 1.5);
    }
    reservedTotal += cells;
    const guide: GlobalNetGuide = {
      netId: s.netId,
      waypoints: path,
      preferHFirst: preferH,
      reservedCells: cells
    };
    guides.set(s.netId, guide);
  }

  const plan: GlobalChannelPlan = { guides, reservedTotal };
  return plan;
}
