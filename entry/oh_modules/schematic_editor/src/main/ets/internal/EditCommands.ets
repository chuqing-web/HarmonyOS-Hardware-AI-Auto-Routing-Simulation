/**
 * 编辑命令模式 — 增量撤销替代全量快照
 */
import { SchematicDocument, ComponentInstance, Point2D, Wire, Rotation, RouteResult, WireStyle, IdUtil, Net, NetLabel, SchematicMetadata, SubcircuitRef, ProbeMeta, SchematicAnnotation, SimulationConfig } from 'common';

export interface IEditCommand {
  execute(): void;
  undo(): void;
  getMemoryEstimate(): number;
}

export class MoveCommand implements IEditCommand {
  private doc: SchematicDocument;
  private compId: string;
  private oldPos: Point2D;
  private newPos: Point2D;

  constructor(doc: SchematicDocument, compId: string, oldPos: Point2D, newPos: Point2D) {
    this.doc = doc;
    this.compId = compId;
    this.oldPos = { x: oldPos.x, y: oldPos.y };
    this.newPos = { x: newPos.x, y: newPos.y };
  }

  execute(): void {
    const c = this.doc.components.find(c => c.id === this.compId);
    if (c) c.position = { x: this.newPos.x, y: this.newPos.y };
  }

  undo(): void {
    const c = this.doc.components.find(c => c.id === this.compId);
    if (c) c.position = { x: this.oldPos.x, y: this.oldPos.y };
  }

  getMemoryEstimate(): number { return 32; }
}

export class PlaceCommand implements IEditCommand {
  private doc: SchematicDocument;
  private comp: ComponentInstance;
  private placed: boolean = false;

  constructor(doc: SchematicDocument, comp: ComponentInstance) {
    this.doc = doc;
    this.comp = comp;
  }

  execute(): void {
    if (!this.placed) {
      this.doc.components.push(this.comp);
      this.placed = true;
    }
  }

  undo(): void {
    const idx = this.doc.components.findIndex(c => c.id === this.comp.id);
    if (idx >= 0) this.doc.components.splice(idx, 1);
    this.placed = false;
  }

  getMemoryEstimate(): number { return 256; }
}

export class DeleteCommand implements IEditCommand {
  private doc: SchematicDocument;
  private comp: ComponentInstance;
  private index: number = -1;

  constructor(doc: SchematicDocument, compId: string) {
    this.doc = doc;
    const idx = doc.components.findIndex(c => c.id === compId);
    this.index = idx;
    this.comp = idx >= 0 ? doc.components[idx] : {
      id: compId, libraryId: '', refDes: '', position: { x: 0, y: 0 },
      rotation: 0, mirrored: false, parameters: new Map()
    };
  }

  execute(): void {
    if (this.index >= 0) this.doc.components.splice(this.index, 1);
  }

  undo(): void {
    if (this.index >= 0) this.doc.components.splice(this.index, 0, this.comp);
  }

  getMemoryEstimate(): number { return 256; }
}

interface DeletedEntry {
  index: number;
  comp: ComponentInstance;
}

interface WireBackup {
  index: number;
  wire: Wire;
}

interface LabelBackup {
  index: number;
  label: NetLabel;
}

export class BatchDeleteCommand implements IEditCommand {
  private doc: SchematicDocument;
  private entries: DeletedEntry[] = [];
  private wireBackups: WireBackup[] = [];
  private labelBackups: LabelBackup[] = [];
  private removedPinRefs: Map<string, string[]> = new Map();

