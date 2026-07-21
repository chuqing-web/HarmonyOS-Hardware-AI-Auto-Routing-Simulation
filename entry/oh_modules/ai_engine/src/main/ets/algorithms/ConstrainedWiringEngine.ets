/**
 * 约束驱动 A* 布线引擎 v2.0 — LLM 优先级 + 本地路径计算
 * 新增: 旋转感知障碍物、导线重叠检测、器件体碰撞后验
 */
import {
  SchTopology, RouteResult, RouteLine, RoutingLlmOutput, RoutingWeightPrefs,
  Point2D, SpecialNetRule, SpacingIssue, DeviceInst, NetLabelInfo, NetNodeRef,
  DeviceHitGeometry, SELECTION_HIT_PAD, FOREIGN_PIN_CLEARANCE, WorldHitRect, Pin,
  WireConflictGeometry, IdUtil, makeRouteLine, Logger, MainThreadYield,
  INSTR_TRACE_TAG, traceAiDiag, traceAiOp
} from 'common';
import { IComponentLibrary } from 'component_library';
import {
  cloneRouteResult, getNetPriorityValue, NetPriorityHint,
  netPriorityMapToRecord
} from '../internal/AiEngineHelpers';
import { PinWorldResolver } from './PinWorldResolver';
import { TemplateSchematicKit } from './TemplateSchematicKit';

interface WiringNode {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: WiringNode | null;
}

interface NetRouteTask {
  netUuid: string;
  netName: string;
  priority: number;
  rules: string[];
  pinPositions: Point2D[];
  isPower: boolean;
  isAnalog: boolean;
  isClock: boolean;
  isDiff: boolean;
}

interface DevBounds {
  x: number; y: number; w: number; h: number;
}

interface WireOverlapIssue {
  netA: string;
  netB: string;
  atPoint: Point2D;
}

interface RouteTaskMetrics {
  cross: number;
  length: number;
}

const DEFAULT_WEIGHTS: RoutingWeightPrefs = {
  lineLength: 1.0,
  crossPenalty: 50,
  analogDigitalIsolate: 80,
  xtalShortPath: 100,
  diffEqualLength: 60
};

export class ConstrainedWiringEngine {
  private gridSize: number = 10;
  private readonly MIN_WIRE_GAP: number = 10; // 最小平行导线间距 (mil)
  /** A* 单段最大扩展步数；失败则走捷径并交由 routeUntilClean 降级标号 */
  private readonly ASTAR_MAX_STEPS: number = 500;
  /** 异步 A* 每 N 步让出主线程，避免单网同步搜索触发 THREAD_BLOCK */
  private readonly ASTAR_YIELD_EVERY: number = 64;
  /** routeUntilCleanAsync 墙钟预算（ms）；超时则标号降级退出 */
  private readonly ROUTE_WALL_MS: number = 12000;
  private weights: RoutingWeightPrefs = DEFAULT_WEIGHTS;
  private obstacleMap: Set<string> = new Set();
  private existingRoutes: RouteLine[] = [];
  private componentLibrary: IComponentLibrary | null = null;
  /** 缓存本轮拓扑的器件选中区 */
  private hitRects: WorldHitRect[] = [];
  /** 缓存所有引脚世界坐标 (devUuid:pinId → Point2D) */
  private allPinWorld: Map<string, Point2D> = new Map();
  /** 与 allPinWorld 同步的 key/坐标列表，避免 isBlocked 热路径 Array.from 分配 */
  private pinKeysCache: string[] = [];
  private pinWorldCache: Point2D[] = [];
  /** 本轮 route 内 netUuid → net 索引，避免逃逸走廊反复 find */
  private netByUuid: Map<string, number> = new Map();
  private routeTopo: SchTopology | null = null;

  setComponentLibrary(library: IComponentLibrary): void {
    this.componentLibrary = library;
  }

  /** 让出主线程 UV（勿用 setTimeout(0) 忙等） */
  private async yieldMain(): Promise<void> {
    await MainThreadYield.yield();
  }

  /** 布线结束后释放几何缓存，降低峰值内存 */
  private releaseRouteCaches(): void {
    this.obstacleMap.clear();
    this.existingRoutes = [];
    this.hitRects = [];
    this.allPinWorld.clear();
    this.pinKeysCache = [];
    this.pinWorldCache = [];
    this.netByUuid.clear();
    this.routeTopo = null;
  }

  /**
   * Route with quality gate: 交叉 / 选中区违规则剔除坏网重布，最多 maxRounds 轮。
   * 先剥离非 stub 旧线强制 A* 重布；仍违规则降级 joinByLabel stub。
   * 同步版仅供小规模/测试；生产流水线请用 routeUntilCleanAsync。
   */
  routeUntilClean(topo: SchTopology, constraints: RoutingLlmOutput,
    weights?: RoutingWeightPrefs,
    netWaypoints?: Map<string, Point2D[]>,
    maxRounds: number = 3): RouteResult {
    return this.routeUntilCleanCoreSync(topo, constraints, weights, netWaypoints, maxRounds);
  }

  /**
   * 异步 A*：每网/每轮让出主线程，避免 THREAD_BLOCK_6S。
   */
  async routeUntilCleanAsync(topo: SchTopology, constraints: RoutingLlmOutput,
    weights?: RoutingWeightPrefs,
    netWaypoints?: Map<string, Point2D[]>,
    maxRounds: number = 3): Promise<RouteResult> {
    return await this.routeUntilCleanCoreAsync(topo, constraints, weights, netWaypoints, maxRounds);
  }

  private routeUntilCleanCoreSync(topo: SchTopology, constraints: RoutingLlmOutput,
    weights?: RoutingWeightPrefs,
    netWaypoints?: Map<string, Point2D[]>,
    maxRounds: number = 3): RouteResult {
    const stripped = this.stripNonStubWires(topo);
    if (stripped > 0) {
      Logger.info('ConstrainedWiring',
        `[routeUntilClean] stripped ${stripped} non-stub wires for forced re-route`);
    }

    const forceLabelUuids = this.resolveForceLabelNetUuids(topo, constraints);
    if (forceLabelUuids.size > 0) {
      const n = this.demoteNetsToLabelStubs(topo, forceLabelUuids);
      const names = this.netNamesOfUuids(topo, forceLabelUuids);
      Logger.info('ConstrainedWiring',
        `[routeUntilClean] forceLabel demote ${forceLabelUuids.size} nets (${n} stubs)`);
      Logger.info(INSTR_TRACE_TAG,
        `[AI_ROUTE] forceLabel demote nets=${forceLabelUuids.size} stubs=${n}` +
        ` names=[${names.join(',')}]`);
    }

    // 备份 forceLabel stub：随后 A* 的 routeLines 赋值不得冲掉标号网 stub
    const forceLabelStubs = this.snapshotForceLabelStubs(topo, forceLabelUuids);

    let last = this.route(topo, constraints, weights, netWaypoints);
    last = this.fixViolations(topo, last);
    last.routeLines = this.mergeForceLabelStubs(forceLabelStubs, last.routeLines, forceLabelUuids);
    topo.wireList = last.routeLines;

    for (let round = 0; round < maxRounds; round++) {
      const bad = this.findViolatingNetUuids(topo, last.routeLines);
      if (bad.size === 0) {
        break;
      }
      const kept: RouteLine[] = [];
      for (let i = 0; i < last.routeLines.length; i++) {
        if (!bad.has(last.routeLines[i].netUuid)) {
          kept.push(last.routeLines[i]);
        }
      }
      // 违规网剔除时仍保留 forceLabel stub
      last.routeLines = this.mergeForceLabelStubs(forceLabelStubs, kept, forceLabelUuids);
      topo.wireList = last.routeLines;
      const bumped: RoutingWeightPrefs = {
        lineLength: weights?.lineLength ?? DEFAULT_WEIGHTS.lineLength,
        crossPenalty: (weights?.crossPenalty ?? DEFAULT_WEIGHTS.crossPenalty) * (1.5 + round),
        analogDigitalIsolate: weights?.analogDigitalIsolate ?? DEFAULT_WEIGHTS.analogDigitalIsolate,
        xtalShortPath: weights?.xtalShortPath ?? DEFAULT_WEIGHTS.xtalShortPath,
        diffEqualLength: weights?.diffEqualLength ?? DEFAULT_WEIGHTS.diffEqualLength
      };
      last = this.route(topo, constraints, bumped, netWaypoints);
      last = this.fixViolations(topo, last);
      last.routeLines = this.mergeForceLabelStubs(forceLabelStubs, last.routeLines, forceLabelUuids);
      topo.wireList = last.routeLines;
    }

    return this.finalizeRouteUntilClean(topo, last);
  }

  private async routeUntilCleanCoreAsync(topo: SchTopology, constraints: RoutingLlmOutput,
    weights?: RoutingWeightPrefs,
    netWaypoints?: Map<string, Point2D[]>,
    maxRounds: number = 3): Promise<RouteResult> {
    const deadline = Date.now() + this.ROUTE_WALL_MS;
    const stripped = this.stripNonStubWires(topo);
    if (stripped > 0) {
      Logger.info('ConstrainedWiring',
        `[routeUntilClean] stripped ${stripped} non-stub wires for forced re-route`);
    }

    const forceLabelUuids = this.resolveForceLabelNetUuids(topo, constraints);
    if (forceLabelUuids.size > 0) {
      const n = this.demoteNetsToLabelStubs(topo, forceLabelUuids);
      const names = this.netNamesOfUuids(topo, forceLabelUuids);
      Logger.info('ConstrainedWiring',
        `[routeUntilClean] forceLabel demote ${forceLabelUuids.size} nets (${n} stubs)`);
      Logger.info(INSTR_TRACE_TAG,
        `[AI_ROUTE] forceLabel demote nets=${forceLabelUuids.size} stubs=${n}` +
        ` names=[${names.join(',')}]`);
    }

    const forceLabelStubs = this.snapshotForceLabelStubs(topo, forceLabelUuids);

    await this.yieldMain();
    let last = await this.routeAsync(topo, constraints, weights, netWaypoints);
    last = this.fixViolations(topo, last);
    last.routeLines = this.mergeForceLabelStubs(forceLabelStubs, last.routeLines, forceLabelUuids);
    topo.wireList = last.routeLines;

    for (let round = 0; round < maxRounds; round++) {
      if (Date.now() > deadline) {
        Logger.warn('ConstrainedWiring',
          `[routeUntilClean] wall budget ${this.ROUTE_WALL_MS}ms exceeded at round=${round} — demote exit`);
        break;
      }
      const bad = this.findViolatingNetUuids(topo, last.routeLines);
      if (bad.size === 0) {
        break;
      }
      const kept: RouteLine[] = [];
      for (let i = 0; i < last.routeLines.length; i++) {
        if (!bad.has(last.routeLines[i].netUuid)) {
          kept.push(last.routeLines[i]);
        }
      }
      last.routeLines = this.mergeForceLabelStubs(forceLabelStubs, kept, forceLabelUuids);
      topo.wireList = last.routeLines;
      const bumped: RoutingWeightPrefs = {
        lineLength: weights?.lineLength ?? DEFAULT_WEIGHTS.lineLength,
        crossPenalty: (weights?.crossPenalty ?? DEFAULT_WEIGHTS.crossPenalty) * (1.5 + round),
        analogDigitalIsolate: weights?.analogDigitalIsolate ?? DEFAULT_WEIGHTS.analogDigitalIsolate,
        xtalShortPath: weights?.xtalShortPath ?? DEFAULT_WEIGHTS.xtalShortPath,
        diffEqualLength: weights?.diffEqualLength ?? DEFAULT_WEIGHTS.diffEqualLength
      };
      await this.yieldMain();
      last = await this.routeAsync(topo, constraints, bumped, netWaypoints);
      last = this.fixViolations(topo, last);
      last.routeLines = this.mergeForceLabelStubs(forceLabelStubs, last.routeLines, forceLabelUuids);
      topo.wireList = last.routeLines;
    }

    return this.finalizeRouteUntilClean(topo, last);
  }

