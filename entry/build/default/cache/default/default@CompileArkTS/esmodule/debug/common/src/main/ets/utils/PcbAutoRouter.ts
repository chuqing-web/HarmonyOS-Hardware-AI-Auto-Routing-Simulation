import { PcbLayerId } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/PcbTypes";
import type { PcbDocument, PcbTrack } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/PcbTypes";
import type { Point2D } from '../types/CommonTypes';
import { IdUtil } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/IdUtil";
import { padWorldPosition } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbZoneUtil";
import { orderPointsNearestNeighbor, snapTrackEndpointsToPads, pruneZeroLengthTracks } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbTrackBindUtil";
import { ensureBoardAccessories, clearCopperForNets } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbBoardAccessories";
import type { AccessoryNetHint } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbBoardAccessories";
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
    /** 原理图关联器件焊盘 */
    points: Point2D[];
    /** J1 外接针 — 器件布完后再抽头 */
    connectorPoints: Point2D[];
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
        // 安装孔仅占网络名供铺铜，不参与 L 型链式布线（避免地线绕四角）
        if (fp.defId === 'FP_MOUNT' || (fp.refDes.length >= 2 && fp.refDes.charAt(0) === 'H' &&
            fp.refDes.charCodeAt(1) >= 48 && fp.refDes.charCodeAt(1) <= 57)) {
            continue;
        }
        const isConnector = fp.refDes === 'J1' || fp.defId.indexOf('FP_PINHDR_') === 0;
        for (const pad of fp.pads) {
            const nid = pad.netId ?? '';
            if (nid.length === 0)
                continue;
            const nname = pad.netName ?? '';
            let grp = map.get(nid);
            if (!grp) {
                grp = { netId: nid, netName: nname, points: [], connectorPoints: [] };
                map.set(nid, grp);
            }
            const wp = padWorldPosition(fp, pad);
            if (isConnector) {
                grp.connectorPoints.push(wp);
            }
            else {
                grp.points.push(wp);
            }
        }
    }
    return map;
}
function netPadTotal(grp: NetPadGroup): number {
    return grp.points.length + grp.connectorPoints.length;
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
function isGndNetName(netName: string): boolean {
    const nm = netName.toUpperCase();
    return nm === 'GND' || nm === 'VSS' || nm === 'AGND';
}
function isPowerNetName(netName: string): boolean {
    const nm = netName.toUpperCase();
    return isGndNetName(nm) || nm === 'VCC' || nm === 'VDD' || nm === 'VEE' ||
        nm === 'VOUT' || nm === 'REG_IN' || nm === 'VIN' || nm === 'VIN_SRC' ||
        nm.indexOf('VCC') === 0 || nm.indexOf('VDD') === 0 || nm.indexOf('VIN') === 0;
}
/** 地网走底层，减少与顶层信号交叉；电源加宽 */
function layerForNet(preferred: PcbLayerId, netName: string): PcbLayerId {
    if (isGndNetName(netName)) {
        return PcbLayerId.B_CU;
    }
    return preferred;
}
function widthForNet(defaultWidth: number, netName: string): number {
    if (isPowerNetName(netName)) {
        return Math.max(defaultWidth * 2, 20);
    }
    return defaultWidth;
}
function routeLChain(doc: PcbDocument, layer: PcbLayerId, points: Point2D[], netId: string, netName: string, grid: number, width: number): number {
    if (points.length < 2) {
        return 0;
    }
    const ordered = orderPointsNearestNeighbor(points);
    let segs = 0;
    for (let i = 0; i < ordered.length - 1; i++) {
        const path = routeL(ordered[i], ordered[i + 1], grid);
        for (let j = 0; j < path.length - 1; j++) {
            segs += addSegment(doc, layer, path[j], path[j + 1], netId, netName, width);
        }
    }
    return segs;
}
function nearestPoint(from: Point2D, candidates: Point2D[]): Point2D | null {
    if (candidates.length === 0) {
        return null;
    }
    let best = candidates[0];
    let bestD = dist(from, best);
    for (let i = 1; i < candidates.length; i++) {
        const d = dist(from, candidates[i]);
        if (d < bestD) {
            bestD = d;
            best = candidates[i];
        }
    }
    return best;
}
function routeNetGroup(doc: PcbDocument, layer: PcbLayerId, grp: NetPadGroup, grid: number, width: number): number {
    const core = grp.points;
    const connectors = grp.connectorPoints;
    let segs = 0;
    // 1) 先在器件焊盘之间成链（不含 J1）
    if (core.length >= 2) {
        segs += routeLChain(doc, layer, core, grp.netId, grp.netName, grid, width);
    }
    // 2) J1 从最近的器件焊盘单独抽头，避免长干线挂在 R1 等边角脚上
    if (connectors.length > 0) {
        const hubs: Point2D[] = [];
        for (const p of core) {
            hubs.push(p);
        }
        if (hubs.length === 0) {
            // 仅外接针（如空 VEE）— 多针才互连，单针跳过
            segs += routeLChain(doc, layer, connectors, grp.netId, grp.netName, grid, width);
        }
        else {
            for (const c of connectors) {
                const hub = nearestPoint(c, hubs);
                if (!hub) {
                    continue;
                }
                const path = routeL(hub, c, grid);
                for (let j = 0; j < path.length - 1; j++) {
                    segs += addSegment(doc, layer, path[j], path[j + 1], grp.netId, grp.netName, width);
                }
            }
        }
    }
    // 仅 1 个器件焊盘 + 无连接器：无法布
    // 仅 1 个器件焊盘 + 连接器：上面 step2 已处理
    if (core.length === 1 && connectors.length === 0) {
        return 0;
    }
    return segs;
}
function finishRouteCleanup(doc: PcbDocument, tag: string): void {
    const snapped = snapTrackEndpointsToPads(doc);
    if (snapped > 0) {
        tracePcb(`${tag}_SNAP`, `endpoints=${snapped}`);
    }
    const pruned = pruneZeroLengthTracks(doc);
    if (pruned > 0) {
        tracePcbWarn(`${tag}_PRUNE`, `zeroLen=${pruned}`);
    }
}
/**
 * 对指定网络清除旧走线并重新 L 型链式布线。
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
        if (grp === undefined || netPadTotal(grp) < 2) {
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
        const ly = layerForNet(layer, grp.netName);
        const w = widthForNet(width, grp.netName);
        const segs = routeNetGroup(doc, ly, grp, grid, w);
        trackCount += segs;
        tracePcb('REROUTE_NET', `${grp.netName || grp.netId} pads=${grp.points.length} segments=${segs} layer=${ly}`);
    }
    finishRouteCleanup(doc, 'REROUTE');
    tracePcb('REROUTE_DONE', `nets=${toRoute.length} tracks=${trackCount}`);
    doc.metadata.modifiedAt = new Date().toISOString();
    return { trackCount, netCount: toRoute.length };
}
/**
 * 对未布线网络执行自动 L 型链式布线（跳过已有走线的网络；地网走 B.Cu）
 */
export function autoRoutePcb(doc: PcbDocument, layer: PcbLayerId, schNets?: AccessoryNetHint[]): AutoRouteResult {
    const messages: string[] = [];
    const grid = doc.metadata.gridSize ?? 5;
    const width = doc.metadata.designRules.defaultTrackWidth;
    const acc = ensureBoardAccessories(doc, undefined, schNets);
    if (acc.message.length > 0) {
        messages.push(acc.message);
    }
    // 新建 J1/角孔后清掉相关网旧铜，否则 netAlreadyRouted 会跳过，外接点接不上
    if (acc.addedNew && acc.connectorNetIds.length > 0) {
        const cleared = clearCopperForNets(doc, acc.connectorNetIds);
        if (cleared > 0) {
            tracePcb('AUTO_CLEAR_FOR_J1', `cleared=${cleared} nets=${acc.connectorNetIds.length}`);
        }
    }
    const netPads = collectNetPads(doc);
    let netCount = 0;
    const tracksBefore = doc.tracks.length;
    tracePcb('AUTO_ROUTE_BEGIN', `layer=${layer} netGroups=${netPads.size} grid=${grid} width=${width}`);
    netPads.forEach((grp: NetPadGroup) => {
        const total = netPadTotal(grp);
        if (total < 2) {
            tracePcbWarn('AUTO_SKIP', `${grp.netName || grp.netId} pads=${total} (dev=${grp.points.length},j1=${grp.connectorPoints.length}) — 焊盘不足`);
            return;
        }
        if (netAlreadyRouted(doc, grp.netId)) {
            tracePcb('AUTO_SKIP', `${grp.netName || grp.netId} — 已有走线/过孔`);
            return;
        }
        netCount++;
        const ly = layerForNet(layer, grp.netName);
        const w = widthForNet(width, grp.netName);
        const segs = routeNetGroup(doc, ly, grp, grid, w);
        tracePcb('AUTO_NET', `${grp.netName || grp.netId} pads=${total} (dev=${grp.points.length},j1=${grp.connectorPoints.length}) ` +
            `segments=${segs} layer=${ly} w=${w}`);
    });
    finishRouteCleanup(doc, 'AUTO');
    const trackCount = Math.max(0, doc.tracks.length - tracksBefore);
    if (netCount === 0) {
        messages.push('没有需要自动布线的网络');
    }
    else {
        messages.push(`已自动布线 ${netCount} 个网络，${trackCount} 段`);
    }
    doc.metadata.modifiedAt = new Date().toISOString();
    return { trackCount, netCount, messages };
}
