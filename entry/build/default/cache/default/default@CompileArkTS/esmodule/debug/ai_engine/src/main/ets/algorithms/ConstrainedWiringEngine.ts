import type { SchTopology, RouteResult, RouteLine, RoutingLlmOutput, RoutingWeightPrefs, Point2D, SpecialNetRule, SpacingIssue } from 'common';
import { cloneRouteResult, getNetPriorityValue, netPriorityMapToRecord } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/internal/AiEngineHelpers";
import type { NetPriorityHint } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/internal/AiEngineHelpers";
import { PinWorldResolver } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/PinWorldResolver";
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
    /**
     * Route all nets in the topology.
     * @param netWaypoints Optional AI-suggested waypoints keyed by net name.
     *   The routing engine will try to route through these points in order.
     */
    route(topo: SchTopology, constraints: RoutingLlmOutput, weights?: RoutingWeightPrefs, netWaypoints?: Map<string, Point2D[]>): RouteResult {
        this.weights = weights ?? DEFAULT_WEIGHTS;
        this.obstacleMap.clear();
        this.existingRoutes = [];
        for (let i = 0; i < topo.wireList.length; i++) {
            this.existingRoutes.push(topo.wireList[i]);
        }
        this.buildObstacleMap(topo);
        const tasks = this.buildNetTasks(topo, constraints);
        tasks.sort((a, b) => b.priority - a.priority);
        const routeLines: RouteLine[] = [];
        let crossCount = 0;
        let totalLength = 0;
        // 拥塞图: 跟踪每个 50×50 格内的导线密度
        const congestionMap = new Map<string, number>();
        for (const task of tasks) {
            if (task.pinPositions.length < 2)
                continue;
            const wp = netWaypoints ? netWaypoints.get(task.netName) : undefined;
            const segments = this.routeNet(task, topo, wp);
            for (const seg of segments) {
                // 拥塞感知: 优先选择低密度路径
                const simplified = this.simplifyPath(seg.points);
                const cleaned = this.eliminateHairpinTurns(simplified);
                seg.points = this.relaxCorners(cleaned, topo);
                crossCount += this.countCrossings(seg, routeLines);
                totalLength += this.pathLength(seg.points);
                routeLines.push(seg);
                this.markRouteAsObstacle(seg);
                // 更新拥塞图
                this.updateCongestionMap(seg, congestionMap);
            }
        }
        // 保留语义建网已有导线
        for (let i = 0; i < this.existingRoutes.length; i++) {
            routeLines.push(this.existingRoutes[i]);
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
        const devBounds = this.collectDeviceBounds(topo);
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
                for (const db of devBounds) {
                    if (pt.x >= db.x && pt.x <= db.x + db.w &&
                        pt.y >= db.y && pt.y <= db.y + db.h) {
                        collisions++;
                        break;
                    }
                }
            }
        }
        return collisions;
    }
    /** 收集器件包围盒 (旋转感知) */
    private collectDeviceBounds(topo: SchTopology): DevBounds[] {
        const bounds: DevBounds[] = [];
        for (const dev of topo.deviceList) {
            bounds.push(this.deviceBoundsAt(dev.x, dev.y, dev.rotate));
        }
        return bounds;
    }
    /**
     * 器件包围盒 — 以 (x,y) 为中心, 含选中边距。
     * 器件坐标 (dev.x, dev.y) 是中心点, 引脚局部坐标相对中心偏移 (如电阻 ±30mil)。
     * 包围盒须覆盖整个器件符号体 + 选中区边距, 确保布线 A* 不会穿越器件可选中范围。
     */
    private deviceBoundsAt(x: number, y: number, rot: number): DevBounds {
        const swapped = rot === 90 || rot === 270;
        const w = swapped ? 60 : 110;
        const h = swapped ? 110 : 60;
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
            globalConstraint: 'analog_net_area separate from digital net_area, bus lines parallel'
        };
        return result;
    }
    private buildNetTasks(topo: SchTopology, constraints: RoutingLlmOutput): NetRouteTask[] {
        const tasks: NetRouteTask[] = [];
        const netsWithExistingWire = new Set<string>();
        for (let wi = 0; wi < topo.wireList.length; wi++) {
            netsWithExistingWire.add(topo.wireList[wi].netUuid);
        }
        for (const net of topo.netList) {
            // 已由 SemanticNetBuilder / Kit 画好的网不再用假坐标重布
            if (netsWithExistingWire.has(net.netUuid)) {
                continue;
            }
            // 无真实脚节点则跳过（禁止「前两器件」假连）
            if (net.nodeList.length < 2) {
                continue;
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
        // 允许当前 net 的引脚位置可到达 (引脚可能在器件体边界上/内, 必须在障碍物检查之前)
        for (const pp of task.pinPositions) {
            if (Math.abs(x - pp.x) < this.gridSize && Math.abs(y - pp.y) < this.gridSize) {
                return false;
            }
        }
        const key = `${x},${y}`;
        if (this.obstacleMap.has(key))
            return true;
        for (const dev of topo.deviceList) {
            const rot = dev.rotate;
            const db = this.deviceBoundsAt(dev.x, dev.y, rot);
            if (x >= db.x && x <= db.x + db.w && y >= db.y && y <= db.y + db.h) {
                return true;
            }
        }
        return false;
    }
    private buildObstacleMap(topo: SchTopology): void {
        for (const dev of topo.deviceList) {
            const rot = dev.rotate;
            const db = this.deviceBoundsAt(dev.x, dev.y, rot);
            for (let dx = 0; dx <= db.w; dx += this.gridSize) {
                for (let dy = 0; dy <= db.h; dy += this.gridSize) {
                    this.obstacleMap.add(`${this.snap(db.x + dx)},${this.snap(db.y + dy)}`);
                }
            }
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
            if (other.netUuid === seg.netUuid)
                continue;
            // 同 net 的不同段可以共享路径
            for (let i = 1; i < seg.points.length; i++) {
                for (let j = 1; j < other.points.length; j++) {
                    if (this.segmentsOverlap(seg.points[i - 1], seg.points[i], other.points[j - 1], other.points[j])) {
                        count++;
                    }
                }
            }
        }
        return count;
    }
    /** 检测两段是否重叠/交叉: 正交穿越 + 共线重叠 (不同 net 导线不可共享路径) */
    private segmentsOverlap(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): boolean {
        // 正交穿越: 水平 vs 垂直在交点处交叉
        if (a1.x === a2.x && b1.y === b2.y) {
            const x = a1.x;
            const y = b1.y;
            if (this.between(x, Math.min(a1.y, a2.y), Math.max(a1.y, a2.y)) &&
                this.between(y, Math.min(b1.x, b2.x), Math.max(b1.x, b2.x))) {
                return true;
            }
        }
        if (a1.y === a2.y && b1.x === b2.x) {
            const x = b1.x;
            const y = a1.y;
            if (this.between(x, Math.min(a1.x, a2.x), Math.max(a1.x, a2.x)) &&
                this.between(y, Math.min(b1.y, b2.y), Math.max(b1.y, b2.y))) {
                return true;
            }
        }
        // 共线重叠: 同方向线段共享路径点
        if (a1.x === a2.x && b1.x === b2.x && a1.x === b1.x) {
            const aMin = Math.min(a1.y, a2.y);
            const aMax = Math.max(a1.y, a2.y);
            const bMin = Math.min(b1.y, b2.y);
            const bMax = Math.max(b1.y, b2.y);
            if (aMax >= bMin && bMax >= aMin)
                return true;
        }
        if (a1.y === a2.y && b1.y === b2.y && a1.y === b1.y) {
            const aMin = Math.min(a1.x, a2.x);
            const aMax = Math.max(a1.x, a2.x);
            const bMin = Math.min(b1.x, b2.x);
            const bMax = Math.max(b1.x, b2.x);
            if (aMax >= bMin && bMax >= aMin)
                return true;
        }
        return false;
    }
    private between(v: number, lo: number, hi: number): boolean {
        return v >= lo - 1 && v <= hi + 1;
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
