if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface SchematicCanvas_Params {
    canvasVersion?: number;
    themeRefreshKey?: number;
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
    dragIds?: string[];
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
    fitSettleTimer?: number;
    redrawScheduled?: boolean;
    redrawTimer?: number;
    hoverComponentId?: string;
    hoverWireNetId?: string;
    contextMenuVisible?: boolean;
    contextMenuScreenX?: number;
    contextMenuScreenY?: number;
    contextMenuShowAddLabel?: boolean;
    contextMenuShowEdit?: boolean;
    contextMenuShowCopy?: boolean;
    showNetLabelDialog?: boolean;
    netLabelDialogTitle?: string;
    netLabelDialogName?: string;
    previewWireEnd?: Point2D | null;
    placementPreview?: Point2D | null;
    isBoxSelecting?: boolean;
    boxSelectStart?: Point2D;
    boxSelectEnd?: Point2D;
    shiftHeld?: boolean;
    alignGuideX?: number | null;
    wireWaypoints?: Point2D[];
    lastWirePreviewCorrected?: boolean;
    warDrawPoints?: Point2D[];
    warDrawBlocked?: boolean;
    warDrawCorrected?: boolean;
    warRouteTimer?: number;
    warRoutePending?: boolean;
    lastWarPreviewEndKey?: string;
    wireOverlayRedrawScheduled?: boolean;
    wireOverlayRedrawTimer?: number;
    lastWireSnapMs?: number;
    lastSnappedWireEnd?: Point2D | null;
    alignGuideY?: number | null;
    dragBlocked?: boolean;
    interactiveToggleCompId?: string;
    potDragCompId?: string;
    potDragLastWiper?: number;
    tempDragCompId?: string;
    tempDragLastC?: number;
    lastDownTime?: number;
    lastUpTime?: number;
    wireBranchEligible?: boolean;
    lastLabelTapMs?: number;
    lastLabelTapId?: string;
    netLabelPendingX?: number;
    netLabelPendingY?: number;
    netLabelEditId?: string;
    contextNetLabelX?: number;
    contextNetLabelY?: number;
    middlePanning?: boolean;
    middlePanLastX?: number;
    middlePanLastY?: number;
    leftPanning?: boolean;
    leftPanLastX?: number;
    leftPanLastY?: number;
    emptyHoldPending?: boolean;
    panHoldTimer?: number;
    handCursorMode?: number;
    lastMouseSX?: number;
    lastMouseSY?: number;
    pinchStartZoom?: number;
    pinchCenterX?: number;
    pinchCenterY?: number;
    simFrameDirty?: boolean;
    backgroundDirty?: boolean;
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
import { ModuleEvent, EventBus, calcSymbolBounds, SimulationState, getPinNetMap, findNetForPinLabel, isPowerSupplyLabelText, isGroundLabelText, DeviceHitGeometry } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchematicDocument, ComponentInstance, Wire, ViewportState, Point2D, WorldRect, Rect2D, ModuleEventPayload, ErcError } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SimulationKernelImpl } from 'simulation_kernel';
import type { ComponentDefinition } from 'component_library';
import { EditorToolMode } from "@bundle:com.elecdraw.aischsim/entry/ets/model/EditorToolMode";
import { ProteusColors, ProteusDimens, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import { ProteusClassicBtn, ProteusTextInput } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import { ThemeManager } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ThemeManager";
import { SchematicLayerId } from "@bundle:com.elecdraw.aischsim/entry@schematic_editor/Index";
import type { SchematicEditorImpl } from "@bundle:com.elecdraw.aischsim/entry@schematic_editor/Index";
import pointer from "@ohos:multimodalInput.pointer";
export class SchematicCanvas extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__canvasVersion = new SynchedPropertySimpleTwoWayPU(params.canvasVersion, this, "canvasVersion");
        this.__themeRefreshKey = new SynchedPropertySimpleOneWayPU(params.themeRefreshKey, this, "themeRefreshKey");
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
        this.dragIds = [];
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
        this.fitSettleTimer = -1;
        this.redrawScheduled = false;
        this.redrawTimer = -1;
        this.__hoverComponentId = new ObservedPropertySimplePU('', this, "hoverComponentId");
        this.__hoverWireNetId = new ObservedPropertySimplePU('', this, "hoverWireNetId");
        this.__contextMenuVisible = new ObservedPropertySimplePU(false, this, "contextMenuVisible");
        this.__contextMenuScreenX = new ObservedPropertySimplePU(0, this, "contextMenuScreenX");
        this.__contextMenuScreenY = new ObservedPropertySimplePU(0, this, "contextMenuScreenY");
        this.__contextMenuShowAddLabel = new ObservedPropertySimplePU(false, this, "contextMenuShowAddLabel");
        this.__contextMenuShowEdit = new ObservedPropertySimplePU(false, this, "contextMenuShowEdit");
        this.__contextMenuShowCopy = new ObservedPropertySimplePU(false, this, "contextMenuShowCopy");
        this.__showNetLabelDialog = new ObservedPropertySimplePU(false, this, "showNetLabelDialog");
        this.__netLabelDialogTitle = new ObservedPropertySimplePU('放置网络标号', this, "netLabelDialogTitle");
        this.__netLabelDialogName = new ObservedPropertySimplePU('NET1', this, "netLabelDialogName");
        this.__previewWireEnd = new ObservedPropertyObjectPU(null, this, "previewWireEnd");
        this.__placementPreview = new ObservedPropertyObjectPU(null, this, "placementPreview");
        this.isBoxSelecting = false;
        this.boxSelectStart = { x: 0, y: 0 };
        this.boxSelectEnd = { x: 0, y: 0 };
        this.shiftHeld = false;
        this.alignGuideX = null;
        this.wireWaypoints = [];
        this.lastWirePreviewCorrected = false;
        this.warDrawPoints = [];
        this.warDrawBlocked = false;
        this.warDrawCorrected = false;
        this.warRouteTimer = -1;
        this.warRoutePending = false;
        this.lastWarPreviewEndKey = '';
        this.wireOverlayRedrawScheduled = false;
        this.wireOverlayRedrawTimer = -1;
        this.lastWireSnapMs = 0;
        this.lastSnappedWireEnd = null;
        this.alignGuideY = null;
        this.dragBlocked = false;
        this.interactiveToggleCompId = '';
        this.potDragCompId = '';
        this.potDragLastWiper = -1;
        this.tempDragCompId = '';
        this.tempDragLastC = Number.NaN;
        this.lastDownTime = 0;
        this.lastUpTime = 0;
        this.wireBranchEligible = false;
        this.lastLabelTapMs = 0;
        this.lastLabelTapId = '';
        this.netLabelPendingX = 0;
        this.netLabelPendingY = 0;
        this.netLabelEditId = '';
        this.contextNetLabelX = 0;
        this.contextNetLabelY = 0;
        this.middlePanning = false;
        this.middlePanLastX = 0;
        this.middlePanLastY = 0;
        this.leftPanning = false;
        this.leftPanLastX = 0;
        this.leftPanLastY = 0;
        this.emptyHoldPending = false;
        this.panHoldTimer = -1;
        this.handCursorMode = 0;
        this.lastMouseSX = 0;
        this.lastMouseSY = 0;
        this.pinchStartZoom = 1;
        this.pinchCenterX = 0;
        this.pinchCenterY = 0;
        this.simFrameDirty = false;
        this.backgroundDirty = true;
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
            // 拖拽平移中不刷标尺，避免与双层 Canvas 抢帧导致画面撕裂
            if (!this.isPanGestureActive()) {
                this.rulerDirty = true;
            }
            this.scheduleRedraw();
            const zp = Math.round(this.appService.schematicEditor.getZoom() * 100);
            if (this.zoomPercent !== zp) {
                this.zoomPercent = zp;
            }
        };
        this.onSimStep = (_payload: ModuleEventPayload): void => {
            // 平移/捏合期间跳过仿真帧，防止导线层单独刷新与背景不同步
            if (this.gestureBusy || this.isPanGestureActive()) {
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
        this.declareWatch("themeRefreshKey", this.onThemeRefreshChange);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: SchematicCanvas_Params) {
        if (params.themeRefreshKey === undefined) {
            this.__themeRefreshKey.set(0);
        }
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
        if (params.dragIds !== undefined) {
            this.dragIds = params.dragIds;
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
        if (params.fitSettleTimer !== undefined) {
            this.fitSettleTimer = params.fitSettleTimer;
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
        if (params.contextMenuShowAddLabel !== undefined) {
            this.contextMenuShowAddLabel = params.contextMenuShowAddLabel;
        }
        if (params.contextMenuShowEdit !== undefined) {
            this.contextMenuShowEdit = params.contextMenuShowEdit;
        }
        if (params.contextMenuShowCopy !== undefined) {
            this.contextMenuShowCopy = params.contextMenuShowCopy;
        }
        if (params.showNetLabelDialog !== undefined) {
            this.showNetLabelDialog = params.showNetLabelDialog;
        }
        if (params.netLabelDialogTitle !== undefined) {
            this.netLabelDialogTitle = params.netLabelDialogTitle;
        }
        if (params.netLabelDialogName !== undefined) {
            this.netLabelDialogName = params.netLabelDialogName;
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
        if (params.lastWirePreviewCorrected !== undefined) {
            this.lastWirePreviewCorrected = params.lastWirePreviewCorrected;
        }
        if (params.warDrawPoints !== undefined) {
            this.warDrawPoints = params.warDrawPoints;
        }
        if (params.warDrawBlocked !== undefined) {
            this.warDrawBlocked = params.warDrawBlocked;
        }
        if (params.warDrawCorrected !== undefined) {
            this.warDrawCorrected = params.warDrawCorrected;
        }
        if (params.warRouteTimer !== undefined) {
            this.warRouteTimer = params.warRouteTimer;
        }
        if (params.warRoutePending !== undefined) {
            this.warRoutePending = params.warRoutePending;
        }
        if (params.lastWarPreviewEndKey !== undefined) {
            this.lastWarPreviewEndKey = params.lastWarPreviewEndKey;
        }
        if (params.wireOverlayRedrawScheduled !== undefined) {
            this.wireOverlayRedrawScheduled = params.wireOverlayRedrawScheduled;
        }
        if (params.wireOverlayRedrawTimer !== undefined) {
            this.wireOverlayRedrawTimer = params.wireOverlayRedrawTimer;
        }
        if (params.lastWireSnapMs !== undefined) {
            this.lastWireSnapMs = params.lastWireSnapMs;
        }
        if (params.lastSnappedWireEnd !== undefined) {
            this.lastSnappedWireEnd = params.lastSnappedWireEnd;
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
        if (params.tempDragCompId !== undefined) {
            this.tempDragCompId = params.tempDragCompId;
        }
        if (params.tempDragLastC !== undefined) {
            this.tempDragLastC = params.tempDragLastC;
        }
        if (params.lastDownTime !== undefined) {
            this.lastDownTime = params.lastDownTime;
        }
        if (params.lastUpTime !== undefined) {
            this.lastUpTime = params.lastUpTime;
        }
        if (params.wireBranchEligible !== undefined) {
            this.wireBranchEligible = params.wireBranchEligible;
        }
        if (params.lastLabelTapMs !== undefined) {
            this.lastLabelTapMs = params.lastLabelTapMs;
        }
        if (params.lastLabelTapId !== undefined) {
            this.lastLabelTapId = params.lastLabelTapId;
        }
        if (params.netLabelPendingX !== undefined) {
            this.netLabelPendingX = params.netLabelPendingX;
        }
        if (params.netLabelPendingY !== undefined) {
            this.netLabelPendingY = params.netLabelPendingY;
        }
        if (params.netLabelEditId !== undefined) {
            this.netLabelEditId = params.netLabelEditId;
        }
        if (params.contextNetLabelX !== undefined) {
            this.contextNetLabelX = params.contextNetLabelX;
        }
        if (params.contextNetLabelY !== undefined) {
            this.contextNetLabelY = params.contextNetLabelY;
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
        if (params.leftPanning !== undefined) {
            this.leftPanning = params.leftPanning;
        }
        if (params.leftPanLastX !== undefined) {
            this.leftPanLastX = params.leftPanLastX;
        }
        if (params.leftPanLastY !== undefined) {
            this.leftPanLastY = params.leftPanLastY;
        }
        if (params.emptyHoldPending !== undefined) {
            this.emptyHoldPending = params.emptyHoldPending;
        }
        if (params.panHoldTimer !== undefined) {
            this.panHoldTimer = params.panHoldTimer;
        }
        if (params.handCursorMode !== undefined) {
            this.handCursorMode = params.handCursorMode;
        }
        if (params.lastMouseSX !== undefined) {
            this.lastMouseSX = params.lastMouseSX;
        }
        if (params.lastMouseSY !== undefined) {
            this.lastMouseSY = params.lastMouseSY;
        }
        if (params.pinchStartZoom !== undefined) {
            this.pinchStartZoom = params.pinchStartZoom;
        }
        if (params.pinchCenterX !== undefined) {
            this.pinchCenterX = params.pinchCenterX;
        }
        if (params.pinchCenterY !== undefined) {
            this.pinchCenterY = params.pinchCenterY;
        }
        if (params.simFrameDirty !== undefined) {
            this.simFrameDirty = params.simFrameDirty;
        }
        if (params.backgroundDirty !== undefined) {
            this.backgroundDirty = params.backgroundDirty;
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
        this.__themeRefreshKey.reset(params.themeRefreshKey);
        this.__rulerVisible.reset(params.rulerVisible);
        this.__ercErrors.reset(params.ercErrors);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__canvasVersion.purgeDependencyOnElmtId(rmElmtId);
        this.__themeRefreshKey.purgeDependencyOnElmtId(rmElmtId);
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
        this.__contextMenuShowAddLabel.purgeDependencyOnElmtId(rmElmtId);
        this.__contextMenuShowEdit.purgeDependencyOnElmtId(rmElmtId);
        this.__contextMenuShowCopy.purgeDependencyOnElmtId(rmElmtId);
        this.__showNetLabelDialog.purgeDependencyOnElmtId(rmElmtId);
        this.__netLabelDialogTitle.purgeDependencyOnElmtId(rmElmtId);
        this.__netLabelDialogName.purgeDependencyOnElmtId(rmElmtId);
        this.__previewWireEnd.purgeDependencyOnElmtId(rmElmtId);
        this.__placementPreview.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__canvasVersion.aboutToBeDeleted();
        this.__themeRefreshKey.aboutToBeDeleted();
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
        this.__contextMenuShowAddLabel.aboutToBeDeleted();
        this.__contextMenuShowEdit.aboutToBeDeleted();
        this.__contextMenuShowCopy.aboutToBeDeleted();
        this.__showNetLabelDialog.aboutToBeDeleted();
        this.__netLabelDialogTitle.aboutToBeDeleted();
        this.__netLabelDialogName.aboutToBeDeleted();
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
    /** 主题切换时递增，强制 Canvas 节点重绑背景色并重绘 */
    private __themeRefreshKey: SynchedPropertySimpleOneWayPU<number>;
    get themeRefreshKey() {
        return this.__themeRefreshKey.get();
    }
    set themeRefreshKey(newValue: number) {
        this.__themeRefreshKey.set(newValue);
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
    /** 本次拖动涉及的全部器件（多选一起移动） */
    private dragIds: string[];
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
    private fitSettleTimer: number;
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
    private __contextMenuShowAddLabel: ObservedPropertySimplePU<boolean>;
    get contextMenuShowAddLabel() {
        return this.__contextMenuShowAddLabel.get();
    }
    set contextMenuShowAddLabel(newValue: boolean) {
        this.__contextMenuShowAddLabel.set(newValue);
    }
    private __contextMenuShowEdit: ObservedPropertySimplePU<boolean>;
    get contextMenuShowEdit() {
        return this.__contextMenuShowEdit.get();
    }
    set contextMenuShowEdit(newValue: boolean) {
        this.__contextMenuShowEdit.set(newValue);
    }
    /** 仅选中器件时显示「复制」；仅导线时只显示「删除」 */
    private __contextMenuShowCopy: ObservedPropertySimplePU<boolean>;
    get contextMenuShowCopy() {
        return this.__contextMenuShowCopy.get();
    }
    set contextMenuShowCopy(newValue: boolean) {
        this.__contextMenuShowCopy.set(newValue);
    }
    private __showNetLabelDialog: ObservedPropertySimplePU<boolean>;
    get showNetLabelDialog() {
        return this.__showNetLabelDialog.get();
    }
    set showNetLabelDialog(newValue: boolean) {
        this.__showNetLabelDialog.set(newValue);
    }
    private __netLabelDialogTitle: ObservedPropertySimplePU<string>;
    get netLabelDialogTitle() {
        return this.__netLabelDialogTitle.get();
    }
    set netLabelDialogTitle(newValue: string) {
        this.__netLabelDialogTitle.set(newValue);
    }
    private __netLabelDialogName: ObservedPropertySimplePU<string>;
    get netLabelDialogName() {
        return this.__netLabelDialogName.get();
    }
    set netLabelDialogName(newValue: string) {
        this.__netLabelDialogName.set(newValue);
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
    /** 上一次预览是否已自动绕障（避免 pointer move 刷状态栏） */
    private lastWirePreviewCorrected: boolean;
    /** 画布侧 WAR 预览折线（绘制用，避免每帧同步 A*） */
    private warDrawPoints: Point2D[];
    private warDrawBlocked: boolean;
    private warDrawCorrected: boolean;
    private warRouteTimer: number;
    private warRoutePending: boolean;
    private lastWarPreviewEndKey: string;
    private wireOverlayRedrawScheduled: boolean;
    private wireOverlayRedrawTimer: number;
    /** 鼠标静止后再跑 lite WAR；拖动中只画 L 线 */
    private static readonly WAR_DEBOUNCE_MS: number = 120;
    /** 导线层重绘节流（约 ≤20fps），避免拖线时主线程刷屏 */
    private static readonly WIRE_OVERLAY_THROTTLE_MS: number = 48;
    /** 磁吸扫描节流：拖动中不必每像素扫引脚/导线 */
    private static readonly WIRE_SNAP_THROTTLE_MS: number = 40;
    private lastWireSnapMs: number;
    private lastSnappedWireEnd: Point2D | null;
    private alignGuideY: number | null;
    private dragBlocked: boolean; // true when component/layer locked, prevents accidental pan
    /** Sim-time pushbutton candidate — toggled on short click without drag */
    private interactiveToggleCompId: string;
    /** Sim-time potentiometer drag — horizontal local-X maps to wiper 0..1 */
    private potDragCompId: string;
    private potDragLastWiper: number;
    /** Sim-time DS18B20 temp drag — horizontal local-X maps to −55…125°C */
    private tempDragCompId: string;
    private tempDragLastC: number;
    private lastDownTime: number;
    private lastUpTime: number;
    /** 本次按下前该导线是否已选中 — 仅此时松开才允许引出，避免「一击既选又布线」 */
    private wireBranchEligible: boolean;
    private lastLabelTapMs: number;
    private lastLabelTapId: string;
    private netLabelPendingX: number;
    private netLabelPendingY: number;
    /** 空=新放置；非空=重命名已有标号 */
    private netLabelEditId: string;
    private contextNetLabelX: number;
    private contextNetLabelY: number;
    private middlePanning: boolean;
    private middlePanLastX: number;
    private middlePanLastY: number;
    /** 空白区左键：长按 1s 后进入平移；1s 内移动则框选 */
    private leftPanning: boolean;
    private leftPanLastX: number;
    private leftPanLastY: number;
    private emptyHoldPending: boolean;
    private panHoldTimer: number;
    /** 当前已设置的小手光标，避免每帧 setCursor 触发 UI 抖动 */
    private handCursorMode: number; // 0 none, 1 open, 2 grabbing
    /** 最近鼠标屏幕坐标（滚轮/工具栏缩放锚点） */
    private lastMouseSX: number;
    private lastMouseSY: number;
    private pinchStartZoom: number;
    private pinchCenterX: number;
    private pinchCenterY: number;
    private simFrameDirty: boolean;
    private backgroundDirty: boolean;
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
    private static readonly PAN_HOLD_MS: number = 1000;
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
            if (this.viewWidth > 0 && this.viewHeight > 0 && this.needsFitOnLayout) {
                this.appService.schematicEditor.fitAllInView();
            }
        }, 120);
        setTimeout(() => {
            this.ensureLayoutRedraw('startup-late');
            if (this.viewWidth > 0 && this.viewHeight > 0) {
                this.appService.schematicEditor.fitAllInView();
                this.needsFitOnLayout = false;
            }
        }, 400);
    }
    aboutToDisappear(): void {
        EventBus.getInstance().unsubscribe(ModuleEvent.SCHEMATIC_CHANGED, this.onSchematicChanged);
        EventBus.getInstance().unsubscribe(ModuleEvent.VIEWPORT_CHANGED, this.onViewportChanged);
        EventBus.getInstance().unsubscribe(ModuleEvent.SIMULATION_STEP, this.onSimStep);
        EventBus.getInstance().unsubscribe(ModuleEvent.SIMULATION_STARTED, this.onSimulationStarted);
        if (this.fitSettleTimer >= 0) {
            clearTimeout(this.fitSettleTimer);
            this.fitSettleTimer = -1;
        }
        if (this.redrawTimer >= 0) {
            clearTimeout(this.redrawTimer);
            this.redrawTimer = -1;
        }
        if (this.gestureIdleTimer >= 0) {
            clearTimeout(this.gestureIdleTimer);
            this.gestureIdleTimer = -1;
        }
        this.clearWarRouteTimer();
        if (this.wireOverlayRedrawTimer >= 0) {
            clearTimeout(this.wireOverlayRedrawTimer);
            this.wireOverlayRedrawTimer = -1;
        }
        this.clearPanHoldTimer();
        this.restoreCanvasCursor();
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
    onThemeRefreshChange(): void {
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
        // 布线预览要跟手：优先 0 延迟；若已排队更长延迟则缩短
        const wireLive = this.toolMode === EditorToolMode.WIRE && this.getWireStart() !== null;
        const delay = wireLive ? 0 :
            ((this.gestureBusy || this.isPanGestureActive()) ?
                SchematicCanvas.GESTURE_REDRAW_MS : SchematicCanvas.REDRAW_INTERVAL_MS);
        if (this.redrawScheduled) {
            if (wireLive && this.redrawTimer >= 0 && delay === 0) {
                clearTimeout(this.redrawTimer);
                this.redrawTimer = setTimeout(() => {
                    this.redrawScheduled = false;
                    this.redrawTimer = -1;
                    this.redraw();
                }, 0);
            }
            return;
        }
        this.redrawScheduled = true;
        this.redrawTimer = setTimeout(() => {
            this.redrawScheduled = false;
            this.redrawTimer = -1;
            this.redraw();
        }, delay);
    }
    private isPanGestureActive(): boolean {
        return this.leftPanning || this.middlePanning || this.twoFingerPanning;
    }
    /** 平移开始时标记忙碌，抑制仿真帧与过密重绘 */
    private notePanGesture(): void {
        this.markGestureBusy();
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
            // 启动期：明显变大（最大化）或尚未完成首次稳定 fit 时重新适配
            const growDelta = Math.max(Math.abs(nw - prevW), Math.abs(nh - prevH));
            const growAfterMaximize = !wasUnlaid && growDelta > 16;
            if (this.needsFitOnLayout || wasUnlaid || growAfterMaximize) {
                this.appService.schematicEditor.fitAllInView();
                this.scheduleRedraw();
                if (wasUnlaid || growAfterMaximize) {
                    // 尺寸还在变：延后清除，等布局收敛后再 fit 最后一次
                    this.needsFitOnLayout = true;
                    if (this.fitSettleTimer >= 0) {
                        clearTimeout(this.fitSettleTimer);
                    }
                    this.fitSettleTimer = setTimeout(() => {
                        this.fitSettleTimer = -1;
                        if (this.viewWidth > 0 && this.viewHeight > 0) {
                            this.appService.schematicEditor.fitAllInView();
                            this.scheduleRedraw();
                        }
                        this.needsFitOnLayout = false;
                    }, 180);
                }
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
                        Canvas.key(`ruler-h-${this.themeRefreshKey}`);
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
                        Canvas.key(`ruler-v-${this.themeRefreshKey}`);
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
            Canvas.key(`sch-bg-${this.themeRefreshKey}`);
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
            Canvas.onAxisEvent((event: AxisEvent) => this.handleAxisZoom(event));
            // Layer 0: Background — grid + components (static, rarely redrawn)
            Canvas.onHover((isHover: boolean) => {
                if (isHover && this.leftPanning) {
                    this.applyHandCursorNow(this.handCursorMode === 2);
                }
            });
            // Layer 0: Background — grid + components (static, rarely redrawn)
            Canvas.onKeyEvent((event: KeyEvent) => {
                if (event.type === KeyType.Down && event.keyCode === 27) {
                    if (this.showNetLabelDialog) {
                        this.closeNetLabelDialog();
                        return true;
                    }
                    this.wireWaypoints = [];
                    this.clearSelection();
                    return true;
                }
                return false;
            });
            globalThis.Gesture.create(GesturePriority.Low);
            PinchGesture.create();
            PinchGesture.onActionStart((event: GestureEvent) => {
                if (this.appService.isAiGenerating()) {
                    return;
                }
                this.markGestureBusy();
                this.pinchStartZoom = this.appService.schematicEditor.getZoom();
                this.pinchCenterX = event.pinchCenterX;
                this.pinchCenterY = event.pinchCenterY;
            });
            PinchGesture.onActionUpdate((event: GestureEvent) => {
                if (this.appService.isAiGenerating()) {
                    return;
                }
                this.markGestureBusy();
                const editor = this.appService.schematicEditor;
                editor.zoomAt(this.pinchCenterX, this.pinchCenterY, this.pinchStartZoom * event.scale);
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
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        If.create();
                        if (this.contextMenuShowAddLabel) {
                            this.ifElseBranchUpdateFunction(0, () => {
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusClassicBtn(this, {
                                                label: '添加网络标号',
                                                widthVal: 128,
                                                heightVal: 32,
                                                onAction: () => {
                                                    this.contextMenuVisible = false;
                                                    this.openPlaceNetLabelDialog(this.contextNetLabelX, this.contextNetLabelY);
                                                }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/SchematicCanvas.ets", line: 515, col: 17 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    label: '添加网络标号',
                                                    widthVal: 128,
                                                    heightVal: 32,
                                                    onAction: () => {
                                                        this.contextMenuVisible = false;
                                                        this.openPlaceNetLabelDialog(this.contextNetLabelX, this.contextNetLabelY);
                                                    }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                label: '添加网络标号',
                                                widthVal: 128,
                                                heightVal: 32
                                            });
                                        }
                                    }, { name: "ProteusClassicBtn" });
                                }
                            });
                        }
                        else {
                            this.ifElseBranchUpdateFunction(1, () => {
                            });
                        }
                    }, If);
                    If.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        If.create();
                        if (this.contextMenuShowEdit) {
                            this.ifElseBranchUpdateFunction(0, () => {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    If.create();
                                    if (this.contextMenuShowCopy) {
                                        this.ifElseBranchUpdateFunction(0, () => {
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
                                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/SchematicCanvas.ets", line: 527, col: 19 });
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
                                        });
                                    }
                                    else {
                                        this.ifElseBranchUpdateFunction(1, () => {
                                        });
                                    }
                                }, If);
                                If.pop();
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
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/SchematicCanvas.ets", line: 537, col: 17 });
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
                            });
                        }
                        else {
                            this.ifElseBranchUpdateFunction(1, () => {
                            });
                        }
                    }, If);
                    If.pop();
                    Column.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.showNetLabelDialog) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Stack.create({ alignContent: Alignment.Center });
                        Stack.width('100%');
                        Stack.height('100%');
                        Stack.zIndex(30);
                    }, Stack);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.width('100%');
                        Column.height('100%');
                        Column.backgroundColor('#00000060');
                        Column.onClick(() => { this.closeNetLabelDialog(); });
                    }, Column);
                    Column.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.width(320);
                        Column.padding(16);
                        Column.backgroundColor(ProteusColors.CANVAS_BG);
                        Column.border({ width: 1, color: ProteusColors.DIVIDER });
                        Column.shadow({ radius: 8, color: '#00000040' });
                        Column.onClick(() => { });
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.netLabelDialogTitle);
                        Text.fontSize(ProteusFonts.TITLE);
                        Text.fontColor(ProteusColors.TEXT_PRIMARY);
                        Text.fontWeight(FontWeight.Medium);
                        Text.margin({ bottom: 6 });
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('同名标号将并网；建议贴在引脚或导线端点');
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                        Text.margin({ bottom: 10 });
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        __Common__.create();
                        __Common__.width('100%');
                    }, __Common__);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusTextInput(this, {
                                    placeholder: '如 NET1 / SDA / VCC',
                                    text: this.netLabelDialogName,
                                    mono: true,
                                    onChange: (v: string) => { this.netLabelDialogName = v; },
                                    onSubmit: () => { this.confirmNetLabelDialog(); }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/SchematicCanvas.ets", line: 574, col: 17 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        placeholder: '如 NET1 / SDA / VCC',
                                        text: this.netLabelDialogName,
                                        mono: true,
                                        onChange: (v: string) => { this.netLabelDialogName = v; },
                                        onSubmit: () => { this.confirmNetLabelDialog(); }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    placeholder: '如 NET1 / SDA / VCC',
                                    text: this.netLabelDialogName,
                                    mono: true
                                });
                            }
                        }, { name: "ProteusTextInput" });
                    }
                    __Common__.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create({ space: 8 });
                        Row.width('100%');
                        Row.margin({ top: 10 });
                    }, Row);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '取消',
                                    widthVal: '48%',
                                    onAction: () => { this.closeNetLabelDialog(); }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/SchematicCanvas.ets", line: 583, col: 19 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '取消',
                                        widthVal: '48%',
                                        onAction: () => { this.closeNetLabelDialog(); }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '取消',
                                    widthVal: '48%'
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: this.netLabelEditId.length > 0 ? '改名' : '放置',
                                    widthVal: '48%',
                                    onAction: () => { this.confirmNetLabelDialog(); }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/SchematicCanvas.ets", line: 588, col: 19 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: this.netLabelEditId.length > 0 ? '改名' : '放置',
                                        widthVal: '48%',
                                        onAction: () => { this.confirmNetLabelDialog(); }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: this.netLabelEditId.length > 0 ? '改名' : '放置',
                                    widthVal: '48%'
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    Row.pop();
                    Column.pop();
                    Stack.pop();
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
            this.lastMouseSX = event.x;
            this.lastMouseSY = event.y;
            const world = this.screenToWorld(event.x, event.y);
            this.updateMouseCoord(world);
            // Middle-click pan
            if (this.middlePanning) {
                const dx = event.x - this.middlePanLastX;
                const dy = event.y - this.middlePanLastY;
                this.middlePanLastX = event.x;
                this.middlePanLastY = event.y;
                this.notePanGesture();
                this.appService.schematicEditor.panBy(dx, dy);
                return;
            }
            // Left-drag empty area pan（长按就绪后）
            if (this.leftPanning) {
                const dx = event.x - this.leftPanLastX;
                const dy = event.y - this.leftPanLastY;
                this.leftPanLastX = event.x;
                this.leftPanLastY = event.y;
                this.applyHandCursorNow(true);
                this.notePanGesture();
                this.appService.schematicEditor.panBy(dx, dy);
                return;
            }
            // 空白长按等待中也要走 onPointerMove，以便及时转框选
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
            this.lastMouseSX = event.x;
            this.lastMouseSY = event.y;
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
                this.notePanGesture();
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
                this.endPanGestureVisual();
                this.scheduleRedraw();
                return;
            }
            this.onPointerUp(event.x, event.y);
        }
    }
    /** 滚轮：以鼠标位置为中心缩放 */
    private handleAxisZoom(event: AxisEvent): void {
        if (this.appService.isAiGenerating()) {
            return;
        }
        const v = event.getVerticalAxisValue();
        if (v === 0) {
            return;
        }
        this.lastMouseSX = event.x;
        this.lastMouseSY = event.y;
        // 滚轮向前(负)放大，向后(正)缩小
        const factor = v < 0 ? 1.12 : (1 / 1.12);
        this.appService.schematicEditor.zoomByFactor(factor, event.x, event.y);
    }
    private clearDragState(): void {
        this.dragComponentId = '';
        this.dragIds = [];
        this.dragPreviewPos = null;
        this.dragBlocked = false;
    }
    private isDragId(id: string): boolean {
        for (let i = 0; i < this.dragIds.length; i++) {
            if (this.dragIds[i] === id) {
                return true;
            }
        }
        return id.length > 0 && id === this.dragComponentId;
    }
    private getDragDelta(): Point2D {
        if (this.dragPreviewPos === null) {
            return { x: 0, y: 0 };
        }
        return {
            x: this.dragPreviewPos.x - this.dragStartPos.x,
            y: this.dragPreviewPos.y - this.dragStartPos.y
        };
    }
    private getDragDrawPos(comp: ComponentInstance): Point2D {
        if (!this.isDragId(comp.id) || this.dragPreviewPos === null) {
            return comp.position;
        }
        if (comp.id === this.dragComponentId) {
            return this.dragPreviewPos;
        }
        const d = this.getDragDelta();
        return { x: comp.position.x + d.x, y: comp.position.y + d.y };
    }
    private clearSelection(): void {
        this.selectedComponentId = '';
        this.clearDragState();
        this.wireBranchEligible = false;
        this.toolMode = EditorToolMode.SELECT;
        this.appService.schematicEditor.setSelection([]);
        this.setWireStart(null);
        this.wireWaypoints = [];
        this.previewWireEnd = null;
        this.lastWirePreviewCorrected = false;
        (this.appService.schematicEditor as SchematicEditorImpl).clearWarPathBuffer();
        this.scheduleRedraw();
        this.onStatusChange('已取消选择');
    }
    /** 取消进行中的布线，回到选择模式；可选同时清除导线/器件选中 */
    private cancelActiveWiring(clearSel: boolean = true): void {
        this.wireWaypoints = [];
        this.setWireStart(null);
        this.previewWireEnd = null;
        this.lastWirePreviewCorrected = false;
        this.wireBranchEligible = false;
        this.clearWarPreviewState();
        (this.appService.schematicEditor as SchematicEditorImpl).clearWarPathBuffer();
        this.toolMode = EditorToolMode.SELECT;
        if (clearSel) {
            this.selectedComponentId = '';
            this.clearDragState();
            this.appService.schematicEditor.setSelection([]);
        }
        this.onStatusChange('已取消布线');
        this.scheduleRedraw();
    }
    private clearWarRouteTimer(): void {
        if (this.warRouteTimer >= 0) {
            clearTimeout(this.warRouteTimer);
            this.warRouteTimer = -1;
        }
        this.warRoutePending = false;
    }
    private clearWarPreviewState(): void {
        this.clearWarRouteTimer();
        this.warDrawPoints = [];
        this.warDrawBlocked = false;
        this.warDrawCorrected = false;
        this.lastWarPreviewEndKey = '';
        this.lastSnappedWireEnd = null;
        this.lastWireSnapMs = 0;
    }
    /**
     * Right-click: cancel tools when active; selected wire/device → delete (+ copy if device);
     * wire endpoint (no selection) → add net label.
     */
    private handleRightClick(): void {
        this.contextMenuVisible = false;
        this.contextMenuShowAddLabel = false;
        this.contextMenuShowEdit = false;
        this.contextMenuShowCopy = false;
        if (this.toolMode === EditorToolMode.PLACE) {
            this.pendingLibraryId = '';
            this.placementPreview = null;
            this.toolMode = EditorToolMode.SELECT;
            this.onStatusChange('取消放置');
            this.scheduleRedraw();
            return;
        }
        if (this.wireWaypoints.length > 0 || this.wireStartActive || this.toolMode === EditorToolMode.WIRE) {
            this.cancelActiveWiring(true);
            return;
        }
        const world = this.screenToWorld(this.contextMenuScreenX, this.contextMenuScreenY);
        const editor = this.appService.schematicEditor as SchematicEditorImpl;
        const selectedDevices = editor.getSelectedDevices();
        const selectedWireIds = editor.getSelectedWireIds();
        // 选中导线/器件后右击：删除（导线不必对准端点）
        if (selectedDevices.length > 0 || selectedWireIds.length > 0) {
            this.contextMenuShowEdit = true;
            this.contextMenuShowCopy = selectedDevices.length > 0;
            const endpoint = this.findNearestWireEndpointWorld(world);
            if (endpoint !== null && selectedWireIds.length > 0) {
                this.contextNetLabelX = endpoint.x;
                this.contextNetLabelY = endpoint.y;
                this.contextMenuShowAddLabel = true;
            }
            this.contextMenuVisible = true;
            return;
        }
        const endpoint = this.findNearestWireEndpointWorld(world);
        if (endpoint !== null) {
            this.contextNetLabelX = endpoint.x;
            this.contextNetLabelY = endpoint.y;
            this.contextMenuShowAddLabel = true;
            this.contextMenuVisible = true;
            this.onStatusChange('导线端点：可添加网络标号');
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
                }
                return;
            }
            if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
                // Wait until all fingers are up
                if (event.touches.length <= 1) {
                    this.twoFingerPanning = false;
                    this.endPanGestureVisual();
                    this.scheduleRedraw();
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
        this.interactiveToggleCompId = '';
        this.pointerDown = false;
        this.clearDragState();
        this.isBoxSelecting = false;
        this.leftPanning = false;
        this.emptyHoldPending = false;
        this.clearPanHoldTimer();
        this.restoreCanvasCursor();
        this.previewWireEnd = null;
        this.alignGuideX = null;
        this.alignGuideY = null;
        this.scheduleRedraw();
    }
    private clearPanHoldTimer(): void {
        if (this.panHoldTimer >= 0) {
            clearTimeout(this.panHoldTimer);
            this.panHoldTimer = -1;
        }
    }
    /** 长按就绪：张开手；拖拽中：抓取手。同一模式只设一次 */
    private setCanvasHandCursor(grabbing: boolean): void {
        const mode = grabbing ? 2 : 1;
        if (this.handCursorMode === mode) {
            return;
        }
        this.handCursorMode = mode;
        try {
            const style = grabbing ? pointer.PointerStyle.HAND_GRABBING : pointer.PointerStyle.HAND_OPEN;
            // 必须走绑定当前组件的 CursorController；全局 cursorControl 在定时器里常不生效
            this.getUIContext().getCursorController().setCursor(style);
        }
        catch (_e) {
            // 部分模拟器/环境可能无光标能力，忽略
        }
    }
    private restoreCanvasCursor(): void {
        if (this.handCursorMode === 0) {
            return;
        }
        this.handCursorMode = 0;
        try {
            this.getUIContext().getCursorController().restoreDefault();
        }
        catch (_e) {
            // ignore
        }
    }
    private armEmptyHoldForPan(): void {
        this.clearPanHoldTimer();
        this.emptyHoldPending = true;
        this.leftPanning = false;
        this.panHoldTimer = setTimeout(() => {
            this.panHoldTimer = -1;
            if (!this.pointerDown || !this.emptyHoldPending) {
                return;
            }
            this.emptyHoldPending = false;
            this.leftPanning = true;
            this.leftPanLastX = this.lastPointerX;
            this.leftPanLastY = this.lastPointerY;
            this.applyHandCursorNow(false);
            this.notePanGesture();
            this.onStatusChange('可拖拽平移画布（小手）');
            // setCursor 在下一帧生效，再补一次确保可见
            setTimeout(() => {
                if (this.leftPanning && this.pointerDown) {
                    this.applyHandCursorNow(false);
                }
            }, 16);
        }, SchematicCanvas.PAN_HOLD_MS);
    }
    /** 强制刷新光标（忽略同模式缓存） */
    private applyHandCursorNow(grabbing: boolean): void {
        this.handCursorMode = 0;
        this.setCanvasHandCursor(grabbing);
    }
    private promoteEmptyHoldToBoxSelect(world: Point2D): void {
        this.clearPanHoldTimer();
        this.emptyHoldPending = false;
        this.leftPanning = false;
        this.isBoxSelecting = true;
        const downWorld = this.screenToWorld(this.downPointerX, this.downPointerY);
        this.boxSelectStart = downWorld;
        this.boxSelectEnd = world;
        this.onStatusChange('框选中…');
        this.scheduleRedraw();
    }
    /** 平移结束：恢复光标并强制双层全量重绘，消除拖拽中的轻量残影 */
    private endPanGestureVisual(): void {
        this.restoreCanvasCursor();
        this.backgroundDirty = true;
        this.rulerDirty = true;
        if (this.gestureIdleTimer >= 0) {
            clearTimeout(this.gestureIdleTimer);
            this.gestureIdleTimer = -1;
        }
        this.gestureBusy = false;
        this.appService.setUiGestureBusy(false);
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
        // 区域放大：按下即开始拖框，不走器件命中
        if (this.toolMode === EditorToolMode.ZOOM_REGION) {
            this.clearDragState();
            this.isBoxSelecting = true;
            this.boxSelectStart = world;
            this.boxSelectEnd = world;
            this.onStatusChange('拖框指定放大区域');
            this.scheduleRedraw();
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
        const editor = this.appService.schematicEditor as SchematicEditorImpl;
        // 仅「紧贴引脚」时跳过器件拖拽，留给 handleTap 从脚布线；点本体仍可选中看属性
        if (this.toolMode === EditorToolMode.SELECT) {
            const nearPinDown = this.findNearestPinWorld(world, this.pinClickThreshold());
            if (nearPinDown !== null) {
                this.wireBranchEligible = false;
                this.selectedComponentId = '';
                this.clearDragState();
                this.scheduleRedraw();
                return;
            }
            // 导线中段：不要在 down 里选中器件
            const wireHit = editor.hitTestWireAt(world);
            if (wireHit !== null && wireHit.length > 0) {
                const selectedWires = editor.getSelectedWireIds();
                this.wireBranchEligible = false;
                for (let wi = 0; wi < selectedWires.length; wi++) {
                    if (selectedWires[wi] === wireHit) {
                        this.wireBranchEligible = true;
                        break;
                    }
                }
                this.selectedComponentId = '';
                this.clearDragState();
                this.scheduleRedraw();
                return;
            }
            this.wireBranchEligible = false;
        }
        // 先 hitTest，勿用 selectAt（会立刻把多选压成单选）
        const hits = editor.hitTestAt(world);
        this.interactiveToggleCompId = '';
        this.potDragCompId = '';
        if (this.toolMode === EditorToolMode.SELECT && hits.length > 0) {
            const hitId = hits[0];
            if (this.shiftHeld) {
                const toggled = this.appService.schematicEditor.toggleSelection(hitId);
                this.selectedComponentId = toggled.length > 0 ? toggled[toggled.length - 1] : '';
                this.onStatusChange(`已选择 ${toggled.length} 个器件`);
                this.scheduleRedraw();
                return;
            }
            // Simulation: click SW_PUSH to toggle press/release (no drag)
            if (this.isSimulationActive() && this.isPushButtonComponent(hitId)) {
                this.interactiveToggleCompId = hitId;
                this.clearDragState();
                this.appService.schematicEditor.setSelection([hitId]);
                this.selectedComponentId = hitId;
                this.onStatusChange('松开完成按键切换');
                return;
            }
            // Simulation: click HALL to toggle magnet field
            if (this.isSimulationActive() && this.isHallSensorComponent(hitId)) {
                this.interactiveToggleCompId = hitId;
                this.clearDragState();
                this.appService.schematicEditor.setSelection([hitId]);
                this.selectedComponentId = hitId;
                this.onStatusChange('松开切换霍尔磁场');
                return;
            }
            // Simulation: drag pot wiper along resistor body
            if (this.isSimulationActive() && this.isPotentiometerComponent(hitId)) {
                this.potDragCompId = hitId;
                this.potDragLastWiper = -1;
                this.clearDragState();
                this.appService.schematicEditor.setSelection([hitId]);
                this.selectedComponentId = hitId;
                this.applyPotWiperFromWorld(hitId, world);
                this.onStatusChange('拖动调节滑动变阻器');
                return;
            }
            // Simulation: drag DS18B20 temperature slider
            if (this.isSimulationActive() && this.isDs18b20Component(hitId)) {
                this.tempDragCompId = hitId;
                this.tempDragLastC = Number.NaN;
                this.clearDragState();
                this.appService.schematicEditor.setSelection([hitId]);
                this.selectedComponentId = hitId;
                this.applySensorTempFromWorld(hitId, world);
                this.onStatusChange('拖动调节实验温度');
                return;
            }
            const alreadySelected = editor.isComponentSelected(hitId);
            let moveIds: string[] = [];
            if (alreadySelected) {
                const docSel = this.appService.schematicEditor.getDocument().components;
                for (let i = 0; i < docSel.length; i++) {
                    if (editor.isComponentSelected(docSel[i].id)) {
                        moveIds.push(docSel[i].id);
                    }
                }
            }
            if (alreadySelected && moveIds.length > 1) {
                // 点在已选集合内：保持多选，整组拖动
                this.selectedComponentId = hitId;
            }
            else {
                this.appService.schematicEditor.setSelection([hitId]);
                moveIds = [hitId];
                this.selectedComponentId = hitId;
            }
            if (editor.isLayerLocked(SchematicLayerId.COMPONENTS)) {
                this.clearDragState();
                this.dragBlocked = true;
                this.onStatusChange('器件层已锁定');
                this.scheduleRedraw();
                return;
            }
            let anyLocked = false;
            for (let i = 0; i < moveIds.length; i++) {
                if (this.appService.schematicEditor.isComponentLocked(moveIds[i])) {
                    anyLocked = true;
                    break;
                }
            }
            if (anyLocked) {
                this.clearDragState();
                this.dragBlocked = true;
                this.onStatusChange(moveIds.length > 1 ? '选中含锁定器件，无法拖动' : '器件已锁定，无法拖动');
                this.scheduleRedraw();
                return;
            }
            this.dragIds = moveIds;
            this.dragComponentId = hitId;
            this.dragBlocked = false;
            const doc = this.appService.schematicEditor.getDocument();
            const comp = doc.components.find(c => c.id === hitId);
            if (comp) {
                this.dragStartPos = { x: comp.position.x, y: comp.position.y };
                this.dragPreviewPos = { x: comp.position.x, y: comp.position.y };
            }
            this.onStatusChange(moveIds.length > 1
                ? `已选择 ${moveIds.length} 个器件（可拖动）`
                : `已选择 ${hitId}`);
            this.scheduleRedraw();
            return;
        }
        if (this.toolMode === EditorToolMode.SELECT) {
            // 空白区（导线已在上面提前 return）：取消器件/导线选中
            this.selectedComponentId = '';
            this.clearDragState();
            this.wireBranchEligible = false;
            // 空白区：长按 1s 不动 → 小手拖动画布；1s 内移动 → 框选
            if (!this.shiftHeld) {
                this.appService.schematicEditor.setSelection([]);
            }
            this.isBoxSelecting = false;
            this.leftPanning = false;
            this.armEmptyHoldForPan();
            this.onStatusChange('长按1秒拖动画布，移动则框选');
            this.scheduleRedraw();
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
            const g = this.appService.schematicEditor.getViewport().gridSize;
            const now = Date.now();
            if (now - this.lastWireSnapMs >= SchematicCanvas.WIRE_SNAP_THROTTLE_MS ||
                this.lastSnappedWireEnd === null) {
                this.lastWireSnapMs = now;
                const nearPin = this.findNearestPinWorld(world);
                const nearWire = this.findNearestWireSnapWorld(world);
                this.lastSnappedWireEnd = nearPin ?? nearWire ?? this.snapWorldToGrid(world, g);
            }
            else if (this.lastSnappedWireEnd !== null) {
                // 节流间隙：网格跟手，磁吸点沿用上次
                const gridEnd = this.snapWorldToGrid(world, g);
                const snap = this.lastSnappedWireEnd;
                const snapDist = Math.hypot(world.x - snap.x, world.y - snap.y);
                this.lastSnappedWireEnd = snapDist <= g * 1.2 ? snap : gridEnd;
            }
            this.previewWireEnd = this.lastSnappedWireEnd ?? this.snapWorldToGrid(world, g);
            this.onWirePreviewEndMoved();
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
        if (this.tempDragCompId.length > 0 && this.isSimulationActive()) {
            this.applySensorTempFromWorld(this.tempDragCompId, world);
            return;
        }
        if (this.leftPanning) {
            const panDx = sx - this.leftPanLastX;
            const panDy = sy - this.leftPanLastY;
            this.leftPanLastX = sx;
            this.leftPanLastY = sy;
            this.applyHandCursorNow(true);
            this.notePanGesture();
            this.appService.schematicEditor.panBy(panDx, panDy);
            this.lastPointerX = sx;
            this.lastPointerY = sy;
            return;
        }
        // 空白长按等待中：一移动就改框选
        if (this.emptyHoldPending && moved && this.isSelectMode()) {
            this.promoteEmptyHoldToBoxSelect(world);
            this.lastPointerX = sx;
            this.lastPointerY = sy;
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
        else if (this.isBoxSelecting && moved &&
            (this.isSelectMode() || this.toolMode === EditorToolMode.ZOOM_REGION)) {
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
        // Sim pushbutton / hall: short click toggles（按键保持闭合直到再点一次）
        if (this.interactiveToggleCompId.length > 0) {
            const swId = this.interactiveToggleCompId;
            this.interactiveToggleCompId = '';
            if (!moved || this.isTapSlop(totalDx, totalDy)) {
                if (this.isHallSensorComponent(swId)) {
                    const next = this.appService.toggleInteractiveHall(swId);
                    if (next.length > 0) {
                        this.onStatusChange(next === '1' ? 'HALL 磁场 ON（OUT 拉低）' : 'HALL 磁场 OFF（上拉）');
                        this.backgroundDirty = true;
                    }
                    else {
                        this.onStatusChange('霍尔切换失败（是否在仿真中？）');
                    }
                }
                else {
                    const next = this.appService.toggleInteractiveSwitch(swId);
                    if (next.length > 0) {
                        this.onStatusChange(next === '1' ? 'SW CLOSED (KEY=GND)' : 'SW OPEN (KEY 上拉)');
                        this.backgroundDirty = true;
                    }
                    else {
                        this.onStatusChange('按键切换失败（是否在仿真中？）');
                    }
                }
            }
            this.isBoxSelecting = false;
            this.leftPanning = false;
            this.emptyHoldPending = false;
            this.clearPanHoldTimer();
            this.restoreCanvasCursor();
            this.pointerDown = false;
            this.clearDragState();
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
            this.leftPanning = false;
            this.emptyHoldPending = false;
            this.clearPanHoldTimer();
            this.restoreCanvasCursor();
            this.pointerDown = false;
            this.clearDragState();
            this.scheduleRedraw();
            return;
        }
        // Sim DS18B20: finish temp drag
        if (this.tempDragCompId.length > 0) {
            const tempId = this.tempDragCompId;
            this.applySensorTempFromWorld(tempId, world);
            this.tempDragCompId = '';
            this.tempDragLastC = Number.NaN;
            this.backgroundDirty = true;
            this.isBoxSelecting = false;
            this.leftPanning = false;
            this.emptyHoldPending = false;
            this.clearPanHoldTimer();
            this.restoreCanvasCursor();
            this.pointerDown = false;
            this.clearDragState();
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
        else if (this.leftPanning || this.emptyHoldPending) {
            // 长按平移结束 / 未满1s松开：取消选中（含导线），不触发框选/布线
            this.wireBranchEligible = false;
            if (!this.shiftHeld) {
                this.selectedComponentId = '';
                this.appService.schematicEditor.setSelection([]);
            }
            this.onStatusChange('就绪');
        }
        else if (this.toolMode === EditorToolMode.ZOOM_REGION && this.isBoxSelecting) {
            this.boxSelectEnd = world;
            const rect = this.normalizeRect(this.boxSelectStart, this.boxSelectEnd);
            if (rect.width > 4 && rect.height > 4) {
                this.appService.schematicEditor.fitRectInView(rect);
                this.toolMode = EditorToolMode.SELECT;
                this.onStatusChange('已放大选定区域');
            }
            else {
                this.onStatusChange('拖框过小，未放大');
            }
        }
        else if (!moved || this.isTapSlop(totalDx, totalDy)) {
            this.handleTap(world);
        }
        else if (this.dragComponentId.length > 0 && this.isSelectMode()) {
            if (this.dragPreviewPos !== null) {
                const delta = this.getDragDelta();
                if (this.dragIds.length > 1) {
                    this.appService.schematicEditor.moveComponents(this.dragIds, delta);
                    this.onStatusChange(`已移动 ${this.dragIds.length} 个器件`);
                }
                else if (Math.abs(delta.x) > 0 || Math.abs(delta.y) > 0) {
                    this.appService.schematicEditor.moveComponent(this.dragComponentId, this.dragPreviewPos);
                }
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
        const wasPanning = this.leftPanning;
        this.leftPanning = false;
        this.emptyHoldPending = false;
        this.clearPanHoldTimer();
        if (wasPanning) {
            this.endPanGestureVisual();
        }
        else {
            this.restoreCanvasCursor();
        }
        this.pointerDown = false;
        this.clearDragState();
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
    private isDs18b20Component(compId: string): boolean {
        const doc = this.appService.schematicEditor.getDocument();
        const comp = doc.components.find(c => c.id === compId);
        if (comp === undefined) {
            return false;
        }
        return comp.libraryId.toUpperCase().includes('DS18B20');
    }
    private isHallSensorComponent(compId: string): boolean {
        const doc = this.appService.schematicEditor.getDocument();
        const comp = doc.components.find(c => c.id === compId);
        if (comp === undefined) {
            return false;
        }
        return comp.libraryId.toUpperCase().includes('HALL');
    }
    private isHallActive(comp: ComponentInstance): boolean {
        const v = (comp.parameters.get('active') ?? '0').trim().toLowerCase();
        return v === '1' || v === 'true' || v === 'on' || v === 'yes';
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
    private parseSensorTempC(comp: ComponentInstance): number {
        let s = (comp.parameters.get('temp_c') ?? '25').trim().replace(/\s+/g, '');
        if (s.endsWith('°C') || s.endsWith('℃')) {
            s = s.substring(0, s.length - 2);
        }
        else if (s.toLowerCase().endsWith('c') && s.length > 1) {
            s = s.substring(0, s.length - 1);
        }
        let n = parseFloat(s);
        if (isNaN(n)) {
            return 25;
        }
        if (n < -55) {
            return -55;
        }
        if (n > 125) {
            return 125;
        }
        return n;
    }
    /** Map pointer → DS18B20 temp_c along local X (−22…+22 → −55…125°C). */
    private applySensorTempFromWorld(compId: string, world: Point2D): void {
        const doc = this.appService.schematicEditor.getDocument();
        const comp = doc.components.find(c => c.id === compId);
        if (comp === undefined) {
            return;
        }
        const dx = world.x - comp.position.x;
        const dy = world.y - comp.position.y;
        let loc = this.inverseRotateLocal(dx, dy, comp.rotation);
        if (comp.mirrored) {
            loc = { x: -loc.x, y: loc.y };
        }
        let t = (loc.x + 22) / 44;
        if (t < 0) {
            t = 0;
        }
        else if (t > 1) {
            t = 1;
        }
        const tempC = -55 + t * 180;
        if (!isNaN(this.tempDragLastC) && Math.abs(tempC - this.tempDragLastC) < 0.8) {
            return;
        }
        const next = this.appService.setInteractiveSensorTemp(compId, tempC);
        if (next.length === 0) {
            return;
        }
        this.tempDragLastC = tempC;
        this.backgroundDirty = true;
        this.onStatusChange(`${comp.refDes} 温度 ${Math.round(tempC)}°C`);
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
        this.clearWarPreviewState();
        (this.appService.schematicEditor as SchematicEditorImpl).clearWarPathBuffer();
        this.onStatusChange('仿真运行中，无法接线');
        this.scheduleRedraw();
        return true;
    }
    private isLayerBlocked(layerId: SchematicLayerId): boolean {
        const editor = this.appService.schematicEditor as SchematicEditorImpl;
        return editor.isLayerLocked(layerId);
    }
    private handleTap(world: Point2D): void {
        if (this.showNetLabelDialog) {
            return;
        }
        const editor = this.appService.schematicEditor as SchematicEditorImpl;
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
                const g = this.appService.schematicEditor.getViewport().gridSize;
                const nearPin = this.findNearestPinWorld(world);
                const nearWire = this.findNearestWireSnapWorld(world);
                const snapped = this.snapWorldToGrid(world, g);
                const wirePoint = nearPin ?? nearWire ?? snapped;
                const endTol = Math.max(g * 1.5, 8);
                if (wireStart === null) {
                    if (nearPin === null && nearWire === null) {
                        // 尚未开始：空白不能起线（须从引脚/导线起）
                        this.onStatusChange('请先点引脚或导线开始布线；右击取消连线工具');
                        break;
                    }
                    this.wireWaypoints = [wirePoint];
                    this.setWireStart(wirePoint);
                    this.lastWarPreviewEndKey = '';
                    this.onStatusChange(nearPin !== null
                        ? '导线起点: 点空白加拐点；点引脚/导线完成；右击取消'
                        : '导线起点(已接导线): 点空白加拐点；点引脚/导线完成；右击取消');
                }
                else if (nearPin !== null || nearWire !== null) {
                    const firstWp = this.wireWaypoints[0];
                    const sameAnchor = Math.abs(wirePoint.x - firstWp.x) < 4 && Math.abs(wirePoint.y - firstWp.y) < 4;
                    if (sameAnchor) {
                        this.onStatusChange('请点其他引脚/导线完成，或点空白加拐点；右击取消');
                        break;
                    }
                    this.wireWaypoints.push(wirePoint);
                    // 最终预览写入 Path Buffer，落线只校验缓冲、不另寻路
                    const preview = editor.previewWirePath(this.wireWaypoints);
                    if (preview.blocked === true || preview.points.length < 2) {
                        this.onStatusChange('无法布线：路径穿过器件选中区或无合法路径');
                        break;
                    }
                    const wireResult = editor.addWireWithPoints(this.wireWaypoints);
                    this.wireWaypoints = [];
                    this.setWireStart(null);
                    this.previewWireEnd = null;
                    this.lastWirePreviewCorrected = false;
                    this.clearWarPreviewState();
                    editor.clearWarPathBuffer();
                    this.toolMode = EditorToolMode.SELECT;
                    this.selectedComponentId = '';
                    this.appService.schematicEditor.setSelection([]);
                    if (wireResult.success) {
                        this.onStatusChange(nearWire !== null && nearPin === null
                            ? '导线已完成（已并接到既有导线）'
                            : '导线已完成（与 WAR 预览一致）');
                        this.onDocumentChanged();
                    }
                    else {
                        this.onStatusChange(wireResult.error ?? '接线失败');
                    }
                }
                else {
                    const last = this.wireWaypoints[this.wireWaypoints.length - 1];
                    const nearLast = Math.abs(wirePoint.x - last.x) <= endTol &&
                        Math.abs(wirePoint.y - last.y) <= endTol;
                    // 再点当前拐点 → 以该点为导线端点结束（悬空 stub）
                    if (nearLast && this.wireWaypoints.length >= 2) {
                        const preview = editor.previewWirePath(this.wireWaypoints);
                        if (preview.blocked === true || preview.points.length < 2) {
                            this.onStatusChange('无法布线：路径穿过器件选中区或无合法路径');
                            break;
                        }
                        const wireResult = editor.addWireWithPoints(this.wireWaypoints);
                        this.wireWaypoints = [];
                        this.setWireStart(null);
                        this.previewWireEnd = null;
                        this.lastWirePreviewCorrected = false;
                        this.clearWarPreviewState();
                        editor.clearWarPathBuffer();
                        this.toolMode = EditorToolMode.SELECT;
                        this.selectedComponentId = '';
                        this.appService.schematicEditor.setSelection([]);
                        if (wireResult.success) {
                            this.onStatusChange('已放置导线端点（右击可加网络标号）');
                            this.onDocumentChanged();
                        }
                        else {
                            this.onStatusChange(wireResult.error ?? '接线失败');
                        }
                        break;
                    }
                    // 已开始布线：点空白 → 添加拐点（右击才取消）
                    this.wireWaypoints.push(wirePoint);
                    this.lastWarPreviewEndKey = '';
                    this.onStatusChange(`已加拐点(${this.wireWaypoints.length - 1})：继续点空白加拐点，或点引脚/导线完成；右击取消`);
                    this.scheduleRedraw();
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
            case EditorToolMode.LABEL: {
                if (this.appService.isAiGenerating()) {
                    this.onStatusChange('AI 生成中，画布已锁定');
                    break;
                }
                const nearPin = this.findNearestPinWorld(world);
                const pos = nearPin ?? world;
                this.openPlaceNetLabelDialog(pos.x, pos.y);
                break;
            }
            case EditorToolMode.POWER:
                editor.createNetLabel(world.x, world.y, 'VCC');
                this.onStatusChange('已放置电源 VCC');
                this.onDocumentChanged();
                break;
            case EditorToolMode.GROUND:
                editor.createNetLabel(world.x, world.y, 'GND');
                this.onStatusChange('已放置地 GND');
                this.onDocumentChanged();
                break;
            default: {
                // 双击已有网络标号 → 改名（点标号也取消导线选中）
                const labelHit = editor.hitTestNetLabel(world);
                if (labelHit !== null) {
                    this.wireBranchEligible = false;
                    editor.setSelection([]);
                    this.selectedComponentId = '';
                    const now = Date.now();
                    if (labelHit === this.lastLabelTapId && now - this.lastLabelTapMs < 450) {
                        this.openRenameNetLabelDialog(labelHit);
                        this.lastLabelTapId = '';
                        this.lastLabelTapMs = 0;
                        break;
                    }
                    this.lastLabelTapId = labelHit;
                    this.lastLabelTapMs = now;
                    this.onStatusChange('双击网络标号可改名');
                    this.scheduleRedraw();
                    break;
                }
                // 紧贴引脚 → 起线（含已接导线的脚）；阈值收紧以免点器件本体无法看属性
                const nearPin = this.findNearestPinWorld(world, this.pinClickThreshold());
                if (nearPin !== null) {
                    if (this.isSimulationActive()) {
                        this.onStatusChange('仿真运行中，无法接线');
                        break;
                    }
                    if (this.isLayerBlocked(SchematicLayerId.WIRING)) {
                        this.onStatusChange('布线层已锁定');
                        break;
                    }
                    this.wireBranchEligible = false;
                    this.toolMode = EditorToolMode.WIRE;
                    this.selectedComponentId = '';
                    this.clearDragState();
                    this.appService.schematicEditor.setSelection([]);
                    this.wireWaypoints = [nearPin];
                    this.setWireStart(nearPin);
                    this.lastWarPreviewEndKey = '';
                    this.onStatusChange('导线起点: 点空白加拐点；点引脚/导线完成；右击取消');
                    this.scheduleRedraw();
                    break;
                }
                // 无引脚命中：第一次点导线只选中；已选中且本按下前已选中 → 再左击才引出
                const wireId: string | null = editor.hitTestWireAt(world);
                if (wireId !== null && wireId.length > 0) {
                    const selectedWires: string[] = editor.getSelectedWireIds();
                    let alreadySelected = false;
                    for (let i = 0; i < selectedWires.length; i++) {
                        if (selectedWires[i] === wireId) {
                            alreadySelected = true;
                            break;
                        }
                    }
                    if (alreadySelected && this.wireBranchEligible) {
                        if (this.isSimulationActive()) {
                            this.onStatusChange('仿真运行中，无法接线');
                            break;
                        }
                        if (this.isLayerBlocked(SchematicLayerId.WIRING)) {
                            this.onStatusChange('布线层已锁定');
                            break;
                        }
                        const snap = this.findNearestWireSnapWorld(world);
                        if (snap === null) {
                            this.onStatusChange('无法从该点引出导线');
                            break;
                        }
                        this.wireBranchEligible = false;
                        this.toolMode = EditorToolMode.WIRE;
                        this.selectedComponentId = '';
                        this.clearDragState();
                        this.wireWaypoints = [snap];
                        this.setWireStart(snap);
                        this.lastWarPreviewEndKey = '';
                        this.onStatusChange('从导线引出: 点空白加拐点；点引脚/导线完成；右击取消');
                        this.scheduleRedraw();
                        break;
                    }
                    editor.selectAt(world);
                    this.wireBranchEligible = false;
                    this.selectedComponentId = '';
                    this.clearDragState();
                    this.onStatusChange('已选择导线（再左击从该点引出，右击删除）');
                    this.scheduleRedraw();
                    break;
                }
                // 点到非导线处：先取消导线选中
                this.wireBranchEligible = false;
                if (editor.getSelectedWireIds().length > 0) {
                    editor.setSelection([]);
                    this.selectedComponentId = '';
                }
                const hits = editor.selectAt(world);
                if (hits.length > 0) {
                    this.selectedComponentId = hits[0];
                    editor.setSelection([hits[0]]);
                    this.onStatusChange('已选择器件');
                }
                else {
                    this.selectedComponentId = '';
                    editor.setSelection([]);
                    this.onStatusChange('已取消选择');
                }
                this.scheduleRedraw();
                break;
            }
        }
    }
    private openPlaceNetLabelDialog(x: number, y: number): void {
        this.netLabelEditId = '';
        this.netLabelPendingX = x;
        this.netLabelPendingY = y;
        this.netLabelDialogTitle = '放置网络标号';
        this.netLabelDialogName = 'NET1';
        this.showNetLabelDialog = true;
        this.onStatusChange('输入网络名后确认放置');
    }
    private openRenameNetLabelDialog(labelId: string): void {
        const doc = this.appService.schematicEditor.getDocument();
        const labels = doc.netLabels ?? [];
        let text = 'NET1';
        for (let i = 0; i < labels.length; i++) {
            if (labels[i].id === labelId) {
                text = labels[i].text;
                break;
            }
        }
        this.netLabelEditId = labelId;
        this.netLabelDialogTitle = '修改网络标号';
        this.netLabelDialogName = text;
        this.showNetLabelDialog = true;
        this.onStatusChange('输入新的网络名');
    }
    private closeNetLabelDialog(): void {
        this.showNetLabelDialog = false;
        this.netLabelEditId = '';
        this.onStatusChange('就绪');
    }
    private confirmNetLabelDialog(): void {
        const name = this.netLabelDialogName.trim();
        if (name.length === 0) {
            this.onStatusChange('网络名不能为空');
            return;
        }
        const editor = this.appService.schematicEditor;
        if (this.netLabelEditId.length > 0) {
            const result = editor.renameNetLabel(this.netLabelEditId, name);
            this.showNetLabelDialog = false;
            this.netLabelEditId = '';
            if (result.success) {
                this.onStatusChange(`已改名为 ${name}`);
                this.onDocumentChanged();
                this.scheduleRedraw();
            }
            else {
                this.onStatusChange(result.error ?? '改名失败');
            }
            return;
        }
        const result = editor.createNetLabel(this.netLabelPendingX, this.netLabelPendingY, name);
        this.showNetLabelDialog = false;
        if (result.success) {
            this.onStatusChange(`已放置网络标号 ${name}`);
            this.onDocumentChanged();
            this.scheduleRedraw();
        }
        else {
            this.onStatusChange(result.error ?? '放置失败');
        }
    }
    private updateMouseCoord(world: Point2D): void {
        this.mouseX = Math.round(world.x);
        this.mouseY = Math.round(world.y);
    }
    private updateHover(world: Point2D): void {
        const editor = this.appService.schematicEditor as SchematicEditorImpl;
        const hits = editor.hitTestNear(world);
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
        const panLive = this.isPanGestureActive() || this.gestureBusy;
        const bgCtx = this.context;
        const wCtx = this.wireCtx;
        // 平移中强制刷新背景底+网格，保证与前景同帧位移
        if (this.backgroundDirty || panLive) {
            // 先清空导线层，避免慢速背景绘制期间旧导线叠在新背景上造成错乱
            wCtx.clearRect(0, 0, w, h);
            bgCtx.clearRect(0, 0, w, h);
            bgCtx.fillStyle = ThemeManager.getInstance().canvasBg();
            bgCtx.fillRect(0, 0, w, h);
            if (vp.gridVisible) {
                this.drawAdaptiveGrid(bgCtx, vp, panLive);
            }
            // 平移中器件改画到前景层，与导线同变换、同帧提交
            if (!panLive) {
                bgCtx.save();
                bgCtx.translate(vp.panOffset.x, vp.panOffset.y);
                bgCtx.scale(vp.zoom, vp.zoom);
                this.drawBackgroundScene(bgCtx, doc, vp, bounds, editor);
                bgCtx.restore();
            }
            this.backgroundDirty = false;
        }
        // Wire / live layer
        wCtx.clearRect(0, 0, w, h);
        wCtx.save();
        wCtx.translate(vp.panOffset.x, vp.panOffset.y);
        wCtx.scale(vp.zoom, vp.zoom);
        if (panLive && editor.isLayerVisible(SchematicLayerId.COMPONENTS)) {
            this.drawComponents(wCtx, doc.components, false);
            if (editor.isLayerVisible(SchematicLayerId.ANNOTATIONS)) {
                this.drawNetLabels(wCtx, doc);
            }
        }
        if (editor.isLayerVisible(SchematicLayerId.WIRING)) {
            this.drawWires(wCtx, doc.wires);
        }
        this.renderOverlays(wCtx, doc, vp, bounds, editor);
        wCtx.restore();
        this.simFrameDirty = false;
        const zp = Math.round(vp.zoom * 100);
        if (this.zoomPercent !== zp) {
            this.zoomPercent = zp;
        }
        if (this.rulerVisible && this.rulerDirty && !this.isPanGestureActive()) {
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
    /** Draw only the static background elements (components + labels + ERC; grid drawn in screen space) */
    private drawBackgroundScene(ctx: CanvasRenderingContext2D, doc: SchematicDocument, vp: ViewportState, bounds: WorldRect, editor: SchematicEditorImpl): void {
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
    /**
     * 屏幕空间自适应网格：fitAll 后缩放过小时仍可见。
     * 禁止 putImageData（忽略 CTM，自适应后易“消失”）。
     * @param lightweight 平移手势中只画主网格线，降低每帧开销避免画面错乱
     */
    private drawAdaptiveGrid(ctx: CanvasRenderingContext2D, vp: ViewportState, lightweight: boolean = false): void {
        const w = this.viewWidth;
        const h = this.viewHeight;
        if (w <= 0 || h <= 0) {
            return;
        }
        const zoom = Math.max(vp.zoom, 0.01);
        const base = Math.max(vp.gridSize, 1);
        const multipliers: number[] = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
        let step = base;
        for (let i = 0; i < multipliers.length; i++) {
            step = base * multipliers[i];
            if (step * zoom >= 8) {
                break;
            }
        }
        const majorStep = step * 5;
        const startWX = Math.floor((-vp.panOffset.x / zoom) / step) * step;
        const startWY = Math.floor((-vp.panOffset.y / zoom) / step) * step;
        const endWX = startWX + (w / zoom) + step * 2;
        const endWY = startWY + (h / zoom) + step * 2;
        // 平移中跳过点阵，只保留主网格线（或更大步距）
        if (!lightweight) {
            ctx.fillStyle = ProteusColors.GRID_DOT;
            for (let wx = startWX; wx <= endWX; wx += step) {
                const sx = wx * zoom + vp.panOffset.x;
                if (sx < -1 || sx > w + 1) {
                    continue;
                }
                for (let wy = startWY; wy <= endWY; wy += step) {
                    const sy = wy * zoom + vp.panOffset.y;
                    if (sy < -1 || sy > h + 1) {
                        continue;
                    }
                    ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
                }
            }
        }
        const lineStep = lightweight ? Math.max(majorStep, step * 10) : majorStep;
        if (lightweight || majorStep * zoom >= 24) {
            ctx.strokeStyle = ProteusColors.GRID_LINE;
            ctx.lineWidth = 1;
            const majStartX = Math.floor((-vp.panOffset.x / zoom) / lineStep) * lineStep;
            const majStartY = Math.floor((-vp.panOffset.y / zoom) / lineStep) * lineStep;
            for (let wx = majStartX; wx <= endWX; wx += lineStep) {
                const sx = wx * zoom + vp.panOffset.x;
                if (sx < 0 || sx > w) {
                    continue;
                }
                ctx.beginPath();
                ctx.moveTo(sx, 0);
                ctx.lineTo(sx, h);
                ctx.stroke();
            }
            for (let wy = majStartY; wy <= endWY; wy += lineStep) {
                const sy = wy * zoom + vp.panOffset.y;
                if (sy < 0 || sy > h) {
                    continue;
                }
                ctx.beginPath();
                ctx.moveTo(0, sy);
                ctx.lineTo(w, sy);
                ctx.stroke();
            }
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
                // 动态预览：与落线同一套路径（穿选中区则显示绕障正确路径）
                this.drawLiveWirePathPreview(ctx, editor);
                // 当前拐点高亮：再点此处可放置导线端点
                if (this.wireWaypoints.length >= 2) {
                    const last = this.wireWaypoints[this.wireWaypoints.length - 1];
                    ctx.strokeStyle = ProteusColors.SELECTED;
                    ctx.fillStyle = ProteusColors.CANVAS_BG;
                    ctx.lineWidth = 1.5;
                    ctx.fillRect(last.x - 4, last.y - 4, 8, 8);
                    ctx.strokeRect(last.x - 4, last.y - 4, 8, 8);
                }
            }
            // Draw wire-to-pin connection markers on top of everything
            if (this.dragComponentId.length === 0) {
                this.drawWireConnectionMarkers(ctx);
                this.drawDanglingWireEnds(ctx);
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
            this.drawSelectionBox(ctx, this.toolMode === EditorToolMode.ZOOM_REGION);
        }
        if (this.alignGuideX !== null || this.alignGuideY !== null) {
            this.drawAlignGuides(ctx, bounds);
        }
        this.drawSelectionOverlays(ctx, doc, editor);
        this.drawHoverOverlays(ctx, doc, editor);
        this.drawLitLedOverlays(ctx, doc);
        this.drawActiveBuzzerOverlays(ctx, doc);
        // Draw pin snap markers in WIRE mode to show clickable pin positions
        if (this.toolMode === EditorToolMode.WIRE) {
            this.drawPinSnapMarkers(ctx);
        }
    }
    private drawDraggedComponentPreview(ctx: CanvasRenderingContext2D, components: ComponentInstance[]): void {
        if (this.dragPreviewPos === null || this.dragIds.length === 0) {
            return;
        }
        const delta = this.getDragDelta();
        for (let i = 0; i < components.length; i++) {
            const comp = components[i];
            if (!this.isDragId(comp.id)) {
                continue;
            }
            const def = this.getCachedCompDef(comp.libraryId);
            if (def === null) {
                continue;
            }
            let pos: Point2D = this.dragPreviewPos;
            if (comp.id !== this.dragComponentId) {
                const offsetPos: Point2D = {
                    x: comp.position.x + delta.x,
                    y: comp.position.y + delta.y
                };
                pos = offsetPos;
            }
            const style: SymbolDrawStyle = {
                strokeColor: ProteusColors.SELECTED,
                fillColor: ProteusColors.COMPONENT_BODY_FILL,
                lineWidth: 2.8,
                selected: true,
                hovered: false
            };
            SchematicSymbolRenderer.drawComponent(ctx, pos.x, pos.y, def, comp.refDes, comp.rotation, comp.mirrored, style);
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
    private drawSelectionBox(ctx: CanvasRenderingContext2D, isZoomRegion: boolean = false): void {
        const rect = this.normalizeRect(this.boxSelectStart, this.boxSelectEnd);
        ctx.strokeStyle = isZoomRegion ? '#FF9800' : '#00BFFF';
        ctx.lineWidth = 1 / this.appService.schematicEditor.getZoom();
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        ctx.fillStyle = isZoomRegion ? 'rgba(255, 152, 0, 0.08)' : 'rgba(0, 191, 255, 0.08)';
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.setLineDash([]);
    }
    /**
     * WAR 动态预览：蓝色虚线。绘制只用本地缓存，不在绘制路径里跑 A*。
     */
    private drawLiveWirePathPreview(ctx: CanvasRenderingContext2D, editor: SchematicEditorImpl): void {
        if (!editor.isWarEnabled()) {
            this.drawManualOrthogonalPreview(ctx);
            return;
        }
        const previewPts = this.collectWirePreviewWaypoints();
        if (previewPts.length < 2) {
            return;
        }
        const drawPts = this.warDrawPoints.length >= 2
            ? this.warDrawPoints
            : this.buildCheapOrthogonalPreview(previewPts);
        if (this.warDrawBlocked && this.warDrawPoints.length < 2) {
            ctx.fillStyle = '#CC3333';
            const last = previewPts[previewPts.length - 1];
            ctx.beginPath();
            ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
            ctx.fill();
            return;
        }
        if (drawPts.length < 2) {
            return;
        }
        ctx.strokeStyle = ProteusColors.SELECTED;
        ctx.lineWidth = this.warDrawCorrected ? 2.5 : 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(drawPts[0].x, drawPts[0].y);
        for (let i = 1; i < drawPts.length; i++) {
            ctx.lineTo(drawPts[i].x, drawPts[i].y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }
    /** 鼠标移动：先画廉价 L 线跟手，再防抖跑 WAR */
    private onWirePreviewEndMoved(): void {
        if (this.previewWireEnd === null) {
            return;
        }
        const endKey = `${Math.round(this.previewWireEnd.x)},${Math.round(this.previewWireEnd.y)}`;
        if (endKey === this.lastWarPreviewEndKey) {
            return;
        }
        this.lastWarPreviewEndKey = endKey;
        const previewPts = this.collectWirePreviewWaypoints();
        this.warDrawPoints = this.buildCheapOrthogonalPreview(previewPts);
        this.warDrawBlocked = false;
        this.warDrawCorrected = false;
        this.scheduleWireOverlayRedraw();
        this.requestWarRouteUpdate();
    }
    /** 正交 L 折线（无 A*），用于跟手预览 */
    private buildCheapOrthogonalPreview(previewPts: Point2D[]): Point2D[] {
        if (previewPts.length < 2) {
            return [];
        }
        const out: Point2D[] = [];
        out.push({ x: previewPts[0].x, y: previewPts[0].y });
        for (let i = 1; i < previewPts.length; i++) {
            const prev = out[out.length - 1];
            const curr = previewPts[i];
            if (Math.abs(prev.x - curr.x) < 0.5 || Math.abs(prev.y - curr.y) < 0.5) {
                out.push({ x: curr.x, y: curr.y });
            }
            else {
                out.push({ x: curr.x, y: prev.y });
                out.push({ x: curr.x, y: curr.y });
            }
        }
        return out;
    }
    /** 真正 idle 防抖：每次移动重置计时，静止 WAR_DEBOUNCE_MS 后再算 */
    private requestWarRouteUpdate(): void {
        this.warRoutePending = true;
        if (this.warRouteTimer >= 0) {
            clearTimeout(this.warRouteTimer);
            this.warRouteTimer = -1;
        }
        this.warRouteTimer = setTimeout(() => {
            this.warRouteTimer = -1;
            if (!this.warRoutePending) {
                return;
            }
            this.warRoutePending = false;
            this.runWarRouteCompute();
        }, SchematicCanvas.WAR_DEBOUNCE_MS);
    }
    private runWarRouteCompute(): void {
        if (this.toolMode !== EditorToolMode.WIRE || this.getWireStart() === null) {
            return;
        }
        const editor = this.appService.schematicEditor as SchematicEditorImpl;
        if (!editor.isWarEnabled()) {
            const pts = this.collectWirePreviewWaypoints();
            this.warDrawPoints = this.buildCheapOrthogonalPreview(pts);
            this.warDrawBlocked = false;
            this.warDrawCorrected = false;
            this.scheduleWireOverlayRedraw();
            return;
        }
        const previewPts = this.collectWirePreviewWaypoints();
        if (previewPts.length < 2) {
            this.warDrawPoints = [];
            this.warDrawBlocked = false;
            this.scheduleWireOverlayRedraw();
            return;
        }
        // 拖动预览：previewLite=true，禁止 A*，避免主线程 THREAD_BLOCK
        const result = editor.previewWirePath(previewPts, true);
        if (result.blocked === true || result.points.length < 2) {
            this.warDrawBlocked = true;
            // lite 失败时保留 L 线跟手，避免预览闪空
            this.warDrawPoints = this.buildCheapOrthogonalPreview(previewPts);
            this.warDrawCorrected = false;
            if (!this.lastWirePreviewCorrected) {
                this.lastWirePreviewCorrected = true;
                this.onStatusChange('WAR：当前无法无碰撞布线（不可穿器件选中区）');
            }
        }
        else {
            this.warDrawBlocked = false;
            this.warDrawPoints = result.points;
            this.warDrawCorrected = result.autoCorrected;
            if (result.autoCorrected !== this.lastWirePreviewCorrected) {
                this.lastWirePreviewCorrected = result.autoCorrected;
                if (result.autoCorrected) {
                    this.onStatusChange('WAR 自动寻路：蓝色虚线为将落线路径（已避开选中区）');
                }
                else if (this.wireWaypoints.length >= 1) {
                    this.onStatusChange('导线预览：点空白加拐点；点引脚/导线完成；右击取消');
                }
            }
        }
        this.scheduleWireOverlayRedraw();
    }
    /** 仅刷新导线/预览层；节流避免拖线时主线程刷屏 */
    private scheduleWireOverlayRedraw(): void {
        if (this.viewWidth <= 0 || this.viewHeight <= 0) {
            return;
        }
        if (this.wireOverlayRedrawScheduled) {
            return;
        }
        this.wireOverlayRedrawScheduled = true;
        this.wireOverlayRedrawTimer = setTimeout(() => {
            this.wireOverlayRedrawScheduled = false;
            this.wireOverlayRedrawTimer = -1;
            this.redrawWireOverlayOnly();
        }, SchematicCanvas.WIRE_OVERLAY_THROTTLE_MS);
    }
    private redrawWireOverlayOnly(): void {
        if (this.viewWidth <= 0 || this.viewHeight <= 0) {
            return;
        }
        const doc = this.appService.schematicEditor.getDocument();
        const vp = this.appService.schematicEditor.getViewport();
        const editor = this.appService.schematicEditor as SchematicEditorImpl;
        const w = this.viewWidth;
        const h = this.viewHeight;
        const bounds = this.getVisibleWorldBounds(vp);
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
    }
    /** WAR 关闭时的正交预览（无 A*） */
    private drawManualOrthogonalPreview(ctx: CanvasRenderingContext2D): void {
        const previewPts = this.collectWirePreviewWaypoints();
        if (previewPts.length < 2) {
            return;
        }
        const drawPts = this.buildCheapOrthogonalPreview(previewPts);
        ctx.strokeStyle = ProteusColors.SELECTED;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(drawPts[0].x, drawPts[0].y);
        for (let i = 1; i < drawPts.length; i++) {
            ctx.lineTo(drawPts[i].x, drawPts[i].y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }
    /** 当前拐点 + 光标/吸附端点，供预览与落线共用 */
    private collectWirePreviewWaypoints(): Point2D[] {
        const pts: Point2D[] = [];
        for (let i = 0; i < this.wireWaypoints.length; i++) {
            const wp: Point2D = { x: this.wireWaypoints[i].x, y: this.wireWaypoints[i].y };
            pts.push(wp);
        }
        if (this.previewWireEnd === null) {
            return pts;
        }
        const end: Point2D = { x: this.previewWireEnd.x, y: this.previewWireEnd.y };
        if (pts.length === 0) {
            pts.push(end);
            return pts;
        }
        const last = pts[pts.length - 1];
        if (Math.abs(last.x - end.x) > 0.5 || Math.abs(last.y - end.y) > 0.5) {
            pts.push(end);
        }
        return pts;
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
            if (skipDragPreview && this.isDragId(comp.id)) {
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
            const drawPos = this.getDragDrawPos(comp);
            // Draw IC body backdrop directly on canvas for components with many pins
            this.drawComponentBodyBackdrop(ctx, drawPos, comp, def);
            const swPressed = this.isPushButtonPressed(comp);
            const potWiper = this.isPotentiometerComponent(comp.id) ? this.parsePotWiper(comp) : undefined;
            const sensorTempC = this.isDs18b20Component(comp.id) ? this.parseSensorTempC(comp) : undefined;
            const hallActive = this.isHallSensorComponent(comp.id) ? this.isHallActive(comp) : undefined;
            const style: SymbolDrawStyle = {
                strokeColor: selected ? ProteusColors.SELECTED : ProteusColors.COMPONENT_STROKE,
                fillColor: ProteusColors.COMPONENT_BODY_FILL,
                lineWidth: selected ? 2.8 : 1.2,
                selected: selected,
                hovered: false,
                ledDisplayColor: this.isLedComponent(comp, def) ? '' : undefined,
                switchPressed: swPressed,
                potWiper: potWiper,
                sensorTempC: sensorTempC,
                hallActive: hallActive,
                paramOverrides: comp.parameters
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
        const isRegulator = def.behaviorModel === 'regulator';
        const isMeterBody = def.behaviorModel === 'ammeter_dc' || def.behaviorModel === 'voltmeter_dc';
        const pinBounds = calcSymbolBounds(def.pins, 0);
        // Only draw backdrop for IC-type components (wide/tall pin spread)
        // Skip small 2-pin components like resistors, capacitors, diodes
        // 稳压器：强制画大边框（用户可见 TO-220 主体），不依赖 height 门禁
        // 电压表/电流表：符号自身已画大黑框，勿再叠名称「DC 电流表」造成字乱
        if (isMeterBody) {
            return;
        }
        if (!isRegulator && (pinBounds.width < 50 || pinBounds.height < 40)) {
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
        let cx = (pinBounds.minX + pinBounds.maxX) / 2;
        let cy = (pinBounds.minY + pinBounds.maxY) / 2;
        let w = pinBounds.width;
        let h = pinBounds.height;
        // 稳压器引脚 AABB 偏扁时，仍用固定大框保证可见边界
        if (isRegulator) {
            w = Math.max(w, 70);
            h = Math.max(h, 50);
            cx = 0;
            cy = 10; // 略偏下，盖住底脚方向主体
        }
        // Filled body with visible color — follow active theme
        ctx.fillStyle = ProteusColors.COMPONENT_BODY_FILL;
        ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
        // Bold border
        ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
        // Component name label — 稳压器跳过全名，避免与 REG / 位号挤成一团
        if (!isRegulator && def.name.length > 0) {
            const shortName = def.name.length > 14 ? def.name.substring(0, 12) + '..' : def.name;
            ctx.font = '11px sans-serif';
            ctx.fillStyle = ProteusColors.TEXT_LABEL;
            ctx.textAlign = 'center';
            ctx.fillText(shortName, 0, 4);
            ctx.textAlign = 'start';
        }
        ctx.restore();
    }
    /**
     * Finds the nearest component pin to a world point within threshold.
     * Returns the pin's world position, or null if no pin is close enough.
     * @param threshold 可选；默认与 findPinAtPoint 对齐（吸附用）；点选起线请用更紧阈值。
     */
    private findNearestPinWorld(world: Point2D, threshold?: number): Point2D | null {
        const doc = this.appService.schematicEditor.getDocument();
        const g = this.appService.schematicEditor.getViewport().gridSize;
        const lim = threshold !== undefined ? threshold : Math.max(g * 2, 16);
        let bestDist = lim;
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
    /** SELECT 模式点脚起线：比吸附阈值更紧，避免点器件本体被当成点脚 */
    private pinClickThreshold(): number {
        const g = this.appService.schematicEditor.getViewport().gridSize;
        return Math.min(Math.max(g * 0.9, 7), 10);
    }
    /** 网格吸附，便于再点同一拐点结束端点 */
    private snapWorldToGrid(world: Point2D, gridSize: number): Point2D {
        const g = Math.max(gridSize, 1);
        return {
            x: Math.round(world.x / g) * g,
            y: Math.round(world.y / g) * g
        };
    }
    /** 最近导线端点（起点或终点），用于右键添加网络标号 */
    private findNearestWireEndpointWorld(world: Point2D): Point2D | null {
        const doc = this.appService.schematicEditor.getDocument();
        const g = this.appService.schematicEditor.getViewport().gridSize;
        const threshold = Math.max(g * 1.5, 10);
        let bestDist = threshold;
        let bestPoint: Point2D | null = null;
        for (let i = 0; i < doc.wires.length; i++) {
            const pts = doc.wires[i].points;
            if (pts.length < 2) {
                continue;
            }
            const ends: Point2D[] = [pts[0], pts[pts.length - 1]];
            for (let e = 0; e < ends.length; e++) {
                const dx = world.x - ends[e].x;
                const dy = world.y - ends[e].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= bestDist) {
                    bestDist = dist;
                    bestPoint = { x: ends[e].x, y: ends[e].y };
                }
            }
        }
        return bestPoint;
    }
    /**
     * 吸附到既有导线任意点（端点优先，其次中段投影）— 线-线 T 接 / 并网。
     */
    private findNearestWireSnapWorld(world: Point2D): Point2D | null {
        const doc = this.appService.schematicEditor.getDocument();
        const g = this.appService.schematicEditor.getViewport().gridSize;
        const threshold = Math.min(Math.max(g * 0.75, 6), 12);
        let bestDist = threshold;
        let bestPoint: Point2D | null = null;
        // Prefer endpoints first (stronger magnetic feel for joining stubs)
        for (let i = 0; i < doc.wires.length; i++) {
            const pts = doc.wires[i].points;
            if (pts.length < 2) {
                continue;
            }
            const ends: Point2D[] = [pts[0], pts[pts.length - 1]];
            for (let e = 0; e < ends.length; e++) {
                const dist = Math.hypot(world.x - ends[e].x, world.y - ends[e].y);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestPoint = { x: ends[e].x, y: ends[e].y };
                }
            }
        }
        if (bestPoint !== null) {
            return bestPoint;
        }
        bestDist = threshold;
        for (let i = 0; i < doc.wires.length; i++) {
            const pts = doc.wires[i].points;
            if (pts.length < 2) {
                continue;
            }
            for (let si = 0; si < pts.length - 1; si++) {
                const a = pts[si];
                const b = pts[si + 1];
                const abx = b.x - a.x;
                const aby = b.y - a.y;
                const len2 = abx * abx + aby * aby;
                let t = 0;
                if (len2 > 1e-6) {
                    t = ((world.x - a.x) * abx + (world.y - a.y) * aby) / len2;
                    if (t < 0) {
                        t = 0;
                    }
                    else if (t > 1) {
                        t = 1;
                    }
                }
                const proj: Point2D = { x: a.x + t * abx, y: a.y + t * aby };
                const dist = Math.hypot(world.x - proj.x, world.y - proj.y);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestPoint = proj;
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
        const rect = editor.getComponentHoverRect(comp);
        const zoom = Math.max(this.appService.schematicEditor.getZoom(), 0.35);
        const lw = 2 / zoom;
        ctx.fillStyle = 'rgba(0, 170, 255, 0.16)';
        ctx.strokeStyle = ProteusColors.HOVER_PREVIEW;
        ctx.lineWidth = lw;
        ctx.setLineDash([7 / zoom, 4 / zoom]);
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        ctx.setLineDash([]);
        // 四角短角标，让“可选中区”更醒目
        this.drawCornerBrackets(ctx, rect, ProteusColors.HOVER_PREVIEW, lw, 10 / zoom);
    }
    private drawSelectionOverlays(ctx: CanvasRenderingContext2D, doc: SchematicDocument, editor: SchematicEditorImpl): void {
        const zoom = Math.max(this.appService.schematicEditor.getZoom(), 0.35);
        const lw = Math.max(2.4 / zoom, 1.6);
        let groupMinX = Number.POSITIVE_INFINITY;
        let groupMinY = Number.POSITIVE_INFINITY;
        let groupMaxX = Number.NEGATIVE_INFINITY;
        let groupMaxY = Number.NEGATIVE_INFINITY;
        let selectedCount = 0;
        for (let i = 0; i < doc.components.length; i++) {
            const comp = doc.components[i];
            if (!editor.isComponentSelected(comp.id)) {
                continue;
            }
            selectedCount++;
            const rect = editor.getComponentSelectRect(comp);
            // 拖动预览时选中框跟随
            if (this.isDragId(comp.id) && this.dragPreviewPos !== null) {
                const d = this.getDragDelta();
                rect.x += d.x;
                rect.y += d.y;
            }
            groupMinX = Math.min(groupMinX, rect.x);
            groupMinY = Math.min(groupMinY, rect.y);
            groupMaxX = Math.max(groupMaxX, rect.x + rect.width);
            groupMaxY = Math.max(groupMaxY, rect.y + rect.height);
            ctx.fillStyle = 'rgba(0, 102, 204, 0.18)';
            ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
            ctx.strokeStyle = ProteusColors.SELECTED;
            ctx.lineWidth = lw;
            ctx.setLineDash([]);
            ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
            this.drawCornerBrackets(ctx, rect, ProteusColors.SELECTED, lw + 0.5 / zoom, 12 / zoom);
            // 角点小方块手柄
            const hs = 4.5 / zoom;
            const corners: number[][] = [
                [rect.x, rect.y],
                [rect.x + rect.width, rect.y],
                [rect.x + rect.width, rect.y + rect.height],
                [rect.x, rect.y + rect.height]
            ];
            ctx.fillStyle = ProteusColors.SELECTED;
            for (let c = 0; c < corners.length; c++) {
                ctx.fillRect(corners[c][0] - hs, corners[c][1] - hs, hs * 2, hs * 2);
            }
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1 / zoom;
            for (let c = 0; c < corners.length; c++) {
                ctx.strokeRect(corners[c][0] - hs, corners[c][1] - hs, hs * 2, hs * 2);
            }
        }
        // 多选：外层虚线包围盒
        if (selectedCount > 1 && Number.isFinite(groupMinX)) {
            const pad = 6 / zoom;
            const gx = groupMinX - pad;
            const gy = groupMinY - pad;
            const gw = groupMaxX - groupMinX + pad * 2;
            const gh = groupMaxY - groupMinY + pad * 2;
            ctx.strokeStyle = ProteusColors.SELECTED;
            ctx.lineWidth = 1.5 / zoom;
            ctx.setLineDash([8 / zoom, 5 / zoom]);
            ctx.strokeRect(gx, gy, gw, gh);
            ctx.setLineDash([]);
            ctx.fillStyle = ProteusColors.SELECTED;
            ctx.font = `bold ${Math.max(11 / zoom, 9)}px sans-serif`;
            ctx.textAlign = 'left';
            ctx.fillText(`${selectedCount} 个已选`, gx, gy - 4 / zoom);
            ctx.textAlign = 'start';
        }
    }
    private drawCornerBrackets(ctx: CanvasRenderingContext2D, rect: Rect2D, color: string, lineWidth: number, arm: number): void {
        const x1 = rect.x;
        const y1 = rect.y;
        const x2 = rect.x + rect.width;
        const y2 = rect.y + rect.height;
        const a = Math.min(arm, Math.min(rect.width, rect.height) * 0.35);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.setLineDash([]);
        ctx.beginPath();
        // TL
        ctx.moveTo(x1, y1 + a);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x1 + a, y1);
        // TR
        ctx.moveTo(x2 - a, y1);
        ctx.lineTo(x2, y1);
        ctx.lineTo(x2, y1 + a);
        // BR
        ctx.moveTo(x2, y2 - a);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x2 - a, y2);
        // BL
        ctx.moveTo(x1 + a, y2);
        ctx.lineTo(x1, y2);
        ctx.lineTo(x1, y2 - a);
        ctx.stroke();
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
    private parseLedThreshNumber(comp: ComponentInstance, def: ComponentDefinition, key: string, fallback: number): number {
        let raw = comp.parameters.get(key);
        if (raw === undefined || raw.length === 0) {
            raw = def.defaultParams.get(key);
        }
        if (raw === undefined || raw.length === 0) {
            return fallback;
        }
        const cleaned = raw.trim().replace(/[VvMmAa]/g, '');
        const n = parseFloat(cleaned);
        return Number.isFinite(n) ? n : fallback;
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
        const litVf = this.parseLedThreshNumber(comp, def, 'litVf', 1.2);
        const litVkMax = this.parseLedThreshNumber(comp, def, 'litVkMax', 0.9);
        const litI = this.parseLedThreshNumber(comp, def, 'litImA', 0.5) * 1e-3;
        const litVfAlt = this.parseLedThreshNumber(comp, def, 'litVfAlt', 1.0);
        const openVk = this.parseLedThreshNumber(comp, def, 'openVk', 2.5);
        if (vK >= openVk) {
            return false;
        }
        if (vK <= litVkMax && vf >= litVf) {
            return true;
        }
        return current >= litI && vf >= litVfAlt;
    }
    /**
     * Weak forward / sub-threshold conduction: enough to say「在导通方向」，
     * but below full-lit criteria — show dimmed nominal color.
     */
    private isLedWeakConducting(comp: ComponentInstance, def: ComponentDefinition): boolean {
        if (this.isLedConducting(comp, def)) {
            return false;
        }
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
        const openVk = this.parseLedThreshNumber(comp, def, 'openVk', 2.5);
        const dimVf = this.parseLedThreshNumber(comp, def, 'dimVf', 0.25);
        if (vK >= openVk) {
            return false;
        }
        if (vf >= dimVf) {
            return true;
        }
        return current >= 1e-5 && vf >= 0.15;
    }
    /** off | dim (导通未达亮) | lit */
    private resolveLedVisualLevel(comp: ComponentInstance, def: ComponentDefinition): string {
        if (!this.isLedWired(comp, def)) {
            return 'off';
        }
        const simState = this.appService.simulationKernel.getState();
        const simActive = simState === SimulationState.RUNNING || simState === SimulationState.PAUSED;
        if (!simActive) {
            return 'off';
        }
        if (this.isLedConducting(comp, def)) {
            return 'lit';
        }
        if (this.isLedWeakConducting(comp, def)) {
            return 'dim';
        }
        return 'off';
    }
    private drawLitLedOverlays(ctx: CanvasRenderingContext2D, doc: SchematicDocument): void {
        const editor = this.appService.schematicEditor as SchematicEditorImpl;
        if (!editor.isLayerVisible(SchematicLayerId.COMPONENTS)) {
            return;
        }
        for (let i = 0; i < doc.components.length; i++) {
            const comp = doc.components[i];
            if (this.isDragId(comp.id)) {
                continue;
            }
            const def = this.getCachedCompDef(comp.libraryId);
            if (def === null || !this.isLedComponent(comp, def)) {
                continue;
            }
            const level = this.resolveLedVisualLevel(comp, def);
            if (level === 'off') {
                continue;
            }
            const ledColor = this.resolveLedNominalColor(comp, def);
            if (ledColor.length === 0) {
                continue;
            }
            const style: SymbolDrawStyle = {
                strokeColor: ProteusColors.COMPONENT_STROKE,
                fillColor: ProteusColors.COMPONENT_BODY_FILL,
                lineWidth: 1.2,
                selected: false,
                hovered: false,
                ledDisplayColor: ledColor,
                ledDimmed: level === 'dim'
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
            if (this.isDragId(comp.id)) {
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
        ctx.lineWidth = selected ? 2.8 : 1.2;
        ctx.fillStyle = ProteusColors.COMPONENT_BODY_FILL;
        ctx.fillRect(cx - 30, cy - 20, 60, 40);
        ctx.strokeRect(cx - 30, cy - 20, 60, 40);
        if (selected) {
            ctx.fillStyle = 'rgba(0, 102, 204, 0.16)';
            ctx.fillRect(cx - 34, cy - 24, 68, 48);
            ctx.strokeStyle = ProteusColors.SELECTED;
            ctx.lineWidth = 2.4;
            ctx.strokeRect(cx - 34, cy - 24, 68, 48);
        }
        else if (_hovered) {
            ctx.fillStyle = 'rgba(0, 170, 255, 0.12)';
            ctx.fillRect(cx - 36, cy - 26, 72, 52);
            ctx.strokeStyle = ProteusColors.HOVER_PREVIEW;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 3]);
            ctx.strokeRect(cx - 36, cy - 26, 72, 52);
            ctx.setLineDash([]);
        }
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
        const selectedWireIds = editor.getSelectedWireIds();
        const selectedWireSet = new Set<string>();
        for (let si = 0; si < selectedWireIds.length; si++) {
            selectedWireSet.add(selectedWireIds[si]);
        }
        // Check if simulation is active (running or paused) for live voltage coloring
        const simState = this.appService.simulationKernel.getState();
        const simActive = simState === SimulationState.RUNNING || simState === SimulationState.PAUSED;
        const nodeVoltages = simActive ? this.getSimNodeVoltages() : new Map<string, number>();
        // If dragging components, compute drag offset for wire endpoints connected to their pins
        let dragDx = 0;
        let dragDy = 0;
        let dragPinPositions: Point2D[] = [];
        let multiDragActive = false;
        if (this.dragIds.length > 0 && this.dragPreviewPos !== null) {
            multiDragActive = true;
            const d = this.getDragDelta();
            dragDx = d.x;
            dragDy = d.y;
            const doc = this.appService.schematicEditor.getDocument();
            for (let i = 0; i < doc.components.length; i++) {
                const dragComp = doc.components[i];
                if (!this.isDragId(dragComp.id)) {
                    continue;
                }
                const def = this.getCachedCompDef(dragComp.libraryId);
                if (def === null) {
                    continue;
                }
                for (let j = 0; j < def.pins.length; j++) {
                    const pin = def.pins[j];
                    const local = this.transformPinOffset(pin.position, dragComp.rotation, dragComp.mirrored);
                    dragPinPositions.push({ x: dragComp.position.x + local.x, y: dragComp.position.y + local.y });
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
                if (multiDragActive && dragPinPositions.length > 0) {
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
            if (multiDragActive) {
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
            if (drawPts.length === 3 && multiDragActive && (shiftMask[0] || shiftMask[2])) {
                drawPts[1] = this.smartMidpoint(drawPts[0], drawPts[2], this.dragComponentId);
            }
            const wireSelected = selectedWireSet.has(wire.id);
            const wireHovered = wire.id === this.hoverWireNetId && !wireSelected;
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
        // Only count co-located vertices / T-hits among wires that share a netId
        // (avoids false dots where VCC and GND cross visually but are not joined).
        const counts = new Map<string, number>();
        for (let i = 0; i < wires.length; i++) {
            const w = wires[i];
            if (w.netId.length === 0) {
                continue;
            }
            for (let j = 0; j < w.points.length; j++) {
                const p = w.points[j];
                const key = `${Math.round(p.x)},${Math.round(p.y)}|${w.netId}`;
                counts.set(key, (counts.get(key) ?? 0) + 1);
            }
        }
        for (let i = 0; i < wires.length; i++) {
            const wA = wires[i];
            if (wA.points.length < 2 || wA.netId.length === 0) {
                continue;
            }
            for (let j = 0; j < wires.length; j++) {
                if (i === j) {
                    continue;
                }
                const wB = wires[j];
                if (wB.netId !== wA.netId) {
                    continue;
                }
                for (let v = 0; v < wB.points.length; v++) {
                    const pt = wB.points[v];
                    for (let s = 0; s < wA.points.length - 1; s++) {
                        const a = wA.points[s];
                        const b = wA.points[s + 1];
                        const key = `${Math.round(pt.x)},${Math.round(pt.y)}|${wA.netId}`;
                        if ((counts.get(key) ?? 0) >= 2) {
                            continue;
                        }
                        if (this.pointOnSegment(pt, a, b)) {
                            counts.set(key, (counts.get(key) ?? 0) + 2);
                        }
                    }
                }
            }
        }
        // Flatten to xy-only keys for rendering (same physical point, same net)
        const renderCounts = new Map<string, number>();
        counts.forEach((count: number, key: string) => {
            const xy = key.split('|')[0];
            const prev = renderCounts.get(xy) ?? 0;
            if (count > prev) {
                renderCounts.set(xy, count);
            }
        });
        this.juncCache = renderCounts;
        this.juncCacheKey = cacheKey;
        this.renderJuncPoints(ctx, renderCounts);
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
     * Uses the same tolerance as connectWireEndpoints so visual matches topology.
     */
    private drawWireConnectionMarkers(ctx: CanvasRenderingContext2D): void {
        const doc = this.appService.schematicEditor.getDocument();
        if (doc.wires.length === 0) {
            return;
        }
        const gridSize = doc.metadata.gridSize || 10;
        const threshold = Math.max(gridSize * 2.5, 20);
        const pinWorlds: Point2D[] = [];
        for (let ci = 0; ci < doc.components.length; ci++) {
            const comp = doc.components[ci];
            const def = this.getCachedCompDef(comp.libraryId);
            if (def === null) {
                continue;
            }
            for (let pi = 0; pi < def.pins.length; pi++) {
                const pin = def.pins[pi];
                const local = this.transformPinOffset(pin.position, comp.rotation, comp.mirrored);
                pinWorlds.push({ x: comp.position.x + local.x, y: comp.position.y + local.y });
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
                let hit = false;
                for (let pi = 0; pi < pinWorlds.length; pi++) {
                    const dx = Math.abs(ep.x - pinWorlds[pi].x);
                    const dy = Math.abs(ep.y - pinWorlds[pi].y);
                    if (dx <= threshold && dy <= threshold) {
                        hit = true;
                        break;
                    }
                }
                if (!hit) {
                    continue;
                }
                const key = `${Math.round(ep.x)},${Math.round(ep.y)}`;
                if (drawn.has(key)) {
                    continue;
                }
                drawn.add(key);
                ctx.beginPath();
                ctx.arc(ep.x, ep.y, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    /** Open circle on wire tips that are neither on a pin nor a same-net junction. */
    private drawDanglingWireEnds(ctx: CanvasRenderingContext2D): void {
        const doc = this.appService.schematicEditor.getDocument();
        if (doc.wires.length === 0) {
            return;
        }
        const gridSize = doc.metadata.gridSize || 10;
        const pinTol = Math.max(gridSize * 2.5, 20);
        const juncTol = 4;
        const pinWorlds: Point2D[] = [];
        for (let ci = 0; ci < doc.components.length; ci++) {
            const comp = doc.components[ci];
            const def = this.getCachedCompDef(comp.libraryId);
            if (def === null) {
                continue;
            }
            for (let pi = 0; pi < def.pins.length; pi++) {
                const pin = def.pins[pi];
                const local = this.transformPinOffset(pin.position, comp.rotation, comp.mirrored);
                pinWorlds.push({ x: comp.position.x + local.x, y: comp.position.y + local.y });
            }
        }
        ctx.strokeStyle = 'rgba(220, 80, 60, 0.85)';
        ctx.lineWidth = 1.2;
        for (let wi = 0; wi < doc.wires.length; wi++) {
            const wire = doc.wires[wi];
            if (wire.points.length < 2) {
                continue;
            }
            const endpoints = [wire.points[0], wire.points[wire.points.length - 1]];
            for (let ei = 0; ei < endpoints.length; ei++) {
                const ep = endpoints[ei];
                let onPin = false;
                for (let pi = 0; pi < pinWorlds.length; pi++) {
                    if (Math.abs(ep.x - pinWorlds[pi].x) <= pinTol &&
                        Math.abs(ep.y - pinWorlds[pi].y) <= pinTol) {
                        onPin = true;
                        break;
                    }
                }
                if (onPin) {
                    continue;
                }
                let onJunction = false;
                for (let wj = 0; wj < doc.wires.length; wj++) {
                    if (wj === wi) {
                        continue;
                    }
                    const other = doc.wires[wj];
                    if (other.netId.length === 0 || other.netId !== wire.netId) {
                        continue;
                    }
                    for (let pj = 0; pj < other.points.length; pj++) {
                        const op = other.points[pj];
                        if (Math.abs(ep.x - op.x) <= juncTol && Math.abs(ep.y - op.y) <= juncTol) {
                            onJunction = true;
                            break;
                        }
                    }
                    if (!onJunction && other.points.length >= 2) {
                        for (let s = 0; s < other.points.length - 1; s++) {
                            if (this.pointOnSegment(ep, other.points[s], other.points[s + 1], juncTol)) {
                                onJunction = true;
                                break;
                            }
                        }
                    }
                    if (onJunction) {
                        break;
                    }
                }
                if (onJunction) {
                    continue;
                }
                ctx.beginPath();
                ctx.arc(ep.x, ep.y, 3.5, 0, Math.PI * 2);
                ctx.stroke();
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
            const focused = label.id === this.lastLabelTapId;
            // Draw by text semantics (AI stubs often have global=false)
            if (isPowerSupplyLabelText(label.text)) {
                this.drawPowerSymbol(ctx, x, y, label.text);
                if (focused) {
                    this.drawNetLabelFocusRing(ctx, x, y - 12, 14);
                }
            }
            else if (isGroundLabelText(label.text)) {
                this.drawGroundSymbol(ctx, x, y);
                if (focused) {
                    this.drawNetLabelFocusRing(ctx, x, y + 10, 14);
                }
            }
            else {
                const expandLeft = this.inferSignalLabelExpandLeft(doc, x, y);
                this.drawSignalNetLabel(ctx, x, y, label.text, focused, expandLeft);
            }
        }
    }
    /** 导线从右侧接入锚点 → 旗标向左展开，避免盖住连接线 */
    private inferSignalLabelExpandLeft(doc: SchematicDocument, x: number, y: number): boolean {
        const wires = doc.wires ?? [];
        const paths: Point2D[][] = [];
        for (let i = 0; i < wires.length; i++) {
            const pts = wires[i].points;
            if (pts && pts.length >= 2) {
                paths.push(pts);
            }
        }
        return DeviceHitGeometry.inferSignalLabelExpandLeft({ x: x, y: y }, paths);
    }
    /** Proteus 风格信号网络标号：锚点 + 旗标框 + 文本 */
    private drawSignalNetLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, focused: boolean, expandLeft: boolean = false): void {
        const fontPx = ProteusFonts.CANVAS_LABEL;
        ctx.font = `${fontPx}px sans-serif`;
        const tw = Math.max(ctx.measureText(text).width, 12);
        const padX = 4;
        const boxH = fontPx + 4;
        const stubLen = 6;
        const boxW = tw + padX * 2;
        const boxX = expandLeft ? (x - stubLen - boxW) : (x + stubLen);
        const boxY = y - boxH / 2;
        const color = focused ? ProteusColors.SELECTED : ProteusColors.WIRE;
        const stubEndX = expandLeft ? (x - stubLen) : (x + stubLen);
        // Anchor stub from connection point into flag
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = focused ? 1.6 : 1.2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(stubEndX, y);
        ctx.stroke();
        // Connection dot
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        // Flag body (rect + notch toward anchor)
        ctx.beginPath();
        if (expandLeft) {
            ctx.moveTo(boxX + boxW, boxY);
            ctx.lineTo(boxX, boxY);
            ctx.lineTo(boxX, boxY + boxH);
            ctx.lineTo(boxX + boxW, boxY + boxH);
            ctx.lineTo(boxX + boxW - 3, y);
        }
        else {
            ctx.moveTo(boxX, boxY);
            ctx.lineTo(boxX + boxW, boxY);
            ctx.lineTo(boxX + boxW, boxY + boxH);
            ctx.lineTo(boxX, boxY + boxH);
            ctx.lineTo(boxX + 3, y);
        }
        ctx.closePath();
        ctx.fillStyle = ProteusColors.CANVAS_BG;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.stroke();
        // Text
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, boxX + padX + 2, y);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }
    private drawNetLabelFocusRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
        ctx.strokeStyle = ProteusColors.SELECTED;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    private drawPowerSymbol(ctx: CanvasRenderingContext2D, x: number, y: number, text: string): void {
        ctx.strokeStyle = ProteusColors.POWER;
        ctx.fillStyle = ProteusColors.POWER;
        ctx.lineWidth = 1.4;
        // Match component VCC glyph: pin at (x,y), arrow pointing up
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - 18);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y - 24);
        ctx.lineTo(x - 5, y - 16);
        ctx.lineTo(x + 5, y - 16);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x - 5, y);
        ctx.lineTo(x + 5, y);
        ctx.stroke();
        ctx.font = `${ProteusFonts.CANVAS_LABEL - 1}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(text, x, y - 28);
        ctx.textAlign = 'start';
    }
    private drawGroundSymbol(ctx: CanvasRenderingContext2D, x: number, y: number): void {
        ctx.strokeStyle = ProteusColors.GROUND;
        ctx.fillStyle = ProteusColors.GROUND;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 14);
        ctx.stroke();
        const bars = [12, 8, 4];
        for (let l = 0; l < bars.length; l++) {
            const ly = y + 15 + l * 4;
            const hw = bars[l] / 2;
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