  constructor(
    doc: SchematicDocument,
    compIds: string[],
    wireIdsToRemove: string[] = [],
    labelIdsToRemove: string[] = []
  ) {
    this.doc = doc;
    for (let i = 0; i < compIds.length; i++) {
      const idx = doc.components.findIndex(c => c.id === compIds[i]);
      if (idx >= 0) {
        const entry: DeletedEntry = {
          index: idx,
          comp: doc.components[idx]
        };
        this.entries.push(entry);
      }
    }
    this.entries.sort((a: DeletedEntry, b: DeletedEntry) => b.index - a.index);

    const wireIdSet = new Set<string>();
    for (let i = 0; i < wireIdsToRemove.length; i++) {
      wireIdSet.add(wireIdsToRemove[i]);
    }
    for (let i = 0; i < doc.wires.length; i++) {
      const w = doc.wires[i];
      if (!wireIdSet.has(w.id)) {
        continue;
      }
      const pts: Point2D[] = [];
      for (let j = 0; j < w.points.length; j++) {
        pts.push({ x: w.points[j].x, y: w.points[j].y });
      }
      this.wireBackups.push({
        index: i,
        wire: { id: w.id, netId: w.netId, points: pts, style: w.style }
      });
    }
    this.wireBackups.sort((a: WireBackup, b: WireBackup) => b.index - a.index);

    const labelIdSet = new Set<string>();
    for (let i = 0; i < labelIdsToRemove.length; i++) {
      labelIdSet.add(labelIdsToRemove[i]);
    }
    const labels = doc.netLabels ?? [];
    for (let i = 0; i < labels.length; i++) {
      const lb = labels[i];
      if (!labelIdSet.has(lb.id)) {
        continue;
      }
      this.labelBackups.push({
        index: i,
        label: {
          id: lb.id,
          netId: lb.netId,
          text: lb.text,
          position: { x: lb.position.x, y: lb.position.y },
          global: lb.global
        }
      });
    }
    this.labelBackups.sort((a: LabelBackup, b: LabelBackup) => b.index - a.index);

    // Snapshot pinIds that will be stripped from nets (for undo)
    for (let i = 0; i < this.entries.length; i++) {
      const prefix = `${this.entries[i].comp.id}:`;
      for (let ni = 0; ni < doc.nets.length; ni++) {
        const net = doc.nets[ni];
        const removed: string[] = [];
        for (let pi = 0; pi < net.pinIds.length; pi++) {
          if (net.pinIds[pi].startsWith(prefix)) {
            removed.push(net.pinIds[pi]);
          }
        }
        if (removed.length > 0) {
          const existing = this.removedPinRefs.get(net.id);
          if (existing !== undefined) {
            for (let ri = 0; ri < removed.length; ri++) {
              existing.push(removed[ri]);
            }
          } else {
            this.removedPinRefs.set(net.id, removed);
          }
        }
      }
    }
  }

