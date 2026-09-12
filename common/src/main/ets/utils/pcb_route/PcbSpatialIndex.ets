/**
 * 均匀网格空间索引 — 加速同层 track 邻近查询（替代全量 O(n) 扫描）。
 */
import { PcbLayerId, PcbTrack, PcbVia } from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';

export interface TrackSpatialIndex {
  cell: number;
  originX: number;
  originY: number;
  cols: number;
  rows: number;
  /** layer → cellKey → track indices into tracks[] */
  buckets: Map<string, Map<number, number[]>>;
  tracks: PcbTrack[];
}

function cellKey(c: number, r: number): number {
  return r * 100000 + c;
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) {
    return lo;
  }
  if (v > hi) {
    return hi;
  }
  return v;
}

function stampTrack(idx: TrackSpatialIndex, ti: number): void {
  const t = idx.tracks[ti];
  let layerMap = idx.buckets.get(t.layer);
  if (layerMap === undefined) {
    layerMap = new Map();
    idx.buckets.set(t.layer, layerMap);
  }
  const minX = Math.min(t.start.x, t.end.x);
  const maxX = Math.max(t.start.x, t.end.x);
  const minY = Math.min(t.start.y, t.end.y);
  const maxY = Math.max(t.start.y, t.end.y);
  const c0 = clamp(Math.floor((minX - idx.originX) / idx.cell), 0, idx.cols - 1);
  const c1 = clamp(Math.floor((maxX - idx.originX) / idx.cell), 0, idx.cols - 1);
  const r0 = clamp(Math.floor((minY - idx.originY) / idx.cell), 0, idx.rows - 1);
  const r1 = clamp(Math.floor((maxY - idx.originY) / idx.cell), 0, idx.rows - 1);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const k = cellKey(c, r);
      let arr = layerMap.get(k);
      if (arr === undefined) {
        arr = [];
        layerMap.set(k, arr);
      }
      arr.push(ti);
    }
  }
}

/** 由既有走线建索引；tracks 很少时可不建 */
export function buildTrackSpatialIndex(
  tracks: PcbTrack[],
  cellMil: number = 100
): TrackSpatialIndex {
  let minX = 0;
  let minY = 0;
  let maxX = 2000;
  let maxY = 2000;
  if (tracks.length > 0) {
    minX = tracks[0].start.x;
    minY = tracks[0].start.y;
    maxX = minX;
    maxY = minY;
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      minX = Math.min(minX, t.start.x, t.end.x);
      maxX = Math.max(maxX, t.start.x, t.end.x);
      minY = Math.min(minY, t.start.y, t.end.y);
      maxY = Math.max(maxY, t.start.y, t.end.y);
    }
    minX -= cellMil;
    minY -= cellMil;
    maxX += cellMil;
    maxY += cellMil;
  }
  const cell = Math.max(40, cellMil);
  const cols = Math.max(4, Math.ceil((maxX - minX) / cell) + 1);
  const rows = Math.max(4, Math.ceil((maxY - minY) / cell) + 1);
  const idx: TrackSpatialIndex = {
    cell,
    originX: minX,
    originY: minY,
    cols,
    rows,
    buckets: new Map(),
    tracks: tracks
  };
  for (let i = 0; i < tracks.length; i++) {
    stampTrack(idx, i);
  }
  return idx;
}

/**
 * 查询与线段 AABB（含 inflate）相交的候选 track 下标（去重）。
 */
export function queryTracksNearSegment(
  idx: TrackSpatialIndex,
  layer: PcbLayerId,
  a: Point2D,
  b: Point2D,
  inflate: number
): number[] {
  const layerMap = idx.buckets.get(layer);
  if (layerMap === undefined) {
    return [];
  }
  const minX = Math.min(a.x, b.x) - inflate;
  const maxX = Math.max(a.x, b.x) + inflate;
  const minY = Math.min(a.y, b.y) - inflate;
  const maxY = Math.max(a.y, b.y) + inflate;
  const c0 = clamp(Math.floor((minX - idx.originX) / idx.cell), 0, idx.cols - 1);
  const c1 = clamp(Math.floor((maxX - idx.originX) / idx.cell), 0, idx.cols - 1);
  const r0 = clamp(Math.floor((minY - idx.originY) / idx.cell), 0, idx.rows - 1);
  const r1 = clamp(Math.floor((maxY - idx.originY) / idx.cell), 0, idx.rows - 1);
  const seen: Set<number> = new Set();
  const out: number[] = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const arr = layerMap.get(cellKey(c, r));
      if (arr === undefined) {
        continue;
      }
      for (let i = 0; i < arr.length; i++) {
        const ti = arr[i];
        if (seen.has(ti)) {
          continue;
        }
        seen.add(ti);
        out.push(ti);
      }
    }
  }
  return out;
}

/** 过孔邻近（同层）粗筛：全表扫描但上限很小，保留接口对称 */
export function viasNearPoint(
  vias: PcbVia[],
  layer: PcbLayerId,
  p: Point2D,
  radius: number
): PcbVia[] {
  const out: PcbVia[] = [];
  const r2 = radius * radius;
  for (let i = 0; i < vias.length; i++) {
    const v = vias[i];
    if (v.layers && v.layers.length > 0 && v.layers.indexOf(layer) < 0) {
      continue;
    }
    const dx = v.position.x - p.x;
    const dy = v.position.y - p.y;
    if (dx * dx + dy * dy <= r2) {
      out.push(v);
    }
  }
  return out;
}
