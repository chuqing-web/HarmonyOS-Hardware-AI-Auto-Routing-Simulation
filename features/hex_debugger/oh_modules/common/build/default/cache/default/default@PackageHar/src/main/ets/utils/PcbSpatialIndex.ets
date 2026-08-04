/**
 * PCB 四叉树空间索引 — 加速拾取与视口查询
 */
export interface PcbSpatialRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export enum PcbSpatialKind {
  TRACK = 'track',
  VIA = 'via',
  FOOTPRINT = 'fp',
  ZONE = 'zone',
  PAD = 'pad'
}

export interface PcbSpatialItem {
  id: string;
  kind: PcbSpatialKind;
  /** 宿主对象 id（track/via/fp/zone） */
  refId: string;
  rect: PcbSpatialRect;
}

class QuadNode {
  bounds: PcbSpatialRect;
  items: PcbSpatialItem[] = [];
  children: QuadNode[] | null = null;
  private depth: number;
  private maxItems: number;
  private maxDepth: number;

  constructor(bounds: PcbSpatialRect, depth: number, maxItems: number, maxDepth: number) {
    this.bounds = bounds;
    this.depth = depth;
    this.maxItems = maxItems;
    this.maxDepth = maxDepth;
  }

  insert(item: PcbSpatialItem): void {
    if (!rectsOverlap(this.bounds, item.rect)) return;
    if (this.children === null) {
      this.items.push(item);
      if (this.items.length > this.maxItems && this.depth < this.maxDepth) {
        this.split();
      }
      return;
    }
    for (let i = 0; i < 4; i++) {
      this.children[i].insert(item);
    }
  }

  private split(): void {
    const b = this.bounds;
    const mx = (b.x1 + b.x2) / 2;
    const my = (b.y1 + b.y2) / 2;
    const d = this.depth + 1;
    this.children = [
      new QuadNode({ x1: b.x1, y1: b.y1, x2: mx, y2: my }, d, this.maxItems, this.maxDepth),
      new QuadNode({ x1: mx, y1: b.y1, x2: b.x2, y2: my }, d, this.maxItems, this.maxDepth),
      new QuadNode({ x1: b.x1, y1: my, x2: mx, y2: b.y2 }, d, this.maxItems, this.maxDepth),
      new QuadNode({ x1: mx, y1: my, x2: b.x2, y2: b.y2 }, d, this.maxItems, this.maxDepth)
    ];
    const old = this.items;
    this.items = [];
    for (let i = 0; i < old.length; i++) {
      for (let c = 0; c < 4; c++) {
        this.children[c].insert(old[i]);
      }
    }
  }

  query(rect: PcbSpatialRect, out: PcbSpatialItem[], seen: Set<string>): void {
    if (!rectsOverlap(this.bounds, rect)) return;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (!rectsOverlap(it.rect, rect)) continue;
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      out.push(it);
    }
    if (this.children !== null) {
      for (let c = 0; c < 4; c++) {
        this.children[c].query(rect, out, seen);
      }
    }
  }
}

function rectsOverlap(a: PcbSpatialRect, b: PcbSpatialRect): boolean {
  return !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2);
}

function expandPoint(x: number, y: number, r: number): PcbSpatialRect {
  return { x1: x - r, y1: y - r, x2: x + r, y2: y + r };
}

export class PcbSpatialIndex {
  private root: QuadNode | null = null;
  private version: number = 0;

  getVersion(): number {
    return this.version;
  }

  clear(): void {
    this.root = null;
    this.version++;
  }

  rebuild(bounds: PcbSpatialRect, items: PcbSpatialItem[]): void {
    const pad = 200;
    const b: PcbSpatialRect = {
      x1: bounds.x1 - pad,
      y1: bounds.y1 - pad,
      x2: bounds.x2 + pad,
      y2: bounds.y2 + pad
    };
    if (b.x2 <= b.x1) {
      b.x1 = -1000;
      b.x2 = 5000;
    }
    if (b.y2 <= b.y1) {
      b.y1 = -1000;
      b.y2 = 5000;
    }
    this.root = new QuadNode(b, 0, 12, 8);
    for (let i = 0; i < items.length; i++) {
      this.root.insert(items[i]);
    }
    this.version++;
  }

  queryRect(rect: PcbSpatialRect): PcbSpatialItem[] {
    const out: PcbSpatialItem[] = [];
    if (!this.root) return out;
    const seen = new Set<string>();
    this.root.query(rect, out, seen);
    return out;
  }

  queryPoint(x: number, y: number, radius: number): PcbSpatialItem[] {
    return this.queryRect(expandPoint(x, y, radius));
  }

  static trackRect(ax: number, ay: number, bx: number, by: number, halfW: number): PcbSpatialRect {
    return {
      x1: Math.min(ax, bx) - halfW,
      y1: Math.min(ay, by) - halfW,
      x2: Math.max(ax, bx) + halfW,
      y2: Math.max(ay, by) + halfW
    };
  }

  static viaRect(x: number, y: number, diameter: number): PcbSpatialRect {
    const r = diameter / 2;
    return expandPoint(x, y, r);
  }
}
