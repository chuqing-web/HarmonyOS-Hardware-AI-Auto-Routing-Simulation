import { Logger } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/Logger";
import { INSTR_TRACE_TAG } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/InstrumentTraceLog";
import type { SchematicDocument, ComponentInstance, Point2D, ViewportState } from '../types/CommonTypes';
import { PcbLayerId } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/PcbTypes";
import type { PcbDocument, PcbFootprintInst, PcbTrack, PcbRatsnestEdge, PcbSelectionState, PcbAppearance } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/PcbTypes";
import { parsePinRef } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PinRefUtil";
import { getGlobalPcbFootprintLibrary } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbFootprintLibrary";
import { padWorldPosition, pointInPolygon } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbZoneUtil";
/** 画布实时状态（由编辑器采集，写入 instr_trace） */
export interface PcbCanvasTraceSnapshot {
    viewport: ViewportState;
    activeLayer: PcbLayerId;
    appearance: PcbAppearance;
    selection: PcbSelectionState;
    ratsnest: PcbRatsnestEdge[];
    toolMode?: string;
}
interface SchPinOnNet {
    pinId: string;
    pinName: string;
    netName: string;
}
function isLayoutableSchComp(comp: ComponentInstance): boolean {
    const lib = comp.libraryId.toLowerCase();
    if (lib.startsWith('gnd') || lib.startsWith('vcc') || lib.startsWith('vee') ||
        lib.startsWith('power') || lib.includes('probe') || lib.includes('instrument') ||
        lib.includes('oscilloscope') || lib.includes('multimeter') || lib.includes('generator')) {
        return false;
    }
    if (comp.refDes.startsWith('#')) {
        return false;
    }
    return true;
}
function collectSchPinsByComp(schematic: SchematicDocument): Map<string, SchPinOnNet[]> {
    const map: Map<string, SchPinOnNet[]> = new Map();
    for (let ni = 0; ni < schematic.nets.length; ni++) {
        const net = schematic.nets[ni];
        const netLabel = net.name.length > 0 ? net.name : net.id;
        for (let pi = 0; pi < net.pinIds.length; pi++) {
            const parsed = parsePinRef(net.pinIds[pi]);
            if (parsed === null) {
                continue;
            }
            let list = map.get(parsed.compId);
            if (list === undefined) {
                list = [];
                map.set(parsed.compId, list);
            }
            const entry: SchPinOnNet = {
                pinId: parsed.pinId,
                pinName: parsed.pinName,
                netName: netLabel
            };
            list.push(entry);
        }
    }
    return map;
}
function countUniqueSchPins(pins: SchPinOnNet[]): number {
    const seen: Set<string> = new Set();
    for (let i = 0; i < pins.length; i++) {
        seen.add(`${pins[i].pinId}|${pins[i].pinName}`);
    }
    return seen.size;
}
export function tracePcb(stage: string, detail: string): void {
    Logger.info(INSTR_TRACE_TAG, `[PCB] ${stage} | ${detail}`);
}
export function tracePcbWarn(stage: string, detail: string): void {
    Logger.warn(INSTR_TRACE_TAG, `[PCB] ${stage} | ${detail}`);
}
/** UI 状态变化（工具栏/菜单/图层/选择等） */
export function tracePcbUi(action: string, detail: string): void {
    Logger.info(INSTR_TRACE_TAG, `[PCB][UI] ${action} | ${detail}`);
}
/** 编辑操作（走线/过孔/移动/保存等） */
export function tracePcbOp(action: string, detail: string): void {
    Logger.info(INSTR_TRACE_TAG, `[PCB][OP] ${action} | ${detail}`);
}
/** 3D 预览交互与状态 */
export function tracePcb3d(action: string, detail: string): void {
    Logger.info(INSTR_TRACE_TAG, `[PCB][3D] ${action} | ${detail}`);
}
export function tracePcbForwardResult(schematic: SchematicDocument, doc: PcbDocument, placed: number, skipped: number, messages: string[]): void {
    tracePcb('FWD_ANNOTATE', `placed=${placed} skipped=${skipped} fp=${doc.footprints.length} msgs=${messages.length}`);
    for (let i = 0; i < messages.length; i++) {
        tracePcb('FWD_MSG', messages[i]);
    }
    tracePcbSchCompare(schematic, doc, 'after_forward');
}
export function tracePcbAutoRoute(doc: PcbDocument, layer: PcbLayerId, netCount: number, trackCount: number, messages: string[]): void {
    tracePcb('AUTO_ROUTE', `layer=${layer} nets=${netCount} tracks=${trackCount} totalTrk=${doc.tracks.length}`);
    for (let i = 0; i < messages.length; i++) {
        tracePcb('AUTO_ROUTE_MSG', messages[i]);
    }
    tracePcbNetRoutingSummary(doc);
}
export function tracePcbManualRoute(action: string, detail: string): void {
    tracePcb(`ROUTE_${action}`, detail);
}
export function tracePcbManualRouteReject(reason: string, startNet: string, endNet: string): void {
    tracePcbWarn('ROUTE_REJECT', `${reason} startNet=${startNet || '?'} endNet=${endNet || '?'}`);
}
export function tracePcbTrackAdded(track: PcbTrack): void {
    tracePcb('TRACK_ADD', `id=${track.id} net=${track.netName || track.netId || '(none)'} ` +
        `(${Math.round(track.start.x)},${Math.round(track.start.y)})→` +
        `(${Math.round(track.end.x)},${Math.round(track.end.y)}) w=${track.width.toFixed(1)}`);
}
export function tracePcbDrc(violationCount: number, unrouted: number, clearance: number): void {
    tracePcb('DRC', `total=${violationCount} unroutedNets=${unrouted} clearanceErr=${clearance}`);
}
export function tracePcbReverseResult(updated: number, skipped: number, messages: string[]): void {
    tracePcb('REV_ANNOTATE', `updated=${updated} skipped=${skipped} msgs=${messages.length}`);
    for (let i = 0; i < messages.length; i++) {
        if (messages[i].includes('无')) {
            tracePcbWarn('REV_MSG', messages[i]);
        }
        else {
            tracePcb('REV_MSG', messages[i]);
        }
    }
}
/**
 * 原理图 ↔ PCB 器件/引脚对照审计
 */
