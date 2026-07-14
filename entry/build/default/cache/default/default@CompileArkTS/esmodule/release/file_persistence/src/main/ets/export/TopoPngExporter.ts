import type { SchTopology } from 'common';
export class TopoPngExporter {
    static export(x345: SchTopology, y345: number = 800, z345: number = 600): Uint8Array {
        const a346 = new Uint8Array(y345 * z345 * 3);
        TopoPngExporter.fillBackground(a346, y345, z345, 255, 255, 255);
        for (let f346 = 0; f346 < x345.wireList.length; f346++) {
            const g346 = x345.wireList[f346];
            for (let h346 = 1; h346 < g346.points.length; h346++) {
                TopoPngExporter.drawLine(a346, y345, z345, Math.round(g346.points[h346 - 1].x), Math.round(g346.points[h346 - 1].y), Math.round(g346.points[h346].x), Math.round(g346.points[h346].y), 0, 0, 0);
            }
        }
        for (let b346 = 0; b346 < x345.deviceList.length; b346++) {
            const c346 = x345.deviceList[b346];
            const d346 = Math.round(c346.x);
            const e346 = Math.round(c346.y);
            TopoPngExporter.fillRect(a346, y345, z345, d346 - 20, e346 - 10, 40, 20, 240, 240, 240);
            TopoPngExporter.strokeRect(a346, y345, z345, d346 - 20, e346 - 10, 40, 20, 0, 102, 204);
        }
        return TopoPngExporter.encodePng(a346, y345, z345);
    }
    private static fillBackground(o345: Uint8Array, p345: number, q345: number, r345: number, s345: number, t345: number): void {
        for (let u345 = 0; u345 < q345; u345++) {
            for (let v345 = 0; v345 < p345; v345++) {
                const w345 = (u345 * p345 + v345) * 3;
                o345[w345] = r345;
                o345[w345 + 1] = s345;
                o345[w345 + 2] = t345;
            }
        }
    }
    private static setPixel(f345: Uint8Array, g345: number, h345: number, i345: number, j345: number, k345: number, l345: number, m345: number): void {
        if (i345 < 0 || j345 < 0 || i345 >= g345 || j345 >= h345)
            return;
        const n345 = (j345 * g345 + i345) * 3;
        f345[n345] = k345;
        f345[n345 + 1] = l345;
        f345[n345 + 2] = m345;
    }
    private static drawLine(n344: Uint8Array, o344: number, p344: number, q344: number, r344: number, s344: number, t344: number, u344: number, v344: number, w344: number): void {
        const x344 = Math.abs(s344 - q344);
        const y344 = Math.abs(t344 - r344);
        const z344 = q344 < s344 ? 1 : -1;
        const a345 = r344 < t344 ? 1 : -1;
        let b345 = x344 - y344;
        let c345 = q344;
        let d345 = r344;
        while (true) {
            TopoPngExporter.setPixel(n344, o344, p344, c345, d345, u344, v344, w344);
            if (c345 === s344 && d345 === t344)
                break;
            const e345 = 2 * b345;
            if (e345 > -y344) {
                b345 -= y344;
                c345 += z344;
            }
            if (e345 < x344) {
                b345 += x344;
                d345 += a345;
            }
        }
    }
    private static fillRect(b344: Uint8Array, c344: number, d344: number, e344: number, f344: number, g344: number, h344: number, i344: number, j344: number, k344: number): void {
        for (let l344 = f344; l344 < f344 + h344; l344++) {
            for (let m344 = e344; m344 < e344 + g344; m344++) {
                TopoPngExporter.setPixel(b344, c344, d344, m344, l344, i344, j344, k344);
            }
        }
    }
    private static strokeRect(p343: Uint8Array, q343: number, r343: number, s343: number, t343: number, u343: number, v343: number, w343: number, x343: number, y343: number): void {
        for (let a344 = s343; a344 < s343 + u343; a344++) {
            TopoPngExporter.setPixel(p343, q343, r343, a344, t343, w343, x343, y343);
            TopoPngExporter.setPixel(p343, q343, r343, a344, t343 + v343 - 1, w343, x343, y343);
        }
        for (let z343 = t343; z343 < t343 + v343; z343++) {
            TopoPngExporter.setPixel(p343, q343, r343, s343, z343, w343, x343, y343);
            TopoPngExporter.setPixel(p343, q343, r343, s343 + u343 - 1, z343, w343, x343, y343);
        }
    }
    private static encodePng(z342: Uint8Array, a343: number, b343: number): Uint8Array {
        const c343 = new Uint8Array((a343 * 3 + 1) * b343);
        for (let l343 = 0; l343 < b343; l343++) {
            c343[l343 * (a343 * 3 + 1)] = 0;
            for (let m343 = 0; m343 < a343; m343++) {
                const n343 = (l343 * a343 + m343) * 3;
                const o343 = l343 * (a343 * 3 + 1) + 1 + m343 * 3;
                c343[o343] = z342[n343];
                c343[o343 + 1] = z342[n343 + 1];
                c343[o343 + 2] = z342[n343 + 2];
            }
        }
        const d343 = TopoPngExporter.deflateStore(c343);
        const e343 = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
        const f343 = TopoPngExporter.makeChunk('IHDR', TopoPngExporter.makeIhdr(a343, b343));
        const g343 = TopoPngExporter.makeChunk('IDAT', d343);
        const h343 = TopoPngExporter.makeChunk('IEND', new Uint8Array(0));
        const i343 = e343.length + f343.length + g343.length + h343.length;
        const j343 = new Uint8Array(i343);
        let k343 = 0;
        j343.set(e343, k343);
        k343 += e343.length;
        j343.set(f343, k343);
        k343 += f343.length;
        j343.set(g343, k343);
        k343 += g343.length;
        j343.set(h343, k343);
        return j343;
    }
    private static makeIhdr(w342: number, x342: number): Uint8Array {
        const y342 = new Uint8Array(13);
        TopoPngExporter.writeU32(y342, 0, w342);
        TopoPngExporter.writeU32(y342, 4, x342);
        y342[8] = 8;
        y342[9] = 2;
        y342[10] = 0;
        y342[11] = 0;
        y342[12] = 0;
        return y342;
    }
    private static writeU32(t342: Uint8Array, u342: number, v342: number): void {
        t342[u342] = (v342 >> 24) & 0xFF;
        t342[u342 + 1] = (v342 >> 16) & 0xFF;
        t342[u342 + 2] = (v342 >> 8) & 0xFF;
        t342[u342 + 3] = v342 & 0xFF;
    }
    private static makeChunk(o342: string, p342: Uint8Array): Uint8Array {
        const q342 = new Uint8Array(12 + p342.length);
        TopoPngExporter.writeU32(q342, 0, p342.length);
        for (let s342 = 0; s342 < 4; s342++)
            q342[4 + s342] = o342.charCodeAt(s342);
        q342.set(p342, 8);
        const r342 = TopoPngExporter.crc32(q342.subarray(4, 8 + p342.length));
        TopoPngExporter.writeU32(q342, 8 + p342.length, r342);
        return q342;
    }
    private static deflateStore(h342: Uint8Array): Uint8Array {
        const i342: number[] = [0x78, 0x01];
        let j342 = 0;
        while (j342 < h342.length) {
            const k342 = h342.length - j342;
            const l342 = k342 > 65535 ? 65535 : k342;
            const m342 = j342 + l342 >= h342.length;
            i342.push(m342 ? 1 : 0);
            i342.push(l342 & 0xFF);
            i342.push((l342 >> 8) & 0xFF);
            i342.push((~l342) & 0xFF);
            i342.push(((~l342) >> 8) & 0xFF);
            for (let n342 = 0; n342 < l342; n342++)
                i342.push(h342[j342 + n342]);
            j342 += l342;
        }
        return new Uint8Array(i342);
    }
    private static crc32(d342: Uint8Array): number {
        let e342 = 0xFFFFFFFF;
        for (let f342 = 0; f342 < d342.length; f342++) {
            e342 ^= d342[f342];
            for (let g342 = 0; g342 < 8; g342++) {
                e342 = (e342 >>> 1) ^ (e342 & 1 ? 0xEDB88320 : 0);
            }
        }
        return (e342 ^ 0xFFFFFFFF) >>> 0;
    }
}
