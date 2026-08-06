import { WireAutoRouter, DeviceHitGeometry, WIRE_OBSTACLE_PAD, IdUtil, makeRouteLine, Logger, INSTR_TRACE_TAG, traceAiWireDraw, traceAiWireFix, traceAiWireInventory, WarRouteOrder, MainThreadYield, WireConflictGeometry } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchTopology, RouteLine, Point2D, DeviceInst, NetInfo, Pin, NetLabelInfo, ErcError, WarRouteContext, WarCompObstacle, WirePathPreviewResult, WorldHitRect, WarOrderPin, NetLabelAnchorInfo } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { IComponentLibrary } from 'component_library';
import { PinWorldResolver } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/PinWorldResolver";
export interface WarRouteAdapterResult {
    ok: boolean;
    routedNets: number;
    failedNets: string[];
    /** WAR 几何失败后改标号 stub 的网名（仍算交付成功） */
    demotedNets: string[];
    reason: string;
}
interface WarPinWorld {
    devUuid: string;
    pinId: string;
    refName: string;
    pt: Point2D;
}
export class WarRouteAdapter {
    private library: IComponentLibrary | null = null;
    setComponentLibrary(lib: IComponentLibrary): void {
        this.library = lib;
    }
    /**
     * 仅保留真正短 stub；其余（含超长 2 点直穿线）清掉供 WAR 重布。
     * 旧逻辑 pts≤3 全留 → (90,290)-(2180,290) 被当成 stub，WAR_SKIP 后仍压脚。
     */
    static stripNonStubWires(wires: RouteLine[]): RouteLine[] {
        const out: RouteLine[] = [];
        const dropped: string[] = [];
        for (let i = 0; i < wires.length; i++) {
            const w = wires[i];
            if (!w.points || w.points.length < 2) {
                out.push(w);
                continue;
            }
            if (WireConflictGeometry.isShortStub(w)) {
                out.push(w);
                continue;
            }
            const span = WireConflictGeometry.pathLength(w.points);
            dropped.push(`wireId=${w.uuid ?? '?'} pts=${w.points.length} len=${Math.round(span)} ` +
                `net=${w.netUuid.substring(0, 12)}`);
        }
        if (dropped.length > 0) {
            Logger.info(INSTR_TRACE_TAG, `[AI_WIRE] STRIP_NON_STUB kept=${out.length} dropped=${dropped.length}`);
            for (let i = 0; i < Math.min(dropped.length, 24); i++) {
                traceAiWireFix('DROP', `strip_non_stub ${dropped[i]} why=war_prep`);
            }
        }
        return out;
    }
    /**
     * 对 nodeList≥2 且尚无完整导线的网，用 WAR 链式连线。
     * 局部短网优先；链序失败时换近邻/反转再试。
     * 几何仍失败 → 该网降级为 joinByLabel stub（用户允许），不整单 abort。
     * 【硬】async + 段间让出：模拟器上同步 A星寻路与逃逸重试可触发 THREAD_BLOCK。
     */
    async routeTopology(topo: SchTopology, warEnabled: boolean = true, isCancel?: () => boolean): Promise<WarRouteAdapterResult> {
        if (!this.library) {
            Logger.error(INSTR_TRACE_TAG, '[AI_AGENT] WAR library not set');
            return {
                ok: false, routedNets: 0, failedNets: [], demotedNets: [],
                reason: 'WAR library not injected'
            };
        }
        const failed: string[] = [];
        const demoted: string[] = [];
        let routed = 0;
        let drawnSegs = 0;
        const grid = topo.gridStep > 0 ? topo.gridStep : 10;
        const wiresBefore = topo.wireList.length;
        Logger.info(INSTR_TRACE_TAG, `[AI_WIRE] WAR_BEGIN nets=${topo.netList.length} wires=${wiresBefore}`);
        // 预计算可布网及其局部跨度，短网优先（避免 TRIANGLE 长线堵死 HYS）
        const workIdx: number[] = [];
        const maxEdge: number[] = [];
        for (let ni = 0; ni < topo.netList.length; ni++) {
            const net = topo.netList[ni];
            if (!net.nodeList || net.nodeList.length < 2) {
                continue;
            }
            const pinsAll = this.resolveNetPinWorlds(topo, net);
            if (pinsAll.length < 2) {
                failed.push(net.netName || net.netUuid);
                Logger.warn(INSTR_TRACE_TAG, `[AI_AGENT] WAR skip net=${net.netName} pins=${pinsAll.length} (missing pin/dev)`);
                continue;
            }
            if (this.netDutPinsAlreadyLinked(topo, net, pinsAll)) {
                Logger.info(INSTR_TRACE_TAG, `[AI_WIRE] WAR_SKIP net=${net.netName} why=already_has_wire`);
                continue;
            }
            const pins = this.filterDutPinsForWar(topo, net, pinsAll);
            if (pins.length < 2) {
                Logger.info(INSTR_TRACE_TAG, `[AI_WIRE] WAR_SKIP net=${net.netName} why=dut_pins<2 (instr stubs only)`);
                continue;
            }
            const orderPins: WarOrderPin[] = pins.map(p => {
                const item: WarOrderPin = {
                    key: `${p.refName}.${p.pinId}`,
                    pt: p.pt
                };
                return item;
            });
            workIdx.push(ni);
            maxEdge.push(WarRouteOrder.maxNnEdgeLength(orderPins));
        }
        const sortedWork = WarRouteOrder.sortNetIndicesByLocality(maxEdge);
        if (sortedWork.length > 1) {
            const orderNames: string[] = [];
            for (let si = 0; si < sortedWork.length; si++) {
                const net = topo.netList[workIdx[sortedWork[si]]];
                orderNames.push(`${net.netName}:${Math.round(maxEdge[sortedWork[si]])}`);
            }
            Logger.info(INSTR_TRACE_TAG, `[AI_WIRE] WAR_ORDER localFirst=[${orderNames.slice(0, 10).join(',')}]`);
        }
        for (let si = 0; si < sortedWork.length; si++) {
            if (isCancel && isCancel()) {
                return {
                    ok: false, routedNets: routed, failedNets: failed, demotedNets: demoted,
                    reason: 'cancelled'
                };
            }
            const net = topo.netList[workIdx[sortedWork[si]]];
            const pinsAll = this.resolveNetPinWorlds(topo, net);
            const pins = this.filterDutPinsForWar(topo, net, pinsAll);
            const orderPins: WarOrderPin[] = pins.map(p => {
                const item: WarOrderPin = {
                    key: `${p.refName}.${p.pinId}`,
                    pt: p.pt
                };
                return item;
            });
            const variants = WarRouteOrder.chainOrderVariants(orderPins);
            const wireStart = topo.wireList.length;
            let netOk = false;
            let usedChain = '';
            for (let vi = 0; vi < variants.length; vi++) {
                // 回滚本网上一链序失败留下的导线
                topo.wireList = topo.wireList.slice(0, wireStart);
                const variant = variants[vi];
                const chainPins: WarPinWorld[] = [];
                for (let k = 0; k < variant.length; k++) {
                    const key = variant[k].key;
                    let found: WarPinWorld | null = null;
                    for (let pi = 0; pi < pins.length; pi++) {
                        if (`${pins[pi].refName}.${pins[pi].pinId}` === key) {
                            found = pins[pi];
                            break;
                        }
                    }
                    if (found !== null) {
                        const pinWorld: WarPinWorld = found;
                        chainPins.push(pinWorld);
                    }
                }
                if (chainPins.length < 2) {
                    continue;
                }
                const chain = chainPins.map(p => `${p.refName}.${p.pinId}`).join('→');
                Logger.info(INSTR_TRACE_TAG, `[AI_WIRE] WAR_NET net=${net.netName} chain=${chain} variant=${vi}`);
                let variantOk = true;
                for (let i = 0; i < chainPins.length - 1; i++) {
                    if (isCancel && isCancel()) {
                        return {
                            ok: false, routedNets: routed, failedNets: failed, demotedNets: demoted,
                            reason: 'cancelled'
                        };
                    }
                    const a = chainPins[i];
                    const b = chainPins[i + 1];
                    const preview = await this.routePinPair(topo, grid, warEnabled, a, b);
                    // 段间让出：单段 A*+逃逸在模拟器可耗数秒，避免 THREAD_BLOCK
                    await MainThreadYield.yield();
                    if (preview.blocked || !preview.points || preview.points.length < 2) {
                        variantOk = false;
                        Logger.warn(INSTR_TRACE_TAG, `[AI_AGENT] route via WAR FAIL net=${net.netName} ` +
                            `${a.refName}.${a.pinId}->${b.refName}.${b.pinId} variant=${vi}`);
                        traceAiWireFix('DROP', `war_fail_rollback net=${net.netName} ` +
                            `${a.refName}.${a.pinId}→${b.refName}.${b.pinId} why=blocked`);
                        break;
                    }
                    const wid = IdUtil.generate('w');
                    const line: RouteLine = makeRouteLine(net.netUuid, preview.points, false, wid);
                    topo.wireList.push(line);
                    const pa = preview.points[0];
                    const pb = preview.points[preview.points.length - 1];
                    traceAiWireDraw('war', `net=${net.netName} ${a.refName}.${a.pinId}→${b.refName}.${b.pinId}` +
                        ` wireId=${wid} pts=${preview.points.length}` +
                        ` ends=(${Math.round(pa.x)},${Math.round(pa.y)})→` +
                        `(${Math.round(pb.x)},${Math.round(pb.y)})`);
                }
                if (variantOk) {
                    netOk = true;
                    usedChain = chain;
                    drawnSegs += chainPins.length - 1;
                    break;
                }
                await MainThreadYield.yield();
            }
            // T-star 回退：3脚网链式全失败时，以三脚质心为虚拟汇接点星形布线
            if (!netOk && pins.length === 3) {
                topo.wireList = topo.wireList.slice(0, wireStart);
                const cx = Math.round((pins[0].pt.x + pins[1].pt.x + pins[2].pt.x) / 3 / grid) * grid;
                const cy = Math.round((pins[0].pt.y + pins[1].pt.y + pins[2].pt.y) / 3 / grid) * grid;
                const junction: Point2D = { x: cx, y: cy };
                Logger.info(INSTR_TRACE_TAG, `[AI_WIRE] WAR_STAR net=${net.netName} junction=(${cx},${cy})` +
                    ` pins=[${pins.map(p => `${p.refName}.${p.pinId}`).join(',')}]`);
                let starOk = true;
                for (let pi = 0; pi < pins.length; pi++) {
                    if (isCancel && isCancel()) {
                        return {
                            ok: false, routedNets: routed, failedNets: failed, demotedNets: demoted,
                            reason: 'cancelled'
                        };
                    }
                    const a = pins[pi];
                    const b: WarPinWorld = {
                        devUuid: '', pinId: 'junction', refName: 'J',
                        pt: junction
                    };
                    const preview = await this.routePinPair(topo, grid, warEnabled, a, b);
                    await MainThreadYield.yield();
                    if (preview.blocked || !preview.points || preview.points.length < 2) {
                        starOk = false;
                        Logger.warn(INSTR_TRACE_TAG, `[AI_WIRE] WAR_STAR_FAIL net=${net.netName} ` +
                            `${a.refName}.${a.pinId}→junction blocked`);
                        traceAiWireFix('DROP', `war_star_fail net=${net.netName} ${a.refName}.${a.pinId}→J why=blocked`);
                        break;
                    }
                    const wid = IdUtil.generate('w');
                    const line: RouteLine = makeRouteLine(net.netUuid, preview.points, false, wid);
                    topo.wireList.push(line);
                    traceAiWireDraw('war_star', `net=${net.netName} ${a.refName}.${a.pinId}→J wireId=${wid}` +
                        ` pts=${preview.points.length}`);
                }
                if (starOk) {
                    netOk = true;
                    usedChain = `star@(${cx},${cy})`;
                    drawnSegs += 3;
                    Logger.info(INSTR_TRACE_TAG, `[AI_AGENT] route via WAR star net=${net.netName} junction=(${cx},${cy})`);
                }
                else {
                    topo.wireList = topo.wireList.slice(0, wireStart);
                }
            }
            if (!netOk) {
                topo.wireList = topo.wireList.slice(0, wireStart);
                // 用户允许：WAR 硬失败 → 网络标号 stub，保持同名并网
                const stubN = this.demoteNetToLabelStubs(topo, net, pinsAll);
                if (stubN > 0) {
                    demoted.push(net.netName || net.netUuid);
                    Logger.warn(INSTR_TRACE_TAG, `[AI_WIRE] WAR_DEMOTE_LABEL net=${net.netName} stubs=${stubN}` +
                        ` (geometry blocked → joinByLabel)`);
                    // 可见 ERC 警告（软性，不挡质量门禁）：禁止静默 demote
                    if (topo.ercErrorList === undefined) {
                        topo.ercErrorList = [];
                    }
                    const demoteErr: ErcError = {
                        errType: 'WAR_DEMOTE_LABEL',
                        targetUuid: net.netUuid,
                        desc: `网络 "${net.netName || net.netUuid}" WAR 几何失败，已降级为网络标号 stub`,
                        suggest: '增大器件间距或计划阶段改用 joinByLabel，避免长线穿障',
                        severity: 'warning'
                    };
                    topo.ercErrorList.push(demoteErr);
                }
                else {
                    failed.push(net.netName || net.netUuid);
                    Logger.warn(INSTR_TRACE_TAG, `[AI_WIRE] WAR_ROLLBACK net=${net.netName} segs=0 demoteFail=true`);
                }
            }
            else {
                routed++;
                Logger.info(INSTR_TRACE_TAG, `[AI_AGENT] route via WAR net=${net.netName} pins=${pins.length} chain=${usedChain}`);
            }
        }
        const netNameOf = (uuid: string): string => {
            const n = topo.netList.find(x => x.netUuid === uuid);
            return n?.netName ?? uuid.substring(0, 10);
        };
        traceAiWireInventory('war_end', topo.wireList, netNameOf, 48);
        // AI：标号锚点吸附到同网/近邻导线端点，配合半格触铜，减少「标号未并网」
        const snapped = WarRouteAdapter.snapTopoLabelsToWireEnds(topo, grid);
        if (snapped > 0) {
            Logger.info(INSTR_TRACE_TAG, `[AI_WIRE] WAR_LABEL_SNAP n=${snapped} (onto stub/wire ends)`);
        }
        Logger.info(INSTR_TRACE_TAG, `[AI_WIRE] WAR_END routedNets=${routed} drawnSegs=${drawnSegs}` +
            ` demoted=${demoted.length} wires=${wiresBefore}→${topo.wireList.length}` +
            ` failed=${failed.length}`);
        if (failed.length > 0) {
            return {
                ok: false,
                routedNets: routed,
                failedNets: failed,
                demotedNets: demoted,
                reason: `WAR failed nets: ${failed.slice(0, 8).join(',')}`
            };
        }
        const reason = demoted.length > 0
            ? `ok_demoted:[${demoted.slice(0, 8).join(',')}]`
            : 'ok';
        return {
            ok: true, routedNets: routed, failedNets: [], demotedNets: demoted, reason: reason
        };
    }
    /**
     * WAR 失败网：为尚未触线的脚补同名标号 stub（电学上仍并网）。
     * @returns 新增 stub 数
     */
    private demoteNetToLabelStubs(topo: SchTopology, net: NetInfo, pins: WarPinWorld[]): number {
        const text = (net.netName && net.netName.length > 0) ? net.netName : 'NET';
        const hitRects: WorldHitRect[] = [];
        for (let di = 0; di < topo.deviceList.length; di++) {
            const d = topo.deviceList[di];
            hitRects.push(DeviceHitGeometry.hitRectFromDeviceInst(d, this.libPins(d.libDevId), WIRE_OBSTACLE_PAD));
        }
        const wirePaths: Point2D[][] = [];
        for (let wi = 0; wi < topo.wireList.length; wi++) {
            const pts = topo.wireList[wi].points;
            if (pts && pts.length >= 2) {
                wirePaths.push(pts);
            }
        }
        const occupied: Point2D[] = [];
        for (let li = 0; li < topo.netLabelList.length; li++) {
            occupied.push({ x: topo.netLabelList[li].x, y: topo.netLabelList[li].y });
        }
        let added = 0;
        const TOL = 25;
        for (let pi = 0; pi < pins.length; pi++) {
            const p = pins[pi];
            if (this.pinTouchedByNetWire(topo, net.netUuid, p.pt, TOL)) {
                continue;
            }
            const dev = this.findDev(topo, p.devUuid);
            // 器件查找失败时仍用简单偏移标号，确保不丢脚
            if (!dev) {
                const fallbackPos: Point2D = { x: p.pt.x + 30, y: p.pt.y - 40 };
                const fallbackLabel: NetLabelInfo = {
                    id: IdUtil.generate('lbl'),
                    netUuid: net.netUuid,
                    text: text,
                    x: fallbackPos.x,
                    y: fallbackPos.y,
                    global: false
                };
                topo.netLabelList.push(fallbackLabel);
                occupied.push(fallbackPos);
                const wid = IdUtil.generate('w');
                topo.wireList.push(makeRouteLine(net.netUuid, [p.pt, fallbackPos], false, wid));
                added++;
                traceAiWireDraw('war_demote_stub', `net=${text} pin=${p.refName}.${p.pinId} wireId=${wid}` +
                    ` (no-dev fallback)`);
                continue;
            }
            const foundOwn = hitRects.find(r => r.instUuid === dev.instUuid);
            const own: WorldHitRect = foundOwn !== undefined
                ? foundOwn
                : DeviceHitGeometry.hitRectFromDeviceInst(dev, this.libPins(dev.libDevId), WIRE_OBSTACLE_PAD);
            const foreign = hitRects.filter(r => r.instUuid !== dev.instUuid);
            const foreignPins: Point2D[] = [];
            for (let qi = 0; qi < pins.length; qi++) {
                if (qi === pi) {
                    continue;
                }
                foreignPins.push(pins[qi].pt);
            }
            // 精细标号避让；失败时简单偏移兜底，确保标号降级绝不丢脚
            let labelPos: Point2D;
            try {
                labelPos = DeviceHitGeometry.stubLabelOutsidePinAvoidForeign(p.pt, own, foreign, 28, foreignPins, {
                    wirePaths: wirePaths,
                    occupiedLabels: occupied,
                    labelText: text
                });
                // 若返回位置与引脚重合/过近，改用简单偏移
                if (Math.hypot(labelPos.x - p.pt.x, labelPos.y - p.pt.y) < 8) {
                    labelPos = { x: p.pt.x + 30, y: p.pt.y - 40 };
                }
            }
            catch (_e) {
                labelPos = { x: p.pt.x + 30, y: p.pt.y - 40 };
            }
            // 网格对齐端点，保证落图后半格触铜必中
            const g = topo.gridStep > 0 ? topo.gridStep : 10;
            labelPos = {
                x: Math.round(labelPos.x / g) * g,
                y: Math.round(labelPos.y / g) * g
            };
            if (Math.hypot(labelPos.x - p.pt.x, labelPos.y - p.pt.y) < g) {
                labelPos = { x: p.pt.x + g * 3, y: p.pt.y };
            }
            const labelInfo: NetLabelInfo = {
                id: IdUtil.generate('lbl'),
                netUuid: net.netUuid,
                text: text,
                x: labelPos.x,
                y: labelPos.y,
                global: false
            };
            topo.netLabelList.push(labelInfo);
            occupied.push({ x: labelPos.x, y: labelPos.y });
            const wid = IdUtil.generate('w');
            const stub = makeRouteLine(net.netUuid, [p.pt, labelPos], false, wid);
            topo.wireList.push(stub);
            wirePaths.push([p.pt, labelPos]);
            added++;
            traceAiWireDraw('war_demote_stub', `net=${text} pin=${p.refName}.${p.pinId} wireId=${wid}` +
                ` ends=(${Math.round(p.pt.x)},${Math.round(p.pt.y)})→` +
                `(${Math.round(labelPos.x)},${Math.round(labelPos.y)})`);
        }
        return added;
    }
    /**
     * 将拓扑标号吸附到导线端点（优先同 netUuid），保证半格触铜并网。
     */
    private static snapTopoLabelsToWireEnds(topo: SchTopology, grid: number): number {
        if (!topo.netLabelList || topo.netLabelList.length === 0 || topo.wireList.length === 0) {
            return 0;
        }
        const g = grid > 0 ? grid : 10;
        const touchTol = Math.max(g * 0.5, 5);
        const searchTol = Math.max(touchTol * 4, g * 2, 20);
        let n = 0;
        for (let li = 0; li < topo.netLabelList.length; li++) {
            const lb = topo.netLabelList[li];
            const upper = (lb.text ?? '').toUpperCase();
            if (upper === 'VCC' || upper === 'GND' || upper === 'VSS' || upper === 'VEE' || upper === '0') {
                continue;
            }
            // 已贴端点则跳过
            let already = false;
            for (let wi = 0; wi < topo.wireList.length; wi++) {
                const w = topo.wireList[wi];
                if (!w.points || w.points.length < 2) {
                    continue;
                }
                const ends = [w.points[0], w.points[w.points.length - 1]];
                for (let ei = 0; ei < ends.length; ei++) {
                    if (Math.hypot(lb.x - ends[ei].x, lb.y - ends[ei].y) <= touchTol) {
                        already = true;
                        break;
                    }
                }
                if (already) {
                    break;
                }
            }
            if (already) {
                continue;
            }
            let best: Point2D | null = null;
            let bestScore = searchTol;
            for (let wi = 0; wi < topo.wireList.length; wi++) {
                const w = topo.wireList[wi];
                if (!w.points || w.points.length < 2) {
                    continue;
                }
                const same = lb.netUuid.length > 0 && w.netUuid === lb.netUuid;
                const ends = [w.points[0], w.points[w.points.length - 1]];
                for (let ei = 0; ei < ends.length; ei++) {
                    const d = Math.hypot(lb.x - ends[ei].x, lb.y - ends[ei].y);
                    const score = same ? d - 1 : d;
                    if (score < bestScore) {
                        bestScore = score;
                        best = { x: ends[ei].x, y: ends[ei].y };
                    }
                }
            }
            if (best !== null) {
                lb.x = best.x;
                lb.y = best.y;
                n++;
            }
        }
        return n;
    }
    private pinTouchedByNetWire(topo: SchTopology, netUuid: string, pt: Point2D, tol: number): boolean {
        for (let wi = 0; wi < topo.wireList.length; wi++) {
            const w = topo.wireList[wi];
            if (w.netUuid !== netUuid || !w.points || w.points.length < 2) {
                continue;
            }
            const a = w.points[0];
            const b = w.points[w.points.length - 1];
            if (Math.hypot(a.x - pt.x, a.y - pt.y) <= tol ||
                Math.hypot(b.x - pt.x, b.y - pt.y) <= tol) {
                return true;
            }
        }
        return false;
    }
    /**
     * 直连失败时注入逃逸拐点再试。
     * 逃逸候选上限压低：每个候选再跑完整 previewWirePath(=多段 A*)，
     * 模拟器上 20+ 候选可轻易占满主线程触发 THREAD_BLOCK_6S。
     */
    private async routePinPair(topo: SchTopology, grid: number, warEnabled: boolean, a: WarPinWorld, b: WarPinWorld): Promise<WirePathPreviewResult> {
        const ctx = this.buildContext(topo, grid, warEnabled, a.devUuid, b.devUuid, a.pt, b.pt);
        const direct = await WireAutoRouter.previewWirePathAsync([a.pt, b.pt], ctx);
        if (!direct.blocked && direct.points && direct.points.length >= 2) {
            return direct;
        }
        const g = Math.max(1, grid);
        // 仅 3 档 margin；每候选独立 A*（async+yield），上限再压低防堆积
        const escapeMargins = [g * 3, g * 8, g * 16];
        const detours = WireAutoRouter.buildEscapeDetourCandidates(a.pt, b.pt, ctx, escapeMargins);
        const maxDetours = Math.min(detours.length, 6);
        for (let di = 0; di < maxDetours; di++) {
            await MainThreadYield.yield();
            const wp = await WireAutoRouter.previewWirePathAsync(detours[di], ctx);
            if (!wp.blocked && wp.points && wp.points.length >= 2) {
                Logger.info(INSTR_TRACE_TAG, `[AI_WIRE] WAR_ESCAPE ok ${a.refName}.${a.pinId}→${b.refName}.${b.pinId}` +
                    ` detour=${di} pts=${wp.points.length}`);
                return wp;
            }
        }
        return direct;
    }
    /**
     * 是否已布完：电源轨有任意 stub 即 OK；信号网须 DUT 脚（非仪器）已被 pin-to-pin 导线连通。
     * 仅 OSC/表计 stub、无 DUT 互连 → 不算完成（避免 SQUARE_OUT 因 CH1 stub 跳过 WAR）。
     */
    private netDutPinsAlreadyLinked(topo: SchTopology, net: NetInfo, pins: WarPinWorld[]): boolean {
        const name = (net.netName ?? '').toUpperCase();
        const isRail = net.isPower === true || name === 'VCC' || name === 'VDD' ||
            name === 'GND' || name === 'VSS' || name === 'VEE';
        // 电源轨：禁止「任意一根 stub 就算已连」——否则剥器件后只剩负载侧 stub，
        // VCC/GND 符号脚浮空却 WAR_SKIP，最终 SIM_CONN_BLOCK hard=VCC。
        // 改为：网上每个 DUT/电源脚都必须有导线端点触及，才视为已连。
        if (isRail) {
            if (pins.length < 1) {
                return true;
            }
            const TOL = 25;
            for (let i = 0; i < pins.length; i++) {
                const p = pins[i];
                let touched = false;
                for (let wi = 0; wi < topo.wireList.length; wi++) {
                    const w = topo.wireList[wi];
                    if (w.netUuid !== net.netUuid || !w.points || w.points.length < 2) {
                        continue;
                    }
                    const a = w.points[0];
                    const b = w.points[w.points.length - 1];
                    if (Math.hypot(a.x - p.pt.x, a.y - p.pt.y) <= TOL ||
                        Math.hypot(b.x - p.pt.x, b.y - p.pt.y) <= TOL) {
                        touched = true;
                        break;
                    }
                }
                if (!touched) {
                    return false;
                }
            }
            return true;
        }
        const dutIdx: number[] = [];
        for (let i = 0; i < pins.length; i++) {
            const dev = this.findDev(topo, pins[i].devUuid);
            const lib = (dev?.libDevId ?? '').toUpperCase();
            if (WarRouteAdapter.isInstrumentLib(lib)) {
                continue;
            }
            dutIdx.push(i);
        }
        const check = dutIdx.length >= 2 ? dutIdx : pins.map((_, i) => i);
        if (check.length < 2) {
            return true;
        }
        const TOL = 25;
        const parent: number[] = check.map((_, i) => i);
        const find = (a: number): number => {
            let x = a;
            while (parent[x] !== x) {
                parent[x] = parent[parent[x]];
                x = parent[x];
            }
            return x;
        };
        const union = (a: number, b: number): void => {
            const ra = find(a);
            const rb = find(b);
            if (ra !== rb) {
                parent[rb] = ra;
            }
        };
        for (let wi = 0; wi < topo.wireList.length; wi++) {
            const w = topo.wireList[wi];
            if (w.netUuid !== net.netUuid || !w.points || w.points.length < 2) {
                continue;
            }
            const a = w.points[0];
            const b = w.points[w.points.length - 1];
            const hits: number[] = [];
            for (let ci = 0; ci < check.length; ci++) {
                const p = pins[check[ci]].pt;
                if (Math.hypot(a.x - p.x, a.y - p.y) <= TOL ||
                    Math.hypot(b.x - p.x, b.y - p.y) <= TOL) {
                    hits.push(ci);
                }
            }
            // 仅 stub（只碰 1 脚）不能并集两 DUT；须导线两端（或折线）碰到 ≥2 DUT 脚
            if (hits.length >= 2) {
                for (let h = 1; h < hits.length; h++) {
                    union(hits[0], hits[h]);
                }
            }
        }
        const root0 = find(0);
        for (let ci = 1; ci < check.length; ci++) {
            if (find(ci) !== root0) {
                return false;
            }
        }
        return true;
    }
    private static isInstrumentLib(lib: string): boolean {
        const u = (lib ?? '').toUpperCase();
        return u.indexOf('OSCILLOSCOPE') >= 0 || u.indexOf('VOLTMETER') >= 0 ||
            u.indexOf('AMMETER') >= 0 || u.indexOf('LOGIC_ANALYZER') >= 0 ||
            u.indexOf('UART') >= 0 || u.indexOf('FREQ') >= 0 ||
            u.indexOf('POWER_METER') >= 0 || u.indexOf('VIRTUAL_METER') >= 0;
    }
    /** 信号网 WAR 只连 DUT；电源轨保留全部脚 */
    private filterDutPinsForWar(topo: SchTopology, net: NetInfo, pins: WarPinWorld[]): WarPinWorld[] {
        const name = (net.netName ?? '').toUpperCase();
        const isRail = net.isPower === true || name === 'VCC' || name === 'VDD' ||
            name === 'GND' || name === 'VSS' || name === 'VEE';
        if (isRail) {
            return pins;
        }
        const dut: WarPinWorld[] = [];
        for (let i = 0; i < pins.length; i++) {
            const dev = this.findDev(topo, pins[i].devUuid);
            const lib = (dev?.libDevId ?? '').toUpperCase();
            if (WarRouteAdapter.isInstrumentLib(lib)) {
                continue;
            }
            dut.push(pins[i]);
        }
        return dut.length >= 2 ? dut : pins;
    }
    private resolveNetPinWorlds(topo: SchTopology, net: NetInfo): WarPinWorld[] {
        const out: WarPinWorld[] = [];
        for (let i = 0; i < net.nodeList.length; i++) {
            const n = net.nodeList[i];
            const dev = this.findDev(topo, n.devUuid);
            if (!dev) {
                Logger.warn(INSTR_TRACE_TAG, `[AI_AGENT] WAR missing device ${n.devUuid} on net=${net.netName}`);
                continue;
            }
            const pt = PinWorldResolver.forDeviceInst(dev, n.pinId, n.pinName || n.pinId);
            const item: WarPinWorld = {
                devUuid: n.devUuid,
                pinId: n.pinId,
                refName: dev.refName ?? n.devUuid.substring(0, 8),
                pt: pt
            };
            out.push(item);
        }
        return out;
    }
    private findDev(topo: SchTopology, uuid: string): DeviceInst | null {
        for (let i = 0; i < topo.deviceList.length; i++) {
            if (topo.deviceList[i].instUuid === uuid) {
                return topo.deviceList[i];
            }
        }
        return null;
    }
    private libPins(libDevId: string): Pin[] {
        if (!this.library) {
            return [];
        }
        const r = this.library.getComponent(libDevId);
        if (!r.success || !r.data || !r.data.pins) {
            return [];
        }
        return r.data.pins;
    }
    private buildContext(topo: SchTopology, grid: number, warEnabled: boolean, fromUuid: string, toUuid: string, fromPt: Point2D, toPt: Point2D): WarRouteContext {
        const obstacles: WarCompObstacle[] = [];
        for (let i = 0; i < topo.deviceList.length; i++) {
            const d = topo.deviceList[i];
            const pins = this.libPins(d.libDevId);
            const hit = DeviceHitGeometry.hitRectFromDeviceInst(d, pins, WIRE_OBSTACLE_PAD);
            const escape: Point2D[] = [];
            if (d.instUuid === fromUuid) {
                escape.push(fromPt);
            }
            if (d.instUuid === toUuid) {
                escape.push(toPt);
            }
            const pinWorlds: Point2D[] = [];
            for (let pi = 0; pi < pins.length; pi++) {
                const pw = PinWorldResolver.forDeviceInst(d, pins[pi].id, pins[pi].name || pins[pi].id);
                pinWorlds.push(pw);
            }
            obstacles.push({
                id: d.instUuid,
                hitRect: hit,
                pinWorlds: pinWorlds,
                escapePinWorlds: escape
            });
        }
        const foreignPins: Point2D[] = [];
        const excludeSet = new Set<string>([fromUuid, toUuid]);
        for (let oi = 0; oi < obstacles.length; oi++) {
            const obs = obstacles[oi];
            for (let pi = 0; pi < obs.pinWorlds.length; pi++) {
                const pw = obs.pinWorlds[pi];
                if (!excludeSet.has(obs.id)) {
                    foreignPins.push(pw);
                    continue;
                }
                let isEsc = false;
                for (let ei = 0; ei < obs.escapePinWorlds.length; ei++) {
                    if (Math.hypot(obs.escapePinWorlds[ei].x - pw.x, obs.escapePinWorlds[ei].y - pw.y) <= 1.5) {
                        isEsc = true;
                        break;
                    }
                }
                if (!isEsc) {
                    foreignPins.push(pw);
                }
            }
        }
        const existingWires: Point2D[][] = [];
        for (let wi = 0; wi < topo.wireList.length; wi++) {
            const pts = topo.wireList[wi].points;
            if (pts && pts.length >= 2) {
                existingWires.push(pts);
            }
        }
        // 信号网络标号旗标框 = 选中区硬障碍（与框同大），避免 AI 布线压住标号文字
        const labelInputs: NetLabelAnchorInfo[] = [];
        for (let li = 0; li < topo.netLabelList.length; li++) {
            const lb = topo.netLabelList[li];
            const item: NetLabelAnchorInfo = { id: lb.id, text: lb.text, x: lb.x, y: lb.y };
            labelInputs.push(item);
        }
        const labelHits = DeviceHitGeometry.collectSignalLabelHitRects(labelInputs, existingWires);
        for (let hi = 0; hi < labelHits.length; hi++) {
            const hr = labelHits[hi];
            obstacles.push({
                id: `lbl:${hr.instUuid}`,
                hitRect: hr,
                pinWorlds: [],
                escapePinWorlds: []
            });
        }
        return {
            gridSize: grid,
            warEnabled,
            obstacles,
            excludeCompIds: [fromUuid, toUuid],
            foreignPins: foreignPins,
            existingWires,
            wireJoinPoints: [fromPt, toPt],
            previewLite: false
        };
    }
}
