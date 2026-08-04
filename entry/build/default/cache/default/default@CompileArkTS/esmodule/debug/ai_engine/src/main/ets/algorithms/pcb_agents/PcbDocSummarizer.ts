import { copperLayersFromStack, padWorldPosition } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { PcbDocument } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
export class PcbDocSummarizer {
    static boardOutline(doc: PcbDocument): string {
        const pts = doc.boardOutline?.points ?? [];
        return pts.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join(';');
    }
    static copperLayers(doc: PcbDocument): string {
        return copperLayersFromStack(doc.layerStack).join(',');
    }
    static footprintList(doc: PcbDocument): string {
        const lines: string[] = [];
        for (const fp of doc.footprints) {
            lines.push(`${fp.id}|${fp.refDes}|${fp.defId}|pos=${Math.round(fp.position.x)},${Math.round(fp.position.y)}|rot=${fp.rotation}|locked=${fp.locked}`);
        }
        return lines.join('\n');
    }
    static netList(doc: PcbDocument): string {
        const lines: string[] = [];
        for (const n of doc.nets) {
            let pads = 0;
            for (const fp of doc.footprints) {
                for (const pad of fp.pads) {
                    if ((pad.netId ?? '') === n.id) {
                        pads++;
                    }
                }
            }
            lines.push(`${n.id}|${n.name}|pads=${pads}`);
        }
        return lines.join('\n');
    }
    static padSummary(doc: PcbDocument): string {
        const lines: string[] = [];
        let count = 0;
        for (const fp of doc.footprints) {
            for (const pad of fp.pads) {
                if (!pad.netId) {
                    continue;
                }
                const w = padWorldPosition(fp, pad);
                lines.push(`${fp.refDes}.${pad.number}->${pad.netName}@${Math.round(w.x)},${Math.round(w.y)}`);
                count++;
                if (count >= 80) {
                    lines.push('...(truncated)');
                    return lines.join('; ');
                }
            }
        }
        return lines.join('; ');
    }
    static boardSummary(doc: PcbDocument): string {
        return `name=${doc.name} fp=${doc.footprints.length} nets=${doc.nets.length} cu=${doc.layerStack.copperCount}`;
    }
}
