/**
 * WAR = Wire Auto Router（Proteus ISIS 原理图导线自动路径器）
 * 仅用于原理图正交连线，≠ ARES PCB 布线。
 *
 * 入口：previewWirePath — 动态预览；落线必须复用 Path Buffer，禁止二次寻路。
 * 约束：强制正交；用户 Waypoint 刚性锚点；选中区/既有导线为硬障碍（不可穿越）。
 */
import { Point2D } from '../types/CommonTypes';
import { DeviceHitGeometry, WorldHitRect, FOREIGN_PIN_CLEARANCE } from './DeviceHitGeometry';
import { MainThreadYield } from './MainThreadYield';

/** WAR 预览 / 落线路径结果（与编辑器 ISchematicEditor 对齐） */
export interface WirePathPreviewResult {
  points: Point2D[];
  /** true=已自动寻路避让（相对默认 L 有改道） */
  autoCorrected: boolean;
  /**
   * true=无合法无碰撞路径（不可落线）。
   * 穿选中区时必须 blocked，禁止返回穿障折线。
   */
  blocked?: boolean;
}

/** 器件选中区障碍（紧凑 WIRE_OBSTACLE_PAD 禁行矩形 + 引脚逃逸走廊） */
export interface WarCompObstacle {
  id: string;
  hitRect: WorldHitRect;
  /** 全部引脚世界坐标（同器件邻脚作硬障碍，禁止走廊串脚） */
  pinWorlds: Point2D[];
  /**
   * 本段允许逃逸的引脚（通常仅起点/终点脚）。
   * 空数组 = 不允许穿该器件障碍区（异器件或同器件无目标脚）。
   */
  escapePinWorlds: Point2D[];
}

export interface WarRouteContext {
  gridSize: number;
  warEnabled: boolean;
  obstacles: WarCompObstacle[];
  /** 仅起点/终点器件：允许沿引脚逃逸走廊进出，禁止穿体 */
  excludeCompIds: string[];
  foreignPins: Point2D[];
  /** 既有导线：硬障碍（不可穿越），非软代价 */
  existingWires: Point2D[][];
  /**
   * 路径端点允许落到既有铜皮上做 T 接（Proteus：线/脚可接导线任意点）。
   * 中段仍禁止贴铜穿越。
   */
  wireJoinPoints: Point2D[];
  /**
   * 动态预览：禁止 A*（主线程会卡死），仅 L / U 形；落线时关闭。
   */
  previewLite: boolean;
}

interface WarNode {
  gx: number;
  gy: number;
  g: number;
  f: number;
  parent: WarNode | null;
  /** 进入本格时的方向：0=E 1=W 2=S 3=N -1=起点 */
  dir: number;
}

export class WireAutoRouter {
  /**
   * 同步 A* 步数上限。再大时单段可占满主线程触发 THREAD_BLOCK_3S/6S；
   * AI/WAR 生产路径请用 previewWirePathAsync（步内 yield）。
   */
  private static readonly MAX_STEPS: number = 640;
  /** 异步 A* 可搜更远，靠 yield 喂 watchdog */
  private static readonly MAX_STEPS_ASYNC: number = 1600;
  /** open 表过大时提前放弃，避免 O(n²) 选最小 f 卡死 */
  private static readonly MAX_OPEN: number = 1200;
  /** 同步 A* 墙钟上限（ms）— 超时即放弃，避免单次 uv_timer 内卡死 */
  private static readonly ASTAR_WALL_MS: number = 60;
  /** 异步 A* 每 N 步让出主线程 */
  private static readonly ASTAR_YIELD_EVERY: number = 24;
  /** 转角惩罚 K：拐点优先于长度（原理图美观） */
  private static readonly TURN_COST_K: number = 12;
  /** 禁行矩形相对选中区再外扩的安全间隙（网格倍数） */
  private static readonly SAFETY_GRID: number = 0.5;
  /** 既有导线硬禁行半宽 */
  private static readonly WIRE_HARD_HALF: number = 0.55;
  /**
   * 引脚引出：拐弯须在障碍外缘之外再留的净空（网格倍数）。
   * 过小则拐点贴器件黑框边缘，看不清接的哪只脚。
   */
  private static readonly PIN_LEAD_EXTRA_GRID: number = 2.5;
  private static readonly PIN_LEAD_EXTRA_MIN: number = 24;

  /**
   * WAR 预览入口。失败时 points 为空（不可落线），绝不返回穿障路径。
   */
  static previewWirePath(waypoints: Point2D[], ctx: WarRouteContext): WirePathPreviewResult {
    const fail: WirePathPreviewResult = {
      points: [],
      autoCorrected: false,
      blocked: true
    };
    if (waypoints.length < 2) {
      return fail;
    }
    const anchors = WireAutoRouter.snapAnchors(waypoints, ctx.gridSize);
    if (anchors.length < 2) {
      return fail;
    }

    // 人工拐点不得落在异器件选中区内
    if (!WireAutoRouter.anchorsOutsideForeignHits(anchors, ctx)) {
      return fail;
    }

    let autoCorrected = false;
    const out: Point2D[] = [];
    out.push({ x: anchors[0].x, y: anchors[0].y });

    for (let i = 0; i < anchors.length - 1; i++) {
      const a = anchors[i];
      const b = anchors[i + 1];
      const seg = WireAutoRouter.routeSegment(a, b, ctx);
      if (seg.blocked || seg.points.length < 2) {
        return fail;
      }
      if (seg.autoCorrected) {
        autoCorrected = true;
      }
      if (!WireAutoRouter.pathHardClear(seg.points, ctx)) {
        return fail;
      }
      for (let j = 1; j < seg.points.length; j++) {
        out.push({ x: seg.points[j].x, y: seg.points[j].y });
      }
    }

    // 端点对齐用户真实引脚坐标，并保证正交 + 不穿障
    const sealed = WireAutoRouter.sealEndpoints(out, waypoints[0], waypoints[waypoints.length - 1], ctx);
    if (sealed === null || sealed.length < 2) {
      return fail;
    }
    if (!WireAutoRouter.pathHardClear(sealed, ctx)) {
      return fail;
    }
    if (!WireAutoRouter.isFullyOrthogonal(sealed)) {
      return fail;
    }

    // 引脚先沿逃逸边引出，避免拐点贴在器件黑框边缘
    let routed = WireAutoRouter.ensurePinLeadOut(sealed, ctx);
    if (routed === null) {
      routed = sealed;
    }

    const simplified = WireAutoRouter.simplifyCollinear(routed);
    // 简化后再次硬校验（防共线合并改变几何）
    if (!WireAutoRouter.pathHardClear(simplified, ctx)) {
      return fail;
    }

    const ok: WirePathPreviewResult = {
      points: simplified,
      autoCorrected: autoCorrected,
      blocked: false
    };
    return ok;
  }

