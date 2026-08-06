import type { PcbDocument, PcbFootprintInst, PcbPad, PcbTrack } from '../types/PcbTypes';
import type { Point2D } from '../types/CommonTypes';
import { padWorldPosition } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbZoneUtil";
import { tracePcb } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbTraceLog";
interface PcbPadSnapRef {
    pos: Point2D;
    netId: string;
    tol: number;
}
interface TrackEndpointRef {
    track: PcbTrack;
    isStart: boolean;
}
interface JunctionMoveTask {
    oldPos: Point2D;
    newPos: Point2D;
    netId: string;
}
export interface TrackFollowResult {
    updated: number;
    affectedNetIds: Set<string>;
}
function copyPoint2D(p: Point2D): Point2D {
    const pt: Point2D = { x: p.x, y: p.y };
    return pt;
}
/** 焊盘世界坐标索引键：footprintId:padId */
export function pcbPadPosKey(fpId: string, padId: string): string {
    return `${fpId}:${padId}`;
}
/** 收集单个封装所有焊盘的世界坐标 */
export function collectFootprintPadPositions(fp: PcbFootprintInst): Map<string, Point2D> {
    const map: Map<string, Point2D> = new Map();
    for (const pad of fp.pads) {
        const wp = padWorldPosition(fp, pad);
        map.set(pcbPadPosKey(fp.id, pad.id), { x: wp.x, y: wp.y });
    }
    return map;
}
/** 根据焊盘尺寸计算吸附容差（保证走线端点能匹配到焊盘） */
export function padSnapTolerance(pad: PcbPad, gridSize: number): number {
    const padRadius = Math.max(pad.size.x, pad.size.y) / 2;
    const g = gridSize > 0 ? gridSize : 5;
    return Math.max(padRadius + g * 2, g * 4, 20);
}
/** 折点/走线端点匹配容差 */
export function junctionMatchTolerance(gridSize: number): number {
    const g = gridSize > 0 ? gridSize : 5;
    return Math.max(g, 8);
}
function pointDist(a: Point2D, b: Point2D): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}
function junctionKey(pos: Point2D, netId: string, tol: number): string {
    const q = tol > 0 ? tol : 8;
    return `${netId}|${Math.round(pos.x / q)}|${Math.round(pos.y / q)}`;
}
function getTrackEndpoint(trk: PcbTrack, isStart: boolean): Point2D {
    return isStart ? trk.start : trk.end;
}
function netsCompatible(trackNetId: string, taskNetId: string): boolean {
    if (taskNetId.length === 0 || trackNetId.length === 0) {
        return true;
    }
    return trackNetId === taskNetId;
}
function isEndpointOnStationaryPad(pt: Point2D, doc: PcbDocument, movedFootprintIds: Set<string>, gridSize: number): boolean {
    for (const fp of doc.footprints) {
        if (movedFootprintIds.has(fp.id)) {
            continue;
        }
        for (const pad of fp.pads) {
            const wp = padWorldPosition(fp, pad);
            const tol = padSnapTolerance(pad, gridSize);
            if (pointDist(pt, wp) <= tol) {
                return true;
            }
        }
    }
    return false;
}
function findEndpointsAtJunction(doc: PcbDocument, pos: Point2D, netId: string, tol: number): TrackEndpointRef[] {
    const refs: TrackEndpointRef[] = [];
    for (const trk of doc.tracks) {
        if (!netsCompatible(trk.netId, netId)) {
            continue;
        }
        if (pointDist(trk.start, pos) <= tol) {
            refs.push({ track: trk, isStart: true });
        }
        if (pointDist(trk.end, pos) <= tol) {
            refs.push({ track: trk, isStart: false });
        }
    }
    return refs;
}
function trackEndKey(trackId: string, isStart: boolean): string {
    return `${trackId}:${isStart ? 'S' : 'E'}`;
}
function applyJunctionMove(doc: PcbDocument, seed: JunctionMoveTask, movedFootprintIds: Set<string>, gridSize: number, junctionTol: number, visited: Set<string>, movedEnds: Set<string>, affectedNetIds: Set<string>): number {
    const queue: JunctionMoveTask[] = [seed];
    let updated = 0;
    // 焊盘种子用更大容差匹配端点（与 padSnapTolerance 对齐），折点传播仍用 junctionTol
    const seedFindTol = Math.max(junctionTol, 20);
    while (queue.length > 0) {
        const task = queue.shift()!;
        const oldKey = junctionKey(task.oldPos, task.netId, junctionTol);
        if (visited.has(oldKey)) {
            continue;
        }
        visited.add(oldKey);
        const deltaX = task.newPos.x - task.oldPos.x;
        const deltaY = task.newPos.y - task.oldPos.y;
        if (Math.abs(deltaX) < 0.01 && Math.abs(deltaY) < 0.01) {
            continue;
        }
        const matchTol = (task === seed) ? seedFindTol : junctionTol;
        const endpoints = findEndpointsAtJunction(doc, task.oldPos, task.netId, matchTol);
        if (endpoints.length === 0) {
            continue;
        }
        for (const ref of endpoints) {
            const endKey = trackEndKey(ref.track.id, ref.isStart);
            if (movedEnds.has(endKey)) {
                continue;
            }
            const pt = getTrackEndpoint(ref.track, ref.isStart);
            if (pointDist(pt, task.oldPos) > matchTol) {
                continue;
            }
            if (isEndpointOnStationaryPad(pt, doc, movedFootprintIds, gridSize)) {
                continue;
            }
            pt.x += deltaX;
            pt.y += deltaY;
            movedEnds.add(endKey);
            updated++;
            if (ref.track.netId.length > 0) {
                affectedNetIds.add(ref.track.netId);
            }
            const otherIsStart = !ref.isStart;
            const otherEndKey = trackEndKey(ref.track.id, otherIsStart);
            if (movedEnds.has(otherEndKey)) {
                continue;
            }
            const otherPt = getTrackEndpoint(ref.track, otherIsStart);
            if (pointDist(otherPt, task.oldPos) <= junctionTol) {
                continue;
            }
            if (isEndpointOnStationaryPad(otherPt, doc, movedFootprintIds, gridSize)) {
                continue;
            }
            const nextNetId = ref.track.netId;
            const nextOldKey = junctionKey(otherPt, nextNetId, junctionTol);
            if (visited.has(nextOldKey)) {
                continue;
            }
            queue.push({
                oldPos: { x: otherPt.x, y: otherPt.y },
                newPos: { x: otherPt.x + deltaX, y: otherPt.y + deltaY },
                netId: nextNetId
            });
        }
    }
    return updated;
}
/**
 * 封装移动/旋转后，将连接到其焊盘的走线端点更新到新焊盘位置，
 * 并沿走线拓扑传播位移直到固定焊盘，避免折点断开。
 */
