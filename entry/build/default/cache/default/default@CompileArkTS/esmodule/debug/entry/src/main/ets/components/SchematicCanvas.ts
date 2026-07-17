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
    interactiveToggleCompId?: string;
    potDragCompId?: string;
    potDragLastWiper?: number;
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
    gestureBusy?: boolean;
    gestureIdleTimer?: number;
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
import { ProteusClassicBtn } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import { ThemeManager } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ThemeManager";
import { SchematicLayerId } from "@bundle:com.elecdraw.aischsim/entry@schematic_editor/Index";
import type { SchematicEditorImpl } from "@bundle:com.elecdraw.aischsim/entry@schematic_editor/Index";
interface RgbColor {
    r: number;
    g: number;
    b: number;
}
export class SchematicCanvas extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__canvasVersion = new SynchedPropertySimpleTwoWayPU(params.canvasVersion, this, "canvasVersion");
        this.__selectedComponentId = new SynchedPropertySimpleTwoWayPU(params.selectedComponentId, this, "selectedComponentId");
        this.__mouseX = new SynchedPropertySimpleTwoWayPU(params.mouseX, this, "mouseX");
        this.__mouseY = new SynchedPropertySimpleTwoWayPU(params.mouseY, this, "mouseY");
        this.__zoomPercent = new SynchedPropertySimpleTwoWayPU(params.zoomPercent, this, "zoomPercent");
        this.__toolMode = new SynchedPropertySimpleTwoWayPU(params.toolMode, this, "toolMode");
        this.__pendingLibraryId = new SynchedPropertySimpleTwoWayPU(params.pendingLibraryId, this, "pendingLibraryId");
        this.__wireStartActive = new SynchedPropertySimpleTwoWayPU(params.wireStartActive, this, "wireStartActive");
        this.__wireStartX = new SynchedPropertySimpleTwoWayPU(params.wireStartX, this, "wireStartX");
        this.__wireStartY = new SynchedPropertySimpleTwoWayPU(params.wireStartY, this, "wireStartY");
        this.__rulerVisible = new SynchedPropertySimpleOneWayPU(params.rulerVisible, this, "rulerVisible");
        this.__ercErrors = new SynchedPropertyObjectOneWayPU(params.ercErrors, this, "ercErrors");
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
        this.interactiveToggleCompId = '';
        this.potDragCompId = '';
        this.potDragLastWiper = -1;
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
        this.gestureBusy = false;
        this.gestureIdleTimer = -1;
        this.onSchematicChanged = (_payload: ModuleEventPayload): void => {
            this.backgroundDirty = true;
            this.invalidateJuncCache();
            this.compDefCache.clear();
            this.cachedNodeVoltages.clear();
            this.lastDocChangeVer++;
            this.rulerDirty = true;
            this.scheduleRedraw();
            this.onDocumentChanged();
        };
        this.onViewportChanged = (_payload: ModuleEventPayload): void => {
            this.backgroundDirty = true;
            this.rulerDirty = true;
            this.scheduleRedraw();
            this.zoomPercent = Math.round(this.appService.schematicEditor.getZoom() * 100);
        };
        this.onSimStep = (_payload: ModuleEventPayload): void => {
            if (this.gestureBusy) {
                return;
            }
            this.simFrameDirty = true;
            this.scheduleRedraw();
        };
        this.onSimulationStarted = (_payload: ModuleEventPayload): void => {
            this.blockWireEditing();
            if (this.toolMode === EditorToolMode.WIRE || this.toolMode === EditorToolMode.BUS) {
                this.toolMode = EditorToolMode.SELECT;
            }
            this.scheduleRedraw();
        };
        this.setInitiallyProvidedValue(params);
        this.declareWatch("canvasVersion", this.onCanvasVersionChange);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: SchematicCanvas_Params) {
        if (params.rulerVisible === undefined) {
            this.__rulerVisible.set(true);
        }
        if (params.ercErrors === undefined) {
            this.__ercErrors.set([]);
        }
        if (params.onStatusChange !== undefined) {
            this.onStatusChange = params.onStatusChange;
        }
        if (params.onDocumentChanged !== undefined) {
            this.onDocumentChanged = params.onDocumentChanged;
        }
        if (params.onCopySelected !== undefined) {
            this.onCopySelected = params.onCopySelected;
        }
        if (params.onDeleteSelected !== undefined) {
            this.onDeleteSelected = params.onDeleteSelected;
        }
        if (params.settings !== undefined) {
            this.settings = params.settings;
        }
        if (params.context !== undefined) {
            this.context = params.context;
        }
        if (params.wireCtx !== undefined) {
            this.wireCtx = params.wireCtx;
        }
        if (params.rulerHCtx !== undefined) {
            this.rulerHCtx = params.rulerHCtx;
        }
        if (params.rulerVCtx !== undefined) {
            this.rulerVCtx = params.rulerVCtx;
        }
        if (params.appService !== undefined) {
            this.appService = params.appService;
        }
        if (params.pointerDown !== undefined) {
            this.pointerDown = params.pointerDown;
        }
        if (params.dragComponentId !== undefined) {
            this.dragComponentId = params.dragComponentId;
        }
        if (params.dragStartPos !== undefined) {
            this.dragStartPos = params.dragStartPos;
        }
        if (params.dragPreviewPos !== undefined) {
            this.dragPreviewPos = params.dragPreviewPos;
        }
        if (params.lastPointerX !== undefined) {
            this.lastPointerX = params.lastPointerX;
        }
        if (params.lastPointerY !== undefined) {
            this.lastPointerY = params.lastPointerY;
        }
        if (params.downPointerX !== undefined) {
            this.downPointerX = params.downPointerX;
        }
        if (params.downPointerY !== undefined) {
            this.downPointerY = params.downPointerY;
        }
        if (params.viewWidth !== undefined) {
            this.viewWidth = params.viewWidth;
        }
        if (params.viewHeight !== undefined) {
            this.viewHeight = params.viewHeight;
        }
        if (params.canvasReady !== undefined) {
            this.canvasReady = params.canvasReady;
        }
        if (params.needsFitOnLayout !== undefined) {
            this.needsFitOnLayout = params.needsFitOnLayout;
        }
        if (params.redrawScheduled !== undefined) {
            this.redrawScheduled = params.redrawScheduled;
        }
        if (params.redrawTimer !== undefined) {
            this.redrawTimer = params.redrawTimer;
        }
        if (params.hoverComponentId !== undefined) {
            this.hoverComponentId = params.hoverComponentId;
        }
        if (params.hoverWireNetId !== undefined) {
            this.hoverWireNetId = params.hoverWireNetId;
        }
        if (params.contextMenuVisible !== undefined) {
            this.contextMenuVisible = params.contextMenuVisible;
        }
        if (params.contextMenuScreenX !== undefined) {
            this.contextMenuScreenX = params.contextMenuScreenX;
        }
        if (params.contextMenuScreenY !== undefined) {
            this.contextMenuScreenY = params.contextMenuScreenY;
        }
        if (params.previewWireEnd !== undefined) {
            this.previewWireEnd = params.previewWireEnd;
        }
        if (params.placementPreview !== undefined) {
            this.placementPreview = params.placementPreview;
        }
        if (params.isBoxSelecting !== undefined) {
            this.isBoxSelecting = params.isBoxSelecting;
        }
        if (params.boxSelectStart !== undefined) {
            this.boxSelectStart = params.boxSelectStart;
        }
        if (params.boxSelectEnd !== undefined) {
            this.boxSelectEnd = params.boxSelectEnd;
        }
        if (params.shiftHeld !== undefined) {
            this.shiftHeld = params.shiftHeld;
        }
        if (params.alignGuideX !== undefined) {
            this.alignGuideX = params.alignGuideX;
        }
        if (params.wireWaypoints !== undefined) {
            this.wireWaypoints = params.wireWaypoints;
        }
        if (params.alignGuideY !== undefined) {
            this.alignGuideY = params.alignGuideY;
        }
        if (params.dragBlocked !== undefined) {
            this.dragBlocked = params.dragBlocked;
        }
        if (params.interactiveToggleCompId !== undefined) {
            this.interactiveToggleCompId = params.interactiveToggleCompId;
        }
        if (params.potDragCompId !== undefined) {
            this.potDragCompId = params.potDragCompId;
        }
        if (params.potDragLastWiper !== undefined) {
            this.potDragLastWiper = params.potDragLastWiper;
        }
        if (params.lastDownTime !== undefined) {
            this.lastDownTime = params.lastDownTime;
        }
        if (params.lastUpTime !== undefined) {
            this.lastUpTime = params.lastUpTime;
        }
        if (params.middlePanning !== undefined) {
            this.middlePanning = params.middlePanning;
        }
        if (params.middlePanLastX !== undefined) {
            this.middlePanLastX = params.middlePanLastX;
        }
        if (params.middlePanLastY !== undefined) {
            this.middlePanLastY = params.middlePanLastY;
        }
        if (params.simFrameDirty !== undefined) {
            this.simFrameDirty = params.simFrameDirty;
        }
        if (params.backgroundDirty !== undefined) {
            this.backgroundDirty = params.backgroundDirty;
        }
        if (params.gridTile !== undefined) {
            this.gridTile = params.gridTile;
        }
        if (params.gridTileKey !== undefined) {
            this.gridTileKey = params.gridTileKey;
        }
        if (params.gridTileWorldW !== undefined) {
            this.gridTileWorldW = params.gridTileWorldW;
        }
        if (params.gridTileWorldH !== undefined) {
            this.gridTileWorldH = params.gridTileWorldH;
        }
        if (params.compDefCache !== undefined) {
            this.compDefCache = params.compDefCache;
        }
        if (params.juncCache !== undefined) {
            this.juncCache = params.juncCache;
        }
        if (params.juncCacheKey !== undefined) {
            this.juncCacheKey = params.juncCacheKey;
        }
        if (params.lastDocChangeVer !== undefined) {
            this.lastDocChangeVer = params.lastDocChangeVer;
        }
        if (params.rulerDirty !== undefined) {
            this.rulerDirty = params.rulerDirty;
        }
        if (params.cachedNodeVoltages !== undefined) {
            this.cachedNodeVoltages = params.cachedNodeVoltages;
        }
        if (params.isTouchActive !== undefined) {
            this.isTouchActive = params.isTouchActive;
        }
        if (params.touchCooldownTimer !== undefined) {
            this.touchCooldownTimer = params.touchCooldownTimer;
        }
        if (params.twoFingerPanning !== undefined) {
            this.twoFingerPanning = params.twoFingerPanning;
        }
        if (params.twoFingerLastMidX !== undefined) {
            this.twoFingerLastMidX = params.twoFingerLastMidX;
        }
        if (params.twoFingerLastMidY !== undefined) {
            this.twoFingerLastMidY = params.twoFingerLastMidY;
        }
        if (params.gestureBusy !== undefined) {
            this.gestureBusy = params.gestureBusy;
        }
        if (params.gestureIdleTimer !== undefined) {
            this.gestureIdleTimer = params.gestureIdleTimer;
        }
        if (params.onSchematicChanged !== undefined) {
            this.onSchematicChanged = params.onSchematicChanged;
        }
        if (params.onViewportChanged !== undefined) {
            this.onViewportChanged = params.onViewportChanged;
        }
        if (params.onSimStep !== undefined) {
            this.onSimStep = params.onSimStep;
        }
        if (params.onSimulationStarted !== undefined) {
            this.onSimulationStarted = params.onSimulationStarted;
        }
    }
    updateStateVars(params: SchematicCanvas_Params) {
        this.__rulerVisible.reset(params.rulerVisible);
        this.__ercErrors.reset(params.ercErrors);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__canvasVersion.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedComponentId.purgeDependencyOnElmtId(rmElmtId);
        this.__mouseX.purgeDependencyOnElmtId(rmElmtId);
        this.__mouseY.purgeDependencyOnElmtId(rmElmtId);
        this.__zoomPercent.purgeDependencyOnElmtId(rmElmtId);
        this.__toolMode.purgeDependencyOnElmtId(rmElmtId);
        this.__pendingLibraryId.purgeDependencyOnElmtId(rmElmtId);
        this.__wireStartActive.purgeDependencyOnElmtId(rmElmtId);
        this.__wireStartX.purgeDependencyOnElmtId(rmElmtId);
        this.__wireStartY.purgeDependencyOnElmtId(rmElmtId);
        this.__rulerVisible.purgeDependencyOnElmtId(rmElmtId);
        this.__ercErrors.purgeDependencyOnElmtId(rmElmtId);
        this.__hoverComponentId.purgeDependencyOnElmtId(rmElmtId);
        this.__hoverWireNetId.purgeDependencyOnElmtId(rmElmtId);
        this.__contextMenuVisible.purgeDependencyOnElmtId(rmElmtId);
        this.__contextMenuScreenX.purgeDependencyOnElmtId(rmElmtId);
        this.__contextMenuScreenY.purgeDependencyOnElmtId(rmElmtId);
        this.__previewWireEnd.purgeDependencyOnElmtId(rmElmtId);
        this.__placementPreview.purgeDependencyOnElmtId(rmElmtId);
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
    set canvasVersion(newValue: number) {
        this.__canvasVersion.set(newValue);
    }
    private __selectedComponentId: SynchedPropertySimpleTwoWayPU<string>;
    get selectedComponentId() {
        return this.__selectedComponentId.get();
    }
    set selectedComponentId(newValue: string) {
        this.__selectedComponentId.set(newValue);
    }
    private __mouseX: SynchedPropertySimpleTwoWayPU<number>;
    get mouseX() {
        return this.__mouseX.get();
    }
    set mouseX(newValue: number) {
        this.__mouseX.set(newValue);
    }
    private __mouseY: SynchedPropertySimpleTwoWayPU<number>;
    get mouseY() {
        return this.__mouseY.get();
    }
    set mouseY(newValue: number) {
        this.__mouseY.set(newValue);
    }
    private __zoomPercent: SynchedPropertySimpleTwoWayPU<number>;
    get zoomPercent() {
        return this.__zoomPercent.get();
    }
    set zoomPercent(newValue: number) {
        this.__zoomPercent.set(newValue);
    }
    private __toolMode: SynchedPropertySimpleTwoWayPU<EditorToolMode>;
    get toolMode() {
        return this.__toolMode.get();
    }
    set toolMode(newValue: EditorToolMode) {
        this.__toolMode.set(newValue);
    }
    private __pendingLibraryId: SynchedPropertySimpleTwoWayPU<string>;
    get pendingLibraryId() {
        return this.__pendingLibraryId.get();
    }
    set pendingLibraryId(newValue: string) {
        this.__pendingLibraryId.set(newValue);
    }
    private __wireStartActive: SynchedPropertySimpleTwoWayPU<boolean>;
    get wireStartActive() {
        return this.__wireStartActive.get();
    }
    set wireStartActive(newValue: boolean) {
        this.__wireStartActive.set(newValue);
    }
    private __wireStartX: SynchedPropertySimpleTwoWayPU<number>;
    get wireStartX() {
        return this.__wireStartX.get();
    }
    set wireStartX(newValue: number) {
        this.__wireStartX.set(newValue);
    }
    private __wireStartY: SynchedPropertySimpleTwoWayPU<number>;
    get wireStartY() {
        return this.__wireStartY.get();
    }
    set wireStartY(newValue: number) {
        this.__wireStartY.set(newValue);
    }
    private __rulerVisible: SynchedPropertySimpleOneWayPU<boolean>;
    get rulerVisible() {
        return this.__rulerVisible.get();
    }
    set rulerVisible(newValue: boolean) {
        this.__rulerVisible.set(newValue);
    }
    private __ercErrors: SynchedPropertySimpleOneWayPU<ErcError[]>;
    get ercErrors() {
        return this.__ercErrors.get();
    }
    set ercErrors(newValue: ErcError[]) {
        this.__ercErrors.set(newValue);
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
    set hoverComponentId(newValue: string) {
        this.__hoverComponentId.set(newValue);
    }
    private __hoverWireNetId: ObservedPropertySimplePU<string>;
    get hoverWireNetId() {
        return this.__hoverWireNetId.get();
    }
    set hoverWireNetId(newValue: string) {
        this.__hoverWireNetId.set(newValue);
    }
    private __contextMenuVisible: ObservedPropertySimplePU<boolean>;
    get contextMenuVisible() {
        return this.__contextMenuVisible.get();
    }
    set contextMenuVisible(newValue: boolean) {
        this.__contextMenuVisible.set(newValue);
    }
    private __contextMenuScreenX: ObservedPropertySimplePU<number>;
    get contextMenuScreenX() {
        return this.__contextMenuScreenX.get();
    }
    set contextMenuScreenX(newValue: number) {
        this.__contextMenuScreenX.set(newValue);
    }
    private __contextMenuScreenY: ObservedPropertySimplePU<number>;
    get contextMenuScreenY() {
        return this.__contextMenuScreenY.get();
    }
    set contextMenuScreenY(newValue: number) {
        this.__contextMenuScreenY.set(newValue);
    }
    private __previewWireEnd: ObservedPropertyObjectPU<Point2D | null>;
    get previewWireEnd() {
        return this.__previewWireEnd.get();
    }
    set previewWireEnd(newValue: Point2D | null) {
        this.__previewWireEnd.set(newValue);
    }
    private __placementPreview: ObservedPropertyObjectPU<Point2D | null>;
    get placementPreview() {
        return this.__placementPreview.get();
    }
    set placementPreview(newValue: Point2D | null) {
        this.__placementPreview.set(newValue);
    }
    private isBoxSelecting: boolean;
    private boxSelectStart: Point2D;
    private boxSelectEnd: Point2D;
    private shiftHeld: boolean;
    private alignGuideX: number | null;
    private wireWaypoints: Point2D[]; // Proteus-style multi-point wire drawing
    private alignGuideY: number | null;
    private dragBlocked: boolean; // true when component/layer locked, prevents accidental pan
    /** Sim-time pushbutton candidate — toggled on short click without drag */
    private interactiveToggleCompId: string;
    /** Sim-time potentiometer drag — horizontal local-X maps to wiper 0..1 */
    private potDragCompId: string;
    private potDragLastWiper: number;
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
    private isTouchActive: boolean; // distinguish touch from mouse to avoid double-processing
    private touchCooldownTimer: number; // reset isTouchActive after cooldown (ms)
    private twoFingerPanning: boolean;
    private twoFingerLastMidX: number;
    private twoFingerLastMidY: number;
    /** Pinch/pan in flight — skip sim-driven redraw so MMI is not starved */
    private gestureBusy: boolean;
    private gestureIdleTimer: number;
    private static readonly TAP_SLOP: number = 12;
    private static readonly MOVE_THRESHOLD: number = 8;
    private static readonly REDRAW_INTERVAL_MS: number = 16;
    private static readonly GESTURE_REDRAW_MS: number = 48;
    private static readonly ALIGN_THRESHOLD: number = 6;
    aboutToAppear(): void {
        EventBus.getInstance().subscribe(ModuleEvent.SCHEMATIC_CHANGED, this.onSchematicChanged);
        EventBus.getInstance().subscribe(ModuleEvent.VIEWPORT_CHANGED, this.onViewportChanged);
        EventBus.getInstance().subscribe(ModuleEvent.SIMULATION_STEP, this.onSimStep);
        EventBus.getInstance().subscribe(ModuleEvent.SIMULATION_STARTED, this.onSimulationStarted);
        // Fallback: layout may complete after onReady — force a full paint once sizes settle.
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
        if (this.gestureIdleTimer >= 0) {
            clearTimeout(this.gestureIdleTimer);
            this.gestureIdleTimer = -1;
        }
        this.appService.setUiGestureBusy(false);
        this.clearTouchCooldown();
        this.isTouchActive = false;
        this.twoFingerPanning = false;
        this.cancelPointerInteraction();
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
    private markGestureBusy(): void {
        this.gestureBusy = true;
        this.appService.setUiGestureBusy(true);
        if (this.gestureIdleTimer >= 0) {
            clearTimeout(this.gestureIdleTimer);
        }
        this.gestureIdleTimer = setTimeout(() => {
            this.gestureIdleTimer = -1;
            this.gestureBusy = false;
            this.appService.setUiGestureBusy(false);
            this.backgroundDirty = true;
            this.scheduleRedraw();
        }, 120);
    }
    private scheduleRedraw(): void {
        if (this.viewWidth <= 0 || this.viewHeight <= 0) {
            return;
        }
        if (this.redrawScheduled) {
            return;
        }
        this.redrawScheduled = true;
        const delay = this.gestureBusy ?
            SchematicCanvas.GESTURE_REDRAW_MS : SchematicCanvas.REDRAW_INTERVAL_MS;
        this.redrawTimer = setTimeout(() => {
            this.redrawScheduled = false;
            this.redrawTimer = -1;
            this.redraw();
        }, delay);
    }
    /** Immediate full repaint — used when canvas size changes or on first layout. */
    private forceFullRedraw(_reason: string = ''): void {
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
    private ensureLayoutRedraw(reason: string): void {
        if (this.viewWidth > 0 && this.viewHeight > 0) {
            this.forceFullRedraw(reason);
        }
    }
    private onCanvasAreaChange(area: Area): void {
        const nw = Math.max(0, Math.floor(area.width as number));
        const nh = Math.max(0, Math.floor(area.height as number));
        if (nw <= 0 || nh <= 0) {
            return;
        }
        const prevW = this.viewWidth;
        const prevH = this.viewHeight;
        const sizeChanged = Math.abs(nw - prevW) > 0.5 || Math.abs(nh - prevH) > 0.5;
        const wasUnlaid = prevW <= 0 || prevH <= 0;
        this.viewWidth = nw;
        this.viewHeight = nh;
        (this.appService.schematicEditor as SchematicEditorImpl).setCanvasViewSize(nw, nh);
        if (sizeChanged || !this.canvasReady) {
            this.canvasReady = true;
            this.forceFullRedraw('areaChange');
            const growAfterMaximize = !wasUnlaid && (nw - prevW > 64 || nh - prevH > 64);
            if (this.needsFitOnLayout || wasUnlaid || growAfterMaximize) {
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
    private setWireStart(point: Point2D | null): void {
        if (point === null) {
            this.wireStartActive = false;
            this.wireStartX = 0;
            this.wireStartY = 0;
        }
        else {
            this.wireStartActive = true;
            this.wireStartX = point.x;
            this.wireStartY = point.y;
        }
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.rulerVisible) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create();
                        Row.width('100%');
                    }, Row);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.width(ProteusDimens.RULER_SIZE);
                        Column.height(ProteusDimens.RULER_SIZE);
                        Column.backgroundColor(ProteusColors.PANEL_TITLE_BG);
                        Column.border({ width: { right: 1, bottom: 1 }, color: ProteusColors.DIVIDER });
                    }, Column);
                    Column.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
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
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.layoutWeight(1);
            Row.width('100%');
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.rulerVisible) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
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
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Stack.create();
            Stack.layoutWeight(1);
            Stack.height('100%');
        }, Stack);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // Layer 0: Background — grid + components (static, rarely redrawn)
            Canvas.create(this.context);
            // Layer 0: Background — grid + components (static, rarely redrawn)
            Canvas.width('100%');
            // Layer 0: Background — grid + components (static, rarely redrawn)
            Canvas.height('100%');
            // Layer 0: Background — grid + components (static, rarely redrawn)
            Canvas.backgroundColor(ProteusColors.CANVAS_BG);
            // Layer 0: Background — grid + components (static, rarely redrawn)
            Canvas.hitTestBehavior(HitTestMode.Block);
            // Layer 0: Background — grid + components (static, rarely redrawn)
            Canvas.focusable(true);
            // Layer 0: Background — grid + components (static, rarely redrawn)
            Canvas.onReady(() => {
                if (this.viewWidth > 0 && this.viewHeight > 0) {
                    this.fullRedraw();
                }
            });
            // Layer 0: Background — grid + components (static, rarely redrawn)
            Canvas.onAreaChange((_old, area) => {
                this.onCanvasAreaChange(area);
            });
            // Layer 0: Background — grid + components (static, rarely redrawn)
            Canvas.onTouch((event: TouchEvent) => this.handleTouch(event));
            // Layer 0: Background — grid + components (static, rarely redrawn)
            Canvas.onMouse((event: MouseEvent) => this.handleMouse(event));
            // Layer 0: Background — grid + components (static, rarely redrawn)
            Canvas.onKeyEvent((event: KeyEvent) => {
                if (event.type === KeyType.Down && event.keyCode === 27) {
                    this.wireWaypoints = [];
                    this.clearSelection();
                    return true;
                }
                return false;
            });
            globalThis.Gesture.create(GesturePriority.Low);
            PinchGesture.create();
            PinchGesture.onActionStart(() => {
                if (this.appService.isAiGenerating()) {
                    return;
                }
                this.markGestureBusy();
            });
            PinchGesture.onActionUpdate((event: GestureEvent) => {
                if (this.appService.isAiGenerating()) {
                    return;
                }
                this.markGestureBusy();
                const editor = this.appService.schematicEditor;
                editor.setZoom(editor.getZoom() * event.scale);
                // schedule via VIEWPORT_CHANGED only — avoid double redraw
            });
            PinchGesture.onActionEnd(() => {
                this.markGestureBusy();
            });
            PinchGesture.pop();
            globalThis.Gesture.pop();
        }, Canvas);
        // Layer 0: Background — grid + components (static, rarely redrawn)
        Canvas.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // Layer 1: Foreground — wires (voltage-colored, redrawn each sim step) + overlays
            Canvas.create(this.wireCtx);
            // Layer 1: Foreground — wires (voltage-colored, redrawn each sim step) + overlays
            Canvas.width('100%');
            // Layer 1: Foreground — wires (voltage-colored, redrawn each sim step) + overlays
            Canvas.height('100%');
            // Layer 1: Foreground — wires (voltage-colored, redrawn each sim step) + overlays
            Canvas.hitTestBehavior(HitTestMode.Transparent);
        }, Canvas);
        // Layer 1: Foreground — wires (voltage-colored, redrawn each sim step) + overlays
        Canvas.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.contextMenuVisible) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create({ space: 4 });
                        Column.padding(6);
                        Column.backgroundColor(ProteusColors.PANEL_TITLE_BG);
                        Column.border({ width: 1, color: ProteusColors.DIVIDER });
                        Column.borderRadius(6);
                        Column.shadow({ radius: 8, color: '#40000000', offsetX: 2, offsetY: 2 });
                        Column.position({ x: this.contextMenuScreenX, y: this.contextMenuScreenY });
                        Column.zIndex(20);
                    }, Column);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '复制',
                                    widthVal: 96,
                                    heightVal: 32,
                                    onAction: () => {
                                        this.contextMenuVisible = false;
                                        this.onCopySelected();
                                    }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/SchematicCanvas.ets", line: 380, col: 15 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '复制',
                                        widthVal: 96,
                                        heightVal: 32,
                                        onAction: () => {
                                            this.contextMenuVisible = false;
                                            this.onCopySelected();
                                        }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '复制',
                                    widthVal: 96,
                                    heightVal: 32
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '删除',
                                    widthVal: 96,
                                    heightVal: 32,
                                    onAction: () => {
                                        this.contextMenuVisible = false;
                                        this.onDeleteSelected();
                                    }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/SchematicCanvas.ets", line: 389, col: 15 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '删除',
                                        widthVal: 96,
                                        heightVal: 32,
                                        onAction: () => {
                                            this.contextMenuVisible = false;
                                            this.onDeleteSelected();
                                        }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '删除',
                                    widthVal: 96,
                                    heightVal: 32
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
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
    private handleMouse(event: MouseEvent): void {
        if (event.action === MouseAction.Move) {
            const world = this.screenToWorld(event.x, event.y);
            this.updateMouseCoord(world);
            // Middle-click pan
            if (this.middlePanning) {
                const dx = event.x - this.middlePanLastX;
                const dy = event.y - this.middlePanLastY;
                this.middlePanLastX = event.x;
                this.middlePanLastY = event.y;
                this.appService.schematicEditor.panBy(dx, dy);
                this.scheduleRedraw();
                return;
            }
            // Always process move for wire preview (may not have pointer down)
            this.onPointerMove(event.x, event.y);
            // Only track hover in SELECT mode — hover results are not used in tool modes
            if (this.isSelectMode()) {
                const prevHover = this.hoverComponentId;
                const prevWireHover = this.hoverWireNetId;
                this.updateHover(world);
                if (prevHover !== this.hoverComponentId || prevWireHover !== this.hoverWireNetId) {
                    this.scheduleRedraw();
                }
            }
            if (this.toolMode === EditorToolMode.PLACE && this.pendingLibraryId.length > 0) {
                this.placementPreview = world;
                this.scheduleRedraw();
            }
        }
        if (event.action === MouseAction.Press) {
            if (this.isTouchActive)
                return; // touch handles interaction, skip mouse
            if (event.button === 2) {
                this.contextMenuScreenX = event.x;
                this.contextMenuScreenY = event.y;
                this.handleRightClick();
                return;
            }
            if (event.button === 1) {
                this.middlePanning = true;
                this.middlePanLastX = event.x;
                this.middlePanLastY = event.y;
                return;
            }
            this.onPointerDown(event.x, event.y);
        }
        else if (event.action === MouseAction.Release) {
            if (this.isTouchActive)
                return;
            if (event.button === 2) {
                return;
            }
            if (event.button === 1) {
                this.middlePanning = false;
                return;
            }
            this.onPointerUp(event.x, event.y);
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
    /**
     * Right-click: cancel tools when active; show copy/delete menu when something is selected.
     */
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
        const selectedDevices = this.appService.schematicEditor.getSelectedDevices();
        const selectedNets = this.appService.schematicEditor.getSelectedNets();
        if (selectedDevices.length > 0 || selectedNets.length > 0) {
            this.contextMenuVisible = true;
            return;
        }
        this.clearSelection();
    }
    private isSelectMode(): boolean {
        return this.toolMode === EditorToolMode.SELECT;
    }
    private isTapSlop(totalDx: number, totalDy: number): boolean {
        return Math.abs(totalDx) <= SchematicCanvas.TAP_SLOP && Math.abs(totalDy) <= SchematicCanvas.TAP_SLOP;
    }
    private tryPlaceComponent(world: Point2D): boolean {
        if (this.appService.rejectManualPlaceIfAiBusy()) {
            this.pendingLibraryId = '';
            return false;
        }
        if (this.pendingLibraryId.length === 0) {
            this.onStatusChange('请先在左侧库中点击选择器件');
            return false;
        }
        const resolvedId = this.appService.componentLibrary.resolveLibraryId(this.pendingLibraryId);
        const r = this.appService.schematicEditor.placeComponent(resolvedId, world);
        if (r.success && r.data) {
            this.selectedComponentId = r.data.id;
            this.appService.schematicEditor.setSelection([r.data.id]);
            const upperId = resolvedId.toUpperCase();
            if (upperId === 'VCC' || upperId.endsWith('/VCC')) {
                this.onStatusChange(`已放置 VCC — 请从下方橙色引脚连线；选中后在 Props 修改 voltage`);
            }
            else if (upperId === 'GND' || upperId.endsWith('/GND')) {
                this.onStatusChange(`已放置 GND — 请从上方引脚连线`);
            }
            else {
                this.onStatusChange(`已放置 ${resolvedId} @ (${Math.round(world.x)}, ${Math.round(world.y)})`);
            }
            return true;
        }
        this.onStatusChange(`放置失败: ${r.error ?? ''}`);
        return false;
    }
    private handleTouch(event: TouchEvent): void {
        if (this.appService.isAiGenerating()) {
            return;
        }
        const touchCount = event.touches.length;
        // 2-finger pan: manually track midpoint for canvas navigation
        if (touchCount >= 2) {
            if (event.type === TouchType.Down || (event.type === TouchType.Move && !this.twoFingerPanning)) {
                this.twoFingerPanning = true;
                this.twoFingerLastMidX = (event.touches[0].x + event.touches[1].x) / 2;
                this.twoFingerLastMidY = (event.touches[0].y + event.touches[1].y) / 2;
                // Cancel any in-progress single-finger interaction
                if (this.pointerDown) {
                    this.cancelPointerInteraction();
                }
                return;
            }
            if (event.type === TouchType.Move && this.twoFingerPanning) {
                const midX = (event.touches[0].x + event.touches[1].x) / 2;
                const midY = (event.touches[0].y + event.touches[1].y) / 2;
                const dx = midX - this.twoFingerLastMidX;
                const dy = midY - this.twoFingerLastMidY;
                this.twoFingerLastMidX = midX;
                this.twoFingerLastMidY = midY;
                if (this.dragComponentId.length === 0) {
                    this.markGestureBusy();
                    this.appService.schematicEditor.panBy(dx, dy);
                    this.scheduleRedraw();
                }
                return;
            }
            if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
                // Wait until all fingers are up
                if (event.touches.length <= 1) {
                    this.twoFingerPanning = false;
                }
                return;
            }
            return;
        }
        // Single-finger interaction
        if (this.twoFingerPanning)
            return;
        if (event.touches.length === 0)
            return;
        const tx = event.touches[0].x;
        const ty = event.touches[0].y;
        if (event.type === TouchType.Down) {
            this.clearTouchCooldown();
            this.isTouchActive = true;
            this.onPointerDown(tx, ty);
        }
        else if (event.type === TouchType.Move) {
            this.onPointerMove(tx, ty);
        }
        else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
            this.onPointerUp(tx, ty);
            // Keep isTouchActive true for a cooldown period to block trailing mouse events
            this.startTouchCooldown();
        }
        event.stopPropagation();
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
    private onPointerDown(sx: number, sy: number): void {
        if (this.contextMenuVisible) {
            this.contextMenuVisible = false;
        }
        const now = Date.now();
        if (now - this.lastDownTime < 100) {
            return;
        }
        this.lastDownTime = now;
        this.pointerDown = true;
        this.lastPointerX = sx;
        this.lastPointerY = sy;
        this.downPointerX = sx;
        this.downPointerY = sy;
        const world = this.screenToWorld(sx, sy);
        this.updateMouseCoord(world);
        if (this.toolMode === EditorToolMode.PLACE) {
            this.placementPreview = world;
            return;
        }
        // Skip hit testing for wire/bus/label modes — nothing to select on down
        if (this.toolMode === EditorToolMode.WIRE ||
            this.toolMode === EditorToolMode.BUS ||
            this.toolMode === EditorToolMode.LABEL ||
            this.toolMode === EditorToolMode.POWER ||
            this.toolMode === EditorToolMode.GROUND) {
            return;
        }
        const hits = this.appService.schematicEditor.selectAt(world);
        const editor = this.appService.schematicEditor as SchematicEditorImpl;
        const selectedNets = this.appService.schematicEditor.getSelectedNets();
        this.interactiveToggleCompId = '';
        this.potDragCompId = '';
        if (this.toolMode === EditorToolMode.SELECT && (hits.length > 0 || selectedNets.length > 0)) {
            if (hits.length > 0) {
                if (this.shiftHeld) {
                    const toggled = this.appService.schematicEditor.toggleSelection(hits[0]);
                    this.selectedComponentId = toggled.length > 0 ? toggled[toggled.length - 1] : '';
                    this.appService.schematicEditor.setSelection(toggled);
                    this.onStatusChange(`已选择 ${toggled.length} 个器件`);
                    return;
                }
                this.selectedComponentId = hits[0];
                // Simulation: click SW_PUSH to press/release (no drag)
                if (this.isSimulationActive() && this.isPushButtonComponent(hits[0])) {
                    this.interactiveToggleCompId = hits[0];
                    this.dragComponentId = '';
                    this.dragPreviewPos = null;
                    this.dragBlocked = true;
                    this.appService.schematicEditor.setSelection([hits[0]]);
                    this.onStatusChange('松开完成按键切换');
                    return;
                }
                // Simulation: drag pot wiper along resistor body
                if (this.isSimulationActive() && this.isPotentiometerComponent(hits[0])) {
                    this.potDragCompId = hits[0];
                    this.potDragLastWiper = -1;
                    this.dragComponentId = '';
                    this.dragPreviewPos = null;
                    this.dragBlocked = true;
                    this.appService.schematicEditor.setSelection([hits[0]]);
                    this.applyPotWiperFromWorld(hits[0], world);
                    this.onStatusChange('拖动调节滑动变阻器');
                    return;
                }
                if (editor.isLayerLocked(SchematicLayerId.COMPONENTS)) {
                    this.dragComponentId = '';
                    this.dragPreviewPos = null;
                    this.dragBlocked = true;
                    this.onStatusChange('器件层已锁定');
                }
                else if (this.appService.schematicEditor.isComponentLocked(hits[0])) {
                    this.dragComponentId = '';
                    this.dragPreviewPos = null;
                    this.dragBlocked = true;
                    this.onStatusChange('器件已锁定，无法拖动');
                }
                else {
                    this.dragComponentId = hits[0];
                    this.dragBlocked = false;
                    const doc = this.appService.schematicEditor.getDocument();
                    const comp = doc.components.find(c => c.id === hits[0]);
                    if (comp) {
                        this.dragStartPos = { x: comp.position.x, y: comp.position.y };
                        this.dragPreviewPos = { x: comp.position.x, y: comp.position.y };
                    }
                }
                this.appService.schematicEditor.setSelection([hits[0]]);
                this.onStatusChange(`已选择 ${hits[0]}`);
                return;
            }
            // Wire selected
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
            this.boxSelectStart = world;
            this.boxSelectEnd = world;
            if (!this.shiftHeld) {
                this.appService.schematicEditor.setSelection([]);
            }
        }
    }
    private onPointerMove(sx: number, sy: number): void {
        const world = this.screenToWorld(sx, sy);
        this.updateMouseCoord(world);
        // Wire preview: always show when wire start is set (pointer may be up after first click)
        const wireStart = this.getWireStart();
        if (this.toolMode === EditorToolMode.WIRE && wireStart !== null) {
            if (this.isSimulationActive()) {
                this.blockWireEditing();
                return;
            }
            this.previewWireEnd = world;
            this.scheduleRedraw();
            if (!this.pointerDown) {
                return;
            }
        }
        if (!this.pointerDown) {
            this.updateHover(world);
            if (this.toolMode === EditorToolMode.PLACE && this.pendingLibraryId.length > 0) {
                this.placementPreview = world;
                this.scheduleRedraw();
            }
            return;
        }
        const dx = sx - this.lastPointerX;
        const dy = sy - this.lastPointerY;
        const totalDx = sx - this.downPointerX;
        const totalDy = sy - this.downPointerY;
        const moved = Math.abs(totalDx) > SchematicCanvas.MOVE_THRESHOLD || Math.abs(totalDy) > SchematicCanvas.MOVE_THRESHOLD;
        if (this.toolMode === EditorToolMode.WIRE && wireStart !== null) {
            return;
        }
        if (this.toolMode === EditorToolMode.PLACE) {
            this.placementPreview = world;
            this.scheduleRedraw();
            return;
        }
        if (this.potDragCompId.length > 0 && this.isSimulationActive()) {
            this.applyPotWiperFromWorld(this.potDragCompId, world);
            return;
        }
        if (this.dragComponentId.length > 0 && moved && this.isSelectMode()) {
            const editor = this.appService.schematicEditor as SchematicEditorImpl;
            if (editor.isLayerLocked(SchematicLayerId.COMPONENTS)) {
                return;
            }
            const zoom = this.appService.schematicEditor.getZoom();
            const g = this.appService.schematicEditor.getViewport().gridSize;
            const raw: Point2D = {
                x: Math.round((this.dragStartPos.x + totalDx / zoom) / g) * g,
                y: Math.round((this.dragStartPos.y + totalDy / zoom) / g) * g
            };
            this.dragPreviewPos = this.computeDragSnap(this.dragComponentId, raw);
            this.scheduleRedraw();
        }
        else if (this.isBoxSelecting && moved && this.isSelectMode()) {
            this.boxSelectEnd = world;
            this.scheduleRedraw();
        }
        this.lastPointerX = sx;
        this.lastPointerY = sy;
    }
    private onPointerUp(sx: number, sy: number): void {
        const now = Date.now();
        if (now - this.lastUpTime < 100) {
            return;
        }
        this.lastUpTime = now;
        const world = this.screenToWorld(sx, sy);
        this.updateMouseCoord(world);
        const totalDx = sx - this.downPointerX;
        const totalDy = sy - this.downPointerY;
        const moved = Math.abs(totalDx) > SchematicCanvas.MOVE_THRESHOLD || Math.abs(totalDy) > SchematicCanvas.MOVE_THRESHOLD;
        // Sim pushbutton: short click toggles pressed → KEY shorts to GND
        if (this.interactiveToggleCompId.length > 0) {
            const swId = this.interactiveToggleCompId;
            this.interactiveToggleCompId = '';
            if (!moved || this.isTapSlop(totalDx, totalDy)) {
                const next = this.appService.toggleInteractiveSwitch(swId);
                if (next.length > 0) {
                    this.onStatusChange(next === '1' ? 'SW CLOSED (KEY=GND)' : 'SW OPEN (KEY 上拉)');
                    // Switch/LED symbols live on the cached background layer — must dirty it
                    this.backgroundDirty = true;
                }
                else {
                    this.onStatusChange('按键切换失败（是否在仿真中？）');
                }
            }
            this.isBoxSelecting = false;
            this.pointerDown = false;
            this.dragComponentId = '';
            this.dragPreviewPos = null;
            this.dragBlocked = false;
            this.scheduleRedraw();
            return;
        }
        // Sim pot: finish wiper drag
        if (this.potDragCompId.length > 0) {
            const potId = this.potDragCompId;
            this.applyPotWiperFromWorld(potId, world);
            this.potDragCompId = '';
            this.potDragLastWiper = -1;
            this.backgroundDirty = true;
            this.isBoxSelecting = false;
            this.pointerDown = false;
            this.dragComponentId = '';
            this.dragPreviewPos = null;
            this.dragBlocked = false;
            this.scheduleRedraw();
            return;
        }
        // Wire/Bus/Label/Power/Ground modes always process as a tap regardless of move distance
        if (this.toolMode === EditorToolMode.WIRE ||
            this.toolMode === EditorToolMode.BUS ||
            this.toolMode === EditorToolMode.LABEL ||
            this.toolMode === EditorToolMode.POWER ||
            this.toolMode === EditorToolMode.GROUND) {
            this.handleTap(world);
        }
        else if (this.toolMode === EditorToolMode.PLACE) {
            this.tryPlaceComponent(world);
        }
        else if (!moved || this.isTapSlop(totalDx, totalDy)) {
            this.handleTap(world);
        }
        else if (this.dragComponentId.length > 0 && this.isSelectMode()) {
            if (this.dragPreviewPos !== null) {
                this.appService.schematicEditor.moveComponent(this.dragComponentId, this.dragPreviewPos);
            }
        }
        else if (this.isBoxSelecting && this.isSelectMode()) {
            this.boxSelectEnd = world;
            const rect = this.normalizeRect(this.boxSelectStart, this.boxSelectEnd);
            if (rect.width > 2 && rect.height > 2) {
                const hits = this.appService.schematicEditor.selectInRect(rect);
                if (this.shiftHeld && hits.length > 0) {
                    const existing = this.appService.schematicEditor.getSelectedDevices().map(d => d.instUuid);
                    const merged = existing.slice();
                    for (let i = 0; i < hits.length; i++) {
                        if (!merged.includes(hits[i]))
                            merged.push(hits[i]);
                    }
                    this.appService.schematicEditor.setSelection(merged);
                }
                this.selectedComponentId = hits.length > 0 ? hits[0] : '';
                this.onStatusChange(`框选 ${hits.length} 个器件`);
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
    private computeDragSnap(dragId: string, rawPos: Point2D): Point2D {
        const editor = this.appService.schematicEditor as SchematicEditorImpl;
        const doc = editor.getDocument();
        const threshold = SchematicCanvas.ALIGN_THRESHOLD;
        let snapX = rawPos.x;
        let snapY = rawPos.y;
        this.alignGuideX = null;
        this.alignGuideY = null;
        let matchedX = false;
        let matchedY = false;
        for (let i = 0; i < doc.components.length; i++) {
            const c = doc.components[i];
            if (c.id === dragId) {
                continue;
            }
            if (!matchedX && Math.abs(rawPos.x - c.position.x) <= threshold) {
                snapX = c.position.x;
                this.alignGuideX = c.position.x;
                matchedX = true;
            }
            if (!matchedY && Math.abs(rawPos.y - c.position.y) <= threshold) {
                snapY = c.position.y;
                this.alignGuideY = c.position.y;
                matchedY = true;
            }
        }
        const aligned: Point2D = { x: snapX, y: snapY };
        return this.tryPinEndpointSnap(dragId, aligned);
    }
    private tryPinEndpointSnap(dragId: string, pos: Point2D): Point2D {
        const editor = this.appService.schematicEditor as SchematicEditorImpl;
        const doc = editor.getDocument();
        const comp = doc.components.find(c => c.id === dragId);
        if (comp === undefined) {
            return pos;
        }
        const libId = this.appService.componentLibrary.resolveLibraryId(comp.libraryId);
        const defResult = this.appService.componentLibrary.getComponent(libId);
        if (!defResult.success || defResult.data === undefined || defResult.data.pins.length === 0) {
            return pos;
        }
        const endpoints: Point2D[] = [];
        for (let i = 0; i < doc.wires.length; i++) {
            const pts = doc.wires[i].points;
            if (pts.length > 0) {
                endpoints.push(pts[0]);
                endpoints.push(pts[pts.length - 1]);
            }
        }
        if (endpoints.length === 0) {
            return pos;
        }
        const threshold = SchematicCanvas.ALIGN_THRESHOLD;
        let best = pos;
        let bestDist = threshold + 1;
        const pins = defResult.data.pins;
        for (let pi = 0; pi < pins.length; pi++) {
            const local = this.transformPinOffset(pins[pi].position, comp.rotation, comp.mirrored);
            for (let ei = 0; ei < endpoints.length; ei++) {
                const ep = endpoints[ei];
                const pinAt: Point2D = { x: pos.x + local.x, y: pos.y + local.y };
                const dx = ep.x - pinAt.x;
                const dy = ep.y - pinAt.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= threshold && dist < bestDist) {
                    bestDist = dist;
                    best = { x: pos.x + dx, y: pos.y + dy };
                    this.alignGuideX = ep.x;
                    this.alignGuideY = ep.y;
                }
            }
        }
        return best;
    }
    private transformPinOffset(local: Point2D, rotation: number, mirrored: boolean): Point2D {
        let x = local.x;
        let y = local.y;
        if (mirrored) {
            x = -x;
        }
        switch (rotation) {
            case 90: return { x: -y, y: x };
            case 180: return { x: -x, y: -y };
            case 270: return { x: y, y: -x };
            default: return { x: x, y: y };
        }
    }
    private isSimulationActive(): boolean {
        return this.appService.isSimulationActive();
    }
    private isPushButtonComponent(compId: string): boolean {
        const doc = this.appService.schematicEditor.getDocument();
        const comp = doc.components.find(c => c.id === compId);
        if (comp === undefined) {
            return false;
        }
        const lib = comp.libraryId.toUpperCase();
        return lib === 'SW_PUSH' || lib.includes('SWITCH_PUSH') || lib === 'BUTTON';
    }
    private isPotentiometerComponent(compId: string): boolean {
        const doc = this.appService.schematicEditor.getDocument();
        const comp = doc.components.find(c => c.id === compId);
        if (comp === undefined) {
            return false;
        }
        const lib = comp.libraryId.toUpperCase();
        return lib.startsWith('POT_') || lib.includes('POTENTIOMETER') || lib === 'POT';
    }
    /** On-canvas live ΔV / I for meters during sim */
    private drawLiveMeterReading(ctx: CanvasRenderingContext2D, drawPos: Point2D, comp: ComponentInstance): void {
        const lib = comp.libraryId.toUpperCase();
        let text = '';
        if (lib.includes('VOLTMETER') || lib.includes('VIRTUAL_METER') || lib === 'MULTIMETER') {
            const delta = this.appService.readVoltmeterDeltaForComponent(comp.id, true);
            if (delta === null) {
                return;
            }
            text = `${delta.toFixed(2)}V`;
        }
        else if (lib.includes('AMMETER')) {
            const mA = this.appService.readAmmeterCurrentForComponent(comp.id, true);
            if (mA === null) {
                return;
            }
            text = `${mA.toFixed(2)}mA`;
        }
        else if (lib.includes('POWER_METER') || lib.includes('WATT')) {
            const pm = this.appService.readPowerMeterForComponent(comp.id);
            if (pm === null) {
                return;
            }
            text = `${pm.voltage.toFixed(2)}V ${(pm.current * 1000).toFixed(2)}mA`;
        }
        else {
            return;
        }
        ctx.save();
        ctx.fillStyle = '#0a7a3e';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(text, drawPos.x, drawPos.y - 28);
        ctx.textAlign = 'start';
        ctx.restore();
    }
    private parsePotWiper(comp: ComponentInstance): number {
        let s = (comp.parameters.get('wiper') ?? '0.5').trim().replace(/\s+/g, '');
        if (s.length === 0) {
            return 0.5;
        }
        let pct = false;
        if (s.endsWith('%')) {
            pct = true;
            s = s.substring(0, s.length - 1);
        }
        let n = parseFloat(s);
        if (isNaN(n)) {
            return 0.5;
        }
        if (pct || n > 1) {
            n = n / 100;
        }
        if (n < 0.001) {
            return 0.001;
        }
        if (n > 0.999) {
            return 0.999;
        }
        return n;
    }
    /** Map pointer world position → pot wiper along local X (−30…+30 = 0…1). */
    private applyPotWiperFromWorld(compId: string, world: Point2D): void {
        const doc = this.appService.schematicEditor.getDocument();
        const comp = doc.components.find(c => c.id === compId);
        if (comp === undefined) {
            return;
        }
        const dx = world.x - comp.position.x;
        const dy = world.y - comp.position.y;
        // Inverse of transformPinOffset: un-rotate then un-mirror
        let loc = this.inverseRotateLocal(dx, dy, comp.rotation);
        if (comp.mirrored) {
            loc = { x: -loc.x, y: loc.y };
        }
        // Body track ≈ ±22 along local X (matches drawPotentiometer / pin ±30)
        let t = (loc.x + 22) / 44;
        if (t < 0.001) {
            t = 0.001;
        }
        else if (t > 0.999) {
            t = 0.999;
        }
        if (this.potDragLastWiper >= 0 && Math.abs(t - this.potDragLastWiper) < 0.012) {
            return;
        }
        const next = this.appService.setInteractivePotWiper(compId, t);
        if (next.length === 0) {
            return;
        }
        this.potDragLastWiper = t;
        this.backgroundDirty = true;
        this.onStatusChange(`${comp.refDes} 滑臂 ${(t * 100).toFixed(0)}%`);
        this.scheduleRedraw();
    }
    private inverseRotateLocal(x: number, y: number, rotation: number): Point2D {
        const r = ((rotation % 360) + 360) % 360;
        switch (r) {
            case 90: return { x: y, y: -x };
            case 180: return { x: -x, y: -y };
            case 270: return { x: -y, y: x };
            default: return { x: x, y: y };
        }
    }
    private isPushButtonPressed(comp: ComponentInstance): boolean {
        const lib = comp.libraryId.toUpperCase();
        if (lib !== 'SW_PUSH' && !lib.includes('SWITCH_PUSH') && lib !== 'BUTTON') {
            return false;
        }
        const v = (comp.parameters.get('pressed') ?? '0').trim().toLowerCase();
        return v === '1' || v === 'true' || v === 'yes' || v === 'on' || v === 'pressed';
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
    private isLayerBlocked(layerId: SchematicLayerId): boolean {
        const editor = this.appService.schematicEditor as SchematicEditorImpl;
        return editor.isLayerLocked(layerId);
    }
    private handleTap(world: Point2D): void {
        const editor = this.appService.schematicEditor;
        const wireStart = this.getWireStart();
        switch (this.toolMode) {
            case EditorToolMode.PLACE:
                if (this.isLayerBlocked(SchematicLayerId.COMPONENTS)) {
                    this.onStatusChange('器件层已锁定');
                    break;
                }
                this.tryPlaceComponent(world);
                break;
            case EditorToolMode.WIRE: {
                if (this.blockWireEditing()) {
                    break;
                }
                if (this.isLayerBlocked(SchematicLayerId.WIRING)) {
                    this.onStatusChange('布线层已锁定');
                    break;
                }
                const nearPin = this.findNearestPinWorld(world);
                const wirePoint = nearPin ?? world;
                if (wireStart === null) {
                    if (nearPin === null) {
                        this.onStatusChange('请点击引脚开始连线');
                        break;
                    }
                    this.wireWaypoints = [wirePoint];
                    this.setWireStart(wirePoint);
                    this.onStatusChange('导线起点, 点击添加拐点 / 点击引脚完成连线');
                }
                else if (nearPin !== null) {
                    // Ignore if clicking the same starting pin
                    const firstWp = this.wireWaypoints[0];
                    const samePin = Math.abs(nearPin.x - firstWp.x) < 4 && Math.abs(nearPin.y - firstWp.y) < 4;
                    if (samePin) {
                        this.onStatusChange('请点击其他引脚完成连线, 或按 ESC 取消');
                        break;
                    }
                    this.wireWaypoints.push(wirePoint);
                    const wireResult = editor.addWireWithPoints(this.wireWaypoints);
                    this.wireWaypoints = [];
                    this.setWireStart(null);
                    this.previewWireEnd = null;
                    if (wireResult.success) {
                        this.onStatusChange('导线已完成');
                    }
                    else {
                        this.onStatusChange(wireResult.error ?? '接线失败');
                    }
                }
                else {
                    this.wireWaypoints.push(wirePoint);
                    this.setWireStart(wirePoint);
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
                if (wireStart === null) {
                    this.setWireStart(world);
                    this.onStatusChange('总线: 选择终点');
                }
                else {
                    editor.createBus(wireStart.x, wireStart.y, world.x, world.y, 8);
                    this.setWireStart(null);
                    this.onStatusChange('总线已添加');
                }
                break;
            case EditorToolMode.LABEL:
                editor.createNetLabel(world.x, world.y, 'NET1');
                this.onStatusChange('已放置网络标签 NET1');
                break;
            case EditorToolMode.POWER:
                editor.createNetLabel(world.x, world.y, 'VCC');
                this.onStatusChange('已放置电源 VCC');
                break;
            case EditorToolMode.GROUND:
                editor.createNetLabel(world.x, world.y, 'GND');
                this.onStatusChange('已放置地 GND');
                break;
            default: {
                // Auto-switch to wire mode when clicking a pin in SELECT mode
                const nearPin = this.findNearestPinWorld(world);
                if (nearPin !== null) {
                    if (this.isSimulationActive()) {
                        this.onStatusChange('仿真运行中，无法接线');
                        break;
                    }
                    this.toolMode = EditorToolMode.WIRE;
                    this.selectedComponentId = '';
                    this.dragComponentId = '';
                    this.dragPreviewPos = null;
                    this.appService.schematicEditor.setSelection([]);
                    this.wireWaypoints = [nearPin];
                    this.setWireStart(nearPin);
                    this.onStatusChange('导线起点, 点击添加拐点 / 点击引脚完成连线');
                    break;
                }
                const hits = editor.selectAt(world);
                if (hits.length > 0) {
                    this.selectedComponentId = hits[0];
                    editor.setSelection([hits[0]]);
                }
                else {
                    this.selectedComponentId = '';
                    editor.setSelection([]);
                }
                break;
            }
        }
    }
    private updateMouseCoord(world: Point2D): void {
        this.mouseX = Math.round(world.x);
        this.mouseY = Math.round(world.y);
    }
    private updateHover(world: Point2D): void {
        const editor = this.appService.schematicEditor as SchematicEditorImpl;
        const hits = editor.hitTestAt(world);
        if (hits.length > 0) {
            this.hoverComponentId = hits[0];
            this.hoverWireNetId = '';
            return;
        }
        const wireNet = editor.hitTestWireAt(world);
        this.hoverComponentId = '';
        this.hoverWireNetId = wireNet !== null ? wireNet : '';
    }
    private screenToWorld(sx: number, sy: number): Point2D {
        const vp = this.appService.schematicEditor.getViewport();
        return {
            x: (sx - vp.panOffset.x) / vp.zoom,
            y: (sy - vp.panOffset.y) / vp.zoom
        };
    }
    private getVisibleWorldBounds(vp: ViewportState): WorldRect {
        const pad = vp.gridSize * 2;
        const minX = (-vp.panOffset.x / vp.zoom) - pad;
        const minY = (-vp.panOffset.y / vp.zoom) - pad;
        const maxX = minX + (this.viewWidth / vp.zoom) + pad * 2;
        const maxY = minY + (this.viewHeight / vp.zoom) + pad * 2;
        const result: WorldRect = { minX, minY, maxX, maxY };
        return result;
    }
    /**
     * Two-layer rendering:
     * - Background canvas (this.context): grid + components + net labels + ERC (only when dirty)
     * - Wire canvas (this.wireCtx): wires + junctions + overlays (every frame)
     * This eliminates ImageData snapshot copies and separates static from dynamic content.
     */
    redraw(): void {
        if (this.viewWidth <= 0 || this.viewHeight <= 0) {
            return;
        }
        const doc = this.appService.schematicEditor.getDocument();
        const vp = this.appService.schematicEditor.getViewport();
        const editor = this.appService.schematicEditor as SchematicEditorImpl;
        const w = this.viewWidth;
        const h = this.viewHeight;
        const bounds = this.getVisibleWorldBounds(vp);
        // Background: only redraw when scene changed or pan/zoom changed
        if (this.backgroundDirty) {
            const bgCtx = this.context;
            bgCtx.clearRect(0, 0, w, h);
            bgCtx.fillStyle = ThemeManager.getInstance().canvasBg();
            bgCtx.fillRect(0, 0, w, h);
            bgCtx.save();
            bgCtx.translate(vp.panOffset.x, vp.panOffset.y);
            bgCtx.scale(vp.zoom, vp.zoom);
            this.drawBackgroundScene(bgCtx, doc, vp, bounds, editor);
            bgCtx.restore();
            this.backgroundDirty = false;
        }
        // Wire layer: always redraw (clear + wires + overlays)
        const wCtx = this.wireCtx;
        wCtx.clearRect(0, 0, w, h);
        wCtx.save();
        wCtx.translate(vp.panOffset.x, vp.panOffset.y);
        wCtx.scale(vp.zoom, vp.zoom);
        if (editor.isLayerVisible(SchematicLayerId.WIRING)) {
            this.drawWires(wCtx, doc.wires);
        }
        this.renderOverlays(wCtx, doc, vp, bounds, editor);
        wCtx.restore();
        this.simFrameDirty = false;
        this.zoomPercent = Math.round(vp.zoom * 100);
        if (this.rulerVisible && this.rulerDirty) {
            this.rulerDirty = false;
            this.drawHRuler();
            this.drawVRuler();
        }
    }
    /** Initial full draw (called from onReady); forces background redraw */
    private fullRedraw(): void {
        this.backgroundDirty = true;
        this.redraw();
    }
    /** Draw only the static background elements (grid + components + labels + ERC) */
    private drawBackgroundScene(ctx: CanvasRenderingContext2D, doc: SchematicDocument, vp: ViewportState, bounds: WorldRect, editor: SchematicEditorImpl): void {
        if (vp.gridVisible) {
            this.drawCachedGrid(ctx, vp, bounds);
            if (vp.zoom >= 0.8) {
                this.drawGridLines(ctx, vp, bounds);
            }
        }
        if (editor.isLayerVisible(SchematicLayerId.WIRING)) {
            this.drawBackgroundGridOnEmpty(ctx, vp, bounds, doc.wires.length);
        }
        if (editor.isLayerVisible(SchematicLayerId.COMPONENTS)) {
            this.drawComponents(ctx, doc.components, false);
        }
        if (editor.isLayerVisible(SchematicLayerId.ANNOTATIONS)) {
            this.drawNetLabels(ctx, doc);
        }
        if (this.ercErrors.length > 0 && editor.isLayerVisible(SchematicLayerId.ERC_MARKERS)) {
            this.drawErcMarkers(ctx, doc);
        }
    }
    private renderOverlays(ctx: CanvasRenderingContext2D, doc: SchematicDocument, vp: ViewportState, bounds: WorldRect, editor: SchematicEditorImpl): void {
        if (editor.isLayerVisible(SchematicLayerId.WIRING)) {
            const wireStart = this.getWireStart();
            if (wireStart !== null) {
                // Draw start dot at the first waypoint
                if (this.wireWaypoints.length > 0) {
                    this.drawWireStartDot(ctx, this.wireWaypoints[0]);
                }
                else {
                    this.drawWireStartDot(ctx, wireStart);
                }
                // Draw accumulated waypoints as solid orthogonal path
                if (this.wireWaypoints.length >= 2) {
                    this.drawWaypointPath(ctx);
                }
                // Draw dashed preview from last waypoint to cursor
                if (this.previewWireEnd !== null) {
                    this.drawPreviewWire(ctx, wireStart, this.previewWireEnd);
                }
            }
            // Draw wire-to-pin connection markers on top of everything
            if (this.dragComponentId.length === 0) {
                this.drawWireConnectionMarkers(ctx);
            }
        }
        if (this.dragComponentId.length > 0 && editor.isLayerVisible(SchematicLayerId.COMPONENTS)) {
            this.drawDraggedComponentPreview(ctx, doc.components);
        }
        if (this.toolMode === EditorToolMode.PLACE && this.placementPreview !== null &&
            this.pendingLibraryId.length > 0) {
            this.drawPlacementGhost(ctx, this.placementPreview);
        }
        if (this.isBoxSelecting) {
            this.drawSelectionBox(ctx);
        }
        if (this.alignGuideX !== null || this.alignGuideY !== null) {
            this.drawAlignGuides(ctx, bounds);
        }
        this.drawHoverOverlays(ctx, doc, editor);
        this.drawLitLedOverlays(ctx, doc);
        this.drawActiveBuzzerOverlays(ctx, doc);
        // Draw pin snap markers in WIRE mode to show clickable pin positions
        if (this.toolMode === EditorToolMode.WIRE) {
            this.drawPinSnapMarkers(ctx);
        }
    }
    private drawDraggedComponentPreview(ctx: CanvasRenderingContext2D, components: ComponentInstance[]): void {
        if (this.dragPreviewPos === null) {
            return;
        }
        for (let i = 0; i < components.length; i++) {
            if (components[i].id !== this.dragComponentId) {
                continue;
            }
            const comp = components[i];
            const def = this.getCachedCompDef(comp.libraryId);
            if (def === null) {
                continue;
            }
            const style: SymbolDrawStyle = {
                strokeColor: ProteusColors.SELECTED,
                fillColor: ProteusColors.CANVAS_BG,
                lineWidth: 2,
                selected: true,
                hovered: false
            };
            SchematicSymbolRenderer.drawComponent(ctx, this.dragPreviewPos.x, this.dragPreviewPos.y, def, comp.refDes, comp.rotation, comp.mirrored, style);
            break;
        }
    }
    private ensureGridTile(vp: ViewportState): void {
        const g = vp.gridSize;
        const key = `${g}_${ProteusColors.GRID_DOT}`;
        if (this.gridTile !== null && this.gridTileKey === key) {
            return;
        }
        const cells = 16;
        const tileW = g * cells;
        const tileH = g * cells;
        const rgb = SchematicCanvas.parseGridColor(ProteusColors.GRID_DOT);
        this.gridTile = this.buildGridTileImage(tileW, tileH, g, rgb);
        this.gridTileKey = key;
        this.gridTileWorldW = tileW;
        this.gridTileWorldH = tileH;
    }
    private buildGridTileImage(tileW: number, tileH: number, step: number, rgb: RgbColor): ImageData {
        const img = this.context.createImageData(tileW, tileH);
        for (let x = 0; x < tileW; x += step) {
            for (let y = 0; y < tileH; y += step) {
                const idx = (y * tileW + x) * 4;
                img.data[idx] = rgb.r;
                img.data[idx + 1] = rgb.g;
                img.data[idx + 2] = rgb.b;
                img.data[idx + 3] = 255;
            }
        }
        return img;
    }
    private drawGridLines(ctx: CanvasRenderingContext2D, vp: ViewportState, bounds: WorldRect): void {
        const g = vp.gridSize;
        const startX = Math.floor(bounds.minX / g) * g;
        const startY = Math.floor(bounds.minY / g) * g;
        const endX = Math.ceil(bounds.maxX / g) * g;
        const endY = Math.ceil(bounds.maxY / g) * g;
        ctx.strokeStyle = ProteusColors.GRID_LINE;
        ctx.lineWidth = 0.5;
        for (let x = startX; x <= endX; x += g) {
            ctx.beginPath();
            ctx.moveTo(x, startY);
            ctx.lineTo(x, endY);
            ctx.stroke();
        }
        for (let y = startY; y <= endY; y += g) {
            ctx.beginPath();
            ctx.moveTo(startX, y);
            ctx.lineTo(endX, y);
            ctx.stroke();
        }
    }
    private drawBackgroundGridOnEmpty(ctx: CanvasRenderingContext2D, vp: ViewportState, bounds: WorldRect, wireCount: number): void {
        if (wireCount > 0) {
            return;
        }
        // On empty canvas, draw more visible grid to help user orient
        const g = vp.gridSize * 5; // Every 5th grid line
        const startX = Math.floor(bounds.minX / g) * g;
        const startY = Math.floor(bounds.minY / g) * g;
        const endX = Math.ceil(bounds.maxX / g) * g;
        const endY = Math.ceil(bounds.maxY / g) * g;
        ctx.strokeStyle = ProteusColors.GRID_LINE;
        ctx.lineWidth = 1;
        for (let x = startX; x <= endX; x += g) {
            ctx.beginPath();
            ctx.moveTo(x, startY);
            ctx.lineTo(x, endY);
            ctx.stroke();
        }
        for (let y = startY; y <= endY; y += g) {
            ctx.beginPath();
            ctx.moveTo(startX, y);
            ctx.lineTo(endX, y);
            ctx.stroke();
        }
    }
    private drawCachedGrid(ctx: CanvasRenderingContext2D, vp: ViewportState, bounds: WorldRect): void {
        this.ensureGridTile(vp);
        if (this.gridTile === null) {
            this.drawDotGrid(ctx, vp, bounds);
            return;
        }
        const startX = Math.floor(bounds.minX / this.gridTileWorldW) * this.gridTileWorldW;
        const startY = Math.floor(bounds.minY / this.gridTileWorldH) * this.gridTileWorldH;
        const endX = bounds.maxX + this.gridTileWorldW;
        const endY = bounds.maxY + this.gridTileWorldH;
        for (let x = startX; x <= endX; x += this.gridTileWorldW) {
            for (let y = startY; y <= endY; y += this.gridTileWorldH) {
                ctx.putImageData(this.gridTile, x, y);
            }
        }
    }
    private normalizeRect(a: Point2D, b: Point2D): Rect2D {
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        return { x: x, y: y, width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
    }
    private drawAlignGuides(ctx: CanvasRenderingContext2D, bounds: WorldRect): void {
        ctx.strokeStyle = '#FF4080';
        ctx.lineWidth = 1 / this.appService.schematicEditor.getZoom();
        ctx.setLineDash([6, 4]);
        if (this.alignGuideX !== null) {
            ctx.beginPath();
            ctx.moveTo(this.alignGuideX, bounds.minY);
            ctx.lineTo(this.alignGuideX, bounds.maxY);
            ctx.stroke();
        }
        if (this.alignGuideY !== null) {
            ctx.beginPath();
            ctx.moveTo(bounds.minX, this.alignGuideY);
            ctx.lineTo(bounds.maxX, this.alignGuideY);
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }
    private drawSelectionBox(ctx: CanvasRenderingContext2D): void {
        const rect = this.normalizeRect(this.boxSelectStart, this.boxSelectEnd);
        ctx.strokeStyle = '#00BFFF';
        ctx.lineWidth = 1 / this.appService.schematicEditor.getZoom();
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        ctx.fillStyle = 'rgba(0, 191, 255, 0.08)';
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.setLineDash([]);
    }
    /**
     * Draws accumulated waypoints as solid orthogonal line segments.
     * Each pair of consecutive waypoints is drawn with a single corner bend.
     */
    private drawWaypointPath(ctx: CanvasRenderingContext2D): void {
        if (this.wireWaypoints.length < 2) {
            return;
        }
        ctx.strokeStyle = ProteusColors.SELECTED;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.wireWaypoints[0].x, this.wireWaypoints[0].y);
        for (let i = 1; i < this.wireWaypoints.length; i++) {
            const prev = this.wireWaypoints[i - 1];
            const curr = this.wireWaypoints[i];
            const mid: Point2D = { x: curr.x, y: prev.y };
            ctx.lineTo(mid.x, mid.y);
            ctx.lineTo(curr.x, curr.y);
        }
        ctx.stroke();
    }
    private drawWireStartDot(ctx: CanvasRenderingContext2D, at: Point2D): void {
        const g = this.appService.schematicEditor.getViewport().gridSize;
        const sx = Math.round(at.x / g) * g;
        const sy = Math.round(at.y / g) * g;
        ctx.fillStyle = ProteusColors.SELECTED;
        ctx.beginPath();
        ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
    private drawPreviewWire(ctx: CanvasRenderingContext2D, from: Point2D, to: Point2D): void {
        ctx.strokeStyle = ProteusColors.SELECTED;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        const mid = this.smartMidpoint(from, to, '');
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(mid.x, mid.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    private drawDotGrid(ctx: CanvasRenderingContext2D, vp: ViewportState, bounds: WorldRect): void {
        const g = vp.gridSize;
        const startX = Math.floor(bounds.minX / g) * g;
        const startY = Math.floor(bounds.minY / g) * g;
        const endX = Math.ceil(bounds.maxX / g) * g;
        const endY = Math.ceil(bounds.maxY / g) * g;
        const cols = Math.ceil((endX - startX) / g) + 1;
        const rows = Math.ceil((endY - startY) / g) + 1;
        const step = cols * rows > 5000 ? g * 2 : g;
        const worldW = endX - startX + 1;
        const worldH = endY - startY + 1;
        if (worldW > 0 && worldH > 0 && worldW * worldH <= 250000) {
            const rgb = SchematicCanvas.parseGridColor(ProteusColors.GRID_DOT);
            const img = ctx.createImageData(worldW, worldH);
            for (let x = startX; x <= endX; x += step) {
                for (let y = startY; y <= endY; y += step) {
                    const px = x - startX;
                    const py = y - startY;
                    if (px >= 0 && py >= 0 && px < worldW && py < worldH) {
                        const idx = (py * worldW + px) * 4;
                        img.data[idx] = rgb.r;
                        img.data[idx + 1] = rgb.g;
                        img.data[idx + 2] = rgb.b;
                        img.data[idx + 3] = 255;
                    }
                }
            }
            ctx.putImageData(img, startX, startY);
            return;
        }
        ctx.fillStyle = ProteusColors.GRID_DOT;
        for (let x = startX; x <= endX; x += step) {
            for (let y = startY; y <= endY; y += step) {
                ctx.fillRect(x, y, 1, 1);
            }
        }
    }
    private static parseGridColor(hex: string): RgbColor {
        const h = hex.replace('#', '');
        if (h.length >= 6) {
            return {
                r: parseInt(h.substring(0, 2), 16),
                g: parseInt(h.substring(2, 4), 16),
                b: parseInt(h.substring(4, 6), 16)
            };
        }
        return { r: 80, g: 80, b: 96 };
    }
    private drawPlacementGhost(ctx: CanvasRenderingContext2D, pos: Point2D): void {
        const g = this.appService.schematicEditor.getViewport().gridSize;
        const sx = Math.round(pos.x / g) * g;
        const sy = Math.round(pos.y / g) * g;
        const def = this.getCachedCompDef(this.pendingLibraryId);
        if (def === null) {
            ctx.strokeStyle = ProteusColors.HOVER_PREVIEW;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(sx - 30, sy - 20, 60, 40);
            ctx.setLineDash([]);
            return;
        }
        SchematicSymbolRenderer.drawGhost(ctx, sx, sy, def);
    }
    private drawComponents(ctx: CanvasRenderingContext2D, components: ComponentInstance[], skipDragPreview: boolean = false): void {
        const vp = this.appService.schematicEditor.getViewport();
        const bounds = this.getVisibleWorldBounds(vp);
        const editor = this.appService.schematicEditor as SchematicEditorImpl;
        const compCount = components.length;
        for (let i = 0; i < compCount; i++) {
            const comp = components[i];
            if (skipDragPreview && comp.id === this.dragComponentId) {
                continue;
            }
            const cx = comp.position.x;
            const cy = comp.position.y;
            // Quick cull with generous margin
            if (cx < bounds.minX - 120 || cx > bounds.maxX + 120 ||
                cy < bounds.minY - 120 || cy > bounds.maxY + 120) {
                continue;
            }
            const selected = editor.isComponentSelected(comp.id);
            const hovered = comp.id === this.hoverComponentId && !selected;
            const def = this.getCachedCompDef(comp.libraryId);
            if (def === null) {
                this.drawFallbackComponent(ctx, comp, selected, hovered);
                continue;
            }
            const drawPos = comp.id === this.dragComponentId && this.dragPreviewPos !== null
                ? this.dragPreviewPos : comp.position;
            // Draw IC body backdrop directly on canvas for components with many pins
            this.drawComponentBodyBackdrop(ctx, drawPos, comp, def);
            const swPressed = this.isPushButtonPressed(comp);
            const potWiper = this.isPotentiometerComponent(comp.id) ? this.parsePotWiper(comp) : undefined;
            const style: SymbolDrawStyle = {
                strokeColor: selected ? ProteusColors.SELECTED : ProteusColors.COMPONENT_STROKE,
                fillColor: ProteusColors.CANVAS_BG,
                lineWidth: selected ? 2.0 : 1.2,
                selected: selected,
                hovered: false,
                ledDisplayColor: this.isLedComponent(comp, def) ? '' : undefined,
                switchPressed: swPressed,
                potWiper: potWiper
            };
            SchematicSymbolRenderer.drawComponent(ctx, drawPos.x, drawPos.y, def, comp.refDes, comp.rotation, comp.mirrored, style);
            if (this.isSimulationActive()) {
                this.drawLiveMeterReading(ctx, drawPos, comp);
            }
            if (this.appService.schematicEditor.isComponentLocked(comp.id)) {
                const dx = drawPos.x;
                const dy = drawPos.y;
                ctx.strokeStyle = '#c08020';
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 3]);
                ctx.strokeRect(dx - 34, dy - 24, 68, 48);
                ctx.setLineDash([]);
                ctx.fillStyle = '#c08020';
                ctx.font = '9px sans-serif';
                ctx.fillText('🔒', dx - 28, dy - 14);
            }
        }
    }
    /**
     * Draws a filled body rectangle for IC/MCU-type components directly on the canvas.
     * This is a fallback that ensures the body is ALWAYS visible, bypassing any
     * rendering pipeline issues in SchematicSymbolRenderer.
     * Only draws for components with >= 3 pins or wide pin spread (ICs, MCUs).
     */
    private drawComponentBodyBackdrop(ctx: CanvasRenderingContext2D, drawPos: Point2D, comp: ComponentInstance, def: ComponentDefinition): void {
        if (def.pins.length === 0) {
            return;
        }
        const pinBounds = calcSymbolBounds(def.pins, 0);
        // Only draw backdrop for IC-type components (wide/tall pin spread)
        // Skip small 2-pin components like resistors, capacitors, diodes
        if (pinBounds.width < 50 || pinBounds.height < 40) {
            return;
        }
        ctx.save();
        ctx.translate(drawPos.x, drawPos.y);
        if (comp.rotation !== 0) {
            ctx.rotate(comp.rotation * Math.PI / 180);
        }
        if (comp.mirrored) {
            ctx.scale(-1, 1);
        }
        const cx = (pinBounds.minX + pinBounds.maxX) / 2;
        const cy = (pinBounds.minY + pinBounds.maxY) / 2;
        const w = pinBounds.width;
        const h = pinBounds.height;
        // Filled body with visible color
        ctx.fillStyle = '#EBEEF2';
        ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
        // Bold border
        ctx.strokeStyle = '#222222';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
        // Component name label
        if (def.name.length > 0) {
            const shortName = def.name.length > 14 ? def.name.substring(0, 12) + '..' : def.name;
            ctx.font = '11px sans-serif';
            ctx.fillStyle = '#444444';
            ctx.textAlign = 'center';
            ctx.fillText(shortName, 0, 4);
            ctx.textAlign = 'start';
        }
        ctx.restore();
    }
    /**
     * Finds the nearest component pin to a world point within threshold.
     * Returns the pin's world position, or null if no pin is close enough.
     */
    private findNearestPinWorld(world: Point2D): Point2D | null {
        const doc = this.appService.schematicEditor.getDocument();
        const g = this.appService.schematicEditor.getViewport().gridSize;
        const threshold = g * 1.5; // match editor's snapToNearestPin threshold
        let bestDist = threshold;
        let bestPoint: Point2D | null = null;
        for (let i = 0; i < doc.components.length; i++) {
            const comp = doc.components[i];
            const def = this.getCachedCompDef(comp.libraryId);
            if (def === null) {
                continue;
            }
            for (let j = 0; j < def.pins.length; j++) {
                const pin = def.pins[j];
                const local = this.transformPinOffset(pin.position, comp.rotation, comp.mirrored);
                const pinWorld: Point2D = { x: comp.position.x + local.x, y: comp.position.y + local.y };
                const dx = world.x - pinWorld.x;
                const dy = world.y - pinWorld.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= bestDist) {
                    bestDist = dist;
                    bestPoint = pinWorld;
                }
            }
        }
        return bestPoint;
    }
    /**
     * Draws pin snap markers (small circles) at all component pin positions
     * when in WIRE mode, helping the user see where to click.
     */
    /**
     * Returns the world-space AABB for a component body, or null if unresolvable.
     */
    private getComponentWorldBounds(comp: ComponentInstance): Rect2D | null {
        const def = this.getCachedCompDef(comp.libraryId);
        if (def === null || def.pins.length === 0) {
            return { x: comp.position.x - 30, y: comp.position.y - 20, width: 60, height: 40 };
        }
        const localBounds = calcSymbolBounds(def.pins, 10);
        const corners: Point2D[] = [
            { x: localBounds.minX, y: localBounds.minY },
            { x: localBounds.maxX, y: localBounds.minY },
            { x: localBounds.minX, y: localBounds.maxY },
            { x: localBounds.maxX, y: localBounds.maxY }
        ];
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const corner of corners) {
            const local = this.transformPinOffset(corner, comp.rotation, comp.mirrored);
            const wx = comp.position.x + local.x;
            const wy = comp.position.y + local.y;
            if (wx < minX) {
                minX = wx;
            }
            if (wy < minY) {
                minY = wy;
            }
            if (wx > maxX) {
                maxX = wx;
            }
            if (wy > maxY) {
                maxY = wy;
            }
        }
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    /**
     * Checks if a world point falls inside any component body, excluding the given component.
     */
    private isPointInsideComponentBody(point: Point2D, excludeCompId: string): boolean {
        const doc = this.appService.schematicEditor.getDocument();
        for (const comp of doc.components) {
            if (comp.id === excludeCompId) {
                continue;
            }
            const b = this.getComponentWorldBounds(comp);
            if (b === null) {
                continue;
            }
            if (point.x >= b.x && point.x <= b.x + b.width &&
                point.y >= b.y && point.y <= b.y + b.height) {
                return true;
            }
        }
        return false;
    }
    /**
     * Picks the better orthogonal midpoint between two points, avoiding component bodies.
     */
    private smartMidpoint(from: Point2D, to: Point2D, excludeCompId: string): Point2D {
        const midA: Point2D = { x: to.x, y: from.y };
        const midB: Point2D = { x: from.x, y: to.y };
        const aBlocked = this.isPointInsideComponentBody(midA, excludeCompId);
        const bBlocked = this.isPointInsideComponentBody(midB, excludeCompId);
        if (aBlocked && !bBlocked) {
            return midB;
        }
        if (bBlocked && !aBlocked) {
            return midA;
        }
        return midA;
    }
    private drawPinSnapMarkers(ctx: CanvasRenderingContext2D): void {
        if (this.toolMode !== EditorToolMode.WIRE || this.isSimulationActive()) {
            return;
        }
        const doc = this.appService.schematicEditor.getDocument();
        ctx.fillStyle = '#FF6600';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 0.5;
        for (let i = 0; i < doc.components.length; i++) {
            const comp = doc.components[i];
            const def = this.getCachedCompDef(comp.libraryId);
            if (def === null) {
                continue;
            }
            for (let j = 0; j < def.pins.length; j++) {
                const pin = def.pins[j];
                const local = this.transformPinOffset(pin.position, comp.rotation, comp.mirrored);
                const px = comp.position.x + local.x;
                const py = comp.position.y + local.y;
                ctx.beginPath();
                ctx.arc(px, py, 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
        }
    }
    private getCachedCompDef(libraryId: string): ComponentDefinition | null {
        const cached = this.compDefCache.get(libraryId);
        if (cached !== undefined) {
            return cached;
        }
        const resolved = this.appService.componentLibrary.resolveLibraryId(libraryId);
        const result = this.appService.componentLibrary.getComponent(resolved);
        const def = (result.success && result.data) ? result.data : null;
        this.compDefCache.set(libraryId, def);
        return def;
    }
    private drawHitHoverOverlay(ctx: CanvasRenderingContext2D, editor: SchematicEditorImpl, comp: ComponentInstance): void {
        const rect = editor.getComponentHitRect(comp);
        ctx.fillStyle = 'rgba(0, 170, 255, 0.18)';
        ctx.strokeStyle = ProteusColors.HOVER_PREVIEW;
        ctx.lineWidth = 1.5 / Math.max(this.appService.schematicEditor.getZoom(), 0.5);
        ctx.setLineDash([6, 4]);
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        ctx.setLineDash([]);
    }
    private drawHoverOverlays(ctx: CanvasRenderingContext2D, doc: SchematicDocument, editor: SchematicEditorImpl): void {
        if (!this.isSelectMode() || this.hoverComponentId.length === 0) {
            return;
        }
        if (editor.isComponentSelected(this.hoverComponentId)) {
            return;
        }
        for (let i = 0; i < doc.components.length; i++) {
            if (doc.components[i].id === this.hoverComponentId) {
                this.drawHitHoverOverlay(ctx, editor, doc.components[i]);
                return;
            }
        }
    }
    private isLedComponent(comp: ComponentInstance, def: ComponentDefinition | null): boolean {
        if (def !== null) {
            const key = def.id.toUpperCase();
            if (key.includes('LED')) {
                return true;
            }
        }
        return comp.libraryId.toUpperCase().includes('LED');
    }
    private resolveLedNominalColor(comp: ComponentInstance, def: ComponentDefinition): string {
        const fromParam = comp.parameters.get('color');
        if (fromParam !== undefined && fromParam.length > 0) {
            return fromParam;
        }
        return def.defaultParams.get('color') ?? 'red';
    }
    /** Both terminals wired to distinct nets — minimum connectivity for a path. */
    private isLedWired(comp: ComponentInstance, def: ComponentDefinition): boolean {
        const doc = this.appService.schematicEditor.getDocument();
        const pinNets = getPinNetMap(comp.id, doc.nets);
        if (pinNets.size < 2) {
            return false;
        }
        const anodeNet = this.findLedAnodeNet(def, pinNets);
        const cathodeNet = this.findLedCathodeNet(def, pinNets);
        if (anodeNet === null || cathodeNet === null) {
            return false;
        }
        return anodeNet.length > 0 && cathodeNet.length > 0 && anodeNet !== cathodeNet;
    }
    private findLedAnodeNet(def: ComponentDefinition, pinNets: Map<string, string>): string | null {
        for (let i = 0; i < def.pins.length; i++) {
            const pin = def.pins[i];
            const name = pin.name.toUpperCase();
            if (name === 'A' || name === 'ANODE' || name === '1') {
                const net = findNetForPinLabel(pinNets, pin.name) ?? findNetForPinLabel(pinNets, pin.id);
                if (net !== null) {
                    return net;
                }
            }
        }
        if (def.pins.length > 0) {
            return findNetForPinLabel(pinNets, def.pins[0].name) ?? findNetForPinLabel(pinNets, def.pins[0].id);
        }
        return null;
    }
    private findLedCathodeNet(def: ComponentDefinition, pinNets: Map<string, string>): string | null {
        for (let i = 0; i < def.pins.length; i++) {
            const pin = def.pins[i];
            const name = pin.name.toUpperCase();
            if (name === 'K' || name === 'C' || name === 'CATHODE' || name === '2') {
                const net = findNetForPinLabel(pinNets, pin.name) ?? findNetForPinLabel(pinNets, pin.id);
                if (net !== null) {
                    return net;
                }
            }
        }
        if (def.pins.length > 1) {
            return findNetForPinLabel(pinNets, def.pins[1].name) ?? findNetForPinLabel(pinNets, def.pins[1].id);
        }
        return null;
    }
    private isLedConducting(comp: ComponentInstance, def: ComponentDefinition): boolean {
        const doc = this.appService.schematicEditor.getDocument();
        const pinNets = getPinNetMap(comp.id, doc.nets);
        const anodeNet = this.findLedAnodeNet(def, pinNets);
        const cathodeNet = this.findLedCathodeNet(def, pinNets);
        if (anodeNet === null || cathodeNet === null || anodeNet === cathodeNet) {
            return false;
        }
        const kernel = this.appService.simulationKernel as SimulationKernelImpl;
        const vA = kernel.getNetVoltageByUuid(anodeNet);
        const vK = kernel.getNetVoltageByUuid(cathodeNet);
        const vf = vA - vK;
        const current = Math.abs(kernel.getBranchCurrent(comp.id));
        // Open contact / HiZ: cathode not near GND — not lit
        if (vK >= 2.5) {
            return false;
        }
        // Sink-lit: cathode near GND + forward Vf.
        // Branch I 常因节点别名报 0，不能单靠电流；Va 也可能仍接近 VCC（量测取到电源网）。
        // 以 Vk≤0.9 且 Vf≥1.2 作为主判据（与 instr_trace [LED] mid/lit 一致）。
        if (vK <= 0.9 && vf >= 1.2) {
            return true;
        }
        return current >= 5e-4 && vf >= 1.0;
    }
    private resolveLedDisplayColor(comp: ComponentInstance, def: ComponentDefinition): string {
        if (!this.isLedWired(comp, def)) {
            return '';
        }
        const simState = this.appService.simulationKernel.getState();
        const simActive = simState === SimulationState.RUNNING || simState === SimulationState.PAUSED;
        if (!simActive) {
            return '';
        }
        if (!this.isLedConducting(comp, def)) {
            return '';
        }
        return this.resolveLedNominalColor(comp, def);
    }
    private drawLitLedOverlays(ctx: CanvasRenderingContext2D, doc: SchematicDocument): void {
        const editor = this.appService.schematicEditor as SchematicEditorImpl;
        if (!editor.isLayerVisible(SchematicLayerId.COMPONENTS)) {
            return;
        }
        for (let i = 0; i < doc.components.length; i++) {
            const comp = doc.components[i];
            if (comp.id === this.dragComponentId) {
                continue;
            }
            const def = this.getCachedCompDef(comp.libraryId);
            if (def === null || !this.isLedComponent(comp, def)) {
                continue;
            }
            const ledColor = this.resolveLedDisplayColor(comp, def);
            if (ledColor.length === 0) {
                continue;
            }
            const style: SymbolDrawStyle = {
                strokeColor: ProteusColors.COMPONENT_STROKE,
                fillColor: ProteusColors.CANVAS_BG,
                lineWidth: 1.2,
                selected: false,
                hovered: false,
                ledDisplayColor: ledColor
            };
            SchematicSymbolRenderer.drawComponent(ctx, comp.position.x, comp.position.y, def, comp.refDes, comp.rotation, comp.mirrored, style);
        }
    }
    private isBuzzerComponent(comp: ComponentInstance, def: ComponentDefinition | null): boolean {
        const lib = comp.libraryId.toUpperCase();
        if (lib === 'BUZZER' || lib.includes('BUZZER')) {
            return true;
        }
        if (def !== null) {
            const id = def.id.toUpperCase();
            return id === 'BUZZER' || id.includes('BUZZER');
        }
        return false;
    }
    /** True when voltage across buzzer terminals (or branch current) indicates sounding. */
    private isBuzzerSounding(comp: ComponentInstance, def: ComponentDefinition): boolean {
        const simState = this.appService.simulationKernel.getState();
        const simActive = simState === SimulationState.RUNNING || simState === SimulationState.PAUSED;
        if (!simActive || def.pins.length < 2) {
            return false;
        }
        const doc = this.appService.schematicEditor.getDocument();
        const pinNets = getPinNetMap(comp.id, doc.nets);
        const netA = findNetForPinLabel(pinNets, def.pins[0].name) ?? findNetForPinLabel(pinNets, def.pins[0].id);
        const netB = findNetForPinLabel(pinNets, def.pins[1].name) ?? findNetForPinLabel(pinNets, def.pins[1].id);
        if (netA === null || netB === null || netA === netB) {
            return false;
        }
        const kernel = this.appService.simulationKernel as SimulationKernelImpl;
        const vA = kernel.getNetVoltageByUuid(netA);
        const vB = kernel.getNetVoltageByUuid(netB);
        const dv = Math.abs(vA - vB);
        if (dv >= 0.8) {
            return true;
        }
        const current = kernel.getBranchCurrent(comp.id);
        return Math.abs(current) >= 5e-4;
    }
    private drawActiveBuzzerOverlays(ctx: CanvasRenderingContext2D, doc: SchematicDocument): void {
        const editor = this.appService.schematicEditor as SchematicEditorImpl;
        if (!editor.isLayerVisible(SchematicLayerId.COMPONENTS)) {
            return;
        }
        for (let i = 0; i < doc.components.length; i++) {
            const comp = doc.components[i];
            if (comp.id === this.dragComponentId) {
                continue;
            }
            const def = this.getCachedCompDef(comp.libraryId);
            if (def === null || !this.isBuzzerComponent(comp, def)) {
                continue;
            }
            if (!this.isBuzzerSounding(comp, def)) {
                continue;
            }
            const style: SymbolDrawStyle = {
                strokeColor: '#c07010',
                fillColor: '#fff8e8',
                lineWidth: 1.2,
                selected: false,
                hovered: false,
                buzzerActive: true
            };
            SchematicSymbolRenderer.drawComponent(ctx, comp.position.x, comp.position.y, def, comp.refDes, comp.rotation, comp.mirrored, style);
        }
    }
    private drawFallbackComponent(ctx: CanvasRenderingContext2D, comp: ComponentInstance, selected: boolean, _hovered: boolean): void {
        const cx = comp.position.x;
        const cy = comp.position.y;
        ctx.strokeStyle = selected ? ProteusColors.SELECTED : ProteusColors.COMPONENT_STROKE;
        ctx.lineWidth = selected ? 2 : 1.2;
        ctx.fillStyle = '#F8F8FC';
        ctx.fillRect(cx - 30, cy - 20, 60, 40);
        ctx.strokeRect(cx - 30, cy - 20, 60, 40);
        ctx.fillStyle = ProteusColors.TEXT_PRIMARY;
        ctx.font = `bold ${ProteusFonts.CANVAS_LABEL}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(comp.refDes, cx, cy + 3);
        ctx.fillStyle = ProteusColors.TEXT_LABEL;
        ctx.font = `${ProteusFonts.PARAM_KEY}px sans-serif`;
        ctx.fillText(comp.libraryId, cx, cy + 16);
        ctx.textAlign = 'start';
        // Draw pin indicators on left and right edges
        ctx.fillStyle = ProteusColors.TEXT_SECONDARY;
        ctx.beginPath();
        ctx.arc(cx - 30, cy - 10, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx - 30, cy + 10, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + 30, cy - 10, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + 30, cy + 10, 2, 0, Math.PI * 2);
        ctx.fill();
    }
    /** Map a voltage (0-5V range) to a color: blue(0V) → cyan → green(2.5V) → yellow → red(5V) */
    private voltageToColor(v: number, alpha: number = 1.0): string {
        const clamped = Math.max(0, Math.min(5, v));
        const t = clamped / 5; // 0..1
        let r: number, g: number, b: number;
        if (t < 0.25) {
            const s = t / 0.25;
            r = 0;
            g = Math.round(100 + 155 * s);
            b = Math.round(255 - 55 * s);
        }
        else if (t < 0.5) {
            const s = (t - 0.25) / 0.25;
            r = Math.round(255 * s);
            g = 255;
            b = Math.round(200 - 200 * s);
        }
        else if (t < 0.75) {
            const s = (t - 0.5) / 0.25;
            r = 255;
            g = Math.round(255 - 155 * s);
            b = 0;
        }
        else {
            const s = (t - 0.75) / 0.25;
            r = 255;
            g = Math.round(100 - 100 * s);
            b = 0;
        }
        return `rgba(${r},${g},${b},${alpha})`;
    }
    private drawWires(ctx: CanvasRenderingContext2D, wires: Wire[]): void {
        const wCount = wires.length;
        const editor = this.appService.schematicEditor as SchematicEditorImpl;
        const selectedWireNets = editor.getSelectedWireNetIds();
        const selectedWireSet = new Set<string>();
        for (let si = 0; si < selectedWireNets.length; si++) {
            selectedWireSet.add(selectedWireNets[si]);
        }
        // Check if simulation is active (running or paused) for live voltage coloring
        const simState = this.appService.simulationKernel.getState();
        const simActive = simState === SimulationState.RUNNING || simState === SimulationState.PAUSED;
        const nodeVoltages = simActive ? this.getSimNodeVoltages() : new Map<string, number>();
        // If dragging a component, compute drag offset for wire endpoints that
        // are connected to the dragged component's pins
        let dragComp: ComponentInstance | null = null;
        let dragDx = 0;
        let dragDy = 0;
        let dragPinPositions: Point2D[] = [];
        if (this.dragComponentId.length > 0 && this.dragPreviewPos !== null) {
            const doc = this.appService.schematicEditor.getDocument();
            for (let i = 0; i < doc.components.length; i++) {
                if (doc.components[i].id === this.dragComponentId) {
                    dragComp = doc.components[i];
                    break;
                }
            }
            if (dragComp !== null) {
                dragDx = this.dragPreviewPos.x - dragComp.position.x;
                dragDy = this.dragPreviewPos.y - dragComp.position.y;
                const def = this.getCachedCompDef(dragComp.libraryId);
                if (def !== null) {
                    for (let j = 0; j < def.pins.length; j++) {
                        const pin = def.pins[j];
                        const local = this.transformPinOffset(pin.position, dragComp.rotation, dragComp.mirrored);
                        dragPinPositions.push({ x: dragComp.position.x + local.x, y: dragComp.position.y + local.y });
                    }
                }
            }
        }
        for (let i = 0; i < wCount; i++) {
            const wire = wires[i];
            const pts = wire.points;
            if (pts.length < 2) {
                continue;
            }
            // Compute adjusted points if dragging.
            const isPinMask: boolean[] = [];
            for (let j = 0; j < pts.length; j++) {
                const pt = pts[j];
                let match = false;
                if (dragComp !== null && dragPinPositions.length > 0) {
                    for (let k = 0; k < dragPinPositions.length; k++) {
                        const pp = dragPinPositions[k];
                        if (Math.abs(pt.x - pp.x) <= 3 && Math.abs(pt.y - pp.y) <= 3) {
                            match = true;
                            break;
                        }
                    }
                }
                isPinMask.push(match);
            }
            const shiftMask: boolean[] = isPinMask.slice();
            if (dragComp !== null) {
                for (let j = 0; j < pts.length; j++) {
                    if (isPinMask[j]) {
                        if (j > 0) {
                            const adj = pts[j - 1];
                            const pin = pts[j];
                            if (adj.x === pin.x || adj.y === pin.y) {
                                shiftMask[j - 1] = true;
                            }
                        }
                        if (j < pts.length - 1) {
                            const adj = pts[j + 1];
                            const pin = pts[j];
                            if (adj.x === pin.x || adj.y === pin.y) {
                                shiftMask[j + 1] = true;
                            }
                        }
                    }
                }
            }
            const drawPts: Point2D[] = [];
            for (let j = 0; j < pts.length; j++) {
                const pt = pts[j];
                if (shiftMask[j]) {
                    drawPts.push({ x: pt.x + dragDx, y: pt.y + dragDy });
                }
                else {
                    drawPts.push({ x: pt.x, y: pt.y });
                }
            }
            if (drawPts.length === 3 && dragComp !== null && (shiftMask[0] || shiftMask[2])) {
                drawPts[1] = this.smartMidpoint(drawPts[0], drawPts[2], this.dragComponentId);
            }
            const wireSelected = selectedWireSet.has(wire.netId);
            const wireHovered = wire.netId === this.hoverWireNetId && !wireSelected;
            if (wireHovered) {
                ctx.strokeStyle = 'rgba(0, 170, 255, 0.35)';
                ctx.lineWidth = 7;
                ctx.beginPath();
                ctx.moveTo(drawPts[0].x, drawPts[0].y);
                for (let j = 1; j < drawPts.length; j++) {
                    ctx.lineTo(drawPts[j].x, drawPts[j].y);
                }
                ctx.stroke();
            }
            // Voltage-based coloring during simulation
            if (wireSelected) {
                ctx.strokeStyle = ProteusColors.SELECTED;
                ctx.lineWidth = 3;
            }
            else if (simActive && wire.netId.length > 0) {
                const voltage = nodeVoltages.get(wire.netId) ?? 0;
                ctx.strokeStyle = this.voltageToColor(voltage);
                ctx.lineWidth = 2.0;
            }
            else {
                ctx.strokeStyle = ProteusColors.WIRE;
                ctx.lineWidth = 1.5;
            }
            ctx.beginPath();
            ctx.moveTo(drawPts[0].x, drawPts[0].y);
            for (let j = 1; j < drawPts.length; j++) {
                ctx.lineTo(drawPts[j].x, drawPts[j].y);
            }
            ctx.stroke();
        }
        this.drawWireJunctions(ctx, wires);
    }
    /** Get a map of net ID → voltage from the simulation kernel using SPICE node map */
    private getSimNodeVoltages(): Map<string, number> {
        const doc = this.appService.schematicEditor.getDocument();
        const result = new Map<string, number>();
        const spiceNodeMap = this.appService.simulationKernel.netToSpiceNodeMap();
        let changed = false;
        for (const net of doc.nets) {
            const spiceNode = spiceNodeMap.get(net.id) ?? net.id;
            const voltage = this.appService.simulationKernel.getNodeVoltage(spiceNode);
            result.set(net.id, voltage);
            const prev = this.cachedNodeVoltages.get(net.id);
            if (prev === undefined || Math.abs(prev - voltage) > 0.001) {
                changed = true;
            }
        }
        // Update cache only if voltages changed; null cache signals "needs full redraw"
        if (changed) {
            this.cachedNodeVoltages = result;
        }
        return result;
    }
    private drawWireJunctions(ctx: CanvasRenderingContext2D, wires: Wire[]): void {
        const doc = this.appService.schematicEditor.getDocument();
        const cacheKey = `${doc.wires.length}_${this.lastDocChangeVer}`;
        if (this.juncCache !== null && this.juncCacheKey === cacheKey) {
            this.renderJuncPoints(ctx, this.juncCache);
            return;
        }
        // Build junction map — count vertex occurrences across all wires
        const counts = new Map<string, number>();
        for (let i = 0; i < wires.length; i++) {
            const w = wires[i];
            for (let j = 0; j < w.points.length; j++) {
                const p = w.points[j];
                const key = `${Math.round(p.x)},${Math.round(p.y)}`;
                counts.set(key, (counts.get(key) ?? 0) + 1);
            }
        }
        // Detect T-junctions: a vertex of wire A lies on a segment of wire B
        for (let i = 0; i < wires.length; i++) {
            const wA = wires[i];
            if (wA.points.length < 2)
                continue;
            for (let j = 0; j < wires.length; j++) {
                if (i === j)
                    continue;
                const wB = wires[j];
                for (let v = 0; v < wB.points.length; v++) {
                    const pt = wB.points[v];
                    for (let s = 0; s < wA.points.length - 1; s++) {
                        const a = wA.points[s];
                        const b = wA.points[s + 1];
                        const key = `${Math.round(pt.x)},${Math.round(pt.y)}`;
                        // Skip if already counted as a vertex junction
                        if ((counts.get(key) ?? 0) >= 2)
                            continue;
                        if (this.pointOnSegment(pt, a, b)) {
                            counts.set(key, (counts.get(key) ?? 0) + 2); // mark as T-junction
                        }
                    }
                }
            }
        }
        this.juncCache = counts;
        this.juncCacheKey = cacheKey;
        this.renderJuncPoints(ctx, counts);
    }
    /** Check if point p lies on segment ab within tolerance */
    private pointOnSegment(p: Point2D, a: Point2D, b: Point2D, tolerance: number = 4): boolean {
        const px = Math.round(p.x);
        const py = Math.round(p.y);
        const ax = Math.round(a.x);
        const ay = Math.round(a.y);
        const bx = Math.round(b.x);
        const by = Math.round(b.y);
        // Segment must be axis-aligned (orthogonal routing)
        if (ax === bx) {
            // Vertical segment
            const minY = Math.min(ay, by) - tolerance;
            const maxY = Math.max(ay, by) + tolerance;
            return Math.abs(px - ax) <= tolerance && py >= minY && py <= maxY;
        }
        if (ay === by) {
            // Horizontal segment
            const minX = Math.min(ax, bx) - tolerance;
            const maxX = Math.max(ax, bx) + tolerance;
            return Math.abs(py - ay) <= tolerance && px >= minX && px <= maxX;
        }
        // Non-orthogonal segment — use distance to line
        const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
        const segLen = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
        const dist = segLen > 0 ? Math.abs(cross) / segLen : Infinity;
        if (dist > tolerance)
            return false;
        // Check if projection lies within segment bounds
        const dot = (px - ax) * (bx - ax) + (py - ay) * (by - ay);
        return dot >= -tolerance && dot <= segLen * segLen + tolerance;
    }
    private renderJuncPoints(ctx: CanvasRenderingContext2D, counts: Map<string, number>): void {
        ctx.fillStyle = ProteusColors.WIRE;
        counts.forEach((count: number, key: string) => {
            if (count >= 2) {
                const parts = key.split(',');
                const jx = parseInt(parts[0]);
                const jy = parseInt(parts[1]);
                ctx.beginPath();
                ctx.arc(jx, jy, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    }
    /**
     * Draws filled dots at wire endpoints that connect to component pins.
     * This makes wire-to-pin connections clearly visible regardless of draw order.
     */
    private drawWireConnectionMarkers(ctx: CanvasRenderingContext2D): void {
        const doc = this.appService.schematicEditor.getDocument();
        if (doc.wires.length === 0) {
            return;
        }
        // Build set of all pin world positions across all components
        const pinSet = new Set<string>();
        for (let ci = 0; ci < doc.components.length; ci++) {
            const comp = doc.components[ci];
            const def = this.getCachedCompDef(comp.libraryId);
            if (def === null) {
                continue;
            }
            for (let pi = 0; pi < def.pins.length; pi++) {
                const pin = def.pins[pi];
                const local = this.transformPinOffset(pin.position, comp.rotation, comp.mirrored);
                const px = Math.round(comp.position.x + local.x);
                const py = Math.round(comp.position.y + local.y);
                pinSet.add(`${px},${py}`);
            }
        }
        ctx.fillStyle = ProteusColors.WIRE;
        const drawn = new Set<string>();
        for (let wi = 0; wi < doc.wires.length; wi++) {
            const wire = doc.wires[wi];
            if (wire.points.length < 2) {
                continue;
            }
            const endpoints = [wire.points[0], wire.points[wire.points.length - 1]];
            for (let ei = 0; ei < endpoints.length; ei++) {
                const ep = endpoints[ei];
                const key = `${Math.round(ep.x)},${Math.round(ep.y)}`;
                if (pinSet.has(key) && !drawn.has(key)) {
                    drawn.add(key);
                    ctx.beginPath();
                    ctx.arc(ep.x, ep.y, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }
    private drawNetLabels(ctx: CanvasRenderingContext2D, doc: SchematicDocument): void {
        if (!doc.netLabels) {
            return;
        }
        for (let i = 0; i < doc.netLabels.length; i++) {
            const label = doc.netLabels[i];
            const x = label.position.x;
            const y = label.position.y;
            // global=true：电源/地符号级标号；模板 stub 标号用文字（Proteus LBL）
            const isPower = label.global &&
                (label.text === 'VCC' || label.text === 'VDD' || label.text === 'V+');
            const isGnd = label.global && label.text === 'GND';
            if (isPower) {
                this.drawPowerSymbol(ctx, x, y, label.text);
            }
            else if (isGnd) {
                this.drawGroundSymbol(ctx, x, y);
            }
            else {
                ctx.fillStyle = ProteusColors.TEXT_PRIMARY;
                ctx.font = `${ProteusFonts.CANVAS_LABEL}px sans-serif`;
                ctx.fillText(label.text, x, y);
            }
        }
    }
    private drawPowerSymbol(ctx: CanvasRenderingContext2D, x: number, y: number, text: string): void {
        ctx.strokeStyle = ProteusColors.POWER;
        ctx.fillStyle = ProteusColors.POWER;
        ctx.lineWidth = 1.2;
        // Vertical arrow pointing up from connection point
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - 10);
        ctx.stroke();
        // Arrow head
        ctx.beginPath();
        ctx.moveTo(x - 4, y - 6);
        ctx.lineTo(x, y - 10);
        ctx.lineTo(x + 4, y - 6);
        ctx.closePath();
        ctx.fill();
        // Text above
        ctx.font = `${ProteusFonts.CANVAS_LABEL - 1}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(text, x, y - 14);
        ctx.textAlign = 'start';
    }
    private drawGroundSymbol(ctx: CanvasRenderingContext2D, x: number, y: number): void {
        ctx.strokeStyle = ProteusColors.GROUND;
        ctx.lineWidth = 1.2;
        // Vertical line from connection point
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 6);
        ctx.stroke();
        // Three descending horizontal lines
        const lineWidths = [10, 7, 4];
        for (let l = 0; l < 3; l++) {
            const ly = y + 7 + l * 3;
            const hw = lineWidths[l] / 2;
            ctx.beginPath();
            ctx.moveTo(x - hw, ly);
            ctx.lineTo(x + hw, ly);
            ctx.stroke();
        }
    }
    private drawErcMarkers(ctx: CanvasRenderingContext2D, doc: SchematicDocument): void {
        const compMap = new Map<string, ComponentInstance>();
        for (let i = 0; i < doc.components.length; i++) {
            compMap.set(doc.components[i].id, doc.components[i]);
        }
        for (let e = 0; e < this.ercErrors.length; e++) {
            const err = this.ercErrors[e];
            const comp = compMap.get(err.targetUuid);
            if (comp === undefined) {
                continue;
            }
            const x = comp.position.x;
            const y = comp.position.y;
            const isError = err.severity === 'error' || err.severity === 'critical';
            const color = isError ? ProteusColors.ERC_ERR : ProteusColors.ERC_WARN;
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = 1.5;
            // Red error circle with cross
            ctx.beginPath();
            ctx.arc(x + 20, y - 20, 7, 0, Math.PI * 2);
            ctx.stroke();
            // X mark inside circle
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(x + 16, y - 24);
            ctx.lineTo(x + 24, y - 16);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x + 24, y - 24);
            ctx.lineTo(x + 16, y - 16);
            ctx.stroke();
            // Error count badge if multiple errors on same component
            if (e === 0 || this.ercErrors[e - 1].targetUuid !== err.targetUuid) {
                let count = 1;
                for (let k = e + 1; k < this.ercErrors.length; k++) {
                    if (this.ercErrors[k].targetUuid === err.targetUuid) {
                        count++;
                    }
                }
                if (count > 1) {
                    ctx.font = '8px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(`${count}`, x + 20, y - 17);
                    ctx.textAlign = 'start';
                }
            }
        }
    }
    private drawHRuler(): void {
        const ctx = this.rulerHCtx;
        const vp = this.appService.schematicEditor.getViewport();
        const w = this.viewWidth;
        const h = ProteusDimens.RULER_SIZE;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = ProteusColors.CANVAS_BG;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = ProteusColors.TEXT_PRIMARY;
        ctx.fillStyle = ProteusColors.TEXT_PRIMARY;
        ctx.font = `${ProteusFonts.RULER}px sans-serif`;
        ctx.lineWidth = 0.5;
        const step = vp.gridSize * 5;
        const wxStart = Math.floor((-vp.panOffset.x / vp.zoom) / step) * step;
        const wxEnd = wxStart + Math.ceil(w / vp.zoom) + step;
        for (let wx = wxStart; wx <= wxEnd; wx += step) {
            const sx = wx * vp.zoom + vp.panOffset.x;
            if (sx < 0 || sx > w) {
                continue;
            }
            ctx.beginPath();
            ctx.moveTo(sx, h - 6);
            ctx.lineTo(sx, h);
            ctx.stroke();
            ctx.fillText(`${wx}`, sx + 2, h - 8);
        }
    }
    private drawVRuler(): void {
        const ctx = this.rulerVCtx;
        const vp = this.appService.schematicEditor.getViewport();
        const w = ProteusDimens.RULER_SIZE;
        const h = this.viewHeight;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = ProteusColors.CANVAS_BG;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = ProteusColors.TEXT_PRIMARY;
        ctx.fillStyle = ProteusColors.TEXT_PRIMARY;
        ctx.font = `${ProteusFonts.RULER}px sans-serif`;
        ctx.lineWidth = 0.5;
        const step = vp.gridSize * 5;
        const wyStart = Math.floor((-vp.panOffset.y / vp.zoom) / step) * step;
        const wyEnd = wyStart + Math.ceil(h / vp.zoom) + step;
        for (let wy = wyStart; wy <= wyEnd; wy += step) {
            const sy = wy * vp.zoom + vp.panOffset.y;
            if (sy < 0 || sy > h) {
                continue;
            }
            ctx.beginPath();
            ctx.moveTo(w - 6, sy);
            ctx.lineTo(w, sy);
            ctx.stroke();
            ctx.fillText(`${wy}`, 2, sy - 2);
        }
    }
    rerender() {
        this.updateDirtyElements();
    }
}
