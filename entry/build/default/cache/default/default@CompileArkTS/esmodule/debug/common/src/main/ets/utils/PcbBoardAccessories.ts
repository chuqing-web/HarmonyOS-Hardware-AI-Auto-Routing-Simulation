import type { Point2D, Net } from '../types/CommonTypes';
import type { PcbDocument, PcbFootprintInst, PcbNet } from '../types/PcbTypes';
import { getGlobalPcbFootprintLibrary } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbFootprintLibrary";
import type { PcbFootprintLibrary } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbFootprintLibrary";
import { rebuildPcbNets } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbNetUtil";
import { tracePcb } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbTraceLog";
/** 原理图网络提示（可不在板上已有焊盘） */
export interface AccessoryNetHint {
    id: string;
    name: string;
    /** 原理图该网上的引脚数；0 表示空网（如残留 VEE），不强制占针 */
    schPinCount: number;
}
export interface BoardAccessoriesResult {
    message: string;
    addedNew: boolean;
    connectorNetIds: string[];
}
function isGndNetName(name: string): boolean {
    const n = name.toUpperCase();
    return n === 'GND' || n === 'VSS' || n === 'AGND' || n === '0';
}
function isVccNetName(name: string): boolean {
    const n = name.toUpperCase();
    return n === 'VCC' || n === 'VDD' || n.indexOf('VCC') === 0 || n.indexOf('VDD') === 0 ||
        n === 'VIN' || n === 'VIN_SRC' || (n.indexOf('VIN') === 0 && n.indexOf('VAC') < 0);
}
function isVeeNetName(name: string): boolean {
    const n = name.toUpperCase();
    return n === 'VEE' || n === 'V-' || n.indexOf('VEE') === 0;
}
/** 交流电源或信号源外接网 */
function isVacOrSigNetName(name: string): boolean {
    const n = name.toUpperCase();
    if (isGndNetName(n) || isVccNetName(n) || isVeeNetName(n)) {
        return false;
    }
    return n === 'VAC' || n.indexOf('VAC') === 0 || n === 'AC' || n === 'VAC_AC' ||
        n === 'SIG' || n === 'SIGNAL' || n.indexOf('SIG_') === 0 || n.indexOf('SIGNAL') === 0 ||
        n === 'SRC' || n === 'WAVE' || n === 'SIN' || n === 'AIN' || n === 'SIG_OUT' ||
        n === 'OUT' || n === 'SG_OUT' || n.indexOf('SIGGEN') === 0;
}
interface NetPadStat {
    netId: string;
    netName: string;
    count: number;
    schPinCount: number;
}
function collectNetPadStats(doc: PcbDocument): NetPadStat[] {
    const map: Map<string, NetPadStat> = new Map();
    for (const fp of doc.footprints) {
        for (const pad of fp.pads) {
            const nid = pad.netId ?? '';
            if (nid.length === 0) {
                continue;
            }
            const nm = pad.netName ?? nid;
            let st = map.get(nid);
            if (!st) {
                st = { netId: nid, netName: nm, count: 0, schPinCount: 0 };
                map.set(nid, st);
            }
            st.count++;
            if (pad.netName && pad.netName.length > 0) {
                st.netName = pad.netName;
            }
        }
    }
    const out: NetPadStat[] = [];
    map.forEach((v: NetPadStat) => {
        out.push(v);
    });
    return out;
}
/** 合并板上焊盘统计 + 原理图网络提示（板盘为 0 也可占针） */
function mergeNetPool(padStats: NetPadStat[], hints: AccessoryNetHint[]): NetPadStat[] {
    const map: Map<string, NetPadStat> = new Map();
    for (const s of padStats) {
        map.set(s.netId, {
            netId: s.netId, netName: s.netName, count: s.count, schPinCount: s.schPinCount
        });
    }
    for (const h of hints) {
        if (!h.id || h.id.length === 0) {
            continue;
        }
        const nm = h.name && h.name.length > 0 ? h.name : h.id;
        const existing = map.get(h.id);
        if (existing) {
            if (nm.length > 0) {
                existing.netName = nm;
            }
            existing.schPinCount = Math.max(existing.schPinCount, h.schPinCount);
        }
        else {
            map.set(h.id, {
                netId: h.id, netName: nm, count: 0, schPinCount: h.schPinCount
            });
        }
    }
    const out: NetPadStat[] = [];
    map.forEach((v: NetPadStat) => {
        out.push(v);
    });
    return out;
}
function takeNet(pool: NetPadStat[], used: Set<string>, pred: (name: string) => boolean, allowEmptySch: boolean = true): NetPadStat | null {
    for (const s of pool) {
        if (used.has(s.netId)) {
            continue;
        }
        if (!pred(s.netName)) {
            continue;
        }
        // VEE/VAC/SIG：板上无焊盘且原理图也无引脚 → 空壳网，跳过
        if (!allowEmptySch && s.count <= 0 && s.schPinCount <= 0) {
            continue;
        }
        used.add(s.netId);
        return s;
    }
    return null;
}
/**
 * 教学板固定前 4 针：GND | VCC | VEE | VAC/SIG，其后为其余网（孤儿优先）。
 * GND/VCC 可强制占针；VEE/VAC/SIG 仅在原理图有引脚或板上已有焊盘时占针。
 */
