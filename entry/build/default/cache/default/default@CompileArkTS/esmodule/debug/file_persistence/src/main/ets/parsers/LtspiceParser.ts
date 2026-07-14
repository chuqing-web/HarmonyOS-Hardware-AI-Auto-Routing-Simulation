import { NetType, IdUtil } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchematicDocument } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { emptyParameters } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/ets/internal/FilePersistenceHelpers";
import type { ImportReport } from './ImportReport';
export class LtspiceParser {
    static parse(content: string, fileName: string): ImportReport {
        const now = new Date().toISOString();
        const doc: SchematicDocument = {
            id: IdUtil.generate('sch'),
            name: fileName.replace(/\.[^.]+$/, ''),
            version: '1.0',
            components: [],
            wires: [],
            nets: [],
            netLabels: [],
            subcircuits: [],
            metadata: {
                author: 'LTspice Import', createdAt: now, modifiedAt: now,
                description: `Imported from ${fileName}`, gridSize: 10, units: 'mil', undoLimit: 1000
            }
        };
        const unmapped: string[] = [];
        let mapped = 0;
        const lines = content.split(/\r?\n/);
        let x = 100;
        let y = 100;
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('*') || trimmed.length === 0)
                continue;
            const parts = trimmed.split(/\s+/);
            const prefix = parts[0].charAt(0).toUpperCase();
            if (prefix === 'R' || prefix === 'C' || prefix === 'L' || prefix === 'D' || prefix === 'V') {
                const ref = parts[0];
                const libId = LtspiceParser.mapRef(ref, parts.length > 1 ? parts[1] : '');
                if (libId.startsWith('UNKNOWN'))
                    unmapped.push(ref);
                else
                    mapped++;
                doc.components.push({
                    id: IdUtil.generate('comp'),
                    libraryId: libId,
                    refDes: ref,
                    position: { x: x, y: y },
                    rotation: 0, mirrored: false,
                    parameters: emptyParameters()
                });
                x += 80;
                if (x > 600) {
                    x = 100;
                    y += 80;
                }
            }
            if (prefix === 'W' || trimmed.startsWith('WIRE')) {
                const netName = parts[1] ?? `NET_${doc.nets.length + 1}`;
                doc.nets.push({
                    id: IdUtil.generate('net'), name: netName,
                    type: netName === 'GND' ? NetType.GROUND : NetType.SIGNAL, pinIds: []
                });
            }
        }
        if (!doc.nets.some(n => n.name === 'GND')) {
            doc.nets.push({ id: IdUtil.generate('net'), name: 'GND', type: NetType.GROUND, pinIds: [] });
        }
        return { doc: doc, mappedCount: mapped, unmappedParts: unmapped };
    }
    private static mapRef(ref: string, value: string): string {
        const p = ref.charAt(0).toUpperCase();
        if (p === 'R')
            return 'R_10k';
        if (p === 'C')
            return 'C_100nF';
        if (p === 'D')
            return '1N4148';
        if (p === 'V')
            return value.includes('AC') ? 'SIGNAL_GEN' : 'VCC';
        return `UNKNOWN_${ref}`;
    }
}
