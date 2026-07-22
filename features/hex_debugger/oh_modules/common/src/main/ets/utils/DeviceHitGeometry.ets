/**
 * 器件选中命中区 + 导线几何 — 与 SchematicEditorImpl.HIT_PAD 对齐，
 * 供 AI 布线 / 校验 / Prompt 注入共用。
 */
import { Pin, Point2D } from '../types/CommonTypes';
import { DeviceInst, RouteLine } from '../types/TopologyTypes';
import { SymbolBounds, calcSymbolBounds, coverOriginCenteredBody } from './SymbolGeometry';

/** 与 SchematicEditorImpl.HIT_PAD 保持一致 — 点击/悬停选中外扩 */
export const SELECTION_HIT_PAD = 22;

/**
 * 布线障碍外扩（须明显小于 SELECTION_HIT_PAD）。
 * 选中区可偏大方便点选，但障碍过大时会把引脚深埋，WAR/正交布线无法落到脚上。
 */
export const WIRE_OBSTACLE_PAD = 6;

/** 导线距无关引脚的最小安全距离 (mil) */
export const FOREIGN_PIN_CLEARANCE = 20;

export interface WorldHitRect {
  x: number;
  y: number;
  w: number;
  h: number;
  refName: string;
  instUuid: string;
  libDevId: string;
}

export interface WirePathCoverage {
  netUuid: string;
  pointCount: number;
  points: Point2D[];
  segmentCount: number;
  lengthMil: number;
  bbox: WorldHitRect;
}

export class DeviceHitGeometry {
  static expandLocal(bounds: SymbolBounds, pad: number): SymbolBounds {
    return {
      minX: bounds.minX - pad,
      maxX: bounds.maxX + pad,
      minY: bounds.minY - pad,
      maxY: bounds.maxY + pad,
      width: bounds.width + pad * 2,
      height: bounds.height + pad * 2
    };
  }

  static transformLocal(local: Point2D, rotate: number, mirrorH: boolean): Point2D {
    let lx = local.x;
    let ly = local.y;
    if (mirrorH) {
      lx = -lx;
    }
    const rot = ((rotate % 360) + 360) % 360;
    if (rot === 90) {
      return { x: -ly, y: lx };
    }
    if (rot === 180) {
      return { x: -lx, y: -ly };
    }
    if (rot === 270) {
      return { x: ly, y: -lx };
    }
    return { x: lx, y: ly };
  }

