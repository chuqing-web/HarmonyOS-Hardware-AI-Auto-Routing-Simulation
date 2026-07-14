import type { HexSegment } from '../types/CommonTypes';
export interface HexParseResult {
    data: Uint8Array;
    segments: HexSegment[];
    entryPoint: number;
    minAddress: number;
    maxAddress: number;
    checksumOk: boolean;
    invalidLines: number;
}
/** 单段紧凑镜像上限，防止畸形 HEX ANR */
const MAX_COMPACT_IMAGE_BYTES: number = 2 * 1024 * 1024;
export class HexParser {
    static parse(text: string): HexParseResult {
        const validated = HexParser.parseWithValidation(text);
        return validated;
    }
    static parseWithValidation(text: string): HexParseResult {
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        let extendedAddress = 0;
        let entryPoint = 0;
        let maxAddress = 0;
        let minAddress = Number.MAX_SAFE_INTEGER;
        const memoryMap: Map<number, number> = new Map();
        let checksumOk = true;
        let invalidLines = 0;
        let dataLineCount = 0;
        for (const line of lines) {
            if (!line.startsWith(':'))
                continue;
            const bytes = HexParser.parseLine(line);
            if (!bytes) {
                invalidLines++;
                checksumOk = false;
                continue;
            }
            const byteCount = bytes[0];
            const address = (bytes[1] << 8) | bytes[2];
            const recordType = bytes[3];
            switch (recordType) {
                case 0x00: {
                    dataLineCount++;
                    const baseAddr = extendedAddress + address;
                    for (let i = 0; i < byteCount; i++) {
                        const abs = baseAddr + i;
                        memoryMap.set(abs, bytes[4 + i]);
                        if (abs > maxAddress)
                            maxAddress = abs;
                        if (abs < minAddress)
                            minAddress = abs;
                    }
                    break;
                }
                case 0x01:
                    break;
                case 0x02:
                    extendedAddress = ((bytes[4] << 8) | bytes[5]) << 4;
                    break;
                case 0x04:
                    extendedAddress = ((bytes[4] << 8) | bytes[5]) << 16;
                    break;
                case 0x05:
                    entryPoint = (bytes[4] << 24) | (bytes[5] << 16) | (bytes[6] << 8) | bytes[7];
                    break;
                default:
                    break;
            }
        }
        if (dataLineCount === 0 || memoryMap.size === 0) {
            checksumOk = false;
            return {
                data: new Uint8Array(0),
                segments: [],
                entryPoint: 0,
                minAddress: 0,
                maxAddress: 0,
                checksumOk: false,
                invalidLines
            };
        }
        if (minAddress === Number.MAX_SAFE_INTEGER) {
            minAddress = 0;
        }
        let size = maxAddress - minAddress + 1;
        if (size <= 0 || size > MAX_COMPACT_IMAGE_BYTES) {
            // e.g. data at 0x0 and 0x0800xxxx would span ~128MB — keep Cortex-M flash window only
            const FLASH_BASE = 0x08000000;
            let flashMin = Number.MAX_SAFE_INTEGER;
            let flashMax = 0;
            let hasFlash = false;
            memoryMap.forEach((_val: number, addr: number) => {
                if (addr >= FLASH_BASE && addr < FLASH_BASE + MAX_COMPACT_IMAGE_BYTES) {
                    hasFlash = true;
                    if (addr < flashMin)
                        flashMin = addr;
                    if (addr > flashMax)
                        flashMax = addr;
                }
            });
            if (hasFlash && flashMax >= flashMin && (flashMax - flashMin + 1) <= MAX_COMPACT_IMAGE_BYTES) {
                minAddress = flashMin;
                maxAddress = flashMax;
                size = flashMax - flashMin + 1;
            }
            else {
                const segmentsFail = HexParser.buildContiguousSegments(memoryMap);
                return {
                    data: new Uint8Array(0),
                    segments: segmentsFail,
                    entryPoint,
                    minAddress,
                    maxAddress,
                    checksumOk: false,
                    invalidLines
                };
            }
        }
        const data = new Uint8Array(size);
        data.fill(0xFF);
        memoryMap.forEach((val: number, addr: number) => {
            const idx = addr - minAddress;
            if (idx >= 0 && idx < data.length) {
                data[idx] = val;
            }
        });
        const segments = HexParser.buildContiguousSegments(memoryMap);
        if (entryPoint === 0) {
            entryPoint = minAddress;
        }
        return { data, segments, entryPoint, minAddress, maxAddress, checksumOk, invalidLines };
    }
    /** 将 sparse memoryMap 合并为连续 address 段（按地址升序） */
    private static buildContiguousSegments(memoryMap: Map<number, number>): HexSegment[] {
        const addrs: number[] = Array.from(memoryMap.keys());
        addrs.sort((a, b) => a - b);
        const segments: HexSegment[] = [];
        if (addrs.length === 0) {
            return segments;
        }
        let segStart = addrs[0];
        let segBytes: number[] = [memoryMap.get(addrs[0]) ?? 0xFF];
        let prev = addrs[0];
        for (let i = 1; i < addrs.length; i++) {
            const addr = addrs[i];
            if (addr === prev + 1) {
                segBytes.push(memoryMap.get(addr) ?? 0xFF);
            }
            else {
                segments.push({ address: segStart, data: new Uint8Array(segBytes) });
                segStart = addr;
                segBytes = [memoryMap.get(addr) ?? 0xFF];
            }
            prev = addr;
        }
        segments.push({ address: segStart, data: new Uint8Array(segBytes) });
        return segments;
    }
    static parseLine(line: string): number[] | null {
        if (line.length < 11 || line.charAt(0) !== ':')
            return null;
        const hex = line.substring(1);
        if (hex.length % 2 !== 0)
            return null;
        const bytes: number[] = [];
        let checksum = 0;
        for (let i = 0; i < hex.length; i += 2) {
            const b = parseInt(hex.substring(i, i + 2), 16);
            if (isNaN(b))
                return null;
            bytes.push(b);
            checksum = (checksum + b) & 0xFF;
        }
        if ((checksum & 0xFF) !== 0)
            return null;
        return bytes;
    }
    static computeChecksum(data: Uint8Array): string {
        let sum = 0;
        for (let i = 0; i < data.length; i++)
            sum += data[i];
        return (sum & 0xFF).toString(16).padStart(2, '0').toUpperCase();
    }
}
