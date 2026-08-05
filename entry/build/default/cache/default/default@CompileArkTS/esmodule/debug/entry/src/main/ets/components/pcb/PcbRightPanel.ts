if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface PcbRightPanel_Params {
    themeRev?: number;
    panelWidth?: number;
    selectionInfo?: string;
    selectedZoneId?: string;
    selectedZoneCount?: number;
    activeLayer?: PcbLayerId;
    drcViolations?: PcbDrcViolation[];
    selectedFpDefId?: string;
    copperCount?: number;
    stackLayers?: PcbStackLayer[];
    viaKind?: PcbViaKind;
    viaFrom?: PcbLayerId;
    viaTo?: PcbLayerId;
    copperLayerIds?: PcbLayerId[];
    routeCornerMode?: PcbRouteCornerMode;
    stackFocusTick?: number;
    stackHighlightCopperIds?: PcbLayerId[];
    onZonePriority?: (delta: number) => void;
    onZoneThermal?: () => void;
    onZoneRefreshCutouts?: () => void;
    onPickFootprint?: (defId: string) => void;
    onSetRouteCorner?: (mode: PcbRouteCornerMode) => void;
    onSetCopperCount?: (n: number) => void;
    onSetViaKind?: (k: PcbViaKind) => void;
    onSetViaSpan?: (from: PcbLayerId, to: PcbLayerId) => void;
    onSetAppearanceActiveOnly?: () => void;
    onSetAppearanceDim?: () => void;
    onSetAppearanceOverlay?: () => void;
    onSelectStackCopper?: (id: PcbLayerId) => void;
    onRunDrc?: () => void;
    onPcbTemplateInserted?: () => void;
    onExportGerber?: () => void;
    getPcbDocument?: () => PcbDocument | null;
    gerberDocRev?: number;
    aiTabFocusTick?: number;
    statusMessage?: string;
    aiBusy?: boolean;
    aiProgress?: number;
    aiStage?: string;
    onAiRouteDone?: () => void;
    activeTab?: PcbRightTab;
    fpDefs?: PcbFootprintDef[];
    teachStatus?: string;
}
import { PcbDrcSeverity, PcbLayerId, PcbViaKind, PcbRouteCornerMode, PcbStackLayerType, getGlobalPcbFootprintLibrary } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { PcbDrcViolation, PcbFootprintDef, PcbStackLayer, PcbDocument } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { ProteusColors, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import { PROTEUS_THEME_REV_KEY } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ThemeManager";
import { ProteusClassicBtn, ProteusPanelTitle, ProteusSidebarTab } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import { ProteusIconName } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusIcons";
import { PcbTeachingPanel } from "@bundle:com.elecdraw.aischsim/entry/ets/components/pcb/PcbTeachingPanel";
import { PcbGerberPreview } from "@bundle:com.elecdraw.aischsim/entry/ets/components/pcb/PcbGerberPreview";
import { PcbAiRoutePanel } from "@bundle:com.elecdraw.aischsim/entry/ets/components/pcb/PcbAiRoutePanel";
enum PcbRightTab {
    PROPERTIES = 0,
    DRC = 1,
    LIBRARY = 2,
    STACK = 3,
    GERBER = 4,
    TEACHING = 5,
    AI_ROUTE = 6
}
export class PcbRightPanel extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__panelWidth = new SynchedPropertySimpleOneWayPU(params.panelWidth, this, "panelWidth");
        this.__selectionInfo = new SynchedPropertySimpleOneWayPU(params.selectionInfo, this, "selectionInfo");
        this.__selectedZoneId = new SynchedPropertySimpleOneWayPU(params.selectedZoneId, this, "selectedZoneId");
        this.__selectedZoneCount = new SynchedPropertySimpleOneWayPU(params.selectedZoneCount, this, "selectedZoneCount");
        this.__activeLayer = new SynchedPropertySimpleOneWayPU(params.activeLayer, this, "activeLayer");
        this.__drcViolations = new SynchedPropertyObjectOneWayPU(params.drcViolations, this, "drcViolations");
        this.__selectedFpDefId = new SynchedPropertySimpleOneWayPU(params.selectedFpDefId, this, "selectedFpDefId");
        this.__copperCount = new SynchedPropertySimpleOneWayPU(params.copperCount, this, "copperCount");
        this.__stackLayers = new SynchedPropertyObjectOneWayPU(params.stackLayers, this, "stackLayers");
        this.__viaKind = new SynchedPropertySimpleOneWayPU(params.viaKind, this, "viaKind");
        this.__viaFrom = new SynchedPropertySimpleOneWayPU(params.viaFrom, this, "viaFrom");
        this.__viaTo = new SynchedPropertySimpleOneWayPU(params.viaTo, this, "viaTo");
        this.__copperLayerIds = new SynchedPropertyObjectOneWayPU(params.copperLayerIds, this, "copperLayerIds");
        this.__routeCornerMode = new SynchedPropertySimpleOneWayPU(params.routeCornerMode, this, "routeCornerMode");
        this.__stackFocusTick = new SynchedPropertySimpleOneWayPU(params.stackFocusTick, this, "stackFocusTick");
        this.__stackHighlightCopperIds = new SynchedPropertyObjectOneWayPU(params.stackHighlightCopperIds, this, "stackHighlightCopperIds");
        this.onZonePriority = (_d: number) => { };
        this.onZoneThermal = () => { };
        this.onZoneRefreshCutouts = () => { };
        this.onPickFootprint = (_id: string) => { };
        this.onSetRouteCorner = (_m: PcbRouteCornerMode) => { };
        this.onSetCopperCount = (_n: number) => { };
        this.onSetViaKind = (_k: PcbViaKind) => { };
        this.onSetViaSpan = (_f: PcbLayerId, _t: PcbLayerId) => { };
        this.onSetAppearanceActiveOnly = () => { };
        this.onSetAppearanceDim = () => { };
        this.onSetAppearanceOverlay = () => { };
        this.onSelectStackCopper = (_id: PcbLayerId) => { };
        this.onRunDrc = () => { };
        this.onPcbTemplateInserted = () => { };
        this.onExportGerber = () => { };
        this.getPcbDocument = () => null;
        this.__gerberDocRev = new SynchedPropertySimpleOneWayPU(params.gerberDocRev, this, "gerberDocRev");
        this.__aiTabFocusTick = new SynchedPropertySimpleOneWayPU(params.aiTabFocusTick, this, "aiTabFocusTick");
        this.__statusMessage = new SynchedPropertySimpleTwoWayPU(params.statusMessage, this, "statusMessage");
        this.__aiBusy = new SynchedPropertySimpleTwoWayPU(params.aiBusy, this, "aiBusy");
        this.__aiProgress = new SynchedPropertySimpleTwoWayPU(params.aiProgress, this, "aiProgress");
        this.__aiStage = new SynchedPropertySimpleTwoWayPU(params.aiStage, this, "aiStage");
        this.onAiRouteDone = () => { };
        this.__activeTab = new ObservedPropertySimplePU(PcbRightTab.PROPERTIES, this, "activeTab");
        this.__fpDefs = new ObservedPropertyObjectPU([], this, "fpDefs");
        this.__teachStatus = new ObservedPropertySimplePU('', this, "teachStatus");
        this.setInitiallyProvidedValue(params);
        this.declareWatch("stackFocusTick", this.onStackFocusTickChange);
        this.declareWatch("aiTabFocusTick", this.onAiTabFocusTick);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: PcbRightPanel_Params) {
        if (params.panelWidth === undefined) {
            this.__panelWidth.set(260);
        }
        if (params.selectionInfo === undefined) {
            this.__selectionInfo.set('');
        }
        if (params.selectedZoneId === undefined) {
            this.__selectedZoneId.set('');
        }
        if (params.selectedZoneCount === undefined) {
            this.__selectedZoneCount.set(0);
        }
        if (params.activeLayer === undefined) {
            this.__activeLayer.set(PcbLayerId.F_CU);
        }
        if (params.drcViolations === undefined) {
            this.__drcViolations.set([]);
        }
        if (params.selectedFpDefId === undefined) {
            this.__selectedFpDefId.set('');
        }
        if (params.copperCount === undefined) {
            this.__copperCount.set(2);
        }
        if (params.stackLayers === undefined) {
            this.__stackLayers.set([]);
        }
        if (params.viaKind === undefined) {
            this.__viaKind.set(PcbViaKind.THROUGH);
        }
        if (params.viaFrom === undefined) {
            this.__viaFrom.set(PcbLayerId.F_CU);
        }
        if (params.viaTo === undefined) {
            this.__viaTo.set(PcbLayerId.B_CU);
        }
        if (params.copperLayerIds === undefined) {
            this.__copperLayerIds.set([PcbLayerId.F_CU, PcbLayerId.B_CU]);
        }
        if (params.routeCornerMode === undefined) {
            this.__routeCornerMode.set(PcbRouteCornerMode.ORTHO45);
        }
        if (params.stackFocusTick === undefined) {
            this.__stackFocusTick.set(0);
        }
        if (params.stackHighlightCopperIds === undefined) {
            this.__stackHighlightCopperIds.set([]);
        }
        if (params.onZonePriority !== undefined) {
            this.onZonePriority = params.onZonePriority;
        }
        if (params.onZoneThermal !== undefined) {
            this.onZoneThermal = params.onZoneThermal;
        }
        if (params.onZoneRefreshCutouts !== undefined) {
            this.onZoneRefreshCutouts = params.onZoneRefreshCutouts;
        }
        if (params.onPickFootprint !== undefined) {
            this.onPickFootprint = params.onPickFootprint;
        }
        if (params.onSetRouteCorner !== undefined) {
            this.onSetRouteCorner = params.onSetRouteCorner;
        }
        if (params.onSetCopperCount !== undefined) {
            this.onSetCopperCount = params.onSetCopperCount;
        }
        if (params.onSetViaKind !== undefined) {
            this.onSetViaKind = params.onSetViaKind;
        }
        if (params.onSetViaSpan !== undefined) {
            this.onSetViaSpan = params.onSetViaSpan;
        }
        if (params.onSetAppearanceActiveOnly !== undefined) {
            this.onSetAppearanceActiveOnly = params.onSetAppearanceActiveOnly;
        }
        if (params.onSetAppearanceDim !== undefined) {
            this.onSetAppearanceDim = params.onSetAppearanceDim;
        }
        if (params.onSetAppearanceOverlay !== undefined) {
            this.onSetAppearanceOverlay = params.onSetAppearanceOverlay;
        }
        if (params.onSelectStackCopper !== undefined) {
            this.onSelectStackCopper = params.onSelectStackCopper;
        }
        if (params.onRunDrc !== undefined) {
            this.onRunDrc = params.onRunDrc;
        }
        if (params.onPcbTemplateInserted !== undefined) {
            this.onPcbTemplateInserted = params.onPcbTemplateInserted;
        }
        if (params.onExportGerber !== undefined) {
            this.onExportGerber = params.onExportGerber;
        }
        if (params.getPcbDocument !== undefined) {
            this.getPcbDocument = params.getPcbDocument;
        }
        if (params.gerberDocRev === undefined) {
            this.__gerberDocRev.set(0);
        }
        if (params.aiTabFocusTick === undefined) {
            this.__aiTabFocusTick.set(0);
        }
        if (params.onAiRouteDone !== undefined) {
            this.onAiRouteDone = params.onAiRouteDone;
        }
        if (params.activeTab !== undefined) {
            this.activeTab = params.activeTab;
        }
        if (params.fpDefs !== undefined) {
            this.fpDefs = params.fpDefs;
        }
        if (params.teachStatus !== undefined) {
            this.teachStatus = params.teachStatus;
        }
    }
    updateStateVars(params: PcbRightPanel_Params) {
        this.__panelWidth.reset(params.panelWidth);
        this.__selectionInfo.reset(params.selectionInfo);
        this.__selectedZoneId.reset(params.selectedZoneId);
        this.__selectedZoneCount.reset(params.selectedZoneCount);
        this.__activeLayer.reset(params.activeLayer);
        this.__drcViolations.reset(params.drcViolations);
        this.__selectedFpDefId.reset(params.selectedFpDefId);
        this.__copperCount.reset(params.copperCount);
        this.__stackLayers.reset(params.stackLayers);
        this.__viaKind.reset(params.viaKind);
        this.__viaFrom.reset(params.viaFrom);
        this.__viaTo.reset(params.viaTo);
        this.__copperLayerIds.reset(params.copperLayerIds);
        this.__routeCornerMode.reset(params.routeCornerMode);
        this.__stackFocusTick.reset(params.stackFocusTick);
        this.__stackHighlightCopperIds.reset(params.stackHighlightCopperIds);
        this.__gerberDocRev.reset(params.gerberDocRev);
        this.__aiTabFocusTick.reset(params.aiTabFocusTick);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__panelWidth.purgeDependencyOnElmtId(rmElmtId);
        this.__selectionInfo.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedZoneId.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedZoneCount.purgeDependencyOnElmtId(rmElmtId);
        this.__activeLayer.purgeDependencyOnElmtId(rmElmtId);
        this.__drcViolations.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedFpDefId.purgeDependencyOnElmtId(rmElmtId);
        this.__copperCount.purgeDependencyOnElmtId(rmElmtId);
        this.__stackLayers.purgeDependencyOnElmtId(rmElmtId);
        this.__viaKind.purgeDependencyOnElmtId(rmElmtId);
        this.__viaFrom.purgeDependencyOnElmtId(rmElmtId);
        this.__viaTo.purgeDependencyOnElmtId(rmElmtId);
        this.__copperLayerIds.purgeDependencyOnElmtId(rmElmtId);
        this.__routeCornerMode.purgeDependencyOnElmtId(rmElmtId);
        this.__stackFocusTick.purgeDependencyOnElmtId(rmElmtId);
        this.__stackHighlightCopperIds.purgeDependencyOnElmtId(rmElmtId);
        this.__gerberDocRev.purgeDependencyOnElmtId(rmElmtId);
        this.__aiTabFocusTick.purgeDependencyOnElmtId(rmElmtId);
        this.__statusMessage.purgeDependencyOnElmtId(rmElmtId);
        this.__aiBusy.purgeDependencyOnElmtId(rmElmtId);
        this.__aiProgress.purgeDependencyOnElmtId(rmElmtId);
        this.__aiStage.purgeDependencyOnElmtId(rmElmtId);
        this.__activeTab.purgeDependencyOnElmtId(rmElmtId);
        this.__fpDefs.purgeDependencyOnElmtId(rmElmtId);
        this.__teachStatus.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__panelWidth.aboutToBeDeleted();
        this.__selectionInfo.aboutToBeDeleted();
        this.__selectedZoneId.aboutToBeDeleted();
        this.__selectedZoneCount.aboutToBeDeleted();
        this.__activeLayer.aboutToBeDeleted();
        this.__drcViolations.aboutToBeDeleted();
        this.__selectedFpDefId.aboutToBeDeleted();
        this.__copperCount.aboutToBeDeleted();
        this.__stackLayers.aboutToBeDeleted();
        this.__viaKind.aboutToBeDeleted();
        this.__viaFrom.aboutToBeDeleted();
        this.__viaTo.aboutToBeDeleted();
        this.__copperLayerIds.aboutToBeDeleted();
        this.__routeCornerMode.aboutToBeDeleted();
        this.__stackFocusTick.aboutToBeDeleted();
        this.__stackHighlightCopperIds.aboutToBeDeleted();
        this.__gerberDocRev.aboutToBeDeleted();
        this.__aiTabFocusTick.aboutToBeDeleted();
        this.__statusMessage.aboutToBeDeleted();
        this.__aiBusy.aboutToBeDeleted();
        this.__aiProgress.aboutToBeDeleted();
        this.__aiStage.aboutToBeDeleted();
        this.__activeTab.aboutToBeDeleted();
        this.__fpDefs.aboutToBeDeleted();
        this.__teachStatus.aboutToBeDeleted();
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
    private __panelWidth: SynchedPropertySimpleOneWayPU<number>;
    get panelWidth() {
        return this.__panelWidth.get();
    }
    set panelWidth(newValue: number) {
        this.__panelWidth.set(newValue);
    }
    private __selectionInfo: SynchedPropertySimpleOneWayPU<string>;
    get selectionInfo() {
        return this.__selectionInfo.get();
    }
    set selectionInfo(newValue: string) {
        this.__selectionInfo.set(newValue);
    }
    private __selectedZoneId: SynchedPropertySimpleOneWayPU<string>;
    get selectedZoneId() {
        return this.__selectedZoneId.get();
    }
    set selectedZoneId(newValue: string) {
        this.__selectedZoneId.set(newValue);
    }
    private __selectedZoneCount: SynchedPropertySimpleOneWayPU<number>;
    get selectedZoneCount() {
        return this.__selectedZoneCount.get();
    }
    set selectedZoneCount(newValue: number) {
        this.__selectedZoneCount.set(newValue);
    }
    private __activeLayer: SynchedPropertySimpleOneWayPU<PcbLayerId>;
    get activeLayer() {
        return this.__activeLayer.get();
    }
    set activeLayer(newValue: PcbLayerId) {
        this.__activeLayer.set(newValue);
    }
    private __drcViolations: SynchedPropertySimpleOneWayPU<PcbDrcViolation[]>;
    get drcViolations() {
        return this.__drcViolations.get();
    }
    set drcViolations(newValue: PcbDrcViolation[]) {
        this.__drcViolations.set(newValue);
    }
    private __selectedFpDefId: SynchedPropertySimpleOneWayPU<string>;
    get selectedFpDefId() {
        return this.__selectedFpDefId.get();
    }
    set selectedFpDefId(newValue: string) {
        this.__selectedFpDefId.set(newValue);
    }
    private __copperCount: SynchedPropertySimpleOneWayPU<number>;
    get copperCount() {
        return this.__copperCount.get();
    }
    set copperCount(newValue: number) {
        this.__copperCount.set(newValue);
    }
    private __stackLayers: SynchedPropertySimpleOneWayPU<PcbStackLayer[]>;
    get stackLayers() {
        return this.__stackLayers.get();
    }
    set stackLayers(newValue: PcbStackLayer[]) {
        this.__stackLayers.set(newValue);
    }
    private __viaKind: SynchedPropertySimpleOneWayPU<PcbViaKind>;
    get viaKind() {
        return this.__viaKind.get();
    }
    set viaKind(newValue: PcbViaKind) {
        this.__viaKind.set(newValue);
    }
    private __viaFrom: SynchedPropertySimpleOneWayPU<PcbLayerId>;
    get viaFrom() {
        return this.__viaFrom.get();
    }
    set viaFrom(newValue: PcbLayerId) {
        this.__viaFrom.set(newValue);
    }
    private __viaTo: SynchedPropertySimpleOneWayPU<PcbLayerId>;
    get viaTo() {
        return this.__viaTo.get();
    }
    set viaTo(newValue: PcbLayerId) {
        this.__viaTo.set(newValue);
    }
    private __copperLayerIds: SynchedPropertySimpleOneWayPU<PcbLayerId[]>;
    get copperLayerIds() {
        return this.__copperLayerIds.get();
    }
    set copperLayerIds(newValue: PcbLayerId[]) {
        this.__copperLayerIds.set(newValue);
    }
    private __routeCornerMode: SynchedPropertySimpleOneWayPU<PcbRouteCornerMode>;
    get routeCornerMode() {
        return this.__routeCornerMode.get();
    }
    set routeCornerMode(newValue: PcbRouteCornerMode) {
        this.__routeCornerMode.set(newValue);
    }
    /** 2D/3D 点选铜对象后递增 → 切到层栈并高亮对应 Cu 行 */
    private __stackFocusTick: SynchedPropertySimpleOneWayPU<number>;
    get stackFocusTick() {
        return this.__stackFocusTick.get();
    }
    set stackFocusTick(newValue: number) {
        this.__stackFocusTick.set(newValue);
    }
    /** 层栈高亮铜层（过孔可含多个跨越层） */
    private __stackHighlightCopperIds: SynchedPropertySimpleOneWayPU<PcbLayerId[]>;
    get stackHighlightCopperIds() {
        return this.__stackHighlightCopperIds.get();
    }
    set stackHighlightCopperIds(newValue: PcbLayerId[]) {
        this.__stackHighlightCopperIds.set(newValue);
    }
    private onZonePriority: (delta: number) => void;
    private onZoneThermal: () => void;
    private onZoneRefreshCutouts: () => void;
    private onPickFootprint: (defId: string) => void;
    private onSetRouteCorner: (mode: PcbRouteCornerMode) => void;
    private onSetCopperCount: (n: number) => void;
    private onSetViaKind: (k: PcbViaKind) => void;
    private onSetViaSpan: (from: PcbLayerId, to: PcbLayerId) => void;
    private onSetAppearanceActiveOnly: () => void;
    private onSetAppearanceDim: () => void;
    private onSetAppearanceOverlay: () => void;
    private onSelectStackCopper: (id: PcbLayerId) => void;
    private onRunDrc: () => void;
    private onPcbTemplateInserted: () => void;
    private onExportGerber: () => void;
    private getPcbDocument: () => PcbDocument | null;
    private __gerberDocRev: SynchedPropertySimpleOneWayPU<number>;
    get gerberDocRev() {
        return this.__gerberDocRev.get();
    }
    set gerberDocRev(newValue: number) {
        this.__gerberDocRev.set(newValue);
    }
    /** 外部请求切到 AI 布线 Tab（递增） */
    private __aiTabFocusTick: SynchedPropertySimpleOneWayPU<number>;
    get aiTabFocusTick() {
        return this.__aiTabFocusTick.get();
    }
    set aiTabFocusTick(newValue: number) {
        this.__aiTabFocusTick.set(newValue);
    }
    private __statusMessage: SynchedPropertySimpleTwoWayPU<string>;
    get statusMessage() {
        return this.__statusMessage.get();
    }
    set statusMessage(newValue: string) {
        this.__statusMessage.set(newValue);
    }
    private __aiBusy: SynchedPropertySimpleTwoWayPU<boolean>;
    get aiBusy() {
        return this.__aiBusy.get();
    }
    set aiBusy(newValue: boolean) {
        this.__aiBusy.set(newValue);
    }
    private __aiProgress: SynchedPropertySimpleTwoWayPU<number>;
    get aiProgress() {
        return this.__aiProgress.get();
    }
    set aiProgress(newValue: number) {
        this.__aiProgress.set(newValue);
    }
    private __aiStage: SynchedPropertySimpleTwoWayPU<string>;
    get aiStage() {
        return this.__aiStage.get();
    }
    set aiStage(newValue: string) {
        this.__aiStage.set(newValue);
    }
    private onAiRouteDone: () => void;
    private __activeTab: ObservedPropertySimplePU<PcbRightTab>;
    get activeTab() {
        return this.__activeTab.get();
    }
    set activeTab(newValue: PcbRightTab) {
        this.__activeTab.set(newValue);
    }
    private __fpDefs: ObservedPropertyObjectPU<PcbFootprintDef[]>;
    get fpDefs() {
        return this.__fpDefs.get();
    }
    set fpDefs(newValue: PcbFootprintDef[]) {
        this.__fpDefs.set(newValue);
    }
    private __teachStatus: ObservedPropertySimplePU<string>;
    get teachStatus() {
        return this.__teachStatus.get();
    }
    set teachStatus(newValue: string) {
        this.__teachStatus.set(newValue);
    }
    aboutToAppear(): void {
        this.fpDefs = getGlobalPcbFootprintLibrary().listDefs();
    }
    private onStackFocusTickChange(): void {
        if (this.stackFocusTick > 0) {
            this.activeTab = PcbRightTab.STACK;
        }
    }
    private onAiTabFocusTick(): void {
        if (this.aiTabFocusTick > 0) {
            this.activeTab = PcbRightTab.AI_ROUTE;
        }
    }
    private panelTitle(): string {
        if (this.activeTab === PcbRightTab.DRC) {
            return 'DRC';
        }
        if (this.activeTab === PcbRightTab.LIBRARY) {
            return '封装库';
        }
        if (this.activeTab === PcbRightTab.STACK) {
            return '层栈';
        }
        if (this.activeTab === PcbRightTab.GERBER) {
            return 'Gerber';
        }
        if (this.activeTab === PcbRightTab.TEACHING) {
            return '教学';
        }
        if (this.activeTab === PcbRightTab.AI_ROUTE) {
            return 'AI 布线';
        }
        return '属性';
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(this.panelWidth);
            Column.height('100%');
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.border({ width: { left: 1 }, color: ProteusColors.DIVIDER });
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusPanelTitle(this, { title: this.panelTitle() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 117, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: this.panelTitle()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: this.panelTitle()
                    });
                }
            }, { name: "ProteusPanelTitle" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.layoutWeight(1);
            Row.width('100%');
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.activeTab === PcbRightTab.PROPERTIES) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.buildPropertiesTab.bind(this)();
                });
            }
            else if (this.activeTab === PcbRightTab.DRC) {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.buildDrcTab.bind(this)();
                });
            }
            else if (this.activeTab === PcbRightTab.LIBRARY) {
                this.ifElseBranchUpdateFunction(2, () => {
                    this.buildLibraryTab.bind(this)();
                });
            }
            else if (this.activeTab === PcbRightTab.STACK) {
                this.ifElseBranchUpdateFunction(3, () => {
                    this.buildStackTab.bind(this)();
                });
            }
            else if (this.activeTab === PcbRightTab.GERBER) {
                this.ifElseBranchUpdateFunction(4, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        __Common__.create();
                        __Common__.layoutWeight(1);
                        __Common__.height('100%');
                    }, __Common__);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new PcbGerberPreview(this, {
                                    docRev: this.gerberDocRev,
                                    getDocument: (): PcbDocument | null => this.getPcbDocument(),
                                    onExport: () => { this.onExportGerber(); }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 128, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        docRev: this.gerberDocRev,
                                        getDocument: (): PcbDocument | null => this.getPcbDocument(),
                                        onExport: () => { this.onExportGerber(); }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    docRev: this.gerberDocRev
                                });
                            }
                        }, { name: "PcbGerberPreview" });
                    }
                    __Common__.pop();
                });
            }
            else if (this.activeTab === PcbRightTab.TEACHING) {
                this.ifElseBranchUpdateFunction(5, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        __Common__.create();
                        __Common__.layoutWeight(1);
                        __Common__.height('100%');
                    }, __Common__);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new PcbTeachingPanel(this, {
                                    statusMessage: this.__teachStatus,
                                    onRunDrc: () => { this.onRunDrc(); },
                                    onInserted: () => { this.onPcbTemplateInserted(); }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 136, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        statusMessage: this.teachStatus,
                                        onRunDrc: () => { this.onRunDrc(); },
                                        onInserted: () => { this.onPcbTemplateInserted(); }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {});
                            }
                        }, { name: "PcbTeachingPanel" });
                    }
                    __Common__.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(6, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        __Common__.create();
                        __Common__.layoutWeight(1);
                        __Common__.height('100%');
                    }, __Common__);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new PcbAiRoutePanel(this, {
                                    statusMessage: this.__statusMessage,
                                    aiBusy: this.__aiBusy,
                                    aiProgress: this.__aiProgress,
                                    aiStage: this.__aiStage,
                                    onRouteDone: () => { this.onAiRouteDone(); },
                                    onSetCopperCount: (n: number) => { this.onSetCopperCount(n); }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 144, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        statusMessage: this.statusMessage,
                                        aiBusy: this.aiBusy,
                                        aiProgress: this.aiProgress,
                                        aiStage: this.aiStage,
                                        onRouteDone: () => { this.onAiRouteDone(); },
                                        onSetCopperCount: (n: number) => { this.onSetCopperCount(n); }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {});
                            }
                        }, { name: "PcbAiRoutePanel" });
                    }
                    __Common__.pop();
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(44);
            Column.height('100%');
            Column.backgroundColor(ProteusColors.SIDEBAR_BG);
            Column.border({ width: { left: 1 }, color: ProteusColors.SIDEBAR_TAB_BORDER });
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusSidebarTab(this, {
                        label: '属性', tooltip: '属性面板', icon: ProteusIconName.SETTINGS,
                        selected: this.activeTab === PcbRightTab.PROPERTIES,
                        onSelect: () => { this.activeTab = PcbRightTab.PROPERTIES; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 157, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '属性',
                            tooltip: '属性面板',
                            icon: ProteusIconName.SETTINGS,
                            selected: this.activeTab === PcbRightTab.PROPERTIES,
                            onSelect: () => { this.activeTab = PcbRightTab.PROPERTIES; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '属性', tooltip: '属性面板', icon: ProteusIconName.SETTINGS,
                        selected: this.activeTab === PcbRightTab.PROPERTIES
                    });
                }
            }, { name: "ProteusSidebarTab" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusSidebarTab(this, {
                        label: 'DRC', tooltip: '设计规则检查', icon: ProteusIconName.ERC,
                        selected: this.activeTab === PcbRightTab.DRC,
                        onSelect: () => { this.activeTab = PcbRightTab.DRC; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 162, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'DRC',
                            tooltip: '设计规则检查',
                            icon: ProteusIconName.ERC,
                            selected: this.activeTab === PcbRightTab.DRC,
                            onSelect: () => { this.activeTab = PcbRightTab.DRC; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'DRC', tooltip: '设计规则检查', icon: ProteusIconName.ERC,
                        selected: this.activeTab === PcbRightTab.DRC
                    });
                }
            }, { name: "ProteusSidebarTab" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusSidebarTab(this, {
                        label: '封装', tooltip: '封装库', icon: ProteusIconName.COMPONENT,
                        selected: this.activeTab === PcbRightTab.LIBRARY,
                        onSelect: () => {
                            this.fpDefs = getGlobalPcbFootprintLibrary().listDefs();
                            this.activeTab = PcbRightTab.LIBRARY;
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 167, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '封装',
                            tooltip: '封装库',
                            icon: ProteusIconName.COMPONENT,
                            selected: this.activeTab === PcbRightTab.LIBRARY,
                            onSelect: () => {
                                this.fpDefs = getGlobalPcbFootprintLibrary().listDefs();
                                this.activeTab = PcbRightTab.LIBRARY;
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '封装', tooltip: '封装库', icon: ProteusIconName.COMPONENT,
                        selected: this.activeTab === PcbRightTab.LIBRARY
                    });
                }
            }, { name: "ProteusSidebarTab" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusSidebarTab(this, {
                        label: '层栈', tooltip: '铜层 / 过孔 / 层栈', icon: ProteusIconName.LAYER,
                        selected: this.activeTab === PcbRightTab.STACK,
                        onSelect: () => { this.activeTab = PcbRightTab.STACK; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 175, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '层栈',
                            tooltip: '铜层 / 过孔 / 层栈',
                            icon: ProteusIconName.LAYER,
                            selected: this.activeTab === PcbRightTab.STACK,
                            onSelect: () => { this.activeTab = PcbRightTab.STACK; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '层栈', tooltip: '铜层 / 过孔 / 层栈', icon: ProteusIconName.LAYER,
                        selected: this.activeTab === PcbRightTab.STACK
                    });
                }
            }, { name: "ProteusSidebarTab" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusSidebarTab(this, {
                        label: 'Gerber', tooltip: 'Gerber 预览与导出', icon: ProteusIconName.SEARCH,
                        selected: this.activeTab === PcbRightTab.GERBER,
                        onSelect: () => { this.activeTab = PcbRightTab.GERBER; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 180, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'Gerber',
                            tooltip: 'Gerber 预览与导出',
                            icon: ProteusIconName.SEARCH,
                            selected: this.activeTab === PcbRightTab.GERBER,
                            onSelect: () => { this.activeTab = PcbRightTab.GERBER; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'Gerber', tooltip: 'Gerber 预览与导出', icon: ProteusIconName.SEARCH,
                        selected: this.activeTab === PcbRightTab.GERBER
                    });
                }
            }, { name: "ProteusSidebarTab" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusSidebarTab(this, {
                        label: '教学', tooltip: 'PCB 教学模板', icon: ProteusIconName.LABEL,
                        selected: this.activeTab === PcbRightTab.TEACHING,
                        onSelect: () => { this.activeTab = PcbRightTab.TEACHING; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 185, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '教学',
                            tooltip: 'PCB 教学模板',
                            icon: ProteusIconName.LABEL,
                            selected: this.activeTab === PcbRightTab.TEACHING,
                            onSelect: () => { this.activeTab = PcbRightTab.TEACHING; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '教学', tooltip: 'PCB 教学模板', icon: ProteusIconName.LABEL,
                        selected: this.activeTab === PcbRightTab.TEACHING
                    });
                }
            }, { name: "ProteusSidebarTab" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusSidebarTab(this, {
                        label: 'AI', tooltip: 'AI 布线', icon: ProteusIconName.AI_ROUTE,
                        selected: this.activeTab === PcbRightTab.AI_ROUTE,
                        onSelect: () => { this.activeTab = PcbRightTab.AI_ROUTE; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 190, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'AI',
                            tooltip: 'AI 布线',
                            icon: ProteusIconName.AI_ROUTE,
                            selected: this.activeTab === PcbRightTab.AI_ROUTE,
                            onSelect: () => { this.activeTab = PcbRightTab.AI_ROUTE; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'AI', tooltip: 'AI 布线', icon: ProteusIconName.AI_ROUTE,
                        selected: this.activeTab === PcbRightTab.AI_ROUTE
                    });
                }
            }, { name: "ProteusSidebarTab" });
        }
        Column.pop();
        Row.pop();
        Column.pop();
    }
    buildPropertiesTab(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.layoutWeight(1);
            Column.alignItems(HorizontalAlign.Start);
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusPanelTitle(this, { title: 'Selection' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 213, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'Selection'
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: 'Selection'
                    });
                }
            }, { name: "ProteusPanelTitle" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.selectionInfo.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.selectionInfo);
                        Text.fontSize(ProteusFonts.PARAM_VALUE);
                        Text.fontColor(ProteusColors.TEXT_PRIMARY);
                        Text.padding({ left: 10, right: 10, top: 8, bottom: 8 });
                        Text.width('100%');
                    }, Text);
                    Text.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.padding(12);
                        Column.alignItems(HorizontalAlign.Start);
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('未选中对象');
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('点击封装、走线或过孔查看属性');
                        Text.fontSize(10);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                        Text.margin({ top: 4 });
                    }, Text);
                    Text.pop();
                    Column.pop();
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`活动层: ${this.activeLayer}`);
            Text.fontSize(10);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.padding({ left: 10, right: 10, bottom: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.selectedZoneId.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusPanelTitle(this, { title: '覆铜编辑' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 240, col: 9 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        title: '覆铜编辑'
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    title: '覆铜编辑'
                                });
                            }
                        }, { name: "ProteusPanelTitle" });
                    }
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        If.create();
                        if (this.selectedZoneCount > 1) {
                            this.ifElseBranchUpdateFunction(0, () => {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Text.create(`已选 ${this.selectedZoneCount} 个覆铜 — 操作作用于全部`);
                                    Text.fontSize(10);
                                    Text.fontColor(ProteusColors.TEXT_SECONDARY);
                                    Text.padding({ left: 10, right: 10, bottom: 4 });
                                }, Text);
                                Text.pop();
                            });
                        }
                        else {
                            this.ifElseBranchUpdateFunction(1, () => {
                            });
                        }
                    }, If);
                    If.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create({ space: 4 });
                        Row.padding({ left: 8, right: 8, bottom: 4 });
                    }, Row);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '优先级-',
                                    widthVal: 72,
                                    onAction: () => { this.onZonePriority(-1); }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 248, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '优先级-',
                                        widthVal: 72,
                                        onAction: () => { this.onZonePriority(-1); }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '优先级-',
                                    widthVal: 72
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '优先级+',
                                    widthVal: 72,
                                    onAction: () => { this.onZonePriority(1); }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 253, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '优先级+',
                                        widthVal: 72,
                                        onAction: () => { this.onZonePriority(1); }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '优先级+',
                                    widthVal: 72
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    Row.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create({ space: 4 });
                        Row.padding({ left: 8, right: 8, bottom: 8 });
                    }, Row);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '热焊盘',
                                    widthVal: 72,
                                    onAction: () => { this.onZoneThermal(); }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 261, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '热焊盘',
                                        widthVal: 72,
                                        onAction: () => { this.onZoneThermal(); }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '热焊盘',
                                    widthVal: 72
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '刷新挖空',
                                    widthVal: 72,
                                    onAction: () => { this.onZoneRefreshCutouts(); }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 266, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '刷新挖空',
                                        widthVal: 72,
                                        onAction: () => { this.onZoneRefreshCutouts(); }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '刷新挖空',
                                    widthVal: 72
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    Row.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        Column.pop();
    }
    buildDrcTab(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.layoutWeight(1);
            Column.alignItems(HorizontalAlign.Start);
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusPanelTitle(this, { title: 'Design Rules Check' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 282, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'Design Rules Check'
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: 'Design Rules Check'
                    });
                }
            }, { name: "ProteusPanelTitle" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.drcViolations.length === 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create();
                        Row.padding(12);
                    }, Row);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('✓');
                        Text.fontSize(16);
                        Text.fontColor(ProteusColors.ERC_OK);
                        Text.margin({ right: 6 });
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('无 DRC 违规');
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.ERC_OK);
                    }, Text);
                    Text.pop();
                    Row.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        List.create();
                        List.layoutWeight(1);
                        List.scrollBar(BarState.Auto);
                    }, List);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        ForEach.create();
                        const forEachItemGenFunction = _item => {
                            const v = _item;
                            {
                                const itemCreation = (elmtId, isInitialRender) => {
                                    ViewStackProcessor.StartGetAccessRecordingFor(elmtId);
                                    ListItem.create(deepRenderFunction, true);
                                    if (!isInitialRender) {
                                        ListItem.pop();
                                    }
                                    ViewStackProcessor.StopGetAccessRecording();
                                };
                                const itemCreation2 = (elmtId, isInitialRender) => {
                                    ListItem.create(deepRenderFunction, true);
                                };
                                const deepRenderFunction = (elmtId, isInitialRender) => {
                                    itemCreation(elmtId, isInitialRender);
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        Row.create();
                                        Row.padding({ left: 8, right: 8, top: 4, bottom: 4 });
                                        Row.width('100%');
                                    }, Row);
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        Text.create(v.severity === PcbDrcSeverity.ERROR ? '✕' : '!');
                                        Text.fontSize(12);
                                        Text.fontColor(v.severity === PcbDrcSeverity.ERROR
                                            ? ProteusColors.ERC_ERR : ProteusColors.ERC_WARN);
                                        Text.width(16);
                                    }, Text);
                                    Text.pop();
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        Text.create(v.message);
                                        Text.fontSize(ProteusFonts.STATUS);
                                        Text.fontColor(v.severity === PcbDrcSeverity.ERROR
                                            ? ProteusColors.ERC_ERR : ProteusColors.TEXT_LABEL);
                                        Text.layoutWeight(1);
                                    }, Text);
                                    Text.pop();
                                    Row.pop();
                                    ListItem.pop();
                                };
                                this.observeComponentCreation2(itemCreation2, ListItem);
                                ListItem.pop();
                            }
                        };
                        this.forEachUpdateFunction(elmtId, this.drcViolations, forEachItemGenFunction, (v: PcbDrcViolation) => v.id, false, false);
                    }, ForEach);
                    ForEach.pop();
                    List.pop();
                });
            }
        }, If);
        If.pop();
        Column.pop();
    }
    buildLibraryTab(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.layoutWeight(1);
            Column.alignItems(HorizontalAlign.Start);
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusPanelTitle(this, { title: 'Footprint Library' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 326, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'Footprint Library'
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: 'Footprint Library'
                    });
                }
            }, { name: "ProteusPanelTitle" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.selectedFpDefId.length > 0
                ? `已选: ${this.selectedFpDefId}`
                : '点击条目后使用放置工具 (P)');
            Text.fontSize(10);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.padding({ left: 10, right: 10, bottom: 6 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            List.create();
            List.layoutWeight(1);
            List.scrollBar(BarState.Auto);
        }, List);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            ForEach.create();
            const forEachItemGenFunction = _item => {
                const def = _item;
                {
                    const itemCreation = (elmtId, isInitialRender) => {
                        ViewStackProcessor.StartGetAccessRecordingFor(elmtId);
                        ListItem.create(deepRenderFunction, true);
                        if (!isInitialRender) {
                            ListItem.pop();
                        }
                        ViewStackProcessor.StopGetAccessRecording();
                    };
                    const itemCreation2 = (elmtId, isInitialRender) => {
                        ListItem.create(deepRenderFunction, true);
                    };
                    const deepRenderFunction = (elmtId, isInitialRender) => {
                        itemCreation(elmtId, isInitialRender);
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            Row.create();
                            Row.width('100%');
                            Row.padding({ left: 10, right: 10, top: 6, bottom: 6 });
                            Row.backgroundColor(def.id === this.selectedFpDefId
                                ? ProteusColors.TOOL_ACTIVE : Color.Transparent);
                            Row.onClick(() => { this.onPickFootprint(def.id); });
                        }, Row);
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            Text.create(def.name);
                            Text.fontSize(ProteusFonts.STATUS);
                            Text.fontColor(def.id === this.selectedFpDefId
                                ? ProteusColors.SELECTED : ProteusColors.TEXT_PRIMARY);
                            Text.fontWeight(def.id === this.selectedFpDefId ? FontWeight.Bold : FontWeight.Normal);
                            Text.layoutWeight(1);
                        }, Text);
                        Text.pop();
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            Text.create(`${def.pads.length} pads`);
                            Text.fontSize(10);
                            Text.fontColor(ProteusColors.TEXT_SECONDARY);
                        }, Text);
                        Text.pop();
                        Row.pop();
                        ListItem.pop();
                    };
                    this.observeComponentCreation2(itemCreation2, ListItem);
                    ListItem.pop();
                }
            };
            this.forEachUpdateFunction(elmtId, this.fpDefs, forEachItemGenFunction, (def: PcbFootprintDef) => def.id, false, false);
        }, ForEach);
        ForEach.pop();
        List.pop();
        Column.pop();
    }
    buildStackTab(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Scroll.create();
            Scroll.layoutWeight(1);
            Scroll.scrollBar(BarState.Auto);
        }, Scroll);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.alignItems(HorizontalAlign.Start);
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusPanelTitle(this, { title: '铜层层数' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 366, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: '铜层层数'
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: '铜层层数'
                    });
                }
            }, { name: "ProteusPanelTitle" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 4 });
            Row.padding({ left: 8, right: 8, bottom: 8 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '2L',
                        widthVal: 48,
                        onAction: () => { this.onSetCopperCount(2); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 368, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '2L',
                            widthVal: 48,
                            onAction: () => { this.onSetCopperCount(2); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '2L',
                        widthVal: 48
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '4L',
                        widthVal: 48,
                        onAction: () => { this.onSetCopperCount(4); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 373, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '4L',
                            widthVal: 48,
                            onAction: () => { this.onSetCopperCount(4); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '4L',
                        widthVal: 48
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '6L',
                        widthVal: 48,
                        onAction: () => { this.onSetCopperCount(6); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 378, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '6L',
                            widthVal: 48,
                            onAction: () => { this.onSetCopperCount(6); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '6L',
                        widthVal: 48
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '8L',
                        widthVal: 48,
                        onAction: () => { this.onSetCopperCount(8); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 383, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '8L',
                            widthVal: 48,
                            onAction: () => { this.onSetCopperCount(8); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '8L',
                        widthVal: 48
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`当前: ${this.copperCount} 层铜`);
            Text.fontSize(10);
            Text.fontColor(ProteusColors.SELECTED);
            Text.padding({ left: 10, bottom: 6 });
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusPanelTitle(this, { title: '显示过滤' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 395, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: '显示过滤'
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: '显示过滤'
                    });
                }
            }, { name: "ProteusPanelTitle" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 4 });
            Row.padding({ left: 8, right: 8, bottom: 8 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '叠加',
                        widthVal: 56,
                        onAction: () => { this.onSetAppearanceOverlay(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 397, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '叠加',
                            widthVal: 56,
                            onAction: () => { this.onSetAppearanceOverlay(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '叠加',
                        widthVal: 56
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '变暗',
                        widthVal: 56,
                        onAction: () => { this.onSetAppearanceDim(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 402, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '变暗',
                            widthVal: 56,
                            onAction: () => { this.onSetAppearanceDim(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '变暗',
                        widthVal: 56
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '仅活动',
                        widthVal: 56,
                        onAction: () => { this.onSetAppearanceActiveOnly(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 407, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '仅活动',
                            widthVal: 56,
                            onAction: () => { this.onSetAppearanceActiveOnly(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '仅活动',
                        widthVal: 56
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusPanelTitle(this, { title: '布线拐角' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 415, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: '布线拐角'
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: '布线拐角'
                    });
                }
            }, { name: "ProteusPanelTitle" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 4 });
            Row.padding({ left: 8, right: 8, bottom: 4 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '90°',
                        widthVal: 56,
                        onAction: () => { this.onSetRouteCorner(PcbRouteCornerMode.ORTHO90); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 417, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '90°',
                            widthVal: 56,
                            onAction: () => { this.onSetRouteCorner(PcbRouteCornerMode.ORTHO90); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '90°',
                        widthVal: 56
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '45°',
                        widthVal: 56,
                        onAction: () => { this.onSetRouteCorner(PcbRouteCornerMode.ORTHO45); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 422, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '45°',
                            widthVal: 56,
                            onAction: () => { this.onSetRouteCorner(PcbRouteCornerMode.ORTHO45); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '45°',
                        widthVal: 56
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '圆弧',
                        widthVal: 56,
                        onAction: () => { this.onSetRouteCorner(PcbRouteCornerMode.ARC); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 427, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '圆弧',
                            widthVal: 56,
                            onAction: () => { this.onSetRouteCorner(PcbRouteCornerMode.ARC); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '圆弧',
                        widthVal: 56
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`当前: ${this.routeCornerMode === PcbRouteCornerMode.ORTHO90 ? '直角90°' :
                (this.routeCornerMode === PcbRouteCornerMode.ARC ? '圆弧' : '45°斜角')}`);
            Text.fontSize(10);
            Text.fontColor(ProteusColors.SELECTED);
            Text.padding({ left: 10, bottom: 8 });
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusPanelTitle(this, { title: '过孔类型 / 跨度' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 440, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: '过孔类型 / 跨度'
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: '过孔类型 / 跨度'
                    });
                }
            }, { name: "ProteusPanelTitle" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 4 });
            Row.padding({ left: 8, right: 8, bottom: 4 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '通孔',
                        widthVal: 56,
                        onAction: () => { this.onSetViaKind(PcbViaKind.THROUGH); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 442, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '通孔',
                            widthVal: 56,
                            onAction: () => { this.onSetViaKind(PcbViaKind.THROUGH); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '通孔',
                        widthVal: 56
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '盲孔',
                        widthVal: 56,
                        onAction: () => { this.onSetViaKind(PcbViaKind.BLIND); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 447, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '盲孔',
                            widthVal: 56,
                            onAction: () => { this.onSetViaKind(PcbViaKind.BLIND); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '盲孔',
                        widthVal: 56
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '埋孔',
                        widthVal: 56,
                        onAction: () => { this.onSetViaKind(PcbViaKind.BURIED); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 452, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '埋孔',
                            widthVal: 56,
                            onAction: () => { this.onSetViaKind(PcbViaKind.BURIED); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '埋孔',
                        widthVal: 56
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`类型: ${this.viaKind}`);
            Text.fontSize(10);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.padding({ left: 10, bottom: 4 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`跨度: ${this.viaFrom} → ${this.viaTo}`);
            Text.fontSize(10);
            Text.fontColor(ProteusColors.SELECTED);
            Text.padding({ left: 10, bottom: 6 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('起点层');
            Text.fontSize(10);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.padding({ left: 10, bottom: 2 });
        }, Text);
        Text.pop();
        this.viaLayerPickRow.bind(this)(true);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('终点层');
            Text.fontSize(10);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.padding({ left: 10, top: 4, bottom: 2 });
        }, Text);
        Text.pop();
        this.viaLayerPickRow.bind(this)(false);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusPanelTitle(this, { title: '物理层栈' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 479, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: '物理层栈'
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: '物理层栈'
                    });
                }
            }, { name: "ProteusPanelTitle" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`当前 ${this.copperCount} 层铜。点铜线→高亮所在 Cu；点过孔→高亮跨越层；点内电层行→选中该层铺铜（内电层常无走线）`);
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.padding({ left: 10, right: 10, bottom: 4 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            ForEach.create();
            const forEachItemGenFunction = _item => {
                const sl = _item;
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    Column.create();
                    Column.width('100%');
                    Column.padding({ left: 10, right: 10, top: 3, bottom: 3 });
                    Column.backgroundColor(this.isStackRowActive(sl) ? ProteusColors.TREE_SELECTED : Color.Transparent);
                    Column.border({
                        width: this.isStackRowActive(sl) ? 1 : 0,
                        color: ProteusColors.SELECTED
                    });
                    Column.onClick(() => {
                        if (sl.type === PcbStackLayerType.COPPER) {
                            const id = sl.copperLayerId !== undefined ? sl.copperLayerId : (sl.name as PcbLayerId);
                            this.onSelectStackCopper(id);
                        }
                    });
                }, Column);
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    Row.create();
                    Row.width('100%');
                }, Row);
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    Column.create();
                    Column.width(4);
                    Column.height(18);
                    Column.backgroundColor(this.stackColor(sl));
                    Column.margin({ right: 6 });
                }, Column);
                Column.pop();
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    Text.create(sl.name);
                    Text.fontSize(ProteusFonts.STATUS);
                    Text.fontColor(this.isStackRowActive(sl) ? ProteusColors.SELECTED : ProteusColors.TEXT_PRIMARY);
                    Text.fontWeight(this.isStackRowActive(sl) ? FontWeight.Bold : FontWeight.Normal);
                    Text.layoutWeight(1);
                }, Text);
                Text.pop();
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    Text.create(`${sl.thicknessMm.toFixed(3)} mm`);
                    Text.fontSize(10);
                    Text.fontColor(ProteusColors.TEXT_SECONDARY);
                }, Text);
                Text.pop();
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    Text.create(sl.type === PcbStackLayerType.COPPER ? 'Cu' :
                        (sl.type === PcbStackLayerType.DIELECTRIC ? 'Diel' : 'Mask'));
                    Text.fontSize(9);
                    Text.fontColor(ProteusColors.TEXT_SECONDARY);
                    Text.width(32);
                    Text.textAlign(TextAlign.End);
                }, Text);
                Text.pop();
                Row.pop();
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    Text.create(this.stackDesc(sl));
                    Text.fontSize(9);
                    Text.fontColor(this.isStackRowActive(sl)
                        ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_SECONDARY);
                    Text.width('100%');
                    Text.padding({ left: 10, top: 1, bottom: 2 });
                }, Text);
                Text.pop();
                Column.pop();
            };
            this.forEachUpdateFunction(elmtId, this.stackLayers, forEachItemGenFunction, (sl: PcbStackLayer) => sl.id, false, false);
        }, ForEach);
        ForEach.pop();
        Column.pop();
        Scroll.pop();
    }
    viaLayerPickRow(isFrom: boolean, parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Flex.create({ wrap: FlexWrap.Wrap });
            Flex.padding({ left: 8, right: 8 });
        }, Flex);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            ForEach.create();
            const forEachItemGenFunction = _item => {
                const id = _item;
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    Button.createWithChild({ type: ButtonType.Normal });
                    Button.height(22);
                    Button.padding({ left: 4, right: 4 });
                    Button.margin({ right: 4, bottom: 4 });
                    Button.backgroundColor((isFrom ? this.viaFrom : this.viaTo) === id
                        ? ProteusColors.TOOL_ACTIVE : ProteusColors.BTN_BG);
                    Button.border({ width: 1, color: ProteusColors.BORDER });
                    Button.borderRadius(0);
                    Button.stateEffect(false);
                    Button.onClick(() => {
                        if (isFrom) {
                            this.onSetViaSpan(id, this.viaTo);
                        }
                        else {
                            this.onSetViaSpan(this.viaFrom, id);
                        }
                    });
                }, Button);
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    Text.create(id);
                    Text.fontSize(9);
                    Text.fontColor((isFrom ? this.viaFrom : this.viaTo) === id
                        ? ProteusColors.SELECTED : ProteusColors.TEXT_PRIMARY);
                }, Text);
                Text.pop();
                Button.pop();
            };
            this.forEachUpdateFunction(elmtId, this.copperLayerIds, forEachItemGenFunction, (id: PcbLayerId) => `${isFrom ? 'f' : 't'}_${id}`, false, false);
        }, ForEach);
        ForEach.pop();
        Flex.pop();
    }
    private stackColor(sl: PcbStackLayer): string {
        if (sl.type === PcbStackLayerType.COPPER) {
            return '#C83434';
        }
        if (sl.type === PcbStackLayerType.DIELECTRIC) {
            return '#C8A878';
        }
        return '#2E8B57';
    }
    /** 仅铜层行可随点选高亮；过孔可同时高亮多个跨越层 */
    private isStackRowActive(sl: PcbStackLayer): boolean {
        if (sl.type !== PcbStackLayerType.COPPER) {
            return false;
        }
        const id = sl.copperLayerId !== undefined ? sl.copperLayerId : (sl.name as PcbLayerId);
        if (this.stackHighlightCopperIds.length > 0) {
            return this.stackHighlightCopperIds.indexOf(id) >= 0;
        }
        return id === this.activeLayer;
    }
    private stackDesc(sl: PcbStackLayer): string {
        if (sl.name === 'F.Mask') {
            return '顶面阻焊（绿油等），挡住不该焊的铜';
        }
        if (sl.name === 'F.Cu' || sl.copperLayerId === PcbLayerId.F_CU) {
            return '顶面铜箔（约 1 oz），走线/焊盘在这';
        }
        if (sl.name === 'Core') {
            return '介质芯板（FR4），绝缘、定板厚';
        }
        if (sl.name === 'B.Cu' || sl.copperLayerId === PcbLayerId.B_CU) {
            return '底面铜箔';
        }
        if (sl.name === 'B.Mask') {
            return '底面阻焊';
        }
        if (sl.copperLayerId === PcbLayerId.IN1_CU || sl.name === 'In1.Cu') {
            return '内电层1：整面铺铜/参考平面（本实验多为 GND，通常无走线）';
        }
        if (sl.copperLayerId === PcbLayerId.IN2_CU || sl.name === 'In2.Cu') {
            return '内电层2：整面铺铜/参考平面（本实验多为 VCC，通常无走线）';
        }
        if (sl.type === PcbStackLayerType.DIELECTRIC) {
            return '介质层（半固化片/芯板），层间绝缘';
        }
        if (sl.type === PcbStackLayerType.COPPER) {
            return '内层铜箔，走线/参考平面';
        }
        return '阻焊层';
    }
    rerender() {
        this.updateDirtyElements();
    }
}