  /**
   * AI/WAR 落线入口：段内 A* 协作让出，避免 THREAD_BLOCK_3S/6S。
   * UI 动态预览仍用 previewWirePath（previewLite / 短墙钟）。
   */
  static async previewWirePathAsync(
    waypoints: Point2D[], ctx: WarRouteContext
  ): Promise<WirePathPreviewResult> {
    const fail: WirePathPreviewResult = {
      points: [],
      autoCorrected: false,
      blocked: true
    };
    if (waypoints.length < 2) {
      return fail;
    }
    const anchors = WireAutoRouter.snapAnchors(waypoints, ctx.gridSize);
    if (anchors.length < 2) {
      return fail;
    }
    if (!WireAutoRouter.anchorsOutsideForeignHits(anchors, ctx)) {
      return fail;
    }

    let autoCorrected = false;
    const out: Point2D[] = [];
    out.push({ x: anchors[0].x, y: anchors[0].y });

    for (let i = 0; i < anchors.length - 1; i++) {
      if (i > 0) {
        await MainThreadYield.yield();
      }
      const a = anchors[i];
      const b = anchors[i + 1];
      const seg = await WireAutoRouter.routeSegmentAsync(a, b, ctx);
      if (seg.blocked || seg.points.length < 2) {
        return fail;
      }
      if (seg.autoCorrected) {
        autoCorrected = true;
      }
      if (!WireAutoRouter.pathHardClear(seg.points, ctx)) {
        return fail;
      }
      for (let j = 1; j < seg.points.length; j++) {
        out.push({ x: seg.points[j].x, y: seg.points[j].y });
      }
    }

    const sealed = WireAutoRouter.sealEndpoints(out, waypoints[0], waypoints[waypoints.length - 1], ctx);
    if (sealed === null || sealed.length < 2) {
      return fail;
    }
    if (!WireAutoRouter.pathHardClear(sealed, ctx)) {
      return fail;
    }
    if (!WireAutoRouter.isFullyOrthogonal(sealed)) {
      return fail;
    }

    let routed = WireAutoRouter.ensurePinLeadOut(sealed, ctx);
    if (routed === null) {
      routed = sealed;
    }

    const simplified = WireAutoRouter.simplifyCollinear(routed);
    if (!WireAutoRouter.pathHardClear(simplified, ctx)) {
      return fail;
    }

    const ok: WirePathPreviewResult = {
      points: simplified,
      autoCorrected: autoCorrected,
      blocked: false
    };
    return ok;
  }

  /** 仅校验已有路径是否仍无碰撞（落线缓存复用，不重寻路） */
  static validateCachedPath(points: Point2D[], ctx: WarRouteContext): boolean {
    if (points.length < 2) {
      return false;
    }
    if (!WireAutoRouter.isFullyOrthogonal(points)) {
      return false;
    }
    return WireAutoRouter.pathHardClear(points, ctx);
  }

  private static snapAnchors(waypoints: Point2D[], g: number): Point2D[] {
    const out: Point2D[] = [];
    for (let i = 0; i < waypoints.length; i++) {
      const isEnd = i === 0 || i === waypoints.length - 1;
      let p: Point2D;
      if (isEnd) {
        p = { x: waypoints[i].x, y: waypoints[i].y };
      } else {
        p = {
          x: Math.round(waypoints[i].x / g) * g,
          y: Math.round(waypoints[i].y / g) * g
        };
      }
      if (out.length > 0) {
        const last = out[out.length - 1];
        if (Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) {
          continue;
        }
      }
      out.push(p);
    }
    return out;
  }

  private static anchorsOutsideForeignHits(anchors: Point2D[], ctx: WarRouteContext): boolean {
    const exclude = WireAutoRouter.excludeSet(ctx);
    const pinClear = FOREIGN_PIN_CLEARANCE;
    // 中间人工拐点
    for (let i = 1; i < anchors.length - 1; i++) {
      const p = anchors[i];
      for (let oi = 0; oi < ctx.obstacles.length; oi++) {
        const obs = ctx.obstacles[oi];
        if (exclude.has(obs.id)) {
          continue;
        }
        const banned = WireAutoRouter.expandHit(obs.hitRect, ctx.gridSize);
        if (DeviceHitGeometry.pointInRect(p.x, p.y, banned)) {
          return false;
        }
      }
      for (let fi = 0; fi < ctx.foreignPins.length; fi++) {
        const fp = ctx.foreignPins[fi];
        if (Math.hypot(p.x - fp.x, p.y - fp.y) < pinClear) {
          return false;
        }
      }
    }
    return true;
  }

  private static routeSegment(from: Point2D, to: Point2D, ctx: WarRouteContext):
    WirePathPreviewResult {
    const fail: WirePathPreviewResult = { points: [], autoCorrected: false, blocked: true };
    const midH: Point2D = { x: to.x, y: from.y };
    const midV: Point2D = { x: from.x, y: to.y };
    const pathH: Point2D[] = WireAutoRouter.dedupe([from, midH, to]);
    const pathV: Point2D[] = WireAutoRouter.dedupe([from, midV, to]);

    const clearH = WireAutoRouter.pathHardClear(pathH, ctx);
    const clearV = WireAutoRouter.pathHardClear(pathV, ctx);

    if (clearH || clearV) {
      let chosen = pathH;
      if (clearH && clearV) {
        // 优先：首/末段沿引脚逃逸边走出器件，再比拐点与长度
        const scoreH = WireAutoRouter.escapeAlignScore(pathH, from, to, ctx);
        const scoreV = WireAutoRouter.escapeAlignScore(pathV, from, to, ctx);
        if (scoreV > scoreH + 0.5) {
          chosen = pathV;
        } else if (scoreH > scoreV + 0.5) {
          chosen = pathH;
        } else {
          const turnsH = WireAutoRouter.countTurns(pathH);
          const turnsV = WireAutoRouter.countTurns(pathV);
          if (turnsV < turnsH) {
            chosen = pathV;
          } else if (turnsH < turnsV) {
            chosen = pathH;
          } else {
            chosen = WireAutoRouter.pathLength(pathV) < WireAutoRouter.pathLength(pathH)
              ? pathV : pathH;
          }
        }
      } else if (clearV) {
        chosen = pathV;
      }
      const ok: WirePathPreviewResult = {
        points: chosen,
        autoCorrected: false,
        blocked: false
      };
      return ok;
    }

    if (!ctx.warEnabled) {
      // WAR 关闭：不自动绕障；穿障则失败
      return fail;
    }

    // 预览轻量模式：禁止 A*（模拟器上 open 线性扫描可卡主线程数秒）
    if (ctx.previewLite) {
      const gLite = Math.max(1, ctx.gridSize);
      const marginsLite = [gLite * 3, gLite * 5, gLite * 8];
      for (let mi = 0; mi < marginsLite.length; mi++) {
        const margin = marginsLite[mi];
        const detours: Point2D[][] = [
          [from, { x: from.x, y: from.y - margin }, { x: to.x, y: from.y - margin }, to],
          [from, { x: from.x, y: from.y + margin }, { x: to.x, y: from.y + margin }, to],
          [from, { x: from.x - margin, y: from.y }, { x: from.x - margin, y: to.y }, to],
          [from, { x: from.x + margin, y: from.y }, { x: from.x + margin, y: to.y }, to]
        ];
        for (let di = 0; di < detours.length; di++) {
          const d = WireAutoRouter.dedupe(detours[di]);
          if (WireAutoRouter.pathHardClear(d, ctx) && WireAutoRouter.isFullyOrthogonal(d)) {
            const u: WirePathPreviewResult = {
              points: d,
              autoCorrected: true,
              blocked: false
            };
            return u;
          }
        }
      }
      return fail;
    }

    const astar = WireAutoRouter.astarRectilinear(from, to, ctx);
    if (astar.length >= 2 && WireAutoRouter.pathHardClear(astar, ctx)) {
      const found: WirePathPreviewResult = {
        points: astar,
        autoCorrected: true,
        blocked: false
      };
      return found;
    }

    // U 形尝试（仍须硬清空）；margin 加大以绕开同侧邻脚/既有长线
    const g = Math.max(1, ctx.gridSize);
    const margins = [g * 3, g * 5, g * 8, g * 12, g * 16, g * 20];
    for (let mi = 0; mi < margins.length; mi++) {
      const margin = margins[mi];
      const detours: Point2D[][] = [
        [from, { x: from.x, y: from.y - margin }, { x: to.x, y: from.y - margin }, to],
        [from, { x: from.x, y: from.y + margin }, { x: to.x, y: from.y + margin }, to],
        [from, { x: from.x - margin, y: from.y }, { x: from.x - margin, y: to.y }, to],
        [from, { x: from.x + margin, y: from.y }, { x: from.x + margin, y: to.y }, to]
      ];
      for (let di = 0; di < detours.length; di++) {
        const d = WireAutoRouter.dedupe(detours[di]);
        if (WireAutoRouter.pathHardClear(d, ctx) && WireAutoRouter.isFullyOrthogonal(d)) {
          const u: WirePathPreviewResult = {
            points: d,
            autoCorrected: true,
            blocked: false
          };
          return u;
        }
      }
    }

    // 按端点器件逃逸边再试（运放 IN+ 须先出体外再折向目标，忌竖穿本体）
    const escapeDetours = WireAutoRouter.buildEscapeDetourCandidates(from, to, ctx, margins);
    for (let di = 0; di < escapeDetours.length; di++) {
      const d = WireAutoRouter.dedupe(escapeDetours[di]);
      if (d.length >= 2 &&
        WireAutoRouter.pathHardClear(d, ctx) &&
        WireAutoRouter.isFullyOrthogonal(d)) {
        const u: WirePathPreviewResult = {
          points: d,
          autoCorrected: true,
          blocked: false
        };
        return u;
      }
    }

    // 绝不回退到穿障 L
    return fail;
  }