export function tracePcbSchCompare(schematic: SchematicDocument, doc: PcbDocument, reason: string): void {
    Logger.info(INSTR_TRACE_TAG, `[PCB] ---------- SCH↔PCB AUDIT (${reason}) ----------`);
    const schPins = collectSchPinsByComp(schematic);
    const fpBySchId: Map<string, PcbFootprintInst> = new Map();
    for (let i = 0; i < doc.footprints.length; i++) {
        const fp = doc.footprints[i];
        if (fp.schematicCompId !== undefined && fp.schematicCompId.length > 0) {
            fpBySchId.set(fp.schematicCompId, fp);
        }
    }
    let layoutable = 0;
    let missingOnPcb = 0;
    let pinMismatch = 0;
    let unboundPads = 0;
    for (let ci = 0; ci < schematic.components.length; ci++) {
        const comp = schematic.components[ci];
        if (!isLayoutableSchComp(comp)) {
            continue;
        }
        layoutable++;
        const fp = fpBySchId.get(comp.id);
        const pins = schPins.get(comp.id) ?? [];
        const schPinCount = countUniqueSchPins(pins);
        if (fp === undefined) {
            missingOnPcb++;
            tracePcbWarn('SCH_MISSING', `${comp.refDes}[${comp.libraryId}] schPinsOnNet=${schPinCount} → PCB无封装`);
            continue;
        }
        const def = getGlobalPcbFootprintLibrary().getDef(fp.defId);
        const padCount = fp.pads.length;
        const defName = def !== null ? def.name : fp.defId;
        let bound = 0;
        let floating = 0;
        const unboundList: string[] = [];
        for (let pi = 0; pi < fp.pads.length; pi++) {
            const pad = fp.pads[pi];
            if (pad.netId !== undefined && pad.netId.length > 0) {
                bound++;
            }
            else {
                floating++;
                if (unboundList.length < 6) {
                    unboundList.push(pad.number);
                }
            }
        }
        unboundPads += floating;
        const pinDetailParts: string[] = [];
        const showPins = Math.min(pins.length, 8);
        for (let pi = 0; pi < showPins; pi++) {
            pinDetailParts.push(`${pins[pi].pinId}/${pins[pi].pinName}→${pins[pi].netName}`);
        }
        const pinOverflow = pins.length > showPins ? `...+${pins.length - showPins}` : '';
        if (schPinCount > padCount) {
            pinMismatch++;
            tracePcbWarn('PIN_COUNT', `${comp.refDes} schPinsOnNet=${schPinCount} pcbPads=${padCount} def=${defName} ` +
                `bound=${bound} float=${floating} — 封装脚数不足`);
        }
        else if (floating > 0 && schPinCount > bound) {
            tracePcbWarn('PIN_BIND', `${comp.refDes} schPinsOnNet=${schPinCount} bound=${bound}/${padCount} def=${defName} ` +
                `unboundPads=[${unboundList.join(',')}] sch=[${pinDetailParts.join('; ')}${pinOverflow}]`);
        }
        else {
            tracePcb('FP_OK', `${comp.refDes} def=${defName} pads=${padCount} schPins=${schPinCount} ` +
                `bound=${bound} float=${floating} sch=[${pinDetailParts.join('; ')}${pinOverflow}]`);
        }
        if (fp.refDes !== comp.refDes) {
            tracePcbWarn('REFDES', `${comp.refDes} sch vs ${fp.refDes} pcb`);
        }
    }
    let orphanFp = 0;
    for (let i = 0; i < doc.footprints.length; i++) {
        const fp = doc.footprints[i];
        if (fp.schematicCompId === undefined || fp.schematicCompId.length === 0) {
            orphanFp++;
            tracePcbWarn('ORPHAN_FP', `${fp.refDes} def=${fp.defId} — 无 schematicCompId`);
            continue;
        }
        let found = false;
        for (let ci = 0; ci < schematic.components.length; ci++) {
            if (schematic.components[ci].id === fp.schematicCompId) {
                found = true;
                break;
            }
        }
        if (!found) {
            orphanFp++;
            tracePcbWarn('STALE_FP', `${fp.refDes} schId=${fp.schematicCompId} — 原理图无此器件`);
        }
    }
    tracePcb('AUDIT_SUMMARY', `layoutable=${layoutable} missing=${missingOnPcb} pinMismatch=${pinMismatch} ` +
        `unboundPads=${unboundPads} orphanFp=${orphanFp} tracks=${doc.tracks.length} ` +
        `vias=${doc.vias.length} schNets=${schematic.nets.length}`);
    Logger.info(INSTR_TRACE_TAG, `[PCB] ---------- SCH↔PCB AUDIT END ----------`);
}
/** 各网络焊盘数 / 是否已有走线 / 电源铺铜 */
export function tracePcbNetRoutingSummary(doc: PcbDocument): void {
    const padCountByNet: Map<string, number> = new Map();
    const netNameById: Map<string, string> = new Map();
    for (let i = 0; i < doc.footprints.length; i++) {
        const fp = doc.footprints[i];
        for (let pi = 0; pi < fp.pads.length; pi++) {
            const pad = fp.pads[pi];
            const nid = pad.netId ?? '';
            if (nid.length === 0) {
                continue;
            }
            padCountByNet.set(nid, (padCountByNet.get(nid) ?? 0) + 1);
            if (pad.netName !== undefined && pad.netName.length > 0) {
                netNameById.set(nid, pad.netName);
            }
        }
    }
    const routedNets: Set<string> = new Set();
    for (let i = 0; i < doc.tracks.length; i++) {
        if (doc.tracks[i].netId.length > 0) {
            routedNets.add(doc.tracks[i].netId);
        }
    }
    for (let i = 0; i < doc.vias.length; i++) {
        if (doc.vias[i].netId.length > 0) {
            routedNets.add(doc.vias[i].netId);
        }
    }
    const zoneNets: Set<string> = new Set();
    for (let i = 0; i < doc.zones.length; i++) {
        if (doc.zones[i].netId.length > 0) {
            zoneNets.add(doc.zones[i].netId);
        }
    }
    let singlePad = 0;
    let unrouted = 0;
    let routed = 0;
    let powerOk = 0;
    padCountByNet.forEach((cnt: number, nid: string) => {
        const nm = netNameById.get(nid) ?? nid;
        const upper = nm.toUpperCase();
        const power = upper === 'GND' || upper === 'VSS' || upper === 'AGND' ||
            upper === 'VCC' || upper === 'VDD' || upper === 'VEE' ||
            upper === 'VOUT' || upper === 'REG_IN' || upper === 'VIN_SRC' ||
            upper.indexOf('VIN') >= 0 || upper.indexOf('VCC') >= 0 || upper.indexOf('VDD') >= 0;
        if (power) {
            if (zoneNets.has(nid) || routedNets.has(nid)) {
                powerOk++;
                const how = zoneNets.has(nid)
                    ? (routedNets.has(nid) ? 'zone+copper' : 'zone')
                    : 'copper';
                tracePcb('NET_POWER', `${nm} pads=${cnt} via=${how}`);
            }
            else if (cnt >= 2) {
                unrouted++;
                tracePcbWarn('NET_UNROUTED', `${nm} pads=${cnt} — 电源网无走线/铺铜`);
            }
            else {
                singlePad++;
            }
            return;
        }
        if (cnt < 2) {
            singlePad++;
            tracePcb('NET_SINGLE_PAD', `${nm} pads=${cnt} — 单焊盘网(原理图对端未落板)`);
            return;
        }
        if (routedNets.has(nid)) {
            routed++;
        }
        else {
            unrouted++;
            tracePcbWarn('NET_UNROUTED', `${nm} pads=${cnt} — 尚无走线/过孔`);
        }
    });
    tracePcb('NET_SUMMARY', `routed=${routed} unrouted=${unrouted} singlePad=${singlePad} powerOk=${powerOk}`);
}
/**
 * 插入模板 / 排查用：把当前 PCB 画布全部状态写入 instr_trace
 * （封装、焊盘网络、走线、过孔、铺铜、板框、图层、层栈、网络表、引脚连接、画布实时）
 */
