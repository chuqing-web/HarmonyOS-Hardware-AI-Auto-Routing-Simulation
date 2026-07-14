import type { SchTopology } from 'common';
import { TopoSvgExporter } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/ets/export/TopoSvgExporter";
export class TopoPdfExporter {
    static export(i341: SchTopology): string {
        const j341 = TopoSvgExporter.export(i341);
        const k341 = j341.length > 2000 ? j341.substring(0, 2000) + '\n<!-- truncated -->' : j341;
        const l341: string[] = [];
        l341.push('0.5 0.5 0.5 rg');
        l341.push('BT /F1 12 Tf 50 750 Td (ElecDraw Schematic Export) Tj ET');
        l341.push('0 0 0.8 RG 1 w');
        for (let z341 = 0; z341 < i341.wireList.length; z341++) {
            const a342 = i341.wireList[z341];
            const b342 = a342.points;
            if (b342.length < 2) {
                continue;
            }
            l341.push(`${b342[0].x} ${600 - b342[0].y} m`);
            for (let c342 = 1; c342 < b342.length; c342++) {
                l341.push(`${b342[c342].x} ${600 - b342[c342].y} l`);
            }
            l341.push('S');
        }
        for (let v341 = 0; v341 < i341.deviceList.length; v341++) {
            const w341 = i341.deviceList[v341];
            const x341 = w341.x - 28;
            const y341 = 600 - (w341.y + 18);
            l341.push(`${x341} ${y341} 56 36 re S`);
            l341.push('BT /F1 8 Tf');
            l341.push(`${w341.x - 20} ${600 - w341.y} Td (${TopoPdfExporter.pdfEscape(w341.refName)}) Tj ET`);
        }
        const m341 = l341.join('\n');
        const n341 = `% SVG backup:\n% ${k341.replace(/\n/g, '\n% ')}`;
        const o341: string[] = [];
        o341.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
        o341.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
        o341.push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 600] ');
        o341.push('/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n');
        o341.push(`4 0 obj\n<< /Length ${m341.length} >>\nstream\n${m341}\nendstream\nendobj\n`);
        o341.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');
        let p341 = '%PDF-1.4\n';
        p341 += n341 + '\n';
        const q341: number[] = [0];
        for (let u341 = 0; u341 < o341.length; u341++) {
            q341.push(p341.length);
            p341 += o341[u341];
        }
        const r341 = p341.length;
        p341 += `xref\n0 ${o341.length + 1}\n`;
        p341 += '0000000000 65535 f \n';
        for (let s341 = 1; s341 < q341.length; s341++) {
            const t341 = q341[s341].toString().padStart(10, '0');
            p341 += `${t341} 00000 n \n`;
        }
        p341 += `trailer\n<< /Size ${o341.length + 1} /Root 1 0 R >>\n`;
        p341 += `startxref\n${r341}\n%%EOF\n`;
        return p341;
    }
    private static pdfEscape(h341: string): string {
        return h341.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    }
}
