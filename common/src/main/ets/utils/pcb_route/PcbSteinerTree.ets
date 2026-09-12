/**
 * 直角 Steiner 近似：曼哈顿 MST + 三点中位 Steiner 迭代。
 * 输出含可选 Steiner 结点的边集，供详细布线按边连接。
 */
import { Point2D } from '../../types/CommonTypes';
import { WarOrderPin } from '../WarRouteOrder';

export interface SteinerNode {
  key: string;
  pt: Point2D;
  /** true=焊盘/实引脚；false=虚拟 Steiner */
  isTerminal: boolean;
}

export interface SteinerEdge {
  aKey: string;
  bKey: string;
  a: Point2D;
  b: Point2D;
}

function manhattan(a: Point2D, b: Point2D): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function median3(a: number, b: number, c: number): number {
  if (a > b) {
    const t = a;
    a = b;
    b = t;
  }
  if (b > c) {
    const t = b;
    b = c;
    c = t;
  }
  if (a > b) {
    const t = a;
    a = b;
    b = t;
  }
  return b;
}

/** Prim 曼哈顿 MST，返回边索引对 */
function manhattanPrimEdges(nodes: SteinerNode[]): number[][] {
  const edges: number[][] = [];
  if (nodes.length < 2) {
    return edges;
  }
  const used: boolean[] = [];
  for (let i = 0; i < nodes.length; i++) {
    used.push(false);
  }
  used[0] = true;
  let usedCount = 1;
  while (usedCount < nodes.length) {
    let bestI = -1;
    let bestJ = -1;
    let bestD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < nodes.length; i++) {
      if (!used[i]) {
        continue;
      }
      for (let j = 0; j < nodes.length; j++) {
        if (used[j]) {
          continue;
        }
        const d = manhattan(nodes[i].pt, nodes[j].pt);
        if (d < bestD) {
          bestD = d;
          bestI = i;
          bestJ = j;
        }
      }
    }
    if (bestJ < 0) {
      break;
    }
    used[bestJ] = true;
    usedCount++;
    edges.push([bestI, bestJ]);
  }
  return edges;
}

function mstLength(nodes: SteinerNode[], edges: number[][]): number {
  let len = 0;
  for (let e = 0; e < edges.length; e++) {
    len += manhattan(nodes[edges[e][0]].pt, nodes[edges[e][1]].pt);
  }
  return len;
}

function edgesToSteiner(nodes: SteinerNode[], edges: number[][]): SteinerEdge[] {
  const out: SteinerEdge[] = [];
  for (let e = 0; e < edges.length; e++) {
    const ai = edges[e][0];
    const bi = edges[e][1];
    const se: SteinerEdge = {
      aKey: nodes[ai].key,
      bKey: nodes[bi].key,
      a: { x: nodes[ai].pt.x, y: nodes[ai].pt.y },
      b: { x: nodes[bi].pt.x, y: nodes[bi].pt.y }
    };
    out.push(se);
  }
  return out;
}

/**
 * 构建直角 Steiner 边集。
 * n≤2：直接边；更大：曼哈顿 MST + 有限次三点中位插入。
 */
