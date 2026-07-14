/**
 * KiCad .kicad_sch S-表达式解析器
 */
import { SchematicDocument, ComponentInstance, Net, Wire, WireStyle, NetType, IdUtil, Point2D } from 'common';
import { emptyParameters } from '../internal/FilePersistenceHelpers';

import { ImportReport } from './ImportReport';

export class KiCadParser {
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
        author: 'KiCad Import', createdAt: now, modifiedAt: now,
        description: `Imported from ${fileName}`, gridSize: 2.54, units: 'mm', undoLimit: 1000
      }
    };
    const unmapped: string[] = [];
    let mapped = 0;

    const symbolBlocks = KiCadParser.extractBlocks(content, 'symbol');
    for (let i = 0; i < symbolBlocks.length; i++) {
      const block = symbolBlocks[i];
      const libId = KiCadParser.extractField(block, 'lib_id') ?? 'UNKNOWN';
      const atMatch = block.match(/\(at\s+([\d.-]+)\s+([\d.-]+)(?:\s+([\d.-]+))?\)/);
      const x = atMatch ? parseFloat(atMatch[1]) * 39.37 : 100 + i * 80;
      const y = atMatch ? parseFloat(atMatch[2]) * 39.37 : 100;
      const rot = atMatch && atMatch[3] ? parseFloat(atMatch[3]) : 0;
      const ref = KiCadParser.extractProperty(block, 'Reference') ?? `U${doc.components.length + 1}`;
      const libMapped = KiCadParser.mapLibId(libId);
      if (libMapped === libId && !libId.includes(':')) unmapped.push(libId);
      else mapped++;
      const comp: ComponentInstance = {
        id: IdUtil.generate('comp'),
        libraryId: libMapped,
        refDes: ref,
        position: { x: x, y: y },
        rotation: rot as 0 | 90 | 180 | 270,
        mirrored: false,
        parameters: emptyParameters()
      };
      doc.components.push(comp);
    }

    const wireBlocks = KiCadParser.extractBlocks(content, 'wire');
    for (let i = 0; i < wireBlocks.length; i++) {
      const pts = KiCadParser.extractPoints(wireBlocks[i]);
      if (pts.length >= 2) {
        const wireId = IdUtil.generate('wire');
        doc.wires.push({
          id: wireId, netId: IdUtil.generate('net'),
          points: [pts[0], pts[1]],
          style: WireStyle.ORTHOGONAL
        });
      }
    }

    const labelBlocks = KiCadParser.extractBlocks(content, 'label');
    for (let i = 0; i < labelBlocks.length; i++) {
      const name = KiCadParser.extractQuoted(labelBlocks[i]) ?? `NET_${doc.nets.length + 1}`;
      const netType = name === 'VCC' || name === 'VDD' ? NetType.POWER :
        (name === 'GND' ? NetType.GROUND : NetType.SIGNAL);
      doc.nets.push({ id: IdUtil.generate('net'), name: name, type: netType, pinIds: [] });
    }

    if (doc.nets.length === 0) {
      doc.nets.push({ id: IdUtil.generate('net'), name: 'GND', type: NetType.GROUND, pinIds: [] });
      doc.nets.push({ id: IdUtil.generate('net'), name: 'VCC', type: NetType.POWER, pinIds: [] });
    }

    return { doc: doc, mappedCount: mapped, unmappedParts: unmapped };
  }

  private static extractBlocks(content: string, tag: string): string[] {
    const blocks: string[] = [];
    const regex = new RegExp(`\\(${tag}[\\s\\S]*?\\n\\)`, 'g');
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content)) !== null) {
      blocks.push(m[0]);
    }
    return blocks;
  }

  private static extractField(block: string, field: string): string | null {
    const re = new RegExp(`\\(${field}\\s+"([^"]*)"\\)`);
    const m = block.match(re);
    return m ? m[1] : null;
  }

  private static extractProperty(block: string, key: string): string | null {
    const re = new RegExp(`\\(property\\s+"${key}"\\s+"([^"]*)"`);
    const m = block.match(re);
    return m ? m[1] : null;
  }

  private static extractQuoted(block: string): string | null {
    const m = block.match(/"([^"]+)"/);
    return m ? m[1] : null;
  }

  private static extractPoints(block: string): Point2D[] {
    const pts: Point2D[] = [];
    const re = /\(xy\s+([\d.-]+)\s+([\d.-]+)\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block)) !== null) {
      pts.push({ x: parseFloat(m[1]) * 39.37, y: parseFloat(m[2]) * 39.37 });
    }
    return pts;
  }

  private static mapLibId(libId: string): string {
    const u = libId.toUpperCase();
    if (u.includes('STM32F103')) return 'STM32F103C8';
    if (u.includes('RESISTOR') || u.includes(':R')) return 'R_10k';
    if (u.includes('CAPACITOR') || u.includes(':C')) return 'C_100nF';
    if (u.includes('LED')) return 'LED_RED';
    if (u.includes('74HC04')) return '74HC04';
    const parts = libId.split(':');
    return parts.length > 1 ? parts[1] : libId;
  }
}