export function tracePcbFullState(doc: PcbDocument, reason: string, canvas?: PcbCanvasTraceSnapshot): void {
    Logger.info(INSTR_TRACE_TAG, `[PCB] ========== FULL STATE (${reason}) name=${doc.name} id=${doc.id} ver=${doc.version} ==========`);
    const outline = doc.boardOutline?.points ?? [];
    const outlineParts: string[] = [];
    for (let i = 0; i < outline.length; i++) {
        outlineParts.push(`(${Math.round(outline[i].x)},${Math.round(outline[i].y)})`);
    }
    tracePcb('BOARD', `outlinePts=${outline.length} [${outlineParts.join('→')}] width=${doc.boardOutline?.width ?? 0} ` +
        `grid=${doc.metadata?.gridSize ?? 0} units=${doc.metadata?.units ?? '?'} ` +
        `rules={tw=${doc.metadata?.designRules?.defaultTrackWidth ?? 0},` +
        `clr=${doc.metadata?.designRules?.minClearance ?? 0},` +
        `viaDrill=${doc.metadata?.designRules?.minViaDrill ?? 0}}`);
    // layers
    const layers = doc.layers ?? [];
    for (let i = 0; i < layers.length; i++) {
        const ly = layers[i];
        tracePcb('LAYER', `[${i}] id=${ly.id} name=${ly.name} visible=${ly.visible} ` +
            `color=${ly.color} opacity=${ly.opacity ?? 1}`);
    }
    // layer stack
    const stack = doc.layerStack;
    if (stack !== undefined && stack.layers !== undefined) {
        tracePcb('STACK', `copperCount=${stack.copperCount} stackLayers=${stack.layers.length}`);
        for (let i = 0; i < stack.layers.length; i++) {
            const sl = stack.layers[i];
            tracePcb('STACK_LAYER', `[${i}] id=${sl.id} type=${sl.type} name=${sl.name} ` +
                `cu=${sl.copperLayerId ?? '-'} thickMm=${sl.thicknessMm} ` +
                `dk=${sl.dielectricDk ?? '-'} oz=${sl.copperOz ?? '-'}`);
        }
    }
    else {
        tracePcbWarn('STACK', 'layerStack missing');
    }
    // nets
    const nets = doc.nets ?? [];
    tracePcb('NETS', `count=${nets.length}`);
    for (let i = 0; i < nets.length; i++) {
        const n = nets[i];
        tracePcb('NET', `[${i}] id=${n.id} name=${n.name} classId=${n.classId ?? '-'}`);
    }
    // net classes
    const ncs = doc.netClasses ?? [];
    for (let i = 0; i < ncs.length; i++) {
        const nc = ncs[i];
        tracePcb('NETCLASS', `id=${nc.id} name=${nc.name} tw=${nc.trackWidth} clr=${nc.clearance} ` +
            `viaD=${nc.viaDiameter} viaDrill=${nc.viaDrill}`);
    }
    // footprints + pads
    const fps = doc.footprints ?? [];
    tracePcb('FOOTPRINTS', `count=${fps.length}`);
    for (let i = 0; i < fps.length; i++) {
        const fp = fps[i];
        const padNetParts: string[] = [];
        let bound = 0;
        let floating = 0;
        for (let pi = 0; pi < fp.pads.length; pi++) {
            const pad = fp.pads[pi];
            const hasNet = pad.netId !== undefined && pad.netId.length > 0;
            if (hasNet) {
                bound++;
            }
            else {
                floating++;
            }
            if (padNetParts.length < 16) {
                const wp = padWorldPosition(fp, pad);
                padNetParts.push(`P${pad.number}@world(${Math.round(wp.x)},${Math.round(wp.y)})` +
                    `→${pad.netName ?? pad.netId ?? '(float)'}`);
            }
        }
        const padOverflow = fp.pads.length > 16 ? `...+${fp.pads.length - 16}` : '';
        tracePcb('FP', `[${i}] id=${fp.id} ref=${fp.refDes} value=${fp.value} def=${fp.defId} ` +
            `pos=(${Math.round(fp.position.x)},${Math.round(fp.position.y)}) ` +
            `rot=${fp.rotation} mir=${fp.mirrored} layer=${fp.layer} locked=${fp.locked} ` +
            `schId=${fp.schematicCompId ?? '-'} pads=${fp.pads.length} bound=${bound} float=${floating} ` +
            `padNets=[${padNetParts.join('; ')}${padOverflow}]`);
    }
    // tracks
    const tracks = doc.tracks ?? [];
    tracePcb('TRACKS', `count=${tracks.length}`);
    for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        tracePcb('TRACK', `[${i}] id=${t.id} layer=${t.layer} net=${t.netName || t.netId || '(none)'} ` +
            `(${Math.round(t.start.x)},${Math.round(t.start.y)})→` +
            `(${Math.round(t.end.x)},${Math.round(t.end.y)}) w=${t.width}`);
    }
    // vias
    const vias = doc.vias ?? [];
    tracePcb('VIAS', `count=${vias.length}`);
    for (let i = 0; i < vias.length; i++) {
        const v = vias[i];
        const ly = (v.layers ?? []).join(',');
        tracePcb('VIA', `[${i}] id=${v.id} pos=(${Math.round(v.position.x)},${Math.round(v.position.y)}) ` +
            `drill=${v.drill} dia=${v.diameter} net=${v.netName || v.netId || '(none)'} ` +
            `kind=${v.kind ?? 'through'} layers=[${ly}]`);
    }
    // zones
    const zones = doc.zones ?? [];
    tracePcb('ZONES', `count=${zones.length}`);
    for (let i = 0; i < zones.length; i++) {
        const z = zones[i];
        const zOutline: string[] = [];
        for (let oi = 0; oi < z.outline.length && oi < 8; oi++) {
            zOutline.push(`(${Math.round(z.outline[oi].x)},${Math.round(z.outline[oi].y)})`);
        }
        const zout = z.outline.length > 8 ? `...+${z.outline.length - 8}` : '';
        tracePcb('ZONE', `[${i}] id=${z.id} layer=${z.layer} net=${z.netName || z.netId || '(none)'} ` +
            `prio=${z.priority} clr=${z.clearance} thermal=${z.thermalRelief} ` +
            `gap=${z.thermalGap} tw=${z.thermalWidth} ` +
            `cutouts=${z.cutouts?.length ?? 0} manualCutouts=${z.manualCutouts?.length ?? 0} ` +
            `outline=[${zOutline.join('→')}${zout}]`);
    }
    // diff pairs
    const dps = doc.diffPairs ?? [];
    if (dps.length > 0) {
        for (let i = 0; i < dps.length; i++) {
            const dp = dps[i];
            tracePcb('DIFFPAIR', `id=${dp.id} name=${dp.name} P=${dp.netIdP} N=${dp.netIdN} ` +
                `gap=${dp.gapMil} lenTol=${dp.lengthTolMil}`);
        }
    }
    tracePcbNetRoutingSummary(doc);
    tracePcbPinConnectivity(doc, reason);
    tracePcbLayoutCrowd(doc, reason);
    if (canvas !== undefined) {
        tracePcbCanvasRealtime(doc, canvas, reason);
    }
    tracePcb('FULL_STATE_SUMMARY', `fp=${fps.length} tracks=${tracks.length} vias=${vias.length} zones=${zones.length} ` +
        `nets=${nets.length} layers=${layers.length} stackCu=${stack?.copperCount ?? 0} ` +
        `canvas=${canvas !== undefined ? 'yes' : 'no'}`);
    Logger.info(INSTR_TRACE_TAG, `[PCB] ========== FULL STATE END (${reason}) ==========`);
}
function dist2(a: Point2D, b: Point2D): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
}
function pointNearSegment(p: Point2D, a: Point2D, b: Point2D, tol: number): boolean {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    if (len2 < 0.01) {
        return dist2(p, a) <= tol * tol;
    }
    let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
    if (t < 0)
        t = 0;
    if (t > 1)
        t = 1;
    const cx = a.x + t * abx;
    const cy = a.y + t * aby;
    const ddx = p.x - cx;
    const ddy = p.y - cy;
    return ddx * ddx + ddy * ddy <= tol * tol;
}
/**
 * 引脚/焊盘连接情况：世界坐标、所属网络、同网焊盘数、是否被走线/过孔接到、飞线残留
 */