export function updateTracksForFootprintTransform(doc: PcbDocument, movedFootprintIds: Set<string>, oldPositions: Map<string, Point2D>, affectedNetIds?: Set<string>): number {
    const result = updateTracksForFootprintTransformDetailed(doc, movedFootprintIds, oldPositions);
    if (affectedNetIds !== undefined) {
        result.affectedNetIds.forEach((nid: string) => affectedNetIds.add(nid));
    }
    return result.updated;
}
/** 带受影响网络信息的封装移动走线跟随 */
export function updateTracksForFootprintTransformDetailed(doc: PcbDocument, movedFootprintIds: Set<string>, oldPositions: Map<string, Point2D>): TrackFollowResult {
    const empty: TrackFollowResult = { updated: 0, affectedNetIds: new Set() };
    if (oldPositions.size === 0 || movedFootprintIds.size === 0) {
        return empty;
    }
    const gridSize = doc.metadata.gridSize ?? 5;
    const junctionTol = junctionMatchTolerance(gridSize);
    const newPositions: Map<string, Point2D> = new Map();
    const padByKey: Map<string, PcbPad> = new Map();
    for (const fp of doc.footprints) {
        if (!movedFootprintIds.has(fp.id)) {
            continue;
        }
        for (const pad of fp.pads) {
            const key = pcbPadPosKey(fp.id, pad.id);
            const wp = padWorldPosition(fp, pad);
            newPositions.set(key, { x: wp.x, y: wp.y });
            padByKey.set(key, pad);
        }
    }
    const visited: Set<string> = new Set();
    const movedEnds: Set<string> = new Set();
    const nets: Set<string> = new Set();
    const queue: JunctionMoveTask[] = [];
    oldPositions.forEach((oldPos: Point2D, padKey: string) => {
        const newPos = newPositions.get(padKey);
        if (newPos === undefined) {
            return;
        }
        const pad = padByKey.get(padKey);
        queue.push({
            oldPos: { x: oldPos.x, y: oldPos.y },
            newPos: { x: newPos.x, y: newPos.y },
            netId: pad?.netId ?? ''
        });
        if (pad !== undefined && (pad.netId ?? '').length > 0) {
            nets.add(pad.netId ?? '');
        }
    });
    let updated = 0;
    for (const task of queue) {
        updated += applyJunctionMove(doc, task, movedFootprintIds, gridSize, junctionTol, visited, movedEnds, nets);
    }
    if (updated > 0) {
        tracePcb('TRACK_FOLLOW', `footprints=${movedFootprintIds.size} endpoints=${updated} nets=${nets.size} propagate=on`);
    }
    return { updated, affectedNetIds: nets };
}
/** 拖拽走线段前记录的端点快照 */
export interface TrackEndpointSnapshot {
    trackId: string;
    isStart: boolean;
    pos: Point2D;
    netId: string;
}
/**
 * 选中走线平移后，同步同一折点上未选中走线的端点，保持拓扑连接。
 * 落在焊盘上的端点不跟随平移，避免把其他走线从焊盘上拽开。
 */
