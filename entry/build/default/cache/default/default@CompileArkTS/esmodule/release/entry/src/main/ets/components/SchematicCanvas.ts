if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface SchematicCanvas_Params {
    canvasVersion?: number;
    selectedComponentId?: string;
    mouseX?: number;
    mouseY?: number;
    zoomPercent?: number;
    toolMode?: EditorToolMode;
    pendingLibraryId?: string;
    wireStartActive?: boolean;
    wireStartX?: number;
    wireStartY?: number;
    rulerVisible?: boolean;
    ercErrors?: ErcError[];
    onStatusChange?: (msg: string) => void;
    onDocumentChanged?: () => void;
    onCopySelected?: () => void;
    onDeleteSelected?: () => void;
    settings?: RenderingContextSettings;
    context?: CanvasRenderingContext2D;
    wireCtx?: CanvasRenderingContext2D;
    rulerHCtx?: CanvasRenderingContext2D;
    rulerVCtx?: CanvasRenderingContext2D;
    appService?: AppService;
    pointerDown?: boolean;
    dragComponentId?: string;
    dragStartPos?: Point2D;
    dragPreviewPos?: Point2D | null;
    lastPointerX?: number;
    lastPointerY?: number;
    downPointerX?: number;
    downPointerY?: number;
    viewWidth?: number;
    viewHeight?: number;
    canvasReady?: boolean;
    needsFitOnLayout?: boolean;
    redrawScheduled?: boolean;
    redrawTimer?: number;
    hoverComponentId?: string;
    hoverWireNetId?: string;
    contextMenuVisible?: boolean;
    contextMenuScreenX?: number;
    contextMenuScreenY?: number;
    previewWireEnd?: Point2D | null;
    placementPreview?: Point2D | null;
    isBoxSelecting?: boolean;
    boxSelectStart?: Point2D;
    boxSelectEnd?: Point2D;
    shiftHeld?: boolean;
    alignGuideX?: number | null;
    wireWaypoints?: Point2D[];
    alignGuideY?: number | null;
    dragBlocked?: boolean;
    lastDownTime?: number;
    lastUpTime?: number;
    middlePanning?: boolean;
    middlePanLastX?: number;
    middlePanLastY?: number;
    simFrameDirty?: boolean;
    backgroundDirty?: boolean;
    gridTile?: ImageData | null;
    gridTileKey?: string;
    gridTileWorldW?: number;
    gridTileWorldH?: number;
    compDefCache?: Map<string, ComponentDefinition | null>;
    juncCache?: Map<string, number> | null;
    juncCacheKey?: string;
    lastDocChangeVer?: number;
    rulerDirty?: boolean;
    cachedNodeVoltages?: Map<string, number>;
    isTouchActive?: boolean;
    touchCooldownTimer?: number;
    twoFingerPanning?: boolean;
    twoFingerLastMidX?: number;
    twoFingerLastMidY?: number;
    onSchematicChanged?;
    onViewportChanged?;
    onSimStep?;
    onSimulationStarted?;
}
import { AppService } from "@bundle:com.elecdraw.aischsim/entry/ets/services/AppService";
import { SchematicSymbolRenderer } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/SchematicSymbolRenderer";
import type { SymbolDrawStyle } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/SchematicSymbolRenderer";
import { ModuleEvent, EventBus, calcSymbolBounds, SimulationState, getPinNetMap, findNetForPinLabel } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchematicDocument, ComponentInstance, Wire, ViewportState, Point2D, WorldRect, Rect2D, ModuleEventPayload, ErcError } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SimulationKernelImpl } from 'simulation_kernel';
import type { ComponentDefinition } from 'component_library';
import { EditorToolMode } from "@bundle:com.elecdraw.aischsim/entry/ets/model/EditorToolMode";
import { ProteusColors, ProteusDimens, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import { ThemeManager } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ThemeManager";
import { SchematicLayerId } from "@bundle:com.elecdraw.aischsim/entry@schematic_editor/Index";
import type { SchematicEditorImpl } from "@bundle:com.elecdraw.aischsim/entry@schematic_editor/Index";
interface RgbColor {
    r: number;
    g: number;
    b: number;
}
export class SchematicCanvas extends ViewPU {
    constructor(t166, u166, v166, w166 = -1, x166 = undefined, y166) {
        super(t166, v166, w166, y166);
        if (typeof x166 === "function") {
            this.paramsGenerator_ = x166;
        }
        this.__canvasVersion = new SynchedPropertySimpleTwoWayPU(u166.canvasVersion, this, "canvasVersion");
        this.__selectedComponentId = new SynchedPropertySimpleTwoWayPU(u166.selectedComponentId, this, "selectedComponentId");
        this.__mouseX = new SynchedPropertySimpleTwoWayPU(u166.mouseX, this, "mouseX");
        this.__mouseY = new SynchedPropertySimpleTwoWayPU(u166.mouseY, this, "mouseY");
        this.__zoomPercent = new SynchedPropertySimpleTwoWayPU(u166.zoomPercent, this, "zoomPercent");
        this.__toolMode = new SynchedPropertySimpleTwoWayPU(u166.toolMode, this, "toolMode");
        this.__pendingLibraryId = new SynchedPropertySimpleTwoWayPU(u166.pendingLibraryId, this, "pendingLibraryId");
        this.__wireStartActive = new SynchedPropertySimpleTwoWayPU(u166.wireStartActive, this, "wireStartActive");
        this.__wireStartX = new SynchedPropertySimpleTwoWayPU(u166.wireStartX, this, "wireStartX");
        this.__wireStartY = new SynchedPropertySimpleTwoWayPU(u166.wireStartY, this, "wireStartY");
        this.__rulerVisible = new SynchedPropertySimpleOneWayPU(u166.rulerVisible, this, "rulerVisible");
        this.__ercErrors = new SynchedPropertyObjectOneWayPU(u166.ercErrors, this, "ercErrors");
        this.onStatusChange = () => { };
        this.onDocumentChanged = () => { };
        this.onCopySelected = () => { };
        this.onDeleteSelected = () => { };
        this.settings = new RenderingContextSettings(true);
        this.context = new CanvasRenderingContext2D(this.settings);
        this.wireCtx = new CanvasRenderingContext2D(this.settings);
        this.rulerHCtx = new CanvasRenderingContext2D(this.settings);
        this.rulerVCtx = new CanvasRenderingContext2D(this.settings);
        this.appService = AppService.getInstance();
        this.pointerDown = false;
        this.dragComponentId = '';
        this.dragStartPos = { x: 0, y: 0 };
        this.dragPreviewPos = null;
        this.lastPointerX = 0;
        this.lastPointerY = 0;
        this.downPointerX = 0;
        this.downPointerY = 0;
        this.viewWidth = 0;
        this.viewHeight = 0;
        this.canvasReady = false;
        this.needsFitOnLayout = true;
        this.redrawScheduled = false;
        this.redrawTimer = -1;
        this.__hoverComponentId = new ObservedPropertySimplePU('', this, "hoverComponentId");
        this.__hoverWireNetId = new ObservedPropertySimplePU('', this, "hoverWireNetId");
        this.__contextMenuVisible = new ObservedPropertySimplePU(false, this, "contextMenuVisible");
        this.__contextMenuScreenX = new ObservedPropertySimplePU(0, this, "contextMenuScreenX");
        this.__contextMenuScreenY = new ObservedPropertySimplePU(0, this, "contextMenuScreenY");
        this.__previewWireEnd = new ObservedPropertyObjectPU(null, this, "previewWireEnd");
        this.__placementPreview = new ObservedPropertyObjectPU(null, this, "placementPreview");
        this.isBoxSelecting = false;
        this.boxSelectStart = { x: 0, y: 0 };
        this.boxSelectEnd = { x: 0, y: 0 };
        this.shiftHeld = false;
        this.alignGuideX = null;
        this.wireWaypoints = [];
        this.alignGuideY = null;
        this.dragBlocked = false;
        this.lastDownTime = 0;
        this.lastUpTime = 0;
        this.middlePanning = false;
        this.middlePanLastX = 0;
        this.middlePanLastY = 0;
        this.simFrameDirty = false;
        this.backgroundDirty = true;
        this.gridTile = null;
        this.gridTileKey = '';
        this.gridTileWorldW = 0;
        this.gridTileWorldH = 0;
        this.compDefCache = new Map();
        this.juncCache = null;
        this.juncCacheKey = '';
        this.lastDocChangeVer = -1;
        this.rulerDirty = true;
        this.cachedNodeVoltages = new Map();
        this.isTouchActive = false;
        this.touchCooldownTimer = -1;
        this.twoFingerPanning = false;
        this.twoFingerLastMidX = 0;
        this.twoFingerLastMidY = 0;
        this.onSchematicChanged = (c167: ModuleEventPayload): void => {
            this.backgroundDirty = true;
            this.invalidateJuncCache();
            this.compDefCache.clear();
            this.cachedNodeVoltages.clear();
            this.lastDocChangeVer++;
            this.rulerDirty = true;
            this.scheduleRedraw();
            this.onDocumentChanged();
        };
        this.onViewportChanged = (b167: ModuleEventPayload): void => {
            this.backgroundDirty = true;
            this.rulerDirty = true;
            this.scheduleRedraw();
            this.zoomPercent = Math.round(this.appService.schematicEditor.getZoom() * 100);
        };
        this.onSimStep = (a167: ModuleEventPayload): void => {
            this.simFrameDirty = true;
            this.scheduleRedraw();
        };
        this.onSimulationStarted = (z166: ModuleEventPayload): void => {
            this.blockWireEditing();
            if (this.toolMode === EditorToolMode.WIRE || this.toolMode === EditorToolMode.BUS) {
                this.toolMode = EditorToolMode.SELECT;
            }
            this.scheduleRedraw();
        };
        this.setInitiallyProvidedValue(u166);
        this.declareWatch("canvasVersion", this.onCanvasVersionChange);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(s166: SchematicCanvas_Params) {
        if (s166.rulerVisible === undefined) {
            this.__rulerVisible.set(true);
        }
        if (s166.ercErrors === undefined) {
            this.__ercErrors.set([]);
        }
        if (s166.onStatusChange !== undefined) {
            this.onStatusChange = s166.onStatusChange;
        }
        if (s166.onDocumentChanged !== undefined) {
            this.onDocumentChanged = s166.onDocumentChanged;
        }
        if (s166.onCopySelected !== undefined) {
            this.onCopySelected = s166.onCopySelected;
        }
        if (s166.onDeleteSelected !== undefined) {
            this.onDeleteSelected = s166.onDeleteSelected;
        }
        if (s166.settings !== undefined) {
            this.settings = s166.settings;
        }
        if (s166.context !== undefined) {
            this.context = s166.context;
        }
        if (s166.wireCtx !== undefined) {
            this.wireCtx = s166.wireCtx;
        }
        if (s166.rulerHCtx !== undefined) {
            this.rulerHCtx = s166.rulerHCtx;
        }
        if (s166.rulerVCtx !== undefined) {
            this.rulerVCtx = s166.rulerVCtx;
        }
        if (s166.appService !== undefined) {
            this.appService = s166.appService;
        }
        if (s166.pointerDown !== undefined) {
            this.pointerDown = s166.pointerDown;
        }
        if (s166.dragComponentId !== undefined) {
            this.dragComponentId = s166.dragComponentId;
        }
        if (s166.dragStartPos !== undefined) {
            this.dragStartPos = s166.dragStartPos;
        }
        if (s166.dragPreviewPos !== undefined) {
            this.dragPreviewPos = s166.dragPreviewPos;
        }
        if (s166.lastPointerX !== undefined) {
            this.lastPointerX = s166.lastPointerX;
        }
        if (s166.lastPointerY !== undefined) {
            this.lastPointerY = s166.lastPointerY;
        }
        if (s166.downPointerX !== undefined) {
            this.downPointerX = s166.downPointerX;
        }
        if (s166.downPointerY !== undefined) {
            this.downPointerY = s166.downPointerY;
        }
        if (s166.viewWidth !== undefined) {
            this.viewWidth = s166.viewWidth;
        }
        if (s166.viewHeight !== undefined) {
            this.viewHeight = s166.viewHeight;
        }
        if (s166.canvasReady !== undefined) {
            this.canvasReady = s166.canvasReady;
        }
        if (s166.needsFitOnLayout !== undefined) {
            this.needsFitOnLayout = s166.needsFitOnLayout;
        }
        if (s166.redrawScheduled !== undefined) {
            this.redrawScheduled = s166.redrawScheduled;
        }
        if (s166.redrawTimer !== undefined) {
            this.redrawTimer = s166.redrawTimer;
        }
        if (s166.hoverComponentId !== undefined) {
            this.hoverComponentId = s166.hoverComponentId;
        }
        if (s166.hoverWireNetId !== undefined) {
            this.hoverWireNetId = s166.hoverWireNetId;
        }
        if (s166.contextMenuVisible !== undefined) {
            this.contextMenuVisible = s166.contextMenuVisible;
        }
        if (s166.contextMenuScreenX !== undefined) {
            this.contextMenuScreenX = s166.contextMenuScreenX;
        }
        if (s166.contextMenuScreenY !== undefined) {
            this.contextMenuScreenY = s166.contextMenuScreenY;
        }
        if (s166.previewWireEnd !== undefined) {
            this.previewWireEnd = s166.previewWireEnd;
        }
        if (s166.placementPreview !== undefined) {
            this.placementPreview = s166.placementPreview;
        }
        if (s166.isBoxSelecting !== undefined) {
            this.isBoxSelecting = s166.isBoxSelecting;
        }
        if (s166.boxSelectStart !== undefined) {
            this.boxSelectStart = s166.boxSelectStart;
        }
        if (s166.boxSelectEnd !== undefined) {
            this.boxSelectEnd = s166.boxSelectEnd;
        }
        if (s166.shiftHeld !== undefined) {
            this.shiftHeld = s166.shiftHeld;
        }
        if (s166.alignGuideX !== undefined) {
            this.alignGuideX = s166.alignGuideX;
        }
        if (s166.wireWaypoints !== undefined) {
            this.wireWaypoints = s166.wireWaypoints;
        }
        if (s166.alignGuideY !== undefined) {
            this.alignGuideY = s166.alignGuideY;
        }
        if (s166.dragBlocked !== undefined) {
            this.dragBlocked = s166.dragBlocked;
        }
        if (s166.lastDownTime !== undefined) {
            this.lastDownTime = s166.lastDownTime;
        }
        if (s166.lastUpTime !== undefined) {
            this.lastUpTime = s166.lastUpTime;
        }
        if (s166.middlePanning !== undefined) {
            this.middlePanning = s166.middlePanning;
        }
        if (s166.middlePanLastX !== undefined) {
            this.middlePanLastX = s166.middlePanLastX;
        }
        if (s166.middlePanLastY !== undefined) {
            this.middlePanLastY = s166.middlePanLastY;
        }
        if (s166.simFrameDirty !== undefined) {
            this.simFrameDirty = s166.simFrameDirty;
        }
        if (s166.backgroundDirty !== undefined) {
            this.backgroundDirty = s166.backgroundDirty;
        }
        if (s166.gridTile !== undefined) {
            this.gridTile = s166.gridTile;
        }
        if (s166.gridTileKey !== undefined) {
            this.gridTileKey = s166.gridTileKey;
        }
        if (s166.gridTileWorldW !== undefined) {
            this.gridTileWorldW = s166.gridTileWorldW;
        }
        if (s166.gridTileWorldH !== undefined) {
            this.gridTileWorldH = s166.gridTileWorldH;
        }
        if (s166.compDefCache !== undefined) {
            this.compDefCache = s166.compDefCache;
        }
        if (s166.juncCache !== undefined) {
            this.juncCache = s166.juncCache;
        }
        if (s166.juncCacheKey !== undefined) {
            this.juncCacheKey = s166.juncCacheKey;
        }
        if (s166.lastDocChangeVer !== undefined) {
            this.lastDocChangeVer = s166.lastDocChangeVer;
        }
        if (s166.rulerDirty !== undefined) {
            this.rulerDirty = s166.rulerDirty;
        }
        if (s166.cachedNodeVoltages !== undefined) {
            this.cachedNodeVoltages = s166.cachedNodeVoltages;
        }
        if (s166.isTouchActive !== undefined) {
            this.isTouchActive = s166.isTouchActive;
        }
        if (s166.touchCooldownTimer !== undefined) {
            this.touchCooldownTimer = s166.touchCooldownTimer;
        }
        if (s166.twoFingerPanning !== undefined) {
            this.twoFingerPanning = s166.twoFingerPanning;
        }
        if (s166.twoFingerLastMidX !== undefined) {
            this.twoFingerLastMidX = s166.twoFingerLastMidX;
        }
        if (s166.twoFingerLastMidY !== undefined) {
            this.twoFingerLastMidY = s166.twoFingerLastMidY;
        }
        if (s166.onSchematicChanged !== undefined) {
            this.onSchematicChanged = s166.onSchematicChanged;
        }
        if (s166.onViewportChanged !== undefined) {
            this.onViewportChanged = s166.onViewportChanged;
        }
        if (s166.onSimStep !== undefined) {
            this.onSimStep = s166.onSimStep;
        }
        if (s166.onSimulationStarted !== undefined) {
            this.onSimulationStarted = s166.onSimulationStarted;
        }
    }
    updateStateVars(r166: SchematicCanvas_Params) {
        this.__rulerVisible.reset(r166.rulerVisible);
        this.__ercErrors.reset(r166.ercErrors);
    }
    purgeVariableDependenciesOnElmtId(q166) {
        this.__canvasVersion.purgeDependencyOnElmtId(q166);
        this.__selectedComponentId.purgeDependencyOnElmtId(q166);
        this.__mouseX.purgeDependencyOnElmtId(q166);
        this.__mouseY.purgeDependencyOnElmtId(q166);
        this.__zoomPercent.purgeDependencyOnElmtId(q166);
        this.__toolMode.purgeDependencyOnElmtId(q166);
        this.__pendingLibraryId.purgeDependencyOnElmtId(q166);
        this.__wireStartActive.purgeDependencyOnElmtId(q166);
        this.__wireStartX.purgeDependencyOnElmtId(q166);
        this.__wireStartY.purgeDependencyOnElmtId(q166);
        this.__rulerVisible.purgeDependencyOnElmtId(q166);
        this.__ercErrors.purgeDependencyOnElmtId(q166);
        this.__hoverComponentId.purgeDependencyOnElmtId(q166);
        this.__hoverWireNetId.purgeDependencyOnElmtId(q166);
        this.__contextMenuVisible.purgeDependencyOnElmtId(q166);
        this.__contextMenuScreenX.purgeDependencyOnElmtId(q166);
        this.__contextMenuScreenY.purgeDependencyOnElmtId(q166);
        this.__previewWireEnd.purgeDependencyOnElmtId(q166);
        this.__placementPreview.purgeDependencyOnElmtId(q166);
    }
    aboutToBeDeleted() {
        this.__canvasVersion.aboutToBeDeleted();
        this.__selectedComponentId.aboutToBeDeleted();
        this.__mouseX.aboutToBeDeleted();
        this.__mouseY.aboutToBeDeleted();
        this.__zoomPercent.aboutToBeDeleted();
        this.__toolMode.aboutToBeDeleted();
        this.__pendingLibraryId.aboutToBeDeleted();
        this.__wireStartActive.aboutToBeDeleted();
        this.__wireStartX.aboutToBeDeleted();
        this.__wireStartY.aboutToBeDeleted();
        this.__rulerVisible.aboutToBeDeleted();
        this.__ercErrors.aboutToBeDeleted();
        this.__hoverComponentId.aboutToBeDeleted();
        this.__hoverWireNetId.aboutToBeDeleted();
        this.__contextMenuVisible.aboutToBeDeleted();
        this.__contextMenuScreenX.aboutToBeDeleted();
        this.__contextMenuScreenY.aboutToBeDeleted();
        this.__previewWireEnd.aboutToBeDeleted();
        this.__placementPreview.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __canvasVersion: SynchedPropertySimpleTwoWayPU<number>;
    get canvasVersion() {
        return this.__canvasVersion.get();
    }
    set canvasVersion(p166: number) {
        this.__canvasVersion.set(p166);
    }
    private __selectedComponentId: SynchedPropertySimpleTwoWayPU<string>;
    get selectedComponentId() {
        return this.__selectedComponentId.get();
    }
    set selectedComponentId(o166: string) {
        this.__selectedComponentId.set(o166);
    }
    private __mouseX: SynchedPropertySimpleTwoWayPU<number>;
    get mouseX() {
        return this.__mouseX.get();
    }
    set mouseX(n166: number) {
        this.__mouseX.set(n166);
    }
    private __mouseY: SynchedPropertySimpleTwoWayPU<number>;
    get mouseY() {
        return this.__mouseY.get();
    }
    set mouseY(m166: number) {
        this.__mouseY.set(m166);
    }
    private __zoomPercent: SynchedPropertySimpleTwoWayPU<number>;
    get zoomPercent() {
        return this.__zoomPercent.get();
    }
    set zoomPercent(l166: number) {
        this.__zoomPercent.set(l166);
    }
    private __toolMode: SynchedPropertySimpleTwoWayPU<EditorToolMode>;
    get toolMode() {
        return this.__toolMode.get();
    }
    set toolMode(k166: EditorToolMode) {
        this.__toolMode.set(k166);
    }
    private __pendingLibraryId: SynchedPropertySimpleTwoWayPU<string>;
    get pendingLibraryId() {
        return this.__pendingLibraryId.get();
    }
    set pendingLibraryId(j166: string) {
        this.__pendingLibraryId.set(j166);
    }
    private __wireStartActive: SynchedPropertySimpleTwoWayPU<boolean>;
    get wireStartActive() {
        return this.__wireStartActive.get();
    }
    set wireStartActive(i166: boolean) {
        this.__wireStartActive.set(i166);
    }
    private __wireStartX: SynchedPropertySimpleTwoWayPU<number>;
    get wireStartX() {
        return this.__wireStartX.get();
    }
    set wireStartX(h166: number) {
        this.__wireStartX.set(h166);
    }
    private __wireStartY: SynchedPropertySimpleTwoWayPU<number>;
    get wireStartY() {
        return this.__wireStartY.get();
    }
    set wireStartY(g166: number) {
        this.__wireStartY.set(g166);
    }
    private __rulerVisible: SynchedPropertySimpleOneWayPU<boolean>;
    get rulerVisible() {
        return this.__rulerVisible.get();
    }
    set rulerVisible(f166: boolean) {
        this.__rulerVisible.set(f166);
    }
    private __ercErrors: SynchedPropertySimpleOneWayPU<ErcError[]>;
    get ercErrors() {
        return this.__ercErrors.get();
    }
    set ercErrors(e166: ErcError[]) {
        this.__ercErrors.set(e166);
    }
    private onStatusChange: (msg: string) => void;
    private onDocumentChanged: () => void;
    private onCopySelected: () => void;
    private onDeleteSelected: () => void;
    private settings: RenderingContextSettings;
    private context: CanvasRenderingContext2D;
    private wireCtx: CanvasRenderingContext2D;
    private rulerHCtx: CanvasRenderingContext2D;
    private rulerVCtx: CanvasRenderingContext2D;
    private appService: AppService;
    private pointerDown: boolean;
    private dragComponentId: string;
    private dragStartPos: Point2D;
    private dragPreviewPos: Point2D | null;
    private lastPointerX: number;
    private lastPointerY: number;
    private downPointerX: number;
    private downPointerY: number;
    private viewWidth: number;
    private viewHeight: number;
    private canvasReady: boolean;
    private needsFitOnLayout: boolean;
    private redrawScheduled: boolean;
    private redrawTimer: number;
    private __hoverComponentId: ObservedPropertySimplePU<string>;
    get hoverComponentId() {
        return this.__hoverComponentId.get();
    }
    set hoverComponentId(d166: string) {
        this.__hoverComponentId.set(d166);
    }
    private __hoverWireNetId: ObservedPropertySimplePU<string>;
    get hoverWireNetId() {
        return this.__hoverWireNetId.get();
    }
    set hoverWireNetId(c166: string) {
        this.__hoverWireNetId.set(c166);
    }
    private __contextMenuVisible: ObservedPropertySimplePU<boolean>;
    get contextMenuVisible() {
        return this.__contextMenuVisible.get();
    }
    set contextMenuVisible(b166: boolean) {
        this.__contextMenuVisible.set(b166);
    }
    private __contextMenuScreenX: ObservedPropertySimplePU<number>;
    get contextMenuScreenX() {
        return this.__contextMenuScreenX.get();
    }
    set contextMenuScreenX(a166: number) {
        this.__contextMenuScreenX.set(a166);
    }
    private __contextMenuScreenY: ObservedPropertySimplePU<number>;
    get contextMenuScreenY() {
        return this.__contextMenuScreenY.get();
    }
    set contextMenuScreenY(z165: number) {
        this.__contextMenuScreenY.set(z165);
    }
    private __previewWireEnd: ObservedPropertyObjectPU<Point2D | null>;
    get previewWireEnd() {
        return this.__previewWireEnd.get();
    }
    set previewWireEnd(y165: Point2D | null) {
        this.__previewWireEnd.set(y165);
    }
    private __placementPreview: ObservedPropertyObjectPU<Point2D | null>;
    get placementPreview() {
        return this.__placementPreview.get();
    }
    set placementPreview(x165: Point2D | null) {
        this.__placementPreview.set(x165);
    }
    private isBoxSelecting: boolean;
    private boxSelectStart: Point2D;
    private boxSelectEnd: Point2D;
    private shiftHeld: boolean;
    private alignGuideX: number | null;
    private wireWaypoints: Point2D[];
    private alignGuideY: number | null;
    private dragBlocked: boolean;
    private lastDownTime: number;
    private lastUpTime: number;
    private middlePanning: boolean;
    private middlePanLastX: number;
    private middlePanLastY: number;
    private simFrameDirty: boolean;
    private backgroundDirty: boolean;
    private gridTile: ImageData | null;
    private gridTileKey: string;
    private gridTileWorldW: number;
    private gridTileWorldH: number;
    private compDefCache: Map<string, ComponentDefinition | null>;
    private juncCache: Map<string, number> | null;
    private juncCacheKey: string;
    private lastDocChangeVer: number;
    private rulerDirty: boolean;
    private cachedNodeVoltages: Map<string, number>;
    private isTouchActive: boolean;
    private touchCooldownTimer: number;
    private twoFingerPanning: boolean;
    private twoFingerLastMidX: number;
    private twoFingerLastMidY: number;
    private static readonly TAP_SLOP: number = 12;
    private static readonly MOVE_THRESHOLD: number = 8;
    private static readonly REDRAW_INTERVAL_MS: number = 32;
    private static readonly ALIGN_THRESHOLD: number = 6;
    aboutToAppear(): void {
        EventBus.getInstance().subscribe(ModuleEvent.SCHEMATIC_CHANGED, this.onSchematicChanged);
        EventBus.getInstance().subscribe(ModuleEvent.VIEWPORT_CHANGED, this.onViewportChanged);
        EventBus.getInstance().subscribe(ModuleEvent.SIMULATION_STEP, this.onSimStep);
        EventBus.getInstance().subscribe(ModuleEvent.SIMULATION_STARTED, this.onSimulationStarted);
        setTimeout(() => {
            this.ensureLayoutRedraw('startup');
        }, 120);
        setTimeout(() => {
            this.ensureLayoutRedraw('startup-late');
        }, 400);
    }
    aboutToDisappear(): void {
        EventBus.getInstance().unsubscribe(ModuleEvent.SCHEMATIC_CHANGED, this.onSchematicChanged);
        EventBus.getInstance().unsubscribe(ModuleEvent.VIEWPORT_CHANGED, this.onViewportChanged);
        EventBus.getInstance().unsubscribe(ModuleEvent.SIMULATION_STEP, this.onSimStep);
        EventBus.getInstance().unsubscribe(ModuleEvent.SIMULATION_STARTED, this.onSimulationStarted);
        if (this.redrawTimer >= 0) {
            clearTimeout(this.redrawTimer);
            this.redrawTimer = -1;
        }
        this.clearTouchCooldown();
        this.compDefCache.clear();
    }
    onCanvasVersionChange(): void {
        this.backgroundDirty = true;
        this.rulerDirty = true;
        this.scheduleRedraw();
    }
    private invalidateJuncCache(): void {
        this.juncCache = null;
        this.juncCacheKey = '';
    }
    private onSchematicChanged;
    private onViewportChanged;
    private onSimStep;
    private onSimulationStarted;
    private scheduleRedraw(): void {
        if (this.viewWidth <= 0 || this.viewHeight <= 0) {
            return;
        }
        if (this.redrawScheduled) {
            return;
        }
        this.redrawScheduled = true;
        this.redrawTimer = setTimeout(() => {
            this.redrawScheduled = false;
            this.redrawTimer = -1;
            this.redraw();
        }, SchematicCanvas.REDRAW_INTERVAL_MS);
    }
    private forceFullRedraw(w165: string = ''): void {
        if (this.viewWidth <= 0 || this.viewHeight <= 0) {
            return;
        }
        if (this.redrawTimer >= 0) {
            clearTimeout(this.redrawTimer);
            this.redrawTimer = -1;
        }
        this.redrawScheduled = false;
        this.backgroundDirty = true;
        this.rulerDirty = true;
        this.redraw();
    }
    private ensureLayoutRedraw(v165: string): void {
        if (this.viewWidth > 0 && this.viewHeight > 0) {
            this.forceFullRedraw(v165);
        }
    }
    private onCanvasAreaChange(n165: Area): void {
        const o165 = Math.max(0, Math.floor(n165.width as number));
        const p165 = Math.max(0, Math.floor(n165.height as number));
        if (o165 <= 0 || p165 <= 0) {
            return;
        }
        const q165 = this.viewWidth;
        const r165 = this.viewHeight;
        const s165 = Math.abs(o165 - q165) > 0.5 || Math.abs(p165 - r165) > 0.5;
        const t165 = q165 <= 0 || r165 <= 0;
        this.viewWidth = o165;
        this.viewHeight = p165;
        (this.appService.schematicEditor as SchematicEditorImpl).setCanvasViewSize(o165, p165);
        if (s165 || !this.canvasReady) {
            this.canvasReady = true;
            this.forceFullRedraw('areaChange');
            const u165 = !t165 && (o165 - q165 > 64 || p165 - r165 > 64);
            if (this.needsFitOnLayout || t165 || u165) {
                this.needsFitOnLayout = false;
                this.appService.schematicEditor.fitAllInView();
                this.scheduleRedraw();
            }
        }
    }
    private getWireStart(): Point2D | null {
        if (!this.wireStartActive) {
            return null;
        }
        return { x: this.wireStartX, y: this.wireStartY };
    }
    private setWireStart(m165: Point2D | null): void {
        if (m165 === null) {
            this.wireStartActive = false;
            this.wireStartX = 0;
            this.wireStartY = 0;
        }
        else {
            this.wireStartActive = true;
            this.wireStartX = m165.x;
            this.wireStartY = m165.y;
        }
    }
    initialRender() {
        this.observeComponentCreation2((k165, l165) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
        }, Column);
        this.observeComponentCreation2((c165, d165) => {
            If.create();
            if (this.rulerVisible) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((i165, j165) => {
                        Row.create();
                        Row.width('100%');
                    }, Row);
                    this.observeComponentCreation2((g165, h165) => {
                        Column.create();
                        Column.width(ProteusDimens.RULER_SIZE);
                        Column.height(ProteusDimens.RULER_SIZE);
                        Column.backgroundColor(ProteusColors.PANEL_TITLE_BG);
                        Column.border({ width: { right: 1, bottom: 1 }, color: ProteusColors.DIVIDER });
                    }, Column);
                    Column.pop();
                    this.observeComponentCreation2((e165, f165) => {
                        Canvas.create(this.rulerHCtx);
                        Canvas.layoutWeight(1);
                        Canvas.height(ProteusDimens.RULER_SIZE);
                        Canvas.backgroundColor(ProteusColors.CANVAS_BG);
                        Canvas.border({ width: { bottom: 1 }, color: ProteusColors.DIVIDER });
                        Canvas.onReady(() => this.drawHRuler());
                    }, Canvas);
                    Canvas.pop();
                    Row.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((a165, b165) => {
            Row.create();
            Row.layoutWeight(1);
            Row.width('100%');
        }, Row);
        this.observeComponentCreation2((w164, x164) => {
            If.create();
            if (this.rulerVisible) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((y164, z164) => {
                        Canvas.create(this.rulerVCtx);
                        Canvas.width(ProteusDimens.RULER_SIZE);
                        Canvas.height('100%');
                        Canvas.backgroundColor(ProteusColors.CANVAS_BG);
                        Canvas.border({ width: { right: 1 }, color: ProteusColors.DIVIDER });
                        Canvas.onReady(() => this.drawVRuler());
                    }, Canvas);
                    Canvas.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((u164, v164) => {
            Stack.create();
            Stack.layoutWeight(1);
            Stack.height('100%');
        }, Stack);
        this.observeComponentCreation2((l164, m164) => {
            Canvas.create(this.context);
            Canvas.width('100%');
            Canvas.height('100%');
            Canvas.backgroundColor(ProteusColors.CANVAS_BG);
            Canvas.hitTestBehavior(HitTestMode.Block);
            Canvas.focusable(true);
            Canvas.onReady(() => {
                if (this.viewWidth > 0 && this.viewHeight > 0) {
                    this.fullRedraw();
                }
            });
            Canvas.onAreaChange((s164, t164) => {
                this.onCanvasAreaChange(t164);
            });
            Canvas.onTouch((r164: TouchEvent) => this.handleTouch(r164));
            Canvas.onMouse((q164: MouseEvent) => this.handleMouse(q164));
            Canvas.onKeyEvent((p164: KeyEvent) => {
                if (p164.type === KeyType.Down && p164.keyCode === 27) {
                    this.wireWaypoints = [];
                    this.clearSelection();
                    return true;
                }
                return false;
            });
            globalThis.Gesture.create(GesturePriority.Low);
            PinchGesture.create();
            PinchGesture.onActionUpdate((n164: GestureEvent) => {
                const o164 = this.appService.schematicEditor;
                o164.setZoom(o164.getZoom() * n164.scale);
                this.scheduleRedraw();
            });
            PinchGesture.pop();
            globalThis.Gesture.pop();
        }, Canvas);
        Canvas.pop();
        this.observeComponentCreation2((j164, k164) => {
            Canvas.create(this.wireCtx);
            Canvas.width('100%');
            Canvas.height('100%');
            Canvas.hitTestBehavior(HitTestMode.Transparent);
        }, Canvas);
        Canvas.pop();
        this.observeComponentCreation2((b164, c164) => {
            If.create();
            if (this.contextMenuVisible) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((h164, i164) => {
                        Column.create({ space: 4 });
                        Column.padding(6);
                        Column.backgroundColor(ProteusColors.PANEL_TITLE_BG);
                        Column.border({ width: 1, color: ProteusColors.DIVIDER });
                        Column.borderRadius(6);
                        Column.shadow({ radius: 8, color: '#40000000', offsetX: 2, offsetY: 2 });
                        Column.position({ x: this.contextMenuScreenX, y: this.contextMenuScreenY });
                        Column.zIndex(20);
                    }, Column);
                    this.observeComponentCreation2((f164, g164) => {
                        Button.createWithLabel('复制');
                        Button.type(ButtonType.Normal);
                        Button.fontSize(13);
                        Button.height(32);
                        Button.width(96);
                        Button.onClick(() => {
                            this.contextMenuVisible = false;
                            this.onCopySelected();
                        });
                    }, Button);
                    Button.pop();
                    this.observeComponentCreation2((d164, e164) => {
                        Button.createWithLabel('删除');
                        Button.type(ButtonType.Normal);
                        Button.fontSize(13);
                        Button.height(32);
                        Button.width(96);
                        Button.onClick(() => {
                            this.contextMenuVisible = false;
                            this.onDeleteSelected();
                        });
                    }, Button);
                    Button.pop();
                    Column.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        Stack.pop();
        Row.pop();
        Column.pop();
    }
    private handleMouse(v163: MouseEvent): void {
        if (v163.action === MouseAction.Move) {
            const w163 = this.screenToWorld(v163.x, v163.y);
            this.updateMouseCoord(w163);
            if (this.middlePanning) {
                const z163 = v163.x - this.middlePanLastX;
                const a164 = v163.y - this.middlePanLastY;
                this.middlePanLastX = v163.x;
                this.middlePanLastY = v163.y;
                this.appService.schematicEditor.panBy(z163, a164);
                this.scheduleRedraw();
                return;
            }
            this.onPointerMove(v163.x, v163.y);
            if (this.isSelectMode()) {
                const x163 = this.hoverComponentId;
                const y163 = this.hoverWireNetId;
                this.updateHover(w163);
                if (x163 !== this.hoverComponentId || y163 !== this.hoverWireNetId) {
                    this.scheduleRedraw();
                }
            }
            if (this.toolMode === EditorToolMode.PLACE && this.pendingLibraryId.length > 0) {
                this.placementPreview = w163;
                this.scheduleRedraw();
            }
        }
        if (v163.action === MouseAction.Press) {
            if (this.isTouchActive)
                return;
            if (v163.button === 2) {
                this.contextMenuScreenX = v163.x;
                this.contextMenuScreenY = v163.y;
                this.handleRightClick();
                return;
            }
            if (v163.button === 1) {
                this.middlePanning = true;
                this.middlePanLastX = v163.x;
                this.middlePanLastY = v163.y;
                return;
            }
            this.onPointerDown(v163.x, v163.y);
        }
        else if (v163.action === MouseAction.Release) {
            if (this.isTouchActive)
                return;
            if (v163.button === 2) {
                return;
            }
            if (v163.button === 1) {
                this.middlePanning = false;
                return;
            }
            this.onPointerUp(v163.x, v163.y);
        }
    }
    private clearSelection(): void {
        this.selectedComponentId = '';
        this.dragComponentId = '';
        this.dragPreviewPos = null;
        this.dragBlocked = false;
        this.toolMode = EditorToolMode.SELECT;
        this.appService.schematicEditor.setSelection([]);
        this.setWireStart(null);
        this.wireWaypoints = [];
        this.previewWireEnd = null;
        this.scheduleRedraw();
        this.onStatusChange('已取消选择');
    }
    private handleRightClick(): void {
        this.contextMenuVisible = false;
        if (this.toolMode === EditorToolMode.PLACE) {
            this.pendingLibraryId = '';
            this.placementPreview = null;
            this.toolMode = EditorToolMode.SELECT;
            this.onStatusChange('取消放置');
            this.scheduleRedraw();
            return;
        }
        if (this.wireWaypoints.length > 0 || this.wireStartActive) {
            this.wireWaypoints = [];
            this.setWireStart(null);
            this.previewWireEnd = null;
            this.onStatusChange('取消布线');
            this.scheduleRedraw();
            return;
        }
        const t163 = this.appService.schematicEditor.getSelectedDevices();
        const u163 = this.appService.schematicEditor.getSelectedNets();
        if (t163.length > 0 || u163.length > 0) {
            this.contextMenuVisible = true;
            return;
        }
        this.clearSelection();
    }
    private isSelectMode(): boolean {
        return this.toolMode === EditorToolMode.SELECT;
    }
    private isTapSlop(r163: number, s163: number): boolean {
        return Math.abs(r163) <= SchematicCanvas.TAP_SLOP && Math.abs(s163) <= SchematicCanvas.TAP_SLOP;
    }
    private tryPlaceComponent(n163: Point2D): boolean {
        if (this.pendingLibraryId.length === 0) {
            this.onStatusChange('请先在左侧库中点击选择器件');
            return false;
        }
        const o163 = this.appService.componentLibrary.resolveLibraryId(this.pendingLibraryId);
        const p163 = this.appService.schematicEditor.placeComponent(o163, n163);
        if (p163.success && p163.data) {
            this.selectedComponentId = p163.data.id;
            this.appService.schematicEditor.setSelection([p163.data.id]);
            const q163 = o163.toUpperCase();
            if (q163 === 'VCC' || q163.endsWith('/VCC')) {
                this.onStatusChange(`已放置 VCC — 请从下方橙色引脚连线；选中后在 Props 修改 voltage`);
            }
            else if (q163 === 'GND' || q163.endsWith('/GND')) {
                this.onStatusChange(`已放置 GND — 请从上方引脚连线`);
            }
            else {
                this.onStatusChange(`已放置 ${o163} @ (${Math.round(n163.x)}, ${Math.round(n163.y)})`);
            }
            return true;
        }
        this.onStatusChange(`放置失败: ${p163.error ?? ''}`);
        return false;
    }
    private handleTouch(f163: TouchEvent): void {
        const g163 = f163.touches.length;
        if (g163 >= 2) {
            if (f163.type === TouchType.Down || (f163.type === TouchType.Move && !this.twoFingerPanning)) {
                this.twoFingerPanning = true;
                this.twoFingerLastMidX = (f163.touches[0].x + f163.touches[1].x) / 2;
                this.twoFingerLastMidY = (f163.touches[0].y + f163.touches[1].y) / 2;
                if (this.pointerDown) {
                    this.cancelPointerInteraction();
                }
                return;
            }
            if (f163.type === TouchType.Move && this.twoFingerPanning) {
                const j163 = (f163.touches[0].x + f163.touches[1].x) / 2;
                const k163 = (f163.touches[0].y + f163.touches[1].y) / 2;
                const l163 = j163 - this.twoFingerLastMidX;
                const m163 = k163 - this.twoFingerLastMidY;
                this.twoFingerLastMidX = j163;
                this.twoFingerLastMidY = k163;
                if (this.dragComponentId.length === 0) {
                    this.appService.schematicEditor.panBy(l163, m163);
                    this.scheduleRedraw();
                }
                return;
            }
            if (f163.type === TouchType.Up || f163.type === TouchType.Cancel) {
                if (f163.touches.length <= 1) {
                    this.twoFingerPanning = false;
                }
                return;
            }
            return;
        }
        if (this.twoFingerPanning)
            return;
        if (f163.touches.length === 0)
            return;
        const h163 = f163.touches[0].x;
        const i163 = f163.touches[0].y;
        if (f163.type === TouchType.Down) {
            this.clearTouchCooldown();
            this.isTouchActive = true;
            this.onPointerDown(h163, i163);
        }
        else if (f163.type === TouchType.Move) {
            this.onPointerMove(h163, i163);
        }
        else if (f163.type === TouchType.Up || f163.type === TouchType.Cancel) {
            this.onPointerUp(h163, i163);
            this.startTouchCooldown();
        }
        f163.stopPropagation();
    }
    private cancelPointerInteraction(): void {
        this.pointerDown = false;
        this.dragComponentId = '';
        this.dragPreviewPos = null;
        this.dragBlocked = false;
        this.isBoxSelecting = false;
        this.previewWireEnd = null;
        this.alignGuideX = null;
        this.alignGuideY = null;
        this.scheduleRedraw();
    }
    private clearTouchCooldown(): void {
        if (this.touchCooldownTimer >= 0) {
            clearTimeout(this.touchCooldownTimer);
            this.touchCooldownTimer = -1;
        }
    }
    private startTouchCooldown(): void {
        this.clearTouchCooldown();
        this.touchCooldownTimer = setTimeout(() => {
            this.isTouchActive = false;
            this.touchCooldownTimer = -1;
        }, 350);
    }
    private onPointerDown(u162: number, v162: number): void {
        if (this.contextMenuVisible) {
            this.contextMenuVisible = false;
        }
        const w162 = Date.now();
        if (w162 - this.lastDownTime < 100) {
            return;
        }
        this.lastDownTime = w162;
        this.pointerDown = true;
        this.lastPointerX = u162;
        this.lastPointerY = v162;
        this.downPointerX = u162;
        this.downPointerY = v162;
        const x162 = this.screenToWorld(u162, v162);
        this.updateMouseCoord(x162);
        if (this.toolMode === EditorToolMode.PLACE) {
            this.placementPreview = x162;
            return;
        }
        if (this.toolMode === EditorToolMode.WIRE ||
            this.toolMode === EditorToolMode.BUS ||
            this.toolMode === EditorToolMode.LABEL ||
            this.toolMode === EditorToolMode.POWER ||
            this.toolMode === EditorToolMode.GROUND) {
            return;
        }
        const y162 = this.appService.schematicEditor.selectAt(x162);
        const z162 = this.appService.schematicEditor as SchematicEditorImpl;
        const a163 = this.appService.schematicEditor.getSelectedNets();
        if (this.toolMode === EditorToolMode.SELECT && (y162.length > 0 || a163.length > 0)) {
            if (y162.length > 0) {
                if (this.shiftHeld) {
                    const e163 = this.appService.schematicEditor.toggleSelection(y162[0]);
                    this.selectedComponentId = e163.length > 0 ? e163[e163.length - 1] : '';
                    this.appService.schematicEditor.setSelection(e163);
                    this.onStatusChange(`已选择 ${e163.length} 个器件`);
                    return;
                }
                this.selectedComponentId = y162[0];
                if (z162.isLayerLocked(SchematicLayerId.COMPONENTS)) {
                    this.dragComponentId = '';
                    this.dragPreviewPos = null;
                    this.dragBlocked = true;
                    this.onStatusChange('器件层已锁定');
                }
                else if (this.appService.schematicEditor.isComponentLocked(y162[0])) {
                    this.dragComponentId = '';
                    this.dragPreviewPos = null;
                    this.dragBlocked = true;
                    this.onStatusChange('器件已锁定，无法拖动');
                }
                else {
                    this.dragComponentId = y162[0];
                    this.dragBlocked = false;
                    const b163 = this.appService.schematicEditor.getDocument();
                    const c163 = b163.components.find(d163 => d163.id === y162[0]);
                    if (c163) {
                        this.dragStartPos = { x: c163.position.x, y: c163.position.y };
                        this.dragPreviewPos = { x: c163.position.x, y: c163.position.y };
                    }
                }
                this.appService.schematicEditor.setSelection([y162[0]]);
                this.onStatusChange(`已选择 ${y162[0]}`);
                return;
            }
            this.selectedComponentId = '';
            this.dragComponentId = '';
            this.dragPreviewPos = null;
            this.dragBlocked = false;
            this.onStatusChange('已选择导线');
            return;
        }
        else if (this.toolMode === EditorToolMode.SELECT) {
            this.selectedComponentId = '';
            this.dragComponentId = '';
            this.dragPreviewPos = null;
            this.dragBlocked = false;
            this.isBoxSelecting = true;
            this.boxSelectStart = x162;
            this.boxSelectEnd = x162;
            if (!this.shiftHeld) {
                this.appService.schematicEditor.setSelection([]);
            }
        }
    }
    private onPointerMove(h162: number, i162: number): void {
        const j162 = this.screenToWorld(h162, i162);
        this.updateMouseCoord(j162);
        const k162 = this.getWireStart();
        if (this.toolMode === EditorToolMode.WIRE && k162 !== null) {
            if (this.isSimulationActive()) {
                this.blockWireEditing();
                return;
            }
            this.previewWireEnd = j162;
            this.scheduleRedraw();
            if (!this.pointerDown) {
                return;
            }
        }
        if (!this.pointerDown) {
            this.updateHover(j162);
            if (this.toolMode === EditorToolMode.PLACE && this.pendingLibraryId.length > 0) {
                this.placementPreview = j162;
                this.scheduleRedraw();
            }
            return;
        }
        const l162 = h162 - this.lastPointerX;
        const m162 = i162 - this.lastPointerY;
        const n162 = h162 - this.downPointerX;
        const o162 = i162 - this.downPointerY;
        const p162 = Math.abs(n162) > SchematicCanvas.MOVE_THRESHOLD || Math.abs(o162) > SchematicCanvas.MOVE_THRESHOLD;
        if (this.toolMode === EditorToolMode.WIRE && k162 !== null) {
            return;
        }
        if (this.toolMode === EditorToolMode.PLACE) {
            this.placementPreview = j162;
            this.scheduleRedraw();
            return;
        }
        if (this.dragComponentId.length > 0 && p162 && this.isSelectMode()) {
            const q162 = this.appService.schematicEditor as SchematicEditorImpl;
            if (q162.isLayerLocked(SchematicLayerId.COMPONENTS)) {
                return;
            }
            const r162 = this.appService.schematicEditor.getZoom();
            const s162 = this.appService.schematicEditor.getViewport().gridSize;
            const t162: Point2D = {
                x: Math.round((this.dragStartPos.x + n162 / r162) / s162) * s162,
                y: Math.round((this.dragStartPos.y + o162 / r162) / s162) * s162
            };
            this.dragPreviewPos = this.computeDragSnap(this.dragComponentId, t162);
            this.scheduleRedraw();
        }
        else if (this.isBoxSelecting && p162 && this.isSelectMode()) {
            this.boxSelectEnd = j162;
            this.scheduleRedraw();
        }
        this.lastPointerX = h162;
        this.lastPointerY = i162;
    }
    private onPointerUp(u161: number, v161: number): void {
        const w161 = Date.now();
        if (w161 - this.lastUpTime < 100) {
            return;
        }
        this.lastUpTime = w161;
        const x161 = this.screenToWorld(u161, v161);
        this.updateMouseCoord(x161);
        const y161 = u161 - this.downPointerX;
        const z161 = v161 - this.downPointerY;
        const a162 = Math.abs(y161) > SchematicCanvas.MOVE_THRESHOLD || Math.abs(z161) > SchematicCanvas.MOVE_THRESHOLD;
        if (this.toolMode === EditorToolMode.WIRE ||
            this.toolMode === EditorToolMode.BUS ||
            this.toolMode === EditorToolMode.LABEL ||
            this.toolMode === EditorToolMode.POWER ||
            this.toolMode === EditorToolMode.GROUND) {
            this.handleTap(x161);
        }
        else if (this.toolMode === EditorToolMode.PLACE) {
            this.tryPlaceComponent(x161);
        }
        else if (!a162 || this.isTapSlop(y161, z161)) {
            this.handleTap(x161);
        }
        else if (this.dragComponentId.length > 0 && this.isSelectMode()) {
            if (this.dragPreviewPos !== null) {
                this.appService.schematicEditor.moveComponent(this.dragComponentId, this.dragPreviewPos);
            }
        }
        else if (this.isBoxSelecting && this.isSelectMode()) {
            this.boxSelectEnd = x161;
            const b162 = this.normalizeRect(this.boxSelectStart, this.boxSelectEnd);
            if (b162.width > 2 && b162.height > 2) {
                const c162 = this.appService.schematicEditor.selectInRect(b162);
                if (this.shiftHeld && c162.length > 0) {
                    const d162 = this.appService.schematicEditor.getSelectedDevices().map(g162 => g162.instUuid);
                    const e162 = d162.slice();
                    for (let f162 = 0; f162 < c162.length; f162++) {
                        if (!e162.includes(c162[f162]))
                            e162.push(c162[f162]);
                    }
                    this.appService.schematicEditor.setSelection(e162);
                }
                this.selectedComponentId = c162.length > 0 ? c162[0] : '';
                this.onStatusChange(`框选 ${c162.length} 个器件`);
            }
        }
        this.isBoxSelecting = false;
        this.pointerDown = false;
        this.dragComponentId = '';
        this.dragPreviewPos = null;
        this.dragBlocked = false;
        this.previewWireEnd = null;
        this.alignGuideX = null;
        this.alignGuideY = null;
        this.scheduleRedraw();
    }
    private computeDragSnap(i161: string, j161: Point2D): Point2D {
        const k161 = this.appService.schematicEditor as SchematicEditorImpl;
        const l161 = k161.getDocument();
        const m161 = SchematicCanvas.ALIGN_THRESHOLD;
        let n161 = j161.x;
        let o161 = j161.y;
        this.alignGuideX = null;
        this.alignGuideY = null;
        let p161 = false;
        let q161 = false;
        for (let s161 = 0; s161 < l161.components.length; s161++) {
            const t161 = l161.components[s161];
            if (t161.id === i161) {
                continue;
            }
            if (!p161 && Math.abs(j161.x - t161.position.x) <= m161) {
                n161 = t161.position.x;
                this.alignGuideX = t161.position.x;
                p161 = true;
            }
            if (!q161 && Math.abs(j161.y - t161.position.y) <= m161) {
                o161 = t161.position.y;
                this.alignGuideY = t161.position.y;
                q161 = true;
            }
        }
        const r161: Point2D = { x: n161, y: o161 };
        return this.tryPinEndpointSnap(i161, r161);
    }
    private tryPinEndpointSnap(l160: string, m160: Point2D): Point2D {
        const n160 = this.appService.schematicEditor as SchematicEditorImpl;
        const o160 = n160.getDocument();
        const p160 = o160.components.find(h161 => h161.id === l160);
        if (p160 === undefined) {
            return m160;
        }
        const q160 = this.appService.componentLibrary.resolveLibraryId(p160.libraryId);
        const r160 = this.appService.componentLibrary.getComponent(q160);
        if (!r160.success || r160.data === undefined || r160.data.pins.length === 0) {
            return m160;
        }
        const s160: Point2D[] = [];
        for (let f161 = 0; f161 < o160.wires.length; f161++) {
            const g161 = o160.wires[f161].points;
            if (g161.length > 0) {
                s160.push(g161[0]);
                s160.push(g161[g161.length - 1]);
            }
        }
        if (s160.length === 0) {
            return m160;
        }
        const t160 = SchematicCanvas.ALIGN_THRESHOLD;
        let u160 = m160;
        let v160 = t160 + 1;
        const w160 = r160.data.pins;
        for (let x160 = 0; x160 < w160.length; x160++) {
            const y160 = this.transformPinOffset(w160[x160].position, p160.rotation, p160.mirrored);
            for (let z160 = 0; z160 < s160.length; z160++) {
                const a161 = s160[z160];
                const b161: Point2D = { x: m160.x + y160.x, y: m160.y + y160.y };
                const c161 = a161.x - b161.x;
                const d161 = a161.y - b161.y;
                const e161 = Math.sqrt(c161 * c161 + d161 * d161);
                if (e161 <= t160 && e161 < v160) {
                    v160 = e161;
                    u160 = { x: m160.x + c161, y: m160.y + d161 };
                    this.alignGuideX = a161.x;
                    this.alignGuideY = a161.y;
                }
            }
        }
        return u160;
    }
    private transformPinOffset(g160: Point2D, h160: number, i160: boolean): Point2D {
        let j160 = g160.x;
        let k160 = g160.y;
        if (i160) {
            j160 = -j160;
        }
        switch (h160) {
            case 90: return { x: -k160, y: j160 };
            case 180: return { x: -j160, y: -k160 };
            case 270: return { x: k160, y: -j160 };
            default: return { x: j160, y: k160 };
        }
    }
    private isSimulationActive(): boolean {
        return this.appService.isSimulationActive();
    }
    private blockWireEditing(): boolean {
        if (!this.isSimulationActive()) {
            return false;
        }
        this.wireWaypoints = [];
        this.setWireStart(null);
        this.previewWireEnd = null;
        this.onStatusChange('仿真运行中，无法接线');
        this.scheduleRedraw();
        return true;
    }
    private isLayerBlocked(e160: SchematicLayerId): boolean {
        const f160 = this.appService.schematicEditor as SchematicEditorImpl;
        return f160.isLayerLocked(e160);
    }
    private handleTap(u159: Point2D): void {
        const v159 = this.appService.schematicEditor;
        const w159 = this.getWireStart();
        switch (this.toolMode) {
            case EditorToolMode.PLACE:
                if (this.isLayerBlocked(SchematicLayerId.COMPONENTS)) {
                    this.onStatusChange('器件层已锁定');
                    break;
                }
                this.tryPlaceComponent(u159);
                break;
            case EditorToolMode.WIRE: {
                if (this.blockWireEditing()) {
                    break;
                }
                if (this.isLayerBlocked(SchematicLayerId.WIRING)) {
                    this.onStatusChange('布线层已锁定');
                    break;
                }
                const z159 = this.findNearestPinWorld(u159);
                const a160 = z159 ?? u159;
                if (w159 === null) {
                    if (z159 === null) {
                        this.onStatusChange('请点击引脚开始连线');
                        break;
                    }
                    this.wireWaypoints = [a160];
                    this.setWireStart(a160);
                    this.onStatusChange('导线起点, 点击添加拐点 / 点击引脚完成连线');
                }
                else if (z159 !== null) {
                    const b160 = this.wireWaypoints[0];
                    const c160 = Math.abs(z159.x - b160.x) < 4 && Math.abs(z159.y - b160.y) < 4;
                    if (c160) {
                        this.onStatusChange('请点击其他引脚完成连线, 或按 ESC 取消');
                        break;
                    }
                    this.wireWaypoints.push(a160);
                    const d160 = v159.addWireWithPoints(this.wireWaypoints);
                    this.wireWaypoints = [];
                    this.setWireStart(null);
                    this.previewWireEnd = null;
                    if (d160.success) {
                        this.onStatusChange('导线已完成');
                    }
                    else {
                        this.onStatusChange(d160.error ?? '接线失败');
                    }
                }
                else {
                    this.wireWaypoints.push(a160);
                    this.setWireStart(a160);
                    this.onStatusChange(`拐点已添加 (共${this.wireWaypoints.length - 1}个), 继续点击 / 点击引脚完成`);
                }
                break;
            }
            case EditorToolMode.BUS:
                if (this.blockWireEditing()) {
                    break;
                }
                if (this.isLayerBlocked(SchematicLayerId.WIRING)) {
                    this.onStatusChange('布线层已锁定');
                    break;
                }
                if (w159 === null) {
                    this.setWireStart(u159);
                    this.onStatusChange('总线: 选择终点');
                }
                else {
                    v159.createBus(w159.x, w159.y, u159.x, u159.y, 8);
                    this.setWireStart(null);
                    this.onStatusChange('总线已添加');
                }
                break;
            case EditorToolMode.LABEL:
                v159.createNetLabel(u159.x, u159.y, 'NET1');
                this.onStatusChange('已放置网络标签 NET1');
                break;
            case EditorToolMode.POWER:
                v159.createNetLabel(u159.x, u159.y, 'VCC');
                this.onStatusChange('已放置电源 VCC');
                break;
            case EditorToolMode.GROUND:
                v159.createNetLabel(u159.x, u159.y, 'GND');
                this.onStatusChange('已放置地 GND');
                break;
            default: {
                const x159 = this.findNearestPinWorld(u159);
                if (x159 !== null) {
                    if (this.isSimulationActive()) {
                        this.onStatusChange('仿真运行中，无法接线');
                        break;
                    }
                    this.toolMode = EditorToolMode.WIRE;
                    this.selectedComponentId = '';
                    this.dragComponentId = '';
                    this.dragPreviewPos = null;
                    this.appService.schematicEditor.setSelection([]);
                    this.wireWaypoints = [x159];
                    this.setWireStart(x159);
                    this.onStatusChange('导线起点, 点击添加拐点 / 点击引脚完成连线');
                    break;
                }
                const y159 = v159.selectAt(u159);
                if (y159.length > 0) {
                    this.selectedComponentId = y159[0];
                    v159.setSelection([y159[0]]);
                }
                else {
                    this.selectedComponentId = '';
                    v159.setSelection([]);
                }
                break;
            }
        }
    }
    private updateMouseCoord(t159: Point2D): void {
        this.mouseX = Math.round(t159.x);
        this.mouseY = Math.round(t159.y);
    }
    private updateHover(p159: Point2D): void {
        const q159 = this.appService.schematicEditor as SchematicEditorImpl;
        const r159 = q159.hitTestAt(p159);
        if (r159.length > 0) {
            this.hoverComponentId = r159[0];
            this.hoverWireNetId = '';
            return;
        }
        const s159 = q159.hitTestWireAt(p159);
        this.hoverComponentId = '';
        this.hoverWireNetId = s159 !== null ? s159 : '';
    }
    private screenToWorld(m159: number, n159: number): Point2D {
        const o159 = this.appService.schematicEditor.getViewport();
        return {
            x: (m159 - o159.panOffset.x) / o159.zoom,
            y: (n159 - o159.panOffset.y) / o159.zoom
        };
    }
    private getVisibleWorldBounds(f159: ViewportState): WorldRect {
        const g159 = f159.gridSize * 2;
        const h159 = (-f159.panOffset.x / f159.zoom) - g159;
        const i159 = (-f159.panOffset.y / f159.zoom) - g159;
        const j159 = h159 + (this.viewWidth / f159.zoom) + g159 * 2;
        const k159 = i159 + (this.viewHeight / f159.zoom) + g159 * 2;
        const l159: WorldRect = { minX: h159, minY: i159, maxX: j159, maxY: k159 };
        return l159;
    }
    redraw(): void {
        if (this.viewWidth <= 0 || this.viewHeight <= 0) {
            return;
        }
        const x158 = this.appService.schematicEditor.getDocument();
        const y158 = this.appService.schematicEditor.getViewport();
        const z158 = this.appService.schematicEditor as SchematicEditorImpl;
        const a159 = this.viewWidth;
        const b159 = this.viewHeight;
        const c159 = this.getVisibleWorldBounds(y158);
        if (this.backgroundDirty) {
            const e159 = this.context;
            e159.clearRect(0, 0, a159, b159);
            e159.fillStyle = ThemeManager.getInstance().canvasBg();
            e159.fillRect(0, 0, a159, b159);
            e159.save();
            e159.translate(y158.panOffset.x, y158.panOffset.y);
            e159.scale(y158.zoom, y158.zoom);
            this.drawBackgroundScene(e159, x158, y158, c159, z158);
            e159.restore();
            this.backgroundDirty = false;
        }
        const d159 = this.wireCtx;
        d159.clearRect(0, 0, a159, b159);
        d159.save();
        d159.translate(y158.panOffset.x, y158.panOffset.y);
        d159.scale(y158.zoom, y158.zoom);
        if (z158.isLayerVisible(SchematicLayerId.WIRING)) {
            this.drawWires(d159, x158.wires);
        }
        this.renderOverlays(d159, x158, y158, c159, z158);
        d159.restore();
        this.simFrameDirty = false;
        this.zoomPercent = Math.round(y158.zoom * 100);
        if (this.rulerVisible && this.rulerDirty) {
            this.rulerDirty = false;
            this.drawHRuler();
            this.drawVRuler();
        }
    }
    private fullRedraw(): void {
        this.backgroundDirty = true;
        this.redraw();
    }
    private drawBackgroundScene(s158: CanvasRenderingContext2D, t158: SchematicDocument, u158: ViewportState, v158: WorldRect, w158: SchematicEditorImpl): void {
        if (u158.gridVisible) {
            this.drawCachedGrid(s158, u158, v158);
            if (u158.zoom >= 0.8) {
                this.drawGridLines(s158, u158, v158);
            }
        }
        if (w158.isLayerVisible(SchematicLayerId.WIRING)) {
            this.drawBackgroundGridOnEmpty(s158, u158, v158, t158.wires.length);
        }
        if (w158.isLayerVisible(SchematicLayerId.COMPONENTS)) {
            this.drawComponents(s158, t158.components, false);
        }
        if (w158.isLayerVisible(SchematicLayerId.ANNOTATIONS)) {
            this.drawNetLabels(s158, t158);
        }
        if (this.ercErrors.length > 0 && w158.isLayerVisible(SchematicLayerId.ERC_MARKERS)) {
            this.drawErcMarkers(s158, t158);
        }
    }
    private renderOverlays(m158: CanvasRenderingContext2D, n158: SchematicDocument, o158: ViewportState, p158: WorldRect, q158: SchematicEditorImpl): void {
        if (q158.isLayerVisible(SchematicLayerId.WIRING)) {
            const r158 = this.getWireStart();
            if (r158 !== null) {
                if (this.wireWaypoints.length > 0) {
                    this.drawWireStartDot(m158, this.wireWaypoints[0]);
                }
                else {
                    this.drawWireStartDot(m158, r158);
                }
                if (this.wireWaypoints.length >= 2) {
                    this.drawWaypointPath(m158);
                }
                if (this.previewWireEnd !== null) {
                    this.drawPreviewWire(m158, r158, this.previewWireEnd);
                }
            }
            if (this.dragComponentId.length === 0) {
                this.drawWireConnectionMarkers(m158);
            }
        }
        if (this.dragComponentId.length > 0 && q158.isLayerVisible(SchematicLayerId.COMPONENTS)) {
            this.drawDraggedComponentPreview(m158, n158.components);
        }
        if (this.toolMode === EditorToolMode.PLACE && this.placementPreview !== null &&
            this.pendingLibraryId.length > 0) {
            this.drawPlacementGhost(m158, this.placementPreview);
        }
        if (this.isBoxSelecting) {
            this.drawSelectionBox(m158);
        }
        if (this.alignGuideX !== null || this.alignGuideY !== null) {
            this.drawAlignGuides(m158, p158);
        }
        this.drawHoverOverlays(m158, n158, q158);
        this.drawLitLedOverlays(m158, n158);
        if (this.toolMode === EditorToolMode.WIRE) {
            this.drawPinSnapMarkers(m158);
        }
    }
    private drawDraggedComponentPreview(g158: CanvasRenderingContext2D, h158: ComponentInstance[]): void {
        if (this.dragPreviewPos === null) {
            return;
        }
        for (let i158 = 0; i158 < h158.length; i158++) {
            if (h158[i158].id !== this.dragComponentId) {
                continue;
            }
            const j158 = h158[i158];
            const k158 = this.getCachedCompDef(j158.libraryId);
            if (k158 === null) {
                continue;
            }
            const l158: SymbolDrawStyle = {
                strokeColor: ProteusColors.SELECTED,
                fillColor: ProteusColors.CANVAS_BG,
                lineWidth: 2,
                selected: true,
                hovered: false
            };
            SchematicSymbolRenderer.drawComponent(g158, this.dragPreviewPos.x, this.dragPreviewPos.y, k158, j158.refDes, j158.rotation, j158.mirrored, l158);
            break;
        }
    }
    private ensureGridTile(z157: ViewportState): void {
        const a158 = z157.gridSize;
        const b158 = `${a158}_${ProteusColors.GRID_DOT}`;
        if (this.gridTile !== null && this.gridTileKey === b158) {
            return;
        }
        const c158 = 16;
        const d158 = a158 * c158;
        const e158 = a158 * c158;
        const f158 = SchematicCanvas.parseGridColor(ProteusColors.GRID_DOT);
        this.gridTile = this.buildGridTileImage(d158, e158, a158, f158);
        this.gridTileKey = b158;
        this.gridTileWorldW = d158;
        this.gridTileWorldH = e158;
    }
    private buildGridTileImage(r157: number, s157: number, t157: number, u157: RgbColor): ImageData {
        const v157 = this.context.createImageData(r157, s157);
        for (let w157 = 0; w157 < r157; w157 += t157) {
            for (let x157 = 0; x157 < s157; x157 += t157) {
                const y157 = (x157 * r157 + w157) * 4;
                v157.data[y157] = u157.r;
                v157.data[y157 + 1] = u157.g;
                v157.data[y157 + 2] = u157.b;
                v157.data[y157 + 3] = 255;
            }
        }
        return v157;
    }
    private drawGridLines(h157: CanvasRenderingContext2D, i157: ViewportState, j157: WorldRect): void {
        const k157 = i157.gridSize;
        const l157 = Math.floor(j157.minX / k157) * k157;
        const m157 = Math.floor(j157.minY / k157) * k157;
        const n157 = Math.ceil(j157.maxX / k157) * k157;
        const o157 = Math.ceil(j157.maxY / k157) * k157;
        h157.strokeStyle = ProteusColors.GRID_LINE;
        h157.lineWidth = 0.5;
        for (let q157 = l157; q157 <= n157; q157 += k157) {
            h157.beginPath();
            h157.moveTo(q157, m157);
            h157.lineTo(q157, o157);
            h157.stroke();
        }
        for (let p157 = m157; p157 <= o157; p157 += k157) {
            h157.beginPath();
            h157.moveTo(l157, p157);
            h157.lineTo(n157, p157);
            h157.stroke();
        }
    }
    private drawBackgroundGridOnEmpty(w156: CanvasRenderingContext2D, x156: ViewportState, y156: WorldRect, z156: number): void {
        if (z156 > 0) {
            return;
        }
        const a157 = x156.gridSize * 5;
        const b157 = Math.floor(y156.minX / a157) * a157;
        const c157 = Math.floor(y156.minY / a157) * a157;
        const d157 = Math.ceil(y156.maxX / a157) * a157;
        const e157 = Math.ceil(y156.maxY / a157) * a157;
        w156.strokeStyle = ProteusColors.GRID_LINE;
        w156.lineWidth = 1;
        for (let g157 = b157; g157 <= d157; g157 += a157) {
            w156.beginPath();
            w156.moveTo(g157, c157);
            w156.lineTo(g157, e157);
            w156.stroke();
        }
        for (let f157 = c157; f157 <= e157; f157 += a157) {
            w156.beginPath();
            w156.moveTo(b157, f157);
            w156.lineTo(d157, f157);
            w156.stroke();
        }
    }
    private drawCachedGrid(n156: CanvasRenderingContext2D, o156: ViewportState, p156: WorldRect): void {
        this.ensureGridTile(o156);
        if (this.gridTile === null) {
            this.drawDotGrid(n156, o156, p156);
            return;
        }
        const q156 = Math.floor(p156.minX / this.gridTileWorldW) * this.gridTileWorldW;
        const r156 = Math.floor(p156.minY / this.gridTileWorldH) * this.gridTileWorldH;
        const s156 = p156.maxX + this.gridTileWorldW;
        const t156 = p156.maxY + this.gridTileWorldH;
        for (let u156 = q156; u156 <= s156; u156 += this.gridTileWorldW) {
            for (let v156 = r156; v156 <= t156; v156 += this.gridTileWorldH) {
                n156.putImageData(this.gridTile, u156, v156);
            }
        }
    }
    private normalizeRect(j156: Point2D, k156: Point2D): Rect2D {
        const l156 = Math.min(j156.x, k156.x);
        const m156 = Math.min(j156.y, k156.y);
        return { x: l156, y: m156, width: Math.abs(k156.x - j156.x), height: Math.abs(k156.y - j156.y) };
    }
    private drawAlignGuides(h156: CanvasRenderingContext2D, i156: WorldRect): void {
        h156.strokeStyle = '#FF4080';
        h156.lineWidth = 1 / this.appService.schematicEditor.getZoom();
        h156.setLineDash([6, 4]);
        if (this.alignGuideX !== null) {
            h156.beginPath();
            h156.moveTo(this.alignGuideX, i156.minY);
            h156.lineTo(this.alignGuideX, i156.maxY);
            h156.stroke();
        }
        if (this.alignGuideY !== null) {
            h156.beginPath();
            h156.moveTo(i156.minX, this.alignGuideY);
            h156.lineTo(i156.maxX, this.alignGuideY);
            h156.stroke();
        }
        h156.setLineDash([]);
    }
    private drawSelectionBox(f156: CanvasRenderingContext2D): void {
        const g156 = this.normalizeRect(this.boxSelectStart, this.boxSelectEnd);
        f156.strokeStyle = '#00BFFF';
        f156.lineWidth = 1 / this.appService.schematicEditor.getZoom();
        f156.setLineDash([4, 4]);
        f156.strokeRect(g156.x, g156.y, g156.width, g156.height);
        f156.fillStyle = 'rgba(0, 191, 255, 0.08)';
        f156.fillRect(g156.x, g156.y, g156.width, g156.height);
        f156.setLineDash([]);
    }
    private drawWaypointPath(a156: CanvasRenderingContext2D): void {
        if (this.wireWaypoints.length < 2) {
            return;
        }
        a156.strokeStyle = ProteusColors.SELECTED;
        a156.lineWidth = 2;
        a156.beginPath();
        a156.moveTo(this.wireWaypoints[0].x, this.wireWaypoints[0].y);
        for (let b156 = 1; b156 < this.wireWaypoints.length; b156++) {
            const c156 = this.wireWaypoints[b156 - 1];
            const d156 = this.wireWaypoints[b156];
            const e156: Point2D = { x: d156.x, y: c156.y };
            a156.lineTo(e156.x, e156.y);
            a156.lineTo(d156.x, d156.y);
        }
        a156.stroke();
    }
    private drawWireStartDot(v155: CanvasRenderingContext2D, w155: Point2D): void {
        const x155 = this.appService.schematicEditor.getViewport().gridSize;
        const y155 = Math.round(w155.x / x155) * x155;
        const z155 = Math.round(w155.y / x155) * x155;
        v155.fillStyle = ProteusColors.SELECTED;
        v155.beginPath();
        v155.arc(y155, z155, 3.5, 0, Math.PI * 2);
        v155.fill();
        v155.strokeStyle = '#FFFFFF';
        v155.lineWidth = 1;
        v155.stroke();
    }
    private drawPreviewWire(r155: CanvasRenderingContext2D, s155: Point2D, t155: Point2D): void {
        r155.strokeStyle = ProteusColors.SELECTED;
        r155.lineWidth = 1;
        r155.setLineDash([4, 4]);
        const u155 = this.smartMidpoint(s155, t155, '');
        r155.beginPath();
        r155.moveTo(s155.x, s155.y);
        r155.lineTo(u155.x, u155.y);
        r155.lineTo(t155.x, t155.y);
        r155.stroke();
        r155.setLineDash([]);
    }
    private drawDotGrid(v154: CanvasRenderingContext2D, w154: ViewportState, x154: WorldRect): void {
        const y154 = w154.gridSize;
        const z154 = Math.floor(x154.minX / y154) * y154;
        const a155 = Math.floor(x154.minY / y154) * y154;
        const b155 = Math.ceil(x154.maxX / y154) * y154;
        const c155 = Math.ceil(x154.maxY / y154) * y154;
        const d155 = Math.ceil((b155 - z154) / y154) + 1;
        const e155 = Math.ceil((c155 - a155) / y154) + 1;
        const f155 = d155 * e155 > 5000 ? y154 * 2 : y154;
        const g155 = b155 - z154 + 1;
        const h155 = c155 - a155 + 1;
        if (g155 > 0 && h155 > 0 && g155 * h155 <= 250000) {
            const k155 = SchematicCanvas.parseGridColor(ProteusColors.GRID_DOT);
            const l155 = v154.createImageData(g155, h155);
            for (let m155 = z154; m155 <= b155; m155 += f155) {
                for (let n155 = a155; n155 <= c155; n155 += f155) {
                    const o155 = m155 - z154;
                    const p155 = n155 - a155;
                    if (o155 >= 0 && p155 >= 0 && o155 < g155 && p155 < h155) {
                        const q155 = (p155 * g155 + o155) * 4;
                        l155.data[q155] = k155.r;
                        l155.data[q155 + 1] = k155.g;
                        l155.data[q155 + 2] = k155.b;
                        l155.data[q155 + 3] = 255;
                    }
                }
            }
            v154.putImageData(l155, z154, a155);
            return;
        }
        v154.fillStyle = ProteusColors.GRID_DOT;
        for (let i155 = z154; i155 <= b155; i155 += f155) {
            for (let j155 = a155; j155 <= c155; j155 += f155) {
                v154.fillRect(i155, j155, 1, 1);
            }
        }
    }
    private static parseGridColor(t154: string): RgbColor {
        const u154 = t154.replace('#', '');
        if (u154.length >= 6) {
            return {
                r: parseInt(u154.substring(0, 2), 16),
                g: parseInt(u154.substring(2, 4), 16),
                b: parseInt(u154.substring(4, 6), 16)
            };
        }
        return { r: 80, g: 80, b: 96 };
    }
    private drawPlacementGhost(n154: CanvasRenderingContext2D, o154: Point2D): void {
        const p154 = this.appService.schematicEditor.getViewport().gridSize;
        const q154 = Math.round(o154.x / p154) * p154;
        const r154 = Math.round(o154.y / p154) * p154;
        const s154 = this.getCachedCompDef(this.pendingLibraryId);
        if (s154 === null) {
            n154.strokeStyle = ProteusColors.HOVER_PREVIEW;
            n154.setLineDash([4, 4]);
            n154.strokeRect(q154 - 30, r154 - 20, 60, 40);
            n154.setLineDash([]);
            return;
        }
        SchematicSymbolRenderer.drawGhost(n154, q154, r154, s154);
    }
    private drawComponents(v153: CanvasRenderingContext2D, w153: ComponentInstance[], x153: boolean = false): void {
        const y153 = this.appService.schematicEditor.getViewport();
        const z153 = this.getVisibleWorldBounds(y153);
        const a154 = this.appService.schematicEditor as SchematicEditorImpl;
        const b154 = w153.length;
        for (let c154 = 0; c154 < b154; c154++) {
            const d154 = w153[c154];
            if (x153 && d154.id === this.dragComponentId) {
                continue;
            }
            const e154 = d154.position.x;
            const f154 = d154.position.y;
            if (e154 < z153.minX - 120 || e154 > z153.maxX + 120 ||
                f154 < z153.minY - 120 || f154 > z153.maxY + 120) {
                continue;
            }
            const g154 = a154.isComponentSelected(d154.id);
            const h154 = d154.id === this.hoverComponentId && !g154;
            const i154 = this.getCachedCompDef(d154.libraryId);
            if (i154 === null) {
                this.drawFallbackComponent(v153, d154, g154, h154);
                continue;
            }
            const j154 = d154.id === this.dragComponentId && this.dragPreviewPos !== null
                ? this.dragPreviewPos : d154.position;
            this.drawComponentBodyBackdrop(v153, j154, d154, i154);
            const k154: SymbolDrawStyle = {
                strokeColor: g154 ? ProteusColors.SELECTED : ProteusColors.COMPONENT_STROKE,
                fillColor: ProteusColors.CANVAS_BG,
                lineWidth: g154 ? 2 : 1.2,
                selected: g154,
                hovered: false,
                ledDisplayColor: this.isLedComponent(d154, i154) ? '' : undefined
            };
            SchematicSymbolRenderer.drawComponent(v153, j154.x, j154.y, i154, d154.refDes, d154.rotation, d154.mirrored, k154);
            if (this.appService.schematicEditor.isComponentLocked(d154.id)) {
                const l154 = j154.x;
                const m154 = j154.y;
                v153.strokeStyle = '#c08020';
                v153.lineWidth = 1;
                v153.setLineDash([4, 3]);
                v153.strokeRect(l154 - 34, m154 - 24, 68, 48);
                v153.setLineDash([]);
                v153.fillStyle = '#c08020';
                v153.font = '9px sans-serif';
                v153.fillText('🔒', l154 - 28, m154 - 14);
            }
        }
    }
    private drawComponentBodyBackdrop(l153: CanvasRenderingContext2D, m153: Point2D, n153: ComponentInstance, o153: ComponentDefinition): void {
        if (o153.pins.length === 0) {
            return;
        }
        const p153 = calcSymbolBounds(o153.pins, 0);
        if (p153.width < 50 || p153.height < 40) {
            return;
        }
        l153.save();
        l153.translate(m153.x, m153.y);
        if (n153.rotation !== 0) {
            l153.rotate(n153.rotation * Math.PI / 180);
        }
        if (n153.mirrored) {
            l153.scale(-1, 1);
        }
        const q153 = (p153.minX + p153.maxX) / 2;
        const r153 = (p153.minY + p153.maxY) / 2;
        const s153 = p153.width;
        const t153 = p153.height;
        l153.fillStyle = '#EBEEF2';
        l153.fillRect(q153 - s153 / 2, r153 - t153 / 2, s153, t153);
        l153.strokeStyle = '#222222';
        l153.lineWidth = 2;
        l153.strokeRect(q153 - s153 / 2, r153 - t153 / 2, s153, t153);
        if (o153.name.length > 0) {
            const u153 = o153.name.length > 14 ? o153.name.substring(0, 12) + '..' : o153.name;
            l153.font = '11px sans-serif';
            l153.fillStyle = '#444444';
            l153.textAlign = 'center';
            l153.fillText(u153, 0, 4);
            l153.textAlign = 'start';
        }
        l153.restore();
    }
    private findNearestPinWorld(v152: Point2D): Point2D | null {
        const w152 = this.appService.schematicEditor.getDocument();
        const x152 = this.appService.schematicEditor.getViewport().gridSize;
        const y152 = x152 * 1.5;
        let z152 = y152;
        let a153: Point2D | null = null;
        for (let b153 = 0; b153 < w152.components.length; b153++) {
            const c153 = w152.components[b153];
            const d153 = this.getCachedCompDef(c153.libraryId);
            if (d153 === null) {
                continue;
            }
            for (let e153 = 0; e153 < d153.pins.length; e153++) {
                const f153 = d153.pins[e153];
                const g153 = this.transformPinOffset(f153.position, c153.rotation, c153.mirrored);
                const h153: Point2D = { x: c153.position.x + g153.x, y: c153.position.y + g153.y };
                const i153 = v152.x - h153.x;
                const j153 = v152.y - h153.y;
                const k153 = Math.sqrt(i153 * i153 + j153 * j153);
                if (k153 <= z152) {
                    z152 = k153;
                    a153 = h153;
                }
            }
        }
        return a153;
    }
    private getComponentWorldBounds(j152: ComponentInstance): Rect2D | null {
        const k152 = this.getCachedCompDef(j152.libraryId);
        if (k152 === null || k152.pins.length === 0) {
            return { x: j152.position.x - 30, y: j152.position.y - 20, width: 60, height: 40 };
        }
        const l152 = calcSymbolBounds(k152.pins, 10);
        const m152: Point2D[] = [
            { x: l152.minX, y: l152.minY },
            { x: l152.maxX, y: l152.minY },
            { x: l152.minX, y: l152.maxY },
            { x: l152.maxX, y: l152.maxY }
        ];
        let n152 = Infinity;
        let o152 = Infinity;
        let p152 = -Infinity;
        let q152 = -Infinity;
        for (const r152 of m152) {
            const s152 = this.transformPinOffset(r152, j152.rotation, j152.mirrored);
            const t152 = j152.position.x + s152.x;
            const u152 = j152.position.y + s152.y;
            if (t152 < n152) {
                n152 = t152;
            }
            if (u152 < o152) {
                o152 = u152;
            }
            if (t152 > p152) {
                p152 = t152;
            }
            if (u152 > q152) {
                q152 = u152;
            }
        }
        return { x: n152, y: o152, width: p152 - n152, height: q152 - o152 };
    }
    private isPointInsideComponentBody(e152: Point2D, f152: string): boolean {
        const g152 = this.appService.schematicEditor.getDocument();
        for (const h152 of g152.components) {
            if (h152.id === f152) {
                continue;
            }
            const i152 = this.getComponentWorldBounds(h152);
            if (i152 === null) {
                continue;
            }
            if (e152.x >= i152.x && e152.x <= i152.x + i152.width &&
                e152.y >= i152.y && e152.y <= i152.y + i152.height) {
                return true;
            }
        }
        return false;
    }
    private smartMidpoint(x151: Point2D, y151: Point2D, z151: string): Point2D {
        const a152: Point2D = { x: y151.x, y: x151.y };
        const b152: Point2D = { x: x151.x, y: y151.y };
        const c152 = this.isPointInsideComponentBody(a152, z151);
        const d152 = this.isPointInsideComponentBody(b152, z151);
        if (c152 && !d152) {
            return b152;
        }
        if (d152 && !c152) {
            return a152;
        }
        return a152;
    }
    private drawPinSnapMarkers(n151: CanvasRenderingContext2D): void {
        if (this.toolMode !== EditorToolMode.WIRE || this.isSimulationActive()) {
            return;
        }
        const o151 = this.appService.schematicEditor.getDocument();
        n151.fillStyle = '#FF6600';
        n151.strokeStyle = '#FFFFFF';
        n151.lineWidth = 0.5;
        for (let p151 = 0; p151 < o151.components.length; p151++) {
            const q151 = o151.components[p151];
            const r151 = this.getCachedCompDef(q151.libraryId);
            if (r151 === null) {
                continue;
            }
            for (let s151 = 0; s151 < r151.pins.length; s151++) {
                const t151 = r151.pins[s151];
                const u151 = this.transformPinOffset(t151.position, q151.rotation, q151.mirrored);
                const v151 = q151.position.x + u151.x;
                const w151 = q151.position.y + u151.y;
                n151.beginPath();
                n151.arc(v151, w151, 3, 0, Math.PI * 2);
                n151.fill();
                n151.stroke();
            }
        }
    }
    private getCachedCompDef(i151: string): ComponentDefinition | null {
        const j151 = this.compDefCache.get(i151);
        if (j151 !== undefined) {
            return j151;
        }
        const k151 = this.appService.componentLibrary.resolveLibraryId(i151);
        const l151 = this.appService.componentLibrary.getComponent(k151);
        const m151 = (l151.success && l151.data) ? l151.data : null;
        this.compDefCache.set(i151, m151);
        return m151;
    }
    private drawHitHoverOverlay(e151: CanvasRenderingContext2D, f151: SchematicEditorImpl, g151: ComponentInstance): void {
        const h151 = f151.getComponentHitRect(g151);
        e151.fillStyle = 'rgba(0, 170, 255, 0.18)';
        e151.strokeStyle = ProteusColors.HOVER_PREVIEW;
        e151.lineWidth = 1.5 / Math.max(this.appService.schematicEditor.getZoom(), 0.5);
        e151.setLineDash([6, 4]);
        e151.fillRect(h151.x, h151.y, h151.width, h151.height);
        e151.strokeRect(h151.x, h151.y, h151.width, h151.height);
        e151.setLineDash([]);
    }
    private drawHoverOverlays(a151: CanvasRenderingContext2D, b151: SchematicDocument, c151: SchematicEditorImpl): void {
        if (!this.isSelectMode() || this.hoverComponentId.length === 0) {
            return;
        }
        if (c151.isComponentSelected(this.hoverComponentId)) {
            return;
        }
        for (let d151 = 0; d151 < b151.components.length; d151++) {
            if (b151.components[d151].id === this.hoverComponentId) {
                this.drawHitHoverOverlay(a151, c151, b151.components[d151]);
                return;
            }
        }
    }
    private isLedComponent(x150: ComponentInstance, y150: ComponentDefinition | null): boolean {
        if (y150 !== null) {
            const z150 = y150.id.toUpperCase();
            if (z150.includes('LED')) {
                return true;
            }
        }
        return x150.libraryId.toUpperCase().includes('LED');
    }
    private resolveLedNominalColor(u150: ComponentInstance, v150: ComponentDefinition): string {
        const w150 = u150.parameters.get('color');
        if (w150 !== undefined && w150.length > 0) {
            return w150;
        }
        return v150.defaultParams.get('color') ?? 'red';
    }
    private isLedWired(o150: ComponentInstance, p150: ComponentDefinition): boolean {
        const q150 = this.appService.schematicEditor.getDocument();
        const r150 = getPinNetMap(o150.id, q150.nets);
        if (r150.size < 2) {
            return false;
        }
        const s150 = this.findLedAnodeNet(p150, r150);
        const t150 = this.findLedCathodeNet(p150, r150);
        if (s150 === null || t150 === null) {
            return false;
        }
        return s150.length > 0 && t150.length > 0 && s150 !== t150;
    }
    private findLedAnodeNet(i150: ComponentDefinition, j150: Map<string, string>): string | null {
        for (let k150 = 0; k150 < i150.pins.length; k150++) {
            const l150 = i150.pins[k150];
            const m150 = l150.name.toUpperCase();
            if (m150 === 'A' || m150 === 'ANODE' || m150 === '1') {
                const n150 = findNetForPinLabel(j150, l150.name) ?? findNetForPinLabel(j150, l150.id);
                if (n150 !== null) {
                    return n150;
                }
            }
        }
        if (i150.pins.length > 0) {
            return findNetForPinLabel(j150, i150.pins[0].name) ?? findNetForPinLabel(j150, i150.pins[0].id);
        }
        return null;
    }
    private findLedCathodeNet(c150: ComponentDefinition, d150: Map<string, string>): string | null {
        for (let e150 = 0; e150 < c150.pins.length; e150++) {
            const f150 = c150.pins[e150];
            const g150 = f150.name.toUpperCase();
            if (g150 === 'K' || g150 === 'C' || g150 === 'CATHODE' || g150 === '2') {
                const h150 = findNetForPinLabel(d150, f150.name) ?? findNetForPinLabel(d150, f150.id);
                if (h150 !== null) {
                    return h150;
                }
            }
        }
        if (c150.pins.length > 1) {
            return findNetForPinLabel(d150, c150.pins[1].name) ?? findNetForPinLabel(d150, c150.pins[1].id);
        }
        return null;
    }
    private isLedConducting(r149: ComponentInstance, s149: ComponentDefinition): boolean {
        const t149 = this.appService.schematicEditor.getDocument();
        const u149 = getPinNetMap(r149.id, t149.nets);
        const v149 = this.findLedAnodeNet(s149, u149);
        const w149 = this.findLedCathodeNet(s149, u149);
        if (v149 === null || w149 === null || v149 === w149) {
            return false;
        }
        const x149 = this.appService.simulationKernel as SimulationKernelImpl;
        const y149 = x149.getNetVoltageByUuid(v149);
        const z149 = x149.getNetVoltageByUuid(w149);
        const a150 = y149 - z149;
        if (a150 < 1.5) {
            return false;
        }
        const b150 = x149.getBranchCurrent(r149.id);
        if (Math.abs(b150) >= 1e-5) {
            return true;
        }
        return a150 >= 1.8;
    }
    private resolveLedDisplayColor(n149: ComponentInstance, o149: ComponentDefinition): string {
        if (!this.isLedWired(n149, o149)) {
            return '';
        }
        const p149 = this.appService.simulationKernel.getState();
        const q149 = p149 === SimulationState.RUNNING || p149 === SimulationState.PAUSED;
        if (!q149) {
            return '';
        }
        if (!this.isLedConducting(n149, o149)) {
            return '';
        }
        return this.resolveLedNominalColor(n149, o149);
    }
    private drawLitLedOverlays(f149: CanvasRenderingContext2D, g149: SchematicDocument): void {
        const h149 = this.appService.schematicEditor as SchematicEditorImpl;
        if (!h149.isLayerVisible(SchematicLayerId.COMPONENTS)) {
            return;
        }
        for (let i149 = 0; i149 < g149.components.length; i149++) {
            const j149 = g149.components[i149];
            if (j149.id === this.dragComponentId) {
                continue;
            }
            const k149 = this.getCachedCompDef(j149.libraryId);
            if (k149 === null || !this.isLedComponent(j149, k149)) {
                continue;
            }
            const l149 = this.resolveLedDisplayColor(j149, k149);
            if (l149.length === 0) {
                continue;
            }
            const m149: SymbolDrawStyle = {
                strokeColor: ProteusColors.COMPONENT_STROKE,
                fillColor: ProteusColors.CANVAS_BG,
                lineWidth: 1.2,
                selected: false,
                hovered: false,
                ledDisplayColor: l149
            };
            SchematicSymbolRenderer.drawComponent(f149, j149.position.x, j149.position.y, k149, j149.refDes, j149.rotation, j149.mirrored, m149);
        }
    }
    private drawFallbackComponent(z148: CanvasRenderingContext2D, a149: ComponentInstance, b149: boolean, c149: boolean): void {
        const d149 = a149.position.x;
        const e149 = a149.position.y;
        z148.strokeStyle = b149 ? ProteusColors.SELECTED : ProteusColors.COMPONENT_STROKE;
        z148.lineWidth = b149 ? 2 : 1.2;
        z148.fillStyle = '#F8F8FC';
        z148.fillRect(d149 - 30, e149 - 20, 60, 40);
        z148.strokeRect(d149 - 30, e149 - 20, 60, 40);
        z148.fillStyle = ProteusColors.TEXT_PRIMARY;
        z148.font = `bold ${ProteusFonts.CANVAS_LABEL}px sans-serif`;
        z148.textAlign = 'center';
        z148.fillText(a149.refDes, d149, e149 + 3);
        z148.fillStyle = ProteusColors.TEXT_LABEL;
        z148.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        z148.fillText(a149.libraryId, d149, e149 + 16);
        z148.textAlign = 'start';
        z148.fillStyle = ProteusColors.TEXT_SECONDARY;
        z148.beginPath();
        z148.arc(d149 - 30, e149 - 10, 2, 0, Math.PI * 2);
        z148.fill();
        z148.beginPath();
        z148.arc(d149 - 30, e149 + 10, 2, 0, Math.PI * 2);
        z148.fill();
        z148.beginPath();
        z148.arc(d149 + 30, e149 - 10, 2, 0, Math.PI * 2);
        z148.fill();
        z148.beginPath();
        z148.arc(d149 + 30, e149 + 10, 2, 0, Math.PI * 2);
        z148.fill();
    }
    private voltageToColor(o148: number, p148: number = 1.0): string {
        const q148 = Math.max(0, Math.min(5, o148));
        const r148 = q148 / 5;
        let s148: number, t148: number, u148: number;
        if (r148 < 0.25) {
            const y148 = r148 / 0.25;
            s148 = 0;
            t148 = Math.round(100 + 155 * y148);
            u148 = Math.round(255 - 55 * y148);
        }
        else if (r148 < 0.5) {
            const x148 = (r148 - 0.25) / 0.25;
            s148 = Math.round(255 * x148);
            t148 = 255;
            u148 = Math.round(200 - 200 * x148);
        }
        else if (r148 < 0.75) {
            const w148 = (r148 - 0.5) / 0.25;
            s148 = 255;
            t148 = Math.round(255 - 155 * w148);
            u148 = 0;
        }
        else {
            const v148 = (r148 - 0.75) / 0.25;
            s148 = 255;
            t148 = Math.round(100 - 100 * v148);
            u148 = 0;
        }
        return `rgba(${s148},${t148},${u148},${p148})`;
    }
    private drawWires(x146: CanvasRenderingContext2D, y146: Wire[]): void {
        const z146 = y146.length;
        const a147 = this.appService.schematicEditor as SchematicEditorImpl;
        const b147 = a147.getSelectedWireNetIds();
        const c147 = new Set<string>();
        for (let n148 = 0; n148 < b147.length; n148++) {
            c147.add(b147[n148]);
        }
        const d147 = this.appService.simulationKernel.getState();
        const e147 = d147 === SimulationState.RUNNING || d147 === SimulationState.PAUSED;
        const f147 = e147 ? this.getSimNodeVoltages() : new Map<string, number>();
        let g147: ComponentInstance | null = null;
        let h147 = 0;
        let i147 = 0;
        let j147: Point2D[] = [];
        if (this.dragComponentId.length > 0 && this.dragPreviewPos !== null) {
            const h148 = this.appService.schematicEditor.getDocument();
            for (let m148 = 0; m148 < h148.components.length; m148++) {
                if (h148.components[m148].id === this.dragComponentId) {
                    g147 = h148.components[m148];
                    break;
                }
            }
            if (g147 !== null) {
                h147 = this.dragPreviewPos.x - g147.position.x;
                i147 = this.dragPreviewPos.y - g147.position.y;
                const i148 = this.getCachedCompDef(g147.libraryId);
                if (i148 !== null) {
                    for (let j148 = 0; j148 < i148.pins.length; j148++) {
                        const k148 = i148.pins[j148];
                        const l148 = this.transformPinOffset(k148.position, g147.rotation, g147.mirrored);
                        j147.push({ x: g147.position.x + l148.x, y: g147.position.y + l148.y });
                    }
                }
            }
        }
        for (let k147 = 0; k147 < z146; k147++) {
            const l147 = y146[k147];
            const m147 = l147.points;
            if (m147.length < 2) {
                continue;
            }
            const n147: boolean[] = [];
            for (let c148 = 0; c148 < m147.length; c148++) {
                const d148 = m147[c148];
                let e148 = false;
                if (g147 !== null && j147.length > 0) {
                    for (let f148 = 0; f148 < j147.length; f148++) {
                        const g148 = j147[f148];
                        if (Math.abs(d148.x - g148.x) <= 3 && Math.abs(d148.y - g148.y) <= 3) {
                            e148 = true;
                            break;
                        }
                    }
                }
                n147.push(e148);
            }
            const o147: boolean[] = n147.slice();
            if (g147 !== null) {
                for (let x147 = 0; x147 < m147.length; x147++) {
                    if (n147[x147]) {
                        if (x147 > 0) {
                            const a148 = m147[x147 - 1];
                            const b148 = m147[x147];
                            if (a148.x === b148.x || a148.y === b148.y) {
                                o147[x147 - 1] = true;
                            }
                        }
                        if (x147 < m147.length - 1) {
                            const y147 = m147[x147 + 1];
                            const z147 = m147[x147];
                            if (y147.x === z147.x || y147.y === z147.y) {
                                o147[x147 + 1] = true;
                            }
                        }
                    }
                }
            }
            const p147: Point2D[] = [];
            for (let v147 = 0; v147 < m147.length; v147++) {
                const w147 = m147[v147];
                if (o147[v147]) {
                    p147.push({ x: w147.x + h147, y: w147.y + i147 });
                }
                else {
                    p147.push({ x: w147.x, y: w147.y });
                }
            }
            if (p147.length === 3 && g147 !== null && (o147[0] || o147[2])) {
                p147[1] = this.smartMidpoint(p147[0], p147[2], this.dragComponentId);
            }
            const q147 = c147.has(l147.netId);
            const r147 = l147.netId === this.hoverWireNetId && !q147;
            if (r147) {
                x146.strokeStyle = 'rgba(0, 170, 255, 0.35)';
                x146.lineWidth = 7;
                x146.beginPath();
                x146.moveTo(p147[0].x, p147[0].y);
                for (let u147 = 1; u147 < p147.length; u147++) {
                    x146.lineTo(p147[u147].x, p147[u147].y);
                }
                x146.stroke();
            }
            if (q147) {
                x146.strokeStyle = ProteusColors.SELECTED;
                x146.lineWidth = 3;
            }
            else if (e147 && l147.netId.length > 0) {
                const t147 = f147.get(l147.netId) ?? 0;
                x146.strokeStyle = this.voltageToColor(t147);
                x146.lineWidth = 2.0;
            }
            else {
                x146.strokeStyle = ProteusColors.WIRE;
                x146.lineWidth = 1.5;
            }
            x146.beginPath();
            x146.moveTo(p147[0].x, p147[0].y);
            for (let s147 = 1; s147 < p147.length; s147++) {
                x146.lineTo(p147[s147].x, p147[s147].y);
            }
            x146.stroke();
        }
        this.drawWireJunctions(x146, y146);
    }
    private getSimNodeVoltages(): Map<string, number> {
        const p146 = this.appService.schematicEditor.getDocument();
        const q146 = new Map<string, number>();
        const r146 = this.appService.simulationKernel.netToSpiceNodeMap();
        let s146 = false;
        for (const t146 of p146.nets) {
            const u146 = r146.get(t146.id) ?? t146.id;
            const v146 = this.appService.simulationKernel.getNodeVoltage(u146);
            q146.set(t146.id, v146);
            const w146 = this.cachedNodeVoltages.get(t146.id);
            if (w146 === undefined || Math.abs(w146 - v146) > 0.001) {
                s146 = true;
            }
        }
        if (s146) {
            this.cachedNodeVoltages = q146;
        }
        return q146;
    }
    private drawWireJunctions(v145: CanvasRenderingContext2D, w145: Wire[]): void {
        const x145 = this.appService.schematicEditor.getDocument();
        const y145 = `${x145.wires.length}_${this.lastDocChangeVer}`;
        if (this.juncCache !== null && this.juncCacheKey === y145) {
            this.renderJuncPoints(v145, this.juncCache);
            return;
        }
        const z145 = new Map<string, number>();
        for (let k146 = 0; k146 < w145.length; k146++) {
            const l146 = w145[k146];
            for (let m146 = 0; m146 < l146.points.length; m146++) {
                const n146 = l146.points[m146];
                const o146 = `${Math.round(n146.x)},${Math.round(n146.y)}`;
                z145.set(o146, (z145.get(o146) ?? 0) + 1);
            }
        }
        for (let a146 = 0; a146 < w145.length; a146++) {
            const b146 = w145[a146];
            if (b146.points.length < 2)
                continue;
            for (let c146 = 0; c146 < w145.length; c146++) {
                if (a146 === c146)
                    continue;
                const d146 = w145[c146];
                for (let e146 = 0; e146 < d146.points.length; e146++) {
                    const f146 = d146.points[e146];
                    for (let g146 = 0; g146 < b146.points.length - 1; g146++) {
                        const h146 = b146.points[g146];
                        const i146 = b146.points[g146 + 1];
                        const j146 = `${Math.round(f146.x)},${Math.round(f146.y)}`;
                        if ((z145.get(j146) ?? 0) >= 2)
                            continue;
                        if (this.pointOnSegment(f146, h146, i146)) {
                            z145.set(j146, (z145.get(j146) ?? 0) + 2);
                        }
                    }
                }
            }
        }
        this.juncCache = z145;
        this.juncCacheKey = y145;
        this.renderJuncPoints(v145, z145);
    }
    private pointOnSegment(d145: Point2D, e145: Point2D, f145: Point2D, g145: number = 4): boolean {
        const h145 = Math.round(d145.x);
        const i145 = Math.round(d145.y);
        const j145 = Math.round(e145.x);
        const k145 = Math.round(e145.y);
        const l145 = Math.round(f145.x);
        const m145 = Math.round(f145.y);
        if (j145 === l145) {
            const t145 = Math.min(k145, m145) - g145;
            const u145 = Math.max(k145, m145) + g145;
            return Math.abs(h145 - j145) <= g145 && i145 >= t145 && i145 <= u145;
        }
        if (k145 === m145) {
            const r145 = Math.min(j145, l145) - g145;
            const s145 = Math.max(j145, l145) + g145;
            return Math.abs(i145 - k145) <= g145 && h145 >= r145 && h145 <= s145;
        }
        const n145 = (h145 - j145) * (m145 - k145) - (i145 - k145) * (l145 - j145);
        const o145 = Math.sqrt((l145 - j145) ** 2 + (m145 - k145) ** 2);
        const p145 = o145 > 0 ? Math.abs(n145) / o145 : Infinity;
        if (p145 > g145)
            return false;
        const q145 = (h145 - j145) * (l145 - j145) + (i145 - k145) * (m145 - k145);
        return q145 >= -g145 && q145 <= o145 * o145 + g145;
    }
    private renderJuncPoints(w144: CanvasRenderingContext2D, x144: Map<string, number>): void {
        w144.fillStyle = ProteusColors.WIRE;
        x144.forEach((y144: number, z144: string) => {
            if (y144 >= 2) {
                const a145 = z144.split(',');
                const b145 = parseInt(a145[0]);
                const c145 = parseInt(a145[1]);
                w144.beginPath();
                w144.arc(b145, c145, 2.5, 0, Math.PI * 2);
                w144.fill();
            }
        });
    }
    private drawWireConnectionMarkers(e144: CanvasRenderingContext2D): void {
        const f144 = this.appService.schematicEditor.getDocument();
        if (f144.wires.length === 0) {
            return;
        }
        const g144 = new Set<string>();
        for (let o144 = 0; o144 < f144.components.length; o144++) {
            const p144 = f144.components[o144];
            const q144 = this.getCachedCompDef(p144.libraryId);
            if (q144 === null) {
                continue;
            }
            for (let r144 = 0; r144 < q144.pins.length; r144++) {
                const s144 = q144.pins[r144];
                const t144 = this.transformPinOffset(s144.position, p144.rotation, p144.mirrored);
                const u144 = Math.round(p144.position.x + t144.x);
                const v144 = Math.round(p144.position.y + t144.y);
                g144.add(`${u144},${v144}`);
            }
        }
        e144.fillStyle = ProteusColors.WIRE;
        const h144 = new Set<string>();
        for (let i144 = 0; i144 < f144.wires.length; i144++) {
            const j144 = f144.wires[i144];
            if (j144.points.length < 2) {
                continue;
            }
            const k144 = [j144.points[0], j144.points[j144.points.length - 1]];
            for (let l144 = 0; l144 < k144.length; l144++) {
                const m144 = k144[l144];
                const n144 = `${Math.round(m144.x)},${Math.round(m144.y)}`;
                if (g144.has(n144) && !h144.has(n144)) {
                    h144.add(n144);
                    e144.beginPath();
                    e144.arc(m144.x, m144.y, 3, 0, Math.PI * 2);
                    e144.fill();
                }
            }
        }
    }
    private drawNetLabels(w143: CanvasRenderingContext2D, x143: SchematicDocument): void {
        if (!x143.netLabels) {
            return;
        }
        for (let y143 = 0; y143 < x143.netLabels.length; y143++) {
            const z143 = x143.netLabels[y143];
            const a144 = z143.position.x;
            const b144 = z143.position.y;
            const c144 = z143.text === 'VCC' || z143.text === 'VDD' || z143.text === 'V+';
            const d144 = z143.text === 'GND';
            if (c144) {
                this.drawPowerSymbol(w143, a144, b144, z143.text);
            }
            else if (d144) {
                this.drawGroundSymbol(w143, a144, b144);
            }
            else {
                w143.fillStyle = ProteusColors.TEXT_PRIMARY;
                w143.font = `${ProteusFonts.CANVAS_LABEL}px sans-serif`;
                w143.fillText(z143.text, a144, b144);
            }
        }
    }
    private drawPowerSymbol(s143: CanvasRenderingContext2D, t143: number, u143: number, v143: string): void {
        s143.strokeStyle = ProteusColors.POWER;
        s143.fillStyle = ProteusColors.POWER;
        s143.lineWidth = 1.2;
        s143.beginPath();
        s143.moveTo(t143, u143);
        s143.lineTo(t143, u143 - 10);
        s143.stroke();
        s143.beginPath();
        s143.moveTo(t143 - 4, u143 - 6);
        s143.lineTo(t143, u143 - 10);
        s143.lineTo(t143 + 4, u143 - 6);
        s143.closePath();
        s143.fill();
        s143.font = `${ProteusFonts.CANVAS_LABEL - 1}px sans-serif`;
        s143.textAlign = 'center';
        s143.fillText(v143, t143, u143 - 14);
        s143.textAlign = 'start';
    }
    private drawGroundSymbol(l143: CanvasRenderingContext2D, m143: number, n143: number): void {
        l143.strokeStyle = ProteusColors.GROUND;
        l143.lineWidth = 1.2;
        l143.beginPath();
        l143.moveTo(m143, n143);
        l143.lineTo(m143, n143 + 6);
        l143.stroke();
        const o143 = [10, 7, 4];
        for (let p143 = 0; p143 < 3; p143++) {
            const q143 = n143 + 7 + p143 * 3;
            const r143 = o143[p143] / 2;
            l143.beginPath();
            l143.moveTo(m143 - r143, q143);
            l143.lineTo(m143 + r143, q143);
            l143.stroke();
        }
    }
    private drawErcMarkers(y142: CanvasRenderingContext2D, z142: SchematicDocument): void {
        const a143 = new Map<string, ComponentInstance>();
        for (let k143 = 0; k143 < z142.components.length; k143++) {
            a143.set(z142.components[k143].id, z142.components[k143]);
        }
        for (let b143 = 0; b143 < this.ercErrors.length; b143++) {
            const c143 = this.ercErrors[b143];
            const d143 = a143.get(c143.targetUuid);
            if (d143 === undefined) {
                continue;
            }
            const e143 = d143.position.x;
            const f143 = d143.position.y;
            const g143 = c143.severity === 'error' || c143.severity === 'critical';
            const h143 = g143 ? ProteusColors.ERC_ERR : ProteusColors.ERC_WARN;
            y142.strokeStyle = h143;
            y142.fillStyle = h143;
            y142.lineWidth = 1.5;
            y142.beginPath();
            y142.arc(e143 + 20, f143 - 20, 7, 0, Math.PI * 2);
            y142.stroke();
            y142.lineWidth = 1.2;
            y142.beginPath();
            y142.moveTo(e143 + 16, f143 - 24);
            y142.lineTo(e143 + 24, f143 - 16);
            y142.stroke();
            y142.beginPath();
            y142.moveTo(e143 + 24, f143 - 24);
            y142.lineTo(e143 + 16, f143 - 16);
            y142.stroke();
            if (b143 === 0 || this.ercErrors[b143 - 1].targetUuid !== c143.targetUuid) {
                let i143 = 1;
                for (let j143 = b143 + 1; j143 < this.ercErrors.length; j143++) {
                    if (this.ercErrors[j143].targetUuid === c143.targetUuid) {
                        i143++;
                    }
                }
                if (i143 > 1) {
                    y142.font = '8px sans-serif';
                    y142.textAlign = 'center';
                    y142.fillText(`${i143}`, e143 + 20, f143 - 17);
                    y142.textAlign = 'start';
                }
            }
        }
    }
    private drawHRuler(): void {
        const p142 = this.rulerHCtx;
        const q142 = this.appService.schematicEditor.getViewport();
        const r142 = this.viewWidth;
        const s142 = ProteusDimens.RULER_SIZE;
        p142.clearRect(0, 0, r142, s142);
        p142.fillStyle = ProteusColors.CANVAS_BG;
        p142.fillRect(0, 0, r142, s142);
        p142.strokeStyle = ProteusColors.TEXT_PRIMARY;
        p142.fillStyle = ProteusColors.TEXT_PRIMARY;
        p142.font = `${ProteusFonts.RULER}px sans-serif`;
        p142.lineWidth = 0.5;
        const t142 = q142.gridSize * 5;
        const u142 = Math.floor((-q142.panOffset.x / q142.zoom) / t142) * t142;
        const v142 = u142 + Math.ceil(r142 / q142.zoom) + t142;
        for (let w142 = u142; w142 <= v142; w142 += t142) {
            const x142 = w142 * q142.zoom + q142.panOffset.x;
            if (x142 < 0 || x142 > r142) {
                continue;
            }
            p142.beginPath();
            p142.moveTo(x142, s142 - 6);
            p142.lineTo(x142, s142);
            p142.stroke();
            p142.fillText(`${w142}`, x142 + 2, s142 - 8);
        }
    }
    private drawVRuler(): void {
        const g142 = this.rulerVCtx;
        const h142 = this.appService.schematicEditor.getViewport();
        const i142 = ProteusDimens.RULER_SIZE;
        const j142 = this.viewHeight;
        g142.clearRect(0, 0, i142, j142);
        g142.fillStyle = ProteusColors.CANVAS_BG;
        g142.fillRect(0, 0, i142, j142);
        g142.strokeStyle = ProteusColors.TEXT_PRIMARY;
        g142.fillStyle = ProteusColors.TEXT_PRIMARY;
        g142.font = `${ProteusFonts.RULER}px sans-serif`;
        g142.lineWidth = 0.5;
        const k142 = h142.gridSize * 5;
        const l142 = Math.floor((-h142.panOffset.y / h142.zoom) / k142) * k142;
        const m142 = l142 + Math.ceil(j142 / h142.zoom) + k142;
        for (let n142 = l142; n142 <= m142; n142 += k142) {
            const o142 = n142 * h142.zoom + h142.panOffset.y;
            if (o142 < 0 || o142 > j142) {
                continue;
            }
            g142.beginPath();
            g142.moveTo(i142 - 6, o142);
            g142.lineTo(i142, o142);
            g142.stroke();
            g142.fillText(`${n142}`, 2, o142 - 2);
        }
    }
    rerender() {
        this.updateDirtyElements();
    }
}
