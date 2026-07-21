/**
 * 将实验模板电路合并到用户当前工程（放置在空白区域，不替换工程文件）
 */
import {
  SchematicDocument, ComponentInstance, Net, Wire, NetLabel, NetType, Point2D, WorldRect
} from 'common';
import { IdUtil, parsePinRef, buildPinRef, copyStringMap } from 'common';

export class TemplateMergeUtil {
  private static readonly MARGIN = 80;
  private static readonly ORIGIN_PAD = 40;

  /** 把 source 模板内容复制进 target，返回放置偏移 */
  static mergeTemplateInto(target: SchematicDocument, source: SchematicDocument): Point2D {
    const offset = TemplateMergeUtil.calcPlacementOffset(target, source);
    const compIdMap = new Map<string, string>();
    const netIdMap = new Map<string, string>();
    const usedRefDes = new Set<string>();
    for (let i = 0; i < target.components.length; i++) {
      usedRefDes.add(target.components[i].refDes);
    }

    for (let i = 0; i < source.components.length; i++) {
      const src = source.components[i];
      const newId = IdUtil.generate('comp');
      compIdMap.set(src.id, newId);
      const refDes = TemplateMergeUtil.allocateRefDes(src.libraryId, src.refDes, usedRefDes);
      usedRefDes.add(refDes);
      const comp: ComponentInstance = {
        id: newId,
        libraryId: src.libraryId,
        refDes: refDes,
        position: { x: src.position.x + offset.x, y: src.position.y + offset.y },
        rotation: src.rotation,
        mirrored: src.mirrored,
        parameters: copyStringMap(src.parameters)
      };
      if (src.subcircuitId !== undefined && src.subcircuitId.length > 0) {
        comp.subcircuitId = src.subcircuitId;
      }
      target.components.push(comp);
    }

    for (let i = 0; i < source.nets.length; i++) {
      const srcNet = source.nets[i];
      const rail = TemplateMergeUtil.isRailNet(srcNet);
      let existing: Net | undefined = undefined;
      if (rail) {
        for (let ni = 0; ni < target.nets.length; ni++) {
          if (target.nets[ni].name === srcNet.name) {
            existing = target.nets[ni];
            break;
          }
        }
      }
      if (existing !== undefined) {
        netIdMap.set(srcNet.id, existing.id);
        TemplateMergeUtil.appendPinRefs(existing, srcNet.pinIds, compIdMap);
      } else {
        const newNetId = IdUtil.generate('net');
        netIdMap.set(srcNet.id, newNetId);
        const pinIds: string[] = [];
        TemplateMergeUtil.remapPinRefs(srcNet.pinIds, compIdMap, pinIds);
        const net: Net = {
          id: newNetId,
          name: TemplateMergeUtil.uniqueNetName(target, srcNet.name),
          type: srcNet.type,
          pinIds: pinIds
        };
        target.nets.push(net);
      }
    }

    for (let i = 0; i < source.wires.length; i++) {
      const w = source.wires[i];
      const mappedNetId = netIdMap.get(w.netId);
      if (mappedNetId === undefined || mappedNetId.length === 0) {
        continue;
      }
      const points: Point2D[] = [];
      for (let pi = 0; pi < w.points.length; pi++) {
        points.push({
          x: w.points[pi].x + offset.x,
          y: w.points[pi].y + offset.y
        });
      }
      const wire: Wire = {
        id: IdUtil.generate('wire'),
        netId: mappedNetId,
        points: points,
        style: w.style
      };
      target.wires.push(wire);
    }

    // Net Labels（Proteus LBL）必须一并迁入，否则仿真并网与画面上都看不到标号
    if (target.netLabels === undefined) {
      target.netLabels = [];
    }
    if (source.netLabels !== undefined) {
      for (let i = 0; i < source.netLabels.length; i++) {
        const srcLb = source.netLabels[i];
        let mappedNetId = netIdMap.get(srcLb.netId);
        if (mappedNetId === undefined || mappedNetId.length === 0) {
          // 标号文本可能对应已合并的电源轨或同名网络
          mappedNetId = TemplateMergeUtil.findNetIdByName(target, srcLb.text);
        }
        if (mappedNetId === undefined || mappedNetId.length === 0) {
          // 绝不丢标号：创建同名网，否则仿真侧 applyNetLabelConnectivity 无法并网
          let netType = NetType.SIGNAL;
          const upper = srcLb.text.toUpperCase();
          if (upper === 'VCC' || upper === 'VDD') {
            netType = NetType.POWER;
          } else if (upper === 'VEE' || upper === 'V-') {
            netType = NetType.POWER;
          } else if (upper === 'GND' || upper === 'VSS' || upper === '0') {
            netType = NetType.GROUND;
          }
          mappedNetId = IdUtil.generate('net');
          const created: Net = {
            id: mappedNetId,
            name: srcLb.text,
            type: netType,
            pinIds: []
          };
          target.nets.push(created);
        }
        const label: NetLabel = {
          id: IdUtil.generate('lbl'),
          netId: mappedNetId,
          text: srcLb.text,
          position: {
            x: srcLb.position.x + offset.x,
            y: srcLb.position.y + offset.y
          },
          global: srcLb.global
        };
        target.netLabels.push(label);
      }
    }

    target.metadata.modifiedAt = new Date().toISOString();
    return offset;
  }

