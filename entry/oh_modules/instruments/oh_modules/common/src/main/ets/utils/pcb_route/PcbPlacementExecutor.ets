/**
 * Apply LLM placement only — no auto-nudge; out-of-board / overlap / echo / group fail.
 */
import { PcbDocument, PcbFootprintInst } from '../../types/PcbTypes';
import { PcbPlacementPlan, PcbPlacementGroup } from '../../types/PcbAiRouteTypes';
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
    return { minX: -1e9, minY: -1e9, maxX: 1e9, maxY: 1e9 };
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
  return { minX, minY, maxX, maxY };
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

/** 安装孔：应锁定角点，不计入防复读 */
function isMountHole(fp: PcbFootprintInst): boolean {
  const d = (fp.defId ?? '').toUpperCase();
  if (d.indexOf('MOUNT') >= 0) {
    return true;
  }
  const r = (fp.refDes ?? '').toUpperCase();
  // H1/H2… 且非排针
  if (r.length >= 2 && r.charAt(0) === 'H' && d.indexOf('PINHDR') < 0) {
    let allDigit = true;
    for (let i = 1; i < r.length; i++) {
      const c = r.charCodeAt(i);
      if (c < 48 || c > 57) {
        allDigit = false;
        break;
      }
    }
    return allDigit;
  }
  return false;
}

/** 安装孔/角孔分组名：四角跨板，不做聚集校验 */
function isMountOnlyGroupName(name: string): boolean {
  const n = name.toLowerCase();
  return n.indexOf('mount') >= 0
    || n === 'holes'
    || n === 'hole'
    || n === 'mh'
    || n.indexOf('corner') >= 0;
}

function validateGroups(
  plan: PcbPlacementPlan,
  byId: Map<string, PcbFootprintInst>,
  pendingById: Map<string, PendingPlacement>,
  bounds: BoardBounds
): string {
  const groups = plan.groups ?? [];
  if (groups.length === 0) {
    return '';
  }
  const boardDiag = Math.sqrt(
    Math.pow(bounds.maxX - bounds.minX, 2) + Math.pow(bounds.maxY - bounds.minY, 2));
  // 0.55 过严：继电器排等合法功能组常差几 mil 被否（如 1414>1409）
  const maxSpan = Math.max(boardDiag * 0.72, 400);

  for (let gi = 0; gi < groups.length; gi++) {
    const g: PcbPlacementGroup = groups[gi];
    // 安装孔由系统钉四角，对角跨度≈板对角线，禁止按功能组聚集规则否决
    if (isMountOnlyGroupName(g.name ?? '')) {
      continue;
    }
    const ids = g.footprintIds ?? [];
    if (ids.length < 2) {
      continue;
    }
    const pts: Point2D[] = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (!byId.has(id)) {
        // 组内未知 id（LLM 编造）直接忽略，不否决整轮布局
        continue;
      }
      const fp = byId.get(id);
      // 安装孔不计入 span（即便混入 power 等功能组）
      if (fp && isMountHole(fp)) {
        continue;
      }
      const pend = pendingById.get(id);
      if (pend) {
        pts.push({ x: pend.x, y: pend.y });
      } else if (fp) {
        pts.push({ x: fp.position.x, y: fp.position.y });
      }
    }
    // 过滤安装孔后不足 2 点 → 无需聚集校验
    if (pts.length < 2) {
      continue;
    }
    let maxD = 0;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x;
        const dy = pts[i].y - pts[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > maxD) {
          maxD = d;
        }
      }
    }
    if (maxD > maxSpan) {
      return `group ${g.name || gi} too spread span=${Math.round(maxD)}>${Math.round(maxSpan)}`;
    }
  }
  return '';
}

