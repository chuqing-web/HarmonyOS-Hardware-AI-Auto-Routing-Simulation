/**
 * Intel HEX 固件解析器 — 含校验和验证与空洞填充
 */
import { HexSegment } from '../types/CommonTypes';

export interface HexParseResult {
  data: Uint8Array;
  segments: HexSegment[];
  entryPoint: number;
  maxAddress: number;
  checksumOk: boolean;
  invalidLines: number;
}

export class HexParser {
  static parse(text: string): HexParseResult {
    const validated = HexParser.parseWithValidation(text);
    return validated;
  }

  static parseWithValidation(text: string): HexParseResult {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    const segments: HexSegment[] = [];
    let extendedAddress = 0;
    let entryPoint = 0;
    let maxAddress = 0;
    const memoryMap: Map<number, number> = new Map();
    let checksumOk = true;
    let invalidLines = 0;
    let dataLineCount = 0;

    for (const line of lines) {
      if (!line.startsWith(':')) continue;
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
            memoryMap.set(baseAddr + i, bytes[4 + i]);
            if (baseAddr + i > maxAddress) maxAddress = baseAddr + i;
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

    if (dataLineCount === 0) {
      checksumOk = false;
    }

    const size = maxAddress + 1;
    const data = new Uint8Array(size > 0 ? size : 1);
    data.fill(0xFF);
    memoryMap.forEach((val, addr) => { data[addr] = val; });

    const segmentMap: Map<number, number[]> = new Map();
    memoryMap.forEach((val, addr) => {
      const block = Math.floor(addr / 256);
      if (!segmentMap.has(block)) segmentMap.set(block, []);
      segmentMap.get(block)?.push(val);
    });
    segmentMap.forEach((vals, block) => {
      segments.push({ address: block * 256, data: new Uint8Array(vals) });
    });

    return { data, segments, entryPoint, maxAddress, checksumOk, invalidLines };
  }

  static parseLine(line: string): number[] | null {
    if (line.length < 11 || line.charAt(0) !== ':') return null;
    const hex = line.substring(1);
    if (hex.length % 2 !== 0) return null;

    const bytes: number[] = [];
    let checksum = 0;
    for (let i = 0; i < hex.length; i += 2) {
      const b = parseInt(hex.substring(i, i + 2), 16);
      if (isNaN(b)) return null;
      bytes.push(b);
      checksum = (checksum + b) & 0xFF;
    }
    if ((checksum & 0xFF) !== 0) return null;
    return bytes;
  }

  static computeChecksum(data: Uint8Array): string {
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    return (sum & 0xFF).toString(16).padStart(2, '0').toUpperCase();
  }
}
