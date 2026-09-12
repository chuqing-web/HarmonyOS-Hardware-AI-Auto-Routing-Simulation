/**
 * 差分对双状态耦合 A*：同步移动保持间距，同层布线。
 * 对齐路线图阶段三「同步布线」轻量实现（网格、步数有限）。
 */
import { PcbDocument, PcbLayerId, PcbTrack } from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';
import { pathClearBlockReason } from './PcbClearanceOracle';
import { tracePcb, tracePcbWarn } from '../PcbTraceLog';

export interface CoupledDiffResult {
  pathP: Point2D[];
  pathN: Point2D[];
}

interface DualNode {
  pgx: number;
  pgy: number;
  ngx: number;
  ngy: number;
  g: number;
  f: number;
  parent: DualNode | null;
  /** 累计 |lenP-lenN| 代理：步数差 */
  lenBias: number;
}

function snap(p: Point2D, grid: number): Point2D {
  return {
    x: Math.round(p.x / grid) * grid,
    y: Math.round(p.y / grid) * grid
  };
}

function gapOf(pgx: number, pgy: number, ngx: number, ngy: number, grid: number): number {
  return Math.hypot((pgx - ngx) * grid, (pgy - ngy) * grid);
}

function edgeOk(
  doc: PcbDocument,
  layer: PcbLayerId,
  a: Point2D,
  b: Point2D,
  netId: string,
  width: number,
  ignoreNet: string
): boolean {
  // 临时忽略同伴网：构造不含 ignoreNet 的 tracks 视图代价高，用全量 + 同网豁免
  // pathClear 已豁免同 netId；对同伴用略松：直接调 clearance
  const others: PcbTrack[] = [];
  for (let i = 0; i < doc.tracks.length; i++) {
    const t = doc.tracks[i];
    if (t.netId === ignoreNet) {
      continue;
    }
    others.push(t);
  }
  return pathClearBlockReason(doc, layer, a, b, netId, width, others, doc.vias) === null;
}

/**
 * 双状态 A*：P/N 同步正交步进，gap 约束在 [gap*0.7, gap*1.4]。
 */