export function tracePcbPinConnectivity(doc: PcbDocument, reason: string): void {
    Logger.info(INSTR_TRACE_TAG, `[PCB] ---------- PIN CONNECTIVITY (${reason}) ----------`);
    const snapTol = Math.max(12, (doc.metadata?.gridSize ?? 5) * 2);
    const padsByNet: Map<string, string[]> = new Map();
    const trackSegsByNet: Map<string, PcbTrack[]> = new Map();
    const viaPtsByNet: Map<string, Point2D[]> = new Map();
    const padCountByNet: Map<string, number> = new Map();
    for (let ti = 0; ti < doc.tracks.length; ti++) {
        const t = doc.tracks[ti];
        if (!t.netId || t.netId.length === 0)
            continue;
        let list = trackSegsByNet.get(t.netId);
        if (list === undefined) {
            list = [];
            trackSegsByNet.set(t.netId, list);
        }
        list.push(t);
    }
    for (let vi = 0; vi < doc.vias.length; vi++) {
        const v = doc.vias[vi];
        if (!v.netId || v.netId.length === 0)
            continue;
        let list = viaPtsByNet.get(v.netId);
        if (list === undefined) {
            list = [];
            viaPtsByNet.set(v.netId, list);
        }
        list.push({ x: v.position.x, y: v.position.y });
    }
    for (let fi = 0; fi < doc.footprints.length; fi++) {
        const fp = doc.footprints[fi];
        for (let pi = 0; pi < fp.pads.length; pi++) {
            const nid = fp.pads[pi].netId ?? '';
            if (nid.length === 0)
                continue;
            padCountByNet.set(nid, (padCountByNet.get(nid) ?? 0) + 1);
        }
    }
    let totalPads = 0;
    let boundPads = 0;
    let floatingPads = 0;
    let copperHitPads = 0;
    let copperMissPads = 0;
    let singlePadPads = 0;
    let mountBoundPads = 0;
    for (let fi = 0; fi < doc.footprints.length; fi++) {
        const fp = doc.footprints[fi];
        const isMount = /^H\d+$/.test(fp.refDes);
        for (let pi = 0; pi < fp.pads.length; pi++) {
            const pad = fp.pads[pi];
            totalPads++;
            const wp = padWorldPosition(fp, pad);
            const netId = pad.netId ?? '';
            const netName = pad.netName ?? '';
            const hasNet = netId.length > 0;
            if (!hasNet) {
                floatingPads++;
                const floatDetail = `${fp.refDes}.P${pad.number} world=(${Math.round(wp.x)},${Math.round(wp.y)}) ` +
                    `type=${pad.type} layers=[${(pad.layers ?? []).join(',')}] net=(float) copper=n/a`;
                if (isMount) {
                    tracePcb('PIN', `${floatDetail} (mount)`);
                }
                else {
                    tracePcbWarn('PIN', floatDetail);
                }
                continue;
            }
            boundPads++;
            if (isMount)
                mountBoundPads++;
            let peers = padsByNet.get(netId);
            if (peers === undefined) {
                peers = [];
                padsByNet.set(netId, peers);
            }
            peers.push(`${fp.refDes}.P${pad.number}`);
            const segs = trackSegsByNet.get(netId) ?? [];
            const vias = viaPtsByNet.get(netId) ?? [];
            let hitTrack = false;
            let hitVia = false;
            let hitZone = false;
            for (let si = 0; si < segs.length; si++) {
                if (pointNearSegment(wp, segs[si].start, segs[si].end, snapTol)) {
                    hitTrack = true;
                    break;
                }
            }
            for (let vi = 0; vi < vias.length; vi++) {
                if (dist2(wp, vias[vi]) <= snapTol * snapTol) {
                    hitVia = true;
                    break;
                }
            }
            for (let zi = 0; zi < doc.zones.length; zi++) {
                const z = doc.zones[zi];
                if (z.netId !== netId || z.outline.length < 3)
                    continue;
                const onZoneLayer = pad.type === 'th' || pad.type === 'npth' ||
                    (pad.layers !== undefined && pad.layers.indexOf(z.layer) >= 0);
                if (!onZoneLayer)
                    continue;
                if (pointInPolygon(wp, z.outline)) {
                    hitZone = true;
                    break;
                }
            }
            const peerTotal = padCountByNet.get(netId) ?? 1;
            const copperOk = hitTrack || hitVia || hitZone;
            let status: string;
            if (copperOk) {
                copperHitPads++;
                const parts: string[] = [];
                if (hitTrack)
                    parts.push('track');
                if (hitVia)
                    parts.push('via');
                if (hitZone)
                    parts.push('zone');
                status = parts.join('+');
            }
            else if (peerTotal < 2) {
                singlePadPads++;
                status = 'single_pad';
            }
            else {
                copperMissPads++;
                status = 'no_copper';
            }
            const pinDetail = `${fp.refDes}.P${pad.number} world=(${Math.round(wp.x)},${Math.round(wp.y)}) ` +
                `type=${pad.type} layers=[${(pad.layers ?? []).join(',')}] ` +
                `net=${netName || netId} segs=${segs.length} vias=${vias.length} ` +
                `copper=${status} tol=${snapTol}`;
            if (status === 'no_copper') {
                tracePcbWarn('PIN', pinDetail);
            }
            else {
                tracePcb('PIN', pinDetail);
            }
        }
    }
    // per-net peer summary
    padsByNet.forEach((peers: string[], netId: string) => {
        let netName = netId;
        for (let i = 0; i < doc.nets.length; i++) {
            if (doc.nets[i].id === netId) {
                netName = doc.nets[i].name;
                break;
            }
        }
        const segs = trackSegsByNet.get(netId)?.length ?? 0;
        const vias = viaPtsByNet.get(netId)?.length ?? 0;
        let zoneCount = 0;
        for (let zi = 0; zi < doc.zones.length; zi++) {
            if (doc.zones[zi].netId === netId)
                zoneCount++;
        }
        const peerShow = peers.slice(0, 12).join(',');
        const overflow = peers.length > 12 ? `...+${peers.length - 12}` : '';
        const upper = netName.toUpperCase();
        const power = upper === 'GND' || upper === 'VSS' || upper === 'VCC' || upper === 'VDD' ||
            upper === 'VEE' || upper === 'VOUT' || upper === 'REG_IN' || upper === 'VIN_SRC';
        if (peers.length >= 2 && segs === 0 && vias === 0 && zoneCount === 0 && !power) {
            tracePcbWarn('PIN_NET', `${netName} pads=${peers.length} segs=0 vias=0 peers=[${peerShow}${overflow}] — 有网无铜`);
        }
        else {
            tracePcb('PIN_NET', `${netName} pads=${peers.length} segs=${segs} vias=${vias} zones=${zoneCount} ` +
                `peers=[${peerShow}${overflow}]${power ? ' (power)' : ''}`);
        }
    });
    tracePcb('PIN_SUMMARY', `totalPads=${totalPads} bound=${boundPads} float=${floatingPads} ` +
        `copperHit=${copperHitPads} copperMiss=${copperMissPads} singlePad=${singlePadPads} ` +
        `mountBound=${mountBoundPads} netsWithPads=${padsByNet.size}`);
    Logger.info(INSTR_TRACE_TAG, `[PCB] ---------- PIN CONNECTIVITY END ----------`);
}
/**
 * 画布真实情况：视口、活动层、外观、选择、飞线、可见图层与内容包围盒
 */
