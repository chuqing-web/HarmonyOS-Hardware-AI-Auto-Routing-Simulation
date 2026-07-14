/**
 * Proteus .sch 原理图解析器 — 增强坐标/连线/旋转
 */
import {
  SchematicDocument, ComponentInstance, Net, Wire, NetType, IdUtil, Point2D, WireStyle
} from 'common';
import { emptyParameters } from '../internal/FilePersistenceHelpers';
import { ImportReport } from './ImportReport';

export class ProteusParser {
  static parse(content: string, fileName: string): ImportReport {
    const now = new Date().toISOString();
    const doc: SchematicDocument = {
      id: IdUtil.generate('sch'),
      name: fileName.replace(/\.[^.]+$/, ''),
      version: '1.0',
      components: [],
      wires: [],
      nets: [],
      netLabels: [],
      subcircuits: [],
      metadata: {
        author: 'Proteus Import', createdAt: now, modifiedAt: now,
        description: `Imported from ${fileName}`, gridSize: 10, units: 'mil', undoLimit: 1000
      }
    };
    const unmapped: string[] = [];
    let mapped = 0;
    const netMap = new Map<string, string>();

    const lines = content.split(/\r?\n/);
    let x = 100; let y = 100;
    let wireStart: Point2D | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('COMPONENT') || trimmed.startsWith('PART')) {
        const parts = trimmed.split(/\s+/);
        const partName = parts[1] ?? 'UNKNOWN';
        const cx = parts.length > 3 ? parseFloat(parts[3]) : x;
        const cy = parts.length > 4 ? parseFloat(parts[4]) : y;
        const rot = parts.length > 5 ? parseInt(parts[5], 10) : 0;
        const libId = ProteusParser.mapPartName(partName);
        if (libId === partName) unmapped.push(partName);
        else mapped++;
        doc.components.push({
          id: IdUtil.generate('comp'),
          libraryId: libId,
          refDes: parts[2] ?? `U${doc.components.length + 1}`,
          position: { x: cx, y: cy },
          rotation: ProteusParser.normalizeRot(rot),
          mirrored: false,
          parameters: emptyParameters()
        });
        x += 80;
        if (x > 600) { x = 100; y += 80; }
      }
      if (trimmed.startsWith('NET') || trimmed.startsWith('WIRE')) {
        const parts = trimmed.split(/\s+/);
        const netName = parts[1] ?? `NET_${doc.nets.length + 1}`;
        if (!netMap.has(netName)) {
          const netId = IdUtil.generate('net');
          netMap.set(netName, netId);
          const netType = netName === 'VCC' || netName === 'VDD' ? NetType.POWER :
            (netName === 'GND' || netName === 'VSS' ? NetType.GROUND : NetType.SIGNAL);
          doc.nets.push({ id: netId, name: netName, type: netType, pinIds: [] });
        }
        if (parts.length >= 5) {
          const p1: Point2D = { x: parseFloat(parts[2]), y: parseFloat(parts[3]) };
          const p2: Point2D = { x: parseFloat(parts[4]), y: parseFloat(parts[5] ?? parts[4]) };
          doc.wires.push({
            id: IdUtil.generate('wire'),
            netId: netMap.get(netName)!,
            points: [p1, p2],
            style: WireStyle.ORTHOGONAL
          });
        } else if (parts.length >= 4) {
          const pt: Point2D = { x: parseFloat(parts[2]), y: parseFloat(parts[3]) };
          if (wireStart === null) wireStart = pt;
          else {
            doc.wires.push({
              id: IdUtil.generate('wire'),
              netId: netMap.get(netName)!,
              points: [wireStart, pt],
              style: WireStyle.ORTHOGONAL
            });
            wireStart = null;
          }
        }
      }
    }

    if (doc.components.length === 0) {
      ProteusParser.parseXmlStyle(content, doc, unmapped);
      mapped = doc.components.length - unmapped.length;
    }

    return { doc: doc, mappedCount: mapped, unmappedParts: unmapped };
  }

  private static normalizeRot(deg: number): 0 | 90 | 180 | 270 {
    const n = ((deg % 360) + 360) % 360;
    if (n === 90) return 90;
    if (n === 180) return 180;
    if (n === 270) return 270;
    return 0;
  }

  private static parseXmlStyle(content: string, doc: SchematicDocument, unmapped: string[]): void {
    const compRegex = /<comp[^>]*name="([^"]*)"[^>]*(?:x="([\d.]+)")?[^>]*(?:y="([\d.]+)")?[^>]*(?:rotate="([\d.]+)")?[^>]*>/gi;
    let match: RegExpExecArray | null;
    let x = 100; let y = 100;
    while ((match = compRegex.exec(content)) !== null) {
      const libId = ProteusParser.mapPartName(match[1]);
      if (libId === match[1]) unmapped.push(match[1]);
      doc.components.push({
        id: IdUtil.generate('comp'),
        libraryId: libId,
        refDes: `U${doc.components.length + 1}`,
        position: { x: match[2] ? parseFloat(match[2]) : x, y: match[3] ? parseFloat(match[3]) : y },
        rotation: ProteusParser.normalizeRot(match[4] ? parseInt(match[4], 10) : 0),
        mirrored: false, parameters: emptyParameters()
      });
      x += 80;
    }
  }

  private static mapPartName(proteusName: string): string {
    const upper = proteusName.toUpperCase();
    if (upper.includes('AT89C51')) return 'AT89C51';
    if (upper.includes('AT89C52')) return 'AT89C52';
    if (upper.includes('STC89')) return 'STC89C52';
    if (upper.includes('STM32F103C8T6')) return 'STM32F103C8T6';
    if (upper.includes('STM32F103')) return 'STM32F103C8';
    if (upper.includes('STM32F407')) return 'STM32F407VG';
    if (upper.includes('GD32F103')) return 'GD32F103C8';
    if (upper.includes('74HC04') || upper === '7404') return '74HC04';
    if (upper.includes('74HC08')) return '74HC08';
    if (upper.includes('74HC00')) return '74HC00';
    if (upper.includes('74HC595')) return '74HC595';
    if (upper.includes('LM358')) return 'LM358';
    if (upper.includes('OSCILLOSCOPE') || upper === 'OSC') return 'OSCILLOSCOPE';
    if (upper.includes('RES') || upper.startsWith('R')) return 'R_10k';
    if (upper.includes('CAP') || upper.startsWith('C')) return 'C_100nF';
    if (upper.includes('LED')) return 'LED_RED';
    if (upper.includes('CRYSTAL') || upper.includes('XTAL')) return 'XTAL_11M';
    if (upper.includes('1N4148')) return '1N4148';
    if (upper.includes('1N4007')) return '1N4007';
    if (upper.includes('CH340')) return 'CH340G';
    return proteusName;
  }
}