  execute(): void {
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      const idx = this.doc.components.findIndex(c => c.id === e.comp.id);
      if (idx >= 0) this.doc.components.splice(idx, 1);
    }
    if (this.wireBackups.length > 0) {
      const removeIds = new Set<string>();
      for (let i = 0; i < this.wireBackups.length; i++) {
        removeIds.add(this.wireBackups[i].wire.id);
      }
      const kept: Wire[] = [];
      for (let i = 0; i < this.doc.wires.length; i++) {
        if (!removeIds.has(this.doc.wires[i].id)) {
          kept.push(this.doc.wires[i]);
        }
      }
      this.doc.wires = kept;
    }
    if (this.labelBackups.length > 0) {
      const removeLabelIds = new Set<string>();
      for (let i = 0; i < this.labelBackups.length; i++) {
        removeLabelIds.add(this.labelBackups[i].label.id);
      }
      const keptLabels: NetLabel[] = [];
      const srcLabels = this.doc.netLabels ?? [];
      for (let i = 0; i < srcLabels.length; i++) {
        if (!removeLabelIds.has(srcLabels[i].id)) {
          keptLabels.push(srcLabels[i]);
        }
      }
      this.doc.netLabels = keptLabels;
    }
    this.removedPinRefs.forEach((refs: string[], netId: string) => {
      const net = this.doc.nets.find(n => n.id === netId);
      if (net === undefined) {
        return;
      }
      const keepPins: string[] = [];
      for (let pi = 0; pi < net.pinIds.length; pi++) {
        if (!refs.includes(net.pinIds[pi])) {
          keepPins.push(net.pinIds[pi]);
        }
      }
      net.pinIds = keepPins;
    });
  }

  undo(): void {
    const sorted = this.entries.slice().sort((a: DeletedEntry, b: DeletedEntry) => a.index - b.index);
    for (let i = 0; i < sorted.length; i++) {
      const e = sorted[i];
      this.doc.components.splice(e.index, 0, e.comp);
    }
    const wireSorted = this.wireBackups.slice().sort((a: WireBackup, b: WireBackup) => a.index - b.index);
    for (let i = 0; i < wireSorted.length; i++) {
      this.doc.wires.splice(wireSorted[i].index, 0, wireSorted[i].wire);
    }
    const labelSorted = this.labelBackups.slice().sort((a: LabelBackup, b: LabelBackup) => a.index - b.index);
    if (this.doc.netLabels === undefined) {
      this.doc.netLabels = [];
    }
    for (let i = 0; i < labelSorted.length; i++) {
      const lb = labelSorted[i];
      const insertAt = Math.min(lb.index, this.doc.netLabels.length);
      this.doc.netLabels.splice(insertAt, 0, {
        id: lb.label.id,
        netId: lb.label.netId,
        text: lb.label.text,
        position: { x: lb.label.position.x, y: lb.label.position.y },
        global: lb.label.global
      });
    }
    this.removedPinRefs.forEach((refs: string[], netId: string) => {
      const net = this.doc.nets.find(n => n.id === netId);
      if (net === undefined) {
        return;
      }
      for (let i = 0; i < refs.length; i++) {
        if (!net.pinIds.includes(refs[i])) {
          net.pinIds.push(refs[i]);
        }
      }
    });
  }

  getMemoryEstimate(): number {
    return this.entries.length * 256 + this.wireBackups.length * 128 + this.labelBackups.length * 64;
  }
}

export class AddWireCommand implements IEditCommand {
  private doc: SchematicDocument;
  private wire: Wire;

  constructor(doc: SchematicDocument, wire: Wire) {
    this.doc = doc;
    const pts: Point2D[] = [];
    for (let i = 0; i < wire.points.length; i++) {
      pts.push({ x: wire.points[i].x, y: wire.points[i].y });
    }
    this.wire = {
      id: wire.id, netId: wire.netId, points: pts, style: wire.style
    };
  }

  execute(): void {
    this.doc.wires.push(this.wire);
  }

  undo(): void {
    for (let i = 0; i < this.doc.wires.length; i++) {
      if (this.doc.wires[i].id === this.wire.id) {
        this.doc.wires.splice(i, 1);
        break;
      }
    }
  }

  getMemoryEstimate(): number { return 128; }
}

export class ClearWiresCommand implements IEditCommand {
  private doc: SchematicDocument;
  private backups: WireBackup[] = [];

  /**
   * netIds — 按网络删除（兼容旧调用）
   * wireIds — 按单根导线 id 删除（优先）
   * 二者皆空 — 清空全部导线
   */
  constructor(doc: SchematicDocument, netIds?: string[], wireIds?: string[]) {
    this.doc = doc;
    for (let i = 0; i < doc.wires.length; i++) {
      const w = doc.wires[i];
      let match = false;
      if (wireIds !== undefined) {
        match = wireIds.includes(w.id);
      } else if (netIds === undefined) {
        match = true;
      } else {
        match = netIds.includes(w.netId);
      }
      if (!match) {
        continue;
      }
      const pts: Point2D[] = [];
      for (let j = 0; j < w.points.length; j++) {
        pts.push({ x: w.points[j].x, y: w.points[j].y });
      }
      this.backups.push({
        index: i,
        wire: { id: w.id, netId: w.netId, points: pts, style: w.style }
      });
    }
    this.backups.sort((a: WireBackup, b: WireBackup) => b.index - a.index);
  }

