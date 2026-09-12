/**
 * 差分对优先布线辅助：成对同层、顺序绑定、长度差评估、简单等长绕线。
 */
import { PcbDocument, PcbDiffPair, PcbTrack } from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';
import { IdUtil } from '../IdUtil';
import { pathClearBlockReason } from './PcbClearanceOracle';
import { tracePcb, tracePcbWarn } from '../PcbTraceLog';

export interface DiffPairPlan {
  pair: PcbDiffPair;
  netIdP: string;
  netIdN: string;
  nameP: string;
  nameN: string;
}

export interface DiffPairLengthReport {
  pairName: string;
  lenP: number;
  lenN: number;
  delta: number;
  tol: number;
  withinTol: boolean;
}

function netNameOf(doc: PcbDocument, netId: string): string {
  for (let i = 0; i < doc.nets.length; i++) {
    if (doc.nets[i].id === netId) {
      return doc.nets[i].name;
    }
  }
  return netId;
}

export function collectDiffPairPlans(doc: PcbDocument): DiffPairPlan[] {
  const out: DiffPairPlan[] = [];
  const dps = doc.diffPairs ?? [];
  for (let i = 0; i < dps.length; i++) {
    const dp = dps[i];
    if (dp.netIdP.length === 0 || dp.netIdN.length === 0) {
      continue;
    }
    if (dp.netIdP === dp.netIdN) {
      continue;
    }
    const plan: DiffPairPlan = {
      pair: dp,
      netIdP: dp.netIdP,
      netIdN: dp.netIdN,
      nameP: netNameOf(doc, dp.netIdP),
      nameN: netNameOf(doc, dp.netIdN)
    };
    out.push(plan);
  }
  return out;
}

export function isDiffPairNet(doc: PcbDocument, netId: string): boolean {
  const dps = doc.diffPairs ?? [];
  for (let i = 0; i < dps.length; i++) {
    if (dps[i].netIdP === netId || dps[i].netIdN === netId) {
      return true;
    }
  }
  return false;
}

export function trackLengthOnNet(doc: PcbDocument, netId: string): number {
  let len = 0;
  for (let i = 0; i < doc.tracks.length; i++) {
    const t: PcbTrack = doc.tracks[i];
    if (t.netId !== netId) {
      continue;
    }
    len += Math.hypot(t.end.x - t.start.x, t.end.y - t.start.y);
  }
  return len;
}

export function reportDiffPairLengths(doc: PcbDocument): DiffPairLengthReport[] {
  const plans = collectDiffPairPlans(doc);
  const reports: DiffPairLengthReport[] = [];
  for (let i = 0; i < plans.length; i++) {
    const p = plans[i];
    const lenP = trackLengthOnNet(doc, p.netIdP);
    const lenN = trackLengthOnNet(doc, p.netIdN);
    const delta = Math.abs(lenP - lenN);
    const tol = p.pair.lengthTolMil > 0 ? p.pair.lengthTolMil : 5;
    const rep: DiffPairLengthReport = {
      pairName: p.pair.name || `${p.nameP}/${p.nameN}`,
      lenP,
      lenN,
      delta,
      tol,
      withinTol: delta <= tol + 0.5
    };
    reports.push(rep);
  }
  return reports;
}

export interface DiffSamplePair {
  a: Point2D;
  b: Point2D;
}

/** 差分对两网质心，供全局层分配采样 */
export function diffPairSamplePoints(
  ptsP: Point2D[],
  ptsN: Point2D[]
): DiffSamplePair | null {
  const all: Point2D[] = [];
  for (let i = 0; i < ptsP.length; i++) {
    all.push(ptsP[i]);
  }
  for (let i = 0; i < ptsN.length; i++) {
    all.push(ptsN[i]);
  }
  if (all.length < 2) {
    return null;
  }
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < all.length; i++) {
    sx += all[i].x;
    sy += all[i].y;
  }
  const c: Point2D = { x: sx / all.length, y: sy / all.length };
  let far = all[0];
  let best = -1;
  for (let i = 0; i < all.length; i++) {
    const d = Math.hypot(all[i].x - c.x, all[i].y - c.y);
    if (d > best) {
      best = d;
      far = all[i];
    }
  }
  const pair: DiffSamplePair = { a: c, b: far };
  return pair;
}

/**
 * 差分间距：在参考路径旁生成平行折线（gapMil），供 N 线跟随 P。
 * 仅正交段；斜边跳过。
 */
