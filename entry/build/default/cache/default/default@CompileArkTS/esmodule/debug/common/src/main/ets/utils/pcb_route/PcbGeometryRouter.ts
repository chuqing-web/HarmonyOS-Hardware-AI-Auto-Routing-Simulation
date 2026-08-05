import { copperLayersFromStack } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/PcbTypes";
import type { PcbDocument, PcbLayerId, PcbTrack, PcbVia } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/PcbTypes";
import type { Point2D } from '../../types/CommonTypes';
import { policyCoversCopperLayers } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/PcbAiRouteTypes";
import type { PcbGeoFailDetail, PcbGeometryResult, PcbLayerRole, PcbNetPlanEntry, PcbNetPlanResult, PcbRoutePolicy } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/PcbAiRouteTypes";
import { IdUtil } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/IdUtil";
import { padWorldPosition } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbZoneUtil";
import { orderPointsNearestNeighbor } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbTrackBindUtil";
import { createViaAt } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/pcb_route/PcbViaFactory";
import { pathClearBlockReason, trackWidthForNet } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/pcb_route/PcbClearanceOracle";
import { routePowerBuses } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/pcb_route/PowerBusRouter";
import { ensureAllCopperUsed, fillUnusedCopperLayers } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/pcb_route/ensureAllCopperUsed";
import { netCopperConnectsPads } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/pcb_route/PcbLlmGeometryApply";
import { tracePcb, tracePcbWarn } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbTraceLog";
interface BlockReasonBox {
    reason: string;
}
function snap(v: number, grid: number): number {
    if (grid <= 0) {
        return v;
    }
    return Math.round(v / grid) * grid;
}
function dist(a: Point2D, b: Point2D): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}
function findLayerForRole(policy: PcbRoutePolicy, role: PcbLayerRole): PcbLayerId | null {
    const keys = Object.keys(policy.layerRoles);
    for (let i = 0; i < keys.length; i++) {
        if (policy.layerRoles[keys[i]] === role) {
            return keys[i] as PcbLayerId;
        }
    }
    return null;
}
function addSeg(tracks: PcbTrack[], layer: PcbLayerId, a: Point2D, b: Point2D, netId: string, netName: string, width: number): void {
    if (dist(a, b) < 0.5) {
        return;
    }
    tracks.push({
        id: IdUtil.generate('trk'),
        layer,
        start: { x: a.x, y: a.y },
        end: { x: b.x, y: b.y },
        width,
        netId,
        netName
    });
}
interface LayerPair {
    h: PcbLayerId;
    v: PcbLayerId;
    stub: PcbLayerId;
}
interface RouteSeg {
    layer: PcbLayerId;
    p0: Point2D;
    p1: Point2D;
}
interface PadBucket {
    /** 器件功能焊盘（不含 J1 / 安装孔） */
    functional: Point2D[];
    /** 板边连接器焊盘 — 星型抽头，禁止进 NN 长链 */
    connectors: Point2D[];
    /** 安装孔 — 软连通，失败不否决 */
    mounts: Point2D[];
}
function isMountFootprint(defId: string, refDes: string): boolean {
    if (defId === 'FP_MOUNT') {
        return true;
    }
    if (refDes.length >= 2 && refDes.charAt(0) === 'H') {
        const c = refDes.charCodeAt(1);
        return c >= 48 && c <= 57;
    }
    return false;
}
function isConnectorFootprint(defId: string, refDes: string): boolean {
    if (refDes === 'J1') {
        return true;
    }
    return defId.indexOf('FP_PINHDR_') === 0;
}
function resolveSignalLayers(policy: PcbRoutePolicy, copper: PcbLayerId[]): LayerPair | null {
    const h = findLayerForRole(policy, 'signal_h') ??
        findLayerForRole(policy, 'power_h') ??
        findLayerForRole(policy, 'gnd_bus') ??
        findLayerForRole(policy, 'vcc_bus') ??
        findLayerForRole(policy, 'power_v');
    const stub = findLayerForRole(policy, 'stub') ??
        (h ? findAlternateCopperRole(policy, h) : null);
    let v = findLayerForRole(policy, 'signal_v') ?? stub;
    if (!h || !stub || !v) {
        return null;
    }
    // Cu=2 且无独立 signal_v：H/V 同走信号层，stub 仅作焊盘 via 起点。
    // 避免竖线落在 F.Cu 被 SMD 焊盘丛林卡死。
    if (copper.length <= 2 && v === stub && h !== stub) {
        v = h;
    }
    return { h, v, stub };
}
function findAlternateCopperRole(policy: PcbRoutePolicy, excludeLayer: PcbLayerId): PcbLayerId | null {
    const keys = Object.keys(policy.layerRoles);
    for (let i = 0; i < keys.length; i++) {
        if (keys[i] !== (excludeLayer as string)) {
            return keys[i] as PcbLayerId;
        }
    }
    return null;
}
function tryCommitSegs(doc: PcbDocument, policy: PcbRoutePolicy, layers: LayerPair, segs: RouteSeg[], a: Point2D, netId: string, netName: string, width: number, grid: number, obstacleTracks: PcbTrack[], tracks: PcbTrack[], vias: PcbVia[], lastBlock: BlockReasonBox): boolean {
    if (segs.length === 0) {
        return true;
    }
    const startLayer = layers.stub;
    let curLayer = startLayer;
    const viaList = vias;
    if (curLayer !== firstLayer(segs)) {
        const viaPos: Point2D = { x: snap(a.x, grid), y: snap(a.y, grid) };
        viaList.push(createViaAt(doc, policy, viaPos, netId, netName, curLayer, firstLayer(segs), obstacleTracks.concat(tracks), viaList));
        curLayer = firstLayer(segs);
    }
    const pending: RouteSeg[] = [];
    for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (curLayer !== s.layer) {
            const viaPos: Point2D = { x: snap(s.p0.x, grid), y: snap(s.p0.y, grid) };
            viaList.push(createViaAt(doc, policy, viaPos, netId, netName, curLayer, s.layer, obstacleTracks.concat(tracks), viaList));
            curLayer = s.layer;
        }
        const block = pathClearBlockReason(doc, s.layer, s.p0, s.p1, netId, width, obstacleTracks.concat(tracks), viaList);
        if (block !== null) {
            lastBlock.reason = block;
            return false;
        }
        pending.push(s);
    }
    for (let i = 0; i < pending.length; i++) {
        addSeg(tracks, pending[i].layer, pending[i].p0, pending[i].p1, netId, netName, width);
    }
    return true;
}
function firstLayer(segs: RouteSeg[]): PcbLayerId {
    return segs[0].layer;
}
/** 折线点列 → 正交段（非正交边自动拆 L） */
function buildOrthoSegs(pts: Point2D[], hLayer: PcbLayerId, vLayer: PcbLayerId): RouteSeg[] {
    const segs: RouteSeg[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        if (dist(p0, p1) < 0.5) {
            continue;
        }
        const horiz = Math.abs(p0.y - p1.y) < 0.5;
        const vert = Math.abs(p0.x - p1.x) < 0.5;
        if (horiz || vert) {
            segs.push({ layer: horiz ? hLayer : vLayer, p0, p1 });
        }
        else {
            const mid: Point2D = { x: p1.x, y: p0.y };
            if (dist(p0, mid) >= 0.5) {
                segs.push({ layer: hLayer, p0, p1: mid });
            }
            if (dist(mid, p1) >= 0.5) {
                segs.push({ layer: vLayer, p0: mid, p1 });
            }
        }
    }
    return segs;
}
function collectJogOffsets(grid: number, width: number): number[] {
    const base = Math.max(grid, 5);
    const clearPad = Math.max(base * 8, width * 4 + 40);
    const mults = [2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64];
    const out: number[] = [];
    const seen: Set<number> = new Set();
    const push = (v: number): void => {
        const s = snap(v, grid);
        if (s === 0 || seen.has(s) || seen.has(-s)) {
            return;
        }
        seen.add(s);
        out.push(s);
        out.push(-s);
    };
    push(clearPad);
    for (let i = 0; i < mults.length; i++) {
        push(base * mults[i]);
    }
    return out;
}
/**
 * 多策略正交：L / 对侧 L / 大 jog / 双 jog / 先 escape stub
 */