  private static calcPlacementOffset(target: SchematicDocument, source: SchematicDocument): Point2D {
    const srcBounds = TemplateMergeUtil.contentBounds(source);
    if (target.components.length === 0 && target.wires.length === 0) {
      return {
        x: TemplateMergeUtil.ORIGIN_PAD - srcBounds.minX,
        y: TemplateMergeUtil.ORIGIN_PAD - srcBounds.minY
      };
    }
    const tgtBounds = TemplateMergeUtil.contentBounds(target);
    return {
      x: tgtBounds.maxX + TemplateMergeUtil.MARGIN - srcBounds.minX,
      y: tgtBounds.minY - srcBounds.minY
    };
  }

  private static contentBounds(doc: SchematicDocument): WorldRect {
    let minX = 0;
    let minY = 0;
    let maxX = 0;
    let maxY = 0;
    let hasAny = false;
    const pad = 40;
    for (let i = 0; i < doc.components.length; i++) {
      const c = doc.components[i];
      const x = c.position.x;
      const y = c.position.y;
      if (!hasAny) {
        minX = x; maxX = x; minY = y; maxY = y;
        hasAny = true;
      } else {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    for (let wi = 0; wi < doc.wires.length; wi++) {
      const pts = doc.wires[wi].points;
      for (let pi = 0; pi < pts.length; pi++) {
        const x = pts[pi].x;
        const y = pts[pi].y;
        if (!hasAny) {
          minX = x; maxX = x; minY = y; maxY = y;
          hasAny = true;
        } else {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
    if (doc.netLabels !== undefined) {
      for (let li = 0; li < doc.netLabels.length; li++) {
        const x = doc.netLabels[li].position.x;
        const y = doc.netLabels[li].position.y;
        if (!hasAny) {
          minX = x; maxX = x; minY = y; maxY = y;
          hasAny = true;
        } else {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
    if (!hasAny) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
    return {
      minX: minX - pad,
      minY: minY - pad,
      maxX: maxX + pad,
      maxY: maxY + pad
    };
  }

  private static isRailNet(net: Net): boolean {
    if (net.type === NetType.POWER || net.type === NetType.GROUND) {
      return true;
    }
    const upper = net.name.toUpperCase();
    return upper === 'VCC' || upper === 'VDD' || upper === 'GND' || upper === 'VSS' || upper === 'VEE';
  }

  private static findNetIdByName(doc: SchematicDocument, name: string): string | undefined {
    for (let i = 0; i < doc.nets.length; i++) {
      if (doc.nets[i].name === name) {
        return doc.nets[i].id;
      }
    }
    return undefined;
  }

  private static appendPinRefs(net: Net, pinRefs: string[], compIdMap: Map<string, string>): void {
    for (let i = 0; i < pinRefs.length; i++) {
      const parsed = parsePinRef(pinRefs[i]);
      if (parsed === null || parsed.compId.length === 0) {
        continue;
      }
      const newCompId = compIdMap.get(parsed.compId);
      if (newCompId === undefined) {
        continue;
      }
      const newRef = buildPinRef(newCompId, parsed.pinId, parsed.pinName);
      if (!net.pinIds.includes(newRef)) {
        net.pinIds.push(newRef);
      }
    }
  }

  private static remapPinRefs(pinRefs: string[], compIdMap: Map<string, string>, out: string[]): void {
    for (let i = 0; i < pinRefs.length; i++) {
      const parsed = parsePinRef(pinRefs[i]);
      if (parsed === null || parsed.compId.length === 0) {
        continue;
      }
      const newCompId = compIdMap.get(parsed.compId);
      if (newCompId === undefined) {
        continue;
      }
      out.push(buildPinRef(newCompId, parsed.pinId, parsed.pinName));
    }
  }

  private static uniqueNetName(target: SchematicDocument, baseName: string): string {
    const used = new Set<string>();
    for (let i = 0; i < target.nets.length; i++) {
      used.add(target.nets[i].name);
    }
    if (!used.has(baseName)) {
      return baseName;
    }
    let idx = 2;
    while (used.has(`${baseName}_${idx}`)) {
      idx++;
    }
    return `${baseName}_${idx}`;
  }

  private static allocateRefDes(libraryId: string, preferred: string, used: Set<string>): string {
    if (!used.has(preferred)) {
      return preferred;
    }
    const prefix = TemplateMergeUtil.refDesPrefix(libraryId);
    let n = 1;
    while (used.has(`${prefix}${n}`)) {
      n++;
    }
    return `${prefix}${n}`;
  }

  private static refDesPrefix(libraryId: string): string {
    if (libraryId.startsWith('R_')) return 'R';
    if (libraryId.startsWith('C_')) return 'C';
    if (libraryId.startsWith('L_')) return 'L';
    if (libraryId.includes('LED')) return 'D';
    if (libraryId.includes('74HC') || libraryId.includes('CD')) return 'U';
    if (libraryId.includes('STM32') || libraryId.includes('AT89') || libraryId.includes('STC')) return 'U';
    if (libraryId.includes('OSCILLOSCOPE') || libraryId.includes('VIRTUAL')) return 'X';
    return 'U';
  }
}
