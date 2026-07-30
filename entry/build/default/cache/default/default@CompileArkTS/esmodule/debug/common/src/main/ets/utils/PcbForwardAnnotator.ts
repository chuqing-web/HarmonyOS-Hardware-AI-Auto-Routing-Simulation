import { NetType } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/CommonTypes";
import type { SchematicDocument, ComponentInstance } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/CommonTypes";
import type { SchTopology } from '../types/TopologyTypes';
import { createEmptyPcbDocument } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/PcbTypes";
import type { PcbDocument, PcbFootprintInst, PcbNetRef } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/PcbTypes";
import { getGlobalPcbFootprintLibrary } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbFootprintLibrary";
import type { PcbFootprintLibrary } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbFootprintLibrary";
import { parsePinRef } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PinRefUtil";
import { paramMapGet } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/MapHelpers";
import { registerSchPinToPadNet, lookupPadNet } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbPinBindUtil";
import { tracePcbForwardResult } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbTraceLog";
export interface ForwardAnnotateResult {
    document: PcbDocument;
    placedCount: number;
    skippedCount: number;
    messages: string[];
}
function extractFootprint(comp: ComponentInstance): string {
    const keys: string[] = ['footprint', 'package', 'Package', '封装', 'pkg'];
    for (const k of keys) {
        const v = paramMapGet(comp.parameters, k, '');
        if (v.length > 0)
            return v;
    }
    return '';
}
function extractValue(comp: ComponentInstance): string {
    return paramMapGet(comp.parameters, 'value', paramMapGet(comp.parameters, 'Value', comp.libraryId));
}
/** 跳过电源/地/探针/仪器等不可布局器件 */
function isLayoutable(comp: ComponentInstance): boolean {
    const lib = comp.libraryId.toLowerCase();
    if (lib.startsWith('gnd') || lib.startsWith('vcc') || lib.startsWith('vee') ||
        lib.startsWith('power') || lib.includes('probe') || lib.includes('instrument') ||
        lib.includes('oscilloscope') || lib.includes('multimeter') || lib.includes('generator')) {
        return false;
    }
    if (comp.refDes.startsWith('#'))
        return false;
    return true;
}
interface FootprintHalfExtents {
    halfW: number;
    halfH: number;
}
/** 根据 courtyard 估算封装占位半宽/半高 (mil) */
function footprintHalfExtents(lib: PcbFootprintLibrary, defId: string): FootprintHalfExtents {
    const def = lib.getDef(defId);
    let halfW = 60;
    let halfH = 40;
    if (!def) {
        const result: FootprintHalfExtents = { halfW: halfW, halfH: halfH };
        return result;
    }
    for (const pad of def.pads) {
        halfW = Math.max(halfW, Math.abs(pad.pos.x) + pad.size.x / 2);
        halfH = Math.max(halfH, Math.abs(pad.pos.y) + pad.size.y / 2);
    }
    if (def.courtyard.length >= 2) {
        for (const pt of def.courtyard) {
            halfW = Math.max(halfW, Math.abs(pt.x));
            halfH = Math.max(halfH, Math.abs(pt.y));
        }
    }
    const result: FootprintHalfExtents = { halfW: halfW, halfH: halfH };
    return result;
}
export class PcbForwardAnnotator {
    private lib: PcbFootprintLibrary;
    constructor(lib?: PcbFootprintLibrary) {
        this.lib = lib ?? getGlobalPcbFootprintLibrary();
    }
    /** 从原理图文档生成/更新 PCB（保留已有走线，更新封装位置与网络） */
    annotateFromSchematic(schematic: SchematicDocument, existing?: PcbDocument): ForwardAnnotateResult {
        const doc = existing ?? createEmptyPcbDocument(schematic.name);
        doc.name = schematic.name;
        const messages: string[] = [];
        let placed = 0;
        let skipped = 0;
        const existingBySchId: Map<string, PcbFootprintInst> = new Map();
        for (const fp of doc.footprints) {
            if (fp.schematicCompId) {
                existingBySchId.set(fp.schematicCompId, fp);
            }
        }
        const newFootprints: PcbFootprintInst[] = [];
        const courtyardGap = 40;
        const originX = 180;
        const originY = 180;
        const nComp = schematic.components.filter(c => isLayoutable(c)).length;
        const cols = Math.max(2, Math.ceil(Math.sqrt(Math.max(nComp, 1) * 1.4)));
        const maxRowWidth = Math.max(cols * 240, 720);
        let cursorX = originX;
        let cursorY = originY;
        let rowMaxH = 0;
        for (const comp of schematic.components) {
            if (!isLayoutable(comp)) {
                skipped++;
                continue;
            }
            const fpStr = extractFootprint(comp);
            const defId = this.lib.resolveFootprintId(fpStr, comp.libraryId);
            const value = extractValue(comp);
            let inst = existingBySchId.get(comp.id);
            if (inst) {
                inst.refDes = comp.refDes;
                inst.value = value;
                inst.rotation = comp.rotation;
                if (inst.defId !== defId) {
                    const oldDefId = inst.defId;
                    this.lib.resyncPadsFromDef(inst, defId);
                    messages.push(`${comp.refDes}: 封装 ${oldDefId} → ${defId}`);
                }
                else {
                    inst.defId = defId;
                }
                newFootprints.push(inst);
                placed++;
                continue;
            }
            const ext = footprintHalfExtents(this.lib, defId);
            const slotW = ext.halfW * 2 + courtyardGap * 2;
            const slotH = ext.halfH * 2 + courtyardGap * 2;
            if (cursorX - originX + slotW > maxRowWidth && cursorX > originX) {
                cursorX = originX;
                cursorY += rowMaxH;
                rowMaxH = 0;
            }
            const placeX = cursorX + ext.halfW + courtyardGap;
            const placeY = cursorY + ext.halfH + courtyardGap;
            cursorX += slotW;
            rowMaxH = Math.max(rowMaxH, slotH);
            const created = this.lib.instantiate(defId, comp.refDes, value, { x: placeX, y: placeY }, comp.rotation, comp.id);
            if (created) {
                newFootprints.push(created);
                placed++;
            }
            else {
                skipped++;
                messages.push(`无法创建封装: ${comp.refDes}`);
            }
        }
        doc.footprints = newFootprints;
        doc.metadata.modifiedAt = new Date().toISOString();
        this.bindNetsFromSchematic(schematic, doc);
        this.expandBoardOutline(doc);
        if (placed === 0) {
            messages.push('原理图中没有可布局的器件');
        }
        else {
            messages.push(`已放置 ${placed} 个封装`);
        }
        const out: ForwardAnnotateResult = {
            document: doc, placedCount: placed, skippedCount: skipped, messages
        };
        tracePcbForwardResult(schematic, doc, placed, skipped, messages);
        return out;
    }
    annotateFromTopology(topo: SchTopology, existing?: PcbDocument): ForwardAnnotateResult {
        const schematic: SchematicDocument = {
            id: topo.schUuid,
            name: topo.schName,
            version: '1.0',
            components: [],
            wires: [],
            nets: [],
            netLabels: [],
            subcircuits: [],
            metadata: {
                author: '', createdAt: '', modifiedAt: '',
                description: '', gridSize: 10, units: 'mil', undoLimit: 1000
            }
        };
        for (const d of topo.deviceList) {
            schematic.components.push({
                id: d.instUuid,
                libraryId: d.libDevId,
                refDes: d.refName,
                position: { x: d.x, y: d.y },
                rotation: d.rotate as 0 | 90 | 180 | 270,
                mirrored: d.mirrorH,
                parameters: d.params
            });
        }
        for (const n of topo.netList) {
            const pinIds: string[] = [];
            for (const node of n.nodeList) {
                const pinName = node.pinName && node.pinName.length > 0 ? node.pinName : node.pinId;
                pinIds.push(`${node.devUuid}:${node.pinId}:${pinName}`);
            }
            schematic.nets.push({
                id: n.netUuid,
                name: n.netName.length > 0 ? n.netName : n.displayName,
                type: n.isPower ? NetType.POWER : NetType.SIGNAL,
                pinIds
            });
        }
        return this.annotateFromSchematic(schematic, existing);
    }
    /** 将原理图网络名绑定到焊盘（compId:pinId 标准引脚引用） */
    private bindNetsFromSchematic(schematic: SchematicDocument, doc: PcbDocument): void {
        const netByCompPad: Map<string, PcbNetRef> = new Map();
        for (const net of schematic.nets) {
            for (const pinRef of net.pinIds) {
                const parsed = parsePinRef(pinRef);
                if (!parsed)
                    continue;
                registerSchPinToPadNet(netByCompPad, parsed.compId, parsed.pinId, parsed.pinName, net.id, net.name);
            }
        }
        for (const fp of doc.footprints) {
            if (!fp.schematicCompId)
                continue;
            for (const pad of fp.pads) {
                const bound = lookupPadNet(netByCompPad, fp.schematicCompId, pad.number);
                if (bound !== undefined) {
                    pad.netName = bound.netName;
                    pad.netId = bound.netId;
                }
                else {
                    pad.netName = undefined;
                    pad.netId = undefined;
                }
            }
        }
    }
    private expandBoardOutline(doc: PcbDocument): void {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let has = false;
        for (const fp of doc.footprints) {
            has = true;
            minX = Math.min(minX, fp.position.x - 80);
            minY = Math.min(minY, fp.position.y - 80);
            maxX = Math.max(maxX, fp.position.x + 80);
            maxY = Math.max(maxY, fp.position.y + 80);
        }
        if (!has) {
            doc.boardOutline.points = [
                { x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 700 }, { x: 0, y: 700 }
            ];
            return;
        }
        const margin = 140;
        const shiftX = minX - margin;
        const shiftY = minY - margin;
        if (Math.abs(shiftX) > 0.5 || Math.abs(shiftY) > 0.5) {
            for (const fp of doc.footprints) {
                fp.position.x -= shiftX;
                fp.position.y -= shiftY;
            }
            maxX -= shiftX;
            maxY -= shiftY;
        }
        const boardW = Math.max(maxX + margin, 800);
        const boardH = Math.max(maxY + margin, 600);
        doc.boardOutline.points = [
            { x: 0, y: 0 }, { x: boardW, y: 0 }, { x: boardW, y: boardH }, { x: 0, y: boardH }
        ];
    }
}
export function forwardAnnotatePcb(schematic: SchematicDocument, existing?: PcbDocument): ForwardAnnotateResult {
    return new PcbForwardAnnotator().annotateFromSchematic(schematic, existing);
}