  execute(): void {
    if (this.backups.length === 0) {
      // 无匹配导线：不要误清全图（仅 clearAll 且原本无导线时也会落到这里，结果仍为空）
      return;
    }
    const removeIds = new Set<string>();
    for (let i = 0; i < this.backups.length; i++) removeIds.add(this.backups[i].wire.id);
    const kept: Wire[] = [];
    for (let i = 0; i < this.doc.wires.length; i++) {
      if (!removeIds.has(this.doc.wires[i].id)) kept.push(this.doc.wires[i]);
    }
    this.doc.wires = kept;
  }

  undo(): void {
    const sorted = this.backups.slice().sort((a: WireBackup, b: WireBackup) => a.index - b.index);
    for (let i = 0; i < sorted.length; i++) {
      this.doc.wires.splice(sorted[i].index, 0, sorted[i].wire);
    }
  }

  getMemoryEstimate(): number { return this.backups.length * 128; }
}

export class RotateCommand implements IEditCommand {
  private doc: SchematicDocument;
  private compId: string;
  private oldRot: Rotation;
  private newRot: Rotation;
  private beforeWirePts: Map<string, Point2D[]> = new Map();
  private afterWirePts: Map<string, Point2D[]> = new Map();
  private beforeLabelPos: Map<string, Point2D> = new Map();
  private afterLabelPos: Map<string, Point2D> = new Map();
  private hasGeometry: boolean = false;

  constructor(doc: SchematicDocument, compId: string, oldRot: Rotation, newRot: Rotation) {
    this.doc = doc;
    this.compId = compId;
    this.oldRot = oldRot;
    this.newRot = newRot;
  }

  captureGeometry(
    beforeWires: Map<string, Point2D[]>,
    afterWires: Map<string, Point2D[]>,
    beforeLabels: Map<string, Point2D>,
    afterLabels: Map<string, Point2D>
  ): void {
    this.beforeWirePts = beforeWires;
    this.afterWirePts = afterWires;
    this.beforeLabelPos = beforeLabels;
    this.afterLabelPos = afterLabels;
    this.hasGeometry = true;
  }

  execute(): void {
    for (let i = 0; i < this.doc.components.length; i++) {
      if (this.doc.components[i].id === this.compId) {
        this.doc.components[i].rotation = this.newRot;
        break;
      }
    }
    if (this.hasGeometry) {
      applyCapturedWirePts(this.doc, this.afterWirePts);
      applyCapturedLabelPos(this.doc, this.afterLabelPos);
    }
  }

  undo(): void {
    for (let i = 0; i < this.doc.components.length; i++) {
      if (this.doc.components[i].id === this.compId) {
        this.doc.components[i].rotation = this.oldRot;
        break;
      }
    }
    if (this.hasGeometry) {
      applyCapturedWirePts(this.doc, this.beforeWirePts);
      applyCapturedLabelPos(this.doc, this.beforeLabelPos);
    }
  }

  getMemoryEstimate(): number {
    return 64 + this.beforeWirePts.size * 48 + this.afterWirePts.size * 48;
  }
}

export class MirrorCommand implements IEditCommand {
  private doc: SchematicDocument;
  private compId: string;
  private oldMirrored: boolean;
  private newMirrored: boolean;
  private beforeWirePts: Map<string, Point2D[]> = new Map();
  private afterWirePts: Map<string, Point2D[]> = new Map();
  private beforeLabelPos: Map<string, Point2D> = new Map();
  private afterLabelPos: Map<string, Point2D> = new Map();
  private hasGeometry: boolean = false;

  constructor(doc: SchematicDocument, compId: string, oldMirrored: boolean, newMirrored: boolean) {
    this.doc = doc;
    this.compId = compId;
    this.oldMirrored = oldMirrored;
    this.newMirrored = newMirrored;
  }

