/**
 * Apply LLM placement only — no auto-nudge; out-of-board / overlap fails.
 */
import { PcbDocument, PcbFootprintInst } from '../../types/PcbTypes';
import { PcbPlacementPlan } from '../../types/PcbAiRouteTypes';
import { Point2D, Rotation } from '../../types/CommonTypes';
import {
  collectFootprintPadPositions, updateTracksForFootprintTransform
} from '../PcbTrackBindUtil';
import { tracePcb } from '../PcbTraceLog';

export interface PlacementApplyResult {
  ok: boolean;
  placedCount: number;
  reason: string;
}

interface BoardBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface PendingPlacement {
  fp: PcbFootprintInst;
  x: number;
  y: number;
  rot: Rotation;
  mir: boolean;
}

function boardBounds(doc: PcbDocument): BoardBounds {
  const pts = doc.boardOutline?.points ?? [];
  if (pts.length === 0) {
    const empty: BoardBounds = { minX: -1e9, minY: -1e9, maxX: 1e9, maxY: 1e9 };
    return empty;
  }
  let minX = pts[0].x;
  let minY = pts[0].y;
  let maxX = pts[0].x;
  let maxY = pts[0].y;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].x < minX) {
      minX = pts[i].x;
    }
    if (pts[i].y < minY) {
      minY = pts[i].y;
    }
    if (pts[i].x > maxX) {
      maxX = pts[i].x;
    }
    if (pts[i].y > maxY) {
      maxY = pts[i].y;
    }
  }
  const out: BoardBounds = { minX, minY, maxX, maxY };
  return out;
}

function snapRotation(deg: number): Rotation {
  const n = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
  if (n === 90) {
    return 90;
  }
  if (n === 180) {
    return 180;
  }
  if (n === 270) {
    return 270;
  }
  return 0;
}

function centersTooClose(a: Point2D, b: Point2D, minDist: number): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy) < minDist;
}

export function applyPcbPlacementPlan(doc: PcbDocument, plan: PcbPlacementPlan): PlacementApplyResult {
  if (!plan.fromLlm) {
    const fail: PlacementApplyResult = { ok: false, placedCount: 0, reason: 'placement plan not from LLM' };
    return fail;
  }
  if (!plan.placements || plan.placements.length === 0) {
    const fail: PlacementApplyResult = { ok: false, placedCount: 0, reason: 'empty placement plan from LLM' };
    return fail;
  }

  const locked: Set<string> = new Set(plan.lockedIds ?? []);
  const bounds = boardBounds(doc);
  const byId: Map<string, PcbFootprintInst> = new Map();
  for (const fp of doc.footprints) {
    byId.set(fp.id, fp);
  }

  const pending: PendingPlacement[] = [];
  for (let i = 0; i < plan.placements.length; i++) {
    const item = plan.placements[i];
    if (locked.has(item.footprintId)) {
      continue;
    }
    const fp = byId.get(item.footprintId);
    if (!fp) {
      const fail: PlacementApplyResult = {
        ok: false, placedCount: 0, reason: `unknown footprintId ${item.footprintId}`
      };
      return fail;
    }
    if (fp.locked) {
      continue;
    }
    if (item.x < bounds.minX || item.x > bounds.maxX || item.y < bounds.minY || item.y > bounds.maxY) {
      const fail: PlacementApplyResult = {
        ok: false, placedCount: 0,
        reason: `LLM placement out of board: ${fp.refDes} (${item.x},${item.y})`
      };
      return fail;
    }
    const pend: PendingPlacement = {
      fp: fp,
      x: item.x,
      y: item.y,
      rot: snapRotation(item.rotationDeg),
      mir: item.mirrored === true
    };
    pending.push(pend);
  }

  const minDist = Math.max((doc.metadata.gridSize ?? 5) * 8, 40);
  for (let i = 0; i < pending.length; i++) {
    for (let j = i + 1; j < pending.length; j++) {
      const a: Point2D = { x: pending[i].x, y: pending[i].y };
      const b: Point2D = { x: pending[j].x, y: pending[j].y };
      if (centersTooClose(a, b, minDist)) {
        const fail: PlacementApplyResult = {
          ok: false, placedCount: 0,
          reason: `LLM placements overlap: ${pending[i].fp.refDes} / ${pending[j].fp.refDes}`
        };
        return fail;
      }
    }
  }

  const oldPositions: Map<string, Point2D> = new Map();
  const movedIds: Set<string> = new Set();
  for (let i = 0; i < pending.length; i++) {
    const p = pending[i];
    const before = collectFootprintPadPositions(p.fp);
    before.forEach((pos: Point2D, key: string) => {
      const cp: Point2D = { x: pos.x, y: pos.y };
      oldPositions.set(key, cp);
    });
    p.fp.position = { x: p.x, y: p.y };
    p.fp.rotation = p.rot;
    p.fp.mirrored = p.mir;
    movedIds.add(p.fp.id);
    tracePcb('AI_PLACE', `${p.fp.refDes} -> (${p.x},${p.y}) r=${p.rot}`);
  }
  if (movedIds.size > 0) {
    updateTracksForFootprintTransform(doc, movedIds, oldPositions);
  }

  const ok: PlacementApplyResult = { ok: true, placedCount: pending.length, reason: 'ok' };
  return ok;
}
