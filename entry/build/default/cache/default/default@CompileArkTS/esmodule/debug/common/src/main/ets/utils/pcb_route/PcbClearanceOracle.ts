import { PcbLayerId, PcbPadType } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/PcbTypes";
import type { PcbDocument, PcbFootprintInst, PcbPad, PcbTrack, PcbVia } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/PcbTypes";
import type { Point2D } from '../../types/CommonTypes';
import { findNetClass } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbNetUtil";
import { padWorldPosition } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbZoneUtil";
import { WireConflictGeometry } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/WireConflictGeometry";
import { getGlobalPcbFootprintLibrary } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbFootprintLibrary";
interface KeepoutAabb {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}
/** 矩形焊盘障碍半径：半长边（比外接圆松，便于 QFP 邻脚出线） */
function padObstacleRadius(pad: PcbPad): number {
    return Math.max(pad.size.x, pad.size.y) * 0.5;
}
/** SMD 仅挡其铜层；通孔镀孔挡所有铜层 */
function padBlocksTrackOnLayer(pad: PcbPad, layer: PcbLayerId): boolean {
    if (pad.type !== PcbPadType.SMD) {
        return true;
    }
    if (pad.layers && pad.layers.length > 0) {
        return pad.layers.indexOf(layer) >= 0;
    }
    return layer === PcbLayerId.F_CU;
}
/** via 与焊盘铜是否相交（SMD 看层叠交集；通孔一律挡） */
function padBlocksViaLayers(pad: PcbPad, viaLayers: PcbLayerId[]): boolean {
    if (pad.type !== PcbPadType.SMD) {
        return true;
    }
    for (let i = 0; i < viaLayers.length; i++) {
        if (padBlocksTrackOnLayer(pad, viaLayers[i])) {
            return true;
        }
    }
    return false;
}
/**
 * 与编辑器选中区一致：局部焊盘+courtyard 半宽高 → 旋转后世界 AABB。
 * 供 F.Cu/B.Cu 本体禁入与通道预筛共用。
 */