  /** 局部 SymbolBounds → 世界 AABB（含旋转镜像） */
  static localToWorldAabb(
    ox: number, oy: number, rotate: number, mirrorH: boolean,
    bounds: SymbolBounds, refName: string = '', instUuid: string = '',
    libDevId: string = ''
  ): WorldHitRect {
    const corners: Point2D[] = [
      { x: bounds.minX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY },
      { x: bounds.minX, y: bounds.maxY }
    ];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < corners.length; i++) {
      const t = DeviceHitGeometry.transformLocal(corners[i], rotate, mirrorH);
      const wx = ox + t.x;
      const wy = oy + t.y;
      if (wx < minX) {
        minX = wx;
      }
      if (wy < minY) {
        minY = wy;
      }
      if (wx > maxX) {
        maxX = wx;
      }
      if (wy > maxY) {
        maxY = wy;
      }
    }
    return {
      x: minX, y: minY, w: maxX - minX, h: maxY - minY,
      refName, instUuid, libDevId
    };
  }

  /** 由库引脚计算选中命中区（与编辑器选中范围一致） */
  static hitRectFromPins(
    pins: Pin[], ox: number, oy: number, rotate: number, mirrorH: boolean,
    pad: number = SELECTION_HIT_PAD,
    refName: string = '', instUuid: string = '', libDevId: string = ''
  ): WorldHitRect {
    const local = DeviceHitGeometry.expandLocal(calcSymbolBounds(pins, 8), pad);
    return DeviceHitGeometry.localToWorldAabb(
      ox, oy, rotate, mirrorH, local, refName, instUuid, libDevId);
  }

  /** 由局部引脚坐标点估算（无完整 Pin[] 时） */
  static hitRectFromLocalPoints(
    locals: Point2D[], ox: number, oy: number, rotate: number, mirrorH: boolean,
    pad: number = SELECTION_HIT_PAD,
    refName: string = '', instUuid: string = '', libDevId: string = ''
  ): WorldHitRect {
    if (locals.length === 0) {
      const fallback: SymbolBounds = {
        minX: -40 - pad, maxX: 40 + pad, minY: -30 - pad, maxY: 30 + pad,
        width: 80 + pad * 2, height: 60 + pad * 2
      };
      return DeviceHitGeometry.localToWorldAabb(
        ox, oy, rotate, mirrorH, fallback, refName, instUuid, libDevId);
    }
    let minX = locals[0].x;
    let maxX = locals[0].x;
    let minY = locals[0].y;
    let maxY = locals[0].y;
    for (let i = 1; i < locals.length; i++) {
      minX = Math.min(minX, locals[i].x);
      maxX = Math.max(maxX, locals[i].x);
      minY = Math.min(minY, locals[i].y);
      maxY = Math.max(maxY, locals[i].y);
    }
    // 与 calcSymbolBounds 一致：单侧引脚须覆盖原点符号主体
    const covered = coverOriginCenteredBody(minX, maxX, minY, maxY);
    const local: SymbolBounds = {
      minX: covered.minX - 8 - pad,
      maxX: covered.maxX + 8 + pad,
      minY: covered.minY - 8 - pad,
      maxY: covered.maxY + 8 + pad,
      width: covered.width + 16 + pad * 2,
      height: covered.height + 16 + pad * 2
    };
    return DeviceHitGeometry.localToWorldAabb(
      ox, oy, rotate, mirrorH, local, refName, instUuid, libDevId);
  }

  static hitRectFromDeviceInst(
    dev: DeviceInst, pins: Pin[], pad: number = SELECTION_HIT_PAD
  ): WorldHitRect {
    return DeviceHitGeometry.hitRectFromPins(
      pins, dev.x, dev.y, dev.rotate, dev.mirrorH, pad,
      dev.refName, dev.instUuid, dev.libDevId);
  }

  static pointInRect(px: number, py: number, r: WorldHitRect): boolean {
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  /** 引脚到选中区四边距离最短的逃逸方向 */
  static nearestEscapeEdge(pinX: number, pinY: number, r: WorldHitRect): string {
    const distL = pinX - r.x;
    const distR = (r.x + r.w) - pinX;
    const distT = pinY - r.y;
    const distB = (r.y + r.h) - pinY;
    const min = Math.min(distL, distR, distT, distB);
    if (min === distL) {
      return 'L';
    }
    if (min === distR) {
      return 'R';
    }
    if (min === distT) {
      return 'T';
    }
    return 'B';
  }

  /** 标号 stub 终点：沿最近边垂直引出到区外 stubPad */
  static stubLabelOutsidePin(pin: Point2D, r: WorldHitRect, stubPad: number = 20): Point2D {
    const edge = DeviceHitGeometry.nearestEscapeEdge(pin.x, pin.y, r);
    return DeviceHitGeometry.stubLabelOnEdge(pin, r, edge, stubPad);
  }

  static stubLabelOnEdge(pin: Point2D, r: WorldHitRect, edge: string, stubPad: number): Point2D {
    if (edge === 'L') {
      return { x: r.x - stubPad, y: pin.y };
    }
    if (edge === 'R') {
      return { x: r.x + r.w + stubPad, y: pin.y };
    }
    if (edge === 'T') {
      return { x: pin.x, y: r.y - stubPad };
    }
    return { x: pin.x, y: r.y + r.h + stubPad };
  }

  /**
   * 选出不穿透异器件选中区、且距无关脚≥FOREIGN_PIN_CLEARANCE 的 stub 终点。
   * foreignPins：调用方排除本脚后的全部引脚世界坐标（含同芯片邻脚）。
   */
  static stubLabelOutsidePinAvoidForeign(
    pin: Point2D,
    own: WorldHitRect,
    foreign: WorldHitRect[],
    stubPad: number = 20,
    foreignPins?: Point2D[]
  ): Point2D {
    const pinClear: Point2D[] = foreignPins !== undefined ? foreignPins : [];
    const preferred = DeviceHitGeometry.nearestEscapeEdge(pin.x, pin.y, own);
    const order: string[] = [preferred];
    const all = ['L', 'R', 'T', 'B'];
    for (let i = 0; i < all.length; i++) {
      if (all[i] !== preferred) {
        order.push(all[i]);
      }
    }
    const pads = [stubPad, stubPad + 16, stubPad + 32, stubPad + 48, stubPad + 64,
      stubPad + 80, stubPad + 112, stubPad + 144];
    let bestLabel: Point2D | null = null;
    let bestMinDist = -1;
    for (let pi = 0; pi < pads.length; pi++) {
      for (let ei = 0; ei < order.length; ei++) {
        const label = DeviceHitGeometry.stubLabelOnEdge(pin, own, order[ei], pads[pi]);
        let hitsForeign = false;
        for (let fi = 0; fi < foreign.length; fi++) {
          const fr = foreign[fi];
          if (fr.instUuid === own.instUuid) {
            continue;
          }
          if (DeviceHitGeometry.segmentIntersectsRect(pin, label, fr)) {
            hitsForeign = true;
            break;
          }
          if (DeviceHitGeometry.pointInRect(label.x, label.y, fr)) {
            hitsForeign = true;
            break;
          }
        }
        if (hitsForeign) {
          continue;
        }
        const clearOk = DeviceHitGeometry.segmentClearsForeignPins(
          pin, label, pinClear, FOREIGN_PIN_CLEARANCE);
        if (clearOk) {
          return label;
        }
        const minD = DeviceHitGeometry.minDistToForeignPins(pin, label, pinClear);
        if (minD > bestMinDist) {
          bestMinDist = minD;
          bestLabel = label;
        }
      }
    }
    // 仅返回满足 FOREIGN_PIN_CLEARANCE 的标号端；否则返回 null 语义用远距兜底前先拒绝
    if (bestLabel !== null && bestMinDist >= FOREIGN_PIN_CLEARANCE) {
      return bestLabel;
    }
    // 无合格候选：仍用标准 stub（调用方应 demote），勿返回 clearance 不足的 best
    return DeviceHitGeometry.stubLabelOutsidePin(pin, own, stubPad + 40);
  }

  /** 线段与标号端点到无关脚的最小距离均 ≥ clearance（两端点 ENDPOINT_EXEMPT 内豁免，与门禁一致） */
  static segmentClearsForeignPins(
    a: Point2D, b: Point2D, foreignPins: Point2D[], clearance: number
  ): boolean {
    const ENDPOINT_EXEMPT = FOREIGN_PIN_CLEARANCE;
    for (let i = 0; i < foreignPins.length; i++) {
      const fp = foreignPins[i];
      if (Math.hypot(fp.x - a.x, fp.y - a.y) <= ENDPOINT_EXEMPT ||
        Math.hypot(fp.x - b.x, fp.y - b.y) <= ENDPOINT_EXEMPT) {
        continue;
      }
      if (DeviceHitGeometry.pointSegmentDistance(fp, a, b) < clearance) {
        return false;
      }
    }
    return true;
  }

  /** 线段到无关脚的最小距离（无无关脚或均在端点豁免内时视为 Infinity） */
  static minDistToForeignPins(a: Point2D, b: Point2D, foreignPins: Point2D[]): number {
    if (foreignPins.length === 0) {
      return Number.POSITIVE_INFINITY;
    }
    const ENDPOINT_EXEMPT = FOREIGN_PIN_CLEARANCE;
    let minD = Number.POSITIVE_INFINITY;
    let any = false;
    for (let i = 0; i < foreignPins.length; i++) {
      const fp = foreignPins[i];
      if (Math.hypot(fp.x - a.x, fp.y - a.y) <= ENDPOINT_EXEMPT ||
        Math.hypot(fp.x - b.x, fp.y - b.y) <= ENDPOINT_EXEMPT) {
        continue;
      }
      any = true;
      const d = DeviceHitGeometry.pointSegmentDistance(fp, a, b);
      if (d < minD) {
        minD = d;
      }
    }
    return any ? minD : Number.POSITIVE_INFINITY;
  }

  /**
   * 引脚逃逸走廊：本器件选中区内，仅允许从引脚沿「到最近边」的正交短廊走到区外。
   * 禁止斜穿/横穿器件体；走廊半宽默认 ≈ 1 grid。
   */
  static pointInPinEscapeCorridor(
    px: number, py: number,
    pinX: number, pinY: number,
    r: WorldHitRect,
    halfWidth: number = 12
  ): boolean {
    const hw = Math.max(halfWidth, 8);
    // 脚已在区外：仅脚点邻域放行
    if (!DeviceHitGeometry.pointInRect(pinX, pinY, r)) {
      return Math.abs(px - pinX) <= hw && Math.abs(py - pinY) <= hw;
    }
    // 点不在本区且不在走廊外延：不算本脚逃逸（外层再判其他区）
    const edge = DeviceHitGeometry.nearestEscapeEdge(pinX, pinY, r);
    if (edge === 'L') {
      return px >= (r.x - hw) && px <= (pinX + hw) && Math.abs(py - pinY) <= hw;
    }
    if (edge === 'R') {
      return px >= (pinX - hw) && px <= (r.x + r.w + hw) && Math.abs(py - pinY) <= hw;
    }
    if (edge === 'T') {
      return py >= (r.y - hw) && py <= (pinY + hw) && Math.abs(px - pinX) <= hw;
    }
    return py >= (pinY - hw) && py <= (r.y + r.h + hw) && Math.abs(px - pinX) <= hw;
  }

  /** 点是否落在任一引脚相对该选中区的逃逸走廊内 */
  static pointInAnyPinEscapeCorridor(
    px: number, py: number,
    pinPositions: Point2D[],
    r: WorldHitRect,
    halfWidth: number = 12
  ): boolean {
    for (let i = 0; i < pinPositions.length; i++) {
      const p = pinPositions[i];
      if (DeviceHitGeometry.pointInPinEscapeCorridor(px, py, p.x, p.y, r, halfWidth)) {
        return true;
      }
    }
    return false;
  }

  static segmentIntersectsRect(a: Point2D, b: Point2D, r: WorldHitRect): boolean {
    if (a.x === b.x) {
      const x = a.x;
      if (x < r.x || x > r.x + r.w) {
        return false;
      }
      const yMin = Math.min(a.y, b.y);
      const yMax = Math.max(a.y, b.y);
      return !(yMax < r.y || yMin > r.y + r.h);
    }
    if (a.y === b.y) {
      const y = a.y;
      if (y < r.y || y > r.y + r.h) {
        return false;
      }
      const xMin = Math.min(a.x, b.x);
      const xMax = Math.max(a.x, b.x);
      return !(xMax < r.x || xMin > r.x + r.w);
    }
    // 非正交：采样检测
    const samples = DeviceHitGeometry.sampleSegment(a, b, 10);
    for (let i = 0; i < samples.length; i++) {
      if (DeviceHitGeometry.pointInRect(samples[i].x, samples[i].y, r)) {
        return true;
      }
    }
    return false;
  }

  static pointSegmentDistance(p: Point2D, a: Point2D, b: Point2D): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0 && dy === 0) {
      return Math.hypot(p.x - a.x, p.y - a.y);
    }
    const t = Math.max(0, Math.min(1,
      ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  static sampleSegment(a: Point2D, b: Point2D, step: number): Point2D[] {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) {
      return [{ x: a.x, y: a.y }];
    }
    const n = Math.max(1, Math.ceil(len / Math.max(1, step)));
    const out: Point2D[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    return out;
  }

  static wireCoverage(wire: RouteLine): WirePathCoverage {
    const pts = wire.points;
    let length = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
      if (i > 0) {
        length += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
      }
    }
    if (pts.length === 0) {
      minX = 0;
      minY = 0;
      maxX = 0;
      maxY = 0;
    }
    return {
      netUuid: wire.netUuid,
      pointCount: pts.length,
      points: pts.slice(),
      segmentCount: Math.max(0, pts.length - 1),
      lengthMil: Math.round(length),
      bbox: {
        x: minX, y: minY, w: maxX - minX, h: maxY - minY,
        refName: '', instUuid: '', libDevId: ''
      }
    };
  }

  static formatHitRect(r: WorldHitRect): string {
    return `${r.refName || r.instUuid}[${r.libDevId}] 选中区AABB=(${Math.round(r.x)},${Math.round(r.y)},` +
      `${Math.round(r.w)}×${Math.round(r.h)})`;
  }

  static formatWireCoverage(c: WirePathCoverage, maxPts: number = 12): string {
    const show = c.points.slice(0, maxPts)
      .map(p => `(${Math.round(p.x)},${Math.round(p.y)})`)
      .join('→');
    const more = c.points.length > maxPts ? `…(+${c.points.length - maxPts})` : '';
    return `net=${c.netUuid} segs=${c.segmentCount} len=${c.lengthMil}mil ` +
      `bbox=(${Math.round(c.bbox.x)},${Math.round(c.bbox.y)},${Math.round(c.bbox.w)}×${Math.round(c.bbox.h)}) ` +
      `path=${show}${more}`;
  }
}
