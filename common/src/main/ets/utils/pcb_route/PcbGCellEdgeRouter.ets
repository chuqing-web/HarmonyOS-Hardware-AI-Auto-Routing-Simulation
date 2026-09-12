/**
 * 真 G-Cell 边容量全局布线：边 usage/capacity + 指数拥塞代价 A* + 溢出网重布。
 * 对齐路线图阶段二「全局布线」边模型（非仅 L 重选）。
 */
import { Point2D } from '../../types/CommonTypes';
import { PcbLayerId } from '../../types/PcbTypes';
import { GlobalCongestionMap } from './PcbGlobalRoute';
import {
  GlobalChannelPlan, GlobalNetGuide, GlobalNetSeed
} from './PcbGlobalChannel';
import { assignGlobalChannelsWithCapacity } from './PcbGlobalCapacity';
import { tracePcb } from '../PcbTraceLog';

const BASE_EDGE_CAP = 6;

function congPen(usage: number, capacity: number): number {
  if (capacity <= 0) {
    return 100;
  }
  const r = usage / capacity;
  if (r < 0.5) {
    return 0;
  }
  if (r < 0.8) {
    return 0.5;
  }
  if (r < 1.0) {
    return 2;
  }
  if (r < 1.2) {
    return 10;
  }
  return 100;
}

interface EdgeStore {
  /** H 边：cell (c,r) → (c+1,r)，尺寸 rows*(cols-1) */
  hUsage: number[];
  hCap: number[];
  /** V 边：cell (c,r) → (c,r+1)，尺寸 (rows-1)*cols */
  vUsage: number[];
  vCap: number[];
  cols: number;
  rows: number;
}

function makeEdges(map: GlobalCongestionMap, layer: PcbLayerId): EdgeStore {
  const cols = map.cols;
  const rows = map.rows;
  const hN = rows * Math.max(0, cols - 1);
  const vN = Math.max(0, rows - 1) * cols;
  const hUsage: number[] = [];
  const hCap: number[] = [];
  const vUsage: number[] = [];
  const vCap: number[] = [];
  const dens = map.densityByLayer.get(layer);
  for (let i = 0; i < hN; i++) {
    hUsage.push(0);
    const r = Math.floor(i / Math.max(1, cols - 1));
    const c = i % Math.max(1, cols - 1);
    const d = dens !== undefined ? dens[r * cols + c] : 0;
    hCap.push(Math.max(2, BASE_EDGE_CAP - Math.floor(d * 0.4)));
  }
  for (let i = 0; i < vN; i++) {
    vUsage.push(0);
    const r = Math.floor(i / cols);
    const c = i % cols;
    const d = dens !== undefined ? dens[r * cols + c] : 0;
    vCap.push(Math.max(2, BASE_EDGE_CAP - Math.floor(d * 0.4)));
  }
  return { hUsage, hCap, vUsage, vCap, cols, rows };
}

function hIdx(cols: number, c: number, r: number): number {
  return r * (cols - 1) + c;
}

function vIdx(cols: number, c: number, r: number): number {
  return r * cols + c;
}

interface GCellCoord {
  c: number;
  r: number;
}

function cellOf(map: GlobalCongestionMap, p: Point2D): GCellCoord {
  const c = Math.max(0, Math.min(map.cols - 1, Math.floor((p.x - map.originX) / map.cell)));
  const r = Math.max(0, Math.min(map.rows - 1, Math.floor((p.y - map.originY) / map.cell)));
  const out: GCellCoord = { c: c, r: r };
  return out;
}

function cellCenter(map: GlobalCongestionMap, c: number, r: number): Point2D {
  return {
    x: map.originX + (c + 0.5) * map.cell,
    y: map.originY + (r + 0.5) * map.cell
  };
}

interface GNode {
  c: number;
  r: number;
  g: number;
  f: number;
  parent: GNode | null;
}