  /** 异步段路由：A* 步内让出；U/逃逸几何候选与同步版相同 */
  private static async routeSegmentAsync(from: Point2D, to: Point2D, ctx: WarRouteContext):
    Promise<WirePathPreviewResult> {
    const fail: WirePathPreviewResult = { points: [], autoCorrected: false, blocked: true };
    const midH: Point2D = { x: to.x, y: from.y };
    const midV: Point2D = { x: from.x, y: to.y };
    const pathH: Point2D[] = WireAutoRouter.dedupe([from, midH, to]);
    const pathV: Point2D[] = WireAutoRouter.dedupe([from, midV, to]);

    const clearH = WireAutoRouter.pathHardClear(pathH, ctx);
    const clearV = WireAutoRouter.pathHardClear(pathV, ctx);

    if (clearH || clearV) {
      let chosen = pathH;
      if (clearH && clearV) {
        const scoreH = WireAutoRouter.escapeAlignScore(pathH, from, to, ctx);
        const scoreV = WireAutoRouter.escapeAlignScore(pathV, from, to, ctx);
        if (scoreV > scoreH + 0.5) {
          chosen = pathV;
        } else if (scoreH > scoreV + 0.5) {
          chosen = pathH;
        } else {
          const turnsH = WireAutoRouter.countTurns(pathH);
          const turnsV = WireAutoRouter.countTurns(pathV);
          if (turnsV < turnsH) {
            chosen = pathV;
          } else if (turnsH < turnsV) {
            chosen = pathH;
          } else {
            chosen = WireAutoRouter.pathLength(pathV) < WireAutoRouter.pathLength(pathH)
              ? pathV : pathH;
          }
        }
      } else if (clearV) {
        chosen = pathV;
      }
      const ok: WirePathPreviewResult = {
        points: chosen,
        autoCorrected: false,
        blocked: false
      };
      return ok;
    }

    if (!ctx.warEnabled) {
      return fail;
    }

    if (ctx.previewLite) {
      return WireAutoRouter.routeSegment(from, to, ctx);
    }

    const astar = await WireAutoRouter.astarRectilinearAsync(from, to, ctx);
    if (astar.length >= 2 && WireAutoRouter.pathHardClear(astar, ctx)) {
      const found: WirePathPreviewResult = {
        points: astar,
        autoCorrected: true,
        blocked: false
      };
      return found;
    }

    const g = Math.max(1, ctx.gridSize);
    const margins = [g * 3, g * 5, g * 8, g * 12, g * 16, g * 20];
    for (let mi = 0; mi < margins.length; mi++) {
      const margin = margins[mi];
      const detours: Point2D[][] = [
        [from, { x: from.x, y: from.y - margin }, { x: to.x, y: from.y - margin }, to],
        [from, { x: from.x, y: from.y + margin }, { x: to.x, y: from.y + margin }, to],
        [from, { x: from.x - margin, y: from.y }, { x: from.x - margin, y: to.y }, to],
        [from, { x: from.x + margin, y: from.y }, { x: from.x + margin, y: to.y }, to]
      ];
      for (let di = 0; di < detours.length; di++) {
        const d = WireAutoRouter.dedupe(detours[di]);
        if (WireAutoRouter.pathHardClear(d, ctx) && WireAutoRouter.isFullyOrthogonal(d)) {
          const u: WirePathPreviewResult = {
            points: d,
            autoCorrected: true,
            blocked: false
          };
          return u;
        }
      }
    }

    const escapeDetours = WireAutoRouter.buildEscapeDetourCandidates(from, to, ctx, margins);
    for (let di = 0; di < escapeDetours.length; di++) {
      if ((di & 3) === 3) {
        await MainThreadYield.yield();
      }
      const d = WireAutoRouter.dedupe(escapeDetours[di]);
      if (d.length >= 2 &&
        WireAutoRouter.pathHardClear(d, ctx) &&
        WireAutoRouter.isFullyOrthogonal(d)) {
        const u: WirePathPreviewResult = {
          points: d,
          autoCorrected: true,
          blocked: false
        };
        return u;
      }
    }

    return fail;
  }

  /**
   * 按端点障碍的 nearestEscapeEdge 生成绕障折线候选。
   * 公开供冒烟/单测；生产由 routeSegment 在 U 形失败后调用。
   */
  static buildEscapeDetourCandidates(
    from: Point2D, to: Point2D, ctx: WarRouteContext, margins?: number[]
  ): Point2D[][] {
    const g = Math.max(1, ctx.gridSize);
    const ms = margins && margins.length > 0
      ? margins
      : [g * 3, g * 5, g * 8, g * 12, g * 16, g * 20];
    const fromObs = WireAutoRouter.findExcludeObstacleAt(from, ctx);
    const toObs = WireAutoRouter.findExcludeObstacleAt(to, ctx);
    const fromEdge = fromObs
      ? DeviceHitGeometry.nearestEscapeEdge(from.x, from.y, fromObs.hitRect)
      : WireAutoRouter.guessEscapeByDelta(from, to);
    const toEdge = toObs
      ? DeviceHitGeometry.nearestEscapeEdge(to.x, to.y, toObs.hitRect)
      : WireAutoRouter.guessEscapeByDelta(to, from);
    const out: Point2D[][] = [];
    for (let mi = 0; mi < ms.length; mi++) {
      const m = ms[mi];
      const aEsc = fromObs !== null
        ? WireAutoRouter.escapeExitBeyondObstacle(from, fromEdge, fromObs, ctx, m)
        : WireAutoRouter.offsetByEdge(from, fromEdge, m);
      const bEsc = toObs !== null
        ? WireAutoRouter.escapeExitBeyondObstacle(to, toEdge, toObs, ctx, m)
        : WireAutoRouter.offsetByEdge(to, toEdge, m);
      out.push([from, aEsc, { x: aEsc.x, y: bEsc.y }, bEsc, to]);
      out.push([from, aEsc, { x: bEsc.x, y: aEsc.y }, bEsc, to]);
      out.push([from, aEsc, { x: aEsc.x, y: to.y }, to]);
      out.push([from, { x: from.x, y: bEsc.y }, bEsc, to]);
    }
    return out;
  }

