import util from "@ohos:util";
const SALT = 'ElecDraw_Harmony_AI_Key_v1';
export class CryptoUtil {
    static encrypt(e15: string): string {
        if (!e15 || e15.length === 0)
            return '';
        const f15 = new util.TextEncoder();
        const g15 = f15.encodeInto(e15);
        const h15 = f15.encodeInto(SALT);
        const i15 = new Uint8Array(g15.length);
        for (let k15 = 0; k15 < g15.length; k15++) {
            i15[k15] = g15[k15] ^ h15[k15 % h15.length];
        }
        const j15 = new util.Base64Helper();
        return j15.encodeToStringSync(i15);
    }
    static decrypt(v14: string): string {
        if (!v14 || v14.length === 0)
            return '';
        try {
            const x14 = new util.Base64Helper();
            const y14 = x14.decodeSync(v14);
            const z14 = new util.TextEncoder();
            const a15 = z14.encodeInto(SALT);
            const b15 = new Uint8Array(y14.length);
            for (let d15 = 0; d15 < y14.length; d15++) {
                b15[d15] = y14[d15] ^ a15[d15 % a15.length];
            }
            const c15 = new util.TextDecoder('utf-8');
            return c15.decodeToString(b15);
        }
        catch (w14) {
            return '';
        }
    }
    static maskKey(u14: string): string {
        if (u14.length <= 8)
            return '***';
        return `${u14.substring(0, 4)}...${u14.substring(u14.length - 4)}`;
    }
    static signLicensePayload(t14: string): string {
        return CryptoUtil.sha256(`RSA2048:${t14}:${SALT}`);
    }
    static encryptWithHuks(r14: string, s14: string = 'elecdraw_api_key'): string {
        return CryptoUtil.encrypt(r14);
    }
    static decryptWithHuks(p14: string, q14: string = 'elecdraw_api_key'): string {
        return CryptoUtil.decrypt(p14);
    }
    static hash(o14: string): string {
        return CryptoUtil.sha256(o14);
    }
    static sha256(l13: string): string {
        if (!l13 || l13.length === 0)
            return '';
        const m13 = new util.TextEncoder();
        const n13 = m13.encodeInto(l13 + SALT);
        const o13 = new Uint32Array([
            0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
            0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
        ]);
        const p13 = CryptoUtil.sha256RoundConstants();
        const q13 = CryptoUtil.sha256Pad(n13);
        for (let t13 = 0; t13 < q13.length; t13 += 64) {
            const u13 = new Uint32Array(64);
            for (let n14 = 0; n14 < 16; n14++) {
                u13[n14] = (q13[t13 + n14 * 4] << 24) | (q13[t13 + n14 * 4 + 1] << 16) |
                    (q13[t13 + n14 * 4 + 2] << 8) | q13[t13 + n14 * 4 + 3];
            }
            for (let k14 = 16; k14 < 64; k14++) {
                const l14 = CryptoUtil.rotr(u13[k14 - 15], 7) ^ CryptoUtil.rotr(u13[k14 - 15], 18) ^ (u13[k14 - 15] >>> 3);
                const m14 = CryptoUtil.rotr(u13[k14 - 2], 17) ^ CryptoUtil.rotr(u13[k14 - 2], 19) ^ (u13[k14 - 2] >>> 10);
                u13[k14] = (u13[k14 - 16] + l14 + u13[k14 - 7] + m14) >>> 0;
            }
            let v13 = o13[0];
            let w13 = o13[1];
            let x13 = o13[2];
            let y13 = o13[3];
            let z13 = o13[4];
            let a14 = o13[5];
            let b14 = o13[6];
            let c14 = o13[7];
            for (let d14 = 0; d14 < 64; d14++) {
                const e14 = CryptoUtil.rotr(z13, 6) ^ CryptoUtil.rotr(z13, 11) ^ CryptoUtil.rotr(z13, 25);
                const f14 = (z13 & a14) ^ (~z13 & b14);
                const g14 = (c14 + e14 + f14 + p13[d14] + u13[d14]) >>> 0;
                const h14 = CryptoUtil.rotr(v13, 2) ^ CryptoUtil.rotr(v13, 13) ^ CryptoUtil.rotr(v13, 22);
                const i14 = (v13 & w13) ^ (v13 & x13) ^ (w13 & x13);
                const j14 = (h14 + i14) >>> 0;
                c14 = b14;
                b14 = a14;
                a14 = z13;
                z13 = (y13 + g14) >>> 0;
                y13 = x13;
                x13 = w13;
                w13 = v13;
                v13 = (g14 + j14) >>> 0;
            }
            o13[0] = (o13[0] + v13) >>> 0;
            o13[1] = (o13[1] + w13) >>> 0;
            o13[2] = (o13[2] + x13) >>> 0;
            o13[3] = (o13[3] + y13) >>> 0;
            o13[4] = (o13[4] + z13) >>> 0;
            o13[5] = (o13[5] + a14) >>> 0;
            o13[6] = (o13[6] + b14) >>> 0;
            o13[7] = (o13[7] + c14) >>> 0;
        }
        let r13 = '';
        for (let s13 = 0; s13 < 8; s13++) {
            r13 += o13[s13].toString(16).padStart(8, '0');
        }
        return r13;
    }
    private static rotr(j13: number, k13: number): number {
        return ((j13 >>> k13) | (j13 << (32 - k13))) >>> 0;
    }
    private static sha256Pad(e13: Uint8Array): Uint8Array {
        const f13 = e13.length * 8;
        const g13 = ((e13.length + 9 + 63) >> 6) << 6;
        const h13 = new Uint8Array(g13);
        for (let i13 = 0; i13 < e13.length; i13++) {
            h13[i13] = e13[i13];
        }
        h13[e13.length] = 0x80;
        h13[g13 - 4] = (f13 >>> 24) & 0xFF;
        h13[g13 - 3] = (f13 >>> 16) & 0xFF;
        h13[g13 - 2] = (f13 >>> 8) & 0xFF;
        h13[g13 - 1] = f13 & 0xFF;
        return h13;
    }
    private static sha256RoundConstants(): Uint32Array {
        return new Uint32Array([
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
        ]);
    }
}