export function footprintSelectionAabb(fp: PcbFootprintInst): KeepoutAabb {
    let hw = 20;
    let hh = 20;
    for (let i = 0; i < fp.pads.length; i++) {
        const pad = fp.pads[i];
        hw = Math.max(hw, Math.abs(pad.pos.x) + pad.size.x * 0.5);
        hh = Math.max(hh, Math.abs(pad.pos.y) + pad.size.y * 0.5);
    }
    const def = getGlobalPcbFootprintLibrary().getDef(fp.defId);
    if (def !== null && def.courtyard.length >= 2) {
        for (let i = 0; i < def.courtyard.length; i++) {
            const pt = def.courtyard[i];
            hw = Math.max(hw, Math.abs(pt.x));
            hh = Math.max(hh, Math.abs(pt.y));
        }
    }
    if (fp.rotation === 90 || fp.rotation === 270) {
        const t = hw;
        hw = hh;
        hh = t;
    }
    const box: KeepoutAabb = {
        x1: fp.position.x - hw,
        y1: fp.position.y - hh,
        x2: fp.position.x + hw,
        y2: fp.position.y + hh
    };
    return box;
}
/** 外层铜才挡封装本体（与 fp.layer 同侧） */
function layerNeedsFootprintBodyKeepout(layer: PcbLayerId, fp: PcbFootprintInst): boolean {
    if (layer === PcbLayerId.F_CU) {
        return fp.layer !== PcbLayerId.B_CU;
    }
    if (layer === PcbLayerId.B_CU) {
        return fp.layer === PcbLayerId.B_CU;
    }
    return false;
}
/** Liang–Barsky：线段落在 AABB 内的长度；不相交返回 0 */
function segLengthInsideAabb(a: Point2D, b: Point2D, box: KeepoutAabb, inflate: number): number {
    const x1 = box.x1 - inflate;
    const y1 = box.y1 - inflate;
    const x2 = box.x2 + inflate;
    const y2 = box.y2 + inflate;
    let t0 = 0;
    let t1 = 1;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const clip = (p: number, q: number): boolean => {
        if (Math.abs(p) < 1e-12) {
            return q >= 0;
        }
        const r = q / p;
        if (p < 0) {
            if (r > t1) {
                return false;
            }
            if (r > t0) {
                t0 = r;
            }
        }
        else {
            if (r < t0) {
                return false;
            }
            if (r < t1) {
                t1 = r;
            }
        }
        return true;
    };
    if (!clip(-dx, a.x - x1) || !clip(dx, x2 - a.x) ||
        !clip(-dy, a.y - y1) || !clip(dy, y2 - a.y)) {
        return 0;
    }
    if (t1 < t0) {
        return 0;
    }
    return Math.sqrt(dx * dx + dy * dy) * (t1 - t0);
}
function fpSameNetPadNear(fp: PcbFootprintInst, netId: string, pt: Point2D, thr: number): boolean {
    if (netId.length === 0) {
        return false;
    }
    for (let i = 0; i < fp.pads.length; i++) {
        const pad = fp.pads[i];
        const pNet = pad.netId ?? '';
        if (pNet !== netId) {
            continue;
        }
        const pos = padWorldPosition(fp, pad);
        const dx = pos.x - pt.x;
        const dy = pos.y - pt.y;
        if (Math.sqrt(dx * dx + dy * dy) <= thr) {
            return true;
        }
    }
    return false;
}
function distPointSeg(p: Point2D, a: Point2D, b: Point2D): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-9) {
        const ex = p.x - a.x;
        const ey = p.y - a.y;
        return Math.sqrt(ex * ex + ey * ey);
    }
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    if (t < 0) {
        t = 0;
    }
    else if (t > 1) {
        t = 1;
    }
    const qx = a.x + t * dx;
    const qy = a.y + t * dy;
    const ex = p.x - qx;
    const ey = p.y - qy;
    return Math.sqrt(ex * ex + ey * ey);
}
function segClearance(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): number {
    return Math.min(distPointSeg(a1, b1, b2), distPointSeg(a2, b1, b2), distPointSeg(b1, a1, a2), distPointSeg(b2, a1, a2));
}
export function clearanceForNet(doc: PcbDocument, netId: string): number {
    const base = doc.metadata.designRules.minClearance;
    if (netId.length === 0) {
        return base;
    }
    for (const n of doc.nets) {
        if (n.id === netId) {
            return findNetClass(doc, n.classId).clearance;
        }
    }
    return base;
}
export function trackWidthForNet(doc: PcbDocument, netId: string): number {
    const base = doc.metadata.designRules.defaultTrackWidth;
    if (netId.length === 0) {
        return base;
    }
    for (const n of doc.nets) {
        if (n.id === netId) {
            return findNetClass(doc, n.classId).trackWidth;
        }
    }
    return base;
}
function viaOnLayer(v: PcbVia, layer: PcbLayerId): boolean {
    if (!v.layers || v.layers.length === 0) {
        return true;
    }
    return v.layers.indexOf(layer) >= 0;
}
/** 板边禁入带（mil）：走线中段不得贴板框，端点在禁带内（排针出线）可豁免 */
const BOARD_EDGE_KEEP_MIL = 75;
function boardOutlineBounds(doc: PcbDocument): KeepoutAabb | null {
    const pts = doc.boardOutline?.points ?? [];
    if (pts.length < 2) {
        return null;
    }
    let x1 = pts[0].x;
    let y1 = pts[0].y;
    let x2 = pts[0].x;
    let y2 = pts[0].y;
    for (let i = 1; i < pts.length; i++) {
        if (pts[i].x < x1) {
            x1 = pts[i].x;
        }
        if (pts[i].y < y1) {
            y1 = pts[i].y;
        }
        if (pts[i].x > x2) {
            x2 = pts[i].x;
        }
        if (pts[i].y > y2) {
            y2 = pts[i].y;
        }
    }
    const out: KeepoutAabb = { x1: x1, y1: y1, x2: x2, y2: y2 };
    return out;
}
function distToBoardEdge(p: Point2D, box: KeepoutAabb): number {
    return Math.min(p.x - box.x1, box.x2 - p.x, p.y - box.y1, box.y2 - p.y);
}
/**
 * 走线贴边硬拒：中段采样点进入板边禁带则阻挡。
 * 两端都已在禁带内（如 J1 焊盘区）允许短距出线。
 */
