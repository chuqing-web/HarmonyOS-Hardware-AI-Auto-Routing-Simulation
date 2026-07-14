import { NetType, IdUtil, WireStyle } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchematicDocument, Point2D } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { emptyParameters } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/ets/internal/FilePersistenceHelpers";
import type { ImportReport } from './ImportReport';
export class ProteusParser {
    static parse(q363: string, r363: string): ImportReport {
        const s363 = new Date().toISOString();
        const t363: SchematicDocument = {
            id: IdUtil.generate('sch'),
            name: r363.replace(/\.[^.]+$/, ''),
            version: '1.0',
            components: [],
            wires: [],
            nets: [],
            netLabels: [],
            subcircuits: [],
            metadata: {
                author: 'Proteus Import',
                createdAt: s363, modifiedAt: s363,
                description: `Imported from ${r363}`,
                gridSize: 10, units: 'mil', undoLimit: 1000
            }
        };
        const u363: string[] = [];
        let v363 = 0;
        const w363 = new Map<string, string>();
        const x363 = q363.split(/\r?\n/);
        let y363 = 100;
        let z363 = 100;
        let a364: Point2D | null = null;
        for (const b364 of x363) {
            const c364 = b364.trim();
            if (c364.startsWith('COMPONENT') || c364.startsWith('PART')) {
                const k364 = c364.split(/\s+/);
                const l364 = k364[1] ?? 'UNKNOWN';
                const m364 = k364.length > 3 ? parseFloat(k364[3]) : y363;
                const n364 = k364.length > 4 ? parseFloat(k364[4]) : z363;
                const o364 = k364.length > 5 ? parseInt(k364[5], 10) : 0;
                const p364 = ProteusParser.mapPartName(l364);
                if (p364 === l364)
                    u363.push(l364);
                else
                    v363++;
                t363.components.push({
                    id: IdUtil.generate('comp'),
                    libraryId: p364,
                    refDes: k364[2] ?? `U${t363.components.length + 1}`,
                    position: { x: m364, y: n364 },
                    rotation: ProteusParser.normalizeRot(o364),
                    mirrored: false,
                    parameters: emptyParameters()
                });
                y363 += 80;
                if (y363 > 600) {
                    y363 = 100;
                    z363 += 80;
                }
            }
            if (c364.startsWith('NET') || c364.startsWith('WIRE')) {
                const d364 = c364.split(/\s+/);
                const e364 = d364[1] ?? `NET_${t363.nets.length + 1}`;
                if (!w363.has(e364)) {
                    const i364 = IdUtil.generate('net');
                    w363.set(e364, i364);
                    const j364 = e364 === 'VCC' || e364 === 'VDD' ? NetType.POWER :
                        (e364 === 'GND' || e364 === 'VSS' ? NetType.GROUND : NetType.SIGNAL);
                    t363.nets.push({ id: i364, name: e364, type: j364, pinIds: [] });
                }
                if (d364.length >= 5) {
                    const g364: Point2D = { x: parseFloat(d364[2]), y: parseFloat(d364[3]) };
                    const h364: Point2D = { x: parseFloat(d364[4]), y: parseFloat(d364[5] ?? d364[4]) };
                    t363.wires.push({
                        id: IdUtil.generate('wire'),
                        netId: w363.get(e364)!,
                        points: [g364, h364],
                        style: WireStyle.ORTHOGONAL
                    });
                }
                else if (d364.length >= 4) {
                    const f364: Point2D = { x: parseFloat(d364[2]), y: parseFloat(d364[3]) };
                    if (a364 === null)
                        a364 = f364;
                    else {
                        t363.wires.push({
                            id: IdUtil.generate('wire'),
                            netId: w363.get(e364)!,
                            points: [a364, f364],
                            style: WireStyle.ORTHOGONAL
                        });
                        a364 = null;
                    }
                }
            }
        }
        if (t363.components.length === 0) {
            ProteusParser.parseXmlStyle(q363, t363, u363);
            v363 = t363.components.length - u363.length;
        }
        return { doc: t363, mappedCount: v363, unmappedParts: u363 };
    }
    private static normalizeRot(o363: number): 0 | 90 | 180 | 270 {
        const p363 = ((o363 % 360) + 360) % 360;
        if (p363 === 90)
            return 90;
        if (p363 === 180)
            return 180;
        if (p363 === 270)
            return 270;
        return 0;
    }
    private static parseXmlStyle(g363: string, h363: SchematicDocument, i363: string[]): void {
        const j363 = /<comp[^>]*name="([^"]*)"[^>]*(?:x="([\d.]+)")?[^>]*(?:y="([\d.]+)")?[^>]*(?:rotate="([\d.]+)")?[^>]*>/gi;
        let k363: RegExpExecArray | null;
        let l363 = 100;
        let m363 = 100;
        while ((k363 = j363.exec(g363)) !== null) {
            const n363 = ProteusParser.mapPartName(k363[1]);
            if (n363 === k363[1])
                i363.push(k363[1]);
            h363.components.push({
                id: IdUtil.generate('comp'),
                libraryId: n363,
                refDes: `U${h363.components.length + 1}`,
                position: { x: k363[2] ? parseFloat(k363[2]) : l363, y: k363[3] ? parseFloat(k363[3]) : m363 },
                rotation: ProteusParser.normalizeRot(k363[4] ? parseInt(k363[4], 10) : 0),
                mirrored: false, parameters: emptyParameters()
            });
            l363 += 80;
        }
    }
    private static mapPartName(e363: string): string {
        const f363 = e363.toUpperCase();
        if (f363.includes('AT89C51'))
            return 'AT89C51';
        if (f363.includes('AT89C52'))
            return 'AT89C52';
        if (f363.includes('STC89'))
            return 'STC89C52';
        if (f363.includes('STM32F103C8T6'))
            return 'STM32F103C8T6';
        if (f363.includes('STM32F103'))
            return 'STM32F103C8';
        if (f363.includes('STM32F407'))
            return 'STM32F407VG';
        if (f363.includes('GD32F103'))
            return 'GD32F103C8';
        if (f363.includes('74HC04') || f363 === '7404')
            return '74HC04';
        if (f363.includes('74HC08'))
            return '74HC08';
        if (f363.includes('74HC00'))
            return '74HC00';
        if (f363.includes('74HC595'))
            return '74HC595';
        if (f363.includes('LM358'))
            return 'LM358';
        if (f363.includes('OSCILLOSCOPE') || f363 === 'OSC')
            return 'OSCILLOSCOPE';
        if (f363.includes('RES') || f363.startsWith('R'))
            return 'R_10k';
        if (f363.includes('CAP') || f363.startsWith('C'))
            return 'C_100nF';
        if (f363.includes('LED'))
            return 'LED_RED';
        if (f363.includes('CRYSTAL') || f363.includes('XTAL'))
            return 'XTAL_11M';
        if (f363.includes('1N4148'))
            return '1N4148';
        if (f363.includes('1N4007'))
            return '1N4007';
        if (f363.includes('CH340'))
            return 'CH340G';
        return e363;
    }
}
