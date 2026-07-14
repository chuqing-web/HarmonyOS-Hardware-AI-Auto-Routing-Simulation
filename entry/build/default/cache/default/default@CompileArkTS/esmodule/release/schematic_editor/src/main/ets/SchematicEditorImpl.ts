import type { ISchematicEditor, BatchDeviceItem, AlignType, DistributeType, SchematicAnnotationPatch, ComponentParamsUpdate } from './api/ISchematicEditor';
import { EditorInternals } from "@bundle:com.elecdraw.aischsim/entry@schematic_editor/ets/internal/EditorInternals";
import { createDefaultLayers } from "@bundle:com.elecdraw.aischsim/entry@schematic_editor/ets/model/SchematicLayers";
import type { SchematicLayer, SchematicLayerId } from "@bundle:com.elecdraw.aischsim/entry@schematic_editor/ets/model/SchematicLayers";
import { CommandHistory, MoveCommand, PlaceCommand, BatchDeleteCommand, AddWireCommand, ClearWiresCommand, RotateCommand, MirrorCommand, SetDeviceParamCommand, ApplyRouteCommand, BatchMoveCommand, BatchSetDeviceParamCommand, LoadDocumentCommand } from "@bundle:com.elecdraw.aischsim/entry@schematic_editor/ets/internal/EditCommands";
import type { BatchMoveEntry } from "@bundle:com.elecdraw.aischsim/entry@schematic_editor/ets/internal/EditCommands";
import { WireStyle, NetType, EventBus, ModuleEvent, IdUtil, DeepErcEngine, ErrCode, Logger, Validate, ResultHelper, TopologyAdapter, TopologyPatchApplier, CallbackRegistry, FeatureGate, ErcSeverity, ErcRuleType, PinType, calcSymbolBounds, pointInSymbolBounds, rebuildAllNetPinConnectivity } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchematicDocument, ComponentInstance, Net, NetLabel, Point2D, Pin, Rotation, ErcViolation, Rect2D, ViewportState, BusWidth, Port, ApiResult, SchTopology, DeviceInst, NetInfo, RouteResult, ErcError, ProbeInfo, BusInfo, SubCircuitBlock, SchematicAnnotation, SchematicAnnotationStatus, ProbeMeta, Wire, SchematicMetadata, SubcircuitRef, SimulationConfig, SymbolBounds, PinGeometryResolver, PinGeometry } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
type ComponentBoundsResolver = (libraryId: string) => SymbolBounds | null;
type PinResolver = (libraryId: string) => Pin[] | null;
type DefaultParamsResolver = (libraryId: string) => Map<string, string> | null;
interface WirePathScore {
    score: number;
    intersectsBody: boolean;
    pinHits: number;
}
interface PinAtPoint {
    comp: ComponentInstance;
    pin: Pin;
    pinWorld: Point2D;
}
export class SchematicEditorImpl implements ISchematicEditor {
    private document: SchematicDocument | null = null;
    private topology: SchTopology | null = null;
    private viewport: ViewportState = SchematicEditorImpl.createDefaultViewport();
    private undoLimit: number = 1000;
    private layers: SchematicLayer[] = createDefaultLayers();
    private commandHistory: CommandHistory = new CommandHistory();
    private lockedComponentIds: Set<string> = new Set();
    private selectedIds: string[] = [];
    private selectedNetIds: string[] = [];
    private refDesCounters: Map<string, number> = new Map();
    private simBusy: boolean = false;
    private probes: ProbeInfo[] = [];
    private buses: BusInfo[] = [];
    private annotations: SchematicAnnotation[] = [];
    private readOnlyMode: boolean = false;
    private boundsResolver: ComponentBoundsResolver | null = null;
    private pinResolver: PinResolver | null = null;
    private defaultParamsResolver: DefaultParamsResolver | null = null;
    private canvasViewWidth: number = 0;
    private canvasViewHeight: number = 0;
    private static readonly HIT_PAD: number = 14;
    private static readonly WIRE_HIT_THRESHOLD: number = 10;
    isCanvasViewReady(): boolean {
        return this.canvasViewWidth > 0 && this.canvasViewHeight > 0;
    }
    setCanvasViewSize(z446: number, a447: number): void {
        this.canvasViewWidth = Math.max(0, z446);
        this.canvasViewHeight = Math.max(0, a447);
    }
    getComponentHitRect(x446: ComponentInstance): Rect2D {
        const y446 = this.expandLocalBounds(this.resolveBounds(x446.libraryId), SchematicEditorImpl.HIT_PAD);
        return this.localBoundsToWorldAabb(x446, y446);
    }
    isComponentSelected(w446: string): boolean {
        return this.selectedIds.includes(w446);
    }
    getSelectedWireNetIds(): string[] {
        return this.selectedNetIds.slice();
    }
    setComponentBoundsResolver(v446: ComponentBoundsResolver): void {
        this.boundsResolver = v446;
    }
    setPinResolver(u446: PinResolver): void {
        this.pinResolver = u446;
    }
    setDefaultParamsResolver(t446: DefaultParamsResolver): void {
        this.defaultParamsResolver = t446;
    }
    private static createDefaultViewport(): ViewportState {
        const r446: Point2D = { x: 0, y: 0 };
        const s446: ViewportState = {
            zoom: 1.0,
            panOffset: r446,
            gridVisible: true,
            gridSize: 10,
            snapToGrid: true
        };
        return s446;
    }
    private static copyPoint2D(q446: Point2D): Point2D {
        return { x: q446.x, y: q446.y };
    }
    private static copyProbeList(n446: ProbeInfo[]): ProbeInfo[] {
        const o446: ProbeInfo[] = [];
        for (let p446 = 0; p446 < n446.length; p446++) {
            o446.push(n446[p446]);
        }
        return o446;
    }
    private static copyBusList(k446: BusInfo[]): BusInfo[] {
        const l446: BusInfo[] = [];
        for (let m446 = 0; m446 < k446.length; m446++) {
            l446.push(k446[m446]);
        }
        return l446;
    }
    private static copyAnnotationList(h446: SchematicAnnotation[]): SchematicAnnotation[] {
        const i446: SchematicAnnotation[] = [];
        for (let j446 = 0; j446 < h446.length; j446++) {
            i446.push(h446[j446]);
        }
        return i446;
    }
    private static copyStringArray(e446: string[]): string[] {
        const f446: string[] = [];
        for (let g446 = 0; g446 < e446.length; g446++) {
            f446.push(e446[g446]);
        }
        return f446;
    }
    private static emptyParameters(): Map<string, string> {
        return new Map<string, string>();
    }
    private static copyParameters(a446: Map<string, string>): Map<string, string> {
        const b446 = new Map<string, string>();
        a446.forEach((c446: string, d446: string) => {
            b446.set(d446, c446);
        });
        return b446;
    }
    private static normalizeRotation(y445: number): Rotation {
        const z445: number = y445 % 360;
        if (z445 === 90) {
            return 90;
        }
        if (z445 === 180) {
            return 180;
        }
        if (z445 === 270) {
            return 270;
        }
        return 0;
    }
    private static applyAnnotationPatch(v445: SchematicAnnotation, w445: SchematicAnnotationPatch): SchematicAnnotation {
        const x445: SchematicAnnotation = {
            id: v445.id,
            author: w445.author !== undefined ? w445.author : v445.author,
            text: w445.text !== undefined ? w445.text : v445.text,
            type: w445.type !== undefined ? w445.type : v445.type,
            status: w445.status !== undefined ? w445.status : v445.status,
            x: w445.x !== undefined ? w445.x : v445.x,
            y: w445.y !== undefined ? w445.y : v445.y,
            width: w445.width !== undefined ? w445.width : v445.width,
            height: w445.height !== undefined ? w445.height : v445.height,
            arrowEndX: w445.arrowEndX !== undefined ? w445.arrowEndX : v445.arrowEndX,
            arrowEndY: w445.arrowEndY !== undefined ? w445.arrowEndY : v445.arrowEndY,
            targetUuid: w445.targetUuid !== undefined ? w445.targetUuid : v445.targetUuid,
            targetKind: w445.targetKind !== undefined ? w445.targetKind : v445.targetKind,
            createdAt: w445.createdAt !== undefined ? w445.createdAt : v445.createdAt,
            updatedAt: new Date().toISOString()
        };
        return x445;
    }
    private static mergeAnnotation(s445: SchematicAnnotation, t445: string): SchematicAnnotation {
        const u445: SchematicAnnotation = {
            id: s445.id.length > 0 ? s445.id : IdUtil.generate('annot'),
            author: s445.author,
            text: s445.text,
            type: s445.type,
            status: s445.status,
            x: s445.x,
            y: s445.y,
            width: s445.width,
            height: s445.height,
            arrowEndX: s445.arrowEndX,
            arrowEndY: s445.arrowEndY,
            targetUuid: s445.targetUuid,
            targetKind: s445.targetKind,
            createdAt: s445.createdAt.length > 0 ? s445.createdAt : t445,
            updatedAt: t445
        };
        return u445;
    }
    setSimBusy(r445: boolean): void {
        this.simBusy = r445;
    }
    isSimBusy(): boolean {
        return this.simBusy;
    }
    setReadOnly(q445: boolean): void {
        this.readOnlyMode = q445;
    }
    isReadOnly(): boolean {
        return this.readOnlyMode;
    }
    private guardEdit(): ApiResult<void> | null {
        if (this.readOnlyMode) {
            return ResultHelper.fail(ErrCode.ERR_PROJECT_LOCKED, '工程处于只读模式');
        }
        return this.guardSimBusy();
    }
    private guardSimBusy(): ApiResult<void> | null {
        if (this.simBusy) {
            return ResultHelper.fail(ErrCode.ERR_SIM_BUSY, '仿真运行中，无法修改原理图');
        }
        return null;
    }
    getFullTopology(m445: string = ''): SchTopology {
        this.syncTopologyFromDoc();
        if (!m445) {
            return this.topology!;
        }
        const n445: SubCircuitBlock[] = this.topology!.subCircuitList;
        let o445: SubCircuitBlock | undefined = undefined;
        for (let p445 = 0; p445 < n445.length; p445++) {
            if (n445[p445].subUuid === m445) {
                o445 = n445[p445];
                break;
            }
        }
        if (o445 !== undefined && o445.innerTopo !== null) {
            return o445.innerTopo;
        }
        return this.topology!;
    }
    loadTopology(l445: SchTopology): ApiResult<void> {
        this.document = TopologyAdapter.fromTopology(l445);
        this.topology = l445;
        this.probes = SchematicEditorImpl.copyProbeList(l445.probeList);
        this.buses = SchematicEditorImpl.copyBusList(l445.busList);
        this.rebuildRefDesCounters();
        this.notifyChange();
        return ResultHelper.ok();
    }
    getSelectedDevices(): DeviceInst[] {
        const h445: SchTopology = this.getFullTopology();
        const i445: DeviceInst[] = [];
        for (let j445 = 0; j445 < h445.deviceList.length; j445++) {
            const k445: DeviceInst = h445.deviceList[j445];
            if (this.selectedIds.includes(k445.instUuid)) {
                i445.push(k445);
            }
        }
        return i445;
    }
    getSelectedNets(): NetInfo[] {
        const d445: SchTopology = this.getFullTopology();
        const e445: NetInfo[] = [];
        for (let f445 = 0; f445 < d445.netList.length; f445++) {
            const g445: NetInfo = d445.netList[f445];
            if (this.selectedNetIds.includes(g445.netUuid)) {
                e445.push(g445);
            }
        }
        return e445;
    }
    runERC(u444?: SchTopology, v444: boolean = true): ErcError[] {
        this.rebuildNetPinConnectivity();
        const w444: SchematicDocument = this.getDocument();
        const x444: ErcViolation[] = DeepErcEngine.runFull(w444, this.pinResolver !== null ? this.pinResolver : undefined);
        const y444: ErcError[] = [];
        for (let z444 = 0; z444 < x444.length; z444++) {
            const a445: ErcViolation = x444[z444];
            let b445: 'error' | 'warning' | 'info' | 'critical' = 'info';
            if (a445.severity === 'error') {
                b445 = 'error';
            }
            else if (a445.severity === 'warning') {
                b445 = 'warning';
            }
            const c445: ErcError = {
                errType: a445.ruleType,
                targetUuid: a445.componentId !== undefined ? a445.componentId : (a445.netId !== undefined ? a445.netId : ''),
                desc: a445.message,
                suggest: a445.fixSuggestion !== undefined ? a445.fixSuggestion : '',
                severity: b445
            };
            y444.push(c445);
        }
        if (this.topology !== null) {
            this.topology.ercErrorList = y444;
        }
        CallbackRegistry.getInstance().emitErc(y444);
        EventBus.getInstance().publish({
            event: ModuleEvent.ERC_COMPLETED,
            source: 'schematic_editor',
            timestamp: Date.now(),
            data: y444
        });
        return y444;
    }
    runPartialERC(q444: string): ErcError[] {
        const r444: ErcError[] = this.runERC();
        const s444: ErcError[] = [];
        for (let t444 = 0; t444 < r444.length; t444++) {
            if (r444[t444].targetUuid === q444) {
                s444.push(r444[t444]);
            }
        }
        return s444;
    }
    autoFixERC(k444: SchTopology, l444: ErcError[]): number {
        let m444 = 0;
        for (let n444 = 0; n444 < l444.length; n444++) {
            const o444: ErcError = l444[n444];
            if (o444.errType === 'missing_crystal' || o444.desc.includes('晶振')) {
                const p444: ApiResult<DeviceInst> = this.addDevice('XTAL_11M', 100, 100, 'Y?');
                if (p444.success) {
                    m444++;
                }
            }
            if (o444.errType === 'power_reversed' || o444.desc.includes('电源')) {
                this.createNetLabel(50, 50, 'VCC');
                m444++;
            }
            if (o444.desc.includes('地网络')) {
                this.createNetLabel(50, 80, 'GND');
                m444++;
            }
            if (o444.desc.includes('去耦') || o444.desc.includes('电容')) {
                this.addDevice('C_100nF', 120, 120, 'C?');
                m444++;
            }
            if (o444.desc.includes('上拉') || o444.desc.includes('电阻')) {
                this.addDevice('R_10k', 140, 140, 'R?');
                m444++;
            }
        }
        if (m444 > 0) {
            this.loadTopology(k444);
        }
        return m444;
    }
    applyRouteResult(e444: RouteResult, f444: boolean = true): ErrCode {
        const g444: ApiResult<void> | null = this.guardSimBusy();
        if (g444 !== null) {
            return g444.errCode!;
        }
        const h444: SchematicDocument = this.getDocument();
        if (this.document !== null) {
            this.commandHistory.push(new ApplyRouteCommand(this.document, e444, f444));
        }
        else {
            if (!f444) {
                h444.wires = [];
            }
            for (let i444 = 0; i444 < e444.routeLines.length; i444++) {
                const j444 = e444.routeLines[i444];
                h444.wires.push({
                    id: IdUtil.generate('wire'),
                    netId: j444.netUuid,
                    points: j444.points,
                    style: WireStyle.ORTHOGONAL
                });
            }
        }
        e444.crossCount = EditorInternals.calcRouteCrossCount(e444);
        e444.totalLineLength = EditorInternals.calcTotalLength(e444);
        this.notifyChange();
        return ErrCode.OK;
    }
    clearSelectedRoute(): void {
        if (this.selectedNetIds.length === 0) {
            return;
        }
        if (this.document !== null) {
            this.commandHistory.push(new ClearWiresCommand(this.document, this.selectedNetIds.slice()));
        }
        else {
            const b444: SchematicDocument = this.getDocument();
            const c444: Wire[] = [];
            for (let d444 = 0; d444 < b444.wires.length; d444++) {
                if (!this.selectedNetIds.includes(b444.wires[d444].netId)) {
                    c444.push(b444.wires[d444]);
                }
            }
            b444.wires = c444;
        }
        this.notifyChange();
    }
    clearAllRoute(): void {
        const a444: ApiResult<void> | null = this.guardSimBusy();
        if (a444 !== null) {
            return;
        }
        if (this.document !== null) {
            this.commandHistory.push(new ClearWiresCommand(this.document));
        }
        else {
            this.getDocument().wires = [];
        }
        this.notifyChange();
    }
    addDevice(m443: string, n443: number, o443: number, p443?: string): ApiResult<DeviceInst> {
        const q443: ApiResult<void> | null = this.guardEdit();
        if (q443 !== null) {
            return ResultHelper.fail<DeviceInst>(q443.errCode !== undefined ? q443.errCode : ErrCode.ERR_SIM_BUSY, q443.error);
        }
        if (Validate.notEmpty(m443, 'libDevId')) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        }
        const r443: SchematicDocument = this.getDocument();
        const s443: ApiResult<void> = FeatureGate.canAddDevice(r443.components.length);
        if (!s443.success) {
            return ResultHelper.fail(s443.errCode !== undefined ? s443.errCode : ErrCode.ERR_FEATURE_LOCKED, s443.error);
        }
        const t443: Point2D = EditorInternals.calcSnapPoint(n443, o443, this.viewport.gridSize);
        const u443: string = this.getRefDesPrefix(m443);
        const v443: number = (this.refDesCounters.get(u443) ?? 0) + 1;
        this.refDesCounters.set(u443, v443);
        const w443: ComponentInstance = {
            id: IdUtil.generate('comp'),
            libraryId: m443,
            refDes: p443 !== undefined ? p443 : `${u443}${v443}`,
            position: t443,
            rotation: 0,
            mirrored: false,
            parameters: SchematicEditorImpl.emptyParameters()
        };
        if (this.defaultParamsResolver !== null) {
            const x443 = this.defaultParamsResolver(m443);
            if (x443 !== null) {
                x443.forEach((y443: string, z443: string) => {
                    w443.parameters.set(z443, y443);
                });
            }
        }
        this.normalizeComponentValue(w443);
        if (this.document !== null) {
            this.commandHistory.push(new PlaceCommand(this.document, w443));
        }
        else {
            this.getDocument().components.push(w443);
        }
        this.notifyChange();
        return ResultHelper.ok(TopologyAdapter.toDeviceInst(w443));
    }
    deleteDevice(k443: string): ApiResult<void> {
        const l443: ApiResult<void> | null = this.guardSimBusy();
        if (l443 !== null) {
            return l443;
        }
        return this.batchDeleteDevice([k443]) > 0 ?
            ResultHelper.ok() :
            ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '器件不存在');
    }
    setDeviceParam(f443: string, g443: string, h443: string): ApiResult<void> {
        const i443: ComponentInstance | undefined = this.findComponent(f443);
        if (i443 === undefined) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        }
        let j443 = h443;
        if (g443 === 'value' && i443 !== undefined) {
            j443 = this.normalizeComponentValueStr(i443.libraryId, h443);
        }
        if (this.document !== null) {
            this.commandHistory.push(new SetDeviceParamCommand(this.document, f443, g443, j443));
        }
        else {
            i443.parameters.set(g443, j443);
        }
        this.notifyChange();
        return ResultHelper.ok();
    }
    rotateDevice(a443: string, b443: number): ApiResult<void> {
        if (this.isComponentLocked(a443)) {
            return ResultHelper.fail(ErrCode.ERR_SIM_BUSY, '器件已锁定');
        }
        const c443: ComponentInstance | undefined = this.findComponent(a443);
        if (c443 === undefined || this.document === null) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        }
        const d443 = c443.rotation;
        const e443 = SchematicEditorImpl.normalizeRotation(b443);
        this.commandHistory.push(new RotateCommand(this.document, a443, d443, e443));
        this.notifyChange();
        return ResultHelper.ok();
    }
    mirrorDevice(w442: string, x442: boolean): ApiResult<void> {
        if (this.isComponentLocked(w442)) {
            return ResultHelper.fail(ErrCode.ERR_SIM_BUSY, '器件已锁定');
        }
        const y442: ComponentInstance | undefined = this.findComponent(w442);
        if (y442 === undefined || this.document === null) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        }
        if (x442) {
            const z442 = y442.mirrored;
            this.commandHistory.push(new MirrorCommand(this.document, w442, z442, !z442));
            this.notifyChange();
        }
        return ResultHelper.ok();
    }
    batchAddDevice(r442: BatchDeviceItem[]): number {
        const s442: ApiResult<void> | null = this.guardSimBusy();
        if (s442 !== null) {
            return 0;
        }
        let t442 = 0;
        for (let u442 = 0; u442 < r442.length; u442++) {
            const v442: BatchDeviceItem = r442[u442];
            if (this.addDevice(v442.libId, v442.x, v442.y, v442.refName).success) {
                t442++;
            }
        }
        return t442;
    }
    batchDeleteDevice(h442: string[]): number {
        const i442: ApiResult<void> | null = this.guardSimBusy();
        if (i442 !== null) {
            return 0;
        }
        const j442: SchematicDocument = this.getDocument();
        const k442: number = j442.components.length;
        if (this.document !== null && h442.length > 0) {
            const p442: string[] = [];
            for (let q442 = 0; q442 < h442.length; q442++) {
                if (!this.isComponentLocked(h442[q442]))
                    p442.push(h442[q442]);
            }
            if (p442.length > 0) {
                this.commandHistory.push(new BatchDeleteCommand(this.document, p442));
            }
        }
        else {
            const n442: ComponentInstance[] = [];
            for (let o442 = 0; o442 < j442.components.length; o442++) {
                if (!h442.includes(j442.components[o442].id)) {
                    n442.push(j442.components[o442]);
                }
            }
            j442.components = n442;
        }
        const l442: string[] = [];
        for (let m442 = 0; m442 < this.selectedIds.length; m442++) {
            if (!h442.includes(this.selectedIds[m442])) {
                l442.push(this.selectedIds[m442]);
            }
        }
        this.selectedIds = l442;
        this.notifyChange();
        return k442 - j442.components.length;
    }
    batchSetParam(z441: string[], a442: string, b442: string): ApiResult<number> {
        const c442: ApiResult<void> | null = this.guardSimBusy();
        if (c442 !== null) {
            return ResultHelper.fail(c442.errCode!);
        }
        const d442: string[] = [];
        for (let g442 = 0; g442 < z441.length; g442++) {
            if (!this.isComponentLocked(z441[g442])) {
                d442.push(z441[g442]);
            }
        }
        if (d442.length === 0) {
            return ResultHelper.ok(0);
        }
        if (this.document !== null) {
            this.commandHistory.push(new BatchSetDeviceParamCommand(this.document, d442, a442, b442));
        }
        else {
            for (let e442 = 0; e442 < d442.length; e442++) {
                const f442 = this.findComponent(d442[e442]);
                if (f442 !== undefined) {
                    f442.parameters.set(a442, b442);
                }
            }
        }
        this.notifyChange();
        return ResultHelper.ok(d442.length);
    }
    batchAlign(d441: string[], e441: AlignType): ApiResult<void> {
        const f441: ComponentInstance[] = this.collectComponents(d441)
            .filter((y441: ComponentInstance) => !this.isComponentLocked(y441.id));
        if (f441.length < 2) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '至少需要 2 个未锁定器件');
        }
        const g441: number[] = [];
        const h441: number[] = [];
        for (let x441 = 0; x441 < f441.length; x441++) {
            g441.push(f441[x441].position.x);
            h441.push(f441[x441].position.y);
        }
        const i441: BatchMoveEntry[] = [];
        switch (e441) {
            case 'left': {
                const v441: number = SchematicEditorImpl.arrayMin(g441);
                for (let w441 = 0; w441 < f441.length; w441++) {
                    i441.push({
                        compId: f441[w441].id,
                        oldPos: { x: f441[w441].position.x, y: f441[w441].position.y },
                        newPos: { x: v441, y: f441[w441].position.y }
                    });
                }
                break;
            }
            case 'right': {
                const t441: number = SchematicEditorImpl.arrayMax(g441);
                for (let u441 = 0; u441 < f441.length; u441++) {
                    i441.push({
                        compId: f441[u441].id,
                        oldPos: { x: f441[u441].position.x, y: f441[u441].position.y },
                        newPos: { x: t441, y: f441[u441].position.y }
                    });
                }
                break;
            }
            case 'top': {
                const r441: number = SchematicEditorImpl.arrayMin(h441);
                for (let s441 = 0; s441 < f441.length; s441++) {
                    i441.push({
                        compId: f441[s441].id,
                        oldPos: { x: f441[s441].position.x, y: f441[s441].position.y },
                        newPos: { x: f441[s441].position.x, y: r441 }
                    });
                }
                break;
            }
            case 'bottom': {
                const p441: number = SchematicEditorImpl.arrayMax(h441);
                for (let q441 = 0; q441 < f441.length; q441++) {
                    i441.push({
                        compId: f441[q441].id,
                        oldPos: { x: f441[q441].position.x, y: f441[q441].position.y },
                        newPos: { x: f441[q441].position.x, y: p441 }
                    });
                }
                break;
            }
            case 'hcenter': {
                const n441: number = SchematicEditorImpl.arrayAverage(h441);
                for (let o441 = 0; o441 < f441.length; o441++) {
                    i441.push({
                        compId: f441[o441].id,
                        oldPos: { x: f441[o441].position.x, y: f441[o441].position.y },
                        newPos: { x: f441[o441].position.x, y: n441 }
                    });
                }
                break;
            }
            case 'vcenter': {
                const l441: number = SchematicEditorImpl.arrayAverage(g441);
                for (let m441 = 0; m441 < f441.length; m441++) {
                    i441.push({
                        compId: f441[m441].id,
                        oldPos: { x: f441[m441].position.x, y: f441[m441].position.y },
                        newPos: { x: l441, y: f441[m441].position.y }
                    });
                }
                break;
            }
        }
        if (this.document !== null && i441.length > 0) {
            this.commandHistory.push(new BatchMoveCommand(this.document, i441));
        }
        else {
            for (let j441 = 0; j441 < i441.length; j441++) {
                const k441 = this.findComponent(i441[j441].compId);
                if (k441 !== undefined) {
                    k441.position = { x: i441[j441].newPos.x, y: i441[j441].newPos.y };
                }
            }
        }
        this.notifyChange();
        return ResultHelper.ok();
    }
    batchDistribute(n440: string[], o440: DistributeType): ApiResult<void> {
        const p440: ComponentInstance[] = this.collectComponents(n440)
            .filter((c441: ComponentInstance) => !this.isComponentLocked(c441.id));
        if (p440.length < 3) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '至少需要 3 个未锁定器件');
        }
        const q440 = p440.slice();
        if (o440 === 'horiz') {
            q440.sort((a441: ComponentInstance, b441: ComponentInstance): number => a441.position.x - b441.position.x);
        }
        else {
            q440.sort((y440: ComponentInstance, z440: ComponentInstance): number => y440.position.y - z440.position.y);
        }
        const r440: BatchMoveEntry[] = [];
        if (o440 === 'horiz') {
            const w440: number = (q440[q440.length - 1].position.x - q440[0].position.x) / (q440.length - 1);
            for (let x440 = 0; x440 < q440.length; x440++) {
                r440.push({
                    compId: q440[x440].id,
                    oldPos: { x: q440[x440].position.x, y: q440[x440].position.y },
                    newPos: { x: q440[0].position.x + w440 * x440, y: q440[x440].position.y }
                });
            }
        }
        else {
            const u440: number = (q440[q440.length - 1].position.y - q440[0].position.y) / (q440.length - 1);
            for (let v440 = 0; v440 < q440.length; v440++) {
                r440.push({
                    compId: q440[v440].id,
                    oldPos: { x: q440[v440].position.x, y: q440[v440].position.y },
                    newPos: { x: q440[v440].position.x, y: q440[0].position.y + u440 * v440 }
                });
            }
        }
        if (this.document !== null && r440.length > 0) {
            this.commandHistory.push(new BatchMoveCommand(this.document, r440));
        }
        else {
            for (let s440 = 0; s440 < r440.length; s440++) {
                const t440 = this.findComponent(r440[s440].compId);
                if (t440 !== undefined) {
                    t440.position = { x: r440[s440].newPos.x, y: r440[s440].newPos.y };
                }
            }
        }
        this.notifyChange();
        return ResultHelper.ok();
    }
    createBus(f440: number, g440: number, h440: number, i440: number, j440: number = 8): ApiResult<string> {
        const k440: string = IdUtil.generate('bus');
        const l440: BusInfo = {
            busUuid: k440,
            name: `BUS${j440}`,
            bitCount: j440,
            x1: f440,
            y1: g440,
            x2: h440,
            y2: i440,
            branchNetUuids: []
        };
        this.buses.push(l440);
        const m440: Net = {
            id: k440,
            name: `BUS${j440}`,
            type: NetType.BUS,
            pinIds: [],
            busWidth: j440 as BusWidth
        };
        this.getDocument().nets.push(m440);
        this.notifyChange();
        return ResultHelper.ok(k440);
    }
    assignBusNet(z439: string, a440: string[]): ApiResult<void> {
        const b440: BusInfo | undefined = this.findBus(z439);
        if (b440 === undefined) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        }
        for (let c440 = 0; c440 < a440.length; c440++) {
            const d440: string = a440[c440];
            const e440: Net = {
                id: IdUtil.generate('net'),
                name: d440,
                type: NetType.SIGNAL,
                pinIds: [],
                branchIndex: c440
            };
            this.getDocument().nets.push(e440);
            b440.branchNetUuids.push(e440.id);
        }
        this.notifyChange();
        return ResultHelper.ok();
    }
    createNetLabel(p439: number, q439: number, r439: string): ApiResult<string> {
        const s439: string = IdUtil.generate('net');
        const t439: SchematicDocument = this.getDocument();
        let u439: Net | undefined = this.findNetByName(t439, r439);
        if (u439 === undefined) {
            let y439: NetType = NetType.SIGNAL;
            if (r439 === 'VCC' || r439 === 'VDD') {
                y439 = NetType.POWER;
            }
            else if (r439 === 'GND') {
                y439 = NetType.GROUND;
            }
            u439 = {
                id: s439,
                name: r439,
                type: y439,
                pinIds: []
            };
            t439.nets.push(u439);
        }
        const v439: string = IdUtil.generate('label');
        const w439: Point2D = { x: p439, y: q439 };
        const x439: NetLabel = {
            id: v439,
            netId: u439.id,
            text: r439,
            position: w439,
            global: r439 === 'GND' || r439 === 'VCC'
        };
        t439.netLabels.push(x439);
        this.notifyChange();
        return ResultHelper.ok(u439.id);
    }
    attachPowerSymbolNet(f439: string): ApiResult<void> {
        const g439 = this.findComponent(f439);
        if (g439 === undefined) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '器件不存在');
        }
        const h439 = g439.libraryId.toUpperCase();
        let i439: string | null = null;
        if (h439 === 'VCC' || h439.endsWith('/VCC')) {
            i439 = 'VCC';
        }
        else if (h439 === 'GND' || h439.endsWith('/GND')) {
            i439 = 'GND';
        }
        if (i439 === null) {
            return ResultHelper.ok();
        }
        const j439 = this.resolvePins(g439.libraryId);
        if (j439 === null || j439.length === 0) {
            return ResultHelper.ok();
        }
        const k439 = j439[0];
        const l439 = this.transformPinOffsetForConnect(k439.position, g439.rotation, g439.mirrored);
        const m439: Point2D = { x: g439.position.x + l439.x, y: g439.position.y + l439.y };
        this.createNetLabel(m439.x, m439.y, i439);
        const n439 = this.getDocument();
        const o439 = this.findNetByName(n439, i439);
        if (o439 !== undefined) {
            this.addPinToNet(o439.id, g439.id, k439.id, k439.name);
        }
        this.notifyChange();
        return ResultHelper.ok();
    }
    createSubPort(w438: string, x438: string, y438: 'in' | 'out' | 'inout' = 'inout'): ApiResult<string> {
        const z438: SubcircuitRef | undefined = this.findSubcircuit(w438);
        if (z438 === undefined) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        }
        const a439: string = IdUtil.generate('port');
        if (z438.ports === undefined) {
            z438.ports = [];
        }
        let b439: 'input' | 'output' | 'bidirectional' = 'bidirectional';
        if (y438 === 'in') {
            b439 = 'input';
        }
        else if (y438 === 'out') {
            b439 = 'output';
        }
        const c439: number = z438.ports.length;
        const d439: Point2D = { x: 0, y: c439 * 20 };
        const e439: Port = {
            id: a439,
            name: x438,
            type: PinType.BIDIRECTIONAL,
            direction: b439,
            position: d439
        };
        z438.ports.push(e439);
        this.notifyChange();
        return ResultHelper.ok(a439);
    }
    addVoltageProbe(q438: string, r438: number, s438: number): ApiResult<string> {
        const t438: string = IdUtil.generate('probe');
        const u438: Net | undefined = this.findNetByName(this.getDocument(), q438);
        const v438: ProbeInfo = {
            probeId: t438,
            probeType: 'voltage',
            netUuid: u438 !== undefined ? u438.id : '',
            devPinUuid: '',
            x: r438,
            y: s438,
            oscChannel: -1
        };
        this.probes.push(v438);
        this.notifyChange();
        return ResultHelper.ok(t438);
    }
    addCurrentProbe(n438: string): ApiResult<string> {
        const o438: string = IdUtil.generate('probe');
        const p438: ProbeInfo = {
            probeId: o438,
            probeType: 'current',
            netUuid: '',
            devPinUuid: n438,
            x: 0,
            y: 0,
            oscChannel: -1
        };
        this.probes.push(p438);
        return ResultHelper.ok(o438);
    }
    deleteProbe(k438: string): void {
        const l438: ProbeInfo[] = [];
        for (let m438 = 0; m438 < this.probes.length; m438++) {
            if (this.probes[m438].probeId !== k438) {
                l438.push(this.probes[m438]);
            }
        }
        this.probes = l438;
    }
    bindProbeToOsc(h438: string, i438: number): ApiResult<void> {
        const j438: ProbeInfo | undefined = this.findProbe(h438);
        if (j438 === undefined) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        }
        j438.oscChannel = i438;
        return ResultHelper.ok();
    }
    getProbes(): ProbeInfo[] {
        return SchematicEditorImpl.copyProbeList(this.probes);
    }
    getViewport(): ViewportState {
        return this.cloneViewportState();
    }
    zoomCanvas(g438: number): void {
        this.viewport.zoom = Math.max(0.1, Math.min(5.0, g438));
        this.publishViewport();
    }
    moveView(e438: number, f438: number): void {
        this.viewport.panOffset.x += e438;
        this.viewport.panOffset.y += f438;
        this.publishViewport();
    }
    fitAllInView(): void {
        const v437: Rect2D = this.getBoundingBox();
        const w437: number = this.canvasViewWidth > 0 ? this.canvasViewWidth : 800;
        const x437: number = this.canvasViewHeight > 0 ? this.canvasViewHeight : 600;
        const y437: number = 48;
        const z437: number = Math.max(100, w437 - y437 * 2);
        const a438: number = Math.max(100, x437 - y437 * 2);
        const b438: number = z437 / Math.max(v437.width, 1);
        const c438: number = a438 / Math.max(v437.height, 1);
        const d438: number = Math.min(b438, c438, 2.0);
        this.viewport.zoom = Math.max(0.15, d438);
        this.viewport.panOffset = {
            x: (w437 - v437.width * d438) / 2 - v437.x * d438,
            y: (x437 - v437.height * d438) / 2 - v437.y * d438
        };
        this.publishViewport();
    }
    setZoom(u437: number): void {
        this.zoomCanvas(u437);
    }
    getZoom(): number {
        return this.viewport.zoom;
    }
    panBy(s437: number, t437: number): void {
        this.moveView(s437, t437);
    }
    undo(): ApiResult<void> {
        if (!this.commandHistory.canUndo()) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '无可撤销操作');
        }
        this.commandHistory.undo();
        this.syncTopologyFromDoc();
        this.rebuildRefDesCounters();
        this.notifyChange();
        return ResultHelper.ok();
    }
    redo(): ApiResult<void> {
        if (!this.commandHistory.canRedo()) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '无可重做操作');
        }
        this.commandHistory.redo();
        this.syncTopologyFromDoc();
        this.rebuildRefDesCounters();
        this.notifyChange();
        return ResultHelper.ok();
    }
    canUndo(): boolean {
        return this.commandHistory.canUndo();
    }
    canRedo(): boolean {
        return this.commandHistory.canRedo();
    }
    setUndoCacheCount(r437: number): void {
        this.undoLimit = Math.max(10, Math.min(10000, r437));
    }
    clearUndoStack(): void {
    }
    addAnnotation(n437: SchematicAnnotation): ApiResult<SchematicAnnotation> {
        const o437: ApiResult<void> = FeatureGate.canUseTeamCollaboration();
        if (!o437.success) {
            return ResultHelper.fail(o437.errCode !== undefined ? o437.errCode : ErrCode.ERR_FEATURE_LOCKED, o437.error);
        }
        const p437: string = new Date().toISOString();
        const q437: SchematicAnnotation = SchematicEditorImpl.mergeAnnotation(n437, p437);
        this.annotations.push(q437);
        this.publishAnnotationChange();
        return ResultHelper.ok(q437);
    }
    updateAnnotation(i437: string, j437: SchematicAnnotationPatch): ApiResult<void> {
        const k437: ApiResult<void> = FeatureGate.canUseTeamCollaboration();
        if (!k437.success) {
            return ResultHelper.fail(k437.errCode !== undefined ? k437.errCode : ErrCode.ERR_FEATURE_LOCKED, k437.error);
        }
        const l437: number = this.findAnnotationIndex(i437);
        if (l437 < 0) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '批注不存在');
        }
        const m437: SchematicAnnotation = this.annotations[l437];
        this.annotations[l437] = SchematicEditorImpl.applyAnnotationPatch(m437, j437);
        this.publishAnnotationChange();
        return ResultHelper.ok();
    }
    deleteAnnotation(d437: string): ApiResult<void> {
        const e437: ApiResult<void> = FeatureGate.canUseTeamCollaboration();
        if (!e437.success) {
            return ResultHelper.fail(e437.errCode !== undefined ? e437.errCode : ErrCode.ERR_FEATURE_LOCKED, e437.error);
        }
        const f437: number = this.annotations.length;
        const g437: SchematicAnnotation[] = [];
        for (let h437 = 0; h437 < this.annotations.length; h437++) {
            if (this.annotations[h437].id !== d437) {
                g437.push(this.annotations[h437]);
            }
        }
        this.annotations = g437;
        if (this.annotations.length === f437) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '批注不存在');
        }
        this.publishAnnotationChange();
        return ResultHelper.ok();
    }
    listAnnotations(a437?: SchematicAnnotationStatus): SchematicAnnotation[] {
        if (a437 === undefined) {
            return SchematicEditorImpl.copyAnnotationList(this.annotations);
        }
        const b437: SchematicAnnotation[] = [];
        for (let c437 = 0; c437 < this.annotations.length; c437++) {
            if (this.annotations[c437].status === a437) {
                b437.push(this.annotations[c437]);
            }
        }
        return b437;
    }
    focusAnnotationTarget(l436: string): ApiResult<Point2D> {
        const m436: SchematicAnnotation | undefined = this.findAnnotation(l436);
        if (m436 === undefined) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '批注不存在');
        }
        if (m436.targetKind === 'device' && m436.targetUuid.length > 0) {
            const w436: ComponentInstance | undefined = this.findComponent(m436.targetUuid);
            if (w436 !== undefined) {
                const x436: number = w436.position.x;
                const y436: number = w436.position.y;
                const z436: Point2D = { x: -x436 + 200, y: -y436 + 200 };
                this.viewport.panOffset = z436;
                this.publishViewport();
                return ResultHelper.ok(SchematicEditorImpl.copyPoint2D(w436.position));
            }
        }
        if (m436.targetKind === 'net' && m436.targetUuid.length > 0) {
            const r436: Net | undefined = this.findNetById(this.getDocument(), m436.targetUuid);
            if (r436 !== undefined) {
                const s436: NetLabel | undefined = this.findNetLabelByNetId(r436.id);
                if (s436 !== undefined) {
                    const t436: number = s436.position.x;
                    const u436: number = s436.position.y;
                    const v436: Point2D = { x: -t436 + 200, y: -u436 + 200 };
                    this.viewport.panOffset = v436;
                    this.publishViewport();
                    return ResultHelper.ok(SchematicEditorImpl.copyPoint2D(s436.position));
                }
            }
        }
        const n436: number = m436.x;
        const o436: number = m436.y;
        const p436: Point2D = { x: -n436 + 200, y: -o436 + 200 };
        this.viewport.panOffset = p436;
        this.publishViewport();
        const q436: Point2D = { x: n436, y: o436 };
        return ResultHelper.ok(q436);
    }
    loadAnnotations(k436: SchematicAnnotation[]): void {
        this.annotations = SchematicEditorImpl.copyAnnotationList(k436);
        this.publishAnnotationChange();
    }
    getAnnotations(): SchematicAnnotation[] {
        return SchematicEditorImpl.copyAnnotationList(this.annotations);
    }
    getDocument(): SchematicDocument {
        if (this.document === null) {
            return this.createNewDoc('Untitled');
        }
        return this.document;
    }
    loadDocument(h436: SchematicDocument): ApiResult<void> {
        const i436 = this.normalizeDocument(h436);
        if (this.document !== null) {
            this.commandHistory.push(new LoadDocumentCommand((): SchematicDocument | null => this.document, (j436: SchematicDocument | null): void => { this.document = j436; }, i436));
        }
        else {
            this.document = i436;
        }
        this.rebuildRefDesCounters();
        this.rebuildNetPinConnectivity();
        this.syncTopologyFromDoc();
        this.notifyChange();
        return ResultHelper.ok();
    }
    loadDocumentWithCollaboration(e436: SchematicDocument, f436: SchematicAnnotation[]): ApiResult<void> {
        const g436: ApiResult<void> = this.loadDocument(e436);
        if (g436.success) {
            this.loadAnnotations(f436);
        }
        return g436;
    }
    createNew(d436: string): SchematicDocument {
        return this.createNewDoc(d436);
    }
    placeComponent(y435: string, z435: Point2D): ApiResult<ComponentInstance> {
        const a436: ApiResult<DeviceInst> = this.addDevice(y435, z435.x, z435.y);
        if (!a436.success || a436.data === undefined) {
            return ResultHelper.fail(a436.errCode, a436.error);
        }
        const b436: ComponentInstance | undefined = this.findComponent(a436.data.instUuid);
        if (b436 === undefined) {
            return ResultHelper.fail(ErrCode.ERR_DEVICE_NOT_EXIST);
        }
        const c436 = y435.toUpperCase();
        if (c436 === 'VCC' || c436 === 'GND' ||
            c436.endsWith('/VCC') || c436.endsWith('/GND')) {
            this.attachPowerSymbolNet(b436.id);
        }
        return ResultHelper.ok(b436);
    }
    updateComponentParams(t435: string, u435: ComponentParamsUpdate): ApiResult<void> {
        for (let v435 = 0; v435 < u435.entries.length; v435++) {
            const w435 = u435.entries[v435];
            const x435: ApiResult<void> = this.setDeviceParam(t435, w435.key, w435.value);
            if (!x435.success) {
                return x435;
            }
        }
        return ResultHelper.ok();
    }
    rotateComponent(r435: string, s435: number): ApiResult<void> {
        return this.rotateDevice(r435, s435);
    }
    deleteComponent(q435: string): ApiResult<void> {
        return this.deleteDevice(q435);
    }
    moveComponent(j435: string, k435: Point2D): ApiResult<void> {
        const l435: ApiResult<void> | null = this.guardEdit();
        if (l435 !== null) {
            return ResultHelper.fail(l435.errCode !== undefined ? l435.errCode : ErrCode.ERR_SIM_BUSY, l435.error);
        }
        const m435: ComponentInstance | undefined = this.findComponent(j435);
        if (m435 === undefined || this.document === null) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        }
        if (this.isComponentLocked(j435)) {
            return ResultHelper.fail(ErrCode.ERR_SIM_BUSY, '器件已锁定');
        }
        const n435: Point2D = { x: m435.position.x, y: m435.position.y };
        const o435: Point2D = EditorInternals.calcSnapPoint(k435.x, k435.y, this.viewport.gridSize);
        const p435 = this.getComponentPinWorldPositions(m435);
        this.commandHistory.push(new MoveCommand(this.document, j435, n435, o435));
        this.updateWiresForComponentMove(j435, p435);
        this.notifyChange();
        return ResultHelper.ok();
    }
    private getComponentPinWorldPositions(d435: ComponentInstance): Map<string, Point2D> {
        const e435 = new Map<string, Point2D>();
        const f435 = this.resolvePins(d435.libraryId);
        if (f435 === null) {
            return e435;
        }
        for (let g435 = 0; g435 < f435.length; g435++) {
            const h435 = f435[g435];
            const i435 = this.transformPinOffsetForConnect(h435.position, d435.rotation, d435.mirrored);
            e435.set(h435.id, { x: d435.position.x + i435.x, y: d435.position.y + i435.y });
        }
        return e435;
    }
    private updateWiresForComponentMove(j434: string, k434: Map<string, Point2D>): void {
        const l434 = this.findComponent(j434);
        if (l434 === undefined) {
            return;
        }
        const m434 = this.getComponentPinWorldPositions(l434);
        const n434 = this.getDocument();
        const o434 = 3;
        let p434 = 0;
        for (let q434 = 0; q434 < n434.wires.length; q434++) {
            const r434 = n434.wires[q434];
            if (r434.points.length === 0) {
                continue;
            }
            let s434 = false;
            let t434: Point2D[] = [];
            for (let v434 = 0; v434 < r434.points.length; v434++) {
                const w434 = r434.points[v434];
                let x434: Point2D | null = null;
                k434.forEach((y434: Point2D, z434: string) => {
                    if (x434 !== null) {
                        return;
                    }
                    const a435 = w434.x - y434.x;
                    const b435 = w434.y - y434.y;
                    if (Math.abs(a435) <= o434 && Math.abs(b435) <= o434) {
                        const c435 = m434.get(z434);
                        if (c435 !== undefined) {
                            x434 = { x: c435.x, y: c435.y };
                        }
                    }
                });
                if (x434 !== null) {
                    t434.push(x434);
                    s434 = true;
                }
                else {
                    t434.push({ x: w434.x, y: w434.y });
                }
            }
            if (s434) {
                const u434 = this.routeOrthogonalWire(t434[0], t434[t434.length - 1]);
                if (u434.length === 3) {
                    t434 = u434;
                }
                else {
                    r434.points = u434;
                    p434++;
                    continue;
                }
                r434.points = t434;
                p434++;
            }
        }
        if (p434 > 0) {
            Logger.info('schematic_editor', `updateWiresForComponentMove: updated ${p434} wires for comp ${j434}`);
        }
    }
    runErc(): ApiResult<ErcViolation[]> {
        const d434: ErcError[] = this.runERC();
        const e434: ErcViolation[] = [];
        for (let f434 = 0; f434 < d434.length; f434++) {
            const g434: ErcError = d434[f434];
            let h434: ErcSeverity = ErcSeverity.WARNING;
            if (g434.severity === 'error' || g434.severity === 'critical') {
                h434 = ErcSeverity.ERROR;
            }
            const i434: ErcViolation = {
                id: IdUtil.generate('erc'),
                severity: h434,
                ruleType: ErcRuleType.FLOATING_NET,
                message: g434.desc,
                fixSuggestion: g434.suggest
            };
            e434.push(i434);
        }
        return ResultHelper.ok(e434);
    }
    exportTopologyJson(): ApiResult<string> {
        return ResultHelper.ok(JSON.stringify(this.getFullTopology(), null, 2));
    }
    getBoundingBox(): Rect2D {
        const p433: SchematicDocument = this.getDocument();
        if (p433.components.length === 0) {
            const c434: Rect2D = { x: 0, y: 0, width: 800, height: 600 };
            return c434;
        }
        let q433: number = Infinity;
        let r433: number = Infinity;
        let s433: number = -Infinity;
        let t433: number = -Infinity;
        for (let z433 = 0; z433 < p433.components.length; z433++) {
            const a434: ComponentInstance = p433.components[z433];
            const b434 = this.resolveBounds(a434.libraryId);
            q433 = Math.min(q433, a434.position.x + b434.minX);
            r433 = Math.min(r433, a434.position.y + b434.minY);
            s433 = Math.max(s433, a434.position.x + b434.maxX);
            t433 = Math.max(t433, a434.position.y + b434.maxY);
        }
        for (let v433 = 0; v433 < p433.wires.length; v433++) {
            const w433 = p433.wires[v433];
            for (let x433 = 0; x433 < w433.points.length; x433++) {
                const y433 = w433.points[x433];
                q433 = Math.min(q433, y433.x);
                r433 = Math.min(r433, y433.y);
                s433 = Math.max(s433, y433.x);
                t433 = Math.max(t433, y433.y);
            }
        }
        const u433: Rect2D = {
            x: q433 - 50,
            y: r433 - 50,
            width: s433 - q433 + 100,
            height: t433 - r433 + 100
        };
        return u433;
    }
    hitTestAt(k433: Point2D): string[] {
        const l433: ComponentInstance[] = this.getDocument().components;
        for (let m433 = l433.length - 1; m433 >= 0; m433--) {
            const n433: ComponentInstance = l433[m433];
            const o433 = this.expandLocalBounds(this.resolveBounds(n433.libraryId), SchematicEditorImpl.HIT_PAD);
            if (this.pointInComponentBounds(k433, n433, o433)) {
                return [n433.id];
            }
        }
        return [];
    }
    hitTestWireAt(b433: Point2D): string | null {
        const c433 = this.getDocument().wires;
        let d433: string | null = null;
        let e433: number = SchematicEditorImpl.WIRE_HIT_THRESHOLD;
        for (let f433 = 0; f433 < c433.length; f433++) {
            const g433 = c433[f433];
            const h433 = g433.points;
            for (let i433 = 0; i433 < h433.length - 1; i433++) {
                const j433 = SchematicEditorImpl.pointSegmentDistance(b433, h433[i433], h433[i433 + 1]);
                if (j433 < e433) {
                    e433 = j433;
                    d433 = g433.netId;
                }
            }
        }
        return d433;
    }
    selectInRect(u432: Rect2D): string[] {
        const v432: string[] = [];
        const w432: ComponentInstance[] = this.getDocument().components;
        for (let x432 = 0; x432 < w432.length; x432++) {
            const y432 = w432[x432];
            const z432 = this.resolveBounds(y432.libraryId);
            const a433: Rect2D = {
                x: y432.position.x + z432.minX,
                y: y432.position.y + z432.minY,
                width: z432.width,
                height: z432.height
            };
            if (SchematicEditorImpl.rectsOverlap(u432, a433)) {
                v432.push(y432.id);
            }
        }
        this.selectedIds = v432;
        this.selectedNetIds = [];
        CallbackRegistry.getInstance().emitSelection(this.getSelectedDevices(), this.getSelectedNets());
        EventBus.getInstance().publish({
            event: ModuleEvent.SELECTION_CHANGED,
            source: 'schematic_editor',
            timestamp: Date.now(),
            data: v432
        });
        return v432;
    }
    selectAll(): string[] {
        const s432: string[] = [];
        for (const t432 of this.getDocument().components) {
            s432.push(t432.id);
        }
        return this.setSelectionAndReturn(s432);
    }
    toggleSelection(n432: string): string[] {
        const o432 = this.selectedIds.indexOf(n432);
        if (o432 >= 0) {
            const q432: string[] = [];
            for (let r432 = 0; r432 < this.selectedIds.length; r432++) {
                if (r432 !== o432)
                    q432.push(this.selectedIds[r432]);
            }
            return this.setSelectionAndReturn(q432);
        }
        const p432 = SchematicEditorImpl.copyStringArray(this.selectedIds);
        p432.push(n432);
        return this.setSelectionAndReturn(p432);
    }
    private setSelectionAndReturn(m432: string[]): string[] {
        this.selectedIds = SchematicEditorImpl.copyStringArray(m432);
        CallbackRegistry.getInstance().emitSelection(this.getSelectedDevices(), this.getSelectedNets());
        return this.selectedIds.slice();
    }
    private static rectsOverlap(k432: Rect2D, l432: Rect2D): boolean {
        return k432.x < l432.x + l432.width && k432.x + k432.width > l432.x &&
            k432.y < l432.y + l432.height && k432.y + k432.height > l432.y;
    }
    selectAt(h432: Point2D): string[] {
        const i432: string[] = this.hitTestAt(h432);
        if (i432.length > 0) {
            this.selectedIds = i432;
            this.selectedNetIds = [];
            CallbackRegistry.getInstance().emitSelection(this.getSelectedDevices(), this.getSelectedNets());
            EventBus.getInstance().publish({
                event: ModuleEvent.SELECTION_CHANGED,
                source: 'schematic_editor',
                timestamp: Date.now(),
                data: i432
            });
            return i432;
        }
        const j432: string | null = this.hitTestWireAt(h432);
        if (j432 !== null && j432.length > 0) {
            this.selectedIds = [];
            this.selectedNetIds = [j432];
            CallbackRegistry.getInstance().emitSelection(this.getSelectedDevices(), this.getSelectedNets());
            EventBus.getInstance().publish({
                event: ModuleEvent.SELECTION_CHANGED,
                source: 'schematic_editor',
                timestamp: Date.now(),
                data: []
            });
            return [];
        }
        this.selectedIds = [];
        this.selectedNetIds = [];
        CallbackRegistry.getInstance().emitSelection(this.getSelectedDevices(), this.getSelectedNets());
        EventBus.getInstance().publish({
            event: ModuleEvent.SELECTION_CHANGED,
            source: 'schematic_editor',
            timestamp: Date.now(),
            data: []
        });
        return [];
    }
    private expandLocalBounds(f432: SymbolBounds, g432: number): SymbolBounds {
        return {
            minX: f432.minX - g432,
            maxX: f432.maxX + g432,
            minY: f432.minY - g432,
            maxY: f432.maxY + g432,
            width: f432.width + g432 * 2,
            height: f432.height + g432 * 2
        };
    }
    private localBoundsToWorldAabb(w431: ComponentInstance, x431: SymbolBounds): Rect2D {
        const y431: Point2D[] = [
            { x: x431.minX, y: x431.minY },
            { x: x431.maxX, y: x431.minY },
            { x: x431.maxX, y: x431.maxY },
            { x: x431.minX, y: x431.maxY }
        ];
        let z431: number = Infinity;
        let a432: number = Infinity;
        let b432: number = -Infinity;
        let c432: number = -Infinity;
        for (let d432 = 0; d432 < y431.length; d432++) {
            const e432 = this.localToWorldPoint(w431, y431[d432]);
            z431 = Math.min(z431, e432.x);
            a432 = Math.min(a432, e432.y);
            b432 = Math.max(b432, e432.x);
            c432 = Math.max(c432, e432.y);
        }
        return { x: z431, y: a432, width: b432 - z431, height: c432 - a432 };
    }
    private localToWorldPoint(p431: ComponentInstance, q431: Point2D): Point2D {
        let r431: number = q431.x;
        let s431: number = q431.y;
        if (p431.mirrored) {
            r431 = -r431;
        }
        if (p431.rotation !== 0) {
            const t431: number = (p431.rotation as number) * Math.PI / 180;
            const u431: number = r431 * Math.cos(t431) - s431 * Math.sin(t431);
            const v431: number = r431 * Math.sin(t431) + s431 * Math.cos(t431);
            r431 = u431;
            s431 = v431;
        }
        return { x: p431.position.x + r431, y: p431.position.y + s431 };
    }
    private static pointSegmentDistance(d431: Point2D, e431: Point2D, f431: Point2D): number {
        const g431: number = f431.x - e431.x;
        const h431: number = f431.y - e431.y;
        if (g431 === 0 && h431 === 0) {
            const n431: number = d431.x - e431.x;
            const o431: number = d431.y - e431.y;
            return Math.sqrt(n431 * n431 + o431 * o431);
        }
        const i431: number = Math.max(0, Math.min(1, ((d431.x - e431.x) * g431 + (d431.y - e431.y) * h431) / (g431 * g431 + h431 * h431)));
        const j431: number = e431.x + i431 * g431;
        const k431: number = e431.y + i431 * h431;
        const l431: number = d431.x - j431;
        const m431: number = d431.y - k431;
        return Math.sqrt(l431 * l431 + m431 * m431);
    }
    private pointInComponentBounds(t430: Point2D, u430: ComponentInstance, v430: SymbolBounds): boolean {
        let w430: number = t430.x - u430.position.x;
        let x430: number = t430.y - u430.position.y;
        if (u430.rotation !== 0) {
            const a431: number = (0 - (u430.rotation as number)) * Math.PI / 180;
            const b431: number = w430 * Math.cos(a431) - x430 * Math.sin(a431);
            const c431: number = w430 * Math.sin(a431) + x430 * Math.cos(a431);
            w430 = b431;
            x430 = c431;
        }
        if (u430.mirrored) {
            w430 = -w430;
        }
        const y430: Point2D = { x: w430, y: x430 };
        const z430: Point2D = { x: 0, y: 0 };
        return pointInSymbolBounds(y430, z430, v430);
    }
    private static readonly MIN_HIT_W: number = 60;
    private static readonly MIN_HIT_H: number = 40;
    private resolveBounds(n430: string): SymbolBounds {
        if (this.boundsResolver !== null) {
            const o430 = this.boundsResolver(n430);
            if (o430 !== null) {
                if (o430.width < SchematicEditorImpl.MIN_HIT_W ||
                    o430.height < SchematicEditorImpl.MIN_HIT_H) {
                    const p430 = (o430.minX + o430.maxX) / 2;
                    const q430 = (o430.minY + o430.maxY) / 2;
                    const r430 = Math.max(o430.width, SchematicEditorImpl.MIN_HIT_W);
                    const s430 = Math.max(o430.height, SchematicEditorImpl.MIN_HIT_H);
                    return {
                        minX: p430 - r430 / 2, maxX: p430 + r430 / 2,
                        minY: q430 - s430 / 2, maxY: q430 + s430 / 2,
                        width: r430, height: s430
                    };
                }
                return o430;
            }
        }
        return calcSymbolBounds([], 8);
    }
    setSelection(m430: string[]): void {
        this.selectedIds = SchematicEditorImpl.copyStringArray(m430);
        CallbackRegistry.getInstance().emitSelection(this.getSelectedDevices(), this.getSelectedNets());
    }
    getLayers(): SchematicLayer[] {
        return this.layers.slice();
    }
    setLayerVisible(j430: SchematicLayerId, k430: boolean): void {
        for (let l430 = 0; l430 < this.layers.length; l430++) {
            if (this.layers[l430].layerId === j430) {
                this.layers[l430].visible = k430;
            }
        }
    }
    setLayerLocked(g430: SchematicLayerId, h430: boolean): void {
        for (let i430 = 0; i430 < this.layers.length; i430++) {
            if (this.layers[i430].layerId === g430) {
                this.layers[i430].locked = h430;
            }
        }
    }
    isLayerVisible(e430: SchematicLayerId): boolean {
        for (let f430 = 0; f430 < this.layers.length; f430++) {
            if (this.layers[f430].layerId === e430)
                return this.layers[f430].visible;
        }
        return true;
    }
    isLayerLocked(c430: SchematicLayerId): boolean {
        for (let d430 = 0; d430 < this.layers.length; d430++) {
            if (this.layers[d430].layerId === c430)
                return this.layers[d430].locked;
        }
        return false;
    }
    addWireSegment(r429: Point2D, s429: Point2D, t429?: string): ApiResult<string> {
        const u429: ApiResult<void> | null = this.guardEdit();
        if (u429 !== null) {
            return ResultHelper.fail(u429.errCode !== undefined ? u429.errCode : ErrCode.ERR_SIM_BUSY, u429.error);
        }
        const v429 = this.viewport.gridSize;
        let w429 = EditorInternals.calcSnapPoint(r429.x, r429.y, v429);
        let x429 = EditorInternals.calcSnapPoint(s429.x, s429.y, v429);
        w429 = this.snapToNearestPin(w429, v429);
        x429 = this.snapToNearestPin(x429, v429);
        Logger.info('schematic_editor', `addWireSegment from=(${w429.x},${w429.y}) to=(${x429.x},${x429.y})`);
        if (w429.x === x429.x && w429.y === x429.y) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '导线起点与终点重合，请选择不同位置');
        }
        const y429 = this.routeOrthogonalWire(w429, x429);
        const z429 = IdUtil.generate('wire');
        const a430 = t429 !== undefined && t429.length > 0 ? t429 : IdUtil.generate('net');
        const b430: Wire = {
            id: z429,
            netId: a430,
            points: y429,
            style: WireStyle.ORTHOGONAL
        };
        if (this.document !== null) {
            this.commandHistory.push(new AddWireCommand(this.document, b430));
        }
        else {
            this.getDocument().wires.push(b430);
        }
        this.ensureNetExists(a430);
        this.connectWireToPins(w429, x429, a430);
        this.rebuildNetPinConnectivity();
        this.notifyChange();
        return ResultHelper.ok(z429);
    }
    addWireWithPoints(c429: Point2D[], d429?: string): ApiResult<string> {
        const e429: ApiResult<void> | null = this.guardEdit();
        if (e429 !== null) {
            return ResultHelper.fail(e429.errCode !== undefined ? e429.errCode : ErrCode.ERR_SIM_BUSY, e429.error);
        }
        if (c429.length < 2) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '需要至少两个点');
        }
        const f429 = this.viewport.gridSize;
        const g429: Point2D[] = [];
        for (let p429 = 0; p429 < c429.length; p429++) {
            const q429 = p429 === 0 || p429 === c429.length - 1;
            if (q429) {
                g429.push({ x: c429[p429].x, y: c429[p429].y });
            }
            else {
                g429.push(EditorInternals.calcSnapPoint(c429[p429].x, c429[p429].y, f429));
            }
        }
        const h429: Point2D[] = [g429[0]];
        for (let m429 = 0; m429 < g429.length - 1; m429++) {
            const n429 = this.routeOrthogonalWire(g429[m429], g429[m429 + 1]);
            for (let o429 = 1; o429 < n429.length; o429++) {
                h429.push(n429[o429]);
            }
        }
        h429[0] = { x: g429[0].x, y: g429[0].y };
        h429[h429.length - 1] = { x: g429[g429.length - 1].x, y: g429[g429.length - 1].y };
        this.ensurePerpendicularApproach(h429);
        const i429 = IdUtil.generate('wire');
        let j429: string;
        if (d429 !== undefined && d429.length > 0) {
            j429 = d429;
        }
        else {
            const l429 = this.inheritNetAtPosition(h429[0]);
            j429 = l429 !== null ? l429 : IdUtil.generate('net');
        }
        const k429: Wire = {
            id: i429,
            netId: j429,
            points: h429,
            style: WireStyle.ORTHOGONAL
        };
        if (this.document !== null) {
            this.commandHistory.push(new AddWireCommand(this.document, k429));
        }
        else {
            this.getDocument().wires.push(k429);
        }
        this.ensureNetExists(j429);
        this.connectWireToPins(h429[0], h429[h429.length - 1], j429);
        this.rebuildNetPinConnectivity();
        this.notifyChange();
        return ResultHelper.ok(i429);
    }
    rebuildNetPinConnectivity(): void {
        const v428 = this.getDocument();
        const w428: PinGeometryResolver = (x428: string): PinGeometry[] | null => {
            const y428 = this.resolvePins(x428);
            if (y428 === null) {
                return null;
            }
            const z428: PinGeometry[] = [];
            for (let a429 = 0; a429 < y428.length; a429++) {
                const b429: PinGeometry = {
                    id: y428[a429].id,
                    name: y428[a429].name,
                    x: y428[a429].position.x,
                    y: y428[a429].position.y
                };
                z428.push(b429);
            }
            return z428;
        };
        rebuildAllNetPinConnectivity(v428, this.viewport.gridSize, w428);
        this.mergeDuplicateNamedNets();
    }
    private mergeNetsAtSharedWireEndpoints(): void {
        const a428 = this.getDocument();
        const b428 = Math.max(2, this.viewport.gridSize * 0.5);
        interface c428 {
            pt: Point2D;
            wireIdx: number;
        }
        const d428: c428[] = [];
        for (let t428 = 0; t428 < a428.wires.length; t428++) {
            const u428 = a428.wires[t428];
            if (u428.points.length < 2)
                continue;
            d428.push({ pt: u428.points[0], wireIdx: t428 });
            d428.push({ pt: u428.points[u428.points.length - 1], wireIdx: t428 });
        }
        const e428: c428[][] = [];
        const f428 = new Array<boolean>(d428.length).fill(false);
        for (let n428 = 0; n428 < d428.length; n428++) {
            if (f428[n428])
                continue;
            const o428: c428[] = [d428[n428]];
            f428[n428] = true;
            for (let p428 = n428 + 1; p428 < d428.length; p428++) {
                if (f428[p428])
                    continue;
                for (const q428 of o428) {
                    const r428 = q428.pt.x - d428[p428].pt.x;
                    const s428 = q428.pt.y - d428[p428].pt.y;
                    if (Math.abs(r428) <= b428 && Math.abs(s428) <= b428) {
                        o428.push(d428[p428]);
                        f428[p428] = true;
                        break;
                    }
                }
            }
            e428.push(o428);
        }
        for (const g428 of e428) {
            const h428: string[] = [];
            for (const l428 of g428) {
                const m428 = a428.wires[l428.wireIdx].netId;
                if (!h428.includes(m428)) {
                    h428.push(m428);
                }
            }
            if (h428.length <= 1)
                continue;
            const i428 = h428[0];
            for (const j428 of g428) {
                const k428 = a428.wires[j428.wireIdx];
                if (k428.netId !== i428) {
                    k428.netId = i428;
                }
            }
        }
    }
    private registerPowerSymbolOnGlobalNet(u427: ComponentInstance): void {
        const v427 = u427.libraryId.toUpperCase();
        let w427: string | null = null;
        if (v427 === 'VCC' || v427.endsWith('/VCC')) {
            w427 = 'VCC';
        }
        else if (v427 === 'GND' || v427.endsWith('/GND')) {
            w427 = 'GND';
        }
        if (w427 === null) {
            return;
        }
        const x427 = this.resolvePins(u427.libraryId);
        if (x427 === null || x427.length === 0) {
            return;
        }
        const y427 = x427[0];
        let z427 = this.findNetByName(this.getDocument(), w427);
        if (z427 === undefined) {
            this.createNetLabel(u427.position.x, u427.position.y, w427);
            z427 = this.findNetByName(this.getDocument(), w427);
        }
        if (z427 !== undefined) {
            this.addPinToNet(z427.id, u427.id, y427.id, y427.name);
        }
    }
    private mergeDuplicateNamedNets(): void {
        const g427 = this.getDocument();
        const h427: string[] = ['VCC', 'VDD', 'GND', 'VSS', 'VEE', '0'];
        for (let q427 = 0; q427 < h427.length; q427++) {
            const r427 = h427[q427];
            let s427: string | null = null;
            for (let t427 = 0; t427 < g427.nets.length; t427++) {
                if (g427.nets[t427].name.toUpperCase() === r427) {
                    if (s427 === null) {
                        s427 = g427.nets[t427].id;
                    }
                    else if (g427.nets[t427].id !== s427) {
                        this.mergeNets(g427.nets[t427].id, s427);
                    }
                }
            }
        }
        const i427 = new Map<string, string>();
        for (let n427 = 0; n427 < g427.nets.length; n427++) {
            const o427 = g427.nets[n427];
            const p427 = o427.name.toUpperCase();
            if (p427.length === 0) {
                continue;
            }
            if (i427.has(p427)) {
                this.mergeNets(o427.id, i427.get(p427)!);
            }
            else {
                i427.set(p427, o427.id);
            }
        }
        const j427 = new Map<string, string>();
        for (let k427 = 0; k427 < g427.netLabels.length; k427++) {
            const l427 = g427.netLabels[k427];
            const m427 = l427.text.toUpperCase();
            if (m427.length === 0 || m427.startsWith('NET_')) {
                continue;
            }
            if (j427.has(m427)) {
                this.mergeNets(l427.netId, j427.get(m427)!);
            }
            else {
                j427.set(m427, l427.netId);
            }
        }
    }
    private routeOrthogonalWire(q426: Point2D, r426: Point2D): Point2D[] {
        const s426: Point2D = { x: r426.x, y: q426.y };
        const t426: Point2D = { x: q426.x, y: r426.y };
        const u426 = this.findPinAtPoint(q426);
        const v426 = this.findPinAtPoint(r426);
        const w426 = u426 !== null && v426 !== null && u426.comp.id === v426.comp.id;
        const x426 = new Set<string>();
        if (!w426) {
            if (u426 !== null) {
                x426.add(u426.comp.id);
            }
            if (v426 !== null) {
                x426.add(v426.comp.id);
            }
        }
        const y426 = this.collectPinObstacles(x426);
        if (u426 === null && v426 === null && y426.length === 0) {
            return [q426, s426, r426];
        }
        const z426 = this.scoreWirePath(q426, s426, r426, x426, y426);
        const a427 = this.scoreWirePath(q426, t426, r426, x426, y426);
        let b427: Point2D;
        if (z426.score < a427.score) {
            b427 = s426;
        }
        else if (a427.score < z426.score) {
            b427 = t426;
        }
        else {
            b427 = this.preferMidByPinDirection(q426, r426, u426, v426, s426, t426);
        }
        const c427 = b427 === s426 ? z426 : a427;
        if (c427.intersectsBody || c427.pinHits > 0) {
            return this.routeAroundObstacles(q426, b427, r426, x426, y426);
        }
        const d427 = [q426, b427, r426];
        if (this.doesPathOverlapExisting(d427)) {
            const e427 = b427 === s426 ? t426 : s426;
            const f427 = e427 === s426 ? z426 : a427;
            if (f427.score === 0 && !this.doesPathOverlapExisting([q426, e427, r426])) {
                b427 = e427;
            }
        }
        return [q426, b427, r426];
    }
    private getComponentWorldBounds(e426: ComponentInstance): Rect2D | null {
        const f426 = this.resolvePins(e426.libraryId);
        if (f426 === null || f426.length === 0) {
            return { x: e426.position.x - 30, y: e426.position.y - 20, width: 60, height: 40 };
        }
        const g426 = calcSymbolBounds(f426, 10);
        const h426: Point2D[] = [
            { x: g426.minX, y: g426.minY },
            { x: g426.maxX, y: g426.minY },
            { x: g426.minX, y: g426.maxY },
            { x: g426.maxX, y: g426.maxY }
        ];
        let i426 = Infinity;
        let j426 = Infinity;
        let k426 = -Infinity;
        let l426 = -Infinity;
        for (const m426 of h426) {
            const n426 = this.transformPinOffsetForConnect(m426, e426.rotation, e426.mirrored);
            const o426 = e426.position.x + n426.x;
            const p426 = e426.position.y + n426.y;
            if (o426 < i426) {
                i426 = o426;
            }
            if (p426 < j426) {
                j426 = p426;
            }
            if (o426 > k426) {
                k426 = o426;
            }
            if (p426 > l426) {
                l426 = p426;
            }
        }
        return { x: i426, y: j426, width: k426 - i426, height: l426 - j426 };
    }
    private collectPinObstacles(w425: Set<string>): Point2D[] {
        const x425 = this.getDocument();
        const y425: Point2D[] = [];
        for (const z425 of x425.components) {
            if (w425.has(z425.id)) {
                continue;
            }
            const a426 = this.resolvePins(z425.libraryId);
            if (a426 === null) {
                continue;
            }
            for (const b426 of a426) {
                const c426 = this.transformPinOffsetForConnect(b426.position, z425.rotation, z425.mirrored);
                const d426: Point2D = { x: z425.position.x + c426.x, y: z425.position.y + c426.y };
                y425.push(d426);
            }
        }
        return y425;
    }
    private scoreWirePath(n425: Point2D, o425: Point2D, p425: Point2D, q425: Set<string>, r425: Point2D[]): WirePathScore {
        let s425 = 0;
        let t425 = 0;
        const u425 = this.viewport.gridSize * 2;
        if (n425.y === o425.y) {
            if (this.horizontalSegmentIntersectsBody(n425.x, o425.x, n425.y, q425)) {
                s425++;
            }
            t425 += this.countPinHitsHorizontal(n425.x, o425.x, n425.y, r425, u425);
        }
        else {
            if (this.verticalSegmentIntersectsBody(n425.x, n425.y, o425.y, q425)) {
                s425++;
            }
            t425 += this.countPinHitsVertical(n425.x, n425.y, o425.y, r425, u425);
        }
        if (o425.y === p425.y) {
            if (this.horizontalSegmentIntersectsBody(o425.x, p425.x, o425.y, q425)) {
                s425++;
            }
            t425 += this.countPinHitsHorizontal(o425.x, p425.x, o425.y, r425, u425);
        }
        else {
            if (this.verticalSegmentIntersectsBody(o425.x, o425.y, p425.y, q425)) {
                s425++;
            }
            t425 += this.countPinHitsVertical(o425.x, o425.y, p425.y, r425, u425);
        }
        const v425: WirePathScore = { score: s425 * 10 + t425 * 3, intersectsBody: s425 > 0, pinHits: t425 };
        return v425;
    }
    private countPinHitsHorizontal(e425: number, f425: number, g425: number, h425: Point2D[], i425: number): number {
        const j425 = Math.min(e425, f425) - i425;
        const k425 = Math.max(e425, f425) + i425;
        let l425 = 0;
        for (const m425 of h425) {
            if (Math.abs(m425.y - g425) <= i425 && m425.x >= j425 && m425.x <= k425) {
                l425++;
            }
        }
        return l425;
    }
    private countPinHitsVertical(v424: number, w424: number, x424: number, y424: Point2D[], z424: number): number {
        const a425 = Math.min(w424, x424) - z424;
        const b425 = Math.max(w424, x424) + z424;
        let c425 = 0;
        for (const d425 of y424) {
            if (Math.abs(d425.x - v424) <= z424 && d425.y >= a425 && d425.y <= b425) {
                c425++;
            }
        }
        return c425;
    }
    private horizontalSegmentIntersectsBody(m424: number, n424: number, o424: number, p424: Set<string>): boolean {
        const q424 = this.getDocument();
        const r424 = Math.min(m424, n424);
        const s424 = Math.max(m424, n424);
        for (const t424 of q424.components) {
            if (p424.has(t424.id)) {
                continue;
            }
            const u424 = this.getComponentWorldBounds(t424);
            if (u424 === null) {
                continue;
            }
            if (o424 >= u424.y && o424 <= u424.y + u424.height && s424 > u424.x && r424 < u424.x + u424.width) {
                return true;
            }
        }
        return false;
    }
    private verticalSegmentIntersectsBody(d424: number, e424: number, f424: number, g424: Set<string>): boolean {
        const h424 = this.getDocument();
        const i424 = Math.min(e424, f424);
        const j424 = Math.max(e424, f424);
        for (const k424 of h424.components) {
            if (g424.has(k424.id)) {
                continue;
            }
            const l424 = this.getComponentWorldBounds(k424);
            if (l424 === null) {
                continue;
            }
            if (d424 >= l424.x && d424 <= l424.x + l424.width && j424 > l424.y && i424 < l424.y + l424.height) {
                return true;
            }
        }
        return false;
    }
    private preferMidByPinDirection(s423: Point2D, t423: Point2D, u423: PinAtPoint | null, v423: PinAtPoint | null, w423: Point2D, x423: Point2D): Point2D {
        let y423 = 0;
        let z423 = 0;
        if (u423 !== null) {
            const c424 = this.getPinExtensionDir(u423.pin, u423.comp);
            if (c424 === 'horizontal') {
                y423++;
            }
            else {
                z423++;
            }
        }
        if (v423 !== null) {
            const b424 = this.getPinExtensionDir(v423.pin, v423.comp);
            if (b424 === 'vertical') {
                y423++;
            }
            else {
                z423++;
            }
        }
        if (y423 === z423 && v423 !== null) {
            const a424 = this.getPinExtensionDir(v423.pin, v423.comp);
            return a424 === 'horizontal' ? x423 : w423;
        }
        return z423 > y423 ? x423 : w423;
    }
    private getPinExtensionDir(p423: Pin, q423: ComponentInstance): 'horizontal' | 'vertical' {
        const r423 = this.transformPinOffsetForConnect(p423.position, q423.rotation, q423.mirrored);
        if (Math.abs(r423.x) * 8 >= Math.abs(r423.y)) {
            return 'horizontal';
        }
        return 'vertical';
    }
    private findPinAtPoint(c423: Point2D): PinAtPoint | null {
        const d423 = this.getDocument();
        const e423 = this.viewport.gridSize * 1.5;
        let f423 = e423;
        let g423: PinAtPoint | null = null;
        for (const h423 of d423.components) {
            const i423 = this.resolvePins(h423.libraryId);
            if (i423 === null) {
                continue;
            }
            for (const j423 of i423) {
                const k423 = this.transformPinOffsetForConnect(j423.position, h423.rotation, h423.mirrored);
                const l423: Point2D = { x: h423.position.x + k423.x, y: h423.position.y + k423.y };
                const m423 = c423.x - l423.x;
                const n423 = c423.y - l423.y;
                const o423 = Math.sqrt(m423 * m423 + n423 * n423);
                if (o423 <= f423) {
                    f423 = o423;
                    g423 = { comp: h423, pin: j423, pinWorld: l423 };
                }
            }
        }
        return g423;
    }
    private routeAroundObstacles(m422: Point2D, n422: Point2D, o422: Point2D, p422: Set<string>, q422: Point2D[]): Point2D[] {
        const r422 = this.viewport.gridSize;
        const s422 = r422 * 2;
        const t422 = r422 * 2;
        const u422 = m422.y === n422.y;
        let v422: Point2D[] | null = null;
        if (u422) {
            v422 = this.findHorizontalDetour(m422.x, n422.x, m422.y, m422, o422, p422, q422, s422, t422, true);
        }
        else {
            v422 = this.findVerticalDetour(m422.x, m422.y, n422.y, m422, o422, p422, q422, s422, t422, true);
        }
        const w422 = n422.y === o422.y;
        let x422: Point2D[] | null = null;
        if (w422) {
            x422 = this.findHorizontalDetour(n422.x, o422.x, n422.y, m422, o422, p422, q422, s422, t422, false);
        }
        else {
            x422 = this.findVerticalDetour(n422.x, n422.y, o422.y, m422, o422, p422, q422, s422, t422, false);
        }
        if (v422 === null && x422 === null) {
            return [m422, n422, o422];
        }
        const y422: Point2D[] = [m422];
        if (v422 !== null) {
            for (let b423 = 1; b423 < v422.length; b423++) {
                y422.push(v422[b423]);
            }
        }
        else {
            y422.push(n422);
        }
        if (x422 !== null) {
            for (let a423 = 1; a423 < x422.length; a423++) {
                y422.push(x422[a423]);
            }
        }
        else {
            y422.push(o422);
        }
        const z422 = y422.length - 1;
        if (y422[z422].x !== o422.x || y422[z422].y !== o422.y) {
            y422[z422] = { x: o422.x, y: o422.y };
        }
        return y422;
    }
    private ensurePerpendicularApproach(l422: Point2D[]): void {
        if (l422.length < 2) {
            return;
        }
        this.fixApproachForEndpoint(l422, 0, true);
        this.fixApproachForEndpoint(l422, l422.length - 1, false);
    }
    private fixApproachForEndpoint(u421: Point2D[], v421: number, w421: boolean): void {
        const x421 = u421[v421];
        const y421 = this.findPinAtPoint(x421);
        if (y421 === null) {
            return;
        }
        const z421 = this.getComponentWorldBounds(y421.comp);
        if (z421 === null) {
            return;
        }
        const a422 = this.viewport.gridSize;
        const b422 = a422;
        const c422 = a422 * 3;
        let d422: string | null = null;
        if (Math.abs(x421.x - z421.x) <= b422) {
            d422 = 'left';
        }
        else if (Math.abs(x421.x - (z421.x + z421.width)) <= b422) {
            d422 = 'right';
        }
        else if (Math.abs(x421.y - z421.y) <= b422) {
            d422 = 'top';
        }
        else if (Math.abs(x421.y - (z421.y + z421.height)) <= b422) {
            d422 = 'bottom';
        }
        if (d422 === null) {
            return;
        }
        const e422 = w421 ? 1 : v421 - 1;
        const f422 = u421[e422];
        const g422 = 0.5;
        if (d422 === 'left' || d422 === 'right') {
            if (Math.abs(f422.x - x421.x) > g422 && Math.abs(f422.y - x421.y) <= g422) {
                return;
            }
            const j422 = d422 === 'left' ? x421.x - c422 : x421.x + c422;
            const k422: Point2D = { x: j422, y: x421.y };
            if (w421) {
                u421[e422] = { x: j422, y: f422.y };
                u421.splice(e422, 0, k422);
            }
            else {
                u421[e422] = { x: j422, y: f422.y };
                u421.splice(v421, 0, k422);
            }
        }
        else {
            if (Math.abs(f422.x - x421.x) <= g422 && Math.abs(f422.y - x421.y) > g422) {
                return;
            }
            const h422 = d422 === 'top' ? x421.y - c422 : x421.y + c422;
            const i422: Point2D = { x: x421.x, y: h422 };
            if (w421) {
                u421[e422] = { x: f422.x, y: h422 };
                u421.splice(e422, 0, i422);
            }
            else {
                u421[e422] = { x: f422.x, y: h422 };
                u421.splice(v421, 0, i422);
            }
        }
    }
    private findHorizontalDetour(q420: number, r420: number, s420: number, t420: Point2D, u420: Point2D, v420: Set<string>, w420: Point2D[], x420: number, y420: number, z420: boolean): Point2D[] | null {
        const a421 = this.getDocument();
        const b421 = this.viewport.gridSize;
        const c421 = Math.min(q420, r420);
        const d421 = Math.max(q420, r420);
        let e421 = -Infinity;
        let f421 = Infinity;
        let g421 = false;
        for (const s421 of a421.components) {
            if (v420.has(s421.id)) {
                continue;
            }
            const t421 = this.getComponentWorldBounds(s421);
            if (t421 === null) {
                continue;
            }
            if (s420 >= t421.y - x420 && s420 <= t421.y + t421.height + x420 &&
                d421 > t421.x && c421 < t421.x + t421.width) {
                e421 = Math.max(e421, t421.y);
                f421 = Math.min(f421, t421.y + t421.height);
                g421 = true;
            }
        }
        for (const r421 of w420) {
            if (Math.abs(r421.y - s420) <= x420 && r421.x >= c421 - x420 && r421.x <= d421 + x420) {
                e421 = Math.max(e421, r421.y - x420);
                f421 = Math.min(f421, r421.y + x420);
                g421 = true;
            }
        }
        if (!g421) {
            return null;
        }
        const h421 = s420 - e421 <= f421 - s420;
        const i421 = h421 ? e421 - y420 : f421 + y420;
        const j421 = Math.min(q420, r420);
        const k421 = Math.max(q420, r420);
        let l421 = q420;
        let m421: number;
        if (z420) {
            if (q420 < r420) {
                l421 = Math.min(q420 + b421, r420);
            }
            else if (q420 > r420) {
                l421 = Math.max(q420 - b421, r420);
            }
            m421 = r420;
        }
        else {
            l421 = q420;
            m421 = r420;
        }
        const n421: Point2D = { x: l421, y: s420 };
        const o421: Point2D = { x: l421, y: i421 };
        const p421: Point2D = { x: m421, y: i421 };
        const q421: Point2D = { x: m421, y: s420 };
        return [n421, o421, p421, q421];
    }
    private findVerticalDetour(o419: number, p419: number, q419: number, r419: Point2D, s419: Point2D, t419: Set<string>, u419: Point2D[], v419: number, w419: number, x419: boolean): Point2D[] | null {
        const y419 = this.getDocument();
        const z419 = this.viewport.gridSize;
        const a420 = Math.min(p419, q419);
        const b420 = Math.max(p419, q419);
        let c420 = -Infinity;
        let d420 = Infinity;
        let e420 = false;
        for (const o420 of y419.components) {
            if (t419.has(o420.id)) {
                continue;
            }
            const p420 = this.getComponentWorldBounds(o420);
            if (p420 === null) {
                continue;
            }
            if (o419 >= p420.x - v419 && o419 <= p420.x + p420.width + v419 &&
                b420 > p420.y && a420 < p420.y + p420.height) {
                c420 = Math.max(c420, p420.x);
                d420 = Math.min(d420, p420.x + p420.width);
                e420 = true;
            }
        }
        for (const n420 of u419) {
            if (Math.abs(n420.x - o419) <= v419 && n420.y >= a420 - v419 && n420.y <= b420 + v419) {
                c420 = Math.max(c420, n420.x - v419);
                d420 = Math.min(d420, n420.x + v419);
                e420 = true;
            }
        }
        if (!e420) {
            return null;
        }
        const f420 = o419 - c420 <= d420 - o419;
        const g420 = f420 ? c420 - w419 : d420 + w419;
        let h420 = p419;
        let i420: number;
        if (x419) {
            if (p419 < q419) {
                h420 = Math.min(p419 + z419, q419);
            }
            else if (p419 > q419) {
                h420 = Math.max(p419 - z419, q419);
            }
            i420 = q419;
        }
        else {
            h420 = p419;
            i420 = q419;
        }
        const j420: Point2D = { x: o419, y: h420 };
        const k420: Point2D = { x: g420, y: h420 };
        const l420: Point2D = { x: g420, y: i420 };
        const m420: Point2D = { x: o419, y: i420 };
        return [j420, k420, l420, m420];
    }
    private doesPathOverlapExisting(e419: Point2D[], f419?: string): boolean {
        const g419 = this.getDocument();
        for (const h419 of g419.wires) {
            if (f419 !== undefined && h419.id === f419) {
                continue;
            }
            for (let i419 = 1; i419 < h419.points.length; i419++) {
                const j419 = h419.points[i419 - 1];
                const k419 = h419.points[i419];
                for (let l419 = 1; l419 < e419.length; l419++) {
                    const m419 = e419[l419 - 1];
                    const n419 = e419[l419];
                    if (this.segmentsCollinearOverlap(m419, n419, j419, k419)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
    private segmentsCollinearOverlap(s418: Point2D, t418: Point2D, u418: Point2D, v418: Point2D): boolean {
        if (s418.y === t418.y && u418.y === v418.y && s418.y === u418.y) {
            const a419 = Math.min(s418.x, t418.x);
            const b419 = Math.max(s418.x, t418.x);
            const c419 = Math.min(u418.x, v418.x);
            const d419 = Math.max(u418.x, v418.x);
            return b419 > c419 && a419 < d419;
        }
        if (s418.x === t418.x && u418.x === v418.x && s418.x === u418.x) {
            const w418 = Math.min(s418.y, t418.y);
            const x418 = Math.max(s418.y, t418.y);
            const y418 = Math.min(u418.y, v418.y);
            const z418 = Math.max(u418.y, v418.y);
            return x418 > y418 && w418 < z418;
        }
        return false;
    }
    private snapToNearestPin(c418: Point2D, d418: number): Point2D {
        const e418 = this.getDocument();
        const f418 = d418 * 1.5;
        let g418 = f418;
        let h418: Point2D | null = null;
        for (let i418 = 0; i418 < e418.components.length; i418++) {
            const j418 = e418.components[i418];
            const k418 = this.resolvePins(j418.libraryId);
            if (k418 === null || k418.length === 0) {
                continue;
            }
            for (let l418 = 0; l418 < k418.length; l418++) {
                const m418 = k418[l418];
                const n418 = this.transformPinOffsetForConnect(m418.position, j418.rotation, j418.mirrored);
                const o418: Point2D = { x: j418.position.x + n418.x, y: j418.position.y + n418.y };
                const p418 = c418.x - o418.x;
                const q418 = c418.y - o418.y;
                const r418 = Math.sqrt(p418 * p418 + q418 * q418);
                if (r418 <= g418) {
                    g418 = r418;
                    h418 = { x: o418.x, y: o418.y };
                }
            }
        }
        if (h418 !== null) {
            Logger.debug('schematic_editor', `snapToNearestPin: snapping (${c418.x},${c418.y}) -> (${h418.x},${h418.y}) dist=${g418.toFixed(1)}`);
            return h418;
        }
        return c418;
    }
    private ensureNetExists(y417: string): void {
        const z417 = this.getDocument();
        const a418 = z417.nets.find(b418 => b418.id === y417);
        if (a418 !== undefined) {
            return;
        }
        z417.nets.push({
            id: y417,
            name: `NET_${y417.substring(0, 6)}`,
            type: NetType.SIGNAL,
            pinIds: []
        });
        Logger.info('schematic_editor', `ensureNetExists: created net ${y417}`);
    }
    private inheritNetAtPosition(i417: Point2D): string | null {
        const j417 = this.getDocument();
        const k417 = Math.max(2, this.viewport.gridSize * 0.5);
        for (const p417 of j417.nets) {
            if (p417.pinIds.length === 0)
                continue;
            for (const q417 of p417.pinIds) {
                const r417 = q417.split(':');
                if (r417.length < 2)
                    continue;
                const s417 = this.findComponent(r417[0]);
                if (s417 === undefined)
                    continue;
                const t417 = this.resolvePins(s417.libraryId);
                if (t417 === null)
                    continue;
                for (const u417 of t417) {
                    if (u417.id !== r417[1])
                        continue;
                    const v417 = this.transformPinOffsetForConnect(u417.position, s417.rotation, s417.mirrored);
                    const w417 = s417.position.x + v417.x;
                    const x417 = s417.position.y + v417.y;
                    if (Math.abs(i417.x - w417) <= k417 && Math.abs(i417.y - x417) <= k417) {
                        return p417.id;
                    }
                }
            }
        }
        for (const l417 of j417.wires) {
            if (l417.points.length < 2)
                continue;
            for (let m417 = 1; m417 < l417.points.length; m417++) {
                const n417 = l417.points[m417 - 1];
                const o417 = l417.points[m417];
                if (this.pointOnSegment(i417, n417, o417, k417)) {
                    return l417.netId;
                }
            }
        }
        return null;
    }
    private pointOnSegment(y416: Point2D, z416: Point2D, a417: Point2D, b417: number): boolean {
        const c417 = a417.x - z416.x;
        const d417 = a417.y - z416.y;
        const e417 = c417 * c417 + d417 * d417;
        if (e417 < 0.01) {
            return Math.abs(y416.x - z416.x) <= b417 && Math.abs(y416.y - z416.y) <= b417;
        }
        let f417 = ((y416.x - z416.x) * c417 + (y416.y - z416.y) * d417) / e417;
        f417 = Math.max(0, Math.min(1, f417));
        const g417 = z416.x + f417 * c417;
        const h417 = z416.y + f417 * d417;
        return Math.abs(y416.x - g417) <= b417 && Math.abs(y416.y - h417) <= b417;
    }
    private connectWireToPins(v415: Point2D, w415: Point2D, x415: string, y415: number = this.viewport.gridSize * 1.5): void {
        const z415 = this.getDocument();
        const a416 = [v415, w415];
        const b416 = 2;
        let c416 = 0;
        interface d416 {
            comp: ComponentInstance;
            pin: Pin;
            world: Point2D;
        }
        const e416: d416[] = [];
        for (let s416 = 0; s416 < z415.components.length; s416++) {
            const t416 = z415.components[s416];
            const u416 = this.resolvePins(t416.libraryId);
            if (u416 === null || u416.length === 0) {
                continue;
            }
            for (let v416 = 0; v416 < u416.length; v416++) {
                const w416 = u416[v416];
                const x416 = this.transformPinOffsetForConnect(w416.position, t416.rotation, t416.mirrored);
                e416.push({
                    comp: t416,
                    pin: w416,
                    world: { x: t416.position.x + x416.x, y: t416.position.y + x416.y }
                });
            }
        }
        for (let f416 = 0; f416 < a416.length; f416++) {
            const g416 = a416[f416];
            let h416 = y415;
            let i416: d416 | null = null;
            for (let n416 = 0; n416 < e416.length; n416++) {
                const o416 = e416[n416];
                const p416 = g416.x - o416.world.x;
                const q416 = g416.y - o416.world.y;
                const r416 = Math.sqrt(p416 * p416 + q416 * q416);
                if (r416 < h416) {
                    h416 = r416;
                    i416 = o416;
                }
            }
            if (i416 !== null) {
                this.addPinToNet(x415, i416.comp.id, i416.pin.id, i416.pin.name);
                c416++;
                Logger.debug('schematic_editor', `connectWireToPins: pin ${i416.pin.name}(${i416.pin.id}) of ${i416.comp.refDes} connected dist=${h416.toFixed(1)}`);
                for (let j416 = 0; j416 < e416.length; j416++) {
                    const k416 = e416[j416];
                    if (k416.comp.id === i416.comp.id && k416.pin.id === i416.pin.id) {
                        continue;
                    }
                    const l416 = i416.world.x - k416.world.x;
                    const m416 = i416.world.y - k416.world.y;
                    if (Math.abs(l416) <= b416 && Math.abs(m416) <= b416) {
                        this.addPinToNet(x415, k416.comp.id, k416.pin.id, k416.pin.name);
                        c416++;
                    }
                }
            }
        }
        Logger.debug('schematic_editor', `connectWireToPins: ${c416} pins connected to net ${x415}`);
    }
    private normalizePowerNet(i415: string): void {
        const j415 = this.getDocument();
        const k415 = this.findNetById(j415, i415);
        if (k415 === undefined) {
            return;
        }
        let l415: string | null = null;
        for (let n415 = 0; n415 < k415.pinIds.length; n415++) {
            const o415 = k415.pinIds[n415];
            const p415 = o415.split(':');
            if (p415.length < 2) {
                continue;
            }
            const q415 = this.findComponent(p415[0]);
            if (q415 === undefined) {
                continue;
            }
            const r415 = this.resolvePins(q415.libraryId);
            if (r415 === null) {
                continue;
            }
            let s415: Pin | undefined = undefined;
            for (let u415 = 0; u415 < r415.length; u415++) {
                if (r415[u415].id === p415[1]) {
                    s415 = r415[u415];
                    break;
                }
            }
            if (s415 === undefined) {
                continue;
            }
            const t415 = this.resolvePowerNetName(q415, s415);
            if (t415 !== null) {
                l415 = t415;
                break;
            }
        }
        if (l415 === null) {
            return;
        }
        let m415 = this.findNetByName(j415, l415);
        if (m415 === undefined) {
            this.createNetLabel(0, 0, l415);
            m415 = this.findNetByName(j415, l415);
        }
        if (m415 === undefined || m415.id === i415) {
            return;
        }
        this.mergeNets(i415, m415.id);
    }
    private resolvePowerNetName(f415: ComponentInstance, g415: Pin): string | null {
        const h415 = f415.libraryId.toUpperCase();
        if (h415 === 'VCC' || h415.endsWith('/VCC')) {
            return 'VCC';
        }
        if (h415 === 'GND' || h415.endsWith('/GND')) {
            return 'GND';
        }
        return null;
    }
    private mergeNets(v414: string, w414: string): void {
        if (v414 === w414) {
            return;
        }
        const x414 = this.getDocument();
        const y414 = this.findNetById(x414, v414);
        const z414 = this.findNetById(x414, w414);
        if (y414 === undefined || z414 === undefined) {
            return;
        }
        for (let d415 = 0; d415 < y414.pinIds.length; d415++) {
            const e415 = y414.pinIds[d415];
            if (!z414.pinIds.includes(e415)) {
                z414.pinIds.push(e415);
            }
        }
        if (y414.type === NetType.GROUND || z414.type === NetType.GROUND) {
            z414.type = NetType.GROUND;
        }
        else if (y414.type === NetType.POWER || z414.type === NetType.POWER) {
            z414.type = NetType.POWER;
        }
        if (z414.name.toUpperCase() === 'GND' || z414.name.toUpperCase() === 'VSS') {
            z414.type = NetType.GROUND;
        }
        else if (z414.name.toUpperCase() === 'VCC' || z414.name.toUpperCase() === 'VDD') {
            z414.type = NetType.POWER;
        }
        for (let c415 = 0; c415 < x414.wires.length; c415++) {
            if (x414.wires[c415].netId === v414) {
                x414.wires[c415].netId = w414;
            }
        }
        for (let b415 = 0; b415 < x414.netLabels.length; b415++) {
            if (x414.netLabels[b415].netId === v414) {
                x414.netLabels[b415].netId = w414;
            }
        }
        x414.nets = x414.nets.filter(a415 => a415.id !== v414);
        Logger.info('schematic_editor', `mergeNets: ${y414.name}(${v414}) -> ${z414.name}(${w414})`);
    }
    private transformPinOffsetForConnect(q414: Point2D, r414: Rotation, s414: boolean): Point2D {
        let t414 = q414.x;
        let u414 = q414.y;
        if (s414) {
            t414 = -t414;
        }
        switch (r414) {
            case 90: return { x: -u414, y: t414 };
            case 180: return { x: -t414, y: -u414 };
            case 270: return { x: u414, y: -t414 };
            default: return { x: t414, y: u414 };
        }
    }
    private addPinToNet(g414: string, h414: string, i414: string, j414: string): void {
        const k414 = this.getDocument();
        const l414 = k414.nets.find(p414 => p414.id === g414);
        if (l414 === undefined) {
            return;
        }
        const m414 = `${h414}:${i414}:${j414}`;
        if (l414.pinIds.includes(m414)) {
            return;
        }
        for (const n414 of k414.nets) {
            if (n414.id !== g414) {
                const o414 = n414.pinIds.indexOf(m414);
                if (o414 >= 0) {
                    n414.pinIds.splice(o414, 1);
                }
            }
        }
        l414.pinIds.push(m414);
    }
    private resolvePins(f414: string): Pin[] | null {
        if (this.pinResolver !== null) {
            return this.pinResolver(f414);
        }
        return null;
    }
    setComponentLocked(c414: string, d414: boolean): ApiResult<void> {
        const e414 = this.findComponent(c414);
        if (e414 === undefined)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        if (d414)
            this.lockedComponentIds.add(c414);
        else
            this.lockedComponentIds.delete(c414);
        return ResultHelper.ok();
    }
    isComponentLocked(b414: string): boolean {
        return this.lockedComponentIds.has(b414);
    }
    duplicateDevice(s413: string, t413: number = 20, u413: number = 20): ApiResult<string> {
        const v413 = this.findComponent(s413);
        if (v413 === undefined) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '器件不存在');
        }
        const w413: ApiResult<void> | null = this.guardEdit();
        if (w413 !== null) {
            return ResultHelper.fail(w413.errCode !== undefined ? w413.errCode : ErrCode.ERR_SIM_BUSY, w413.error);
        }
        const x413: string = this.getRefDesPrefix(v413.libraryId);
        const y413: number = (this.refDesCounters.get(x413) ?? 0) + 1;
        this.refDesCounters.set(x413, y413);
        const z413: Point2D = EditorInternals.calcSnapPoint(v413.position.x + t413, v413.position.y + u413, this.viewport.gridSize);
        const a414: ComponentInstance = {
            id: IdUtil.generate('comp'),
            libraryId: v413.libraryId,
            refDes: `${x413}${y413}`,
            position: z413,
            rotation: v413.rotation,
            mirrored: v413.mirrored,
            parameters: SchematicEditorImpl.copyParameters(v413.parameters)
        };
        if (this.document !== null) {
            this.commandHistory.push(new PlaceCommand(this.document, a414));
        }
        else {
            this.getDocument().components.push(a414);
        }
        this.notifyChange();
        return ResultHelper.ok(a414.id);
    }
    moveComponents(h413: string[], i413: Point2D): ApiResult<void> {
        const j413: ApiResult<void> | null = this.guardEdit();
        if (j413 !== null) {
            return ResultHelper.fail(j413.errCode !== undefined ? j413.errCode : ErrCode.ERR_SIM_BUSY, j413.error);
        }
        const k413: ComponentInstance[] = this.collectComponents(h413);
        if (k413.length === 0 || this.document === null) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '未找到可移动器件');
        }
        const l413 = new Map<string, Map<string, Point2D>>();
        for (let o413 = 0; o413 < k413.length; o413++) {
            const p413 = k413[o413];
            l413.set(p413.id, this.getComponentPinWorldPositions(p413));
            const q413: Point2D = { x: p413.position.x, y: p413.position.y };
            const r413: Point2D = EditorInternals.calcSnapPoint(p413.position.x + i413.x, p413.position.y + i413.y, this.viewport.gridSize);
            this.commandHistory.push(new MoveCommand(this.document, p413.id, q413, r413));
        }
        l413.forEach((m413: Map<string, Point2D>, n413: string) => {
            this.updateWiresForComponentMove(n413, m413);
        });
        this.notifyChange();
        return ResultHelper.ok();
    }
    panTo(g413: Point2D): void {
        this.viewport.panOffset = SchematicEditorImpl.copyPoint2D(g413);
        this.publishViewport();
    }
    setGridSize(f413: number): void {
        this.viewport.gridSize = f413;
    }
    setGridVisible(e413: boolean): void {
        this.viewport.gridVisible = e413;
    }
    setSnapToGrid(d413: boolean): void {
        this.viewport.snapToGrid = d413;
    }
    private static arrayMin(a413: number[]): number {
        let b413: number = a413[0];
        for (let c413 = 1; c413 < a413.length; c413++) {
            if (a413[c413] < b413) {
                b413 = a413[c413];
            }
        }
        return b413;
    }
    private static arrayMax(x412: number[]): number {
        let y412: number = x412[0];
        for (let z412 = 1; z412 < x412.length; z412++) {
            if (x412[z412] > y412) {
                y412 = x412[z412];
            }
        }
        return y412;
    }
    private static arrayAverage(u412: number[]): number {
        let v412 = 0;
        for (let w412 = 0; w412 < u412.length; w412++) {
            v412 += u412[w412];
        }
        return v412 / u412.length;
    }
    private collectComponents(q412: string[]): ComponentInstance[] {
        const r412: ComponentInstance[] = [];
        for (let s412 = 0; s412 < q412.length; s412++) {
            const t412: ComponentInstance | undefined = this.findComponent(q412[s412]);
            if (t412 !== undefined) {
                r412.push(t412);
            }
        }
        return r412;
    }
    private cloneViewportState(): ViewportState {
        const o412: Point2D = SchematicEditorImpl.copyPoint2D(this.viewport.panOffset);
        const p412: ViewportState = {
            zoom: this.viewport.zoom,
            panOffset: o412,
            gridVisible: this.viewport.gridVisible,
            gridSize: this.viewport.gridSize,
            snapToGrid: this.viewport.snapToGrid
        };
        return p412;
    }
    private createNewDoc(l412: string): SchematicDocument {
        const m412: string = new Date().toISOString();
        const n412: SchematicMetadata = {
            author: '',
            createdAt: m412,
            modifiedAt: m412,
            description: '',
            gridSize: this.viewport.gridSize,
            units: 'mm',
            undoLimit: this.undoLimit
        };
        this.document = {
            id: IdUtil.generate('sch'),
            name: l412,
            version: '2.0',
            components: [],
            wires: [],
            nets: [],
            netLabels: [],
            subcircuits: [],
            metadata: n412
        };
        this.syncTopologyFromDoc();
        return this.document;
    }
    private syncTopologyFromDoc(): void {
        if (this.document !== null) {
            this.topology = TopologyPatchApplier.syncTopologyIncremental(this.document, this.topology);
            this.topology.probeList = SchematicEditorImpl.copyProbeList(this.probes);
            this.topology.busList = SchematicEditorImpl.copyBusList(this.buses);
        }
    }
    private normalizeDocument(i412: SchematicDocument): SchematicDocument {
        if (i412.netLabels === undefined) {
            i412.netLabels = [];
        }
        if (i412.subcircuits === undefined) {
            i412.subcircuits = [];
        }
        if (i412.annotations === undefined) {
            i412.annotations = [];
        }
        if (i412.probes === undefined) {
            i412.probes = [];
        }
        for (let k412 = 0; k412 < i412.wires.length; k412++) {
            if (i412.wires[k412].style === undefined) {
                i412.wires[k412].style = WireStyle.ORTHOGONAL;
            }
        }
        for (let j412 = 0; j412 < i412.components.length; j412++) {
            this.normalizeComponentValue(i412.components[j412]);
        }
        return i412;
    }
    private normalizeComponentValueStr(d412: string, e412: string): string {
        if (e412.length === 0)
            return e412;
        if (/[a-zµ]/i.test(e412))
            return e412;
        const f412 = d412.toUpperCase();
        let g412 = '';
        if (f412.startsWith('R_') || f412.includes('RESISTOR')) {
            g412 = f412.replace(/^(R_|RESISTOR_?)/i, '');
        }
        else if (f412.startsWith('C_') || f412.includes('CAP')) {
            g412 = f412.replace(/^(C_|CAP_?)/i, '');
        }
        else if (f412.startsWith('L_') || f412.includes('INDUCTOR')) {
            g412 = f412.replace(/^L_/i, '');
        }
        else {
            return e412;
        }
        const h412 = g412.match(/[a-zµ]+$/i);
        if (h412 === null)
            return e412;
        return e412 + h412[0];
    }
    private normalizeComponentValue(a412: ComponentInstance): void {
        const b412 = a412.parameters.get('value');
        if (b412 === undefined)
            return;
        const c412 = this.normalizeComponentValueStr(a412.libraryId, b412);
        if (c412 !== b412) {
            a412.parameters.set('value', c412);
        }
    }
    private rebuildRefDesCounters(): void {
        this.refDesCounters.clear();
        const t411: ComponentInstance[] = this.getDocument().components;
        for (let u411 = 0; u411 < t411.length; u411++) {
            const v411: ComponentInstance = t411[u411];
            const w411: RegExpMatchArray | null = v411.refDes.match(/^([A-Z?]+)(\d+)$/);
            if (w411 !== null) {
                const x411: string = w411[1].replace('?', 'U');
                const y411: number = parseInt(w411[2]);
                const z411: number = this.refDesCounters.get(x411) ?? 0;
                if (y411 > z411) {
                    this.refDesCounters.set(x411, y411);
                }
            }
        }
    }
    private getRefDesPrefix(s411: string): string {
        if (s411.startsWith('R_')) {
            return 'R';
        }
        if (s411.startsWith('C_')) {
            return 'C';
        }
        if (s411.startsWith('L_')) {
            return 'L';
        }
        if (s411.includes('LED')) {
            return 'D';
        }
        if (s411.includes('74HC') || s411.includes('CD')) {
            return 'U';
        }
        if (s411.includes('STM32') || s411.includes('AT89') || s411.includes('STC')) {
            return 'U';
        }
        if (s411.includes('OSCILLOSCOPE') || s411.includes('VIRTUAL')) {
            return 'X';
        }
        return 'U';
    }
    private findComponent(p411: string): ComponentInstance | undefined {
        const q411: ComponentInstance[] = this.getDocument().components;
        for (let r411 = 0; r411 < q411.length; r411++) {
            if (q411[r411].id === p411) {
                return q411[r411];
            }
        }
        return undefined;
    }
    private findBus(n411: string): BusInfo | undefined {
        for (let o411 = 0; o411 < this.buses.length; o411++) {
            if (this.buses[o411].busUuid === n411) {
                return this.buses[o411];
            }
        }
        return undefined;
    }
    private findProbe(l411: string): ProbeInfo | undefined {
        for (let m411 = 0; m411 < this.probes.length; m411++) {
            if (this.probes[m411].probeId === l411) {
                return this.probes[m411];
            }
        }
        return undefined;
    }
    private findAnnotation(j411: string): SchematicAnnotation | undefined {
        for (let k411 = 0; k411 < this.annotations.length; k411++) {
            if (this.annotations[k411].id === j411) {
                return this.annotations[k411];
            }
        }
        return undefined;
    }
    private findAnnotationIndex(h411: string): number {
        for (let i411 = 0; i411 < this.annotations.length; i411++) {
            if (this.annotations[i411].id === h411) {
                return i411;
            }
        }
        return -1;
    }
    private findNetByName(e411: SchematicDocument, f411: string): Net | undefined {
        for (let g411 = 0; g411 < e411.nets.length; g411++) {
            if (e411.nets[g411].name === f411) {
                return e411.nets[g411];
            }
        }
        return undefined;
    }
    private findNetById(b411: SchematicDocument, c411: string): Net | undefined {
        for (let d411 = 0; d411 < b411.nets.length; d411++) {
            if (b411.nets[d411].id === c411) {
                return b411.nets[d411];
            }
        }
        return undefined;
    }
    private findNetLabelByNetId(y410: string): NetLabel | undefined {
        const z410: NetLabel[] = this.getDocument().netLabels;
        for (let a411 = 0; a411 < z410.length; a411++) {
            if (z410[a411].netId === y410) {
                return z410[a411];
            }
        }
        return undefined;
    }
    private findSubcircuit(v410: string): SubcircuitRef | undefined {
        const w410: SubcircuitRef[] = this.getDocument().subcircuits;
        for (let x410 = 0; x410 < w410.length; x410++) {
            if (w410[x410].id === v410) {
                return w410[x410];
            }
        }
        return undefined;
    }
    private cloneDoc(q409: SchematicDocument): SchematicDocument {
        const r409: ComponentInstance[] = [];
        for (let s410 = 0; s410 < q409.components.length; s410++) {
            const t410 = q409.components[s410];
            const u410: ComponentInstance = {
                id: t410.id,
                libraryId: t410.libraryId,
                refDes: t410.refDes,
                name: t410.name,
                position: { x: t410.position.x, y: t410.position.y },
                rotation: t410.rotation,
                mirrored: t410.mirrored,
                x: t410.x,
                y: t410.y,
                parameters: new Map(t410.parameters),
                pinIds: t410.pinIds?.slice() ?? [],
                attributes: t410.attributes ? new Map(t410.attributes) : undefined,
                pinOverrides: t410.pinOverrides ? new Map(t410.pinOverrides) : undefined,
                subcircuitId: t410.subcircuitId
            };
            r409.push(u410);
        }
        const s409: Net[] = [];
        for (let p410 = 0; p410 < q409.nets.length; p410++) {
            const q410 = q409.nets[p410];
            const r410: Net = {
                id: q410.id,
                name: q410.name,
                type: q410.type,
                pinIds: q410.pinIds.slice(),
                busWidth: q410.busWidth,
                branchIndex: q410.branchIndex
            };
            s409.push(r410);
        }
        const t409: Wire[] = [];
        for (let k410 = 0; k410 < q409.wires.length; k410++) {
            const l410 = q409.wires[k410];
            const m410: Point2D[] = [];
            for (let o410 = 0; o410 < l410.points.length; o410++) {
                m410.push({ x: l410.points[o410].x, y: l410.points[o410].y });
            }
            const n410: Wire = {
                id: l410.id,
                netId: l410.netId,
                points: m410,
                style: l410.style
            };
            t409.push(n410);
        }
        const u409: NetLabel[] = [];
        for (let i410 = 0; i410 < q409.netLabels.length; i410++) {
            const j410 = q409.netLabels[i410];
            u409.push({
                id: j410.id,
                netId: j410.netId,
                text: j410.text,
                position: { x: j410.position.x, y: j410.position.y },
                global: j410.global
            });
        }
        const v409: SubcircuitRef[] = [];
        for (let h410 = 0; h410 < q409.subcircuits.length; h410++) {
            v409.push(q409.subcircuits[h410]);
        }
        const w409: SchematicAnnotation[] = [];
        const x409 = q409.annotations ?? [];
        for (let e410 = 0; e410 < x409.length; e410++) {
            const f410 = x409[e410];
            const g410: SchematicAnnotation = {
                id: f410.id,
                author: f410.author,
                text: f410.text,
                type: f410.type,
                status: f410.status,
                x: f410.x,
                y: f410.y,
                width: f410.width,
                height: f410.height,
                arrowEndX: f410.arrowEndX,
                arrowEndY: f410.arrowEndY,
                targetUuid: f410.targetUuid,
                targetKind: f410.targetKind,
                createdAt: f410.createdAt,
                updatedAt: f410.updatedAt
            };
            w409.push(g410);
        }
        const y409: ProbeMeta[] = [];
        const z409 = q409.probes ?? [];
        for (let c410 = 0; c410 < z409.length; c410++) {
            const d410 = z409[c410];
            y409.push({
                id: d410.id,
                netId: d410.netId,
                label: d410.label,
                color: d410.color
            });
        }
        let a410: SimulationConfig | undefined = undefined;
        if (q409.simulationConfig) {
            a410 = {
                mode: q409.simulationConfig.mode,
                startTime: q409.simulationConfig.startTime,
                stopTime: q409.simulationConfig.stopTime,
                stepSize: q409.simulationConfig.stepSize,
                maxStep: q409.simulationConfig.maxStep,
                temperature: q409.simulationConfig.temperature,
                convergence: q409.simulationConfig.convergence,
                mcuClockHz: q409.simulationConfig.mcuClockHz
            };
        }
        const b410: SchematicDocument = {
            id: q409.id,
            name: q409.name,
            version: q409.version,
            metadata: {
                author: q409.metadata.author,
                createdAt: q409.metadata.createdAt,
                modifiedAt: q409.metadata.modifiedAt,
                description: q409.metadata.description,
                gridSize: q409.metadata.gridSize,
                units: q409.metadata.units,
                undoLimit: q409.metadata.undoLimit
            },
            components: r409,
            nets: s409,
            wires: t409,
            netLabels: u409,
            subcircuits: v409,
            annotations: w409,
            probes: y409,
            simulationConfig: a410
        };
        return b410;
    }
    private notifyChange(): void {
        this.syncTopologyFromDoc();
        if (this.document !== null) {
            this.document.metadata.modifiedAt = new Date().toISOString();
        }
        Logger.info('schematic_editor', `拓扑变更: ${this.document?.components.length ?? 0} 器件`);
        EventBus.getInstance().publish({
            event: ModuleEvent.SCHEMATIC_CHANGED,
            source: 'schematic_editor',
            timestamp: Date.now(),
            data: this.getFullTopology()
        });
    }
    private publishViewport(): void {
        EventBus.getInstance().publish({
            event: ModuleEvent.VIEWPORT_CHANGED,
            source: 'schematic_editor',
            timestamp: Date.now(),
            data: this.viewport
        });
    }
    private publishAnnotationChange(): void {
        EventBus.getInstance().publish({
            event: ModuleEvent.ANNOTATION_CHANGED,
            source: 'schematic_editor',
            timestamp: Date.now(),
            data: this.annotations
        });
    }
}
