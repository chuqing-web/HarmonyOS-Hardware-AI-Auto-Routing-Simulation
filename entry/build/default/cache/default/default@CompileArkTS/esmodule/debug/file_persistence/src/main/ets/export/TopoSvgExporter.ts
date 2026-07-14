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
    static export(topo: SchTopology): string {
        const bounds = TopoSvgExporter.calcBounds(topo);
        const pad = 40;
        const vbW = Math.max(bounds.width + pad * 2, 400);
        const vbH = Math.max(bounds.height + pad * 2, 300);
        const ox = bounds.minX - pad;
        const oy = bounds.minY - pad;
        const bg = topo.bgColor && topo.bgColor.length > 0 ? topo.bgColor : '#ffffff';
        let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        svg += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" width="${vbW}" height="${vbH}">\n`;
        svg += `<rect width="100%" height="100%" fill="${bg}"/>\n`;
        svg += `<g transform="translate(${-ox}, ${-oy})">\n`;
        for (let i = 0; i < topo.wireList.length; i++) {
            svg += TopoSvgExporter.wireToSvg(topo.wireList[i]);
        }
        for (let i = 0; i < topo.deviceList.length; i++) {
            svg += TopoSvgExporter.deviceToSvg(topo.deviceList[i]);
        }
        for (let i = 0; i < topo.textAnnotate.length; i++) {
            const t = topo.textAnnotate[i];
            svg += `<text x="${t.x}" y="${t.y}" fill="#333" font-size="10" font-family="sans-serif">${TopoSvgExporter.escape(t.text)}</text>\n`;
        }
        svg += `</g>\n</svg>`;
        return svg;
    }
    private static calcBounds(topo: SchTopology): ViewBounds {
        let minX = 0;
        let minY = 0;
        let maxX = 800;
        let maxY = 600;
        let initialized = false;
        const include = (x: number, y: number): void => {
            if (!initialized) {
                minX = x;
                maxX = x;
                minY = y;
                maxY = y;
                initialized = true;
            }
            else {
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }
        };
        for (let i = 0; i < topo.deviceList.length; i++) {
            const d = topo.deviceList[i];
            include(d.x - 30, d.y - 20);
            include(d.x + 30, d.y + 20);
        }
        for (let i = 0; i < topo.wireList.length; i++) {
            const pts = topo.wireList[i].points;
            for (let j = 0; j < pts.length; j++) {
                include(pts[j].x, pts[j].y);
            }
        }
        if (!initialized) {
            return { minX: 0, minY: 0, maxX: 800, maxY: 600, width: 800, height: 600 };
        }
        return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    }
    private static wireToSvg(wire: RouteLine): string {
        if (wire.points.length < 2) {
            return '';
        }
        const stroke = wire.isBus ? '#c08020' : '#0066cc';
        const width = wire.isBus ? 2 : 1;
        let path = `M ${wire.points[0].x} ${wire.points[0].y}`;
        for (let i = 1; i < wire.points.length; i++) {
            path += ` L ${wire.points[i].x} ${wire.points[i].y}`;
        }
        let svg = `<path d="${path}" fill="none" stroke="${stroke}" stroke-width="${width}"/>\n`;
        for (let i = 0; i < wire.points.length; i++) {
            const p = wire.points[i];
            svg += `<circle cx="${p.x}" cy="${p.y}" r="2" fill="${stroke}"/>\n`;
        }
        return svg;
    }
    private static deviceToSvg(dev: DeviceInst): string {
        const value = paramMapGet(dev.params, 'value', paramMapGet(dev.params, 'Value', ''));
        const w = 56;
        const h = 36;
        const x = dev.x - w / 2;
        const y = dev.y - h / 2;
        let svg = `<g>\n`;
        svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#f8f8fc" stroke="#333" stroke-width="1.2"/>\n`;
        svg += `<text x="${dev.x}" y="${dev.y - 4}" text-anchor="middle" fill="#111" font-size="9" font-family="sans-serif" font-weight="bold">${TopoSvgExporter.escape(dev.refName)}</text>\n`;
        svg += `<text x="${dev.x}" y="${dev.y + 10}" text-anchor="middle" fill="#555" font-size="7" font-family="sans-serif">${TopoSvgExporter.escape(dev.libDevId)}</text>\n`;
        if (value.length > 0) {
            svg += `<text x="${dev.x}" y="${dev.y + 20}" text-anchor="middle" fill="#0066aa" font-size="7" font-family="sans-serif">${TopoSvgExporter.escape(value)}</text>\n`;
        }
        svg += `</g>\n`;
        return svg;
    }
    private static escape(text: string): string {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}
