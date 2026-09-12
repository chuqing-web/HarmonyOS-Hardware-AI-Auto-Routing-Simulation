/**
 * 拥塞驱动的布局微挪：布线前把落入拥塞热点的器件向外挪一格～两格。
 */
import { PcbDocument, PcbFootprintInst } from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';
import { updateTracksForFootprintTransform } from '../PcbTrackBindUtil';
import { GlobalCongestionMap, CongestionHotspot } from './PcbGlobalRoute';
import { tracePcb } from '../PcbTraceLog';

export interface PlacementNudgeResult {
  moved: number;
  attempted: number;
}

function footprintSpan(fp: PcbFootprintInst): number {
  let m = 40;
  for (let i = 0; i < fp.pads.length; i++) {
    m = Math.max(m, Math.abs(fp.pads[i].pos.x) + fp.pads[i].size.x,
      Math.abs(fp.pads[i].pos.y) + fp.pads[i].size.y);
  }
  return m;
}

function overlapsOther(doc: PcbDocument, fp: PcbFootprintInst, x: number, y: number,
  ignoreId: string): boolean {
  const span = footprintSpan(fp);
  for (let i = 0; i < doc.footprints.length; i++) {
    const o = doc.footprints[i];
    if (o.id === ignoreId) {
      continue;
    }
    const need = (span + footprintSpan(o)) * 0.85;
    const dx = o.position.x - x;
    const dy = o.position.y - y;
    if (dx * dx + dy * dy < need * need) {
      return true;
    }
  }
  return false;
}

function inBoard(doc: PcbDocument, x: number, y: number, margin: number): boolean {
  const pts = doc.boardOutline?.points ?? [];
  if (pts.length < 2) {
    return true;
  }
  let x1 = pts[0].x;
  let y1 = pts[0].y;
  let x2 = pts[0].x;
  let y2 = pts[0].y;
  for (let i = 1; i < pts.length; i++) {
    x1 = Math.min(x1, pts[i].x);
    y1 = Math.min(y1, pts[i].y);
    x2 = Math.max(x2, pts[i].x);
    y2 = Math.max(y2, pts[i].y);
  }
  return x >= x1 + margin && x <= x2 - margin && y >= y1 + margin && y <= y2 - margin;
}

function nearestHotspot(hotspots: CongestionHotspot[], p: Point2D): CongestionHotspot | null {
  if (hotspots.length === 0) {
    return null;
  }
  let best = hotspots[0];
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < hotspots.length; i++) {
    const d = Math.hypot(hotspots[i].x - p.x, hotspots[i].y - p.y);
    if (d < bestD) {
      bestD = d;
      best = hotspots[i];
    }
  }
  return bestD < 400 ? best : null;
}

export function nudgePlacementFromCongestion(
  doc: PcbDocument,
  map: GlobalCongestionMap,
  hotspots: CongestionHotspot[],
  grid: number
): PlacementNudgeResult {
  let moved = 0;
  let attempted = 0;
  if (hotspots.length === 0) {
    return { moved: 0, attempted: 0 };
  }
  const step = Math.max(grid * 4, map.cell * 0.5);
  for (let fi = 0; fi < doc.footprints.length; fi++) {
    const fp = doc.footprints[fi];
    if (fp.refDes === 'J1' || fp.defId.indexOf('FP_PINHDR_') === 0 ||
      fp.defId === 'FP_MOUNT') {
      continue;
    }
    const hot = nearestHotspot(hotspots, fp.position);
    if (hot === null || hot.density < 5) {
      continue;
    }
    attempted++;
    const dx = fp.position.x - hot.x;
    const dy = fp.position.y - hot.y;
    const len = Math.hypot(dx, dy);
    const ux = len > 1 ? dx / len : 1;
    const uy = len > 1 ? dy / len : 0;
    const candidates: Point2D[] = [
      { x: fp.position.x + ux * step, y: fp.position.y + uy * step },
      { x: fp.position.x + ux * step * 2, y: fp.position.y + uy * step * 2 },
      { x: fp.position.x - uy * step, y: fp.position.y + ux * step },
      { x: fp.position.x + uy * step, y: fp.position.y - ux * step }
    ];
    for (let c = 0; c < candidates.length; c++) {
      const nx = Math.round(candidates[c].x / grid) * grid;
      const ny = Math.round(candidates[c].y / grid) * grid;
      if (!inBoard(doc, nx, ny, footprintSpan(fp) + 20)) {
        continue;
      }
      if (overlapsOther(doc, fp, nx, ny, fp.id)) {
        continue;
      }
      const oldPositions: Map<string, Point2D> = new Map();
      oldPositions.set(fp.id, { x: fp.position.x, y: fp.position.y });
      fp.position.x = nx;
      fp.position.y = ny;
      const ids: Set<string> = new Set();
      ids.add(fp.id);
      updateTracksForFootprintTransform(doc, ids, oldPositions);
      moved++;
      break;
    }
  }
  if (moved > 0 || attempted > 0) {
    tracePcb('PLACE_NUDGE', `moved=${moved} attempted=${attempted} hotspots=${hotspots.length}`);
  }
  return { moved, attempted };
}
