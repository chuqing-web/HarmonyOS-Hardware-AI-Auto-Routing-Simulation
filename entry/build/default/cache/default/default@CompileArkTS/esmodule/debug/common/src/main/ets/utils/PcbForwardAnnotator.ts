import { NetType } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/CommonTypes";
import type { SchematicDocument, ComponentInstance, Point2D } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/CommonTypes";
import type { SchTopology } from '../types/TopologyTypes';
import { createEmptyPcbDocument } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/PcbTypes";
import type { PcbDocument, PcbFootprintInst, PcbNetRef } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/PcbTypes";
import { getGlobalPcbFootprintLibrary } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbFootprintLibrary";
import type { PcbFootprintLibrary } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbFootprintLibrary";
import { parsePinRef } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PinRefUtil";
import { paramMapGet } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/MapHelpers";
import { registerSchPinToPadNet, lookupPadNet } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbPinBindUtil";
import { tracePcbForwardResult } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbTraceLog";
import { collectFootprintPadPositions, updateTracksForFootprintTransform, snapTrackEndpointsToPads, pruneZeroLengthTracks } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbTrackBindUtil";
import { ensureBoardAccessories, accessoryHintsFromSchematicNets } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbBoardAccessories";
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
/** 跳过电源/地/探针/仪器等不可布局器件 — 与 export.mjs isLayoutable 对齐（含 vac/完整仪器清单） */
function isLayoutable(comp: ComponentInstance): boolean {
    const lib = comp.libraryId.toLowerCase();
    if (lib.startsWith('gnd') || lib.startsWith('vcc') || lib.startsWith('vee') ||
        lib.startsWith('vac') || lib.startsWith('power') || lib.includes('probe') ||
        lib.includes('instrument') || lib.includes('oscilloscope') || lib.includes('multimeter') ||
        lib.includes('generator') || lib.includes('voltmeter') || lib.includes('ammeter') ||
        lib.includes('power_meter') || lib.includes('freq_counter') || lib.includes('logic_analyzer') ||
        lib.includes('uart_terminal') || lib.includes('virtual_meter') || lib.includes('signal_gen')) {
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
interface NewPlaceSlot {
    comp: ComponentInstance;
    defId: string;
    value: string;
    halfW: number;
    halfH: number;
    x: number;
    y: number;
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
/** 从 refDes 提取尾部数字（U1→1，CX01→1，RL3→3） */
function refIndex(refDes: string): number {
    let n = 0;
    let found = false;
    for (let i = 0; i < refDes.length; i++) {
        const c = refDes.charCodeAt(i);
        if (c >= 48 && c <= 57) {
            n = n * 10 + (c - 48);
            found = true;
        }
        else if (found) {
            break;
        }
    }
    return found ? n : 0;
}
/**
 * 原理图相对位姿 → PCB：保留功能簇（MCU+晶振+电容+LED），
 * 适中间距、解重叠，并按列紧凑利用板面。
 */
function slotRole(refDes: string, defId: string): string {
    const r = (refDes || '').toUpperCase();
    const d = (defId || '').toUpperCase();
    if (r.charAt(0) === 'U' || d.indexOf('STM32') >= 0 || d.indexOf('AT89') >= 0 ||
        d.indexOf('STC') >= 0) {
        return 'mcu';
    }
    if (r.charAt(0) === 'Y' || d.indexOf('XTAL') >= 0 || d.indexOf('CRYSTAL') >= 0) {
        return 'xtal';
    }
    if (r.indexOf('CX') === 0 || (r.charAt(0) === 'C' && d.indexOf('CAP') >= 0)) {
        return 'cap';
    }
    if (r.indexOf('CD') === 0) {
        return 'decap';
    }
    if (r.indexOf('RL') === 0) {
        return 'ledr';
    }
    if (r.charAt(0) === 'D' || d.indexOf('LED') >= 0) {
        return 'led';
    }
    return 'other';
}
function attractSlot(s: NewPlaceSlot, tx: number, ty: number, strength: number): void {
    const k = Math.max(0, Math.min(1, strength));
    s.x = s.x * (1 - k) + tx * k;
    s.y = s.y * (1 - k) + ty * k;
}
function layoutNewSlotsFromSchematic(slots: NewPlaceSlot[]): void {
    if (slots.length === 0) {
        return;
    }
    const margin = 120;
    const gap = 50; // courtyard 外缘间距（适中偏紧，利于布线通道）
    // 1) 按原理图坐标缩放（上限收紧，避免稀疏散落）
    let minSX = slots[0].comp.position.x;
    let maxSX = minSX;
    let minSY = slots[0].comp.position.y;
    let maxSY = minSY;
    for (let i = 1; i < slots.length; i++) {
        const p = slots[i].comp.position;
        if (p.x < minSX) {
            minSX = p.x;
        }
        if (p.x > maxSX) {
            maxSX = p.x;
        }
        if (p.y < minSY) {
            minSY = p.y;
        }
        if (p.y > maxSY) {
            maxSY = p.y;
        }
    }
    const schW = Math.max(maxSX - minSX, 1);
    const schH = Math.max(maxSY - minSY, 1);
    let avgHalf = 0;
    for (let i = 0; i < slots.length; i++) {
        avgHalf += (slots[i].halfW + slots[i].halfH) * 0.5;
    }
    avgHalf /= slots.length;
    const targetPitch = Math.max(avgHalf * 2 + gap, 120);
    const scaleX = Math.max(1.05, Math.min(1.85, (targetPitch * Math.sqrt(slots.length)) / schW));
    const scaleY = Math.max(1.05, Math.min(1.85, (targetPitch * Math.sqrt(slots.length) * 0.7) / schH));
    const scale = Math.min(scaleX, scaleY);
    for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        s.x = margin + (s.comp.position.x - minSX) * scale;
        s.y = margin + (s.comp.position.y - minSY) * scale;
    }
    // 2) 同序号功能簇：收紧 + 固定搭配吸附（MCU↔晶振/去耦，LED↔限流）
    const byIdx: Map<number, NewPlaceSlot[]> = new Map();
    for (let i = 0; i < slots.length; i++) {
        const idx = refIndex(slots[i].comp.refDes);
        if (idx <= 0) {
            continue;
        }
        let list = byIdx.get(idx);
        if (list === undefined) {
            list = [];
            byIdx.set(idx, list);
        }
        list.push(slots[i]);
    }
    byIdx.forEach((list: NewPlaceSlot[]) => {
        if (list.length < 2) {
            return;
        }
        let cx = 0;
        let cy = 0;
        for (let i = 0; i < list.length; i++) {
            cx += list[i].x;
            cy += list[i].y;
        }
        cx /= list.length;
        cy /= list.length;
        for (let i = 0; i < list.length; i++) {
            list[i].x = cx + (list[i].x - cx) * 0.78;
            list[i].y = cy + (list[i].y - cy) * 0.78;
        }
        let mcu: NewPlaceSlot | null = null;
        let xtal: NewPlaceSlot | null = null;
        const caps: NewPlaceSlot[] = [];
        const leds: NewPlaceSlot[] = [];
        const ledRs: NewPlaceSlot[] = [];
        let decap: NewPlaceSlot | null = null;
        for (let i = 0; i < list.length; i++) {
            const role = slotRole(list[i].comp.refDes, list[i].defId);
            if (role === 'mcu') {
                mcu = list[i];
            }
            else if (role === 'xtal') {
                xtal = list[i];
            }
            else if (role === 'cap') {
                caps.push(list[i]);
            }
            else if (role === 'decap') {
                decap = list[i];
            }
            else if (role === 'led') {
                leds.push(list[i]);
            }
            else if (role === 'ledr') {
                ledRs.push(list[i]);
            }
        }
        if (mcu !== null) {
            if (xtal !== null) {
                attractSlot(xtal, mcu.x - (mcu.halfW + xtal.halfW + 70), mcu.y - 30, 0.65);
            }
            if (decap !== null) {
                attractSlot(decap, mcu.x + mcu.halfW + decap.halfW + 55, mcu.y + 40, 0.55);
            }
            for (let ci = 0; ci < caps.length; ci++) {
                const c = caps[ci];
                if (xtal !== null) {
                    const side = (ci % 2 === 0) ? -1 : 1;
                    attractSlot(c, xtal.x + side * (xtal.halfW + c.halfW + 45), xtal.y + 35, 0.6);
                }
                else {
                    attractSlot(c, mcu.x - mcu.halfW - 80 - ci * 40, mcu.y - 50, 0.45);
                }
            }
        }
        // LED + RL 限流电阻成对（勿把复位电阻 R* 误配进来）
        const pairN = Math.min(leds.length, ledRs.length);
        for (let pi = 0; pi < pairN; pi++) {
            const led = leds[pi];
            const r = ledRs[pi];
            const mx = (led.x + r.x) * 0.5;
            const my = (led.y + r.y) * 0.5;
            attractSlot(r, mx - 35, my, 0.5);
            attractSlot(led, mx + 45, my, 0.5);
            if (mcu !== null) {
                attractSlot(r, mcu.x + mcu.halfW + 90, mcu.y + pi * 55, 0.35);
                attractSlot(led, mcu.x + mcu.halfW + 160, mcu.y + pi * 55, 0.35);
            }
        }
    });
    // 3) 解 courtyard 重叠（推开，保持适中间隙）
    for (let pass = 0; pass < 56; pass++) {
        let moved = false;
        for (let i = 0; i < slots.length; i++) {
            for (let j = i + 1; j < slots.length; j++) {
                const a = slots[i];
                const b = slots[j];
                const needX = a.halfW + b.halfW + gap;
                const needY = a.halfH + b.halfH + gap;
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const ox = needX - Math.abs(dx);
                const oy = needY - Math.abs(dy);
                if (ox <= 0 || oy <= 0) {
                    continue;
                }
                moved = true;
                if (ox < oy) {
                    const push = ox * 0.5 + 0.5;
                    if (dx >= 0) {
                        a.x -= push;
                        b.x += push;
                    }
                    else {
                        a.x += push;
                        b.x -= push;
                    }
                }
                else {
                    const push = oy * 0.5 + 0.5;
                    if (dy >= 0) {
                        a.y -= push;
                        b.y += push;
                    }
                    else {
                        a.y += push;
                        b.y -= push;
                    }
                }
            }
        }
        if (!moved) {
            break;
        }
    }
    // 4) 平移到正象限 + margin
    let minX = slots[0].x - slots[0].halfW;
    let minY = slots[0].y - slots[0].halfH;
    for (let i = 1; i < slots.length; i++) {
        minX = Math.min(minX, slots[i].x - slots[i].halfW);
        minY = Math.min(minY, slots[i].y - slots[i].halfH);
    }
    const shiftX = margin - minX;
    const shiftY = margin - minY;
    for (let i = 0; i < slots.length; i++) {
        slots[i].x += shiftX;
        slots[i].y += shiftY;
    }
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
        /** 无 schematicCompId 的既有封装（仪器探针 / 手布外设）：更新时保留，勿整表替换丢掉 */
        const orphanKeep: PcbFootprintInst[] = [];
        for (const fp of doc.footprints) {
            if (fp.schematicCompId) {
                existingBySchId.set(fp.schematicCompId, fp);
            }
            else {
                orphanKeep.push(fp);
            }
        }
        const newFootprints: PcbFootprintInst[] = [];
        /** 焊盘几何刷新前的世界坐标，用于走线端点跟随，避免「线被拆开」 */
        const pendingTrackFollow: Array<Map<string, Point2D>> = [];
        const pendingFpIds: string[] = [];
        const pendingSlots: NewPlaceSlot[] = [];
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
                const oldDefId = inst.defId;
                const oldPadPos = collectFootprintPadPositions(inst);
                // 始终从库刷新焊盘几何（保留同号网络/id），避免库修正后旧实例仍用错误脚距
                this.lib.resyncPadsFromDef(inst, defId);
                pendingTrackFollow.push(oldPadPos);
                pendingFpIds.push(inst.id);
                if (oldDefId !== defId) {
                    messages.push(`${comp.refDes}: 封装 ${oldDefId} → ${defId}`);
                }
                newFootprints.push(inst);
                placed++;
                continue;
            }
            const ext = footprintHalfExtents(this.lib, defId);
            const slot: NewPlaceSlot = {
                comp: comp,
                defId: defId,
                value: value,
                halfW: ext.halfW,
                halfH: ext.halfH,
                x: 0,
                y: 0
            };
            pendingSlots.push(slot);
        }
        layoutNewSlotsFromSchematic(pendingSlots);
        for (let si = 0; si < pendingSlots.length; si++) {
            const slot = pendingSlots[si];
            const created = this.lib.instantiate(slot.defId, slot.comp.refDes, slot.value, { x: slot.x, y: slot.y }, slot.comp.rotation, slot.comp.id);
            if (created) {
                newFootprints.push(created);
                placed++;
            }
            else {
                skipped++;
                messages.push(`无法创建封装: ${slot.comp.refDes}`);
            }
        }
        doc.footprints = newFootprints.concat(orphanKeep);
        // 焊盘局部坐标变化后，把仍挂在旧焊盘世界坐标上的走线端点一起挪过去
        for (let i = 0; i < pendingFpIds.length; i++) {
            const fpSet: Set<string> = new Set([pendingFpIds[i]]);
            updateTracksForFootprintTransform(doc, fpSet, pendingTrackFollow[i]);
        }
        snapTrackEndpointsToPads(doc);
        pruneZeroLengthTracks(doc);
        doc.metadata.modifiedAt = new Date().toISOString();
        this.bindNetsFromSchematic(schematic, doc);
        this.expandBoardOutline(doc);
        const acc = ensureBoardAccessories(doc, this.lib, accessoryHintsFromSchematicNets(schematic.nets));
        if (acc.message.length > 0) {
            messages.push(acc.message);
        }
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
    /** 将原理图网络名绑定到焊盘（compId:pinId + libraryId 脚位表） */
    private bindNetsFromSchematic(schematic: SchematicDocument, doc: PcbDocument): void {
        const libByComp: Map<string, string> = new Map();
        for (const comp of schematic.components) {
            libByComp.set(comp.id, comp.libraryId);
        }
        const netByCompPad: Map<string, PcbNetRef> = new Map();
        for (const net of schematic.nets) {
            for (const pinRef of net.pinIds) {
                const parsed = parsePinRef(pinRef);
                if (!parsed)
                    continue;
                const libId = libByComp.get(parsed.compId) ?? '';
                registerSchPinToPadNet(netByCompPad, parsed.compId, parsed.pinId, parsed.pinName, net.id, net.name, libId);
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
            const ext = footprintHalfExtents(this.lib, fp.defId);
            minX = Math.min(minX, fp.position.x - ext.halfW);
            minY = Math.min(minY, fp.position.y - ext.halfH);
            maxX = Math.max(maxX, fp.position.x + ext.halfW);
            maxY = Math.max(maxY, fp.position.y + ext.halfH);
        }
        if (!has) {
            doc.boardOutline.points = [
                { x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 700 }, { x: 0, y: 700 }
            ];
            return;
        }
        // 边距：够走线通道与安装孔，板面贴内容紧凑利用
        const margin = 95;
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
        const boardW = Math.max(maxX + margin, 700);
        const boardH = Math.max(maxY + margin, 520);
        doc.boardOutline.points = [
            { x: 0, y: 0 }, { x: boardW, y: 0 }, { x: boardW, y: boardH }, { x: 0, y: boardH }
        ];
    }
}
export function forwardAnnotatePcb(schematic: SchematicDocument, existing?: PcbDocument): ForwardAnnotateResult {
    return new PcbForwardAnnotator().annotateFromSchematic(schematic, existing);
}
