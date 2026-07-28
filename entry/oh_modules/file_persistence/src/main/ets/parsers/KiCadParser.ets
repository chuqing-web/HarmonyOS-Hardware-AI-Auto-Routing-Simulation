/**
 * KiCad .kicad_sch S-表达式解析器（器件 / 多点导线 / 标号 / junction / 电源符）
 */
import {
  SchematicDocument, ComponentInstance, Net, Wire, WireStyle, NetType,
  NetLabel, IdUtil, Point2D
} from 'common';
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
        description: `Imported from ${fileName}`, gridSize: 10, units: 'mil', undoLimit: 1000
      }
    };
    const unmapped: string[] = [];
    let mapped = 0;
    const MM_TO_MIL = 39.3700787;

    const symbolBlocks = KiCadParser.extractBlocks(content, 'symbol');
    for (let i = 0; i < symbolBlocks.length; i++) {
      const block = symbolBlocks[i];
      // 跳过 lib_symbols 内的定义块（无实例 at / 或在 lib_symbols 段）
      if (block.indexOf('(pin ') >= 0 && block.indexOf('(lib_id ') < 0) {
        continue;
      }
      const libId = KiCadParser.extractField(block, 'lib_id') ?? 'UNKNOWN';
      const atMatch = block.match(/\(at\s+([\d.-]+)\s+([\d.-]+)(?:\s+([\d.-]+))?\)/);
      if (!atMatch) {
        continue;
      }
      const x = parseFloat(atMatch[1]) * MM_TO_MIL;
      const y = parseFloat(atMatch[2]) * MM_TO_MIL;
      const rotRaw = atMatch[3] ? parseFloat(atMatch[3]) : 0;
      const rot = KiCadParser.normalizeRotation(rotRaw);
      const ref = KiCadParser.extractProperty(block, 'Reference') ?? `U${doc.components.length + 1}`;
      const libMapped = KiCadParser.mapLibId(libId);
      if (libMapped === libId && libId.indexOf(':') < 0) {
        unmapped.push(libId);
      } else {
        mapped++;
      }
      const comp: ComponentInstance = {
        id: IdUtil.generate('comp'),
        libraryId: libMapped,
        refDes: ref,
        position: { x: x, y: y },
        rotation: rot,
        mirrored: false,
        parameters: emptyParameters()
      };
      doc.components.push(comp);
    }

    // 多点导线（保留全部折点）
    const wireBlocks = KiCadParser.extractBlocks(content, 'wire');
    for (let i = 0; i < wireBlocks.length; i++) {
      const pts = KiCadParser.extractPoints(wireBlocks[i], MM_TO_MIL);
      if (pts.length >= 2) {
        const netId = IdUtil.generate('net');
        doc.nets.push({
          id: netId,
          name: `NET_${doc.nets.length + 1}`,
          type: NetType.SIGNAL,
          pinIds: []
        });
        doc.wires.push({
          id: IdUtil.generate('wire'),
          netId: netId,
          points: pts,
          style: WireStyle.ORTHOGONAL
        });
      }
    }

    // Junction：吸附邻近导线端点（电气并网由后续 rebuild 完成）
    const juncBlocks = KiCadParser.extractBlocks(content, 'junction');
    const junctions: Point2D[] = [];
    for (let i = 0; i < juncBlocks.length; i++) {
      const at = juncBlocks[i].match(/\(at\s+([\d.-]+)\s+([\d.-]+)\)/);
      if (at) {
        junctions.push({
          x: parseFloat(at[1]) * MM_TO_MIL,
          y: parseFloat(at[2]) * MM_TO_MIL
        });
      }
    }
    KiCadParser.snapWireEndsToJunctions(doc, junctions, 8);

    // Local / global labels → NetLabel + 同名网
    KiCadParser.importLabels(doc, content, 'label', false, MM_TO_MIL);
    KiCadParser.importLabels(doc, content, 'global_label', true, MM_TO_MIL);
    KiCadParser.importLabels(doc, content, 'hierarchical_label', true, MM_TO_MIL);

    // 标号触线：把同名标号附近的导线并入标号网
    KiCadParser.bindLabelsToNearbyWires(doc, 12);

    if (doc.nets.length === 0) {
      doc.nets.push({ id: IdUtil.generate('net'), name: 'GND', type: NetType.GROUND, pinIds: [] });
      doc.nets.push({ id: IdUtil.generate('net'), name: 'VCC', type: NetType.POWER, pinIds: [] });
    }

    return { doc: doc, mappedCount: mapped, unmappedParts: unmapped };
  }

  private static importLabels(
    doc: SchematicDocument, content: string, tag: string, global: boolean, scale: number
  ): void {
    const blocks = KiCadParser.extractBlocks(content, tag);
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const name = KiCadParser.extractQuoted(block) ?? `NET_${doc.nets.length + 1}`;
      const atMatch = block.match(/\(at\s+([\d.-]+)\s+([\d.-]+)(?:\s+([\d.-]+))?\)/);
      const x = atMatch ? parseFloat(atMatch[1]) * scale : 0;
      const y = atMatch ? parseFloat(atMatch[2]) * scale : 0;
      const upper = name.toUpperCase();
      let netType = NetType.SIGNAL;
      if (upper === 'VCC' || upper === 'VDD' || upper === 'V+') {
        netType = NetType.POWER;
      } else if (upper === 'GND' || upper === 'VSS' || upper === '0') {
        netType = NetType.GROUND;
      }
      let net = doc.nets.find(n => n.name === name);
      if (net === undefined) {
        net = { id: IdUtil.generate('net'), name: name, type: netType, pinIds: [] };
        doc.nets.push(net);
      }
      const label: NetLabel = {
        id: IdUtil.generate('lbl'),
        netId: net.id,
        text: name,
        position: { x: x, y: y },
        global: global || netType !== NetType.SIGNAL
      };
      if (doc.netLabels === undefined) {
        doc.netLabels = [];
      }
      doc.netLabels.push(label);
    }
  }

  /** 端点落在 junction 容差内则吸附到结点坐标 */
  private static snapWireEndsToJunctions(
    doc: SchematicDocument, junctions: Point2D[], tol: number
  ): void {
    for (let wi = 0; wi < doc.wires.length; wi++) {
      const pts = doc.wires[wi].points;
      if (pts.length < 2) {
        continue;
      }
      const ends = [0, pts.length - 1];
      for (let ei = 0; ei < ends.length; ei++) {
        const idx = ends[ei];
        const p = pts[idx];
        for (let ji = 0; ji < junctions.length; ji++) {
          const j = junctions[ji];
          if (Math.hypot(p.x - j.x, p.y - j.y) <= tol) {
            pts[idx] = { x: j.x, y: j.y };
            break;
          }
        }
      }
    }
  }

  /** 标号锚点靠近导线 → 导线改属标号网（导入后连通种子） */
  private static bindLabelsToNearbyWires(doc: SchematicDocument, tol: number): void {
    const labels = doc.netLabels ?? [];
    for (let li = 0; li < labels.length; li++) {
      const lb = labels[li];
      for (let wi = 0; wi < doc.wires.length; wi++) {
        const w = doc.wires[wi];
        if (w.points.length < 2) {
          continue;
        }
        let hit = false;
        for (let pi = 0; pi < w.points.length; pi++) {
          if (Math.hypot(w.points[pi].x - lb.position.x, w.points[pi].y - lb.position.y) <= tol) {
            hit = true;
            break;
          }
        }
        if (!hit) {
          for (let si = 0; si < w.points.length - 1; si++) {
            if (KiCadParser.pointNearSegment(lb.position, w.points[si], w.points[si + 1], tol)) {
              hit = true;
              break;
            }
          }
        }
        if (hit) {
          w.netId = lb.netId;
        }
      }
    }
  }

  private static pointNearSegment(p: Point2D, a: Point2D, b: Point2D, tol: number): boolean {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-6) {
      return Math.hypot(p.x - a.x, p.y - a.y) <= tol;
    }
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    if (t < 0) {
      t = 0;
    } else if (t > 1) {
      t = 1;
    }
    const qx = a.x + t * dx;
    const qy = a.y + t * dy;
    return Math.hypot(p.x - qx, p.y - qy) <= tol;
  }

  private static normalizeRotation(deg: number): 0 | 90 | 180 | 270 {
    const r = ((Math.round(deg / 90) % 4) + 4) % 4;
    if (r === 1) {
      return 90;
    }
    if (r === 2) {
      return 180;
    }
    if (r === 3) {
      return 270;
    }
    return 0;
  }

  private static extractBlocks(content: string, tag: string): string[] {
    const blocks: string[] = [];
    const startToken = `(${tag}`;
    let from = 0;
    while (from < content.length) {
      const start = content.indexOf(startToken, from);
      if (start < 0) {
        break;
      }
      // 确保是完整 token（后跟空白或括号）
      const after = start + startToken.length;
      if (after < content.length) {
        const ch = content.charAt(after);
        if (ch !== ' ' && ch !== '\n' && ch !== '\r' && ch !== '\t' && ch !== '(') {
          from = after;
          continue;
        }
      }
      let depth = 0;
      let end = -1;
      for (let i = start; i < content.length; i++) {
        const c = content.charAt(i);
        if (c === '(') {
          depth++;
        } else if (c === ')') {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end < 0) {
        break;
      }
      blocks.push(content.substring(start, end + 1));
      from = end + 1;
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

  private static extractPoints(block: string, scale: number): Point2D[] {
    const pts: Point2D[] = [];
    const re = /\(xy\s+([\d.-]+)\s+([\d.-]+)\)/g;
    let m: RegExpExecArray | null = re.exec(block);
    while (m !== null) {
      pts.push({ x: parseFloat(m[1]) * scale, y: parseFloat(m[2]) * scale });
      m = re.exec(block);
    }
    return pts;
  }

  private static mapLibId(libId: string): string {
    const u = libId.toUpperCase();
    if (u.includes('STM32F103')) {
      return 'STM32F103C8';
    }
    if (u.includes('POWER:GND') || u.endsWith(':GND') || u === 'GND') {
      return 'GND';
    }
    if (u.includes('POWER:VCC') || u.endsWith(':VCC') || u === 'VCC' || u.includes('+3V3') ||
      u.includes('+5V')) {
      return 'VCC';
    }
    if (u.includes('RESISTOR') || u.includes(':R_') || /:R\b/.test(u)) {
      return 'R_10k';
    }
    if (u.includes('CAPACITOR') || u.includes(':C_') || /:C\b/.test(u)) {
      return 'C_100nF';
    }
    if (u.includes('LED')) {
      return 'LED_RED';
    }
    if (u.includes('74HC04')) {
      return '74HC04';
    }
    const parts = libId.split(':');
    return parts.length > 1 ? parts[1] : libId;
  }
}
