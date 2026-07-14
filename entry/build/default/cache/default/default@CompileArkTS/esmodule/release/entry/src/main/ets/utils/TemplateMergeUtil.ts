import { NetType } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchematicDocument, ComponentInstance, Net, Wire, Point2D, WorldRect } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { IdUtil, parsePinRef, buildPinRef, copyStringMap } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
export class TemplateMergeUtil {
    private static readonly MARGIN = 80;
    private static readonly ORIGIN_PAD = 40;
    static mergeTemplateInto(a248: SchematicDocument, b248: SchematicDocument): Point2D {
        const c248 = TemplateMergeUtil.calcPlacementOffset(a248, b248);
        const d248 = new Map<string, string>();
        const e248 = new Map<string, string>();
        const f248 = new Set<string>();
        for (let z248 = 0; z248 < a248.components.length; z248++) {
            f248.add(a248.components[z248].refDes);
        }
        for (let u248 = 0; u248 < b248.components.length; u248++) {
            const v248 = b248.components[u248];
            const w248 = IdUtil.generate('comp');
            d248.set(v248.id, w248);
            const x248 = TemplateMergeUtil.allocateRefDes(v248.libraryId, v248.refDes, f248);
            f248.add(x248);
            const y248: ComponentInstance = {
                id: w248,
                libraryId: v248.libraryId,
                refDes: x248,
                position: { x: v248.position.x + c248.x, y: v248.position.y + c248.y },
                rotation: v248.rotation,
                mirrored: v248.mirrored,
                parameters: copyStringMap(v248.parameters)
            };
            if (v248.subcircuitId !== undefined && v248.subcircuitId.length > 0) {
                y248.subcircuitId = v248.subcircuitId;
            }
            a248.components.push(y248);
        }
        for (let m248 = 0; m248 < b248.nets.length; m248++) {
            const n248 = b248.nets[m248];
            const o248 = TemplateMergeUtil.isRailNet(n248);
            let p248: Net | undefined = undefined;
            if (o248) {
                for (let t248 = 0; t248 < a248.nets.length; t248++) {
                    if (a248.nets[t248].name === n248.name) {
                        p248 = a248.nets[t248];
                        break;
                    }
                }
            }
            if (p248 !== undefined) {
                e248.set(n248.id, p248.id);
                TemplateMergeUtil.appendPinRefs(p248, n248.pinIds, d248);
            }
            else {
                const q248 = IdUtil.generate('net');
                e248.set(n248.id, q248);
                const r248: string[] = [];
                TemplateMergeUtil.remapPinRefs(n248.pinIds, d248, r248);
                const s248: Net = {
                    id: q248,
                    name: TemplateMergeUtil.uniqueNetName(a248, n248.name),
                    type: n248.type,
                    pinIds: r248
                };
                a248.nets.push(s248);
            }
        }
        for (let g248 = 0; g248 < b248.wires.length; g248++) {
            const h248 = b248.wires[g248];
            const i248 = e248.get(h248.netId);
            if (i248 === undefined || i248.length === 0) {
                continue;
            }
            const j248: Point2D[] = [];
            for (let l248 = 0; l248 < h248.points.length; l248++) {
                j248.push({
                    x: h248.points[l248].x + c248.x,
                    y: h248.points[l248].y + c248.y
                });
            }
            const k248: Wire = {
                id: IdUtil.generate('wire'),
                netId: i248,
                points: j248,
                style: h248.style
            };
            a248.wires.push(k248);
        }
        a248.metadata.modifiedAt = new Date().toISOString();
        return c248;
    }
    private static calcPlacementOffset(w247: SchematicDocument, x247: SchematicDocument): Point2D {
        const y247 = TemplateMergeUtil.contentBounds(x247);
        if (w247.components.length === 0 && w247.wires.length === 0) {
            return {
                x: TemplateMergeUtil.ORIGIN_PAD - y247.minX,
                y: TemplateMergeUtil.ORIGIN_PAD - y247.minY
            };
        }
        const z247 = TemplateMergeUtil.contentBounds(w247);
        return {
            x: z247.maxX + TemplateMergeUtil.MARGIN - y247.minX,
            y: z247.minY - y247.minY
        };
    }
    private static contentBounds(g247: SchematicDocument): WorldRect {
        let h247 = 0;
        let i247 = 0;
        let j247 = 0;
        let k247 = 0;
        let l247 = false;
        const m247 = 40;
        for (let s247 = 0; s247 < g247.components.length; s247++) {
            const t247 = g247.components[s247];
            const u247 = t247.position.x;
            const v247 = t247.position.y;
            if (!l247) {
                h247 = u247;
                j247 = u247;
                i247 = v247;
                k247 = v247;
                l247 = true;
            }
            else {
                h247 = Math.min(h247, u247);
                j247 = Math.max(j247, u247);
                i247 = Math.min(i247, v247);
                k247 = Math.max(k247, v247);
            }
        }
        for (let n247 = 0; n247 < g247.wires.length; n247++) {
            const o247 = g247.wires[n247].points;
            for (let p247 = 0; p247 < o247.length; p247++) {
                const q247 = o247[p247].x;
                const r247 = o247[p247].y;
                if (!l247) {
                    h247 = q247;
                    j247 = q247;
                    i247 = r247;
                    k247 = r247;
                    l247 = true;
                }
                else {
                    h247 = Math.min(h247, q247);
                    j247 = Math.max(j247, q247);
                    i247 = Math.min(i247, r247);
                    k247 = Math.max(k247, r247);
                }
            }
        }
        if (!l247) {
            return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
        }
        return {
            minX: h247 - m247,
            minY: i247 - m247,
            maxX: j247 + m247,
            maxY: k247 + m247
        };
    }
    private static isRailNet(e247: Net): boolean {
        if (e247.type === NetType.POWER || e247.type === NetType.GROUND) {
            return true;
        }
        const f247 = e247.name.toUpperCase();
        return f247 === 'VCC' || f247 === 'VDD' || f247 === 'GND' || f247 === 'VSS' || f247 === 'VEE';
    }
    private static appendPinRefs(x246: Net, y246: string[], z246: Map<string, string>): void {
        for (let a247 = 0; a247 < y246.length; a247++) {
            const b247 = parsePinRef(y246[a247]);
            if (b247 === null || b247.compId.length === 0) {
                continue;
            }
            const c247 = z246.get(b247.compId);
            if (c247 === undefined) {
                continue;
            }
            const d247 = buildPinRef(c247, b247.pinId, b247.pinName);
            if (!x246.pinIds.includes(d247)) {
                x246.pinIds.push(d247);
            }
        }
    }
    private static remapPinRefs(r246: string[], s246: Map<string, string>, t246: string[]): void {
        for (let u246 = 0; u246 < r246.length; u246++) {
            const v246 = parsePinRef(r246[u246]);
            if (v246 === null || v246.compId.length === 0) {
                continue;
            }
            const w246 = s246.get(v246.compId);
            if (w246 === undefined) {
                continue;
            }
            t246.push(buildPinRef(w246, v246.pinId, v246.pinName));
        }
    }
    private static uniqueNetName(m246: SchematicDocument, n246: string): string {
        const o246 = new Set<string>();
        for (let q246 = 0; q246 < m246.nets.length; q246++) {
            o246.add(m246.nets[q246].name);
        }
        if (!o246.has(n246)) {
            return n246;
        }
        let p246 = 2;
        while (o246.has(`${n246}_${p246}`)) {
            p246++;
        }
        return `${n246}_${p246}`;
    }
    private static allocateRefDes(h246: string, i246: string, j246: Set<string>): string {
        if (!j246.has(i246)) {
            return i246;
        }
        const k246 = TemplateMergeUtil.refDesPrefix(h246);
        let l246 = 1;
        while (j246.has(`${k246}${l246}`)) {
            l246++;
        }
        return `${k246}${l246}`;
    }
    private static refDesPrefix(g246: string): string {
        if (g246.startsWith('R_'))
            return 'R';
        if (g246.startsWith('C_'))
            return 'C';
        if (g246.startsWith('L_'))
            return 'L';
        if (g246.includes('LED'))
            return 'D';
        if (g246.includes('74HC') || g246.includes('CD'))
            return 'U';
        if (g246.includes('STM32') || g246.includes('AT89') || g246.includes('STC'))
            return 'U';
        if (g246.includes('OSCILLOSCOPE') || g246.includes('VIRTUAL'))
            return 'X';
        return 'U';
    }
}