/** 在单层 GCell 图上 A*（边代价含拥塞） */
function astarGCell(
  map: GlobalCongestionMap,
  edges: EdgeStore,
  sc: number,
  sr: number,
  ec: number,
  er: number,
  maxSteps: number = 4000
): GCellCoord[] {
  if (sc === ec && sr === er) {
    const single: GCellCoord = { c: sc, r: sr };
    const arr: GCellCoord[] = [single];
    return arr;
  }
  const open: GNode[] = [];
  const openMap = new Map<string, number>();
  const closed = new Set<string>();
  const h0 = Math.abs(ec - sc) + Math.abs(er - sr);
  const start: GNode = { c: sc, r: sr, g: 0, f: h0, parent: null };
  open.push(start);
  openMap.set(`${sc},${sr}`, 0);
  let steps = 0;
  let found: GNode | null = null;
  const dirs: number[][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  while (open.length > 0 && steps < maxSteps) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bi].f) {
        bi = i;
      }
    }
    const cur = open[bi];
    const ck = `${cur.c},${cur.r}`;
    openMap.delete(ck);
    if (bi === open.length - 1) {
      open.pop();
    } else {
      open[bi] = open[open.length - 1];
      open.pop();
    }
    if (closed.has(ck)) {
      continue;
    }
    closed.add(ck);
    steps++;
    if (cur.c === ec && cur.r === er) {
      found = cur;
      break;
    }
    for (let di = 0; di < 4; di++) {
      const nc = cur.c + dirs[di][0];
      const nr = cur.r + dirs[di][1];
      if (nc < 0 || nr < 0 || nc >= edges.cols || nr >= edges.rows) {
        continue;
      }
      const nk = `${nc},${nr}`;
      if (closed.has(nk)) {
        continue;
      }
      let edgeCost = 1;
      if (dirs[di][0] === 1) {
        const i = hIdx(edges.cols, cur.c, cur.r);
        edgeCost += congPen(edges.hUsage[i], edges.hCap[i]);
      } else if (dirs[di][0] === -1) {
        const i = hIdx(edges.cols, nc, nr);
        edgeCost += congPen(edges.hUsage[i], edges.hCap[i]);
      } else if (dirs[di][1] === 1) {
        const i = vIdx(edges.cols, cur.c, cur.r);
        edgeCost += congPen(edges.vUsage[i], edges.vCap[i]);
      } else {
        const i = vIdx(edges.cols, nc, nr);
        edgeCost += congPen(edges.vUsage[i], edges.vCap[i]);
      }
      const tg = cur.g + edgeCost;
      const ei = openMap.get(nk);
      if (ei !== undefined && ei < open.length && open[ei].g <= tg) {
        continue;
      }
      const hh = Math.abs(ec - nc) + Math.abs(er - nr);
      const node: GNode = { c: nc, r: nr, g: tg, f: tg + hh, parent: cur };
      if (ei !== undefined && ei < open.length) {
        open[ei] = node;
      } else {
        openMap.set(nk, open.length);
        open.push(node);
      }
    }
  }
  if (found === null) {
    return [];
  }
  const path: GCellCoord[] = [];
  let w: GNode | null = found;
  while (w !== null) {
    const cell: GCellCoord = { c: w.c, r: w.r };
    path.push(cell);
    w = w.parent;
  }
  path.reverse();
  return path;
}

function stampCellPath(edges: EdgeStore, cells: GCellCoord[]): void {
  for (let i = 0; i < cells.length - 1; i++) {
    const a = cells[i];
    const b = cells[i + 1];
    if (b.c === a.c + 1 && b.r === a.r) {
      edges.hUsage[hIdx(edges.cols, a.c, a.r)] += 1;
    } else if (b.c === a.c - 1 && b.r === a.r) {
      edges.hUsage[hIdx(edges.cols, b.c, b.r)] += 1;
    } else if (b.r === a.r + 1 && b.c === a.c) {
      edges.vUsage[vIdx(edges.cols, a.c, a.r)] += 1;
    } else if (b.r === a.r - 1 && b.c === a.c) {
      edges.vUsage[vIdx(edges.cols, b.c, b.r)] += 1;
    }
  }
}

function unstampCellPath(edges: EdgeStore, cells: GCellCoord[]): void {
  for (let i = 0; i < cells.length - 1; i++) {
    const a = cells[i];
    const b = cells[i + 1];
    if (b.c === a.c + 1 && b.r === a.r) {
      const i2 = hIdx(edges.cols, a.c, a.r);
      edges.hUsage[i2] = Math.max(0, edges.hUsage[i2] - 1);
    } else if (b.c === a.c - 1 && b.r === a.r) {
      const i2 = hIdx(edges.cols, b.c, b.r);
      edges.hUsage[i2] = Math.max(0, edges.hUsage[i2] - 1);
    } else if (b.r === a.r + 1 && b.c === a.c) {
      const i2 = vIdx(edges.cols, a.c, a.r);
      edges.vUsage[i2] = Math.max(0, edges.vUsage[i2] - 1);
    } else if (b.r === a.r - 1 && b.c === a.c) {
      const i2 = vIdx(edges.cols, b.c, b.r);
      edges.vUsage[i2] = Math.max(0, edges.vUsage[i2] - 1);
    }
  }
}