  captureGeometry(
    beforeWires: Map<string, Point2D[]>,
    afterWires: Map<string, Point2D[]>,
    beforeLabels: Map<string, Point2D>,
    afterLabels: Map<string, Point2D>
  ): void {
    this.beforeWirePts = beforeWires;
    this.afterWirePts = afterWires;
    this.beforeLabelPos = beforeLabels;
    this.afterLabelPos = afterLabels;
    this.hasGeometry = true;
  }

  execute(): void {
    for (let i = 0; i < this.doc.components.length; i++) {
      if (this.doc.components[i].id === this.compId) {
        this.doc.components[i].mirrored = this.newMirrored;
        break;
      }
    }
    if (this.hasGeometry) {
      applyCapturedWirePts(this.doc, this.afterWirePts);
      applyCapturedLabelPos(this.doc, this.afterLabelPos);
    }
  }

  undo(): void {
    for (let i = 0; i < this.doc.components.length; i++) {
      if (this.doc.components[i].id === this.compId) {
        this.doc.components[i].mirrored = this.oldMirrored;
        break;
      }
    }
    if (this.hasGeometry) {
      applyCapturedWirePts(this.doc, this.beforeWirePts);
      applyCapturedLabelPos(this.doc, this.beforeLabelPos);
    }
  }

  getMemoryEstimate(): number {
    return 64 + this.beforeWirePts.size * 48 + this.afterWirePts.size * 48;
  }
}

function applyCapturedWirePts(doc: SchematicDocument, pts: Map<string, Point2D[]>): void {
  pts.forEach((points: Point2D[], wireId: string) => {
    for (let i = 0; i < doc.wires.length; i++) {
      if (doc.wires[i].id !== wireId) {
        continue;
      }
      const cloned: Point2D[] = [];
      for (let j = 0; j < points.length; j++) {
        cloned.push({ x: points[j].x, y: points[j].y });
      }
      doc.wires[i].points = cloned;
      break;
    }
  });
}

function applyCapturedLabelPos(doc: SchematicDocument, pos: Map<string, Point2D>): void {
  const labels = doc.netLabels ?? [];
  pos.forEach((p: Point2D, labelId: string) => {
    for (let i = 0; i < labels.length; i++) {
      if (labels[i].id === labelId) {
        labels[i].position = { x: p.x, y: p.y };
        break;
      }
    }
  });
}

function cloneWire(w: Wire): Wire {
  const pts: Point2D[] = [];
  for (let i = 0; i < w.points.length; i++) {
    pts.push({ x: w.points[i].x, y: w.points[i].y });
  }
  return { id: w.id, netId: w.netId, points: pts, style: w.style };
}

function cloneWireList(wires: Wire[]): Wire[] {
  const out: Wire[] = [];
  for (let i = 0; i < wires.length; i++) {
    out.push(cloneWire(wires[i]));
  }
  return out;
}

export class SetDeviceParamCommand implements IEditCommand {
  private doc: SchematicDocument;
  private compId: string;
  private key: string;
  private oldValue: string | undefined;
  private newValue: string;
  private hadKey: boolean = false;

  constructor(doc: SchematicDocument, compId: string, key: string, newValue: string) {
    this.doc = doc;
    this.compId = compId;
    this.key = key;
    this.newValue = newValue;
    for (let i = 0; i < doc.components.length; i++) {
      if (doc.components[i].id === compId) {
        this.hadKey = doc.components[i].parameters.has(key);
        this.oldValue = doc.components[i].parameters.get(key);
        break;
      }
    }
  }

  execute(): void {
    for (let i = 0; i < this.doc.components.length; i++) {
      if (this.doc.components[i].id === this.compId) {
        this.doc.components[i].parameters.set(this.key, this.newValue);
        break;
      }
    }
  }