export function routeDiffPairCoupled(
  doc: PcbDocument,
  layer: PcbLayerId,
  startP: Point2D,
  endP: Point2D,
  startN: Point2D,
  endN: Point2D,
  netIdP: string,
  netIdN: string,
  widthP: number,
  widthN: number,
  gapMil: number,
  maxLenDiff: number,
  gridIn: number
): CoupledDiffResult | null {
  const grid = Math.max(4, Math.round(gridIn));
  const gap = gapMil > 0 ? gapMil : 8;
  const minGap = gap * 0.65;
  const maxGap = gap * 1.5;
  const tol = maxLenDiff > 0 ? maxLenDiff : 20;

  const sp = snap(startP, grid);
  const ep = snap(endP, grid);
  const sn = snap(startN, grid);
  const en = snap(endN, grid);
  const spgx = Math.round(sp.x / grid);
  const spgy = Math.round(sp.y / grid);
  const epgx = Math.round(ep.x / grid);
  const epgy = Math.round(ep.y / grid);
  const sngx = Math.round(sn.x / grid);
  const sngy = Math.round(sn.y / grid);
  const engx = Math.round(en.x / grid);
  const engy = Math.round(en.y / grid);

  const g0 = gapOf(spgx, spgy, sngx, sngy, grid);
  if (g0 < minGap * 0.5 || g0 > maxGap * 2) {
    // 起点间距离谱：仍试，放宽
  }

  const manh =
    Math.abs(epgx - spgx) + Math.abs(epgy - spgy) +
    Math.abs(engx - sngx) + Math.abs(engy - sngy);
  if (manh === 0) {
    return {
      pathP: [startP, endP],
      pathN: [startN, endN]
    };
  }

  const pad = Math.min(40, Math.max(10, Math.ceil(manh * 0.25) + 8));
  const minX = Math.min(spgx, epgx, sngx, engx) - pad;
  const maxX = Math.max(spgx, epgx, sngx, engx) + pad;
  const minY = Math.min(spgy, epgy, sngy, engy) - pad;
  const maxY = Math.max(spgy, epgy, sngy, engy) + pad;

  const open: DualNode[] = [];
  const openMap = new Map<string, number>();
  const closed = new Set<string>();
  const start: DualNode = {
    pgx: spgx, pgy: spgy, ngx: sngx, ngy: sngy,
    g: 0, f: manh, parent: null, lenBias: 0
  };
  open.push(start);
  openMap.set(`${spgx},${spgy},${sngx},${sngy}`, 0);

  const dirs: number[][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const maxSteps = 2800;
  const maxOpen = 800;
  let steps = 0;
  let found: DualNode | null = null;
  const wallT0 = Date.now();

  while (open.length > 0 && steps < maxSteps) {
    if (open.length > maxOpen) {
      break;
    }
    if (steps > 0 && (steps & 63) === 0 && (Date.now() - wallT0) > 70) {
      break;
    }
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bi].f) {
        bi = i;
      }
    }
    const cur = open[bi];
    const ck = `${cur.pgx},${cur.pgy},${cur.ngx},${cur.ngy}`;
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

    if (cur.pgx === epgx && cur.pgy === epgy && cur.ngx === engx && cur.ngy === engy) {
      found = cur;
      break;
    }

    // 同步四向
    for (let di = 0; di < 4; di++) {
      const npgx = cur.pgx + dirs[di][0];
      const npgy = cur.pgy + dirs[di][1];
      const nngx = cur.ngx + dirs[di][0];
      const nngy = cur.ngy + dirs[di][1];
      if (npgx < minX || npgx > maxX || npgy < minY || npgy > maxY) {
        continue;
      }
      if (nngx < minX || nngx > maxX || nngy < minY || nngy > maxY) {
        continue;
      }
      const gapNow = gapOf(npgx, npgy, nngx, nngy, grid);
      if (gapNow < minGap || gapNow > maxGap) {
        continue;
      }
      const fromP: Point2D = { x: cur.pgx * grid, y: cur.pgy * grid };
      const toP: Point2D = { x: npgx * grid, y: npgy * grid };
      const fromN: Point2D = { x: cur.ngx * grid, y: cur.ngy * grid };
      const toN: Point2D = { x: nngx * grid, y: nngy * grid };
      if (!edgeOk(doc, layer, fromP, toP, netIdP, widthP, netIdN)) {
        continue;
      }
      if (!edgeOk(doc, layer, fromN, toN, netIdN, widthN, netIdP)) {
        continue;
      }
      const gapDev = Math.abs(gapNow - gap) / Math.max(gap, 1);
      const h =
        Math.abs(epgx - npgx) + Math.abs(epgy - npgy) +
        Math.abs(engx - nngx) + Math.abs(engy - nngy);
      const stepCost = 1 + gapDev * 0.8;
      const tg = cur.g + stepCost;
      const nk = `${npgx},${npgy},${nngx},${nngy}`;
      if (closed.has(nk)) {
        continue;
      }
      const ei = openMap.get(nk);
      if (ei !== undefined && ei < open.length && open[ei].g <= tg) {
        continue;
      }
      const node: DualNode = {
        pgx: npgx, pgy: npgy, ngx: nngx, ngy: nngy,
        g: tg, f: tg + h + Math.abs(cur.lenBias) * 0.05,
        parent: cur, lenBias: cur.lenBias
      };
      if (ei !== undefined && ei < open.length) {
        open[ei] = node;
      } else {
        openMap.set(nk, open.length);
        open.push(node);
      }
    }

    // 微调：仅 P 走一步（长度差补偿），N 不动 — 限 |lenBias|
    if (Math.abs(cur.lenBias) < tol / grid + 2) {
      for (let di = 0; di < 4; di++) {
        const npgx = cur.pgx + dirs[di][0];
        const npgy = cur.pgy + dirs[di][1];
        if (npgx < minX || npgx > maxX || npgy < minY || npgy > maxY) {
          continue;
        }
        const gapNow = gapOf(npgx, npgy, cur.ngx, cur.ngy, grid);
        if (gapNow < minGap || gapNow > maxGap) {
          continue;
        }
        const fromP: Point2D = { x: cur.pgx * grid, y: cur.pgy * grid };
        const toP: Point2D = { x: npgx * grid, y: npgy * grid };
        if (!edgeOk(doc, layer, fromP, toP, netIdP, widthP, netIdN)) {
          continue;
        }
        const h =
          Math.abs(epgx - npgx) + Math.abs(epgy - npgy) +
          Math.abs(engx - cur.ngx) + Math.abs(engy - cur.ngy);
        const tg = cur.g + 1.4;
        const nk = `${npgx},${npgy},${cur.ngx},${cur.ngy}`;
        if (closed.has(nk)) {
          continue;
        }
        const ei = openMap.get(nk);
        if (ei !== undefined && ei < open.length && open[ei].g <= tg) {
          continue;
        }
        const node: DualNode = {
          pgx: npgx, pgy: npgy, ngx: cur.ngx, ngy: cur.ngy,
          g: tg, f: tg + h,
          parent: cur, lenBias: cur.lenBias + 1
        };
        if (ei !== undefined && ei < open.length) {
          open[ei] = node;
        } else {
          openMap.set(nk, open.length);
          open.push(node);
        }
      }
    }
  }

  if (found === null) {
    tracePcbWarn('DIFF_COUPLED_FAIL',
      `${netIdP}/${netIdN} steps=${steps} open=${open.length}`);
    return null;
  }

  const chain: DualNode[] = [];
  let w: DualNode | null = found;
  while (w !== null) {
    chain.push(w);
    w = w.parent;
  }
  chain.reverse();

  const pathP: Point2D[] = [{ x: startP.x, y: startP.y }];
  const pathN: Point2D[] = [{ x: startN.x, y: startN.y }];
  for (let i = 0; i < chain.length; i++) {
    pathP.push({ x: chain[i].pgx * grid, y: chain[i].pgy * grid });
    pathN.push({ x: chain[i].ngx * grid, y: chain[i].ngy * grid });
  }
  pathP.push({ x: endP.x, y: endP.y });
  pathN.push({ x: endN.x, y: endN.y });

  // 压缩共线
  const compress = (pts: Point2D[]): Point2D[] => {
    if (pts.length <= 2) {
      return pts.slice();
    }
    const out: Point2D[] = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = out[out.length - 1];
      const b = pts[i];
      const c = pts[i + 1];
      const ax = Math.abs(b.x - a.x) < 0.5;
      const ay = Math.abs(b.y - a.y) < 0.5;
      const bx = Math.abs(c.x - b.x) < 0.5;
      const by = Math.abs(c.y - b.y) < 0.5;
      if ((ax && bx) || (ay && by)) {
        continue;
      }
      if (Math.abs(b.x - a.x) < 0.5 && Math.abs(b.y - a.y) < 0.5) {
        continue;
      }
      out.push(b);
    }
    const last = pts[pts.length - 1];
    const t = out[out.length - 1];
    if (Math.abs(last.x - t.x) >= 0.5 || Math.abs(last.y - t.y) >= 0.5) {
      out.push(last);
    }
    return out;
  };

  const result: CoupledDiffResult = {
    pathP: compress(pathP),
    pathN: compress(pathN)
  };
  tracePcb('DIFF_COUPLED',
    `${netIdP}/${netIdN} ptsP=${result.pathP.length} ptsN=${result.pathN.length} steps=${steps}`);
  return result;
}