function compressCells(cells: GCellCoord[]): GCellCoord[] {
  if (cells.length <= 2) {
    return cells.slice();
  }
  const out: GCellCoord[] = [cells[0]];
  for (let i = 1; i < cells.length - 1; i++) {
    const p = out[out.length - 1];
    const c = cells[i];
    const n = cells[i + 1];
    const ax = c.c - p.c;
    const ay = c.r - p.r;
    const bx = n.c - c.c;
    const by = n.r - c.r;
    if (ax === bx && ay === by) {
      continue;
    }
    out.push(c);
  }
  out.push(cells[cells.length - 1]);
  return out;
}

function pathOverflow(edges: EdgeStore, cells: GCellCoord[]): boolean {
  for (let i = 0; i < cells.length - 1; i++) {
    const a = cells[i];
    const b = cells[i + 1];
    let u = 0;
    let cap = 1;
    if (b.c === a.c + 1 && b.r === a.r) {
      const i2 = hIdx(edges.cols, a.c, a.r);
      u = edges.hUsage[i2];
      cap = edges.hCap[i2];
    } else if (b.c === a.c - 1 && b.r === a.r) {
      const i2 = hIdx(edges.cols, b.c, b.r);
      u = edges.hUsage[i2];
      cap = edges.hCap[i2];
    } else if (b.r === a.r + 1 && b.c === a.c) {
      const i2 = vIdx(edges.cols, a.c, a.r);
      u = edges.vUsage[i2];
      cap = edges.vCap[i2];
    } else if (b.r === a.r - 1 && b.c === a.c) {
      const i2 = vIdx(edges.cols, b.c, b.r);
      u = edges.vUsage[i2];
      cap = edges.vCap[i2];
    }
    if (u > cap) {
      return true;
    }
  }
  return false;
}

interface RoutedEdgeNet {
  seed: GlobalNetSeed;
  cellsH: GCellCoord[];
  cellsV: GCellCoord[];
  preferHFirst: boolean;
  waypoints: Point2D[];
}

/**
 * 边容量全局：H/V 两层各自 GCell A*，多轮拆溢出网重布。
 * 失败回退到 L 容量分配。
 */
