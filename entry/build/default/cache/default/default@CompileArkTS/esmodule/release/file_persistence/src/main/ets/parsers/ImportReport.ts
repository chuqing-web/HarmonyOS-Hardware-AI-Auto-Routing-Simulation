import type { SchematicDocument } from 'common';
export interface ImportReport {
    doc: SchematicDocument;
    mappedCount: number;
    unmappedParts: string[];
}
export function formatImportReport(l360: ImportReport): string {
    const m360 = l360.doc.components.length;
    const n360 = m360 > 0 ? Math.round(l360.mappedCount / m360 * 100) : 0;
    let o360 = `${n360}% 器件已映射 (${l360.mappedCount}/${m360})`;
    if (l360.unmappedParts.length > 0) {
        o360 += `，以下器件使用占位符：${l360.unmappedParts.slice(0, 10).join(', ')}`;
    }
    return o360;
}
