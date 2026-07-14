import { WireStyle, NetType, IdUtil } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchematicDocument, ComponentInstance, Point2D } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { emptyParameters } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/ets/internal/FilePersistenceHelpers";
import type { ImportReport } from './ImportReport';
export class KiCadParser {
    static parse(l361: string, m361: string): ImportReport {
        const n361 = new Date().toISOString();
        const o361: SchematicDocument = {
            id: IdUtil.generate('sch'),
            name: m361.replace(/\.[^.]+$/, ''),
            version: '1.0',
            components: [],
            wires: [],
            nets: [],
            netLabels: [],
            subcircuits: [],
            metadata: {
                author: 'KiCad Import',
                createdAt: n361, modifiedAt: n361,
                description: `Imported from ${m361}`,
                gridSize: 2.54, units: 'mm', undoLimit: 1000
            }
        };
        const p361: string[] = [];
        let q361 = 0;
        const r361 = KiCadParser.extractBlocks(l361, 'symbol');
        for (let a362 = 0; a362 < r361.length; a362++) {
            const b362 = r361[a362];
            const c362 = KiCadParser.extractField(b362, 'lib_id') ?? 'UNKNOWN';
            const d362 = b362.match(/\(at\s+([\d.-]+)\s+([\d.-]+)(?:\s+([\d.-]+))?\)/);
            const e362 = d362 ? parseFloat(d362[1]) * 39.37 : 100 + a362 * 80;
            const f362 = d362 ? parseFloat(d362[2]) * 39.37 : 100;
            const g362 = d362 && d362[3] ? parseFloat(d362[3]) : 0;
            const h362 = KiCadParser.extractProperty(b362, 'Reference') ?? `U${o361.components.length + 1}`;
            const i362 = KiCadParser.mapLibId(c362);
            if (i362 === c362 && !c362.includes(':'))
                p361.push(c362);
            else
                q361++;
            const j362: ComponentInstance = {
                id: IdUtil.generate('comp'),
                libraryId: i362,
                refDes: h362,
                position: { x: e362, y: f362 },
                rotation: g362 as 0 | 90 | 180 | 270,
                mirrored: false,
                parameters: emptyParameters()
            };
            o361.components.push(j362);
        }
        const s361 = KiCadParser.extractBlocks(l361, 'wire');
        for (let x361 = 0; x361 < s361.length; x361++) {
            const y361 = KiCadParser.extractPoints(s361[x361]);
            if (y361.length >= 2) {
                const z361 = IdUtil.generate('wire');
                o361.wires.push({
                    id: z361,
                    netId: IdUtil.generate('net'),
                    points: [y361[0], y361[1]],
                    style: WireStyle.ORTHOGONAL
                });
            }
        }
        const t361 = KiCadParser.extractBlocks(l361, 'label');
        for (let u361 = 0; u361 < t361.length; u361++) {
            const v361 = KiCadParser.extractQuoted(t361[u361]) ?? `NET_${o361.nets.length + 1}`;
            const w361 = v361 === 'VCC' || v361 === 'VDD' ? NetType.POWER :
                (v361 === 'GND' ? NetType.GROUND : NetType.SIGNAL);
            o361.nets.push({ id: IdUtil.generate('net'), name: v361, type: w361, pinIds: [] });
        }
        if (o361.nets.length === 0) {
            o361.nets.push({ id: IdUtil.generate('net'), name: 'GND', type: NetType.GROUND, pinIds: [] });
            o361.nets.push({ id: IdUtil.generate('net'), name: 'VCC', type: NetType.POWER, pinIds: [] });
        }
        return { doc: o361, mappedCount: q361, unmappedParts: p361 };
    }
    private static extractBlocks(g361: string, h361: string): string[] {
        const i361: string[] = [];
        const j361 = new RegExp(`\\(${h361}[\\s\\S]*?\\n\\)`, 'g');
        let k361: RegExpExecArray | null;
        while ((k361 = j361.exec(g361)) !== null) {
            i361.push(k361[0]);
        }
        return i361;
    }
    private static extractField(c361: string, d361: string): string | null {
        const e361 = new RegExp(`\\(${d361}\\s+"([^"]*)"\\)`);
        const f361 = c361.match(e361);
        return f361 ? f361[1] : null;
    }
    private static extractProperty(y360: string, z360: string): string | null {
        const a361 = new RegExp(`\\(property\\s+"${z360}"\\s+"([^"]*)"`);
        const b361 = y360.match(a361);
        return b361 ? b361[1] : null;
    }
    private static extractQuoted(w360: string): string | null {
        const x360 = w360.match(/"([^"]+)"/);
        return x360 ? x360[1] : null;
    }
    private static extractPoints(s360: string): Point2D[] {
        const t360: Point2D[] = [];
        const u360 = /\(xy\s+([\d.-]+)\s+([\d.-]+)\)/g;
        let v360: RegExpExecArray | null;
        while ((v360 = u360.exec(s360)) !== null) {
            t360.push({ x: parseFloat(v360[1]) * 39.37, y: parseFloat(v360[2]) * 39.37 });
        }
        return t360;
    }
    private static mapLibId(p360: string): string {
        const q360 = p360.toUpperCase();
        if (q360.includes('STM32F103'))
            return 'STM32F103C8';
        if (q360.includes('RESISTOR') || q360.includes(':R'))
            return 'R_10k';
        if (q360.includes('CAPACITOR') || q360.includes(':C'))
            return 'C_100nF';
        if (q360.includes('LED'))
            return 'LED_RED';
        if (q360.includes('74HC04'))
            return '74HC04';
        const r360 = p360.split(':');
        return r360.length > 1 ? r360[1] : p360;
    }
}