export function assignGlobalChannelsEdgeAware(
  map: GlobalCongestionMap,
  seeds: GlobalNetSeed[],
  ripRounds: number = 2
): GlobalChannelPlan {
  if (seeds.length === 0 || map.cols < 2 || map.rows < 2) {
    return assignGlobalChannelsWithCapacity(map, seeds, 3);
  }

  const edgeByLayer: Map<string, EdgeStore> = new Map();
  const getE = (layer: PcbLayerId): EdgeStore => {
    let e = edgeByLayer.get(layer);
    if (e === undefined) {
      e = makeEdges(map, layer);
      edgeByLayer.set(layer, e);
    }
    return e;
  };

  const ordered = seeds.slice().sort((a: GlobalNetSeed, b: GlobalNetSeed) => {
    const da = Math.abs(a.a.x - a.b.x) + Math.abs(a.a.y - a.b.y);
    const db = Math.abs(b.a.x - b.b.x) + Math.abs(b.a.y - b.b.y);
    return da - db;
  });

  let routed: RoutedEdgeNet[] = [];

  const routeOne = (s: GlobalNetSeed): RoutedEdgeNet | null => {
    const sa = cellOf(map, s.a);
    const sb = cellOf(map, s.b);
    const eH = getE(s.layerH);
    const eV = getE(s.layerV);
    // 方案 A：先 H 层到同列/同行折点再 V —— 取代价更低的 L 骨架 + 边 A* 细化
    // 简化：整段在「混合层」上用偏好：优先在 H 层走水平多的路径
    // 实现：在 layerH 上做完整 A*，若过差则 layerV；路径点映射 waypoints
    const pathH = astarGCell(map, eH, sa.c, sa.r, sb.c, sb.r);
    const pathV = astarGCell(map, eV, sa.c, sa.r, sb.c, sb.r);
    let cells = pathH;
    let preferH = true;
    let useLayer = s.layerH;
    if (pathH.length === 0 && pathV.length === 0) {
      return null;
    }
    if (pathH.length === 0) {
      cells = pathV;
      preferH = false;
      useLayer = s.layerV;
    } else if (pathV.length > 0) {
      // 粗比：路径长 + 末尾边拥塞
      const score = (p: GCellCoord[], e: EdgeStore): number => {
        let c = p.length;
        if (p.length >= 2) {
          stampCellPath(e, p);
          const over = pathOverflow(e, p) ? 50 : 0;
          unstampCellPath(e, p);
          c += over;
        }
        return c;
      };
      if (score(pathV, eV) < score(pathH, eH)) {
        cells = pathV;
        preferH = false;
        useLayer = s.layerV;
      }
    }
    const comp = compressCells(cells);
    const wps: Point2D[] = [];
    wps.push({ x: s.a.x, y: s.a.y });
    for (let i = 0; i < comp.length; i++) {
      wps.push(cellCenter(map, comp[i].c, comp[i].r));
    }
    wps.push({ x: s.b.x, y: s.b.y });
    stampCellPath(getE(useLayer), cells);
    return {
      seed: s,
      cellsH: preferH ? cells : [],
      cellsV: preferH ? [] : cells,
      preferHFirst: preferH,
      waypoints: wps
    };
  };

  for (let i = 0; i < ordered.length; i++) {
    const one = routeOne(ordered[i]);
    if (one !== null) {
      routed.push(one);
    }
  }

  // 溢出拆线重布
  for (let round = 0; round < ripRounds; round++) {
    const overflowNets: RoutedEdgeNet[] = [];
    const keep: RoutedEdgeNet[] = [];
    for (let i = 0; i < routed.length; i++) {
      const r = routed[i];
      const cells = r.cellsH.length > 0 ? r.cellsH : r.cellsV;
      const layer = r.preferHFirst ? r.seed.layerH : r.seed.layerV;
      const e = getE(layer);
      if (cells.length >= 2 && pathOverflow(e, cells)) {
        unstampCellPath(e, cells);
        overflowNets.push(r);
      } else {
        keep.push(r);
      }
    }
    if (overflowNets.length === 0) {
      break;
    }
    // 短网优先重布
    overflowNets.sort((a: RoutedEdgeNet, b: RoutedEdgeNet) => {
      const da = Math.abs(a.seed.a.x - a.seed.b.x) + Math.abs(a.seed.a.y - a.seed.b.y);
      const db = Math.abs(b.seed.a.x - b.seed.b.x) + Math.abs(b.seed.a.y - b.seed.b.y);
      return da - db;
    });
    routed = keep;
    for (let i = 0; i < overflowNets.length; i++) {
      const one = routeOne(overflowNets[i].seed);
      if (one !== null) {
        routed.push(one);
      }
    }
    tracePcb('GCELL_EDGE_RIP', `round=${round + 1} overflow=${overflowNets.length} kept=${routed.length}`);
  }

  const guides: Map<string, GlobalNetGuide> = new Map();
  let reserved = 0;
  for (let i = 0; i < routed.length; i++) {
    const r = routed[i];
    const cells = r.cellsH.length > 0 ? r.cellsH : r.cellsV;
    reserved += Math.max(0, cells.length - 1);
    guides.set(r.seed.netId, {
      netId: r.seed.netId,
      waypoints: r.waypoints,
      preferHFirst: r.preferHFirst,
      reservedCells: Math.max(0, cells.length - 1)
    });
  }

  // 对未进 guides 的 seed 回退 L
  const missing: GlobalNetSeed[] = [];
  for (let i = 0; i < seeds.length; i++) {
    if (!guides.has(seeds[i].netId)) {
      missing.push(seeds[i]);
    }
  }
  if (missing.length > 0) {
    const fb = assignGlobalChannelsWithCapacity(map, missing, 2);
    fb.guides.forEach((g: GlobalNetGuide, id: string) => {
      guides.set(id, g);
      reserved += g.reservedCells;
    });
  }

  tracePcb('GCELL_EDGE',
    `nets=${seeds.length} guides=${guides.size} edgesReserved≈${reserved} ripRounds=${ripRounds}`);
  return { guides, reservedTotal: reserved };
}