export function buildRectilinearSteinerEdges(pins: WarOrderPin[], grid: number = 5): SteinerEdge[] {
  if (pins.length < 2) {
    return [];
  }
  const nodes: SteinerNode[] = [];
  for (let i = 0; i < pins.length; i++) {
    const n: SteinerNode = {
      key: pins[i].key,
      pt: { x: pins[i].pt.x, y: pins[i].pt.y },
      isTerminal: true
    };
    nodes.push(n);
  }
  if (nodes.length === 2) {
    return edgesToSteiner(nodes, [[0, 1]]);
  }

  let bestEdges = manhattanPrimEdges(nodes);
  let bestLen = mstLength(nodes, bestEdges);
  let steinerSeq = 0;
  const maxInsert = Math.min(12, nodes.length * 2);

  for (let round = 0; round < maxInsert; round++) {
    let improved = false;
    const limit = Math.min(nodes.length, pins.length);
    let bestCand: SteinerNode | null = null;
    let bestCandEdges: number[][] | null = null;
    let bestCandLen = bestLen;
    for (let i = 0; i < limit; i++) {
      for (let j = i + 1; j < limit; j++) {
        for (let k = j + 1; k < limit; k++) {
          if (!nodes[i].isTerminal || !nodes[j].isTerminal || !nodes[k].isTerminal) {
            continue;
          }
          const sx = median3(nodes[i].pt.x, nodes[j].pt.x, nodes[k].pt.x);
          const sy = median3(nodes[i].pt.y, nodes[j].pt.y, nodes[k].pt.y);
          let gx = sx;
          let gy = sy;
          if (grid > 0) {
            gx = Math.round(sx / grid) * grid;
            gy = Math.round(sy / grid) * grid;
          }
          let dup = false;
          for (let t = 0; t < nodes.length; t++) {
            if (Math.abs(nodes[t].pt.x - gx) < 0.5 && Math.abs(nodes[t].pt.y - gy) < 0.5) {
              dup = true;
              break;
            }
          }
          if (dup) {
            continue;
          }
          const trial: SteinerNode[] = [];
          for (let t = 0; t < nodes.length; t++) {
            trial.push(nodes[t]);
          }
          const sn: SteinerNode = {
            key: `s${steinerSeq}`,
            pt: { x: gx, y: gy },
            isTerminal: false
          };
          trial.push(sn);
          const trialEdges = manhattanPrimEdges(trial);
          const trialLen = mstLength(trial, trialEdges);
          if (trialLen + 0.5 < bestCandLen) {
            bestCandLen = trialLen;
            bestCand = sn;
            bestCandEdges = trialEdges;
          }
        }
      }
    }
    if (bestCand !== null && bestCandEdges !== null) {
      nodes.push(bestCand);
      steinerSeq++;
      bestEdges = bestCandEdges;
      bestLen = bestCandLen;
      improved = true;
    }
    if (!improved) {
      break;
    }
  }

  // 去掉度为 0/悬挂无用 Steiner 后的边（Prim 已连接全部；剪掉未降低长度的孤立由 MST 自然处理）
  return edgesToSteiner(nodes, bestEdges);
}

/** 仅曼哈顿 MST（无 Steiner 点），边为脚索引对 — 兼容旧 MST API */
export function manhattanPrimPinEdges(pins: WarOrderPin[]): number[][] {
  const nodes: SteinerNode[] = [];
  for (let i = 0; i < pins.length; i++) {
    nodes.push({
      key: pins[i].key,
      pt: pins[i].pt,
      isTerminal: true
    });
  }
  return manhattanPrimEdges(nodes);
}

/** 按边生长序：保证连接已布铜分量（从 0 号终端扩张） */
export function orderSteinerEdgesForRouting(edges: SteinerEdge[]): SteinerEdge[] {
  if (edges.length <= 1) {
    return edges.slice();
  }
  const remaining: SteinerEdge[] = edges.slice();
  const connected: Set<string> = new Set();
  connected.add(remaining[0].aKey);
  connected.add(remaining[0].bKey);
  const ordered: SteinerEdge[] = [remaining[0]];
  remaining.splice(0, 1);
  while (remaining.length > 0) {
    let found = -1;
    for (let i = 0; i < remaining.length; i++) {
      const e = remaining[i];
      if (connected.has(e.aKey) || connected.has(e.bKey)) {
        found = i;
        break;
      }
    }
    if (found < 0) {
      // 断开分量：硬接下一条
      found = 0;
    }
    const pick = remaining[found];
    remaining.splice(found, 1);
    connected.add(pick.aKey);
    connected.add(pick.bKey);
    ordered.push(pick);
  }
  return ordered;
}
