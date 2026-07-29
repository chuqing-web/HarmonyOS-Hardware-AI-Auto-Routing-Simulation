import type { PcbDocument, PcbLayerId, PcbTrack } from '../types/PcbTypes';
import type { Point2D } from '../types/CommonTypes';
import { IdUtil } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/IdUtil";
import { padWorldPosition } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbZoneUtil";
import { orderPointsNearestNeighbor, snapTrackEndpointsToPads } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbTrackBindUtil";
import { tracePcb, tracePcbWarn } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbTraceLog";
export interface AutoRouteResult {
    trackCount: number;
    netCount: number;
    messages: string[];
}
export interface RerouteResult {
    trackCount: number;
    netCount: number;
}
interface NetPadGroup {
    netId: string;
    netName: string;
    points: Point2D[];
}
function snap(v: number, grid: number): number {
    if (grid <= 0)
        return v;
    return Math.round(v / grid) * grid;
}
function dist(a: Point2D, b: Point2D): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}
/** 正交 L 型两段走线 — 端点精确落在焊盘中心，中间折点吸附网格 */
function routeL(a: Point2D, b: Point2D, grid: number): Point2D[] {
    const s: Point2D = { x: a.x, y: a.y };
    const e: Point2D = { x: b.x, y: b.y };
    if (dist(s, e) < 0.5)
        return [];
    const midH: Point2D = { x: e.x, y: snap(s.y, grid) };
    const midV: Point2D = { x: snap(s.x, grid), y: e.y };
    const lenH = dist(s, midH) + dist(midH, e);
    const lenV = dist(s, midV) + dist(midV, e);
    if (lenH <= lenV) {
        if (dist(s, midH) > 0.5 && dist(midH, e) > 0.5) {
            return [s, midH, e];
        }
        return [s, e];
    }
    if (dist(s, midV) > 0.5 && dist(midV, e) > 0.5) {
        return [s, midV, e];
    }
    return [s, e];
}
function collectNetPads(doc: PcbDocument): Map<string, NetPadGroup> {
    const map: Map<string, NetPadGroup> = new Map();
    for (const fp of doc.footprints) {
        for (const pad of fp.pads) {
            const nid = pad.netId ?? '';
            if (nid.length === 0)
                continue;
            const nname = pad.netName ?? '';
            let grp = map.get(nid);
            if (!grp) {
                grp = { netId: nid, netName: nname, points: [] };
                map.set(nid, grp);
            }
            grp.points.push(padWorldPosition(fp, pad));
        }
    }
    return map;
}
function netAlreadyRouted(doc: PcbDocument, netId: string): boolean {
    for (const trk of doc.tracks) {
        if (trk.netId === netId)
            return true;
    }
    for (const via of doc.vias) {
        if (via.netId === netId)
            return true;
    }
    return false;
}
function addSegment(doc: PcbDocument, layer: PcbLayerId, a: Point2D, b: Point2D, netId: string, netName: string, width: number): number {
    if (dist(a, b) < 0.5)
        return 0;
    const track: PcbTrack = {
        id: IdUtil.generate('trk'),
        layer,
        start: { x: a.x, y: a.y },
        end: { x: b.x, y: b.y },
        width,
        netId,
        netName
    };
    doc.tracks.push(track);
    return 1;
}
function isPowerNetName(netName: string): boolean {
    const nm = netName.toUpperCase();
    return nm === 'GND' || nm === 'VSS' || nm === 'AGND' || nm === 'VCC' || nm === 'VDD';
}
function routeNetGroup(doc: PcbDocument, layer: PcbLayerId, grp: NetPadGroup, grid: number, width: number): number {
    const ordered = orderPointsNearestNeighbor(grp.points);
    let segs = 0;
    for (let i = 0; i < ordered.length - 1; i++) {
        const path = routeL(ordered[i], ordered[i + 1], grid);
        for (let j = 0; j < path.length - 1; j++) {
            segs += addSegment(doc, layer, path[j], path[j + 1], grp.netId, grp.netName, width);
        }
    }
    return segs;
}
/**
 * 对指定网络清除旧走线并重新 L 型链式布线（跳过电源/地网络）。
 * 用于封装移动/旋转后的局部重布。
 */
