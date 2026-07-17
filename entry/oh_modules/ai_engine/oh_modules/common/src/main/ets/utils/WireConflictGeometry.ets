/**
 * 导线冲突几何 — 异网正交交叉 / 共线重合统一判定
 * 供 ConstrainedWiringEngine / PostGenValidator / 门禁共用
 */
import { Point2D } from '../types/CommonTypes';
import { RouteLine } from '../types/TopologyTypes';

export type WireSegmentConflict = 'none' | 'orthogonal_cross' | 'collinear_overlap';

export class WireConflictGeometry {
  /** 两正交/共线段冲突类型（异网禁用共线重合；正交交叉亦视为冲突需绕开） */
  static segmentConflict(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): WireSegmentConflict {
    // 正交穿越
    if (a1.x === a2.x && b1.y === b2.y) {
      const x = a1.x;
      const y = b1.y;
      if (WireConflictGeometry.between(y, Math.min(a1.y, a2.y), Math.max(a1.y, a2.y)) &&
        WireConflictGeometry.between(x, Math.min(b1.x, b2.x), Math.max(b1.x, b2.x))) {
        return 'orthogonal_cross';
      }
    }
    if (a1.y === a2.y && b1.x === b2.x) {
      const x = b1.x;
      const y = a1.y;
      if (WireConflictGeometry.between(x, Math.min(a1.x, a2.x), Math.max(a1.x, a2.x)) &&
        WireConflictGeometry.between(y, Math.min(b1.y, b2.y), Math.max(b1.y, b2.y))) {
        return 'orthogonal_cross';
      }
    }
    // 共线重叠（长度 > 1mil）
    if (a1.x === a2.x && b1.x === b2.x && a1.x === b1.x) {
      const aMin = Math.min(a1.y, a2.y);
      const aMax = Math.max(a1.y, a2.y);
      const bMin = Math.min(b1.y, b2.y);
      const bMax = Math.max(b1.y, b2.y);
      if (Math.min(aMax, bMax) - Math.max(aMin, bMin) > 1) {
        return 'collinear_overlap';
      }
    }
    if (a1.y === a2.y && b1.y === b2.y && a1.y === b1.y) {
      const aMin = Math.min(a1.x, a2.x);
      const aMax = Math.max(a1.x, a2.x);
      const bMin = Math.min(b1.x, b2.x);
      const bMax = Math.max(b1.x, b2.x);
      if (Math.min(aMax, bMax) - Math.max(aMin, bMin) > 1) {
        return 'collinear_overlap';
      }
    }
    return 'none';
  }

  static between(v: number, lo: number, hi: number): boolean {
    return v >= lo - 0.5 && v <= hi + 0.5;
  }

  /** 两根导线是否异网冲突（调用方保证已排除同 net） */
  static wiresConflict(a: RouteLine, b: RouteLine): WireSegmentConflict {
    if (a.netUuid === b.netUuid) {
      return 'none';
    }
    let worst: WireSegmentConflict = 'none';
    for (let i = 1; i < a.points.length; i++) {
      for (let j = 1; j < b.points.length; j++) {
        const c = WireConflictGeometry.segmentConflict(
          a.points[i - 1], a.points[i], b.points[j - 1], b.points[j]);
        if (c === 'collinear_overlap') {
          return 'collinear_overlap';
        }
        if (c === 'orthogonal_cross') {
          worst = 'orthogonal_cross';
        }
      }
    }
    return worst;
  }

  static pathLength(points: Point2D[]): number {
    let len = 0;
    for (let i = 1; i < points.length; i++) {
      len += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
    }
    return len;
  }

  /** 短 stub（标号引线）保留，不强制 A* 重布；含选中区逃逸的 stub 可到 ~90mil */
  static isShortStub(wire: RouteLine): boolean {
    const len = WireConflictGeometry.pathLength(wire.points);
    // 单段/两段正交引出视为 stub（即使略长于旧阈值 45）
    if (wire.points.length <= 2 && len <= 90) {
      return true;
    }
    if (wire.points.length <= 3 && len <= 70) {
      return true;
    }
    return len <= 45;
  }
}
