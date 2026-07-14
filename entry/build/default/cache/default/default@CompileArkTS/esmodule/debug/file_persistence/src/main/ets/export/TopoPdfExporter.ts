import type { SchTopology } from 'common';
import { TopoSvgExporter } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/ets/export/TopoSvgExporter";
export class TopoPdfExporter {
    /** 生成含 SVG 注释块 + 基础矢量图形的混合 PDF（多数阅读器可打开） */
    static export(topo: SchTopology): string {
        const svg = TopoSvgExporter.export(topo);
        const svgSnippet = svg.length > 2000 ? svg.substring(0, 2000) + '\n<!-- truncated -->' : svg;
        const lines: string[] = [];
        lines.push('0.5 0.5 0.5 rg');
        lines.push('BT /F1 12 Tf 50 750 Td (ElecDraw Schematic Export) Tj ET');
        lines.push('0 0 0.8 RG 1 w');
        for (let i = 0; i < topo.wireList.length; i++) {
            const wire = topo.wireList[i];
            const pts = wire.points;
            if (pts.length < 2) {
                continue;
            }
            lines.push(`${pts[0].x} ${600 - pts[0].y} m`);
            for (let j = 1; j < pts.length; j++) {
                lines.push(`${pts[j].x} ${600 - pts[j].y} l`);
            }
            lines.push('S');
        }
        for (let i = 0; i < topo.deviceList.length; i++) {
            const d = topo.deviceList[i];
            const x = d.x - 28;
            const y = 600 - (d.y + 18);
            lines.push(`${x} ${y} 56 36 re S`);
            lines.push('BT /F1 8 Tf');
            lines.push(`${d.x - 20} ${600 - d.y} Td (${TopoPdfExporter.pdfEscape(d.refName)}) Tj ET`);
        }
        const streamBody = lines.join('\n');
        const commentBlock = `% SVG backup:\n% ${svgSnippet.replace(/\n/g, '\n% ')}`;
        const objects: string[] = [];
        objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
        objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
        objects.push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 600] ');
        objects.push('/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n');
        objects.push(`4 0 obj\n<< /Length ${streamBody.length} >>\nstream\n${streamBody}\nendstream\nendobj\n`);
        objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');
        let pdf = '%PDF-1.4\n';
        pdf += commentBlock + '\n';
        const offsets: number[] = [0];
        for (let i = 0; i < objects.length; i++) {
            offsets.push(pdf.length);
            pdf += objects[i];
        }
        const xrefPos = pdf.length;
        pdf += `xref\n0 ${objects.length + 1}\n`;
        pdf += '0000000000 65535 f \n';
        for (let i = 1; i < offsets.length; i++) {
            const off = offsets[i].toString().padStart(10, '0');
            pdf += `${off} 00000 n \n`;
        }
        pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
        pdf += `startxref\n${xrefPos}\n%%EOF\n`;
        return pdf;
    }
    private static pdfEscape(text: string): string {
        return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    }
}