  undo(): void {
    for (let i = 0; i < this.doc.components.length; i++) {
      if (this.doc.components[i].id === this.compId) {
        if (this.hadKey && this.oldValue !== undefined) {
          this.doc.components[i].parameters.set(this.key, this.oldValue);
        } else {
          this.doc.components[i].parameters.delete(this.key);
        }
        break;
      }
    }
  }

  getMemoryEstimate(): number { return 64; }
}

export class ApplyRouteCommand implements IEditCommand {
  private doc: SchematicDocument;
  private previousWires: Wire[];
  private resultWires: Wire[];

  constructor(doc: SchematicDocument, routeData: RouteResult, keepManualRoute: boolean) {
    this.doc = doc;
    this.previousWires = cloneWireList(doc.wires);
    const next: Wire[] = keepManualRoute ? cloneWireList(doc.wires) : [];
    for (let i = 0; i < routeData.routeLines.length; i++) {
      const line = routeData.routeLines[i];
      const pts: Point2D[] = [];
      for (let j = 0; j < line.points.length; j++) {
        pts.push({ x: line.points[j].x, y: line.points[j].y });
      }
      next.push({
        id: IdUtil.generate('wire'),
        netId: line.netUuid,
        points: pts,
        style: WireStyle.ORTHOGONAL
      });
    }
    this.resultWires = next;
  }

  execute(): void {
    this.doc.wires = cloneWireList(this.resultWires);
  }

  undo(): void {
    this.doc.wires = cloneWireList(this.previousWires);
  }

  getMemoryEstimate(): number { return this.resultWires.length * 128; }
}

export interface BatchMoveEntry {
  compId: string;
  oldPos: Point2D;
  newPos: Point2D;
}

export class BatchMoveCommand implements IEditCommand {
  private doc: SchematicDocument;
  private moves: BatchMoveEntry[];

  constructor(doc: SchematicDocument, moves: BatchMoveEntry[]) {
    this.doc = doc;
    this.moves = [];
    for (let i = 0; i < moves.length; i++) {
      this.moves.push({
        compId: moves[i].compId,
        oldPos: { x: moves[i].oldPos.x, y: moves[i].oldPos.y },
        newPos: { x: moves[i].newPos.x, y: moves[i].newPos.y }
      });
    }
  }

  execute(): void {
    for (let i = 0; i < this.moves.length; i++) {
      const m = this.moves[i];
      for (let j = 0; j < this.doc.components.length; j++) {
        if (this.doc.components[j].id === m.compId) {
          this.doc.components[j].position = { x: m.newPos.x, y: m.newPos.y };
          break;
        }
      }
    }
  }

  undo(): void {
    for (let i = 0; i < this.moves.length; i++) {
      const m = this.moves[i];
      for (let j = 0; j < this.doc.components.length; j++) {
        if (this.doc.components[j].id === m.compId) {
          this.doc.components[j].position = { x: m.oldPos.x, y: m.oldPos.y };
          break;
        }
      }
    }
  }

  getMemoryEstimate(): number { return this.moves.length * 32; }
}

interface ParamBackup {
  compId: string;
  key: string;
  oldValue: string | undefined;
  hadKey: boolean;
  newValue: string;
}

export class BatchSetDeviceParamCommand implements IEditCommand {
  private doc: SchematicDocument;
  private backups: ParamBackup[];

  constructor(doc: SchematicDocument, compIds: string[], key: string, newValue: string) {
    this.doc = doc;
    this.backups = [];
    for (let i = 0; i < compIds.length; i++) {
      for (let j = 0; j < doc.components.length; j++) {
        if (doc.components[j].id === compIds[i]) {
          this.backups.push({
            compId: compIds[i],
            key: key,
            oldValue: doc.components[j].parameters.get(key),
            hadKey: doc.components[j].parameters.has(key),
            newValue: newValue
          });
          break;
        }
      }
    }
  }