function boardEdgeKeepoutReason(doc: PcbDocument, a: Point2D, b: Point2D): string | null {
    const box = boardOutlineBounds(doc);
    if (box === null) {
        return null;
    }
    const keep = BOARD_EDGE_KEEP_MIL;
    const da = distToBoardEdge(a, box);
    const db = distToBoardEdge(b, box);
    if (da < keep * 1.25 && db < keep * 1.25) {
        return null;
    }
    const samples = 5;
    for (let i = 1; i < samples; i++) {
        const t = i / samples;
        const px = a.x + (b.x - a.x) * t;
        const py = a.y + (b.y - a.y) * t;
        const d = distToBoardEdge({ x: px, y: py }, box);
        if (d < keep) {
            return `edge_block keep=${keep} @(${Math.round(px)},${Math.round(py)}) d=${Math.round(d)}`;
        }
    }
    return null;
}
/** 阻挡原因；null = 畅通 */
export function pathClearBlockReason(doc: PcbDocument, layer: PcbLayerId, a: Point2D, b: Point2D, netId: string, width: number, existing: PcbTrack[], existingVias?: PcbVia[]): string | null {
    const edgeHit = boardEdgeKeepoutReason(doc, a, b);
    if (edgeHit !== null) {
        return edgeHit;
    }
    const need = clearanceForNet(doc, netId) + width / 2;
    for (let i = 0; i < existing.length; i++) {
        const t = existing[i];
        if (t.layer !== layer) {
            continue;
        }
        if (t.netId === netId && netId.length > 0) {
            continue;
        }
        // 端点距粗检 + 中段穿越（旧版仅端点距，长斜线/正交穿越会漏检）
        const gap = segClearance(a, b, t.start, t.end) - (need + t.width / 2);
        if (gap < 0) {
            return `track_block net=${t.netName || t.netId} on ${layer as string}` +
                ` @(${Math.round(t.start.x)},${Math.round(t.start.y)})-(${Math.round(t.end.x)},${Math.round(t.end.y)})`;
        }
        const cross = WireConflictGeometry.segmentConflict(a, b, t.start, t.end);
        if (cross === 'collinear_overlap') {
            return `track_cross net=${t.netName || t.netId} on ${layer as string}` +
                ` kind=${cross}` +
                ` @(${Math.round(t.start.x)},${Math.round(t.start.y)})-(${Math.round(t.end.x)},${Math.round(t.end.y)})`;
        }
        if (cross === 'orthogonal_cross') {
            const cp = WireConflictGeometry.orthogonalCrossPoint(a, b, t.start, t.end);
            // 仅中段穿越算阻挡；共端点/T 接留给同网点连接
            if (cp !== null && WireConflictGeometry.isMidspanCross(cp, [a, b], [t.start, t.end], 3)) {
                return `track_cross net=${t.netName || t.netId} on ${layer as string}` +
                    ` kind=${cross}` +
                    ` @(${Math.round(t.start.x)},${Math.round(t.start.y)})-(${Math.round(t.end.x)},${Math.round(t.end.y)})`;
            }
        }
    }
    if (existingVias) {
        for (let i = 0; i < existingVias.length; i++) {
            const v = existingVias[i];
            if (!viaOnLayer(v, layer)) {
                continue;
            }
            if (v.netId === netId && netId.length > 0) {
                continue;
            }
            if (distPointSeg(v.position, a, b) < need + v.diameter / 2) {
                return `via_block net=${v.netName || v.netId} @(${Math.round(v.position.x)},${Math.round(v.position.y)})`;
            }
        }
    }
    for (const fp of doc.footprints) {
        for (const pad of fp.pads) {
            const pNet = pad.netId ?? '';
            if (pNet.length > 0 && pNet === netId) {
                continue;
            }
            // SMD 浮空脚只挡其铜层，避免内层垂直段被 QFP 全脚墙死。
            // 同层仍禁止中段穿盘（仅端点出线豁免）。
            if (!padBlocksTrackOnLayer(pad, layer)) {
                continue;
            }
            const pos = padWorldPosition(fp, pad);
            const padR = padObstacleRadius(pad);
            const thr = need + padR;
            const da = Math.sqrt((pos.x - a.x) * (pos.x - a.x) + (pos.y - a.y) * (pos.y - a.y));
            const db = Math.sqrt((pos.x - b.x) * (pos.x - b.x) + (pos.y - b.y) * (pos.y - b.y));
            const dSeg = distPointSeg(pos, a, b);
            if (dSeg >= thr) {
                continue;
            }
            // 仅放行「端点落盘/出线」：线段到焊盘的最近点几乎就是端点本身。
            // 邻脚密间距时，中段压盘 dSeg≪minEnd → 仍拦截。
            const minEnd = Math.min(da, db);
            if (minEnd < thr && dSeg >= minEnd - 1.0) {
                continue;
            }
            return `pad_block ${fp.refDes}.${pad.number}` +
                `(${pad.netName || pNet || 'float'})@${Math.round(pos.x)},${Math.round(pos.y)}` +
                ` r=${Math.round(padR)} layer=${layer as string}`;
        }
    }
    // F.Cu / B.Cu：禁止走线压过器件选中区（与编辑器 footprintBoundingBox 一致）
    for (const fp of doc.footprints) {
        if (!layerNeedsFootprintBodyKeepout(layer, fp)) {
            continue;
        }
        const box = footprintSelectionAabb(fp);
        const lenIn = segLengthInsideAabb(a, b, box, need);
        if (lenIn <= 1.0) {
            continue;
        }
        // 同网焊盘短距出线：进入选中区长度有限，避免穿芯
        let maxPadR = 20;
        for (let i = 0; i < fp.pads.length; i++) {
            maxPadR = Math.max(maxPadR, padObstacleRadius(fp.pads[i]));
        }
        const exitBudget = Math.max(maxPadR * 2 + need, 50);
        const aNear = fpSameNetPadNear(fp, netId, a, maxPadR + need + 8);
        const bNear = fpSameNetPadNear(fp, netId, b, maxPadR + need + 8);
        if ((aNear || bNear) && lenIn <= exitBudget) {
            continue;
        }
        if (aNear && bNear) {
            // 同封装两焊盘直连：仅当整段都在盒内且跨度不大时放行
            const boxW = box.x2 - box.x1;
            const boxH = box.y2 - box.y1;
            if (lenIn <= Math.min(boxW, boxH) * 0.55) {
                continue;
            }
        }
        return `body_block ${fp.refDes}` +
            ` sel=(${Math.round(box.x1)},${Math.round(box.y1)})-(${Math.round(box.x2)},${Math.round(box.y2)})` +
            ` inLen=${Math.round(lenIn)} layer=${layer as string}`;
    }
    return null;
}
/** 候选线段与已有异网同层走线 / via / 焊盘是否冲突 */
export function pathClearOfTracks(doc: PcbDocument, layer: PcbLayerId, a: Point2D, b: Point2D, netId: string, width: number, existing: PcbTrack[], existingVias?: PcbVia[]): boolean {
    return pathClearBlockReason(doc, layer, a, b, netId, width, existing, existingVias) === null;
}
/** via 中心是否与异网 via/pad/track 冲突 */
export function viaClearAt(doc: PcbDocument, pos: Point2D, netId: string, diameter: number, layers: PcbLayerId[], existingTracks: PcbTrack[], existingVias: PcbVia[]): boolean {
    const need = clearanceForNet(doc, netId) + diameter / 2;
    for (let i = 0; i < existingVias.length; i++) {
        const v = existingVias[i];
        if (v.netId === netId && netId.length > 0) {
            continue;
        }
        const dx = v.position.x - pos.x;
        const dy = v.position.y - pos.y;
        if (Math.sqrt(dx * dx + dy * dy) < need + v.diameter / 2) {
            return false;
        }
    }
    for (let li = 0; li < layers.length; li++) {
        const layer = layers[li];
        for (let i = 0; i < existingTracks.length; i++) {
            const t = existingTracks[i];
            if (t.layer !== layer) {
                continue;
            }
            if (t.netId === netId && netId.length > 0) {
                continue;
            }
            if (distPointSeg(pos, t.start, t.end) < need + t.width / 2) {
                return false;
            }
        }
    }
    for (const fp of doc.footprints) {
        for (const pad of fp.pads) {
            const pNet = pad.netId ?? '';
            if (pNet.length > 0 && pNet === netId) {
                continue;
            }
            if (!padBlocksViaLayers(pad, layers)) {
                continue;
            }
            const posPad = padWorldPosition(fp, pad);
            const padR = padObstacleRadius(pad);
            const dx = posPad.x - pos.x;
            const dy = posPad.y - pos.y;
            if (Math.sqrt(dx * dx + dy * dy) < need + padR) {
                return false;
            }
        }
    }
    return true;
}