  /** 引出点：至少离开障碍外缘 extra，且不少于 margin */
  private static escapeExitBeyondObstacle(
    pin: Point2D, edge: string, obs: WarCompObstacle, ctx: WarRouteContext, margin: number
  ): Point2D {
    const banned = WireAutoRouter.expandHit(obs.hitRect, ctx.gridSize);
    const g = Math.max(1, ctx.gridSize);
    const extra = Math.max(margin, g * WireAutoRouter.PIN_LEAD_EXTRA_GRID,
      WireAutoRouter.PIN_LEAD_EXTRA_MIN);
    const beyond = WireAutoRouter.computeLeadExit(pin, edge, banned, extra);
    const byMargin = WireAutoRouter.offsetByEdge(pin, edge, margin);
    return WireAutoRouter.fartherAlongEdge(pin, edge, beyond, byMargin);
  }

  private static fartherAlongEdge(
    pin: Point2D, edge: string, a: Point2D, b: Point2D
  ): Point2D {
    if (edge === 'L') {
      return a.x <= b.x ? a : b;
    }
    if (edge === 'R') {
      return a.x >= b.x ? a : b;
    }
    if (edge === 'T') {
      return a.y <= b.y ? a : b;
    }
    return a.y >= b.y ? a : b;
  }

  /**
   * 两端引脚沿逃逸边先引出再拐弯，避免拐点贴在器件框边缘。
   * 失败时返回 null（调用方回退原路径）。
   */
  private static ensurePinLeadOut(path: Point2D[], ctx: WarRouteContext): Point2D[] | null {
    let pts = WireAutoRouter.dedupe(path);
    if (pts.length < 2) {
      return pts;
    }
    const g = Math.max(1, ctx.gridSize);
    const extras: number[] = [
      Math.max(g * WireAutoRouter.PIN_LEAD_EXTRA_GRID, WireAutoRouter.PIN_LEAD_EXTRA_MIN),
      Math.max(g * 2, 20),
      Math.max(g * 1.5, 16)
    ];
    for (let ei = 0; ei < extras.length; ei++) {
      const extra = extras[ei];
      let cur: Point2D[] | null = pts;
      cur = WireAutoRouter.applyLeadAtEnd(cur, true, ctx, extra);
      if (cur === null) {
        continue;
      }
      cur = WireAutoRouter.applyLeadAtEnd(cur, false, ctx, extra);
      if (cur === null) {
        continue;
      }
      const simplified = WireAutoRouter.simplifyCollinear(cur);
      if (WireAutoRouter.isFullyOrthogonal(simplified) &&
        WireAutoRouter.pathHardClear(simplified, ctx)) {
        return simplified;
      }
    }
    return null;
  }

  private static computeLeadExit(
    pin: Point2D, edge: string, banned: WorldHitRect, extra: number
  ): Point2D {
    if (edge === 'L') {
      return { x: Math.min(pin.x, banned.x) - extra, y: pin.y };
    }
    if (edge === 'R') {
      return { x: Math.max(pin.x, banned.x + banned.w) + extra, y: pin.y };
    }
    if (edge === 'T') {
      return { x: pin.x, y: Math.min(pin.y, banned.y) - extra };
    }
    return { x: pin.x, y: Math.max(pin.y, banned.y + banned.h) + extra };
  }

  private static segFollowsEdge(a: Point2D, b: Point2D, edge: string): boolean {
    if (edge === 'L') {
      return b.x < a.x - 0.5 && Math.abs(b.y - a.y) < 0.5;
    }
    if (edge === 'R') {
      return b.x > a.x + 0.5 && Math.abs(b.y - a.y) < 0.5;
    }
    if (edge === 'T') {
      return b.y < a.y - 0.5 && Math.abs(b.x - a.x) < 0.5;
    }
    return b.y > a.y + 0.5 && Math.abs(b.x - a.x) < 0.5;
  }

  private static leadAlreadyEnough(
    pin: Point2D, next: Point2D, exit: Point2D, edge: string
  ): boolean {
    if (!WireAutoRouter.segFollowsEdge(pin, next, edge)) {
      return false;
    }
    if (edge === 'L') {
      return next.x <= exit.x + 0.5;
    }
    if (edge === 'R') {
      return next.x >= exit.x - 0.5;
    }
    if (edge === 'T') {
      return next.y <= exit.y + 0.5;
    }
    return next.y >= exit.y - 0.5;
  }

  private static pointBetweenOnAxis(a: Point2D, b: Point2D, p: Point2D): boolean {
    const colH = Math.abs(a.y - b.y) < 0.5 && Math.abs(p.y - a.y) < 0.5;
    const colV = Math.abs(a.x - b.x) < 0.5 && Math.abs(p.x - a.x) < 0.5;
    if (colH) {
      const lo = Math.min(a.x, b.x) - 0.5;
      const hi = Math.max(a.x, b.x) + 0.5;
      return p.x >= lo && p.x <= hi;
    }
    if (colV) {
      const lo = Math.min(a.y, b.y) - 0.5;
      const hi = Math.max(a.y, b.y) + 0.5;
      return p.y >= lo && p.y <= hi;
    }
    return false;
  }

  /** 路径是否沿端点逃逸边起步/收束（越大越好） */
  private static escapeAlignScore(
    path: Point2D[], from: Point2D, to: Point2D, ctx: WarRouteContext
  ): number {
    if (path.length < 2) {
      return 0;
    }
    let score = 0;
    const fromObs = WireAutoRouter.findExcludeObstacleAt(from, ctx);
    if (fromObs !== null) {
      const edge = DeviceHitGeometry.nearestEscapeEdge(from.x, from.y, fromObs.hitRect);
      if (WireAutoRouter.segFollowsEdge(path[0], path[1], edge)) {
        score += 100;
        const len = Math.hypot(path[1].x - path[0].x, path[1].y - path[0].y);
        score += Math.min(len, 80) * 0.2;
      } else {
        score -= 80;
      }
    }
    const toObs = WireAutoRouter.findExcludeObstacleAt(to, ctx);
    if (toObs !== null && path.length >= 2) {
      const edge = DeviceHitGeometry.nearestEscapeEdge(to.x, to.y, toObs.hitRect);
      const a = path[path.length - 2];
      const b = path[path.length - 1];
      if (WireAutoRouter.segFollowsEdge(b, a, edge) ||
        WireAutoRouter.segFollowsEdge(a, b, edge)) {
        // 末段应指向引脚：从外侧走向 to，即 a→b 的反向才是逃逸
        if (WireAutoRouter.segFollowsEdge(b, a, edge)) {
          score += 100;
        } else {
          score -= 40;
        }
      } else {
        score -= 80;
      }
    }
    score -= WireAutoRouter.countTurns(path) * 5;
    score -= WireAutoRouter.pathLength(path) * 0.01;
    return score;
  }

