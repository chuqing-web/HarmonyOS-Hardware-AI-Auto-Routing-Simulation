import { paramMapGet } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchTopology, DeviceInst, RouteLine } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
interface ViewBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
}
export class TopoSvgExporter {
    static export(m347: SchTopology): string {
        const n347 = TopoSvgExporter.calcBounds(m347);
        const o347 = 40;
        const p347 = Math.max(n347.width + o347 * 2, 400);
        const q347 = Math.max(n347.height + o347 * 2, 300);
        const r347 = n347.minX - o347;
        const s347 = n347.minY - o347;
        const t347 = m347.bgColor && m347.bgColor.length > 0 ? m347.bgColor : '#ffffff';
        let u347 = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        u347 += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${p347} ${q347}" width="${p347}" height="${q347}">\n`;
        u347 += `<rect width="100%" height="100%" fill="${t347}"/>\n`;
        u347 += `<g transform="translate(${-r347}, ${-s347})">\n`;
        for (let y347 = 0; y347 < m347.wireList.length; y347++) {
            u347 += TopoSvgExporter.wireToSvg(m347.wireList[y347]);
        }
        for (let x347 = 0; x347 < m347.deviceList.length; x347++) {
            u347 += TopoSvgExporter.deviceToSvg(m347.deviceList[x347]);
        }
        for (let v347 = 0; v347 < m347.textAnnotate.length; v347++) {
            const w347 = m347.textAnnotate[v347];
            u347 += `<text x="${w347.x}" y="${w347.y}" fill="#333" font-size="10" font-family="sans-serif">${TopoSvgExporter.escape(w347.text)}</text>\n`;
        }
        u347 += `</g>\n</svg>`;
        return u347;
    }
    private static calcBounds(y346: SchTopology): ViewBounds {
        let z346 = 0;
        let a347 = 0;
        let b347 = 800;
        let c347 = 600;
        let d347 = false;
        const e347 = (k347: number, l347: number): void => {
            if (!d347) {
                z346 = k347;
                b347 = k347;
                a347 = l347;
                c347 = l347;
                d347 = true;
            }
            else {
                z346 = Math.min(z346, k347);
                b347 = Math.max(b347, k347);
                a347 = Math.min(a347, l347);
                c347 = Math.max(c347, l347);
            }
        };
        for (let i347 = 0; i347 < y346.deviceList.length; i347++) {
            const j347 = y346.deviceList[i347];
            e347(j347.x - 30, j347.y - 20);
            e347(j347.x + 30, j347.y + 20);
        }
        for (let f347 = 0; f347 < y346.wireList.length; f347++) {
            const g347 = y346.wireList[f347].points;
            for (let h347 = 0; h347 < g347.length; h347++) {
                e347(g347[h347].x, g347[h347].y);
            }
        }
        if (!d347) {
            return { minX: 0, minY: 0, maxX: 800, maxY: 600, width: 800, height: 600 };
        }
        return { minX: z346, minY: a347, maxX: b347, maxY: c347, width: b347 - z346, height: c347 - a347 };
    }
    private static wireToSvg(q346: RouteLine): string {
        if (q346.points.length < 2) {
            return '';
        }
        const r346 = q346.isBus ? '#c08020' : '#0066cc';
        const s346 = q346.isBus ? 2 : 1;
        let t346 = `M ${q346.points[0].x} ${q346.points[0].y}`;
        for (let x346 = 1; x346 < q346.points.length; x346++) {
            t346 += ` L ${q346.points[x346].x} ${q346.points[x346].y}`;
        }
        let u346 = `<path d="${t346}" fill="none" stroke="${r346}" stroke-width="${s346}"/>\n`;
        for (let v346 = 0; v346 < q346.points.length; v346++) {
            const w346 = q346.points[v346];
            u346 += `<circle cx="${w346.x}" cy="${w346.y}" r="2" fill="${r346}"/>\n`;
        }
        return u346;
    }
    private static deviceToSvg(j346: DeviceInst): string {
        const k346 = paramMapGet(j346.params, 'value', paramMapGet(j346.params, 'Value', ''));
        const l346 = 56;
        const m346 = 36;
        const n346 = j346.x - l346 / 2;
        const o346 = j346.y - m346 / 2;
        let p346 = `<g>\n`;
        p346 += `<rect x="${n346}" y="${o346}" width="${l346}" height="${m346}" rx="3" fill="#f8f8fc" stroke="#333" stroke-width="1.2"/>\n`;
        p346 += `<text x="${j346.x}" y="${j346.y - 4}" text-anchor="middle" fill="#111" font-size="9" font-family="sans-serif" font-weight="bold">${TopoSvgExporter.escape(j346.refName)}</text>\n`;
        p346 += `<text x="${j346.x}" y="${j346.y + 10}" text-anchor="middle" fill="#555" font-size="7" font-family="sans-serif">${TopoSvgExporter.escape(j346.libDevId)}</text>\n`;
        if (k346.length > 0) {
            p346 += `<text x="${j346.x}" y="${j346.y + 20}" text-anchor="middle" fill="#0066aa" font-size="7" font-family="sans-serif">${TopoSvgExporter.escape(k346)}</text>\n`;
        }
        p346 += `</g>\n`;
        return p346;
    }
    private static escape(i346: string): string {
        return i346.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}