export function syncMovedTrackJunctions(doc: PcbDocument, movedTrackIds: Set<string>, snapshots: TrackEndpointSnapshot[]): number {
    if (snapshots.length === 0 || movedTrackIds.size === 0) {
        return 0;
    }
    const gridSize = doc.metadata.gridSize ?? 5;
    const junctionTol = junctionMatchTolerance(gridSize);
    const emptyMoved: Set<string> = new Set();
    let updated = 0;
    for (const snap of snapshots) {
        const trk = doc.tracks.find((t: PcbTrack) => t.id === snap.trackId);
        if (trk === undefined) {
            continue;
        }
        const newPos = snap.isStart ? trk.start : trk.end;
        const deltaX = newPos.x - snap.pos.x;
        const deltaY = newPos.y - snap.pos.y;
        if (Math.abs(deltaX) < 0.01 && Math.abs(deltaY) < 0.01) {
            continue;
        }
        for (const other of doc.tracks) {
            if (movedTrackIds.has(other.id)) {
                continue;
            }
            if (snap.netId.length > 0 && other.netId.length > 0 && other.netId !== snap.netId) {
                continue;
            }
            if (pointDist(other.start, snap.pos) <= junctionTol) {
                if (!isEndpointOnStationaryPad(other.start, doc, emptyMoved, gridSize)) {
                    other.start.x += deltaX;
                    other.start.y += deltaY;
                    updated++;
                }
            }
            if (pointDist(other.end, snap.pos) <= junctionTol) {
                if (!isEndpointOnStationaryPad(other.end, doc, emptyMoved, gridSize)) {
                    other.end.x += deltaX;
                    other.end.y += deltaY;
                    updated++;
                }
            }
        }
    }
    if (updated > 0) {
        tracePcb('TRACK_JUNCTION_SYNC', `movedTracks=${movedTrackIds.size} synced=${updated}`);
    }
    return updated;
}
/**
 * 检测走线端点是否落在同网络焊盘上；若是则吸附到焊盘中心并标记锁定。
 * 返回键：`${trackId}|S` / `${trackId}|E`，供拖拽时跳过平移。
 */
