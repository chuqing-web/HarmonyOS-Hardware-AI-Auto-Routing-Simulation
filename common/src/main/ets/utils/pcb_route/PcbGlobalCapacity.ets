/**
 * G-Cell 容量型全局布线：usage/capacity 拥塞代价 + 多轮重分配。
 * 对齐路线图阶段二「全局布线」核心。
 */
import { Point2D } from '../../types/CommonTypes';
import { PcbLayerId } from '../../types/PcbTypes';
import { GlobalCongestionMap } from './PcbGlobalRoute';
import {
  assignGlobalChannels, GlobalChannelPlan, GlobalNetGuide, GlobalNetSeed
} from './PcbGlobalChannel';
import { tracePcb } from '../PcbTraceLog';

/** 单 G-Cell 默认通道容量（可被拥塞图密度削减） */
const BASE_CAPACITY = 8;

function congestionPenalty(usage: number, capacity: number): number {
  if (capacity <= 0) {
    return 100;
  }
  const r = usage / capacity;
  if (r < 0.5) {
    return 0;
  }
  if (r < 0.8) {
    return 0.5;
  }
  if (r < 1.0) {
    return 2;
  }
  if (r < 1.2) {
    return 10;
  }
  return 100;
}

function pathCostWithUsage(
  map: GlobalCongestionMap,
  layer: PcbLayerId,
  path: Point2D[],
  usage: number[]
): number {
  const dens = map.densityByLayer.get(layer);
  let cost = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const steps = Math.max(1, Math.ceil(
      (Math.abs(a.x - b.x) + Math.abs(a.y - b.y)) / Math.max(map.cell * 0.5, 1)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const c = Math.max(0, Math.min(map.cols - 1, Math.floor((x - map.originX) / map.cell)));
      const r = Math.max(0, Math.min(map.rows - 1, Math.floor((y - map.originY) / map.cell)));
      const idx = r * map.cols + c;
      const baseD = dens !== undefined ? dens[idx] : 0;
      const cap = Math.max(2, BASE_CAPACITY - Math.floor(baseD * 0.5));
      cost += 1 + congestionPenalty(usage[idx] + baseD * 0.25, cap);
    }
  }
  return cost;
}

function stampUsagePath(
  map: GlobalCongestionMap,
  usage: number[],
  path: Point2D[]
): number {
  let n = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const steps = Math.max(1, Math.ceil(
      (Math.abs(a.x - b.x) + Math.abs(a.y - b.y)) / Math.max(map.cell * 0.5, 1)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const c = Math.max(0, Math.min(map.cols - 1, Math.floor((x - map.originX) / map.cell)));
      const r = Math.max(0, Math.min(map.rows - 1, Math.floor((y - map.originY) / map.cell)));
      usage[r * map.cols + c] += 1;
      n++;
    }
  }
  return n;
}

/**
 * 首轮用基础 L 分配，随后多轮按 usage/capacity 重选 H/V，缓解热点。
 * 不重复 soft-stamp density，避免拥塞虚高。
 */
export function assignGlobalChannelsWithCapacity(
  map: GlobalCongestionMap,
  seeds: GlobalNetSeed[],
  rounds: number = 3
): GlobalChannelPlan {
  let plan = assignGlobalChannels(map, seeds);
  if (seeds.length === 0 || rounds <= 1) {
    return plan;
  }

  for (let round = 1; round < rounds; round++) {
    const usageH: Map<string, number[]> = new Map();
    const emptyUsage = (): number[] => {
      const u: number[] = [];
      for (let i = 0; i < map.cols * map.rows; i++) {
        u.push(0);
      }
      return u;
    };
    const getU = (layer: PcbLayerId): number[] => {
      let u = usageH.get(layer);
      if (u === undefined) {
        u = emptyUsage();
        usageH.set(layer, u);
      }
      return u;
    };

    const ordered = seeds.slice().sort((a: GlobalNetSeed, b: GlobalNetSeed) => {
      const da = Math.abs(a.a.x - a.b.x) + Math.abs(a.a.y - a.b.y);
      const db = Math.abs(b.a.x - b.b.x) + Math.abs(b.a.y - b.b.y);
      return da - db;
    });

    const newGuides: Map<string, GlobalNetGuide> = new Map();
    let reserved = 0;

    for (let i = 0; i < ordered.length; i++) {
      const s = ordered[i];
      const midH: Point2D = { x: s.b.x, y: s.a.y };
      const midV: Point2D = { x: s.a.x, y: s.b.y };
      const costH =
        pathCostWithUsage(map, s.layerH, [s.a, midH], getU(s.layerH)) +
        pathCostWithUsage(map, s.layerV, [midH, s.b], getU(s.layerV));
      const costV =
        pathCostWithUsage(map, s.layerV, [s.a, midV], getU(s.layerV)) +
        pathCostWithUsage(map, s.layerH, [midV, s.b], getU(s.layerH));
      const preferH = costH <= costV;
      const path = preferH ? [s.a, midH, s.b] : [s.a, midV, s.b];
      let cells = 0;
      if (preferH) {
        cells += stampUsagePath(map, getU(s.layerH), [s.a, midH]);
        cells += stampUsagePath(map, getU(s.layerV), [midH, s.b]);
      } else {
        cells += stampUsagePath(map, getU(s.layerV), [s.a, midV]);
        cells += stampUsagePath(map, getU(s.layerH), [midV, s.b]);
      }
      reserved += cells;
      newGuides.set(s.netId, {
        netId: s.netId,
        waypoints: path,
        preferHFirst: preferH,
        reservedCells: cells
      });
    }
    plan = { guides: newGuides, reservedTotal: reserved };
  }

  tracePcb('GLOBAL_CAPACITY',
    `rounds=${rounds} nets=${seeds.length} guides=${plan.guides.size} reserved=${plan.reservedTotal}`);
  return plan;
}
