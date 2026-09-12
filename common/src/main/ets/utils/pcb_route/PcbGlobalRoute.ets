/**
 * 全局布线骨架：粗网格拥塞估算 + 按拥塞选择 H/V 层对。
 * 不生成几何走线，只为详细布线提供层分配与风险信号。
 */
import {
  PcbDocument, PcbLayerId, PcbTrack, copperLayersFromStack
} from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';

export interface GlobalCongestionMap {
  cell: number;
  originX: number;
  originY: number;
  cols: number;
  rows: number;
  /** layerId → 扁平 density[row*cols+col] */
  densityByLayer: Map<string, number[]>;
}

export interface GlobalLayerPair {
  h: PcbLayerId;
  v: PcbLayerId;
}

interface BoardBoundsRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function boardBounds(doc: PcbDocument): BoardBoundsRect {
  const pts = doc.boardOutline?.points ?? [];
  if (pts.length >= 2) {
    let x1 = pts[0].x;
    let y1 = pts[0].y;
    let x2 = pts[0].x;
    let y2 = pts[0].y;
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].x < x1) {
        x1 = pts[i].x;
      }
      if (pts[i].y < y1) {
        y1 = pts[i].y;
      }
      if (pts[i].x > x2) {
        x2 = pts[i].x;
      }
      if (pts[i].y > y2) {
        y2 = pts[i].y;
      }
    }
    const r0: BoardBoundsRect = { x1: x1, y1: y1, x2: x2, y2: y2 };
    return r0;
  }
  let x1 = 0;
  let y1 = 0;
  let x2 = 2000;
  let y2 = 2000;
  for (const fp of doc.footprints) {
    const x = fp.position.x;
    const y = fp.position.y;
    if (x < x1) {
      x1 = x;
    }
    if (y < y1) {
      y1 = y;
    }
    if (x > x2) {
      x2 = x;
    }
    if (y > y2) {
      y2 = y;
    }
  }
  const r1: BoardBoundsRect = { x1: x1 - 200, y1: y1 - 200, x2: x2 + 200, y2: y2 + 200 };
  return r1;
}

function emptyGrid(cols: number, rows: number): number[] {
  const n = cols * rows;
  const a: number[] = [];
  for (let i = 0; i < n; i++) {
    a.push(0);
  }
  return a;
}

function stampSeg(grid: number[], cols: number, rows: number,
  ox: number, oy: number, cell: number, a: Point2D, b: Point2D): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / Math.max(cell * 0.5, 1)));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const c = Math.floor((x - ox) / cell);
    const r = Math.floor((y - oy) / cell);
    if (c < 0 || r < 0 || c >= cols || r >= rows) {
      continue;
    }
    grid[r * cols + c] += 1;
  }
}

/** 由既有铜线 + 焊盘 bbox 建粗拥塞图（每铜层） */
export function buildCongestionMap(doc: PcbDocument, cellMil: number = 100): GlobalCongestionMap {
  const cell = Math.max(40, cellMil);
  const b = boardBounds(doc);
  const cols = Math.max(4, Math.ceil((b.x2 - b.x1) / cell) + 1);
  const rows = Math.max(4, Math.ceil((b.y2 - b.y1) / cell) + 1);
  const copper = copperLayersFromStack(doc.layerStack);
  const densityByLayer: Map<string, number[]> = new Map();
  for (let i = 0; i < copper.length; i++) {
    densityByLayer.set(copper[i], emptyGrid(cols, rows));
  }
  if (copper.length === 0) {
    densityByLayer.set(PcbLayerId.F_CU, emptyGrid(cols, rows));
  }

  for (const trk of doc.tracks) {
    const g = densityByLayer.get(trk.layer);
    if (g === undefined) {
      continue;
    }
    stampSeg(g, cols, rows, b.x1, b.y1, cell, trk.start, trk.end);
  }

  // 焊盘占位：所有铜层加软拥塞，避免全局把通道估成空
  for (const fp of doc.footprints) {
    for (const pad of fp.pads) {
      const px = fp.position.x + pad.pos.x;
      const py = fp.position.y + pad.pos.y;
      const c = Math.floor((px - b.x1) / cell);
      const r = Math.floor((py - b.y1) / cell);
      if (c < 0 || r < 0 || c >= cols || r >= rows) {
        continue;
      }
      densityByLayer.forEach((g: number[]) => {
        g[r * cols + c] += 2;
      });
    }
  }

  const out: GlobalCongestionMap = {
    cell,
    originX: b.x1,
    originY: b.y1,
    cols,
    rows,
    densityByLayer
  };
  return out;
}

function layerMeanDensity(map: GlobalCongestionMap, layer: PcbLayerId): number {
  const g = map.densityByLayer.get(layer);
  if (g === undefined || g.length === 0) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < g.length; i++) {
    sum += g[i];
  }
  return sum / g.length;
}

function corridorDensity(map: GlobalCongestionMap, layer: PcbLayerId,
  a: Point2D, b: Point2D): number {
  const g = map.densityByLayer.get(layer);
  if (g === undefined) {
    return 0;
  }
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / Math.max(map.cell * 0.5, 1)));
  let sum = 0;
  let n = 0;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const c = Math.floor((x - map.originX) / map.cell);
    const r = Math.floor((y - map.originY) / map.cell);
    if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) {
      continue;
    }
    sum += g[r * map.cols + c];
    n++;
  }
  return n > 0 ? sum / n : layerMeanDensity(map, layer);
}

/**
 * Cu≥4 时在内层中选拥塞最低的 H/V 对；2 层/地/电源保持调用方策略。
 */
