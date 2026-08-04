import type { PcbDocument, PcbFootprintInst } from '../../types/PcbTypes';
import type { PcbPlacementPlan, PcbPlacementGroup } from '../../types/PcbAiRouteTypes';
import type { Point2D, Rotation } from '../../types/CommonTypes';
import { collectFootprintPadPositions, updateTracksForFootprintTransform } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbTrackBindUtil";
import { tracePcb } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbTraceLog";
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
function validateGroups(plan: PcbPlacementPlan, byId: Map<string, PcbFootprintInst>, pendingById: Map<string, PendingPlacement>, bounds: BoardBounds): string {
    const groups = plan.groups ?? [];
    if (groups.length === 0) {
        return '';
    }
    const boardDiag = Math.sqrt(Math.pow(bounds.maxX - bounds.minX, 2) + Math.pow(bounds.maxY - bounds.minY, 2));
    const maxSpan = Math.max(boardDiag * 0.55, 200);
    for (let gi = 0; gi < groups.length; gi++) {
        const g: PcbPlacementGroup = groups[gi];
        const ids = g.footprintIds ?? [];
        if (ids.length < 2) {
            continue;
        }
        const pts: Point2D[] = [];
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            if (!byId.has(id)) {
                return `group ${g.name} unknown footprintId ${id}`;
            }
            const pend = pendingById.get(id);
            const fp = byId.get(id);
            if (pend) {
                pts.push({ x: pend.x, y: pend.y });
            }
            else if (fp) {
                pts.push({ x: fp.position.x, y: fp.position.y });
            }
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
export function applyPcbPlacementPlan(doc: PcbDocument, plan: PcbPlacementPlan): PlacementApplyResult {
    if (!plan.fromLlm) {
        return { ok: false, placedCount: 0, reason: 'placement plan not from LLM' };
    }
    if (!plan.placements || plan.placements.length === 0) {
        return { ok: false, placedCount: 0, reason: 'empty placement plan from LLM' };
    }
    const locked: Set<string> = new Set(plan.lockedIds ?? []);
    // 安装孔未在 placements 时自动视为锁定（避免强迫 LLM 抄角点）
    for (const fp of doc.footprints) {
        if (isMountHole(fp) && !fp.locked) {
            locked.add(fp.id);
        }
    }
    const bounds = boardBounds(doc);
    const byId: Map<string, PcbFootprintInst> = new Map();
    for (const fp of doc.footprints) {
        byId.set(fp.id, fp);
    }
    const pending: PendingPlacement[] = [];
    const pendingById: Map<string, PendingPlacement> = new Map();
    for (let i = 0; i < plan.placements.length; i++) {
        const item = plan.placements[i];
        if (locked.has(item.footprintId)) {
            continue;
        }
        const fp = byId.get(item.footprintId);
        if (!fp) {
            return { ok: false, placedCount: 0, reason: `unknown footprintId ${item.footprintId}` };
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
    let unlocked = 0;
    for (const fp of doc.footprints) {
        if (!fp.locked && !locked.has(fp.id)) {
            unlocked++;
        }
    }
    if (unlocked > 0 && pending.length < unlocked) {
        return {
            ok: false, placedCount: pending.length,
            reason: `placement coverage ${pending.length}/${unlocked} unlocked footprints`
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
