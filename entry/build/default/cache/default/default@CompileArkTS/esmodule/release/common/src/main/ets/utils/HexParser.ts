import type { HexSegment } from '../types/CommonTypes';
export interface HexParseResult {
    data: Uint8Array;
    segments: HexSegment[];
    entryPoint: number;
    maxAddress: number;
    checksumOk: boolean;
    invalidLines: number;
}
export class HexParser {
    static parse(a25: string): HexParseResult {
        const b25 = HexParser.parseWithValidation(a25);
        return b25;
    }
    static parseWithValidation(y23: string): HexParseResult {
        const z23 = y23.split(/\r?\n/).filter(z24 => z24.trim().length > 0);
        const a24: HexSegment[] = [];
        let b24 = 0;
        let c24 = 0;
        let d24 = 0;
        const e24: Map<number, number> = new Map();
        let f24 = true;
        let g24 = 0;
        let h24 = 0;
        for (const s24 of z23) {
            if (!s24.startsWith(':'))
                continue;
            const t24 = HexParser.parseLine(s24);
            if (!t24) {
                g24++;
                f24 = false;
                continue;
            }
            const u24 = t24[0];
            const v24 = (t24[1] << 8) | t24[2];
            const w24 = t24[3];
            switch (w24) {
                case 0x00: {
                    h24++;
                    const x24 = b24 + v24;
                    for (let y24 = 0; y24 < u24; y24++) {
                        e24.set(x24 + y24, t24[4 + y24]);
                        if (x24 + y24 > d24)
                            d24 = x24 + y24;
                    }
                    break;
                }
                case 0x01:
                    break;
                case 0x02:
                    b24 = ((t24[4] << 8) | t24[5]) << 4;
                    break;
                case 0x04:
                    b24 = ((t24[4] << 8) | t24[5]) << 16;
                    break;
                case 0x05:
                    c24 = (t24[4] << 24) | (t24[5] << 16) | (t24[6] << 8) | t24[7];
                    break;
                default:
                    break;
            }
        }
        if (h24 === 0) {
            f24 = false;
        }
        const i24 = d24 + 1;
        const j24 = new Uint8Array(i24 > 0 ? i24 : 1);
        j24.fill(0xFF);
        e24.forEach((q24, r24) => { j24[r24] = q24; });
        const k24: Map<number, number[]> = new Map();
        e24.forEach((n24, o24) => {
            const p24 = Math.floor(o24 / 256);
            if (!k24.has(p24))
                k24.set(p24, []);
            k24.get(p24)?.push(n24);
        });
        k24.forEach((l24, m24) => {
            a24.push({ address: m24 * 256, data: new Uint8Array(l24) });
        });
        return { data: j24, segments: a24, entryPoint: c24, maxAddress: d24, checksumOk: f24, invalidLines: g24 };
    }
    static parseLine(s23: string): number[] | null {
        if (s23.length < 11 || s23.charAt(0) !== ':')
            return null;
        const t23 = s23.substring(1);
        if (t23.length % 2 !== 0)
            return null;
        const u23: number[] = [];
        let v23 = 0;
        for (let w23 = 0; w23 < t23.length; w23 += 2) {
            const x23 = parseInt(t23.substring(w23, w23 + 2), 16);
            if (isNaN(x23))
                return null;
            u23.push(x23);
            v23 = (v23 + x23) & 0xFF;
        }
        if ((v23 & 0xFF) !== 0)
            return null;
        return u23;
    }
    static computeChecksum(p23: Uint8Array): string {
        let q23 = 0;
        for (let r23 = 0; r23 < p23.length; r23++)
            q23 += p23[r23];
        return (q23 & 0xFF).toString(16).padStart(2, '0').toUpperCase();
    }
}