  execute(): void {
    for (let i = 0; i < this.backups.length; i++) {
      const b = this.backups[i];
      for (let j = 0; j < this.doc.components.length; j++) {
        if (this.doc.components[j].id === b.compId) {
          this.doc.components[j].parameters.set(b.key, b.newValue);
          break;
        }
      }
    }
  }

  undo(): void {
    for (let i = 0; i < this.backups.length; i++) {
      const b = this.backups[i];
      for (let j = 0; j < this.doc.components.length; j++) {
        if (this.doc.components[j].id === b.compId) {
          if (b.hadKey && b.oldValue !== undefined) {
            this.doc.components[j].parameters.set(b.key, b.oldValue);
          } else {
            this.doc.components[j].parameters.delete(b.key);
          }
          break;
        }
      }
    }
  }

  getMemoryEstimate(): number { return this.backups.length * 64; }
}

interface DocSnapshot {
  id: string;
  name: string;
  version: string;
  metadata: SchematicMetadata;
  components: ComponentInstance[];
  nets: Net[];
  wires: Wire[];
  netLabels: NetLabel[];
  subcircuits: SubcircuitRef[];
  annotations?: SchematicAnnotation[];
  probes?: ProbeMeta[];
  simulationConfig?: SimulationConfig;
}

function cloneComponent(c: ComponentInstance): ComponentInstance {
  const params = new Map<string, string>();
  c.parameters.forEach((v: string, k: string) => params.set(k, v));
  const srcPinIds = c.pinIds ?? [];
  const pinIdsClone: string[] = [];
  for (let pi = 0; pi < srcPinIds.length; pi++) {
    pinIdsClone.push(srcPinIds[pi]);
  }
  return {
    id: c.id,
    libraryId: c.libraryId,
    refDes: c.refDes,
    name: c.name,
    position: { x: c.position.x, y: c.position.y },
    rotation: c.rotation,
    mirrored: c.mirrored,
    x: c.x,
    y: c.y,
    parameters: params,
    pinIds: pinIdsClone,
    attributes: c.attributes ? new Map(c.attributes) : undefined,
    pinOverrides: c.pinOverrides ? new Map(c.pinOverrides) : undefined,
    subcircuitId: c.subcircuitId
  };
}

function snapshotDocument(doc: SchematicDocument): DocSnapshot {
  const components: ComponentInstance[] = [];
  for (let i = 0; i < doc.components.length; i++) {
    components.push(cloneComponent(doc.components[i]));
  }
  const nets: Net[] = [];
  for (let i = 0; i < doc.nets.length; i++) {
    const n = doc.nets[i];
    nets.push({ id: n.id, name: n.name, pinIds: n.pinIds.slice(), type: n.type });
  }
  const wires: Wire[] = [];
  for (let i = 0; i < doc.wires.length; i++) {
    const w = doc.wires[i];
    const points: Point2D[] = [];
    for (let j = 0; j < w.points.length; j++) {
      points.push({ x: w.points[j].x, y: w.points[j].y });
    }
    wires.push({
      id: w.id, netId: w.netId, points: points, style: w.style
    });
  }
  const netLabels: NetLabel[] = [];
  for (let i = 0; i < doc.netLabels.length; i++) {
    const l = doc.netLabels[i];
    netLabels.push({
      id: l.id, netId: l.netId, text: l.text,
      position: { x: l.position.x, y: l.position.y }, global: l.global
    });
  }
  const subcircuits: SubcircuitRef[] = [];
  for (let i = 0; i < doc.subcircuits.length; i++) {
    const s = doc.subcircuits[i];
    subcircuits.push({
      id: s.id, name: s.name, documentId: s.documentId,
      position: { x: s.position.x, y: s.position.y },
      ports: s.ports.slice()
    });
  }
  return {
    id: doc.id,
    name: doc.name,
    version: doc.version,
    metadata: {
      author: doc.metadata.author,
      createdAt: doc.metadata.createdAt,
      modifiedAt: doc.metadata.modifiedAt,
      description: doc.metadata.description,
      gridSize: doc.metadata.gridSize,
      units: doc.metadata.units,
      undoLimit: doc.metadata.undoLimit
    },
    components: components,
    nets: nets,
    wires: wires,
    netLabels: netLabels,
    subcircuits: subcircuits,
    annotations: doc.annotations ?? [],
    probes: doc.probes ?? [],
    simulationConfig: doc.simulationConfig
  };
}