export function offsetOrthoPolyline(path: Point2D[], gapMil: number, side: number): Point2D[] {
  if (path.length < 2 || Math.abs(gapMil) < 0.5) {
    return path.slice();
  }
  const s = side >= 0 ? 1 : -1;
  const out: Point2D[] = [];
  for (let i = 0; i < path.length; i++) {
    let nx = 0;
    let ny = 0;
    if (i === 0) {
      const dx = path[1].x - path[0].x;
      const dy = path[1].y - path[0].y;
      if (Math.abs(dx) >= Math.abs(dy)) {
        ny = s;
      } else {
        nx = s;
      }
    } else if (i === path.length - 1) {
      const dx = path[i].x - path[i - 1].x;
      const dy = path[i].y - path[i - 1].y;
      if (Math.abs(dx) >= Math.abs(dy)) {
        ny = s;
      } else {
        nx = s;
      }
    } else {
      const dx0 = path[i].x - path[i - 1].x;
      const dy0 = path[i].y - path[i - 1].y;
      const dx1 = path[i + 1].x - path[i].x;
      const dy1 = path[i + 1].y - path[i].y;
      const h0 = Math.abs(dx0) >= Math.abs(dy0);
      const h1 = Math.abs(dx1) >= Math.abs(dy1);
      if (h0 && h1) {
        ny = s;
      } else if (!h0 && !h1) {
        nx = s;
      } else {
        // 拐角：取外法向平均
        nx = (h0 ? 0 : s) + (h1 ? 0 : s);
        ny = (h0 ? s : 0) + (h1 ? s : 0);
        if (nx === 0 && ny === 0) {
          ny = s;
        }
      }
    }
    out.push({ x: path[i].x + nx * gapMil, y: path[i].y + ny * gapMil });
  }
  return out;
}

/**
 * 对较短差分网插入手风琴绕线，逼近较长网长度（简单 accordion）。
 * 返回新增段数。
 */
function buildTrombonePoints(t: PcbTrack, need: number, amp: number): Point2D[] {
  const horiz = Math.abs(t.start.y - t.end.y) < 0.5;
  const mid: Point2D = {
    x: (t.start.x + t.end.x) * 0.5,
    y: (t.start.y + t.end.y) * 0.5
  };
  // 伸出长度 ≈ need/2
  const ext = Math.max(amp * 2, need * 0.5);
  const pts: Point2D[] = [{ x: t.start.x, y: t.start.y }];
  if (horiz) {
    const sign = 1;
    pts.push({ x: mid.x, y: t.start.y });
    pts.push({ x: mid.x, y: t.start.y + sign * ext });
    pts.push({ x: mid.x + Math.min(amp * 2, 30), y: t.start.y + sign * ext });
    pts.push({ x: mid.x + Math.min(amp * 2, 30), y: t.start.y });
    pts.push({ x: t.end.x, y: t.end.y });
  } else {
    const sign = 1;
    pts.push({ x: t.start.x, y: mid.y });
    pts.push({ x: t.start.x + sign * ext, y: mid.y });
    pts.push({ x: t.start.x + sign * ext, y: mid.y + Math.min(amp * 2, 30) });
    pts.push({ x: t.start.x, y: mid.y + Math.min(amp * 2, 30) });
    pts.push({ x: t.end.x, y: t.end.y });
  }
  return pts;
}

