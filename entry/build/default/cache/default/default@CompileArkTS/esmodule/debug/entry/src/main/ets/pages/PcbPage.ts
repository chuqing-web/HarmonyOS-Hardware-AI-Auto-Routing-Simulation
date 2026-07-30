if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface PcbPage_Params {
    themeRev?: number;
    projectName?: string;
    statusMessage?: string;
    canvasVersion?: number;
    gerberDocRev?: number;
    selectedFootprintId?: string;
    selectedTrackId?: string;
    selectedViaId?: string;
    selectedZoneId?: string;
    selectedZoneCount?: number;
    selectedFootprintInfo?: string;
    mouseX?: number;
    mouseY?: number;
    worldMouseX?: number;
    worldMouseY?: number;
    zoomPercent?: number;
    toolMode?: PcbToolMode;
    gridVisible?: boolean;
    leftPanelWidth?: number;
    rightPanelWidth?: number;
    drcViolations?: PcbDrcViolation[];
    layerRows?: PcbLayerRow[];
    appInitialized?: boolean;
    unsavedChanges?: boolean;
    routeResetKey?: number;
    activeLayer?: PcbLayerId;
    hoverNetName?: string;
    selectedFpDefId?: string;
    copperCount?: number;
    stackLayers?: PcbStackLayer[];
    viaKind?: PcbViaKind;
    routeCornerMode?: PcbRouteCornerMode;
    viaFrom?: PcbLayerId;
    viaTo?: PcbLayerId;
    copperLayerIds?: PcbLayerId[];
    pageModifierKeys?: number;
    userProjectDir?: string;
    appService?: AppService;
    onSelectionChanged?;
    onPcbChanged?;
    onViewportChanged?;
}
import { AppService } from "@bundle:com.elecdraw.aischsim/entry/ets/services/AppService";
import { PcbCanvas } from "@bundle:com.elecdraw.aischsim/entry/ets/components/PcbCanvas";
import { PcbLayerPanel } from "@bundle:com.elecdraw.aischsim/entry/ets/components/pcb/PcbLayerPanel";
import type { PcbLayerRow } from "@bundle:com.elecdraw.aischsim/entry/ets/components/pcb/PcbLayerPanel";
import { PcbVerticalToolbar } from "@bundle:com.elecdraw.aischsim/entry/ets/components/pcb/PcbVerticalToolbar";
import { PcbRightPanel } from "@bundle:com.elecdraw.aischsim/entry/ets/components/pcb/PcbRightPanel";
import { PcbStatusBar } from "@bundle:com.elecdraw.aischsim/entry/ets/components/pcb/PcbStatusBar";
import { ProteusResizer, ProteusMenuTrigger, ProteusToolButton, ProteusToolGroup } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import type { ProteusMenuEntry } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import { ProteusIcon, ProteusIconName } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusIcons";
import { ProteusColors, ProteusDimens, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import { PROTEUS_THEME_REV_KEY } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ThemeManager";
import { PcbLayerId, EventBus, ModuleEvent, exportPcbGerber, exportPcbKiCad, createEmptyPcbDocument, normalizePcbDocument, isCopperLayer, PcbAppearanceMode, Pcb3dDisplayMode, PcbViaKind, PcbRouteCornerMode, copperLayersFromStack, tracePcbUi, tracePcbOp, tracePcb3d, tracePcbDisplayDump } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { PcbDrcViolation, ModuleEventPayload, PcbEditorSelectionData, PcbStackLayer, PcbCanvasTraceSnapshot, PcbView2dTraceParams, PcbView3dTraceParams } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { PcbToolMode } from "@bundle:com.elecdraw.aischsim/entry@pcb_editor/Index";
import type { PcbEditorImpl } from "@bundle:com.elecdraw.aischsim/entry@pcb_editor/Index";
import type { SchematicEditorImpl } from 'schematic_editor';
import type { BusinessError } from "@ohos:base";
import type common from "@ohos:app.ability.common";
import picker from "@ohos:file.picker";
import fileUri from "@ohos:file.fileuri";
import fs from "@ohos:file.fs";
import util from "@ohos:util";
import { maximizeAppWindow } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/WindowLaunchUtil";
import { ProjectPaths } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/ProjectPaths";
import { exportPcbSimpleStep } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/Pcb3dSceneUtil";
import { Pcb3dRenderer } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/Pcb3dRenderer";
import { importStepAndBind } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/PcbStepImporter";
interface PcbLaunchParams {
    launchMode?: string;
    projectPath?: string;
    projectName?: string;
}
class PcbPage extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__projectName = new ObservedPropertySimplePU('Untitled', this, "projectName");
        this.__statusMessage = new ObservedPropertySimplePU('', this, "statusMessage");
        this.__canvasVersion = new ObservedPropertySimplePU(0, this, "canvasVersion");
        this.__gerberDocRev = new ObservedPropertySimplePU(0, this, "gerberDocRev");
        this.__selectedFootprintId = new ObservedPropertySimplePU('', this, "selectedFootprintId");
        this.__selectedTrackId = new ObservedPropertySimplePU('', this, "selectedTrackId");
        this.__selectedViaId = new ObservedPropertySimplePU('', this, "selectedViaId");
        this.__selectedZoneId = new ObservedPropertySimplePU('', this, "selectedZoneId");
        this.__selectedZoneCount = new ObservedPropertySimplePU(0, this, "selectedZoneCount");
        this.__selectedFootprintInfo = new ObservedPropertySimplePU('', this, "selectedFootprintInfo");
        this.__mouseX = new ObservedPropertySimplePU(0, this, "mouseX");
        this.__mouseY = new ObservedPropertySimplePU(0, this, "mouseY");
        this.__worldMouseX = new ObservedPropertySimplePU(0, this, "worldMouseX");
        this.__worldMouseY = new ObservedPropertySimplePU(0, this, "worldMouseY");
        this.__zoomPercent = new ObservedPropertySimplePU(15, this, "zoomPercent");
        this.__toolMode = new ObservedPropertySimplePU(PcbToolMode.SELECT, this, "toolMode");
        this.__gridVisible = new ObservedPropertySimplePU(true, this, "gridVisible");
        this.__leftPanelWidth = new ObservedPropertySimplePU(180, this, "leftPanelWidth");
        this.__rightPanelWidth = new ObservedPropertySimplePU(260, this, "rightPanelWidth");
        this.__drcViolations = new ObservedPropertyObjectPU([], this, "drcViolations");
        this.__layerRows = new ObservedPropertyObjectPU([], this, "layerRows");
        this.__appInitialized = new ObservedPropertySimplePU(false, this, "appInitialized");
        this.__unsavedChanges = new ObservedPropertySimplePU(false, this, "unsavedChanges");
        this.__routeResetKey = new ObservedPropertySimplePU(0, this, "routeResetKey");
        this.__activeLayer = new ObservedPropertySimplePU(PcbLayerId.F_CU, this, "activeLayer");
        this.__hoverNetName = new ObservedPropertySimplePU('', this, "hoverNetName");
        this.__selectedFpDefId = new ObservedPropertySimplePU('', this, "selectedFpDefId");
        this.__copperCount = new ObservedPropertySimplePU(2, this, "copperCount");
        this.__stackLayers = new ObservedPropertyObjectPU([], this, "stackLayers");
        this.__viaKind = new ObservedPropertySimplePU(PcbViaKind.THROUGH, this, "viaKind");
        this.__routeCornerMode = new ObservedPropertySimplePU(PcbRouteCornerMode.ORTHO45, this, "routeCornerMode");
        this.__viaFrom = new ObservedPropertySimplePU(PcbLayerId.F_CU, this, "viaFrom");
        this.__viaTo = new ObservedPropertySimplePU(PcbLayerId.B_CU, this, "viaTo");
        this.__copperLayerIds = new ObservedPropertyObjectPU([PcbLayerId.F_CU, PcbLayerId.B_CU], this, "copperLayerIds");
        this.pageModifierKeys = 0;
        this.userProjectDir = '';
        this.appService = AppService.getInstance();
        this.onSelectionChanged = (payload: ModuleEventPayload): void => {
            if (payload.source !== 'pcb_editor') {
                return;
            }
            if (Array.isArray(payload.data)) {
                const ids = payload.data as string[];
                this.selectedFootprintId = ids.length > 0 ? ids[0] : '';
                this.selectedTrackId = '';
                this.selectedViaId = '';
                this.selectedZoneId = '';
                this.selectedZoneCount = 0;
            }
            else {
                const sel = payload.data as PcbEditorSelectionData;
                if (sel.footprintIds !== undefined && sel.trackIds !== undefined) {
                    this.selectedFootprintId = sel.footprintIds.length > 0 ? sel.footprintIds[0] : '';
                    this.selectedTrackId = sel.trackIds.length > 0 ? sel.trackIds[0] : '';
                    this.selectedViaId = sel.viaIds !== undefined && sel.viaIds.length > 0 ? sel.viaIds[0] : '';
                    this.selectedZoneId = sel.zoneIds !== undefined && sel.zoneIds.length > 0 ? sel.zoneIds[0] : '';
                    this.selectedZoneCount = sel.zoneIds !== undefined ? sel.zoneIds.length : 0;
                }
                else {
                    this.selectedFootprintId = '';
                    this.selectedTrackId = '';
                    this.selectedViaId = '';
                    this.selectedZoneId = '';
                    this.selectedZoneCount = 0;
                }
            }
            this.refreshSelectedInfo();
            this.canvasVersion++;
        };
        this.onPcbChanged = (_p: ModuleEventPayload): void => {
            this.unsavedChanges = true;
            this.refreshLayers();
        };
        this.onViewportChanged = (_p: ModuleEventPayload): void => {
            this.zoomPercent = Math.round(this.getEditor().getViewport().zoom * 100);
        };
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: PcbPage_Params) {
        if (params.projectName !== undefined) {
            this.projectName = params.projectName;
        }
        if (params.statusMessage !== undefined) {
            this.statusMessage = params.statusMessage;
        }
        if (params.canvasVersion !== undefined) {
            this.canvasVersion = params.canvasVersion;
        }
        if (params.gerberDocRev !== undefined) {
            this.gerberDocRev = params.gerberDocRev;
        }
        if (params.selectedFootprintId !== undefined) {
            this.selectedFootprintId = params.selectedFootprintId;
        }
        if (params.selectedTrackId !== undefined) {
            this.selectedTrackId = params.selectedTrackId;
        }
        if (params.selectedViaId !== undefined) {
            this.selectedViaId = params.selectedViaId;
        }
        if (params.selectedZoneId !== undefined) {
            this.selectedZoneId = params.selectedZoneId;
        }
        if (params.selectedZoneCount !== undefined) {
            this.selectedZoneCount = params.selectedZoneCount;
        }
        if (params.selectedFootprintInfo !== undefined) {
            this.selectedFootprintInfo = params.selectedFootprintInfo;
        }
        if (params.mouseX !== undefined) {
            this.mouseX = params.mouseX;
        }
        if (params.mouseY !== undefined) {
            this.mouseY = params.mouseY;
        }
        if (params.worldMouseX !== undefined) {
            this.worldMouseX = params.worldMouseX;
        }
        if (params.worldMouseY !== undefined) {
            this.worldMouseY = params.worldMouseY;
        }
        if (params.zoomPercent !== undefined) {
            this.zoomPercent = params.zoomPercent;
        }
        if (params.toolMode !== undefined) {
            this.toolMode = params.toolMode;
        }
        if (params.gridVisible !== undefined) {
            this.gridVisible = params.gridVisible;
        }
        if (params.leftPanelWidth !== undefined) {
            this.leftPanelWidth = params.leftPanelWidth;
        }
        if (params.rightPanelWidth !== undefined) {
            this.rightPanelWidth = params.rightPanelWidth;
        }
        if (params.drcViolations !== undefined) {
            this.drcViolations = params.drcViolations;
        }
        if (params.layerRows !== undefined) {
            this.layerRows = params.layerRows;
        }
        if (params.appInitialized !== undefined) {
            this.appInitialized = params.appInitialized;
        }
        if (params.unsavedChanges !== undefined) {
            this.unsavedChanges = params.unsavedChanges;
        }
        if (params.routeResetKey !== undefined) {
            this.routeResetKey = params.routeResetKey;
        }
        if (params.activeLayer !== undefined) {
            this.activeLayer = params.activeLayer;
        }
        if (params.hoverNetName !== undefined) {
            this.hoverNetName = params.hoverNetName;
        }
        if (params.selectedFpDefId !== undefined) {
            this.selectedFpDefId = params.selectedFpDefId;
        }
        if (params.copperCount !== undefined) {
            this.copperCount = params.copperCount;
        }
        if (params.stackLayers !== undefined) {
            this.stackLayers = params.stackLayers;
        }
        if (params.viaKind !== undefined) {
            this.viaKind = params.viaKind;
        }
        if (params.routeCornerMode !== undefined) {
            this.routeCornerMode = params.routeCornerMode;
        }
        if (params.viaFrom !== undefined) {
            this.viaFrom = params.viaFrom;
        }
        if (params.viaTo !== undefined) {
            this.viaTo = params.viaTo;
        }
        if (params.copperLayerIds !== undefined) {
            this.copperLayerIds = params.copperLayerIds;
        }
        if (params.pageModifierKeys !== undefined) {
            this.pageModifierKeys = params.pageModifierKeys;
        }
        if (params.userProjectDir !== undefined) {
            this.userProjectDir = params.userProjectDir;
        }
        if (params.appService !== undefined) {
            this.appService = params.appService;
        }
        if (params.onSelectionChanged !== undefined) {
            this.onSelectionChanged = params.onSelectionChanged;
        }
        if (params.onPcbChanged !== undefined) {
            this.onPcbChanged = params.onPcbChanged;
        }
        if (params.onViewportChanged !== undefined) {
            this.onViewportChanged = params.onViewportChanged;
        }
    }
    updateStateVars(params: PcbPage_Params) {
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__projectName.purgeDependencyOnElmtId(rmElmtId);
        this.__statusMessage.purgeDependencyOnElmtId(rmElmtId);
        this.__canvasVersion.purgeDependencyOnElmtId(rmElmtId);
        this.__gerberDocRev.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedFootprintId.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedTrackId.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedViaId.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedZoneId.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedZoneCount.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedFootprintInfo.purgeDependencyOnElmtId(rmElmtId);
        this.__mouseX.purgeDependencyOnElmtId(rmElmtId);
        this.__mouseY.purgeDependencyOnElmtId(rmElmtId);
        this.__worldMouseX.purgeDependencyOnElmtId(rmElmtId);
        this.__worldMouseY.purgeDependencyOnElmtId(rmElmtId);
        this.__zoomPercent.purgeDependencyOnElmtId(rmElmtId);
        this.__toolMode.purgeDependencyOnElmtId(rmElmtId);
        this.__gridVisible.purgeDependencyOnElmtId(rmElmtId);
        this.__leftPanelWidth.purgeDependencyOnElmtId(rmElmtId);
        this.__rightPanelWidth.purgeDependencyOnElmtId(rmElmtId);
        this.__drcViolations.purgeDependencyOnElmtId(rmElmtId);
        this.__layerRows.purgeDependencyOnElmtId(rmElmtId);
        this.__appInitialized.purgeDependencyOnElmtId(rmElmtId);
        this.__unsavedChanges.purgeDependencyOnElmtId(rmElmtId);
        this.__routeResetKey.purgeDependencyOnElmtId(rmElmtId);
        this.__activeLayer.purgeDependencyOnElmtId(rmElmtId);
        this.__hoverNetName.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedFpDefId.purgeDependencyOnElmtId(rmElmtId);
        this.__copperCount.purgeDependencyOnElmtId(rmElmtId);
        this.__stackLayers.purgeDependencyOnElmtId(rmElmtId);
        this.__viaKind.purgeDependencyOnElmtId(rmElmtId);
        this.__routeCornerMode.purgeDependencyOnElmtId(rmElmtId);
        this.__viaFrom.purgeDependencyOnElmtId(rmElmtId);
        this.__viaTo.purgeDependencyOnElmtId(rmElmtId);
        this.__copperLayerIds.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__projectName.aboutToBeDeleted();
        this.__statusMessage.aboutToBeDeleted();
        this.__canvasVersion.aboutToBeDeleted();
        this.__gerberDocRev.aboutToBeDeleted();
        this.__selectedFootprintId.aboutToBeDeleted();
        this.__selectedTrackId.aboutToBeDeleted();
        this.__selectedViaId.aboutToBeDeleted();
        this.__selectedZoneId.aboutToBeDeleted();
        this.__selectedZoneCount.aboutToBeDeleted();
        this.__selectedFootprintInfo.aboutToBeDeleted();
        this.__mouseX.aboutToBeDeleted();
        this.__mouseY.aboutToBeDeleted();
        this.__worldMouseX.aboutToBeDeleted();
        this.__worldMouseY.aboutToBeDeleted();
        this.__zoomPercent.aboutToBeDeleted();
        this.__toolMode.aboutToBeDeleted();
        this.__gridVisible.aboutToBeDeleted();
        this.__leftPanelWidth.aboutToBeDeleted();
        this.__rightPanelWidth.aboutToBeDeleted();
        this.__drcViolations.aboutToBeDeleted();
        this.__layerRows.aboutToBeDeleted();
        this.__appInitialized.aboutToBeDeleted();
        this.__unsavedChanges.aboutToBeDeleted();
        this.__routeResetKey.aboutToBeDeleted();
        this.__activeLayer.aboutToBeDeleted();
        this.__hoverNetName.aboutToBeDeleted();
        this.__selectedFpDefId.aboutToBeDeleted();
        this.__copperCount.aboutToBeDeleted();
        this.__stackLayers.aboutToBeDeleted();
        this.__viaKind.aboutToBeDeleted();
        this.__routeCornerMode.aboutToBeDeleted();
        this.__viaFrom.aboutToBeDeleted();
        this.__viaTo.aboutToBeDeleted();
        this.__copperLayerIds.aboutToBeDeleted();
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
    private __projectName: ObservedPropertySimplePU<string>;
    get projectName() {
        return this.__projectName.get();
    }
    set projectName(newValue: string) {
        this.__projectName.set(newValue);
    }
    private __statusMessage: ObservedPropertySimplePU<string>;
    get statusMessage() {
        return this.__statusMessage.get();
    }
    set statusMessage(newValue: string) {
        this.__statusMessage.set(newValue);
    }
    private __canvasVersion: ObservedPropertySimplePU<number>;
    get canvasVersion() {
        return this.__canvasVersion.get();
    }
    set canvasVersion(newValue: number) {
        this.__canvasVersion.set(newValue);
    }
    private __gerberDocRev: ObservedPropertySimplePU<number>;
    get gerberDocRev() {
        return this.__gerberDocRev.get();
    }
    set gerberDocRev(newValue: number) {
        this.__gerberDocRev.set(newValue);
    }
    private __selectedFootprintId: ObservedPropertySimplePU<string>;
    get selectedFootprintId() {
        return this.__selectedFootprintId.get();
    }
    set selectedFootprintId(newValue: string) {
        this.__selectedFootprintId.set(newValue);
    }
    private __selectedTrackId: ObservedPropertySimplePU<string>;
    get selectedTrackId() {
        return this.__selectedTrackId.get();
    }
    set selectedTrackId(newValue: string) {
        this.__selectedTrackId.set(newValue);
    }
    private __selectedViaId: ObservedPropertySimplePU<string>;
    get selectedViaId() {
        return this.__selectedViaId.get();
    }
    set selectedViaId(newValue: string) {
        this.__selectedViaId.set(newValue);
    }
    private __selectedZoneId: ObservedPropertySimplePU<string>;
    get selectedZoneId() {
        return this.__selectedZoneId.get();
    }
    set selectedZoneId(newValue: string) {
        this.__selectedZoneId.set(newValue);
    }
    private __selectedZoneCount: ObservedPropertySimplePU<number>;
    get selectedZoneCount() {
        return this.__selectedZoneCount.get();
    }
    set selectedZoneCount(newValue: number) {
        this.__selectedZoneCount.set(newValue);
    }
    private __selectedFootprintInfo: ObservedPropertySimplePU<string>;
    get selectedFootprintInfo() {
        return this.__selectedFootprintInfo.get();
    }
    set selectedFootprintInfo(newValue: string) {
        this.__selectedFootprintInfo.set(newValue);
    }
    private __mouseX: ObservedPropertySimplePU<number>;
    get mouseX() {
        return this.__mouseX.get();
    }
    set mouseX(newValue: number) {
        this.__mouseX.set(newValue);
    }
    private __mouseY: ObservedPropertySimplePU<number>;
    get mouseY() {
        return this.__mouseY.get();
    }
    set mouseY(newValue: number) {
        this.__mouseY.set(newValue);
    }
    private __worldMouseX: ObservedPropertySimplePU<number>;
    get worldMouseX() {
        return this.__worldMouseX.get();
    }
    set worldMouseX(newValue: number) {
        this.__worldMouseX.set(newValue);
    }
    private __worldMouseY: ObservedPropertySimplePU<number>;
    get worldMouseY() {
        return this.__worldMouseY.get();
    }
    set worldMouseY(newValue: number) {
        this.__worldMouseY.set(newValue);
    }
    private __zoomPercent: ObservedPropertySimplePU<number>;
    get zoomPercent() {
        return this.__zoomPercent.get();
    }
    set zoomPercent(newValue: number) {
        this.__zoomPercent.set(newValue);
    }
    private __toolMode: ObservedPropertySimplePU<PcbToolMode>;
    get toolMode() {
        return this.__toolMode.get();
    }
    set toolMode(newValue: PcbToolMode) {
        this.__toolMode.set(newValue);
    }
    private __gridVisible: ObservedPropertySimplePU<boolean>;
    get gridVisible() {
        return this.__gridVisible.get();
    }
    set gridVisible(newValue: boolean) {
        this.__gridVisible.set(newValue);
    }
    private __leftPanelWidth: ObservedPropertySimplePU<number>;
    get leftPanelWidth() {
        return this.__leftPanelWidth.get();
    }
    set leftPanelWidth(newValue: number) {
        this.__leftPanelWidth.set(newValue);
    }
    private __rightPanelWidth: ObservedPropertySimplePU<number>;
    get rightPanelWidth() {
        return this.__rightPanelWidth.get();
    }
    set rightPanelWidth(newValue: number) {
        this.__rightPanelWidth.set(newValue);
    }
    private __drcViolations: ObservedPropertyObjectPU<PcbDrcViolation[]>;
    get drcViolations() {
        return this.__drcViolations.get();
    }
    set drcViolations(newValue: PcbDrcViolation[]) {
        this.__drcViolations.set(newValue);
    }
    private __layerRows: ObservedPropertyObjectPU<PcbLayerRow[]>;
    get layerRows() {
        return this.__layerRows.get();
    }
    set layerRows(newValue: PcbLayerRow[]) {
        this.__layerRows.set(newValue);
    }
    private __appInitialized: ObservedPropertySimplePU<boolean>;
    get appInitialized() {
        return this.__appInitialized.get();
    }
    set appInitialized(newValue: boolean) {
        this.__appInitialized.set(newValue);
    }
    private __unsavedChanges: ObservedPropertySimplePU<boolean>;
    get unsavedChanges() {
        return this.__unsavedChanges.get();
    }
    set unsavedChanges(newValue: boolean) {
        this.__unsavedChanges.set(newValue);
    }
    private __routeResetKey: ObservedPropertySimplePU<number>;
    get routeResetKey() {
        return this.__routeResetKey.get();
    }
    set routeResetKey(newValue: number) {
        this.__routeResetKey.set(newValue);
    }
    private __activeLayer: ObservedPropertySimplePU<PcbLayerId>;
    get activeLayer() {
        return this.__activeLayer.get();
    }
    set activeLayer(newValue: PcbLayerId) {
        this.__activeLayer.set(newValue);
    }
    private __hoverNetName: ObservedPropertySimplePU<string>;
    get hoverNetName() {
        return this.__hoverNetName.get();
    }
    set hoverNetName(newValue: string) {
        this.__hoverNetName.set(newValue);
    }
    private __selectedFpDefId: ObservedPropertySimplePU<string>;
    get selectedFpDefId() {
        return this.__selectedFpDefId.get();
    }
    set selectedFpDefId(newValue: string) {
        this.__selectedFpDefId.set(newValue);
    }
    private __copperCount: ObservedPropertySimplePU<number>;
    get copperCount() {
        return this.__copperCount.get();
    }
    set copperCount(newValue: number) {
        this.__copperCount.set(newValue);
    }
    private __stackLayers: ObservedPropertyObjectPU<PcbStackLayer[]>;
    get stackLayers() {
        return this.__stackLayers.get();
    }
    set stackLayers(newValue: PcbStackLayer[]) {
        this.__stackLayers.set(newValue);
    }
    private __viaKind: ObservedPropertySimplePU<PcbViaKind>;
    get viaKind() {
        return this.__viaKind.get();
    }
    set viaKind(newValue: PcbViaKind) {
        this.__viaKind.set(newValue);
    }
    private __routeCornerMode: ObservedPropertySimplePU<PcbRouteCornerMode>;
    get routeCornerMode() {
        return this.__routeCornerMode.get();
    }
    set routeCornerMode(newValue: PcbRouteCornerMode) {
        this.__routeCornerMode.set(newValue);
    }
    private __viaFrom: ObservedPropertySimplePU<PcbLayerId>;
    get viaFrom() {
        return this.__viaFrom.get();
    }
    set viaFrom(newValue: PcbLayerId) {
        this.__viaFrom.set(newValue);
    }
    private __viaTo: ObservedPropertySimplePU<PcbLayerId>;
    get viaTo() {
        return this.__viaTo.get();
    }
    set viaTo(newValue: PcbLayerId) {
        this.__viaTo.set(newValue);
    }
    private __copperLayerIds: ObservedPropertyObjectPU<PcbLayerId[]>;
    get copperLayerIds() {
        return this.__copperLayerIds.get();
    }
    set copperLayerIds(newValue: PcbLayerId[]) {
        this.__copperLayerIds.set(newValue);
    }
    /** bit0=Ctrl, bit1=Shift — 页面级快捷键 */
    private pageModifierKeys: number;
    private userProjectDir: string;
    private appService: AppService;
    aboutToAppear(): void {
        EventBus.getInstance().subscribe(ModuleEvent.PCB_CHANGED, this.onPcbChanged);
        EventBus.getInstance().subscribe(ModuleEvent.VIEWPORT_CHANGED, this.onViewportChanged);
        EventBus.getInstance().subscribe(ModuleEvent.SELECTION_CHANGED, this.onSelectionChanged);
        void this.initPage();
    }
    aboutToDisappear(): void {
        this.syncPcbToProject();
        EventBus.getInstance().unsubscribe(ModuleEvent.PCB_CHANGED, this.onPcbChanged);
        EventBus.getInstance().unsubscribe(ModuleEvent.VIEWPORT_CHANGED, this.onViewportChanged);
        EventBus.getInstance().unsubscribe(ModuleEvent.SELECTION_CHANGED, this.onSelectionChanged);
    }
    private onSelectionChanged;
    private onPcbChanged;
    private onViewportChanged;
    private getEditor(): PcbEditorImpl {
        return this.appService.pcbEditor as PcbEditorImpl;
    }
    private async initPage(): Promise<void> {
        const ctx = this.getUIContext().getHostContext() as common.UIAbilityContext;
        this.appService.initPlatform(ctx);
        this.userProjectDir = this.appService.getUserProjectDir();
        await maximizeAppWindow(ctx);
        let params: Record<string, Object> = {};
        try {
            params = this.getUIContext().getRouter().getParams() as Record<string, Object>;
        }
        catch (_e) { /* no params */ }
        const mode = params['launchMode'] as string | undefined;
        if (mode === 'resume') {
            if (this.appService.currentProject !== null) {
                this.projectName = this.appService.currentProject.name;
                this.ensurePcbDocument();
                this.appInitialized = true;
                this.refreshLayers();
                this.syncActiveLayerFromEditor();
                this.syncStackUiFromEditor();
                setTimeout(() => {
                    this.getEditor().fitBoardInView();
                    this.zoomPercent = Math.round(this.getEditor().getViewport().zoom * 100);
                    this.canvasVersion++;
                }, 200);
                return;
            }
        }
        else if (mode === 'open') {
            const path = params['projectPath'] as string | undefined;
            if (path) {
                await this.appService.loadProject(path);
                this.projectName = this.appService.currentProject?.name ?? 'Untitled';
            }
        }
        else if (mode === 'scratch' || mode === 'blank') {
            const name = (params['projectName'] as string) ?? 'Untitled';
            this.appService.newProject(name);
            this.projectName = name;
        }
        else if (this.appService.currentProject === null) {
            this.appService.newProject('Untitled');
        }
        this.ensurePcbDocument();
        this.appInitialized = true;
        this.refreshLayers();
        this.syncActiveLayerFromEditor();
        this.syncStackUiFromEditor();
        setTimeout(() => {
            this.getEditor().fitBoardInView();
            this.zoomPercent = Math.round(this.getEditor().getViewport().zoom * 100);
            this.canvasVersion++;
        }, 200);
    }
    private syncPcbToProject(): void {
        const doc = this.getEditor().getDocument();
        if (this.appService.currentProject && doc) {
            this.appService.currentProject.pcb = doc;
            this.gerberDocRev++;
            tracePcbOp('SYNC_TO_PROJECT', `fp=${doc.footprints.length} trk=${doc.tracks.length} via=${doc.vias.length} zone=${doc.zones.length}`);
        }
    }
    private ensurePcbDocument(): void {
        const proj = this.appService.currentProject;
        if (!proj)
            return;
        if (!proj.pcb) {
            proj.pcb = createEmptyPcbDocument(proj.name);
        }
        normalizePcbDocument(proj.pcb);
        this.getEditor().loadDocument(proj.pcb);
        Pcb3dRenderer.invalidateMeshCache();
        this.getEditor().setSchematicProvider(() => this.appService.schematicEditor.getDocument());
    }
    private refreshSelectedInfo(): void {
        const doc = this.getEditor().getDocument();
        if (!doc) {
            this.selectedFootprintInfo = '';
            return;
        }
        const sel = this.getEditor().getSelection();
        const fpCount = sel.footprintIds.length;
        const trkCount = sel.trackIds.length;
        const viaCount = sel.viaIds.length;
        const zoneCount = sel.zoneIds.length;
        const total = fpCount + trkCount + viaCount + zoneCount;
        this.selectedZoneCount = zoneCount;
        if (total === 0) {
            this.selectedFootprintInfo = '';
            return;
        }
        if (total > 1) {
            const parts: string[] = [];
            if (fpCount > 0)
                parts.push(`${fpCount} 封装`);
            if (trkCount > 0)
                parts.push(`${trkCount} 走线`);
            if (viaCount > 0)
                parts.push(`${viaCount} 过孔`);
            if (zoneCount > 0)
                parts.push(`${zoneCount} 覆铜`);
            this.selectedFootprintInfo = `多选 (${total})\n${parts.join(', ')}`;
            return;
        }
        if (trkCount === 1) {
            for (const trk of doc.tracks) {
                if (trk.id === sel.trackIds[0]) {
                    this.selectedFootprintInfo = `走线 ${trk.netName || '?'}\n${trk.layer}  ${trk.width.toFixed(1)} mil`;
                    return;
                }
            }
        }
        if (viaCount === 1) {
            for (const via of doc.vias) {
                if (via.id === sel.viaIds[0]) {
                    this.selectedFootprintInfo = `过孔 ${via.netName || '?'}\nØ${via.diameter.toFixed(0)} mil`;
                    return;
                }
            }
        }
        if (zoneCount === 1) {
            for (const zone of doc.zones) {
                if (zone.id === sel.zoneIds[0]) {
                    this.selectedFootprintInfo = `覆铜 ${zone.netName}\n优先级 ${zone.priority}  热焊盘:${zone.thermalRelief ? '开' : '关'}`;
                    return;
                }
            }
        }
        if (fpCount === 1) {
            for (const fp of doc.footprints) {
                if (fp.id === sel.footprintIds[0]) {
                    this.selectedFootprintInfo = `${fp.refDes}  ${fp.value}\n${fp.defId}`;
                    return;
                }
            }
        }
        this.selectedFootprintInfo = '';
    }
    private deleteSelected(): void {
        const sel = this.getEditor().getSelection();
        tracePcbOp('DELETE', `fp=${sel.footprintIds.length} trk=${sel.trackIds.length} via=${sel.viaIds.length} zone=${sel.zoneIds.length}`);
        this.getEditor().deleteSelected();
        this.selectedFootprintId = '';
        this.selectedTrackId = '';
        this.selectedViaId = '';
        this.selectedZoneId = '';
        this.selectedZoneCount = 0;
        this.selectedFootprintInfo = '';
        this.syncPcbToProject();
        this.canvasVersion++;
    }
    private runAutoRoute(): void {
        tracePcbUi('AUTO_ROUTE', 'start');
        const result = this.getEditor().runAutoRoute();
        if (result.success && result.data !== undefined) {
            this.syncPcbToProject();
            this.canvasVersion++;
            const d = result.data;
            const hint = d.messages.length > 0 ? d.messages[0] : '';
            this.statusMessage = `自动布线: ${d.netCount} 网络, ${d.trackCount} 段走线${hint.length > 0 ? ' — ' + hint : ''}`;
            this.unsavedChanges = true;
            tracePcbOp('AUTO_ROUTE', `ok nets=${d.netCount} tracks=${d.trackCount}`);
        }
        else {
            this.statusMessage = result.error ?? '自动布线失败';
            tracePcbOp('AUTO_ROUTE', `fail ${result.error ?? 'unknown'}`);
        }
    }
    private adjustSelectedZonePriority(delta: number): void {
        const ids = this.getEditor().getSelectedZoneIds();
        if (ids.length === 0) {
            return;
        }
        let ok = false;
        for (const id of ids) {
            if (this.getEditor().adjustZonePriority(id, delta)) {
                ok = true;
            }
        }
        if (ok) {
            this.syncPcbToProject();
            this.refreshSelectedInfo();
            this.canvasVersion++;
            this.unsavedChanges = true;
        }
    }
    private toggleSelectedZoneThermal(): void {
        const ids = this.getEditor().getSelectedZoneIds();
        if (ids.length === 0) {
            return;
        }
        const doc = this.getEditor().getDocument();
        if (!doc) {
            return;
        }
        let ok = false;
        for (const id of ids) {
            for (const zone of doc.zones) {
                if (zone.id === id) {
                    if (this.getEditor().setZoneThermalRelief(id, !zone.thermalRelief)) {
                        ok = true;
                    }
                    break;
                }
            }
        }
        if (ok) {
            this.syncPcbToProject();
            this.refreshSelectedInfo();
            this.canvasVersion++;
            this.unsavedChanges = true;
        }
    }
    private refreshSelectedZoneCutouts(): void {
        const ids = this.getEditor().getSelectedZoneIds();
        if (ids.length === 0) {
            return;
        }
        let ok = false;
        for (const id of ids) {
            if (this.getEditor().refreshZoneCutouts(id)) {
                ok = true;
            }
        }
        if (ok) {
            this.syncPcbToProject();
            this.canvasVersion++;
            this.statusMessage = '已刷新覆铜挖空';
            this.unsavedChanges = true;
        }
    }
    private syncActiveLayerFromEditor(): void {
        this.activeLayer = this.getEditor().getActiveLayer();
    }
    private syncStackUiFromEditor(): void {
        const doc = this.getEditor().getDocument();
        this.copperCount = this.getEditor().getLayerStackCopperCount();
        this.stackLayers = doc ? [...doc.layerStack.layers] : [];
        this.copperLayerIds = doc ? copperLayersFromStack(doc.layerStack) : [PcbLayerId.F_CU, PcbLayerId.B_CU];
        this.viaKind = this.getEditor().getViaKind();
        this.routeCornerMode = this.getEditor().getRouteCornerMode();
        const span = this.getEditor().getViaSpan();
        this.viaFrom = span[0];
        this.viaTo = span[1];
    }
    /** @param focusSolo 点铜层：淡化其他铜层但仍分色同显（不用 ACTIVE_ONLY，否则看不见 B.Cu 绿铜） */
    private setActiveLayerUi(id: PcbLayerId, focusSolo: boolean = false): void {
        const editor = this.getEditor();
        const doc = editor.getDocument();
        editor.setActiveLayer(id);
        this.activeLayer = id;
        if (focusSolo && isCopperLayer(id)) {
            if (doc) {
                for (let i = 0; i < doc.layers.length; i++) {
                    if (isCopperLayer(doc.layers[i].id)) {
                        editor.setLayerVisible(doc.layers[i].id, true);
                    }
                }
            }
            editor.setAppearanceMode(PcbAppearanceMode.DIM_INACTIVE);
            this.statusMessage = `活动层 ${id}`;
            this.refreshLayers();
        }
        else {
            this.statusMessage = `活动层: ${id}`;
        }
        this.canvasVersion++;
    }
    /** 图层快速预设：顶层 / 底层 / 单层 / 全部 */
    private applyLayerPreset(preset: string): void {
        const editor = this.getEditor();
        const doc = editor.getDocument();
        if (!doc)
            return;
        if (preset === 'solo') {
            const active = editor.getActiveLayer();
            for (const l of doc.layers) {
                if (isCopperLayer(l.id)) {
                    editor.setLayerVisible(l.id, true);
                }
            }
            editor.setAppearanceMode(PcbAppearanceMode.ACTIVE_ONLY);
            this.statusMessage = `单层：${active}`;
        }
        else if (preset === 'all') {
            editor.setSoloCopperLayer(false);
            for (const l of doc.layers) {
                editor.setLayerVisible(l.id, true);
                if (isCopperLayer(l.id)) {
                    editor.setLayerOpacity(l.id, l.id === PcbLayerId.F_CU || l.id === PcbLayerId.B_CU ? 0.92 : 0.82);
                }
            }
            editor.setAppearanceMode(PcbAppearanceMode.OVERLAY);
            this.statusMessage = '全层';
        }
        else if (preset === 'top') {
            editor.setSoloCopperLayer(false);
            for (const l of doc.layers) {
                if (isCopperLayer(l.id)) {
                    editor.setLayerVisible(l.id, true);
                    editor.setLayerOpacity(l.id, l.id === PcbLayerId.F_CU ? 0.95 : 0.35);
                }
                else if (l.id === PcbLayerId.B_SILKS || l.id === PcbLayerId.B_MASK ||
                    l.id === PcbLayerId.B_PASTE) {
                    editor.setLayerVisible(l.id, false);
                }
                else {
                    editor.setLayerVisible(l.id, true);
                }
            }
            editor.setActiveLayer(PcbLayerId.F_CU);
            this.activeLayer = PcbLayerId.F_CU;
            editor.setAppearanceMode(PcbAppearanceMode.DIM_INACTIVE);
            this.statusMessage = '顶层';
        }
        else if (preset === 'bottom') {
            editor.setSoloCopperLayer(false);
            for (const l of doc.layers) {
                if (isCopperLayer(l.id)) {
                    editor.setLayerVisible(l.id, true);
                    editor.setLayerOpacity(l.id, l.id === PcbLayerId.B_CU ? 0.95 : 0.28);
                }
                else if (l.id === PcbLayerId.F_SILKS || l.id === PcbLayerId.F_MASK ||
                    l.id === PcbLayerId.F_PASTE) {
                    editor.setLayerVisible(l.id, false);
                }
                else {
                    editor.setLayerVisible(l.id, true);
                }
            }
            editor.setLayerVisible(PcbLayerId.B_SILKS, true);
            editor.setActiveLayer(PcbLayerId.B_CU);
            this.activeLayer = PcbLayerId.B_CU;
            editor.setAppearanceMode(PcbAppearanceMode.DIM_INACTIVE);
            this.statusMessage = '底层';
        }
        this.refreshLayers();
        this.canvasVersion++;
    }
    private ercGatePassed(): boolean {
        const errors = this.appService.runErc(false);
        let errN = 0;
        for (const e of errors) {
            if (e.severity === 'error' || e.severity === 'critical') {
                errN++;
            }
        }
        if (errN > 0) {
            this.statusMessage = `ERC 未通过: ${errN} 个错误，请先修复原理图再更新 PCB`;
            return false;
        }
        return true;
    }
    private async saveTextViaPicker(content: string, defaultName: string, suffixChoices: string[]): Promise<void> {
        try {
            const options = new picker.DocumentSaveOptions();
            options.newFileNames = [defaultName];
            options.fileSuffixChoices = suffixChoices;
            const ctx = this.getUIContext().getHostContext() as common.UIAbilityContext;
            const docPicker = new picker.DocumentViewPicker(ctx);
            const uris = await docPicker.save(options);
            if (!uris || uris.length === 0) {
                return;
            }
            const fh = fs.openSync(uris[0], fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
            fs.writeSync(fh.fd, content);
            fs.closeSync(fh);
            this.statusMessage = `已导出: ${defaultName}`;
        }
        catch (_e) {
            this.statusMessage = '导出失败';
        }
    }
    private async exportPcb(): Promise<void> {
        const doc = this.getEditor().getDocument();
        if (!doc) {
            this.statusMessage = '无 PCB 文档';
            return;
        }
        const result = exportPcbKiCad(doc);
        await this.saveTextViaPicker(result.content, result.fileName, ['PCB|.kicad_pcb', 'Text|.txt']);
    }
    private async exportGerber(): Promise<void> {
        const doc = this.getEditor().getDocument();
        if (!doc) {
            this.statusMessage = '无 PCB 文档';
            return;
        }
        const bundle = exportPcbGerber(doc);
        let combined = '';
        for (const f of bundle.files) {
            combined += `G04 === ${f.fileName} ===*\n${f.content}\n`;
        }
        const safeName = doc.name.replace(/[^\w\-]/g, '_');
        await this.saveTextViaPicker(combined, `${safeName}_gerber.gbr`, ['Gerber|.gbr', 'Text|.txt']);
    }
    private async export3dStep(): Promise<void> {
        const doc = this.getEditor().getDocument();
        if (!doc) {
            this.statusMessage = '无 PCB 文档';
            return;
        }
        const content = exportPcbSimpleStep(doc);
        const safeName = doc.name.replace(/[^\w\-]/g, '_');
        await this.saveTextViaPicker(content, `${safeName}_3d.step`, ['STEP|.step', 'Text|.txt']);
    }
    private async export3dInterference(): Promise<void> {
        const doc = this.getEditor().getDocument();
        if (!doc) {
            this.statusMessage = '无 PCB 文档';
            return;
        }
        const hits = Pcb3dRenderer.listInterference(doc);
        let content = `ElecDraw 3D Interference Report\nboard=${doc.name}\ncount=${hits.length}\n\n`;
        if (hits.length === 0) {
            content += 'OK: no footprint AABB overlaps.\n';
        }
        else {
            for (let i = 0; i < hits.length; i++) {
                content += `${hits[i].aRef} <-> ${hits[i].bRef}  overlap≈${hits[i].overlapMil.toFixed(1)} mil\n`;
            }
        }
        const safeName = doc.name.replace(/[^\w\-]/g, '_');
        await this.saveTextViaPicker(content, `${safeName}_interference.txt`, ['Text|.txt']);
        this.getEditor().setView3dShowInterference(true);
        this.canvasVersion++;
        this.statusMessage = hits.length === 0 ? '无干涉' : `发现 ${hits.length} 处干涉（已在 3D 标红）`;
    }
    private async importStepForSelection(): Promise<void> {
        const sel = this.getEditor().getSelection();
        if (sel.footprintIds.length === 0) {
            this.statusMessage = '请先选中一个封装，再导入 STEP';
            return;
        }
        const doc = this.getEditor().getDocument();
        if (!doc)
            return;
        let defId = '';
        for (let i = 0; i < doc.footprints.length; i++) {
            if (doc.footprints[i].id === sel.footprintIds[0]) {
                defId = doc.footprints[i].defId;
                break;
            }
        }
        if (defId.length === 0) {
            this.statusMessage = '无法解析封装定义';
            return;
        }
        try {
            const options = new picker.DocumentSelectOptions();
            options.maxSelectNumber = 1;
            options.fileSuffixFilters = ['.step', '.stp', '.txt'];
            const ctx = this.getUIContext().getHostContext() as common.UIAbilityContext;
            const docPicker = new picker.DocumentViewPicker(ctx);
            const uris = await docPicker.select(options);
            if (!uris || uris.length === 0)
                return;
            const fh = fs.openSync(uris[0], fs.OpenMode.READ_ONLY);
            const stat = fs.statSync(fh.fd);
            if (stat.size <= 0 || stat.size > 48 * 1024 * 1024) {
                fs.closeSync(fh);
                this.statusMessage = 'STEP 文件过大或为空（上限 48MB）';
                return;
            }
            const buf = new ArrayBuffer(stat.size);
            fs.readSync(fh.fd, buf);
            fs.closeSync(fh);
            const bytes = new Uint8Array(buf);
            const decoder = util.TextDecoder.create('utf-8', { ignoreBOM: true });
            const content = decoder.decodeWithStream(bytes);
            if (content.length < 32 ||
                (content.indexOf('ISO-10303') < 0 && content.indexOf('CARTESIAN_POINT') < 0)) {
                this.statusMessage = '不是有效的 STEP 文本';
                return;
            }
            const meshId = `step_${defId}_${Date.now()}`;
            const result = importStepAndBind(content, meshId, defId);
            Pcb3dRenderer.invalidateMeshCache();
            this.getEditor().setView3dPbr(true);
            this.getEditor().setView3dDisplayMode(Pcb3dDisplayMode.REALISTIC);
            this.canvasVersion++;
            this.statusMessage =
                `STEP 已绑定 ${defId}：点${result.pointCount} 面${result.faceCount} 三角${result.triCount}` +
                    (result.warnings.length > 0 ? ` (${result.warnings[0]})` : '');
        }
        catch (_e) {
            this.statusMessage = 'STEP 导入失败';
        }
    }
    private reverseToSchematic(): void {
        const result = this.getEditor().reverseAnnotateToSchematic();
        if (result.success && result.data !== undefined) {
            const schEditor = this.appService.schematicEditor as SchematicEditorImpl;
            if (this.appService.currentProject) {
                this.appService.currentProject.schematic = schEditor.getDocument();
            }
            EventBus.getInstance().publish({
                event: ModuleEvent.SCHEMATIC_CHANGED,
                source: 'pcb_editor',
                timestamp: Date.now(),
                data: schEditor.getDocument()
            });
            this.unsavedChanges = true;
            this.statusMessage = `已回写原理图 ${result.data} 项（位号/值/封装）`;
        }
        else {
            this.statusMessage = result.error ?? '回写失败';
        }
    }
    private refreshLayers(): void {
        const doc = this.getEditor().getDocument();
        if (!doc) {
            this.layerRows = [];
            return;
        }
        const rows: PcbLayerRow[] = [];
        for (const l of doc.layers) {
            rows.push({
                id: l.id,
                name: l.name,
                visible: l.visible,
                color: l.color,
                opacity: l.opacity !== undefined ? l.opacity : 1
            });
        }
        this.layerRows = rows;
    }
    private async updateFromSchematic(): Promise<void> {
        tracePcbUi('UPDATE_FROM_SCH', 'start');
        const editor = this.appService.schematicEditor as SchematicEditorImpl;
        editor.rebuildNetPinConnectivity();
        const sch = editor.getDocument();
        if (!sch || sch.components.length === 0) {
            this.statusMessage = '原理图为空，请先放置器件';
            tracePcbOp('UPDATE_FROM_SCH', 'fail empty schematic');
            return;
        }
        if (!this.ercGatePassed()) {
            tracePcbOp('UPDATE_FROM_SCH', 'blocked by ERC');
            return;
        }
        if (this.appService.currentProject) {
            this.appService.currentProject.schematic = sch;
        }
        const result = this.getEditor().forwardAnnotateFromSchematic();
        if (result.success && result.data) {
            this.syncPcbToProject();
            this.getEditor().fitBoardInView();
            this.zoomPercent = Math.round(this.getEditor().getViewport().zoom * 100);
            this.statusMessage = `已从原理图更新 PCB（${result.data.footprints.length} 个封装）`;
            this.canvasVersion++;
            this.unsavedChanges = true;
            tracePcbOp('UPDATE_FROM_SCH', `ok fp=${result.data.footprints.length}`);
        }
        else {
            this.statusMessage = result.error ?? '更新失败';
            tracePcbOp('UPDATE_FROM_SCH', `fail ${result.error ?? 'unknown'}`);
        }
    }
    private runDrc(): void {
        this.drcViolations = this.getEditor().runDrc();
        const drcMsg = this.drcViolations.length === 0
            ? 'DRC 检查通过'
            : `DRC: ${this.drcViolations.length} 个问题`;
        tracePcbUi('DRC', `violations=${this.drcViolations.length}`);
        this.dumpPcbInstrTrace();
        this.statusMessage = `${drcMsg} · instr_trace 已同步诊断`;
        this.canvasVersion++;
    }
    /** 将当前 2D/3D 展示、器件位置、连接与拥挤诊断写入 instr_trace */
    private dumpPcbInstrTrace(): void {
        const editor = this.getEditor();
        const doc = editor.getDocument();
        if (!doc) {
            this.statusMessage = '无 PCB 文档';
            return;
        }
        const ap = editor.getAppearance();
        const vp = editor.getViewport();
        const sel = editor.getSelection();
        const rats = editor.getRatsnest();
        const canvasSnap: PcbCanvasTraceSnapshot = {
            viewport: vp,
            activeLayer: editor.getActiveLayer(),
            appearance: ap,
            selection: sel,
            ratsnest: rats,
            toolMode: `${this.toolMode}`
        };
        const mode = ap.view3dDisplayMode !== undefined
            ? ap.view3dDisplayMode : Pcb3dDisplayMode.REALISTIC;
        if (ap.show3d) {
            const view3d: PcbView3dTraceParams = {
                viewWidth: 1200,
                viewHeight: 800,
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
            };
            tracePcbDisplayDump(doc, 'menu_3d_dump', canvasSnap, true, null, view3d);
            this.statusMessage = 'instr_trace 已写入 3D/连接/拥挤全量诊断（见运行日志）';
            tracePcbUi('INSTR_DUMP', '3d full');
        }
        else {
            const view2d: PcbView2dTraceParams = {
                viewWidth: 1200,
                viewHeight: 800,
                viewport: vp,
                appearance: ap,
                selection: sel,
                activeLayer: editor.getActiveLayer(),
                toolMode: `${this.toolMode}`,
                ratsnestCount: rats.length,
                drcCount: this.drcViolations.length
            };
            tracePcbDisplayDump(doc, 'menu_2d_dump', canvasSnap, false, view2d, null);
            this.statusMessage = 'instr_trace 已写入 2D/连接/拥挤全量诊断（见运行日志）';
            tracePcbUi('INSTR_DUMP', '2d full');
        }
    }
    /**
     * PCB 保存必须落到 .pcbsim。
     * 若当前路径是原理图 .schsim/.json 或为空，则写入沙箱 project/ 同名 .pcbsim
     *（模拟器 DocumentViewPicker 常无法写应用私有 project/，故默认直写沙箱）。
     */
    private resolvePcbSavePath(): string {
        const safeName = (this.projectName.length > 0 ? this.projectName : 'Untitled')
            .replace(/[\\/:*?"<>|]/g, '_');
        return ProjectPaths.toUserPcbProjectPath(this.appService.getAppBaseDir(), this.appService.currentProjectPath, safeName);
    }
    private async saveProject(): Promise<void> {
        this.syncPcbToProject();
        const path = this.resolvePcbSavePath();
        // 确保 project/ 存在（首次安装或路径异常时）
        try {
            fs.accessSync(this.userProjectDir);
        }
        catch (_e) {
            try {
                fs.mkdirSync(this.userProjectDir, true);
            }
            catch (_e2) { /* best-effort */ }
        }
        const ok = await this.appService.saveProject(path, true);
        if (ok) {
            this.unsavedChanges = false;
            this.projectName = this.appService.currentProject?.name ?? this.projectName;
            this.statusMessage = `已保存: ${path}`;
            tracePcbOp('SAVE', `ok path=${path}`);
        }
        else {
            this.statusMessage = '保存失败';
            tracePcbOp('SAVE', `fail path=${path}`);
        }
    }
    /** 另存为 .pcbsim：优先系统选择器；不可用或取消后仍可回退写入 project/ */
    private async saveProjectAs(): Promise<void> {
        this.syncPcbToProject();
        const picked = await this.savePcbViaPicker();
        if (picked === null || picked.length === 0) {
            tracePcbOp('SAVE_AS', 'cancelled');
            return;
        }
        const ok = await this.appService.saveProject(picked, true);
        if (ok) {
            this.unsavedChanges = false;
            this.projectName = this.appService.currentProject?.name ?? this.projectName;
            this.statusMessage = `已另存为: ${picked}`;
            tracePcbOp('SAVE_AS', `ok path=${picked}`);
        }
        else {
            this.statusMessage = '另存为失败';
            tracePcbOp('SAVE_AS', `fail path=${picked}`);
        }
    }
    private getHostCtx(): common.UIAbilityContext {
        return this.getUIContext().getHostContext() as common.UIAbilityContext;
    }
    private getProjectDirUri(): string {
        try {
            if (this.userProjectDir.length === 0) {
                return '';
            }
            return fileUri.getUriFromPath(this.userProjectDir);
        }
        catch (_e) {
            return '';
        }
    }
    /**
     * 系统保存对话框：默认 .pcbsim，目录为用户工程目录。
     * 模拟器上选择器常打不开应用沙箱 → 捕获异常后直写 project/。
     */
    private async savePcbViaPicker(): Promise<string | null> {
        const safeName = (this.projectName.length > 0 ? this.projectName : 'Untitled')
            .replace(/[\\/:*?"<>|]/g, '_');
        const fallback = ProjectPaths.defaultUserPcbProject(this.appService.getAppBaseDir(), safeName);
        try {
            const options = new picker.DocumentSaveOptions();
            options.newFileNames = [`${safeName}${ProjectPaths.PCB_EXT}`];
            options.fileSuffixChoices = ['PCB工程|.pcbsim'];
            const dirUri = this.getProjectDirUri();
            if (dirUri.length > 0) {
                options.defaultFilePathUri = dirUri;
            }
            const uris = await new picker.DocumentViewPicker(this.getHostCtx()).save(options);
            if (!uris || uris.length === 0) {
                this.statusMessage = '已取消保存';
                return null;
            }
            let chosen = uris[0];
            // 选择器可能返回无后缀或错误后缀的 URI/路径，强制规范为 .pcbsim
            if (!ProjectPaths.isPcbProjectPath(chosen)
                && !chosen.startsWith('content://')
                && !chosen.startsWith('file://')) {
                chosen = ProjectPaths.toUserPcbProjectPath(this.appService.getAppBaseDir(), chosen, safeName);
            }
            return chosen;
        }
        catch (_e) {
            this.statusMessage = `选择器不可用，将写入: ${fallback}`;
            return fallback;
        }
    }
    private goToSchematic(): void {
        this.syncPcbToProject();
        this.getUIContext().getRouter().replaceUrl({
            url: 'pages/Index',
            params: { launchMode: 'resume' }
        }).catch((_e: BusinessError) => { });
    }
    private goToHome(): void {
        this.syncPcbToProject();
        this.getUIContext().getRouter().replaceUrl({ url: 'pages/HomePage' })
            .catch((_e: BusinessError) => { });
    }
    private setToolMode(mode: PcbToolMode): void {
        const prev = this.toolMode;
        if (this.toolMode === PcbToolMode.ROUTE && mode !== PcbToolMode.ROUTE) {
            this.routeResetKey++;
        }
        this.toolMode = mode;
        if (prev !== mode) {
            tracePcbUi('TOOL_MODE', `${prev} → ${mode}`);
        }
        if (mode === PcbToolMode.ROUTE && !isCopperLayer(this.getEditor().getActiveLayer())) {
            this.setActiveLayerUi(PcbLayerId.F_CU);
            this.statusMessage = '走线层已切换为 Front Copper';
        }
    }
    private doUndo(): void {
        if (this.getEditor().undo()) {
            this.syncPcbToProject();
            this.refreshSelectedInfo();
            this.canvasVersion++;
            this.statusMessage = '撤销';
        }
    }
    private doRedo(): void {
        if (this.getEditor().redo()) {
            this.syncPcbToProject();
            this.refreshSelectedInfo();
            this.canvasVersion++;
            this.statusMessage = '重做';
        }
    }
    private doRotate(): void {
        this.getEditor().rotateSelected(true);
        this.refreshSelectedInfo();
        this.syncPcbToProject();
        this.canvasVersion++;
        this.statusMessage = '已旋转';
    }
    private doFlip(): void {
        this.getEditor().flipSelected();
        this.refreshSelectedInfo();
        this.syncPcbToProject();
        this.canvasVersion++;
        this.statusMessage = '已镜像翻转';
    }
    private doFit(): void {
        this.getEditor().fitBoardInView();
        this.zoomPercent = Math.round(this.getEditor().getViewport().zoom * 100);
        this.canvasVersion++;
        this.statusMessage = '适应窗口';
    }
    private doZoom(factor: number): void {
        this.getEditor().zoomAt(factor, 400, 300);
        this.zoomPercent = Math.round(this.getEditor().getViewport().zoom * 100);
        this.canvasVersion++;
    }
    private doCopy(): void {
        const ok = this.getEditor().copySelected();
        this.statusMessage = ok ? '已复制' : '无选中对象';
    }
    private doPaste(): void {
        const count = this.getEditor().pasteClipboard();
        this.statusMessage = count > 0 ? `已粘贴 ${count} 个` : '剪贴板为空';
        if (count > 0) {
            this.syncPcbToProject();
            this.canvasVersion++;
            this.unsavedChanges = true;
        }
    }
    private handlePageKeyEvent(event: KeyEvent): void {
        if (event.type === KeyType.Down) {
            if (event.keyCode === 2021 || event.keyCode === 2022) {
                this.pageModifierKeys |= 1;
                return;
            }
            if (event.keyCode === 2047 || event.keyCode === 2048 || event.keyCode === 16) {
                this.pageModifierKeys |= 2;
                return;
            }
        }
        if (event.type === KeyType.Up) {
            if (event.keyCode === 2021 || event.keyCode === 2022) {
                this.pageModifierKeys &= ~1;
                return;
            }
            if (event.keyCode === 2047 || event.keyCode === 2048 || event.keyCode === 16) {
                this.pageModifierKeys &= ~2;
                return;
            }
        }
        if (event.type !== KeyType.Down) {
            return;
        }
        const ctrl = (this.pageModifierKeys & 1) !== 0;
        const shift = (this.pageModifierKeys & 2) !== 0;
        const kt = (event.keyText ?? '').toLowerCase();
        if (ctrl && kt === 's') {
            void this.saveProject();
            return;
        }
        if (ctrl && kt === 'z') {
            this.doUndo();
            return;
        }
        if (ctrl && kt === 'y') {
            this.doRedo();
            return;
        }
        if (ctrl && kt === 'c') {
            this.doCopy();
            return;
        }
        if (ctrl && kt === 'v') {
            this.doPaste();
            return;
        }
        if (ctrl && (kt === '0' || event.keyCode === 48)) {
            this.doFit();
            return;
        }
        if (ctrl) {
            return;
        }
        if (kt === 's') {
            this.setToolMode(PcbToolMode.SELECT);
            this.statusMessage = '工具: 选择';
            return;
        }
        if (kt === 'x') {
            this.setToolMode(PcbToolMode.ROUTE);
            this.statusMessage = '工具: 走线';
            return;
        }
        if (kt === 'v') {
            this.setToolMode(PcbToolMode.VIA);
            this.statusMessage = '工具: 过孔';
            return;
        }
        if (kt === 'z' && shift) {
            this.setToolMode(PcbToolMode.POUR);
            this.statusMessage = '工具: 整板覆铜';
            return;
        }
        if (kt === 'z') {
            this.setToolMode(PcbToolMode.ZONE_POLY);
            this.statusMessage = '工具: 多边形覆铜';
            return;
        }
        if (kt === 'o') {
            this.setToolMode(PcbToolMode.OUTLINE);
            this.statusMessage = '工具: 板框';
            return;
        }
        if (kt === 'm') {
            this.setToolMode(PcbToolMode.MEASURE);
            this.statusMessage = '工具: 测量';
            return;
        }
        if (kt === 'p') {
            this.setToolMode(PcbToolMode.PLACE_FP);
            this.statusMessage = '工具: 放置封装';
            return;
        }
        if (kt === 'g') {
            this.gridVisible = !this.gridVisible;
            this.canvasVersion++;
            this.statusMessage = this.gridVisible ? '网格开' : '网格关';
            return;
        }
        if (kt === 'r') {
            this.doRotate();
            return;
        }
        if (kt === 'f') {
            if (this.getEditor().getSelection().footprintIds.length > 0) {
                this.doFlip();
            }
            else {
                this.doFit();
            }
            return;
        }
        if (kt === 'u') {
            void this.updateFromSchematic();
            return;
        }
        if (kt === '+' || kt === '=') {
            this.doZoom(1.12);
            return;
        }
        if (kt === '-' || kt === '_') {
            this.doZoom(1 / 1.12);
            return;
        }
        if (event.keyCode === 46 || event.keyCode === 8 || kt === 'delete') {
            this.deleteSelected();
            this.statusMessage = '已删除';
            return;
        }
        if (kt === 'f7' || event.keyCode === 298) {
            this.runDrc();
            return;
        }
        if (kt === 'f8' || event.keyCode === 299) {
            this.runAutoRoute();
            return;
        }
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.backgroundColor(ProteusColors.MENU_BG);
            Column.focusable(true);
            Column.defaultFocus(true);
            Column.onKeyEvent((event: KeyEvent) => { this.handlePageKeyEvent(event); });
        }, Column);
        this.buildMenuBar.bind(this)();
        this.buildMainToolbar.bind(this)();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.layoutWeight(1);
            Row.width('100%');
            Row.height('100%');
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(44);
            Column.height('100%');
            Column.zIndex(2);
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new PcbVerticalToolbar(this, {
                        toolMode: this.toolMode,
                        gridActive: this.gridVisible,
                        onToolSelect: (mode: PcbToolMode) => { this.setToolMode(mode); },
                        onRotate: () => { this.doRotate(); },
                        onFlip: () => { this.doFlip(); },
                        onDelete: () => {
                            this.deleteSelected();
                            this.statusMessage = '已删除';
                        },
                        onUndo: () => { this.doUndo(); },
                        onRedo: () => { this.doRedo(); },
                        onFit: () => { this.doFit(); },
                        onToggleGrid: () => {
                            this.gridVisible = !this.gridVisible;
                            this.canvasVersion++;
                        },
                        onUpdatePcb: () => { void this.updateFromSchematic(); },
                        onDrc: () => { this.runDrc(); },
                        onAutoRoute: () => { this.runAutoRoute(); },
                        onCopy: () => { this.doCopy(); },
                        onPaste: () => { this.doPaste(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1133, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            toolMode: this.toolMode,
                            gridActive: this.gridVisible,
                            onToolSelect: (mode: PcbToolMode) => { this.setToolMode(mode); },
                            onRotate: () => { this.doRotate(); },
                            onFlip: () => { this.doFlip(); },
                            onDelete: () => {
                                this.deleteSelected();
                                this.statusMessage = '已删除';
                            },
                            onUndo: () => { this.doUndo(); },
                            onRedo: () => { this.doRedo(); },
                            onFit: () => { this.doFit(); },
                            onToggleGrid: () => {
                                this.gridVisible = !this.gridVisible;
                                this.canvasVersion++;
                            },
                            onUpdatePcb: () => { void this.updateFromSchematic(); },
                            onDrc: () => { this.runDrc(); },
                            onAutoRoute: () => { this.runAutoRoute(); },
                            onCopy: () => { this.doCopy(); },
                            onPaste: () => { this.doPaste(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        toolMode: this.toolMode,
                        gridActive: this.gridVisible
                    });
                }
            }, { name: "PcbVerticalToolbar" });
        }
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(this.leftPanelWidth);
            Column.height('100%');
            Column.zIndex(2);
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new PcbLayerPanel(this, {
                        layerRows: this.layerRows,
                        activeLayer: this.activeLayer,
                        panelWidth: this.leftPanelWidth,
                        onLayerSelect: (id: PcbLayerId) => { this.setActiveLayerUi(id, true); },
                        onVisibilityChange: (id: PcbLayerId, visible: boolean) => {
                            this.getEditor().setLayerVisible(id, visible);
                            this.refreshLayers();
                            this.canvasVersion++;
                        },
                        onOpacityChange: (id: PcbLayerId, opacity: number) => {
                            this.getEditor().setLayerOpacity(id, opacity);
                            this.refreshLayers();
                            this.canvasVersion++;
                        },
                        onPreset: (preset: string) => {
                            this.applyLayerPreset(preset);
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1162, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            layerRows: this.layerRows,
                            activeLayer: this.activeLayer,
                            panelWidth: this.leftPanelWidth,
                            onLayerSelect: (id: PcbLayerId) => { this.setActiveLayerUi(id, true); },
                            onVisibilityChange: (id: PcbLayerId, visible: boolean) => {
                                this.getEditor().setLayerVisible(id, visible);
                                this.refreshLayers();
                                this.canvasVersion++;
                            },
                            onOpacityChange: (id: PcbLayerId, opacity: number) => {
                                this.getEditor().setLayerOpacity(id, opacity);
                                this.refreshLayers();
                                this.canvasVersion++;
                            },
                            onPreset: (preset: string) => {
                                this.applyLayerPreset(preset);
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        layerRows: this.layerRows,
                        activeLayer: this.activeLayer,
                        panelWidth: this.leftPanelWidth
                    });
                }
            }, { name: "PcbLayerPanel" });
        }
        Column.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusResizer(this, { onDrag: (dx: number) => { this.leftPanelWidth = Math.max(140, this.leftPanelWidth + dx); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1186, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            onDrag: (dx: number) => { this.leftPanelWidth = Math.max(140, this.leftPanelWidth + dx); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {});
                }
            }, { name: "ProteusResizer" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Stack.create();
            Stack.layoutWeight(1);
            Stack.height('100%');
        }, Stack);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            __Common__.create();
            __Common__.width('100%');
            __Common__.height('100%');
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new PcbCanvas(this, {
                        canvasVersion: this.__canvasVersion,
                        selectedFootprintId: this.__selectedFootprintId,
                        selectedTrackId: this.__selectedTrackId,
                        selectedViaId: this.__selectedViaId,
                        selectedZoneId: this.__selectedZoneId,
                        mouseX: this.__mouseX,
                        mouseY: this.__mouseY,
                        worldMouseX: this.__worldMouseX,
                        worldMouseY: this.__worldMouseY,
                        zoomPercent: this.__zoomPercent,
                        toolMode: this.__toolMode,
                        routeResetKey: this.routeResetKey,
                        gridVisible: this.gridVisible,
                        onStatusChange: (msg: string) => { this.statusMessage = msg; },
                        onDocumentChanged: () => {
                            this.syncPcbToProject();
                            this.refreshSelectedInfo();
                            this.unsavedChanges = true;
                        },
                        onSelectionCleared: () => {
                            this.selectedFootprintId = '';
                            this.selectedTrackId = '';
                            this.selectedViaId = '';
                            this.selectedZoneId = '';
                            this.selectedZoneCount = 0;
                            this.selectedFootprintInfo = '';
                        },
                        onActiveLayerChange: (layer: PcbLayerId) => {
                            this.activeLayer = layer;
                        },
                        onHoverNetChange: (netName: string) => {
                            this.hoverNetName = netName;
                        },
                        onToolModeRequest: (mode: PcbToolMode) => {
                            this.setToolMode(mode);
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1189, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            canvasVersion: this.canvasVersion,
                            selectedFootprintId: this.selectedFootprintId,
                            selectedTrackId: this.selectedTrackId,
                            selectedViaId: this.selectedViaId,
                            selectedZoneId: this.selectedZoneId,
                            mouseX: this.mouseX,
                            mouseY: this.mouseY,
                            worldMouseX: this.worldMouseX,
                            worldMouseY: this.worldMouseY,
                            zoomPercent: this.zoomPercent,
                            toolMode: this.toolMode,
                            routeResetKey: this.routeResetKey,
                            gridVisible: this.gridVisible,
                            onStatusChange: (msg: string) => { this.statusMessage = msg; },
                            onDocumentChanged: () => {
                                this.syncPcbToProject();
                                this.refreshSelectedInfo();
                                this.unsavedChanges = true;
                            },
                            onSelectionCleared: () => {
                                this.selectedFootprintId = '';
                                this.selectedTrackId = '';
                                this.selectedViaId = '';
                                this.selectedZoneId = '';
                                this.selectedZoneCount = 0;
                                this.selectedFootprintInfo = '';
                            },
                            onActiveLayerChange: (layer: PcbLayerId) => {
                                this.activeLayer = layer;
                            },
                            onHoverNetChange: (netName: string) => {
                                this.hoverNetName = netName;
                            },
                            onToolModeRequest: (mode: PcbToolMode) => {
                                this.setToolMode(mode);
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        routeResetKey: this.routeResetKey,
                        gridVisible: this.gridVisible
                    });
                }
            }, { name: "PcbCanvas" });
        }
        __Common__.pop();
        Stack.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusResizer(this, { onDrag: (dx: number) => { this.rightPanelWidth = Math.max(180, this.rightPanelWidth - dx); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1233, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            onDrag: (dx: number) => { this.rightPanelWidth = Math.max(180, this.rightPanelWidth - dx); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {});
                }
            }, { name: "ProteusResizer" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new PcbRightPanel(this, {
                        panelWidth: this.rightPanelWidth,
                        selectionInfo: this.selectedFootprintInfo,
                        selectedZoneId: this.selectedZoneId,
                        selectedZoneCount: this.selectedZoneCount,
                        activeLayer: this.activeLayer,
                        drcViolations: this.drcViolations,
                        selectedFpDefId: this.selectedFpDefId,
                        copperCount: this.copperCount,
                        stackLayers: this.stackLayers,
                        viaKind: this.viaKind,
                        viaFrom: this.viaFrom,
                        viaTo: this.viaTo,
                        copperLayerIds: this.copperLayerIds,
                        routeCornerMode: this.routeCornerMode,
                        gerberDocRev: this.gerberDocRev,
                        getPcbDocument: () => this.getEditor().getDocument(),
                        onExportGerber: () => { this.exportGerber(); },
                        onZonePriority: (delta: number) => { this.adjustSelectedZonePriority(delta); },
                        onZoneThermal: () => { this.toggleSelectedZoneThermal(); },
                        onZoneRefreshCutouts: () => { this.refreshSelectedZoneCutouts(); },
                        onPickFootprint: (defId: string) => {
                            this.selectedFpDefId = defId;
                            this.getEditor().setPlaceFootprintDefId(defId);
                            this.setToolMode(PcbToolMode.PLACE_FP);
                            this.statusMessage = `封装: ${defId} — 点击画布放置`;
                        },
                        onSetRouteCorner: (mode: PcbRouteCornerMode) => {
                            this.getEditor().setRouteCornerMode(mode);
                            this.routeCornerMode = mode;
                            this.canvasVersion++;
                            this.statusMessage = `布线拐角: ${mode}`;
                        },
                        onSetCopperCount: (n: number) => {
                            if (this.getEditor().setCopperLayerCount(n)) {
                                this.refreshLayers();
                                this.syncActiveLayerFromEditor();
                                this.syncStackUiFromEditor();
                                this.canvasVersion++;
                                this.statusMessage = `层叠已切换为 ${n} 层`;
                            }
                        },
                        onSetViaKind: (k: PcbViaKind) => {
                            this.getEditor().setViaKind(k);
                            this.syncStackUiFromEditor();
                            this.statusMessage = `过孔类型: ${k}`;
                        },
                        onSetViaSpan: (from: PcbLayerId, to: PcbLayerId) => {
                            this.getEditor().setViaSpan(from, to);
                            this.syncStackUiFromEditor();
                            this.statusMessage = `过孔跨度: ${from} → ${to}`;
                        },
                        onSetAppearanceOverlay: () => {
                            this.getEditor().setAppearanceMode(PcbAppearanceMode.OVERLAY);
                            this.canvasVersion++;
                            this.statusMessage = '显示模式: 叠层叠加';
                        },
                        onSetAppearanceDim: () => {
                            this.getEditor().setAppearanceMode(PcbAppearanceMode.DIM_INACTIVE);
                            this.canvasVersion++;
                            this.statusMessage = '显示模式: 暗化非活动层';
                        },
                        onSetAppearanceActiveOnly: () => {
                            this.getEditor().setAppearanceMode(PcbAppearanceMode.ACTIVE_ONLY);
                            this.canvasVersion++;
                            this.statusMessage = '显示模式: 仅活动层';
                        },
                        onRunDrc: () => { this.runDrc(); },
                        onPcbTemplateInserted: () => {
                            this.refreshLayers();
                            this.syncActiveLayerFromEditor();
                            this.syncStackUiFromEditor();
                            this.canvasVersion++;
                            this.gerberDocRev++;
                            this.statusMessage = '已插入 PCB 实验模板';
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1235, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            panelWidth: this.rightPanelWidth,
                            selectionInfo: this.selectedFootprintInfo,
                            selectedZoneId: this.selectedZoneId,
                            selectedZoneCount: this.selectedZoneCount,
                            activeLayer: this.activeLayer,
                            drcViolations: this.drcViolations,
                            selectedFpDefId: this.selectedFpDefId,
                            copperCount: this.copperCount,
                            stackLayers: this.stackLayers,
                            viaKind: this.viaKind,
                            viaFrom: this.viaFrom,
                            viaTo: this.viaTo,
                            copperLayerIds: this.copperLayerIds,
                            routeCornerMode: this.routeCornerMode,
                            gerberDocRev: this.gerberDocRev,
                            getPcbDocument: () => this.getEditor().getDocument(),
                            onExportGerber: () => { this.exportGerber(); },
                            onZonePriority: (delta: number) => { this.adjustSelectedZonePriority(delta); },
                            onZoneThermal: () => { this.toggleSelectedZoneThermal(); },
                            onZoneRefreshCutouts: () => { this.refreshSelectedZoneCutouts(); },
                            onPickFootprint: (defId: string) => {
                                this.selectedFpDefId = defId;
                                this.getEditor().setPlaceFootprintDefId(defId);
                                this.setToolMode(PcbToolMode.PLACE_FP);
                                this.statusMessage = `封装: ${defId} — 点击画布放置`;
                            },
                            onSetRouteCorner: (mode: PcbRouteCornerMode) => {
                                this.getEditor().setRouteCornerMode(mode);
                                this.routeCornerMode = mode;
                                this.canvasVersion++;
                                this.statusMessage = `布线拐角: ${mode}`;
                            },
                            onSetCopperCount: (n: number) => {
                                if (this.getEditor().setCopperLayerCount(n)) {
                                    this.refreshLayers();
                                    this.syncActiveLayerFromEditor();
                                    this.syncStackUiFromEditor();
                                    this.canvasVersion++;
                                    this.statusMessage = `层叠已切换为 ${n} 层`;
                                }
                            },
                            onSetViaKind: (k: PcbViaKind) => {
                                this.getEditor().setViaKind(k);
                                this.syncStackUiFromEditor();
                                this.statusMessage = `过孔类型: ${k}`;
                            },
                            onSetViaSpan: (from: PcbLayerId, to: PcbLayerId) => {
                                this.getEditor().setViaSpan(from, to);
                                this.syncStackUiFromEditor();
                                this.statusMessage = `过孔跨度: ${from} → ${to}`;
                            },
                            onSetAppearanceOverlay: () => {
                                this.getEditor().setAppearanceMode(PcbAppearanceMode.OVERLAY);
                                this.canvasVersion++;
                                this.statusMessage = '显示模式: 叠层叠加';
                            },
                            onSetAppearanceDim: () => {
                                this.getEditor().setAppearanceMode(PcbAppearanceMode.DIM_INACTIVE);
                                this.canvasVersion++;
                                this.statusMessage = '显示模式: 暗化非活动层';
                            },
                            onSetAppearanceActiveOnly: () => {
                                this.getEditor().setAppearanceMode(PcbAppearanceMode.ACTIVE_ONLY);
                                this.canvasVersion++;
                                this.statusMessage = '显示模式: 仅活动层';
                            },
                            onRunDrc: () => { this.runDrc(); },
                            onPcbTemplateInserted: () => {
                                this.refreshLayers();
                                this.syncActiveLayerFromEditor();
                                this.syncStackUiFromEditor();
                                this.canvasVersion++;
                                this.gerberDocRev++;
                                this.statusMessage = '已插入 PCB 实验模板';
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        panelWidth: this.rightPanelWidth,
                        selectionInfo: this.selectedFootprintInfo,
                        selectedZoneId: this.selectedZoneId,
                        selectedZoneCount: this.selectedZoneCount,
                        activeLayer: this.activeLayer,
                        drcViolations: this.drcViolations,
                        selectedFpDefId: this.selectedFpDefId,
                        copperCount: this.copperCount,
                        stackLayers: this.stackLayers,
                        viaKind: this.viaKind,
                        viaFrom: this.viaFrom,
                        viaTo: this.viaTo,
                        copperLayerIds: this.copperLayerIds,
                        routeCornerMode: this.routeCornerMode,
                        gerberDocRev: this.gerberDocRev
                    });
                }
            }, { name: "PcbRightPanel" });
        }
        Row.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new PcbStatusBar(this, {
                        statusMessage: this.statusMessage,
                        worldX: this.worldMouseX,
                        worldY: this.worldMouseY,
                        zoomPercent: this.zoomPercent,
                        activeLayer: this.activeLayer,
                        gridSize: this.getEditor().getDocument()?.metadata.gridSize ?? 5,
                        gridVisible: this.gridVisible,
                        hoverNetName: this.hoverNetName
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1317, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            statusMessage: this.statusMessage,
                            worldX: this.worldMouseX,
                            worldY: this.worldMouseY,
                            zoomPercent: this.zoomPercent,
                            activeLayer: this.activeLayer,
                            gridSize: this.getEditor().getDocument()?.metadata.gridSize ?? 5,
                            gridVisible: this.gridVisible,
                            hoverNetName: this.hoverNetName
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        statusMessage: this.statusMessage,
                        worldX: this.worldMouseX,
                        worldY: this.worldMouseY,
                        zoomPercent: this.zoomPercent,
                        activeLayer: this.activeLayer,
                        gridSize: this.getEditor().getDocument()?.metadata.gridSize ?? 5,
                        gridVisible: this.gridVisible,
                        hoverNetName: this.hoverNetName
                    });
                }
            }, { name: "PcbStatusBar" });
        }
        Column.pop();
    }
    buildMainToolbar(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.height(ProteusDimens.TOOLBAR_HEIGHT);
            Row.padding({ left: 4, right: 4 });
            Row.backgroundColor(ProteusColors.TOOLBAR_BG);
            Row.border({ width: { bottom: 1 }, color: ProteusColors.BORDER });
            Row.alignItems(VerticalAlign.Center);
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolGroup(this, {
                        title: 'Home',
                        content: () => {
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: ProteusIconName.HOME,
                                            tooltip: '返回首页',
                                            showLabel: false,
                                            onAction: () => { this.goToHome(); }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1340, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.HOME,
                                                tooltip: '返回首页',
                                                showLabel: false,
                                                onAction: () => { this.goToHome(); }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.HOME,
                                            tooltip: '返回首页',
                                            showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1339, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'Home',
                            content: () => {
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: ProteusIconName.HOME,
                                                tooltip: '返回首页',
                                                showLabel: false,
                                                onAction: () => { this.goToHome(); }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1340, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.HOME,
                                                    tooltip: '返回首页',
                                                    showLabel: false,
                                                    onAction: () => { this.goToHome(); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.HOME,
                                                tooltip: '返回首页',
                                                showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: 'Home'
                    });
                }
            }, { name: "ProteusToolGroup" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolGroup(this, {
                        title: 'File',
                        content: () => {
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: ProteusIconName.SAVE,
                                            tooltip: '保存 (Ctrl+S)',
                                            showLabel: false,
                                            onAction: () => { void this.saveProject(); }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1348, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.SAVE,
                                                tooltip: '保存 (Ctrl+S)',
                                                showLabel: false,
                                                onAction: () => { void this.saveProject(); }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.SAVE,
                                            tooltip: '保存 (Ctrl+S)',
                                            showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1347, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'File',
                            content: () => {
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: ProteusIconName.SAVE,
                                                tooltip: '保存 (Ctrl+S)',
                                                showLabel: false,
                                                onAction: () => { void this.saveProject(); }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1348, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.SAVE,
                                                    tooltip: '保存 (Ctrl+S)',
                                                    showLabel: false,
                                                    onAction: () => { void this.saveProject(); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.SAVE,
                                                tooltip: '保存 (Ctrl+S)',
                                                showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: 'File'
                    });
                }
            }, { name: "ProteusToolGroup" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolGroup(this, {
                        title: 'History',
                        content: () => {
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: ProteusIconName.UNDO,
                                            tooltip: '撤销 (Ctrl+Z)',
                                            showLabel: false,
                                            onAction: () => { this.doUndo(); }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1356, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.UNDO,
                                                tooltip: '撤销 (Ctrl+Z)',
                                                showLabel: false,
                                                onAction: () => { this.doUndo(); }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.UNDO,
                                            tooltip: '撤销 (Ctrl+Z)',
                                            showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: ProteusIconName.REDO,
                                            tooltip: '重做 (Ctrl+Y)',
                                            showLabel: false,
                                            onAction: () => { this.doRedo(); }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1362, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.REDO,
                                                tooltip: '重做 (Ctrl+Y)',
                                                showLabel: false,
                                                onAction: () => { this.doRedo(); }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.REDO,
                                            tooltip: '重做 (Ctrl+Y)',
                                            showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: ProteusIconName.TRASH,
                                            tooltip: '删除 (Del)',
                                            showLabel: false,
                                            onAction: () => {
                                                this.deleteSelected();
                                                this.statusMessage = '已删除';
                                            }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1368, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.TRASH,
                                                tooltip: '删除 (Del)',
                                                showLabel: false,
                                                onAction: () => {
                                                    this.deleteSelected();
                                                    this.statusMessage = '已删除';
                                                }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.TRASH,
                                            tooltip: '删除 (Del)',
                                            showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1355, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'History',
                            content: () => {
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: ProteusIconName.UNDO,
                                                tooltip: '撤销 (Ctrl+Z)',
                                                showLabel: false,
                                                onAction: () => { this.doUndo(); }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1356, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.UNDO,
                                                    tooltip: '撤销 (Ctrl+Z)',
                                                    showLabel: false,
                                                    onAction: () => { this.doUndo(); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.UNDO,
                                                tooltip: '撤销 (Ctrl+Z)',
                                                showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: ProteusIconName.REDO,
                                                tooltip: '重做 (Ctrl+Y)',
                                                showLabel: false,
                                                onAction: () => { this.doRedo(); }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1362, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.REDO,
                                                    tooltip: '重做 (Ctrl+Y)',
                                                    showLabel: false,
                                                    onAction: () => { this.doRedo(); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.REDO,
                                                tooltip: '重做 (Ctrl+Y)',
                                                showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: ProteusIconName.TRASH,
                                                tooltip: '删除 (Del)',
                                                showLabel: false,
                                                onAction: () => {
                                                    this.deleteSelected();
                                                    this.statusMessage = '已删除';
                                                }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1368, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.TRASH,
                                                    tooltip: '删除 (Del)',
                                                    showLabel: false,
                                                    onAction: () => {
                                                        this.deleteSelected();
                                                        this.statusMessage = '已删除';
                                                    }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.TRASH,
                                                tooltip: '删除 (Del)',
                                                showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: 'History'
                    });
                }
            }, { name: "ProteusToolGroup" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolGroup(this, {
                        title: 'Edit',
                        content: () => {
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: ProteusIconName.COPY,
                                            tooltip: '复制 (Ctrl+C)',
                                            showLabel: false,
                                            onAction: () => { this.doCopy(); }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1379, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.COPY,
                                                tooltip: '复制 (Ctrl+C)',
                                                showLabel: false,
                                                onAction: () => { this.doCopy(); }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.COPY,
                                            tooltip: '复制 (Ctrl+C)',
                                            showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: ProteusIconName.PASTE,
                                            tooltip: '粘贴 (Ctrl+V)',
                                            showLabel: false,
                                            onAction: () => { this.doPaste(); }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1385, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.PASTE,
                                                tooltip: '粘贴 (Ctrl+V)',
                                                showLabel: false,
                                                onAction: () => { this.doPaste(); }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.PASTE,
                                            tooltip: '粘贴 (Ctrl+V)',
                                            showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: ProteusIconName.ROTATE,
                                            tooltip: '旋转 (R)',
                                            showLabel: false,
                                            onAction: () => { this.doRotate(); }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1391, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.ROTATE,
                                                tooltip: '旋转 (R)',
                                                showLabel: false,
                                                onAction: () => { this.doRotate(); }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.ROTATE,
                                            tooltip: '旋转 (R)',
                                            showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: ProteusIconName.MIRROR,
                                            tooltip: '镜像 (F)',
                                            showLabel: false,
                                            onAction: () => { this.doFlip(); }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1397, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.MIRROR,
                                                tooltip: '镜像 (F)',
                                                showLabel: false,
                                                onAction: () => { this.doFlip(); }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.MIRROR,
                                            tooltip: '镜像 (F)',
                                            showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1378, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'Edit',
                            content: () => {
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: ProteusIconName.COPY,
                                                tooltip: '复制 (Ctrl+C)',
                                                showLabel: false,
                                                onAction: () => { this.doCopy(); }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1379, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.COPY,
                                                    tooltip: '复制 (Ctrl+C)',
                                                    showLabel: false,
                                                    onAction: () => { this.doCopy(); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.COPY,
                                                tooltip: '复制 (Ctrl+C)',
                                                showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: ProteusIconName.PASTE,
                                                tooltip: '粘贴 (Ctrl+V)',
                                                showLabel: false,
                                                onAction: () => { this.doPaste(); }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1385, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.PASTE,
                                                    tooltip: '粘贴 (Ctrl+V)',
                                                    showLabel: false,
                                                    onAction: () => { this.doPaste(); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.PASTE,
                                                tooltip: '粘贴 (Ctrl+V)',
                                                showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: ProteusIconName.ROTATE,
                                                tooltip: '旋转 (R)',
                                                showLabel: false,
                                                onAction: () => { this.doRotate(); }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1391, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.ROTATE,
                                                    tooltip: '旋转 (R)',
                                                    showLabel: false,
                                                    onAction: () => { this.doRotate(); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.ROTATE,
                                                tooltip: '旋转 (R)',
                                                showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: ProteusIconName.MIRROR,
                                                tooltip: '镜像 (F)',
                                                showLabel: false,
                                                onAction: () => { this.doFlip(); }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1397, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.MIRROR,
                                                    tooltip: '镜像 (F)',
                                                    showLabel: false,
                                                    onAction: () => { this.doFlip(); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.MIRROR,
                                                tooltip: '镜像 (F)',
                                                showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: 'Edit'
                    });
                }
            }, { name: "ProteusToolGroup" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolGroup(this, {
                        title: 'View',
                        content: () => {
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: ProteusIconName.ZOOM_IN,
                                            tooltip: '放大 (+)',
                                            showLabel: false,
                                            onAction: () => { this.doZoom(1.12); }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1405, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.ZOOM_IN,
                                                tooltip: '放大 (+)',
                                                showLabel: false,
                                                onAction: () => { this.doZoom(1.12); }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.ZOOM_IN,
                                            tooltip: '放大 (+)',
                                            showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: ProteusIconName.ZOOM_OUT,
                                            tooltip: '缩小 (-)',
                                            showLabel: false,
                                            onAction: () => { this.doZoom(1 / 1.12); }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1411, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.ZOOM_OUT,
                                                tooltip: '缩小 (-)',
                                                showLabel: false,
                                                onAction: () => { this.doZoom(1 / 1.12); }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.ZOOM_OUT,
                                            tooltip: '缩小 (-)',
                                            showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: ProteusIconName.FIT,
                                            tooltip: '适应窗口 (Ctrl+0)',
                                            showLabel: false,
                                            onAction: () => { this.doFit(); }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1417, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.FIT,
                                                tooltip: '适应窗口 (Ctrl+0)',
                                                showLabel: false,
                                                onAction: () => { this.doFit(); }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.FIT,
                                            tooltip: '适应窗口 (Ctrl+0)',
                                            showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: ProteusIconName.GRID,
                                            tooltip: '网格 (G)',
                                            showLabel: false,
                                            active: this.gridVisible,
                                            onAction: () => {
                                                this.gridVisible = !this.gridVisible;
                                                this.canvasVersion++;
                                            }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1423, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.GRID,
                                                tooltip: '网格 (G)',
                                                showLabel: false,
                                                active: this.gridVisible,
                                                onAction: () => {
                                                    this.gridVisible = !this.gridVisible;
                                                    this.canvasVersion++;
                                                }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.GRID,
                                            tooltip: '网格 (G)',
                                            showLabel: false,
                                            active: this.gridVisible
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1404, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'View',
                            content: () => {
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: ProteusIconName.ZOOM_IN,
                                                tooltip: '放大 (+)',
                                                showLabel: false,
                                                onAction: () => { this.doZoom(1.12); }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1405, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.ZOOM_IN,
                                                    tooltip: '放大 (+)',
                                                    showLabel: false,
                                                    onAction: () => { this.doZoom(1.12); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.ZOOM_IN,
                                                tooltip: '放大 (+)',
                                                showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: ProteusIconName.ZOOM_OUT,
                                                tooltip: '缩小 (-)',
                                                showLabel: false,
                                                onAction: () => { this.doZoom(1 / 1.12); }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1411, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.ZOOM_OUT,
                                                    tooltip: '缩小 (-)',
                                                    showLabel: false,
                                                    onAction: () => { this.doZoom(1 / 1.12); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.ZOOM_OUT,
                                                tooltip: '缩小 (-)',
                                                showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: ProteusIconName.FIT,
                                                tooltip: '适应窗口 (Ctrl+0)',
                                                showLabel: false,
                                                onAction: () => { this.doFit(); }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1417, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.FIT,
                                                    tooltip: '适应窗口 (Ctrl+0)',
                                                    showLabel: false,
                                                    onAction: () => { this.doFit(); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.FIT,
                                                tooltip: '适应窗口 (Ctrl+0)',
                                                showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: ProteusIconName.GRID,
                                                tooltip: '网格 (G)',
                                                showLabel: false,
                                                active: this.gridVisible,
                                                onAction: () => {
                                                    this.gridVisible = !this.gridVisible;
                                                    this.canvasVersion++;
                                                }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1423, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.GRID,
                                                    tooltip: '网格 (G)',
                                                    showLabel: false,
                                                    active: this.gridVisible,
                                                    onAction: () => {
                                                        this.gridVisible = !this.gridVisible;
                                                        this.canvasVersion++;
                                                    }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.GRID,
                                                tooltip: '网格 (G)',
                                                showLabel: false,
                                                active: this.gridVisible
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: 'View'
                    });
                }
            }, { name: "ProteusToolGroup" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolGroup(this, {
                        title: 'Place',
                        content: () => {
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: ProteusIconName.SELECT,
                                            tooltip: '选择 (S)',
                                            showLabel: false,
                                            active: this.toolMode === PcbToolMode.SELECT,
                                            onAction: () => { this.setToolMode(PcbToolMode.SELECT); }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1435, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.SELECT,
                                                tooltip: '选择 (S)',
                                                showLabel: false,
                                                active: this.toolMode === PcbToolMode.SELECT,
                                                onAction: () => { this.setToolMode(PcbToolMode.SELECT); }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.SELECT,
                                            tooltip: '选择 (S)',
                                            showLabel: false,
                                            active: this.toolMode === PcbToolMode.SELECT
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: ProteusIconName.TRACK,
                                            tooltip: '走线 (X)',
                                            showLabel: false,
                                            active: this.toolMode === PcbToolMode.ROUTE,
                                            onAction: () => { this.setToolMode(PcbToolMode.ROUTE); }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1442, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.TRACK,
                                                tooltip: '走线 (X)',
                                                showLabel: false,
                                                active: this.toolMode === PcbToolMode.ROUTE,
                                                onAction: () => { this.setToolMode(PcbToolMode.ROUTE); }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.TRACK,
                                            tooltip: '走线 (X)',
                                            showLabel: false,
                                            active: this.toolMode === PcbToolMode.ROUTE
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: ProteusIconName.VIA,
                                            tooltip: '过孔 (V)',
                                            showLabel: false,
                                            active: this.toolMode === PcbToolMode.VIA,
                                            onAction: () => { this.setToolMode(PcbToolMode.VIA); }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1449, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.VIA,
                                                tooltip: '过孔 (V)',
                                                showLabel: false,
                                                active: this.toolMode === PcbToolMode.VIA,
                                                onAction: () => { this.setToolMode(PcbToolMode.VIA); }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.VIA,
                                            tooltip: '过孔 (V)',
                                            showLabel: false,
                                            active: this.toolMode === PcbToolMode.VIA
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: ProteusIconName.ZONE,
                                            tooltip: '多边形覆铜 (Z)',
                                            showLabel: false,
                                            active: this.toolMode === PcbToolMode.ZONE_POLY,
                                            onAction: () => { this.setToolMode(PcbToolMode.ZONE_POLY); }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1456, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.ZONE,
                                                tooltip: '多边形覆铜 (Z)',
                                                showLabel: false,
                                                active: this.toolMode === PcbToolMode.ZONE_POLY,
                                                onAction: () => { this.setToolMode(PcbToolMode.ZONE_POLY); }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.ZONE,
                                            tooltip: '多边形覆铜 (Z)',
                                            showLabel: false,
                                            active: this.toolMode === PcbToolMode.ZONE_POLY
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: ProteusIconName.GROUND,
                                            tooltip: '整板覆铜 (Shift+Z)',
                                            showLabel: false,
                                            active: this.toolMode === PcbToolMode.POUR,
                                            onAction: () => { this.setToolMode(PcbToolMode.POUR); }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1463, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.GROUND,
                                                tooltip: '整板覆铜 (Shift+Z)',
                                                showLabel: false,
                                                active: this.toolMode === PcbToolMode.POUR,
                                                onAction: () => { this.setToolMode(PcbToolMode.POUR); }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.GROUND,
                                            tooltip: '整板覆铜 (Shift+Z)',
                                            showLabel: false,
                                            active: this.toolMode === PcbToolMode.POUR
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: ProteusIconName.COMPONENT,
                                            tooltip: '放置封装 (P)',
                                            showLabel: false,
                                            active: this.toolMode === PcbToolMode.PLACE_FP,
                                            onAction: () => { this.setToolMode(PcbToolMode.PLACE_FP); }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1470, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.COMPONENT,
                                                tooltip: '放置封装 (P)',
                                                showLabel: false,
                                                active: this.toolMode === PcbToolMode.PLACE_FP,
                                                onAction: () => { this.setToolMode(PcbToolMode.PLACE_FP); }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.COMPONENT,
                                            tooltip: '放置封装 (P)',
                                            showLabel: false,
                                            active: this.toolMode === PcbToolMode.PLACE_FP
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: ProteusIconName.RULER,
                                            tooltip: '测量 (M)',
                                            showLabel: false,
                                            active: this.toolMode === PcbToolMode.MEASURE,
                                            onAction: () => { this.setToolMode(PcbToolMode.MEASURE); }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1477, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.RULER,
                                                tooltip: '测量 (M)',
                                                showLabel: false,
                                                active: this.toolMode === PcbToolMode.MEASURE,
                                                onAction: () => { this.setToolMode(PcbToolMode.MEASURE); }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.RULER,
                                            tooltip: '测量 (M)',
                                            showLabel: false,
                                            active: this.toolMode === PcbToolMode.MEASURE
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: ProteusIconName.LABEL,
                                            tooltip: '板框 (O)',
                                            showLabel: false,
                                            active: this.toolMode === PcbToolMode.OUTLINE,
                                            onAction: () => { this.setToolMode(PcbToolMode.OUTLINE); }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1484, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.LABEL,
                                                tooltip: '板框 (O)',
                                                showLabel: false,
                                                active: this.toolMode === PcbToolMode.OUTLINE,
                                                onAction: () => { this.setToolMode(PcbToolMode.OUTLINE); }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.LABEL,
                                            tooltip: '板框 (O)',
                                            showLabel: false,
                                            active: this.toolMode === PcbToolMode.OUTLINE
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1434, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'Place',
                            content: () => {
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: ProteusIconName.SELECT,
                                                tooltip: '选择 (S)',
                                                showLabel: false,
                                                active: this.toolMode === PcbToolMode.SELECT,
                                                onAction: () => { this.setToolMode(PcbToolMode.SELECT); }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1435, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.SELECT,
                                                    tooltip: '选择 (S)',
                                                    showLabel: false,
                                                    active: this.toolMode === PcbToolMode.SELECT,
                                                    onAction: () => { this.setToolMode(PcbToolMode.SELECT); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.SELECT,
                                                tooltip: '选择 (S)',
                                                showLabel: false,
                                                active: this.toolMode === PcbToolMode.SELECT
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: ProteusIconName.TRACK,
                                                tooltip: '走线 (X)',
                                                showLabel: false,
                                                active: this.toolMode === PcbToolMode.ROUTE,
                                                onAction: () => { this.setToolMode(PcbToolMode.ROUTE); }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1442, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.TRACK,
                                                    tooltip: '走线 (X)',
                                                    showLabel: false,
                                                    active: this.toolMode === PcbToolMode.ROUTE,
                                                    onAction: () => { this.setToolMode(PcbToolMode.ROUTE); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.TRACK,
                                                tooltip: '走线 (X)',
                                                showLabel: false,
                                                active: this.toolMode === PcbToolMode.ROUTE
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: ProteusIconName.VIA,
                                                tooltip: '过孔 (V)',
                                                showLabel: false,
                                                active: this.toolMode === PcbToolMode.VIA,
                                                onAction: () => { this.setToolMode(PcbToolMode.VIA); }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1449, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.VIA,
                                                    tooltip: '过孔 (V)',
                                                    showLabel: false,
                                                    active: this.toolMode === PcbToolMode.VIA,
                                                    onAction: () => { this.setToolMode(PcbToolMode.VIA); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.VIA,
                                                tooltip: '过孔 (V)',
                                                showLabel: false,
                                                active: this.toolMode === PcbToolMode.VIA
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: ProteusIconName.ZONE,
                                                tooltip: '多边形覆铜 (Z)',
                                                showLabel: false,
                                                active: this.toolMode === PcbToolMode.ZONE_POLY,
                                                onAction: () => { this.setToolMode(PcbToolMode.ZONE_POLY); }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1456, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.ZONE,
                                                    tooltip: '多边形覆铜 (Z)',
                                                    showLabel: false,
                                                    active: this.toolMode === PcbToolMode.ZONE_POLY,
                                                    onAction: () => { this.setToolMode(PcbToolMode.ZONE_POLY); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.ZONE,
                                                tooltip: '多边形覆铜 (Z)',
                                                showLabel: false,
                                                active: this.toolMode === PcbToolMode.ZONE_POLY
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: ProteusIconName.GROUND,
                                                tooltip: '整板覆铜 (Shift+Z)',
                                                showLabel: false,
                                                active: this.toolMode === PcbToolMode.POUR,
                                                onAction: () => { this.setToolMode(PcbToolMode.POUR); }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1463, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.GROUND,
                                                    tooltip: '整板覆铜 (Shift+Z)',
                                                    showLabel: false,
                                                    active: this.toolMode === PcbToolMode.POUR,
                                                    onAction: () => { this.setToolMode(PcbToolMode.POUR); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.GROUND,
                                                tooltip: '整板覆铜 (Shift+Z)',
                                                showLabel: false,
                                                active: this.toolMode === PcbToolMode.POUR
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: ProteusIconName.COMPONENT,
                                                tooltip: '放置封装 (P)',
                                                showLabel: false,
                                                active: this.toolMode === PcbToolMode.PLACE_FP,
                                                onAction: () => { this.setToolMode(PcbToolMode.PLACE_FP); }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1470, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.COMPONENT,
                                                    tooltip: '放置封装 (P)',
                                                    showLabel: false,
                                                    active: this.toolMode === PcbToolMode.PLACE_FP,
                                                    onAction: () => { this.setToolMode(PcbToolMode.PLACE_FP); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.COMPONENT,
                                                tooltip: '放置封装 (P)',
                                                showLabel: false,
                                                active: this.toolMode === PcbToolMode.PLACE_FP
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: ProteusIconName.RULER,
                                                tooltip: '测量 (M)',
                                                showLabel: false,
                                                active: this.toolMode === PcbToolMode.MEASURE,
                                                onAction: () => { this.setToolMode(PcbToolMode.MEASURE); }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1477, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.RULER,
                                                    tooltip: '测量 (M)',
                                                    showLabel: false,
                                                    active: this.toolMode === PcbToolMode.MEASURE,
                                                    onAction: () => { this.setToolMode(PcbToolMode.MEASURE); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.RULER,
                                                tooltip: '测量 (M)',
                                                showLabel: false,
                                                active: this.toolMode === PcbToolMode.MEASURE
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: ProteusIconName.LABEL,
                                                tooltip: '板框 (O)',
                                                showLabel: false,
                                                active: this.toolMode === PcbToolMode.OUTLINE,
                                                onAction: () => { this.setToolMode(PcbToolMode.OUTLINE); }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1484, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.LABEL,
                                                    tooltip: '板框 (O)',
                                                    showLabel: false,
                                                    active: this.toolMode === PcbToolMode.OUTLINE,
                                                    onAction: () => { this.setToolMode(PcbToolMode.OUTLINE); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.LABEL,
                                                tooltip: '板框 (O)',
                                                showLabel: false,
                                                active: this.toolMode === PcbToolMode.OUTLINE
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: 'Place'
                    });
                }
            }, { name: "ProteusToolGroup" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolGroup(this, {
                        title: 'Tools',
                        content: () => {
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: ProteusIconName.AI_LAYOUT,
                                            tooltip: '更新 PCB (U)',
                                            showLabel: false,
                                            onAction: () => { void this.updateFromSchematic(); }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1493, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.AI_LAYOUT,
                                                tooltip: '更新 PCB (U)',
                                                showLabel: false,
                                                onAction: () => { void this.updateFromSchematic(); }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.AI_LAYOUT,
                                            tooltip: '更新 PCB (U)',
                                            showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: ProteusIconName.DRC,
                                            tooltip: 'DRC (F7)',
                                            showLabel: false,
                                            onAction: () => { this.runDrc(); }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1499, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.DRC,
                                                tooltip: 'DRC (F7)',
                                                showLabel: false,
                                                onAction: () => { this.runDrc(); }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.DRC,
                                            tooltip: 'DRC (F7)',
                                            showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: ProteusIconName.AI_ROUTE,
                                            tooltip: '自动布线 (F8)',
                                            showLabel: false,
                                            onAction: () => { this.runAutoRoute(); }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1505, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.AI_ROUTE,
                                                tooltip: '自动布线 (F8)',
                                                showLabel: false,
                                                onAction: () => { this.runAutoRoute(); }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.AI_ROUTE,
                                            tooltip: '自动布线 (F8)',
                                            showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: ProteusIconName.LAYER,
                                            tooltip: '简易 3D 预览',
                                            showLabel: false,
                                            onAction: () => {
                                                const ap = this.getEditor().getAppearance();
                                                const next = !ap.show3d;
                                                this.getEditor().setShow3d(next);
                                                if (next) {
                                                    this.getEditor().setAppearanceMode(PcbAppearanceMode.OVERLAY);
                                                    this.getEditor().setView3dDisplayMode(Pcb3dDisplayMode.REALISTIC);
                                                    this.getEditor().setView3dOrtho(true);
                                                    // 略侧视，便于看层数与过孔跨层
                                                    this.getEditor().setView3dPreset('iso');
                                                }
                                                this.canvasVersion++;
                                                this.statusMessage = next
                                                    ? '3D叠层透视：侧视可数层 · 过孔落点分色 · 拖转看侧面'
                                                    : '已关闭 3D 预览';
                                                tracePcb3d(next ? 'UI_TOGGLE_ON' : 'UI_TOGGLE_OFF', 'toolbar');
                                            }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1511, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.LAYER,
                                                tooltip: '简易 3D 预览',
                                                showLabel: false,
                                                onAction: () => {
                                                    const ap = this.getEditor().getAppearance();
                                                    const next = !ap.show3d;
                                                    this.getEditor().setShow3d(next);
                                                    if (next) {
                                                        this.getEditor().setAppearanceMode(PcbAppearanceMode.OVERLAY);
                                                        this.getEditor().setView3dDisplayMode(Pcb3dDisplayMode.REALISTIC);
                                                        this.getEditor().setView3dOrtho(true);
                                                        // 略侧视，便于看层数与过孔跨层
                                                        this.getEditor().setView3dPreset('iso');
                                                    }
                                                    this.canvasVersion++;
                                                    this.statusMessage = next
                                                        ? '3D叠层透视：侧视可数层 · 过孔落点分色 · 拖转看侧面'
                                                        : '已关闭 3D 预览';
                                                    tracePcb3d(next ? 'UI_TOGGLE_ON' : 'UI_TOGGLE_OFF', 'toolbar');
                                                }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.LAYER,
                                            tooltip: '简易 3D 预览',
                                            showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: ProteusIconName.WIRE,
                                            tooltip: '原理图编辑器',
                                            showLabel: false,
                                            onAction: () => { this.goToSchematic(); }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1533, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.WIRE,
                                                tooltip: '原理图编辑器',
                                                showLabel: false,
                                                onAction: () => { this.goToSchematic(); }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.WIRE,
                                            tooltip: '原理图编辑器',
                                            showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1492, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'Tools',
                            content: () => {
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: ProteusIconName.AI_LAYOUT,
                                                tooltip: '更新 PCB (U)',
                                                showLabel: false,
                                                onAction: () => { void this.updateFromSchematic(); }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1493, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.AI_LAYOUT,
                                                    tooltip: '更新 PCB (U)',
                                                    showLabel: false,
                                                    onAction: () => { void this.updateFromSchematic(); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.AI_LAYOUT,
                                                tooltip: '更新 PCB (U)',
                                                showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: ProteusIconName.DRC,
                                                tooltip: 'DRC (F7)',
                                                showLabel: false,
                                                onAction: () => { this.runDrc(); }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1499, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.DRC,
                                                    tooltip: 'DRC (F7)',
                                                    showLabel: false,
                                                    onAction: () => { this.runDrc(); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.DRC,
                                                tooltip: 'DRC (F7)',
                                                showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: ProteusIconName.AI_ROUTE,
                                                tooltip: '自动布线 (F8)',
                                                showLabel: false,
                                                onAction: () => { this.runAutoRoute(); }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1505, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.AI_ROUTE,
                                                    tooltip: '自动布线 (F8)',
                                                    showLabel: false,
                                                    onAction: () => { this.runAutoRoute(); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.AI_ROUTE,
                                                tooltip: '自动布线 (F8)',
                                                showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: ProteusIconName.LAYER,
                                                tooltip: '简易 3D 预览',
                                                showLabel: false,
                                                onAction: () => {
                                                    const ap = this.getEditor().getAppearance();
                                                    const next = !ap.show3d;
                                                    this.getEditor().setShow3d(next);
                                                    if (next) {
                                                        this.getEditor().setAppearanceMode(PcbAppearanceMode.OVERLAY);
                                                        this.getEditor().setView3dDisplayMode(Pcb3dDisplayMode.REALISTIC);
                                                        this.getEditor().setView3dOrtho(true);
                                                        // 略侧视，便于看层数与过孔跨层
                                                        this.getEditor().setView3dPreset('iso');
                                                    }
                                                    this.canvasVersion++;
                                                    this.statusMessage = next
                                                        ? '3D叠层透视：侧视可数层 · 过孔落点分色 · 拖转看侧面'
                                                        : '已关闭 3D 预览';
                                                    tracePcb3d(next ? 'UI_TOGGLE_ON' : 'UI_TOGGLE_OFF', 'toolbar');
                                                }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1511, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.LAYER,
                                                    tooltip: '简易 3D 预览',
                                                    showLabel: false,
                                                    onAction: () => {
                                                        const ap = this.getEditor().getAppearance();
                                                        const next = !ap.show3d;
                                                        this.getEditor().setShow3d(next);
                                                        if (next) {
                                                            this.getEditor().setAppearanceMode(PcbAppearanceMode.OVERLAY);
                                                            this.getEditor().setView3dDisplayMode(Pcb3dDisplayMode.REALISTIC);
                                                            this.getEditor().setView3dOrtho(true);
                                                            // 略侧视，便于看层数与过孔跨层
                                                            this.getEditor().setView3dPreset('iso');
                                                        }
                                                        this.canvasVersion++;
                                                        this.statusMessage = next
                                                            ? '3D叠层透视：侧视可数层 · 过孔落点分色 · 拖转看侧面'
                                                            : '已关闭 3D 预览';
                                                        tracePcb3d(next ? 'UI_TOGGLE_ON' : 'UI_TOGGLE_OFF', 'toolbar');
                                                    }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.LAYER,
                                                tooltip: '简易 3D 预览',
                                                showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: ProteusIconName.WIRE,
                                                tooltip: '原理图编辑器',
                                                showLabel: false,
                                                onAction: () => { this.goToSchematic(); }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1533, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.WIRE,
                                                    tooltip: '原理图编辑器',
                                                    showLabel: false,
                                                    onAction: () => { this.goToSchematic(); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.WIRE,
                                                tooltip: '原理图编辑器',
                                                showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: 'Tools'
                    });
                }
            }, { name: "ProteusToolGroup" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        Row.pop();
    }
    buildMenuBar(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.height(ProteusDimens.MENU_HEIGHT);
            Row.backgroundColor(ProteusColors.MENU_BG);
            Row.border({ width: { bottom: 1 }, color: ProteusColors.BORDER });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            __Common__.create();
            __Common__.margin({ left: 8, right: 4 });
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusIcon(this, { name: ProteusIconName.LAYER, iconSize: 14, color: ProteusColors.SELECTED }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1553, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            name: ProteusIconName.LAYER,
                            iconSize: 14,
                            color: ProteusColors.SELECTED
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        name: ProteusIconName.LAYER, iconSize: 14, color: ProteusColors.SELECTED
                    });
                }
            }, { name: "ProteusIcon" });
        }
        __Common__.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('PCB Editor');
            Text.fontSize(ProteusFonts.MENU);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusMenuTrigger(this, { label: '文件', entries: this.fileMenuEntries() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1559, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '文件',
                            entries: this.fileMenuEntries()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '文件'
                    });
                }
            }, { name: "ProteusMenuTrigger" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusMenuTrigger(this, { label: '视图', entries: this.viewMenuEntries() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1560, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '视图',
                            entries: this.viewMenuEntries()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '视图'
                    });
                }
            }, { name: "ProteusMenuTrigger" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusMenuTrigger(this, { label: '工具', entries: this.toolMenuEntries() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 1561, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '工具',
                            entries: this.toolMenuEntries()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '工具'
                    });
                }
            }, { name: "ProteusMenuTrigger" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.projectName + (this.unsavedChanges ? ' *' : ''));
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.margin({ right: 12 });
        }, Text);
        Text.pop();
        Row.pop();
    }
    fileMenuEntries(): ProteusMenuEntry[] {
        return [
            { label: '保存', action: () => { void this.saveProject(); } },
            { label: '另存为…', action: () => { void this.saveProjectAs(); } },
            { label: '导出 PCB', action: () => { void this.exportPcb(); } },
            { label: '导出 Gerber', action: () => { void this.exportGerber(); } },
            { label: '返回首页', action: () => { this.goToHome(); } }
        ];
    }
    viewMenuEntries(): ProteusMenuEntry[] {
        const ap = this.getEditor().getAppearance();
        return [
            { label: '适应窗口 (F)', action: () => {
                    this.getEditor().fitBoardInView();
                    this.zoomPercent = Math.round(this.getEditor().getViewport().zoom * 100);
                    this.canvasVersion++;
                } },
            { label: '切换网格', action: () => { this.gridVisible = !this.gridVisible; this.canvasVersion++; } },
            { label: 'instr_trace: 2D/3D 诊断转储', action: () => { this.dumpPcbInstrTrace(); } },
            { label: '显示模式: 叠加', action: () => {
                    this.getEditor().setAppearanceMode(PcbAppearanceMode.OVERLAY);
                    this.canvasVersion++;
                    this.statusMessage = '显示: 叠加';
                } },
            { label: '显示模式: 变暗非活动层', action: () => {
                    this.getEditor().setAppearanceMode(PcbAppearanceMode.DIM_INACTIVE);
                    this.canvasVersion++;
                    this.statusMessage = '显示: 变暗非活动层';
                } },
            { label: '显示模式: 仅活动层', action: () => {
                    this.getEditor().setAppearanceMode(PcbAppearanceMode.ACTIVE_ONLY);
                    this.canvasVersion++;
                    this.statusMessage = '显示: 仅活动层';
                } },
            { label: ap.showRatsnest ? '隐藏飞线' : '显示飞线', action: () => {
                    this.getEditor().setShowRatsnest(!ap.showRatsnest);
                    this.canvasVersion++;
                } },
            { label: ap.hideZones ? '显示覆铜' : '隐藏覆铜', action: () => {
                    this.getEditor().setHideZones(!ap.hideZones);
                    this.canvasVersion++;
                } },
            { label: ap.showPadNumbers ? '隐藏焊盘编号' : '显示焊盘编号', action: () => {
                    this.getEditor().setShowPadNumbers(!ap.showPadNumbers);
                    this.canvasVersion++;
                } },
            { label: ap.show3d ? '关闭 3D 预览' : '打开 3D 预览', action: () => {
                    const next = !ap.show3d;
                    this.getEditor().setShow3d(next);
                    if (next) {
                        this.getEditor().setAppearanceMode(PcbAppearanceMode.OVERLAY);
                        this.getEditor().setView3dDisplayMode(Pcb3dDisplayMode.REALISTIC);
                        this.getEditor().setView3dOrtho(true);
                        this.getEditor().setView3dPreset('iso');
                    }
                    this.canvasVersion++;
                    tracePcb3d(next ? 'UI_TOGGLE_ON' : 'UI_TOGGLE_OFF', 'menu');
                    this.dumpPcbInstrTrace();
                    this.statusMessage = next
                        ? '3D叠层透视：侧视可数层 · 过孔落点分色'
                        : '已关 3D · instr_trace 已写入 2D 诊断';
                } },
            { label: '复位 3D 视角', action: () => {
                    this.getEditor().resetView3d();
                    this.canvasVersion++;
                    this.statusMessage = '3D 视角已复位（等轴测·正交）';
                } },
            { label: ap.view3dOrtho !== false ? '3D：切换透视' : '3D：切换正交', action: () => {
                    const next = !(ap.view3dOrtho !== false);
                    this.getEditor().setView3dOrtho(next);
                    this.canvasVersion++;
                    this.statusMessage = next ? '3D 正交投影' : '3D 透视投影';
                } },
            { label: '3D 等轴测', action: () => {
                    this.getEditor().setView3dPreset('iso');
                    this.canvasVersion++;
                    this.statusMessage = '3D 等轴测';
                } },
            { label: '3D 顶视图', action: () => {
                    this.getEditor().setView3dPreset('top');
                    this.canvasVersion++;
                    this.statusMessage = '3D 顶视图';
                } },
            { label: '3D 前视图', action: () => {
                    this.getEditor().setView3dPreset('front');
                    this.canvasVersion++;
                    this.statusMessage = '3D 前视图';
                } },
            { label: '3D 写实模式', action: () => {
                    this.getEditor().setView3dDisplayMode(Pcb3dDisplayMode.REALISTIC);
                    this.getEditor().setView3dPbr(true);
                    this.canvasVersion++;
                    this.statusMessage = '3D 写实 PBR+IBL+MSAA';
                } },
            { label: ap.view3dPbr === true ? '关闭真 PBR(伪3D)' : '开启真 PBR', action: () => {
                    const next = !(ap.view3dPbr === true);
                    this.getEditor().setView3dPbr(next);
                    this.canvasVersion++;
                    this.statusMessage = next ? '真 PBR 已开' : '已切伪 3D';
                } },
            { label: ap.view3dMsaa >= 4 ? 'MSAA → 1x' : 'MSAA → 4x', action: () => {
                    const next = ap.view3dMsaa >= 4 ? 1 : 4;
                    this.getEditor().setView3dMsaa(next);
                    this.canvasVersion++;
                    this.statusMessage = `MSAA ${next}x`;
                } },
            { label: '导入 STEP→选中封装', action: () => { void this.importStepForSelection(); } },
            { label: '3D 半透明(内层)', action: () => {
                    this.getEditor().setView3dDisplayMode(Pcb3dDisplayMode.XRAY);
                    this.canvasVersion++;
                    this.statusMessage = '3D 半透明分层';
                } },
            { label: '3D 爆炸分层', action: () => {
                    this.getEditor().setView3dDisplayMode(Pcb3dDisplayMode.EXPLODE);
                    this.canvasVersion++;
                    this.statusMessage = '3D 爆炸视图';
                } },
            { label: '3D 剖切视图', action: () => {
                    this.getEditor().setView3dDisplayMode(Pcb3dDisplayMode.CUTAWAY);
                    this.getEditor().setView3dCutFraction(0.55);
                    this.canvasVersion++;
                    this.statusMessage = '3D 剖切（可再调剖切比例）';
                } },
            { label: '3D 剖切+10%', action: () => {
                    const f = (ap.view3dCutFraction !== undefined ? ap.view3dCutFraction : 0.55) + 0.1;
                    this.getEditor().setView3dCutFraction(f > 0.95 ? 0.15 : f);
                    this.getEditor().setView3dDisplayMode(Pcb3dDisplayMode.CUTAWAY);
                    this.canvasVersion++;
                } },
            { label: '3D 高度色阶', action: () => {
                    this.getEditor().setView3dDisplayMode(Pcb3dDisplayMode.HEIGHTMAP);
                    this.canvasVersion++;
                    this.statusMessage = '3D 高度色阶';
                } },
            { label: ap.view3dMeasure ? '关闭 3D 测量' : '开启 3D 测量', action: () => {
                    const next = !ap.view3dMeasure;
                    this.getEditor().setView3dMeasure(next);
                    this.canvasVersion++;
                    this.statusMessage = next ? '3D 测量：单击两点测距' : '已关闭 3D 测量';
                } },
            { label: ap.view3dShowInterference ? '隐藏干涉标红' : '显示干涉检查', action: () => {
                    const next = !ap.view3dShowInterference;
                    this.getEditor().setView3dShowInterference(next);
                    this.canvasVersion++;
                    if (next) {
                        const doc = this.getEditor().getDocument();
                        const n = doc ? Pcb3dRenderer.listInterference(doc).length : 0;
                        this.statusMessage = n === 0 ? '干涉检查：无重叠' : `干涉检查：${n} 处已标红`;
                    }
                    else {
                        this.statusMessage = '已隐藏干涉标红';
                    }
                } },
            { label: '导出 3D STEP(简化)', action: () => { void this.export3dStep(); } },
            { label: '导出干涉报告', action: () => { void this.export3dInterference(); } },
            { label: '层叠: 2 层铜', action: () => {
                    if (this.getEditor().setCopperLayerCount(2)) {
                        this.refreshLayers();
                        this.syncActiveLayerFromEditor();
                        this.syncStackUiFromEditor();
                        this.canvasVersion++;
                        this.statusMessage = '层叠已切换为 2 层';
                    }
                } },
            { label: '层叠: 4 层铜', action: () => {
                    if (this.getEditor().setCopperLayerCount(4)) {
                        this.refreshLayers();
                        this.syncActiveLayerFromEditor();
                        this.syncStackUiFromEditor();
                        this.canvasVersion++;
                        this.statusMessage = '层叠已切换为 4 层';
                    }
                } },
            { label: '层叠: 6 层铜', action: () => {
                    if (this.getEditor().setCopperLayerCount(6)) {
                        this.refreshLayers();
                        this.syncActiveLayerFromEditor();
                        this.syncStackUiFromEditor();
                        this.canvasVersion++;
                        this.statusMessage = '层叠已切换为 6 层';
                    }
                } },
            { label: '撤销 (Ctrl+Z)', action: () => {
                    if (this.getEditor().undo()) {
                        this.syncPcbToProject();
                        this.refreshSelectedInfo();
                        this.canvasVersion++;
                    }
                } },
            { label: '重做 (Ctrl+Y)', action: () => {
                    if (this.getEditor().redo()) {
                        this.syncPcbToProject();
                        this.refreshSelectedInfo();
                        this.canvasVersion++;
                    }
                } }
        ];
    }
    toolMenuEntries(): ProteusMenuEntry[] {
        return [
            { label: '更新 PCB（从原理图，需 ERC 通过）', action: () => { void this.updateFromSchematic(); } },
            { label: '回写原理图（反向标注）', action: () => { this.reverseToSchematic(); } },
            { label: 'DRC 检查', action: () => { this.runDrc(); } },
            { label: 'instr_trace: 2D/3D 诊断转储', action: () => { this.dumpPcbInstrTrace(); } },
            { label: '自动布线', action: () => { this.runAutoRoute(); } },
            { label: '复制 (Ctrl+C) / 粘贴 (Ctrl+V)', action: () => {
                    const count = this.getEditor().pasteClipboard();
                    this.statusMessage = count > 0 ? `已粘贴 ${count} 个` : '剪贴板为空，先 Ctrl+C 复制';
                    if (count > 0) {
                        this.syncPcbToProject();
                        this.canvasVersion++;
                    }
                } },
            { label: '原理图编辑器', action: () => { this.goToSchematic(); } }
        ];
    }
    rerender() {
        this.updateDirtyElements();
    }
    static getEntryName(): string {
        return "PcbPage";
    }
}
registerNamedRoute(() => new PcbPage(undefined, {}), "", { bundleName: "com.elecdraw.aischsim", moduleName: "entry", pagePath: "pages/PcbPage", pageFullPath: "entry/src/main/ets/pages/PcbPage", integratedHsp: "false", moduleType: "followWithHap" });