export function lockTrackEndpointsToPads(doc: PcbDocument, trackIds: Set<string>): Set<string> {
    const locked: Set<string> = new Set();
    if (trackIds.size === 0) {
        return locked;
    }
    const gridSize = doc.metadata.gridSize ?? 5;
    let snapped = 0;
    for (const trk of doc.tracks) {
        if (!trackIds.has(trk.id)) {
            continue;
        }
        const startPad = findPadAnchorForEndpoint(doc, trk.start, trk.netId, gridSize);
        if (startPad !== null) {
            if (pointDist(trk.start, startPad) > 0.01) {
                trk.start.x = startPad.x;
                trk.start.y = startPad.y;
                snapped++;
            }
            locked.add(`${trk.id}|S`);
        }
        const endPad = findPadAnchorForEndpoint(doc, trk.end, trk.netId, gridSize);
        if (endPad !== null) {
            if (pointDist(trk.end, endPad) > 0.01) {
                trk.end.x = endPad.x;
                trk.end.y = endPad.y;
                snapped++;
            }
            locked.add(`${trk.id}|E`);
        }
    }
    if (locked.size > 0) {
        tracePcb('TRACK_PAD_LOCK', `tracks=${trackIds.size} lockedEnds=${locked.size} snapped=${snapped} mode=both-ends-if-any-pad`);
    }
    return locked;
}
/** 同网焊盘锚定：端点在焊盘吸附容差内则返回焊盘中心，否则 null */
function findPadAnchorForEndpoint(doc: PcbDocument, pt: Point2D, netId: string, gridSize: number): Point2D | null {
    let best: Point2D | null = null;
    let bestDist = Infinity;
    for (const fp of doc.footprints) {
        for (const pad of fp.pads) {
            const padNet = pad.netId ?? '';
            if (netId.length > 0 && padNet.length > 0 && padNet !== netId) {
                continue;
            }
            if (netId.length > 0 && padNet.length === 0) {
                continue;
            }
            const wp = padWorldPosition(fp, pad);
            const tol = padSnapTolerance(pad, gridSize);
            const d = pointDist(pt, wp);
            if (d <= tol && d < bestDist) {
                bestDist = d;
                best = { x: wp.x, y: wp.y };
            }
        }
    }
    return best;
}
/** 收集移动封装所涉及的网络 ID（用于移动后局部重布） */
export function collectNetIdsForFootprints(doc: PcbDocument, footprintIds: Set<string>): Set<string> {
    const netIds: Set<string> = new Set();
    for (const fp of doc.footprints) {
        if (!footprintIds.has(fp.id)) {
            continue;
        }
        for (const pad of fp.pads) {
            const nid = pad.netId ?? '';
            if (nid.length > 0) {
                netIds.add(nid);
            }
        }
    }
    return netIds;
}
/** 将现有走线端点吸附到同网络最近焊盘（自动布线/导入后校正）
 * 按折点整体移动：同一坐标上的所有端点一起挪，避免 L 拐角只动一段而「拆开」。
 */
export function snapTrackEndpointsToPads(doc: PcbDocument): number {
    const gridSize = doc.metadata.gridSize ?? 5;
    const junctionTol = junctionMatchTolerance(gridSize);
    const pads: PcbPadSnapRef[] = [];
    for (const fp of doc.footprints) {
        for (const pad of fp.pads) {
            const wp = padWorldPosition(fp, pad);
            const ref: PcbPadSnapRef = {
                pos: wp,
                netId: pad.netId ?? '',
                tol: padSnapTolerance(pad, gridSize)
            };
            pads.push(ref);
        }
    }
    const findSnapTarget = (pt: Point2D, netId: string): Point2D | null => {
        let best: Point2D | null = null;
        let bestDist = Infinity;
        for (const pr of pads) {
            if (netId.length > 0) {
                if (pr.netId.length === 0 || pr.netId !== netId) {
                    continue;
                }
            }
            else if (pr.netId.length > 0) {
                continue;
            }
            const d = pointDist(pt, pr.pos);
            const tightTol = Math.min(pr.tol, Math.max(pr.tol * 0.55, 12));
            if (d <= tightTol && d < bestDist) {
                bestDist = d;
                best = pr.pos;
            }
        }
        if (best !== null && bestDist > 0.01) {
            return best;
        }
        return null;
    };
    // 收集唯一折点（net + 量化坐标）
    interface JunctionBucket {
        netId: string;
        pos: Point2D;
        refs: TrackEndpointRef[];
    }
    const buckets: Map<string, JunctionBucket> = new Map();
    for (const trk of doc.tracks) {
        const addEnd = (isStart: boolean): void => {
            const pt = getTrackEndpoint(trk, isStart);
            const key = junctionKey(pt, trk.netId, junctionTol);
            let b = buckets.get(key);
            if (b === undefined) {
                b = { netId: trk.netId, pos: { x: pt.x, y: pt.y }, refs: [] };
                buckets.set(key, b);
            }
            b.refs.push({ track: trk, isStart });
        };
        addEnd(true);
        addEnd(false);
    }
    let snapped = 0;
    buckets.forEach((bucket: JunctionBucket) => {
        const target = findSnapTarget(bucket.pos, bucket.netId);
        if (target === null) {
            return;
        }
        // 若整体挪到焊盘会使任一段塌成零长，则跳过该折点（保留短 stub，不断开邻居）
        let wouldCollapse = false;
        for (const ref of bucket.refs) {
            const other = getTrackEndpoint(ref.track, !ref.isStart);
            if (pointDist(target, other) < 0.5) {
                wouldCollapse = true;
                break;
            }
        }
        if (wouldCollapse) {
            return;
        }
        for (const ref of bucket.refs) {
            const pt = getTrackEndpoint(ref.track, ref.isStart);
            if (pointDist(pt, target) > 0.01) {
                pt.x = target.x;
                pt.y = target.y;
                snapped++;
            }
        }
    });
    return snapped;
}
/** 删除零长/近零长走线（吸附塌缩后的兜底清理） */
export function pruneZeroLengthTracks(doc: PcbDocument): number {
    const before = doc.tracks.length;
    const kept: PcbTrack[] = [];
    for (let i = 0; i < doc.tracks.length; i++) {
        const t = doc.tracks[i];
        if (pointDist(t.start, t.end) >= 0.5) {
            kept.push(t);
        }
    }
    doc.tracks = kept;
    return before - kept.length;
}
/**
 * 合并同网同层同宽、端点相接且共线的相邻段，减少 via/吸附产生的碎短线。
 * @returns 被合并掉的段数
 */
