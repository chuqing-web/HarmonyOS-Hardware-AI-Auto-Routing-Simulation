import { paramMapGet } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchematicDocument, ComponentInstance } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
export interface BomLookup {
    getDisplayName(libraryId: string): string;
    getDefaultValue(libraryId: string): string;
}
interface BomGroupKey {
    partKey: string;
    value: string;
    footprint: string;
}
interface BomGroup {
    refs: string[];
    displayName: string;
    value: string;
    footprint: string;
}
function extractValue(comp: ComponentInstance, lookup?: BomLookup): string {
    const keys: string[] = ['value', 'Value', 'resistance', 'capacitance', 'voltage', 'part', '型号'];
    for (let i = 0; i < keys.length; i++) {
        const v = paramMapGet(comp.parameters, keys[i], '');
        if (v.length > 0) {
            return v;
        }
    }
    if (lookup !== undefined) {
        const def = lookup.getDefaultValue(comp.libraryId);
        if (def.length > 0) {
            return def;
        }
    }
    return '';
}
function extractFootprint(comp: ComponentInstance): string {
    const keys: string[] = ['footprint', 'package', 'Package', '封装', 'pkg'];
    for (let i = 0; i < keys.length; i++) {
        const v = paramMapGet(comp.parameters, keys[i], '');
        if (v.length > 0) {
            return v;
        }
    }
    return '';
}
function groupKey(partKey: string, value: string, footprint: string): string {
    return `${partKey}|${value}|${footprint}`;
}
export function buildBomCsv(doc: SchematicDocument, lookup?: BomLookup): string {
    const groups: Map<string, BomGroup> = new Map();
    for (let i = 0; i < doc.components.length; i++) {
        const comp = doc.components[i];
        const value = extractValue(comp, lookup);
        const footprint = extractFootprint(comp);
        const displayName = lookup !== undefined ? lookup.getDisplayName(comp.libraryId) : comp.libraryId;
        const key = groupKey(comp.libraryId, value, footprint);
        let group = groups.get(key);
        if (group === undefined) {
            group = { refs: [], displayName, value, footprint };
            groups.set(key, group);
        }
        group.refs.push(comp.refDes);
    }
    let csv = '位号,器件型号,封装/值,数量,备注\n';
    groups.forEach((info: BomGroup, key: string) => {
        const partId = key.split('|')[0];
        const valueCol = info.value.length > 0 ? info.value : info.footprint;
        const remark = info.displayName !== partId ? info.displayName : '';
        csv += `"${info.refs.join(' ')}","${partId}","${valueCol}",${info.refs.length},"${remark}"\n`;
    });
    return csv;
}
