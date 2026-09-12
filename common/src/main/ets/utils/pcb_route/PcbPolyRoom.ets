/**
 * 多边形自由空间 Room：射线采样星形自由域 + 顶点可见图。
 * 比 AABB Room 更贴障碍轮廓；对齐路线图阶段四 Room 多边形子集。
 */
import { PcbDocument, PcbLayerId, PcbTrack, PcbVia } from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';
import { pathClearBlockReason, clearanceForNet } from './PcbClearanceOracle';
import { padWorldPosition } from '../PcbZoneUtil';
import { tracePcb, tracePcbWarn } from '../PcbTraceLog';

interface Blocker {
  x: number;
  y: number;
  r: number;
}

interface EdgeCand {
  j: number;
  d: number;
}

interface AStarOpenNode {
  i: number;
  g: number;
  f: number;
}

function collectBlockers(
  doc: PcbDocument,
  layer: PcbLayerId,
  center: Point2D,
  netId: string,
  radius: number
): Blocker[] {
  const out: Blocker[] = [];
  const clr = clearanceForNet(doc, netId);
  for (let fi = 0; fi < doc.footprints.length; fi++) {
    const fp = doc.footprints[fi];
    for (let pi = 0; pi < fp.pads.length; pi++) {
      const pad = fp.pads[pi];
      if ((pad.netId ?? '') === netId) {
        continue;
      }
      const wp = padWorldPosition(fp, pad);
      if (Math.hypot(wp.x - center.x, wp.y - center.y) > radius) {
        continue;
      }
      out.push({
        x: wp.x,
        y: wp.y,
        r: Math.max(pad.size.x, pad.size.y) * 0.5 + clr
      });
    }
  }
  for (let i = 0; i < doc.vias.length; i++) {
    const v: PcbVia = doc.vias[i];
    if (v.netId === netId) {
      continue;
    }
    if (Math.hypot(v.position.x - center.x, v.position.y - center.y) > radius) {
      continue;
    }
    out.push({ x: v.position.x, y: v.position.y, r: v.diameter * 0.5 + clr });
  }
  for (let i = 0; i < doc.tracks.length; i++) {
    const t: PcbTrack = doc.tracks[i];
    if (t.layer !== layer || t.netId === netId) {
      continue;
    }
    const mx = (t.start.x + t.end.x) * 0.5;
    const my = (t.start.y + t.end.y) * 0.5;
    if (Math.hypot(mx - center.x, my - center.y) > radius) {
      continue;
    }
    out.push({ x: mx, y: my, r: t.width * 0.5 + clr + 4 });
  }
  return out;
}

function rayHitDist(ox: number, oy: number, ux: number, uy: number, blockers: Blocker[],
  maxR: number, halfW: number): number {
  let best = maxR;
  for (let i = 0; i < blockers.length; i++) {
    const b = blockers[i];
    const rr = b.r + halfW;
    // 射线-圆交：|O+tD - C|^2 = rr^2
    const fx = ox - b.x;
    const fy = oy - b.y;
    const a = ux * ux + uy * uy;
    const bb = 2 * (fx * ux + fy * uy);
    const c = fx * fx + fy * fy - rr * rr;
    const disc = bb * bb - 4 * a * c;
    if (disc < 0) {
      continue;
    }
    const s = Math.sqrt(disc);
    const t1 = (-bb - s) / (2 * a);
    const t2 = (-bb + s) / (2 * a);
    if (t1 > 1 && t1 < best) {
      best = t1;
    }
    if (t2 > 1 && t2 < best) {
      best = t2;
    }
  }
  return Math.max(halfW * 2, best - 1);
}

function segClear(
  doc: PcbDocument,
  layer: PcbLayerId,
  a: Point2D,
  b: Point2D,
  netId: string,
  width: number
): boolean {
  return pathClearBlockReason(doc, layer, a, b, netId, width, doc.tracks, doc.vias) === null;
}

/**
 * 从走廊中点采样 16 向星形自由多边形，再在顶点上做可见图 A*。
 */