export function pickCongestionAwareLayerPair(
  doc: PcbDocument,
  map: GlobalCongestionMap,
  preferred: PcbLayerId,
  netName: string,
  netId: string,
  sampleA: Point2D | null,
  sampleB: Point2D | null,
  isGnd: boolean,
  isPower: boolean
): GlobalLayerPair {
  const copper = copperLayersFromStack(doc.layerStack);
  const top = copper.length > 0 ? copper[0] : preferred;
  const bot = copper.length > 0 ? copper[copper.length - 1] : PcbLayerId.B_CU;
  if (isGnd) {
    return { h: bot, v: bot };
  }
  if (copper.length < 4) {
    return { h: top, v: top };
  }
  if (isPower) {
    // 与 LocalStrategy：末层 power_h，勿占倒数第二内层
    return { h: bot, v: bot };
  }

  const innerCount = Math.max(copper.length - 2, 1);
  let bestH = copper[1];
  let bestV = innerCount > 1 ? copper[2] : copper[1];
  let bestScore = Number.POSITIVE_INFINITY;

  for (let i = 0; i < innerCount; i++) {
    for (let j = 0; j < innerCount; j++) {
      if (innerCount > 1 && i === j) {
        continue;
      }
      const h = copper[1 + i];
      const v = copper[1 + j];
      let score = layerMeanDensity(map, h) + layerMeanDensity(map, v);
      if (sampleA !== null && sampleB !== null) {
        score += corridorDensity(map, h, sampleA, sampleB) * 0.75;
        score += corridorDensity(map, v, sampleA, sampleB) * 0.75;
      }
      // 轻微打散：同名网避免全挤同一对
      let hash = 0;
      const key = netId.length > 0 ? netId : netName;
      for (let k = 0; k < key.length; k++) {
        hash = ((hash * 31) + key.charCodeAt(k)) | 0;
      }
      score += (Math.abs(hash + i * 17 + j * 13) % 7) * 0.01;
      if (score < bestScore) {
        bestScore = score;
        bestH = h;
        bestV = v;
      }
    }
  }
  if (innerCount === 1) {
    bestV = bestH;
  }
  return { h: bestH, v: bestV };
}

/** 用曼哈顿 bbox 对角线估一条网的拥塞风险（越大越堵） */
export function estimateNetCongestionRisk(
  map: GlobalCongestionMap,
  layer: PcbLayerId,
  points: Point2D[]
): number {
  if (points.length < 2) {
    return 0;
  }
  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;
  for (let i = 1; i < points.length; i++) {
    if (points[i].x < minX) {
      minX = points[i].x;
    }
    if (points[i].x > maxX) {
      maxX = points[i].x;
    }
    if (points[i].y < minY) {
      minY = points[i].y;
    }
    if (points[i].y > maxY) {
      maxY = points[i].y;
    }
  }
  const a: Point2D = { x: minX, y: minY };
  const b: Point2D = { x: maxX, y: maxY };
  return corridorDensity(map, layer, a, b);
}

/** 布线后把新 track 累加进拥塞图（供后续网动态更新） */
export function accumulateTracksIntoCongestion(
  map: GlobalCongestionMap,
  tracks: PcbTrack[],
  fromIndex: number
): void {
  for (let i = fromIndex; i < tracks.length; i++) {
    const trk = tracks[i];
    const g = map.densityByLayer.get(trk.layer);
    if (g === undefined) {
      continue;
    }
    stampSeg(g, map.cols, map.rows, map.originX, map.originY, map.cell, trk.start, trk.end);
  }
}

export interface CongestionHotspot {
  layer: PcbLayerId;
  x: number;
  y: number;
  density: number;
}

export interface PlacementCongestionFeedback {
  hotspots: CongestionHotspot[];
  maxDensity: number;
  meanDensity: number;
  /** 建议：是否应回退调整布局 */
  suggestReplace: boolean;
  summary: string;
}

/**
 * 从拥塞图提取热点，供布局模块/UI 反馈（经典 F8 与 AI placement 共用）。
 */
export function buildPlacementCongestionFeedback(
  map: GlobalCongestionMap,
  topK: number = 8
): PlacementCongestionFeedback {
  const hotspots: CongestionHotspot[] = [];
  let sum = 0;
  let cells = 0;
  let maxD = 0;
  map.densityByLayer.forEach((grid: number[], layerKey: string) => {
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        const d = grid[r * map.cols + c];
        sum += d;
        cells++;
        if (d > maxD) {
          maxD = d;
        }
        if (d >= 4) {
          const hs: CongestionHotspot = {
            layer: layerKey as PcbLayerId,
            x: map.originX + (c + 0.5) * map.cell,
            y: map.originY + (r + 0.5) * map.cell,
            density: d
          };
          hotspots.push(hs);
        }
      }
    }
  });
  hotspots.sort((a: CongestionHotspot, b: CongestionHotspot) => b.density - a.density);
  const trimmed = hotspots.slice(0, topK);
  const mean = cells > 0 ? sum / cells : 0;
  const suggest = maxD >= 12 || (mean >= 3 && trimmed.length >= 4);
  const summary = suggest
    ? `拥塞偏高 max=${maxD.toFixed(0)} mean=${mean.toFixed(1)} hotspots=${trimmed.length}，建议调整布局`
    : `拥塞可接受 max=${maxD.toFixed(0)} mean=${mean.toFixed(1)}`;
  const out: PlacementCongestionFeedback = {
    hotspots: trimmed,
    maxDensity: maxD,
    meanDensity: mean,
    suggestReplace: suggest,
    summary
  };
  return out;
}
