import { DeviceHitGeometry, SELECTION_HIT_PAD, FOREIGN_PIN_CLEARANCE, WireConflictGeometry, IdUtil, makeRouteLine, Logger } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchTopology, RouteResult, RouteLine, RoutingLlmOutput, RoutingWeightPrefs, Point2D, SpecialNetRule, SpacingIssue, DeviceInst, NetLabelInfo, WorldHitRect, Pin } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { IComponentLibrary } from 'component_library';
import { cloneRouteResult, getNetPriorityValue, netPriorityMapToRecord } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/internal/AiEngineHelpers";
import type { NetPriorityHint } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/internal/AiEngineHelpers";
import { PinWorldResolver } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/PinWorldResolver";
import { TemplateSchematicKit } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/TemplateSchematicKit";
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
    x: number;
    y: number;
    w: number;
    h: number;
}
interface WireOverlapIssue {
    netA: string;
    netB: string;
    atPoint: Point2D;
}
interface ScoredNeighbor {
    node: WiringNode;
    score: number;
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
    private weights: RoutingWeightPrefs = DEFAULT_WEIGHTS;
    private obstacleMap: Set<string> = new Set();
    private existingRoutes: RouteLine[] = [];
    private componentLibrary: IComponentLibrary | null = null;
    /** 缓存本轮拓扑的器件选中区 */
    private hitRects: WorldHitRect[] = [];
    /** 缓存所有引脚世界坐标 (devUuid:pinId → Point2D) */
    private allPinWorld: Map<string, Point2D> = new Map();
    setComponentLibrary(library: IComponentLibrary): void {
        this.componentLibrary = library;
    }
    /**
     * Route with quality gate: 交叉 / 选中区违规则剔除坏网重布，最多 maxRounds 轮。
     * 先剥离非 stub 旧线强制 A* 重布；仍违规则降级 joinByLabel stub。
     */
    routeUntilClean(topo: SchTopology, constraints: RoutingLlmOutput, weights?: RoutingWeightPrefs, netWaypoints?: Map<string, Point2D[]>, maxRounds: number = 3): RouteResult {
        // Phase 0: 丢弃 NetPlan/Semantic 留下的长导线，仅保留 stub，强制纳入 A*
        const stripped = this.stripNonStubWires(topo);
        if (stripped > 0) {
            Logger.info('ConstrainedWiring', `[routeUntilClean] stripped ${stripped} non-stub wires for forced re-route`);
        }
        // Phase 0.5: LLM forceLabel 网直接标号 stub，跳过长线 A*
        const forceLabelUuids = this.resolveForceLabelNetUuids(topo, constraints);
        if (forceLabelUuids.size > 0) {
            const n = this.demoteNetsToLabelStubs(topo, forceLabelUuids);
            Logger.info('ConstrainedWiring', `[routeUntilClean] forceLabel demote ${forceLabelUuids.size} nets (${n} stubs)`);
        }
        let last = this.route(topo, constraints, weights, netWaypoints);
        last = this.fixViolations(topo, last);
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
            topo.wireList = kept;
            const bumped: RoutingWeightPrefs = {
                lineLength: weights?.lineLength ?? DEFAULT_WEIGHTS.lineLength,
                crossPenalty: (weights?.crossPenalty ?? DEFAULT_WEIGHTS.crossPenalty) * (1.5 + round),
                analogDigitalIsolate: weights?.analogDigitalIsolate ?? DEFAULT_WEIGHTS.analogDigitalIsolate,
                xtalShortPath: weights?.xtalShortPath ?? DEFAULT_WEIGHTS.xtalShortPath,
                diffEqualLength: weights?.diffEqualLength ?? DEFAULT_WEIGHTS.diffEqualLength
            };
            // 重布丢弃 waypoints，避免错误弯折点反复穿区
            last = this.route(topo, constraints, bumped, undefined);
            last = this.fixViolations(topo, last);
            topo.wireList = last.routeLines;
        }
        // 仍违规：自动降级为标号+stub，消除交叉/穿区
        const stillBad = this.findViolatingNetUuids(topo, last.routeLines);
        if (stillBad.size > 0) {
            const demoted = this.demoteNetsToLabelStubs(topo, stillBad);
            Logger.warn('ConstrainedWiring', `[routeUntilClean] demoted ${stillBad.size} nets → joinByLabel stubs (${demoted} stubs)`);
            last.routeLines = topo.wireList.slice();
            last.crossCount = 0;
        }
        // 单脚导线端点 >2：多余导线改标号，避免星形扇出
        const capped = this.enforceMaxWiresPerPin(topo, 2);
        if (capped > 0) {
            Logger.info('ConstrainedWiring', `[routeUntilClean] pin fanout cap: converted ${capped} excess wires → labels`);
            last.routeLines = topo.wireList.slice();
        }
        // 扇出截断后若仍穿区：再降级一次（保证门禁可清零）
        const stillAfterCap = this.findViolatingNetUuids(topo, last.routeLines);
        if (stillAfterCap.size > 0) {
            const demoted2 = this.demoteNetsToLabelStubs(topo, stillAfterCap);
            Logger.warn('ConstrainedWiring', `[routeUntilClean] post-cap demote ${stillAfterCap.size} nets (${demoted2} stubs)`);
            last.routeLines = topo.wireList.slice();
            last.crossCount = 0;
        }
        return last;
    }
    /**
     * 单脚最多 maxWires 根导线端点；超出则删掉较长导线，并为失连引脚补标号 stub。
     */
    enforceMaxWiresPerPin(topo: SchTopology, maxWires: number = 2): number {
        this.buildDeviceGeometryCache(topo);
        const PIN_TOL = 8;
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
                const keys = Array.from(this.allPinWorld.keys());
                for (let ki = 0; ki < keys.length; ki++) {
                    const pw = this.allPinWorld.get(keys[ki]);
                    if (!pw) {
                        continue;
                    }
                    if (Math.hypot(ep.x - pw.x, ep.y - pw.y) <= PIN_TOL) {
                        const list = pinToWires.get(keys[ki]) ?? [];
                        if (list.indexOf(wi) < 0) {
                            list.push(wi);
                        }
                        pinToWires.set(keys[ki], list);
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
            }
            else {
                kept.push(topo.wireList[wi]);
            }
        }
        topo.wireList = kept;
        // 被删线的网络：为仍在网内但已无导线端点的引脚补标号
        const netUuids: string[] = Array.from(removedNets);
        for (let ni = 0; ni < netUuids.length; ni++) {
            this.ensureLabelStubsForUnwiredPins(topo, netUuids[ni]);
        }
        return removeIdx.size;
    }
    /** 网络中无任何导线端点触及的引脚 → 补 stub+标号 */
    private ensureLabelStubsForUnwiredPins(topo: SchTopology, netUuid: string): void {
        const net = topo.netList.find(n => n.netUuid === netUuid);
        if (!net) {
            return;
        }
        const PIN_TOL = 8;
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
            const hasLbl = topo.netLabelList.some(l => l.netUuid === netUuid && Math.hypot(l.x - pinPos.x, l.y - pinPos.y) < 50);
            if (hasLbl) {
                continue;
            }
            const hit = this.resolveHitRect(dev);
            const cx = hit.x + hit.w / 2;
            const cy = hit.y + hit.h / 2;
            const dx = pinPos.x - cx;
            const dy = pinPos.y - cy;
            const stubPad = 20;
            let labelPos: Point2D;
            if (Math.abs(dx) >= Math.abs(dy)) {
                labelPos = {
                    x: dx >= 0 ? (hit.x + hit.w + stubPad) : (hit.x - stubPad),
                    y: pinPos.y
                };
            }
            else {
                labelPos = {
                    x: pinPos.x,
                    y: dy >= 0 ? (hit.y + hit.h + stubPad) : (hit.y - stubPad)
                };
            }
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
        }
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
            const nameUp = net.netName.toUpperCase();
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
     * 将冲突网改为标号连接：删长线，为每个引脚建 stub+NetLabel。
     * stub 终点避开异器件选中区。
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
                const labelPos: Point2D = DeviceHitGeometry.stubLabelOutsidePinAvoidForeign(pinPos, hit, this.hitRects, 20);
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
            if (this.wireHitsAnyDeviceSelection(topo, line) || this.countCrossings(line, others) > 0) {
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
        const net = topo.netList.find(n => n.netUuid === line.netUuid);
        if (net) {
            for (const node of net.nodeList) {
                safe.add(`${node.devUuid}:${node.pinId}`);
            }
        }
        // 导线端点附近豁免：避免与邻脚/端点并网点误报
        const ends: Point2D[] = [];
        if (line.points.length > 0) {
            ends.push(line.points[0]);
            ends.push(line.points[line.points.length - 1]);
        }
        const ENDPOINT_EXEMPT = 12;
        const keys = Array.from(this.allPinWorld.keys());
        for (let i = 1; i < line.points.length; i++) {
            const a = line.points[i - 1];
            const b = line.points[i];
            for (let k = 0; k < keys.length; k++) {
                if (safe.has(keys[k])) {
                    continue;
                }
                const pw = this.allPinWorld.get(keys[k]);
                if (!pw) {
                    continue;
                }
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
    /** 点是否落在本网、且属于该选中区器件的引脚逃逸走廊内 */
    private pointInOwnDeviceEscapeCorridor(topo: SchTopology, netUuid: string, pt: Point2D, rect: WorldHitRect): boolean {
        const net = topo.netList.find(n => n.netUuid === netUuid);
        if (!net) {
            return false;
        }
        const hw = Math.max(this.gridSize, 10);
        for (const node of net.nodeList) {
            if (node.devUuid !== rect.instUuid) {
                continue;
            }
            const key = `${node.devUuid}:${node.pinId}`;
            const pw = this.allPinWorld.get(key);
            if (!pw) {
                continue;
            }
            if (DeviceHitGeometry.pointInPinEscapeCorridor(pt.x, pt.y, pw.x, pw.y, rect, hw)) {
                return true;
            }
        }
        return false;
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
            const key = `${node.devUuid}:${node.pinId}`;
            const pw = this.allPinWorld.get(key);
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
    route(topo: SchTopology, constraints: RoutingLlmOutput, weights?: RoutingWeightPrefs, netWaypoints?: Map<string, Point2D[]>): RouteResult {
        this.weights = weights ?? DEFAULT_WEIGHTS;
        this.obstacleMap.clear();
        this.existingRoutes = [];
        this.hitRects = [];
        this.allPinWorld.clear();
        // 仅快照调用前的 stub/旧线；新布线段不得再追加进最终结果（否则整表翻倍）
        const preservedWires: RouteLine[] = [];
        for (let i = 0; i < topo.wireList.length; i++) {
            preservedWires.push(topo.wireList[i]);
            this.existingRoutes.push(topo.wireList[i]);
        }
        this.buildDeviceGeometryCache(topo);
        this.buildObstacleMap(topo);
        const tasks = this.buildNetTasks(topo, constraints);
        tasks.sort((a, b) => b.priority - a.priority);
        const routeLines: RouteLine[] = [];
        let crossCount = 0;
        let totalLength = 0;
        const congestionMap = new Map<string, number>();
        for (const task of tasks) {
            if (task.pinPositions.length < 2)
                continue;
            const wp = netWaypoints ? netWaypoints.get(task.netName) : undefined;
            let segments = this.routeNet(task, topo, wp);
            // 任一段穿区/交叉 → 整网丢弃 waypoints 重试
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
                        seg.points = this.relaxCorners(this.eliminateHairpinTurns(this.simplifyPath(seg.points)), topo);
                    }
                }
                crossCount += this.countCrossings(seg, routeLines);
                totalLength += this.pathLength(seg.points);
                routeLines.push(seg);
                this.markRouteAsObstacle(seg);
                this.updateCongestionMap(seg, congestionMap);
            }
        }
        // 只合并调用前保留的 stub，不重复追加本轮新布线段
        for (let i = 0; i < preservedWires.length; i++) {
            routeLines.push(preservedWires[i]);
        }
        // 后验: 导线穿越器件体检测
        const deviceCollisions = this.checkWireDeviceCollisions(topo, routeLines);
        crossCount += deviceCollisions;
        // 后验: 检测可通过标号简化的高拥塞区域
        const congestionHints = this.buildCongestionHints(congestionMap, routeLines);
        const xtalShort = tasks.filter(t => t.isClock).every(t => {
            const seg = routeLines.find(r => r.netUuid === t.netUuid);
            return seg ? seg.points.length <= 4 : true;
        });
        return {
            routeLines,
            crossCount,
            totalLineLength: totalLength,
            isolateAnalogDigital: constraints.globalConstraint.includes('separate'),
            xtalShortPath: xtalShort,
            diffLineEqualLength: this.checkDiffEqualLength(routeLines, tasks),
            spacingIssues: this.checkParallelSpacing(routeLines)
        };
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
        if (points.length <= 2)
            return points;
        const result: Point2D[] = [points[0]];
        for (let i = 1; i < points.length - 1; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const next = points[i + 1];
            // 检测: prev→curr 和 curr→next 方向相反 (发夹弯)
            const dx1 = curr.x - prev.x;
            const dy1 = curr.y - prev.y;
            const dx2 = next.x - curr.x;
            const dy2 = next.y - curr.y;
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
                    const pw = PinWorldResolver.forDeviceInst(dev, node.pinId, node.pinName ?? node.pinId);
                    connectedPins.add(`${pw.x},${pw.y}`);
                }
            }
        }
        for (const line of lines) {
            for (const pt of line.points) {
                const key = `${pt.x},${pt.y}`;
                if (connectedPins.has(key))
                    continue;
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
            return DeviceHitGeometry.hitRectFromPins(pins, dev.x, dev.y, dev.rotate, dev.mirrorH, SELECTION_HIT_PAD, dev.refName, dev.instUuid, dev.libDevId);
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
        return DeviceHitGeometry.hitRectFromLocalPoints(locals, dev.x, dev.y, dev.rotate, dev.mirrorH, SELECTION_HIT_PAD, dev.refName, dev.instUuid, dev.libDevId);
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
        for (const dev of topo.deviceList) {
            const rect = this.resolveHitRect(dev);
            this.hitRects.push(rect);
            const pins = this.getDevicePins(dev.libDevId);
            if (pins.length > 0) {
                for (let i = 0; i < pins.length; i++) {
                    const p = pins[i];
                    const world = PinWorldResolver.forDeviceInst(dev, p.id, p.name || p.id);
                    this.allPinWorld.set(`${dev.instUuid}:${p.id}`, world);
                }
            }
            else {
                // Kit 回退：至少缓存 1/2 脚
                const fallback = ['1', '2', 'A', 'K'];
                for (let i = 0; i < fallback.length; i++) {
                    const world = PinWorldResolver.forDeviceInst(dev, fallback[i], fallback[i]);
                    this.allPinWorld.set(`${dev.instUuid}:${fallback[i]}`, world);
                }
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
            const nameUp = net.netName.toUpperCase();
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
            const nameUp = hint.netName.toUpperCase();
            if (hint.isClock) {
                priorityMap.set(hint.netName, 9);
            }
            else if (hint.isAnalog) {
                priorityMap.set(hint.netName, 7);
            }
            else if (hint.isPower) {
                priorityMap.set(hint.netName, 10);
            }
            else if (!priorityMap.has(hint.netName)) {
                priorityMap.set(hint.netName, 2);
            }
        }
        const ruleXtal: SpecialNetRule = { netGroup: 'xtal', rule: 'shortest_path,no_cross_analog,min_cross_count' };
        const ruleI2c: SpecialNetRule = { netGroup: 'i2c', rule: 'parallel_equal_length,45deg_line' };
        const rulePower: SpecialNetRule = { netGroup: 'power', rule: 'thick_line,direct_route,no_detour' };
        const specialNetRules: SpecialNetRule[] = [ruleXtal, ruleI2c, rulePower];
        const result: RoutingLlmOutput = {
            netPriority: netPriorityMapToRecord(priorityMap),
            specialNetRules: specialNetRules,
            globalConstraint: 'analog_net_area separate from digital net_area, bus lines parallel',
            forceWireNets: [],
            forceLabelNets: []
        };
        return result;
    }
    private buildNetTasks(topo: SchTopology, constraints: RoutingLlmOutput): NetRouteTask[] {
        const tasks: NetRouteTask[] = [];
        for (const net of topo.netList) {
            // 无真实脚节点则跳过（禁止「前两器件」假连）
            if (net.nodeList.length < 2) {
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
                    continue;
                }
                positions.push(world);
            }
            if (positions.length < 2) {
                continue;
            }
            const nameUp = net.netName.toUpperCase();
            const rules = constraints.specialNetRules
                .filter(r => nameUp.includes(r.netGroup.toUpperCase()) || this.matchNetGroup(nameUp, r.netGroup))
                .map(r => r.rule);
            tasks.push({
                netUuid: net.netUuid,
                netName: net.netName,
                priority: getNetPriorityValue(constraints.netPriority, net.netName, nameUp, net.isPower || nameUp.includes('VCC') || nameUp.includes('GND') || nameUp.includes('VDD'), net.isAnalog),
                rules,
                pinPositions: positions,
                isPower: net.isPower || nameUp.includes('VCC') || nameUp.includes('GND') || nameUp.includes('VDD'),
                isAnalog: net.isAnalog,
                isClock: nameUp.includes('XTAL') || nameUp.includes('CLK'),
                isDiff: nameUp.includes('I2C') || nameUp.includes('SDA') || nameUp.includes('SCL') || nameUp.includes('SPI')
            });
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
        if (g === 'xtal')
            return netName.includes('XTAL') || netName.includes('CLK');
        if (g === 'power')
            return netName.includes('VCC') || netName.includes('GND');
        if (g === 'i2c_sda_scl' || g === 'i2c')
            return netName.includes('I2C') || netName.includes('SDA');
        return netName.includes(g.toUpperCase());
    }
    private routeNet(task: NetRouteTask, topo: SchTopology, waypoints?: Point2D[]): RouteLine[] {
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
        }
        else {
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
        const closedSet: Set<string> = new Set();
        const s = this.snapPoint(start);
        const e = this.snapPoint(end);
        const startNode: WiringNode = {
            x: s.x, y: s.y, g: 0,
            h: this.heuristic(s, e, task), f: 0, parent: null
        };
        startNode.f = startNode.g + startNode.h;
        openList.push(startNode);
        let steps = 0;
        while (openList.length > 0 && steps < 800) {
            // 找最优节点 (最小f)
            let bestIdx = 0;
            for (let oi = 1; oi < openList.length; oi++) {
                if (openList[oi].f < openList[bestIdx].f)
                    bestIdx = oi;
            }
            const current = openList[bestIdx];
            openList.splice(bestIdx, 1);
            const key = `${current.x},${current.y}`;
            if (closedSet.has(key))
                continue;
            closedSet.add(key);
            steps++;
            if (Math.abs(current.x - e.x) < this.gridSize && Math.abs(current.y - e.y) < this.gridSize) {
                const path = this.reconstructPath(current);
                const simplified = this.simplifyPath(path);
                const cleaned = this.eliminateHairpinTurns(simplified);
                return this.relaxCorners(cleaned, topo);
            }
            // 邻居按朝向目标排序: 优先走向终点的方向
            const rawNeighbors = this.getNeighbors(current, task, topo);
            const scoredNeighbors: ScoredNeighbor[] = [];
            for (let ni = 0; ni < rawNeighbors.length; ni++) {
                const n = rawNeighbors[ni];
                const sn: ScoredNeighbor = {
                    node: n,
                    score: Math.abs(n.x - e.x) + Math.abs(n.y - e.y)
                };
                scoredNeighbors.push(sn);
            }
            scoredNeighbors.sort((a: ScoredNeighbor, b: ScoredNeighbor) => a.score - b.score);
            for (const sn of scoredNeighbors) {
                const neighbor = sn.node;
                const nKey = `${neighbor.x},${neighbor.y}`;
                if (closedSet.has(nKey))
                    continue;
                const tentativeG = current.g + this.moveCost(current, neighbor, task);
                // 检查 openList 中是否有更好的路径到此节点
                const existingIdx = openList.findIndex(o => o.x === neighbor.x && o.y === neighbor.y);
                if (existingIdx >= 0 && openList[existingIdx].g <= tentativeG)
                    continue;
                neighbor.g = tentativeG;
                neighbor.h = this.heuristic({ x: neighbor.x, y: neighbor.y }, e, task);
                neighbor.f = neighbor.g + neighbor.h;
                neighbor.parent = current;
                if (existingIdx >= 0) {
                    openList[existingIdx] = neighbor;
                }
                else {
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
        if (this.existingRouteOccupies(key, task.netUuid))
            cost += this.weights.crossPenalty;
        if (task.isClock)
            cost *= 0.5;
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
    private isBlocked(x: number, y: number, task: NetRouteTask, topo: SchTopology): boolean {
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
        const pinKeys = Array.from(this.allPinWorld.keys());
        for (let i = 0; i < pinKeys.length; i++) {
            const pk = pinKeys[i];
            const pw = this.allPinWorld.get(pk);
            if (!pw) {
                continue;
            }
            let isEndpoint = false;
            for (let j = 0; j < task.pinPositions.length; j++) {
                const ep = task.pinPositions[j];
                if (this.snap(pw.x) === this.snap(ep.x) && this.snap(pw.y) === this.snap(ep.y)) {
                    isEndpoint = true;
                    break;
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
        const pinKeys = Array.from(this.allPinWorld.keys());
        for (let i = 0; i < pinKeys.length; i++) {
            const pw = this.allPinWorld.get(pinKeys[i]);
            if (!pw) {
                continue;
            }
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
                if (lines[i].netUuid === lines[j].netUuid)
                    continue;
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
        return this.existingRoutes.some(r => r.netUuid !== ownNetUuid && r.points.some(p => `${p.x},${p.y}` === key));
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
        if (path.length <= 2)
            return path;
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
        if (path.length <= 2)
            return path;
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
                }
                else {
                    // 前一段水平, 后一段垂直 → 拐点可沿 Y 滑动
                    for (const dy of [-20, -10, 10, 20]) {
                        candidates.push({ x: curr.x, y: curr.y + dy });
                    }
                }
                for (const cand of candidates) {
                    if (!this.segmentClear(prev, cand, topo, devBounds, 0))
                        continue;
                    if (!this.segmentClear(cand, next, topo, devBounds, 0))
                        continue;
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
            if (!changed)
                break;
        }
        return path;
    }
    /** 线段是否无障碍 (不穿越器件体, 不含首末端点本身) */
    private segmentClear(a: Point2D, b: Point2D, topo: SchTopology, bounds: DevBounds[], margin: number): boolean {
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
        }
        else if (a.y === b.y) {
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
        }
        else {
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
            if (dist < minDist)
                minDist = dist;
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
        if (diffTasks.length < 2)
            return true;
        const lengths = diffTasks.map(t => {
            const seg = lines.find(l => l.netUuid === t.netUuid);
            return seg ? this.pathLength(seg.points) : 0;
        });
        if (lengths.length < 2)
            return true;
        return Math.abs(lengths[0] - lengths[1]) < 30;
    }
    /** 布线后合规修正 */
    fixViolations(topo: SchTopology, route: RouteResult): RouteResult {
        const fixed = cloneRouteResult(route);
        for (const line of fixed.routeLines) {
            const net = topo.netList.find(n => n.netUuid === line.netUuid);
            const nameUp = net?.netName.toUpperCase() ?? '';
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