function buildPinAssignment(pool: NetPadStat[]): NetPadStat[] {
    const used: Set<string> = new Set();
    const pins: NetPadStat[] = [];
    const gnd = takeNet(pool, used, isGndNetName, true);
    const vcc = takeNet(pool, used, isVccNetName, true);
    const vee = takeNet(pool, used, isVeeNetName, false);
    const vacSig = takeNet(pool, used, isVacOrSigNetName, false);
    if (gnd) {
        pins.push(gnd);
    }
    if (vcc) {
        pins.push(vcc);
    }
    if (vee) {
        pins.push(vee);
    }
    if (vacSig) {
        pins.push(vacSig);
    }
    const fillers: NetPadStat[] = [];
    for (const s of pool) {
        if (used.has(s.netId)) {
            continue;
        }
        // 空壳网不占其余针脚
        if (s.count <= 0 && s.schPinCount <= 0) {
            continue;
        }
        fillers.push(s);
    }
    fillers.sort((a: NetPadStat, b: NetPadStat) => {
        if (a.count !== b.count) {
            return a.count - b.count;
        }
        return a.netName.localeCompare(b.netName);
    });
    for (const f of fillers) {
        pins.push(f);
    }
    return pins;
}
function boardExtents(doc: PcbDocument): Point2D {
    let maxX = 800;
    let maxY = 600;
    const pts = doc.boardOutline?.points ?? [];
    for (const p of pts) {
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    }
    for (const fp of doc.footprints) {
        maxX = Math.max(maxX, fp.position.x + 120);
        maxY = Math.max(maxY, fp.position.y + 120);
    }
    return { x: maxX, y: maxY };
}
function hasRef(doc: PcbDocument, ref: string): boolean {
    for (const fp of doc.footprints) {
        if (fp.refDes === ref) {
            return true;
        }
    }
    return false;
}
function pickHeaderDefId(pinNeed: number): string {
    if (pinNeed >= 7) {
        return 'FP_PINHDR_8';
    }
    if (pinNeed >= 5) {
        return 'FP_PINHDR_6';
    }
    return 'FP_PINHDR_4';
}
function pinCountFromDef(defId: string): number {
    if (defId.indexOf('_8') >= 0) {
        return 8;
    }
    if (defId.indexOf('_6') >= 0) {
        return 6;
    }
    return 4;
}
function isMountRef(ref: string): boolean {
    if (ref.length < 2 || ref.charAt(0) !== 'H') {
        return false;
    }
    for (let i = 1; i < ref.length; i++) {
        const c = ref.charCodeAt(i);
        if (c < 48 || c > 57) {
            return false;
        }
    }
    return true;
}
function collectConnectorNetIds(doc: PcbDocument): string[] {
    const ids: Set<string> = new Set();
    for (const fp of doc.footprints) {
        if (fp.refDes !== 'J1' && !isMountRef(fp.refDes)) {
            continue;
        }
        for (const pad of fp.pads) {
            if (pad.netId && pad.netId.length > 0) {
                ids.add(pad.netId);
            }
        }
    }
    const out: string[] = [];
    ids.forEach((id: string) => {
        out.push(id);
    });
    return out;
}
function bindHeaderPadsFixed(hdr: PcbFootprintInst, assignment: NetPadStat[]): void {
    for (let i = 0; i < hdr.pads.length; i++) {
        if (i < assignment.length) {
            hdr.pads[i].netId = assignment[i].netId;
            hdr.pads[i].netName = assignment[i].netName;
        }
    }
}
function findGndInAssignment(assignment: NetPadStat[]): NetPadStat | null {
    for (const s of assignment) {
        if (isGndNetName(s.netName)) {
            return s;
        }
    }
    return null;
}
/**
 * 确保板上有 J1 排针与角孔。
 * @param schNets 原理图网络（可含板上网盘为 0 的 VEE/VAC/SIG）
 */