export function rerouteNets(doc: PcbDocument, layer: PcbLayerId, netIds: Set<string>): RerouteResult {
    const empty: RerouteResult = { trackCount: 0, netCount: 0 };
    if (netIds.size === 0) {
        return empty;
    }
    const grid = doc.metadata.gridSize ?? 5;
    const width = doc.metadata.designRules.defaultTrackWidth;
    const netPads = collectNetPads(doc);
    const toRoute: string[] = [];
    netIds.forEach((nid: string) => {
        const grp = netPads.get(nid);
        if (grp === undefined || grp.points.length < 2) {
            return;
        }
        if (isPowerNetName(grp.netName)) {
            tracePcb('REROUTE_SKIP', `${grp.netName} — 电源/地`);
            return;
        }
        toRoute.push(nid);
    });
    if (toRoute.length === 0) {
        return empty;
    }
    const routeSet = new Set(toRoute);
    doc.tracks = doc.tracks.filter((t: PcbTrack) => !routeSet.has(t.netId));
    let trackCount = 0;
    for (const nid of toRoute) {
        const grp = netPads.get(nid);
        if (grp === undefined) {
            continue;
        }
        const segs = routeNetGroup(doc, layer, grp, grid, width);
        trackCount += segs;
        tracePcb('REROUTE_NET', `${grp.netName || grp.netId} pads=${grp.points.length} segments=${segs}`);
    }
    const snapped = snapTrackEndpointsToPads(doc);
    if (snapped > 0) {
        tracePcb('REROUTE_SNAP', `endpoints=${snapped}`);
    }
    tracePcb('REROUTE_DONE', `nets=${toRoute.length} tracks=${trackCount}`);
    doc.metadata.modifiedAt = new Date().toISOString();
    return { trackCount, netCount: toRoute.length };
}
/**
 * 对未布线网络执行自动 L 型链式布线（仅信号网络，跳过已有走线的网络）
 */
export function autoRoutePcb(doc: PcbDocument, layer: PcbLayerId): AutoRouteResult {
    const messages: string[] = [];
    const grid = doc.metadata.gridSize ?? 5;
    const width = doc.metadata.designRules.defaultTrackWidth;
    const netPads = collectNetPads(doc);
    let trackCount = 0;
    let netCount = 0;
    tracePcb('AUTO_ROUTE_BEGIN', `layer=${layer} netGroups=${netPads.size} grid=${grid} width=${width}`);
    netPads.forEach((grp: NetPadGroup) => {
        if (grp.points.length < 2) {
            tracePcbWarn('AUTO_SKIP', `${grp.netName || grp.netId} pads=${grp.points.length} — 焊盘不足`);
            return;
        }
        if (netAlreadyRouted(doc, grp.netId)) {
            tracePcb('AUTO_SKIP', `${grp.netName || grp.netId} — 已有走线/过孔`);
            return;
        }
        if (isPowerNetName(grp.netName)) {
            messages.push(`跳过电源/地网络: ${grp.netName}`);
            tracePcb('AUTO_SKIP', `${grp.netName} — 电源/地`);
            return;
        }
        netCount++;
        const segs = routeNetGroup(doc, layer, grp, grid, width);
        trackCount += segs;
        tracePcb('AUTO_NET', `${grp.netName || grp.netId} pads=${grp.points.length} segments=${segs}`);
    });
    const snapped = snapTrackEndpointsToPads(doc);
    if (snapped > 0) {
        tracePcb('AUTO_SNAP', `endpoints=${snapped}`);
    }
    if (netCount === 0) {
        messages.push('没有需要自动布线的网络');
    }
    else {
        messages.push(`已自动布线 ${netCount} 个网络，${trackCount} 段`);
    }
    doc.metadata.modifiedAt = new Date().toISOString();
    return { trackCount, netCount, messages };
}