function routePairOrtho(doc: PcbDocument, policy: PcbRoutePolicy, layers: LayerPair, a: Point2D, b: Point2D, netId: string, netName: string, width: number, grid: number, existing: PcbTrack[], tracks: PcbTrack[], vias: PcbVia[], lastBlock: BlockReasonBox): boolean {
    const midH: Point2D = { x: snap(b.x, grid), y: snap(a.y, grid) };
    const midV: Point2D = { x: snap(a.x, grid), y: snap(b.y, grid) };
    const hLayer = layers.h;
    const vLayer = layers.v;
    const viaSnap = vias.length;
    const trackSnap = tracks.length;
    const polylines: Point2D[][] = [
        [a, midH, b],
        [a, midV, b]
    ];
    const jogs = collectJogOffsets(grid, width);
    for (let i = 0; i < jogs.length; i++) {
        const j = jogs[i];
        polylines.push([
            a,
            { x: snap(a.x, grid), y: snap(a.y + j, grid) },
            { x: snap(b.x, grid), y: snap(a.y + j, grid) },
            b
        ]);
        polylines.push([
            a,
            { x: snap(a.x + j, grid), y: snap(a.y, grid) },
            { x: snap(a.x + j, grid), y: snap(b.y, grid) },
            b
        ]);
    }
    // 双 jog / 走廊：先离开焊盘簇，再水平穿越，再落到目标
    const escape = Math.max(grid * 12, width * 5 + 50);
    for (const sign of [1, -1]) {
        const ey = snap(a.y + sign * escape, grid);
        const ey2 = snap(b.y + sign * escape, grid);
        polylines.push([
            a,
            { x: snap(a.x, grid), y: ey },
            { x: snap(b.x, grid), y: ey },
            b
        ]);
        polylines.push([
            a,
            { x: snap(a.x, grid), y: ey },
            { x: snap(b.x, grid), y: ey2 },
            { x: snap(b.x, grid), y: snap(b.y, grid) },
            b
        ]);
        const ex = snap(a.x + sign * escape, grid);
        polylines.push([
            a,
            { x: ex, y: snap(a.y, grid) },
            { x: ex, y: snap(b.y, grid) },
            b
        ]);
    }
    // 板边走廊：沿板框内侧绕行（躲开器件密集区）
    const outline = doc.boardOutline?.points ?? [];
    if (outline.length >= 2) {
        let minX = outline[0].x;
        let maxX = outline[0].x;
        let minY = outline[0].y;
        let maxY = outline[0].y;
        for (let oi = 1; oi < outline.length; oi++) {
            if (outline[oi].x < minX) {
                minX = outline[oi].x;
            }
            if (outline[oi].x > maxX) {
                maxX = outline[oi].x;
            }
            if (outline[oi].y < minY) {
                minY = outline[oi].y;
            }
            if (outline[oi].y > maxY) {
                maxY = outline[oi].y;
            }
        }
        const m = grid * 8;
        const corridors = [
            snap(minY + m, grid), snap(maxY - m, grid),
            snap((minY + maxY) / 2, grid)
        ];
        for (let ci = 0; ci < corridors.length; ci++) {
            const cy = corridors[ci];
            polylines.push([
                a,
                { x: snap(a.x, grid), y: cy },
                { x: snap(b.x, grid), y: cy },
                b
            ]);
        }
        const xCorridors = [snap(minX + m, grid), snap(maxX - m, grid)];
        for (let ci = 0; ci < xCorridors.length; ci++) {
            const cx = xCorridors[ci];
            polylines.push([
                a,
                { x: cx, y: snap(a.y, grid) },
                { x: cx, y: snap(b.y, grid) },
                b
            ]);
        }
        // 板框环形绕行（躲开中部器件/已布铜丛林）
        const left = snap(minX + m, grid);
        const right = snap(maxX - m, grid);
        const top = snap(minY + m, grid);
        const bot = snap(maxY - m, grid);
        polylines.push([
            a, { x: snap(a.x, grid), y: top }, { x: left, y: top },
            { x: left, y: snap(b.y, grid) }, b
        ]);
        polylines.push([
            a, { x: snap(a.x, grid), y: bot }, { x: right, y: bot },
            { x: right, y: snap(b.y, grid) }, b
        ]);
        polylines.push([
            a, { x: snap(a.x, grid), y: bot }, { x: left, y: bot },
            { x: left, y: snap(b.y, grid) }, b
        ]);
        polylines.push([
            a, { x: snap(a.x, grid), y: top }, { x: right, y: top },
            { x: right, y: snap(b.y, grid) }, b
        ]);
    }
    for (let ci = 0; ci < polylines.length; ci++) {
        while (vias.length > viaSnap) {
            vias.pop();
        }
        while (tracks.length > trackSnap) {
            tracks.pop();
        }
        const segs = buildOrthoSegs(polylines[ci], hLayer, vLayer);
        if (tryCommitSegs(doc, policy, layers, segs, a, netId, netName, width, grid, existing, tracks, vias, lastBlock)) {
            return true;
        }
    }
    while (vias.length > viaSnap) {
        vias.pop();
    }
    while (tracks.length > trackSnap) {
        tracks.pop();
    }
    if (lastBlock.reason.length === 0) {
        lastBlock.reason = 'no_path';
    }
    return false;
}
function collectNetPads(doc: PcbDocument, netId: string): PadBucket {
    const functional: Point2D[] = [];
    const connectors: Point2D[] = [];
    const mounts: Point2D[] = [];
    for (const fp of doc.footprints) {
        const mount = isMountFootprint(fp.defId, fp.refDes);
        const connector = isConnectorFootprint(fp.defId, fp.refDes);
        for (const pad of fp.pads) {
            if ((pad.netId ?? '') === netId) {
                const w = padWorldPosition(fp, pad);
                if (mount) {
                    mounts.push(w);
                }
                else if (connector) {
                    connectors.push(w);
                }
                else {
                    functional.push(w);
                }
            }
        }
    }
    return { functional, connectors, mounts };
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
function parseHintRole(hint: string | undefined): PcbLayerRole | null {
    if (!hint || hint.length === 0) {
        return null;
    }
    const u = hint.toLowerCase().trim();
    if (u === 'signal_h' || u === 'signal_v' || u === 'stub' || u === 'power_h' ||
        u === 'power_v' || u === 'gnd_bus' || u === 'vcc_bus') {
        return u as PcbLayerRole;
    }
    return null;
}
function effectiveNetPriority(ne: PcbNetPlanEntry, policy: PcbRoutePolicy): number {
    const np = policy.netPriority;
    if (np) {
        if (np[ne.netId] !== undefined && !isNaN(np[ne.netId])) {
            return np[ne.netId];
        }
        if (np[ne.netName] !== undefined && !isNaN(np[ne.netName])) {
            return np[ne.netName];
        }
    }
    return ne.priority;
}
function sortNetsByPriority(nets: PcbNetPlanEntry[], policy: PcbRoutePolicy): PcbNetPlanEntry[] {
    const copy = nets.slice();
    copy.sort((a, b) => effectiveNetPriority(b, policy) - effectiveNetPriority(a, policy));
    return copy;
}
function layersForNet(policy: PcbRoutePolicy, ne: PcbNetPlanEntry, fallback: LayerPair): LayerPair {
    const hint = parseHintRole(ne.layerHint);
    if (!hint) {
        return fallback;
    }
    const hinted = findLayerForRole(policy, hint);
    if (!hinted) {
        return fallback;
    }
    if (hint === 'signal_h' || hint === 'power_h' || hint === 'gnd_bus' || hint === 'vcc_bus') {
        return { h: hinted, v: fallback.v, stub: fallback.stub };
    }
    if (hint === 'signal_v' || hint === 'power_v') {
        return { h: fallback.h, v: hinted, stub: fallback.stub };
    }
    if (hint === 'stub') {
        return { h: fallback.h, v: fallback.v, stub: hinted };
    }
    return fallback;
}
function rollbackTo(tracks: PcbTrack[], vias: PcbVia[], trackSnap: number, viaSnap: number): void {
    while (tracks.length > trackSnap) {
        tracks.pop();
    }
    while (vias.length > viaSnap) {
        vias.pop();
    }
}
export function runPcbGeometryRoute(doc: PcbDocument, policy: PcbRoutePolicy, netPlan: PcbNetPlanResult): PcbGeometryResult {
    const empty: PcbGeometryResult = {
        ok: false, tracks: [], vias: [], routedNetIds: [], failedNetIds: [],
        missingCopperLayers: [], reason: '', failDetails: []
    };
    if (!policy.fromLlm) {
        empty.reason = 'route policy not from LLM';
        return empty;
    }
    if (!netPlan.fromLlm) {
        empty.reason = 'net plan not from LLM';
        return empty;
    }
    const copper = copperLayersFromStack(doc.layerStack);
    const missingRoles = policyCoversCopperLayers(policy, copper);
    if (missingRoles.length > 0) {
        empty.reason = `LLM layerRoles missing copper: ${missingRoles.join(',')}`;
        return empty;
    }
    const grid = doc.metadata.gridSize ?? 5;
    const tracks: PcbTrack[] = [];
    const vias: PcbVia[] = [];
    const routed: string[] = [];
    const failed: string[] = [];
    const failDetails: PcbGeoFailDetail[] = [];
    const power = routePowerBuses(doc, policy, sortNetsByPriority(netPlan.nets, policy));
    if (!power.ok) {
        empty.reason = power.reason;
        return empty;
    }
    for (let i = 0; i < power.tracks.length; i++) {
        tracks.push(power.tracks[i]);
    }
    for (let i = 0; i < power.vias.length; i++) {
        vias.push(power.vias[i]);
    }
    const powerSkipped = new Set(power.skippedNetIds ?? []);
    for (let i = 0; i < netPlan.nets.length; i++) {
        const ne = netPlan.nets[i];
        if ((ne.kind === 'gnd' || ne.kind === 'power') && ne.routeMode !== 'defer' &&
            !powerSkipped.has(ne.netId)) {
            routed.push(ne.netId);
        }
    }
    if (power.reason !== 'ok' && power.reason.length > 0) {
        tracePcbWarn('AI_GEO_POWER_SOFT', power.reason);
    }
    let needSigLayers = powerSkipped.size > 0;
    for (let i = 0; i < netPlan.nets.length; i++) {
        const ne = netPlan.nets[i];
        if (ne.kind !== 'gnd' && ne.kind !== 'power' && ne.routeMode !== 'defer') {
            needSigLayers = true;
            break;
        }
    }
    if (needSigLayers) {
        const sigLayers = resolveSignalLayers(policy, copper);
        if (!sigLayers) {
            empty.reason = 'LLM policy missing signal_h/stub roles for signal routing';
            return empty;
        }
        const order: PcbNetPlanEntry[] = [];
        const byId: Map<string, PcbNetPlanEntry> = new Map();
        const byName: Map<string, PcbNetPlanEntry> = new Map();
        for (let i = 0; i < netPlan.nets.length; i++) {
            byId.set(netPlan.nets[i].netId, netPlan.nets[i]);
            byName.set(netPlan.nets[i].netName, netPlan.nets[i]);
        }
        for (let i = 0; i < netPlan.priorityOrder.length; i++) {
            const key = netPlan.priorityOrder[i];
            const e = byId.get(key) ?? byName.get(key);
            if (e && order.indexOf(e) < 0) {
                order.push(e);
            }
        }
        for (let i = 0; i < netPlan.nets.length; i++) {
            if (order.indexOf(netPlan.nets[i]) < 0) {
                order.push(netPlan.nets[i]);
            }
        }
        // 几何阶段：短网优先（避免 GND 长干线先占走廊），优先级作次级键
        const routeJobs: PcbNetPlanEntry[] = [];
        for (let i = 0; i < order.length; i++) {
            const ne = order[i];
            if (ne.routeMode === 'defer') {
                continue;
            }
            const isPowerSkip = (ne.kind === 'gnd' || ne.kind === 'power') && powerSkipped.has(ne.netId);
            const isSignal = ne.kind !== 'gnd' && ne.kind !== 'power';
            if (!isPowerSkip && !isSignal) {
                continue;
            }
            if (isSignal && ne.routeMode !== 'forceTrack' && ne.routeMode !== 'forcePour') {
                continue;
            }
            routeJobs.push(ne);
        }
        routeJobs.sort((a, b) => {
            const ba = collectNetPads(doc, a.netId);
            const bb = collectNetPads(doc, b.netId);
            const ca = Math.max(ba.functional.length, 1) + (ba.functional.length < 2 ? ba.connectors.length : 0);
            const cb = Math.max(bb.functional.length, 1) + (bb.functional.length < 2 ? bb.connectors.length : 0);
            if (ca !== cb) {
                return ca - cb;
            }
            // signal → power → gnd，减少地线抢走廊
            const rank = (k: string): number => k === 'signal' ? 0 : (k === 'power' ? 1 : 2);
            const ra = rank(a.kind);
            const rb = rank(b.kind);
            if (ra !== rb) {
                return ra - rb;
            }
            return effectiveNetPriority(b, policy) - effectiveNetPriority(a, policy);
        });
        interface PendingConn {
            ne: PcbNetPlanEntry;
            hubs: Point2D[];
            connectors: Point2D[];
            mounts: Point2D[];
            layers: LayerPair;
            width: number;
            isPowerSkip: boolean;
        }
        const pendingConns: PendingConn[] = [];
        // Pass1：只布器件核心链（稀网才把连接器并入核心）
        for (let i = 0; i < routeJobs.length; i++) {
            const ne = routeJobs[i];
            const isPowerSkip = (ne.kind === 'gnd' || ne.kind === 'power') && powerSkipped.has(ne.netId);
            const bucket = collectNetPads(doc, ne.netId);
            let core = bucket.functional;
            let connectorsDeferred = true;
            if (core.length < 2 && bucket.functional.length + bucket.connectors.length >= 2) {
                core = bucket.functional.concat(bucket.connectors);
                connectorsDeferred = false;
            }
            if (core.length < 2) {
                continue;
            }
            const width = trackWidthForNet(doc, ne.netId);
            const netLayers = layersForNet(policy, ne, sigLayers);
            const netTrackSnap = tracks.length;
            const netViaSnap = vias.length;
            let okNet = true;
            let failFrom: Point2D = core[0];
            let failTo: Point2D = core.length > 1 ? core[1] : core[0];
            const lastBlock: BlockReasonBox = { reason: '' };
            const softPower = ne.kind === 'gnd' || ne.kind === 'power';
            if (softPower && core.length >= 3) {
                // 电源/地：从中心焊盘生长连通分量；失败臂改从其它已连通点重试
                let hub = core[0];
                let hubScore = -1;
                for (let hi = 0; hi < core.length; hi++) {
                    let score = 0;
                    for (let oj = 0; oj < core.length; oj++) {
                        if (oj === hi) {
                            continue;
                        }
                        score += 1 / (1 + dist(core[hi], core[oj]));
                    }
                    if (score > hubScore) {
                        hubScore = score;
                        hub = core[hi];
                    }
                }
                const connected: Point2D[] = [hub];
                const pendingPads: Point2D[] = [];
                for (let j = 0; j < core.length; j++) {
                    if (dist(core[j], hub) >= 0.5) {
                        pendingPads.push(core[j]);
                    }
                }
                let progress = true;
                while (pendingPads.length > 0 && progress) {
                    progress = false;
                    for (let pi = pendingPads.length - 1; pi >= 0; pi--) {
                        const target = pendingPads[pi];
                        let linked = false;
                        // 按到 target 的距离尝试已连通点
                        const hubOrder: number[] = [];
                        for (let hi = 0; hi < connected.length; hi++) {
                            hubOrder.push(hi);
                        }
                        for (let ai = 0; ai < hubOrder.length; ai++) {
                            for (let bi = ai + 1; bi < hubOrder.length; bi++) {
                                if (dist(connected[hubOrder[bi]], target) < dist(connected[hubOrder[ai]], target)) {
                                    const tmp = hubOrder[ai];
                                    hubOrder[ai] = hubOrder[bi];
                                    hubOrder[bi] = tmp;
                                }
                            }
                        }
                        for (let hi = 0; hi < hubOrder.length; hi++) {
                            const from = connected[hubOrder[hi]];
                            lastBlock.reason = '';
                            if (routePairOrtho(doc, policy, netLayers, from, target, ne.netId, ne.netName, width, grid, tracks, tracks, vias, lastBlock)) {
                                connected.push(target);
                                pendingPads.splice(pi, 1);
                                linked = true;
                                progress = true;
                                break;
                            }
                        }
                        if (!linked && connected.length > 0) {
                            failFrom = connected[0];
                            failTo = target;
                        }
                    }
                }
                for (let pi = 0; pi < pendingPads.length; pi++) {
                    tracePcbWarn('AI_GEO_ARM_SOFT', `${ne.netName} pad unreachable` +
                        ` @(${Math.round(pendingPads[pi].x)},${Math.round(pendingPads[pi].y)})` +
                        ` | ${lastBlock.reason}`);
                }
                if (connected.length < 2) {
                    okNet = false;
                }
                else if (pendingPads.length > 0) {
                    tracePcbWarn('AI_GEO_PARTIAL', `${ne.netName} connected=${connected.length}/${core.length}`);
                }
            }
            else {
                const ordered = orderPointsNearestNeighbor(core);
                failFrom = ordered[0];
                failTo = ordered[1];
                for (let j = 0; j < ordered.length - 1; j++) {
                    lastBlock.reason = '';
                    const ok = routePairOrtho(doc, policy, netLayers, ordered[j], ordered[j + 1], ne.netId, ne.netName, width, grid, tracks, tracks, vias, lastBlock);
                    if (!ok) {
                        if (softPower) {
                            // 短电源链：失败臂软跳过，保留已布段
                            failFrom = ordered[j];
                            failTo = ordered[j + 1];
                            tracePcbWarn('AI_GEO_ARM_SOFT', `${ne.netName} chain arm skip | ${lastBlock.reason}`);
                            continue;
                        }
                        okNet = false;
                        failFrom = ordered[j];
                        failTo = ordered[j + 1];
                        break;
                    }
                }
                // softPower 短链：至少有一段铜才算成功
                if (softPower && okNet && tracks.length === netTrackSnap) {
                    okNet = false;
                }
            }
            if (!okNet) {
                rollbackTo(tracks, vias, netTrackSnap, netViaSnap);
                failed.push(ne.netId);
                failDetails.push({
                    netId: ne.netId, netName: ne.netName,
                    from: { x: failFrom.x, y: failFrom.y },
                    to: { x: failTo.x, y: failTo.y },
                    cause: lastBlock.reason.indexOf('pad_block') === 0 ? 'pad_block' :
                        (lastBlock.reason.indexOf('track_block') === 0 ? 'track_block' :
                            (lastBlock.reason.indexOf('via_block') === 0 ? 'via_block' : 'no_path')),
                    blocker: lastBlock.reason
                });
                tracePcbWarn('AI_GEO_FAIL', `${ne.netName} clearance/path fail` +
                    ` pair=(${Math.round(failFrom.x)},${Math.round(failFrom.y)})→` +
                    `(${Math.round(failTo.x)},${Math.round(failTo.y)})` +
                    ` | ${lastBlock.reason}`);
                continue;
            }
            const hubs: Point2D[] = bucket.functional.length > 0 ? bucket.functional : core;
            if (connectorsDeferred && bucket.connectors.length > 0) {
                pendingConns.push({
                    ne, hubs, connectors: bucket.connectors, mounts: bucket.mounts,
                    layers: netLayers, width, isPowerSkip
                });
            }
            else {
                // 安装孔软连通
                if (bucket.mounts.length > 0 && hubs.length > 0) {
                    let mountOk = 0;
                    for (let mi = 0; mi < bucket.mounts.length; mi++) {
                        const m = bucket.mounts[mi];
                        const tgt = nearestPoint(m, hubs);
                        if (!tgt) {
                            continue;
                        }
                        lastBlock.reason = '';
                        if (routePairOrtho(doc, policy, netLayers, m, tgt, ne.netId, ne.netName, width, grid, tracks, tracks, vias, lastBlock)) {
                            mountOk++;
                        }
                        else {
                            tracePcbWarn('AI_GEO_MOUNT_SOFT', `${ne.netName} mount@${Math.round(m.x)},${Math.round(m.y)} skip: ${lastBlock.reason}`);
                        }
                    }
                    tracePcb('AI_GEO_MOUNT', `${ne.netName} mounts ${mountOk}/${bucket.mounts.length}`);
                }
                routed.push(ne.netId);
                tracePcb('AI_GEO_NET', `${ne.netName}${isPowerSkip ? '(power→signal)' : ''} ok core=${core.length}` +
                    ` conn=inline mounts=${bucket.mounts.length}`);
            }
        }
        // Pass2：全部核心布完后再抽连接器，避免 GND→J1 长线堵死电源走廊
        for (let pi = 0; pi < pendingConns.length; pi++) {
            const pc = pendingConns[pi];
            const ne = pc.ne;
            if (failed.indexOf(ne.netId) >= 0) {
                continue;
            }
            const netTrackSnap = tracks.length;
            const netViaSnap = vias.length;
            let okNet = true;
            let failFrom: Point2D = pc.hubs[0];
            let failTo: Point2D = pc.connectors[0];
            const lastBlock: BlockReasonBox = { reason: '' };
            for (let ci = 0; ci < pc.connectors.length; ci++) {
                const c = pc.connectors[ci];
                const hub = nearestPoint(c, pc.hubs);
                if (!hub) {
                    continue;
                }
                lastBlock.reason = '';
                if (!routePairOrtho(doc, policy, pc.layers, hub, c, ne.netId, ne.netName, pc.width, grid, tracks, tracks, vias, lastBlock)) {
                    // 连接器抽头失败：地/电源软跳过（核心已连通）；信号硬失败回滚抽头
                    if (ne.kind === 'gnd' || ne.kind === 'power') {
                        tracePcbWarn('AI_GEO_CONN_SOFT', `${ne.netName} connector@${Math.round(c.x)},${Math.round(c.y)} skip: ${lastBlock.reason}`);
                    }
                    else {
                        okNet = false;
                        failFrom = hub;
                        failTo = c;
                        break;
                    }
                }
            }
            if (!okNet) {
                rollbackTo(tracks, vias, netTrackSnap, netViaSnap);
                failed.push(ne.netId);
                failDetails.push({
                    netId: ne.netId, netName: ne.netName,
                    from: { x: failFrom.x, y: failFrom.y },
                    to: { x: failTo.x, y: failTo.y },
                    cause: lastBlock.reason.indexOf('pad_block') === 0 ? 'pad_block' :
                        (lastBlock.reason.indexOf('track_block') === 0 ? 'track_block' : 'no_path'),
                    blocker: lastBlock.reason
                });
                tracePcbWarn('AI_GEO_FAIL', `${ne.netName} connector tap fail | ${lastBlock.reason}`);
                // 核心铜已在 pass1 提交且未进 pending 的 rollback 范围外——需撕掉该网全部铜
                const keepT: PcbTrack[] = [];
                for (let ti = 0; ti < tracks.length; ti++) {
                    if (tracks[ti].netId !== ne.netId) {
                        keepT.push(tracks[ti]);
                    }
                }
                tracks.length = 0;
                for (let ti = 0; ti < keepT.length; ti++) {
                    tracks.push(keepT[ti]);
                }
                const keepV: PcbVia[] = [];
                for (let vi = 0; vi < vias.length; vi++) {
                    if (vias[vi].netId !== ne.netId) {
                        keepV.push(vias[vi]);
                    }
                }
                vias.length = 0;
                for (let vi = 0; vi < keepV.length; vi++) {
                    vias.push(keepV[vi]);
                }
                continue;
            }
            if (pc.mounts.length > 0 && pc.hubs.length > 0) {
                let mountOk = 0;
                for (let mi = 0; mi < pc.mounts.length; mi++) {
                    const m = pc.mounts[mi];
                    const tgt = nearestPoint(m, pc.hubs);
                    if (!tgt) {
                        continue;
                    }
                    lastBlock.reason = '';
                    if (routePairOrtho(doc, policy, pc.layers, m, tgt, ne.netId, ne.netName, pc.width, grid, tracks, tracks, vias, lastBlock)) {
                        mountOk++;
                    }
                    else {
                        tracePcbWarn('AI_GEO_MOUNT_SOFT', `${ne.netName} mount@${Math.round(m.x)},${Math.round(m.y)} skip: ${lastBlock.reason}`);
                    }
                }
                tracePcb('AI_GEO_MOUNT', `${ne.netName} mounts ${mountOk}/${pc.mounts.length}`);
            }
            if (routed.indexOf(ne.netId) < 0) {
                routed.push(ne.netId);
            }
            tracePcb('AI_GEO_NET', `${ne.netName}${pc.isPowerSkip ? '(power→signal)' : ''} ok +conn=${pc.connectors.length}`);
        }
        // 连通性复核：本地路由也不放行「有铜但焊盘未连成一块」的网，
        // 否则 QA 会发现断开网再空转一轮修复；此处直接撕铜判失败。
        const verifiedRouted: string[] = [];
        for (let i = 0; i < routed.length; i++) {
            const netId = routed[i];
            let ne: PcbNetPlanEntry | null = null;
            for (let ni = 0; ni < netPlan.nets.length; ni++) {
                if (netPlan.nets[ni].netId === netId) {
                    ne = netPlan.nets[ni];
                    break;
                }
            }
            if (!ne || ne.routeMode === 'defer') {
                verifiedRouted.push(netId);
                continue;
            }
            const bucket = collectNetPads(doc, netId);
            const core = bucket.functional.length >= 2
                ? bucket.functional
                : bucket.functional.concat(bucket.connectors);
            if (core.length < 2) {
                verifiedRouted.push(netId);
                continue;
            }
            if (netCopperConnectsPads(doc, netId, tracks, vias)) {
                verifiedRouted.push(netId);
                continue;
            }
            const keepT: PcbTrack[] = [];
            for (let ti = 0; ti < tracks.length; ti++) {
                if (tracks[ti].netId !== netId) {
                    keepT.push(tracks[ti]);
                }
            }
            tracks.length = 0;
            for (let ti = 0; ti < keepT.length; ti++) {
                tracks.push(keepT[ti]);
            }
            const keepV: PcbVia[] = [];
            for (let vi = 0; vi < vias.length; vi++) {
                if (vias[vi].netId !== netId) {
                    keepV.push(vias[vi]);
                }
            }
            vias.length = 0;
            for (let vi = 0; vi < keepV.length; vi++) {
                vias.push(keepV[vi]);
            }
            if (failed.indexOf(netId) < 0) {
                failed.push(netId);
            }
            failDetails.push({
                netId, netName: ne.netName,
                from: { x: core[0].x, y: core[0].y },
                to: core.length > 1 ? { x: core[1].x, y: core[1].y } : { x: core[0].x, y: core[0].y },
                cause: 'no_path',
                blocker: 'local copper not connected — pads orphaned'
            });
            tracePcbWarn('AI_GEO_CONN_FAIL', `${ne.netName} local copper not connected — ripped`);
        }
        routed.length = 0;
        for (let i = 0; i < verifiedRouted.length; i++) {
            routed.push(verifiedRouted[i]);
        }
    }
    let missingCopper = ensureAllCopperUsed(doc, tracks);
    if (missingCopper.length > 0) {
        fillUnusedCopperLayers(doc, policy, netPlan, tracks, vias, routed, missingCopper);
        missingCopper = ensureAllCopperUsed(doc, tracks);
    }
    if (failed.length > 0) {
        return {
            ok: false, tracks, vias, routedNetIds: routed, failedNetIds: failed,
            missingCopperLayers: missingCopper,
            reason: `signal nets failed: ${failed.length}`,
            failDetails
        };
    }
    if (missingCopper.length > 0) {
        return {
            ok: false, tracks, vias, routedNetIds: routed, failedNetIds: failed,
            missingCopperLayers: missingCopper,
            reason: `copper layers unused: ${missingCopper.join(',')}`,
            failDetails
        };
    }
    return {
        ok: true, tracks, vias, routedNetIds: routed, failedNetIds: [],
        missingCopperLayers: [], reason: 'ok', failDetails: []
    };
}
/** 供测试 / 外部诊断复用 */
export function diagnosePathClear(doc: PcbDocument, layer: PcbLayerId, a: Point2D, b: Point2D, netId: string, width: number, existing: PcbTrack[], existingVias?: PcbVia[]): string | null {
    return pathClearBlockReason(doc, layer, a, b, netId, width, existing, existingVias);
}