export function tracePcbCanvasRealtime(doc: PcbDocument, canvas: PcbCanvasTraceSnapshot, reason: string): void {
    Logger.info(INSTR_TRACE_TAG, `[PCB] ---------- CANVAS REALTIME (${reason}) ----------`);
    const vp = canvas.viewport;
    tracePcb('CANVAS_VP', `zoom=${vp.zoom.toFixed(4)} pan=(${Math.round(vp.panOffset.x)},${Math.round(vp.panOffset.y)}) ` +
        `gridVisible=${vp.gridVisible} gridSize=${vp.gridSize} snap=${vp.snapToGrid}`);
    const ap = canvas.appearance;
    tracePcb('CANVAS_APPEAR', `mode=${ap.mode} dimAlpha=${ap.dimAlpha} highlightNet=${ap.highlightNetId || '(none)'} ` +
        `hideZones=${ap.hideZones} ratsnest=${ap.showRatsnest} padNums=${ap.showPadNumbers} ` +
        `show3d=${ap.show3d} yaw=${ap.view3dYawDeg} pitch=${ap.view3dPitchDeg} ` +
        `ortho=${ap.view3dOrtho !== false} disp=${ap.view3dDisplayMode} ` +
        `pbr=${ap.view3dPbr !== false} msaa=${ap.view3dMsaa >= 4 ? 4 : 1} ` +
        `cut=${(ap.view3dCutFraction !== undefined ? ap.view3dCutFraction : 0).toFixed(2)} ` +
        `meas3d=${ap.view3dMeasure === true} interf=${ap.view3dShowInterference === true}`);
    tracePcb('CANVAS_LAYER', `active=${canvas.activeLayer} tool=${canvas.toolMode ?? '(n/a)'}`);
    // visible layers vs content on those layers
    const layers = doc.layers ?? [];
    for (let i = 0; i < layers.length; i++) {
        const ly = layers[i];
        let trkOn = 0;
        let zoneOn = 0;
        let fpOn = 0;
        for (let ti = 0; ti < doc.tracks.length; ti++) {
            if (doc.tracks[ti].layer === ly.id)
                trkOn++;
        }
        for (let zi = 0; zi < doc.zones.length; zi++) {
            if (doc.zones[zi].layer === ly.id)
                zoneOn++;
        }
        for (let fi = 0; fi < doc.footprints.length; fi++) {
            if (doc.footprints[fi].layer === ly.id)
                fpOn++;
        }
        tracePcb('CANVAS_LAYER_CONTENT', `${ly.id} visible=${ly.visible} fp=${fpOn} tracks=${trkOn} zones=${zoneOn}` +
            `${ly.id === canvas.activeLayer ? ' <<ACTIVE' : ''}`);
    }
    const sel = canvas.selection;
    tracePcb('CANVAS_SEL', `kind=${sel.kind} fp=${sel.footprintIds.length} trk=${sel.trackIds.length} ` +
        `via=${sel.viaIds.length} zone=${sel.zoneIds.length} ` +
        `fpIds=[${sel.footprintIds.slice(0, 8).join(',')}] ` +
        `trkIds=[${sel.trackIds.slice(0, 8).join(',')}]`);
    // content bbox vs viewport center
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let has = false;
    const expand = (x: number, y: number): void => {
        if (!has) {
            minX = x;
            maxX = x;
            minY = y;
            maxY = y;
            has = true;
        }
        else {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }
    };
    for (let i = 0; i < doc.footprints.length; i++) {
        expand(doc.footprints[i].position.x, doc.footprints[i].position.y);
    }
    for (let i = 0; i < doc.tracks.length; i++) {
        expand(doc.tracks[i].start.x, doc.tracks[i].start.y);
        expand(doc.tracks[i].end.x, doc.tracks[i].end.y);
    }
    for (let i = 0; i < doc.vias.length; i++) {
        expand(doc.vias[i].position.x, doc.vias[i].position.y);
    }
    if (has) {
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        tracePcb('CANVAS_BBOX', `content=(${Math.round(minX)},${Math.round(minY)})-(${Math.round(maxX)},${Math.round(maxY)}) ` +
            `center=(${Math.round(cx)},${Math.round(cy)}) ` +
            `size=${Math.round(maxX - minX)}x${Math.round(maxY - minY)}`);
    }
    else {
        tracePcbWarn('CANVAS_BBOX', 'empty board — no footprints/tracks/vias');
    }
    const board = doc.boardOutline?.points ?? [];
    if (board.length >= 2) {
        let bMinX = board[0].x, bMaxX = board[0].x, bMinY = board[0].y, bMaxY = board[0].y;
        for (let i = 1; i < board.length; i++) {
            bMinX = Math.min(bMinX, board[i].x);
            bMaxX = Math.max(bMaxX, board[i].x);
            bMinY = Math.min(bMinY, board[i].y);
            bMaxY = Math.max(bMaxY, board[i].y);
        }
        tracePcb('CANVAS_BOARD', `outlineBBox=(${Math.round(bMinX)},${Math.round(bMinY)})-(${Math.round(bMaxX)},${Math.round(bMaxY)})`);
        if (has && (maxX > bMaxX + 1 || maxY > bMaxY + 1 || minX < bMinX - 1 || minY < bMinY - 1)) {
            tracePcbWarn('CANVAS_OFFBOARD', `content extends outside board outline bbox`);
        }
    }
    // ratsnest (airwires) — real unfinished connections on canvas
    const rn = canvas.ratsnest ?? [];
    tracePcb('CANVAS_RATSNEST', `edges=${rn.length} show=${ap.showRatsnest}`);
    const rnByNet: Map<string, number> = new Map();
    for (let i = 0; i < rn.length; i++) {
        const e = rn[i];
        const key = e.netName || e.netId || '?';
        rnByNet.set(key, (rnByNet.get(key) ?? 0) + 1);
        if (i < 40) {
            tracePcb('RATSNEST', `[${i}] net=${key} ` +
                `(${Math.round(e.a.x)},${Math.round(e.a.y)})→(${Math.round(e.b.x)},${Math.round(e.b.y)})`);
        }
    }
    if (rn.length > 40) {
        tracePcb('RATSNEST', `...+${rn.length - 40} more edges`);
    }
    rnByNet.forEach((cnt: number, nm: string) => {
        tracePcb('RATSNEST_NET', `${nm} airwires=${cnt}`);
    });
    tracePcb('CANVAS_SUMMARY', `active=${canvas.activeLayer} zoom=${vp.zoom.toFixed(3)} ` +
        `fp=${doc.footprints.length} trk=${doc.tracks.length} via=${doc.vias.length} ` +
        `zone=${doc.zones.length} ratsnest=${rn.length} sel=${sel.kind}`);
    Logger.info(INSTR_TRACE_TAG, `[PCB] ---------- CANVAS REALTIME END ----------`);
}
function fpApproxHalf(fp: PcbFootprintInst): Point2D {
    let hw = 40;
    let hh = 40;
    for (let i = 0; i < fp.pads.length; i++) {
        const p = fp.pads[i];
        hw = Math.max(hw, Math.abs(p.pos.x) + p.size.x * 0.5);
        hh = Math.max(hh, Math.abs(p.pos.y) + p.size.y * 0.5);
    }
    return { x: hw, y: hh };
}
function segClearance(a0: Point2D, a1: Point2D, b0: Point2D, b1: Point2D): number {
    // 端点到线段最小距离近似
    let best = Number.POSITIVE_INFINITY;
    const samples: Point2D[] = [a0, a1, b0, b1];
    const midA: Point2D = { x: (a0.x + a1.x) * 0.5, y: (a0.y + a1.y) * 0.5 };
    const midB: Point2D = { x: (b0.x + b1.x) * 0.5, y: (b0.y + b1.y) * 0.5 };
    for (let i = 0; i < samples.length; i++) {
        best = Math.min(best, Math.sqrt(dist2(samples[i], midA)));
        best = Math.min(best, Math.sqrt(dist2(samples[i], midB)));
    }
    // 更准：点到另一线段
    const checkPt = (p: Point2D, s: Point2D, e: Point2D): number => {
        const abx = e.x - s.x;
        const aby = e.y - s.y;
        const len2 = abx * abx + aby * aby;
        if (len2 < 0.01)
            return Math.sqrt(dist2(p, s));
        let t = ((p.x - s.x) * abx + (p.y - s.y) * aby) / len2;
        if (t < 0)
            t = 0;
        if (t > 1)
            t = 1;
        return Math.hypot(p.x - (s.x + t * abx), p.y - (s.y + t * aby));
    };
    best = Math.min(best, checkPt(a0, b0, b1), checkPt(a1, b0, b1), checkPt(b0, a0, a1), checkPt(b1, a0, a1));
    return best;
}
interface CrowdPadSample {
    ref: string;
    net: string;
    x: number;
    y: number;
    r: number;
    fpRef: string;
}
/**
 * 布局拥挤 / 干涉 / 间距诊断 — 排查器件重叠、网络间距、板内密度
 */
export function tracePcbLayoutCrowd(doc: PcbDocument, reason: string): void {
    Logger.info(INSTR_TRACE_TAG, `[PCB] ---------- LAYOUT CROWD (${reason}) ----------`);
    const clr = doc.metadata?.designRules?.minClearance ?? 6;
    const fps = doc.footprints;
    let overlapFp = 0;
    let tightFp = 0;
    let offBoard = 0;
    const board = doc.boardOutline?.points ?? [];
    for (let i = 0; i < fps.length; i++) {
        const a = fps[i];
        if (/^H\d+$/.test(a.refDes))
            continue;
        const ae = fpApproxHalf(a);
        if (board.length >= 3 && !pointInPolygon(a.position, board)) {
            offBoard++;
            tracePcbWarn('CROWD_OFFBOARD', `${a.refDes} pos=(${Math.round(a.position.x)},${Math.round(a.position.y)}) layer=${a.layer}`);
        }
        for (let j = i + 1; j < fps.length; j++) {
            const b = fps[j];
            if (/^H\d+$/.test(b.refDes))
                continue;
            if (a.layer !== b.layer)
                continue;
            const be = fpApproxHalf(b);
            const dx = Math.abs(a.position.x - b.position.x);
            const dy = Math.abs(a.position.y - b.position.y);
            const gapX = dx - ae.x - be.x;
            const gapY = dy - ae.y - be.y;
            // AABB 真实重叠需两轴同时穿透；min(gapX,gapY)<0 会把对角分离误报为重叠
            if (gapX < 0 && gapY < 0) {
                overlapFp++;
                if (overlapFp <= 40) {
                    const overlapAbs = Math.min(0 - gapX, 0 - gapY);
                    tracePcbWarn('CROWD_FP_OVERLAP', `${a.refDes}@(${Math.round(a.position.x)},${Math.round(a.position.y)}) × ` +
                        `${b.refDes}@(${Math.round(b.position.x)},${Math.round(b.position.y)}) ` +
                        `overlap≈${overlapAbs.toFixed(1)}mil layer=${a.layer}`);
                }
            }
            else if (Math.min(gapX, gapY) < clr * 2) {
                tightFp++;
                if (tightFp <= 30) {
                    const gap = Math.min(gapX, gapY);
                    tracePcbWarn('CROWD_FP_TIGHT', `${a.refDes}↔${b.refDes} gap≈${gap.toFixed(1)}mil < ${clr * 2}mil`);
                }
            }
        }
    }
    // 焊盘异网过近（跳过同一封装内相邻脚——封装节距本身常 < clr）
    let padClash = 0;
    const padSamples: CrowdPadSample[] = [];
    for (let fi = 0; fi < fps.length; fi++) {
        const fp = fps[fi];
        for (let pi = 0; pi < fp.pads.length; pi++) {
            const pad = fp.pads[pi];
            const nid = pad.netId ?? '';
            if (nid.length === 0)
                continue;
            const wp = padWorldPosition(fp, pad);
            const sample: CrowdPadSample = {
                ref: `${fp.refDes}.P${pad.number}`,
                net: pad.netName || nid,
                x: wp.x,
                y: wp.y,
                r: Math.max(pad.size.x, pad.size.y) * 0.5,
                fpRef: fp.refDes
            };
            padSamples.push(sample);
        }
    }
    const padLimit = Math.min(padSamples.length, 180);
    for (let i = 0; i < padLimit; i++) {
        for (let j = i + 1; j < padLimit; j++) {
            if (padSamples[i].net === padSamples[j].net)
                continue;
            if (padSamples[i].fpRef === padSamples[j].fpRef)
                continue;
            const d = Math.hypot(padSamples[i].x - padSamples[j].x, padSamples[i].y - padSamples[j].y) - padSamples[i].r - padSamples[j].r;
            if (d < clr) {
                padClash++;
                if (padClash <= 25) {
                    tracePcbWarn('CROWD_PAD', `${padSamples[i].ref}(${padSamples[i].net}) ↔ ${padSamples[j].ref}(${padSamples[j].net}) ` +
                        `gap=${d.toFixed(1)}mil < clr=${clr}`);
                }
            }
        }
    }
    // 同层异网走线间距粗检（限制对数量）
    let trackClash = 0;
    const tracks = doc.tracks;
    const tLimit = Math.min(tracks.length, 120);
    for (let i = 0; i < tLimit; i++) {
        const t1 = tracks[i];
        if (!t1.netId || t1.netId.length === 0)
            continue;
        for (let j = i + 1; j < tLimit; j++) {
            const t2 = tracks[j];
            if (t1.layer !== t2.layer || !t2.netId || t2.netId === t1.netId)
                continue;
            const d = segClearance(t1.start, t1.end, t2.start, t2.end) - (t1.width + t2.width) * 0.5;
            if (d < clr) {
                trackClash++;
                if (trackClash <= 25) {
                    tracePcbWarn('CROWD_TRACK', `${t1.netName || t1.netId} × ${t2.netName || t2.netId} layer=${t1.layer} ` +
                        `gap≈${d.toFixed(1)}mil < clr=${clr}`);
                }
            }
        }
    }
    // 板密度
    let boardArea = 0;
    if (board.length >= 3) {
        let minX = board[0].x, maxX = board[0].x, minY = board[0].y, maxY = board[0].y;
        for (let i = 1; i < board.length; i++) {
            minX = Math.min(minX, board[i].x);
            maxX = Math.max(maxX, board[i].x);
            minY = Math.min(minY, board[i].y);
            maxY = Math.max(maxY, board[i].y);
        }
        boardArea = Math.max(1, (maxX - minX) * (maxY - minY));
    }
    let placeable = 0;
    for (let i = 0; i < fps.length; i++) {
        if (!/^H\d+$/.test(fps[i].refDes))
            placeable++;
    }
    const areaPerFp = placeable > 0 ? boardArea / placeable : 0;
    if (placeable > 0 && areaPerFp < 8000) {
        tracePcbWarn('CROWD_DENSITY', `fp=${placeable} boardArea≈${Math.round(boardArea)} mil² avg≈${Math.round(areaPerFp)}/器件 — 偏挤`);
    }
    else {
        tracePcb('CROWD_DENSITY', `fp=${placeable} boardArea≈${Math.round(boardArea)} mil² avg≈${Math.round(areaPerFp)}/器件`);
    }
    tracePcb('CROWD_SUMMARY', `fpOverlap=${overlapFp} fpTight=${tightFp} offBoard=${offBoard} ` +
        `padClash=${padClash} trackClash=${trackClash} clr=${clr} padsSampled=${padLimit} trkSampled=${tLimit}`);
    Logger.info(INSTR_TRACE_TAG, `[PCB] ---------- LAYOUT CROWD END ----------`);
}
/** 2D 画布展示审计入参 */
export interface PcbView2dTraceParams {
    viewWidth: number;
    viewHeight: number;
    viewport: ViewportState;
    appearance: PcbAppearance;
    selection: PcbSelectionState;
    activeLayer: PcbLayerId;
    toolMode: string;
    ratsnestCount: number;
    drcCount: number;
}
let gLastView2dTraceMs: number = 0;
let gLastView3dTraceMs: number = 0;
/**
 * 2D UI 展示审计：视口、器件屏幕位置、走线可见性、活动层内容
 */