function applySnapshot(doc: SchematicDocument, snap: DocSnapshot): void {
  doc.id = snap.id;
  doc.name = snap.name;
  doc.version = snap.version;
  doc.metadata = {
    author: snap.metadata.author,
    createdAt: snap.metadata.createdAt,
    modifiedAt: snap.metadata.modifiedAt,
    description: snap.metadata.description,
    gridSize: snap.metadata.gridSize,
    units: snap.metadata.units,
    undoLimit: snap.metadata.undoLimit
  };
  doc.components = snap.components;
  doc.nets = snap.nets;
  doc.wires = snap.wires;
  doc.netLabels = snap.netLabels;
  doc.subcircuits = snap.subcircuits;
  doc.annotations = snap.annotations;
  doc.probes = snap.probes;
  doc.simulationConfig = snap.simulationConfig;
}

export class LoadDocumentCommand implements IEditCommand {
  private getter: () => SchematicDocument | null;
  private setter: (doc: SchematicDocument | null) => void;
  private previous: DocSnapshot | null;
  private next: DocSnapshot;

  constructor(
    getter: () => SchematicDocument | null,
    setter: (doc: SchematicDocument | null) => void,
    newDoc: SchematicDocument
  ) {
    this.getter = getter;
    this.setter = setter;
    const cur = getter();
    this.previous = cur !== null ? snapshotDocument(cur) : null;
    this.next = snapshotDocument(newDoc);
  }

  execute(): void {
    const doc = this.getter();
    if (!doc) {
      const created: SchematicDocument = {
        id: this.next.id,
        name: this.next.name,
        version: this.next.version,
        metadata: {
          author: this.next.metadata.author,
          createdAt: this.next.metadata.createdAt,
          modifiedAt: this.next.metadata.modifiedAt,
          description: this.next.metadata.description,
          gridSize: this.next.metadata.gridSize,
          units: this.next.metadata.units,
          undoLimit: this.next.metadata.undoLimit
        },
        components: this.next.components,
        nets: this.next.nets,
        wires: this.next.wires,
        netLabels: this.next.netLabels,
        subcircuits: this.next.subcircuits,
        annotations: this.next.annotations ?? [],
        probes: this.next.probes ?? [],
        simulationConfig: this.next.simulationConfig
      };
      this.setter(created);
      return;
    }
    applySnapshot(doc, this.next);
  }

  undo(): void {
    const doc = this.getter();
    if (!doc || !this.previous) {
      return;
    }
    applySnapshot(doc, this.previous);
  }

  getMemoryEstimate(): number {
    return this.next.components.length * 128 + this.next.wires.length * 64;
  }
}

export class CommandHistory {
  private undoStack: IEditCommand[] = [];
  private redoStack: IEditCommand[] = [];
  private limit: number = 1000;

  push(cmd: IEditCommand): void {
    cmd.execute();
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(): boolean {
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    cmd.undo();
    this.redoStack.push(cmd);
    return true;
  }

  redo(): boolean {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    cmd.execute();
    this.undoStack.push(cmd);
    return true;
  }

  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }

  /** 切换工程时丢弃跨文档撤销栈，避免 Undo 回到上一文件 */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  estimateMemoryBytes(): number {
    let total = 0;
    for (let i = 0; i < this.undoStack.length; i++) total += this.undoStack[i].getMemoryEstimate();
    return total;
  }
}
