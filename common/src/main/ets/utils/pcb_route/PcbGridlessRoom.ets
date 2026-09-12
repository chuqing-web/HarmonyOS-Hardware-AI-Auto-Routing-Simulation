/**
 * 轻量无网格（shape-based）走廊：膨胀障碍角点可见图 + 欧氏 A*。
 * 对齐路线图阶段四「无网格」子集（非完整 Room 惰性展开）。
 */
import { PcbDocument, PcbLayerId, PcbTrack, PcbVia } from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';
import { pathClearBlockReason, clearanceForNet } from './PcbClearanceOracle';
import { padWorldPosition } from '../PcbZoneUtil';
import { tracePcb, tracePcbWarn } from '../PcbTraceLog';

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function inflateCorners(cx: number, cy: number, r: number): Point2D[] {
  const d = r * 0.7071;
  const out: Point2D[] = [
    { x: cx + r, y: cy },
    { x: cx - r, y: cy },
    { x: cx, y: cy + r },
    { x: cx, y: cy - r },
    { x: cx + d, y: cy + d },
    { x: cx + d, y: cy - d },
    { x: cx - d, y: cy + d },
    { x: cx - d, y: cy - d }
  ];
  return out;
}

function collectPortalNodes(
  doc: PcbDocument,
  layer: PcbLayerId,
  from: Point2D,
  to: Point2D,
  netId: string,
  inflate: number,
  maxNodes: number
): Point2D[] {
  const n0: Point2D = { x: from.x, y: from.y };
  const n1: Point2D = { x: to.x, y: to.y };
  const nodes: Point2D[] = [n0, n1];
  const midX = (from.x + to.x) * 0.5;
  const midY = (from.y + to.y) * 0.5;
  const span = Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y), 200) + inflate * 4;

  for (let fi = 0; fi < doc.footprints.length && nodes.length < maxNodes; fi++) {
    const fp = doc.footprints[fi];
    for (let pi = 0; pi < fp.pads.length; pi++) {
      const pad = fp.pads[pi];
      if ((pad.netId ?? '') === netId) {
        continue;
      }
      const wp = padWorldPosition(fp, pad);
      if (Math.abs(wp.x - midX) > span || Math.abs(wp.y - midY) > span) {
        continue;
      }
      const pr = Math.max(pad.size.x, pad.size.y) * 0.5 + inflate;
      const corners = inflateCorners(wp.x, wp.y, pr);
      for (let k = 0; k < corners.length && nodes.length < maxNodes; k++) {
        nodes.push(corners[k]);
      }
    }
  }

  for (let i = 0; i < doc.vias.length && nodes.length < maxNodes; i++) {
    const v: PcbVia = doc.vias[i];
    if (v.netId === netId) {
      continue;
    }
    if (Math.abs(v.position.x - midX) > span || Math.abs(v.position.y - midY) > span) {
      continue;
    }
    const pr = v.diameter * 0.5 + inflate;
    const corners = inflateCorners(v.position.x, v.position.y, pr);
    for (let k = 0; k < 4 && nodes.length < maxNodes; k++) {
      nodes.push(corners[k]);
    }
  }

  let trkSample = 0;
  for (let i = 0; i < doc.tracks.length && nodes.length < maxNodes && trkSample < 40; i++) {
    const t: PcbTrack = doc.tracks[i];
    if (t.layer !== layer || t.netId === netId) {
      continue;
    }
    const mx = (t.start.x + t.end.x) * 0.5;
    const my = (t.start.y + t.end.y) * 0.5;
    if (Math.abs(mx - midX) > span || Math.abs(my - midY) > span) {
      continue;
    }
    trkSample++;
    const off = t.width * 0.5 + inflate;
    nodes.push({ x: t.start.x, y: t.start.y + off });
    nodes.push({ x: t.start.x, y: t.start.y - off });
    nodes.push({ x: t.end.x + off, y: t.end.y });
    nodes.push({ x: t.end.x - off, y: t.end.y });
  }
  return nodes;
}

function segmentClear(
  doc: PcbDocument,
  layer: PcbLayerId,
  a: Point2D,
  b: Point2D,
  netId: string,
  width: number
): boolean {
  return pathClearBlockReason(
    doc, layer, a, b,
    netId, width, doc.tracks, doc.vias
  ) === null;
}

interface ANode {
  i: number;
  g: number;
  f: number;
}

interface EdgeCand {
  j: number;
  d: number;
}

/**
 * 可见图无网格寻路：允许任意角直连（非强制正交）。
 */