export function tracePcbView2dAudit(doc: PcbDocument, p: PcbView2dTraceParams, reason: string, force: boolean): void {
    const now = Date.now();
    if (!force && now - gLastView2dTraceMs < 2800) {
        return;
    }
    gLastView2dTraceMs = now;
    Logger.info(INSTR_TRACE_TAG, `[PCB] ---------- VIEW2D AUDIT (${reason}) ----------`);
    const vp = p.viewport;
    const ap = p.appearance;
    const zoom = Math.max(vp.zoom, 0.001);
    const worldAtScreen = (sx: number, sy: number): Point2D => ({
        x: (sx - vp.panOffset.x) / zoom,
        y: (sy - vp.panOffset.y) / zoom
    });
    const screenOf = (wx: number, wy: number): Point2D => ({
        x: wx * zoom + vp.panOffset.x,
        y: wy * zoom + vp.panOffset.y
    });
    tracePcb('VIEW2D_UI', `view=${Math.round(p.viewWidth)}x${Math.round(p.viewHeight)} ` +
        `zoom=${zoom.toFixed(4)} pan=(${Math.round(vp.panOffset.x)},${Math.round(vp.panOffset.y)}) ` +
        `mode=${ap.mode} active=${p.activeLayer} tool=${p.toolMode || '-'} ` +
        `ratsnest=${ap.showRatsnest}(${p.ratsnestCount}) zonesHidden=${ap.hideZones} ` +
        `padNums=${ap.showPadNumbers} hlNet=${ap.highlightNetId || '-'} dim=${ap.dimAlpha} ` +
        `drcMarks=${p.drcCount}`);
    // 视口世界范围
    if (p.viewWidth > 0 && p.viewHeight > 0) {
        const tl = worldAtScreen(0, 0);
        const br = worldAtScreen(p.viewWidth, p.viewHeight);
        tracePcb('VIEW2D_WORLD', `visibleWorld=(${Math.round(tl.x)},${Math.round(tl.y)})-(${Math.round(br.x)},${Math.round(br.y)})`);
    }
    // 图层可见性 vs 图元
    let hiddenWithContent = 0;
    for (let i = 0; i < doc.layers.length; i++) {
        const ly = doc.layers[i];
        let trk = 0;
        let zn = 0;
        for (let ti = 0; ti < doc.tracks.length; ti++) {
            if (doc.tracks[ti].layer === ly.id)
                trk++;
        }
        for (let zi = 0; zi < doc.zones.length; zi++) {
            if (doc.zones[zi].layer === ly.id)
                zn++;
        }
        if (!ly.visible && (trk > 0 || zn > 0)) {
            hiddenWithContent++;
            tracePcbWarn('VIEW2D_LAYER_HIDDEN', `${ly.id} visible=false 但有 tracks=${trk} zones=${zn} — UI 上看不见铜`);
        }
    }
    // 每个器件：世界/屏幕/焊盘网/是否在视口内
    let inView = 0;
    let outView = 0;
    for (let i = 0; i < doc.footprints.length; i++) {
        const fp = doc.footprints[i];
        const sp = screenOf(fp.position.x, fp.position.y);
        let onScreen = true;
        if (p.viewWidth > 0 && p.viewHeight > 0) {
            onScreen = sp.x >= -40 && sp.y >= -40 &&
                sp.x <= p.viewWidth + 40 && sp.y <= p.viewHeight + 40;
        }
        if (onScreen)
            inView++;
        else
            outView++;
        let bound = 0;
        let floating = 0;
        const nets: string[] = [];
        for (let pi = 0; pi < fp.pads.length; pi++) {
            const pad = fp.pads[pi];
            if (pad.netId !== undefined && pad.netId.length > 0) {
                bound++;
                const nm = pad.netName || pad.netId;
                if (nets.indexOf(nm) < 0 && nets.length < 8)
                    nets.push(nm);
            }
            else {
                floating++;
            }
        }
        const line = `${fp.refDes} def=${fp.defId} world=(${Math.round(fp.position.x)},${Math.round(fp.position.y)}) ` +
            `screen=(${Math.round(sp.x)},${Math.round(sp.y)}) rot=${fp.rotation} mir=${fp.mirrored} ` +
            `layer=${fp.layer} pads=${fp.pads.length} bound=${bound} float=${floating} ` +
            `nets=[${nets.join(',')}] onScreen=${onScreen}`;
        if (floating > 0 && !/^H\d+$/.test(fp.refDes)) {
            tracePcbWarn('VIEW2D_FP', line);
        }
        else {
            tracePcb('VIEW2D_FP', line);
        }
    }
    // 走线：长度、层、是否过短/零长
    let zeroLen = 0;
    let shortTrk = 0;
    let noNetTrk = 0;
    for (let i = 0; i < doc.tracks.length; i++) {
        const t = doc.tracks[i];
        const len = Math.hypot(t.end.x - t.start.x, t.end.y - t.start.y);
        if (len < 0.5)
            zeroLen++;
        else if (len < 8)
            shortTrk++;
        if (!t.netId || t.netId.length === 0)
            noNetTrk++;
        if (i < 60 || len < 0.5 || !t.netId) {
            const tag = (len < 0.5 || !t.netId) ? 'VIEW2D_TRACK_BAD' : 'VIEW2D_TRACK';
            const detail = `id=${t.id} net=${t.netName || t.netId || '(none)'} layer=${t.layer} ` +
                `(${Math.round(t.start.x)},${Math.round(t.start.y)})→` +
                `(${Math.round(t.end.x)},${Math.round(t.end.y)}) len=${len.toFixed(1)} w=${t.width}`;
            if (tag === 'VIEW2D_TRACK_BAD') {
                tracePcbWarn(tag, detail);
            }
            else {
                tracePcb(tag, detail);
            }
        }
    }
    if (doc.tracks.length > 60) {
        tracePcb('VIEW2D_TRACK', `...+${doc.tracks.length - 60} tracks (only first 60 + bad listed)`);
    }
    for (let i = 0; i < doc.vias.length && i < 40; i++) {
        const v = doc.vias[i];
        const sp = screenOf(v.position.x, v.position.y);
        tracePcb('VIEW2D_VIA', `id=${v.id} pos=(${Math.round(v.position.x)},${Math.round(v.position.y)}) ` +
            `screen=(${Math.round(sp.x)},${Math.round(sp.y)}) net=${v.netName || v.netId || '-'} ` +
            `drill=${v.drill} dia=${v.diameter} kind=${v.kind ?? 'through'}`);
    }
    const sel = p.selection;
    tracePcb('VIEW2D_SEL', `kind=${sel.kind} fp=${sel.footprintIds.length} trk=${sel.trackIds.length} ` +
        `via=${sel.viaIds.length} zone=${sel.zoneIds.length}`);
    tracePcb('VIEW2D_SUMMARY', `fpInView=${inView} fpOutView=${outView} hiddenLayersWithCu=${hiddenWithContent} ` +
        `zeroLenTrk=${zeroLen} shortTrk=${shortTrk} noNetTrk=${noNetTrk} ` +
        `fp=${doc.footprints.length} trk=${doc.tracks.length} via=${doc.vias.length} ` +
        `rats=${p.ratsnestCount} drc=${p.drcCount}`);
    Logger.info(INSTR_TRACE_TAG, `[PCB] ---------- VIEW2D AUDIT END ----------`);
}
/** 3D 预览展示审计入参 */
export interface PcbView3dTraceParams {
    viewWidth: number;
    viewHeight: number;
    zoom: number;
    panX: number;
    panY: number;
    yawDeg: number;
    pitchDeg: number;
    ortho: boolean;
    displayMode: string;
    usePbr: boolean;
    msaa: number;
    cutFraction: number;
    measure: boolean;
    showInterference: boolean;
    highlightNetId: string;
    selectedFpIds: string[];
    selectedTrackIds: string[];
    selectedViaIds: string[];
    /** 活动铜层 */
    activeLayer?: string;
    /** overlay | active_only | dim_inactive */
    appearanceMode?: string;
    hideZones?: boolean;
    dimAlpha?: number;
}
/**
 * 3D UI 展示审计：相机、层色/显隐、单层过滤、铺铜/走线/过孔、颜色是否会画出来
 */