export function routePolyRoom(
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
  if (segClear(doc, layer, from, to, netId, width)) {
    return [{ x: from.x, y: from.y }, { x: to.x, y: to.y }];
  }

  const t0 = Date.now();
  const overBudget = (): boolean => budgetMs > 0 && (Date.now() - t0) > budgetMs;
  const mid: Point2D = { x: (from.x + to.x) * 0.5, y: (from.y + to.y) * 0.5 };
  const span = Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y), 120) + 200;
  const blockers = collectBlockers(doc, layer, mid, netId, span);
  const halfW = width * 0.5;
  const rays = 16;
  const poly: Point2D[] = [];
  for (let i = 0; i < rays; i++) {
    const ang = (Math.PI * 2 * i) / rays;
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    const d = rayHitDist(mid.x, mid.y, ux, uy, blockers, span, halfW);
    poly.push({ x: mid.x + ux * d, y: mid.y + uy * d });
  }

  // 节点：from, to, 多边形顶点, 障碍外接角点（少量）
  const nodes: Point2D[] = [
    { x: from.x, y: from.y },
    { x: to.x, y: to.y }
  ];
  for (let i = 0; i < poly.length; i++) {
    nodes.push(poly[i]);
  }
  const maxExtra = 24;
  for (let i = 0; i < blockers.length && nodes.length < 2 + rays + maxExtra; i++) {
    const b = blockers[i];
    const rr = b.r + halfW + 2;
    nodes.push({ x: b.x + rr, y: b.y });
    nodes.push({ x: b.x - rr, y: b.y });
    nodes.push({ x: b.x, y: b.y + rr });
    nodes.push({ x: b.x, y: b.y - rr });
  }

  const n = nodes.length;
  const adj: number[][] = [];
  for (let i = 0; i < n; i++) {
    adj.push([]);
  }
  const maxDeg = budgetMs > 0 && budgetMs <= 120 ? 6 : 10;
  for (let i = 0; i < n; i++) {
    if (overBudget()) {
      tracePcbWarn('POLY_ROOM_FAIL', `${netId} budget=${budgetMs}ms at adj i=${i}/${n}`);
      return [];
    }
    const cand: EdgeCand[] = [];
    for (let j = i + 1; j < n; j++) {
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (d < 1 || d > span * 1.5) {
        continue;
      }
      if (!segClear(doc, layer, nodes[i], nodes[j], netId, width)) {
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

  // 多边形相邻边强制连通（若 clearance 过）
  for (let i = 0; i < rays; i++) {
    const a = 2 + i;
    const b = 2 + ((i + 1) % rays);
    if (segClear(doc, layer, nodes[a], nodes[b], netId, width)) {
      adj[a].push(b);
      adj[b].push(a);
    }
  }

  const parent = new Map<number, number>();
  const gScore = new Map<number, number>();
  const open: AStarOpenNode[] = [];
  const openMap = new Map<number, number>();
  const closed = new Set<number>();
  gScore.set(0, 0);
  const h0 = Math.hypot(nodes[0].x - nodes[1].x, nodes[0].y - nodes[1].y);
  const startNode: AStarOpenNode = { i: 0, g: 0, f: h0 };
  open.push(startNode);
  openMap.set(0, 0);
  let steps = 0;
  let ok = false;
  while (open.length > 0 && steps < 2000) {
    if (overBudget()) {
      tracePcbWarn('POLY_ROOM_FAIL', `${netId} budget=${budgetMs}ms steps=${steps}`);
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
      ok = true;
      break;
    }
    const nbrs = adj[cur.i];
    for (let k = 0; k < nbrs.length; k++) {
      const j = nbrs[k];
      if (closed.has(j)) {
        continue;
      }
      const step = Math.hypot(nodes[cur.i].x - nodes[j].x, nodes[cur.i].y - nodes[j].y);
      const tg = cur.g + step;
      const prev = gScore.get(j);
      if (prev !== undefined && prev <= tg) {
        continue;
      }
      gScore.set(j, tg);
      parent.set(j, cur.i);
      const hh = Math.hypot(nodes[j].x - nodes[1].x, nodes[j].y - nodes[1].y);
      const node: AStarOpenNode = { i: j, g: tg, f: tg + hh };
      const ei = openMap.get(j);
      if (ei !== undefined && ei < open.length) {
        open[ei] = node;
      } else {
        openMap.set(j, open.length);
        open.push(node);
      }
    }
  }
  if (!ok) {
    tracePcbWarn('POLY_ROOM_FAIL', `${netId} nodes=${n} steps=${steps}`);
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
  tracePcb('POLY_ROOM_OK', `${netId} pts=${path.length} poly=${rays}`);
  return path;
}