export function mergeColinearTracks(doc: PcbDocument): number {
    const eps = 0.51;
    const samePt = (a: Point2D, b: Point2D): boolean => Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
    const isHoriz = (t: PcbTrack): boolean => Math.abs(t.start.y - t.end.y) < eps;
    const isVert = (t: PcbTrack): boolean => Math.abs(t.start.x - t.end.x) < eps;
    let merged = 0;
    let changed = true;
    while (changed) {
        changed = false;
        const tracks = doc.tracks;
        let foundI = -1;
        let foundJ = -1;
        let ns: Point2D | null = null;
        let ne: Point2D | null = null;
        for (let i = 0; i < tracks.length && foundI < 0; i++) {
            const a = tracks[i];
            if (!isHoriz(a) && !isVert(a)) {
                continue;
            }
            for (let j = i + 1; j < tracks.length; j++) {
                const b = tracks[j];
                if (a.layer !== b.layer || a.netId !== b.netId ||
                    Math.abs(a.width - b.width) > 0.1) {
                    continue;
                }
                if (isHoriz(a) !== isHoriz(b) || isVert(a) !== isVert(b)) {
                    continue;
                }
                let joined: Point2D | null = null;
                let otherA: Point2D | null = null;
                let otherB: Point2D | null = null;
                if (samePt(a.end, b.start)) {
                    joined = a.end;
                    otherA = a.start;
                    otherB = b.end;
                }
                else if (samePt(a.end, b.end)) {
                    joined = a.end;
                    otherA = a.start;
                    otherB = b.start;
                }
                else if (samePt(a.start, b.start)) {
                    joined = a.start;
                    otherA = a.end;
                    otherB = b.end;
                }
                else if (samePt(a.start, b.end)) {
                    joined = a.start;
                    otherA = a.end;
                    otherB = b.start;
                }
                if (joined === null || otherA === null || otherB === null) {
                    continue;
                }
                if (isHoriz(a)) {
                    if (Math.abs(otherA.y - otherB.y) >= eps || Math.abs(otherA.y - joined.y) >= eps) {
                        continue;
                    }
                }
                else {
                    if (Math.abs(otherA.x - otherB.x) >= eps || Math.abs(otherA.x - joined.x) >= eps) {
                        continue;
                    }
                }
                foundI = i;
                foundJ = j;
                ns = { x: otherA.x, y: otherA.y };
                ne = { x: otherB.x, y: otherB.y };
                break;
            }
        }
        if (foundI >= 0 && foundJ >= 0 && ns !== null && ne !== null) {
            tracks[foundI].start = ns;
            tracks[foundI].end = ne;
            tracks.splice(foundJ, 1);
            merged++;
            changed = true;
        }
    }
    return merged;
}
/** 删除短于 minLen 的碎段（默认 2；须先 mergeColinear 以免误删有效短跳） */
export function pruneShortTracks(doc: PcbDocument, minLen: number = 2): number {
    const before = doc.tracks.length;
    const kept: PcbTrack[] = [];
    for (let i = 0; i < doc.tracks.length; i++) {
        const t = doc.tracks[i];
        if (pointDist(t.start, t.end) >= minLen) {
            kept.push(t);
        }
    }
    doc.tracks = kept;
    return before - kept.length;
}
/**
 * 仅吸附「与指定封装同网且端点已靠近其焊盘」的走线端点。
 * 折点整体移动，避免只动一段把拐角拆开。
 */
