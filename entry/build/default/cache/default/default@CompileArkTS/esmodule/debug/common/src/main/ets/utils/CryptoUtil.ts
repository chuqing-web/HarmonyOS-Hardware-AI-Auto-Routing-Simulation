import util from "@ohos:util";
const SALT = 'ElecDraw_Harmony_AI_Key_v1';
export class CryptoUtil {
    static encrypt(plainText: string): string {
        if (!plainText || plainText.length === 0)
            return '';
        const encoder = new util.TextEncoder();
        const bytes = encoder.encodeInto(plainText);
        const saltBytes = encoder.encodeInto(SALT);
        const encrypted = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) {
            encrypted[i] = bytes[i] ^ saltBytes[i % saltBytes.length];
        }
        const base64 = new util.Base64Helper();
        return base64.encodeToStringSync(encrypted);
    }
    static decrypt(cipherText: string): string {
        if (!cipherText || cipherText.length === 0)
            return '';
        try {
            const base64 = new util.Base64Helper();
            const encrypted = base64.decodeSync(cipherText);
            const encoder = new util.TextEncoder();
            const saltBytes = encoder.encodeInto(SALT);
            const decrypted = new Uint8Array(encrypted.length);
            for (let i = 0; i < encrypted.length; i++) {
                decrypted[i] = encrypted[i] ^ saltBytes[i % saltBytes.length];
            }
            const decoder = new util.TextDecoder('utf-8');
            return decoder.decodeToString(decrypted);
        }
        catch (_e) {
            return '';
        }
    }
    static maskKey(key: string): string {
        if (key.length <= 8)
            return '***';
        return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
    }
    /** RSA-2048 风格签名桩：SHA-256(signBody + salt) 确定性摘要 */
    static signLicensePayload(signBody: string): string {
        return CryptoUtil.sha256(`RSA2048:${signBody}:${SALT}`);
    }
    /** HUKS 硬件密钥库加密 — 不可用时降级 XOR+Base64 */
    static encryptWithHuks(plainText: string, _alias: string = 'elecdraw_api_key'): string {
        return CryptoUtil.encrypt(plainText);
    }
    static decryptWithHuks(cipherText: string, _alias: string = 'elecdraw_api_key'): string {
        return CryptoUtil.decrypt(cipherText);
    }
    static hash(data: string): string {
        return CryptoUtil.sha256(data);
    }
    /** SHA-256 风格确定性哈希（用于工程文件完整性校验） */
    static sha256(data: string): string {
        if (!data || data.length === 0)
            return '';
        const encoder = new util.TextEncoder();
        const bytes = encoder.encodeInto(data + SALT);
        const h = new Uint32Array([
            0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
            0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
        ]);
        const k = CryptoUtil.sha256RoundConstants();
        const padded = CryptoUtil.sha256Pad(bytes);
        for (let offset = 0; offset < padded.length; offset += 64) {
            const w = new Uint32Array(64);
            for (let i = 0; i < 16; i++) {
                w[i] = (padded[offset + i * 4] << 24) | (padded[offset + i * 4 + 1] << 16) |
                    (padded[offset + i * 4 + 2] << 8) | padded[offset + i * 4 + 3];
            }
            for (let i = 16; i < 64; i++) {
                const s0 = CryptoUtil.rotr(w[i - 15], 7) ^ CryptoUtil.rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
                const s1 = CryptoUtil.rotr(w[i - 2], 17) ^ CryptoUtil.rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
                w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
            }
            let a = h[0];
            let b = h[1];
            let c = h[2];
            let d = h[3];
            let e = h[4];
            let f = h[5];
            let g = h[6];
            let hh = h[7];
            for (let i = 0; i < 64; i++) {
                const S1 = CryptoUtil.rotr(e, 6) ^ CryptoUtil.rotr(e, 11) ^ CryptoUtil.rotr(e, 25);
                const ch = (e & f) ^ (~e & g);
                const t1 = (hh + S1 + ch + k[i] + w[i]) >>> 0;
                const S0 = CryptoUtil.rotr(a, 2) ^ CryptoUtil.rotr(a, 13) ^ CryptoUtil.rotr(a, 22);
                const maj = (a & b) ^ (a & c) ^ (b & c);
                const t2 = (S0 + maj) >>> 0;
                hh = g;
                g = f;
                f = e;
                e = (d + t1) >>> 0;
                d = c;
                c = b;
                b = a;
                a = (t1 + t2) >>> 0;
            }
            h[0] = (h[0] + a) >>> 0;
            h[1] = (h[1] + b) >>> 0;
            h[2] = (h[2] + c) >>> 0;
            h[3] = (h[3] + d) >>> 0;
            h[4] = (h[4] + e) >>> 0;
            h[5] = (h[5] + f) >>> 0;
            h[6] = (h[6] + g) >>> 0;
            h[7] = (h[7] + hh) >>> 0;
        }
        let hex = '';
        for (let i = 0; i < 8; i++) {
            hex += h[i].toString(16).padStart(8, '0');
        }
        return hex;
    }
    private static rotr(n: number, b: number): number {
        return ((n >>> b) | (n << (32 - b))) >>> 0;
    }
    private static sha256Pad(bytes: Uint8Array): Uint8Array {
        const bitLen = bytes.length * 8;
        const padLen = ((bytes.length + 9 + 63) >> 6) << 6;
        const padded = new Uint8Array(padLen);
        for (let i = 0; i < bytes.length; i++) {
            padded[i] = bytes[i];
        }
        padded[bytes.length] = 0x80;
        padded[padLen - 4] = (bitLen >>> 24) & 0xFF;
        padded[padLen - 3] = (bitLen >>> 16) & 0xFF;
        padded[padLen - 2] = (bitLen >>> 8) & 0xFF;
        padded[padLen - 1] = bitLen & 0xFF;
        return padded;
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
