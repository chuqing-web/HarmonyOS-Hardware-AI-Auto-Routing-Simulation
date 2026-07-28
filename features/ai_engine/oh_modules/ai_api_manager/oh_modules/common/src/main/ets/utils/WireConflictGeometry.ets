/**
 * 导线冲突几何 — 异网正交交叉 / 共线重合 / 斜线相交统一判定
 * 供 ConstrainedWiringEngine / PostGenValidator / 门禁共用
 */
import { Point2D } from '../types/CommonTypes';
import { RouteLine } from '../types/TopologyTypes';

export type WireSegmentConflict = 'none' | 'orthogonal_cross' | 'collinear_overlap';

const COORD_EPS = 0.75;

export class WireConflictGeometry {
  private static nearlyEq(a: number, b: number): boolean {
    return Math.abs(a - b) <= COORD_EPS;
  }

  /** 两正交/共线/斜线段冲突类型 */
  static segmentConflict(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): WireSegmentConflict {
    const aVert = WireConflictGeometry.nearlyEq(a1.x, a2.x);
    const aHoriz = WireConflictGeometry.nearlyEq(a1.y, a2.y);
    const bVert = WireConflictGeometry.nearlyEq(b1.x, b2.x);
    const bHoriz = WireConflictGeometry.nearlyEq(b1.y, b2.y);

    // 正交穿越
    if (aVert && bHoriz) {
      const x = a1.x;
      const y = b1.y;
      if (WireConflictGeometry.between(y, Math.min(a1.y, a2.y), Math.max(a1.y, a2.y)) &&
        WireConflictGeometry.between(x, Math.min(b1.x, b2.x), Math.max(b1.x, b2.x))) {
        return 'orthogonal_cross';
      }
    }
    if (aHoriz && bVert) {
      const x = b1.x;
      const y = a1.y;
      if (WireConflictGeometry.between(x, Math.min(a1.x, a2.x), Math.max(a1.x, a2.x)) &&
        WireConflictGeometry.between(y, Math.min(b1.y, b2.y), Math.max(b1.y, b2.y))) {
        return 'orthogonal_cross';
      }
    }
    // 共线重叠（长度 > 网格一半）
    if (aVert && bVert && WireConflictGeometry.nearlyEq(a1.x, b1.x)) {
      const aMin = Math.min(a1.y, a2.y);
      const aMax = Math.max(a1.y, a2.y);
      const bMin = Math.min(b1.y, b2.y);
      const bMax = Math.max(b1.y, b2.y);
      if (Math.min(aMax, bMax) - Math.max(aMin, bMin) > 5) {
        return 'collinear_overlap';
      }
    }
    if (aHoriz && bHoriz && WireConflictGeometry.nearlyEq(a1.y, b1.y)) {
      const aMin = Math.min(a1.x, a2.x);
      const aMax = Math.max(a1.x, a2.x);
      const bMin = Math.min(b1.x, b2.x);
      const bMax = Math.max(b1.x, b2.x);
      if (Math.min(aMax, bMax) - Math.max(aMin, bMin) > 5) {
        return 'collinear_overlap';
      }
    }
    // 非曼哈顿斜线：标准线段相交（不含仅端点相接）
    if ((!aVert && !aHoriz) || (!bVert && !bHoriz)) {
      if (WireConflictGeometry.segmentsProperIntersect(a1, a2, b1, b2)) {
        return 'orthogonal_cross';
      }
    }
    return 'none';
  }

  /**
   * 正交交叉点坐标；非正交交叉或不相交返回 null。
   * 用于「交叉≠连接」：禁止把交叉点附近的无关端点吸并。
   */
  static orthogonalCrossPoint(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): Point2D | null {
    if (WireConflictGeometry.segmentConflict(a1, a2, b1, b2) !== 'orthogonal_cross') {
      return null;
    }
    const aVert = WireConflictGeometry.nearlyEq(a1.x, a2.x);
    const aHoriz = WireConflictGeometry.nearlyEq(a1.y, a2.y);
    const bVert = WireConflictGeometry.nearlyEq(b1.x, b2.x);
    const bHoriz = WireConflictGeometry.nearlyEq(b1.y, b2.y);
    if (aVert && bHoriz) {
      return { x: a1.x, y: b1.y };
    }
    if (aHoriz && bVert) {
      return { x: b1.x, y: a1.y };
    }
    // 斜线：取近似中点
    return {
      x: (a1.x + a2.x + b1.x + b2.x) / 4,
      y: (a1.y + a2.y + b1.y + b2.y) / 4
    };
  }

  /**
   * 交叉点是否远离双方全部端点（真·中段穿越，非 T 接/共端点）。
   */
  static isMidspanCross(
    cross: Point2D,
    aEnds: Point2D[],
    bEnds: Point2D[],
    endTol: number = 3
  ): boolean {
    for (let i = 0; i < aEnds.length; i++) {
      if (Math.hypot(cross.x - aEnds[i].x, cross.y - aEnds[i].y) <= endTol) {
        return false;
      }
    }
    for (let i = 0; i < bEnds.length; i++) {
      if (Math.hypot(cross.x - bEnds[i].x, cross.y - bEnds[i].y) <= endTol) {
        return false;
      }
    }
    return true;
  }

  /** 严格相交（端点共点不算冲突，避免 T 结误报） */
  private static segmentsProperIntersect(p1: Point2D, p2: Point2D, q1: Point2D, q2: Point2D): boolean {
    const o1 = WireConflictGeometry.orient(p1, p2, q1);
    const o2 = WireConflictGeometry.orient(p1, p2, q2);
    const o3 = WireConflictGeometry.orient(q1, q2, p1);
    const o4 = WireConflictGeometry.orient(q1, q2, p2);
    if (o1 === 0 || o2 === 0 || o3 === 0 || o4 === 0) {
      return false;
    }
    return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
  }

  private static orient(a: Point2D, b: Point2D, c: Point2D): number {
    const v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(v) < 1e-6) {
      return 0;
    }
    return v > 0 ? 1 : -1;
  }

  static between(v: number, lo: number, hi: number): boolean {
    return v >= lo - COORD_EPS && v <= hi + COORD_EPS;
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

  /** 短 stub（标号引线）保留；阈值收紧避免 90mil 总线段被豁免 */
  static isShortStub(wire: RouteLine): boolean {
    const len = WireConflictGeometry.pathLength(wire.points);
    if (wire.points.length <= 2 && len <= 55) {
      return true;
    }
    if (wire.points.length <= 3 && len <= 45) {
      return true;
    }
    return len <= 35;
  }
}