/** 将 LLM 板框落到矩形 outline，并重钉安装孔到四角 */
function applyLlmBoardSize(doc: PcbDocument, widthMil: number, heightMil: number): string {
  const w = Math.round(widthMil);
  const h = Math.round(heightMil);
  const MIN = 400;
  const MAX = 8000;
  if (w < MIN || h < MIN) {
    return `board size too small ${w}x${h} (min ${MIN})`;
  }
  if (w > MAX || h > MAX) {
    return `board size too large ${w}x${h} (max ${MAX})`;
  }
  const prev = boardBounds(doc);
  doc.boardOutline = {
    points: [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h }
    ],
    width: doc.boardOutline?.width ?? 10
  };
  // 安装孔贴新板四角（inset 20mil）
  const inset = 20;
  const corners: Point2D[] = [
    { x: inset, y: inset },
    { x: w - inset, y: inset },
    { x: inset, y: h - inset },
    { x: w - inset, y: h - inset }
  ];
  const mounts: PcbFootprintInst[] = [];
  for (const fp of doc.footprints) {
    if (isMountHole(fp)) {
      mounts.push(fp);
    }
  }
  mounts.sort((a, b) => (a.refDes < b.refDes ? -1 : (a.refDes > b.refDes ? 1 : 0)));
  for (let i = 0; i < mounts.length && i < corners.length; i++) {
    mounts[i].position = { x: corners[i].x, y: corners[i].y };
    mounts[i].rotation = 0;
  }
  tracePcb('AI_BOARD',
    `size ${Math.round(prev.maxX - prev.minX)}x${Math.round(prev.maxY - prev.minY)}→${w}x${h}` +
    ` mounts=${Math.min(mounts.length, corners.length)}`);
  return '';
}