export function tuneDiffPairLengths(doc: PcbDocument): number {
  const plans = collectDiffPairPlans(doc);
  let added = 0;
  for (let pi = 0; pi < plans.length; pi++) {
    const p = plans[pi];
    const lenP = trackLengthOnNet(doc, p.netIdP);
    const lenN = trackLengthOnNet(doc, p.netIdN);
    const tol = p.pair.lengthTolMil > 0 ? p.pair.lengthTolMil : 5;
    const delta = Math.abs(lenP - lenN);
    if (delta <= tol + 0.5) {
      continue;
    }
    const shortId = lenP <= lenN ? p.netIdP : p.netIdN;
    const need = delta;
    // 找该网最长正交段插入 accordion
    let bestIdx = -1;
    let bestLen = 0;
    for (let i = 0; i < doc.tracks.length; i++) {
      const t = doc.tracks[i];
      if (t.netId !== shortId) {
        continue;
      }
      const ortho = Math.abs(t.start.x - t.end.x) < 0.5 || Math.abs(t.start.y - t.end.y) < 0.5;
      if (!ortho) {
        continue;
      }
      const L = Math.hypot(t.end.x - t.start.x, t.end.y - t.start.y);
      if (L > bestLen && L > 40) {
        bestLen = L;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) {
      continue;
    }
    const t = doc.tracks[bestIdx];
    const amp = Math.max(t.width * 3, p.pair.gapMil > 0 ? p.pair.gapMil : 8);
    const pitch = Math.max(amp * 2, t.width * 4);
    const bumps = Math.min(8, Math.max(1, Math.ceil(need / (2 * amp))));
    const horiz = Math.abs(t.start.y - t.end.y) < 0.5;
    const pts: Point2D[] = [{ x: t.start.x, y: t.start.y }];
    let travel = 0;
    const total = bestLen;
    const step = total / (bumps * 2 + 1);
    for (let b = 0; b < bumps; b++) {
      travel += step;
      if (horiz) {
        const x1 = t.start.x + (t.end.x - t.start.x) * (travel / total);
        const x2 = t.start.x + (t.end.x - t.start.x) * ((travel + step) / total);
        const sign = (b % 2 === 0) ? 1 : -1;
        pts.push({ x: x1, y: t.start.y + sign * amp });
        pts.push({ x: x2, y: t.start.y + sign * amp });
        travel += step;
      } else {
        const y1 = t.start.y + (t.end.y - t.start.y) * (travel / total);
        const y2 = t.start.y + (t.end.y - t.start.y) * ((travel + step) / total);
        const sign = (b % 2 === 0) ? 1 : -1;
        pts.push({ x: t.start.x + sign * amp, y: y1 });
        pts.push({ x: t.start.x + sign * amp, y: y2 });
        travel += step;
      }
    }
    pts.push({ x: t.end.x, y: t.end.y });
    // clearance 预检：任一段不过则放弃本对绕线
    let blocked = false;
    const others: PcbTrack[] = [];
    for (let i = 0; i < doc.tracks.length; i++) {
      if (i !== bestIdx) {
        others.push(doc.tracks[i]);
      }
    }
    for (let i = 0; i < pts.length - 1; i++) {
      if (Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y) < 0.5) {
        continue;
      }
      if (pathClearBlockReason(doc, t.layer, pts[i], pts[i + 1], t.netId, t.width,
        others, doc.vias) !== null) {
        blocked = true;
        break;
      }
    }
    if (blocked) {
      // accordion 失败 → 尝试 trombone（长号形 U 绕）
      const tromb = buildTrombonePoints(t, need, amp);
      let tBlocked = false;
      for (let i = 0; i < tromb.length - 1; i++) {
        if (Math.hypot(tromb[i + 1].x - tromb[i].x, tromb[i + 1].y - tromb[i].y) < 0.5) {
          continue;
        }
        if (pathClearBlockReason(doc, t.layer, tromb[i], tromb[i + 1], t.netId, t.width,
          others, doc.vias) !== null) {
          tBlocked = true;
          break;
        }
      }
      if (tBlocked || tromb.length < 3) {
        tracePcbWarn('DIFF_TUNE_SKIP', `${p.pair.name || shortId} clearance`);
        continue;
      }
      doc.tracks.splice(bestIdx, 1);
      let localT = 0;
      for (let i = 0; i < tromb.length - 1; i++) {
        if (Math.hypot(tromb[i + 1].x - tromb[i].x, tromb[i + 1].y - tromb[i].y) < 0.5) {
          continue;
        }
        doc.tracks.push({
          id: IdUtil.generate('trk'),
          layer: t.layer,
          start: { x: tromb[i].x, y: tromb[i].y },
          end: { x: tromb[i + 1].x, y: tromb[i + 1].y },
          width: t.width,
          netId: t.netId,
          netName: t.netName
        });
        localT++;
      }
      added += localT;
      tracePcb('DIFF_TUNE_TROMBONE',
        `${p.pair.name || shortId} need=${need.toFixed(1)} segs=${localT}`);
      continue;
    }
    doc.tracks.splice(bestIdx, 1);
    let local = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      if (Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y) < 0.5) {
        continue;
      }
      doc.tracks.push({
        id: IdUtil.generate('trk'),
        layer: t.layer,
        start: { x: pts[i].x, y: pts[i].y },
        end: { x: pts[i + 1].x, y: pts[i + 1].y },
        width: t.width,
        netId: t.netId,
        netName: t.netName
      });
      local++;
    }
    added += local;
    tracePcb('DIFF_TUNE',
      `${p.pair.name || shortId} need=${need.toFixed(1)} bumps=${bumps} segs=${local}`);
  }
  return added;
}

/**
 * 由 P 网两点的 L 路径生成 N 网平行跟随候选（两侧 gap）。
 * 端点吸附到 N 的焊盘 aN/bN。
 */
export function buildDiffFollowCandidates(
  aP: Point2D,
  bP: Point2D,
  aN: Point2D,
  bN: Point2D,
  gapMil: number
): Point2D[][] {
  const gap = Math.max(gapMil, 6);
  const out: Point2D[][] = [];
  const mids: Point2D[][] = [
    [aP, { x: bP.x, y: aP.y }, bP],
    [aP, { x: aP.x, y: bP.y }, bP]
  ];
  for (let si = 0; si < 2; si++) {
    const side = si === 0 ? 1 : -1;
    for (let m = 0; m < mids.length; m++) {
      const off = offsetOrthoPolyline(mids[m], gap, side);
      if (off.length < 2) {
        continue;
      }
      // N 端点接到平行路径
      const path: Point2D[] = [
        { x: aN.x, y: aN.y },
        { x: off[0].x, y: off[0].y }
      ];
      for (let i = 1; i < off.length; i++) {
        path.push({ x: off[i].x, y: off[i].y });
      }
      path.push({ x: bN.x, y: bN.y });
      out.push(path);
      // 反接
      const pathRev: Point2D[] = [
        { x: aN.x, y: aN.y },
        { x: off[off.length - 1].x, y: off[off.length - 1].y }
      ];
      for (let i = off.length - 2; i >= 0; i--) {
        pathRev.push({ x: off[i].x, y: off[i].y });
      }
      pathRev.push({ x: bN.x, y: bN.y });
      out.push(pathRev);
    }
  }
  return out;
}
