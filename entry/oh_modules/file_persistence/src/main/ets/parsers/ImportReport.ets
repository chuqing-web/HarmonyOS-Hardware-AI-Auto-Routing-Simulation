/**
 * 导入兼容度报告
 */
import { SchematicDocument } from 'common';

export interface ImportReport {
  doc: SchematicDocument;
  mappedCount: number;
  unmappedParts: string[];
}

export function formatImportReport(report: ImportReport): string {
  const total = report.doc.components.length;
  const pct = total > 0 ? Math.round(report.mappedCount / total * 100) : 0;
  let msg = `${pct}% 器件已映射 (${report.mappedCount}/${total})`;
  if (report.unmappedParts.length > 0) {
    msg += `，以下器件使用占位符：${report.unmappedParts.slice(0, 10).join(', ')}`;
  }
  return msg;
}
