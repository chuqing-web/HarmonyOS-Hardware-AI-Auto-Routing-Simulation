/**
 * 高密度封装逃逸序：外环焊盘优先，降低内层通道被内圈占死概率。
 * 适用于 BGA/密集 QFP；稀疏封装原样返回。
 */
import { Point2D } from '../../types/CommonTypes';
import { WarOrderPin } from '../WarRouteOrder';

function centroid(pts: Point2D[]): Point2D {
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < pts.length; i++) {
    sx += pts[i].x;
    sy += pts[i].y;
  }
  const n = Math.max(pts.length, 1);
  return { x: sx / n, y: sy / n };
}

/**
 * 若焊盘数≥阈值且呈面阵分布：
 * 1) 外环优先；2) 行列交替（奇行偏左右、偶行偏上下）作为次关键字。
 */
export function orderPinsOuterRingFirst(pins: WarOrderPin[], minPads: number = 16): WarOrderPin[] {
  if (pins.length < minPads) {
    return pins.slice();
  }
  const pts: Point2D[] = [];
  for (let i = 0; i < pins.length; i++) {
    pts.push(pins[i].pt);
  }
  const c = centroid(pts);
  const xs: number[] = [];
  const ys: number[] = [];
  const pushUnique = (arr: number[], v: number): void => {
    for (let i = 0; i < arr.length; i++) {
      if (Math.abs(arr[i] - v) < 1) {
        return;
      }
    }
    arr.push(v);
  };
  for (let i = 0; i < pts.length; i++) {
    pushUnique(xs, pts[i].x);
    pushUnique(ys, pts[i].y);
  }
  if (xs.length < 4 || ys.length < 4) {
    return pins.slice();
  }
  xs.sort((a: number, b: number) => a - b);
  ys.sort((a: number, b: number) => a - b);

  const rowIndex = (y: number): number => {
    let best = 0;
    let bestD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < ys.length; i++) {
      const d = Math.abs(ys[i] - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  const indexed: number[] = [];
  for (let i = 0; i < pins.length; i++) {
    indexed.push(i);
  }
  indexed.sort((ia: number, ib: number) => {
    const da = Math.hypot(pins[ia].pt.x - c.x, pins[ia].pt.y - c.y);
    const db = Math.hypot(pins[ib].pt.x - c.x, pins[ib].pt.y - c.y);
    if (Math.abs(db - da) > 0.5) {
      return db - da;
    }
    // 行列交替：奇数行优先水平逃逸（|dx|大），偶数行垂直
    const ra = rowIndex(pins[ia].pt.y);
    const rb = rowIndex(pins[ib].pt.y);
    if (ra !== rb) {
      return ra - rb;
    }
    if ((ra % 2) === 0) {
      return Math.abs(pins[ib].pt.x - c.x) - Math.abs(pins[ia].pt.x - c.x);
    }
    return Math.abs(pins[ib].pt.y - c.y) - Math.abs(pins[ia].pt.y - c.y);
  });
  const out: WarOrderPin[] = [];
  for (let i = 0; i < indexed.length; i++) {
    out.push(pins[indexed[i]]);
  }
  return out;
}

/** 点集外环优先（无 key 时） */
export function orderPointsOuterRingFirst(points: Point2D[], minPads: number = 16): Point2D[] {
  const pins: WarOrderPin[] = [];
  for (let i = 0; i < points.length; i++) {
    pins.push({ key: `p${i}`, pt: points[i] });
  }
  const ordered = orderPinsOuterRingFirst(pins, minPads);
  const out: Point2D[] = [];
  for (let i = 0; i < ordered.length; i++) {
    out.push(ordered[i].pt);
  }
  return out;
}
