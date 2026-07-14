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
function extractValue(e358: ComponentInstance, f358?: BomLookup): string {
    const g358: string[] = ['value', 'Value', 'resistance', 'capacitance', 'voltage', 'part', '型号'];
    for (let i358 = 0; i358 < g358.length; i358++) {
        const j358 = paramMapGet(e358.parameters, g358[i358], '');
        if (j358.length > 0) {
            return j358;
        }
    }
    if (f358 !== undefined) {
        const h358 = f358.getDefaultValue(e358.libraryId);
        if (h358.length > 0) {
            return h358;
        }
    }
    return '';
}
function extractFootprint(a358: ComponentInstance): string {
    const b358: string[] = ['footprint', 'package', 'Package', '封装', 'pkg'];
    for (let c358 = 0; c358 < b358.length; c358++) {
        const d358 = paramMapGet(a358.parameters, b358[c358], '');
        if (d358.length > 0) {
            return d358;
        }
    }
    return '';
}
function groupKey(x357: string, y357: string, z357: string): string {
    return `${x357}|${y357}|${z357}`;
}
export function buildBomCsv(h357: SchematicDocument, i357?: BomLookup): string {
    const j357: Map<string, BomGroup> = new Map();
    for (let q357 = 0; q357 < h357.components.length; q357++) {
        const r357 = h357.components[q357];
        const s357 = extractValue(r357, i357);
        const t357 = extractFootprint(r357);
        const u357 = i357 !== undefined ? i357.getDisplayName(r357.libraryId) : r357.libraryId;
        const v357 = groupKey(r357.libraryId, s357, t357);
        let w357 = j357.get(v357);
        if (w357 === undefined) {
            w357 = { refs: [], displayName: u357, value: s357, footprint: t357 };
            j357.set(v357, w357);
        }
        w357.refs.push(r357.refDes);
    }
    let k357 = '位号,器件型号,封装/值,数量,备注\n';
    j357.forEach((l357: BomGroup, m357: string) => {
        const n357 = m357.split('|')[0];
        const o357 = l357.value.length > 0 ? l357.value : l357.footprint;
        const p357 = l357.displayName !== n357 ? l357.displayName : '';
        k357 += `"${l357.refs.join(' ')}","${n357}","${o357}",${l357.refs.length},"${p357}"\n`;
    });
    return k357;
}
