/**
 * 等长蛇形绕线（Serpentine）：幅度≥3W、平行间距≥3W、45° 进出。
 * 对齐路线图阶段三模块 C。
 */
import { PcbDocument, PcbTrack } from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';
import { IdUtil } from '../IdUtil';
import { pathClearBlockReason } from './PcbClearanceOracle';
import { collectDiffPairPlans, trackLengthOnNet } from './PcbDiffPairRouter';
import { tracePcb, tracePcbWarn } from '../PcbTraceLog';

function buildSerpentine(
  t: PcbTrack,
  needExtra: number,
  width: number
): Point2D[] {
  const amp = Math.max(width * 4, 20); // ≥3W，取 4W
  const gap = Math.max(width * 3, 16); // ≥3W
  const cycleGain = 2 * amp;
  const cycles = Math.min(10, Math.max(1, Math.ceil(needExtra / cycleGain)));
  const horiz = Math.abs(t.start.y - t.end.y) < 0.5;
  const total = Math.hypot(t.end.x - t.start.x, t.end.y - t.start.y);
  if (total < gap * (cycles + 1) + 20) {
    return [];
  }
  const pts: Point2D[] = [{ x: t.start.x, y: t.start.y }];
  // 源端优先：前 1/3 段开始绕
  const startFrac = 0.15;
  const usable = total * 0.7;
  const pitch = usable / (cycles + 0.5);

  if (horiz) {
    const dir = t.end.x >= t.start.x ? 1 : -1;
    let x = t.start.x + dir * total * startFrac;
    pts.push({ x: x, y: t.start.y });
    // 45° 进入
    pts.push({ x: x + dir * (amp * 0.3), y: t.start.y + amp * 0.3 });
    for (let c = 0; c < cycles; c++) {
      const sign = (c % 2 === 0) ? 1 : -1;
      x += dir * pitch;
      pts.push({ x: x, y: t.start.y + sign * amp });
      x += dir * gap;
      pts.push({ x: x, y: t.start.y + sign * amp });
    }
    // 45° 退出回主轴
    pts.push({ x: x + dir * (amp * 0.3), y: t.start.y });
    pts.push({ x: t.end.x, y: t.end.y });
  } else {
    const dir = t.end.y >= t.start.y ? 1 : -1;
    let y = t.start.y + dir * total * startFrac;
    pts.push({ x: t.start.x, y: y });
    pts.push({ x: t.start.x + amp * 0.3, y: y + dir * (amp * 0.3) });
    for (let c = 0; c < cycles; c++) {
      const sign = (c % 2 === 0) ? 1 : -1;
      y += dir * pitch;
      pts.push({ x: t.start.x + sign * amp, y: y });
      y += dir * gap;
      pts.push({ x: t.start.x + sign * amp, y: y });
    }
    pts.push({ x: t.start.x, y: y + dir * (amp * 0.3) });
    pts.push({ x: t.end.x, y: t.end.y });
  }
  return pts;
}

/** 差分对等长：优先蛇形，失败则返回 0（上层可回退 accordion/trombone） */
export function tuneDiffPairSerpentine(doc: PcbDocument): number {
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
      if (L > bestLen && L > 60) {
        bestLen = L;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) {
      continue;
    }
    const t = doc.tracks[bestIdx];
    const pts = buildSerpentine(t, delta, t.width);
    if (pts.length < 4) {
      continue;
    }
    const others: PcbTrack[] = [];
    for (let i = 0; i < doc.tracks.length; i++) {
      if (i !== bestIdx) {
        others.push(doc.tracks[i]);
      }
    }
    let blocked = false;
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
      tracePcbWarn('SERPENTINE_SKIP', `${p.pair.name || shortId}`);
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
    tracePcb('SERPENTINE', `${p.pair.name || shortId} delta=${delta.toFixed(1)} segs=${local}`);
  }
  return added;
}
