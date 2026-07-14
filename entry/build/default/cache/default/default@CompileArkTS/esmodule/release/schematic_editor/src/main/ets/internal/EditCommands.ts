import { WireStyle, IdUtil } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchematicDocument, ComponentInstance, Point2D, Wire, Rotation, RouteResult, Net, NetLabel, SchematicMetadata, SubcircuitRef, ProbeMeta, SchematicAnnotation, SimulationConfig } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
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
    constructor(c408: SchematicDocument, d408: string, e408: Point2D, f408: Point2D) {
        this.doc = c408;
        this.compId = d408;
        this.oldPos = { x: e408.x, y: e408.y };
        this.newPos = { x: f408.x, y: f408.y };
    }
    execute(): void {
        const a408 = this.doc.components.find(b408 => b408.id === this.compId);
        if (a408)
            a408.position = { x: this.newPos.x, y: this.newPos.y };
    }
    undo(): void {
        const y407 = this.doc.components.find(z407 => z407.id === this.compId);
        if (y407)
            y407.position = { x: this.oldPos.x, y: this.oldPos.y };
    }
    getMemoryEstimate(): number { return 32; }
}
export class PlaceCommand implements IEditCommand {
    private doc: SchematicDocument;
    private comp: ComponentInstance;
    private placed: boolean = false;
    constructor(w407: SchematicDocument, x407: ComponentInstance) {
        this.doc = w407;
        this.comp = x407;
    }
    execute(): void {
        if (!this.placed) {
            this.doc.components.push(this.comp);
            this.placed = true;
        }
    }
    undo(): void {
        const u407 = this.doc.components.findIndex(v407 => v407.id === this.comp.id);
        if (u407 >= 0)
            this.doc.components.splice(u407, 1);
        this.placed = false;
    }
    getMemoryEstimate(): number { return 256; }
}
export class DeleteCommand implements IEditCommand {
    private doc: SchematicDocument;
    private comp: ComponentInstance;
    private index: number = -1;
    constructor(q407: SchematicDocument, r407: string) {
        this.doc = q407;
        const s407 = q407.components.findIndex(t407 => t407.id === r407);
        this.index = s407;
        this.comp = s407 >= 0 ? q407.components[s407] : {
            id: r407,
            libraryId: '', refDes: '', position: { x: 0, y: 0 },
            rotation: 0, mirrored: false, parameters: new Map()
        };
    }
    execute(): void {
        if (this.index >= 0)
            this.doc.components.splice(this.index, 1);
    }
    undo(): void {
        if (this.index >= 0)
            this.doc.components.splice(this.index, 0, this.comp);
    }
    getMemoryEstimate(): number { return 256; }
}
interface DeletedEntry {
    index: number;
    comp: ComponentInstance;
}
export class BatchDeleteCommand implements IEditCommand {
    private doc: SchematicDocument;
    private entries: DeletedEntry[] = [];
    constructor(i407: SchematicDocument, j407: string[]) {
        this.doc = i407;
        for (let m407 = 0; m407 < j407.length; m407++) {
            const n407 = i407.components.findIndex(p407 => p407.id === j407[m407]);
            if (n407 >= 0) {
                const o407: DeletedEntry = {
                    index: n407,
                    comp: i407.components[n407]
                };
                this.entries.push(o407);
            }
        }
        this.entries.sort((k407: DeletedEntry, l407: DeletedEntry) => l407.index - k407.index);
    }
    execute(): void {
        for (let e407 = 0; e407 < this.entries.length; e407++) {
            const f407 = this.entries[e407];
            const g407 = this.doc.components.findIndex(h407 => h407.id === f407.comp.id);
            if (g407 >= 0)
                this.doc.components.splice(g407, 1);
        }
    }
    undo(): void {
        const z406 = this.entries.slice().sort((c407: DeletedEntry, d407: DeletedEntry) => c407.index - d407.index);
        for (let a407 = 0; a407 < z406.length; a407++) {
            const b407 = z406[a407];
            this.doc.components.splice(b407.index, 0, b407.comp);
        }
    }
    getMemoryEstimate(): number { return this.entries.length * 256; }
}
export class AddWireCommand implements IEditCommand {
    private doc: SchematicDocument;
    private wire: Wire;
    constructor(v406: SchematicDocument, w406: Wire) {
        this.doc = v406;
        const x406: Point2D[] = [];
        for (let y406 = 0; y406 < w406.points.length; y406++) {
            x406.push({ x: w406.points[y406].x, y: w406.points[y406].y });
        }
        this.wire = {
            id: w406.id, netId: w406.netId, points: x406, style: w406.style
        };
    }
    execute(): void {
        this.doc.wires.push(this.wire);
    }
    undo(): void {
        for (let u406 = 0; u406 < this.doc.wires.length; u406++) {
            if (this.doc.wires[u406].id === this.wire.id) {
                this.doc.wires.splice(u406, 1);
                break;
            }
        }
    }
    getMemoryEstimate(): number { return 128; }
}
interface WireBackup {
    index: number;
    wire: Wire;
}
export class ClearWiresCommand implements IEditCommand {
    private doc: SchematicDocument;
    private backups: WireBackup[] = [];
    constructor(m406: SchematicDocument, n406?: string[]) {
        this.doc = m406;
        for (let q406 = 0; q406 < m406.wires.length; q406++) {
            const r406 = m406.wires[q406];
            if (n406 === undefined || n406.includes(r406.netId)) {
                const s406: Point2D[] = [];
                for (let t406 = 0; t406 < r406.points.length; t406++) {
                    s406.push({ x: r406.points[t406].x, y: r406.points[t406].y });
                }
                this.backups.push({
                    index: q406,
                    wire: { id: r406.id, netId: r406.netId, points: s406, style: r406.style }
                });
            }
        }
        this.backups.sort((o406: WireBackup, p406: WireBackup) => p406.index - o406.index);
    }
    execute(): void {
        if (this.backups.length === 0) {
            this.doc.wires = [];
            return;
        }
        const i406 = new Set<string>();
        for (let l406 = 0; l406 < this.backups.length; l406++)
            i406.add(this.backups[l406].wire.id);
        const j406: Wire[] = [];
        for (let k406 = 0; k406 < this.doc.wires.length; k406++) {
            if (!i406.has(this.doc.wires[k406].id))
                j406.push(this.doc.wires[k406]);
        }
        this.doc.wires = j406;
    }
    undo(): void {
        const e406 = this.backups.slice().sort((g406: WireBackup, h406: WireBackup) => g406.index - h406.index);
        for (let f406 = 0; f406 < e406.length; f406++) {
            this.doc.wires.splice(e406[f406].index, 0, e406[f406].wire);
        }
    }
    getMemoryEstimate(): number { return this.backups.length * 128; }
}
export class RotateCommand implements IEditCommand {
    private doc: SchematicDocument;
    private compId: string;
    private oldRot: Rotation;
    private newRot: Rotation;
    constructor(a406: SchematicDocument, b406: string, c406: Rotation, d406: Rotation) {
        this.doc = a406;
        this.compId = b406;
        this.oldRot = c406;
        this.newRot = d406;
    }
    execute(): void {
        for (let z405 = 0; z405 < this.doc.components.length; z405++) {
            if (this.doc.components[z405].id === this.compId) {
                this.doc.components[z405].rotation = this.newRot;
                break;
            }
        }
    }
    undo(): void {
        for (let y405 = 0; y405 < this.doc.components.length; y405++) {
            if (this.doc.components[y405].id === this.compId) {
                this.doc.components[y405].rotation = this.oldRot;
                break;
            }
        }
    }
    getMemoryEstimate(): number { return 16; }
}
export class MirrorCommand implements IEditCommand {
    private doc: SchematicDocument;
    private compId: string;
    private oldMirrored: boolean;
    private newMirrored: boolean;
    constructor(u405: SchematicDocument, v405: string, w405: boolean, x405: boolean) {
        this.doc = u405;
        this.compId = v405;
        this.oldMirrored = w405;
        this.newMirrored = x405;
    }
    execute(): void {
        for (let t405 = 0; t405 < this.doc.components.length; t405++) {
            if (this.doc.components[t405].id === this.compId) {
                this.doc.components[t405].mirrored = this.newMirrored;
                break;
            }
        }
    }
    undo(): void {
        for (let s405 = 0; s405 < this.doc.components.length; s405++) {
            if (this.doc.components[s405].id === this.compId) {
                this.doc.components[s405].mirrored = this.oldMirrored;
                break;
            }
        }
    }
    getMemoryEstimate(): number { return 8; }
}
function cloneWire(p405: Wire): Wire {
    const q405: Point2D[] = [];
    for (let r405 = 0; r405 < p405.points.length; r405++) {
        q405.push({ x: p405.points[r405].x, y: p405.points[r405].y });
    }
    return { id: p405.id, netId: p405.netId, points: q405, style: p405.style };
}
function cloneWireList(m405: Wire[]): Wire[] {
    const n405: Wire[] = [];
    for (let o405 = 0; o405 < m405.length; o405++) {
        n405.push(cloneWire(m405[o405]));
    }
    return n405;
}
export class SetDeviceParamCommand implements IEditCommand {
    private doc: SchematicDocument;
    private compId: string;
    private key: string;
    private oldValue: string | undefined;
    private newValue: string;
    private hadKey: boolean = false;
    constructor(h405: SchematicDocument, i405: string, j405: string, k405: string) {
        this.doc = h405;
        this.compId = i405;
        this.key = j405;
        this.newValue = k405;
        for (let l405 = 0; l405 < h405.components.length; l405++) {
            if (h405.components[l405].id === i405) {
                this.hadKey = h405.components[l405].parameters.has(j405);
                this.oldValue = h405.components[l405].parameters.get(j405);
                break;
            }
        }
    }
    execute(): void {
        for (let g405 = 0; g405 < this.doc.components.length; g405++) {
            if (this.doc.components[g405].id === this.compId) {
                this.doc.components[g405].parameters.set(this.key, this.newValue);
                break;
            }
        }
    }
    undo(): void {
        for (let f405 = 0; f405 < this.doc.components.length; f405++) {
            if (this.doc.components[f405].id === this.compId) {
                if (this.hadKey && this.oldValue !== undefined) {
                    this.doc.components[f405].parameters.set(this.key, this.oldValue);
                }
                else {
                    this.doc.components[f405].parameters.delete(this.key);
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
    constructor(x404: SchematicDocument, y404: RouteResult, z404: boolean) {
        this.doc = x404;
        this.previousWires = cloneWireList(x404.wires);
        const a405: Wire[] = z404 ? cloneWireList(x404.wires) : [];
        for (let b405 = 0; b405 < y404.routeLines.length; b405++) {
            const c405 = y404.routeLines[b405];
            const d405: Point2D[] = [];
            for (let e405 = 0; e405 < c405.points.length; e405++) {
                d405.push({ x: c405.points[e405].x, y: c405.points[e405].y });
            }
            a405.push({
                id: IdUtil.generate('wire'),
                netId: c405.netUuid,
                points: d405,
                style: WireStyle.ORTHOGONAL
            });
        }
        this.resultWires = a405;
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
    constructor(u404: SchematicDocument, v404: BatchMoveEntry[]) {
        this.doc = u404;
        this.moves = [];
        for (let w404 = 0; w404 < v404.length; w404++) {
            this.moves.push({
                compId: v404[w404].compId,
                oldPos: { x: v404[w404].oldPos.x, y: v404[w404].oldPos.y },
                newPos: { x: v404[w404].newPos.x, y: v404[w404].newPos.y }
            });
        }
    }
    execute(): void {
        for (let r404 = 0; r404 < this.moves.length; r404++) {
            const s404 = this.moves[r404];
            for (let t404 = 0; t404 < this.doc.components.length; t404++) {
                if (this.doc.components[t404].id === s404.compId) {
                    this.doc.components[t404].position = { x: s404.newPos.x, y: s404.newPos.y };
                    break;
                }
            }
        }
    }
    undo(): void {
        for (let o404 = 0; o404 < this.moves.length; o404++) {
            const p404 = this.moves[o404];
            for (let q404 = 0; q404 < this.doc.components.length; q404++) {
                if (this.doc.components[q404].id === p404.compId) {
                    this.doc.components[q404].position = { x: p404.oldPos.x, y: p404.oldPos.y };
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
    constructor(i404: SchematicDocument, j404: string[], k404: string, l404: string) {
        this.doc = i404;
        this.backups = [];
        for (let m404 = 0; m404 < j404.length; m404++) {
            for (let n404 = 0; n404 < i404.components.length; n404++) {
                if (i404.components[n404].id === j404[m404]) {
                    this.backups.push({
                        compId: j404[m404],
                        key: k404,
                        oldValue: i404.components[n404].parameters.get(k404),
                        hadKey: i404.components[n404].parameters.has(k404),
                        newValue: l404
                    });
                    break;
                }
            }
        }
    }
    execute(): void {
        for (let f404 = 0; f404 < this.backups.length; f404++) {
            const g404 = this.backups[f404];
            for (let h404 = 0; h404 < this.doc.components.length; h404++) {
                if (this.doc.components[h404].id === g404.compId) {
                    this.doc.components[h404].parameters.set(g404.key, g404.newValue);
                    break;
                }
            }
        }
    }
    undo(): void {
        for (let c404 = 0; c404 < this.backups.length; c404++) {
            const d404 = this.backups[c404];
            for (let e404 = 0; e404 < this.doc.components.length; e404++) {
                if (this.doc.components[e404].id === d404.compId) {
                    if (d404.hadKey && d404.oldValue !== undefined) {
                        this.doc.components[e404].parameters.set(d404.key, d404.oldValue);
                    }
                    else {
                        this.doc.components[e404].parameters.delete(d404.key);
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
function cloneComponent(v403: ComponentInstance): ComponentInstance {
    const w403 = new Map<string, string>();
    v403.parameters.forEach((a404: string, b404: string) => w403.set(b404, a404));
    const x403 = v403.pinIds ?? [];
    const y403: string[] = [];
    for (let z403 = 0; z403 < x403.length; z403++) {
        y403.push(x403[z403]);
    }
    return {
        id: v403.id,
        libraryId: v403.libraryId,
        refDes: v403.refDes,
        name: v403.name,
        position: { x: v403.position.x, y: v403.position.y },
        rotation: v403.rotation,
        mirrored: v403.mirrored,
        x: v403.x,
        y: v403.y,
        parameters: w403,
        pinIds: y403,
        attributes: v403.attributes ? new Map(v403.attributes) : undefined,
        pinOverrides: v403.pinOverrides ? new Map(v403.pinOverrides) : undefined,
        subcircuitId: v403.subcircuitId
    };
}
function snapshotDocument(e403: SchematicDocument): DocSnapshot {
    const f403: ComponentInstance[] = [];
    for (let u403 = 0; u403 < e403.components.length; u403++) {
        f403.push(cloneComponent(e403.components[u403]));
    }
    const g403: Net[] = [];
    for (let s403 = 0; s403 < e403.nets.length; s403++) {
        const t403 = e403.nets[s403];
        g403.push({ id: t403.id, name: t403.name, pinIds: t403.pinIds.slice(), type: t403.type });
    }
    const h403: Wire[] = [];
    for (let o403 = 0; o403 < e403.wires.length; o403++) {
        const p403 = e403.wires[o403];
        const q403: Point2D[] = [];
        for (let r403 = 0; r403 < p403.points.length; r403++) {
            q403.push({ x: p403.points[r403].x, y: p403.points[r403].y });
        }
        h403.push({
            id: p403.id, netId: p403.netId, points: q403, style: p403.style
        });
    }
    const i403: NetLabel[] = [];
    for (let m403 = 0; m403 < e403.netLabels.length; m403++) {
        const n403 = e403.netLabels[m403];
        i403.push({
            id: n403.id, netId: n403.netId, text: n403.text,
            position: { x: n403.position.x, y: n403.position.y }, global: n403.global
        });
    }
    const j403: SubcircuitRef[] = [];
    for (let k403 = 0; k403 < e403.subcircuits.length; k403++) {
        const l403 = e403.subcircuits[k403];
        j403.push({
            id: l403.id, name: l403.name, documentId: l403.documentId,
            position: { x: l403.position.x, y: l403.position.y },
            ports: l403.ports.slice()
        });
    }
    return {
        id: e403.id,
        name: e403.name,
        version: e403.version,
        metadata: {
            author: e403.metadata.author,
            createdAt: e403.metadata.createdAt,
            modifiedAt: e403.metadata.modifiedAt,
            description: e403.metadata.description,
            gridSize: e403.metadata.gridSize,
            units: e403.metadata.units,
            undoLimit: e403.metadata.undoLimit
        },
        components: f403,
        nets: g403,
        wires: h403,
        netLabels: i403,
        subcircuits: j403,
        annotations: e403.annotations ?? [],
        probes: e403.probes ?? [],
        simulationConfig: e403.simulationConfig
    };
}
function applySnapshot(c403: SchematicDocument, d403: DocSnapshot): void {
    c403.id = d403.id;
    c403.name = d403.name;
    c403.version = d403.version;
    c403.metadata = {
        author: d403.metadata.author,
        createdAt: d403.metadata.createdAt,
        modifiedAt: d403.metadata.modifiedAt,
        description: d403.metadata.description,
        gridSize: d403.metadata.gridSize,
        units: d403.metadata.units,
        undoLimit: d403.metadata.undoLimit
    };
    c403.components = d403.components;
    c403.nets = d403.nets;
    c403.wires = d403.wires;
    c403.netLabels = d403.netLabels;
    c403.subcircuits = d403.subcircuits;
    c403.annotations = d403.annotations;
    c403.probes = d403.probes;
    c403.simulationConfig = d403.simulationConfig;
}
export class LoadDocumentCommand implements IEditCommand {
    private getter: () => SchematicDocument | null;
    private setter: (doc: SchematicDocument | null) => void;
    private previous: DocSnapshot | null;
    private next: DocSnapshot;
    constructor(y402: () => SchematicDocument | null, z402: (doc: SchematicDocument | null) => void, a403: SchematicDocument) {
        this.getter = y402;
        this.setter = z402;
        const b403 = y402();
        this.previous = b403 !== null ? snapshotDocument(b403) : null;
        this.next = snapshotDocument(a403);
    }
    execute(): void {
        const w402 = this.getter();
        if (!w402) {
            const x402: SchematicDocument = {
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
            this.setter(x402);
            return;
        }
        applySnapshot(w402, this.next);
    }
    undo(): void {
        const v402 = this.getter();
        if (!v402 || !this.previous) {
            return;
        }
        applySnapshot(v402, this.previous);
    }
    getMemoryEstimate(): number {
        return this.next.components.length * 128 + this.next.wires.length * 64;
    }
}
export class CommandHistory {
    private undoStack: IEditCommand[] = [];
    private redoStack: IEditCommand[] = [];
    private limit: number = 1000;
    push(u402: IEditCommand): void {
        u402.execute();
        this.undoStack.push(u402);
        if (this.undoStack.length > this.limit)
            this.undoStack.shift();
        this.redoStack = [];
    }
    undo(): boolean {
        const t402 = this.undoStack.pop();
        if (!t402)
            return false;
        t402.undo();
        this.redoStack.push(t402);
        return true;
    }
    redo(): boolean {
        const s402 = this.redoStack.pop();
        if (!s402)
            return false;
        s402.execute();
        this.undoStack.push(s402);
        return true;
    }
    canUndo(): boolean { return this.undoStack.length > 0; }
    canRedo(): boolean { return this.redoStack.length > 0; }
    estimateMemoryBytes(): number {
        let q402 = 0;
        for (let r402 = 0; r402 < this.undoStack.length; r402++)
            q402 += this.undoStack[r402].getMemoryEstimate();
        return q402;
    }
}