export function routeGridlessVisible(
  doc: PcbDocument,
  layer: PcbLayerId,
  from: Point2D,
  to: Point2D,
  netId: string,
  width: number,
  budgetMs: number = 0
): Point2D[] {
  if (Math.hypot(from.x - to.x, from.y - to.y) < 0.5) {
    return [];
  }
  if (segmentClear(doc, layer, from, to, netId, width)) {
    const p0: Point2D = { x: from.x, y: from.y };
    const p1: Point2D = { x: to.x, y: to.y };
    const direct: Point2D[] = [p0, p1];
    return direct;
  }

  const t0 = Date.now();
  const overBudget = (): boolean => budgetMs > 0 && (Date.now() - t0) > budgetMs;
  const clr = clearanceForNet(doc, netId);
  const inflate = width * 0.5 + clr;
  const nodeCap = budgetMs > 0 && budgetMs <= 160 ? 48 : 96;
  const nodes = collectPortalNodes(doc, layer, from, to, netId, inflate, nodeCap);
  const n = nodes.length;
  if (n < 2) {
    return [];
  }

  const adj: number[][] = [];
  for (let i = 0; i < n; i++) {
    adj.push([]);
  }
  const maxDeg = budgetMs > 0 && budgetMs <= 160 ? 8 : 12;
  for (let i = 0; i < n; i++) {
    if (overBudget()) {
      tracePcbWarn('GRIDLESS_FAIL', `${netId} budget=${budgetMs}ms at adj i=${i}/${n}`);
      return [];
    }
    const cand: EdgeCand[] = [];
    for (let j = i + 1; j < n; j++) {
      const d = dist(nodes[i], nodes[j]);
      if (d < 1 || d > 800) {
        continue;
      }
      if (!segmentClear(doc, layer, nodes[i], nodes[j], netId, width)) {
        continue;
      }
      const ec: EdgeCand = { j: j, d: d };
      cand.push(ec);
    }
    cand.sort((a: EdgeCand, b: EdgeCand) => a.d - b.d);
    const take = Math.min(maxDeg, cand.length);
    for (let k = 0; k < take; k++) {
      adj[i].push(cand[k].j);
      adj[cand[k].j].push(i);
    }
  }

  const parent = new Map<number, number>();
  const gScore = new Map<number, number>();
  const open: ANode[] = [];
  const openMap = new Map<number, number>();
  const closed = new Set<number>();
  gScore.set(0, 0);
  open.push({ i: 0, g: 0, f: dist(nodes[0], nodes[1]) });
  openMap.set(0, 0);

  let steps = 0;
  let reached = false;
  while (open.length > 0 && steps < 2500) {
    if (overBudget()) {
      tracePcbWarn('GRIDLESS_FAIL', `${netId} budget=${budgetMs}ms steps=${steps}`);
      return [];
    }
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bi].f) {
        bi = i;
      }
    }
    const cur = open[bi];
    openMap.delete(cur.i);
    if (bi === open.length - 1) {
      open.pop();
    } else {
      open[bi] = open[open.length - 1];
      open.pop();
    }
    if (closed.has(cur.i)) {
      continue;
    }
    closed.add(cur.i);
    steps++;
    if (cur.i === 1) {
      reached = true;
      break;
    }
    const nbrs = adj[cur.i];
    for (let k = 0; k < nbrs.length; k++) {
      const j = nbrs[k];
      if (closed.has(j)) {
        continue;
      }
      const tg = cur.g + dist(nodes[cur.i], nodes[j]);
      const prev = gScore.get(j);
      if (prev !== undefined && prev <= tg) {
        continue;
      }
      gScore.set(j, tg);
      parent.set(j, cur.i);
      const node: ANode = { i: j, g: tg, f: tg + dist(nodes[j], nodes[1]) };
      const ei = openMap.get(j);
      if (ei !== undefined && ei < open.length) {
        open[ei] = node;
      } else {
        openMap.set(j, open.length);
        open.push(node);
      }
    }
  }

  if (!reached) {
    tracePcbWarn('GRIDLESS_FAIL', `${netId} nodes=${n} steps=${steps}`);
    return [];
  }

  const chain: number[] = [];
  let c = 1;
  while (true) {
    chain.push(c);
    if (c === 0) {
      break;
    }
    const p = parent.get(c);
    if (p === undefined) {
      return [];
    }
    c = p;
  }
  chain.reverse();
  const path: Point2D[] = [];
  for (let i = 0; i < chain.length; i++) {
    path.push({ x: nodes[chain[i]].x, y: nodes[chain[i]].y });
  }
  tracePcb('GRIDLESS_OK', `${netId} pts=${path.length} nodes=${n}`);
  return path;
}