export function applyPcbPlacementPlan(doc: PcbDocument, plan: PcbPlacementPlan): PlacementApplyResult {
  if (!plan.fromLlm) {
    return { ok: false, placedCount: 0, reason: 'placement plan not from LLM' };
  }
  if (!plan.placements || plan.placements.length === 0) {
    return { ok: false, placedCount: 0, reason: 'empty placement plan from LLM' };
  }

  // 板框必须由 LLM 给出（允许略写容差：缺省则失败，逼模型定尺寸）
  const bw = plan.boardWidthMil;
  const bh = plan.boardHeightMil;
  if (bw === undefined || bh === undefined || !(bw > 0) || !(bh > 0)) {
    return {
      ok: false, placedCount: 0,
      reason: 'LLM placement missing boardWidthMil/boardHeightMil — board size must come from model'
    };
  }
  const boardErr = applyLlmBoardSize(doc, bw, bh);
  if (boardErr.length > 0) {
    return { ok: false, placedCount: 0, reason: boardErr };
  }

  const locked: Set<string> = new Set(plan.lockedIds ?? []);
  // 安装孔未在 placements 时自动视为锁定（避免强迫 LLM 抄角点）
  for (const fp of doc.footprints) {
    if (isMountHole(fp) && !fp.locked) {
      locked.add(fp.id);
    }
  }

  const bounds = boardBounds(doc);
  const ejected: string[] = [];
  for (const fp of doc.footprints) {
    if (isMountHole(fp)) {
      continue; // 已重钉四角
    }
    if (locked.has(fp.id) || fp.locked) {
      if (fp.position.x < bounds.minX || fp.position.x > bounds.maxX ||
        fp.position.y < bounds.minY || fp.position.y > bounds.maxY) {
        ejected.push(fp.refDes || fp.id);
      }
    }
  }
  if (ejected.length > 0) {
    return {
      ok: false, placedCount: 0,
      reason: `board shrink would eject locked footprints: ${ejected.slice(0, 6).join(',')}` +
        `${ejected.length > 6 ? '…' : ''} — enlarge boardWidthMil/Height or rePlace them`
    };
  }

  const byId: Map<string, PcbFootprintInst> = new Map();
  for (const fp of doc.footprints) {
    byId.set(fp.id, fp);
  }

  const pending: PendingPlacement[] = [];
  const pendingById: Map<string, PendingPlacement> = new Map();
  const skippedUnknown: string[] = [];
  for (let i = 0; i < plan.placements.length; i++) {
    const item = plan.placements[i];
    if (locked.has(item.footprintId)) {
      continue;
    }
    const fp = byId.get(item.footprintId);
    if (!fp) {
      // LLM 常编造/改写 id 后缀；跳过未知项，用 coverage 门禁逼其补全真实 id
      skippedUnknown.push(item.footprintId);
      continue;
    }
    if (fp.locked) {
      continue;
    }
    if (item.x < bounds.minX || item.x > bounds.maxX || item.y < bounds.minY || item.y > bounds.maxY) {
      return {
        ok: false, placedCount: 0,
        reason: `LLM placement out of board: ${fp.refDes} (${item.x},${item.y})`
      };
    }
    const pend: PendingPlacement = {
      fp: fp,
      x: item.x,
      y: item.y,
      rot: snapRotation(item.rotationDeg),
      mir: item.mirrored === true
    };
    pending.push(pend);
    pendingById.set(fp.id, pend);
  }
  if (skippedUnknown.length > 0) {
    tracePcb('AI_PLACE_SKIP',
      `unknownIds=${skippedUnknown.length} sample=${skippedUnknown.slice(0, 3).join(',')}`);
  }

  let unlocked = 0;
  for (const fp of doc.footprints) {
    if (!fp.locked && !locked.has(fp.id)) {
      unlocked++;
    }
  }
  if (unlocked > 0 && pending.length < unlocked) {
    const unkHint = skippedUnknown.length > 0
      ? `; skippedUnknown=${skippedUnknown.slice(0, 5).join(',')}` +
        `${skippedUnknown.length > 5 ? '…' : ''} — footprintId 必须逐字复制列表，禁止编造`
      : '';
    return {
      ok: false, placedCount: pending.length,
      reason: `placement coverage ${pending.length}/${unlocked} unlocked footprints${unkHint}`
    };
  }

  // 防原位复读：非安装孔中 ≥85% 坐标+旋转未变 → 拒绝
  const grid = doc.metadata.gridSize ?? 5;
  let echoable = 0;
  let echoed = 0;
  for (let i = 0; i < pending.length; i++) {
    const p = pending[i];
    if (isMountHole(p.fp)) {
      continue;
    }
    echoable++;
    const dx = Math.abs(p.x - p.fp.position.x);
    const dy = Math.abs(p.y - p.fp.position.y);
    const sameRot = snapRotation(p.fp.rotation) === p.rot;
    if (dx <= grid && dy <= grid && sameRot) {
      echoed++;
    }
  }
  if (echoable >= 3 && echoed / echoable >= 0.85) {
    return {
      ok: false, placedCount: 0,
      reason: `placement echo ${(echoed)}/${echoable} — refuse copy of current poses; rearrange functional footprints`
    };
  }

  const groupErr = validateGroups(plan, byId, pendingById, bounds);
  if (groupErr.length > 0) {
    return { ok: false, placedCount: 0, reason: groupErr };
  }
  if ((plan.groups?.length ?? 0) > 0) {
    tracePcb('AI_PLACE_GROUPS', `n=${plan.groups!.length}`);
  }

  const minDist = Math.max(grid * 8, 40);
  for (let i = 0; i < pending.length; i++) {
    for (let j = i + 1; j < pending.length; j++) {
      const a: Point2D = { x: pending[i].x, y: pending[i].y };
      const b: Point2D = { x: pending[j].x, y: pending[j].y };
      if (centersTooClose(a, b, minDist)) {
        return {
          ok: false, placedCount: 0,
          reason: `LLM placements overlap: ${pending[i].fp.refDes} / ${pending[j].fp.refDes}`
        };
      }
    }
  }

  const oldPositions: Map<string, Point2D> = new Map();
  const movedIds: Set<string> = new Set();
  for (let i = 0; i < pending.length; i++) {
    const p = pending[i];
    const before = collectFootprintPadPositions(p.fp);
    before.forEach((pos: Point2D, key: string) => {
      oldPositions.set(key, { x: pos.x, y: pos.y });
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

  // 写回有效 lockedIds（含自动安装孔）
  plan.lockedIds = Array.from(locked);

  return { ok: true, placedCount: pending.length, reason: 'ok' };
}
