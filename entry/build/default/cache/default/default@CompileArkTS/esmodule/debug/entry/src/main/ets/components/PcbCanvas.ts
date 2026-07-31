if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface PcbCanvas_Params {
    themeRev?: number;
    canvasVersion?: number;
    selectedFootprintId?: string;
    selectedTrackId?: string;
    selectedViaId?: string;
    selectedZoneId?: string;
    mouseX?: number;
    mouseY?: number;
    worldMouseX?: number;
    worldMouseY?: number;
    zoomPercent?: number;
    toolMode?: PcbToolMode;
    routeResetKey?: number;
    gridVisible?: boolean;
    onStatusChange?: (msg: string) => void;
    onDocumentChanged?: () => void;
    onSelectionCleared?: () => void;
    onActiveLayerChange?: (layer: PcbLayerId) => void;
    onHoverNetChange?: (netName: string) => void;
    onToolModeRequest?: (mode: PcbToolMode) => void;
    settings?: RenderingContextSettings;
    context?: CanvasRenderingContext2D;
    appService?: AppService;
    pointerDown?: boolean;
    dragLastWorld?: Point2D;
    dragStartWorld?: Point2D;
    dragStartScreen?: Point2D;
    panning?: boolean;
    panLastX?: number;
    panLastY?: number;
    orbiting3d?: boolean;
    orbitLastX?: number;
    orbitLastY?: number;
    orbitLogAccYaw?: number;
    orbitLogAccPitch?: number;
    orbitLogLastMs?: number;
    last3dClickMs?: number;
    orbitMoved3d?: boolean;
    orbitDownX?: number;
    orbitDownY?: number;
    measure3dPts?: Point2D[];
    viewWidth?: number;
    viewHeight?: number;
    redrawScheduled?: boolean;
    isTouchActive?: boolean;
    lastTouchX?: number;
    lastTouchY?: number;
    draggingItems?: boolean;
    selectingRect?: boolean;
    selectRectStart?: Point2D;
    selectRectCurrent?: Point2D;
    pinchStartZoom?: number;
    modifierKeys?: number;
    pinchCenterX?: number;
    pinchCenterY?: number;
    lastSnapPoint?: Point2D | null;
    lastPolyClickMs?: number;
    lastPolyClickWorld?: Point2D | null;
    onPcbChanged?;
    onViewportChanged?;
}
import { AppService } from "@bundle:com.elecdraw.aischsim/entry/ets/services/AppService";
import { PcbLayerId, EventBus, ModuleEvent, PcbPadType, PcbPadShape, padWorldPosition, PcbAppearanceMode, routeByCornerMode, isCopperLayer, PcbViaKind, sumTrackLengthForNet, matchDiffPairLengths, tracePcb3d, tracePcbOp, Pcb3dDisplayMode, tracePcbView2dAudit, tracePcbView3dAudit, buildTrackPolylines } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { PcbDocument, PcbFootprintInst, PcbTrack, ModuleEventPayload, Point2D, PcbAppearance, PcbTrackPolyline } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { PcbToolMode } from "@bundle:com.elecdraw.aischsim/entry@pcb_editor/Index";
import type { PcbEditorImpl } from "@bundle:com.elecdraw.aischsim/entry@pcb_editor/Index";
import { PcbColors, ProteusColors } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import { PROTEUS_THEME_REV_KEY } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ThemeManager";
import { getGlobalPcbFootprintLibrary } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { Pcb3dRenderer } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/Pcb3dRenderer";
import { boardCenter, unprojectBoardOrtho, milToMm, dist3 } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/Pcb3dSceneUtil";
interface PcbScreenRect {
    x: number;
    y: number;
    w: number;
    h: number;
}
export class PcbCanvas extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__canvasVersion = new SynchedPropertySimpleTwoWayPU(params.canvasVersion, this, "canvasVersion");
        this.__selectedFootprintId = new SynchedPropertySimpleTwoWayPU(params.selectedFootprintId, this, "selectedFootprintId");
        this.__selectedTrackId = new SynchedPropertySimpleTwoWayPU(params.selectedTrackId, this, "selectedTrackId");
        this.__selectedViaId = new SynchedPropertySimpleTwoWayPU(params.selectedViaId, this, "selectedViaId");
        this.__selectedZoneId = new SynchedPropertySimpleTwoWayPU(params.selectedZoneId, this, "selectedZoneId");
        this.__mouseX = new SynchedPropertySimpleTwoWayPU(params.mouseX, this, "mouseX");
        this.__mouseY = new SynchedPropertySimpleTwoWayPU(params.mouseY, this, "mouseY");
        this.__worldMouseX = new SynchedPropertySimpleTwoWayPU(params.worldMouseX, this, "worldMouseX");
        this.__worldMouseY = new SynchedPropertySimpleTwoWayPU(params.worldMouseY, this, "worldMouseY");
        this.__zoomPercent = new SynchedPropertySimpleTwoWayPU(params.zoomPercent, this, "zoomPercent");
        this.__toolMode = new SynchedPropertySimpleTwoWayPU(params.toolMode, this, "toolMode");
        this.__routeResetKey = new SynchedPropertySimpleOneWayPU(params.routeResetKey, this, "routeResetKey");
        this.__gridVisible = new SynchedPropertySimpleOneWayPU(params.gridVisible, this, "gridVisible");
        this.onStatusChange = () => { };
        this.onDocumentChanged = () => { };
        this.onSelectionCleared = () => { };
        this.onActiveLayerChange = (_l: PcbLayerId) => { };
        this.onHoverNetChange = (_n: string) => { };
        this.onToolModeRequest = (_m: PcbToolMode) => { };
        this.settings = new RenderingContextSettings(true);
        this.context = new CanvasRenderingContext2D(this.settings);
        this.appService = AppService.getInstance();
        this.pointerDown = false;
        this.dragLastWorld = { x: 0, y: 0 };
        this.dragStartWorld = { x: 0, y: 0 };
        this.dragStartScreen = { x: 0, y: 0 };
        this.panning = false;
        this.panLastX = 0;
        this.panLastY = 0;
        this.orbiting3d = false;
        this.orbitLastX = 0;
        this.orbitLastY = 0;
        this.orbitLogAccYaw = 0;
        this.orbitLogAccPitch = 0;
        this.orbitLogLastMs = 0;
        this.last3dClickMs = 0;
        this.orbitMoved3d = false;
        this.orbitDownX = 0;
        this.orbitDownY = 0;
        this.measure3dPts = [];
        this.viewWidth = 0;
        this.viewHeight = 0;
        this.redrawScheduled = false;
        this.isTouchActive = false;
        this.lastTouchX = 0;
        this.lastTouchY = 0;
        this.draggingItems = false;
        this.selectingRect = false;
        this.selectRectStart = { x: 0, y: 0 };
        this.selectRectCurrent = { x: 0, y: 0 };
        this.pinchStartZoom = 0.15;
        this.modifierKeys = 0;
        this.pinchCenterX = 0;
        this.pinchCenterY = 0;
        this.lastSnapPoint = null;
        this.lastPolyClickMs = 0;
        this.lastPolyClickWorld = null;
        this.onPcbChanged = (_p: ModuleEventPayload): void => { this.scheduleRedraw(); };
        this.onViewportChanged = (_p: ModuleEventPayload): void => { this.scheduleRedraw(); };
        this.setInitiallyProvidedValue(params);
        this.declareWatch("themeRev", this.onThemeRevChange);
        this.declareWatch("canvasVersion", this.onCanvasVersionChange);
        this.declareWatch("routeResetKey", this.onRouteResetChange);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: PcbCanvas_Params) {
        if (params.routeResetKey === undefined) {
            this.__routeResetKey.set(0);
        }
        if (params.gridVisible === undefined) {
            this.__gridVisible.set(true);
        }
        if (params.onStatusChange !== undefined) {
            this.onStatusChange = params.onStatusChange;
        }
        if (params.onDocumentChanged !== undefined) {
            this.onDocumentChanged = params.onDocumentChanged;
        }
        if (params.onSelectionCleared !== undefined) {
            this.onSelectionCleared = params.onSelectionCleared;
        }
        if (params.onActiveLayerChange !== undefined) {
            this.onActiveLayerChange = params.onActiveLayerChange;
        }
        if (params.onHoverNetChange !== undefined) {
            this.onHoverNetChange = params.onHoverNetChange;
        }
        if (params.onToolModeRequest !== undefined) {
            this.onToolModeRequest = params.onToolModeRequest;
        }
        if (params.settings !== undefined) {
            this.settings = params.settings;
        }
        if (params.context !== undefined) {
            this.context = params.context;
        }
        if (params.appService !== undefined) {
            this.appService = params.appService;
        }
        if (params.pointerDown !== undefined) {
            this.pointerDown = params.pointerDown;
        }
        if (params.dragLastWorld !== undefined) {
            this.dragLastWorld = params.dragLastWorld;
        }
        if (params.dragStartWorld !== undefined) {
            this.dragStartWorld = params.dragStartWorld;
        }
        if (params.dragStartScreen !== undefined) {
            this.dragStartScreen = params.dragStartScreen;
        }
        if (params.panning !== undefined) {
            this.panning = params.panning;
        }
        if (params.panLastX !== undefined) {
            this.panLastX = params.panLastX;
        }
        if (params.panLastY !== undefined) {
            this.panLastY = params.panLastY;
        }
        if (params.orbiting3d !== undefined) {
            this.orbiting3d = params.orbiting3d;
        }
        if (params.orbitLastX !== undefined) {
            this.orbitLastX = params.orbitLastX;
        }
        if (params.orbitLastY !== undefined) {
            this.orbitLastY = params.orbitLastY;
        }
        if (params.orbitLogAccYaw !== undefined) {
            this.orbitLogAccYaw = params.orbitLogAccYaw;
        }
        if (params.orbitLogAccPitch !== undefined) {
            this.orbitLogAccPitch = params.orbitLogAccPitch;
        }
        if (params.orbitLogLastMs !== undefined) {
            this.orbitLogLastMs = params.orbitLogLastMs;
        }
        if (params.last3dClickMs !== undefined) {
            this.last3dClickMs = params.last3dClickMs;
        }
        if (params.orbitMoved3d !== undefined) {
            this.orbitMoved3d = params.orbitMoved3d;
        }
        if (params.orbitDownX !== undefined) {
            this.orbitDownX = params.orbitDownX;
        }
        if (params.orbitDownY !== undefined) {
            this.orbitDownY = params.orbitDownY;
        }
        if (params.measure3dPts !== undefined) {
            this.measure3dPts = params.measure3dPts;
        }
        if (params.viewWidth !== undefined) {
            this.viewWidth = params.viewWidth;
        }
        if (params.viewHeight !== undefined) {
            this.viewHeight = params.viewHeight;
        }
        if (params.redrawScheduled !== undefined) {
            this.redrawScheduled = params.redrawScheduled;
        }
        if (params.isTouchActive !== undefined) {
            this.isTouchActive = params.isTouchActive;
        }
        if (params.lastTouchX !== undefined) {
            this.lastTouchX = params.lastTouchX;
        }
        if (params.lastTouchY !== undefined) {
            this.lastTouchY = params.lastTouchY;
        }
        if (params.draggingItems !== undefined) {
            this.draggingItems = params.draggingItems;
        }
        if (params.selectingRect !== undefined) {
            this.selectingRect = params.selectingRect;
        }
        if (params.selectRectStart !== undefined) {
            this.selectRectStart = params.selectRectStart;
        }
        if (params.selectRectCurrent !== undefined) {
            this.selectRectCurrent = params.selectRectCurrent;
        }
        if (params.pinchStartZoom !== undefined) {
            this.pinchStartZoom = params.pinchStartZoom;
        }
        if (params.modifierKeys !== undefined) {
            this.modifierKeys = params.modifierKeys;
        }
        if (params.pinchCenterX !== undefined) {
            this.pinchCenterX = params.pinchCenterX;
        }
        if (params.pinchCenterY !== undefined) {
            this.pinchCenterY = params.pinchCenterY;
        }
        if (params.lastSnapPoint !== undefined) {
            this.lastSnapPoint = params.lastSnapPoint;
        }
        if (params.lastPolyClickMs !== undefined) {
            this.lastPolyClickMs = params.lastPolyClickMs;
        }
        if (params.lastPolyClickWorld !== undefined) {
            this.lastPolyClickWorld = params.lastPolyClickWorld;
        }
        if (params.onPcbChanged !== undefined) {
            this.onPcbChanged = params.onPcbChanged;
        }
        if (params.onViewportChanged !== undefined) {
            this.onViewportChanged = params.onViewportChanged;
        }
    }
    updateStateVars(params: PcbCanvas_Params) {
        this.__routeResetKey.reset(params.routeResetKey);
        this.__gridVisible.reset(params.gridVisible);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__canvasVersion.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedFootprintId.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedTrackId.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedViaId.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedZoneId.purgeDependencyOnElmtId(rmElmtId);
        this.__mouseX.purgeDependencyOnElmtId(rmElmtId);
        this.__mouseY.purgeDependencyOnElmtId(rmElmtId);
        this.__worldMouseX.purgeDependencyOnElmtId(rmElmtId);
        this.__worldMouseY.purgeDependencyOnElmtId(rmElmtId);
        this.__zoomPercent.purgeDependencyOnElmtId(rmElmtId);
        this.__toolMode.purgeDependencyOnElmtId(rmElmtId);
        this.__routeResetKey.purgeDependencyOnElmtId(rmElmtId);
        this.__gridVisible.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__canvasVersion.aboutToBeDeleted();
        this.__selectedFootprintId.aboutToBeDeleted();
        this.__selectedTrackId.aboutToBeDeleted();
        this.__selectedViaId.aboutToBeDeleted();
        this.__selectedZoneId.aboutToBeDeleted();
        this.__mouseX.aboutToBeDeleted();
        this.__mouseY.aboutToBeDeleted();
        this.__worldMouseX.aboutToBeDeleted();
        this.__worldMouseY.aboutToBeDeleted();
        this.__zoomPercent.aboutToBeDeleted();
        this.__toolMode.aboutToBeDeleted();
        this.__routeResetKey.aboutToBeDeleted();
        this.__gridVisible.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __themeRev: ObservedPropertyAbstractPU<number>;
    get themeRev() {
        return this.__themeRev.get();
    }
    set themeRev(newValue: number) {
        this.__themeRev.set(newValue);
    }
    private __canvasVersion: SynchedPropertySimpleTwoWayPU<number>;
    get canvasVersion() {
        return this.__canvasVersion.get();
    }
    set canvasVersion(newValue: number) {
        this.__canvasVersion.set(newValue);
    }
    private __selectedFootprintId: SynchedPropertySimpleTwoWayPU<string>;
    get selectedFootprintId() {
        return this.__selectedFootprintId.get();
    }
    set selectedFootprintId(newValue: string) {
        this.__selectedFootprintId.set(newValue);
    }
    private __selectedTrackId: SynchedPropertySimpleTwoWayPU<string>;
    get selectedTrackId() {
        return this.__selectedTrackId.get();
    }
    set selectedTrackId(newValue: string) {
        this.__selectedTrackId.set(newValue);
    }
    private __selectedViaId: SynchedPropertySimpleTwoWayPU<string>;
    get selectedViaId() {
        return this.__selectedViaId.get();
    }
    set selectedViaId(newValue: string) {
        this.__selectedViaId.set(newValue);
    }
    private __selectedZoneId: SynchedPropertySimpleTwoWayPU<string>;
    get selectedZoneId() {
        return this.__selectedZoneId.get();
    }
    set selectedZoneId(newValue: string) {
        this.__selectedZoneId.set(newValue);
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
    private __worldMouseX: SynchedPropertySimpleTwoWayPU<number>;
    get worldMouseX() {
        return this.__worldMouseX.get();
    }
    set worldMouseX(newValue: number) {
        this.__worldMouseX.set(newValue);
    }
    private __worldMouseY: SynchedPropertySimpleTwoWayPU<number>;
    get worldMouseY() {
        return this.__worldMouseY.get();
    }
    set worldMouseY(newValue: number) {
        this.__worldMouseY.set(newValue);
    }
    private __zoomPercent: SynchedPropertySimpleTwoWayPU<number>;
    get zoomPercent() {
        return this.__zoomPercent.get();
    }
    set zoomPercent(newValue: number) {
        this.__zoomPercent.set(newValue);
    }
    private __toolMode: SynchedPropertySimpleTwoWayPU<PcbToolMode>;
    get toolMode() {
        return this.__toolMode.get();
    }
    set toolMode(newValue: PcbToolMode) {
        this.__toolMode.set(newValue);
    }
    private __routeResetKey: SynchedPropertySimpleOneWayPU<number>;
    get routeResetKey() {
        return this.__routeResetKey.get();
    }
    set routeResetKey(newValue: number) {
        this.__routeResetKey.set(newValue);
    }
    private __gridVisible: SynchedPropertySimpleOneWayPU<boolean>;
    get gridVisible() {
        return this.__gridVisible.get();
    }
    set gridVisible(newValue: boolean) {
        this.__gridVisible.set(newValue);
    }
    private onStatusChange: (msg: string) => void;
    private onDocumentChanged: () => void;
    private onSelectionCleared: () => void;
    private onActiveLayerChange: (layer: PcbLayerId) => void;
    private onHoverNetChange: (netName: string) => void;
    private onToolModeRequest: (mode: PcbToolMode) => void;
    private settings: RenderingContextSettings;
    private context: CanvasRenderingContext2D;
    private appService: AppService;
    private pointerDown: boolean;
    private dragLastWorld: Point2D;
    private dragStartWorld: Point2D;
    private dragStartScreen: Point2D;
    private panning: boolean;
    private panLastX: number;
    private panLastY: number;
    /** 3D 轨道旋转拖拽中 */
    private orbiting3d: boolean;
    private orbitLastX: number;
    private orbitLastY: number;
    private orbitLogAccYaw: number;
    private orbitLogAccPitch: number;
    private orbitLogLastMs: number;
    private last3dClickMs: number;
    /** 3D 本次拖拽是否产生有效旋转（用于区分单击选中） */
    private orbitMoved3d: boolean;
    private orbitDownX: number;
    private orbitDownY: number;
    /** 3D 测量点（板面世界坐标） */
    private measure3dPts: Point2D[];
    private viewWidth: number;
    private viewHeight: number;
    private redrawScheduled: boolean;
    private isTouchActive: boolean;
    /** 最近一次有效触点（Touch Up 时 touches 可能为空） */
    private lastTouchX: number;
    private lastTouchY: number;
    private draggingItems: boolean;
    private selectingRect: boolean;
    private selectRectStart: Point2D;
    private selectRectCurrent: Point2D;
    private pinchStartZoom: number;
    /** bit0=Ctrl, bit1=Shift */
    private modifierKeys: number;
    private pinchCenterX: number;
    private pinchCenterY: number;
    private lastSnapPoint: Point2D | null;
    private lastPolyClickMs: number;
    private lastPolyClickWorld: Point2D | null;
    aboutToAppear(): void {
        EventBus.getInstance().subscribe(ModuleEvent.PCB_CHANGED, this.onPcbChanged);
        EventBus.getInstance().subscribe(ModuleEvent.VIEWPORT_CHANGED, this.onViewportChanged);
        setTimeout(() => this.scheduleRedraw(), 120);
    }
    aboutToDisappear(): void {
        EventBus.getInstance().unsubscribe(ModuleEvent.PCB_CHANGED, this.onPcbChanged);
        EventBus.getInstance().unsubscribe(ModuleEvent.VIEWPORT_CHANGED, this.onViewportChanged);
    }
    private onPcbChanged;
    private onViewportChanged;
    onCanvasVersionChange(): void { this.scheduleRedraw(); }
    onThemeRevChange(): void { this.scheduleRedraw(); }
    onRouteResetChange(): void {
        this.getEditor().cancelRoute();
        this.scheduleRedraw();
    }
    private getEditor(): PcbEditorImpl {
        return this.appService.pcbEditor as PcbEditorImpl;
    }
    private scheduleRedraw(): void {
        if (this.redrawScheduled)
            return;
        this.redrawScheduled = true;
        setTimeout(() => {
            this.redrawScheduled = false;
            this.drawAll();
        }, 16);
    }
    private drawAll(): void {
        const ctx = this.context;
        const editor = this.getEditor();
        const doc = editor.getDocument();
        const vp = editor.getViewport();
        ctx.clearRect(0, 0, this.viewWidth, this.viewHeight);
        ctx.fillStyle = PcbColors.CANVAS_BG;
        ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);
        if (!doc) {
            ctx.fillStyle = ProteusColors.TEXT_SECONDARY;
            ctx.font = '14px sans-serif';
            ctx.fillText('无 PCB 文档 — 使用「更新 PCB」从原理图导入', 40, 60);
            return;
        }
        const appearance = editor.getAppearance();
        if (appearance.show3d) {
            this.drawSimple3d(ctx, doc, vp);
            this.emitView3dInstrTrace(doc, false);
            return;
        }
        // 工业层序：栅格 → 基板 → 浅透敷铜 → 阻焊 → 走线/过孔/焊盘 → 丝印 → Edge.Cuts
        if (this.gridVisible && vp.gridVisible) {
            this.drawGrid(ctx, vp);
        }
        this.drawSubstrate(ctx, doc, vp);
        if (!appearance.hideZones) {
            this.drawZones(ctx, doc, vp);
        }
        this.drawMaskAndPasteLayers(ctx, doc, vp);
        this.drawTracks(ctx, doc, vp);
        this.drawVias(ctx, doc, vp);
        this.drawFootprints(ctx, doc, vp, 'copper');
        this.drawFootprints(ctx, doc, vp, 'silk');
        this.drawBoardOutline(ctx, doc, vp);
        this.drawCourtyardLayer(ctx, doc, vp);
        this.drawDrcMarkers(ctx, vp);
        if (appearance.showRatsnest) {
            this.drawRatsnest(ctx, vp);
        }
        this.drawZonePolyPreview(ctx, vp);
        this.drawOutlinePreview(ctx, vp);
        this.drawMeasure(ctx, vp);
        const rs = editor.getRouteStart();
        const rp = editor.getRoutePreview();
        const ds = editor.getDiffRouteState();
        if (ds && editor.isDiffRouteActive()) {
            this.drawDiffPairPreview(ctx, vp, ds);
        }
        else if (rs && rp) {
            this.drawRoutePreview(ctx, vp, rs, rp);
        }
        if (this.selectingRect) {
            this.drawSelectionRect(ctx, vp);
        }
        if (this.lastSnapPoint) {
            const sp = this.worldToScreenPt(this.lastSnapPoint, vp);
            ctx.strokeStyle = PcbColors.SNAP;
            ctx.lineWidth = 1;
            const s = 6;
            ctx.beginPath();
            ctx.moveTo(sp.x - s, sp.y);
            ctx.lineTo(sp.x + s, sp.y);
            ctx.moveTo(sp.x, sp.y - s);
            ctx.lineTo(sp.x, sp.y + s);
            ctx.stroke();
        }
        this.emitView2dInstrTrace(doc, false);
    }
    /** 节流写入 instr_trace：2D 器件/走线位置与 UI 展示 */
    private emitView2dInstrTrace(doc: PcbDocument, force: boolean): void {
        const editor = this.getEditor();
        const vp = editor.getViewport();
        const ap = editor.getAppearance();
        const sel = editor.getSelection();
        const rats = editor.getRatsnest();
        const drc = editor.getLastDrcViolations();
        tracePcbView2dAudit(doc, {
            viewWidth: this.viewWidth,
            viewHeight: this.viewHeight,
            viewport: vp,
            appearance: ap,
            selection: sel,
            activeLayer: editor.getActiveLayer(),
            toolMode: `${this.toolMode}`,
            ratsnestCount: rats.length,
            drcCount: drc.length
        }, force ? 'force' : 'draw', force);
    }
    /** 节流写入 instr_trace：3D 相机/器件高度/干涉与展示参数 */
    private emitView3dInstrTrace(doc: PcbDocument, force: boolean): void {
        const editor = this.getEditor();
        const ap = editor.getAppearance();
        const sel = editor.getSelection();
        const vp = editor.getViewport();
        const mode = ap.view3dDisplayMode !== undefined
            ? ap.view3dDisplayMode : Pcb3dDisplayMode.REALISTIC;
        tracePcbView3dAudit(doc, {
            viewWidth: this.viewWidth,
            viewHeight: this.viewHeight,
            zoom: Math.max(vp.zoom, 0.05),
            panX: vp.panOffset.x,
            panY: vp.panOffset.y,
            yawDeg: ap.view3dYawDeg,
            pitchDeg: ap.view3dPitchDeg,
            ortho: ap.view3dOrtho !== false,
            displayMode: `${mode}`,
            usePbr: ap.view3dPbr === true && mode === Pcb3dDisplayMode.REALISTIC,
            msaa: ap.view3dMsaa >= 4 ? 4 : 1,
            cutFraction: ap.view3dCutFraction !== undefined ? ap.view3dCutFraction : 0.55,
            measure: ap.view3dMeasure === true,
            showInterference: ap.view3dShowInterference === true,
            highlightNetId: ap.highlightNetId,
            selectedFpIds: sel.footprintIds,
            selectedTrackIds: sel.trackIds,
            selectedViaIds: sel.viaIds,
            activeLayer: `${editor.getActiveLayer()}`,
            appearanceMode: `${ap.mode !== undefined ? ap.mode : PcbAppearanceMode.OVERLAY}`,
            hideZones: ap.hideZones === true,
            dimAlpha: ap.dimAlpha
        }, force ? 'force' : 'draw', force);
    }
    /** 板框内深绿阻焊（板外纯黑），对齐专业 EDA 成品板 2D 观感 */
    private drawSubstrate(ctx: CanvasRenderingContext2D, doc: PcbDocument, vp: import('common').ViewportState): void {
        const pts = doc.boardOutline.points;
        if (pts.length < 3)
            return;
        ctx.fillStyle = '#143D28';
        ctx.beginPath();
        const p0 = this.worldToScreenPt(pts[0], vp);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < pts.length; i++) {
            const p = this.worldToScreenPt(pts[i], vp);
            ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.fill();
    }
    /**
     * 点阵网格 — 对齐 KiCad/EasyEDA（非实线）。
     * 必须按屏幕间距做 LOD：默认 zoom=0.15、grid=5 时全视口可达数百万点，
     * 会撑爆 Ace Canvas 指令队列并触发 THREAD_BLOCK_6S。
     */
    private drawGrid(ctx: CanvasRenderingContext2D, vp: import('common').ViewportState): void {
        const doc = this.getEditor().getDocument();
        const baseG = Math.max(1, doc?.metadata.gridSize ?? vp.gridSize ?? 5);
        const majorEvery = 10;
        // 屏幕上相邻点至少约 10px；过密时放大步进（×2），必要时只画主网格
        const minScreenStep = 10;
        let step = baseG;
        let majorMul = majorEvery;
        while (step * vp.zoom < minScreenStep && step < baseG * 1024) {
            step *= 2;
            majorMul = Math.max(1, Math.round(majorMul / 2));
        }
        // 仍过密（极小缩放）时跳过次网格，只保留主网格间距
        if (step * vp.zoom < minScreenStep * 0.55) {
            step = Math.max(step, baseG * majorEvery);
            majorMul = 1;
        }
        const topLeft = this.getEditor().screenToWorld(0, 0);
        const bottomRight = this.getEditor().screenToWorld(this.viewWidth, this.viewHeight);
        const startX = Math.floor(topLeft.x / step) * step;
        const startY = Math.floor(topLeft.y / step) * step;
        const cols = Math.floor((bottomRight.x - startX) / step) + 1;
        const rows = Math.floor((bottomRight.y - startY) / step) + 1;
        if (cols <= 0 || rows <= 0) {
            return;
        }
        // 硬上限：避免异常视口/极小 grid 再次卡死主线程
        const maxDots = 12000;
        if (cols * rows > maxDots) {
            const scale = Math.ceil(Math.sqrt((cols * rows) / maxDots));
            step *= scale;
            majorMul = Math.max(1, Math.round(majorMul / scale));
        }
        const startX2 = Math.floor(topLeft.x / step) * step;
        const startY2 = Math.floor(topLeft.y / step) * step;
        const dotR = vp.zoom >= 0.8 ? 1.15 : (vp.zoom >= 0.35 ? 0.9 : 0.65);
        const majorR = dotR + 0.35;
        // 分两趟绘制，避免每个点都切换 fillStyle / beginPath
        ctx.fillStyle = PcbColors.GRID;
        ctx.beginPath();
        let col = 0;
        for (let x = startX2; x <= bottomRight.x; x += step) {
            let row = 0;
            const sx = x * vp.zoom + vp.panOffset.x;
            const isMajorCol = (col % majorMul === 0);
            for (let y = startY2; y <= bottomRight.y; y += step) {
                const isMajor = isMajorCol || (row % majorMul === 0);
                if (!isMajor) {
                    const sy = y * vp.zoom + vp.panOffset.y;
                    ctx.moveTo(sx + dotR, sy);
                    ctx.arc(sx, sy, dotR, 0, Math.PI * 2);
                }
                row++;
            }
            col++;
        }
        ctx.fill();
        ctx.fillStyle = PcbColors.GRID_MAJOR;
        ctx.beginPath();
        col = 0;
        for (let x = startX2; x <= bottomRight.x; x += step) {
            let row = 0;
            const sx = x * vp.zoom + vp.panOffset.x;
            const isMajorCol = (col % majorMul === 0);
            for (let y = startY2; y <= bottomRight.y; y += step) {
                const isMajor = isMajorCol || (row % majorMul === 0);
                if (isMajor) {
                    const sy = y * vp.zoom + vp.panOffset.y;
                    ctx.moveTo(sx + majorR, sy);
                    ctx.arc(sx, sy, majorR, 0, Math.PI * 2);
                }
                row++;
            }
            col++;
        }
        ctx.fill();
    }
    private drawBoardOutline(ctx: CanvasRenderingContext2D, doc: PcbDocument, vp: import('common').ViewportState): void {
        if (!isLayerVisible(doc, PcbLayerId.EDGE_CUTS))
            return;
        const pts = doc.boardOutline.points;
        if (pts.length < 2)
            return;
        // Edge.Cuts：闭合实体轮廓（生产铣边依据），非辅助虚线
        const w = Math.max(2.0, Math.max(doc.boardOutline.width, 8) * vp.zoom);
        const closed = pts.length >= 3;
        let selfOk = true;
        if (closed) {
            const a = pts[0];
            const b = pts[pts.length - 1];
            const gap = Math.hypot(a.x - b.x, a.y - b.y);
            // 首尾未闭合时标红预警
            if (gap > Math.max(2, doc.boardOutline.width)) {
                selfOk = false;
            }
        }
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.setLineDash([]);
        ctx.beginPath();
        const p0 = this.worldToScreenPt(pts[0], vp);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < pts.length; i++) {
            const p = this.worldToScreenPt(pts[i], vp);
            ctx.lineTo(p.x, p.y);
        }
        if (closed)
            ctx.closePath();
        ctx.strokeStyle = selfOk ? getLayerColor(doc, PcbLayerId.EDGE_CUTS) : PcbColors.DRC_ERROR;
        ctx.lineWidth = w;
        ctx.stroke();
        // 外描边增强对比
        ctx.strokeStyle = selfOk ? 'rgba(0,0,0,0.45)' : 'rgba(255,80,80,0.5)';
        ctx.lineWidth = Math.max(1, w * 0.35);
        ctx.stroke();
        if (pts.length >= 1) {
            const origin = this.worldToScreenPt({ x: pts[0].x, y: pts[0].y }, vp);
            const arm = Math.max(8, 12 * vp.zoom);
            ctx.strokeStyle = '#FF3333';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(origin.x - arm, origin.y);
            ctx.lineTo(origin.x + arm, origin.y);
            ctx.moveTo(origin.x, origin.y - arm);
            ctx.lineTo(origin.x, origin.y + arm);
            ctx.stroke();
            ctx.strokeStyle = '#E8A020';
            ctx.beginPath();
            ctx.arc(origin.x, origin.y, Math.max(3, 4 * vp.zoom), 0, Math.PI * 2);
            ctx.stroke();
        }
    }
    private drawZones(ctx: CanvasRenderingContext2D, doc: PcbDocument, vp: import('common').ViewportState): void {
        const editor = this.getEditor();
        const appearance = editor.getAppearance();
        const active = editor.getActiveLayer();
        const hl = appearance.highlightNetId;
        const selZoneIds = new Set(editor.getSelection().zoneIds);
        // 按铜层堆叠自下而上
        const ordered: number[] = [];
        for (let zi = 0; zi < doc.zones.length; zi++)
            ordered.push(zi);
        ordered.sort((a: number, b: number) => {
            const ra = this.copperStackRank(doc.zones[a].layer);
            const rb = this.copperStackRank(doc.zones[b].layer);
            if (ra !== rb)
                return ra - rb;
            const pa = doc.zones[a].priority !== undefined ? doc.zones[a].priority : 0;
            const pb = doc.zones[b].priority !== undefined ? doc.zones[b].priority : 0;
            return pa - pb;
        });
        for (let oi = 0; oi < ordered.length; oi++) {
            const zone = doc.zones[ordered[oi]];
            if (!isLayerVisible(doc, zone.layer) || zone.outline.length < 3)
                continue;
            if (appearance.mode === PcbAppearanceMode.ACTIVE_ONLY && isCopperLayer(zone.layer) &&
                zone.layer !== active) {
                continue;
            }
            const isSel = selZoneIds.has(zone.id);
            const onHl = hl.length > 0 && zone.netId === hl;
            const dimOther = hl.length > 0 && zone.netId !== hl;
            const dimLayer = appearance.mode === PcbAppearanceMode.DIM_INACTIVE &&
                isCopperLayer(zone.layer) && zone.layer !== active;
            // 铺铜极浅透：用层色 + 元素倍率（zone=30%）
            const layerCol = getLayerColor(doc, zone.layer);
            const isGnd = (zone.netName ?? '').toUpperCase().includes('GND');
            const zoneMult = this.copperElementAlpha(zone.layer, 'zone');
            let fillColor = isGnd ? this.withAlpha(PcbColors.ZONE_GND, zoneMult)
                : this.withAlpha(layerCol, 0.22 * zoneMult);
            if (isSel || onHl) {
                fillColor = isGnd ? PcbColors.ZONE_SELECTED : this.withAlpha(layerCol, 0.22);
            }
            if (dimOther || dimLayer) {
                fillColor = this.withAlpha(layerCol, Math.max(0.05, appearance.dimAlpha * 0.22));
            }
            ctx.fillStyle = fillColor;
            ctx.beginPath();
            const p0 = this.worldToScreenPt(zone.outline[0], vp);
            ctx.moveTo(p0.x, p0.y);
            for (let i = 1; i < zone.outline.length; i++) {
                const p = this.worldToScreenPt(zone.outline[i], vp);
                ctx.lineTo(p.x, p.y);
            }
            ctx.closePath();
            if (zone.cutouts) {
                for (const cut of zone.cutouts) {
                    if (cut.length < 3)
                        continue;
                    const last = cut.length - 1;
                    const cLast = this.worldToScreenPt(cut[last], vp);
                    ctx.moveTo(cLast.x, cLast.y);
                    for (let i = last - 1; i >= 0; i--) {
                        const cp = this.worldToScreenPt(cut[i], vp);
                        ctx.lineTo(cp.x, cp.y);
                    }
                    ctx.closePath();
                }
            }
            ctx.fill('evenodd');
            // 细边框，不抢视线
            ctx.strokeStyle = isSel || onHl ? ProteusColors.SELECTED : this.withAlpha(layerCol, 0.55);
            ctx.lineWidth = isSel ? 2 : 1;
            ctx.globalAlpha = dimLayer ? 0.4 : 0.7;
            ctx.stroke();
            ctx.globalAlpha = 1;
            if (zone.thermalRelief) {
                const spokeFill = isSel || onHl ? PcbColors.ZONE_SELECTED : this.withAlpha(layerCol, 0.55);
                ctx.fillStyle = spokeFill;
                const tw = Math.max(zone.thermalWidth, 6);
                for (const fp of doc.footprints) {
                    for (const pad of fp.pads) {
                        if (pad.netId !== zone.netId)
                            continue;
                        const wx = padWorldPosition(fp, pad);
                        const hw = Math.max(pad.size.x, 10) / 2;
                        const hh = Math.max(pad.size.y, 10) / 2;
                        const spokes: SpokeRect[] = [
                            makeSpoke(wx, -hw - zone.thermalGap, 0, tw, hh * 2),
                            makeSpoke(wx, hw + zone.thermalGap, 0, tw, hh * 2),
                            makeSpoke(wx, 0, -hh - zone.thermalGap, hw * 2, tw),
                            makeSpoke(wx, 0, hh + zone.thermalGap, hw * 2, tw)
                        ];
                        for (const sp of spokes) {
                            const s = this.worldToScreenPt({ x: sp.x, y: sp.y }, vp);
                            const w = sp.w * vp.zoom;
                            const h = sp.h * vp.zoom;
                            ctx.fillRect(s.x - w / 2, s.y - h / 2, w, h);
                        }
                    }
                }
            }
            // 覆铜标注：仅选中时显示
            if (isSel) {
                const corner = zone.outline[0];
                const labelPt = this.worldToScreenPt(corner, vp);
                const netNm = (zone.netName !== undefined && zone.netName.length > 0) ? zone.netName : '(no net)';
                const label = `${netNm} · ${zone.layer}`;
                const fontPx = Math.max(10, Math.min(12, 11 * vp.zoom / 0.7));
                ctx.font = `bold ${fontPx}px sans-serif`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'bottom';
                const tw = ctx.measureText(label).width;
                ctx.fillStyle = 'rgba(10,14,22,0.65)';
                ctx.fillRect(labelPt.x + 4, labelPt.y - fontPx - 6, tw + 10, fontPx + 6);
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(label, labelPt.x + 8, labelPt.y - 4);
            }
            if (isSel) {
                ctx.strokeStyle = ProteusColors.SELECTED;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(p0.x, p0.y);
                for (let i = 1; i < zone.outline.length; i++) {
                    const p = this.worldToScreenPt(zone.outline[i], vp);
                    ctx.lineTo(p.x, p.y);
                }
                ctx.closePath();
                ctx.stroke();
            }
        }
    }
    private drawTracks(ctx: CanvasRenderingContext2D, doc: PcbDocument, vp: import('common').ViewportState): void {
        const editor = this.getEditor();
        const appearance = editor.getAppearance();
        const active = editor.getActiveLayer();
        const hl = appearance.highlightNetId;
        const selTrkIds = new Set(editor.getSelection().trackIds);
        const filtered: PcbTrack[] = [];
        for (let ti = 0; ti < doc.tracks.length; ti++) {
            const trk = doc.tracks[ti];
            if (!isLayerVisible(doc, trk.layer))
                continue;
            if (!this.segInView(trk.start, trk.end, vp, 40))
                continue;
            if (appearance.mode === PcbAppearanceMode.ACTIVE_ONLY && isCopperLayer(trk.layer) &&
                trk.layer !== active) {
                continue;
            }
            filtered.push(trk);
        }
        const polys = buildTrackPolylines(filtered);
        // 底层铜先画
        polys.sort((a: PcbTrackPolyline, b: PcbTrackPolyline) => this.copperStackRank(a.layer) - this.copperStackRank(b.layer));
        for (let pi = 0; pi < polys.length; pi++) {
            const poly = polys[pi];
            if (poly.points.length < 2)
                continue;
            let selected = false;
            for (let k = 0; k < poly.trackIds.length; k++) {
                if (selTrkIds.has(poly.trackIds[k])) {
                    selected = true;
                    break;
                }
            }
            const netHl = hl.length > 0 && poly.netId === hl;
            const dimOther = hl.length > 0 && poly.netId !== hl;
            const dimLayer = appearance.mode === PcbAppearanceMode.DIM_INACTIVE &&
                isCopperLayer(poly.layer) && poly.layer !== active;
            const baseHex = selected || netHl ? ProteusColors.SELECTED : getLayerColor(doc, poly.layer);
            // 走线按层独立倍率：F.Cu=60%, B.Cu=100%
            const trkMult = this.copperElementAlpha(poly.layer, 'track');
            let alpha = Math.max(0.85, getLayerOpacity(doc, poly.layer)) * trkMult;
            if (dimOther || dimLayer) {
                alpha = alpha * appearance.dimAlpha;
            }
            const color = this.withAlpha(baseHex, alpha);
            const boost = (selected || netHl) ? Math.max(1.5, 2 * vp.zoom) : 0;
            const baseW = Math.max(1.0, poly.width * vp.zoom + boost);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            // 深底描边 + 层色走线，对比清晰
            ctx.strokeStyle = 'rgba(0,0,0,0.55)';
            ctx.lineWidth = baseW + 1.8;
            ctx.beginPath();
            const p0 = this.worldToScreenPt(poly.points[0], vp);
            ctx.moveTo(p0.x, p0.y);
            for (let i = 1; i < poly.points.length; i++) {
                const p = this.worldToScreenPt(poly.points[i], vp);
                ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
            ctx.strokeStyle = color;
            ctx.lineWidth = baseW;
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            for (let i = 1; i < poly.points.length; i++) {
                const p = this.worldToScreenPt(poly.points[i], vp);
                ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
            // 拐点圆角：保证 T 接/直角处视觉一体
            const r = baseW * 0.5;
            ctx.fillStyle = color;
            for (let i = 0; i < poly.points.length; i++) {
                const p = this.worldToScreenPt(poly.points[i], vp);
                ctx.beginPath();
                ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        // 走线网络名：近距 LOD
        if (vp.zoom >= 1.05) {
            const seen = new Set<string>();
            for (let ti = 0; ti < doc.tracks.length; ti++) {
                const trk = doc.tracks[ti];
                if (!trk.netName || trk.netName.length === 0)
                    continue;
                if (!isLayerVisible(doc, trk.layer))
                    continue;
                const key = `${trk.netId}`;
                if (seen.has(key))
                    continue;
                seen.add(key);
                const mid = this.worldToScreenPt({
                    x: (trk.start.x + trk.end.x) / 2,
                    y: (trk.start.y + trk.end.y) / 2
                }, vp);
                const fontPx = Math.max(8, Math.min(11, 8 + vp.zoom * 2));
                this.drawOutlinedText(ctx, this.shortNetName(trk.netName), mid.x, mid.y - 7, getLayerColor(doc, trk.layer), '#000000', fontPx);
            }
        }
    }
    /** 铜层绘制顺序秩：数值越小越先画（底层） */
    private copperStackRank(layer: PcbLayerId): number {
        if (layer === PcbLayerId.B_CU)
            return 0;
        if (layer === PcbLayerId.IN6_CU)
            return 1;
        if (layer === PcbLayerId.IN5_CU)
            return 2;
        if (layer === PcbLayerId.IN4_CU)
            return 3;
        if (layer === PcbLayerId.IN3_CU)
            return 4;
        if (layer === PcbLayerId.IN2_CU)
            return 5;
        if (layer === PcbLayerId.IN1_CU)
            return 6;
        if (layer === PcbLayerId.F_CU)
            return 7;
        return 4;
    }
    /** 铜层各元素的相对显示强度倍率 */
    private copperElementAlpha(layer: PcbLayerId, kind: string): number {
        if (layer === PcbLayerId.F_CU) {
            if (kind === 'zone')
                return 0.30;
            if (kind === 'track')
                return 0.60;
            if (kind === 'pad')
                return 1.0;
            return 1.0; // via / default
        }
        if (layer === PcbLayerId.B_CU) {
            if (kind === 'zone')
                return 0.30;
            if (kind === 'track')
                return 1.0;
            if (kind === 'pad')
                return 0.60;
            return 1.0;
        }
        return 1.0;
    }
    private drawRatsnest(ctx: CanvasRenderingContext2D, vp: import('common').ViewportState): void {
        const editor = this.getEditor();
        const edges = editor.getRatsnest();
        const appearance = editor.getAppearance();
        const hl = appearance.highlightNetId;
        const dimAlpha = appearance.dimAlpha;
        ctx.setLineDash([3, 5]);
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.45;
        for (const e of edges) {
            const onHl = hl.length > 0 && e.netId === hl;
            const dimOther = hl.length > 0 && e.netId !== hl;
            if (dimOther && dimAlpha < 0.05)
                continue;
            if (dimOther) {
                ctx.strokeStyle = this.withAlpha(ProteusColors.TEXT_SECONDARY, dimAlpha * 0.5);
            }
            else if (onHl) {
                ctx.strokeStyle = ProteusColors.SELECTED;
                ctx.lineWidth = 1.5;
                ctx.globalAlpha = 0.85;
            }
            else {
                ctx.strokeStyle = 'rgba(180, 200, 220, 0.55)';
            }
            const a = this.worldToScreenPt(e.a, vp);
            const b = this.worldToScreenPt(e.b, vp);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.45;
        }
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
    }
    private drawZonePolyPreview(ctx: CanvasRenderingContext2D, vp: import('common').ViewportState): void {
        const pts = this.getEditor().getZonePolyPreview();
        if (pts.length < 1)
            return;
        ctx.strokeStyle = PcbColors.ROUTE_PREVIEW;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        const p0 = this.worldToScreenPt(pts[0], vp);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < pts.length; i++) {
            const p = this.worldToScreenPt(pts[i], vp);
            ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }
    private drawOutlinePreview(ctx: CanvasRenderingContext2D, vp: import('common').ViewportState): void {
        const pts = this.getEditor().getOutlinePreview();
        if (pts.length < 1)
            return;
        ctx.strokeStyle = PcbColors.BOARD_OUTLINE;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        const p0 = this.worldToScreenPt(pts[0], vp);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < pts.length; i++) {
            const p = this.worldToScreenPt(pts[i], vp);
            ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }
    private drawMeasure(ctx: CanvasRenderingContext2D, vp: import('common').ViewportState): void {
        const pts = this.getEditor().getMeasurePoints();
        if (pts.length === 0)
            return;
        ctx.fillStyle = ProteusColors.SELECTED;
        for (const p of pts) {
            const s = this.worldToScreenPt(p, vp);
            ctx.beginPath();
            ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
        if (pts.length === 2) {
            const a = this.worldToScreenPt(pts[0], vp);
            const b = this.worldToScreenPt(pts[1], vp);
            const dx = pts[1].x - pts[0].x;
            const dy = pts[1].y - pts[0].y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const mm = len * 0.0254;
            const ang = Math.atan2(dy, dx) * 180 / Math.PI;
            // 正交辅助线
            ctx.strokeStyle = 'rgba(0,191,255,0.55)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.strokeStyle = ProteusColors.SELECTED;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            const lx = (a.x + b.x) / 2 + 8;
            const ly = (a.y + b.y) / 2 - 8;
            ctx.fillStyle = 'rgba(10,14,22,0.78)';
            ctx.fillRect(lx - 4, ly - 28, 210, 40);
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 11px sans-serif';
            ctx.fillText(`${len.toFixed(1)} mil  (${mm.toFixed(3)} mm)`, lx, ly - 12);
            ctx.font = '10px sans-serif';
            ctx.fillStyle = '#A8D4FF';
            ctx.fillText(`ΔX=${dx.toFixed(1)}  ΔY=${dy.toFixed(1)}  ∠${ang.toFixed(1)}°`, lx, ly + 4);
        }
    }
    /** @deprecated 层色已在 createDefaultPcbLayers / normalize 中设定，绘制期不再覆写 */
    private ensureProfessionalLayerColors(_doc: PcbDocument): void {
        // no-op：保留方法避免外部引用断裂
    }
    private drawSimple3d(ctx: CanvasRenderingContext2D, doc: PcbDocument, vp: import('common').ViewportState): void {
        const editor = this.getEditor();
        const ap = editor.getAppearance();
        const sel = editor.getSelection();
        const mode = ap.view3dDisplayMode !== undefined
            ? ap.view3dDisplayMode : Pcb3dDisplayMode.REALISTIC;
        if (ap.view3dMeasure !== true && this.measure3dPts.length > 0) {
            this.measure3dPts = [];
        }
        Pcb3dRenderer.render(ctx, doc, {
            viewWidth: this.viewWidth,
            viewHeight: this.viewHeight,
            zoom: Math.max(vp.zoom, 0.05),
            panX: vp.panOffset.x,
            panY: vp.panOffset.y,
            yawDeg: ap.view3dYawDeg,
            pitchDeg: ap.view3dPitchDeg,
            ortho: ap.view3dOrtho !== false,
            highlightNetId: ap.highlightNetId,
            dimAlpha: ap.dimAlpha,
            hideZones: ap.hideZones,
            selectedFpIds: sel.footprintIds,
            selectedTrackIds: sel.trackIds,
            selectedViaIds: sel.viaIds,
            displayMode: mode,
            cutFraction: ap.view3dCutFraction !== undefined ? ap.view3dCutFraction : 0.55,
            measurePts: this.measure3dPts,
            showInterference: ap.view3dShowInterference === true,
            usePbr: ap.view3dPbr === true && mode === Pcb3dDisplayMode.REALISTIC,
            msaa: ap.view3dMsaa >= 4 ? 4 : 1,
            activeLayer: editor.getActiveLayer(),
            appearanceMode: ap.mode !== undefined ? ap.mode : PcbAppearanceMode.OVERLAY
        });
    }
    private build3dViewParams(): import('../utils/Pcb3dRenderer').Pcb3dViewParams {
        const editor = this.getEditor();
        const ap = editor.getAppearance();
        const sel = editor.getSelection();
        const vp = editor.getViewport();
        const mode = ap.view3dDisplayMode !== undefined
            ? ap.view3dDisplayMode : Pcb3dDisplayMode.REALISTIC;
        return {
            viewWidth: this.viewWidth,
            viewHeight: this.viewHeight,
            zoom: Math.max(vp.zoom, 0.05),
            panX: vp.panOffset.x,
            panY: vp.panOffset.y,
            yawDeg: ap.view3dYawDeg,
            pitchDeg: ap.view3dPitchDeg,
            ortho: ap.view3dOrtho !== false,
            highlightNetId: ap.highlightNetId,
            dimAlpha: ap.dimAlpha,
            hideZones: ap.hideZones,
            selectedFpIds: sel.footprintIds,
            selectedTrackIds: sel.trackIds,
            selectedViaIds: sel.viaIds,
            displayMode: mode,
            cutFraction: ap.view3dCutFraction !== undefined ? ap.view3dCutFraction : 0.55,
            measurePts: this.measure3dPts,
            showInterference: ap.view3dShowInterference === true,
            usePbr: ap.view3dPbr === true && mode === Pcb3dDisplayMode.REALISTIC,
            msaa: ap.view3dMsaa >= 4 ? 4 : 1,
            activeLayer: editor.getActiveLayer(),
            appearanceMode: ap.mode !== undefined ? ap.mode : PcbAppearanceMode.OVERLAY
        };
    }
    private withAlpha(color: string, alpha: number): string {
        const a = Math.max(0, Math.min(1, alpha));
        if (color.startsWith('#') && (color.length === 7 || color.length === 9)) {
            const r = parseInt(color.substring(1, 3), 16);
            const g = parseInt(color.substring(3, 5), 16);
            const b = parseInt(color.substring(5, 7), 16);
            if (!(r >= 0) || !(g >= 0) || !(b >= 0)) {
                return `rgba(128,128,128,${a.toFixed(3)})`;
            }
            return `rgba(${r},${g},${b},${a.toFixed(3)})`;
        }
        return color;
    }
    private drawVias(ctx: CanvasRenderingContext2D, doc: PcbDocument, vp: import('common').ViewportState): void {
        const editor = this.getEditor();
        const selViaIds = new Set(editor.getSelection().viaIds);
        const appearance = editor.getAppearance();
        const active = editor.getActiveLayer();
        const hl = appearance.highlightNetId;
        const dimAlpha = appearance.dimAlpha;
        const lodFar = vp.zoom < 0.22;
        for (const via of doc.vias) {
            if (!this.ptInView(via.position, vp, via.diameter))
                continue;
            const spansActive = via.layers.length === 0 ||
                viaLayerHas(via.layers, active) ||
                (viaLayerHas(via.layers, PcbLayerId.F_CU) && viaLayerHas(via.layers, PcbLayerId.B_CU));
            if (appearance.mode === PcbAppearanceMode.ACTIVE_ONLY && isCopperLayer(active) && !spansActive) {
                continue;
            }
            // 埋孔：非活动内层模式下可淡显
            const kind = via.kind !== undefined ? via.kind : PcbViaKind.THROUGH;
            if (kind === PcbViaKind.BURIED && appearance.mode === PcbAppearanceMode.ACTIVE_ONLY &&
                (active === PcbLayerId.F_CU || active === PcbLayerId.B_CU)) {
                continue;
            }
            const p = this.worldToScreenPt(via.position, vp);
            const rOuter = Math.max(3.0, via.diameter * vp.zoom / 2);
            const rDrill = Math.max(1.3, (via.drill > 0 ? via.drill : via.diameter * 0.45) * vp.zoom / 2);
            const selected = selViaIds.has(via.id);
            const onHl = hl.length > 0 && via.netId === hl;
            const dimOther = hl.length > 0 && via.netId !== hl;
            const dimLayer = appearance.mode === PcbAppearanceMode.DIM_INACTIVE &&
                isCopperLayer(active) && !spansActive;
            let fillColor = selected || onHl ? ProteusColors.SELECTED : PcbColors.VIA_FILL;
            if (kind === PcbViaKind.BLIND)
                fillColor = selected || onHl ? ProteusColors.SELECTED : '#C8A060';
            if (kind === PcbViaKind.BURIED)
                fillColor = selected || onHl ? ProteusColors.SELECTED : '#9090A8';
            if (dimOther || dimLayer)
                fillColor = this.withAlpha(fillColor, dimAlpha);
            if (lodFar) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, Math.max(2, rOuter * 0.7), 0, Math.PI * 2);
                ctx.fillStyle = fillColor;
                ctx.fill();
                continue;
            }
            ctx.beginPath();
            ctx.arc(p.x, p.y, rOuter + (selected ? 1.5 : 0), 0, Math.PI * 2);
            ctx.fillStyle = fillColor;
            ctx.fill();
            // 盲孔：半环标记；埋孔：虚线外环
            if (kind === PcbViaKind.BLIND) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, rOuter + 2, -Math.PI * 0.15, Math.PI * 0.85);
                ctx.strokeStyle = '#FFAA44';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
            else if (kind === PcbViaKind.BURIED) {
                ctx.setLineDash([3, 2]);
                ctx.beginPath();
                ctx.arc(p.x, p.y, rOuter + 2.5, 0, Math.PI * 2);
                ctx.strokeStyle = '#A0A0C0';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.setLineDash([]);
            }
            ctx.strokeStyle = selected ? ProteusColors.HOVER_PREVIEW
                : onHl ? ProteusColors.SELECTED : PcbColors.VIA_STROKE;
            ctx.lineWidth = selected ? 2 : 1.5;
            ctx.beginPath();
            ctx.arc(p.x, p.y, rOuter, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(p.x, p.y, rDrill, 0, Math.PI * 2);
            ctx.fillStyle = '#000000';
            ctx.fill();
            if (appearance.showPadNumbers && via.netName && via.netName.length > 0 && vp.zoom >= 0.55) {
                const tag = kind === PcbViaKind.THROUGH ? '' :
                    (kind === PcbViaKind.BLIND ? 'B' : 'U');
                this.drawOutlinedText(ctx, tag.length > 0 ? `${tag}:${this.shortNetName(via.netName)}`
                    : this.shortNetName(via.netName), p.x, p.y - rOuter - 8, PcbColors.VIA_FILL, '#0A0A12', Math.max(9, 10 * vp.zoom));
            }
        }
    }
    private drawFootprints(ctx: CanvasRenderingContext2D, doc: PcbDocument, vp: import('common').ViewportState, phase: string): void {
        const editor = this.getEditor();
        const appearance = editor.getAppearance();
        const hl = appearance.highlightNetId;
        const active = editor.getActiveLayer();
        const lib = getGlobalPcbFootprintLibrary();
        const selFpIds = new Set(editor.getSelection().footprintIds);
        for (const fp of doc.footprints) {
            if (!this.ptInView(fp.position, vp, 120))
                continue;
            const copperOnlyMode = appearance.mode === PcbAppearanceMode.ACTIVE_ONLY &&
                isCopperLayer(active);
            if (copperOnlyMode) {
                // 内层仅活动层：只显示焊盘跨该层的封装（SMD 对侧隐藏）
                if (active === PcbLayerId.F_CU || active === PcbLayerId.B_CU) {
                    if (fp.layer !== active)
                        continue;
                }
                else {
                    let touches = false;
                    for (let pi = 0; pi < fp.pads.length; pi++) {
                        const layers = fp.pads[pi].layers;
                        if (!layers || layers.length === 0) {
                            if (fp.pads[pi].type !== PcbPadType.SMD) {
                                touches = true;
                                break;
                            }
                        }
                        else {
                            for (let li = 0; li < layers.length; li++) {
                                if (layers[li] === active) {
                                    touches = true;
                                    break;
                                }
                            }
                        }
                        if (touches)
                            break;
                    }
                    if (!touches)
                        continue;
                }
            }
            // 远距 LOD：丝印阶段只画位号
            if (phase === 'silk' && vp.zoom < 0.28) {
                const origin = this.worldToScreenPt(fp.position, vp);
                this.drawOutlinedText(ctx, fp.refDes, origin.x, origin.y - 10, PcbColors.REFDES, '#05080E', Math.max(10, 9 + vp.zoom * 8));
                continue;
            }
            this.drawFootprint(ctx, fp, vp, lib, selFpIds.has(fp.id), hl, appearance, phase);
        }
    }
    private drawFootprint(ctx: CanvasRenderingContext2D, fp: PcbFootprintInst, vp: import('common').ViewportState, lib: import('common').PcbFootprintLibrary, selected: boolean, hlNetId: string, appearance: PcbAppearance, phase: string): void {
        const def = lib.getDef(fp.defId);
        const origin = this.worldToScreenPt(fp.position, vp);
        const hasHlNet = hlNetId.length > 0;
        const fpHasHlPad = hasHlNet && fp.pads.some(p => p.netId === hlNetId);
        const dimFp = hasHlNet && !fpHasHlPad;
        const dimAlpha = appearance.dimAlpha;
        const isMount = fp.defId === 'FP_MOUNT' || fp.refDes.startsWith('H');
        const doc = this.getEditor().getDocument();
        // 阻焊开窗余量 ≈ 0.15mm ≈ 6 mil
        const maskClear = 6 * vp.zoom;
        if (phase === 'copper') {
            const padMult = this.copperElementAlpha(fp.layer, 'pad');
            const prevAlpha = ctx.globalAlpha;
            ctx.globalAlpha = Math.min(1, Math.max(0.25, padMult));
            if (selected) {
                ctx.strokeStyle = ProteusColors.SELECTED;
                ctx.lineWidth = 2;
                const bb = this.footprintScreenBBox(fp, def, vp);
                ctx.strokeRect(bb.x - 2, bb.y - 2, bb.w + 4, bb.h + 4);
            }
            for (const pad of fp.pads) {
                const pp = this.localToScreen(pad.pos, fp, vp);
                const hw = Math.max(2.0, pad.size.x * vp.zoom / 2);
                const hh = Math.max(2.0, pad.size.y * vp.zoom / 2);
                const padOnHl = hasHlNet && pad.netId === hlNetId;
                const dimPad = hasHlNet && !padOnHl;
                const copper = padOnHl ? ProteusColors.SELECTED
                    : (pad.netName && pad.netName.length > 0 ? PcbColors.PAD_SMD_NET : PcbColors.PAD_SMD);
                const thCopper = padOnHl ? ProteusColors.SELECTED : PcbColors.PAD_TH;
                const fillCu = dimPad ? this.withAlpha(pad.type === PcbPadType.TH || pad.type === PcbPadType.NPTH ? thCopper : copper, dimAlpha)
                    : (pad.type === PcbPadType.TH || pad.type === PcbPadType.NPTH ? thCopper : copper);
                const shape = pad.shape !== undefined ? pad.shape : PcbPadShape.RECT;
                // 阻焊开窗：比铜盘略大，露出深绿缺口环
                if (!isMount && vp.zoom >= 0.2) {
                    this.fillPadShape(ctx, shape, pp.x, pp.y, hw + maskClear, hh + maskClear, '#0A2214');
                }
                if (pad.type === PcbPadType.TH || pad.type === PcbPadType.NPTH) {
                    const r = Math.max(hw, hh);
                    if (isMount) {
                        // 非金属化安装孔：仅环 + 钻孔
                        ctx.beginPath();
                        ctx.arc(pp.x, pp.y, r, 0, Math.PI * 2);
                        ctx.strokeStyle = dimPad ? this.withAlpha(thCopper, dimAlpha) : thCopper;
                        ctx.lineWidth = Math.max(2, 8 * vp.zoom);
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.arc(pp.x, pp.y, Math.max(2, r * 0.55), 0, Math.PI * 2);
                        ctx.fillStyle = '#000000';
                        ctx.fill();
                        ctx.strokeStyle = PcbColors.SILK;
                        ctx.lineWidth = Math.max(1, 1.5);
                        ctx.beginPath();
                        ctx.moveTo(pp.x - r * 0.85, pp.y);
                        ctx.lineTo(pp.x + r * 0.85, pp.y);
                        ctx.moveTo(pp.x, pp.y - r * 0.85);
                        ctx.lineTo(pp.x, pp.y + r * 0.85);
                        ctx.stroke();
                    }
                    else {
                        // 通孔：铜环 + 钻孔，双描边抗锯齿
                        ctx.beginPath();
                        ctx.arc(pp.x, pp.y, r, 0, Math.PI * 2);
                        ctx.fillStyle = fillCu;
                        ctx.fill();
                        ctx.strokeStyle = 'rgba(255,230,140,0.45)';
                        ctx.lineWidth = 1.25;
                        ctx.stroke();
                        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
                        ctx.lineWidth = 1;
                        ctx.stroke();
                        const drillR = Math.max(1.4, (pad.drill !== undefined ? pad.drill : pad.size.x * 0.45) * vp.zoom / 2);
                        ctx.beginPath();
                        ctx.arc(pp.x, pp.y, drillR, 0, Math.PI * 2);
                        ctx.fillStyle = '#000000';
                        ctx.fill();
                    }
                }
                else {
                    // SMD：按 shape 渲染
                    this.fillPadShape(ctx, shape, pp.x, pp.y, hw, hh, fillCu);
                    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
                    ctx.lineWidth = 1;
                    this.strokePadShape(ctx, shape, pp.x, pp.y, hw, hh);
                }
            }
            ctx.globalAlpha = prevAlpha;
            return;
        }
        // —— silk 阶段：正反丝印分别受 F/B.SilkS 控制 ——
        const silkLayer = fp.layer === PcbLayerId.B_CU ? PcbLayerId.B_SILKS : PcbLayerId.F_SILKS;
        if (def && doc && isLayerVisible(doc, silkLayer)) {
            const silkW = Math.max(1.0, Math.min(2.2, 4.5 * vp.zoom));
            for (const line of def.silkLines) {
                if (line.length < 2)
                    continue;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                const p0 = this.localToScreen(line[0], fp, vp);
                ctx.moveTo(p0.x, p0.y);
                for (let i = 1; i < line.length; i++) {
                    const p = this.localToScreen(line[i], fp, vp);
                    ctx.lineTo(p.x, p.y);
                }
                ctx.strokeStyle = dimFp ? this.withAlpha(PcbColors.SILK, dimAlpha) : PcbColors.SILK;
                ctx.lineWidth = silkW;
                ctx.stroke();
            }
        }
        if (!isMount && fp.pads.length >= 2) {
            let pin1 = fp.pads[0];
            for (let pi = 0; pi < fp.pads.length; pi++) {
                if (fp.pads[pi].number === '1') {
                    pin1 = fp.pads[pi];
                    break;
                }
            }
            const markR = Math.max(2.5, 3.5 * vp.zoom);
            const dx = pin1.pos.x === 0 ? 0 : (pin1.pos.x > 0 ? 1 : -1);
            const dy = pin1.pos.y === 0 ? (dx === 0 ? -1 : 0) : (pin1.pos.y > 0 ? 1 : -1);
            const ph = Math.max(pin1.size.x, pin1.size.y) / 2;
            const mk = this.localToScreen({
                x: pin1.pos.x + dx * (ph + 14),
                y: pin1.pos.y + dy * (ph + 14)
            }, fp, vp);
            ctx.beginPath();
            ctx.arc(mk.x, mk.y, markR, 0, Math.PI * 2);
            ctx.fillStyle = dimFp ? this.withAlpha('#FF5555', dimAlpha) : '#FF5555';
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        const labeledNets = new Set<string>();
        for (const pad of fp.pads) {
            const pp = this.localToScreen(pad.pos, fp, vp);
            const hw = Math.max(2.5, pad.size.x * vp.zoom / 2);
            const hh = Math.max(2.5, pad.size.y * vp.zoom / 2);
            const showNum = appearance.showPadNumbers && Math.min(hw, hh) >= 4 && !isMount;
            if (showNum) {
                const fontPx = Math.max(9, Math.min(15, Math.min(hw, hh) * 1.25));
                this.drawOutlinedText(ctx, pad.number, pp.x, pp.y, '#FFFFFF', '#101018', fontPx);
            }
            if (pad.netId && pad.netName && pad.netName.length > 0 && vp.zoom >= 0.85 && !isMount) {
                if (!labeledNets.has(pad.netId)) {
                    labeledNets.add(pad.netId);
                    const netLabel = this.shortNetName(pad.netName);
                    const fontPx = Math.max(8, Math.min(11, 7 + vp.zoom * 3));
                    const offY = hh + fontPx * 0.85 + 2;
                    this.drawOutlinedText(ctx, netLabel, pp.x, pp.y + offY, '#D8E8F8', '#0A1018', fontPx);
                }
            }
        }
        const refFont = Math.max(12, Math.min(18, 11 + vp.zoom * 6));
        const labelY = origin.y - Math.max(16, 22 * vp.zoom);
        this.drawOutlinedText(ctx, fp.refDes, origin.x, labelY, dimFp ? this.withAlpha(PcbColors.REFDES, dimAlpha) : PcbColors.REFDES, '#05080E', refFont);
        if (fp.value && fp.value.length > 0 && fp.value !== fp.refDes && vp.zoom >= 0.35) {
            const valFont = Math.max(10, refFont - 2);
            this.drawOutlinedText(ctx, fp.value, origin.x, labelY + refFont + 2, dimFp ? this.withAlpha(PcbColors.SILK, dimAlpha) : PcbColors.SILK, '#05080E', valFont);
        }
    }
    private fillPadShape(ctx: CanvasRenderingContext2D, shape: PcbPadShape, cx: number, cy: number, hw: number, hh: number, fill: string): void {
        ctx.fillStyle = fill;
        if (shape === PcbPadShape.CIRCLE ||
            (shape === PcbPadShape.OVAL && Math.abs(hw - hh) < 0.5)) {
            const r = Math.max(hw, hh);
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
            return;
        }
        if (shape === PcbPadShape.OVAL) {
            ctx.beginPath();
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(Math.max(hw, 0.01), Math.max(hh, 0.01));
            ctx.arc(0, 0, 1, 0, Math.PI * 2);
            ctx.restore();
            ctx.fill();
            return;
        }
        const rx = shape === PcbPadShape.ROUNDRECT
            ? Math.min(hw, hh) * 0.35
            : Math.min(2.5, Math.min(hw, hh) * 0.2);
        this.fillRoundRect(ctx, cx - hw, cy - hh, hw * 2, hh * 2, rx, fill);
    }
    private strokePadShape(ctx: CanvasRenderingContext2D, shape: PcbPadShape, cx: number, cy: number, hw: number, hh: number): void {
        if (shape === PcbPadShape.CIRCLE ||
            (shape === PcbPadShape.OVAL && Math.abs(hw - hh) < 0.5)) {
            ctx.beginPath();
            ctx.arc(cx, cy, Math.max(hw, hh), 0, Math.PI * 2);
            ctx.stroke();
            return;
        }
        if (shape === PcbPadShape.OVAL) {
            ctx.beginPath();
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(Math.max(hw, 0.01), Math.max(hh, 0.01));
            ctx.arc(0, 0, 1, 0, Math.PI * 2);
            ctx.restore();
            ctx.stroke();
            return;
        }
        const rx = shape === PcbPadShape.ROUNDRECT
            ? Math.min(hw, hh) * 0.35
            : Math.min(2.5, Math.min(hw, hh) * 0.2);
        this.strokeRoundRect(ctx, cx - hw, cy - hh, hw * 2, hh * 2, rx);
    }
    /** DRC 违规定位标记 */
    private drawDrcMarkers(ctx: CanvasRenderingContext2D, vp: import('common').ViewportState): void {
        const violations = this.getEditor().getLastDrcViolations();
        if (violations.length === 0)
            return;
        for (let i = 0; i < violations.length; i++) {
            const v = violations[i];
            if (!v.position)
                continue;
            const p = this.worldToScreenPt(v.position, vp);
            const r = Math.max(5, 7 * Math.min(vp.zoom, 2));
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,60,60,0.35)';
            ctx.fill();
            ctx.strokeStyle = PcbColors.DRC_ERROR;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(p.x - r * 0.45, p.y - r * 0.45);
            ctx.lineTo(p.x + r * 0.45, p.y + r * 0.45);
            ctx.moveTo(p.x + r * 0.45, p.y - r * 0.45);
            ctx.lineTo(p.x - r * 0.45, p.y + r * 0.45);
            ctx.stroke();
        }
    }
    /** 高对比描边文字（深底描边 + 亮色填充） */
    private drawOutlinedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, stroke: string, fontPx: number): void {
        if (text.length === 0)
            return;
        ctx.font = `bold ${fontPx}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(2.5, fontPx * 0.22);
        ctx.strokeStyle = stroke;
        ctx.lineJoin = 'round';
        ctx.strokeText(text, x, y);
        ctx.fillStyle = fill;
        ctx.fillText(text, x, y);
    }
    private shortNetName(name: string): string {
        if (name.length <= 8)
            return name;
        return `${name.substring(0, 7)}…`;
    }
    private fillRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string): void {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.lineTo(x + w - rr, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
        ctx.lineTo(x + w, y + h - rr);
        ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
        ctx.lineTo(x + rr, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
        ctx.lineTo(x, y + rr);
        ctx.quadraticCurveTo(x, y, x + rr, y);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
    }
    private strokeRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.lineTo(x + w - rr, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
        ctx.lineTo(x + w, y + h - rr);
        ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
        ctx.lineTo(x + rr, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
        ctx.lineTo(x, y + rr);
        ctx.quadraticCurveTo(x, y, x + rr, y);
        ctx.closePath();
        ctx.stroke();
    }
    /** 按当前拐角模式绘制走线预览（含实时 DRC 违规红色提示） */
    private drawRoutePreview(ctx: CanvasRenderingContext2D, vp: import('common').ViewportState, start: Point2D, end: Point2D): void {
        const mode = this.getEditor().getRouteCornerMode();
        const path = routeByCornerMode(start, end, mode);
        const violating = this.getEditor().isRoutePreviewViolating();
        if (violating) {
            ctx.strokeStyle = PcbColors.DRC_ERROR;
            ctx.lineWidth = 3;
            ctx.setLineDash([]);
            ctx.shadowColor = 'rgba(255, 50, 50, 0.5)';
            ctx.shadowBlur = 8;
        }
        else {
            ctx.strokeStyle = PcbColors.ROUTE_PREVIEW;
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
        }
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        const p0 = this.worldToScreenPt(path[0], vp);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < path.length; i++) {
            const p = this.worldToScreenPt(path[i], vp);
            ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
    }
    /** 差分对预览 + 蛇形等长预览 + 等长读数 */
    private drawDiffPairPreview(ctx: CanvasRenderingContext2D, vp: import('common').ViewportState, ds: import('pcb_editor').DiffRouteState): void {
        const mode = this.getEditor().getRouteCornerMode();
        let pathP: Point2D[] = routeByCornerMode(ds.startP, ds.previewP, mode);
        let pathN: Point2D[] = routeByCornerMode(ds.startN, ds.previewN, mode);
        const doc = this.getEditor().getDocument();
        let tol = 20;
        if (doc) {
            for (const dp of doc.diffPairs) {
                if (dp.netIdP === ds.netIdP || dp.netIdN === ds.netIdN ||
                    dp.netIdP === ds.netIdN || dp.netIdN === ds.netIdP) {
                    tol = dp.lengthTolMil;
                    break;
                }
            }
            const existP = sumTrackLengthForNet(doc, ds.netIdP);
            const existN = sumTrackLengthForNet(doc, ds.netIdN);
            const matched = matchDiffPairLengths(pathP, pathN, existP, existN, tol, ds.gap);
            pathP = matched[0];
            pathN = matched[1];
        }
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#4488FF';
        ctx.beginPath();
        for (let k = 0; k < pathP.length; k++) {
            const sp = this.worldToScreenPt(pathP[k], vp);
            if (k === 0)
                ctx.moveTo(sp.x, sp.y);
            else
                ctx.lineTo(sp.x, sp.y);
        }
        ctx.stroke();
        ctx.strokeStyle = '#FF44AA';
        ctx.beginPath();
        for (let k = 0; k < pathN.length; k++) {
            const sp = this.worldToScreenPt(pathN[k], vp);
            if (k === 0)
                ctx.moveTo(sp.x, sp.y);
            else
                ctx.lineTo(sp.x, sp.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        let lenP = 0;
        let lenN = 0;
        for (let i = 1; i < pathP.length; i++) {
            lenP += Math.hypot(pathP[i].x - pathP[i - 1].x, pathP[i].y - pathP[i - 1].y);
        }
        for (let i = 1; i < pathN.length; i++) {
            lenN += Math.hypot(pathN[i].x - pathN[i - 1].x, pathN[i].y - pathN[i - 1].y);
        }
        let totalP = lenP;
        let totalN = lenN;
        if (doc) {
            totalP += sumTrackLengthForNet(doc, ds.netIdP);
            totalN += sumTrackLengthForNet(doc, ds.netIdN);
        }
        const delta = Math.abs(totalP - totalN);
        const midP = this.worldToScreenPt(ds.previewP, vp);
        ctx.fillStyle = 'rgba(10,14,22,0.8)';
        ctx.fillRect(midP.x + 6, midP.y - 34, 210, 52);
        ctx.fillStyle = '#88BBFF';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(`P ${totalP.toFixed(0)} mil`, midP.x + 12, midP.y - 18);
        ctx.fillStyle = '#FF88CC';
        ctx.fillText(`N ${totalN.toFixed(0)} mil`, midP.x + 12, midP.y - 4);
        ctx.fillStyle = delta > tol ? '#FF8888' : '#88FFAA';
        ctx.fillText(`ΔL ${delta.toFixed(0)}≤${tol}  gap ${ds.gap} 蛇形`, midP.x + 12, midP.y + 12);
    }
    /**
     * 真负片阻焊：evenodd 挖空开窗，保留下方铜箔（不用 destination-out，避免打穿铜层）
     */
    private drawMaskAndPasteLayers(ctx: CanvasRenderingContext2D, doc: PcbDocument, vp: import('common').ViewportState): void {
        const showFMask = isLayerVisible(doc, PcbLayerId.F_MASK);
        const showBMask = isLayerVisible(doc, PcbLayerId.B_MASK);
        const showFPaste = isLayerVisible(doc, PcbLayerId.F_PASTE);
        const showBPaste = isLayerVisible(doc, PcbLayerId.B_PASTE);
        if (!showFMask && !showBMask && !showFPaste && !showBPaste)
            return;
        const maskClear = 6 * vp.zoom;
        const pasteShrink = 2 * vp.zoom;
        const outline = doc.boardOutline.points;
        if (outline.length < 3)
            return;
        if (showFMask || showBMask) {
            const maskAlpha = getLayerOpacity(doc, showFMask ? PcbLayerId.F_MASK : PcbLayerId.B_MASK);
            ctx.beginPath();
            // 外轮廓（顺时针）
            const p0 = this.worldToScreenPt(outline[0], vp);
            ctx.moveTo(p0.x, p0.y);
            for (let i = 1; i < outline.length; i++) {
                const p = this.worldToScreenPt(outline[i], vp);
                ctx.lineTo(p.x, p.y);
            }
            ctx.closePath();
            // 开窗作为子路径（逆时针弧 → evenodd/nonzero 挖空）
            for (const fp of doc.footprints) {
                const topSide = fp.layer === PcbLayerId.F_CU;
                if ((topSide && !showFMask) || (!topSide && !showBMask))
                    continue;
                for (const pad of fp.pads) {
                    const pp = this.localToScreen(pad.pos, fp, vp);
                    const hw = Math.max(2, pad.size.x * vp.zoom / 2) + maskClear;
                    const hh = Math.max(2, pad.size.y * vp.zoom / 2) + maskClear;
                    if (pad.type === PcbPadType.TH || pad.type === PcbPadType.NPTH) {
                        const r = Math.max(hw, hh);
                        ctx.moveTo(pp.x + r, pp.y);
                        ctx.arc(pp.x, pp.y, r, 0, -Math.PI * 2, true);
                    }
                    else {
                        // 矩形孔：逆时针
                        ctx.moveTo(pp.x - hw, pp.y - hh);
                        ctx.lineTo(pp.x - hw, pp.y + hh);
                        ctx.lineTo(pp.x + hw, pp.y + hh);
                        ctx.lineTo(pp.x + hw, pp.y - hh);
                        ctx.closePath();
                    }
                }
            }
            for (const via of doc.vias) {
                const p = this.worldToScreenPt(via.position, vp);
                const r = Math.max(3, via.diameter * vp.zoom / 2) + maskClear;
                ctx.moveTo(p.x + r, p.y);
                ctx.arc(p.x, p.y, r, 0, -Math.PI * 2, true);
            }
            // 阻焊极淡，基板深绿为主；避免整板洗成芥末绿
            ctx.fillStyle = this.withAlpha('#0D4A28', Math.min(0.18, Math.max(0.08, maskAlpha * 0.35)));
            try {
                ctx.fill('evenodd');
            }
            catch (_e) {
                ctx.fill();
            }
            // 开窗描边默认关闭（满屏橙框）；仅高倍时极淡提示
            if (vp.zoom >= 1.2) {
                ctx.strokeStyle = 'rgba(255, 180, 80, 0.10)';
                ctx.lineWidth = 1;
                for (const fp of doc.footprints) {
                    const topSide = fp.layer === PcbLayerId.F_CU;
                    if ((topSide && !showFMask) || (!topSide && !showBMask))
                        continue;
                    for (const pad of fp.pads) {
                        const pp = this.localToScreen(pad.pos, fp, vp);
                        const hw = Math.max(2, pad.size.x * vp.zoom / 2) + maskClear;
                        const hh = Math.max(2, pad.size.y * vp.zoom / 2) + maskClear;
                        if (pad.type === PcbPadType.TH || pad.type === PcbPadType.NPTH) {
                            ctx.beginPath();
                            ctx.arc(pp.x, pp.y, Math.max(hw, hh), 0, Math.PI * 2);
                            ctx.stroke();
                        }
                        else {
                            this.strokeRoundRect(ctx, pp.x - hw, pp.y - hh, hw * 2, hh * 2, 2);
                        }
                    }
                }
            }
        }
        if (showFPaste || showBPaste) {
            this.drawPasteOpenings(ctx, doc, vp, showFPaste, showBPaste, pasteShrink);
        }
    }
    private drawPasteOpenings(ctx: CanvasRenderingContext2D, doc: PcbDocument, vp: import('common').ViewportState, showF: boolean, showB: boolean, pasteShrink: number): void {
        for (const fp of doc.footprints) {
            const topSide = fp.layer === PcbLayerId.F_CU;
            if ((topSide && !showF) || (!topSide && !showB))
                continue;
            for (const pad of fp.pads) {
                if (pad.type !== PcbPadType.SMD)
                    continue;
                const pp = this.localToScreen(pad.pos, fp, vp);
                const hw = Math.max(1.5, pad.size.x * vp.zoom / 2 - pasteShrink);
                const hh = Math.max(1.5, pad.size.y * vp.zoom / 2 - pasteShrink);
                this.fillRoundRect(ctx, pp.x - hw, pp.y - hh, hw * 2, hh * 2, 1.5, 'rgba(220, 220, 230, 0.78)');
                ctx.strokeStyle = 'rgba(255,255,255,0.75)';
                ctx.lineWidth = 1;
                this.strokeRoundRect(ctx, pp.x - hw, pp.y - hh, hw * 2, hh * 2, 1.5);
            }
        }
    }
    /** Courtyard 元件边界：灰色半透明虚线 */
    private drawCourtyardLayer(ctx: CanvasRenderingContext2D, doc: PcbDocument, vp: import('common').ViewportState): void {
        if (!isLayerVisible(doc, PcbLayerId.COURTYARD))
            return;
        const layerAlpha = getLayerOpacity(doc, PcbLayerId.COURTYARD);
        if (layerAlpha <= 0.03)
            return;
        const lib = getGlobalPcbFootprintLibrary();
        ctx.strokeStyle = this.withAlpha('#A0A0B0', 0.30 * layerAlpha);
        ctx.lineWidth = 1.0;
        ctx.setLineDash([5, 8]);
        for (const fp of doc.footprints) {
            if (fp.layer === PcbLayerId.B_CU)
                continue;
            if (!this.ptInView(fp.position, vp, 120))
                continue;
            const def = lib.getDef(fp.defId);
            if (def === null || def.courtyard.length < 3)
                continue;
            ctx.beginPath();
            const p0 = this.localToScreen(def.courtyard[0], fp, vp);
            ctx.moveTo(p0.x, p0.y);
            for (let i = 1; i < def.courtyard.length; i++) {
                const p = this.localToScreen(def.courtyard[i], fp, vp);
                ctx.lineTo(p.x, p.y);
            }
            ctx.closePath();
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }
    /** 视口裁剪：点是否在可见范围内 */
    private ptInView(w: Point2D, vp: import('common').ViewportState, margin: number): boolean {
        const m = Math.max(20, margin);
        const tl = this.getEditor().screenToWorld(0, 0);
        const br = this.getEditor().screenToWorld(this.viewWidth, this.viewHeight);
        const x1 = Math.min(tl.x, br.x) - m;
        const x2 = Math.max(tl.x, br.x) + m;
        const y1 = Math.min(tl.y, br.y) - m;
        const y2 = Math.max(tl.y, br.y) + m;
        return w.x >= x1 && w.x <= x2 && w.y >= y1 && w.y <= y2;
    }
    private segInView(a: Point2D, b: Point2D, vp: import('common').ViewportState, margin: number): boolean {
        if (this.ptInView(a, vp, margin) || this.ptInView(b, vp, margin))
            return true;
        const mid: Point2D = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        return this.ptInView(mid, vp, margin);
    }
    private drawSelectionRect(ctx: CanvasRenderingContext2D, vp: import('common').ViewportState): void {
        const s = this.selectRectStart;
        const e = this.selectRectCurrent;
        const sx = Math.min(s.x, e.x);
        const sy = Math.min(s.y, e.y);
        const sw = Math.abs(e.x - s.x);
        const sh = Math.abs(e.y - s.y);
        ctx.strokeStyle = PcbColors.SEL_RECT;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(sx, sy, sw, sh);
        ctx.fillStyle = PcbColors.SEL_RECT_FILL;
        ctx.fillRect(sx, sy, sw, sh);
        ctx.setLineDash([]);
    }
    private footprintScreenBBox(fp: PcbFootprintInst, def: import('common').PcbFootprintDef | null, vp: import('common').ViewportState): PcbScreenRect {
        let hw = 40;
        let hh = 30;
        if (def) {
            for (const pad of def.pads) {
                hw = Math.max(hw, Math.abs(pad.pos.x) + pad.size.x / 2);
                hh = Math.max(hh, Math.abs(pad.pos.y) + pad.size.y / 2);
            }
            if (def.courtyard.length >= 2) {
                for (const pt of def.courtyard) {
                    hw = Math.max(hw, Math.abs(pt.x));
                    hh = Math.max(hh, Math.abs(pt.y));
                }
            }
        }
        if (fp.rotation === 90 || fp.rotation === 270) {
            const t = hw;
            hw = hh;
            hh = t;
        }
        const origin = this.worldToScreenPt(fp.position, vp);
        const rect: PcbScreenRect = {
            x: origin.x - hw * vp.zoom,
            y: origin.y - hh * vp.zoom,
            w: hw * 2 * vp.zoom,
            h: hh * 2 * vp.zoom
        };
        return rect;
    }
    private worldToScreenPt(w: Point2D, vp: import('common').ViewportState): Point2D {
        return { x: w.x * vp.zoom + vp.panOffset.x, y: w.y * vp.zoom + vp.panOffset.y };
    }
    private localToScreen(local: Point2D, fp: PcbFootprintInst, vp: import('common').ViewportState): Point2D {
        let lx = local.x;
        let ly = local.y;
        if (fp.mirrored)
            lx = -lx;
        if (fp.rotation === 90) {
            const t = lx;
            lx = -ly;
            ly = t;
        }
        else if (fp.rotation === 180) {
            lx = -lx;
            ly = -ly;
        }
        else if (fp.rotation === 270) {
            const t = lx;
            lx = ly;
            ly = -t;
        }
        return this.worldToScreenPt({ x: fp.position.x + lx, y: fp.position.y + ly }, vp);
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Stack.create();
            Stack.width('100%');
            Stack.height('100%');
        }, Stack);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Canvas.create(this.context);
            Canvas.width('100%');
            Canvas.height('100%');
            Canvas.backgroundColor(PcbColors.CANVAS_BG);
            Canvas.onReady(() => { this.scheduleRedraw(); });
            Canvas.onAreaChange((_old, nv) => {
                this.viewWidth = nv.width as number;
                this.viewHeight = nv.height as number;
                this.getEditor().setCanvasSize(this.viewWidth, this.viewHeight);
                this.scheduleRedraw();
            });
            Canvas.onMouse((event: MouseEvent) => {
                if (this.isTouchActive)
                    return;
                if (event.action === MouseAction.Press) {
                    const isRight = event.button === MouseButton.Right;
                    const isMiddle = event.button === MouseButton.Middle;
                    this.handlePointerDown(event.x, event.y, isRight, isMiddle, (this.modifierKeys & 1) !== 0);
                }
                else if (event.action === MouseAction.Release) {
                    this.handlePointerUp(event.x, event.y);
                }
                else if (event.action === MouseAction.Move) {
                    this.handlePointerMove(event.x, event.y);
                }
                else if (event.action === MouseAction.Hover) {
                    this.handlePointerHover(event.x, event.y);
                }
            });
            Canvas.onAxisEvent((event: AxisEvent) => this.handleAxisZoom(event));
            Canvas.onKeyEvent((event: KeyEvent) => this.handleKeyEvent(event));
            globalThis.Gesture.create(GesturePriority.Low);
            PinchGesture.create();
            PinchGesture.onActionStart((event: GestureEvent) => {
                this.pinchStartZoom = this.getEditor().getViewport().zoom;
                this.pinchCenterX = event.pinchCenterX;
                this.pinchCenterY = event.pinchCenterY;
            });
            PinchGesture.onActionUpdate((event: GestureEvent) => {
                const editor = this.getEditor();
                const targetZoom = this.pinchStartZoom * event.scale;
                const factor = targetZoom / editor.getViewport().zoom;
                editor.zoomAt(factor, this.pinchCenterX, this.pinchCenterY);
                this.zoomPercent = Math.round(editor.getViewport().zoom * 100);
                this.scheduleRedraw();
            });
            PinchGesture.pop();
            globalThis.Gesture.pop();
            Canvas.onTouch((event: TouchEvent) => {
                this.isTouchActive = true;
                if (event.type === TouchType.Down && event.touches.length === 1) {
                    this.lastTouchX = event.touches[0].x;
                    this.lastTouchY = event.touches[0].y;
                    this.handlePointerDown(event.touches[0].x, event.touches[0].y, false, false, false);
                }
                else if (event.type === TouchType.Down && event.touches.length === 2) {
                    this.panning = true;
                }
                else if (event.type === TouchType.Move && event.touches.length === 1) {
                    this.lastTouchX = event.touches[0].x;
                    this.lastTouchY = event.touches[0].y;
                    this.handlePointerMove(event.touches[0].x, event.touches[0].y);
                }
                else if (event.type === TouchType.Up) {
                    const ux = event.touches.length > 0 ? event.touches[0].x : this.lastTouchX;
                    const uy = event.touches.length > 0 ? event.touches[0].y : this.lastTouchY;
                    this.handlePointerUp(ux, uy);
                    setTimeout(() => { this.isTouchActive = false; }, 300);
                }
            });
            Canvas.focusable(true);
        }, Canvas);
        Canvas.pop();
        Stack.pop();
    }
    // ═══════════════════════════════════════════════════
    //  Input handling
    // ═══════════════════════════════════════════════════
    private handle3dClick(sx: number, sy: number): void {
        const editor = this.getEditor();
        const doc = editor.getDocument();
        if (!doc)
            return;
        const ap = editor.getAppearance();
        const params = this.build3dViewParams();
        if (ap.view3dMeasure === true) {
            let yawDeg = ap.view3dYawDeg;
            let pitchDeg = ap.view3dPitchDeg;
            if (!(yawDeg >= -10000 && yawDeg <= 10000))
                yawDeg = 35;
            if (!(pitchDeg >= 8 && pitchDeg <= 88))
                pitchDeg = 55;
            const yaw = yawDeg * Math.PI / 180;
            const pitch = pitchDeg * Math.PI / 180;
            const c = boardCenter(doc);
            const zoom = Math.max(editor.getViewport().zoom, 0.05);
            const boardH = Math.max(42, Math.min(72, 52 * Math.min(zoom, 1.4) / Math.max(zoom, 0.6)));
            const ox = this.viewWidth / 2 + editor.getViewport().panOffset.x;
            const oy = this.viewHeight / 2 + editor.getViewport().panOffset.y;
            const wpt = unprojectBoardOrtho(sx, sy, c.x, c.y, yaw, pitch, zoom, ox, oy, boardH);
            if (this.measure3dPts.length >= 2) {
                this.measure3dPts = [];
            }
            const nextPts: Point2D[] = [];
            for (let mi = 0; mi < this.measure3dPts.length; mi++) {
                nextPts.push(this.measure3dPts[mi]);
            }
            nextPts.push(wpt);
            this.measure3dPts = nextPts;
            if (this.measure3dPts.length === 1) {
                this.onStatusChange('3D 测量：已取点 1，再点第二点');
            }
            else if (this.measure3dPts.length >= 2) {
                const d = dist3(this.measure3dPts[0], this.measure3dPts[1]);
                this.onStatusChange(`3D 测距 ${d.toFixed(1)} mil (${milToMm(d).toFixed(2)} mm)`);
            }
            this.scheduleRedraw();
            return;
        }
        const hit = Pcb3dRenderer.pick(doc, params, sx, sy);
        if (!hit) {
            editor.clearSelection();
            this.syncSelectionFromEditor();
            this.onStatusChange('3D：未选中对象');
            return;
        }
        if (hit.kind === 'footprint') {
            editor.selectFootprint(hit.id, false);
            this.onStatusChange(`3D 选中封装`);
        }
        else if (hit.kind === 'track') {
            editor.selectTrack(hit.id);
            this.onStatusChange(`3D 选中走线`);
        }
        else {
            editor.selectVia(hit.id);
            this.onStatusChange(`3D 选中过孔`);
        }
        this.syncSelectionFromEditor();
        tracePcb3d('PICK', `${hit.kind}:${hit.id}`);
    }
    private handlePointerDown(sx: number, sy: number, rightBtn: boolean, middleBtn: boolean, ctrlKey: boolean): void {
        this.pointerDown = true;
        this.mouseX = sx;
        this.mouseY = sy;
        const editor = this.getEditor();
        const world = editor.screenToWorld(sx, sy);
        const shiftKey = (this.modifierKeys & 2) !== 0;
        // ─── 3D 预览模式：旋转/平移/缩放；单击选中或测量 ───
        if (editor.getAppearance().show3d) {
            if (middleBtn || rightBtn || ctrlKey) {
                this.panning = true;
                this.orbiting3d = false;
                this.panLastX = sx;
                this.panLastY = sy;
                tracePcb3d('PAN_START', `at=${Math.round(sx)},${Math.round(sy)}`);
                return;
            }
            // 双击复位视角
            const now = Date.now();
            if (now - this.last3dClickMs < 350) {
                this.last3dClickMs = 0;
                this.pointerDown = false;
                editor.resetView3d();
                this.measure3dPts = [];
                this.onStatusChange('3D 视角已复位');
                this.scheduleRedraw();
                return;
            }
            this.last3dClickMs = now;
            this.orbiting3d = true;
            this.orbitMoved3d = false;
            this.orbitDownX = sx;
            this.orbitDownY = sy;
            this.panning = false;
            this.orbitLastX = sx;
            this.orbitLastY = sy;
            this.orbitLogAccYaw = 0;
            this.orbitLogAccPitch = 0;
            this.orbitLogLastMs = now;
            tracePcb3d('ORBIT_START', `yaw=${editor.getAppearance().view3dYawDeg.toFixed(1)} ` +
                `pitch=${editor.getAppearance().view3dPitchDeg.toFixed(1)}`);
            return;
        }
        // 右键提交多边形敷铜 / 板框（必须先于平移）
        if (rightBtn && this.toolMode === PcbToolMode.ZONE_POLY) {
            const z = editor.commitZonePoly();
            this.pointerDown = false;
            this.lastPolyClickMs = 0;
            this.lastPolyClickWorld = null;
            if (z) {
                this.onDocumentChanged();
                this.onStatusChange(`已创建多边形覆铜 ${z.netName}`);
            }
            else {
                editor.cancelZonePoly();
                this.onStatusChange('覆铜多边形已取消（至少 3 点）');
            }
            this.scheduleRedraw();
            return;
        }
        if (rightBtn && this.toolMode === PcbToolMode.OUTLINE) {
            const ok = editor.commitOutlineEdit();
            this.pointerDown = false;
            this.lastPolyClickMs = 0;
            this.lastPolyClickWorld = null;
            if (ok) {
                this.onDocumentChanged();
                this.onStatusChange('板框已更新');
            }
            else {
                editor.cancelOutlineEdit();
                this.onStatusChange('板框编辑取消（至少 3 点）');
            }
            this.scheduleRedraw();
            return;
        }
        // 中键，或右键(非走线/非多边形工具) → 平移
        if (middleBtn || (rightBtn && !editor.isRouteActive() &&
            this.toolMode !== PcbToolMode.ZONE_POLY && this.toolMode !== PcbToolMode.OUTLINE)) {
            this.panning = true;
            this.panLastX = sx;
            this.panLastY = sy;
            return;
        }
        // 右键在走线中 → 取消走线（含差分对）
        if (rightBtn) {
            if (editor.isDiffRouteActive()) {
                editor.cancelDiffRoute();
                this.pointerDown = false;
                this.scheduleRedraw();
                this.onStatusChange('差分对布线已取消');
                return;
            }
            if (editor.isRouteActive()) {
                editor.cancelRoute();
                this.pointerDown = false;
                this.scheduleRedraw();
                this.onStatusChange('走线已取消');
                return;
            }
        }
        // Ctrl+左键 → 平移
        if (ctrlKey) {
            this.panning = true;
            this.panLastX = sx;
            this.panLastY = sy;
            return;
        }
        // 走线模式（差分对优先）；已有起点则提交下一段
        if (this.toolMode === PcbToolMode.ROUTE) {
            if (editor.isDiffRouteActive()) {
                const result = editor.commitDiffRoute(world);
                if (result > 0) {
                    this.onDocumentChanged();
                    this.onStatusChange(`差分对已布线 (${result} 段) — 继续点击绘制下一段`);
                }
            }
            else if (editor.isRouteActive()) {
                const track = editor.commitRoute(world);
                if (track) {
                    this.onDocumentChanged();
                    this.onStatusChange('走线已添加 — 继续点击绘制下一段');
                }
                else if (editor.isRoutePreviewViolating()) {
                    this.onStatusChange('间距违规，无法提交');
                }
                else {
                    this.onStatusChange('走线过短或跨网络 — 继续移动');
                }
            }
            else {
                const snapped = editor.startRoute(world);
                this.lastSnapPoint = snapped;
                this.onStatusChange('点击终点绘制走线 — 右键取消');
                tracePcbOp('ROUTE_START', `at=${Math.round(snapped.x)},${Math.round(snapped.y)} layer=${editor.getActiveLayer()}`);
            }
            this.scheduleRedraw();
            return;
        }
        // 过孔模式
        if (this.toolMode === PcbToolMode.VIA) {
            const snapped = editor.snapToPadOrGrid(world);
            const net = editor.findNetAtPoint(snapped);
            const span = editor.getViaSpan();
            editor.addVia(snapped, net?.netId, net?.netName, editor.getViaKind(), span[0], span[1]);
            this.onDocumentChanged();
            this.onStatusChange(`过孔已放置 (${editor.getViaKind()})`);
            tracePcbOp('VIA_ADD', `at=${Math.round(snapped.x)},${Math.round(snapped.y)} kind=${editor.getViaKind()} ` +
                `net=${net?.netName ?? '(none)'}`);
            this.pointerDown = false;
            this.scheduleRedraw();
            return;
        }
        // 覆铜模式（整板 GND）
        if (this.toolMode === PcbToolMode.POUR) {
            const zoneHit = editor.hitTestZone(world.x, world.y);
            const sel = editor.getSelection();
            if (zoneHit && sel.zoneIds.includes(zoneHit.id)) {
                const half = Math.max(40, (editor.getDocument()?.metadata.gridSize ?? 5) * 8);
                editor.addZoneManualCutout(zoneHit.id, world, half);
                this.onDocumentChanged();
                this.onStatusChange('已添加覆铜挖空');
            }
            else if (zoneHit) {
                editor.selectZone(zoneHit.id);
                this.syncSelectionFromEditor();
                this.onStatusChange(`已选覆铜 ${zoneHit.netName} — 再点击添加挖空`);
            }
            else {
                const added = editor.addGroundPour();
                if (added) {
                    editor.selectZone(added.id);
                    this.syncSelectionFromEditor();
                    this.onDocumentChanged();
                    this.onStatusChange(`已添加 ${added.netName} 覆铜区`);
                }
                else {
                    this.onStatusChange('覆铜失败：需要板框与 GND 网络');
                }
            }
            this.pointerDown = false;
            this.scheduleRedraw();
            return;
        }
        // 多边形敷铜
        if (this.toolMode === PcbToolMode.ZONE_POLY) {
            if (this.tryCommitPolyDoubleClick(world, true)) {
                return;
            }
            if (editor.getZonePolyPreview().length === 0) {
                editor.beginZonePoly();
            }
            editor.addZonePolyPoint(world);
            this.rememberPolyClick(world);
            this.onStatusChange(`敷铜多边形 ${editor.getZonePolyPreview().length} 点 — 右键或双击提交`);
            this.pointerDown = false;
            this.scheduleRedraw();
            return;
        }
        // 板框编辑
        if (this.toolMode === PcbToolMode.OUTLINE) {
            if (this.tryCommitPolyDoubleClick(world, false)) {
                return;
            }
            if (editor.getOutlinePreview().length === 0) {
                editor.beginOutlineEdit();
            }
            editor.addOutlinePoint(world);
            this.rememberPolyClick(world);
            this.onStatusChange(`板框 ${editor.getOutlinePreview().length} 点 — 右键或双击提交`);
            this.pointerDown = false;
            this.scheduleRedraw();
            return;
        }
        // 测量
        if (this.toolMode === PcbToolMode.MEASURE) {
            const len = editor.setMeasurePoint(world);
            if (len > 0) {
                this.onStatusChange(`测量距离 ${len.toFixed(1)} mil`);
            }
            else {
                this.onStatusChange('测量：再点终点');
            }
            this.pointerDown = false;
            this.scheduleRedraw();
            return;
        }
        // 放置封装
        if (this.toolMode === PcbToolMode.PLACE_FP) {
            const fp = editor.placeFootprintAt(world);
            if (fp) {
                this.onDocumentChanged();
                this.onStatusChange(`已放置 ${fp.refDes}`);
            }
            else {
                this.onStatusChange('请先在右侧选择封装库条目');
            }
            this.pointerDown = false;
            this.scheduleRedraw();
            return;
        }
        // SELECT 模式 — 尝试命中
        editor.selectAt(world.x, world.y, shiftKey);
        const sel = editor.getSelection();
        const hasSelection = sel.footprintIds.length > 0 || sel.trackIds.length > 0 ||
            sel.viaIds.length > 0 || sel.zoneIds.length > 0;
        if (hasSelection) {
            this.syncSelectionFromEditor();
            this.dragLastWorld = { x: world.x, y: world.y };
            this.dragStartWorld = { x: world.x, y: world.y };
            this.draggingItems = true;
            editor.beginMoveOperation();
        }
        else {
            // 空处：开始框选
            this.selectingRect = true;
            this.selectRectStart = { x: sx, y: sy };
            this.selectRectCurrent = { x: sx, y: sy };
            this.dragStartScreen = { x: sx, y: sy };
        }
        this.scheduleRedraw();
    }
    private rememberPolyClick(world: Point2D): void {
        this.lastPolyClickMs = Date.now();
        this.lastPolyClickWorld = { x: world.x, y: world.y };
    }
    /** 双击提交多边形覆铜或板框；返回 true 表示已处理 */
    private tryCommitPolyDoubleClick(world: Point2D, isZone: boolean): boolean {
        const now = Date.now();
        const prev = this.lastPolyClickWorld;
        if (!prev || now - this.lastPolyClickMs > 400) {
            return false;
        }
        const dx = world.x - prev.x;
        const dy = world.y - prev.y;
        if (Math.sqrt(dx * dx + dy * dy) > 8) {
            return false;
        }
        const editor = this.getEditor();
        this.pointerDown = false;
        this.lastPolyClickMs = 0;
        this.lastPolyClickWorld = null;
        if (isZone) {
            const z = editor.commitZonePoly();
            if (z) {
                this.onDocumentChanged();
                this.onStatusChange(`已创建多边形覆铜 ${z.netName}`);
            }
            else {
                editor.cancelZonePoly();
                this.onStatusChange('覆铜多边形已取消（至少 3 点）');
            }
        }
        else {
            const ok = editor.commitOutlineEdit();
            if (ok) {
                this.onDocumentChanged();
                this.onStatusChange('板框已更新');
            }
            else {
                editor.cancelOutlineEdit();
                this.onStatusChange('板框编辑取消（至少 3 点）');
            }
        }
        this.scheduleRedraw();
        return true;
    }
    private handlePointerMove(sx: number, sy: number): void {
        this.mouseX = sx;
        this.mouseY = sy;
        const editor = this.getEditor();
        const world = editor.screenToWorld(sx, sy);
        this.worldMouseX = world.x;
        this.worldMouseY = world.y;
        // 3D 轨道旋转
        if (this.orbiting3d && this.pointerDown) {
            const dx = sx - this.orbitLastX;
            const dy = sy - this.orbitLastY;
            this.orbitLastX = sx;
            this.orbitLastY = sy;
            if (Math.abs(sx - this.orbitDownX) > 4 || Math.abs(sy - this.orbitDownY) > 4) {
                this.orbitMoved3d = true;
            }
            // 像素 → 角度：水平偏航、竖直俯仰
            const dYaw = dx * 0.35;
            const dPitch = dy * 0.35;
            editor.orbit3d(dYaw, dPitch);
            this.orbitLogAccYaw += dYaw;
            this.orbitLogAccPitch += dPitch;
            const now = Date.now();
            if (now - this.orbitLogLastMs > 400) {
                const ap = editor.getAppearance();
                tracePcb3d('ORBIT', `Δyaw=${this.orbitLogAccYaw.toFixed(1)} Δpitch=${this.orbitLogAccPitch.toFixed(1)} ` +
                    `→ yaw=${ap.view3dYawDeg.toFixed(1)} pitch=${ap.view3dPitchDeg.toFixed(1)}`);
                this.orbitLogAccYaw = 0;
                this.orbitLogAccPitch = 0;
                this.orbitLogLastMs = now;
            }
            this.scheduleRedraw();
            return;
        }
        // 平移
        if (this.panning && this.pointerDown) {
            editor.panBy(sx - this.panLastX, sy - this.panLastY);
            this.panLastX = sx;
            this.panLastY = sy;
            this.scheduleRedraw();
            return;
        }
        // 走线预览（差分对优先）
        if (this.toolMode === PcbToolMode.ROUTE) {
            if (editor.isDiffRouteActive()) {
                editor.previewDiffRoute(world);
                this.lastSnapPoint = editor.snapPoint(world);
            }
            else if (editor.isRouteActive()) {
                const snapped = editor.previewRoute(world);
                this.lastSnapPoint = snapped;
            }
            if (editor.isDiffRouteActive() || editor.isRouteActive()) {
                this.scheduleRedraw();
                return;
            }
        }
        // 拖拽移动
        if (this.pointerDown && this.draggingItems &&
            (this.toolMode === PcbToolMode.SELECT)) {
            const dx = world.x - this.dragLastWorld.x;
            const dy = world.y - this.dragLastWorld.y;
            if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) {
                editor.beginMoveOperation();
                editor.moveSelected(dx, dy);
                this.dragLastWorld = world;
                this.lastSnapPoint = editor.snapPoint(world);
                this.onDocumentChanged();
                this.scheduleRedraw();
            }
            return;
        }
        // 框选
        if (this.pointerDown && this.selectingRect) {
            this.selectRectCurrent = { x: sx, y: sy };
            this.scheduleRedraw();
            return;
        }
    }
    private handlePointerUp(sx: number, sy: number): void {
        const editor = this.getEditor();
        const world = editor.screenToWorld(sx, sy);
        if (editor.getAppearance().show3d) {
            if (this.orbiting3d && !this.orbitMoved3d) {
                this.handle3dClick(sx, sy);
            }
            else if (this.orbiting3d) {
                const ap = editor.getAppearance();
                tracePcb3d('ORBIT_END', `yaw=${ap.view3dYawDeg.toFixed(1)} pitch=${ap.view3dPitchDeg.toFixed(1)} ` +
                    `accΔ=${this.orbitLogAccYaw.toFixed(1)},${this.orbitLogAccPitch.toFixed(1)}`);
            }
            this.pointerDown = false;
            this.panning = false;
            this.orbiting3d = false;
            this.orbitMoved3d = false;
            this.scheduleRedraw();
            return;
        }
        // 走线提交：差分对与普通走线均在 pointerDown 提交，Up 仅收尾状态
        if (this.toolMode === PcbToolMode.ROUTE) {
            this.pointerDown = false;
            this.scheduleRedraw();
            return;
        }
        // 框选完成
        if (this.selectingRect && this.pointerDown) {
            const dx = Math.abs(sx - this.dragStartScreen.x);
            const dy = Math.abs(sy - this.dragStartScreen.y);
            if (dx > 3 || dy > 3) {
                const ws = editor.screenToWorld(this.selectRectStart.x, this.selectRectStart.y);
                const we = editor.screenToWorld(sx, sy);
                editor.selectRect(ws.x, ws.y, we.x, we.y, (this.modifierKeys & 2) !== 0);
                this.syncSelectionFromEditor();
            }
            this.selectingRect = false;
        }
        // 拖拽结束 — 如果几乎没移动，保留点击选择
        if (this.draggingItems) {
            const totalDx = world.x - this.dragStartWorld.x;
            const totalDy = world.y - this.dragStartWorld.y;
            if (Math.abs(totalDx) > 10 || Math.abs(totalDy) > 10) {
                this.onDocumentChanged();
            }
            editor.endMoveOperation();
        }
        this.pointerDown = false;
        this.panning = false;
        this.orbiting3d = false;
        this.draggingItems = false;
        this.lastSnapPoint = null;
        this.scheduleRedraw();
    }
    private handlePointerHover(sx: number, sy: number): void {
        if (this.pointerDown)
            return;
        this.mouseX = sx;
        this.mouseY = sy;
        const editor = this.getEditor();
        const world = editor.screenToWorld(sx, sy);
        this.worldMouseX = world.x;
        this.worldMouseY = world.y;
        editor.setHoverWorld(world);
        this.onHoverNetChange(editor.getHoverNetName());
    }
    private handleKeyEvent(event: KeyEvent): void {
        if (event.type === KeyType.Down) {
            if (event.keyCode === 2021 || event.keyCode === 2022) {
                this.modifierKeys |= 1;
                return;
            }
            // Shift Left/Right
            if (event.keyCode === 2047 || event.keyCode === 2048 || event.keyCode === 16) {
                this.modifierKeys |= 2;
                return;
            }
        }
        if (event.type === KeyType.Up) {
            if (event.keyCode === 2021 || event.keyCode === 2022) {
                this.modifierKeys &= ~1;
                return;
            }
            if (event.keyCode === 2047 || event.keyCode === 2048 || event.keyCode === 16) {
                this.modifierKeys &= ~2;
                return;
            }
        }
        if (event.type !== KeyType.Down) {
            return;
        }
        const ctrl = (this.modifierKeys & 1) !== 0;
        const kt = (event.keyText ?? '').toLowerCase();
        const editor = this.getEditor();
        if (ctrl) {
            if (kt === 'z') {
                editor.undo();
                this.onStatusChange('撤销');
                this.syncSelectionFromEditor();
                this.onDocumentChanged();
                this.scheduleRedraw();
                return;
            }
            if (kt === 'y') {
                editor.redo();
                this.onStatusChange('重做');
                this.syncSelectionFromEditor();
                this.onDocumentChanged();
                this.scheduleRedraw();
                return;
            }
            if (kt === 'c') {
                const ok = editor.copySelected();
                this.onStatusChange(ok ? '已复制' : '无选中对象');
                return;
            }
            if (kt === 'v') {
                const count = editor.pasteClipboard();
                this.onStatusChange(count > 0 ? `已粘贴 ${count} 个` : '剪贴板为空');
                this.onDocumentChanged();
                this.scheduleRedraw();
                return;
            }
            if (kt === 'a' && editor.getDocument()) {
                editor.selectRect(-99999, -99999, 99999, 99999, false);
                this.syncSelectionFromEditor();
                this.onStatusChange('全选');
                this.scheduleRedraw();
                return;
            }
        }
        if (kt === 'escape' || event.keyCode === 27) {
            if (editor.isDiffRouteActive()) {
                editor.cancelDiffRoute();
                this.onStatusChange('差分对布线已取消');
                this.scheduleRedraw();
                return;
            }
            if (editor.isRouteActive()) {
                editor.cancelRoute();
                this.onStatusChange('走线已取消');
                this.scheduleRedraw();
                return;
            }
            if (editor.getZonePolyPreview().length > 0) {
                editor.cancelZonePoly();
                this.onStatusChange('敷铜多边形已取消');
                this.scheduleRedraw();
                return;
            }
            if (editor.getOutlinePreview().length > 0) {
                editor.cancelOutlineEdit();
                this.onStatusChange('板框编辑已取消');
                this.scheduleRedraw();
                return;
            }
            editor.clearSelection();
            editor.clearMeasure();
            this.syncSelectionFromEditor();
            this.scheduleRedraw();
            return;
        }
        // 工具快捷键（非 Ctrl）
        if (!ctrl) {
            if (kt === 's') {
                this.onToolModeRequest(PcbToolMode.SELECT);
                this.onStatusChange('工具: 选择');
                return;
            }
            if (kt === 'x') {
                this.onToolModeRequest(PcbToolMode.ROUTE);
                this.onStatusChange('工具: 走线');
                return;
            }
            if (kt === 'z') {
                this.onToolModeRequest(PcbToolMode.ZONE_POLY);
                this.onStatusChange('工具: 多边形覆铜');
                return;
            }
            if (kt === 'o') {
                this.onToolModeRequest(PcbToolMode.OUTLINE);
                this.onStatusChange('工具: 板框');
                return;
            }
            if (kt === 'm') {
                this.onToolModeRequest(PcbToolMode.MEASURE);
                this.onStatusChange('工具: 测量');
                return;
            }
            if (kt === 'p') {
                this.onToolModeRequest(PcbToolMode.PLACE_FP);
                this.onStatusChange('工具: 放置封装');
                return;
            }
        }
        // 布线中按 V 切换到对面铜层并插过孔；非布线时切过孔工具
        if (kt === 'v' && !ctrl) {
            if (this.toolMode === PcbToolMode.ROUTE && editor.isRouteActive()) {
                const cur = editor.getActiveLayer();
                const next = cur === PcbLayerId.F_CU ? PcbLayerId.B_CU : PcbLayerId.F_CU;
                editor.switchRouteLayer(next);
                this.onActiveLayerChange(next);
                this.onDocumentChanged();
                this.onStatusChange(`已换层 ${next}（自动过孔）`);
                this.scheduleRedraw();
                return;
            }
            this.onToolModeRequest(PcbToolMode.VIA);
            this.onStatusChange('工具: 过孔');
            return;
        }
        // 按 D 启动/取消差分对布线模式
        if (kt === 'd' && this.toolMode === PcbToolMode.ROUTE) {
            if (editor.isDiffRouteActive()) {
                editor.cancelDiffRoute();
                this.onStatusChange('差分对布线已取消');
            }
            else {
                const world = editor.screenToWorld(this.mouseX, this.mouseY);
                const result = editor.startDiffRoute(world);
                if (result) {
                    this.onStatusChange('差分对布线模式 — 点击终点绘制');
                }
                else {
                    this.onStatusChange('未检测到差分对网络');
                }
            }
            this.scheduleRedraw();
            return;
        }
        if (kt === 'delete' || event.keyCode === 46 || event.keyCode === 8) {
            editor.deleteSelected();
            this.syncSelectionFromEditor();
            this.onDocumentChanged();
            this.onStatusChange('已删除');
            this.scheduleRedraw();
            return;
        }
        if (kt === 'r') {
            editor.rotateSelected(true);
            this.syncSelectionFromEditor();
            this.onDocumentChanged();
            this.onStatusChange('已旋转');
            this.scheduleRedraw();
            return;
        }
        if (kt === 'f' && !ctrl) {
            if (editor.getSelection().footprintIds.length > 0) {
                editor.flipSelected();
                this.onDocumentChanged();
                this.onStatusChange('已镜像翻转');
                this.scheduleRedraw();
                return;
            }
            editor.fitBoardInView();
            this.zoomPercent = Math.round(editor.getViewport().zoom * 100);
            this.onStatusChange('适应窗口');
            this.scheduleRedraw();
        }
    }
    /** 滚轮：以鼠标位置为中心缩放 */
    private handleAxisZoom(event: AxisEvent): void {
        const v = event.getVerticalAxisValue();
        if (v === 0)
            return;
        const factor = v < 0 ? 1.12 : (1 / 1.12);
        this.getEditor().zoomAt(factor, event.x, event.y);
        this.zoomPercent = Math.round(this.getEditor().getViewport().zoom * 100);
        this.scheduleRedraw();
    }
    private syncSelectionFromEditor(): void {
        const sel = this.getEditor().getSelection();
        this.selectedFootprintId = sel.footprintIds.length > 0 ? sel.footprintIds[0] : '';
        this.selectedTrackId = sel.trackIds.length > 0 ? sel.trackIds[0] : '';
        this.selectedViaId = sel.viaIds.length > 0 ? sel.viaIds[0] : '';
        this.selectedZoneId = sel.zoneIds.length > 0 ? sel.zoneIds[0] : '';
        if (sel.footprintIds.length === 0 && sel.trackIds.length === 0 &&
            sel.viaIds.length === 0 && sel.zoneIds.length === 0) {
            this.onSelectionCleared();
        }
    }
    rerender() {
        this.updateDirtyElements();
    }
}
// ── Helpers ──
function isLayerVisible(doc: PcbDocument, layer: PcbLayerId): boolean {
    for (const l of doc.layers) {
        if (l.id === layer)
            return l.visible;
    }
    return true;
}
function viaLayerHas(layers: PcbLayerId[], layer: PcbLayerId): boolean {
    for (const l of layers) {
        if (l === layer)
            return true;
    }
    return false;
}
function getLayerColor(doc: PcbDocument, layer: PcbLayerId): string {
    for (const l of doc.layers) {
        if (l.id === layer)
            return l.color;
    }
    if (layer === PcbLayerId.B_CU)
        return '#00E676';
    if (layer === PcbLayerId.IN1_CU)
        return '#D500F9';
    if (layer === PcbLayerId.IN2_CU)
        return '#FF9100';
    if (layer === PcbLayerId.IN3_CU)
        return '#651FFF';
    if (layer === PcbLayerId.IN4_CU)
        return '#00E5FF';
    if (layer === PcbLayerId.IN5_CU)
        return '#FFD740';
    if (layer === PcbLayerId.IN6_CU)
        return '#69F0AE';
    return '#FF1744';
}
function getLayerOpacity(doc: PcbDocument, layer: PcbLayerId): number {
    for (const l of doc.layers) {
        if (l.id === layer) {
            const op = l.opacity;
            if (op !== undefined && op > 0 && op <= 1)
                return op;
            return 1;
        }
    }
    return layer === PcbLayerId.B_CU ? 0.78 : 0.92;
}
interface SpokeRect {
    x: number;
    y: number;
    w: number;
    h: number;
}
function makeSpoke(center: Point2D, dx: number, dy: number, w: number, h: number): SpokeRect {
    return { x: center.x + dx, y: center.y + dy, w, h };
}
/** 兼容保留 */
function routeLPoints(a: Point2D, b: Point2D): Point2D[] {
    return routeByCornerMode(a, b, 'ortho45');
}
