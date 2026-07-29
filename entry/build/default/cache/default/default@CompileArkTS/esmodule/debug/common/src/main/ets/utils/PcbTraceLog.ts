import { Logger } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/Logger";
import { INSTR_TRACE_TAG } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/InstrumentTraceLog";
import type { SchematicDocument, ComponentInstance } from '../types/CommonTypes';
import type { PcbDocument, PcbFootprintInst, PcbLayerId, PcbTrack } from '../types/PcbTypes';
import { parsePinRef } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PinRefUtil";
import { getGlobalPcbFootprintLibrary } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbFootprintLibrary";
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
/** 各网络焊盘数 / 是否已有走线 */
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
    let singlePad = 0;
    let unrouted = 0;
    let routed = 0;
    padCountByNet.forEach((cnt: number, nid: string) => {
        const nm = netNameById.get(nid) ?? nid;
        const upper = nm.toUpperCase();
        if (upper === 'GND' || upper === 'VSS' || upper === 'VCC' || upper === 'VDD') {
            return;
        }
        if (cnt < 2) {
            singlePad++;
            tracePcbWarn('NET_SINGLE_PAD', `${nm} pads=${cnt} — 无法链式自动布线`);
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
    tracePcb('NET_SUMMARY', `routed=${routed} unrouted=${unrouted} singlePad=${singlePad}`);
}