export function ensureBoardAccessories(doc: PcbDocument, lib?: PcbFootprintLibrary, schNets?: AccessoryNetHint[]): BoardAccessoriesResult {
    const empty: BoardAccessoriesResult = { message: '', addedNew: false, connectorNetIds: [] };
    const library = lib ?? getGlobalPcbFootprintLibrary();
    rebuildPcbNets(doc);
    const hints: AccessoryNetHint[] = schNets ?? [];
    // 无原理图提示时，用已重建的 PCB nets 作弱提示
    if (hints.length === 0) {
        for (const n of doc.nets) {
            hints.push({ id: n.id, name: n.name, schPinCount: 0 });
        }
    }
    const padStats = collectNetPadStats(doc);
    const pool = mergeNetPool(padStats, hints);
    if (pool.length === 0) {
        return empty;
    }
    const assignment = buildPinAssignment(pool);
    if (assignment.length === 0) {
        return empty;
    }
    const gnd = findGndInAssignment(assignment);
    // 至少 4 针保留教学轨位；按需加大
    const pinNeed = Math.max(4, assignment.length);
    const defId = pickHeaderDefId(pinNeed);
    const pins = pinCountFromDef(defId);
    let created = 0;
    let ext = boardExtents(doc);
    const hdrHalfH = ((pins - 1) * 100) / 2 + 50;
    const reserve = 320;
    const holeInset = 20;
    const hadJ1 = hasRef(doc, 'J1');
    if (!hadJ1) {
        ext = { x: ext.x + reserve, y: Math.max(ext.y, Math.max(900, hdrHalfH * 2 + 400)) };
        doc.boardOutline.points = [
            { x: 0, y: 0 }, { x: ext.x, y: 0 }, { x: ext.x, y: ext.y }, { x: 0, y: ext.y }
        ];
        const hdrX = ext.x - 160;
        const hdrY = Math.min(Math.max(ext.y / 2, holeInset + hdrHalfH + 80), ext.y - holeInset - hdrHalfH - 80);
        const hdr = library.instantiate(defId, 'J1', `1x${pins}`, { x: hdrX, y: hdrY }, 0);
        if (hdr) {
            bindHeaderPadsFixed(hdr, assignment);
            doc.footprints.push(hdr);
            created++;
        }
        const holePositions: Point2D[] = [
            { x: holeInset, y: holeInset },
            { x: ext.x - holeInset, y: holeInset },
            { x: holeInset, y: ext.y - holeInset },
            { x: ext.x - holeInset, y: ext.y - holeInset }
        ];
        let hi = 1;
        for (const hp of holePositions) {
            const href = `H${hi}`;
            if (hasRef(doc, href)) {
                hi++;
                continue;
            }
            let clash = false;
            for (const fp of doc.footprints) {
                if (fp.refDes === 'J1') {
                    continue;
                }
                if (Math.abs(fp.position.x - hp.x) < 100 && Math.abs(fp.position.y - hp.y) < 100) {
                    clash = true;
                    break;
                }
            }
            if (clash) {
                hi++;
                continue;
            }
            const hole = library.instantiate('FP_MOUNT', href, 'MH', hp, 0);
            if (hole) {
                if (gnd) {
                    for (const pad of hole.pads) {
                        pad.netId = gnd.netId;
                        pad.netName = gnd.netName;
                    }
                }
                doc.footprints.push(hole);
                created++;
            }
            hi++;
        }
    }
    else {
        for (const fp of doc.footprints) {
            if (fp.refDes === 'J1') {
                bindHeaderPadsFixed(fp, assignment);
                break;
            }
        }
        for (const fp of doc.footprints) {
            if (!isMountRef(fp.refDes) || !gnd) {
                continue;
            }
            for (const pad of fp.pads) {
                pad.netId = gnd.netId;
                pad.netName = gnd.netName;
            }
        }
    }
    // 旧版 FP_MOUNT（焊盘直径 160）会溢出板框；统一按紧凑定义刷新几何
    for (const fp of doc.footprints) {
        if (fp.defId !== 'FP_MOUNT') {
            continue;
        }
        library.resyncPadsFromDef(fp, 'FP_MOUNT');
        if (gnd) {
            for (const pad of fp.pads) {
                pad.netId = gnd.netId;
                pad.netName = gnd.netName;
            }
        }
    }
    rebuildPcbNets(doc);
    const connectorNetIds = collectConnectorNetIds(doc);
    const addedNew = created > 0;
    let message = '';
    if (addedNew || assignment.length > 0) {
        const railParts: string[] = [];
        for (let i = 0; i < Math.min(assignment.length, 4); i++) {
            railParts.push(`P${i + 1}=${assignment[i].netName}`);
        }
        if (addedNew) {
            message = `已添加板边外接 J1/安装孔 ${created} 件（${railParts.join(' | ')}）`;
        }
        tracePcb('BOARD_ACCESSORIES', `added=${created} J1=${defId} rails=[${railParts.join(',')}] totalPins=${assignment.length}`);
    }
    const result: BoardAccessoriesResult = {
        message: message,
        addedNew: addedNew,
        connectorNetIds: connectorNetIds
    };
    return result;
}
export function clearCopperForNets(doc: PcbDocument, netIds: string[]): number {
    if (netIds.length === 0) {
        return 0;
    }
    const set: Set<string> = new Set(netIds);
    const before = doc.tracks.length + doc.vias.length;
    doc.tracks = doc.tracks.filter((t) => !set.has(t.netId));
    doc.vias = doc.vias.filter((v) => !set.has(v.netId));
    return before - doc.tracks.length - doc.vias.length;
}
export function findDocGndNet(doc: PcbDocument): PcbNet | null {
    for (const n of doc.nets) {
        if (isGndNetName(n.name)) {
            return n;
        }
    }
    return null;
}
/** 从原理图 nets 提取配件提示 */
export function accessoryHintsFromSchematicNets(nets: Net[] | null | undefined): AccessoryNetHint[] {
    const out: AccessoryNetHint[] = [];
    if (!nets) {
        return out;
    }
    for (const n of nets) {
        if (!n.id || n.id.length === 0) {
            continue;
        }
        const pinIds = n.pinIds;
        const schPinCount = pinIds !== undefined ? pinIds.length : 0;
        out.push({ id: n.id, name: n.name ?? '', schPinCount: schPinCount });
    }
    return out;
}