  private static applyLeadAtEnd(
    pts: Point2D[], atStart: boolean, ctx: WarRouteContext, extra: number
  ): Point2D[] | null {
    if (pts.length < 2) {
      return pts;
    }
    const pin = atStart ? pts[0] : pts[pts.length - 1];
    const neighbor = atStart ? pts[1] : pts[pts.length - 2];
    const obs = WireAutoRouter.findExcludeObstacleAt(pin, ctx);
    if (obs === null) {
      return pts;
    }
    const edge = DeviceHitGeometry.nearestEscapeEdge(pin.x, pin.y, obs.hitRect);
    const banned = WireAutoRouter.expandHit(obs.hitRect, ctx.gridSize);
    const exit = WireAutoRouter.computeLeadExit(pin, edge, banned, extra);
    const g = Math.max(1, ctx.gridSize);
    if (Math.hypot(exit.x - pin.x, exit.y - pin.y) < g * 0.5) {
      return pts;
    }
    if (WireAutoRouter.leadAlreadyEnough(pin, neighbor, exit, edge)) {
      return pts;
    }

    const rest: Point2D[] = [];
    if (atStart) {
      for (let i = 1; i < pts.length; i++) {
        rest.push(pts[i]);
      }
      while (rest.length > 1 && WireAutoRouter.pointBetweenOnAxis(pin, exit, rest[0])) {
        rest.shift();
      }
    } else {
      for (let i = 0; i < pts.length - 1; i++) {
        rest.push(pts[i]);
      }
      while (rest.length > 1 &&
        WireAutoRouter.pointBetweenOnAxis(pin, exit, rest[rest.length - 1])) {
        rest.pop();
      }
    }
    if (rest.length < 1) {
      return null;
    }

    const join = atStart ? rest[0] : rest[rest.length - 1];
    const candidates: Point2D[][] = [];
    if (WireAutoRouter.isOrthogonalSeg(exit, join)) {
      candidates.push([]);
    }
    const cLead: Point2D = (edge === 'L' || edge === 'R')
      ? { x: exit.x, y: join.y }
      : { x: join.x, y: exit.y };
    const cAlt: Point2D = (edge === 'L' || edge === 'R')
      ? { x: join.x, y: exit.y }
      : { x: exit.x, y: join.y };
    candidates.push([cLead]);
    candidates.push([cAlt]);

    for (let ci = 0; ci < candidates.length; ci++) {
      const mid = candidates[ci];
      // 跳过与端点重合的无效拐点
      let midOk = true;
      for (let mi = 0; mi < mid.length; mi++) {
        const m = mid[mi];
        if ((Math.abs(m.x - exit.x) < 0.5 && Math.abs(m.y - exit.y) < 0.5) ||
          (Math.abs(m.x - join.x) < 0.5 && Math.abs(m.y - join.y) < 0.5)) {
          midOk = false;
          break;
        }
      }
      if (!midOk && mid.length > 0) {
        continue;
      }
      let out: Point2D[] = [];
      if (atStart) {
        out.push(pin);
        out.push(exit);
        for (let mi = 0; mi < mid.length; mi++) {
          out.push(mid[mi]);
        }
        for (let ri = 0; ri < rest.length; ri++) {
          out.push(rest[ri]);
        }
      } else {
        for (let ri = 0; ri < rest.length; ri++) {
          out.push(rest[ri]);
        }
        for (let mi = 0; mi < mid.length; mi++) {
          out.push(mid[mi]);
        }
        out.push(exit);
        out.push(pin);
      }
      out = WireAutoRouter.dedupe(out);
      if (WireAutoRouter.isFullyOrthogonal(out)) {
        return out;
      }
    }
    return null;
  }

  private static findExcludeObstacleAt(
    pt: Point2D, ctx: WarRouteContext
  ): WarCompObstacle | null {
    const exclude = WireAutoRouter.excludeSet(ctx);
    for (let i = 0; i < ctx.obstacles.length; i++) {
      const obs = ctx.obstacles[i];
      if (!exclude.has(obs.id)) {
        continue;
      }
      if (DeviceHitGeometry.pointInRect(pt.x, pt.y, obs.hitRect) ||
        DeviceHitGeometry.pointInRect(pt.x, pt.y, WireAutoRouter.expandHit(obs.hitRect, ctx.gridSize))) {
        return obs;
      }
      // 脚在区外边缘：仍归属该端点器件
      for (let ei = 0; ei < obs.escapePinWorlds.length; ei++) {
        const e = obs.escapePinWorlds[ei];
        if (Math.hypot(e.x - pt.x, e.y - pt.y) <= Math.max(ctx.gridSize * 1.2, 12)) {
          return obs;
        }
      }
    }
    return null;
  }

