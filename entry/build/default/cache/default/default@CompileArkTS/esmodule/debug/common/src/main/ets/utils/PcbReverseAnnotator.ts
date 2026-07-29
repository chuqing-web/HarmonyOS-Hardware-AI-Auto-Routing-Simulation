import type { SchematicDocument, ComponentInstance } from '../types/CommonTypes';
import type { PcbDocument } from '../types/PcbTypes';
import { getGlobalPcbFootprintLibrary } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbFootprintLibrary";
import { tracePcbReverseResult } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbTraceLog";
export interface ReverseAnnotateResult {
    updatedCount: number;
    skippedCount: number;
    messages: string[];
}
export function reverseAnnotatePcb(pcb: PcbDocument, schematic: SchematicDocument): ReverseAnnotateResult {
    const lib = getGlobalPcbFootprintLibrary();
    const compById: Map<string, ComponentInstance> = new Map();
    for (const c of schematic.components) {
        compById.set(c.id, c);
    }
    let updated = 0;
    let skipped = 0;
    const messages: string[] = [];
    for (const fp of pcb.footprints) {
        if (!fp.schematicCompId || fp.schematicCompId.length === 0) {
            skipped++;
            continue;
        }
        const comp = compById.get(fp.schematicCompId);
        if (!comp) {
            skipped++;
            messages.push(`原理图无对应器件: ${fp.refDes}`);
            continue;
        }
        comp.refDes = fp.refDes;
        comp.rotation = fp.rotation;
        comp.parameters.set('value', fp.value);
        comp.parameters.set('Value', fp.value);
        const def = lib.getDef(fp.defId);
        const fpName = def ? def.name : fp.defId;
        comp.parameters.set('footprint', fpName);
        comp.parameters.set('package', fpName);
        updated++;
    }
    schematic.metadata.modifiedAt = new Date().toISOString();
    if (updated === 0) {
        messages.push('没有可回写的封装（需先正向标注建立关联）');
    }
    else {
        messages.push(`已回写 ${updated} 个器件`);
    }
    tracePcbReverseResult(updated, skipped, messages);
    return { updatedCount: updated, skippedCount: skipped, messages };
}
