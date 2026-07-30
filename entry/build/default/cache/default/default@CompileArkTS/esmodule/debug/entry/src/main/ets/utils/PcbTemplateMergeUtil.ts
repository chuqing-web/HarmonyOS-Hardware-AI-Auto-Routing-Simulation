import { IdUtil } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { PcbDocument, PcbFootprintInst, PcbTrack, PcbVia, PcbZone, PcbNet, PcbPad, Point2D } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
interface PcbContentBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}
export class PcbTemplateMergeUtil {
    private static readonly MARGIN = 200;
    private static readonly ORIGIN_PAD = 100;
    private static readonly ZONE_INSET = 40;
    private static readonly MIN_BOARD_W = 800;
    private static readonly MIN_BOARD_H = 600;
    /** 把 source 模板 PCB 合并进 target，返回放置偏移 */
    static mergeTemplateInto(target: PcbDocument, source: PcbDocument): Point2D {
        const offset = PcbTemplateMergeUtil.calcPlacementOffset(target, source);
        const fpIdMap = new Map<string, string>();
        const netIdMap = new Map<string, string>();
        const usedRefDes = new Set<string>();
        for (let i = 0; i < target.footprints.length; i++) {
            usedRefDes.add(target.footprints[i].refDes);
        }
        // nets first（电源/地同名合并）
        for (let i = 0; i < source.nets.length; i++) {
            const srcNet = source.nets[i];
            const rail = PcbTemplateMergeUtil.isRailNetName(srcNet.name);
            let existing: PcbNet | undefined = undefined;
            if (rail) {
                for (let ni = 0; ni < target.nets.length; ni++) {
                    if (target.nets[ni].name === srcNet.name) {
                        existing = target.nets[ni];
                        break;
                    }
                }
            }
            if (existing !== undefined) {
                netIdMap.set(srcNet.id, existing.id);
            }
            else {
                const newId = IdUtil.generate('net');
                netIdMap.set(srcNet.id, newId);
                const net: PcbNet = {
                    id: newId,
                    name: PcbTemplateMergeUtil.uniqueNetName(target, srcNet.name)
                };
                if (srcNet.classId !== undefined) {
                    net.classId = srcNet.classId;
                }
                target.nets.push(net);
            }
        }
        for (let i = 0; i < source.footprints.length; i++) {
            const src = source.footprints[i];
            const newId = IdUtil.generate('fp');
            fpIdMap.set(src.id, newId);
            const refDes = PcbTemplateMergeUtil.allocateRefDes(src.refDes, usedRefDes);
            usedRefDes.add(refDes);
            const pads: PcbPad[] = [];
            for (let pi = 0; pi < src.pads.length; pi++) {
                const p = src.pads[pi];
                const mappedNetId = p.netId !== undefined ? netIdMap.get(p.netId) : undefined;
                const pad: PcbPad = {
                    id: IdUtil.generate('pad'),
                    number: p.number,
                    type: p.type,
                    shape: p.shape,
                    pos: { x: p.pos.x, y: p.pos.y },
                    size: { x: p.size.x, y: p.size.y },
                    layers: [...p.layers]
                };
                if (p.drill !== undefined) {
                    pad.drill = p.drill;
                }
                if (mappedNetId !== undefined) {
                    pad.netId = mappedNetId;
                }
                if (p.netName !== undefined) {
                    pad.netName = p.netName;
                }
                pads.push(pad);
            }
            const fp: PcbFootprintInst = {
                id: newId,
                defId: src.defId,
                refDes: refDes,
                value: src.value,
                position: { x: src.position.x + offset.x, y: src.position.y + offset.y },
                rotation: src.rotation,
                mirrored: src.mirrored,
                layer: src.layer,
                locked: false,
                pads: pads
            };
            if (src.schematicCompId !== undefined && src.schematicCompId.length > 0) {
                fp.schematicCompId = src.schematicCompId;
            }
            target.footprints.push(fp);
        }
        for (let i = 0; i < source.tracks.length; i++) {
            const t = source.tracks[i];
            const mappedNetId = netIdMap.get(t.netId);
            if (mappedNetId === undefined) {
                continue;
            }
            const track: PcbTrack = {
                id: IdUtil.generate('trk'),
                layer: t.layer,
                start: { x: t.start.x + offset.x, y: t.start.y + offset.y },
                end: { x: t.end.x + offset.x, y: t.end.y + offset.y },
                width: t.width,
                netId: mappedNetId,
                netName: t.netName
            };
            target.tracks.push(track);
        }
        for (let i = 0; i < source.vias.length; i++) {
            const v = source.vias[i];
            const mappedNetId = netIdMap.get(v.netId);
            if (mappedNetId === undefined) {
                continue;
            }
            const via: PcbVia = {
                id: IdUtil.generate('via'),
                position: { x: v.position.x + offset.x, y: v.position.y + offset.y },
                drill: v.drill,
                diameter: v.diameter,
                netId: mappedNetId,
                netName: v.netName,
                layers: [...v.layers]
            };
            if (v.kind !== undefined) {
                via.kind = v.kind;
            }
            target.vias.push(via);
        }
        for (let i = 0; i < source.zones.length; i++) {
            const z = source.zones[i];
            const mappedNetId = netIdMap.get(z.netId);
            if (mappedNetId === undefined) {
                continue;
            }
            const outline: Point2D[] = [];
            for (let oi = 0; oi < z.outline.length; oi++) {
                outline.push({ x: z.outline[oi].x + offset.x, y: z.outline[oi].y + offset.y });
            }
            const cutouts: Point2D[][] = [];
            const srcCutouts = z.cutouts !== undefined ? z.cutouts : [];
            for (let ci = 0; ci < srcCutouts.length; ci++) {
                const poly: Point2D[] = [];
                for (let pi = 0; pi < srcCutouts[ci].length; pi++) {
                    poly.push({
                        x: srcCutouts[ci][pi].x + offset.x,
                        y: srcCutouts[ci][pi].y + offset.y
                    });
                }
                cutouts.push(poly);
            }
            const zone: PcbZone = {
                id: IdUtil.generate('zone'),
                layer: z.layer,
                netId: mappedNetId,
                netName: z.netName,
                outline: outline,
                priority: z.priority,
                clearance: z.clearance,
                cutouts: cutouts,
                manualCutouts: [],
                thermalRelief: z.thermalRelief,
                thermalGap: z.thermalGap,
                thermalWidth: z.thermalWidth
            };
            target.zones.push(zone);
        }
        PcbTemplateMergeUtil.finalizeBoardGeometry(target);
        target.metadata.modifiedAt = new Date().toISOString();
        return offset;
    }
    /**
     * 归一化坐标 → 紧贴内容的板框 → 覆铜与板框对齐
     * 消除「绿基板 vs 棕覆铜」错位
     */
    static finalizeBoardGeometry(doc: PcbDocument): void {
        PcbTemplateMergeUtil.normalizePositive(doc);
        PcbTemplateMergeUtil.expandBoardOutline(doc);
        PcbTemplateMergeUtil.realignZonesToBoard(doc);
    }
    private static calcPlacementOffset(target: PcbDocument, source: PcbDocument): Point2D {
        const srcBounds = PcbTemplateMergeUtil.contentBounds(source, false);
        if (target.footprints.length === 0 && target.tracks.length === 0 && target.vias.length === 0) {
            // 空板：保持模板相对几何，仅平移到 ORIGIN_PAD，避免负偏移把 zone 甩出板框
            const ox = Math.max(0, PcbTemplateMergeUtil.ORIGIN_PAD - srcBounds.minX);
            const oy = Math.max(0, PcbTemplateMergeUtil.ORIGIN_PAD - srcBounds.minY);
            return { x: ox, y: oy };
        }
        const tgtBounds = PcbTemplateMergeUtil.contentBounds(target, false);
        return {
            x: tgtBounds.maxX + PcbTemplateMergeUtil.MARGIN - srcBounds.minX,
            y: tgtBounds.minY - srcBounds.minY
        };
    }
    /** includeZones=false 时用于放置偏移（避免旧错位 zone 影响）；true 用于最终包围盒 */
    private static contentBounds(doc: PcbDocument, includeZones: boolean): PcbContentBounds {
        let minX = 0;
        let minY = 0;
        let maxX = 0;
        let maxY = 0;
        let hasAny = false;
        const pad = 80;
        const absorb = (x: number, y: number): void => {
            if (!hasAny) {
                minX = x;
                maxX = x;
                minY = y;
                maxY = y;
                hasAny = true;
            }
            else {
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }
        };
        for (let i = 0; i < doc.footprints.length; i++) {
            const fp = doc.footprints[i];
            absorb(fp.position.x, fp.position.y);
            for (let pi = 0; pi < fp.pads.length; pi++) {
                const p = fp.pads[pi];
                absorb(fp.position.x + p.pos.x, fp.position.y + p.pos.y);
            }
        }
        for (let i = 0; i < doc.tracks.length; i++) {
            const t = doc.tracks[i];
            absorb(t.start.x, t.start.y);
            absorb(t.end.x, t.end.y);
        }
        for (let i = 0; i < doc.vias.length; i++) {
            const v = doc.vias[i];
            absorb(v.position.x, v.position.y);
        }
        if (includeZones) {
            for (let i = 0; i < doc.zones.length; i++) {
                const z = doc.zones[i];
                for (let oi = 0; oi < z.outline.length; oi++) {
                    absorb(z.outline[oi].x, z.outline[oi].y);
                }
            }
        }
        if (!hasAny) {
            const empty: PcbContentBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
            return empty;
        }
        const padded: PcbContentBounds = {
            minX: minX - pad,
            minY: minY - pad,
            maxX: maxX + pad,
            maxY: maxY + pad
        };
        return padded;
    }
    /** 若出现负坐标，整体平移到正象限 */
    private static normalizePositive(doc: PcbDocument): void {
        const b = PcbTemplateMergeUtil.contentBounds(doc, true);
        const shiftX = b.minX < 0 ? -b.minX + PcbTemplateMergeUtil.ORIGIN_PAD : 0;
        const shiftY = b.minY < 0 ? -b.minY + PcbTemplateMergeUtil.ORIGIN_PAD : 0;
        if (shiftX === 0 && shiftY === 0) {
            return;
        }
        for (let i = 0; i < doc.footprints.length; i++) {
            doc.footprints[i].position.x += shiftX;
            doc.footprints[i].position.y += shiftY;
        }
        for (let i = 0; i < doc.tracks.length; i++) {
            doc.tracks[i].start.x += shiftX;
            doc.tracks[i].start.y += shiftY;
            doc.tracks[i].end.x += shiftX;
            doc.tracks[i].end.y += shiftY;
        }
        for (let i = 0; i < doc.vias.length; i++) {
            doc.vias[i].position.x += shiftX;
            doc.vias[i].position.y += shiftY;
        }
        for (let i = 0; i < doc.zones.length; i++) {
            const z = doc.zones[i];
            for (let oi = 0; oi < z.outline.length; oi++) {
                z.outline[oi].x += shiftX;
                z.outline[oi].y += shiftY;
            }
            const cuts = z.cutouts !== undefined ? z.cutouts : [];
            for (let ci = 0; ci < cuts.length; ci++) {
                for (let pi = 0; pi < cuts[ci].length; pi++) {
                    cuts[ci][pi].x += shiftX;
                    cuts[ci][pi].y += shiftY;
                }
            }
        }
    }
    private static expandBoardOutline(doc: PcbDocument): void {
        const b = PcbTemplateMergeUtil.contentBounds(doc, false);
        const margin = 150;
        const maxX = Math.max(b.maxX + margin, PcbTemplateMergeUtil.MIN_BOARD_W);
        const maxY = Math.max(b.maxY + margin, PcbTemplateMergeUtil.MIN_BOARD_H);
        doc.boardOutline.points = [
            { x: 0, y: 0 }, { x: maxX, y: 0 }, { x: maxX, y: maxY }, { x: 0, y: maxY }
        ];
    }
    /** 把所有覆铜外轮廓重置为板框内缩，消除与基板错位 */
    private static realignZonesToBoard(doc: PcbDocument): void {
        const pts = doc.boardOutline.points;
        if (pts.length < 3) {
            return;
        }
        let minX = pts[0].x;
        let minY = pts[0].y;
        let maxX = pts[0].x;
        let maxY = pts[0].y;
        for (let i = 1; i < pts.length; i++) {
            minX = Math.min(minX, pts[i].x);
            minY = Math.min(minY, pts[i].y);
            maxX = Math.max(maxX, pts[i].x);
            maxY = Math.max(maxY, pts[i].y);
        }
        const inset = PcbTemplateMergeUtil.ZONE_INSET;
        const aligned: Point2D[] = [
            { x: minX + inset, y: minY + inset },
            { x: maxX - inset, y: minY + inset },
            { x: maxX - inset, y: maxY - inset },
            { x: minX + inset, y: maxY - inset }
        ];
        for (let i = 0; i < doc.zones.length; i++) {
            doc.zones[i].outline = aligned.map((p: Point2D): Point2D => ({ x: p.x, y: p.y }));
        }
    }
    private static isRailNetName(name: string): boolean {
        const upper = name.toUpperCase();
        return upper === 'VCC' || upper === 'VDD' || upper === 'GND' || upper === 'VSS' ||
            upper === 'VEE' || upper === 'AGND';
    }
    private static uniqueNetName(doc: PcbDocument, base: string): string {
        let name = base;
        let n = 2;
        while (doc.nets.some(x => x.name === name)) {
            name = `${base}_${n}`;
            n++;
        }
        return name;
    }
    private static allocateRefDes(preferred: string, used: Set<string>): string {
        if (!used.has(preferred)) {
            return preferred;
        }
        const m = preferred.match(/^([A-Za-z_]+)(\d*)$/);
        const prefix = m !== null ? m[1] : preferred;
        let i = 1;
        while (used.has(`${prefix}${i}`)) {
            i++;
        }
        return `${prefix}${i}`;
    }
}