  private static guessEscapeByDelta(from: Point2D, to: Point2D): string {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx >= 0 ? 'R' : 'L';
    }
    return dy >= 0 ? 'B' : 'T';
  }

  private static offsetByEdge(p: Point2D, edge: string, margin: number): Point2D {
    if (edge === 'L') {
      return { x: p.x - margin, y: p.y };
    }
    if (edge === 'R') {
      return { x: p.x + margin, y: p.y };
    }
    if (edge === 'T') {
      return { x: p.x, y: p.y - margin };
    }
    return { x: p.x, y: p.y + margin };
  }

  private static astarRectilinear(from: Point2D, to: Point2D, ctx: WarRouteContext): Point2D[] {
    const g = Math.max(1, ctx.gridSize);
    const sgx = Math.round(from.x / g);
    const sgy = Math.round(from.y / g);
    const egx = Math.round(to.x / g);
    const egy = Math.round(to.y / g);
    if (sgx === egx && sgy === egy) {
      const direct: Point2D[] = [from, to];
      if (WireAutoRouter.pathHardClear(direct, ctx)) {
        return direct;
      }
      return [];
    }

    // 起点/终点格必须可走（引脚在选中区边缘）
    if (WireAutoRouter.cellHardBlocked(sgx * g, sgy * g, ctx, true) &&
      !WireAutoRouter.nearEndpoint(sgx * g, sgy * g, from, to, g)) {
      // still allow start
    }

    const pad = Math.min(36, Math.max(16, Math.ceil(Math.abs(egx - sgx) + Math.abs(egy - sgy)) + 10));
    const minGx = Math.min(sgx, egx) - pad;
    const maxGx = Math.max(sgx, egx) + pad;
    const minGy = Math.min(sgy, egy) - pad;
    const maxGy = Math.max(sgy, egy) + pad;

    const open: WarNode[] = [];
    const openMap = new Map<string, number>();
    const closed = new Set<string>();

    const start: WarNode = {
      gx: sgx, gy: sgy, g: 0,
      f: Math.abs(egx - sgx) + Math.abs(egy - sgy),
      parent: null,
      dir: -1
    };
    open.push(start);
    openMap.set(`${sgx},${sgy}`, 0);

    let steps = 0;
    let found: WarNode | null = null;
    const dirs: number[][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const wallT0 = Date.now();

    while (open.length > 0 && steps < WireAutoRouter.MAX_STEPS) {
      if (open.length > WireAutoRouter.MAX_OPEN) {
        break;
      }
      if (steps > 0 && (steps & 31) === 0 &&
        (Date.now() - wallT0) > WireAutoRouter.ASTAR_WALL_MS) {
        break;
      }
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) {
          bestIdx = i;
        }
      }
      const cur = open[bestIdx];
      openMap.delete(`${cur.gx},${cur.gy}`);
      if (bestIdx === open.length - 1) {
        open.pop();
      } else {
        const moved = open[open.length - 1];
        open[bestIdx] = moved;
        open.pop();
        openMap.set(`${moved.gx},${moved.gy}`, bestIdx);
      }

      const ckey = `${cur.gx},${cur.gy}`;
      if (closed.has(ckey)) {
        continue;
      }
      closed.add(ckey);
      steps++;

      if (cur.gx === egx && cur.gy === egy) {
        found = cur;
        break;
      }

      for (let di = 0; di < 4; di++) {
        const ngx = cur.gx + dirs[di][0];
        const ngy = cur.gy + dirs[di][1];
        if (ngx < minGx || ngx > maxGx || ngy < minGy || ngy > maxGy) {
          continue;
        }
        const nkey = `${ngx},${ngy}`;
        if (closed.has(nkey)) {
          continue;
        }
        const wx = ngx * g;
        const wy = ngy * g;
        const isGoal = ngx === egx && ngy === egy;
        const isStart = ngx === sgx && ngy === sgy;
        if (!isStart && !isGoal && WireAutoRouter.cellHardBlocked(wx, wy, ctx, false)) {
          continue;
        }
        if ((isStart || isGoal) && WireAutoRouter.cellHardBlocked(wx, wy, ctx, true)) {
          // 端点格：仅当完全不可达（非走廊且非端点邻域）才拒
          if (!WireAutoRouter.nearEndpoint(wx, wy, from, to, g)) {
            continue;
          }
        }

        const fromW: Point2D = { x: cur.gx * g, y: cur.gy * g };
        const toW: Point2D = { x: wx, y: wy };
        if (!WireAutoRouter.segmentHardClear(fromW, toW, ctx)) {
          continue;
        }

        let stepCost = 1;
        if (cur.dir >= 0 && cur.dir !== di) {
          stepCost += WireAutoRouter.TURN_COST_K;
        }

        const tentativeG = cur.g + stepCost;
        const existingIdx = openMap.get(nkey);
        if (existingIdx !== undefined && existingIdx < open.length &&
          open[existingIdx].gx === ngx && open[existingIdx].gy === ngy &&
          open[existingIdx].g <= tentativeG) {
          continue;
        }

        const h = Math.abs(egx - ngx) + Math.abs(egy - ngy);
        const node: WarNode = {
          gx: ngx, gy: ngy, g: tentativeG, f: tentativeG + h,
          parent: cur, dir: di
        };
        if (existingIdx !== undefined && existingIdx < open.length &&
          open[existingIdx].gx === ngx && open[existingIdx].gy === ngy) {
          open[existingIdx] = node;
        } else {
          openMap.set(nkey, open.length);
          open.push(node);
        }
      }
    }

    if (found === null) {
      return [];
    }

    const gridPath: Point2D[] = [];
    let walk: WarNode | null = found;
    while (walk !== null) {
      gridPath.push({ x: walk.gx * g, y: walk.gy * g });
      walk = walk.parent;
    }
    gridPath.reverse();
    if (gridPath.length === 0) {
      return [];
    }
    const sealed = WireAutoRouter.sealEndpoints(gridPath, from, to, ctx);
    return sealed !== null ? sealed : [];
  }

  /** 异步正交 A*：步内 yield，供 AI WAR 落线 */
  private static async astarRectilinearAsync(
    from: Point2D, to: Point2D, ctx: WarRouteContext
  ): Promise<Point2D[]> {
    const g = Math.max(1, ctx.gridSize);
    const sgx = Math.round(from.x / g);
    const sgy = Math.round(from.y / g);
    const egx = Math.round(to.x / g);
    const egy = Math.round(to.y / g);
    if (sgx === egx && sgy === egy) {
      const direct: Point2D[] = [from, to];
      if (WireAutoRouter.pathHardClear(direct, ctx)) {
        return direct;
      }
      return [];
    }

    const pad = Math.min(36, Math.max(16, Math.ceil(Math.abs(egx - sgx) + Math.abs(egy - sgy)) + 10));
    const minGx = Math.min(sgx, egx) - pad;
    const maxGx = Math.max(sgx, egx) + pad;
    const minGy = Math.min(sgy, egy) - pad;
    const maxGy = Math.max(sgy, egy) + pad;

    const open: WarNode[] = [];
    const openMap = new Map<string, number>();
    const closed = new Set<string>();

    const start: WarNode = {
      gx: sgx, gy: sgy, g: 0,
      f: Math.abs(egx - sgx) + Math.abs(egy - sgy),
      parent: null,
      dir: -1
    };
    open.push(start);
    openMap.set(`${sgx},${sgy}`, 0);

    let steps = 0;
    let found: WarNode | null = null;
    const dirs: number[][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    while (open.length > 0 && steps < WireAutoRouter.MAX_STEPS_ASYNC) {
      if (open.length > WireAutoRouter.MAX_OPEN) {
        break;
      }
      if (steps > 0 && steps % WireAutoRouter.ASTAR_YIELD_EVERY === 0) {
        await MainThreadYield.yield();
      }
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) {
          bestIdx = i;
        }
      }
      const cur = open[bestIdx];
      openMap.delete(`${cur.gx},${cur.gy}`);
      if (bestIdx === open.length - 1) {
        open.pop();
      } else {
        const moved = open[open.length - 1];
        open[bestIdx] = moved;
        open.pop();
        openMap.set(`${moved.gx},${moved.gy}`, bestIdx);
      }

      const ckey = `${cur.gx},${cur.gy}`;
      if (closed.has(ckey)) {
        continue;
      }
      closed.add(ckey);
      steps++;

      if (cur.gx === egx && cur.gy === egy) {
        found = cur;
        break;
      }

      for (let di = 0; di < 4; di++) {
        const ngx = cur.gx + dirs[di][0];
        const ngy = cur.gy + dirs[di][1];
        if (ngx < minGx || ngx > maxGx || ngy < minGy || ngy > maxGy) {
          continue;
        }
        const nkey = `${ngx},${ngy}`;
        if (closed.has(nkey)) {
          continue;
        }
        const wx = ngx * g;
        const wy = ngy * g;
        const isGoal = ngx === egx && ngy === egy;
        const isStart = ngx === sgx && ngy === sgy;
        if (!isStart && !isGoal && WireAutoRouter.cellHardBlocked(wx, wy, ctx, false)) {
          continue;
        }
        if ((isStart || isGoal) && WireAutoRouter.cellHardBlocked(wx, wy, ctx, true)) {
          if (!WireAutoRouter.nearEndpoint(wx, wy, from, to, g)) {
            continue;
          }
        }

        const fromW: Point2D = { x: cur.gx * g, y: cur.gy * g };
        const toW: Point2D = { x: wx, y: wy };
        if (!WireAutoRouter.segmentHardClear(fromW, toW, ctx)) {
          continue;
        }

        let stepCost = 1;
        if (cur.dir >= 0 && cur.dir !== di) {
          stepCost += WireAutoRouter.TURN_COST_K;
        }

        const tentativeG = cur.g + stepCost;
        const existingIdx = openMap.get(nkey);
        if (existingIdx !== undefined && existingIdx < open.length &&
          open[existingIdx].gx === ngx && open[existingIdx].gy === ngy &&
          open[existingIdx].g <= tentativeG) {
          continue;
        }

        const h = Math.abs(egx - ngx) + Math.abs(egy - ngy);
        const node: WarNode = {
          gx: ngx, gy: ngy, g: tentativeG, f: tentativeG + h,
          parent: cur, dir: di
        };
        if (existingIdx !== undefined && existingIdx < open.length &&
          open[existingIdx].gx === ngx && open[existingIdx].gy === ngy) {
          open[existingIdx] = node;
        } else {
          openMap.set(nkey, open.length);
          open.push(node);
        }
      }
    }

    if (found === null) {
      return [];
    }

    const gridPath: Point2D[] = [];
    let walk: WarNode | null = found;
    while (walk !== null) {
      gridPath.push({ x: walk.gx * g, y: walk.gy * g });
      walk = walk.parent;
    }
    gridPath.reverse();
    if (gridPath.length === 0) {
      return [];
    }
    const sealed = WireAutoRouter.sealEndpoints(gridPath, from, to, ctx);
    return sealed !== null ? sealed : [];
  }

  private static nearEndpoint(wx: number, wy: number, from: Point2D, to: Point2D, g: number): boolean {
    const r = g * 1.1;
    return Math.hypot(wx - from.x, wy - from.y) <= r ||
      Math.hypot(wx - to.x, wy - to.y) <= r;
  }

  /**
   * 端点对齐真实引脚：保证正交，且不得穿选中区。
   */
  private static sealEndpoints(
    path: Point2D[], from: Point2D, to: Point2D, ctx: WarRouteContext
  ): Point2D[] | null {
    if (path.length < 1) {
      return null;
    }
    const pts: Point2D[] = [];
    for (let i = 0; i < path.length; i++) {
      pts.push({ x: path[i].x, y: path[i].y });
    }
    pts[0] = { x: from.x, y: from.y };
    pts[pts.length - 1] = { x: to.x, y: to.y };

    // 首段不正交：插入网格对齐拐点
    if (pts.length >= 2 && !WireAutoRouter.isOrthogonalSeg(pts[0], pts[1])) {
      const mid: Point2D = { x: pts[1].x, y: pts[0].y };
      pts.splice(1, 0, mid);
    }
    if (pts.length >= 2 &&
      !WireAutoRouter.isOrthogonalSeg(pts[pts.length - 2], pts[pts.length - 1])) {
      const a = pts[pts.length - 2];
      const b = pts[pts.length - 1];
      const mid: Point2D = { x: b.x, y: a.y };
      pts.splice(pts.length - 1, 0, mid);
    }

    const deduped = WireAutoRouter.dedupe(pts);
    if (!WireAutoRouter.isFullyOrthogonal(deduped)) {
      return null;
    }
    if (!WireAutoRouter.pathHardClear(deduped, ctx)) {
      return null;
    }
    return deduped;
  }

  private static excludeSet(ctx: WarRouteContext): Set<string> {
    const s = new Set<string>();
    for (let i = 0; i < ctx.excludeCompIds.length; i++) {
      s.add(ctx.excludeCompIds[i]);
    }
    return s;
  }

  private static expandHit(r: WorldHitRect, gridSize: number): WorldHitRect {
    const pad = Math.max(1, gridSize * WireAutoRouter.SAFETY_GRID);
    const out: WorldHitRect = {
      x: r.x - pad,
      y: r.y - pad,
      w: r.w + pad * 2,
      h: r.h + pad * 2,
      refName: r.refName,
      instUuid: r.instUuid,
      libDevId: r.libDevId
    };
    return out;
  }

  /** 端点器件仅允许目标脚走廊；邻脚半宽内一律硬阻挡（防 OUT 走廊串到 GND） */
  private static escapePinsOf(obs: WarCompObstacle): Point2D[] {
    return obs.escapePinWorlds;
  }

  private static nearSiblingPinNotEscape(
    wx: number, wy: number, obs: WarCompObstacle, ctx: WarRouteContext
  ): boolean {
    const escape = WireAutoRouter.escapePinsOf(obs);
    // 与 FOREIGN_PIN_CLEARANCE 对齐：邻脚 20mil 内硬挡（旧 clearR≈9 仍会贴脚而过）
    const clearR = Math.max(FOREIGN_PIN_CLEARANCE, ctx.gridSize * 0.9);
    for (let pi = 0; pi < obs.pinWorlds.length; pi++) {
      const p = obs.pinWorlds[pi];
      if (Math.hypot(wx - p.x, wy - p.y) > clearR) {
        continue;
      }
      let isEscape = false;
      for (let ei = 0; ei < escape.length; ei++) {
        const e = escape[ei];
        if (Math.hypot(p.x - e.x, p.y - e.y) <= 1.5) {
          isEscape = true;
          break;
        }
      }
      if (!isEscape) {
        return true;
      }
    }
    return false;
  }

  /**
   * 格点硬阻挡。endpointLoose=true：端点格允许落在逃逸走廊/引脚邻域。
   */
  private static cellHardBlocked(
    wx: number, wy: number, ctx: WarRouteContext, endpointLoose: boolean
  ): boolean {
    const exclude = WireAutoRouter.excludeSet(ctx);
    const hw = Math.max(ctx.gridSize, 10);

    for (let i = 0; i < ctx.obstacles.length; i++) {
      const obs = ctx.obstacles[i];
      if (exclude.has(obs.id)) {
        // 邻脚硬阻挡：不依赖是否落在选中区（OUT 水平线可在区外仍压过 GND）
        if (WireAutoRouter.nearSiblingPinNotEscape(wx, wy, obs, ctx)) {
          return true;
        }
      }
      const banned = WireAutoRouter.expandHit(obs.hitRect, ctx.gridSize);
      if (!DeviceHitGeometry.pointInRect(wx, wy, banned)) {
        continue;
      }
      if (exclude.has(obs.id)) {
        // 安全间隙环（扩展区但不在原选中区）可走
        if (!DeviceHitGeometry.pointInRect(wx, wy, obs.hitRect)) {
          continue;
        }
        const escape = WireAutoRouter.escapePinsOf(obs);
        // 仅「本段目标脚」逃逸走廊可走；禁止 all-pins 走廊串脚
        if (escape.length > 0 && DeviceHitGeometry.pointInAnyPinEscapeCorridor(
          wx, wy, escape, obs.hitRect, hw)) {
          continue;
        }
        if (endpointLoose) {
          let nearPin = false;
          for (let pi = 0; pi < escape.length; pi++) {
            const p = escape[pi];
            if (Math.hypot(wx - p.x, wy - p.y) <= ctx.gridSize * 1.2) {
              nearPin = true;
              break;
            }
          }
          if (nearPin) {
            continue;
          }
        }
        return true;
      }
      return true;
    }

    // 既有导线硬障碍（路径端点 T 接豁免）
    const half = ctx.gridSize * WireAutoRouter.WIRE_HARD_HALF;
    for (let wi = 0; wi < ctx.existingWires.length; wi++) {
      const poly = ctx.existingWires[wi];
      for (let si = 0; si < poly.length - 1; si++) {
        const d = DeviceHitGeometry.pointSegmentDistance(
          { x: wx, y: wy }, poly[si], poly[si + 1]);
        if (d < half) {
          if (WireAutoRouter.isWireJoinPoint(wx, wy, ctx)) {
            continue;
          }
          return true;
        }
      }
    }

    // 无关引脚硬禁行（含邻器件脚尖伸出选中区外；端点目标脚不在 foreignPins）
    const pinClear = FOREIGN_PIN_CLEARANCE;
    for (let fi = 0; fi < ctx.foreignPins.length; fi++) {
      const fp = ctx.foreignPins[fi];
      if (Math.hypot(wx - fp.x, wy - fp.y) < pinClear) {
        return true;
      }
    }
    return false;
  }

  /** 是否为允许落到既有导线上的 T 接点（路径端点） */
  private static isWireJoinPoint(wx: number, wy: number, ctx: WarRouteContext): boolean {
    const joins = ctx.wireJoinPoints;
    if (joins === undefined || joins.length === 0) {
      return false;
    }
    const tol = Math.max(ctx.gridSize * 0.85, 8);
    for (let i = 0; i < joins.length; i++) {
      if (Math.hypot(wx - joins[i].x, wy - joins[i].y) <= tol) {
        return true;
      }
    }
    return false;
  }

  private static segmentHardClear(a: Point2D, b: Point2D, ctx: WarRouteContext): boolean {
    const exclude = WireAutoRouter.excludeSet(ctx);
    const hw = Math.max(ctx.gridSize, 10);
    const step = Math.max(2, ctx.gridSize / 2);

    for (let i = 0; i < ctx.obstacles.length; i++) {
      const obs = ctx.obstacles[i];
      const banned = WireAutoRouter.expandHit(obs.hitRect, ctx.gridSize);
      // 端点器件：整段采样，邻脚附近一律禁止（含选中区外）
      if (exclude.has(obs.id)) {
        const samples = DeviceHitGeometry.sampleSegment(a, b, step);
        const escape = WireAutoRouter.escapePinsOf(obs);
        let ok = true;
        for (let si = 0; si < samples.length; si++) {
          const s = samples[si];
          if (WireAutoRouter.nearSiblingPinNotEscape(s.x, s.y, obs, ctx)) {
            ok = false;
            break;
          }
          if (!DeviceHitGeometry.pointInRect(s.x, s.y, banned)) {
            continue;
          }
          // 安全间隙环（在扩展区内但不在原选中区）：可通行
          if (!DeviceHitGeometry.pointInRect(s.x, s.y, obs.hitRect)) {
            continue;
          }
          // 原选中区内：仅目标脚逃逸走廊或贴目标脚
          let pinOk = escape.length > 0 && DeviceHitGeometry.pointInAnyPinEscapeCorridor(
            s.x, s.y, escape, obs.hitRect, hw);
          if (!pinOk) {
            for (let pi = 0; pi < escape.length; pi++) {
              const p = escape[pi];
              if (Math.hypot(s.x - p.x, s.y - p.y) <= ctx.gridSize) {
                pinOk = true;
                break;
              }
            }
          }
          if (!pinOk) {
            ok = false;
            break;
          }
        }
        if (ok) {
          continue;
        }
        return false;
      }
      if (!DeviceHitGeometry.segmentIntersectsRect(a, b, banned)) {
        continue;
      }
      return false;
    }

    // 既有导线：线段不得贴铜穿越（端点共位除外）
    const half = ctx.gridSize * WireAutoRouter.WIRE_HARD_HALF;
    for (let wi = 0; wi < ctx.existingWires.length; wi++) {
      const poly = ctx.existingWires[wi];
      for (let si = 0; si < poly.length - 1; si++) {
        if (WireAutoRouter.segmentsConflict(a, b, poly[si], poly[si + 1], half, ctx)) {
          return false;
        }
      }
    }

    // 无关引脚：中段不得压过/贴近（FOREIGN_PIN_CLEARANCE）；端点邻域豁免
    if (!DeviceHitGeometry.segmentClearsForeignPins(
      a, b, ctx.foreignPins, FOREIGN_PIN_CLEARANCE)) {
      return false;
    }
    return true;
  }

  /** 共线重叠或近距交叉视为冲突（端点相接 / T 接到中段允许） */
  private static segmentsConflict(
    a0: Point2D, a1: Point2D, b0: Point2D, b1: Point2D, half: number,
    ctx?: WarRouteContext
  ): boolean {
    // 端点相接：允许并接
    const eps = half * 1.5;
    const endTouch =
      Math.hypot(a0.x - b0.x, a0.y - b0.y) <= eps ||
      Math.hypot(a0.x - b1.x, a0.y - b1.y) <= eps ||
      Math.hypot(a1.x - b0.x, a1.y - b0.y) <= eps ||
      Math.hypot(a1.x - b1.x, a1.y - b1.y) <= eps;
    if (endTouch) {
      return false;
    }

    // T 接：新线段端点落在既有线段中段上
    const a0OnB = DeviceHitGeometry.pointSegmentDistance(a0, b0, b1) <= half * 1.2;
    const a1OnB = DeviceHitGeometry.pointSegmentDistance(a1, b0, b1) <= half * 1.2;
    const joinTol = half * 1.5;

    // 共线重叠（整段贴铜仍禁止；仅端点 T 接除外）
    if (Math.abs(a0.y - a1.y) < 0.5 && Math.abs(b0.y - b1.y) < 0.5 &&
      Math.abs(a0.y - b0.y) <= half) {
      const aMin = Math.min(a0.x, a1.x);
      const aMax = Math.max(a0.x, a1.x);
      const bMin = Math.min(b0.x, b1.x);
      const bMax = Math.max(b0.x, b1.x);
      if (aMax > bMin + 1 && aMin < bMax - 1) {
        // 短 stub 仅端点落到铜上：不视为整段重叠
        const lenA = Math.abs(aMax - aMin);
        if (!((a0OnB || a1OnB) && lenA <= half * 3)) {
          return true;
        }
      }
    }
    if (Math.abs(a0.x - a1.x) < 0.5 && Math.abs(b0.x - b1.x) < 0.5 &&
      Math.abs(a0.x - b0.x) <= half) {
      const aMin = Math.min(a0.y, a1.y);
      const aMax = Math.max(a0.y, a1.y);
      const bMin = Math.min(b0.y, b1.y);
      const bMax = Math.max(b0.y, b1.y);
      if (aMax > bMin + 1 && aMin < bMax - 1) {
        const lenA = Math.abs(aMax - aMin);
        if (!((a0OnB || a1OnB) && lenA <= half * 3)) {
          return true;
        }
      }
    }

    // 近距：采样；T 接端点邻域豁免
    const samples = DeviceHitGeometry.sampleSegment(a0, a1, Math.max(2, half));
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const d = DeviceHitGeometry.pointSegmentDistance(s, b0, b1);
      if (d < half) {
        const nearA0 = Math.hypot(s.x - a0.x, s.y - a0.y) <= joinTol;
        const nearA1 = Math.hypot(s.x - a1.x, s.y - a1.y) <= joinTol;
        if ((a0OnB && nearA0) || (a1OnB && nearA1)) {
          continue;
        }
        if (ctx !== undefined && WireAutoRouter.isWireJoinPoint(s.x, s.y, ctx)) {
          continue;
        }
        return true;
      }
    }
    return false;
  }

  static pathHardClear(points: Point2D[], ctx: WarRouteContext): boolean {
    for (let i = 0; i < points.length - 1; i++) {
      if (!WireAutoRouter.segmentHardClear(points[i], points[i + 1], ctx)) {
        return false;
      }
    }
    return true;
  }

  private static isOrthogonalSeg(a: Point2D, b: Point2D): boolean {
    return Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5;
  }

  private static isFullyOrthogonal(points: Point2D[]): boolean {
    for (let i = 0; i < points.length - 1; i++) {
      if (!WireAutoRouter.isOrthogonalSeg(points[i], points[i + 1])) {
        return false;
      }
    }
    return true;
  }

  private static countTurns(points: Point2D[]): number {
    if (points.length < 3) {
      return 0;
    }
    let t = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const dx1 = points[i].x - points[i - 1].x;
      const dy1 = points[i].y - points[i - 1].y;
      const dx2 = points[i + 1].x - points[i].x;
      const dy2 = points[i + 1].y - points[i].y;
      if (Math.abs(dx1) > 0.5 && Math.abs(dy2) > 0.5) {
        t++;
      } else if (Math.abs(dy1) > 0.5 && Math.abs(dx2) > 0.5) {
        t++;
      }
    }
    return t;
  }

  private static pathLength(points: Point2D[]): number {
    let len = 0;
    for (let i = 1; i < points.length; i++) {
      len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    return len;
  }

  private static dedupe(points: Point2D[]): Point2D[] {
    if (points.length === 0) {
      return [];
    }
    const out: Point2D[] = [{ x: points[0].x, y: points[0].y }];
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      const last = out[out.length - 1];
      if (Math.abs(p.x - last.x) < 0.5 && Math.abs(p.y - last.y) < 0.5) {
        continue;
      }
      out.push({ x: p.x, y: p.y });
    }
    return out;
  }

  private static simplifyCollinear(points: Point2D[]): Point2D[] {
    const deduped = WireAutoRouter.dedupe(points);
    if (deduped.length <= 2) {
      return deduped;
    }
    const out: Point2D[] = [deduped[0]];
    for (let i = 1; i < deduped.length - 1; i++) {
      const a = out[out.length - 1];
      const b = deduped[i];
      const c = deduped[i + 1];
      const colH = Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5;
      const colV = Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5;
      if (colH || colV) {
        continue;
      }
      out.push(b);
    }
    out.push(deduped[deduped.length - 1]);
    return out;
  }
}