  private finalizeRouteUntilClean(topo: SchTopology, last: RouteResult): RouteResult {
    const stillBad = this.findViolatingNetUuids(topo, last.routeLines);
    if (stillBad.size > 0) {
      const demoted = this.demoteNetsToLabelStubs(topo, stillBad);
      const names = this.netNamesOfUuids(topo, stillBad);
      Logger.warn('ConstrainedWiring',
        `[routeUntilClean] demoted ${stillBad.size} nets → joinByLabel stubs (${demoted} stubs)`);
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_ROUTE] demote_violate nets=${stillBad.size} stubs=${demoted}` +
        ` names=[${names.join(',')}]`);
      last.routeLines = topo.wireList.slice();
      last.crossCount = 0;
    }

    const capped = this.enforceMaxWiresPerPin(topo, 2);
    if (capped > 0) {
      Logger.info('ConstrainedWiring',
        `[routeUntilClean] pin fanout cap: converted ${capped} excess wires → labels`);
      Logger.info(INSTR_TRACE_TAG,
        `[AI_ROUTE] pin_fanout_cap excessWires→labels=${capped}`);
      last.routeLines = topo.wireList.slice();
    }

    const stillAfterCap = this.findViolatingNetUuids(topo, last.routeLines);
    if (stillAfterCap.size > 0) {
      const demoted2 = this.demoteNetsToLabelStubs(topo, stillAfterCap);
      const names2 = this.netNamesOfUuids(topo, stillAfterCap);
      Logger.warn('ConstrainedWiring',
        `[routeUntilClean] post-cap demote ${stillAfterCap.size} nets (${demoted2} stubs)`);
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_ROUTE] demote_post_cap nets=${stillAfterCap.size} stubs=${demoted2}` +
        ` names=[${names2.join(',')}]`);
      last.routeLines = topo.wireList.slice();
      last.crossCount = 0;
    }

    // 兜底：任意「stub+长线」混挂网一律整网标号，避免落图后分裂
    const mixed = this.findStubLongMixedNetUuids(topo);
    if (mixed.size > 0) {
      const demoted3 = this.demoteNetsToLabelStubs(topo, mixed);
      Logger.info(INSTR_TRACE_TAG,
        `[AI_ROUTE] heal_mixed_stub_long→allLabel nets=${mixed.size} stubs=${demoted3}` +
        ` names=[${this.netNamesOfUuids(topo, mixed).join(',')}]`);
      last.routeLines = topo.wireList.slice();
    }

    // A* 未覆盖的脚：补 stub；若因此变成 stub+长线混合 → 整网标号
    const uncovered = this.findNetsWithUnwiredPins(topo);
    if (uncovered.size > 0) {
      const uuids = Array.from(uncovered);
      for (let i = 0; i < uuids.length; i++) {
        this.ensureLabelStubsForUnwiredPins(topo, uuids[i]);
      }
      const mixed2 = this.findStubLongMixedNetUuids(topo);
      if (mixed2.size > 0) {
        const demoted4 = this.demoteNetsToLabelStubs(topo, mixed2);
        Logger.info(INSTR_TRACE_TAG,
          `[AI_ROUTE] heal_unwired→allLabel nets=${mixed2.size} stubs=${demoted4}` +
          ` names=[${this.netNamesOfUuids(topo, mixed2).join(',')}]`);
      }
      last.routeLines = topo.wireList.slice();
    }

    let stubN = 0;
    let longN = 0;
    for (let i = 0; i < topo.wireList.length; i++) {
      if (WireConflictGeometry.isShortStub(topo.wireList[i])) {
        stubN++;
      } else {
        longN++;
      }
    }
    Logger.info(INSTR_TRACE_TAG,
      `[AI_ROUTE] finalize wires=${topo.wireList.length} stubs=${stubN} long=${longN}` +
      ` nets=${topo.netList.length}`);
    traceAiOp('AI_ROUTE', 'route_finalize',
      `wires=${topo.wireList.length} stubs=${stubN} long=${longN}`);
    return last;
  }

  /** 同时含 stub 与长线的网络（落图后易分裂） */
  private findStubLongMixedNetUuids(topo: SchTopology): Set<string> {
    const stubNets = new Set<string>();
    const longNets = new Set<string>();
    for (let i = 0; i < topo.wireList.length; i++) {
      const w = topo.wireList[i];
      if (WireConflictGeometry.isShortStub(w)) {
        stubNets.add(w.netUuid);
      } else {
        longNets.add(w.netUuid);
      }
    }
    const mixed = new Set<string>();
    stubNets.forEach((uuid: string) => {
      if (longNets.has(uuid)) {
        mixed.add(uuid);
      }
    });
    return mixed;
  }

  /** 网内有引脚完全未被任何导线端点触及 */
  private findNetsWithUnwiredPins(topo: SchTopology): Set<string> {
    const out = new Set<string>();
    const PIN_TOL = 12;
    for (let ni = 0; ni < topo.netList.length; ni++) {
      const net = topo.netList[ni];
      if (net.nodeList.length < 2) {
        continue;
      }
      for (let i = 0; i < net.nodeList.length; i++) {
        const node = net.nodeList[i];
        const dev = topo.deviceList.find(d => d.instUuid === node.devUuid);
        if (!dev) {
          continue;
        }
        const pinId = node.pinId.length > 0 ? node.pinId : '1';
        const pinName = (node.pinName !== undefined && node.pinName.length > 0) ? node.pinName : pinId;
        const pinPos = PinWorldResolver.forDeviceInst(dev, pinId, pinName);
        let touched = false;
        for (let wi = 0; wi < topo.wireList.length; wi++) {
          const w = topo.wireList[wi];
          if (w.netUuid !== net.netUuid || w.points.length === 0) {
            continue;
          }
          const a = w.points[0];
          const b = w.points[w.points.length - 1];
          if (Math.hypot(a.x - pinPos.x, a.y - pinPos.y) <= PIN_TOL ||
            Math.hypot(b.x - pinPos.x, b.y - pinPos.y) <= PIN_TOL) {
            touched = true;
            break;
          }
        }
        if (!touched) {
          out.add(net.netUuid);
          break;
        }
      }
    }
    return out;
  }

  /** uuid → netName 列表，供 instr_trace */
  private netNamesOfUuids(topo: SchTopology, uuids: Set<string>): string[] {
    const out: string[] = [];
    const list = Array.from(uuids);
    for (let i = 0; i < list.length && out.length < 12; i++) {
      const net = topo.netList.find(n => n.netUuid === list[i]);
      out.push(net ? (net.netName || list[i]) : list[i]);
    }
    return out;
  }

  /**
   * 单脚最多 maxWires 根导线端点；超出则删掉较长导线，并为失连引脚补标号 stub。
   */
  enforceMaxWiresPerPin(topo: SchTopology, maxWires: number = 2): number {
    this.buildDeviceGeometryCache(topo);
    const PIN_TOL = 12;
    // pinKey → 触及该脚的导线下标列表
    const pinToWires = new Map<string, number[]>();
    const wireLen: number[] = [];
    for (let wi = 0; wi < topo.wireList.length; wi++) {
      wireLen.push(WireConflictGeometry.pathLength(topo.wireList[wi].points));
      const pts = topo.wireList[wi].points;
      if (pts.length === 0) {
        continue;
      }
      const ends: Point2D[] = [pts[0], pts[pts.length - 1]];
      for (let ei = 0; ei < ends.length; ei++) {
        const ep = ends[ei];
        for (let ki = 0; ki < this.pinKeysCache.length; ki++) {
          const pw = this.pinWorldCache[ki];
          if (Math.hypot(ep.x - pw.x, ep.y - pw.y) <= PIN_TOL) {
            const pk = this.pinKeysCache[ki];
            const list = pinToWires.get(pk) ?? [];
            if (list.indexOf(wi) < 0) {
              list.push(wi);
            }
            pinToWires.set(pk, list);
          }
        }
      }
    }

    const removeIdx = new Set<number>();
    const pinKeys = Array.from(pinToWires.keys());
    for (let pi = 0; pi < pinKeys.length; pi++) {
      const pk = pinKeys[pi];
      const idxs = pinToWires.get(pk) ?? [];
      if (idxs.length <= maxWires) {
        continue;
      }
      // 保留较短的 maxWires 根（stub 优先），其余删除
      const sorted = idxs.slice().sort((a, b) => wireLen[a] - wireLen[b]);
      for (let si = maxWires; si < sorted.length; si++) {
        removeIdx.add(sorted[si]);
      }
    }
    if (removeIdx.size === 0) {
      return 0;
    }

    const removedNets = new Set<string>();
    const kept: RouteLine[] = [];
    for (let wi = 0; wi < topo.wireList.length; wi++) {
      if (removeIdx.has(wi)) {
        removedNets.add(topo.wireList[wi].netUuid);
      } else {
        kept.push(topo.wireList[wi]);
      }
    }
    topo.wireList = kept;

    // 被删线的网络：为仍在网内但已无导线端点的引脚补标号
    const netUuids: string[] = Array.from(removedNets);
    for (let ni = 0; ni < netUuids.length; ni++) {
      this.ensureLabelStubsForUnwiredPins(topo, netUuids[ni]);
    }
    // 若补 stub 后仍残留长线 → 几何分裂风险：整网降为标号（同名标号可并网）
    const splitHeal = new Set<string>();
    for (let ni = 0; ni < netUuids.length; ni++) {
      const uuid = netUuids[ni];
      let hasStub = false;
      let hasLong = false;
      for (let wi = 0; wi < topo.wireList.length; wi++) {
        const w = topo.wireList[wi];
        if (w.netUuid !== uuid) {
          continue;
        }
        if (WireConflictGeometry.isShortStub(w)) {
          hasStub = true;
        } else {
          hasLong = true;
        }
      }
      if (hasStub && hasLong) {
        splitHeal.add(uuid);
      }
    }
    if (splitHeal.size > 0) {
      const n = this.demoteNetsToLabelStubs(topo, splitHeal);
      Logger.info(INSTR_TRACE_TAG,
        `[AI_ROUTE] pin_fanout_cap heal_split→allLabel nets=${splitHeal.size} stubs=${n}` +
        ` names=[${this.netNamesOfUuids(topo, splitHeal).join(',')}]`);
    }
    return removeIdx.size;
  }

  /** 网络中无任何导线端点触及的引脚 → 补 stub+标号 */
  private ensureLabelStubsForUnwiredPins(topo: SchTopology, netUuid: string): void {
    const net = topo.netList.find(n => n.netUuid === netUuid);
    if (!net) {
      return;
    }
    this.buildDeviceGeometryCache(topo);
    const PIN_TOL = 12;
    let added = 0;
    for (let i = 0; i < net.nodeList.length; i++) {
      const node = net.nodeList[i];
      const dev = topo.deviceList.find(d => d.instUuid === node.devUuid);
      if (!dev) {
        continue;
      }
      const pinId = node.pinId.length > 0 ? node.pinId : '1';
      const pinName = (node.pinName !== undefined && node.pinName.length > 0) ? node.pinName : pinId;
      const pinPos = PinWorldResolver.forDeviceInst(dev, pinId, pinName);
      let touched = false;
      for (let wi = 0; wi < topo.wireList.length; wi++) {
        const w = topo.wireList[wi];
        if (w.netUuid !== netUuid || w.points.length === 0) {
          continue;
        }
        const a = w.points[0];
        const b = w.points[w.points.length - 1];
        if (Math.hypot(a.x - pinPos.x, a.y - pinPos.y) <= PIN_TOL ||
          Math.hypot(b.x - pinPos.x, b.y - pinPos.y) <= PIN_TOL) {
          touched = true;
          break;
        }
      }
      if (touched) {
        continue;
      }
      const hasLbl = topo.netLabelList.some(l =>
        l.netUuid === netUuid && Math.hypot(l.x - pinPos.x, l.y - pinPos.y) < 50);
      if (hasLbl) {
        continue;
      }
      const hit = this.resolveHitRect(dev);
      const foreignPins = this.collectForeignPinWorlds(pinPos);
      const labelPos: Point2D = DeviceHitGeometry.stubLabelOutsidePinAvoidForeign(
        pinPos, hit, this.hitRects, 20, foreignPins);
      const label: NetLabelInfo = {
        id: IdUtil.generate('lbl'),
        netUuid: netUuid,
        text: net.netName.length > 0 ? net.netName : 'NET',
        x: labelPos.x,
        y: labelPos.y,
        global: false
      };
      topo.netLabelList.push(label);
      topo.wireList.push(makeRouteLine(netUuid, [pinPos, labelPos], false));
      added++;
    }
    // 若为 orphan 补了 stub，同时给仍连长线的脚打同名标号，便于落图后 applyNetLabelConnectivity 并网
    if (added > 0 && net.netName.length > 0 && !/^NET_\d+$/i.test(net.netName)) {
      this.stampNetNameLabelsOnTouchedPins(topo, netUuid, net.netName, PIN_TOL);
    }
  }

  /** 已有长线触及的脚：补同名标号（不删长线），防止 rebuild 后与 stub 岛分裂 */
  private stampNetNameLabelsOnTouchedPins(topo: SchTopology, netUuid: string,
    netName: string, pinTol: number): void {
    const net = topo.netList.find(n => n.netUuid === netUuid);
    if (!net) {
      return;
    }
    for (let i = 0; i < net.nodeList.length; i++) {
      const node = net.nodeList[i];
      const dev = topo.deviceList.find(d => d.instUuid === node.devUuid);
      if (!dev) {
        continue;
      }
      const pinId = node.pinId.length > 0 ? node.pinId : '1';
      const pinName = (node.pinName !== undefined && node.pinName.length > 0) ? node.pinName : pinId;
      const pinPos = PinWorldResolver.forDeviceInst(dev, pinId, pinName);
      let touchedLong = false;
      for (let wi = 0; wi < topo.wireList.length; wi++) {
        const w = topo.wireList[wi];
        if (w.netUuid !== netUuid || w.points.length === 0) {
          continue;
        }
        if (WireConflictGeometry.isShortStub(w)) {
          continue;
        }
        const a = w.points[0];
        const b = w.points[w.points.length - 1];
        if (Math.hypot(a.x - pinPos.x, a.y - pinPos.y) <= pinTol ||
          Math.hypot(b.x - pinPos.x, b.y - pinPos.y) <= pinTol) {
          touchedLong = true;
          break;
        }
      }
      if (!touchedLong) {
        continue;
      }
      const hasLbl = topo.netLabelList.some(l =>
        l.text === netName && Math.hypot(l.x - pinPos.x, l.y - pinPos.y) < 60);
      if (hasLbl) {
        continue;
      }
      const hit = this.resolveHitRect(dev);
      const foreignPins = this.collectForeignPinWorlds(pinPos);
      const labelPos = DeviceHitGeometry.stubLabelOutsidePinAvoidForeign(
        pinPos, hit, this.hitRects, 20, foreignPins);
      topo.netLabelList.push({
        id: IdUtil.generate('lbl'),
        netUuid: netUuid,
        text: netName,
        x: labelPos.x,
        y: labelPos.y,
        global: false
      });
    }
  }

  /** 除本脚外的全部引脚世界坐标（含同芯片邻脚），供 stub 避让 pin_proximity */
  private collectForeignPinWorlds(excludePin: Point2D): Point2D[] {
    const out: Point2D[] = [];
    for (let i = 0; i < this.pinWorldCache.length; i++) {
      const pw = this.pinWorldCache[i];
      if (Math.hypot(pw.x - excludePin.x, pw.y - excludePin.y) < 1) {
        continue;
      }
      out.push(pw);
    }
    return out;
  }

  /**
   * 将 LLM forceLabelNets 解析为 netUuid（精确名匹配，避免 VCC 误伤 VCC_AM / 线圈网）。
   */
  private resolveForceLabelNetUuids(topo: SchTopology, constraints: RoutingLlmOutput): Set<string> {
    const out = new Set<string>();
    const names = constraints.forceLabelNets ?? [];
    if (names.length === 0) {
      return out;
    }
    const forceWire = constraints.forceWireNets ?? [];
    const forceWireUp: string[] = [];
    for (let k = 0; k < forceWire.length; k++) {
      forceWireUp.push(forceWire[k].toUpperCase());
    }
    for (let i = 0; i < topo.netList.length; i++) {
      const net = topo.netList[i];
      const nameUp = (net.netName ?? '').toUpperCase();
      // 线圈驱动网禁止强制标号降级（否则易丢 stub / 仿真跳过继电器）
      if (nameUp.indexOf('COIL') >= 0 || nameUp.indexOf('REL_COIL') >= 0) {
        continue;
      }
      let matched = false;
      for (let j = 0; j < names.length; j++) {
        const hint = names[j].toUpperCase();
        if (hint.length === 0) {
          continue;
        }
        if (nameUp === hint) {
          matched = true;
          break;
        }
      }
      if (!matched) {
        continue;
      }
      let wireWins = false;
      for (let k = 0; k < forceWireUp.length; k++) {
        if (nameUp === forceWireUp[k]) {
          wireWins = true;
          break;
        }
      }
      if (!wireWins) {
        out.add(net.netUuid);
      }
    }
    return out;
  }

  /** 保留短 stub / 已标号 stub，清除长导线以便 A* 重布 joinWired 网 */
  private stripNonStubWires(topo: SchTopology): number {
    const before = topo.wireList.length;
    const labeledNets = new Set<string>();
    for (let i = 0; i < topo.netLabelList.length; i++) {
      labeledNets.add(topo.netLabelList[i].netUuid);
    }
    const kept: RouteLine[] = [];
    for (let i = 0; i < topo.wireList.length; i++) {
      const w = topo.wireList[i];
      if (WireConflictGeometry.isShortStub(w)) {
        kept.push(w);
        continue;
      }
      // sticky：已有网标号且路径≤2 折点的短引线，避免下一轮 strip 掉 demote stub
      if (labeledNets.has(w.netUuid) && w.points.length <= 3 &&
        WireConflictGeometry.pathLength(w.points) <= 120) {
        kept.push(w);
      }
    }
    topo.wireList = kept;
    return before - kept.length;
  }

  /**
   * 备份 forceLabel 网的 stub 导线（深拷贝点列），供 A* 结果合并时恢复。
   */
  private snapshotForceLabelStubs(topo: SchTopology, forceLabelUuids: Set<string>): RouteLine[] {
    const out: RouteLine[] = [];
    if (forceLabelUuids.size === 0) {
      return out;
    }
    for (let i = 0; i < topo.wireList.length; i++) {
      const w = topo.wireList[i];
      if (!forceLabelUuids.has(w.netUuid)) {
        continue;
      }
      const pts: Point2D[] = [];
      for (let pi = 0; pi < w.points.length; pi++) {
        pts.push({ x: w.points[pi].x, y: w.points[pi].y });
      }
      out.push(makeRouteLine(w.netUuid, pts, w.isBus));
    }
    return out;
  }

  /**
   * A* routeLines 不得覆盖 forceLabel stub：保留 stub，只并入非 forceLabel 的布线结果。
   */
  private mergeForceLabelStubs(
    stubs: RouteLine[], routed: RouteLine[], forceLabelUuids: Set<string>
  ): RouteLine[] {
    if (forceLabelUuids.size === 0 || stubs.length === 0) {
      return routed;
    }
    const merged: RouteLine[] = [];
    for (let i = 0; i < stubs.length; i++) {
      merged.push(stubs[i]);
    }
    for (let i = 0; i < routed.length; i++) {
      if (!forceLabelUuids.has(routed[i].netUuid)) {
        merged.push(routed[i]);
      }
    }
    return merged;
  }

  /**
   * 将冲突网改为标号连接：删长线，为每个引脚建 stub+NetLabel。
   * stub 终点避开异器件选中区与无关脚（含同芯片邻脚）。
   */
  demoteNetsToLabelStubs(topo: SchTopology, netUuids: Set<string>): number {
    if (netUuids.size === 0) {
      return 0;
    }
    this.buildDeviceGeometryCache(topo);
    topo.wireList = topo.wireList.filter(w => !netUuids.has(w.netUuid));
    topo.netLabelList = topo.netLabelList.filter(l => !netUuids.has(l.netUuid));

    let stubCount = 0;
    const uuidList: string[] = Array.from(netUuids);
    for (let ui = 0; ui < uuidList.length; ui++) {
      const netUuid = uuidList[ui];
      const net = topo.netList.find(n => n.netUuid === netUuid);
      if (!net || net.nodeList.length === 0) {
        continue;
      }
      for (let ni = 0; ni < net.nodeList.length; ni++) {
        const node = net.nodeList[ni];
        const dev = topo.deviceList.find(d => d.instUuid === node.devUuid);
        if (!dev) {
          continue;
        }
        const pinId = node.pinId.length > 0 ? node.pinId : '1';
        const pinName = (node.pinName !== undefined && node.pinName.length > 0) ? node.pinName : pinId;
        const pinPos = PinWorldResolver.forDeviceInst(dev, pinId, pinName);
        const hit = this.resolveHitRect(dev);
        const foreignPins = this.collectForeignPinWorlds(pinPos);
        const labelPos: Point2D = DeviceHitGeometry.stubLabelOutsidePinAvoidForeign(
          pinPos, hit, this.hitRects, 20, foreignPins);
        const label: NetLabelInfo = {
          id: IdUtil.generate('lbl'),
          netUuid: netUuid,
          text: net.netName.length > 0 ? net.netName : 'NET',
          x: labelPos.x,
          y: labelPos.y,
          global: false
        };
        topo.netLabelList.push(label);
        topo.wireList.push(makeRouteLine(netUuid, [pinPos, labelPos], false));
        stubCount++;
      }
    }
    return stubCount;
  }

  /** 检测导线是否侵入选中区或与异网交叉/重叠 */
  findViolatingNetUuids(topo: SchTopology, lines: RouteLine[]): Set<string> {
    this.buildDeviceGeometryCache(topo);
    const bad = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const others: RouteLine[] = [];
      for (let j = 0; j < lines.length; j++) {
        if (j !== i) {
          others.push(lines[j]);
        }
      }
      if (this.countCrossings(line, others) > 0) {
        // 短 stub 互交叉不触发 demote（标号扇出常态）；与长线交叉仍算违规
        const selfStub = WireConflictGeometry.isShortStub(line);
        let otherLong = false;
        for (let j = 0; j < others.length; j++) {
          if (this.countCrossings(line, [others[j]]) > 0 &&
            !WireConflictGeometry.isShortStub(others[j])) {
            otherLong = true;
            break;
          }
        }
        if (!selfStub || otherLong) {
          bad.add(line.netUuid);
        }
      }
      if (this.wireHitsAnyDeviceSelection(topo, line)) {
        bad.add(line.netUuid);
      }
      if (this.wireNearForeignPin(topo, line)) {
        bad.add(line.netUuid);
      }
    }
    return bad;
  }

  /** 导线是否侵入任何器件选中区（含本网，禁止穿体；仅本网引脚逃逸走廊允许接线） */
  private wireHitsAnyDeviceSelection(topo: SchTopology, line: RouteLine): boolean {
    for (let i = 1; i < line.points.length; i++) {
      const a = line.points[i - 1];
      const b = line.points[i];
      const samples = DeviceHitGeometry.sampleSegment(a, b, 8);
      for (let s = 0; s < samples.length; s++) {
        const pt = samples[s];
        for (let r = 0; r < this.hitRects.length; r++) {
          const rect = this.hitRects[r];
          if (!DeviceHitGeometry.pointInRect(pt.x, pt.y, rect)) {
            continue;
          }
          // 本网本器件：仅逃逸走廊放行；异器件或穿体 → 违规
          if (!this.pointInOwnDeviceEscapeCorridor(topo, line.netUuid, pt, rect)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private wireNearForeignPin(topo: SchTopology, line: RouteLine): boolean {
    const safe = new Set<string>();
    const netIdx = this.netByUuid.get(line.netUuid);
    const net = netIdx !== undefined ? topo.netList[netIdx] :
      topo.netList.find(n => n.netUuid === line.netUuid);
    if (net) {
      for (const node of net.nodeList) {
        this.addNetNodeSafeKeys(safe, topo, node);
      }
    }
    const ends: Point2D[] = [];
    if (line.points.length > 0) {
      ends.push(line.points[0]);
      ends.push(line.points[line.points.length - 1]);
    }
    const ENDPOINT_EXEMPT = 12;
    for (let i = 1; i < line.points.length; i++) {
      const a = line.points[i - 1];
      const b = line.points[i];
      for (let k = 0; k < this.pinKeysCache.length; k++) {
        if (safe.has(this.pinKeysCache[k])) {
          continue;
        }
        const pw = this.pinWorldCache[k];
        let nearEnd = false;
        for (let e = 0; e < ends.length; e++) {
          if (Math.hypot(pw.x - ends[e].x, pw.y - ends[e].y) <= ENDPOINT_EXEMPT) {
            nearEnd = true;
            break;
          }
        }
        if (nearEnd) {
          continue;
        }
        if (DeviceHitGeometry.pointSegmentDistance(pw, a, b) < FOREIGN_PIN_CLEARANCE) {
          return true;
        }
      }
    }
    return false;
  }

  /** 点是否落在本网、且属于该选中区器件的引脚逃逸走廊内（兼容 pinId/pinName） */
  private pointInOwnDeviceEscapeCorridor(
    topo: SchTopology, netUuid: string, pt: Point2D, rect: WorldHitRect
  ): boolean {
    const netIdx = this.netByUuid.get(netUuid);
    const net = netIdx !== undefined ? topo.netList[netIdx] :
      topo.netList.find(n => n.netUuid === netUuid);
    if (!net) {
      return false;
    }
    const hw = Math.max(this.gridSize, 10);
    for (const node of net.nodeList) {
      if (node.devUuid !== rect.instUuid) {
        continue;
      }
      const pw = this.resolveNodePinWorld(topo, node);
      if (!pw) {
        continue;
      }
      if (DeviceHitGeometry.pointInPinEscapeCorridor(pt.x, pt.y, pw.x, pw.y, rect, hw)) {
        return true;
      }
    }
    return false;
  }

  /** 解析网络节点引脚世界坐标：缓存 miss 时用 PinWorldResolver（LLM 常写数字脚号） */
  private resolveNodePinWorld(topo: SchTopology, node: NetNodeRef): Point2D | null {
    const pinId = node.pinId.length > 0 ? node.pinId : '1';
    const pinName = (node.pinName !== undefined && node.pinName.length > 0)
      ? node.pinName : pinId;
    let pw = this.allPinWorld.get(`${node.devUuid}:${pinId}`);
    if (!pw && pinName !== pinId) {
      pw = this.allPinWorld.get(`${node.devUuid}:${pinName}`);
    }
    if (!pw) {
      const canon = this.canonicalizeLibPinId(topo, node.devUuid, pinId, pinName);
      if (canon.length > 0) {
        pw = this.allPinWorld.get(`${node.devUuid}:${canon}`);
      }
    }
    if (pw) {
      return pw;
    }
    const dev = topo.deviceList.find(d => d.instUuid === node.devUuid);
    if (!dev) {
      return null;
    }
    return PinWorldResolver.forDeviceInst(dev, pinId, pinName);
  }

  /** 本网节点可匹配的安全键（含 555 数字脚号 → 库 pinId） */
  private addNetNodeSafeKeys(safe: Set<string>, topo: SchTopology, node: NetNodeRef): void {
    const pinId = node.pinId.length > 0 ? node.pinId : '1';
    const pinName = (node.pinName !== undefined && node.pinName.length > 0)
      ? node.pinName : '';
    safe.add(`${node.devUuid}:${pinId}`);
    if (pinName.length > 0 && pinName !== pinId) {
      safe.add(`${node.devUuid}:${pinName}`);
    }
    const canon = this.canonicalizeLibPinId(topo, node.devUuid, pinId, pinName);
    if (canon.length > 0) {
      safe.add(`${node.devUuid}:${canon}`);
    }
  }

  private canonicalizeLibPinId(topo: SchTopology, devUuid: string,
    pinId: string, pinName: string): string {
    const dev = topo.deviceList.find(d => d.instUuid === devUuid);
    if (!dev) {
      return '';
    }
    const lib = (dev.libDevId ?? '').toUpperCase();
    if (lib === 'LM555' || lib === 'NE555' || lib.indexOf('555') >= 0) {
      return TemplateSchematicKit.canonicalize555Pin(pinId, pinName);
    }
    if (lib === 'LM358' || lib === 'TL082' || lib === 'LM324') {
      return TemplateSchematicKit.canonicalizeDualOpAmpPin(pinId, pinName);
    }
    if (lib === 'LM7805' || lib === 'LM7812' || lib === 'AMS1117_3V3' ||
      lib.indexOf('AMS1117') >= 0 || lib.indexOf('7805') >= 0 || lib.indexOf('7812') >= 0) {
      return TemplateSchematicKit.canonicalizeRegulatorPin(pinId, pinName);
    }
    return '';
  }

  /** @deprecated 兼容旧调用：任意本网脚逃逸走廊 */
  private pointInOwnPinEscape(topo: SchTopology, netUuid: string, pt: Point2D): boolean {
    for (let r = 0; r < this.hitRects.length; r++) {
      const rect = this.hitRects[r];
      if (DeviceHitGeometry.pointInRect(pt.x, pt.y, rect) ||
        this.pointInOwnDeviceEscapeCorridor(topo, netUuid, pt, rect)) {
        if (this.pointInOwnDeviceEscapeCorridor(topo, netUuid, pt, rect)) {
          return true;
        }
      }
    }
    // 区外：仍允许脚点邻格（接线端点）
    const net = topo.netList.find(n => n.netUuid === netUuid);
    if (!net) {
      return false;
    }
    const sx = this.snap(pt.x);
    const sy = this.snap(pt.y);
    for (const node of net.nodeList) {
      const pw = this.resolveNodePinWorld(topo, node);
      if (!pw) {
        continue;
      }
      const d = Math.abs(sx - this.snap(pw.x)) + Math.abs(sy - this.snap(pw.y));
      if (d <= this.gridSize) {
        return true;
      }
    }
    return false;
  }

  /**
   * Route all nets in the topology.
   * @param netWaypoints Optional AI-suggested waypoints keyed by net name.
   */
  route(topo: SchTopology, constraints: RoutingLlmOutput,
    weights?: RoutingWeightPrefs,
    netWaypoints?: Map<string, Point2D[]>): RouteResult {
    return this.routeCore(topo, constraints, weights, netWaypoints);
  }

  async routeAsync(topo: SchTopology, constraints: RoutingLlmOutput,
    weights?: RoutingWeightPrefs,
    netWaypoints?: Map<string, Point2D[]>): Promise<RouteResult> {
    return await this.routeCoreAsync(topo, constraints, weights, netWaypoints);
  }

  private beginRoute(topo: SchTopology, weights?: RoutingWeightPrefs): RouteLine[] {
    this.weights = weights ?? DEFAULT_WEIGHTS;
    this.obstacleMap.clear();
    this.existingRoutes = [];
    this.hitRects = [];
    this.allPinWorld.clear();
    this.pinKeysCache = [];
    this.pinWorldCache = [];
    this.netByUuid.clear();
    this.routeTopo = topo;
    for (let i = 0; i < topo.netList.length; i++) {
      this.netByUuid.set(topo.netList[i].netUuid, i);
    }
    const preservedWires: RouteLine[] = [];
    for (let i = 0; i < topo.wireList.length; i++) {
      preservedWires.push(topo.wireList[i]);
      this.existingRoutes.push(topo.wireList[i]);
    }
    this.buildDeviceGeometryCache(topo);
    this.buildObstacleMap(topo);
    return preservedWires;
  }

  private routeOneTask(task: NetRouteTask, topo: SchTopology,
    netWaypoints: Map<string, Point2D[]> | undefined,
    routeLines: RouteLine[],
    congestionMap: Map<string, number>): RouteTaskMetrics {
    let crossCount = 0;
    let totalLength = 0;
    if (task.pinPositions.length < 2) {
      const empty: RouteTaskMetrics = { cross: 0, length: 0 };
      return empty;
    }
    const wp = netWaypoints ? netWaypoints.get(task.netName) : undefined;
    let segments = this.routeNet(task, topo, wp);
    let needRetry = false;
    for (let si = 0; si < segments.length; si++) {
      const probe = segments[si];
      const simplified = this.simplifyPath(probe.points);
      probe.points = this.relaxCorners(this.eliminateHairpinTurns(simplified), topo);
      if (this.countCrossings(probe, routeLines) > 0 ||
        this.wireHitsAnyDeviceSelection(topo, probe) ||
        this.wireNearForeignPin(topo, probe)) {
        needRetry = true;
        break;
      }
    }
    if (needRetry && wp && wp.length > 0) {
      segments = this.routeNet(task, topo, undefined);
    }
    for (let si = 0; si < segments.length; si++) {
      let seg = segments[si];
      const simplified = this.simplifyPath(seg.points);
      const cleaned = this.eliminateHairpinTurns(simplified);
      seg.points = this.relaxCorners(cleaned, topo);
      if (this.countCrossings(seg, routeLines) > 0 ||
        this.wireHitsAnyDeviceSelection(topo, seg) ||
        this.wireNearForeignPin(topo, seg)) {
        const retrySegs = this.routeNet(task, topo, undefined);
        if (retrySegs.length > si) {
          seg = retrySegs[si];
          seg.points = this.relaxCorners(
            this.eliminateHairpinTurns(this.simplifyPath(seg.points)), topo);
        }
      }
      crossCount += this.countCrossings(seg, routeLines);
      totalLength += this.pathLength(seg.points);
      routeLines.push(seg);
      this.markRouteAsObstacle(seg);
      this.updateCongestionMap(seg, congestionMap);
    }
    const metrics: RouteTaskMetrics = { cross: crossCount, length: totalLength };
    return metrics;
  }

  private finishRoute(topo: SchTopology, constraints: RoutingLlmOutput,
    tasks: NetRouteTask[], routeLines: RouteLine[], preservedWires: RouteLine[],
    crossCount: number, totalLength: number,
    congestionMap: Map<string, number>): RouteResult {
    for (let i = 0; i < preservedWires.length; i++) {
      routeLines.push(preservedWires[i]);
    }
    const deviceCollisions = this.checkWireDeviceCollisions(topo, routeLines);
    crossCount += deviceCollisions;
    this.buildCongestionHints(congestionMap, routeLines);
    const xtalShort = tasks.filter(t => t.isClock).every(t => {
      const seg = routeLines.find(r => r.netUuid === t.netUuid);
      return seg ? seg.points.length <= 4 : true;
    });
    const result: RouteResult = {
      routeLines,
      crossCount,
      totalLineLength: totalLength,
      isolateAnalogDigital: constraints.globalConstraint.includes('separate'),
      xtalShortPath: xtalShort,
      diffLineEqualLength: this.checkDiffEqualLength(routeLines, tasks),
      spacingIssues: this.checkParallelSpacing(routeLines)
    };
    this.releaseRouteCaches();
    return result;
  }

  private routeCore(topo: SchTopology, constraints: RoutingLlmOutput,
    weights?: RoutingWeightPrefs,
    netWaypoints?: Map<string, Point2D[]>): RouteResult {
    const preservedWires = this.beginRoute(topo, weights);
    const tasks = this.buildNetTasks(topo, constraints);
    tasks.sort((a, b) => b.priority - a.priority);
    const routeLines: RouteLine[] = [];
    let crossCount = 0;
    let totalLength = 0;
    const congestionMap = new Map<string, number>();
    for (const task of tasks) {
      const r = this.routeOneTask(task, topo, netWaypoints, routeLines, congestionMap);
      crossCount += r.cross;
      totalLength += r.length;
    }
    return this.finishRoute(topo, constraints, tasks, routeLines, preservedWires,
      crossCount, totalLength, congestionMap);
  }

  private async routeOneTaskAsync(task: NetRouteTask, topo: SchTopology,
    netWaypoints: Map<string, Point2D[]> | undefined,
    routeLines: RouteLine[],
    congestionMap: Map<string, number>): Promise<RouteTaskMetrics> {
    let crossCount = 0;
    let totalLength = 0;
    if (task.pinPositions.length < 2) {
      const empty: RouteTaskMetrics = { cross: 0, length: 0 };
      return empty;
    }
    const wp = netWaypoints ? netWaypoints.get(task.netName) : undefined;
    let segments = await this.routeNetAsync(task, topo, wp);
    let needRetry = false;
    for (let si = 0; si < segments.length; si++) {
      const probe = segments[si];
      const simplified = this.simplifyPath(probe.points);
      probe.points = this.relaxCorners(this.eliminateHairpinTurns(simplified), topo);
      if (this.countCrossings(probe, routeLines) > 0 ||
        this.wireHitsAnyDeviceSelection(topo, probe) ||
        this.wireNearForeignPin(topo, probe)) {
        needRetry = true;
        break;
      }
    }
    if (needRetry && wp && wp.length > 0) {
      segments = await this.routeNetAsync(task, topo, undefined);
    }
    for (let si = 0; si < segments.length; si++) {
      let seg = segments[si];
      const simplified = this.simplifyPath(seg.points);
      const cleaned = this.eliminateHairpinTurns(simplified);
      seg.points = this.relaxCorners(cleaned, topo);
      if (this.countCrossings(seg, routeLines) > 0 ||
        this.wireHitsAnyDeviceSelection(topo, seg) ||
        this.wireNearForeignPin(topo, seg)) {
        const retrySegs = await this.routeNetAsync(task, topo, undefined);
        if (retrySegs.length > si) {
          seg = retrySegs[si];
          seg.points = this.relaxCorners(
            this.eliminateHairpinTurns(this.simplifyPath(seg.points)), topo);
        }
      }
      crossCount += this.countCrossings(seg, routeLines);
      totalLength += this.pathLength(seg.points);
      routeLines.push(seg);
      this.markRouteAsObstacle(seg);
      this.updateCongestionMap(seg, congestionMap);
    }
    const metrics: RouteTaskMetrics = { cross: crossCount, length: totalLength };
    return metrics;
  }

  private async routeCoreAsync(topo: SchTopology, constraints: RoutingLlmOutput,
    weights?: RoutingWeightPrefs,
    netWaypoints?: Map<string, Point2D[]>): Promise<RouteResult> {
    const preservedWires = this.beginRoute(topo, weights);
    const tasks = this.buildNetTasks(topo, constraints);
    tasks.sort((a, b) => b.priority - a.priority);
    const routeLines: RouteLine[] = [];
    let crossCount = 0;
    let totalLength = 0;
    const congestionMap = new Map<string, number>();
    for (let ti = 0; ti < tasks.length; ti++) {
      const r = await this.routeOneTaskAsync(tasks[ti], topo, netWaypoints, routeLines, congestionMap);
      crossCount += r.cross;
      totalLength += r.length;
      await this.yieldMain();
    }
    return this.finishRoute(topo, constraints, tasks, routeLines, preservedWires,
      crossCount, totalLength, congestionMap);
  }

  /** 更新拥塞图: 导线段经过的 50×50 格计数+1 */
  private updateCongestionMap(seg: RouteLine, map: Map<string, number>): void {
    const CELL = 50;
    const touched = new Set<string>();
    for (const pt of seg.points) {
      const cellKey = `${Math.floor(pt.x / CELL)},${Math.floor(pt.y / CELL)}`;
      if (!touched.has(cellKey)) {
        touched.add(cellKey);
        map.set(cellKey, (map.get(cellKey) ?? 0) + 1);
      }
    }
  }

  /** 返回高拥塞区域(>4线/格)的网络列表，建议转为标号连接 */
  buildCongestionHints(map: Map<string, number>, lines: RouteLine[]): string[] {
    const hints: string[] = [];
    const CELL = 50;
    map.forEach((count, key) => {
      if (count > 4) {
        const parts = key.split(',');
        const cx = Number(parts[0]);
        const cy = Number(parts[1]);
        const netsInCell = new Set<string>();
        for (const line of lines) {
          for (const pt of line.points) {
            if (Math.floor(pt.x / CELL) === cx && Math.floor(pt.y / CELL) === cy) {
              netsInCell.add(line.netUuid);
            }
          }
        }
        if (netsInCell.size > 3) {
          hints.push(`格(${cx * CELL},${cy * CELL})拥塞${netsInCell.size}网 → 建议标号`);
        }
      }
    });
    return hints;
  }

  /** 消除发夹弯: 连续的 a→b→a 方向逆转移除中间点 */
  private eliminateHairpinTurns(points: Point2D[]): Point2D[] {
    if (points.length <= 2) return points;
    const result: Point2D[] = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];
      // 检测: prev→curr 和 curr→next 方向相反 (发夹弯)
      const dx1 = curr.x - prev.x; const dy1 = curr.y - prev.y;
      const dx2 = next.x - curr.x; const dy2 = next.y - curr.y;
      if (dx1 === -dx2 && dy1 === -dy2 && (dx1 !== 0 || dy1 !== 0)) {
        // 发夹弯: 跳过 curr, 直接 prev→next
        continue;
      }
      result.push(curr);
    }
    result.push(points[points.length - 1]);
    return result;
  }

  /** 检测导线段是否穿越器件包围盒 (不与器件引脚相连的穿越) */
  private checkWireDeviceCollisions(topo: SchTopology, lines: RouteLine[]): number {
    let collisions = 0;
    // 收集所有已连接引脚的世界坐标作为合法穿越点
    const connectedPins = new Set<string>();
    for (const net of topo.netList) {
      for (const node of net.nodeList) {
        const dev = topo.deviceList.find(d => d.instUuid === node.devUuid);
        if (dev) {
          const pw = PinWorldResolver.forDeviceInst(dev, node.pinId,
            node.pinName ?? node.pinId);
          connectedPins.add(`${pw.x},${pw.y}`);
        }
      }
    }

    for (const line of lines) {
      for (const pt of line.points) {
        const key = `${pt.x},${pt.y}`;
        if (connectedPins.has(key)) continue;
        let hitBody = false;
        for (let ri = 0; ri < this.hitRects.length; ri++) {
          const rect = this.hitRects[ri];
          if (!DeviceHitGeometry.pointInRect(pt.x, pt.y, rect)) {
            continue;
          }
          if (this.pointInOwnDeviceEscapeCorridor(topo, line.netUuid, pt, rect)) {
            continue;
          }
          hitBody = true;
          break;
        }
        if (hitBody) {
          collisions++;
        }
      }
    }
    return collisions;
  }

  /** 收集器件选中命中区 (与编辑器 HIT_PAD 对齐) */
  private collectDeviceBounds(topo: SchTopology): DevBounds[] {
    const bounds: DevBounds[] = [];
    for (let i = 0; i < this.hitRects.length; i++) {
      const r = this.hitRects[i];
      bounds.push({ x: r.x, y: r.y, w: r.w, h: r.h });
    }
    if (bounds.length === 0) {
      for (const dev of topo.deviceList) {
        const r = this.resolveHitRect(dev);
        bounds.push({ x: r.x, y: r.y, w: r.w, h: r.h });
      }
    }
    return bounds;
  }

  /**
   * 解析器件选中范围：优先库引脚 + HIT_PAD；否则 Kit 引脚偏移估算。
   */
  private resolveHitRect(dev: DeviceInst): WorldHitRect {
    const pins = this.getDevicePins(dev.libDevId);
    if (pins.length > 0) {
      return DeviceHitGeometry.hitRectFromPins(
        pins, dev.x, dev.y, dev.rotate, dev.mirrorH, SELECTION_HIT_PAD,
        dev.refName, dev.instUuid, dev.libDevId);
    }
    // 回退: 用 Kit 常见脚偏移估选中区
    const locals: Point2D[] = [];
    const ids = ['1', '2', 'A', 'K', 'COM', 'NO', 'NC', 'IN+', 'IN-', 'OUT'];
    for (let i = 0; i < ids.length; i++) {
      const off = TemplateSchematicKit.pinOffset(dev.libDevId, ids[i], ids[i]);
      if (off.x !== 0 || off.y !== 0 || ids[i] === '1') {
        locals.push(off);
      }
    }
    return DeviceHitGeometry.hitRectFromLocalPoints(
      locals, dev.x, dev.y, dev.rotate, dev.mirrorH, SELECTION_HIT_PAD,
      dev.refName, dev.instUuid, dev.libDevId);
  }

  private getDevicePins(libDevId: string): Pin[] {
    if (!this.componentLibrary) {
      return [];
    }
    const r = this.componentLibrary.getComponent(libDevId);
    if (!r.success || !r.data) {
      return [];
    }
    return r.data.pins ?? [];
  }

  private buildDeviceGeometryCache(topo: SchTopology): void {
    this.hitRects = [];
    this.allPinWorld.clear();
    this.pinKeysCache = [];
    this.pinWorldCache = [];
    for (const dev of topo.deviceList) {
      const rect = this.resolveHitRect(dev);
      this.hitRects.push(rect);
      const pins = this.getDevicePins(dev.libDevId);
      if (pins.length > 0) {
        for (let i = 0; i < pins.length; i++) {
          const p = pins[i];
          const world = PinWorldResolver.forDeviceInst(dev, p.id, p.name || p.id);
          const key = `${dev.instUuid}:${p.id}`;
          this.allPinWorld.set(key, world);
          this.pinKeysCache.push(key);
          this.pinWorldCache.push(world);
          // 同时按 pinName / DIP 脚号索引，避免 LLM 用脚号时 escape/safe 查找 miss
          const pname = (p.name && p.name.length > 0) ? p.name : '';
          if (pname.length > 0 && pname !== p.id) {
            this.allPinWorld.set(`${dev.instUuid}:${pname}`, world);
          }
          const libUp = (dev.libDevId ?? '').toUpperCase();
          if (libUp === 'LM555' || libUp === 'NE555') {
            const dipMap: string[] = ['', 'GND', 'TRIG', 'OUT', 'RESET', 'CTRL', 'THRES', 'DISCH', 'VCC'];
            for (let n = 1; n <= 8; n++) {
              if (dipMap[n] === p.id) {
                this.allPinWorld.set(`${dev.instUuid}:${String(n)}`, world);
                break;
              }
            }
          }
        }
      } else {
        // 禁止伪造 1/2/A/K 世界坐标：无库 pin 时跳过，避免假路径与错 demote
        Logger.warn(INSTR_TRACE_TAG,
          `[AI_ROUTE] no pins for ${dev.refName}/${dev.libDevId} — skip fake pin geometry`);
      }
    }
  }

  /** @deprecated 改用 resolveHitRect */
  private deviceBoundsAt(x: number, y: number, rot: number): DevBounds {
    const swapped = rot === 90 || rot === 270;
    const w = swapped ? 60 + SELECTION_HIT_PAD * 2 : 110 + SELECTION_HIT_PAD * 2;
    const h = swapped ? 110 + SELECTION_HIT_PAD * 2 : 60 + SELECTION_HIT_PAD * 2;
    return { x: x - w / 2, y: y - h / 2, w, h };
  }

  static defaultConstraints(topo: SchTopology): RoutingLlmOutput {
    const hints: NetPriorityHint[] = [];
    for (let i = 0; i < topo.netList.length; i++) {
      const net = topo.netList[i];
      const nameUp = (net.netName ?? '').toUpperCase();
      hints.push({
        netName: net.netName,
        isPower: net.isPower,
        isAnalog: net.isAnalog,
        isClock: nameUp.includes('XTAL') || nameUp.includes('CLK')
      });
    }
    const priorityMap = new Map<string, number>();
    priorityMap.set('GND', 10);
    priorityMap.set('VCC', 10);
    priorityMap.set('VDD', 10);
    priorityMap.set('3V3', 10);
    for (let i = 0; i < hints.length; i++) {
      const hint = hints[i];
      const nameUp = (hint.netName ?? '').toUpperCase();
      if (hint.isClock) {
        priorityMap.set(hint.netName, 9);
      } else if (hint.isAnalog) {
        priorityMap.set(hint.netName, 7);
      } else if (hint.isPower) {
        priorityMap.set(hint.netName, 10);
      } else if (!priorityMap.has(hint.netName)) {
        priorityMap.set(hint.netName, 2);
      }
    }

    const ruleXtal: SpecialNetRule = { netGroup: 'xtal', rule: 'shortest_path,no_cross_analog,min_cross_count' };
    const ruleI2c: SpecialNetRule = { netGroup: 'i2c', rule: 'parallel_equal_length,45deg_line' };
    const rulePower: SpecialNetRule = { netGroup: 'power', rule: 'thick_line,direct_route,no_detour' };
    const specialNetRules: SpecialNetRule[] = [ruleXtal, ruleI2c, rulePower];

    // 仪器相关网默认 forceLabel（合并阶段/无 LLM 时也避免长线穿体）
    const forceLabelNets: string[] = [];
    const isInstr = (lib: string): boolean => {
      const u = (lib ?? '').toUpperCase();
      return u.indexOf('OSCILLOSCOPE') >= 0 || u.indexOf('VOLTMETER') >= 0 ||
        u.indexOf('AMMETER') >= 0 || u.indexOf('UART') >= 0 ||
        u.indexOf('LOGIC_ANALYZER') >= 0 || u.indexOf('FREQ') >= 0 ||
        u.indexOf('POWER_METER') >= 0 || u.indexOf('VIRTUAL_METER') >= 0;
    };
    for (let ni = 0; ni < topo.netList.length; ni++) {
      const net = topo.netList[ni];
      let hit = false;
      for (let ki = 0; ki < (net.nodeList?.length ?? 0); ki++) {
        const node = net.nodeList[ki];
        const dev = topo.deviceList.find(d => d.instUuid === node.devUuid);
        if (dev && isInstr(dev.libDevId ?? '')) {
          hit = true;
          break;
        }
      }
      const nUp = (net.netName ?? '').toUpperCase();
      if (hit || nUp.indexOf('SENSE') >= 0 || nUp.indexOf('UART') >= 0 ||
        /^CH\d/.test(nUp)) {
        if (forceLabelNets.indexOf(net.netName) < 0) {
          forceLabelNets.push(net.netName);
          priorityMap.set(net.netName, 9);
        }
      }
    }

    const result: RoutingLlmOutput = {
      netPriority: netPriorityMapToRecord(priorityMap),
      specialNetRules: specialNetRules,
      globalConstraint: 'analog_net_area separate from digital net_area, bus lines parallel',
      forceWireNets: [],
      forceLabelNets: forceLabelNets
    };
    return result;
  }

  private buildNetTasks(topo: SchTopology, constraints: RoutingLlmOutput): NetRouteTask[] {
    const tasks: NetRouteTask[] = [];
    // forceLabel 已 demote 为 stub：禁止再 A* 长走线（否则 stub+长线叠出 wire_cross）
    const forceLabelSkip = this.resolveForceLabelNetUuids(topo, constraints);
    let skippedForceLabel = 0;
    let skippedCovered = 0;

    for (const net of topo.netList) {
      // 无真实脚节点则跳过（禁止「前两器件」假连）
      if (net.nodeList.length < 2) {
        continue;
      }
      if (forceLabelSkip.has(net.netUuid)) {
        skippedForceLabel++;
        continue;
      }

      const netWires: RouteLine[] = [];
      for (let wi = 0; wi < topo.wireList.length; wi++) {
        if (topo.wireList[wi].netUuid === net.netUuid) {
          netWires.push(topo.wireList[wi]);
        }
      }

      const positions: Point2D[] = [];
      for (const node of net.nodeList) {
        const dev = topo.deviceList.find(d => d.instUuid === node.devUuid);
        if (!dev) {
          continue;
        }
        const pinId = node.pinId.length > 0 ? node.pinId : '1';
        const pinName = (node.pinName !== undefined && node.pinName.length > 0) ? node.pinName : pinId;
        const world = PinWorldResolver.forDeviceInst(dev, pinId, pinName);
        // 已有 stub 覆盖的引脚不再纳入 A*（joinByLabel / 混合网）
        if (this.pinCoveredByStub(netWires, world)) {
          skippedCovered++;
          continue;
        }
        positions.push(world);
      }
      if (positions.length < 2) {
        continue;
      }

      const nameUp = (net.netName ?? '').toUpperCase();
      const rules = constraints.specialNetRules
        .filter(r => nameUp.includes(r.netGroup.toUpperCase()) || this.matchNetGroup(nameUp, r.netGroup))
        .map(r => r.rule);

      tasks.push({
        netUuid: net.netUuid,
        netName: net.netName,
        priority: getNetPriorityValue(
          constraints.netPriority,
          net.netName,
          nameUp,
          net.isPower || nameUp.includes('VCC') || nameUp.includes('GND') || nameUp.includes('VDD'),
          net.isAnalog
        ),
        rules,
        pinPositions: positions,
        isPower: net.isPower || nameUp.includes('VCC') || nameUp.includes('GND') || nameUp.includes('VDD'),
        isAnalog: net.isAnalog,
        isClock: nameUp.includes('XTAL') || nameUp.includes('CLK'),
        isDiff: nameUp.includes('I2C') || nameUp.includes('SDA') || nameUp.includes('SCL') || nameUp.includes('SPI')
      });
    }
    if (skippedForceLabel > 0 || skippedCovered > 0 || tasks.length > 0) {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_ROUTE] buildNetTasks astar=${tasks.length}` +
        ` skipForceLabel=${skippedForceLabel} skipStubCovered=${skippedCovered}` +
        ` forceLabelHints=${(constraints.forceLabelNets ?? []).join(',')}`);
    }
    return tasks;
  }

  /** 引脚是否已被 stub 短线端点覆盖（≤8mil） */
  private pinCoveredByStub(wires: RouteLine[], pin: Point2D): boolean {
    for (let i = 0; i < wires.length; i++) {
      if (!WireConflictGeometry.isShortStub(wires[i])) {
        continue;
      }
      const pts = wires[i].points;
      if (pts.length === 0) {
        continue;
      }
      if (Math.hypot(pts[0].x - pin.x, pts[0].y - pin.y) <= 8) {
        return true;
      }
      const last = pts[pts.length - 1];
      if (Math.hypot(last.x - pin.x, last.y - pin.y) <= 8) {
        return true;
      }
    }
    return false;
  }

  private matchNetGroup(netName: string, group: string): boolean {
    const g = group.toLowerCase();
    if (g === 'xtal') return netName.includes('XTAL') || netName.includes('CLK');
    if (g === 'power') return netName.includes('VCC') || netName.includes('GND');
    if (g === 'i2c_sda_scl' || g === 'i2c') return netName.includes('I2C') || netName.includes('SDA');
    return netName.includes(g.toUpperCase());
  }

  private routeNet(task: NetRouteTask, topo: SchTopology,
    waypoints?: Point2D[]): RouteLine[] {
    const lines: RouteLine[] = [];
    const pts = task.pinPositions;

    // If AI provided waypoints, insert them between pin positions
    if (waypoints && waypoints.length > 0) {
      const orderedWaypoints = this.orderWaypointsAlongPath(pts, waypoints);
      let allPts: Point2D[] = [pts[0]];
      for (const wp of orderedWaypoints) {
        allPts.push(wp);
      }
      allPts.push(pts[pts.length - 1]);

      for (let i = 0; i < allPts.length - 1; i++) {
        const path = this.findPath(allPts[i], allPts[i + 1], task, topo);
        lines.push({
          netUuid: task.netUuid,
          points: path,
          isBus: task.netName.includes('BUS')
        });
      }
    } else {
      for (let i = 0; i < pts.length - 1; i++) {
        const path = this.findPath(pts[i], pts[i + 1], task, topo);
        lines.push({
          netUuid: task.netUuid,
          points: path,
          isBus: task.netName.includes('BUS')
        });
      }
    }
    return lines;
  }

  private async routeNetAsync(task: NetRouteTask, topo: SchTopology,
    waypoints?: Point2D[]): Promise<RouteLine[]> {
    const lines: RouteLine[] = [];
    const pts = task.pinPositions;

    if (waypoints && waypoints.length > 0) {
      const orderedWaypoints = this.orderWaypointsAlongPath(pts, waypoints);
      let allPts: Point2D[] = [pts[0]];
      for (const wp of orderedWaypoints) {
        allPts.push(wp);
      }
      allPts.push(pts[pts.length - 1]);

      for (let i = 0; i < allPts.length - 1; i++) {
        const path = await this.findPathAsync(allPts[i], allPts[i + 1], task, topo);
        lines.push({
          netUuid: task.netUuid,
          points: path,
          isBus: task.netName.includes('BUS')
        });
      }
    } else {
      for (let i = 0; i < pts.length - 1; i++) {
        const path = await this.findPathAsync(pts[i], pts[i + 1], task, topo);
        lines.push({
          netUuid: task.netUuid,
          points: path,
          isBus: task.netName.includes('BUS')
        });
      }
    }
    return lines;
  }

  /** Order AI waypoints along the path from pts[0] to pts[last]. */
  private orderWaypointsAlongPath(pinPts: Point2D[], waypoints: Point2D[]): Point2D[] {
    const start = pinPts[0];
    const end = pinPts[pinPts.length - 1];
    // Sort by projected distance along the start→end vector
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1) {
      return waypoints;
    }
    return waypoints.slice().sort((a, b) => {
      const projA = ((a.x - start.x) * dx + (a.y - start.y) * dy) / len2;
      const projB = ((b.x - start.x) * dx + (b.y - start.y) * dy) / len2;
      return projA - projB;
    });
  }

  private findPath(start: Point2D, end: Point2D, task: NetRouteTask, topo: SchTopology): Point2D[] {
    const openList: WiringNode[] = [];
    const openMap = new Map<string, number>();
    const closedSet: Set<string> = new Set();
    const s = this.snapPoint(start);
    const e = this.snapPoint(end);

    const startNode: WiringNode = {
      x: s.x, y: s.y, g: 0,
      h: this.heuristic(s, e, task), f: 0, parent: null
    };
    startNode.f = startNode.g + startNode.h;
    openList.push(startNode);
    openMap.set(`${s.x},${s.y}`, 0);

    let steps = 0;
    while (openList.length > 0 && steps < this.ASTAR_MAX_STEPS) {
      let bestIdx = 0;
      for (let oi = 1; oi < openList.length; oi++) {
        if (openList[oi].f < openList[bestIdx].f) {
          bestIdx = oi;
        }
      }
      const current = openList[bestIdx];
      openMap.delete(`${current.x},${current.y}`);
      if (bestIdx === openList.length - 1) {
        openList.pop();
      } else {
        const moved = openList[openList.length - 1];
        openList[bestIdx] = moved;
        openList.pop();
        openMap.set(`${moved.x},${moved.y}`, bestIdx);
      }
      const key = `${current.x},${current.y}`;
      if (closedSet.has(key)) {
        continue;
      }
      closedSet.add(key);
      steps++;

      if (Math.abs(current.x - e.x) < this.gridSize && Math.abs(current.y - e.y) < this.gridSize) {
        const path = this.reconstructPath(current);
        const simplified = this.simplifyPath(path);
        const cleaned = this.eliminateHairpinTurns(simplified);
        return this.relaxCorners(cleaned, topo);
      }

      const rawNeighbors = this.getNeighbors(current, task, topo);
      for (let ni = 0; ni < rawNeighbors.length; ni++) {
        const neighbor = rawNeighbors[ni];
        const nKey = `${neighbor.x},${neighbor.y}`;
        if (closedSet.has(nKey)) {
          continue;
        }
        const tentativeG = current.g + this.moveCost(current, neighbor, task);
        const existingIdx = openMap.get(nKey);
        if (existingIdx !== undefined && existingIdx < openList.length &&
          openList[existingIdx].x === neighbor.x && openList[existingIdx].y === neighbor.y &&
          openList[existingIdx].g <= tentativeG) {
          continue;
        }
        neighbor.g = tentativeG;
        neighbor.h = this.heuristic({ x: neighbor.x, y: neighbor.y }, e, task);
        neighbor.f = neighbor.g + neighbor.h;
        neighbor.parent = current;
        if (existingIdx !== undefined && existingIdx < openList.length &&
          openList[existingIdx].x === neighbor.x && openList[existingIdx].y === neighbor.y) {
          openList[existingIdx] = neighbor;
        } else {
          openMap.set(nKey, openList.length);
          openList.push(neighbor);
        }
      }
    }

    return task.isPower ? [s, { x: s.x, y: e.y }, e] : [s, e];
  }

  /** 异步 A*：每 ASTAR_YIELD_EVERY 步让出主线程 */
  private async findPathAsync(start: Point2D, end: Point2D, task: NetRouteTask,
    topo: SchTopology): Promise<Point2D[]> {
    const openList: WiringNode[] = [];
    const openMap = new Map<string, number>();
    const closedSet: Set<string> = new Set();
    const s = this.snapPoint(start);
    const e = this.snapPoint(end);

    const startNode: WiringNode = {
      x: s.x, y: s.y, g: 0,
      h: this.heuristic(s, e, task), f: 0, parent: null
    };
    startNode.f = startNode.g + startNode.h;
    openList.push(startNode);
    openMap.set(`${s.x},${s.y}`, 0);

    let steps = 0;
    while (openList.length > 0 && steps < this.ASTAR_MAX_STEPS) {
      if (steps > 0 && steps % this.ASTAR_YIELD_EVERY === 0) {
        await this.yieldMain();
      }
      let bestIdx = 0;
      for (let oi = 1; oi < openList.length; oi++) {
        if (openList[oi].f < openList[bestIdx].f) {
          bestIdx = oi;
        }
      }
      const current = openList[bestIdx];
      openMap.delete(`${current.x},${current.y}`);
      if (bestIdx === openList.length - 1) {
        openList.pop();
      } else {
        const moved = openList[openList.length - 1];
        openList[bestIdx] = moved;
        openList.pop();
        openMap.set(`${moved.x},${moved.y}`, bestIdx);
      }
      const key = `${current.x},${current.y}`;
      if (closedSet.has(key)) {
        continue;
      }
      closedSet.add(key);
      steps++;

      if (Math.abs(current.x - e.x) < this.gridSize && Math.abs(current.y - e.y) < this.gridSize) {
        const path = this.reconstructPath(current);
        const simplified = this.simplifyPath(path);
        const cleaned = this.eliminateHairpinTurns(simplified);
        return this.relaxCorners(cleaned, topo);
      }

      const rawNeighbors = this.getNeighbors(current, task, topo);
      for (let ni = 0; ni < rawNeighbors.length; ni++) {
        const neighbor = rawNeighbors[ni];
        const nKey = `${neighbor.x},${neighbor.y}`;
        if (closedSet.has(nKey)) {
          continue;
        }
        const tentativeG = current.g + this.moveCost(current, neighbor, task);
        const existingIdx = openMap.get(nKey);
        if (existingIdx !== undefined && existingIdx < openList.length &&
          openList[existingIdx].x === neighbor.x && openList[existingIdx].y === neighbor.y &&
          openList[existingIdx].g <= tentativeG) {
          continue;
        }
        neighbor.g = tentativeG;
        neighbor.h = this.heuristic({ x: neighbor.x, y: neighbor.y }, e, task);
        neighbor.f = neighbor.g + neighbor.h;
        neighbor.parent = current;
        if (existingIdx !== undefined && existingIdx < openList.length &&
          openList[existingIdx].x === neighbor.x && openList[existingIdx].y === neighbor.y) {
          openList[existingIdx] = neighbor;
        } else {
          openMap.set(nKey, openList.length);
          openList.push(neighbor);
        }
      }
    }

    return task.isPower ? [s, { x: s.x, y: e.y }, e] : [s, e];
  }

  private moveCost(from: WiringNode, to: WiringNode, task: NetRouteTask): number {
    let cost = this.gridSize * this.weights.lineLength;
    const key = `${to.x},${to.y}`;
    // Only penalize different-net crossings; same-net wires can share paths
    if (this.existingRouteOccupies(key, task.netUuid)) cost += this.weights.crossPenalty;
    if (task.isClock) cost *= 0.5;
    if (task.rules.includes('no_detour') && Math.abs(from.x - to.x) + Math.abs(from.y - to.y) > this.gridSize * 2) {
      cost += this.weights.xtalShortPath;
    }
    return cost;
  }

  private heuristic(a: Point2D, b: Point2D, task: NetRouteTask): number {
    const manhattan = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    return task.isClock ? manhattan * 0.8 : manhattan;
  }

  private getNeighbors(node: WiringNode, task: NetRouteTask, topo: SchTopology): WiringNode[] {
    const dirs = task.rules.includes('45deg_line') ?
      [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]] :
      [[0, 1], [0, -1], [1, 0], [-1, 0]];
    const neighbors: WiringNode[] = [];

    for (let i = 0; i < dirs.length; i++) {
      const dx = dirs[i][0];
      const dy = dirs[i][1];
      const nx = node.x + dx * this.gridSize;
      const ny = node.y + dy * this.gridSize;
      if (!this.isBlocked(nx, ny, task, topo)) {
        neighbors.push({ x: nx, y: ny, g: 0, h: 0, f: 0, parent: null });
      }
    }
    return neighbors;
  }

  private isBlocked(x: number, y: number, task: NetRouteTask, _topo: SchTopology): boolean {
    // 本网引脚逃逸走廊可进入；禁止穿器件体；电源网同样禁止
    if (this.isTaskPinEscapeCell(x, y, task)) {
      return false;
    }

    const key = `${x},${y}`;
    if (this.obstacleMap.has(key)) {
      return true;
    }

    for (let i = 0; i < this.hitRects.length; i++) {
      const r = this.hitRects[i];
      if (DeviceHitGeometry.pointInRect(x, y, r)) {
        return true;
      }
    }

    const ep0 = task.pinPositions.length > 0 ? task.pinPositions[0] : null;
    const ep1 = task.pinPositions.length > 1 ? task.pinPositions[task.pinPositions.length - 1] : ep0;
    for (let i = 0; i < this.pinWorldCache.length; i++) {
      const pw = this.pinWorldCache[i];
      let isEndpoint = false;
      if (ep0 && this.snap(pw.x) === this.snap(ep0.x) && this.snap(pw.y) === this.snap(ep0.y)) {
        isEndpoint = true;
      } else if (ep1 && this.snap(pw.x) === this.snap(ep1.x) && this.snap(pw.y) === this.snap(ep1.y)) {
        isEndpoint = true;
      } else {
        for (let j = 1; j < task.pinPositions.length - 1; j++) {
          const ep = task.pinPositions[j];
          if (this.snap(pw.x) === this.snap(ep.x) && this.snap(pw.y) === this.snap(ep.y)) {
            isEndpoint = true;
            break;
          }
        }
      }
      if (isEndpoint) {
        continue;
      }
      if (Math.hypot(x - pw.x, y - pw.y) < FOREIGN_PIN_CLEARANCE) {
        return true;
      }
    }
    return false;
  }

  private isTaskPinEscapeCell(x: number, y: number, task: NetRouteTask): boolean {
    const hw = Math.max(this.gridSize, 10);
    for (let i = 0; i < task.pinPositions.length; i++) {
      const pp = task.pinPositions[i];
      // 找包含该脚的选中区；脚在区外则用最近区
      let best: WorldHitRect | null = null;
      let bestDist = Number.MAX_VALUE;
      for (let ri = 0; ri < this.hitRects.length; ri++) {
        const r = this.hitRects[ri];
        if (DeviceHitGeometry.pointInRect(pp.x, pp.y, r)) {
          best = r;
          break;
        }
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        const d = Math.hypot(pp.x - cx, pp.y - cy);
        if (d < bestDist) {
          bestDist = d;
          best = r;
        }
      }
      if (best &&
        DeviceHitGeometry.pointInPinEscapeCorridor(x, y, pp.x, pp.y, best, hw)) {
        return true;
      }
      const sx = this.snap(x);
      const sy = this.snap(y);
      const d = Math.abs(sx - this.snap(pp.x)) + Math.abs(sy - this.snap(pp.y));
      if (d <= this.gridSize) {
        return true;
      }
    }
    return false;
  }

  private buildObstacleMap(topo: SchTopology): void {
    // 用选中命中区填障碍栅格
    const rects = this.hitRects.length > 0 ? this.hitRects :
      topo.deviceList.map(d => this.resolveHitRect(d));
    for (let ri = 0; ri < rects.length; ri++) {
      const r = rects[ri];
      for (let x = Math.floor(r.x); x <= r.x + r.w; x += this.gridSize) {
        for (let y = Math.floor(r.y); y <= r.y + r.h; y += this.gridSize) {
          this.obstacleMap.add(`${this.snap(x)},${this.snap(y)}`);
        }
      }
    }
    // 无关引脚安全圈在 isBlocked 动态判定；此处再强化引脚格本身
    for (let i = 0; i < this.pinWorldCache.length; i++) {
      const pw = this.pinWorldCache[i];
      this.obstacleMap.add(`${this.snap(pw.x)},${this.snap(pw.y)}`);
    }
  }

  private markRouteAsObstacle(seg: RouteLine): void {
    for (const p of seg.points) {
      this.obstacleMap.add(`${p.x},${p.y}`);
    }
    this.existingRoutes.push(seg);
  }

  /**
   * 后验: 检测不同 net 的平行导线间距是否小于 MIN_WIRE_GAP。
   * 返回间距违规的 (netA, netB, 位置) 列表。
   */
  checkParallelSpacing(lines: RouteLine[]): SpacingIssue[] {
    const issues: SpacingIssue[] = [];
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[i].netUuid === lines[j].netUuid) continue;
        for (const pa of lines[i].points) {
          for (const pb of lines[j].points) {
            const dx = Math.abs(pa.x - pb.x);
            const dy = Math.abs(pa.y - pb.y);
            // 水平平行: 同 y, x 间距 < MIN_WIRE_GAP
            if (dy === 0 && dx > 0 && dx < this.MIN_WIRE_GAP) {
              const issue: SpacingIssue = { netA: lines[i].netUuid, netB: lines[j].netUuid,
                pos: { x: (pa.x + pb.x) / 2, y: pa.y } };
              issues.push(issue);
            }
            // 垂直平行: 同 x, y 间距 < MIN_WIRE_GAP
            if (dx === 0 && dy > 0 && dy < this.MIN_WIRE_GAP) {
              const issue: SpacingIssue = { netA: lines[i].netUuid, netB: lines[j].netUuid,
                pos: { x: pa.x, y: (pa.y + pb.y) / 2 } };
              issues.push(issue);
            }
          }
        }
      }
    }
    return issues;
  }

  /** Check if a grid cell is already occupied by a route of a DIFFERENT net. */
  private existingRouteOccupies(key: string, ownNetUuid: string): boolean {
    return this.existingRoutes.some(r =>
      r.netUuid !== ownNetUuid && r.points.some(p => `${p.x},${p.y}` === key));
  }

  private reconstructPath(node: WiringNode): Point2D[] {
    const path: Point2D[] = [];
    let cur: WiringNode | null = node;
    while (cur) {
      path.unshift({ x: cur.x, y: cur.y });
      cur = cur.parent;
    }
    return path;
  }

  private simplifyPath(path: Point2D[]): Point2D[] {
    if (path.length <= 2) return path;
    const result: Point2D[] = [path[0]];
    for (let i = 1; i < path.length - 1; i++) {
      const prev = path[i - 1];
      const curr = path[i];
      const next = path[i + 1];
      if (!(prev.x === curr.x && curr.x === next.x) && !(prev.y === curr.y && curr.y === next.y)) {
        result.push(curr);
      }
    }
    result.push(path[path.length - 1]);
    return result;
  }

  /** 智能拐点优化: 推离器件边缘 + 消除冗余弯折 */
  private relaxCorners(path: Point2D[], topo: SchTopology): Point2D[] {
    if (path.length <= 2) return path;
    const devBounds = this.collectDeviceBounds(topo);
    const margin = this.gridSize * 2; // 20mil 期望间距

    for (let iter = 0; iter < 3; iter++) {
      let changed = false;
      const result: Point2D[] = [path[0]];

      for (let i = 1; i < path.length - 1; i++) {
        const prev = result[result.length - 1];
        const curr = path[i];
        const next = path[i + 1];

        // 尝试 1: 消除此拐点 — 直接 prev→next 是否合法?
        if (this.segmentClear(prev, next, topo, devBounds, margin)) {
          changed = true;
          continue; // 跳过 curr, prev→next 直达
        }

        // 尝试 2: 沿两个正交方向推离拐点以增加器件间距
        let best = curr;
        let bestClearance = this.minClearance(curr, devBounds);
        const candidates: Point2D[] = [];
        if (prev.x === curr.x) {
          // 前一段垂直, 后一段水平 → 拐点可沿 X 滑动
          for (const dx of [-20, -10, 10, 20]) {
            candidates.push({ x: curr.x + dx, y: curr.y });
          }
        } else {
          // 前一段水平, 后一段垂直 → 拐点可沿 Y 滑动
          for (const dy of [-20, -10, 10, 20]) {
            candidates.push({ x: curr.x, y: curr.y + dy });
          }
        }
        for (const cand of candidates) {
          if (!this.segmentClear(prev, cand, topo, devBounds, 0)) continue;
          if (!this.segmentClear(cand, next, topo, devBounds, 0)) continue;
          const cl = this.minClearance(cand, devBounds);
          if (cl > bestClearance + 5) {
            best = cand;
            bestClearance = cl;
            changed = true;
          }
        }
        result.push(best);
      }
      result.push(path[path.length - 1]);
      path = result;
      if (!changed) break;
    }
    return path;
  }

  /** 线段是否无障碍 (不穿越器件体, 不含首末端点本身) */
  private segmentClear(a: Point2D, b: Point2D, topo: SchTopology,
    bounds: DevBounds[], margin: number): boolean {
    if (a.x === b.x) {
      const x = a.x;
      const yMin = Math.min(a.y, b.y) + this.gridSize;
      const yMax = Math.max(a.y, b.y) - this.gridSize;
      for (let y = yMin; y <= yMax; y += this.gridSize) {
        for (const db of bounds) {
          if (x >= db.x - margin && x <= db.x + db.w + margin &&
            y >= db.y - margin && y <= db.y + db.h + margin) {
            return false;
          }
        }
      }
    } else if (a.y === b.y) {
      const y = a.y;
      const xMin = Math.min(a.x, b.x) + this.gridSize;
      const xMax = Math.max(a.x, b.x) - this.gridSize;
      for (let x = xMin; x <= xMax; x += this.gridSize) {
        for (const db of bounds) {
          if (x >= db.x - margin && x <= db.x + db.w + margin &&
            y >= db.y - margin && y <= db.y + db.h + margin) {
            return false;
          }
        }
      }
    } else {
      return false;
    }
    return true;
  }

  /** 到最近器件包围盒的最小距离 */
  private minClearance(pt: Point2D, bounds: DevBounds[]): number {
    let minDist = Infinity;
    for (const db of bounds) {
      const cx = Math.max(db.x, Math.min(pt.x, db.x + db.w));
      const cy = Math.max(db.y, Math.min(pt.y, db.y + db.h));
      const dist = Math.hypot(pt.x - cx, pt.y - cy);
      if (dist < minDist) minDist = dist;
    }
    return minDist === Infinity ? 999 : minDist;
  }

  private snapPoint(p: Point2D): Point2D {
    return {
      x: Math.round(p.x / this.gridSize) * this.gridSize,
      y: Math.round(p.y / this.gridSize) * this.gridSize
    };
  }

  private snap(v: number): number {
    return Math.round(v / this.gridSize) * this.gridSize;
  }

  private pathLength(points: Point2D[]): number {
    let len = 0;
    for (let i = 1; i < points.length; i++) {
      len += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
    }
    return len;
  }

  private countCrossings(seg: RouteLine, existing: RouteLine[]): number {
    let count = 0;
    for (const other of existing) {
      if (WireConflictGeometry.wiresConflict(seg, other) !== 'none') {
        count++;
      }
    }
    return count;
  }

  private checkDiffEqualLength(lines: RouteLine[], tasks: NetRouteTask[]): boolean {
    const diffTasks = tasks.filter(t => t.isDiff);
    if (diffTasks.length < 2) return true;
    const lengths = diffTasks.map(t => {
      const seg = lines.find(l => l.netUuid === t.netUuid);
      return seg ? this.pathLength(seg.points) : 0;
    });
    if (lengths.length < 2) return true;
    return Math.abs(lengths[0] - lengths[1]) < 30;
  }

  /** 布线后合规修正 */
  fixViolations(topo: SchTopology, route: RouteResult): RouteResult {
    const fixed = cloneRouteResult(route);
    for (const line of fixed.routeLines) {
      const net = topo.netList.find(n => n.netUuid === line.netUuid);
      const nameUp = (net?.netName ?? '').toUpperCase();
      if (nameUp.includes('XTAL') && line.points.length > 4) {
        const a = line.points[0];
        const b = line.points[line.points.length - 1];
        line.points = [a, { x: b.x, y: a.y }, b];
      }
      if (net?.isPower && line.points.length > 3) {
        line.points = this.simplifyPath(line.points);
      }
    }
    return fixed;
  }
}