export function tracePcbView3dAudit(doc: PcbDocument, p: PcbView3dTraceParams, reason: string, force: boolean): void {
    const now = Date.now();
    if (!force && now - gLastView3dTraceMs < 2800) {
        return;
    }
    gLastView3dTraceMs = now;
    Logger.info(INSTR_TRACE_TAG, `[PCB] ---------- VIEW3D AUDIT (${reason}) ----------`);
    const cuN = doc.layerStack !== undefined ? doc.layerStack.copperCount : 2;
    const boardH = cuN <= 2 ? 56 : (cuN <= 4 ? 72 : (cuN <= 6 ? 96 : 120));
    const activeLy = p.activeLayer !== undefined && p.activeLayer.length > 0 ? p.activeLayer : '-';
    const apMode = p.appearanceMode !== undefined && p.appearanceMode.length > 0
        ? p.appearanceMode : 'overlay';
    const hideZones = p.hideZones === true;
    const dimA = p.dimAlpha !== undefined ? p.dimAlpha : 0.28;
    tracePcb3d('VIEW3D_UI', `view=${Math.round(p.viewWidth)}x${Math.round(p.viewHeight)} ` +
        `zoom=${p.zoom.toFixed(4)} pan=(${Math.round(p.panX)},${Math.round(p.panY)}) ` +
        `yaw=${p.yawDeg.toFixed(1)} pitch=${p.pitchDeg.toFixed(1)} ortho=${p.ortho} ` +
        `mode=${p.displayMode} pbr=${p.usePbr} msaa=${p.msaa} cut=${p.cutFraction.toFixed(2)} ` +
        `meas=${p.measure} interf=${p.showInterference} hlNet=${p.highlightNetId || '-'} ` +
        `selFp=${p.selectedFpIds.length} selTrk=${p.selectedTrackIds.length} selVia=${p.selectedViaIds.length} ` +
        `cuLayers=${cuN} boardH=${boardH}`);
    tracePcb3d('VIEW3D_FOCUS', `appearanceMode=${apMode} activeLayer=${activeLy} hideZones=${hideZones} dimAlpha=${dimA.toFixed(2)} ` +
        `→ ACTIVE_ONLY时只画 active 铜层；OVERLAY 应全铜层分色可见`);
    if (!(p.pitchDeg >= 8 && p.pitchDeg <= 88)) {
        tracePcbWarn('VIEW3D_CAMERA', `pitch=${p.pitchDeg} 异常，应在 8~88`);
    }
    if (!(p.zoom > 0.01 && p.zoom < 50)) {
        tracePcbWarn('VIEW3D_CAMERA', `zoom=${p.zoom} 异常`);
    }
    // 图层配置：颜色/显隐/透明度（颜色不显示时先查这里）
    for (let i = 0; i < doc.layers.length; i++) {
        const ly = doc.layers[i];
        const idStr = `${ly.id}`;
        // Edge.Cuts 含 ".Cu" 子串，不能用 indexOf('.Cu')
        const isCu = idStr.endsWith('.Cu') || idStr.indexOf('_CU') >= 0;
        if (!isCu && idStr.indexOf('Silk') < 0 && idStr.indexOf('Edge') < 0)
            continue;
        const op = ly.opacity !== undefined ? ly.opacity : 1;
        const focusPass = apMode !== 'active_only' || !isCu || idStr === activeLy;
        tracePcb3d('VIEW3D_LAYER_CFG', `${ly.id} name=${ly.name} visible=${ly.visible} color=${ly.color} opacity=${op.toFixed(2)} ` +
            `focusPass=${focusPass} isCu=${isCu}`);
        if (isCu && (!ly.color || ly.color.length < 4)) {
            tracePcbWarn('VIEW3D_COLOR', `${ly.id} color 无效: "${ly.color}"`);
        }
        if (isCu && op < 0.2) {
            tracePcbWarn('VIEW3D_COLOR', `${ly.id} opacity过低=${op.toFixed(2)} 可能导致几乎看不见`);
        }
        if (isCu && apMode === 'active_only' && idStr !== activeLy) {
            tracePcb3d('VIEW3D_SKIP', `${ly.id} 被 ACTIVE_ONLY 过滤 (active=${activeLy})`);
        }
    }
    // 铜层走线高度分布
    const byLayer: Map<string, number> = new Map();
    for (let i = 0; i < doc.tracks.length; i++) {
        const ly = `${doc.tracks[i].layer}`;
        byLayer.set(ly, (byLayer.get(ly) ?? 0) + 1);
    }
    byLayer.forEach((cnt: number, ly: string) => {
        const isBot = ly.indexOf('B.Cu') >= 0 || ly.indexOf('B_CU') >= 0;
        const z = isBot ? boardH * 0.06 :
            (ly.indexOf('F.Cu') >= 0 || ly.indexOf('F_CU') >= 0 ? boardH : boardH * 0.5);
        const focusPass = apMode !== 'active_only' || ly === activeLy;
        tracePcb3d('VIEW3D_CU_LAYER', `layer=${ly} tracks=${cnt} approxZ=${z.toFixed(1)} focusPass=${focusPass} ` +
            `side=${isBot ? 'bottom' : 'top'}`);
    });
    if (byLayer.size === 0) {
        tracePcbWarn('VIEW3D_CU_LAYER', '文档无任何 tracks');
    }
    // 铺铜详情（过孔后第二层常见为 B.Cu zone）
    let zoneBot = 0;
    let zoneTop = 0;
    for (let i = 0; i < doc.zones.length; i++) {
        const zn = doc.zones[i];
        const ly = `${zn.layer}`;
        const isBot = ly.indexOf('B.Cu') >= 0 || ly.indexOf('B_CU') >= 0;
        if (isBot)
            zoneBot++;
        else
            zoneTop++;
        const focusPass = apMode !== 'active_only' || ly === activeLy;
        const cuts = zn.cutouts !== undefined ? zn.cutouts.length : 0;
        let layerColor = '';
        for (let li = 0; li < doc.layers.length; li++) {
            if (`${doc.layers[li].id}` === ly) {
                layerColor = doc.layers[li].color;
                break;
            }
        }
        const drawOk = !hideZones && focusPass && zn.outline.length >= 3;
        tracePcb3d('VIEW3D_ZONE_DETAIL', `id=${zn.id} layer=${ly} net=${zn.netName || zn.netId || '-'} ` +
            `outline=${zn.outline.length} cutouts=${cuts} thermal=${zn.thermalRelief === true} ` +
            `color=${layerColor || '(fallback)'} focusPass=${focusPass} hideZones=${hideZones} ` +
            `willDraw=${drawOk} side=${isBot ? 'bottom' : 'top'}`);
        if (isBot && !drawOk) {
            tracePcbWarn('VIEW3D_ZONE', `B.Cu 铺铜不会绘制: hideZones=${hideZones} focusPass=${focusPass} ` +
                `outline=${zn.outline.length} active=${activeLy} mode=${apMode}`);
        }
    }
    if (doc.zones.length === 0) {
        tracePcbWarn('VIEW3D_ZONE', '文档无 zones — 过孔后若无 B.Cu 走线则底层无铜可显示');
    }
    else {
        tracePcb3d('VIEW3D_ZONE', `count=${doc.zones.length} bottom=${zoneBot} top=${zoneTop}`);
    }
    let bottomFp = 0;
    let topFp = 0;
    for (let i = 0; i < doc.footprints.length; i++) {
        const fp = doc.footprints[i];
        const zBase = fp.layer === PcbLayerId.B_CU ? -1 : boardH + 1;
        if (fp.layer === PcbLayerId.B_CU)
            bottomFp++;
        else
            topFp++;
        let selected = false;
        for (let s = 0; s < p.selectedFpIds.length; s++) {
            if (p.selectedFpIds[s] === fp.id) {
                selected = true;
                break;
            }
        }
        let bound = 0;
        for (let pi = 0; pi < fp.pads.length; pi++) {
            if (fp.pads[pi].netId !== undefined && (fp.pads[pi].netId as string).length > 0)
                bound++;
        }
        const he = fpApproxHalf(fp);
        tracePcb3d('VIEW3D_FP', `${fp.refDes} def=${fp.defId} pos=(${Math.round(fp.position.x)},${Math.round(fp.position.y)}) ` +
            `zBase=${zBase.toFixed(1)} rot=${fp.rotation} mir=${fp.mirrored} layer=${fp.layer} ` +
            `half≈${Math.round(he.x)}x${Math.round(he.y)} pads=${fp.pads.length} bound=${bound} ` +
            `sel=${selected} value=${fp.value}`);
    }
    for (let i = 0; i < doc.tracks.length && i < 40; i++) {
        const t = doc.tracks[i];
        const len = Math.hypot(t.end.x - t.start.x, t.end.y - t.start.y);
        const ly = `${t.layer}`;
        const focusPass = apMode !== 'active_only' || ly === activeLy;
        tracePcb3d('VIEW3D_TRACK', `net=${t.netName || t.netId || '-'} layer=${t.layer} len=${len.toFixed(1)} w=${t.width} ` +
            `focusPass=${focusPass} ` +
            `(${Math.round(t.start.x)},${Math.round(t.start.y)})→(${Math.round(t.end.x)},${Math.round(t.end.y)})`);
    }
    if (doc.tracks.length > 40) {
        tracePcb3d('VIEW3D_TRACK', `...+${doc.tracks.length - 40}`);
    }
    for (let i = 0; i < doc.vias.length && i < 30; i++) {
        const v = doc.vias[i];
        const zBot = boardH * 0.06;
        let layersStr = '';
        if (v.layers !== undefined) {
            for (let li = 0; li < v.layers.length; li++) {
                if (li > 0)
                    layersStr += ',';
                layersStr += `${v.layers[li]}`;
            }
        }
        const spansActive = layersStr.length === 0 || layersStr.indexOf(activeLy) >= 0 ||
            (layersStr.indexOf('F.Cu') >= 0 && layersStr.indexOf('B.Cu') >= 0);
        const viaDraw = apMode !== 'active_only' || spansActive;
        tracePcb3d('VIEW3D_VIA', `pos=(${Math.round(v.position.x)},${Math.round(v.position.y)}) ` +
            `net=${v.netName || v.netId || '-'} drill=${v.drill} dia=${v.diameter} ` +
            `kind=${v.kind ?? 'through'} layers=[${layersStr}] z=${zBot.toFixed(0)}..${boardH} ` +
            `willDraw=${viaDraw}`);
    }
    // 诊断结论
    const hasBotTrk = (byLayer.get('B.Cu') ?? byLayer.get(PcbLayerId.B_CU) ?? 0) > 0;
    if (zoneBot > 0 && !hasBotTrk) {
        tracePcb3d('VIEW3D_DIAG', `底层连接依赖 B.Cu 铺铜(zones=${zoneBot}) 而非走线；若看不到绿色铺铜，检查 hideZones/ACTIVE_ONLY/opacity/板透明度`);
    }
    if (apMode === 'active_only' && activeLy.indexOf('F.Cu') >= 0 && zoneBot > 0) {
        tracePcbWarn('VIEW3D_DIAG', `当前 ACTIVE_ONLY=F.Cu，B.Cu 铺铜被过滤 — 点左栏 B.Cu 或「全部」才能看到过孔后底层`);
    }
    if (p.usePbr) {
        tracePcbWarn('VIEW3D_DIAG', `usePbr=true 走 Z-Buffer 轻量路径，铺铜/分色可能不完整；可关 PBR 用写实 Canvas 路径排查颜色`);
    }
    let interf = 0;
    for (let i = 0; i < doc.footprints.length; i++) {
        const a = doc.footprints[i];
        if (/^H\d+$/.test(a.refDes))
            continue;
        const ae = fpApproxHalf(a);
        for (let j = i + 1; j < doc.footprints.length; j++) {
            const b = doc.footprints[j];
            if (/^H\d+$/.test(b.refDes) || a.layer !== b.layer)
                continue;
            const be = fpApproxHalf(b);
            const dx = Math.abs(a.position.x - b.position.x);
            const dy = Math.abs(a.position.y - b.position.y);
            if (dx < ae.x + be.x + 8 && dy < ae.y + be.y + 8) {
                interf++;
                if (interf <= 20) {
                    tracePcbWarn('VIEW3D_INTERF', `${a.refDes} × ${b.refDes} 可能干涉 (showOverlay=${p.showInterference})`);
                }
            }
        }
    }
    tracePcb3d('VIEW3D_SUMMARY', `topFp=${topFp} bottomFp=${bottomFp} interf≈${interf} ` +
        `fp=${doc.footprints.length} trk=${doc.tracks.length} via=${doc.vias.length} ` +
        `zoneBot=${zoneBot} zoneTop=${zoneTop} ` +
        `pbr=${p.usePbr} mode=${p.displayMode} focus=${apMode}/${activeLy}`);
    Logger.info(INSTR_TRACE_TAG, `[PCB] ---------- VIEW3D AUDIT END ----------`);
}
/**
 * 一键：把当前 2D 或 3D 展示 + 连接/拥挤 全量写入 instr_trace
 * is3d=true 时用 view3d；否则用 view2d（传 null 表示跳过对应视图审计）
 */
export function tracePcbDisplayDump(doc: PcbDocument, reason: string, canvas: PcbCanvasTraceSnapshot, is3d: boolean, view2d: PcbView2dTraceParams | null, view3d: PcbView3dTraceParams | null): void {
    Logger.info(INSTR_TRACE_TAG, `[PCB] ########## DISPLAY DUMP START (${reason}) ##########`);
    tracePcbFullState(doc, reason, canvas);
    if (is3d) {
        if (view3d !== null) {
            tracePcbView3dAudit(doc, view3d, reason, true);
        }
    }
    else {
        if (view2d !== null) {
            tracePcbView2dAudit(doc, view2d, reason, true);
        }
    }
    Logger.info(INSTR_TRACE_TAG, `[PCB] ########## DISPLAY DUMP END (${reason}) ##########`);
}
