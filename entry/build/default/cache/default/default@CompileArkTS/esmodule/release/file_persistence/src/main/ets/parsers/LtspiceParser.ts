import { NetType, IdUtil } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchematicDocument } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { emptyParameters } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/ets/internal/FilePersistenceHelpers";
import type { ImportReport } from './ImportReport';
export class LtspiceParser {
    static parse(n362: string, o362: string): ImportReport {
        const p362 = new Date().toISOString();
        const q362: SchematicDocument = {
            id: IdUtil.generate('sch'),
            name: o362.replace(/\.[^.]+$/, ''),
            version: '1.0',
            components: [],
            wires: [],
            nets: [],
            netLabels: [],
            subcircuits: [],
            metadata: {
                author: 'LTspice Import',
                createdAt: p362, modifiedAt: p362,
                description: `Imported from ${o362}`,
                gridSize: 10, units: 'mil', undoLimit: 1000
            }
        };
        const r362: string[] = [];
        let s362 = 0;
        const t362 = n362.split(/\r?\n/);
        let u362 = 100;
        let v362 = 100;
        for (const x362 of t362) {
            const y362 = x362.trim();
            if (y362.startsWith('*') || y362.length === 0)
                continue;
            const z362 = y362.split(/\s+/);
            const a363 = z362[0].charAt(0).toUpperCase();
            if (a363 === 'R' || a363 === 'C' || a363 === 'L' || a363 === 'D' || a363 === 'V') {
                const c363 = z362[0];
                const d363 = LtspiceParser.mapRef(c363, z362.length > 1 ? z362[1] : '');
                if (d363.startsWith('UNKNOWN'))
                    r362.push(c363);
                else
                    s362++;
                q362.components.push({
                    id: IdUtil.generate('comp'),
                    libraryId: d363,
                    refDes: c363,
                    position: { x: u362, y: v362 },
                    rotation: 0, mirrored: false,
                    parameters: emptyParameters()
                });
                u362 += 80;
                if (u362 > 600) {
                    u362 = 100;
                    v362 += 80;
                }
            }
            if (a363 === 'W' || y362.startsWith('WIRE')) {
                const b363 = z362[1] ?? `NET_${q362.nets.length + 1}`;
                q362.nets.push({
                    id: IdUtil.generate('net'),
                    name: b363,
                    type: b363 === 'GND' ? NetType.GROUND : NetType.SIGNAL,
                    pinIds: []
                });
            }
        }
        if (!q362.nets.some(w362 => w362.name === 'GND')) {
            q362.nets.push({ id: IdUtil.generate('net'), name: 'GND', type: NetType.GROUND, pinIds: [] });
        }
        return { doc: q362, mappedCount: s362, unmappedParts: r362 };
    }
    private static mapRef(k362: string, l362: string): string {
        const m362 = k362.charAt(0).toUpperCase();
        if (m362 === 'R')
            return 'R_10k';
        if (m362 === 'C')
            return 'C_100nF';
        if (m362 === 'D')
            return '1N4148';
        if (m362 === 'V')
            return l362.includes('AC') ? 'SIGNAL_GEN' : 'VCC';
        return `UNKNOWN_${k362}`;
    }
}
