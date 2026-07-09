/**
 * 约束驱动 A* 布线引擎 — LLM 优先级 + 本地路径计算
 */
import {
  SchTopology, RouteResult, RouteLine, RoutingLlmOutput, RoutingWeightPrefs,
  Point2D, SpecialNetRule
} from 'common';
import {
  cloneRouteResult, getNetPriorityValue, NetPriorityHint,
  netPriorityMapToRecord
} from '../internal/AiEngineHelpers';

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

const DEFAULT_WEIGHTS: RoutingWeightPrefs = {
  lineLength: 1.0,
  crossPenalty: 50,
  analogDigitalIsolate: 80,
  xtalShortPath: 100,
  diffEqualLength: 60
};

export class ConstrainedWiringEngine {
  private gridSize: number = 10;
  private weights: RoutingWeightPrefs = DEFAULT_WEIGHTS;
  private obstacleMap: Set<string> = new Set();
  private existingRoutes: RouteLine[] = [];

  route(topo: SchTopology, constraints: RoutingLlmOutput,
    weights?: RoutingWeightPrefs): RouteResult {
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

    for (const task of tasks) {
      if (task.pinPositions.length < 2) continue;
      const segments = this.routeNet(task, topo);
      for (const seg of segments) {
        crossCount += this.countCrossings(seg, routeLines);
        totalLength += this.pathLength(seg.points);
        routeLines.push(seg);
        this.markRouteAsObstacle(seg);
      }
    }

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
      diffLineEqualLength: this.checkDiffEqualLength(routeLines, tasks)
    };
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

    const result: RoutingLlmOutput = {
      netPriority: netPriorityMapToRecord(priorityMap),
      specialNetRules: specialNetRules,
      globalConstraint: 'analog_net_area separate from digital net_area, bus lines parallel'
    };
    return result;
  }

  private buildNetTasks(topo: SchTopology, constraints: RoutingLlmOutput): NetRouteTask[] {
    const tasks: NetRouteTask[] = [];
    for (const net of topo.netList) {
      const positions: Point2D[] = [];
      for (const node of net.nodeList) {
        const dev = topo.deviceList.find(d => d.instUuid === node.devUuid);
        if (dev) positions.push({ x: dev.x + 30, y: dev.y + 20 });
      }
      if (positions.length === 0 && net.nodeList.length === 0) {
        const relatedDevs = topo.deviceList.slice(0, 2);
        relatedDevs.forEach(d => positions.push({ x: d.x + 30, y: d.y + 20 }));
      }

      const nameUp = net.netName.toUpperCase();
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
    return tasks;
  }

  private matchNetGroup(netName: string, group: string): boolean {
    const g = group.toLowerCase();
    if (g === 'xtal') return netName.includes('XTAL') || netName.includes('CLK');
    if (g === 'power') return netName.includes('VCC') || netName.includes('GND');
    if (g === 'i2c_sda_scl' || g === 'i2c') return netName.includes('I2C') || netName.includes('SDA');
    return netName.includes(g.toUpperCase());
  }

  private routeNet(task: NetRouteTask, topo: SchTopology): RouteLine[] {
    const lines: RouteLine[] = [];
    const pts = task.pinPositions;
    for (let i = 0; i < pts.length - 1; i++) {
      const path = this.findPath(pts[i], pts[i + 1], task, topo);
      lines.push({
        netUuid: task.netUuid,
        points: path,
        isBus: task.netName.includes('BUS')
      });
    }
    return lines;
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

    while (openList.length > 0) {
      openList.sort((a, b) => a.f - b.f);
      const current = openList.shift()!;
      const key = `${current.x},${current.y}`;
      if (closedSet.has(key)) continue;
      closedSet.add(key);

      if (Math.abs(current.x - e.x) < this.gridSize && Math.abs(current.y - e.y) < this.gridSize) {
        return this.simplifyPath(this.reconstructPath(current));
      }

      for (const neighbor of this.getNeighbors(current, task, topo)) {
        const nKey = `${neighbor.x},${neighbor.y}`;
        if (closedSet.has(nKey)) continue;
        const tentativeG = current.g + this.moveCost(current, neighbor, task);
        neighbor.g = tentativeG;
        neighbor.h = this.heuristic({ x: neighbor.x, y: neighbor.y }, e, task);
        neighbor.f = neighbor.g + neighbor.h;
        neighbor.parent = current;
        openList.push(neighbor);
      }

      if (closedSet.size > 800) break;
    }

    return task.isPower ? [s, { x: s.x, y: e.y }, e] : [s, e];
  }

  private moveCost(from: WiringNode, to: WiringNode, task: NetRouteTask): number {
    let cost = this.gridSize * this.weights.lineLength;
    const key = `${to.x},${to.y}`;
    if (this.existingRouteOccupies(key)) cost += this.weights.crossPenalty;
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

  private isBlocked(x: number, y: number, task: NetRouteTask, topo: SchTopology): boolean {
    const key = `${x},${y}`;
    if (this.obstacleMap.has(key)) return true;

    for (const dev of topo.deviceList) {
      if (x >= dev.x && x <= dev.x + 80 && y >= dev.y && y <= dev.y + 50) {
        if (task.isPower) return false;
        return true;
      }
    }
    return false;
  }

  private buildObstacleMap(topo: SchTopology): void {
    for (const dev of topo.deviceList) {
      for (let dx = 0; dx <= 80; dx += this.gridSize) {
        for (let dy = 0; dy <= 50; dy += this.gridSize) {
          this.obstacleMap.add(`${this.snap(dev.x + dx)},${this.snap(dev.y + dy)}`);
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

  private existingRouteOccupies(key: string): boolean {
    return this.existingRoutes.some(r => r.points.some(p => `${p.x},${p.y}` === key));
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
      if (other.netUuid === seg.netUuid) continue;
      for (let i = 1; i < seg.points.length; i++) {
        for (let j = 1; j < other.points.length; j++) {
          if (this.segmentsCross(seg.points[i - 1], seg.points[i], other.points[j - 1], other.points[j])) {
            count++;
          }
        }
      }
    }
    return count;
  }

  private segmentsCross(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): boolean {
    return a1.x === a2.x && b1.y === b2.y && a1.x === b1.x && a2.y === b2.y;
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
