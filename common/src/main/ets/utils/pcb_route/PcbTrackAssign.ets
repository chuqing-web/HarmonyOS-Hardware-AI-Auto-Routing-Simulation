/**
 * 轨道分配（Track Assignment）：把全局指南折到稀疏 H/V 轨道，减少 jog。
 * 对齐路线图阶段二 TA（轻量：不完整 DRC，详细阶段再修）。
 */
import { Point2D } from '../../types/CommonTypes';
import { GlobalCongestionMap } from './PcbGlobalRoute';
import { GlobalChannelPlan, GlobalNetGuide } from './PcbGlobalChannel';
import { tracePcb } from '../PcbTraceLog';

function snap(v: number, pitch: number): number {
  if (pitch < 1) {
    return v;
  }
  return Math.round(v / pitch) * pitch;
}

/**
 * 为各网指南分配 H 轨道 Y、V 轨道 X，并改写 elbow 到轨道交点。
 */
export function assignTracksToGuides(
  map: GlobalCongestionMap,
  plan: GlobalChannelPlan,
  trackPitch: number
): GlobalChannelPlan {
  const pitch = Math.max(8, trackPitch);
  // 轨道占用计数：key = 层无关的量化坐标
  const yUse = new Map<number, number>();
  const xUse = new Map<number, number>();
  const bump = (m: Map<number, number>, k: number): void => {
    const v = m.get(k);
    m.set(k, (v !== undefined ? v : 0) + 1);
  };
  const load = (m: Map<number, number>, k: number): number => {
    const v = m.get(k);
    return v !== undefined ? v : 0;
  };

  const pickY = (prefer: number): number => {
    const base = snap(prefer, pitch);
    let best = base;
    let bestCost = 1e9;
    for (let d = -4; d <= 4; d++) {
      const y = base + d * pitch;
      // 越靠 prefer 越好，占用越低越好
      const cost = load(yUse, y) * 10 + Math.abs(d);
      if (cost < bestCost) {
        bestCost = cost;
        best = y;
      }
    }
    bump(yUse, best);
    return best;
  };

  const pickX = (prefer: number): number => {
    const base = snap(prefer, pitch);
    let best = base;
    let bestCost = 1e9;
    for (let d = -4; d <= 4; d++) {
      const x = base + d * pitch;
      const cost = load(xUse, x) * 10 + Math.abs(d);
      if (cost < bestCost) {
        bestCost = cost;
        best = x;
      }
    }
    bump(xUse, best);
    return best;
  };

  const guides: Map<string, GlobalNetGuide> = new Map();
  let assigned = 0;
  plan.guides.forEach((g: GlobalNetGuide, id: string) => {
    if (g.waypoints.length < 2) {
      guides.set(id, g);
      return;
    }
    const a = g.waypoints[0];
    const b = g.waypoints[g.waypoints.length - 1];
    let trackY = pickY(g.preferHFirst ? a.y : ((a.y + b.y) * 0.5));
    let trackX = pickX(g.preferHFirst ? ((a.x + b.x) * 0.5) : a.x);
    // 约束在板粗 bbox
    const xMin = map.originX;
    const yMin = map.originY;
    const xMax = map.originX + map.cols * map.cell;
    const yMax = map.originY + map.rows * map.cell;
    trackX = Math.max(xMin + pitch, Math.min(xMax - pitch, trackX));
    trackY = Math.max(yMin + pitch, Math.min(yMax - pitch, trackY));

    let wps: Point2D[];
    if (g.preferHFirst) {
      wps = [
        { x: a.x, y: a.y },
        { x: a.x, y: trackY },
        { x: b.x, y: trackY },
        { x: b.x, y: b.y }
      ];
    } else {
      wps = [
        { x: a.x, y: a.y },
        { x: trackX, y: a.y },
        { x: trackX, y: b.y },
        { x: b.x, y: b.y }
      ];
    }
    const compact: Point2D[] = [wps[0]];
    for (let i = 1; i < wps.length; i++) {
      const p = compact[compact.length - 1];
      if (Math.abs(wps[i].x - p.x) < 0.5 && Math.abs(wps[i].y - p.y) < 0.5) {
        continue;
      }
      compact.push(wps[i]);
    }
    wps = compact;

    const ng: GlobalNetGuide = {
      netId: g.netId,
      waypoints: wps,
      preferHFirst: g.preferHFirst,
      reservedCells: g.reservedCells,
      assignedTrackX: trackX,
      assignedTrackY: trackY
    };
    guides.set(id, ng);
    assigned++;
  });

  tracePcb('TRACK_ASSIGN',
    `guides=${assigned} pitch=${pitch} xTracks=${xUse.size} yTracks=${yUse.size}`);
  return { guides, reservedTotal: plan.reservedTotal };
}
