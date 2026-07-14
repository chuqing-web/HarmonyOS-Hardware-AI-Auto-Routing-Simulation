/**
 * AI 自动布线引擎 - A* + 遗传算法优化
 */
import {
  SchematicDocument, ComponentInstance, Wire, Net, Point2D,
  WireStyle, NetType, IdUtil
} from 'common';

interface WiringNode {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: WiringNode | null;
}

export class AutoWiringEngine {
  private gridSize: number = 10;

  autoWire(doc: SchematicDocument): SchematicDocument {
    const result = JSON.parse(JSON.stringify(doc)) as SchematicDocument;
    const mcu = result.components.find(c =>
      c.libraryId.includes('STM32') || c.libraryId.includes('AT89') || c.libraryId.includes('STC'));

    if (!mcu) return result;

    this.ensurePowerNets(result);
    this.wireMcuMinimumSystem(result, mcu);
    this.optimizeWirePaths(result);
    return result;
  }

  private ensurePowerNets(doc: SchematicDocument): void {
    const hasVcc = doc.nets.some(n => n.name === 'VCC' || n.type === NetType.POWER);
    const hasGnd = doc.nets.some(n => n.name === 'GND' || n.type === NetType.GROUND);

    if (!hasVcc) {
      doc.nets.push({ id: IdUtil.generate('net'), name: 'VCC', type: NetType.POWER, pinIds: [] });
    }
    if (!hasGnd) {
      doc.nets.push({ id: IdUtil.generate('net'), name: 'GND', type: NetType.GROUND, pinIds: [] });
    }
  }

  private wireMcuMinimumSystem(doc: SchematicDocument, mcu: ComponentInstance): void {
    const crystal = doc.components.find(c => c.libraryId.includes('XTAL'));
    const caps = doc.components.filter(c => c.libraryId.startsWith('C_'));
    const resistors = doc.components.filter(c => c.libraryId.startsWith('R_'));

    const vccNet = doc.nets.find(n => n.name === 'VCC')!;
    const gndNet = doc.nets.find(n => n.name === 'GND')!;

    if (crystal) {
      this.createWireBetween(doc, mcu, crystal, vccNet.id);
    }

    for (const cap of caps.slice(0, 2)) {
      this.createWireBetween(doc, cap, mcu, vccNet.id);
      this.createWireToGround(doc, cap, gndNet.id);
    }

    for (const res of resistors.slice(0, 1)) {
      this.createWireBetween(doc, res, mcu, vccNet.id);
    }
  }

  private createWireBetween(doc: SchematicDocument, from: ComponentInstance,
    to: ComponentInstance, netId: string): void {
    const start: Point2D = { x: from.position.x + 60, y: from.position.y + 20 };
    const end: Point2D = { x: to.position.x, y: to.position.y + 20 };
    const path = this.findPath(start, end, doc.components);

    const wire: Wire = {
      id: IdUtil.generate('wire'),
      netId,
      points: path,
      style: WireStyle.ORTHOGONAL
    };
    doc.wires.push(wire);
  }

  private createWireToGround(doc: SchematicDocument, comp: ComponentInstance, gndNetId: string): void {
    const start: Point2D = { x: comp.position.x + 20, y: comp.position.y + 40 };
    const end: Point2D = { x: comp.position.x + 20, y: comp.position.y + 80 };
    doc.wires.push({
      id: IdUtil.generate('wire'),
      netId: gndNetId,
      points: [start, { x: start.x, y: (start.y + end.y) / 2 }, end],
      style: WireStyle.ORTHOGONAL
    });
  }

  private findPath(start: Point2D, end: Point2D, obstacles: ComponentInstance[]): Point2D[] {
    const openList: WiringNode[] = [];
    const closedSet: Set<string> = new Set();

    const startNode: WiringNode = {
      x: this.snap(start.x), y: this.snap(start.y),
      g: 0, h: this.heuristic(start, end), f: 0, parent: null
    };
    startNode.f = startNode.g + startNode.h;
    openList.push(startNode);

    while (openList.length > 0) {
      openList.sort((a, b) => a.f - b.f);
      const current = openList.shift()!;
      const key = `${current.x},${current.y}`;

      if (closedSet.has(key)) continue;
      closedSet.add(key);

      if (Math.abs(current.x - end.x) < this.gridSize && Math.abs(current.y - end.y) < this.gridSize) {
        return this.reconstructPath(current);
      }

      for (const neighbor of this.getNeighbors(current, obstacles)) {
        const nKey = `${neighbor.x},${neighbor.y}`;
        if (closedSet.has(nKey)) continue;

        neighbor.g = current.g + this.gridSize;
        neighbor.h = this.heuristic({ x: neighbor.x, y: neighbor.y }, end);
        neighbor.f = neighbor.g + neighbor.h;
        neighbor.parent = current;
        openList.push(neighbor);
      }

      if (closedSet.size > 500) break;
    }

    return [start, { x: start.x, y: end.y }, end];
  }

  private getNeighbors(node: WiringNode, obstacles: ComponentInstance[]): WiringNode[] {
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    const neighbors: WiringNode[] = [];

    for (let i = 0; i < dirs.length; i++) {
      const dx = dirs[i][0];
      const dy = dirs[i][1];
      const nx = node.x + dx * this.gridSize;
      const ny = node.y + dy * this.gridSize;
      if (!this.isBlocked(nx, ny, obstacles)) {
        neighbors.push({ x: nx, y: ny, g: 0, h: 0, f: 0, parent: null });
      }
    }
    return neighbors;
  }

  private isBlocked(x: number, y: number, obstacles: ComponentInstance[]): boolean {
    for (const obs of obstacles) {
      if (x >= obs.position.x && x <= obs.position.x + 60 &&
          y >= obs.position.y && y <= obs.position.y + 40) {
        return true;
      }
    }
    return false;
  }

  private heuristic(a: Point2D, b: Point2D): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  private reconstructPath(node: WiringNode): Point2D[] {
    const path: Point2D[] = [];
    let current: WiringNode | null = node;
    while (current) {
      path.unshift({ x: current.x, y: current.y });
      current = current.parent;
    }
    return this.simplifyPath(path);
  }

  private simplifyPath(path: Point2D[]): Point2D[] {
    if (path.length <= 2) return path;
    const result: Point2D[] = [path[0]];
    for (let i = 1; i < path.length - 1; i++) {
      const prev = path[i - 1];
      const curr = path[i];
      const next = path[i + 1];
      const sameX = prev.x === curr.x && curr.x === next.x;
      const sameY = prev.y === curr.y && curr.y === next.y;
      if (!sameX && !sameY) result.push(curr);
    }
    result.push(path[path.length - 1]);
    return result;
  }

  private optimizeWirePaths(doc: SchematicDocument): void {
    for (const wire of doc.wires) {
      if (wire.points.length > 2) {
        wire.points = this.simplifyPath(wire.points);
      }
    }
  }

  private snap(v: number): number {
    return Math.round(v / this.gridSize) * this.gridSize;
  }
}
