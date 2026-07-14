import type { SchTopology } from 'common';
export class TopoPngExporter {
    static export(topo: SchTopology, width: number = 800, height: number = 600): Uint8Array {
        const pixels = new Uint8Array(width * height * 3);
        TopoPngExporter.fillBackground(pixels, width, height, 255, 255, 255);
        for (let i = 0; i < topo.wireList.length; i++) {
            const wire = topo.wireList[i];
            for (let j = 1; j < wire.points.length; j++) {
                TopoPngExporter.drawLine(pixels, width, height, Math.round(wire.points[j - 1].x), Math.round(wire.points[j - 1].y), Math.round(wire.points[j].x), Math.round(wire.points[j].y), 0, 0, 0);
            }
        }
        for (let i = 0; i < topo.deviceList.length; i++) {
            const dev = topo.deviceList[i];
            const x = Math.round(dev.x);
            const y = Math.round(dev.y);
            TopoPngExporter.fillRect(pixels, width, height, x - 20, y - 10, 40, 20, 240, 240, 240);
            TopoPngExporter.strokeRect(pixels, width, height, x - 20, y - 10, 40, 20, 0, 102, 204);
        }
        return TopoPngExporter.encodePng(pixels, width, height);
    }
    private static fillBackground(buf: Uint8Array, w: number, h: number, r: number, g: number, b: number): void {
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 3;
                buf[idx] = r;
                buf[idx + 1] = g;
                buf[idx + 2] = b;
            }
        }
    }
    private static setPixel(buf: Uint8Array, w: number, h: number, x: number, y: number, r: number, g: number, b: number): void {
        if (x < 0 || y < 0 || x >= w || y >= h)
            return;
        const idx = (y * w + x) * 3;
        buf[idx] = r;
        buf[idx + 1] = g;
        buf[idx + 2] = b;
    }
    private static drawLine(buf: Uint8Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number): void {
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;
        let cx = x0;
        let cy = y0;
        while (true) {
            TopoPngExporter.setPixel(buf, w, h, cx, cy, r, g, b);
            if (cx === x1 && cy === y1)
                break;
            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                cx += sx;
            }
            if (e2 < dx) {
                err += dx;
                cy += sy;
            }
        }
    }
    private static fillRect(buf: Uint8Array, w: number, h: number, rx: number, ry: number, rw: number, rh: number, r: number, g: number, b: number): void {
        for (let y = ry; y < ry + rh; y++) {
            for (let x = rx; x < rx + rw; x++) {
                TopoPngExporter.setPixel(buf, w, h, x, y, r, g, b);
            }
        }
    }
    private static strokeRect(buf: Uint8Array, w: number, h: number, rx: number, ry: number, rw: number, rh: number, r: number, g: number, b: number): void {
        for (let x = rx; x < rx + rw; x++) {
            TopoPngExporter.setPixel(buf, w, h, x, ry, r, g, b);
            TopoPngExporter.setPixel(buf, w, h, x, ry + rh - 1, r, g, b);
        }
        for (let y = ry; y < ry + rh; y++) {
            TopoPngExporter.setPixel(buf, w, h, rx, y, r, g, b);
            TopoPngExporter.setPixel(buf, w, h, rx + rw - 1, y, r, g, b);
        }
    }
    private static encodePng(rgb: Uint8Array, width: number, height: number): Uint8Array {
        const raw = new Uint8Array((width * 3 + 1) * height);
        for (let y = 0; y < height; y++) {
            raw[y * (width * 3 + 1)] = 0;
            for (let x = 0; x < width; x++) {
                const src = (y * width + x) * 3;
                const dst = y * (width * 3 + 1) + 1 + x * 3;
                raw[dst] = rgb[src];
                raw[dst + 1] = rgb[src + 1];
                raw[dst + 2] = rgb[src + 2];
            }
        }
        const compressed = TopoPngExporter.deflateStore(raw);
        const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
        const ihdr = TopoPngExporter.makeChunk('IHDR', TopoPngExporter.makeIhdr(width, height));
        const idat = TopoPngExporter.makeChunk('IDAT', compressed);
        const iend = TopoPngExporter.makeChunk('IEND', new Uint8Array(0));
        const total = signature.length + ihdr.length + idat.length + iend.length;
        const out = new Uint8Array(total);
        let off = 0;
        out.set(signature, off);
        off += signature.length;
        out.set(ihdr, off);
        off += ihdr.length;
        out.set(idat, off);
        off += idat.length;
        out.set(iend, off);
        return out;
    }
    private static makeIhdr(w: number, h: number): Uint8Array {
        const buf = new Uint8Array(13);
        TopoPngExporter.writeU32(buf, 0, w);
        TopoPngExporter.writeU32(buf, 4, h);
        buf[8] = 8;
        buf[9] = 2;
        buf[10] = 0;
        buf[11] = 0;
        buf[12] = 0;
        return buf;
    }
    private static writeU32(buf: Uint8Array, off: number, v: number): void {
        buf[off] = (v >> 24) & 0xFF;
        buf[off + 1] = (v >> 16) & 0xFF;
        buf[off + 2] = (v >> 8) & 0xFF;
        buf[off + 3] = v & 0xFF;
    }
    private static makeChunk(type: string, data: Uint8Array): Uint8Array {
        const chunk = new Uint8Array(12 + data.length);
        TopoPngExporter.writeU32(chunk, 0, data.length);
        for (let i = 0; i < 4; i++)
            chunk[4 + i] = type.charCodeAt(i);
        chunk.set(data, 8);
        const crc = TopoPngExporter.crc32(chunk.subarray(4, 8 + data.length));
        TopoPngExporter.writeU32(chunk, 8 + data.length, crc);
        return chunk;
    }
    private static deflateStore(data: Uint8Array): Uint8Array {
        const out: number[] = [0x78, 0x01];
        let pos = 0;
        while (pos < data.length) {
            const remain = data.length - pos;
            const blockSize = remain > 65535 ? 65535 : remain;
            const isLast = pos + blockSize >= data.length;
            out.push(isLast ? 1 : 0);
            out.push(blockSize & 0xFF);
            out.push((blockSize >> 8) & 0xFF);
            out.push((~blockSize) & 0xFF);
            out.push(((~blockSize) >> 8) & 0xFF);
            for (let i = 0; i < blockSize; i++)
                out.push(data[pos + i]);
            pos += blockSize;
        }
        return new Uint8Array(out);
    }
    private static crc32(data: Uint8Array): number {
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < data.length; i++) {
            crc ^= data[i];
            for (let j = 0; j < 8; j++) {
                crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
            }
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }
}