export function snapTrackEndpointsNearFootprints(doc: PcbDocument, footprintIds: Set<string>): number {
    if (footprintIds.size === 0) {
        return 0;
    }
    const pads: PcbPadSnapRef[] = [];
    const netIds: Set<string> = new Set();
    for (const fp of doc.footprints) {
        if (!footprintIds.has(fp.id)) {
            continue;
        }
        for (const pad of fp.pads) {
            const nid = pad.netId ?? '';
            if (nid.length > 0) {
                netIds.add(nid);
            }
            pads.push({
                pos: padWorldPosition(fp, pad),
                netId: nid,
                tol: Math.max(Math.max(pad.size.x, pad.size.y) / 2 + 2, 10)
            });
        }
    }
    if (pads.length === 0) {
        return 0;
    }
    const gridSize = doc.metadata.gridSize ?? 5;
    const junctionTol = junctionMatchTolerance(gridSize);
    const findSnapTarget = (pt: Point2D, netId: string): Point2D | null => {
        let best: Point2D | null = null;
        let bestDist = Infinity;
        for (const pr of pads) {
            if (netId.length > 0 && pr.netId !== netId) {
                continue;
            }
            const d = pointDist(pt, pr.pos);
            if (d <= pr.tol && d < bestDist) {
                bestDist = d;
                best = pr.pos;
            }
        }
        if (best !== null && bestDist > 0.01) {
            return best;
        }
        return null;
    };
    interface JunctionBucket {
        netId: string;
        pos: Point2D;
        refs: TrackEndpointRef[];
    }
    const buckets: Map<string, JunctionBucket> = new Map();
    for (const trk of doc.tracks) {
        if (trk.netId.length > 0 && !netIds.has(trk.netId)) {
            continue;
        }
        const addEnd = (isStart: boolean): void => {
            const pt = getTrackEndpoint(trk, isStart);
            const key = junctionKey(pt, trk.netId, junctionTol);
            let b = buckets.get(key);
            if (b === undefined) {
                b = { netId: trk.netId, pos: { x: pt.x, y: pt.y }, refs: [] };
                buckets.set(key, b);
            }
            b.refs.push({ track: trk, isStart });
        };
        addEnd(true);
        addEnd(false);
    }
    let snapped = 0;
    buckets.forEach((bucket: JunctionBucket) => {
        const target = findSnapTarget(bucket.pos, bucket.netId);
        if (target === null) {
            return;
        }
        let wouldCollapse = false;
        for (const ref of bucket.refs) {
            const other = getTrackEndpoint(ref.track, !ref.isStart);
            if (pointDist(target, other) < 0.5) {
                wouldCollapse = true;
                break;
            }
        }
        if (wouldCollapse) {
            return;
        }
        for (const ref of bucket.refs) {
            const pt = getTrackEndpoint(ref.track, ref.isStart);
            if (pointDist(pt, target) > 0.01) {
                pt.x = target.x;
                pt.y = target.y;
                snapped++;
            }
        }
    });
    if (snapped > 0) {
        tracePcb('TRACK_SNAP_NEAR_FP', `fps=${footprintIds.size} endpoints=${snapped}`);
    }
    return snapped;
}
/** 最近邻排序焊盘坐标，用于链式自动布线 */
export function orderPointsNearestNeighbor(points: Point2D[]): Point2D[] {
    if (points.length <= 2) {
        const out: Point2D[] = [];
        for (const p of points) {
            out.push(copyPoint2D(p));
        }
        return out;
    }
    const remaining: Point2D[] = [];
    for (const p of points) {
        remaining.push(copyPoint2D(p));
    }
    const ordered: Point2D[] = [];
    let current = remaining.shift()!;
    ordered.push(current);
    while (remaining.length > 0) {
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
            const d = pointDist(current, remaining[i]);
            if (d < bestDist) {
                bestDist = d;
                bestIdx = i;
            }
        }
        current = remaining.splice(bestIdx, 1)[0];
        ordered.push(current);
    }
    return ordered;
}
